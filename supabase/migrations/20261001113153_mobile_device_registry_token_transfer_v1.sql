-- Follow-up to Gate A/B mobile device registry.
-- Transfer a provider token safely between app account sessions/installations.
create or replace function public.register_mobile_device_v1(
  p_installation_id uuid,
  p_platform text,
  p_expo_push_token text,
  p_device_model text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_token text := trim(coalesce(p_expo_push_token,''));
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
  if p_installation_id is null then raise exception 'INSTALLATION_ID_REQUIRED'; end if;
  if v_platform not in ('ios','android') then raise exception 'INVALID_PLATFORM'; end if;
  if length(v_token) not between 20 and 255
     or v_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
    then raise exception 'INVALID_PUSH_TOKEN'; end if;
  if length(coalesce(p_device_model,'')) > 120
     or length(coalesce(p_app_version,'')) > 40
    then raise exception 'INVALID_DEVICE_METADATA'; end if;

  delete from public.mobile_devices
   where expo_push_token=v_token
     and (user_id<>v_uid or installation_id<>p_installation_id);

  insert into public.mobile_devices(
    user_id,installation_id,platform,expo_push_token,device_model,app_version,
    enabled,last_seen_at,updated_at
  ) values(
    v_uid,p_installation_id,v_platform,v_token,
    nullif(trim(coalesce(p_device_model,'')),''),
    nullif(trim(coalesce(p_app_version,'')),''),
    true,now(),now()
  )
  on conflict(user_id,installation_id)
  do update set
    platform=excluded.platform,
    expo_push_token=excluded.expo_push_token,
    device_model=excluded.device_model,
    app_version=excluded.app_version,
    enabled=true,last_seen_at=now(),updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'device_id',v_id);
end
$fn$;

revoke all on function public.register_mobile_device_v1(uuid,text,text,text,text) from public,anon;
grant execute on function public.register_mobile_device_v1(uuid,text,text,text,text) to authenticated,service_role;
