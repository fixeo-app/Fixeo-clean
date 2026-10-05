-- FIXEO Mobile M5 — bounded Decision Center bridge.
-- Staging-tested before commit. No Production/main cutover in this branch.
-- The mobile app receives one role-scoped actionable cue derived only from
-- canonical rows it owns or from its own dispatch queue entry.

create or replace function public.get_my_mobile_decision_context_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_mission record;
  v_request record;
  v_offer record;
  v_artisan_id uuid;
begin
  if v_uid is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated',
      'version', 1
    );
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid
  limit 1;

  if v_role = 'client' then
    select
      m.id as mission_id,
      sr.id as request_id,
      sr.status as request_status,
      m.status as mission_status,
      sr.service_category,
      sr.city
    into v_mission
    from public.service_requests sr
    join public.missions m on m.request_id = sr.id::text
    where sr.client_profile_id = v_uid
      and sr.status in ('assigned','in_progress','completed')
      and m.status in ('pending','done')
    order by m.accepted_at desc nulls last, m.created_at desc
    limit 1;

    if found then
      if v_mission.request_status = 'completed' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'client',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'client.confirm_completion',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'high',
            'headline', 'Votre validation est requise',
            'detail', 'L’intervention est terminée. Vérifiez les preuves avant de confirmer.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status),
              pg_catalog.jsonb_build_object('field','mission_status','value',v_mission.mission_status)
            )
          )
        );
      elsif v_mission.request_status = 'in_progress' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'client',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'client.follow_intervention',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'normal',
            'headline', 'Intervention en cours',
            'detail', 'FIXEO suit l’intervention et garde les prochaines étapes visibles.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status)
            )
          )
        );
      else
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'client',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'client.track_assigned',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'normal',
            'headline', 'Votre artisan est affecté',
            'detail', 'Suivez son arrivée et l’intervention depuis un seul écran.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status)
            )
          )
        );
      end if;
    end if;

    select sr.id as request_id, sr.status, sr.service_category, sr.city
    into v_request
    from public.service_requests sr
    where sr.client_profile_id = v_uid
      and sr.status = 'new'
    order by sr.created_at desc
    limit 1;

    if found then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'version', 1, 'role', 'client',
        'cue', pg_catalog.jsonb_build_object(
          'id', 'client.matching',
          'source', 'canonical',
          'authority', 'workflow',
          'priority', 'normal',
          'headline', 'FIXEO cherche le bon artisan',
          'detail', 'La demande est active. Aucun nouveau formulaire n’est nécessaire.',
          'action', pg_catalog.jsonb_build_object('kind','none'),
          'evidence', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('field','request_status','value',v_request.status)
          )
        )
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true, 'version', 1, 'role', 'client', 'cue', null
    );
  end if;

  if v_role = 'artisan' then
    select a.id into v_artisan_id
    from public.artisans a
    where a.owner_user_id = v_uid
    limit 1;

    if v_artisan_id is null then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'version', 1, 'role', 'artisan', 'cue', null
      );
    end if;

    select
      m.id as mission_id,
      sr.id as request_id,
      sr.status as request_status,
      m.status as mission_status,
      sr.service_category,
      sr.city
    into v_mission
    from public.missions m
    join public.service_requests sr on sr.id::text = m.request_id
    where m.artisan_profile_id = v_artisan_id
      and sr.status in ('assigned','in_progress','completed')
      and m.status in ('pending','done')
    order by m.accepted_at desc nulls last, m.created_at desc
    limit 1;

    if found then
      if v_mission.request_status = 'completed' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'artisan',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'artisan.wait_client_validation',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'normal',
            'headline', 'Validation client en attente',
            'detail', 'Votre intervention est terminée. FIXEO attend la confirmation du client.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status)
            )
          )
        );
      elsif v_mission.request_status = 'in_progress' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'artisan',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'artisan.continue_mission',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'high',
            'headline', 'Continuez la mission en cours',
            'detail', 'Gardez les preuves et la prochaine action dans le même parcours.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status)
            )
          )
        );
      else
        return pg_catalog.jsonb_build_object(
          'ok', true, 'version', 1, 'role', 'artisan',
          'cue', pg_catalog.jsonb_build_object(
            'id', 'artisan.open_assigned_mission',
            'source', 'canonical',
            'authority', 'workflow',
            'priority', 'high',
            'headline', 'Une mission vous attend',
            'detail', 'Ouvrez la mission et laissez FIXEO vous guider jusqu’à la clôture.',
            'action', pg_catalog.jsonb_build_object(
              'kind', 'open_mission',
              'mission_id', v_mission.mission_id
            ),
            'evidence', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('field','request_status','value',v_mission.request_status)
            )
          )
        );
      end if;
    end if;

    select
      q.request_id,
      q.match_rank,
      sr.service_category,
      sr.city
    into v_offer
    from public.dispatch_execution_queue q
    join public.service_requests sr on sr.id = q.request_id
    where q.artisan_id = v_artisan_id
      and q.execution_status in ('QUEUED','CONTACTED')
      and sr.status = 'new'
    order by q.match_rank asc, q.position_in_batch asc, q.created_at asc
    limit 1;

    if found then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'version', 1, 'role', 'artisan',
        'cue', pg_catalog.jsonb_build_object(
          'id', 'artisan.best_offer',
          'source', 'canonical',
          'authority', 'dispatch',
          'priority', 'normal',
          'headline', 'Une opportunité correspond à votre profil',
          'detail', pg_catalog.concat_ws(' · ', v_offer.service_category, v_offer.city),
          'action', pg_catalog.jsonb_build_object(
            'kind', 'accept_offer',
            'request_id', v_offer.request_id
          ),
          'evidence', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('field','match_rank','value',v_offer.match_rank)
          )
        )
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true, 'version', 1, 'role', 'artisan', 'cue', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'version', 1, 'role', coalesce(v_role, 'unknown'), 'cue', null
  );
end;
$function$;

revoke all on function public.get_my_mobile_decision_context_v1() from public;
revoke all on function public.get_my_mobile_decision_context_v1() from anon;
grant execute on function public.get_my_mobile_decision_context_v1() to authenticated;
