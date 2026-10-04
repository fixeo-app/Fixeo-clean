-- W4.1 staging only: parenthesize JSON extraction before the allowlist subtraction.
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE FUNCTION fixeo_private.w41_diagnostic_v1(p jsonb) RETURNS jsonb
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
      OR (body->'input')-ARRAY['description','answers','safety_signals']<>'{}'::jsonb
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
NOTIFY pgrst,'reload schema';
