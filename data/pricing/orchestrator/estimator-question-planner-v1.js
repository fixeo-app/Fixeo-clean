'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Question Planner
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Minimum-question planner implementing frozen priority order:
 * 1. SAFETY
 * 2. ROUTING_BOUNDARY
 * 3. SERVICE_IDENTITY
 * 4. ELIGIBILITY
 * 5. QUANTITY_MEASUREMENT
 * 6. PARTS_MATERIAL
 * 7. COMMERCIAL_CLARIFICATION
 *
 * City and urgency are NEVER asked as pricing questions.
 * Already-known inputs are NEVER asked again.
 */

var path = require('path');
var INPUTS_PATH = path.join(__dirname, '../consolidation/canonical-inputs.v1.draft.json');
var INPUTS = null;
function getInputs() {
  if (!INPUTS) INPUTS = require(INPUTS_PATH);
  return INPUTS;
}

var resolver = require('./estimator-service-resolver-v1');

// Priority order (lower = asked first)
var PRIORITY_ORDER = ['SAFETY', 'ROUTING_BOUNDARY', 'SERVICE_IDENTITY', 'ELIGIBILITY', 'QUANTITY_MEASUREMENT', 'PARTS_MATERIAL', 'COMMERCIAL_CLARIFICATION'];

/**
 * Hard-coded per-service question plans.
 * Derived from canonical eligibility conditions + exclusions + measurement fields.
 * City/urgency intentionally absent.
 */
