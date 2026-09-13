-- ════════════════════════════════════════════════════════════════════════════
-- FIXEO — Migration 7c14a1 — Mission Lifecycle: Enterprise Confirmation Extension
-- File:     supabase/7c14a1-mission-lifecycle-validate.sql
-- Phase:    BP02 V3.1 — Strict B2C backward-compatible production delta
-- Version:  v3.1 (2026-09-12)
--
-- ════════════════════════════════════════════════════════════════════════════
-- AUTHORITATIVE PRODUCTION CONTRACT
-- ─────────────────────────────────
--   Production function: public.confirm_completed_mission(p_request_id uuid)
--   Production baseline MD5: 8b70152880cd87d52044f730fd1dd2c2
--
--   CANONICAL UPDATE ORDER (production):
--     STEP 1 — service_requests: completed → validated   ← FIRST
--     STEP 2 — missions:         done      → validated   ← SECOND
--
--   CANONICAL REPAIR PATH (production):
--     SR.status = validated + mission.status IN ('done','validated'):
--       mission = validated → already_validated:true (idempotent, no mutation)
--       mission = done      → UPDATE mission done→validated, repaired:true
--
--   UNSUPPORTED INVERSE STATE (NOT in production — NOT introduced here):
--     SR.status = completed, mission.status = validated
--     → completed_mission_not_found (no 'done' mission; SR not healed)
--
--   missions_status_check (7c11c):
--     offered, pending, declined, expired, done, cancelled, validated
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES
-- ─────────────────────────
--   ONLY: CREATE OR REPLACE confirm_completed_mission(p_request_id uuid)
--
--   The B2C path (client_profile_id = auth.uid()) is preserved SEMANTICALLY
--   IDENTICAL to production. The only authorized change is the ownership
--   extension: UNION ALL enterprise branch added.
--
--   Enterprise ownership branch:
--     An authenticated user may confirm an Enterprise service_request if:
--       (a) enterprise_request_context.service_request_id = p_request_id, AND
--       (b) enterprise_members.enterprise_id = erc.enterprise_id
--           AND enterprise_members.user_id   = auth.uid()
--           AND enterprise_members.status    = 'active'
--           AND enterprise_members.role IN (
--                 'owner', 'admin', 'operations_manager', 'site_manager'
--               )
--     Explicitly blocked: 'reporter', 'viewer' (read-only roles)
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES NOT DO
-- ─────────────────────────────────
--   Does NOT change the happy-path update order (SR first, missions second)
--   Does NOT introduce the inverse repair path
--   Does NOT modify missions_status_check
--   Does NOT add terminée or validée to missions vocabulary
--   Does NOT create validate_mission_v1
--   Does NOT alter any other lifecycle transition
--   Does NOT modify any RLS policy
--   Does NOT change any behavior for existing B2C callers
--
-- ════════════════════════════════════════════════════════════════════════════
-- EXACT PRODUCTION DELTA
-- ──────────────────────
--   DATABASE  : replace confirm_completed_mission() — identical B2C semantics
--               + Enterprise UNION ALL ownership branch (additive only)
--   SERVER    : admin-settle-mission-fn ELIGIBLE_STATUSES = ['validated']
--               (separate file — not a DB migration)
--   FRONTEND  : fixeo-mvp-supabase.js isTerminee bug fixed
--               (separate file — not a DB migration)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- PRODUCTION DRIFT GUARD — FAIL CLOSED
-- ════════════════════════════════════════════════════════════════════════════
--
-- This guard FAILS CLOSED on every mismatch, including function absence.
-- The production environment is KNOWN to contain the reviewed function.
-- Function-absent case → ABORT (this is not a first deployment target).
--
-- Required preconditions (all must pass):
--   (1) Exactly one overload of confirm_completed_mission(p_request_id uuid)
--   (2) MD5(pg_get_functiondef()) = '8b70152880cd87d52044f730fd1dd2c2'
--   (3) SECURITY DEFINER = true
--   (4) proconfig contains search_path = ''
--
DO $$
DECLARE
  v_funcdef  text;
  v_md5      text;
  v_expected text    := '8b70152880cd87d52044f730fd1dd2c2';
  v_overload integer := 0;
  v_prosecdef boolean;
  v_proconfig text[];
