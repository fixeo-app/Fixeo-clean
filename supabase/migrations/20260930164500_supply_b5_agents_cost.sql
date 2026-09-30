-- FIXEO Supply Engine — Bloc 5
-- Agent runtime, governed actions and hard AI cost controls.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_work_queue_v1') IS NULL
     OR to_regprocedure('public.supply_record_contact_attempt_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid)') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B5_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE TABLE public.supply_runtime_config_v1(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  global_kill_switch boolean NOT NULL DEFAULT false,
  daily_ai_budget_minor bigint NOT NULL DEFAULT 0 CHECK(daily_ai_budget_minor>=0),
  currency text NOT NULL DEFAULT 'MAD' CHECK(char_length(currency)=3),
  max_model_calls_per_task integer NOT NULL DEFAULT 2 CHECK(max_model_calls_per_task BETWEEN 0 AND 20),
  max_escalations_per_task integer NOT NULL DEFAULT 1 CHECK(max_escalations_per_task BETWEEN 0 AND 10),
  updated_by uuid REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.supply_runtime_config_v1(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE TABLE public.supply_agents_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK(char_length(btrim(name)) BETWEEN 1 AND 120),
  agent_type text NOT NULL CHECK(agent_type IN(
    'RAFI_SUPPLY_ORCHESTRATOR','RECRUITER','CONVERSATION_CLASSIFIER','ACTIVATION','RECOVERY','TRUST_PREPARER'
  )),
  version text NOT NULL CHECK(char_length(btrim(version)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'PAUSED' CHECK(status IN('ACTIVE','PAUSED','DISABLED')),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(capabilities)='array'),
  model_tier text NOT NULL DEFAULT 'RULES_ONLY' CHECK(model_tier IN('RULES_ONLY','LOW_COST','STANDARD','ESCALATION')),
  daily_ai_budget_minor bigint NOT NULL DEFAULT 0 CHECK(daily_ai_budget_minor>=0),
  kill_switch boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_agent_runs_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.supply_agents_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN('RUNNING','SUCCEEDED','FAILED','CANCELLED','BUDGET_STOP')),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(summary)='object')
);

