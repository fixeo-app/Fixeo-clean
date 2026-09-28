-- Devis Studio V2 — secure client refusal
create or replace function public.reject_quote_v2(p_quote_id uuid) returns public.quotes language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_quote public.quotes%rowtype; v_req public.service_requests%rowtype;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_quote from public.quotes where id=p_quote_id for update;
 if not found or v_quote.status<>'pending' then raise exception 'QUOTE_NOT_PENDING'; end if;
 select * into v_req from public.service_requests where id=v_quote.request_id;
 if not found or v_req.client_profile_id is distinct from v_uid then raise exception 'FORBIDDEN'; end if;
 update public.quotes set status='rejected' where id=p_quote_id returning * into v_quote;
 return v_quote;
end $$;
revoke all on function public.reject_quote_v2(uuid) from public,anon;
grant execute on function public.reject_quote_v2(uuid) to authenticated;