-- ════════════════════════════════════════════════════════════
-- FIXEO — BP08F Site Manager Scope SQL Tests
-- File: tests/enterprise/bp08f-scope-tests.sql
-- Sprint: BP08F
-- Branch: recovery/seo-v3-safe
-- HEAD at preparation: (7c15a7 applied)
--
-- WHAT IS TESTED
--   A: Structural / static assertions (policy existence, security attrs)
--   B: enterprise_sites visibility by role
--   C: enterprise_request_context visibility by role
--   D: create_enterprise_request — site_manager assignment checks
--   E: confirm_completed_mission — site_manager assignment checks
--   Z: Summary
--
-- TEST PROTOCOL
--   • Static / structural checks: single DO block, RAISE EXCEPTION on fail.
--   • Behavioral tests: every block is wrapped in BEGIN ... ROLLBACK.
--     No test data persists after any behavioral block.
--   • ZERO bare COMMITs. Zero persistent state mutations.
--   • All RAISE NOTICE results: 'PASS', 'FAIL', or 'SKIP_*' prefix.
--
-- REQUIRES
--   7c13a1, 7c13a2, 7c13a3, 7c14a1, 7c15a6, 7c15a7 applied.
--   Must be run as a superuser (service_role / postgres) so that
--   test fixture rows can be inserted directly without going through
--   RPCs. RLS is then exercised by using SET LOCAL ROLE + SET LOCAL
--   request.jwt.claims to impersonate each test identity.
--
-- NOTE ON LOCAL ROLE IMPERSONATION
--   Supabase uses PostgREST which sets:
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}';
--   We replicate this pattern in each behavioral block to simulate
--   the specific caller identity being tested.
--
-- DO NOT RUN AGAINST PRODUCTION.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F SQL Test Suite — Site Manager Scope';
  RAISE NOTICE 'Tests: A-01..A-08, B-01..B-07, C-01..C-03,';
  RAISE NOTICE '       D-01..D-06, E-01..E-04';
  RAISE NOTICE 'Total: 24 test cases';
  RAISE NOTICE 'All behavioral blocks: BEGIN/ROLLBACK (no persistent state)';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION A — STRUCTURAL (static, no role impersonation)
--
-- A-01: es_non_sm_select policy exists on enterprise_sites
-- A-02: es_site_manager_select policy exists on enterprise_sites
-- A-03: erc_non_sm_select policy exists on enterprise_request_context
-- A-04: erc_site_manager_select policy exists on enterprise_request_context
-- A-05: create_enterprise_request is SECURITY DEFINER
-- A-06: confirm_completed_mission is SECURITY DEFINER
-- A-07: es_members_select policy no longer exists on enterprise_sites
-- A-08: erc_member_select policy no longer exists on enterprise_request_context
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_policy_exists  boolean;
  v_secdef         boolean;
