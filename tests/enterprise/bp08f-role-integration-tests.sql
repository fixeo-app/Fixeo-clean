-- ════════════════════════════════════════════════════════════
-- FIXEO — BP08F Role Integration SQL Tests
-- File: tests/enterprise/bp08f-role-integration-tests.sql
-- Sprint: BP08F
-- Branch: recovery/seo-v3-safe
--
-- EVERY behavioral test block: BEGIN ... ROLLBACK (transaction-isolated)
-- Zero bare COMMITs in behavioral tests.
-- No test leaves persistent state.
-- Static / structural assertions run inside BEGIN/ROLLBACK DO blocks.
-- ════════════════════════════════════════════════════════════
-- REQUIRES: 7c13a1, 7c15a1, 7c15a3, 7c15a6, 7c15a8 applied to
--           the target database.
-- DO NOT RUN AGAINST PRODUCTION.
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F SQL Test Suite — site manager role integration';
  RAISE NOTICE 'All behavioral blocks: BEGIN/ROLLBACK (no persistent state)';
  RAISE NOTICE 'Zero bare COMMITs in behavioral tests';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION A — STRUCTURAL (static assertions)
--
-- A-01: update_enterprise_member_role is SECURITY DEFINER
-- A-02: update_enterprise_member_role search_path = ''
-- A-03: enterprise_member_sites table exists
-- ════════════════════════════════════════════════════════════

BEGIN;
DO $$
DECLARE
  v_secdef       boolean;
  v_sp_config    text;
  v_tbl_exists   boolean;
BEGIN

  -- ── A-01: update_enterprise_member_role is SECURITY DEFINER ──
  SELECT p.prosecdef
  INTO v_secdef
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'update_enterprise_member_role'
  LIMIT 1;

  IF NOT FOUND OR v_secdef IS NULL THEN
    RAISE EXCEPTION 'A-01 FAIL: update_enterprise_member_role not found in pg_proc';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'A-01 FAIL: update_enterprise_member_role is not SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'A-01 PASS: update_enterprise_member_role is SECURITY DEFINER';

  -- ── A-02: update_enterprise_member_role has search_path = '' ──
  SELECT pg_catalog.array_to_string(p.proconfig, '|')
  INTO v_sp_config
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'update_enterprise_member_role'
  LIMIT 1;

  IF v_sp_config IS NULL OR v_sp_config NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'A-02 FAIL: update_enterprise_member_role has no search_path config; got: %',
      v_sp_config;
  END IF;
  IF v_sp_config LIKE '%search_path=public%'
     OR v_sp_config LIKE '%search_path=pg_catalog%' THEN
    RAISE EXCEPTION 'A-02 FAIL: update_enterprise_member_role has non-empty search_path; got: %',
      v_sp_config;
  END IF;
  RAISE NOTICE 'A-02 PASS: update_enterprise_member_role has empty search_path (config: %)',
    v_sp_config;

  -- ── A-03: enterprise_member_sites table exists ──
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_member_sites'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE EXCEPTION 'A-03 FAIL: enterprise_member_sites table not found (apply 7c15a6 first)';
  END IF;
  RAISE NOTICE 'A-03 PASS: enterprise_member_sites table exists';

END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION B — ROLE-CHANGE CLEANUP BEHAVIOUR
--
-- B-01: site_manager → reporter clears all assignments + audit event
-- B-02: site_manager → viewer clears all assignments
-- B-03: site_manager → operations_manager clears all assignments
-- B-04: site_manager → admin clears all assignments
-- B-05: site_manager → site_manager (no_change) leaves assignments untouched
-- B-06: reporter → admin leaves enterprise_member_sites untouched
-- B-07: zero assignments — role change from site_manager succeeds, no audit for assignments
-- B-08: member_role_changed audit event still fires correctly after cleanup
-- B-09: member_site_assignments_changed has correct previous_site_ids + empty new_site_ids
-- B-10: role change TO site_manager (from other role) does NOT add assignments
-- ════════════════════════════════════════════════════════════

