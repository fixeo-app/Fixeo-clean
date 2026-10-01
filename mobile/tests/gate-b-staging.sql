-- FIXEO Mobile M3 / Gate B server-side transactional certification.
-- STAGING ONLY. Every mutation is rolled back.
begin;
create temp table gate_b_result(result jsonb) on commit drop;

do $$
declare
  v_client uuid; v_uid1 uuid; v_uid2 uuid; v_art1 uuid; v_art2 uuid; v_req uuid;
  v_offers jsonb; v_accept1 jsonb; v_accept2 jsonb; v_notify jsonb;
  v_q integer; v_pending integer; v_accepted integer; v_cancelled integer; v_notif integer; v_status text;
begin
  select id into v_client from public.users where role='client' order by id limit 1;
  select owner_user_id into v_uid1 from public.artisans where owner_user_id is not null order by id limit 1;
  select owner_user_id into v_uid2 from public.artisans where owner_user_id is not null and owner_user_id is distinct from v_uid1 order by id limit 1;
  if v_client is null or v_uid1 is null or v_uid2 is null then raise exception 'GATE_B_FIXTURE_IDENTITIES_MISSING'; end if;

  select id into v_art1 from public.artisans where owner_user_id=v_uid1 limit 1;
  select id into v_art2 from public.artisans where owner_user_id=v_uid2 limit 1;

  update public.artisans set availability='unavailable';
  update public.artisans set availability='available',service_category='plomberie',city='Fès',work_zone='Fès'
   where id in(v_art1,v_art2);

  perform set_config('request.jwt.claim.sub',v_client::text,true);
  select (public.create_my_service_request_v1(
    'plomberie','Fès','MOBILE_GATE_B_TRANSACTIONAL_FIXTURE',
    '4fd64210-1bc8-4e10-9f6c-2b8b31f9f202'::uuid
  )).id into v_req;

  select count(*) into v_q from public.dispatch_execution_queue
   where request_id=v_req and artisan_id in(v_art1,v_art2) and execution_status='QUEUED';
  if v_q<2 then raise exception 'GATE_B_QUEUE_EXPECTED_2_GOT_%',v_q; end if;

  perform set_config('request.jwt.claim.sub',v_uid1::text,true);
  v_offers:=public.get_my_dispatch_offers_v1();
  if not exists(select 1 from jsonb_array_elements(coalesce(v_offers->'offers','[]'::jsonb)) x where x->>'request_id'=v_req::text)
    then raise exception 'GATE_B_FIRST_ARTISAN_OFFER_NOT_VISIBLE'; end if;

  v_accept1:=public.accept_my_dispatch_offer_v1(v_req);
  if coalesce((v_accept1->>'ok')::boolean,false) is not true then raise exception 'GATE_B_FIRST_ACCEPT_FAILED_%',v_accept1::text; end if;
  v_notify:=public.publish_notification_event_s1b('mission_accepted',v_req);

  perform set_config('request.jwt.claim.sub',v_uid2::text,true);
  v_accept2:=public.accept_my_dispatch_offer_v1(v_req);
  if coalesce((v_accept2->>'ok')::boolean,false) is true
     or coalesce(v_accept2->>'reason','') not in('already_claimed','offer_not_active')
    then raise exception 'GATE_B_SECOND_ACCEPT_SHOULD_LOSE_%',v_accept2::text; end if;

  select status into v_status from public.service_requests where id=v_req;
  select count(*) into v_pending from public.missions where request_id=v_req::text and status='pending';
  select count(*) into v_accepted from public.dispatch_execution_queue where request_id=v_req and execution_status='ACCEPTED';
  select count(*) into v_cancelled from public.dispatch_execution_queue where request_id=v_req and execution_status='CANCELLED';
  select count(*) into v_notif from public.notifications
   where recipient_user_id=v_client and related_entity_id=v_req::text and type='c_artisan_assigned';

  if v_status<>'assigned' then raise exception 'GATE_B_REQUEST_NOT_ASSIGNED_%',v_status; end if;
  if v_pending<>1 then raise exception 'GATE_B_PENDING_MISSION_COUNT_%',v_pending; end if;
  if v_accepted<>1 then raise exception 'GATE_B_ACCEPTED_QUEUE_COUNT_%',v_accepted; end if;
  if v_cancelled<1 then raise exception 'GATE_B_CANCELLED_QUEUE_COUNT_%',v_cancelled; end if;
  if v_notif<>1 then raise exception 'GATE_B_CLIENT_NOTIFICATION_COUNT_%',v_notif; end if;

  insert into gate_b_result values(jsonb_build_object(
    'gate','M3_SERVER_MAGIC_LOOP','status','PASS','queue_candidates',v_q,
    'request_status',v_status,'pending_missions',v_pending,'accepted_queue',v_accepted,
    'cancelled_queue',v_cancelled,'client_notifications',v_notif,
    'loser_reason',v_accept2->>'reason','notification_rpc_ok',coalesce((v_notify->>'ok')::boolean,false)
  ));
end $$;

select result from gate_b_result;
rollback;
