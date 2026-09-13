-- ════════════════════════════════════════════════════════════
-- FIXEO — BP08F Member–Site Assignment SQL Tests
-- File: tests/enterprise/bp08f-assignment-tests.sql
-- Sprint: BP08F
-- Branch: recovery/seo-v3-safe
-- HEAD at authoring: ff65b6d84a982bf606cc6335d35b584ed522abfa
--
-- EVERY behavioral test block: BEGIN ... ROLLBACK (transaction-isolated).
-- Zero bare COMMIT in behavioral tests.
-- All test data inserted inside BEGIN/ROLLBACK blocks.
-- Static / structural checks run in single DO $$ blocks.
-- ════════════════════════════════════════════════════════════
-- REQUIRES: 7c13a1, 7c13a2, 7c13a3, 7c15a3, 7c15a6 applied to the target DB.
-- DO NOT RUN AGAINST PRODUCTION.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F SQL Test Suite — enterprise member–site assignments';
  RAISE NOTICE 'Tests: A-01..A-10, B-01..B-10, C-01..C-10,';
  RAISE NOTICE '       D-01..D-02, E-01..E-03, F-01..F-03';
  RAISE NOTICE 'Total: 38 test cases';
  RAISE NOTICE 'All behavioral blocks: BEGIN/ROLLBACK (no persistent state)';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION A — STATIC STRUCTURAL CHECKS (DO $$ blocks)
-- A-01..A-10: no fixture data required
-- ════════════════════════════════════════════════════════════

-- ── A-01 through A-05: table existence, UNIQUE, RLS, RPC security ─────────
DO $$
DECLARE
  v_tbl_exists    boolean;
  v_uniq_exists   boolean;
  v_rls_enabled   boolean;
  v_rls_forced    boolean;
  v_secdef        boolean;
  v_sp_config     text;
