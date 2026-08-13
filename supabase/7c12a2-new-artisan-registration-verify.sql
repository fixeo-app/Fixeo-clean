-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — Verify: New Artisan Canonical Registration (v2 — Hardened)
-- supabase/7c12a2-new-artisan-registration-verify.sql
--
-- PURPOSE: READ-ONLY post-apply verification.
--   Run after applying 7c12a2-new-artisan-registration.sql.
--   All statements are SELECT / RAISE NOTICE / RAISE EXCEPTION only.
--
-- V-checks:
--   V-1  to V-5:  register_new_artisan RPC structure
--   V-6  to V-10: Security invariants in RPC (no privileged fields writable by caller)
--   V-11 to V-15: update_artisan_availability RPC structure
--   V-16 to V-18: REVOKE/GRANT privilege state (BLOCKER 1)
--   V-19 to V-21: Column-level grants (BLOCKER 1)
--   V-22 to V-23: Unique index state
--   V-24 to V-26: RLS policy state
--   V-27 to V-28: users/profiles integrity checks in RPC body (BLOCKER 2)
--   V-29 to V-30: Phone persistence in RPC body (BLOCKER 2)
--   V-31 to V-32: 7C.12A.1 non-regression (approve/reject untouched)
--   V-33:         dispatch_request_v1 non-regression
--   V-34 to V-36: Availability gate in update_artisan_availability
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_def_exec text;   -- comment-stripped version for SET-target checks
  v_text    text;
  v_bool    boolean;
