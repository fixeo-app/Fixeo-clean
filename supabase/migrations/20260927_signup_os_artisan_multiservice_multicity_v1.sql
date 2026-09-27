-- FIXEO Signup OS — Artisan multi-service / multi-city v1
-- Applied to production before repository publication.
create table if not exists public.artisan_service_categories (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  service_category text not null,
  created_at timestamptz not null default now(),
  primary key (artisan_id, service_category)
);
create table if not exists public.artisan_service_cities (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  city text not null,
  created_at timestamptz not null default now(),
  primary key (artisan_id, city)
);
alter table public.artisan_service_categories enable row level security;
alter table public.artisan_service_cities enable row level security;
revoke all on public.artisan_service_categories from anon, authenticated;
revoke all on public.artisan_service_cities from anon, authenticated;

create or replace function public.finalize_artisan_signup_v1(
  p_full_name text, p_phone text, p_services text[], p_cities text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid(); v_artisan_id uuid; v_name text := trim(coalesce(p_full_name,''));
  v_phone text := trim(coalesce(p_phone,'')); v_services text[]; v_cities text[];
  v_primary_service text; v_primary_city text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
  if not exists(select 1 from public.users u where u.id=v_uid and u.role='artisan') then
    return jsonb_build_object('ok',false,'reason','artisan_role_required'); end if;
  if length(v_name)<3 then return jsonb_build_object('ok',false,'reason','name_required'); end if;
  select coalesce(array_agg(distinct trim(x)) filter(where trim(x)<>''),'{}'::text[]) into v_services
    from unnest(coalesce(p_services,'{}'::text[])) x;
  select coalesce(array_agg(distinct trim(x)) filter(where trim(x)<>''),'{}'::text[]) into v_cities
    from unnest(coalesce(p_cities,'{}'::text[])) x;
  if cardinality(v_services)=0 then return jsonb_build_object('ok',false,'reason','service_required'); end if;
  if cardinality(v_cities)=0 then return jsonb_build_object('ok',false,'reason','city_required'); end if;
  if cardinality(v_services)>12 or cardinality(v_cities)>20 then return jsonb_build_object('ok',false,'reason','too_many_values'); end if;
  v_primary_service:=v_services[1]; v_primary_city:=v_cities[1];
  select a.id into v_artisan_id from public.artisans a where a.owner_user_id=v_uid limit 1 for update;
  if v_artisan_id is null then
    insert into public.artisans(owner_user_id,full_name,name,service_category,category,services,city,work_zone,phone,phone_public,
      claimed,claim_status,onboarding_completed,availability,verified,is_verified,is_public,source,created_at,updated_at)
    values(v_uid,v_name,v_name,v_primary_service,v_primary_service,to_jsonb(v_services),v_primary_city,array_to_string(v_cities,', '),
      nullif(v_phone,''),nullif(v_phone,''),true,'approved',false,'unavailable',false,false,false,'self_signup',now(),now())
    returning id into v_artisan_id;
  else
    update public.artisans set full_name=v_name,name=v_name,service_category=v_primary_service,category=v_primary_service,
      services=to_jsonb(v_services),city=v_primary_city,work_zone=array_to_string(v_cities,', '),
      phone=coalesce(nullif(v_phone,''),phone),phone_public=coalesce(nullif(v_phone,''),phone_public),updated_at=now()
    where id=v_artisan_id;
  end if;
  delete from public.artisan_service_categories where artisan_id=v_artisan_id;
  insert into public.artisan_service_categories select v_artisan_id,x,now() from unnest(v_services)x;
  delete from public.artisan_service_cities where artisan_id=v_artisan_id;
  insert into public.artisan_service_cities select v_artisan_id,x,now() from unnest(v_cities)x;
  update public.profiles set city=v_primary_city where id=v_uid;
  update public.users set city=v_primary_city where id=v_uid;
  return jsonb_build_object('ok',true,'artisan_id',v_artisan_id,'services',to_jsonb(v_services),'cities',to_jsonb(v_cities));
end $$;
revoke all on function public.finalize_artisan_signup_v1(text,text,text[],text[]) from public,anon;
grant execute on function public.finalize_artisan_signup_v1(text,text,text[],text[]) to authenticated;
