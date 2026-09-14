-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.1 Enterprise Member Control Plane
-- File: supabase/7c15a1-enterprise-member-admin.sql
-- Sprint: BP08B
-- HEAD at authoring: ebb55d36896c7a3aa5e294552ae3a71c1d70fed6
--
-- PURPOSE
-- Add self-service enterprise member administration:
-- role changes, status transitions (suspend/reactivate/remove).
-- Invitation by email is DEFERRED (see §DEFERRED below).
--
-- DEFERRED: Invitation by email
-- Reason: public.users.id = auth.users.id (1:1 mirror).
-- There is no lookup function from email → user UUID that is
-- safe without exposing a user-enumeration oracle.
-- auth.users is only accessible to service_role/postgres.
-- PostgREST does not expose auth schema.
-- A safe invite-by-email flow requires either:
-- (a) Supabase Auth Admin API (service_role only — backend edge fn), or
-- (b) a token/email-verified invitation table + accept flow
-- Neither is implementable as a pure client-callable RPC without
-- a secondary identity lookup channel.
-- BP08B delivers member management for existing FIXEO users
-- already in public.users. Invitation is deferred to BP08C+.
--
-- SCOPE
-- 1. Owner-safety trigger on enterprise_members (concurrency-safe)
-- 2. update_enterprise_member_role() RPC
-- 3. set_enterprise_member_status() RPC
-- 4. RLS / grants (no new table grants — mutations are RPC-only)
--
-- INVARIANTS
-- A. No RPC may set role = 'owner' (ownership transfer deferred)
-- B. Admin cannot target an owner row (role change, suspend, remove)
-- C. Cannot demote/suspend/remove the last active owner (concurrency-safe)
-- D. Status lifecycle: active <-> suspended, active/suspended -> removed
-- E. Physical DELETE not used — status = 'removed' is the terminal state
--
-- CONCURRENCY-SAFE OWNER INVARIANT DESIGN
-- A naive COUNT(*) check races under READ COMMITTED isolation.
-- Two concurrent transactions can both see count=1, both pass,
-- both commit, leaving zero active owners.
--
-- Solution: before any owner-sensitive mutation, lock the parent
-- enterprise_accounts row using SELECT ... FOR UPDATE.
-- This serializes all concurrent owner-sensitive mutations for
-- the same enterprise — only one transaction proceeds at a time.
-- The COUNT check then executes under an exclusive lock and is
-- race-free.
--
-- The trigger uses the same pattern: it locks enterprise_accounts
-- FOR UPDATE before checking the owner count. This backstop fires
-- even for service_role operations that bypass RPC guards.
--
-- ════════════════════════════════════════════════════════════
-- ADDITIVE ONLY
-- Zero modifications to any existing table, RLS, RPC, trigger,
-- index, or constraint from any prior migration.
-- ════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — applied and validated in Supabase production.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_em_exists   boolean;
  v_ea_exists   boolean;
  v_h2_exists   boolean;
  v_h3_exists   boolean;
  v_r1_exists   boolean;
  v_r2_exists   boolean;
  v_trig_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name='enterprise_members'
  ) INTO v_em_exists;

  IF NOT v_em_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_members not found. Apply 7c13a1 first.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name='enterprise_accounts'
  ) INTO v_ea_exists;

  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: enterprise_accounts not found. Apply 7c13a1 first.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private'
      AND p.proname='_fixeo_is_enterprise_member'
  ) INTO v_h2_exists;

  IF NOT v_h2_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_member not found.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='fixeo_private'
      AND p.proname='_fixeo_is_enterprise_manager'
  ) INTO v_h3_exists;

  IF NOT v_h3_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._fixeo_is_enterprise_manager not found.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='update_enterprise_member_role'
  ) INTO v_r1_exists;

  IF v_r1_exists THEN
    RAISE EXCEPTION 'ABORT: update_enterprise_member_role already exists. Already applied?';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='set_enterprise_member_status'
  ) INTO v_r2_exists;

  IF v_r2_exists THEN
    RAISE EXCEPTION 'ABORT: set_enterprise_member_status already exists. Already applied?';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname='enterprise_members'
      AND t.tgname='em_enforce_owner_invariant'
  ) INTO v_trig_exists;

  IF v_trig_exists THEN
    RAISE EXCEPTION 'ABORT: em_enforce_owner_invariant trigger already exists. Already applied?';
  END IF;

  RAISE NOTICE '7c15a1 preconditions PASSED';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 1: Owner-Safety Trigger
