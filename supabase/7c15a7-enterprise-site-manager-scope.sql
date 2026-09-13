-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.7 Enterprise Site Manager Scope
-- File: supabase/7c15a7-enterprise-site-manager-scope.sql
-- Sprint: BP08F
-- Branch: recovery/seo-v3-safe
--
-- PURPOSE
--   Restrict the site_manager role to their assigned sites only.
--   Prior to this migration, site_manager was treated identically
--   to all other enterprise members — they could see ALL enterprise
--   sites and ALL enterprise_request_context rows.
--
--   This migration scopes site_manager visibility and write access
--   to only the sites assigned to them via enterprise_member_sites
--   (introduced in 7c15a6-enterprise-site-manager.sql).
--
-- SCOPE
--   1. enterprise_sites RLS: replace es_members_select with two
--      narrower policies (non-SM full view; SM assigned-only)
--   2. enterprise_request_context RLS: replace erc_member_select
--      with two narrower policies (non-SM full view; SM assigned-only)
--   3. create_enterprise_request(): add Guard 6a (site_manager
--      assignment check) — CREATE OR REPLACE from 7c13a3
--   4. confirm_completed_mission(): add site_manager assignment
--      check in Path B ownership query — CREATE OR REPLACE from 7c14a1
--
-- DEPENDENCIES (all must be applied before this migration)
--   7c13a1-enterprise-core.sql
--     → public.enterprise_accounts
--     → public.enterprise_members
--     → fixeo_private._fixeo_is_enterprise_member(uuid)
--     → fixeo_private._fixeo_is_enterprise_manager(uuid)
--     → fixeo_private._fixeo_is_admin()
--   7c13a2-enterprise-sites.sql
--     → public.enterprise_sites
--     → es_members_select policy (will be REPLACED by this migration)
--   7c13a3-enterprise-request-context.sql
--     → public.enterprise_request_context
--     → erc_member_select policy (will be REPLACED by this migration)
--     → public.create_enterprise_request()
--   7c14a1-mission-lifecycle-validate.sql
--     → public.confirm_completed_mission()
--   7c15a6-enterprise-site-manager.sql           ← DIRECT DEPENDENCY
--     → public.enterprise_member_sites
--     → fixeo_private._fixeo_get_site_manager_site_ids(uuid)
--
-- ════════════════════════════════════════════════════════════
-- SECURITY MODEL
-- ════════════════════════════════════════════════════════════
--
-- site_manager is a scoped role: their authority is limited to
-- the physical sites explicitly assigned to them.
--
--   Visibility (SELECT):
--     enterprise_sites        → assigned sites only
--     enterprise_request_context → assigned sites only
--
--   Create (create_enterprise_request):
--     Guard 6a: site_manager MUST have the target site assigned.
--     Returns {ok:false, reason:'site_not_assigned'} otherwise.
--
--   Confirm (confirm_completed_mission):
--     Path B: site_manager qualification now requires an
--     enterprise_member_sites row linking them to the request's site.
--     Returns {ok:false, reason:'request_not_found_or_not_owned'}.
--
-- INACTIVE SITE VISIBILITY:
--   The site-manager RLS policies do NOT filter by site status.
--   An assigned but inactive site is still visible to the site_manager.
--   Rationale: site_manager can see their historical assigned sites
--   (e.g. in an admin/history panel). New request creation is blocked
--   by create_enterprise_request Guard 7 (site_inactive), not by RLS.
--   The req-site selector in the application layer filters active-only
--   for new request creation — this is the correct application-layer gate.
--
-- ════════════════════════════════════════════════════════════
-- POLICIES REPLACED (not merely added)
-- ════════════════════════════════════════════════════════════
--
-- REPLACED: es_members_select on enterprise_sites
--   Was: all active enterprise members can see all enterprise sites
--   Now: split into es_non_sm_select + es_site_manager_select
--
-- REPLACED: erc_member_select on enterprise_request_context
--   Was: all active enterprise members can see all ERC rows
--   Now: split into erc_non_sm_select + erc_site_manager_select
--
-- ════════════════════════════════════════════════════════════
-- REASON CODES ADDED
-- ════════════════════════════════════════════════════════════
--   create_enterprise_request: 'site_not_assigned'
--     → site_manager caller does not have the target site assigned
--   confirm_completed_mission: uses existing 'request_not_found_or_not_owned'
--     → site_manager assignment check failure maps to existing code
--       (consistent with production: ownership failure = not_found)
--
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
--
-- Dependency order:
--   7c15a6 → enterprise_member_sites + _fixeo_get_site_manager_site_ids
--   7c13a2 → enterprise_sites
--   7c13a3 → enterprise_request_context
--
-- This block ABORTS the entire transaction on any failure (RAISE EXCEPTION
-- inside BEGIN propagates to ROLLBACK the outer BEGIN/COMMIT).
DO $$
DECLARE
  v_ems_exists      boolean;
  v_helper_exists   boolean;
  v_es_exists       boolean;
  v_erc_exists      boolean;
  v_cer_exists      boolean;
  v_ccm_exists      boolean;
