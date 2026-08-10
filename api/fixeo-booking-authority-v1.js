/*!
 * api/fixeo-booking-authority-v1.js
 * FIXEO Estimator — Server-Authoritative Booking Price Resolver
 * Phase 7C.9C — Server-Authoritative Booking Pricing & Security Closure
 *
 * CANONICAL RULE:
 *   When an estimator_context_token is present:
 *     SERVER TOKEN PRICE > ALL BROWSER PRICE FIELDS
 *   Browser-supplied totalAmount MUST be ignored / overridden.
 *
 *   When no estimator_context_token:
 *     Legacy booking path — browser totalAmount unchanged.
 *
 * This module exports a PURE function (no side-effects, no I/O, no Supabase).
 * It is unit-tested directly in test files.
 * It is imported by api/server.js and api/estimator-v1/index.js.
 *
 * SECURITY CONTRACT:
 *   - FAIL CLOSED: any token defect → reject (never fall back to browser price)
 *   - Missing secret → throw (fail closed)
 *   - Tampered token → GCM auth failure → throw
 *   - Expired token → throw
 *   - Non-payable outcome (SAFETY_STOP, QUOTE_REQUIRED, etc.) → reject
 *   - Missing canonical amount → reject
 *   - Non-integer or non-positive MAD amount → reject
 *
 * REPLAY PROTECTION NOTE (Phase 7C.9C):
 *   True one-time replay prevention requires a persistent store (Redis/DB).
 *   This phase does NOT introduce Supabase schema changes.
 *   Mitigation in place:
 *     - Short TTL (15 min) on pricing_context_token
 *     - Cryptographic nonce (context_id) bound into every token
 *     - session_id + service_code bound into every token
 *     - Token cannot be forged without FIXEO_ESTIMATOR_SECRET
 *   Persistent one-time-use prevention is identified as a hardening
 *   item for a future phase (7C.9E+).
 */
'use strict';

const { unsealToken } = require('./estimator-v1/fixeo-estimator-token-v1');

/* ── Outcome types that are payable (may produce a booking amount) ── */
const PAYABLE_OUTCOMES = new Set([
  'PRICE_READY',
  'DIAGNOSTIC_READY',
  'LABOUR_PLUS_PART_READY',
  'ADD_ON_READY',
]);

/* ── Outcome types that are explicitly NON-payable ── */
const NON_PAYABLE_OUTCOMES = new Set([
  'SAFETY_STOP',
  'QUOTE_REQUIRED',
  'ROUTE_REQUIRED',
  'REQUALIFY',
]);

/**
 * resolveAuthoritativeBookingPricing({
 *   estimatorContextToken,  // opaque encrypted string | null | undefined
 *   browserTotalAmount,     // number — browser-supplied (for legacy path only)
 *   secret,                 // FIXEO_ESTIMATOR_SECRET
 * })
 *
 * Returns:
 *   {
 *     source: 'estimator_server_verified' | 'legacy_browser',
 *     amount_mad: number,
 *     outcome_type: string | null,
 *     service_code: string | null,
 *     session_id: string | null,
 *     context_id: string | null,
 *     parts_separate: boolean,
 *     is_diagnostic: boolean,
 *     estimator_verified: boolean,
 *   }
 *
 * Throws a BookingAuthorityError if:
 *   - An estimator token is present but invalid/expired/tampered/non-payable
 *   - FIXEO_ESTIMATOR_SECRET missing when a token is present
 *   - No valid price can be resolved
 *
 * NEVER silently falls back to browser price when a token is present and fails.
 */
