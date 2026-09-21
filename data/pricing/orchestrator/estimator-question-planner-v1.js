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
"demenagement.manutention_2h": {"questions": [{"input_id": "moving_task", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MOVING_HANDLING_ONLY", "MOVING_COMPLEX", "UNKNOWN"], "prompt_key": "moving_task"}, {"input_id": "moving_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MOVING_ACCESS_READY", "MOVING_COMPLEX", "UNKNOWN"], "prompt_key": "moving_access"}, {"input_id": "moving_items", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MOVING_STANDARD_ITEMS", "MOVING_COMPLEX", "UNKNOWN"], "prompt_key": "moving_items"}, {"input_id": "moving_preparation", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MOVING_PREPARED", "MOVING_COMPLEX", "UNKNOWN"], "prompt_key": "moving_preparation"}, {"input_id": "moving_duration", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MOVING_TWO_HOUR_TEAM", "MOVING_COMPLEX", "UNKNOWN"], "prompt_key": "moving_duration"}]},
"maconnerie.rebouchage_local": {"questions": [{"input_id": "masonry_hole_count", "priority": "QUANTITY_MEASUREMENT", "answer_type": "integer", "prompt_key": "masonry_hole_count"}, {"input_id": "masonry_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_SOUND_DRY", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_support"}, {"input_id": "masonry_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_ACCESSIBLE", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_access"}, {"input_id": "masonry_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_CLIENT_SUPPLIED", "MASONRY_SUPPLIES_MISSING", "UNKNOWN"], "prompt_key": "masonry_supplies"}, {"input_id": "masonry_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_STANDARD_FINISH", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_finish"}, {"input_id": "masonry_scope", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_SMALL_HOLES", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "MASONRY_SMALL_HOLES"}]}, "maconnerie.reprise_enduit": {"questions": [{"input_id": "masonry_area_m2", "priority": "QUANTITY_MEASUREMENT", "answer_type": "number", "prompt_key": "masonry_area_m2"}, {"input_id": "masonry_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_SOUND_DRY", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_support"}, {"input_id": "masonry_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_ACCESSIBLE", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_access"}, {"input_id": "masonry_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_CLIENT_SUPPLIED", "MASONRY_SUPPLIES_MISSING", "UNKNOWN"], "prompt_key": "masonry_supplies"}, {"input_id": "masonry_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_STANDARD_FINISH", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "masonry_finish"}, {"input_id": "masonry_scope", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["MASONRY_THIN_RENDER", "MASONRY_COMPLEX", "UNKNOWN"], "prompt_key": "MASONRY_THIN_RENDER"}]},
"carrelage.remplacement_local": {"questions": [{"input_id": "tile_count", "priority": "QUANTITY_MEASUREMENT", "answer_type": "integer", "prompt_key": "tile_count"}, {"input_id": "tile_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_SUPPORT_READY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_support"}, {"input_id": "tile_format", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_STANDARD", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_format"}, {"input_id": "tile_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_CLIENT_SUPPLIED", "TILE_SUPPLIES_MISSING", "UNKNOWN"], "prompt_key": "tile_supplies"}, {"input_id": "tile_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_ACCESS_READY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_access"}, {"input_id": "tile_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_STANDARD_FINISH", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_finish"}, {"input_id": "tile_work", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_REPLACE_ONLY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "TILE_REPLACE_ONLY"}]}, "carrelage.pose_sol_droite": {"questions": [{"input_id": "tile_area_m2", "priority": "QUANTITY_MEASUREMENT", "answer_type": "number", "prompt_key": "tile_area_m2"}, {"input_id": "tile_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_SUPPORT_READY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_support"}, {"input_id": "tile_format", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_STANDARD", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_format"}, {"input_id": "tile_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_CLIENT_SUPPLIED", "TILE_SUPPLIES_MISSING", "UNKNOWN"], "prompt_key": "tile_supplies"}, {"input_id": "tile_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_ACCESS_READY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_access"}, {"input_id": "tile_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_STANDARD_FINISH", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "tile_finish"}, {"input_id": "tile_work", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["TILE_INSTALL_ONLY", "TILE_COMPLEX", "UNKNOWN"], "prompt_key": "TILE_INSTALL_ONLY"}]},
"jardinage.entretien_courant": {"questions": [{"input_id": "garden_dimensions", "priority": "QUANTITY_MEASUREMENT", "answer_type": "enum", "options": ["GARDEN_UP_TO_100", "GARDEN_OVERSIZE", "UNKNOWN"], "prompt_key": "GARDEN_UP_TO_100"}, {"input_id": "garden_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_ACCESS_OK", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_access"}, {"input_id": "garden_state", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_MAINTAINED", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_state"}, {"input_id": "garden_waste", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_WASTE_ONSITE", "GARDEN_WASTE_REMOVE", "UNKNOWN"], "prompt_key": "garden_waste"}, {"input_id": "garden_tasks", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_ROUTINE_ONLY", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_tasks"}]}, "jardinage.taille_haie_basse": {"questions": [{"input_id": "garden_dimensions", "priority": "QUANTITY_MEASUREMENT", "answer_type": "enum", "options": ["HEDGE_WITHIN_LIMITS", "GARDEN_OVERSIZE", "UNKNOWN"], "prompt_key": "HEDGE_WITHIN_LIMITS"}, {"input_id": "garden_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_ACCESS_OK", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_access"}, {"input_id": "garden_state", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_MAINTAINED", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_state"}, {"input_id": "garden_waste", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_WASTE_ONSITE", "GARDEN_WASTE_REMOVE", "UNKNOWN"], "prompt_key": "garden_waste"}, {"input_id": "garden_tasks", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["GARDEN_ROUTINE_ONLY", "GARDEN_COMPLEX", "UNKNOWN"], "prompt_key": "garden_tasks"}]},
  // ── PLOMBERIE ──────────────────────────────────────────────────────────────
  'plomberie.diagnostic': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.diagnostic')},
  'plomberie.fuite_simple': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.fuite_simple')},
  'plomberie.debouchage_evier': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.debouchage_evier')},
  'plomberie.debouchage_wc_simple': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.debouchage_wc_simple')},
  'plomberie.robinet_remplacement': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.robinet_remplacement')},
  'plomberie.chasse_eau': {questions: require('../engine/plumbing-pilot-v1').questions('plomberie.chasse_eau')},

  // Owner-approved electricity: customer scope, separate from professional pre-work checks.
  'electricite.diagnostic': {questions: require('../engine/electricity-pilot-v1').questions('electricite.diagnostic')},
  'electricite.prise_remplacement': {questions: require('../engine/electricity-pilot-v1').questions('electricite.prise_remplacement')},
  'electricite.interrupteur_remplacement.simple': {questions: require('../engine/electricity-pilot-v1').questions('electricite.interrupteur_remplacement.simple')},
  'electricite.interrupteur_remplacement.va_et_vient': {questions: require('../engine/electricity-pilot-v1').questions('electricite.interrupteur_remplacement.va_et_vient')},
  'electricite.luminaire_installation': {questions: require('../engine/electricity-pilot-v1').questions('electricite.luminaire_installation')},
  'electricite.disjoncteur_remplacement': {questions: require('../engine/electricity-pilot-v1').questions('electricite.disjoncteur_remplacement')},

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
  'climatisation.diagnostic': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.diagnostic')},
  'climatisation.entretien_annuel': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.entretien_annuel')},
  'climatisation.desinfection_profonde': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.desinfection_profonde')},
  'climatisation.installation.standard': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.installation.standard')},
  'climatisation.installation.mono_split_5m': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.installation.mono_split_5m')},
  'climatisation.desinstallation': {questions: require('../engine/climatisation-pilot-v1').questions('climatisation.desinstallation')},
  'climatisation.installation.cassette': {questions: []},
  'climatisation.recharge_gaz_r22': {questions: []},
  'climatisation.reparation_fuite_recharge': {questions: []},

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
      {input_id:'surface_m2',priority:'QUANTITY_MEASUREMENT',answer_type:'number',prompt_key:'surface_m2'},
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
"peinture.forfait_minimum": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}]}, "peinture.mur_interieur.all_in": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}, {"input_id": "paint_included_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_INCLUDED_READY", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_included_support"}, {"input_id": "paint_included_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_INCLUDED_ACCESS_READY", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_included_access"}, {"input_id": "paint_included_product", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_COLOVINYL900_WHITE", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_included_product"}, {"input_id": "paint_included_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_INCLUDED_TWO_COATS", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_included_finish"}, {"input_id": "painted_m2", "priority": "QUANTITY_MEASUREMENT", "answer_type": "number", "prompt_key": "paint_area"}]}, "peinture.plafond.labour_only": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}, {"input_id": "ceiling_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["CEILING_READY", "CEILING_COMPLEX", "UNKNOWN"], "prompt_key": "ceiling_support"}, {"input_id": "ceiling_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["CEILING_ACCESS_READY", "CEILING_COMPLEX", "UNKNOWN"], "prompt_key": "ceiling_access"}, {"input_id": "paint_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_CLIENT_SUPPLIED", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_supplies"}, {"input_id": "ceiling_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["CEILING_TWO_COATS", "CEILING_COMPLEX", "UNKNOWN"], "prompt_key": "ceiling_finish"}, {"input_id": "ceiling_m2", "priority": "QUANTITY_MEASUREMENT", "answer_type": "number", "prompt_key": "ceiling_area"}]}, "peinture.mur_interieur.all_in_avec_prep": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}]}, "peinture.preparation_surface": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}]}, "peinture.mur_interieur.labour_only": {"questions": [{"input_id": "active_moisture", "priority": "SAFETY", "answer_type": "boolean", "prompt_key": "peinture.safety.active_moisture"}, {"input_id": "paint_support", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_READY", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_support"}, {"input_id": "paint_access", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_ACCESS_READY", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_access"}, {"input_id": "paint_supplies", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_CLIENT_SUPPLIED", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_supplies"}, {"input_id": "paint_finish", "priority": "ELIGIBILITY", "answer_type": "enum", "options": ["PAINT_TWO_COATS", "PAINT_COMPLEX", "UNKNOWN"], "prompt_key": "paint_finish"}, {"input_id": "painted_m2", "priority": "QUANTITY_MEASUREMENT", "answer_type": "number", "prompt_key": "paint_area"}]},
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
        prompt_fr: q.prompt_fr || null,
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
