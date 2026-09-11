-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.2 Enterprise Sites Foundation
-- File: supabase/7c13a2-enterprise-sites.sql
-- HEAD at preparation: 53e84b2f0a7f0c4d5cf078595217071e955709af
--
-- PURPOSE
--   Introduce the enterprise_sites table — the physical location
--   anchor for the FIXEO Operations (B2B) product.
--
--   This migration is ADDITIVE ONLY.
--   Zero modifications to any existing table, RLS policy,
--   RPC, trigger, constraint, or grant.
--
-- SCOPE
--   1. public.enterprise_sites              (new table)
--   2. updated_at trigger                   (reuse existing public.update_updated_at())
--   3. Indexes                              (2 indexes)
--   4. RLS on enterprise_sites              (4 policies)
--   5. public.create_enterprise_site()      (creation RPC, SECURITY DEFINER)
--   6. Grants / revokes
--
-- ════════════════════════════════════════════════════════════
-- SECURITY DEFINER OWNERSHIP AND RLS BYPASS
-- ════════════════════════════════════════════════════════════
--
-- All SECURITY DEFINER functions in this migration are:
--   • Owned by the postgres role.
--   • Created with SET search_path = '' to prevent
--     search-path injection attacks.
--   • All object references inside function bodies are
--     fully schema-qualified.
--   • EXECUTE revoked from PUBLIC and anon.
--   • EXECUTE granted to authenticated only.
--
-- ════════════════════════════════════════════════════════════
-- RLS DESIGN
-- ════════════════════════════════════════════════════════════
--
-- enterprise_sites uses the same four-policy pattern as
-- enterprise_accounts and enterprise_members:
--
--   es_deny_anon        — blanket deny for anon role
--   es_members_select   — active members may SELECT own enterprise's sites
--   es_manager_update   — owner/admin may UPDATE site metadata
--   es_fixeo_admin_all  — FIXEO platform admins have full access
--
-- RLS is ENABLED but NOT FORCED.
-- Service_role (postgres) bypasses RLS for Studio operations.
--
-- authenticated INSERT and DELETE are intentionally withheld.
-- Site creation is gated exclusively through the SECURITY DEFINER
-- RPC create_enterprise_site(), which verifies caller identity
-- and enterprise membership before inserting.
--
-- ════════════════════════════════════════════════════════════
-- COLUMN OMISSIONS — DEFERRED
-- ════════════════════════════════════════════════════════════
--
-- The following columns are intentionally absent from V1:
--   • latitude / longitude   — no proximity routing in V1
--   • postal_code            — no postal-code matching in V1
--
-- These require their own migration when the relevant feature
-- is actively being built.
--
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_sites (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id  uuid        NOT NULL,
  name           text        NOT NULL,
  site_code      text            NULL,
  address_line   text            NULL,
  city           text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Primary key
  CONSTRAINT enterprise_sites_pkey
    PRIMARY KEY (id),

  -- Tenant anchor: RESTRICT prevents account deletion while sites exist.
  -- ON UPDATE CASCADE is a defensive no-op (uuid PKs never change).
  CONSTRAINT enterprise_sites_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- name: 1–200 characters after trimming
  CONSTRAINT enterprise_sites_name_length
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 200
    ),

  -- site_code: if provided, 1–80 characters after trimming
  CONSTRAINT enterprise_sites_site_code_length
    CHECK (
      site_code IS NULL
      OR pg_catalog.char_length(pg_catalog.btrim(site_code)) BETWEEN 1 AND 80
    ),

  -- address_line: if provided, 1–500 characters after trimming
  CONSTRAINT enterprise_sites_address_line_length
    CHECK (
      address_line IS NULL
      OR pg_catalog.char_length(pg_catalog.btrim(address_line)) BETWEEN 1 AND 500
    ),

  -- city: 1–120 characters after trimming
  CONSTRAINT enterprise_sites_city_length
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(city)) BETWEEN 1 AND 120
    ),

  -- status: only 'active' or 'inactive' permitted
  CONSTRAINT enterprise_sites_status_values
    CHECK (status IN ('active', 'inactive'))
);