BEGIN

  -- ── A-01: es_non_sm_select policy exists on enterprise_sites ────────────
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_sites'
      AND policyname = 'es_non_sm_select'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION 'A-01 FAIL: es_non_sm_select policy NOT FOUND on enterprise_sites';
  END IF;
  RAISE NOTICE 'A-01 PASS: es_non_sm_select policy exists on enterprise_sites';

  -- ── A-02: es_site_manager_select policy exists on enterprise_sites ───────
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_sites'
      AND policyname = 'es_site_manager_select'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION 'A-02 FAIL: es_site_manager_select policy NOT FOUND on enterprise_sites';
  END IF;
  RAISE NOTICE 'A-02 PASS: es_site_manager_select policy exists on enterprise_sites';

  -- ── A-03: erc_non_sm_select policy exists on enterprise_request_context ──
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_request_context'
      AND policyname = 'erc_non_sm_select'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION 'A-03 FAIL: erc_non_sm_select policy NOT FOUND on enterprise_request_context';
  END IF;
  RAISE NOTICE 'A-03 PASS: erc_non_sm_select policy exists on enterprise_request_context';

  -- ── A-04: erc_site_manager_select policy exists on enterprise_request_context ─
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_request_context'
      AND policyname = 'erc_site_manager_select'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION 'A-04 FAIL: erc_site_manager_select policy NOT FOUND on enterprise_request_context';
  END IF;
  RAISE NOTICE 'A-04 PASS: erc_site_manager_select policy exists on enterprise_request_context';

  -- ── A-05: create_enterprise_request is SECURITY DEFINER ─────────────────
  SELECT p.prosecdef INTO v_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_enterprise_request'
  LIMIT 1;

  IF NOT FOUND OR NOT v_secdef THEN
    RAISE EXCEPTION 'A-05 FAIL: create_enterprise_request is not SECURITY DEFINER (or not found)';
  END IF;
  RAISE NOTICE 'A-05 PASS: create_enterprise_request is SECURITY DEFINER';

  -- ── A-06: confirm_completed_mission is SECURITY DEFINER ─────────────────
  SELECT p.prosecdef INTO v_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_completed_mission'
  LIMIT 1;

  IF NOT FOUND OR NOT v_secdef THEN
    RAISE EXCEPTION 'A-06 FAIL: confirm_completed_mission is not SECURITY DEFINER (or not found)';
  END IF;
  RAISE NOTICE 'A-06 PASS: confirm_completed_mission is SECURITY DEFINER';

  -- ── A-07: es_members_select policy NO LONGER EXISTS on enterprise_sites ──
  -- This broad policy was replaced in 7c15a7. Presence would indicate
  -- the migration failed to drop the old policy.
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_sites'
      AND policyname = 'es_members_select'
  ) INTO v_policy_exists;

  IF v_policy_exists THEN
    RAISE EXCEPTION 'A-07 FAIL: es_members_select policy STILL EXISTS on enterprise_sites — should have been dropped by 7c15a7';
  END IF;
  RAISE NOTICE 'A-07 PASS: es_members_select policy correctly absent from enterprise_sites (replaced)';

  -- ── A-08: erc_member_select policy NO LONGER EXISTS ─────────────────────
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_request_context'
      AND policyname = 'erc_member_select'
  ) INTO v_policy_exists;

  IF v_policy_exists THEN
    RAISE EXCEPTION 'A-08 FAIL: erc_member_select policy STILL EXISTS on enterprise_request_context — should have been dropped by 7c15a7';
  END IF;
  RAISE NOTICE 'A-08 PASS: erc_member_select policy correctly absent from enterprise_request_context (replaced)';

  RAISE NOTICE '── Section A complete: 8/8 structural checks passed ──';
END $$;


-- ════════════════════════════════════════════════════════════
-- SHARED FIXTURE HELPERS
-- ════════════════════════════════════════════════════════════
--
-- Each behavioral block sets up its own test fixture inside
-- BEGIN ... ROLLBACK. Fixture data is isolated per test.
--
-- Identity simulation pattern:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = pg_catalog.jsonb_build_object('sub', v_user_id::text)::text;
--
-- After testing, identity is reset within the same ROLLBACK block.


-- ════════════════════════════════════════════════════════════
-- SECTION B — enterprise_sites VISIBILITY BY ROLE
--
-- B-01: owner sees all sites
-- B-02: admin sees all sites
-- B-03: operations_manager sees all sites
-- B-04: reporter sees all sites
-- B-05: site_manager sees only assigned site
-- B-06: site_manager does NOT see unassigned site
-- B-07: zero-assignment site_manager sees no sites
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '── Section B: enterprise_sites visibility ──'; END $$;

-- ── B-01: owner sees all sites ────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_site1_id uuid := gen_random_uuid();
  v_site2_id uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  -- Fixture: enterprise + user + member (owner) + 2 sites
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B01 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b01owner@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_user_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Site Alpha', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Site Beta', 'Rabat', 'active');

  -- Simulate authenticated caller = owner
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{}';
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites
  WHERE enterprise_id = v_ea_id;

  IF v_count = 2 THEN
    RAISE NOTICE 'B-01 PASS: owner sees all 2 sites (count=%)', v_count;
  ELSE
    RAISE NOTICE 'B-01 FAIL: owner expected 2 sites, got %', v_count;
  END IF;
