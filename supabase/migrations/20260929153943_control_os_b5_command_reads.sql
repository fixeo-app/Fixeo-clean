-- Bloc 5: minimal Admin registers over canonical objects; no business writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR to_regprocedure('public.control_dossier_section_v1(text,uuid,text,jsonb,integer)') IS NULL
 OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.admin_settle_mission_v1(uuid,numeric,numeric,text)')) IS DISTINCT FROM 'c65636d6c39bc43e91818dc10f9f00fd'
 THEN RAISE EXCEPTION 'B5_BASELINE_MISMATCH'; END IF;
END $$;

CREATE FUNCTION fixeo_private.control_people_facts_v1(p_type text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 IF p_type='artisan' THEN
  SELECT jsonb_build_object(
   'ownership',CASE WHEN a.claimed IS NULL THEN 'UNKNOWN' WHEN a.claimed AND a.owner_user_id IS NOT NULL THEN 'claimed' WHEN NOT a.claimed AND a.owner_user_id IS NULL THEN 'unclaimed' ELSE 'conflict' END,
   'claimable',a.claimable,'pending_claims',(SELECT count(*) FROM public.claim_requests c WHERE c.artisan_id=a.id AND c.status='pending'),
   'verification',CASE WHEN a.verified IS NULL THEN 'UNKNOWN' WHEN a.verified THEN 'verified' ELSE 'not_verified' END,
   'verification_conflict',a.verified IS DISTINCT FROM a.is_verified,
   'verification_ready',a.claimed IS TRUE AND a.owner_user_id IS NOT NULL AND a.onboarding_completed IS TRUE AND a.verified IS DISTINCT FROM true,
   'checklist_version','marketplace-presence-v1',
   'missing_fields',to_jsonb(array_remove(ARRAY[
    CASE WHEN nullif(btrim(a.full_name),'') IS NULL THEN 'identity' END,
    CASE WHEN nullif(btrim(a.phone),'') IS NULL THEN 'phone' END,
    CASE WHEN nullif(btrim(a.city),'') IS NULL THEN 'city' END,
    CASE WHEN nullif(btrim(a.service_category),'') IS NULL THEN 'trade' END,
    CASE WHEN nullif(btrim(a.description),'') IS NULL THEN 'description' END,
    CASE WHEN nullif(btrim(a.photo_url),'') IS NULL THEN 'photo' END],NULL)),
   'availability_updated_at',a.updated_at,'source','public.artisans + public.claim_requests') INTO j FROM public.artisans a WHERE a.id=p_id;
 ELSIF p_type='enterprise' THEN
  SELECT jsonb_build_object('sites',(SELECT count(*) FROM public.enterprise_sites WHERE enterprise_id=p_id),'active_sites',(SELECT count(*) FROM public.enterprise_sites WHERE enterprise_id=p_id AND status='active'),
   'members',(SELECT count(*) FROM public.enterprise_members WHERE enterprise_id=p_id),'active_members',(SELECT count(*) FROM public.enterprise_members WHERE enterprise_id=p_id AND status='active'),
   'workers',(SELECT count(*) FROM public.enterprise_workforce_workers WHERE enterprise_id=p_id),'active_workers',(SELECT count(*) FROM public.enterprise_workforce_workers WHERE enterprise_id=p_id AND status='active'),
   'tenant_dispatch_operator',coalesce(fixeo_private._fixeo_is_enterprise_dispatch_operator(p_id),false),
   'source','public.enterprise_sites + public.enterprise_members + public.enterprise_workforce_workers') INTO j;
 ELSIF p_type='site' THEN
  SELECT jsonb_build_object('enterprise_id',s.enterprise_id,
   'members',(SELECT count(*) FROM public.enterprise_member_sites WHERE enterprise_id=s.enterprise_id AND site_id=s.id),
   'workers',(SELECT count(*) FROM public.enterprise_workforce_workers w WHERE w.enterprise_id=s.enterprise_id AND (w.all_sites OR EXISTS(SELECT 1 FROM public.enterprise_workforce_sites ws WHERE ws.worker_id=w.id AND ws.enterprise_id=s.enterprise_id AND ws.site_id=s.id))),
   'source','public.enterprise_member_sites + public.enterprise_workforce_sites + public.enterprise_workforce_workers.all_sites') INTO j FROM public.enterprise_sites s WHERE s.id=p_id;
 ELSIF p_type='worker' THEN
  SELECT jsonb_build_object('member_id',w.member_id,'member_status',m.status,'member_role',m.role,'all_sites',w.all_sites,
   'residual_capacity',greatest(w.max_concurrent_jobs-(SELECT count(*) FROM public.enterprise_internal_assignments a WHERE a.worker_id=w.id AND a.status IN('assigned','in_progress')),0),
   'source','public.enterprise_workforce_workers + public.enterprise_members + public.enterprise_internal_assignments') INTO j
  FROM public.enterprise_workforce_workers w LEFT JOIN public.enterprise_members m ON m.id=w.member_id AND m.enterprise_id=w.enterprise_id WHERE w.id=p_id;
 ELSIF p_type='client' THEN
  SELECT jsonb_build_object('registered_client',true,'memberships',(SELECT count(*) FROM public.enterprise_members WHERE user_id=p_id),
   'requests',(SELECT count(*) FROM public.service_requests WHERE client_profile_id=p_id),'source','public.users + public.enterprise_members + public.service_requests') INTO j;
 END IF;
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.control_people_facts_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_people_page_v1(p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text:=coalesce(p_filters->>'type','all'); state text:=coalesce(p_filters->>'state','all');
 classification text:=coalesce(p_filters->>'classification','all'); v_city text:=nullif(btrim(p_filters->>'city'),''); trade text:=nullif(btrim(p_filters->>'trade'),'');
 term text:=lower(btrim(coalesce(p_filters->>'query',''))); eid uuid; sid uuid; items jsonb; total bigint; n integer; scope text;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['type','state','classification','city','trade','query','enterprise_id','site_id']<>'{}'
 OR EXISTS(SELECT 1 FROM jsonb_each(p_filters) WHERE jsonb_typeof(value) NOT IN('string','null'))
 OR kind NOT IN('all','artisan','client','enterprise','site','worker') OR state NOT IN('all','active','inactive','available','busy','unavailable','unknown','claimed','unclaimed','unverified','verification_conflict','incomplete')
 OR classification NOT IN('all','production','test','internal','unclassified') OR length(term)>120 OR length(v_city)>120 OR length(trade)>80 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 eid:=nullif(p_filters->>'enterprise_id','')::uuid;sid:=nullif(p_filters->>'site_id','')::uuid;
 IF eid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_accounts WHERE id=eid) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF sid IS NOT NULL AND (eid IS NULL OR NOT EXISTS(SELECT 1 FROM public.enterprise_sites WHERE id=sid AND enterprise_id=eid)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 scope:=md5(p_filters::text);
 IF p_after IS NOT NULL AND (jsonb_typeof(p_after)<>'object' OR p_after-ARRAY['scope','key']<>'{}' OR p_after->>'scope' IS DISTINCT FROM scope OR coalesce(p_after->>'key','') !~ '^(artisan|client|enterprise|site|worker):[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
 WITH pool AS MATERIALIZED (
  SELECT 'artisan'::text type,a.id FROM public.artisans a WHERE kind IN('all','artisan') AND eid IS NULL AND sid IS NULL
  AND (v_city IS NULL OR lower(btrim(a.city))=lower(v_city) OR EXISTS(SELECT 1 FROM public.artisan_service_cities c WHERE c.artisan_id=a.id AND lower(btrim(c.city))=lower(v_city)))
  AND (trade IS NULL OR lower(btrim(a.service_category))=lower(trade) OR EXISTS(SELECT 1 FROM public.artisan_service_categories c WHERE c.artisan_id=a.id AND lower(btrim(c.service_category))=lower(trade)))
  AND (classification='all' OR a.data_classification=classification OR (classification='unclassified' AND a.data_classification IS NULL))
  AND (term='' OR a.id::text=term OR strpos(lower(coalesce(a.full_name,'')||' '||coalesce(a.city,'')||' '||coalesce(a.service_category,'')),term)>0)
  AND CASE state WHEN 'all' THEN true WHEN 'claimed' THEN a.claimed IS TRUE AND a.owner_user_id IS NOT NULL WHEN 'unclaimed' THEN a.claimed IS FALSE AND a.owner_user_id IS NULL
   WHEN 'unverified' THEN a.verified IS DISTINCT FROM true WHEN 'verification_conflict' THEN a.verified IS DISTINCT FROM a.is_verified WHEN 'unknown' THEN a.availability IS NULL
   WHEN 'incomplete' THEN nullif(btrim(a.full_name),'') IS NULL OR nullif(btrim(a.phone),'') IS NULL OR nullif(btrim(a.city),'') IS NULL OR nullif(btrim(a.service_category),'') IS NULL OR nullif(btrim(a.description),'') IS NULL OR nullif(btrim(a.photo_url),'') IS NULL
   ELSE a.availability=state END
  UNION ALL
  SELECT 'client',u.id FROM public.users u WHERE kind IN('all','client') AND u.role='client' AND state='all' AND classification='all' AND eid IS NULL AND sid IS NULL AND trade IS NULL
   AND(v_city IS NULL OR lower(btrim(u.city))=lower(v_city)) AND(term='' OR u.id::text=term OR strpos(lower(coalesce(u.full_name,'')||' '||coalesce(u.city,'')),term)>0)
  UNION ALL
  SELECT 'enterprise',a.id FROM public.enterprise_accounts a WHERE kind IN('all','enterprise') AND (eid IS NULL OR a.id=eid) AND sid IS NULL AND v_city IS NULL AND trade IS NULL
   AND(state='all' OR a.status=state) AND(classification='all' OR a.data_classification=classification OR(classification='unclassified' AND a.data_classification IS NULL))
   AND(term='' OR a.id::text=term OR strpos(lower(a.name),term)>0)
  UNION ALL
  SELECT 'site',s.id FROM public.enterprise_sites s JOIN public.enterprise_accounts a ON a.id=s.enterprise_id WHERE kind IN('all','site') AND(eid IS NULL OR s.enterprise_id=eid) AND(sid IS NULL OR s.id=sid) AND trade IS NULL
   AND(v_city IS NULL OR lower(btrim(s.city))=lower(v_city)) AND(state='all' OR s.status=state)
   AND(classification='all' OR a.data_classification=classification OR(classification='unclassified' AND a.data_classification IS NULL)) AND(term='' OR s.id::text=term OR strpos(lower(s.name||' '||s.city),term)>0)
  UNION ALL
  SELECT 'worker',w.id FROM public.enterprise_workforce_workers w JOIN public.enterprise_accounts a ON a.id=w.enterprise_id WHERE kind IN('all','worker') AND(eid IS NULL OR w.enterprise_id=eid)
   AND(sid IS NULL OR w.all_sites OR EXISTS(SELECT 1 FROM public.enterprise_workforce_sites s WHERE s.worker_id=w.id AND s.enterprise_id=w.enterprise_id AND s.site_id=sid))
   AND(v_city IS NULL OR EXISTS(SELECT 1 FROM public.enterprise_sites s WHERE s.enterprise_id=w.enterprise_id AND lower(btrim(s.city))=lower(v_city) AND (w.all_sites OR EXISTS(SELECT 1 FROM public.enterprise_workforce_sites ws WHERE ws.worker_id=w.id AND ws.enterprise_id=w.enterprise_id AND ws.site_id=s.id))))
   AND(trade IS NULL OR EXISTS(SELECT 1 FROM public.enterprise_workforce_skills s WHERE s.worker_id=w.id AND s.enterprise_id=w.enterprise_id AND s.active AND lower(btrim(s.service_category))=lower(trade)))
   AND(state='all' OR (state IN('active','inactive') AND w.status=state) OR (state IN('available','busy','unavailable') AND w.availability=state) OR(state='unknown' AND w.availability IS NULL))
   AND(classification='all' OR a.data_classification=classification OR(classification='unclassified' AND a.data_classification IS NULL)) AND(term='' OR w.id::text=term)
 ), matched AS (SELECT *,type||':'||id AS key FROM pool), page AS (SELECT * FROM matched WHERE p_after IS NULL OR key>p_after->>'key' ORDER BY key LIMIT p_limit+1)
 SELECT (SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(jsonb_build_object('type',type,'id',id,'key',key,'summary',fixeo_private.control_row_v1(type,id),'facts',fixeo_private.control_people_facts_v1(type,id),'source',fixeo_private.control_dossier_source_v1(type)) ORDER BY key) FROM page),'[]') INTO total,items;
 n:=jsonb_array_length(items);IF n>p_limit THEN items:=items-(n-1);END IF;
 RETURN jsonb_build_object('items',items,'total',total,'total_kind','distinct_canonical_objects','has_more',n>p_limit,'next_cursor',CASE WHEN n>p_limit THEN jsonb_build_object('scope',scope,'key',items->(p_limit-1)->>'key') END,'as_of',now(),'source_state','FRESH','completeness',CASE WHEN n>p_limit OR p_after IS NOT NULL THEN 'page' ELSE 'complete' END,'private_business','excluded','source','Control People register / canonical projections');
END $$;

CREATE FUNCTION public.control_people_context_v1(p_type text,p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; eid uuid; sid uuid; items jsonb; total bigint;n integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_type IS NULL OR p_type NOT IN('artisan','client','enterprise','site','worker') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 j:=fixeo_private.control_row_v1(p_type,p_id);IF j IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 eid:=CASE WHEN p_type='enterprise' THEN p_id WHEN p_type IN('site','worker') THEN (j->>'enterprise_id')::uuid END;sid:=CASE WHEN p_type='site' THEN p_id END;
 WITH pool AS MATERIALIZED (
  SELECT m.id,m.enterprise_id,m.user_id,m.role,m.status,m.created_at FROM public.enterprise_members m
  WHERE (p_type='client' AND m.user_id=p_id) OR (eid IS NOT NULL AND m.enterprise_id=eid AND (p_type<>'worker' OR m.id=(SELECT member_id FROM public.enterprise_workforce_workers WHERE id=p_id))
   AND (sid IS NULL OR EXISTS(SELECT 1 FROM public.enterprise_member_sites s WHERE s.member_id=m.id AND s.enterprise_id=eid AND s.site_id=sid)))
 ), page AS (SELECT * FROM pool WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1)
 SELECT (SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page),'[]') INTO total,items;
 n:=jsonb_array_length(items);IF n>p_limit THEN items:=items-(n-1);END IF;
 RETURN jsonb_build_object('type',p_type,'id',p_id,'facts',fixeo_private.control_people_facts_v1(p_type,p_id),'memberships',items,'membership_total',total,'has_more',n>p_limit,'next_cursor',CASE WHEN n>p_limit THEN items->(p_limit-1)->>'id' END,
 'membership_scope',CASE WHEN p_type='site' THEN 'explicit_site_assignments_only' ELSE 'minimal_canonical_memberships' END,'source','public.enterprise_members / public.enterprise_member_sites','as_of',now(),'source_state','FRESH','private_business','excluded');
END $$;

-- 5.2 Trust uses existing claims/verification authorities and canonical reviews.
CREATE FUNCTION public.control_trust_page_v1(p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_queue text:=coalesce(p_filters->>'queue','claims');v_state text:=coalesce(p_filters->>'state','all');v_city text:=nullif(btrim(p_filters->>'city'),'');v_trade text:=nullif(btrim(p_filters->>'trade'),'');v_class text:=coalesce(p_filters->>'classification','all');v_scope text;v_items jsonb;v_total bigint;v_n integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['queue','state','city','trade','classification']<>'{}'
 OR EXISTS(SELECT 1 FROM jsonb_each(p_filters) WHERE jsonb_typeof(value) NOT IN('string','null'))
 OR v_queue NOT IN('claims','verification','completeness','conflicts','reviews')
 OR v_state NOT IN('all','pending','approved','rejected','superseded_by_approval','ready','verified','unverified')
 OR (v_queue='claims' AND v_state NOT IN('all','pending','approved','rejected','superseded_by_approval'))
 OR (v_queue='verification' AND v_state NOT IN('all','ready','verified','unverified'))
 OR (v_queue IN('completeness','conflicts') AND v_state<>'all') OR(v_queue='reviews' AND v_state NOT IN('all','verified','unverified'))
 OR v_class NOT IN('all','production','test','internal','unclassified') OR length(v_city)>120 OR length(v_trade)>80 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
 v_scope:=md5(p_filters::text);
 IF p_after IS NOT NULL AND (jsonb_typeof(p_after)<>'object' OR p_after-ARRAY['scope','key']<>'{}' OR p_after->>'scope' IS DISTINCT FROM v_scope OR coalesce(p_after->>'key','') !~ '^(claim|artisan|review):[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 WITH pool AS MATERIALIZED (
 SELECT 'claim'::text type,c.id,'claim:'||c.id AS key,fixeo_private.control_row_v1('claim',c.id) summary,
  jsonb_build_object('queue','claims','artisan_relation',CASE WHEN a.id IS NOT NULL THEN 'FOUND' WHEN c.artisan_legacy_id IS NOT NULL THEN 'LEGACY_REFERENCE_REVIEW_REQUIRED' ELSE 'NOT_FOUND' END,'city',a.city,'service_category',a.service_category,'authority','approve_artisan_claim / reject_artisan_claim') facts,'public.claim_requests'::text source
 FROM public.claim_requests c LEFT JOIN public.artisans a ON a.id=c.artisan_id
 WHERE v_queue='claims' AND(v_state='all' OR c.status=v_state) AND(v_city IS NULL OR lower(a.city)=lower(v_city)) AND(v_trade IS NULL OR lower(a.service_category)=lower(v_trade))
 AND(v_class='all' OR a.data_classification=v_class OR(v_class='unclassified' AND a.id IS NOT NULL AND a.data_classification IS NULL))
 UNION ALL
 SELECT 'artisan',a.id,'artisan:'||a.id,fixeo_private.control_row_v1('artisan',a.id),fixeo_private.control_people_facts_v1('artisan',a.id)||jsonb_build_object('queue',v_queue,'authority','admin_verify_artisan_v1'),'public.artisans'
 FROM public.artisans a WHERE v_queue IN('verification','completeness','conflicts')
 AND(v_city IS NULL OR lower(a.city)=lower(v_city)) AND(v_trade IS NULL OR lower(a.service_category)=lower(v_trade))
 AND(v_class='all' OR a.data_classification=v_class OR(v_class='unclassified' AND a.data_classification IS NULL))
 AND CASE v_queue WHEN 'verification' THEN v_state='all' OR(v_state='ready' AND a.claimed IS TRUE AND a.owner_user_id IS NOT NULL AND a.onboarding_completed IS TRUE AND a.verified IS DISTINCT FROM true) OR(v_state='verified' AND a.verified IS TRUE) OR(v_state='unverified' AND a.verified IS DISTINCT FROM true)
 WHEN 'completeness' THEN nullif(btrim(a.full_name),'') IS NULL OR nullif(btrim(a.phone),'') IS NULL OR nullif(btrim(a.city),'') IS NULL OR nullif(btrim(a.service_category),'') IS NULL OR nullif(btrim(a.description),'') IS NULL OR nullif(btrim(a.photo_url),'') IS NULL
 ELSE a.verified IS DISTINCT FROM a.is_verified OR(a.claimed IS TRUE AND a.owner_user_id IS NULL) OR(a.claimed IS FALSE AND a.owner_user_id IS NOT NULL) END
 UNION ALL
 SELECT 'mission',v.mission_id,'review:'||v.id,fixeo_private.control_row_v1('mission',v.mission_id),
 jsonb_build_object('queue','reviews','review_id',v.id,'rating',v.rating,'verified',v.verified,'created_at',v.created_at,'artisan_id',v.artisan_id,'mission_relation',CASE WHEN m.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END,'authority',NULL),'public.reviews'
 FROM public.reviews v LEFT JOIN public.missions m ON m.id=v.mission_id LEFT JOIN public.artisans a ON a.id=v.artisan_id
 WHERE v_queue='reviews' AND(v_state='all' OR(v_state='verified' AND v.verified) OR(v_state='unverified' AND NOT v.verified))
 AND(v_city IS NULL OR lower(a.city)=lower(v_city)) AND(v_trade IS NULL OR lower(a.service_category)=lower(v_trade))
 AND(v_class='all' OR a.data_classification=v_class OR(v_class='unclassified' AND a.id IS NOT NULL AND a.data_classification IS NULL))
 ), page AS (SELECT * FROM pool WHERE p_after IS NULL OR key>p_after->>'key' ORDER BY key LIMIT p_limit+1)
 SELECT (SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY key) FROM page),'[]') INTO v_total,v_items;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'total_kind',CASE WHEN v_queue='reviews' THEN 'review_rows' ELSE 'distinct_canonical_objects' END,'queue',v_queue,'has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN jsonb_build_object('scope',v_scope,'key',v_items->(p_limit-1)->>'key') END,'as_of',now(),'source_state','FRESH','source','Trust canonical register');
END $$;

CREATE FUNCTION public.control_trust_context_v1(p_type text,p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.claim_requests;v_a public.artisans;v_facts jsonb:='{}';v_items jsonb;v_total bigint;v_n integer;v_candidates bigint;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_type IS NULL OR p_type NOT IN('artisan','claim','mission') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF fixeo_private.control_row_v1(p_type,p_id) IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_type='claim' THEN
  SELECT * INTO v_c FROM public.claim_requests WHERE id=p_id;
  SELECT * INTO v_a FROM public.artisans WHERE id=v_c.artisan_id;
  IF v_a.id IS NULL AND v_c.artisan_legacy_id IS NOT NULL THEN
   SELECT count(*) INTO v_candidates FROM public.artisans WHERE id::text=v_c.artisan_legacy_id OR legacy_id=v_c.artisan_legacy_id;
   IF v_candidates=1 THEN SELECT * INTO v_a FROM public.artisans WHERE id::text=v_c.artisan_legacy_id OR legacy_id=v_c.artisan_legacy_id;END IF;
  END IF;
  v_facts:=jsonb_build_object('status',v_c.status,'requester_id',v_c.requester_user_id,'requester_exists',EXISTS(SELECT 1 FROM public.users WHERE id=v_c.requester_user_id),
   'requester_name',v_c.requester_name,'contact_provided',nullif(btrim(v_c.requester_phone),'') IS NOT NULL,'contact_verified',NULL,
   'artisan_id',v_a.id,'artisan_relation',CASE WHEN v_candidates>1 THEN 'AMBIGUOUS' WHEN v_a.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END,
   'ownership_conflict',CASE WHEN v_a.id IS NOT NULL THEN v_a.owner_user_id IS NOT NULL AND v_a.owner_user_id IS DISTINCT FROM v_c.requester_user_id END,
   'review_note',v_c.notes,'reviewed_at',v_c.reviewed_at,'authority','approve_artisan_claim / reject_artisan_claim','onboarding_private_payload','excluded');
 ELSE
  v_facts:=jsonb_build_object('review_semantics','Canonical recorded review flags, not proof of service quality or client identity','moderation_authority',NULL);
 END IF;
 WITH pool AS MATERIALIZED (
  SELECT v.id,v.mission_id,v.artisan_id,v.rating,v.verified,v.created_at,
    CASE WHEN m.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END mission_relation,
    CASE WHEN r.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END request_relation
  FROM public.reviews v LEFT JOIN public.missions m ON m.id=v.mission_id LEFT JOIN public.service_requests r ON r.id::text=m.request_id
  WHERE(p_type='artisan' AND v.artisan_id=p_id) OR(p_type='mission' AND v.mission_id=p_id)
 ), page AS(SELECT * FROM pool WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1)
 SELECT(SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page),'[]') INTO v_total,v_items;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('type',p_type,'id',p_id,'facts',v_facts,'reviews',v_items,'review_total',v_total,'has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN v_items->(p_limit-1)->>'id' END,'source','public.claim_requests / public.reviews','as_of',now(),'source_state','FRESH');
END $$;
REVOKE ALL ON FUNCTION public.control_trust_page_v1(jsonb,jsonb,integer),public.control_trust_context_v1(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_trust_page_v1(jsonb,jsonb,integer),public.control_trust_context_v1(text,uuid,uuid,integer) TO authenticated;

-- Minimal executed-command reasons; no arbitrary preview payload or before-image.
CREATE FUNCTION public.control_review_history_v1(p_type text,p_id uuid,p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_items jsonb;v_n integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_type IS NULL OR p_type NOT IN('artisan','claim','quote','mission','remittance') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF fixeo_private.control_row_v1(p_type,p_id) IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_after IS NOT NULL AND (jsonb_typeof(p_after)<>'object' OR p_after-ARRAY['type','id','key','at']<>'{}' OR p_after->>'type' IS DISTINCT FROM p_type OR p_after->>'id' IS DISTINCT FROM p_id::text OR p_after->>'at' IS NULL OR coalesce(p_after->>'key','') !~ '^[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY executed_at DESC,id DESC),'[]') INTO v_items FROM(
  SELECT a.id,a.actor_id,a.capability,a.executed_at,a.payload->>'reason' reason,a.correlation_id,a.idempotency_key,
   a.execution_result->>'audit_id' audit_id,a.execution_result->>'ok' succeeded,a.execution_result->>'code' refusal
  FROM fixeo_private.control_action_previews_v1 a
  WHERE a.executed_at IS NOT NULL AND a.capability IN('claim.approve','claim.reject','artisan.verify','quote.approve','quote.reject','mission.settle','finance.declare','finance.confirm','finance.cancel','finance.correct')
   AND ((p_type<>'remittance' AND a.target_id=p_id AND fixeo_private.control_action_type_v1(a.capability)=p_type)
    OR(p_type='remittance' AND a.capability LIKE 'finance.%' AND(a.payload->>'remittance_id'=p_id::text OR a.execution_result#>>'{result,id}'=p_id::text)))
   AND(p_after IS NULL OR(a.executed_at,a.id)<((p_after->>'at')::timestamptz,(p_after->>'key')::uuid))
  ORDER BY a.executed_at DESC,a.id DESC LIMIT p_limit+1
 ) x;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('items',v_items,'has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN jsonb_build_object('type',p_type,'id',p_id,'key',v_items->(p_limit-1)->>'id','at',v_items->(p_limit-1)->>'executed_at') END,'as_of',now(),'source','fixeo_private.control_action_previews_v1 (executed only)','source_state','FRESH');
END $$;
REVOKE ALL ON FUNCTION public.control_review_history_v1(text,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_review_history_v1(text,uuid,jsonb,integer) TO authenticated;

-- 5.3 QUOTE_REQUIRED needs the persisted binding produced by the existing authority.
CREATE FUNCTION fixeo_private.control_quote_requirement_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('state','QUOTE_REQUIRED','authority','create_diagnostic_quote_request_v1','source','diagnostic_sessions_v1.booking_context.kind + service_requests.idempotency_key','session_id',s.id)
 FROM public.service_requests r JOIN fixeo_private.diagnostic_sessions_v1 s ON s.service_request_id=r.id
 WHERE r.id=p_request_id AND r.pricing_offer_id IS NULL AND s.state='bound' AND s.booking_context->>'kind'='quote' AND r.idempotency_key='diagnostic-quote:'||s.id
 ORDER BY s.id LIMIT 1),jsonb_build_object('state','UNKNOWN','authority',NULL,'source','No persisted quote-requirement evidence'));
$$;
REVOKE ALL ON FUNCTION fixeo_private.control_quote_requirement_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_quotes_page_v1(p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_queue text:=coalesce(p_filters->>'queue','all');v_city text:=nullif(btrim(p_filters->>'city'),'');v_trade text:=nullif(btrim(p_filters->>'trade'),'');v_class text:=coalesce(p_filters->>'classification','all');v_scope text;v_items jsonb;v_total bigint;v_n integer;v_metrics jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['queue','city','trade','classification']<>'{}' OR EXISTS(SELECT 1 FROM jsonb_each(p_filters) WHERE jsonb_typeof(value) NOT IN('string','null'))
 OR v_queue NOT IN('all','review','presented','accepted','expired','quote_required','unqualified') OR v_class NOT IN('all','production','test','internal','unclassified') OR length(v_city)>120 OR length(v_trade)>80 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 v_scope:=md5(p_filters::text);
 IF p_after IS NOT NULL AND(jsonb_typeof(p_after)<>'object' OR p_after-ARRAY['scope','key']<>'{}' OR p_after->>'scope' IS DISTINCT FROM v_scope OR coalesce(p_after->>'key','') !~ '^(request|quote):[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 WITH requests AS MATERIALIZED(
 SELECT r.id,r.status,fixeo_private.control_quote_requirement_v1(r.id) requirement FROM public.service_requests r
 WHERE(v_city IS NULL OR lower(r.city)=lower(v_city)) AND(v_trade IS NULL OR lower(r.service_category)=lower(v_trade)) AND(v_class='all' OR r.data_classification=v_class OR(v_class='unclassified' AND r.data_classification IS NULL))
 ), qbase AS MATERIALIZED(
 SELECT q.id,q.request_id,q.status,q.review_status,q.quote_version,q.reviewed_version,q.presented_at,q.expires_at,r.city,r.service_category,
 CASE WHEN r.id IS NULL THEN 'NOT_FOUND' WHEN q.status='accepted' THEN 'ACCEPTED' WHEN q.status<>'pending' THEN 'NOT_ACTIVE'
 WHEN q.review_status IN('submitted','legacy_unreviewed') THEN 'FIXEO_REVIEW' WHEN q.review_status='rejected' THEN 'FIXEO_REJECTED'
 WHEN q.review_status='approved' AND q.reviewed_version=q.quote_version AND q.presented_at IS NOT NULL THEN CASE WHEN q.expires_at<=now() THEN 'EXPIRED' ELSE 'CLIENT_AVAILABLE' END ELSE 'UNKNOWN' END pipeline
 FROM public.quotes q LEFT JOIN public.service_requests r ON r.id=q.request_id
 WHERE(v_city IS NULL OR lower(r.city)=lower(v_city)) AND(v_trade IS NULL OR lower(r.service_category)=lower(v_trade)) AND(v_class='all' OR r.data_classification=v_class OR(v_class='unclassified' AND r.id IS NOT NULL AND r.data_classification IS NULL))
 ), pool AS MATERIALIZED(
 SELECT 'quote'::text type,q.id,'quote:'||q.id key,jsonb_build_object('pipeline',q.pipeline,'city',q.city,'service_category',q.service_category,'authority','review_marketplace_quote_v1 → accept_quote_v2','request_id',q.request_id) facts,'public.quotes'::text source
 FROM qbase q WHERE v_queue='all' OR(v_queue='review' AND q.pipeline='FIXEO_REVIEW') OR(v_queue='presented' AND q.pipeline='CLIENT_AVAILABLE') OR(v_queue='accepted' AND q.pipeline='ACCEPTED') OR(v_queue='expired' AND q.pipeline='EXPIRED')
 UNION ALL
 SELECT 'request',r.id,'request:'||r.id,jsonb_build_object('pipeline',r.requirement->>'state','requirement',r.requirement,'authority',r.requirement->>'authority'),'public.service_requests + diagnostic_sessions_v1 binding'
 FROM requests r WHERE r.status='new' AND NOT EXISTS(SELECT 1 FROM public.quotes q WHERE q.request_id=r.id)
 AND((v_queue='quote_required' AND r.requirement->>'state'='QUOTE_REQUIRED') OR(v_queue='unqualified' AND r.requirement->>'state'='UNKNOWN'))
 ), page AS(SELECT * FROM pool WHERE p_after IS NULL OR key>p_after->>'key' ORDER BY key LIMIT p_limit+1)
 SELECT(SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('summary',fixeo_private.control_row_v1(type,id)) ORDER BY key) FROM page),'[]'),
 jsonb_build_object('quotes',(SELECT count(*) FROM qbase),'review',(SELECT count(*) FROM qbase WHERE pipeline='FIXEO_REVIEW'),'accepted',(SELECT count(*) FROM qbase WHERE pipeline='ACCEPTED'),'quote_required',(SELECT count(*) FROM requests r WHERE status='new' AND requirement->>'state'='QUOTE_REQUIRED' AND NOT EXISTS(SELECT 1 FROM public.quotes q WHERE q.request_id=r.id))) INTO v_total,v_items,v_metrics;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'total_kind','distinct_canonical_objects','metrics',v_metrics,'metrics_scope','city/trade/classification; all pipeline stages','has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN jsonb_build_object('scope',v_scope,'key',v_items->(p_limit-1)->>'key') END,'as_of',now(),'source_state','FRESH','source','Canonical Marketplace quote pipeline');
END $$;

CREATE FUNCTION public.control_quote_context_v1(p_type text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_q public.quotes;v_r public.service_requests;v_id uuid;v_facts jsonb;v_missions jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_type IS NULL OR p_type NOT IN('request','quote') THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF fixeo_private.control_row_v1(p_type,p_id) IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_type='quote' THEN SELECT * INTO v_q FROM public.quotes WHERE id=p_id;v_id:=v_q.request_id;ELSE v_id:=p_id;END IF;
 SELECT * INTO v_r FROM public.service_requests WHERE id=v_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'accepted_quote_version',m.accepted_quote_version,'request_relation',CASE WHEN v_r.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END) ORDER BY m.id),'[]') INTO v_missions FROM public.missions m WHERE p_type='quote' AND m.accepted_quote_id=p_id;
 v_facts:=jsonb_build_object('request_relation',CASE WHEN v_r.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END,'request_status',v_r.status,'requirement',fixeo_private.control_quote_requirement_v1(v_id),'registered_client',CASE WHEN v_r.id IS NOT NULL THEN v_r.client_profile_id IS NOT NULL END,
 'review_reason',v_q.review_reason,'reviewed_by',v_q.reviewed_by,'reviewed_at',v_q.reviewed_at,'reviewed_version',v_q.reviewed_version,
 'expiration_state',CASE WHEN p_type='request' THEN NULL WHEN v_q.expires_at IS NULL THEN 'NO_EXPIRY_SET' WHEN v_q.expires_at<=now() THEN 'EXPIRED' ELSE 'NOT_EXPIRED' END,
 'authority',CASE WHEN p_type='quote' THEN 'submit_artisan_quote_v2 → review_marketplace_quote_v1 → accept_quote_v2' END);
 RETURN jsonb_build_object('type',p_type,'id',p_id,'facts',v_facts,'accepted_missions',v_missions,'as_of',now(),'source_state','FRESH','source','public.quotes / public.service_requests / public.missions / persisted diagnostic binding');
END $$;
REVOKE ALL ON FUNCTION public.control_quotes_page_v1(jsonb,jsonb,integer),public.control_quote_context_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_quotes_page_v1(jsonb,jsonb,integer),public.control_quote_context_v1(text,uuid) TO authenticated;

-- 5.4 Financial facts use mission prices and the canonical remittance ledger.
CREATE FUNCTION fixeo_private.control_finance_facts_v1(p_mission_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions;r public.service_requests;v_paid numeric;v_declared bigint;v_due boolean;v_state text;v_expected numeric;v_balance numeric;
BEGIN
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 SELECT coalesce(sum(amount) FILTER(WHERE status='confirmed'),0),count(*) FILTER(WHERE status='declared') INTO v_paid,v_declared FROM public.commission_remittances_v1 WHERE mission_id=m.id;
 v_due:=r.id IS NOT NULL AND((m.status='done' AND r.status IN('completed','validated')) OR(m.status='validated' AND r.status='validated' AND m.completed_at IS NOT NULL));
 IF m.status='pending' AND r.status IN('assigned','in_progress') THEN v_expected:=m.commission_amount;END IF;
 IF v_due AND m.final_price IS NOT NULL AND m.commission_amount IS NOT NULL THEN v_balance:=m.commission_amount-v_paid;END IF;
 v_state:=CASE WHEN r.id IS NULL THEN 'UNKNOWN' WHEN m.status='validated' AND m.completed_at IS NULL THEN 'INTEGRITY_REVIEW'
 WHEN v_due AND m.final_price IS NULL THEN 'PRICE_REQUIRED' WHEN v_due AND m.commission_amount IS NULL THEN 'AMOUNT_UNKNOWN'
 WHEN v_due AND v_balance<0 THEN 'OVERPAID' WHEN v_due AND v_declared>0 THEN 'DECLARED' WHEN v_due AND v_balance>0 THEN 'DUE' WHEN v_due AND v_balance=0 THEN 'RECONCILED'
 WHEN m.status='pending' AND r.status IN('assigned','in_progress') THEN CASE WHEN v_expected IS NULL THEN 'AMOUNT_UNKNOWN' ELSE 'EXPECTED' END ELSE 'NOT_DUE' END;
 RETURN jsonb_build_object('finance_state',v_state,'request_relation',CASE WHEN r.id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END,'request_status',r.status,
 'expected_commission',v_expected,'due_gross',CASE WHEN v_balance IS NOT NULL THEN m.commission_amount END,'confirmed_recorded',v_paid,'due_balance',v_balance,'declared_remittances',v_declared,
 'can_declare',v_balance IS NOT NULL AND v_balance>0,'can_reconcile',v_balance IS NOT NULL,
 'payments_count',(SELECT count(*) FROM public.payments WHERE mission_id=m.id),'payments_nature','UNKNOWN — not commission evidence',
 'source','public.missions + public.service_requests + public.commission_remittances_v1','authority','admin_settle_mission_v1 / admin_commission_remittance_v1');
END $$;
REVOKE ALL ON FUNCTION fixeo_private.control_finance_facts_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.control_finance_page_v1(p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_queue text:=coalesce(p_filters->>'queue','all');v_city text:=nullif(btrim(p_filters->>'city'),'');v_trade text:=nullif(btrim(p_filters->>'trade'),'');v_class text:=coalesce(p_filters->>'classification','all');v_eid uuid;v_sid uuid;v_scope text;v_items jsonb;v_total bigint;v_n integer;v_metrics jsonb;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['queue','city','trade','classification','enterprise_id','site_id']<>'{}' OR EXISTS(SELECT 1 FROM jsonb_each(p_filters) WHERE jsonb_typeof(value) NOT IN('string','null'))
 OR v_queue NOT IN('all','expected','price_required','due','declared','reconciled','attention') OR v_class NOT IN('all','production','test','internal','unclassified') OR length(v_city)>120 OR length(v_trade)>80 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 v_eid:=nullif(p_filters->>'enterprise_id','')::uuid;v_sid:=nullif(p_filters->>'site_id','')::uuid;
 IF v_eid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_accounts WHERE id=v_eid) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF v_sid IS NOT NULL AND(v_eid IS NULL OR NOT EXISTS(SELECT 1 FROM public.enterprise_sites WHERE id=v_sid AND enterprise_id=v_eid)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 v_scope:=md5(p_filters::text);
 IF p_after IS NOT NULL AND(jsonb_typeof(p_after)<>'object' OR p_after-ARRAY['scope','key']<>'{}' OR p_after->>'scope' IS DISTINCT FROM v_scope OR coalesce(p_after->>'key','') !~ '^mission:[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 WITH base AS MATERIALIZED(
 SELECT m.id,fixeo_private.control_finance_facts_v1(m.id) facts FROM public.missions m LEFT JOIN public.service_requests r ON r.id::text=m.request_id LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id
 WHERE(v_city IS NULL OR lower(r.city)=lower(v_city)) AND(v_trade IS NULL OR lower(r.service_category)=lower(v_trade)) AND(v_eid IS NULL OR e.enterprise_id=v_eid) AND(v_sid IS NULL OR e.site_id=v_sid)
 AND(v_class='all' OR r.data_classification=v_class OR(v_class='unclassified' AND r.id IS NOT NULL AND r.data_classification IS NULL))
 ), pool AS MATERIALIZED(
 SELECT 'mission'::text type,id,'mission:'||id key,facts FROM base WHERE v_queue='all' OR(v_queue='attention' AND facts->>'finance_state' IN('UNKNOWN','INTEGRITY_REVIEW','AMOUNT_UNKNOWN','OVERPAID')) OR lower(facts->>'finance_state')=v_queue
 ), page AS(SELECT * FROM pool WHERE p_after IS NULL OR key>p_after->>'key' ORDER BY key LIMIT p_limit+1)
 SELECT(SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('summary',fixeo_private.control_row_v1('mission',id),'source','Canonical financial case') ORDER BY key) FROM page),'[]'),
 (SELECT jsonb_build_object('expected',CASE WHEN count(*) FILTER(WHERE facts->>'finance_state' IN('UNKNOWN','AMOUNT_UNKNOWN'))>0 THEN NULL ELSE coalesce(sum((facts->>'expected_commission')::numeric),0) END,
 'due',CASE WHEN count(*) FILTER(WHERE facts->>'finance_state' IN('UNKNOWN','INTEGRITY_REVIEW','PRICE_REQUIRED','AMOUNT_UNKNOWN'))>0 THEN NULL ELSE coalesce(sum((facts->>'due_balance')::numeric),0) END,
 'known_due',coalesce(sum((facts->>'due_balance')::numeric),0),'confirmed_recorded',coalesce(sum((facts->>'confirmed_recorded')::numeric),0),
 'price_missing',count(*) FILTER(WHERE facts->>'finance_state'='PRICE_REQUIRED'),'unknown_cases',count(*) FILTER(WHERE facts->>'finance_state' IN('UNKNOWN','INTEGRITY_REVIEW','AMOUNT_UNKNOWN')),'missions',count(*)) FROM base) INTO v_total,v_items,v_metrics;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'total_kind','distinct_missions','metrics',v_metrics,'metrics_scope','city/trade/classification/Enterprise; all financial states','has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN jsonb_build_object('scope',v_scope,'key',v_items->(p_limit-1)->>'key') END,'as_of',now(),'source_state','FRESH','source','Canonical mission prices and commission remittances; payments not summed');
END $$;

CREATE FUNCTION public.control_finance_context_v1(p_type text,p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_mid uuid;v_selected jsonb;v_items jsonb;v_total bigint;v_n integer;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();
 IF p_type IS NULL OR p_type NOT IN('mission','remittance') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF fixeo_private.control_row_v1(p_type,p_id) IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_type='mission' THEN v_mid:=p_id;ELSE SELECT mission_id INTO v_mid FROM public.commission_remittances_v1 WHERE id=p_id;END IF;
 WITH pool AS MATERIALIZED(
 SELECT id,mission_id,amount,currency,method,status,version,proof_reference,declared_by,confirmed_by,created_at,confirmed_at,cancelled_at,supersedes_id FROM public.commission_remittances_v1 WHERE mission_id=v_mid
 ), page AS(SELECT * FROM pool WHERE p_after IS NULL OR id>p_after ORDER BY id LIMIT p_limit+1)
 SELECT(SELECT count(*) FROM pool),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page),'[]'),(SELECT to_jsonb(pool) FROM pool WHERE p_type='remittance' AND id=p_id) INTO v_total,v_items,v_selected;
 v_n:=jsonb_array_length(v_items);IF v_n>p_limit THEN v_items:=v_items-(v_n-1);END IF;
 RETURN jsonb_build_object('type',p_type,'id',p_id,'mission_id',v_mid,'facts',fixeo_private.control_finance_facts_v1(v_mid),'selected',v_selected,'remittances',v_items,'remittance_total',v_total,'has_more',v_n>p_limit,'next_cursor',CASE WHEN v_n>p_limit THEN v_items->(p_limit-1)->>'id' END,'as_of',now(),'source_state','FRESH','source','public.commission_remittances_v1 / canonical mission case','private_business','excluded');
END $$;
REVOKE ALL ON FUNCTION public.control_finance_page_v1(jsonb,jsonb,integer),public.control_finance_context_v1(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_finance_page_v1(jsonb,jsonb,integer),public.control_finance_context_v1(text,uuid,uuid,integer) TO authenticated;

REVOKE ALL ON FUNCTION public.control_people_page_v1(jsonb,jsonb,integer),public.control_people_context_v1(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_people_page_v1(jsonb,jsonb,integer),public.control_people_context_v1(text,uuid,uuid,integer) TO authenticated;
COMMIT;
