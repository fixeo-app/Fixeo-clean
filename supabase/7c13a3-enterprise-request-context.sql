-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.3 Enterprise Request Context
-- File: supabase/7c13a3-enterprise-request-context.sql
-- Branch: recovery/seo-v3-safe
--
-- PURPOSE
--   Bridge enterprise accounts and sites to canonical
--   service_requests. Every enterprise-originated service
--   request is created through create_enterprise_request(),
--   which inserts into the canonical public.service_requests
--   table and records identity context in the new
--   public.enterprise_request_context table.
--
--   This migration is ADDITIVE ONLY.
--   Zero modifications to any existing table, RLS policy,
--   RPC, trigger, constraint, or grant.
--
-- SCOPE
--   1. public.enterprise_request_context     (new table)
--   2. RLS on enterprise_request_context     (3 policies)
--   3. Table grants                          (minimum required)
--   4. public.create_enterprise_request()   (creation RPC)
--   5. RPC grants
--
-- PREREQUISITES (must be applied first)
--   7c13a1-enterprise-core.sql
--     → public.enterprise_accounts
--     → public.enterprise_members
--     → fixeo_private._fixeo_is_enterprise_member(uuid)
--     → fixeo_private._fixeo_is_enterprise_manager(uuid)
--     → fixeo_private._fixeo_is_admin()
--   7c13a2-enterprise-sites.sql
--     → public.enterprise_sites
--   Base schema
--     → public.service_requests
--     → public.users
--
-- ════════════════════════════════════════════════════════════
-- ARCHITECTURE DOCTRINE
-- ════════════════════════════════════════════════════════════
--
-- Enterprise requests flow through the EXISTING FIXEO dispatch
-- pipeline unchanged:
--
--   create_enterprise_request()
--   → INSERT public.service_requests (status = 'new')
--   → trg_dispatch_v2_on_service_request fires (AFTER INSERT)
--   → trigger_dispatch_v2_on_service_request()
--   → dispatch_execute_v1(new.id, 3)
--   → dispatch_execution_plan_v1 → dispatch_batch_preview_v1
--   → dispatch_candidate_pool_v1 → dispatch_preview_v21
--   → resolve_service_category_v1 → normalize_service_category_v1
--   → INSERT public.dispatch_execution_queue
--   → existing mission lifecycle unchanged
--
-- The RPC does NOT call dispatch_execute_v1() or
-- dispatch_request_v1() — the trigger owns automatic dispatch.
--
-- ════════════════════════════════════════════════════════════
-- WHY client_profile_id = NULL
-- ════════════════════════════════════════════════════════════
--
-- public.service_requests.client_profile_id references
-- public.profiles(id), which is the Supabase Auth profile table.
-- public.enterprise_members.user_id references public.users(id),
-- which is the FIXEO internal users table.
-- These are separate identity stores.
-- Enterprise ownership/reporter identity is stored in
-- enterprise_request_context.created_by (→ public.users).
-- client_profile_id is intentionally NULL for enterprise
-- requests in V1 — it is nullable post-migration by confirmed
-- production schema (guest_requests_rls.sql patch).
--
-- ════════════════════════════════════════════════════════════
-- AUTOMATIC DISPATCH PATH — NULL SAFETY CONFIRMED
-- ════════════════════════════════════════════════════════════
--
-- Production inspection (Phase 1G preflight) confirms:
--   tracking_ref = NULL   → not read by dispatch chain
--   guest_token_hash = NULL → not read by dispatch chain
--   target_artisan_id = NULL → open-market matching used
--   client_profile_id = NULL → not read by dispatch chain
--   urgency = NULL          → handled as COALESCE/NULL-safe
--
-- An enterprise INSERT with these NULLs traverses the full
-- dispatch chain without exception.
--
-- ════════════════════════════════════════════════════════════
-- RLS VISIBILITY MODEL (V1)
-- ════════════════════════════════════════════════════════════
--
-- SELECT: authenticated caller may read a context row only
-- when they are an ACTIVE member of that enterprise.
-- Uses fixeo_private._fixeo_is_enterprise_member(enterprise_id)
-- — the same helper used by enterprise_accounts and
-- enterprise_sites. Recursion is structurally impossible:
-- the helper executes as postgres (superuser), bypassing
-- enterprise_members' own RLS when reading membership.
--
-- INSERT/UPDATE/DELETE: denied to authenticated entirely.
-- All mutations go through create_enterprise_request() only.
--
-- ════════════════════════════════════════════════════════════
-- KNOWN DEFERRED ITEMS
-- ════════════════════════════════════════════════════════════
--
-- SECURITY DEBT (do not repair here):
--   Several existing dispatch functions use
--   SET search_path = 'public' rather than ''.
--   Specifically: dispatch_execution_plan_v1,
--   dispatch_batch_preview_v1, dispatch_candidate_pool_v1,
--   dispatch_preview_v21, resolve_service_category_v1.
--   These are confirmed in production and are NOT modified
--   by this migration. Remediation deferred to a dedicated
--   security hardening migration.
--
-- V1 LIMITATIONS (deferred to V1.1+):
--   • operations_manager / site_manager cannot see all
--     enterprise requests — only their own created_by rows
--     are visible to them through SELECT, but the select
--     policy grants membership-wide visibility. Full site-
--     scoped visibility requires a site-assignment table.
--   • notes, enterprise_ref, status fields: deferred.
--   • updated_at: deferred (no mutable columns in V1).
--
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_users_exists    boolean;
  v_ea_exists       boolean;
  v_es_exists       boolean;
  v_sr_exists       boolean;
  v_mem_exists      boolean;
  v_helper_member   boolean;
  v_helper_admin    boolean;
  v_erc_exists      boolean;
  v_rpc_exists      boolean;
