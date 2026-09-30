-- FIXEO Supply Engine — Bloc 6
-- Channel-neutral outbox + WhatsApp-ready adapter boundary.
-- No provider send is enabled by this migration.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_campaigns_v1') IS NULL
     OR to_regclass('public.whatsapp_inbound_messages') IS NULL
     OR to_regprocedure('public.supply_record_contact_attempt_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid)') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B6_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE TABLE public.supply_channel_outbox_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  task_id uuid REFERENCES public.supply_work_queue_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  channel text NOT NULL CHECK(channel IN('MANUAL','WHATSAPP')),
  recipient_e164 text,
  template_key text NOT NULL,
  message_kind text NOT NULL DEFAULT 'RECRUITMENT' CHECK(message_kind IN('RECRUITMENT','FOLLOW_UP','ACTIVATION','RECOVERY')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'READY' CHECK(status IN('DRAFT','READY','CLAIMED','SENT','DELIVERED','READ','FAILED','CANCELLED')),
  not_before timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claimed_at timestamptz,
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  channel_cost_minor bigint NOT NULL DEFAULT 0 CHECK(channel_cost_minor>=0),
  currency text NOT NULL DEFAULT 'MAD' CHECK(char_length(currency)=3),
  last_error text,
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_inbound_links_v1(
  inbound_message_id uuid PRIMARY KEY REFERENCES public.whatsapp_inbound_messages(id) ON UPDATE CASCADE ON DELETE CASCADE,
  artisan_id uuid REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  task_id uuid REFERENCES public.supply_work_queue_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  resolution_status text NOT NULL CHECK(resolution_status IN('MATCHED','AMBIGUOUS','UNMATCHED','SUPPRESSED')),
  resolution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(resolution_evidence)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supply_channel_ready_idx ON public.supply_channel_outbox_v1(status,not_before,created_at)
  WHERE status='READY';
CREATE INDEX supply_channel_artisan_idx ON public.supply_channel_outbox_v1(artisan_id,created_at DESC);
CREATE UNIQUE INDEX supply_channel_provider_message_uq ON public.supply_channel_outbox_v1(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.supply_channel_outbox_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_inbound_links_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supply_channel_outbox_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_inbound_links_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_normalize_e164_v1(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $fn$
WITH x AS (
  SELECT regexp_replace(COALESCE(p_phone,''),'[^0-9]','','g') d
), y AS (
  SELECT CASE
    WHEN d ~ '^0[67][0-9]{8}$' THEN '212'||substr(d,2)
    WHEN d ~ '^212[67][0-9]{8}$' THEN d
    ELSE NULL END e164
  FROM x
)
SELECT e164 FROM y
$fn$;
ALTER FUNCTION fixeo_private.supply_normalize_e164_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_normalize_e164_v1(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_prepare_channel_message_v1(
  p_artisan_id uuid,p_campaign_id uuid,p_task_id uuid,p_channel text,
  p_template_key text,p_message_kind text DEFAULT 'RECRUITMENT',p_payload jsonb DEFAULT '{}'::jsonb,
  p_not_before timestamptz DEFAULT now(),p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE actor_kind text; p public.supply_artisan_projection_v1; c public.supply_campaigns_v1; oid uuid; target text;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  SELECT * INTO p FROM public.supply_artisan_projection_v1 WHERE artisan_id=p_artisan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','artisan_not_found'); END IF;
  IF NOT p.contactable THEN RETURN jsonb_build_object('ok',false,'reason','outreach_suppressed','outreach_status',p.outreach_status); END IF;
  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO c FROM public.supply_campaigns_v1 WHERE id=p_campaign_id;
    IF NOT FOUND OR c.status<>'ACTIVE' OR c.kill_switch THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_active'); END IF;
  END IF;
  IF upper(p_channel) NOT IN('MANUAL','WHATSAPP') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_channel'); END IF;
  target:=fixeo_private.supply_normalize_e164_v1(p.contact_phone);
  IF upper(p_channel)='WHATSAPP' AND target IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_whatsapp_recipient'); END IF;

  INSERT INTO public.supply_channel_outbox_v1(
    artisan_id,campaign_id,task_id,channel,recipient_e164,template_key,message_kind,payload,status,not_before,idempotency_key
  ) VALUES(
    p_artisan_id,p_campaign_id,p_task_id,upper(p_channel),target,btrim(p_template_key),upper(p_message_kind),
    COALESCE(p_payload,'{}'::jsonb),'READY',COALESCE(p_not_before,now()),p_idempotency_key
  )
  ON CONFLICT(idempotency_key) DO UPDATE SET updated_at=public.supply_channel_outbox_v1.updated_at
  RETURNING id INTO oid;

  RETURN jsonb_build_object(
    'ok',true,'outbox_id',oid,'channel',upper(p_channel),'status','READY',
    'claim_path','/rejoindre-fixeo.html?id='||p_artisan_id::text||'#revendique'
  );
END
$fn$;
ALTER FUNCTION public.supply_prepare_channel_message_v1(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_prepare_channel_message_v1(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_prepare_channel_message_v1(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_channel_peek_v1(p_channel text DEFAULT 'WHATSAPP')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE o public.supply_channel_outbox_v1;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO o FROM public.supply_channel_outbox_v1
  WHERE channel=upper(p_channel) AND status='READY' AND not_before<=now()
  ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'state','EMPTY'); END IF;
  RETURN jsonb_build_object('ok',true,'state','READY','outbox_id',o.id,'artisan_id',o.artisan_id,
    'campaign_id',o.campaign_id,'task_id',o.task_id,'recipient_e164',o.recipient_e164,
    'template_key',o.template_key,'message_kind',o.message_kind,'payload',o.payload);
END
$fn$;
ALTER FUNCTION public.supply_channel_peek_v1(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_channel_peek_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_channel_peek_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_channel_claim_next_v1(p_channel text,p_worker text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE o public.supply_channel_outbox_v1;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  WITH candidate AS (
    SELECT id FROM public.supply_channel_outbox_v1
    WHERE channel=upper(p_channel) AND status='READY' AND not_before<=now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.supply_channel_outbox_v1 o SET status='CLAIMED',claimed_by=btrim(p_worker),claimed_at=now(),
    attempt_count=attempt_count+1,updated_at=now()
  FROM candidate c WHERE o.id=c.id RETURNING o.* INTO o;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'state','EMPTY'); END IF;
  RETURN jsonb_build_object('ok',true,'state','CLAIMED','outbox_id',o.id,'artisan_id',o.artisan_id,
    'campaign_id',o.campaign_id,'task_id',o.task_id,'recipient_e164',o.recipient_e164,
    'template_key',o.template_key,'message_kind',o.message_kind,'payload',o.payload);
END
$fn$;
ALTER FUNCTION public.supply_channel_claim_next_v1(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_channel_claim_next_v1(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_channel_claim_next_v1(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_channel_finalize_v1(
  p_outbox_id uuid,p_status text,p_provider_message_id text DEFAULT NULL,p_error text DEFAULT NULL,
  p_channel_cost_minor bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE o public.supply_channel_outbox_v1;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN('SENT','DELIVERED','READ','FAILED','CANCELLED') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  SELECT * INTO o FROM public.supply_channel_outbox_v1 WHERE id=p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','outbox_not_found'); END IF;
  IF o.status NOT IN('CLAIMED','SENT','DELIVERED') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_transition','current',o.status); END IF;
  UPDATE public.supply_channel_outbox_v1 SET
    status=p_status,provider_message_id=COALESCE(NULLIF(btrim(COALESCE(p_provider_message_id,'')),''),provider_message_id),
    last_error=NULLIF(btrim(COALESCE(p_error,'')),''),
    channel_cost_minor=GREATEST(channel_cost_minor,COALESCE(p_channel_cost_minor,0)),updated_at=now()
  WHERE id=o.id;
  IF p_status='SENT' THEN
    PERFORM public.supply_record_contact_attempt_v1(
      o.artisan_id,o.campaign_id,o.task_id,o.channel,'ATTEMPTED','provider_event',
      jsonb_build_object('outbox_id',o.id,'provider_state','sent'),p_provider_message_id,gen_random_uuid()
    );
  ELSIF p_status='DELIVERED' THEN
    INSERT INTO public.supply_recruitment_attempts_v1(
      artisan_id,campaign_id,task_id,channel,direction,outcome,evidence_class,evidence,
      provider_message_id,idempotency_key,actor_kind,actor_user_id
    ) VALUES(
      o.artisan_id,o.campaign_id,o.task_id,o.channel,'OUTBOUND','DELIVERED','provider_event',
      jsonb_build_object('outbox_id',o.id,'provider_state','delivered'),
      COALESCE(p_provider_message_id,o.provider_message_id),gen_random_uuid(),'system',NULL
    );
  END IF;
  RETURN jsonb_build_object('ok',true,'outbox_id',o.id,'status',p_status);
END
$fn$;
ALTER FUNCTION public.supply_channel_finalize_v1(uuid,text,text,text,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_channel_finalize_v1(uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_channel_finalize_v1(uuid,text,text,text,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_process_whatsapp_inbound_v1(p_inbound_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE m public.whatsapp_inbound_messages; aid uuid; matches integer; recent_campaign uuid; tid uuid; msg text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.supply_inbound_links_v1 WHERE inbound_message_id=p_inbound_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','already_processed');
  END IF;
  SELECT * INTO m FROM public.whatsapp_inbound_messages WHERE id=p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','inbound_not_found'); END IF;

  SELECT count(*),min(p.artisan_id) INTO matches,aid
  FROM public.supply_artisan_projection_v1 p
  WHERE fixeo_private.supply_normalize_e164_v1(p.contact_phone)=fixeo_private.supply_normalize_e164_v1(m.from_e164);

  IF matches<>1 THEN
    INSERT INTO public.supply_inbound_links_v1(inbound_message_id,resolution_status,resolution_evidence)
    VALUES(p_inbound_id,CASE WHEN matches=0 THEN 'UNMATCHED' ELSE 'AMBIGUOUS' END,jsonb_build_object('matches',matches));
    RETURN jsonb_build_object('ok',true,'resolution',CASE WHEN matches=0 THEN 'UNMATCHED' ELSE 'AMBIGUOUS' END);
  END IF;

  SELECT campaign_id INTO recent_campaign FROM public.supply_channel_outbox_v1
  WHERE artisan_id=aid AND channel='WHATSAPP' ORDER BY created_at DESC LIMIT 1;

  msg:=lower(btrim(COALESCE(m.message_text,'')));
  IF msg IN('stop','arrêt','arret','unsubscribe') THEN
    PERFORM public.supply_set_contact_preference_v1(aid,'OPTED_OUT','explicit_whatsapp_keyword',NULL,false,gen_random_uuid());
    INSERT INTO public.supply_inbound_links_v1(inbound_message_id,artisan_id,campaign_id,resolution_status,resolution_evidence)
    VALUES(p_inbound_id,aid,recent_campaign,'SUPPRESSED',jsonb_build_object('keyword',msg));
    RETURN jsonb_build_object('ok',true,'resolution','SUPPRESSED','artisan_id',aid);
  END IF;

  INSERT INTO public.supply_work_queue_v1(
    artisan_id,campaign_id,task_type,priority,reason_codes,evidence,status,not_before,max_attempts,idempotency_key
  ) VALUES(
    aid,recent_campaign,'CLASSIFY_REPLY',900,jsonb_build_array('whatsapp_inbound'),
    jsonb_build_object('inbound_message_id',p_inbound_id,'message_type',m.message_type),
    'QUEUED',now(),3,gen_random_uuid()
  ) RETURNING id INTO tid;

  PERFORM public.supply_record_stage_v1(
    aid,'ENGAGED','whatsapp.inbound','user_message',
    jsonb_build_object('inbound_message_id',p_inbound_id),NULL,gen_random_uuid()
  );

  INSERT INTO public.supply_inbound_links_v1(inbound_message_id,artisan_id,campaign_id,task_id,resolution_status,resolution_evidence)
  VALUES(p_inbound_id,aid,recent_campaign,tid,'MATCHED',jsonb_build_object('matched_by','normalized_phone'));

  RETURN jsonb_build_object('ok',true,'resolution','MATCHED','artisan_id',aid,'task_id',tid);
END
$fn$;
ALTER FUNCTION public.supply_process_whatsapp_inbound_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_process_whatsapp_inbound_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_process_whatsapp_inbound_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_channel_metrics_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE j jsonb;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'ready',count(*) FILTER(WHERE status='READY'),
    'claimed',count(*) FILTER(WHERE status='CLAIMED'),
    'sent',count(*) FILTER(WHERE status='SENT'),
    'delivered',count(*) FILTER(WHERE status='DELIVERED'),
    'read',count(*) FILTER(WHERE status='READ'),
    'failed',count(*) FILTER(WHERE status='FAILED'),
    'channel_cost_today',COALESCE(sum(channel_cost_minor) FILTER(WHERE created_at>=date_trunc('day',now())),0),
    'whatsapp_ready',count(*) FILTER(WHERE channel='WHATSAPP' AND status='READY'),
    'manual_ready',count(*) FILTER(WHERE channel='MANUAL' AND status='READY')
  ) INTO j FROM public.supply_channel_outbox_v1;
  RETURN j;
END
$fn$;
ALTER FUNCTION public.supply_admin_channel_metrics_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_channel_metrics_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_channel_metrics_v1() TO authenticated;

COMMIT;