BEGIN

  -- ── Precondition 1: enterprise_member_sites must exist (7c15a6) ──────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_member_sites'
  ) INTO v_ems_exists;

  IF NOT v_ems_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): public.enterprise_member_sites not found. '
      'Apply 7c15a6-enterprise-site-manager.sql first. '
      'This migration depends on the site assignment table from 7c15a6.';
  END IF;

  -- ── Precondition 2: _fixeo_get_site_manager_site_ids must exist (7c15a6) ─
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private'
      AND p.proname = '_fixeo_get_site_manager_site_ids'
  ) INTO v_helper_exists;

  IF NOT v_helper_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): fixeo_private._fixeo_get_site_manager_site_ids not found. '
      'Apply 7c15a6-enterprise-site-manager.sql first. '
      'This helper is required for site_manager RLS scoping.';
  END IF;

  -- ── Precondition 3: public.enterprise_sites must exist (7c13a2) ──────
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_sites'
  ) INTO v_es_exists;

  IF NOT v_es_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): public.enterprise_sites not found. '
      'Apply 7c13a2-enterprise-sites.sql first.';
  END IF;

  -- ── Precondition 4: public.enterprise_request_context must exist (7c13a3) ─
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_request_context'
  ) INTO v_erc_exists;

  IF NOT v_erc_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): public.enterprise_request_context not found. '
      'Apply 7c13a3-enterprise-request-context.sql first.';
  END IF;

  -- ── Precondition 5: public.create_enterprise_request must exist (7c13a3) ─
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_enterprise_request'
  ) INTO v_cer_exists;

  IF NOT v_cer_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): public.create_enterprise_request not found. '
      'Apply 7c13a3-enterprise-request-context.sql first.';
  END IF;

  -- ── Precondition 6: public.confirm_completed_mission must exist (7c14a1) ─
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'confirm_completed_mission'
  ) INTO v_ccm_exists;

  IF NOT v_ccm_exists THEN
    RAISE EXCEPTION
      'ABORT (7c15a7): public.confirm_completed_mission not found. '
      'Apply 7c14a1-mission-lifecycle-validate.sql first.';
  END IF;

  RAISE NOTICE '7c15a7 SECTION 0 — preconditions PASSED (all 6 dependencies verified)';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — enterprise_sites: site_manager scoping
-- ════════════════════════════════════════════════════════════
--
-- The existing es_members_select policy allows ALL active enterprise
-- members to see all sites for their enterprise.  We split this into
-- two narrower policies:
--
--   es_non_sm_select   — non-site_manager roles (owner, admin,
--                        operations_manager, reporter, viewer) continue
--                        to see all sites for their enterprise.
--
--   es_site_manager_select — site_manager sees only sites that are
--                        explicitly assigned to them in
--                        enterprise_member_sites.
--
-- Note on inactive sites:
--   The site_manager policy does NOT filter by site status.
--   Inactive assigned sites ARE visible (see INACTIVE SITE VISIBILITY
--   rationale in the header above).
-- ════════════════════════════════════════════════════════════

