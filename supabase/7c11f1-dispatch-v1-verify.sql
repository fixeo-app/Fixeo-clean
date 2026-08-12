-- ════════════════════════════════════════════════════════════
-- 7C.11F.1 — Dispatch V1 Verification (run AFTER migration)
-- supabase/7c11f1-dispatch-v1-verify.sql
--
-- All V-checks must pass before 11F.1 is considered applied.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count    integer;
  v_def      text;
  v_secdef   boolean;
  v_nullable text;
BEGIN

  -- V-1: dispatch_request_v1 exists
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-1 FAIL: dispatch_request_v1 not found'; END IF;
  RAISE NOTICE 'V-1 PASS: dispatch_request_v1 exists';

  -- V-2: SECURITY DEFINER
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'dispatch_request_v1' LIMIT 1;
  IF NOT v_secdef THEN RAISE EXCEPTION 'V-2 FAIL: dispatch_request_v1 not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'V-2 PASS: dispatch_request_v1 SECURITY DEFINER';

  -- V-3: SET search_path guard
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'dispatch_request_v1' LIMIT 1;
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-3 FAIL: dispatch_request_v1 missing SET search_path';
  END IF;
  RAISE NOTICE 'V-3 PASS: search_path guard present';

  -- V-4: service_role has EXECUTE
  SELECT COUNT(*) INTO v_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  JOIN   pg_auth_members am ON am.roleid = p.oid
  WHERE  n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  -- (Direct ACL check via has_function_privilege)
  IF NOT has_function_privilege('service_role',
       (SELECT p.oid FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='dispatch_request_v1' LIMIT 1),
       'EXECUTE') THEN
    RAISE EXCEPTION 'V-4 FAIL: service_role lacks EXECUTE on dispatch_request_v1';
  END IF;
  RAISE NOTICE 'V-4 PASS: service_role has EXECUTE';

  -- V-5: authenticated does NOT have EXECUTE
  IF has_function_privilege('authenticated',
       (SELECT p.oid FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='dispatch_request_v1' LIMIT 1),
       'EXECUTE') THEN
    RAISE EXCEPTION 'V-5 FAIL: authenticated has EXECUTE on dispatch_request_v1 (browser leak)';
  END IF;
  RAISE NOTICE 'V-5 PASS: authenticated cannot execute dispatch_request_v1';

  -- V-6: anon does NOT have EXECUTE
  IF has_function_privilege('anon',
       (SELECT p.oid FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='dispatch_request_v1' LIMIT 1),
       'EXECUTE') THEN
    RAISE EXCEPTION 'V-6 FAIL: anon has EXECUTE on dispatch_request_v1';
  END IF;
  RAISE NOTICE 'V-6 PASS: anon cannot execute dispatch_request_v1';

  -- V-7: body uses ::text cast (TYPE CONTRACT)
  IF v_def NOT ILIKE '%::text%' THEN
    RAISE EXCEPTION 'V-7 FAIL: dispatch_request_v1 missing ::text cast (TEXT/UUID contract)';
  END IF;
  RAISE NOTICE 'V-7 PASS: ::text cast present';

  -- V-8: body does NOT cast request_id to uuid
  IF v_def ILIKE '%request_id::uuid%' THEN
    RAISE EXCEPTION 'V-8 FAIL: dispatch_request_v1 contains request_id::uuid (TYPE CONTRACT violation)';
  END IF;
  RAISE NOTICE 'V-8 PASS: no request_id::uuid cast';

  -- V-9: owner_user_id IS NOT NULL guard present in body
  IF v_def NOT ILIKE '%owner_user_id%' OR v_def NOT ILIKE '%IS NOT NULL%' THEN
    RAISE EXCEPTION 'V-9 FAIL: dispatch_request_v1 missing owner_user_id IS NOT NULL eligibility guard';
  END IF;
  RAISE NOTICE 'V-9 PASS: owner_user_id IS NOT NULL guard present';

  -- V-10: claim_status = approved guard present
  IF v_def NOT ILIKE '%claim_status%' OR v_def NOT ILIKE '%approved%' THEN
    RAISE EXCEPTION 'V-10 FAIL: dispatch_request_v1 missing claim_status=approved guard';
  END IF;
  RAISE NOTICE 'V-10 PASS: claim_status=approved guard present';

  -- V-11: availability = available guard present
  IF v_def NOT ILIKE '%availability%' THEN
    RAISE EXCEPTION 'V-11 FAIL: dispatch_request_v1 missing availability guard';
  END IF;
  RAISE NOTICE 'V-11 PASS: availability guard present';

  -- V-12: prior-offer exclusion (NOT EXISTS subquery) present
  IF v_def NOT ILIKE '%NOT EXISTS%' THEN
    RAISE EXCEPTION 'V-12 FAIL: dispatch_request_v1 missing prior-offer exclusion (NOT EXISTS)';
  END IF;
  RAISE NOTICE 'V-12 PASS: prior-offer exclusion present';

  -- V-13: FOR UPDATE lock on service_requests present
  IF v_def NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'V-13 FAIL: dispatch_request_v1 missing FOR UPDATE lock';
  END IF;
  RAISE NOTICE 'V-13 PASS: FOR UPDATE concurrency lock present';

  -- V-14: agreed_price is nullable after Step 0
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'agreed_price';
  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'V-14 FAIL: missions.agreed_price column not found';
  END IF;
  IF v_nullable != 'YES' THEN
    RAISE EXCEPTION 'V-14 FAIL: missions.agreed_price is still NOT NULL after Step 0 — migration incomplete';
  END IF;
  RAISE NOTICE 'V-14 PASS: missions.agreed_price is nullable — NULL offer insert is valid';

  -- V-14b: agreed_price CHECK constraint preserved (if any)
  SELECT pg_get_constraintdef(c.oid) INTO v_nullable  -- reusing variable as text
  FROM pg_constraint c
  WHERE c.conrelid = 'public.missions'::regclass
    AND c.contype  = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%agreed_price%'
  LIMIT 1;
  IF v_nullable IS NOT NULL THEN
    RAISE NOTICE 'V-14b PASS: agreed_price CHECK constraint preserved: %', v_nullable;
  ELSE
    RAISE NOTICE 'V-14b INFO: no agreed_price CHECK constraint (none required)';
  END IF;

  -- V-14c: dispatch RPC does not invent a fake price (no agreed_price=0 or hardcoded value)
  IF v_def ILIKE '%agreed_price%0%' OR
     (v_def ILIKE '%agreed_price%' AND v_def NOT ILIKE '%agreed_price%NULL%') THEN
    RAISE EXCEPTION 'V-14c FAIL: dispatch_request_v1 may be inventing or hardcoding agreed_price';
  END IF;
  RAISE NOTICE 'V-14c PASS: dispatch RPC inserts agreed_price=NULL — no fake price';

  -- V-15: no_candidate returns ok:false (not destructive)
  IF v_def NOT ILIKE '%no_candidate%' THEN
    RAISE EXCEPTION 'V-15 FAIL: dispatch_request_v1 missing no_candidate result';
  END IF;
  RAISE NOTICE 'V-15 PASS: no_candidate result present';

  -- V-16: unique_violation handler present (23505 concurrency guard)
  IF v_def NOT ILIKE '%unique_violation%' THEN
    RAISE EXCEPTION 'V-16 FAIL: dispatch_request_v1 missing unique_violation handler';
  END IF;
  RAISE NOTICE 'V-16 PASS: unique_violation handler present';

  -- V-17: no alias-qualified SET targets (PostgreSQL syntax rule)
  IF v_def ~ 'SET\s+[a-z]+\.' THEN
    RAISE EXCEPTION 'V-17 FAIL: dispatch_request_v1 has alias-qualified SET target';
  END IF;
  RAISE NOTICE 'V-17 PASS: no alias-qualified SET targets';

  -- V-18: missions_one_offer_per_request index still exists (11C guard preserved)
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'missions'
    AND indexname = 'missions_one_offer_per_request';
  IF v_count = 0 THEN RAISE EXCEPTION 'V-18 FAIL: missions_one_offer_per_request index missing'; END IF;
  RAISE NOTICE 'V-18 PASS: missions_one_offer_per_request index intact';

  -- V-19: current offered missions (informational)
  SELECT COUNT(*) INTO v_count FROM public.missions WHERE status = 'offered';
  RAISE NOTICE 'V-19 INFO: current offered missions = %', v_count;

  -- V-20: no_match guard — function does NOT set no_match automatically
  -- (negative: no 'no_match' status transition in body)
  IF v_def ILIKE '%no_match%' AND v_def ILIKE '%SET%status%' THEN
    RAISE EXCEPTION 'V-20 FAIL: dispatch_request_v1 may be auto-setting no_match status';
  END IF;
  RAISE NOTICE 'V-20 PASS: no automatic no_match status transition';

  -- V-21: service mismatch is eliminated (CONTINUE keyword present in mismatch branch)
  IF v_def NOT ILIKE '%CONTINUE%' THEN
    RAISE EXCEPTION 'V-21 FAIL: dispatch_request_v1 missing CONTINUE elimination for service/city mismatch';
  END IF;
  RAISE NOTICE 'V-21 PASS: CONTINUE elimination for mismatch present';

  -- V-22: unaccent() NOT used (would fail with empty search_path if extension not in pg_catalog)
  IF v_def ILIKE '%unaccent(%' THEN
    RAISE EXCEPTION 'V-22 FAIL: dispatch_request_v1 uses unaccent() — unsafe with SET search_path=''';
  END IF;
  RAISE NOTICE 'V-22 PASS: unaccent() not used — translate() used instead';

  -- V-23: translate() used for normalization (pg_catalog, always safe)
  IF v_def NOT ILIKE '%translate(%' THEN
    RAISE EXCEPTION 'V-23 FAIL: dispatch_request_v1 missing translate() normalization';
  END IF;
  RAISE NOTICE 'V-23 PASS: translate() normalization present';

  -- V-24: 23505 handler verifies offered row before returning ok:true
  -- (must not return ok:true solely on SQLSTATE)
  IF v_def NOT ILIKE '%status%=%offered%' THEN
    RAISE EXCEPTION 'V-24 FAIL: 23505 handler does not verify offered row';
  END IF;
  RAISE NOTICE 'V-24 PASS: 23505 handler verifies offered row before ok:true';

  -- V-25: correct 15-char translate source string present (7C.11F.1C normalization)
  IF v_def NOT ILIKE '%éèêëàâäôöùûüïîç%' THEN
    RAISE EXCEPTION 'V-25 FAIL: dispatch_request_v1 missing correct 15-char translate source';
  END IF;
  RAISE NOTICE 'V-25 PASS: correct 15-char translate source present';

  -- V-26: correct 15-char translate target string present
  IF v_def NOT ILIKE '%eeeeaaaoouuuiic%' THEN
    RAISE EXCEPTION 'V-26 FAIL: dispatch_request_v1 missing correct 15-char translate target';
  END IF;
  RAISE NOTICE 'V-26 PASS: correct 15-char translate target present';

  -- V-27: empty-string artisan guard present (v_art_cat_norm = '' CONTINUE)
  IF v_def NOT ILIKE '%v_art_cat_norm = ''''%' AND v_def NOT ILIKE "%v_art_cat_norm = ''%" THEN
    RAISE EXCEPTION 'V-27 FAIL: dispatch_request_v1 missing empty artisan-category CONTINUE guard';
  END IF;
  RAISE NOTICE 'V-27 PASS: empty artisan-category guard present';

  RAISE NOTICE '══ 7C.11F.1 VERIFY COMPLETE ══';

END $$;
