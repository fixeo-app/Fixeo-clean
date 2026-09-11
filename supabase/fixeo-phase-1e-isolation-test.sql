-- ══════════════════════════════════════════════════════════════════
-- PHASE 1E — Enterprise Tenant Isolation Test
-- File:    /tmp/fixeo-phase-1e-isolation-test.sql
-- Target:  Supabase SQL Editor (postgres role)
-- Safety:  Single BEGIN…ROLLBACK. Zero persistent rows guaranteed.
--
-- Production facts used in this script:
--   handle_new_user() trigger fires AFTER INSERT ON auth.users
--     → auto-creates public.users + public.profiles for every row
--     → DO NOT manually INSERT public.users (unique violation)
--   public.users.id REFERENCES auth.users(id) NOT DEFERRABLE
--     → auth.users rows must exist before enterprise_members FKs
--   uid_orphan: synthetic UUID only — never inserted into auth.users
--     → no public.users row → Guard 2 in create_enterprise_account()
--       returns user_not_found (this is the v2 orphan strategy)
--   enterprise_accounts + enterprise_members:
--     authenticated has NO INSERT/DELETE/broad UPDATE grants
--     authenticated has SELECT on both tables
--     authenticated has UPDATE(name, legal_name) on enterprise_accounts only
--   RLS policies:
--     enterprise_accounts: ea_deny_anon, ea_members_select,
--                          ea_owner_update, ea_fixeo_admin_all
--     enterprise_members:  em_deny_anon, em_self_select,
--                          em_members_select, em_fixeo_admin_all
--   ea_members_select uses _fixeo_is_enterprise_member(id): status='active'
--   em_members_select uses _fixeo_is_enterprise_member(enterprise_id): status='active'
--   em_self_select: user_id = auth.uid() — NO status filter
--   ea_owner_update uses _fixeo_is_enterprise_manager(id): role IN (owner,admin), status='active'
--   create_enterprise_account() guards: unauthenticated, user_not_found,
--     already_owner, name_required, name_too_long, legal_name_invalid
--
-- Identities provisioned:
--   uid_a     → EA owner  (owner/active in EA)
--   uid_b     → EB owner  (owner/active in EB)
--   uid_c     → EA invited viewer (viewer/invited in EA); creates EC in T-34
--   uid_admin → FIXEO admin (public.users.role = 'admin')
--   uid_orphan → synthetic UUID only; NO auth.users; NO public.users
--
-- DO NOT EXECUTE without explicit human authorization.
-- DO NOT COMMIT. DO NOT MODIFY production.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── TEMP TABLE for machine-readable results (transaction-local) ──
-- ON COMMIT DROP ensures it vanishes on ROLLBACK with everything else.
-- Must be created before T-01.
CREATE TEMP TABLE _t_results (
  test_id   text,
  result    text,   -- PASS | FAIL | INCONCLUSIVE
  detail    text
) ON COMMIT DROP;

-- ── PHASE 1: Generate UUIDs, store transaction-locally ──────────
DO $$
BEGIN
  PERFORM set_config('test.uid_a',      gen_random_uuid()::text, true);
  PERFORM set_config('test.uid_b',      gen_random_uuid()::text, true);
  PERFORM set_config('test.uid_c',      gen_random_uuid()::text, true);
  PERFORM set_config('test.uid_admin',  gen_random_uuid()::text, true);
  PERFORM set_config('test.uid_orphan', gen_random_uuid()::text, true);
  PERFORM set_config('test.ea_id',      gen_random_uuid()::text, true);
  PERFORM set_config('test.eb_id',      gen_random_uuid()::text, true);
  -- ec_id is populated by T-34 after RPC call; initialise to sentinel
  PERFORM set_config('test.ec_id',      '00000000-0000-0000-0000-000000000000', true);
  RAISE NOTICE 'SETUP uid_a=%  uid_b=%  uid_c=%  uid_admin=%  uid_orphan=%',
    current_setting('test.uid_a'),
    current_setting('test.uid_b'),
    current_setting('test.uid_c'),
    current_setting('test.uid_admin'),
    current_setting('test.uid_orphan');
END $$;

-- ── PHASE 2: Provision identities ───────────────────────────────
-- Insert into auth.users only.
-- handle_new_user() fires AFTER INSERT → creates public.users + public.profiles.
-- DO NOT manually INSERT public.users — would cause unique violation.
-- UPDATE public.users after trigger has fired to set role + full_name.
-- uid_orphan is intentionally NOT inserted (user_orphan_v2 strategy).

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES
  (current_setting('test.uid_a')::uuid,
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'test-ent-a@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.uid_b')::uuid,
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'test-ent-b@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.uid_c')::uuid,
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'test-ent-c@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.uid_admin')::uuid,
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'test-ent-admin@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false);

-- Patch public.users rows created by handle_new_user() trigger.
-- Only role and full_name are patched — all other columns left as set by trigger.
UPDATE public.users SET role = 'client', full_name = 'Test Ent Owner A'
  WHERE id = current_setting('test.uid_a')::uuid;