BEGIN
  -- 1. public.users must exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) INTO v_users_exists;
  IF NOT v_users_exists THEN
    RAISE EXCEPTION 'ABORT: public.users does not exist.';
  END IF;

  -- 2. public.enterprise_accounts must exist (7c13a1 applied)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_accounts'
  ) INTO v_ea_exists;
  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_accounts not found. Apply 7c13a1 first.';
  END IF;

  -- 3. public.enterprise_sites must exist (7c13a2 applied)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_sites'
  ) INTO v_es_exists;
  IF NOT v_es_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_sites not found. Apply 7c13a2 first.';
  END IF;

  -- 4. public.service_requests must exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_requests'
  ) INTO v_sr_exists;
  IF NOT v_sr_exists THEN
    RAISE EXCEPTION 'ABORT: public.service_requests not found.';
  END IF;

  -- 5. public.enterprise_members must exist (7c13a1 applied)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_members'
  ) INTO v_mem_exists;
  IF NOT v_mem_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_members not found. Apply 7c13a1 first.';
  END IF;

  -- 6. fixeo_private helpers must exist (7c13a1 applied)
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private'
      AND  p.proname = '_fixeo_is_enterprise_member'
  ) INTO v_helper_member;
  IF NOT v_helper_member THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_member not found. Apply 7c13a1 first.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private'
      AND  p.proname = '_fixeo_is_admin'
  ) INTO v_helper_admin;
  IF NOT v_helper_admin THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_admin not found. Apply 7c13a1 first.';
  END IF;

  -- 7. enterprise_request_context must NOT already exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_request_context'
  ) INTO v_erc_exists;
  IF v_erc_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_request_context already exists. Migration may have been applied previously.';
  END IF;

  -- 8. create_enterprise_request RPC must NOT already exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'create_enterprise_request'
  ) INTO v_rpc_exists;
  IF v_rpc_exists THEN
    RAISE EXCEPTION 'ABORT: public.create_enterprise_request() already exists. Migration may have been applied previously.';
  END IF;

  RAISE NOTICE '7c13a3 preconditions PASSED';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: public.enterprise_request_context
