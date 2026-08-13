-- ════════════════════════════════════════════════════════════
-- 7C.12A.2 — New Artisan Canonical Registration
-- supabase/7c12a2-new-artisan-registration-precheck.sql
--
-- READ ONLY. Run BEFORE applying 7c12a2-new-artisan-registration.sql.
-- All PM-checks must RAISE NOTICE PM-xx PASS.
-- Any RAISE EXCEPTION = HARD STOP — do not proceed.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count    integer;
  v_type     text;
  v_nullable text;
  v_def      text;
  v_has_rpc  boolean;
BEGIN

  -- ════════════════════════════════════════════
  -- SECTION 1: Prerequisite — 7C.12A.1 applied
  -- ════════════════════════════════════════════

  -- PM-1: approve_artisan_claim RPC must exist (7C.12A.1 applied)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'approve_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-1 FAIL: approve_artisan_claim not found — 7C.12A.1 must be applied first';
  END IF;
  RAISE NOTICE 'PM-1 PASS: approve_artisan_claim exists (7C.12A.1 applied)';

  -- PM-2: reject_artisan_claim RPC must exist
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reject_artisan_claim';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-2 FAIL: reject_artisan_claim not found — 7C.12A.1 must be applied first';
  END IF;
  RAISE NOTICE 'PM-2 PASS: reject_artisan_claim exists';

  -- PM-3: sync_artisan_claim trigger must NOT exist (7C.12A.1 dropped it)
  SELECT COUNT(*) INTO v_count FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'artisans' AND t.tgname = 'claim_approval_sync';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-3 FAIL: claim_approval_sync trigger still exists — 7C.12A.1 not correctly applied';
  END IF;
  RAISE NOTICE 'PM-3 PASS: claim_approval_sync trigger absent (7C.12A.1 correctly applied)';

  -- ════════════════════════════════════════════
  -- SECTION 2: artisans table schema
  -- ════════════════════════════════════════════

  -- PM-4: artisans table exists
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'artisans';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-4 FAIL: public.artisans not found'; END IF;
  RAISE NOTICE 'PM-4 PASS: public.artisans exists';

  -- PM-5: artisans.owner_user_id exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'owner_user_id';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-5 FAIL: artisans.owner_user_id not found'; END IF;
  RAISE NOTICE 'PM-5 PASS: artisans.owner_user_id exists';

  -- PM-6: artisans.claim_status exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'claim_status';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-6 FAIL: artisans.claim_status not found'; END IF;
  RAISE NOTICE 'PM-6 PASS: artisans.claim_status exists';

  -- PM-7: artisans.onboarding_completed exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'onboarding_completed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-7 FAIL: artisans.onboarding_completed not found'; END IF;
  RAISE NOTICE 'PM-7 PASS: artisans.onboarding_completed exists';

  -- PM-8: artisans.availability exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'availability';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-8 FAIL: artisans.availability not found'; END IF;
  RAISE NOTICE 'PM-8 PASS: artisans.availability exists';

  -- PM-9: artisans.claimed exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'claimed';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-9 FAIL: artisans.claimed not found'; END IF;
  RAISE NOTICE 'PM-9 PASS: artisans.claimed exists';

  -- PM-10: artisans.service_category exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'service_category';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-10 FAIL: artisans.service_category not found'; END IF;
  RAISE NOTICE 'PM-10 PASS: artisans.service_category exists';

  -- PM-11: artisans.city exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'city';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-11 FAIL: artisans.city not found'; END IF;
  RAISE NOTICE 'PM-11 PASS: artisans.city exists';

  -- PM-12: artisans.verified exists (or is_verified)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name IN ('verified', 'is_verified');
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-12 FAIL: artisans.verified / is_verified not found'; END IF;
  RAISE NOTICE 'PM-12 PASS: artisans verified column exists (count=%)', v_count;

  -- ════════════════════════════════════════════
  -- SECTION 3: users / profiles tables
  -- ════════════════════════════════════════════

  -- PM-13: public.users exists
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'users';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-13 FAIL: public.users not found'; END IF;
  RAISE NOTICE 'PM-13 PASS: public.users exists';

  -- PM-14: public.users.role exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-14 FAIL: users.role not found'; END IF;
  RAISE NOTICE 'PM-14 PASS: users.role exists';

  -- PM-15: public.profiles exists
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'profiles';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-15 FAIL: public.profiles not found'; END IF;
  RAISE NOTICE 'PM-15 PASS: public.profiles exists';

  -- PM-16: public.profiles.role exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-16 FAIL: profiles.role not found'; END IF;
  RAISE NOTICE 'PM-16 PASS: profiles.role exists';

  -- ════════════════════════════════════════════
  -- SECTION 4: artisans.owner_user_id uniqueness feasibility
  -- ════════════════════════════════════════════

  -- PM-17: Check for duplicate owner_user_id values (non-NULL) — would block UNIQUE index
  SELECT COUNT(*) INTO v_count FROM (
    SELECT owner_user_id, COUNT(*) AS cnt
    FROM public.artisans
    WHERE owner_user_id IS NOT NULL
    GROUP BY owner_user_id
    HAVING COUNT(*) > 1
  ) dups;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PM-17 FAIL: % duplicate owner_user_id values found — UNIQUE index unsafe; investigate before proceeding', v_count;
  END IF;
  RAISE NOTICE 'PM-17 PASS: no duplicate owner_user_id values — UNIQUE index safe to add';

  -- PM-18: How many artisans have non-NULL owner_user_id
  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NOT NULL;
  RAISE NOTICE 'PM-18 INFO: artisans with owner_user_id set: %', v_count;

  -- PM-19: Does a UNIQUE constraint/index on owner_user_id already exist?
  SELECT COUNT(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'artisans'
    AND indexdef ILIKE '%owner_user_id%' AND indexdef ILIKE '%unique%';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-19 INFO: unique index on artisans.owner_user_id already exists — Step 1 will be idempotent';
  ELSE
    RAISE NOTICE 'PM-19 INFO: no unique index on artisans.owner_user_id yet — Step 1 will create it';
  END IF;

  -- ════════════════════════════════════════════
  -- SECTION 5: RPC collision check
  -- ════════════════════════════════════════════

  -- PM-20: register_new_artisan must NOT already exist (no collision)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'register_new_artisan';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-20 INFO: register_new_artisan already exists (% version(s)) — migration will CREATE OR REPLACE', v_count;
  ELSE
    RAISE NOTICE 'PM-20 INFO: register_new_artisan does not yet exist — will be created fresh';
  END IF;

  -- PM-21: complete_artisan_onboarding must NOT already exist
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_artisan_onboarding';
  IF v_count > 0 THEN
    RAISE NOTICE 'PM-21 INFO: complete_artisan_onboarding already exists — will be replaced (7C.12A.3 scope; migration does NOT create it)';
  ELSE
    RAISE NOTICE 'PM-21 INFO: complete_artisan_onboarding absent — correct (7C.12A.3 will create it)';
  END IF;

  -- ════════════════════════════════════════════
  -- SECTION 6: RLS state on artisans
  -- ════════════════════════════════════════════

  -- PM-22: RLS is enabled on artisans
  SELECT COUNT(*) INTO v_count FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'artisans' AND c.relrowsecurity = true;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PM-22 FAIL: RLS not enabled on public.artisans — security risk';
  END IF;
  RAISE NOTICE 'PM-22 PASS: RLS enabled on public.artisans';

  -- PM-23: artisans_admin_insert policy exists (admin writes)
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'artisans' AND policyname = 'artisans_admin_insert';
  RAISE NOTICE 'PM-23 INFO: artisans_admin_insert policy count: %', v_count;

  -- PM-24: artisans SELECT policy exists (public marketplace read)
  SELECT COUNT(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'artisans'
    AND cmd IN ('SELECT', 'ALL') AND policyname ILIKE '%read%';
  RAISE NOTICE 'PM-24 INFO: artisans SELECT/read policies: %', v_count;

  -- ════════════════════════════════════════════
  -- SECTION 7: dispatch eligibility invariant verification
  -- ════════════════════════════════════════════

  -- PM-25: dispatch_request_v1 still exists and has SECURITY DEFINER
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dispatch_request_v1' LIMIT 1;
  IF v_def IS NULL THEN
    RAISE NOTICE 'PM-25 INFO: dispatch_request_v1 not yet applied to this DB (SQL pack pending)';
  ELSE
    IF v_def NOT ILIKE '%SECURITY DEFINER%' THEN
      RAISE EXCEPTION 'PM-25 FAIL: dispatch_request_v1 missing SECURITY DEFINER';
    END IF;
    RAISE NOTICE 'PM-25 PASS: dispatch_request_v1 exists with SECURITY DEFINER';
  END IF;

  -- PM-26: No artisan is currently dispatch-eligible (all 0)
  --        (Expected: 0 eligible since no onboarding is complete yet)
  SELECT COUNT(*) INTO v_count FROM public.artisans
  WHERE owner_user_id IS NOT NULL
    AND claim_status = 'approved'
    AND onboarding_completed = true
    AND availability = 'available';
  RAISE NOTICE 'PM-26 INFO: currently dispatch-eligible artisans: % (expected 0 at this stage)', v_count;

  -- ════════════════════════════════════════════
  -- SECTION 8: artisans required columns / defaults
  -- ════════════════════════════════════════════

  -- PM-27: artisans.full_name or name column exists (used by register_new_artisan)
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans'
    AND column_name IN ('full_name', 'name');
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-27 FAIL: artisans has neither full_name nor name column'; END IF;
  RAISE NOTICE 'PM-27 PASS: artisans name column exists (count=%)', v_count;

  -- PM-28: artisans.phone column (nullable — may be absent for new self-registrants)
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'phone';
  IF v_type IS NULL THEN
    RAISE NOTICE 'PM-28 INFO: artisans.phone column absent — register_new_artisan will not write phone to artisans';
  ELSE
    RAISE NOTICE 'PM-28 INFO: artisans.phone column exists — register_new_artisan may write phone if safe';
  END IF;

  -- PM-29: artisans.onboarding_completed default (expect false/NULL-safe)
  SELECT column_default INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'onboarding_completed';
  RAISE NOTICE 'PM-29 INFO: artisans.onboarding_completed default: %', COALESCE(v_type, 'NULL (no default)');

  -- PM-30: artisans.availability default
  SELECT column_default INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'artisans' AND column_name = 'availability';
  RAISE NOTICE 'PM-30 INFO: artisans.availability default: %', COALESCE(v_type, 'NULL (no default)');

  -- ════════════════════════════════════════════
  -- SECTION 9: auth system / users integrity
  -- ════════════════════════════════════════════

  -- PM-31: public.users.email column exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-31 FAIL: users.email not found'; END IF;
  RAISE NOTICE 'PM-31 PASS: users.email exists';

  -- PM-32: public.users.full_name exists
  SELECT column_name INTO v_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name';
  IF v_type IS NULL THEN RAISE EXCEPTION 'PM-32 FAIL: users.full_name not found'; END IF;
  RAISE NOTICE 'PM-32 PASS: users.full_name exists';

  -- PM-33: auth.uid() callable (function exists)
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'auth' AND p.proname = 'uid';
  IF v_count = 0 THEN RAISE EXCEPTION 'PM-33 FAIL: auth.uid() not found'; END IF;
  RAISE NOTICE 'PM-33 PASS: auth.uid() available';

  -- ════════════════════════════════════════════
  -- SECTION 10: Allowed claim_status values safety
  -- ════════════════════════════════════════════

  -- PM-34: claims_status_check includes superseded_by_approval (7C.12A.1 V-47)
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND r.relname = 'claim_requests'
    AND c.conname = 'claims_status_check';
  IF v_def IS NULL THEN
    RAISE NOTICE 'PM-34 INFO: claims_status_check not found on claim_requests — may be on artisans or renamed';
  ELSIF v_def NOT ILIKE '%superseded_by_approval%' THEN
    RAISE EXCEPTION 'PM-34 FAIL: claims_status_check missing superseded_by_approval — 7C.12A.1 not fully applied';
  ELSE
    RAISE NOTICE 'PM-34 PASS: claims_status_check contains superseded_by_approval';
  END IF;

  -- PM-35: artisans.claim_status allowed values: new artisan registration uses 'approved'
  --        Verify no constraint blocks 'approved' on artisans.claim_status
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND r.relname = 'artisans'
    AND c.conname ILIKE '%claim_status%';
  IF v_def IS NULL THEN
    RAISE NOTICE 'PM-35 INFO: no claim_status constraint on artisans table (open set)';
  ELSIF v_def NOT ILIKE '%approved%' THEN
    RAISE EXCEPTION 'PM-35 FAIL: artisans claim_status constraint does not include ''approved'' — register_new_artisan cannot set it';
  ELSE
    RAISE NOTICE 'PM-35 PASS: artisans claim_status constraint allows ''approved'': %', v_def;
  END IF;

  -- ════════════════════════════════════════════
  -- SECTION 11: Baseline row counts (informational)
  -- ════════════════════════════════════════════

  SELECT COUNT(*) INTO v_count FROM public.artisans;
  RAISE NOTICE 'PM-36 INFO: artisans total rows: %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE owner_user_id IS NULL;
  RAISE NOTICE 'PM-37 INFO: artisans with owner_user_id IS NULL (unclaimed seeded): %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE claim_status = 'approved';
  RAISE NOTICE 'PM-38 INFO: artisans with claim_status=approved: %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.artisans WHERE onboarding_completed = true;
  RAISE NOTICE 'PM-39 INFO: artisans with onboarding_completed=true: %', v_count;

  RAISE NOTICE '══════════════════════════════════════════════════';
  RAISE NOTICE 'PRECHECK COMPLETE — all PM checks finished';
  RAISE NOTICE 'If no RAISE EXCEPTION above: SAFE TO APPLY migration';
  RAISE NOTICE '══════════════════════════════════════════════════';

END $$;
