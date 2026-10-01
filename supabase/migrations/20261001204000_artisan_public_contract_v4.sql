-- FIXEO Artisan Journey V4 — Bloc 1
-- Canonical public artisan profile contract.
-- Candidate only until explicitly applied to Production.
-- Privacy: no phone, owner UUID, outreach internals, or private Supply evidence is returned.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.artisan_public_profile_v4(p_artisan_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH a AS (
  SELECT *
  FROM public.artisans
  WHERE id=p_artisan_id
    AND coalesce(is_public,true)=true
    AND coalesce(data_classification,'production')='production'
  LIMIT 1
),
pending_claim AS (
  SELECT EXISTS(
    SELECT 1 FROM public.claim_requests cr
    WHERE cr.artisan_id=p_artisan_id AND cr.status='pending'
  ) AS value
),
cats AS (
  SELECT coalesce(jsonb_agg(x.service_category ORDER BY x.service_category),'[]'::jsonb) AS items
  FROM (
    SELECT DISTINCT asc1.service_category
    FROM public.artisan_service_categories asc1
    WHERE asc1.artisan_id=p_artisan_id
      AND nullif(btrim(asc1.service_category),'') IS NOT NULL
  ) x
),
cities AS (
  SELECT coalesce(jsonb_agg(x.city ORDER BY x.city),'[]'::jsonb) AS items
  FROM (
    SELECT DISTINCT ac.city
    FROM public.artisan_service_cities ac
    WHERE ac.artisan_id=p_artisan_id
      AND nullif(btrim(ac.city),'') IS NOT NULL
  ) x
),
portfolio AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',pi.id,
        'service',nullif(btrim(pi.service),''),
        'description',nullif(btrim(pi.description),''),
        'city',nullif(btrim(pi.city),''),
        'image_url',nullif(btrim(pi.image_url),''),
        'before_image_url',nullif(btrim(pi.before_image_url),''),
        'after_image_url',nullif(btrim(pi.after_image_url),'')
      )
      ORDER BY pi.created_at DESC NULLS LAST,pi.id
    ) FILTER (
      WHERE nullif(btrim(pi.image_url),'') IS NOT NULL
         OR nullif(btrim(pi.before_image_url),'') IS NOT NULL
         OR nullif(btrim(pi.after_image_url),'') IS NOT NULL
         OR nullif(btrim(pi.description),'') IS NOT NULL
    ),
    '[]'::jsonb
  ) AS items
  FROM public.portfolio_items pi
  WHERE pi.artisan_id=p_artisan_id::text
),
review AS (
  SELECT
    count(*) FILTER (WHERE r.verified IS TRUE)::int AS review_count,
    round(avg(r.rating) FILTER (WHERE r.verified IS TRUE),1) AS avg_rating
  FROM public.reviews r
  WHERE r.artisan_id=p_artisan_id
),
base AS (
  SELECT
    a.*,
    pc.value AS pending_claim,
    cats.items AS extra_categories,
    cities.items AS extra_cities,
    portfolio.items AS portfolio_items,
    review.review_count AS verified_review_count,
    review.avg_rating AS verified_avg_rating,
    CASE
      WHEN a.verified IS TRUE OR a.is_verified IS TRUE THEN 'verified'
      WHEN a.onboarding_completed IS TRUE AND a.claimed IS TRUE AND a.owner_user_id IS NOT NULL THEN 'onboarded'
      WHEN a.claimed IS TRUE AND a.owner_user_id IS NOT NULL THEN 'claimed'
      WHEN pc.value IS TRUE THEN 'claim_in_progress'
      ELSE 'referenced'
    END AS public_status
  FROM a
  CROSS JOIN pending_claim pc
  CROSS JOIN cats
  CROSS JOIN cities
  CROSS JOIN portfolio
  CROSS JOIN review
)
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM base) THEN NULL ELSE (
  SELECT jsonb_build_object(
    'contract_version','artisan_public_profile_v4',
    'artisan_id',b.id,
    'public_slug',nullif(btrim(b.public_slug),''),
    'identity',jsonb_build_object(
      'display_name',coalesce(nullif(btrim(b.full_name),''),nullif(btrim(b.name),''),'Artisan FIXEO'),
      'photo_url',nullif(btrim(b.photo_url),''),
      'photo_state',CASE WHEN nullif(btrim(b.photo_url),'') IS NULL THEN 'missing' ELSE 'provided' END,
      'description',nullif(btrim(b.description),''),
      'experience_declared',nullif(btrim(b.experience),'')
    ),
    'services',jsonb_build_object(
      'primary',coalesce(nullif(btrim(b.service_category),''),nullif(btrim(b.category),'')),
      'additional',b.extra_categories,
      'legacy_services',coalesce(b.services,'[]'::jsonb)
    ),
    'coverage',jsonb_build_object(
      'primary_city',nullif(btrim(b.city),''),
      'work_zone',nullif(btrim(b.work_zone),''),
      'additional_cities',b.extra_cities
    ),
    'trust',jsonb_build_object(
      'profile_status',b.public_status,
      'is_claimed',b.public_status IN ('claimed','onboarded','verified'),
      'is_onboarded',b.public_status IN ('onboarded','verified'),
      'is_verified',b.public_status='verified',
      'label',CASE b.public_status
        WHEN 'verified' THEN 'Profil vérifié'
        WHEN 'onboarded' THEN 'Profil complété'
        WHEN 'claimed' THEN 'Profil revendiqué'
        WHEN 'claim_in_progress' THEN 'Revendication en cours'
        ELSE 'Profil référencé sur FIXEO'
      END,
      'verified_review_count',coalesce(b.verified_review_count,0),
      'verified_average_rating',b.verified_avg_rating
    ),
    'availability',jsonb_build_object(
      'status','confirmation_required',
      'label','Disponibilité à confirmer',
      'legacy_declared_status',nullif(btrim(b.availability),''),
      'operational_capacity_proven',false
    ),
    'portfolio',b.portfolio_items,
    'provenance',jsonb_build_object(
      'identity','artisan_record',
      'experience','artisan_declared',
      'reviews','verified_reviews_only',
      'availability','confirmation_required',
      'pricing','not_in_contract'
    )
  )
  FROM base b
) END;
$$;

REVOKE ALL ON FUNCTION public.artisan_public_profile_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artisan_public_profile_v4(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.artisan_public_profile_v4(uuid) IS
'FIXEO Artisan Journey V4 public read contract. No contact/private Supply data. claimed != verified; legacy availability never proves live capacity; pricing intentionally excluded.';

CREATE OR REPLACE FUNCTION public.resolve_artisan_public_profile_v4(p_ref text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $resolver$
  SELECT public.artisan_public_profile_v4(a.id)
  FROM public.artisans a
  WHERE coalesce(a.is_public,true)=true
    AND coalesce(a.data_classification,'production')='production'
    AND (
      a.id::text=p_ref
      OR a.public_slug=p_ref
      OR a.legacy_id=p_ref
    )
  ORDER BY CASE
    WHEN a.id::text=p_ref THEN 0
    WHEN a.public_slug=p_ref THEN 1
    ELSE 2
  END
  LIMIT 1;
$resolver$;

REVOKE ALL ON FUNCTION public.resolve_artisan_public_profile_v4(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_artisan_public_profile_v4(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_artisan_public_profile_v4(text) IS
'Single public entry resolver for Artisan Journey V4. Accepts canonical UUID, public_slug, or legacy_id and delegates to artisan_public_profile_v4.';

COMMIT;
