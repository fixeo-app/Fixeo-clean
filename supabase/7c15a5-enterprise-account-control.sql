-- ═════════════════════════════════════════════════════════════════════════════
-- FIXEO OPERATIONS — 7C.15A.5 Enterprise Account Control Plane
-- File: supabase/7c15a5-enterprise-account-control.sql
--
-- STATUS
--   PRODUCTION MIGRATION.
--   Applied and post-apply validated in Supabase production.
--
-- SOURCE OF TRUTH
--   Contract derived from verified PRODUCTION inventory after 7c15a3.
--
-- PURPOSE
--   1. Add self-service enterprise account metadata updates.
--   2. Move authenticated account mutation to RPC-only access.
--   3. Extend Enterprise audit vocabulary with account.created/account.updated.
--   4. Wire create_enterprise_account() and update_enterprise_account() to audit.
--
-- SCOPE
--   • New RPC:
--       update_enterprise_account(
--         p_enterprise_id uuid,
--         p_name text,
--         p_legal_name text
--       )
--
--   • Existing RPC replaced in-place, same signature / return contract:
--       create_enterprise_account(
--         p_name text,
--         p_legal_name text DEFAULT NULL
--       )
--
--   • Audit vocabulary additions:
--       event_type: account.created, account.updated
--       target_type: enterprise_account
--
--   • Direct authenticated mutation removed from enterprise_accounts:
--       INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER
--       plus column-level INSERT / UPDATE / REFERENCES grants.
--
--   • SELECT preserved for authenticated and remains RLS-controlled.
--
--   • ea_owner_update policy removed because tenant account mutations become
--     RPC-only. Existing FIXEO-admin ALL policy is left unchanged, but without
--     direct authenticated table mutation privileges it cannot create a tenant
--     direct-write path.
--
-- OUT OF SCOPE
--   • account status transitions (active/suspended/closed)
--   • account physical DELETE
--   • ownership transfer
--   • invitation flow
--   • billing/subscriptions
--
-- INVARIANTS
--   A. update_enterprise_account() may change name/legal_name only.
--   B. status is never caller-controlled by this migration.
--   C. caller must be an active enterprise owner/admin.
--   D. no_change produces no audit event.
--   E. rejected/failed operations produce no successful mutation event.
--   F. mutation and audit write occur in the same transaction.
--   G. create_enterprise_account() keeps its existing bootstrap guards and
--      atomic account + founding-owner creation behavior.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRECONDITIONS
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

  IF to_regclass('public.enterprise_audit_events') IS NULL THEN
    v_missing := array_append(v_missing, 'public.enterprise_audit_events');
  END IF;

  IF to_regclass('public.users') IS NULL THEN
    v_missing := array_append(v_missing, 'public.users');
  END IF;

  IF to_regprocedure(
    'public.create_enterprise_account(text,text)'
  ) IS NULL THEN
    v_missing := array_append(
      v_missing,
      'public.create_enterprise_account(text,text)'
    );
  END IF;

  IF to_regprocedure(
    'fixeo_private._fixeo_is_enterprise_manager(uuid)'
  ) IS NULL THEN
    v_missing := array_append(
      v_missing,
      'fixeo_private._fixeo_is_enterprise_manager(uuid)'
    );
  END IF;

  IF to_regprocedure(
    'fixeo_private._write_enterprise_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb)'
  ) IS NULL THEN
    v_missing := array_append(
      v_missing,
      'fixeo_private._write_enterprise_audit_event(uuid,text,text,uuid,jsonb,jsonb,jsonb)'
    );
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      '7c15a5 precondition failure. Missing: %',
      array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure(
    'public.update_enterprise_account(uuid,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      '7c15a5 precondition failure. update_enterprise_account(uuid,text,text) already exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = to_regclass('public.enterprise_audit_events')
      AND c.conname = 'enterprise_audit_events_event_type_chk'
  ) THEN
    RAISE EXCEPTION
      '7c15a5 precondition failure. enterprise_audit_events_event_type_chk missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = to_regclass('public.enterprise_audit_events')
      AND c.conname = 'enterprise_audit_events_target_type_chk'
  ) THEN
    RAISE EXCEPTION
      '7c15a5 precondition failure. enterprise_audit_events_target_type_chk missing.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — EXTEND AUDIT VOCABULARY
-- Existing 7c15a3 values are preserved exactly; account values are additive.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_event_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_event_type_chk
  CHECK (
    event_type IN (
      'member.role_updated',
      'member.status_updated',
      'site.created',
      'site.updated',
      'site.status_updated',
      'request.created',
      'account.created',
      'account.updated'
    )
  );

