-- FIXEO Supply Engine — Bloc 7
-- Control OS read model and economics.

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres'
     OR to_regprocedure('public.supply_admin_summary_v1()') IS NULL
     OR to_regprocedure('public.supply_admin_agent_metrics_v1()') IS NULL
     OR to_regprocedure('public.supply_admin_channel_metrics_v1()') IS NULL
  THEN RAISE EXCEPTION 'SUPPLY_B7_BASELINE_DRIFT'; END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.supply_admin_campaigns_v1()
RETURNS TABLE(
  campaign_id uuid,name text,status text,city text,service_category text,preferred_channel text,
  daily_contact_limit integer,max_attempts_per_artisan integer,cooldown_hours integer,
  daily_ai_budget_minor integer,kill_switch boolean,
  queued bigint,contacted bigint,engaged bigint,created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.id,c.name,c.status,c.city,c.service_category,c.preferred_channel,
    c.daily_contact_limit,c.max_attempts_per_artisan,c.cooldown_hours,c.daily_ai_budget_minor,c.kill_switch,
    (SELECT count(*) FROM public.supply_work_queue_v1 q WHERE q.campaign_id=c.id AND q.status IN('QUEUED','LEASED','RUNNING','RETRYABLE')),
    (SELECT count(DISTINCT r.artisan_id) FROM public.supply_recruitment_attempts_v1 r WHERE r.campaign_id=c.id AND r.direction='OUTBOUND'),
    (SELECT count(DISTINCT r.artisan_id) FROM public.supply_recruitment_attempts_v1 r WHERE r.campaign_id=c.id AND r.outcome IN('REPLIED','INTERESTED','CALLBACK')),
    c.created_at
  FROM public.supply_campaigns_v1 c
  ORDER BY CASE c.status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END,c.created_at DESC;
END
$fn$;
ALTER FUNCTION public.supply_admin_campaigns_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_campaigns_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_campaigns_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_agents_v1()
RETURNS TABLE(
  agent_id uuid,name text,agent_type text,version text,status text,model_tier text,
  daily_ai_budget_minor bigint,kill_switch boolean,capabilities jsonb,
  spend_today bigint,runs_today bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT a.id,a.name,a.agent_type,a.version,a.status,a.model_tier,a.daily_ai_budget_minor,a.kill_switch,a.capabilities,
    COALESCE((SELECT sum(u.estimated_cost_minor) FROM public.supply_ai_usage_v1 u
              WHERE u.agent_id=a.id AND u.created_at>=date_trunc('day',now())),0),
    (SELECT count(*) FROM public.supply_agent_runs_v1 r
     WHERE r.agent_id=a.id AND r.started_at>=date_trunc('day',now()))
  FROM public.supply_agents_v1 a ORDER BY a.name;
END
$fn$;
ALTER FUNCTION public.supply_admin_agents_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_agents_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_agents_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_events_v1(p_limit integer DEFAULT 100)
RETURNS TABLE(
  event_id uuid,artisan_id uuid,artisan_name text,event_type text,from_stage text,to_stage text,
  actor_kind text,evidence_class text,evidence jsonb,created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.artisan_id,
    COALESCE(NULLIF(btrim(a.full_name),''),NULLIF(btrim(a.name),''),'Artisan '||left(a.id::text,8)),
    e.event_type,e.from_stage,e.to_stage,e.actor_kind,e.evidence_class,e.evidence,e.created_at
  FROM public.supply_lifecycle_events_v1 e
  JOIN public.artisans a ON a.id=e.artisan_id
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,100),500));
END
$fn$;
ALTER FUNCTION public.supply_admin_events_v1(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_events_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_events_v1(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_economics_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE ai bigint; ch bigint; contacted bigint; engaged bigint; claimed bigint; activated bigint; first_mission bigint;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(sum(estimated_cost_minor),0) INTO ai FROM public.supply_ai_usage_v1;
  SELECT COALESCE(sum(channel_cost_minor),0) INTO ch FROM public.supply_channel_outbox_v1;
  SELECT count(DISTINCT artisan_id) INTO contacted FROM public.supply_recruitment_attempts_v1 WHERE direction='OUTBOUND';
  SELECT count(DISTINCT artisan_id) INTO engaged FROM public.supply_recruitment_attempts_v1 WHERE outcome IN('REPLIED','INTERESTED','CALLBACK');
  SELECT count(*) INTO claimed FROM public.supply_artisan_projection_v1 WHERE lifecycle_stage IN('CLAIMED','ONBOARDED','VERIFIED','ACTIVATED');
  SELECT count(*) INTO activated FROM public.supply_artisan_projection_v1 WHERE lifecycle_stage='ACTIVATED';
  SELECT count(DISTINCT p.artisan_id) INTO first_mission
    FROM public.supply_artisan_projection_v1 p
    WHERE EXISTS(SELECT 1 FROM public.missions m WHERE m.artisan_profile_id=p.artisan_id);
  RETURN jsonb_build_object(
    'ai_cost_minor',ai,'channel_cost_minor',ch,'total_cost_minor',ai+ch,'currency','MAD',
    'contacted',contacted,'engaged',engaged,'claimed',claimed,'activated',activated,'first_mission',first_mission,
    'cost_per_contacted',CASE WHEN contacted>0 THEN round((ai+ch)::numeric/contacted,2) ELSE NULL END,
    'cost_per_engaged',CASE WHEN engaged>0 THEN round((ai+ch)::numeric/engaged,2) ELSE NULL END,
    'cost_per_claimed',CASE WHEN claimed>0 THEN round((ai+ch)::numeric/claimed,2) ELSE NULL END,
    'cost_per_activated',CASE WHEN activated>0 THEN round((ai+ch)::numeric/activated,2) ELSE NULL END,
    'cost_per_first_mission',CASE WHEN first_mission>0 THEN round((ai+ch)::numeric/first_mission,2) ELSE NULL END
  );
END
$fn$;
ALTER FUNCTION public.supply_admin_economics_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_economics_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_economics_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_admin_dashboard_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE summary jsonb; agents jsonb; channel jsonb; economics jsonb;
BEGIN
  IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  summary:=public.supply_admin_summary_v1();
  agents:=public.supply_admin_agent_metrics_v1();
  channel:=public.supply_admin_channel_metrics_v1();
  economics:=public.supply_admin_economics_v1();
  RETURN jsonb_build_object(
    'ok',true,'as_of',now(),'summary',summary,'agents',agents,'channel',channel,'economics',economics,
    'semantics',jsonb_build_object(
      'declared_available_is_capacity',false,
      'activated_requires_proof',true,
      'dispatch_eligible_is_separate',true,
      'ai_budget_default','disabled'
    )
  );
END
$fn$;
ALTER FUNCTION public.supply_admin_dashboard_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_dashboard_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_dashboard_v1() TO authenticated;

COMMIT;
