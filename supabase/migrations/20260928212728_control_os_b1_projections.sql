-- Bloc 1 / phase 3: bounded projections and human-confirmed commands.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';

CREATE FUNCTION fixeo_private.control_row_v1(p_type text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 CASE p_type
 WHEN 'request' THEN SELECT jsonb_build_object('id',r.id,'client_id',r.client_profile_id,'status',r.status,'city',r.city,'service_category',r.service_category,'urgency',r.urgency,'created_at',r.created_at,'target_artisan_id',r.target_artisan_id,'pricing_offer_id',r.pricing_offer_id,'data_classification',r.data_classification,'enterprise_id',e.enterprise_id,'site_id',e.site_id) INTO j FROM public.service_requests r LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id WHERE r.id=p_id;
 WHEN 'mission' THEN SELECT jsonb_build_object('id',m.id,'request_id',m.request_id,'artisan_id',m.artisan_profile_id,'status',m.status,'request_status',r.status,'created_at',m.created_at,'accepted_at',m.accepted_at,'started_at',m.started_at,'completed_at',m.completed_at,'validated_at',m.validated_at,'agreed_price',m.agreed_price,'final_price',m.final_price,'commission_amount',m.commission_amount,'pricing_offer_id',m.pricing_offer_id,'accepted_quote_id',m.accepted_quote_id,'accepted_quote_version',m.accepted_quote_version,'confirmed_commission',(SELECT coalesce(sum(amount),0) FROM public.commission_remittances_v1 WHERE mission_id=m.id AND status='confirmed')) INTO j FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id WHERE m.id=p_id;
 WHEN 'artisan' THEN SELECT jsonb_build_object('id',a.id,'name',a.full_name,'city',a.city,'service_category',a.service_category,'availability',a.availability,'claimed',a.claimed,'has_owner',a.owner_user_id IS NOT NULL,'verified',a.verified,'verification_conflict',a.verified IS DISTINCT FROM a.is_verified,'onboarding_completed',a.onboarding_completed,'data_classification',a.data_classification,'services',coalesce((SELECT jsonb_agg(service_category ORDER BY service_category) FROM public.artisan_service_categories WHERE artisan_id=a.id),'[]'::jsonb),'cities',coalesce((SELECT jsonb_agg(city ORDER BY city) FROM public.artisan_service_cities WHERE artisan_id=a.id),'[]'::jsonb)) INTO j FROM public.artisans a WHERE id=p_id;
 WHEN 'client' THEN SELECT jsonb_build_object('id',id,'name',full_name,'city',city,'role',role,'created_at',created_at) INTO j FROM public.users WHERE id=p_id AND role='client';
 WHEN 'claim' THEN SELECT jsonb_build_object('id',id,'artisan_id',artisan_id,'status',status,'created_at',created_at,'reviewed_at',reviewed_at,'requester_id',requester_user_id,'requester_present',requester_user_id IS NOT NULL) INTO j FROM public.claim_requests WHERE id=p_id;
 WHEN 'quote' THEN SELECT jsonb_build_object('id',id,'request_id',request_id,'artisan_id',artisan_profile_id,'status',status,'review_status',review_status,'quote_version',quote_version,'reviewed_version',reviewed_version,'proposed_price',proposed_price,'service_description',service_description,'supplies_description',supplies_description,'estimated_duration',estimated_duration,'submitted_at',submitted_at,'presented_at',presented_at,'expires_at',expires_at) INTO j FROM public.quotes WHERE id=p_id;
 WHEN 'enterprise' THEN SELECT jsonb_build_object('id',id,'name',name,'status',status,'data_classification',data_classification,'created_at',created_at) INTO j FROM public.enterprise_accounts WHERE id=p_id;
 WHEN 'site' THEN SELECT jsonb_build_object('id',id,'enterprise_id',enterprise_id,'name',name,'city',city,'status',status,'site_code',site_code) INTO j FROM public.enterprise_sites WHERE id=p_id;
 WHEN 'worker' THEN SELECT jsonb_build_object('id',id,'enterprise_id',enterprise_id,'status',status,'availability',availability,'max_concurrent_jobs',max_concurrent_jobs,'active_assignments',(SELECT count(*) FROM public.enterprise_internal_assignments WHERE worker_id=w.id AND status IN('assigned','in_progress'))) INTO j FROM public.enterprise_workforce_workers w WHERE id=p_id;
 WHEN 'internal_assignment' THEN SELECT jsonb_build_object('id',id,'enterprise_id',enterprise_id,'request_id',service_request_id,'worker_id',worker_id,'status',status,'assigned_at',assigned_at,'started_at',started_at,'completed_at',completed_at) INTO j FROM public.enterprise_internal_assignments WHERE id=p_id;
 WHEN 'remittance' THEN SELECT jsonb_build_object('id',id,'mission_id',mission_id,'amount',amount,'currency',currency,'method',method,'status',status,'version',version,'proof_present',proof_reference IS NOT NULL,'created_at',created_at,'confirmed_at',confirmed_at,'cancelled_at',cancelled_at,'supersedes_id',supersedes_id) INTO j FROM public.commission_remittances_v1 WHERE id=p_id;
 WHEN 'pricing_offer' THEN SELECT jsonb_build_object('id',id,'pricing_version',pricing_version,'currency',currency,'service_code',service_code,'city',city,'vap_minor',vap_minor,'materials_minor',materials_minor,'commission_minor',commission_minor,'client_total_minor',client_total_minor,'created_at',created_at,'expires_at',expires_at) INTO j FROM public.fixeo_pricing_offers_v1 WHERE id=p_id;
 WHEN 'diagnostic_summary' THEN SELECT jsonb_build_object('id',s.id,'request_id',s.service_request_id,'state',s.state,'revision',s.revision,'source',s.source,'consent_version',s.consent_version,'created_at',s.created_at,'updated_at',s.updated_at,'analysis_state',r.state,'contract_version',r.contract_version,'safety_version',r.safety_version,'media_access','forbidden','provenance','diagnostic_authority') INTO j FROM fixeo_private.diagnostic_sessions_v1 s LEFT JOIN fixeo_private.diagnostic_runs_v1 r ON r.id=s.selected_run_id WHERE s.id=p_id AND s.service_request_id IS NOT NULL;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_ENTITY';
 END CASE;
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.control_row_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_dossier_read_v1(p_type text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; relations jsonb:='[]'; events jsonb; rid uuid; erc jsonb; relations_more boolean:=false; timeline_more boolean:=false;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 j:=fixeo_private.control_row_v1(p_type,p_id);
 IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_type='request' THEN
  rid:=p_id;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'type',x->>'id'),'[]') INTO relations FROM (SELECT x FROM (
   SELECT jsonb_build_object('type','mission','id',id) x FROM public.missions WHERE request_id=p_id::text
   UNION ALL SELECT jsonb_build_object('type','quote','id',id) FROM public.quotes WHERE request_id=p_id
   UNION ALL SELECT jsonb_build_object('type','internal_assignment','id',id) FROM public.enterprise_internal_assignments WHERE service_request_id=p_id
   UNION ALL SELECT jsonb_build_object('type','diagnostic_summary','id',id) FROM fixeo_private.diagnostic_sessions_v1 WHERE service_request_id=p_id
  ) raw ORDER BY x->>'type',x->>'id' LIMIT 51) u;
 ELSIF p_type IN('mission','quote','internal_assignment','diagnostic_summary') THEN
  IF (j->>'request_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   rid:=(j->>'request_id')::uuid; relations:=jsonb_build_array(jsonb_build_object('type','request','id',rid));
  END IF;
  IF p_type='mission' THEN
   SELECT relations||coalesce(jsonb_agg(x),'[]') INTO relations FROM (SELECT jsonb_build_object('type','remittance','id',id) x FROM public.commission_remittances_v1 WHERE mission_id=p_id ORDER BY created_at DESC,id LIMIT 51) u;
  END IF;
 ELSIF p_type='remittance' THEN relations:=jsonb_build_array(jsonb_build_object('type','mission','id',j->>'mission_id'));
 ELSIF p_type='artisan' THEN
  SELECT coalesce(jsonb_agg(x),'[]') INTO relations FROM (SELECT jsonb_build_object('type','mission','id',id) x FROM public.missions WHERE artisan_profile_id=p_id ORDER BY created_at DESC,id LIMIT 51) u;
 END IF;
 relations_more:=jsonb_array_length(relations)>50;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO relations FROM jsonb_array_elements(relations) WITH ORDINALITY e(value,ord) WHERE ord<=50;
 IF rid IS NOT NULL THEN SELECT jsonb_build_object('enterprise_id',e.enterprise_id,'site_id',e.site_id,'hybrid_mode',h.mode,'hybrid_status',h.status,'fallback_due_at',h.fallback_due_at,'sla',public.enterprise_request_sla_facts_v1(e.service_request_id)) INTO erc FROM public.enterprise_request_context e LEFT JOIN public.enterprise_hybrid_dispatch_state h ON h.service_request_id=e.service_request_id WHERE e.service_request_id=rid; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY occurred_at DESC,id DESC),'[]') INTO events FROM (SELECT id,occurred_at,authority,action,result,correlation_id,change FROM fixeo_private.authority_audit_events_v1 WHERE target_id=p_id ORDER BY occurred_at DESC,id DESC LIMIT 51) x;
 timeline_more:=jsonb_array_length(events)>50;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO events FROM jsonb_array_elements(events) WITH ORDINALITY e(value,ord) WHERE ord<=50;
 RETURN jsonb_build_object('contract_version','control-v1','entity_type',p_type,'id',p_id,'as_of',now(),'summary',j,'relations',relations,'relations_limit',50,'relations_has_more',relations_more,'timeline',events,'timeline_limit',50,'timeline_has_more',timeline_more,'enterprise_context',erc,'pii','minimal','private_business','excluded');
