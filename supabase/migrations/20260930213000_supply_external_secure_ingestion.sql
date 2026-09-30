-- FIXEO External Supply secure admin ingestion + validation benchmark
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $g$ BEGIN IF current_user<>'postgres' OR to_regclass('public.supply_external_candidates_v1') IS NULL THEN RAISE EXCEPTION 'EXTERNAL_INGEST_BASELINE_DRIFT'; END IF; END $g$;
ALTER TABLE public.supply_external_candidates_v1 ADD COLUMN IF NOT EXISTS human_decision text;
ALTER TABLE public.supply_external_candidates_v1 ADD COLUMN IF NOT EXISTS human_priority text;

CREATE OR REPLACE FUNCTION public.supply_external_ingest_v1(p_source text,p_source_ref text,p_city text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE bid uuid; r jsonb; n int:=0;
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_batch_size'); END IF;
 INSERT INTO public.supply_external_batches_v1(source_name,source_ref,city_scope,created_by) VALUES(left(btrim(p_source),120),left(p_source_ref,300),left(p_city,120),auth.uid()) RETURNING id INTO bid;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   IF COALESCE(btrim(r->>'external_key'),'')='' THEN CONTINUE; END IF;
   INSERT INTO public.supply_external_candidates_v1(batch_id,external_key,display_name,city,service_category,phone_raw,phone_normalized,source_url,source_payload,human_decision,human_priority)
   VALUES(bid,left(r->>'external_key',200),left(r->>'display_name',300),COALESCE(NULLIF(left(r->>'city',120),''),p_city),left(r->>'service_category',160),
    left(r->>'phone',80),fixeo_private.supply_phone_ma_v1(r->>'phone'),left(r->>'source_url',1000),
    jsonb_build_object('ingest','admin_secure_v1'),left(r->>'human_decision',80),left(r->>'human_priority',20))
   ON CONFLICT(batch_id,external_key) DO NOTHING; n:=n+1;
 END LOOP;
 PERFORM public.supply_external_analyze_batch_v1(bid);
 RETURN jsonb_build_object('ok',true,'batch_id',bid,'ingested',n);
END $f$;
ALTER FUNCTION public.supply_external_ingest_v1(text,text,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_external_ingest_v1(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_external_ingest_v1(text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_external_benchmark_v1(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE j jsonb;
BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('ok',true,'batch_id',p_batch,'total',count(*),
  'agreement',count(*) FILTER(WHERE
    (human_decision='OUTREACH_READY' AND decision='NEW_CANDIDATE') OR
    (human_decision='HOLD_NO_PHONE' AND decision='HOLD_NO_PHONE') OR
    (human_decision='PROBABLE_EXISTING' AND decision IN('EXISTING','PROBABLE_DUPLICATE')) OR
    (human_decision='MERGE_INTERNAL' AND decision='MERGE_EXTERNAL') OR
    (human_decision IN('VERIFY_FIRST','REJECT') AND decision IN('REVIEW','HOLD_NO_PHONE'))),
  'divergence',count(*) FILTER(WHERE human_decision IS NOT NULL AND NOT (
    (human_decision='OUTREACH_READY' AND decision='NEW_CANDIDATE') OR
    (human_decision='HOLD_NO_PHONE' AND decision='HOLD_NO_PHONE') OR
    (human_decision='PROBABLE_EXISTING' AND decision IN('EXISTING','PROBABLE_DUPLICATE')) OR
    (human_decision='MERGE_INTERNAL' AND decision='MERGE_EXTERNAL') OR
    (human_decision IN('VERIFY_FIRST','REJECT') AND decision IN('REVIEW','HOLD_NO_PHONE')))),
  'matrix',COALESCE(jsonb_agg(jsonb_build_object('id',external_key,'human',human_decision,'engine',decision,'score',match_score,'matched_artisan_id',matched_artisan_id)),'[]'::jsonb)
 ) INTO j FROM public.supply_external_candidates_v1 WHERE batch_id=p_batch; RETURN j;
END $f$;
ALTER FUNCTION public.supply_external_benchmark_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_external_benchmark_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_external_benchmark_v1(uuid) TO authenticated;
COMMIT;