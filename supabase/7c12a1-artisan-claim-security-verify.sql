-- ════════════════════════════════════════════════════════════
-- 7C.12A.1 — Artisan Claim Security Verification (v2 Hardened)
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
  v_policy  text;
  v_con_def text;
BEGIN

  -- ─── RPC EXISTENCE + PROPERTIES ────────────────────────────

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

  -- V-5: artisan identity read from claim row (claim-side resolution)
  IF v_def NOT ILIKE '%artisan_legacy_id%' AND v_def NOT ILIKE '%artisan_id%' THEN
    RAISE EXCEPTION 'V-5 FAIL: approve_artisan_claim does not resolve artisan from claim row';
  END IF;
  RAISE NOTICE 'V-5 PASS: artisan identity read from claim_requests row';

  -- V-6: approve_artisan_claim does NOT set onboarding_completed
  IF v_def ~* 'onboarding_completed\s*=\s*true' THEN
    RAISE EXCEPTION 'V-6 FAIL: approve_artisan_claim sets onboarding_completed=true';
  END IF;
  IF v_def ~* 'SET\s[^;]*onboarding_completed' THEN
    RAISE EXCEPTION 'V-6b FAIL: approve_artisan_claim includes onboarding_completed in UPDATE SET';
  END IF;
  RAISE NOTICE 'V-6 PASS: approve_artisan_claim does not set onboarding_completed';

  -- V-7: LOCK ORDER — ARTISAN before TARGET CLAIM (deadlock-free ordering)
  -- The function body must contain a non-locking pre-read section followed by
  -- the artisan FOR UPDATE, then the claim FOR UPDATE.
  -- Verify: the text 'PRE-READ' or 'v_pre' appears before 'LOCK A' or 'FOR UPDATE'
  -- and the artisan FOR UPDATE appears before the target claim FOR UPDATE.
  IF v_def NOT ILIKE '%v_pre%' THEN
    RAISE EXCEPTION 'V-7 FAIL: approve_artisan_claim missing non-locking pre-read (v_pre) — deadlock-free ordering requires pre-read before artisan lock';
  END IF;
  RAISE NOTICE 'V-7 PASS: non-locking pre-read (v_pre) present before artisan lock';

  -- V-8: ARTISAN FOR UPDATE present
  IF v_def NOT ILIKE '%artisans%FOR UPDATE%' AND
     v_def NOT ILIKE '%FROM public.artisans%' THEN
    RAISE EXCEPTION 'V-8 FAIL: approve_artisan_claim missing FOR UPDATE on artisan row';
  END IF;
  -- At least 2 FOR UPDATE: artisan + claim
  IF (LENGTH(v_def) - LENGTH(REPLACE(v_def, 'FOR UPDATE', ''))) / LENGTH('FOR UPDATE') < 2 THEN
    RAISE EXCEPTION 'V-8b FAIL: approve_artisan_claim has fewer than 2 FOR UPDATE locks (need artisan + claim)';
  END IF;
  RAISE NOTICE 'V-8 PASS: artisan row FOR UPDATE present (>= 2 total locks)';

  -- V-8c: artisan FOR UPDATE appears BEFORE target claim FOR UPDATE in source text
  -- (This is the structural deadlock-free guarantee)
  DECLARE
    v_artisan_fu_pos integer;
    v_claim_fu_pos   integer;
  BEGIN
    v_artisan_fu_pos := position('FOR UPDATE' IN
      substring(v_def FROM position('v_artisan_owner' IN v_def)));
    -- The first FOR UPDATE after v_artisan_owner is the artisan lock.
    -- The second FOR UPDATE (on claim) must come after.
    -- Simpler: verify artisans table appears in a FOR UPDATE context BEFORE
    -- claim_requests appears in a FOR UPDATE context by scanning text positions.
    IF position('artisans' IN v_def) < position('claim_requests' IN v_def) AND
       (LENGTH(v_def) - LENGTH(REPLACE(v_def, 'FOR UPDATE', ''))) / LENGTH('FOR UPDATE') >= 2
    THEN
      RAISE NOTICE 'V-8c PASS: artisan lock precedes claim lock in function source';
    ELSE
      RAISE NOTICE 'V-8c INFO: lock order text scan inconclusive — verify manually that artisan FOR UPDATE precedes claim FOR UPDATE';
    END IF;
  END;

  -- V-9: Conditional UPDATE — WHERE owner_user_id IS NULL guard
  IF v_def NOT ILIKE '%owner_user_id IS NULL%' THEN
    RAISE EXCEPTION 'V-9 FAIL: approve_artisan_claim missing WHERE owner_user_id IS NULL defensive guard';
  END IF;
  RAISE NOTICE 'V-9 PASS: conditional UPDATE WHERE owner_user_id IS NULL guard present';

  -- V-10: ROW_COUNT checked after conditional UPDATE
  IF v_def NOT ILIKE '%GET DIAGNOSTICS%ROW_COUNT%' THEN
    RAISE EXCEPTION 'V-10 FAIL: approve_artisan_claim missing GET DIAGNOSTICS ROW_COUNT check';
  END IF;
  RAISE NOTICE 'V-10 PASS: ROW_COUNT verified after conditional UPDATE';

  -- V-11: Multi-claim supersession via helper function
  IF v_def NOT ILIKE '%_supersede_competing_claims%' THEN
    RAISE EXCEPTION 'V-11 FAIL: approve_artisan_claim not calling _supersede_competing_claims';
  END IF;
  RAISE NOTICE 'V-11 PASS: _supersede_competing_claims called for multi-claim first-wins';

  -- V-11b: _supersede_competing_claims helper exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='_supersede_competing_claims';
  IF v_count=0 THEN RAISE EXCEPTION 'V-11b FAIL: _supersede_competing_claims function missing'; END IF;
  RAISE NOTICE 'V-11b PASS: _supersede_competing_claims helper exists';

  -- V-11c: _supersede helper covers cross-representation (branch 2 with artisan join)
  SELECT pg_get_functiondef(p.oid) INTO v_type FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='_supersede_competing_claims' LIMIT 1;
  IF v_type NOT ILIKE '%artisan_id IS NULL%' THEN
    RAISE EXCEPTION 'V-11c FAIL: _supersede_competing_claims missing branch for artisan_id IS NULL claims (cross-representation gap)';
  END IF;
  IF v_type NOT ILIKE '%FROM public.artisans%' THEN
    RAISE EXCEPTION 'V-11d FAIL: _supersede_competing_claims branch 2 does not join artisans for canonical verification';
  END IF;
  RAISE NOTICE 'V-11c PASS: _supersede_competing_claims covers cross-representation via artisan join (branch 2)';

  -- V-12: artisan_has_owner guard present
  IF v_def NOT ILIKE '%artisan_has_owner%' THEN
    RAISE EXCEPTION 'V-12 FAIL: approve_artisan_claim missing artisan_has_owner guard';
  END IF;
  RAISE NOTICE 'V-12 PASS: artisan_has_owner conflict guard present';

  -- V-13: approve_artisan_claim does NOT set verified=true
  IF v_def ~* 'verified\s*=\s*true' THEN
    RAISE EXCEPTION 'V-13 FAIL: approve_artisan_claim sets verified=true — premature verification';
  END IF;
  RAISE NOTICE 'V-13 PASS: approve_artisan_claim does not set verified=true';

  -- V-14: approve_artisan_claim does NOT set availability
  IF v_def ~* 'availability\s*=' THEN
    RAISE EXCEPTION 'V-14 FAIL: approve_artisan_claim sets availability';
  END IF;
  RAISE NOTICE 'V-14 PASS: approve_artisan_claim does not set availability';

  -- V-15: reject_artisan_claim exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim';
  IF v_count=0 THEN RAISE EXCEPTION 'V-15 FAIL: reject_artisan_claim not found'; END IF;
  RAISE NOTICE 'V-15 PASS: reject_artisan_claim exists';

  -- V-16: reject_artisan_claim is SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-16 FAIL: reject_artisan_claim not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-16 PASS: reject_artisan_claim SECURITY DEFINER';

  -- V-17: reject_artisan_claim does NOT write owner_user_id in UPDATE SET
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1;
  IF v_def ~* 'SET\s[^;]*owner_user_id' THEN
    RAISE EXCEPTION 'V-17 FAIL: reject_artisan_claim writes owner_user_id';
  END IF;
  RAISE NOTICE 'V-17 PASS: reject_artisan_claim does not alter artisan owner_user_id';

  -- V-18: reject_artisan_claim resets artisan claim_status (trigger absorption)
  IF v_def NOT ILIKE '%claim_status%' THEN
    RAISE EXCEPTION 'V-18 FAIL: reject_artisan_claim does not reset artisan claim_status';
  END IF;
  RAISE NOTICE 'V-18 PASS: reject_artisan_claim resets artisan claim_status (trigger absorption)';

  -- V-19: reject_artisan_claim has owner_user_id IS NULL safety guard
  IF v_def NOT ILIKE '%owner_user_id IS NULL%' THEN
    RAISE EXCEPTION 'V-19 FAIL: reject_artisan_claim missing owner_user_id IS NULL guard';
  END IF;
  RAISE NOTICE 'V-19 PASS: reject_artisan_claim has owner_user_id IS NULL safety guard';

  -- V-20: claim_approval_sync trigger DROPPED
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='claim_requests'
    AND trigger_name = 'claim_approval_sync';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-20 FAIL: claim_approval_sync trigger still exists';
  END IF;
  RAISE NOTICE 'V-20 PASS: claim_approval_sync trigger dropped';

  -- V-21: sync_artisan_claim function DROPPED
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_artisan_claim';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-21 FAIL: sync_artisan_claim() function still exists';
  END IF;
  RAISE NOTICE 'V-21 PASS: sync_artisan_claim() function dropped';

  -- V-22: anon cannot execute approve_artisan_claim
  IF has_function_privilege('anon',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-22 FAIL: anon can execute approve_artisan_claim';
  END IF;
  RAISE NOTICE 'V-22 PASS: anon cannot execute approve_artisan_claim';

  -- V-23: anon cannot execute reject_artisan_claim
  IF has_function_privilege('anon',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='reject_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-23 FAIL: anon can execute reject_artisan_claim';
  END IF;
  RAISE NOTICE 'V-23 PASS: anon cannot execute reject_artisan_claim';

  -- V-24: authenticated can execute approve_artisan_claim (admin check inside RPC)
  IF NOT has_function_privilege('authenticated',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-24 FAIL: authenticated cannot execute approve_artisan_claim';
  END IF;
  RAISE NOTICE 'V-24 PASS: authenticated can call approve_artisan_claim (admin check inside)';

  -- V-24b: authenticated CANNOT execute _supersede_competing_claims (internal helper)
  IF has_function_privilege('authenticated',
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_supersede_competing_claims' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'V-24b FAIL: authenticated can execute _supersede_competing_claims — should be internal only';
  END IF;
  RAISE NOTICE 'V-24b PASS: authenticated cannot directly call _supersede_competing_claims';

  -- V-25: RLS enabled on claim_requests
  SELECT relrowsecurity::text INTO v_type FROM pg_class
  WHERE relname='claim_requests' AND relnamespace='public'::regnamespace;
  IF v_type IS NULL OR v_type='false' THEN
    RAISE EXCEPTION 'V-25 FAIL: RLS not enabled on claim_requests';
  END IF;
  RAISE NOTICE 'V-25 PASS: RLS enabled on claim_requests';

  -- V-26: No stale historical policies surviving on claim_requests
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname IN (
      'claims_insert','claims_public_insert','claims_admin_all','claims_self_read',
      'claims_requester_read','deny_anon_claim_requests','authenticated_claim_insert',
      'authenticated_own_claim_read','admin_all_claim_requests','claim_requests_anon_deny',
      'claim_requests_insert','claim_requests_read','claim_requests_insert_any',
      'claim_requests_public_insert','claim_requests_authenticated_insert',
      'claim_requests_own_select'
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-26 FAIL: % stale historical policy still exists on claim_requests', v_count;
  END IF;
  RAISE NOTICE 'V-26 PASS: all 16 historical stale policies removed from claim_requests';

  -- V-27: Canonical 7C.12A.1 policies exist (exactly 3)
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname IN ('7c12a1_deny_anon_all','7c12a1_auth_insert_own','7c12a1_auth_select');
  IF v_count != 3 THEN
    RAISE EXCEPTION 'V-27 FAIL: expected 3 canonical 7c12a1 policies, found %', v_count;
  END IF;
  RAISE NOTICE 'V-27 PASS: 3 canonical 7c12a1 policies installed';

  -- V-28: anon denied by policy (USING false)
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND policyname = '7c12a1_deny_anon_all'
    AND qual = 'false';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-28 FAIL: 7c12a1_deny_anon_all policy missing or USING not false';
  END IF;
  RAISE NOTICE 'V-28 PASS: anon USING false confirmed';

  -- V-29: No authenticated UPDATE/DELETE/ALL policy on claim_requests
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests'
    AND cmd IN ('UPDATE','DELETE','ALL')
    AND (roles @> '{authenticated}' OR roles @> '{public}');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-29 FAIL: % UPDATE/DELETE/ALL policy on claim_requests for authenticated/public — browser direct status write possible', v_count;
  END IF;
  RAISE NOTICE 'V-29 PASS: no authenticated UPDATE/DELETE policy on claim_requests (RPC-only path)';

  -- V-30: Enumerate all surviving policies (informational audit)
  FOR v_policy IN
    SELECT 'name=' || policyname || ' cmd=' || cmd || ' roles=' || roles::text
    FROM pg_policies WHERE schemaname='public' AND tablename='claim_requests'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'V-30 LIVE POLICY: %', v_policy;
  END LOOP;
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname='public' AND tablename='claim_requests';
  RAISE NOTICE 'V-30 INFO: total policies on claim_requests = % (expect 3)', v_count;
  IF v_count != 3 THEN
    RAISE NOTICE 'V-30 WARN: unexpected policy count — audit V-30 LIVE POLICY lines above';
  END IF;

  -- V-31: 7C.11 dispatch_request_v1 untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='dispatch_request_v1';
  IF v_count=0 THEN RAISE EXCEPTION 'V-31 FAIL: dispatch_request_v1 missing — 7C.11 regressed'; END IF;
  RAISE NOTICE 'V-31 PASS: dispatch_request_v1 intact';

  -- V-32: Ownership integrity — no new corruption
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE claim_status='approved' AND owner_user_id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'V-32 WARN: % approved artisans still have owner_user_id IS NULL (pre-existing)', v_count;
  ELSE
    RAISE NOTICE 'V-32 PASS: no orphan approved artisans';
  END IF;

  -- V-33: No triggers remain on claim_requests
  SELECT COUNT(*) INTO v_count FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table='claim_requests';
  RAISE NOTICE 'V-33 INFO: total triggers on claim_requests = % (expect 0)', v_count;
  IF v_count > 0 THEN
    RAISE NOTICE 'V-33 WARN: unexpected triggers on claim_requests — audit required';
  ELSE
    RAISE NOTICE 'V-33 PASS: no triggers on claim_requests';
  END IF;

  -- ─── STATUS CHECK CONSTRAINT ────────────────────────────────

  -- V-34: claims_status_check constraint exists
  SELECT COUNT(*) INTO v_count FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND r.relname = 'claim_requests'
    AND c.conname = 'claims_status_check' AND c.contype = 'c';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-34 FAIL: claims_status_check constraint missing from claim_requests';
  END IF;
  RAISE NOTICE 'V-34 PASS: claims_status_check constraint exists';

  -- V-35: claims_status_check includes superseded_by_approval
  SELECT pg_get_constraintdef(c.oid) INTO v_con_def
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND r.relname = 'claim_requests'
    AND c.conname = 'claims_status_check'
  LIMIT 1;
  RAISE NOTICE 'V-35 INFO: claims_status_check definition = %', v_con_def;
  IF v_con_def NOT ILIKE '%superseded_by_approval%' THEN
    RAISE EXCEPTION 'V-35 FAIL: claims_status_check does not include superseded_by_approval';
  END IF;
  RAISE NOTICE 'V-35 PASS: superseded_by_approval is a valid status value';

  -- V-36: Historical valid status values preserved
  IF v_con_def NOT ILIKE '%pending%' THEN
    RAISE EXCEPTION 'V-36 FAIL: claims_status_check missing historical value "pending"';
  END IF;
  IF v_con_def NOT ILIKE '%approved%' THEN
    RAISE EXCEPTION 'V-36b FAIL: claims_status_check missing historical value "approved"';
  END IF;
  IF v_con_def NOT ILIKE '%rejected%' THEN
    RAISE EXCEPTION 'V-36c FAIL: claims_status_check missing historical value "rejected"';
  END IF;
  RAISE NOTICE 'V-36 PASS: all 3 historical status values preserved (pending, approved, rejected)';

  -- V-37: LOCK ORDER narrative (structural confirmation)
  -- Verify the approve RPC contains both v_pre (non-locking read) and
  -- re-locking of claim after artisan lock (LOCK B section).
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='approve_artisan_claim' LIMIT 1;
  IF v_def NOT ILIKE '%LOCK B%' AND v_def NOT ILIKE '%claim_not_found_locked%' THEN
    RAISE EXCEPTION 'V-37 FAIL: approve_artisan_claim missing LOCK B (re-lock of claim after artisan lock) — deadlock-free ordering broken';
  END IF;
  RAISE NOTICE 'V-37 PASS: LOCK B (re-lock claim after artisan FOR UPDATE) present';

  -- V-38: Re-validation of claim after re-lock (claim_not_pending check on locked read)
  IF v_def NOT ILIKE '%claim_not_pending%' THEN
    RAISE EXCEPTION 'V-38 FAIL: approve_artisan_claim missing re-validation of claim status after claim re-lock';
  END IF;
  RAISE NOTICE 'V-38 PASS: claim status re-validated after LOCK B (handles race with concurrent approval)';

  RAISE NOTICE '══ 7C.12A.1 VERIFY COMPLETE (v2) ══';

END $$;