DO $$ BEGIN RAISE NOTICE '7c13a2 — enterprise_sites table created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — UPDATED_AT TRIGGER
-- ════════════════════════════════════════════════════════════
--
-- Reuses public.update_updated_at() without modification.
-- Same pattern as enterprise_accounts_updated_at and
-- enterprise_members_updated_at in 7c13a1.

CREATE TRIGGER enterprise_sites_updated_at
  BEFORE UPDATE ON public.enterprise_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DO $$ BEGIN RAISE NOTICE '7c13a2 — enterprise_sites_updated_at trigger created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3 — INDEXES
-- ════════════════════════════════════════════════════════════
--
-- Only indexes justified by query patterns in Migration 2 itself.
-- No speculative indexes for future enterprise_request_context.

-- Index 1: Primary RLS lookup path.
-- Every es_members_select and es_manager_update policy evaluation
-- filters by enterprise_id. Adding status enables efficient
-- "list active sites for enterprise X" without a filter scan.
CREATE INDEX idx_es_enterprise_status
  ON public.enterprise_sites (enterprise_id, status);

-- Index 2: Tenant-local site code uniqueness.
-- Partial (WHERE site_code IS NOT NULL) avoids false conflicts
-- on null values. Enforces the code-as-identifier contract within
-- a single enterprise without preventing multi-tenant null coexistence.
CREATE UNIQUE INDEX uq_es_enterprise_site_code
  ON public.enterprise_sites (enterprise_id, site_code)
  WHERE site_code IS NOT NULL;

DO $$ BEGIN RAISE NOTICE '7c13a2 — enterprise_sites indexes created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4 — ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_sites ENABLE ROW LEVEL SECURITY;
-- NOT FORCE: service_role (postgres) bypasses RLS.
-- This is intentional — FIXEO Studio operations must work
-- without being gated by the member/manager helpers.

-- ── Policy 1: Blanket deny for unauthenticated callers ──────
-- Mirrors ea_deny_anon and em_deny_anon from 7c13a1.
-- PostgREST sends anon JWT when no Authorization header is present.
-- This policy ensures enterprise site data is never readable
-- via the public API without a valid user JWT.

DROP POLICY IF EXISTS "es_deny_anon" ON public.enterprise_sites;
CREATE POLICY "es_deny_anon"
  ON public.enterprise_sites
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- ── Policy 2: Active members may read their enterprise's sites ─
-- USING: caller must hold an active membership in the site's
-- enterprise (any role: owner, admin, operations_manager,
-- site_manager, reporter, viewer).
-- No WITH CHECK: SELECT policies do not fire on writes.

DROP POLICY IF EXISTS "es_members_select" ON public.enterprise_sites;
CREATE POLICY "es_members_select"
  ON public.enterprise_sites
  FOR SELECT
  TO authenticated
  USING (
    fixeo_private._fixeo_is_enterprise_member(enterprise_id)
  );

-- ── Policy 3: Enterprise owner/admin may UPDATE site metadata ──
-- USING: caller must be active owner or admin of this enterprise.
-- WITH CHECK: same identity requirement; additionally enforces
--   that UPDATE cannot set status to an illegal value even if
--   the column-level grant were somehow widened in future.
-- Column-level UPDATE grant (Section 5) is the hard privilege
-- layer beneath this policy.

DROP POLICY IF EXISTS "es_manager_update" ON public.enterprise_sites;
CREATE POLICY "es_manager_update"
  ON public.enterprise_sites
  FOR UPDATE
  TO authenticated
  USING (
    fixeo_private._fixeo_is_enterprise_manager(enterprise_id)
  )
  WITH CHECK (
    fixeo_private._fixeo_is_enterprise_manager(enterprise_id)
    AND status IN ('active', 'inactive')
  );