UPDATE public.users SET role = 'client', full_name = 'Test Ent Owner B'
  WHERE id = current_setting('test.uid_b')::uuid;
UPDATE public.users SET role = 'client', full_name = 'Test Ent User C'
  WHERE id = current_setting('test.uid_c')::uuid;
UPDATE public.users SET role = 'admin',  full_name = 'Test Fixeo Admin'
  WHERE id = current_setting('test.uid_admin')::uuid;

-- Provision enterprise tables directly as postgres (bypasses RLS;
-- authenticated has no INSERT grant on either table).
INSERT INTO public.enterprise_accounts (id, name, status) VALUES
  (current_setting('test.ea_id')::uuid, 'Test Enterprise Alpha', 'active'),
  (current_setting('test.eb_id')::uuid, 'Test Enterprise Beta',  'active');

INSERT INTO public.enterprise_members
  (enterprise_id, user_id, role, status) VALUES
  (current_setting('test.ea_id')::uuid,
   current_setting('test.uid_a')::uuid, 'owner',  'active'),
  (current_setting('test.eb_id')::uuid,
   current_setting('test.uid_b')::uuid, 'owner',  'active'),
  (current_setting('test.ea_id')::uuid,
   current_setting('test.uid_c')::uuid, 'viewer', 'invited');

-- Provisioning sanity check
DO $$
BEGIN
  RAISE NOTICE 'PROVISION ea_rows=% em_rows=% users_a=% users_admin=%',
    (SELECT COUNT(*) FROM public.enterprise_accounts
     WHERE id IN (current_setting('test.ea_id')::uuid,
                  current_setting('test.eb_id')::uuid)),
    (SELECT COUNT(*) FROM public.enterprise_members
     WHERE enterprise_id IN (current_setting('test.ea_id')::uuid,
                              current_setting('test.eb_id')::uuid)),
    (SELECT COUNT(*) FROM public.users
     WHERE id = current_setting('test.uid_a')::uuid),
    (SELECT COUNT(*) FROM public.users
     WHERE id   = current_setting('test.uid_admin')::uuid
       AND role = 'admin');
END $$;

-- ── PHASE 3: Tests ───────────────────────────────────────────────
-- Simulation mechanism:
--   set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)
--   SET LOCAL ROLE authenticated   → simulates authenticated PostgREST call
--   set_config('request.jwt.claims', '', true)
--   SET LOCAL ROLE anon            → simulates unauthenticated call
--   RESET ROLE                     → restore postgres role after each block
--
-- auth.uid() reads current_setting('request.jwt.claims')::jsonb->>'sub'
-- This is identical to the PostgREST mechanism — not an approximation.
--
-- Expected SQL errors are caught in nested BEGIN…EXCEPTION sub-blocks.
-- Sub-block errors roll back to an implicit savepoint; outer tx survives.
-- RESET ROLE is called on every success and every EXCEPTION path.

-- ── T-01: anon blocked from SELECT enterprise_accounts (privilege layer) ──
-- REVOKE ALL ON enterprise_accounts FROM anon means 42501 fires before RLS.
-- ea_deny_anon RLS policy is defence-in-depth; never reached by anon.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM (SELECT 1 FROM public.enterprise_accounts LIMIT 1);
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-01','FAIL','anon SELECT enterprise_accounts was not blocked at privilege layer');
    RAISE WARNING 'T-01 FAIL  anon SELECT enterprise_accounts was not blocked at privilege layer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-01','PASS','anon SELECT enterprise_accounts blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-01 PASS  anon SELECT enterprise_accounts blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-01','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-01 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-02: anon blocked from SELECT enterprise_members (privilege layer) ───
-- REVOKE ALL ON enterprise_members FROM anon means 42501 fires before RLS.
-- em_deny_anon RLS policy is defence-in-depth; never reached by anon.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM (SELECT 1 FROM public.enterprise_members LIMIT 1);
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-02','FAIL','anon SELECT enterprise_members was not blocked at privilege layer');
    RAISE WARNING 'T-02 FAIL  anon SELECT enterprise_members was not blocked at privilege layer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-02','PASS','anon SELECT enterprise_members blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-02 PASS  anon SELECT enterprise_members blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-02','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-02 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-03: user_a sees exactly 1 enterprise_account (EA only) ────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts;
  RESET ROLE;
  IF v = 1 THEN
    INSERT INTO _t_results VALUES ('T-03','PASS','user_a sees 1 account (EA only)');
    RAISE NOTICE 'T-03 PASS  user_a sees 1 account (EA only)';
  ELSE
    INSERT INTO _t_results VALUES ('T-03','FAIL',format('user_a sees %s accounts (expected 1)',v));
    RAISE WARNING 'T-03 FAIL  user_a sees % accounts (expected 1)', v;
  END IF;
END $$;

