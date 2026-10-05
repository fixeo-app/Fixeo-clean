-- W5 V2 rollback. Separate approval required before any execution.
BEGIN;

CREATE OR REPLACE FUNCTION public.accept_my_dispatch_offer_v1(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id       uuid;
  v_request_status   text;
  v_queue_status     text;
  v_existing_winner  uuid;
  v_mission_id       uuid;
BEGIN

  /* Authentication required. */
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'request_id_required'
    );
  END IF;

  /*
   * Resolve the canonical artisan owned by this account.
   */
  SELECT a.id
  INTO v_artisan_id
  FROM public.artisans a
  WHERE a.owner_user_id = auth.uid()
  LIMIT 1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_not_found'
    );
  END IF;

  /*
   * Serialize acceptance on the canonical request.
   *
   * Two artisans attempting acceptance concurrently will
   * therefore execute this critical section one after another.
   */
  SELECT sr.status
  INTO v_request_status
  FROM public.service_requests sr
  WHERE sr.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'request_not_found'
    );
  END IF;

  /*
   * Verify that THIS authenticated artisan really owns
   * an active queue opportunity for this request.
   */
  SELECT q.execution_status
  INTO v_queue_status
  FROM public.dispatch_execution_queue q
  WHERE q.request_id = p_request_id
    AND q.artisan_id = v_artisan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'offer_not_found'
    );
  END IF;

  /*
   * Idempotent success if this artisan already won.
   */
  IF v_queue_status = 'ACCEPTED' THEN

    SELECT m.id
    INTO v_mission_id
    FROM public.missions m
    WHERE m.request_id = p_request_id::text
      AND m.artisan_profile_id = v_artisan_id
      AND m.status = 'pending'
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_accepted',
      'request_id', p_request_id,
      'artisan_id', v_artisan_id,
      'mission_id', v_mission_id
    );
  END IF;

  /*
   * Only an active V2 opportunity may be accepted.
   *
   * QUEUED is allowed for dashboard acceptance.
   * CONTACTED remains allowed for notification-driven acceptance.
   */
  IF v_queue_status NOT IN ('QUEUED', 'CONTACTED') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'offer_not_active',
      'queue_status', v_queue_status
    );
  END IF;

  /*
   * The request itself is the authoritative winner gate.
   */
  IF v_request_status <> 'new' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_claimed',
      'status', v_request_status
    );
  END IF;

  /*
   * Defense in depth: check for an already-persisted pending winner.
   */
  SELECT m.id
  INTO v_existing_winner
  FROM public.missions m
  WHERE m.request_id = p_request_id::text
    AND m.status = 'pending'
  LIMIT 1;

  IF v_existing_winner IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_claimed',
      'mission_id', v_existing_winner
    );
  END IF;

  /*
   * Atomic winner mutation.
   *
   * The service_request row is already locked, so another
   * concurrent acceptance cannot pass the "new" gate.
   */
  BEGIN

    INSERT INTO public.missions (
      request_id,
      artisan_profile_id,
      status,
      agreed_price,
      accepted_at
    )
    VALUES (
      p_request_id::text,
      v_artisan_id,
      'pending',
      NULL,
      now()
    )
    RETURNING id
    INTO v_mission_id;

    UPDATE public.service_requests sr
    SET status = 'assigned'
    WHERE sr.id = p_request_id
      AND sr.status = 'new';

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'request acceptance conflict'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.dispatch_execution_queue q
    SET
      execution_status = 'ACCEPTED',
      updated_at = now()
    WHERE q.request_id = p_request_id
      AND q.artisan_id = v_artisan_id;

    UPDATE public.dispatch_execution_queue q
    SET
      execution_status = 'CANCELLED',
      updated_at = now()
    WHERE q.request_id = p_request_id
      AND q.artisan_id <> v_artisan_id
      AND q.execution_status IN ('QUEUED', 'CONTACTED');

  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'already_claimed'
      );

    WHEN SQLSTATE 'P0001' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'already_claimed'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'accepted',
    'request_id', p_request_id,
    'artisan_id', v_artisan_id,
    'mission_id', v_mission_id
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.artisan_business_accept_quote(p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_q public.artisan_business_quotes%rowtype;
  v_job uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select *
    into v_q
  from public.artisan_business_quotes
  where id = p_quote_id
    and owner_user_id = v_uid
    and source = 'personal'
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  select id into v_job
  from public.artisan_business_jobs
  where quote_id = p_quote_id
    and owner_user_id = v_uid
  limit 1;

  if v_job is not null then
    return v_job;
  end if;

  if v_q.status in ('rejected','expired','cancelled') then
    raise exception 'QUOTE_NOT_ACCEPTABLE';
  end if;

  update public.artisan_business_quotes
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      client_decision_at = coalesce(client_decision_at, now()),
      updated_at = now()
  where id = p_quote_id;

  insert into public.artisan_business_jobs(
    owner_user_id, client_id, quote_id, source, title, status, amount, notes
  )
  values(
    v_uid, v_q.client_id, v_q.id, 'personal', v_q.title, 'planned', v_q.total, v_q.description
  )
  returning id into v_job;

  return v_job;
end
$function$
;

CREATE OR REPLACE FUNCTION public.artisan_business_next_quote_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_n integer;
  v_year text := to_char(current_date,'YYYY');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select coalesce(max(nullif(substring(quote_number from '([0-9]+)$'),'')::integer), 0) + 1
    into v_n
  from public.artisan_business_quotes
  where owner_user_id = v_uid
    and quote_number like ('DEV-' || v_year || '-%');

  return 'DEV-' || v_year || '-' || lpad(v_n::text, 4, '0');
end
$function$
;

CREATE OR REPLACE FUNCTION public.claim_mission(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;
  v_mission_status  text;
  v_mission_artisan uuid;
  v_locked_id       uuid;
  v_rows_updated    integer;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  SELECT a.id
  INTO v_artisan_id
  FROM public.artisans a
  WHERE a.owner_user_id = auth.uid()
  LIMIT 1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_not_found'
    );
  END IF;

  SELECT
    m.request_id,
    m.status,
    m.artisan_profile_id
  INTO
    v_request_id,
    v_mission_status,
    v_mission_artisan
  FROM public.missions m
  WHERE m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'mission_not_found'
    );
  END IF;

  IF v_mission_status = 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_claimed'
    );
  END IF;

  IF v_mission_status != 'offered' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_offered'
    );
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_offered_to_you'
    );
  END IF;

  UPDATE public.service_requests sr
  SET status = 'assigned'
  WHERE sr.id::text = v_request_id
    AND sr.status = 'new'
  RETURNING sr.id
  INTO v_locked_id;

  IF v_locked_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_claimed'
    );
  END IF;

  UPDATE public.missions m
  SET
    status = 'pending',
    accepted_at = now()
  WHERE m.id = p_mission_id
    AND m.status = 'offered';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION
      'claim_mission: missions transition affected 0 rows — transaction rolled back (mission_id: %)',
      p_mission_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mission_id', p_mission_id
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_mission(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id         uuid;
  v_request_id         text;
  v_mission_status     text;
  v_mission_artisan    uuid;
  v_sr_status          text;
  v_rows_m             integer;
  v_rows_sr            integer;
  v_mission_status_now text;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  IF v_mission_status = 'done' THEN

    SELECT sr.status INTO v_sr_status
    FROM   public.service_requests sr
    WHERE  sr.id::text = v_request_id;

    IF v_sr_status IN ('completed', 'validated') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'mission_id', p_mission_id,
        'already_completed', true
      );
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'inconsistent_state'
      );
    END IF;

  END IF;

  IF v_mission_status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started');
  END IF;

  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  IF v_sr_status != 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started');
  END IF;

  UPDATE public.missions
  SET    status = 'done'
  WHERE  id     = p_mission_id
    AND  status = 'pending';

  GET DIAGNOSTICS v_rows_m = ROW_COUNT;

  IF v_rows_m = 0 THEN

    SELECT m.status INTO v_mission_status_now
    FROM   public.missions m
    WHERE  m.id = p_mission_id;

    SELECT sr.status INTO v_sr_status
    FROM   public.service_requests sr
    WHERE  sr.id::text = v_request_id;

    IF v_mission_status_now IN ('done', 'validated')
       AND v_sr_status IN ('completed', 'validated') THEN

      RETURN jsonb_build_object(
        'ok', true,
        'mission_id', p_mission_id,
        'already_completed', true
      );

    ELSE

      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'inconsistent_state'
      );

    END IF;

  END IF;

  UPDATE public.service_requests
  SET    status = 'completed'
  WHERE  id::text = v_request_id
    AND  status   = 'in_progress';

  GET DIAGNOSTICS v_rows_sr = ROW_COUNT;

  IF v_rows_sr = 0 THEN
    RAISE EXCEPTION
      '[complete_mission] atomicity violation: mission % set done but service_request % could not be set completed (status=%). Rolling back.',
      p_mission_id,
      v_request_id,
      v_sr_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'atomicity_error'
    );

  WHEN OTHERS THEN
    RAISE WARNING '[complete_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'internal_error'
    );
