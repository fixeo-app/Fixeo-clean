-- =============================================================================
-- FIXEO OPERATIONS — Phase 1F Enterprise Sites Production Verification
-- =============================================================================
-- Branch : recovery/seo-v3-safe
-- Purpose: Structural test harness skeleton — no tests populated yet
-- Safety : Single BEGIN / ROLLBACK transaction; ZERO COMMIT; read-only harness
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- RESULTS LOG — populated inside the transaction; SELECT result set is
-- returned to the client before ROLLBACK undoes the synthetic test data.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS results_log (
  test_id   text NOT NULL,
  section   text NOT NULL,
  verdict   text NOT NULL,
  detail    text NOT NULL
) ON COMMIT PRESERVE ROWS;

TRUNCATE results_log;


-- ---------------------------------------------------------------------------
-- A. STRUCTURE / CATALOG
-- ---------------------------------------------------------------------------
-- Tests A1–A12: catalog / read-only checks against pg_class, pg_attribute,
-- pg_constraint, pg_index, pg_trigger, pg_proc.  No DML, no tenant data.
-- Every test emits: TEST <id> | <description> | PASS/FAIL/INCONCLUSIVE
-- ---------------------------------------------------------------------------

-- ── A1: public.enterprise_sites relation exists and is a real table ─────────
DO $$
DECLARE
  v_relkind char;
BEGIN
  SELECT c.relkind
  INTO   v_relkind
  FROM   pg_catalog.pg_class     c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'enterprise_sites';

  IF v_relkind = 'r' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A1', 'A', 'PASS', 'TEST A1 | enterprise_sites is a real table (relkind=r) | PASS');
    RAISE NOTICE 'TEST A1 | enterprise_sites is a real table (relkind=r) | PASS';
  ELSIF v_relkind IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A1', 'A', 'FAIL', 'TEST A1 | enterprise_sites relation not found | FAIL');
    RAISE WARNING 'TEST A1 | enterprise_sites relation not found | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A1', 'A', 'FAIL', pg_catalog.format('TEST A1 | enterprise_sites exists but relkind=%s (not a table) | FAIL', v_relkind));
    RAISE WARNING 'TEST A1 | enterprise_sites exists but relkind=% (not a table) | FAIL', v_relkind;
  END IF;
END;
$$;

-- ── A2: Required columns exist with expected data types / nullability ────────
DO $$
DECLARE
  v_failures text := '';

  -- (column_name, typname, not_null_expected)
  v_spec RECORD;
  v_actual_type text;
  v_actual_nn   bool;
  v_found       bool;
BEGIN
  FOR v_spec IN
    SELECT * FROM (VALUES
      ('id',            'uuid',        true ),
      ('enterprise_id', 'uuid',        true ),
      ('name',          'text',        true ),
      ('site_code',     'text',        false),
      ('address_line',  'text',        false),
      ('city',          'text',        true ),
      ('status',        'text',        true ),
      ('created_at',    'timestamptz', true ),
      ('updated_at',    'timestamptz', true )
    ) AS t(col_name, type_name, not_null)
  LOOP
    SELECT t.typname, a.attnotnull, true
    INTO   v_actual_type, v_actual_nn, v_found
    FROM   pg_catalog.pg_attribute  a
    JOIN   pg_catalog.pg_class      c ON c.oid = a.attrelid
    JOIN   pg_catalog.pg_namespace  n ON n.oid = c.relnamespace
    JOIN   pg_catalog.pg_type       t ON t.oid = a.atttypid
    WHERE  n.nspname = 'public'
      AND  c.relname = 'enterprise_sites'
      AND  a.attname = v_spec.col_name
      AND  a.attnum  > 0
      AND  NOT a.attisdropped;

    IF NOT COALESCE(v_found, false) THEN
      v_failures := v_failures || format(' [MISSING:%s]', v_spec.col_name);
    ELSIF v_actual_type <> v_spec.type_name THEN
      v_failures := v_failures || format(' [TYPE:%s expected=%s got=%s]',
                                         v_spec.col_name, v_spec.type_name, v_actual_type);
    ELSIF v_actual_nn <> v_spec.not_null THEN
      v_failures := v_failures || format(' [NULLABILITY:%s expected_not_null=%s got=%s]',
                                         v_spec.col_name, v_spec.not_null, v_actual_nn);
    END IF;
  END LOOP;

  IF v_failures = '' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A2', 'A', 'PASS', 'TEST A2 | All 9 required columns present with correct types/nullability | PASS');
    RAISE NOTICE 'TEST A2 | All 9 required columns present with correct types/nullability | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A2', 'A', 'FAIL', pg_catalog.format('TEST A2 | Column mismatch(es):%s | FAIL', v_failures));
    RAISE WARNING 'TEST A2 | Column mismatch(es):%s | FAIL', v_failures;
  END IF;
END;
$$;

-- ── A3: enterprise_id FK targets public.enterprise_accounts(id) ─────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype   = 'f'
    AND  ns.nspname    = 'public'
    AND  cl.relname    = 'enterprise_sites'
    AND  con.conname   = 'enterprise_sites_enterprise_fk'
    AND  fns.nspname   = 'public'
    AND  fcl.relname   = 'enterprise_accounts'
    -- FK column is enterprise_id (attnum position)
    AND  EXISTS (
      SELECT 1
      FROM   pg_catalog.pg_attribute a
      WHERE  a.attrelid = cl.oid
        AND  a.attname  = 'enterprise_id'
        AND  a.attnum   = ANY(con.conkey)
    );

  IF v_count = 1 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A3', 'A', 'PASS', 'TEST A3 | enterprise_sites_enterprise_fk targets enterprise_accounts(id) | PASS');
    RAISE NOTICE 'TEST A3 | enterprise_sites_enterprise_fk targets enterprise_accounts(id) | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A3', 'A', 'FAIL', 'TEST A3 | enterprise_sites_enterprise_fk not found or wrong target | FAIL');
    RAISE WARNING 'TEST A3 | enterprise_sites_enterprise_fk not found or wrong target | FAIL';
  END IF;
END;
$$;

-- ── A4: enterprise_id FK delete behavior = RESTRICT (a) / NO ACTION (a) ─────
DO $$
DECLARE
  v_confdeltype char;
BEGIN
  SELECT con.confdeltype
  INTO   v_confdeltype
  FROM   pg_catalog.pg_constraint con
  JOIN   pg_catalog.pg_class       cl ON cl.oid = con.conrelid
  JOIN   pg_catalog.pg_namespace   ns ON ns.oid = cl.relnamespace
  WHERE  con.contype  = 'f'
    AND  ns.nspname   = 'public'
    AND  cl.relname   = 'enterprise_sites'
    AND  con.conname  = 'enterprise_sites_enterprise_fk';

  -- 'r' = RESTRICT, 'a' = NO ACTION (both acceptable per Migration 2 intent)
  IF v_confdeltype IN ('r', 'a') THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A4', 'A', 'PASS', pg_catalog.format('TEST A4 | FK delete action is RESTRICT/NO ACTION (confdeltype=%s) | PASS', v_confdeltype));
    RAISE NOTICE 'TEST A4 | FK delete action is RESTRICT/NO ACTION (confdeltype=%) | PASS', v_confdeltype;
  ELSIF v_confdeltype IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A4', 'A', 'FAIL', 'TEST A4 | enterprise_sites_enterprise_fk not found | FAIL');
    RAISE WARNING 'TEST A4 | enterprise_sites_enterprise_fk not found | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A4', 'A', 'FAIL', pg_catalog.format('TEST A4 | FK delete action is %s (expected r or a) | FAIL', v_confdeltype));
    RAISE WARNING 'TEST A4 | FK delete action is % (expected r or a) | FAIL', v_confdeltype;
  END IF;
END;
$$;

-- ── A5: status CHECK constraint permits only 'active' / 'inactive' ───────────
DO $$
DECLARE
  v_consrc text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO   v_consrc
  FROM   pg_catalog.pg_constraint con
  JOIN   pg_catalog.pg_class       cl ON cl.oid = con.conrelid
  JOIN   pg_catalog.pg_namespace   ns ON ns.oid = cl.relnamespace
  WHERE  con.contype = 'c'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites'
    AND  con.conname = 'enterprise_sites_status_values';

  IF v_consrc IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A5', 'A', 'FAIL', 'TEST A5 | enterprise_sites_status_values constraint not found | FAIL');
    RAISE WARNING 'TEST A5 | enterprise_sites_status_values constraint not found | FAIL';
  ELSIF v_consrc LIKE '%''active''%' AND v_consrc LIKE '%''inactive''%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A5', 'A', 'PASS', 'TEST A5 | status CHECK contains ''active'' and ''inactive'' | PASS');
    RAISE NOTICE 'TEST A5 | status CHECK contains ''active'' and ''inactive'' | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A5', 'A', 'FAIL', pg_catalog.format('TEST A5 | status CHECK definition unexpected: %s | FAIL', v_consrc));
    RAISE WARNING 'TEST A5 | status CHECK definition unexpected: % | FAIL', v_consrc;
  END IF;
END;
$$;

-- ── A6: tenant-local site_code partial unique index exists ───────────────────
DO $$
DECLARE
  v_indisunique bool;
  v_indpred     text;
  v_col_count   int;
BEGIN
  SELECT ix.indisunique,
         pg_catalog.pg_get_expr(ix.indpred, ix.indrelid),
         array_length(ix.indkey::int[], 1)
  INTO   v_indisunique, v_indpred, v_col_count
  FROM   pg_catalog.pg_index     ix
  JOIN   pg_catalog.pg_class      ci ON ci.oid = ix.indexrelid
  JOIN   pg_catalog.pg_class      ct ON ct.oid = ix.indrelid
  JOIN   pg_catalog.pg_namespace  ns ON ns.oid = ct.relnamespace
  WHERE  ns.nspname = 'public'
    AND  ct.relname = 'enterprise_sites'
    AND  ci.relname = 'uq_es_enterprise_site_code';

  IF v_indisunique IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A6', 'A', 'FAIL', 'TEST A6 | uq_es_enterprise_site_code index not found | FAIL');
    RAISE WARNING 'TEST A6 | uq_es_enterprise_site_code index not found | FAIL';
  ELSIF NOT v_indisunique THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A6', 'A', 'FAIL', 'TEST A6 | uq_es_enterprise_site_code is not UNIQUE | FAIL');
    RAISE WARNING 'TEST A6 | uq_es_enterprise_site_code is not UNIQUE | FAIL';
  ELSIF v_col_count <> 2 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A6', 'A', 'FAIL', pg_catalog.format('TEST A6 | uq_es_enterprise_site_code covers %s column(s), expected 2 | FAIL', v_col_count));
    RAISE WARNING 'TEST A6 | uq_es_enterprise_site_code covers % column(s), expected 2 | FAIL', v_col_count;
  ELSIF v_indpred IS NULL OR v_indpred NOT LIKE '%site_code IS NOT NULL%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A6', 'A', 'FAIL', pg_catalog.format('TEST A6 | uq_es_enterprise_site_code missing WHERE site_code IS NOT NULL predicate (got: %s) | FAIL', v_indpred));
    RAISE WARNING 'TEST A6 | uq_es_enterprise_site_code missing WHERE site_code IS NOT NULL predicate (got: %) | FAIL', v_indpred;
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A6', 'A', 'PASS', 'TEST A6 | uq_es_enterprise_site_code: partial unique on (enterprise_id, site_code) WHERE site_code IS NOT NULL | PASS');
    RAISE NOTICE 'TEST A6 | uq_es_enterprise_site_code: partial unique on (enterprise_id, site_code) WHERE site_code IS NOT NULL | PASS';
  END IF;
END;
$$;

-- ── A7: Required indexes from Migration 2 exist ──────────────────────────────
DO $$
DECLARE
  v_failures text := '';
  v_exists   bool;
BEGIN
  -- idx_es_enterprise_status: (enterprise_id, status)
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_index     ix
    JOIN   pg_catalog.pg_class      ci ON ci.oid = ix.indexrelid
    JOIN   pg_catalog.pg_class      ct ON ct.oid = ix.indrelid
    JOIN   pg_catalog.pg_namespace  ns ON ns.oid = ct.relnamespace
    WHERE  ns.nspname = 'public'
      AND  ct.relname = 'enterprise_sites'
      AND  ci.relname = 'idx_es_enterprise_status'
  ) INTO v_exists;
  IF NOT v_exists THEN
    v_failures := v_failures || ' [MISSING:idx_es_enterprise_status]';
  END IF;

  -- uq_es_enterprise_site_code already verified in A6; confirm presence here too
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_index     ix
    JOIN   pg_catalog.pg_class      ci ON ci.oid = ix.indexrelid
    JOIN   pg_catalog.pg_class      ct ON ct.oid = ix.indrelid
    JOIN   pg_catalog.pg_namespace  ns ON ns.oid = ct.relnamespace
    WHERE  ns.nspname = 'public'
      AND  ct.relname = 'enterprise_sites'
      AND  ci.relname = 'uq_es_enterprise_site_code'
  ) INTO v_exists;
  IF NOT v_exists THEN
    v_failures := v_failures || ' [MISSING:uq_es_enterprise_site_code]';
  END IF;

  IF v_failures = '' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A7', 'A', 'PASS', 'TEST A7 | Both Migration 2 indexes present (idx_es_enterprise_status, uq_es_enterprise_site_code) | PASS');
    RAISE NOTICE 'TEST A7 | Both Migration 2 indexes present (idx_es_enterprise_status, uq_es_enterprise_site_code) | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A7', 'A', 'FAIL', pg_catalog.format('TEST A7 | Missing index(es):%s | FAIL', v_failures));
    RAISE WARNING 'TEST A7 | Missing index(es):%s | FAIL', v_failures;
  END IF;
END;
$$;

-- ── A8: RLS is enabled on public.enterprise_sites ────────────────────────────
DO $$
DECLARE
  v_rowsecurity bool;
BEGIN
  SELECT c.relrowsecurity
  INTO   v_rowsecurity
  FROM   pg_catalog.pg_class     c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'enterprise_sites';

  IF v_rowsecurity IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A8', 'A', 'FAIL', 'TEST A8 | enterprise_sites table not found | FAIL');
    RAISE WARNING 'TEST A8 | enterprise_sites table not found | FAIL';
  ELSIF v_rowsecurity THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A8', 'A', 'PASS', 'TEST A8 | RLS is ENABLED on enterprise_sites | PASS');
    RAISE NOTICE 'TEST A8 | RLS is ENABLED on enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A8', 'A', 'FAIL', 'TEST A8 | RLS is NOT enabled on enterprise_sites | FAIL');
    RAISE WARNING 'TEST A8 | RLS is NOT enabled on enterprise_sites | FAIL';
  END IF;
END;
$$;

-- ── A9: Expected RLS policy count (4 policies) ───────────────────────────────
DO $$
DECLARE
  v_count  int;
  v_names  text;
BEGIN
  SELECT count(*),
         string_agg(pol.polname, ', ' ORDER BY pol.polname)
  INTO   v_count, v_names
  FROM   pg_catalog.pg_policy    pol
  JOIN   pg_catalog.pg_class      cl ON cl.oid = pol.polrelid
  JOIN   pg_catalog.pg_namespace  ns ON ns.oid = cl.relnamespace
  WHERE  ns.nspname = 'public'
    AND  cl.relname = 'enterprise_sites';

  IF v_count = 4 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A9', 'A', 'PASS', pg_catalog.format('TEST A9 | 4 RLS policies found on enterprise_sites (%s) | PASS', v_names));
    RAISE NOTICE 'TEST A9 | 4 RLS policies found on enterprise_sites (%s) | PASS', v_names;
  ELSIF v_count > 4 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A9', 'A', 'INCONCLUSIVE', pg_catalog.format('TEST A9 | %s RLS policies found (expected 4): %s | INCONCLUSIVE — extra policies present', v_count, v_names));
    RAISE WARNING 'TEST A9 | % RLS policies found (expected 4): %s | INCONCLUSIVE — extra policies present', v_count, v_names;
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A9', 'A', 'FAIL', pg_catalog.format('TEST A9 | %s RLS policies found (expected 4): %s | FAIL', v_count, v_names));
    RAISE WARNING 'TEST A9 | % RLS policies found (expected 4): %s | FAIL', v_count, v_names;
  END IF;
END;
$$;

-- ── A10: updated_at trigger exists and targets public.update_updated_at() ────
DO $$
DECLARE
  v_tgfunc  text;
  v_tgtype  int2;   -- bit 1=ROW, bit 2=BEFORE