-- ── T-04: user_a sees EA by id (correct enterprise) ─────────────
DO $$
DECLARE vid uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT id INTO vid FROM public.enterprise_accounts LIMIT 1;
  RESET ROLE;
  IF vid = current_setting('test.ea_id')::uuid THEN
    INSERT INTO _t_results VALUES ('T-04','PASS','user_a sees EA id (correct enterprise)');
    RAISE NOTICE 'T-04 PASS  user_a sees EA id (correct enterprise)';
  ELSE
    INSERT INTO _t_results VALUES ('T-04','FAIL',format('user_a sees wrong id: %s',vid));
    RAISE WARNING 'T-04 FAIL  user_a sees wrong id: %', vid;
  END IF;
END $$;

-- ── T-05: user_a sees 0 rows when filtering for EB ──────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts
    WHERE id = current_setting('test.eb_id')::uuid;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-05','PASS','user_a cannot see EB by id');
    RAISE NOTICE 'T-05 PASS  user_a cannot see EB by id';
  ELSE
    INSERT INTO _t_results VALUES ('T-05','FAIL',format('user_a sees %s EB rows (expected 0)',v));
    RAISE WARNING 'T-05 FAIL  user_a sees % EB rows (expected 0)', v;
  END IF;
END $$;

-- ── T-06: user_b sees exactly 1 account (EB only) ───────────────
-- COUNT(*) proves exactly 1 row visible; separate id lookup proves it is EB.
-- Avoids MIN(uuid) which has no default btree ordering in Supabase PostgreSQL.
DO $$
DECLARE v integer; vid uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_b')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts;
  SELECT id       INTO vid FROM public.enterprise_accounts
    WHERE id = current_setting('test.eb_id')::uuid;
  RESET ROLE;
  IF v = 1 AND vid = current_setting('test.eb_id')::uuid THEN
    INSERT INTO _t_results VALUES ('T-06','PASS','user_b sees 1 account (EB only, correct id)');
    RAISE NOTICE 'T-06 PASS  user_b sees 1 account (EB only, correct id)';
  ELSE
    INSERT INTO _t_results VALUES ('T-06','FAIL',format('user_b sees %s accounts id=%s',v,vid));
    RAISE WARNING 'T-06 FAIL  user_b sees % accounts id=%', v, vid;
  END IF;
END $$;

-- ── T-07: user_b cannot see EA ──────────────────────────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_b')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts
    WHERE id = current_setting('test.ea_id')::uuid;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-07','PASS','user_b cannot see EA (isolation confirmed)');
    RAISE NOTICE 'T-07 PASS  user_b cannot see EA (isolation confirmed)';
  ELSE
    INSERT INTO _t_results VALUES ('T-07','FAIL',format('user_b sees EA row — ISOLATION BREACH count=%s',v));
    RAISE WARNING 'T-07 FAIL  user_b sees EA row — ISOLATION BREACH count=%', v;
  END IF;
END $$;

-- ── T-08: user_c (invited, not active) sees 0 accounts ──────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-08','PASS','invited user_c sees 0 accounts');
    RAISE NOTICE 'T-08 PASS  invited user_c sees 0 accounts';
  ELSE
    INSERT INTO _t_results VALUES ('T-08','FAIL',format('user_c sees %s accounts (expected 0)',v));
    RAISE WARNING 'T-08 FAIL  user_c sees % accounts (expected 0)', v;
  END IF;
END $$;

-- ── T-09: non-member (orphan UUID) sees 0 accounts ──────────────
-- uid_orphan has no auth.users, no public.users row.
-- auth.uid() returns a non-null UUID; _fixeo_is_enterprise_member
-- returns false for all rows. RLS blocks everything.
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_orphan')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-09','PASS','non-member orphan UUID sees 0 accounts');
    RAISE NOTICE 'T-09 PASS  non-member orphan UUID sees 0 accounts';
  ELSE
    INSERT INTO _t_results VALUES ('T-09','FAIL',format('non-member sees %s accounts (expected 0)',v));
    RAISE WARNING 'T-09 FAIL  non-member sees % accounts (expected 0)', v;
  END IF;
END $$;

-- ── T-10: admin sees both test accounts ─────────────────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_admin')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts
    WHERE id IN (current_setting('test.ea_id')::uuid,
                 current_setting('test.eb_id')::uuid);
  RESET ROLE;
  IF v = 2 THEN
    INSERT INTO _t_results VALUES ('T-10','PASS','admin sees both test accounts');
    RAISE NOTICE 'T-10 PASS  admin sees both test accounts';
  ELSE
    INSERT INTO _t_results VALUES ('T-10','FAIL',format('admin sees %s accounts (expected 2)',v));
    RAISE WARNING 'T-10 FAIL  admin sees % accounts (expected 2)', v;
  END IF;
END $$;

-- ── T-11: anon blocked from SELECT enterprise_members (privilege layer) ───
-- Duplicate coverage from a different angle: confirms em table also blocked.
-- Same mechanism as T-02. Both are kept because ea/em are separate REVOKE targets.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM (SELECT 1 FROM public.enterprise_members LIMIT 1);
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-11','FAIL','anon SELECT enterprise_members was not blocked at privilege layer');
    RAISE WARNING 'T-11 FAIL  anon SELECT enterprise_members was not blocked at privilege layer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-11','PASS','anon SELECT enterprise_members blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-11 PASS  anon SELECT enterprise_members blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-11','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-11 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-12: user_c (invited) sees own EA member row via em_self_select