-- ── Step 1a: Drop the existing broad member select policy ──────────────
-- This policy was created in 7c13a2. It grants all active enterprise
-- members SELECT on all enterprise sites. We replace it with two
-- narrower policies below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_sites'
      AND policyname = 'es_members_select'
  ) THEN
    EXECUTE 'DROP POLICY es_members_select ON public.enterprise_sites';
    RAISE NOTICE '7c15a7 — es_members_select policy dropped from enterprise_sites';
  ELSE
    RAISE NOTICE '7c15a7 — es_members_select policy not found on enterprise_sites (already dropped or never existed)';
  END IF;
END $$;

-- ── Step 1b: Policy for non-site_manager roles ─────────────────────────
-- Roles: owner, admin, operations_manager, reporter, viewer
-- Behavior: see ALL active-member enterprise sites (same as old es_members_select
-- but explicitly excludes site_manager from this broad grant).
DROP POLICY IF EXISTS "es_non_sm_select" ON public.enterprise_sites;
CREATE POLICY "es_non_sm_select"
  ON public.enterprise_sites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_members em
      WHERE em.enterprise_id = enterprise_sites.enterprise_id
        AND em.user_id       = auth.uid()
        AND em.status        = 'active'
        AND em.role          IN (
              'owner',
              'admin',
              'operations_manager',
              'reporter',
              'viewer'
            )
    )
  );

-- ── Step 1c: Policy for site_manager role ──────────────────────────────
-- site_manager sees ONLY their assigned sites.
-- Dual condition:
--   (a) site_id must be in the array returned by _fixeo_get_site_manager_site_ids
--   (b) caller must be an active site_manager in the enterprise
--
-- Note: inactive assigned sites ARE visible (no status filter on enterprise_sites).
-- The caller's active membership is still required — an inactive/removed
-- site_manager loses visibility entirely (condition b fails).
DROP POLICY IF EXISTS "es_site_manager_select" ON public.enterprise_sites;
CREATE POLICY "es_site_manager_select"
  ON public.enterprise_sites
  FOR SELECT
  TO authenticated
  USING (
    enterprise_sites.id = ANY(
      fixeo_private._fixeo_get_site_manager_site_ids(enterprise_sites.enterprise_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.enterprise_members em
      WHERE em.enterprise_id = enterprise_sites.enterprise_id
        AND em.user_id       = auth.uid()
        AND em.status        = 'active'
        AND em.role          = 'site_manager'
    )
  );

DO $$ BEGIN RAISE NOTICE '7c15a7 SECTION 1 — enterprise_sites RLS updated: es_non_sm_select + es_site_manager_select created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — enterprise_request_context: site_manager scoping
-- ════════════════════════════════════════════════════════════
--
-- The existing erc_member_select policy (from 7c13a3) allows all
-- active enterprise members to see ALL ERC rows for their enterprise.
-- We replace it with two narrower policies mirroring Section 1.
--
--   erc_non_sm_select     — non-site_manager roles see all ERC rows
--   erc_site_manager_select — site_manager sees only ERC rows where
--                             site_id is in their assigned sites
--
-- The dashboard reads service_requests via enterprise_request_context
-- JOIN. After this migration, a site_manager's dashboard will only
-- surface requests originating from their assigned sites.
-- ════════════════════════════════════════════════════════════

-- ── Step 2a: Drop the existing broad member select policy ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enterprise_request_context'
      AND policyname = 'erc_member_select'
  ) THEN
    EXECUTE 'DROP POLICY erc_member_select ON public.enterprise_request_context';
    RAISE NOTICE '7c15a7 — erc_member_select policy dropped from enterprise_request_context';
  ELSE
    RAISE NOTICE '7c15a7 — erc_member_select policy not found on enterprise_request_context (already dropped or never existed)';
  END IF;
