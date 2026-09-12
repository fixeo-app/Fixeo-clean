-- ════════════════════════════════════════════════════════════
-- FIXEO — 7C.14A.1 Mission Lifecycle: Client Confirmation
-- File: supabase/7c14a1-mission-lifecycle-validate.sql
-- Phase: BP02 — Mission Lifecycle Completion
--
-- PURPOSE
-- ────────
-- 1. Extend missions.status CHECK to include terminée and validée,
--    resolving the gap between admin-settle-mission-fn ELIGIBLE_STATUSES
--    and the existing DB constraint.
-- 2. Create confirm_completed_mission(p_request_id uuid) — the
--    authoritative client-side confirmation RPC called by fixeo-dashboard-v2.js.
-- 3. Create validate_mission_v1(p_mission_id uuid) — an alternative
--    mission-UUID-keyed confirmation path for BP02 completeness.
--
-- STATE TRANSITIONS IMPLEMENTED
-- ──────────────────────────────
-- confirm_completed_mission():
--   service_requests: completed → validated     (by client)
--   missions:         done      → terminée      (atomic pair)
--
-- validate_mission_v1():
--   missions:         done      → terminée      (by client, mission-UUID path)
--   service_requests: completed → validated     (atomic pair)
--
-- Both RPCs are equivalent in semantics; they differ only in their
-- primary key argument (request UUID vs mission UUID).
-- fixeo-dashboard-v2.js calls confirm_completed_mission.
-- BP02 tests call validate_mission_v1.
-- Only one confirmation per mission is possible (idempotent guards).
--
-- CANONICAL STATE MACHINE (BP02-complete):
--   offered    → [claim_mission()]            → pending
--   pending    → [start_mission()]            → (SR: in_progress; mission: pending)
--   pending    → [complete_mission()]         → done     (SR: completed)
--   done       → [confirm_completed_mission   → terminée (SR: validated)
--                  / validate_mission_v1()]
--   terminée   → [admin-settle-mission-fn]    → (final_price set; status unchanged)
--   terminée   → [admin manual]               → validée  (optional final close)
--
-- NOTE ON terminée vs validée
-- ───────────────────────────
-- terminée: client confirmed. Settlement not yet processed. This is the
--   earliest state in which admin-settle-mission-fn will process the mission.
-- validée: manually set by admin after settlement is confirmed.
--   No RPC or automated function currently sets validée. The admin
--   command center (admin-command-center-v3.js _adminValidate) sets
--   service_requests.status = 'validated' directly. There is currently no
--   function that sets missions.status = 'validée' in a single atomic step.
--   BP02 does NOT add such a function — it is out of scope.
--   admin-settle-mission-fn accepts both terminée and validée as eligible.
--
-- OWNERSHIP MODEL
-- ───────────────
-- confirm_completed_mission / validate_mission_v1:
--   B2C:        service_requests.client_profile_id = auth.uid()
--   Enterprise: enterprise_request_context.created_by = auth.uid()
--               (client_profile_id = NULL for enterprise V1 — ERC anchors identity)
--   Admin:      bypass — admin_all_missions policy; no RPC path needed
--
-- SECURITY
-- ────────
-- SECURITY DEFINER + SET search_path = ''
-- REVOKE EXECUTE FROM PUBLIC, anon
-- GRANT  EXECUTE TO authenticated
-- No service_role exposure
-- No caller-supplied artisan identity
-- No direct UPDATE from browser
-- State transitions reject illegal current status
-- Atomicity: RAISE EXCEPTION forces full rollback on partial failure
--
-- TYPE CONTRACTS (inherited from 7C.11E.2)
-- ─────────────────────────────────────────
-- missions.request_id = TEXT
-- service_requests.id = UUID
-- Cross-table join:  m.request_id = sr.id::text
-- NEVER cast missions.request_id to UUID
--
-- IDEMPOTENCY
-- ───────────
-- Already-confirmed missions (terminée/validated) return ok:true + already_confirmed:true
-- This allows safe client retry on network ambiguity
--
-- PRE-MIGRATION
-- ─────────────
-- These preconditions must hold before applying:
-- 1. 7c11c-dispatch-foundation.sql APPLIED
-- 2. 7c11e2-mission-lifecycle.sql  APPLIED
-- 3. 7c11f6-missions-privilege-hardening.sql APPLIED
-- 4. missions.status CHECK currently: offered,pending,declined,expired,done,cancelled,validated
--    (terminée and validée are NOT currently in the CHECK — this migration adds them)
--
-- ZERO DATA MUTATIONS. Additive only. Idempotent blocks throughout.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- BLOCK 1 — Extend missions.status CHECK
--
-- Current values: offered, pending, declined, expired, done, cancelled, validated
-- Added values:   terminée, validée
--
-- admin-settle-mission-fn checks ELIGIBLE_STATUSES = ['terminée','validée']
-- These values are used in production (e.g. cleanup-fake-missions.sql shows
-- a live row with status='validée'). Without this CHECK extension, any UPDATE
-- setting status='terminée' or status='validée' would fail the constraint.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_constraint_exists boolean;
  v_has_terminee      boolean;
