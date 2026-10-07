-- PB1 post-physical-audit: STAGING only. No identity, approval or availability backfill.
-- Canonical rules: complete_artisan_onboarding (name >=3, trade, city, approved ownership).
-- Phone and presentation are useful profile fields, not new dispatch requirements.
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM fixeo_private.mobile_intelligence_config_v1 WHERE singleton AND project_ref='kqyhusnbybsukbcaoqtu') THEN RAISE EXCEPTION 'PB1_STAGING_TARGET_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.submit_artisan_quote_v2(uuid,numeric,text,text,text,text)'::regprocedure)) <> '5451038b0447e1d06ca338456ba4816d' THEN RAISE EXCEPTION 'PB1_QUOTE_AUTHORITY_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.update_artisan_availability(text)'::regprocedure)) <> '23d470feff645b929155b483606defec' THEN
   RAISE EXCEPTION 'PB1_AVAILABILITY_DRIFT';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION fixeo_private.pb1_artisan_missing_v1(a public.artisans)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT array_remove(ARRAY[
   CASE WHEN a.owner_user_id IS NULL THEN 'owner' END,
   CASE WHEN a.claimed IS DISTINCT FROM true OR a.claim_status IS DISTINCT FROM 'approved' THEN 'approval' END,
   CASE WHEN length(trim(coalesce(a.full_name,'')))<3 THEN 'full_name' END,
   CASE WHEN nullif(trim(a.service_category),'') IS NULL THEN 'service_category' END,
   CASE WHEN nullif(trim(a.city),'') IS NULL THEN 'city' END
 ]::text[],NULL);
$fn$;
REVOKE ALL ON FUNCTION fixeo_private.pb1_artisan_missing_v1(public.artisans) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION fixeo_private.pb1_artisan_completion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 NEW.onboarding_completed := cardinality(fixeo_private.pb1_artisan_missing_v1(NEW))=0;
 -- Availability remains the Artisan's explicit choice; approval and verification are never changed.
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION fixeo_private.pb1_artisan_completion_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pb1_artisan_completion_v1
BEFORE INSERT OR UPDATE OF full_name,service_category,city,claimed,claim_status,owner_user_id,phone_public,description
ON public.artisans FOR EACH ROW EXECUTE FUNCTION fixeo_private.pb1_artisan_completion_v1();

CREATE OR REPLACE FUNCTION public.get_my_artisan_profile_gate_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w5_artisan_actor_v1(); a public.artisans; missing text[];
BEGIN
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=u ORDER BY updated_at DESC NULLS LAST,id LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_owner'); END IF;
 missing:=fixeo_private.pb1_artisan_missing_v1(a);
 RETURN jsonb_build_object('ok',true,'complete',cardinality(missing)=0,'missing_fields',to_jsonb(missing),
   'checks',jsonb_build_object('full_name',NOT('full_name'=ANY(missing)),
    'service_category',NOT('service_category'=ANY(missing)),'city',NOT('city'=ANY(missing)),
    'approval',NOT('approval'=ANY(missing)),'owner',NOT('owner'=ANY(missing)),
    'phone',nullif(trim(a.phone_public),'') IS NOT NULL,'description',nullif(trim(a.description),'') IS NOT NULL));
