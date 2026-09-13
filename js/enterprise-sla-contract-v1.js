/**
 * enterprise-sla-contract-v1.js
 * ============================================================================
 * window.EnterpriseSLAContract
 *
 * Client-side SLA contract module — mirrors bp12 SQL logic for UI display only.
 *
 * ⚠️  SLA AUTHORITY IS ALWAYS THE SERVER.
 *     This module is for RENDERING ONLY.
 *     Never use these helpers to gate access or make business decisions.
 *     All deadlines and states shown here are derived from server-returned data.
 * ============================================================================
 */

;(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else {
    // Browser global
    root.EnterpriseSLAContract = factory();
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
    throw new Error('[EnterpriseSLAContract] supabase client not found on window/globalThis');
  }

  // ==========================================================================
  // SLA_URGENCY_DEFAULTS
  // Display fallbacks only — these values are never authoritative.
  // Real targets come from the server via enterprise_sla_policies.
  // ==========================================================================
  const SLA_URGENCY_DEFAULTS = Object.freeze({
    normale: 240,   // minutes
    urgent:   60,
    now:      15,
  });

  // ==========================================================================
  // deriveSLAState(row)
  //
  // Given a row from enterprise_sla_status (or a shaped object), returns the
  // canonical display state string.
  //
  // Expected row shape:
  //   {
  //     sla_response_deadline : ISO string | null,
  //     sla_state             : string    | null,   // server authoritative
  //     urgency               : string    | null,
  //     status                : string    | null,   // request status
  //   }
  //
  // If sla_state is already provided by the server, it is returned as-is.
  // This function only fills in missing states for legacy/partial data.
  // ==========================================================================
  function deriveSLAState (row) {
    if (!row) return 'not_applicable';

    // Server-computed state takes priority
    if (row.sla_state) return row.sla_state;

    const status = row.status || row.request_status || '';
    const TERMINAL = ['validated', 'cancelled', 'no_match'];
    if (TERMINAL.includes(status)) return 'completed';

    if (!row.sla_response_deadline) return 'not_applicable';

    const deadline = new Date(row.sla_response_deadline);
    if (isNaN(deadline.getTime())) return 'not_applicable';

    const now = Date.now();
    const deadlineMs = deadline.getTime();

    // Determine total window in ms to compute the 20% threshold
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : null;
    const totalMs   = createdAt ? (deadlineMs - createdAt) : null;

    if (now > deadlineMs) return 'breached';

    if (totalMs && totalMs > 0) {
      const remaining  = deadlineMs - now;
      const threshold  = totalMs * 0.20; // within last 20% of window
      if (remaining <= threshold) return 'approaching';
    }

    return 'on_track';
  }

  // ==========================================================================
  // formatSLARemaining(deadlineISO)
  //
  // Returns { label: string, overdue: boolean, minutesLeft: number }
  //   label      — human-readable string, e.g. "2h 15m" or "Overdue by 5m"
  //   overdue    — true when deadline has passed
  //   minutesLeft — signed minutes (negative = overdue)
  // ==========================================================================
  function formatSLARemaining (deadlineISO) {
    if (!deadlineISO) {
      return { label: 'N/A', overdue: false, minutesLeft: null };
    }

    const deadline = new Date(deadlineISO);
    if (isNaN(deadline.getTime())) {
      return { label: 'Invalid date', overdue: false, minutesLeft: null };
    }

    const diffMs      = deadline.getTime() - Date.now();
    const minutesLeft = diffMs / 60000;          // signed float
    const overdue     = minutesLeft < 0;
    const absMinutes  = Math.abs(minutesLeft);
    const h           = Math.floor(absMinutes / 60);
    const m           = Math.round(absMinutes % 60);

    let label;
    if (h > 0) {
      label = overdue
        ? `Overdue by ${h}h ${m}m`
        : `${h}h ${m}m`;
    } else {
      label = overdue
        ? `Overdue by ${m}m`
        : `${m}m`;
    }

    return { label, overdue, minutesLeft };
  }

  // ==========================================================================
  // formatSLADeadline(deadlineISO)
  //
  // Returns a human-readable deadline string.
  // Uses the browser locale for formatting.
  // ==========================================================================
  function formatSLADeadline (deadlineISO) {
    if (!deadlineISO) return 'No deadline';

    const d = new Date(deadlineISO);
    if (isNaN(d.getTime())) return 'Invalid deadline';

    try {
      return d.toLocaleString(undefined, {
        month:  'short',
        day:    'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return d.toISOString().replace('T', ' ').substring(0, 16);
    }
  }

  // ==========================================================================
  // getSLABadgeClass(state)
  //
  // Maps an SLA state string to a CSS class for badge rendering.
  //   'on_track'      → 'sla-ok'
  //   'approaching'   → 'sla-approaching'
  //   'breached'      → 'sla-breached'
  //   'completed'     → 'sla-ok'   (resolved successfully)
  //   'not_applicable'→ 'sla-na'
  //   (unknown)       → 'sla-na'
  // ==========================================================================
  function getSLABadgeClass (state) {
    switch (state) {
      case 'on_track':       return 'sla-ok';
      case 'approaching':    return 'sla-approaching';
      case 'breached':       return 'sla-breached';
      case 'completed':      return 'sla-ok';
      case 'not_applicable': return 'sla-na';
      default:               return 'sla-na';
    }
  }

  // ==========================================================================
  // fetchSLASummary(enterpriseId)
  //
  // Calls the get_enterprise_sla_summary RPC.
  // Returns the JSON object: { on_track, approaching, breached, completed,
  //                            not_applicable, total, enterprise_id }
  // Throws on RPC error.
  // ==========================================================================
  async function fetchSLASummary (enterpriseId) {
    if (!enterpriseId) throw new Error('[fetchSLASummary] enterpriseId is required');

    const { data, error } = await _client()
      .rpc('get_enterprise_sla_summary', { p_enterprise_id: enterpriseId });

    if (error) throw new Error(`[fetchSLASummary] ${error.message}`);
    return data;
  }

  // ==========================================================================
  // fetchSLAPolicies(enterpriseId)
  //
  // SELECT from enterprise_sla_policies filtered to the given enterprise.
  // Returns an array of policy rows (empty array if none).
  // Throws on query error.
  // ==========================================================================
  async function fetchSLAPolicies (enterpriseId) {
    if (!enterpriseId) throw new Error('[fetchSLAPolicies] enterpriseId is required');

    const { data, error } = await _client()
      .from('enterprise_sla_policies')
      .select('*')
      .eq('enterprise_id', enterpriseId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[fetchSLAPolicies] ${error.message}`);
    return data || [];
  }

  // ==========================================================================
  // upsertSLAPolicy(params)
  //
  // Calls the upsert_sla_policy RPC.
  //
  // params: {
  //   enterpriseId               : string (uuid)   — required
  //   siteId                     : string | null    — optional
  //   urgency                    : string | null    — 'normale'|'urgent'|'now'|null
  //   responseTargetMinutes      : number           — default 240
  //   interventionTargetMinutes  : number | null    — optional
  //   resolutionTargetMinutes    : number | null    — optional
  //   active                     : boolean          — default true
  // }
  //
  // Returns the new policy UUID string.
  // Throws on validation or RPC error.
  // ==========================================================================
  async function upsertSLAPolicy (params) {
    const {
      enterpriseId,
      siteId                    = null,
      urgency                   = null,
      responseTargetMinutes     = 240,
      interventionTargetMinutes = null,
      resolutionTargetMinutes   = null,
      active                    = true,
    } = params || {};

    if (!enterpriseId) throw new Error('[upsertSLAPolicy] enterpriseId is required');
    if (!responseTargetMinutes || responseTargetMinutes <= 0) {
      throw new Error('[upsertSLAPolicy] responseTargetMinutes must be > 0');
    }
    if (urgency !== null && !['normale', 'urgent', 'now'].includes(urgency)) {
      throw new Error('[upsertSLAPolicy] urgency must be normale|urgent|now or null');
    }

    const { data, error } = await _client()
      .rpc('upsert_sla_policy', {
        p_enterprise_id:               enterpriseId,
        p_site_id:                     siteId,
        p_urgency:                     urgency,
        p_response_target_minutes:     responseTargetMinutes,
        p_intervention_target_minutes: interventionTargetMinutes,
        p_resolution_target_minutes:   resolutionTargetMinutes,
        p_active:                      active,
      });

    if (error) throw new Error(`[upsertSLAPolicy] ${error.message}`);
    return data; // uuid of new policy
  }

  // ==========================================================================
  // deactivateSLAPolicy(policyId)
  //
  // Calls the deactivate_sla_policy RPC.
  // Returns void; throws on error (including insufficient_privilege).
  // ==========================================================================
  async function deactivateSLAPolicy (policyId) {
    if (!policyId) throw new Error('[deactivateSLAPolicy] policyId is required');

    const { error } = await _client()
      .rpc('deactivate_sla_policy', { p_policy_id: policyId });

    if (error) throw new Error(`[deactivateSLAPolicy] ${error.message}`);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  return Object.freeze({
    SLA_URGENCY_DEFAULTS,
    deriveSLAState,
    formatSLARemaining,
    formatSLADeadline,
    getSLABadgeClass,
    fetchSLASummary,
    fetchSLAPolicies,
    upsertSLAPolicy,
    deactivateSLAPolicy,
  });

}));