END $$;
ROLLBACK;

-- ── B-02: admin sees all sites ────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B02 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b02admin@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_user_id, 'admin', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site A', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site B', 'Fes', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site C', 'Marrakech', 'inactive');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites WHERE enterprise_id = v_ea_id;

  IF v_count = 3 THEN
    RAISE NOTICE 'B-02 PASS: admin sees all 3 sites including inactive (count=%)', v_count;
  ELSE
    RAISE NOTICE 'B-02 FAIL: admin expected 3 sites, got %', v_count;
  END IF;
END $$;
ROLLBACK;

-- ── B-03: operations_manager sees all sites ───────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B03 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b03opsmgr@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_user_id, 'operations_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site X', 'Tangier', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site Y', 'Agadir', 'active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites WHERE enterprise_id = v_ea_id;

  IF v_count = 2 THEN
    RAISE NOTICE 'B-03 PASS: operations_manager sees all 2 sites (count=%)', v_count;
  ELSE
    RAISE NOTICE 'B-03 FAIL: operations_manager expected 2 sites, got %', v_count;
  END IF;
END $$;
ROLLBACK;

-- ── B-04: reporter sees all sites ─────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B04 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b04reporter@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_user_id, 'reporter', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site P', 'Oujda', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site Q', 'Kenitra', 'active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites WHERE enterprise_id = v_ea_id;

  IF v_count = 2 THEN
    RAISE NOTICE 'B-04 PASS: reporter sees all 2 sites (count=%)', v_count;
  ELSE
    RAISE NOTICE 'B-04 FAIL: reporter expected 2 sites, got %', v_count;
  END IF;
END $$;
ROLLBACK;

-- ── B-05: site_manager sees only assigned site ────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id       uuid := gen_random_uuid();
  v_user_id     uuid := gen_random_uuid();
  v_member_id   uuid := gen_random_uuid();
  v_site1_id    uuid := gen_random_uuid();  -- ASSIGNED
  v_site2_id    uuid := gen_random_uuid();  -- not assigned
  v_count       integer;
  v_seen_site1  boolean;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B05 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b05sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_user_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Assigned Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Other Site', 'Rabat', 'active');

  -- Assign site1 to the site_manager
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site1_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites WHERE enterprise_id = v_ea_id;

  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_sites
    WHERE id = v_site1_id AND enterprise_id = v_ea_id
  ) INTO v_seen_site1;

  IF v_count = 1 AND v_seen_site1 THEN
    RAISE NOTICE 'B-05 PASS: site_manager sees exactly 1 assigned site (count=%, sees assigned=true)', v_count;
  ELSE
    RAISE NOTICE 'B-05 FAIL: site_manager expected count=1/assigned=true, got count=%/assigned=%',
      v_count, v_seen_site1;
  END IF;
END $$;
ROLLBACK;

-- ── B-06: site_manager does NOT see unassigned site ───────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id       uuid := gen_random_uuid();
  v_user_id     uuid := gen_random_uuid();
  v_member_id   uuid := gen_random_uuid();
  v_site1_id    uuid := gen_random_uuid();  -- assigned
  v_site2_id    uuid := gen_random_uuid();  -- NOT assigned
  v_sees_unassigned boolean;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B06 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b06sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_user_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Assigned Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Unassigned Site', 'Fes', 'active');

  -- Only site1 is assigned
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site1_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_sites
    WHERE id = v_site2_id AND enterprise_id = v_ea_id
  ) INTO v_sees_unassigned;

  IF NOT v_sees_unassigned THEN
    RAISE NOTICE 'B-06 PASS: site_manager correctly cannot see unassigned site';
  ELSE
    RAISE NOTICE 'B-06 FAIL: site_manager can see unassigned site — RLS not working';
  END IF;
END $$;
ROLLBACK;

