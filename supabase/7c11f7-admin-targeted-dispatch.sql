-- ============================================================
-- FIXEO — ADMIN TARGETED DISPATCH V1
-- Phase 7C.11F.7
--
-- Purpose:
--   Allow a server-authenticated Admin workflow to target one
--   specific artisan for a service_request.
--
-- IMPORTANT:
--   - Browser MUST NOT call this RPC directly.
--   - service_role only.
--   - service_request remains status='new'.
--   - Only claim_mission() may transition request → assigned.
--   - Existing active offered mission is expired when Admin
--     deliberately targets another artisan.
--   - If the new targeted dispatch fails, all mutations rollback.
-- ============================================================

BEGIN;


CREATE OR REPLACE FUNCTION public.admin_targeted_dispatch_v1(
  p_request_id uuid,
  p_artisan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id_text         text;
  v_sr_status               text;

  v_artisan_exists          uuid;

  v_pending_mission_id      uuid;

  v_existing_offer_id       uuid;
  v_existing_offer_artisan  uuid;

  v_dispatch_result         jsonb;
  v_dispatch_reason         text;

  v_new_mission_id          uuid;
  v_new_mission_artisan     uuid;

  v_rows_updated            integer;
  v_fail_reason             text;
BEGIN

  -- ── GUARD 0: required parameters ──────────────────────────
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'request_id_required'
    );
  END IF;

  IF p_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_id_required'
    );
  END IF;

  v_request_id_text := p_request_id::text;


  -- ── GUARD 1: lock canonical service_request ───────────────
  SELECT sr.status
  INTO   v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'request_not_found'
    );
  END IF;


  -- Admin targeted dispatch applies only before acceptance.
  IF v_sr_status != 'new' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'request_not_dispatchable',
      'status', v_sr_status
    );
  END IF;


  -- ── GUARD 2: target artisan must exist ────────────────────
  SELECT a.id
  INTO   v_artisan_exists
  FROM   public.artisans a
  WHERE  a.id = p_artisan_id
  LIMIT  1;

  IF v_artisan_exists IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_not_found'
    );
  END IF;


  -- ── GUARD 3: no accepted winner may already exist ─────────
  SELECT m.id
  INTO   v_pending_mission_id
  FROM   public.missions m
  WHERE  m.request_id = v_request_id_text
    AND  m.status = 'pending'
  LIMIT  1
  FOR UPDATE;

  IF v_pending_mission_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_claimed',
      'mission_id', v_pending_mission_id
    );
  END IF;


  -- ── STEP 4: find current active offer, if any ──────────────
  SELECT
    m.id,
    m.artisan_profile_id
  INTO
    v_existing_offer_id,
    v_existing_offer_artisan
  FROM public.missions m
  WHERE m.request_id = v_request_id_text
    AND m.status = 'offered'
  LIMIT 1
  FOR UPDATE;


  -- ==========================================================
  -- ATOMIC MUTATION BLOCK
  --
  -- Any exception inside this block rolls back:
  --   - old offer expiration
  --   - target_artisan_id mutation
  --   - mission created by dispatch_request_v1()
  --
  -- Therefore a failed replacement never destroys the
  -- previously valid offer.
  -- ==========================================================

  BEGIN

    -- ── STEP 5A: same artisan already has active offer ───────
    --
    -- Idempotent Admin action.
    -- Record the explicit target but DO NOT create another mission.

    IF v_existing_offer_id IS NOT NULL
       AND v_existing_offer_artisan = p_artisan_id THEN

      UPDATE public.service_requests
      SET target_artisan_id = p_artisan_id
      WHERE id = p_request_id;

      RETURN jsonb_build_object(
        'ok', true,
        'reason', 'existing_target_offer',
        'request_id', p_request_id,
        'artisan_id', p_artisan_id,
        'mission_id', v_existing_offer_id
      );
    END IF;


    -- ── STEP 5B: expire previous offer when changing artisan ─
    IF v_existing_offer_id IS NOT NULL THEN

      UPDATE public.missions
      SET status = 'expired'
      WHERE id = v_existing_offer_id
        AND status = 'offered';

      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

      IF v_rows_updated != 1 THEN
        v_fail_reason := 'offer_conflict';

        RAISE EXCEPTION
          'admin_targeted_dispatch_v1: active offer transition conflict'
          USING ERRCODE = 'P0001';
      END IF;

    END IF;


    -- ── STEP 6: persist explicit Admin target ────────────────
    UPDATE public.service_requests
    SET target_artisan_id = p_artisan_id
    WHERE id = p_request_id
      AND status = 'new';

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated != 1 THEN
      v_fail_reason := 'request_conflict';

      RAISE EXCEPTION
        'admin_targeted_dispatch_v1: request no longer dispatchable'
        USING ERRCODE = 'P0001';
    END IF;


    -- ── STEP 7: canonical dispatch engine ────────────────────
    --
    -- dispatch_request_v1() sees target_artisan_id and therefore
    -- restricts candidate selection to p_artisan_id.
    --
    -- It retains all canonical eligibility checks:
    -- availability, service, city/zone, prior mission exclusion,
    -- unique-offer protection, etc.

    v_dispatch_result :=
      public.dispatch_request_v1(p_request_id);


    IF COALESCE(v_dispatch_result ->> 'ok', 'false') != 'true' THEN

      v_fail_reason :=
        COALESCE(
          v_dispatch_result ->> 'reason',
          'dispatch_failed'
        );

      RAISE EXCEPTION
        'admin_targeted_dispatch_v1: targeted dispatch failed: %',
        v_fail_reason
        USING ERRCODE = 'P0001';

    END IF;


    -- ── STEP 8: verify persisted mission ─────────────────────
    --
    -- Never trust ok=true alone.
    -- Verify that the returned mission is actually:
    --   offered
    --   linked to this request
    --   linked to the exact Admin-selected artisan.

    BEGIN
      v_new_mission_id :=
        (v_dispatch_result ->> 'mission_id')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_new_mission_id := NULL;
    END;


    IF v_new_mission_id IS NULL THEN
      v_fail_reason := 'invalid_dispatch_result';

      RAISE EXCEPTION
        'admin_targeted_dispatch_v1: dispatch returned no valid mission_id'
        USING ERRCODE = 'P0001';
    END IF;


    SELECT m.artisan_profile_id
    INTO   v_new_mission_artisan
    FROM   public.missions m
    WHERE  m.id = v_new_mission_id
      AND  m.request_id = v_request_id_text
      AND  m.status = 'offered';

    IF NOT FOUND
       OR v_new_mission_artisan IS DISTINCT FROM p_artisan_id THEN

      v_fail_reason := 'target_verification_failed';

      RAISE EXCEPTION
        'admin_targeted_dispatch_v1: persisted offer does not match requested artisan'
        USING ERRCODE = 'P0001';

    END IF;


    -- ── SUCCESS ──────────────────────────────────────────────
    --
    -- Canonical state now:
    --   service_requests.status            = new
    --   service_requests.target_artisan_id = selected artisan
    --   missions.status                    = offered
    --
    -- claim_mission() remains the ONLY authority that transitions:
    --   service_requests new      → assigned
    --   missions         offered  → pending

    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'targeted_dispatched',
      'request_id', p_request_id,
      'artisan_id', p_artisan_id,
      'mission_id', v_new_mission_id,
      'replaced_mission_id', v_existing_offer_id,
      'dispatch', v_dispatch_result
    );


  EXCEPTION

    -- Expected controlled rollback.
    WHEN SQLSTATE 'P0001' THEN

      RETURN jsonb_build_object(
        'ok', false,
        'reason', COALESCE(v_fail_reason, 'dispatch_failed'),
        'request_id', p_request_id,
        'artisan_id', p_artisan_id
      );


    -- Unexpected failure.
    -- Because this is an EXCEPTION block, PostgreSQL rolls back
    -- every mutation performed inside the atomic block above.
    WHEN OTHERS THEN

      RAISE WARNING
        '[admin_targeted_dispatch_v1] unexpected error: %',
        SQLERRM;

      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'internal_error',
        'request_id', p_request_id,
        'artisan_id', p_artisan_id
      );

  END;

END;
$$;


-- ============================================================
-- PERMISSIONS
--
-- Browser roles MUST NEVER execute this RPC.
-- Admin authentication is performed by the Vercel server API,
-- which then calls this RPC with SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.admin_targeted_dispatch_v1(uuid, uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.admin_targeted_dispatch_v1(uuid, uuid)
FROM anon;

REVOKE EXECUTE
ON FUNCTION public.admin_targeted_dispatch_v1(uuid, uuid)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_targeted_dispatch_v1(uuid, uuid)
TO service_role;


COMMIT;
