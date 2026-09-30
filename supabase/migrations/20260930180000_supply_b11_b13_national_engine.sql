-- FIXEO National Supply Engine — Blocs 11-13
-- National city x trade orchestration, WhatsApp/claim readiness, progressive rollout.
-- External provider remains OFF until an explicit later cutover.

BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $g$ BEGIN
 IF current_user<>'postgres' OR to_regclass('public.supply_coverage_v1') IS NULL
 OR to_regprocedure('public.supply_admin_prepare_existing_base_v1(uuid,integer)') IS NULL
 OR to_regclass('public.supply_channel_outbox_v1') IS NULL
 THEN RAISE EXCEPTION 'NATIONAL_SUPPLY_BASELINE_DRIFT'; END IF;
END $g$;

CREATE TABLE public.supply_national_runtime_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 orchestration_enabled boolean NOT NULL DEFAULT false,
 dry_run boolean NOT NULL DEFAULT true,
 provider_enabled boolean NOT NULL DEFAULT false,
 max_cells_per_cycle integer NOT NULL DEFAULT 10 CHECK(max_cells_per_cycle BETWEEN 1 AND 100),
 max_candidates_per_cell integer NOT NULL DEFAULT 20 CHECK(max_candidates_per_cell BETWEEN 1 AND 200),
 national_daily_contact_limit integer NOT NULL DEFAULT 100 CHECK(national_daily_contact_limit BETWEEN 1 AND 10000),
 min_priority integer NOT NULL DEFAULT 100 CHECK(min_priority BETWEEN 0 AND 1000),
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.supply_national_runtime_v1(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE TABLE public.supply_national_cell_policy_v1(
 city text NOT NULL, service_category text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, dry_run boolean NOT NULL DEFAULT true,
 daily_contact_limit integer NOT NULL DEFAULT 20 CHECK(daily_contact_limit BETWEEN 1 AND 1000),
 priority_floor integer NOT NULL DEFAULT 0 CHECK(priority_floor BETWEEN 0 AND 1000),
 kill_switch boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(city,service_category)
);

CREATE TABLE public.supply_national_cycles_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mode text NOT NULL CHECK(mode IN('DRY_RUN','LIVE')),
 status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN('RUNNING','SUCCEEDED','FAILED','CANCELLED')),
 cells_considered integer NOT NULL DEFAULT 0,cells_selected integer NOT NULL DEFAULT 0,
 candidates_planned integer NOT NULL DEFAULT 0,tasks_prepared integer NOT NULL DEFAULT 0,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.supply_national_runtime_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_national_cell_policy_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_national_cycles_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supply_national_runtime_v1,public.supply_national_cell_policy_v1,public.supply_national_cycles_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_national_cells_v1(p_limit integer DEFAULT 50)
