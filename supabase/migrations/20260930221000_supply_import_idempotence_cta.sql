-- FIXEO Supply external import idempotence + batch-aware dedup
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
ALTER TABLE public.supply_external_batches_v1 ADD COLUMN IF NOT EXISTS content_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS supply_external_batch_fingerprint_uidx ON public.supply_external_batches_v1(content_fingerprint) WHERE content_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION public.supply_external_ingest_v1(p_source text,p_source_ref text,p_city text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE bid uuid; r jsonb; n int:=0; fp text;
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_batch_size'); END IF;
 fp:=md5(COALESCE(p_source,'')||'|'||COALESCE(p_city,'')||'|'||p_rows::text);
 SELECT id INTO bid FROM public.supply_external_batches_v1 WHERE content_fingerprint=fp LIMIT 1;
 IF bid IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'batch_id',bid,'ingested',0,'reused',true); END IF;
 INSERT INTO public.supply_external_batches_v1(source_name,source_ref,city_scope,created_by,content_fingerprint)
 VALUES(left(btrim(p_source),120),left(p_source_ref,300),left(p_city,120),auth.uid(),fp) RETURNING id INTO bid;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF COALESCE(btrim(r->>'external_key'),'')='' THEN CONTINUE; END IF;
  INSERT INTO public.supply_external_candidates_v1(batch_id,external_key,display_name,city,service_category,phone_raw,phone_normalized,source_url,source_payload,human_decision,human_priority)
  VALUES(bid,left(r->>'external_key',200),left(r->>'display_name',300),COALESCE(NULLIF(left(r->>'city',120),''),p_city),left(r->>'service_category',160),
   left(r->>'phone',80),fixeo_private.supply_phone_ma_v1(r->>'phone'),left(r->>'source_url',1000),jsonb_build_object('ingest','admin_secure_v1'),left(r->>'human_decision',80),left(r->>'human_priority',20))
  ON CONFLICT(batch_id,external_key) DO NOTHING;n:=n+1;
 END LOOP;
 PERFORM public.supply_external_analyze_batch_v1(bid);
 RETURN jsonb_build_object('ok',true,'batch_id',bid,'ingested',n,'reused',false);
END $f$;

CREATE OR REPLACE FUNCTION public.supply_external_analyze_batch_v1(p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE x record; aid uuid; ext uuid; score int; reasons jsonb; dec text; n int:=0;
BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR x IN SELECT * FROM public.supply_external_candidates_v1 WHERE batch_id=p_batch ORDER BY created_at LOOP
  aid:=NULL;ext:=NULL;score:=0;reasons:='[]'::jsonb;
  IF x.phone_normalized IS NOT NULL THEN
   SELECT a.artisan_id INTO aid FROM public.supply_artisan_projection_v1 a WHERE fixeo_private.supply_phone_ma_v1(a.contact_phone)=x.phone_normalized LIMIT 1;
   IF aid IS NOT NULL THEN score:=100;reasons:=reasons||'"PHONE_EXACT"'::jsonb; END IF;
   IF aid IS NULL THEN SELECT e.id INTO ext FROM public.supply_external_candidates_v1 e JOIN public.supply_external_batches_v1 eb ON eb.id=e.batch_id
    WHERE e.id<>x.id AND e.batch_id<>p_batch AND e.phone_normalized=x.phone_normalized
      AND COALESCE(eb.source_ref,'')<>COALESCE((SELECT source_ref FROM public.supply_external_batches_v1 WHERE id=p_batch),'')
    ORDER BY e.created_at LIMIT 1;
    IF ext IS NOT NULL THEN score:=100;reasons:=reasons||'"EXTERNAL_PHONE_EXACT_OTHER_SOURCE"'::jsonb; END IF; END IF;
  END IF;
  IF aid IS NULL AND ext IS NULL AND COALESCE(btrim(x.display_name),'')<>'' THEN
   SELECT a.artisan_id INTO aid FROM public.supply_artisan_projection_v1 a WHERE fixeo_private.supply_norm_v1('CITY',a.city)=fixeo_private.supply_norm_v1('CITY',x.city)
    AND fixeo_private.supply_norm_v1('SERVICE',a.service_category)=fixeo_private.supply_norm_v1('SERVICE',x.service_category)
    AND fixeo_private.supply_norm_v1('NAME',a.artisan_name)=fixeo_private.supply_norm_v1('NAME',x.display_name) LIMIT 1;
   IF aid IS NOT NULL THEN score:=80;reasons:=reasons||'"NAME_CITY_SERVICE_EXACT_NORMALIZED"'::jsonb; END IF;
  END IF;
  dec:=CASE WHEN aid IS NOT NULL AND score=100 THEN 'EXISTING' WHEN aid IS NOT NULL THEN 'PROBABLE_DUPLICATE' WHEN ext IS NOT NULL THEN 'MERGE_EXTERNAL'
   WHEN x.phone_normalized IS NULL THEN 'HOLD_NO_PHONE' WHEN COALESCE(btrim(x.service_category),'')='' THEN 'REVIEW' ELSE 'NEW_CANDIDATE' END;
  UPDATE public.supply_external_candidates_v1 SET decision=dec,matched_artisan_id=aid,matched_external_id=ext,match_score=score,match_reasons=reasons WHERE id=x.id;n:=n+1;
 END LOOP;
 UPDATE public.supply_external_batches_v1 SET status='ANALYZED',analyzed_at=now() WHERE id=p_batch;
 RETURN jsonb_build_object('ok',true,'analyzed',n); END $f$;
COMMIT;