--
-- PURPOSE
-- Hard DB-level backstop preventing an enterprise from ever
-- committing with zero active owners. Fires even for
-- service_role operations that bypass RPC guards.
--
-- CONCURRENCY DESIGN
-- Uses SELECT ... FOR UPDATE on enterprise_accounts to acquire
-- an exclusive row-level lock on the parent enterprise before
-- evaluating the active-owner count.
--
-- TRIGGER TIMING: BEFORE UPDATE OR DELETE, FOR EACH ROW
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fixeo_private._em_enforce_owner_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_count integer;
BEGIN
  -- Only relevant when an ACTIVE OWNER row is being demoted,
  -- suspended, removed, or deleted.
  IF OLD.role = 'owner' AND OLD.status = 'active' THEN
    IF TG_OP = 'DELETE'
       OR (
         TG_OP = 'UPDATE'
         AND (
           NEW.role != 'owner'
           OR NEW.status != 'active'
         )
       )
    THEN
      -- Serialize owner-sensitive mutations for this enterprise.
      PERFORM id
      FROM public.enterprise_accounts
      WHERE id = OLD.enterprise_id
      FOR UPDATE;

      -- Count remaining active owners after this row is excluded.
      -- Executes as postgres (SECURITY DEFINER) → RLS not applied.
      SELECT COUNT(*)
      INTO v_owner_count
      FROM public.enterprise_members
      WHERE enterprise_id = OLD.enterprise_id
        AND role   = 'owner'
        AND status = 'active'
        AND id    != OLD.id;

      IF v_owner_count = 0 THEN
        RAISE EXCEPTION
          'owner_invariant_violation: cannot remove or demote the last active owner of enterprise %',
          OLD.enterprise_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER em_enforce_owner_invariant
BEFORE UPDATE OR DELETE ON public.enterprise_members
FOR EACH ROW
EXECUTE FUNCTION fixeo_private._em_enforce_owner_invariant();

DO $$ BEGIN
  RAISE NOTICE '7c15a1 — owner invariant trigger created';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 2: update_enterprise_member_role()