ALTER TABLE public.enterprise_audit_events
  DROP CONSTRAINT enterprise_audit_events_target_type_chk;

ALTER TABLE public.enterprise_audit_events
  ADD CONSTRAINT enterprise_audit_events_target_type_chk
  CHECK (
    target_type IN (
      'enterprise_member',
      'enterprise_site',
      'service_request',
      'enterprise_account'
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — REWIRE create_enterprise_account() WITH AUDIT
--
-- Exact current production signature preserved:
--   create_enterprise_account(
--     p_name text,
--     p_legal_name text DEFAULT NULL::text
--   ) RETURNS jsonb
--
-- Existing guards and return semantics are preserved.
-- Audit insertion occurs only after BOTH account and founding-owner rows exist.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_enterprise_account(
  p_name text,
  p_legal_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id      uuid;
  v_caller_exists  boolean;
  v_already_owner  boolean;
  v_enterprise_id  uuid;
  v_name           text;
  v_legal_name     text;
BEGIN

  -- Guard 1: caller must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  -- Guard 2: caller must exist in public.users
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_caller_id
  )
  INTO v_caller_exists;

  IF NOT v_caller_exists THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'user_not_found'
    );
  END IF;

  -- Guard 3: V1 bootstrap abuse control.
  -- One active owner membership per user in V1.
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_members em
    WHERE em.user_id = v_caller_id
      AND em.role = 'owner'
      AND em.status = 'active'
  )
  INTO v_already_owner;

  IF v_already_owner THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'already_owner'
    );
  END IF;

  -- Guard 4: validate and normalize account name.
  IF p_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_required'
    );
  END IF;

  v_name := pg_catalog.btrim(p_name);

  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_too_long'
    );
  END IF;

  -- Guard 5: validate and normalize legal_name if provided.
  IF p_legal_name IS NOT NULL THEN
    v_legal_name := pg_catalog.btrim(p_legal_name);

    IF pg_catalog.char_length(v_legal_name) < 1
       OR pg_catalog.char_length(v_legal_name) > 300
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'legal_name_invalid'
      );
    END IF;
  ELSE
    v_legal_name := NULL;
  END IF;

  -- Atomic account insert.
  INSERT INTO public.enterprise_accounts (
    name,
    legal_name,
    status
  )
  VALUES (
    v_name,
    v_legal_name,
    'active'
  )
  RETURNING id INTO v_enterprise_id;

  -- Atomic founding-owner membership insert.
  INSERT INTO public.enterprise_members (
    enterprise_id,
    user_id,
    role,
    status,
    invited_by
  )
  VALUES (
    v_enterprise_id,
    v_caller_id,
    'owner',
    'active',
    NULL
  );

  -- Audit only after both business rows exist.
  PERFORM fixeo_private._write_enterprise_audit_event(
    v_enterprise_id,
    'account.created',
    'enterprise_account',
    v_enterprise_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'legal_name', v_legal_name,
      'status', 'active'
    ),
    pg_catalog.jsonb_build_object(
      'founding_owner_user_id', v_caller_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', v_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      '[create_enterprise_account] unexpected error: %',
      SQLERRM;

    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — NEW update_enterprise_account() RPC
--
-- PURPOSE
--   Allow an active owner/admin to update enterprise account metadata only.
--
-- MUTABLE FIELDS
--   • name
--   • legal_name
--
-- IMMUTABLE THROUGH THIS RPC
--   • id
--   • status
--   • created_at
--   • updated_at (trigger-managed)
--
-- RETURN SHAPE
--   Success:
--     {"ok":true,"enterprise_id":"..."}
--
--   No-op:
--     {"ok":true,"reason":"no_change"}
--
--   Failure:
--     {"ok":false,"reason":"<code>"}
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_enterprise_account(
  p_enterprise_id uuid,
  p_name text,
  p_legal_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id       uuid;
  v_authorized      boolean;
  v_current_name    text;
  v_current_legal   text;
  v_current_status  text;
  v_name            text;
  v_legal_name      text;
BEGIN
  -- Guard 1: authenticated caller.
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  -- Guard 2: enterprise id required.
  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_required'
    );
  END IF;

  -- Guard 3: lock account and capture current state.
  SELECT
    ea.name,
    ea.legal_name,
    ea.status
  INTO
    v_current_name,
    v_current_legal,
    v_current_status
  FROM public.enterprise_accounts ea
  WHERE ea.id = p_enterprise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'enterprise_not_found'
    );
  END IF;

  -- Guard 4: active owner/admin authorization.
  SELECT fixeo_private._fixeo_is_enterprise_manager(
    p_enterprise_id
  )
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'forbidden'
    );
  END IF;

  -- Guard 5: validate and normalize name.
  IF p_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_required'
    );
  END IF;

  v_name := pg_catalog.btrim(p_name);

  IF pg_catalog.char_length(v_name) > 200 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'name_too_long'
    );
  END IF;

  -- Guard 6: legal_name may be NULL to clear it.
  IF p_legal_name IS NOT NULL THEN
    v_legal_name := pg_catalog.btrim(p_legal_name);

    IF pg_catalog.char_length(v_legal_name) < 1
       OR pg_catalog.char_length(v_legal_name) > 300
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', 'legal_name_invalid'
      );
    END IF;
  ELSE
    v_legal_name := NULL;
  END IF;

  -- Guard 7: semantic no-op.
  IF v_name IS NOT DISTINCT FROM v_current_name
     AND v_legal_name IS NOT DISTINCT FROM v_current_legal
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'reason', 'no_change'
    );
  END IF;

  -- Mutation. Status is intentionally untouched.
  UPDATE public.enterprise_accounts
  SET
    name = v_name,
    legal_name = v_legal_name
  WHERE id = p_enterprise_id;

  -- Transactional audit.
  PERFORM fixeo_private._write_enterprise_audit_event(
    p_enterprise_id,
    'account.updated',
    'enterprise_account',
    p_enterprise_id,
    pg_catalog.jsonb_build_object(
      'name', v_current_name,
      'legal_name', v_current_legal,
      'status', v_current_status
    ),
    pg_catalog.jsonb_build_object(
      'name', v_name,
      'legal_name', v_legal_name,
      'status', v_current_status
    ),
    '{}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', p_enterprise_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      '[update_enterprise_account] unexpected error: % (SQLSTATE: %)',
      SQLERRM,
      SQLSTATE;

    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;
$function$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — RPC EXECUTE CONTRACT
-- Public/anon denied; authenticated allowed.
-- ═════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE
ON FUNCTION public.create_enterprise_account(text,text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.create_enterprise_account(text,text)
TO authenticated;

REVOKE EXECUTE
ON FUNCTION public.update_enterprise_account(uuid,text,text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.update_enterprise_account(uuid,text,text)
TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — ENFORCE RPC-ONLY MUTATION ON enterprise_accounts
--
-- Production inventory showed authenticated had effective:
--   INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER
-- and column-level INSERT / UPDATE / REFERENCES on every account column.
--
-- Remove all direct mutation/control privileges while preserving SELECT.
-- ═════════════════════════════════════════════════════════════════════════════

REVOKE
  INSERT,
  UPDATE,
  DELETE,
  TRUNCATE,
  REFERENCES,
  TRIGGER
ON TABLE public.enterprise_accounts
FROM authenticated;

REVOKE INSERT (
  id,
  name,
  legal_name,
  status,
  created_at,
  updated_at
)
ON TABLE public.enterprise_accounts
FROM authenticated;

REVOKE UPDATE (
  id,
  name,
  legal_name,
  status,
  created_at,
  updated_at
)
ON TABLE public.enterprise_accounts
FROM authenticated;

REVOKE REFERENCES (
  id,
  name,
  legal_name,
  status,
  created_at,
  updated_at
)
ON TABLE public.enterprise_accounts
FROM authenticated;

-- Preserve authenticated read access; RLS remains authoritative.
GRANT SELECT
ON TABLE public.enterprise_accounts
TO authenticated;

-- Direct tenant UPDATE policy is no longer part of the mutation path.
DROP POLICY IF EXISTS ea_owner_update
ON public.enterprise_accounts;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — FINAL STATUS
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '7C.15A.5 Enterprise Account Control Plane — complete.';
  RAISE NOTICE '';
  RAISE NOTICE 'RPCs:';
  RAISE NOTICE '  create_enterprise_account() — preserved + audit wired';
  RAISE NOTICE '  update_enterprise_account() — NEW';
  RAISE NOTICE '';
  RAISE NOTICE 'Audit vocabulary added:';
  RAISE NOTICE '  account.created';
  RAISE NOTICE '  account.updated';
  RAISE NOTICE '  enterprise_account';
  RAISE NOTICE '';
  RAISE NOTICE 'enterprise_accounts authenticated access:';
  RAISE NOTICE '  SELECT preserved';
  RAISE NOTICE '  direct mutation/control privileges revoked';
  RAISE NOTICE '  ea_owner_update policy removed';
  RAISE NOTICE '';
  RAISE NOTICE 'Account status transitions: NOT IMPLEMENTED';
  RAISE NOTICE 'Physical DELETE: NOT IMPLEMENTED';
  RAISE NOTICE '';
  RAISE NOTICE 'Production migration complete.';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
END $$;

COMMIT;