END $$;

-- ── Step 2b: Policy for non-site_manager roles ─────────────────────────
DROP POLICY IF EXISTS "erc_non_sm_select" ON public.enterprise_request_context;
CREATE POLICY "erc_non_sm_select"
  ON public.enterprise_request_context
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_members em
      WHERE em.enterprise_id = enterprise_request_context.enterprise_id
        AND em.user_id       = auth.uid()
        AND em.status        = 'active'
        AND em.role          IN (
              'owner',
              'admin',
              'operations_manager',
              'reporter',
              'viewer'
            )
    )
  );

-- ── Step 2c: Policy for site_manager role ──────────────────────────────
-- site_manager sees only ERC rows where the request's site_id is
-- in their assigned sites for that enterprise.
DROP POLICY IF EXISTS "erc_site_manager_select" ON public.enterprise_request_context;
CREATE POLICY "erc_site_manager_select"
  ON public.enterprise_request_context
  FOR SELECT
  TO authenticated
  USING (
    enterprise_request_context.site_id = ANY(
      fixeo_private._fixeo_get_site_manager_site_ids(enterprise_request_context.enterprise_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.enterprise_members em
      WHERE em.enterprise_id = enterprise_request_context.enterprise_id
        AND em.user_id       = auth.uid()
        AND em.status        = 'active'
        AND em.role          = 'site_manager'
    )
  );

DO $$ BEGIN RAISE NOTICE '7c15a7 SECTION 2 — enterprise_request_context RLS updated: erc_non_sm_select + erc_site_manager_select created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3 — create_enterprise_request: add Guard 6a
-- ════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE of the function originally written in 7c13a3.
--
-- THE ONLY CHANGE from 7c13a3 is:
--   (a) DECLARE block gains: v_caller_role text
--   (b) Guard 6 is restructured: instead of EXISTS-into-bool,
--       it now SELECTs the caller's role into v_caller_role
--       (same authorization check, now also captures the role
--        for use in Guard 6a)
--   (c) Guard 6a added immediately after Guard 6:
--       if v_caller_role = 'site_manager', the target site must
--       have an enterprise_member_sites assignment row linking
--       this caller to this site.
--
-- All other guards (1-5, 7-10), the mutation blocks, error codes,
-- SECURITY DEFINER, SET search_path='', and RETURN SHAPE are
-- preserved exactly as in 7c13a3.
--
-- New reason code: 'site_not_assigned'
--   Returned when a site_manager caller does not have the
--   requested site in their assignment list.
-- ════════════════════════════════════════════════════════════
--
-- GUARD SEQUENCE (first failing guard returns immediately)
--   Guard 1: auth.uid() not NULL                  → unauthenticated
--   Guard 2: caller exists in public.users         → user_not_found
--   Guard 3: p_enterprise_id not NULL              → enterprise_required
--   Guard 4: p_site_id not NULL                    → site_required
--   Guard 5: enterprise exists and is active        → enterprise_not_found
--   Guard 6: caller is ACTIVE member with a
--            creation-eligible role                 → forbidden
--            (owner/admin/operations_manager/
--             site_manager/reporter) — now also
--            captures v_caller_role
--   Guard 6a: if v_caller_role = 'site_manager',
--             site must be assigned to this user   → site_not_assigned
--   Guard 7: site exists, belongs to enterprise,
--            and is active                          → site_not_found /
--                                                     site_enterprise_mismatch /
--                                                     site_inactive
--   Guard 8: service_category not NULL/blank        → service_category_required
--   Guard 9: description not NULL/blank             → description_required
--   Guard 10: urgency valid if supplied             → urgency_invalid
--
-- RETURN SHAPE
--   Success: {"ok": true,
--             "service_request_id": "<uuid>",
--             "enterprise_request_context_id": "<uuid>",
--             "enterprise_id": "<uuid>",
--             "site_id": "<uuid>"}
--   Failure: {"ok": false, "reason": "<code>"}
--   Reason codes:
--     unauthenticated, user_not_found,
--     enterprise_required, site_required,
--     enterprise_not_found, forbidden,
--     site_not_assigned,
--     site_not_found, site_enterprise_mismatch, site_inactive,
--     service_category_required, description_required,
--     urgency_invalid, internal_error

CREATE OR REPLACE FUNCTION public.create_enterprise_request(
  p_enterprise_id    uuid,
  p_site_id          uuid,
  p_service_category text,
  p_description      text,
  p_urgency          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id          uuid;
  v_caller_exists      boolean;
  v_enterprise_active  boolean;
  v_caller_role        text;   -- BP08F: needed to detect site_manager for Guard 6a
  v_site_enterprise    uuid;
  v_site_status        text;
  v_city               text;
  v_service_category   text;
  v_description        text;
  v_urgency            text;
  v_sr_id              uuid;
  v_ctx_id             uuid;
BEGIN

  -- ── Guard 1: caller must be authenticated ─────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: caller must exist in public.users ────────────
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  ) INTO v_caller_exists;
  IF NOT COALESCE(v_caller_exists, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- ── Guard 3: enterprise_id must be supplied ───────────────
  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  -- ── Guard 4: site_id must be supplied ─────────────────────
  IF p_site_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_required');
  END IF;

  -- ── Guard 5: enterprise must exist and be active ──────────
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_accounts ea
    WHERE  ea.id     = p_enterprise_id
      AND  ea.status = 'active'
  ) INTO v_enterprise_active;
  IF NOT COALESCE(v_enterprise_active, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_not_found');
  END IF;

  -- ── Guard 6: CRITICAL — resolve caller role ────────────────
  -- Changed from 7c13a3: instead of EXISTS-into-bool, we SELECT
  -- the role into v_caller_role. This serves the same authorization
  -- purpose (NOT FOUND = forbidden) while also capturing the role
  -- for Guard 6a below.
  -- Allowed: owner, admin, operations_manager, site_manager, reporter
  -- Denied:  viewer (and all non-active statuses)
  SELECT em.role INTO v_caller_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = p_enterprise_id
    AND  em.user_id       = v_caller_id
    AND  em.status        = 'active'
    AND  em.role          IN (
           'owner',
           'admin',
           'operations_manager',
           'site_manager',
           'reporter'
         );

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 6a: site_manager assignment check ────────────────
  -- BP08F: a site_manager caller must have the target site explicitly
  -- assigned to them in enterprise_member_sites.
  -- Owner/admin/operations_manager/reporter are unaffected.
  IF v_caller_role = 'site_manager' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   public.enterprise_member_sites ems
      JOIN   public.enterprise_members em
               ON em.id = ems.member_id
      WHERE  ems.enterprise_id = p_enterprise_id
        AND  ems.site_id       = p_site_id
        AND  em.user_id        = v_caller_id
        AND  em.status         = 'active'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_assigned');
    END IF;
  END IF;

  -- ── Guard 7: site must exist, belong to this enterprise, ──
  -- and be active.
  SELECT
    es.enterprise_id,
    es.status,
    es.city
  INTO
    v_site_enterprise,
    v_site_status,
    v_city
  FROM   public.enterprise_sites es
  WHERE  es.id = p_site_id;

  IF v_site_enterprise IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  IF v_site_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_inactive');
  END IF;

  -- ── Guard 8: service_category must not be NULL/blank ──────
  IF p_service_category IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_service_category)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'service_category_required');
  END IF;
  v_service_category := pg_catalog.btrim(p_service_category);

  -- ── Guard 9: description must not be NULL/blank ───────────
  IF p_description IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_description)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'description_required');
  END IF;
  v_description := pg_catalog.btrim(p_description);

  -- ── Guard 10: urgency must be valid if supplied ───────────
  IF p_urgency IS NOT NULL THEN
    IF p_urgency NOT IN ('normale', 'urgent', 'now') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'urgency_invalid');
    END IF;
    v_urgency := p_urgency;
  ELSE
    v_urgency := NULL;
  END IF;

  -- ── INSERT 1: canonical service_requests ─────────────────
  INSERT INTO public.service_requests (
    service_category,
    city,
    description,
    urgency,
    client_profile_id,
    status
  )
  VALUES (
    v_service_category,
    v_city,
    v_description,
    v_urgency,
    NULL,
    'new'
  )
  RETURNING id INTO v_sr_id;

  -- ── INSERT 2: enterprise_request_context ──────────────────
  INSERT INTO public.enterprise_request_context (
    enterprise_id,
    site_id,
    service_request_id,
    created_by
  )
  VALUES (
    p_enterprise_id,
    p_site_id,
    v_sr_id,
    v_caller_id
  )
  RETURNING id INTO v_ctx_id;

  -- ── Return success ─────────────────────────────────────────
  RETURN pg_catalog.jsonb_build_object(
    'ok',                            true,
    'service_request_id',            v_sr_id,
    'enterprise_request_context_id', v_ctx_id,
    'enterprise_id',                 p_enterprise_id,
    'site_id',                       p_site_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_request] unexpected error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'internal_error'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a7 SECTION 3 — create_enterprise_request() re-defined with Guard 6a (site_manager assignment check)'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4 — confirm_completed_mission: site_manager assignment check
