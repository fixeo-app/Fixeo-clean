-- FIXEO Supabase stability B2: reduce repeated Supply projection reads.
-- No business-row mutation. Preserves the projection contract and lifecycle semantics.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_artisan_projection_v1') IS NULL
     OR to_regprocedure('fixeo_private.supply_derived_stage_v1(uuid)') IS NULL
     OR md5(pg_get_viewdef('public.supply_artisan_projection_v1'::regclass,true))
        IS DISTINCT FROM 'ecff1999060a6cedf5adb8232ca606ee'
  THEN
    RAISE EXCEPTION 'SUPPLY_PROJECTION_PRESSURE_BASELINE_DRIFT';
  END IF;
END
$guard$;

CREATE INDEX IF NOT EXISTS claim_requests_pending_artisan_idx
  ON public.claim_requests (artisan_id)
  WHERE status='pending';

CREATE OR REPLACE VIEW public.supply_artisan_projection_v1 AS
WITH pending_claims AS (
  SELECT cr.artisan_id, true AS pending_claim
  FROM public.claim_requests cr
  WHERE cr.status='pending'
  GROUP BY cr.artisan_id
),
base AS (
  SELECT
    a.id AS artisan_id,
    COALESCE(NULLIF(btrim(a.full_name),''),NULLIF(btrim(a.name),''),'Artisan '||left(a.id::text,8)) AS artisan_name,
    a.city,
    a.service_category,
    a.source,
    COALESCE(NULLIF(btrim(a.phone_public),''),NULLIF(btrim(a.phone),'')) AS contact_phone,
    a.claimable,
    a.claimed,
    a.claim_status,
    a.owner_user_id,
    a.onboarding_completed,
    a.verified,
    a.availability AS declared_availability,
    a.is_public,
    a.updated_at AS profile_updated_at,
    CASE
      WHEN a.claimed IS TRUE
       AND a.owner_user_id IS NOT NULL
       AND a.onboarding_completed IS TRUE
       AND a.verified IS TRUE
       AND s.activation_confirmed_at IS NOT NULL
        THEN 'ACTIVATED'
      WHEN a.claimed IS TRUE
       AND a.owner_user_id IS NOT NULL
       AND a.onboarding_completed IS TRUE
       AND a.verified IS TRUE
        THEN 'VERIFIED'
      WHEN a.claimed IS TRUE
       AND a.owner_user_id IS NOT NULL
       AND a.onboarding_completed IS TRUE
        THEN 'ONBOARDED'
      WHEN a.claimed IS TRUE
       AND a.owner_user_id IS NOT NULL
        THEN 'CLAIMED'
      WHEN COALESCE(pc.pending_claim,false)
        THEN 'CLAIM_IN_PROGRESS'
      WHEN COALESCE(s.lifecycle_stage,'REFERENCED') IN ('TO_CONTACT','RECRUITMENT_CANDIDATE','CONTACTED','ENGAGED')
        THEN s.lifecycle_stage
      ELSE 'REFERENCED'
    END AS lifecycle_stage,
    COALESCE(cp.outreach_status,'ALLOWED') AS outreach_status,
    cp.cooldown_until,
    cp.opted_out_at,
    CASE
      WHEN COALESCE(cp.outreach_status,'ALLOWED') IN ('OPTED_OUT','WRONG_NUMBER','BLOCKED') THEN false
      WHEN cp.outreach_status='COOLDOWN' AND cp.cooldown_until>now() THEN false
      WHEN COALESCE(NULLIF(btrim(a.phone_public),''),NULLIF(btrim(a.phone),'')) IS NULL THEN false
      ELSE true
    END AS contactable,
    s.last_contact_at,
    s.last_engaged_at,
    s.next_action_at,
    COALESCE(s.priority_score,0) AS priority_score,
    COALESCE(s.priority_reasons,'[]'::jsonb) AS priority_reasons,
    s.activation_confirmed_at,
    a.availability
  FROM public.artisans a
  LEFT JOIN public.supply_artisan_state_v1 s ON s.artisan_id=a.id
  LEFT JOIN public.supply_contact_preferences_v1 cp ON cp.artisan_id=a.id
  LEFT JOIN pending_claims pc ON pc.artisan_id=a.id
  WHERE COALESCE(a.data_classification,'production')='production'
)
SELECT
  artisan_id,
  artisan_name,
  city,
  service_category,
  source,
  contact_phone,
  claimable,
  claimed,
  claim_status,
  owner_user_id,
  onboarding_completed,
  verified,
  declared_availability,
  is_public,
  profile_updated_at,
  lifecycle_stage,
  outreach_status,
  cooldown_until,
  opted_out_at,
  contactable,
  last_contact_at,
  last_engaged_at,
  next_action_at,
  priority_score,
  priority_reasons,
  activation_confirmed_at,
  CASE
    WHEN lifecycle_stage='ACTIVATED'
     AND availability='available'
     AND activation_confirmed_at>=now()-interval '30 days'
      THEN true
    ELSE false
  END AS operational_capacity_proven
FROM base;

COMMIT;
