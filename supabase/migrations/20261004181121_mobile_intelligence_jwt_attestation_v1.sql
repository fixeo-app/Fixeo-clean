-- W4.1 only: apply exclusively to kqyhusnbybsukbcaoqtu after operator verification.
-- No credential values. Vault provisioning is a separate authorized operation.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE fixeo_private.mobile_intelligence_config_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  key_name text NOT NULL DEFAULT 'fixeo_w41_attestation_v1',
  key_id text NOT NULL DEFAULT 'w41-v1',
  project_ref text NOT NULL CHECK(project_ref='kqyhusnbybsukbcaoqtu'),
  branch text NOT NULL CHECK(branch='feat/fixeo-mobile-w4-1-intelligence-gateway')
);
INSERT INTO fixeo_private.mobile_intelligence_config_v1(project_ref,branch)
VALUES ('kqyhusnbybsukbcaoqtu','feat/fixeo-mobile-w4-1-intelligence-gateway');
ALTER TABLE fixeo_private.mobile_intelligence_config_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.mobile_intelligence_config_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE fixeo_private.mobile_intelligence_receipts_v1 (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  operation text NOT NULL CHECK(operation IN ('diagnostic','offer','confirm')),
  operation_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,operation,operation_id)
);
ALTER TABLE fixeo_private.mobile_intelligence_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.mobile_intelligence_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_client_v1() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=u AND role='client')
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u)
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until<now()))
    THEN RAISE EXCEPTION 'MOBILE_CLIENT_REQUIRED' USING ERRCODE='42501'; END IF;
  -- An already-issued JWT must not survive explicit session revocation.
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=u)
    THEN RAISE EXCEPTION 'MOBILE_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
  RETURN u;
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_client_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_verify_v1(p_envelope text,p_mac text,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1(); e jsonb; cfg fixeo_private.mobile_intelligence_config_v1;
  signing_key text; expected bytea; supplied bytea; diff integer:=0; i integer; clock_s bigint;
BEGIN
  SELECT * INTO cfg FROM fixeo_private.mobile_intelligence_config_v1 WHERE singleton;
  IF NOT FOUND OR NOT cfg.enabled THEN RAISE EXCEPTION 'MOBILE_GATEWAY_DISABLED'; END IF;
  IF p_envelope IS NULL OR octet_length(p_envelope)>65536 OR p_mac IS NULL OR p_mac !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'MOBILE_ATTESTATION_INVALID' USING ERRCODE='42501'; END IF;
  SELECT decrypted_secret INTO signing_key FROM vault.decrypted_secrets WHERE name=cfg.key_name;
  IF signing_key IS NULL OR length(signing_key)<64 THEN RAISE EXCEPTION 'MOBILE_GATEWAY_DISABLED'; END IF;
  expected:=extensions.hmac(convert_to('fixeo-w41-attestation-v1:'||p_envelope,'UTF8'),convert_to(signing_key,'UTF8'),'sha256');
  supplied:=decode(p_mac,'hex');
  FOR i IN 0..31 LOOP diff:=diff | (get_byte(expected,i) # get_byte(supplied,i)); END LOOP;
  IF diff<>0 THEN RAISE EXCEPTION 'MOBILE_ATTESTATION_INVALID' USING ERRCODE='42501'; END IF;
  e:=p_envelope::jsonb;
  clock_s:=floor(extract(epoch FROM clock_timestamp()));
  IF jsonb_typeof(e)<>'object' OR e->>'v' IS DISTINCT FROM '1' OR e->>'kid' IS DISTINCT FROM cfg.key_id
    OR e->>'aud' IS DISTINCT FROM 'fixeo-mobile-w41' OR e->>'project_ref' IS DISTINCT FROM cfg.project_ref
    OR e->>'environment' IS DISTINCT FROM 'staging' OR e->>'branch' IS DISTINCT FROM cfg.branch
    OR e->>'user_id' IS DISTINCT FROM u::text OR e->>'operation' IS DISTINCT FROM p_operation
    OR jsonb_typeof(e->'payload') IS DISTINCT FROM 'object'
    OR (e->>'operation_id') IS NULL OR (e->>'issued_at') IS NULL OR (e->>'expires_at') IS NULL
    THEN RAISE EXCEPTION 'MOBILE_ATTESTATION_SCOPE' USING ERRCODE='42501'; END IF;
  PERFORM (e->>'operation_id')::uuid;
  IF (e->>'expires_at')::bigint<=clock_s OR (e->>'issued_at')::bigint>clock_s+5
    OR (e->>'expires_at')::bigint-(e->>'issued_at')::bigint NOT BETWEEN 1 AND 60
    THEN RAISE EXCEPTION 'MOBILE_ATTESTATION_EXPIRED' USING ERRCODE='42501'; END IF;
  RETURN e;
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_verify_v1(text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_limits_v1(p_uid uuid) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_array(
   jsonb_build_object('key','w41:global','requests',10000,'sessions',300,'analyses',1000,'bytes',536870912,'reserved_micro_usd',10000000),
   jsonb_build_object('key','w41:u:'||p_uid::text,'requests',300,'sessions',10,'analyses',10,'bytes',100663296,'reserved_micro_usd',1000000));
$fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_limits_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_diagnostic_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1(); action text:=p->>'action'; sid uuid:=(p->>'session_id')::uuid;
  body jsonb:=p->'payload'; allowed text[]; result jsonb;
BEGIN
  IF p - ARRAY['action','session_id','payload']<>'{}'::jsonb OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR sid IS NULL
    THEN RAISE EXCEPTION 'MOBILE_PAYLOAD_INVALID'; END IF;
  allowed:=CASE action
    WHEN 'create' THEN ARRAY['city_slug','consent_version','input','revision']
    WHEN 'get' THEN ARRAY['revision']
    WHEN 'media_reserve' THEN ARRAY['revision','kind','mime','bytes']
    WHEN 'media_claim' THEN ARRAY['revision','media_id']
    WHEN 'media_finish' THEN ARRAY['revision','media_id','lease','mime','bytes','width','height','sha256']
    WHEN 'media_reject' THEN ARRAY['revision','media_id','lease']
    WHEN 'run_start' THEN ARRAY['revision','run_id','provider','model']
    WHEN 'run_finish' THEN ARRAY['revision','run_id','result','usage','latency_ms']
    WHEN 'run_fail' THEN ARRAY['revision','run_id','error_code','latency_ms'] END;
  IF allowed IS NULL OR body-allowed<>'{}'::jsonb THEN RAISE EXCEPTION 'MOBILE_OPERATION_FORBIDDEN'; END IF;
  IF action='create' THEN
    IF body->>'consent_version' IS DISTINCT FROM 'diagnostic-privacy-v1'
      OR body->'input'-ARRAY['description','answers','safety_signals']<>'{}'::jsonb
      OR length(coalesce(body->'input'->>'description',''))>2000
      OR body->'input'->'answers' IS DISTINCT FROM '{}'::jsonb
      OR body->'input'->'safety_signals' IS DISTINCT FROM '[]'::jsonb
      THEN RAISE EXCEPTION 'MOBILE_PAYLOAD_INVALID'; END IF;
    body:=body||jsonb_build_object('source','client');
  END IF;
  IF action='run_start' THEN
    IF body->>'provider' IS DISTINCT FROM 'openai' OR length(coalesce(body->>'model','')) NOT BETWEEN 1 AND 100
      THEN RAISE EXCEPTION 'MOBILE_PAYLOAD_INVALID'; END IF;
    body:=body||jsonb_build_object('reserved_micro_usd',100000);
  END IF;
  IF action='run_finish' THEN
    IF jsonb_typeof(body->'result') IS DISTINCT FROM 'object'
      OR jsonb_typeof(body->'result'->'safety'->'stop') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(body->'result'->'questions') IS DISTINCT FROM 'array'
      OR jsonb_array_length(body->'result'->'questions')>1
      THEN RAISE EXCEPTION 'MOBILE_RESULT_INVALID'; END IF;
  END IF;
  body:=body||jsonb_build_object('limits',fixeo_private.w41_limits_v1(u));
  result:=public.diagnostic_state_v1(action,'u:'||u::text,sid,body);
  IF result->'session'->>'owner_user_id' IS DISTINCT FROM u::text THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH'; END IF;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_diagnostic_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_offer_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1(); row public.fixeo_pricing_offers_v1;
BEGIN
  IF p-ARRAY['id','offer_key','pricing_version','currency','service_code','catalogue_version','city','scope','vap_minor','materials_minor','commission_minor','client_total_minor','expires_at']<>'{}'::jsonb
    OR p->>'pricing_version' IS DISTINCT FROM 'vap-bp33-v1' OR p->>'currency' IS DISTINCT FROM 'MAD'
    OR jsonb_typeof(p->'scope') IS DISTINCT FROM 'object'
    OR (p->>'expires_at')::timestamptz<=now() OR (p->>'expires_at')::timestamptz>now()+interval '15 minutes 5 seconds'
    OR length(coalesce(p->'scope'->>'session_id','')) NOT BETWEEN 1 AND 200
    OR p->'scope'->>'context_id' !~ '^fxctx-[0-9a-f]{32}$'
    THEN RAISE EXCEPTION 'MOBILE_OFFER_INVALID'; END IF;
  IF p->'scope' ? 'diagnostic' THEN
    IF p->'scope'->'diagnostic'->>'actor' IS DISTINCT FROM 'u:'||u::text THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH'; END IF;
    PERFORM fixeo_private.diagnostic_booking_context_v1(p->'scope'->'diagnostic',p->>'city',NULL);
  END IF;
  INSERT INTO public.fixeo_pricing_offers_v1(id,offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,
    vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
  VALUES((p->>'id')::uuid,(p->>'offer_key')::uuid,p->>'pricing_version',p->>'currency',p->>'service_code',p->>'catalogue_version',p->>'city',
    p->'scope'||jsonb_build_object('w41_user_id',u),
    (p->>'vap_minor')::bigint,(p->>'materials_minor')::bigint,(p->>'commission_minor')::bigint,(p->>'client_total_minor')::bigint,(p->>'expires_at')::timestamptz)
  RETURNING * INTO row;
  RETURN jsonb_build_object('ok',true,'offer_id',row.id);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_offer_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Canonical confirmation composition is appended below before the public entrypoints.
CREATE FUNCTION fixeo_private.w41_confirm_v1(p_confirmation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  p_user_id uuid := fixeo_private.w41_client_v1();
  c jsonb := p_confirmation;
  result jsonb;
  request public.service_requests;
  previous record;
  offer public.fixeo_pricing_offers_v1;
  session_key text;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id AND role='client')
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id)
    THEN RAISE EXCEPTION 'MOBILE_CLIENT_REQUIRED' USING ERRCODE='42501'; END IF;
  IF c IS NULL OR jsonb_typeof(c)<>'object' OR octet_length(c::text)>32768
    OR c-ARRAY['p_context_id','p_outcome_type','p_service_code','p_session_id','p_amount_mad','p_city_slug','p_client_phone','p_description','p_tracking_ref','p_guest_token_hash','p_offer_id','p_diagnostic']<>'{}'::jsonb
    OR length(coalesce(c->>'p_session_id','')) NOT BETWEEN 1 AND 200
    THEN RAISE EXCEPTION 'MOBILE_CONFIRMATION_INVALID'; END IF;
  IF c ? 'p_diagnostic' AND c->'p_diagnostic'->>'actor' IS DISTINCT FROM 'u:'||p_user_id::text
    THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH' USING ERRCODE='42501'; END IF;
  -- Verify the persisted offer even when returning an earlier session confirmation.
  IF c ? 'p_offer_id' THEN
    SELECT * INTO offer FROM public.fixeo_pricing_offers_v1 WHERE id=(c->>'p_offer_id')::uuid;
    IF NOT FOUND OR offer.scope->>'w41_user_id' IS DISTINCT FROM p_user_id::text OR offer.pricing_version<>'vap-bp33-v1'
      OR offer.scope->>'context_id' IS DISTINCT FROM c->>'p_context_id'
      OR offer.scope->>'session_id' IS DISTINCT FROM c->>'p_session_id'
      OR offer.scope->>'outcome_type' IS DISTINCT FROM c->>'p_outcome_type'
      OR offer.service_code IS DISTINCT FROM c->>'p_service_code'
      OR offer.city IS DISTINCT FROM c->>'p_city_slug'
      OR offer.client_total_minor::numeric/100 IS DISTINCT FROM (c->>'p_amount_mad')::numeric
      THEN RETURN jsonb_build_object('ok',false,'reason','offer_mismatch'); END IF;
    IF offer.expires_at<=now() AND NOT EXISTS(SELECT 1 FROM public.estimator_context_redemptions
      WHERE context_id=c->>'p_context_id' AND state='committed')
      THEN RETURN jsonb_build_object('ok',false,'reason','offer_expired'); END IF;
  END IF;
  -- A lost evaluate response can yield another context for the same session.
  -- Serialize the entire mobile session as well as the canonical context redemption.
  session_key := 'mobile-estimator-v1:' || (c->>'p_session_id');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(session_key,0));
  SELECT e.*, s.client_profile_id, s.city, s.tracking_ref, s.status, s.service_category
    INTO previous FROM public.estimator_context_redemptions e
    JOIN public.service_requests s ON s.id=e.service_request_id
    WHERE e.session_id=c->>'p_session_id' AND e.state='committed'
    ORDER BY e.committed_at LIMIT 1;
  IF FOUND THEN
    IF previous.client_profile_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH' USING ERRCODE='42501'; END IF;
    IF previous.service_code IS DISTINCT FROM c->>'p_service_code'
      OR previous.outcome_type IS DISTINCT FROM c->>'p_outcome_type'
      OR previous.amount_mad IS DISTINCT FROM (c->>'p_amount_mad')::numeric
      THEN RAISE EXCEPTION 'MOBILE_CONFIRMATION_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'request_id',previous.service_request_id,
      'tracking_ref',previous.tracking_ref,'status',previous.status,'city',previous.city,
      'service_category',previous.service_category);
  END IF;
  IF c ? 'p_diagnostic' THEN
    result := public.confirm_estimator_request_diagnostic_v1(
      c->>'p_context_id',c->>'p_outcome_type',c->>'p_service_code',c->>'p_session_id',
      (c->>'p_amount_mad')::numeric,c->>'p_city_slug',c->>'p_client_phone',c->>'p_description',
      c->>'p_tracking_ref',c->>'p_guest_token_hash',(c->>'p_offer_id')::uuid,c->'p_diagnostic');
  ELSIF c ? 'p_offer_id' THEN
    result := public.confirm_estimator_request_vap_v1(
      c->>'p_context_id',c->>'p_outcome_type',c->>'p_service_code',c->>'p_session_id',
      (c->>'p_amount_mad')::numeric,c->>'p_city_slug',c->>'p_client_phone',c->>'p_description',
      c->>'p_tracking_ref',c->>'p_guest_token_hash',(c->>'p_offer_id')::uuid);
  ELSE
    result := public.confirm_estimator_request_v1(
      c->>'p_context_id',c->>'p_outcome_type',c->>'p_service_code',c->>'p_session_id',
      (c->>'p_amount_mad')::integer,c->>'p_city_slug',c->>'p_client_phone',c->>'p_description',
      c->>'p_tracking_ref',c->>'p_guest_token_hash');
  END IF;
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'MOBILE_CONFIRMATION_REJECTED'; END IF;
  SELECT * INTO request FROM public.service_requests WHERE id=(result->>'request_id')::uuid FOR UPDATE;
  IF NOT FOUND OR (request.client_profile_id IS NOT NULL AND request.client_profile_id<>p_user_id)
    OR (result->>'replayed'='true' AND request.client_profile_id IS NULL)
    THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH' USING ERRCODE='42501'; END IF;
  UPDATE public.service_requests SET client_profile_id=p_user_id WHERE id=request.id;
  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION fixeo_private.w41_confirm_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_finalize_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1(); c jsonb:=p->'confirmation'; r jsonb; rid uuid;
BEGIN
  IF p-ARRAY['kind','confirmation']<>'{}'::jsonb OR jsonb_typeof(c) IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'MOBILE_PAYLOAD_INVALID'; END IF;
  IF p->>'kind'='pricing' THEN RETURN fixeo_private.w41_confirm_v1(c); END IF;
  IF p->>'kind' IS DISTINCT FROM 'quote' OR c-ARRAY['p_diagnostic','p_client_phone','p_tracking_ref','p_guest_token_hash','p_description','p_service_category','p_city_slug']<>'{}'::jsonb
    OR c->'p_diagnostic'->>'actor' IS DISTINCT FROM 'u:'||u::text THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH'; END IF;
  r:=public.create_diagnostic_quote_request_v1(c->'p_diagnostic',c->>'p_client_phone',c->>'p_tracking_ref',
    c->>'p_guest_token_hash',c->>'p_description',c->>'p_service_category',c->>'p_city_slug');
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'MOBILE_CONFIRMATION_REJECTED'; END IF;
  rid:=coalesce(r->>'request_id',r->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=rid AND client_profile_id=u)
    THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH'; END IF;
  RETURN r||jsonb_build_object('request_id',rid);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_finalize_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION fixeo_private.w41_execute_v1(p_operation text,p_envelope text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE e jsonb:=fixeo_private.w41_verify_v1(p_envelope,p_mac,p_operation); u uuid:=auth.uid();
  oid uuid:=(e->>'operation_id')::uuid; ph text; previous fixeo_private.mobile_intelligence_receipts_v1; result jsonb;
BEGIN
  IF p_operation NOT IN ('diagnostic','offer','confirm') THEN RAISE EXCEPTION 'MOBILE_OPERATION_FORBIDDEN'; END IF;
  ph:=encode(extensions.digest(convert_to((e->'payload')::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('w41:'||u::text||':'||p_operation||':'||oid::text,0));
  SELECT * INTO previous FROM fixeo_private.mobile_intelligence_receipts_v1 WHERE user_id=u AND operation=p_operation AND operation_id=oid;
  IF FOUND THEN
    IF previous.payload_hash IS DISTINCT FROM ph THEN RAISE EXCEPTION 'MOBILE_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN previous.result||jsonb_build_object('replayed',true);
  END IF;
  IF p_operation='diagnostic' THEN result:=fixeo_private.w41_diagnostic_v1(e->'payload');
  ELSIF p_operation='offer' THEN result:=fixeo_private.w41_offer_v1(e->'payload');
  ELSE result:=fixeo_private.w41_finalize_v1(e->'payload'); END IF;
  IF result ? 'ok' AND result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'MOBILE_OPERATION_REJECTED'; END IF;
  -- Reads must recheck current revision/expiry, not become cached authority.
  IF p_operation<>'diagnostic' OR e->'payload'->>'action'<>'get' THEN
    INSERT INTO fixeo_private.mobile_intelligence_receipts_v1(user_id,operation,operation_id,payload_hash,result)
      VALUES(u,p_operation,oid,ph,result);
  END IF;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_execute_v1(text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private.w41_execute_v1(text,text,text) TO authenticated;

CREATE FUNCTION public.mobile_diagnostic_state_v1(p_envelope text,p_mac text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT fixeo_private.w41_execute_v1('diagnostic',p_envelope,p_mac);
$fn$;
CREATE FUNCTION public.mobile_estimator_offer_v1(p_envelope text,p_mac text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT fixeo_private.w41_execute_v1('offer',p_envelope,p_mac);
$fn$;
CREATE FUNCTION public.confirm_mobile_estimator_request_v2(p_envelope text,p_mac text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT fixeo_private.w41_execute_v1('confirm',p_envelope,p_mac);
$fn$;
REVOKE ALL ON FUNCTION public.mobile_diagnostic_state_v1(text,text),public.mobile_estimator_offer_v1(text,text),public.confirm_mobile_estimator_request_v2(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_diagnostic_state_v1(text,text),public.mobile_estimator_offer_v1(text,text),public.confirm_mobile_estimator_request_v2(text,text) TO authenticated;

CREATE FUNCTION fixeo_private.w41_quota_v1(p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1();
BEGIN
  IF p_kind NOT IN ('estimator','diagnostic') THEN RAISE EXCEPTION 'MOBILE_OPERATION_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_config_v1 WHERE singleton AND enabled)
    THEN RAISE EXCEPTION 'MOBILE_GATEWAY_DISABLED'; END IF;
  PERFORM fixeo_private.diagnostic_quota_v1(fixeo_private.w41_limits_v1(u),'{"requests":1}');
  RETURN jsonb_build_object('ok',true);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_quota_v1(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private.w41_quota_v1(text) TO authenticated;
CREATE FUNCTION public.mobile_intelligence_quota_v1(p_kind text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT fixeo_private.w41_quota_v1(p_kind);
$fn$;
REVOKE ALL ON FUNCTION public.mobile_intelligence_quota_v1(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_intelligence_quota_v1(text) TO authenticated;

CREATE FUNCTION fixeo_private.w41_dispatch_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w41_client_v1();
BEGIN
  PERFORM public.mobile_intelligence_quota_v1('estimator');
  IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=p_request_id AND client_profile_id=u)
    OR NOT EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_receipts_v1 WHERE user_id=u AND operation='confirm'
      AND result->>'request_id'=p_request_id::text)
    THEN RAISE EXCEPTION 'MOBILE_OWNER_MISMATCH' USING ERRCODE='42501'; END IF;
  RETURN public.dispatch_request_v1(p_request_id);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_dispatch_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private.w41_dispatch_v1(uuid) TO authenticated;
CREATE FUNCTION public.dispatch_my_estimator_request_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT fixeo_private.w41_dispatch_v1(p_request_id);
$fn$;
REVOKE ALL ON FUNCTION public.dispatch_my_estimator_request_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_my_estimator_request_v1(uuid) TO authenticated;

-- The only storage delegation: owned, DB-reserved, immutable sanitized paths.
CREATE FUNCTION fixeo_private.w41_media_access_v1(p_name text,p_insert boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid;
BEGIN
  u:=fixeo_private.w41_client_v1();
  RETURN EXISTS(SELECT 1 FROM fixeo_private.diagnostic_media_v1 m
    JOIN fixeo_private.diagnostic_sessions_v1 s ON s.id=m.session_id
    WHERE s.owner_user_id=u AND s.source='client' AND s.expires_at>now() AND m.expires_at>now()
      AND m.clean_path=p_name
      AND EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_receipts_v1 r
        WHERE r.user_id=u AND r.operation='diagnostic' AND r.result->'session'->>'id'=s.id::text)
      AND ((p_insert AND m.state='validating' AND m.lease_until>now())
        OR (NOT p_insert AND (m.state='ready' OR (m.state='validating' AND m.lease_until>now())))))
    AND EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_config_v1 WHERE singleton AND enabled);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.w41_media_access_v1(text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION fixeo_private.w41_media_access_v1(text,boolean) TO authenticated;
CREATE POLICY w41_diagnostic_safe_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='diagnostic-private-v1' AND fixeo_private.w41_media_access_v1(name,true));
CREATE POLICY w41_diagnostic_safe_select ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='diagnostic-private-v1' AND fixeo_private.w41_media_access_v1(name,false));
-- No UPDATE, DELETE, public-read or raw-upload policy is added.
NOTIFY pgrst, 'reload schema';