-- ════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE of the function from 7c14a1.
--
-- THE ONLY CHANGE from 7c14a1 is in the BLOCK: OWNERSHIP QUERY.
-- Path B (enterprise branch) is made more precise for site_manager:
--
--   Before (7c14a1):
--     em.role IN ('owner','admin','operations_manager','site_manager')
--
--   After (7c15a7):
--     em.role IN ('owner','admin','operations_manager')
--     OR (
--       em.role = 'site_manager'
--       AND EXISTS (
--         SELECT 1 FROM public.enterprise_member_sites ems
--         WHERE ems.member_id     = em.id
--           AND ems.site_id       = erc.site_id
--           AND ems.enterprise_id = erc.enterprise_id
--       )
--     )
--
-- BP08F: site_manager must be assigned to the request's site.
-- Unassigned site_manager gets request_not_found_or_not_owned.
-- This is consistent with production behavior for ownership failure.
--
-- ALL other blocks are preserved byte-for-byte from 7c14a1:
--   AUTH, REQUEST LOOKUP, VALIDATED IDEMPOTENCY, COMPLETED PRECOND,
--   REPAIR PATH, MISSION SELECTION, SR UPDATE, MISSION UPDATE,
--   ATOMICITY GUARD, EXCEPTION HANDLING, RETURN SHAPE, ACL.
--
-- STRICT B2C BACKWARD COMPATIBILITY:
--   Path A (client_profile_id = auth.uid()) is UNCHANGED.
--   B2C callers are entirely unaffected by this change.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_completed_mission(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid;
  v_sr_status  text;
  v_is_owned   boolean;
  v_mission_id uuid;
  v_rows_sr    integer;
  v_rows_m     integer;
BEGIN

  -- ── BLOCK: AUTH — UNCHANGED ─────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── BLOCK: REQUEST LOOKUP — UNCHANGED ──────────────────────────────────
  SELECT sr.status
  INTO   v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id = p_request_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- ── BLOCK: OWNERSHIP QUERY — PATH A UNCHANGED; PATH B REFINED (BP08F) ──
  -- Guard 2: ownership check.
  --
  -- Path A — B2C (UNCHANGED from 7c14a1):
  --   service_requests.client_profile_id = auth.uid()
  --
  -- Path B — Enterprise (REFINED from 7c14a1 — BP08F):
  --   enterprise_request_context links this SR to an enterprise.
  --   The caller must be an ACTIVE member of that enterprise in a
  --   confirming-eligible role.
  --   Eligible:  owner, admin, operations_manager (any of these, unconditionally)
  --              site_manager (only if assigned to the request's site)
  --   Blocked:   reporter, viewer (read-only — cannot trigger lifecycle)
  --              site_manager NOT assigned to the request's site
  --
  -- BP08F: site_manager must be assigned to the request's site.
  -- Unassigned site_manager gets request_not_found_or_not_owned.
  --
  SELECT EXISTS (
    -- Path A: B2C — direct client ownership (production baseline — unchanged)
    SELECT 1
    FROM   public.service_requests sr2
    WHERE  sr2.id                = p_request_id
      AND  sr2.client_profile_id = v_uid

    UNION ALL

    -- Path B: Enterprise — authorized enterprise member (refined BP08F)
    SELECT 1
    FROM   public.enterprise_request_context erc
    JOIN   public.enterprise_members em
           ON  em.enterprise_id = erc.enterprise_id
           AND em.user_id       = v_uid
           AND em.status        = 'active'
           AND (
                 -- Non-site_manager roles: no assignment check required
                 em.role IN ('owner', 'admin', 'operations_manager')
                 OR (
                   -- site_manager: must be assigned to the request's site
                   -- BP08F: site_manager must have this site assigned.
                   -- Unassigned site_manager gets request_not_found_or_not_owned.
                   em.role = 'site_manager'
                   AND EXISTS (
                     SELECT 1
                     FROM   public.enterprise_member_sites ems
                     WHERE  ems.member_id     = em.id
                       AND  ems.site_id       = erc.site_id
                       AND  ems.enterprise_id = erc.enterprise_id
                   )
                 )
               )
    WHERE  erc.service_request_id = p_request_id

    LIMIT 1
  ) INTO v_is_owned;

  IF NOT v_is_owned THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'request_not_found_or_not_owned');
  END IF;

  -- ── BLOCK: VALIDATED — CANONICAL REPAIR PATH — UNCHANGED ─────────────────
  IF v_sr_status = 'validated' THEN
    DECLARE
      v_repair_id   uuid;
      v_repair_rows integer;
    BEGIN
      SELECT m.id
      INTO   v_repair_id
      FROM   public.missions m
      WHERE  m.request_id = p_request_id::text
        AND  m.status     IN ('done', 'validated')
      ORDER  BY m.created_at DESC
      LIMIT  1;

      IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'mission_not_found');
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.missions m
        WHERE  m.id     = v_repair_id
          AND  m.status = 'validated'
      ) THEN
        RETURN pg_catalog.jsonb_build_object(
          'ok',                true,
          'request_id',        p_request_id,
          'mission_id',        v_repair_id,
          'already_validated', true
        );
      END IF;

      UPDATE public.missions
      SET    status = 'validated'
      WHERE  id     = v_repair_id
        AND  status = 'done';

      GET DIAGNOSTICS v_repair_rows = ROW_COUNT;

      IF v_repair_rows = 0 THEN
        RAISE EXCEPTION
          '[confirm_completed_mission] repair atomicity: mission % could not be set validated '
          '(concurrent call completed the repair).', v_repair_id
        USING ERRCODE = 'P0001';
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'ok',         true,
        'request_id', p_request_id,
        'mission_id', v_repair_id,
        'repaired',   true
      );
    END;
  END IF;

  -- ── BLOCK: COMPLETED PRECONDITION — UNCHANGED ───────────────────────────
  IF v_sr_status != 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',      false,
      'reason',  'request_not_completed',
      'current', v_sr_status
    );
  END IF;

  -- ── BLOCK: MISSION LOOKUP (SR=completed path) — UNCHANGED ───────────────
  SELECT m.id
  INTO   v_mission_id
  FROM   public.missions m
  WHERE  m.request_id = p_request_id::text
    AND  m.status     = 'done'
  ORDER  BY m.created_at DESC
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'completed_mission_not_found');
  END IF;

  -- ── BLOCK: SR UPDATE (Step 1) — UNCHANGED ──────────────────────────────
  UPDATE public.service_requests
  SET    status = 'validated'
  WHERE  id     = p_request_id
    AND  status = 'completed';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  IF v_rows_sr = 0 THEN
    RAISE EXCEPTION
      '[confirm_completed_mission] atomicity violation: '
      'service_request % not updated (status was not completed — possible race).', p_request_id
    USING ERRCODE = 'P0001';
  END IF;

  -- ── BLOCK: MISSION UPDATE (Step 2) — UNCHANGED ─────────────────────────
  UPDATE public.missions
  SET    status = 'validated'
  WHERE  id     = v_mission_id
    AND  status = 'done';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  -- ── BLOCK: ATOMICITY GUARD — UNCHANGED ──────────────────────────────────
  IF v_rows_m = 0 THEN
    RAISE EXCEPTION
      '[confirm_completed_mission] atomicity violation: '
      'service_request % set to validated but mission % could not be set validated '
      '(mission status may have changed concurrently). Rolling back.',
      p_request_id, v_mission_id
    USING ERRCODE = 'P0001';
  END IF;

  -- ── BLOCK: RETURN SHAPE — UNCHANGED ────────────────────────────────────
  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'request_id', p_request_id,
    'mission_id', v_mission_id
  );