-- ── B-07: zero-assignment site_manager sees no sites ──────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'B07 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'b07sm0@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_user_id, 'site_manager', 'active');
  -- Two sites exist but NONE assigned to this site_manager
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site 1', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (gen_random_uuid(), v_ea_id, 'Site 2', 'Rabat', 'active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_sites WHERE enterprise_id = v_ea_id;

  IF v_count = 0 THEN
    RAISE NOTICE 'B-07 PASS: zero-assignment site_manager sees 0 sites (count=%)', v_count;
  ELSE
    RAISE NOTICE 'B-07 FAIL: zero-assignment site_manager expected 0 sites, got %', v_count;
  END IF;
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION C — enterprise_request_context VISIBILITY BY ROLE
--
-- C-01: owner sees ERC for all sites
-- C-02: site_manager sees ERC only for assigned sites
-- C-03: site_manager does NOT see ERC for unassigned site
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '── Section C: enterprise_request_context visibility ──'; END $$;

-- ── C-01: owner sees ERC for all sites ───────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_user_id  uuid := gen_random_uuid();
  v_site1_id uuid := gen_random_uuid();
  v_site2_id uuid := gen_random_uuid();
  v_sr1_id   uuid := gen_random_uuid();
  v_sr2_id   uuid := gen_random_uuid();
  v_count    integer;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'C01 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_user_id, 'c01owner@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_user_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Site 1', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Site 2', 'Rabat', 'active');

  -- Insert service requests (minimal required columns)
  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr1_id, 'plomberie', 'Casablanca', 'Test SR 1', 'new');
  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr2_id, 'electricite', 'Rabat', 'Test SR 2', 'new');

  -- Insert ERC rows for each site
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site1_id, v_sr1_id, v_user_id);
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site2_id, v_sr2_id, v_user_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_user_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_request_context
  WHERE enterprise_id = v_ea_id;

  IF v_count = 2 THEN
    RAISE NOTICE 'C-01 PASS: owner sees all 2 ERC rows (count=%)', v_count;
  ELSE
    RAISE NOTICE 'C-01 FAIL: owner expected 2 ERC rows, got %', v_count;
  END IF;
END $$;
ROLLBACK;

-- ── C-02: site_manager sees ERC only for assigned sites ───────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_owner_id  uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site1_id  uuid := gen_random_uuid();  -- ASSIGNED
  v_site2_id  uuid := gen_random_uuid();  -- not assigned
  v_sr1_id    uuid := gen_random_uuid();
  v_sr2_id    uuid := gen_random_uuid();
  v_count     integer;
  v_sees_sr1  boolean;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'C02 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'c02owner@test.local');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'c02sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Assigned Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Other Site', 'Rabat', 'active');

  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr1_id, 'plomberie', 'Casablanca', 'Assigned site SR', 'new');
  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr2_id, 'electricite', 'Rabat', 'Other site SR', 'new');

  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site1_id, v_sr1_id, v_owner_id);
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site2_id, v_sr2_id, v_owner_id);

  -- Assign site1 to site_manager
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site1_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_request_context WHERE enterprise_id = v_ea_id;

  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_request_context
    WHERE enterprise_id = v_ea_id AND service_request_id = v_sr1_id
  ) INTO v_sees_sr1;

  IF v_count = 1 AND v_sees_sr1 THEN
    RAISE NOTICE 'C-02 PASS: site_manager sees exactly 1 ERC row (assigned site only; count=%, sees_assigned=true)', v_count;
  ELSE
    RAISE NOTICE 'C-02 FAIL: site_manager expected count=1/assigned=true, got count=%/assigned=%',
      v_count, v_sees_sr1;
  END IF;
END $$;
ROLLBACK;

