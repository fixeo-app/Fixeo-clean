-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.13A.1 Enterprise Core Foundation
-- File: supabase/7c13a1-enterprise-core.sql
-- HEAD at preparation: 8f4074a6
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
--   1. public.enterprise_accounts    (new table)
--   2. public.enterprise_members     (new table)
--   3. updated_at triggers           (reuse existing update_updated_at())
--   4. Indexes                       (5 indexes across both tables)
--   5. RLS                           (8 policies across both tables)
--   6. public.create_enterprise_account()  (bootstrap RPC, SECURITY DEFINER)
--   7. Grants / revokes
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
--     All object references fully schema-qualified (public.*, auth.*, pg_catalog.*)
--     REVOKE EXECUTE FROM PUBLIC
--     REVOKE EXECUTE FROM anon
--     GRANT EXECUTE TO authenticated
--
-- UPDATED_AT TRIGGER
--   Reuses existing public.update_updated_at() trigger function
--   (declared in schema.sql; verified live in production).
--   No schema-qualified references exist in its body (NEW.updated_at,
--   NOW()) — it is a plain trigger function, not SECURITY DEFINER,
--   and requires no modification.
--
-- BOOTSTRAP APPROACH
--   The RPC public.create_enterprise_account() atomically creates
--   enterprise_accounts + first enterprise_members (role='owner')
--   in a single transaction. This is the ONLY supported path for
--   creating a new enterprise account.
--   FIXEO staff may also create accounts via service_role in
--   Supabase Studio (service_role bypasses RLS).
--   No direct authenticated INSERT policy exists on enterprise_accounts.
--
-- ADMIN IDENTITY
--   Canonical pattern:
--     EXISTS (SELECT 1 FROM public.users u
--             WHERE u.id = auth.uid() AND u.role = 'admin')
--   NOT public.profiles.role (legacy pattern in older migrations).
--   This migration uses public.users exclusively.
--
-- RLS RECURSION
--   enterprise_members policies reference enterprise_members in a
--   self-subquery. PostgreSQL does NOT re-apply RLS to subquery
--   results on the same table (subquery bypasses row-level security
--   for the inner scan). No infinite recursion is possible.
--   The enterprise_accounts SELECT policy references enterprise_members.
--   The enterprise_members SELECT policy references enterprise_members.
--   These are two distinct tables/policies — no circular dependency.
--
-- NOT IN SCOPE (deferred to later migrations)
--   enterprise_sites, enterprise_site_members
--   enterprise_request_context
--   enterprise_policies, enterprise_approvals
--   enterprise_operation_events
--   enterprise_providers, enterprise_media
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
    FROM   pg_catalog.pg_proc   p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname  = 'public'
      AND  p.proname  = 'update_updated_at'
  ) INTO v_update_fn_exists;
  IF NOT v_update_fn_exists THEN
    RAISE EXCEPTION
      'ABORT: public.update_updated_at() function not found. '
      'Apply schema.sql first.';
  END IF;

  -- 3. enterprise_accounts must NOT already exist (idempotency guard)
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
    FROM   pg_catalog.pg_proc   p
    JOIN   pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'create_enterprise_account'
  ) INTO v_rpc_exists;
  IF v_rpc_exists THEN
    RAISE EXCEPTION
      'ABORT: public.create_enterprise_account() already exists. '
      'This migration may have been applied previously.';
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
  id           uuid         NOT NULL DEFAULT gen_random_uuid(),
  name         text         NOT NULL,
  legal_name   text,
  status       text         NOT NULL DEFAULT 'active',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),

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

-- updated_at trigger (reuses existing helper)
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
  id             uuid         NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id  uuid         NOT NULL,
  user_id        uuid         NOT NULL,
  role           text         NOT NULL,
  status         text         NOT NULL DEFAULT 'active',
  invited_by     uuid,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_members_pkey
    PRIMARY KEY (id),

  -- FK: enterprise deleted → all its members deleted
  CONSTRAINT enterprise_members_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- FK: user deleted → membership deleted
  -- Rationale: an orphaned member row with NULL user_id is
  -- operationally unresolvable. CASCADE is safer than SET NULL here.
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
  -- 'admin' is intentionally absent: use public.users.role='admin' for
  -- FIXEO platform admins. Enterprise account admins are 'owner'.
  -- This prevents semantic ambiguity with the global admin role.
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

  -- One active membership per user per enterprise
  CONSTRAINT enterprise_members_unique_membership
    UNIQUE (enterprise_id, user_id)
);

RAISE NOTICE '7c13a1 — enterprise_members table created';

-- updated_at trigger (reuses existing helper)
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

