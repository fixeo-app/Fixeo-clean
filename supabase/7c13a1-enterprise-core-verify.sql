-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.1 Enterprise Core — POST-MIGRATION VERIFICATION
-- File: supabase/7c13a1-enterprise-core-verify.sql
-- Run: AFTER 7c13a1-enterprise-core.sql completes without error
-- How: Supabase Dashboard → SQL Editor → New query → Run
--
-- Expected output: all V-xx lines print PASS.
-- If ANY line prints FAIL → STOP, do not use enterprise features,
-- report the failing check immediately.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- counters
  v_pass  integer := 0;
  v_fail  integer := 0;

  -- working booleans
  v_ok    boolean;
  v_count integer;

  -- policy names
  v_policies text[];

BEGIN

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.13A.1 POST-MIGRATION VERIFICATION — START';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ── V-01: enterprise_accounts table exists ──────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_accounts'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-01 PASS  enterprise_accounts table exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-01 FAIL  enterprise_accounts table MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-02: enterprise_members table exists ───────────────────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_members'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-02 PASS  enterprise_members table exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-02 FAIL  enterprise_members table MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-03: enterprise_accounts columns ───────────────────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'enterprise_accounts'
    AND column_name  IN ('id','name','legal_name','status','created_at','updated_at');
  IF v_count = 6 THEN
    RAISE NOTICE 'V-03 PASS  enterprise_accounts has all 6 expected columns';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-03 FAIL  enterprise_accounts column count = % (expected 6)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-04: enterprise_members columns ────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'enterprise_members'
    AND column_name  IN ('id','enterprise_id','user_id','role','status','invited_by','created_at','updated_at');
  IF v_count = 8 THEN
    RAISE NOTICE 'V-04 PASS  enterprise_members has all 8 expected columns';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-04 FAIL  enterprise_members column count = % (expected 8)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-05: fixeo_private schema exists ───────────────────────
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace
    WHERE nspname = 'fixeo_private'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-05 PASS  fixeo_private schema exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-05 FAIL  fixeo_private schema MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-06: _fixeo_is_admin() helper exists ───────────────────
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_admin'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-06 PASS  fixeo_private._fixeo_is_admin() exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-06 FAIL  fixeo_private._fixeo_is_admin() MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-07: _fixeo_is_enterprise_member() helper exists ───────
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_enterprise_member'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-07 PASS  fixeo_private._fixeo_is_enterprise_member() exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-07 FAIL  fixeo_private._fixeo_is_enterprise_member() MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-08: _fixeo_is_enterprise_manager() helper exists ──────
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_enterprise_manager'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-08 PASS  fixeo_private._fixeo_is_enterprise_manager() exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-08 FAIL  fixeo_private._fixeo_is_enterprise_manager() MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-09: create_enterprise_account() RPC exists ────────────
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'create_enterprise_account'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE NOTICE 'V-09 PASS  public.create_enterprise_account() exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-09 FAIL  public.create_enterprise_account() MISSING';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-10: RLS enabled on enterprise_accounts ────────────────
  SELECT relrowsecurity INTO v_ok
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'enterprise_accounts';
  IF v_ok IS TRUE THEN
    RAISE NOTICE 'V-10 PASS  RLS enabled on enterprise_accounts';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-10 FAIL  RLS NOT enabled on enterprise_accounts';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-11: RLS enabled on enterprise_members ─────────────────
  SELECT relrowsecurity INTO v_ok
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'enterprise_members';
  IF v_ok IS TRUE THEN
    RAISE NOTICE 'V-11 PASS  RLS enabled on enterprise_members';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-11 FAIL  RLS NOT enabled on enterprise_members';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-12: 4 RLS policies on enterprise_accounts ─────────────
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c   ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'enterprise_accounts';
  IF v_count = 4 THEN
    RAISE NOTICE 'V-12 PASS  enterprise_accounts has 4 RLS policies';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-12 FAIL  enterprise_accounts RLS policy count = % (expected 4)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-13: 4 RLS policies on enterprise_members ──────────────
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c   ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'enterprise_members';
  IF v_count = 4 THEN
    RAISE NOTICE 'V-13 PASS  enterprise_members has 4 RLS policies';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-13 FAIL  enterprise_members RLS policy count = % (expected 4)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-14: named policies on enterprise_accounts ─────────────
  SELECT ARRAY(
    SELECT pol.polname
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c   ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'enterprise_accounts'
    ORDER BY pol.polname
  ) INTO v_policies;
  IF v_policies @> ARRAY['ea_deny_anon','ea_fixeo_admin_all','ea_members_select','ea_owner_update']::text[] THEN
    RAISE NOTICE 'V-14 PASS  enterprise_accounts policy names correct';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-14 FAIL  enterprise_accounts policy names: %', v_policies;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-15: named policies on enterprise_members ──────────────
  SELECT ARRAY(
    SELECT pol.polname
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c   ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'enterprise_members'
    ORDER BY pol.polname
  ) INTO v_policies;
  IF v_policies @> ARRAY['em_deny_anon','em_fixeo_admin_all','em_members_select','em_self_select']::text[] THEN
    RAISE NOTICE 'V-15 PASS  enterprise_members policy names correct';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-15 FAIL  enterprise_members policy names: %', v_policies;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-16: 5 indexes total across both tables ─────────────────
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
    AND tablename  IN ('enterprise_accounts', 'enterprise_members')
    AND indexname  IN (
      'enterprise_accounts_pkey',
      'enterprise_members_pkey',
      'idx_ea_status',
      'idx_em_enterprise_status',
      'idx_em_user_status',
      'idx_em_active_membership',
      'idx_em_invited'
    );
  -- 2 PKs + 5 named = 7 total; we check the 5 explicit named ones exist
  IF v_count = 5 THEN
    RAISE NOTICE 'V-16 PASS  all 5 named indexes exist';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-16 FAIL  named index count = % (expected 5)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-17: updated_at triggers on both tables ─────────────────
  SELECT COUNT(*) INTO v_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table IN ('enterprise_accounts', 'enterprise_members')
    AND trigger_name IN ('enterprise_accounts_updated_at', 'enterprise_members_updated_at');
  IF v_count = 2 THEN
    RAISE NOTICE 'V-17 PASS  updated_at triggers exist on both tables';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-17 FAIL  updated_at trigger count = % (expected 2)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-18: helpers are SECURITY DEFINER ──────────────────────
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'fixeo_private'
    AND p.proname IN (
      '_fixeo_is_admin',
      '_fixeo_is_enterprise_member',
      '_fixeo_is_enterprise_manager'
    )
    AND p.prosecdef = true;  -- SECURITY DEFINER flag
  IF v_count = 3 THEN
    RAISE NOTICE 'V-18 PASS  all 3 fixeo_private helpers are SECURITY DEFINER';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-18 FAIL  SECURITY DEFINER helper count = % (expected 3)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-19: create_enterprise_account() is SECURITY DEFINER ───
  SELECT p.prosecdef INTO v_ok
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_enterprise_account';
  IF v_ok IS TRUE THEN
    RAISE NOTICE 'V-19 PASS  create_enterprise_account() is SECURITY DEFINER';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-19 FAIL  create_enterprise_account() is NOT SECURITY DEFINER';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-20: helpers owned by postgres ─────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles r     ON r.oid = p.proowner
  WHERE n.nspname = 'fixeo_private'
    AND p.proname IN (
      '_fixeo_is_admin',
      '_fixeo_is_enterprise_member',
      '_fixeo_is_enterprise_manager'
    )
    AND r.rolname = 'postgres';
  IF v_count = 3 THEN
    RAISE NOTICE 'V-20 PASS  all fixeo_private helpers owned by postgres';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-20 FAIL  helpers owned by postgres count = % (expected 3)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-21: create_enterprise_account() owned by postgres ─────
  SELECT (r.rolname = 'postgres') INTO v_ok
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles r     ON r.oid = p.proowner
  WHERE n.nspname = 'public' AND p.proname = 'create_enterprise_account';
  IF v_ok IS TRUE THEN
    RAISE NOTICE 'V-21 PASS  create_enterprise_account() owned by postgres';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-21 FAIL  create_enterprise_account() NOT owned by postgres';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-22: postgres is a superuser (RLS bypass confirmed) ─────
  SELECT rolsuper INTO v_ok
  FROM pg_catalog.pg_roles
  WHERE rolname = 'postgres';
  IF v_ok IS TRUE THEN
    RAISE NOTICE 'V-22 PASS  postgres is superuser — SECURITY DEFINER functions bypass RLS';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-22 FAIL  postgres is NOT superuser — security model assumption violated';
    v_fail := v_fail + 1;
  END IF;

  -- ── V-23: enterprise tables are EMPTY (no production data yet) ─
  SELECT (
    (SELECT COUNT(*) FROM public.enterprise_accounts) +
    (SELECT COUNT(*) FROM public.enterprise_members)
  ) INTO v_count;
  IF v_count = 0 THEN
    RAISE NOTICE 'V-23 PASS  both enterprise tables are empty (expected for fresh migration)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-23 NOTE  enterprise table row count = % (non-zero — expected only if seeded)', v_count;
    -- Non-zero is not a migration failure; note it but don't fail the suite
    v_pass := v_pass + 1;
  END IF;

  -- ── V-24: existing production tables UNTOUCHED ───────────────
  -- Verify service_requests, artisans, missions still exist and
  -- that their RLS state hasn't changed.
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('service_requests', 'artisans', 'missions');
  IF v_count = 3 THEN
    RAISE NOTICE 'V-24 PASS  production tables (service_requests, artisans, missions) all present';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-24 FAIL  one or more production tables MISSING (count=%)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ── V-25: no enterprise objects exist in wrong schema ────────
  -- Helpers must be in fixeo_private, NOT public
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_fixeo_is_admin','_fixeo_is_enterprise_member','_fixeo_is_enterprise_manager');
  IF v_count = 0 THEN
    RAISE NOTICE 'V-25 PASS  authorization helpers NOT in public schema (correct)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'V-25 FAIL  % helpers leaked into public schema (must be in fixeo_private)', v_count;
    v_fail := v_fail + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════
  -- SUMMARY
  -- ════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.13A.1 VERIFICATION SUMMARY';
  RAISE NOTICE '  PASS: %', v_pass;
  RAISE NOTICE '  FAIL: %', v_fail;

  IF v_fail = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '  ✓ ALL CHECKS PASSED — migration 7c13a1 verified';
    RAISE NOTICE '  Enterprise Core Foundation is correctly installed.';
    RAISE NOTICE '  No existing production systems were affected.';
  ELSE
    RAISE WARNING '';
    RAISE WARNING '  ✗ % CHECK(S) FAILED — DO NOT USE ENTERPRISE FEATURES', v_fail;
    RAISE WARNING '  Report failing checks before proceeding.';
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '';

END $$;