-- ════════════════════════════════════════════════════════════
--
-- Minimal immutable bridge table — V1.
-- No status, no notes, no enterprise_ref, no updated_at.
-- Mutable metadata fields are deferred to V1.1+.
--
-- UNIQUENESS: UNIQUE(service_request_id) enforces that at most
-- one enterprise context row can exist per canonical service
-- request. This is the hard invariant for Phase 1G V1.
--
-- FK ON DELETE RESTRICT throughout: prevents deletion of
-- referenced account, site, service_request, or user while
-- any context row references them. Protects audit trail.

CREATE TABLE public.enterprise_request_context (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),

  -- Tenant anchor (denormalized for RLS USING clause —
  -- avoids a JOIN inside the policy, eliminating recursion risk).
  enterprise_id       uuid        NOT NULL,

  -- Origin site: NOT NULL in V1 — all enterprise requests
  -- originate from a physical site.
  site_id             uuid        NOT NULL,

  -- The canonical service request this context wraps.
  -- UNIQUE: one context row per service request maximum.
  service_request_id  uuid        NOT NULL,

  -- Who created this context row (enterprise member, → users).
  created_by          uuid        NOT NULL,

  -- Creation timestamp only — immutable bridge in V1.
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────

  CONSTRAINT erc_pkey
    PRIMARY KEY (id),

  -- Tenant anchor FK: RESTRICT prevents account deletion
  -- while any request context exists.
  CONSTRAINT erc_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Site FK: RESTRICT prevents site deletion while context
  -- rows reference it.
  CONSTRAINT erc_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Service request FK: RESTRICT prevents SR deletion while
  -- an enterprise context exists for it.
  CONSTRAINT erc_service_request_fk
    FOREIGN KEY (service_request_id)
    REFERENCES public.service_requests (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Creator FK: RESTRICT prevents user deletion while they
  -- have created enterprise request context rows.
  CONSTRAINT erc_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES public.users (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Hard uniqueness: one context row per service request.
  -- A service_request_id cannot appear in two context rows.
  CONSTRAINT erc_service_request_unique
    UNIQUE (service_request_id)
);

DO $$ BEGIN RAISE NOTICE '7c13a3 — enterprise_request_context table created'; END $$;


-- ── Index: RLS hot path ───────────────────────────────────
-- Every erc_members_select policy evaluation filters by
-- enterprise_id. Used by _fixeo_is_enterprise_member(enterprise_id).
CREATE INDEX idx_erc_enterprise
  ON public.enterprise_request_context (enterprise_id);

-- ── Index: site-scoped lookup ─────────────────────────────
-- Supports future queries: "all requests for site X".
CREATE INDEX idx_erc_site
  ON public.enterprise_request_context (site_id);

-- ── Index: creator lookup ─────────────────────────────────
-- Supports "requests I created" queries.
CREATE INDEX idx_erc_created_by
  ON public.enterprise_request_context (created_by);

DO $$ BEGIN RAISE NOTICE '7c13a3 — enterprise_request_context indexes created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: RLS
-- ════════════════════════════════════════════════════════════
--
-- Three-policy model matching the enterprise tables pattern.
--
-- SELECT: any active enterprise member may read context rows
-- for their enterprise. Uses the existing hardened helper
-- fixeo_private._fixeo_is_enterprise_member(enterprise_id).
-- enterprise_id is a direct column on this table — no JOIN
-- required inside the USING clause.
-- Recursion is structurally impossible: the helper executes
-- as postgres (superuser), bypassing enterprise_members' own
-- RLS when it reads membership.
--
-- INSERT / UPDATE / DELETE: denied entirely to authenticated.
-- All mutations are gated through create_enterprise_request().
-- No separate UPDATE or DELETE RPC in V1.

ALTER TABLE public.enterprise_request_context ENABLE ROW LEVEL SECURITY;
-- NOT FORCE: service_role (postgres) bypasses RLS.

-- ── Policy 1: Blanket deny for anon ──────────────────────
DROP POLICY IF EXISTS "erc_deny_anon" ON public.enterprise_request_context;
CREATE POLICY "erc_deny_anon"
  ON public.enterprise_request_context
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ── Policy 2: Active members may read their context rows ──
-- USING: caller must hold an active membership (any eligible
-- role) in the enterprise referenced by enterprise_id.
-- Mirrors es_members_select from 7c13a2.
DROP POLICY IF EXISTS "erc_members_select" ON public.enterprise_request_context;
CREATE POLICY "erc_members_select"
  ON public.enterprise_request_context
  FOR SELECT
  TO authenticated
  USING (
    fixeo_private._fixeo_is_enterprise_member(enterprise_id)
  );

-- ── Policy 3: FIXEO platform admin has full access ────────
DROP POLICY IF EXISTS "erc_fixeo_admin_all" ON public.enterprise_request_context;
CREATE POLICY "erc_fixeo_admin_all"
  ON public.enterprise_request_context
  FOR ALL
  TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

DO $$ BEGIN RAISE NOTICE '7c13a3 — enterprise_request_context RLS enabled (3 policies)'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: TABLE GRANTS
-- ════════════════════════════════════════════════════════════
--
-- CRITICAL: Supabase grants authenticated=arwdDxtm (ALL) on
-- every new public table by default. Must REVOKE ALL before
-- issuing minimum required grants. This is the pattern
-- confirmed in Phase 1F / 7c13a2.

REVOKE ALL ON public.enterprise_request_context FROM PUBLIC;
REVOKE ALL ON public.enterprise_request_context FROM anon;
REVOKE ALL ON public.enterprise_request_context FROM authenticated;

-- SELECT only: authenticated enterprise members read through
-- the RLS policy above.
-- No INSERT, UPDATE, or DELETE to authenticated directly.
GRANT SELECT ON public.enterprise_request_context TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a3 — enterprise_request_context grants applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: public.create_enterprise_request()
-- ════════════════════════════════════════════════════════════
--
-- The ONLY supported creation path for enterprise requests.
--
-- SECURITY MODEL
--   • SECURITY DEFINER: executes as postgres, bypassing RLS
--     on service_requests and enterprise_request_context.
--   • SET search_path = '': prevents search-path injection.
--   • All object references are fully schema-qualified.
--   • auth.uid() is the sole identity source — never from
--     request body.
--   • client_profile_id = NULL: enterprise identity is
--     anchored in created_by → public.users. The
--     service_requests.client_profile_id FK targets
--     public.profiles, a separate identity store.
--
-- DISPATCH MODEL
--   • The RPC does NOT call dispatch_execute_v1() or
--     dispatch_request_v1(). Automatic dispatch fires via
--     trg_dispatch_v2_on_service_request (AFTER INSERT).
--   • No double-dispatch risk.
--
-- ATOMICITY
--   • Both INSERTs (service_requests, enterprise_request_context)
--     are in the same BEGIN…EXCEPTION block.
--   • The automatic dispatch trigger fires inside the same
--     block, between the two INSERTs.
--   • If an unexpected error is raised, PL/pgSQL rolls back
--     all changes made inside the BEGIN…EXCEPTION block
--     (service_requests INSERT, its trigger effects including
--     dispatch_execution_queue writes, and the
--     enterprise_request_context INSERT) before the handler
--     executes. No orphan rows persist.
--   • The EXCEPTION block then catches the error, logs a
--     WARNING server-side, and returns
--     {"ok": false, "reason": "internal_error"}.
--     The exception is absorbed by the function; the RPC
--     returns normally at SQL level with ok=false.
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
--             site_manager/reporter)
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
--     site_not_found, site_enterprise_mismatch, site_inactive,
--     service_category_required, description_required,
--     urgency_invalid, internal_error
--
-- ════════════════════════════════════════════════════════════

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
  v_authorized         boolean;
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
  -- Exact status vocabulary from 7c13a1:
  --   CHECK (status IN ('active', 'suspended', 'closed'))
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_accounts ea
    WHERE  ea.id     = p_enterprise_id
      AND  ea.status = 'active'
  ) INTO v_enterprise_active;
  IF NOT COALESCE(v_enterprise_active, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_not_found');
  END IF;

  -- ── Guard 6: CRITICAL — caller must be an ACTIVE member ───
  -- with a creation-eligible role.
  -- Allowed: owner, admin, operations_manager, site_manager, reporter
  -- Denied:  viewer (and all non-active statuses)
  -- Exact role vocabulary from 7c13a1 CHECK constraint:
  --   'owner','admin','operations_manager','site_manager','reporter','viewer'
  -- Exact status vocabulary from 7c13a1 CHECK constraint:
  --   'invited','active','suspended','removed'
  -- Inline check: no new helper needed for V1.
  SELECT EXISTS (
    SELECT 1
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
           )
  ) INTO v_authorized;
  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 7: site must exist, belong to this enterprise, ──
  -- and be active.
  -- Exact status vocabulary from 7c13a2:
  --   CHECK (status IN ('active', 'inactive'))
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

  -- v_city is now populated from the canonical site row.
  -- City is NOT accepted from the caller — it must reflect the
  -- physical site address used by the dispatch matching engine.

  -- ── Guard 8: service_category must not be NULL/blank ──────
  -- Normalize: btrim only. No lowercasing — dispatch resolver
  -- (normalize_service_category_v1) handles normalization.
  IF p_service_category IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_service_category)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'service_category_required');
  END IF;
  v_service_category := pg_catalog.btrim(p_service_category);

  -- ── Guard 9: description must not be NULL/blank ───────────
  -- Production contract: description is NOT NULL in service_requests.
  IF p_description IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_description)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'description_required');
  END IF;
  v_description := pg_catalog.btrim(p_description);

  -- ── Guard 10: urgency must be valid if supplied ───────────
  -- Exact vocabulary from production service_requests CHECK:
  --   'normale', 'urgent', 'now'
  -- NULL is permitted (urgency is nullable in production).
  IF p_urgency IS NOT NULL THEN
    IF p_urgency NOT IN ('normale', 'urgent', 'now') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'urgency_invalid');
    END IF;
    v_urgency := p_urgency;
  ELSE
    v_urgency := NULL;
  END IF;

  -- ── INSERT 1: canonical service_requests ─────────────────
  -- Executes as postgres (SECURITY DEFINER). RLS not applied.
  -- client_profile_id = NULL: enterprise identity is in
  -- created_by → public.users, not in profiles.
  -- tracking_ref = NULL: not required by dispatch chain.
  -- guest_token_hash = NULL: not required by dispatch chain.
  -- target_artisan_id = NULL: open-market dispatch.
  -- status = 'new': canonical entry point for dispatch.
  -- city: sourced from site row, not from caller.
  --
  -- After this INSERT returns, the AFTER INSERT trigger
  -- trg_dispatch_v2_on_service_request fires synchronously
  -- within this same transaction:
  --   → trigger_dispatch_v2_on_service_request()
  --   → dispatch_execute_v1(v_sr_id, 3)
  --   → dispatch_execution_plan_v1 → ... → INSERT dispatch_execution_queue
  -- All trigger effects are part of this BEGIN…EXCEPTION block.
  -- If an unexpected error is raised before or during INSERT 2,
  -- PL/pgSQL rolls back all block-local changes before the
  -- EXCEPTION handler executes — no orphan rows persist.
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
    NULL,          -- enterprise identity is in erc.created_by
    'new'          -- canonical dispatch entry status
  )
  RETURNING id INTO v_sr_id;

  -- ── INSERT 2: enterprise_request_context ──────────────────
  -- Records enterprise identity context for this service request.
  -- Executes as postgres (SECURITY DEFINER). RLS not applied.
  -- If this INSERT fails (e.g. constraint violation), the
  -- exception handler below surfaces the error as jsonb.
  -- PL/pgSQL rolls back all block-local changes before the
  -- handler executes — no orphan service_request persists.
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
    'ok',                          true,
    'service_request_id',          v_sr_id,
    'enterprise_request_context_id', v_ctx_id,
    'enterprise_id',               p_enterprise_id,
    'site_id',                     p_site_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log diagnostics server-side without leaking internals.
    -- Pattern matches create_enterprise_account() and
    -- create_enterprise_site() from 7c13a1 / 7c13a2.
    -- PL/pgSQL rolls back all changes made inside the
    -- BEGIN…EXCEPTION block before this handler executes —
    -- no partial writes persist. The exception is then
    -- absorbed: RAISE WARNING logs to the server log and
    -- RETURN jsonb surfaces ok=false to the caller.
    -- The RPC returns normally at SQL level with ok=false.
    RAISE WARNING '[create_enterprise_request] unexpected error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'internal_error'
    );
