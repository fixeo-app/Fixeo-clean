-- bp13-enterprise-escalations.sql
-- BP13 Enterprise Escalation & Incident Control
-- Depends on: 7c13a1, 7c13a2, 7c13a3, 7c15a1, 7c15a3, 7c15a6, bp12-enterprise-sla-policies.sql
-- (7c15a4 is HOLD — no dependency)
-- Does NOT require BP09/BP10/BP12 to be deployed to production.
-- Local development ordering: apply all prior migrations first.
-- NOTE: reopen is explicitly NOT implemented. An escalation may be
--       resolved and a new escalation opened for the same request
--       if the situation recurs. This avoids lifecycle ambiguity.

BEGIN;

-- ============================================================================
-- BLOCK 1 — Table: public.enterprise_escalations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.enterprise_escalations (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id        uuid        NOT NULL,
  service_request_id   uuid        NOT NULL,   -- FK → public.service_requests(id)
  site_id              uuid            NULL,   -- denormalized from ERC for RLS; validated on insert
  severity             text        NOT NULL,
  reason_code          text        NOT NULL,
  status               text        NOT NULL DEFAULT 'open',
  assigned_to          uuid            NULL,   -- FK → public.users(id) — optional
  opened_by            uuid        NOT NULL,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  acknowledged_by      uuid            NULL,
  acknowledged_at      timestamptz     NULL,
  resolved_by          uuid            NULL,
  resolved_at          timestamptz     NULL,
  resolution_note      text            NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ee_pkey PRIMARY KEY (id),

  CONSTRAINT ee_enterprise_fk
    FOREIGN KEY (enterprise_id) REFERENCES public.enterprise_accounts(id) ON DELETE CASCADE,

  CONSTRAINT ee_service_request_fk
    FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE RESTRICT,

  CONSTRAINT ee_site_fk
    FOREIGN KEY (site_id) REFERENCES public.enterprise_sites(id) ON DELETE SET NULL,

  CONSTRAINT ee_opened_by_fk
    FOREIGN KEY (opened_by) REFERENCES public.users(id) ON DELETE RESTRICT,

  CONSTRAINT ee_acknowledged_by_fk
    FOREIGN KEY (acknowledged_by) REFERENCES public.users(id) ON DELETE RESTRICT,

  CONSTRAINT ee_resolved_by_fk
    FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE RESTRICT,

  CONSTRAINT ee_severity_check
    CHECK (severity IN ('critical','high','medium','low')),

  CONSTRAINT ee_reason_code_check
    CHECK (reason_code IN ('sla_breached','sla_approaching','urgent_unassigned','mission_stalled','manual')),

  CONSTRAINT ee_status_check
    CHECK (status IN ('open','acknowledged','resolved')),

  CONSTRAINT ee_resolution_requires_note
    CHECK (status != 'resolved' OR resolution_note IS NOT NULL),

  CONSTRAINT ee_ack_timestamps_consistent
    CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL)),

  CONSTRAINT ee_resolved_timestamps_consistent
    CHECK ((resolved_by IS NULL) = (resolved_at IS NULL))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ee_enterprise
  ON public.enterprise_escalations (enterprise_id);

CREATE INDEX IF NOT EXISTS idx_ee_enterprise_status
  ON public.enterprise_escalations (enterprise_id, status)
  WHERE status != 'resolved';

CREATE INDEX IF NOT EXISTS idx_ee_service_request
  ON public.enterprise_escalations (service_request_id);

CREATE INDEX IF NOT EXISTS idx_ee_enterprise_site
  ON public.enterprise_escalations (enterprise_id, site_id)
  WHERE site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ee_opened_at
  ON public.enterprise_escalations (enterprise_id, opened_at DESC);

-- Partial unique index: prevent duplicate active escalation for same (enterprise, request, reason_code).
-- Resolved escalations are excluded so the same request can be re-escalated after resolution.
CREATE UNIQUE INDEX IF NOT EXISTS ee_unique_active_escalation
  ON public.enterprise_escalations (enterprise_id, service_request_id, reason_code)
  WHERE status IN ('open', 'acknowledged');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._ee_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ee_updated_at ON public.enterprise_escalations;
CREATE TRIGGER ee_updated_at
  BEFORE UPDATE ON public.enterprise_escalations
  FOR EACH ROW EXECUTE FUNCTION public._ee_set_updated_at();

-- ============================================================================
-- BLOCK 2 — RLS
-- ============================================================================

