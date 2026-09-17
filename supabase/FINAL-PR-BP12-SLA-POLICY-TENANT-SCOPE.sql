-- =============================================================================
-- FIXEO ENTERPRISE
-- FINAL-PR-BP12 — SLA POLICY TENANT-SCOPE HARDENING
--
-- Purpose:
--   Correct the SELECT scope of public.enterprise_sla_policies.
--
-- Problem:
--   The existing BP15 policy esp_members_select allows every authenticated
--   caller to satisfy RLS for Enterprise-wide SLA policies where site_id IS NULL.
--
-- Required contract:
--   * Enterprise-wide policy (site_id IS NULL):
--       visible only to an active member of that Enterprise.
--   * Site-specific policy (site_id IS NOT NULL):
--       visible only when the caller has effective BP15 access to that site.
--   * FIXEO admin policy remains unchanged.
--   * Manager INSERT/UPDATE policies remain unchanged.
--   * Anonymous deny policy remains unchanged.
--   * No table data, schema, RPC, trigger or privilege changes.
--
-- IMPORTANT:
--   REVIEWED MIGRATION — DO NOT APPLY TO PRODUCTION UNTIL EXPLICITLY AUTHORIZED.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. HARD PRECONDITIONS
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_qual  text;
BEGIN
  -- Target table must exist.
  IF pg_catalog.to_regclass('public.enterprise_sla_policies') IS NULL THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: enterprise_sla_policies missing';
  END IF;

  -- RLS must already be enabled.
  IF NOT COALESCE(
    (
      SELECT c.relrowsecurity
      FROM pg_catalog.pg_class c
      WHERE c.oid =
        pg_catalog.to_regclass('public.enterprise_sla_policies')
    ),
    false
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: RLS is not enabled';
  END IF;

  -- BP15 helper must exist.
  IF pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_can_access_enterprise_site(uuid,uuid)'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: BP15 site helper missing';
  END IF;

  -- Enterprise membership helper must exist.
  IF pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_is_enterprise_member(uuid)'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: Enterprise member helper missing';
  END IF;

  -- Exact policy inventory must still contain five policies.
  SELECT pg_catalog.count(*)
  INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'enterprise_sla_policies';

  IF v_count <> 5 THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: expected 5 policies, found %',
      v_count;
  END IF;

  -- Target policy contract must still be exactly:
  -- PERMISSIVE / authenticated / SELECT / no WITH CHECK.
  SELECT p.qual
  INTO v_qual
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'enterprise_sla_policies'
    AND p.policyname = 'esp_members_select'
    AND p.permissive = 'PERMISSIVE'
    AND p.roles = ARRAY['authenticated']::name[]
    AND p.cmd = 'SELECT'
    AND p.with_check IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: esp_members_select contract changed';
  END IF;

  -- Refuse to run if its current vulnerable expression is no longer present.
  IF v_qual IS DISTINCT FROM
     '((site_id IS NULL) OR fixeo_private._fixeo_can_access_enterprise_site(enterprise_id, site_id))'
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: unexpected current qual: %',
      v_qual;
  END IF;

  -- FINAL-PR-01E privilege baseline must remain intact.
  IF NOT pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'SELECT'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: authenticated SELECT baseline changed';
  END IF;

  IF pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'DELETE'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: authenticated DELETE unexpectedly present';
  END IF;

  IF pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'MAINTAIN'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 precondition failed: FINAL-PR-01E sensitive privilege baseline changed';
  END IF;
END
$$;

-- =============================================================================
-- 2. MINIMAL MUTATION
-- =============================================================================

ALTER POLICY esp_members_select
ON public.enterprise_sla_policies
USING (
  (
    site_id IS NULL
    AND fixeo_private._fixeo_is_enterprise_member(enterprise_id)
  )
  OR
  (
    site_id IS NOT NULL
    AND fixeo_private._fixeo_can_access_enterprise_site(
      enterprise_id,
      site_id
    )
  )
);

-- =============================================================================
-- 3. HARD POSTCONDITIONS
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_qual  text;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'enterprise_sla_policies';

  IF v_count <> 5 THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 postcondition failed: policy inventory changed';
  END IF;

  SELECT p.qual
  INTO v_qual
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'enterprise_sla_policies'
    AND p.policyname = 'esp_members_select'
    AND p.permissive = 'PERMISSIVE'
    AND p.roles = ARRAY['authenticated']::name[]
    AND p.cmd = 'SELECT'
    AND p.with_check IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 postcondition failed: target policy contract changed';
  END IF;

  IF v_qual IS DISTINCT FROM
     '(((site_id IS NULL) AND fixeo_private._fixeo_is_enterprise_member(enterprise_id)) OR ((site_id IS NOT NULL) AND fixeo_private._fixeo_can_access_enterprise_site(enterprise_id, site_id)))'
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 postcondition failed: unexpected hardened qual: %',
      v_qual;
  END IF;

  -- Privileges must remain unchanged.
  IF NOT pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'DELETE'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 postcondition failed: authenticated CRUD baseline changed';
  END IF;

  IF pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_policies',
       'MAINTAIN'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12 postcondition failed: sensitive privileges changed';
  END IF;
END
$$;

COMMIT;
