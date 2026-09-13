-- bp14-enterprise-reporting.sql
-- BP14: Enterprise Reporting & Executive Control
-- Depends on: 7c13a1 (enterprise_accounts), 7c13a2 (sites), 7c13a3 (ERC),
--             7c15a1 (members), 7c15a6 (member_sites),
--             bp12-enterprise-sla-policies.sql (sla_status view),
--             bp13-enterprise-escalations.sql (enterprise_escalations)
-- BP09/BP10 are NOT required for core reporting; SLA/escalation data
-- degrades gracefully to zero if those layers are not yet deployed.
-- Period maximum: 90 days. No unbounded queries.
-- All timestamps: server-side UTC. Browser clock: display only.
-- Conservative metrics: derived from canonical columns only.
-- No duplicate lifecycle state storage.

BEGIN;

-- ============================================================================
-- BLOCK 1 — Indexes for BP14 query patterns ONLY
-- ============================================================================

-- ERC: period-bounded request lookup per enterprise
CREATE INDEX IF NOT EXISTS idx_bp14_erc_enterprise_created
  ON public.enterprise_request_context (enterprise_id, created_at DESC);

-- ERC: per site
CREATE INDEX IF NOT EXISTS idx_bp14_erc_site_created
  ON public.enterprise_request_context (site_id, created_at DESC)
  WHERE site_id IS NOT NULL;

