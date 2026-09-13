-- ════════════════════════════════════════════════════════════
-- BP08C Site Audit Wiring — SQL Tests
-- File: tests/enterprise/bp08c-site-audit-tests.sql
-- Sprint: BP08C/D/E Audit Patch
--
-- Tests that fixeo_private._eal_append() is called correctly
-- by update_enterprise_site() and set_enterprise_site_status()
-- after 7c15a5 is applied.
--
-- STRUCTURE
--   A (static):  structural / precondition checks
--   B (isolated): update_enterprise_site audit tests
--   C (isolated): set_enterprise_site_status audit tests
--   D (isolated): negative cases — no event on no-op / failure
--   E (isolated): metadata correctness
--   F (static):  audit table immutability to authenticated
--   Z (static):  summary
--
-- CONVENTIONS
--   • Every behavioral test: BEGIN / ... / ROLLBACK
--   • Zero bare COMMIT in behavioral tests
--   • Auth mocked via set_config('request.jwt.claims', ...)
--   • All identifiers schema-qualified
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- SECTION A — Structural checks (static, single DO block)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_pass  int := 0;
  v_fail  int := 0;
  v_label text;
  v_ok    boolean;

  PROCEDURE chk(label text, cond boolean) IS
  BEGIN
    IF cond THEN
      RAISE NOTICE 'PASS  %', label;
      v_pass := v_pass + 1;
    ELSE
      RAISE NOTICE 'FAIL  %', label;
      v_fail := v_fail + 1;
    END IF;
  END;
BEGIN

  -- A-01: 7c15a5 migration file exists (presence check via pg_catalog is N/A;
  --       we verify the RPCs are SECURITY DEFINER as the migration applied them)
  v_label := 'A-01: update_enterprise_site is SECURITY DEFINER';
  SELECT (p.prosecdef = true)
  INTO v_ok
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_enterprise_site'
  LIMIT 1;
  chk(v_label, COALESCE(v_ok, false));

  -- A-02: set_enterprise_site_status is SECURITY DEFINER
  v_label := 'A-02: set_enterprise_site_status is SECURITY DEFINER';
  SELECT (p.prosecdef = true)
  INTO v_ok
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_enterprise_site_status'
  LIMIT 1;
  chk(v_label, COALESCE(v_ok, false));

  -- A-03: fixeo_private._eal_append exists
  v_label := 'A-03: fixeo_private._eal_append exists';
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private' AND p.proname = '_eal_append'
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  -- A-04: enterprise_audit_log exists
  v_label := 'A-04: enterprise_audit_log table exists';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_audit_log'
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  -- A-05: site_updated is a valid action_type in CHECK constraint
  v_label := 'A-05: site_updated in action_type CHECK';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND check_clause LIKE '%site_updated%'
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  -- A-06: site_status_changed is a valid action_type in CHECK constraint
  v_label := 'A-06: site_status_changed in action_type CHECK';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND check_clause LIKE '%site_status_changed%'
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  -- A-07: update_enterprise_site search_path = ''
  v_label := 'A-07: update_enterprise_site SET search_path = ''''';
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_enterprise_site'
      AND 'search_path=' = ANY(p.proconfig)
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  -- A-08: set_enterprise_site_status search_path = ''
  v_label := 'A-08: set_enterprise_site_status SET search_path = ''''';
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_enterprise_site_status'
      AND 'search_path=' = ANY(p.proconfig)
  ) INTO v_ok;
  chk(v_label, COALESCE(v_ok, false));

  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'SECTION A: % pass, % fail', v_pass, v_fail;
  RAISE NOTICE '────────────────────────────────────────────────────────';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION B — update_enterprise_site audit tests
-- ════════════════════════════════════════════════════════════

-- B-01: owner site update creates exactly one site_updated event
DO $$
DECLARE
  v_acct_id   uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_owner_id  uuid := gen_random_uuid();
  v_res       jsonb;
  v_cnt       int;
BEGIN
  -- setup
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo B01');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Old Site Name', 'Old City', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'New Site Name', 'New City');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_updated'
    AND target_id     = v_site_id;

  IF v_res->>'ok' = 'true' AND v_cnt = 1 THEN
    RAISE NOTICE 'PASS  B-01: owner site update creates exactly one site_updated event';
  ELSE
    RAISE NOTICE 'FAIL  B-01: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- B-02: admin site update creates exactly one site_updated event