function resolveAuthoritativeBookingPricing({ estimatorContextToken, browserTotalAmount, secret }) {
  // ── Case 1: No estimator token → legacy browser path ──────────────────────
  if (!estimatorContextToken) {
    const legacyAmount = parseFloat(browserTotalAmount);
    if (isNaN(legacyAmount) || legacyAmount <= 0) {
      throw new BookingAuthorityError(
        'INVALID_LEGACY_AMOUNT',
        'No estimator token and browser totalAmount is invalid.'
      );
    }
    return {
      source:             'legacy_browser',
      amount_mad:         Math.round(legacyAmount),
      outcome_type:       null,
      service_code:       null,
      session_id:         null,
      context_id:         null,
      parts_separate:     false,
      is_diagnostic:      false,
      estimator_verified: false,
    };
  }

  // ── Case 2: Estimator token present → MUST verify server-side ─────────────
  // FAIL CLOSED: any defect here throws. Never fall back to browserTotalAmount.

  if (!secret) {
    // Secret missing — cannot verify any token.
    throw new BookingAuthorityError(
      'CONFIG_ERROR',
      'FIXEO_ESTIMATOR_SECRET not configured — cannot verify estimator pricing context.'
    );
  }

  // Decrypt + authenticate the token (GCM auth tag validates integrity)
  let ctx;
  try {
    ctx = unsealToken(estimatorContextToken, secret);
  } catch (e) {
    throw new BookingAuthorityError(
      'TOKEN_INVALID',
      'Estimator pricing context token is invalid, tampered, or expired: ' + e.message
    );
  }

  // Validate token structure
  if (!ctx || typeof ctx !== 'object') {
    throw new BookingAuthorityError('TOKEN_MALFORMED', 'Decrypted token payload is not an object.');
  }

  // Validate outcome type — must be explicitly payable
  const outcomeType = ctx.outcome_type;
  if (!outcomeType) {
    throw new BookingAuthorityError('TOKEN_NO_OUTCOME', 'Pricing context token has no outcome_type.');
  }
  if (NON_PAYABLE_OUTCOMES.has(outcomeType)) {
    throw new BookingAuthorityError(
      'NON_PAYABLE_OUTCOME',
      'Outcome type "' + outcomeType + '" cannot authorize a booking payment.'
    );
  }
  if (!PAYABLE_OUTCOMES.has(outcomeType)) {
    throw new BookingAuthorityError(
      'UNKNOWN_OUTCOME',
      'Unrecognized outcome type in pricing context: ' + outcomeType
    );
  }

  // Validate service_code present
  if (!ctx.service_code || typeof ctx.service_code !== 'string') {
    throw new BookingAuthorityError('TOKEN_NO_SERVICE', 'Pricing context token has no service_code.');
  }

  // Validate session_id present
  if (!ctx.session_id || typeof ctx.session_id !== 'string') {
    throw new BookingAuthorityError('TOKEN_NO_SESSION', 'Pricing context token has no session_id.');
  }

  // Validate context_id (nonce) present — added in 7C.9C strengthening
  if (!ctx.context_id || typeof ctx.context_id !== 'string') {
    throw new BookingAuthorityError(
      'TOKEN_NO_CONTEXT_ID',
      'Pricing context token has no context_id — token predates 7C.9C security hardening.'
    );
  }

  // Derive canonical amount based on outcome type
  let canonicalAmount;
  const isLabourPlusPart = outcomeType === 'LABOUR_PLUS_PART_READY';
  const isDiagnostic     = outcomeType === 'DIAGNOSTIC_READY';

  if (isLabourPlusPart) {
    // LABOUR_PLUS_PART: authority is labour_amount_mad ONLY — part is separate
    canonicalAmount = ctx.labour_amount_mad;
  } else {
    // PRICE_READY, DIAGNOSTIC_READY, ADD_ON_READY: authority is amount_mad
    canonicalAmount = ctx.amount_mad;
  }

  // Validate canonical amount is a valid positive integer MAD value
  if (canonicalAmount === null || canonicalAmount === undefined) {
    throw new BookingAuthorityError(
      'TOKEN_NO_AMOUNT',
      'Pricing context token has no canonical amount for outcome type: ' + outcomeType
    );
  }
  if (typeof canonicalAmount !== 'number' || !Number.isFinite(canonicalAmount) || canonicalAmount <= 0) {
    throw new BookingAuthorityError(
      'TOKEN_INVALID_AMOUNT',
      'Pricing context token canonical amount is invalid: ' + canonicalAmount
    );
  }

  // Round to integer MAD (canonical amounts should already be integers from the engine)
  const resolvedAmount = Math.round(canonicalAmount);
  if (resolvedAmount <= 0) {
    throw new BookingAuthorityError('TOKEN_ZERO_AMOUNT', 'Canonical amount resolves to zero or negative.');
  }

  // ── SUCCESS: return server-verified canonical booking price ────────────────
  return {
    source:             'estimator_server_verified',
    amount_mad:         resolvedAmount,
    outcome_type:       outcomeType,
    service_code:       ctx.service_code,
    session_id:         ctx.session_id,
    context_id:         ctx.context_id,
    parts_separate:     !!(isLabourPlusPart || ctx.parts_separate),
    is_diagnostic:      !!isDiagnostic,
    estimator_verified: true,
  };
}

/**
 * BookingAuthorityError — typed error for booking authority failures.
 * code: machine-readable string for logging/response
 * message: human-readable description (safe to log, not sent to client)
 */
class BookingAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name  = 'BookingAuthorityError';
    this.code  = code;
  }
}

module.exports = {
  resolveAuthoritativeBookingPricing,
  BookingAuthorityError,
  PAYABLE_OUTCOMES,
  NON_PAYABLE_OUTCOMES,
};
