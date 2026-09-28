-- Bloc 1 / phase 2: canonical domain authorities. NOT APPLIED TO PRODUCTION.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.submit_artisan_quote_v2(p_request_id uuid,p_proposed_price numeric,p_service_description text DEFAULT NULL,p_supplies_description text DEFAULT NULL,p_estimated_duration text DEFAULT NULL,p_message text DEFAULT NULL)
RETURNS public.quotes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.artisans; r public.service_requests; q public.quotes;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_proposed_price IS NULL OR p_proposed_price<=0 OR p_proposed_price>500000 OR p_proposed_price<>round(p_proposed_price,2) THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
 IF length(trim(coalesce(p_service_description,''))) NOT BETWEEN 5 AND 4000 OR length(coalesce(p_supplies_description,''))>4000 OR length(coalesce(p_message,''))>2000 OR length(coalesce(p_estimated_duration,''))>200 THEN RAISE EXCEPTION 'INVALID_SCOPE'; END IF;
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=auth.uid() ORDER BY updated_at DESC NULLS LAST,id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARTISAN_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'new' THEN RAISE EXCEPTION 'REQUEST_NOT_QUOTABLE'; END IF;
 IF r.pricing_offer_id IS NOT NULL THEN RAISE EXCEPTION 'PRICING_CHANGE_AUTHORITY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=r.id) THEN RAISE EXCEPTION 'ENTERPRISE_QUOTE_AUTHORITY_REQUIRED'; END IF;
 IF lower(trim(r.city))<>lower(trim(coalesce(a.city,''))) AND NOT EXISTS(SELECT 1 FROM public.artisan_service_cities WHERE artisan_id=a.id AND lower(trim(city))=lower(trim(r.city))) THEN RAISE EXCEPTION 'CITY_MISMATCH'; END IF;
 IF lower(trim(r.service_category)) NOT IN(lower(trim(coalesce(a.service_category,''))),lower(trim(coalesce(a.category,'')))) AND NOT coalesce(a.services,'[]'::jsonb)?r.service_category AND NOT EXISTS(SELECT 1 FROM public.artisan_service_categories WHERE artisan_id=a.id AND lower(trim(service_category))=lower(trim(r.service_category))) THEN RAISE EXCEPTION 'TRADE_MISMATCH'; END IF;
 SELECT * INTO q FROM public.quotes WHERE request_id=r.id AND artisan_profile_id=a.id AND status IN('pending','accepted') ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF q.status='accepted' THEN RAISE EXCEPTION 'QUOTE_ALREADY_ACCEPTED'; END IF;
  IF q.proposed_price=p_proposed_price AND q.service_description IS NOT DISTINCT FROM nullif(trim(p_service_description),'') AND q.supplies_description IS NOT DISTINCT FROM nullif(trim(p_supplies_description),'') AND q.estimated_duration IS NOT DISTINCT FROM nullif(trim(p_estimated_duration),'') AND q.message IS NOT DISTINCT FROM nullif(trim(p_message),'') THEN RETURN q; END IF;
  UPDATE public.quotes SET proposed_price=p_proposed_price,service_description=nullif(trim(p_service_description),''),supplies_description=nullif(trim(p_supplies_description),''),estimated_duration=nullif(trim(p_estimated_duration),''),message=nullif(trim(p_message),''),submitted_at=now(),quote_version=quote_version+1,review_status='submitted',reviewed_version=NULL,reviewed_at=NULL,reviewed_by=NULL,review_reason=NULL,presented_at=NULL,expires_at=NULL WHERE id=q.id RETURNING * INTO q;
 ELSE
  INSERT INTO public.quotes(request_id,artisan_profile_id,proposed_price,service_description,supplies_description,estimated_duration,message,status,submitted_at,review_status)
  VALUES(r.id,a.id,p_proposed_price,nullif(trim(p_service_description),''),nullif(trim(p_supplies_description),''),nullif(trim(p_estimated_duration),''),nullif(trim(p_message),''),'pending',now(),'submitted') RETURNING * INTO q;
 END IF;
 -- No client notification until FIXEO approves this exact version.
 RETURN q;
END $$;

