/**
 * enterprise-reporting-contract-v1.js
 * ============================================================================
 * window.EnterpriseReportingContract
 *
 * Client-side reporting contract module — RPC wrappers and UI helpers for
 * the BP14 enterprise reporting system.
 *
 * ⚠️  REPORTING AUTHORITY IS ALWAYS THE SERVER.
 *     This module is for RENDERING and RPC CALLS ONLY.
 *     Never use these helpers to gate access or make business decisions.
 *     All metrics and states are derived from server-returned data.
 *     Period clamping (1-90 days) is enforced server-side.
 * ============================================================================
 */

;(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else {
    // Browser global
    root.EnterpriseReportingContract = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Supabase client reference
  // Expects window.supabase to be initialised before calling fetch helpers.
  // --------------------------------------------------------------------------
  function _client () {
    if (typeof window !== 'undefined' && window.supabase) return window.supabase;
    if (typeof globalThis !== 'undefined' && globalThis.supabase) return globalThis.supabase;
    throw new Error('[EnterpriseReportingContract] supabase client not found on window/globalThis');
  }

  // ==========================================================================
  // PERIOD_OPTIONS
  //
  // Standard period selector options for reporting UI.
  // ==========================================================================
  const PERIOD_OPTIONS = Object.freeze([
    { value: 7,  label: '7 jours'  },
    { value: 30, label: '30 jours' },
    { value: 90, label: '90 jours' },
  ]);

  // ==========================================================================
  // ATTENTION_TYPES
  //
  // Maps attention_type keys (from get_management_attention) to French labels.
  // ==========================================================================
  const ATTENTION_TYPES = Object.freeze({
    sla_breached      : 'SLA dépassé',
    escalation_open   : 'Escalade ouverte',
    urgent_unassigned : 'Urgent non assigné',
    stale_open        : 'Demande en retard',
  });

  // ==========================================================================
  // ATTENTION_PRIORITY_LABELS
  //
  // Maps priority integer (1=highest) to French display labels.
  // ==========================================================================
  const ATTENTION_PRIORITY_LABELS = Object.freeze({
    1: 'Priorité critique',
    2: 'Priorité haute',
    3: 'Priorité moyenne',
  });

  // ==========================================================================
  // getExecutiveSummary(enterpriseId, days)
  //
  // Calls the get_enterprise_executive_summary RPC.
  //
  // enterpriseId : string (uuid) — required
  // days         : number        — 1-90, default 30 (server-side clamped)
  //
  // Returns a jsonb object:
  // {
  //   period_days, period_start, period_end,
  //   total_requests, open_requests, completed_requests, urgent_requests,
  //   sla_breached, sla_approaching,
  //   escalations_open, escalations_acknowledged, escalations_resolved,
  //   critical_escalations,
  //   prev_total_requests, prev_completed_requests, prev_escalations_open,
  //   prev_period_start, prev_period_end,
  // }
  //
  // Throws on validation or RPC error.
  // ==========================================================================
  async function getExecutiveSummary (enterpriseId, days) {
    if (!enterpriseId) throw new Error('[getExecutiveSummary] enterpriseId is required');
    const p_days = (days != null) ? days : 30;

    const { data, error } = await _client()
      .rpc('get_enterprise_executive_summary', {
        p_enterprise_id : enterpriseId,
        p_days          : p_days,
      });

    if (error) throw new Error('[getExecutiveSummary] ' + error.message);
    return data;
  }

  // ==========================================================================
  // getSitePerformance(enterpriseId, days)
  //
  // Calls the get_site_performance_report RPC.
  //
  // enterpriseId : string (uuid) — required
  // days         : number        — 1-90, default 30 (server-side clamped)
  //
  // Returns an array of rows:
  // {
  //   site_id, site_name, site_code,
  //   total_requests, open_requests, completed_requests, urgent_requests,
  //   sla_breached, sla_approaching,
  //   escalations_open, escalations_total,
  //   attention_score,   -- numeric; see formula in BLOCK 5 SQL
  //   completion_rate,   -- numeric | null (null when total_requests = 0)
  // }
  //
  // Ordered by attention_score DESC, total_requests DESC.
  // Throws on validation or RPC error.
  // ==========================================================================
  async function getSitePerformance (enterpriseId, days) {
    if (!enterpriseId) throw new Error('[getSitePerformance] enterpriseId is required');
    const p_days = (days != null) ? days : 30;

    const { data, error } = await _client()
      .rpc('get_site_performance_report', {
        p_enterprise_id : enterpriseId,
        p_days          : p_days,
      });

    if (error) throw new Error('[getSitePerformance] ' + error.message);
    return data || [];
  }

  // ==========================================================================
  // getTrend(enterpriseId, days, bucket)
  //
  // Calls the get_enterprise_trend RPC.
  //
  // enterpriseId : string (uuid) — required
  // days         : number        — 1-90, default 30 (server-side clamped)
  // bucket       : string        — 'day' | 'week', default 'day'
  //
  // Returns an array of rows:
  // {
  //   bucket_start : timestamptz,
  //   new_requests : bigint,
  //   completed    : bigint,
  //   escalations  : bigint,
  //   sla_breached : bigint,  -- always 0; SLA state is point-in-time only
  // }
  //
  // Throws on validation or RPC error.
  // ==========================================================================
  async function getTrend (enterpriseId, days, bucket) {
    if (!enterpriseId) throw new Error('[getTrend] enterpriseId is required');
    const p_days   = (days   != null) ? days   : 30;
    const p_bucket = (bucket != null) ? bucket : 'day';

    if (!['day', 'week'].includes(p_bucket)) {
      throw new Error('[getTrend] bucket must be "day" or "week"');
    }

    const { data, error } = await _client()
      .rpc('get_enterprise_trend', {
        p_enterprise_id : enterpriseId,
        p_days          : p_days,
        p_bucket        : p_bucket,
      });

    if (error) throw new Error('[getTrend] ' + error.message);
    return data || [];
  }

  // ==========================================================================
  // getManagementAttention(enterpriseId, limit)
  //
  // Calls the get_management_attention RPC.
  //
  // enterpriseId : string (uuid) — required
  // limit        : number        — 1-100, default 20 (server-side clamped)
  //
  // Returns an array of attention items ordered by priority ASC, created_at ASC:
  // {
  //   attention_type     : string,  -- see ATTENTION_TYPES
  //   priority           : number,  -- 1=highest; see ATTENTION_PRIORITY_LABELS
  //   service_request_id : uuid,
  //   site_id            : uuid,
  //   site_name          : string | null,
  //   urgency            : string,
  //   request_status     : string,
  //   signal_detail      : object,  -- sla_state | severity+reason_code+age_hours | age_hours
  //   created_at         : timestamptz,
  // }
  //
  // Throws on validation or RPC error.
  // ==========================================================================
  async function getManagementAttention (enterpriseId, limit) {
    if (!enterpriseId) throw new Error('[getManagementAttention] enterpriseId is required');
    const p_limit = (limit != null) ? limit : 20;

    const { data, error } = await _client()
      .rpc('get_management_attention', {
        p_enterprise_id : enterpriseId,
        p_limit         : p_limit,
      });

    if (error) throw new Error('[getManagementAttention] ' + error.message);
    return data || [];
  }

  // ==========================================================================
  // formatDelta(current, prev)
  //
  // Computes a delta between two numeric values for trend display.
  //
  // Returns:
  // {
  //   value     : number | null,   -- absolute difference (current - prev)
  //   direction : 'up' | 'down' | 'flat' | null,
  //   label     : string | null,   -- e.g. "+5", "-3", "0", or null
  // }
  //
  // Returns { value: null, direction: null, label: null } when:
  //   - either argument is null or undefined
  //   - prev is 0 (avoids division by zero; use value for absolute diff)
  // ==========================================================================
  function formatDelta (current, prev) {
    if (current == null || prev == null) {
      return { value: null, direction: null, label: null };
    }

    const c = Number(current);
    const p = Number(prev);

    if (!isFinite(c) || !isFinite(p)) {
      return { value: null, direction: null, label: null };
    }

    // Null out on zero denominator to avoid misleading percent display
    if (p === 0) {
      return { value: null, direction: null, label: null };
    }

    const diff = c - p;

    let direction;
    if (diff > 0)      direction = 'up';
    else if (diff < 0) direction = 'down';
    else               direction = 'flat';

    const label = diff > 0 ? '+' + diff : String(diff);

    return { value: diff, direction, label };
  }

  // ==========================================================================
  // computeCompletionRate(completed, total)
  //
  // Returns null if total is 0 (avoids 0/0).
  // Otherwise returns (completed / total * 100).toFixed(1) as a string.
  //
  // completed : number — required
  // total     : number — required
  // ==========================================================================
  function computeCompletionRate (completed, total) {
    const t = Number(total);
    const c = Number(completed);

    if (!isFinite(t) || !isFinite(c)) return null;
    if (t === 0) return null;

    return (c / t * 100).toFixed(1);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  return Object.freeze({
    PERIOD_OPTIONS,
    ATTENTION_TYPES,
    ATTENTION_PRIORITY_LABELS,
    getExecutiveSummary,
    getSitePerformance,
    getTrend,
    getManagementAttention,
    formatDelta,
    computeCompletionRate,
  });

}));
