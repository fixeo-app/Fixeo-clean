-- Bloc 6.1: read-only intelligence; no business authority, table or policy change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION fixeo_private.control_marketplace_dimension_v1(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT nullif(translate(lower(btrim(p_value)),'éèêëàâäôöùûüïîç','eeeeaaaoouuuiic'),'')
$$;

CREATE FUNCTION fixeo_private.control_marketplace_scope_v1(p_filters jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE f date;t date;c text;cl text;eid uuid;sid uuid;h integer;
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE k NOT IN('from','to','city','trade','classification','enterprise_id','site_id','horizon_hours')) THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_filters) e WHERE jsonb_typeof(value) NOT IN('string','null','number')) THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF (p_filters->>'from' IS NOT NULL AND p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$') OR(p_filters->>'to' IS NOT NULL AND p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'INVALID_WINDOW';END IF;
 t:=coalesce((p_filters->>'to')::date,(now() AT TIME ZONE 'Africa/Casablanca')::date);
 f:=coalesce((p_filters->>'from')::date,t-30);
 IF t<=f OR t-f>90 OR t>(now() AT TIME ZONE 'Africa/Casablanca')::date OR f<date '2020-01-01' THEN RAISE EXCEPTION 'INVALID_WINDOW';END IF;
 cl:=coalesce(p_filters->>'classification','all');IF cl NOT IN('all','production','test','internal','unclassified') THEN RAISE EXCEPTION 'INVALID_CLASSIFICATION';END IF;
 IF length(coalesce(p_filters->>'city',''))>120 OR length(coalesce(p_filters->>'trade',''))>80 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF p_filters->>'trade' IS NOT NULL AND p_filters->>'trade'<>'__unknown__' AND public.normalize_service_category_v1(p_filters->>'trade') IS NULL THEN RAISE EXCEPTION 'INVALID_TRADE';END IF;
 h:=coalesce((p_filters->>'horizon_hours')::integer,24);IF h NOT IN(1,24,72,168) THEN RAISE EXCEPTION 'INVALID_HORIZON';END IF;
 eid:=(p_filters->>'enterprise_id')::uuid;sid:=(p_filters->>'site_id')::uuid;
 IF eid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_accounts WHERE id=eid) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enterprise_sites WHERE id=sid AND(eid IS NULL OR enterprise_id=eid)) THEN RAISE EXCEPTION 'INVALID_TENANT_CONTEXT';END IF;
 RETURN jsonb_build_object('from',f,'to',t,'previous_from',f-(t-f),'days',t-f,
 'from_utc',f::timestamp AT TIME ZONE 'Africa/Casablanca','to_utc',t::timestamp AT TIME ZONE 'Africa/Casablanca',
 'previous_from_utc',(f-(t-f))::timestamp AT TIME ZONE 'Africa/Casablanca','timezone','Africa/Casablanca','horizon_hours',h,
 'city',fixeo_private.control_marketplace_dimension_v1(p_filters->>'city'),
 'trade',CASE WHEN p_filters->>'trade'='__unknown__' THEN '__unknown__' ELSE fixeo_private.control_marketplace_dimension_v1(public.normalize_service_category_v1(p_filters->>'trade')) END,
 'classification',cl,'enterprise_id',eid,'site_id',sid,'scope','Admin Marketplace supervision; private Artisan Business excluded');
END $$;