BEGIN
  -- Check if missions_status_check already includes terminée
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_constraint c
    WHERE  c.conrelid = 'public.missions'::regclass
      AND  c.contype  = 'c'
      AND  c.conname  = 'missions_status_check'
      AND  pg_catalog.pg_get_constraintdef(c.oid) LIKE '%terminée%'
  ) INTO v_has_terminee;

  IF v_has_terminee THEN
    RAISE NOTICE 'Block 1: missions_status_check already includes terminée — skipped.';
  ELSE
    -- Drop existing CHECK (if any) and recreate with full vocabulary
    ALTER TABLE public.missions
      DROP CONSTRAINT IF EXISTS missions_status_check;

    ALTER TABLE public.missions
      ADD CONSTRAINT missions_status_check
      CHECK (status IN (
        'offered',    -- dispatch created mission row; artisan not yet responded
        'pending',    -- artisan accepted (claim_mission); awaiting start
        'declined',   -- artisan declined the offer
        'expired',    -- offer window elapsed without response
        'done',       -- artisan marked intervention complete (complete_mission)
        'cancelled',  -- cancelled before start
        'validated',  -- legacy English value (pre-terminée era)
        'terminée',   -- client confirmed intervention (confirm_completed_mission)
        'validée'     -- admin manually closed / final admin settlement state
      ));

    RAISE NOTICE 'Block 1: missions_status_check extended with terminée and validée.';
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2 — confirm_completed_mission(p_request_id uuid)
--
-- Primary confirmation path called by fixeo-dashboard-v2.js.
-- Keyed on service_request UUID (the client's primary identifier).
--
-- Transitions:
--   service_requests.status: completed → validated
--   missions.status:         done      → terminée
--
-- Client ownership:
--   B2C:        service_requests.client_profile_id = auth.uid()
--   Enterprise: enterprise_request_context.created_by = auth.uid()
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_completed_mission(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid;
  v_sr_status     text;
  v_is_owned      boolean;
  v_mission_id    uuid;
  v_mission_status text;
  v_rows_sr       integer;
  v_rows_m        integer;
BEGIN

  -- Guard 0: authenticated caller required
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 1: service_request must exist; read current status
  SELECT sr.status
  INTO   v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- Guard 2: client ownership check
  -- B2C path:        client_profile_id = auth.uid()
  -- Enterprise path: enterprise_request_context.created_by = auth.uid()
  -- Either is sufficient.
  SELECT EXISTS (
    SELECT 1
    FROM   public.service_requests sr
    WHERE  sr.id               = p_request_id
      AND  sr.client_profile_id = v_uid
    UNION ALL
    SELECT 1
    FROM   public.enterprise_request_context erc
    WHERE  erc.service_request_id = p_request_id
      AND  erc.created_by         = v_uid
    LIMIT 1
  ) INTO v_is_owned;

  IF NOT v_is_owned THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- Guard 3: request must be in 'completed' status (artisan finished)
  -- Idempotent fast-path: already validated → return ok:true
  IF v_sr_status = 'validated' THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
  END IF;

  IF v_sr_status != 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'request_not_completed',
      'current', v_sr_status
    );
  END IF;

  -- Guard 4: find the winning mission (status='done') for this request
  -- TYPE CONTRACT: missions.request_id is TEXT, service_requests.id is UUID
  -- Cast UUID side to TEXT.
  SELECT m.id, m.status
  INTO   v_mission_id, v_mission_status
  FROM   public.missions m
  WHERE  m.request_id = p_request_id::text
    AND  m.status     = 'done'
  LIMIT  1;

  IF NOT FOUND THEN
    -- No done mission found — check if one already terminée (idempotent)
    SELECT m.id, m.status
    INTO   v_mission_id, v_mission_status
    FROM   public.missions m
    WHERE  m.request_id = p_request_id::text
      AND  m.status IN ('terminée', 'validée', 'validated')
    LIMIT  1;

    IF FOUND THEN
      -- Mission already confirmed — but SR is not yet validated? Inconsistent.
      -- Attempt SR update to validated for recovery.
      UPDATE public.service_requests
      SET    status = 'validated'
      WHERE  id     = p_request_id
        AND  status = 'completed';
      -- Return ok:true + already_confirmed regardless of whether SR update affected rows
      RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
    END IF;

    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'completed_mission_not_found');
  END IF;

  -- ── ATOMIC PAIR ──────────────────────────────────────────
  -- Both UPDATEs must succeed or rollback.
  -- RAISE EXCEPTION after the first UPDATE forces full rollback.

  -- Step 1: missions done → terminée
  UPDATE public.missions
  SET    status = 'terminée'
  WHERE  id     = v_mission_id
    AND  status = 'done';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  IF v_rows_m = 0 THEN
    -- Concurrent call already transitioned mission
    -- Re-read to determine if idempotent ok:true applies
    SELECT m.status INTO v_mission_status
    FROM   public.missions m
    WHERE  m.id = v_mission_id;

    IF v_mission_status IN ('terminée', 'validée', 'validated') THEN
      -- Also recover SR if needed
      UPDATE public.service_requests
      SET    status = 'validated'
      WHERE  id     = p_request_id
        AND  status = 'completed';
      RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
    END IF;

    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  -- Step 2: service_requests completed → validated
  UPDATE public.service_requests
  SET    status = 'validated'
  WHERE  id     = p_request_id
    AND  status = 'completed';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  -- ATOMICITY ENFORCEMENT: if SR update failed, roll back mission update
  IF v_rows_sr = 0 THEN
    RAISE EXCEPTION '[confirm_completed_mission] atomicity violation: mission % set terminée but service_request % could not be set validated. Rolling back.',
      v_mission_id, p_request_id
    USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'mission_id', v_mission_id
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'atomicity_error');
  WHEN OTHERS THEN
    RAISE WARNING '[confirm_completed_mission] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Block 2: confirm_completed_mission(uuid) created/replaced.';