END $$;

CREATE FUNCTION public.control_operations_list_v1(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_status text DEFAULT NULL,p_city text DEFAULT NULL,p_trade text DEFAULT NULL,p_enterprise_id uuid DEFAULT NULL,p_site_id uuid DEFAULT NULL,p_classification text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; more boolean; next_id uuid;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_limit NOT BETWEEN 1 AND 100 OR p_classification NOT IN('all','production','test','internal','unclassified') OR (p_status IS NOT NULL AND p_status NOT IN('new','assigned','in_progress','completed','validated','cancelled','no_match')) OR length(coalesce(p_city,''))>120 OR length(coalesce(p_trade,''))>80 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 IF p_site_id IS NOT NULL AND (p_enterprise_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.enterprise_sites WHERE id=p_site_id AND enterprise_id=p_enterprise_id)) THEN RAISE EXCEPTION 'INVALID_TENANT_SCOPE'; END IF;
 WITH selected AS (
 SELECT r.id FROM public.service_requests r LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id
 WHERE (p_after IS NULL OR r.id>p_after) AND (p_status IS NULL OR r.status=p_status) AND (p_city IS NULL OR r.city=p_city) AND (p_trade IS NULL OR r.service_category=p_trade)
 AND (p_enterprise_id IS NULL OR e.enterprise_id=p_enterprise_id) AND (p_site_id IS NULL OR e.site_id=p_site_id)
 AND (p_classification='all' OR r.data_classification=p_classification OR (p_classification='unclassified' AND r.data_classification IS NULL)) ORDER BY r.id LIMIT p_limit+1
 ), page AS (SELECT id FROM selected ORDER BY id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(fixeo_private.control_row_v1('request',id) ORDER BY id) FROM page),'[]'),(SELECT count(*)>p_limit FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1) INTO rows,more,next_id;
 RETURN jsonb_build_object('items',rows,'has_more',more,'next_cursor',CASE WHEN more THEN next_id END,'completeness','page','global_total',NULL,'as_of',now(),'classification',p_classification);