RETURNS TABLE(city text,service_category text,coverage_status text,recruitment_priority integer,demand_open bigint,demand_30d bigint,
 operational_capacity_proven bigint,recruitment_pool bigint,enabled boolean,dry_run boolean,kill_switch boolean,daily_contact_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 PERFORM fixeo_private.supply_require_actor_v1();
 RETURN QUERY SELECT c.city,c.service_category,c.coverage_status,
   LEAST(1000,GREATEST(c.recruitment_priority,COALESCE(p.priority_floor,0)))::integer,
   c.demand_open,c.demand_30d,c.operational_capacity_proven,c.recruitment_pool,
   COALESCE(p.enabled,true),COALESCE(p.dry_run,true),COALESCE(p.kill_switch,false),COALESCE(p.daily_contact_limit,20)
 FROM public.supply_coverage_v1 c LEFT JOIN public.supply_national_cell_policy_v1 p
 ON lower(p.city)=lower(c.city) AND lower(p.service_category)=lower(c.service_category)
 WHERE c.recruitment_priority>0 AND COALESCE(p.enabled,true) AND NOT COALESCE(p.kill_switch,false)
 ORDER BY LEAST(1000,GREATEST(c.recruitment_priority,COALESCE(p.priority_floor,0))) DESC,c.demand_open DESC,c.city,c.service_category
 LIMIT GREATEST(1,LEAST(COALESCE(p_limit,50),500));
END $f$;
ALTER FUNCTION public.supply_national_cells_v1(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_national_cells_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_national_cells_v1(integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_set_national_runtime_v1(p_enabled boolean,p_dry_run boolean,p_provider_enabled boolean,
 p_max_cells integer DEFAULT 10,p_candidates_per_cell integer DEFAULT 20,p_daily_limit integer DEFAULT 100,p_min_priority integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF COALESCE(p_provider_enabled,false) AND COALESCE(p_dry_run,true) THEN RETURN jsonb_build_object('ok',false,'reason','provider_requires_live_mode'); END IF;
 UPDATE public.supply_national_runtime_v1 SET orchestration_enabled=COALESCE(p_enabled,false),dry_run=COALESCE(p_dry_run,true),
 provider_enabled=COALESCE(p_provider_enabled,false),max_cells_per_cycle=GREATEST(1,LEAST(COALESCE(p_max_cells,10),100)),
 max_candidates_per_cell=GREATEST(1,LEAST(COALESCE(p_candidates_per_cell,20),200)),national_daily_contact_limit=GREATEST(1,LEAST(COALESCE(p_daily_limit,100),10000)),
 min_priority=GREATEST(0,LEAST(COALESCE(p_min_priority,100),1000)),updated_by=auth.uid(),updated_at=now() WHERE singleton=true;
 RETURN jsonb_build_object('ok',true,'provider_enabled',p_provider_enabled,'dry_run',p_dry_run);
END $f$;
ALTER FUNCTION public.supply_admin_set_national_runtime_v1(boolean,boolean,boolean,integer,integer,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_set_national_runtime_v1(boolean,boolean,boolean,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_set_national_runtime_v1(boolean,boolean,boolean,integer,integer,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_national_plan_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cfg public.supply_national_runtime_v1; x record; cells int:=0; candidates int:=0; details jsonb:='[]'::jsonb;
BEGIN
 PERFORM fixeo_private.supply_require_actor_v1(); SELECT * INTO cfg FROM public.supply_national_runtime_v1 WHERE singleton=true;
 FOR x IN SELECT * FROM public.supply_national_cells_v1(cfg.max_cells_per_cycle) WHERE recruitment_priority>=cfg.min_priority LOOP
   cells:=cells+1;
   candidates:=candidates+LEAST(x.recruitment_pool,cfg.max_candidates_per_cell);
   details:=details||jsonb_build_array(jsonb_build_object('city',x.city,'service_category',x.service_category,'priority',x.recruitment_priority,
     'coverage_status',x.coverage_status,'demand_open',x.demand_open,'capacity',x.operational_capacity_proven,
     'candidate_target',LEAST(x.recruitment_pool,cfg.max_candidates_per_cell),'dry_run',(cfg.dry_run OR x.dry_run)));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'mode',CASE WHEN cfg.dry_run THEN 'DRY_RUN' ELSE 'LIVE' END,'provider_enabled',cfg.provider_enabled,
   'cells_selected',cells,'candidates_planned',candidates,'cells',details);
END $f$;
ALTER FUNCTION public.supply_national_plan_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_national_plan_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_national_plan_v1() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_national_orchestrate_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cfg public.supply_national_runtime_v1; x record; cyc uuid; cells int:=0; planned int:=0; prepared int:=0; camp uuid; out jsonb;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.supply_national_runtime_v1 WHERE singleton=true;
 IF NOT cfg.orchestration_enabled THEN RETURN jsonb_build_object('ok',false,'reason','national_orchestration_disabled'); END IF;
 INSERT INTO public.supply_national_cycles_v1(mode) VALUES(CASE WHEN cfg.dry_run THEN 'DRY_RUN' ELSE 'LIVE' END) RETURNING id INTO cyc;
 FOR x IN SELECT * FROM public.supply_national_cells_v1(cfg.max_cells_per_cycle) WHERE recruitment_priority>=cfg.min_priority LOOP
   cells:=cells+1; planned:=planned+LEAST(x.recruitment_pool,cfg.max_candidates_per_cell);
   IF NOT cfg.dry_run AND NOT x.dry_run THEN
     SELECT id INTO camp FROM public.supply_campaigns_v1 WHERE status='ACTIVE' AND kill_switch=false
       AND lower(city)=lower(x.city) AND lower(service_category)=lower(x.service_category) ORDER BY created_at DESC LIMIT 1;
     IF camp IS NOT NULL THEN
       out:=public.supply_admin_prepare_existing_base_v1(camp,LEAST(x.daily_contact_limit,cfg.max_candidates_per_cell));
       prepared:=prepared+COALESCE((out->>'prepared')::int,0);
     END IF;
   END IF;
 END LOOP;
 UPDATE public.supply_national_cycles_v1 SET status='SUCCEEDED',cells_considered=cells,cells_selected=cells,candidates_planned=planned,tasks_prepared=prepared,
 finished_at=now(),summary=jsonb_build_object('provider_enabled',cfg.provider_enabled,'dry_run',cfg.dry_run) WHERE id=cyc;
 RETURN jsonb_build_object('ok',true,'cycle_id',cyc,'mode',CASE WHEN cfg.dry_run THEN 'DRY_RUN' ELSE 'LIVE' END,'cells_selected',cells,'candidates_planned',planned,'tasks_prepared',prepared);
END $f$;
ALTER FUNCTION public.supply_national_orchestrate_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_national_orchestrate_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_national_orchestrate_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.supply_national_provider_gate_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cfg public.supply_national_runtime_v1;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.supply_national_runtime_v1 WHERE singleton=true;
 RETURN jsonb_build_object('ok',true,'allowed',(cfg.orchestration_enabled AND NOT cfg.dry_run AND cfg.provider_enabled),
   'orchestration_enabled',cfg.orchestration_enabled,'dry_run',cfg.dry_run,'provider_enabled',cfg.provider_enabled);
END $f$;
ALTER FUNCTION public.supply_national_provider_gate_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_national_provider_gate_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_national_provider_gate_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_national_dashboard_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cfg public.supply_national_runtime_v1; cells jsonb; last_cycle jsonb;
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.supply_national_runtime_v1 WHERE singleton=true;
 SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO cells FROM (SELECT * FROM public.supply_national_cells_v1(50)) x;
 SELECT to_jsonb(c) INTO last_cycle FROM public.supply_national_cycles_v1 c ORDER BY started_at DESC LIMIT 1;
 RETURN jsonb_build_object('ok',true,'runtime',to_jsonb(cfg),'cells',cells,'last_cycle',last_cycle,
   'provider_status',CASE WHEN cfg.provider_enabled AND NOT cfg.dry_run THEN 'ENABLED' ELSE 'OFF' END);
END $f$;
ALTER FUNCTION public.supply_admin_national_dashboard_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_national_dashboard_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_national_dashboard_v1() TO authenticated;

COMMIT;