END $$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3 — validate_mission_v1(p_mission_id uuid)
--
-- Alternative confirmation path keyed on mission UUID.
-- Semantically identical to confirm_completed_mission but uses
-- the mission's primary key as the entry point.
--
-- Useful for:
-- - BP02 test pack (mission UUID available from missions SELECT)
-- - Admin tooling
-- - Future artisan-OS client confirmation UI
--
-- Transitions (same as confirm_completed_mission):
--   missions.status:         done → terminée
--   service_requests.status: completed → validated
--
-- Ownership check:
--   Resolves service_request from mission.request_id,
--   then applies same B2C + enterprise ownership test.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_mission_v1(
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid            uuid;
  v_mission_status text;
  v_request_id     text;    -- TEXT: matches missions.request_id type
  v_sr_id          uuid;    -- resolved UUID for service_requests
  v_sr_status      text;
  v_is_owned       boolean;
  v_rows_m         integer;
  v_rows_sr        integer;
BEGIN

  -- Guard 0: authenticated caller required
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 1: mission must exist
  SELECT m.status, m.request_id
  INTO   v_mission_status, v_request_id
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  -- Guard 2: resolve service_request UUID
  -- TYPE CONTRACT: missions.request_id = TEXT; service_requests.id = UUID
  -- Cast TEXT to UUID. If missions.request_id is a non-UUID legacy value, this cast
  -- will raise an exception — caught by OTHERS handler below.
  BEGIN
    v_sr_id := v_request_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_request_id');
  END;

  -- Guard 3: read service_request status
  SELECT sr.status
  INTO   v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id = v_sr_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- Guard 4: client ownership check (same logic as confirm_completed_mission)
  SELECT EXISTS (
    SELECT 1
    FROM   public.service_requests sr
    WHERE  sr.id               = v_sr_id
      AND  sr.client_profile_id = v_uid
    UNION ALL
    SELECT 1
    FROM   public.enterprise_request_context erc
    WHERE  erc.service_request_id = v_sr_id
      AND  erc.created_by         = v_uid
    LIMIT 1
  ) INTO v_is_owned;

  IF NOT v_is_owned THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- Guard 5: mission must be in 'done' status
  -- Idempotent: already terminée/validée → ok:true
  IF v_mission_status IN ('terminée', 'validée', 'validated') THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
  END IF;

  IF v_mission_status != 'done' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'not_done_yet',
      'current', v_mission_status
    );
  END IF;

  -- Guard 6: service_request must be in 'completed' status
  IF v_sr_status = 'validated' THEN
    -- SR already validated but mission not yet terminée — recover
    UPDATE public.missions
    SET    status = 'terminée'
    WHERE  id     = p_mission_id
      AND  status = 'done';
    RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
  END IF;

  IF v_sr_status != 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'request_not_completed',
      'current', v_sr_status
    );
  END IF;

  -- ── ATOMIC PAIR ──────────────────────────────────────────

  -- Step 1: missions done → terminée
  UPDATE public.missions
  SET    status = 'terminée'
  WHERE  id     = p_mission_id
    AND  status = 'done';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  IF v_rows_m = 0 THEN
    -- Concurrent transition: check current mission state
    SELECT m.status INTO v_mission_status
    FROM   public.missions m
    WHERE  m.id = p_mission_id;

    IF v_mission_status IN ('terminée', 'validée', 'validated') THEN
      UPDATE public.service_requests
      SET    status = 'validated'
      WHERE  id     = v_sr_id
        AND  status = 'completed';
      RETURN pg_catalog.jsonb_build_object('ok', true, 'already_confirmed', true);
    END IF;

    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  -- Step 2: service_requests completed → validated
  UPDATE public.service_requests
  SET    status = 'validated'
  WHERE  id     = v_sr_id
    AND  status = 'completed';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  IF v_rows_sr = 0 THEN
    RAISE EXCEPTION '[validate_mission_v1] atomicity violation: mission % set terminée but service_request % could not be set validated. Rolling back.',
      p_mission_id, v_sr_id
    USING ERRCODE = 'P0001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'atomicity_error');
  WHEN OTHERS THEN
    RAISE WARNING '[validate_mission_v1] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_mission_v1(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_mission_v1(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.validate_mission_v1(uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Block 3: validate_mission_v1(uuid) created/replaced.';