DO $$
DECLARE
  v_acct_id   uuid := gen_random_uuid();
  v_site_id   uuid := gen_random_uuid();
  v_admin_id  uuid := gen_random_uuid();
  v_res       jsonb;
  v_cnt       int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_admin_id, v_admin_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_admin_id, v_admin_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo B02');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_admin_id, 'admin', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site B02', 'City B02', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Site B02 Updated', 'City B02 Updated');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_updated'
    AND target_id     = v_site_id;

  IF v_res->>'ok' = 'true' AND v_cnt = 1 THEN
    RAISE NOTICE 'PASS  B-02: admin site update creates exactly one site_updated event';
  ELSE
    RAISE NOTICE 'FAIL  B-02: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- B-03: no_change update creates zero new audit events
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_cnt      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo B03');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Unchanged Site', 'Unchanged City', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  -- Call with same values → no_change
  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Unchanged Site', 'Unchanged City');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_updated'
    AND target_id     = v_site_id;

  IF v_res->>'reason' = 'no_change' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  B-03: no_change update creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  B-03: reason=%, audit_count=%', v_res->>'reason', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION C — set_enterprise_site_status audit tests
-- ════════════════════════════════════════════════════════════

-- C-01: deactivate creates exactly one site_status_changed event
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_cnt      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo C01');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site C01', 'City C01', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.set_enterprise_site_status(v_acct_id, v_site_id, 'inactive');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_status_changed'
    AND target_id     = v_site_id;

  IF v_res->>'ok' = 'true' AND v_cnt = 1 THEN
    RAISE NOTICE 'PASS  C-01: deactivate creates exactly one site_status_changed event';
  ELSE
    RAISE NOTICE 'FAIL  C-01: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- C-02: reactivate creates exactly one site_status_changed event
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_cnt      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo C02');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  -- Start inactive
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site C02', 'City C02', 'inactive');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.set_enterprise_site_status(v_acct_id, v_site_id, 'active');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_status_changed'
    AND target_id     = v_site_id;

  IF v_res->>'ok' = 'true' AND v_cnt = 1 THEN
    RAISE NOTICE 'PASS  C-02: reactivate creates exactly one site_status_changed event';
  ELSE
    RAISE NOTICE 'FAIL  C-02: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- C-03: no_change status creates zero audit events
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_cnt      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo C03');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site C03', 'City C03', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  -- Already active → no_change
  v_res := public.set_enterprise_site_status(v_acct_id, v_site_id, 'active');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id
    AND action_type   = 'site_status_changed'
    AND target_id     = v_site_id;

  IF v_res->>'reason' = 'no_change' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  C-03: no_change status creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  C-03: reason=%, audit_count=%', v_res->>'reason', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION D — No-event on failure / unauthorized
-- ════════════════════════════════════════════════════════════

-- D-01: unauthorized caller (reporter) creates zero audit events on update
DO $$
DECLARE
  v_acct_id    uuid := gen_random_uuid();
  v_site_id    uuid := gen_random_uuid();
  v_reporter_id uuid := gen_random_uuid();
  v_res        jsonb;
  v_cnt        int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_reporter_id, v_reporter_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_reporter_id, v_reporter_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo D01');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_reporter_id, 'reporter', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site D01', 'City D01', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_reporter_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Hacked Name', 'Hacked City');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_updated';

  IF v_res->>'reason' = 'forbidden' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  D-01: unauthorized (reporter) update creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  D-01: reason=%, audit_count=%', v_res->>'reason', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- D-02: unauthorized caller (reporter) creates zero audit events on status change
DO $$
DECLARE
  v_acct_id    uuid := gen_random_uuid();
  v_site_id    uuid := gen_random_uuid();
  v_reporter_id uuid := gen_random_uuid();
  v_res        jsonb;
  v_cnt        int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_reporter_id, v_reporter_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_reporter_id, v_reporter_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo D02');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_reporter_id, 'reporter', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site D02', 'City D02', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_reporter_id), true);

  v_res := public.set_enterprise_site_status(v_acct_id, v_site_id, 'inactive');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_status_changed';

  IF v_res->>'reason' = 'forbidden' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  D-02: unauthorized (reporter) status change creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  D-02: reason=%, audit_count=%', v_res->>'reason', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- D-03: wrong-tenant caller creates zero audit events on update
