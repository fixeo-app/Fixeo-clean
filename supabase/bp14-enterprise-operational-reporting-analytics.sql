-- =============================================================================
-- FIXEO ENTERPRISE — BP14 — ENTERPRISE OPERATIONAL REPORTING & ANALYTICS
-- CORRECTED DRAFT v4 — NOT FOR PRODUCTION APPLY
--
-- Frozen contract basis:
--   - canonical tenant linkage: enterprise_request_context
--   - request source: service_requests
--   - mission source: missions
--   - SLA source: enterprise_sla_status / get_enterprise_sla_summary
--   - member authorization: fixeo_private._fixeo_is_enterprise_member(uuid)
--   - admin authorization: fixeo_private._fixeo_is_admin()
--
-- Explicitly OUT OF SCOPE:
--   billing/subscription creation, notification delivery, member-site assignment,
--   physical deletion, historical rewrites.
--
-- IMPORTANT:
--   This is a DRAFT for static audit. DO NOT APPLY TO PRODUCTION YET.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Reporting indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_requests_created_at
  ON public.service_requests (created_at);

-- -----------------------------------------------------------------------------
-- 2. Enterprise operational summary
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_enterprise_operational_summary(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  IF NOT (
    fixeo_private._fixeo_is_enterprise_member(p_enterprise_id)
    OR fixeo_private._fixeo_is_admin()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF v_from > v_to THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_period');
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.enterprise_sites es
    WHERE es.id = p_site_id
      AND es.enterprise_id = p_enterprise_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_site');
  END IF;

  WITH request_base AS MATERIALIZED (
    SELECT
      erc.service_request_id,
      erc.site_id,
      sr.created_at,
      sr.status,
      sr.service_category,
      sr.city,
      sr.urgency,
      sr.commission_amount,
      sr.commission_paid,
      sr.commission_status
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id = erc.service_request_id
    WHERE erc.enterprise_id = p_enterprise_id
      AND (p_site_id IS NULL OR erc.site_id = p_site_id)
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  mission_per_request AS MATERIALIZED (
    SELECT
      rb.service_request_id,
      pg_catalog.count(m.id) AS mission_count,
      pg_catalog.min(m.accepted_at) AS first_accepted_at,
      pg_catalog.bool_or(m.accepted_at IS NOT NULL) AS has_acceptance,
      pg_catalog.bool_or(m.status IN ('done','validated')) AS has_completed_mission
    FROM request_base rb
    LEFT JOIN public.missions m
      ON m.request_id = rb.service_request_id::text
    GROUP BY rb.service_request_id
  ),
  enriched AS MATERIALIZED (
    SELECT
      rb.*,
      COALESCE(mpr.mission_count,0) AS mission_count,
      COALESCE(mpr.has_acceptance,false) AS has_acceptance,
      COALESCE(mpr.has_completed_mission,false) AS has_completed_mission,
      mpr.first_accepted_at
    FROM request_base rb
    LEFT JOIN mission_per_request mpr
      ON mpr.service_request_id = rb.service_request_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok', true,
    'enterprise_id', p_enterprise_id,
    'site_id', p_site_id,
    'from', p_from,
    'to', p_to,

    'request_count', pg_catalog.count(*),
    'new_count', pg_catalog.count(*) FILTER (WHERE status='new'),
    'assigned_count', pg_catalog.count(*) FILTER (WHERE status='assigned'),
    'in_progress_count', pg_catalog.count(*) FILTER (WHERE status='in_progress'),
    'completed_count', pg_catalog.count(*) FILTER (WHERE status='completed'),
    'validated_count', pg_catalog.count(*) FILTER (WHERE status='validated'),
    'cancelled_count', pg_catalog.count(*) FILTER (WHERE status='cancelled'),
    'no_match_count', pg_catalog.count(*) FILTER (WHERE status='no_match'),

    'requests_with_mission_count',
      pg_catalog.count(*) FILTER (WHERE mission_count > 0),

    'accepted_request_count',
      pg_catalog.count(*) FILTER (WHERE has_acceptance),

    -- Denominator is all Enterprise requests in the selected period/site.
    -- cancelled/no_match remain visible in their own counters; no exclusion is
    -- invented because Production currently has no such rows to validate.
    'acceptance_rate_percent',
      CASE
        WHEN pg_catalog.count(*) = 0 THEN NULL
        ELSE pg_catalog.round(
          100.0
          * pg_catalog.count(*) FILTER (WHERE has_acceptance)
          / pg_catalog.count(*),
          2
        )
      END,

    'avg_first_acceptance_minutes',
      pg_catalog.round(
        pg_catalog.avg(
          EXTRACT(epoch FROM (first_accepted_at-created_at))/60.0
        ) FILTER (WHERE first_accepted_at IS NOT NULL),
        2
      ),

    'completed_mission_request_count',
      pg_catalog.count(*) FILTER (WHERE has_completed_mission),

    -- Production evidence does not establish a canonical mission price row.
    -- Financial reporting therefore uses only request-level commission fields.
    'request_commission_total',
      COALESCE(pg_catalog.sum(commission_amount),0),

    'request_commission_paid_total',
      COALESCE(
        pg_catalog.sum(commission_amount)
          FILTER (WHERE commission_paid IS TRUE),
        0
      ),

    'request_commission_unpaid_total',
      COALESCE(
        pg_catalog.sum(commission_amount)
          FILTER (WHERE commission_paid IS DISTINCT FROM TRUE),
        0
      )
  )
  INTO v_result
  FROM enriched;

  -- SLA remains owned by the already validated BP12 RPC and is intentionally
  -- not composed into BP14 metrics, avoiding duplication of SLA semantics.
  -- BP12 currently treats p_to as inclusive (<= v_to), while BP14 uses the
  -- canonical half-open interval [p_from,p_to).  Do not compose the BP12 RPC
  -- here because that would mix two different populations in one BP14 result.
  -- SLA remains available through public.get_enterprise_sla_summary() as the
  -- independently validated BP12 contract.
  v_result := v_result || pg_catalog.jsonb_build_object(
    'sla',
    pg_catalog.jsonb_build_object(
      'source','get_enterprise_sla_summary',
      'included',false,
      'reason','separate_bp12_time_boundary_contract'
    )
  );

  RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Enterprise breakdown by site
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_enterprise_site_summary(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  IF NOT (
    fixeo_private._fixeo_is_enterprise_member(p_enterprise_id)
    OR fixeo_private._fixeo_is_admin()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF v_from > v_to THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_period');
  END IF;

  WITH request_base AS MATERIALIZED (
    SELECT
      erc.service_request_id,
      erc.site_id,
      sr.status,
      sr.created_at
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id=erc.service_request_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  first_acceptance AS MATERIALIZED (
    SELECT
      rb.service_request_id,
      pg_catalog.min(m.accepted_at) AS first_accepted_at
    FROM request_base rb
    LEFT JOIN public.missions m
      ON m.request_id=rb.service_request_id::text
    GROUP BY rb.service_request_id
  ),
  site_rows AS (
    SELECT
      es.id AS site_id,
      es.name AS site_name,
      es.city,
      es.status AS site_status,
      pg_catalog.count(rb.service_request_id) AS request_count,
      pg_catalog.count(rb.service_request_id)
        FILTER (WHERE rb.status IN ('completed','validated')) AS completed_count,
      pg_catalog.count(rb.service_request_id)
        FILTER (WHERE fa.first_accepted_at IS NOT NULL) AS accepted_count
    FROM public.enterprise_sites es
    LEFT JOIN request_base rb ON rb.site_id=es.id
    LEFT JOIN first_acceptance fa
      ON fa.service_request_id=rb.service_request_id
    WHERE es.enterprise_id=p_enterprise_id
    GROUP BY es.id,es.name,es.city,es.status
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'from',p_from,
    'to',p_to,
    'sites',
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'site_id',site_id,
            'site_name',site_name,
            'city',city,
            'site_status',site_status,
            'request_count',request_count,
            'completed_count',completed_count,
            'accepted_count',accepted_count,
            'acceptance_rate_percent',
              CASE
                WHEN request_count=0 THEN NULL
                ELSE pg_catalog.round(
                  100.0*accepted_count/request_count,
                  2
                )
              END
          )
          ORDER BY site_name,site_id
        ),
        '[]'::jsonb
      )
  )
  INTO v_result
  FROM site_rows;

  RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Enterprise breakdown by service category / urgency / request status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_enterprise_request_breakdown(
  p_enterprise_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','unauthenticated');
  END IF;

  IF p_enterprise_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','enterprise_required');
  END IF;

  IF NOT (
    fixeo_private._fixeo_is_enterprise_member(p_enterprise_id)
    OR fixeo_private._fixeo_is_admin()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','forbidden');
  END IF;

  IF v_from > v_to THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_period');
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.enterprise_sites es
    WHERE es.id=p_site_id
      AND es.enterprise_id=p_enterprise_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_site');
  END IF;

  WITH rb AS MATERIALIZED (
    SELECT
      sr.service_category,
      sr.urgency,
      sr.status
    FROM public.enterprise_request_context erc
    JOIN public.service_requests sr
      ON sr.id=erc.service_request_id
    WHERE erc.enterprise_id=p_enterprise_id
      AND (p_site_id IS NULL OR erc.site_id=p_site_id)
      AND sr.created_at >= v_from
      AND sr.created_at < v_to
  ),
  category_rows AS (
    SELECT service_category AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY service_category
  ),
  urgency_rows AS (
    SELECT COALESCE(urgency,'unspecified') AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY COALESCE(urgency,'unspecified')
  ),
  status_rows AS (
    SELECT status AS key,pg_catalog.count(*) AS count
    FROM rb GROUP BY status
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,
    'enterprise_id',p_enterprise_id,
    'site_id',p_site_id,
    'from',p_from,
    'to',p_to,
    'by_service_category',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM category_rows
    ),'[]'::jsonb),
    'by_urgency',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM urgency_rows
    ),'[]'::jsonb),
    'by_request_status',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('key',key,'count',count)
        ORDER BY count DESC,key
      ) FROM status_rows
    ),'[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Ownership / execution hardening
-- -----------------------------------------------------------------------------

ALTER FUNCTION public.get_enterprise_operational_summary(
  uuid,timestamptz,timestamptz,uuid
) OWNER TO postgres;

ALTER FUNCTION public.get_enterprise_site_summary(
  uuid,timestamptz,timestamptz
) OWNER TO postgres;

ALTER FUNCTION public.get_enterprise_request_breakdown(
  uuid,timestamptz,timestamptz,uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_enterprise_operational_summary(
  uuid,timestamptz,timestamptz,uuid
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_enterprise_site_summary(
  uuid,timestamptz,timestamptz
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_enterprise_request_breakdown(
  uuid,timestamptz,timestamptz,uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_enterprise_operational_summary(
  uuid,timestamptz,timestamptz,uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_enterprise_site_summary(
  uuid,timestamptz,timestamptz
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_enterprise_request_breakdown(
  uuid,timestamptz,timestamptz,uuid
) TO authenticated;

COMMIT;

-- =============================================================================
-- END BP14 CORRECTED DRAFT v4
-- =============================================================================