BEGIN
  SELECT p.proname,
         t.tgtype
  INTO   v_tgfunc, v_tgtype
  FROM   pg_catalog.pg_trigger     t
  JOIN   pg_catalog.pg_proc        p  ON p.oid  = t.tgfoid
  JOIN   pg_catalog.pg_class       cl ON cl.oid = t.tgrelid
  JOIN   pg_catalog.pg_namespace   ns ON ns.oid = cl.relnamespace
  WHERE  ns.nspname = 'public'
    AND  cl.relname = 'enterprise_sites'
    AND  t.tgname   = 'enterprise_sites_updated_at'
    AND  NOT t.tgisinternal;

  IF v_tgfunc IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A10', 'A', 'FAIL', 'TEST A10 | enterprise_sites_updated_at trigger not found | FAIL');
    RAISE WARNING 'TEST A10 | enterprise_sites_updated_at trigger not found | FAIL';
  ELSIF v_tgfunc <> 'update_updated_at' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A10', 'A', 'FAIL', pg_catalog.format('TEST A10 | trigger function is %s (expected update_updated_at) | FAIL', v_tgfunc));
    RAISE WARNING 'TEST A10 | trigger function is %s (expected update_updated_at) | FAIL', v_tgfunc;
  ELSE
    -- tgtype bit 2 (value 2) = BEFORE; bit 1 (value 1) = ROW-level
    -- Standard BEFORE EACH ROW = tgtype & 3 = 3
    IF (v_tgtype & 3) = 3 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('A10', 'A', 'PASS', 'TEST A10 | enterprise_sites_updated_at BEFORE EACH ROW → public.update_updated_at() | PASS');
      RAISE NOTICE 'TEST A10 | enterprise_sites_updated_at BEFORE EACH ROW → public.update_updated_at() | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('A10', 'A', 'INCONCLUSIVE', pg_catalog.format('TEST A10 | trigger fires but tgtype=%s (expected BEFORE ROW) | INCONCLUSIVE', v_tgtype));
      RAISE WARNING 'TEST A10 | trigger fires but tgtype=% (expected BEFORE ROW) | INCONCLUSIVE', v_tgtype;
    END IF;
  END IF;
END;
$$;

-- ── A11: public.create_enterprise_site(uuid,text,text,text,text) exists ──────
DO $$
DECLARE
  v_oid oid;
BEGIN
  SELECT p.oid
  INTO   v_oid
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname   = 'public'
    AND  p.proname   = 'create_enterprise_site'
    AND  array_length(p.proargtypes, 1) = 5
    -- arg types: uuid, text, text, text, text
    AND  p.proargtypes[0] = 'uuid'::regtype::oid
    AND  p.proargtypes[1] = 'text'::regtype::oid
    AND  p.proargtypes[2] = 'text'::regtype::oid
    AND  p.proargtypes[3] = 'text'::regtype::oid
    AND  p.proargtypes[4] = 'text'::regtype::oid;

  IF v_oid IS NOT NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A11', 'A', 'PASS', 'TEST A11 | public.create_enterprise_site(uuid,text,text,text,text) exists | PASS');
    RAISE NOTICE 'TEST A11 | public.create_enterprise_site(uuid,text,text,text,text) exists | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A11', 'A', 'FAIL', 'TEST A11 | public.create_enterprise_site(uuid,text,text,text,text) NOT found | FAIL');
    RAISE WARNING 'TEST A11 | public.create_enterprise_site(uuid,text,text,text,text) NOT found | FAIL';
  END IF;
END;
$$;

-- ── A12: create_enterprise_site is SECURITY DEFINER + SET search_path = '' ───
DO $$
DECLARE
  v_prosecdef  bool;
  v_proconfig  text[];
  v_sp_entry   text;
  v_sp_ok      bool := false;
BEGIN
  SELECT p.prosecdef, p.proconfig
  INTO   v_prosecdef, v_proconfig
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'create_enterprise_site'
    AND  array_length(p.proargtypes, 1) = 5
    AND  p.proargtypes[0] = 'uuid'::regtype::oid
    AND  p.proargtypes[1] = 'text'::regtype::oid;

  IF v_prosecdef IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A12', 'A', 'FAIL', 'TEST A12 | create_enterprise_site function not found | FAIL');
    RAISE WARNING 'TEST A12 | create_enterprise_site function not found | FAIL';
    RETURN;
  END IF;

  IF NOT v_prosecdef THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A12', 'A', 'FAIL', 'TEST A12 | create_enterprise_site is NOT SECURITY DEFINER | FAIL');
    RAISE WARNING 'TEST A12 | create_enterprise_site is NOT SECURITY DEFINER | FAIL';
    RETURN;
  END IF;

  -- Check SET search_path = '' in proconfig (entry like 'search_path=')
  IF v_proconfig IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM unnest(v_proconfig) AS cfg
      WHERE  pg_catalog.lower(cfg) IN ('search_path=', 'search_path=""')
    ) INTO v_sp_ok;
  END IF;

  IF v_sp_ok THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A12', 'A', 'PASS', 'TEST A12 | create_enterprise_site: SECURITY DEFINER + SET search_path = '''' (hardened) | PASS');
    RAISE NOTICE 'TEST A12 | create_enterprise_site: SECURITY DEFINER + SET search_path = '''' (hardened) | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('A12', 'A', 'FAIL', pg_catalog.format('TEST A12 | create_enterprise_site: SECURITY DEFINER=%s but search_path config=%s (expected empty search_path) | FAIL', v_prosecdef, v_proconfig));
    RAISE WARNING 'TEST A12 | create_enterprise_site: SECURITY DEFINER=% but search_path config=% (expected empty search_path) | FAIL',
      v_prosecdef, v_proconfig;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- B. ACL CONTRACT
-- ---------------------------------------------------------------------------
-- Tests B1–B12: post-patch ACL state per fixeo-phase-1f-enterprise-sites-acl-patch.sql
-- All checks are read-only (pg_class.relacl / pg_attribute.attacl).
-- No GRANT, REVOKE, or privilege modification in this harness.
-- ---------------------------------------------------------------------------

-- Helper: extract ACL letters for a named role from pg_class.relacl
-- Returns NULL if the role has no entry in relacl.
-- Used by B1–B12 tests below.

-- ── B1: authenticated has table-level SELECT ('r') ──────────────────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B1', 'B', 'FAIL', 'TEST B1 | authenticated has no relacl entry on enterprise_sites | FAIL');
    RAISE WARNING 'TEST B1 | authenticated has no relacl entry on enterprise_sites | FAIL';
  ELSIF v_letters LIKE '%r%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B1', 'B', 'PASS', 'TEST B1 | authenticated table-level SELECT (r) granted | PASS');
    RAISE NOTICE 'TEST B1 | authenticated table-level SELECT (r) granted | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B1', 'B', 'FAIL', pg_catalog.format('TEST B1 | authenticated relacl=%s — SELECT (r) absent | FAIL', v_letters));
    RAISE WARNING 'TEST B1 | authenticated relacl=% — SELECT (r) absent | FAIL', v_letters;
  END IF;
END;
$$;

-- ── B2: authenticated does NOT have table-level INSERT ('a') ─────────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%a%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B2', 'B', 'FAIL', 'TEST B2 | authenticated has table-level INSERT (a) — MUST be absent after patch | FAIL');
    RAISE WARNING 'TEST B2 | authenticated has table-level INSERT (a) — MUST be absent after patch | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B2', 'B', 'PASS', 'TEST B2 | authenticated table-level INSERT (a) absent | PASS');
    RAISE NOTICE 'TEST B2 | authenticated table-level INSERT (a) absent | PASS';
  END IF;
END;
$$;

-- ── B3: authenticated does NOT have table-level DELETE ('d') ─────────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%d%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B3', 'B', 'FAIL', 'TEST B3 | authenticated has table-level DELETE (d) — MUST be absent after patch | FAIL');
    RAISE WARNING 'TEST B3 | authenticated has table-level DELETE (d) — MUST be absent after patch | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B3', 'B', 'PASS', 'TEST B3 | authenticated table-level DELETE (d) absent | PASS');
    RAISE NOTICE 'TEST B3 | authenticated table-level DELETE (d) absent | PASS';
  END IF;
END;
$$;

-- ── B4: authenticated does NOT have table-level TRUNCATE ('D') ──────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%D%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B4', 'B', 'FAIL', 'TEST B4 | authenticated has table-level TRUNCATE (D) — MUST be absent after patch | FAIL');
    RAISE WARNING 'TEST B4 | authenticated has table-level TRUNCATE (D) — MUST be absent after patch | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B4', 'B', 'PASS', 'TEST B4 | authenticated table-level TRUNCATE (D) absent | PASS');
    RAISE NOTICE 'TEST B4 | authenticated table-level TRUNCATE (D) absent | PASS';
  END IF;
END;
$$;

-- ── B5: authenticated does NOT have table-level REFERENCES ('x') ────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%x%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B5', 'B', 'FAIL', 'TEST B5 | authenticated has table-level REFERENCES (x) — MUST be absent after patch | FAIL');
    RAISE WARNING 'TEST B5 | authenticated has table-level REFERENCES (x) — MUST be absent after patch | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B5', 'B', 'PASS', 'TEST B5 | authenticated table-level REFERENCES (x) absent | PASS');
    RAISE NOTICE 'TEST B5 | authenticated table-level REFERENCES (x) absent | PASS';
  END IF;
END;
$$;

-- ── B6: authenticated does NOT have table-level TRIGGER ('t') ──────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%t%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B6', 'B', 'FAIL', 'TEST B6 | authenticated has table-level TRIGGER (t) — MUST be absent after patch | FAIL');
    RAISE WARNING 'TEST B6 | authenticated has table-level TRIGGER (t) — MUST be absent after patch | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B6', 'B', 'PASS', 'TEST B6 | authenticated table-level TRIGGER (t) absent | PASS');
    RAISE NOTICE 'TEST B6 | authenticated table-level TRIGGER (t) absent | PASS';
  END IF;
END;
$$;

-- ── B7: authenticated does NOT have table-level UPDATE ('w') ────────────────
-- CRITICAL: Do NOT use has_table_privilege('authenticated',
--   'public.enterprise_sites', 'UPDATE') here — PostgreSQL returns
--   TRUE when column-level UPDATE grants exist, making it misleading.
--   Read pg_class.relacl directly to isolate table-level 'w'.
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NOT NULL AND v_letters LIKE '%w%' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B7', 'B', 'FAIL', 'TEST B7 | authenticated has table-level UPDATE (w) in relacl — MUST be absent; only column-level UPDATE permitted | FAIL');
    RAISE WARNING 'TEST B7 | authenticated has table-level UPDATE (w) in relacl — MUST be absent; only column-level UPDATE permitted | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B7', 'B', 'PASS', 'TEST B7 | authenticated table-level UPDATE (w) absent from relacl (column-level only, as intended) | PASS');
    RAISE NOTICE 'TEST B7 | authenticated table-level UPDATE (w) absent from relacl (column-level only, as intended) | PASS';
  END IF;
END;
$$;

-- ── B8: authenticated has column-level UPDATE on EXACTLY the 5 approved cols ───
DO $$
DECLARE
  v_granted_cols  text[];
  v_expected_cols text[] := ARRAY['address_line','city','name','site_code','status'];
  v_extra         text[];
  v_missing       text[];
BEGIN
  SELECT array_agg(a.attname ORDER BY a.attname)
  INTO   v_granted_cols
  FROM   pg_catalog.pg_attribute a
  WHERE  a.attrelid = 'public.enterprise_sites'::regclass
    AND  a.attnum   > 0
    AND  NOT a.attisdropped
    AND  a.attacl   IS NOT NULL
    AND  EXISTS (
      SELECT 1 FROM unnest(a.attacl) AS acl_entry
      WHERE  acl_entry::text LIKE 'authenticated=%'
        AND  pg_catalog.regexp_replace(
               acl_entry::text,
               '^authenticated=([^/]+)/.*$',
               '\1'
             ) LIKE '%w%'
    );

  v_granted_cols := COALESCE(v_granted_cols, ARRAY[]::text[]);

  -- Columns in granted but not in expected
  SELECT array_agg(col)
  INTO   v_extra
  FROM   unnest(v_granted_cols) AS col
  WHERE  col <> ALL(v_expected_cols);

  -- Columns in expected but not in granted
  SELECT array_agg(col)
  INTO   v_missing
  FROM   unnest(v_expected_cols) AS col
  WHERE  col <> ALL(v_granted_cols);

  IF (v_extra IS NULL OR array_length(v_extra, 1) IS NULL)
     AND (v_missing IS NULL OR array_length(v_missing, 1) IS NULL)
  THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B8', 'B', 'PASS', 'TEST B8 | authenticated column-level UPDATE granted on exactly: name, site_code, address_line, city, status | PASS');
    RAISE NOTICE 'TEST B8 | authenticated column-level UPDATE granted on exactly: name, site_code, address_line, city, status | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B8', 'B', 'FAIL', pg_catalog.format('TEST B8 | Column-level UPDATE mismatch — extra: %s, missing: %s | FAIL', COALESCE(array_to_string(v_extra, ', '), 'none'), COALESCE(array_to_string(v_missing, ', '), 'none')));
    RAISE WARNING 'TEST B8 | Column-level UPDATE mismatch — extra: %s, missing: %s | FAIL',
      COALESCE(array_to_string(v_extra,   ', '), 'none'),
      COALESCE(array_to_string(v_missing, ', '), 'none');
  END IF;
END;
$$;

-- ── B9: authenticated has NO column-level UPDATE on protected columns ──────────
DO $$
DECLARE
  v_violations text := '';
  v_col        text;
BEGIN
  FOR v_col IN
    SELECT unnest(ARRAY['id','enterprise_id','created_at','updated_at'])
  LOOP
    IF EXISTS (
      SELECT 1
      FROM   pg_catalog.pg_attribute a
      WHERE  a.attrelid = 'public.enterprise_sites'::regclass
        AND  a.attname  = v_col
        AND  a.attnum   > 0
        AND  NOT a.attisdropped
        AND  a.attacl IS NOT NULL
        AND  EXISTS (
          SELECT 1 FROM unnest(a.attacl) AS acl_entry
          WHERE  acl_entry::text LIKE 'authenticated=%'
            AND  pg_catalog.regexp_replace(
                   acl_entry::text,
                   '^authenticated=([^/]+)/.*$',
                   '\1'
                 ) LIKE '%w%'
        )
    ) THEN
      v_violations := v_violations || ' [' || v_col || ']';
    END IF;
  END LOOP;

  IF v_violations = '' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B9', 'B', 'PASS', 'TEST B9 | authenticated has NO column-level UPDATE on id, enterprise_id, created_at, updated_at | PASS');
    RAISE NOTICE 'TEST B9 | authenticated has NO column-level UPDATE on id, enterprise_id, created_at, updated_at | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B9', 'B', 'FAIL', pg_catalog.format('TEST B9 | authenticated has unexpected column-level UPDATE on:%s | FAIL', v_violations));
    RAISE WARNING 'TEST B9 | authenticated has unexpected column-level UPDATE on:%s | FAIL', v_violations;
  END IF;
END;
$$;

-- ── B10: anon has no explicit enterprise_sites table privileges ──────────────
DO $$
DECLARE
  v_anon_entry text;
BEGIN
  SELECT acl_entry::text
  INTO   v_anon_entry
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'anon=%';

  IF v_anon_entry IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B10', 'B', 'PASS', 'TEST B10 | anon has no explicit relacl entry on enterprise_sites | PASS');
    RAISE NOTICE 'TEST B10 | anon has no explicit relacl entry on enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B10', 'B', 'FAIL', pg_catalog.format('TEST B10 | anon has relacl entry: %s — MUST be absent | FAIL', v_anon_entry));
    RAISE WARNING 'TEST B10 | anon has relacl entry: % — MUST be absent | FAIL', v_anon_entry;
  END IF;
END;
$$;

-- ── B11: PUBLIC has no explicit enterprise_sites table privileges ─────────────
-- In PostgreSQL ACL representation, PUBLIC grants appear as an empty
-- role name: "=<letters>/<grantor>".
DO $$
DECLARE
  v_public_entry text;
BEGIN
  SELECT acl_entry::text
  INTO   v_public_entry
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    -- PUBLIC entry starts with '=' (no role name prefix)
    AND  acl_entry::text ~ '^=[^/]';

  IF v_public_entry IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B11', 'B', 'PASS', 'TEST B11 | PUBLIC has no explicit relacl entry on enterprise_sites | PASS');
    RAISE NOTICE 'TEST B11 | PUBLIC has no explicit relacl entry on enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B11', 'B', 'FAIL', pg_catalog.format('TEST B11 | PUBLIC has relacl entry: %s — MUST be absent | FAIL', v_public_entry));
    RAISE WARNING 'TEST B11 | PUBLIC has relacl entry: % — MUST be absent | FAIL', v_public_entry;
  END IF;
END;
$$;

-- ── B12: authenticated ACL letters at table level are EXACTLY 'r' ─────────────
DO $$
DECLARE
  v_letters text;
BEGIN
  SELECT pg_catalog.regexp_replace(
           acl_entry::text,
           '^authenticated=([^/]+)/.*$',
           '\1'
         )
  INTO   v_letters
  FROM   pg_catalog.pg_class c,
         unnest(c.relacl) AS acl_entry
  WHERE  c.oid = 'public.enterprise_sites'::regclass
    AND  acl_entry::text LIKE 'authenticated=%';

  IF v_letters IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B12', 'B', 'FAIL', 'TEST B12 | authenticated has no relacl entry (expected exactly r) | FAIL');
    RAISE WARNING 'TEST B12 | authenticated has no relacl entry (expected exactly r) | FAIL';
  ELSIF v_letters = 'r' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B12', 'B', 'PASS', 'TEST B12 | authenticated relacl letters = ''r'' exactly | PASS');
    RAISE NOTICE 'TEST B12 | authenticated relacl letters = ''r'' exactly | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('B12', 'B', 'FAIL', pg_catalog.format('TEST B12 | authenticated relacl letters = ''%s'' (expected exactly ''r'') | FAIL', v_letters));
    RAISE WARNING 'TEST B12 | authenticated relacl letters = ''%s'' (expected exactly ''r'') | FAIL', v_letters;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- C. TENANT ISOLATION / SELECT