DO $$
DECLARE v integer; vstatus text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*), MIN(status) INTO v, vstatus
    FROM public.enterprise_members
    WHERE user_id       = current_setting('test.uid_c')::uuid
      AND enterprise_id = current_setting('test.ea_id')::uuid;
  RESET ROLE;
  IF v = 1 AND vstatus = 'invited' THEN
    INSERT INTO _t_results VALUES ('T-12','PASS','invited user_c sees own EA member row (status=invited)');
    RAISE NOTICE 'T-12 PASS  invited user_c sees own EA member row (status=invited)';
  ELSE
    INSERT INTO _t_results VALUES ('T-12','FAIL',format('v=%s status=%s (expected 1/invited)',v,vstatus));
    RAISE WARNING 'T-12 FAIL  v=% status=% (expected 1/invited)', v, vstatus;
  END IF;
END $$;

-- ── T-13: user_c (invited) cannot see user_a member row ─────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE user_id = current_setting('test.uid_a')::uuid;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-13','PASS','invited user_c cannot see peer member rows');
    RAISE NOTICE 'T-13 PASS  invited user_c cannot see peer member rows';
  ELSE
    INSERT INTO _t_results VALUES ('T-13','FAIL',format('user_c sees %s rows for user_a (expected 0)',v));
    RAISE WARNING 'T-13 FAIL  user_c sees % rows for user_a (expected 0)', v;
  END IF;
END $$;

-- ── T-14: user_a (active owner) sees all EA member rows ─────────
-- EA has 2 provisioned members: user_a (owner/active) + user_c (viewer/invited)
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.ea_id')::uuid;
  RESET ROLE;
  IF v = 2 THEN
    INSERT INTO _t_results VALUES ('T-14','PASS','active user_a sees all 2 EA member rows');
    RAISE NOTICE 'T-14 PASS  active user_a sees all 2 EA member rows';
  ELSE
    INSERT INTO _t_results VALUES ('T-14','FAIL',format('user_a sees %s EA member rows (expected 2)',v));
    RAISE WARNING 'T-14 FAIL  user_a sees % EA member rows (expected 2)', v;
  END IF;
END $$;

-- ── T-15: user_a sees 0 EB member rows ──────────────────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.eb_id')::uuid;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-15','PASS','user_a sees 0 EB member rows (cross-tenant isolation)');
    RAISE NOTICE 'T-15 PASS  user_a sees 0 EB member rows (cross-tenant isolation)';
  ELSE
    INSERT INTO _t_results VALUES ('T-15','FAIL',format('user_a sees %s EB member rows — ISOLATION BREACH',v));
    RAISE WARNING 'T-15 FAIL  user_a sees % EB member rows — ISOLATION BREACH', v;
  END IF;
END $$;

-- ── T-16: user_b sees own EB member row ─────────────────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_b')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.eb_id')::uuid;
  RESET ROLE;
  IF v = 1 THEN
    INSERT INTO _t_results VALUES ('T-16','PASS','user_b sees 1 EB member row (own)');
    RAISE NOTICE 'T-16 PASS  user_b sees 1 EB member row (own)';
  ELSE
    INSERT INTO _t_results VALUES ('T-16','FAIL',format('user_b sees %s EB member rows (expected 1)',v));
    RAISE WARNING 'T-16 FAIL  user_b sees % EB member rows (expected 1)', v;
  END IF;
END $$;

-- ── T-17: user_b sees 0 EA member rows ──────────────────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_b')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.ea_id')::uuid;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-17','PASS','user_b sees 0 EA member rows (cross-tenant isolation)');
    RAISE NOTICE 'T-17 PASS  user_b sees 0 EA member rows (cross-tenant isolation)';
  ELSE
    INSERT INTO _t_results VALUES ('T-17','FAIL',format('user_b sees %s EA member rows — ISOLATION BREACH',v));
    RAISE WARNING 'T-17 FAIL  user_b sees % EA member rows — ISOLATION BREACH', v;
  END IF;
END $$;

-- ── T-18: admin sees all 3 provisioned member rows ───────────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_admin')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id IN (current_setting('test.ea_id')::uuid,
                            current_setting('test.eb_id')::uuid);
  RESET ROLE;
  IF v = 3 THEN
    INSERT INTO _t_results VALUES ('T-18','PASS','admin sees all 3 provisioned member rows');
    RAISE NOTICE 'T-18 PASS  admin sees all 3 provisioned member rows';
  ELSE
    INSERT INTO _t_results VALUES ('T-18','FAIL',format('admin sees %s member rows (expected 3)',v));
    RAISE WARNING 'T-18 FAIL  admin sees % member rows (expected 3)', v;
  END IF;
END $$;

