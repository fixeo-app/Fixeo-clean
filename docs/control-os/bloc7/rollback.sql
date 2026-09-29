-- Application rollback to B6 first. Keep all B7 operator references and canonical audit history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Cancel only unexecuted B7 previews before restoring the legacy orchestration contract.
UPDATE fixeo_private.control_action_previews_v1 p SET expires_at=least(p.expires_at,now())
WHERE p.executed_at IS NULL AND EXISTS(SELECT 1 FROM fixeo_private.rafi_proposals_v3 r WHERE r.preview_id=p.id);
CREATE OR REPLACE FUNCTION public.control_action_execute_v1(p_preview_id uuid,p_confirmed boolean,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); a fixeo_private.control_action_previews_v1; prior fixeo_private.control_action_previews_v1; typ text; j jsonb; result jsonb; q public.quotes; aid uuid; rid uuid; err text; audit_id uuid;
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'HUMAN_CONFIRMATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotency_key::text,0));
 SELECT * INTO prior FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND idempotency_key=p_idempotency_key;
 IF FOUND AND prior.id<>p_preview_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 SELECT * INTO a FROM fixeo_private.control_action_previews_v1 WHERE id=p_preview_id AND actor_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF a.executed_at IS NOT NULL THEN RETURN a.execution_result; END IF;
 IF a.expires_at<=now() THEN RAISE EXCEPTION 'PREVIEW_EXPIRED'; END IF;
 PERFORM set_config('fixeo.correlation_id',a.correlation_id::text,true); PERFORM set_config('fixeo.idempotency_key',p_idempotency_key::text,true);
 typ:=fixeo_private.control_action_type_v1(a.capability);
 BEGIN
  -- Match canonical lock ordering. Never lock claim before its artisan or quote before its request.
  CASE typ
   WHEN 'request' THEN PERFORM 1 FROM public.service_requests WHERE id=a.target_id FOR UPDATE;
   WHEN 'mission' THEN PERFORM 1 FROM public.missions WHERE id=a.target_id FOR UPDATE;
   WHEN 'artisan' THEN PERFORM 1 FROM public.artisans WHERE id=a.target_id FOR UPDATE;
   WHEN 'enterprise' THEN PERFORM 1 FROM public.enterprise_accounts WHERE id=a.target_id FOR UPDATE;
   WHEN 'quote' THEN SELECT request_id INTO rid FROM public.quotes WHERE id=a.target_id; PERFORM 1 FROM public.service_requests WHERE id=rid FOR UPDATE; PERFORM 1 FROM public.quotes WHERE id=a.target_id FOR UPDATE;
   WHEN 'claim' THEN SELECT coalesce((SELECT id FROM public.artisans WHERE id=c.artisan_id),(SELECT id FROM public.artisans WHERE id::text=c.artisan_legacy_id LIMIT 1),(SELECT id FROM public.artisans WHERE legacy_id=c.artisan_legacy_id ORDER BY id LIMIT 1)) INTO aid FROM public.claim_requests c WHERE c.id=a.target_id; PERFORM 1 FROM public.artisans WHERE id=aid FOR UPDATE; PERFORM 1 FROM public.claim_requests WHERE id=a.target_id FOR UPDATE;
  END CASE;
  j:=fixeo_private.control_row_v1(typ,a.target_id);
  IF j IS NULL OR md5(j::text)<>a.fingerprint THEN RAISE EXCEPTION 'STALE_PREVIEW' USING ERRCODE='40001'; END IF;
  CASE a.capability
   WHEN 'artisan.verify' THEN result:=public.admin_verify_artisan_v1(a.target_id);
   WHEN 'claim.approve' THEN result:=public.approve_artisan_claim(a.target_id);
   WHEN 'claim.reject' THEN result:=public.reject_artisan_claim(a.target_id,a.payload->>'reason');
   WHEN 'quote.approve' THEN q:=public.review_marketplace_quote_v1(a.target_id,(a.payload->>'version')::integer,true,a.payload->>'reason',(a.payload->>'expires_at')::timestamptz); result:=jsonb_build_object('id',q.id,'review_status',q.review_status,'version',q.quote_version);
   WHEN 'quote.reject' THEN q:=public.review_marketplace_quote_v1(a.target_id,(a.payload->>'version')::integer,false,a.payload->>'reason'); result:=jsonb_build_object('id',q.id,'review_status',q.review_status,'version',q.quote_version);
   WHEN 'mission.settle' THEN result:=public.admin_settle_mission_v1(a.target_id,(a.payload->>'final_price')::numeric,(a.payload->>'expected_final_price')::numeric,a.payload->>'reason');
   WHEN 'request.dispatch' THEN
    IF EXISTS(SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=a.target_id) THEN RAISE EXCEPTION 'ENTERPRISE_DELEGATION_REQUIRED' USING ERRCODE='42501'; END IF;
    result:=public.admin_targeted_dispatch_v1(a.target_id,(a.payload->>'artisan_id')::uuid);
    IF coalesce((result->>'ok')::boolean,false) THEN PERFORM public.admin_targeted_dispatch_notifications_s1b2(a.target_id,(a.payload->>'artisan_id')::uuid); END IF;
   WHEN 'request.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.service_requests SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   WHEN 'artisan.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.artisans SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   WHEN 'enterprise.classify' THEN
    IF coalesce(a.payload->>'classification','') NOT IN('production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
    UPDATE public.enterprise_accounts SET data_classification=nullif(a.payload->>'classification','unclassified') WHERE id=a.target_id; result:=jsonb_build_object('classification',a.payload->>'classification');
   ELSE
    IF a.capability NOT IN('finance.declare','finance.confirm','finance.cancel','finance.correct') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
    result:=public.admin_commission_remittance_v1(a.target_id,split_part(a.capability,'.',2),(a.payload->>'remittance_id')::uuid,(a.payload->>'version')::integer,(a.payload->>'amount')::numeric,a.payload->>'method',a.payload->>'proof_reference',a.payload->>'reason');
  END CASE;
  IF result->>'ok'='false' THEN RAISE EXCEPTION '%',coalesce(result->>'reason','AUTHORITY_REJECTED'); END IF;
  -- Verify by re-reading the authority under the transaction; expose only the minimal projection.
  j:=fixeo_private.control_row_v1(typ,a.target_id);
  result:=jsonb_build_object('ok',true,'result',result,'verified',j);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  result:=jsonb_build_object('ok',false,'code',CASE WHEN err ~ '^[A-Za-z0-9_]{3,80}$' THEN err ELSE 'AUTHORITY_REJECTED' END);
 END;
 audit_id:=fixeo_private.authority_audit_v1(typ,a.target_id,a.capability,'execute',CASE WHEN result->>'ok'='true' THEN 'succeeded' ELSE 'failed' END,jsonb_build_object('preview_id',a.id,'code',result->>'code'));
 result:=result||jsonb_build_object('audit_id',audit_id,'correlation_id',a.correlation_id,'idempotency_key',p_idempotency_key);
 UPDATE fixeo_private.control_action_previews_v1 SET executed_at=now(),execution_result=result,idempotency_key=p_idempotency_key WHERE id=a.id;
 RETURN result;
END $$;
DROP FUNCTION public.control_rafi_followup_evidence_v3(uuid);
DROP FUNCTION public.control_rafi_followup_v3(text,uuid,integer,jsonb,text,timestamptz,uuid,uuid);
DROP FUNCTION public.control_rafi_followups_v3(uuid,integer);
DROP FUNCTION public.control_rafi_execute_v3(uuid,boolean,uuid);
DROP FUNCTION public.control_rafi_proposal_v3(jsonb,text,text,uuid,jsonb,uuid);
DROP FUNCTION fixeo_private.rafi_guard_bound_preview_v3(uuid);
DROP FUNCTION fixeo_private.rafi_current_proof_v3(jsonb,boolean);
DROP FUNCTION public.control_rafi_source_v3(text,text);
-- Private operator/audit references deliberately retained; never drop their data on rollback.
NOTIFY pgrst,'reload schema';
COMMIT;
