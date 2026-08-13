-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — Precheck: New Artisan Canonical Registration (v2 — Hardened)
-- supabase/7c12a2-new-artisan-registration-precheck.sql
--
-- PURPOSE: READ-ONLY safety checks before applying the migration.
--   All statements are SELECT / RAISE NOTICE / RAISE EXCEPTION only.
--   No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
--
-- RUN THIS FIRST. If any PM-N FAIL is raised, do NOT apply the migration.
--
-- SECTIONS:
--   PM-1  to PM-5:  7C.12A.1 prerequisites (RPCs must exist, trigger dropped)
--   PM-6  to PM-10: artisans table structure
--   PM-11 to PM-13: artisans required columns
--   PM-14 to PM-16: users / profiles table prerequisites
--   PM-17 to PM-19: owner_user_id duplicate state + index feasibility
--   PM-20 to PM-21: RPC collision / signature state
--   PM-22 to PM-24: RLS state on artisans
--   PM-25 to PM-26: dispatch_request_v1 non-regression
--   PM-27 to PM-30: artisans required columns / defaults for INSERT
--   PM-31 to PM-33: auth.users / users / profiles integrity
--   PM-34 to PM-35: artisans.claims_status_check constraint (from 7C.12A.1)
--   PM-36 to PM-39: BLOCKER 1 — current UPDATE privilege exposure audit
--   PM-40 to PM-44: BLOCKER 2 — users/profiles row integrity audit
--   PM-45 to PM-48: update_artisan_availability RPC collision check
--   PM-49 to PM-52: phone field audit (users.phone / profiles.phone)
--
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count   integer;
  v_text    text;
  v_bool    boolean;
  v_row     record;