END $fn$;
REVOKE ALL ON FUNCTION public.get_my_artisan_profile_gate_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_artisan_profile_gate_v1() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.update_artisan_availability(p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w5_artisan_actor_v1(); a public.artisans; missing text[];
 target text:=lower(trim(coalesce(p_status,'')));
BEGIN
 IF target NOT IN ('available','unavailable','busy') THEN RETURN jsonb_build_object('ok',false,'reason','invalid_status'); END IF;
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=u ORDER BY updated_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_owner'); END IF;
 missing:=fixeo_private.pb1_artisan_missing_v1(a);
 IF target IN ('available','busy') AND cardinality(missing)>0 THEN
   RETURN jsonb_build_object('ok',false,'reason','profile_incomplete','missing_fields',to_jsonb(missing));
 END IF;
 IF a.availability IS DISTINCT FROM target OR a.onboarding_completed IS DISTINCT FROM (cardinality(missing)=0) THEN
   UPDATE public.artisans SET availability=target,onboarding_completed=(cardinality(missing)=0),updated_at=now() WHERE id=a.id AND owner_user_id=u;
 END IF;
 RETURN jsonb_build_object('ok',true,'artisan_id',a.id,'status',target);
END $fn$;
-- CREATE OR REPLACE preserves the existing authenticated/service_role ACL.

-- Native quote entry: no forged/deep-linked source, no titleless or empty transmission.
-- Delegates pricing, scope, owner, request state and review to the existing authority.
CREATE OR REPLACE FUNCTION public.submit_my_mobile_quote_v1(p_request_id uuid,p_title text,p_items jsonb,p_message text DEFAULT NULL,p_duration text DEFAULT NULL)
RETURNS public.quotes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid:=fixeo_private.w5_artisan_actor_v1(); a uuid; line jsonb; total numeric:=0;
 qty numeric; price numeric; line_total numeric; description text:=trim(coalesce(p_title,'')); supplies text:=''; has_service boolean:=false;
BEGIN
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'QUOTE_SOURCE_REQUIRED'; END IF;
 IF length(description) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'QUOTE_TITLE_REQUIRED'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'QUOTE_INVALID'; END IF;
 SELECT id INTO a FROM public.artisans WHERE owner_user_id=u ORDER BY updated_at DESC NULLS LAST,id LIMIT 1;
 IF a IS NULL THEN RAISE EXCEPTION 'ARTISAN_NOT_FOUND'; END IF;
 -- Lock the same canonical request before checking its active opportunity.
 PERFORM 1 FROM public.service_requests WHERE id=p_request_id AND status='new' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_SOURCE_REQUIRED'; END IF;
 PERFORM 1 FROM public.dispatch_execution_queue WHERE request_id=p_request_id AND artisan_id=a AND execution_status IN ('QUEUED','CONTACTED') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_SOURCE_REQUIRED'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   IF jsonb_typeof(line)<>'object' OR coalesce(line->>'type','') NOT IN ('service','supply','labor') OR length(trim(coalesce(line->>'label',''))) NOT BETWEEN 1 AND 500
     OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(line->'unit_price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'QUOTE_INVALID'; END IF;
   qty:=(line->>'quantity')::numeric; price:=(line->>'unit_price')::numeric;
   IF qty<=0 OR qty>100000 OR price<0 OR price>500000 THEN RAISE EXCEPTION 'QUOTE_INVALID'; END IF;
   line_total:=round(qty*price,2); total:=total+line_total;
   IF line->>'type'='supply' THEN supplies:=supplies||E'\n'||trim(line->>'label')||' · '||qty||' × '||price||' MAD';
   ELSE has_service:=true; description:=description||E'\n'||trim(line->>'label')||' · '||qty||' × '||price||' MAD'; END IF;
 END LOOP;
 IF NOT has_service OR total<=0 OR total>500000 THEN RAISE EXCEPTION 'QUOTE_INVALID'; END IF;
 RETURN public.submit_artisan_quote_v2(p_request_id,total,description,nullif(trim(supplies),''),p_duration,p_message);
END $fn$;
REVOKE ALL ON FUNCTION public.submit_my_mobile_quote_v1(uuid,text,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_my_mobile_quote_v1(uuid,text,jsonb,text,text) TO authenticated,service_role;
-- The old authority remains byte-for-byte intact and callable by the definer.
-- Untrusted sessions cannot bypass the source/title/line gate through its legacy entry.
REVOKE EXECUTE ON FUNCTION public.submit_artisan_quote_v2(uuid,numeric,text,text,text,text) FROM PUBLIC,anon,authenticated;