CREATE TABLE public.supply_ai_usage_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.supply_agents_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.supply_agent_runs_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  task_id uuid REFERENCES public.supply_work_queue_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.supply_campaigns_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  purpose_code text NOT NULL,
  model_tier text NOT NULL CHECK(model_tier IN('LOW_COST','STANDARD','ESCALATION')),
  model_name text,
  input_units bigint NOT NULL DEFAULT 0 CHECK(input_units>=0),
  output_units bigint NOT NULL DEFAULT 0 CHECK(output_units>=0),
  cached_units bigint NOT NULL DEFAULT 0 CHECK(cached_units>=0),
  estimated_cost_minor bigint NOT NULL CHECK(estimated_cost_minor>=0),
  currency text NOT NULL DEFAULT 'MAD' CHECK(char_length(currency)=3),
  latency_ms integer CHECK(latency_ms IS NULL OR latency_ms>=0),
  escalation_from text,
  outcome_code text,
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_agent_action_log_v1(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.supply_agents_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.supply_agent_runs_v1(id) ON UPDATE CASCADE ON DELETE CASCADE,
  task_id uuid REFERENCES public.supply_work_queue_v1(id) ON UPDATE CASCADE ON DELETE SET NULL,
  artisan_id uuid REFERENCES public.artisans(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(result)='object'),
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supply_ai_usage_agent_day_idx ON public.supply_ai_usage_v1(agent_id,created_at DESC);
CREATE INDEX supply_ai_usage_campaign_day_idx ON public.supply_ai_usage_v1(campaign_id,created_at DESC);
CREATE INDEX supply_agent_runs_agent_idx ON public.supply_agent_runs_v1(agent_id,started_at DESC);

ALTER TABLE public.supply_runtime_config_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_agents_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_agent_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_ai_usage_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_agent_action_log_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supply_runtime_config_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_agents_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_agent_runs_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_ai_usage_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.supply_agent_action_log_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_set_runtime_v1(
  p_global_kill_switch boolean,p_daily_ai_budget_minor bigint,
  p_max_calls integer DEFAULT 2,p_max_escalations integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE public.supply_runtime_config_v1 SET
    global_kill_switch=COALESCE(p_global_kill_switch,false),
    daily_ai_budget_minor=GREATEST(0,COALESCE(p_daily_ai_budget_minor,0)),
    max_model_calls_per_task=GREATEST(0,LEAST(COALESCE(p_max_calls,2),20)),
    max_escalations_per_task=GREATEST(0,LEAST(COALESCE(p_max_escalations,1),10)),
    updated_by=auth.uid(),updated_at=now()
  WHERE singleton=true;
  RETURN jsonb_build_object('ok',true,'global_kill_switch',p_global_kill_switch,
    'daily_ai_budget_minor',GREATEST(0,COALESCE(p_daily_ai_budget_minor,0)));
END
$fn$;
ALTER FUNCTION public.supply_admin_set_runtime_v1(boolean,bigint,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_set_runtime_v1(boolean,bigint,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_set_runtime_v1(boolean,bigint,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_register_agent_v1(
  p_name text,p_agent_type text,p_version text,p_capabilities jsonb DEFAULT '[]'::jsonb,
  p_model_tier text DEFAULT 'RULES_ONLY',p_daily_ai_budget_minor bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE x public.supply_agents_v1;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.supply_agents_v1(name,agent_type,version,capabilities,model_tier,daily_ai_budget_minor,created_by)
  VALUES(btrim(p_name),upper(p_agent_type),btrim(p_version),COALESCE(p_capabilities,'[]'::jsonb),
    upper(COALESCE(p_model_tier,'RULES_ONLY')),GREATEST(0,COALESCE(p_daily_ai_budget_minor,0)),auth.uid())
  ON CONFLICT(name) DO UPDATE SET
    agent_type=excluded.agent_type,version=excluded.version,capabilities=excluded.capabilities,
    model_tier=excluded.model_tier,daily_ai_budget_minor=excluded.daily_ai_budget_minor,updated_at=now()
  RETURNING * INTO x;
  RETURN jsonb_build_object('ok',true,'agent_id',x.id,'status',x.status,'model_tier',x.model_tier);
EXCEPTION WHEN check_violation THEN RETURN jsonb_build_object('ok',false,'reason','invalid_agent_config');
END
$fn$;
ALTER FUNCTION public.supply_admin_register_agent_v1(text,text,text,jsonb,text,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_register_agent_v1(text,text,text,jsonb,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_register_agent_v1(text,text,text,jsonb,text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_set_agent_state_v1(
  p_agent_id uuid,p_status text,p_kill_switch boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE a public.supply_agents_v1;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN('ACTIVE','PAUSED','DISABLED') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
  UPDATE public.supply_agents_v1 SET status=p_status,kill_switch=COALESCE(p_kill_switch,kill_switch),updated_at=now()
  WHERE id=p_agent_id RETURNING * INTO a;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'agent_id',a.id,'status',a.status,'kill_switch',a.kill_switch);
END
$fn$;
ALTER FUNCTION public.supply_admin_set_agent_state_v1(uuid,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_set_agent_state_v1(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_set_agent_state_v1(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_agent_begin_run_v1(p_agent_id uuid,p_campaign_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE a public.supply_agents_v1; cfg public.supply_runtime_config_v1; rid uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.supply_runtime_config_v1 WHERE singleton=true;
  IF cfg.global_kill_switch THEN RETURN jsonb_build_object('ok',false,'reason','global_kill_switch'); END IF;
  SELECT * INTO a FROM public.supply_agents_v1 WHERE id=p_agent_id;
  IF NOT FOUND OR a.status<>'ACTIVE' OR a.kill_switch THEN RETURN jsonb_build_object('ok',false,'reason','agent_not_active'); END IF;
  IF p_campaign_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.supply_campaigns_v1 c WHERE c.id=p_campaign_id AND c.status='ACTIVE' AND c.kill_switch=false
  ) THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_active'); END IF;
  INSERT INTO public.supply_agent_runs_v1(agent_id,campaign_id) VALUES(p_agent_id,p_campaign_id) RETURNING id INTO rid;
  RETURN jsonb_build_object('ok',true,'run_id',rid,'agent_id',p_agent_id);
END
$fn$;
ALTER FUNCTION public.supply_agent_begin_run_v1(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_agent_begin_run_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_agent_begin_run_v1(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_agent_record_ai_usage_v1(
  p_agent_id uuid,p_run_id uuid,p_task_id uuid,p_purpose_code text,p_model_tier text,
  p_model_name text,p_input_units bigint,p_output_units bigint,p_cached_units bigint,
  p_estimated_cost_minor bigint,p_latency_ms integer,p_escalation_from text,p_outcome_code text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE cfg public.supply_runtime_config_v1; a public.supply_agents_v1; r public.supply_agent_runs_v1;
  global_spend bigint; agent_spend bigint; campaign_spend bigint; calls integer; escalations integer;
  campaign_budget bigint;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.supply_runtime_config_v1 WHERE singleton=true FOR UPDATE;
  SELECT * INTO a FROM public.supply_agents_v1 WHERE id=p_agent_id FOR UPDATE;
  SELECT * INTO r FROM public.supply_agent_runs_v1 WHERE id=p_run_id AND agent_id=p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','run_not_found'); END IF;
  IF cfg.global_kill_switch OR a.kill_switch OR a.status<>'ACTIVE' THEN
    RETURN jsonb_build_object('ok',false,'reason','runtime_stopped');
  END IF;
  IF p_model_tier NOT IN('LOW_COST','STANDARD','ESCALATION') OR p_estimated_cost_minor<0 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_usage');
  END IF;
  IF cfg.daily_ai_budget_minor=0 OR a.daily_ai_budget_minor=0 THEN
    RETURN jsonb_build_object('ok',false,'reason','ai_budget_disabled');
  END IF;

  SELECT COALESCE(sum(estimated_cost_minor),0) INTO global_spend
  FROM public.supply_ai_usage_v1 WHERE created_at>=date_trunc('day',now());
  SELECT COALESCE(sum(estimated_cost_minor),0) INTO agent_spend
  FROM public.supply_ai_usage_v1 WHERE agent_id=p_agent_id AND created_at>=date_trunc('day',now());
  IF global_spend+p_estimated_cost_minor>cfg.daily_ai_budget_minor THEN
    RETURN jsonb_build_object('ok',false,'reason','global_ai_budget_exceeded');
  END IF;
  IF agent_spend+p_estimated_cost_minor>a.daily_ai_budget_minor THEN
    RETURN jsonb_build_object('ok',false,'reason','agent_ai_budget_exceeded');
  END IF;

  IF r.campaign_id IS NOT NULL THEN
    SELECT daily_ai_budget_minor INTO campaign_budget FROM public.supply_campaigns_v1 WHERE id=r.campaign_id;
    IF COALESCE(campaign_budget,0)=0 THEN RETURN jsonb_build_object('ok',false,'reason','campaign_ai_budget_disabled'); END IF;
    SELECT COALESCE(sum(estimated_cost_minor),0) INTO campaign_spend
    FROM public.supply_ai_usage_v1 WHERE campaign_id=r.campaign_id AND created_at>=date_trunc('day',now());
    IF campaign_spend+p_estimated_cost_minor>campaign_budget THEN
      RETURN jsonb_build_object('ok',false,'reason','campaign_ai_budget_exceeded');
    END IF;
  END IF;

  IF p_task_id IS NOT NULL THEN
    SELECT count(*) INTO calls FROM public.supply_ai_usage_v1 WHERE task_id=p_task_id;
    SELECT count(*) INTO escalations FROM public.supply_ai_usage_v1 WHERE task_id=p_task_id AND model_tier='ESCALATION';
    IF calls>=cfg.max_model_calls_per_task THEN RETURN jsonb_build_object('ok',false,'reason','task_model_call_cap'); END IF;
    IF p_model_tier='ESCALATION' AND escalations>=cfg.max_escalations_per_task THEN
      RETURN jsonb_build_object('ok',false,'reason','task_escalation_cap');
    END IF;
  END IF;

  INSERT INTO public.supply_ai_usage_v1(
    agent_id,run_id,task_id,campaign_id,purpose_code,model_tier,model_name,input_units,output_units,cached_units,
    estimated_cost_minor,latency_ms,escalation_from,outcome_code,idempotency_key
  ) VALUES(
    p_agent_id,p_run_id,p_task_id,r.campaign_id,btrim(p_purpose_code),p_model_tier,NULLIF(btrim(COALESCE(p_model_name,'')),''),
    GREATEST(0,COALESCE(p_input_units,0)),GREATEST(0,COALESCE(p_output_units,0)),GREATEST(0,COALESCE(p_cached_units,0)),
    p_estimated_cost_minor,p_latency_ms,NULLIF(btrim(COALESCE(p_escalation_from,'')),''),
    NULLIF(btrim(COALESCE(p_outcome_code,'')),''),p_idempotency_key
  ) ON CONFLICT(idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok',true,'estimated_cost_minor',p_estimated_cost_minor);
END
$fn$;
ALTER FUNCTION public.supply_agent_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,integer,text,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_agent_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_agent_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,integer,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_agent_action_v1(
  p_agent_id uuid,p_run_id uuid,p_task_id uuid,p_action_type text,p_payload jsonb,p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE a public.supply_agents_v1; r public.supply_agent_runs_v1; q public.supply_work_queue_v1;
  cfg public.supply_runtime_config_v1; res jsonb; status text; nb timestamptz; new_task uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.supply_runtime_config_v1 WHERE singleton=true;
  SELECT * INTO a FROM public.supply_agents_v1 WHERE id=p_agent_id;
  SELECT * INTO r FROM public.supply_agent_runs_v1 WHERE id=p_run_id AND agent_id=p_agent_id;
  SELECT * INTO q FROM public.supply_work_queue_v1 WHERE id=p_task_id FOR UPDATE;
  IF cfg.global_kill_switch OR a.id IS NULL OR a.status<>'ACTIVE' OR a.kill_switch THEN
    RETURN jsonb_build_object('ok',false,'reason','runtime_stopped');
  END IF;
  IF r.id IS NULL OR r.status<>'RUNNING' THEN RETURN jsonb_build_object('ok',false,'reason','run_not_active'); END IF;
  IF q.id IS NULL OR q.status NOT IN('LEASED','RUNNING') OR q.lease_owner IS DISTINCT FROM p_agent_id::text OR q.lease_until<now() THEN
    RETURN jsonb_build_object('ok',false,'reason','task_lease_required');
  END IF;
  IF EXISTS(SELECT 1 FROM public.supply_agent_action_log_v1 WHERE idempotency_key=p_idempotency_key) THEN
    RETURN (SELECT result FROM public.supply_agent_action_log_v1 WHERE idempotency_key=p_idempotency_key);
  END IF;

  CASE p_action_type
    WHEN 'record_contact_attempt' THEN
      res:=public.supply_record_contact_attempt_v1(
        q.artisan_id,q.campaign_id,q.id,COALESCE(p_payload->>'channel','MANUAL'),
        COALESCE(p_payload->>'outcome','ATTEMPTED'),COALESCE(p_payload->>'evidence_class','deterministic_rule'),
        COALESCE(p_payload->'evidence','{}'::jsonb),p_payload->>'provider_message_id',p_idempotency_key
      );
    WHEN 'mark_engaged' THEN
      res:=public.supply_record_stage_v1(
        q.artisan_id,'ENGAGED','agent.engaged',
        COALESCE(p_payload->>'evidence_class','model_inference'),
        COALESCE(p_payload->'evidence','{}'::jsonb),NULL,p_idempotency_key
      );
    WHEN 'schedule_followup' THEN
      nb:=COALESCE((p_payload->>'not_before')::timestamptz,now()+interval '24 hours');
      INSERT INTO public.supply_work_queue_v1(
        artisan_id,campaign_id,task_type,priority,reason_codes,evidence,status,not_before,max_attempts,idempotency_key
      ) VALUES(
        q.artisan_id,q.campaign_id,'FOLLOW_UP',q.priority,
        jsonb_build_array('agent_scheduled_followup'),COALESCE(p_payload->'evidence','{}'::jsonb),
        'QUEUED',nb,q.max_attempts,p_idempotency_key
      ) RETURNING id INTO new_task;
      res:=jsonb_build_object('ok',true,'followup_task_id',new_task,'not_before',nb);
    WHEN 'suppress_outreach' THEN
      status:=upper(COALESCE(p_payload->>'status',''));
      IF status NOT IN('OPTED_OUT','WRONG_NUMBER','BLOCKED','COOLDOWN') THEN
        res:=jsonb_build_object('ok',false,'reason','invalid_suppression');
      ELSE
        res:=public.supply_set_contact_preference_v1(
          q.artisan_id,status,p_payload->>'reason',
          CASE WHEN status='COOLDOWN' THEN (p_payload->>'cooldown_until')::timestamptz ELSE NULL END,
          false,p_idempotency_key
        );
      END IF;
    WHEN 'request_human_review' THEN
      UPDATE public.supply_work_queue_v1 SET status='HUMAN_REVIEW',result=COALESCE(p_payload,'{}'::jsonb),
        lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=q.id;
      res:=jsonb_build_object('ok',true,'task_id',q.id,'status','HUMAN_REVIEW');
    WHEN 'prepare_claim' THEN
      res:=public.supply_activation_plan_v1(q.artisan_id);
    ELSE
      res:=jsonb_build_object('ok',false,'reason','action_not_allowed');
  END CASE;

  INSERT INTO public.supply_agent_action_log_v1(agent_id,run_id,task_id,artisan_id,action_type,payload,result,idempotency_key)
  VALUES(p_agent_id,p_run_id,p_task_id,q.artisan_id,p_action_type,COALESCE(p_payload,'{}'::jsonb),COALESCE(res,'{}'::jsonb),p_idempotency_key)
  ON CONFLICT(idempotency_key) DO NOTHING;
  RETURN res;
END
$fn$;
ALTER FUNCTION public.supply_agent_action_v1(uuid,uuid,uuid,text,jsonb,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_agent_action_v1(uuid,uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_agent_action_v1(uuid,uuid,uuid,text,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_agent_metrics_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE j jsonb;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'global_kill_switch',(SELECT global_kill_switch FROM public.supply_runtime_config_v1 WHERE singleton=true),
    'daily_ai_budget_minor',(SELECT daily_ai_budget_minor FROM public.supply_runtime_config_v1 WHERE singleton=true),
    'ai_spend_today',COALESCE((SELECT sum(estimated_cost_minor) FROM public.supply_ai_usage_v1 WHERE created_at>=date_trunc('day',now())),0),
    'agents_total',(SELECT count(*) FROM public.supply_agents_v1),
    'agents_active',(SELECT count(*) FROM public.supply_agents_v1 WHERE status='ACTIVE' AND kill_switch=false),
    'runs_today',(SELECT count(*) FROM public.supply_agent_runs_v1 WHERE started_at>=date_trunc('day',now())),
    'model_calls_today',(SELECT count(*) FROM public.supply_ai_usage_v1 WHERE created_at>=date_trunc('day',now())),
    'rules_only_agents',(SELECT count(*) FROM public.supply_agents_v1 WHERE model_tier='RULES_ONLY')
  ) INTO j;
  RETURN j;
END
$fn$;
ALTER FUNCTION public.supply_admin_agent_metrics_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_agent_metrics_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_agent_metrics_v1() TO authenticated;

COMMIT;
