-- Blocs 3 + 4: read projections and narrowly governed orchestration.
-- No business table, policy, trigger or canonical authority is replaced.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION fixeo_private.control_dossier_source_v1(p_type text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_type
 WHEN 'request' THEN 'public.service_requests' WHEN 'mission' THEN 'public.missions'
 WHEN 'quote' THEN 'public.quotes' WHEN 'artisan' THEN 'public.artisans'
 WHEN 'client' THEN 'public.users' WHEN 'claim' THEN 'public.claim_requests'
 WHEN 'enterprise' THEN 'public.enterprise_accounts' WHEN 'site' THEN 'public.enterprise_sites'
 WHEN 'worker' THEN 'public.enterprise_workforce_workers'
 WHEN 'internal_assignment' THEN 'public.enterprise_internal_assignments'
 WHEN 'pricing_offer' THEN 'public.fixeo_pricing_offers_v1'
 WHEN 'diagnostic_summary' THEN 'diagnostic_authority'
 WHEN 'remittance' THEN 'public.commission_remittances_v1' END
$$;
CREATE FUNCTION fixeo_private.control_dossier_edges_v1(p_type text,p_id uuid)
RETURNS TABLE(entity_type text,entity_id uuid,relation text,source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT 'mission'::text,x.id,'execution'::text,'public.missions'::text FROM public.missions x WHERE p_type='request' AND x.request_id=p_id::text
 UNION ALL
 SELECT 'mission'::text,x.id,'execution'::text,'public.missions'::text FROM public.missions x WHERE p_type='artisan' AND x.artisan_profile_id=p_id
 UNION ALL
 SELECT 'mission'::text,x.id,'pricing_execution'::text,'public.missions'::text FROM public.missions x WHERE p_type='pricing_offer' AND x.pricing_offer_id=p_id
 UNION ALL
 SELECT 'artisan'::text,x.artisan_profile_id,'executor'::text,'public.missions'::text FROM public.missions x WHERE p_type='mission' AND x.id=p_id
 UNION ALL
 SELECT 'pricing_offer'::text,x.pricing_offer_id,'pricing'::text,'public.missions'::text FROM public.missions x WHERE p_type='mission' AND x.id=p_id
 UNION ALL
 SELECT 'quote'::text,x.accepted_quote_id,'accepted_quote'::text,'public.missions'::text FROM public.missions x WHERE p_type='mission' AND x.id=p_id
 UNION ALL
 SELECT 'request',r.id,'request','public.missions.request_id' FROM public.missions x JOIN public.service_requests r ON r.id::text=x.request_id WHERE p_type='mission' AND x.id=p_id
 UNION ALL
 SELECT 'client'::text,x.client_profile_id,'client'::text,'public.service_requests'::text FROM public.service_requests x WHERE p_type='request' AND x.id=p_id
 UNION ALL
 SELECT 'artisan'::text,x.target_artisan_id,'target_proposal'::text,'public.service_requests'::text FROM public.service_requests x WHERE p_type='request' AND x.id=p_id
 UNION ALL
 SELECT 'pricing_offer'::text,x.pricing_offer_id,'pricing'::text,'public.service_requests'::text FROM public.service_requests x WHERE p_type='request' AND x.id=p_id
 UNION ALL
 SELECT 'request'::text,x.id,'client_request'::text,'public.service_requests'::text FROM public.service_requests x WHERE p_type='client' AND x.client_profile_id=p_id
 UNION ALL
 SELECT 'request'::text,x.id,'reservation_request'::text,'public.service_requests'::text FROM public.service_requests x WHERE p_type='pricing_offer' AND x.pricing_offer_id=p_id
 UNION ALL
 SELECT 'quote'::text,x.id,'marketplace_quote'::text,'public.quotes'::text FROM public.quotes x WHERE p_type='request' AND x.request_id=p_id
 UNION ALL
 SELECT 'quote'::text,x.id,'marketplace_quote'::text,'public.quotes'::text FROM public.quotes x WHERE p_type='artisan' AND x.artisan_profile_id=p_id
 UNION ALL
 SELECT 'request'::text,x.request_id,'request'::text,'public.quotes'::text FROM public.quotes x WHERE p_type='quote' AND x.id=p_id
 UNION ALL
 SELECT 'artisan'::text,x.artisan_profile_id,'author'::text,'public.quotes'::text FROM public.quotes x WHERE p_type='quote' AND x.id=p_id
 UNION ALL
 SELECT 'enterprise'::text,x.enterprise_id,'tenant'::text,'public.enterprise_request_context'::text FROM public.enterprise_request_context x WHERE p_type='request' AND x.service_request_id=p_id
 UNION ALL
 SELECT 'site'::text,x.site_id,'site'::text,'public.enterprise_request_context'::text FROM public.enterprise_request_context x WHERE p_type='request' AND x.service_request_id=p_id
 UNION ALL
 SELECT 'request'::text,x.service_request_id,'tenant_request'::text,'public.enterprise_request_context'::text FROM public.enterprise_request_context x WHERE p_type='enterprise' AND x.enterprise_id=p_id
 UNION ALL
 SELECT 'request'::text,x.service_request_id,'site_request'::text,'public.enterprise_request_context'::text FROM public.enterprise_request_context x WHERE p_type='site' AND x.site_id=p_id
 UNION ALL
 SELECT 'internal_assignment'::text,x.id,'internal_execution'::text,'public.enterprise_internal_assignments'::text FROM public.enterprise_internal_assignments x WHERE p_type='request' AND x.service_request_id=p_id
 UNION ALL
 SELECT 'internal_assignment'::text,x.id,'internal_execution'::text,'public.enterprise_internal_assignments'::text FROM public.enterprise_internal_assignments x WHERE p_type='worker' AND x.worker_id=p_id
 UNION ALL
 SELECT 'request'::text,x.service_request_id,'request'::text,'public.enterprise_internal_assignments'::text FROM public.enterprise_internal_assignments x WHERE p_type='internal_assignment' AND x.id=p_id
 UNION ALL
 SELECT 'worker'::text,x.worker_id,'executor'::text,'public.enterprise_internal_assignments'::text FROM public.enterprise_internal_assignments x WHERE p_type='internal_assignment' AND x.id=p_id
 UNION ALL
 SELECT 'enterprise'::text,x.enterprise_id,'tenant'::text,'public.enterprise_internal_assignments'::text FROM public.enterprise_internal_assignments x WHERE p_type='internal_assignment' AND x.id=p_id
 UNION ALL
 SELECT 'site'::text,x.id,'site'::text,'public.enterprise_sites'::text FROM public.enterprise_sites x WHERE p_type='enterprise' AND x.enterprise_id=p_id
 UNION ALL
 SELECT 'enterprise'::text,x.enterprise_id,'tenant'::text,'public.enterprise_sites'::text FROM public.enterprise_sites x WHERE p_type='site' AND x.id=p_id
 UNION ALL
 SELECT 'worker'::text,x.id,'workforce'::text,'public.enterprise_workforce_workers'::text FROM public.enterprise_workforce_workers x WHERE p_type='enterprise' AND x.enterprise_id=p_id
 UNION ALL
 SELECT 'enterprise'::text,x.enterprise_id,'tenant'::text,'public.enterprise_workforce_workers'::text FROM public.enterprise_workforce_workers x WHERE p_type='worker' AND x.id=p_id
 UNION ALL
 SELECT 'site'::text,x.site_id,'assigned_coverage'::text,'public.enterprise_workforce_sites'::text FROM public.enterprise_workforce_sites x WHERE p_type='worker' AND x.worker_id=p_id
 UNION ALL
 SELECT 'worker'::text,x.worker_id,'assigned_workforce'::text,'public.enterprise_workforce_sites'::text FROM public.enterprise_workforce_sites x WHERE p_type='site' AND x.site_id=p_id
 UNION ALL
 SELECT 'claim'::text,x.id,'claim'::text,'public.claim_requests'::text FROM public.claim_requests x WHERE p_type='artisan' AND x.artisan_id=p_id
 UNION ALL
 SELECT 'artisan'::text,x.artisan_id,'claimed_profile'::text,'public.claim_requests'::text FROM public.claim_requests x WHERE p_type='claim' AND x.id=p_id
 UNION ALL
 SELECT 'claim'::text,x.id,'claim_request'::text,'public.claim_requests'::text FROM public.claim_requests x WHERE p_type='client' AND x.requester_user_id=p_id
 UNION ALL
 SELECT 'remittance'::text,x.id,'commission_remittance'::text,'public.commission_remittances_v1'::text FROM public.commission_remittances_v1 x WHERE p_type='mission' AND x.mission_id=p_id
 UNION ALL
 SELECT 'mission'::text,x.mission_id,'finance_case'::text,'public.commission_remittances_v1'::text FROM public.commission_remittances_v1 x WHERE p_type='remittance' AND x.id=p_id
 UNION ALL
 SELECT 'remittance'::text,x.supersedes_id,'supersedes'::text,'public.commission_remittances_v1'::text FROM public.commission_remittances_v1 x WHERE p_type='remittance' AND x.id=p_id
 UNION ALL
 SELECT 'diagnostic_summary'::text,x.id,'diagnostic'::text,'fixeo_private.diagnostic_sessions_v1'::text FROM fixeo_private.diagnostic_sessions_v1 x WHERE p_type='request' AND x.service_request_id=p_id
 UNION ALL
 SELECT 'request'::text,x.service_request_id,'confirmed_request'::text,'fixeo_private.diagnostic_sessions_v1'::text FROM fixeo_private.diagnostic_sessions_v1 x WHERE p_type='diagnostic_summary' AND x.id=p_id
$$;

CREATE FUNCTION public.control_dossier_section_v1(p_type text,p_id uuid,p_section text DEFAULT 'identity',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; src text; items jsonb; n integer; cursor jsonb; rid uuid; ctx jsonb; table_type text;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_section IS NULL OR p_section NOT IN('identity','relations','timeline') THEN RAISE EXCEPTION 'INVALID_SECTION'; END IF;
 src:=fixeo_private.control_dossier_source_v1(p_type);
 IF src IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_ENTITY'; END IF;
 j:=fixeo_private.control_row_v1(p_type,p_id);
 IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_after IS NOT NULL AND (jsonb_typeof(p_after)<>'object' OR octet_length(p_after::text)>1024 OR p_after->>'type' IS DISTINCT FROM p_type OR p_after->>'id' IS DISTINCT FROM p_id::text OR p_after->>'section' IS DISTINCT FROM p_section) THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
 IF p_section='identity' THEN
  IF p_after IS NOT NULL THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
  rid:=CASE WHEN p_type='request' THEN p_id WHEN j->>'request_id' ~ '^[0-9a-fA-F-]{36}$' THEN (j->>'request_id')::uuid END;
  IF rid IS NOT NULL THEN
   SELECT jsonb_build_object('enterprise_id',e.enterprise_id,'site_id',e.site_id,'hybrid_mode',h.mode,'hybrid_status',h.status,'fallback_due_at',h.fallback_due_at)
   INTO ctx FROM public.enterprise_request_context e LEFT JOIN public.enterprise_hybrid_dispatch_state h ON h.service_request_id=e.service_request_id WHERE e.service_request_id=rid;
  END IF;
  RETURN jsonb_build_object('entity_type',p_type,'id',p_id,'section',p_section,'summary',j,'enterprise_context',ctx,'as_of',now(),'source_state','FRESH','provenance',src,'projection','fixeo_private.control_row_v1','field_sources',(SELECT jsonb_object_agg(k,CASE WHEN k='confirmed_commission' THEN 'public.commission_remittances_v1.status=confirmed' WHEN k='services' THEN 'public.artisan_service_categories' WHEN k='cities' THEN 'public.artisan_service_cities' WHEN k IN('enterprise_id','site_id') AND p_type='request' THEN 'public.enterprise_request_context' WHEN k='active_assignments' THEN 'public.enterprise_internal_assignments' WHEN k='request_status' THEN 'public.service_requests' ELSE src END) FROM jsonb_object_keys(j) k),'private_business','excluded','media_access','forbidden','request_id',rid);
 ELSIF p_section='relations' THEN
  IF p_after IS NOT NULL AND (coalesce(p_after->>'key','')='' OR p_after - ARRAY['type','id','section','key']<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
  WITH edges AS (
   SELECT DISTINCT e.entity_type,e.entity_id,e.relation,e.source,e.entity_type||':'||e.entity_id||':'||e.relation AS key
   FROM fixeo_private.control_dossier_edges_v1(p_type,p_id) e WHERE e.entity_id IS NOT NULL
  ), page AS (SELECT * FROM edges WHERE p_after IS NULL OR key>p_after->>'key' ORDER BY key LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(jsonb_build_object('type',entity_type,'id',entity_id,'relation',relation,'source',source,'key',key,
    'access',CASE WHEN fixeo_private.control_row_v1(entity_type,entity_id) IS NULL THEN 'missing_or_outside_projection' ELSE 'accessible' END) ORDER BY key),'[]') INTO items FROM page;
 ELSE
  IF p_after IS NOT NULL AND (coalesce(p_after->>'key','')='' OR p_after->>'at' IS NULL OR p_after - ARRAY['type','id','section','key','at']<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
  table_type:=CASE p_type WHEN 'request' THEN 'service_requests' WHEN 'mission' THEN 'missions' WHEN 'quote' THEN 'quotes' WHEN 'artisan' THEN 'artisans' WHEN 'claim' THEN 'claim_requests' WHEN 'enterprise' THEN 'enterprise_accounts' ELSE p_type END;
  -- Audit payloads are deliberately excluded: historic payloads can contain private before-images.
  WITH events AS (
   SELECT 'authority:'||a.id key,a.occurred_at, a.actor_id,a.action,a.result,a.authority,'authority_audit_events_v1' source,'AUDIT' evidence,a.correlation_id
   FROM fixeo_private.authority_audit_events_v1 a WHERE a.target_id=p_id AND a.target_type IN(p_type,table_type)
   UNION ALL
   SELECT 'enterprise:'||a.id,a.created_at,a.actor_user_id,a.event_type,'recorded','Enterprise','enterprise_audit_events','AUDIT',NULL::uuid
   FROM public.enterprise_audit_events a WHERE a.target_id=p_id AND a.target_type IN(p_type,table_type,CASE p_type WHEN 'request' THEN 'service_request' WHEN 'internal_assignment' THEN 'enterprise_internal_assignment' ELSE p_type END)
    AND (a.enterprise_id=nullif(j->>'enterprise_id','')::uuid OR (p_type='enterprise' AND a.enterprise_id=p_id))
   UNION ALL
   SELECT 'timestamp:'||k.key,k.value::timestamptz,NULL,k.key,'recorded',src,src,'CANONICAL_TIMESTAMP',NULL::uuid
   FROM jsonb_each_text(j) k WHERE k.key IN('created_at','accepted_at','started_at','completed_at','validated_at','reviewed_at','submitted_at','presented_at','assigned_at','confirmed_at','cancelled_at') AND k.value IS NOT NULL
  ), page AS (SELECT * FROM events WHERE p_after IS NULL OR (occurred_at,key)<((p_after->>'at')::timestamptz,p_after->>'key') ORDER BY occurred_at DESC,key DESC LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY occurred_at DESC,key DESC),'[]') INTO items FROM page;
 END IF;
 n:=jsonb_array_length(items);
 IF n>p_limit THEN items:=items-(n-1); END IF;
 cursor:=CASE WHEN n>p_limit THEN jsonb_build_object('type',p_type,'id',p_id,'section',p_section,'key',items->(p_limit-1)->>'key')||CASE WHEN p_section='timeline' THEN jsonb_build_object('at',items->(p_limit-1)->>'occurred_at') ELSE '{}'::jsonb END END;
 RETURN jsonb_build_object('entity_type',p_type,'id',p_id,'section',p_section,'items',items,'has_more',n>p_limit,'next_cursor',cursor,'as_of',now(),'source_state','FRESH','completeness',CASE WHEN n>p_limit THEN 'page' ELSE 'complete' END);
END $$;

CREATE FUNCTION fixeo_private.control_operation_row_v1(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; h jsonb; sla jsonb; internal_count integer; external_count integer; offered integer; queue jsonb; internal_ids jsonb; mission_ids jsonb;
BEGIN
 j:=fixeo_private.control_row_v1('request',p_id); IF j IS NULL THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('type','internal_assignment','id',id,'worker_id',worker_id,'status',status) ORDER BY id),'[]') INTO internal_count,internal_ids FROM public.enterprise_internal_assignments WHERE service_request_id=p_id AND status IN('assigned','in_progress','completed','validated');
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('type','mission','id',id,'artisan_id',artisan_profile_id,'status',status,'accepted_at',accepted_at) ORDER BY id),'[]') INTO external_count,mission_ids FROM public.missions WHERE request_id=p_id::text AND status IN('pending','done','validated');
 SELECT (SELECT count(*) FROM public.missions WHERE request_id=p_id::text AND status='offered')+(SELECT count(*) FROM public.enterprise_internal_dispatch_offers WHERE service_request_id=p_id AND status='offered' AND expires_at>now()) INTO offered;
 SELECT jsonb_build_object('mode',mode,'status',status,'fallback_due_at',fallback_due_at,'external_dispatched_at',external_dispatched_at,'updated_at',updated_at) INTO h FROM public.enterprise_hybrid_dispatch_state WHERE service_request_id=p_id;
 IF j->>'enterprise_id' IS NOT NULL THEN sla:=public.enterprise_request_sla_facts_v1(p_id); END IF;
 SELECT jsonb_build_object('queued',count(*) FILTER(WHERE execution_status='QUEUED'),'reported_contacted',count(*) FILTER(WHERE execution_status='CONTACTED'),'failed',count(*) FILTER(WHERE execution_status IN('FAILED','ERROR')),
  'sent_evidence',(SELECT count(*) FROM public.dispatch_notification_outbox WHERE request_id=p_id AND sent_at IS NOT NULL),
  'retry_count',(SELECT coalesce(sum(attempt_count),0) FROM public.dispatch_notification_outbox WHERE request_id=p_id),
  'source','dispatch_execution_queue + dispatch_notification_outbox') INTO queue FROM public.dispatch_execution_queue WHERE request_id=p_id;
 RETURN j||jsonb_build_object('origin',CASE WHEN j->>'enterprise_id' IS NOT NULL THEN 'enterprise' WHEN j->>'client_id' IS NOT NULL THEN 'client' ELSE 'guest' END,
  'executor',CASE WHEN internal_count+external_count>1 THEN 'conflict' WHEN internal_count=1 THEN 'internal' WHEN external_count=1 THEN 'external' ELSE 'unassigned' END,
  'operational_state',CASE WHEN internal_count+external_count>1 THEN 'unknown_conflict' WHEN internal_count+external_count=1 THEN 'engaged' WHEN offered>0 THEN 'offered' WHEN j->>'status'='new' THEN 'waiting' ELSE 'unresolved' END,
  'age_minutes',CASE WHEN j->>'created_at' IS NOT NULL THEN greatest(0,floor(extract(epoch FROM(now()-(j->>'created_at')::timestamptz))/60)) END,
  'internal_assignments',internal_ids,'missions',mission_ids,'active_offers',offered,'hybrid',h,'sla',sla,'dispatch',queue,
  'provenance','service_requests + missions + enterprise_internal_assignments + enterprise_hybrid_dispatch_state + enterprise_request_sla_facts_v1');
END $$;

CREATE FUNCTION public.control_operations_page_v1(p_filters jsonb DEFAULT '{}'::jsonb,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; n integer; eid uuid; sid uuid; min_age integer; max_age integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['status','city','trade','enterprise_id','site_id','classification','urgency','origin','executor','mode','sla','min_age','max_age','query']<>'{}'::jsonb OR octet_length(p_filters::text)>2048 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_filters) kv WHERE jsonb_typeof(kv.value) NOT IN('string','number','null')) THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF coalesce(p_filters->>'classification','all') NOT IN('all','production','test','internal','unclassified')
 OR (p_filters->>'origin' IS NOT NULL AND p_filters->>'origin' NOT IN('enterprise','client','guest'))
 OR (p_filters->>'executor' IS NOT NULL AND p_filters->>'executor' NOT IN('internal','external','unassigned','conflict'))
 OR (p_filters->>'mode' IS NOT NULL AND p_filters->>'mode' NOT IN('internal_only','internal_first','external_only','hybrid','unknown'))
 OR (p_filters->>'sla' IS NOT NULL AND p_filters->>'sla' NOT IN('met','breached','at_risk','on_track','not_configured','unknown_conflict'))
 OR length(coalesce(p_filters->>'city',''))>120 OR length(coalesce(p_filters->>'trade',''))>80 OR length(coalesce(p_filters->>'query',''))>120 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF p_filters->>'status' IS NOT NULL AND p_filters->>'status' NOT IN('new','assigned','in_progress','completed','validated','cancelled') THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF p_filters->>'urgency' IS NOT NULL AND p_filters->>'urgency' NOT IN('now','urgent','normale','unknown') THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 eid:=(p_filters->>'enterprise_id')::uuid; sid:=(p_filters->>'site_id')::uuid;
 min_age:=(p_filters->>'min_age')::integer; max_age:=(p_filters->>'max_age')::integer;
 IF coalesce(min_age,0)<0 OR coalesce(max_age,0)<0 OR (min_age IS NOT NULL AND max_age IS NOT NULL AND max_age<min_age) THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF sid IS NOT NULL AND (eid IS NULL OR NOT EXISTS(SELECT 1 FROM public.enterprise_sites WHERE id=sid AND enterprise_id=eid)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 WITH candidates AS (
  SELECT r.id FROM public.service_requests r LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id
  WHERE (p_after IS NULL OR r.id>p_after)
  AND (p_filters->>'status' IS NULL OR r.status=p_filters->>'status')
  AND (p_filters->>'city' IS NULL OR lower(btrim(r.city))=lower(btrim(p_filters->>'city')))
  AND (p_filters->>'trade' IS NULL OR lower(btrim(r.service_category))=lower(btrim(p_filters->>'trade')))
  AND (p_filters->>'query' IS NULL OR strpos(lower(r.id::text||' '||coalesce(r.city,'')||' '||coalesce(r.service_category,'')),lower(p_filters->>'query'))>0)
  AND (p_filters->>'urgency' IS NULL OR coalesce(r.urgency,'unknown')=p_filters->>'urgency')
  AND (eid IS NULL OR e.enterprise_id=eid) AND(sid IS NULL OR e.site_id=sid)
  AND (coalesce(p_filters->>'classification','all')='all' OR coalesce(r.data_classification,'unclassified')=p_filters->>'classification')
  AND (min_age IS NULL OR r.created_at<=now()-make_interval(mins=>min_age)) AND(max_age IS NULL OR r.created_at>=now()-make_interval(mins=>max_age))
 ), rows AS (SELECT id,fixeo_private.control_operation_row_v1(id) j FROM candidates), page AS (
  SELECT id,j FROM rows WHERE (p_filters->>'origin' IS NULL OR j->>'origin'=p_filters->>'origin')
  AND(p_filters->>'executor' IS NULL OR j->>'executor'=p_filters->>'executor')
  AND(p_filters->>'mode' IS NULL OR coalesce(j->'hybrid'->>'mode','unknown')=p_filters->>'mode')
  AND(p_filters->>'sla' IS NULL OR coalesce(j->'sla'->>'acceptance_status','not_configured')=p_filters->>'sla') ORDER BY id LIMIT p_limit+1)
 SELECT coalesce(jsonb_agg(j ORDER BY id),'[]') INTO items FROM page;
 n:=jsonb_array_length(items); IF n>p_limit THEN items:=items-(n-1); END IF;
 RETURN jsonb_build_object('items',items,'has_more',n>p_limit,'next_cursor',CASE WHEN n>p_limit THEN items->(p_limit-1)->>'id' END,'as_of',now(),'source_state','FRESH','completeness','page','global_total',NULL,'filters',p_filters);
END $$;

CREATE FUNCTION public.control_operation_read_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1(); j:=fixeo_private.control_operation_row_v1(p_request_id);
 IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN jsonb_build_object('item',j,'as_of',now(),'source_state','FRESH');
END $$;

CREATE FUNCTION public.control_search_all_v1(p_query text,p_type text DEFAULT 'all',p_after text DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; n integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 2 AND 120 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_type IS NULL OR (p_type<>'all' AND fixeo_private.control_dossier_source_v1(p_type) IS NULL) OR length(coalesce(p_after,''))>100 THEN RAISE EXCEPTION 'INVALID_SEARCH'; END IF;
 WITH objects AS (
SELECT 'request'::text type,id,coalesce(city,'')||' '||coalesce(service_category,'') label FROM public.service_requests WHERE true
 UNION ALL
 SELECT 'mission'::text type,id,'' label FROM public.missions WHERE true
 UNION ALL
 SELECT 'quote'::text type,id,'' label FROM public.quotes WHERE true
 UNION ALL
 SELECT 'artisan'::text type,id,coalesce(full_name,'')||' '||coalesce(city,'') label FROM public.artisans WHERE true
 UNION ALL
 SELECT 'client'::text type,id,coalesce(full_name,'')||' '||coalesce(city,'') label FROM public.users WHERE role='client'
 UNION ALL
 SELECT 'enterprise'::text type,id,name label FROM public.enterprise_accounts WHERE true
 UNION ALL
 SELECT 'site'::text type,id,name||' '||coalesce(city,'') label FROM public.enterprise_sites WHERE true
 UNION ALL
 SELECT 'worker'::text type,id,'' label FROM public.enterprise_workforce_workers WHERE true
 UNION ALL
 SELECT 'internal_assignment'::text type,id,'' label FROM public.enterprise_internal_assignments WHERE true
 UNION ALL
 SELECT 'claim'::text type,id,'' label FROM public.claim_requests WHERE true
 UNION ALL
 SELECT 'pricing_offer'::text type,id,'' label FROM public.fixeo_pricing_offers_v1 WHERE true
 UNION ALL
 SELECT 'remittance'::text type,id,'' label FROM public.commission_remittances_v1 WHERE true
 UNION ALL
 SELECT 'diagnostic_summary'::text type,id,'' label FROM fixeo_private.diagnostic_sessions_v1 WHERE service_request_id IS NOT NULL
 ), matches AS (SELECT type,id,type||':'||id AS key FROM objects WHERE (p_type='all' OR type=p_type) AND (id::text=lower(btrim(p_query)) OR strpos(lower(coalesce(label,'')),lower(btrim(p_query)))>0)),
 page AS (SELECT * FROM matches WHERE p_after IS NULL OR key>p_after ORDER BY key LIMIT p_limit+1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('type',type,'id',id,'key',key,'summary',fixeo_private.control_row_v1(type,id),'source',fixeo_private.control_dossier_source_v1(type)) ORDER BY key),'[]') INTO items FROM page;
 n:=jsonb_array_length(items); IF n>p_limit THEN items:=items-(n-1); END IF;
 RETURN jsonb_build_object('items',items,'has_more',n>p_limit,'next_cursor',CASE WHEN n>p_limit THEN items->(p_limit-1)->>'key' END,'as_of',now(),'source_state','FRESH','completeness','page');
END $$;

-- Minimal workforce eligibility mirrors the canonical engine's predicates, never its mutations.
CREATE FUNCTION fixeo_private.control_hybrid_snapshot_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; h jsonb; policy jsonb; workers jsonb; worker_fingerprint text; execution_fingerprint text; j jsonb; eid uuid; sid uuid;
BEGIN
 r:=fixeo_private.control_row_v1('request',p_request_id);
 IF r IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 eid:=(r->>'enterprise_id')::uuid; sid:=(r->>'site_id')::uuid;
 IF eid IS NULL THEN RAISE EXCEPTION 'ENTERPRISE_REQUEST_REQUIRED'; END IF;
 SELECT jsonb_build_object('id',p.id,'mode',p.mode,'internal_offer_limit',p.internal_offer_limit,'offer_ttl_minutes',p.offer_ttl_minutes,'fallback_after_minutes',p.fallback_after_minutes,'status',p.status)
 INTO policy FROM public.enterprise_dispatch_policies p WHERE p.enterprise_id=eid AND p.status='active' AND (p.site_id=sid OR p.site_id IS NULL)
 AND(p.service_category IS NULL OR lower(btrim(p.service_category))=lower(btrim(r->>'service_category')))
 ORDER BY CASE WHEN p.site_id=sid THEN 0 ELSE 1 END,CASE WHEN p.service_category IS NOT NULL AND lower(btrim(p.service_category))=lower(btrim(r->>'service_category')) THEN 0 ELSE 1 END,p.created_at DESC LIMIT 1;
 IF policy IS NULL THEN policy:=jsonb_build_object('id',NULL,'mode','external_only','source','canonical_default'); END IF;
 SELECT jsonb_build_object('mode',mode,'status',status,'fallback_due_at',fallback_due_at,'updated_at',updated_at) INTO h FROM public.enterprise_hybrid_dispatch_state WHERE service_request_id=p_request_id;
 WITH facts AS (
  SELECT w.id,w.status,w.availability,w.max_concurrent_jobs,em.status='active' member_active,
   (w.all_sites OR EXISTS(SELECT 1 FROM public.enterprise_workforce_sites ws WHERE ws.worker_id=w.id AND ws.enterprise_id=eid AND ws.site_id=sid)) site_match,
   EXISTS(SELECT 1 FROM public.enterprise_workforce_skills s WHERE s.worker_id=w.id AND s.enterprise_id=eid AND s.active AND lower(btrim(s.service_category))=lower(btrim(r->>'service_category'))) skill_match,
   (SELECT count(*) FROM public.enterprise_internal_assignments i WHERE i.worker_id=w.id AND i.status IN('assigned','in_progress')) active_assignments
  FROM public.enterprise_workforce_workers w JOIN public.enterprise_members em ON em.id=w.member_id AND em.enterprise_id=w.enterprise_id WHERE w.enterprise_id=eid
 ), classified AS (
  SELECT *,status='active' AND availability='available' AND member_active AND site_match AND skill_match AND active_assignments<max_concurrent_jobs eligible,
   array_remove(ARRAY[CASE WHEN status<>'active' THEN 'worker_inactive' END,CASE WHEN availability<>'available' THEN 'not_available' END,CASE WHEN NOT member_active THEN 'member_inactive' END,CASE WHEN NOT site_match THEN 'site_mismatch' END,CASE WHEN NOT skill_match THEN 'skill_mismatch' END,CASE WHEN active_assignments>=max_concurrent_jobs THEN 'capacity_full' END],NULL) reasons FROM facts
 ) SELECT coalesce(jsonb_agg(to_jsonb(classified) ORDER BY eligible DESC,id),'[]'),md5(coalesce(jsonb_agg(to_jsonb(classified) ORDER BY id)::text,'[]')) INTO workers,worker_fingerprint FROM classified;
 SELECT md5(jsonb_build_object(
  'missions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'accepted_at',accepted_at) ORDER BY id),'[]') FROM public.missions WHERE request_id=p_request_id::text),
  'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'worker_id',worker_id) ORDER BY id),'[]') FROM public.enterprise_internal_assignments WHERE service_request_id=p_request_id),
  'offers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'expires_at',expires_at) ORDER BY id),'[]') FROM public.enterprise_internal_dispatch_offers WHERE service_request_id=p_request_id),
  'queue',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',execution_status) ORDER BY id),'[]') FROM public.dispatch_execution_queue WHERE request_id=p_request_id)
 )::text) INTO execution_fingerprint;
 j:=jsonb_build_object('request',r,'enterprise_id',eid,'site_id',sid,'policy',policy,'hybrid',h,'workers',(SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]') FROM jsonb_array_elements(workers) WITH ORDINALITY t(value,ordinal) WHERE ordinal<=50),'workers_has_more',jsonb_array_length(workers)>50,'worker_total',jsonb_array_length(workers),
 'source','enterprise_workforce_workers + enterprise_members + enterprise_workforce_skills + enterprise_workforce_sites + enterprise_internal_assignments','authority','Enterprise Hybrid Dispatch');
 RETURN j||jsonb_build_object('fingerprint',md5((j-'workers')::text||worker_fingerprint||execution_fingerprint));
END $$;

CREATE FUNCTION public.control_hybrid_read_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; allowed boolean;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1(); j:=fixeo_private.control_hybrid_snapshot_v1(p_request_id);
 allowed:=coalesce(fixeo_private._fixeo_is_enterprise_dispatch_operator((j->>'enterprise_id')::uuid),false);
 RETURN (j-'fingerprint')||jsonb_build_object('as_of',now(),'source_state','FRESH','tenant_operator',allowed,'actionable',allowed AND j->'request'->>'status'='new',
 'unavailable_reason',CASE WHEN NOT allowed THEN 'TENANT_DISPATCH_PERMISSION_REQUIRED' WHEN j->'request'->>'status'<>'new' THEN 'REQUEST_ALREADY_ENGAGED' END,
 'rpc',jsonb_build_object('assign','assign_enterprise_internal_worker_v1','retry','retry_enterprise_hybrid_dispatch_v1'));
END $$;

CREATE FUNCTION public.control_hybrid_preview_v1(p_capability text,p_request_id uuid,p_payload jsonb,p_correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); j jsonb; pid uuid; worker uuid;
BEGIN
 IF p_capability IS NULL OR p_capability NOT IN('enterprise.assign','enterprise.retry') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['reason','worker_id']<>'{}'::jsonb OR length(coalesce(p_payload->>'reason','')) NOT BETWEEN 3 AND 500 OR p_correlation_id IS NULL THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 j:=fixeo_private.control_hybrid_snapshot_v1(p_request_id);
 IF NOT coalesce(fixeo_private._fixeo_is_enterprise_dispatch_operator((j->>'enterprise_id')::uuid),false) THEN RAISE EXCEPTION 'TENANT_DISPATCH_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF j->'request'->>'status'<>'new' THEN RAISE EXCEPTION 'REQUEST_ALREADY_ENGAGED'; END IF;
 IF p_capability='enterprise.assign' THEN
  worker:=(p_payload->>'worker_id')::uuid;
  IF j->'policy'->>'mode'='external_only' OR worker IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'workers') w WHERE w->>'id'=worker::text AND w->>'eligible'='true') THEN RAISE EXCEPTION 'WORKER_NOT_ELIGIBLE'; END IF;
 ELSIF p_payload ? 'worker_id' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 IF (SELECT count(*) FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND created_at>now()-interval '1 minute')>=60 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 INSERT INTO fixeo_private.control_action_previews_v1(actor_id,capability,target_id,payload,fingerprint,correlation_id)
 VALUES(uid,p_capability,p_request_id,p_payload,j->>'fingerprint',p_correlation_id) RETURNING id INTO pid;
 RETURN jsonb_build_object('preview_id',pid,'expires_at',now()+interval '5 minutes','target',jsonb_build_object('type','request','id',p_request_id),'current',j->'request','effect',p_payload,'policy',j->'policy','authority','Enterprise Hybrid Dispatch',
 'effect_description',CASE p_capability WHEN 'enterprise.assign' THEN 'Affecter ce technicien interne via l’autorité Enterprise.' ELSE 'Relancer le dispatch hybride selon la politique canonique ; des offres et notifications peuvent être produites.' END,
 'preconditions',jsonb_build_array('admin','active tenant dispatch operator','request new','unchanged preview','canonical policy','canonical winner guard'),'requires_confirmation',true,'correlation_id',p_correlation_id);