-- ── C-03: site_manager does NOT see ERC for unassigned site ──────────────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_owner_id  uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site1_id  uuid := gen_random_uuid();  -- assigned
  v_site2_id  uuid := gen_random_uuid();  -- NOT assigned
  v_sr2_id    uuid := gen_random_uuid();
  v_sees_sr2  boolean;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'C03 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'c03owner@test.local');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'c03sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site1_id, v_ea_id, 'Assigned Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site2_id, v_ea_id, 'Other Site', 'Marrakech', 'active');

  -- Only an ERC row for the unassigned site
  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr2_id, 'menuiserie', 'Marrakech', 'Other site SR', 'new');
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site2_id, v_sr2_id, v_owner_id);

  -- site_manager assigned to site1 only
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site1_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  SELECT EXISTS (
    SELECT 1 FROM public.enterprise_request_context
    WHERE enterprise_id = v_ea_id AND service_request_id = v_sr2_id
  ) INTO v_sees_sr2;

  IF NOT v_sees_sr2 THEN
    RAISE NOTICE 'C-03 PASS: site_manager correctly cannot see ERC for unassigned site';
  ELSE
    RAISE NOTICE 'C-03 FAIL: site_manager can see ERC for unassigned site — RLS not working';
  END IF;
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION D — create_enterprise_request: site_manager assignment guard
--
-- D-01: site_manager with assigned active site succeeds
-- D-02: site_manager with unassigned site returns site_not_assigned
-- D-03: owner unaffected (no site assignment check)
-- D-04: admin unaffected
-- D-05: operations_manager unaffected
-- D-06: inactive assigned site returns site_inactive (existing guard preserved)
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '── Section D: create_enterprise_request site_manager guard ──'; END $$;

-- ── D-01: site_manager with assigned active site succeeds ─────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_result    jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D01 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'd01sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D01 Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site_id);

  -- Call RPC as site_manager
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'plomberie', 'Fuite sous évier', NULL
  );

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'D-01 PASS: site_manager with assigned site → ok=true (sr_id=%)',
      v_result->>'service_request_id';
  ELSE
    RAISE NOTICE 'D-01 FAIL: site_manager with assigned site expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── D-02: site_manager with unassigned site returns site_not_assigned ──────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();  -- NOT assigned
  v_result    jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D02 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'd02sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D02 Site', 'Rabat', 'active');
  -- NO enterprise_member_sites row — site is NOT assigned

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'peinture', 'Mur fissuré', NULL
  );

  IF (v_result->>'ok')::boolean = false
     AND v_result->>'reason' = 'site_not_assigned' THEN
    RAISE NOTICE 'D-02 PASS: site_manager with unassigned site → ok=false, reason=site_not_assigned';
  ELSE
    RAISE NOTICE 'D-02 FAIL: expected ok=false/reason=site_not_assigned, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── D-03: owner unaffected (no site assignment check) ─────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_result   jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D03 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'd03owner@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D03 Site', 'Casablanca', 'active');
  -- NO enterprise_member_sites row — owner does NOT need assignment

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'electricite', 'Prise défectueuse', NULL
  );

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'D-03 PASS: owner with no site assignment → ok=true (unaffected by Guard 6a)';
  ELSE
    RAISE NOTICE 'D-03 FAIL: owner expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── D-04: admin unaffected ────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_result   jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D04 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_admin_id, 'd04admin@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_admin_id, 'admin', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D04 Site', 'Fes', 'active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_admin_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'menuiserie', 'Porte cassée', NULL
  );

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'D-04 PASS: admin without site assignment → ok=true (Guard 6a skipped for admin)';
  ELSE
    RAISE NOTICE 'D-04 FAIL: admin expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── D-05: operations_manager unaffected ──────────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id   uuid := gen_random_uuid();
  v_ops_id  uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_result  jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D05 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_ops_id, 'd05ops@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_ops_id, 'operations_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D05 Site', 'Agadir', 'active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_ops_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'plomberie', 'Fuite robinet', NULL
  );

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'D-05 PASS: operations_manager → ok=true (Guard 6a skipped)';
  ELSE
    RAISE NOTICE 'D-05 FAIL: operations_manager expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── D-06: inactive assigned site returns site_inactive ────────────────────
