-- FIXEO Mobile M5 — RAFI provider quota bridge.
-- Staging-only candidate. No Production/main cutover in this branch.
-- Authenticated callers can only consume fixed mobile voice/photo quotas.
-- They cannot choose quota keys, limits, or reserved budget.

create or replace function public.mobile_rafi_quota_v1(
  p_kind text,
  p_bytes bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_kind text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_kind, '')));
  v_bytes bigint := coalesce(p_bytes, 0);
  v_limits jsonb;
  v_delta jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_kind not in ('voice', 'photo') then
    raise exception 'MOBILE_RAFI_KIND_INVALID';
  end if;

  if v_bytes < 1 then
    raise exception 'MOBILE_RAFI_BYTES_INVALID';
  end if;

  if v_kind = 'voice' then
    if v_bytes > 4194304 then
      raise exception 'MOBILE_RAFI_BYTES_INVALID';
    end if;

    v_limits := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', 'mobile-rafi:voice:global',
        'requests', 3000,
        'sessions', 0,
        'analyses', 0,
        'bytes', 2147483648,
        'reserved_micro_usd', 10000000
      ),
      pg_catalog.jsonb_build_object(
        'key', 'mobile-rafi:voice:u:' || v_uid::text,
        'requests', 30,
        'sessions', 0,
        'analyses', 0,
        'bytes', 100663296,
        'reserved_micro_usd', 150000
      )
    );

    v_delta := pg_catalog.jsonb_build_object(
      'requests', 1,
      'sessions', 0,
      'analyses', 0,
      'bytes', v_bytes,
      'reserved_micro_usd', 5000
    );
  else
    if v_bytes > 8388608 then
      raise exception 'MOBILE_RAFI_BYTES_INVALID';
    end if;

    v_limits := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', 'mobile-rafi:photo:global',
        'requests', 1000,
        'sessions', 0,
        'analyses', 1000,
        'bytes', 4294967296,
        'reserved_micro_usd', 10000000
      ),
      pg_catalog.jsonb_build_object(
        'key', 'mobile-rafi:photo:u:' || v_uid::text,
        'requests', 5,
        'sessions', 0,
        'analyses', 5,
        'bytes', 41943040,
        'reserved_micro_usd', 500000
      )
    );

    v_delta := pg_catalog.jsonb_build_object(
      'requests', 1,
      'sessions', 0,
      'analyses', 1,
      'bytes', v_bytes,
      'reserved_micro_usd', 100000
    );
  end if;

  perform fixeo_private.diagnostic_quota_v1(v_limits, v_delta);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'kind', v_kind
  );
end;
$function$;

revoke all on function public.mobile_rafi_quota_v1(text,bigint) from public;
revoke all on function public.mobile_rafi_quota_v1(text,bigint) from anon;
grant execute on function public.mobile_rafi_quota_v1(text,bigint) to authenticated;