var SERVICE_QUESTION_PLANS = {
  // ── PLOMBERIE ──────────────────────────────────────────────────────────────
  'plomberie.diagnostic': {
    questions: []
  },
  'plomberie.fuite_simple': {
    questions: [
      { input_id: 'leak_location_confirmed', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'plomberie.fuite_simple.leak_confirmed' },
    ]
  },
  'plomberie.debouchage_evier': {
    questions: []
  },
  'plomberie.debouchage_wc_simple': {
    questions: []
  },
  'plomberie.robinet_remplacement': {
    questions: [
      { input_id: 'part_replacement_required', priority: 'PARTS_MATERIAL', answer_type: 'boolean', prompt_key: 'plomberie.robinet.part_required' },
    ]
  },
  'plomberie.chasse_eau': {
    questions: [
      { input_id: 'part_replacement_required', priority: 'PARTS_MATERIAL', answer_type: 'boolean', prompt_key: 'plomberie.chasse_eau.part_required' },
    ]
  },

  // ── ELECTRICITE ────────────────────────────────────────────────────────────
  'electricite.diagnostic': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
      { input_id: 'scorch_marks', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.scorch_marks' },
    ]
  },
  'electricite.prise_remplacement': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
    ]
  },
  'electricite.interrupteur_remplacement.simple': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
    ]
  },
  'electricite.interrupteur_remplacement.va_et_vient': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
    ]
  },
  'electricite.luminaire_installation': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
      { input_id: 'ddr_rcd_involved', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'electricite.routing.ddr_rcd' },
    ]
  },
  'electricite.disjoncteur_remplacement': {
    questions: [
      { input_id: 'burning_smell', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.burning_smell' },
      { input_id: 'scorch_marks', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'electricite.safety.scorch_marks' },
      { input_id: 'distributor_equipment_involved', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'electricite.routing.distributor' },
      { input_id: 'mcb_defect_confirmed', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['physically_broken', 'trips_repeatedly', 'not_confirmed'], prompt_key: 'electricite.eligibility.mcb_defect' },
    ]
  },

  // ── SERRURERIE ─────────────────────────────────────────────────────────────
  'serrurerie.porte_claquee_ouverture': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
    ]
  },
  'serrurerie.porte_claquee_blindee.ouverture': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
      { input_id: 'door_locked_with_key', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'serrurerie.eligibility.locked_with_key' },
      { input_id: 'part_replacement_required', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'serrurerie.routing.part_required' },
    ]
  },
  'serrurerie.porte_verrouillee.ouverture': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
      { input_id: 'part_replacement_required', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'serrurerie.routing.part_required' },
    ]
  },
  'serrurerie.cle_cassee_extraction': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
      { input_id: 'barrel_previously_damaged', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'serrurerie.eligibility.barrel_damaged' },
    ]
  },
  'serrurerie.cylindre_remplacement.standard': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
      { input_id: 'cylinder_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'serrurerie.quantity.cylinder_count' },
    ]
  },
  'serrurerie.serrure_remplacement.standard': {
    questions: [
      { input_id: 'security_door', priority: 'SERVICE_IDENTITY', answer_type: 'boolean', prompt_key: 'serrurerie.identity.security_door' },
      { input_id: 'lock_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'serrurerie.quantity.lock_count' },
    ]
  },

  // ── CLIMATISATION ──────────────────────────────────────────────────────────
  'climatisation.diagnostic': {
    questions: []
  },
  'climatisation.entretien_annuel': {
    questions: [
      { input_id: 'ac_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'climatisation.quantity.ac_count' },
    ]
  },
  'climatisation.desinfection_profonde': {
    questions: [
      { input_id: 'ac_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'climatisation.quantity.ac_count' },
    ]
  },
  'climatisation.recharge_gaz_r22': {
    questions: [
      { input_id: 'refrigerant_type', priority: 'SERVICE_IDENTITY', answer_type: 'enum', options: ['R22', 'R32', 'R410A', 'R290', 'R600A'], prompt_key: 'climatisation.identity.refrigerant_type' },
    ]
  },
  'climatisation.reparation_fuite_recharge': {
    questions: [
      { input_id: 'refrigerant_type', priority: 'ROUTING_BOUNDARY', answer_type: 'enum', options: ['R22', 'R32', 'R410A', 'R290', 'R600A'], prompt_key: 'climatisation.identity.refrigerant_type' },
      { input_id: 'leak_location_confirmed', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['EXTERNAL_ACCESSIBLE_COPPER', 'INDOOR_EVAPORATOR', 'OUTDOOR_CONDENSER', 'COMPRESSOR', 'CONCEALED', 'UNKNOWN'], prompt_key: 'climatisation.eligibility.leak_location' },
    ]
  },
  'climatisation.installation.standard': {
    questions: [
      { input_id: 'multi_split', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'climatisation.routing.multi_split' },
      { input_id: 'cassette_or_ducted', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'climatisation.routing.cassette_or_ducted' },
      { input_id: 'ac_capacity_btu', priority: 'ELIGIBILITY', answer_type: 'integer', prompt_key: 'climatisation.eligibility.capacity_btu' },
      { input_id: 'installation_height_m', priority: 'ELIGIBILITY', answer_type: 'number', prompt_key: 'climatisation.eligibility.installation_height_m' },
      { input_id: 'facade_inaccessible', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'climatisation.eligibility.facade_inaccessible' },
    ]
  },
  'climatisation.installation.cassette': {
    questions: [
      { input_id: 'multi_split', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'climatisation.routing.multi_split' },
      { input_id: 'ac_capacity_btu', priority: 'ELIGIBILITY', answer_type: 'integer', prompt_key: 'climatisation.eligibility.capacity_btu' },
    ]
  },
  'climatisation.desinstallation': {
    questions: []
  },

  // ── BRICOLAGE ──────────────────────────────────────────────────────────────
  'bricolage.visite_minimum': {
    questions: []
  },
  'bricolage.horaire': {
    questions: [
      { input_id: 'hours', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'bricolage.quantity.hours' },
    ]
  },
  'bricolage.demi_journee': {
    questions: []
  },
  'bricolage.montage_meuble': {
    questions: [
      { input_id: 'item_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'bricolage.quantity.item_count_meuble' },
    ]
  },
  'bricolage.fixation_accrochage': {
    questions: [
      { input_id: 'item_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'bricolage.quantity.item_count_fixation' },
    ]
  },
  'bricolage.intervention_conditionnelle': {
    questions: [
      { input_id: 'tv_inches', priority: 'ELIGIBILITY', answer_type: 'integer', prompt_key: 'bricolage.eligibility.tv_inches' },
      { input_id: 'bracket_type', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['FIXED', 'TILT', 'FULL_MOTION'], prompt_key: 'bricolage.eligibility.bracket_type' },
    ]
  },

  // ── NETTOYAGE ──────────────────────────────────────────────────────────────
  'nettoyage.visite_minimum': {
    questions: []
  },
  'nettoyage.menage_standard': {
    questions: [
      { input_id: 'worker_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'nettoyage.quantity.worker_count' },
      { input_id: 'hours', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'nettoyage.quantity.hours' },
    ]
  },
  'nettoyage.grand_menage': {
    questions: [
      { input_id: 'property_type', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['APARTMENT', 'VILLA', 'studio_f1', 'f4_f5_large'], prompt_key: 'nettoyage.eligibility.property_type' },
    ]
  },
  'nettoyage.canape.deux_places': {
    questions: []
  },
  'nettoyage.canape.trois_places': {
    questions: []
  },
  'nettoyage.matelas.simple': {
    questions: []
  },
  'nettoyage.matelas.double': {
    questions: []
  },
  'nettoyage.apres_travaux': {
    questions: [
      { input_id: 'surface_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'nettoyage.quantity.surface_m2' },
    ]
  },

  // ── PEINTURE ───────────────────────────────────────────────────────────────
  'peinture.forfait_minimum': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
    ]
  },
  'peinture.mur_interieur.labour_only': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
      { input_id: 'surface_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['GOOD', 'MINOR_PREPARATION', 'MAJOR_PREPARATION', 'STRUCTURAL_CRACK'], prompt_key: 'peinture.eligibility.surface_condition' },
      { input_id: 'painted_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'peinture.quantity.painted_m2', measurement_note: 'GUIDED_MEASUREMENT_ASSISTANT_REQUIRED_IF_UNKNOWN' },
    ]
  },
  'peinture.mur_interieur.all_in': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
      { input_id: 'surface_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['GOOD', 'MINOR_PREPARATION', 'MAJOR_PREPARATION', 'STRUCTURAL_CRACK'], prompt_key: 'peinture.eligibility.surface_condition' },
      { input_id: 'painted_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'peinture.quantity.painted_m2', measurement_note: 'GUIDED_MEASUREMENT_ASSISTANT_REQUIRED_IF_UNKNOWN' },
    ]
  },
  'peinture.plafond.labour_only': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
      { input_id: 'surface_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['GOOD', 'MINOR_PREPARATION', 'MAJOR_PREPARATION', 'STRUCTURAL_CRACK'], prompt_key: 'peinture.eligibility.surface_condition' },
      { input_id: 'ceiling_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'peinture.quantity.ceiling_m2', measurement_note: 'GUIDED_MEASUREMENT_ASSISTANT_REQUIRED_IF_UNKNOWN' },
    ]
  },
  'peinture.mur_interieur.all_in_avec_prep': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
      { input_id: 'surface_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['GOOD', 'MINOR_PREPARATION', 'MAJOR_PREPARATION', 'STRUCTURAL_CRACK'], prompt_key: 'peinture.eligibility.surface_condition' },
      { input_id: 'painted_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'peinture.quantity.painted_m2', measurement_note: 'GUIDED_MEASUREMENT_ASSISTANT_REQUIRED_IF_UNKNOWN' },
    ]
  },
  'peinture.preparation_surface': {
    questions: [
      { input_id: 'active_moisture', priority: 'SAFETY', answer_type: 'boolean', prompt_key: 'peinture.safety.active_moisture' },
      { input_id: 'primary_service_code', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['peinture.mur_interieur.all_in', 'peinture.mur_interieur.labour_only', 'peinture.mur_interieur.all_in_avec_prep', 'peinture.plafond.labour_only'], prompt_key: 'peinture.eligibility.primary_service_code' },
      { input_id: 'painted_m2', priority: 'QUANTITY_MEASUREMENT', answer_type: 'number', prompt_key: 'peinture.quantity.painted_m2', measurement_note: 'GUIDED_MEASUREMENT_ASSISTANT_REQUIRED_IF_UNKNOWN' },
    ]
  },

  // ── MENUISERIE ─────────────────────────────────────────────────────────────
  'menuiserie.reglage_porte.sans_rabotage': {
    questions: [
      { input_id: 'security_door', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.security_door' },
      { input_id: 'frame_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['SOUND', 'COMPATIBLE', 'MINOR_DAMAGE', 'ROTTED', 'STRUCTURALLY_DEFORMED'], prompt_key: 'menuiserie.eligibility.frame_condition' },
      { input_id: 'lock_cylinder_involved', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.lock_cylinder_involved' },
    ]
  },
  'menuiserie.reglage_porte.avec_rabotage': {
    questions: [
      { input_id: 'security_door', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.security_door' },
      { input_id: 'frame_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['SOUND', 'COMPATIBLE', 'MINOR_DAMAGE', 'ROTTED', 'STRUCTURALLY_DEFORMED'], prompt_key: 'menuiserie.eligibility.frame_condition' },
    ]
  },
  'menuiserie.remplacement_charniere': {
    questions: [
      { input_id: 'security_door', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.security_door' },
      { input_id: 'hinge_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'menuiserie.quantity.hinge_count' },
    ]
  },
  'menuiserie.remplacement_coulisse_tiroir': {
    questions: [
      { input_id: 'drawer_count', priority: 'QUANTITY_MEASUREMENT', answer_type: 'integer', prompt_key: 'menuiserie.quantity.drawer_count' },
    ]
  },
  'menuiserie.deblocage_porte_coulissante.sans_piece': {
    questions: [
      { input_id: 'panel_warped', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'menuiserie.eligibility.panel_warped' },
      { input_id: 'track_broken', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'menuiserie.eligibility.track_broken' },
    ]
  },
  'menuiserie.deblocage_porte_coulissante.avec_galets': {
    questions: [
      { input_id: 'panel_warped', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'menuiserie.eligibility.panel_warped' },
      { input_id: 'track_must_be_replaced', priority: 'ELIGIBILITY', answer_type: 'boolean', prompt_key: 'menuiserie.eligibility.track_must_be_replaced' },
    ]
  },
  'menuiserie.installation_porte': {
    questions: [
      { input_id: 'security_door', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.security_door' },
      { input_id: 'masonry_modification_required', priority: 'ROUTING_BOUNDARY', answer_type: 'boolean', prompt_key: 'menuiserie.routing.masonry_modification' },
      { input_id: 'door_width_cm', priority: 'ELIGIBILITY', answer_type: 'integer', prompt_key: 'menuiserie.eligibility.door_width_cm' },
      { input_id: 'frame_condition', priority: 'ELIGIBILITY', answer_type: 'enum', options: ['SOUND', 'COMPATIBLE', 'MINOR_DAMAGE', 'ROTTED', 'STRUCTURALLY_DEFORMED'], prompt_key: 'menuiserie.eligibility.frame_condition' },
    ]
  },
};

/**
 * Plan questions for a service given already-known inputs.
 * Returns ordered pending questions (not yet answered).
 * Sorted by PRIORITY_ORDER.
 */
function planQuestions(serviceCode, knownInputs) {
  var plan = SERVICE_QUESTION_PLANS[serviceCode];
  if (!plan) return [];

  var known = knownInputs || {};
  var pending = [];

  plan.questions.forEach(function(q) {
    if (!(q.input_id in known)) {
      pending.push({
        question_id: q.input_id + '@' + serviceCode,
        input_id: q.input_id,
        prompt_key: q.prompt_key,
        answer_type: q.answer_type,
        options: q.options || null,
        priority: q.priority,
        blocking: q.priority === 'SAFETY' || q.priority === 'ROUTING_BOUNDARY',
        measurement_note: q.measurement_note || null,
      });
    }
  });

  // Sort by priority order
  pending.sort(function(a, b) {
    return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  });

  return pending;
}

/**
 * Compute UI recommendation based on remaining question count + measurement needs.
 */
function computeUIRecommendation(pendingQuestions) {
  var needsMeasurementAssistant = pendingQuestions.some(function(q) {
    return q.measurement_note && q.measurement_note.includes('GUIDED_MEASUREMENT_ASSISTANT');
  });
  if (needsMeasurementAssistant) return 'PAGE_REQUIRED';
  if (pendingQuestions.length >= 4) return 'PAGE_RECOMMENDED';
  return 'MODAL_OK';
}

/**
 * Get question plan metadata for a service (total count before filtering known).
 */
function getServiceQuestionPlan(serviceCode) {
  return SERVICE_QUESTION_PLANS[serviceCode] || null;
}

module.exports = {
  PRIORITY_ORDER: PRIORITY_ORDER,
  SERVICE_QUESTION_PLANS: SERVICE_QUESTION_PLANS,
  planQuestions: planQuestions,
  computeUIRecommendation: computeUIRecommendation,
  getServiceQuestionPlan: getServiceQuestionPlan,
};