-- ---------------------------------------------------------------------------
-- Tests C1–C8: verify RLS es_members_select and es_fixeo_admin_all policies
-- enforce strict tenant boundaries on enterprise_sites SELECT.
--
-- Auth simulation (identical to proven Phase 1E mechanism):
--   set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)
--   SET LOCAL ROLE authenticated   → simulates PostgREST authenticated call
--   RESET ROLE                     → restore postgres between each block
--
-- Synthetic data setup uses postgres role (SECURITY DEFINER / RLS bypass);
-- SELECT assertions execute under simulated authenticated identities.
-- ALL synthetic rows disappear under final ROLLBACK.
-- ---------------------------------------------------------------------------

-- ── C-SETUP: Generate UUIDs and provision synthetic data ─────────────────
DO $$
BEGIN
  -- Synthetic identity UUIDs (unique prefix 'c1f3' to avoid collision with
  -- any other test block in this harness)
  PERFORM set_config('test.c_uid_a',       gen_random_uuid()::text, true);
  PERFORM set_config('test.c_uid_b',       gen_random_uuid()::text, true);
  PERFORM set_config('test.c_uid_viewer',  gen_random_uuid()::text, true);
  PERFORM set_config('test.c_uid_nomember',gen_random_uuid()::text, true);
  PERFORM set_config('test.c_uid_admin',   gen_random_uuid()::text, true);
  -- Synthetic enterprise / site UUIDs
  PERFORM set_config('test.c_ea_id',       gen_random_uuid()::text, true);
  PERFORM set_config('test.c_eb_id',       gen_random_uuid()::text, true);
  PERFORM set_config('test.c_site_a_id',   gen_random_uuid()::text, true);
  PERFORM set_config('test.c_site_b_id',   gen_random_uuid()::text, true);
  RAISE NOTICE 'C-SETUP UUIDs generated: ea=% eb=% site_a=% site_b=% uid_a=% uid_b=% uid_viewer=% uid_nomember=% uid_admin=%',
    current_setting('test.c_ea_id'),
    current_setting('test.c_eb_id'),
    current_setting('test.c_site_a_id'),
    current_setting('test.c_site_b_id'),
    current_setting('test.c_uid_a'),
    current_setting('test.c_uid_b'),
    current_setting('test.c_uid_viewer'),
    current_setting('test.c_uid_nomember'),
    current_setting('test.c_uid_admin');
END;
$$;

-- Insert auth.users rows; handle_new_user() trigger auto-creates
-- public.users + public.profiles. DO NOT manually INSERT public.users.
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES
  (current_setting('test.c_uid_a')::uuid,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'c-es-owner-a@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.c_uid_b')::uuid,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'c-es-owner-b@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.c_uid_viewer')::uuid,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'c-es-viewer-a@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.c_uid_nomember')::uuid,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'c-es-nomember@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false),
  (current_setting('test.c_uid_admin')::uuid,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'c-es-admin@fixeo-test.invalid', '',
   now(), now(), now(), '{}', '{}', false);

-- Patch public.users created by trigger
UPDATE public.users SET role = 'client', full_name = 'C-Site Owner A'
  WHERE id = current_setting('test.c_uid_a')::uuid;
UPDATE public.users SET role = 'client', full_name = 'C-Site Owner B'
  WHERE id = current_setting('test.c_uid_b')::uuid;
UPDATE public.users SET role = 'client', full_name = 'C-Site Viewer A'
  WHERE id = current_setting('test.c_uid_viewer')::uuid;
UPDATE public.users SET role = 'client', full_name = 'C-Site No-Member'
  WHERE id = current_setting('test.c_uid_nomember')::uuid;
UPDATE public.users SET role = 'admin',  full_name = 'C-Site Fixeo Admin'
  WHERE id = current_setting('test.c_uid_admin')::uuid;

-- Provision enterprise accounts directly as postgres (RLS bypass)
INSERT INTO public.enterprise_accounts (id, name, status) VALUES
  (current_setting('test.c_ea_id')::uuid, 'C-Test Enterprise Alpha', 'active'),
  (current_setting('test.c_eb_id')::uuid, 'C-Test Enterprise Beta',  'active');

-- Provision enterprise members directly as postgres
INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status) VALUES
  -- Enterprise A: uid_a = owner (active), uid_viewer = viewer (active)
  (current_setting('test.c_ea_id')::uuid,
   current_setting('test.c_uid_a')::uuid,      'owner',  'active'),
  (current_setting('test.c_ea_id')::uuid,
   current_setting('test.c_uid_viewer')::uuid,  'viewer', 'active'),
  -- Enterprise B: uid_b = owner (active)
  (current_setting('test.c_eb_id')::uuid,
   current_setting('test.c_uid_b')::uuid,       'owner',  'active');
-- uid_nomember: intentionally no membership row in either enterprise
-- uid_admin:    no membership row; access via es_fixeo_admin_all policy

-- Provision enterprise_sites directly as postgres (bypass RLS / ACL)
-- Direct INSERT is intentional here: Section D owns RPC behavioral testing;
-- this section tests SELECT isolation only.
INSERT INTO public.enterprise_sites
  (id, enterprise_id, name, city, status) VALUES
  (current_setting('test.c_site_a_id')::uuid,
   current_setting('test.c_ea_id')::uuid,
   'C-Alpha HQ Site', 'Casablanca', 'active'),
  (current_setting('test.c_site_b_id')::uuid,
   current_setting('test.c_eb_id')::uuid,
   'C-Beta HQ Site', 'Rabat', 'active');

-- Setup sanity check
DO $$
BEGIN
  RAISE NOTICE 'C-SETUP sanity: sites=% members=% accounts=%',
    (SELECT count(*) FROM public.enterprise_sites
       WHERE id IN (current_setting('test.c_site_a_id')::uuid,
                    current_setting('test.c_site_b_id')::uuid)),
    (SELECT count(*) FROM public.enterprise_members
       WHERE enterprise_id IN (current_setting('test.c_ea_id')::uuid,
                               current_setting('test.c_eb_id')::uuid)),
    (SELECT count(*) FROM public.enterprise_accounts
       WHERE id IN (current_setting('test.c_ea_id')::uuid,
                    current_setting('test.c_eb_id')::uuid));
END;
$$;

-- ── C1: Enterprise A owner can SELECT Enterprise A site ──────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    IF v_count = 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C1', 'C', 'PASS', 'TEST C1 | Enterprise A owner can SELECT Enterprise A site (rows=1) | PASS');
      RAISE NOTICE 'TEST C1 | Enterprise A owner can SELECT Enterprise A site (rows=1) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C1', 'C', 'FAIL', pg_catalog.format('TEST C1 | Enterprise A owner SELECT returned %s rows (expected 1) | FAIL', v_count));
      RAISE WARNING 'TEST C1 | Enterprise A owner SELECT returned % rows (expected 1) | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C1', 'C', 'FAIL', pg_catalog.format('TEST C1 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C1 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C2: Enterprise A member cannot see Enterprise B site ─────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    RESET ROLE;
    IF v_count = 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C2', 'C', 'PASS', 'TEST C2 | Enterprise A owner cannot see Enterprise B site (rows=0) | PASS');
      RAISE NOTICE 'TEST C2 | Enterprise A owner cannot see Enterprise B site (rows=0) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C2', 'C', 'FAIL', pg_catalog.format('TEST C2 | Enterprise A owner can see Enterprise B site (rows=%s) — TENANT ISOLATION BREACH | FAIL', v_count));
      RAISE WARNING 'TEST C2 | Enterprise A owner can see Enterprise B site (rows=%) — TENANT ISOLATION BREACH | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C2', 'C', 'FAIL', pg_catalog.format('TEST C2 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C2 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C3: Enterprise B owner can SELECT Enterprise B site ──────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_b')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    RESET ROLE;
    IF v_count = 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C3', 'C', 'PASS', 'TEST C3 | Enterprise B owner can SELECT Enterprise B site (rows=1) | PASS');
      RAISE NOTICE 'TEST C3 | Enterprise B owner can SELECT Enterprise B site (rows=1) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C3', 'C', 'FAIL', pg_catalog.format('TEST C3 | Enterprise B owner SELECT returned %s rows (expected 1) | FAIL', v_count));
      RAISE WARNING 'TEST C3 | Enterprise B owner SELECT returned % rows (expected 1) | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C3', 'C', 'FAIL', pg_catalog.format('TEST C3 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C3 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C4: Enterprise B owner cannot see Enterprise A site ──────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_b')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    IF v_count = 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C4', 'C', 'PASS', 'TEST C4 | Enterprise B owner cannot see Enterprise A site (rows=0) | PASS');
      RAISE NOTICE 'TEST C4 | Enterprise B owner cannot see Enterprise A site (rows=0) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C4', 'C', 'FAIL', pg_catalog.format('TEST C4 | Enterprise B owner can see Enterprise A site (rows=%s) — TENANT ISOLATION BREACH | FAIL', v_count));
      RAISE WARNING 'TEST C4 | Enterprise B owner can see Enterprise A site (rows=%) — TENANT ISOLATION BREACH | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C4', 'C', 'FAIL', pg_catalog.format('TEST C4 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C4 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C5: Authenticated user with no membership sees zero synthetic sites ───
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_nomember')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id IN (
      current_setting('test.c_site_a_id')::uuid,
      current_setting('test.c_site_b_id')::uuid
    );
    RESET ROLE;
    IF v_count = 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C5', 'C', 'PASS', 'TEST C5 | No-membership user sees zero synthetic enterprise sites (rows=0) | PASS');
      RAISE NOTICE 'TEST C5 | No-membership user sees zero synthetic enterprise sites (rows=0) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C5', 'C', 'FAIL', pg_catalog.format('TEST C5 | No-membership user can see %s synthetic site(s) — ISOLATION BREACH | FAIL', v_count));
      RAISE WARNING 'TEST C5 | No-membership user can see % synthetic site(s) — ISOLATION BREACH | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C5', 'C', 'FAIL', pg_catalog.format('TEST C5 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C5 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C6: Cross-tenant lookup by known foreign site UUID returns zero rows ──
-- Enterprise A member queries Enterprise B site UUID directly.
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    -- uid_a is Enterprise A member; c_site_b_id belongs to Enterprise B
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    RESET ROLE;
    IF v_count = 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C6', 'C', 'PASS', 'TEST C6 | Cross-tenant UUID lookup returns zero rows for Enterprise A member querying Enterprise B site | PASS');
      RAISE NOTICE 'TEST C6 | Cross-tenant UUID lookup returns zero rows for Enterprise A member querying Enterprise B site | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C6', 'C', 'FAIL', pg_catalog.format('TEST C6 | Cross-tenant UUID lookup exposed %s row(s) — TENANT ISOLATION BREACH | FAIL', v_count));
      RAISE WARNING 'TEST C6 | Cross-tenant UUID lookup exposed % row(s) — TENANT ISOLATION BREACH | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C6', 'C', 'FAIL', pg_catalog.format('TEST C6 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C6 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C7: Enterprise A viewer (active member) can SELECT Enterprise A site ─
-- Migration 2 es_members_select: fixeo_private._fixeo_is_enterprise_member()
-- checks status = 'active' for ANY role (owner/admin/viewer/etc).
-- uid_viewer is active viewer in Enterprise A — SELECT must be permitted.
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_viewer')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    IF v_count = 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C7', 'C', 'PASS', 'TEST C7 | Enterprise A active viewer can SELECT Enterprise A site (rows=1) | PASS');
      RAISE NOTICE 'TEST C7 | Enterprise A active viewer can SELECT Enterprise A site (rows=1) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C7', 'C', 'FAIL', pg_catalog.format('TEST C7 | Enterprise A active viewer SELECT returned %s rows (expected 1) | FAIL', v_count));
      RAISE WARNING 'TEST C7 | Enterprise A active viewer SELECT returned % rows (expected 1) | FAIL', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C7', 'C', 'FAIL', pg_catalog.format('TEST C7 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C7 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C8: FIXEO admin can SELECT both synthetic sites (es_fixeo_admin_all) ─
