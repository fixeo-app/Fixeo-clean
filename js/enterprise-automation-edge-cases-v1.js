// enterprise-automation-edge-cases-v1.js
// BP15 Enterprise Automation — pure-JS edge-case validators
//
// All functions are deterministic pure functions.
// No side effects. No DOM access. No network calls.
// No Supabase client dependency.
//
// References:
//   BP15 SQL:  supabase/bp15-enterprise-automation.sql
//   Evaluator: evaluate_enterprise_automations(p_enterprise_id, p_limit)
//   Signals:   sla_breached | urgent_unattended | escalation_unacknowledged
//   Actions:   open_escalation
//   Outcomes:  executed | skipped | error
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

/** V1 allowlist — signal_type values accepted by the evaluator. */
var VALID_SIGNAL_TYPES = Object.freeze([
  'sla_breached',
  'urgent_unattended',
  'escalation_unacknowledged',
]);

/** V1 allowlist — action_type values accepted by the evaluator. */
var VALID_ACTION_TYPES = Object.freeze([
  'open_escalation',
]);

/** Valid severity values — must match SQL CHECK constraint. */
var VALID_SEVERITY = Object.freeze(['critical', 'high', 'medium', 'low']);

/** Valid urgency_filter values — must match SQL CHECK constraint (nullable). */
var VALID_URGENCY_FILTER = Object.freeze(['normale', 'urgent', 'now']);

/**
 * Terminal SR statuses: evaluator will NOT open a new escalation when
 * a service request is in one of these states.
 * Matches SQL WHERE sr.status NOT IN ('validated','cancelled','no_match').
 */
var TERMINAL_SR_STATUSES = Object.freeze(['validated', 'cancelled', 'no_match']);

/**
 * Active escalation statuses — partial unique index guard.
 * ee_unique_active_escalation is WHERE status IN ('open','acknowledged').
 */
var ACTIVE_ESCALATION_STATUSES = Object.freeze(['open', 'acknowledged']);

/** Valid execution outcome values. */
var VALID_OUTCOMES = Object.freeze(['executed', 'skipped', 'error']);

/**
 * Maximum rule name length.
 * Matches text field sensible upper bound; prevents unbounded DB writes.
 */
var RULE_NAME_MAX_LENGTH = 200;

/**
 * Maximum threshold_minutes value (1 week = 7 × 24 × 60 = 10080).
 * Matches SQL CHECK constraint ear_threshold_positive.
 */
var THRESHOLD_MINUTES_MAX = 10080;

// ─────────────────────────────────────────────────────────────────────────────
// validateRuleName(name) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate automation rule name.
 *
 * Rules:
 *   - Must be a non-empty string after trimming
 *   - Maximum RULE_NAME_MAX_LENGTH characters (trimmed)
 *
 * @param {*} name
 * @returns {{ valid: boolean, reason: string }}
 */
