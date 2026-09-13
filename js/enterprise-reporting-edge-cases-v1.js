'use strict';
// enterprise-reporting-edge-cases-v1.js
// BP14: Pure-JS validators and computation helpers for reporting layer.
// No DOM, no Supabase, no external dependencies.
// All functions are null-safe and side-effect-free.

/**
 * Validate p_days parameter (must be integer 1–90).
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validatePeriodDays(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    return { valid: false, reason: 'not_a_number' };
  }
  if (!Number.isInteger(n)) {
    return { valid: false, reason: 'not_an_integer' };
  }
  if (n < 1) {
    return { valid: false, reason: 'below_minimum_1' };
  }
  if (n > 90) {
    return { valid: false, reason: 'above_maximum_90' };
  }
  return { valid: true, reason: 'ok' };
}

/**
 * Validate p_bucket parameter ('day' or 'week' only).
 * Prevents SQL injection via interval string interpolation.
 * @param {*} val
 * @returns {{ valid: boolean, reason: string }}
 */
function validateBucket(val) {
  if (val === null || val === undefined) {
    return { valid: false, reason: 'null_or_undefined' };
  }
  if (typeof val !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }
  if (val === 'day' || val === 'week') {
    return { valid: true, reason: 'ok' };
  }
  return { valid: false, reason: 'invalid_value_must_be_day_or_week' };
}

/**
 * Compute completion rate as a percentage (1 decimal place).
 * Returns null when total === 0 to avoid misleading 0% display.
 * @param {number|null} completed
 * @param {number|null} total
 * @returns {number|null}
 */
function computeCompletionRate(completed, total) {
  if (total == null || total === 0) return null;
  if (completed == null) return 0.0;
  const raw = (completed / total) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * Format a period-over-period delta.
 * Returns null when either value is null/undefined, or when prev === 0
 * (avoids Infinity or misleading 100% from-zero jumps).
 * @param {number|null} current
 * @param {number|null} prev
 * @returns {{ value: number, pct: number, direction: 'up'|'down'|'flat' }|null}
 */
function formatDelta(current, prev) {
  if (current == null || prev == null) return null;
  if (prev === 0) return null; // avoid Infinity
  const diff = current - prev;
  const pct  = Math.round((diff / prev) * 1000) / 10; // 1 decimal
  return {
    value:     diff,
    pct:       pct,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

/**
 * Compute attention score using the deterministic formula:
 *   score = (urgent_open × 4) + (sla_breached × 3) + (esc_open × 3) + (open × 1)
 * Higher = more management attention required.
 * @param {{ urgent_open?: number, sla_breached?: number, esc_open?: number, open?: number }} params
 * @returns {number}
 */
function computeAttentionScore({ urgent_open = 0, sla_breached = 0, esc_open = 0, open = 0 } = {}) {
  return (
    (Number(urgent_open)  || 0) * 4 +
    (Number(sla_breached) || 0) * 3 +
    (Number(esc_open)     || 0) * 3 +
    (Number(open)         || 0) * 1
  );
}

/**
 * Check if an executive summary object has all-zero / all-null metrics.
 * Used to decide whether to show an empty state vs a populated dashboard.
 * @param {object|null} summary
 * @returns {boolean}
 */
function isEmptyReport(summary) {
  if (!summary || typeof summary !== 'object') return true;
  const metricsToCheck = [
    'total_requests',
    'open_requests',
    'completed_requests',
    'urgent_requests',
    'sla_breached',
    'escalations_open',
  ];
  return metricsToCheck.every(k => !summary[k] || Number(summary[k]) === 0);
}

/**
 * Human-readable French label for a management attention priority level.
 * @param {number} priority
 * @returns {string}
 */
function getAttentionPriorityLabel(priority) {
  switch (priority) {
    case 1:  return 'Critique';
    case 2:  return 'Haute priorité';
    case 3:  return 'À surveiller';
    default: return 'Inconnu';
  }
}

module.exports = {
  validatePeriodDays,
  validateBucket,
  computeCompletionRate,
  formatDelta,
  computeAttentionScore,
  isEmptyReport,
  getAttentionPriorityLabel,
};