END;

$function$
;

CREATE OR REPLACE FUNCTION public.decline_mission(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;
  v_mission_status  text;
  v_mission_artisan uuid;
  v_sr_status       text;
  v_rows_updated    integer;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  IF v_mission_status != 'offered' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered');
  END IF;

  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND OR v_sr_status != 'new' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_dispatchable');
  END IF;

  UPDATE public.missions
  SET    status = 'declined'
  WHERE  id     = p_mission_id
    AND  status = 'offered';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered');
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[decline_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;

$function$
;

CREATE OR REPLACE FUNCTION public.get_accepted_mission_detail(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_artisan_id     uuid;
  v_mission_status text;
  v_artisan_match  uuid;
  v_result         jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select a.id
  into v_artisan_id
  from public.artisans a
  where a.owner_user_id = auth.uid()
  limit 1;

  if v_artisan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  end if;

  select m.status, m.artisan_profile_id
  into v_mission_status, v_artisan_match
  from public.missions m
  where m.id = p_mission_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  end if;

  if v_artisan_match != v_artisan_id then
    return jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  end if;

  if v_mission_status not in ('pending', 'done', 'validated') then
    return jsonb_build_object('ok', false, 'reason', 'not_accepted_yet');
  end if;

  select jsonb_build_object(
    'ok',               true,
    'mission_id',       m.id,
    'request_id',       sr.id,
    'mission_status',   m.status,
    'request_status',   sr.status,
    'accepted_at',      m.accepted_at,
    'agreed_price',     m.agreed_price,
    'service_category', sr.service_category,
    'city',             sr.city,
    'urgency',          sr.urgency,
    'description',      sr.description,
    'client_phone',     sr.client_phone
  )
  into v_result
  from public.missions m
  join public.service_requests sr on m.request_id = sr.id::text
  where m.id = p_mission_id;

  if v_result is null then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;

  return v_result;
end;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.get_my_dispatch_offers_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id uuid;
  v_result jsonb;
BEGIN

  /*
   * Authentication is mandatory.
   */
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  /*
   * Canonical artisan ownership:
   * auth.uid() -> artisans.owner_user_id -> artisans.id
   */
  SELECT a.id
  INTO v_artisan_id
  FROM public.artisans a
  WHERE a.owner_user_id = auth.uid()
  LIMIT 1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_not_found'
    );
  END IF;

  /*
   * Return ONLY active V2 dispatch opportunities belonging
   * to the authenticated artisan.
   *
   * Deliberately excluded:
   * - client_profile_id
   * - client_phone
   * - tracking_ref
   * - guest_token_hash
   * - commission fields
   * - description
   */
  SELECT jsonb_build_object(
    'ok',
    true,

    'offers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'request_id',         t.request_id,
          'queue_status',       t.queue_status,
          'match_rank',         t.match_rank,
          'batch_number',       t.batch_number,
          'position_in_batch',  t.position_in_batch,
          'service_category',   t.service_category,
          'city',               t.city,
          'urgency',            t.urgency,
          'request_created_at', t.request_created_at
        )
        ORDER BY
          t.request_created_at DESC,
          t.match_rank ASC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result

  FROM (
    SELECT
      q.request_id,
      q.execution_status AS queue_status,
      q.match_rank,
      q.batch_number,
      q.position_in_batch,

      sr.service_category,
      sr.city,
      sr.urgency,
      sr.created_at AS request_created_at

    FROM public.dispatch_execution_queue q

    JOIN public.service_requests sr
      ON sr.id = q.request_id

    WHERE q.artisan_id = v_artisan_id

      AND q.execution_status IN (
        'QUEUED',
        'CONTACTED'
      )

      /*
       * Once another artisan has won and the canonical request
       * is assigned, it must disappear from opportunity feeds.
       */
      AND sr.status = 'new'

    ORDER BY
      sr.created_at DESC,
      q.match_rank ASC

    LIMIT 50
  ) t;

  RETURN v_result;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_mission_offers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id uuid;
  v_result     jsonb;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unauthenticated'
    );
  END IF;

  SELECT a.id
  INTO v_artisan_id
  FROM public.artisans a
  WHERE a.owner_user_id = auth.uid()
  LIMIT 1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'artisan_not_found'
    );
  END IF;

  SELECT jsonb_build_object(
    'ok',
    true,
    'offers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mission_id',         t.mission_id,
          'request_id',         t.request_id,
          'mission_status',     t.mission_status,
          'offered_at',         t.offered_at,
          'service_category',   t.service_category,
          'city',               t.city,
          'urgency',            t.urgency,
          'request_created_at', t.request_created_at
        )
        ORDER BY t.request_created_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    SELECT
      m.id                AS mission_id,
      m.request_id        AS request_id,
      m.status            AS mission_status,
      m.created_at        AS offered_at,
      sr.service_category AS service_category,
      sr.city             AS city,
      sr.urgency          AS urgency,
      sr.created_at       AS request_created_at
    FROM public.missions m
    JOIN public.service_requests sr
      ON m.request_id = sr.id::text
    WHERE m.artisan_profile_id = v_artisan_id
      AND m.status IN ('offered','pending','done')
    ORDER BY sr.created_at DESC
    LIMIT 50
  ) t;

  RETURN v_result;

