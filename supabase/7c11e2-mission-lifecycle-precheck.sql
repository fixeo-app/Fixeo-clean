-- ════════════════════════════════════════════════════════════
-- 7C.11E.2 — Mission Lifecycle Pre-Check
-- supabase/7c11e2-mission-lifecycle-precheck.sql
--
-- Run BEFORE applying 7c11e2-mission-lifecycle.sql.
-- All checks must pass. Any CRITICAL STOP aborts migration.
--
-- Prerequisites:
--   7C.11C applied (foundation RPCs, schema columns)
--   7C.11D applied (server writers)
--   7C.11E.1 applied (claim_mission, get_my_mission_offers,
--                     get_accepted_mission_detail exist)
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count  integer;
  v_type   text;
BEGIN

-- ── PM-1: missions.request_id must be TEXT ─────────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'missions'
    AND  column_name  = 'request_id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-1: missions.request_id column not found';
  END IF;
  IF v_type != 'text' THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-1: missions.request_id type=% (expected text)', v_type;
  END IF;
  RAISE NOTICE 'PM-1 PASS: missions.request_id = text';

-- ── PM-2: service_requests.id must be UUID ─────────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'service_requests'
    AND  column_name  = 'id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-2: service_requests.id column not found';
  END IF;
  IF v_type NOT IN ('uuid', 'USER-DEFINED') THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-2: service_requests.id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-2 PASS: service_requests.id = uuid';

-- ── PM-3: artisans.id must be UUID ─────────────────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'artisans'
    AND  column_name  = 'id';

  IF v_type NOT IN ('uuid', 'USER-DEFINED') THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-3: artisans.id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-3 PASS: artisans.id = uuid';

-- ── PM-4: artisans.owner_user_id must be UUID ──────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'artisans'
    AND  column_name  = 'owner_user_id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-4: artisans.owner_user_id column not found';
  END IF;
  IF v_type NOT IN ('uuid', 'USER-DEFINED') THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-4: artisans.owner_user_id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-4 PASS: artisans.owner_user_id = uuid';

-- ── PM-5: missions.artisan_profile_id must be UUID ─────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'missions'
    AND  column_name  = 'artisan_profile_id';

  IF v_type NOT IN ('uuid', 'USER-DEFINED') THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-5: missions.artisan_profile_id type=% (expected uuid)', v_type;
  END IF;
  RAISE NOTICE 'PM-5 PASS: missions.artisan_profile_id = uuid';

-- ── PM-6: missions.status CHECK constraint covers required values
  SELECT COUNT(*) INTO v_count
  FROM   information_schema.constraint_column_usage cu
  JOIN   information_schema.table_constraints tc
    ON   tc.constraint_name = cu.constraint_name
    AND  tc.table_schema    = cu.table_schema
  WHERE  cu.table_schema  = 'public'
    AND  cu.table_name    = 'missions'
    AND  cu.column_name   = 'status'
    AND  tc.constraint_type = 'CHECK';

  IF v_count = 0 THEN
    RAISE WARNING 'PM-6 WARN: no CHECK constraint found on missions.status — relying on enum/domain';
  ELSE
    RAISE NOTICE 'PM-6 PASS: missions.status has CHECK constraint';
  END IF;

-- ── PM-7: service_requests status column exists ─────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'service_requests'
    AND  column_name  = 'status';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-7: service_requests.status column not found';
  END IF;
  RAISE NOTICE 'PM-7 PASS: service_requests.status exists';

-- ── PM-8: service_requests.client_phone exists (7C.11C) ────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'service_requests'
    AND  column_name  = 'client_phone';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-8: service_requests.client_phone not found (7C.11C not applied)';
  END IF;
  RAISE NOTICE 'PM-8 PASS: service_requests.client_phone exists';

-- ── PM-9: service_requests.urgency exists (7C.11C) ─────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'service_requests'
    AND  column_name  = 'urgency';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-9: service_requests.urgency not found (7C.11C not applied)';
  END IF;
  RAISE NOTICE 'PM-9 PASS: service_requests.urgency exists';

-- ── PM-10: 11C foundation RPC claim_mission exists ─────────
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname   = 'public'
    AND  p.proname   = 'claim_mission';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-10: claim_mission() not found (7C.11C not applied)';
  END IF;
  RAISE NOTICE 'PM-10 PASS: claim_mission exists';

-- ── PM-11: get_my_mission_offers exists ────────────────────
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname   = 'public'
    AND  p.proname   = 'get_my_mission_offers';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-11: get_my_mission_offers() not found (7C.11C not applied)';
  END IF;
  RAISE NOTICE 'PM-11 PASS: get_my_mission_offers exists';

-- ── PM-12: get_accepted_mission_detail exists ──────────────
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname   = 'public'
    AND  p.proname   = 'get_accepted_mission_detail';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CRITICAL STOP PM-12: get_accepted_mission_detail() not found (7C.11C not applied)';
  END IF;
  RAISE NOTICE 'PM-12 PASS: get_accepted_mission_detail exists';

-- ── PM-13: no unexpectedly large offered mission count ─────
--   (safety gate — unexpected offered missions would indicate
--    a prior dispatch run that must be reviewed before lifecycle
--    RPCs are introduced)
  SELECT COUNT(*) INTO v_count
  FROM   public.missions
  WHERE  status = 'offered';

  RAISE NOTICE 'PM-13 INFO: current offered missions = %', v_count;
  -- Not a STOP — but surfaced for human review

-- ── PM-14: no unexpectedly large pending mission count ──────
  SELECT COUNT(*) INTO v_count
  FROM   public.missions
  WHERE  status = 'pending';

  RAISE NOTICE 'PM-14 INFO: current pending missions = %', v_count;

-- ── PM-15: artisan_read_own_linked_requests RLS exists ──────
  SELECT COUNT(*) INTO v_count
  FROM   pg_policies
  WHERE  schemaname = 'public'
    AND  tablename  = 'service_requests'
    AND  policyname = 'artisan_read_own_linked_requests';

  IF v_count = 0 THEN
    RAISE WARNING 'PM-15 WARN: artisan_read_own_linked_requests policy not found — verify RLS';
  ELSE
    RAISE NOTICE 'PM-15 PASS: artisan_read_own_linked_requests policy exists';
  END IF;

-- ── PM-16: missions.accepted_at column exists ───────────────
  SELECT data_type INTO v_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'missions'
    AND  column_name  = 'accepted_at';

  IF v_type IS NULL THEN
    RAISE WARNING 'PM-16 WARN: missions.accepted_at not found — accepted_at will be NULL in detail RPC';
  ELSE
    RAISE NOTICE 'PM-16 PASS: missions.accepted_at exists';
  END IF;

  RAISE NOTICE '══ 7C.11E.2 PRECHECK COMPLETE — review NOTICE/WARNING above before proceeding ══';

END $$;