END $$;

CREATE FUNCTION public.control_search_v1(p_query text,p_type text,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; more boolean; next_id uuid;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF length(trim(coalesce(p_query,''))) NOT BETWEEN 2 AND 120 OR p_limit NOT BETWEEN 1 AND 50 OR p_type NOT IN('request','artisan','client','enterprise','site','quote','mission','claim') THEN RAISE EXCEPTION 'INVALID_SEARCH'; END IF;
 WITH ids AS (
 SELECT id FROM public.service_requests WHERE p_type='request' AND (id::text=p_query OR strpos(lower(coalesce(city,'')||' '||coalesce(service_category,'')),lower(p_query))>0)
 UNION ALL SELECT id FROM public.artisans WHERE p_type='artisan' AND (id::text=p_query OR strpos(lower(coalesce(full_name,'')||' '||coalesce(city,'')),lower(p_query))>0)
 UNION ALL SELECT id FROM public.users WHERE p_type='client' AND role='client' AND (id::text=p_query OR strpos(lower(coalesce(full_name,'')),lower(p_query))>0)
 UNION ALL SELECT id FROM public.enterprise_accounts WHERE p_type='enterprise' AND (id::text=p_query OR strpos(lower(name),lower(p_query))>0)
 UNION ALL SELECT id FROM public.enterprise_sites WHERE p_type='site' AND (id::text=p_query OR strpos(lower(name||' '||city),lower(p_query))>0)
 UNION ALL SELECT id FROM public.quotes WHERE p_type='quote' AND id::text=p_query
 UNION ALL SELECT id FROM public.missions WHERE p_type='mission' AND id::text=p_query
 UNION ALL SELECT id FROM public.claim_requests WHERE p_type='claim' AND id::text=p_query
 ), selected AS (SELECT id FROM ids WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1), page AS (SELECT id FROM selected ORDER BY id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(fixeo_private.control_row_v1(p_type,id) ORDER BY id) FROM page),'[]'),(SELECT count(*)>p_limit FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1) INTO rows,more,next_id;
 RETURN jsonb_build_object('items',rows,'has_more',more,'next_cursor',CASE WHEN more THEN next_id END,'completeness','page','as_of',now());