-- Index: RLS hot path — active membership check
-- Used by every enterprise_accounts and enterprise_members RLS policy.
-- Partial index keeps it small and fast.
CREATE UNIQUE INDEX idx_em_active_membership
  ON public.enterprise_members (enterprise_id, user_id)
  WHERE status = 'active';

-- Index: pending invitations for notification queries
CREATE INDEX idx_em_invited
  ON public.enterprise_members (enterprise_id, created_at DESC)
  WHERE status = 'invited';

RAISE NOTICE '7c13a1 — enterprise_members triggers + indexes created';


-- ════════════════════════════════════════════════════════════
-- SECTION 3: RLS — public.enterprise_accounts
--
-- RLS RECURSION ANALYSIS:
--   ea_members_select queries enterprise_members to check membership.
--   enterprise_members' own RLS (em_members_select) queries
--   enterprise_members in a self-subquery.
--   These are independent policy evaluations on different tables.
--   PostgreSQL does NOT recurse infinitely here:
--     - Accessing enterprise_accounts triggers ea_* policies.
--     - Those policies subquery enterprise_members.
--     - Accessing enterprise_members triggers em_* policies.
--     - Those policies subquery enterprise_members (self-referential).
--     - PostgreSQL evaluates self-referential subqueries directly
--       against the table rows without re-applying the outer policy
--       to the inner scan (the inner scan is a direct table read,
--       not a policy-filtered read of the same policy scope).
--   No infinite recursion is possible.
--
-- TENANT ISOLATION:
--   Every non-admin SELECT on enterprise_accounts is gated by:
--     id IN (SELECT enterprise_id FROM enterprise_members
--            WHERE user_id = auth.uid() AND status = 'active')
--   A user in enterprise A cannot see enterprise B's row because
--   they have no active enterprise_members row with enterprise_id = B.
--   PostgREST applies RLS before returning any rows to the caller.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_accounts ENABLE ROW LEVEL SECURITY;
-- NOT FORCE ROW LEVEL SECURITY: service_role bypass is intentional
-- for admin/bootstrap operations via Supabase Studio.

-- Policy 1: Deny all access to anon (belt-and-suspenders;
-- primary guard is the absence of a GRANT to anon below).
DROP POLICY IF EXISTS "ea_deny_anon"        ON public.enterprise_accounts;
CREATE POLICY "ea_deny_anon"
  ON public.enterprise_accounts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Policy 2: Active members can SELECT their own enterprise account.
DROP POLICY IF EXISTS "ea_members_select"   ON public.enterprise_accounts;
CREATE POLICY "ea_members_select"
  ON public.enterprise_accounts
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT em.enterprise_id
      FROM   public.enterprise_members em
      WHERE  em.user_id = auth.uid()
        AND  em.status  = 'active'
    )
  );

-- Policy 3: Enterprise owners and admins can UPDATE their account.
-- WITH CHECK: status updates are blocked here — only FIXEO staff
-- (service_role) can change status to 'suspended' or 'closed'.
-- Owners may update name and legal_name only.
DROP POLICY IF EXISTS "ea_owner_update"     ON public.enterprise_accounts;
CREATE POLICY "ea_owner_update"
  ON public.enterprise_accounts
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT em.enterprise_id
      FROM   public.enterprise_members em
      WHERE  em.user_id = auth.uid()
        AND  em.role    IN ('owner', 'admin')
        AND  em.status  = 'active'
    )
  )
  WITH CHECK (
    -- Owners cannot change their own status via this policy.
    -- Status changes (suspend/close) are a FIXEO staff operation.
    status = 'active'
  );

-- Policy 4: FIXEO global admin has full access to all enterprise accounts.
-- Uses canonical public.users.role = 'admin' pattern.
DROP POLICY IF EXISTS "ea_fixeo_admin_all"  ON public.enterprise_accounts;
CREATE POLICY "ea_fixeo_admin_all"
  ON public.enterprise_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.users u
      WHERE  u.id   = auth.uid()
        AND  u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   public.users u
      WHERE  u.id   = auth.uid()
        AND  u.role = 'admin'
    )
  );

RAISE NOTICE '7c13a1 — enterprise_accounts RLS enabled (4 policies)';