-- One row per real request. No join can multiply the request denominator.
CREATE FUNCTION fixeo_private.control_marketplace_requests_v1(p_scope jsonb)
RETURNS TABLE(id uuid,city text,trade text,raw_city text,raw_trade text,status text,urgency text,created_at timestamptz,
 enterprise_id uuid,site_id uuid,origin text,external_at timestamptz,internal_at timestamptz,accepted_at timestamptz,acceptance_quality text,
 waiting boolean,offers bigint,dispatch_failures bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH base AS (
 SELECT r.*,fixeo_private.control_marketplace_dimension_v1(r.city) city_key,
 fixeo_private.control_marketplace_dimension_v1(public.resolve_service_category_v1(r.service_category,r.description)) trade_key,
 e.enterprise_id,e.site_id FROM public.service_requests r LEFT JOIN public.enterprise_request_context e ON e.service_request_id=r.id
 WHERE(p_scope->>'classification'='all' OR r.data_classification=p_scope->>'classification' OR(p_scope->>'classification'='unclassified' AND r.data_classification IS NULL))
 AND(p_scope->>'enterprise_id' IS NULL OR e.enterprise_id=(p_scope->>'enterprise_id')::uuid)
 AND(p_scope->>'site_id' IS NULL OR e.site_id=(p_scope->>'site_id')::uuid)
 AND(e.enterprise_id IS NULL OR fixeo_private._fixeo_can_access_enterprise_site(e.enterprise_id,e.site_id))
 ), facts AS (
 SELECT r.*,m.first_at external_at,i.first_at internal_at,
 CASE WHEN m.invalid+i.invalid>0 THEN 'PARTIAL' ELSE 'COMPLETE' END acceptance_quality,
 r.status IN('new','no_match') AND m.engaged+i.engaged=0 waiting,m.offers,
 (SELECT count(*) FROM public.dispatch_notification_outbox d WHERE d.request_id=r.id AND lower(d.notification_status)='failed') dispatch_failures
 FROM base r
 CROSS JOIN LATERAL(SELECT min(m.accepted_at) FILTER(WHERE m.accepted_at>=r.created_at AND m.accepted_at<=now()) first_at,
 count(*) FILTER(WHERE(m.status IN('pending','done','validated') AND m.accepted_at IS NULL) OR m.accepted_at<r.created_at OR m.accepted_at>now()) invalid,
 count(*) FILTER(WHERE m.status IN('pending','done','validated')) engaged,count(*) FILTER(WHERE m.status='offered') offers FROM public.missions m WHERE m.request_id=r.id::text) m
 CROSS JOIN LATERAL(SELECT min(i.assigned_at) FILTER(WHERE i.assigned_at>=r.created_at AND i.assigned_at<=now()) first_at,
 count(*) FILTER(WHERE i.assigned_at IS NULL OR i.assigned_at<r.created_at OR i.assigned_at>now()) invalid,
 count(*) FILTER(WHERE i.status IN('assigned','in_progress','completed','validated')) engaged
 FROM public.enterprise_internal_assignments i WHERE i.service_request_id=r.id AND i.enterprise_id=r.enterprise_id) i
 WHERE(p_scope->>'city' IS NULL OR(p_scope->>'city'='__unknown__' AND r.city_key IS NULL) OR r.city_key=p_scope->>'city')
 AND(p_scope->>'trade' IS NULL OR(p_scope->>'trade'='__unknown__' AND r.trade_key IS NULL) OR r.trade_key=p_scope->>'trade')
 ) SELECT id,city_key,trade_key,city,service_category,status,urgency,created_at,enterprise_id,site_id,
 CASE WHEN enterprise_id IS NOT NULL THEN 'enterprise' WHEN client_profile_id IS NULL THEN 'guest' ELSE 'client' END,
 external_at,internal_at,least(external_at,internal_at),acceptance_quality,waiting,offers,dispatch_failures FROM facts
$$;

CREATE FUNCTION fixeo_private.control_marketplace_artisans_v1(p_scope jsonb)
RETURNS TABLE(id uuid,cities text[],trades text[],availability text,updated_at timestamptz,claimed boolean,verified boolean,claimable boolean,verification_ready boolean,pending_claims bigint,trust_conflict boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,
 ARRAY(SELECT DISTINCT fixeo_private.control_marketplace_dimension_v1(v) FROM(SELECT a.city v UNION ALL SELECT c.city FROM public.artisan_service_cities c WHERE c.artisan_id=a.id) c WHERE nullif(btrim(v),'') IS NOT NULL),
 ARRAY(SELECT DISTINCT fixeo_private.control_marketplace_dimension_v1(public.normalize_service_category_v1(v)) FROM(SELECT a.service_category v UNION ALL SELECT s.service_category FROM public.artisan_service_categories s WHERE s.artisan_id=a.id) s WHERE public.normalize_service_category_v1(v) IS NOT NULL),
 a.availability,a.updated_at,a.claimed IS TRUE AND a.owner_user_id IS NOT NULL,a.verified,
 a.claimable IS TRUE AND a.claimed IS FALSE AND a.owner_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.claim_requests c WHERE c.artisan_id=a.id AND c.status='pending'),
 a.claimed IS TRUE AND a.owner_user_id IS NOT NULL AND a.onboarding_completed IS TRUE AND a.verified IS DISTINCT FROM true,
 (SELECT count(*) FROM public.claim_requests c WHERE c.artisan_id=a.id AND c.status='pending'),
 a.verified IS DISTINCT FROM a.is_verified OR(a.claimed IS TRUE AND a.owner_user_id IS NULL) OR(a.claimed IS FALSE AND a.owner_user_id IS NOT NULL)
 FROM public.artisans a WHERE p_scope->>'classification'='all' OR a.data_classification=p_scope->>'classification' OR(p_scope->>'classification'='unclassified' AND a.data_classification IS NULL)
$$;

CREATE FUNCTION public.control_marketplace_cube_v1(p_source text,p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;items jsonb;total bigint;scope_hash text;cursor_key text;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();s:=fixeo_private.control_marketplace_scope_v1(p_filters);scope_hash:=md5(s::text);
 IF p_source IS NULL OR p_source NOT IN('operations','network','commerce') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF p_after IS NOT NULL AND(jsonb_typeof(p_after)<>'object' OR(p_after->>'scope') IS DISTINCT FROM scope_hash OR p_after->>'key' IS NULL OR length(p_after->>'key')>600 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_after) k WHERE k NOT IN('scope','key'))) THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 WITH r AS MATERIALIZED(SELECT * FROM fixeo_private.control_marketplace_requests_v1(s)),
 cells AS(SELECT DISTINCT jsonb_build_array(city,trade)::text key,city,trade FROM r WHERE status IN('new','no_match','assigned','in_progress') OR(created_at>=(s->>'previous_from_utc')::timestamptz AND created_at<(s->>'to_utc')::timestamptz)),
 page AS(SELECT * FROM cells WHERE p_after IS NULL OR key COLLATE "C">(p_after->>'key') COLLATE "C" ORDER BY key COLLATE "C" LIMIT p_limit),
 a AS MATERIALIZED(SELECT * FROM fixeo_private.control_marketplace_artisans_v1(s) WHERE p_source='network'),
 data AS(SELECT c.key,c.city,c.trade,
 CASE p_source WHEN 'operations' THEN(SELECT jsonb_build_object(
 'cohort_requests',count(*) FILTER(WHERE created_at>=(s->>'from_utc')::timestamptz AND created_at<(s->>'to_utc')::timestamptz),
 'open',count(*) FILTER(WHERE status IN('new','no_match','assigned','in_progress')),
 'waiting',count(*) FILTER(WHERE waiting),'urgent_waiting',count(*) FILTER(WHERE waiting AND urgency IN('now','urgent')),
 'oldest_waiting',min(created_at) FILTER(WHERE waiting),'undated',count(*) FILTER(WHERE created_at IS NULL),
 'offered_missions',coalesce(sum(offers) FILTER(WHERE waiting),0),'failed_notifications',coalesce(sum(dispatch_failures) FILTER(WHERE status IN('new','no_match','assigned','in_progress')),0),
 'enterprise_open',count(*) FILTER(WHERE enterprise_id IS NOT NULL AND status IN('new','no_match','assigned','in_progress')),
 'source','service_requests + missions + enterprise_internal_assignments + dispatch_notification_outbox') FROM r WHERE city IS NOT DISTINCT FROM c.city AND trade IS NOT DISTINCT FROM c.trade)
 WHEN 'network' THEN(SELECT jsonb_build_object('referenced',count(*),'claimed',count(*) FILTER(WHERE claimed),'verified',count(*) FILTER(WHERE verified IS TRUE),
 'available_declared',count(*) FILTER(WHERE availability='available'),'availability_unknown',count(*) FILTER(WHERE availability IS NULL OR availability NOT IN('available','busy','unavailable')),
 'claimable',count(*) FILTER(WHERE claimable),'verification_ready',count(*) FILTER(WHERE verification_ready),'pending_claims',coalesce(sum(pending_claims),0),'trust_conflicts',count(*) FILTER(WHERE trust_conflict),
 'oldest_profile_update',min(updated_at),'undated_profiles',count(*) FILTER(WHERE updated_at IS NULL),
 'eligible',NULL,'residual_capacity',NULL,'coverage',NULL,'eligibility_reason','CANONICAL_CHECK_ON_DEMAND',
 'match_basis','declared_normalized_city_trade_multiactivity; not dispatch eligibility','source','artisans + artisan_service_cities + artisan_service_categories + claim_requests') FROM a WHERE c.city=ANY(cities) AND c.trade=ANY(trades))
 WHEN 'commerce' THEN(SELECT jsonb_build_object(
 'quotes_presented',count(*) FILTER(WHERE q.presented_at IS NOT NULL),'quotes_review',count(*) FILTER(WHERE q.review_status='submitted'),
 'quotes_expired',count(*) FILTER(WHERE q.status<>'accepted' AND q.expires_at<=now()),
 'quote_requirement','UNKNOWN — absence of quote is not QUOTE_REQUIRED','source','quotes joined to request creation cohort')
 FROM public.quotes q JOIN r ON r.id=q.request_id WHERE r.city IS NOT DISTINCT FROM c.city AND r.trade IS NOT DISTINCT FROM c.trade AND r.created_at>=(s->>'from_utc')::timestamptz AND r.created_at<(s->>'to_utc')::timestamptz)
 END facts FROM page c)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(data) ORDER BY key COLLATE "C") FROM data),'[]'),(SELECT count(*) FROM cells),(SELECT key FROM page ORDER BY key COLLATE "C" DESC LIMIT 1)
 INTO items,total,cursor_key;
 RETURN jsonb_build_object('contract_version','marketplace-intelligence-v1','source',p_source,'source_state','FRESH','as_of',now(),'scope',s,'scope_hash',scope_hash,
 'items',items,'total_cells',total,'has_more',EXISTS(SELECT 1 FROM fixeo_private.control_marketplace_requests_v1(s) r WHERE (r.status IN('new','no_match','assigned','in_progress') OR(r.created_at>=(s->>'previous_from_utc')::timestamptz AND r.created_at<(s->>'to_utc')::timestamptz)) AND jsonb_build_array(r.city,r.trade)::text COLLATE "C">cursor_key COLLATE "C"),
 'next_cursor',CASE WHEN cursor_key IS NOT NULL THEN jsonb_build_object('key',cursor_key,'scope',scope_hash) END,
 'completeness','exact_cells_paged','normalization','marketplace-dimensions-v1 / resolve_service_category_v1; raw dimensions in dossiers',
 'grain','distinct request / distinct artisan per cell; never sum artisans across cells','stock_at',now(),'cohort_window','[from,to)',
 'unattributed_missions',CASE WHEN s->>'classification'='all' AND s->>'city' IS NULL AND s->>'trade' IS NULL AND s->>'enterprise_id' IS NULL AND s->>'site_id' IS NULL THEN(SELECT count(*) FROM public.missions m WHERE NOT EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id::text=m.request_id)) END,
 'unattributed_reason','request UNKNOWN; context NOT_FOUND; no cell or balance reconstructed','private_business','excluded','execution_authorized',false);
