-- FIXEO Supply — repair admin agents RPC return contract.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $g$ BEGIN
 IF current_user<>'postgres' OR to_regprocedure('public.supply_admin_agents_v1()') IS NULL
 THEN RAISE EXCEPTION 'SUPPLY_AGENTS_RPC_BASELINE_DRIFT'; END IF;
END $g$;
CREATE OR REPLACE FUNCTION public.supply_admin_agents_v1()
RETURNS TABLE(agent_id uuid,name text,agent_type text,version text,status text,model_tier text,daily_ai_budget_minor bigint,kill_switch boolean,capabilities jsonb,spend_today bigint,runs_today bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT a.id,a.name,a.agent_type,a.version,a.status,a.model_tier,a.daily_ai_budget_minor,a.kill_switch,a.capabilities,
   COALESCE((SELECT sum(u.estimated_cost_minor) FROM public.supply_ai_usage_v1 u
     WHERE u.agent_id=a.id AND u.created_at>=date_trunc('day',now())),0)::bigint,
   (SELECT count(*) FROM public.supply_agent_runs_v1 r
     WHERE r.agent_id=a.id AND r.started_at>=date_trunc('day',now()))::bigint
 FROM public.supply_agents_v1 a ORDER BY a.name;
END $f$;
ALTER FUNCTION public.supply_admin_agents_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_agents_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_agents_v1() TO authenticated,service_role;
COMMIT;