EXCEPTION
  -- ── BLOCK: EXCEPTION HANDLING — UNCHANGED ──────────────────────────────
  WHEN SQLSTATE 'P0001' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'atomicity_error');
  WHEN OTHERS THEN
    RAISE WARNING '[confirm_completed_mission] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

-- ── BLOCK: ACL — UNCHANGED ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.confirm_completed_mission(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a7 SECTION 4 — confirm_completed_mission() re-defined with BP08F site_manager assignment check in Path B'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5 — SUMMARY NOTICE
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.7 Enterprise Site Manager Scope — BP08F — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS changes (enterprise_sites):';
  RAISE NOTICE '  DROPPED:  es_members_select (broad — all roles)';
  RAISE NOTICE '  CREATED:  es_non_sm_select  (owner/admin/ops_mgr/reporter/viewer)';
  RAISE NOTICE '  CREATED:  es_site_manager_select (site_manager: assigned sites only)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS changes (enterprise_request_context):';
  RAISE NOTICE '  DROPPED:  erc_member_select (broad — all roles)';
  RAISE NOTICE '  CREATED:  erc_non_sm_select (owner/admin/ops_mgr/reporter/viewer)';
  RAISE NOTICE '  CREATED:  erc_site_manager_select (site_manager: assigned sites only)';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC changes (create_enterprise_request):';
  RAISE NOTICE '  Guard 6: restructured to capture v_caller_role (same auth logic)';
  RAISE NOTICE '  Guard 6a: NEW — site_manager must have site assigned';
  RAISE NOTICE '  New reason code: site_not_assigned';
  RAISE NOTICE '  All other guards/returns/security unchanged from 7c13a3';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC changes (confirm_completed_mission):';
  RAISE NOTICE '  Path B (enterprise): site_manager now requires assignment check';
  RAISE NOTICE '  Non-SM roles: owner/admin/operations_manager — no change';
  RAISE NOTICE '  Unassigned site_manager: request_not_found_or_not_owned';
  RAISE NOTICE '  B2C Path A: unchanged';
  RAISE NOTICE '  All other blocks: byte-for-byte from 7c14a1';
  RAISE NOTICE '';
  RAISE NOTICE 'Inactive assigned sites: VISIBLE to site_manager (no status filter in RLS)';
  RAISE NOTICE 'New request creation on inactive site: blocked by Guard 7 (site_inactive)';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT APPLY — AWAITING HUMAN AUTHORIZATION';
  RAISE NOTICE '══════════════════════════════════════════════════════════════════';
END $$;

COMMIT;