-- ── T-19: authenticated INSERT into enterprise_accounts blocked ──
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_accounts (name, status)
      VALUES ('Injection Attempt', 'active');
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-19','FAIL','INSERT enterprise_accounts was not blocked');
    RAISE WARNING 'T-19 FAIL  INSERT enterprise_accounts was not blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-19','PASS','INSERT enterprise_accounts blocked: insufficient_privilege');
      RAISE NOTICE 'T-19 PASS  INSERT enterprise_accounts blocked: insufficient_privilege';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-19','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-19 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-20: anon INSERT into enterprise_accounts blocked ───────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.enterprise_accounts (name, status)
      VALUES ('Anon Injection', 'active');
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-20','FAIL','anon INSERT enterprise_accounts was not blocked');
    RAISE WARNING 'T-20 FAIL  anon INSERT enterprise_accounts was not blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-20','PASS','anon INSERT enterprise_accounts blocked: insufficient_privilege');
      RAISE NOTICE 'T-20 PASS  anon INSERT enterprise_accounts blocked: insufficient_privilege';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-20','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-20 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-21: authenticated INSERT into enterprise_members blocked ───
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_members
      (enterprise_id, user_id, role, status)
      VALUES (current_setting('test.ea_id')::uuid,
              current_setting('test.uid_b')::uuid, 'viewer', 'active');
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-21','FAIL','INSERT enterprise_members was not blocked');
    RAISE WARNING 'T-21 FAIL  INSERT enterprise_members was not blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-21','PASS','INSERT enterprise_members blocked: insufficient_privilege');
      RAISE NOTICE 'T-21 PASS  INSERT enterprise_members blocked: insufficient_privilege';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-21','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-21 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-22: authenticated UPDATE enterprise_members blocked ────────
-- PASS: SQLSTATE 42501 (insufficient_privilege) raised
-- PASS: statement completes with GET DIAGNOSTICS ROW_COUNT = 0
--       (RLS default-deny: no FOR UPDATE policy → zero candidate rows
--        → privilege check never fires → 0 rows affected, no exception)
-- FAIL: ROW_COUNT > 0 (row was actually modified — real defect)
-- INCONCLUSIVE: any other unexpected exception
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_members
      SET role = 'admin'
      WHERE user_id = current_setting('test.uid_a')::uuid;
    GET DIAGNOSTICS v = ROW_COUNT;
    RESET ROLE;
    IF v = 0 THEN
      INSERT INTO _t_results VALUES ('T-22','PASS',
        'UPDATE enterprise_members blocked: ROW_COUNT=0 (RLS default-deny)');
      RAISE NOTICE 'T-22 PASS  UPDATE enterprise_members blocked: ROW_COUNT=0 (RLS default-deny)';
    ELSE
      INSERT INTO _t_results VALUES ('T-22','FAIL',
        format('UPDATE enterprise_members affected %s row(s) — NOT BLOCKED', v));
      RAISE WARNING 'T-22 FAIL  UPDATE enterprise_members affected % row(s) — NOT BLOCKED', v;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-22','PASS',
        'UPDATE enterprise_members blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-22 PASS  UPDATE enterprise_members blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-22','INCONCLUSIVE',
        format('unexpected: %s %s', SQLSTATE, SQLERRM));
      RAISE WARNING 'T-22 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-23: authenticated DELETE from enterprise_members blocked ───
-- PASS: SQLSTATE 42501 (insufficient_privilege) raised
-- PASS: statement completes with GET DIAGNOSTICS ROW_COUNT = 0
--       (RLS default-deny: no FOR DELETE policy → zero candidate rows
--        → privilege check never fires → 0 rows deleted, no exception)
-- FAIL: ROW_COUNT > 0 (row was actually deleted — real defect)
-- INCONCLUSIVE: any other unexpected exception
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_members
      WHERE user_id = current_setting('test.uid_a')::uuid;
    GET DIAGNOSTICS v = ROW_COUNT;
    RESET ROLE;
    IF v = 0 THEN
      INSERT INTO _t_results VALUES ('T-23','PASS',
        'DELETE enterprise_members blocked: ROW_COUNT=0 (RLS default-deny)');
      RAISE NOTICE 'T-23 PASS  DELETE enterprise_members blocked: ROW_COUNT=0 (RLS default-deny)';
    ELSE
      INSERT INTO _t_results VALUES ('T-23','FAIL',
        format('DELETE enterprise_members removed %s row(s) — NOT BLOCKED', v));
      RAISE WARNING 'T-23 FAIL  DELETE enterprise_members removed % row(s) — NOT BLOCKED', v;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-23','PASS',
        'DELETE enterprise_members blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-23 PASS  DELETE enterprise_members blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-23','INCONCLUSIVE',
        format('unexpected: %s %s', SQLSTATE, SQLERRM));
      RAISE WARNING 'T-23 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-24: authenticated DELETE from enterprise_accounts blocked ──
