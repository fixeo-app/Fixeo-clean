-- Bloc 2: additive, read-only Admin observations. No authority/table/policy changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.control_rafi_source_v1(p_source text, p_classification text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE observations jsonb; total bigint; page_limit integer := 200;
BEGIN
  PERFORM fixeo_private.control_require_admin_v1();
  IF p_classification IS NULL OR p_classification NOT IN ('all','production','test','internal','unclassified') THEN
    RAISE EXCEPTION 'INVALID_CLASSIFICATION';
  END IF;
  CASE p_source
  WHEN 'operations' THEN
    WITH requests AS MATERIALIZED (
      SELECT r.*, e.enterprise_id, e.site_id FROM public.service_requests r
      LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id
      WHERE p_classification='all' OR r.data_classification=p_classification
        OR (p_classification='unclassified' AND r.data_classification IS NULL)
    ), observed AS (
      SELECT 'request.waiting' kind, 'request' target_type, r.id target_id, r.city, r.service_category,
        r.created_at, 1::bigint count, r.enterprise_id, r.site_id,
        jsonb_build_object('status',r.status,'urgency',r.urgency) facts,
        'public.service_requests + public.missions + public.enterprise_internal_assignments' reference,
        CASE WHEN r.urgency IN ('now','urgent') THEN 0 ELSE 3 END sort_order
      FROM requests r WHERE r.status IN ('new','no_match')
        AND NOT EXISTS (SELECT 1 FROM public.missions m WHERE m.request_id=r.id::text AND m.status IN ('pending','done','validated') AND m.accepted_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.enterprise_internal_assignments i WHERE i.service_request_id=r.id AND i.status IN ('assigned','in_progress','completed','validated'))
      UNION ALL
      SELECT CASE WHEN r.id IS NULL OR (m.status='validated' AND r.status<>'validated') THEN 'mission.inconsistent' ELSE 'mission.aging' END,
        'mission', m.id, r.city, r.service_category, coalesce(m.started_at,m.accepted_at,m.created_at), 1, r.enterprise_id, r.site_id,
        jsonb_build_object('status',m.status,'request_status',r.status,'request_id',m.request_id),
        'public.missions + public.service_requests', 1
      FROM public.missions m LEFT JOIN requests r ON r.id::text=m.request_id
      WHERE (p_classification='all' OR r.id IS NOT NULL) AND
        (NOT EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id::text=m.request_id)
        OR (m.status='validated' AND r.status<>'validated')
        OR (m.status='pending' AND m.accepted_at IS NOT NULL AND r.status IN ('assigned','in_progress')
          AND coalesce(m.started_at,m.accepted_at,m.created_at)<=now()-interval '24 hours'))
      UNION ALL
      SELECT 'quote.review','quote',q.id,r.city,r.service_category,q.submitted_at,1,r.enterprise_id,r.site_id,
        jsonb_build_object('quote_version',q.quote_version,'review_status',q.review_status,'request_id',q.request_id),
        'public.quotes',2
      FROM public.quotes q JOIN requests r ON r.id=q.request_id WHERE q.review_status='submitted' AND q.status NOT IN ('accepted','rejected','expired')
      UNION ALL
      SELECT 'dispatch.failed','request',r.id,r.city,r.service_category,min(d.created_at),count(*),r.enterprise_id,r.site_id,
        jsonb_build_object('attempt_count',sum(d.attempt_count),'status','failed'),
        'public.dispatch_notification_outbox',1
      FROM public.dispatch_notification_outbox d JOIN requests r ON r.id=d.request_id
      WHERE lower(d.notification_status)='failed' AND r.status IN ('new','no_match','assigned','in_progress')
      GROUP BY r.id,r.city,r.service_category,r.enterprise_id,r.site_id
    ), page AS (SELECT * FROM observed ORDER BY sort_order,created_at NULLS LAST,target_id,kind LIMIT page_limit)
    SELECT (SELECT count(*) FROM observed), coalesce(jsonb_agg(to_jsonb(page)-'sort_order' ORDER BY sort_order,created_at NULLS LAST,target_id,kind),'[]')
    INTO total,observations FROM page;

  WHEN 'network' THEN
    page_limit := 100;
    WITH waiting AS MATERIALIZED (
      SELECT r.id,r.city,r.service_category,r.urgency,r.created_at
      FROM public.service_requests r WHERE r.status IN ('new','no_match')
        AND (p_classification='all' OR r.data_classification=p_classification OR (p_classification='unclassified' AND r.data_classification IS NULL))
        AND NOT EXISTS (SELECT 1 FROM public.missions m WHERE m.request_id=r.id::text AND m.status IN ('pending','done','validated') AND m.accepted_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.enterprise_internal_assignments i WHERE i.service_request_id=r.id AND i.status IN ('assigned','in_progress','completed','validated'))
    ), cohorts AS (
      SELECT city,service_category,count(*) demand_count,min(created_at) oldest,
        count(*) FILTER (WHERE urgency IN ('now','urgent')) urgent_count,
        (array_agg(id ORDER BY created_at NULLS LAST,id))[1:5] sample_ids
      FROM waiting GROUP BY city,service_category
    ), profiles AS MATERIALIZED (
      SELECT a.id,a.availability,a.claimed,a.owner_user_id,a.onboarding_completed,a.verified,
        ARRAY(SELECT DISTINCT lower(trim(v)) FROM (SELECT a.city v UNION ALL SELECT c.city FROM public.artisan_service_cities c WHERE c.artisan_id=a.id) cs WHERE nullif(trim(v),'') IS NOT NULL) cities,
        ARRAY(SELECT DISTINCT lower(trim(v)) FROM (SELECT a.service_category v UNION ALL SELECT s.service_category FROM public.artisan_service_categories s WHERE s.artisan_id=a.id) ss WHERE nullif(trim(v),'') IS NOT NULL) trades
      FROM public.artisans a WHERE p_classification='all' OR a.data_classification=p_classification OR (p_classification='unclassified' AND a.data_classification IS NULL)
    ), observed AS (
      SELECT 'network.cohort' kind,'cohort' target_type,NULL::uuid target_id,c.city,c.service_category,c.oldest created_at,
        c.demand_count count,c.sample_ids,
        jsonb_build_object('profiles',count(a.id),'available_profiles',count(a.id) FILTER (WHERE a.availability='available'),
          'to_verify',count(a.id) FILTER (WHERE a.claimed AND a.owner_user_id IS NOT NULL AND a.onboarding_completed AND a.verified IS DISTINCT FROM true),
          'unclaimed',count(a.id) FILTER (WHERE a.claimed=false AND a.owner_user_id IS NULL),
          'verify_ids',(array_agg(a.id ORDER BY a.id) FILTER (WHERE a.claimed AND a.owner_user_id IS NOT NULL AND a.onboarding_completed AND a.verified IS DISTINCT FROM true))[1:5],
          'claim_ids',(array_agg(a.id ORDER BY a.id) FILTER (WHERE a.claimed=false AND a.owner_user_id IS NULL))[1:5],
          'urgent_count',c.urgent_count,'total_waiting',(SELECT count(*) FROM waiting),
          'match_basis','exact_declared_city_trade','eligibility','final_check_in_dispatch',
          'location_known',nullif(trim(c.city),'') IS NOT NULL AND nullif(trim(c.service_category),'') IS NOT NULL) facts,
        'public.service_requests + public.artisans + public.artisan_service_categories + public.artisan_service_cities' reference,
        c.urgent_count sort_order
      FROM cohorts c LEFT JOIN profiles a ON lower(trim(c.city))=ANY(a.cities) AND lower(trim(c.service_category))=ANY(a.trades)
      GROUP BY c.city,c.service_category,c.oldest,c.demand_count,c.sample_ids,c.urgent_count
    ), page AS (SELECT * FROM observed ORDER BY sort_order DESC,created_at NULLS LAST,city,service_category LIMIT page_limit)
    SELECT (SELECT count(*) FROM observed),coalesce(jsonb_agg(to_jsonb(page)-'sort_order' ORDER BY sort_order DESC,created_at NULLS LAST,city,service_category),'[]')
    INTO total,observations FROM page;

  WHEN 'trust' THEN
    WITH observed AS (
      SELECT 'claim.pending' kind,'claim' target_type,c.id target_id,a.city,a.service_category,c.created_at,1::bigint count,
        jsonb_build_object('status',c.status,'artisan_id',c.artisan_id,'requester_present',c.requester_user_id IS NOT NULL) facts,
        'public.claim_requests' reference
      FROM public.claim_requests c LEFT JOIN public.artisans a ON a.id=c.artisan_id
      WHERE c.status='pending' AND (p_classification='all' OR a.data_classification=p_classification OR (p_classification='unclassified' AND a.data_classification IS NULL))
      UNION ALL
      SELECT 'artisan.verification_conflict','artisan',a.id,a.city,a.service_category,a.created_at,1,
        jsonb_build_object('verified',a.verified,'is_verified',a.is_verified),'public.artisans'
      FROM public.artisans a WHERE a.verified IS DISTINCT FROM a.is_verified
        AND (p_classification='all' OR a.data_classification=p_classification OR (p_classification='unclassified' AND a.data_classification IS NULL))
    ), page AS (SELECT * FROM observed ORDER BY created_at NULLS LAST,target_id LIMIT page_limit)
    SELECT (SELECT count(*) FROM observed),coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at NULLS LAST,target_id),'[]') INTO total,observations FROM page;

  WHEN 'finance' THEN
    WITH missions AS MATERIALIZED (
      SELECT m.*,r.city,r.service_category,r.status request_status FROM public.missions m
      JOIN public.service_requests r ON r.id::text=m.request_id
      WHERE p_classification='all' OR r.data_classification=p_classification OR (p_classification='unclassified' AND r.data_classification IS NULL)
    ), observed AS (
      SELECT 'finance.price_missing' kind,'mission' target_type,m.id target_id,m.city,m.service_category,m.completed_at created_at,1::bigint count,
        jsonb_build_object('status',m.status,'final_price',m.final_price) facts,'public.missions' reference
      FROM missions m WHERE m.final_price IS NULL AND ((m.status='done' AND m.request_status IN ('completed','validated')) OR (m.status='validated' AND m.request_status='validated' AND m.completed_at IS NOT NULL))
      UNION ALL
      SELECT 'finance.declared','remittance',x.id,m.city,m.service_category,x.created_at,1,
        jsonb_build_object('mission_id',m.id,'amount',x.amount,'version',x.version,'status',x.status),'public.commission_remittances_v1'
      FROM public.commission_remittances_v1 x JOIN missions m ON m.id=x.mission_id WHERE x.status='declared'
      UNION ALL
      SELECT 'finance.overpaid','mission',m.id,m.city,m.service_category,m.completed_at,1,
        jsonb_build_object('commission_amount',m.commission_amount,'confirmed',sum(x.amount)),'public.commission_remittances_v1 + public.missions'
      FROM missions m JOIN public.commission_remittances_v1 x ON x.mission_id=m.id AND x.status='confirmed'
      GROUP BY m.id,m.city,m.service_category,m.completed_at,m.commission_amount HAVING sum(x.amount)>m.commission_amount
    ), page AS (SELECT * FROM observed ORDER BY (kind='finance.overpaid') DESC,created_at NULLS LAST,target_id LIMIT page_limit)
    SELECT (SELECT count(*) FROM observed),coalesce(jsonb_agg(to_jsonb(page) ORDER BY (kind='finance.overpaid') DESC,created_at NULLS LAST,target_id),'[]') INTO total,observations FROM page;

  WHEN 'enterprise' THEN
    WITH observed AS (
      SELECT 'enterprise.request' kind,'request' target_type,r.id target_id,r.city,r.service_category,r.created_at,1::bigint count,e.enterprise_id,e.site_id,
        jsonb_build_object('urgency',r.urgency,'request_status',r.status,'mode',h.mode,'status',h.status,'fallback_due_at',h.fallback_due_at,
          'sla',public.enterprise_request_sla_facts_v1(r.id),
          'valid_internal_offers',(SELECT count(*) FROM public.enterprise_internal_dispatch_offers o WHERE o.service_request_id=r.id AND o.enterprise_id=e.enterprise_id AND o.status='offered' AND o.expires_at>now())) facts,
        'public.enterprise_request_context + public.enterprise_request_sla_facts_v1 + public.enterprise_hybrid_dispatch_state + public.enterprise_internal_dispatch_offers' reference
      FROM public.service_requests r JOIN public.enterprise_request_context e ON e.service_request_id=r.id
      LEFT JOIN public.enterprise_hybrid_dispatch_state h ON h.service_request_id=r.id AND h.enterprise_id=e.enterprise_id
      WHERE r.status IN ('new','no_match','assigned','in_progress')
        AND fixeo_private._fixeo_can_access_enterprise_site(e.enterprise_id,e.site_id)
        AND (p_classification='all' OR r.data_classification=p_classification OR (p_classification='unclassified' AND r.data_classification IS NULL))
    ), page AS (SELECT * FROM observed ORDER BY created_at NULLS LAST,target_id LIMIT page_limit)
    SELECT (SELECT count(*) FROM observed),coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at NULLS LAST,target_id),'[]') INTO total,observations FROM page;
  ELSE RAISE EXCEPTION 'INVALID_SOURCE';
  END CASE;
  RETURN jsonb_build_object('contract_version','rafi-observations-v1','source',p_source,'as_of',now(),'classification',p_classification,
    'observations',observations,'total_observations',total,'observation_limit',page_limit,'has_more',total>page_limit,
    'completeness',CASE WHEN total>page_limit THEN 'partial' ELSE 'complete' END,'pii','excluded','private_business','excluded');
