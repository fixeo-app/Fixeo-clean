-- ═════════════════════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.3 Enterprise Audit Trail
-- File: supabase/7c15a3-enterprise-audit-trail.sql
-- Sprint: BP08D
--
-- STATUS
--   PRODUCTION MIGRATION.
--   Static audit: PASS.
--   Production pre-apply verification: PASS.
--   Production post-apply verification: PASS.
--
-- PURPOSE
--   Add a tenant-scoped, immutable Enterprise business audit trail and wire it
--   into the six existing Enterprise RPCs currently present in production:
--
--     1. update_enterprise_member_role()
--     2. set_enterprise_member_status()
--     3. create_enterprise_site()
--     4. update_enterprise_site()
--     5. set_enterprise_site_status()
--     6. create_enterprise_request()
--
--   The audit records:
--     • who performed the successful mutation
--     • which enterprise the mutation belonged to
--     • which business object was affected
--     • what event occurred
--     • minimal before / after state
--     • timestamp
--
-- SECURITY PRINCIPLES
--   • No client role can INSERT / UPDATE / DELETE audit rows directly.
--   • Audit writing is only through fixeo_private._write_enterprise_audit_event().
--   • The private writer is SECURITY DEFINER with search_path=''.
--   • The private writer derives actor_user_id from auth.uid(); callers cannot
--     supply or spoof an audit actor UUID.
--   • PUBLIC / anon / authenticated cannot EXECUTE the private writer.
--   • Enterprise audit rows are immutable to client roles.
--   • SELECT is tenant-scoped to active owner/admin only.
--   • No cross-tenant event may be inserted from untrusted client values alone:
--     all six wired RPCs first enforce their existing tenant / membership guards.
--
-- AUDIT SEMANTICS
--   • Successful real mutation → one audit event.
--   • no_change → no audit event.
--   • rejected/failed mutation → no business mutation event.
--   • Audit INSERT occurs in the same transaction as the business mutation.
--   • If audit write fails, the RPC returns internal_error and PostgreSQL rolls
--     back the statement/transactional effects of the failed statement path.
--
-- OUT OF SCOPE
--   • Supabase Auth audit
--   • Vercel/application logs
--   • IP/device fingerprinting
--   • audit export / retention / purge
--   • SIEM integration
--   • financial audit
--   • physical DELETE of Enterprise entities
--
-- IMPORTANT
--   This migration intentionally REPLACES the definitions of six existing RPCs
--   to add audit calls. Their signatures, role grants, guard semantics, return
--   shapes and existing mutation behavior must remain unchanged.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITION CHECKS
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.enterprise_accounts') IS NULL THEN
    v_missing := array_append(v_missing, 'public.enterprise_accounts');
  END IF;
  IF to_regclass('public.enterprise_members') IS NULL THEN
    v_missing := array_append(v_missing, 'public.enterprise_members');
  END IF;
  IF to_regclass('public.enterprise_sites') IS NULL THEN
    v_missing := array_append(v_missing, 'public.enterprise_sites');
  END IF;
  IF to_regclass('public.enterprise_request_context') IS NULL THEN
    v_missing := array_append(v_missing, 'public.enterprise_request_context');
  END IF;
  IF to_regclass('public.service_requests') IS NULL THEN
    v_missing := array_append(v_missing, 'public.service_requests');
  END IF;

  IF to_regclass('public.enterprise_audit_events') IS NOT NULL THEN
    RAISE EXCEPTION
      '7c15a3 precondition failure. public.enterprise_audit_events already exists; aborting to avoid silent contract drift.';
  END IF;

  IF to_regprocedure('fixeo_private._fixeo_is_enterprise_manager(uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'fixeo_private._fixeo_is_enterprise_manager(uuid)');
  END IF;

  IF to_regprocedure('public.update_enterprise_member_role(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_enterprise_member_role(uuid,uuid,text)');
  END IF;
  IF to_regprocedure('public.set_enterprise_member_status(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.set_enterprise_member_status(uuid,uuid,text)');
  END IF;
  IF to_regprocedure('public.create_enterprise_site(uuid,text,text,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.create_enterprise_site(uuid,text,text,text,text)');
  END IF;
  IF to_regprocedure('public.update_enterprise_site(uuid,uuid,text,text,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.update_enterprise_site(uuid,uuid,text,text,text,text)');
  END IF;
  IF to_regprocedure('public.set_enterprise_site_status(uuid,uuid,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.set_enterprise_site_status(uuid,uuid,text)');
  END IF;
  IF to_regprocedure('public.create_enterprise_request(uuid,uuid,text,text,text)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.create_enterprise_request(uuid,uuid,text,text,text)');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION '7c15a3 precondition failure. Missing: %', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — ENTERPRISE AUDIT TABLE
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.enterprise_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL
    REFERENCES public.enterprise_accounts(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  -- Deliberately no FK to public.users:
  -- audit history must survive a later user-row removal.
  -- Wired RPCs always source this value from auth.uid().
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enterprise_audit_events_event_type_chk
    CHECK (
      event_type IN (
        'member.role_updated',
        'member.status_updated',
        'site.created',
        'site.updated',
        'site.status_updated',
        'request.created'
      )
    ),

  CONSTRAINT enterprise_audit_events_target_type_chk
    CHECK (
      target_type IN (
        'enterprise_member',
        'enterprise_site',
        'service_request'
      )
    ),

  CONSTRAINT enterprise_audit_events_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),

  CONSTRAINT enterprise_audit_events_before_object_chk
    CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),

  CONSTRAINT enterprise_audit_events_after_object_chk
    CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object')
);

