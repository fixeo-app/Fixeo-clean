-- ════════════════════════════════════════════════════════════
-- 7C.11E.2 — Verification Checks (run AFTER migration)
-- supabase/7c11e2-mission-lifecycle-verify.sql
--
-- All V-checks must pass before 11E.2 is considered applied.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count  integer;
  v_def    text;
  v_secdef boolean;
BEGIN

  -- V-1: decline_mission exists
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-1 FAIL: decline_mission not found'; END IF;
  RAISE NOTICE 'V-1 PASS: decline_mission exists';

  -- V-2: start_mission exists
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-2 FAIL: start_mission not found'; END IF;
  RAISE NOTICE 'V-2 PASS: start_mission exists';

  -- V-3: complete_mission exists
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-3 FAIL: complete_mission not found'; END IF;
  RAISE NOTICE 'V-3 PASS: complete_mission exists';

  -- V-4: get_accepted_mission_detail exists and is updated
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'get_accepted_mission_detail';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-4 FAIL: get_accepted_mission_detail not found'; END IF;
  RAISE NOTICE 'V-4 PASS: get_accepted_mission_detail exists';

  -- V-5: decline_mission SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-5 FAIL: decline_mission not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-5 PASS: decline_mission SECURITY DEFINER';

  -- V-6: start_mission SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-6 FAIL: start_mission not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-6 PASS: start_mission SECURITY DEFINER';

  -- V-7: complete_mission SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-7 FAIL: complete_mission not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-7 PASS: complete_mission SECURITY DEFINER';

  -- V-8: decline_mission body contains search_path guard
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission' LIMIT 1;
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-8 FAIL: decline_mission missing SET search_path';
  END IF;
  RAISE NOTICE 'V-8 PASS: decline_mission has search_path guard';

  -- V-9: start_mission body contains search_path guard
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission' LIMIT 1;
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-9 FAIL: start_mission missing SET search_path';
  END IF;
  RAISE NOTICE 'V-9 PASS: start_mission has search_path guard';

  -- V-10: complete_mission body contains search_path guard
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-10 FAIL: complete_mission missing SET search_path';
  END IF;
  RAISE NOTICE 'V-10 PASS: complete_mission has search_path guard';

  -- V-11: get_accepted_mission_detail returns request_status
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'get_accepted_mission_detail' LIMIT 1;
  IF v_def NOT ILIKE '%request_status%' THEN
    RAISE EXCEPTION 'V-11 FAIL: get_accepted_mission_detail does not return request_status (7C.11E.2 not applied)';
  END IF;
  RAISE NOTICE 'V-11 PASS: get_accepted_mission_detail returns request_status';

  -- V-12: decline_mission uses TEXT/UUID explicit cast in body
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission' LIMIT 1;
  IF v_def NOT ILIKE '%::text%' THEN
    RAISE EXCEPTION 'V-12 FAIL: decline_mission missing ::text cast (TEXT/UUID contract)';
  END IF;
  RAISE NOTICE 'V-12 PASS: decline_mission has explicit ::text cast';

  -- V-13: start_mission uses TEXT/UUID explicit cast
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission' LIMIT 1;
  IF v_def NOT ILIKE '%::text%' THEN
    RAISE EXCEPTION 'V-13 FAIL: start_mission missing ::text cast (TEXT/UUID contract)';
  END IF;
  RAISE NOTICE 'V-13 PASS: start_mission has explicit ::text cast';

  -- V-14: complete_mission uses TEXT/UUID explicit cast
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def NOT ILIKE '%::text%' THEN
    RAISE EXCEPTION 'V-14 FAIL: complete_mission missing ::text cast (TEXT/UUID contract)';
  END IF;
  RAISE NOTICE 'V-14 PASS: complete_mission has explicit ::text cast';

  -- V-15: owner_user_id used for artisan identity (not phone)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission' LIMIT 1;
  IF v_def ILIKE '%phone_public%' THEN
    RAISE EXCEPTION 'V-15 FAIL: decline_mission uses phone_public fallback (security violation)';
  END IF;
  IF v_def NOT ILIKE '%owner_user_id%' THEN
    RAISE EXCEPTION 'V-15 FAIL: decline_mission does not use owner_user_id for identity';
  END IF;
  RAISE NOTICE 'V-15 PASS: decline_mission uses owner_user_id, no phone fallback';

  -- V-16: complete_mission does NOT set validated
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def ~* 'status\s*=\s*''validated''' THEN
    RAISE EXCEPTION 'V-16 FAIL: complete_mission sets validated (artisan authority exceeded)';
  END IF;
  RAISE NOTICE 'V-16 PASS: complete_mission does not set validated';

  -- V-17: complete_mission raises atomicity exception (no silent WARNING + ok:true on partial)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def NOT ILIKE '%P0001%' THEN
    RAISE EXCEPTION 'V-17 FAIL: complete_mission does not use P0001 atomicity exception';
  END IF;
  IF v_def NOT ILIKE '%RAISE EXCEPTION%' THEN
    RAISE EXCEPTION 'V-17 FAIL: complete_mission missing RAISE EXCEPTION for atomicity enforcement';
  END IF;
  RAISE NOTICE 'V-17 PASS: complete_mission has atomicity RAISE EXCEPTION + P0001 handler';

  -- V-18: complete_mission catches P0001 and returns ok:false (not ok:true)
  IF v_def NOT ILIKE '%atomicity_error%' THEN
    RAISE EXCEPTION 'V-18 FAIL: complete_mission P0001 handler does not return atomicity_error reason';
  END IF;
  RAISE NOTICE 'V-18 PASS: complete_mission P0001 handler returns ok:false reason=atomicity_error';

  -- V-19: no invalid SET alias patterns in lifecycle SQL
  -- (structural check on function bodies — all SET targets unqualified)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'decline_mission' LIMIT 1;
  IF v_def ~ 'SET\s+[a-z]+\.' THEN
    RAISE EXCEPTION 'V-19 FAIL: decline_mission has alias-qualified SET target';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission' LIMIT 1;
  IF v_def ~ 'SET\s+[a-z]+\.' THEN
    RAISE EXCEPTION 'V-19 FAIL: start_mission has alias-qualified SET target';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def ~ 'SET\s+[a-z]+\.' THEN
    RAISE EXCEPTION 'V-19 FAIL: complete_mission has alias-qualified SET target';
  END IF;
  RAISE NOTICE 'V-19 PASS: no alias-qualified SET targets in any lifecycle RPC';

  -- V-20: start_mission re-reads state on 0-rows UPDATE (truthful race)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'start_mission' LIMIT 1;
  IF v_def NOT ILIKE '%already_started%' THEN
    RAISE EXCEPTION 'V-20 FAIL: start_mission missing already_started idempotent path';
  END IF;
  -- Verify re-read pattern: must SELECT sr.status AFTER the 0-rows check
  IF v_def NOT ILIKE '%invalid_request_state%' THEN
    RAISE EXCEPTION 'V-20 FAIL: start_mission 0-rows path does not return invalid_request_state for non-in_progress states';
  END IF;
  RAISE NOTICE 'V-20 PASS: start_mission re-reads after 0-rows; returns already_started only when status=in_progress';

  -- V-21: complete_mission early-exit (mission=done) verifies parent request state
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'complete_mission' LIMIT 1;
  IF v_def NOT ILIKE '%inconsistent_state%' THEN
    RAISE EXCEPTION 'V-21 FAIL: complete_mission does not check parent request state in already_completed path (inconsistent_state missing)';
  END IF;
  RAISE NOTICE 'V-21 PASS: complete_mission verifies parent request state before returning already_completed';

  -- V-22: no offered missions remain unexpected (informational)
  DECLARE
    v_offered integer;
  BEGIN
    SELECT COUNT(*) INTO v_offered FROM public.missions WHERE status = 'offered';
    RAISE NOTICE 'V-22 INFO: offered missions = %', v_offered;
  END;

  -- V-23: no pending missions remain unexpected (informational)
  DECLARE
    v_pending integer;
  BEGIN
    SELECT COUNT(*) INTO v_pending FROM public.missions WHERE status = 'pending';
    RAISE NOTICE 'V-23 INFO: pending missions = %', v_pending;
  END;

  RAISE NOTICE '══ 7C.11E.2 VERIFY COMPLETE ══';

END $$;