END;
$function$
;

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
;

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
;

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
;

CREATE OR REPLACE FUNCTION public.start_mission(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_artisan_id      uuid;
  v_request_id      text;
  v_mission_status  text;
  v_mission_artisan uuid;
  v_sr_status       text;
  v_rows_updated    integer;
BEGIN

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT a.id
  INTO   v_artisan_id
  FROM   public.artisans a
  WHERE  a.owner_user_id = auth.uid()
  LIMIT  1;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'artisan_not_found');
  END IF;

  SELECT m.request_id, m.status, m.artisan_profile_id
  INTO   v_request_id, v_mission_status, v_mission_artisan
  FROM   public.missions m
  WHERE  m.id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  IF v_mission_artisan != v_artisan_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_mission');
  END IF;

  IF v_mission_status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted');
  END IF;

  SELECT sr.status INTO v_sr_status
  FROM   public.service_requests sr
  WHERE  sr.id::text = v_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  IF v_sr_status = 'in_progress' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'mission_id', p_mission_id,
      'already_started', true
    );
  END IF;

  IF v_sr_status != 'assigned' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  UPDATE public.service_requests
  SET    status = 'in_progress'
  WHERE  id::text = v_request_id
    AND  status   = 'assigned';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN

    SELECT sr.status INTO v_sr_status
    FROM   public.service_requests sr
    WHERE  sr.id::text = v_request_id;

    IF v_sr_status = 'in_progress' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'mission_id', p_mission_id,
        'already_started', true
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request_state');
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'mission_id', p_mission_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[start_mission] unexpected error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;

