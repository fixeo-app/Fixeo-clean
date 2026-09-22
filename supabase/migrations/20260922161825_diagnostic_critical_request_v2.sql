-- Additive Diagnostic-only endpoint. No legacy result, quota, estimator function,
-- business row, table policy or dispatch setting is changed by this migration.
SET LOCAL lock_timeout = '3s';
CREATE FUNCTION public.create_diagnostic_critical_request_v1(
  p_diagnostic jsonb, p_client_phone text, p_tracking_ref text,
  p_guest_token_hash text, p_ack_version text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  s fixeo_private.diagnostic_sessions_v1%ROWTYPE;
  r fixeo_private.diagnostic_runs_v1%ROWTYPE;
  sr public.service_requests%ROWTYPE;
  request_id uuid; profile_id uuid; city_label text; trade text; detail text;
BEGIN
  IF p_diagnostic IS NULL OR jsonb_typeof(p_diagnostic) <> 'object'
    OR octet_length(p_diagnostic::text) > 4096
    OR p_diagnostic->'acknowledged' IS DISTINCT FROM 'true'::jsonb
    OR p_ack_version IS DISTINCT FROM 'fixeo-critical-ack-v1'
    THEN RAISE EXCEPTION 'DIAGNOSTIC_ACKNOWLEDGEMENT_REQUIRED'; END IF;
  s := fixeo_private.diagnostic_lock_v1((p_diagnostic->>'session_id')::uuid, p_diagnostic->>'actor');
  IF s.revision IS DISTINCT FROM (p_diagnostic->>'revision')::integer
    OR s.selected_run_id IS DISTINCT FROM (p_diagnostic->>'run_id')::uuid
    OR s.state NOT IN ('ready', 'bound')
    THEN RAISE EXCEPTION 'DIAGNOSTIC_REVISION_CONFLICT'; END IF;
  SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1
    WHERE id=s.selected_run_id AND session_id=s.id;
  IF NOT FOUND OR r.state <> 'complete' OR r.revision <> s.revision
    OR r.result->'safety'->>'version' IS DISTINCT FROM 'fixeo-risk-routing-v2'
    OR r.result->'safety'->>'level' IS DISTINCT FROM 'CRITICAL'
    OR r.result->'safety'->>'stop' IS DISTINCT FROM 'true'
    OR r.result->'safety'->>'urgency' IS DISTINCT FROM 'now'
    OR jsonb_typeof(r.result->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(r.result->'questions') <> 0
    THEN RAISE EXCEPTION 'DIAGNOSTIC_NOT_QUALIFIED'; END IF;
  IF p_client_phone IS NULL OR p_client_phone !~ '^([+]212|0)[5-7][0-9]{8}$'
    OR p_tracking_ref IS NULL OR p_tracking_ref !~ '^FX-[A-Z0-9-]{1,29}$'
    OR p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_INPUT'; END IF;
  -- Replay is bound to the same owner, immutable analysis and contact. A retry
  -- cannot create another request or alter an already acknowledged request.
  IF s.service_request_id IS NOT NULL THEN
    SELECT * INTO sr FROM public.service_requests WHERE id=s.service_request_id;
    IF NOT FOUND OR s.booking_context->>'kind' IS DISTINCT FROM 'critical'
      OR s.booking_context->>'risk_level' IS DISTINCT FROM 'CRITICAL'
      OR sr.guest_token_hash IS DISTINCT FROM p_guest_token_hash
      OR sr.client_phone IS DISTINCT FROM p_client_phone
      THEN RAISE EXCEPTION 'DIAGNOSTIC_REQUEST_MISMATCH'; END IF;
    RETURN jsonb_build_object('ok',true,'request_id',sr.id,'tracking_ref',sr.tracking_ref,'replayed',true,'risk_level','CRITICAL','urgency','now');
  END IF;
  IF s.owner_user_id IS NOT NULL THEN
    SELECT id INTO profile_id FROM public.profiles WHERE id=s.owner_user_id;
    IF profile_id IS NULL THEN RAISE EXCEPTION 'DIAGNOSTIC_PROFILE_REQUIRED'; END IF;
  END IF;
  trade := r.result->'trade'->>'value';
  IF trade IS NULL OR trade NOT IN ('plomberie','electricite','serrurerie','climatisation','bricolage',
    'menuiserie','peinture','maconnerie','nettoyage','jardinage','demenagement','carrelage','autre')
    THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_TRADE'; END IF;
  city_label := CASE s.city_slug
    WHEN 'casablanca' THEN 'Casablanca' WHEN 'rabat' THEN 'Rabat'
    WHEN 'marrakech' THEN 'Marrakech' WHEN 'fes' THEN 'Fès'
    WHEN 'tanger' THEN 'Tanger' WHEN 'agadir' THEN 'Agadir'
    WHEN 'meknes' THEN 'Meknès' WHEN 'oujda' THEN 'Oujda'
    WHEN 'kenitra' THEN 'Kénitra' WHEN 'tetouan' THEN 'Tétouan'
    WHEN 'sale' THEN 'Salé' WHEN 'temara' THEN 'Temara'
    WHEN 'el-jadida' THEN 'El Jadida' WHEN 'beni-mellal' THEN 'Béni Mellal'
    WHEN 'khouribga' THEN 'Khouribga' WHEN 'safi' THEN 'Safi'
    WHEN 'nador' THEN 'Nador' WHEN 'taza' THEN 'Taza'
    WHEN 'ouarzazate' THEN 'Ouarzazate' WHEN 'mohammedia' THEN 'Mohammedia' ELSE NULL END;
  IF city_label IS NULL THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_CITY'; END IF;
  detail := left('DIAGNOSTIC CRITICAL — consignes de sécurité reconnues. FIXEO ne remplace jamais les secours. '
    || coalesce(nullif(btrim(s.input->>'description'),''),r.result->'problem'->>'value','Danger immédiat signalé.'),1000);
  -- Use the existing immediate urgency (now); preserve explicit CRITICAL and
  -- acknowledgement in the Diagnostic booking context. No new global enum.
  INSERT INTO public.service_requests(service_category,city,description,client_phone,urgency,status,
    idempotency_key,tracking_ref,guest_token_hash,client_profile_id)
  VALUES(trade,city_label,detail,p_client_phone,'now','new','diagnostic-critical:'||s.id::text,
    p_tracking_ref,p_guest_token_hash,profile_id) RETURNING id INTO request_id;
  -- Existing binding and retention rules, in this same atomic transaction.
  PERFORM fixeo_private.diagnostic_bind_v1(p_diagnostic,request_id,NULL,jsonb_build_object(
    'kind','critical','service_category',trade,'urgency','now','risk_level','CRITICAL',
    'tracking_ref',p_tracking_ref,'safety_version','fixeo-risk-routing-v2',
    'acknowledgement',jsonb_build_object('accepted',true,'version',p_ack_version,'run_id',r.id,'at',now())));
  RETURN jsonb_build_object('ok',true,'request_id',request_id,'tracking_ref',p_tracking_ref,
    'replayed',false,'risk_level','CRITICAL','urgency','now');
END $fn$;
REVOKE ALL ON FUNCTION public.create_diagnostic_critical_request_v1(jsonb,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_diagnostic_critical_request_v1(jsonb,text,text,text,text) TO service_role;