CREATE FUNCTION public.review_marketplace_quote_v1(p_quote_id uuid,p_version integer,p_approve boolean,p_reason text,p_expires_at timestamptz DEFAULT NULL)
RETURNS public.quotes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quotes; r public.service_requests; rid uuid; uid uuid:=fixeo_private.control_require_admin_v1();
BEGIN
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 OR p_approve IS NULL THEN RAISE EXCEPTION 'REVIEW_REASON_REQUIRED'; END IF;
 SELECT request_id INTO rid FROM public.quotes WHERE id=p_quote_id;
 SELECT * INTO r FROM public.service_requests WHERE id=rid FOR UPDATE;
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id FOR UPDATE;
 IF q.id IS NULL OR q.quote_version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE='40001'; END IF;
 IF q.status<>'pending' OR r.status<>'new' THEN RAISE EXCEPTION 'QUOTE_NOT_REVIEWABLE'; END IF;
 IF q.reviewed_version=p_version AND q.review_status=(CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN RETURN q; END IF;
 IF q.review_status NOT IN('submitted','legacy_unreviewed') THEN RAISE EXCEPTION 'ALREADY_REVIEWED'; END IF;
 IF p_approve AND (r.client_profile_id IS NULL OR r.pricing_offer_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=rid)) THEN RAISE EXCEPTION 'CANONICAL_SCOPE_REQUIRED'; END IF;
 IF p_expires_at IS NOT NULL AND p_expires_at<=now() THEN RAISE EXCEPTION 'INVALID_EXPIRY'; END IF;
 UPDATE public.quotes SET review_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_version=quote_version,reviewed_by=uid,reviewed_at=now(),review_reason=trim(p_reason),presented_at=CASE WHEN p_approve THEN now() END,expires_at=p_expires_at WHERE id=q.id RETURNING * INTO q;
 IF p_approve THEN
  INSERT INTO public.notifications(recipient_user_id,recipient_role,type,title,message,related_entity_type,related_entity_id,metadata)
  VALUES(r.client_profile_id,'client','quote_received','Devis validé par FIXEO','Un devis validé par FIXEO est disponible.','quote',q.id::text,jsonb_build_object('quote_id',q.id,'request_id',r.id,'quote_version',q.quote_version));
 END IF;
 RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public.accept_quote_v2(p_quote_id uuid) RETURNS public.missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quotes; r public.service_requests; m public.missions; rid uuid; artisan_uid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT request_id INTO rid FROM public.quotes WHERE id=p_quote_id;
 SELECT * INTO r FROM public.service_requests WHERE id=rid FOR UPDATE;
 IF NOT FOUND OR r.client_profile_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id FOR UPDATE;
 IF q.status='accepted' THEN
  SELECT * INTO m FROM public.missions WHERE accepted_quote_id=q.id AND accepted_quote_version=q.quote_version;
  IF FOUND THEN RETURN m; END IF;
  RAISE EXCEPTION 'LEGACY_RECONCILIATION_REQUIRED';
 END IF;
 IF q.status<>'pending' OR q.review_status<>'approved' OR q.reviewed_version IS DISTINCT FROM q.quote_version OR q.presented_at IS NULL THEN RAISE EXCEPTION 'FIXEO_REVIEW_REQUIRED'; END IF;
 IF q.expires_at IS NOT NULL AND q.expires_at<=now() THEN RAISE EXCEPTION 'QUOTE_EXPIRED'; END IF;
 IF r.status<>'new' OR r.pricing_offer_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=r.id) OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND status IN('pending','done','validated')) THEN RAISE EXCEPTION 'REQUEST_ALREADY_ENGAGED'; END IF;
 UPDATE public.quotes SET status='accepted' WHERE id=q.id;
 UPDATE public.quotes SET status='rejected' WHERE request_id=r.id AND id<>q.id AND status='pending';
 UPDATE public.missions SET status='expired' WHERE request_id=r.id::text AND status='offered';
 INSERT INTO public.missions(request_id,client_profile_id,artisan_profile_id,agreed_price,status,accepted_at,accepted_quote_id,accepted_quote_version)
 VALUES(r.id::text,r.client_profile_id,q.artisan_profile_id,q.proposed_price,'pending',now(),q.id,q.quote_version) RETURNING * INTO m;
 UPDATE public.service_requests SET status='assigned',target_artisan_id=q.artisan_profile_id WHERE id=r.id;
 SELECT owner_user_id INTO artisan_uid FROM public.artisans WHERE id=q.artisan_profile_id;
 IF artisan_uid IS NOT NULL THEN
  INSERT INTO public.notifications(recipient_user_id,recipient_role,type,title,message,related_entity_type,related_entity_id,metadata)
  VALUES(artisan_uid,'artisan','quote_accepted','Devis accepté','Votre devis a été accepté. La mission peut être organisée.','mission',m.id::text,jsonb_build_object('quote_id',q.id,'mission_id',m.id,'request_id',r.id));
 END IF;
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.create_client_mission_from_accepted_quote(p_quote_id uuid) RETURNS public.missions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quotes;
BEGIN
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id;
 IF q.status IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'ACCEPTED_QUOTE_NOT_FOUND'; END IF;
 -- Existing caller remains compatible, but no automatic repair of historic validated rows.
 RETURN public.accept_quote_v2(p_quote_id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_quote_v2(p_quote_id uuid) RETURNS public.quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quotes; r public.service_requests; rid uuid;
BEGIN
 SELECT request_id INTO rid FROM public.quotes WHERE id=p_quote_id;
 SELECT * INTO r FROM public.service_requests WHERE id=rid FOR UPDATE;
 IF auth.uid() IS NULL OR r.client_profile_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id FOR UPDATE;
 IF q.review_status<>'approved' OR q.reviewed_version IS DISTINCT FROM q.quote_version OR q.presented_at IS NULL THEN RAISE EXCEPTION 'FIXEO_REVIEW_REQUIRED'; END IF;
 IF q.status='rejected' THEN RETURN q; END IF;
 IF q.status<>'pending' THEN RAISE EXCEPTION 'QUOTE_NOT_PENDING'; END IF;
 UPDATE public.quotes SET status='rejected' WHERE id=q.id RETURNING * INTO q; RETURN q;
END $$;

CREATE FUNCTION public.create_my_service_request_v1(p_service_category text,p_city text,p_description text,p_idempotency_key uuid)
RETURNS public.service_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests; key text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='client') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_idempotency_key IS NULL OR length(trim(coalesce(p_service_category,''))) NOT BETWEEN 2 AND 80 OR length(trim(coalesce(p_city,''))) NOT BETWEEN 2 AND 120 OR length(trim(coalesce(p_description,''))) NOT BETWEEN 3 AND 4000 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 key:='client-v1:'||auth.uid()||':'||p_idempotency_key;
 PERFORM pg_advisory_xact_lock(hashtextextended(key,0));
 SELECT * INTO r FROM public.service_requests WHERE idempotency_key=key;
 IF FOUND THEN
  IF r.service_category<>trim(p_service_category) OR r.city<>trim(p_city) OR r.description<>trim(p_description) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN r;
 END IF;
 INSERT INTO public.service_requests(client_profile_id,service_category,city,description,status,idempotency_key) VALUES(auth.uid(),trim(p_service_category),trim(p_city),trim(p_description),'new',key) RETURNING * INTO r; RETURN r;