-- ── FIXTURE HELPER (used throughout Section B)
-- Each test creates its own users, enterprise, member, and site
-- assignments inside its own BEGIN block. All rolled back.
-- Pattern: INSERT auth.users → public.users → enterprise_accounts
--          → enterprise_members → enterprise_sites (as needed)
--          → enterprise_member_sites (as needed)
--          → set jwt claims → call RPC → assert


-- B-01: site_manager → reporter clears all assignments + creates audit event
BEGIN;
DO $$
DECLARE
  v_owner     uuid := gen_random_uuid();
  v_mem       uuid := gen_random_uuid();
  v_eid       uuid;
  v_mid       uuid;
  v_site1_id  uuid;
  v_site2_id  uuid;
  v_res       jsonb;
  v_remaining integer;
  v_audit_cnt integer;
BEGIN
  -- users
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b01-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b01-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b01-owner@fixeo.test','B01 Owner'),
      (v_mem,  'bp08f-b01-mem@fixeo.test',  'B01 SiteMgr');

  -- enterprise + members
  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B01') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  -- enterprise_sites
  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B01-1','Paris','active') RETURNING id INTO v_site1_id;
  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B01-2','Lyon','active')  RETURNING id INTO v_site2_id;

  -- assign both sites to the member
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site1_id),(v_mid,v_site2_id);

  -- call as owner: site_manager → reporter
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'reporter') INTO v_res;

  -- assert ok
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-01 FAIL: RPC failed: %', v_res;
  END IF;

  -- assert enterprise_member_sites is cleared
  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_remaining != 0 THEN
    RAISE EXCEPTION 'B-01 FAIL: % site assignment row(s) remain after role change', v_remaining;
  END IF;

  -- assert member_site_assignments_changed audit event exists
  SELECT COUNT(*) INTO v_audit_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed';

  IF v_audit_cnt = 0 THEN
    RAISE EXCEPTION 'B-01 FAIL: no member_site_assignments_changed audit event found';
  END IF;

  RAISE NOTICE 'B-01 PASS: site_manager → reporter cleared % rows + audit event written',
    2;
END $$;
ROLLBACK;


-- B-02: site_manager → viewer clears all assignments
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site_id  uuid;
  v_res      jsonb;
  v_remaining integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b02-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b02-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b02-owner@fixeo.test','B02 Owner'),
      (v_mem,  'bp08f-b02-mem@fixeo.test',  'B02 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B02') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B02','Nice','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site_id);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'viewer') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-02 FAIL: RPC failed: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_remaining != 0 THEN
    RAISE EXCEPTION 'B-02 FAIL: % site assignment row(s) remain after viewer transition',
      v_remaining;
  END IF;

  RAISE NOTICE 'B-02 PASS: site_manager → viewer cleared all assignments';
END $$;
ROLLBACK;


-- B-03: site_manager → operations_manager clears all assignments
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site_id  uuid;
  v_res      jsonb;
  v_remaining integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b03-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b03-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b03-owner@fixeo.test','B03 Owner'),
      (v_mem,  'bp08f-b03-mem@fixeo.test',  'B03 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B03') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B03','Bordeaux','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site_id);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'operations_manager') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-03 FAIL: RPC failed: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_remaining != 0 THEN
    RAISE EXCEPTION 'B-03 FAIL: % row(s) remain after operations_manager transition',
      v_remaining;
  END IF;

  RAISE NOTICE 'B-03 PASS: site_manager → operations_manager cleared all assignments';
END $$;
ROLLBACK;


-- B-04: site_manager → admin clears all assignments
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site_id  uuid;
  v_res      jsonb;
  v_remaining integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b04-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b04-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b04-owner@fixeo.test','B04 Owner'),
      (v_mem,  'bp08f-b04-mem@fixeo.test',  'B04 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B04') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B04','Marseille','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site_id);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'admin') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-04 FAIL: RPC failed: %', v_res;
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_remaining != 0 THEN
    RAISE EXCEPTION 'B-04 FAIL: % row(s) remain after admin transition', v_remaining;
  END IF;

  RAISE NOTICE 'B-04 PASS: site_manager → admin cleared all assignments';
