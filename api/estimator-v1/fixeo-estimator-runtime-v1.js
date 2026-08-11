/*!
 * api/estimator-v1/fixeo-estimator-runtime-v1.js
 * FIXEO Estimator Runtime — Normalization Module — Phase 7C.9B / 7C.9C
 *
 * Exports browser-safe views of internal session/outcome objects.
 * Uses REAL canonical field names from estimator-outcome-mapper-v1.
 * NEVER leaks raw session internals (engine_result, question_history).
 */
'use strict';

const crypto       = require('crypto');
const { sealToken } = require('./fixeo-estimator-token-v1');

/**
 * generateContextId() — opaque server-side one-time nonce for pricing context binding.
 * Prevents context_id forgery from browser. Not a one-time-use token (no persistent store)
 * but uniquely identifies this exact pricing evaluation event for logging/audit.
 */
function generateContextId() {
  return 'fxctx-' + crypto.randomBytes(16).toString('hex');
}

const SESSION_TTL_MS      = 30 * 60 * 1000; // 30 min
const PRICING_CTX_TTL_MS  = 15 * 60 * 1000; // 15 min

// Outcome types that must NOT yield a pricing_context_token
const NO_PRICING_CTX_OUTCOMES = new Set([
  'SAFETY_STOP',
  'QUOTE_REQUIRED',
  'ROUTE_REQUIRED',
  'REQUALIFY',
]);

/**
 * normalizeSessionView(session, secret)
 * Returns a browser-safe opaque session view.
 */
function normalizeSessionView(session, secret) {
  const payload = {
    session_id:    session.session_id,
    metier:        session.metier,
    service_code:  session.service_code,
    known_inputs:  session.known_inputs,
    state:         session.state,
    ui_recommendation: session.ui_recommendation,
    pending_questions: session.pending_questions,
    outcome:       session.outcome || null,
    created_at:    session.created_at,
    expires_at:    Date.now() + SESSION_TTL_MS,
  };
  const token = sealToken(payload, secret);
  const pending_count = session.pending_questions ? session.pending_questions.length : 0;
  return {
    session_token:    token,
    state:            session.state,
    metier:           session.metier,
    service_code:     session.service_code,
    ui_recommendation: session.ui_recommendation || null,
    pending_count,
  };
}

/**
 * normalizeOutcomeView(session)
 * Returns browser-safe outcome for rendering.
 * Uses real canonical field names from estimator-outcome-mapper-v1.
 */
function normalizeOutcomeView(session) {
  const o = session.outcome;
  if (!o) return null;

  const base = {
    outcome_type:               o.outcome_type,
    service_code:               o.service_code,
    commercial_output_type:     o.commercial_output_type || null,
    scope_summary:              o.scope_summary || [],
    exclusions_summary:         o.exclusions_summary || [],
    parts_notice_required:      !!o.parts_notice_required,
    diagnostic_notice_required: !!o.diagnostic_notice_required,
    next_action:                o.next_action || null,
  };

  // Price fields — safe to expose for rendering
  if (o.price) {
    base.price = {
      amount_mad:        o.price.amount_mad,
      labour_amount_mad: o.price.labour_amount_mad,
      currency:          o.price.currency || 'MAD',
    };
  }

  // Outcome-type-specific fields
  if (o.outcome_type === 'DIAGNOSTIC_READY') {
    base.diagnostic_price_mad  = o.diagnostic_price_mad !== undefined ? o.diagnostic_price_mad : (o.price && o.price.amount_mad);
    base.absorption_possible   = !!o.absorption_possible;
  }

  if (o.outcome_type === 'LABOUR_PLUS_PART_READY') {
    base.variable_part_separate = !!o.variable_part_separate;
  }

  if (o.outcome_type === 'ROUTE_REQUIRED') {
    // route is a string description, NOT an object
    base.route = typeof o.route === 'string' ? o.route : null;
  }

  // Do NOT include engine_result_ref or raw engine internals

  return base;
}

/**
 * buildPricingContextPayload(session)
 * Returns canonical payload for the encrypted pricing context token.
 * Uses ACTUAL field names. Must NOT be called for SAFETY_STOP/QUOTE_REQUIRED/ROUTE_REQUIRED.
 */
function buildPricingContextPayload(session) {
  const o = session.outcome;
  if (!o) throw new Error('No outcome in session');

  if (NO_PRICING_CTX_OUTCOMES.has(o.outcome_type)) {
    throw new Error('Cannot build pricing context for outcome type: ' + o.outcome_type);
  }

  const payload = {
    // Core identity
    service_code:  o.service_code,
    outcome_type:  o.outcome_type,
    session_id:    session.session_id,
    // 7C.9L.3H: city_slug — matching context ONLY, sealed for tamper-evidence.
    // MUST NOT affect price, pricing engine, or booking authority.
    // null when no trusted current-session city was provided.
    city_slug:     (session.entry_context && session.entry_context.city_slug) || null,
    // Cryptographic nonce — server-generated, prevents client-side context_id forgery.
    // Uniquely identifies this pricing evaluation event.
    context_id:    generateContextId(),
    // Price fields — canonical
    amount_mad:         (o.price && o.price.amount_mad)         !== undefined ? (o.price.amount_mad)        : null,
    labour_amount_mad:  (o.price && o.price.labour_amount_mad)  !== undefined ? (o.price.labour_amount_mad) : null,
    currency:           (o.price && o.price.currency)           || 'MAD',
    // Rendering hints
    parts_separate:   !!(o.outcome_type === 'LABOUR_PLUS_PART_READY' && o.variable_part_separate),
    is_diagnostic:    !!(o.outcome_type === 'DIAGNOSTIC_READY'),
    absorption_possible: !!(o.outcome_type === 'DIAGNOSTIC_READY' && o.absorption_possible),
    // TTL
    issued_at:  Date.now(),
    expires_at: Date.now() + PRICING_CTX_TTL_MS,
  };

  return payload;
}

/**
 * shouldIssuePricingContextToken(session)
 * Returns true only when it's safe to mint a pricing context token.
 */
function shouldIssuePricingContextToken(session) {
  const o = session.outcome;
  if (!o) return false;
  return !NO_PRICING_CTX_OUTCOMES.has(o.outcome_type);
}

module.exports = {
  normalizeSessionView,
  normalizeOutcomeView,
  buildPricingContextPayload,
  shouldIssuePricingContextToken,
  SESSION_TTL_MS,
  PRICING_CTX_TTL_MS,
};