END $$;

CREATE FUNCTION public.admin_settle_mission_v1(p_mission_id uuid,p_final_price numeric,p_expected_final_price numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions; r public.service_requests;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_final_price IS NULL OR p_final_price<=0 OR p_final_price>500000 OR round(p_final_price,2)<>p_final_price OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INVALID_SETTLEMENT'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 IF NOT ((m.status='done' AND r.status IN('completed','validated')) OR (m.status='validated' AND r.status='validated')) THEN RAISE EXCEPTION 'INELIGIBLE_MISSION'; END IF;
 IF m.final_price IS NOT DISTINCT FROM p_final_price THEN RETURN jsonb_build_object('id',m.id,'final_price',m.final_price,'commission_amount',m.commission_amount,'idempotent',true); END IF;
 IF m.final_price IS DISTINCT FROM p_expected_final_price THEN RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.commission_remittances_v1 WHERE mission_id=m.id AND status='confirmed') THEN RAISE EXCEPTION 'CONFIRMED_REMITTANCE_REQUIRES_RECONCILIATION'; END IF;
 -- VAP/Diagnostic proposal guards and price triggers remain the sole price authority.
 UPDATE public.missions SET final_price=p_final_price WHERE id=m.id RETURNING * INTO m;
 RETURN jsonb_build_object('id',m.id,'final_price',m.final_price,'commission_amount',m.commission_amount,'pricing_offer_id',m.pricing_offer_id);
END $$;