BEGIN

  -- ── A-01: enterprise_member_sites table exists ────────────
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_member_sites'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE EXCEPTION 'A-01 FAIL: public.enterprise_member_sites does not exist';
  END IF;
  RAISE NOTICE 'A-01 PASS: public.enterprise_member_sites exists';

  -- ── A-02: UNIQUE(member_id, site_id) constraint exists ────
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace  ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'enterprise_member_sites'
      AND con.contype = 'u'
      AND (
        -- The constraint covers exactly member_id and site_id
        -- (2 columns); verify via attribute count
        pg_catalog.array_length(con.conkey, 1) = 2
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = rel.oid
            AND a.attname  = 'member_id'
            AND a.attnum   = ANY(con.conkey)
        )
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = rel.oid
            AND a.attname  = 'site_id'
            AND a.attnum   = ANY(con.conkey)
        )
      )
  ) INTO v_uniq_exists;

  IF NOT v_uniq_exists THEN
    RAISE EXCEPTION 'A-02 FAIL: UNIQUE(member_id, site_id) constraint not found on enterprise_member_sites';
  END IF;
  RAISE NOTICE 'A-02 PASS: UNIQUE(member_id, site_id) constraint exists';

  -- ── A-03: RLS enabled on enterprise_member_sites ──────────
  SELECT c.relrowsecurity, c.relforcerowsecurity
  INTO v_rls_enabled, v_rls_forced
  FROM pg_catalog.pg_class     c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enterprise_member_sites';

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'A-03 FAIL: RLS not enabled on enterprise_member_sites';
  END IF;
  IF NOT v_rls_forced THEN
    RAISE EXCEPTION 'A-03 FAIL: FORCE ROW LEVEL SECURITY not set on enterprise_member_sites';
  END IF;
  RAISE NOTICE 'A-03 PASS: RLS enabled and forced on enterprise_member_sites';

  -- ── A-04: set_enterprise_member_sites is SECURITY DEFINER ─
  SELECT p.prosecdef
  INTO v_secdef
  FROM pg_catalog.pg_proc      p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_enterprise_member_sites'
  LIMIT 1;

  IF NOT FOUND OR NOT v_secdef THEN
    RAISE EXCEPTION 'A-04 FAIL: set_enterprise_member_sites is not SECURITY DEFINER (or not found)';
  END IF;
  RAISE NOTICE 'A-04 PASS: set_enterprise_member_sites is SECURITY DEFINER';

  -- ── A-05: set_enterprise_member_sites has search_path='' ──
  SELECT pg_catalog.array_to_string(p.proconfig, '|')
  INTO v_sp_config
  FROM pg_catalog.pg_proc      p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_enterprise_member_sites'
  LIMIT 1;

  IF v_sp_config IS NULL OR v_sp_config NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'A-05 FAIL: set_enterprise_member_sites has no search_path config: %', v_sp_config;
  END IF;
  IF v_sp_config LIKE '%search_path=public%' THEN
    RAISE EXCEPTION 'A-05 FAIL: set_enterprise_member_sites has search_path=public (not empty): %', v_sp_config;
  END IF;
  RAISE NOTICE 'A-05 PASS: set_enterprise_member_sites has search_path = '''' (empty)';

END $$;


-- ── A-06 through A-10: helper, trigger, audit constraint, indexes ─────────
DO $$
DECLARE
  v_helper_exists  boolean;
  v_trig_fn_exists boolean;
  v_check_ok       boolean;
  v_idx_mem        boolean;
  v_idx_site       boolean;
BEGIN

  -- ── A-06: _fixeo_get_site_manager_site_ids exists ─────────
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc      p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_fixeo_get_site_manager_site_ids'
  ) INTO v_helper_exists;

  IF NOT v_helper_exists THEN
    RAISE EXCEPTION 'A-06 FAIL: fixeo_private._fixeo_get_site_manager_site_ids does not exist';
  END IF;
  RAISE NOTICE 'A-06 PASS: fixeo_private._fixeo_get_site_manager_site_ids exists';

  -- ── A-07: _ems_cross_tenant_check trigger function exists ─
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc      p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_ems_cross_tenant_check'
  ) INTO v_trig_fn_exists;

  IF NOT v_trig_fn_exists THEN
    RAISE EXCEPTION 'A-07 FAIL: fixeo_private._ems_cross_tenant_check trigger function does not exist';
  END IF;
  RAISE NOTICE 'A-07 PASS: fixeo_private._ems_cross_tenant_check trigger function exists';

  -- ── A-08: member_site_assignments_changed in CHECK constraint
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace  ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'enterprise_audit_log'
      AND con.contype = 'c'
      AND con.conname LIKE '%action_type%'
      AND pg_catalog.pg_get_constraintdef(con.oid)
          LIKE '%member_site_assignments_changed%'
  ) INTO v_check_ok;

  IF NOT v_check_ok THEN
    RAISE EXCEPTION 'A-08 FAIL: member_site_assignments_changed not found in enterprise_audit_log action_type CHECK constraint';
  END IF;
  RAISE NOTICE 'A-08 PASS: member_site_assignments_changed present in enterprise_audit_log CHECK constraint';

  -- ── A-09: idx_ems_member index exists ─────────────────────
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_member_sites'
      AND indexname  = 'idx_ems_member'
  ) INTO v_idx_mem;

  IF NOT v_idx_mem THEN
    RAISE EXCEPTION 'A-09 FAIL: idx_ems_member index does not exist';
  END IF;
  RAISE NOTICE 'A-09 PASS: idx_ems_member index exists';

  -- ── A-10: idx_ems_site index exists ───────────────────────
  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_member_sites'
      AND indexname  = 'idx_ems_site'
  ) INTO v_idx_site;

  IF NOT v_idx_site THEN
    RAISE EXCEPTION 'A-10 FAIL: idx_ems_site index does not exist';
  END IF;
  RAISE NOTICE 'A-10 PASS: idx_ems_site index exists';

END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION B — RPC AUTHORIZATION (isolated BEGIN/ROLLBACK each)
-- B-01..B-10
-- ════════════════════════════════════════════════════════════

-- B-01: unauthenticated (auth.uid() = NULL) is blocked
BEGIN;
DO $$
DECLARE
  v_eid uuid := gen_random_uuid();
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  -- No set_config → auth.uid() = NULL in SECURITY DEFINER context
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;
  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'unauthenticated' THEN
    RAISE EXCEPTION 'B-01 FAIL: expected unauthenticated, got %', v_res;
  END IF;
  RAISE NOTICE 'B-01 PASS: unauthenticated caller blocked (unauthenticated)';
END $$;
ROLLBACK;

-- B-02: non-member caller blocked (not_a_member)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-b02@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-b02@fixeo.test', 'B02 NonMember');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B02') RETURNING id INTO v_eid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'not_a_member' THEN
    RAISE EXCEPTION 'B-02 FAIL: expected not_a_member, got %', v_res;
  END IF;
  RAISE NOTICE 'B-02 PASS: non-member caller blocked (not_a_member)';
END $$;
ROLLBACK;

-- B-03: inactive (suspended) caller blocked (caller_not_active)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-b03@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-b03@fixeo.test', 'B03 Suspended');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B03') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'admin', 'suspended');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'caller_not_active' THEN
    RAISE EXCEPTION 'B-03 FAIL: expected caller_not_active, got %', v_res;
  END IF;
  RAISE NOTICE 'B-03 PASS: suspended caller blocked (caller_not_active)';
END $$;
ROLLBACK;

-- B-04: operations_manager caller blocked (forbidden)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-b04@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-b04@fixeo.test', 'B04 OpsMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B04') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'operations_manager', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'forbidden' THEN
    RAISE EXCEPTION 'B-04 FAIL: expected forbidden, got %', v_res;
  END IF;
  RAISE NOTICE 'B-04 PASS: operations_manager caller blocked (forbidden)';
END $$;
ROLLBACK;

-- B-05: site_manager caller blocked (forbidden)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-b05@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-b05@fixeo.test', 'B05 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B05') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'site_manager', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'forbidden' THEN
    RAISE EXCEPTION 'B-05 FAIL: expected forbidden, got %', v_res;
  END IF;
  RAISE NOTICE 'B-05 PASS: site_manager caller blocked (forbidden)';
END $$;
ROLLBACK;

-- B-06: reporter caller blocked (forbidden)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-b06@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-b06@fixeo.test', 'B06 Reporter');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B06') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'reporter', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'forbidden' THEN
    RAISE EXCEPTION 'B-06 FAIL: expected forbidden, got %', v_res;
  END IF;
  RAISE NOTICE 'B-06 PASS: reporter caller blocked (forbidden)';
END $$;
ROLLBACK;

-- B-07: target is not a site_manager → blocked (target_not_site_manager)
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_res   jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-b07o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-b07m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-b07o@fixeo.test', 'B07 Owner'),
          (v_mem,   'bp08f-b07m@fixeo.test', 'B07 Admin');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B07') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'admin', 'active') RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'target_not_site_manager' THEN
    RAISE EXCEPTION 'B-07 FAIL: expected target_not_site_manager, got %', v_res;
  END IF;
  RAISE NOTICE 'B-07 PASS: target non-site_manager blocked (target_not_site_manager)';
END $$;
ROLLBACK;

-- B-08: target is inactive (suspended) → blocked (target_not_active)
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_res   jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-b08o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-b08m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-b08o@fixeo.test', 'B08 Owner'),
          (v_mem,   'bp08f-b08m@fixeo.test', 'B08 Suspended SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B08') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'suspended') RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'target_not_active' THEN
    RAISE EXCEPTION 'B-08 FAIL: expected target_not_active, got %', v_res;
  END IF;
  RAISE NOTICE 'B-08 PASS: suspended target site_manager blocked (target_not_active)';
END $$;
ROLLBACK;

-- B-09: owner can assign sites successfully (empty → 2 sites)
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_sid2  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-b09o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-b09m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-b09o@fixeo.test', 'B09 Owner'),
          (v_mem,   'bp08f-b09m@fixeo.test', 'B09 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B09') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site Alpha', 'Casablanca') RETURNING id INTO v_sid1;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site Beta',  'Rabat')      RETURNING id INTO v_sid2;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1, v_sid2]) INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-09 FAIL: expected ok=true, got %', v_res;
  END IF;
  IF (v_res->>'site_count')::int != 2 THEN
    RAISE EXCEPTION 'B-09 FAIL: expected site_count=2, got %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_count != 2 THEN
    RAISE EXCEPTION 'B-09 FAIL: expected 2 rows in enterprise_member_sites, found %', v_count;
  END IF;
  RAISE NOTICE 'B-09 PASS: owner successfully assigned 2 sites';
END $$;
ROLLBACK;

-- B-10: admin can assign sites successfully (assigns 1 site)
BEGIN;
DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_admin, 'bp08f-b10a@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-b10m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_admin, 'bp08f-b10a@fixeo.test', 'B10 Admin'),
          (v_mem,   'bp08f-b10m@fixeo.test', 'B10 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo B10') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_admin, 'admin', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site Gamma', 'Fez') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_admin), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-10 FAIL: expected ok=true, got %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid AND site_id = v_sid1;

  IF v_count != 1 THEN
    RAISE EXCEPTION 'B-10 FAIL: expected 1 row in enterprise_member_sites, found %', v_count;
  END IF;
  RAISE NOTICE 'B-10 PASS: admin successfully assigned 1 site';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION C — ASSIGNMENT SEMANTICS (isolated BEGIN/ROLLBACK each)
-- C-01..C-10
-- ════════════════════════════════════════════════════════════

-- C-01: empty array clears all assignments
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c01o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c01m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c01o@fixeo.test', 'C01 Owner'),
          (v_mem,   'bp08f-c01m@fixeo.test', 'C01 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C01') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C01', 'Marrakech') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- First assign 1 site
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-01 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- Now clear with empty array
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[]::uuid[]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-01 FAIL: clear with empty array returned not ok: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'C-01 FAIL: expected 0 rows after clear, found %', v_count;
  END IF;
  RAISE NOTICE 'C-01 PASS: empty array clears all assignments';
END $$;
ROLLBACK;

-- C-02: duplicate site_ids in input are deduplicated
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c02o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c02m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c02o@fixeo.test', 'C02 Owner'),
          (v_mem,   'bp08f-c02m@fixeo.test', 'C02 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C02') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C02', 'Tangier') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- Pass same site_id twice
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1, v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-02 FAIL: RPC failed: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_count != 1 THEN
    RAISE EXCEPTION 'C-02 FAIL: expected 1 row after dedup, found %', v_count;
  END IF;
  RAISE NOTICE 'C-02 PASS: duplicate site_ids deduplicated (1 row inserted)';
END $$;
ROLLBACK;

-- C-03: NULL input treated as empty (clears assignments)
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c03o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c03m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c03o@fixeo.test', 'C03 Owner'),
          (v_mem,   'bp08f-c03m@fixeo.test', 'C03 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C03') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C03', 'Agadir') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- Assign one site first
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-03 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- Now pass NULL
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, NULL) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-03 FAIL: NULL input returned not ok: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'C-03 FAIL: expected 0 rows after NULL input, found %', v_count;
  END IF;
  RAISE NOTICE 'C-03 PASS: NULL input treated as empty (all assignments cleared)';
END $$;
ROLLBACK;

-- C-04: no-op returns no_change, creates zero audit events
BEGIN;
DO $$
DECLARE
  v_owner       uuid := gen_random_uuid();
  v_mem         uuid := gen_random_uuid();
  v_eid         uuid;
  v_mid         uuid;
  v_sid1        uuid;
  v_res         jsonb;
  v_audit_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c04o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c04m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c04o@fixeo.test', 'C04 Owner'),
          (v_mem,   'bp08f-c04m@fixeo.test', 'C04 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C04') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C04', 'Oujda') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- First assignment (creates 1 audit event)
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-04 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- No-op: same sites again
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;

  IF v_res->>'reason' != 'no_change' THEN
    RAISE EXCEPTION 'C-04 FAIL: expected reason=no_change, got %', v_res;
  END IF;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-04 FAIL: no_change should have ok=true, got %', v_res;
  END IF;

  -- Only 1 audit event (from the first assignment, not the no-op)
  SELECT COUNT(*) INTO v_audit_count
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed';

  IF v_audit_count != 1 THEN
    RAISE EXCEPTION 'C-04 FAIL: expected exactly 1 audit event (from initial set), found %', v_audit_count;
  END IF;
  RAISE NOTICE 'C-04 PASS: no-op returns no_change, creates zero additional audit events';
END $$;
ROLLBACK;

-- C-05: real change creates exactly one audit event
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_sid2  uuid;
  v_res   jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c05o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c05m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c05o@fixeo.test', 'C05 Owner'),
          (v_mem,   'bp08f-c05m@fixeo.test', 'C05 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C05') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C05a', 'Meknes') RETURNING id INTO v_sid1;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C05b', 'Fez')    RETURNING id INTO v_sid2;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-05 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- Real change: replace with different site
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid2]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-05 FAIL: second assignment failed: %', v_res;
  END IF;

  -- 2 audit events total (one per real change)
  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed';

  IF v_count != 2 THEN
    RAISE EXCEPTION 'C-05 FAIL: expected 2 audit events total, found %', v_count;
  END IF;
  RAISE NOTICE 'C-05 PASS: each real change creates exactly one audit event';
END $$;
ROLLBACK;

-- C-06: actor_user_id is correct in the audit event
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_mem   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_res   jsonb;
  v_actor uuid;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c06o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c06m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c06o@fixeo.test', 'C06 Owner'),
          (v_mem,   'bp08f-c06m@fixeo.test', 'C06 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C06') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C06', 'Tetouan') RETURNING id INTO v_sid1;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-06 setup FAIL: assignment failed: %', v_res;
  END IF;

  SELECT actor_user_id INTO v_actor
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed'
  LIMIT 1;

  IF v_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'C-06 FAIL: actor_user_id is %, expected %', v_actor, v_owner;
  END IF;
  RAISE NOTICE 'C-06 PASS: actor_user_id is correct in audit event';
END $$;
ROLLBACK;

-- C-07: metadata previous_site_ids and new_site_ids are correct
BEGIN;
DO $$
DECLARE
  v_owner  uuid := gen_random_uuid();
  v_mem    uuid := gen_random_uuid();
  v_eid    uuid;
  v_mid    uuid;
  v_sid1   uuid;
  v_sid2   uuid;
  v_res    jsonb;
  v_meta   jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c07o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c07m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c07o@fixeo.test', 'C07 Owner'),
          (v_mem,   'bp08f-c07m@fixeo.test', 'C07 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C07') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C07a', 'Safi') RETURNING id INTO v_sid1;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C07b', 'Nador') RETURNING id INTO v_sid2;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- First: assign sid1 only (previous_site_ids = [], new_site_ids = [sid1])
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-07 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- Second: change to sid2 (previous_site_ids = [sid1], new_site_ids = [sid2])
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid2]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-07 FAIL: second assignment failed: %', v_res;
  END IF;

  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_meta IS NULL THEN
    RAISE EXCEPTION 'C-07 FAIL: no audit metadata found';
  END IF;
  IF v_meta->'previous_site_ids' IS NULL THEN
    RAISE EXCEPTION 'C-07 FAIL: metadata missing previous_site_ids';
  END IF;
  IF v_meta->'new_site_ids' IS NULL THEN
    RAISE EXCEPTION 'C-07 FAIL: metadata missing new_site_ids';
  END IF;
  -- previous_site_ids should contain sid1
  IF NOT (v_meta->'previous_site_ids' @> pg_catalog.to_jsonb(v_sid1)) THEN
    RAISE EXCEPTION 'C-07 FAIL: previous_site_ids does not contain sid1. meta=%', v_meta;
  END IF;
  -- new_site_ids should contain sid2
  IF NOT (v_meta->'new_site_ids' @> pg_catalog.to_jsonb(v_sid2)) THEN
    RAISE EXCEPTION 'C-07 FAIL: new_site_ids does not contain sid2. meta=%', v_meta;
  END IF;
  RAISE NOTICE 'C-07 PASS: metadata previous_site_ids and new_site_ids are correct';
END $$;
ROLLBACK;

-- C-08: wrong-enterprise site is blocked (site_enterprise_mismatch)
BEGIN;
DO $$
DECLARE
  v_owner  uuid := gen_random_uuid();
  v_mem    uuid := gen_random_uuid();
  v_eid1   uuid;
  v_eid2   uuid;
  v_mid    uuid;
  v_sid_other uuid;
  v_res    jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c08o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c08m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c08o@fixeo.test', 'C08 Owner'),
          (v_mem,   'bp08f-c08m@fixeo.test', 'C08 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantA C08') RETURNING id INTO v_eid1;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantB C08') RETURNING id INTO v_eid2;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid1, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid1, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  -- Site belongs to eid2
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid2, 'Other Tenant Site', 'Kenitra') RETURNING id INTO v_sid_other;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid1, v_mid, ARRAY[v_sid_other]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'site_enterprise_mismatch' THEN
    RAISE EXCEPTION 'C-08 FAIL: expected site_enterprise_mismatch, got %', v_res;
  END IF;
  RAISE NOTICE 'C-08 PASS: wrong-enterprise site blocked (site_enterprise_mismatch)';
END $$;
ROLLBACK;

-- C-09: wrong-enterprise member is blocked (member_not_found)
BEGIN;
DO $$
DECLARE
  v_owner  uuid := gen_random_uuid();
  v_mem    uuid := gen_random_uuid();
  v_eid1   uuid;
  v_eid2   uuid;
  v_mid_other uuid;
  v_res    jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c09o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c09m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c09o@fixeo.test', 'C09 Owner'),
          (v_mem,   'bp08f-c09m@fixeo.test', 'C09 OtherMember');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantA C09') RETURNING id INTO v_eid1;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantB C09') RETURNING id INTO v_eid2;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid1, v_owner, 'owner', 'active');
  -- Member belongs to eid2
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid2, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid_other;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.set_enterprise_member_sites(v_eid1, v_mid_other, ARRAY[]::uuid[]) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'member_not_found' THEN
    RAISE EXCEPTION 'C-09 FAIL: expected member_not_found, got %', v_res;
  END IF;
  RAISE NOTICE 'C-09 PASS: wrong-enterprise member blocked (member_not_found)';
END $$;
ROLLBACK;

-- C-10: atomic replacement (delete old, insert new in one transaction)
BEGIN;
DO $$
DECLARE
  v_owner  uuid := gen_random_uuid();
  v_mem    uuid := gen_random_uuid();
  v_eid    uuid;
  v_mid    uuid;
  v_sid1   uuid;
  v_sid2   uuid;
  v_res    jsonb;
  v_old_count integer;
  v_new_count integer;
  v_sid1_gone boolean;
  v_sid2_here boolean;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_owner, 'bp08f-c10o@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_mem,   'bp08f-c10m@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_owner, 'bp08f-c10o@fixeo.test', 'C10 Owner'),
          (v_mem,   'bp08f-c10m@fixeo.test', 'C10 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo C10') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_mem, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C10a', 'Beni Mellal') RETURNING id INTO v_sid1;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site C10b', 'Khouribga')   RETURNING id INTO v_sid2;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);

  -- Assign sid1
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid1]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-10 setup FAIL: initial assignment failed: %', v_res;
  END IF;

  -- Atomically replace with sid2
  SELECT public.set_enterprise_member_sites(v_eid, v_mid, ARRAY[v_sid2]) INTO v_res;
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-10 FAIL: replacement assignment failed: %', v_res;
  END IF;

  -- sid1 must be gone, sid2 must be present, total = 1
  SELECT COUNT(*) INTO v_new_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  SELECT NOT EXISTS(
    SELECT 1 FROM public.enterprise_member_sites
    WHERE member_id = v_mid AND site_id = v_sid1
  ) INTO v_sid1_gone;

  SELECT EXISTS(
    SELECT 1 FROM public.enterprise_member_sites
    WHERE member_id = v_mid AND site_id = v_sid2
  ) INTO v_sid2_here;

  IF v_new_count != 1 THEN
    RAISE EXCEPTION 'C-10 FAIL: expected 1 row, found %', v_new_count;
  END IF;
  IF NOT v_sid1_gone THEN
    RAISE EXCEPTION 'C-10 FAIL: old site (sid1) was not removed';
  END IF;
  IF NOT v_sid2_here THEN
    RAISE EXCEPTION 'C-10 FAIL: new site (sid2) was not inserted';
  END IF;
  RAISE NOTICE 'C-10 PASS: atomic replacement — old site removed, new site inserted, exactly 1 row';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION D — CROSS-TENANT TRIGGER (isolated BEGIN/ROLLBACK each)
-- D-01..D-02
-- ════════════════════════════════════════════════════════════

-- D-01: trigger blocks member-enterprise mismatch
BEGIN;
DO $$
DECLARE
  v_eid1  uuid;
  v_eid2  uuid;
  v_uid1  uuid := gen_random_uuid();
  v_uid2  uuid := gen_random_uuid();
  v_mid2  uuid;
  v_sid1  uuid;
  v_raised boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid1, 'bp08f-d01u1@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_uid2, 'bp08f-d01u2@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid1, 'bp08f-d01u1@fixeo.test', 'D01 User1'),
          (v_uid2, 'bp08f-d01u2@fixeo.test', 'D01 User2');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantA D01') RETURNING id INTO v_eid1;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantB D01') RETURNING id INTO v_eid2;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid1, v_uid1, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid2, v_uid2, 'site_manager', 'active') RETURNING id INTO v_mid2;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid1, 'Site D01', 'Larache') RETURNING id INTO v_sid1;

  -- Direct insert bypassing RPC: enterprise_id=eid1 but member belongs to eid2
  BEGIN
    INSERT INTO public.enterprise_member_sites(enterprise_id, member_id, site_id, assigned_by)
    VALUES(v_eid1, v_mid2, v_sid1, v_uid1);
    RAISE EXCEPTION 'D-01 FAIL: trigger should have blocked member-enterprise mismatch';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%ems_cross_tenant%member enterprise mismatch%' THEN
        v_raised := true;
      ELSE
        RAISE EXCEPTION 'D-01 FAIL: unexpected error: %', SQLERRM;
      END IF;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'D-01 FAIL: trigger did not raise exception';
  END IF;
  RAISE NOTICE 'D-01 PASS: trigger blocks member-enterprise mismatch';
END $$;
ROLLBACK;

-- D-02: trigger blocks site-enterprise mismatch
BEGIN;
DO $$
DECLARE
  v_eid1  uuid;
  v_eid2  uuid;
  v_uid1  uuid := gen_random_uuid();
  v_uid2  uuid := gen_random_uuid();
  v_mid1  uuid;
  v_sid2  uuid;
  v_raised boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid1, 'bp08f-d02u1@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_uid2, 'bp08f-d02u2@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid1, 'bp08f-d02u1@fixeo.test', 'D02 User1'),
          (v_uid2, 'bp08f-d02u2@fixeo.test', 'D02 User2');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantA D02') RETURNING id INTO v_eid1;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TenantB D02') RETURNING id INTO v_eid2;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid1, v_uid1, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid1, v_uid2, 'site_manager', 'active') RETURNING id INTO v_mid1;
  -- Site belongs to eid2
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid2, 'Other Site D02', 'Ifrane') RETURNING id INTO v_sid2;

  -- Direct insert bypassing RPC: enterprise_id=eid1 but site belongs to eid2
  BEGIN
    INSERT INTO public.enterprise_member_sites(enterprise_id, member_id, site_id, assigned_by)
    VALUES(v_eid1, v_mid1, v_sid2, v_uid1);
    RAISE EXCEPTION 'D-02 FAIL: trigger should have blocked site-enterprise mismatch';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%ems_cross_tenant%site enterprise mismatch%' THEN
        v_raised := true;
      ELSE
        RAISE EXCEPTION 'D-02 FAIL: unexpected error: %', SQLERRM;
      END IF;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'D-02 FAIL: trigger did not raise exception';
  END IF;
  RAISE NOTICE 'D-02 PASS: trigger blocks site-enterprise mismatch';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION E — VISIBILITY / GRANT CHECKS (static DO $$)
-- E-01..E-03
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_auth_insert boolean;
  v_auth_update boolean;
  v_auth_delete boolean;
BEGIN

  -- E-01: authenticated has no INSERT on enterprise_member_sites
  SELECT has_table_privilege('authenticated', 'public.enterprise_member_sites', 'INSERT')
  INTO v_auth_insert;
  IF v_auth_insert THEN
    RAISE EXCEPTION 'E-01 FAIL: authenticated has INSERT on enterprise_member_sites';
  END IF;
  RAISE NOTICE 'E-01 PASS: authenticated has no INSERT on enterprise_member_sites';

  -- E-02: authenticated has no UPDATE on enterprise_member_sites
  SELECT has_table_privilege('authenticated', 'public.enterprise_member_sites', 'UPDATE')
  INTO v_auth_update;
  IF v_auth_update THEN
    RAISE EXCEPTION 'E-02 FAIL: authenticated has UPDATE on enterprise_member_sites';
  END IF;
  RAISE NOTICE 'E-02 PASS: authenticated has no UPDATE on enterprise_member_sites';

  -- E-03: authenticated has no DELETE on enterprise_member_sites
  SELECT has_table_privilege('authenticated', 'public.enterprise_member_sites', 'DELETE')
  INTO v_auth_delete;
  IF v_auth_delete THEN
    RAISE EXCEPTION 'E-03 FAIL: authenticated has DELETE on enterprise_member_sites';
  END IF;
  RAISE NOTICE 'E-03 PASS: authenticated has no DELETE on enterprise_member_sites';

END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION F — HELPER FUNCTION TESTS (isolated BEGIN/ROLLBACK each)
-- F-01..F-03
-- ════════════════════════════════════════════════════════════

-- F-01: _fixeo_get_site_manager_site_ids returns correct ids for active site_manager
BEGIN;
DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_sid2  uuid;
  v_result uuid[];
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-f01@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-f01@fixeo.test', 'F01 SiteMgr');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo F01') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_uid, 'site_manager', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site F01a', 'Errachidia') RETURNING id INTO v_sid1;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site F01b', 'Ouarzazate') RETURNING id INTO v_sid2;

  -- Assign both sites directly (bypass RPC for helper test setup)
  INSERT INTO public.enterprise_member_sites(enterprise_id, member_id, site_id, assigned_by)
  VALUES(v_eid, v_mid, v_sid1, v_uid),
        (v_eid, v_mid, v_sid2, v_uid);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT fixeo_private._fixeo_get_site_manager_site_ids(v_eid) INTO v_result;

  IF v_result IS NULL OR array_length(v_result, 1) != 2 THEN
    RAISE EXCEPTION 'F-01 FAIL: expected 2 site_ids, got %', v_result;
  END IF;
  IF NOT (v_sid1 = ANY(v_result)) THEN
    RAISE EXCEPTION 'F-01 FAIL: sid1 not in result: %', v_result;
  END IF;
  IF NOT (v_sid2 = ANY(v_result)) THEN
    RAISE EXCEPTION 'F-01 FAIL: sid2 not in result: %', v_result;
  END IF;
  RAISE NOTICE 'F-01 PASS: _fixeo_get_site_manager_site_ids returns correct ids for active site_manager';
END $$;
ROLLBACK;

-- F-02: returns empty array for non-site_manager role
BEGIN;
DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_result uuid[];
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08f-f02@fixeo.test', 'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08f-f02@fixeo.test', 'F02 Admin');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo F02') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_uid, 'admin', 'active') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site F02', 'Taza') RETURNING id INTO v_sid1;
  -- Insert an assignment row manually (role = admin, should not appear)
  INSERT INTO public.enterprise_member_sites(enterprise_id, member_id, site_id, assigned_by)
  VALUES(v_eid, v_mid, v_sid1, v_uid);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT fixeo_private._fixeo_get_site_manager_site_ids(v_eid) INTO v_result;

  -- Admin is not site_manager so result must be empty
  IF v_result IS NULL OR array_length(v_result, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'F-02 FAIL: expected empty array for non-site_manager, got %', v_result;
  END IF;
  RAISE NOTICE 'F-02 PASS: _fixeo_get_site_manager_site_ids returns empty array for non-site_manager role';
END $$;
ROLLBACK;

-- F-03: returns empty array for suspended site_manager
BEGIN;
DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_uid_owner uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_sid1  uuid;
  v_result uuid[];
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, "role")
    VALUES(v_uid,       'bp08f-f03@fixeo.test',   'x', now(), now(), now(), 'authenticated', 'authenticated'),
          (v_uid_owner, 'bp08f-f03o@fixeo.test',  'x', now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid,       'bp08f-f03@fixeo.test',   'F03 Suspended SiteMgr'),
          (v_uid_owner, 'bp08f-f03o@fixeo.test',  'F03 Owner');
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'TestCo F03') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid_owner, 'owner', 'active');
  INSERT INTO public.enterprise_members(id, enterprise_id, user_id, role, status)
    VALUES(gen_random_uuid(), v_eid, v_uid, 'site_manager', 'suspended') RETURNING id INTO v_mid;
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Site F03', 'Al Hoceima') RETURNING id INTO v_sid1;
  -- Insert assignment row manually for the suspended member
  INSERT INTO public.enterprise_member_sites(enterprise_id, member_id, site_id, assigned_by)
  VALUES(v_eid, v_mid, v_sid1, v_uid_owner);

  -- Query as the suspended site_manager
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT fixeo_private._fixeo_get_site_manager_site_ids(v_eid) INTO v_result;

  -- Suspended site_manager: helper filters on status='active', so empty
  IF v_result IS NULL OR array_length(v_result, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'F-03 FAIL: expected empty array for suspended site_manager, got %', v_result;
  END IF;
  RAISE NOTICE 'F-03 PASS: _fixeo_get_site_manager_site_ids returns empty array for suspended site_manager';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- Z — TEST SUITE SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F SQL Test Suite — COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION A (static checks)  : A-01..A-10  (10 tests)';
  RAISE NOTICE '  A-01  enterprise_member_sites table exists';
  RAISE NOTICE '  A-02  UNIQUE(member_id, site_id) constraint exists';
  RAISE NOTICE '  A-03  RLS enabled and forced on enterprise_member_sites';
  RAISE NOTICE '  A-04  set_enterprise_member_sites is SECURITY DEFINER';
  RAISE NOTICE '  A-05  set_enterprise_member_sites has search_path = ''''';
  RAISE NOTICE '  A-06  _fixeo_get_site_manager_site_ids exists';
  RAISE NOTICE '  A-07  _ems_cross_tenant_check trigger function exists';
  RAISE NOTICE '  A-08  member_site_assignments_changed in CHECK constraint';
  RAISE NOTICE '  A-09  idx_ems_member index exists';
  RAISE NOTICE '  A-10  idx_ems_site index exists';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION B (RPC authorization): B-01..B-10 (10 tests)';
  RAISE NOTICE '  B-01  unauthenticated blocked';
  RAISE NOTICE '  B-02  non-member blocked (not_a_member)';
  RAISE NOTICE '  B-03  inactive caller blocked (caller_not_active)';
  RAISE NOTICE '  B-04  operations_manager blocked (forbidden)';
  RAISE NOTICE '  B-05  site_manager blocked (forbidden)';
  RAISE NOTICE '  B-06  reporter blocked (forbidden)';
  RAISE NOTICE '  B-07  target non-site_manager blocked (target_not_site_manager)';
  RAISE NOTICE '  B-08  target inactive blocked (target_not_active)';
  RAISE NOTICE '  B-09  owner success (empty → 2 sites)';
  RAISE NOTICE '  B-10  admin success (1 site)';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION C (assignment semantics): C-01..C-10 (10 tests)';
  RAISE NOTICE '  C-01  empty array clears all assignments';
  RAISE NOTICE '  C-02  duplicate site_ids deduplicated';
  RAISE NOTICE '  C-03  NULL input treated as empty';
  RAISE NOTICE '  C-04  no-op returns no_change, zero additional audit events';
  RAISE NOTICE '  C-05  real change creates exactly one audit event';
  RAISE NOTICE '  C-06  actor_user_id correct in audit event';
  RAISE NOTICE '  C-07  metadata previous_site_ids and new_site_ids correct';
  RAISE NOTICE '  C-08  wrong-enterprise site blocked (site_enterprise_mismatch)';
  RAISE NOTICE '  C-09  wrong-enterprise member blocked (member_not_found)';
  RAISE NOTICE '  C-10  atomic replacement (delete old, insert new)';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION D (cross-tenant trigger): D-01..D-02 (2 tests)';
  RAISE NOTICE '  D-01  trigger blocks member-enterprise mismatch';
  RAISE NOTICE '  D-02  trigger blocks site-enterprise mismatch';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION E (grant checks): E-01..E-03 (3 tests)';
  RAISE NOTICE '  E-01  authenticated has no INSERT on enterprise_member_sites';
  RAISE NOTICE '  E-02  authenticated has no UPDATE on enterprise_member_sites';
  RAISE NOTICE '  E-03  authenticated has no DELETE on enterprise_member_sites';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION F (helper function): F-01..F-03 (3 tests)';
  RAISE NOTICE '  F-01  returns correct ids for active site_manager';
  RAISE NOTICE '  F-02  returns empty array for non-site_manager role';
  RAISE NOTICE '  F-03  returns empty array for suspended site_manager';
  RAISE NOTICE '';
  RAISE NOTICE 'TOTAL: 38 test cases';
  RAISE NOTICE 'If all tests passed (no EXCEPTION raised), suite is GREEN.';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;
