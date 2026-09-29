-- Bloc 1 / phase 4: cutover after producer changes. NOT APPLIED TO PRODUCTION.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
ALTER VIEW public.claims_pending SET (security_invoker=true);
REVOKE ALL ON public.claims_pending FROM PUBLIC,anon;
ALTER VIEW public.artisans_available SET (security_invoker=true);
ALTER VIEW public.artisan_review_stats SET (security_invoker=true);

-- Remove both table grants and column grants. One does not revoke the other.
REVOKE INSERT,UPDATE,DELETE ON public.service_requests,public.missions,public.quotes FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; cols text;
BEGIN
 FOREACH t IN ARRAY ARRAY['service_requests','missions','quotes'] LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,t);
 END LOOP;
END $$;

DROP POLICY quotes_select_related_admin ON public.quotes;
CREATE POLICY quotes_select_related_admin ON public.quotes FOR SELECT TO authenticated USING(
 public.is_admin()
 OR artisan_profile_id IN(SELECT id FROM public.artisans WHERE owner_user_id=auth.uid())
 OR (review_status='legacy_unreviewed' AND status IN('accepted','rejected') AND request_id IN(SELECT id FROM public.service_requests WHERE client_profile_id=auth.uid()))
 OR (review_status='approved' AND reviewed_version=quote_version AND presented_at IS NOT NULL AND request_id IN(SELECT id FROM public.service_requests WHERE client_profile_id=auth.uid()))
);
-- Claim creation remains the existing producer, but cannot create a fake review.
DROP POLICY "7c12a1_auth_insert_own" ON public.claim_requests;
CREATE POLICY "7c12a1_auth_insert_own" ON public.claim_requests FOR INSERT TO authenticated WITH CHECK(requester_user_id=auth.uid() AND status='pending' AND reviewed_at IS NULL);

-- Browser producers cannot choose test/internal/unclassified to hide Marketplace activity.
CREATE FUNCTION fixeo_private.classification_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.data_classification IS DISTINCT FROM 'production') OR (TG_OP='UPDATE' AND NEW.data_classification IS DISTINCT FROM OLD.data_classification) THEN
  IF NOT coalesce(public.is_admin(),false) AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'CLASSIFICATION_AUTHORITY_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.classification_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER classification_guard_v1 BEFORE INSERT OR UPDATE OF data_classification ON public.service_requests FOR EACH ROW EXECUTE FUNCTION fixeo_private.classification_guard_v1();
CREATE TRIGGER classification_guard_v1 BEFORE INSERT OR UPDATE OF data_classification ON public.artisans FOR EACH ROW EXECUTE FUNCTION fixeo_private.classification_guard_v1();
CREATE TRIGGER classification_guard_v1 BEFORE INSERT OR UPDATE OF data_classification ON public.enterprise_accounts FOR EACH ROW EXECUTE FUNCTION fixeo_private.classification_guard_v1();

CREATE FUNCTION fixeo_private.verified_canonical_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.is_verified:=coalesce(NEW.verified,false); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION fixeo_private.verified_canonical_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER verified_canonical_v1 BEFORE INSERT OR UPDATE OF verified,is_verified ON public.artisans FOR EACH ROW EXECUTE FUNCTION fixeo_private.verified_canonical_v1();

-- New engagements share the request row as their ordering point; historic rows are not rewritten.
CREATE FUNCTION fixeo_private.execution_winner_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF TG_TABLE_NAME='missions' THEN
  IF NEW.status NOT IN('pending','done','validated') OR (TG_OP='UPDATE' AND OLD.status IN('pending','done','validated')) THEN RETURN NEW; END IF;
  SELECT id INTO rid FROM public.service_requests WHERE id::text=NEW.request_id FOR UPDATE;
  IF rid IS NULL THEN RAISE EXCEPTION 'CANONICAL_REQUEST_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.missions WHERE request_id=rid::text AND id<>NEW.id AND status IN('pending','done','validated')) OR EXISTS(SELECT 1 FROM public.enterprise_internal_assignments WHERE service_request_id=rid AND status IN('assigned','in_progress','completed','validated')) THEN RAISE EXCEPTION 'WINNER_ALREADY_EXISTS'; END IF;
 ELSE
  IF NEW.status NOT IN('assigned','in_progress','completed','validated') OR(TG_OP='UPDATE' AND OLD.status IN('assigned','in_progress','completed','validated')) THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.service_requests WHERE id=NEW.service_request_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.missions WHERE request_id=NEW.service_request_id::text AND status IN('pending','done','validated')) THEN RAISE EXCEPTION 'WINNER_ALREADY_EXISTS'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.execution_winner_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER execution_winner_guard_v1 BEFORE INSERT OR UPDATE OF status ON public.missions FOR EACH ROW EXECUTE FUNCTION fixeo_private.execution_winner_guard_v1();
CREATE TRIGGER execution_winner_guard_v1 BEFORE INSERT OR UPDATE OF status ON public.enterprise_internal_assignments FOR EACH ROW EXECUTE FUNCTION fixeo_private.execution_winner_guard_v1();