END $$;

CREATE FUNCTION public.control_rafi_dispatch_read_v1(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.service_requests; candidates jsonb;
BEGIN
  PERFORM fixeo_private.control_require_admin_v1();
  SELECT * INTO r FROM public.service_requests WHERE id=p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status<>'new' THEN RAISE EXCEPTION 'REQUEST_NOT_DISPATCHABLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.enterprise_request_context WHERE service_request_id=r.id) THEN RAISE EXCEPTION 'ENTERPRISE_DELEGATION_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.artisan_id,'rank',d.match_rank,'city',d.artisan_city,'service_category',d.artisan_category,
    'score',d.final_score,'claimed',d.claimed) ORDER BY d.match_rank),'[]') INTO candidates FROM public.dispatch_preview_v22(r.id,50) d;
  RETURN jsonb_build_object('request_id',r.id,'as_of',now(),'authority','Dispatch','source','dispatch_preview_v22','candidates',candidates,
    'candidate_limit',50,'completeness','bounded_candidates','execution_authorized',false,'requires_canonical_preview',true);
END $$;

CREATE FUNCTION public.control_rafi_network_list_v1(p_city text, p_trade text, p_state text DEFAULT 'all', p_classification text DEFAULT 'all', p_after uuid DEFAULT NULL, p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE items jsonb; more boolean; cursor_id uuid;
BEGIN
  PERFORM fixeo_private.control_require_admin_v1();
  IF p_city IS NULL OR length(trim(p_city)) NOT BETWEEN 1 AND 120 OR p_trade IS NULL OR length(trim(p_trade)) NOT BETWEEN 1 AND 80
    OR p_state IS NULL OR p_state NOT IN ('all','available','unverified','unclaimed') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_classification IS NULL OR p_classification NOT IN ('all','production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_FILTER'; END IF;
  WITH selected AS (
    SELECT a.id FROM public.artisans a WHERE (p_after IS NULL OR a.id>p_after)
      AND (lower(trim(a.city))=lower(trim(p_city)) OR EXISTS (SELECT 1 FROM public.artisan_service_cities c WHERE c.artisan_id=a.id AND lower(trim(c.city))=lower(trim(p_city))))
      AND (lower(trim(a.service_category))=lower(trim(p_trade)) OR EXISTS (SELECT 1 FROM public.artisan_service_categories s WHERE s.artisan_id=a.id AND lower(trim(s.service_category))=lower(trim(p_trade))))
      AND (p_state='all' OR (p_state='available' AND a.availability='available')
        OR (p_state='unverified' AND a.claimed AND a.owner_user_id IS NOT NULL AND a.onboarding_completed AND a.verified IS DISTINCT FROM true)
        OR (p_state='unclaimed' AND a.claimed=false AND a.owner_user_id IS NULL))
      AND (p_classification='all' OR a.data_classification=p_classification OR (p_classification='unclassified' AND a.data_classification IS NULL))
    ORDER BY a.id LIMIT p_limit+1
  ), page AS (SELECT id FROM selected ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(fixeo_private.control_row_v1('artisan',id) ORDER BY id) FROM page),'[]'),
    (SELECT count(*)>p_limit FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1) INTO items,more,cursor_id;
  RETURN jsonb_build_object('items',items,'has_more',more,'next_cursor',CASE WHEN more THEN cursor_id END,'as_of',now(),'completeness','page','classification',p_classification);
END $$;

REVOKE ALL ON FUNCTION public.control_rafi_network_list_v1(text,text,text,text,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_rafi_network_list_v1(text,text,text,text,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.control_rafi_source_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.control_rafi_dispatch_read_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_rafi_source_v1(text,text),public.control_rafi_dispatch_read_v1(uuid) TO authenticated;
COMMENT ON FUNCTION public.control_rafi_source_v1(text,text) IS 'RAFI read-only observations. Admin role required, minimal global supervision, no business mutation.';
NOTIFY pgrst, 'reload schema';
COMMIT;
