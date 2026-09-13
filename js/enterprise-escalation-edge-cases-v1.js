// enterprise-escalation-edge-cases-v1.js
// BP13 Enterprise Escalation Lifecycle — pure-JS edge-case validators
//
// All functions are deterministic pure functions.
// No side effects. No DOM access. No network calls.
// No Supabase client dependency.
//
// References:
//   BP13 Security Audit: docs/bp13-security-audit.md
//   Escalation states:   'open' | 'acknowledged' | 'resolved'
//   Severity:            'critical' | 'high' | 'medium' | 'low'
//   Reason codes:        'sla_breached' | 'sla_approaching' | 'urgent_unassigned' |
//                        'mission_stalled' | 'manual'
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

/** All valid escalation statuses. */
var VALID_ESCALATION_STATUSES = Object.freeze(['open', 'acknowledged', 'resolved']);

/** Terminal escalation status — only 'resolved' is terminal. */
var TERMINAL_ESCALATION_STATUS = 'resolved';

/** Valid severity values (matches SQL CHECK constraint). */
var VALID_SEVERITY = Object.freeze(['critical', 'high', 'medium', 'low']);

/** Valid reason codes (matches SQL CHECK constraint). */
var VALID_REASON_CODES = Object.freeze([
  'sla_breached',
  'sla_approaching',
  'urgent_unassigned',
  'mission_stalled',
  'manual',
]);

/**
 * Roles that may open, acknowledge, or resolve escalations.
 * SEC-01: owner/admin/operations_manager/site_manager can mutate.
 * SEC-03/SEC-04: reporter/viewer are excluded.
 */
var CAN_ESCALATE_ROLES = Object.freeze([
  'owner',
  'admin',
  'operations_manager',
  'site_manager',
]);

/**
 * Escalation state sort order for priority display.
 * Lower number = higher priority / displayed first.
 * Used by getEscalationPriority().
 */
var STATUS_PRIORITY = Object.freeze({
  open: 0,
  acknowledged: 1,
  resolved: 2,
});

/**
 * Severity sort order. Lower number = higher priority.
 * Used by getEscalationPriority().
 */
var SEVERITY_PRIORITY = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
});

// ─────────────────────────────────────────────────────────────────────────────
// validateEscalationSeverity(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate escalation severity value.
 *
 * Security notes (SEC-24):
 *   - Must be a member of the VALID_SEVERITY whitelist.
 *   - Null, undefined, or unknown strings are rejected.
 *   - Never use raw severity values as CSS class names without whitelisting.
 *
 * @param {*} val - Candidate value
 * @returns {{ valid: boolean, reason: string }}
 */