-- ── Policy 4: FIXEO platform admin has full access ──────────
-- Mirrors ea_fixeo_admin_all and em_fixeo_admin_all from 7c13a1.
-- FIXEO admins (public.users.role = 'admin') can read, update,
-- and (via service_role which bypasses RLS) manage any site.

DROP POLICY IF EXISTS "es_fixeo_admin_all" ON public.enterprise_sites;
CREATE POLICY "es_fixeo_admin_all"
  ON public.enterprise_sites
  FOR ALL
  TO authenticated
  USING (
    fixeo_private._fixeo_is_admin()
  )
  WITH CHECK (
    fixeo_private._fixeo_is_admin()
  );

DO $$ BEGIN RAISE NOTICE '7c13a2 — enterprise_sites RLS enabled, 4 policies created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5 — TABLE GRANTS
-- ════════════════════════════════════════════════════════════
--
-- Hard privilege layer beneath RLS.
-- authenticated receives SELECT and column-restricted UPDATE only.
-- No INSERT: creation is gated through create_enterprise_site().
-- No DELETE: deactivation is done via status='inactive' UPDATE.

REVOKE ALL ON public.enterprise_sites FROM PUBLIC;
REVOKE ALL ON public.enterprise_sites FROM anon;
-- Supabase default privileges grant authenticated=arwdDxtm on every new table.
-- Explicitly revoke all before issuing minimum required grants.
REVOKE ALL ON public.enterprise_sites FROM authenticated;

GRANT SELECT ON public.enterprise_sites TO authenticated;

-- Column-level UPDATE: id, enterprise_id, created_at, updated_at
-- are NOT grantable — they cannot be modified by authenticated users
-- regardless of RLS outcome.
GRANT UPDATE (
  name,
  site_code,
  address_line,
  city,
  status
) ON public.enterprise_sites TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a2 — enterprise_sites grants applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 6 — CREATION RPC
-- ════════════════════════════════════════════════════════════
--
-- public.create_enterprise_site()
--
-- SECURITY MODEL
--   • SECURITY DEFINER: executes as postgres, bypassing RLS
--     for the INSERT. All authorization is performed explicitly
--     in the guard sequence before the INSERT is reached.
--   • SET search_path = '': prevents search-path injection.
--   • All object references are fully schema-qualified.
--   • p_enterprise_id is caller-supplied and treated as
--     UNTRUSTED INPUT. Guard 4 is the critical cross-tenant
--     boundary: it verifies auth.uid() holds active owner/admin
--     membership in exactly p_enterprise_id before proceeding.
--   • auth.uid() is read from the JWT claims GUC set by
--     PostgREST's JWT middleware — never from the request body.
--   • user_id and role are NOT accepted as parameters.
--
-- GUARD SEQUENCE (in order — first failing guard returns immediately)
--   Guard 1: auth.uid() not NULL              → unauthenticated
--   Guard 2: caller exists in public.users    → user_not_found
--   Guard 3: p_enterprise_id not NULL         → enterprise_required
--   Guard 4: caller is active owner/admin     → forbidden
--             of p_enterprise_id
--   Guard 5: name length 1..200               → name_required / name_too_long
--   Guard 6: city length 1..120               → city_required / city_too_long
--   Guard 7: site_code length 1..80 if given  → site_code_invalid
--   Guard 8: address_line length 1..500       → address_invalid
--             if given
--
-- NORMALIZATION
--   All text inputs are stored after pg_catalog.btrim() only.
--   No lowercasing, no further transformation.
--
-- RETURN SHAPE
--   Success: {"ok": true,  "site_id": "<uuid>"}
--   Failure: {"ok": false, "reason": "<code>"}
--   Reason codes:
--     unauthenticated, user_not_found, enterprise_required,
--     forbidden, name_required, name_too_long,
--     city_required, city_too_long,
--     site_code_invalid, site_code_exists,
--     address_invalid, internal_error

