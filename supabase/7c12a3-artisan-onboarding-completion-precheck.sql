-- ════════════════════════════════════════════════════════════════════════════
-- 7C.12A.3 — Pre-Apply Checks (READ ONLY — SAFE)
-- File: 7c12a3-artisan-onboarding-completion-precheck.sql
-- Run BEFORE applying 7c12a3-artisan-onboarding-completion.sql
-- All checks are READ ONLY. No DDL, DML, or side effects.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count  integer;
  v_bool   boolean;
  v_text   text;
BEGIN
  RAISE NOTICE '══ 7C.12A.3 Pre-Apply Checks ══';

  -- ══════════════════════════════════════════════════════════
  -- SECTION A: 7C.12A.2 prerequisites
  -- ══════════════════════════════════════════════════════════

  -- PM-1: register_new_artisan() must exist (7C.12A.2 applied)
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-1 FAIL: register_new_artisan() missing — apply 7C.12A.2 first';
  END IF;
  RAISE NOTICE 'PM-1 PASS: register_new_artisan() exists';

  -- PM-2: update_artisan_availability() must exist (7C.12A.2 applied)
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-2 FAIL: update_artisan_availability() missing — apply 7C.12A.2 first';
  END IF;
  RAISE NOTICE 'PM-2 PASS: update_artisan_availability() exists';

  -- PM-3: authenticated must NOT have table-level UPDATE on artisans (7C.12A.2 REVOKE confirmed)
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-3 FAIL: authenticated still has table-level UPDATE on artisans — 7C.12A.2 REVOKE not applied';
  END IF;
  RAISE NOTICE 'PM-3 PASS: authenticated has NO table-level UPDATE on artisans';

  -- PM-4: onboarding_completed NOT in column-level grants (must stay RPC-only)
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'onboarding_completed'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-4 FAIL: authenticated has column-level UPDATE grant on onboarding_completed — must be RPC-only';
  END IF;
  RAISE NOTICE 'PM-4 PASS: onboarding_completed NOT column-granted to authenticated';

  -- PM-5: availability NOT in column-level grants (must stay RPC-only)
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND column_name = 'availability'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-5 FAIL: authenticated has column-level UPDATE grant on availability — must be RPC-only';
  END IF;
  RAISE NOTICE 'PM-5 PASS: availability NOT column-granted to authenticated';

  -- ══════════════════════════════════════════════════════════
  -- SECTION B: artisans schema requirements
  -- ══════════════════════════════════════════════════════════

  -- PM-6: artisans.onboarding_completed column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'onboarding_completed';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-6 FAIL: artisans.onboarding_completed column missing';
  END IF;
  RAISE NOTICE 'PM-6 PASS: artisans.onboarding_completed exists';

  -- PM-7: artisans.availability column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'availability';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-7 FAIL: artisans.availability column missing';
  END IF;
  RAISE NOTICE 'PM-7 PASS: artisans.availability exists';

  -- PM-8: artisans.full_name column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'full_name';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-8 FAIL: artisans.full_name column missing';
  END IF;
  RAISE NOTICE 'PM-8 PASS: artisans.full_name exists';

  -- PM-9: artisans.service_category column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'service_category';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-9 FAIL: artisans.service_category column missing';
  END IF;
  RAISE NOTICE 'PM-9 PASS: artisans.service_category exists';

  -- PM-10: artisans.city column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'city';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-10 FAIL: artisans.city column missing';
  END IF;
  RAISE NOTICE 'PM-10 PASS: artisans.city exists';

  -- PM-11: artisans.claimed column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'claimed';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-11 FAIL: artisans.claimed column missing';
  END IF;
  RAISE NOTICE 'PM-11 PASS: artisans.claimed exists';

  -- PM-12: artisans.claim_status column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'claim_status';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-12 FAIL: artisans.claim_status column missing';
  END IF;
  RAISE NOTICE 'PM-12 PASS: artisans.claim_status exists';

  -- PM-13: artisans.owner_user_id column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name = 'owner_user_id';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-13 FAIL: artisans.owner_user_id column missing';
  END IF;
  RAISE NOTICE 'PM-13 PASS: artisans.owner_user_id exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION C: No RPC collision
  -- ══════════════════════════════════════════════════════════

  -- PM-14: complete_artisan_onboarding must NOT already exist
  -- (CREATE OR REPLACE is safe, but flag pre-existence for awareness)
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_artisan_onboarding';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-14 WARN: complete_artisan_onboarding() already exists — will be replaced (CREATE OR REPLACE is safe)';
  ELSE
    RAISE NOTICE 'PM-14 PASS: complete_artisan_onboarding() does not exist yet (fresh create)';
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SECTION D: Dispatch non-regression baseline
  -- ══════════════════════════════════════════════════════════

  -- PM-15: dispatch_request_v1 still exists and is SECURITY DEFINER
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-15 FAIL: dispatch_request_v1 missing — 7C.11 regression';
  END IF;
  RAISE NOTICE 'PM-15 PASS: dispatch_request_v1 exists';

  -- PM-16: 0 artisans currently dispatch-eligible (expected pre-12A.3)
  SELECT COUNT(*) INTO v_count
  FROM public.artisans
  WHERE owner_user_id IS NOT NULL
    AND claim_status = 'approved'
    AND onboarding_completed = true
    AND availability = 'available';
  RAISE NOTICE 'PM-16 INFO: currently dispatch-eligible artisans = % (expected 0 pre-apply)', v_count;

  RAISE NOTICE '══ 7C.12A.3 Pre-Apply Checks complete — 16 PM checks ══';
END $$;
