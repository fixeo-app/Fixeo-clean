-- ════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.6 Enterprise Member–Site Assignments
-- File: supabase/7c15a6-enterprise-member-site-assignments.sql
-- Sprint: BP08F
-- HEAD at authoring: ff65b6d84a982bf606cc6335d35b584ed522abfa
--
-- PURPOSE
--   Add self-service assignment of sites to site_manager members.
--   Provides:
--     • public.enterprise_member_sites         — junction table
--     • fixeo_private._ems_cross_tenant_check  — cross-tenant trigger
--     • fixeo_private._fixeo_get_site_manager_site_ids — helper
--     • public.set_enterprise_member_sites     — atomic replace RPC
--     • enterprise_audit_log CHECK extension for new action_type
--
-- INVARIANTS
--   A. Only owner or admin may assign sites to a member.
--   B. Target member must be role='site_manager' and status='active'.
--   C. All supplied site_ids must belong to the same enterprise.
--   D. Mutation is atomic: full set-replace (delete existing + insert new).
--   E. No-op (same sorted set) returns {ok:true,reason:'no_change'}.
--   F. Duplicate site_ids in input are silently deduplicated.
--   G. NULL input is treated as empty (clears all assignments).
--   H. All mutations go through the RPC — authenticated has no
--      INSERT/UPDATE/DELETE directly on enterprise_member_sites.
--
-- SECURITY MODEL
--   • SECURITY DEFINER on all RPCs/helpers: runs as postgres, bypasses RLS.
--   • SET search_path = '': prevents search-path injection.
--   • All identifiers fully schema-qualified.
--   • Cross-tenant trigger (SECURITY DEFINER) backstops even service_role
--     operations that bypass the RPC guard.
--
-- CONCURRENCY
--   set_enterprise_member_sites acquires enterprise_accounts FOR UPDATE
--   before any membership check or site mutation, serializing concurrent
--   assignment mutations for the same enterprise.
--
-- ADDITIVE ONLY
--   Zero modifications to enterprise_accounts, enterprise_members,
--   enterprise_sites, or any prior RPC/trigger/index.
--   The only change to enterprise_audit_log is extending the
--   action_type CHECK constraint (DROP + re-ADD with new value).
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
  v_ea_exists     boolean;
  v_em_exists     boolean;
  v_es_exists     boolean;
  v_eal_exists    boolean;
  v_append_exists boolean;
BEGIN
  -- enterprise_accounts must exist
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_accounts'
  ) INTO v_ea_exists;
  IF NOT v_ea_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_accounts does not exist. Apply 7c13a1 first.';
  END IF;

  -- enterprise_members must exist
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_members'
  ) INTO v_em_exists;
  IF NOT v_em_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_members does not exist. Apply 7c13a1 first.';
  END IF;

  -- enterprise_sites must exist
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_sites'
  ) INTO v_es_exists;
  IF NOT v_es_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_sites does not exist. Apply 7c13a2 first.';
  END IF;

  -- enterprise_audit_log must exist
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'enterprise_audit_log'
  ) INTO v_eal_exists;
  IF NOT v_eal_exists THEN
    RAISE EXCEPTION 'ABORT: public.enterprise_audit_log does not exist. Apply 7c15a3 first.';
  END IF;

  -- fixeo_private._eal_append must exist
  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fixeo_private' AND p.proname = '_eal_append'
  ) INTO v_append_exists;
  IF NOT v_append_exists THEN
    RAISE EXCEPTION 'ABORT: fixeo_private._eal_append does not exist. Apply 7c15a3 first.';
  END IF;

  RAISE NOTICE '7c15a6 — precondition checks passed';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 1 — CREATE TABLE public.enterprise_member_sites
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.enterprise_member_sites (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id  uuid        NOT NULL,
  member_id      uuid        NOT NULL,
  site_id        uuid        NOT NULL,
  assigned_by    uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_member_sites_pkey
    PRIMARY KEY (id),

  CONSTRAINT ems_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts (id)
    ON DELETE CASCADE,

  CONSTRAINT ems_member_fk
    FOREIGN KEY (member_id)
    REFERENCES public.enterprise_members (id)
    ON DELETE CASCADE,

  CONSTRAINT ems_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites (id)
    ON DELETE CASCADE,

  CONSTRAINT ems_assigned_by_fk
    FOREIGN KEY (assigned_by)
    REFERENCES public.users (id)
    ON DELETE RESTRICT,

  CONSTRAINT ems_member_site_unique
    UNIQUE (member_id, site_id)
);

DO $$ BEGIN RAISE NOTICE '7c15a6 — enterprise_member_sites table created'; END $$;

-- ── Cross-enterprise consistency trigger ──────────────────────────────────

CREATE OR REPLACE FUNCTION fixeo_private._ems_cross_tenant_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_eid uuid;
  v_site_eid   uuid;
