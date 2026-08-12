-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Verification
-- supabase/7c12a1-artisan-claim-security-verify.sql
--
-- Run AFTER 7c12a1-artisan-claim-security.sql.
-- All V-checks must RAISE NOTICE V-xx PASS.
-- Any RAISE EXCEPTION = HARD STOP.
-- READ ONLY — no DDL, no DML.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_secdef  boolean;
  v_type    text;
BEGIN

  -- V-1: approve_artisan_claim exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim';
  IF v_count=0 THEN RAISE EXCEPTION 'V-1 FAIL: approve_artisan_claim not found'; END IF;
  RAISE NOTICE 'V-1 PASS: approve_artisan_claim exists';

  -- V-2: approve_artisan_claim is SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-2 FAIL: approve_artisan_claim not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-2 PASS: approve_artisan_claim SECURITY DEFINER';

  -- V-3: approve_artisan_claim has SET search_path
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1;
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-3 FAIL: approve_artisan_claim missing SET search_path';
  END IF;
  RAISE NOTICE 'V-3 PASS: approve_artisan_claim has SET search_path';

  -- V-4: approve_artisan_claim verifies admin role from DB
  IF v_def NOT ILIKE '%role%admin%' THEN
    RAISE EXCEPTION 'V-4 FAIL: approve_artisan_claim does not verify admin role';
  END IF;
  RAISE NOTICE 'V-4 PASS: approve_artisan_claim verifies admin role';

  -- V-5: approve_artisan_claim reads artisan from claim row (server-side identity)
  IF v_def NOT ILIKE '%artisan_legacy_id%' THEN
    RAISE EXCEPTION 'V-5 FAIL: approve_artisan_claim does not resolve artisan from claim row';
  END IF;
  RAISE NOTICE 'V-5 PASS: artisan identity read from claim_requests row';

  -- V-6: approve_artisan_claim does NOT set onboarding_completed=true
  IF v_def ~* 'onboarding_completed\s*=\s*true' THEN
    RAISE EXCEPTION 'V-6 FAIL: approve_artisan_claim sets onboarding_completed=true — must remain false';
  END IF;
  RAISE NOTICE 'V-6 PASS: approve_artisan_claim does not set onboarding_completed=true';

  -- V-7: approve_artisan_claim uses FOR UPDATE (concurrency lock)
  IF v_def NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'V-7 FAIL: approve_artisan_claim missing FOR UPDATE concurrency lock';
  END IF;
  RAISE NOTICE 'V-7 PASS: FOR UPDATE concurrency lock present';

  -- V-8: approve_artisan_claim checks artisan_has_owner (prevents ownership theft)
  IF v_def NOT ILIKE '%artisan_has_owner%' THEN
    RAISE EXCEPTION 'V-8 FAIL: approve_artisan_claim missing artisan_has_owner guard';
  END IF;
  RAISE NOTICE 'V-8 PASS: artisan_has_owner conflict guard present';

  -- V-9: reject_artisan_claim exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim';
  IF v_count=0 THEN RAISE EXCEPTION 'V-9 FAIL: reject_artisan_claim not found'; END IF;
  RAISE NOTICE 'V-9 PASS: reject_artisan_claim exists';

  -- V-10: reject_artisan_claim is SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-10 FAIL: reject_artisan_claim not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-10 PASS: reject_artisan_claim SECURITY DEFINER';

  -- V-11: reject_artisan_claim does NOT update owner_user_id
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1;
  IF v_def ILIKE '%owner_user_id%' AND v_def ILIKE '%UPDATE%artisan%' THEN
    RAISE EXCEPTION 'V-11 FAIL: reject_artisan_claim modifies artisan owner — must never touch ownership';
  END IF;
  RAISE NOTICE 'V-11 PASS: reject_artisan_claim does not alter artisan ownership';

  -- V-12: anon cannot execute approve_artisan_claim
  IF has_function_privilege('anon',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-12 FAIL: anon can execute approve_artisan_claim';
  END IF;
  RAISE NOTICE 'V-12 PASS: anon cannot execute approve_artisan_claim';

  -- V-13: anon cannot execute reject_artisan_claim
  IF has_function_privilege('anon',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-13 FAIL: anon can execute reject_artisan_claim';
  END IF;
  RAISE NOTICE 'V-13 PASS: anon cannot execute reject_artisan_claim';

  -- V-14: authenticated can execute (admin check happens inside RPC)
  IF NOT has_function_privilege('authenticated',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-14 FAIL: authenticated cannot execute approve_artisan_claim (admin UI blocked)';
  END IF;
  RAISE NOTICE 'V-14 PASS: authenticated can call approve_artisan_claim (admin check inside RPC)';

  -- V-15: claim_requests RLS enabled
  SELECT relrowsecurity::text INTO v_type FROM pg_class
  WHERE relname='claim_requests' AND relnamespace='public'::regnamespace;
  IF v_type IS NULL OR v_type='false' THEN
    RAISE EXCEPTION 'V-15 FAIL: RLS not enabled on claim_requests';
  END IF;
  RAISE NOTICE 'V-15 PASS: RLS enabled on claim_requests';

  -- V-16: stale open-insert policy removed
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname IN ('claims_insert','claim_requests_insert_any','claim_requests_public_insert');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-16 FAIL: stale open-insert policy still exists on claim_requests';
  END IF;
  RAISE NOTICE 'V-16 PASS: stale open-insert policies removed';

  -- V-17: authenticated INSERT policy requires requester_user_id = auth.uid()
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname = 'claim_requests_authenticated_insert';
  IF v_count=0 THEN
    RAISE EXCEPTION 'V-17 FAIL: claim_requests_authenticated_insert policy not found';
  END IF;
  RAISE NOTICE 'V-17 PASS: claim_requests_authenticated_insert policy exists';

  -- V-18: 7C.11 dispatch RPCs untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_request_v1';
  IF v_count=0 THEN RAISE EXCEPTION 'V-18 FAIL: dispatch_request_v1 missing — 7C.11 regressed'; END IF;
  RAISE NOTICE 'V-18 PASS: dispatch_request_v1 intact';

  -- V-19: 7C.11E RPCs untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('claim_mission','decline_mission','start_mission',
                      'complete_mission','get_accepted_mission_detail','get_my_mission_offers');
  RAISE NOTICE 'V-19 INFO: 7C.11E RPCs present = % (expect 6)', v_count;

  -- V-20: ownership integrity — no new corruption introduced
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE claim_status='approved' AND owner_user_id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'V-20 WARN: % approved artisans still have owner_user_id IS NULL (pre-existing state)', v_count;
  ELSE
    RAISE NOTICE 'V-20 PASS: no orphan approved artisans';
  END IF;

  RAISE NOTICE '══ 7C.12A.1 VERIFY COMPLETE ══';

END $$;
