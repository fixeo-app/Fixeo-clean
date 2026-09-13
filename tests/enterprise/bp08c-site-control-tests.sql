-- ════════════════════════════════════════════════════════════
-- FIXEO — BP08C Site Control Plane SQL Tests
-- File: tests/enterprise/bp08c-site-control-tests.sql
-- Sprint: BP08C
-- HEAD: 9a628c4dd53e9da28f2459056302c2b022480d05
--
-- EVERY behavioral test block: BEGIN ... ROLLBACK (transaction-isolated)
-- Zero COMMIT in behavioral tests.
-- All test data inserted inside BEGIN/ROLLBACK blocks.
-- Static / structural checks run in single DO blocks.
-- ════════════════════════════════════════════════════════════
-- REQUIRES: 7c13a1, 7c13a2, 7c13a3, 7c15a2 applied to the target DB.
-- DO NOT RUN AGAINST PRODUCTION.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08C SQL Test Suite — site control plane';
  RAISE NOTICE 'Tests: A-01..A-05, B-01..B-05, C-01..C-05,';
  RAISE NOTICE '       D-01..D-03, E-01..E-04, F-01..F-03, G-01';
  RAISE NOTICE 'All behavioral blocks: BEGIN/ROLLBACK (no persistent state)';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION A — STRUCTURAL (static, single DO block)
--
-- A-01: update_enterprise_site is SECURITY DEFINER
-- A-02: set_enterprise_site_status is SECURITY DEFINER
-- A-03: search_path = '' on both RPCs
-- A-04: anon cannot EXECUTE either RPC
-- A-05: authenticated has no UPDATE privilege on enterprise_sites table-level
-- ════════════════════════════════════════════════════════════

BEGIN;
DO $$
DECLARE
  v_update_secdef   boolean;
  v_status_secdef   boolean;
  v_update_config   text;
  v_status_config   text;
  v_anon_update     boolean;
  v_anon_status     boolean;
  v_auth_update     boolean;
