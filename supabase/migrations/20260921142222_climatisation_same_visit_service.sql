-- Climatisation pilot: immutable proposals and client decisions; original offers remain bound.
-- No historical mission or request is updated by this migration.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('fixeo_private.mission_vap_amounts()'::regprocedure))<>'cc844ebe2d4fe7d4f2a90182cca2adac' THEN
  RAISE EXCEPTION 'Shared VAP trigger changed since audited plumbing release';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION fixeo_private.climatisation_tariff_v1(code text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT ($tariffs${"climatisation.diagnostic":{"label":"Diagnostic climatisation — 45 minutes maximum","scope":"Un problème sur un mono-split mural résidentiel : examen non destructif, contrôles professionnels compatibles avec le matériel et compte rendu oral, jusqu’à 45 minutes sur place. Sans réparation, recharge, ouverture du circuit frigorifique ni garantie de localisation de la panne.","vap_minor":20000,"materials_minor":0,"commission_minor":6000,"total_minor":26000,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_7000_24000","clim_access":"CLIM_SAFE_ACCESS","clim_work":"CLIM_DIAGNOSTIC"},"capacity":[7000,24000],"installation":false,"followup":false,"professional_checks":{},"offer_checks":{}},"climatisation.entretien_annuel":{"label":"Entretien courant — un climatiseur","scope":"Un appareil fonctionnel : filtres lavables, surfaces et échangeurs accessibles sans dépose lourde, contrôle de l’évacuation accessible et essai. Produits compatibles et protection de la zone inclus. Sans recharge, réparation, extraction de turbine ni désinfection garantie.","vap_minor":24000,"materials_minor":0,"commission_minor":6000,"total_minor":30000,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_7000_24000","clim_access":"CLIM_SAFE_ACCESS","clim_condition":"CLIM_FUNCTIONING","clim_work":"CLIM_ROUTINE"},"capacity":[7000,24000],"installation":false,"followup":true,"professional_checks":{"scope_verified":true,"safe_access_verified":true,"safe_work_verified":true,"equipment_identified":true,"cleaning_products_compatible":true,"electrical_components_protected":true},"offer_checks":{}},"climatisation.desinfection_profonde":{"label":"Nettoyage approfondi — un climatiseur","scope":"Entretien courant plus nettoyage humide approfondi de l’échangeur intérieur, turbine en place et bac accessible, avec protection de collecte et produit compatible. Sans séparation du circuit frigorifique, extraction de turbine, démontage lourd ni promesse sanitaire ou de désinfection certifiée.","vap_minor":39000,"materials_minor":0,"commission_minor":6000,"total_minor":45000,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_7000_24000","clim_access":"CLIM_SAFE_ACCESS","clim_condition":"CLIM_FUNCTIONING","clim_work":"CLIM_DEEP_CLEAN"},"capacity":[7000,24000],"installation":false,"followup":true,"professional_checks":{"scope_verified":true,"safe_access_verified":true,"safe_work_verified":true,"equipment_identified":true,"deep_clean_access_verified":true,"cleaning_products_compatible":true,"electrical_components_protected":true},"offer_checks":{}},"climatisation.installation.standard":{"label":"Pose mono-split — liaison jusqu’à 3 m, fournitures incluses","scope":"Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison jusqu’à 3 m de parcours, sans doubler la mesure pour les deux tubes.","vap_minor":50000,"materials_minor":45000,"commission_minor":7500,"total_minor":102500,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_9000_12000","clim_access":"CLIM_SAFE_ACCESS","clim_unit_supply":"CLIM_CLIENT_NEW_UNIT","clim_route":"CLIM_ROUTE_UP_TO_3M","clim_work":"CLIM_INSTALL_3M"},"capacity":[9000,12000],"installation":true,"followup":false,"professional_checks":{"scope_verified":true,"safe_access_verified":true,"safe_work_verified":true,"equipment_identified":true,"client_equipment_new_and_complete":true,"manufacturer_requirements_verified":true,"power_and_mounting_verified":true,"pipe_length_and_diameter_verified":true,"factory_charge_sufficient":true,"refrigerant_skills_and_tools_verified":true,"supply_package_confirmed_at_fixed_price":true},"offer_checks":{"model_and_scope_confirmed":true,"skills_and_tools_confirmed":true,"factory_charge_confirmed":true,"kit_and_fixed_total_confirmed":true}},"climatisation.installation.mono_split_5m":{"label":"Pose mono-split — liaison de plus de 3 m jusqu’à 5 m, fournitures incluses","scope":"Un mono-split mural neuf de 9 000 à 12 000 BTU fourni par le client, R32 ou R410A, avec unités et notice disponibles. Pose des deux unités, support adapté, deux tubes cuivre isolés suivant le même parcours, câble inter-unités et évacuation gravitaire inclus. Un perçage simple d’une paroi non structurelle de 25 cm maximum, point intérieur à 2,80 m maximum, accès extérieur depuis une surface stable protégée sans travail en façade. Alimentation électrique adaptée existante. Contrôles professionnels, épreuve d’étanchéité adaptée, tirage au vide selon le fabricant et mise en service inclus. Sans appoint de réfrigérant : charge d’usine suffisante à confirmer avant travaux. Sans dépose de l’ancien appareil, circuit électrique neuf, pompe de relevage, goulotte décorative ni carottage structurel. Liaison de plus de 3 m jusqu’à 5 m de parcours. Au-delà de 5 m : devis complet préalable.","vap_minor":60000,"materials_minor":60000,"commission_minor":9000,"total_minor":129000,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_9000_12000","clim_access":"CLIM_SAFE_ACCESS","clim_unit_supply":"CLIM_CLIENT_NEW_UNIT","clim_route":"CLIM_ROUTE_OVER_3_UP_TO_5M","clim_work":"CLIM_INSTALL_5M"},"capacity":[9000,12000],"installation":true,"followup":false,"professional_checks":{"scope_verified":true,"safe_access_verified":true,"safe_work_verified":true,"equipment_identified":true,"client_equipment_new_and_complete":true,"manufacturer_requirements_verified":true,"power_and_mounting_verified":true,"pipe_length_and_diameter_verified":true,"factory_charge_sufficient":true,"refrigerant_skills_and_tools_verified":true,"supply_package_confirmed_at_fixed_price":true},"offer_checks":{"model_and_scope_confirmed":true,"skills_and_tools_confirmed":true,"factory_charge_confirmed":true,"kit_and_fixed_total_confirmed":true}},"climatisation.desinstallation":{"label":"Dépose complète — un mono-split accessible","scope":"Dépose des deux unités d’un mono-split mural fonctionnel R32 ou R410A, conservation ou récupération du fluide selon le matériel et la procédure professionnelle adaptée, déconnexion sécurisée, obturation des raccords et de la traversée simple, appareils laissés sur place. Sans rejet volontaire de fluide. Sans transport, évacuation, réinstallation, reprise de peinture, compresseur hors service ou récupération complexe.","vap_minor":40000,"materials_minor":0,"commission_minor":6000,"total_minor":46000,"inputs":{"clim_safety":"CLIM_NO_DANGER","clim_system":"CLIM_WALL_MONOSPLIT","clim_count":"CLIM_ONE","clim_capacity":"CLIM_7000_24000","clim_access":"CLIM_SAFE_ACCESS","clim_condition":"CLIM_FUNCTIONING","clim_refrigerant":"CLIM_R32_OR_R410A","clim_work":"CLIM_REMOVE"},"capacity":[7000,24000],"installation":false,"followup":false,"professional_checks":{"scope_verified":true,"safe_access_verified":true,"safe_work_verified":true,"equipment_identified":true,"refrigerant_skills_and_tools_verified":true,"safe_refrigerant_handling_verified":true,"removal_scope_verified":true},"offer_checks":{}}}$tariffs$::jsonb)->code;
$fn$;
REVOKE ALL ON FUNCTION fixeo_private.climatisation_tariff_v1(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE fixeo_private.climatisation_proposals_v1 (
 id uuid PRIMARY KEY,
 sequence_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 original_offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 repair_offer_id uuid NOT NULL UNIQUE REFERENCES public.fixeo_pricing_offers_v1(id),
 diagnostic_paid_minor bigint NOT NULL CHECK(diagnostic_paid_minor IN (0,26000)),
 same_visit boolean NOT NULL CHECK(same_visit),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX climatisation_proposals_mission ON fixeo_private.climatisation_proposals_v1(mission_id,sequence_id DESC);
CREATE TABLE fixeo_private.climatisation_decisions_v1 (
 proposal_id uuid PRIMARY KEY REFERENCES fixeo_private.climatisation_proposals_v1(id),
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 accepted boolean NOT NULL,
 consent_version text NOT NULL DEFAULT 'climatisation-same-visit-v1' CHECK(consent_version='climatisation-same-visit-v1'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX climatisation_one_accepted_mission ON fixeo_private.climatisation_decisions_v1(mission_id) WHERE accepted;
CREATE UNIQUE INDEX climatisation_one_accepted_request ON fixeo_private.climatisation_decisions_v1(request_id) WHERE accepted;
ALTER TABLE fixeo_private.climatisation_proposals_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.climatisation_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.climatisation_proposals_v1,fixeo_private.climatisation_decisions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION fixeo_private.climatisation_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Climatisation audit record is immutable'; END $$;
REVOKE ALL ON FUNCTION fixeo_private.climatisation_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER climatisation_proposal_immutable BEFORE UPDATE OR DELETE ON fixeo_private.climatisation_proposals_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.climatisation_immutable_v1();
CREATE TRIGGER climatisation_decision_immutable BEFORE UPDATE OR DELETE ON fixeo_private.climatisation_decisions_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.climatisation_immutable_v1();

-- Only the assigned artisan may attest professional checks; customer scope is not an attestation.
CREATE TABLE fixeo_private.climatisation_prework_v1 (
 mission_id uuid PRIMARY KEY REFERENCES public.missions(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE fixeo_private.climatisation_prework_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.climatisation_prework_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER climatisation_prework_immutable BEFORE UPDATE OR DELETE ON fixeo_private.climatisation_prework_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.climatisation_immutable_v1();

CREATE TABLE fixeo_private.climatisation_offer_checks_v1 (
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,artisan_id)
);
CREATE TABLE fixeo_private.climatisation_completion_v1 (
 mission_id uuid PRIMARY KEY REFERENCES public.missions(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE fixeo_private.climatisation_offer_checks_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.climatisation_completion_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.climatisation_offer_checks_v1,fixeo_private.climatisation_completion_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER climatisation_offer_checks_immutable BEFORE UPDATE OR DELETE ON fixeo_private.climatisation_offer_checks_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.climatisation_immutable_v1();
CREATE TRIGGER climatisation_completion_immutable BEFORE UPDATE OR DELETE ON fixeo_private.climatisation_completion_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.climatisation_immutable_v1();

CREATE OR REPLACE FUNCTION fixeo_private.climatisation_state_v1(mid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE;
 p fixeo_private.climatisation_proposals_v1%ROWTYPE; repair public.fixeo_pricing_offers_v1%ROWTYPE;
 decision boolean; has_decision boolean; credit bigint:=0; total bigint; proposal jsonb:=NULL; can_change boolean;
BEGIN
 SELECT * INTO m FROM public.missions WHERE id=mid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 IF NOT FOUND OR o.catalogue_version<>'climatisation-pilot-v1' OR fixeo_private.climatisation_tariff_v1(o.service_code) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 can_change:=m.status='pending' AND r.status='in_progress' AND m.final_price IS NULL AND NOT coalesce(r.commission_paid,false) AND r.commission_paid_at IS NULL AND coalesce(r.commission_status,'') NOT IN ('payée','paid');
 total:=o.client_total_minor;
 IF o.service_code<>'climatisation.diagnostic' THEN
  RETURN jsonb_build_object('mission_id',mid,'can_propose',false,'can_confirm_prework',can_change,
   'direct_service_code',o.service_code,'current_total_minor',o.client_total_minor,'vap_minor',o.vap_minor,'materials_minor',o.materials_minor,'commission_minor',o.commission_minor,
   'completion_required',(fixeo_private.climatisation_tariff_v1(o.service_code)->>'installation')::boolean,
   'completion_confirmed',EXISTS(SELECT 1 FROM fixeo_private.climatisation_completion_v1 WHERE mission_id=mid AND artisan_id=m.artisan_profile_id AND offer_id=o.id),
   'prework_confirmed',EXISTS(SELECT 1 FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=mid AND artisan_id=m.artisan_profile_id AND offer_id=o.id));
 END IF;
 SELECT * INTO p FROM fixeo_private.climatisation_proposals_v1 WHERE mission_id=mid ORDER BY sequence_id DESC LIMIT 1;
 IF FOUND THEN
  SELECT accepted INTO decision FROM fixeo_private.climatisation_decisions_v1 WHERE proposal_id=p.id;
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
REVOKE ALL ON FUNCTION fixeo_private.climatisation_state_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Authenticated artisan can inspect/propose only for their own assigned mission.
CREATE OR REPLACE FUNCTION public.climatisation_repair_artisan_v1(
 p_mission_id uuid,p_service_code text DEFAULT NULL,p_inputs jsonb DEFAULT '{}',
 p_paid_minor bigint DEFAULT 0,p_proposal_id uuid DEFAULT NULL,p_same_visit boolean DEFAULT false,
 p_professional_checks jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; original public.fixeo_pricing_offers_v1%ROWTYPE;
 tariff jsonb; previous fixeo_private.climatisation_proposals_v1%ROWTYPE; repair_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501';
 END IF;
 IF p_service_code IS NULL THEN RETURN fixeo_private.climatisation_state_v1(m.id); END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO original FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 tariff:=fixeo_private.climatisation_tariff_v1(p_service_code);
 IF tariff IS NULL OR tariff->>'followup' IS DISTINCT FROM 'true' OR p_inputs IS DISTINCT FROM tariff->'inputs'
  OR p_professional_checks IS DISTINCT FROM tariff->'professional_checks' OR p_same_visit IS DISTINCT FROM true OR p_paid_minor IS NULL OR p_paid_minor NOT IN (0,26000) OR p_proposal_id IS NULL THEN
  RAISE EXCEPTION 'Repair scope, cash credit and same visit must be confirmed' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.climatisation_proposals_v1 WHERE id=p_proposal_id;
 IF FOUND THEN
  IF previous.mission_id IS DISTINCT FROM m.id OR previous.artisan_id IS DISTINCT FROM m.artisan_profile_id
   OR previous.diagnostic_paid_minor IS DISTINCT FROM p_paid_minor OR NOT EXISTS(
    SELECT 1 FROM public.fixeo_pricing_offers_v1 WHERE id=previous.repair_offer_id AND service_code=p_service_code AND scope->'inputs'=p_inputs AND scope->'professional_checks'=p_professional_checks
   ) THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.climatisation_state_v1(m.id);
 END IF;
 IF original.service_code IS DISTINCT FROM 'climatisation.diagnostic' OR original.catalogue_version IS DISTINCT FROM 'climatisation-pilot-v1'
  OR original.client_total_minor IS DISTINCT FROM 26000 OR original.commission_minor IS DISTINCT FROM 6000
  OR r.pricing_offer_id IS DISTINCT FROM original.id OR m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress'
  OR m.final_price IS NOT NULL OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid')
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR EXISTS(SELECT 1 FROM fixeo_private.climatisation_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Same visit repair is not available' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.fixeo_pricing_offers_v1(offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
 VALUES(gen_random_uuid(),'vap-bp33-v1','MAD',p_service_code,'climatisation-pilot-v1',original.city,
  jsonb_build_object('kind','SAME_VISIT_REPAIR','mission_id',m.id,'original_offer_id',original.id,'inputs',p_inputs,'professional_checks',p_professional_checks,'label',tariff->>'label','description',tariff->>'scope'),
  (tariff->>'vap_minor')::bigint,0,6000,(tariff->>'total_minor')::bigint,clock_timestamp()+interval '45 minutes') RETURNING id INTO repair_id;
 INSERT INTO fixeo_private.climatisation_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit)
 VALUES(p_proposal_id,m.id,r.id,m.artisan_profile_id,original.id,repair_id,p_paid_minor,true);
 RETURN fixeo_private.climatisation_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.climatisation_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.climatisation_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb) TO authenticated;

-- Server-only guest API: token is hashed by the server and checked again in the transaction.
CREATE OR REPLACE FUNCTION public.climatisation_repair_guest_v1(
 p_tracking_ref text,p_guest_hash text,p_action text DEFAULT 'read',p_proposal_id uuid DEFAULT NULL,p_expected_paid_minor bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE; m public.missions%ROWTYPE; p fixeo_private.climatisation_proposals_v1%ROWTYPE;
 repair public.fixeo_pricing_offers_v1%ROWTYPE; decision boolean;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE tracking_ref=p_tracking_ref;
 IF NOT FOUND OR r.guest_token_hash IS NULL OR p_guest_hash IS NULL OR p_guest_hash<>r.guest_token_hash THEN
  RAISE EXCEPTION 'Request not found' USING ERRCODE='42501';
 END IF;
 IF p_action='read' THEN
  SELECT * INTO m FROM public.missions WHERE request_id=r.id::text AND status IN ('pending','done','validated') ORDER BY id LIMIT 1;
  RETURN fixeo_private.climatisation_state_v1(m.id);
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM fixeo_private.climatisation_proposals_v1 WHERE id=p_proposal_id AND request_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 -- Same locking order as proposal, lifecycle and financial mission updates.
 SELECT * INTO m FROM public.missions WHERE id=p.mission_id FOR UPDATE;
 SELECT * INTO r FROM public.service_requests WHERE id=p.request_id FOR UPDATE;
 IF p_guest_hash IS DISTINCT FROM r.guest_token_hash THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF p_expected_paid_minor IS DISTINCT FROM p.diagnostic_paid_minor THEN RAISE EXCEPTION 'Cash credit must match the displayed proposal' USING ERRCODE='22023'; END IF;
 SELECT accepted INTO decision FROM fixeo_private.climatisation_decisions_v1 WHERE proposal_id=p.id;
 IF FOUND THEN
  IF decision IS DISTINCT FROM (p_action='accept') THEN RAISE EXCEPTION 'Decision already recorded' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.climatisation_state_v1(m.id);
 END IF;
 SELECT * INTO STRICT repair FROM public.fixeo_pricing_offers_v1 WHERE id=p.repair_offer_id;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL
  OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid') OR repair.expires_at<=now()
  OR m.artisan_profile_id IS DISTINCT FROM p.artisan_id OR m.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR r.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR EXISTS(SELECT 1 FROM fixeo_private.climatisation_proposals_v1 WHERE mission_id=m.id AND sequence_id>p.sequence_id)
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR EXISTS(SELECT 1 FROM fixeo_private.climatisation_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Proposal no longer available' USING ERRCODE='22023';
 END IF;
 INSERT INTO fixeo_private.climatisation_decisions_v1(proposal_id,mission_id,request_id,accepted) VALUES(p.id,m.id,r.id,p_action='accept');
 IF p_action='accept' THEN UPDATE public.missions SET agreed_price=agreed_price WHERE id=m.id; END IF;
 RETURN fixeo_private.climatisation_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.climatisation_repair_guest_v1(text,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.climatisation_repair_guest_v1(text,text,text,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.climatisation_repair_admin_v1(p_mission_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT fixeo_private.climatisation_state_v1(p_mission_id); $$;
REVOKE ALL ON FUNCTION public.climatisation_repair_admin_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.climatisation_repair_admin_v1(uuid) TO service_role;

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
  IF EXISTS(SELECT 1 FROM (SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.plumbing_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.electricity_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.climatisation_decisions_v1) d WHERE request_id::text=NEW.request_id AND mission_id<>OLD.id AND accepted) AND (NEW.status IS DISTINCT FROM 'cancelled' OR NEW.final_price IS NOT NULL) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
  SELECT a.repair_offer_id,a.artisan_id INTO effective,accepted_artisan FROM (SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.plumbing_decisions_v1 d JOIN fixeo_private.plumbing_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted UNION ALL SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.electricity_decisions_v1 d JOIN fixeo_private.electricity_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted UNION ALL SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.climatisation_decisions_v1 d JOIN fixeo_private.climatisation_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted) a WHERE a.mission_id=OLD.id;
  IF effective IS NOT NULL AND NEW.artisan_profile_id IS DISTINCT FROM accepted_artisan THEN RAISE EXCEPTION 'Accepted same visit artisan is immutable'; END IF;
 ELSE
  SELECT pricing_offer_id INTO bound FROM public.service_requests WHERE id::text=NEW.request_id;
  IF NEW.pricing_offer_id IS NOT NULL AND NEW.pricing_offer_id IS DISTINCT FROM bound THEN RAISE EXCEPTION 'Offer mismatch'; END IF;
  IF bound IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM (SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.plumbing_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.electricity_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.climatisation_decisions_v1) d WHERE request_id::text=NEW.request_id AND accepted) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
 END IF;
 SELECT * INTO STRICT offer FROM public.fixeo_pricing_offers_v1 WHERE id=coalesce(effective,bound);
 IF offer.catalogue_version='electricity-pilot-v1' AND offer.service_code<>'electricite.diagnostic' AND effective IS NULL THEN
  IF EXISTS(SELECT 1 FROM fixeo_private.electricity_prework_v1 WHERE mission_id=NEW.id AND artisan_id IS DISTINCT FROM NEW.artisan_profile_id) THEN
   RAISE EXCEPTION 'Pre-work artisan is immutable';
  END IF;
  IF (NEW.status IN ('done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.electricity_prework_v1 WHERE mission_id=NEW.id AND artisan_id=NEW.artisan_profile_id AND offer_id=bound
  ) THEN RAISE EXCEPTION 'Electrical pre-work checks required before completion or settlement' USING ERRCODE='22023'; END IF;
 END IF;
 IF offer.catalogue_version='climatisation-pilot-v1' AND effective IS NULL THEN
  IF offer.service_code IN ('climatisation.installation.standard','climatisation.installation.mono_split_5m') AND (NEW.status IN ('pending','done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.climatisation_offer_checks_v1 WHERE request_id::text=NEW.request_id AND artisan_id=NEW.artisan_profile_id AND offer_id=bound
  ) THEN RAISE EXCEPTION 'Climatisation kit and capability confirmation required before acceptance' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=NEW.id AND artisan_id IS DISTINCT FROM NEW.artisan_profile_id) THEN
   RAISE EXCEPTION 'Pre-work artisan is immutable';
  END IF;
  IF offer.service_code<>'climatisation.diagnostic' AND (NEW.status IN ('done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=NEW.id AND artisan_id=NEW.artisan_profile_id AND offer_id=bound
  ) THEN RAISE EXCEPTION 'Climatisation pre-work checks required before completion or settlement' USING ERRCODE='22023'; END IF;
  IF offer.service_code IN ('climatisation.installation.standard','climatisation.installation.mono_split_5m') AND (NEW.status IN ('done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.climatisation_completion_v1 WHERE mission_id=NEW.id AND artisan_id=NEW.artisan_profile_id AND offer_id=bound
  ) THEN RAISE EXCEPTION 'Climatisation commissioning checks required before completion or settlement' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.final_price IS NOT NULL AND NEW.final_price IS DISTINCT FROM offer.client_total_minor::numeric/100 THEN RAISE EXCEPTION 'New scope requires a new accepted offer'; END IF;
 IF TG_OP='UPDATE' AND OLD.final_price IS NOT NULL AND NEW.final_price IS NULL THEN RAISE EXCEPTION 'Cannot clear settlement'; END IF;
 NEW.pricing_offer_id:=bound;
 NEW.agreed_price:=offer.client_total_minor::numeric/100;
 NEW.commission_amount:=offer.commission_minor::numeric/100;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.mission_vap_amounts() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.climatisation_prework_artisan_v1(p_mission_id uuid,p_professional_checks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE; tariff jsonb; previous fixeo_private.climatisation_prework_v1%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501';
 END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 tariff:=fixeo_private.climatisation_tariff_v1(o.service_code);
 IF tariff IS NULL OR o.service_code='climatisation.diagnostic' OR o.catalogue_version IS DISTINCT FROM 'climatisation-pilot-v1'
  OR r.pricing_offer_id IS DISTINCT FROM o.id OR p_professional_checks IS DISTINCT FROM tariff->'professional_checks' THEN
  RAISE EXCEPTION 'Professional checks and repair scope must be confirmed' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=m.id;
 IF FOUND THEN
  IF previous.artisan_id IS DISTINCT FROM m.artisan_profile_id OR previous.offer_id IS DISTINCT FROM o.id OR previous.professional_checks IS DISTINCT FROM p_professional_checks THEN
   RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023';
  END IF;
  RETURN fixeo_private.climatisation_state_v1(m.id);
 END IF;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL
  OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid') THEN
  RAISE EXCEPTION 'Pre-work checks unavailable for this mission state' USING ERRCODE='22023';
 END IF;
 INSERT INTO fixeo_private.climatisation_prework_v1(mission_id,offer_id,artisan_id,professional_checks) VALUES(m.id,o.id,m.artisan_profile_id,p_professional_checks);
 RETURN fixeo_private.climatisation_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.climatisation_prework_artisan_v1(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.climatisation_prework_artisan_v1(uuid,jsonb) TO authenticated;

-- Read/attest only for an active opportunity owned by the authenticated artisan.
-- The financial mission trigger enforces this record on BOTH legacy and V2 acceptance.
CREATE OR REPLACE FUNCTION public.climatisation_offer_artisan_v1(p_request_id uuid,p_professional_checks jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE aid uuid; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE; tariff jsonb;
 previous fixeo_private.climatisation_offer_checks_v1%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT id INTO aid FROM public.artisans WHERE owner_user_id=auth.uid() LIMIT 1;
 SELECT * INTO r FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF aid IS NULL OR NOT FOUND OR NOT (
  EXISTS(SELECT 1 FROM public.dispatch_execution_queue WHERE request_id=p_request_id AND artisan_id=aid AND execution_status IN ('QUEUED','CONTACTED','ACCEPTED'))
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=p_request_id::text AND artisan_profile_id=aid AND status IN ('offered','pending'))
 ) THEN RAISE EXCEPTION 'Opportunity not available' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=r.pricing_offer_id;
 tariff:=fixeo_private.climatisation_tariff_v1(o.service_code);
 IF o.catalogue_version IS DISTINCT FROM 'climatisation-pilot-v1' OR tariff->>'installation' IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
 SELECT * INTO previous FROM fixeo_private.climatisation_offer_checks_v1 WHERE request_id=p_request_id AND artisan_id=aid;
 IF FOUND AND (previous.offer_id IS DISTINCT FROM o.id OR (p_professional_checks IS NOT NULL AND previous.professional_checks IS DISTINCT FROM p_professional_checks)) THEN
  RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023';
 END IF;
 IF p_professional_checks IS NOT NULL AND previous.request_id IS NULL THEN
  IF r.status IS DISTINCT FROM 'new' OR p_professional_checks IS DISTINCT FROM tariff->'offer_checks' THEN
   RAISE EXCEPTION 'Confirm installation kit, capability and fixed total before acceptance' USING ERRCODE='22023';
  END IF;
  INSERT INTO fixeo_private.climatisation_offer_checks_v1(request_id,offer_id,artisan_id,professional_checks) VALUES(r.id,o.id,aid,p_professional_checks);
 END IF;
 RETURN jsonb_build_object('service_code',o.service_code,'label',tariff->>'label','scope',tariff->>'scope',
  'client_total_minor',o.client_total_minor,'vap_minor',o.vap_minor,'materials_minor',o.materials_minor,'commission_minor',o.commission_minor,
  'confirmed',EXISTS(SELECT 1 FROM fixeo_private.climatisation_offer_checks_v1 WHERE request_id=r.id AND artisan_id=aid AND offer_id=o.id));
END $$;
REVOKE ALL ON FUNCTION public.climatisation_offer_artisan_v1(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.climatisation_offer_artisan_v1(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.climatisation_completion_artisan_v1(p_mission_id uuid,p_professional_checks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE;
 previous fixeo_private.climatisation_completion_v1%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 IF o.catalogue_version IS DISTINCT FROM 'climatisation-pilot-v1' OR fixeo_private.climatisation_tariff_v1(o.service_code)->>'installation' IS DISTINCT FROM 'true'
  OR r.pricing_offer_id IS DISTINCT FROM o.id OR p_professional_checks IS DISTINCT FROM '{"tightness_verified":true,"vacuum_completed":true,"commissioning_successful":true}'::jsonb
  OR NOT EXISTS(SELECT 1 FROM fixeo_private.climatisation_prework_v1 WHERE mission_id=m.id AND offer_id=o.id AND artisan_id=m.artisan_profile_id) THEN
  RAISE EXCEPTION 'Installation pre-work and actual commissioning checks required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.climatisation_completion_v1 WHERE mission_id=m.id;
 IF FOUND THEN
  IF previous.offer_id IS DISTINCT FROM o.id OR previous.artisan_id IS DISTINCT FROM m.artisan_profile_id OR previous.professional_checks IS DISTINCT FROM p_professional_checks THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.climatisation_state_v1(m.id);
 END IF;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('paid','payée') THEN RAISE EXCEPTION 'Commissioning unavailable for this mission state' USING ERRCODE='22023'; END IF;
 INSERT INTO fixeo_private.climatisation_completion_v1(mission_id,offer_id,artisan_id,professional_checks) VALUES(m.id,o.id,m.artisan_profile_id,p_professional_checks);
 RETURN fixeo_private.climatisation_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.climatisation_completion_artisan_v1(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.climatisation_completion_artisan_v1(uuid,jsonb) TO authenticated;