function validateEscalationSeverity(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'La sévérité est requise' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'La sévérité doit être une chaîne' };
  }
  if (VALID_SEVERITY.indexOf(val) === -1) {
    return {
      valid: false,
      reason: 'Sévérité invalide. Valeurs autorisées : ' + VALID_SEVERITY.join(', '),
    };
  }
  return { valid: true, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateEscalationReasonCode(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate reason code value.
 *
 * Security notes (SEC-24):
 *   - Must be a member of the VALID_REASON_CODES whitelist.
 *   - Null, undefined, or unknown strings are rejected.
 *   - The partial unique index (ee_unique_active_escalation) uses reason_code —
 *     an invalid value that bypasses the RPC CHECK would cause unexpected unique
 *     index behavior; whitelist validation prevents this.
 *
 * @param {*} val - Candidate value
 * @returns {{ valid: boolean, reason: string }}
 */
function validateEscalationReasonCode(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'Le code de raison est requis' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'Le code de raison doit être une chaîne' };
  }
  if (VALID_REASON_CODES.indexOf(val) === -1) {
    return {
      valid: false,
      reason: 'Code de raison invalide. Valeurs autorisées : ' + VALID_REASON_CODES.join(', '),
    };
  }
  return { valid: true, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateResolutionNote(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a resolution note before calling resolve_escalation.
 *
 * Security notes (SEC-29):
 *   - Required when resolving. Must be non-empty after trimming.
 *   - Mirrors the SQL CHECK constraint ee_resolution_requires_note.
 *   - Maximum length: 2000 characters (prevents excessively long DB writes and
 *     potential display overflow attacks).
 *   - Note: content is stored as-is and must be rendered via textContent (SEC-23).
 *
 * @param {*} val - Candidate resolution note
 * @returns {{ valid: boolean, reason: string }}
 */
function validateResolutionNote(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'Une note de résolution est requise' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'La note de résolution doit être une chaîne' };
  }
  var trimmed = val.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'La note de résolution ne peut pas être vide' };
  }
  if (trimmed.length > 2000) {
    return {
      valid: false,
      reason: 'La note de résolution ne peut pas dépasser 2000 caractères (actuellement : ' +
               trimmed.length + ')',
    };
  }
  return { valid: true, reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveEscalationStateAction(status, role) → { canAck, canResolve, canOpen }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Determine which lifecycle actions are available given an escalation status
 * and the caller's role.
 *
 * State machine:
 *   open         → can acknowledge (→ acknowledged) OR resolve (→ resolved)
 *   acknowledged → can resolve (→ resolved); cannot acknowledge again
 *   resolved     → terminal; no further actions
 *
 * Role constraints (SEC-01 through SEC-04):
 *   Mutation roles: owner, admin, operations_manager, site_manager
 *   Read-only roles: reporter, viewer → canOpen/canAck/canResolve = false
 *
 * Note: site_manager scope (SEC-02) is a server-side concern. This function
 * only evaluates role membership and lifecycle state — it does NOT check
 * site_id assignment. The server RPC enforces site scope authoritatively.
 *
 * @param {string|null|undefined} status - Current escalation status
 * @param {string|null|undefined} role   - Caller's enterprise role
 * @returns {{ canAck: boolean, canResolve: boolean, canOpen: boolean }}
 */
function deriveEscalationStateAction(status, role) {
  var hasMutationRole = (typeof role === 'string') &&
                        (CAN_ESCALATE_ROLES.indexOf(role) !== -1);

  if (!hasMutationRole) {
    return { canAck: false, canResolve: false, canOpen: false };
  }

  // canOpen: only valid when there is no current escalation (status is null/undefined)
  // or when the last escalation is resolved (no longer active — new one can be opened).
  // For an existing row, canOpen is false for all active statuses.
  var canOpen = (status === null || status === undefined || status === 'resolved');

  // canAck: only valid when status = 'open'
  var canAck = (status === 'open');

  // canResolve: valid when status = 'open' OR status = 'acknowledged'
  // (resolve is allowed from either active state — SEC-16)
  var canResolve = (status === 'open' || status === 'acknowledged');

  return { canAck: canAck, canResolve: canResolve, canOpen: canOpen };
}

// ─────────────────────────────────────────────────────────────────────────────
// isTerminalEscalationStatus(status) → boolean
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns true if the escalation status is terminal (no further lifecycle
 * transitions are possible).
 *
 * Security notes (SEC-16):
 *   - Only 'resolved' is terminal.
 *   - 'open' and 'acknowledged' are active states — further actions are possible.
 *   - There is no 'cancelled' or 'no_match' status for escalations (those are
 *     service_request statuses — different lifecycle).
 *   - No reopen feature: a resolved escalation cannot transition back to 'open'.
 *     A new escalation row must be opened after resolution.
 *
 * @param {string|null|undefined} status - Escalation status
 * @returns {boolean}
 */
function isTerminalEscalationStatus(status) {
  return status === TERMINAL_ESCALATION_STATUS;
}

// ─────────────────────────────────────────────────────────────────────────────
// getEscalationPriority(severity, status) → number
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute a numeric priority score for sorting escalations.
 * Lower number = higher priority (appears first in an ascending sort).
 *
 * Priority formula:
 *   priority = (statusPriority * 10) + severityPriority
 *
 * This ensures:
 *   - All 'open' escalations appear before 'acknowledged' ones
 *   - Within the same status group, 'critical' appears before 'high', etc.
 *   - 'resolved' escalations always appear last (highest numeric priority)
 *
 * Examples (ascending = highest priority first):
 *   critical + open       → 0 * 10 + 0 = 0     (highest)
 *   high     + open       → 0 * 10 + 1 = 1
 *   medium   + open       → 0 * 10 + 2 = 2
 *   low      + open       → 0 * 10 + 3 = 3
 *   critical + acknowledged → 1 * 10 + 0 = 10
 *   high     + acknowledged → 1 * 10 + 1 = 11
 *   critical + resolved   → 2 * 10 + 0 = 20
 *   low      + resolved   → 2 * 10 + 3 = 23    (lowest)
 *
 * Unknown or null values fall back to the lowest priority in their dimension.
 *
 * @param {string|null|undefined} severity - Escalation severity
 * @param {string|null|undefined} status   - Escalation status
 * @returns {number} Priority score (lower = higher priority)
 */
function getEscalationPriority(severity, status) {
  var sevScore = (typeof severity === 'string' && SEVERITY_PRIORITY[severity] !== undefined)
    ? SEVERITY_PRIORITY[severity]
    : VALID_SEVERITY.length;  // unknown severity → lowest priority within group

  var statScore = (typeof status === 'string' && STATUS_PRIORITY[status] !== undefined)
    ? STATUS_PRIORITY[status]
    : VALID_ESCALATION_STATUSES.length;  // unknown status → lowest group

  return (statScore * 10) + sevScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  validateEscalationSeverity:   validateEscalationSeverity,
  validateEscalationReasonCode: validateEscalationReasonCode,
  validateResolutionNote:       validateResolutionNote,
  deriveEscalationStateAction:  deriveEscalationStateAction,
  isTerminalEscalationStatus:   isTerminalEscalationStatus,
  getEscalationPriority:        getEscalationPriority,
  // Expose constants for test assertions
  VALID_ESCALATION_STATUSES:    VALID_ESCALATION_STATUSES,
  TERMINAL_ESCALATION_STATUS:   TERMINAL_ESCALATION_STATUS,
  VALID_SEVERITY:               VALID_SEVERITY,
  VALID_REASON_CODES:           VALID_REASON_CODES,
  CAN_ESCALATE_ROLES:           CAN_ESCALATE_ROLES,
  STATUS_PRIORITY:              STATUS_PRIORITY,
  SEVERITY_PRIORITY:            SEVERITY_PRIORITY,
};
