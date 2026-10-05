CREATE OR REPLACE FUNCTION public.update_my_artisan_activity_v1(p_services text[], p_cities text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_artisan_id uuid; v_services text[]; v_cities text[];
begin
 if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
 if not exists(select 1 from public.users u where u.id=v_uid and u.role='artisan') then return jsonb_build_object('ok',false,'reason','artisan_role_required'); end if;
 select a.id into v_artisan_id from public.artisans a where a.owner_user_id=v_uid limit 1 for update;
 if v_artisan_id is null then return jsonb_build_object('ok',false,'reason','artisan_not_found'); end if;
 select coalesce(array_agg(distinct trim(x)) filter(where trim(x)<>''),'{}'::text[]) into v_services from unnest(coalesce(p_services,'{}'::text[]))x;
 select coalesce(array_agg(distinct trim(x)) filter(where trim(x)<>''),'{}'::text[]) into v_cities from unnest(coalesce(p_cities,'{}'::text[]))x;
 if cardinality(v_services)=0 or cardinality(v_cities)=0 then return jsonb_build_object('ok',false,'reason','service_and_city_required'); end if;
 if cardinality(v_services)>12 or cardinality(v_cities)>20 then return jsonb_build_object('ok',false,'reason','too_many_values'); end if;
 delete from public.artisan_service_categories where artisan_id=v_artisan_id;
 insert into public.artisan_service_categories(artisan_id,service_category) select v_artisan_id,x from unnest(v_services)x;
 delete from public.artisan_service_cities where artisan_id=v_artisan_id;
 insert into public.artisan_service_cities(artisan_id,city) select v_artisan_id,x from unnest(v_cities)x;
 update public.artisans set service_category=v_services[1],category=v_services[1],services=to_jsonb(v_services),city=v_cities[1],work_zone=array_to_string(v_cities,', '),updated_at=now() where id=v_artisan_id;
 update public.profiles set city=v_cities[1] where id=v_uid;
 update public.users set city=v_cities[1] where id=v_uid;
 return jsonb_build_object('ok',true,'services',to_jsonb(v_services),'cities',to_jsonb(v_cities));
end $function$
;