END $$;
ROLLBACK;


-- B-05: site_manager → site_manager (no_change) leaves assignments untouched
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site_id  uuid;
  v_res      jsonb;
  v_remaining integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b05-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b05-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b05-owner@fixeo.test','B05 Owner'),
      (v_mem,  'bp08f-b05-mem@fixeo.test',  'B05 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B05') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B05','Toulouse','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site_id);

  -- Call with same role — Guard 7 should short-circuit with no_change
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'site_manager') INTO v_res;

  -- ok=true but reason=no_change
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-05 FAIL: expected ok=true no_change, got %', v_res;
  END IF;
  IF v_res->>'reason' != 'no_change' THEN
    RAISE EXCEPTION 'B-05 FAIL: expected reason=no_change, got %', v_res->>'reason';
  END IF;

  -- assignments must be untouched
  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_remaining != 1 THEN
    RAISE EXCEPTION 'B-05 FAIL: expected 1 assignment, got %', v_remaining;
  END IF;

  RAISE NOTICE 'B-05 PASS: no_change (site_manager → site_manager) leaves assignments untouched';
END $$;
ROLLBACK;


-- B-06: reporter → admin leaves enterprise_member_sites untouched (non-site_manager)
BEGIN;
DO $$
DECLARE
  v_owner     uuid := gen_random_uuid();
  v_mem       uuid := gen_random_uuid();
  v_mem2      uuid := gen_random_uuid();
  v_eid       uuid;
  v_mid_rep   uuid;
  v_mid_sm    uuid;
  v_site_id   uuid;
  v_res       jsonb;
  v_remaining integer;
BEGIN
  -- Three users: owner, reporter (target), and an unrelated site_manager
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b06-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b06-rep@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem2, 'bp08f-b06-sm@fixeo.test',   'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b06-owner@fixeo.test','B06 Owner'),
      (v_mem,  'bp08f-b06-rep@fixeo.test',  'B06 Reporter'),
      (v_mem2, 'bp08f-b06-sm@fixeo.test',   'B06 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B06') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem, 'reporter',     'active') RETURNING id INTO v_mid_rep;
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem2,'site_manager', 'active') RETURNING id INTO v_mid_sm;

  -- Give the site_manager some site assignments (must remain untouched)
  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B06','Lille','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid_sm,v_site_id);

  -- Change reporter → admin (no site_manager involvement)
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid_rep, 'admin') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-06 FAIL: RPC failed: %', v_res;
  END IF;

  -- The site_manager's assignments must be completely untouched
  SELECT COUNT(*) INTO v_remaining
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid_sm;

  IF v_remaining != 1 THEN
    RAISE EXCEPTION 'B-06 FAIL: site_manager assignments changed unexpectedly; count=%',
      v_remaining;
  END IF;

  -- Reporter had no assignments — nothing to check for v_mid_rep
  RAISE NOTICE 'B-06 PASS: reporter → admin leaves site_manager assignments untouched';
END $$;
ROLLBACK;


-- B-07: zero assignments — role change from site_manager succeeds, NO audit event for assignments
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_res      jsonb;
  v_audit_cnt integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b07-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b07-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b07-owner@fixeo.test','B07 Owner'),
      (v_mem,  'bp08f-b07-mem@fixeo.test',  'B07 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B07') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  -- No site assignments for v_mid (zero-assignment baseline)

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'reporter') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-07 FAIL: RPC failed: %', v_res;
  END IF;

  -- No member_site_assignments_changed event must be written for zero-assignment case
  SELECT COUNT(*) INTO v_audit_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed';

  IF v_audit_cnt != 0 THEN
    RAISE EXCEPTION
      'B-07 FAIL: member_site_assignments_changed event written for zero-assignment case (count=%)',
      v_audit_cnt;
  END IF;

  RAISE NOTICE 'B-07 PASS: zero-assignment site_manager role change: no audit event for assignments';
END $$;
ROLLBACK;


