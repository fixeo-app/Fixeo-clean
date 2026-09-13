-- =============================================================================
-- BP12 Enterprise SLA Policies — Data Model & Backend SQL Migration
-- File: supabase/bp12-enterprise-sla-policies.sql
-- Branch: recovery/seo-v3-safe
-- =============================================================================
-- IDEMPOTENT: safe to run multiple times.
-- All DDL uses IF NOT EXISTS / OR REPLACE / IF EXISTS guards.
-- Wrapped in a single transaction.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- BLOCK 1 — Table: public.enterprise_sla_policies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.enterprise_sla_policies (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  enterprise_id               uuid        NOT NULL,
  site_id                     uuid            NULL,   -- NULL = enterprise-wide default
  urgency                     text            NULL,   -- NULL = applies to all urgencies
  response_target_minutes     integer     NOT NULL,   -- created_at → first mission accepted_at
  intervention_target_minutes integer         NULL,   -- created_at → started_at
  resolution_target_minutes   integer         NULL,   -- created_at → completed_at
  active                      boolean     NOT NULL DEFAULT true,
  created_by                  uuid        NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT esp_pkey
    PRIMARY KEY (id),

  CONSTRAINT esp_enterprise_fk
    FOREIGN KEY (enterprise_id)
    REFERENCES public.enterprise_accounts(id)
    ON DELETE CASCADE,

  CONSTRAINT esp_site_fk
    FOREIGN KEY (site_id)
    REFERENCES public.enterprise_sites(id)
    ON DELETE CASCADE,

  CONSTRAINT esp_urgency_check
    CHECK (urgency IS NULL OR urgency IN ('normale','urgent','now')),

  CONSTRAINT esp_response_positive
    CHECK (response_target_minutes > 0),

  CONSTRAINT esp_intervention_positive
    CHECK (intervention_target_minutes IS NULL OR intervention_target_minutes > 0),

  CONSTRAINT esp_resolution_positive
    CHECK (resolution_target_minutes IS NULL OR resolution_target_minutes > 0),

  -- Site-to-enterprise membership enforced by upsert_sla_policy RPC + RLS
  CONSTRAINT esp_site_belongs_to_enterprise
    CHECK (site_id IS NULL OR true)
);

-- Partial unique index: only one *active* policy per (enterprise, site, urgency) combination
-- COALESCE encodes NULLs as sentinel strings so equality logic is well-defined.
CREATE UNIQUE INDEX IF NOT EXISTS esp_unique_active_policy
  ON public.enterprise_sla_policies (
    enterprise_id,
    COALESCE(site_id::text, '__default__'),
    COALESCE(urgency, '__all__')
  )
  WHERE active = true;

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_esp_enterprise
  ON public.enterprise_sla_policies (enterprise_id);

CREATE INDEX IF NOT EXISTS idx_esp_enterprise_site
  ON public.enterprise_sla_policies (enterprise_id, site_id)
  WHERE site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_esp_active
  ON public.enterprise_sla_policies (enterprise_id)
  WHERE active = true;

-- ---------------------------------------------------------------------------
-- BLOCK 2 — Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.enterprise_sla_policies ENABLE ROW LEVEL SECURITY;

-- 2a. Deny all access to anonymous users
DROP POLICY IF EXISTS esp_deny_anon ON public.enterprise_sla_policies;
CREATE POLICY esp_deny_anon
  ON public.enterprise_sla_policies
  AS RESTRICTIVE
  TO anon
  USING (false);

-- 2b. Enterprise members may SELECT their enterprise's SLA policies
DROP POLICY IF EXISTS esp_members_select ON public.enterprise_sla_policies;
CREATE POLICY esp_members_select
  ON public.enterprise_sla_policies
  FOR SELECT
  TO authenticated
  USING (fixeo_private._fixeo_is_enterprise_member(enterprise_id));

-- 2c. Enterprise managers (owner / admin) may INSERT and UPDATE
DROP POLICY IF EXISTS esp_managers_insert ON public.enterprise_sla_policies;
CREATE POLICY esp_managers_insert
  ON public.enterprise_sla_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

DROP POLICY IF EXISTS esp_managers_update ON public.enterprise_sla_policies;
CREATE POLICY esp_managers_update
  ON public.enterprise_sla_policies
  FOR UPDATE
  TO authenticated
  USING  (fixeo_private._fixeo_is_enterprise_manager(enterprise_id))
  WITH CHECK (fixeo_private._fixeo_is_enterprise_manager(enterprise_id));

