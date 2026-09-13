-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.8 Site Manager Role Integration
-- File: supabase/7c15a8-enterprise-site-manager-role-integration.sql
-- Sprint: BP08F
-- Branch: recovery/seo-v3-safe
--
-- PURPOSE
--   When a member's role changes FROM 'site_manager' TO any other
--   role, automatically clear all rows in enterprise_member_sites
--   for that member within the same transaction as the role change
--   (BP08F requirement).
--
--   If rows were actually deleted, a second audit event
--   'member_site_assignments_changed' is appended to
--   enterprise_audit_log.
--
-- SCOPE
--   1. CREATE OR REPLACE public.update_enterprise_member_role()
--      — identical to 7c15a3 version + BP08F site-cleanup block
--
-- DEPENDENCIES (applied first, in order)
--   7c15a1 — update_enterprise_member_role() created
--   7c15a3 — _eal_append() + audit wiring (member_role_changed)
--   7c15a6 — enterprise_member_sites table created
--           + 'member_site_assignments_changed' added to CHECK constraint
--
-- INVARIANTS PRESERVED
--   All guard logic (Guards 1-7), error codes, parameter names,
--   lock patterns, and return shapes from 7c15a1/7c15a3 are
--   reproduced EXACTLY. No guard is changed. No return shape is
--   changed.
--
--   The BP08F cleanup block executes ONLY after the successful
--   UPDATE to enterprise_members (role change committed in txn).
--   It is unreachable from any early-return guard path.
--
-- AUDIT DESIGN
--   member_role_changed    — fires on every role change (from 7c15a3)
--   member_site_assignments_changed — fires ONLY when site rows
--     were present and deleted. Zero-assignment transitions do NOT
--     generate this event (signal vs. noise).
--
--   Metadata for member_site_assignments_changed:
--     previous_site_ids: array of site UUIDs that were removed
--     new_site_ids:      '[]' (always empty after cleanup)
--     reason:            'role_change_cleanup'
--
-- ADDITIVE ONLY
--   Zero new tables, RLS policies, or grants.
--   Zero modifications to any other function.
--
-- ════════════════════════════════════════════════════════════
-- DO NOT APPLY TO SUPABASE WITHOUT EXPLICIT HUMAN AUTHORIZATION.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITION CHECKS
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_ems_exists      boolean;
  v_rpc_exists      boolean;
  v_constraint_def  text;
