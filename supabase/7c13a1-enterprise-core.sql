-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.1 Enterprise Core Foundation
-- File: supabase/7c13a1-enterprise-core.sql
-- HEAD at preparation: 8f4074a6
-- HEAD at RLS hardening: fa2c6cfcefa8cd592b3370298f07898f933d8890
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
--   1. public.enterprise_accounts      (new table)
--   2. public.enterprise_members       (new table)
--   3. updated_at triggers             (reuse existing update_updated_at())
--   4. Indexes                         (5 indexes across both tables)
--   5. Authorization helpers           (3 SECURITY DEFINER helpers)
--   6. RLS                             (8 policies across both tables)
--   7. public.create_enterprise_account()  (bootstrap RPC, SECURITY DEFINER)
--   8. Grants / revokes
--
-- DOCTRINE
--   EXTEND FIXEO. DO NOT REWRITE FIXEO.
--   Global identity stays in public.users.id.
--   Global roles stay in public.users.role ('admin','artisan','client').
--   Enterprise roles exist only in public.enterprise_members.role.
--   No enterprise roles are added to public.users.role CHECK constraint.
--   Admin identity pattern: public.users.role = 'admin' (canonical).
--
-- SECURITY DEFINER PATTERN
--   Follows established repo convention (7c11c, 7c11e2, 7c12a1, 7c12a3):
--     SECURITY DEFINER
--     SET search_path = ''
--     All object references fully schema-qualified
--     REVOKE EXECUTE FROM PUBLIC
--     REVOKE EXECUTE FROM anon
--
-- RLS RECURSION — STRUCTURAL ELIMINATION
--   No RLS policy on public.enterprise_members queries
--   public.enterprise_members. Same-table self-reference is
--   structurally impossible in this design.
--
--   All membership checks are delegated to three SECURITY DEFINER
--   helper functions (_fixeo_is_admin, _fixeo_is_enterprise_member,
--   _fixeo_is_enterprise_manager). These functions execute as
--   their definer (the Supabase postgres superuser role), for whom
--   RLS is NOT enforced. The helper body reads enterprise_members
--   directly as a superuser — no policies fire on that inner read.
--   The RLS policy itself calls the helper (which returns a boolean)
--   and never directly queries enterprise_members.
--
--   Therefore:
--     enterprise_members RLS policy calls helper (no table ref)
--     helper reads enterprise_members as superuser (no RLS applied)
--     No cycle. No recursion. Structurally impossible.
--
-- MUTATION SURFACE — ENTERPRISE MEMBERS
--   authenticated has SELECT only on enterprise_members.
--   No INSERT, UPDATE, or DELETE is granted to authenticated.
--   All membership writes go through the bootstrap RPC (SECURITY DEFINER)
--   or service_role (Supabase Studio).
--   Member administration (invitation, role change, suspension) is
--   deferred to reviewed server-authoritative RPCs in a later migration.
--
-- ACCOUNT UPDATE SURFACE
--   authenticated owners/admins may UPDATE name and legal_name only.
--   status is NOT client-updatable: enforced by column-level grant
--   UPDATE(name, legal_name) rather than a broad UPDATE grant.
--   status changes (suspend/close) are a FIXEO staff operation
--   performed via service_role.
--
-- UPDATED_AT TRIGGER
--   Reuses existing public.update_updated_at() trigger function
--   (declared in schema.sql; confirmed live in production).
--   Body: NEW.updated_at = NOW() — no schema references.
--   Not SECURITY DEFINER. Safe to reuse unchanged.
--   Triggers are added ONLY to the two new tables.
--
-- BOOTSTRAP APPROACH
--   The RPC public.create_enterprise_account() atomically creates
--   enterprise_accounts + first enterprise_members (role='owner')
--   in a single transaction. This is the ONLY supported path for
--   creating a new enterprise account from authenticated context.
--   FIXEO staff may also create accounts via service_role directly.
--   No direct authenticated INSERT policy on either enterprise table.
--
-- NOT IN SCOPE (deferred to later migrations)
--   enterprise_sites, enterprise_site_members
--   enterprise_request_context
--   enterprise_policies, enterprise_approvals
--   enterprise_operation_events
--   enterprise_providers, enterprise_media
--   Member invitation, role-change, suspension RPCs
--
-- EXISTING TABLES NOT TOUCHED
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
-- ROLLBACK
--   See bottom of file for rollback SQL (NOT executed here).
--
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- Hard stop if any prerequisite is not met or if the migration
-- has already been applied.
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
  -- 1. public.users must exist (schema.sql dependency)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'users'
  ) INTO v_users_exists;
  IF NOT v_users_exists THEN
    RAISE EXCEPTION 'ABORT: public.users does not exist. Apply schema.sql first.';
  END IF;

  -- 2. update_updated_at() trigger function must exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc     p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'update_updated_at'
  ) INTO v_update_fn_exists;
  IF NOT v_update_fn_exists THEN
    RAISE EXCEPTION
      'ABORT: public.update_updated_at() function not found. '
      'Apply schema.sql first.';
  END IF;

  -- 3. enterprise_accounts must NOT already exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'enterprise_accounts'
  ) INTO v_ea_exists;
  IF v_ea_exists THEN
    RAISE EXCEPTION
      'ABORT: public.enterprise_accounts already exists. '
      'This migration may have been applied previously. '
      'Inspect state before proceeding.';
  END IF;

  -- 4. enterprise_members must NOT already exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'enterprise_members'
  ) INTO v_em_exists;
  IF v_em_exists THEN
    RAISE EXCEPTION
      'ABORT: public.enterprise_members already exists. '
      'This migration may have been applied previously. '
      'Inspect state before proceeding.';
  END IF;

  -- 5. create_enterprise_account RPC must NOT already exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc     p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'create_enterprise_account'
  ) INTO v_rpc_exists;
  IF v_rpc_exists THEN
    RAISE EXCEPTION
      'ABORT: public.create_enterprise_account() already exists. '
      'This migration may have been applied previously.';
  END IF;

  -- 6. Authorization helpers must NOT already exist
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc     p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = '_fixeo_is_admin'
  ) INTO v_h1_exists;
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc     p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = '_fixeo_is_enterprise_member'
  ) INTO v_h2_exists;
  SELECT EXISTS (
    SELECT 1
    FROM   pg_catalog.pg_proc     p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = '_fixeo_is_enterprise_manager'
  ) INTO v_h3_exists;
  IF v_h1_exists OR v_h2_exists OR v_h3_exists THEN
    RAISE EXCEPTION
      'ABORT: one or more authorization helpers already exist '
      '(_fixeo_is_admin: %, _fixeo_is_enterprise_member: %, '
      '_fixeo_is_enterprise_manager: %). '
      'This migration may have been applied previously.',
      v_h1_exists, v_h2_exists, v_h3_exists;
  END IF;

  RAISE NOTICE '7c13a1 preconditions PASSED';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: public.enterprise_accounts
