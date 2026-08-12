-- ════════════════════════════════════════════════════════════
-- 7C.11E.2 — Mission Lifecycle RPCs
-- supabase/7c11e2-mission-lifecycle.sql
--
-- Creates/replaces 4 server-side RPCs:
--   1. decline_mission(p_mission_id uuid)
--   2. start_mission(p_mission_id uuid)
--   3. complete_mission(p_mission_id uuid)
--   4. get_accepted_mission_detail(p_mission_id uuid) — extended with request_status
--
-- SECURITY MODEL (all 4 RPCs):
--   SECURITY DEFINER + SET search_path = ''
--   Identity: auth.uid() → artisans.owner_user_id → artisans.id
--   NO phone fallback. NO caller-supplied artisan identity.
--   REVOKE FROM PUBLIC + anon. GRANT TO authenticated.
--
-- TYPE CONTRACT:
--   missions.request_id = TEXT
--   service_requests.id = UUID
--   Cross-table join: m.request_id = sr.id::text (explicit cast, UUID side)
--   NEVER cast missions.request_id to UUID.
--
-- ARTISAN AUTHORITY CEILING:
--   offered → declined (decline_mission)
--   offered → pending  (claim_mission — 7C.11C, unchanged)
--   pending/assigned → in_progress (start_mission)
--   in_progress → done/completed (complete_mission)
--   validated: READ ONLY — artisan cannot set validated
--
-- Run 7c11e2-mission-lifecycle-precheck.sql first.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- BLOCK 1 — decline_mission(p_mission_id uuid)
--
-- Transitions offered mission to declined.
-- Leaves service_request status=new (available for re-dispatch).
-- Does NOT dispatch another artisan.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decline_mission(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;    -- TEXT: matches missions.request_id live type
  v_mission_status  text;
  v_mission_artisan uuid;
  v_sr_status       text;
  v_rows_updated    integer;
BEGIN

  -- Guard 0: authenticated caller required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 1: resolve canonical artisan identity via owner_user_id only
  -- No phone fallback. No caller-supplied artisan id.
  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  -- Guard 2: mission must exist
  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  -- Guard 3: mission must belong to this artisan
  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  -- Guard 4: mission must be in 'offered' status
  IF v_mission_status != 'offered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered');
  END IF;

  -- Guard 5: linked service_request must still be dispatchable (status=new)
  -- TYPE CONTRACT: sr.id is UUID; v_request_id is TEXT — cast UUID side explicitly
  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND OR v_sr_status != 'new' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_dispatchable');
  END IF;

  -- Atomic: transition mission offered → declined
  -- service_request remains 'new' (available for re-dispatch to another artisan)
  UPDATE public.missions m
  SET    m.status = 'declined'
  WHERE  m.id     = p_mission_id
    AND  m.status = 'offered';          -- predicate lock: only if still offered

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Another concurrent caller already transitioned this mission
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered');
  END IF;

  -- Do NOT dispatch another artisan here.
  -- Do NOT create another offered mission here.
  -- The service_request remains status='new' — re-dispatch is a server-side
  -- operation handled by 7C.11F dispatch engine.

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[decline_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.decline_mission(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2 — start_mission(p_mission_id uuid)
--
-- Transitions service_request assigned → in_progress.
-- mission.status remains 'pending' (no missions.in_progress invented).
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.start_mission(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;    -- TEXT: matches missions.request_id live type
  v_mission_status  text;
  v_mission_artisan uuid;
  v_sr_status       text;
  v_rows_updated    integer;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  -- Mission must be in accepted/pending state
  IF v_mission_status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted');
  END IF;

  -- Check linked request status
  -- TYPE CONTRACT: sr.id UUID vs v_request_id TEXT — cast UUID side
  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  -- Idempotent: already in_progress is a stable success
  IF v_sr_status = 'in_progress' THEN
    RETURN jsonb_build_object('ok', true, 'mission_id', p_mission_id, 'already_started', true);
  END IF;

  IF v_sr_status != 'assigned' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  -- Atomic: transition service_request assigned → in_progress
  -- mission.status stays 'pending' — no missions.in_progress status
  UPDATE public.service_requests sr
  SET    sr.status = 'in_progress'
  WHERE  sr.id::text = v_request_id    -- TYPE CONTRACT: UUID::text = TEXT
    AND  sr.status   = 'assigned';     -- predicate lock

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_started');
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[start_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.start_mission(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3 — complete_mission(p_mission_id uuid)
--
-- Transitions: mission pending→done, request in_progress→completed.
-- Artisan CANNOT set validated. That is client/admin authority.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;    -- TEXT: matches missions.request_id live type
  v_mission_status  text;
  v_mission_artisan uuid;
  v_sr_status       text;
  v_rows_m          integer;
  v_rows_sr         integer;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  IF v_mission_status = 'done' THEN
    RETURN jsonb_build_object('ok', true, 'mission_id', p_mission_id, 'already_completed', true);
  END IF;

  IF v_mission_status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started');
  END IF;

  -- Verify request is in_progress
  -- TYPE CONTRACT: sr.id UUID vs v_request_id TEXT — cast UUID side
  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  IF v_sr_status != 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started');
  END IF;

  -- Atomic: transition mission pending → done
  UPDATE public.missions m
  SET    m.status = 'done'
  WHERE  m.id     = p_mission_id
    AND  m.status = 'pending';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  IF v_rows_m = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;

  -- Atomic: transition service_request in_progress → completed
  -- TYPE CONTRACT: sr.id UUID vs v_request_id TEXT — cast UUID side
  UPDATE public.service_requests sr
  SET    sr.status = 'completed'
  WHERE  sr.id::text = v_request_id    -- TYPE CONTRACT
    AND  sr.status   = 'in_progress';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  -- sr update may return 0 if already raced — mission.done is committed;
  -- non-fatal but logged.
  IF v_rows_sr = 0 THEN
    RAISE WARNING '[complete_mission] mission=% set done; sr update returned 0 rows (status may have raced)', p_mission_id;
  END IF;

  -- ARTISAN AUTHORITY CEILING:
  -- Status 'validated' is client/admin territory ONLY.
  -- This function will never set mission.status = 'validated'.
  -- It will never set service_requests.status = 'validated'.

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[complete_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- BLOCK 4 — get_accepted_mission_detail(p_mission_id uuid) EXTENDED
--
-- Extends 7C.11C version with:
--   request_status: current service_requests.status
--
-- Used by dashboard to drive lifecycle UI state accurately.
-- All existing privacy/auth rules preserved.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_accepted_mission_detail(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artisan_id     uuid;
  v_mission_status text;
  v_artisan_match  uuid;
  v_result         jsonb;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.status, m.artisan_profile_id
  INTO   v_mission_status, v_artisan_match
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_artisan_match != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  -- Privacy gate: contact + description only after acceptance
  -- offered / declined / expired / cancelled → blocked
  IF v_mission_status NOT IN ('pending', 'done', 'validated') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted_yet');
  END IF;

  -- Extended: now includes request_status for lifecycle UI
  -- TYPE CONTRACT: m.request_id TEXT, sr.id UUID — cast UUID side
  SELECT jsonb_build_object(
    'ok',               true,
    'mission_id',       m.id,
    'mission_status',   m.status,
    'request_status',   sr.status,        -- NEW: added in 7C.11E.2
    'accepted_at',      m.accepted_at,
    'agreed_price',     m.agreed_price,
    'service_category', sr.service_category,
    'city',             sr.city,
    'urgency',          sr.urgency,
    'description',      sr.description,
    'client_phone',     sr.client_phone
  )
  INTO v_result
  FROM   public.missions         m
  JOIN   public.service_requests sr ON m.request_id = sr.id::text
  WHERE  m.id = p_mission_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_found');
  END IF;

  RETURN v_result;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_accepted_mission_detail(uuid) TO authenticated;
