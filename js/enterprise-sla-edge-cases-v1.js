// BP12 edge case validators — pure functions, no DOM, no Supabase
// Used by test suite
//
// All functions are deterministic pure functions.
// No side effects. No DOM access. No network calls.
// No Supabase client dependency.
//
// References:
//   BP12 Security Audit: docs/bp12-security-audit.md
//   SLA states: 'on_track' | 'approaching' | 'breached' | 'completed' | 'not_applicable'
//   Policy precedence (most-specific-wins):
//     site+urgency > site-only > urgency-only > enterprise-default
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum SLA minutes (7 days). Matches CHECK constraint in SQL migration. */
const SLA_MINUTES_MAX = 10080;

/** Minimum SLA minutes. */
const SLA_MINUTES_MIN = 1;

/**
 * Fraction of SLA elapsed at which state transitions to 'approaching'.
 * 80% consumed → 'approaching'. Matches server-side threshold.
 */
const SLA_APPROACHING_THRESHOLD = 0.8;

/**
 * Request statuses that resolve to SLA state 'completed'.
 * SEC-12: validated/completed requests are 'completed', not 'breached'.
 */
const SLA_COMPLETED_STATUSES = ['validated', 'completed'];

/**
 * Request statuses that resolve to SLA state 'not_applicable'.
 * SEC-13: cancelled/no_match requests have no valid SLA outcome.
 */
const SLA_NOT_APPLICABLE_STATUSES = ['cancelled', 'no_match'];

// ─────────────────────────────────────────────────────────────────────────────
// validateSLAMinutes(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate SLA response_minutes value.
 *
 * Security notes (SEC-08, SEC-19):
 *   - Must be a finite integer
 *   - Must be > 0 (CHECK constraint: response_minutes > 0)
 *   - Must be ≤ SLA_MINUTES_MAX to prevent permanently-on_track bypass
 *   - NULL/undefined/NaN must be rejected (prevents NULL bypass of CHECK)
 *
 * @param {*} val - Candidate value (number, string, null, undefined)
 * @returns {{ valid: boolean, reason: string }}
 */