CREATE FUNCTION public.enterprise_request_sla_facts_v1(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE er public.enterprise_request_context; snapshot public.enterprise_request_sla; accepted timestamptz; started timestamptz; resolved timestamptz; ext integer; internal_count integer;
BEGIN
 SELECT * INTO er FROM public.enterprise_request_context WHERE service_request_id=p_request_id;
 IF er.id IS NULL OR NOT coalesce(fixeo_private._fixeo_can_access_enterprise_site(er.enterprise_id,er.site_id),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO snapshot FROM public.enterprise_request_sla WHERE service_request_id=p_request_id;
 SELECT count(*) INTO ext FROM public.missions WHERE request_id=p_request_id::text AND status IN('pending','done','validated') AND accepted_at IS NOT NULL;
 SELECT count(*) INTO internal_count FROM public.enterprise_internal_assignments WHERE service_request_id=p_request_id AND status IN('assigned','in_progress','completed','validated');
 SELECT min(a),min(s),min(c) INTO accepted,started,resolved FROM(
  SELECT accepted_at a,started_at s,completed_at c FROM public.missions WHERE request_id=p_request_id::text AND status IN('pending','done','validated') AND accepted_at IS NOT NULL
  UNION ALL SELECT assigned_at,started_at,completed_at FROM public.enterprise_internal_assignments WHERE service_request_id=p_request_id AND status IN('assigned','in_progress','completed','validated')
 ) events;
 IF ext+internal_count>1 THEN accepted:=NULL; started:=NULL; resolved:=NULL; END IF;
 RETURN jsonb_build_object('contract_version','enterprise-sla-facts-v1','request_id',p_request_id,'enterprise_id',er.enterprise_id,'site_id',er.site_id,'snapshot_id',snapshot.id,'acceptance_at',accepted,'acceptance_due_at',snapshot.due_at,'acceptance_status',CASE WHEN ext+internal_count>1 THEN 'unknown_conflict' WHEN snapshot.id IS NULL THEN 'not_configured' WHEN accepted<=snapshot.due_at THEN 'met' WHEN accepted>snapshot.due_at OR now()>snapshot.due_at THEN 'breached' WHEN now()>=snapshot.at_risk_at THEN 'at_risk' ELSE 'on_track' END,'execution_started_at',started,'resolved_at',resolved,'start_sla','not_configured','resolution_sla','not_configured','external_winners',ext,'internal_winners',internal_count);
END $$;
REVOKE ALL ON FUNCTION public.enterprise_request_sla_facts_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enterprise_request_sla_facts_v1(uuid) TO authenticated;

-- Evolve the existing canonical SLA view; reporting and Control now share the same facts.
CREATE OR REPLACE VIEW public.enterprise_sla_status WITH (security_invoker=true) AS
WITH first_acceptance AS (
 SELECT s.service_request_id,(f.data->>'acceptance_at')::timestamptz AS first_accepted_at,
        f.data->>'acceptance_status'='unknown_conflict' AS conflict
 FROM public.enterprise_request_sla s
 CROSS JOIN LATERAL (SELECT public.enterprise_request_sla_facts_v1(s.service_request_id) AS data) f
)
 SELECT ers.id AS request_sla_id,
    ers.service_request_id,
    ers.enterprise_id,
    ers.site_id,
    ers.policy_id,
    ers.policy_urgency,
    ers.request_urgency,
    ers.acceptance_target_minutes,
    ers.started_at,
    ers.at_risk_at,
    ers.due_at,
    fa.first_accepted_at,
        CASE
            WHEN fa.conflict THEN 'UNKNOWN'::text
            WHEN ((fa.first_accepted_at IS NOT NULL) AND (fa.first_accepted_at <= ers.due_at)) THEN 'MET'::text
            WHEN ((fa.first_accepted_at IS NOT NULL) AND (fa.first_accepted_at > ers.due_at)) THEN 'BREACHED'::text
            WHEN (now() >= ers.due_at) THEN 'BREACHED'::text
            WHEN (now() >= ers.at_risk_at) THEN 'AT_RISK'::text
            ELSE 'ON_TRACK'::text
        END AS sla_status,
        CASE
            WHEN (fa.first_accepted_at IS NOT NULL) THEN GREATEST((0)::numeric, (EXTRACT(epoch FROM (fa.first_accepted_at - ers.started_at)) / 60.0))
            ELSE NULL::numeric
        END AS first_acceptance_minutes,
        CASE
            WHEN ((fa.first_accepted_at IS NOT NULL) AND (fa.first_accepted_at > ers.due_at)) THEN (EXTRACT(epoch FROM (fa.first_accepted_at - ers.due_at)) / 60.0)
            WHEN ((fa.first_accepted_at IS NULL) AND (now() > ers.due_at)) THEN (EXTRACT(epoch FROM (now() - ers.due_at)) / 60.0)
            ELSE (0)::numeric
        END AS breach_minutes
   FROM (enterprise_request_sla ers
     LEFT JOIN first_acceptance fa ON ((fa.service_request_id = ers.service_request_id)));

DROP POLICY artisan_select_own_missions ON public.missions;
CREATE POLICY artisan_select_own_missions ON public.missions FOR SELECT TO authenticated USING(artisan_profile_id IN(SELECT id FROM public.artisans WHERE owner_user_id=auth.uid()));
COMMIT;