-- ════════════════════════════════════════════════════════════
--
-- Root enterprise identity record.
-- One row per customer organisation.
-- Created exclusively via the bootstrap RPC or service_role.
-- No direct authenticated INSERT policy.
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

RAISE NOTICE '7c13a1 — enterprise_accounts table created';

-- updated_at trigger (reuses existing helper — see doctrine note)
DROP TRIGGER IF EXISTS enterprise_accounts_updated_at ON public.enterprise_accounts;
CREATE TRIGGER enterprise_accounts_updated_at
  BEFORE UPDATE ON public.enterprise_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index: active account lookups
CREATE INDEX idx_ea_status
  ON public.enterprise_accounts (status)
  WHERE status = 'active';

RAISE NOTICE '7c13a1 — enterprise_accounts trigger + index created';


-- ════════════════════════════════════════════════════════════
-- SECTION 2: public.enterprise_members
-- ════════════════════════════════════════════════════════════
--
-- Junction between public.users and enterprise_accounts.
-- One row per user per enterprise.
-- Carries the enterprise-scoped role.
-- UNIQUE (enterprise_id, user_id): one membership per user per account.
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
  -- Rationale: an orphaned member row with no user is unresolvable.
  -- CASCADE is safer than SET NULL here.
  CONSTRAINT enterprise_members_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- FK: inviter deleted → invited_by becomes NULL (audit trail preserved)
  CONSTRAINT enterprise_members_invited_by_fk
    FOREIGN KEY (invited_by)
    REFERENCES public.users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  -- Enterprise role vocabulary.
  -- 'admin' deliberately included as an enterprise-scoped admin role.
  -- This does NOT conflict with public.users.role='admin' (FIXEO platform
  -- admin) because enterprise_members.role is a different column on a
  -- different table. Context always disambiguates.
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

RAISE NOTICE '7c13a1 — enterprise_members table created';

