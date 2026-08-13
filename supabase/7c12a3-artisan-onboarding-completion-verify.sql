-- ════════════════════════════════════════════════════════════════════════════
-- 7C.12A.3 — Post-Apply Verify (READ ONLY — SAFE)
-- File: 7c12a3-artisan-onboarding-completion-verify.sql
-- Run AFTER applying 7c12a3-artisan-onboarding-completion.sql
-- All checks are READ ONLY. No DDL, DML, or side effects.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count    integer;
  v_def      text;
  v_def_exec text;   -- comment-stripped for SET-target checks
  v_text     text;
BEGIN
  RAISE NOTICE '══ 7C.12A.3 Post-Apply Verify ══';

  -- ══════════════════════════════════════════════════════════
  -- SECTION A: RPC existence + contract
  -- ══════════════════════════════════════════════════════════

  -- V-1: complete_artisan_onboarding exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_artisan_onboarding';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-1 FAIL: complete_artisan_onboarding() not found';
  END IF;
  RAISE NOTICE 'V-1 PASS: complete_artisan_onboarding() exists';

  -- Load function definition for body checks
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_artisan_onboarding'
  LIMIT 1;
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-2: SECURITY DEFINER
  IF v_def NOT ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'V-2 FAIL: complete_artisan_onboarding is not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'V-2 PASS: SECURITY DEFINER confirmed';

  -- V-3: SET search_path = '' present
  IF v_def NOT ILIKE '%SET search_path%' THEN
    RAISE EXCEPTION 'V-3 FAIL: SET search_path missing from complete_artisan_onboarding';
  END IF;
  RAISE NOTICE 'V-3 PASS: SET search_path present';

  -- V-4: auth.uid() called (identity from session only)
  IF v_def_exec NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'V-4 FAIL: auth.uid() not found in complete_artisan_onboarding body';
  END IF;
  RAISE NOTICE 'V-4 PASS: auth.uid() used for identity';

  -- V-5: FOR UPDATE lock present
  IF v_def_exec NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'V-5 FAIL: FOR UPDATE lock missing from complete_artisan_onboarding';
  END IF;
  RAISE NOTICE 'V-5 PASS: FOR UPDATE lock present';

  -- V-6: unauthenticated guard ('unauthenticated' reason)
  IF v_def NOT LIKE '%unauthenticated%' THEN
    RAISE EXCEPTION 'V-6 FAIL: unauthenticated guard missing';
  END IF;
  RAISE NOTICE 'V-6 PASS: unauthenticated guard present';

  -- V-7: not_approved guard present
  IF v_def NOT LIKE '%not_approved%' THEN
    RAISE EXCEPTION 'V-7 FAIL: not_approved guard missing';
  END IF;
  RAISE NOTICE 'V-7 PASS: not_approved guard present';

  -- V-8: profile_incomplete guard present
  IF v_def NOT LIKE '%profile_incomplete%' THEN
    RAISE EXCEPTION 'V-8 FAIL: profile_incomplete guard missing';
  END IF;
  RAISE NOTICE 'V-8 PASS: profile_incomplete guard present';

  -- V-9: idempotent path (already_completed)
  IF v_def NOT LIKE '%already_completed%' THEN
    RAISE EXCEPTION 'V-9 FAIL: already_completed idempotent path missing';
  END IF;
  RAISE NOTICE 'V-9 PASS: already_completed idempotent path present';

  -- ══════════════════════════════════════════════════════════
  -- SECTION B: UPDATE SET targets — privileged fields NOT written
  -- (Uses SET-clause extraction to avoid WHERE-clause false positives)
  -- ══════════════════════════════════════════════════════════

  -- Extract UPDATE...SET clause text only (not WHERE/RETURNING)
  SELECT COALESCE(string_agg(m[1], ' '), '') INTO v_text
  FROM regexp_matches(
    v_def_exec,
    'UPDATE\s[\s\S]*?\sSET\s([\s\S]*?)(?=\sWHERE\s|\sRETURNING\s|;)',
    'gi'
  ) AS t(m);

  -- V-10: onboarding_completed IS in SET clause (must be written by this RPC)
  IF v_text NOT ILIKE '%onboarding_completed%' THEN
    RAISE EXCEPTION 'V-10 FAIL: onboarding_completed not found in UPDATE SET clause';
  END IF;
  RAISE NOTICE 'V-10 PASS: onboarding_completed present in UPDATE SET clause';

  -- V-11: availability IS in SET clause (set to available on completion)
  IF v_text NOT ILIKE '%availability%' THEN
    RAISE EXCEPTION 'V-11 FAIL: availability not found in UPDATE SET clause';
  END IF;
  RAISE NOTICE 'V-11 PASS: availability present in UPDATE SET clause';

  -- V-12: owner_user_id NOT in SET clause
  IF v_text ILIKE '%owner_user_id%' THEN
    RAISE EXCEPTION 'V-12 FAIL: owner_user_id found in UPDATE SET clause — must never be written here';
  END IF;
  RAISE NOTICE 'V-12 PASS: owner_user_id NOT in UPDATE SET clause';

  -- V-13: verified NOT in SET clause
  IF v_text ~* 'verified\s*=' THEN
    RAISE EXCEPTION 'V-13 FAIL: verified found in UPDATE SET clause — must never be written here';
  END IF;
  RAISE NOTICE 'V-13 PASS: verified NOT in UPDATE SET clause';

  -- V-14: claimed NOT in SET clause
  IF v_text ~* '\bclaimed\s*=' THEN
    RAISE EXCEPTION 'V-14 FAIL: claimed found in UPDATE SET clause — must never be written here';
  END IF;
  RAISE NOTICE 'V-14 PASS: claimed NOT in UPDATE SET clause';

  -- V-15: claim_status NOT in SET clause
  IF v_text ILIKE '%claim_status%' THEN
    RAISE EXCEPTION 'V-15 FAIL: claim_status found in UPDATE SET clause — must never be written here';
  END IF;
  RAISE NOTICE 'V-15 PASS: claim_status NOT in UPDATE SET clause';

  -- ══════════════════════════════════════════════════════════
  -- SECTION C: EXECUTE privileges
  -- ══════════════════════════════════════════════════════════

  -- V-16: authenticated has EXECUTE
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'complete_artisan_onboarding'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'authenticated';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-16 FAIL: authenticated lacks EXECUTE on complete_artisan_onboarding';
  END IF;
  RAISE NOTICE 'V-16 PASS: authenticated has EXECUTE on complete_artisan_onboarding';

  -- V-17: anon does NOT have EXECUTE
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'complete_artisan_onboarding'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'anon';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-17 FAIL: anon has EXECUTE on complete_artisan_onboarding — must be REVOKED';
  END IF;
  RAISE NOTICE 'V-17 PASS: anon does NOT have EXECUTE on complete_artisan_onboarding';

  -- ══════════════════════════════════════════════════════════
  -- SECTION D: 7C.12A.2 non-regression
  -- ══════════════════════════════════════════════════════════

  -- V-18: authenticated still has NO table-level UPDATE on artisans
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-18 FAIL: authenticated has table-level UPDATE on artisans — 7C.12A.2 REVOKE was undone';
  END IF;
  RAISE NOTICE 'V-18 PASS: authenticated still has NO table-level UPDATE on artisans';

  -- V-19: onboarding_completed still NOT column-granted to authenticated
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'onboarding_completed'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-19 FAIL: onboarding_completed column-granted to authenticated — must be RPC-only';
  END IF;
  RAISE NOTICE 'V-19 PASS: onboarding_completed NOT column-granted to authenticated';

  -- V-20: register_new_artisan still exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-20 FAIL: register_new_artisan() missing — 7C.12A.2 regression';
  END IF;
  RAISE NOTICE 'V-20 PASS: register_new_artisan() still exists';

  -- V-21: update_artisan_availability still exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-21 FAIL: update_artisan_availability() missing — 7C.12A.2 regression';
  END IF;
  RAISE NOTICE 'V-21 PASS: update_artisan_availability() still exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION E: Dispatch eligibility gate (structural)
  -- ══════════════════════════════════════════════════════════

  -- V-22: dispatch_request_v1 still exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-22 FAIL: dispatch_request_v1 missing — 7C.11 regression';
  END IF;
  RAISE NOTICE 'V-22 PASS: dispatch_request_v1 still exists';

  RAISE NOTICE '══ 7C.12A.3 Verify complete — 22 V-checks ══';
END $$;
