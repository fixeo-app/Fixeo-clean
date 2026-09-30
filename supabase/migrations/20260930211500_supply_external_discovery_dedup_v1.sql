-- FIXEO External Supply Discovery & Deduplication V1
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $g$ BEGIN IF current_user<>'postgres' OR to_regprocedure('fixeo_private.supply_norm_v1(text,text)') IS NULL THEN RAISE EXCEPTION 'EXTERNAL_SUPPLY_BASELINE_DRIFT'; END IF; END $g$;

CREATE TABLE public.supply_external_batches_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_name text NOT NULL,source_ref text,city_scope text,service_scope text,
 status text NOT NULL DEFAULT 'STAGED' CHECK(status IN('STAGED','ANALYZED','CLOSED')),created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),analyzed_at timestamptz
);
CREATE TABLE public.supply_external_candidates_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES public.supply_external_batches_v1(id) ON DELETE CASCADE,
 external_key text NOT NULL,display_name text,city text,service_category text,phone_raw text,phone_normalized text,source_url text,
 source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,decision text NOT NULL DEFAULT 'STAGED'
 CHECK(decision IN('STAGED','EXISTING','PROBABLE_DUPLICATE','NEW_CANDIDATE','REVIEW','HOLD_NO_PHONE','REJECT','MERGE_EXTERNAL')),
 matched_artisan_id uuid REFERENCES public.artisans(id) ON DELETE SET NULL,matched_external_id uuid REFERENCES public.supply_external_candidates_v1(id) ON DELETE SET NULL,
 match_score integer NOT NULL DEFAULT 0 CHECK(match_score BETWEEN 0 AND 100),match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,external_key)
);
CREATE INDEX supply_external_phone_idx ON public.supply_external_candidates_v1(phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX supply_external_decision_idx ON public.supply_external_candidates_v1(decision,created_at DESC);
ALTER TABLE public.supply_external_batches_v1 ENABLE ROW LEVEL SECURITY; ALTER TABLE public.supply_external_candidates_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supply_external_batches_v1,public.supply_external_candidates_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fixeo_private.supply_phone_ma_v1(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
 SELECT CASE WHEN regexp_replace(COALESCE(p,''),'[^0-9]','','g')='' THEN NULL
 WHEN regexp_replace(COALESCE(p,''),'[^0-9]','','g') LIKE '212%' THEN '+'||regexp_replace(COALESCE(p,''),'[^0-9]','','g')
 WHEN regexp_replace(COALESCE(p,''),'[^0-9]','','g') LIKE '0%' THEN '+212'||substr(regexp_replace(COALESCE(p,''),'[^0-9]','','g'),2)
 ELSE regexp_replace(COALESCE(p,''),'[^0-9]','','g') END
$f$;

CREATE OR REPLACE FUNCTION public.supply_external_create_batch_v1(p_source text,p_source_ref text DEFAULT NULL,p_city text DEFAULT NULL,p_service text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE x uuid; BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO public.supply_external_batches_v1(source_name,source_ref,city_scope,service_scope,created_by) VALUES(btrim(p_source),p_source_ref,p_city,p_service,auth.uid()) RETURNING id INTO x;
 RETURN jsonb_build_object('ok',true,'batch_id',x); END $f$;
ALTER FUNCTION public.supply_external_create_batch_v1(text,text,text,text) OWNER TO postgres; REVOKE ALL ON FUNCTION public.supply_external_create_batch_v1(text,text,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.supply_external_create_batch_v1(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_external_stage_v1(p_batch uuid,p_key text,p_name text,p_city text,p_service text,p_phone text,p_url text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE x uuid; BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO public.supply_external_candidates_v1(batch_id,external_key,display_name,city,service_category,phone_raw,phone_normalized,source_url,source_payload)
 VALUES(p_batch,btrim(p_key),p_name,p_city,p_service,p_phone,fixeo_private.supply_phone_ma_v1(p_phone),p_url,COALESCE(p_payload,'{}'::jsonb))
 ON CONFLICT(batch_id,external_key) DO UPDATE SET display_name=excluded.display_name,city=excluded.city,service_category=excluded.service_category,phone_raw=excluded.phone_raw,phone_normalized=excluded.phone_normalized,source_url=excluded.source_url,source_payload=excluded.source_payload
 RETURNING id INTO x; RETURN jsonb_build_object('ok',true,'candidate_id',x); END $f$;
ALTER FUNCTION public.supply_external_stage_v1(uuid,text,text,text,text,text,text,jsonb) OWNER TO postgres; REVOKE ALL ON FUNCTION public.supply_external_stage_v1(uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.supply_external_stage_v1(uuid,text,text,text,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_external_analyze_batch_v1(p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE x record; aid uuid; ext uuid; score int; reasons jsonb; dec text; n int:=0;
BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR x IN SELECT * FROM public.supply_external_candidates_v1 WHERE batch_id=p_batch ORDER BY created_at LOOP
  aid:=NULL;ext:=NULL;score:=0;reasons:='[]'::jsonb;
  IF x.phone_normalized IS NOT NULL THEN
   SELECT a.artisan_id INTO aid FROM public.supply_artisan_projection_v1 a WHERE fixeo_private.supply_phone_ma_v1(a.contact_phone)=x.phone_normalized LIMIT 1;
   IF aid IS NOT NULL THEN score:=100;reasons:=reasons||'"PHONE_EXACT"'::jsonb; END IF;
   IF aid IS NULL THEN SELECT e.id INTO ext FROM public.supply_external_candidates_v1 e WHERE e.id<>x.id AND e.phone_normalized=x.phone_normalized AND e.created_at<x.created_at ORDER BY e.created_at LIMIT 1;
    IF ext IS NOT NULL THEN score:=100;reasons:=reasons||'"EXTERNAL_PHONE_EXACT"'::jsonb; END IF; END IF;
  END IF;
  IF aid IS NULL AND ext IS NULL AND COALESCE(btrim(x.display_name),'')<>'' THEN
   SELECT a.artisan_id INTO aid FROM public.supply_artisan_projection_v1 a WHERE
    fixeo_private.supply_norm_v1('CITY',a.city)=fixeo_private.supply_norm_v1('CITY',x.city) AND
    fixeo_private.supply_norm_v1('SERVICE',a.service_category)=fixeo_private.supply_norm_v1('SERVICE',x.service_category) AND
    fixeo_private.supply_norm_v1('NAME',a.artisan_name)=fixeo_private.supply_norm_v1('NAME',x.display_name) LIMIT 1;
   IF aid IS NOT NULL THEN score:=80;reasons:=reasons||'"NAME_CITY_SERVICE_SIMILAR"'::jsonb; END IF;
  END IF;
  dec:=CASE WHEN aid IS NOT NULL AND score=100 THEN 'EXISTING' WHEN aid IS NOT NULL THEN 'PROBABLE_DUPLICATE' WHEN ext IS NOT NULL THEN 'MERGE_EXTERNAL'
    WHEN x.phone_normalized IS NULL THEN 'HOLD_NO_PHONE' WHEN COALESCE(btrim(x.service_category),'')='' THEN 'REVIEW' ELSE 'NEW_CANDIDATE' END;
  UPDATE public.supply_external_candidates_v1 SET decision=dec,matched_artisan_id=aid,matched_external_id=ext,match_score=score,match_reasons=reasons WHERE id=x.id;n:=n+1;
 END LOOP;
 UPDATE public.supply_external_batches_v1 SET status='ANALYZED',analyzed_at=now() WHERE id=p_batch;
 RETURN jsonb_build_object('ok',true,'analyzed',n); END $f$;
ALTER FUNCTION public.supply_external_analyze_batch_v1(uuid) OWNER TO postgres; REVOKE ALL ON FUNCTION public.supply_external_analyze_batch_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.supply_external_analyze_batch_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_external_inbox_v1(p_batch uuid DEFAULT NULL,p_limit int DEFAULT 200)
RETURNS TABLE(candidate_id uuid,batch_id uuid,external_key text,display_name text,city text,service_category text,phone_normalized text,source_url text,decision text,match_score int,match_reasons jsonb,matched_artisan_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$ BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,c.batch_id,c.external_key,c.display_name,c.city,c.service_category,c.phone_normalized,c.source_url,c.decision,c.match_score,c.match_reasons,c.matched_artisan_id FROM public.supply_external_candidates_v1 c
 WHERE p_batch IS NULL OR c.batch_id=p_batch ORDER BY CASE c.decision WHEN 'NEW_CANDIDATE' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'PROBABLE_DUPLICATE' THEN 3 ELSE 4 END,c.created_at DESC LIMIT GREATEST(1,LEAST(COALESCE(p_limit,200),1000)); END $f$;
ALTER FUNCTION public.supply_external_inbox_v1(uuid,int) OWNER TO postgres; REVOKE ALL ON FUNCTION public.supply_external_inbox_v1(uuid,int) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.supply_external_inbox_v1(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.supply_external_promote_v1(p_candidate uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c public.supply_external_candidates_v1; BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.supply_external_candidates_v1 WHERE id=p_candidate FOR UPDATE;
 IF c.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF c.decision<>'NEW_CANDIDATE' THEN RETURN jsonb_build_object('ok',false,'reason','promotion_not_allowed','decision',c.decision); END IF;
 RETURN jsonb_build_object('ok',true,'state','PROMOTION_READY','candidate_id',c.id,'note','canonical_artisan_write_requires_separate_explicit_action'); END $f$;
ALTER FUNCTION public.supply_external_promote_v1(uuid) OWNER TO postgres; REVOKE ALL ON FUNCTION public.supply_external_promote_v1(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.supply_external_promote_v1(uuid) TO authenticated;
COMMIT;