BEGIN
  -- ── Precondition 1: exactly one overload ──────────────────────────────
  SELECT COUNT(*)
  INTO   v_overload
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'confirm_completed_mission';

  IF v_overload = 0 THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: confirm_completed_mission does not exist in public schema. '
      'This migration requires the reviewed production function to be present. '
      'Do not apply to a fresh database — run preflight PF-3 first.'
    USING ERRCODE = 'P0001';
  END IF;

  IF v_overload > 1 THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: % overloads of confirm_completed_mission found. '
      'Expected exactly 1. Remove unexpected overloads before proceeding.',
      v_overload
    USING ERRCODE = 'P0001';
  END IF;

  -- ── Precondition 2: MD5 matches reviewed baseline ─────────────────────
  SELECT pg_catalog.pg_get_functiondef(p.oid),
         p.prosecdef,
         p.proconfig
  INTO   v_funcdef, v_prosecdef, v_proconfig
  FROM   pg_catalog.pg_proc p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'confirm_completed_mission'
    AND  pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: confirm_completed_mission(p_request_id uuid) not found. '
      'An overload exists but with a different signature. '
      'Expected signature: (p_request_id uuid).'
    USING ERRCODE = 'P0001';
  END IF;

  v_md5 := md5(v_funcdef);

  IF v_md5 != v_expected THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: confirm_completed_mission body has changed since review. '
      'Expected MD5: %. Actual MD5: %. '
      'Read the current production function, compare with reviewed baseline, '
      'update this migration accordingly, then re-baseline the MD5.',
      v_expected, v_md5
    USING ERRCODE = 'P0001';
  END IF;

  -- ── Precondition 3: SECURITY DEFINER ──────────────────────────────────
  IF NOT v_prosecdef THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: confirm_completed_mission is NOT SECURITY DEFINER in production. '
      'Unexpected security posture. Review before proceeding.'
    USING ERRCODE = 'P0001';
  END IF;

  -- ── Precondition 4: search_path = '''' ────────────────────────────────
  IF v_proconfig IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM unnest(v_proconfig) c
       WHERE c ILIKE 'search_path%'
     )
  THEN
    RAISE EXCEPTION
      'DRIFT GUARD FAILED: confirm_completed_mission does not set search_path in proconfig. '
      'Unexpected security posture. Review before proceeding.'
    USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE
    'DRIFT GUARD PASSED: MD5 = % (matches reviewed baseline). '
    'SECURITY DEFINER = true. search_path present. Proceeding.',
    v_md5;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- confirm_completed_mission(p_request_id uuid)
-- ════════════════════════════════════════════════════════════════════════════
--
-- STRICT B2C BACKWARD COMPATIBILITY GUARANTEE
-- ────────────────────────────────────────────
-- Every logical block below is classified as either:
--   UNCHANGED  — byte-for-byte equivalent to production behavior
--   ADDITIVE   — enterprise-only extension; does not affect B2C path
--
-- LOGICAL BLOCK CLASSIFICATION:
--   AUTH                  UNCHANGED
--   REQUEST LOOKUP        UNCHANGED
--   OWNERSHIP QUERY       ADDITIVE (UNION ALL — B2C path first, unchanged)
--   VALIDATED IDEMPOTENCY UNCHANGED
--   COMPLETED PRECOND     UNCHANGED
--   REPAIR PATH           UNCHANGED (SR=validated: mission done→validated repaired:true; mission validated→already_validated:true)
--   MISSION SELECTION     UNCHANGED
--   SR UPDATE (Step 1)    UNCHANGED (service_requests first — production order)
--   MISSION UPDATE (Step 2) UNCHANGED (missions second — production order)
--   ATOMICITY GUARD       UNCHANGED
--   EXCEPTION HANDLING    UNCHANGED
--   RETURN SHAPE          UNCHANGED
--   ACL                   UNCHANGED
--
-- UPDATE ORDER PRESERVED EXACTLY:
--   Step 1: service_requests  completed → validated   ← FIRST (production order)
--   Step 2: missions          done      → validated   ← SECOND (production order)
--
-- REPAIR PATH PRESERVED EXACTLY:
--   SR.status = validated:
--     mission = done      → UPDATE done→validated, return repaired:true
--     mission = validated → return already_validated:true (idempotent, no mutation)
--   SR.status = completed + mission.status = validated (unsupported inverse state):
--     → completed_mission_not_found (no done mission; SR not healed)
--
CREATE OR REPLACE FUNCTION public.confirm_completed_mission(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid;
  v_sr_status  text;
  v_is_owned   boolean;
  v_mission_id uuid;
  v_rows_sr    integer;
  v_rows_m     integer;
BEGIN

  -- ── BLOCK: AUTH — UNCHANGED ─────────────────────────────────────────────
  -- Guard 0: authenticated caller required.
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── BLOCK: REQUEST LOOKUP — UNCHANGED ──────────────────────────────────
  -- Guard 1: service_request must exist; read current status.
  -- Existence check precedes ownership to avoid timing info leaks
  -- (consistent with production: NOT FOUND → request_not_found_or_not_owned).
  SELECT sr.status
  INTO   v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- ── BLOCK: OWNERSHIP QUERY — ADDITIVE UNION ALL ─────────────────────────
  -- Guard 2: ownership check.
  --
  -- Path A — B2C (UNCHANGED from production baseline):
  --   service_requests.client_profile_id = auth.uid()
  --
  -- Path B — Enterprise (ADDITIVE — does not affect B2C callers):
  --   An enterprise_request_context row links this SR to an enterprise.
  --   The caller must be an ACTIVE member of that enterprise in a
  --   confirming-eligible role.
  --   Eligible:  owner, admin, operations_manager, site_manager
  --   Blocked:   reporter, viewer (read-only — cannot trigger lifecycle)
  --
  -- Both paths are evaluated via a single EXISTS query.
  -- The B2C path is listed first (matching production query structure).
  -- B2C callers satisfy Path A and are unaffected by Path B.
  -- Enterprise SRs have client_profile_id = NULL; Path A fails for them;
  -- Path B is the only route — entirely additive.
  --
  SELECT EXISTS (
    -- Path A: B2C — direct client ownership (production baseline — unchanged)
    SELECT 1
    FROM   public.service_requests sr2
    WHERE  sr2.id                = p_request_id
      AND  sr2.client_profile_id = v_uid

    UNION ALL

    -- Path B: Enterprise — authorized enterprise member (additive)
    SELECT 1
    FROM   public.enterprise_request_context erc
    JOIN   public.enterprise_members em
           ON  em.enterprise_id = erc.enterprise_id
           AND em.user_id       = v_uid
           AND em.status        = 'active'
           AND em.role          IN (
                 'owner',
                 'admin',
                 'operations_manager',
                 'site_manager'
               )
    WHERE  erc.service_request_id = p_request_id

    LIMIT 1
  ) INTO v_is_owned;

  IF NOT v_is_owned THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- ── BLOCK: VALIDATED — CANONICAL REPAIR PATH — UNCHANGED ─────────────────
  -- Guard 3a: SR is already 'validated'.
  --
  -- Production behavior (authoritative):
  --   Find mission WHERE status IN ('done','validated') for this SR.
  --
  --   mission = validated:
  --     Both steps already completed. Return already_validated:true. No mutation.
  --
  --   mission = done:
  --     Step 1 (SR→validated) completed in a prior call; Step 2 (mission→validated)
  --     did not. Perform canonical repair: UPDATE mission done→validated.
  --     Return repaired:true.
  --
  --   No mission in done/validated:
  --     SR validated, mission in some other state or absent.
  --     Return {ok:false, reason:'mission_not_found'}.
  --
  -- This is the ONLY supported repair path. The inverse
  -- (SR=completed + mission=validated) is NOT supported and NOT introduced.
  --
  IF v_sr_status = 'validated' THEN
    DECLARE
      v_repair_id   uuid;
      v_repair_rows integer;
    BEGIN
      SELECT m.id
      INTO   v_repair_id
      FROM   public.missions m
      WHERE  m.request_id = p_request_id::text
        AND  m.status     IN ('done', 'validated')
      ORDER  BY m.created_at DESC
      LIMIT  1;

      IF NOT FOUND THEN
        -- No actionable mission — SR validated but no done/validated mission exists
        RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'mission_not_found');
      END IF;

      -- Check if mission is already validated (full idempotent path)
      IF EXISTS (
        SELECT 1 FROM public.missions m
        WHERE  m.id     = v_repair_id
          AND  m.status = 'validated'
      ) THEN
        RETURN pg_catalog.jsonb_build_object(
          'ok',              true,
          'request_id',      p_request_id,
          'mission_id',      v_repair_id,
          'already_validated', true
        );
      END IF;

      -- Mission is 'done' — canonical repair: complete Step 2
      UPDATE public.missions
      SET    status = 'validated'
      WHERE  id     = v_repair_id
        AND  status = 'done';

      GET DIAGNOSTICS v_repair_rows = ROW_COUNT;

      IF v_repair_rows = 0 THEN
        -- Concurrent call beat us to the repair — treat as atomicity violation
        RAISE EXCEPTION
          '[confirm_completed_mission] repair atomicity: mission % could not be set validated '
          '(concurrent call completed the repair).', v_repair_id
        USING ERRCODE = 'P0001';
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'ok',         true,
        'request_id', p_request_id,
        'mission_id', v_repair_id,
        'repaired',   true
      );
    END;
  END IF;

  -- ── BLOCK: COMPLETED PRECONDITION — UNCHANGED ───────────────────────────
  -- Guard 3b: SR must be 'completed' for a new confirmation to proceed.
  -- Any other state (new, assigned, in_progress, etc.) → request_not_completed.
  -- NOTE: SR=validated is fully handled by Guard 3a above.
  IF v_sr_status != 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',      false,
      'reason',  'request_not_completed',
      'current', v_sr_status
    );
  END IF;

  -- ── BLOCK: MISSION LOOKUP (SR=completed path) — UNCHANGED ───────────────
  -- Guard 3c: SR is 'completed'. Locate the 'done' mission.
  --
  -- UNSUPPORTED INVERSE STATE:
  --   SR=completed + mission=validated.
  --   Production does NOT heal SR in this case — not a supported repair path.
  --   No 'done' mission found → completed_mission_not_found.
  --   SR remains 'completed'. No mutation.
  --
  SELECT m.id
  INTO   v_mission_id
  FROM   public.missions m
  WHERE  m.request_id = p_request_id::text
    AND  m.status     = 'done'
  ORDER  BY m.created_at DESC
  LIMIT  1;

  IF NOT FOUND THEN
    -- No 'done' mission. SR=completed but no actionable mission.
    -- Includes the unsupported inverse state (mission='validated', SR='completed').
    -- Production does not repair SR here. Return not_found.
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'completed_mission_not_found');
  END IF;

  -- ── BLOCK: SR UPDATE (Step 1) — UNCHANGED ──────────────────────────────
  -- Production update order: service_requests FIRST, missions SECOND.
  -- This order is preserved exactly.
  --
  -- Step 1: service_request completed → validated
  UPDATE public.service_requests
  SET    status = 'validated'
  WHERE  id     = p_request_id
    AND  status = 'completed';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  -- ROW_COUNT guard on Step 1: if 0 rows affected, the SR status changed
  -- concurrently (race condition). Raise P0001 to abort — rolls back cleanly.
  -- Production behavior: 0 rows → RAISE EXCEPTION P0001 → atomicity_error.
  IF v_rows_sr = 0 THEN
    -- Concurrent call beat us to Step 1 — raise to roll back and signal atomicity error.
    RAISE EXCEPTION
      '[confirm_completed_mission] atomicity violation: '
      'service_request % not updated (status was not completed — possible race).', p_request_id
    USING ERRCODE = 'P0001';
  END IF;

  -- ── BLOCK: MISSION UPDATE (Step 2) — UNCHANGED ─────────────────────────
  -- Step 2: mission done → validated
  UPDATE public.missions
  SET    status = 'validated'
  WHERE  id     = v_mission_id
    AND  status = 'done';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  -- ── BLOCK: ATOMICITY GUARD — UNCHANGED ──────────────────────────────────
  -- If Step 2 affected 0 rows, the mission was not in 'done' state.
  -- This means Step 1 (SR) already completed but Step 2 (mission) could not.
  -- Raise exception to roll back Step 1 automatically.
  IF v_rows_m = 0 THEN
    RAISE EXCEPTION
      '[confirm_completed_mission] atomicity violation: '
      'service_request % set to validated but mission % could not be set validated '
      '(mission status may have changed concurrently). Rolling back.',
      p_request_id, v_mission_id
    USING ERRCODE = 'P0001';
  END IF;

  -- ── BLOCK: RETURN SHAPE — UNCHANGED ────────────────────────────────────
  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'request_id', p_request_id,
    'mission_id', v_mission_id
  );

EXCEPTION
  -- ── BLOCK: EXCEPTION HANDLING — UNCHANGED ──────────────────────────────
  WHEN SQLSTATE 'P0001' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'atomicity_error');
  WHEN OTHERS THEN
    RAISE WARNING '[confirm_completed_mission] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK: ACL — UNCHANGED
-- ════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION QUERIES (read-only — run manually after apply)
-- ════════════════════════════════════════════════════════════════════════════

-- PV-1: Confirm function exists with correct signature
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args
-- FROM   pg_catalog.pg_proc
-- WHERE  proname = 'confirm_completed_mission'
--   AND  pronamespace = 'public'::regnamespace;
-- Expected: 1 row — confirm_completed_mission | p_request_id uuid

-- PV-2: Confirm SECURITY DEFINER
-- SELECT prosecdef FROM pg_catalog.pg_proc
-- WHERE  proname = 'confirm_completed_mission' AND pronamespace = 'public'::regnamespace;
-- Expected: true

-- PV-3: Confirm ACL
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE  routine_schema = 'public' AND routine_name = 'confirm_completed_mission';
-- Expected: authenticated | EXECUTE only

-- PV-4: Confirm no overloads
-- SELECT COUNT(*) FROM pg_catalog.pg_proc
-- WHERE  proname = 'confirm_completed_mission' AND pronamespace = 'public'::regnamespace;
-- Expected: 1

-- PV-5: Confirm missions CHECK is unchanged (no terminée/validée)
-- SELECT pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
-- WHERE  conrelid = 'public.missions'::regclass
--   AND  contype = 'c' AND conname = 'missions_status_check';
-- Expected: 'offered','pending','declined','expired','done','cancelled','validated' — 7 values only

-- PV-6: Record new drift guard baseline MD5 for next migration
-- SELECT md5(pg_catalog.pg_get_functiondef(p.oid))
-- FROM   pg_catalog.pg_proc p
-- JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public' AND p.proname = 'confirm_completed_mission'
--   AND  pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECOND PREFLIGHT SQL — read-only — run BEFORE applying this migration
-- ════════════════════════════════════════════════════════════════════════════

-- PF-1: Verify missions_status_check — confirm 'terminée' NOT present
-- SELECT pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
-- WHERE  conrelid = 'public.missions'::regclass AND contype = 'c'
--   AND  conname = 'missions_status_check';
-- Expected: 7 canonical values; terminée and validée absent

-- PF-2: Verify zero missions in unexpected statuses
-- SELECT status, COUNT(*) FROM public.missions
-- WHERE  status NOT IN ('offered','pending','declined','expired','done','cancelled','validated')
-- GROUP  BY status;
-- Expected: 0 rows

-- PF-3: Verify production function baseline MD5
-- SELECT md5(pg_catalog.pg_get_functiondef(p.oid)) AS current_md5,
--        '8b70152880cd87d52044f730fd1dd2c2' AS expected_md5,
--        md5(pg_catalog.pg_get_functiondef(p.oid)) = '8b70152880cd87d52044f730fd1dd2c2' AS matches
-- FROM   pg_catalog.pg_proc p
-- JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public' AND p.proname = 'confirm_completed_mission'
--   AND  pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid';
-- Expected: matches = true

-- PF-4: Verify enterprise tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE  table_schema = 'public'
--   AND  table_name IN ('enterprise_request_context','enterprise_members','enterprise_accounts')
-- ORDER  BY table_name;
-- Expected: 3 rows

-- PF-5: Verify enterprise_members columns
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE  table_schema = 'public' AND table_name = 'enterprise_members'
--   AND  column_name IN ('enterprise_id','user_id','status','role')
-- ORDER  BY column_name;
-- Expected: 4 rows

-- PF-6: Baseline confirmed-mission counts (informational)
-- SELECT status, COUNT(*) FROM public.missions
-- WHERE  status IN ('validated','done') GROUP BY status;

-- PF-7: Confirm zero missions in terminée state
-- SELECT COUNT(*) FROM public.missions WHERE status = 'terminée';
-- Expected: 0

-- PF-8: Verify current function ACL
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE  routine_schema = 'public' AND routine_name = 'confirm_completed_mission';
-- Expected: authenticated only
