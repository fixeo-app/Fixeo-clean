-- Production read-only projection checks. No preview or business command is executed.
BEGIN READ ONLY;
DO $checks$
DECLARE admin_id uuid; artisan_id uuid; client_id uuid; mission_id uuid; request_id uuid; orphan record; f jsonb; d jsonb; n integer:=0;
BEGIN
 SELECT id INTO STRICT admin_id FROM public.users WHERE role='admin' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT artisan_id FROM public.artisans ORDER BY id LIMIT 1;
 SELECT id INTO STRICT client_id FROM public.users WHERE role='client' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT mission_id FROM public.missions ORDER BY id LIMIT 1;
 SELECT id INTO STRICT request_id FROM public.service_requests ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 PERFORM set_config('role','authenticated',true);
 PERFORM public.control_people_page_v1('{}',NULL,25);
 PERFORM public.control_people_context_v1('artisan',artisan_id,NULL,25);
 PERFORM public.control_trust_page_v1('{"queue":"claims"}',NULL,25);
 PERFORM public.control_trust_context_v1('artisan',artisan_id,NULL,25);
 PERFORM public.control_review_history_v1('artisan',artisan_id,NULL,25);
 PERFORM public.control_quotes_page_v1('{}',NULL,25);
 PERFORM public.control_quote_context_v1('request',request_id);
 PERFORM public.control_finance_page_v1('{}',NULL,25);
 PERFORM public.control_finance_context_v1('mission',mission_id,NULL,25);
 PERFORM set_config('role','postgres',true);
 FOR orphan IN SELECT m.id,m.request_id FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id WHERE r.id IS NULL LOOP
  PERFORM set_config('role','authenticated',true);
  f:=public.control_finance_context_v1('mission',orphan.id,NULL,25);
  d:=public.control_dossier_section_v1('mission',orphan.id,'identity',NULL,25);
  IF f#>>'{facts,request_relation}' IS DISTINCT FROM 'NOT_FOUND' OR f#>>'{facts,finance_state}' IS DISTINCT FROM 'UNKNOWN' OR (f#>>'{facts,can_reconcile}')::boolean IS DISTINCT FROM false OR (f#>>'{facts,can_declare}')::boolean IS DISTINCT FROM false OR d#>>'{summary,request_status}' IS NOT NULL THEN RAISE EXCEPTION 'ORPHAN_CONTRACT_FAILED'; END IF;
  BEGIN PERFORM public.control_operation_read_v1(orphan.request_id::uuid); RAISE EXCEPTION 'MISSING_REQUEST_INVENTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF; END;
  n:=n+1;PERFORM set_config('role','postgres',true);
 END LOOP;
 PERFORM set_config('b5.orphans_checked',n::text,true);
 PERFORM set_config('b5.admin_id',admin_id::text,true);
 PERFORM set_config('b5.client_id',client_id::text,true);
END $checks$;
SELECT jsonb_build_object('status','PASS','readers',9,'orphans_checked',current_setting('b5.orphans_checked')::integer,'facts','UNKNOWN / NOT_FOUND','reads_only',true) result;
ROLLBACK;
