-- FIXEO Supply qualified external promotion gate
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.supply_external_promotion_candidates_v1(p_batch uuid)
RETURNS TABLE(candidate_id uuid,external_key text,display_name text,city text,service_category text,decision text,human_decision text,match_score int,promotion_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN IF NOT fixeo_private._fixeo_is_admin() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,c.external_key,c.display_name,c.city,c.service_category,c.decision,c.human_decision,c.match_score,
 CASE WHEN c.human_decision='QUALIFIED' AND c.decision='NEW_CANDIDATE' AND c.phone_normalized IS NOT NULL THEN 'PROMOTION_READY'
      WHEN c.human_decision='REJECT' THEN 'REJECTED'
      ELSE 'REVIEW_REQUIRED' END
 FROM public.supply_external_candidates_v1 c WHERE c.batch_id=p_batch ORDER BY c.external_key;
END $f$;
ALTER FUNCTION public.supply_external_promotion_candidates_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.supply_external_promotion_candidates_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_external_promotion_candidates_v1(uuid) TO authenticated;
COMMIT;