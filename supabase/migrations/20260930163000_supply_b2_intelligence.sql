-- FIXEO Supply Engine — Bloc 2
-- Deterministic coverage intelligence and recruitment candidate scoring.
-- No model calls. No dispatch eligibility claim.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_artisan_projection_v1') IS NULL
     OR to_regclass('public.service_requests') IS NULL
     OR to_regclass('public.artisan_service_categories') IS NULL
     OR to_regclass('public.artisan_service_cities') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B2_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE OR REPLACE VIEW public.supply_coverage_v1
WITH (security_invoker=false)
AS
WITH artisan_dims AS (
  SELECT DISTINCT
    a.id artisan_id,
    COALESCE(NULLIF(btrim(sc.service_category),''),NULLIF(btrim(a.service_category),'')) service_category,
    COALESCE(NULLIF(btrim(ci.city),''),NULLIF(btrim(a.city),'')) city
  FROM public.artisans a
  LEFT JOIN public.artisan_service_categories sc ON sc.artisan_id=a.id
  LEFT JOIN public.artisan_service_cities ci ON ci.artisan_id=a.id
  WHERE COALESCE(a.data_classification,'production')='production'
), supply AS (
  SELECT
    d.city,d.service_category,
    count(DISTINCT d.artisan_id) referenced,
    count(DISTINCT d.artisan_id) FILTER(WHERE p.contactable) contactable,
    count(DISTINCT d.artisan_id) FILTER(
      WHERE p.contactable AND p.claimable IS TRUE AND p.claimed IS FALSE AND p.owner_user_id IS NULL
    ) recruitment_pool,
    count(DISTINCT d.artisan_id) FILTER(WHERE p.lifecycle_stage IN('CLAIMED','ONBOARDED','VERIFIED','ACTIVATED')) owned_or_beyond,
    count(DISTINCT d.artisan_id) FILTER(WHERE p.lifecycle_stage IN('VERIFIED','ACTIVATED')) verified_or_beyond,
    count(DISTINCT d.artisan_id) FILTER(WHERE p.lifecycle_stage='ACTIVATED') activated,
    count(DISTINCT d.artisan_id) FILTER(WHERE p.operational_capacity_proven) operational_capacity_proven
  FROM artisan_dims d
  JOIN public.supply_artisan_projection_v1 p ON p.artisan_id=d.artisan_id
  WHERE d.city IS NOT NULL AND d.service_category IS NOT NULL
  GROUP BY d.city,d.service_category
), demand AS (
  SELECT
    NULLIF(btrim(city),'') city,
    NULLIF(btrim(service_category),'') service_category,
    count(*) demand_total,
    count(*) FILTER(WHERE status IN('new','pending','matching','assigned','in_progress')) demand_open,
    count(*) FILTER(WHERE created_at>=now()-interval '30 days') demand_30d,
    max(created_at) latest_demand_at
  FROM public.service_requests
  WHERE COALESCE(data_classification,'production')='production'
    AND NULLIF(btrim(city),'') IS NOT NULL
    AND NULLIF(btrim(service_category),'') IS NOT NULL
  GROUP BY NULLIF(btrim(city),''),NULLIF(btrim(service_category),'')
), cells AS (
  SELECT COALESCE(s.city,d.city) city,COALESCE(s.service_category,d.service_category) service_category,
    COALESCE(s.referenced,0) referenced,
    COALESCE(s.contactable,0) contactable,
    COALESCE(s.recruitment_pool,0) recruitment_pool,
    COALESCE(s.owned_or_beyond,0) owned_or_beyond,
    COALESCE(s.verified_or_beyond,0) verified_or_beyond,
    COALESCE(s.activated,0) activated,
    COALESCE(s.operational_capacity_proven,0) operational_capacity_proven,
    COALESCE(d.demand_total,0) demand_total,
    COALESCE(d.demand_open,0) demand_open,
    COALESCE(d.demand_30d,0) demand_30d,
    d.latest_demand_at
  FROM supply s FULL OUTER JOIN demand d
    ON lower(s.city)=lower(d.city) AND lower(s.service_category)=lower(d.service_category)
)
SELECT *,
  CASE
    WHEN demand_open=0 AND demand_30d=0 THEN 'NO_RECENT_DEMAND'
    WHEN operational_capacity_proven=0 THEN 'GAP'
    WHEN operational_capacity_proven<3 THEN 'THIN'
    ELSE 'COVERED'
  END coverage_status,
  CASE WHEN demand_open=0 AND demand_30d=0 THEN 0 ELSE
    LEAST(1000,
      demand_open*120
      + demand_30d*25
      + GREATEST(0,3-operational_capacity_proven)*45
      + CASE WHEN recruitment_pool>0 THEN LEAST(recruitment_pool,20) ELSE -60 END
    )
  END::integer recruitment_priority
FROM cells;

