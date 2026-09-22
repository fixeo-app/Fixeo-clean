
SET LOCAL lock_timeout='3s';
-- The reviewed canonical confirmation body is preserved in the private core below.
-- The existing public Estimation function is deliberately left unchanged.
DO $guard$
BEGIN
  IF md5(btrim(pg_get_functiondef('public.confirm_estimator_request_vap_v1(text,text,text,text,numeric,text,text,text,text,text,uuid)'::regprocedure), E' \t\r\n'))
    <> '8385d4401513eed11fe50300b1277933'
  THEN RAISE EXCEPTION 'Diagnostic booking precondition: canonical confirmation drift'; END IF;
END $guard$;

ALTER TABLE fixeo_private.diagnostic_sessions_v1 ADD booking_context jsonb;

CREATE FUNCTION fixeo_private.diagnostic_booking_context_v1(p_context jsonb,p_city text,p_offer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s fixeo_private.diagnostic_sessions_v1%ROWTYPE; r fixeo_private.diagnostic_runs_v1%ROWTYPE; profile_id uuid;
BEGIN
  s:=fixeo_private.diagnostic_lock_v1((p_context->>'session_id')::uuid,p_context->>'actor');
  IF (p_context->>'revision')::integer IS DISTINCT FROM s.revision
    OR (p_context->>'run_id')::uuid IS DISTINCT FROM s.selected_run_id
    OR s.city_slug IS DISTINCT FROM p_city OR s.state NOT IN ('ready','bound')
    THEN RAISE EXCEPTION 'DIAGNOSTIC_REVISION_CONFLICT'; END IF;
  SELECT * INTO r FROM fixeo_private.diagnostic_runs_v1 WHERE id=s.selected_run_id AND session_id=s.id;
  IF NOT FOUND OR r.state<>'complete' OR r.revision<>s.revision
    OR r.result->'safety'->>'stop' IS DISTINCT FROM 'false'
    OR r.result->'safety'->>'urgency' IS NULL
    OR r.result->'safety'->>'urgency' NOT IN ('normale','urgent')
    OR r.result->'questions' IS NULL OR jsonb_array_length(r.result->'questions')<>0
    THEN RAISE EXCEPTION 'DIAGNOSTIC_NOT_QUALIFIED'; END IF;
  IF s.service_request_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.service_requests sr WHERE sr.id=s.service_request_id AND sr.pricing_offer_id IS NOT DISTINCT FROM p_offer
  ) THEN RAISE EXCEPTION 'DIAGNOSTIC_ALREADY_BOOKED'; END IF;
  IF s.owner_user_id IS NOT NULL THEN
    SELECT id INTO profile_id FROM public.profiles WHERE id=s.owner_user_id;
    IF profile_id IS NULL THEN RAISE EXCEPTION 'DIAGNOSTIC_PROFILE_REQUIRED'; END IF;
  END IF;
  RETURN jsonb_build_object('urgency',r.result->'safety'->>'urgency','client_profile_id',profile_id,'request_id',s.service_request_id);
END $fn$;

