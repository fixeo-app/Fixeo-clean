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

 IF EXISTS(SELECT 1 FROM fixeo_private.authority_audit_events_v1 WHERE correlation_id=batch) THEN
  RAISE EXCEPTION 'BATCH_ALREADY_RECORDED'; END IF;
 IF jsonb_array_length(manifest->'rows')<>@@ROW_COUNT@@ THEN RAISE EXCEPTION 'MANIFEST_COUNT'; END IF;
 -- Exact row hashes are a closed allow-list: drift fails the entire transaction.
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id::text=$1 FOR UPDATE',entry->>'table') INTO actual USING entry->>'id';
  IF actual IS NULL OR encode(sha256(convert_to(actual::text,'UTF8')),'hex')<>entry->>'sha256' THEN
   RAISE EXCEPTION 'ROW_HASH_MISMATCH_%_%',entry->>'table',entry->>'id'; END IF;
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

 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id::text=$1',entry->>'table') INTO original USING entry->>'id';
  checkpoint:=entry||jsonb_build_object('before',original,'baseline',manifest->>'baseline','batch_id',batch);
  IF octet_length(checkpoint::text)>4096 THEN RAISE EXCEPTION 'CHECKPOINT_TOO_LARGE'; END IF;
  PERFORM fixeo_private.authority_audit_v1(entry->>'table',
   CASE WHEN entry->>'table'='public.estimator_context_redemptions' THEN (original->>'service_request_id')::uuid ELSE (entry->>'id')::uuid END,
   'production_data_hygiene','archive_checkpoint','preserved',checkpoint);
 END LOOP;
 SELECT count(*) INTO event_count FROM fixeo_private.authority_audit_events_v1
 WHERE correlation_id=batch AND action='archive_checkpoint';
 IF event_count<>@@ROW_COUNT@@ THEN RAISE EXCEPTION 'CHECKPOINT_COUNT'; END IF;
 -- Delete leaf fixtures explicitly. No silent cascades are accepted.
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows')
 WHERE value->>'table' IN('public.dispatch_notification_outbox','public.dispatch_execution_queue','public.missions')
 ORDER BY CASE value->>'table' WHEN 'public.dispatch_notification_outbox' THEN 1 WHEN 'public.dispatch_execution_queue' THEN 2 ELSE 3 END LOOP
  EXECUTE format('DELETE FROM %s WHERE id::text=$1',entry->>'table') USING entry->>'id';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'DELETE_COUNT'; END IF;
  total_deleted:=total_deleted+changed;
 END LOOP;
 -- Preserve the consumed estimator ledger; canonical RPCs fail closed for committed + NULL request.
 UPDATE public.estimator_context_redemptions SET service_request_id=NULL
 WHERE id=@@REDEMPTION_ID@@ AND state='committed' AND service_request_id='@@REDEMPTION_REQUEST_ID@@'::uuid;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'REDEMPTION_COUNT'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') WHERE value->>'table'='public.service_requests' LOOP
  DELETE FROM public.service_requests WHERE id::text=entry->>'id';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'DELETE_COUNT'; END IF;
  total_deleted:=total_deleted+changed;
 END LOOP;
 IF total_deleted<>@@DELETE_COUNT@@ THEN RAISE EXCEPTION 'TOTAL_DELETE_COUNT'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'rows') LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id::text=$1',entry->>'table') INTO actual USING entry->>'id';
  IF entry->>'method'='archive_then_delete' THEN
   IF actual IS NOT NULL THEN RAISE EXCEPTION 'TARGET_STILL_PRESENT'; END IF;
  ELSE
   SELECT change->'before' INTO original FROM fixeo_private.authority_audit_events_v1
    WHERE correlation_id=batch AND action='archive_checkpoint' AND change->>'table'=entry->>'table' AND change->>'id'=entry->>'id';
   IF actual IS DISTINCT FROM (original||jsonb_build_object('service_request_id',NULL)) THEN RAISE EXCEPTION 'REDEMPTION_NOT_PRESERVED'; END IF;
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
  after_protected := after_protected || jsonb_build_object(rel.nspname||'.'||rel.relname,fingerprint);
 END LOOP;

 PERFORM fixeo_private.authority_audit_v1('maintenance_batch',batch,'production_data_hygiene','cleanup_complete','verified',
  jsonb_build_object('deleted',@@DELETE_COUNT@@,'retained_unlinked',1,'checkpoints',@@ROW_COUNT@@,'protected_tables',(SELECT count(*) FROM jsonb_object_keys(before_protected)),
   'baseline',manifest->>'baseline','backup',manifest->'backup'));
 PERFORM set_config('fixeo.hygiene_result',jsonb_build_object('batch_id',batch,'deleted',@@DELETE_COUNT@@,
  'retained_unlinked',1,'checkpoints',@@ROW_COUNT@@,'protected_tables',(SELECT count(*) FROM jsonb_object_keys(before_protected)),'status','PASS')::text,true);

 IF before_protected IS DISTINCT FROM after_protected THEN RAISE EXCEPTION 'NON_TARGET_DATA_CHANGED'; END IF;
END $hygiene$;
SELECT current_setting('fixeo.hygiene_result')::jsonb AS result;
COMMIT;
