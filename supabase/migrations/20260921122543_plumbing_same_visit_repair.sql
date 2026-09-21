-- Plumbing pilot: immutable proposals and client decisions; original offers remain bound.
-- No historical mission or request is updated by this migration.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION fixeo_private.plumbing_tariff_v1(code text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT ($tariffs${"plomberie.diagnostic":{"label":"Diagnostic plomberie seul","vap_minor":16000,"work":"PLUMB_DIAGNOSTIC","scope":"Contrôle visuel et vérifications simples d’un problème accessible, avec explication. Sans réparation, recherche instrumentée, démontage lourd, ouverture de mur, rapport certifié ni seconde visite.","total_minor":22000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_DIAGNOSTIC"}},"plomberie.fuite_simple":{"label":"Fuite simple visible","vap_minor":22000,"work":"PLUMB_LEAK","scope":"Un raccord sanitaire visible et accessible : resserrage ou joint standard, puis contrôle d’étanchéité. Petits consommables inclus jusqu’à 50 DH. Sans remplacement de tuyau, flexible ou robinet, corrosion, soudure, chauffe-eau, gaz ni réseau collectif.","total_minor":28000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_LEAK"}},"plomberie.debouchage_evier":{"label":"Débouchage simple évier ou lavabo","vap_minor":22000,"work":"PLUMB_SINK","scope":"Un évier ou lavabo : siphon accessible, nettoyage, remontage et débouchage manuel local avec essai d’écoulement. Sans remplacement de siphon, équipement motorisé, ouverture d’accès, colonne collective, plusieurs équipements refoulants ni échec préalable d’un professionnel.","total_minor":28000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_SINK"}},"plomberie.debouchage_wc_simple":{"label":"Débouchage simple WC","vap_minor":27000,"work":"PLUMB_WC","scope":"Un WC classique, sans broyeur : obstruction isolée traitable manuellement, avec essai d’écoulement. Sans dépose du WC, extraction spéciale d’objet, matériel motorisé, réseau collectif, plusieurs refoulements ni échec préalable d’un professionnel.","total_minor":33000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_WC"}},"plomberie.robinet_remplacement":{"label":"Remplacement robinet fourni par le client","vap_minor":22000,"work":"PLUMB_TAP","parts":true,"scope":"Un mitigeur standard posé sur évier ou lavabo, fourni compatible par le client : dépose, pose et essai. Raccordements existants compatibles, accessibles et non grippés ; petits consommables inclus jusqu’à 50 DH. Sans flexible ou vanne à remplacer, robinet mural ou thermostatique ni modification de tuyauterie.","total_minor":28000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_TAP","plumbing_parts":"PLUMB_CLIENT_PART"}},"plomberie.chasse_eau":{"label":"Mécanisme de chasse fourni par le client","vap_minor":27000,"work":"PLUMB_CISTERN","parts":true,"scope":"Un WC au sol à réservoir apparent intact : mécanisme standard compatible fourni par le client, pose, réglage et essai. Alimentation et robinet d’arrêt en bon état ; petits consommables inclus jusqu’à 30 DH. Sans WC suspendu, réservoir encastré, fissure ni mécanisme propriétaire.","total_minor":33000,"inputs":{"plumbing_scope":"LOCAL_ACCESSIBLE","plumbing_access":"PLUMB_ACCESS_READY","plumbing_work":"PLUMB_CISTERN","plumbing_parts":"PLUMB_CLIENT_PART"}}}$tariffs$::jsonb)->code;
$fn$;
REVOKE ALL ON FUNCTION fixeo_private.plumbing_tariff_v1(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE fixeo_private.plumbing_proposals_v1 (
 id uuid PRIMARY KEY,
 sequence_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 original_offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 repair_offer_id uuid NOT NULL UNIQUE REFERENCES public.fixeo_pricing_offers_v1(id),
 diagnostic_paid_minor bigint NOT NULL CHECK(diagnostic_paid_minor IN (0,22000)),
 same_visit boolean NOT NULL CHECK(same_visit),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX plumbing_proposals_mission ON fixeo_private.plumbing_proposals_v1(mission_id,sequence_id DESC);
CREATE TABLE fixeo_private.plumbing_decisions_v1 (
 proposal_id uuid PRIMARY KEY REFERENCES fixeo_private.plumbing_proposals_v1(id),
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 accepted boolean NOT NULL,
 consent_version text NOT NULL DEFAULT 'plumbing-same-visit-v1' CHECK(consent_version='plumbing-same-visit-v1'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX plumbing_one_accepted_mission ON fixeo_private.plumbing_decisions_v1(mission_id) WHERE accepted;
CREATE UNIQUE INDEX plumbing_one_accepted_request ON fixeo_private.plumbing_decisions_v1(request_id) WHERE accepted;
ALTER TABLE fixeo_private.plumbing_proposals_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.plumbing_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.plumbing_proposals_v1,fixeo_private.plumbing_decisions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION fixeo_private.plumbing_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Plumbing audit record is immutable'; END $$;
REVOKE ALL ON FUNCTION fixeo_private.plumbing_immutable_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER plumbing_proposal_immutable BEFORE UPDATE OR DELETE ON fixeo_private.plumbing_proposals_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.plumbing_immutable_v1();
CREATE TRIGGER plumbing_decision_immutable BEFORE UPDATE OR DELETE ON fixeo_private.plumbing_decisions_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.plumbing_immutable_v1();

CREATE OR REPLACE FUNCTION fixeo_private.plumbing_state_v1(mid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE;
 p fixeo_private.plumbing_proposals_v1%ROWTYPE; repair public.fixeo_pricing_offers_v1%ROWTYPE;
 decision boolean; has_decision boolean; credit bigint:=0; total bigint; proposal jsonb:=NULL; can_change boolean;
BEGIN
 SELECT * INTO m FROM public.missions WHERE id=mid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 IF NOT FOUND OR o.service_code<>'plomberie.diagnostic' OR o.catalogue_version<>'plumbing-pilot-v1' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 can_change:=m.status='pending' AND r.status='in_progress' AND m.final_price IS NULL AND NOT coalesce(r.commission_paid,false) AND r.commission_paid_at IS NULL AND coalesce(r.commission_status,'') NOT IN ('payée','paid');
 total:=o.client_total_minor;
 SELECT * INTO p FROM fixeo_private.plumbing_proposals_v1 WHERE mission_id=mid ORDER BY sequence_id DESC LIMIT 1;
 IF FOUND THEN
  SELECT accepted INTO decision FROM fixeo_private.plumbing_decisions_v1 WHERE proposal_id=p.id;
  has_decision:=FOUND;
  SELECT * INTO STRICT repair FROM public.fixeo_pricing_offers_v1 WHERE id=p.repair_offer_id;
  IF decision IS TRUE THEN total:=repair.client_total_minor; credit:=p.diagnostic_paid_minor; can_change:=false; END IF;
  proposal:=jsonb_build_object('id',p.id,'service_code',repair.service_code,'label',repair.scope->>'label','scope',repair.scope->>'description',
   'client_total_minor',repair.client_total_minor,'vap_minor',repair.vap_minor,'commission_minor',repair.commission_minor,
   'diagnostic_paid_minor',p.diagnostic_paid_minor,'remaining_due_minor',repair.client_total_minor-p.diagnostic_paid_minor,
   'expires_at',repair.expires_at,'status',CASE WHEN has_decision THEN CASE WHEN decision THEN 'ACCEPTED' ELSE 'DECLINED' END WHEN NOT can_change OR repair.expires_at<=now() THEN 'EXPIRED' ELSE 'PENDING' END);
 END IF;
 RETURN jsonb_build_object('mission_id',mid,'can_propose',can_change,'current_total_minor',total,'commission_minor',o.commission_minor,
  'diagnostic_paid_minor',credit,'remaining_due_minor',total-credit,'proposal',proposal);
END $$;
REVOKE ALL ON FUNCTION fixeo_private.plumbing_state_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Authenticated artisan can inspect/propose only for their own assigned mission.
CREATE OR REPLACE FUNCTION public.plumbing_repair_artisan_v1(
 p_mission_id uuid,p_service_code text DEFAULT NULL,p_inputs jsonb DEFAULT '{}',
 p_paid_minor bigint DEFAULT 0,p_proposal_id uuid DEFAULT NULL,p_same_visit boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; original public.fixeo_pricing_offers_v1%ROWTYPE;
 tariff jsonb; previous fixeo_private.plumbing_proposals_v1%ROWTYPE; repair_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501';
 END IF;
 IF p_service_code IS NULL THEN RETURN fixeo_private.plumbing_state_v1(m.id); END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO original FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 tariff:=fixeo_private.plumbing_tariff_v1(p_service_code);
 IF tariff IS NULL OR p_service_code='plomberie.diagnostic' OR p_inputs IS DISTINCT FROM tariff->'inputs'
  OR p_same_visit IS DISTINCT FROM true OR p_paid_minor IS NULL OR p_paid_minor NOT IN (0,22000) OR p_proposal_id IS NULL THEN
  RAISE EXCEPTION 'Repair scope, cash credit and same visit must be confirmed' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.plumbing_proposals_v1 WHERE id=p_proposal_id;
 IF FOUND THEN
  IF previous.mission_id IS DISTINCT FROM m.id OR previous.artisan_id IS DISTINCT FROM m.artisan_profile_id
   OR previous.diagnostic_paid_minor IS DISTINCT FROM p_paid_minor OR NOT EXISTS(
    SELECT 1 FROM public.fixeo_pricing_offers_v1 WHERE id=previous.repair_offer_id AND service_code=p_service_code AND scope->'inputs'=p_inputs
   ) THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.plumbing_state_v1(m.id);
 END IF;
 IF original.service_code IS DISTINCT FROM 'plomberie.diagnostic' OR original.catalogue_version IS DISTINCT FROM 'plumbing-pilot-v1'
  OR original.client_total_minor IS DISTINCT FROM 22000 OR original.commission_minor IS DISTINCT FROM 6000
  OR r.pricing_offer_id IS DISTINCT FROM original.id OR m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress'
  OR m.final_price IS NOT NULL OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid')
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR EXISTS(SELECT 1 FROM fixeo_private.plumbing_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Same visit repair is not available' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.fixeo_pricing_offers_v1(offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
 VALUES(gen_random_uuid(),'vap-bp33-v1','MAD',p_service_code,'plumbing-pilot-v1',original.city,
  jsonb_build_object('kind','SAME_VISIT_REPAIR','mission_id',m.id,'original_offer_id',original.id,'inputs',p_inputs,'label',tariff->>'label','description',tariff->>'scope'),
  (tariff->>'vap_minor')::bigint,0,6000,(tariff->>'total_minor')::bigint,clock_timestamp()+interval '45 minutes') RETURNING id INTO repair_id;
 INSERT INTO fixeo_private.plumbing_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit)
 VALUES(p_proposal_id,m.id,r.id,m.artisan_profile_id,original.id,repair_id,p_paid_minor,true);
 RETURN fixeo_private.plumbing_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.plumbing_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.plumbing_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean) TO authenticated;

-- Server-only guest API: token is hashed by the server and checked again in the transaction.
CREATE OR REPLACE FUNCTION public.plumbing_repair_guest_v1(
 p_tracking_ref text,p_guest_hash text,p_action text DEFAULT 'read',p_proposal_id uuid DEFAULT NULL,p_expected_paid_minor bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE; m public.missions%ROWTYPE; p fixeo_private.plumbing_proposals_v1%ROWTYPE;
 repair public.fixeo_pricing_offers_v1%ROWTYPE; decision boolean;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE tracking_ref=p_tracking_ref;
 IF NOT FOUND OR r.guest_token_hash IS NULL OR p_guest_hash IS NULL OR p_guest_hash<>r.guest_token_hash THEN
  RAISE EXCEPTION 'Request not found' USING ERRCODE='42501';
 END IF;
 IF p_action='read' THEN
  SELECT * INTO m FROM public.missions WHERE request_id=r.id::text AND status IN ('pending','done','validated') ORDER BY id LIMIT 1;
  RETURN fixeo_private.plumbing_state_v1(m.id);
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM fixeo_private.plumbing_proposals_v1 WHERE id=p_proposal_id AND request_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 -- Same locking order as proposal, lifecycle and financial mission updates.
 SELECT * INTO m FROM public.missions WHERE id=p.mission_id FOR UPDATE;
 SELECT * INTO r FROM public.service_requests WHERE id=p.request_id FOR UPDATE;
 IF p_guest_hash IS DISTINCT FROM r.guest_token_hash THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF p_expected_paid_minor IS DISTINCT FROM p.diagnostic_paid_minor THEN RAISE EXCEPTION 'Cash credit must match the displayed proposal' USING ERRCODE='22023'; END IF;
 SELECT accepted INTO decision FROM fixeo_private.plumbing_decisions_v1 WHERE proposal_id=p.id;
 IF FOUND THEN
  IF decision IS DISTINCT FROM (p_action='accept') THEN RAISE EXCEPTION 'Decision already recorded' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.plumbing_state_v1(m.id);
 END IF;
 SELECT * INTO STRICT repair FROM public.fixeo_pricing_offers_v1 WHERE id=p.repair_offer_id;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL
  OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid') OR repair.expires_at<=now()
  OR m.artisan_profile_id IS DISTINCT FROM p.artisan_id OR m.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR r.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR EXISTS(SELECT 1 FROM fixeo_private.plumbing_proposals_v1 WHERE mission_id=m.id AND sequence_id>p.sequence_id)
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR EXISTS(SELECT 1 FROM fixeo_private.plumbing_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Proposal no longer available' USING ERRCODE='22023';
 END IF;
 INSERT INTO fixeo_private.plumbing_decisions_v1(proposal_id,mission_id,request_id,accepted) VALUES(p.id,m.id,r.id,p_action='accept');
 IF p_action='accept' THEN UPDATE public.missions SET agreed_price=agreed_price WHERE id=m.id; END IF;
 RETURN fixeo_private.plumbing_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.plumbing_repair_guest_v1(text,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.plumbing_repair_guest_v1(text,text,text,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.plumbing_repair_admin_v1(p_mission_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT fixeo_private.plumbing_state_v1(p_mission_id); $$;
REVOKE ALL ON FUNCTION public.plumbing_repair_admin_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.plumbing_repair_admin_v1(uuid) TO service_role;

-- Original request/offer binding stays immutable. Only the separately accepted repair
-- may become effective, on its original mission, before settlement.
CREATE OR REPLACE FUNCTION fixeo_private.mission_vap_amounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE offer public.fixeo_pricing_offers_v1%ROWTYPE; bound uuid; effective uuid; accepted_artisan uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.pricing_offer_id IS DISTINCT FROM OLD.pricing_offer_id THEN RAISE EXCEPTION 'Offer binding is immutable'; END IF;
  IF OLD.pricing_offer_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.request_id IS DISTINCT FROM OLD.request_id THEN RAISE EXCEPTION 'Mission binding is immutable'; END IF;
  bound:=OLD.pricing_offer_id;
  IF EXISTS(SELECT 1 FROM fixeo_private.plumbing_decisions_v1 WHERE request_id::text=NEW.request_id AND mission_id<>OLD.id AND accepted) AND (NEW.status IS DISTINCT FROM 'cancelled' OR NEW.final_price IS NOT NULL) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
  SELECT p.repair_offer_id,p.artisan_id INTO effective,accepted_artisan FROM fixeo_private.plumbing_decisions_v1 d JOIN fixeo_private.plumbing_proposals_v1 p ON p.id=d.proposal_id WHERE d.mission_id=OLD.id AND d.accepted;
  IF effective IS NOT NULL AND NEW.artisan_profile_id IS DISTINCT FROM accepted_artisan THEN RAISE EXCEPTION 'Accepted same visit artisan is immutable'; END IF;
 ELSE
  SELECT pricing_offer_id INTO bound FROM public.service_requests WHERE id::text=NEW.request_id;
  IF NEW.pricing_offer_id IS NOT NULL AND NEW.pricing_offer_id IS DISTINCT FROM bound THEN RAISE EXCEPTION 'Offer mismatch'; END IF;
  IF bound IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM fixeo_private.plumbing_decisions_v1 WHERE request_id::text=NEW.request_id AND accepted) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
 END IF;
 SELECT * INTO STRICT offer FROM public.fixeo_pricing_offers_v1 WHERE id=coalesce(effective,bound);
 IF NEW.final_price IS NOT NULL AND NEW.final_price IS DISTINCT FROM offer.client_total_minor::numeric/100 THEN RAISE EXCEPTION 'New scope requires a new accepted offer'; END IF;
 IF TG_OP='UPDATE' AND OLD.final_price IS NOT NULL AND NEW.final_price IS NULL THEN RAISE EXCEPTION 'Cannot clear settlement'; END IF;
 NEW.pricing_offer_id:=bound;
 NEW.agreed_price:=offer.client_total_minor::numeric/100;
 NEW.commission_amount:=offer.commission_minor::numeric/100;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.mission_vap_amounts() FROM PUBLIC,anon,authenticated;
