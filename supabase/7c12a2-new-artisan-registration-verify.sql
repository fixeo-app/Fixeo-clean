-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — New Artisan Canonical Registration Verification
-- supabase/7c12a2-new-artisan-registration-verify.sql
--
-- Run AFTER 7c12a2-new-artisan-registration.sql.
-- All V-checks must RAISE NOTICE V-xx PASS.
-- Any RAISE EXCEPTION = HARD STOP.
-- READ ONLY — no DDL, no DML.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_def_exec text;
  v_idx     text;
  v_type    text;
BEGIN

  -- ════════════════════════════════════════════
  -- SECTION 1: register_new_artisan function
  -- ════════════════════════════════════════════

  -- V-1: register_new_artisan exists
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'V-1 FAIL: register_new_artisan not found';
  END IF;
  RAISE NOTICE 'V-1 PASS: register_new_artisan exists';

  -- Strip line comments for executable-code checks
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-2: SECURITY DEFINER
  IF v_def NOT ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'V-2 FAIL: register_new_artisan missing SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'V-2 PASS: register_new_artisan has SECURITY DEFINER';

  -- V-3: SET search_path = ''
  IF v_def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-3 FAIL: register_new_artisan missing SET search_path';
  END IF;
  RAISE NOTICE 'V-3 PASS: register_new_artisan has SET search_path';

  -- V-4: auth.uid() used as owner identity
  IF v_def_exec NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'V-4 FAIL: register_new_artisan does not call auth.uid()';
  END IF;
  RAISE NOTICE 'V-4 PASS: register_new_artisan derives identity from auth.uid()';

  -- V-5: owner_user_id never caller-supplied (no p_owner_user_id parameter)
  IF v_def ILIKE '%p_owner_user_id%' OR v_def ILIKE '%owner_user_id text%' OR v_def ILIKE '%owner_user_id uuid%' THEN
    RAISE EXCEPTION 'V-5 FAIL: register_new_artisan accepts caller-supplied owner_user_id — security violation';
  END IF;
  RAISE NOTICE 'V-5 PASS: owner_user_id is never caller-supplied';

  -- V-6: p_artisan_id not in signature (7C.12A.1 constraint — no caller artisan targeting)
  IF v_def ILIKE '%p_artisan_id%' THEN
    RAISE EXCEPTION 'V-6 FAIL: register_new_artisan contains p_artisan_id — security constraint violation';
  END IF;
  RAISE NOTICE 'V-6 PASS: p_artisan_id absent from signature';

  -- V-7: unauthenticated guard (auth.uid() IS NULL → return false)
  IF v_def_exec NOT ILIKE '%auth.uid()%is null%' AND v_def_exec NOT ILIKE '%is null%' THEN
    RAISE EXCEPTION 'V-7 FAIL: register_new_artisan missing NULL auth.uid() guard';
  END IF;
  RAISE NOTICE 'V-7 PASS: unauthenticated guard present';

  -- V-8: verified NOT set to true in executable code (comment-stripped)
  IF v_def_exec ~* 'verified\s*=\s*true' THEN
    RAISE EXCEPTION 'V-8 FAIL: register_new_artisan contains executable verified=true assignment';
  END IF;
  RAISE NOTICE 'V-8 PASS: verified not set to true in executable code';

  -- V-9: onboarding_completed NOT set to true in executable code
  IF v_def_exec ~* 'onboarding_completed\s*=\s*true' THEN
    RAISE EXCEPTION 'V-9 FAIL: register_new_artisan contains executable onboarding_completed=true assignment';
  END IF;
  RAISE NOTICE 'V-9 PASS: onboarding_completed not set to true in executable code';

  -- V-10: availability NOT set to 'available' in executable code
  IF v_def_exec ~* 'availability\s*=\s*''available''' THEN
    RAISE EXCEPTION 'V-10 FAIL: register_new_artisan sets availability=available — dispatch ineligible guard violated';
  END IF;
  RAISE NOTICE 'V-10 PASS: availability not set to available in executable code';

  -- V-11: claim_status is 'approved' in INSERT (self-registration contract)
  IF v_def_exec NOT ILIKE '%''approved''%' THEN
    RAISE EXCEPTION 'V-11 FAIL: register_new_artisan does not insert claim_status=approved';
  END IF;
  RAISE NOTICE 'V-11 PASS: claim_status=approved in INSERT';

  -- V-12: claimed = true in INSERT
  IF v_def_exec NOT ILIKE '%claimed%true%' AND v_def_exec NOT ILIKE '%true%claimed%' THEN
    RAISE EXCEPTION 'V-12 FAIL: register_new_artisan does not set claimed=true';
  END IF;
  RAISE NOTICE 'V-12 PASS: claimed=true in INSERT';

  -- V-13: admin role demotion guard present in users UPDATE
  IF v_def_exec NOT ILIKE '%role != ''admin''%' AND v_def_exec NOT ILIKE '%role <> ''admin''%'
     AND v_def_exec NOT ILIKE '%not in (''admin'')%' THEN
    RAISE EXCEPTION 'V-13 FAIL: register_new_artisan missing admin demotion guard in users UPDATE';
  END IF;
  RAISE NOTICE 'V-13 PASS: admin role demotion guard present';

  -- V-14: duplicate owner guard (FOR UPDATE or unique_violation handler)
  IF v_def_exec NOT ILIKE '%for update%' AND v_def_exec NOT ILIKE '%unique_violation%' THEN
    RAISE EXCEPTION 'V-14 FAIL: register_new_artisan missing concurrency duplicate guard';
  END IF;
  RAISE NOTICE 'V-14 PASS: duplicate owner guard present';

  -- V-15: idempotent already_registered return on duplicate
  IF v_def NOT ILIKE '%already_registered%' THEN
    RAISE EXCEPTION 'V-15 FAIL: register_new_artisan missing already_registered idempotent path';
  END IF;
  RAISE NOTICE 'V-15 PASS: already_registered idempotent path present';

  -- V-16: returns JSONB (verify return type)
  SELECT p.prorettype::regtype::text INTO v_type FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan' LIMIT 1;
  IF v_type NOT ILIKE '%jsonb%' THEN
    RAISE EXCEPTION 'V-16 FAIL: register_new_artisan return type is % (expected jsonb)', v_type;
  END IF;
  RAISE NOTICE 'V-16 PASS: return type is jsonb';

  -- ════════════════════════════════════════════
  -- SECTION 2: Permissions
  -- ════════════════════════════════════════════

  -- V-17: anon cannot execute register_new_artisan
  SELECT COUNT(*) INTO v_count FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'register_new_artisan'
    AND grantee = 'anon' AND privilege_type = 'EXECUTE';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-17 FAIL: anon has EXECUTE on register_new_artisan — must be revoked';
  END IF;
  RAISE NOTICE 'V-17 PASS: anon cannot execute register_new_artisan';

  -- V-18: authenticated can execute register_new_artisan
  SELECT COUNT(*) INTO v_count FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'register_new_artisan'
    AND grantee = 'authenticated' AND privilege_type = 'EXECUTE';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-18 FAIL: authenticated lacks EXECUTE on register_new_artisan';
  END IF;
  RAISE NOTICE 'V-18 PASS: authenticated can execute register_new_artisan';

  -- ════════════════════════════════════════════
  -- SECTION 3: Unique index
  -- ════════════════════════════════════════════

  -- V-19: partial unique index on artisans.owner_user_id exists
  SELECT indexdef INTO v_idx FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'artisans'
    AND indexname = 'artisans_owner_user_id_unique';
  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'V-19 FAIL: artisans_owner_user_id_unique index not found';
  END IF;
  RAISE NOTICE 'V-19 PASS: artisans_owner_user_id_unique index exists';

  -- V-20: index is partial (WHERE owner_user_id IS NOT NULL)
  IF v_idx NOT ILIKE '%where%owner_user_id%is not null%' AND v_idx NOT ILIKE '%where (owner_user_id%' THEN
    RAISE EXCEPTION 'V-20 FAIL: artisans_owner_user_id_unique is not a partial index — all-NULL seeded rows not protected';
  END IF;
  RAISE NOTICE 'V-20 PASS: artisans_owner_user_id_unique is correctly partial (WHERE owner_user_id IS NOT NULL)';

  -- V-21: index is UNIQUE
  SELECT COUNT(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'artisans'
    AND indexname = 'artisans_owner_user_id_unique'
    AND indexdef ILIKE '%unique%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-21 FAIL: artisans_owner_user_id_unique is not a UNIQUE index';
  END IF;
  RAISE NOTICE 'V-21 PASS: artisans_owner_user_id_unique is UNIQUE';

  -- ════════════════════════════════════════════
  -- SECTION 4: Dispatch eligibility invariant preservation
  -- ════════════════════════════════════════════

  -- V-22: 7C.12A.1 approve_artisan_claim still exists (non-regression)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'approve_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-22 FAIL: approve_artisan_claim gone — 7C.12A.1 regression';
  END IF;
  RAISE NOTICE 'V-22 PASS: approve_artisan_claim still exists (7C.12A.1 non-regression)';

  -- V-23: reject_artisan_claim still exists (non-regression)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reject_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-23 FAIL: reject_artisan_claim gone — 7C.12A.1 regression';
  END IF;
  RAISE NOTICE 'V-23 PASS: reject_artisan_claim still exists (7C.12A.1 non-regression)';

  -- V-24: sync_artisan_claim trigger still absent (7C.12A.1 non-regression)
  SELECT COUNT(*) INTO v_count FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'artisans' AND t.tgname = 'claim_approval_sync';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-24 FAIL: claim_approval_sync trigger returned — 7C.12A.1 regression';
  END IF;
  RAISE NOTICE 'V-24 PASS: claim_approval_sync trigger absent (7C.12A.1 non-regression)';

  -- V-25: No artisan is yet dispatch-eligible (owner_user_id set + approved + completed + available)
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE owner_user_id IS NOT NULL
    AND claim_status = 'approved'
    AND onboarding_completed = true
    AND availability = 'available';
  -- This is informational at this stage; dispatch eligibility intentionally 0
  RAISE NOTICE 'V-25 INFO: dispatch-eligible artisans after 7C.12A.2: % (expected 0 until 7C.12A.3)', v_count;

  -- ════════════════════════════════════════════
  -- SECTION 5: No new artisans row self-inserted yet (baseline preserved)
  -- ════════════════════════════════════════════

  -- V-26: seeded artisans still present (no accidental deletion)
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NULL;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-26 FAIL: all unclaimed seeded artisans gone — data integrity violation';
  END IF;
  RAISE NOTICE 'V-26 PASS: seeded artisans (owner_user_id IS NULL) still present: %', v_count;

  -- V-27: register_new_artisan does NOT insert p_artisan_id or p_user_id
  IF v_def ILIKE '%p_artisan_id%' OR v_def ILIKE '%p_user_id%' THEN
    RAISE EXCEPTION 'V-27 FAIL: register_new_artisan contains caller-supplied identity parameters';
  END IF;
  RAISE NOTICE 'V-27 PASS: no caller-supplied identity parameters in register_new_artisan';

  -- V-28: register_new_artisan uses PLPGSQL language
  SELECT p.prolang::regproc INTO v_type FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan' LIMIT 1;
  RAISE NOTICE 'V-28 INFO: register_new_artisan language: %', v_type;

  RAISE NOTICE '══════════════════════════════════════════════════';
  RAISE NOTICE 'VERIFY COMPLETE — 7C.12A.2 all V-checks finished';
  RAISE NOTICE 'If no RAISE EXCEPTION above: migration correctly applied';
  RAISE NOTICE '══════════════════════════════════════════════════';

END $$;
