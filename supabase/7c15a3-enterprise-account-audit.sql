-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.3 Enterprise Account Control + Audit Trail
-- File: supabase/7c15a3-enterprise-account-audit.sql
-- Sprint: BP08D
-- HEAD at authoring: 9a628c4dd53e9da28f2459056302c2b022480d05
--
-- PURPOSE
--   1. enterprise_audit_log table — immutable append-only audit trail
--   2. fixeo_private._eal_append() — private SECURITY DEFINER INSERT helper
--   3. update_enterprise_account() RPC — account profile mutation
--   4. Audit wiring on BP08B RPCs (CREATE OR REPLACE — additive only)
--   5. REVOKE direct UPDATE on enterprise_accounts (mutations via RPC only)
--   6. Grants
--
-- AUDIT LOG DESIGN
--   enterprise_audit_log is immutable from the client perspective:
--   authenticated has SELECT only (via RLS). No INSERT, UPDATE, DELETE.
--   Writes happen exclusively through fixeo_private._eal_append()
--   which runs as SECURITY DEFINER (postgres). PostgREST cannot call
--   fixeo_private functions directly (schema not exposed). This provides
--   a tamper-proof, append-only trail.
--
-- CONCURRENCY
--   update_enterprise_account acquires enterprise_accounts FOR UPDATE
--   to serialize concurrent account profile mutations. Same pattern
--   as the BP08B member RPCs.
--
-- ADDITIVE ONLY (section 4)
--   The CREATE OR REPLACE on update_enterprise_member_role and
--   set_enterprise_member_status preserves ALL existing guard logic
--   exactly. Only the _eal_append call is added after each mutation,
--   before the RETURN. No guard, error code, lock pattern, parameter
--   name, or type is changed.
--
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_ea_exists      boolean;
  v_em_exists      boolean;
  v_users_exists   boolean;
  v_eal_exists     boolean;
  v_append_exists  boolean;
  v_uea_exists     boolean;
  v_r1_exists      boolean;
  v_r2_exists      boolean;
  v_fp_admin       boolean;
  v_fp_member      boolean;
BEGIN
  -- enterprise_accounts must exist
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_accounts')
  INTO v_ea_exists;
  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_accounts not found. Apply 7c13a1 first.';
  END IF;

  -- enterprise_members must exist
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_members')
  INTO v_em_exists;
  IF NOT v_em_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_members not found. Apply 7c13a1 first.';
  END IF;

  -- public.users must exist
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='users')
  INTO v_users_exists;
  IF NOT v_users_exists THEN
    RAISE EXCEPTION 'ABORT: public.users not found.';
  END IF;

  -- enterprise_audit_log must NOT already exist (idempotency guard)
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='enterprise_audit_log')
  INTO v_eal_exists;
  IF v_eal_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_audit_log already exists. Already applied?';
  END IF;

  -- _eal_append must NOT already exist
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private' AND p.proname='_eal_append')
  INTO v_append_exists;
  IF v_append_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._eal_append already exists. Already applied?';
  END IF;

  -- update_enterprise_account must NOT already exist
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_enterprise_account')
  INTO v_uea_exists;
  IF v_uea_exists THEN
    RAISE EXCEPTION 'ABORT: update_enterprise_account already exists. Already applied?';
  END IF;

  -- BP08B RPCs must already exist (we will CREATE OR REPLACE them)
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_enterprise_member_role')
  INTO v_r1_exists;
  IF NOT v_r1_exists THEN
    RAISE EXCEPTION 'ABORT: update_enterprise_member_role not found. Apply 7c15a1 first.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_enterprise_member_status')
  INTO v_r2_exists;
  IF NOT v_r2_exists THEN
    RAISE EXCEPTION 'ABORT: set_enterprise_member_status not found. Apply 7c15a1 first.';
  END IF;

  -- fixeo_private helpers must exist
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private' AND p.proname='_fixeo_is_admin')
  INTO v_fp_admin;
  IF NOT v_fp_admin THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_admin not found. Apply 7c13a1 first.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private' AND p.proname='_fixeo_is_enterprise_member')
  INTO v_fp_member;
  IF NOT v_fp_member THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_member not found. Apply 7c13a1 first.';
  END IF;

  RAISE NOTICE '7c15a3 preconditions PASSED';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1: enterprise_audit_log table
