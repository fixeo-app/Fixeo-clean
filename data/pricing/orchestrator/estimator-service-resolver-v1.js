'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Service Resolver
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Resolves métier and service_code from entry context.
 * Filters service candidates for selection.
 * No price logic.
 */

var path = require('path');
var REGISTRY_PATH = path.join(__dirname, '../canonical/canonical-registry.v1.draft.json');
var REGISTRY = null;
function getRegistry() {
  if (!REGISTRY) REGISTRY = require(REGISTRY_PATH);
  return REGISTRY;
}

var VALID_METIERS = ['plomberie', 'electricite', 'serrurerie', 'climatisation', 'bricolage', 'nettoyage', 'peinture', 'menuiserie'];

/**
 * Metier resolution priority:
 * 1. canonical service hint contains metier prefix
 * 2. explicit metier_hint slug
 * 3. RAFI structured metier hint
 * 4. selected category
 * 5. CLASSIFIER_REQUIRED (free text only)
 * 6. manual selection required
 */
function resolveMetier(entryContext) {
  var reg = getRegistry();

  // 1. canonical service hint — extract metier prefix
  var sh = entryContext.service_hint;
  if (sh) {
    if (reg.services[sh]) {
      var svc = reg.services[sh];
      return { ok: true, metier: svc.metier, source: 'CANONICAL_SERVICE_HINT', service_code: sh };
    } else {
      // service_hint provided but not in registry — reject immediately
      return { ok: false, error: { code: 'UNKNOWN_SERVICE_CODE', message: 'service_hint not in canonical registry: ' + sh } };
    }
  }

  // 2. explicit metier_hint
  var mh = entryContext.metier_hint;
  if (mh && VALID_METIERS.includes(mh)) {
    return { ok: true, metier: mh, source: 'METIER_HINT', service_code: null };
  }

  // 3. RAFI structured hint (same fields, already validated above — check entry_point)
  if (entryContext.entry_point === 'RAFI' && mh) {
    return { ok: false, error: { code: 'INVALID_METIER_HINT', message: 'RAFI metier_hint not in canonical list: ' + mh } };
  }

  // 4. selected category (same as metier_hint after user picks)
  // Already covered by metier_hint above.

  // 5. Free text only — classifier required
  if (entryContext.free_text && !mh) {
    return { ok: true, metier: null, source: 'CLASSIFIER_REQUIRED', service_code: null, needs_classifier: true };
  }

  // 6. No context at all — user must select
  return { ok: true, metier: null, source: 'MANUAL_SELECTION_REQUIRED', service_code: null };
}

/**
 * Resolve service code from hint, validates against canonical registry.
 */
function resolveServiceCode(serviceHint, metier) {
  var reg = getRegistry();
  if (!serviceHint) return { ok: false, error: { code: 'NO_SERVICE_HINT' } };
  var svc = reg.services[serviceHint];
  if (!svc) return { ok: false, error: { code: 'UNKNOWN_SERVICE_CODE', message: serviceHint } };
  if (metier && svc.metier !== metier) {
    return { ok: false, error: { code: 'SERVICE_METIER_MISMATCH', message: serviceHint + ' belongs to ' + svc.metier + ' not ' + metier } };
  }
  if (svc.availability_status === 'DEPRECATED' || svc.human_decision !== 'APPROVED') {
    return { ok: false, error: { code: 'SERVICE_NOT_AVAILABLE', message: serviceHint + ' is not approved/available' } };
  }
  return { ok: true, service_code: serviceHint, metier: svc.metier };
}

/**
 * Get candidate services for a given métier.
 * Filters by: availability_status = STANDARDIZED, human_decision = APPROVED
 * Groups by service_family.
 * Never exposes prices.
 */
function getCandidateServices(metier) {
  var reg = getRegistry();
  var candidates = [];
  Object.values(reg.services).forEach(function(svc) {
    if (svc.metier !== metier) return;
    if (svc.human_decision !== 'APPROVED') return;
    if (svc.availability_status === 'DEPRECATED') return;
    candidates.push({
      service_code: svc.canonical_service_code,
      service_family: svc.service_family,
      label_fr: svc.label_fr,
      short_label_fr: svc.short_label_fr,
      label_ar_darija: svc.label_ar_darija,
      variant: svc.variant,
      commercial_output_type: svc.price_model ? svc.price_model.commercial_output_type : null,
    });
  });
  return candidates;
}

/**
 * Get full service definition from registry.
 */
function getService(serviceCode) {
  var reg = getRegistry();
  return reg.services[serviceCode] || null;
}

module.exports = {
  VALID_METIERS: VALID_METIERS,
  resolveMetier: resolveMetier,
  resolveServiceCode: resolveServiceCode,
  getCandidateServices: getCandidateServices,
  getService: getService,
};
