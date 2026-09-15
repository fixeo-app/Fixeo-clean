-- =============================================================================
-- FIXEO ENTERPRISE — BP09 RLS & SCHEMA — CORRECTED DRAFT v2
-- File: supabase/bp09-enterprise-rls-and-schema.sql
--
-- STATUS
--   DRAFT ONLY — DO NOT APPLY TO SUPABASE.
--
-- BASIS
--   Built from the targeted production audit performed after validated 7C.15A.8.
--
-- VERIFIED PRODUCTION FACTS USED BY THIS DRAFT
--   1. public.service_requests.id is uuid.
--   2. public.missions.request_id is text and has no FK to service_requests.
--   3. Existing production joins use:
--        missions.request_id = service_requests.id::text
--      Therefore this migration NEVER casts missions.request_id to uuid.
--   4. public.enterprise_request_context is the canonical Enterprise link:
--        service_request_id uuid NOT NULL
--        enterprise_id      uuid NOT NULL
--        site_id            uuid NOT NULL
--        UNIQUE(service_request_id)
--        FK service_request_id -> service_requests(id)
--        FK enterprise_id      -> enterprise_accounts(id)
--        FK site_id            -> enterprise_sites(id)
--   5. enterprise_request_context already has tenant-scoped SELECT RLS:
--        fixeo_private._fixeo_is_enterprise_member(enterprise_id)
--   6. service_requests, missions and enterprise_request_context already have RLS.
--   7. authenticated already has SELECT on all three relations.
--   8. No member<->site assignment relation/helper was discovered in production.
--
-- CORRECTED BP09 CONTRACT
--   A. Keep enterprise_request_context as the ONLY Enterprise request-context
--      source of truth.
--   B. DO NOT add service_requests.enterprise_site_id.
--   C. DO NOT backfill a second Enterprise/site link.
--   D. DO NOT add synchronization triggers.
--   E. DO NOT cast missions.request_id::uuid.
--   F. Add SELECT-only Enterprise visibility to service_requests.
--   G. Add SELECT-only Enterprise visibility to missions.
--   H. Preserve every existing B2C / artisan / admin policy unchanged.
--   I. No Enterprise INSERT / UPDATE / DELETE capability is added here.
--   J. Preflight explicitly verifies all three canonical ERC FKs and both
--      target policy names are absent.
--   K. No site-assignment scoping is invented: current schema has no verified
--      member<->site assignment primitive. Active Enterprise membership is the
--      existing tenant read boundary.
--
-- SECURITY MODEL
--   Enterprise request visibility is derived through enterprise_request_context.
--   A caller can see a linked service_request only when RLS on
--   enterprise_request_context exposes its canonical context row to that caller.
--   The same canonical link is used to expose missions.
--
-- IMPORTANT
--   This file is intentionally minimal. It does not redesign existing B2C RLS.
--   PostgreSQL permissive SELECT policies are additive (OR semantics).
--
-- NEXT GATE
--   Static audit first. Production precheck only after explicit validation.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0 — HARD PRECONDITIONS
-- Abort rather than silently authoring against a different production schema.
-- =============================================================================

DO $bp09_preconditions$
DECLARE
  v_mission_request_udt text;
  v_service_request_id_udt text;
  v_erc_service_request_udt text;
  v_erc_enterprise_udt text;
  v_erc_site_udt text;