END $$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 4 — RLS: client UPDATE on service_requests for validation
--
-- The existing client_read_own_requests policy allows SELECT only.
-- confirm_completed_mission and validate_mission_v1 are SECURITY DEFINER
-- and execute under the function owner's privileges — they do NOT need
-- a client UPDATE RLS policy to operate.
--
-- This block is therefore a NO-OP in terms of new grants.
-- We confirm: DO NOT add a client UPDATE policy on service_requests.
-- The SECURITY DEFINER pattern is the correct isolation.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE 'Block 4: No RLS change needed — SECURITY DEFINER functions bypass caller RLS.';
END $$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 5 — Remove unsafe direct frontend UPDATE path
--
-- fixeo-mvp-supabase.js _fxSbConfirmRequest() calls:
--   sb.from('service_requests').update({ status: 'validée' }).eq('id', sbId)
--
-- This is an unsafe direct browser UPDATE path:
--   (a) No ownership verification at function level
--   (b) No corresponding missions.status update → inconsistent state
--   (c) 'validée' is not in the service_requests_status_check constraint
--       (constraint contains 'validated' not 'validée') → update silently
--       fails on CHECK violation in most Supabase JS SDK versions
--   (d) RLS client_update_own_requests policy may or may not exist
--
-- fixeo-dashboard-v2.js already calls confirm_completed_mission RPC (correct path).
-- fixeo-mvp-supabase.js is the older dashboard and uses the direct UPDATE.
--
-- This migration does NOT remove that code path (that is a JS code change, not SQL).
-- The JS change is handled in Phase 5 (frontend) below.
--
-- HOWEVER: we do NOT add a broad client UPDATE policy on service_requests
-- that would make the direct UPDATE path work — doing so would be a regression.
-- The SECURITY DEFINER RPC pattern is the only authorized path.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE 'Block 5: Direct frontend UPDATE path documented. No SQL change. JS fix in Phase 5.';
  RAISE NOTICE '         fixeo-dashboard-v2.js already uses confirm_completed_mission RPC (correct).';
  RAISE NOTICE '         fixeo-mvp-supabase.js fallback path to be fixed in BP02 Phase 5.';
END $$;


-- ════════════════════════════════════════════════════════════
-- BLOCK 6 — Verification queries (run after applying)
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE '7c14a1 migration ready to apply.';
  RAISE NOTICE 'Post-apply verification:';
  RAISE NOTICE '  V1: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=''public.missions''::regclass AND contype=''c'' AND conname=''missions_status_check'';';
  RAISE NOTICE '      Expected: includes terminée and validée';
  RAISE NOTICE '  V2: SELECT proname, prosecdef, proacl FROM pg_proc WHERE proname IN (''confirm_completed_mission'',''validate_mission_v1'');';
  RAISE NOTICE '      Expected: both functions, prosecdef=true';
  RAISE NOTICE '  V3: SELECT has_function_privilege(''authenticated'',''confirm_completed_mission(uuid)'',''EXECUTE'');';
  RAISE NOTICE '      Expected: true';
  RAISE NOTICE '  V4: SELECT has_function_privilege(''authenticated'',''validate_mission_v1(uuid)'',''EXECUTE'');';
  RAISE NOTICE '      Expected: true';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
