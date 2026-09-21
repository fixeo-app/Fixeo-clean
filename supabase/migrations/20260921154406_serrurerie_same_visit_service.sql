-- Serrurerie pilot: immutable proposals and client decisions; original offers remain bound.
-- No historical mission or request is updated by this migration.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('fixeo_private.mission_vap_amounts()'::regprocedure))<>'04c2261556061bc8f1ae80f1bf51e40e' THEN
  RAISE EXCEPTION 'Shared VAP trigger changed since audited climatisation release';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION fixeo_private.serrurerie_tariff_v1(code text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT ($tariffs${"serrurerie.diagnostic":{"label":"Diagnostic serrurerie — 30 minutes maximum","scope":"Une porte de logement, examen non destructif et explication des constats, jusqu’à 30 minutes sur place. Sans ouverture, réparation, fourniture, ni garantie de résolution. Commande explicite avant déplacement.","vap_minor":16000,"materials_minor":0,"commission_minor":6000,"total_minor":22000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_work":"DIAGNOSTIC"},"client_part":false,"followup":false,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"diagnostic_limits_accepted":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"diagnostic_limits_accepted":true},"completion_checks":{"assessment_performed":true,"findings_and_next_steps_explained":true}},"serrurerie.porte_claquee_ouverture":{"label":"Ouverture porte standard simplement claquée","scope":"Une porte non blindée refermée sans verrouillage, mécanisme compatible et intact. Ouverture sans dégradation et essai. Sans remplacement ni réparation de porte ou bâti.","vap_minor":20000,"materials_minor":0,"commission_minor":6000,"total_minor":26000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_door_type":"STANDARD_MECHANICAL","locksmith_door_state":"SLAMMED_NOT_LOCKED","locksmith_work":"OPEN_SLAMMED_STANDARD"},"client_part":false,"followup":true,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"non_destructive_opening_feasible":true,"mechanism_intact_and_not_locked":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"non_destructive_opening_feasible":true,"mechanism_intact_and_not_locked":true},"completion_checks":{"door_opened_without_damage":true,"operation_test_completed":true}},"serrurerie.porte_claquee_blindee.ouverture":{"label":"Ouverture porte blindée simplement claquée — modèle compatible","scope":"Une porte blindée refermée, points de verrouillage non engagés et modèle compatible confirmé par le professionnel. Ouverture sans dégradation. Modèle inconnu, verrouillage automatique ou engagé, panne, équipement électrique/connecté : devis.","vap_minor":30000,"materials_minor":0,"commission_minor":6000,"total_minor":36000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_door_type":"SECURITY_MECHANICAL","locksmith_door_state":"SLAMMED_NOT_LOCKED","locksmith_work":"OPEN_SLAMMED_SECURITY"},"client_part":false,"followup":true,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"model_and_non_destructive_feasibility_confirmed":true,"locking_points_not_engaged":true,"no_auto_lock_or_electronics":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"model_and_non_destructive_feasibility_confirmed":true,"locking_points_not_engaged":true,"no_auto_lock_or_electronics":true},"completion_checks":{"door_opened_without_damage":true,"operation_test_completed":true}},"serrurerie.cle_cassee_extraction":{"label":"Extraction clé cassée — porte déjà ouverte","scope":"Un fragment dans un cylindre mécanique standard sur porte déjà ouverte. Extraction sans dommage et essai avec un double fonctionnel disponible. Sans ouverture ni reproduction de clé ; cylindre endommagé, porte fermée ou sécurité spéciale : qualification/devis.","vap_minor":20000,"materials_minor":0,"commission_minor":6000,"total_minor":26000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_door_type":"STANDARD_MECHANICAL","locksmith_door_state":"ALREADY_OPEN","locksmith_test_key":"WORKING_DUPLICATE_AVAILABLE","locksmith_work":"EXTRACT_BROKEN_KEY"},"client_part":false,"followup":true,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"cylinder_condition_and_extraction_feasible":true,"working_duplicate_available":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"cylinder_condition_and_extraction_feasible":true,"working_duplicate_available":true},"completion_checks":{"fragment_extracted_without_damage":true,"operation_test_with_duplicate_completed":true}},"serrurerie.cylindre_remplacement.standard":{"label":"Remplacement cylindre standard — pièce client","scope":"Un cylindre mécanique standard à l’identique, pièce compatible fournie par le client et validée avant réservation. Porte ouverte, ancien cylindre démontable normalement et clé disponible. Dépose, pose et essais ; sans ouverture, retrait forcé, modification de porte, mécanisme multipoints ou équipement spécial.","vap_minor":24000,"materials_minor":0,"commission_minor":6000,"total_minor":30000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_door_type":"STANDARD_MECHANICAL","locksmith_door_state":"ALREADY_OPEN","locksmith_part_supply":"CLIENT_PART_AVAILABLE","locksmith_test_key":"WORKING_KEY_AVAILABLE","locksmith_part_fit":"PRO_CONFIRMED_COMPATIBLE","locksmith_work":"REPLACE_STANDARD_CYLINDER"},"client_part":true,"followup":true,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"replacement_part_compatibility_verified":true,"existing_cylinder_removable_normally":true,"door_open_and_key_available":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"replacement_part_compatibility_verified":true,"existing_cylinder_removable_normally":true,"door_open_and_key_available":true},"completion_checks":{"part_installed_and_tested":true,"keys_handed_to_authorized_client":true,"old_part_return_offered":true}},"serrurerie.serrure_remplacement.standard":{"label":"Remplacement serrure monopoint à l’identique — pièce client","scope":"Une serrure mécanique monopoint, pièce client compatible, même format et fixations, porte ouverte. Dépose, pose, réglage simple et essais ; cylindre du nouvel ensemble posé sans seconde main-d’œuvre. Sans adaptation, soudure, nouvelle réservation dans la porte, multipoints ni motorisation.","vap_minor":34000,"materials_minor":0,"commission_minor":6000,"total_minor":40000,"inputs":{"locksmith_safety":"NO_IMMEDIATE_DANGER","locksmith_access_right":"DECLARED_AUTHORIZED_NO_DISPUTE","locksmith_presence":"AUTHORIZED_ADULT_PRESENT","locksmith_property":"RESIDENTIAL_PRIVATE_DOOR","locksmith_count":"ONE_DOOR","locksmith_slot":"DAY_08_20","locksmith_door_type":"STANDARD_MECHANICAL","locksmith_door_state":"ALREADY_OPEN","locksmith_part_supply":"CLIENT_PART_AVAILABLE","locksmith_test_key":"WORKING_KEY_AVAILABLE","locksmith_part_fit":"PRO_CONFIRMED_COMPATIBLE","locksmith_work":"REPLACE_MONOPOINT_LOCK"},"client_part":true,"followup":true,"offer_checks":{"competence_and_tools_confirmed":true,"fixed_price_scope_and_availability_confirmed":true,"replacement_part_compatibility_verified":true,"same_format_and_fixings":true,"monopoint_mechanical_only":true},"professional_checks":{"identity_and_access_right_verified_before_work":true,"mandate_verified_if_needed":true,"no_occupancy_dispute":true,"scope_and_safe_work_verified":true,"replacement_part_compatibility_verified":true,"same_format_and_fixings":true,"monopoint_mechanical_only":true},"completion_checks":{"part_installed_and_tested":true,"keys_handed_to_authorized_client":true,"old_part_return_offered":true}}}$tariffs$::jsonb)->code;
$fn$;
REVOKE ALL ON FUNCTION fixeo_private.serrurerie_tariff_v1(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE fixeo_private.serrurerie_proposals_v1 (
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
CREATE INDEX serrurerie_proposals_mission ON fixeo_private.serrurerie_proposals_v1(mission_id,sequence_id DESC);
CREATE TABLE fixeo_private.serrurerie_decisions_v1 (
 proposal_id uuid PRIMARY KEY REFERENCES fixeo_private.serrurerie_proposals_v1(id),
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 accepted boolean NOT NULL,
 consent_version text NOT NULL DEFAULT 'serrurerie-same-visit-v1' CHECK(consent_version='serrurerie-same-visit-v1'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX serrurerie_one_accepted_mission ON fixeo_private.serrurerie_decisions_v1(mission_id) WHERE accepted;
CREATE UNIQUE INDEX serrurerie_one_accepted_request ON fixeo_private.serrurerie_decisions_v1(request_id) WHERE accepted;
ALTER TABLE fixeo_private.serrurerie_proposals_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.serrurerie_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.serrurerie_proposals_v1,fixeo_private.serrurerie_decisions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION fixeo_private.serrurerie_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Serrurerie audit record is immutable'; END $$;
REVOKE ALL ON FUNCTION fixeo_private.serrurerie_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER serrurerie_proposal_immutable BEFORE UPDATE OR DELETE ON fixeo_private.serrurerie_proposals_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_immutable_v1();
CREATE TRIGGER serrurerie_decision_immutable BEFORE UPDATE OR DELETE ON fixeo_private.serrurerie_decisions_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_immutable_v1();

-- Only the assigned artisan may attest professional checks; customer scope is not an attestation.
CREATE TABLE fixeo_private.serrurerie_prework_v1 (
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 access_check_type text NOT NULL CHECK(access_check_type IN ('OCCUPANT_DOCUMENTS','AUTHORIZED_MANDATE')),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mission_id,offer_id)
);
ALTER TABLE fixeo_private.serrurerie_prework_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.serrurerie_prework_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER serrurerie_prework_immutable BEFORE UPDATE OR DELETE ON fixeo_private.serrurerie_prework_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_immutable_v1();

CREATE TABLE fixeo_private.serrurerie_offer_checks_v1 (
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,artisan_id)
);
CREATE TABLE fixeo_private.serrurerie_completion_v1 (
 mission_id uuid NOT NULL REFERENCES public.missions(id),
 offer_id uuid NOT NULL REFERENCES public.fixeo_pricing_offers_v1(id),
 artisan_id uuid NOT NULL REFERENCES public.artisans(id),
 professional_checks jsonb NOT NULL CHECK(jsonb_typeof(professional_checks)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mission_id,offer_id)
);
ALTER TABLE fixeo_private.serrurerie_offer_checks_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixeo_private.serrurerie_completion_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fixeo_private.serrurerie_offer_checks_v1,fixeo_private.serrurerie_completion_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER serrurerie_offer_checks_immutable BEFORE UPDATE OR DELETE ON fixeo_private.serrurerie_offer_checks_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_immutable_v1();
CREATE TRIGGER serrurerie_completion_immutable BEFORE UPDATE OR DELETE ON fixeo_private.serrurerie_completion_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_immutable_v1();

CREATE OR REPLACE FUNCTION fixeo_private.serrurerie_state_v1(mid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; original public.fixeo_pricing_offers_v1%ROWTYPE;
 o public.fixeo_pricing_offers_v1%ROWTYPE; p fixeo_private.serrurerie_proposals_v1%ROWTYPE;
 repair public.fixeo_pricing_offers_v1%ROWTYPE; decision boolean; has_decision boolean; credit bigint:=0;
 proposal jsonb:=NULL; can_change boolean; prework boolean; completed boolean;
BEGIN
 SELECT * INTO m FROM public.missions WHERE id=mid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO original FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 IF NOT FOUND OR original.catalogue_version<>'serrurerie-pilot-v1' OR fixeo_private.serrurerie_tariff_v1(original.service_code) IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id;
 can_change:=m.status='pending' AND r.status='in_progress' AND m.final_price IS NULL AND NOT coalesce(r.commission_paid,false) AND r.commission_paid_at IS NULL AND coalesce(r.commission_status,'') NOT IN ('payée','paid');
 o:=original;
 IF original.service_code='serrurerie.diagnostic' THEN
  SELECT * INTO p FROM fixeo_private.serrurerie_proposals_v1 WHERE mission_id=mid ORDER BY sequence_id DESC LIMIT 1;
  IF FOUND THEN
   SELECT accepted INTO decision FROM fixeo_private.serrurerie_decisions_v1 WHERE proposal_id=p.id; has_decision:=FOUND;
   SELECT * INTO STRICT repair FROM public.fixeo_pricing_offers_v1 WHERE id=p.repair_offer_id;
   IF decision IS TRUE THEN o:=repair; credit:=p.diagnostic_paid_minor; END IF;
   proposal:=jsonb_build_object('id',p.id,'service_code',repair.service_code,'label',repair.scope->>'label','scope',repair.scope->>'description',
    'client_total_minor',repair.client_total_minor,'vap_minor',repair.vap_minor,'commission_minor',repair.commission_minor,
    'diagnostic_paid_minor',p.diagnostic_paid_minor,'remaining_due_minor',repair.client_total_minor-p.diagnostic_paid_minor,
    'expires_at',repair.expires_at,'status',CASE WHEN has_decision THEN CASE WHEN decision THEN 'ACCEPTED' ELSE 'DECLINED' END WHEN NOT can_change OR repair.expires_at<=now() THEN 'EXPIRED' ELSE 'PENDING' END);
  END IF;
 END IF;
 prework:=EXISTS(SELECT 1 FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=mid AND offer_id=o.id AND artisan_id=m.artisan_profile_id);
 completed:=EXISTS(SELECT 1 FROM fixeo_private.serrurerie_completion_v1 WHERE mission_id=mid AND offer_id=o.id AND artisan_id=m.artisan_profile_id);
 -- No proof type, identity number, document or raw professional attestation in this shared/public view.
 RETURN jsonb_build_object('mission_id',mid,'direct_service_code',o.service_code,'can_confirm_prework',can_change,
  'can_propose',can_change AND o.service_code='serrurerie.diagnostic' AND prework AND completed,
  'current_total_minor',o.client_total_minor,'vap_minor',o.vap_minor,'materials_minor',o.materials_minor,'commission_minor',o.commission_minor,
  'prework_confirmed',prework,'completion_required',true,'completion_confirmed',completed,
  'diagnostic_paid_minor',credit,'remaining_due_minor',o.client_total_minor-credit,'proposal',proposal);
END $$;
REVOKE ALL ON FUNCTION fixeo_private.serrurerie_state_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Authenticated artisan can inspect/propose only for their own assigned mission.
CREATE OR REPLACE FUNCTION public.serrurerie_repair_artisan_v1(
 p_mission_id uuid,p_service_code text DEFAULT NULL,p_inputs jsonb DEFAULT '{}',
 p_paid_minor bigint DEFAULT 0,p_proposal_id uuid DEFAULT NULL,p_same_visit boolean DEFAULT false,
 p_professional_checks jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; original public.fixeo_pricing_offers_v1%ROWTYPE;
 tariff jsonb; previous fixeo_private.serrurerie_proposals_v1%ROWTYPE; repair_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501';
 END IF;
 IF p_service_code IS NULL THEN RETURN fixeo_private.serrurerie_state_v1(m.id); END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO original FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 tariff:=fixeo_private.serrurerie_tariff_v1(p_service_code);
 IF tariff IS NULL OR tariff->>'followup' IS DISTINCT FROM 'true' OR p_inputs IS DISTINCT FROM tariff->'inputs'
  OR p_professional_checks IS DISTINCT FROM tariff->'professional_checks' OR p_same_visit IS DISTINCT FROM true OR p_paid_minor IS NULL OR p_paid_minor NOT IN (0,22000) OR p_proposal_id IS NULL THEN
  RAISE EXCEPTION 'Repair scope, cash credit and same visit must be confirmed' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.serrurerie_proposals_v1 WHERE id=p_proposal_id;
 IF FOUND THEN
  IF previous.mission_id IS DISTINCT FROM m.id OR previous.artisan_id IS DISTINCT FROM m.artisan_profile_id
   OR previous.diagnostic_paid_minor IS DISTINCT FROM p_paid_minor OR NOT EXISTS(
    SELECT 1 FROM public.fixeo_pricing_offers_v1 WHERE id=previous.repair_offer_id AND service_code=p_service_code AND scope->'inputs'=p_inputs AND scope->'professional_checks'=p_professional_checks
   ) THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.serrurerie_state_v1(m.id);
 END IF;
 IF original.service_code IS DISTINCT FROM 'serrurerie.diagnostic' OR original.catalogue_version IS DISTINCT FROM 'serrurerie-pilot-v1'
  OR original.client_total_minor IS DISTINCT FROM 22000 OR original.commission_minor IS DISTINCT FROM 6000
  OR r.pricing_offer_id IS DISTINCT FROM original.id OR m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress'
  OR m.final_price IS NOT NULL OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid')
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR NOT EXISTS(SELECT 1 FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=m.id AND offer_id=original.id AND artisan_id=m.artisan_profile_id)
  OR NOT EXISTS(SELECT 1 FROM fixeo_private.serrurerie_completion_v1 WHERE mission_id=m.id AND offer_id=original.id AND artisan_id=m.artisan_profile_id)
  OR EXISTS(SELECT 1 FROM fixeo_private.serrurerie_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Same visit repair is not available' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.fixeo_pricing_offers_v1(offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
 VALUES(gen_random_uuid(),'vap-bp33-v1','MAD',p_service_code,'serrurerie-pilot-v1',original.city,
  jsonb_build_object('kind','SAME_VISIT_REPAIR','mission_id',m.id,'original_offer_id',original.id,'inputs',p_inputs,'professional_checks',p_professional_checks,'label',tariff->>'label','description',tariff->>'scope'),
  (tariff->>'vap_minor')::bigint,0,6000,(tariff->>'total_minor')::bigint,clock_timestamp()+interval '45 minutes') RETURNING id INTO repair_id;
 INSERT INTO fixeo_private.serrurerie_proposals_v1(id,mission_id,request_id,artisan_id,original_offer_id,repair_offer_id,diagnostic_paid_minor,same_visit)
 VALUES(p_proposal_id,m.id,r.id,m.artisan_profile_id,original.id,repair_id,p_paid_minor,true);
 INSERT INTO fixeo_private.serrurerie_prework_v1(mission_id,offer_id,artisan_id,access_check_type,professional_checks)
 SELECT m.id,repair_id,m.artisan_profile_id,access_check_type,p_professional_checks FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=m.id AND offer_id=original.id AND artisan_id=m.artisan_profile_id;
 RETURN fixeo_private.serrurerie_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.serrurerie_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.serrurerie_repair_artisan_v1(uuid,text,jsonb,bigint,uuid,boolean,jsonb) TO authenticated;

-- Server-only guest API: token is hashed by the server and checked again in the transaction.
CREATE OR REPLACE FUNCTION public.serrurerie_repair_guest_v1(
 p_tracking_ref text,p_guest_hash text,p_action text DEFAULT 'read',p_proposal_id uuid DEFAULT NULL,p_expected_paid_minor bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.service_requests%ROWTYPE; m public.missions%ROWTYPE; p fixeo_private.serrurerie_proposals_v1%ROWTYPE;
 repair public.fixeo_pricing_offers_v1%ROWTYPE; decision boolean;
BEGIN
 SELECT * INTO r FROM public.service_requests WHERE tracking_ref=p_tracking_ref;
 IF NOT FOUND OR r.guest_token_hash IS NULL OR p_guest_hash IS NULL OR p_guest_hash<>r.guest_token_hash THEN
  RAISE EXCEPTION 'Request not found' USING ERRCODE='42501';
 END IF;
 IF p_action='read' THEN
  SELECT * INTO m FROM public.missions WHERE request_id=r.id::text AND status IN ('pending','done','validated') ORDER BY id LIMIT 1;
  RETURN fixeo_private.serrurerie_state_v1(m.id);
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM fixeo_private.serrurerie_proposals_v1 WHERE id=p_proposal_id AND request_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE='22023'; END IF;
 -- Same locking order as proposal, lifecycle and financial mission updates.
 SELECT * INTO m FROM public.missions WHERE id=p.mission_id FOR UPDATE;
 SELECT * INTO r FROM public.service_requests WHERE id=p.request_id FOR UPDATE;
 IF p_guest_hash IS DISTINCT FROM r.guest_token_hash THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF p_expected_paid_minor IS DISTINCT FROM p.diagnostic_paid_minor THEN RAISE EXCEPTION 'Cash credit must match the displayed proposal' USING ERRCODE='22023'; END IF;
 SELECT accepted INTO decision FROM fixeo_private.serrurerie_decisions_v1 WHERE proposal_id=p.id;
 IF FOUND THEN
  IF decision IS DISTINCT FROM (p_action='accept') THEN RAISE EXCEPTION 'Decision already recorded' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.serrurerie_state_v1(m.id);
 END IF;
 SELECT * INTO STRICT repair FROM public.fixeo_pricing_offers_v1 WHERE id=p.repair_offer_id;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL
  OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid') OR repair.expires_at<=now()
  OR m.artisan_profile_id IS DISTINCT FROM p.artisan_id OR m.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR r.pricing_offer_id IS DISTINCT FROM p.original_offer_id
  OR EXISTS(SELECT 1 FROM fixeo_private.serrurerie_proposals_v1 WHERE mission_id=m.id AND sequence_id>p.sequence_id)
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=r.id::text AND id<>m.id AND status IN ('pending','done','validated'))
  OR EXISTS(SELECT 1 FROM fixeo_private.serrurerie_decisions_v1 WHERE request_id=r.id AND accepted) THEN
  RAISE EXCEPTION 'Proposal no longer available' USING ERRCODE='22023';
 END IF;
 INSERT INTO fixeo_private.serrurerie_decisions_v1(proposal_id,mission_id,request_id,accepted) VALUES(p.id,m.id,r.id,p_action='accept');
 IF p_action='accept' THEN UPDATE public.missions SET agreed_price=agreed_price WHERE id=m.id; END IF;
 RETURN fixeo_private.serrurerie_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.serrurerie_repair_guest_v1(text,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.serrurerie_repair_guest_v1(text,text,text,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.serrurerie_repair_admin_v1(p_mission_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT fixeo_private.serrurerie_state_v1(p_mission_id); $$;
REVOKE ALL ON FUNCTION public.serrurerie_repair_admin_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.serrurerie_repair_admin_v1(uuid) TO service_role;

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
  IF EXISTS(SELECT 1 FROM (SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.plumbing_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.electricity_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.climatisation_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.serrurerie_decisions_v1) d WHERE request_id::text=NEW.request_id AND mission_id<>OLD.id AND accepted) AND (NEW.status IS DISTINCT FROM 'cancelled' OR NEW.final_price IS NOT NULL) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
  SELECT a.repair_offer_id,a.artisan_id INTO effective,accepted_artisan FROM (SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.plumbing_decisions_v1 d JOIN fixeo_private.plumbing_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted UNION ALL SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.electricity_decisions_v1 d JOIN fixeo_private.electricity_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted UNION ALL SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.climatisation_decisions_v1 d JOIN fixeo_private.climatisation_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted UNION ALL SELECT d.mission_id,p.repair_offer_id,p.artisan_id FROM fixeo_private.serrurerie_decisions_v1 d JOIN fixeo_private.serrurerie_proposals_v1 p ON p.id=d.proposal_id WHERE d.accepted) a WHERE a.mission_id=OLD.id;
  IF effective IS NOT NULL AND NEW.artisan_profile_id IS DISTINCT FROM accepted_artisan THEN RAISE EXCEPTION 'Accepted same visit artisan is immutable'; END IF;
 ELSE
  SELECT pricing_offer_id INTO bound FROM public.service_requests WHERE id::text=NEW.request_id;
  IF NEW.pricing_offer_id IS NOT NULL AND NEW.pricing_offer_id IS DISTINCT FROM bound THEN RAISE EXCEPTION 'Offer mismatch'; END IF;
  IF bound IS NULL THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM (SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.plumbing_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.electricity_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.climatisation_decisions_v1 UNION ALL SELECT proposal_id,mission_id,request_id,accepted FROM fixeo_private.serrurerie_decisions_v1) d WHERE request_id::text=NEW.request_id AND accepted) THEN RAISE EXCEPTION 'Accepted repair already has its mission'; END IF;
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
 IF offer.catalogue_version='serrurerie-pilot-v1' THEN
  IF effective IS NULL AND (NEW.status IN ('pending','done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.serrurerie_offer_checks_v1 WHERE request_id::text=NEW.request_id AND artisan_id=NEW.artisan_profile_id AND offer_id=bound
  ) THEN RAISE EXCEPTION 'Serrurerie scope and capability confirmation required before acceptance' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=NEW.id AND artisan_id IS DISTINCT FROM NEW.artisan_profile_id) THEN
   RAISE EXCEPTION 'Pre-work artisan is immutable';
  END IF;
  IF (NEW.status IN ('done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=NEW.id AND artisan_id=NEW.artisan_profile_id AND offer_id=offer.id
  ) THEN RAISE EXCEPTION 'Serrurerie access and pre-work checks required before completion or settlement' USING ERRCODE='22023'; END IF;
  IF (NEW.status IN ('done','validated') OR NEW.final_price IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM fixeo_private.serrurerie_completion_v1 WHERE mission_id=NEW.id AND artisan_id=NEW.artisan_profile_id AND offer_id=offer.id
  ) THEN RAISE EXCEPTION 'Serrurerie result confirmation required before completion or settlement' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.final_price IS NOT NULL AND NEW.final_price IS DISTINCT FROM offer.client_total_minor::numeric/100 THEN RAISE EXCEPTION 'New scope requires a new accepted offer'; END IF;
 IF TG_OP='UPDATE' AND OLD.final_price IS NOT NULL AND NEW.final_price IS NULL THEN RAISE EXCEPTION 'Cannot clear settlement'; END IF;
 NEW.pricing_offer_id:=bound;
 NEW.agreed_price:=offer.client_total_minor::numeric/100;
 NEW.commission_amount:=offer.commission_minor::numeric/100;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.mission_vap_amounts() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.serrurerie_prework_artisan_v1(p_mission_id uuid,p_professional_checks jsonb,p_access_check_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE; tariff jsonb; previous fixeo_private.serrurerie_prework_v1%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501';
 END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=m.pricing_offer_id;
 tariff:=fixeo_private.serrurerie_tariff_v1(o.service_code);
 IF tariff IS NULL OR p_access_check_type IS NULL OR p_access_check_type NOT IN ('OCCUPANT_DOCUMENTS','AUTHORIZED_MANDATE') OR o.catalogue_version IS DISTINCT FROM 'serrurerie-pilot-v1'
  OR r.pricing_offer_id IS DISTINCT FROM o.id OR p_professional_checks IS DISTINCT FROM tariff->'professional_checks'
  OR EXISTS(SELECT 1 FROM fixeo_private.serrurerie_decisions_v1 WHERE mission_id=m.id AND accepted) THEN
  RAISE EXCEPTION 'Professional checks and repair scope must be confirmed' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=m.id AND offer_id=o.id;
 IF FOUND THEN
  IF previous.artisan_id IS DISTINCT FROM m.artisan_profile_id OR previous.offer_id IS DISTINCT FROM o.id OR previous.professional_checks IS DISTINCT FROM p_professional_checks OR previous.access_check_type IS DISTINCT FROM p_access_check_type THEN
   RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023';
  END IF;
  RETURN fixeo_private.serrurerie_state_v1(m.id);
 END IF;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL
  OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('payée','paid') THEN
  RAISE EXCEPTION 'Pre-work checks unavailable for this mission state' USING ERRCODE='22023';
 END IF;
 INSERT INTO fixeo_private.serrurerie_prework_v1(mission_id,offer_id,artisan_id,access_check_type,professional_checks) VALUES(m.id,o.id,m.artisan_profile_id,p_access_check_type,p_professional_checks);
 RETURN fixeo_private.serrurerie_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.serrurerie_prework_artisan_v1(uuid,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.serrurerie_prework_artisan_v1(uuid,jsonb,text) TO authenticated;

-- Read/attest only for an active opportunity owned by the authenticated artisan.
-- The financial mission trigger enforces this record on BOTH legacy and V2 acceptance.
CREATE OR REPLACE FUNCTION public.serrurerie_offer_artisan_v1(p_request_id uuid,p_professional_checks jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE aid uuid; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE; tariff jsonb;
 previous fixeo_private.serrurerie_offer_checks_v1%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT id INTO aid FROM public.artisans WHERE owner_user_id=auth.uid() LIMIT 1;
 SELECT * INTO r FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF aid IS NULL OR NOT FOUND OR NOT (
  EXISTS(SELECT 1 FROM public.dispatch_execution_queue WHERE request_id=p_request_id AND artisan_id=aid AND execution_status IN ('QUEUED','CONTACTED','ACCEPTED'))
  OR EXISTS(SELECT 1 FROM public.missions WHERE request_id=p_request_id::text AND artisan_profile_id=aid AND status IN ('offered','pending'))
 ) THEN RAISE EXCEPTION 'Opportunity not available' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=r.pricing_offer_id;
 tariff:=fixeo_private.serrurerie_tariff_v1(o.service_code);
 IF o.catalogue_version IS DISTINCT FROM 'serrurerie-pilot-v1' OR tariff IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO previous FROM fixeo_private.serrurerie_offer_checks_v1 WHERE request_id=p_request_id AND artisan_id=aid;
 IF FOUND AND (previous.offer_id IS DISTINCT FROM o.id OR (p_professional_checks IS NOT NULL AND previous.professional_checks IS DISTINCT FROM p_professional_checks)) THEN
  RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023';
 END IF;
 IF p_professional_checks IS NOT NULL AND previous.request_id IS NULL THEN
  IF r.status IS DISTINCT FROM 'new' OR p_professional_checks IS DISTINCT FROM tariff->'offer_checks' THEN
   RAISE EXCEPTION 'Confirm serrurerie scope, capability and fixed total before acceptance' USING ERRCODE='22023';
  END IF;
  INSERT INTO fixeo_private.serrurerie_offer_checks_v1(request_id,offer_id,artisan_id,professional_checks) VALUES(r.id,o.id,aid,p_professional_checks);
 END IF;
 RETURN jsonb_build_object('service_code',o.service_code,'label',tariff->>'label','scope',tariff->>'scope',
  'client_total_minor',o.client_total_minor,'vap_minor',o.vap_minor,'materials_minor',o.materials_minor,'commission_minor',o.commission_minor,
  'confirmed',EXISTS(SELECT 1 FROM fixeo_private.serrurerie_offer_checks_v1 WHERE request_id=r.id AND artisan_id=aid AND offer_id=o.id));
END $$;
REVOKE ALL ON FUNCTION public.serrurerie_offer_artisan_v1(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.serrurerie_offer_artisan_v1(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.serrurerie_completion_artisan_v1(p_mission_id uuid,p_professional_checks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.missions%ROWTYPE; r public.service_requests%ROWTYPE; o public.fixeo_pricing_offers_v1%ROWTYPE;
 previous fixeo_private.serrurerie_completion_v1%ROWTYPE; effective uuid; tariff jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.artisans WHERE id=m.artisan_profile_id AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Mission not available' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.service_requests WHERE id::text=m.request_id FOR UPDATE;
 SELECT p.repair_offer_id INTO effective FROM fixeo_private.serrurerie_decisions_v1 d JOIN fixeo_private.serrurerie_proposals_v1 p ON p.id=d.proposal_id WHERE d.mission_id=m.id AND d.accepted;
 SELECT * INTO o FROM public.fixeo_pricing_offers_v1 WHERE id=coalesce(effective,m.pricing_offer_id);
 tariff:=fixeo_private.serrurerie_tariff_v1(o.service_code);
 IF o.catalogue_version IS DISTINCT FROM 'serrurerie-pilot-v1' OR tariff IS NULL
  OR r.pricing_offer_id IS DISTINCT FROM m.pricing_offer_id OR p_professional_checks IS DISTINCT FROM tariff->'completion_checks'
  OR NOT EXISTS(SELECT 1 FROM fixeo_private.serrurerie_prework_v1 WHERE mission_id=m.id AND offer_id=o.id AND artisan_id=m.artisan_profile_id) THEN
  RAISE EXCEPTION 'Serrurerie access, pre-work and actual result checks required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO previous FROM fixeo_private.serrurerie_completion_v1 WHERE mission_id=m.id AND offer_id=o.id;
 IF FOUND THEN
  IF previous.offer_id IS DISTINCT FROM o.id OR previous.artisan_id IS DISTINCT FROM m.artisan_profile_id OR previous.professional_checks IS DISTINCT FROM p_professional_checks THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF;
  RETURN fixeo_private.serrurerie_state_v1(m.id);
 END IF;
 IF m.status IS DISTINCT FROM 'pending' OR r.status IS DISTINCT FROM 'in_progress' OR m.final_price IS NOT NULL OR coalesce(r.commission_paid,false) OR r.commission_paid_at IS NOT NULL OR coalesce(r.commission_status,'') IN ('paid','payée') THEN RAISE EXCEPTION 'Result confirmation unavailable for this mission state' USING ERRCODE='22023'; END IF;
 INSERT INTO fixeo_private.serrurerie_completion_v1(mission_id,offer_id,artisan_id,professional_checks) VALUES(m.id,o.id,m.artisan_profile_id,p_professional_checks);
 RETURN fixeo_private.serrurerie_state_v1(m.id);
END $$;
REVOKE ALL ON FUNCTION public.serrurerie_completion_artisan_v1(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.serrurerie_completion_artisan_v1(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION fixeo_private.serrurerie_offer_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tariff jsonb;
BEGIN
 IF NEW.service_code NOT LIKE 'serrurerie.%' THEN RETURN NEW; END IF;
 tariff:=fixeo_private.serrurerie_tariff_v1(NEW.service_code);
 IF tariff IS NULL OR NEW.catalogue_version IS DISTINCT FROM 'serrurerie-pilot-v1'
  OR NEW.pricing_version IS DISTINCT FROM 'vap-bp33-v1' OR NEW.currency IS DISTINCT FROM 'MAD'
  OR NEW.scope->'inputs' IS DISTINCT FROM tariff->'inputs'
  OR NEW.vap_minor IS DISTINCT FROM (tariff->>'vap_minor')::bigint OR NEW.materials_minor IS DISTINCT FROM 0
  OR NEW.commission_minor IS DISTINCT FROM 6000 OR NEW.client_total_minor IS DISTINCT FROM (tariff->>'total_minor')::bigint
  OR NEW.city IS NULL OR NEW.city NOT IN ('agadir','beni-mellal','casablanca','el-jadida','fes','kenitra','khouribga','marrakech','meknes','mohammedia','nador','ouarzazate','oujda','rabat','safi','sale','tanger','taza','temara','tetouan') THEN
  RAISE EXCEPTION 'Serrurerie offer requires approved city, exact scope and tariff' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fixeo_private.serrurerie_offer_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER serrurerie_offer_guard BEFORE INSERT ON public.fixeo_pricing_offers_v1 FOR EACH ROW EXECUTE FUNCTION fixeo_private.serrurerie_offer_guard_v1();
REVOKE ALL ON SEQUENCE fixeo_private.serrurerie_proposals_v1_sequence_id_seq FROM PUBLIC,anon,authenticated,service_role;