BEGIN
  -- Required relations.
  IF pg_catalog.to_regclass('public.service_requests') IS NULL THEN
    RAISE EXCEPTION 'BP09 ABORT: public.service_requests is missing';
  END IF;

  IF pg_catalog.to_regclass('public.missions') IS NULL THEN
    RAISE EXCEPTION 'BP09 ABORT: public.missions is missing';
  END IF;

  IF pg_catalog.to_regclass('public.enterprise_request_context') IS NULL THEN
    RAISE EXCEPTION 'BP09 ABORT: public.enterprise_request_context is missing';
  END IF;

  IF pg_catalog.to_regclass('public.enterprise_members') IS NULL THEN
    RAISE EXCEPTION 'BP09 ABORT: public.enterprise_members is missing';
  END IF;

  -- Exact types verified by targeted production audit.
  SELECT c.udt_name
    INTO v_mission_request_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'missions'
    AND c.column_name = 'request_id';

  SELECT c.udt_name
    INTO v_service_request_id_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'service_requests'
    AND c.column_name = 'id';

  SELECT c.udt_name
    INTO v_erc_service_request_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'enterprise_request_context'
    AND c.column_name = 'service_request_id';

  SELECT c.udt_name
    INTO v_erc_enterprise_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'enterprise_request_context'
    AND c.column_name = 'enterprise_id';

  SELECT c.udt_name
    INTO v_erc_site_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'enterprise_request_context'
    AND c.column_name = 'site_id';

  IF v_mission_request_udt IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION
      'BP09 ABORT: missions.request_id expected text, found %',
      COALESCE(v_mission_request_udt, '<missing>');
  END IF;

  IF v_service_request_id_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION
      'BP09 ABORT: service_requests.id expected uuid, found %',
      COALESCE(v_service_request_id_udt, '<missing>');
  END IF;

  IF v_erc_service_request_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION
      'BP09 ABORT: enterprise_request_context.service_request_id expected uuid, found %',
      COALESCE(v_erc_service_request_udt, '<missing>');
  END IF;

  IF v_erc_enterprise_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION
      'BP09 ABORT: enterprise_request_context.enterprise_id expected uuid, found %',
      COALESCE(v_erc_enterprise_udt, '<missing>');
  END IF;

  IF v_erc_site_udt IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION
      'BP09 ABORT: enterprise_request_context.site_id expected uuid, found %',
      COALESCE(v_erc_site_udt, '<missing>');
  END IF;

  -- Canonical context must remain one row per service request.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid =
          pg_catalog.to_regclass('public.enterprise_request_context')
      AND con.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(con.oid, true)
          = 'UNIQUE (service_request_id)'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: canonical UNIQUE(service_request_id) is missing';
  END IF;

  -- Canonical FK to service_requests must exist.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid =
          pg_catalog.to_regclass('public.enterprise_request_context')
      AND con.contype = 'f'
      AND con.confrelid =
          pg_catalog.to_regclass('public.service_requests')
      AND pg_catalog.pg_get_constraintdef(con.oid, true)
          ILIKE 'FOREIGN KEY (service_request_id) REFERENCES service_requests(id)%'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: canonical enterprise_request_context -> service_requests FK is missing';
  END IF;

  -- The rejected duplicate source of truth must NOT exist.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'service_requests'
      AND c.column_name = 'enterprise_site_id'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: service_requests.enterprise_site_id exists; architecture differs from corrected BP09 contract';
  END IF;

  -- Canonical FK to enterprise_accounts must exist.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid =
          pg_catalog.to_regclass('public.enterprise_request_context')
      AND con.contype = 'f'
      AND con.confrelid =
          pg_catalog.to_regclass('public.enterprise_accounts')
      AND pg_catalog.pg_get_constraintdef(con.oid, true)
          ILIKE 'FOREIGN KEY (enterprise_id) REFERENCES enterprise_accounts(id)%'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: canonical enterprise_request_context -> enterprise_accounts FK is missing';
  END IF;

  -- Canonical FK to enterprise_sites must exist.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid =
          pg_catalog.to_regclass('public.enterprise_request_context')
      AND con.contype = 'f'
      AND con.confrelid =
          pg_catalog.to_regclass('public.enterprise_sites')
      AND pg_catalog.pg_get_constraintdef(con.oid, true)
          ILIKE 'FOREIGN KEY (site_id) REFERENCES enterprise_sites(id)%'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: canonical enterprise_request_context -> enterprise_sites FK is missing';
  END IF;

  -- Target policy names must be absent. Explicitly detect schema drift before DDL.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'service_requests'
      AND p.policyname = 'service_requests_enterprise_members_select'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: policy service_requests_enterprise_members_select already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'missions'
      AND p.policyname = 'missions_enterprise_members_select'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: policy missions_enterprise_members_select already exists';
  END IF;

  -- Required Enterprise member helper.
  IF pg_catalog.to_regprocedure(
       'fixeo_private._fixeo_is_enterprise_member(uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'BP09 ABORT: fixeo_private._fixeo_is_enterprise_member(uuid) is missing';
  END IF;

  -- RLS must already be enabled; BP09 does not silently repair/reconfigure it.
  IF NOT COALESCE((
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'service_requests'
  ), false) THEN
    RAISE EXCEPTION 'BP09 ABORT: RLS is not enabled on service_requests';
  END IF;

  IF NOT COALESCE((
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'missions'
  ), false) THEN
    RAISE EXCEPTION 'BP09 ABORT: RLS is not enabled on missions';
  END IF;

  IF NOT COALESCE((
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'enterprise_request_context'
  ), false) THEN
    RAISE EXCEPTION
      'BP09 ABORT: RLS is not enabled on enterprise_request_context';
  END IF;

  -- authenticated must already be able to SELECT the three relations.
  IF NOT pg_catalog.has_table_privilege(
    'authenticated', 'public.service_requests', 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: authenticated lacks SELECT on service_requests';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated', 'public.missions', 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: authenticated lacks SELECT on missions';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated', 'public.enterprise_request_context', 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'BP09 ABORT: authenticated lacks SELECT on enterprise_request_context';
  END IF;
END;
$bp09_preconditions$;

-- =============================================================================
-- SECTION 1 — ENTERPRISE SELECT ON service_requests
--
-- Existing B2C/admin/artisan policies remain untouched.
--
-- RLS chain:
--   service_requests.id (uuid)
--      =
--   enterprise_request_context.service_request_id (uuid)
--
-- enterprise_request_context itself already exposes rows only to an active
-- member of that enterprise (plus FIXEO admin through its existing policies).
-- No duplicate Enterprise column is added to service_requests.
-- =============================================================================

CREATE POLICY service_requests_enterprise_members_select
ON public.service_requests
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    WHERE erc.service_request_id = service_requests.id
      AND fixeo_private._fixeo_is_enterprise_member(erc.enterprise_id)
  )
);

