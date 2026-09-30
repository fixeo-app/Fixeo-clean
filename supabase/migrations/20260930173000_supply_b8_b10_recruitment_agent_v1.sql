-- FIXEO Supply Engine — Blocs 8-10
-- Operational command center, existing-base activation and governed Recruitment Agent V1.
-- Rules-first: no outbound provider send and no AI budget activation in this migration.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regclass('public.supply_artisan_projection_v1') IS NULL
     OR to_regclass('public.supply_work_queue_v1') IS NULL
     OR to_regclass('public.supply_agents_v1') IS NULL
     OR to_regprocedure('public.supply_admin_dashboard_v1()') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B8_B10_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.supply_admin_funnel_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE j jsonb;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'referenced',count(*),
    'claimable',count(*) FILTER(WHERE claimable_unowned),
    'contactable',count(*) FILTER(WHERE contactable),
    'candidate',count(*) FILTER(WHERE lifecycle_stage='RECRUITMENT_CANDIDATE'),
    'contacted',count(*) FILTER(WHERE lifecycle_stage='CONTACTED'),
    'engaged',count(*) FILTER(WHERE lifecycle_stage IN('ENGAGED','CLAIM_IN_PROGRESS')),
    'claimed',count(*) FILTER(WHERE lifecycle_stage='CLAIMED'),
    'onboarded',count(*) FILTER(WHERE lifecycle_stage='ONBOARDED'),
    'verified',count(*) FILTER(WHERE lifecycle_stage='VERIFIED'),
    'activated',count(*) FILTER(WHERE lifecycle_stage='ACTIVATED'),
    'operational_capacity_proven',count(*) FILTER(WHERE operational_capacity_proven)
  ) INTO j FROM public.supply_artisan_projection_v1;
  RETURN j;