END $$;

CREATE FUNCTION public.control_summary_v1(p_source text,p_classification text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE metrics jsonb; unclassified bigint;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_classification NOT IN('all','production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION'; END IF;
 SELECT count(*) INTO unclassified FROM public.service_requests WHERE data_classification IS NULL;
 CASE p_source
 WHEN 'requests' THEN
 SELECT jsonb_build_object('requests.total',count(*),'requests.new',count(*) FILTER(WHERE status='new'),'requests.assigned',count(*) FILTER(WHERE status='assigned'),'requests.in_progress',count(*) FILTER(WHERE status='in_progress'),'requests.completed_pending_validation',count(*) FILTER(WHERE status='completed'),'requests.validated',count(*) FILTER(WHERE status='validated'),'requests.fulfilled',count(*) FILTER(WHERE status IN('completed','validated')),'requests.cancelled',count(*) FILTER(WHERE status='cancelled'),'requests.no_match',count(*) FILTER(WHERE status='no_match'),'requests.open',count(*) FILTER(WHERE status IN('new','assigned','in_progress','no_match')),'requests.guest',count(*) FILTER(WHERE client_profile_id IS NULL),'urgency.now',count(*) FILTER(WHERE urgency='now'),'urgency.urgent',count(*) FILTER(WHERE urgency='urgent'),'urgency.total',count(*) FILTER(WHERE urgency IN('now','urgent')),'urgency.active',count(*) FILTER(WHERE urgency IN('now','urgent') AND status IN('new','assigned','in_progress','no_match')),'urgency.fulfilled',count(*) FILTER(WHERE urgency IN('now','urgent') AND status IN('completed','validated')),'urgency.cancelled',count(*) FILTER(WHERE urgency IN('now','urgent') AND status='cancelled'),'urgency.oldest_active_minutes',max(extract(epoch FROM(now()-created_at))/60) FILTER(WHERE urgency IN('now','urgent') AND status IN('new','assigned','in_progress','no_match')),'urgency.active_undated',count(*) FILTER(WHERE urgency IN('now','urgent') AND status IN('new','assigned','in_progress','no_match') AND created_at IS NULL)) INTO metrics FROM public.service_requests WHERE p_classification='all' OR data_classification=p_classification OR(p_classification='unclassified' AND data_classification IS NULL);
 WHEN 'missions' THEN
 SELECT jsonb_build_object('missions.total_rows',count(*),'missions.offered',count(*) FILTER(WHERE m.status='offered'),'missions.accepted',count(*) FILTER(WHERE m.status='pending' AND m.accepted_at IS NOT NULL AND r.status IN('assigned','in_progress')),'missions.assigned',count(*) FILTER(WHERE m.status='pending' AND m.accepted_at IS NOT NULL AND r.status='assigned'),'missions.in_progress',count(*) FILTER(WHERE m.status='pending' AND m.accepted_at IS NOT NULL AND r.status='in_progress'),'missions.active',count(*) FILTER(WHERE m.status='pending' AND m.accepted_at IS NOT NULL AND r.status IN('assigned','in_progress')),'missions.completed_pending_validation',count(*) FILTER(WHERE m.status='done' AND r.status='completed'),'missions.validated',count(*) FILTER(WHERE m.status='validated' AND r.status='validated' AND m.completed_at IS NOT NULL AND m.validated_at IS NOT NULL),'missions.validated_raw',count(*) FILTER(WHERE m.status='validated'),'missions.validation_unproven',count(*) FILTER(WHERE m.status='validated' AND (m.completed_at IS NULL OR m.validated_at IS NULL)),'missions.cancelled',count(*) FILTER(WHERE m.status='cancelled'),'missions.expired',count(*) FILTER(WHERE m.status='expired'),'missions.declined',count(*) FILTER(WHERE m.status='declined'),'missions.inconsistent',count(*) FILTER(WHERE r.id IS NULL OR(m.status='validated' AND r.status<>'validated'))) INTO metrics FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id WHERE p_classification='all' OR r.data_classification=p_classification OR(p_classification='unclassified' AND r.data_classification IS NULL);
 WHEN 'artisans' THEN
 SELECT jsonb_build_object('artisans.total',count(*),'artisans.available',count(*) FILTER(WHERE availability='available'),'artisans.busy',count(*) FILTER(WHERE availability='busy'),'artisans.unavailable',count(*) FILTER(WHERE availability='unavailable'),'artisans.claimed',count(*) FILTER(WHERE claimed AND owner_user_id IS NOT NULL),'artisans.unclaimed',count(*) FILTER(WHERE NOT claimed AND owner_user_id IS NULL),'artisans.verified',count(*) FILTER(WHERE verified),'artisans.non_verified',count(*) FILTER(WHERE verified IS DISTINCT FROM true),'artisans.claiming',count(*) FILTER(WHERE claim_status='pending'),'artisans.to_verify',count(*) FILTER(WHERE claimed AND owner_user_id IS NOT NULL AND onboarding_completed AND verified IS DISTINCT FROM true),'artisans.verification_conflict',count(*) FILTER(WHERE verified IS DISTINCT FROM is_verified),'artisans.incomplete',count(*) FILTER(WHERE nullif(trim(full_name),'') IS NULL OR nullif(trim(phone),'') IS NULL OR nullif(trim(city),'') IS NULL OR nullif(trim(service_category),'') IS NULL OR nullif(trim(description),'') IS NULL OR nullif(trim(photo_url),'') IS NULL),'artisans.active_30d',count(*) FILTER(WHERE owner_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.missions m WHERE m.artisan_profile_id=a.id AND (m.accepted_at>=now()-interval '30 days' OR m.started_at>=now()-interval '30 days' OR m.completed_at>=now()-interval '30 days') AND m.status IN('pending','done','validated','cancelled')))) INTO metrics FROM public.artisans a WHERE p_classification='all' OR data_classification=p_classification OR(p_classification='unclassified' AND data_classification IS NULL);
 WHEN 'trust' THEN SELECT jsonb_build_object('trust.claims.total',count(*),'trust.claims.pending',count(*) FILTER(WHERE c.status='pending')) INTO metrics FROM public.claim_requests c LEFT JOIN public.artisans a ON a.id=c.artisan_id WHERE p_classification='all' OR a.data_classification=p_classification OR(p_classification='unclassified' AND a.data_classification IS NULL);
 WHEN 'network' THEN
  metrics:=jsonb_build_object('network.clients',(SELECT count(*) FROM public.users WHERE role='client'),'network.enterprises',(SELECT count(*) FROM public.enterprise_accounts WHERE p_classification='all' OR data_classification=p_classification OR(p_classification='unclassified' AND data_classification IS NULL)),'network.sites',(SELECT count(*) FROM public.enterprise_sites s JOIN public.enterprise_accounts e ON e.id=s.enterprise_id WHERE p_classification='all' OR e.data_classification=p_classification OR(p_classification='unclassified' AND e.data_classification IS NULL)),'network.workforce',(SELECT count(*) FROM public.enterprise_workforce_workers w JOIN public.enterprise_accounts e ON e.id=w.enterprise_id WHERE p_classification='all' OR e.data_classification=p_classification OR(p_classification='unclassified' AND e.data_classification IS NULL)));
 WHEN 'finance' THEN
 SELECT jsonb_build_object('finance.expected',CASE WHEN count(*) FILTER(WHERE m.status='pending' AND r.status IN('assigned','in_progress') AND m.commission_amount IS NULL)>0 THEN NULL ELSE coalesce(sum(m.commission_amount) FILTER(WHERE m.status='pending' AND r.status IN('assigned','in_progress')),0) END,'finance.due_gross',CASE WHEN count(*) FILTER(WHERE m.final_price IS NOT NULL AND m.status IN('done','validated') AND (m.commission_amount IS NULL OR (m.status='validated' AND m.completed_at IS NULL)))>0 THEN NULL ELSE coalesce(sum(m.commission_amount) FILTER(WHERE m.final_price IS NOT NULL AND ((m.status='done' AND r.status IN('completed','validated')) OR(m.status='validated' AND r.status='validated' AND m.completed_at IS NOT NULL))),0) END,'finance.price_finalized',count(*) FILTER(WHERE m.final_price IS NOT NULL),'finance.price_missing',count(*) FILTER(WHERE m.status IN('done','validated') AND m.final_price IS NULL),'finance.confirmed',(SELECT coalesce(sum(x.amount),0) FROM public.commission_remittances_v1 x JOIN public.missions mm ON mm.id=x.mission_id JOIN public.service_requests rr ON rr.id::text=mm.request_id WHERE x.status='confirmed' AND(p_classification='all' OR rr.data_classification=p_classification OR(p_classification='unclassified' AND rr.data_classification IS NULL)))) INTO metrics FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id WHERE p_classification='all' OR r.data_classification=p_classification OR(p_classification='unclassified' AND r.data_classification IS NULL);
 ELSE RAISE EXCEPTION 'UNSUPPORTED_SOURCE';
 END CASE;
 RETURN jsonb_build_object('contract_version','metrics-v1','source',p_source,'metrics',metrics,'as_of',now(),'completeness','complete','scope',jsonb_build_object('classification',p_classification,'window','stock','timezone','Africa/Casablanca'),'unclassified_requests',unclassified,'historical_event_coverage','partial_before_bloc1','metric_quality',CASE WHEN p_source='artisans' THEN jsonb_build_object('artisans.active_30d','partial_historical_coverage') ELSE '{}'::jsonb END);
END $$;

CREATE FUNCTION fixeo_private.control_action_type_v1(p_capability text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_capability IN('artisan.verify','artisan.classify') THEN 'artisan' WHEN p_capability IN('claim.approve','claim.reject') THEN 'claim' WHEN p_capability IN('quote.approve','quote.reject') THEN 'quote' WHEN p_capability IN('mission.settle','finance.declare','finance.confirm','finance.cancel','finance.correct') THEN 'mission' WHEN p_capability IN('request.dispatch','request.classify') THEN 'request' WHEN p_capability='enterprise.classify' THEN 'enterprise' END;
$$;
REVOKE ALL ON FUNCTION fixeo_private.control_action_type_v1(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_action_preview_v1(p_capability text,p_target_id uuid,p_payload jsonb,p_correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=fixeo_private.control_require_admin_v1(); typ text; j jsonb; id uuid; allowed text[]; remittance jsonb;
BEGIN
 typ:=fixeo_private.control_action_type_v1(p_capability);
 IF typ IS NULL OR p_target_id IS NULL OR p_correlation_id IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>4096 THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 allowed:=CASE p_capability WHEN 'request.dispatch' THEN ARRAY['artisan_id','reason'] WHEN 'mission.settle' THEN ARRAY['final_price','expected_final_price','reason'] WHEN 'quote.approve' THEN ARRAY['version','reason','expires_at'] WHEN 'quote.reject' THEN ARRAY['version','reason'] WHEN 'finance.declare' THEN ARRAY['amount','method','proof_reference','reason'] WHEN 'finance.confirm' THEN ARRAY['remittance_id','version','reason'] WHEN 'finance.cancel' THEN ARRAY['remittance_id','version','reason'] WHEN 'finance.correct' THEN ARRAY['remittance_id','version','amount','method','proof_reference','reason'] WHEN 'request.classify' THEN ARRAY['classification','reason'] WHEN 'artisan.classify' THEN ARRAY['classification','reason'] WHEN 'enterprise.classify' THEN ARRAY['classification','reason'] ELSE ARRAY['reason'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT(k=ANY(allowed))) OR length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'INVALID_ACTION_PAYLOAD'; END IF;
 j:=fixeo_private.control_row_v1(typ,p_target_id); IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_capability='request.dispatch' AND j->>'enterprise_id' IS NOT NULL THEN RAISE EXCEPTION 'ENTERPRISE_DELEGATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_capability IN('quote.approve','quote.reject') AND (j->>'status'<>'pending' OR j->>'review_status' NOT IN('submitted','legacy_unreviewed') OR (j->>'quote_version')::integer IS DISTINCT FROM (p_payload->>'version')::integer) THEN RAISE EXCEPTION 'QUOTE_NOT_REVIEWABLE'; END IF;
 IF p_capability='mission.settle' AND NOT ((j->>'status'='done' AND j->>'request_status' IN('completed','validated')) OR (j->>'status'='validated' AND j->>'request_status'='validated')) THEN RAISE EXCEPTION 'INELIGIBLE_MISSION'; END IF;
 IF p_capability='request.dispatch' AND (j->>'status'<>'new' OR p_payload->>'artisan_id' IS NULL) THEN RAISE EXCEPTION 'REQUEST_NOT_DISPATCHABLE'; END IF;
 IF p_capability IN('claim.approve','claim.reject') AND j->>'status'<>'pending' THEN RAISE EXCEPTION 'CLAIM_NOT_PENDING'; END IF;
 IF p_capability LIKE 'finance.%' AND (j->>'final_price' IS NULL OR (j->>'status'='validated' AND j->>'completed_at' IS NULL) OR NOT ((j->>'status'='done' AND j->>'request_status' IN('completed','validated')) OR (j->>'status'='validated' AND j->>'request_status'='validated'))) AND p_capability<>'finance.cancel' THEN RAISE EXCEPTION 'COMMISSION_NOT_DUE'; END IF;

 IF p_capability IN('finance.confirm','finance.cancel','finance.correct') THEN
  SELECT jsonb_build_object('id',x.id,'amount',x.amount,'currency',x.currency,'method',x.method,'status',x.status,'version',x.version,'proof_present',x.proof_reference IS NOT NULL) INTO remittance FROM public.commission_remittances_v1 x WHERE x.id=(p_payload->>'remittance_id')::uuid AND x.mission_id=p_target_id;
  IF remittance IS NULL THEN RAISE EXCEPTION 'REMITTANCE_NOT_FOUND'; END IF;
 END IF;
 IF (SELECT count(*) FROM fixeo_private.control_action_previews_v1 WHERE actor_id=uid AND created_at>now()-interval '1 minute')>=60 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;
 INSERT INTO fixeo_private.control_action_previews_v1(actor_id,capability,target_id,payload,fingerprint,correlation_id) VALUES(uid,p_capability,p_target_id,p_payload,md5(j::text),p_correlation_id) RETURNING control_action_previews_v1.id INTO id;
 RETURN jsonb_build_object('preview_id',id,'capability',p_capability,'target',jsonb_build_object('type',typ,'id',p_target_id),'authority',split_part(p_capability,'.',1),'current',j,'remittance',remittance,'effect',p_payload-'proof_reference','preconditions',jsonb_build_array('role_admin','unchanged_target','domain_state_valid'),'requires_confirmation',true,'expires_at',now()+interval '5 minutes','correlation_id',p_correlation_id,'warnings',jsonb_build_array('Action engageante : vérifier la cible et le montant avant confirmation.'));
END $$;

CREATE FUNCTION public.control_action_execute_v1(p_preview_id uuid,p_confirmed boolean,p_idempotency_key uuid)
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

REVOKE ALL ON FUNCTION public.control_dossier_read_v1(text,uuid),public.control_operations_list_v1(uuid,integer,text,text,text,uuid,uuid,text),public.control_search_v1(text,text,uuid,integer),public.control_summary_v1(text,text),public.control_action_preview_v1(text,uuid,jsonb,uuid),public.control_action_execute_v1(uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_dossier_read_v1(text,uuid),public.control_operations_list_v1(uuid,integer,text,text,text,uuid,uuid,text),public.control_search_v1(text,text,uuid,integer),public.control_summary_v1(text,text),public.control_action_preview_v1(text,uuid,jsonb,uuid),public.control_action_execute_v1(uuid,boolean,uuid) TO authenticated;
COMMIT;