-- B-08: member_role_changed audit event still fires correctly after cleanup
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site_id  uuid;
  v_res      jsonb;
  v_role_audit_cnt  integer;
  v_meta            jsonb;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b08-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b08-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b08-owner@fixeo.test','B08 Owner'),
      (v_mem,  'bp08f-b08-mem@fixeo.test',  'B08 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B08') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B08','Strasbourg','active') RETURNING id INTO v_site_id;
  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site_id);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'reporter') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-08 FAIL: RPC failed: %', v_res;
  END IF;

  -- Exactly one member_role_changed audit event
  SELECT COUNT(*) INTO v_role_audit_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_role_changed';

  IF v_role_audit_cnt != 1 THEN
    RAISE EXCEPTION 'B-08 FAIL: expected 1 member_role_changed event, got %', v_role_audit_cnt;
  END IF;

  -- Verify metadata: old_role=site_manager, new_role=reporter
  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_role_changed'
  LIMIT 1;

  IF v_meta->>'old_role' != 'site_manager' THEN
    RAISE EXCEPTION 'B-08 FAIL: member_role_changed old_role wrong: %', v_meta->>'old_role';
  END IF;
  IF v_meta->>'new_role' != 'reporter' THEN
    RAISE EXCEPTION 'B-08 FAIL: member_role_changed new_role wrong: %', v_meta->>'new_role';
  END IF;

  RAISE NOTICE 'B-08 PASS: member_role_changed audit event fires correctly after site cleanup';
END $$;
ROLLBACK;


-- B-09: member_site_assignments_changed has correct previous_site_ids and empty new_site_ids
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_site1_id uuid;
  v_site2_id uuid;
  v_res      jsonb;
  v_meta     jsonb;
  v_prev     jsonb;
  v_new_ids  jsonb;
  v_reason   text;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b09-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b09-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b09-owner@fixeo.test','B09 Owner'),
      (v_mem,  'bp08f-b09-mem@fixeo.test',  'B09 SiteMgr');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B09') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'site_manager','active') RETURNING id INTO v_mid;

  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B09-1','Nantes','active') RETURNING id INTO v_site1_id;
  INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status)
    VALUES(gen_random_uuid(),v_eid,'Site B09-2','Rennes','active') RETURNING id INTO v_site2_id;

  INSERT INTO public.enterprise_member_sites(member_id,site_id)
    VALUES(v_mid,v_site1_id),(v_mid,v_site2_id);

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'operations_manager') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-09 FAIL: RPC failed: %', v_res;
  END IF;

  -- Fetch the assignment-changed audit event metadata
  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_eid
    AND target_id     = v_mid
    AND action_type   = 'member_site_assignments_changed'
  LIMIT 1;

  IF NOT FOUND OR v_meta IS NULL THEN
    RAISE EXCEPTION 'B-09 FAIL: member_site_assignments_changed event not found';
  END IF;

  -- new_site_ids must be an empty array
  v_new_ids := v_meta->'new_site_ids';
  IF v_new_ids IS NULL OR jsonb_array_length(v_new_ids) != 0 THEN
    RAISE EXCEPTION 'B-09 FAIL: new_site_ids is not empty: %', v_new_ids;
  END IF;

  -- previous_site_ids must contain exactly 2 entries
  v_prev := v_meta->'previous_site_ids';
  IF v_prev IS NULL OR jsonb_array_length(v_prev) != 2 THEN
    RAISE EXCEPTION 'B-09 FAIL: previous_site_ids should have 2 entries, got: %', v_prev;
  END IF;

  -- reason must be 'role_change_cleanup'
  v_reason := v_meta->>'reason';
  IF v_reason != 'role_change_cleanup' THEN
    RAISE EXCEPTION 'B-09 FAIL: reason is %, expected role_change_cleanup', v_reason;
  END IF;

  -- Both site IDs must appear in previous_site_ids
  IF NOT (v_prev @> to_jsonb(ARRAY[v_site1_id])) THEN
    RAISE EXCEPTION 'B-09 FAIL: site1_id (%s) not in previous_site_ids: %', v_site1_id, v_prev;
  END IF;
  IF NOT (v_prev @> to_jsonb(ARRAY[v_site2_id])) THEN
    RAISE EXCEPTION 'B-09 FAIL: site2_id (%s) not in previous_site_ids: %', v_site2_id, v_prev;
  END IF;

  RAISE NOTICE 'B-09 PASS: member_site_assignments_changed has correct previous_site_ids and empty new_site_ids';