BEGIN

  -- ── A-01: update_enterprise_site is SECURITY DEFINER ──────
  SELECT p.prosecdef
  INTO v_update_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_enterprise_site'
  LIMIT 1;

  IF NOT FOUND OR NOT v_update_secdef THEN
    RAISE EXCEPTION 'A-01 FAIL: update_enterprise_site is not SECURITY DEFINER (or not found)';
  END IF;
  RAISE NOTICE 'A-01 PASS: update_enterprise_site is SECURITY DEFINER';

  -- ── A-02: set_enterprise_site_status is SECURITY DEFINER ──
  SELECT p.prosecdef
  INTO v_status_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_enterprise_site_status'
  LIMIT 1;

  IF NOT FOUND OR NOT v_status_secdef THEN
    RAISE EXCEPTION 'A-02 FAIL: set_enterprise_site_status is not SECURITY DEFINER (or not found)';
  END IF;
  RAISE NOTICE 'A-02 PASS: set_enterprise_site_status is SECURITY DEFINER';

  -- ── A-03: search_path = '' on both RPCs ───────────────────
  SELECT pg_catalog.array_to_string(p.proconfig, '|')
  INTO v_update_config
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_enterprise_site'
  LIMIT 1;

  SELECT pg_catalog.array_to_string(p.proconfig, '|')
  INTO v_status_config
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_enterprise_site_status'
  LIMIT 1;

  -- Presence of 'search_path=' with empty value confirms SET search_path = ''
  IF v_update_config IS NULL OR v_update_config NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'A-03 FAIL: update_enterprise_site has no search_path config: %', v_update_config;
  END IF;
  IF v_update_config LIKE '%search_path=public%' THEN
    RAISE EXCEPTION 'A-03 FAIL: update_enterprise_site has search_path=public (not empty): %', v_update_config;
  END IF;
  IF v_status_config IS NULL OR v_status_config NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'A-03 FAIL: set_enterprise_site_status has no search_path config: %', v_status_config;
  END IF;
  IF v_status_config LIKE '%search_path=public%' THEN
    RAISE EXCEPTION 'A-03 FAIL: set_enterprise_site_status has search_path=public (not empty): %', v_status_config;
  END IF;
  RAISE NOTICE 'A-03 PASS: both RPCs have search_path = '''' (empty)';

  -- ── A-04: anon cannot EXECUTE either RPC ──────────────────
  SELECT has_function_privilege(
    'anon',
    'public.update_enterprise_site(uuid, uuid, text, text, text, text)',
    'EXECUTE'
  ) INTO v_anon_update;

  SELECT has_function_privilege(
    'anon',
    'public.set_enterprise_site_status(uuid, uuid, text)',
    'EXECUTE'
  ) INTO v_anon_status;

  IF v_anon_update THEN
    RAISE EXCEPTION 'A-04 FAIL: anon has EXECUTE on update_enterprise_site';
  END IF;
  IF v_anon_status THEN
    RAISE EXCEPTION 'A-04 FAIL: anon has EXECUTE on set_enterprise_site_status';
  END IF;
  RAISE NOTICE 'A-04 PASS: anon denied EXECUTE on both site RPCs';

  -- ── A-05: authenticated has no UPDATE privilege on enterprise_sites ──
  SELECT has_table_privilege('authenticated', 'public.enterprise_sites', 'UPDATE')
  INTO v_auth_update;

  IF v_auth_update THEN
    RAISE EXCEPTION 'A-05 FAIL: authenticated has table-level UPDATE on enterprise_sites';
  END IF;
  RAISE NOTICE 'A-05 PASS: authenticated has no table-level UPDATE on enterprise_sites';

END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION B — AUTH / CALLER GUARDS
--
-- B-01: unauthenticated blocked (update)
-- B-02: unauthenticated blocked (status)
-- B-03: non-member blocked
-- B-04: suspended caller blocked
-- B-05: reporter blocked (non-manager role)
-- ════════════════════════════════════════════════════════════

-- B-01: unauthenticated caller → unauthenticated (update)
BEGIN;
DO $$
DECLARE
  v_eid uuid := gen_random_uuid();
  v_sid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  -- Ensure no JWT context is set
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT public.update_enterprise_site(v_eid, v_sid, 'Site Name', 'City') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'unauthenticated' THEN
    RAISE EXCEPTION 'B-01 FAIL: expected unauthenticated, got %', v_res;
  END IF;
  RAISE NOTICE 'B-01 PASS: update_enterprise_site returns unauthenticated when uid=null';
END $$;
ROLLBACK;


-- B-02: unauthenticated caller → unauthenticated (status)
BEGIN;
DO $$
DECLARE
  v_eid uuid := gen_random_uuid();
  v_sid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'inactive') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'unauthenticated' THEN
    RAISE EXCEPTION 'B-02 FAIL: expected unauthenticated, got %', v_res;
  END IF;
  RAISE NOTICE 'B-02 PASS: set_enterprise_site_status returns unauthenticated when uid=null';
END $$;
ROLLBACK;


-- B-03: caller not a member of the enterprise → not_a_member
BEGIN;
DO $$
DECLARE
  v_caller_uid uuid := gen_random_uuid();
  v_other_uid  uuid := gen_random_uuid();
  v_eid        uuid;
  v_sid        uuid;
  v_res        jsonb;
BEGIN
  -- Create caller user (not in enterprise)
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_caller_uid, 'bp08c-b03-caller@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_caller_uid, 'bp08c-b03-caller@fixeo.test', 'B03 Caller');

  -- Create owner user
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_other_uid, 'bp08c-b03-owner@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_other_uid, 'bp08c-b03-owner@fixeo.test', 'B03 Owner');

  -- Create enterprise and site
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'B03 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_other_uid, 'owner', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'B03 Site', 'Casablanca')
    RETURNING id INTO v_sid;

  -- Caller is NOT a member
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_caller_uid), true);

  SELECT public.update_enterprise_site(v_eid, v_sid, 'New Name', 'New City') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'not_a_member' THEN
    RAISE EXCEPTION 'B-03 FAIL: expected not_a_member, got %', v_res;
  END IF;
  RAISE NOTICE 'B-03 PASS: non-member caller blocked on update_enterprise_site';
END $$;
ROLLBACK;


-- B-04: suspended caller → caller_not_active
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-b04@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-b04@fixeo.test', 'B04 Suspended Admin');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'B04 Corp')
    RETURNING id INTO v_eid;

  -- Caller is admin but SUSPENDED
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'admin', 'suspended');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'B04 Site', 'Rabat')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'inactive') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'caller_not_active' THEN
    RAISE EXCEPTION 'B-04 FAIL: expected caller_not_active, got %', v_res;
  END IF;
  RAISE NOTICE 'B-04 PASS: suspended caller blocked on set_enterprise_site_status';
END $$;
ROLLBACK;


-- B-05: reporter role → forbidden
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-b05@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-b05@fixeo.test', 'B05 Reporter');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'B05 Corp')
    RETURNING id INTO v_eid;

  -- Caller is active but role=reporter (not owner/admin)
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'reporter', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'B05 Site', 'Marrakech')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.update_enterprise_site(v_eid, v_sid, 'New Name', 'New City') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'forbidden' THEN
    RAISE EXCEPTION 'B-05 FAIL: expected forbidden for reporter, got %', v_res;
  END IF;
  RAISE NOTICE 'B-05 PASS: reporter role blocked on update_enterprise_site (forbidden)';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION C — MUTATION (authorized paths)
--
-- C-01: owner can update site name/city
-- C-02: admin can update site name/city
-- C-03: owner can deactivate site
-- C-04: owner can reactivate site
-- C-05: admin can deactivate site
-- ════════════════════════════════════════════════════════════

-- C-01: owner updates site name and city → ok:true, site_id returned
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
  v_name_after text;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-c01@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-c01@fixeo.test', 'C01 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'C01 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Old Site Name', 'Old City')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.update_enterprise_site(v_eid, v_sid, 'New Site Name', 'New City')
  INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-01 FAIL: expected ok=true, got %', v_res;
  END IF;
  IF (v_res->>'site_id')::uuid != v_sid THEN
    RAISE EXCEPTION 'C-01 FAIL: returned site_id mismatch: %', v_res;
  END IF;
  IF (v_res->>'enterprise_id')::uuid != v_eid THEN
    RAISE EXCEPTION 'C-01 FAIL: returned enterprise_id mismatch: %', v_res;
  END IF;

  -- Verify DB row updated
  SELECT name INTO v_name_after
  FROM public.enterprise_sites WHERE id = v_sid;
  IF v_name_after != 'New Site Name' THEN
    RAISE EXCEPTION 'C-01 FAIL: DB name not updated, still: %', v_name_after;
  END IF;

  RAISE NOTICE 'C-01 PASS: owner can update site name/city';
END $$;
ROLLBACK;


-- C-02: admin updates site name/city → ok:true
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-c02@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-c02@fixeo.test', 'C02 Admin');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'C02 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'admin', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'Admin Test Site', 'Fes')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.update_enterprise_site(v_eid, v_sid, 'Admin Updated Site', 'Meknes')
  INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-02 FAIL: admin could not update site, got %', v_res;
  END IF;
  RAISE NOTICE 'C-02 PASS: admin can update site name/city';
END $$;
ROLLBACK;


-- C-03: owner deactivates site → ok:true, new_status=inactive
BEGIN;
DO $$
DECLARE
  v_uid        uuid := gen_random_uuid();
  v_eid        uuid;
  v_sid        uuid;
  v_res        jsonb;
  v_status_db  text;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-c03@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-c03@fixeo.test', 'C03 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'C03 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'C03 Site', 'Agadir', 'active')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'inactive') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-03 FAIL: expected ok=true, got %', v_res;
  END IF;
  IF v_res->>'new_status' != 'inactive' THEN
    RAISE EXCEPTION 'C-03 FAIL: expected new_status=inactive, got %', v_res;
  END IF;

  -- Verify DB row
  SELECT status INTO v_status_db FROM public.enterprise_sites WHERE id = v_sid;
  IF v_status_db != 'inactive' THEN
    RAISE EXCEPTION 'C-03 FAIL: DB status not inactive, got %', v_status_db;
  END IF;

  RAISE NOTICE 'C-03 PASS: owner can deactivate site';
END $$;
ROLLBACK;


-- C-04: owner reactivates site → ok:true, new_status=active
BEGIN;
DO $$
DECLARE
  v_uid        uuid := gen_random_uuid();
  v_eid        uuid;
  v_sid        uuid;
  v_res        jsonb;
  v_status_db  text;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-c04@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-c04@fixeo.test', 'C04 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'C04 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  -- Site starts INACTIVE
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'C04 Site', 'Tangier', 'inactive')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'active') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-04 FAIL: expected ok=true reactivating, got %', v_res;
  END IF;
  IF v_res->>'new_status' != 'active' THEN
    RAISE EXCEPTION 'C-04 FAIL: expected new_status=active, got %', v_res;
  END IF;

  SELECT status INTO v_status_db FROM public.enterprise_sites WHERE id = v_sid;
  IF v_status_db != 'active' THEN
    RAISE EXCEPTION 'C-04 FAIL: DB status not active, got %', v_status_db;
  END IF;

  RAISE NOTICE 'C-04 PASS: owner can reactivate site';
END $$;
ROLLBACK;


-- C-05: admin deactivates site → ok:true
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-c05@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-c05@fixeo.test', 'C05 Admin');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'C05 Corp')
    RETURNING id INTO v_eid;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'admin', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'C05 Site', 'Oujda', 'active')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'inactive') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'C-05 FAIL: admin could not deactivate site, got %', v_res;
  END IF;
  RAISE NOTICE 'C-05 PASS: admin can deactivate site';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION D — CROSS-TENANT / WRONG ENTERPRISE
--
-- D-01: wrong tenant blocked on update
-- D-02: wrong tenant blocked on status
-- D-03: site belonging to other enterprise blocked
-- ════════════════════════════════════════════════════════════

-- D-01: caller is owner of enterprise A, tries to update a site in enterprise A
-- but passes enterprise_id of B → not_a_member (enterprise lock on wrong enterprise)
BEGIN;
DO $$
DECLARE
  v_uid  uuid := gen_random_uuid();
  v_eid_a uuid;
  v_eid_b uuid;
  v_sid  uuid;
  v_res  jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-d01@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-d01@fixeo.test', 'D01 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D01 CorpA') RETURNING id INTO v_eid_a;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D01 CorpB') RETURNING id INTO v_eid_b;

  -- Caller owns enterprise A
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid_a, v_uid, 'owner', 'active');

  -- Site belongs to enterprise A
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid_a, 'D01 Site', 'Kenitra')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass enterprise_id of B with a site from A → not_a_member
  SELECT public.update_enterprise_site(v_eid_b, v_sid, 'Hacked Name', 'Hacked City')
  INTO v_res;

  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'D-01 FAIL: cross-tenant update succeeded: %', v_res;
  END IF;
  IF v_res->>'reason' NOT IN ('not_a_member', 'site_not_found', 'site_enterprise_mismatch') THEN
    RAISE EXCEPTION 'D-01 FAIL: unexpected reason: %', v_res;
  END IF;
  RAISE NOTICE 'D-01 PASS: wrong tenant blocked on update (reason: %)', v_res->>'reason';
END $$;
ROLLBACK;


-- D-02: wrong tenant blocked on status change
BEGIN;
DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_eid_a uuid;
  v_eid_b uuid;
  v_sid   uuid;
  v_res   jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-d02@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-d02@fixeo.test', 'D02 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D02 CorpA') RETURNING id INTO v_eid_a;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D02 CorpB') RETURNING id INTO v_eid_b;

  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid_a, v_uid, 'owner', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid_a, 'D02 Site', 'Safi')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass enterprise B id with site from A
  SELECT public.set_enterprise_site_status(v_eid_b, v_sid, 'inactive') INTO v_res;

  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'D-02 FAIL: cross-tenant status change succeeded: %', v_res;
  END IF;
  IF v_res->>'reason' NOT IN ('not_a_member', 'site_not_found', 'site_enterprise_mismatch') THEN
    RAISE EXCEPTION 'D-02 FAIL: unexpected reason: %', v_res;
  END IF;
  RAISE NOTICE 'D-02 PASS: wrong tenant blocked on status change (reason: %)', v_res->>'reason';
END $$;
ROLLBACK;


-- D-03: caller owns enterprise A, site belongs to enterprise B → site_enterprise_mismatch
BEGIN;
DO $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_uid_b uuid := gen_random_uuid();
  v_eid_a uuid;
  v_eid_b uuid;
  v_sid_b uuid;
  v_res   jsonb;
BEGIN
  -- Create two distinct users
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-d03-a@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-d03-a@fixeo.test', 'D03 Owner A');

  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid_b, 'bp08c-d03-b@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid_b, 'bp08c-d03-b@fixeo.test', 'D03 Owner B');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D03 CorpA') RETURNING id INTO v_eid_a;
  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'D03 CorpB') RETURNING id INTO v_eid_b;

  -- Caller owns A; user_b owns B
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid_a, v_uid, 'owner', 'active');
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid_b, v_uid_b, 'owner', 'active');

  -- Site belongs to B
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid_b, 'D03 Site B', 'Beni Mellal')
    RETURNING id INTO v_sid_b;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Caller passes their own enterprise_id=A but site_id belongs to B
  SELECT public.update_enterprise_site(v_eid_a, v_sid_b, 'Stolen', 'Stolen') INTO v_res;

  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'D-03 FAIL: cross-enterprise site update succeeded: %', v_res;
  END IF;
  -- Either site_not_found (RLS) or site_enterprise_mismatch (RPC guard)
  IF v_res->>'reason' NOT IN ('site_not_found', 'site_enterprise_mismatch') THEN
    RAISE EXCEPTION 'D-03 FAIL: unexpected reason: %', v_res;
  END IF;
  RAISE NOTICE 'D-03 PASS: site from other enterprise blocked (reason: %)', v_res->>'reason';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION E — VALIDATION GUARDS
--
-- E-01: blank name rejected
-- E-02: blank city rejected
-- E-03: invalid status rejected
-- E-04: no_change returns ok=true
-- ════════════════════════════════════════════════════════════

-- E-01: blank name → name_required
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-e01@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-e01@fixeo.test', 'E01 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'E01 Corp') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'E01 Site', 'Nador') RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass blank name (whitespace only)
  SELECT public.update_enterprise_site(v_eid, v_sid, '   ', 'Nador') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'name_required' THEN
    RAISE EXCEPTION 'E-01 FAIL: expected name_required, got %', v_res;
  END IF;
  RAISE NOTICE 'E-01 PASS: blank name rejected with name_required';
END $$;
ROLLBACK;


-- E-02: blank city → city_required
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-e02@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-e02@fixeo.test', 'E02 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'E02 Corp') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'E02 Site', 'Tetouan') RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass blank city
  SELECT public.update_enterprise_site(v_eid, v_sid, 'E02 Site', '  ') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'city_required' THEN
    RAISE EXCEPTION 'E-02 FAIL: expected city_required, got %', v_res;
  END IF;
  RAISE NOTICE 'E-02 PASS: blank city rejected with city_required';
END $$;
ROLLBACK;


-- E-03: invalid status → invalid_status
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-e03@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-e03@fixeo.test', 'E03 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'E03 Corp') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city)
    VALUES(gen_random_uuid(), v_eid, 'E03 Site', 'Larache') RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass invalid status value
  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'suspended') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'invalid_status' THEN
    RAISE EXCEPTION 'E-03 FAIL: expected invalid_status, got %', v_res;
  END IF;
  RAISE NOTICE 'E-03 PASS: invalid status rejected with invalid_status';
END $$;
ROLLBACK;


-- E-04: no_change (all fields identical) → ok=true, reason=no_change
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-e04@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-e04@fixeo.test', 'E04 Owner');

  INSERT INTO public.enterprise_accounts(id, name)
    VALUES(gen_random_uuid(), 'E04 Corp') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, site_code, address_line)
    VALUES(gen_random_uuid(), v_eid, 'Exact Name', 'Exact City', 'SC-001', '1 Rue Test')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Pass EXACT same values → no_change
  SELECT public.update_enterprise_site(
    v_eid, v_sid, 'Exact Name', 'Exact City', 'SC-001', '1 Rue Test'
  ) INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'E-04 FAIL: expected ok=true for no_change, got %', v_res;
  END IF;
  IF v_res->>'reason' != 'no_change' THEN
    RAISE EXCEPTION 'E-04 FAIL: expected reason=no_change, got %', v_res;
  END IF;
  RAISE NOTICE 'E-04 PASS: no_change returns ok=true with reason=no_change';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION F — INACTIVE SITE REQUEST PREVENTION
--
-- F-01: inactive site cannot be used for create_enterprise_request → site_inactive
-- F-02: active site can still create enterprise request (guard passes)
-- F-03: deactivating a site does NOT delete enterprise_request_context rows
-- ════════════════════════════════════════════════════════════

-- F-01: create_enterprise_request with inactive site → site_inactive
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-f01@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-f01@fixeo.test', 'F01 Owner');

  INSERT INTO public.enterprise_accounts(id, name, status)
    VALUES(gen_random_uuid(), 'F01 Corp', 'active') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  -- Site is INACTIVE
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'F01 Site', 'Khouribga', 'inactive')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Attempt to create request on inactive site
  SELECT public.create_enterprise_request(
    v_eid, v_sid, 'plumbing', 'Test description for inactive site guard'
  ) INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'site_inactive' THEN
    RAISE EXCEPTION 'F-01 FAIL: expected site_inactive, got %', v_res;
  END IF;
  RAISE NOTICE 'F-01 PASS: inactive site → create_enterprise_request returns site_inactive';
END $$;
ROLLBACK;


-- F-02: active site → create_enterprise_request passes the site guard
-- (We only verify Guard 7 passes — we do NOT dispatch or commit)
BEGIN;
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_eid uuid;
  v_sid uuid;
  v_res jsonb;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-f02@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-f02@fixeo.test', 'F02 Owner');

  INSERT INTO public.enterprise_accounts(id, name, status)
    VALUES(gen_random_uuid(), 'F02 Corp', 'active') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  -- Site is ACTIVE
  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'F02 Site', 'El Jadida', 'active')
    RETURNING id INTO v_sid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  -- Attempt create_enterprise_request — active site passes Guard 7
  -- Result may be ok:true (if dispatch chain available) or another
  -- downstream error — what matters is NOT site_inactive.
  SELECT public.create_enterprise_request(
    v_eid, v_sid, 'plumbing', 'F02 active site guard test'
  ) INTO v_res;

  -- The site_inactive guard must NOT fire
  IF v_res->>'reason' = 'site_inactive' THEN
    RAISE EXCEPTION 'F-02 FAIL: active site incorrectly blocked as site_inactive: %', v_res;
  END IF;
  RAISE NOTICE 'F-02 PASS: active site passes create_enterprise_request site guard (result: %)',
    v_res->>'reason';
END $$;
ROLLBACK;


-- F-03: deactivating a site does NOT delete enterprise_request_context rows
BEGIN;
DO $$
DECLARE
  v_uid      uuid := gen_random_uuid();
  v_eid      uuid;
  v_sid      uuid;
  v_erc_id   uuid;
  v_sr_id    uuid;
  v_res      jsonb;
  v_erc_count integer;
BEGIN
  INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at,
                         created_at, updated_at, aud, "role")
    VALUES(v_uid, 'bp08c-f03@fixeo.test', 'x',
           now(), now(), now(), 'authenticated', 'authenticated');
  INSERT INTO public.users(id, email, full_name)
    VALUES(v_uid, 'bp08c-f03@fixeo.test', 'F03 Owner');

  INSERT INTO public.enterprise_accounts(id, name, status)
    VALUES(gen_random_uuid(), 'F03 Corp', 'active') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id, user_id, role, status)
    VALUES(v_eid, v_uid, 'owner', 'active');

  INSERT INTO public.enterprise_sites(id, enterprise_id, name, city, status)
    VALUES(gen_random_uuid(), v_eid, 'F03 Site', 'Settat', 'active')
    RETURNING id INTO v_sid;

  -- Insert a service_request and enterprise_request_context row manually
  -- (simulating a historical request — we bypass create_enterprise_request
  -- to avoid dispatch chain dependency in this unit test)
  INSERT INTO public.service_requests(id, service_category, city, description, status)
    VALUES(gen_random_uuid(), 'plumbing', 'Settat', 'F03 historical request', 'new')
    RETURNING id INTO v_sr_id;

  INSERT INTO public.enterprise_request_context(
    id, enterprise_id, site_id, service_request_id, created_by
  )
  VALUES(gen_random_uuid(), v_eid, v_sid, v_sr_id, v_uid)
  RETURNING id INTO v_erc_id;

  -- Verify context row exists before deactivation
  SELECT COUNT(*) INTO v_erc_count
  FROM public.enterprise_request_context
  WHERE id = v_erc_id;

  IF v_erc_count != 1 THEN
    RAISE EXCEPTION 'F-03 SETUP FAIL: context row not found before deactivation';
  END IF;

  -- Now deactivate the site via RPC
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);

  SELECT public.set_enterprise_site_status(v_eid, v_sid, 'inactive') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'F-03 FAIL: set_enterprise_site_status failed: %', v_res;
  END IF;

  -- Verify context row STILL EXISTS after deactivation
  SELECT COUNT(*) INTO v_erc_count
  FROM public.enterprise_request_context
  WHERE id = v_erc_id;

  IF v_erc_count != 1 THEN
    RAISE EXCEPTION 'F-03 FAIL: enterprise_request_context row was deleted by site deactivation!';
  END IF;

  RAISE NOTICE 'F-03 PASS: deactivating a site preserves enterprise_request_context rows';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION G — STRUCTURAL REVOCATION (static DO block)
--
-- G-01: authenticated has no table-level UPDATE on enterprise_sites
--       (verify from information_schema.role_table_grants)
-- ════════════════════════════════════════════════════════════

BEGIN;
DO $$
DECLARE
  v_grant_count integer;
BEGIN
  -- Query information_schema.role_table_grants directly —
  -- the canonical privilege catalog source.
  SELECT COUNT(*)
  INTO v_grant_count
  FROM information_schema.role_table_grants
  WHERE grantee      = 'authenticated'
    AND table_schema = 'public'
    AND table_name   = 'enterprise_sites'
    AND privilege_type = 'UPDATE';

  IF v_grant_count > 0 THEN
    RAISE EXCEPTION
      'G-01 FAIL: authenticated still has % UPDATE grant(s) on enterprise_sites '
      '(expected 0 after BP08C REVOKE)',
      v_grant_count;
  END IF;

  RAISE NOTICE 'G-01 PASS: authenticated has no UPDATE grant on enterprise_sites (information_schema confirmed)';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08C Test Suite — Complete';
  RAISE NOTICE '';
  RAISE NOTICE 'Section A — STRUCTURAL (5 cases)';
  RAISE NOTICE '  A-01: update_enterprise_site is SECURITY DEFINER';
  RAISE NOTICE '  A-02: set_enterprise_site_status is SECURITY DEFINER';
  RAISE NOTICE '  A-03: search_path = '''' on both RPCs';
  RAISE NOTICE '  A-04: anon cannot EXECUTE either RPC';
  RAISE NOTICE '  A-05: authenticated has no UPDATE on enterprise_sites';
  RAISE NOTICE '';
  RAISE NOTICE 'Section B — AUTH/CALLER (5 cases)';
  RAISE NOTICE '  B-01: unauthenticated blocked (update)';
  RAISE NOTICE '  B-02: unauthenticated blocked (status)';
  RAISE NOTICE '  B-03: non-member blocked';
  RAISE NOTICE '  B-04: suspended caller blocked';
  RAISE NOTICE '  B-05: reporter role blocked (forbidden)';
  RAISE NOTICE '';
  RAISE NOTICE 'Section C — MUTATION (5 cases)';
  RAISE NOTICE '  C-01: owner can update site name/city';
  RAISE NOTICE '  C-02: admin can update site name/city';
  RAISE NOTICE '  C-03: owner can deactivate site';
  RAISE NOTICE '  C-04: owner can reactivate site';
  RAISE NOTICE '  C-05: admin can deactivate site';
  RAISE NOTICE '';
  RAISE NOTICE 'Section D — CROSS-TENANT (3 cases)';
  RAISE NOTICE '  D-01: wrong tenant blocked on update';
  RAISE NOTICE '  D-02: wrong tenant blocked on status';
  RAISE NOTICE '  D-03: site from other enterprise blocked';
  RAISE NOTICE '';
  RAISE NOTICE 'Section E — VALIDATION (4 cases)';
  RAISE NOTICE '  E-01: blank name rejected';
  RAISE NOTICE '  E-02: blank city rejected';
  RAISE NOTICE '  E-03: invalid status rejected';
  RAISE NOTICE '  E-04: no_change returns ok=true';
  RAISE NOTICE '';
  RAISE NOTICE 'Section F — INACTIVE SITE REQUEST PREVENTION (3 cases)';
  RAISE NOTICE '  F-01: inactive site → create_enterprise_request returns site_inactive';
  RAISE NOTICE '  F-02: active site passes the site guard';
  RAISE NOTICE '  F-03: deactivating site preserves enterprise_request_context rows';
  RAISE NOTICE '';
  RAISE NOTICE 'Section G — STRUCTURAL REVOCATION (1 case)';
  RAISE NOTICE '  G-01: authenticated has no UPDATE grant (information_schema)';
  RAISE NOTICE '';
  RAISE NOTICE 'Total: 26 test cases across 7 sections';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;
