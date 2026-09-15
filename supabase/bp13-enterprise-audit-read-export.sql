-- =============================================================================
-- FIXEO ENTERPRISE — BP13 — CORRECTED DRAFT v2
-- Enterprise Audit Read & Export Control
--
-- STATUS:
--   DRAFT — DO NOT APPLY TO PRODUCTION.
--
-- FROZEN CONTRACT:
--   * public.enterprise_audit_events remains the single audit source of truth.
--   * No second audit table and no historical backfill.
--   * Read/export authorization: active Enterprise owner/admin through the
--     canonical fixeo_private._fixeo_is_enterprise_manager(uuid) helper.
--   * Stable newest-first keyset pagination: created_at DESC, id DESC.
--   * Composite cursor: created_at + id.
--   * Filters: from, to, event_type, target_type, target_id, actor_user_id.
--   * RPCs are read-only, tenant-isolated, SECURITY DEFINER, postgres-owned,
--     search_path = ''.
--   * authenticated retains SELECT only on enterprise_audit_events; unnecessary
--     REFERENCES / TRIGGER / TRUNCATE grants are revoked.
--   * Existing indexes are reused; no new index is created.
--
-- IMPORTANT:
--   This file is a migration DRAFT for static review only.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Hardening: audit history is application-read-only for authenticated users.
-- -----------------------------------------------------------------------------

REVOKE REFERENCES, TRIGGER, TRUNCATE
ON TABLE public.enterprise_audit_events
FROM authenticated;

-- Preserve the already validated manager-scoped SELECT surface.
GRANT SELECT
ON TABLE public.enterprise_audit_events
TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Paginated audit reader
--
-- Cursor semantics for newest-first order:
--
--   ORDER BY created_at DESC, id DESC
--
-- A next-page cursor means:
--
--   (created_at, id) < (p_cursor_created_at, p_cursor_id)
--
-- Both cursor parts must be supplied together or both omitted.
-- p_from is inclusive; p_to is exclusive.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_enterprise_audit_events(
  p_enterprise_id uuid,
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_limit integer;
  v_event_type text;
  v_target_type text;
  v_rows jsonb;
  v_returned integer;
  v_has_more boolean;
  v_next_created_at timestamptz;
  v_next_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'enterprise_id_required';
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RAISE EXCEPTION 'enterprise_manager_required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  v_limit := p_limit;

  IF (p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor';
  END IF;

  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from >= p_to THEN
    RAISE EXCEPTION 'invalid_time_range';
  END IF;

  v_event_type := NULLIF(pg_catalog.btrim(p_event_type), '');
  v_target_type := NULLIF(pg_catalog.btrim(p_target_type), '');

  IF p_event_type IS NOT NULL AND v_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  IF p_target_type IS NOT NULL AND v_target_type IS NULL THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  IF v_event_type IS NOT NULL
     AND v_event_type <> ALL (ARRAY[
       'member.role_updated',
       'member.status_updated',
       'site.created',
       'site.updated',
       'site.status_updated',
       'request.created',
       'account.created',
       'account.updated',
       'member.invited',
       'member.invitation_accepted',
       'member.invitation_revoked',
       'member.invitation_expired',
       'account.status_updated',
       'account.ownership_transferred',
       'sla.policy_created',
       'sla.policy_updated',
       'sla.snapshot_created'
     ]::text[])
  THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  IF v_target_type IS NOT NULL
     AND v_target_type <> ALL (ARRAY[
       'enterprise_member',
       'enterprise_site',
       'service_request',
       'enterprise_account',
       'enterprise_invitation'
     ]::text[])
  THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT
      e.id,
      e.enterprise_id,
      e.actor_user_id,
      e.event_type,
      e.target_type,
      e.target_id,
      e.before_state,
      e.after_state,
      e.metadata,
      e.created_at
    FROM public.enterprise_audit_events e
    WHERE e.enterprise_id = p_enterprise_id
      AND (p_from IS NULL OR e.created_at >= p_from)
      AND (p_to IS NULL OR e.created_at < p_to)
      AND (v_event_type IS NULL OR e.event_type = v_event_type)
      AND (v_target_type IS NULL OR e.target_type = v_target_type)
      AND (p_target_id IS NULL OR e.target_id = p_target_id)
      AND (p_actor_user_id IS NULL OR e.actor_user_id = p_actor_user_id)
      AND (
        p_cursor_created_at IS NULL
        OR (e.created_at, e.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  ),
  page AS MATERIALIZED (
    SELECT *
    FROM candidate
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit
  ),
  stats AS (
    SELECT
      (SELECT count(*) FROM page)::integer AS returned_count,
      EXISTS(
        SELECT 1 FROM candidate OFFSET v_limit
      ) AS has_more
  ),
  last_row AS (
    SELECT created_at,id
    FROM page
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  )
  SELECT
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', p.id,
            'enterprise_id', p.enterprise_id,
            'actor_user_id', p.actor_user_id,
            'event_type', p.event_type,
            'target_type', p.target_type,
            'target_id', p.target_id,
            'before_state', p.before_state,
            'after_state', p.after_state,
            'metadata', p.metadata,
            'created_at', p.created_at
          )
          ORDER BY p.created_at DESC, p.id DESC
        )
        FROM page p
      ),
      '[]'::jsonb
    ),
    s.returned_count,
    s.has_more,
    CASE WHEN s.has_more THEN l.created_at ELSE NULL END,
    CASE WHEN s.has_more THEN l.id ELSE NULL END
  INTO
    v_rows,
    v_returned,
    v_has_more,
    v_next_created_at,
    v_next_id
  FROM stats s
  LEFT JOIN last_row l ON true;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ok',
    'events', v_rows,
    'returned_count', v_returned,
    'has_more', v_has_more,
    'next_cursor',
      CASE
        WHEN v_has_more THEN pg_catalog.jsonb_build_object(
          'created_at', v_next_created_at,
          'id', v_next_id
        )
        ELSE NULL
      END
  );