END $$;

CREATE FUNCTION public.control_hybrid_execute_v1(p_preview_id uuid,p_confirmed boolean,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); a fixeo_private.control_action_previews_v1; prior uuid; j jsonb; result jsonb; err text; audit_id uuid;
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'HUMAN_CONFIRMATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotency_key::text,0));
 SELECT id INTO prior FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND idempotency_key=p_idempotency_key;
 IF prior IS NOT NULL AND prior<>p_preview_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 SELECT * INTO a FROM fixeo_private.control_action_previews_v1 WHERE id=p_preview_id AND actor_id=uid FOR UPDATE;
 IF NOT FOUND OR a.capability NOT IN('enterprise.assign','enterprise.retry') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Re-authorize tenant membership even on a replay; no stale cached authorization.
 SELECT jsonb_build_object('enterprise_id',enterprise_id) INTO j FROM public.enterprise_request_context WHERE service_request_id=a.target_id;
 IF NOT coalesce(fixeo_private._fixeo_is_enterprise_dispatch_operator((j->>'enterprise_id')::uuid),false) THEN RAISE EXCEPTION 'TENANT_DISPATCH_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF a.executed_at IS NOT NULL THEN RETURN a.execution_result; END IF;
 IF a.expires_at<=now() THEN RAISE EXCEPTION 'PREVIEW_EXPIRED'; END IF;
 PERFORM set_config('fixeo.correlation_id',a.correlation_id::text,true); PERFORM set_config('fixeo.idempotency_key',p_idempotency_key::text,true);
 BEGIN
  -- Same request lock as the Bloc 1 winner guard; selected workforce capacity also serialized.
  PERFORM 1 FROM public.service_requests WHERE id=a.target_id FOR UPDATE;
  IF a.capability='enterprise.assign' THEN PERFORM 1 FROM public.enterprise_workforce_workers WHERE id=(a.payload->>'worker_id')::uuid FOR UPDATE; END IF;
  j:=fixeo_private.control_hybrid_snapshot_v1(a.target_id);
  IF j->>'fingerprint' IS DISTINCT FROM a.fingerprint THEN RAISE EXCEPTION 'STALE_PREVIEW' USING ERRCODE='40001'; END IF;
  IF j->'request'->>'status'<>'new' THEN RAISE EXCEPTION 'REQUEST_ALREADY_ENGAGED'; END IF;
  IF a.capability='enterprise.assign' THEN
   IF j->'policy'->>'mode'='external_only' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'workers') w WHERE w->>'id'=a.payload->>'worker_id' AND w->>'eligible'='true') THEN RAISE EXCEPTION 'WORKER_NOT_ELIGIBLE'; END IF;
   result:=public.assign_enterprise_internal_worker_v1((j->>'enterprise_id')::uuid,a.target_id,(a.payload->>'worker_id')::uuid);
  ELSE result:=public.retry_enterprise_hybrid_dispatch_v1((j->>'enterprise_id')::uuid,a.target_id); END IF;
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '%',coalesce(result->>'reason','AUTHORITY_REJECTED'); END IF;
  result:=jsonb_build_object('ok',true,'result',result,'verified',fixeo_private.control_row_v1('request',a.target_id));
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  result:=jsonb_build_object('ok',false,'code',CASE WHEN err ~ '^[A-Za-z0-9_]{3,80}$' THEN err ELSE 'AUTHORITY_REJECTED' END);
 END;
 audit_id:=fixeo_private.authority_audit_v1('request',a.target_id,'Enterprise Hybrid Dispatch',a.capability,CASE WHEN result->>'ok'='true' THEN 'succeeded' ELSE 'failed' END,jsonb_build_object('preview_id',a.id,'code',result->>'code'));
 result:=result||jsonb_build_object('audit_id',audit_id,'correlation_id',a.correlation_id,'idempotency_key',p_idempotency_key);
 UPDATE fixeo_private.control_action_previews_v1 SET executed_at=now(),execution_result=result,idempotency_key=p_idempotency_key WHERE id=a.id;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION fixeo_private.control_dossier_source_v1(text),fixeo_private.control_dossier_edges_v1(text,uuid),fixeo_private.control_operation_row_v1(uuid),fixeo_private.control_hybrid_snapshot_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.control_dossier_section_v1(text,uuid,text,jsonb,integer),public.control_operations_page_v1(jsonb,uuid,integer),public.control_operation_read_v1(uuid),public.control_search_all_v1(text,text,text,integer),public.control_hybrid_read_v1(uuid),public.control_hybrid_preview_v1(text,uuid,jsonb,uuid),public.control_hybrid_execute_v1(uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_dossier_section_v1(text,uuid,text,jsonb,integer),public.control_operations_page_v1(jsonb,uuid,integer),public.control_operation_read_v1(uuid),public.control_search_all_v1(text,text,text,integer),public.control_hybrid_read_v1(uuid),public.control_hybrid_preview_v1(text,uuid,jsonb,uuid),public.control_hybrid_execute_v1(uuid,boolean,uuid) TO authenticated;
COMMIT;