ALTER TABLE public.enterprise_audit_events
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_enterprise_audit_events_enterprise_created
  ON public.enterprise_audit_events (enterprise_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_audit_events_target_created
  ON public.enterprise_audit_events
  (enterprise_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_audit_events_actor_created
  ON public.enterprise_audit_events (actor_user_id, created_at DESC);

-- Client roles must never mutate this table directly.
REVOKE ALL ON public.enterprise_audit_events FROM PUBLIC;
REVOKE ALL ON public.enterprise_audit_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.enterprise_audit_events FROM authenticated;

-- authenticated may SELECT only through RLS.
GRANT SELECT ON public.enterprise_audit_events TO authenticated;

-- Owner/admin-only read policy, tenant scoped.
DROP POLICY IF EXISTS enterprise_audit_events_manager_select
  ON public.enterprise_audit_events;

CREATE POLICY enterprise_audit_events_manager_select
ON public.enterprise_audit_events
FOR SELECT
TO authenticated
USING (
  fixeo_private._fixeo_is_enterprise_manager(
    enterprise_audit_events.enterprise_id
  )
);

-- No INSERT / UPDATE / DELETE RLS policies are created for authenticated.

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — PRIVATE AUDIT WRITER
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fixeo_private._write_enterprise_audit_event(
  p_enterprise_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_before_state jsonb DEFAULT NULL,
  p_after_state jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid;
  v_actor_user_id uuid;
  v_event_type text;
  v_target_type text;
  v_metadata jsonb;
BEGIN
  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'enterprise_id_required';
  END IF;

  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_user_id_required';
  END IF;

  v_event_type := pg_catalog.btrim(p_event_type);
  IF v_event_type IS NULL OR pg_catalog.char_length(v_event_type) < 1 THEN
    RAISE EXCEPTION 'event_type_required';
  END IF;

  v_target_type := pg_catalog.btrim(p_target_type);
  IF v_target_type IS NULL OR pg_catalog.char_length(v_target_type) < 1 THEN
    RAISE EXCEPTION 'target_type_required';
  END IF;

  IF p_before_state IS NOT NULL
     AND pg_catalog.jsonb_typeof(p_before_state) <> 'object'
  THEN
    RAISE EXCEPTION 'before_state_must_be_object';
  END IF;

  IF p_after_state IS NOT NULL
     AND pg_catalog.jsonb_typeof(p_after_state) <> 'object'
  THEN
    RAISE EXCEPTION 'after_state_must_be_object';
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF pg_catalog.jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object';
  END IF;

  INSERT INTO public.enterprise_audit_events (
    enterprise_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    before_state,
    after_state,
    metadata
  )
  VALUES (
    p_enterprise_id,
    v_actor_user_id,
    v_event_type,
    v_target_type,
    p_target_id,
    p_before_state,
    p_after_state,
    v_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL
ON FUNCTION fixeo_private._write_enterprise_audit_event(
  uuid, text, text, uuid, jsonb, jsonb, jsonb
)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION fixeo_private._write_enterprise_audit_event(
  uuid, text, text, uuid, jsonb, jsonb, jsonb
)
FROM anon;

REVOKE EXECUTE
ON FUNCTION fixeo_private._write_enterprise_audit_event(
  uuid, text, text, uuid, jsonb, jsonb, jsonb
)
FROM authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — WIRE update_enterprise_member_role()
-- Existing signature / grants / return semantics preserved.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_member_role(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_target_uid  uuid;
  v_owner_count integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_new_role IS NULL
     OR p_new_role NOT IN ('admin','operations_manager','site_manager','reporter','viewer')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_role');
  END IF;

  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

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

  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

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

  IF v_target_role = p_new_role THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  UPDATE public.enterprise_members
  SET role = p_new_role,
      updated_at = now()
  WHERE id = p_member_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.role_updated',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object('role', v_target_role),
    pg_catalog.jsonb_build_object('role', p_new_role),
    pg_catalog.jsonb_build_object(
      'target_user_id', v_target_uid,
      'target_status', v_target_stat
    )
  );

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
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — WIRE set_enterprise_member_status()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_enterprise_member_status(
  p_enterprise_id uuid,
  p_member_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_stat text;
  v_target_role text;
  v_target_stat text;
  v_owner_count integer;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_new_status IS NULL
     OR p_new_status NOT IN ('active','suspended','removed')
  THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;

  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

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

  SELECT em.role, em.status
  INTO v_target_role, v_target_stat
  FROM public.enterprise_members em
  WHERE em.id = p_member_id
    AND em.enterprise_id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_not_found');
  END IF;

  IF v_target_stat = 'removed' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','member_already_removed');
  END IF;

  IF v_caller_role = 'admin' AND v_target_role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','cannot_modify_owner');
  END IF;

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

  IF v_target_stat = 'active' AND p_new_status = 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  IF v_target_stat = 'suspended' AND p_new_status = 'suspended' THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'reason','no_change');
  END IF;

  IF v_target_stat = 'invited' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invited_status_not_managed_here');
  END IF;

  UPDATE public.enterprise_members
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_member_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'member.status_updated',
    'enterprise_member',
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_target_stat),
    pg_catalog.jsonb_build_object('status', p_new_status),
    pg_catalog.jsonb_build_object('target_role', v_target_role)
  );

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
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — WIRE create_enterprise_site()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_enterprise_site(
  p_enterprise_id uuid,
  p_name text,
  p_city text,
  p_site_code text DEFAULT NULL::text,
  p_address_line text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_caller_id
  ) INTO v_caller_exists;

  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  SELECT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id)
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  v_name := pg_catalog.btrim(p_name);
  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  IF p_city IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  v_city := pg_catalog.btrim(p_city);
  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

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
    'active'
  )
  RETURNING id INTO v_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.created',
    'enterprise_site',
    v_site_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'city', v_city,
      'site_code', v_site_code,
      'address_line', v_address_line,
      'status', 'active'
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', v_site_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'site_code_exists'
    );

  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_site] unexpected error: %', SQLERRM;
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — WIRE update_enterprise_site()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_site(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_name text,
  p_city text,
  p_site_code text DEFAULT NULL::text,
  p_address_line text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid uuid;
  v_site_name text;
  v_site_city text;
  v_site_code_cur text;
  v_site_addr_cur text;
  v_name text;
  v_city text;
  v_site_code text;
  v_address_line text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT es.enterprise_id, es.name, es.city, es.site_code, es.address_line
  INTO v_site_eid, v_site_name, v_site_city, v_site_code_cur, v_site_addr_cur
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_eid <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  IF p_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  v_name := pg_catalog.btrim(p_name);
  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'name_too_long');
  END IF;

  IF p_city IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_city)) < 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_required');
  END IF;

  v_city := pg_catalog.btrim(p_city);
  IF pg_catalog.char_length(v_city) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'city_too_long');
  END IF;

  IF p_site_code IS NOT NULL THEN
    v_site_code := pg_catalog.btrim(p_site_code);
    IF pg_catalog.char_length(v_site_code) > 80 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_invalid');
    END IF;
    IF pg_catalog.char_length(v_site_code) = 0 THEN
      v_site_code := NULL;
    END IF;
  ELSE
    v_site_code := NULL;
  END IF;

  IF p_address_line IS NOT NULL THEN
    v_address_line := pg_catalog.btrim(p_address_line);
    IF pg_catalog.char_length(v_address_line) > 500 THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'address_invalid');
    END IF;
    IF pg_catalog.char_length(v_address_line) = 0 THEN
      v_address_line := NULL;
    END IF;
  ELSE
    v_address_line := NULL;
  END IF;

  IF v_name IS NOT DISTINCT FROM v_site_name
     AND v_city IS NOT DISTINCT FROM v_site_city
     AND v_site_code IS NOT DISTINCT FROM v_site_code_cur
     AND v_address_line IS NOT DISTINCT FROM v_site_addr_cur
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  UPDATE public.enterprise_sites
  SET name = v_name,
      city = v_city,
      site_code = v_site_code,
      address_line = v_address_line
  WHERE id = p_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.updated',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object(
      'name', v_site_name,
      'city', v_site_city,
      'site_code', v_site_code_cur,
      'address_line', v_site_addr_cur
    ),
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'city', v_city,
      'site_code', v_site_code,
      'address_line', v_address_line
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_code_exists');

  WHEN OTHERS THEN
    RAISE WARNING '[update_enterprise_site] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — WIRE set_enterprise_site_status()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_enterprise_site_status(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_caller_stat text;
  v_site_eid uuid;
  v_site_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active', 'inactive') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  PERFORM id
  FROM public.enterprise_accounts
  WHERE id = p_enterprise_id
  FOR UPDATE;

  SELECT em.role, em.status
  INTO v_caller_role, v_caller_stat
  FROM public.enterprise_members em
  WHERE em.enterprise_id = p_enterprise_id
    AND em.user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_a_member');
  END IF;

  IF v_caller_stat != 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'caller_not_active');
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT es.enterprise_id, es.status
  INTO v_site_eid, v_site_status
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_eid <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  IF v_site_status = p_status THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'reason', 'no_change');
  END IF;

  UPDATE public.enterprise_sites
  SET status = p_status
  WHERE id = p_site_id;

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'site.status_updated',
    'enterprise_site',
    p_site_id,
    pg_catalog.jsonb_build_object('status', v_site_status),
    pg_catalog.jsonb_build_object('status', p_status),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'new_status', p_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[set_enterprise_site_status] error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — WIRE create_enterprise_request()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_enterprise_request(
  p_enterprise_id uuid,
  p_site_id uuid,
  p_service_category text,
  p_description text,
  p_urgency text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_caller_id
  ) INTO v_caller_exists;

  IF NOT COALESCE(v_caller_exists, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_required');
  END IF;

  IF p_site_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_required');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_accounts ea
    WHERE ea.id = p_enterprise_id
      AND ea.status = 'active'
  ) INTO v_enterprise_active;

  IF NOT COALESCE(v_enterprise_active, false) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'enterprise_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.enterprise_id = p_enterprise_id
      AND em.user_id = v_caller_id
      AND em.status = 'active'
      AND em.role IN (
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

  SELECT es.enterprise_id, es.status, es.city
  INTO v_site_enterprise, v_site_status, v_city
  FROM public.enterprise_sites es
  WHERE es.id = p_site_id;

  IF v_site_enterprise IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_not_found');
  END IF;

  IF v_site_enterprise <> p_enterprise_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_enterprise_mismatch');
  END IF;

  IF v_site_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'site_inactive');
  END IF;

  IF p_service_category IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_service_category)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'service_category_required');
  END IF;

  v_service_category := pg_catalog.btrim(p_service_category);

  IF p_description IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_description)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'description_required');
  END IF;

  v_description := pg_catalog.btrim(p_description);

  IF p_urgency IS NOT NULL THEN
    IF p_urgency NOT IN ('normale', 'urgent', 'now') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'urgency_invalid');
    END IF;
    v_urgency := p_urgency;
  ELSE
    v_urgency := NULL;
  END IF;

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

  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'request.created',
    'service_request',
    v_sr_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'service_request_id', v_sr_id,
      'enterprise_request_context_id', v_ctx_id,
      'site_id', p_site_id,
      'service_category', v_service_category,
      'urgency', v_urgency
    ),
    pg_catalog.jsonb_build_object(
      'enterprise_request_context_id', v_ctx_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'service_request_id', v_sr_id,
    'enterprise_request_context_id', v_ctx_id,
    'enterprise_id', p_enterprise_id,
    'site_id', p_site_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[create_enterprise_request] unexpected error: % (SQLSTATE: %)',
      SQLERRM, SQLSTATE;

    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 9 — REASSERT PUBLIC RPC EXECUTE GRANTS
-- Preserve current production contract exactly.
-- ═════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_enterprise_member_role(uuid,uuid,text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_member_status(uuid,uuid,text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_site(uuid,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_site(uuid,text,text,text,text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_enterprise_site(uuid,uuid,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_enterprise_site(uuid,uuid,text,text,text,text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_enterprise_site_status(uuid,uuid,text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_enterprise_request(uuid,uuid,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_enterprise_request(uuid,uuid,text,text,text)
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- FINAL STATUS
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.3 Enterprise Audit Trail — migration complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'Created: public.enterprise_audit_events';
  RAISE NOTICE 'Created: fixeo_private._write_enterprise_audit_event(...)';
  RAISE NOTICE 'Wired RPCs: 6';
  RAISE NOTICE '  update_enterprise_member_role';
  RAISE NOTICE '  set_enterprise_member_status';
  RAISE NOTICE '  create_enterprise_site';
  RAISE NOTICE '  update_enterprise_site';
  RAISE NOTICE '  set_enterprise_site_status';
  RAISE NOTICE '  create_enterprise_request';
  RAISE NOTICE '';
  RAISE NOTICE 'Audit read access: active owner/admin of same enterprise only';
  RAISE NOTICE 'Audit client writes: none';
  RAISE NOTICE 'no_change events: not written';
  RAISE NOTICE '';
  RAISE NOTICE 'Production migration applied and post-apply validated.';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;
