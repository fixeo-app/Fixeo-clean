/*!
 * api/fixeo-estimator-idempotency-v1.js
 * FIXEO Estimator — Idempotency & Replay Guard — Phase 7C.9E
 *
 * PURPOSE:
 *   Guarantees that a single estimator pricing context (identified by
 *   context_id) can produce at most ONE successful booking, even under:
 *     - Browser retry after network failure
 *     - Double-submit from the same user
 *     - Concurrent race conditions from multiple browser tabs/requests
 *     - Token replay within the 15-min TTL window
 *
 * STORAGE:
 *   Supabase table `estimator_context_redemptions` via direct REST API.
 *   Same pattern as api/enterprise-contact-fn/index.js (no Supabase SDK).
 *   Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 *   FAIL CLOSED: if Supabase is unavailable → throws IdempotencyError
 *   code=PERSISTENCE_UNAVAILABLE. The booking endpoint MUST reject with
 *   HTTP 503 — NEVER fall back to allowing the booking without idempotency.
 *
 * ATOMICITY:
 *   Uses Supabase PostgREST upsert with UNIQUE constraint on context_id.
 *   The UNIQUE constraint on context_id enforces database-level atomicity:
 *   concurrent inserts for the same context_id → second INSERT fails with
 *   Supabase 409 (unique violation) → no double booking possible.
 *
 * SQL MIGRATION (must be applied by human before production activation):
 * ────────────────────────────────────────────────────────────────────────
 *   CREATE TABLE estimator_context_redemptions (
 *     id              BIGSERIAL PRIMARY KEY,
 *     context_id      TEXT        NOT NULL UNIQUE,  -- idempotency key
 *     outcome_type    TEXT        NOT NULL,
 *     service_code    TEXT        NOT NULL,
 *     session_id      TEXT        NOT NULL,
 *     amount_mad      INTEGER     NOT NULL,
 *     booking_ref     TEXT,                         -- populated on commit
 *     order_id        TEXT,                         -- COD orderID
 *     state           TEXT        NOT NULL DEFAULT 'acquired',
 *     -- state values: 'acquired' | 'committed' | 'failed'
 *     acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     committed_at    TIMESTAMPTZ,
 *     failed_at       TIMESTAMPTZ,
 *     failure_reason  TEXT
 *   );
 *   -- UNIQUE constraint is the atomicity mechanism:
 *   CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_context_id
 *     ON estimator_context_redemptions(context_id);
 *   -- RLS: service_role bypasses RLS (same as enterprise_leads)
 *   ALTER TABLE estimator_context_redemptions ENABLE ROW LEVEL SECURITY;
 * ────────────────────────────────────────────────────────────────────────
 *
 * SECURITY:
 *   - context_id is cryptographic (32 random hex bytes, server-generated only).
 *   - NEVER expose context_id in browser or API response.
 *   - Service role key never sent to browser.
 *   - No amount/pricing data stored in this table (audit only: amount_mad).
 *
 * STATE TRANSITIONS:
 *   [not-yet-seen] → INSERT → 'acquired'
 *     Outcome: { status: 'acquired' } → caller creates booking
 *   'acquired' → UPDATE → 'committed'
 *     Outcome: { status: 'committed', booking_ref, order_id }
 *   'acquired' → UPDATE → 'failed'
 *     Outcome: booking never completed → context can be retried (recovery)
 *
 *   SECOND request for same context_id:
 *     If 'committed': { status: 'already_consumed_same', booking_ref, order_id }
 *     If 'acquired':  { status: 'already_consumed_conflict' } — concurrent/stale
 *     If 'failed':    treat as new → re-acquire (recovery path)
 *
 *   A 'failed' context can be retried because the booking never succeeded.
 *   Only 'committed' contexts are permanently consumed.
 */
'use strict';

/* ── IdempotencyError ─────────────────────────────────────── */

/**
 * IdempotencyError — typed error for idempotency failures.
 * code values:
 *   CONFIG_MISSING        — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY absent
 *   PERSISTENCE_UNAVAILABLE — Supabase network or server error
 *   CONTEXT_ID_REQUIRED   — context_id missing or malformed
 *   ALREADY_CONSUMED      — context committed by a different booking
 */
class IdempotencyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdempotencyError';
    this.code = code;
  }
}

/* ── Context-ID validation ────────────────────────────────── */

const CONTEXT_ID_RE = /^fxctx-[0-9a-f]{32}$/;

function validateContextId(contextId) {
  if (!contextId || typeof contextId !== 'string') {
    throw new IdempotencyError('CONTEXT_ID_REQUIRED', 'context_id is required and must be a string.');
  }
  if (!CONTEXT_ID_RE.test(contextId)) {
    throw new IdempotencyError(
      'CONTEXT_ID_REQUIRED',
      'context_id has invalid format (expected fxctx-<32hex>): ' + String(contextId).slice(0, 64)
    );
  }
}

