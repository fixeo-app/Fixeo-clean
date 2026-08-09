'use strict';
/**
 * FIXEO Estimator Orchestrator V1 — Handoff Token Builder
 * Phase 7C.7 | DORMANT — No production integration
 *
 * Builds pricing_context_token from completed session.
 * Token version: 1.0.0-dormant
 * NO crypto signature. NO server trust claim. NOT production valid.
 */

var path = require('path');
var REGISTRY_PATH = path.join(__dirname, '../canonical/canonical-registry.v1.draft.json');
var REGISTRY = null;
function getRegistry() {
  if (!REGISTRY) REGISTRY = require(REGISTRY_PATH);
  return REGISTRY;
}

var FINAL_STATES = ['PRICE_READY', 'DIAGNOSTIC_READY', 'LABOUR_PLUS_PART_READY', 'ADD_ON_READY', 'QUOTE_REQUIRED'];

/**
 * Build pricing context token.
 * Only allowed when session has a final commercial outcome.
 *
 * @param {object} session
 * @returns {{ ok: true, token } | { ok: false, error }}
 */
function buildPricingContextToken(session) {
  if (!session) return { ok: false, error: { code: 'NO_SESSION', message: 'Session required' } };
  if (!FINAL_STATES.includes(session.state)) {
    return { ok: false, error: { code: 'SESSION_NOT_FINAL', message: 'Token requires final outcome state. Current: ' + session.state } };
  }
  if (!session.outcome) {
    return { ok: false, error: { code: 'NO_OUTCOME', message: 'Session has no outcome object' } };
  }
  if (!session.service_code) {
    return { ok: false, error: { code: 'NO_SERVICE_CODE', message: 'Session has no service_code' } };
  }

  var reg = getRegistry();
  var svc = reg.services[session.service_code];
  var priceVersion = svc ? (svc.service_version || '1.0.0-draft') : '1.0.0-draft';
  var engineVersion = '1.0.0-dormant';

  var outcome = session.outcome;
  var knownInputs = session.known_inputs || {};

  // Simple deterministic inputs hash (not cryptographic — dormant only)
  var inputsHash = simpleHash(JSON.stringify(sortedObject(knownInputs)));

  var token = {
    token_version: '1.0.0-dormant',
    service_code: session.service_code,
    engine_version: engineVersion,
    price_version: priceVersion,
    inputs_hash: inputsHash,
    qualification_result: session.qualification_status || 'COMPLETED',
    commercial_output_type: outcome.commercial_output_type,
    final_amount_mad: outcome.price ? outcome.price.amount_mad : null,
    labour_amount_mad: outcome.price ? outcome.price.labour_amount_mad : null,
    variable_part_separate: outcome.variable_part_separate || false,
    scope_snapshot: {
      service_code: session.service_code,
      metier: session.metier,
      known_inputs: sortedObject(knownInputs),
    },
    policy_refs: buildPolicyRefs(outcome, svc),
    session_id: session.session_id,
    created_at: session.updated_at || new Date().toISOString(),
    signature: null,
    production_valid: false,
    dormant_note: 'This token is unsigned and must not be trusted by any production system. Reserved for dormant orchestrator testing only.',
  };

  return { ok: true, token: token };
}

/**
 * Collect relevant policy references from outcome and service definition.
 */
function buildPolicyRefs(outcome, svc) {
  var refs = [];
  if (svc) {
    var diag = svc.diagnostic;
    if (diag && diag.policy_ref) refs.push(diag.policy_ref);
    var parts = svc.materials && svc.materials.parts_disclosure;
    if (parts && parts.policy_ref) refs.push(parts.policy_ref);
    var floor = svc.minimum_floor;
    if (floor && floor.enabled && floor.policy_ref) refs.push(floor.policy_ref);
  }
  if (outcome && outcome.absorption_policy_ref) refs.push(outcome.absorption_policy_ref);
  return refs.filter(function(r, i, arr) { return arr.indexOf(r) === i; });
}

/**
 * Sorted object keys for deterministic hash.
 */
function sortedObject(obj) {
  var sorted = {};
  Object.keys(obj).sort().forEach(function(k) { sorted[k] = obj[k]; });
  return sorted;
}

/**
 * Simple non-cryptographic hash for dormant use only.
 */
function simpleHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'dormant_' + Math.abs(hash).toString(16).padStart(8, '0');
}

module.exports = {
  FINAL_STATES: FINAL_STATES,
  buildPricingContextToken: buildPricingContextToken,
};