ALTER VIEW public.supply_coverage_v1 OWNER TO postgres;
REVOKE ALL ON public.supply_coverage_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_intelligence_v1(p_limit integer DEFAULT 30)
RETURNS TABLE(
  city text,service_category text,coverage_status text,recruitment_priority integer,
  demand_open bigint,demand_30d bigint,referenced bigint,contactable bigint,
  recruitment_pool bigint,activated bigint,operational_capacity_proven bigint,latest_demand_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  PERFORM fixeo_private.supply_require_actor_v1();
  RETURN QUERY
  SELECT c.city,c.service_category,c.coverage_status,c.recruitment_priority,
    c.demand_open,c.demand_30d,c.referenced,c.contactable,c.recruitment_pool,
    c.activated,c.operational_capacity_proven,c.latest_demand_at
  FROM public.supply_coverage_v1 c
  WHERE c.recruitment_priority>0
  ORDER BY c.recruitment_priority DESC,c.demand_open DESC,c.city,c.service_category
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,30),200));
END
$fn$;
ALTER FUNCTION public.supply_intelligence_v1(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_intelligence_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_intelligence_v1(integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_recruitment_candidates_v1(
  p_city text DEFAULT NULL,
  p_service text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(
  rank bigint,artisan_id uuid,artisan_name text,city text,service_category text,
  contact_phone text,lifecycle_stage text,outreach_status text,
  score integer,reasons jsonb,claim_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  PERFORM fixeo_private.supply_require_actor_v1();
  RETURN QUERY
  WITH dims AS (
    SELECT DISTINCT
      p.artisan_id,p.artisan_name,p.city,p.service_category,p.contact_phone,p.lifecycle_stage,p.outreach_status,
      p.claimable,p.claimed,p.owner_user_id,p.profile_updated_at,p.is_public,
      EXISTS(
        SELECT 1 FROM public.artisan_service_categories sc
        WHERE sc.artisan_id=p.artisan_id
          AND lower(btrim(sc.service_category))=lower(btrim(COALESCE(p_service,'')))
      ) secondary_service,
      EXISTS(
        SELECT 1 FROM public.artisan_service_cities ci
        WHERE ci.artisan_id=p.artisan_id
          AND lower(btrim(ci.city))=lower(btrim(COALESCE(p_city,'')))
      ) secondary_city
    FROM public.supply_artisan_projection_v1 p
    WHERE p.contactable
      AND p.claimable IS TRUE
      AND p.claimed IS FALSE
      AND p.owner_user_id IS NULL
      AND p.lifecycle_stage NOT IN('CLAIM_IN_PROGRESS','CLAIMED','ONBOARDED','VERIFIED','ACTIVATED')
  ), scored AS (
    SELECT d.*,
      (
        CASE
          WHEN NULLIF(btrim(COALESCE(p_service,'')),'') IS NULL THEN 20
          WHEN lower(btrim(d.service_category))=lower(btrim(p_service)) THEN 40
          WHEN d.secondary_service THEN 34 ELSE 0 END
        +
        CASE
          WHEN NULLIF(btrim(COALESCE(p_city,'')),'') IS NULL THEN 15
          WHEN lower(btrim(d.city))=lower(btrim(p_city)) THEN 35
          WHEN d.secondary_city THEN 30 ELSE 0 END
        + CASE WHEN d.is_public THEN 5 ELSE 0 END
        + CASE
          WHEN d.profile_updated_at>=now()-interval '30 days' THEN 10
          WHEN d.profile_updated_at>=now()-interval '180 days' THEN 5 ELSE 0 END
      )::integer score,
      jsonb_strip_nulls(jsonb_build_object(
        'primary_service',CASE WHEN NULLIF(btrim(COALESCE(p_service,'')),'') IS NOT NULL AND lower(btrim(d.service_category))=lower(btrim(p_service)) THEN true ELSE NULL END,
        'secondary_service',CASE WHEN d.secondary_service THEN true ELSE NULL END,
        'primary_city',CASE WHEN NULLIF(btrim(COALESCE(p_city,'')),'') IS NOT NULL AND lower(btrim(d.city))=lower(btrim(p_city)) THEN true ELSE NULL END,
        'secondary_city',CASE WHEN d.secondary_city THEN true ELSE NULL END,
        'public_profile',CASE WHEN d.is_public THEN true ELSE NULL END
      )) reasons
    FROM dims d
  ), filtered AS (
    SELECT * FROM scored
    WHERE (NULLIF(btrim(COALESCE(p_service,'')),'') IS NULL OR
           lower(btrim(service_category))=lower(btrim(p_service)) OR secondary_service)
      AND (NULLIF(btrim(COALESCE(p_city,'')),'') IS NULL OR
           lower(btrim(city))=lower(btrim(p_city)) OR secondary_city)
  )
  SELECT row_number() OVER(ORDER BY f.score DESC,f.artisan_id),
    f.artisan_id,f.artisan_name,f.city,f.service_category,f.contact_phone,
    f.lifecycle_stage,f.outreach_status,f.score,f.reasons,
    '/rejoindre-fixeo.html?id='||f.artisan_id::text||'#revendique'
  FROM filtered f
  ORDER BY f.score DESC,f.artisan_id
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,30),200));
END
$fn$;
ALTER FUNCTION public.supply_recruitment_candidates_v1(text,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_recruitment_candidates_v1(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_recruitment_candidates_v1(text,text,integer) TO authenticated,service_role;

COMMIT;