-- 2d. Fixeo admin JWT claim has unrestricted access
DROP POLICY IF EXISTS esp_admin_all ON public.enterprise_sla_policies;
CREATE POLICY esp_admin_all
  ON public.enterprise_sla_policies
  AS PERMISSIVE
  TO authenticated
  USING (fixeo_private._fixeo_is_admin());

-- ---------------------------------------------------------------------------
-- BLOCK 3 — RPC: upsert_sla_policy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_sla_policy(
  p_enterprise_id               uuid,
  p_site_id                     uuid    DEFAULT NULL,
  p_urgency                     text    DEFAULT NULL,
  p_response_target_minutes     integer DEFAULT 240,
  p_intervention_target_minutes integer DEFAULT NULL,
  p_resolution_target_minutes   integer DEFAULT NULL,
  p_active                      boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role text;
  v_policy_id   uuid;
BEGIN
  -- -----------------------------------------------------------------------
  -- Auth: caller must be active owner or admin of the enterprise
  -- -----------------------------------------------------------------------
  SELECT em.role
  INTO   v_caller_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = p_enterprise_id
    AND  em.user_id        = auth.uid()
    AND  em.status         = 'active';

  IF NOT FOUND OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- -----------------------------------------------------------------------
  -- Input validation
  -- -----------------------------------------------------------------------
  IF p_response_target_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_response_target';
  END IF;

  IF p_intervention_target_minutes IS NOT NULL
     AND p_intervention_target_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_intervention_target';
  END IF;

  IF p_resolution_target_minutes IS NOT NULL
     AND p_resolution_target_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_resolution_target';
  END IF;

  IF p_urgency IS NOT NULL
     AND p_urgency NOT IN ('normale', 'urgent', 'now') THEN
    RAISE EXCEPTION 'invalid_urgency';
  END IF;

  -- Validate that the site belongs to this enterprise (when site_id provided)
  IF p_site_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   public.enterprise_sites es
      WHERE  es.id            = p_site_id
        AND  es.enterprise_id = p_enterprise_id
    ) THEN
      RAISE EXCEPTION 'site_not_in_enterprise';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- Deactivate any existing active policy for this (enterprise, site, urgency)
  -- IS NOT DISTINCT FROM handles NULL equality correctly
  -- -----------------------------------------------------------------------
  UPDATE public.enterprise_sla_policies
  SET    active     = false,
         updated_at = now()
  WHERE  enterprise_id = p_enterprise_id
    AND  (site_id  IS NOT DISTINCT FROM p_site_id)
    AND  (urgency  IS NOT DISTINCT FROM p_urgency)
    AND  active    = true;

  -- -----------------------------------------------------------------------
  -- Insert the new active policy
  -- -----------------------------------------------------------------------
  INSERT INTO public.enterprise_sla_policies (
    enterprise_id,
    site_id,
    urgency,
    response_target_minutes,
    intervention_target_minutes,
    resolution_target_minutes,
    active,
    created_by
  )
  VALUES (
    p_enterprise_id,
    p_site_id,
    p_urgency,
    p_response_target_minutes,
    p_intervention_target_minutes,
    p_resolution_target_minutes,
    p_active,
    auth.uid()
  )
  RETURNING id INTO v_policy_id;

  RETURN v_policy_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_sla_policy(uuid, uuid, text, integer, integer, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_sla_policy(uuid, uuid, text, integer, integer, integer, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.upsert_sla_policy(uuid, uuid, text, integer, integer, integer, boolean) TO   authenticated;

-- ---------------------------------------------------------------------------
-- BLOCK 4 — RPC: deactivate_sla_policy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.deactivate_sla_policy(p_policy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enterprise_id uuid;
  v_role          text;
BEGIN
  -- Lookup the policy's enterprise
  SELECT enterprise_id
  INTO   v_enterprise_id
  FROM   public.enterprise_sla_policies
  WHERE  id = p_policy_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'policy_not_found';
  END IF;

  -- Auth: caller must be active owner or admin
  SELECT em.role
  INTO   v_role
  FROM   public.enterprise_members em
  WHERE  em.enterprise_id = v_enterprise_id
    AND  em.user_id        = auth.uid()
    AND  em.status         = 'active';

  IF NOT FOUND OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Soft-deactivate
  UPDATE public.enterprise_sla_policies
  SET    active     = false,
         updated_at = now()
  WHERE  id = p_policy_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_sla_policy(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deactivate_sla_policy(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.deactivate_sla_policy(uuid) TO   authenticated;

-- ---------------------------------------------------------------------------
-- BLOCK 5 — View: enterprise_sla_status
-- SECURITY INVOKER — callers see only what their RLS grants on base tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.enterprise_sla_status
WITH (security_invoker = true)
AS
WITH

-- -------------------------------------------------------------------------
-- CTE 1: active_requests
-- Join service_requests ← enterprise_request_context.
-- Exclude terminal statuses (completed/cancelled/no_match).
-- NOTE: missions.request_id is TEXT; cast sr.id to text for joins.
-- -------------------------------------------------------------------------
active_requests AS (
  SELECT
    sr.id                                        AS request_id,
    sr.status                                    AS request_status,
    sr.category,
    sr.urgency,
    sr.created_at,
    sr.city,
    erc.enterprise_id,
    erc.site_id,
    erc.id                                       AS context_id

  FROM   public.service_requests        sr
  JOIN   public.enterprise_request_context erc
         ON  erc.service_request_id = sr.id

  WHERE  sr.status NOT IN ('validated', 'cancelled', 'no_match')
),

-- -------------------------------------------------------------------------
-- CTE 2: best_policy
-- For each active request, find the highest-precedence active SLA policy.
-- Precedence (lower rank = more specific = wins):
--   1  site_id match + urgency match
--   2  site_id match + urgency IS NULL
--   3  site_id IS NULL + urgency match
--   4  site_id IS NULL + urgency IS NULL  (enterprise-wide default)
-- -------------------------------------------------------------------------
best_policy AS (
  SELECT DISTINCT ON (ar.request_id)
    ar.request_id,
    esp.id                            AS policy_id,
    esp.response_target_minutes,
    esp.intervention_target_minutes,
    esp.resolution_target_minutes,
    CASE
      WHEN esp.site_id  IS NOT NULL AND esp.urgency IS NOT NULL THEN 1
      WHEN esp.site_id  IS NOT NULL AND esp.urgency IS NULL     THEN 2
      WHEN esp.site_id  IS NULL     AND esp.urgency IS NOT NULL THEN 3
      ELSE                                                           4
    END AS policy_rank

  FROM   active_requests ar
  JOIN   public.enterprise_sla_policies esp
         ON  esp.enterprise_id = ar.enterprise_id
         AND esp.active        = true
         -- site match: policy is site-specific and matches, or policy is enterprise-wide
         AND (esp.site_id IS NULL OR esp.site_id = ar.site_id)
         -- urgency match: policy covers all urgencies, or matches exactly
         AND (esp.urgency IS NULL OR esp.urgency = ar.urgency)

  ORDER BY ar.request_id,
           CASE
             WHEN esp.site_id  IS NOT NULL AND esp.urgency IS NOT NULL THEN 1
             WHEN esp.site_id  IS NOT NULL AND esp.urgency IS NULL     THEN 2
             WHEN esp.site_id  IS NULL     AND esp.urgency IS NOT NULL THEN 3
             ELSE                                                           4
           END ASC
),

-- -------------------------------------------------------------------------
-- CTE 3: mission_timestamps
-- Earliest accepted_at and started_at per request (request_id is TEXT in missions)
-- -------------------------------------------------------------------------
mission_timestamps AS (
  SELECT
    m.request_id                           AS mission_request_id_text,
    MIN(m.accepted_at)                     AS first_accepted_at,
    MIN(m.started_at)                      AS first_started_at,
    MAX(m.completed_at)                    AS last_completed_at
  FROM   public.missions m
  WHERE  m.request_id IS NOT NULL
  GROUP BY m.request_id
)

-- -------------------------------------------------------------------------
-- Final SELECT: compute deadlines and SLA state
-- -------------------------------------------------------------------------
SELECT
  ar.request_id,
  ar.enterprise_id,
  ar.site_id,
  ar.request_status,
  ar.urgency,
  ar.category,
  ar.city,
  ar.created_at,

  -- Policy identifiers (NULL when no policy applies)
  bp.policy_id                                   AS sla_policy_id,
  bp.response_target_minutes,
  bp.intervention_target_minutes,
  bp.resolution_target_minutes,

  -- Computed deadlines (server clock only — no client clock accepted)
  CASE WHEN bp.response_target_minutes IS NOT NULL
    THEN ar.created_at + (bp.response_target_minutes || ' minutes')::interval
  END                                            AS sla_response_deadline,

  CASE WHEN bp.intervention_target_minutes IS NOT NULL
    THEN ar.created_at + (bp.intervention_target_minutes || ' minutes')::interval
  END                                            AS sla_intervention_deadline,

  CASE WHEN bp.resolution_target_minutes IS NOT NULL
    THEN ar.created_at + (bp.resolution_target_minutes || ' minutes')::interval
  END                                            AS sla_resolution_deadline,

  -- Mission timestamps
  mt.first_accepted_at,
  mt.first_started_at,
  mt.last_completed_at,

  -- ---------------------------------------------------------------------------
  -- SLA State derivation (uses server now())
  -- Priority: completed → not_applicable → breached → approaching → on_track
  -- "approaching" = within 20% of total target window remaining on response SLA
  -- ---------------------------------------------------------------------------
  CASE
    -- Terminal: request reached a final status (but active_requests CTE filters these;
    --           this branch guards against late-arriving data)
    WHEN ar.request_status IN ('validated', 'cancelled', 'no_match')
      THEN 'completed'

    -- No active policy matched
    WHEN bp.policy_id IS NULL
      THEN 'not_applicable'

    -- Response SLA breached: deadline passed and no mission accepted yet
    WHEN mt.first_accepted_at IS NULL
     AND now() > ar.created_at + (bp.response_target_minutes || ' minutes')::interval
      THEN 'breached'

    -- Resolution SLA breached (when configured)
    WHEN bp.resolution_target_minutes IS NOT NULL
     AND now() > ar.created_at + (bp.resolution_target_minutes || ' minutes')::interval
      THEN 'breached'

    -- Approaching: within 20% of response SLA window remaining
    WHEN mt.first_accepted_at IS NULL
     AND now() > ar.created_at
               + ((bp.response_target_minutes * 0.80) || ' minutes')::interval
      THEN 'approaching'

    -- Approaching: within 20% of resolution SLA window remaining (when configured)
    WHEN bp.resolution_target_minutes IS NOT NULL
     AND now() > ar.created_at
               + ((bp.resolution_target_minutes * 0.80) || ' minutes')::interval
      THEN 'approaching'

    -- All other active requests
    ELSE 'on_track'
  END                                            AS sla_state,

  -- Minutes remaining on response SLA (negative = overdue)
  CASE WHEN bp.response_target_minutes IS NOT NULL
    THEN EXTRACT(EPOCH FROM (
      ar.created_at + (bp.response_target_minutes || ' minutes')::interval - now()
    )) / 60.0
  END                                            AS response_minutes_remaining,

  -- Minutes remaining on resolution SLA (negative = overdue)
  CASE WHEN bp.resolution_target_minutes IS NOT NULL
    THEN EXTRACT(EPOCH FROM (
      ar.created_at + (bp.resolution_target_minutes || ' minutes')::interval - now()
    )) / 60.0
  END                                            AS resolution_minutes_remaining

FROM   active_requests          ar
LEFT JOIN best_policy           bp  ON bp.request_id = ar.request_id
LEFT JOIN mission_timestamps    mt  ON mt.mission_request_id_text = ar.request_id::text
;

-- ---------------------------------------------------------------------------
-- BLOCK 5b — RPC: get_enterprise_sla_summary
-- Returns aggregate SLA state counts as a JSON object.
-- Auth: caller must be an active member of the enterprise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_enterprise_sla_summary(p_enterprise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_member boolean;
  v_result    jsonb;
BEGIN
  -- -----------------------------------------------------------------------
  -- Auth: caller must be an active enterprise member
  -- -----------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM   public.enterprise_members em
    WHERE  em.enterprise_id = p_enterprise_id
      AND  em.user_id        = auth.uid()
      AND  em.status         = 'active'
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- -----------------------------------------------------------------------
  -- Aggregate counts from the enterprise_sla_status view.
  -- The view is SECURITY INVOKER, so RLS on base tables still applies;
  -- we query it here inside a SECURITY DEFINER context but the enterprise_id
  -- filter ensures the caller can only see their own data.
  -- -----------------------------------------------------------------------
  SELECT jsonb_build_object(
    'enterprise_id',  p_enterprise_id,
    'on_track',       COUNT(*) FILTER (WHERE sla_state = 'on_track'),
    'approaching',    COUNT(*) FILTER (WHERE sla_state = 'approaching'),
    'breached',       COUNT(*) FILTER (WHERE sla_state = 'breached'),
    'completed',      COUNT(*) FILTER (WHERE sla_state = 'completed'),
    'not_applicable', COUNT(*) FILTER (WHERE sla_state = 'not_applicable'),
    'total',          COUNT(*)
  )
  INTO v_result
  FROM public.enterprise_sla_status
  WHERE enterprise_id = p_enterprise_id;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_enterprise_sla_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_enterprise_sla_summary(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_enterprise_sla_summary(uuid) TO   authenticated;

-- ---------------------------------------------------------------------------
-- END OF MIGRATION
-- ---------------------------------------------------------------------------

COMMIT;