CREATE OR REPLACE FUNCTION public.create_enterprise_site(
  p_enterprise_id  uuid,
  p_name           text,
  p_city           text,
  p_site_code      text DEFAULT NULL,
  p_address_line   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_exists  boolean;
  v_authorized     boolean;
  v_name           text;
  v_city           text;
  v_site_code      text;
  v_address_line   text;
  v_site_id        uuid;
BEGIN

  -- ── Guard 1: caller must be authenticated ─────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: caller must exist in public.users ────────────
  SELECT EXISTS (
    SELECT 1
    FROM   public.users u
    WHERE  u.id = v_caller_id
  ) INTO v_caller_exists;

  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- ── Guard 3: enterprise_id must be supplied ───────────────
  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  -- ── Guard 4: CRITICAL CROSS-TENANT BOUNDARY ───────────────
  -- Verify auth.uid() is an ACTIVE owner or admin of exactly
  -- p_enterprise_id. p_enterprise_id is untrusted caller input;
  -- this check is the sole authority that binds the caller's
  -- identity to the requested enterprise.
  --
  -- Uses fixeo_private._fixeo_is_enterprise_manager(uuid):
  --   EXISTS (
  --     SELECT 1 FROM enterprise_members
  --     WHERE enterprise_id = p_enterprise_id
  --       AND user_id = auth.uid()
  --       AND role IN ('owner','admin')
  --       AND status = 'active'
  --   )
  --
  -- A caller who is a member of enterprise A cannot create a site
  -- for enterprise B — _fixeo_is_enterprise_manager(B) returns false.
  SELECT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id)
  INTO   v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 5: validate and normalize name ──────────────────
  IF p_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  v_name := pg_catalog.btrim(p_name);

  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  -- ── Guard 6: validate and normalize city ──────────────────
  IF p_city IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  v_city := pg_catalog.btrim(p_city);

  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

  -- ── Guard 7: validate and normalize site_code if supplied ─
  IF p_site_code IS NOT NULL THEN
    v_site_code := pg_catalog.btrim(p_site_code);
    IF pg_catalog.char_length(v_site_code) < 1
       OR pg_catalog.char_length(v_site_code) > 80
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_invalid');
    END IF;
  ELSE
    v_site_code := NULL;
  END IF;

  -- ── Guard 8: validate and normalize address_line if supplied
  IF p_address_line IS NOT NULL THEN
    v_address_line := pg_catalog.btrim(p_address_line);
    IF pg_catalog.char_length(v_address_line) < 1
       OR pg_catalog.char_length(v_address_line) > 500
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'address_invalid');
    END IF;
  ELSE
    v_address_line := NULL;
  END IF;

  -- ── INSERT ─────────────────────────────────────────────────
  -- Executes as postgres (SECURITY DEFINER). RLS is not applied.
  -- enterprise_id is taken from the validated p_enterprise_id,
  -- not from the caller's JWT — it was verified in Guard 4.
  INSERT INTO public.enterprise_sites (
    enterprise_id,
    name,
    site_code,
    address_line,
    city,
    status
  )
  VALUES (
    p_enterprise_id,
    v_name,
    v_site_code,
    v_address_line,
    v_city,
    'active'   -- new sites are active; not caller-supplied
  )
  RETURNING id INTO v_site_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok',      true,
    'site_id', v_site_id
  );

EXCEPTION
  -- ── Deterministic unique violation on (enterprise_id, site_code) ─
  -- Constraint name: uq_es_enterprise_site_code
  -- Caught specifically so callers receive a meaningful code rather
  -- than internal_error.
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'site_code_exists'
    );

  -- ── All other unexpected exceptions ───────────────────────
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_site] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'internal_error'
    );
END;
$$;

DO $$ BEGIN RAISE NOTICE '7c13a2 — create_enterprise_site() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 7 — RPC GRANTS
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.create_enterprise_site(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_site(uuid, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_enterprise_site(uuid, text, text, text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a2 — create_enterprise_site() grants applied'; END $$;

DO $$ BEGIN RAISE NOTICE '7c13a2-enterprise-sites migration complete'; END $$;