END $$;
ROLLBACK;


-- B-10: role change TO site_manager (from other role) does NOT add assignments (zero default)
BEGIN;
DO $$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_mem      uuid := gen_random_uuid();
  v_eid      uuid;
  v_mid      uuid;
  v_res      jsonb;
  v_count    integer;
  v_new_role text;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_owner,'bp08f-b10-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_mem,  'bp08f-b10-mem@fixeo.test',  'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_owner,'bp08f-b10-owner@fixeo.test','B10 Owner'),
      (v_mem,  'bp08f-b10-mem@fixeo.test',  'B10 Reporter');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo B10') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_owner,'owner','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_mem,'reporter','active') RETURNING id INTO v_mid;

  -- Promote reporter → site_manager
  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'site_manager') INTO v_res;

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'B-10 FAIL: RPC failed: %', v_res;
  END IF;

  -- Verify role changed
  SELECT role INTO v_new_role FROM public.enterprise_members WHERE id = v_mid;
  IF v_new_role != 'site_manager' THEN
    RAISE EXCEPTION 'B-10 FAIL: role not updated to site_manager, got %', v_new_role;
  END IF;

  -- No assignments must be auto-created
  SELECT COUNT(*) INTO v_count
  FROM public.enterprise_member_sites
  WHERE member_id = v_mid;

  IF v_count != 0 THEN
    RAISE EXCEPTION 'B-10 FAIL: % assignment row(s) unexpectedly created on promotion to site_manager',
      v_count;
  END IF;

  RAISE NOTICE 'B-10 PASS: promotion to site_manager creates zero default assignments';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION C — AUTHORIZATION PRESERVED
--
-- C-01: unauthenticated blocked
-- C-02: operations_manager blocked (forbidden)
-- C-03: admin cannot demote owner (cannot_modify_owner)
-- C-04: last active owner protected (owner_invariant_violation)
-- ════════════════════════════════════════════════════════════

-- C-01: unauthenticated (no jwt context) returns 'unauthenticated'
BEGIN;
DO $$
DECLARE
  v_eid uuid := gen_random_uuid();
  v_mid uuid := gen_random_uuid();
  v_res jsonb;
BEGIN
  -- No set_config → auth.uid() = NULL
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'reporter') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'unauthenticated' THEN
    RAISE EXCEPTION 'C-01 FAIL: expected unauthenticated, got %', v_res;
  END IF;

  RAISE NOTICE 'C-01 PASS: unauthenticated caller blocked';
END $$;
ROLLBACK;


-- C-02: operations_manager cannot call update_enterprise_member_role (forbidden)
BEGIN;
DO $$
DECLARE
  v_uid  uuid := gen_random_uuid();
  v_uid2 uuid := gen_random_uuid();
  v_eid  uuid;
  v_mid  uuid;
  v_res  jsonb;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_uid, 'bp08f-c02-opsmgr@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_uid2,'bp08f-c02-target@fixeo.test', 'x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_uid, 'bp08f-c02-opsmgr@fixeo.test','C02 OpsMgr'),
      (v_uid2,'bp08f-c02-target@fixeo.test', 'C02 Target');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo C02') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_uid,'operations_manager','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_uid2,'reporter','active') RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_uid), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'viewer') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'forbidden' THEN
    RAISE EXCEPTION 'C-02 FAIL: operations_manager not blocked, got %', v_res;
  END IF;

  RAISE NOTICE 'C-02 PASS: operations_manager blocked (forbidden)';
END $$;
ROLLBACK;


