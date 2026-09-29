-- Isolated staging only. One transaction; every synthetic row and audit is rolled back.
BEGIN;
CREATE TEMP TABLE b5_integrity_result(result jsonb) ON COMMIT DROP;
DO $test$
DECLARE actor uuid; client uuid; artisan uuid; req uuid:=gen_random_uuid(); mission uuid:=gen_random_uuid();
 before_rows jsonb; after_rows jsonb; r jsonb; n integer:=0; attempt integer; operation text; refused boolean;
BEGIN
 SELECT id INTO STRICT actor FROM public.users WHERE role='admin' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT client FROM public.profiles WHERE role='client' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT artisan FROM public.artisans ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 INSERT INTO public.service_requests(id,client_profile_id,city,service_category,description,status)
 VALUES(req,client,'Fès','plomberie','SYNTHETIC B5 TRANSACTION ROLLBACK ONLY','completed');
 INSERT INTO public.missions(id,request_id,artisan_profile_id,status,completed_at)
 VALUES(mission,req,artisan,'done',now());
 PERFORM public.admin_settle_mission_v1(mission,1000,NULL,'Synthetic isolated valid settlement');
 DELETE FROM public.service_requests WHERE id=req;
 SELECT jsonb_build_object('mission',to_jsonb(m),'ledger',(SELECT jsonb_agg(to_jsonb(x)) FROM public.commission_remittances_v1 x WHERE x.mission_id=mission),'previews',(SELECT count(*) FROM fixeo_private.control_action_previews_v1),'audit',(SELECT count(*) FROM fixeo_private.authority_audit_events_v1)) INTO before_rows FROM public.missions m WHERE m.id=mission;
 FOR attempt IN 1..3 LOOP
  FOREACH operation IN ARRAY ARRAY['declare','confirm','correct'] LOOP
   refused:=false;
   BEGIN
    PERFORM public.admin_commission_remittance_v1(mission,operation,NULL,1,10,'cash','SYNTHETIC ROLLBACK','Synthetic missing parent');
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'REQUEST_NOT_FOUND' THEN RAISE; END IF; refused:=true;
   END;
   IF NOT refused THEN RAISE EXCEPTION 'FINANCE_GUARD_FAILED'; END IF; n:=n+1;
  END LOOP;
  FOREACH operation IN ARRAY ARRAY['finance.declare','mission.settle'] LOOP
   refused:=false;
   BEGIN
    PERFORM public.control_action_preview_v1(operation,mission,CASE operation WHEN 'mission.settle' THEN jsonb_build_object('reason','Synthetic missing parent','final_price',100,'expected_final_price',1000) ELSE jsonb_build_object('reason','Synthetic missing parent','amount',10,'method','cash','proof_reference','SYNTHETIC ROLLBACK') END,gen_random_uuid());
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'REQUEST_NOT_FOUND' THEN RAISE; END IF; refused:=true;
   END;
   IF NOT refused THEN RAISE EXCEPTION 'PREVIEW_GUARD_FAILED'; END IF; n:=n+1;
  END LOOP;
 END LOOP;
 refused:=false;
 BEGIN PERFORM public.admin_settle_mission_v1(mission,900,1000,'Synthetic missing parent');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'REQUEST_NOT_FOUND' THEN RAISE; END IF; refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'P0_GUARD_FAILED'; END IF; n:=n+1;
 r:=public.control_finance_context_v1('mission',mission,NULL,25);
 IF r#>>'{facts,request_relation}'<>'NOT_FOUND' OR r#>>'{facts,finance_state}'<>'UNKNOWN' OR (r#>>'{facts,can_reconcile}')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'ORPHAN_REPRESENTATION_FAILED'; END IF;
 r:=public.control_dossier_section_v1('mission',mission,'identity',NULL,25);
 IF r#>>'{summary,request_status}' IS NOT NULL THEN RAISE EXCEPTION 'REQUEST_STATUS_INVENTED'; END IF;
 SELECT jsonb_build_object('mission',to_jsonb(m),'ledger',(SELECT jsonb_agg(to_jsonb(x)) FROM public.commission_remittances_v1 x WHERE x.mission_id=mission),'previews',(SELECT count(*) FROM fixeo_private.control_action_previews_v1),'audit',(SELECT count(*) FROM fixeo_private.authority_audit_events_v1)) INTO after_rows FROM public.missions m WHERE m.id=mission;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'PARTIAL_WRITE'; END IF;
 INSERT INTO b5_integrity_result VALUES(jsonb_build_object('status','PASS','refusals',n,'partial_writes',0,'finance_state','UNKNOWN','request_relation','NOT_FOUND','p0_unchanged',true,'cleanup','ROLLBACK'));
END $test$;
SELECT result FROM b5_integrity_result;
ROLLBACK;
