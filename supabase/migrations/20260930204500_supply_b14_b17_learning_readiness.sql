-- FIXEO Supply Learning & Activation Readiness — B14-B17
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $g$ BEGIN
 IF current_user<>'postgres' OR to_regclass('public.supply_national_cycles_v1') IS NULL OR to_regclass('public.supply_artisan_projection_v1') IS NULL
 THEN RAISE EXCEPTION 'SUPPLY_LEARNING_BASELINE_DRIFT'; END IF;
END $g$;

ALTER TABLE public.supply_national_cycles_v1 ADD COLUMN IF NOT EXISTS plan_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.supply_national_cycles_v1 ADD COLUMN IF NOT EXISTS zero_candidate_cells integer NOT NULL DEFAULT 0;
ALTER TABLE public.supply_national_cycles_v1 ADD COLUMN IF NOT EXISTS stability_score integer;

CREATE TABLE public.supply_normalization_alias_v1(
 dimension text NOT NULL CHECK(dimension IN('CITY','SERVICE')),raw_value text NOT NULL,canonical_value text NOT NULL,
 source text NOT NULL DEFAULT 'OPERATOR',confidence integer NOT NULL DEFAULT 100 CHECK(confidence BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(dimension,raw_value)
);
ALTER TABLE public.supply_normalization_alias_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supply_normalization_alias_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_norm_v1(p_dimension text,p_value text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT COALESCE((SELECT canonical_value FROM public.supply_normalization_alias_v1 WHERE dimension=upper(p_dimension) AND lower(btrim(raw_value))=lower(btrim(p_value)) LIMIT 1),
   lower(regexp_replace(translate(btrim(COALESCE(p_value,'')),'ÉÈÊËÀÂÄÎÏÔÖÛÜÇéèêëàâäîïôöûüç','EEEEAAAII OOUUUCeeeeaaaiioouuuc'),'[^a-zA-Z0-9]+','','g')))
$f$;
ALTER FUNCTION fixeo_private.supply_norm_v1(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION fixeo_private.supply_norm_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.supply_normalization_alias_v1(dimension,raw_value,canonical_value,source) VALUES
('SERVICE','electricite','electricite','SYSTEM'),('SERVICE','électricité','electricite','SYSTEM'),('SERVICE','Electricité','electricite','SYSTEM'),
('SERVICE','serrurerie','serrurerie','SYSTEM'),('SERVICE','Serrurerie','serrurerie','SYSTEM'),
('CITY','fes','fes','SYSTEM'),('CITY','Fès','fes','SYSTEM'),('CITY','Fez','fes','SYSTEM')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.supply_data_quality_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE j jsonb;
BEGIN
 PERFORM fixeo_private.supply_require_actor_v1();
 WITH a AS (
  SELECT artisan_id,city,service_category,fixeo_private.supply_norm_v1('CITY',city) nc,fixeo_private.supply_norm_v1('SERVICE',service_category) ns
  FROM public.supply_artisan_projection_v1
 ), req AS (
  SELECT city,service_category,count(*) n,fixeo_private.supply_norm_v1('CITY',city) nc,fixeo_private.supply_norm_v1('SERVICE',service_category) ns
  FROM public.service_requests WHERE COALESCE(data_classification,'production')='production' GROUP BY city,service_category
 ), anomalies AS (
  SELECT r.city,r.service_category,r.n demand_count,
    (SELECT count(*) FROM a WHERE a.nc=r.nc AND a.ns=r.ns) normalized_pool,
    (SELECT count(*) FROM a WHERE lower(btrim(a.city))=lower(btrim(r.city)) AND lower(btrim(a.service_category))=lower(btrim(r.service_category))) exact_pool
  FROM req r
 )
 SELECT jsonb_build_object(
  'ok',true,'artisan_missing_city',(SELECT count(*) FROM a WHERE COALESCE(btrim(city),'')=''),
  'artisan_missing_service',(SELECT count(*) FROM a WHERE COALESCE(btrim(service_category),'')=''),
  'normalization_rescues',(SELECT count(*) FROM anomalies WHERE exact_pool=0 AND normalized_pool>0),
  'true_zero_pool',(SELECT count(*) FROM anomalies WHERE normalized_pool=0),
  'cells',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY demand_count DESC) FROM anomalies x WHERE exact_pool=0),'[]'::jsonb)
 ) INTO j; RETURN j;