-- =============================================================================
-- SECTION 2 — ENTERPRISE SELECT ON missions
--
-- Production fact:
--   missions.request_id      = text
--   service_requests.id      = uuid
--   erc.service_request_id   = uuid
--
-- Safe direction:
--   missions.request_id = erc.service_request_id::text
--
-- NEVER:
--   missions.request_id::uuid
--
-- This preserves compatibility with legacy/non-UUID text values in missions.
-- Existing client/artisan/admin mission policies remain untouched.
-- =============================================================================

CREATE POLICY missions_enterprise_members_select
ON public.missions
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_request_context erc
    WHERE missions.request_id = erc.service_request_id::text
      AND fixeo_private._fixeo_is_enterprise_member(erc.enterprise_id)
  )
);

-- =============================================================================
-- SECTION 3 — INTENTIONAL NON-CHANGES
--
-- NO ALTER TABLE service_requests.
-- NO service_requests.enterprise_site_id.
-- NO ALTER TABLE missions.
-- NO mission request_id type conversion.
-- NO enterprise_request_context mutation.
-- NO backfill.
-- NO synchronization trigger.
-- NO new INSERT / UPDATE / DELETE policy.
-- NO replacement/drop of existing B2C, artisan or admin RLS policies.
-- NO member<->site assignment model invented.
-- =============================================================================

COMMIT;

-- =============================================================================
-- END — DRAFT ONLY
-- DO NOT APPLY TO PRODUCTION UNTIL:
--   1. static audit PASS,
--   2. production READ-ONLY precheck PASS,
--   3. explicit human authorization.
-- =============================================================================