-- PASS: SQLSTATE 42501 (insufficient_privilege) raised
-- PASS: statement completes with GET DIAGNOSTICS ROW_COUNT = 0
--       (RLS default-deny: no FOR DELETE policy → zero candidate rows
--        → privilege check never fires → 0 rows deleted, no exception)
-- FAIL: ROW_COUNT > 0 (row was actually deleted — real defect)
-- INCONCLUSIVE: any other unexpected exception
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_accounts
      WHERE id = current_setting('test.ea_id')::uuid;
    GET DIAGNOSTICS v = ROW_COUNT;
    RESET ROLE;
    IF v = 0 THEN
      INSERT INTO _t_results VALUES ('T-24','PASS',
        'DELETE enterprise_accounts blocked: ROW_COUNT=0 (RLS default-deny)');
      RAISE NOTICE 'T-24 PASS  DELETE enterprise_accounts blocked: ROW_COUNT=0 (RLS default-deny)';
    ELSE
      INSERT INTO _t_results VALUES ('T-24','FAIL',
        format('DELETE enterprise_accounts removed %s row(s) — NOT BLOCKED', v));
      RAISE WARNING 'T-24 FAIL  DELETE enterprise_accounts removed % row(s) — NOT BLOCKED', v;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-24','PASS',
        'DELETE enterprise_accounts blocked: insufficient_privilege (42501)');
      RAISE NOTICE 'T-24 PASS  DELETE enterprise_accounts blocked: insufficient_privilege (42501)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-24','INCONCLUSIVE',
        format('unexpected: %s %s', SQLSTATE, SQLERRM));
      RAISE WARNING 'T-24 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-25: user_a UPDATE name on own enterprise succeeds ──────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  UPDATE public.enterprise_accounts
    SET name = 'Test Enterprise Alpha Renamed'
    WHERE id = current_setting('test.ea_id')::uuid;
  GET DIAGNOSTICS v = ROW_COUNT;
  RESET ROLE;
  IF v = 1 THEN
    INSERT INTO _t_results VALUES ('T-25','PASS','user_a UPDATE name on own enterprise: 1 row updated');
    RAISE NOTICE 'T-25 PASS  user_a UPDATE name on own enterprise: 1 row updated';
  ELSE
    INSERT INTO _t_results VALUES ('T-25','FAIL',format('UPDATE returned %s rows (expected 1)',v));
    RAISE WARNING 'T-25 FAIL  UPDATE returned % rows (expected 1)', v;
  END IF;
END $$;

-- ── T-26: user_a cross-tenant UPDATE name on EB — 0 rows ─────────
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  UPDATE public.enterprise_accounts
    SET name = 'Cross-Tenant Hijack Attempt'
    WHERE id = current_setting('test.eb_id')::uuid;
  GET DIAGNOSTICS v = ROW_COUNT;
  RESET ROLE;
  IF v = 0 THEN
    INSERT INTO _t_results VALUES ('T-26','PASS','cross-tenant UPDATE on EB: 0 rows (RLS blocked)');
    RAISE NOTICE 'T-26 PASS  cross-tenant UPDATE on EB: 0 rows (RLS blocked)';
  ELSE
    INSERT INTO _t_results VALUES ('T-26','FAIL',format('cross-tenant UPDATE affected %s rows — ISOLATION BREACH',v));
    RAISE WARNING 'T-26 FAIL  cross-tenant UPDATE affected % rows — ISOLATION BREACH', v;
  END IF;
END $$;

-- ── T-27: user_a UPDATE status on own EA — column grant blocks ───
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_accounts
      SET status = 'closed'
      WHERE id = current_setting('test.ea_id')::uuid;
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-27','FAIL','UPDATE status not blocked by column grant');
    RAISE WARNING 'T-27 FAIL  UPDATE status not blocked by column grant';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-27','PASS','UPDATE status blocked: insufficient_privilege (column grant)');
      RAISE NOTICE 'T-27 PASS  UPDATE status blocked: insufficient_privilege (column grant)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-27','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-27 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-28: user_b UPDATE id on EB — column grant blocks ───────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_b')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_accounts
      SET id = gen_random_uuid()
      WHERE id = current_setting('test.eb_id')::uuid;
    RESET ROLE;
    INSERT INTO _t_results VALUES ('T-28','FAIL','UPDATE id not blocked by column grant');
    RAISE WARNING 'T-28 FAIL  UPDATE id not blocked by column grant';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-28','PASS','UPDATE id blocked: insufficient_privilege (column grant)');
      RAISE NOTICE 'T-28 PASS  UPDATE id blocked: insufficient_privilege (column grant)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-28','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-28 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-29: RPC as anon — unauthenticated or privilege blocked ─────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT public.create_enterprise_account('Test Anon RPC') INTO v;
    RESET ROLE;
    IF (v->>'ok')::boolean = false AND v->>'reason' = 'unauthenticated' THEN
      INSERT INTO _t_results VALUES ('T-29','PASS',format('anon RPC returns unauthenticated: %s',v));
      RAISE NOTICE 'T-29 PASS  anon RPC returns unauthenticated: %', v;
    ELSE
      INSERT INTO _t_results VALUES ('T-29','FAIL',format('expected unauthenticated, got: %s',v));
      RAISE WARNING 'T-29 FAIL  expected unauthenticated, got: %', v;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-29','PASS','anon RPC blocked at privilege layer (no EXECUTE to anon)');
      RAISE NOTICE 'T-29 PASS  anon RPC blocked at privilege layer (no EXECUTE to anon)';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _t_results VALUES ('T-29','INCONCLUSIVE',format('unexpected: %s %s',SQLSTATE,SQLERRM));
      RAISE WARNING 'T-29 INCONCLUSIVE  unexpected: % %', SQLSTATE, SQLERRM;
  END;