END;
$$;

DO $$ BEGIN RAISE NOTICE '7c13a3 — create_enterprise_request() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: RPC GRANTS
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_enterprise_request(uuid, uuid, text, text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a3 — create_enterprise_request() grants applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.13A.3 Enterprise Request Context — migration complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  public.enterprise_request_context';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created (3):';
  RAISE NOTICE '  idx_erc_enterprise';
  RAISE NOTICE '  idx_erc_site';
  RAISE NOTICE '  idx_erc_created_by';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS: ENABLED (3 policies):';
  RAISE NOTICE '  erc_deny_anon';
  RAISE NOTICE '  erc_members_select';
  RAISE NOTICE '  erc_fixeo_admin_all';
  RAISE NOTICE '';
  RAISE NOTICE 'Public RPC:';
  RAISE NOTICE '  public.create_enterprise_request(uuid, uuid, text, text, text)';
  RAISE NOTICE '';
  RAISE NOTICE 'Existing tables modified:   NONE';
  RAISE NOTICE 'Existing RLS modified:      NONE';
  RAISE NOTICE 'Existing RPCs modified:     NONE';
  RAISE NOTICE 'Existing triggers modified: NONE';
  RAISE NOTICE '';
  RAISE NOTICE 'Known deferred security debt (NOT fixed here):';
  RAISE NOTICE '  dispatch_execution_plan_v1, dispatch_batch_preview_v1,';
  RAISE NOTICE '  dispatch_candidate_pool_v1, dispatch_preview_v21,';
  RAISE NOTICE '  resolve_service_category_v1 — search_path=public (not empty)';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT APPLY — AWAITING HUMAN AUTHORIZATION';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;


-- ════════════════════════════════════════════════════════════
-- ROLLBACK SQL
-- NOT executed as part of this migration.
-- Run ONLY via service_role after explicit human authorization.
-- Reverse dependency order.
-- ════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Safety: abort if data exists
-- DO $$
-- DECLARE
--   v_count integer;
-- BEGIN
--   SELECT COUNT(*) INTO v_count FROM public.enterprise_request_context;
--   IF v_count > 0 THEN
--     RAISE EXCEPTION 'ROLLBACK ABORTED: enterprise_request_context has % rows', v_count;
--   END IF;
--   RAISE NOTICE 'Rollback safety check passed';
-- END $$;
--
-- -- Drop RPC
-- DROP FUNCTION IF EXISTS public.create_enterprise_request(uuid, uuid, text, text, text);
--
-- -- Drop table (drops indexes, constraints, policies automatically)
-- DROP TABLE IF EXISTS public.enterprise_request_context;
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════