END $f$;
ALTER FUNCTION public.supply_data_quality_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_data_quality_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_data_quality_v1() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_activation_readiness_v1()
RETURNS TABLE(city text,service_category text,priority integer,normalized_pool bigint,data_quality_ok boolean,claim_ready boolean,optout_ready boolean,provider_ready boolean,activation_gate text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 PERFORM fixeo_private.supply_require_actor_v1();
 RETURN QUERY
 SELECT c.city,c.service_category,c.recruitment_priority,
  (SELECT count(*) FROM public.supply_artisan_projection_v1 a WHERE a.contactable AND a.claimable IS TRUE AND a.claimed IS FALSE AND a.owner_user_id IS NULL
   AND fixeo_private.supply_norm_v1('CITY',a.city)=fixeo_private.supply_norm_v1('CITY',c.city)
   AND fixeo_private.supply_norm_v1('SERVICE',a.service_category)=fixeo_private.supply_norm_v1('SERVICE',c.service_category))::bigint,
  (COALESCE(btrim(c.city),'')<>'' AND COALESCE(btrim(c.service_category),'')<>''),
  (to_regprocedure('public.approve_artisan_claim(uuid)') IS NOT NULL),
  (to_regclass('public.supply_contact_preferences_v1') IS NOT NULL),
  ((SELECT provider_enabled AND NOT dry_run FROM public.supply_national_runtime_v1 WHERE singleton=true)),
  CASE
   WHEN COALESCE(btrim(c.city),'')='' OR COALESCE(btrim(c.service_category),'')='' THEN 'BLOCKED_DATA'
   WHEN to_regprocedure('public.approve_artisan_claim(uuid)') IS NULL THEN 'BLOCKED_CLAIM'
   WHEN to_regclass('public.supply_contact_preferences_v1') IS NULL THEN 'BLOCKED_OPTOUT'
   WHEN NOT (SELECT provider_enabled AND NOT dry_run FROM public.supply_national_runtime_v1 WHERE singleton=true) THEN 'SIMULATION_READY'
   ELSE 'LIVE_READY'
  END
 FROM public.supply_coverage_v1 c WHERE c.recruitment_priority>0 ORDER BY c.recruitment_priority DESC;
END $f$;
ALTER FUNCTION public.supply_activation_readiness_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_activation_readiness_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_activation_readiness_v1() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_learning_cycle_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cfg public.supply_national_runtime_v1; plan jsonb; cyc uuid; prev jsonb; stab int:=100; zeros int:=0;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM public.supply_national_runtime_v1 WHERE singleton=true;
 IF NOT cfg.orchestration_enabled OR NOT cfg.dry_run OR cfg.provider_enabled THEN RETURN jsonb_build_object('ok',false,'reason','learning_requires_closed_dry_run'); END IF;
 plan:=public.supply_national_plan_v1();
 SELECT plan_snapshot INTO prev FROM public.supply_national_cycles_v1 WHERE status='SUCCEEDED' AND jsonb_array_length(plan_snapshot)>0 ORDER BY started_at DESC LIMIT 1;
 SELECT count(*) INTO zeros FROM jsonb_array_elements(COALESCE(plan->'cells','[]'::jsonb)) x WHERE COALESCE((x->>'candidate_target')::int,0)=0;
 IF prev IS NOT NULL THEN
  WITH cur AS (SELECT x->>'city' city,x->>'service_category' service FROM jsonb_array_elements(plan->'cells') x),
       old AS (SELECT x->>'city' city,x->>'service_category' service FROM jsonb_array_elements(prev) x),
       overlap AS (SELECT count(*) n FROM cur JOIN old USING(city,service))
  SELECT LEAST(100,ROUND(100.0*(SELECT n FROM overlap)/GREATEST(1,(SELECT count(*) FROM cur)))::int) INTO stab;
 END IF;
 INSERT INTO public.supply_national_cycles_v1(mode,status,cells_considered,cells_selected,candidates_planned,tasks_prepared,finished_at,summary,plan_snapshot,zero_candidate_cells,stability_score)
 VALUES('DRY_RUN','SUCCEEDED',COALESCE((plan->>'cells_selected')::int,0),COALESCE((plan->>'cells_selected')::int,0),COALESCE((plan->>'candidates_planned')::int,0),0,now(),
 jsonb_build_object('provider_enabled',false,'dry_run',true,'learning',true),COALESCE(plan->'cells','[]'::jsonb),zeros,stab) RETURNING id INTO cyc;
 RETURN jsonb_build_object('ok',true,'cycle_id',cyc,'cells_selected',plan->'cells_selected','candidates_planned',plan->'candidates_planned','zero_candidate_cells',zeros,'stability_score',stab);
END $f$;
ALTER FUNCTION public.supply_learning_cycle_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_learning_cycle_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supply_learning_cycle_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.supply_admin_learning_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE cycles jsonb; quality jsonb; readiness jsonb;
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.started_at DESC),'[]'::jsonb) INTO cycles FROM
  (SELECT id,started_at,cells_selected,candidates_planned,zero_candidate_cells,stability_score,plan_snapshot FROM public.supply_national_cycles_v1 WHERE summary->>'learning'='true' ORDER BY started_at DESC LIMIT 14) x;
 quality:=public.supply_data_quality_v1();
 SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO readiness FROM (SELECT * FROM public.supply_activation_readiness_v1()) x;
 RETURN jsonb_build_object('ok',true,'cycles',cycles,'data_quality',quality,'readiness',readiness);
END $f$;
ALTER FUNCTION public.supply_admin_learning_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_admin_learning_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_admin_learning_v1() TO authenticated;

COMMIT;