CREATE FUNCTION public.admin_commission_remittance_v1(p_mission_id uuid,p_operation text,p_remittance_id uuid,p_version integer,p_amount numeric,p_method text,p_proof_reference text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions; r public.service_requests; x public.commission_remittances_v1; v_uid uuid:=fixeo_private.control_require_admin_v1(); paid numeric; old_id uuid;
BEGIN
 IF p_operation NOT IN('declare','confirm','cancel','correct') OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INVALID_REMITTANCE'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 IF p_operation IN('declare','confirm','correct') AND (m.final_price IS NULL OR m.commission_amount IS NULL OR NOT ((m.status='done' AND r.status IN('completed','validated')) OR (m.status='validated' AND r.status='validated'))) THEN RAISE EXCEPTION 'COMMISSION_NOT_DUE'; END IF;
 IF p_operation<>'declare' THEN
  SELECT * INTO x FROM public.commission_remittances_v1 WHERE id=p_remittance_id AND mission_id=m.id FOR UPDATE;
  IF NOT FOUND OR x.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE='40001'; END IF;
  IF x.status='cancelled' THEN RAISE EXCEPTION 'REMITTANCE_CANCELLED'; END IF;
 END IF;
 IF p_operation IN('declare','correct') THEN
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_amount>m.commission_amount OR p_method NOT IN('cash','wafacash','bank_transfer') OR length(trim(coalesce(p_proof_reference,''))) NOT BETWEEN 3 AND 128 THEN RAISE EXCEPTION 'INVALID_PROOF_OR_AMOUNT'; END IF;
  IF p_operation='correct' THEN
   old_id:=x.id;
   UPDATE public.commission_remittances_v1 SET status='cancelled',cancelled_at=now(),version=version+1 WHERE id=x.id;
   PERFORM fixeo_private.authority_audit_v1('remittance',old_id,'Finance','correct.cancel','succeeded',jsonb_build_object('mission_id',m.id,'amount',x.amount));
  END IF;
  INSERT INTO public.commission_remittances_v1(mission_id,amount,method,proof_reference,declared_by,supersedes_id) VALUES(m.id,p_amount,p_method,trim(p_proof_reference),v_uid,old_id) RETURNING * INTO x;
 ELSIF p_operation='confirm' THEN
  IF x.status<>'declared' THEN RAISE EXCEPTION 'NOT_DECLARED'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid FROM public.commission_remittances_v1 WHERE mission_id=m.id AND status='confirmed';
  IF paid+x.amount>m.commission_amount THEN RAISE EXCEPTION 'OVERPAYMENT'; END IF;
  UPDATE public.commission_remittances_v1 SET status='confirmed',confirmed_by=v_uid,confirmed_at=now(),version=version+1 WHERE id=x.id RETURNING * INTO x;
 ELSE
  UPDATE public.commission_remittances_v1 SET status='cancelled',cancelled_at=now(),version=version+1 WHERE id=x.id RETURNING * INTO x;
 END IF;
 PERFORM fixeo_private.authority_audit_v1('remittance',x.id,'Finance',p_operation,'succeeded',jsonb_build_object('mission_id',m.id,'amount',x.amount,'status',x.status,'version',x.version,'supersedes_id',old_id));
 RETURN jsonb_build_object('id',x.id,'mission_id',m.id,'amount',x.amount,'method',x.method,'status',x.status,'version',x.version);
END $$;

CREATE FUNCTION public.admin_verify_artisan_v1(p_artisan_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.artisans;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 SELECT * INTO a FROM public.artisans WHERE id=p_artisan_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 UPDATE public.artisans SET verified=true,is_verified=true,updated_at=now() WHERE id=a.id;
 RETURN jsonb_build_object('id',a.id,'verified',true,'is_verified',true);
END $$;

CREATE FUNCTION public.update_my_artisan_photo_v1(p_photo_url text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.artisans;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.artisans WHERE owner_user_id=auth.uid() ORDER BY updated_at DESC NULLS LAST,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARTISAN_NOT_FOUND'; END IF;
 IF length(coalesce(p_photo_url,''))>2048 OR p_photo_url !~ ('^https://[a-z]{20}\.supabase\.co/storage/v1/object/public/artisan-media/profiles/'||auth.uid()::text||'/avatar\.jpg$') THEN RAISE EXCEPTION 'INVALID_PHOTO_URL'; END IF;
 UPDATE public.artisans SET photo_url=p_photo_url,updated_at=now() WHERE id=a.id;
 RETURN jsonb_build_object('id',a.id,'photo_url',p_photo_url);
END $$;

-- Admin mutations are called only by the typed preview/execute authority (phase 3).
REVOKE ALL ON FUNCTION public.review_marketplace_quote_v1(uuid,integer,boolean,text,timestamptz),public.admin_settle_mission_v1(uuid,numeric,numeric,text),public.admin_commission_remittance_v1(uuid,text,uuid,integer,numeric,text,text,text),public.admin_verify_artisan_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_my_service_request_v1(text,text,text,uuid),public.update_my_artisan_photo_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_my_service_request_v1(text,text,text,uuid),public.update_my_artisan_photo_v1(text) TO authenticated;
COMMIT;
