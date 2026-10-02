-- B3.2-B3.4 — public metrics, verified review feed, secure review submission
-- Additive public contract; no pricing authority.

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
  from public.portfolio_items pi where pi.artisan_id=p_artisan_id::text
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

create unique index if not exists reviews_one_per_mission_idx on public.reviews(mission_id);

drop policy if exists reviews_anon_insert on public.reviews;
drop policy if exists reviews_client_insert on public.reviews;
revoke insert, update, delete, truncate on public.reviews from anon, authenticated;

create or replace function public.submit_artisan_review_v1(
  p_mission_id uuid,
  p_rating smallint,
  p_review_text text default null,
  p_response_time_score smallint default null,
  p_quality_score smallint default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_m public.missions%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_rating<1 or p_rating>5 then raise exception 'RATING_INVALID'; end if;
  if p_response_time_score is not null and (p_response_time_score<1 or p_response_time_score>5) then raise exception 'RESPONSE_SCORE_INVALID'; end if;
  if p_quality_score is not null and (p_quality_score<1 or p_quality_score>5) then raise exception 'QUALITY_SCORE_INVALID'; end if;

  select * into v_m from public.missions where id=p_mission_id for share;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;
  if v_m.client_profile_id is distinct from v_uid then raise exception 'MISSION_FORBIDDEN'; end if;
  if v_m.artisan_profile_id is null then raise exception 'ARTISAN_NOT_ASSIGNED'; end if;
  if not (v_m.status in ('done','validated') or v_m.completed_at is not null or v_m.validated_at is not null) then raise exception 'MISSION_NOT_COMPLETED'; end if;

  insert into public.reviews(mission_id,artisan_id,client_profile_id,rating,review_text,verified,response_time_score,quality_score)
  values(v_m.id,v_m.artisan_profile_id,v_uid,p_rating,nullif(btrim(p_review_text),''),true,p_response_time_score,p_quality_score)
  on conflict(mission_id) do update set
    rating=excluded.rating,review_text=excluded.review_text,response_time_score=excluded.response_time_score,quality_score=excluded.quality_score
  returning id into v_id;

  return jsonb_build_object('ok',true,'review_id',v_id,'verified',true);
end;
$function$;

revoke all on function public.submit_artisan_review_v1(uuid,smallint,text,smallint,smallint) from public,anon;
grant execute on function public.submit_artisan_review_v1(uuid,smallint,text,smallint,smallint) to authenticated;

create or replace function public.my_review_eligibility_v1(p_artisan_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $function$
select case when auth.uid() is null then jsonb_build_object('authenticated',false,'eligible',false)
else coalesce((
 select jsonb_build_object('authenticated',true,'eligible',true,'mission_id',m.id,'already_reviewed',exists(select 1 from public.reviews r where r.mission_id=m.id))
 from public.missions m
 where m.client_profile_id=auth.uid() and m.artisan_profile_id=p_artisan_id
   and (m.status in ('done','validated') or m.completed_at is not null or m.validated_at is not null)
 order by coalesce(m.validated_at,m.completed_at,m.created_at) desc limit 1
),jsonb_build_object('authenticated',true,'eligible',false)) end;
$function$;
revoke all on function public.my_review_eligibility_v1(uuid) from public,anon;
grant execute on function public.my_review_eligibility_v1(uuid) to authenticated;
