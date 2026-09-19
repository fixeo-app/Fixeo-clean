-- ============================================================
-- FIXEO — 7C.9M.2 Estimator Verified Request Confirmation
-- File: supabase/7c9m2-estimator-request-confirmation.sql
--
-- PURPOSE
-- -------
-- Atomically convert ONE server-verified Estimator pricing context
-- into ONE canonical service_request after explicit client confirmation.
--
-- Canonical flow:
--   sealed pricing_context_token
--     -> server-side token verification
--     -> mandatory Moroccan phone
--     -> stable server-generated guest tracking credentials
--     -> confirm_estimator_request_v1(...)
--          [single PostgreSQL transaction]
--          estimator_context_redemptions
--            + service_requests
--            + estimator context -> request binding
--     -> COMMIT
--     -> dispatch is triggered separately by server code
--
-- SECURITY / AUTHORITY
-- --------------------
-- - Browser NEVER calls this RPC.
-- - EXECUTE is service_role only.
-- - The RPC does NOT decrypt or verify browser tokens.
--   Its identity/price parameters MUST come from the already verified,
--   server-side pricing authority.
-- - service_category is derived here from canonical service_code.
-- - Canonical amount is persisted in estimator_context_redemptions.amount_mad.
-- - No dispatch_* function is called by this RPC.
--
-- ATOMICITY
-- ---------
-- A successful call commits together:
--   1. estimator context acquisition / validation
--   2. canonical service_request creation
--   3. estimator_context_redemptions.service_request_id binding
--   4. estimator redemption transition to committed
--
-- Any database error aborts the complete call.
--
-- REPLAY / DOUBLE-SUBMIT
-- ----------------------
-- context_id remains the primary idempotency boundary.
-- service_requests.idempotency_key also receives estimator:<context_id>.
-- Concurrent calls serialize on the redemption row with FOR UPDATE.
-- Once committed, a replay returns the SAME request_id/tracking_ref
-- and never creates a second request.
--
-- IMPORTANT
-- ---------
-- - Requires 7C.9M.1 already deployed.
-- - Does NOT dispatch artisans.
-- - Does NOT modify estimator pricing.
-- - Does NOT expose phone or guest_token_hash in its JSON response.
-- - Do NOT run in production until static audit passes and explicit
--   production authorization is given.
-- ============================================================

BEGIN;

DO $pre$
DECLARE
  v_fn regprocedure;
BEGIN
  IF pg_catalog.to_regclass('public.estimator_context_redemptions') IS NULL THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: public.estimator_context_redemptions is missing';
  END IF;

  IF pg_catalog.to_regclass('public.service_requests') IS NULL THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: public.service_requests is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'estimator_context_redemptions'
      AND c.column_name = 'service_request_id'
      AND c.udt_name = 'uuid'
      AND c.is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: 7C.9M.1 service_request_id binding is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'public.estimator_context_redemptions'::regclass
      AND con.conname = 'estimator_context_redemptions_service_request_fk'
      AND con.contype = 'f'
  ) THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: estimator request binding FK is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = 'service_requests'
      AND i.indexname = 'service_requests_idempotency_key_unique'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: service_requests idempotency unique index is missing';
  END IF;

  v_fn := pg_catalog.to_regprocedure(
    'public.confirm_estimator_request_v1(text,text,text,text,integer,text,text,text,text,text)'
  );

  IF v_fn IS NOT NULL THEN
    RAISE EXCEPTION
      '7C.9M.2 ABORT: confirm_estimator_request_v1 already exists';
  END IF;
END;
$pre$;

CREATE FUNCTION public.confirm_estimator_request_v1(
  p_context_id       text,
  p_outcome_type     text,
  p_service_code     text,
  p_session_id       text,
  p_amount_mad       integer,
  p_city_slug        text,
  p_client_phone     text,
  p_description      text,
  p_tracking_ref     text,
  p_guest_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
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
  v_existing_amount_mad   integer;
  v_existing_state        text;
  v_existing_request_id   uuid;

  v_request_id              uuid;
  v_existing_tracking_ref   text;
  v_existing_request_status text;
  v_existing_guest_hash     text;
BEGIN
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
        'menuiserie'
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
    guest_token_hash
  )
  VALUES (
    v_service_category,
    v_city,
    v_description,
    v_phone,
    'normale',
    'new',
    v_idempotency_key,
    v_tracking_ref,
    v_guest_token_hash
  )
  RETURNING id
  INTO v_request_id;

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
$fn$;

ALTER FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
OWNER TO postgres;

REVOKE ALL ON FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
FROM anon;

REVOKE ALL ON FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
FROM authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
TO service_role;

COMMENT ON FUNCTION public.confirm_estimator_request_v1(
  text, text, text, text, integer,
  text, text, text, text, text
)
IS
  '7C.9M.2 server-only atomic Estimator confirmation. '
  'Consumes one server-verified pricing context, creates one canonical '
  'service_request with mandatory phone + guest tracking credentials, '
  'binds estimator_context_redemptions.service_request_id, and commits '
  'the redemption. Does not dispatch artisans. EXECUTE: service_role only.';

COMMIT;