-- This verifies Guard 7 (site_inactive) is preserved even when Guard 6a passes.
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();  -- inactive but assigned
  v_result    jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'D06 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'd06sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  -- Site is inactive but assigned to the site_manager
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'D06 Inactive Site', 'Kenitra', 'inactive');
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  v_result := public.create_enterprise_request(
    v_ea_id, v_site_id, 'peinture', 'Mur abimé', NULL
  );

  -- Guard 6a passes (site IS assigned) but Guard 7 must fire (site is inactive)
  IF (v_result->>'ok')::boolean = false
     AND v_result->>'reason' = 'site_inactive' THEN
    RAISE NOTICE 'D-06 PASS: inactive assigned site → ok=false, reason=site_inactive (Guard 7 preserved)';
  ELSE
    RAISE NOTICE 'D-06 FAIL: expected ok=false/reason=site_inactive, got %', v_result;
  END IF;
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION E — confirm_completed_mission: site_manager assignment
--
-- E-01: site_manager with assigned site can confirm
-- E-02: site_manager with unassigned site gets request_not_found_or_not_owned
-- E-03: owner unaffected by assignment check
-- E-04: B2C path (client_profile_id = auth.uid()) unaffected
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '── Section E: confirm_completed_mission site_manager check ──'; END $$;

-- ── E-01: site_manager with assigned site can confirm ─────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_owner_id  uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_sr_id     uuid := gen_random_uuid();
  v_erc_id    uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result    jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'E01 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'e01owner@test.local');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'e01sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'E01 Site', 'Casablanca', 'active');
  INSERT INTO public.enterprise_member_sites (id, enterprise_id, member_id, site_id)
    VALUES (gen_random_uuid(), v_ea_id, v_member_id, v_site_id);

  -- Service request in 'completed' state
  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr_id, 'plomberie', 'Casablanca', 'Test SR E01', 'completed');
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (v_erc_id, v_ea_id, v_site_id, v_sr_id, v_owner_id);

  -- Mission in 'done' state
  INSERT INTO public.missions (id, request_id, status)
    VALUES (v_mission_id, v_sr_id::text, 'done');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  v_result := public.confirm_completed_mission(v_sr_id);

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'E-01 PASS: site_manager with assigned site can confirm → ok=true, mission_id=%',
      v_result->>'mission_id';
  ELSE
    RAISE NOTICE 'E-01 FAIL: site_manager with assigned site expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── E-02: site_manager with unassigned site gets not_owned ────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id     uuid := gen_random_uuid();
  v_sm_id     uuid := gen_random_uuid();
  v_owner_id  uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();  -- NOT assigned
  v_sr_id     uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result    jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'E02 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'e02owner@test.local');
  INSERT INTO public.users (id, email) VALUES (v_sm_id, 'e02sm@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (v_member_id, v_ea_id, v_sm_id, 'site_manager', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'E02 Site', 'Rabat', 'active');
  -- NO enterprise_member_sites — site_manager has NO assignment

  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr_id, 'electricite', 'Rabat', 'Test SR E02', 'completed');
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site_id, v_sr_id, v_owner_id);
  INSERT INTO public.missions (id, request_id, status)
    VALUES (v_mission_id, v_sr_id::text, 'done');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_sm_id::text)::text, true);

  v_result := public.confirm_completed_mission(v_sr_id);

  IF (v_result->>'ok')::boolean = false
     AND v_result->>'reason' = 'request_not_found_or_not_owned' THEN
    RAISE NOTICE 'E-02 PASS: unassigned site_manager → ok=false, reason=request_not_found_or_not_owned';
  ELSE
    RAISE NOTICE 'E-02 FAIL: expected ok=false/request_not_found_or_not_owned, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── E-03: owner unaffected by assignment check ────────────────────────────
BEGIN;
DO $$
DECLARE
  v_ea_id    uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_sr_id    uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result   jsonb;
BEGIN
  INSERT INTO public.enterprise_accounts (id, name, status)
    VALUES (v_ea_id, 'E03 Enterprise', 'active');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, 'e03owner@test.local');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_ea_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_ea_id, 'E03 Site', 'Fes', 'active');
  -- Owner has NO enterprise_member_sites row — should NOT matter

  INSERT INTO public.service_requests (id, service_category, city, description, status)
    VALUES (v_sr_id, 'menuiserie', 'Fes', 'Test SR E03', 'completed');
  INSERT INTO public.enterprise_request_context
    (id, enterprise_id, site_id, service_request_id, created_by)
    VALUES (gen_random_uuid(), v_ea_id, v_site_id, v_sr_id, v_owner_id);
  INSERT INTO public.missions (id, request_id, status)
    VALUES (v_mission_id, v_sr_id::text, 'done');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner_id::text)::text, true);

  v_result := public.confirm_completed_mission(v_sr_id);

  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'E-03 PASS: owner without site assignment can confirm → ok=true (unaffected by BP08F check)';
  ELSE
    RAISE NOTICE 'E-03 FAIL: owner expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;