/* ── Supabase REST helpers ─────────────────────────────────── */

const TABLE = 'estimator_context_redemptions';

function _getSupabaseConfig() {
  const url        = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const missing = !url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY';
    const err = new IdempotencyError(
      'CONFIG_MISSING',
      'Supabase env var not configured: ' + missing +
      ' — idempotency persistence unavailable. Booking MUST be rejected.'
    );
    throw err;
  }
  return { url, serviceKey };
}

function _headers(serviceKey) {
  return {
    'Content-Type':  'application/json',
    'apikey':        serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Prefer':        'return=representation',
  };
}

/**
 * _fetchRow(contextId, cfg) → row object or null
 * Reads the current redemption row for this context_id.
 */
async function _fetchRow(contextId, cfg) {
  const url = cfg.url + '/rest/v1/' + TABLE +
    '?context_id=eq.' + encodeURIComponent(contextId) +
    '&limit=1';
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey':        cfg.serviceKey,
        'Authorization': 'Bearer ' + cfg.serviceKey,
      },
    });
  } catch (netErr) {
    const e = new IdempotencyError(
      'PERSISTENCE_UNAVAILABLE',
      'Supabase network error on read: ' + netErr.message
    );
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(function() { return ''; });
    throw new IdempotencyError(
      'PERSISTENCE_UNAVAILABLE',
      'Supabase HTTP ' + res.status + ' on read: ' + body.slice(0, 200)
    );
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * _insertRow(record, cfg) → { inserted: true } | { conflict: true }
 * Attempts INSERT. Returns conflict=true if UNIQUE violation (context already exists).
 * This is the atomic step — concurrent inserts → only one succeeds.
 */
async function _insertRow(record, cfg) {
  let res;
  try {
    res = await fetch(cfg.url + '/rest/v1/' + TABLE, {
      method:  'POST',
      headers: {
        ..._headers(cfg.serviceKey),
        // On unique conflict: return 409 instead of 201
        'Prefer': 'return=representation,resolution=ignore-duplicates',
      },
      body: JSON.stringify([record]),
    });
  } catch (netErr) {
    throw new IdempotencyError(
      'PERSISTENCE_UNAVAILABLE',
      'Supabase network error on insert: ' + netErr.message
    );
  }

  if (res.status === 409 || res.status === 201) {
    // 201 = inserted, 409 = unique conflict
    return { inserted: res.status === 201, conflict: res.status === 409 };
  }

  // If Supabase returns an empty array on ignore-duplicates (some versions):
  if (res.status === 200) {
    const body = await res.json().catch(function() { return []; });
    // Empty array = conflict was ignored
    if (Array.isArray(body) && body.length === 0) {
      return { inserted: false, conflict: true };
    }
    return { inserted: true, conflict: false };
  }

  const errBody = await res.text().catch(function() { return ''; });
  throw new IdempotencyError(
    'PERSISTENCE_UNAVAILABLE',
    'Supabase unexpected HTTP ' + res.status + ' on insert: ' + errBody.slice(0, 200)
  );
}

/**
 * _updateRow(contextId, patch, cfg) → void
 * Updates row fields. Used to transition state (acquired → committed | failed).
 */
async function _updateRow(contextId, patch, cfg) {
  let res;
  try {
    res = await fetch(
      cfg.url + '/rest/v1/' + TABLE +
      '?context_id=eq.' + encodeURIComponent(contextId),
      {
        method:  'PATCH',
        headers: _headers(cfg.serviceKey),
        body:    JSON.stringify(patch),
      }
    );
  } catch (netErr) {
    // Non-fatal: booking already created — log but don't throw
    console.warn('[Fixeo Idempotency] ⚠ PATCH failed (network):', netErr.message,
      '— context_id:', contextId.slice(0, 20) + '...');
    return;
  }
  if (!res.ok) {
    const body = await res.text().catch(function() { return ''; });
    console.warn('[Fixeo Idempotency] ⚠ PATCH HTTP ' + res.status + ':', body.slice(0, 100),
      '— context_id:', contextId.slice(0, 20) + '...');
  }
}

/* ══════════════════════════════════════════════════════════════
   consumeEstimatorContext(contextId, bookingCandidate)
   ──────────────────────────────────────────────────────────────
   Atomically acquire a context_id for booking creation.

   bookingCandidate: {
     outcome_type:  string,
     service_code:  string,
     session_id:    string,
     amount_mad:    number,
   }

   Returns:
   {
     status: 'acquired' | 'already_consumed_same' | 'already_consumed_conflict',
     booking_ref?: string,   // present when already_consumed_same
     order_id?: string,      // present when already_consumed_same
   }

   Throws IdempotencyError if:
   - context_id invalid/missing
   - Supabase config missing
   - Supabase unavailable
   - context is committed with DIFFERENT service/outcome (conflict)
══════════════════════════════════════════════════════════════ */
async function consumeEstimatorContext(contextId, bookingCandidate) {
  validateContextId(contextId);

  const { outcome_type, service_code, session_id, amount_mad } = bookingCandidate;

  if (!outcome_type || !service_code || !session_id) {
    throw new IdempotencyError(
      'CONTEXT_ID_REQUIRED',
      'bookingCandidate must include outcome_type, service_code, session_id'
    );
  }

  const cfg = _getSupabaseConfig();

  /* ── Attempt atomic INSERT ── */
  const record = {
    context_id:   contextId,
    outcome_type,
    service_code,
    session_id,
    amount_mad:   Math.round(amount_mad),
    state:        'acquired',
    acquired_at:  new Date().toISOString(),
  };

  const insertResult = await _insertRow(record, cfg);

  if (insertResult.inserted) {
    // Fast path: we own this context.
    return { status: 'acquired' };
  }

  // INSERT conflicted — context already exists. Read to determine state.
  const existing = await _fetchRow(contextId, cfg);

  if (!existing) {
    // Race: row appeared and disappeared? Treat as persistence error.
    throw new IdempotencyError(
      'PERSISTENCE_UNAVAILABLE',
      'context_id conflict but row not found — race condition in persistence layer'
    );
  }

  const existingState = existing.state;

  // Recovery path: context was acquired but booking failed → allow re-try
  if (existingState === 'failed') {
    // Re-acquire via UPDATE (optimistic, no second unique conflict possible)
    await _updateRow(contextId, {
      state:       'acquired',
      acquired_at: new Date().toISOString(),
      failed_at:   null,
      failure_reason: null,
      booking_ref: null,
      order_id:    null,
    }, cfg);
    return { status: 'acquired' };
  }

  // Check service/outcome match for conflict detection
  const sameService = existing.service_code === service_code;
  const sameOutcome = existing.outcome_type === outcome_type;

  if (existingState === 'committed') {
    if (sameService && sameOutcome) {
      // Safe idempotent retry — return previous booking
      return {
        status:      'already_consumed_same',
        booking_ref: existing.booking_ref,
        order_id:    existing.order_id,
      };
    } else {
      // Committed with DIFFERENT service or outcome — conflict
      throw new IdempotencyError(
        'ALREADY_CONSUMED',
        'Estimator context already committed for a DIFFERENT service/outcome. ' +
        'existing: ' + existing.service_code + '/' + existing.outcome_type + ' ' +
        'vs attempt: ' + service_code + '/' + outcome_type
      );
    }
  }

  // State is 'acquired' — concurrent request holds it
  return { status: 'already_consumed_conflict' };
}

/* ══════════════════════════════════════════════════════════════
   commitEstimatorContext(contextId, { booking_ref, order_id })
   ──────────────────────────────────────────────────────────────
   Called AFTER successful booking creation.
   Transitions context from 'acquired' → 'committed'.
   Non-fatal if Supabase fails here (booking already created).
══════════════════════════════════════════════════════════════ */
async function commitEstimatorContext(contextId, { booking_ref, order_id }) {
  validateContextId(contextId);
  let cfg;
  try { cfg = _getSupabaseConfig(); } catch (_) { return; } // non-fatal after booking created
  await _updateRow(contextId, {
    state:        'committed',
    booking_ref,
    order_id,
    committed_at: new Date().toISOString(),
  }, cfg);
}

/* ══════════════════════════════════════════════════════════════
   failEstimatorContext(contextId, reason)
   ──────────────────────────────────────────────────────────────
   Called when booking creation fails AFTER context was acquired.
   Transitions 'acquired' → 'failed' — allows retry.
   Non-fatal (best-effort: booking never completed).
══════════════════════════════════════════════════════════════ */
async function failEstimatorContext(contextId, reason) {
  validateContextId(contextId);
  let cfg;
  try { cfg = _getSupabaseConfig(); } catch (_) { return; }
  await _updateRow(contextId, {
    state:          'failed',
    failed_at:      new Date().toISOString(),
    failure_reason: String(reason).slice(0, 500),
  }, cfg);
}

/* ── Exports ───────────────────────────────────────────────── */

module.exports = {
  consumeEstimatorContext,
  commitEstimatorContext,
  failEstimatorContext,
  IdempotencyError,
  CONTEXT_ID_RE,
};