CREATE FUNCTION fixeo_private.diagnostic_bind_v1(p_context jsonb,p_request uuid,p_offer uuid,p_booking jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s fixeo_private.diagnostic_sessions_v1%ROWTYPE;
BEGIN
  s:=fixeo_private.diagnostic_lock_v1((p_context->>'session_id')::uuid,p_context->>'actor');
  IF s.state<>'ready' OR s.revision IS DISTINCT FROM (p_context->>'revision')::integer
    OR s.selected_run_id IS DISTINCT FROM (p_context->>'run_id')::uuid
    THEN RAISE EXCEPTION 'DIAGNOSTIC_IMMUTABLE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=p_request AND pricing_offer_id IS NOT DISTINCT FROM p_offer)
    THEN RAISE EXCEPTION 'DIAGNOSTIC_REQUEST_MISMATCH'; END IF;
  UPDATE fixeo_private.diagnostic_sessions_v1 SET service_request_id=p_request,state='bound',
    booking_context=p_booking,expires_at=now()+interval '180 days',updated_at=now() WHERE id=s.id;
  UPDATE fixeo_private.diagnostic_media_v1 SET expires_at=now()+interval '90 days'
    WHERE session_id=s.id AND state='ready';
END $fn$;

CREATE OR REPLACE FUNCTION fixeo_private.diagnostic_confirm_request_core_v1(p_context_id text, p_outcome_type text, p_service_code text, p_session_id text, p_amount_mad numeric, p_city_slug text, p_client_phone text, p_description text, p_tracking_ref text, p_guest_token_hash text, p_offer_id uuid, p_diagnostic jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_diagnostic_context jsonb;
  v_offer public.fixeo_pricing_offers_v1%ROWTYPE;
  v_context_id       text;
  v_outcome_type     text;
  v_service_code     text;
  v_session_id       text;
  v_city_slug        text;
  v_city              text;
  v_service_category text;
  v_phone             text;
  v_description       text;
  v_tracking_ref      text;
  v_guest_token_hash  text;
  v_idempotency_key   text;

  v_existing_outcome_type text;
  v_existing_service_code text;
  v_existing_session_id   text;
  v_existing_amount_mad   numeric;
  v_existing_state        text;
  v_existing_request_id   uuid;

  v_request_id              uuid;
  v_existing_tracking_ref   text;
  v_existing_request_status text;
  v_existing_guest_hash     text;
BEGIN
  SELECT * INTO v_offer FROM public.fixeo_pricing_offers_v1 WHERE id=p_offer_id;
  IF NOT FOUND OR v_offer.pricing_version <> 'vap-bp33-v1'
    OR v_offer.scope->>'context_id' IS DISTINCT FROM p_context_id
    OR v_offer.scope->>'session_id' IS DISTINCT FROM p_session_id
    OR v_offer.scope->>'outcome_type' IS DISTINCT FROM p_outcome_type
    OR v_offer.service_code IS DISTINCT FROM p_service_code
    OR v_offer.city IS DISTINCT FROM p_city_slug
    OR v_offer.client_total_minor::numeric/100 IS DISTINCT FROM p_amount_mad
  THEN RETURN jsonb_build_object('ok',false,'reason','offer_mismatch'); END IF;
  IF v_offer.expires_at <= now() AND NOT EXISTS (
    SELECT 1 FROM public.estimator_context_redemptions WHERE context_id=p_context_id AND state='committed'
  ) THEN RETURN jsonb_build_object('ok',false,'reason','offer_expired'); END IF;
  IF (v_offer.scope->'diagnostic') IS DISTINCT FROM (p_diagnostic - 'qualification_answers') THEN
    RETURN jsonb_build_object('ok',false,'reason','diagnostic_context_mismatch');
  END IF;
  IF p_diagnostic IS NOT NULL THEN
    v_diagnostic_context := fixeo_private.diagnostic_booking_context_v1(p_diagnostic,p_city_slug,p_offer_id);
  END IF;
  v_context_id := pg_catalog.btrim(COALESCE(p_context_id, ''));

  IF v_context_id !~ '^fxctx-[0-9a-f]{32}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_context_id');
  END IF;

  v_outcome_type := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_outcome_type, '')));

  IF NOT (
    v_outcome_type = ANY (
      ARRAY[
        'PRICE_READY',
        'DIAGNOSTIC_READY',
        'LABOUR_PLUS_PART_READY',
        'ADD_ON_READY'
      ]::text[]
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'non_payable_outcome');
  END IF;

  v_service_code := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_service_code, '')));

  IF
    v_service_code = ''
    OR pg_catalog.char_length(v_service_code) > 200
    OR v_service_code !~ '^[a-z0-9_]+([.][a-z0-9_]+)+$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_service_code');
  END IF;

  v_service_category := pg_catalog.split_part(v_service_code, '.', 1);

  IF NOT (
    v_service_category = ANY (
      ARRAY[
        'plomberie',
        'electricite',
        'serrurerie',
        'climatisation',
        'bricolage',
        'nettoyage',
        'peinture',
        'menuiserie', 'jardinage', 'carrelage', 'maconnerie', 'demenagement'
      ]::text[]
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unsupported_service_category');
  END IF;

  v_session_id := pg_catalog.btrim(COALESCE(p_session_id, ''));

  IF v_session_id = '' OR pg_catalog.char_length(v_session_id) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_session_id');
  END IF;

  IF p_amount_mad IS NULL OR p_amount_mad <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_canonical_amount');
  END IF;

  v_city_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_city_slug, '')));

  v_city :=
    CASE v_city_slug
      WHEN 'casablanca'  THEN 'Casablanca'
      WHEN 'rabat'       THEN 'Rabat'
      WHEN 'marrakech'   THEN 'Marrakech'
      WHEN 'fes'         THEN 'Fès'
      WHEN 'tanger'      THEN 'Tanger'
      WHEN 'agadir'      THEN 'Agadir'
      WHEN 'meknes'      THEN 'Meknès'
      WHEN 'oujda'       THEN 'Oujda'
      WHEN 'kenitra'     THEN 'Kénitra'
      WHEN 'tetouan'     THEN 'Tétouan'
      WHEN 'sale'        THEN 'Salé'
      WHEN 'temara'      THEN 'Temara'
      WHEN 'el-jadida'   THEN 'El Jadida'
      WHEN 'beni-mellal' THEN 'Béni Mellal'
      WHEN 'nador'       THEN 'Nador'
      WHEN 'khouribga'   THEN 'Khouribga'
      WHEN 'safi'        THEN 'Safi'
      WHEN 'taza'        THEN 'Taza'
      WHEN 'ouarzazate'  THEN 'Ouarzazate'
      WHEN 'mohammedia'  THEN 'Mohammedia'
      ELSE NULL
    END;

  IF v_city IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_city');
  END IF;

  v_phone := pg_catalog.regexp_replace(
    pg_catalog.btrim(COALESCE(p_client_phone, '')),
    '[[:space:]().-]+',
    '',
    'g'
  );

  IF v_phone !~ '^(\+212|0)[5-7][0-9]{8}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_client_phone');
  END IF;

  v_description := pg_catalog.btrim(COALESCE(p_description, ''));

  IF v_description = '' OR pg_catalog.char_length(v_description) > 1000 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_description');
  END IF;

  IF v_service_code = 'demenagement.manutention_2h' THEN
    v_description := 'Forfait FIXEO : équipe de 2 intervenants pendant 2 heures sur un même site, sans camion ni transport. 690 MAD client ; 600 MAD pour toute l’équipe ; 90 MAD FIXEO. Affaires préparées, accès dégagé sans portage en escalier. Pas de démontage ni objet exceptionnel. Pas de prolongation automatique. ' || pg_catalog.left(v_description, 650);
  END IF;

  v_tracking_ref := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_tracking_ref, '')));

  IF
    pg_catalog.char_length(v_tracking_ref) > 32
    OR v_tracking_ref !~ '^FX-[A-Z0-9-]{1,29}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_tracking_ref');
  END IF;

  v_guest_token_hash := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_guest_token_hash, '')));

  IF v_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_guest_token_hash');
  END IF;

  v_idempotency_key := 'estimator:' || v_context_id;

  INSERT INTO public.estimator_context_redemptions (
    context_id,
    outcome_type,
    service_code,
    session_id,
    amount_mad,
    state,
    acquired_at
  )
  VALUES (
    v_context_id,
    v_outcome_type,
    v_service_code,
    v_session_id,
    p_amount_mad,
    'acquired',
    pg_catalog.now()
  )
  ON CONFLICT (context_id)
  DO NOTHING;

  SELECT
    ecr.outcome_type,
    ecr.service_code,
    ecr.session_id,
    ecr.amount_mad,
    ecr.state,
    ecr.service_request_id
  INTO
    v_existing_outcome_type,
    v_existing_service_code,
    v_existing_session_id,
    v_existing_amount_mad,
    v_existing_state,
    v_existing_request_id
  FROM public.estimator_context_redemptions ecr
  WHERE ecr.context_id = v_context_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      '7C.9M.2 invariant failure: redemption row not found after acquisition';
  END IF;

  IF
    v_existing_outcome_type IS DISTINCT FROM v_outcome_type
    OR v_existing_service_code IS DISTINCT FROM v_service_code
    OR v_existing_session_id IS DISTINCT FROM v_session_id
    OR v_existing_amount_mad IS DISTINCT FROM p_amount_mad
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'context_identity_mismatch');
  END IF;

  IF v_existing_state = 'committed' THEN
    IF v_existing_request_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'context_already_consumed_without_request'
      );
    END IF;

    SELECT
      sr.tracking_ref,
      sr.status,
      sr.guest_token_hash
    INTO
      v_existing_tracking_ref,
      v_existing_request_status,
      v_existing_guest_hash
    FROM public.service_requests sr
    WHERE sr.id = v_existing_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        '7C.9M.2 invariant failure: committed redemption references missing request %',
        v_existing_request_id;
    END IF;

    IF
      v_existing_guest_hash IS NULL
      OR v_existing_guest_hash IS DISTINCT FROM v_guest_token_hash
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'guest_token_mismatch');
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'replayed', true,
      'request_id', v_existing_request_id,
      'tracking_ref', v_existing_tracking_ref,
      'service_category', v_service_category,
      'service_code', v_service_code,
      'city', v_city,
      'status', v_existing_request_status,
      'outcome_type', v_outcome_type,
      'amount_mad', p_amount_mad
    );
  END IF;

  IF v_existing_request_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'inconsistent_existing_request_binding'
    );
  END IF;

  IF v_existing_state = 'failed' THEN
    UPDATE public.estimator_context_redemptions
    SET
      state = 'acquired',
      acquired_at = pg_catalog.now(),
      failed_at = NULL,
      failure_reason = NULL,
      booking_ref = NULL,
      order_id = NULL
    WHERE context_id = v_context_id;
  ELSIF v_existing_state <> 'acquired' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'invalid_redemption_state',
      'state', v_existing_state
    );
  END IF;

  INSERT INTO public.service_requests (
    service_category,
    city,
    description,
    client_phone,
    urgency,
    status,
    idempotency_key,
    tracking_ref,
    guest_token_hash, pricing_offer_id, client_profile_id
  )
  VALUES (
    v_service_category,
    v_city,
    v_description,
    v_phone,
    coalesce(v_diagnostic_context->>'urgency','normale'),
    'new',
    v_idempotency_key,
    v_tracking_ref,
    v_guest_token_hash, p_offer_id, (v_diagnostic_context->>'client_profile_id')::uuid
  )
  RETURNING id
  INTO v_request_id;

  IF p_diagnostic IS NOT NULL THEN
    PERFORM fixeo_private.diagnostic_bind_v1(p_diagnostic,v_request_id,p_offer_id,
      jsonb_build_object('service_code',v_service_code,'urgency',v_diagnostic_context->>'urgency',
        'urgency_provenance','ai_inferred','qualification_answers',coalesce(p_diagnostic->'qualification_answers','[]')));
  END IF;

  UPDATE public.estimator_context_redemptions
  SET
    state = 'committed',
    service_request_id = v_request_id,
    committed_at = pg_catalog.now(),
    failed_at = NULL,
    failure_reason = NULL
  WHERE context_id = v_context_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      '7C.9M.2 invariant failure: redemption disappeared before commit';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'replayed', false,
    'request_id', v_request_id,
    'tracking_ref', v_tracking_ref,
    'service_category', v_service_category,
    'service_code', v_service_code,
    'city', v_city,
    'status', 'new',
    'outcome_type', v_outcome_type,
    'amount_mad', p_amount_mad
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.confirm_estimator_request_diagnostic_v1(p_context_id text, p_outcome_type text, p_service_code text, p_session_id text, p_amount_mad numeric, p_city_slug text, p_client_phone text, p_description text, p_tracking_ref text, p_guest_token_hash text, p_offer_id uuid, p_diagnostic jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $wrapper$
 SELECT fixeo_private.diagnostic_confirm_request_core_v1(p_context_id,p_outcome_type,p_service_code,p_session_id,p_amount_mad,p_city_slug,p_client_phone,p_description,p_tracking_ref,p_guest_token_hash,p_offer_id,p_diagnostic);
$wrapper$;


CREATE FUNCTION public.create_diagnostic_quote_request_v1(p_diagnostic jsonb,p_client_phone text,p_tracking_ref text,
  p_guest_token_hash text,p_description text,p_service_category text,p_city_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx jsonb; request_id uuid; sr public.service_requests%ROWTYPE; city_label text;
BEGIN
  ctx:=fixeo_private.diagnostic_booking_context_v1(p_diagnostic,p_city_slug,NULL);
  IF p_client_phone IS NULL OR p_client_phone !~ '^([+]212|0)[5-7][0-9]{8}$'
    OR p_tracking_ref IS NULL OR p_tracking_ref !~ '^FX-[A-Z0-9-]{1,29}$'
    OR p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$'
    OR p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 1000
    OR p_service_category IS NULL OR p_service_category NOT IN ('plomberie','electricite','serrurerie','climatisation',
      'bricolage','menuiserie','peinture','maconnerie','nettoyage','jardinage','demenagement','carrelage','autre')
    THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_INPUT'; END IF;
  city_label := CASE p_city_slug
      WHEN 'casablanca'  THEN 'Casablanca'
      WHEN 'rabat'       THEN 'Rabat'
      WHEN 'marrakech'   THEN 'Marrakech'
      WHEN 'fes'         THEN 'Fès'
      WHEN 'tanger'      THEN 'Tanger'
      WHEN 'agadir'      THEN 'Agadir'
      WHEN 'meknes'      THEN 'Meknès'
      WHEN 'oujda'       THEN 'Oujda'
      WHEN 'kenitra'     THEN 'Kénitra'
      WHEN 'tetouan'     THEN 'Tétouan'
      WHEN 'sale'        THEN 'Salé'
      WHEN 'temara'      THEN 'Temara'
      WHEN 'el-jadida'   THEN 'El Jadida'
      WHEN 'beni-mellal' THEN 'Béni Mellal'
      WHEN 'nador'       THEN 'Nador'
      WHEN 'khouribga'   THEN 'Khouribga'
      WHEN 'safi'        THEN 'Safi'
      WHEN 'taza'        THEN 'Taza'
      WHEN 'ouarzazate'  THEN 'Ouarzazate'
      WHEN 'mohammedia'  THEN 'Mohammedia'
      ELSE NULL
    END;
  IF city_label IS NULL THEN RAISE EXCEPTION 'DIAGNOSTIC_INVALID_CITY'; END IF;
  IF ctx->>'request_id' IS NOT NULL THEN
    SELECT * INTO sr FROM public.service_requests WHERE id=(ctx->>'request_id')::uuid;
    IF sr.guest_token_hash IS DISTINCT FROM p_guest_token_hash THEN RAISE EXCEPTION 'DIAGNOSTIC_REQUEST_MISMATCH'; END IF;
    RETURN jsonb_build_object('ok',true,'id',sr.id,'request_id',sr.id,'ref',sr.tracking_ref,'tracking_ref',sr.tracking_ref,'replayed',true);
  END IF;
  -- Same canonical parent and existing AFTER INSERT dispatch. No separate dispatcher.
  INSERT INTO public.service_requests(service_category,city,description,client_phone,urgency,status,
    idempotency_key,tracking_ref,guest_token_hash,client_profile_id)
    VALUES(p_service_category,city_label,p_description,p_client_phone,ctx->>'urgency','new',
      'diagnostic-quote:'||(p_diagnostic->>'session_id'),p_tracking_ref,p_guest_token_hash,(ctx->>'client_profile_id')::uuid)
    RETURNING id INTO request_id;
  PERFORM fixeo_private.diagnostic_bind_v1(p_diagnostic,request_id,NULL,jsonb_build_object(
    'kind','quote','service_category',p_service_category,'urgency',ctx->>'urgency','urgency_provenance','ai_inferred',
    'qualification_answers',coalesce(p_diagnostic->'qualification_answers','[]')));
  RETURN jsonb_build_object('ok',true,'id',request_id,'request_id',request_id,'ref',p_tracking_ref,
    'tracking_ref',p_tracking_ref,'replayed',false);
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.diagnostic_booking_context_v1(jsonb,text,uuid),
 fixeo_private.diagnostic_bind_v1(jsonb,uuid,uuid,jsonb),
 fixeo_private.diagnostic_confirm_request_core_v1(text,text,text,text,numeric,text,text,text,text,text,uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.confirm_estimator_request_diagnostic_v1(text,text,text,text,numeric,text,text,text,text,text,uuid,jsonb),
 public.create_diagnostic_quote_request_v1(jsonb,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_estimator_request_diagnostic_v1(text,text,text,text,numeric,text,text,text,text,text,uuid,jsonb),
 public.create_diagnostic_quote_request_v1(jsonb,text,text,text,text,text,text) TO service_role;

DO $guard$
BEGIN
  IF md5(btrim(pg_get_functiondef('public.confirm_estimator_request_vap_v1(text,text,text,text,numeric,text,text,text,text,text,uuid)'::regprocedure), E' \t\r\n'))
    <> '8385d4401513eed11fe50300b1277933'
  THEN RAISE EXCEPTION 'Diagnostic booking precondition: canonical confirmation drift'; END IF;
END $guard$;

