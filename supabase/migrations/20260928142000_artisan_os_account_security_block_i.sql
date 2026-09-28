-- Artisan OS Final Master — Block I Account & Security
-- Applied to production Supabase before repository materialization.
begin;

create or replace function public.update_my_artisan_contact_v1(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_digits text;
  v_phone text;
  v_artisan_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'reason','unauthenticated');
  end if;

  select a.id into v_artisan_id
  from public.artisans a
  where a.owner_user_id = v_uid
  limit 1
  for update;

  if v_artisan_id is null then
    return jsonb_build_object('ok',false,'reason','artisan_not_found');
  end if;

  v_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');

  if v_digits ~ '^212[5-7][0-9]{8}$' then
    v_phone := '0' || substr(v_digits,4);
  elsif v_digits ~ '^[5-7][0-9]{8}$' then
    v_phone := '0' || v_digits;
  elsif v_digits ~ '^0[5-7][0-9]{8}$' then
    v_phone := v_digits;
  else
    return jsonb_build_object('ok',false,'reason','invalid_phone','message','Numéro marocain invalide.');
  end if;

  update public.users set phone=v_phone where id=v_uid;
  update public.profiles set phone=v_phone where id=v_uid;
  update public.artisans
     set phone=v_phone, phone_public=v_phone, updated_at=now()
   where id=v_artisan_id and owner_user_id=v_uid;

  return jsonb_build_object('ok',true,'phone',v_phone,'artisan_id',v_artisan_id);
end
$$;

revoke all on function public.update_my_artisan_contact_v1(text) from public, anon;
grant execute on function public.update_my_artisan_contact_v1(text) to authenticated, service_role;

create or replace function public.sync_my_account_email_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'reason','unauthenticated');
  end if;

  if not exists(select 1 from public.artisans a where a.owner_user_id=v_uid) then
    return jsonb_build_object('ok',false,'reason','artisan_not_found');
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id=v_uid;

  if coalesce(v_email,'')='' then
    return jsonb_build_object('ok',false,'reason','email_missing');
  end if;

  update public.users set email=v_email where id=v_uid;
  update public.profiles set email=v_email where id=v_uid;

  return jsonb_build_object('ok',true,'email',v_email);
end
$$;

revoke all on function public.sync_my_account_email_v1() from public, anon;
grant execute on function public.sync_my_account_email_v1() to authenticated, service_role;

commit;