-- ── E-04: B2C path (client_profile_id = auth.uid()) unaffected ────────────
-- This test uses a B2C service request (client_profile_id = profile_id).
-- The caller is NOT an enterprise member — purely B2C Path A.
BEGIN;
DO $$
DECLARE
  v_profile_id uuid := gen_random_uuid();
  v_sr_id      uuid := gen_random_uuid();
  v_mission_id uuid := gen_random_uuid();
  v_result     jsonb;
BEGIN
  -- Insert a minimal profile row (public.profiles.id = auth.uid() in B2C)
  -- Note: we insert into public.profiles to satisfy the FK in service_requests
  -- if it exists; if profiles is separate, this test inserts a B2C SR directly.
  -- For a pure SQL test, we set client_profile_id = the caller UUID.
  INSERT INTO public.service_requests (id, service_category, city, description, status, client_profile_id)
    VALUES (v_sr_id, 'plomberie', 'Casablanca', 'B2C test SR', 'completed', v_profile_id);
  INSERT INTO public.missions (id, request_id, status)
    VALUES (v_mission_id, v_sr_id::text, 'done');

  -- Simulate caller = v_profile_id (B2C user, not an enterprise member)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_profile_id::text)::text, true);

  v_result := public.confirm_completed_mission(v_sr_id);

  -- B2C path: client_profile_id = auth.uid() → Path A succeeds
  -- No enterprise involvement, no assignment check
  IF (v_result->>'ok')::boolean = true THEN
    RAISE NOTICE 'E-04 PASS: B2C path unaffected by BP08F — ok=true for direct client ownership';
  ELSE
    RAISE NOTICE 'E-04 FAIL: B2C path expected ok=true, got %', v_result;
  END IF;
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION Z — SUMMARY
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F Test Suite — Complete';
  RAISE NOTICE '';
  RAISE NOTICE 'Section A (structural):  A-01..A-08 (8 tests)';
  RAISE NOTICE '  Policy existence, SECURITY DEFINER, replaced-policy absence';
  RAISE NOTICE '';
  RAISE NOTICE 'Section B (site visibility): B-01..B-07 (7 tests)';
  RAISE NOTICE '  owner/admin/ops_mgr/reporter see all; SM sees assigned only';
  RAISE NOTICE '  zero-assignment SM sees nothing';
  RAISE NOTICE '';
  RAISE NOTICE 'Section C (ERC visibility): C-01..C-03 (3 tests)';
  RAISE NOTICE '  owner sees all ERC; SM sees assigned-site ERC only';
  RAISE NOTICE '';
  RAISE NOTICE 'Section D (create_enterprise_request): D-01..D-06 (6 tests)';
  RAISE NOTICE '  SM+assigned→ok; SM+unassigned→site_not_assigned';
  RAISE NOTICE '  owner/admin/ops_mgr unaffected; inactive assigned→site_inactive';
  RAISE NOTICE '';
  RAISE NOTICE 'Section E (confirm_completed_mission): E-01..E-04 (4 tests)';
  RAISE NOTICE '  SM+assigned→ok; SM+unassigned→not_owned';
  RAISE NOTICE '  owner unaffected; B2C path unaffected';
  RAISE NOTICE '';
  RAISE NOTICE 'Total: 28 test cases (>= 20 required minimum)';
  RAISE NOTICE 'All behavioral blocks: BEGIN/ROLLBACK — zero persistent state';
  RAISE NOTICE 'Zero bare COMMITs in behavioral tests';
  RAISE NOTICE '';
  RAISE NOTICE 'Review output for PASS/FAIL markers above.';
  RAISE NOTICE 'Any FAIL indicates a regression or incorrect migration application.';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
END $$;