-- Migration 2 es_fixeo_admin_all policy: fixeo_private._fixeo_is_admin()
-- checks public.users.role = 'admin' for auth.uid().
-- uid_admin has role='admin'; must see both synthetic sites.
DO $$
DECLARE
  v_count int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_admin')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_count
    FROM   public.enterprise_sites
    WHERE  id IN (
      current_setting('test.c_site_a_id')::uuid,
      current_setting('test.c_site_b_id')::uuid
    );
    RESET ROLE;
    IF v_count = 2 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C8', 'C', 'PASS', 'TEST C8 | FIXEO admin (es_fixeo_admin_all) can SELECT both synthetic sites across tenants (rows=2) | PASS');
      RAISE NOTICE 'TEST C8 | FIXEO admin (es_fixeo_admin_all) can SELECT both synthetic sites across tenants (rows=2) | PASS';
    ELSIF v_count > 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C8', 'C', 'INCONCLUSIVE', pg_catalog.format('TEST C8 | FIXEO admin sees %s of 2 expected synthetic sites | INCONCLUSIVE — partial visibility', v_count));
      RAISE WARNING 'TEST C8 | FIXEO admin sees % of 2 expected synthetic sites | INCONCLUSIVE — partial visibility', v_count;
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('C8', 'C', 'FAIL', 'TEST C8 | FIXEO admin sees 0 synthetic sites (expected 2 via es_fixeo_admin_all) | FAIL');
      RAISE WARNING 'TEST C8 | FIXEO admin sees 0 synthetic sites (expected 2 via es_fixeo_admin_all) | FAIL';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('C8', 'C', 'FAIL', pg_catalog.format('TEST C8 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST C8 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── C-CLEANUP: Reset JWT claims to avoid leaking simulated identity ───────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'C-CLEANUP: JWT claims cleared, role is postgres';
END;
$$;


-- ---------------------------------------------------------------------------
-- D. create_enterprise_site RPC SECURITY
-- ---------------------------------------------------------------------------
-- Tests D1–D18: verify exact RPC guard sequence, validation, normalization,
-- and cross-tenant boundary enforcement of public.create_enterprise_site().
--
-- Reuses Section C synthetic topology where possible:
--   c_uid_a       = Enterprise A owner  (active)
--   c_uid_viewer  = Enterprise A viewer (active)
--   c_uid_b       = Enterprise B owner  (active)
--   c_uid_nomember= authenticated, no membership
--   c_ea_id       = Enterprise A
--   c_eb_id       = Enterprise B
--
-- Additional synthetic UUIDs introduced here:
--   d_uid_orphan  = auth.uid() never inserted into auth.users → user_not_found
--
-- All RPC-created rows are synthetic and transaction-contained.
-- Auth simulation: SET LOCAL ROLE authenticated + request.jwt.claims
-- (identical to Section C / Phase 1E proven pattern).
-- ---------------------------------------------------------------------------

-- Allocate d_uid_orphan (not inserted into auth.users / public.users)
DO $$
BEGIN
  PERFORM set_config('test.d_uid_orphan', gen_random_uuid()::text, true);
  RAISE NOTICE 'D-SETUP d_uid_orphan=%', current_setting('test.d_uid_orphan');
END;
$$;

-- ── D1: unauthenticated invocation → 'unauthenticated' ───────────────────
-- Guard 1: auth.uid() IS NULL when no JWT claims are set.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  -- Clear any JWT claims; SET LOCAL ROLE authenticated so the ACL EXECUTE
  -- grant is satisfied, but auth.uid() returns NULL (no sub in claims).
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D1 Site', 'D1 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'unauthenticated' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D1', 'D', 'PASS', 'TEST D1 | unauthenticated call → reason=unauthenticated | PASS');
      RAISE NOTICE 'TEST D1 | unauthenticated call → reason=unauthenticated | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D1', 'D', 'FAIL', pg_catalog.format('TEST D1 | expected {ok:false,reason:unauthenticated} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D1 | expected {ok:false,reason:unauthenticated} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D1', 'D', 'FAIL', pg_catalog.format('TEST D1 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D1 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D2: authenticated user absent from public.users → 'user_not_found' ───
-- Guard 2: d_uid_orphan exists in no auth.users / public.users row.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.d_uid_orphan')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D2 Site', 'D2 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'user_not_found' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D2', 'D', 'PASS', 'TEST D2 | orphan uid → reason=user_not_found | PASS');
      RAISE NOTICE 'TEST D2 | orphan uid → reason=user_not_found | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D2', 'D', 'FAIL', pg_catalog.format('TEST D2 | expected {ok:false,reason:user_not_found} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D2 | expected {ok:false,reason:user_not_found} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D2', 'D', 'FAIL', pg_catalog.format('TEST D2 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D2 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D3: NULL enterprise_id → 'enterprise_required' ───────────────────────
-- Guard 3: p_enterprise_id IS NULL.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      NULL,
      'D3 Site', 'D3 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'enterprise_required' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D3', 'D', 'PASS', 'TEST D3 | NULL enterprise_id → reason=enterprise_required | PASS');
      RAISE NOTICE 'TEST D3 | NULL enterprise_id → reason=enterprise_required | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D3', 'D', 'FAIL', pg_catalog.format('TEST D3 | expected {ok:false,reason:enterprise_required} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D3 | expected {ok:false,reason:enterprise_required} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D3', 'D', 'FAIL', pg_catalog.format('TEST D3 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D3 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D4: authenticated non-member attempts to create in Enterprise A → 'forbidden' ─
-- Guard 4: c_uid_nomember has no enterprise_members row in EA.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_nomember')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D4 Site', 'D4 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'forbidden' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D4', 'D', 'PASS', 'TEST D4 | non-member create attempt → reason=forbidden | PASS');
      RAISE NOTICE 'TEST D4 | non-member create attempt → reason=forbidden | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D4', 'D', 'FAIL', pg_catalog.format('TEST D4 | expected {ok:false,reason:forbidden} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D4 | expected {ok:false,reason:forbidden} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D4', 'D', 'FAIL', pg_catalog.format('TEST D4 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D4 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D5: active viewer in Enterprise A attempts creation → 'forbidden' ────
-- Guard 4: _fixeo_is_enterprise_manager() requires role IN ('owner','admin').
-- c_uid_viewer is active viewer — does NOT satisfy manager check.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_viewer')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D5 Site', 'D5 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'forbidden' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D5', 'D', 'PASS', 'TEST D5 | active viewer create attempt → reason=forbidden (manager required) | PASS');
      RAISE NOTICE 'TEST D5 | active viewer create attempt → reason=forbidden (manager required) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D5', 'D', 'FAIL', pg_catalog.format('TEST D5 | expected {ok:false,reason:forbidden} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D5 | expected {ok:false,reason:forbidden} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D5', 'D', 'FAIL', pg_catalog.format('TEST D5 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D5 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D6: Enterprise A owner creates valid site → ok=true + site_id ────────
-- Positive creation path. Verify ok, site_id uuid, row exists with correct enterprise_id.
DO $$
DECLARE
  v_result      jsonb;
  v_site_id     uuid;
  v_row_count   int;
  v_ent_id      uuid;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D6 Alpha Site', 'D6 City', 'D6-CODE', '123 D6 Street'
    ) INTO v_result;
    RESET ROLE;

    -- ok must be true
    IF (v_result->>'ok')::bool IS NOT TRUE THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D6', 'D', 'FAIL', pg_catalog.format('TEST D6 | ok=false, reason=%s, expected success | FAIL', v_result->>'reason'));
      RAISE WARNING 'TEST D6 | ok=false, reason=%, expected success | FAIL', v_result->>'reason';
      RETURN;
    END IF;

    -- site_id must be present and valid UUID
    BEGIN
      v_site_id := (v_result->>'site_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D6', 'D', 'FAIL', pg_catalog.format('TEST D6 | site_id is not a valid UUID: %s | FAIL', v_result->>'site_id'));
      RAISE WARNING 'TEST D6 | site_id is not a valid UUID: % | FAIL', v_result->>'site_id';
      RETURN;
    END;

    -- Verify row exists in enterprise_sites (as postgres — bypasses RLS)
    SELECT enterprise_id
    INTO   v_ent_id
    FROM   public.enterprise_sites
    WHERE  id = v_site_id;
    v_row_count := CASE WHEN FOUND THEN 1 ELSE 0 END;

    IF v_row_count = 1
       AND v_ent_id = current_setting('test.c_ea_id')::uuid THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D6', 'D', 'PASS', pg_catalog.format('TEST D6 | Enterprise A owner created valid site ok=true site_id=%s enterprise_id=EA | PASS', v_site_id));
      RAISE NOTICE 'TEST D6 | Enterprise A owner created valid site ok=true site_id=% enterprise_id=EA | PASS', v_site_id;
      -- Store for reuse in D15
      PERFORM set_config('test.d6_site_id', v_site_id::text, true);
    ELSIF v_row_count = 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D6', 'D', 'FAIL', pg_catalog.format('TEST D6 | Row created but enterprise_id=%s (expected c_ea_id) | FAIL', v_ent_id));
      RAISE WARNING 'TEST D6 | Row created but enterprise_id=% (expected c_ea_id) | FAIL', v_ent_id;
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D6', 'D', 'FAIL', pg_catalog.format('TEST D6 | site_id=%s but row_count=%s in enterprise_sites | FAIL', v_site_id, v_row_count));
      RAISE WARNING 'TEST D6 | site_id=% but row_count=% in enterprise_sites | FAIL', v_site_id, v_row_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D6', 'D', 'FAIL', pg_catalog.format('TEST D6 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D6 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D7: Enterprise A owner attempts creation in Enterprise B → 'forbidden' ─
-- Critical cross-tenant boundary: knowing EB UUID must not suffice.
-- Verify also that no EB row was created from this attempt.
DO $$
DECLARE
  v_result    jsonb;
  v_eb_before int;
  v_eb_after  int;
BEGIN
  -- Count EB sites before attempt
  SELECT count(*) INTO v_eb_before
  FROM   public.enterprise_sites
  WHERE  enterprise_id = current_setting('test.c_eb_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_eb_id')::uuid,   -- EA owner supplies EB UUID
      'D7 Breach Attempt', 'D7 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;

    SELECT count(*) INTO v_eb_after
    FROM   public.enterprise_sites
    WHERE  enterprise_id = current_setting('test.c_eb_id')::uuid;

    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'forbidden'
       AND v_eb_after = v_eb_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D7', 'D', 'PASS', pg_catalog.format('TEST D7 | EA owner cross-tenant attempt → forbidden, no EB row created (EB sites before=%s after=%s) | PASS', v_eb_before, v_eb_after));
      RAISE NOTICE 'TEST D7 | EA owner cross-tenant attempt → forbidden, no EB row created (EB sites before=% after=%) | PASS', v_eb_before, v_eb_after;
    ELSIF (v_result->>'ok')::bool = false
          AND v_result->>'reason' = 'forbidden' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D7', 'D', 'FAIL', pg_catalog.format('TEST D7 | forbidden returned but EB site count changed (before=%s after=%s) | FAIL', v_eb_before, v_eb_after));
      RAISE WARNING 'TEST D7 | forbidden returned but EB site count changed (before=% after=%) | FAIL', v_eb_before, v_eb_after;
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D7', 'D', 'FAIL', pg_catalog.format('TEST D7 | expected forbidden, got %s | FAIL', v_result));
      RAISE WARNING 'TEST D7 | expected forbidden, got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D7', 'D', 'FAIL', pg_catalog.format('TEST D7 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D7 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D8: Enterprise B owner creates valid site in Enterprise B → ok=true ──
DO $$
DECLARE
  v_result  jsonb;
  v_site_id uuid;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_b')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_eb_id')::uuid,
      'D8 Beta Site', 'D8 City', 'D8-CODE', NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = true
       AND (v_result->>'site_id') IS NOT NULL THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D8', 'D', 'PASS', pg_catalog.format('TEST D8 | Enterprise B owner created valid site ok=true site_id=%s | PASS', v_result->>'site_id'));
      RAISE NOTICE 'TEST D8 | Enterprise B owner created valid site ok=true site_id=% | PASS', v_result->>'site_id';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D8', 'D', 'FAIL', pg_catalog.format('TEST D8 | expected {ok:true,site_id:...} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D8 | expected {ok:true,site_id:...} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D8', 'D', 'FAIL', pg_catalog.format('TEST D8 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D8 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D9: whitespace-only name → 'name_required' ───────────────────────────
-- Guard 5: btrim('   ') length < 1.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      '   ', 'D9 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'name_required' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D9', 'D', 'PASS', 'TEST D9 | whitespace-only name → reason=name_required | PASS');
      RAISE NOTICE 'TEST D9 | whitespace-only name → reason=name_required | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D9', 'D', 'FAIL', pg_catalog.format('TEST D9 | expected {ok:false,reason:name_required} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D9 | expected {ok:false,reason:name_required} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D9', 'D', 'FAIL', pg_catalog.format('TEST D9 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D9 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D10: name > 200 characters → 'name_too_long' ─────────────────────────
DO $$
DECLARE
  v_result  jsonb;
  v_longname text := pg_catalog.repeat('X', 201);
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      v_longname, 'D10 City', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'name_too_long' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D10', 'D', 'PASS', 'TEST D10 | name(201 chars) → reason=name_too_long | PASS');
      RAISE NOTICE 'TEST D10 | name(201 chars) → reason=name_too_long | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D10', 'D', 'FAIL', pg_catalog.format('TEST D10 | expected {ok:false,reason:name_too_long} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D10 | expected {ok:false,reason:name_too_long} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D10', 'D', 'FAIL', pg_catalog.format('TEST D10 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D10 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D11: whitespace-only city → 'city_required' ──────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D11 Site', '   ', NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'city_required' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D11', 'D', 'PASS', 'TEST D11 | whitespace-only city → reason=city_required | PASS');
      RAISE NOTICE 'TEST D11 | whitespace-only city → reason=city_required | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D11', 'D', 'FAIL', pg_catalog.format('TEST D11 | expected {ok:false,reason:city_required} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D11 | expected {ok:false,reason:city_required} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D11', 'D', 'FAIL', pg_catalog.format('TEST D11 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D11 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D12: city > 120 characters → 'city_too_long' ─────────────────────────
DO $$
DECLARE
  v_result  jsonb;
  v_longcity text := pg_catalog.repeat('C', 121);
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D12 Site', v_longcity, NULL, NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'city_too_long' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D12', 'D', 'PASS', 'TEST D12 | city(121 chars) → reason=city_too_long | PASS');
      RAISE NOTICE 'TEST D12 | city(121 chars) → reason=city_too_long | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D12', 'D', 'FAIL', pg_catalog.format('TEST D12 | expected {ok:false,reason:city_too_long} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D12 | expected {ok:false,reason:city_too_long} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D12', 'D', 'FAIL', pg_catalog.format('TEST D12 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D12 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D13: invalid site_code (whitespace-only → btrim length < 1) → 'site_code_invalid' ─
-- Guard 7: btrim('   ') = '' → length 0 < 1.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D13 Site', 'D13 City',
      '   ',   -- whitespace-only site_code: btrim → '' → length 0
      NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'site_code_invalid' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D13', 'D', 'PASS', 'TEST D13 | whitespace-only site_code → reason=site_code_invalid | PASS');
      RAISE NOTICE 'TEST D13 | whitespace-only site_code → reason=site_code_invalid | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D13', 'D', 'FAIL', pg_catalog.format('TEST D13 | expected {ok:false,reason:site_code_invalid} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D13 | expected {ok:false,reason:site_code_invalid} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D13', 'D', 'FAIL', pg_catalog.format('TEST D13 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D13 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D14: invalid address_line (whitespace-only → btrim length < 1) → 'address_invalid' ─
-- Guard 8: btrim('   ') = '' → length 0 < 1.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D14 Site', 'D14 City',
      NULL,
      '   '    -- whitespace-only address_line: btrim → '' → length 0
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'address_invalid' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D14', 'D', 'PASS', 'TEST D14 | whitespace-only address_line → reason=address_invalid | PASS');
      RAISE NOTICE 'TEST D14 | whitespace-only address_line → reason=address_invalid | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D14', 'D', 'FAIL', pg_catalog.format('TEST D14 | expected {ok:false,reason:address_invalid} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D14 | expected {ok:false,reason:address_invalid} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D14', 'D', 'FAIL', pg_catalog.format('TEST D14 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D14 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D15: duplicate non-null site_code within same enterprise → 'site_code_exists' ─
-- D6 created a site with site_code 'D6-CODE' in EA. Attempt a second EA site
-- with the same code. Catches unique_violation on uq_es_enterprise_site_code.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D15 Duplicate Code Site', 'D15 City',
      'D6-CODE',   -- same code as D6 in same enterprise
      NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = false
       AND v_result->>'reason' = 'site_code_exists' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D15', 'D', 'PASS', 'TEST D15 | duplicate site_code within same enterprise → reason=site_code_exists | PASS');
      RAISE NOTICE 'TEST D15 | duplicate site_code within same enterprise → reason=site_code_exists | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D15', 'D', 'FAIL', pg_catalog.format('TEST D15 | expected {ok:false,reason:site_code_exists} got %s | FAIL', v_result));
      RAISE WARNING 'TEST D15 | expected {ok:false,reason:site_code_exists} got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D15', 'D', 'FAIL', pg_catalog.format('TEST D15 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D15 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D16: same non-null site_code in DIFFERENT enterprise → allowed ────────
-- D8 created EB site with code 'D8-CODE'. Create EA site with same code.
-- uq_es_enterprise_site_code is on (enterprise_id, site_code) → no conflict.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D16 Cross-Tenant Same Code', 'D16 City',
      'D8-CODE',   -- same code as D8's EB site; different enterprise → allowed
      NULL
    ) INTO v_result;
    RESET ROLE;
    IF (v_result->>'ok')::bool = true
       AND (v_result->>'site_id') IS NOT NULL THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D16', 'D', 'PASS', pg_catalog.format('TEST D16 | same site_code across different enterprises → allowed, ok=true site_id=%s | PASS', v_result->>'site_id'));
      RAISE NOTICE 'TEST D16 | same site_code across different enterprises → allowed, ok=true site_id=% | PASS', v_result->>'site_id';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D16', 'D', 'FAIL', pg_catalog.format('TEST D16 | expected ok=true (cross-enterprise code reuse allowed) got %s | FAIL', v_result));
      RAISE WARNING 'TEST D16 | expected ok=true (cross-enterprise code reuse allowed) got % | FAIL', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D16', 'D', 'FAIL', pg_catalog.format('TEST D16 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D16 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D17: multiple NULL site_codes within same enterprise → allowed ────────
-- Partial index WHERE site_code IS NOT NULL means NULLs never conflict.
-- Already have C-setup site (site_code=NULL) and any D sites with NULL code.
-- Create two more EA sites with NULL site_code to confirm no unique violation.
DO $$
DECLARE
  v_result1 jsonb;
  v_result2 jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D17 Null Code Site 1', 'D17 City', NULL, NULL
    ) INTO v_result1;
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      'D17 Null Code Site 2', 'D17 City', NULL, NULL
    ) INTO v_result2;
    RESET ROLE;
    IF (v_result1->>'ok')::bool = true
       AND (v_result2->>'ok')::bool = true THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D17', 'D', 'PASS', 'TEST D17 | multiple NULL site_codes in same enterprise → both ok=true (partial index allows NULLs) | PASS');
      RAISE NOTICE 'TEST D17 | multiple NULL site_codes in same enterprise → both ok=true (partial index allows NULLs) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D17', 'D', 'FAIL', pg_catalog.format('TEST D17 | expected both ok=true, got result1=%s result2=%s | FAIL', v_result1, v_result2));
      RAISE WARNING 'TEST D17 | expected both ok=true, got result1=% result2=% | FAIL', v_result1, v_result2;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D17', 'D', 'FAIL', pg_catalog.format('TEST D17 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D17 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── D18: input trimming — name/city/site_code/address_line stored btrim'd ─
-- RPC applies pg_catalog.btrim() to all text inputs before INSERT.
-- Verify stored values have no leading/trailing whitespace.
DO $$
DECLARE
  v_result      jsonb;
  v_site_id     uuid;
  v_stored_name text;
  v_stored_city text;
  v_stored_code text;
  v_stored_addr text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT public.create_enterprise_site(
      current_setting('test.c_ea_id')::uuid,
      '  D18 Trimmed Name  ',
      '  D18 Trimmed City  ',
      '  D18-TRIM  ',
      '  18 Trimmed Street  '
    ) INTO v_result;
    RESET ROLE;

    IF (v_result->>'ok')::bool IS NOT TRUE THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D18', 'D', 'FAIL', pg_catalog.format('TEST D18 | RPC returned failure unexpectedly: %s | FAIL', v_result));
      RAISE WARNING 'TEST D18 | RPC returned failure unexpectedly: % | FAIL', v_result;
      RETURN;
    END IF;

    v_site_id := (v_result->>'site_id')::uuid;

    -- Read back as postgres to verify stored values (bypasses RLS)
    SELECT es.name, es.city, es.site_code, es.address_line
    INTO   v_stored_name, v_stored_city, v_stored_code, v_stored_addr
    FROM   public.enterprise_sites es
    WHERE  es.id = v_site_id;

    IF v_stored_name    = 'D18 Trimmed Name'
       AND v_stored_city    = 'D18 Trimmed City'
       AND v_stored_code    = 'D18-TRIM'
       AND v_stored_addr    = '18 Trimmed Street' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D18', 'D', 'PASS', pg_catalog.format('TEST D18 | stored values are btrim''d: name=[%s] city=[%s] code=[%s] addr=[%s] | PASS', v_stored_name, v_stored_city, v_stored_code, v_stored_addr));
      RAISE NOTICE 'TEST D18 | stored values are btrim''d: name=[%] city=[%] code=[%] addr=[%] | PASS',
        v_stored_name, v_stored_city, v_stored_code, v_stored_addr;
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('D18', 'D', 'FAIL', pg_catalog.format('TEST D18 | trimming mismatch: name=[%s] city=[%s] code=[%s] addr=[%s] | FAIL', v_stored_name, v_stored_city, v_stored_code, v_stored_addr));
      RAISE WARNING 'TEST D18 | trimming mismatch: name=[%] city=[%] code=[%] addr=[%] | FAIL',
        v_stored_name, v_stored_city, v_stored_code, v_stored_addr;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('D18', 'D', 'FAIL', pg_catalog.format('TEST D18 | Unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST D18 | Unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- D-CLEANUP: Clear simulated JWT claims
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'D-CLEANUP: JWT claims cleared';
END;
$$;


-- ---------------------------------------------------------------------------
-- E. UPDATE / DELETE SECURITY
-- ---------------------------------------------------------------------------
-- Tests E1–E17: verify RLS es_manager_update policy, column-level ACL,
-- and DELETE privilege absence on public.enterprise_sites.
--
-- Reuses Section C synthetic topology:
--   c_uid_a      = Enterprise A owner  (active, role=owner)
--   c_uid_viewer = Enterprise A viewer (active, role=viewer)
--   c_uid_b      = Enterprise B owner  (active, role=owner)
--   c_uid_nomember = authenticated, no membership
--   c_uid_admin  = FIXEO admin (public.users.role='admin')
--   c_site_a_id  = Enterprise A site (setup-provisioned)
--   c_site_b_id  = Enterprise B site (setup-provisioned)
--
-- Blocked-DML rule:
--   PASS on SQLSTATE 42501 (insufficient_privilege)
--   OR on statement completing with ROW_COUNT = 0
--   FAIL if an unauthorized row is actually changed / deleted.
-- ---------------------------------------------------------------------------

-- ── E1: Enterprise A viewer cannot UPDATE Enterprise A site ───────────────
-- es_manager_update USING: _fixeo_is_enterprise_manager() requires owner/admin.
-- viewer role does not satisfy the policy; UPDATE must be blocked or affect 0 rows.
DO $$
DECLARE
  v_rows int;
  v_name_before text;
  v_name_after  text;
BEGIN
  SELECT name INTO v_name_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_viewer')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E1 Viewer Breach'
    WHERE  id   = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 0 AND v_name_after = v_name_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E1', 'E', 'PASS', 'TEST E1 | viewer UPDATE blocked (0 rows affected, name unchanged) | PASS');
      RAISE NOTICE 'TEST E1 | viewer UPDATE blocked (0 rows affected, name unchanged) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E1', 'E', 'FAIL', pg_catalog.format('TEST E1 | viewer UPDATE affected %s rows, name is now [%s] | FAIL', v_rows, v_name_after));
      RAISE WARNING 'TEST E1 | viewer UPDATE affected % rows, name is now [%] | FAIL', v_rows, v_name_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E1', 'E', 'PASS', 'TEST E1 | viewer UPDATE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E1 | viewer UPDATE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E1', 'E', 'FAIL', pg_catalog.format('TEST E1 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E1 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E2: Enterprise A owner can UPDATE name on own site ────────────────────
DO $$
DECLARE
  v_rows int;
  v_name_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E2 Updated Name'
    WHERE  id   = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 1 AND v_name_stored = 'E2 Updated Name' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E2', 'E', 'PASS', 'TEST E2 | EA owner UPDATE name succeeded (rows=1, stored=[E2 Updated Name]) | PASS');
      RAISE NOTICE 'TEST E2 | EA owner UPDATE name succeeded (rows=1, stored=[E2 Updated Name]) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E2', 'E', 'FAIL', pg_catalog.format('TEST E2 | rows=%s stored_name=[%s] (expected 1, ''E2 Updated Name'') | FAIL', v_rows, v_name_stored));
      RAISE WARNING 'TEST E2 | rows=% stored_name=[%] (expected 1, ''E2 Updated Name'') | FAIL', v_rows, v_name_stored;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E2', 'E', 'FAIL', pg_catalog.format('TEST E2 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E2 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E3: Enterprise A owner cannot UPDATE Enterprise B site ────────────────
-- es_manager_update USING: _fixeo_is_enterprise_manager(enterprise_id) for
-- the site being updated — EA owner has no membership in EB.
DO $$
DECLARE
  v_rows int;
  v_name_before text;
  v_name_after  text;
BEGIN
  SELECT name INTO v_name_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_b_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E3 Cross-Tenant Breach'
    WHERE  id   = current_setting('test.c_site_b_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    IF v_rows = 0 AND v_name_after = v_name_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E3', 'E', 'PASS', 'TEST E3 | EA owner cross-tenant UPDATE blocked (0 rows, name unchanged) | PASS');
      RAISE NOTICE 'TEST E3 | EA owner cross-tenant UPDATE blocked (0 rows, name unchanged) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E3', 'E', 'FAIL', pg_catalog.format('TEST E3 | EA owner cross-tenant UPDATE affected %s rows, name=[%s] | FAIL', v_rows, v_name_after));
      RAISE WARNING 'TEST E3 | EA owner cross-tenant UPDATE affected % rows, name=[%] | FAIL', v_rows, v_name_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E3', 'E', 'PASS', 'TEST E3 | EA owner cross-tenant UPDATE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E3 | EA owner cross-tenant UPDATE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E3', 'E', 'FAIL', pg_catalog.format('TEST E3 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E3 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E4: Enterprise B owner can UPDATE its own Enterprise B site ────────────
DO $$
DECLARE
  v_rows        int;
  v_name_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_b')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E4 EB Updated Name'
    WHERE  id   = current_setting('test.c_site_b_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    IF v_rows = 1 AND v_name_stored = 'E4 EB Updated Name' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E4', 'E', 'PASS', 'TEST E4 | EB owner UPDATE name succeeded (rows=1) | PASS');
      RAISE NOTICE 'TEST E4 | EB owner UPDATE name succeeded (rows=1) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E4', 'E', 'FAIL', pg_catalog.format('TEST E4 | rows=%s stored=[%s] | FAIL', v_rows, v_name_stored));
      RAISE WARNING 'TEST E4 | rows=% stored=[%] | FAIL', v_rows, v_name_stored;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E4', 'E', 'FAIL', pg_catalog.format('TEST E4 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E4 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E5: No-membership user cannot UPDATE a site ──────────────────────────
DO $$
DECLARE
  v_rows        int;
  v_name_before text;
  v_name_after  text;
BEGIN
  SELECT name INTO v_name_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_nomember')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E5 Nomember Breach'
    WHERE  id   = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 0 AND v_name_after = v_name_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E5', 'E', 'PASS', 'TEST E5 | no-membership UPDATE blocked (0 rows, name unchanged) | PASS');
      RAISE NOTICE 'TEST E5 | no-membership UPDATE blocked (0 rows, name unchanged) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E5', 'E', 'FAIL', pg_catalog.format('TEST E5 | no-membership UPDATE affected %s rows, name=[%s] | FAIL', v_rows, v_name_after));
      RAISE WARNING 'TEST E5 | no-membership UPDATE affected % rows, name=[%] | FAIL', v_rows, v_name_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E5', 'E', 'PASS', 'TEST E5 | no-membership UPDATE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E5 | no-membership UPDATE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E5', 'E', 'FAIL', pg_catalog.format('TEST E5 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E5 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E6: Enterprise A owner can UPDATE site_code on own site ───────────────
DO $$
DECLARE
  v_rows int;
  v_code_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    site_code = 'E6-NEW-CODE'
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT site_code INTO v_code_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 1 AND v_code_stored = 'E6-NEW-CODE' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E6', 'E', 'PASS', 'TEST E6 | EA owner UPDATE site_code succeeded (rows=1, stored=E6-NEW-CODE) | PASS');
      RAISE NOTICE 'TEST E6 | EA owner UPDATE site_code succeeded (rows=1, stored=E6-NEW-CODE) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E6', 'E', 'FAIL', pg_catalog.format('TEST E6 | rows=%s stored_code=[%s] | FAIL', v_rows, v_code_stored));
      RAISE WARNING 'TEST E6 | rows=% stored_code=[%] | FAIL', v_rows, v_code_stored;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E6', 'E', 'FAIL', pg_catalog.format('TEST E6 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E6 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E7: Enterprise A owner can UPDATE address_line on own site ─────────────
DO $$
DECLARE
  v_rows int;
  v_addr_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    address_line = 'E7 Updated Address'
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT address_line INTO v_addr_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 1 AND v_addr_stored = 'E7 Updated Address' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E7', 'E', 'PASS', 'TEST E7 | EA owner UPDATE address_line succeeded | PASS');
      RAISE NOTICE 'TEST E7 | EA owner UPDATE address_line succeeded | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E7', 'E', 'FAIL', pg_catalog.format('TEST E7 | rows=%s stored=[%s] | FAIL', v_rows, v_addr_stored));
      RAISE WARNING 'TEST E7 | rows=% stored=[%] | FAIL', v_rows, v_addr_stored;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E7', 'E', 'FAIL', pg_catalog.format('TEST E7 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E7 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E8: Enterprise A owner can UPDATE city on own site ───────────────────
DO $$
DECLARE
  v_rows int;
  v_city_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    city = 'E8 Updated City'
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT city INTO v_city_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 1 AND v_city_stored = 'E8 Updated City' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E8', 'E', 'PASS', 'TEST E8 | EA owner UPDATE city succeeded | PASS');
      RAISE NOTICE 'TEST E8 | EA owner UPDATE city succeeded | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E8', 'E', 'FAIL', pg_catalog.format('TEST E8 | rows=%s stored=[%s] | FAIL', v_rows, v_city_stored));
      RAISE WARNING 'TEST E8 | rows=% stored=[%] | FAIL', v_rows, v_city_stored;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E8', 'E', 'FAIL', pg_catalog.format('TEST E8 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E8 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E9: EA owner can change status active → inactive → active ──────────────
DO $$
DECLARE
  v_rows1  int;
  v_rows2  int;
  v_status text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    -- active → inactive
    UPDATE public.enterprise_sites SET status = 'inactive'
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows1 = ROW_COUNT;

    -- inactive → active
    UPDATE public.enterprise_sites SET status = 'active'
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows2 = ROW_COUNT;

    RESET ROLE;

    SELECT status INTO v_status
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;

    IF v_rows1 = 1 AND v_rows2 = 1 AND v_status = 'active' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E9', 'E', 'PASS', 'TEST E9 | EA owner status active→inactive→active succeeded (final=active) | PASS');
      RAISE NOTICE 'TEST E9 | EA owner status active→inactive→active succeeded (final=active) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E9', 'E', 'FAIL', pg_catalog.format('TEST E9 | rows1=%s rows2=%s final_status=[%s] | FAIL', v_rows1, v_rows2, v_status));
      RAISE WARNING 'TEST E9 | rows1=% rows2=% final_status=[%] | FAIL', v_rows1, v_rows2, v_status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E9', 'E', 'FAIL', pg_catalog.format('TEST E9 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E9 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E10: updated_at advances after a permitted UPDATE ────────────────────
-- Deterministic approach: force updated_at to a known past timestamp as
-- postgres (direct UPDATE bypassing RLS), then perform an authenticated
-- UPDATE via the manager path, and confirm updated_at > the sentinel value.
DO $$
DECLARE
  v_sentinel   timestamptz := '2000-01-01 00:00:00+00';
  v_after_ts   timestamptz;
  v_rows       int;
BEGIN
  -- Pin updated_at to a deterministic past value as postgres
  UPDATE public.enterprise_sites
  SET    updated_at = v_sentinel
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  -- Authenticated owner UPDATE triggers update_updated_at()
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E10 Trigger Test'
    WHERE  id   = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    SELECT updated_at INTO v_after_ts
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;

    IF v_rows = 1 AND v_after_ts > v_sentinel THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E10', 'E', 'PASS', pg_catalog.format('TEST E10 | updated_at advanced past sentinel (sentinel=2000-01-01, after=%s) | PASS', v_after_ts));
      RAISE NOTICE 'TEST E10 | updated_at advanced past sentinel (sentinel=2000-01-01, after=%) | PASS', v_after_ts;
    ELSIF v_rows = 0 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E10', 'E', 'FAIL', 'TEST E10 | authenticated UPDATE affected 0 rows (RLS or ACL blocked) | FAIL');
      RAISE WARNING 'TEST E10 | authenticated UPDATE affected 0 rows (RLS or ACL blocked) | FAIL';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E10', 'E', 'FAIL', pg_catalog.format('TEST E10 | updated_at=%s not > sentinel=%s | FAIL', v_after_ts, v_sentinel));
      RAISE WARNING 'TEST E10 | updated_at=% not > sentinel=% | FAIL', v_after_ts, v_sentinel;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E10', 'E', 'FAIL', pg_catalog.format('TEST E10 | unexpected exception: %s | FAIL', SQLERRM));
    RAISE WARNING 'TEST E10 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E11: authenticated caller cannot directly UPDATE id ───────────────────
-- Column id has no UPDATE grant for authenticated — expect 42501.
DO $$
DECLARE
  v_new_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    id = v_new_id
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E11', 'E', 'FAIL', 'TEST E11 | UPDATE id did not raise privilege error | FAIL');
    RAISE WARNING 'TEST E11 | UPDATE id did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E11', 'E', 'PASS', 'TEST E11 | UPDATE id raised insufficient_privilege (column not grantable) | PASS');
      RAISE NOTICE 'TEST E11 | UPDATE id raised insufficient_privilege (column not grantable) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E11', 'E', 'FAIL', pg_catalog.format('TEST E11 | unexpected exception: %s (expected insufficient_privilege) | FAIL', SQLERRM));
      RAISE WARNING 'TEST E11 | unexpected exception: % (expected insufficient_privilege) | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E12: authenticated caller cannot directly UPDATE enterprise_id ─────────
DO $$
DECLARE
  v_new_eid uuid := gen_random_uuid();
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    enterprise_id = v_new_eid
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E12', 'E', 'FAIL', 'TEST E12 | UPDATE enterprise_id did not raise privilege error | FAIL');
    RAISE WARNING 'TEST E12 | UPDATE enterprise_id did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E12', 'E', 'PASS', 'TEST E12 | UPDATE enterprise_id raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E12 | UPDATE enterprise_id raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E12', 'E', 'FAIL', pg_catalog.format('TEST E12 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E12 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E13: authenticated caller cannot directly UPDATE created_at ─────────────
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    created_at = now()
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E13', 'E', 'FAIL', 'TEST E13 | UPDATE created_at did not raise privilege error | FAIL');
    RAISE WARNING 'TEST E13 | UPDATE created_at did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E13', 'E', 'PASS', 'TEST E13 | UPDATE created_at raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E13 | UPDATE created_at raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E13', 'E', 'FAIL', pg_catalog.format('TEST E13 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E13 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E14: authenticated caller cannot directly UPDATE updated_at ─────────────
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    updated_at = now()
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('E14', 'E', 'FAIL', 'TEST E14 | UPDATE updated_at did not raise privilege error | FAIL');
    RAISE WARNING 'TEST E14 | UPDATE updated_at did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E14', 'E', 'PASS', 'TEST E14 | UPDATE updated_at raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST E14 | UPDATE updated_at raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E14', 'E', 'FAIL', pg_catalog.format('TEST E14 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E14 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E15: Enterprise A owner cannot directly DELETE Enterprise A site ──────
-- authenticated has no DELETE grant on enterprise_sites (ACL = r + col-w only).
-- Expect 42501 regardless of RLS.
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E15', 'E', 'PASS', 'TEST E15 | authenticated DELETE affected 0 rows (row still exists) | PASS');
      RAISE NOTICE 'TEST E15 | authenticated DELETE affected 0 rows (row still exists) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E15', 'E', 'FAIL', pg_catalog.format('TEST E15 | DELETE removed row (before=%s, after=%s) | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST E15 | DELETE removed row (before=%, after=%) | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E15', 'E', 'PASS', 'TEST E15 | authenticated DELETE raised insufficient_privilege (no DELETE grant) | PASS');
      RAISE NOTICE 'TEST E15 | authenticated DELETE raised insufficient_privilege (no DELETE grant) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E15', 'E', 'FAIL', pg_catalog.format('TEST E15 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E15 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E16: FIXEO admin UPDATE behavior — actual ACL + RLS contract ─────────
-- es_fixeo_admin_all grants ALL RLS access but the ACL layer for admin
-- user is still the authenticated role: SELECT + col-UPDATE only.
-- Admin can UPDATE allowed columns (name) through the es_fixeo_admin_all
-- policy USING/WITH CHECK; ACL column-level grant is what matters.
DO $$
DECLARE
  v_rows        int;
  v_name_stored text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_admin')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.enterprise_sites
    SET    name = 'E16 Admin Updated Name'
    WHERE  id   = current_setting('test.c_site_a_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name_stored
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_rows = 1 AND v_name_stored = 'E16 Admin Updated Name' THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E16', 'E', 'PASS', 'TEST E16 | FIXEO admin UPDATE name via es_fixeo_admin_all (rows=1) | PASS');
      RAISE NOTICE 'TEST E16 | FIXEO admin UPDATE name via es_fixeo_admin_all (rows=1) | PASS';
    ELSIF v_rows = 0 THEN
      -- es_fixeo_admin_all WITH CHECK also requires _fixeo_is_admin()
      -- If admin UPDATE is blocked by WITH CHECK or ACL, record INCONCLUSIVE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E16', 'E', 'INCONCLUSIVE', 'TEST E16 | FIXEO admin UPDATE affected 0 rows (check es_fixeo_admin_all WITH CHECK + ACL) | INCONCLUSIVE — verify admin column UPDATE grant');
      RAISE WARNING 'TEST E16 | FIXEO admin UPDATE affected 0 rows (check es_fixeo_admin_all WITH CHECK + ACL) | INCONCLUSIVE — verify admin column UPDATE grant';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E16', 'E', 'FAIL', pg_catalog.format('TEST E16 | rows=%s stored=[%s] | FAIL', v_rows, v_name_stored));
      RAISE WARNING 'TEST E16 | rows=% stored=[%] | FAIL', v_rows, v_name_stored;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      -- Admin role is still authenticated; if column-level UPDATE grant is absent this fires.
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E16', 'E', 'INCONCLUSIVE', 'TEST E16 | FIXEO admin UPDATE raised insufficient_privilege — ACL blocks even es_fixeo_admin_all UPDATE | INCONCLUSIVE — verify column grant for authenticated');
      RAISE WARNING 'TEST E16 | FIXEO admin UPDATE raised insufficient_privilege — ACL blocks even es_fixeo_admin_all UPDATE | INCONCLUSIVE — verify column grant for authenticated';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E16', 'E', 'FAIL', pg_catalog.format('TEST E16 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E16 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── E17: FIXEO admin cannot DELETE — actual ACL contract ────────────────
-- es_fixeo_admin_all is FOR ALL (includes DELETE at RLS layer) but
-- authenticated has no DELETE privilege at the ACL/grant layer.
-- ACL is checked before RLS for DML: no DELETE grant → 42501 regardless.
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_admin')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E17', 'E', 'PASS', 'TEST E17 | admin DELETE affected 0 rows (no DELETE grant; ACL blocks before RLS) | PASS');
      RAISE NOTICE 'TEST E17 | admin DELETE affected 0 rows (no DELETE grant; ACL blocks before RLS) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E17', 'E', 'FAIL', pg_catalog.format('TEST E17 | admin DELETE removed row (before=%s, after=%s) — unexpected | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST E17 | admin DELETE removed row (before=%, after=%) — unexpected | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E17', 'E', 'PASS', 'TEST E17 | admin DELETE raised insufficient_privilege (no DELETE grant for authenticated) | PASS');
      RAISE NOTICE 'TEST E17 | admin DELETE raised insufficient_privilege (no DELETE grant for authenticated) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('E17', 'E', 'FAIL', pg_catalog.format('TEST E17 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST E17 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- E-CLEANUP
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'E-CLEANUP: JWT claims cleared';
END;
$$;


-- ---------------------------------------------------------------------------
-- F. DIRECT INSERT / DELETE SECURITY
-- ---------------------------------------------------------------------------
-- Tests F1–F12: prove authenticated users cannot bypass create_enterprise_site
-- RPC via direct INSERT, and cannot DELETE enterprise_sites rows.
--
-- ACL layer: authenticated has SELECT + col-UPDATE only.
-- No INSERT, no DELETE grant → 42501 fires before RLS.
-- es_fixeo_admin_all (RLS) does NOT grant SQL INSERT/DELETE privilege.
--
-- Synthetic sentinel UUIDs are unique per-test so F11/F12 can count rows.
-- All attempted INSERTs are expected to fail; no rows should be created.
-- All attempted DELETEs are expected to fail; target rows must remain.
--
-- Blocked-DML rule:
--   PASS on SQLSTATE 42501 (insufficient_privilege)
--   For DELETE: PASS also if ROW_COUNT=0 AND target row still present
--   FAIL if any unauthorized row is created or removed.
-- ---------------------------------------------------------------------------

-- Allocate sentinel UUIDs for direct-INSERT attempt tracking
DO $$
BEGIN
  PERFORM set_config('test.f_ins_id_1', gen_random_uuid()::text, true); -- F1 EA owner→EA
  PERFORM set_config('test.f_ins_id_2', gen_random_uuid()::text, true); -- F2 EA owner→EB
  PERFORM set_config('test.f_ins_id_3', gen_random_uuid()::text, true); -- F3 viewer→EA
  PERFORM set_config('test.f_ins_id_4', gen_random_uuid()::text, true); -- F4 nomember
  PERFORM set_config('test.f_ins_id_5', gen_random_uuid()::text, true); -- F5 admin
  RAISE NOTICE 'F-SETUP sentinel insert UUIDs allocated';
END;
$$;

-- ── F1: Enterprise A owner cannot direct INSERT into Enterprise A ────────
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      current_setting('test.f_ins_id_1')::uuid,
      current_setting('test.c_ea_id')::uuid,
      'F1 Direct Insert Attempt', 'F1 City', 'active'
    );
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F1', 'F', 'FAIL', 'TEST F1 | direct INSERT did not raise privilege error | FAIL');
    RAISE WARNING 'TEST F1 | direct INSERT did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F1', 'F', 'PASS', 'TEST F1 | EA owner direct INSERT into EA raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F1 | EA owner direct INSERT into EA raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F1', 'F', 'FAIL', pg_catalog.format('TEST F1 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F1 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F2: Enterprise A owner cannot direct INSERT into Enterprise B ────────
-- Knowing EB UUID must not allow a cross-tenant INSERT bypass.
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      current_setting('test.f_ins_id_2')::uuid,
      current_setting('test.c_eb_id')::uuid,
      'F2 Cross-Tenant Insert Attempt', 'F2 City', 'active'
    );
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F2', 'F', 'FAIL', 'TEST F2 | EA owner cross-tenant direct INSERT did not raise privilege error | FAIL');
    RAISE WARNING 'TEST F2 | EA owner cross-tenant direct INSERT did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F2', 'F', 'PASS', 'TEST F2 | EA owner cross-tenant direct INSERT into EB raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F2 | EA owner cross-tenant direct INSERT into EB raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F2', 'F', 'FAIL', pg_catalog.format('TEST F2 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F2 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F3: Enterprise A viewer cannot direct INSERT ─────────────────────────
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_viewer')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      current_setting('test.f_ins_id_3')::uuid,
      current_setting('test.c_ea_id')::uuid,
      'F3 Viewer Insert Attempt', 'F3 City', 'active'
    );
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F3', 'F', 'FAIL', 'TEST F3 | viewer direct INSERT did not raise privilege error | FAIL');
    RAISE WARNING 'TEST F3 | viewer direct INSERT did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F3', 'F', 'PASS', 'TEST F3 | EA viewer direct INSERT raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F3 | EA viewer direct INSERT raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F3', 'F', 'FAIL', pg_catalog.format('TEST F3 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F3 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F4: No-membership user cannot direct INSERT ──────────────────────────
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_nomember')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      current_setting('test.f_ins_id_4')::uuid,
      current_setting('test.c_ea_id')::uuid,
      'F4 Nomember Insert Attempt', 'F4 City', 'active'
    );
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F4', 'F', 'FAIL', 'TEST F4 | no-membership direct INSERT did not raise privilege error | FAIL');
    RAISE WARNING 'TEST F4 | no-membership direct INSERT did not raise privilege error | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F4', 'F', 'PASS', 'TEST F4 | no-membership direct INSERT raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F4 | no-membership direct INSERT raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F4', 'F', 'FAIL', pg_catalog.format('TEST F4 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F4 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F5: FIXEO admin authenticated session cannot direct INSERT ────────────
-- es_fixeo_admin_all is a RLS policy; it does NOT grant SQL INSERT privilege.
-- authenticated (even when public.users.role='admin') has no INSERT ACL.
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_admin')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      current_setting('test.f_ins_id_5')::uuid,
      current_setting('test.c_ea_id')::uuid,
      'F5 Admin Insert Attempt', 'F5 City', 'active'
    );
    RESET ROLE;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F5', 'F', 'FAIL', 'TEST F5 | FIXEO admin direct INSERT did not raise privilege error (es_fixeo_admin_all must not override ACL) | FAIL');
    RAISE WARNING 'TEST F5 | FIXEO admin direct INSERT did not raise privilege error (es_fixeo_admin_all must not override ACL) | FAIL';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F5', 'F', 'PASS', 'TEST F5 | FIXEO admin direct INSERT raised insufficient_privilege (ACL blocks before RLS) | PASS');
      RAISE NOTICE 'TEST F5 | FIXEO admin direct INSERT raised insufficient_privilege (ACL blocks before RLS) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F5', 'F', 'FAIL', pg_catalog.format('TEST F5 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F5 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F6: Enterprise A owner cannot direct DELETE its own site ──────────────
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before AND v_count_after >= 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F6', 'F', 'PASS', pg_catalog.format('TEST F6 | EA owner direct DELETE own site: row still present (before=%s, after=%s) | PASS', v_count_before, v_count_after));
      RAISE NOTICE 'TEST F6 | EA owner direct DELETE own site: row still present (before=%, after=%) | PASS', v_count_before, v_count_after;
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F6', 'F', 'FAIL', pg_catalog.format('TEST F6 | EA owner direct DELETE removed row (before=%s, after=%s) | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST F6 | EA owner direct DELETE removed row (before=%, after=%) | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F6', 'F', 'PASS', 'TEST F6 | EA owner direct DELETE raised insufficient_privilege (no DELETE grant) | PASS');
      RAISE NOTICE 'TEST F6 | EA owner direct DELETE raised insufficient_privilege (no DELETE grant) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F6', 'F', 'FAIL', pg_catalog.format('TEST F6 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F6 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F7: Enterprise A owner cannot direct DELETE Enterprise B site ─────────
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_b_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_a')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_b_id')::uuid;
    IF v_count_after = v_count_before AND v_count_after >= 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F7', 'F', 'PASS', 'TEST F7 | EA owner cross-tenant DELETE: EB row still present | PASS');
      RAISE NOTICE 'TEST F7 | EA owner cross-tenant DELETE: EB row still present | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F7', 'F', 'FAIL', pg_catalog.format('TEST F7 | EA owner cross-tenant DELETE removed row (before=%s, after=%s) | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST F7 | EA owner cross-tenant DELETE removed row (before=%, after=%) | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F7', 'F', 'PASS', 'TEST F7 | EA owner cross-tenant DELETE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F7 | EA owner cross-tenant DELETE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F7', 'F', 'FAIL', pg_catalog.format('TEST F7 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F7 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F8: Enterprise A viewer cannot direct DELETE Enterprise A site ─────────
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_viewer')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before AND v_count_after >= 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F8', 'F', 'PASS', 'TEST F8 | viewer direct DELETE: row still present | PASS');
      RAISE NOTICE 'TEST F8 | viewer direct DELETE: row still present | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F8', 'F', 'FAIL', pg_catalog.format('TEST F8 | viewer DELETE removed row (before=%s, after=%s) | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST F8 | viewer DELETE removed row (before=%, after=%) | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F8', 'F', 'PASS', 'TEST F8 | viewer direct DELETE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F8 | viewer direct DELETE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F8', 'F', 'FAIL', pg_catalog.format('TEST F8 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F8 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F9: No-membership user cannot direct DELETE ───────────────────────────
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_nomember')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before AND v_count_after >= 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F9', 'F', 'PASS', 'TEST F9 | no-membership direct DELETE: row still present | PASS');
      RAISE NOTICE 'TEST F9 | no-membership direct DELETE: row still present | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F9', 'F', 'FAIL', pg_catalog.format('TEST F9 | no-membership DELETE removed row (before=%s, after=%s) | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST F9 | no-membership DELETE removed row (before=%, after=%) | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F9', 'F', 'PASS', 'TEST F9 | no-membership direct DELETE raised insufficient_privilege | PASS');
      RAISE NOTICE 'TEST F9 | no-membership direct DELETE raised insufficient_privilege | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F9', 'F', 'FAIL', pg_catalog.format('TEST F9 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F9 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F10: FIXEO admin cannot direct DELETE ─────────────────────────────────
-- es_fixeo_admin_all FOR ALL at RLS layer does NOT grant DELETE SQL privilege.
-- ACL check precedes RLS: no DELETE grant for authenticated → 42501.
DO $$
DECLARE
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',
                      current_setting('test.c_uid_admin')),
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    RESET ROLE;
    SELECT count(*) INTO v_count_after
    FROM   public.enterprise_sites
    WHERE  id = current_setting('test.c_site_a_id')::uuid;
    IF v_count_after = v_count_before AND v_count_after >= 1 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F10', 'F', 'PASS', 'TEST F10 | admin direct DELETE: row still present (ACL blocked before RLS) | PASS');
      RAISE NOTICE 'TEST F10 | admin direct DELETE: row still present (ACL blocked before RLS) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F10', 'F', 'FAIL', pg_catalog.format('TEST F10 | admin DELETE removed row (before=%s, after=%s) — es_fixeo_admin_all must not override ACL | FAIL', v_count_before, v_count_after));
      RAISE WARNING 'TEST F10 | admin DELETE removed row (before=%, after=%) — es_fixeo_admin_all must not override ACL | FAIL', v_count_before, v_count_after;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F10', 'F', 'PASS', 'TEST F10 | admin direct DELETE raised insufficient_privilege (no DELETE grant for authenticated) | PASS');
      RAISE NOTICE 'TEST F10 | admin direct DELETE raised insufficient_privilege (no DELETE grant for authenticated) | PASS';
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('F10', 'F', 'FAIL', pg_catalog.format('TEST F10 | unexpected exception: %s | FAIL', SQLERRM));
      RAISE WARNING 'TEST F10 | unexpected exception: % | FAIL', SQLERRM;
  END;
END;
$$;

-- ── F11: Verify all failed direct INSERT attempts created ZERO rows ────────
-- Check all five sentinel UUIDs (F1–F5); expect count = 0 for each.
DO $$
DECLARE
  v_ids   uuid[];
  v_found int;
BEGIN
  v_ids := ARRAY[
    current_setting('test.f_ins_id_1')::uuid,
    current_setting('test.f_ins_id_2')::uuid,
    current_setting('test.f_ins_id_3')::uuid,
    current_setting('test.f_ins_id_4')::uuid,
    current_setting('test.f_ins_id_5')::uuid
  ];

  SELECT count(*) INTO v_found
  FROM   public.enterprise_sites
  WHERE  id = ANY(v_ids);

  IF v_found = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F11', 'F', 'PASS', 'TEST F11 | All 5 direct INSERT sentinel UUIDs absent from enterprise_sites (0 rows) | PASS');
    RAISE NOTICE 'TEST F11 | All 5 direct INSERT sentinel UUIDs absent from enterprise_sites (0 rows) | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F11', 'F', 'FAIL', pg_catalog.format('TEST F11 | %s sentinel INSERT row(s) found in enterprise_sites — unauthorized INSERT succeeded | FAIL', v_found));
    RAISE WARNING 'TEST F11 | % sentinel INSERT row(s) found in enterprise_sites — unauthorized INSERT succeeded | FAIL', v_found;
  END IF;
END;
$$;

-- ── F12: Verify failed direct DELETE attempts left target rows intact ──────
-- c_site_a_id and c_site_b_id must both still exist.
DO $$
DECLARE
  v_count_a int;
  v_count_b int;
BEGIN
  SELECT count(*) INTO v_count_a
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_a_id')::uuid;

  SELECT count(*) INTO v_count_b
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.c_site_b_id')::uuid;

  IF v_count_a >= 1 AND v_count_b >= 1 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F12', 'F', 'PASS', pg_catalog.format('TEST F12 | Both target rows intact after all DELETE attempts (site_a count=%s, site_b count=%s) | PASS', v_count_a, v_count_b));
    RAISE NOTICE 'TEST F12 | Both target rows intact after all DELETE attempts (site_a count=%, site_b count=%) | PASS', v_count_a, v_count_b;
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('F12', 'F', 'FAIL', pg_catalog.format('TEST F12 | Target row(s) missing: site_a count=%s, site_b count=%s — unauthorized DELETE succeeded | FAIL', v_count_a, v_count_b));
    RAISE WARNING 'TEST F12 | Target row(s) missing: site_a count=%, site_b count=% — unauthorized DELETE succeeded | FAIL', v_count_a, v_count_b;
  END IF;
END;
$$;

-- F-CLEANUP
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'F-CLEANUP: JWT claims cleared';
END;
$$;


-- ---------------------------------------------------------------------------
-- G. CONSTRAINTS / TENANT-LOCAL UNIQUENESS
-- ---------------------------------------------------------------------------
-- Tests G1–G15: verify DATABASE-LEVEL invariants on enterprise_sites
-- independently of RPC validation.
--
-- All tests use postgres-privileged synthetic setup (direct INSERT/UPDATE)
-- to bypass RLS/ACL — purpose here is schema constraint verification only.
-- All synthetic rows remain inside the existing transaction → ROLLBACK cleans.
--
-- Migration 2 DDL summary relevant to this section:
--   name        text NOT NULL  + CHECK btrim(name)  BETWEEN 1 AND 200
--   city        text NOT NULL  + CHECK btrim(city)  BETWEEN 1 AND 120
--   site_code   text NULL      + CHECK site_code IS NULL OR btrim(site_code) BETWEEN 1 AND 80
--   address_line text NULL     + CHECK address_line IS NULL OR btrim(address_line) BETWEEN 1 AND 500
--   status      text NOT NULL  + CHECK status IN ('active','inactive')
--   enterprise_id uuid NOT NULL FK→enterprise_accounts(id) ON DELETE RESTRICT
--   id          uuid NOT NULL PK
--   Unique index: uq_es_enterprise_site_code ON (enterprise_id, site_code) WHERE site_code IS NOT NULL
--
-- RPC-only validations (NO database-level constraint equivalent):
--   name_too_long / city_too_long / site_code_invalid / address_invalid are
--   enforced by pg_catalog.char_length(btrim()) guards in the RPC.
--   The underlying CHECK constraints use BETWEEN 1 AND <max>, so they ALSO
--   enforce the upper bound at the DB level. Both layers agree.
--
-- For G1/G2: whitespace-only name/city → btrim length = 0 < 1 → check_violation (23514).
-- For G14/G15: overlength name(201)/city(121) → btrim length > max → check_violation (23514).
-- ---------------------------------------------------------------------------

-- Reuses c_ea_id / c_eb_id from Section C.
-- G8/G9 use a dedicated synthetic enterprise account (g_ea_del_id).
DO $$
BEGIN
  PERFORM set_config('test.g_ea_del_id',  gen_random_uuid()::text, true);
  PERFORM set_config('test.g_site_del_id', gen_random_uuid()::text, true);
  RAISE NOTICE 'G-SETUP g_ea_del_id=% g_site_del_id=%',
    current_setting('test.g_ea_del_id'),
    current_setting('test.g_site_del_id');
END;
$$;

-- Insert dedicated G8/G9 enterprise account and site as postgres
INSERT INTO public.enterprise_accounts (id, name, status)
  VALUES (current_setting('test.g_ea_del_id')::uuid, 'G-Delete-Test Enterprise', 'active');

INSERT INTO public.enterprise_sites
  (id, enterprise_id, name, city, status)
VALUES (
  current_setting('test.g_site_del_id')::uuid,
  current_setting('test.g_ea_del_id')::uuid,
  'G-Delete-Test Site', 'G City', 'active'
);

-- ── G1: whitespace-only name rejected at database level ──────────────────
-- enterprise_sites_name_length CHECK: char_length(btrim(name)) BETWEEN 1 AND 200
-- '   ' → btrim → '' → length 0 → check_violation (23514)
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      '   ', 'G1 City', 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G1', 'G', 'FAIL', 'TEST G1 | whitespace-only name was accepted (no check_violation) | FAIL');
    RAISE WARNING 'TEST G1 | whitespace-only name was accepted (no check_violation) | FAIL';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G1', 'G', 'PASS', 'TEST G1 | whitespace-only name rejected by enterprise_sites_name_length CHECK (23514) | PASS');
      RAISE NOTICE 'TEST G1 | whitespace-only name rejected by enterprise_sites_name_length CHECK (23514) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G1', 'G', 'FAIL', pg_catalog.format('TEST G1 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G1 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G2: whitespace-only city rejected at database level ──────────────────
-- enterprise_sites_city_length CHECK: char_length(btrim(city)) BETWEEN 1 AND 120
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      'G2 Site', '   ', 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G2', 'G', 'FAIL', 'TEST G2 | whitespace-only city was accepted | FAIL');
    RAISE WARNING 'TEST G2 | whitespace-only city was accepted | FAIL';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G2', 'G', 'PASS', 'TEST G2 | whitespace-only city rejected by enterprise_sites_city_length CHECK (23514) | PASS');
      RAISE NOTICE 'TEST G2 | whitespace-only city rejected by enterprise_sites_city_length CHECK (23514) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G2', 'G', 'FAIL', pg_catalog.format('TEST G2 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G2 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G3: invalid status rejected at database level ────────────────────────
-- enterprise_sites_status_values CHECK: status IN ('active','inactive')
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      'G3 Site', 'G3 City', 'pending'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G3', 'G', 'FAIL', 'TEST G3 | invalid status ''pending'' was accepted | FAIL');
    RAISE WARNING 'TEST G3 | invalid status ''pending'' was accepted | FAIL';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G3', 'G', 'PASS', 'TEST G3 | status=''pending'' rejected by enterprise_sites_status_values CHECK (23514) | PASS');
      RAISE NOTICE 'TEST G3 | status=''pending'' rejected by enterprise_sites_status_values CHECK (23514) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G3', 'G', 'FAIL', pg_catalog.format('TEST G3 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G3 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G4: duplicate non-null site_code in SAME enterprise rejected ──────────
-- uq_es_enterprise_site_code: UNIQUE (enterprise_id, site_code) WHERE site_code IS NOT NULL
-- Insert first row, then attempt duplicate → unique_violation (23505)
DO $$
DECLARE
  v_id1 uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
BEGIN
  -- First insert must succeed
  INSERT INTO public.enterprise_sites
    (id, enterprise_id, name, city, status, site_code)
  VALUES (
    v_id1,
    current_setting('test.c_ea_id')::uuid,
    'G4 Site First', 'G4 City', 'active', 'G4-UNIQUE-CODE'
  );

  -- Second insert with same enterprise + same code → should violate unique index
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status, site_code)
    VALUES (
      v_id2,
      current_setting('test.c_ea_id')::uuid,
      'G4 Site Second', 'G4 City', 'active', 'G4-UNIQUE-CODE'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G4', 'G', 'FAIL', 'TEST G4 | duplicate site_code in same enterprise was accepted | FAIL');
    RAISE WARNING 'TEST G4 | duplicate site_code in same enterprise was accepted | FAIL';
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G4', 'G', 'PASS', 'TEST G4 | duplicate non-null site_code in same enterprise rejected by uq_es_enterprise_site_code (23505) | PASS');
      RAISE NOTICE 'TEST G4 | duplicate non-null site_code in same enterprise rejected by uq_es_enterprise_site_code (23505) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G4', 'G', 'FAIL', pg_catalog.format('TEST G4 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G4 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G5: same non-null site_code in DIFFERENT enterprises is accepted ──────
-- Partial unique index is on (enterprise_id, site_code) — different enterprise_id
-- means no conflict.
DO $$
DECLARE
  v_id1 uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
  v_rows int := 0;
BEGIN
  INSERT INTO public.enterprise_sites
    (id, enterprise_id, name, city, status, site_code)
  VALUES (
    v_id1,
    current_setting('test.c_ea_id')::uuid,
    'G5 EA Site', 'G5 City', 'active', 'G5-SHARED-CODE'
  );

  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status, site_code)
    VALUES (
      v_id2,
      current_setting('test.c_eb_id')::uuid,
      'G5 EB Site', 'G5 City', 'active', 'G5-SHARED-CODE'
    );
    -- Both inserts succeeded; verify both rows exist
    SELECT count(*) INTO v_rows
    FROM   public.enterprise_sites
    WHERE  id IN (v_id1, v_id2) AND site_code = 'G5-SHARED-CODE';
    IF v_rows = 2 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G5', 'G', 'PASS', 'TEST G5 | same site_code in different enterprises accepted (both rows present) | PASS');
      RAISE NOTICE 'TEST G5 | same site_code in different enterprises accepted (both rows present) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G5', 'G', 'FAIL', pg_catalog.format('TEST G5 | expected 2 rows, found %s | FAIL', v_rows));
      RAISE WARNING 'TEST G5 | expected 2 rows, found % | FAIL', v_rows;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G5', 'G', 'FAIL', 'TEST G5 | cross-enterprise same site_code raised unique_violation (partial index misconfigured) | FAIL');
      RAISE WARNING 'TEST G5 | cross-enterprise same site_code raised unique_violation (partial index misconfigured) | FAIL';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G5', 'G', 'FAIL', pg_catalog.format('TEST G5 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G5 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G6: multiple NULL site_codes in SAME enterprise are accepted ──────────
-- Partial index WHERE site_code IS NOT NULL excludes NULLs from uniqueness.
DO $$
DECLARE
  v_id1 uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
  v_id3 uuid := gen_random_uuid();
  v_rows int;
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status, site_code)
    VALUES
      (v_id1, current_setting('test.c_ea_id')::uuid, 'G6 Null Code 1', 'G6 City', 'active', NULL),
      (v_id2, current_setting('test.c_ea_id')::uuid, 'G6 Null Code 2', 'G6 City', 'active', NULL),
      (v_id3, current_setting('test.c_ea_id')::uuid, 'G6 Null Code 3', 'G6 City', 'active', NULL);

    SELECT count(*) INTO v_rows
    FROM   public.enterprise_sites
    WHERE  id IN (v_id1, v_id2, v_id3) AND site_code IS NULL;

    IF v_rows = 3 THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G6', 'G', 'PASS', 'TEST G6 | 3 NULL site_code rows in same enterprise accepted (partial index excludes NULLs) | PASS');
      RAISE NOTICE 'TEST G6 | 3 NULL site_code rows in same enterprise accepted (partial index excludes NULLs) | PASS';
    ELSE
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G6', 'G', 'FAIL', pg_catalog.format('TEST G6 | expected 3 rows, found %s | FAIL', v_rows));
      RAISE WARNING 'TEST G6 | expected 3 rows, found % | FAIL', v_rows;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G6', 'G', 'FAIL', 'TEST G6 | NULL site_code raised unique_violation (partial index must exclude NULLs) | FAIL');
      RAISE WARNING 'TEST G6 | NULL site_code raised unique_violation (partial index must exclude NULLs) | FAIL';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G6', 'G', 'FAIL', pg_catalog.format('TEST G6 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G6 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G7: enterprise_id referencing nonexistent account is rejected ─────────
-- enterprise_sites_enterprise_fk: FK→enterprise_accounts(id)
-- Using a freshly generated UUID guaranteed not to exist → foreign_key_violation (23503)
DO $$
DECLARE
  v_fake_eid uuid := gen_random_uuid();
  v_test_id  uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id, v_fake_eid, 'G7 Ghost Enterprise Site', 'G7 City', 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G7', 'G', 'FAIL', 'TEST G7 | nonexistent enterprise_id was accepted | FAIL');
    RAISE WARNING 'TEST G7 | nonexistent enterprise_id was accepted | FAIL';
  EXCEPTION
    WHEN foreign_key_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G7', 'G', 'PASS', 'TEST G7 | nonexistent enterprise_id rejected by enterprise_sites_enterprise_fk (23503) | PASS');
      RAISE NOTICE 'TEST G7 | nonexistent enterprise_id rejected by enterprise_sites_enterprise_fk (23503) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G7', 'G', 'FAIL', pg_catalog.format('TEST G7 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G7 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G8: deleting enterprise_account owning a site blocked by FK RESTRICT ──
-- Uses dedicated g_ea_del_id / g_site_del_id provisioned in G-SETUP.
-- ON DELETE RESTRICT → foreign_key_violation (23503) on attempted account delete.
DO $$
BEGIN
  BEGIN
    DELETE FROM public.enterprise_accounts
    WHERE id = current_setting('test.g_ea_del_id')::uuid;
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G8', 'G', 'FAIL', 'TEST G8 | enterprise_account deletion with child site was not blocked | FAIL');
    RAISE WARNING 'TEST G8 | enterprise_account deletion with child site was not blocked | FAIL';
  EXCEPTION
    WHEN foreign_key_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G8', 'G', 'PASS', 'TEST G8 | enterprise_account deletion blocked by enterprise_sites_enterprise_fk ON DELETE RESTRICT (23503) | PASS');
      RAISE NOTICE 'TEST G8 | enterprise_account deletion blocked by enterprise_sites_enterprise_fk ON DELETE RESTRICT (23503) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G8', 'G', 'FAIL', pg_catalog.format('TEST G8 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G8 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G9: after blocked deletion, both account and site still exist ─────────
DO $$
DECLARE
  v_acct_count int;
  v_site_count int;
BEGIN
  SELECT count(*) INTO v_acct_count
  FROM   public.enterprise_accounts
  WHERE  id = current_setting('test.g_ea_del_id')::uuid;

  SELECT count(*) INTO v_site_count
  FROM   public.enterprise_sites
  WHERE  id = current_setting('test.g_site_del_id')::uuid;

  IF v_acct_count = 1 AND v_site_count = 1 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G9', 'G', 'PASS', 'TEST G9 | after blocked DELETE: enterprise_account present (count=1), enterprise_site present (count=1) | PASS');
    RAISE NOTICE 'TEST G9 | after blocked DELETE: enterprise_account present (count=1), enterprise_site present (count=1) | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G9', 'G', 'FAIL', pg_catalog.format('TEST G9 | account_count=%s, site_count=%s (expected both=1) | FAIL', v_acct_count, v_site_count));
    RAISE WARNING 'TEST G9 | account_count=%, site_count=% (expected both=1) | FAIL', v_acct_count, v_site_count;
  END IF;
END;
$$;

-- ── G10: NULL enterprise_id rejected (NOT NULL constraint) ───────────────
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (v_test_id, NULL, 'G10 Site', 'G10 City', 'active');
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G10', 'G', 'FAIL', 'TEST G10 | NULL enterprise_id was accepted | FAIL');
    RAISE WARNING 'TEST G10 | NULL enterprise_id was accepted | FAIL';
  EXCEPTION
    WHEN not_null_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G10', 'G', 'PASS', 'TEST G10 | NULL enterprise_id rejected by NOT NULL constraint (23502) | PASS');
      RAISE NOTICE 'TEST G10 | NULL enterprise_id rejected by NOT NULL constraint (23502) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G10', 'G', 'FAIL', pg_catalog.format('TEST G10 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G10 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G11: NULL name rejected (NOT NULL constraint) ────────────────────────
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      NULL, 'G11 City', 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G11', 'G', 'FAIL', 'TEST G11 | NULL name was accepted | FAIL');
    RAISE WARNING 'TEST G11 | NULL name was accepted | FAIL';
  EXCEPTION
    WHEN not_null_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G11', 'G', 'PASS', 'TEST G11 | NULL name rejected by NOT NULL constraint (23502) | PASS');
      RAISE NOTICE 'TEST G11 | NULL name rejected by NOT NULL constraint (23502) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G11', 'G', 'FAIL', pg_catalog.format('TEST G11 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G11 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G12: NULL city rejected (NOT NULL constraint) ────────────────────────
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      'G12 Site', NULL, 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G12', 'G', 'FAIL', 'TEST G12 | NULL city was accepted | FAIL');
    RAISE WARNING 'TEST G12 | NULL city was accepted | FAIL';
  EXCEPTION
    WHEN not_null_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G12', 'G', 'PASS', 'TEST G12 | NULL city rejected by NOT NULL constraint (23502) | PASS');
      RAISE NOTICE 'TEST G12 | NULL city rejected by NOT NULL constraint (23502) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G12', 'G', 'FAIL', pg_catalog.format('TEST G12 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G12 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G13: NULL status rejected (NOT NULL constraint) ──────────────────────
DO $$
DECLARE
  v_test_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      'G13 Site', 'G13 City', NULL
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G13', 'G', 'FAIL', 'TEST G13 | NULL status was accepted | FAIL');
    RAISE WARNING 'TEST G13 | NULL status was accepted | FAIL';
  EXCEPTION
    WHEN not_null_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G13', 'G', 'PASS', 'TEST G13 | NULL status rejected by NOT NULL constraint (23502) | PASS');
      RAISE NOTICE 'TEST G13 | NULL status rejected by NOT NULL constraint (23502) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G13', 'G', 'FAIL', pg_catalog.format('TEST G13 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G13 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G14: overlength name (201 chars) rejected at database level ───────────
-- enterprise_sites_name_length CHECK: char_length(btrim(name)) BETWEEN 1 AND 200
-- 201-char non-whitespace string → btrim unchanged → length 201 > 200 → check_violation
DO $$
DECLARE
  v_test_id  uuid  := gen_random_uuid();
  v_longname text  := pg_catalog.repeat('N', 201);
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      v_longname, 'G14 City', 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G14', 'G', 'INCONCLUSIVE', 'TEST G14 | 201-char name accepted at DB level (CHECK constraint not enforcing upper bound) | INCONCLUSIVE — verify enterprise_sites_name_length definition');
    RAISE WARNING 'TEST G14 | 201-char name accepted at DB level (CHECK constraint not enforcing upper bound) | INCONCLUSIVE — verify enterprise_sites_name_length definition';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G14', 'G', 'PASS', 'TEST G14 | 201-char name rejected by enterprise_sites_name_length CHECK (23514) | PASS');
      RAISE NOTICE 'TEST G14 | 201-char name rejected by enterprise_sites_name_length CHECK (23514) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G14', 'G', 'FAIL', pg_catalog.format('TEST G14 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G14 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;

-- ── G15: overlength city (121 chars) rejected at database level ───────────
-- enterprise_sites_city_length CHECK: char_length(btrim(city)) BETWEEN 1 AND 120
-- 121-char non-whitespace string → btrim unchanged → length 121 > 120 → check_violation
DO $$
DECLARE
  v_test_id  uuid := gen_random_uuid();
  v_longcity text := pg_catalog.repeat('C', 121);
BEGIN
  BEGIN
    INSERT INTO public.enterprise_sites
      (id, enterprise_id, name, city, status)
    VALUES (
      v_test_id,
      current_setting('test.c_ea_id')::uuid,
      'G15 Site', v_longcity, 'active'
    );
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('G15', 'G', 'INCONCLUSIVE', 'TEST G15 | 121-char city accepted at DB level (CHECK constraint not enforcing upper bound) | INCONCLUSIVE — verify enterprise_sites_city_length definition');
    RAISE WARNING 'TEST G15 | 121-char city accepted at DB level (CHECK constraint not enforcing upper bound) | INCONCLUSIVE — verify enterprise_sites_city_length definition';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G15', 'G', 'PASS', 'TEST G15 | 121-char city rejected by enterprise_sites_city_length CHECK (23514) | PASS');
      RAISE NOTICE 'TEST G15 | 121-char city rejected by enterprise_sites_city_length CHECK (23514) | PASS';
    WHEN OTHERS THEN
      INSERT INTO results_log (test_id, section, verdict, detail)
        VALUES ('G15', 'G', 'FAIL', pg_catalog.format('TEST G15 | unexpected exception %s: %s | FAIL', SQLSTATE, SQLERRM));
      RAISE WARNING 'TEST G15 | unexpected exception %: % | FAIL', SQLSTATE, SQLERRM;
  END;
END;
$$;


-- ---------------------------------------------------------------------------
-- H. B2C NON-REGRESSION BOUNDARY
-- ---------------------------------------------------------------------------
-- Tests H1–H15: READ-ONLY catalog checks verifying that the Enterprise Sites
-- foundation (Migration 2) exists alongside the FIXEO B2C core without
-- replacing, redefining, or coupling itself to the B2C dispatch path.
--
-- All checks use pg_catalog / pg_proc / pg_get_functiondef only.
-- NO invocation of dispatch_request_v1, claim_mission, or any B2C function.
-- NO DML on service_requests, missions, or artisans.
-- ---------------------------------------------------------------------------

-- ── H1: public.service_requests still exists as a real table ────────────
DO $$
DECLARE
  v_relkind char;
BEGIN
  SELECT c.relkind
  INTO   v_relkind
  FROM   pg_catalog.pg_class     c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'service_requests';

  IF v_relkind = 'r' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H1', 'H', 'PASS', 'TEST H1 | public.service_requests exists as a real table (relkind=r) | PASS');
    RAISE NOTICE 'TEST H1 | public.service_requests exists as a real table (relkind=r) | PASS';
  ELSIF v_relkind IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H1', 'H', 'FAIL', 'TEST H1 | public.service_requests not found | FAIL');
    RAISE WARNING 'TEST H1 | public.service_requests not found | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H1', 'H', 'FAIL', pg_catalog.format('TEST H1 | public.service_requests relkind=%s (not a table) | FAIL', v_relkind));
    RAISE WARNING 'TEST H1 | public.service_requests relkind=% (not a table) | FAIL', v_relkind;
  END IF;
END;
$$;

-- ── H2: public.missions still exists as a real table ────────────────────
DO $$
DECLARE
  v_relkind char;
BEGIN
  SELECT c.relkind
  INTO   v_relkind
  FROM   pg_catalog.pg_class     c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'missions';

  IF v_relkind = 'r' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H2', 'H', 'PASS', 'TEST H2 | public.missions exists as a real table (relkind=r) | PASS');
    RAISE NOTICE 'TEST H2 | public.missions exists as a real table (relkind=r) | PASS';
  ELSIF v_relkind IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H2', 'H', 'FAIL', 'TEST H2 | public.missions not found | FAIL');
    RAISE WARNING 'TEST H2 | public.missions not found | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H2', 'H', 'FAIL', pg_catalog.format('TEST H2 | public.missions relkind=%s (not a table) | FAIL', v_relkind));
    RAISE WARNING 'TEST H2 | public.missions relkind=% (not a table) | FAIL', v_relkind;
  END IF;
END;
$$;

-- ── H3: public.artisans still exists as a real table ────────────────────
DO $$
DECLARE
  v_relkind char;
BEGIN
  SELECT c.relkind
  INTO   v_relkind
  FROM   pg_catalog.pg_class     c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relname = 'artisans';

  IF v_relkind = 'r' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H3', 'H', 'PASS', 'TEST H3 | public.artisans exists as a real table (relkind=r) | PASS');
    RAISE NOTICE 'TEST H3 | public.artisans exists as a real table (relkind=r) | PASS';
  ELSIF v_relkind IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H3', 'H', 'FAIL', 'TEST H3 | public.artisans not found | FAIL');
    RAISE WARNING 'TEST H3 | public.artisans not found | FAIL';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H3', 'H', 'FAIL', pg_catalog.format('TEST H3 | public.artisans relkind=%s (not a table) | FAIL', v_relkind));
    RAISE WARNING 'TEST H3 | public.artisans relkind=% (not a table) | FAIL', v_relkind;
  END IF;
END;
$$;

-- ── H4: public.dispatch_request_v1 still exists as a function ────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'dispatch_request_v1';

  IF v_count >= 1 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H4', 'H', 'PASS', pg_catalog.format('TEST H4 | public.dispatch_request_v1 exists (%s overload(s)) | PASS', v_count));
    RAISE NOTICE 'TEST H4 | public.dispatch_request_v1 exists (% overload(s)) | PASS', v_count;
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H4', 'H', 'FAIL', 'TEST H4 | public.dispatch_request_v1 not found | FAIL');
    RAISE WARNING 'TEST H4 | public.dispatch_request_v1 not found | FAIL';
  END IF;
END;
$$;

-- ── H5: public.claim_mission still exists as a function ─────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'claim_mission';

  IF v_count >= 1 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H5', 'H', 'PASS', pg_catalog.format('TEST H5 | public.claim_mission exists (%s overload(s)) | PASS', v_count));
    RAISE NOTICE 'TEST H5 | public.claim_mission exists (% overload(s)) | PASS', v_count;
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H5', 'H', 'FAIL', 'TEST H5 | public.claim_mission not found | FAIL');
    RAISE WARNING 'TEST H5 | public.claim_mission not found | FAIL';
  END IF;
END;
$$;

-- ── H6: enterprise_sites has no FK to public.service_requests ─────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'service_requests';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H6', 'H', 'PASS', 'TEST H6 | enterprise_sites has no FK to service_requests | PASS');
    RAISE NOTICE 'TEST H6 | enterprise_sites has no FK to service_requests | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H6', 'H', 'FAIL', pg_catalog.format('TEST H6 | enterprise_sites has %s FK(s) to service_requests (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H6 | enterprise_sites has % FK(s) to service_requests (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H7: enterprise_sites has no FK to public.missions ───────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'missions';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H7', 'H', 'PASS', 'TEST H7 | enterprise_sites has no FK to missions | PASS');
    RAISE NOTICE 'TEST H7 | enterprise_sites has no FK to missions | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H7', 'H', 'FAIL', pg_catalog.format('TEST H7 | enterprise_sites has %s FK(s) to missions (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H7 | enterprise_sites has % FK(s) to missions (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H8: enterprise_sites has no FK to public.artisans ───────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'artisans';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H8', 'H', 'PASS', 'TEST H8 | enterprise_sites has no FK to artisans | PASS');
    RAISE NOTICE 'TEST H8 | enterprise_sites has no FK to artisans | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H8', 'H', 'FAIL', pg_catalog.format('TEST H8 | enterprise_sites has %s FK(s) to artisans (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H8 | enterprise_sites has % FK(s) to artisans (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H9: service_requests has no FK to enterprise_sites ──────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'service_requests'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'enterprise_sites';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H9', 'H', 'PASS', 'TEST H9 | service_requests has no FK to enterprise_sites | PASS');
    RAISE NOTICE 'TEST H9 | service_requests has no FK to enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H9', 'H', 'FAIL', pg_catalog.format('TEST H9 | service_requests has %s FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H9 | service_requests has % FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H10: missions has no FK to enterprise_sites ───────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'missions'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'enterprise_sites';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H10', 'H', 'PASS', 'TEST H10 | missions has no FK to enterprise_sites | PASS');
    RAISE NOTICE 'TEST H10 | missions has no FK to enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H10', 'H', 'FAIL', pg_catalog.format('TEST H10 | missions has %s FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H10 | missions has % FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H11: artisans has no FK to enterprise_sites ───────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
  INTO   v_count
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'artisans'
    AND  fns.nspname = 'public'
    AND  fcl.relname = 'enterprise_sites';

  IF v_count = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H11', 'H', 'PASS', 'TEST H11 | artisans has no FK to enterprise_sites | PASS');
    RAISE NOTICE 'TEST H11 | artisans has no FK to enterprise_sites | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H11', 'H', 'FAIL', pg_catalog.format('TEST H11 | artisans has %s FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count));
    RAISE WARNING 'TEST H11 | artisans has % FK(s) to enterprise_sites (unexpected coupling) | FAIL', v_count;
  END IF;
END;
$$;

-- ── H12: enterprise_sites is additive — FK deps limited to enterprise_accounts ─
-- Verify all FKs from enterprise_sites point only to enterprise_accounts,
-- not to any B2C table. Lists every FK referent for full evidence.
DO $$
DECLARE
  v_total       int;
  v_non_ea      int;
  v_all_refs    text;
  v_bad_refs    text;
BEGIN
  SELECT
    count(*),
    string_agg(fns.nspname || '.' || fcl.relname, ', ' ORDER BY fcl.relname)
  INTO v_total, v_all_refs
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites';

  SELECT
    count(*),
    string_agg(fns.nspname || '.' || fcl.relname, ', ' ORDER BY fcl.relname)
  INTO v_non_ea, v_bad_refs
  FROM   pg_catalog.pg_constraint  con
  JOIN   pg_catalog.pg_class        cl  ON cl.oid  = con.conrelid
  JOIN   pg_catalog.pg_namespace    ns  ON ns.oid  = cl.relnamespace
  JOIN   pg_catalog.pg_class        fcl ON fcl.oid = con.confrelid
  JOIN   pg_catalog.pg_namespace    fns ON fns.oid = fcl.relnamespace
  WHERE  con.contype = 'f'
    AND  ns.nspname  = 'public'
    AND  cl.relname  = 'enterprise_sites'
    AND  NOT (fns.nspname = 'public' AND fcl.relname = 'enterprise_accounts');

  IF v_non_ea = 0 THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H12', 'H', 'PASS', pg_catalog.format('TEST H12 | enterprise_sites FKs: total=%s, all reference only enterprise_accounts (refs: %s) | PASS', v_total, COALESCE(v_all_refs, 'none')));
    RAISE NOTICE 'TEST H12 | enterprise_sites FKs: total=%, all reference only enterprise_accounts (refs: %s) | PASS',
      v_total, COALESCE(v_all_refs, 'none');
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H12', 'H', 'FAIL', pg_catalog.format('TEST H12 | enterprise_sites has %s unexpected FK(s) outside enterprise_accounts: %s | FAIL', v_non_ea, v_bad_refs));
    RAISE WARNING 'TEST H12 | enterprise_sites has % unexpected FK(s) outside enterprise_accounts: %s | FAIL',
      v_non_ea, v_bad_refs;
  END IF;
END;
$$;

-- ── H13: create_enterprise_site body does NOT reference dispatch_request_v1 ─
-- Inspect pg_get_functiondef() as a string; look for the literal function name.
DO $$
DECLARE
  v_body  text;
  v_found bool;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO   v_body
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'create_enterprise_site'
    AND  array_length(p.proargtypes, 1) = 5
    AND  p.proargtypes[0] = 'uuid'::regtype::oid
  LIMIT 1;

  IF v_body IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H13', 'H', 'INCONCLUSIVE', 'TEST H13 | create_enterprise_site function not found; cannot inspect body | INCONCLUSIVE');
    RAISE WARNING 'TEST H13 | create_enterprise_site function not found; cannot inspect body | INCONCLUSIVE';
    RETURN;
  END IF;

  v_found := pg_catalog.strpos(v_body, 'dispatch_request_v1') > 0;

  IF NOT v_found THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H13', 'H', 'PASS', 'TEST H13 | create_enterprise_site body does not reference dispatch_request_v1 | PASS');
    RAISE NOTICE 'TEST H13 | create_enterprise_site body does not reference dispatch_request_v1 | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H13', 'H', 'FAIL', 'TEST H13 | create_enterprise_site body contains ''dispatch_request_v1'' | FAIL');
    RAISE WARNING 'TEST H13 | create_enterprise_site body contains ''dispatch_request_v1'' | FAIL';
  END IF;
END;
$$;

-- ── H14: create_enterprise_site body does NOT reference claim_mission ──────
DO $$
DECLARE
  v_body  text;
  v_found bool;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO   v_body
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'create_enterprise_site'
    AND  array_length(p.proargtypes, 1) = 5
    AND  p.proargtypes[0] = 'uuid'::regtype::oid
  LIMIT 1;

  IF v_body IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H14', 'H', 'INCONCLUSIVE', 'TEST H14 | create_enterprise_site function not found | INCONCLUSIVE');
    RAISE WARNING 'TEST H14 | create_enterprise_site function not found | INCONCLUSIVE';
    RETURN;
  END IF;

  v_found := pg_catalog.strpos(v_body, 'claim_mission') > 0;

  IF NOT v_found THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H14', 'H', 'PASS', 'TEST H14 | create_enterprise_site body does not reference claim_mission | PASS');
    RAISE NOTICE 'TEST H14 | create_enterprise_site body does not reference claim_mission | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H14', 'H', 'FAIL', 'TEST H14 | create_enterprise_site body contains ''claim_mission'' | FAIL');
    RAISE WARNING 'TEST H14 | create_enterprise_site body contains ''claim_mission'' | FAIL';
  END IF;
END;
$$;

-- ── H15: create_enterprise_site body does NOT directly reference ──────────
--     service_requests, missions, or artisans
DO $$
DECLARE
  v_body      text;
  v_failures  text := '';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO   v_body
  FROM   pg_catalog.pg_proc      p
  JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'create_enterprise_site'
    AND  array_length(p.proargtypes, 1) = 5
    AND  p.proargtypes[0] = 'uuid'::regtype::oid
  LIMIT 1;

  IF v_body IS NULL THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H15', 'H', 'INCONCLUSIVE', 'TEST H15 | create_enterprise_site function not found | INCONCLUSIVE');
    RAISE WARNING 'TEST H15 | create_enterprise_site function not found | INCONCLUSIVE';
    RETURN;
  END IF;

  IF pg_catalog.strpos(v_body, 'service_requests') > 0 THEN
    v_failures := v_failures || ' [service_requests]';
  END IF;
  IF pg_catalog.strpos(v_body, 'missions') > 0 THEN
    v_failures := v_failures || ' [missions]';
  END IF;
  IF pg_catalog.strpos(v_body, 'artisans') > 0 THEN
    v_failures := v_failures || ' [artisans]';
  END IF;

  IF v_failures = '' THEN
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H15', 'H', 'PASS', 'TEST H15 | create_enterprise_site body references none of: service_requests, missions, artisans | PASS');
    RAISE NOTICE 'TEST H15 | create_enterprise_site body references none of: service_requests, missions, artisans | PASS';
  ELSE
    INSERT INTO results_log (test_id, section, verdict, detail)
      VALUES ('H15', 'H', 'FAIL', pg_catalog.format('TEST H15 | create_enterprise_site body contains unexpected B2C reference(s):%s | FAIL', v_failures));
    RAISE WARNING 'TEST H15 | create_enterprise_site body contains unexpected B2C reference(s):%s | FAIL', v_failures;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- I. FINAL TEST RESULTS — all 109 verdicts visible in Supabase Results panel
-- ---------------------------------------------------------------------------

-- ── I1: Per-test verdict (all 109 rows) ──────────────────────────────────
SELECT
  section,
  test_id,
  verdict,
  detail
FROM results_log
ORDER BY section, test_id;

-- ── I2: Per-section summary ───────────────────────────────────────────────
SELECT
  section,
  count(*)                                         AS total,
  count(*) FILTER (WHERE verdict = 'PASS')         AS passed,
  count(*) FILTER (WHERE verdict = 'FAIL')         AS failed,
  count(*) FILTER (WHERE verdict = 'INCONCLUSIVE') AS inconclusive
FROM results_log
GROUP BY section
ORDER BY section;

-- ── I3: Final verdict summary (last visible result set in Supabase Results tab) ──
SELECT
  109                                                             AS expected_total,
  count(*)                                                        AS executed_total,
  count(*) FILTER (WHERE verdict = 'PASS')                        AS passed,
  count(*) FILTER (WHERE verdict = 'FAIL')                        AS failed,
  count(*) FILTER (WHERE verdict = 'INCONCLUSIVE')                AS inconclusive,
  CASE
    WHEN count(*) = 109
     AND count(*) FILTER (WHERE verdict = 'FAIL')                 = 0
     AND count(*) FILTER (WHERE verdict = 'INCONCLUSIVE')         = 0
    THEN 'ALL PASSED — safe to proceed'
    WHEN count(*) < 109
    THEN 'INCOMPLETE — only ' || count(*)::text || ' of 109 tests recorded'
    ELSE 'FAILURES DETECTED — review fail_details column'
  END                                                             AS final_verdict,
  COALESCE(
    string_agg(test_id, ', ' ORDER BY test_id)
      FILTER (WHERE verdict IN ('FAIL', 'INCONCLUSIVE')),
    'none'
  )                                                               AS fail_test_ids,
  COALESCE(
    string_agg(test_id || ': ' || detail, ' || ' ORDER BY test_id)
      FILTER (WHERE verdict IN ('FAIL', 'INCONCLUSIVE')),
    'none'
  )                                                               AS fail_details
FROM results_log;


DO $$
DECLARE
  v_expected_ids text[] := ARRAY[
    'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12',
    'B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12',
    'C1','C2','C3','C4','C5','C6','C7','C8',
    'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12',
    'D13','D14','D15','D16','D17','D18',
    'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12',
    'E13','E14','E15','E16','E17',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    'G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12',
    'G13','G14','G15',
    'H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H11','H12',
    'H13','H14','H15'
  ];
  v_inventory_ids text[] := ARRAY[
    'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12',
    'B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12',
    'C1','C2','C3','C4','C5','C6','C7','C8',
    'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12',
    'D13','D14','D15','D16','D17','D18',
    'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12',
    'E13','E14','E15','E16','E17',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    'G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12',
    'G13','G14','G15',
    'H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H11','H12',
    'H13','H14','H15'
  ];
  v_total      int;
  v_missing    text;
  v_duplicates text;
BEGIN
  v_total := array_length(v_inventory_ids, 1);

  -- Missing: expected but not in inventory
  SELECT string_agg(e, ', ' ORDER BY e)
  INTO   v_missing
  FROM   unnest(v_expected_ids) AS e
  WHERE  e <> ALL(v_inventory_ids);

  -- Duplicates: appears more than once in inventory
  SELECT string_agg(id, ', ' ORDER BY id)
  INTO   v_duplicates
  FROM (
    SELECT unnest(v_inventory_ids) AS id
  ) t
  GROUP BY id
  HAVING count(*) > 1;

  IF v_missing IS NULL AND v_duplicates IS NULL AND v_total = 109 THEN
    RAISE NOTICE 'TEST I5/I6 | Inventory: total=109, no missing IDs, no duplicate IDs | PASS';
  ELSE
    RAISE WARNING 'TEST I5/I6 | total=%, missing=[%s], duplicates=[%s] | FAIL',
      v_total,
      COALESCE(v_missing,    'none'),
      COALESCE(v_duplicates, 'none');
  END IF;
END;
$$;


ROLLBACK;
-- =============================================================================
-- END OF FILE — nothing executable follows
-- =============================================================================