-- updated_at trigger (reuses existing helper — see doctrine note)
DROP TRIGGER IF EXISTS enterprise_members_updated_at ON public.enterprise_members;
CREATE TRIGGER enterprise_members_updated_at
  BEFORE UPDATE ON public.enterprise_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index: all members of an enterprise (most common list query)
CREATE INDEX idx_em_enterprise_status
  ON public.enterprise_members (enterprise_id, status);

-- Index: all enterprises a given user belongs to
CREATE INDEX idx_em_user_status
  ON public.enterprise_members (user_id, status);

-- Index: RLS hot path — active membership check (used by all helpers)
-- Partial unique index: fast lookup, small footprint
CREATE UNIQUE INDEX idx_em_active_membership
  ON public.enterprise_members (enterprise_id, user_id)
  WHERE status = 'active';

-- Index: pending invitations for notification queries
CREATE INDEX idx_em_invited
  ON public.enterprise_members (enterprise_id, created_at DESC)
  WHERE status = 'invited';

RAISE NOTICE '7c13a1 — enterprise_members triggers + indexes created';


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Authorization Helpers
--
-- PURPOSE
--   All membership authorization in RLS policies is delegated
--   to these three SECURITY DEFINER functions. This is the
--   structural mechanism that eliminates RLS recursion.
--
-- WHY THIS ELIMINATES RECURSION
--   PostgreSQL enforces RLS for roles that are NOT the table
--   owner and NOT superusers. SECURITY DEFINER functions execute
--   as their DEFINER, which in Supabase is the 'postgres' role
--   (a superuser). When a SECURITY DEFINER function reads
--   public.enterprise_members, it does so as 'postgres' — RLS
--   is NOT applied to that read. Therefore:
--
--     RLS policy on enterprise_members calls helper (no table ref)
--     helper reads enterprise_members as postgres/superuser
--     enterprise_members RLS policies do NOT fire on that read
--     No cycle. No recursion. Structurally impossible.
--
--   If the helpers were NOT SECURITY DEFINER, they would run as
--   the calling user and enterprise_members RLS would re-apply,
--   causing infinite recursion. SECURITY DEFINER is the essential
--   mechanism here, not merely a convention.
--
-- WHO EXECUTES THE HELPERS
--   The helpers are called from within RLS USING/WITH CHECK
--   clauses. PostgreSQL invokes them on behalf of the calling
--   user to evaluate row visibility. The helpers themselves
--   execute as postgres (definer). The calling user never
--   executes the helper body directly — they only receive the
--   boolean result that PostgreSQL uses to admit or reject the row.
--
-- GRANT DESIGN
--   REVOKE FROM PUBLIC — deny by default
--   REVOKE FROM anon   — explicit belt-and-suspenders
--   GRANT TO authenticated — required: PostgreSQL must be able to
--     EXECUTE the helper when evaluating RLS for authenticated users.
--     Without GRANT TO authenticated, the RLS policy evaluation
--     itself would fail with a permission error.
--   service_role: implicit superuser access — no explicit grant needed.
--
-- HELPER PROPERTIES
--   SECURITY DEFINER — runs as definer (postgres), bypasses RLS
--   SET search_path = '' — prevents search_path injection
--   STABLE — no side effects; same inputs return same output
--             within a transaction; allows planner to cache calls
--   RETURNS boolean — minimal, single-purpose output
--   auth.uid() derived internally — no caller-supplied user_id
--   no dynamic SQL
--   no mutation
-- ════════════════════════════════════════════════════════════


-- ── Helper 1: _fixeo_is_admin() ──────────────────────────────
--
-- Returns true if the current caller is a FIXEO platform admin.
-- Uses canonical public.users.role = 'admin' pattern.
-- Does NOT use public.profiles.role (legacy inconsistency).
--
-- Called by: ea_fixeo_admin_all, em_fixeo_admin_all policies.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fixeo_is_admin()
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

REVOKE EXECUTE ON FUNCTION public._fixeo_is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fixeo_is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public._fixeo_is_admin() TO authenticated;

RAISE NOTICE '7c13a1 — _fixeo_is_admin() helper created';


