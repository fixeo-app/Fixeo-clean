-- FIXEO Supply Engine — Bloc 3
-- Recruitment CRM + campaigns + bounded leased work queue.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_artisan_projection_v1') IS NULL
     OR to_regprocedure('public.supply_recruitment_candidates_v1(text,text,integer)') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B3_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE TABLE public.supply_campaigns_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  city text,
  service_category text,
  preferred_channel text NOT NULL DEFAULT 'MANUAL' CHECK(preferred_channel IN('MANUAL','WHATSAPP')),
  daily_contact_limit integer NOT NULL DEFAULT 30 CHECK(daily_contact_limit BETWEEN 1 AND 1000),
  max_attempts_per_artisan integer NOT NULL DEFAULT 3 CHECK(max_attempts_per_artisan BETWEEN 1 AND 20),
  cooldown_hours integer NOT NULL DEFAULT 48 CHECK(cooldown_hours BETWEEN 1 AND 2160),
  daily_ai_budget_minor integer NOT NULL DEFAULT 0 CHECK(daily_ai_budget_minor>=0),
  currency text NOT NULL DEFAULT 'MAD' CHECK(char_length(currency)=3),
  kill_switch boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_recruitment_attempts_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  task_id uuid,
  channel text NOT NULL CHECK(channel IN('MANUAL','WHATSAPP','OTHER')),
  direction text NOT NULL DEFAULT 'OUTBOUND' CHECK(direction IN('OUTBOUND','INBOUND')),
  outcome text NOT NULL CHECK(outcome IN(
    'ATTEMPTED','DELIVERED','REPLIED','INTERESTED','NOT_INTERESTED','CALLBACK',
    'WRONG_NUMBER','OPTED_OUT','NO_RESPONSE','FAILED'
  )),
  evidence_class text NOT NULL DEFAULT 'operator_assertion'
    CHECK(evidence_class IN('canonical_db','provider_event','user_message','operator_assertion','deterministic_rule','model_inference')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object'),
  provider_message_id text,
  idempotency_key uuid NOT NULL UNIQUE,
  actor_kind text NOT NULL CHECK(actor_kind IN('human','agent','system')),
  actor_user_id uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_work_queue_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  task_type text NOT NULL CHECK(task_type IN(
    'CONTACT','CLASSIFY_REPLY','FOLLOW_UP','ACTIVATION_ASSIST','RECOVERY','TRUST_PREPARE','HUMAN_REVIEW'
  )),
  priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 1000),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reason_codes)='array'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object'),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN(
    'QUEUED','LEASED','RUNNING','SUCCEEDED','RETRYABLE','FAILED','CANCELLED','HUMAN_REVIEW','DEFERRED_BUDGET'
  )),
  not_before timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  lease_owner text,
  lease_token uuid,
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 20),
  idempotency_key uuid NOT NULL UNIQUE,
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supply_campaign_status_idx ON public.supply_campaigns_v1(status,kill_switch);
CREATE INDEX supply_attempt_artisan_idx ON public.supply_recruitment_attempts_v1(artisan_id,created_at DESC);
CREATE INDEX supply_attempt_campaign_idx ON public.supply_recruitment_attempts_v1(campaign_id,created_at DESC);
CREATE INDEX supply_work_ready_idx ON public.supply_work_queue_v1(status,not_before,priority DESC,created_at)
 WHERE status IN('QUEUED','RETRYABLE');
CREATE INDEX supply_work_artisan_idx ON public.supply_work_queue_v1(artisan_id,status);