END;
$function$;

ALTER FUNCTION public.list_enterprise_audit_events(
  uuid, integer, timestamptz, uuid, timestamptz, timestamptz,
  text, text, uuid, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.list_enterprise_audit_events(
  uuid, integer, timestamptz, uuid, timestamptz, timestamptz,
  text, text, uuid, uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.list_enterprise_audit_events(
  uuid, integer, timestamptz, uuid, timestamptz, timestamptz,
  text, text, uuid, uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.list_enterprise_audit_events(
  uuid, integer, timestamptz, uuid, timestamptz, timestamptz,
  text, text, uuid, uuid
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Bounded audit export
--
-- Same authorization and filters as the list RPC.
-- This returns a JSONB export payload; formatting into CSV/XLSX belongs outside
-- the database. Export is intentionally bounded to protect production.
-- p_from inclusive; p_to exclusive.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.export_enterprise_audit_events(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_limit integer;
  v_event_type text;
  v_target_type text;
  v_rows jsonb;
  v_returned integer;
  v_truncated boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'enterprise_id_required';
  END IF;

  IF NOT fixeo_private._fixeo_is_enterprise_manager(p_enterprise_id) THEN
    RAISE EXCEPTION 'enterprise_manager_required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  v_limit := p_limit;

  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from >= p_to THEN
    RAISE EXCEPTION 'invalid_time_range';
  END IF;

  v_event_type := NULLIF(pg_catalog.btrim(p_event_type), '');
  v_target_type := NULLIF(pg_catalog.btrim(p_target_type), '');

  IF p_event_type IS NOT NULL AND v_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  IF p_target_type IS NOT NULL AND v_target_type IS NULL THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  IF v_event_type IS NOT NULL
     AND v_event_type <> ALL (ARRAY[
       'member.role_updated',
       'member.status_updated',
       'site.created',
       'site.updated',
       'site.status_updated',
       'request.created',
       'account.created',
       'account.updated',
       'member.invited',
       'member.invitation_accepted',
       'member.invitation_revoked',
       'member.invitation_expired',
       'account.status_updated',
       'account.ownership_transferred',
       'sla.policy_created',
       'sla.policy_updated',
       'sla.snapshot_created'
     ]::text[])
  THEN
    RAISE EXCEPTION 'invalid_event_type';
  END IF;

  IF v_target_type IS NOT NULL
     AND v_target_type <> ALL (ARRAY[
       'enterprise_member',
       'enterprise_site',
       'service_request',
       'enterprise_account',
       'enterprise_invitation'
     ]::text[])
  THEN
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT
      e.id,
      e.enterprise_id,
      e.actor_user_id,
      e.event_type,
      e.target_type,
      e.target_id,
      e.before_state,
      e.after_state,
      e.metadata,
      e.created_at
    FROM public.enterprise_audit_events e
    WHERE e.enterprise_id = p_enterprise_id
      AND (p_from IS NULL OR e.created_at >= p_from)
      AND (p_to IS NULL OR e.created_at < p_to)
      AND (v_event_type IS NULL OR e.event_type = v_event_type)
      AND (v_target_type IS NULL OR e.target_type = v_target_type)
      AND (p_target_id IS NULL OR e.target_id = p_target_id)
      AND (p_actor_user_id IS NULL OR e.actor_user_id = p_actor_user_id)
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT (v_limit + 1)
  ),
  export_rows AS MATERIALIZED (
    SELECT *
    FROM candidate
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit
  )
  SELECT
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', x.id,
            'enterprise_id', x.enterprise_id,
            'actor_user_id', x.actor_user_id,
            'event_type', x.event_type,
            'target_type', x.target_type,
            'target_id', x.target_id,
            'before_state', x.before_state,
            'after_state', x.after_state,
            'metadata', x.metadata,
            'created_at', x.created_at
          )
          ORDER BY x.created_at DESC, x.id DESC
        )
        FROM export_rows x
      ),
      '[]'::jsonb
    ),
    (SELECT count(*)::integer FROM export_rows),
    EXISTS(SELECT 1 FROM candidate OFFSET v_limit)
  INTO v_rows,v_returned,v_truncated;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ok',
    'events', v_rows,
    'returned_count', v_returned,
    'truncated', v_truncated
  );
END;
$function$;

ALTER FUNCTION public.export_enterprise_audit_events(
  uuid, timestamptz, timestamptz, text, text, uuid, uuid, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.export_enterprise_audit_events(
  uuid, timestamptz, timestamptz, text, text, uuid, uuid, integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.export_enterprise_audit_events(
  uuid, timestamptz, timestamptz, text, text, uuid, uuid, integer
) FROM anon;

GRANT EXECUTE ON FUNCTION public.export_enterprise_audit_events(
  uuid, timestamptz, timestamptz, text, text, uuid, uuid, integer
) TO authenticated;

COMMIT;

-- =============================================================================
-- END BP13 — CORRECTED DRAFT v2 — DO NOT APPLY TO PRODUCTION
-- =============================================================================