function validateRuleName(name) {
  if (name === null || name === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  if (typeof name !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  var trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'empty_after_trim' };
  }
  if (trimmed.length > RULE_NAME_MAX_LENGTH) {
    return { valid: false, reason: 'exceeds_max_length_200' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateThreshold(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate threshold_minutes value.
 *
 * Rules:
 *   - null/undefined is valid (optional field)
 *   - Must be a positive integer if provided
 *   - Maximum THRESHOLD_MINUTES_MAX (1 week in minutes)
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateThreshold(val) {
  if (val === null || val === undefined) {
    return { valid: true, reason: 'ok_optional' };
  }
  var n = Number(val);
  if (!Number.isFinite(n)) {
    return { valid: false, reason: 'not_a_number' };
  }
  if (!Number.isInteger(n)) {
    return { valid: false, reason: 'not_an_integer' };
  }
  if (n <= 0) {
    return { valid: false, reason: 'must_be_positive' };
  }
  if (n > THRESHOLD_MINUTES_MAX) {
    return { valid: false, reason: 'exceeds_max_10080' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSignalType(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate signal_type value.
 *
 * Must be a member of the V1 VALID_SIGNAL_TYPES allowlist.
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateSignalType(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  if (VALID_SIGNAL_TYPES.indexOf(val) === -1) {
    return { valid: false, reason: 'not_in_allowlist' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateActionType(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate action_type value.
 *
 * V1 only supports 'open_escalation'.
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateActionType(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  if (val !== 'open_escalation') {
    return { valid: false, reason: 'not_in_allowlist' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSeverity(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate severity value.
 *
 * Must be in: critical / high / medium / low
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateSeverity(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  if (VALID_SEVERITY.indexOf(val) === -1) {
    return { valid: false, reason: 'not_in_allowlist' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateUrgencyFilter(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate urgency_filter value.
 *
 * Rules:
 *   - null/undefined is valid (optional — rule matches all urgencies)
 *   - If provided, must be in: normale / urgent / now
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateUrgencyFilter(val) {
  if (val === null || val === undefined) {
    return { valid: true, reason: 'ok_optional' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  if (VALID_URGENCY_FILTER.indexOf(val) === -1) {
    return { valid: false, reason: 'not_in_allowlist' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateReasonCode(val) → { valid: boolean, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Validate a candidate reason_code value for the escalation opened by the rule.
 *
 * Rules:
 *   - null/undefined falls back to default 'auto' — valid
 *   - If provided, must be a non-empty string after trimming
 *   - 'auto' is explicitly valid
 *
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateReasonCode(val) {
  if (val === null || val === undefined) {
    return { valid: true, reason: 'ok_defaults_to_auto' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  var trimmed = val.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'empty_after_trim' };
  }
  return { valid: true, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSignalKey(signalType, targetId, ruleId) → string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build the idempotency key stored in enterprise_automation_executions.signal_key.
 *
 * Format: 'signalType:targetId:ruleId'
 *
 * This key — combined with rule_id in the unique index idx_eae_idempotency
 * WHERE outcome = 'executed' — prevents duplicate execution of the same
 * rule against the same target signal within a rolling window.
 *
 * The target_id is typically the service_request id for open_escalation.
 *
 * @param {string} signalType - e.g. 'sla_breached'
 * @param {string} targetId   - e.g. a UUID string for the service request
 * @param {string} ruleId     - UUID of the automation rule
 * @returns {string}
 */
function buildSignalKey(signalType, targetId, ruleId) {
  return signalType + ':' + targetId + ':' + ruleId;
}

// ─────────────────────────────────────────────────────────────────────────────
// isTerminalStatus(status) → boolean
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return true when the service request status is terminal.
 *
 * Terminal statuses: 'validated' | 'cancelled' | 'no_match'
 *
 * The evaluator excludes these statuses from all signal loops to prevent
 * opening escalations on closed/cancelled requests.
 *
 * Null-safe: null/undefined → false.
 *
 * @param {*} status
 * @returns {boolean}
 */
function isTerminalStatus(status) {
  if (status === null || status === undefined) return false;
  return TERMINAL_SR_STATUSES.indexOf(status) !== -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// isActiveEscalationStatus(status) → boolean
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return true when the escalation status is "active" (open or acknowledged).
 *
 * This mirrors the partial unique index guard:
 *   ee_unique_active_escalation — WHERE status IN ('open','acknowledged')
 *
 * The evaluator checks for an existing active escalation before inserting
 * a new one to avoid the DB-level unique_violation in the common path.
 *
 * Null-safe: null/undefined → false.
 *
 * @param {*} status
 * @returns {boolean}
 */
function isActiveEscalationStatus(status) {
  if (status === null || status === undefined) return false;
  return ACTIVE_ESCALATION_STATUSES.indexOf(status) !== -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// describeRuleText(rule) → French string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build a human-readable French description of an automation rule.
 *
 * Examples:
 *   "Quand SLA dépassé → Ouvrir une escalade (haute priorité)"
 *   "Quand urgence non prise en charge → Ouvrir une escalade (30 min, immédiate)"
 *
 * @param {{ signal_type: string, action_type: string, severity?: string,
 *           threshold_minutes?: number|null, urgency_filter?: string|null,
 *           active?: boolean }} rule
 * @returns {string}
 */
function describeRuleText(rule) {
  if (!rule || typeof rule !== 'object') return 'Règle invalide';

  var signalLabel  = getSignalLabel(rule.signal_type);
  var actionLabel  = getActionLabel(rule.action_type);
  var sevLabel     = rule.severity ? getSeverityLabel(rule.severity) : '';

  var parts = [];
  if (rule.threshold_minutes != null) {
    parts.push(rule.threshold_minutes + ' min');
  }
  if (rule.urgency_filter === 'now') {
    parts.push('immédiate');
  } else if (rule.urgency_filter === 'urgent') {
    parts.push('urgente');
  } else if (rule.urgency_filter === 'normale') {
    parts.push('normale');
  }
  if (sevLabel) {
    parts.push(sevLabel);
  }

  var detail = parts.length > 0 ? ' (' + parts.join(', ') + ')' : '';
  return 'Quand ' + signalLabel + ' → ' + actionLabel + detail;
}

// ─────────────────────────────────────────────────────────────────────────────
// getOutcomeLabel(outcome) → French string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a French label for an execution outcome.
 *
 * @param {string} outcome - 'executed' | 'skipped' | 'error'
 * @returns {string}
 */
function getOutcomeLabel(outcome) {
  switch (outcome) {
    case 'executed': return 'Exécuté';
    case 'skipped':  return 'Ignoré';
    case 'error':    return 'Erreur';
    default:         return 'Inconnu';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getSignalLabel(signal) → French string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a French label for a signal_type value.
 *
 * @param {string} signal
 * @returns {string}
 */
function getSignalLabel(signal) {
  switch (signal) {
    case 'sla_breached':               return 'SLA dépassé';
    case 'urgent_unattended':          return 'urgence non prise en charge';
    case 'escalation_unacknowledged':  return 'escalade non acquittée';
    default:                           return 'signal inconnu';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getActionLabel(action) → French string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a French label for an action_type value.
 *
 * @param {string} action
 * @returns {string}
 */
function getActionLabel(action) {
  switch (action) {
    case 'open_escalation': return 'Ouvrir une escalade';
    default:                return 'action inconnue';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getSeverityLabel(severity) → French string
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a French label for a severity value.
 *
 * @param {string} severity - 'critical' | 'high' | 'medium' | 'low'
 * @returns {string}
 */
function getSeverityLabel(severity) {
  switch (severity) {
    case 'critical': return 'critique';
    case 'high':     return 'haute priorité';
    case 'medium':   return 'priorité moyenne';
    case 'low':      return 'faible priorité';
    default:         return 'sévérité inconnue';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  validateRuleName:          validateRuleName,
  validateThreshold:         validateThreshold,
  validateSignalType:        validateSignalType,
  validateActionType:        validateActionType,
  validateSeverity:          validateSeverity,
  validateUrgencyFilter:     validateUrgencyFilter,
  validateReasonCode:        validateReasonCode,
  buildSignalKey:            buildSignalKey,
  isTerminalStatus:          isTerminalStatus,
  isActiveEscalationStatus:  isActiveEscalationStatus,
  describeRuleText:          describeRuleText,
  getOutcomeLabel:           getOutcomeLabel,
  getSignalLabel:            getSignalLabel,
  getActionLabel:            getActionLabel,
  getSeverityLabel:          getSeverityLabel,
  // Expose constants for test assertions
  VALID_SIGNAL_TYPES:        VALID_SIGNAL_TYPES,
  VALID_ACTION_TYPES:        VALID_ACTION_TYPES,
  VALID_SEVERITY:            VALID_SEVERITY,
  VALID_URGENCY_FILTER:      VALID_URGENCY_FILTER,
  TERMINAL_SR_STATUSES:      TERMINAL_SR_STATUSES,
  ACTIVE_ESCALATION_STATUSES: ACTIVE_ESCALATION_STATUSES,
  VALID_OUTCOMES:            VALID_OUTCOMES,
  RULE_NAME_MAX_LENGTH:      RULE_NAME_MAX_LENGTH,
  THRESHOLD_MINUTES_MAX:     THRESHOLD_MINUTES_MAX,
};