$function$
;

CREATE OR REPLACE FUNCTION public.submit_artisan_quote_v2(p_request_id uuid, p_proposed_price numeric, p_service_description text DEFAULT NULL::text, p_supplies_description text DEFAULT NULL::text, p_estimated_duration text DEFAULT NULL::text, p_message text DEFAULT NULL::text)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.artisans; r public.service_requests; q public.quotes;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_proposed_price IS NULL OR p_proposed_price<=0 OR p_proposed_price>500000 OR p_proposed_price<>round(p_proposed_price,2) THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
 IF length(trim(coalesce(p_service_description,''))) NOT BETWEEN 5 AND 4000 OR length(coalesce(p_supplies_description,''))>4000 OR length(coalesce(p_message,''))>2000 OR length(coalesce(p_estimated_duration,''))>200 THEN RAISE EXCEPTION 'INVALID_SCOPE'; END IF;
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=auth.uid() ORDER BY updated_at DESC NULLS LAST,id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARTISAN_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'new' THEN RAISE EXCEPTION 'REQUEST_NOT_QUOTABLE'; END IF;
 IF r.pricing_offer_id IS NOT NULL THEN RAISE EXCEPTION 'PRICING_CHANGE_AUTHORITY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=r.id) THEN RAISE EXCEPTION 'ENTERPRISE_QUOTE_AUTHORITY_REQUIRED'; END IF;
 IF lower(trim(r.city))<>lower(trim(coalesce(a.city,''))) AND NOT EXISTS(SELECT 1 FROM public.artisan_service_cities WHERE artisan_id=a.id AND lower(trim(city))=lower(trim(r.city))) THEN RAISE EXCEPTION 'CITY_MISMATCH'; END IF;
 IF lower(trim(r.service_category)) NOT IN(lower(trim(coalesce(a.service_category,''))),lower(trim(coalesce(a.category,'')))) AND NOT coalesce(a.services,'[]'::jsonb)?r.service_category AND NOT EXISTS(SELECT 1 FROM public.artisan_service_categories WHERE artisan_id=a.id AND lower(trim(service_category))=lower(trim(r.service_category))) THEN RAISE EXCEPTION 'TRADE_MISMATCH'; END IF;
 SELECT * INTO q FROM public.quotes WHERE request_id=r.id AND artisan_profile_id=a.id AND status IN('pending','accepted') ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF q.status='accepted' THEN RAISE EXCEPTION 'QUOTE_ALREADY_ACCEPTED'; END IF;
  IF q.proposed_price=p_proposed_price AND q.service_description IS NOT DISTINCT FROM nullif(trim(p_service_description),'') AND q.supplies_description IS NOT DISTINCT FROM nullif(trim(p_supplies_description),'') AND q.estimated_duration IS NOT DISTINCT FROM nullif(trim(p_estimated_duration),'') AND q.message IS NOT DISTINCT FROM nullif(trim(p_message),'') THEN RETURN q; END IF;
  UPDATE public.quotes SET proposed_price=p_proposed_price,service_description=nullif(trim(p_service_description),''),supplies_description=nullif(trim(p_supplies_description),''),estimated_duration=nullif(trim(p_estimated_duration),''),message=nullif(trim(p_message),''),submitted_at=now(),quote_version=quote_version+1,review_status='submitted',reviewed_version=NULL,reviewed_at=NULL,reviewed_by=NULL,review_reason=NULL,presented_at=NULL,expires_at=NULL WHERE id=q.id RETURNING * INTO q;
 ELSE
  INSERT INTO public.quotes(request_id,artisan_profile_id,proposed_price,service_description,supplies_description,estimated_duration,message,status,submitted_at,review_status)
  VALUES(r.id,a.id,p_proposed_price,nullif(trim(p_service_description),''),nullif(trim(p_supplies_description),''),nullif(trim(p_estimated_duration),''),nullif(trim(p_message),''),'pending',now(),'submitted') RETURNING * INTO q;
 END IF;
 -- No client notification until FIXEO approves this exact version.
 RETURN q;