BEGIN
  -- enterprise_member_sites must exist (from 7c15a6)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'enterprise_member_sites'
  ) INTO v_ems_exists;

  IF NOT v_ems_exists THEN
    RAISE EXCEPTION
      'ABORT: enterprise_member_sites table not found. Apply 7c15a6 first.';
  END IF;

  -- update_enterprise_member_role must already exist (from 7c15a1 + 7c15a3)
  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_enterprise_member_role'
  ) INTO v_rpc_exists;

  IF NOT v_rpc_exists THEN
    RAISE EXCEPTION
      'ABORT: public.update_enterprise_member_role not found. Apply 7c15a1 + 7c15a3 first.';
  END IF;

  -- 'member_site_assignments_changed' must be in the action_type CHECK constraint
  -- (added by 7c15a6)
  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO v_constraint_def
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.enterprise_audit_log'::regclass
    AND c.contype  = 'c'
    AND c.conname  LIKE '%action_type%';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'ABORT: action_type CHECK constraint not found on enterprise_audit_log.';
  END IF;

  IF v_constraint_def NOT LIKE '%member_site_assignments_changed%' THEN
    RAISE EXCEPTION
      'ABORT: member_site_assignments_changed is not a valid action_type. '
      'Apply 7c15a6 first. Constraint def: %', v_constraint_def;
  END IF;

  RAISE NOTICE '7c15a8 preconditions PASSED';
  RAISE NOTICE '  enterprise_member_sites: exists';
  RAISE NOTICE '  update_enterprise_member_role: exists';
  RAISE NOTICE '  member_site_assignments_changed: valid action_type';
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — CREATE OR REPLACE update_enterprise_member_role
--
-- Full body reproduction from 7c15a1 + 7c15a3, with the
-- BP08F site-cleanup block inserted after the role-change
-- UPDATE and before the member_role_changed audit append.
--
-- DECLARE additions (BP08F):
--   v_old_role      text   — holds v_target_role before mutation
--   v_deleted_sites uuid[] — site_ids deleted during cleanup
--
-- All other variables, guards, locks, mutations, and grants
-- are reproduced verbatim from the 7c15a3 version.
-- ════════════════════════════════════════════════════════════

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
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_stat    text;
  v_target_role    text;
  v_target_stat    text;
  v_target_uid     uuid;
  v_owner_count    integer;
  v_old_role       text;    -- BP08F: capture role before mutation
  v_deleted_sites  uuid[];  -- BP08F: site_ids cleared by cleanup
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

  -- ── Mutation: role change
  UPDATE public.enterprise_members
  SET role = p_new_role, updated_at = now()
  WHERE id = p_member_id;

  -- ── BP08F: clear site assignments if leaving site_manager role ──
  -- v_target_role was captured in Guard 4 (before mutation).
  -- This block is only reached after a real role change (Guard 7 excluded no-ops).
  v_old_role := v_target_role;
  IF v_old_role = 'site_manager' AND p_new_role != 'site_manager' THEN
    -- Capture previous assignments for audit (ordered for stable comparison in tests)
    SELECT ARRAY(
      SELECT ems.site_id
      FROM public.enterprise_member_sites ems
      WHERE ems.member_id = p_member_id
      ORDER BY ems.site_id
    ) INTO v_deleted_sites;

    IF array_length(v_deleted_sites, 1) IS NOT NULL THEN
      DELETE FROM public.enterprise_member_sites
      WHERE member_id = p_member_id;

      -- Audit: member_site_assignments_changed with empty new_site_ids
      PERFORM fixeo_private._eal_append(
        p_enterprise_id,
        v_caller_id,
        'member_site_assignments_changed',
        'enterprise_member',
        p_member_id,
        pg_catalog.jsonb_build_object(
          'previous_site_ids', COALESCE(to_jsonb(v_deleted_sites), '[]'::jsonb),
          'new_site_ids',      '[]'::jsonb,
          'reason',            'role_change_cleanup'
        )
      );
    END IF;
  END IF;

  -- ── Audit append: member_role_changed (from 7c15a3 — additive only)
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

REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a8 — update_enterprise_member_role() re-created with BP08F site cleanup'; END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — SUMMARY NOTICE
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.8 Site Manager Role Integration — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Modified RPC (CREATE OR REPLACE — additive only):';
  RAISE NOTICE '  public.update_enterprise_member_role()';
  RAISE NOTICE '    BP08F: if old_role=site_manager AND new_role!=site_manager,';
  RAISE NOTICE '      DELETE FROM enterprise_member_sites WHERE member_id=p_member_id';
  RAISE NOTICE '      IF rows deleted: append member_site_assignments_changed audit event';
  RAISE NOTICE '    All existing guards (1-7), locks, error codes, return shape: UNCHANGED';
  RAISE NOTICE '    member_role_changed audit event: UNCHANGED (still fires on every change)';
  RAISE NOTICE '';
  RAISE NOTICE 'New audit event (conditional):';
  RAISE NOTICE '  member_site_assignments_changed';
  RAISE NOTICE '    Fires ONLY when site rows were present and deleted';
  RAISE NOTICE '    Metadata: previous_site_ids, new_site_ids (always []), reason';
  RAISE NOTICE '';
  RAISE NOTICE 'New tables:          NONE';
  RAISE NOTICE 'New RLS policies:    NONE';
  RAISE NOTICE 'New grants:          NONE';
  RAISE NOTICE 'Other RPCs changed:  NONE';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT APPLY — AWAITING HUMAN AUTHORIZATION';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;