function validateSLAMinutes(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'La valeur est requise (null non autorisé)' };
  }

  const n = Number(val);

  if (!isFinite(n)) {
    return { valid: false, reason: 'La valeur doit être un nombre fini' };
  }

  if (!Number.isInteger(n)) {
    return { valid: false, reason: 'La valeur doit être un entier' };
  }

  if (n <= 0) {
    return { valid: false, reason: 'La valeur doit être supérieure à 0' };
  }

  if (n > SLA_MINUTES_MAX) {
    return {
      valid: false,
      reason: 'Maximum ' + SLA_MINUTES_MAX + ' minutes (' +
              Math.round(SLA_MINUTES_MAX / 60 / 24) + ' jours)'
    };
  }

  return { valid: true, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// isSLATerminalStatus(status) → boolean
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns true if the request status means SLA computation is terminal
 * (no further deadline tracking needed).
 *
 * Security notes (SEC-12, SEC-13):
 *   - 'validated'/'completed' → SLA state = 'completed' (work done)
 *   - 'cancelled'/'no_match'  → SLA state = 'not_applicable'
 *
 * This check MUST be applied BEFORE any deadline comparison in
 * deriveSLAStateLocal to avoid marking resolved requests as 'breached'.
 *
 * @param {string|null|undefined} status - Service request status
 * @returns {boolean}
 */
function isSLATerminalStatus(status) {
  if (typeof status !== 'string') return false;
  return (
    SLA_COMPLETED_STATUSES.includes(status) ||
    SLA_NOT_APPLICABLE_STATUSES.includes(status)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getPolicyPrecedence(policies, siteId, urgency) → policy | null
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Select the best-matching SLA policy for a (siteId, urgency) pair
 * according to the precedence rule (most-specific-wins):
 *
 *   Priority 4 (highest): site_id match AND urgency match
 *   Priority 3:           site_id match, urgency IS NULL (site-only)
 *   Priority 2:           site_id IS NULL, urgency match (urgency-only)
 *   Priority 1 (lowest):  site_id IS NULL, urgency IS NULL (enterprise-default)
 *
 * Security notes (SEC-10):
 *   - Only policies with active = true should be in the input array.
 *   - Callers must pre-filter: policies.filter(p => p.active === true)
 *   - This function does NOT filter by active — it is a pure precedence selector.
 *
 * @param {Array<{site_id: string|null, urgency: string|null, response_minutes: number, active?: boolean}>} policies
 * @param {string|null} siteId  - Site UUID or null for enterprise-wide
 * @param {string|null} urgency - Urgency value ('normale'|'urgent'|'now') or null
 * @returns {object|null} Best matching policy object, or null if no match
 */
function getPolicyPrecedence(policies, siteId, urgency) {
  if (!Array.isArray(policies) || policies.length === 0) return null;

  // Normalize inputs: treat empty string as null
  var normSite    = (siteId    != null && siteId    !== '') ? siteId    : null;
  var normUrgency = (urgency   != null && urgency   !== '') ? urgency   : null;

  var best = null;
  var bestPriority = -1;

  for (var i = 0; i < policies.length; i++) {
    var p = policies[i];
    var pSite    = (p.site_id  != null && p.site_id  !== '') ? p.site_id  : null;
    var pUrgency = (p.urgency  != null && p.urgency  !== '') ? p.urgency  : null;

    // Determine if this policy matches the (siteId, urgency) request
    var siteMatch    = (pSite    === normSite);
    var urgencyMatch = (pUrgency === normUrgency);

    if (!siteMatch && !urgencyMatch) {
      // Neither matches the request dimensions; check if it's the enterprise default
      if (pSite === null && pUrgency === null) {
        // Enterprise default: matches any request (lowest priority)
        if (bestPriority < 1) {
          bestPriority = 1;
          best = p;
        }
      }
      continue;
    }

    // Calculate priority score
    var priority = 0;
    var matches = false;

    if (pSite === normSite && pUrgency === normUrgency) {
      // Exact match on both dimensions: highest priority
      priority = 4;
      matches = true;
    } else if (pSite === normSite && pUrgency === null) {
      // Site-only match (urgency wildcard)
      priority = 3;
      matches = true;
    } else if (pSite === null && pUrgency === normUrgency) {
      // Urgency-only match (site wildcard)
      priority = 2;
      matches = true;
    } else if (pSite === null && pUrgency === null) {
      // Enterprise default
      priority = 1;
      matches = true;
    }

    if (matches && priority > bestPriority) {
      bestPriority = priority;
      best = p;
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveSLAStateLocal(row) → sla_state string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Derive the SLA state string from a combined request+policy+mission row.
 * FOR TEST LOGIC ONLY — not for authorization or breach determination in production.
 * The authoritative SLA state is always computed server-side.
 *
 * Expected row shape:
 * {
 *   status:             string,          // service request status
 *   created_at:         string|Date,     // sr.created_at (NOT NULL guaranteed)
 *   sla_response_deadline: string|null,  // ISO 8601 UTC — from server, or null if no policy
 *   // Optional: mission timestamps (may be null — SEC-11)
 *   accepted_at:        string|null,
 *   started_at:         string|null,
 *   completed_at:       string|null,
 *   // For local deadline calculation (optional — use sla_response_deadline if available)
 *   response_minutes:   number|null,
 * }
 * @param {object} row
 * @returns {'on_track'|'approaching'|'breached'|'completed'|'not_applicable'}
 */
function deriveSLAStateLocal(row) {
  if (!row) return 'not_applicable';

  // ── Step 1: terminal status check (MUST be first — SEC-12, SEC-13)
  if (SLA_COMPLETED_STATUSES.includes(row.status)) {
    return 'completed';
  }
  if (SLA_NOT_APPLICABLE_STATUSES.includes(row.status)) {
    return 'not_applicable';
  }

  // ── Step 2: resolve SLA deadline
  var deadline = null;

  if (row.sla_response_deadline) {
    // Server-provided deadline (authoritative)
    deadline = new Date(row.sla_response_deadline);
  } else if (row.response_minutes != null && row.created_at) {
    // Local calculation fallback (for test suite only)
    var createdAt = new Date(row.created_at);
    if (!isNaN(createdAt.getTime())) {
      deadline = new Date(createdAt.getTime() + row.response_minutes * 60 * 1000);
    }
  }

  // ── Step 3: no applicable policy (no deadline)
  if (!deadline || isNaN(deadline.getTime())) {
    return 'not_applicable';
  }

  // ── Step 4: derive baseline from sr.created_at (always available — SEC-11 note)
  var createdAt = row.created_at ? new Date(row.created_at) : null;
  if (!createdAt || isNaN(createdAt.getTime())) {
    // created_at is NOT NULL in schema, but guard defensively
    return 'not_applicable';
  }

  // ── Step 5: compute state from now vs deadline
  var now = new Date();
  var totalMs = deadline.getTime() - createdAt.getTime();

  if (now >= deadline) {
    return 'breached';
  }

  if (totalMs > 0) {
    var elapsed = now.getTime() - createdAt.getTime();
    var fraction = elapsed / totalMs;
    if (fraction >= SLA_APPROACHING_THRESHOLD) {
      return 'approaching';
    }
  }

  return 'on_track';
}

// ─────────────────────────────────────────────────────────────────────────────
// formatSLARemainingTest(deadlineISO, nowISO) → { label, overdue, minutesLeft }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Format a human-readable SLA countdown label.
 * For test logic only — production may use locale-specific formatting.
 *
 * Security notes (SEC-15, SEC-16):
 *   - Uses server-provided deadlineISO (UTC) — not computed from browser clock for auth
 *   - nowISO is the reference time for test determinism; production uses Date.now()
 *   - This function is display-only; never used for breach determination in production
 *
 * @param {string} deadlineISO - ISO 8601 UTC deadline timestamp
 * @param {string} [nowISO]    - ISO 8601 UTC reference time (defaults to Date.now())
 * @returns {{ label: string, overdue: boolean, minutesLeft: number }}
 *   label:       Human-readable countdown (e.g., "47 min restantes", "Dépassé de 2h 10min")
 *   overdue:     true if deadline has passed
 *   minutesLeft: Negative if overdue, positive if remaining
 */
function formatSLARemainingTest(deadlineISO, nowISO) {
  var deadline = new Date(deadlineISO);
  var now      = nowISO ? new Date(nowISO) : new Date();

  if (isNaN(deadline.getTime())) {
    return { label: 'Délai inconnu', overdue: false, minutesLeft: 0 };
  }

  var diffMs      = deadline.getTime() - now.getTime();
  var diffMinutes = diffMs / 60000;
  var overdue     = diffMs < 0;
  var absDiff     = Math.abs(diffMs);

  var label;
  var hours   = Math.floor(absDiff / 3600000);
  var minutes = Math.floor((absDiff % 3600000) / 60000);

  if (hours === 0 && minutes === 0) {
    label = overdue ? 'Dépassé à l\'instant' : 'Délai imminent';
  } else if (hours === 0) {
    label = overdue
      ? 'Dépassé de ' + minutes + ' min'
      : minutes + ' min restante' + (minutes > 1 ? 's' : '');
  } else if (minutes === 0) {
    label = overdue
      ? 'Dépassé de ' + hours + 'h'
      : hours + 'h restante' + (hours > 1 ? 's' : '');
  } else {
    label = overdue
      ? 'Dépassé de ' + hours + 'h ' + minutes + 'min'
      : hours + 'h ' + minutes + 'min restantes';
  }

  return {
    label:       label,
    overdue:     overdue,
    minutesLeft: Math.round(diffMinutes)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  validateSLAMinutes,
  deriveSLAStateLocal,
  getPolicyPrecedence,
  formatSLARemainingTest,
  isSLATerminalStatus,
  // Expose constants for test assertions
  SLA_MINUTES_MAX:             SLA_MINUTES_MAX,
  SLA_MINUTES_MIN:             SLA_MINUTES_MIN,
  SLA_APPROACHING_THRESHOLD:   SLA_APPROACHING_THRESHOLD,
  SLA_COMPLETED_STATUSES:      SLA_COMPLETED_STATUSES,
  SLA_NOT_APPLICABLE_STATUSES: SLA_NOT_APPLICABLE_STATUSES,
};
