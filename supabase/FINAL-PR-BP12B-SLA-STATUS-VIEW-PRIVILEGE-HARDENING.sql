-- =============================================================================
-- FIXEO ENTERPRISE — FINAL-PR-BP12B
-- enterprise_sla_status View Privilege Hardening
--
-- PURPOSE:
--   Reduce authenticated/service_role privileges on the derived BP12 SLA status
--   view to the minimum required contract: SELECT only.
--
-- VERIFIED PRODUCTION BASELINE:
--   * public.enterprise_sla_status exists and is a VIEW.
--   * View owner is postgres.
--   * security_invoker=true.
--   * View is not updatable / insertable.
--   * No INSTEAD OF trigger mutation path exists.
--   * No dependent PostgreSQL view was found.
--   * No PostgreSQL function definition references enterprise_sla_status.
--   * authenticated currently has:
--       SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--       REFERENCES, TRIGGER, MAINTAIN.
--   * service_role currently has the same privileges.
--   * All grants are direct, non-grantable grants from postgres.
--
-- TARGET CONTRACT:
--   * authenticated: SELECT only.
--   * service_role:  SELECT only.
--   * postgres:      unchanged.
--   * View definition: unchanged.
--   * No data mutation.
--
-- IMPORTANT:
--   This migration does NOT change the BP12 SLA lifecycle, RLS, SLA snapshots,
--   SLA policies, RPCs, dispatch, notifications, or Enterprise request flow.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PRECONDITION 01
-- Target must exist and must still be a normal PostgreSQL view.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_relkind "char";
BEGIN
  SELECT c.relkind
    INTO v_relkind
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enterprise_sla_status';

  IF v_relkind IS DISTINCT FROM 'v'::"char" THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B precondition failed: enterprise_sla_status is missing or is not a view';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- PRECONDITION 02
-- Owner must remain postgres.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enterprise_sla_status';

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B precondition failed: unexpected view owner: %',
      v_owner;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- PRECONDITION 03
-- The view must remain security_invoker=true.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_security_invoker boolean;
BEGIN
  SELECT COALESCE(
    'security_invoker=true' = ANY(c.reloptions),
    false
  )
    INTO v_security_invoker
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enterprise_sla_status';

  IF v_security_invoker IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B precondition failed: security_invoker=true is not installed';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- PRECONDITION 04
-- authenticated baseline must still contain the exact effective privileges
-- that were verified before this migration.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_select boolean;
  v_insert boolean;
  v_update boolean;
  v_delete boolean;
  v_truncate boolean;
  v_references boolean;
  v_trigger boolean;
  v_maintain boolean;
BEGIN
  v_select :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'SELECT'
    );

  v_insert :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'INSERT'
    );

  v_update :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'UPDATE'
    );

  v_delete :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'DELETE'
    );

  v_truncate :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'TRUNCATE'
    );

  v_references :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'REFERENCES'
    );

  v_trigger :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'TRIGGER'
    );

  v_maintain :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.enterprise_sla_status',
      'MAINTAIN'
    );

  IF NOT (
    v_select
    AND v_insert
    AND v_update
    AND v_delete
    AND v_truncate
    AND v_references
    AND v_trigger
    AND v_maintain
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B precondition failed: authenticated privilege baseline changed';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- PRECONDITION 05
-- service_role baseline must also remain exactly as verified.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_select boolean;
  v_insert boolean;
  v_update boolean;
  v_delete boolean;
  v_truncate boolean;
  v_references boolean;
  v_trigger boolean;
  v_maintain boolean;
BEGIN
  v_select :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'SELECT'
    );

  v_insert :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'INSERT'
    );

  v_update :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'UPDATE'
    );

  v_delete :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'DELETE'
    );

  v_truncate :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'TRUNCATE'
    );

  v_references :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'REFERENCES'
    );

  v_trigger :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'TRIGGER'
    );

  v_maintain :=
    pg_catalog.has_table_privilege(
      'service_role',
      'public.enterprise_sla_status',
      'MAINTAIN'
    );

  IF NOT (
    v_select
    AND v_insert
    AND v_update
    AND v_delete
    AND v_truncate
    AND v_references
    AND v_trigger
    AND v_maintain
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B precondition failed: service_role privilege baseline changed';
  END IF;
END;
$$;

-- =============================================================================
-- ONLY PRODUCTION MUTATION
-- =============================================================================

REVOKE
  INSERT,
  UPDATE,
  DELETE,
  TRUNCATE,
  REFERENCES,
  TRIGGER,
  MAINTAIN
ON TABLE public.enterprise_sla_status
FROM authenticated, service_role;

-- =============================================================================
-- POSTCONDITIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- POSTCONDITION 01
-- authenticated must retain SELECT and nothing from the revoked privilege set.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.enterprise_sla_status',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B postcondition failed: authenticated SELECT was lost';
  END IF;

  IF pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.enterprise_sla_status',
       'MAINTAIN'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B postcondition failed: authenticated retains excessive privileges';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- POSTCONDITION 02
-- service_role must retain SELECT and nothing from the revoked privilege set.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT pg_catalog.has_table_privilege(
    'service_role',
    'public.enterprise_sla_status',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B postcondition failed: service_role SELECT was lost';
  END IF;

  IF pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'service_role',
       'public.enterprise_sla_status',
       'MAINTAIN'
     )
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B postcondition failed: service_role retains excessive privileges';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- POSTCONDITION 03
-- Core view invariants must still hold.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_owner text;
  v_security_invoker boolean;
BEGIN
  SELECT
    pg_catalog.pg_get_userbyid(c.relowner),
    COALESCE('security_invoker=true' = ANY(c.reloptions), false)
  INTO
    v_owner,
    v_security_invoker
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'enterprise_sla_status'
    AND c.relkind = 'v';

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_invoker IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION
      'FINAL-PR-BP12B postcondition failed: view invariants changed';
  END IF;
END;
$$;

COMMIT;