END $$;

CREATE FUNCTION public.control_marketplace_population_v1(p_kind text,p_filters jsonb DEFAULT '{}',p_after jsonb DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;items jsonb;total bigint;scope_hash text;n bigint;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();s:=fixeo_private.control_marketplace_scope_v1(p_filters);scope_hash:=md5(s::text||p_kind);
 IF p_kind IS NULL OR p_kind NOT IN('cohort','previous','open','waiting','profiles','claimable','verification_ready') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_FILTER';END IF;
 IF p_kind IN('profiles','claimable','verification_ready') AND(s->>'city' IS NULL OR s->>'trade' IS NULL OR s->>'city'='__unknown__' OR s->>'trade'='__unknown__') THEN RAISE EXCEPTION 'DIMENSIONS_REQUIRED';END IF;
 IF p_after IS NOT NULL AND(jsonb_typeof(p_after)<>'object' OR(p_after->>'scope') IS DISTINCT FROM scope_hash OR p_after->>'id' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_after) k WHERE k NOT IN('scope','id'))) THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 WITH rows AS MATERIALIZED(
 SELECT r.id,'request' type,to_jsonb(r) facts FROM fixeo_private.control_marketplace_requests_v1(s) r
 WHERE(p_kind='cohort' AND r.created_at>=(s->>'from_utc')::timestamptz AND r.created_at<(s->>'to_utc')::timestamptz)
 OR(p_kind='previous' AND r.created_at>=(s->>'previous_from_utc')::timestamptz AND r.created_at<(s->>'from_utc')::timestamptz)
 OR(p_kind='open' AND r.status IN('new','no_match','assigned','in_progress')) OR(p_kind='waiting' AND r.waiting)
 UNION ALL SELECT a.id,'artisan',to_jsonb(a)-'cities'-'trades' FROM fixeo_private.control_marketplace_artisans_v1(s) a
 WHERE p_kind IN('profiles','claimable','verification_ready') AND s->>'city'=ANY(a.cities) AND s->>'trade'=ANY(a.trades)
 AND(p_kind='profiles' OR(p_kind='claimable' AND a.claimable) OR(p_kind='verification_ready' AND a.verification_ready))
 ), selected AS(SELECT * FROM rows WHERE p_after IS NULL OR id>(p_after->>'id')::uuid ORDER BY id LIMIT p_limit+1),
 page AS(SELECT * FROM selected ORDER BY id LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page),'[]'),(SELECT count(*) FROM rows),(SELECT count(*) FROM selected) INTO items,total,n;
 RETURN jsonb_build_object('contract_version','marketplace-intelligence-v1','as_of',now(),'source_state','FRESH','kind',p_kind,'scope',s,'items',items,'total',total,'has_more',n>p_limit,
 'next_cursor',CASE WHEN n>p_limit THEN jsonb_build_object('id',items->(p_limit-1)->>'id','scope',scope_hash) END,
 'provenance','same filters and normalized dimensions as Cube; dossiers via control_dossier_section_v1','execution_authorized',false,'private_business','excluded');