ALTER TABLE public.enterprise_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_escalations FORCE ROW LEVEL SECURITY;

-- 1. Deny all access to anon
DROP POLICY IF EXISTS ee_deny_anon ON public.enterprise_escalations;
CREATE POLICY ee_deny_anon
  ON public.enterprise_escalations
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false);

-- 2. Members can SELECT their enterprise's escalations.
--    site_managers are scoped to their assigned sites only.
DROP POLICY IF EXISTS ee_members_select ON public.enterprise_escalations;
CREATE POLICY ee_members_select
  ON public.enterprise_escalations
  FOR SELECT
  TO authenticated
  USING (
    fixeo_private._fixeo_is_enterprise_member(enterprise_id)
    AND (
      -- Non-site_managers see all escalations in their enterprise
      (SELECT em.role FROM public.enterprise_members em
       WHERE em.enterprise_id = enterprise_escalations.enterprise_id
         AND em.user_id = auth.uid()
         AND em.status = 'active'
       LIMIT 1) NOT IN ('site_manager')
      OR
      -- site_managers see only escalations for their assigned sites
      (site_id IS NULL OR site_id = ANY(
        fixeo_private._fixeo_get_site_manager_site_ids(enterprise_id)
      ))
    )
  );

-- 3. Operators (owner/admin/ops_mgr/site_mgr) can INSERT
DROP POLICY IF EXISTS ee_operators_insert ON public.enterprise_escalations;
CREATE POLICY ee_operators_insert
  ON public.enterprise_escalations
  FOR INSERT
  TO authenticated
  WITH CHECK (fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

-- 4. Operators can UPDATE
DROP POLICY IF EXISTS ee_operators_update ON public.enterprise_escalations;
CREATE POLICY ee_operators_update
  ON public.enterprise_escalations
  FOR UPDATE
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_manager(enterprise_id))
  WITH CHECK (fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

-- 5. fixeo_admin has full access
DROP POLICY IF EXISTS ee_admin_all ON public.enterprise_escalations;
CREATE POLICY ee_admin_all
  ON public.enterprise_escalations
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (fixeo_private._fixeo_is_admin());

-- ============================================================================
-- BLOCK 3 — RPC: open_escalation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_escalation(
  p_enterprise_id      uuid,
  p_service_request_id uuid,
  p_severity           text,
  p_reason_code        text,
  p_resolution_note    text DEFAULT NULL  -- ignored on open, but accepted for API consistency
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role          text;
  v_site_id       uuid;
  v_escalation_id uuid;
BEGIN
  -- Auth: caller must be active manager-level member
  SELECT em.role INTO v_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = p_enterprise_id
    AND  em.user_id       = auth.uid()
    AND  em.status        = 'active';

  IF NOT FOUND OR v_role NOT IN ('owner','admin','operations_manager','site_manager') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Validate severity and reason_code
  IF p_severity NOT IN ('critical','high','medium','low') THEN
    RAISE EXCEPTION 'invalid_severity';
  END IF;
  IF p_reason_code NOT IN ('sla_breached','sla_approaching','urgent_unassigned','mission_stalled','manual') THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;

  -- Validate service_request belongs to this enterprise via enterprise_request_context.
  -- enterprise_request_context is the SOLE enterprise linkage for requests.
  SELECT erc.site_id INTO v_site_id
  FROM   public.enterprise_request_context erc
  WHERE  erc.service_request_id = p_service_request_id
    AND  erc.enterprise_id      = p_enterprise_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_in_enterprise';
  END IF;

  -- site_manager: validate the request's site is among their assigned sites
  IF v_role = 'site_manager' THEN
    IF v_site_id IS NULL OR NOT (v_site_id = ANY(
      fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)
    )) THEN
      RAISE EXCEPTION 'site_not_assigned';
    END IF;
  END IF;

  -- Insert (partial unique index ee_unique_active_escalation prevents duplicate
  -- active escalation for same enterprise + request + reason_code)
  INSERT INTO public.enterprise_escalations
    (enterprise_id, service_request_id, site_id, severity, reason_code, status, opened_by)
  VALUES
    (p_enterprise_id, p_service_request_id, v_site_id, p_severity, p_reason_code, 'open', auth.uid())
  RETURNING id INTO v_escalation_id;

  -- Audit (via _eal_append helper — canonical contract)
  -- target_type = 'enterprise_escalation' (NOT NULL required)
  -- target_id   = v_escalation_id (the new escalation row uuid)
  -- metadata    = jsonb context (canonical column, not 'details')
  PERFORM fixeo_private._eal_append(
    p_enterprise_id,
    auth.uid(),
    'escalation_opened',
    'enterprise_escalation',
    v_escalation_id,
    jsonb_build_object(
      'severity',           p_severity,
      'reason_code',        p_reason_code,
      'service_request_id', p_service_request_id
    )
  );

  RETURN v_escalation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_escalation(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.open_escalation(uuid, uuid, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.open_escalation(uuid, uuid, text, text, text) TO   authenticated;

-- ============================================================================
-- BLOCK 4 — RPC: acknowledge_escalation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acknowledge_escalation(
  p_escalation_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enterprise_id uuid;
  v_role          text;
  v_updated       integer;
BEGIN
  -- Resolve enterprise_id for auth check
  SELECT ee.enterprise_id INTO v_enterprise_id
  FROM   public.enterprise_escalations ee
  WHERE  ee.id = p_escalation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'escalation_not_found';
  END IF;

  -- Auth: caller must be active manager-level member
  SELECT em.role INTO v_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = v_enterprise_id
    AND  em.user_id       = auth.uid()
    AND  em.status        = 'active';

  IF NOT FOUND OR v_role NOT IN ('owner','admin','operations_manager','site_manager') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Concurrent-safe update: predicate on status = 'open' prevents double-acknowledge race
  UPDATE public.enterprise_escalations
  SET
    status          = 'acknowledged',
    acknowledged_by = auth.uid(),
    acknowledged_at = now()
  WHERE id     = p_escalation_id
    AND status = 'open';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'escalation_not_open';
  END IF;

  -- Audit (via _eal_append helper — canonical contract)
  -- target_type = 'enterprise_escalation' (NOT NULL required)
  -- target_id   = p_escalation_id
  -- metadata    = jsonb context (canonical column, not 'details')
  PERFORM fixeo_private._eal_append(
    v_enterprise_id,
    auth.uid(),
    'escalation_acknowledged',
    'enterprise_escalation',
    p_escalation_id,
    jsonb_build_object('escalation_id', p_escalation_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_escalation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acknowledge_escalation(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.acknowledge_escalation(uuid) TO   authenticated;

-- ============================================================================
-- BLOCK 5 — RPC: resolve_escalation
-- ============================================================================
-- NOTE: reopen is explicitly NOT implemented.
--       To re-escalate a resolved incident, open a new escalation.
--       This avoids lifecycle ambiguity (e.g. re-opened vs new open, audit trail forking).

CREATE OR REPLACE FUNCTION public.resolve_escalation(
  p_escalation_id  uuid,
  p_resolution_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enterprise_id uuid;
  v_role          text;
  v_updated       integer;
BEGIN
  -- resolution_note is required and must be non-empty
  IF p_resolution_note IS NULL OR length(trim(p_resolution_note)) = 0 THEN
    RAISE EXCEPTION 'resolution_note_required';
  END IF;

  -- Resolve enterprise_id for auth check
  SELECT ee.enterprise_id INTO v_enterprise_id
  FROM   public.enterprise_escalations ee
  WHERE  ee.id = p_escalation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'escalation_not_found';
  END IF;

  -- Auth: caller must be active manager-level member
  SELECT em.role INTO v_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = v_enterprise_id
    AND  em.user_id       = auth.uid()
    AND  em.status        = 'active';

  IF NOT FOUND OR v_role NOT IN ('owner','admin','operations_manager','site_manager') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Concurrent-safe update: predicate on status IN ('open','acknowledged') prevents
  -- resolving an already-resolved escalation.
  -- NOTE: reopen is explicitly NOT implemented. Open a new escalation instead.
  UPDATE public.enterprise_escalations
  SET
    status          = 'resolved',
    resolved_by     = auth.uid(),
    resolved_at     = now(),
    resolution_note = p_resolution_note
  WHERE id     = p_escalation_id
    AND status IN ('open', 'acknowledged');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'escalation_already_resolved';
  END IF;

  -- Audit (via _eal_append helper — canonical contract)
  -- target_type = 'enterprise_escalation' (NOT NULL required)
  -- target_id   = p_escalation_id
  -- metadata    = jsonb context (canonical column, not 'details')
  PERFORM fixeo_private._eal_append(
    v_enterprise_id,
    auth.uid(),
    'escalation_resolved',
    'enterprise_escalation',
    p_escalation_id,
    jsonb_build_object(
      'escalation_id',   p_escalation_id,
      'resolution_note', p_resolution_note
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_escalation(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_escalation(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resolve_escalation(uuid, text) TO   authenticated;

-- ============================================================================
-- BLOCK 6 — eal_action_type_check extension
-- ============================================================================
-- Preserve ALL existing action_type values from 7c15a9 (most recent extension = BP10).
-- Existing values: member_role_changed, member_status_changed, site_updated, site_status_changed,
--                  account_profile_updated, invitation_created, invitation_revoked, invitation_accepted
-- New values added by BP13: escalation_opened, escalation_acknowledged, escalation_resolved

ALTER TABLE public.enterprise_audit_log
  DROP CONSTRAINT IF EXISTS eal_action_type_check;

ALTER TABLE public.enterprise_audit_log
  ADD CONSTRAINT eal_action_type_check CHECK (
    action_type IN (
      'member_role_changed',
      'member_status_changed',
      'site_updated',
      'site_status_changed',
      'account_profile_updated',
      'invitation_created',
      'invitation_revoked',
      'invitation_accepted',
      'escalation_opened',
      'escalation_acknowledged',
      'escalation_resolved'
    )
  );

-- ============================================================================
-- BLOCK 7 — View: enterprise_escalation_summary
-- ============================================================================
-- SECURITY INVOKER: callers see only what their RLS allows on the base tables.
-- LEFT JOIN on enterprise_sla_status is null-safe if BP12 is not yet deployed.

CREATE OR REPLACE VIEW public.enterprise_escalation_summary
WITH (security_invoker = true)
AS
SELECT
  -- Escalation core fields
  ee.id,
  ee.enterprise_id,
  ee.service_request_id,
  ee.site_id,
  ee.severity,
  ee.reason_code,
  ee.status,
  ee.assigned_to,
  ee.opened_by,
  ee.opened_at,
  ee.acknowledged_by,
  ee.acknowledged_at,
  ee.resolved_by,
  ee.resolved_at,
  ee.resolution_note,
  ee.created_at,
  ee.updated_at,

  -- Service request status (from service_requests)
  sr.status AS sr_status,

  -- Site name (from enterprise_sites)
  es.name AS site_name,

  -- SLA state (from enterprise_sla_status, LEFT JOIN — null-safe if BP12 not deployed)
  ess.sla_state

FROM public.enterprise_escalations ee

-- Join to service_requests for sr_status
JOIN public.service_requests sr
  ON sr.id = ee.service_request_id

-- Join to enterprise_sites for site_name
LEFT JOIN public.enterprise_sites es
  ON es.id = ee.site_id

-- LEFT JOIN enterprise_sla_status — safe if BP12 not yet deployed
LEFT JOIN public.enterprise_sla_status ess
  ON ess.service_request_id = ee.service_request_id
 AND ess.enterprise_id      = ee.enterprise_id;

-- ============================================================================
-- BLOCK 8 — RPC: list_enterprise_escalations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_enterprise_escalations(
  p_enterprise_id uuid,
  p_status        text    DEFAULT NULL,  -- NULL = all statuses
  p_severity      text    DEFAULT NULL,  -- NULL = all severities
  p_site_id       uuid    DEFAULT NULL,  -- NULL = all sites (site_manager filtered by RLS)
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
) RETURNS SETOF public.enterprise_escalation_summary
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Auth: caller must be an active member of this enterprise
  IF NOT fixeo_private._fixeo_is_enterprise_member(p_enterprise_id) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Validate p_status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('open','acknowledged','resolved') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Validate p_severity if provided
  IF p_severity IS NOT NULL AND p_severity NOT IN ('critical','high','medium','low') THEN
    RAISE EXCEPTION 'invalid_severity';
  END IF;

  -- Clamp pagination to safe bounds
  p_limit  := LEAST(GREATEST(COALESCE(p_limit,  50),  1), 200);
  p_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- Return via SECURITY INVOKER view; RLS on enterprise_escalations applies.
  RETURN QUERY
  SELECT s.*
  FROM   public.enterprise_escalation_summary s
  WHERE  s.enterprise_id = p_enterprise_id
    AND  (p_status   IS NULL OR s.status   = p_status)
    AND  (p_severity IS NULL OR s.severity = p_severity)
    AND  (p_site_id  IS NULL OR s.site_id  = p_site_id)
  ORDER BY s.opened_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_enterprise_escalations(uuid, text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_enterprise_escalations(uuid, text, text, uuid, integer, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_enterprise_escalations(uuid, text, text, uuid, integer, integer) TO   authenticated;

COMMIT;
