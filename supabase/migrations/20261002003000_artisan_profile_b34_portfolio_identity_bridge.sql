-- B3.4 — portfolio identity bridge for the canonical public artisan profile.
-- Reads historical portfolio rows keyed by canonical artisan id OR owner_user_id.
-- No data rewrite, no pricing authority, no review/security mutation.

create or replace function public.artisan_public_profile_v4(p_artisan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with a as (
  select * from public.artisans
  where id=p_artisan_id
    and coalesce(is_public,true)=true
    and coalesce(data_classification,'production')='production'
  limit 1
),
pending_claim as (
  select exists(select 1 from public.claim_requests cr where cr.artisan_id=p_artisan_id and cr.status='pending') as value
),
cats as (
  select coalesce(jsonb_agg(x.service_category order by x.service_category),'[]'::jsonb) items
  from (select distinct service_category from public.artisan_service_categories where artisan_id=p_artisan_id and nullif(btrim(service_category),'') is not null) x
),
cities as (
  select coalesce(jsonb_agg(x.city order by x.city),'[]'::jsonb) items
  from (select distinct city from public.artisan_service_cities where artisan_id=p_artisan_id and nullif(btrim(city),'') is not null) x
),
portfolio as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pi.id,'service',nullif(btrim(pi.service),''),'description',nullif(btrim(pi.description),''),
    'city',nullif(btrim(pi.city),''),'image_url',nullif(btrim(pi.image_url),''),
    'before_image_url',nullif(btrim(pi.before_image_url),''),'after_image_url',nullif(btrim(pi.after_image_url),'')
  ) order by pi.created_at desc nulls last,pi.id) filter(where nullif(btrim(pi.image_url),'') is not null or nullif(btrim(pi.before_image_url),'') is not null or nullif(btrim(pi.after_image_url),'') is not null or nullif(btrim(pi.description),'') is not null),'[]'::jsonb) items
  from public.portfolio_items pi
  cross join a aa
  where pi.artisan_id=p_artisan_id::text
     or (aa.owner_user_id is not null and pi.artisan_id=aa.owner_user_id::text)
),
review_summary as (
  select count(*) filter(where verified is true)::int review_count,
         round(avg(rating) filter(where verified is true),1) avg_rating
  from public.reviews where artisan_id=p_artisan_id
),
review_items as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'rating',x.rating,'text',x.review_text,'created_at',x.created_at,'verified',true
  ) order by x.created_at desc),'[]'::jsonb) items
  from (select id,rating,review_text,created_at from public.reviews
        where artisan_id=p_artisan_id and verified is true and nullif(btrim(review_text),'') is not null
        order by created_at desc limit 6) x
),
mission_metrics as (
  select
    count(*) filter(where status in ('done','validated') or completed_at is not null or validated_at is not null)::int completed_count,
    count(*) filter(where accepted_at is not null)::int accepted_count,
    round(avg(extract(epoch from (accepted_at-created_at))/60.0) filter(where accepted_at is not null and created_at is not null and accepted_at>=created_at))::int avg_response_minutes
  from public.missions where artisan_profile_id=p_artisan_id
),
base as (
  select a.*,pc.value pending_claim,cats.items extra_categories,cities.items extra_cities,portfolio.items portfolio_items,
         rs.review_count verified_review_count,rs.avg_rating verified_avg_rating,ri.items verified_review_items,
         mm.completed_count,mm.accepted_count,mm.avg_response_minutes,
         case when a.verified is true or a.is_verified is true then 'verified'
              when a.onboarding_completed is true and a.claimed is true and a.owner_user_id is not null then 'onboarded'
              when a.claimed is true and a.owner_user_id is not null then 'claimed'
              when pc.value is true then 'claim_in_progress' else 'referenced' end public_status
  from a cross join pending_claim pc cross join cats cross join cities cross join portfolio
  cross join review_summary rs cross join review_items ri cross join mission_metrics mm
)
select case when not exists(select 1 from base) then null else (
 select jsonb_build_object(
  'contract_version','artisan_public_profile_v4','artisan_id',b.id,'public_slug',nullif(btrim(b.public_slug),''),
  'identity',jsonb_build_object('display_name',coalesce(nullif(btrim(b.full_name),''),nullif(btrim(b.name),''),'Artisan FIXEO'),'photo_url',nullif(btrim(b.photo_url),''),'photo_state',case when nullif(btrim(b.photo_url),'') is null then 'missing' else 'provided' end,'description',nullif(btrim(b.description),''),'experience_declared',nullif(btrim(b.experience),'')),
  'services',jsonb_build_object('primary',coalesce(nullif(btrim(b.service_category),''),nullif(btrim(b.category),'')),'additional',b.extra_categories,'legacy_services',coalesce(b.services,'[]'::jsonb)),
  'coverage',jsonb_build_object('primary_city',nullif(btrim(b.city),''),'work_zone',nullif(btrim(b.work_zone),''),'additional_cities',b.extra_cities),
  'trust',jsonb_build_object('profile_status',b.public_status,'is_claimed',b.public_status in ('claimed','onboarded','verified'),'is_onboarded',b.public_status in ('onboarded','verified'),'is_verified',b.public_status='verified','label',case b.public_status when 'verified' then 'Profil vérifié' when 'onboarded' then 'Profil complété' when 'claimed' then 'Profil revendiqué' when 'claim_in_progress' then 'Revendication en cours' else 'Profil référencé sur FIXEO' end,'verified_review_count',coalesce(b.verified_review_count,0),'verified_average_rating',b.verified_avg_rating),
  'availability',jsonb_build_object('status','confirmation_required','label','Disponibilité à confirmer','legacy_declared_status',nullif(btrim(b.availability),''),'operational_capacity_proven',false),
  'metrics',jsonb_build_object(
    'completed_interventions',case when b.completed_count>0 then b.completed_count else null end,
    'verified_review_count',case when b.verified_review_count>0 then b.verified_review_count else null end,
    'verified_average_rating',case when b.verified_review_count>0 then b.verified_avg_rating else null end,
    'average_response_minutes',case when b.accepted_count>=3 and b.avg_response_minutes is not null then b.avg_response_minutes else null end
  ),
  'reviews',jsonb_build_object('items',b.verified_review_items,'can_submit_requires_eligible_mission',true),
  'portfolio',b.portfolio_items,
  'provenance',jsonb_build_object('identity','artisan_record','experience','artisan_declared','reviews','verified_reviews_only','metrics','missions_and_verified_reviews_only','availability','confirmation_required','pricing','not_in_contract')
 ) from base b
) end;
$function$;