END $$;

-- Explicit operator check only: at most five requests, no automatic N previews on refresh.
CREATE FUNCTION public.control_marketplace_coverage_v1(p_filters jsonb DEFAULT '{}',p_after uuid DEFAULT NULL,p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;r record;items jsonb:='[]';j jsonb;total bigint;n integer:=0;eligible boolean;state text;
BEGIN
 PERFORM fixeo_private.control_require_admin_v1();s:=fixeo_private.control_marketplace_scope_v1(p_filters);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_LIMIT';END IF;
 SELECT count(*) INTO total FROM fixeo_private.control_marketplace_requests_v1(s) WHERE waiting;
 FOR r IN SELECT * FROM fixeo_private.control_marketplace_requests_v1(s) WHERE waiting AND(p_after IS NULL OR id>p_after) ORDER BY id LIMIT p_limit+1 LOOP
  n:=n+1;EXIT WHEN n>p_limit;eligible:=NULL;j:=NULL;state:='UNKNOWN';
  IF r.status<>'new' THEN state:='REQUEST_NOT_DISPATCHABLE';
  ELSIF r.enterprise_id IS NOT NULL THEN
   j:=public.control_hybrid_read_v1(r.id);
   -- Global Admin observes; no tenant authorization is inferred from a worker or an offer.
   state:='ENTERPRISE_CONTEXT';
   j:=jsonb_build_object('policy',j->'policy','tenant_operator',j->'tenant_operator','actionable',j->'actionable','worker_total',j->'worker_total','workers_has_more',j->'workers_has_more','unavailable_reason',j->'unavailable_reason');
  ELSE
   j:=public.control_rafi_dispatch_read_v1(r.id);eligible:=jsonb_array_length(j->'candidates')>0;state:='CHECKED';
   j:=jsonb_build_object('candidates',j->'candidates','candidate_limit',j->'candidate_limit','count_kind','bounded_candidates; existence exact; total unknown');
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object('type','request','id',r.id,'status',state,'has_eligible_candidate',eligible,'facts',j,'authority',CASE WHEN r.enterprise_id IS NULL THEN 'dispatch_preview_v22' ELSE 'control_hybrid_read_v1' END));
 END LOOP;
 RETURN jsonb_build_object('contract_version','marketplace-intelligence-v1','as_of',now(),'expires_at',now()+interval '60 seconds','scope',s,'items',items,'total_waiting',total,'checked_page',jsonb_array_length(items),'has_more',n>p_limit,
 'next_cursor',CASE WHEN n>p_limit THEN items->(p_limit-1)->>'id' END,'coverage_rate',NULL,'quality','BOUNDED_REQUEST_CHECK; not global coverage','execution_authorized',false,'requires_canonical_preview',true);
END $$;

REVOKE ALL ON FUNCTION fixeo_private.control_marketplace_dimension_v1(text),fixeo_private.control_marketplace_scope_v1(jsonb),fixeo_private.control_marketplace_requests_v1(jsonb),fixeo_private.control_marketplace_artisans_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.control_marketplace_cube_v1(text,jsonb,jsonb,integer),public.control_marketplace_population_v1(text,jsonb,jsonb,integer),public.control_marketplace_coverage_v1(jsonb,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.control_marketplace_cube_v1(text,jsonb,jsonb,integer),public.control_marketplace_population_v1(text,jsonb,jsonb,integer),public.control_marketplace_coverage_v1(jsonb,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