--
-- Immutable from the client perspective. authenticated has
-- SELECT only (RLS controls visibility per-enterprise).
-- Writes go through fixeo_private._eal_append() SECURITY DEFINER.
--
-- RLS POLICY PATTERN (4-policy, same as enterprise_accounts /
-- enterprise_members):
--   eal_deny_anon       — deny all to anon
--   eal_members_select  — SELECT to members of the enterprise
--   eal_fixeo_admin_all — full access to fixeo admins
-- (No manager_update — audit log is immutable; no UPDATE policy.)
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_audit_log (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id  uuid        NOT NULL,
  actor_user_id  uuid        NOT NULL,
  action_type    text        NOT NULL,
  target_type    text        NOT NULL,
  target_id      uuid            NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT eal_pkey PRIMARY KEY (id),

  CONSTRAINT eal_enterprise_fk FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT eal_actor_fk FOREIGN KEY (actor_user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT eal_action_type_check CHECK (
    action_type IN (
      'member_role_changed',
      'member_status_changed',
      'site_updated',
      'site_status_changed',
      'account_profile_updated'
    )
  )
);

-- Index for list queries ordered by time within an enterprise
CREATE INDEX eal_enterprise_created_idx
  ON public.enterprise_audit_log (enterprise_id, created_at DESC);

DO $$ BEGIN RAISE NOTICE '7c15a3 — enterprise_audit_log table created'; END $$;

-- ── Enable RLS
ALTER TABLE public.enterprise_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_audit_log FORCE ROW LEVEL SECURITY;

-- ── Policy 1: deny anon entirely
DROP POLICY IF EXISTS "eal_deny_anon" ON public.enterprise_audit_log;
CREATE POLICY "eal_deny_anon"
  ON public.enterprise_audit_log
  AS RESTRICTIVE
  TO anon
  USING (false);

-- ── Policy 2: members of the enterprise can SELECT their own enterprise's rows
DROP POLICY IF EXISTS "eal_members_select" ON public.enterprise_audit_log;
CREATE POLICY "eal_members_select"
  ON public.enterprise_audit_log
  FOR SELECT
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

-- ── Policy 3: fixeo admins have full access (SELECT, no INSERT/UPDATE/DELETE
--    to authenticated in any case — policy just covers SELECT here)
DROP POLICY IF EXISTS "eal_fixeo_admin_all" ON public.enterprise_audit_log;
CREATE POLICY "eal_fixeo_admin_all"
  ON public.enterprise_audit_log
  TO authenticated
  USING     (fixeo_private._fixeo_is_admin())
  WITH CHECK (fixeo_private._fixeo_is_admin());

DO $$ BEGIN RAISE NOTICE '7c15a3 — enterprise_audit_log RLS policies installed'; END $$;

-- ── Grants: authenticated SELECT only. No INSERT, UPDATE, DELETE.
REVOKE ALL ON public.enterprise_audit_log FROM PUBLIC;
REVOKE ALL ON public.enterprise_audit_log FROM anon;
REVOKE ALL ON public.enterprise_audit_log FROM authenticated;
GRANT SELECT ON public.enterprise_audit_log TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a3 — enterprise_audit_log grants applied (SELECT only to authenticated)'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1b: fixeo_private._eal_append()
--
-- Private SECURITY DEFINER helper — called by RPCs to append
-- audit rows. Runs as postgres so it can INSERT despite
-- authenticated having no INSERT privilege on enterprise_audit_log.
--
-- NOT callable from PostgREST (fixeo_private is not an exposed
-- schema in the PostgREST config). This guarantees all writes
-- to enterprise_audit_log flow through this controlled entry point.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fixeo_private._eal_append(
  p_enterprise_id uuid,
  p_actor_id      uuid,
  p_action_type   text,
  p_target_type   text,
  p_target_id     uuid,
  p_metadata      jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.enterprise_audit_log (
    enterprise_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    metadata
  ) VALUES (
    p_enterprise_id,
    p_actor_id,
    p_action_type,
    p_target_type,
    p_target_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

-- Grants for _eal_append: deny direct call from PostgREST/public
REVOKE EXECUTE ON FUNCTION fixeo_private._eal_append(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fixeo_private._eal_append(uuid,uuid,text,text,uuid,jsonb) FROM anon;
-- authenticated needs EXECUTE because RPCs that are SECURITY DEFINER
-- still run in the caller's permission context for sub-calls.
-- The SECURITY DEFINER on _eal_append itself provides the elevated
-- INSERT privilege; GRANT EXECUTE allows the call to be dispatched.
GRANT  EXECUTE ON FUNCTION fixeo_private._eal_append(uuid,uuid,text,text,uuid,jsonb) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a3 — fixeo_private._eal_append() created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2: update_enterprise_account() RPC
--
-- Allows active owner or admin to update the enterprise profile
-- (name, legal_name). All other fields are immutable via this RPC.
-- Plan mutation, billing, and deletion are NOT exposed.
--
-- GUARD SEQUENCE
--   1. auth.uid() → unauthenticated
--   2. enterprise_accounts FOR UPDATE lock (serialize mutations)
--   3. Caller: active owner or admin → not_a_member / caller_not_active / forbidden
--   4. Trim p_name; blank → name_required; len>200 → name_too_long
--   5. Trim p_legal_name if provided; blank → legal_name_invalid; len>300 → legal_name_too_long
--   6. No-op if no change → no_change (ok=true)
--   7. UPDATE enterprise_accounts
--   8. _eal_append('account_profile_updated', metadata with old/new values)
--   9. Return {ok:true, enterprise_id}
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_account(
  p_enterprise_id uuid,
  p_name          text,
  p_legal_name    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_stat  text;
  v_old_name     text;
  v_old_legal    text;
  v_new_name     text;
  v_new_legal    text;
BEGIN
  -- ── Guard 1: caller authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Guard 2: acquire enterprise row lock (serializes concurrent mutations)
  SELECT ea.name, ea.legal_name
  INTO v_old_name, v_old_legal
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_not_found');
  END IF;

  -- ── Guard 3: resolve caller membership
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id       = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;
  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'caller_not_active');
  END IF;
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- ── Guard 4: validate p_name
  v_new_name := pg_catalog.btrim(p_name);
  IF v_new_name IS NULL OR v_new_name = '' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;
  IF pg_catalog.char_length(v_new_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  -- ── Guard 5: validate p_legal_name (optional)
  IF p_legal_name IS NOT NULL THEN
    v_new_legal := pg_catalog.btrim(p_legal_name);
    IF v_new_legal = '' THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_name_invalid');
    END IF;
    IF pg_catalog.char_length(v_new_legal) > 300 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_name_too_long');
    END IF;
  ELSE
    -- NULL means "leave legal_name unchanged"
    v_new_legal := v_old_legal;
  END IF;

  -- ── Guard 6: no-op if nothing actually changed
  IF v_new_name = v_old_name
     AND (v_new_legal IS NOT DISTINCT FROM v_old_legal)
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change',
      'enterprise_id', p_enterprise_id);
  END IF;

  -- ── Mutation
  UPDATE public.enterprise_accounts
  SET
    name       = v_new_name,
    legal_name = v_new_legal,
    updated_at = now()
  WHERE id = p_enterprise_id;

  -- ── Audit append
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'account_profile_updated',
    'enterprise_account',
    p_enterprise_id,
    pg_catalog.jsonb_build_object(
      'old_name',       v_old_name,
      'new_name',       v_new_name,
      'old_legal_name', v_old_legal,
      'new_legal_name', v_new_legal
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',           true,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_account] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

DO $$ BEGIN RAISE NOTICE '7c15a3 — update_enterprise_account() created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Audit wiring for BP08B member RPCs
--
-- CREATE OR REPLACE preserves ALL existing guard logic exactly.
-- Only addition: fixeo_private._eal_append() called AFTER the
-- successful mutation, immediately before the RETURN.
-- No guard, error code, lock pattern, parameter name, or type
-- is changed.
-- ════════════════════════════════════════════════════════════

-- ── 3a: update_enterprise_member_role — add member_role_changed audit

CREATE OR REPLACE FUNCTION public.update_enterprise_member_role(
  p_enterprise_id  uuid,
  p_member_id      uuid,
  p_new_role       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_stat  text;
  v_target_role  text;
  v_target_stat  text;
  v_target_uid   uuid;
  v_owner_count  integer;
BEGIN
  -- ── Guard 1: caller authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  -- ── Guard 2: validate new role (no owner via RPC)
  IF p_new_role IS NULL OR p_new_role NOT IN
      ('admin','operations_manager','site_manager','reporter','viewer')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_role');
  END IF;

  -- ── Acquire enterprise row lock (serializes owner-sensitive ops)
  PERFORM id FROM public.enterprise_accounts
  WHERE id = p_enterprise_id FOR UPDATE;

  -- ── Guard 3: resolve caller membership
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id       = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;
  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;
  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- ── Guard 4: resolve target membership (FOR UPDATE locks target row)
  SELECT em.role, em.status, em.user_id
  INTO v_target_role, v_target_stat, v_target_uid
  FROM public.enterprise_members em
  WHERE em.id            = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;
  IF v_target_stat NOT IN ('active','suspended') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_modifiable');
  END IF;

  -- ── Guard 5: admin cannot touch an owner row
  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  -- ── Guard 6: if target is the last active owner, block demotion
  IF v_target_role = 'owner' AND v_target_stat = 'active' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role   = 'owner'
      AND status = 'active'
      AND id    != p_member_id;
    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  -- ── Guard 7: no-op guard
  IF v_target_role = p_new_role THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  -- ── Mutation
  UPDATE public.enterprise_members
  SET role = p_new_role, updated_at = now()
  WHERE id = p_member_id;

  -- ── Audit append (BP08D addition — additive only)
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'member_role_changed',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object(
      'old_role', v_target_role,
      'new_role', p_new_role
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'member_id',  p_member_id,
    'new_role',   p_new_role
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_member_role] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$$;

-- Re-assert grants (idempotent — already in place from 7c15a1)
REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a3 — update_enterprise_member_role() re-created with audit wiring'; END $$;


-- ── 3b: set_enterprise_member_status — add member_status_changed audit

CREATE OR REPLACE FUNCTION public.set_enterprise_member_status(
  p_enterprise_id  uuid,
  p_member_id      uuid,
  p_new_status     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_stat  text;
  v_target_role  text;
  v_target_stat  text;
  v_owner_count  integer;
BEGIN
  -- ── Guard 1: caller authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  -- ── Guard 2: validate new status
  IF p_new_status IS NULL OR p_new_status NOT IN ('active','suspended','removed') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  -- ── Acquire enterprise row lock (serializes owner-sensitive ops)
  PERFORM id FROM public.enterprise_accounts
  WHERE id = p_enterprise_id FOR UPDATE;

  -- ── Guard 3: resolve caller membership
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id       = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;
  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;
  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- ── Guard 4: resolve target membership (FOR UPDATE locks target row)
  SELECT em.role, em.status
  INTO v_target_role, v_target_stat
  FROM public.enterprise_members em
  WHERE em.id            = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  -- ── Guard 5: cannot transition from 'removed' (terminal state)
  IF v_target_stat = 'removed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_already_removed');
  END IF;

  -- ── Guard 6: admin cannot target an owner
  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  -- ── Guard 7: last active owner protection
  -- Only relevant when suspending or removing an active owner.
  IF v_target_role = 'owner' AND v_target_stat = 'active'
     AND p_new_status IN ('suspended','removed')
  THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role   = 'owner'
      AND status = 'active'
      AND id    != p_member_id;
    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  -- ── Guard 8: validate transition
  -- Only allow meaningful transitions; block invalid state machine paths.
  IF v_target_stat = 'active'    AND p_new_status = 'active'    THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;
  IF v_target_stat = 'suspended' AND p_new_status = 'suspended' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;
  -- invited → active/suspended/removed not supported via this RPC
  IF v_target_stat = 'invited' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invited_status_not_managed_here');
  END IF;

  -- ── Mutation (soft transition — no physical DELETE)
  UPDATE public.enterprise_members
  SET status = p_new_status, updated_at = now()
  WHERE id = p_member_id;

  -- ── Audit append (BP08D addition — additive only)
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'member_status_changed',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object(
      'old_status', v_target_stat,
      'new_status', p_new_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',         true,
    'member_id',  p_member_id,
    'new_status', p_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_member_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$$;

-- Re-assert grants (idempotent — already in place from 7c15a1)
REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a3 — set_enterprise_member_status() re-created with audit wiring'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: REVOKE direct UPDATE on enterprise_accounts
--
-- All account profile mutations now go through
-- update_enterprise_account() RPC. Direct UPDATE is revoked.
-- SELECT grant is reasserted (idempotent).
-- ════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.enterprise_accounts FROM authenticated;
GRANT  SELECT ON public.enterprise_accounts TO authenticated;
-- No column-level UPDATE grant anymore.
-- All account mutations go through update_enterprise_account() RPC.

DO $$ BEGIN RAISE NOTICE '7c15a3 — direct UPDATE on enterprise_accounts revoked from authenticated'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 5: Grants for update_enterprise_account
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.update_enterprise_account(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_account(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_account(uuid, text, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a3 — update_enterprise_account() grants applied'; END $$;


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.3 Enterprise Account Control + Audit Trail — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'New table:';
  RAISE NOTICE '  public.enterprise_audit_log — immutable audit trail';
  RAISE NOTICE '  RLS: eal_deny_anon, eal_members_select, eal_fixeo_admin_all';
  RAISE NOTICE '  Grants: SELECT only to authenticated';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  fixeo_private._eal_append() — SECURITY DEFINER INSERT helper';
  RAISE NOTICE '  public.update_enterprise_account() — account profile RPC';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified RPCs (CREATE OR REPLACE — additive only):';
  RAISE NOTICE '  public.update_enterprise_member_role() — member_role_changed audit';
  RAISE NOTICE '  public.set_enterprise_member_status()  — member_status_changed audit';
  RAISE NOTICE '';
  RAISE NOTICE 'Privilege changes:';
  RAISE NOTICE '  REVOKE UPDATE on enterprise_accounts FROM authenticated';
  RAISE NOTICE '  All mutations now via update_enterprise_account() RPC';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT APPLY — AWAITING HUMAN AUTHORIZATION';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;