END
$fn$;
ALTER FUNCTION public.supply_admin_funnel_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_funnel_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_funnel_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_existing_base_v1(p_city text DEFAULT NULL,p_service text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(
  artisan_id uuid,artisan_name text,city text,service_category text,lifecycle_stage text,
  contactable boolean,claimable_unowned boolean,score integer,reasons jsonb,claim_path text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.artisan_id,c.artisan_name,c.city,c.service_category,c.lifecycle_stage,
    p.contactable,p.claimable_unowned,c.score,c.reasons,c.claim_path
  FROM public.supply_recruitment_candidates_v1(p_city,p_service,GREATEST(1,LEAST(COALESCE(p_limit,100),500))) c
  JOIN public.supply_artisan_projection_v1 p ON p.artisan_id=c.artisan_id
  WHERE p.claimable_unowned=true AND p.contactable=true
  ORDER BY c.score DESC,c.artisan_name
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,100),500));
END
$fn$;
ALTER FUNCTION public.supply_admin_existing_base_v1(text,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_existing_base_v1(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_existing_base_v1(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_prepare_existing_base_v1(
  p_campaign_id uuid,p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE c public.supply_campaigns_v1; x record; n integer:=0;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.supply_campaigns_v1 WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_found'); END IF;
  IF c.status<>'ACTIVE' OR c.kill_switch THEN RETURN jsonb_build_object('ok',false,'reason','campaign_not_active'); END IF;
  FOR x IN SELECT * FROM public.supply_admin_existing_base_v1(c.city,c.service_category,GREATEST(1,LEAST(COALESCE(p_limit,30),100)))
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.supply_work_queue_v1 q
      WHERE q.campaign_id=c.id AND q.artisan_id=x.artisan_id AND q.task_type='CONTACT'
        AND q.status IN('QUEUED','LEASED','RUNNING','RETRYABLE','SUCCEEDED')
    ) THEN
      INSERT INTO public.supply_work_queue_v1(
        artisan_id,campaign_id,task_type,priority,reason_codes,evidence,status,max_attempts,idempotency_key
      ) VALUES(
        x.artisan_id,c.id,'CONTACT',LEAST(1000,GREATEST(0,x.score*10)),
        jsonb_build_array('existing_base','claimable_profile'),
        jsonb_build_object('candidate_score',x.score,'claim_path',x.claim_path,'strategy','existing_base_first'),
        'QUEUED',c.max_attempts_per_artisan,extensions.gen_random_uuid()
      );
      PERFORM public.supply_record_stage_v1(
        x.artisan_id,'RECRUITMENT_CANDIDATE','existing_base.prepared','deterministic_rule',
        jsonb_build_object('campaign_id',c.id,'score',x.score),NULL,extensions.gen_random_uuid()
      );
      n:=n+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'campaign_id',c.id,'prepared',n,'strategy','existing_base_first');
END
$fn$;
ALTER FUNCTION public.supply_admin_prepare_existing_base_v1(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_prepare_existing_base_v1(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_prepare_existing_base_v1(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_agent_task_brief_v1(p_agent_id uuid,p_run_id uuid,p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE a public.supply_agents_v1; r public.supply_agent_runs_v1; q public.supply_work_queue_v1;
  p public.supply_artisan_projection_v1; c public.supply_campaigns_v1;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.supply_agents_v1 WHERE id=p_agent_id;
  SELECT * INTO r FROM public.supply_agent_runs_v1 WHERE id=p_run_id AND agent_id=p_agent_id;
  SELECT * INTO q FROM public.supply_work_queue_v1 WHERE id=p_task_id;
  IF a.id IS NULL OR a.status<>'ACTIVE' OR a.kill_switch THEN RETURN jsonb_build_object('ok',false,'reason','agent_not_active'); END IF;
  IF r.id IS NULL OR r.status<>'RUNNING' THEN RETURN jsonb_build_object('ok',false,'reason','run_not_active'); END IF;
  IF q.id IS NULL OR q.status<>'LEASED' OR q.lease_owner IS DISTINCT FROM p_agent_id::text OR q.lease_until<now()
    THEN RETURN jsonb_build_object('ok',false,'reason','task_lease_required'); END IF;
  SELECT * INTO p FROM public.supply_artisan_projection_v1 WHERE artisan_id=q.artisan_id;
  SELECT * INTO c FROM public.supply_campaigns_v1 WHERE id=q.campaign_id;
  RETURN jsonb_build_object(
    'ok',true,'task_id',q.id,'task_type',q.task_type,'priority',q.priority,
    'artisan',jsonb_build_object('id',p.artisan_id,'name',p.artisan_name,'city',p.city,
      'service_category',p.service_category,'lifecycle_stage',p.lifecycle_stage,
      'contactable',p.contactable,'claimable_unowned',p.claimable_unowned,'claim_path',p.claim_path),
    'campaign',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'name',c.name,'channel',c.preferred_channel,
      'daily_contact_limit',c.daily_contact_limit,'max_attempts',c.max_attempts_per_artisan) END,
    'evidence',q.evidence,
    'policy',jsonb_build_object('rules_first',true,'direct_canonical_write',false,'provider_send',false,
      'ai_budget_required_for_model',true,'human_review_on_ambiguity',true)
  );
END
$fn$;
ALTER FUNCTION public.supply_agent_task_brief_v1(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_agent_task_brief_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_agent_task_brief_v1(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_agent_rules_decision_v1(p_agent_id uuid,p_run_id uuid,p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE b jsonb; task_type text; contactable boolean; claimable boolean; stage text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  b:=public.supply_agent_task_brief_v1(p_agent_id,p_run_id,p_task_id);
  IF COALESCE((b->>'ok')::boolean,false)=false THEN RETURN b; END IF;
  task_type:=b->>'task_type';
  contactable:=COALESCE((b#>>'{artisan,contactable}')::boolean,false);
  claimable:=COALESCE((b#>>'{artisan,claimable_unowned}')::boolean,false);
  stage:=b#>>'{artisan,lifecycle_stage}';
  IF NOT contactable THEN
    RETURN jsonb_build_object('ok',true,'decision','SUPPRESS','reason','not_contactable','model_required',false);
  END IF;
  IF task_type='CONTACT' AND claimable THEN
    RETURN jsonb_build_object('ok',true,'decision','PREPARE_CLAIM_OUTREACH','reason','claimable_existing_profile',
      'model_required',false,'claim_path',b#>>'{artisan,claim_path}');
  END IF;
  IF task_type='ACTIVATION_ASSIST' AND stage IN('CLAIMED','ONBOARDED','VERIFIED') THEN
    RETURN jsonb_build_object('ok',true,'decision','PREPARE_ACTIVATION','reason','canonical_stage','model_required',false);
  END IF;
  IF task_type IN('CLASSIFY_REPLY','HUMAN_REVIEW') THEN
    RETURN jsonb_build_object('ok',true,'decision','HUMAN_OR_MODEL_REVIEW','reason','semantic_ambiguity','model_required',true);
  END IF;
  RETURN jsonb_build_object('ok',true,'decision','HUMAN_REVIEW','reason','no_deterministic_action','model_required',false);
END
$fn$;
ALTER FUNCTION public.supply_agent_rules_decision_v1(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_agent_rules_decision_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_agent_rules_decision_v1(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_recruitment_readiness_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE cfg public.supply_runtime_config_v1;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.supply_runtime_config_v1 WHERE singleton=true;
  RETURN jsonb_build_object(
    'ok',true,
    'existing_base_ready',(SELECT count(*) FROM public.supply_artisan_projection_v1 WHERE claimable_unowned AND contactable),
    'active_campaigns',(SELECT count(*) FROM public.supply_campaigns_v1 WHERE status='ACTIVE' AND kill_switch=false),
    'active_agents',(SELECT count(*) FROM public.supply_agents_v1 WHERE status='ACTIVE' AND kill_switch=false),
    'paused_agents',(SELECT count(*) FROM public.supply_agents_v1 WHERE status='PAUSED'),
    'queued_tasks',(SELECT count(*) FROM public.supply_work_queue_v1 WHERE status IN('QUEUED','RETRYABLE')),
    'human_review',(SELECT count(*) FROM public.supply_work_queue_v1 WHERE status='HUMAN_REVIEW'),
    'global_kill_switch',cfg.global_kill_switch,'daily_ai_budget_minor',cfg.daily_ai_budget_minor,
    'outbound_provider_enabled',false,'rules_first',true
  );
END
$fn$;
ALTER FUNCTION public.supply_admin_recruitment_readiness_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_recruitment_readiness_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_recruitment_readiness_v1() TO authenticated;

COMMIT;