-- ── Helper 2: _fixeo_is_enterprise_member(uuid) ──────────────
--
-- Returns true if the current caller has an active membership
-- in the given enterprise_id.
--
-- Called by: ea_members_select, em_members_select policies.
--
-- RECURSION SAFETY:
--   This function reads public.enterprise_members as its definer
--   (postgres). RLS on enterprise_members does NOT fire for
--   postgres. No recursive policy evaluation occurs.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fixeo_is_enterprise_member(
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

REVOKE EXECUTE ON FUNCTION public._fixeo_is_enterprise_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fixeo_is_enterprise_member(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public._fixeo_is_enterprise_member(uuid) TO authenticated;

RAISE NOTICE '7c13a1 — _fixeo_is_enterprise_member() helper created';


-- ── Helper 3: _fixeo_is_enterprise_manager(uuid) ─────────────
--
-- Returns true if the current caller holds an owner or admin
-- role with active status in the given enterprise_id.
-- Used to gate account name/legal_name updates.
--
-- Called by: ea_owner_update policy.
--
-- RECURSION SAFETY: identical to _fixeo_is_enterprise_member.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fixeo_is_enterprise_manager(
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

REVOKE EXECUTE ON FUNCTION public._fixeo_is_enterprise_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fixeo_is_enterprise_manager(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public._fixeo_is_enterprise_manager(uuid) TO authenticated;

RAISE NOTICE '7c13a1 — _fixeo_is_enterprise_manager() helper created';


-- ════════════════════════════════════════════════════════════
-- SECTION 4: RLS — public.enterprise_accounts
--
-- TENANT ISOLATION:
--   Every non-admin SELECT is gated by _fixeo_is_enterprise_member(id).
--   A user in enterprise A cannot see enterprise B because the helper
--   returns false for any enterprise_id where they lack active membership.
--
-- ACCOUNT UPDATE SCOPE:
--   Authenticated owners/admins may update name and legal_name ONLY.
--   Column-level grant UPDATE(name, legal_name) enforces this at the
--   privilege layer — no UPDATE on status, id, created_at is possible
--   regardless of what the API client sends.
--   Status changes (suspend/close) are a service_role operation only.
--
-- NO SELF-REFERENCE:
--   No policy on enterprise_accounts queries enterprise_accounts.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_accounts ENABLE ROW LEVEL SECURITY;
-- NOT FORCE ROW LEVEL SECURITY: service_role bypass is intentional
-- for bootstrap and staff operations via Supabase Studio.

-- Policy 1: Deny all access to anon.
-- Belt-and-suspenders: primary guard is absence of GRANT to anon.
DROP POLICY IF EXISTS "ea_deny_anon"       ON public.enterprise_accounts;
CREATE POLICY "ea_deny_anon"
  ON public.enterprise_accounts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Policy 2: Active members may SELECT their own enterprise account.
-- Delegates to _fixeo_is_enterprise_member — no table self-reference.
-- No recursion possible (see Section 3 analysis).
DROP POLICY IF EXISTS "ea_members_select"  ON public.enterprise_accounts;
CREATE POLICY "ea_members_select"
  ON public.enterprise_accounts
  FOR SELECT
  TO authenticated
  USING (public._fixeo_is_enterprise_member(id));

-- Policy 3: Enterprise owner/admin may UPDATE name and legal_name.
-- Delegates membership check to _fixeo_is_enterprise_manager.
-- WITH CHECK: status must remain 'active' — owners cannot self-suspend
-- or close their account through this policy.
-- Note: the column-level grant (UPDATE(name, legal_name) below) is the
-- hard enforcement that prevents status from being modified. WITH CHECK
-- is an additional logical guard.
DROP POLICY IF EXISTS "ea_owner_update"    ON public.enterprise_accounts;
CREATE POLICY "ea_owner_update"
  ON public.enterprise_accounts
  FOR UPDATE
  TO authenticated
  USING  (public._fixeo_is_enterprise_manager(id))
  WITH CHECK (
    public._fixeo_is_enterprise_manager(id)
    AND status = 'active'
  );

-- Policy 4: FIXEO global admin has full access to all enterprise accounts.
-- Delegates to _fixeo_is_admin — uses canonical public.users.role='admin'.
DROP POLICY IF EXISTS "ea_fixeo_admin_all" ON public.enterprise_accounts;
CREATE POLICY "ea_fixeo_admin_all"
  ON public.enterprise_accounts
  FOR ALL
  TO authenticated
  USING     (public._fixeo_is_admin())
  WITH CHECK (public._fixeo_is_admin());

RAISE NOTICE '7c13a1 — enterprise_accounts RLS enabled (4 policies)';


-- ════════════════════════════════════════════════════════════
-- SECTION 5: RLS — public.enterprise_members
--
-- RECURSION: STRUCTURALLY IMPOSSIBLE.
--   No policy on enterprise_members queries enterprise_members.
--   All membership checks are delegated to SECURITY DEFINER
--   helpers that read enterprise_members as postgres (no RLS).
--
-- MUTATION SURFACE:
--   authenticated has SELECT only. No INSERT, UPDATE, or DELETE
--   is granted to authenticated on this table.
--   All member writes go through the bootstrap RPC or service_role.
--
-- TENANT ISOLATION:
--   em_members_select is gated by _fixeo_is_enterprise_member(enterprise_id).
--   A member of enterprise A cannot see enterprise B's members because
--   the helper returns false for any enterprise_id where they lack
--   active membership.
--   em_self_select allows a user to see their own row regardless of
--   status (e.g. when invited and not yet active).
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

-- Policy 2: A user may always SELECT their own membership row.
-- Needed to read invitation status before the membership is active.
-- Pure column comparison — no table reference, no helper needed.
DROP POLICY IF EXISTS "em_self_select"      ON public.enterprise_members;
CREATE POLICY "em_self_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 3: Active members may SELECT all members of their enterprise.
-- Delegates to _fixeo_is_enterprise_member(enterprise_id).
-- No direct query of enterprise_members in this policy body.
-- No recursion possible (see Section 3 analysis).
DROP POLICY IF EXISTS "em_members_select"   ON public.enterprise_members;
CREATE POLICY "em_members_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (public._fixeo_is_enterprise_member(enterprise_id));

-- Policy 4: FIXEO global admin has full access to all member rows.
-- Delegates to _fixeo_is_admin.
-- Admin may INSERT/UPDATE/DELETE via this policy if needed for support.
-- Note: INSERT/UPDATE/DELETE table grants to authenticated are withheld
-- (see Section 6 grants). Admin INSERT/UPDATE/DELETE works because
-- service_role bypasses RLS entirely — this policy covers the edge
-- case where a FIXEO admin acts via an authenticated session.
DROP POLICY IF EXISTS "em_fixeo_admin_all"  ON public.enterprise_members;
CREATE POLICY "em_fixeo_admin_all"
  ON public.enterprise_members
  FOR ALL
  TO authenticated
  USING     (public._fixeo_is_admin())
  WITH CHECK (public._fixeo_is_admin());

RAISE NOTICE '7c13a1 — enterprise_members RLS enabled (4 policies)';


-- ════════════════════════════════════════════════════════════
-- SECTION 6: Grants and revokes
--
-- enterprise_accounts:
--   REVOKE ALL from anon and PUBLIC (explicit block)
--   SELECT granted to authenticated (RLS policies restrict rows)
--   UPDATE(name, legal_name) granted to authenticated
--     — column-level grant: authenticated cannot UPDATE status, id,
--       created_at, or updated_at regardless of RLS policy allowance.
--       This is the hard column-level enforcement of the update scope.
--   No INSERT or DELETE to authenticated.
--
-- enterprise_members:
--   REVOKE ALL from anon and PUBLIC
--   SELECT granted to authenticated (RLS policies restrict rows)
--   No INSERT, UPDATE, or DELETE to authenticated.
--   All member writes: bootstrap RPC (SECURITY DEFINER) or service_role.
-- ════════════════════════════════════════════════════════════

REVOKE ALL ON public.enterprise_accounts FROM anon;
REVOKE ALL ON public.enterprise_accounts FROM PUBLIC;
GRANT  SELECT                ON public.enterprise_accounts TO authenticated;
GRANT  UPDATE (name, legal_name) ON public.enterprise_accounts TO authenticated;
-- No INSERT/DELETE to authenticated. No broad UPDATE.

REVOKE ALL ON public.enterprise_members FROM anon;
REVOKE ALL ON public.enterprise_members FROM PUBLIC;
GRANT  SELECT ON public.enterprise_members TO authenticated;
-- No INSERT, UPDATE, or DELETE to authenticated.

RAISE NOTICE '7c13a1 — grants/revokes applied';


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Bootstrap RPC — public.create_enterprise_account()
--
-- PURPOSE
--   Atomically creates a new enterprise account AND the calling
--   user's first membership (role='owner', status='active')
--   in a single transaction.
--   This is the ONLY supported path for authenticated account creation.
--
-- SECURITY DEFINER RATIONALE
--   enterprise_accounts has no authenticated INSERT privilege.
--   enterprise_members has no authenticated INSERT privilege.
--   This RPC executes as its definer (postgres) and performs both
--   inserts under controlled conditions. No caller-supplied owner
--   identity or role is accepted.
--
-- SECURITY CONTROLS
--   1. SECURITY DEFINER — executes as postgres
--   2. SET search_path = '' — prevents search_path injection
--   3. All object references fully schema-qualified
--   4. auth.uid() derived internally — no caller-supplied user_id
--   5. Caller must exist in public.users
--   6. Role is hardcoded 'owner' — not caller-supplied
--   7. Name and legal_name validated before insert
--   8. REVOKE FROM PUBLIC; REVOKE FROM anon; GRANT TO authenticated
--
-- RETURN VALUE
--   Success: { "ok": true,  "enterprise_id": "<uuid>" }
--   Failure: { "ok": false, "reason": "<code>" }
--   Unexpected: { "ok": false, "reason": "internal_error" }
--   SQLSTATE is NOT returned to the client (no internal detail leak).
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
  v_caller_id     uuid;
  v_caller_exists boolean;
  v_enterprise_id uuid;
BEGIN

  -- Guard 1: caller must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 2: caller must exist in public.users
  -- Prevents ghost account creation from auth.users rows that were
  -- not yet reflected into public.users (e.g. registration failures).
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  ) INTO v_caller_exists;
  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- Guard 3: validate account name
  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.trim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;
  IF pg_catalog.char_length(pg_catalog.trim(p_name)) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  -- Guard 4: validate legal_name if provided
  IF p_legal_name IS NOT NULL THEN
    IF pg_catalog.char_length(pg_catalog.trim(p_legal_name)) < 1
       OR pg_catalog.char_length(pg_catalog.trim(p_legal_name)) > 300
    THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_name_invalid');
    END IF;
  END IF;

  -- Atomic insert: both rows or neither.
  -- Executes as postgres (SECURITY DEFINER) — INSERT privileges held
  -- by definer, not caller. RLS does not apply to this context.

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
    'owner',   -- hardcoded: caller always becomes owner; not caller-supplied
    'active',  -- founding member is immediately active
    NULL       -- no inviter for the founding member
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',            true,
    'enterprise_id', v_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Do not return SQLSTATE or internal detail to the client.
    -- Diagnostics are available in Supabase postgres logs.
    RETURN pg_catalog.jsonb_build_object(
      'ok',     false,
      'reason', 'internal_error'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_account(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_enterprise_account(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_enterprise_account(text, text) TO authenticated;

RAISE NOTICE '7c13a1 — create_enterprise_account() RPC created';


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.13A.1 Enterprise Core — migration script complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  enterprise_accounts';
  RAISE NOTICE '  enterprise_members';
  RAISE NOTICE '';
  RAISE NOTICE 'Helpers created:';
  RAISE NOTICE '  _fixeo_is_admin()';
  RAISE NOTICE '  _fixeo_is_enterprise_member(uuid)';
  RAISE NOTICE '  _fixeo_is_enterprise_manager(uuid)';
  RAISE NOTICE '';
  RAISE NOTICE 'RPC created:';
  RAISE NOTICE '  create_enterprise_account(text, text)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies:';
  RAISE NOTICE '  enterprise_accounts: 4';
  RAISE NOTICE '  enterprise_members:  4';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes: 5 (1 on accounts, 4 on members)';
  RAISE NOTICE 'Triggers: 2 (reuse update_updated_at)';
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
-- Run ONLY if migration must be reversed after application.
-- Execute via service_role in Supabase Studio.
-- Rollback order: members → accounts → helpers (reverse dependency order)
-- ════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Safety: abort rollback if any data has been inserted
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
-- -- Drop bootstrap RPC
-- DROP FUNCTION IF EXISTS public.create_enterprise_account(text, text);
--
-- -- Drop triggers before dropping tables
-- DROP TRIGGER IF EXISTS enterprise_members_updated_at  ON public.enterprise_members;
-- DROP TRIGGER IF EXISTS enterprise_accounts_updated_at ON public.enterprise_accounts;
--
-- -- Drop tables (members first: has FK reference to accounts)
-- DROP TABLE IF EXISTS public.enterprise_members;
-- DROP TABLE IF EXISTS public.enterprise_accounts;
--
-- -- Drop authorization helpers (after tables: policies referencing them
-- -- are gone once tables are dropped)
-- DROP FUNCTION IF EXISTS public._fixeo_is_enterprise_manager(uuid);
-- DROP FUNCTION IF EXISTS public._fixeo_is_enterprise_member(uuid);
-- DROP FUNCTION IF EXISTS public._fixeo_is_admin();
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════