END $$;

-- ── T-30: RPC user_orphan_v2 — user_not_found ───────────────────
-- uid_orphan: synthetic UUID only.
-- No auth.users row. No public.users row. No public.profiles row.
-- auth.uid() returns the UUID; Guard 2 finds nothing in public.users.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_orphan')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account('Test Orphan RPC') INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = false AND v->>'reason' = 'user_not_found' THEN
    INSERT INTO _t_results VALUES ('T-30','PASS',format('orphan caller returns user_not_found: %s',v));
    RAISE NOTICE 'T-30 PASS  orphan caller returns user_not_found: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-30','FAIL',format('expected user_not_found, got: %s',v));
    RAISE WARNING 'T-30 FAIL  expected user_not_found, got: %', v;
  END IF;
END $$;

-- ── T-31: RPC user_a — already_owner ────────────────────────────
-- user_a already holds an active owner membership in EA.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account('Test Second Enterprise A') INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = false AND v->>'reason' = 'already_owner' THEN
    INSERT INTO _t_results VALUES ('T-31','PASS',format('already_owner guard fires for user_a: %s',v));
    RAISE NOTICE 'T-31 PASS  already_owner guard fires for user_a: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-31','FAIL',format('expected already_owner, got: %s',v));
    RAISE WARNING 'T-31 FAIL  expected already_owner, got: %', v;
  END IF;
END $$;

-- ── T-32: RPC empty name — name_required ────────────────────────
-- user_c has no owner membership yet; name validation fires first.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account('') INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = false AND v->>'reason' = 'name_required' THEN
    INSERT INTO _t_results VALUES ('T-32','PASS',format('empty name returns name_required: %s',v));
    RAISE NOTICE 'T-32 PASS  empty name returns name_required: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-32','FAIL',format('expected name_required, got: %s',v));
    RAISE WARNING 'T-32 FAIL  expected name_required, got: %', v;
  END IF;
END $$;

-- ── T-33: RPC 201-char name — name_too_long ─────────────────────
DO $$
DECLARE v jsonb; long_name text;
BEGIN
  long_name := repeat('x', 201);
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account(long_name) INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = false AND v->>'reason' = 'name_too_long' THEN
    INSERT INTO _t_results VALUES ('T-33','PASS',format('201-char name returns name_too_long: %s',v));
    RAISE NOTICE 'T-33 PASS  201-char name returns name_too_long: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-33','FAIL',format('expected name_too_long, got: %s',v));
    RAISE WARNING 'T-33 FAIL  expected name_too_long, got: %', v;
  END IF;
END $$;

-- ── T-34: RPC success — user_c creates EC ───────────────────────
-- user_c has no existing owner membership. First valid call must succeed.
-- EC row created inside this transaction; rolled back with everything.
-- ec_id stored in test.ec_id for downstream tests (T-35, T-36).
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account('Test Enterprise Gamma') INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = true AND (v->>'enterprise_id') IS NOT NULL THEN
    PERFORM set_config('test.ec_id', v->>'enterprise_id', true);
    INSERT INTO _t_results VALUES ('T-34','PASS',
      format('user_c RPC success enterprise_id=%s', v->>'enterprise_id'));
    RAISE NOTICE 'T-34 PASS  user_c RPC success: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-34','FAIL',format('expected ok+enterprise_id, got: %s',v));
    RAISE WARNING 'T-34 FAIL  expected ok+enterprise_id, got: %', v;
  END IF;
END $$;

-- ── T-35: RPC double-call user_c — already_owner ────────────────
-- After T-34, user_c holds an active owner membership in EC.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT public.create_enterprise_account('Test Enterprise Gamma 2') INTO v;
  RESET ROLE;
  IF (v->>'ok')::boolean = false AND v->>'reason' = 'already_owner' THEN
    INSERT INTO _t_results VALUES ('T-35','PASS',
      format('user_c second RPC returns already_owner: %s',v));
    RAISE NOTICE 'T-35 PASS  user_c second RPC returns already_owner: %', v;
  ELSE
    INSERT INTO _t_results VALUES ('T-35','FAIL',
      format('expected already_owner on second call, got: %s',v));
    RAISE WARNING 'T-35 FAIL  expected already_owner on second call, got: %', v;
  END IF;
END $$;

