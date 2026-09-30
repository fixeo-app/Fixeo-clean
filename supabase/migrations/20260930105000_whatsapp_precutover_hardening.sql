BEGIN;

ALTER TABLE public.dispatch_notification_outbox
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text,
  ADD COLUMN IF NOT EXISTS provider_error_title text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dispatch_notification_outbox_provider_status_check'
      AND conrelid = 'public.dispatch_notification_outbox'::regclass
  ) THEN
    ALTER TABLE public.dispatch_notification_outbox
      ADD CONSTRAINT dispatch_notification_outbox_provider_status_check
      CHECK (
        provider_status IS NULL
        OR provider_status IN ('sent','delivered','read','failed')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS dispatch_notification_outbox_provider_message_idx
  ON public.dispatch_notification_outbox(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text NOT NULL UNIQUE,
  from_e164 text NOT NULL,
  phone_number_id text,
  message_type text NOT NULL,
  message_text text,
  media_id text,
  caption text,
  provider_timestamp timestamptz,
  processing_status text NOT NULL DEFAULT 'RECEIVED',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_inbound_messages_type_check
    CHECK (message_type IN (
      'text','image','video','audio','document','sticker','location',
      'contacts','reaction','interactive','button','order','system','unknown'
    )),
  CONSTRAINT whatsapp_inbound_messages_processing_status_check
    CHECK (processing_status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED'))
);

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_inbound_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_inbound_messages TO service_role;


CREATE OR REPLACE FUNCTION public.dispatch_notification_worker_next_v2(
  p_channel text DEFAULT 'WHATSAPP',
  p_not_before timestamptz DEFAULT NULL
)
RETURNS TABLE(
  notification_id uuid,
  request_id uuid,
  artisan_id uuid,
  contact_phone text,
  notification_type text,
  channel text,
  notification_status text,
  attempt_count integer,
  claimed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $next_v2$
DECLARE
  v_channel text;
BEGIN
  IF p_channel IS NULL THEN
    RAISE EXCEPTION 'channel is required';
  END IF;
  IF p_not_before IS NULL THEN
    RAISE EXCEPTION 'not_before is required';
  END IF;

  v_channel := upper(trim(p_channel));
  IF v_channel NOT IN ('WHATSAPP','SMS') THEN
    RAISE EXCEPTION 'invalid channel: %', v_channel;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT o.id
    FROM public.dispatch_notification_outbox AS o
    WHERE o.notification_status = 'PENDING'
      AND o.channel = v_channel
      AND o.attempt_count < 3
      AND o.created_at >= p_not_before
    ORDER BY o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ),
  claimed AS (
    UPDATE public.dispatch_notification_outbox AS o
    SET notification_status = 'PROCESSING',
        attempt_count = o.attempt_count + 1,
        updated_at = now()
    FROM candidate AS c
    WHERE o.id = c.id
    RETURNING
      o.id,
      o.request_id,
      o.artisan_id,
      o.notification_type,
      o.channel,
      o.notification_status,
      o.attempt_count,
      o.updated_at
  )
  SELECT
    c.id,
    c.request_id,
    c.artisan_id,
    coalesce(nullif(trim(a.phone_public), ''), nullif(trim(a.phone), '')),
    c.notification_type,
    c.channel,
    c.notification_status,
    c.attempt_count,
    c.updated_at
  FROM claimed AS c
  JOIN public.artisans AS a ON a.id = c.artisan_id;
END;
$next_v2$;

REVOKE ALL ON FUNCTION public.dispatch_notification_worker_next_v2(text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_worker_next_v2(text,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_retry_notification_v1(
  p_notification_id uuid,
  p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_attempt_count integer;
  v_next_status text;
BEGIN
  IF p_notification_id IS NULL THEN
    RAISE EXCEPTION 'notification_id is required';
  END IF;

  SELECT notification_status, attempt_count
    INTO v_status, v_attempt_count
  FROM public.dispatch_notification_outbox
  WHERE id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  IF v_status = 'PENDING' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'ALREADY_PENDING',
      'notification_id', p_notification_id,
      'attempt_count', v_attempt_count,
      'notification_status', v_status
    );
  END IF;

  IF v_status <> 'PROCESSING' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'INVALID_STATE',
      'notification_id', p_notification_id,
      'attempt_count', v_attempt_count,
      'notification_status', v_status
    );
  END IF;

  v_next_status := CASE WHEN v_attempt_count < 3 THEN 'PENDING' ELSE 'FAILED' END;

  UPDATE public.dispatch_notification_outbox
  SET notification_status = v_next_status,
      last_error = NULLIF(left(trim(coalesce(p_last_error,'')), 500), ''),
      updated_at = now()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', CASE WHEN v_next_status = 'PENDING' THEN 'RETRY_SCHEDULED' ELSE 'ATTEMPTS_EXHAUSTED' END,
    'notification_id', p_notification_id,
    'attempt_count', v_attempt_count,
    'notification_status', v_next_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_retry_notification_v1(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_retry_notification_v1(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_record_whatsapp_status_v1(
  p_provider_message_id text,
  p_provider_status text,
  p_provider_timestamp timestamptz DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_id uuid;
  v_current_at timestamptz;
  v_event_at timestamptz;
BEGIN
  IF NULLIF(trim(coalesce(p_provider_message_id,'')), '') IS NULL THEN
    RAISE EXCEPTION 'provider_message_id is required';
  END IF;

  v_status := lower(trim(coalesce(p_provider_status,'')));
  IF v_status NOT IN ('sent','delivered','read','failed') THEN
    RAISE EXCEPTION 'invalid provider_status: %', v_status;
  END IF;

  v_event_at := coalesce(p_provider_timestamp, now());

  SELECT id, provider_status_at
    INTO v_id, v_current_at
  FROM public.dispatch_notification_outbox
  WHERE provider_message_id = trim(p_provider_message_id)
  ORDER BY sent_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'matched', false);
  END IF;

  IF v_current_at IS NOT NULL AND v_event_at < v_current_at THEN
    RETURN jsonb_build_object(
      'ok', true,
      'matched', true,
      'stale', true,
      'notification_id', v_id
    );
  END IF;

  UPDATE public.dispatch_notification_outbox
  SET provider_status = v_status,
      provider_status_at = v_event_at,
      provider_error_code = CASE WHEN v_status='failed' THEN NULLIF(left(trim(coalesce(p_error_code,'')),120),'') ELSE NULL END,
      provider_error_title = CASE WHEN v_status='failed' THEN NULLIF(left(trim(coalesce(p_error_title,'')),500),'') ELSE NULL END,
      updated_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'matched', true,
    'stale', false,
    'notification_id', v_id,
    'provider_status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_record_whatsapp_status_v1(text,text,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_record_whatsapp_status_v1(text,text,timestamptz,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_ingest_inbound_message_v1(
  p_provider_message_id text,
  p_from_e164 text,
  p_phone_number_id text,
  p_message_type text,
  p_message_text text DEFAULT NULL,
  p_media_id text DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_provider_timestamp timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_id uuid;
BEGIN
  IF NULLIF(trim(coalesce(p_provider_message_id,'')), '') IS NULL THEN
    RAISE EXCEPTION 'provider_message_id is required';
  END IF;
  IF NULLIF(regexp_replace(coalesce(p_from_e164,''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'from_e164 is required';
  END IF;

  v_type := lower(trim(coalesce(p_message_type,'unknown')));
  IF v_type NOT IN (
    'text','image','video','audio','document','sticker','location',
    'contacts','reaction','interactive','button','order','system','unknown'
  ) THEN
    v_type := 'unknown';
  END IF;

  INSERT INTO public.whatsapp_inbound_messages(
    provider_message_id,
    from_e164,
    phone_number_id,
    message_type,
    message_text,
    media_id,
    caption,
    provider_timestamp
  )
  VALUES (
    trim(p_provider_message_id),
    regexp_replace(p_from_e164, '\D', '', 'g'),
    NULLIF(trim(coalesce(p_phone_number_id,'')), ''),
    v_type,
    NULLIF(left(p_message_text, 4000), ''),
    NULLIF(trim(coalesce(p_media_id,'')), ''),
    NULLIF(left(p_caption, 2000), ''),
    p_provider_timestamp
  )
  ON CONFLICT (provider_message_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_id IS NOT NULL,
    'message_id', coalesce(v_id::text, null)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_ingest_inbound_message_v1(text,text,text,text,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_ingest_inbound_message_v1(text,text,text,text,text,text,text,timestamptz)
  TO service_role;

COMMIT;
