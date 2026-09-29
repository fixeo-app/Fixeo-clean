-- One-off, explicitly authorized data hygiene; render with a private reviewed manifest.
-- No schema, role, policy, trigger, business rule or secret changes.
-- Full before images remain ONLY in the existing private canonical audit.
-- Requires the separately verified Git/deployment baseline and manual backup evidence.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL timezone='UTC';
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
SET LOCAL idle_in_transaction_session_timeout='20s';
DO $hygiene$
DECLARE
 manifest CONSTANT jsonb := $manifest$@@MANIFEST@@$manifest$::jsonb;
 batch uuid := (manifest->>'batch_id')::uuid;
 entry jsonb; original jsonb; actual jsonb; checkpoint jsonb;
 rel record; n bigint; changed bigint; total_deleted integer:=0;
 before_protected jsonb:='{}'::jsonb; after_protected jsonb:='{}'::jsonb;
 fingerprint text; target_pattern text; bad boolean; event_count integer;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'PRIVILEGED_MAINTENANCE_ONLY'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(batch::text,0)) THEN RAISE EXCEPTION 'BATCH_BUSY'; END IF;
 PERFORM set_config('fixeo.correlation_id',batch::text,true);
 PERFORM set_config('fixeo.idempotency_key',batch::text,true);
 -- The database maintenance actor is recorded as server, without impersonating a person.
 PERFORM set_config('request.jwt.claims','{}',true);
 LOCK TABLE public.service_requests,public.missions,public.dispatch_execution_queue,
  public.dispatch_notification_outbox,public.estimator_context_redemptions IN SHARE ROW EXCLUSIVE MODE;
 SELECT string_agg(value->>'id','|') INTO target_pattern FROM jsonb_array_elements(manifest->'rows')
 WHERE value->>'method'='archive_then_delete';

 IF (SELECT count(*) FROM fixeo_private.authority_audit_events_v1 WHERE correlation_id=batch AND action='cleanup_complete')<>1
 OR EXISTS(SELECT 1 FROM fixeo_private.authority_audit_events_v1 WHERE correlation_id=batch AND action='rollback_complete') THEN
  RAISE EXCEPTION 'BATCH_NOT_RESTORABLE'; END IF;
 IF (SELECT count(*) FROM fixeo_private.authority_audit_events_v1 WHERE correlation_id=batch AND action='archive_checkpoint')<>@@ROW_COUNT@@ THEN
  RAISE EXCEPTION 'CHECKPOINT_COUNT'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') LOOP
  SELECT change->'before' INTO original FROM fixeo_private.authority_audit_events_v1
   WHERE correlation_id=batch AND action='archive_checkpoint' AND change->>'table'=entry->>'table' AND change->>'id'=entry->>'id';
  IF original IS NULL OR encode(sha256(convert_to(original::text,'UTF8')),'hex')<>entry->>'sha256' THEN
   RAISE EXCEPTION 'CHECKPOINT_HASH_MISMATCH'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id::text=$1 FOR UPDATE',entry->>'table') INTO actual USING entry->>'id';
  IF entry->>'method'='archive_then_delete' THEN
   IF actual IS NOT NULL THEN RAISE EXCEPTION 'RESTORE_TARGET_OCCUPIED'; END IF;
  ELSE
   IF actual IS DISTINCT FROM(original||jsonb_build_object('service_request_id',NULL)) THEN RAISE EXCEPTION 'REDEMPTION_CHANGED_SINCE_CLEANUP'; END IF;
  END IF;
 END LOOP;

 -- Include JSON/text references and non-FK links, not just declared foreign keys.
 FOR rel IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','fixeo_private') AND c.relkind IN('r','p')
 AND NOT (n.nspname='fixeo_private' AND c.relname='authority_audit_events_v1') LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM (SELECT to_jsonb(t) j FROM %I.%I t) s
   WHERE j::text ~ $1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) e
   WHERE e->>''table''=$3 AND e->>''id''=j->>''id''))',rel.nspname,rel.relname)
   INTO bad USING target_pattern,manifest->'rows',rel.nspname||'.'||rel.relname;
  IF bad THEN RAISE EXCEPTION 'UNEXPECTED_DEPENDENCY_IN_%',rel.nspname||'.'||rel.relname; END IF;
 END LOOP;

 -- Verify every non-target row in all canonical public/private tables remains byte-identical.
 FOR rel IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','fixeo_private') AND c.relkind IN('r','p')
 AND NOT (n.nspname='fixeo_private' AND c.relname='authority_audit_events_v1')
 ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(md5(j::text),'''' ORDER BY md5(j::text)),'''')) FROM
   (SELECT to_jsonb(t) j FROM %I.%I t) s WHERE NOT EXISTS
   (SELECT 1 FROM jsonb_array_elements($1) e WHERE e->>''table''=$2 AND e->>''id''=j->>''id'')',rel.nspname,rel.relname)
   INTO fingerprint USING manifest->'rows',rel.nspname||'.'||rel.relname;
  before_protected := before_protected || jsonb_build_object(rel.nspname||'.'||rel.relname,fingerprint);
 END LOOP;

 -- Legitimate privileged server maintenance context satisfies the existing classification guard.
 -- No human Admin is impersonated, and no role/ACL/RLS/trigger is changed or disabled.
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') WHERE value->>'method'='archive_then_delete'
 ORDER BY CASE value->>'table' WHEN 'public.service_requests' THEN 1 WHEN 'public.missions' THEN 2
  WHEN 'public.dispatch_execution_queue' THEN 3 ELSE 4 END LOOP
  SELECT change->'before' INTO original FROM fixeo_private.authority_audit_events_v1
   WHERE correlation_id=batch AND action='archive_checkpoint' AND change->>'table'=entry->>'table' AND change->>'id'=entry->>'id';
  IF entry->>'table'='public.service_requests' AND original->>'status'='new' OR
   entry->>'table'='public.missions' AND original->>'status'='offered' THEN RAISE EXCEPTION 'RESTORE_COULD_DISPATCH'; END IF;
  EXECUTE format('INSERT INTO %s SELECT * FROM jsonb_populate_record(NULL::%s,$1)',entry->>'table',entry->>'table') USING original;
 END LOOP;
 UPDATE public.estimator_context_redemptions SET service_request_id='@@REDEMPTION_REQUEST_ID@@'::uuid WHERE id=@@REDEMPTION_ID@@ AND service_request_id IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'REDEMPTION_RESTORE_COUNT'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id::text=$1',entry->>'table') INTO actual USING entry->>'id';
  IF actual IS NULL OR encode(sha256(convert_to(actual::text,'UTF8')),'hex')<>entry->>'sha256' THEN RAISE EXCEPTION 'RESTORE_ROW_MISMATCH'; END IF;
 END LOOP;

 -- Verify every non-target row in all canonical public/private tables remains byte-identical.
 FOR rel IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('public','fixeo_private') AND c.relkind IN('r','p')
 AND NOT (n.nspname='fixeo_private' AND c.relname='authority_audit_events_v1')
 ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(md5(j::text),'''' ORDER BY md5(j::text)),'''')) FROM
   (SELECT to_jsonb(t) j FROM %I.%I t) s WHERE NOT EXISTS
   (SELECT 1 FROM jsonb_array_elements($1) e WHERE e->>''table''=$2 AND e->>''id''=j->>''id'')',rel.nspname,rel.relname)
   INTO fingerprint USING manifest->'rows',rel.nspname||'.'||rel.relname;
  after_protected := after_protected || jsonb_build_object(rel.nspname||'.'||rel.relname,fingerprint);
 END LOOP;

 PERFORM fixeo_private.authority_audit_v1('maintenance_batch',batch,'production_data_hygiene','rollback_complete','verified',jsonb_build_object('restored',@@DELETE_COUNT@@,'relinked',1));
 PERFORM set_config('fixeo.hygiene_result',jsonb_build_object('batch_id',batch,'restored',@@DELETE_COUNT@@,'relinked',1,'status','PASS')::text,true);

 IF before_protected IS DISTINCT FROM after_protected THEN RAISE EXCEPTION 'NON_TARGET_DATA_CHANGED'; END IF;
END $hygiene$;
SELECT current_setting('fixeo.hygiene_result')::jsonb AS result;
COMMIT;