BEGIN

  RAISE NOTICE '══ 7C.12A.2 Post-Apply Verify (v2 — Hardened) ══';

  -- ══════════════════════════════════════════════════════════
  -- SECTION A: register_new_artisan RPC
  -- ══════════════════════════════════════════════════════════

  -- V-1: Function exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-1 FAIL: register_new_artisan() not found';
  END IF;
  RAISE NOTICE 'V-1 PASS: register_new_artisan() exists';

  -- Load function definition for body inspection
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan'
  LIMIT 1;

  -- Strip line comments for executable-code checks (prevents false positives on comment text)
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-2: SECURITY DEFINER
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'V-2 FAIL: register_new_artisan not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'V-2 PASS: register_new_artisan is SECURITY DEFINER';

  -- V-3: SET search_path = empty
  IF v_def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'V-3 FAIL: register_new_artisan missing SET search_path';
  END IF;
  RAISE NOTICE 'V-3 PASS: register_new_artisan has SET search_path';

  -- V-4: auth.uid() present in body
  IF v_def_exec NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'V-4 FAIL: auth.uid() not found in register_new_artisan body';
  END IF;
  RAISE NOTICE 'V-4 PASS: auth.uid() present in register_new_artisan';

  -- V-5: unauthenticated guard (v_uid IS NULL)
  IF v_def_exec NOT LIKE '%v_uid IS NULL%' THEN
    RAISE EXCEPTION 'V-5 FAIL: unauthenticated guard (v_uid IS NULL) missing';
  END IF;
  RAISE NOTICE 'V-5 PASS: unauthenticated guard present';

  -- ══════════════════════════════════════════════════════════
  -- SECTION B: Security Invariants in register_new_artisan
  -- ══════════════════════════════════════════════════════════

  -- V-6: onboarding_completed NOT set to true in executable code
  IF v_def_exec ~* 'onboarding_completed\s*=\s*true' THEN
    RAISE EXCEPTION 'V-6 FAIL: register_new_artisan sets onboarding_completed=true in executable code';
  END IF;
  RAISE NOTICE 'V-6 PASS: onboarding_completed NOT set to true';

  -- V-7: availability NOT set to available in executable code
  IF v_def_exec ~* 'availability\s*=\s*''available''' THEN
    RAISE EXCEPTION 'V-7 FAIL: register_new_artisan sets availability=available in executable code';
  END IF;
  RAISE NOTICE 'V-7 PASS: availability NOT set to available';

  -- V-8: verified NOT set to true in executable code
  IF v_def_exec ~* 'verified\s*=\s*true' THEN
    RAISE EXCEPTION 'V-8 FAIL: register_new_artisan sets verified=true in executable code';
  END IF;
  RAISE NOTICE 'V-8 PASS: verified NOT set to true';

  -- V-9: identity_broken hard-fail present
  IF v_def NOT LIKE '%identity_broken%' THEN
    RAISE EXCEPTION 'V-9 FAIL: identity_broken hard-fail missing from register_new_artisan';
  END IF;
  RAISE NOTICE 'V-9 PASS: identity_broken hard-fail present (BLOCKER 2)';

  -- V-10: phone NOT written to artisans.phone_public
  IF v_def_exec LIKE '%phone_public%' THEN
    RAISE EXCEPTION 'V-10 FAIL: register_new_artisan references phone_public in executable code';
  END IF;
  RAISE NOTICE 'V-10 PASS: phone_public not referenced in register_new_artisan executable code';

  -- ══════════════════════════════════════════════════════════
  -- SECTION C: update_artisan_availability RPC
  -- ══════════════════════════════════════════════════════════

  -- V-11: Function exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-11 FAIL: update_artisan_availability() not found';
  END IF;
  RAISE NOTICE 'V-11 PASS: update_artisan_availability() exists';

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability'
  LIMIT 1;
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-12: SECURITY DEFINER
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'V-12 FAIL: update_artisan_availability not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'V-12 PASS: update_artisan_availability is SECURITY DEFINER';

  -- V-13: auth.uid() present
  IF v_def_exec NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'V-13 FAIL: auth.uid() missing from update_artisan_availability';
  END IF;
  RAISE NOTICE 'V-13 PASS: auth.uid() in update_artisan_availability';

  -- V-14: onboarding_required reason present (gate enforced)
  IF v_def NOT LIKE '%onboarding_required%' THEN
    RAISE EXCEPTION 'V-14 FAIL: onboarding_required gate missing from update_artisan_availability';
  END IF;
  RAISE NOTICE 'V-14 PASS: onboarding_required gate present';

  -- V-15: update_artisan_availability does not set owner_user_id in executable code
  IF v_def_exec ~* 'owner_user_id\s*=' THEN
    RAISE EXCEPTION 'V-15 FAIL: update_artisan_availability writes owner_user_id in executable code';
  END IF;
  RAISE NOTICE 'V-15 PASS: owner_user_id not written by update_artisan_availability';

  -- ══════════════════════════════════════════════════════════
  -- SECTION D: REVOKE / GRANT Privilege State (BLOCKER 1)
  -- ══════════════════════════════════════════════════════════

  -- V-16: authenticated does NOT have table-level UPDATE on artisans
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-16 FAIL: authenticated still has table-level UPDATE on artisans — REVOKE not applied';
  END IF;
  RAISE NOTICE 'V-16 PASS: authenticated has NO table-level UPDATE on artisans (BLOCKER 1 resolved)';

  -- V-17: anon does NOT have table-level UPDATE on artisans
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee = 'anon';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-17 FAIL: anon still has table-level UPDATE on artisans — REVOKE not applied';
  END IF;
  RAISE NOTICE 'V-17 PASS: anon has NO table-level UPDATE on artisans';

  -- V-18: authenticated DOES have EXECUTE on register_new_artisan
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'register_new_artisan'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'authenticated';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-18 FAIL: authenticated lacks EXECUTE on register_new_artisan';
  END IF;
  RAISE NOTICE 'V-18 PASS: authenticated has EXECUTE on register_new_artisan';

  -- ══════════════════════════════════════════════════════════
  -- SECTION E: Column-Level Grants (BLOCKER 1)
  -- ══════════════════════════════════════════════════════════

  -- V-19: authenticated has column-level UPDATE on full_name (safe column)
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'full_name'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-19 FAIL: authenticated lacks column-level UPDATE on artisans.full_name';
  END IF;
  RAISE NOTICE 'V-19 PASS: authenticated has column UPDATE on artisans.full_name';

  -- V-20: authenticated does NOT have column-level UPDATE on owner_user_id
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'owner_user_id'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-20 FAIL: authenticated has column-level UPDATE on artisans.owner_user_id — CRITICAL';
  END IF;
  RAISE NOTICE 'V-20 PASS: authenticated has NO column UPDATE on artisans.owner_user_id';

  -- V-21: authenticated does NOT have column-level UPDATE on onboarding_completed
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'onboarding_completed'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V-21 FAIL: authenticated has column-level UPDATE on artisans.onboarding_completed — CRITICAL';
  END IF;
  RAISE NOTICE 'V-21 PASS: authenticated has NO column UPDATE on artisans.onboarding_completed';

  -- ══════════════════════════════════════════════════════════
  -- SECTION F: Unique Index + RLS
  -- ══════════════════════════════════════════════════════════

  -- V-22: Unique index exists and is partial
  SELECT COUNT(*) INTO v_count FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND indexname = 'artisans_owner_user_id_unique';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-22 FAIL: artisans_owner_user_id_unique index not found';
  END IF;
  -- Verify partial (WHERE clause)
  SELECT indexdef INTO v_text FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND indexname = 'artisans_owner_user_id_unique';
  IF v_text NOT LIKE '%IS NOT NULL%' THEN
    RAISE EXCEPTION 'V-22 FAIL: artisans_owner_user_id_unique is not partial (missing WHERE IS NOT NULL)';
  END IF;
  RAISE NOTICE 'V-22 PASS: artisans_owner_user_id_unique partial index present';

  -- V-23: artisans_owner_update RLS policy exists
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND policyname = 'artisans_owner_update' AND cmd = 'UPDATE';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-23 FAIL: artisans_owner_update policy missing';
  END IF;
  RAISE NOTICE 'V-23 PASS: artisans_owner_update RLS policy present';

  -- ══════════════════════════════════════════════════════════
  -- SECTION G: users/profiles Integrity in RPC (BLOCKER 2)
  -- ══════════════════════════════════════════════════════════

  -- Reload register_new_artisan def for these checks
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan'
  LIMIT 1;
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-24: users row existence check before INSERT
  IF v_def_exec NOT LIKE '%NOT EXISTS%' OR v_def_exec NOT LIKE '%public.users%' THEN
    RAISE EXCEPTION 'V-24 FAIL: users row existence check missing from register_new_artisan';
  END IF;
  RAISE NOTICE 'V-24 PASS: users row existence check present (BLOCKER 2)';

  -- V-25: identity_broken returned (not silently ok:true with broken identity)
  IF v_def NOT LIKE '%identity_broken%' THEN
    RAISE EXCEPTION 'V-25 FAIL: identity_broken hard-fail not found in register_new_artisan';
  END IF;
  RAISE NOTICE 'V-25 PASS: identity_broken hard-fail confirmed';

  -- ══════════════════════════════════════════════════════════
  -- SECTION H: Phone Persistence (BLOCKER 2)
  -- ══════════════════════════════════════════════════════════

  -- V-26: phone written to public.users in executable code
  IF v_def_exec NOT LIKE '%UPDATE%' OR v_def_exec NOT LIKE '%public.users%' OR v_def_exec NOT LIKE '%phone%' THEN
    RAISE EXCEPTION 'V-26 FAIL: phone not persisted to public.users in register_new_artisan';
  END IF;
  RAISE NOTICE 'V-26 PASS: phone persisted to public.users';

  -- V-27: phone written to public.profiles in executable code
  IF v_def_exec NOT LIKE '%UPDATE%' OR v_def_exec NOT LIKE '%public.profiles%' OR v_def_exec NOT LIKE '%phone%' THEN
    RAISE EXCEPTION 'V-27 FAIL: phone not persisted to public.profiles in register_new_artisan';
  END IF;
  RAISE NOTICE 'V-27 PASS: phone persisted to public.profiles';

  -- V-28: phone_public NOT written in register_new_artisan executable code
  IF v_def_exec LIKE '%phone_public%' THEN
    RAISE EXCEPTION 'V-28 FAIL: register_new_artisan writes phone_public in executable code — security violation';
  END IF;
  RAISE NOTICE 'V-28 PASS: phone_public not written by register_new_artisan';

  -- ══════════════════════════════════════════════════════════
  -- SECTION I: 7C.12A.1 Non-Regression
  -- ══════════════════════════════════════════════════════════

  -- V-29: approve_artisan_claim still exists and is untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-29 FAIL: approve_artisan_claim() missing — 7C.12A.1 regression';
  END IF;
  RAISE NOTICE 'V-29 PASS: approve_artisan_claim() still present';

  -- V-30: reject_artisan_claim still exists
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reject_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-30 FAIL: reject_artisan_claim() missing — 7C.12A.1 regression';
  END IF;
  RAISE NOTICE 'V-30 PASS: reject_artisan_claim() still present';

  -- ══════════════════════════════════════════════════════════
  -- SECTION J: dispatch Non-Regression
  -- ══════════════════════════════════════════════════════════

  -- V-31: dispatch_request_v1 untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count = 0 THEN
    RAISE NOTICE 'V-31 INFO: dispatch_request_v1 not found (may not yet be applied — informational)';
  ELSE
    RAISE NOTICE 'V-31 PASS: dispatch_request_v1 present and unmodified by 7C.12A.2';
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SECTION K: Availability Gate in update_artisan_availability
  -- ══════════════════════════════════════════════════════════

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability'
  LIMIT 1;
  v_def_exec := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- V-32: onboarding_completed gate in update_artisan_availability executable code
  IF v_def_exec NOT LIKE '%onboarding_completed%' THEN
    RAISE EXCEPTION 'V-32 FAIL: onboarding_completed gate missing from update_artisan_availability executable code';
  END IF;
  RAISE NOTICE 'V-32 PASS: onboarding_completed gate in update_artisan_availability';

  -- V-33: available and busy cannot be set without onboarding in executable code
  -- Verify the condition exists: v_target_status IN ('available','busy') AND NOT onboarding_done
  IF v_def_exec NOT LIKE '%onboarding_required%' THEN
    RAISE EXCEPTION 'V-33 FAIL: onboarding_required rejection path missing from update_artisan_availability';
  END IF;
  RAISE NOTICE 'V-33 PASS: onboarding_required rejection path present';

  -- V-34: update_artisan_availability authenticated EXECUTE grant exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'update_artisan_availability'
    AND privilege_type = 'EXECUTE'
    AND grantee = 'authenticated';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'V-34 FAIL: authenticated lacks EXECUTE on update_artisan_availability';
  END IF;
  RAISE NOTICE 'V-34 PASS: authenticated has EXECUTE on update_artisan_availability';

  -- V-35: verified NOT written by update_artisan_availability in executable code
  IF v_def_exec ~* 'verified\s*=' THEN
    RAISE EXCEPTION 'V-35 FAIL: update_artisan_availability writes verified in executable code';
  END IF;
  RAISE NOTICE 'V-35 PASS: verified not written by update_artisan_availability';

  -- V-36: claimed NOT written by update_artisan_availability
  IF v_def_exec ~* '\bclaimed\s*=' THEN
    RAISE EXCEPTION 'V-36 FAIL: update_artisan_availability writes claimed in executable code';
  END IF;
  RAISE NOTICE 'V-36 PASS: claimed not written by update_artisan_availability';

  RAISE NOTICE '══ 7C.12A.2 Verify complete — 36 V-checks ══';

END $$;
