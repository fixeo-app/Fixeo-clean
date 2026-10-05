-- W4.1 staging only: a second pricing context cannot change the confirmed city.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION fixeo_private.w41_confirm_v1(p_confirmation jsonb)
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
      OR replace(translate(lower(previous.city),'éèê','eee'),' ','-') IS DISTINCT FROM c->>'p_city_slug'
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

NOTIFY pgrst,'reload schema';