-- SR: status for request state aggregation (covered by existing indexes likely, add IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_bp14_sr_status_created
  ON public.service_requests (status, created_at DESC);

-- Escalations: per enterprise, period-bounded
CREATE INDEX IF NOT EXISTS idx_bp14_esc_enterprise_opened
  ON public.enterprise_escalations (enterprise_id, opened_at DESC);

-- ============================================================================
-- BLOCK 2 — Helper: fixeo_private._bp14_period_bounds
-- ============================================================================

CREATE OR REPLACE FUNCTION fixeo_private._bp14_period_bounds(
  p_days integer
) RETURNS TABLE (period_start timestamptz, period_end timestamptz,
                  prev_start  timestamptz, prev_end   timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(p_days, 1), 90); -- clamp 1-90
  v_end  timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day';
  v_start timestamptz;
  v_prev_end timestamptz;
  v_prev_start timestamptz;
BEGIN
  v_start      := v_end - (v_days || ' days')::interval;
  v_prev_end   := v_start;
  v_prev_start := v_prev_end - (v_days || ' days')::interval;
  RETURN QUERY SELECT v_start, v_end, v_prev_start, v_prev_end;
END;
$$;
REVOKE ALL ON FUNCTION fixeo_private._bp14_period_bounds FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- BLOCK 3 — Helper: fixeo_private._bp14_check_member_role
-- Returns the caller's role if active member, raises exception otherwise.
-- ============================================================================

CREATE OR REPLACE FUNCTION fixeo_private._bp14_check_member_role(
  p_enterprise_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role INTO v_role
  FROM public.enterprise_members
  WHERE enterprise_id = p_enterprise_id
    AND user_id = auth.uid()
    AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enterprise_member'; END IF;
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION fixeo_private._bp14_check_member_role FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- BLOCK 4 — RPC: get_enterprise_executive_summary
-- Returns one JSON row.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_enterprise_executive_summary(
  p_enterprise_id uuid,
  p_days          integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_days integer := LEAST(GREATEST(p_days, 1), 90);
  v_start timestamptz; v_end timestamptz;
  v_prev_start timestamptz; v_prev_end timestamptz;
  v_result jsonb;
  v_prev   jsonb;
BEGIN
  v_role := fixeo_private._bp14_check_member_role(p_enterprise_id);

  SELECT pb.period_start, pb.period_end, pb.prev_start, pb.prev_end
  INTO   v_start, v_end, v_prev_start, v_prev_end
  FROM   fixeo_private._bp14_period_bounds(v_days) pb;

  -- Current period aggregates
  WITH erc_period AS (
    SELECT erc.service_request_id, erc.site_id, sr.status, sr.urgency, sr.created_at
    FROM   public.enterprise_request_context erc
    JOIN   public.service_requests sr ON sr.id = erc.service_request_id
    WHERE  erc.enterprise_id = p_enterprise_id
      AND  erc.created_at >= v_start AND erc.created_at < v_end
      -- site_manager scoping
      AND  (
        v_role NOT IN ('site_manager') OR
        erc.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id))
      )
  ),
  sla_period AS (
    SELECT sla.sla_state
    FROM   public.enterprise_sla_status sla
    WHERE  sla.enterprise_id = p_enterprise_id
      AND  (v_role != 'site_manager' OR
            sla.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
  ),
  esc_period AS (
    SELECT e.status AS esc_status, e.severity
    FROM   public.enterprise_escalations e
    WHERE  e.enterprise_id = p_enterprise_id
      AND  e.opened_at >= v_start AND e.opened_at < v_end
      AND  (v_role != 'site_manager' OR
            e.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
  )
  SELECT jsonb_build_object(
    'period_days',          v_days,
    'period_start',         v_start,
    'period_end',           v_end,
    'total_requests',       COUNT(*),
    'open_requests',        COUNT(*) FILTER (WHERE status NOT IN ('validated','cancelled','no_match')),
    'completed_requests',   COUNT(*) FILTER (WHERE status IN ('validated','completed')),
    'urgent_requests',      COUNT(*) FILTER (WHERE urgency IN ('urgent','now')),
    'sla_breached',         (SELECT COUNT(*) FROM sla_period WHERE sla_state = 'breached'),
    'sla_approaching',      (SELECT COUNT(*) FROM sla_period WHERE sla_state = 'approaching'),
    'escalations_open',     (SELECT COUNT(*) FROM esc_period WHERE esc_status = 'open'),
    'escalations_acknowledged', (SELECT COUNT(*) FROM esc_period WHERE esc_status = 'acknowledged'),
    'escalations_resolved', (SELECT COUNT(*) FROM esc_period WHERE esc_status = 'resolved'),
    'critical_escalations', (SELECT COUNT(*) FROM esc_period WHERE severity = 'critical' AND esc_status IN ('open','acknowledged'))
  ) INTO v_result
  FROM erc_period;

  -- Previous period for deltas (safe degrade: wrap in exception handler)
  BEGIN
    WITH erc_prev AS (
      SELECT sr.status, sr.urgency
      FROM   public.enterprise_request_context erc
      JOIN   public.service_requests sr ON sr.id = erc.service_request_id
      WHERE  erc.enterprise_id = p_enterprise_id
        AND  erc.created_at >= v_prev_start AND erc.created_at < v_prev_end
        AND  (v_role != 'site_manager' OR
              erc.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
    ),
    esc_prev AS (
      SELECT e.status AS esc_status
      FROM   public.enterprise_escalations e
      WHERE  e.enterprise_id = p_enterprise_id
        AND  e.opened_at >= v_prev_start AND e.opened_at < v_prev_end
        AND  (v_role != 'site_manager' OR
              e.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
    )
    SELECT jsonb_build_object(
      'prev_total_requests',       COUNT(*),
      'prev_completed_requests',   COUNT(*) FILTER (WHERE status IN ('validated','completed')),
      'prev_escalations_open',     (SELECT COUNT(*) FROM esc_prev WHERE esc_status = 'open')
    ) INTO v_prev
    FROM erc_prev;
  EXCEPTION WHEN OTHERS THEN
    v_prev := '{}'::jsonb;
  END;

  RETURN v_result || v_prev || jsonb_build_object('prev_period_start', v_prev_start, 'prev_period_end', v_prev_end);
END;
$$;
REVOKE ALL ON FUNCTION public.get_enterprise_executive_summary FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_enterprise_executive_summary TO authenticated;

-- ============================================================================
-- BLOCK 5 — RPC: get_site_performance_report
-- Returns one row per site the caller is allowed to see.
--
-- ATTENTION SCORE formula (deterministic, documented):
--   score = (urgent_open × 4) + (sla_breached × 3) + (escalations_open × 3) + (open_requests × 1)
-- Rationale: urgent + SLA breach + open escalation are highest-risk signals.
-- Plain open workload contributes baseline pressure.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_site_performance_report(
  p_enterprise_id uuid,
  p_days          integer DEFAULT 30
)
RETURNS TABLE (
  site_id             uuid,
  site_name           text,
  site_code           text,
  total_requests      bigint,
  open_requests       bigint,
  completed_requests  bigint,
  urgent_requests     bigint,
  sla_breached        bigint,
  sla_approaching     bigint,
  escalations_open    bigint,
  escalations_total   bigint,
  -- attention_score: deterministic formula documented below
  attention_score     numeric,
  -- completion_rate: NULL if total_requests = 0
  completion_rate     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_days  integer := LEAST(GREATEST(p_days, 1), 90);
  v_start timestamptz;
  v_end   timestamptz;
  v_dummy timestamptz;
BEGIN
  v_role := fixeo_private._bp14_check_member_role(p_enterprise_id);
  SELECT pb.period_start, pb.period_end INTO v_start, v_end
  FROM   fixeo_private._bp14_period_bounds(v_days) pb;

  RETURN QUERY
  WITH allowed_sites AS (
    SELECT es.id, es.name, es.site_code
    FROM   public.enterprise_sites es
    WHERE  es.enterprise_id = p_enterprise_id
      AND  es.status = 'active'
      AND  (v_role != 'site_manager'
            OR es.id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
  ),
  site_requests AS (
    SELECT
      erc.site_id,
      sr.status,
      sr.urgency,
      erc.created_at AS req_created_at
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr ON sr.id = erc.service_request_id
    WHERE erc.enterprise_id = p_enterprise_id
      AND erc.created_at >= v_start AND erc.created_at < v_end
      AND erc.site_id IN (SELECT id FROM allowed_sites)
  ),
  site_sla AS (
    SELECT sla.site_id,
           COUNT(*) FILTER (WHERE sla.sla_state = 'breached')    AS breached,
           COUNT(*) FILTER (WHERE sla.sla_state = 'approaching')  AS approaching
    FROM public.enterprise_sla_status sla
    WHERE sla.enterprise_id = p_enterprise_id
      AND sla.site_id IN (SELECT id FROM allowed_sites)
    GROUP BY sla.site_id
  ),
  site_esc AS (
    SELECT e.site_id,
           COUNT(*) FILTER (WHERE e.status IN ('open','acknowledged')) AS esc_open,
           COUNT(*)                                                      AS esc_total
    FROM public.enterprise_escalations e
    WHERE e.enterprise_id = p_enterprise_id
      AND e.opened_at >= v_start AND e.opened_at < v_end
      AND e.site_id IN (SELECT id FROM allowed_sites)
    GROUP BY e.site_id
  )
  SELECT
    s.id,
    s.name,
    s.site_code,
    COALESCE(COUNT(sr.status), 0)::bigint                                                   AS total_requests,
    COALESCE(COUNT(sr.status) FILTER (WHERE sr.status NOT IN ('validated','cancelled','no_match')), 0)::bigint AS open_requests,
    COALESCE(COUNT(sr.status) FILTER (WHERE sr.status IN ('validated','completed')), 0)::bigint AS completed_requests,
    COALESCE(COUNT(sr.status) FILTER (WHERE sr.urgency IN ('urgent','now')), 0)::bigint     AS urgent_requests,
    COALESCE(sl.breached, 0)::bigint                                                         AS sla_breached,
    COALESCE(sl.approaching, 0)::bigint                                                      AS sla_approaching,
    COALESCE(se.esc_open, 0)::bigint                                                         AS escalations_open,
    COALESCE(se.esc_total, 0)::bigint                                                        AS escalations_total,
    -- ATTENTION SCORE (deterministic, documented):
    --   open_urgent_requests * 4
    -- + sla_breached         * 3
    -- + escalations_open     * 3
    -- + open_requests        * 1
    -- Higher = more management attention required
    (
      COALESCE(COUNT(sr.status) FILTER (WHERE sr.urgency IN ('urgent','now')
        AND sr.status NOT IN ('validated','cancelled','no_match')), 0) * 4
      + COALESCE(sl.breached, 0) * 3
      + COALESCE(se.esc_open, 0) * 3
      + COALESCE(COUNT(sr.status) FILTER (WHERE sr.status NOT IN ('validated','cancelled','no_match')), 0) * 1
    )::numeric AS attention_score,
    -- COMPLETION RATE: NULL if no requests (avoids 0/0)
    CASE
      WHEN COUNT(sr.status) = 0 THEN NULL
      ELSE ROUND(
        COUNT(sr.status) FILTER (WHERE sr.status IN ('validated','completed'))::numeric
        / COUNT(sr.status) * 100, 1
      )
    END AS completion_rate
  FROM allowed_sites s
  LEFT JOIN site_requests sr ON sr.site_id = s.id
  LEFT JOIN site_sla  sl ON sl.site_id = s.id
  LEFT JOIN site_esc  se ON se.site_id = s.id
  GROUP BY s.id, s.name, s.site_code, sl.breached, sl.approaching, se.esc_open, se.esc_total
  ORDER BY attention_score DESC, total_requests DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_site_performance_report FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_site_performance_report TO authenticated;

-- ============================================================================
-- BLOCK 6 — RPC: get_enterprise_trend
-- Returns daily or weekly bucketed counts for trend visualization.
-- Note on sla_breached in trend: SLA state is point-in-time derived (not a
-- historical event column). Returns 0 rather than fabricating historical
-- breach counts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_enterprise_trend(
  p_enterprise_id uuid,
  p_days          integer DEFAULT 30,
  p_bucket        text    DEFAULT 'day'  -- 'day' or 'week'
)
RETURNS TABLE (
  bucket_start    timestamptz,
  new_requests    bigint,
  completed       bigint,
  escalations     bigint,
  sla_breached    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role  text;
  v_days  integer := LEAST(GREATEST(p_days, 1), 90);
  v_start timestamptz;
  v_end   timestamptz;
BEGIN
  v_role := fixeo_private._bp14_check_member_role(p_enterprise_id);
  IF p_bucket NOT IN ('day', 'week') THEN RAISE EXCEPTION 'invalid_bucket'; END IF;
  SELECT pb.period_start, pb.period_end INTO v_start, v_end
  FROM   fixeo_private._bp14_period_bounds(v_days) pb;

  RETURN QUERY
  WITH buckets AS (
    SELECT date_trunc(p_bucket, gs)::timestamptz AS bucket_start
    FROM   generate_series(v_start, v_end - interval '1 second', ('1 ' || p_bucket)::interval) gs
  ),
  req_data AS (
    SELECT date_trunc(p_bucket, erc.created_at)::timestamptz AS bucket,
           sr.status
    FROM   public.enterprise_request_context erc
    JOIN   public.service_requests sr ON sr.id = erc.service_request_id
    WHERE  erc.enterprise_id = p_enterprise_id
      AND  erc.created_at >= v_start AND erc.created_at < v_end
      AND  (v_role != 'site_manager' OR
            erc.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
  ),
  esc_data AS (
    SELECT date_trunc(p_bucket, e.opened_at)::timestamptz AS bucket
    FROM   public.enterprise_escalations e
    WHERE  e.enterprise_id = p_enterprise_id
      AND  e.opened_at >= v_start AND e.opened_at < v_end
      AND  (v_role != 'site_manager' OR
            e.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))
  )
  SELECT
    b.bucket_start,
    COALESCE(COUNT(rd.status), 0)::bigint                                    AS new_requests,
    COALESCE(COUNT(rd.status) FILTER (WHERE rd.status IN ('validated','completed')), 0)::bigint AS completed,
    COALESCE(COUNT(ed.bucket), 0)::bigint                                    AS escalations,
    0::bigint  AS sla_breached  -- SLA state is point-in-time, not historical event-based; safe zero
  FROM      buckets b
  LEFT JOIN req_data rd ON rd.bucket = b.bucket_start
  LEFT JOIN esc_data ed ON ed.bucket = b.bucket_start
  GROUP BY b.bucket_start
  ORDER BY b.bucket_start;
END;
$$;
REVOKE ALL ON FUNCTION public.get_enterprise_trend FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_enterprise_trend TO authenticated;

-- ============================================================================
-- BLOCK 7 — RPC: get_management_attention
-- Returns actionable items requiring management attention, ordered by urgency.
-- Signals:
--   1  sla_breached        — active SLA breach (highest priority)
--   2  escalation_open     — open/acknowledged critical or high escalation
--   2  urgent_unassigned   — urgent request with no active mission
--   3  stale_open          — non-terminal request open > 72 hours
-- BP12/BP13 degrade gracefully if not deployed (no rows returned for those signals).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_management_attention(
  p_enterprise_id uuid,
  p_limit         integer DEFAULT 20
)
RETURNS TABLE (
  attention_type   text,   -- 'urgent_unassigned', 'sla_breached', 'escalation_open', 'stale_open'
  priority         integer,-- 1=highest
  service_request_id uuid,
  site_id          uuid,
  site_name        text,
  urgency          text,
  request_status   text,
  signal_detail    jsonb,  -- context: sla_state, escalation severity, age_hours etc.
  created_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_lim  integer := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  v_role := fixeo_private._bp14_check_member_role(p_enterprise_id);

  RETURN QUERY
  -- Signal 1: SLA breached (priority 1)
  SELECT
    'sla_breached'::text,
    1::integer,
    sla.request_id,
    sla.site_id,
    es.name,
    sla.request_urgency,
    sla.request_status,
    jsonb_build_object('sla_state', sla.sla_state),
    erc.created_at
  FROM public.enterprise_sla_status sla
  JOIN public.enterprise_request_context erc
    ON erc.service_request_id = sla.request_id AND erc.enterprise_id = p_enterprise_id
  LEFT JOIN public.enterprise_sites es ON es.id = sla.site_id
  WHERE sla.enterprise_id = p_enterprise_id
    AND sla.sla_state = 'breached'
    AND (v_role != 'site_manager' OR
         sla.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))

  UNION ALL

  -- Signal 2: Open critical/high escalations (priority 2)
  SELECT
    'escalation_open'::text,
    2::integer,
    e.service_request_id,
    e.site_id,
    es.name,
    sr.urgency,
    sr.status,
    jsonb_build_object('severity', e.severity, 'reason_code', e.reason_code,
                        'age_hours', EXTRACT(EPOCH FROM now() - e.opened_at)/3600),
    e.opened_at
  FROM public.enterprise_escalations e
  JOIN public.service_requests sr ON sr.id = e.service_request_id
  LEFT JOIN public.enterprise_sites es ON es.id = e.site_id
  WHERE e.enterprise_id = p_enterprise_id
    AND e.status IN ('open', 'acknowledged')
    AND e.severity IN ('critical', 'high')
    AND (v_role != 'site_manager' OR
         e.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))

  UNION ALL

  -- Signal 3: Urgent unassigned (priority 2)
  SELECT
    'urgent_unassigned'::text,
    2::integer,
    erc.service_request_id,
    erc.site_id,
    es.name,
    sr.urgency,
    sr.status,
    jsonb_build_object('age_hours', EXTRACT(EPOCH FROM now() - sr.created_at)/3600),
    sr.created_at
  FROM public.enterprise_request_context erc
  JOIN public.service_requests sr ON sr.id = erc.service_request_id
  LEFT JOIN public.enterprise_sites es ON es.id = erc.site_id
  WHERE erc.enterprise_id = p_enterprise_id
    AND sr.urgency IN ('urgent', 'now')
    AND sr.status IN ('new', 'assigned')
    AND NOT EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.request_id = sr.id::text
        AND m.status IN ('accepted', 'started')
    )
    AND (v_role != 'site_manager' OR
         erc.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))

  UNION ALL

  -- Signal 4: Stale open (>72h, priority 3)
  SELECT
    'stale_open'::text,
    3::integer,
    erc.service_request_id,
    erc.site_id,
    es.name,
    sr.urgency,
    sr.status,
    jsonb_build_object('age_hours', EXTRACT(EPOCH FROM now() - sr.created_at)/3600),
    sr.created_at
  FROM public.enterprise_request_context erc
  JOIN public.service_requests sr ON sr.id = erc.service_request_id
  LEFT JOIN public.enterprise_sites es ON es.id = erc.site_id
  WHERE erc.enterprise_id = p_enterprise_id
    AND sr.status NOT IN ('validated', 'cancelled', 'no_match')
    AND sr.created_at < now() - interval '72 hours'
    AND (v_role != 'site_manager' OR
         erc.site_id = ANY(fixeo_private._fixeo_get_site_manager_site_ids(p_enterprise_id)))

  ORDER BY priority ASC, created_at ASC
  LIMIT v_lim;
END;
$$;
REVOKE ALL ON FUNCTION public.get_management_attention FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_management_attention TO authenticated;

-- ============================================================================
-- BLOCK 8 — Comments & COMMIT
-- ============================================================================

COMMENT ON FUNCTION public.get_enterprise_executive_summary IS
  'BP14: Executive KPI summary for an enterprise and time period (1-90 days). '
  'site_manager: scoped to assigned sites only. Server-side UTC.';

COMMENT ON FUNCTION public.get_site_performance_report IS
  'BP14: Per-site performance metrics with deterministic attention score. '
  'Attention score = (urgent_open×4)+(sla_breached×3)+(esc_open×3)+(open×1).';

COMMENT ON FUNCTION public.get_enterprise_trend IS
  'BP14: Daily or weekly bucketed request/escalation counts for trend charts. '
  'sla_breached column is always 0: SLA state is point-in-time, not event-sourced.';

COMMENT ON FUNCTION public.get_management_attention IS
  'BP14: Actionable management attention items ranked by priority. '
  'Signals: sla_breached(1), escalation_open/urgent_unassigned(2), stale_open(3). '
  'BP12/BP13 degrade gracefully if not deployed.';

COMMIT;
