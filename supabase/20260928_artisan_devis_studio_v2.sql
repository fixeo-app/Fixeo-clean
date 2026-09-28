-- Artisan Devis Studio V2 — applied to production 2026-09-28
begin;
alter table public.quotes add column if not exists service_description text, add column if not exists supplies_description text, add column if not exists estimated_duration text, add column if not exists submitted_at timestamptz;
create unique index if not exists quotes_one_active_per_artisan_request on public.quotes(request_id,artisan_profile_id) where status in ('pending','accepted');

create or replace function public.submit_artisan_quote_v2(p_request_id uuid,p_proposed_price numeric,p_service_description text default null,p_supplies_description text default null,p_estimated_duration text default null,p_message text default null)
returns public.quotes language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_artisan public.artisans%rowtype; v_req public.service_requests%rowtype; v_quote public.quotes%rowtype;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_proposed_price is null or p_proposed_price<=0 then raise exception 'INVALID_PRICE'; end if;
 if length(coalesce(trim(p_service_description),''))<5 then raise exception 'SERVICE_DESCRIPTION_REQUIRED'; end if;
 select * into v_artisan from public.artisans where owner_user_id=v_uid order by updated_at desc nulls last limit 1;
 if not found then raise exception 'ARTISAN_NOT_FOUND'; end if;
 select * into v_req from public.service_requests where id=p_request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if v_req.status<>'new' then raise exception 'REQUEST_NOT_QUOTABLE'; end if;
 if lower(trim(coalesce(v_req.city,'')))<>lower(trim(coalesce(v_artisan.city,''))) then raise exception 'CITY_MISMATCH'; end if;
 if lower(trim(coalesce(v_req.service_category,''))) not in (lower(trim(coalesce(v_artisan.service_category,''))),lower(trim(coalesce(v_artisan.category,'')))) and not coalesce(v_artisan.services,'[]'::jsonb) ? v_req.service_category then raise exception 'TRADE_MISMATCH'; end if;
 select * into v_quote from public.quotes where request_id=p_request_id and artisan_profile_id=v_artisan.id and status in ('pending','accepted') order by created_at desc limit 1 for update;
 if found then
  if v_quote.status='accepted' then raise exception 'QUOTE_ALREADY_ACCEPTED'; end if;
  update public.quotes set proposed_price=p_proposed_price,service_description=nullif(trim(p_service_description),''),supplies_description=nullif(trim(p_supplies_description),''),estimated_duration=nullif(trim(p_estimated_duration),''),message=nullif(trim(p_message),''),submitted_at=now() where id=v_quote.id returning * into v_quote;
 else
  insert into public.quotes(request_id,artisan_profile_id,proposed_price,message,status,service_description,supplies_description,estimated_duration,submitted_at) values(p_request_id,v_artisan.id,p_proposed_price,nullif(trim(p_message),''),'pending',nullif(trim(p_service_description),''),nullif(trim(p_supplies_description),''),nullif(trim(p_estimated_duration),''),now()) returning * into v_quote;
 end if;
 if v_req.client_profile_id is not null then insert into public.notifications(recipient_user_id,recipient_role,type,title,message,related_entity_type,related_entity_id,metadata) values(v_req.client_profile_id,'client','quote_received','Nouveau devis FIXEO','Un artisan a transmis un devis pour votre demande.','quote',v_quote.id::text,jsonb_build_object('quote_id',v_quote.id,'request_id',v_req.id)); end if;
 return v_quote;
end $$;

create or replace function public.accept_quote_v2(p_quote_id uuid) returns public.missions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_quote public.quotes%rowtype; v_req public.service_requests%rowtype; v_mission public.missions%rowtype; v_artisan_uid uuid;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_quote from public.quotes where id=p_quote_id for update; if not found or v_quote.status<>'pending' then raise exception 'QUOTE_NOT_PENDING'; end if;
 select * into v_req from public.service_requests where id=v_quote.request_id for update; if not found or v_req.client_profile_id is distinct from v_uid then raise exception 'FORBIDDEN'; end if;
 update public.quotes set status='accepted' where id=v_quote.id; update public.quotes set status='rejected' where request_id=v_req.id and id<>v_quote.id and status='pending';
 select * into v_mission from public.missions where request_id=v_req.id::text order by created_at desc limit 1 for update;
 if not found then insert into public.missions(request_id,client_profile_id,artisan_profile_id,agreed_price,commission_amount,status,accepted_at) values(v_req.id::text,v_req.client_profile_id,v_quote.artisan_profile_id,v_quote.proposed_price,round(v_quote.proposed_price*0.15,2),'validated',now()) returning * into v_mission; end if;
 select owner_user_id into v_artisan_uid from public.artisans where id=v_quote.artisan_profile_id;
 if v_artisan_uid is not null then insert into public.notifications(recipient_user_id,recipient_role,type,title,message,related_entity_type,related_entity_id,metadata) values(v_artisan_uid,'artisan','quote_accepted','Devis accepté','Votre devis a été accepté. La mission est maintenant créée.','mission',v_mission.id::text,jsonb_build_object('quote_id',v_quote.id,'mission_id',v_mission.id,'request_id',v_req.id)); end if;
 return v_mission;
end $$;
revoke all on function public.submit_artisan_quote_v2(uuid,numeric,text,text,text,text) from public,anon; grant execute on function public.submit_artisan_quote_v2(uuid,numeric,text,text,text,text) to authenticated;
revoke all on function public.accept_quote_v2(uuid) from public,anon; grant execute on function public.accept_quote_v2(uuid) to authenticated;
drop policy if exists quotes_update_related_admin on public.quotes;
create policy quotes_update_admin_only on public.quotes for update to authenticated using(public.is_admin()) with check(public.is_admin());
commit;