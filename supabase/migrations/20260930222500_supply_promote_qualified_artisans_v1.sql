-- FIXEO controlled promotion of qualified external candidates
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
ALTER TABLE public.supply_external_candidates_v1 ADD COLUMN IF NOT EXISTS promoted_artisan_id uuid REFERENCES public.artisans(id) ON DELETE SET NULL;
ALTER TABLE public.supply_external_candidates_v1 ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

CREATE OR REPLACE FUNCTION public.supply_external_promote_batch_v1(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c record; aid uuid; promoted int:=0; skipped int:=0;
BEGIN
 IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR c IN SELECT * FROM public.supply_external_candidates_v1 WHERE batch_id=p_batch AND human_decision='QUALIFIED' ORDER BY created_at FOR UPDATE LOOP
  IF c.promoted_artisan_id IS NOT NULL THEN skipped:=skipped+1;CONTINUE; END IF;
  IF c.decision<>'NEW_CANDIDATE' OR c.phone_normalized IS NULL THEN RAISE EXCEPTION 'PROMOTION_GATE_FAILED:%',c.external_key; END IF;
  SELECT a.id INTO aid FROM public.artisans a WHERE fixeo_private.supply_phone_ma_v1(COALESCE(NULLIF(a.phone_public,''),a.phone))=c.phone_normalized LIMIT 1;
  IF aid IS NOT NULL THEN
    UPDATE public.supply_external_candidates_v1 SET decision='EXISTING',matched_artisan_id=aid,match_score=100,match_reasons='["PHONE_EXACT_AT_PROMOTION"]'::jsonb WHERE id=c.id;
    skipped:=skipped+1;CONTINUE;
  END IF;
  INSERT INTO public.artisans(name,full_name,city,service_category,phone,phone_public,availability,verified,is_verified,claimed,claim_status,owner_user_id,onboarding_completed,source,claimable,is_public,data_classification)
  VALUES(COALESCE(NULLIF(c.display_name,''),'Artisan FIXEO'),COALESCE(NULLIF(c.display_name,''),'Artisan FIXEO'),COALESCE(c.city,''),COALESCE(c.service_category,''),c.phone_raw,c.phone_normalized,
    'unavailable',false,false,false,'unclaimed',NULL,false,'genspark_qualification',true,true,'production')
  RETURNING id INTO aid;
  UPDATE public.supply_external_candidates_v1 SET promoted_artisan_id=aid,promoted_at=now() WHERE id=c.id;promoted:=promoted+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'promoted',promoted,'skipped',skipped);
END $f$;
ALTER FUNCTION public.supply_external_promote_batch_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_external_promote_batch_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_external_promote_batch_v1(uuid) TO authenticated;
COMMIT;