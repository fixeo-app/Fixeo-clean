-- P0: only mission.settle parent existence and NULL-safe eligibility.
-- Existing authority/preview signatures, ownership, ACLs and pricing logic remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE f record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRED'; END IF;
 FOR f IN SELECT * FROM (VALUES
  ('public.admin_settle_mission_v1(uuid,numeric,numeric,text)','550c1459757d3f9f11889af5328ffadb','{postgres=X/postgres}'),
  ('public.control_action_preview_v1(text,uuid,jsonb,uuid)','4afe8cdf08bab799c4104854d6c225ae','{postgres=X/postgres,authenticated=X/postgres}')
 ) expected(signature,hash,acl) LOOP
  IF NOT EXISTS (
   SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature)
    AND md5(pg_get_functiondef(p.oid))=f.hash
    AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef
    AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text=f.acl
  ) THEN RAISE EXCEPTION 'SETTLEMENT_BASELINE_MISMATCH: %',f.signature; END IF;
 END LOOP;
END $guard$;

CREATE OR REPLACE FUNCTION public.admin_settle_mission_v1(p_mission_id uuid, p_final_price numeric, p_expected_final_price numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m public.missions; r public.service_requests;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_final_price IS NULL OR p_final_price<=0 OR p_final_price>500000 OR round(p_final_price,2)<>p_final_price OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INVALID_SETTLEMENT'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Keep the canonical parent alive until the settlement transaction ends.
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 IF ((m.status='done' AND r.status IN('completed','validated')) OR (m.status='validated' AND r.status='validated')) IS NOT TRUE THEN RAISE EXCEPTION 'INELIGIBLE_MISSION'; END IF;
 IF m.final_price IS NOT DISTINCT FROM p_final_price THEN RETURN jsonb_build_object('id',m.id,'final_price',m.final_price,'commission_amount',m.commission_amount,'idempotent',true); END IF;
 IF m.final_price IS DISTINCT FROM p_expected_final_price THEN RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.commission_remittances_v1 WHERE mission_id=m.id AND status='confirmed') THEN RAISE EXCEPTION 'CONFIRMED_REMITTANCE_REQUIRES_RECONCILIATION'; END IF;
 -- VAP/Diagnostic proposal guards and price triggers remain the sole price authority.
 UPDATE public.missions SET final_price=p_final_price WHERE id=m.id RETURNING * INTO m;
 RETURN jsonb_build_object('id',m.id,'final_price',m.final_price,'commission_amount',m.commission_amount,'pricing_offer_id',m.pricing_offer_id);
END $function$;

CREATE OR REPLACE FUNCTION public.control_action_preview_v1(p_capability text, p_target_id uuid, p_payload jsonb, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); typ text; j jsonb; id uuid; allowed text[]; remittance jsonb;
BEGIN
 typ:=fixeo_private.control_action_type_v1(p_capability);
 IF typ IS NULL OR p_target_id IS NULL OR p_correlation_id IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>4096 THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 allowed:=CASE p_capability WHEN 'request.dispatch' THEN ARRAY['artisan_id','reason'] WHEN 'mission.settle' THEN ARRAY['final_price','expected_final_price','reason'] WHEN 'quote.approve' THEN ARRAY['version','reason','expires_at'] WHEN 'quote.reject' THEN ARRAY['version','reason'] WHEN 'finance.declare' THEN ARRAY['amount','method','proof_reference','reason'] WHEN 'finance.confirm' THEN ARRAY['remittance_id','version','reason'] WHEN 'finance.cancel' THEN ARRAY['remittance_id','version','reason'] WHEN 'finance.correct' THEN ARRAY['remittance_id','version','amount','method','proof_reference','reason'] WHEN 'request.classify' THEN ARRAY['classification','reason'] WHEN 'artisan.classify' THEN ARRAY['classification','reason'] WHEN 'enterprise.classify' THEN ARRAY['classification','reason'] ELSE ARRAY['reason'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT(k=ANY(allowed))) OR length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INVALID_ACTION_PAYLOAD'; END IF;
 j:=fixeo_private.control_row_v1(typ,p_target_id); IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_capability='request.dispatch' AND j->>'enterprise_id' IS NOT NULL THEN RAISE EXCEPTION 'ENTERPRISE_DELEGATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_capability IN('quote.approve','quote.reject') AND (j->>'status'<>'pending' OR j->>'review_status' NOT IN('submitted','legacy_unreviewed') OR (j->>'quote_version')::integer IS DISTINCT FROM (p_payload->>'version')::integer) THEN RAISE EXCEPTION 'QUOTE_NOT_REVIEWABLE'; END IF;
 IF p_capability='mission.settle' THEN
  PERFORM 1 FROM public.service_requests sr WHERE sr.id::text=j->>'request_id' FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF ((j->>'status'='done' AND j->>'request_status' IN('completed','validated')) OR (j->>'status'='validated' AND j->>'request_status'='validated')) IS NOT TRUE THEN RAISE EXCEPTION 'INELIGIBLE_MISSION'; END IF;
 END IF;
 IF p_capability='request.dispatch' AND (j->>'status'<>'new' OR p_payload->>'artisan_id' IS NULL) THEN RAISE EXCEPTION 'REQUEST_NOT_DISPATCHABLE'; END IF;
 IF p_capability IN('claim.approve','claim.reject') AND j->>'status'<>'pending' THEN RAISE EXCEPTION 'CLAIM_NOT_PENDING'; END IF;
 IF p_capability LIKE 'finance.%' AND (j->>'final_price' IS NULL OR (j->>'status'='validated' AND j->>'completed_at' IS NULL) OR NOT ((j->>'status'='done' AND j->>'request_status' IN('completed','validated')) OR (j->>'status'='validated' AND j->>'request_status'='validated'))) AND p_capability<>'finance.cancel' THEN RAISE EXCEPTION 'COMMISSION_NOT_DUE'; END IF;

 IF p_capability IN('finance.confirm','finance.cancel','finance.correct') THEN
  SELECT jsonb_build_object('id',x.id,'amount',x.amount,'currency',x.currency,'method',x.method,'status',x.status,'version',x.version,'proof_present',x.proof_reference IS NOT NULL) INTO remittance FROM public.commission_remittances_v1 x WHERE x.id=(p_payload->>'remittance_id')::uuid AND x.mission_id=p_target_id;
  IF remittance IS NULL THEN RAISE EXCEPTION 'REMITTANCE_NOT_FOUND'; END IF;
 END IF;
 IF (SELECT count(*) FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND created_at>now()-interval '1 minute')>=60 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 INSERT INTO fixeo_private.control_action_previews_v1(actor_id,capability,target_id,payload,fingerprint,correlation_id) VALUES(uid,p_capability,p_target_id,p_payload,md5(j::text),p_correlation_id) RETURNING control_action_previews_v1.id INTO id;
 RETURN jsonb_build_object('preview_id',id,'capability',p_capability,'target',jsonb_build_object('type',typ,'id',p_target_id),'authority',split_part(p_capability,'.',1),'current',j,'remittance',remittance,'effect',p_payload-'proof_reference','preconditions',jsonb_build_array('role_admin','unchanged_target','domain_state_valid'),'requires_confirmation',true,'expires_at',now()+interval '5 minutes','correlation_id',p_correlation_id,'warnings',jsonb_build_array('Action engageante : vérifier la cible et le montant avant confirmation.'));
END $function$;

COMMIT;