-- Allows owner or admin to change a member's role.
--
-- INVARIANTS ENFORCED
-- A. No RPC may set role='owner' — return 'owner_role_reserved'
-- B. Admin cannot target an owner row — return 'cannot_modify_owner'
-- C. Cannot demote last active owner — return 'owner_invariant_violation'
-- D. Caller must be active owner or admin of the enterprise
-- E. Target must be an active or suspended member of the enterprise
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_member_role(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_target_uid  uuid;
  v_owner_count integer;
BEGIN
  -- Guard 1: caller authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  -- Guard 2: validate new role (no owner via RPC)
  IF p_new_role IS NULL
     OR p_new_role NOT IN ('admin','operations_manager','site_manager','reporter','viewer')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_role');
  END IF;

  -- Acquire enterprise row lock (serializes owner-sensitive ops)
  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  -- Guard 3: resolve caller membership
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- Guard 4: resolve target membership (FOR UPDATE locks target row)
  SELECT em.role, em.status, em.user_id
  INTO v_target_role, v_target_stat, v_target_uid
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_target_stat NOT IN ('active','suspended') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_modifiable');
  END IF;

  -- Guard 5: admin cannot touch an owner row
  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  -- Guard 6: if target is the last active owner, block demotion
  IF v_target_role = 'owner' AND v_target_stat = 'active' THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role = 'owner'
      AND status = 'active'
      AND id != p_member_id;

    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  -- Guard 7: no-op guard
  IF v_target_role = p_new_role THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  -- Mutation
  UPDATE public.enterprise_members
  SET role = p_new_role,
      updated_at = now()
  WHERE id = p_member_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'new_role', p_new_role
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_member_role] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '7c15a1 — update_enterprise_member_role() created';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 3: set_enterprise_member_status()
-- Allows owner or admin to transition a member's status.
--
-- VALID TRANSITIONS
-- active → suspended
-- active → removed
-- suspended → active
-- suspended → removed
--
-- BLOCKED TRANSITIONS
-- removed → * (terminal state)
-- * → active by admin if target is owner
-- last active owner → suspended or removed
--
-- NOTE: 'invited' status is not managed here.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_enterprise_member_status(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_owner_count integer;
BEGIN
  -- Guard 1: caller authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  -- Guard 2: validate new status
  IF p_new_status IS NULL
     OR p_new_status NOT IN ('active','suspended','removed')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  -- Acquire enterprise row lock (serializes owner-sensitive ops)
  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  -- Guard 3: resolve caller membership
  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner','admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  -- Guard 4: resolve target membership (FOR UPDATE locks target row)
  SELECT em.role, em.status
  INTO v_target_role, v_target_stat
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  -- Guard 5: cannot transition from 'removed' (terminal state)
  IF v_target_stat = 'removed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_already_removed');
  END IF;

  -- Guard 6: admin cannot target an owner
  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

  -- Guard 7: last active owner protection
  IF v_target_role = 'owner'
     AND v_target_stat = 'active'
     AND p_new_status IN ('suspended','removed')
  THEN
    SELECT COUNT(*)
    INTO v_owner_count
    FROM public.enterprise_members
    WHERE enterprise_id = p_enterprise_id
      AND role = 'owner'
      AND status = 'active'
      AND id != p_member_id;

    IF v_owner_count = 0 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'reason','owner_invariant_violation');
    END IF;
  END IF;

  -- Guard 8: validate transition
  IF v_target_stat = 'active' AND p_new_status = 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  IF v_target_stat = 'suspended' AND p_new_status = 'suspended' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  -- invited → active/suspended/removed not supported via this RPC
  IF v_target_stat = 'invited' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invited_status_not_managed_here');
  END IF;

  -- Mutation (soft transition — no physical DELETE)
  UPDATE public.enterprise_members
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_member_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'new_status', p_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_member_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a1 — set_enterprise_member_status() created'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 4: Grants / Privileges verification note
--
-- enterprise_members: SELECT only to authenticated (unchanged from 7c13a1).
-- No INSERT, UPDATE, or DELETE granted to authenticated.
-- All mutations go through the two RPCs above.
-- The RPCs are SECURITY DEFINER (run as postgres) and
-- perform UPDATE directly, bypassing the table-level grant.
-- This is the correct pattern — the grant controls direct access,
-- the RPC guard sequence controls authorized mutations.
-- ═══════════════════════════════════════════════════════════════

-- Explicit re-assertion (idempotent — grants already in place from 7c13a1)
REVOKE INSERT, UPDATE, DELETE ON public.enterprise_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.enterprise_members FROM anon;

DO $$ BEGIN RAISE NOTICE '7c15a1 — enterprise_members INSERT/UPDATE/DELETE grants confirmed revoked'; END $$;


-- ════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.1 Enterprise Member Control Plane — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger:';
  RAISE NOTICE '  em_enforce_owner_invariant (BEFORE UPDATE/DELETE, FOR EACH ROW)';
  RAISE NOTICE '  fixeo_private._em_enforce_owner_invariant() — SECURITY DEFINER';
  RAISE NOTICE '  Concurrency: locks enterprise_accounts FOR UPDATE before count check';
  RAISE NOTICE '';
  RAISE NOTICE 'RPCs (public schema, PostgREST-exposed, authenticated only):';
  RAISE NOTICE '  update_enterprise_member_role(enterprise_id, member_id, new_role)';
  RAISE NOTICE '  set_enterprise_member_status(enterprise_id, member_id, new_status)';
  RAISE NOTICE '';
  RAISE NOTICE 'Invitation: DEFERRED';
  RAISE NOTICE '  Reason: no safe email→UUID lookup without service_role/oracle exposure';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables modified:         NONE';
  RAISE NOTICE 'Existing RLS modified:   NONE';
  RAISE NOTICE 'Existing RPCs modified:  NONE';
  RAISE NOTICE 'New grants to clients:   NONE';
  RAISE NOTICE '';
  RAISE NOTICE 'Production migration complete.';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

COMMIT;