-- ── T-36: user_c sees EC only — not EA or EB ─────────────────────
-- user_c is active owner of EC (T-34), invited viewer of EA (not active).
-- ea_members_select requires status='active'; user_c is not active in EA.
-- user_c has no membership in EB.
-- Expected: exactly 1 row, not EA, not EB.
-- COUNT(*) proves exactly 1 row; LIMIT 1 on count=1 is deterministic.
-- Avoids MIN(uuid) which has no default btree ordering in Supabase PostgreSQL.
DO $$
DECLARE v integer; vid uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_accounts;
  SELECT id       INTO vid FROM public.enterprise_accounts LIMIT 1;
  RESET ROLE;
  IF v = 1
    AND vid IS DISTINCT FROM current_setting('test.ea_id')::uuid
    AND vid IS DISTINCT FROM current_setting('test.eb_id')::uuid
  THEN
    INSERT INTO _t_results VALUES ('T-36','PASS',
      format('user_c sees only EC (not EA/EB): id=%s',vid));
    RAISE NOTICE 'T-36 PASS  user_c sees only EC (not EA/EB): id=%', vid;
  ELSE
    INSERT INTO _t_results VALUES ('T-36','FAIL',
      format('user_c sees %s accounts id=%s (EA=%s EB=%s)',
        v, vid,
        current_setting('test.ea_id'),
        current_setting('test.eb_id')));
    RAISE WARNING 'T-36 FAIL  user_c sees % accounts id=% (EA=%,EB=%)',
      v, vid,
      current_setting('test.ea_id'),
      current_setting('test.eb_id');
  END IF;
END $$;

-- ── T-37: user_c sees own invited EA row via em_self_select ──────
-- em_self_select: user_id = auth.uid() — no status filter.
-- user_c's invited row in EA must be visible despite not being active.
DO $$
DECLARE v integer; vstatus text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_c')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*), MIN(status) INTO v, vstatus
    FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.ea_id')::uuid
      AND user_id       = current_setting('test.uid_c')::uuid;
  RESET ROLE;
  IF v = 1 AND vstatus = 'invited' THEN
    INSERT INTO _t_results VALUES ('T-37','PASS',
      'user_c sees own invited EA row via em_self_select');
    RAISE NOTICE 'T-37 PASS  user_c sees own invited EA row via em_self_select';
  ELSE
    INSERT INTO _t_results VALUES ('T-37','FAIL',
      format('v=%s status=%s (expected 1/invited)',v,vstatus));
    RAISE WARNING 'T-37 FAIL  v=% status=% (expected 1/invited)', v, vstatus;
  END IF;
END $$;

-- ── T-38: user_a (active owner EA) sees all 2 EA member rows ─────
-- em_members_select: _fixeo_is_enterprise_member(ea_id) = true for user_a.
-- EA provisioned with 2 members: user_a (owner/active) + user_c (viewer/invited).
DO $$
DECLARE v integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}',
      current_setting('test.uid_a')), true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v FROM public.enterprise_members
    WHERE enterprise_id = current_setting('test.ea_id')::uuid;
  RESET ROLE;
  IF v = 2 THEN
    INSERT INTO _t_results VALUES ('T-38','PASS',
      'user_a sees all 2 EA member rows (owner+invited)');
    RAISE NOTICE 'T-38 PASS  user_a sees all 2 EA member rows (owner+invited)';
  ELSE
    INSERT INTO _t_results VALUES ('T-38','FAIL',
      format('user_a sees %s EA member rows (expected 2)',v));
    RAISE WARNING 'T-38 FAIL  user_a sees % EA member rows (expected 2)', v;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- PHASE 4: Machine-readable results
-- Both SELECTs appear in the Supabase SQL Editor Results panel.
-- _t_results is TEMP (ON COMMIT DROP) — vanishes on ROLLBACK.
-- ════════════════════════════════════════════════════════════════

-- Detail grid: one row per test, ordered.
SELECT
  test_id,
  result,
  detail
FROM _t_results
ORDER BY test_id;

-- Aggregate summary.
SELECT
  SUM(CASE WHEN result = 'PASS'         THEN 1 ELSE 0 END)  AS passed,
  SUM(CASE WHEN result = 'FAIL'         THEN 1 ELSE 0 END)  AS failed,
  SUM(CASE WHEN result = 'INCONCLUSIVE' THEN 1 ELSE 0 END)  AS inconclusive,
  COUNT(*)                                                    AS total,
  CASE
    WHEN SUM(CASE WHEN result = 'FAIL'         THEN 1 ELSE 0 END) = 0
     AND SUM(CASE WHEN result = 'INCONCLUSIVE' THEN 1 ELSE 0 END) = 0
    THEN 'ALL PASSED — safe to proceed to Phase 1F'
    ELSE 'FAILURES DETECTED — do not proceed to Phase 1F'
  END AS verdict
FROM _t_results;

-- ── UNCONDITIONAL ROLLBACK ───────────────────────────────────────
-- Last executable statement.
-- Atomically removes all rows inserted during this transaction:
--   auth.users       (4 rows: uid_a, uid_b, uid_c, uid_admin)
--   public.users     (4 rows: auto-created by handle_new_user())
--   public.profiles  (4 rows: auto-created by handle_new_user())
--   enterprise_accounts  (2 provisioned + 1 from T-34 RPC = 3 rows)
--   enterprise_members   (3 provisioned + 1 from T-34 RPC = 4 rows)
--   _t_results       (TEMP table, also dropped by ON COMMIT DROP)
-- uid_orphan was never inserted — no cleanup required for it.
-- Zero persistent test data remains after this line executes.
ROLLBACK;