ALTER TABLE public.supply_campaigns_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_recruitment_attempts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_work_queue_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supply_campaigns_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_recruitment_attempts_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_work_queue_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_create_campaign_v1(
  p_name text,p_city text DEFAULT NULL,p_service text DEFAULT NULL,
  p_channel text DEFAULT 'MANUAL',p_daily_contact_limit integer DEFAULT 30,
  p_max_attempts integer DEFAULT 3,p_cooldown_hours integer DEFAULT 48,
  p_daily_ai_budget_minor integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE id uuid;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.supply_campaigns_v1(
    name,city,service_category,preferred_channel,daily_contact_limit,max_attempts_per_artisan,
    cooldown_hours,daily_ai_budget_minor,created_by
  ) VALUES(
    btrim(p_name),NULLIF(btrim(COALESCE(p_city,'')),''),
    NULLIF(btrim(COALESCE(p_service,'')),''),
    upper(COALESCE(p_channel,'MANUAL')),COALESCE(p_daily_contact_limit,30),
    COALESCE(p_max_attempts,3),COALESCE(p_cooldown_hours,48),
    COALESCE(p_daily_ai_budget_minor,0),auth.uid()
  ) RETURNING supply_campaigns_v1.id INTO id;
  RETURN jsonb_build_object('ok',true,'campaign_id',id,'status','DRAFT');
EXCEPTION WHEN check_violation THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_campaign_config');
END
$fn$;
ALTER FUNCTION public.supply_create_campaign_v1(text,text,text,text,integer,integer,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_create_campaign_v1(text,text,text,text,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_create_campaign_v1(text,text,text,text,integer,integer,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_set_campaign_status_v1(p_campaign_id uuid,p_status text,p_kill_switch boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE c public.supply_campaigns_v1;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;
  UPDATE public.supply_campaigns_v1 SET status=p_status,
    kill_switch=COALESCE(p_kill_switch,kill_switch),updated_at=now()
  WHERE id=p_campaign_id RETURNING * INTO c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_found'); END IF;
  IF c.kill_switch OR c.status IN('PAUSED','COMPLETED','CANCELLED') THEN
    UPDATE public.supply_work_queue_v1
    SET status='CANCELLED',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE campaign_id=c.id AND status IN('QUEUED','RETRYABLE','LEASED','RUNNING');
  END IF;
  RETURN jsonb_build_object('ok',true,'campaign_id',c.id,'status',c.status,'kill_switch',c.kill_switch);
END
$fn$;
ALTER FUNCTION public.supply_set_campaign_status_v1(uuid,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_set_campaign_status_v1(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_set_campaign_status_v1(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_enqueue_campaign_v1(p_campaign_id uuid,p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  actor_kind text;
  c public.supply_campaigns_v1;
  x record;
  inserted_count integer:=0;
  idem uuid;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  SELECT * INTO c FROM public.supply_campaigns_v1 WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_found'); END IF;
  IF c.status NOT IN('DRAFT','ACTIVE') OR c.kill_switch THEN
    RETURN jsonb_build_object('ok',false,'reason','campaign_not_runnable');
  END IF;

  FOR x IN SELECT * FROM public.supply_recruitment_candidates_v1(c.city,c.service_category,GREATEST(1,LEAST(COALESCE(p_limit,30),200)))
  LOOP
    idem:=extensions.gen_random_uuid();
    IF NOT EXISTS(
      SELECT 1 FROM public.supply_work_queue_v1 q
      WHERE q.campaign_id=c.id AND q.artisan_id=x.artisan_id
        AND q.task_type='CONTACT' AND q.status IN('QUEUED','LEASED','RUNNING','RETRYABLE','SUCCEEDED')
    ) THEN
      INSERT INTO public.supply_work_queue_v1(
        artisan_id,campaign_id,task_type,priority,reason_codes,evidence,max_attempts,idempotency_key
      ) VALUES(
        x.artisan_id,c.id,'CONTACT',LEAST(1000,GREATEST(0,x.score*10)),
        COALESCE(x.reasons,'{}'::jsonb)::jsonb,
        jsonb_build_object('candidate_score',x.score,'city',x.city,'service_category',x.service_category,'source','supply_recruitment_candidates_v1'),
        c.max_attempts_per_artisan,idem
      );
      PERFORM public.supply_record_stage_v1(
        x.artisan_id,'RECRUITMENT_CANDIDATE','campaign.enqueued','deterministic_rule',
        jsonb_build_object('campaign_id',c.id,'score',x.score),NULL,extensions.gen_random_uuid()
      );
      inserted_count:=inserted_count+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'campaign_id',c.id,'enqueued',inserted_count);
END
$fn$;
ALTER FUNCTION public.supply_enqueue_campaign_v1(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_enqueue_campaign_v1(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_enqueue_campaign_v1(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_lease_work_v1(
  p_worker text,p_limit integer DEFAULT 5,p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.supply_work_queue_v1
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  PERFORM fixeo_private.supply_require_actor_v1();
  IF btrim(COALESCE(p_worker,''))='' THEN RAISE EXCEPTION 'WORKER_REQUIRED'; END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT q.id
    FROM public.supply_work_queue_v1 q
    LEFT JOIN public.supply_campaigns_v1 c ON c.id=q.campaign_id
    LEFT JOIN public.supply_contact_preferences_v1 cp ON cp.artisan_id=q.artisan_id
    WHERE q.status IN('QUEUED','RETRYABLE')
      AND q.not_before<=now()
      AND (q.expires_at IS NULL OR q.expires_at>now())
      AND (c.id IS NULL OR (c.status='ACTIVE' AND c.kill_switch=false))
      AND COALESCE(cp.outreach_status,'ALLOWED') NOT IN('OPTED_OUT','WRONG_NUMBER','BLOCKED')
      AND NOT (cp.outreach_status='COOLDOWN' AND cp.cooldown_until>now())
    ORDER BY q.priority DESC,q.created_at
    FOR UPDATE OF q SKIP LOCKED
    LIMIT GREATEST(1,LEAST(COALESCE(p_limit,5),50))
  ), leased AS (
    UPDATE public.supply_work_queue_v1 q
    SET status='LEASED',lease_owner=btrim(p_worker),lease_token=gen_random_uuid(),
        lease_until=now()+make_interval(secs=>GREATEST(30,LEAST(COALESCE(p_lease_seconds,300),3600))),
        attempt_count=q.attempt_count+1,updated_at=now()
    FROM eligible e WHERE q.id=e.id
    RETURNING q.*
  )
  SELECT * FROM leased;
END
$fn$;
ALTER FUNCTION public.supply_lease_work_v1(text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_lease_work_v1(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_lease_work_v1(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_complete_work_v1(
  p_task_id uuid,p_lease_token uuid,p_status text,p_result jsonb DEFAULT NULL,p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE q public.supply_work_queue_v1;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN('SUCCEEDED','RETRYABLE','FAILED','HUMAN_REVIEW','DEFERRED_BUDGET') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_status');
  END IF;
  SELECT * INTO q FROM public.supply_work_queue_v1 WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','task_not_found'); END IF;
  IF q.status<>'LEASED' OR q.lease_token IS DISTINCT FROM p_lease_token OR q.lease_until<now() THEN
    RETURN jsonb_build_object('ok',false,'reason','lease_invalid');
  END IF;
  UPDATE public.supply_work_queue_v1 SET
    status=CASE WHEN p_status='RETRYABLE' AND attempt_count>=max_attempts THEN 'FAILED' ELSE p_status END,
    result=p_result,last_error=NULLIF(btrim(COALESCE(p_error,'')),''),
    not_before=CASE WHEN p_status='RETRYABLE' THEN now()+interval '1 hour' ELSE not_before END,
    lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
  WHERE id=q.id;
  RETURN jsonb_build_object('ok',true,'task_id',q.id,'status',
    (SELECT status FROM public.supply_work_queue_v1 WHERE id=q.id));
END
$fn$;
ALTER FUNCTION public.supply_complete_work_v1(uuid,uuid,text,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_complete_work_v1(uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_complete_work_v1(uuid,uuid,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_record_contact_attempt_v1(
  p_artisan_id uuid,p_campaign_id uuid,p_task_id uuid,p_channel text,p_outcome text,
  p_evidence_class text DEFAULT 'operator_assertion',p_evidence jsonb DEFAULT '{}'::jsonb,
  p_provider_message_id text DEFAULT NULL,p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE actor_kind text; pref text; cooldown timestamptz; c public.supply_campaigns_v1;
BEGIN
  actor_kind:=fixeo_private.supply_require_actor_v1();
  SELECT outreach_status,cooldown_until INTO pref,cooldown
  FROM public.supply_contact_preferences_v1 WHERE artisan_id=p_artisan_id;
  IF COALESCE(pref,'ALLOWED') IN('OPTED_OUT','WRONG_NUMBER','BLOCKED')
    OR (pref='COOLDOWN' AND cooldown>now()) THEN
    RETURN jsonb_build_object('ok',false,'reason','outreach_suppressed','status',COALESCE(pref,'ALLOWED'));
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    SELECT * INTO c FROM public.supply_campaigns_v1 WHERE id=p_campaign_id;
    IF NOT FOUND OR c.status<>'ACTIVE' OR c.kill_switch THEN
      RETURN jsonb_build_object('ok',false,'reason','campaign_not_active');
    END IF;
    IF (SELECT count(*) FROM public.supply_recruitment_attempts_v1
        WHERE campaign_id=c.id AND direction='OUTBOUND' AND created_at>=date_trunc('day',now())) >= c.daily_contact_limit THEN
      RETURN jsonb_build_object('ok',false,'reason','campaign_daily_contact_limit');
    END IF;
  END IF;

  INSERT INTO public.supply_recruitment_attempts_v1(
    artisan_id,campaign_id,task_id,channel,direction,outcome,evidence_class,evidence,
    provider_message_id,idempotency_key,actor_kind,actor_user_id
  ) VALUES(
    p_artisan_id,p_campaign_id,p_task_id,upper(p_channel),'OUTBOUND',upper(p_outcome),
    p_evidence_class,COALESCE(p_evidence,'{}'::jsonb),p_provider_message_id,p_idempotency_key,
    actor_kind,auth.uid()
  ) ON CONFLICT(idempotency_key) DO NOTHING;

  IF upper(p_outcome)='OPTED_OUT' THEN
    PERFORM public.supply_set_contact_preference_v1(p_artisan_id,'OPTED_OUT','artisan_opt_out',NULL,false,gen_random_uuid());
  ELSIF upper(p_outcome)='WRONG_NUMBER' THEN
    PERFORM public.supply_set_contact_preference_v1(p_artisan_id,'WRONG_NUMBER','provider_or_operator_signal',NULL,false,gen_random_uuid());
  ELSIF upper(p_outcome) IN('REPLIED','INTERESTED','CALLBACK') THEN
    PERFORM public.supply_record_stage_v1(p_artisan_id,'ENGAGED','recruitment.engaged',p_evidence_class,p_evidence,NULL,gen_random_uuid());
  ELSE
    PERFORM public.supply_record_stage_v1(p_artisan_id,'CONTACTED','recruitment.contacted',p_evidence_class,p_evidence,NULL,gen_random_uuid());
  END IF;

  RETURN jsonb_build_object('ok',true,'artisan_id',p_artisan_id,'outcome',upper(p_outcome));
END
$fn$;
ALTER FUNCTION public.supply_record_contact_attempt_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_record_contact_attempt_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_record_contact_attempt_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_queue_v1(p_limit integer DEFAULT 100)
RETURNS TABLE(
  task_id uuid,artisan_id uuid,artisan_name text,city text,service_category text,
  campaign_id uuid,campaign_name text,task_type text,priority integer,status text,
  not_before timestamptz,attempt_count integer,max_attempts integer,reason_codes jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT q.id,q.artisan_id,p.artisan_name,p.city,p.service_category,
    q.campaign_id,c.name,q.task_type,q.priority,q.status,q.not_before,q.attempt_count,q.max_attempts,q.reason_codes
  FROM public.supply_work_queue_v1 q
  JOIN public.supply_artisan_projection_v1 p ON p.artisan_id=q.artisan_id
  LEFT JOIN public.supply_campaigns_v1 c ON c.id=q.campaign_id
  ORDER BY CASE q.status WHEN 'HUMAN_REVIEW' THEN 0 WHEN 'QUEUED' THEN 1 WHEN 'RETRYABLE' THEN 2 ELSE 3 END,
    q.priority DESC,q.created_at DESC
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,100),500));
END
$fn$;
ALTER FUNCTION public.supply_admin_queue_v1(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_queue_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_queue_v1(integer) TO authenticated;

COMMIT;
