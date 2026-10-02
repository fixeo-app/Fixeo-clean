-- FIXEO Mobile M4 Mission Terrain
-- Canonical state remains in public.service_requests/public.missions.
-- Auxiliary mobile-only evidence, arrival and governed change data is isolated.

create schema if not exists fixeo_private;

create table if not exists fixeo_private.mobile_mission_events_v1 (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  actor_user_id uuid not null,
  event_type text not null check (event_type in ('arrived','started','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (mission_id, event_type)
);
alter table fixeo_private.mobile_mission_events_v1 enable row level security;
revoke all on table fixeo_private.mobile_mission_events_v1 from public, anon, authenticated;
grant all on table fixeo_private.mobile_mission_events_v1 to service_role;

create table if not exists public.mobile_mission_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  uploaded_by uuid not null,
  kind text not null check (kind in ('before','after')),
  storage_path text not null unique,
  mime_type text not null,
  status text not null default 'pending' check (status in ('pending','ready','rejected')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table public.mobile_mission_evidence_v1 enable row level security;
revoke all on table public.mobile_mission_evidence_v1 from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_mission_evidence_v1 to service_role;

create index if not exists mobile_mission_evidence_mission_idx
  on public.mobile_mission_evidence_v1 (mission_id, created_at desc);

create table if not exists fixeo_private.mobile_mission_change_proposals_v1 (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  proposed_price numeric not null check (proposed_price > 0 and proposed_price <= 500000),
  reason text not null,
  supplies text,
  estimated_duration text,
  version integer not null default 1 check (version > 0),
  status text not null default 'submitted'
    check (status in ('submitted','presented','rejected_by_fixeo','client_accepted','client_rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  client_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table fixeo_private.mobile_mission_change_proposals_v1 enable row level security;
revoke all on table fixeo_private.mobile_mission_change_proposals_v1 from public, anon, authenticated;
grant all on table fixeo_private.mobile_mission_change_proposals_v1 to service_role;

create unique index if not exists mobile_mission_change_one_active_idx
  on fixeo_private.mobile_mission_change_proposals_v1 (mission_id)
  where status in ('submitted','presented');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mission-evidence-private-v1',
  'mission-evidence-private-v1',
  false,
  26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.get_my_client_mission_detail_v1(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select jsonb_build_object(
    'ok', true,
    'mission_id', m.id,
    'request_id', sr.id,
    'mission_status', m.status,
    'request_status', sr.status,
    'accepted_at', m.accepted_at,
    'agreed_price', m.agreed_price,
    'service_category', sr.service_category,
    'city', sr.city,
    'urgency', sr.urgency,
    'description', sr.description,
    'artisan_name', coalesce(a.full_name, a.name, 'Artisan FIXEO'),
    'artisan_verified', coalesce(a.verified,false) or coalesce(a.is_verified,false)
  )
  into v_result
  from public.missions m
  join public.service_requests sr on sr.id::text=m.request_id
  join public.artisans a on a.id=m.artisan_profile_id
  where m.id=p_mission_id
    and sr.client_profile_id=v_uid
    and m.status in ('pending','done','validated');

  if v_result is null then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found_or_not_owned');
  end if;

  return v_result;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_my_current_artisan_mission_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_artisan_id uuid;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select a.id into v_artisan_id
  from public.artisans a
  where a.owner_user_id = v_uid
  order by a.updated_at desc nulls last, a.id
  limit 1;

  if v_artisan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  end if;

  select jsonb_build_object(
    'ok', true,
    'mission', jsonb_build_object(
      'mission_id', m.id,
      'request_id', sr.id,
      'mission_status', m.status,
      'request_status', sr.status,
      'accepted_at', m.accepted_at,
      'service_category', sr.service_category,
      'city', sr.city,
      'urgency', sr.urgency,
      'description', sr.description,
      'client_phone', sr.client_phone,
      'agreed_price', m.agreed_price
    )
  )
  into v_result
  from public.missions m
  join public.service_requests sr on sr.id::text = m.request_id
  where m.artisan_profile_id = v_artisan_id
    and m.status in ('pending','done')
    and sr.status in ('assigned','in_progress','completed')
  order by m.accepted_at desc nulls last, m.created_at desc
  limit 1;

  if v_result is null then
    return jsonb_build_object('ok', true, 'mission', null);
  end if;

  return v_result;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_my_current_client_mission_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select jsonb_build_object(
    'ok', true,
    'mission', jsonb_build_object(
      'mission_id', m.id,
      'request_id', sr.id,
      'mission_status', m.status,
      'request_status', sr.status,
      'accepted_at', m.accepted_at,
      'service_category', sr.service_category,
      'city', sr.city,
      'urgency', sr.urgency,
      'description', sr.description,
      'artisan_name', coalesce(a.full_name, a.name, 'Artisan FIXEO'),
      'artisan_verified', coalesce(a.verified, false) or coalesce(a.is_verified, false),
      'agreed_price', m.agreed_price
    )
  )
  into v_result
  from public.service_requests sr
  join public.missions m on m.request_id = sr.id::text
  join public.artisans a on a.id = m.artisan_profile_id
  where sr.client_profile_id = v_uid
    and sr.status in ('assigned','in_progress','completed')
    and m.status in ('pending','done')
  order by m.accepted_at desc nulls last, m.created_at desc
  limit 1;

  if v_result is null then
    return jsonb_build_object('ok', true, 'mission', null);
  end if;

  return v_result;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_my_current_client_request_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'request_id', sr.id,
      'service_category', sr.service_category,
      'city', sr.city,
      'description', sr.description,
      'urgency', sr.urgency,
      'status', sr.status,
      'created_at', sr.created_at
    )
  )
  into v_result
  from public.service_requests sr
  where sr.client_profile_id = v_uid
    and sr.status = 'new'
  order by sr.created_at desc
  limit 1;

  if v_result is null then
    return jsonb_build_object('ok', true, 'request', null);
  end if;
  return v_result;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_my_mission_timeline_v1(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_events jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select exists (
    select 1
    from public.missions m
    join public.service_requests sr on sr.id::text = m.request_id
    left join public.artisans a on a.id = m.artisan_profile_id
    where m.id = p_mission_id
      and (sr.client_profile_id = v_uid or a.owner_user_id = v_uid)
  ) into v_allowed;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found_or_not_owned');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_type', e.event_type,
        'created_at', e.created_at,
        'metadata', e.metadata
      )
      order by e.created_at
    ),
    '[]'::jsonb
  )
  into v_events
  from fixeo_private.mobile_mission_events_v1 e
  where e.mission_id = p_mission_id;

  return jsonb_build_object('ok', true, 'events', v_events);
end;
$function$

CREATE OR REPLACE FUNCTION public.get_my_mobile_mission_change_v1(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_client boolean := false;
  v_is_artisan boolean := false;
  v_row fixeo_private.mobile_mission_change_proposals_v1%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select
    sr.client_profile_id=v_uid,
    a.owner_user_id=v_uid
  into v_is_client, v_is_artisan
  from public.missions m
  join public.service_requests sr on sr.id::text=m.request_id
  join public.artisans a on a.id=m.artisan_profile_id
  where m.id=p_mission_id;

  if not coalesce(v_is_client,false) and not coalesce(v_is_artisan,false) then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found_or_not_owned');
  end if;

  select * into v_row
  from fixeo_private.mobile_mission_change_proposals_v1
  where mission_id=p_mission_id
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'proposal', null);
  end if;

  if v_is_client and v_row.status not in ('presented','client_accepted','client_rejected') then
    return jsonb_build_object('ok', true, 'proposal', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'proposal', jsonb_build_object(
      'id', v_row.id,
      'mission_id', v_row.mission_id,
      'proposed_price', v_row.proposed_price,
      'reason', v_row.reason,
      'supplies', v_row.supplies,
      'estimated_duration', v_row.estimated_duration,
      'version', v_row.version,
      'status', v_row.status,
      'review_reason', v_row.review_reason,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    )
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.mark_my_mission_arrived_v1(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_artisan_id uuid;
  v_request_id uuid;
  v_request_status text;
  v_mission_status text;
  v_client_id uuid;
  v_inserted integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select a.id into v_artisan_id
  from public.artisans a
  where a.owner_user_id = v_uid
  order by a.updated_at desc nulls last, a.id
  limit 1;

  if v_artisan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  end if;

  select sr.id, sr.status, sr.client_profile_id, m.status
  into v_request_id, v_request_status, v_client_id, v_mission_status
  from public.missions m
  join public.service_requests sr on sr.id::text = m.request_id
  where m.id = p_mission_id
    and m.artisan_profile_id = v_artisan_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found_or_not_owned');
  end if;

  if v_mission_status <> 'pending' or v_request_status not in ('assigned','in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_mission_state');
  end if;

  insert into fixeo_private.mobile_mission_events_v1(
    mission_id, actor_user_id, event_type, metadata
  )
  values (p_mission_id, v_uid, 'arrived', '{}'::jsonb)
  on conflict (mission_id, event_type) do nothing;

  get diagnostics v_inserted = row_count;

  if v_client_id is not null then
    insert into public.notifications(
      recipient_user_id, recipient_role, type, title, message,
      related_entity_type, related_entity_id, metadata
    )
    select
      v_client_id, 'client', 'c_artisan_arrived', 'Votre artisan est arrivé',
      'Votre artisan FIXEO est arrivé sur place.',
      'mission', v_request_id::text,
      jsonb_build_object('source','mobile_m4','event','artisan_arrived','mission_id',p_mission_id)
    where not exists (
      select 1 from public.notifications n
      where n.recipient_user_id = v_client_id
        and n.type = 'c_artisan_arrived'
        and n.related_entity_id = v_request_id::text
        and n.metadata @> jsonb_build_object('event','artisan_arrived','mission_id',p_mission_id)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mission_id', p_mission_id,
    'request_id', v_request_id,
    'already_arrived', v_inserted = 0
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.respond_mobile_mission_change_v1(p_proposal_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row fixeo_private.mobile_mission_change_proposals_v1%rowtype;
  v_client_id uuid;
  v_artisan_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select p.* into v_row
  from fixeo_private.mobile_mission_change_proposals_v1 p
  join public.service_requests sr on sr.id=p.request_id
  where p.id=p_proposal_id
    and sr.client_profile_id=v_uid
  for update of p;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'proposal_not_found_or_not_owned');
  end if;

  if v_row.status in ('client_accepted','client_rejected') then
    return jsonb_build_object('ok', true, 'proposal_id', v_row.id, 'status', v_row.status, 'already_decided', true);
  end if;

  if v_row.status <> 'presented' then
    return jsonb_build_object('ok', false, 'reason', 'proposal_not_presented');
  end if;

  update fixeo_private.mobile_mission_change_proposals_v1
  set status = case when p_approve then 'client_accepted' else 'client_rejected' end,
      client_decided_at = now(),
      updated_at = now()
  where id=v_row.id
  returning * into v_row;

  if p_approve then
    update public.missions
    set agreed_price = v_row.proposed_price
    where id=v_row.mission_id
      and status='pending';
  end if;

  select sr.client_profile_id, a.owner_user_id
  into v_client_id, v_artisan_owner
  from public.service_requests sr
  join public.artisans a on a.id=v_row.artisan_id
  where sr.id=v_row.request_id;

  if v_artisan_owner is not null then
    insert into public.notifications(
      recipient_user_id, recipient_role, type, title, message,
      related_entity_type, related_entity_id, metadata
    )
    values (
      v_artisan_owner, 'artisan',
      case when p_approve then 'a_mission_change_accepted' else 'a_mission_change_rejected_client' end,
      case when p_approve then 'Ajustement accepté' else 'Ajustement refusé' end,
      case when p_approve then 'Le client a accepté l’ajustement vérifié par FIXEO.' else 'Le client a refusé l’ajustement.' end,
      'mission_change', v_row.id::text,
      jsonb_build_object('source','mobile_m4','mission_id',v_row.mission_id,'event',
        case when p_approve then 'change_client_accepted' else 'change_client_rejected' end)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'proposal_id', v_row.id,
    'status', v_row.status,
    'agreed_price', case when p_approve then v_row.proposed_price else null end
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.review_mobile_mission_change_v1(p_proposal_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row fixeo_private.mobile_mission_change_proposals_v1%rowtype;
  v_client_id uuid;
  v_artisan_owner uuid;
begin
  if v_uid is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into v_row
  from fixeo_private.mobile_mission_change_proposals_v1
  where id = p_proposal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'proposal_not_found');
  end if;

  if v_row.status <> 'submitted' then
    return jsonb_build_object('ok', true, 'proposal_id', v_row.id, 'status', v_row.status, 'already_reviewed', true);
  end if;

  select sr.client_profile_id, a.owner_user_id
  into v_client_id, v_artisan_owner
  from public.service_requests sr
  join public.artisans a on a.id = v_row.artisan_id
  where sr.id = v_row.request_id;

  update fixeo_private.mobile_mission_change_proposals_v1
  set status = case when p_approve then 'presented' else 'rejected_by_fixeo' end,
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_reason = nullif(trim(p_reason),''),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  if p_approve and v_client_id is not null then
    insert into public.notifications(
      recipient_user_id, recipient_role, type, title, message,
      related_entity_type, related_entity_id, metadata
    )
    values (
      v_client_id, 'client', 'c_mission_change_presented',
      'Ajustement à valider',
      'FIXEO a vérifié un ajustement proposé pendant l’intervention.',
      'mission_change', v_row.id::text,
      jsonb_build_object('source','mobile_m4','event','change_presented','mission_id',v_row.mission_id)
    );
  elsif not p_approve and v_artisan_owner is not null then
    insert into public.notifications(
      recipient_user_id, recipient_role, type, title, message,
      related_entity_type, related_entity_id, metadata
    )
    values (
      v_artisan_owner, 'artisan', 'a_mission_change_rejected',
      'Ajustement non retenu',
      'FIXEO n’a pas validé l’ajustement proposé.',
      'mission_change', v_row.id::text,
      jsonb_build_object('source','mobile_m4','event','change_rejected','mission_id',v_row.mission_id)
    );
  end if;

  return jsonb_build_object('ok', true, 'proposal_id', v_row.id, 'status', v_row.status);
end;
$function$

CREATE OR REPLACE FUNCTION public.submit_mobile_mission_change_v1(p_mission_id uuid, p_proposed_price numeric, p_reason text, p_supplies text DEFAULT NULL::text, p_estimated_duration text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_artisan_id uuid;
  v_request_id uuid;
  v_request_status text;
  v_mission_status text;
  v_existing fixeo_private.mobile_mission_change_proposals_v1%rowtype;
  v_row fixeo_private.mobile_mission_change_proposals_v1%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if p_proposed_price is null or p_proposed_price <= 0 or p_proposed_price > 500000
     or p_proposed_price <> round(p_proposed_price, 2) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_price');
  end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 2000
     or length(coalesce(p_supplies,'')) > 4000
     or length(coalesce(p_estimated_duration,'')) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_scope');
  end if;

  select a.id into v_artisan_id
  from public.artisans a
  where a.owner_user_id = v_uid
  order by a.updated_at desc nulls last, a.id
  limit 1;

  if v_artisan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  end if;

  select sr.id, sr.status, m.status
  into v_request_id, v_request_status, v_mission_status
  from public.missions m
  join public.service_requests sr on sr.id::text = m.request_id
  where m.id = p_mission_id
    and m.artisan_profile_id = v_artisan_id
  for update of m, sr;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found_or_not_owned');
  end if;
  if v_mission_status <> 'pending' or v_request_status not in ('assigned','in_progress') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_mission_state');
  end if;

  select * into v_existing
  from fixeo_private.mobile_mission_change_proposals_v1 p
  where p.mission_id = p_mission_id
    and p.status in ('submitted','presented')
  limit 1
  for update;

  if found and v_existing.status = 'presented' then
    return jsonb_build_object(
      'ok', true,
      'proposal_id', v_existing.id,
      'status', v_existing.status,
      'version', v_existing.version,
      'locked_for_client_decision', true
    );
  end if;

  if found then
    if v_existing.proposed_price = p_proposed_price
       and v_existing.reason = trim(p_reason)
       and v_existing.supplies is not distinct from nullif(trim(p_supplies),'')
       and v_existing.estimated_duration is not distinct from nullif(trim(p_estimated_duration),'') then
      v_row := v_existing;
    else
      update fixeo_private.mobile_mission_change_proposals_v1
      set proposed_price = p_proposed_price,
          reason = trim(p_reason),
          supplies = nullif(trim(p_supplies),''),
          estimated_duration = nullif(trim(p_estimated_duration),''),
          version = version + 1,
          updated_at = now()
      where id = v_existing.id
      returning * into v_row;
    end if;
  else
    insert into fixeo_private.mobile_mission_change_proposals_v1(
      mission_id, request_id, artisan_id, proposed_price, reason, supplies, estimated_duration
    )
    values (
      p_mission_id, v_request_id, v_artisan_id, p_proposed_price, trim(p_reason),
      nullif(trim(p_supplies),''), nullif(trim(p_estimated_duration),'')
    )
    returning * into v_row;
  end if;

  insert into public.notifications(
    recipient_user_id, recipient_role, type, title, message,
    related_entity_type, related_entity_id, metadata
  )
  select
    null, 'admin', 'adm_mission_change_submitted',
    'Ajustement terrain à vérifier',
    'Un artisan a soumis un ajustement de mission.',
    'mission_change', v_row.id::text,
    jsonb_build_object('source','mobile_m4','event','change_submitted','version',v_row.version)
  where not exists (
    select 1 from public.notifications n
    where n.type='adm_mission_change_submitted'
      and n.related_entity_id=v_row.id::text
      and n.metadata @> jsonb_build_object('version',v_row.version)
  );

  return jsonb_build_object(
    'ok', true,
    'proposal_id', v_row.id,
    'status', v_row.status,
    'version', v_row.version
  );
end;
$function$

-- Explicit API grants.
revoke all on function public.get_my_current_artisan_mission_v1() from public;
revoke all on function public.get_my_current_artisan_mission_v1() from anon;
grant execute on function public.get_my_current_artisan_mission_v1() to authenticated;

revoke all on function public.get_my_current_client_mission_v1() from public;
revoke all on function public.get_my_current_client_mission_v1() from anon;
grant execute on function public.get_my_current_client_mission_v1() to authenticated;

revoke all on function public.get_my_current_client_request_v1() from public;
revoke all on function public.get_my_current_client_request_v1() from anon;
grant execute on function public.get_my_current_client_request_v1() to authenticated;

revoke all on function public.get_my_client_mission_detail_v1(uuid) from public;
revoke all on function public.get_my_client_mission_detail_v1(uuid) from anon;
grant execute on function public.get_my_client_mission_detail_v1(uuid) to authenticated;

revoke all on function public.mark_my_mission_arrived_v1(uuid) from public;
revoke all on function public.mark_my_mission_arrived_v1(uuid) from anon;
grant execute on function public.mark_my_mission_arrived_v1(uuid) to authenticated;

revoke all on function public.get_my_mission_timeline_v1(uuid) from public;
revoke all on function public.get_my_mission_timeline_v1(uuid) from anon;
grant execute on function public.get_my_mission_timeline_v1(uuid) to authenticated;

revoke all on function public.submit_mobile_mission_change_v1(uuid,numeric,text,text,text) from public;
revoke all on function public.submit_mobile_mission_change_v1(uuid,numeric,text,text,text) from anon;
grant execute on function public.submit_mobile_mission_change_v1(uuid,numeric,text,text,text) to authenticated;

revoke all on function public.review_mobile_mission_change_v1(uuid,boolean,text) from public;
revoke all on function public.review_mobile_mission_change_v1(uuid,boolean,text) from anon;
grant execute on function public.review_mobile_mission_change_v1(uuid,boolean,text) to authenticated;

revoke all on function public.respond_mobile_mission_change_v1(uuid,boolean) from public;
revoke all on function public.respond_mobile_mission_change_v1(uuid,boolean) from anon;
grant execute on function public.respond_mobile_mission_change_v1(uuid,boolean) to authenticated;

revoke all on function public.get_my_mobile_mission_change_v1(uuid) from public;
revoke all on function public.get_my_mobile_mission_change_v1(uuid) from anon;
grant execute on function public.get_my_mobile_mission_change_v1(uuid) to authenticated;