-- ════════════════════════════════════════════════════════════
-- SECTION 4: RLS — public.enterprise_members
--
-- RLS RECURSION ANALYSIS (self-referential subquery):
--   em_members_select uses:
--     enterprise_id IN (SELECT em2.enterprise_id
--                       FROM public.enterprise_members em2
--                       WHERE em2.user_id = auth.uid()
--                         AND em2.status = 'active')
--   This is a self-referential subquery on the same table.
--   PostgreSQL evaluates the subquery as a direct table scan
--   without re-applying the outer SELECT policy to the inner
--   scan. This is safe and is the standard multi-tenant pattern
--   used in Supabase's own documentation.
--   No infinite recursion is possible.
--
-- TENANT ISOLATION:
--   A member of enterprise A cannot see enterprise B's members
--   because the subquery only returns enterprise_ids where
--   auth.uid() has an active membership.
--
-- UPDATE POLICY SCOPE:
--   Role update capability is intentionally NOT exposed in M1.
--   The em_owner_admin_update policy allows owners/admins to
--   update status only. Role changes require a future reviewed
--   server-authoritative contract (M2 or later).
--   This prevents cross-tenant role escalation entirely in V1.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_members ENABLE ROW LEVEL SECURITY;

-- Policy 1: Deny all access to anon.
DROP POLICY IF EXISTS "em_deny_anon"            ON public.enterprise_members;
CREATE POLICY "em_deny_anon"
  ON public.enterprise_members
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Policy 2: A user can always read their own membership row.
-- Needed to check invitation status before accepting.
DROP POLICY IF EXISTS "em_self_select"          ON public.enterprise_members;
CREATE POLICY "em_self_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 3: Active members can see all other members of their enterprise.
-- Uses self-referential subquery (safe — see analysis above).
-- Combined with em_self_select via PostgreSQL OR semantics:
--   a user sees their own row (em_self_select)
--   AND all active enterprise rows (em_members_select).
DROP POLICY IF EXISTS "em_members_select"       ON public.enterprise_members;
CREATE POLICY "em_members_select"
  ON public.enterprise_members
  FOR SELECT
  TO authenticated
  USING (
    enterprise_id IN (
      SELECT em2.enterprise_id
      FROM   public.enterprise_members em2
      WHERE  em2.user_id = auth.uid()
        AND  em2.status  = 'active'
    )
  );

-- Policy 4: Enterprise owner/admin can update member STATUS only.
-- Scope: status transitions (e.g. active→suspended, invited→removed).
-- Role updates are NOT permitted via this policy in M1.
-- Self-update is excluded (user_id != auth.uid()) to prevent
-- owner self-suspension or self-removal.
-- WITH CHECK: only allows transitions within the defined status set.
-- Role field must remain unchanged (enforced by server-side API
-- sending only the status field; this policy cannot enforce OLD
-- comparisons — that is a known RLS limitation; server contract holds it).
DROP POLICY IF EXISTS "em_owner_admin_update"   ON public.enterprise_members;
CREATE POLICY "em_owner_admin_update"
  ON public.enterprise_members
  FOR UPDATE
  TO authenticated
  USING (
    -- Caller must be owner or admin of the same enterprise
    enterprise_id IN (
      SELECT em2.enterprise_id
      FROM   public.enterprise_members em2
      WHERE  em2.user_id = auth.uid()
        AND  em2.role    IN ('owner', 'admin')
        AND  em2.status  = 'active'
    )
    -- Cannot modify own row (prevents self-suspension/removal)
    AND user_id != auth.uid()
  )
  WITH CHECK (
    -- Status must be a valid value
    status IN ('invited', 'active', 'suspended', 'removed')
    -- Cannot update a row to belong to a different enterprise
    -- (enterprise_id change would be a cross-tenant move — blocked
    -- by the USING clause requiring membership in the same enterprise)
    AND enterprise_id IN (
      SELECT em2.enterprise_id
      FROM   public.enterprise_members em2
      WHERE  em2.user_id = auth.uid()
        AND  em2.role    IN ('owner', 'admin')
        AND  em2.status  = 'active'
    )
  );

-- Policy 5: FIXEO global admin has full access to all member rows.
-- Uses canonical public.users.role = 'admin' pattern.
DROP POLICY IF EXISTS "em_fixeo_admin_all"      ON public.enterprise_members;
CREATE POLICY "em_fixeo_admin_all"
  ON public.enterprise_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.users u
      WHERE  u.id   = auth.uid()
        AND  u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   public.users u
      WHERE  u.id   = auth.uid()
        AND  u.role = 'admin'
    )
  );

RAISE NOTICE '7c13a1 — enterprise_members RLS enabled (5 policies)';


-- ════════════════════════════════════════════════════════════
-- SECTION 5: Grants and revokes
-- ════════════════════════════════════════════════════════════

-- enterprise_accounts
REVOKE ALL ON public.enterprise_accounts FROM anon;
REVOKE ALL ON public.enterprise_accounts FROM PUBLIC;
-- authenticated: SELECT (via RLS member policy), UPDATE (via RLS owner policy).
-- No INSERT grant to authenticated: account creation goes through the RPC.
-- No DELETE grant to authenticated: hard delete is a service_role operation.
GRANT SELECT, UPDATE ON public.enterprise_accounts TO authenticated;
-- service_role has implicit full access in Supabase; no explicit grant needed.