DO $$
DECLARE
  v_acct_a    uuid := gen_random_uuid();
  v_acct_b    uuid := gen_random_uuid();
  v_site_b    uuid := gen_random_uuid();
  v_owner_a   uuid := gen_random_uuid();
  v_res       jsonb;
  v_cnt       int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_a, v_owner_a||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_a, v_owner_a||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_a, 'TenantA D03');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_b, 'TenantB D03');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_a, v_owner_a, 'owner', 'active');
  -- Site belongs to tenant B
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_b, v_acct_b, 'Site TenantB D03', 'City', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_a), true);

  -- caller passes acct_b but is member of acct_a only
  v_res := public.update_enterprise_site(v_acct_b, v_site_b, 'Hijacked', 'Hijacked');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE (enterprise_id = v_acct_a OR enterprise_id = v_acct_b)
    AND action_type = 'site_updated';

  IF v_res->>'ok' = 'false' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  D-03: wrong-tenant update creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  D-03: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- D-04: wrong-tenant caller creates zero audit events on status change
DO $$
DECLARE
  v_acct_a    uuid := gen_random_uuid();
  v_acct_b    uuid := gen_random_uuid();
  v_site_b    uuid := gen_random_uuid();
  v_owner_a   uuid := gen_random_uuid();
  v_res       jsonb;
  v_cnt       int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_a, v_owner_a||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_a, v_owner_a||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_a, 'TenantA D04');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_b, 'TenantB D04');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_a, v_owner_a, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_b, v_acct_b, 'Site TenantB D04', 'City', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_a), true);

  v_res := public.set_enterprise_site_status(v_acct_b, v_site_b, 'inactive');

  SELECT COUNT(*) INTO v_cnt
  FROM public.enterprise_audit_log
  WHERE (enterprise_id = v_acct_a OR enterprise_id = v_acct_b)
    AND action_type = 'site_status_changed';

  IF v_res->>'ok' = 'false' AND v_cnt = 0 THEN
    RAISE NOTICE 'PASS  D-04: wrong-tenant status change creates zero audit events';
  ELSE
    RAISE NOTICE 'FAIL  D-04: ok=%, audit_count=%', v_res->>'ok', v_cnt;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION E — Metadata correctness
-- ════════════════════════════════════════════════════════════

-- E-01: target_id equals site id for site_updated event
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_tid      uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo E01');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site E01', 'City E01', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Site E01 New', 'City E01');

  SELECT target_id INTO v_tid
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_updated'
  LIMIT 1;

  IF v_tid = v_site_id THEN
    RAISE NOTICE 'PASS  E-01: target_id equals site id';
  ELSE
    RAISE NOTICE 'FAIL  E-01: target_id=%, expected=%', v_tid, v_site_id;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- E-02: actor_user_id equals auth.uid() for site_updated event
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_actor    uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo E02');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site E02', 'City E02', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Site E02 New', 'City E02');

  SELECT actor_user_id INTO v_actor
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_updated'
  LIMIT 1;

  IF v_actor = v_owner_id THEN
    RAISE NOTICE 'PASS  E-02: actor_user_id equals auth.uid()';
  ELSE
    RAISE NOTICE 'FAIL  E-02: actor=%, expected=%', v_actor, v_owner_id;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- E-03: metadata old/new name values are correct for site_updated
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_meta     jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo E03');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Original Name', 'Original City', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Updated Name', 'Updated City');

  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_updated'
  LIMIT 1;

  IF (v_meta->>'old_name') = 'Original Name'
  AND (v_meta->>'new_name') = 'Updated Name'
  AND (v_meta->>'old_city') = 'Original City'
  AND (v_meta->>'new_city') = 'Updated City'
  THEN
    RAISE NOTICE 'PASS  E-03: metadata old/new name and city values correct';
  ELSE
    RAISE NOTICE 'FAIL  E-03: metadata=%', v_meta;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- E-04: metadata old/new status values correct for site_status_changed
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_meta     jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo E04');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site E04', 'City E04', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.set_enterprise_site_status(v_acct_id, v_site_id, 'inactive');

  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_status_changed'
  LIMIT 1;

  IF (v_meta->>'old_status') = 'active'
  AND (v_meta->>'new_status') = 'inactive'
  THEN
    RAISE NOTICE 'PASS  E-04: metadata old_status=active new_status=inactive correct';
  ELSE
    RAISE NOTICE 'FAIL  E-04: metadata=%', v_meta;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;

