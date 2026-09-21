-- Production read-only snapshot accept_my_dispatch_offer_v1: fb687ccb39f93e52b1868b6845d381a6
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
$function$;

-- Production read-only snapshot claim_mission: f63f295994797d7152ed044f3ee464af
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
$function$;

-- Production read-only snapshot start_mission: 90acbe04e100bf5e39fc66ee3452c5ef
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

$function$;