-- C-03: admin cannot demote owner (cannot_modify_owner)
BEGIN;
DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_eid   uuid;
  v_oid   uuid;
  v_res   jsonb;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES
      (v_admin,'bp08f-c03-admin@fixeo.test','x',now(),now(),now(),'authenticated','authenticated'),
      (v_owner,'bp08f-c03-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES
      (v_admin,'bp08f-c03-admin@fixeo.test','C03 Admin'),
      (v_owner,'bp08f-c03-owner@fixeo.test','C03 Owner');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo C03') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status)
    VALUES(v_eid,v_admin,'admin','active');
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_owner,'owner','active') RETURNING id INTO v_oid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_admin), true);
  SELECT public.update_enterprise_member_role(v_eid, v_oid, 'admin') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'cannot_modify_owner' THEN
    RAISE EXCEPTION 'C-03 FAIL: admin demoting owner was not blocked, got %', v_res;
  END IF;

  RAISE NOTICE 'C-03 PASS: admin cannot demote owner (cannot_modify_owner)';
END $$;
ROLLBACK;


-- C-04: last active owner cannot demote themselves (owner_invariant_violation)
BEGIN;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_eid   uuid;
  v_mid   uuid;
  v_res   jsonb;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,"role")
    VALUES(v_owner,'bp08f-c04-owner@fixeo.test','x',now(),now(),now(),'authenticated','authenticated');
  INSERT INTO public.users(id,email,full_name)
    VALUES(v_owner,'bp08f-c04-owner@fixeo.test','C04 SoloOwner');

  INSERT INTO public.enterprise_accounts(id,name)
    VALUES(gen_random_uuid(),'TestCo C04') RETURNING id INTO v_eid;
  INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status)
    VALUES(gen_random_uuid(),v_eid,v_owner,'owner','active') RETURNING id INTO v_mid;

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner), true);
  SELECT public.update_enterprise_member_role(v_eid, v_mid, 'admin') INTO v_res;

  IF (v_res->>'ok')::boolean OR v_res->>'reason' != 'owner_invariant_violation' THEN
    RAISE EXCEPTION 'C-04 FAIL: last owner demotion not blocked, got %', v_res;
  END IF;

  RAISE NOTICE 'C-04 PASS: last active owner protected (owner_invariant_violation)';
END $$;
ROLLBACK;


-- ════════════════════════════════════════════════════════════
-- SECTION Z — SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08F SQL Test Suite — complete';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION A — Structural';
  RAISE NOTICE '  A-01 SECURITY DEFINER: update_enterprise_member_role';
  RAISE NOTICE '  A-02 search_path='''''' on update_enterprise_member_role';
  RAISE NOTICE '  A-03 enterprise_member_sites table exists';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION B — Role-change cleanup';
  RAISE NOTICE '  B-01 site_manager → reporter clears assignments + audit event';
  RAISE NOTICE '  B-02 site_manager → viewer clears all assignments';
  RAISE NOTICE '  B-03 site_manager → operations_manager clears all assignments';
  RAISE NOTICE '  B-04 site_manager → admin clears all assignments';
  RAISE NOTICE '  B-05 no_change (site_manager → site_manager) untouched';
  RAISE NOTICE '  B-06 reporter → admin: site_manager assignments untouched';
  RAISE NOTICE '  B-07 zero assignments: no member_site_assignments_changed event';
  RAISE NOTICE '  B-08 member_role_changed fires correctly after cleanup';
  RAISE NOTICE '  B-09 member_site_assignments_changed: correct previous_site_ids + empty new_site_ids';
  RAISE NOTICE '  B-10 promotion to site_manager: zero default assignments';
  RAISE NOTICE '';
  RAISE NOTICE 'SECTION C — Authorization preserved';
  RAISE NOTICE '  C-01 unauthenticated blocked';
  RAISE NOTICE '  C-02 operations_manager blocked (forbidden)';
  RAISE NOTICE '  C-03 admin cannot demote owner (cannot_modify_owner)';
  RAISE NOTICE '  C-04 last active owner protected (owner_invariant_violation)';
  RAISE NOTICE '';
  RAISE NOTICE 'TOTAL: 17 test cases';
  RAISE NOTICE 'All behavioral tests: BEGIN/ROLLBACK (zero bare COMMITs)';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;