BEGIN
  SELECT enterprise_id INTO v_member_eid
  FROM public.enterprise_members
  WHERE id = NEW.member_id;

  SELECT enterprise_id INTO v_site_eid
  FROM public.enterprise_sites
  WHERE id = NEW.site_id;

  IF v_member_eid IS DISTINCT FROM NEW.enterprise_id THEN
    RAISE EXCEPTION 'ems_cross_tenant: member enterprise mismatch';
  END IF;

  IF v_site_eid IS DISTINCT FROM NEW.enterprise_id THEN
    RAISE EXCEPTION 'ems_cross_tenant: site enterprise mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ems_cross_tenant
BEFORE INSERT OR UPDATE ON public.enterprise_member_sites
FOR EACH ROW EXECUTE FUNCTION fixeo_private._ems_cross_tenant_check();

DO $$ BEGIN RAISE NOTICE '7c15a6 — _ems_cross_tenant_check trigger installed'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 2 — ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_member_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_member_sites FORCE ROW LEVEL SECURITY;

-- Policy: owner / admin / operations_manager can read all assignments
-- for their enterprise.
DROP POLICY IF EXISTS ems_admin_select ON public.enterprise_member_sites;
CREATE POLICY ems_admin_select ON public.enterprise_member_sites
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.enterprise_id = enterprise_member_sites.enterprise_id
      AND em.user_id       = auth.uid()
      AND em.status        = 'active'
      AND em.role          IN ('owner', 'admin', 'operations_manager')
  )
);

-- Policy: site_manager can read only their own assignments.
DROP POLICY IF EXISTS ems_self_select ON public.enterprise_member_sites;
CREATE POLICY ems_self_select ON public.enterprise_member_sites
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.id      = enterprise_member_sites.member_id
      AND em.user_id = auth.uid()
      AND em.status  = 'active'
      AND em.role    = 'site_manager'
  )
);

-- NO INSERT/UPDATE/DELETE policy for authenticated.
-- All mutations go through the set_enterprise_member_sites RPC only.

DO $$ BEGIN RAISE NOTICE '7c15a6 — enterprise_member_sites RLS policies installed'; END $$;

-- ── Grants ────────────────────────────────────────────────────────────────
REVOKE ALL ON public.enterprise_member_sites FROM PUBLIC;
REVOKE ALL ON public.enterprise_member_sites FROM anon;
GRANT SELECT ON public.enterprise_member_sites TO authenticated;
-- NO INSERT/UPDATE/DELETE grant to authenticated — mutations via RPC only.

DO $$ BEGIN RAISE NOTICE '7c15a6 — enterprise_member_sites grants applied (SELECT only to authenticated)'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 3 — INDEXES
-- ════════════════════════════════════════════════════════════

CREATE INDEX idx_ems_member
  ON public.enterprise_member_sites (member_id);

CREATE INDEX idx_ems_site
  ON public.enterprise_member_sites (site_id);

CREATE INDEX idx_ems_eid_mem
  ON public.enterprise_member_sites (enterprise_id, member_id);

DO $$ BEGIN RAISE NOTICE '7c15a6 — enterprise_member_sites indexes created'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 4 — EXTEND enterprise_audit_log CHECK CONSTRAINT
--             to include 'member_site_assignments_changed'
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.enterprise_audit_log'::regclass
    AND contype  = 'c'
    AND conname  LIKE '%action_type%';

  IF v_conname IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.enterprise_audit_log DROP CONSTRAINT %I',
      v_conname
    );
    RAISE NOTICE '7c15a6 — dropped existing action_type CHECK constraint: %', v_conname;
  END IF;

  ALTER TABLE public.enterprise_audit_log
    ADD CONSTRAINT enterprise_audit_log_action_type_check
    CHECK (action_type IN (
      'member_role_changed',
      'member_status_changed',
      'site_updated',
      'site_status_changed',
      'account_profile_updated',
      'member_site_assignments_changed'
    ));

  RAISE NOTICE '7c15a6 — enterprise_audit_log action_type CHECK constraint re-created with member_site_assignments_changed';
END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 5 — fixeo_private._fixeo_get_site_manager_site_ids
--             Reusable helper for RLS and RPCs
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fixeo_private._fixeo_get_site_manager_site_ids(
  p_enterprise_id uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT ems.site_id
      FROM public.enterprise_member_sites ems
      JOIN public.enterprise_members em
        ON em.id = ems.member_id
      WHERE ems.enterprise_id = p_enterprise_id
        AND em.user_id        = auth.uid()
        AND em.status         = 'active'
        AND em.role           = 'site_manager'
    ),
    '{}'::uuid[]
  );
$$;

REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_get_site_manager_site_ids(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fixeo_private._fixeo_get_site_manager_site_ids(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fixeo_private._fixeo_get_site_manager_site_ids(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a6 — _fixeo_get_site_manager_site_ids helper installed'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 6 — public.set_enterprise_member_sites RPC
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_enterprise_member_sites(
  p_enterprise_id uuid,
  p_member_id     uuid,
  p_site_ids      uuid[]
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
  v_site_ids       uuid[];
  v_site_eid       uuid;
  v_sid            uuid;
  v_prev_ids       uuid[];
  v_prev_sorted    uuid[];
  v_new_sorted     uuid[];
  v_site_count     int;
BEGIN
  -- Guard 1: authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Guard 2: acquire enterprise lock (concurrency-safe owner invariant)
  PERFORM id FROM public.enterprise_accounts WHERE id = p_enterprise_id FOR UPDATE;

  -- Guard 3: caller must be an active owner or admin
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

  -- Guard 4: target member must exist in the same enterprise
  SELECT em.role, em.status
  INTO v_target_role, v_target_stat
  FROM public.enterprise_members em
  WHERE em.id            = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'member_not_found');
  END IF;

  -- Guard 5: target must be site_manager
  IF v_target_role != 'site_manager' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_not_site_manager');
  END IF;

  -- Guard 6: target must be active
  IF v_target_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_not_active');
  END IF;

  -- Guard 7: normalize site_ids (deduplicate, handle null/empty)
  IF p_site_ids IS NULL THEN
    v_site_ids := ARRAY[]::uuid[];
  ELSE
    SELECT ARRAY(SELECT DISTINCT unnest(p_site_ids)) INTO v_site_ids;
  END IF;

  -- Guard 8: validate all sites belong to this enterprise
  FOREACH v_sid IN ARRAY v_site_ids LOOP
    SELECT es.enterprise_id INTO v_site_eid
    FROM public.enterprise_sites es
    WHERE es.id = v_sid;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',      false,
        'reason',  'site_not_found',
        'site_id', v_sid
      );
    END IF;
    IF v_site_eid != p_enterprise_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',      false,
        'reason',  'site_enterprise_mismatch',
        'site_id', v_sid
      );
    END IF;
  END LOOP;

  -- Guard 9: no-op check (sorted comparison)
  SELECT ARRAY(
    SELECT ems.site_id
    FROM public.enterprise_member_sites ems
    WHERE ems.member_id = p_member_id
    ORDER BY ems.site_id
  ) INTO v_prev_ids;

  SELECT ARRAY(SELECT unnest(v_site_ids) ORDER BY 1)
  INTO v_new_sorted;

  SELECT ARRAY(SELECT unnest(COALESCE(v_prev_ids, ARRAY[]::uuid[])) ORDER BY 1)
  INTO v_prev_sorted;

  IF v_prev_sorted IS NOT DISTINCT FROM v_new_sorted THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',           true,
      'reason',       'no_change',
      'enterprise_id', p_enterprise_id,
      'member_id',    p_member_id,
      'site_count',   array_length(v_new_sorted, 1)
    );
  END IF;

  -- Mutation: atomic delete + insert (full set-replace)
  DELETE FROM public.enterprise_member_sites
  WHERE member_id = p_member_id;

  IF array_length(v_site_ids, 1) > 0 THEN
    INSERT INTO public.enterprise_member_sites (enterprise_id, member_id, site_id, assigned_by)
    SELECT p_enterprise_id, p_member_id, unnest(v_site_ids), v_caller_id;
  END IF;

  v_site_count := COALESCE(array_length(v_site_ids, 1), 0);

  -- Audit
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    v_caller_id,
    'member_site_assignments_changed',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object(
      'previous_site_ids', COALESCE(pg_catalog.to_jsonb(v_prev_sorted), '[]'::jsonb),
      'new_site_ids',      COALESCE(pg_catalog.to_jsonb(v_new_sorted),  '[]'::jsonb)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',            true,
    'enterprise_id', p_enterprise_id,
    'member_id',     p_member_id,
    'site_count',    v_site_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_member_sites] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_sites(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_sites(uuid, uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_enterprise_member_sites(uuid, uuid, uuid[]) TO authenticated;

DO $$ BEGIN RAISE NOTICE '7c15a6 — set_enterprise_member_sites RPC installed'; END $$;

-- ════════════════════════════════════════════════════════════
-- SECTION 7 — SUMMARY
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.6 — Enterprise Member–Site Assignments COMPLETE';
  RAISE NOTICE '  TABLE   : public.enterprise_member_sites';
  RAISE NOTICE '  TRIGGER : fixeo_private._ems_cross_tenant_check (BEFORE INSERT/UPDATE)';
  RAISE NOTICE '  HELPER  : fixeo_private._fixeo_get_site_manager_site_ids(uuid)';
  RAISE NOTICE '  RPC     : public.set_enterprise_member_sites(uuid,uuid,uuid[])';
  RAISE NOTICE '  AUDIT   : enterprise_audit_log CHECK extended with member_site_assignments_changed';
  RAISE NOTICE '  INDEXES : idx_ems_member, idx_ems_site, idx_ems_eid_mem';
  RAISE NOTICE '  RLS     : ems_admin_select, ems_self_select (SELECT only; no mutation policies)';
  RAISE NOTICE '  GRANTS  : SELECT to authenticated; mutations via RPC only';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
END $$;

COMMIT;
