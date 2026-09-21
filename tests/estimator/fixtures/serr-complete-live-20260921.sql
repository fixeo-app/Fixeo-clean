-- Read-only capture of production complete_mission on 2026-09-21; used only in isolated tests.
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