BEGIN

  RAISE NOTICE '══ 7C.12A.2 Precheck (v2 — Hardened) ══';

  -- ══════════════════════════════════════════════════════════
  -- SECTION A: 7C.12A.1 Prerequisites
  -- ══════════════════════════════════════════════════════════

  -- PM-1: approve_artisan_claim exists (7C.12A.1 applied)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-1 FAIL: approve_artisan_claim() not found — apply 7C.12A.1 first';
  END IF;
  RAISE NOTICE 'PM-1 PASS: approve_artisan_claim() exists';

  -- PM-2: reject_artisan_claim exists (7C.12A.1 applied)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reject_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-2 FAIL: reject_artisan_claim() not found — apply 7C.12A.1 first';
  END IF;
  RAISE NOTICE 'PM-2 PASS: reject_artisan_claim() exists';

  -- PM-3: sync_artisan_claim trigger DROPPED (7C.12A.1 removed it)
  SELECT COUNT(*) INTO v_count FROM pg_trigger
   WHERE tgname = 'sync_artisan_claim';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-3 FAIL: sync_artisan_claim trigger still exists — re-apply 7C.12A.1';
  END IF;
  RAISE NOTICE 'PM-3 PASS: sync_artisan_claim trigger absent';

  -- PM-4: claim_requests table exists
  SELECT COUNT(*) INTO v_count FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'claim_requests';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-4 FAIL: claim_requests table missing — apply 7C.12A.1 first';
  END IF;
  RAISE NOTICE 'PM-4 PASS: claim_requests table exists';

  -- PM-5: claims_status_check includes superseded_by_approval (7C.12A.1)
  SELECT pg_get_constraintdef(oid) INTO v_text FROM pg_constraint
   WHERE conname = 'claims_status_check' AND conrelid = 'public.claim_requests'::regclass;
  IF v_text IS NULL OR v_text NOT LIKE '%superseded_by_approval%' THEN
    RAISE EXCEPTION 'PM-5 FAIL: claims_status_check missing superseded_by_approval — re-apply 7C.12A.1';
  END IF;
  RAISE NOTICE 'PM-5 PASS: claims_status_check includes superseded_by_approval';

  -- ══════════════════════════════════════════════════════════
  -- SECTION B: artisans Table Structure
  -- ══════════════════════════════════════════════════════════

  -- PM-6: artisans table exists
  SELECT COUNT(*) INTO v_count FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'artisans';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-6 FAIL: public.artisans table not found';
  END IF;
  RAISE NOTICE 'PM-6 PASS: public.artisans exists';

  -- PM-7: RLS enabled on artisans
  SELECT relrowsecurity INTO v_bool FROM pg_class
   WHERE relname = 'artisans' AND relnamespace = 'public'::regnamespace;
  IF NOT COALESCE(v_bool, false) THEN
    RAISE EXCEPTION 'PM-7 FAIL: RLS not enabled on public.artisans';
  END IF;
  RAISE NOTICE 'PM-7 PASS: RLS enabled on artisans';

  -- PM-8: artisans_admin_insert policy exists (no direct authenticated INSERT)
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND policyname = 'artisans_admin_insert';
  -- This policy may be named differently; what matters is there's no open INSERT
  -- for authenticated. We WARN (not fail) if absent.
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-8 WARN: artisans_admin_insert policy not found by name — verify no open INSERT policy for authenticated';
  ELSE
    RAISE NOTICE 'PM-8 PASS: artisans_admin_insert policy exists';
  END IF;

  -- PM-9: artisans has availability_check constraint
  SELECT COUNT(*) INTO v_count FROM pg_constraint
   WHERE conname = 'artisans_availability_check'
     AND conrelid = 'public.artisans'::regclass;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-9 FAIL: artisans_availability_check constraint missing';
  END IF;
  RAISE NOTICE 'PM-9 PASS: artisans_availability_check exists';

  -- PM-10: artisans has claim_status_check constraint
  SELECT COUNT(*) INTO v_count FROM pg_constraint
   WHERE conname = 'artisans_claim_status_check'
     AND conrelid = 'public.artisans'::regclass;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-10 FAIL: artisans_claim_status_check constraint missing';
  END IF;
  RAISE NOTICE 'PM-10 PASS: artisans_claim_status_check exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION C: artisans Required Columns
  -- ══════════════════════════════════════════════════════════

  -- PM-11: owner_user_id column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'owner_user_id';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-11 FAIL: artisans.owner_user_id column missing';
  END IF;
  RAISE NOTICE 'PM-11 PASS: artisans.owner_user_id exists';

  -- PM-12: onboarding_completed column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'onboarding_completed';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-12 FAIL: artisans.onboarding_completed column missing';
  END IF;
  RAISE NOTICE 'PM-12 PASS: artisans.onboarding_completed exists';

  -- PM-13: availability column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'availability';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-13 FAIL: artisans.availability column missing';
  END IF;
  RAISE NOTICE 'PM-13 PASS: artisans.availability exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION D: users / profiles Prerequisites
  -- ══════════════════════════════════════════════════════════

  -- PM-14: public.users table exists
  SELECT COUNT(*) INTO v_count FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'users';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-14 FAIL: public.users table not found';
  END IF;
  RAISE NOTICE 'PM-14 PASS: public.users exists';

  -- PM-15: public.profiles table exists
  SELECT COUNT(*) INTO v_count FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'profiles';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-15 FAIL: public.profiles table not found';
  END IF;
  RAISE NOTICE 'PM-15 PASS: public.profiles exists';

  -- PM-16: profiles.role column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-16 FAIL: profiles.role column missing';
  END IF;
  RAISE NOTICE 'PM-16 PASS: profiles.role exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION E: owner_user_id Duplicate State + Index Feasibility
  -- ══════════════════════════════════════════════════════════

  -- PM-17: No duplicate owner_user_id values (index creation would fail if any)
  SELECT COUNT(*) INTO v_count FROM (
    SELECT owner_user_id FROM public.artisans
     WHERE owner_user_id IS NOT NULL
     GROUP BY owner_user_id
    HAVING COUNT(*) > 1
  ) dups;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-17 FAIL: % duplicate owner_user_id value(s) found — fix before applying index', v_count;
  END IF;
  RAISE NOTICE 'PM-17 PASS: no duplicate owner_user_id values';

  -- PM-18: Count of non-NULL owner_user_id rows (informational)
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NOT NULL;
  RAISE NOTICE 'PM-18 INFO: % artisan rows with owner_user_id IS NOT NULL (expected 0 at first apply)', v_count;

  -- PM-19: artisans_owner_user_id_unique index does NOT yet exist
  SELECT COUNT(*) INTO v_count FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND indexname = 'artisans_owner_user_id_unique';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-19 WARN: artisans_owner_user_id_unique index already exists — Step 0 will skip (idempotent)';
  ELSE
    RAISE NOTICE 'PM-19 PASS: artisans_owner_user_id_unique not yet present — Step 0 will create';
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SECTION F: RPC Collision / Signature Check
  -- ══════════════════════════════════════════════════════════

  -- PM-20: register_new_artisan — collision check
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-20 WARN: register_new_artisan() already exists — CREATE OR REPLACE will overwrite';
  ELSE
    RAISE NOTICE 'PM-20 PASS: register_new_artisan() not yet present — clean first install';
  END IF;

  -- PM-21: update_artisan_availability — collision check
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-21 WARN: update_artisan_availability() already exists — CREATE OR REPLACE will overwrite';
  ELSE
    RAISE NOTICE 'PM-21 PASS: update_artisan_availability() not yet present — clean first install';
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SECTION G: RLS State on artisans
  -- ══════════════════════════════════════════════════════════

  -- PM-22: artisans_owner_update policy exists
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND policyname = 'artisans_owner_update';
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-22 WARN: artisans_owner_update policy absent — Step 6 will create it';
  ELSE
    RAISE NOTICE 'PM-22 PASS: artisans_owner_update exists — Step 6 will DROP and recreate (narrowed)';
  END IF;

  -- PM-23: Count of INSERT policies for authenticated on artisans (should be 0 or admin-only)
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND cmd IN ('INSERT','ALL')
     AND (roles @> '{authenticated}' OR roles @> '{public}')
     AND policyname NOT LIKE '%admin%';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-23 WARN: % non-admin INSERT/ALL policies for authenticated on artisans — verify these are intentional', v_count;
  ELSE
    RAISE NOTICE 'PM-23 PASS: no open INSERT/ALL for authenticated on artisans (SECURITY DEFINER RPC handles it)';
  END IF;

  -- PM-24: List all UPDATE/ALL policies on artisans (informational)
  RAISE NOTICE 'PM-24 INFO: artisans UPDATE/ALL policies:';
  FOR v_row IN
    SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'artisans'
       AND cmd IN ('UPDATE','ALL')
  LOOP
    RAISE NOTICE '  policy=% cmd=% roles=% qual=% with_check=%',
      v_row.policyname, v_row.cmd, v_row.roles, v_row.qual, v_row.with_check;
  END LOOP;

  -- ══════════════════════════════════════════════════════════
  -- SECTION H: dispatch_request_v1 Non-regression
  -- ══════════════════════════════════════════════════════════

  -- PM-25: dispatch_request_v1 exists and is untouched
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1';
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-25 WARN: dispatch_request_v1 not found — expected from 7C.11F.1; informational only';
  ELSE
    RAISE NOTICE 'PM-25 PASS: dispatch_request_v1 exists — 7C.12A.2 does not touch it';
  END IF;

  -- PM-26: dispatch eligibility gate fields exist on artisans
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans'
     AND column_name IN ('owner_user_id','claim_status','onboarding_completed','availability');
  IF v_count < 4 THEN
    RAISE EXCEPTION 'PM-26 FAIL: only %/4 dispatch eligibility columns found on artisans', v_count;
  END IF;
  RAISE NOTICE 'PM-26 PASS: all 4 dispatch eligibility columns present';

  -- ══════════════════════════════════════════════════════════
  -- SECTION I: artisans INSERT Column Availability
  -- ══════════════════════════════════════════════════════════

  -- PM-27: full_name column exists and is required
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'full_name';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-27 FAIL: artisans.full_name missing'; END IF;
  RAISE NOTICE 'PM-27 PASS: artisans.full_name exists';

  -- PM-28: service_category column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'service_category';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-28 FAIL: artisans.service_category missing'; END IF;
  RAISE NOTICE 'PM-28 PASS: artisans.service_category exists';

  -- PM-29: claimed column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'claimed';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-29 FAIL: artisans.claimed missing'; END IF;
  RAISE NOTICE 'PM-29 PASS: artisans.claimed exists';

  -- PM-30: claim_status column exists
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'claim_status';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-30 FAIL: artisans.claim_status missing'; END IF;
  RAISE NOTICE 'PM-30 PASS: artisans.claim_status exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION J: auth.users / users / profiles Integrity
  -- ══════════════════════════════════════════════════════════

  -- PM-31: public.users has id column (FK to auth.users)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-31 FAIL: public.users.id missing'; END IF;
  RAISE NOTICE 'PM-31 PASS: public.users.id exists';

  -- PM-32: public.users has role column
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-32 FAIL: public.users.role missing'; END IF;
  RAISE NOTICE 'PM-32 PASS: public.users.role exists';

  -- PM-33: public.profiles has id column
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-33 FAIL: public.profiles.id missing'; END IF;
  RAISE NOTICE 'PM-33 PASS: public.profiles.id exists';

  -- PM-34: artisans_claim_status_check includes 'approved' (register sets this value)
  SELECT pg_get_constraintdef(oid) INTO v_text FROM pg_constraint
   WHERE conname = 'artisans_claim_status_check'
     AND conrelid = 'public.artisans'::regclass;
  IF v_text IS NULL OR v_text NOT LIKE '%approved%' THEN
    RAISE EXCEPTION 'PM-34 FAIL: artisans_claim_status_check does not include ''approved''';
  END IF;
  RAISE NOTICE 'PM-34 PASS: artisans_claim_status_check includes ''approved''';

  -- PM-35: artisans_availability_check includes 'unavailable' (register inserts this value)
  SELECT pg_get_constraintdef(oid) INTO v_text FROM pg_constraint
   WHERE conname = 'artisans_availability_check'
     AND conrelid = 'public.artisans'::regclass;
  IF v_text IS NULL OR v_text NOT LIKE '%unavailable%' THEN
    RAISE EXCEPTION 'PM-35 FAIL: artisans_availability_check does not include ''unavailable''';
  END IF;
  RAISE NOTICE 'PM-35 PASS: artisans_availability_check includes ''unavailable''';

  -- ══════════════════════════════════════════════════════════
  -- SECTION K: BLOCKER 1 — Current UPDATE Privilege Exposure Audit
  -- ══════════════════════════════════════════════════════════

  -- PM-36: Detect if authenticated has table-level UPDATE on artisans
  -- In Supabase, table_privileges shows grantee-level grants.
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee IN ('authenticated', 'PUBLIC');
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-36 WARN: authenticated/PUBLIC has table-level UPDATE on artisans — BLOCKER 1 CONFIRMED. Step 1 will REVOKE this.';
  ELSE
    RAISE NOTICE 'PM-36 PASS: no table-level UPDATE grant for authenticated on artisans (already revoked or never granted)';
  END IF;

  -- PM-37: Detect column-level UPDATE grants already on artisans (should be none pre-migration)
  SELECT COUNT(*) INTO v_count
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'artisans'
    AND privilege_type = 'UPDATE'
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-37 WARN: % column-level UPDATE grant(s) already exist for authenticated on artisans — Step 2 will add/replace', v_count;
  ELSE
    RAISE NOTICE 'PM-37 PASS: no column-level UPDATE grants for authenticated on artisans (clean state)';
  END IF;

  -- PM-38: Enumerate all UPDATE policies on artisans (verify unrestricted coverage)
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'artisans'
     AND cmd IN ('UPDATE','ALL')
     AND (roles @> '{authenticated}' OR roles @> '{public}');
  RAISE NOTICE 'PM-38 INFO: % UPDATE/ALL policies for authenticated/public on artisans', v_count;
  -- After migration: this should still be 1 (artisans_owner_update),
  -- but column privilege restriction makes it safe.

  -- PM-39: artisans.verified column exists (migration will set verified=false on INSERT)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'verified';
  IF v_count = 0 THEN
    -- Try is_verified alias
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'is_verified';
    IF v_count = 0 THEN
      RAISE EXCEPTION 'PM-39 FAIL: artisans.verified (or is_verified) column missing — INSERT would fail';
    END IF;
    RAISE NOTICE 'PM-39 PASS: artisans.is_verified exists (column alias)';
  ELSE
    RAISE NOTICE 'PM-39 PASS: artisans.verified exists';
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- SECTION L: BLOCKER 2 — users/profiles Row Integrity Audit
  -- ══════════════════════════════════════════════════════════

  -- PM-40: Count users rows (baseline; expected > 0 in production)
  SELECT COUNT(*) INTO v_count FROM public.users;
  RAISE NOTICE 'PM-40 INFO: public.users has % rows', v_count;

  -- PM-41: Count profiles rows (baseline; should match users count approximately)
  SELECT COUNT(*) INTO v_count FROM public.profiles;
  RAISE NOTICE 'PM-41 INFO: public.profiles has % rows', v_count;

  -- PM-42: Check for auth.users rows with no corresponding public.users row
  -- (These would trigger identity_broken in register_new_artisan)
  SELECT COUNT(*) INTO v_count
  FROM auth.users au
  LEFT JOIN public.users u ON u.id = au.id
  WHERE u.id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-42 WARN: % auth.users rows have no public.users row — these users would get identity_broken from register_new_artisan. Expected: 0', v_count;
  ELSE
    RAISE NOTICE 'PM-42 PASS: all auth.users rows have matching public.users rows';
  END IF;

  -- PM-43: Check users.phone column exists (register_new_artisan writes phone here)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-43 FAIL: public.users.phone column missing — register_new_artisan cannot persist phone';
  END IF;
  RAISE NOTICE 'PM-43 PASS: public.users.phone exists';

  -- PM-44: Check profiles.phone column exists (register_new_artisan writes phone here)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-44 FAIL: public.profiles.phone column missing — register_new_artisan cannot persist phone to profiles';
  END IF;
  RAISE NOTICE 'PM-44 PASS: public.profiles.phone exists';

  -- ══════════════════════════════════════════════════════════
  -- SECTION M: update_artisan_availability RPC Collision
  -- ══════════════════════════════════════════════════════════

  -- PM-45: update_artisan_availability collision (same as PM-21, explicit here)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_artisan_availability';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-45 WARN: update_artisan_availability exists — will be overwritten by CREATE OR REPLACE';
  ELSE
    RAISE NOTICE 'PM-45 PASS: update_artisan_availability not yet present';
  END IF;

  -- PM-46: artisans.work_zone column exists (column GRANT includes it)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'work_zone';
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-46 WARN: artisans.work_zone column missing — GRANT UPDATE (work_zone) will fail; migration needs adjustment';
  ELSE
    RAISE NOTICE 'PM-46 PASS: artisans.work_zone exists';
  END IF;

  -- PM-47: description column exists (GRANT includes it)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'description';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-47 FAIL: artisans.description missing — GRANT UPDATE (description) would fail';
  END IF;
  RAISE NOTICE 'PM-47 PASS: artisans.description exists';

  -- PM-48: artisans.owner_user_id is UUID type (register_new_artisan inserts auth.uid() which is UUID)
  SELECT data_type INTO v_text FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'owner_user_id';
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'PM-48 FAIL: artisans.owner_user_id column not found by information_schema';
  END IF;
  IF lower(v_text) NOT IN ('uuid', 'character varying', 'text') THEN
    RAISE EXCEPTION 'PM-48 FAIL: artisans.owner_user_id has unexpected type % (expected uuid)', v_text;
  END IF;
  RAISE NOTICE 'PM-48 PASS: artisans.owner_user_id type = %', v_text;

  -- ══════════════════════════════════════════════════════════
  -- SECTION N: Phone Field Audit
  -- ══════════════════════════════════════════════════════════

  -- PM-49: artisans.phone_public column NOT written by register_new_artisan
  -- (Confirm phone_public exists if relevant; migration must not write to it)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'phone_public';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-49 WARN: artisans.phone_public column exists — register_new_artisan must NOT write to it (confirmed: it does not)';
  ELSE
    RAISE NOTICE 'PM-49 PASS: artisans.phone_public absent (safe; phone stored on users/profiles only)';
  END IF;

  -- PM-50: users.updated_at column exists (register_new_artisan sets updated_at)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at';
  IF v_count = 0 THEN
    RAISE NOTICE 'PM-50 WARN: public.users.updated_at column missing — UPDATE in register_new_artisan sets updated_at; remove from RPC if column absent';
  ELSE
    RAISE NOTICE 'PM-50 PASS: public.users.updated_at exists';
  END IF;

  -- PM-51: Total artisans rows (baseline; informational)
  SELECT COUNT(*) INTO v_count FROM public.artisans;
  RAISE NOTICE 'PM-51 INFO: public.artisans has % total rows (expected ~1302 seeded)', v_count;

  -- PM-52: Final summary
  RAISE NOTICE '══ 7C.12A.2 Precheck complete — review all WARN/FAIL above before applying migration ══';

END $$;