-- E-05: metadata contains no email/token/phone fields (PII check)
DO $$
DECLARE
  v_acct_id  uuid := gen_random_uuid();
  v_site_id  uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_res      jsonb;
  v_meta     jsonb;
  v_keys     text[];
  v_bad_key  text;
  v_found    boolean := false;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.users (id, email) VALUES (v_owner_id, v_owner_id||'@test.invalid');
  INSERT INTO public.enterprise_accounts (id, name) VALUES (v_acct_id, 'AuditTestCo E05');
  INSERT INTO public.enterprise_members (id, enterprise_id, user_id, role, status)
    VALUES (gen_random_uuid(), v_acct_id, v_owner_id, 'owner', 'active');
  INSERT INTO public.enterprise_sites (id, enterprise_id, name, city, status)
    VALUES (v_site_id, v_acct_id, 'Site E05', 'City E05', 'active');

  PERFORM set_config('request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}', v_owner_id), true);

  v_res := public.update_enterprise_site(v_acct_id, v_site_id, 'Site E05 Updated', 'City E05');

  SELECT metadata INTO v_meta
  FROM public.enterprise_audit_log
  WHERE enterprise_id = v_acct_id AND action_type = 'site_updated'
  LIMIT 1;

  -- Check that none of the forbidden PII keys appear
  FOREACH v_bad_key IN ARRAY ARRAY['email','token','phone','password','secret','jwt','auth']
  LOOP
    IF v_meta ? v_bad_key THEN
      v_found := true;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'PASS  E-05: metadata contains no PII/token keys';
  ELSE
    RAISE NOTICE 'FAIL  E-05: metadata contains forbidden key: %', v_meta;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  ROLLBACK;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION F — Audit table immutability to authenticated
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_pass  int := 0;
  v_fail  int := 0;

  PROCEDURE chk(label text, cond boolean) IS
  BEGIN
    IF cond THEN RAISE NOTICE 'PASS  %', label; v_pass := v_pass + 1;
    ELSE RAISE NOTICE 'FAIL  %', label; v_fail := v_fail + 1;
    END IF;
  END;

  v_has_insert  boolean;
  v_has_update  boolean;
  v_has_delete  boolean;
BEGIN

  -- F-01: authenticated has no INSERT on enterprise_audit_log
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema  = 'public'
      AND table_name    = 'enterprise_audit_log'
      AND grantee       = 'authenticated'
      AND privilege_type = 'INSERT'
  ) INTO v_has_insert;
  chk('F-01: authenticated has no INSERT on enterprise_audit_log', NOT COALESCE(v_has_insert, false));

  -- F-02: authenticated has no UPDATE on enterprise_audit_log
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema  = 'public'
      AND table_name    = 'enterprise_audit_log'
      AND grantee       = 'authenticated'
      AND privilege_type = 'UPDATE'
  ) INTO v_has_update;
  chk('F-02: authenticated has no UPDATE on enterprise_audit_log', NOT COALESCE(v_has_update, false));

  -- F-03: authenticated has no DELETE on enterprise_audit_log
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema  = 'public'
      AND table_name    = 'enterprise_audit_log'
      AND grantee       = 'authenticated'
      AND privilege_type = 'DELETE'
  ) INTO v_has_delete;
  chk('F-03: authenticated has no DELETE on enterprise_audit_log', NOT COALESCE(v_has_delete, false));

  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'SECTION F: % pass, % fail', v_pass, v_fail;
  RAISE NOTICE '────────────────────────────────────────────────────────';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION Z — Summary
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE 'BP08C SITE AUDIT WIRING — TEST SUITE COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'Test cases:';
  RAISE NOTICE '  A-01..A-08  Structural / precondition (8)';
  RAISE NOTICE '  B-01..B-03  update_enterprise_site audit (3)';
  RAISE NOTICE '  C-01..C-03  set_enterprise_site_status audit (3)';
  RAISE NOTICE '  D-01..D-04  No-event on failure/unauthorized (4)';
  RAISE NOTICE '  E-01..E-05  Metadata correctness + PII check (5)';
  RAISE NOTICE '  F-01..F-03  Audit table immutability (3)';
  RAISE NOTICE '  TOTAL: 26 test cases';
  RAISE NOTICE '';
  RAISE NOTICE 'All behavioral tests: BEGIN / ... / ROLLBACK';
  RAISE NOTICE 'Zero bare COMMIT in behavioral tests';
  RAISE NOTICE '════════════════════════════════════════════════════════';
END $$;