END $function$
;

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
;

CREATE OR REPLACE FUNCTION public.update_artisan_availability(p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid               uuid;
  v_artisan_id        uuid;
  v_current_avail     text;
  v_onboarding_done   boolean;
  v_target_status     text;
BEGIN

  -- ── Auth ──────────────────────────────────────────────────
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- ── Validate requested status ─────────────────────────────
  v_target_status := lower(trim(COALESCE(p_status, '')));
  IF v_target_status NOT IN ('available', 'unavailable', 'busy') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status',
      'message', 'Statut invalide. Valeurs acceptées: available, unavailable, busy.');
  END IF;

  -- ── Fetch and lock artisan row ────────────────────────────
  SELECT a.id, a.availability, a.onboarding_completed
  INTO v_artisan_id, v_current_avail, v_onboarding_done
  FROM public.artisans a
  WHERE a.owner_user_id = v_uid
  LIMIT 1
  FOR UPDATE;

  IF v_artisan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner',
      'message', 'Aucun profil artisan trouvé pour ce compte.');
  END IF;

  -- ── Onboarding gate ───────────────────────────────────────
  -- 'available' and 'busy' require onboarding_completed = true.
  -- 'unavailable' is always permitted (artisan can always go offline).
  IF v_target_status IN ('available', 'busy') AND NOT COALESCE(v_onboarding_done, false) THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'reason', 'onboarding_required',
      'message', 'Complétez votre profil avant de vous rendre disponible.'
    );
  END IF;

  -- ── Idempotency ───────────────────────────────────────────
  IF v_current_avail = v_target_status THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'reason',     'no_change',
      'artisan_id', v_artisan_id,
      'status',     v_target_status
    );
  END IF;

  -- ── Update availability ───────────────────────────────────
  UPDATE public.artisans
  SET availability = v_target_status,
      updated_at   = now()
  WHERE id = v_artisan_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'reason',     'updated',
    'artisan_id', v_artisan_id,
    'status',     v_target_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[update_artisan_availability] unexpected error for uid %: %', v_uid, SQLERRM;
    RETURN jsonb_build_object('ok', false, 'reason', 'internal_error');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_my_artisan_contact_v1(p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    return jsonb_build_object(
      'ok',false,
      'reason','invalid_phone',
      'message','Numéro marocain invalide.'
    );
  end if;

  update public.users
  set phone = v_phone
  where id = v_uid;

  update public.profiles
  set phone = v_phone
  where id = v_uid;

  update public.artisans
  set phone = v_phone,
      phone_public = v_phone,
      updated_at = now()
  where id = v_artisan_id
    and owner_user_id = v_uid;

  return jsonb_build_object(
    'ok',true,
    'phone',v_phone,
    'artisan_id',v_artisan_id
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.update_my_artisan_photo_v1(p_photo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.artisans;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=auth.uid() ORDER BY updated_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARTISAN_NOT_FOUND'; END IF;
 IF length(coalesce(p_photo_url,''))>2048 OR p_photo_url !~ ('^https://[a-z]{20}\.supabase\.co/storage/v1/object/public/artisan-media/profiles/'||auth.uid()::text||'/avatar\.jpg$') THEN RAISE EXCEPTION 'INVALID_PHOTO_URL'; END IF;
 UPDATE public.artisans SET photo_url=p_photo_url,updated_at=now() WHERE id=a.id;
 RETURN jsonb_build_object('id',a.id,'photo_url',p_photo_url);
END $function$
;

GRANT EXECUTE ON FUNCTION public.update_my_artisan_activity_v1(text[],text[]) TO authenticated;

DROP POLICY w5_artisan_session ON public.artisan_business_clients;

DROP POLICY w5_artisan_session ON public.artisan_business_quotes;

DROP POLICY w5_artisan_session ON public.artisan_business_jobs;

DROP POLICY w5_artisan_session ON public.artisan_business_ledger;

DROP POLICY w5_artisan_session ON public.quotes;

DROP POLICY w5_artisan_session ON public.notifications;

DROP POLICY w5_artisan_profile_update ON public.artisans;

DROP FUNCTION public.w5_update_my_artisan_activity_v1(text[],text[]);

DROP FUNCTION public.list_my_mobile_artisan_missions_v1();

DROP FUNCTION public.get_my_mobile_artisan_access_v1();

DROP FUNCTION fixeo_private.w5_artisan_actor_v1();

COMMIT;
