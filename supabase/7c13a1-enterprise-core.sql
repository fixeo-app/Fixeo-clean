-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.1 Enterprise Core Foundation
-- File: supabase/7c13a1-enterprise-core.sql
-- HEAD at preparation:     8f4074a6
-- HEAD at RLS hardening:   fa2c6cfcefa8cd592b3370298f07898f933d8890
-- HEAD at security review: 7510b047
--
-- PURPOSE
--   Introduce the minimum enterprise identity schema required
--   for the FIXEO Operations (B2B) product.
--
--   This migration is ADDITIVE ONLY.
--   Zero modifications to any existing table, RLS policy,
--   RPC, trigger, or constraint.
--
-- SCOPE
--   1. fixeo_private schema (CREATE IF NOT EXISTS)
--   2. public.enterprise_accounts         (new table)
--   3. public.enterprise_members          (new table)
--   4. updated_at triggers                (reuse existing update_updated_at())
--   5. Indexes                            (5 indexes across both tables)
--   6. fixeo_private authorization helpers (3 SECURITY DEFINER functions)
--   7. RLS on both enterprise tables      (8 policies)
--   8. public.create_enterprise_account() (bootstrap RPC, SECURITY DEFINER)
--   9. Grants / revokes
--
-- ════════════════════════════════════════════════════════════
-- SECURITY DEFINER OWNERSHIP AND RLS BYPASS
-- ════════════════════════════════════════════════════════════
--
-- All SECURITY DEFINER functions in this migration are created
-- by the migration runner, which in Supabase is the 'postgres'
-- role — a superuser.
--
-- PostgreSQL RLS bypass rules (from pg docs §5.8):
--   RLS is NOT enforced for:
--     (a) superusers (rolsuper = true)
--     (b) roles with BYPASSRLS attribute (rolbypassrls = true)
--     (c) table owners — UNLESS FORCE ROW LEVEL SECURITY is set
--   RLS IS enforced for all other roles including authenticated,
--   anon, service_role, and regular authenticated users.
--
-- 'postgres' in Supabase is a superuser (rolsuper = true).
-- Therefore SECURITY DEFINER functions owned by 'postgres' bypass
-- RLS on ALL tables — regardless of FORCE ROW LEVEL SECURITY.
-- (FORCE ROW LEVEL SECURITY only forces RLS for table OWNERS,
--  not for superusers. A superuser always bypasses RLS.)
--
-- This is the established FIXEO convention confirmed in:
--   7c11c-dispatch-foundation-precheck.sql PM-11:
--   "If the function owner is a superuser or has rolbypassrls,
--    SECURITY DEFINER functions bypass RLS on all tables."
--   7c11c-dispatch-foundation-verify.sql V-18:
--   "Expected: rolsuper=true OR rolbypassrls=true."
--
-- Application to helpers in this migration:
--   fixeo_private._fixeo_is_admin()
--     → reads public.users: RLS NOT applied (superuser context)
--   fixeo_private._fixeo_is_enterprise_member(uuid)
--     → reads public.enterprise_members: RLS NOT applied
--   fixeo_private._fixeo_is_enterprise_manager(uuid)
--     → reads public.enterprise_members: RLS NOT applied
--   public.create_enterprise_account()
--     → inserts public.enterprise_accounts: RLS NOT applied
--     → inserts public.enterprise_members: RLS NOT applied
--
-- FORCE ROW LEVEL SECURITY note:
--   enterprise_accounts and enterprise_members do NOT have FORCE RLS.
--   service_role bypass is intentional for staff operations.
--   Even if FORCE RLS were added, it would not affect superuser reads.
--
-- ════════════════════════════════════════════════════════════
-- HELPER SCHEMA: fixeo_private
-- ════════════════════════════════════════════════════════════
--
-- The three authorization helpers are placed in the fixeo_private
-- schema, which is NOT in PostgREST's exposed schema list.
--
-- EVIDENCE: Phase 1B live probe of
--   artisan_internal_remediation_phase_a_v1_backup returned PGRST205
--   ("Could not find the table ... in the schema cache").
--   PGRST205 is the PostgREST error for objects not in the schema
--   cache — meaning fixeo_private is NOT an exposed schema.
--   Repository contains no config.toml or supabase project config
--   that would modify exposed schemas; default Supabase exposes
--   public only.
--
-- CONSEQUENCE:
--   Functions in fixeo_private with GRANT EXECUTE TO authenticated:
--     - ARE callable in RLS USING/WITH CHECK clauses (PostgreSQL
--       does not restrict EXECUTE to PostgREST-exposed schemas)
--     - ARE NOT reachable via PostgREST /rest/v1/rpc/* endpoints
--       (PostgREST only routes RPCs from its configured schemas)
--
--   This eliminates the membership oracle risk:
--     - Authenticated users CANNOT call fixeo_private._fixeo_is_*()
--       directly via the Supabase REST API
--     - The functions are invoked only by the PostgreSQL RLS engine
--
-- fixeo_private already exists in the live database.
-- CREATE SCHEMA IF NOT EXISTS is safe and idempotent.
--
-- ════════════════════════════════════════════════════════════
-- RLS RECURSION ELIMINATION
-- ════════════════════════════════════════════════════════════
--
-- No RLS policy on enterprise_members queries enterprise_members.
-- No RLS policy on enterprise_accounts queries enterprise_accounts.
--
-- All membership checks delegate to fixeo_private SECURITY DEFINER
-- helpers. As superuser-owned functions they read enterprise_members
-- WITHOUT triggering enterprise_members' own RLS policies.
-- Recursion is structurally impossible.
--
-- ════════════════════════════════════════════════════════════
-- MUTATION SURFACE: enterprise_members
-- ════════════════════════════════════════════════════════════
--
-- authenticated has SELECT only on enterprise_members.
-- No INSERT, UPDATE, or DELETE granted to authenticated.
-- All member writes: bootstrap RPC or service_role.
-- Member administration deferred to reviewed RPCs in later migrations.
--
-- ════════════════════════════════════════════════════════════
-- ACCOUNT UPDATE SURFACE
-- ════════════════════════════════════════════════════════════
--
-- Column-level grant: UPDATE(name, legal_name) only.
-- status cannot be written by any authenticated user regardless of
-- RLS outcome — the privilege layer rejects it.
--
-- ════════════════════════════════════════════════════════════
-- BOOTSTRAP ABUSE CONTROL
-- ════════════════════════════════════════════════════════════
--
-- create_enterprise_account() enforces: one active owner membership
-- per user. A user who is already the owner of an enterprise cannot
-- create another one without FIXEO staff intervention.
-- This is appropriate for V1 where FIXEO manually onboards clients.
-- The restriction can be lifted in a future migration.
--
-- Distinction:
--   BELONGING to multiple enterprises → allowed (many-to-many)
--   FOUNDING multiple enterprises     → blocked in V1
--
-- ════════════════════════════════════════════════════════════
-- ATOMICITY PROOF: create_enterprise_account()
-- ════════════════════════════════════════════════════════════
--
-- PL/pgSQL EXCEPTION blocks use implicit SAVEPOINTs.
-- When the EXCEPTION clause is entered, PostgreSQL rolls back all
-- changes made since the block's BEGIN to an internal savepoint.
-- Both INSERT statements (accounts + members) are inside the same
-- BEGIN...EXCEPTION block. If the second INSERT fails, both are
-- rolled back together. The function returns normally with an error
-- jsonb. No partial writes persist.
--
-- This is the same pattern used by decline_mission(), start_mission(),
-- complete_mission() in 7c11e2-mission-lifecycle.sql.
--
-- ════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ════════════════════════════════════════════════════════════
--
-- Reuses existing public.update_updated_at() trigger function.
-- Body: BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
-- Not SECURITY DEFINER. No schema references. Safe to reuse.
-- Triggers added ONLY to the two new enterprise tables.
--
-- ════════════════════════════════════════════════════════════
-- EXISTING TABLES NOT TOUCHED
-- ════════════════════════════════════════════════════════════
--
--   public.users              — NO changes
--   public.profiles           — NO changes
--   public.artisans           — NO changes
--   public.service_requests   — NO changes
--   public.missions           — NO changes
--   public.enterprise_leads   — NO changes
--   All existing RPCs         — NO changes
--   All existing RLS policies — NO changes
--   All existing triggers     — NO changes
--
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_users_exists      boolean;
  v_update_fn_exists  boolean;
  v_ea_exists         boolean;
  v_em_exists         boolean;
  v_rpc_exists        boolean;
  v_h1_exists         boolean;
  v_h2_exists         boolean;
  v_h3_exists         boolean;
BEGIN
  -- 1. public.users must exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'users'
  ) INTO v_users_exists;
  IF NOT v_users_exists THEN
    RAISE EXCEPTION 'ABORT: public.users does not exist. Apply schema.sql first.';
  END IF;

  -- 2. update_updated_at() trigger function must exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'update_updated_at'
  ) INTO v_update_fn_exists;
  IF NOT v_update_fn_exists THEN
    RAISE EXCEPTION
      'ABORT: public.update_updated_at() not found. Apply schema.sql first.';
  END IF;

  -- 3. enterprise_accounts must NOT already exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'enterprise_accounts'
  ) INTO v_ea_exists;
  IF v_ea_exists THEN
    RAISE EXCEPTION
      'ABORT: public.enterprise_accounts already exists. '
      'Migration may have been applied previously.';
  END IF;

  -- 4. enterprise_members must NOT already exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'enterprise_members'
  ) INTO v_em_exists;
  IF v_em_exists THEN
    RAISE EXCEPTION
      'ABORT: public.enterprise_members already exists. '
      'Migration may have been applied previously.';
  END IF;

  -- 5. create_enterprise_account RPC must NOT already exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'create_enterprise_account'
  ) INTO v_rpc_exists;
  IF v_rpc_exists THEN
    RAISE EXCEPTION
      'ABORT: public.create_enterprise_account() already exists. '
      'Migration may have been applied previously.';
  END IF;

  -- 6. fixeo_private authorization helpers must NOT already exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_admin'
  ) INTO v_h1_exists;
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_enterprise_member'
  ) INTO v_h2_exists;
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'fixeo_private' AND p.proname = '_fixeo_is_enterprise_manager'
  ) INTO v_h3_exists;
  IF v_h1_exists OR v_h2_exists OR v_h3_exists THEN
    RAISE EXCEPTION
      'ABORT: fixeo_private authorization helpers already exist '
      '(_fixeo_is_admin: %, _fixeo_is_enterprise_member: %, '
      '_fixeo_is_enterprise_manager: %). '
      'Migration may have been applied previously.',
      v_h1_exists, v_h2_exists, v_h3_exists;
  END IF;

  RAISE NOTICE '7c13a1 preconditions PASSED';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: fixeo_private schema
--
-- Already exists in the live database (confirmed Phase 1B).
-- CREATE IF NOT EXISTS is idempotent and safe.
-- fixeo_private is NOT exposed to PostgREST — functions placed
-- here are not reachable via /rest/v1/rpc/*.
-- ════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS fixeo_private;

-- Grant USAGE to authenticated so RLS policies can invoke
-- fixeo_private functions. USAGE on a schema does NOT grant
-- access to objects inside it — each function still requires
-- an explicit EXECUTE grant.
GRANT USAGE ON SCHEMA fixeo_private TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a1 — fixeo_private schema ready'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: public.enterprise_accounts
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_accounts (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  legal_name   text,
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_accounts_pkey
    PRIMARY KEY (id),

  CONSTRAINT enterprise_accounts_name_length
    CHECK (char_length(name) BETWEEN 1 AND 200),

  CONSTRAINT enterprise_accounts_legal_name_length
    CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 1 AND 300),

  CONSTRAINT enterprise_accounts_status_values
    CHECK (status IN ('active', 'suspended', 'closed'))
);

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_accounts created'; END $$;

DROP TRIGGER IF EXISTS enterprise_accounts_updated_at ON public.enterprise_accounts;
CREATE TRIGGER enterprise_accounts_updated_at
  BEFORE UPDATE ON public.enterprise_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_ea_status
  ON public.enterprise_accounts (status)
  WHERE status = 'active';

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_accounts trigger + index created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: public.enterprise_members
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_members (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id  uuid        NOT NULL,
  user_id        uuid        NOT NULL,
  role           text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active',
  invited_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_members_pkey
    PRIMARY KEY (id),

  -- FK: enterprise deleted → all its members deleted
  CONSTRAINT enterprise_members_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- FK: user deleted → membership deleted
  CONSTRAINT enterprise_members_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- FK: inviter deleted → audit trail preserved (invited_by → NULL)
  CONSTRAINT enterprise_members_invited_by_fk
    FOREIGN KEY (invited_by)
    REFERENCES public.users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  -- Enterprise role vocabulary.
  -- These roles live ONLY in enterprise_members.role.
  -- They do not affect public.users.role CHECK constraint.
  CONSTRAINT enterprise_members_role_values
    CHECK (role IN (
      'owner',
      'admin',
      'operations_manager',
      'site_manager',
      'reporter',
      'viewer'
    )),

  CONSTRAINT enterprise_members_status_values
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),

  -- One membership record per user per enterprise
  CONSTRAINT enterprise_members_unique_membership
    UNIQUE (enterprise_id, user_id)
);

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_members created'; END $$;

DROP TRIGGER IF EXISTS enterprise_members_updated_at ON public.enterprise_members;
CREATE TRIGGER enterprise_members_updated_at
  BEFORE UPDATE ON public.enterprise_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index: list members of an enterprise
CREATE INDEX idx_em_enterprise_status
  ON public.enterprise_members (enterprise_id, status);

-- Index: list enterprises a user belongs to
CREATE INDEX idx_em_user_status
  ON public.enterprise_members (user_id, status);

-- Index: RLS hot path — active membership lookup (used by all helpers)
CREATE UNIQUE INDEX idx_em_active_membership
  ON public.enterprise_members (enterprise_id, user_id)
  WHERE status = 'active';

-- Index: pending invitation queries
CREATE INDEX idx_em_invited
  ON public.enterprise_members (enterprise_id, created_at DESC)
  WHERE status = 'invited';

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_members triggers + indexes created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Authorization helpers in fixeo_private
--
-- PURPOSE
--   Membership authorization helpers for RLS policies.
--   Placed in fixeo_private (NOT PostgREST-exposed) so that
--   authenticated users cannot invoke them directly via
--   /rest/v1/rpc/* — eliminating the membership oracle risk.
--
-- OWNERSHIP AND RLS BYPASS
--   Created by the migration runner ('postgres' superuser).
--   SECURITY DEFINER → execute as 'postgres' (rolsuper=true).
--   Superusers bypass RLS on ALL tables unconditionally.
--   FORCE ROW LEVEL SECURITY applies only to TABLE OWNERS,
--   not to superusers. A superuser always bypasses RLS.
--
-- WHY THIS ELIMINATES RECURSION
--   RLS policy on enterprise_members calls helper (no table ref)
--   → helper executes as 'postgres' (superuser)
--   → reads enterprise_members with RLS SKIPPED
--   → returns boolean
--   → policy evaluation complete
--   No cycle. No recursion. Structurally impossible.
--
-- GRANT DESIGN
--   fixeo_private schema: GRANT USAGE TO authenticated
--     (already applied in Section 1)
--   Each helper:
--     REVOKE EXECUTE FROM PUBLIC  — deny by default
--     REVOKE EXECUTE FROM anon    — explicit block
--     GRANT EXECUTE TO authenticated — required for RLS evaluation
--       PostgreSQL must EXECUTE the helper when evaluating RLS
--       for authenticated sessions. Without this grant, the RLS
--       policy evaluation itself fails with a permission error.
--   NOT CALLABLE via PostgREST: fixeo_private is not an exposed
--   schema; /rest/v1/rpc/ cannot route to fixeo_private.*.
--
-- STABLE: correct — pure reads, no side effects, same inputs
--   yield same outputs within a transaction. PostgreSQL may cache
--   the result per statement (call once per query across many rows).
-- ════════════════════════════════════════════════════════════


-- ── Helper 1: fixeo_private._fixeo_is_admin() ────────────────
--
-- Returns true if auth.uid() is a FIXEO platform admin.
-- Uses canonical public.users.role = 'admin'.
-- NOT public.profiles.role (legacy pattern — not used here).
--
-- Called by: ea_fixeo_admin_all, em_fixeo_admin_all policies.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_result    boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.users u
    WHERE  u.id   = v_caller_id
      AND  u.role = 'admin'
  ) INTO v_result;

  RETURN COALESCE(v_result, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION fixeo_private._fixeo_is_admin() TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a1 — fixeo_private._fixeo_is_admin() created'; END $$;


-- ── Helper 2: fixeo_private._fixeo_is_enterprise_member(uuid) ─
--
-- Returns true if auth.uid() has an active membership in
-- the given enterprise_id.
--
-- Called by: ea_members_select, em_members_select policies.
--
-- Recursion safety: executes as postgres (superuser) →
-- reads enterprise_members without RLS → no policy fires.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_member(
  p_enterprise_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_result    boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR p_enterprise_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = p_enterprise_id
      AND  em.user_id       = v_caller_id
      AND  em.status        = 'active'
  ) INTO v_result;

  RETURN COALESCE(v_result, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_member(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_member(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a1 — fixeo_private._fixeo_is_enterprise_member() created'; END $$;


-- ── Helper 3: fixeo_private._fixeo_is_enterprise_manager(uuid) ─
--
-- Returns true if auth.uid() holds an owner or admin role
-- with active status in the given enterprise_id.
--
-- Called by: ea_owner_update policy.
--
-- Recursion safety: identical to _fixeo_is_enterprise_member.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fixeo_private._fixeo_is_enterprise_manager(
  p_enterprise_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_result    boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR p_enterprise_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = p_enterprise_id
      AND  em.user_id       = v_caller_id
      AND  em.role          IN ('owner', 'admin')
      AND  em.status        = 'active'
  ) INTO v_result;

  RETURN COALESCE(v_result, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_manager(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fixeo_private._fixeo_is_enterprise_manager(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a1 — fixeo_private._fixeo_is_enterprise_manager() created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: RLS — public.enterprise_accounts
--
-- No policy body queries enterprise_accounts or enterprise_members.
-- All membership checks delegate to fixeo_private helpers.
-- Recursion is structurally impossible.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_accounts ENABLE ROW LEVEL SECURITY;
-- NOT FORCE ROW LEVEL SECURITY: service_role bypass is intentional.

-- Policy 1: Deny all access to anon.
DROP POLICY IF EXISTS "ea_deny_anon"       ON public.enterprise_accounts;
CREATE POLICY "ea_deny_anon"
  ON public.enterprise_accounts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Policy 2: Active members may SELECT their enterprise account.
DROP POLICY IF EXISTS "ea_members_select"  ON public.enterprise_accounts;
CREATE POLICY "ea_members_select"
  ON public.enterprise_accounts
  FOR SELECT
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(id));

-- Policy 3: Enterprise owner/admin may UPDATE name and legal_name.
-- Column-level grant (Section 6) is the hard enforcement layer.
-- WITH CHECK ensures status cannot be changed to non-active via
-- any UPDATE path (defence-in-depth behind the column grant).
DROP POLICY IF EXISTS "ea_owner_update"    ON public.enterprise_accounts;
CREATE POLICY "ea_owner_update"
  ON public.enterprise_accounts
  FOR UPDATE
  TO authenticated
  USING  (fixeo_private._fixeo_is_enterprise_manager(id))
  WITH CHECK (
    fixeo_private._fixeo_is_enterprise_manager(id)
    AND status = 'active'
  );

-- Policy 4: FIXEO global admin has full access.
-- Uses canonical public.users.role = 'admin' (via _fixeo_is_admin).
DROP POLICY IF EXISTS "ea_fixeo_admin_all" ON public.enterprise_accounts;
CREATE POLICY "ea_fixeo_admin_all"
  ON public.enterprise_accounts
  FOR ALL
  TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_accounts RLS enabled (4 policies)'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 6: RLS — public.enterprise_members
--
-- No policy body queries enterprise_members.
-- All membership checks delegate to fixeo_private helpers.
-- authenticated has SELECT only — no INSERT/UPDATE/DELETE.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_members ENABLE ROW LEVEL SECURITY;

-- Policy 1: Deny all access to anon.
DROP POLICY IF EXISTS "em_deny_anon"        ON public.enterprise_members;
CREATE POLICY "em_deny_anon"
  ON public.enterprise_members
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Policy 2: A user may SELECT their own membership row.
-- Pure column comparison — no table reference, no helper needed.
-- Required to read invitation status before membership is active.
DROP POLICY IF EXISTS "em_self_select"      ON public.enterprise_members;
CREATE POLICY "em_self_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 3: Active members may SELECT all members of their enterprise.
-- Delegates to fixeo_private._fixeo_is_enterprise_member.
-- No direct query of enterprise_members in this policy body.
DROP POLICY IF EXISTS "em_members_select"   ON public.enterprise_members;
CREATE POLICY "em_members_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

-- Policy 4: FIXEO global admin has full access to all member rows.
DROP POLICY IF EXISTS "em_fixeo_admin_all"  ON public.enterprise_members;
CREATE POLICY "em_fixeo_admin_all"
  ON public.enterprise_members
  FOR ALL
  TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

DO $$ BEGIN RAISE NOTICE '7c13a1 — enterprise_members RLS enabled (4 policies)'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Grants and revokes
-- ════════════════════════════════════════════════════════════

-- enterprise_accounts
REVOKE ALL ON public.enterprise_accounts FROM anon;
REVOKE ALL ON public.enterprise_accounts FROM PUBLIC;
GRANT  SELECT                    ON public.enterprise_accounts TO authenticated;
GRANT  UPDATE (name, legal_name) ON public.enterprise_accounts TO authenticated;
-- Column-level UPDATE: authenticated cannot UPDATE status, id,
-- created_at, or updated_at regardless of RLS outcome.
-- No INSERT, no DELETE, no broad UPDATE to authenticated.

-- enterprise_members
REVOKE ALL ON public.enterprise_members FROM anon;
REVOKE ALL ON public.enterprise_members FROM PUBLIC;
GRANT  SELECT ON public.enterprise_members TO authenticated;
-- SELECT only. No INSERT, UPDATE, or DELETE to authenticated.

DO $$ BEGIN RAISE NOTICE '7c13a1 — table grants/revokes applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 8: Bootstrap RPC — public.create_enterprise_account()
--
-- The ONLY supported path for authenticated enterprise creation.
--
-- BOOTSTRAP ABUSE CONTROL (V1)
--   One active owner membership per user. A user who is already
--   an active owner of any enterprise cannot create another.
--   FIXEO staff may bypass this via service_role directly.
--   This restriction can be lifted in a future migration.
--   Rationale: V1 enterprise onboarding is FIXEO-assisted.
--   Unlimited self-service creation is outside the intended flow.
--
-- ATOMICITY
--   Both INSERT statements are inside a single BEGIN...EXCEPTION
--   block. PL/pgSQL places an implicit SAVEPOINT at the block
--   start. If the second INSERT fails, PostgreSQL rolls back to
--   that savepoint — both inserts are reverted together.
--   No orphan enterprise_accounts row can persist.
--
-- SECURITY DEFINER
--   Owned by postgres (superuser). Bypasses RLS on both tables.
--   Neither table has authenticated INSERT privilege.
--   Only auth.uid() is used as identity — no caller-supplied
--   user_id or role is accepted.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_enterprise_account(
  p_name       text,
  p_legal_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_exists  boolean;
  v_already_owner  boolean;
  v_enterprise_id  uuid;
BEGIN

  -- Guard 1: caller must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 2: caller must exist in public.users
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  ) INTO v_caller_exists;
  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- Guard 3: V1 bootstrap abuse control
  -- One active owner membership per user in V1.
  -- Prevents unlimited self-service enterprise creation.
  -- FIXEO staff can create additional accounts via service_role.
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.user_id = v_caller_id
      AND  em.role    = 'owner'
      AND  em.status  = 'active'
  ) INTO v_already_owner;
  IF v_already_owner THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_owner');
  END IF;

  -- Guard 4: validate account name
  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.trim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;
  IF pg_catalog.char_length(pg_catalog.trim(p_name)) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  -- Guard 5: validate legal_name if provided
  IF p_legal_name IS NOT NULL THEN
    IF pg_catalog.char_length(pg_catalog.trim(p_legal_name)) < 1
       OR pg_catalog.char_length(pg_catalog.trim(p_legal_name)) > 300
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_name_invalid');
    END IF;
  END IF;

  -- Atomic insert: both rows or neither (SAVEPOINT semantics).
  -- Executes as postgres (SECURITY DEFINER). RLS is not applied.

  INSERT INTO public.enterprise_accounts (name, legal_name, status)
  VALUES (
    pg_catalog.trim(p_name),
    CASE
      WHEN p_legal_name IS NOT NULL THEN pg_catalog.trim(p_legal_name)
      ELSE NULL
    END,
    'active'
  )
  RETURNING id INTO v_enterprise_id;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status, invited_by)
  VALUES (
    v_enterprise_id,
    v_caller_id,
    'owner',   -- hardcoded; not caller-supplied
    'active',  -- founding member is immediately active
    NULL       -- no inviter for the founding member
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',            true,
    'enterprise_id', v_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log diagnostics server-side without leaking to client.
    -- Follows the same pattern as decline_mission(), start_mission()
    -- in 7c11e2-mission-lifecycle.sql.
    RAISE WARNING '[create_enterprise_account] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'internal_error'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_account(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_account(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_enterprise_account(text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c13a1 — create_enterprise_account() RPC created'; END $$;


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.13A.1 Enterprise Core — migration complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Schema:';
  RAISE NOTICE '  fixeo_private (CREATE IF NOT EXISTS)';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  public.enterprise_accounts';
  RAISE NOTICE '  public.enterprise_members';
  RAISE NOTICE '';
  RAISE NOTICE 'Helpers (fixeo_private — not PostgREST-exposed):';
  RAISE NOTICE '  fixeo_private._fixeo_is_admin()';
  RAISE NOTICE '  fixeo_private._fixeo_is_enterprise_member(uuid)';
  RAISE NOTICE '  fixeo_private._fixeo_is_enterprise_manager(uuid)';
  RAISE NOTICE '';
  RAISE NOTICE 'Public RPC:';
  RAISE NOTICE '  public.create_enterprise_account(text, text)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS:  4 policies on enterprise_accounts';
  RAISE NOTICE '      4 policies on enterprise_members';
  RAISE NOTICE 'Indexes:   5 (1 on accounts, 4 on members)';
  RAISE NOTICE 'Triggers:  2 (reuse update_updated_at)';
  RAISE NOTICE '';
  RAISE NOTICE 'Existing tables modified:   NONE';
  RAISE NOTICE 'Existing RLS modified:      NONE';
  RAISE NOTICE 'Existing RPCs modified:     NONE';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT APPLY — AWAITING HUMAN AUTHORIZATION';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;


-- ════════════════════════════════════════════════════════════
-- ROLLBACK SQL
-- NOT executed as part of this migration.
-- Run ONLY via service_role in Supabase Studio after
-- explicit human authorization.
-- Reverse dependency order: members → accounts → helpers → schema
-- ════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Safety: abort if data exists
-- DO $$
-- DECLARE
--   v_ea_count integer;
--   v_em_count integer;
-- BEGIN
--   SELECT COUNT(*) INTO v_ea_count FROM public.enterprise_accounts;
--   SELECT COUNT(*) INTO v_em_count FROM public.enterprise_members;
--   IF v_ea_count > 0 OR v_em_count > 0 THEN
--     RAISE EXCEPTION
--       'ROLLBACK ABORTED: data exists '
--       '(enterprise_accounts: %, enterprise_members: %)',
--       v_ea_count, v_em_count;
--   END IF;
--   RAISE NOTICE 'Rollback safety check passed — tables are empty';
-- END $$;
--
-- -- Drop public RPC
-- DROP FUNCTION IF EXISTS public.create_enterprise_account(text, text);
--
-- -- Drop triggers
-- DROP TRIGGER IF EXISTS enterprise_members_updated_at  ON public.enterprise_members;
-- DROP TRIGGER IF EXISTS enterprise_accounts_updated_at ON public.enterprise_accounts;
--
-- -- Drop tables (members first: FK references accounts)
-- DROP TABLE IF EXISTS public.enterprise_members;
-- DROP TABLE IF EXISTS public.enterprise_accounts;
--
-- -- Drop fixeo_private helpers (after tables: policy refs gone with tables)
-- DROP FUNCTION IF EXISTS fixeo_private._fixeo_is_enterprise_manager(uuid);
-- DROP FUNCTION IF EXISTS fixeo_private._fixeo_is_enterprise_member(uuid);
-- DROP FUNCTION IF EXISTS fixeo_private._fixeo_is_admin();
--
-- -- Do NOT drop fixeo_private schema: it existed before this migration
-- -- and may contain other objects. Only drop if confirmed empty.
-- -- REVOKE USAGE ON SCHEMA fixeo_private FROM authenticated;
-- -- DROP SCHEMA IF EXISTS fixeo_private;
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════