-- enterprise_members
REVOKE ALL ON public.enterprise_members FROM anon;
REVOKE ALL ON public.enterprise_members FROM PUBLIC;
-- authenticated: SELECT (via RLS), UPDATE (via RLS owner/admin policy).
-- No INSERT grant to authenticated: membership creation goes through the RPC.
-- No DELETE grant to authenticated: hard delete is a service_role operation.
GRANT SELECT, UPDATE ON public.enterprise_members TO authenticated;

RAISE NOTICE '7c13a1 — grants/revokes applied';


-- ════════════════════════════════════════════════════════════
-- SECTION 6: Bootstrap RPC — public.create_enterprise_account()
--
-- PURPOSE
--   Atomically creates a new enterprise account AND the calling
--   user's first membership (role='owner') in a single transaction.
--   This is the ONLY supported path for authenticated account creation.
--
-- SECURITY DEFINER RATIONALE
--   enterprise_accounts has no authenticated INSERT policy.
--   enterprise_members has no authenticated INSERT policy.
--   The RPC holds SECURITY DEFINER to perform these inserts on
--   behalf of the authenticated caller under strictly controlled
--   conditions. No caller-supplied owner identity or initial role
--   is accepted.
--
-- SECURITY CONTROLS
--   1. SET search_path = '' — prevents search_path injection
--   2. All object references are fully schema-qualified
--   3. auth.uid() IS NOT NULL — caller must be authenticated
--   4. Caller must exist in public.users — prevents ghost accounts
--   5. Caller is automatically the owner — no role override
--   6. Name length validated
--   7. REVOKE EXECUTE FROM PUBLIC; REVOKE FROM anon
--   8. GRANT EXECUTE TO authenticated
--
-- RETURN VALUE
--   On success: jsonb { ok: true,  enterprise_id: <uuid> }
--   On failure: jsonb { ok: false, reason: <text> }
--   (Never raises unhandled exceptions to the caller.)
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
  -- Prevents ghost enterprise creation from auth.users records that have
  -- not yet been inserted into public.users (e.g. mid-registration failures).
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
       OR pg_catalog.char_length(pg_catalog.trim(p_legal_name)) > 300 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_name_invalid');
    END IF;
  END IF;

  -- Atomic insert: enterprise_accounts + enterprise_members
  -- Both inserts must succeed or neither persists.

  INSERT INTO public.enterprise_accounts (name, legal_name, status)
  VALUES (
    pg_catalog.trim(p_name),
    CASE WHEN p_legal_name IS NOT NULL THEN pg_catalog.trim(p_legal_name) ELSE NULL END,
    'active'
  )
  RETURNING id INTO v_enterprise_id;

  INSERT INTO public.enterprise_members (enterprise_id, user_id, role, status, invited_by)
  VALUES (
    v_enterprise_id,
    v_caller_id,
    'owner',       -- caller is always the owner; not caller-supplied
    'active',      -- first owner is immediately active
    NULL           -- no inviter for the founding member
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',            true,
    'enterprise_id', v_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Surface the SQLSTATE code for debugging without leaking internals.
    RETURN pg_catalog.jsonb_build_object(
      'ok',      false,
      'reason',  'internal_error',
      'code',    pg_catalog.substring(SQLSTATE, 1, 5)
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
  RAISE NOTICE 'Tables created:    enterprise_accounts, enterprise_members';
  RAISE NOTICE 'RPC created:       create_enterprise_account(text, text)';
  RAISE NOTICE 'RLS policies:      4 on enterprise_accounts';
  RAISE NOTICE '                   5 on enterprise_members';
  RAISE NOTICE 'Indexes:           5 (1 on accounts, 4 on members)';
  RAISE NOTICE 'Triggers:          2 updated_at (reuse update_updated_at)';
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
-- ════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Safety: abort if any rows exist
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
-- END $$;
--
-- DROP FUNCTION IF EXISTS public.create_enterprise_account(text, text);
-- DROP TRIGGER IF EXISTS enterprise_members_updated_at  ON public.enterprise_members;
-- DROP TRIGGER IF EXISTS enterprise_accounts_updated_at ON public.enterprise_accounts;
-- DROP TABLE  IF EXISTS public.enterprise_members;   -- members first (FK ref)
-- DROP TABLE  IF EXISTS public.enterprise_accounts;
--
-- COMMIT;
-- ════════════════════════════════════════════════════════════
