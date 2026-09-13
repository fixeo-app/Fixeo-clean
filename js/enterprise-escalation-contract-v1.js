/**
 * enterprise-escalation-contract-v1.js
 * ============================================================================
 * window.EnterpriseEscalationContract
 *
 * Client-side escalation contract module — UI helpers and RPC wrappers for
 * the BP13 enterprise escalation system.
 *
 * ⚠️  ESCALATION AUTHORITY IS ALWAYS THE SERVER.
 *     This module is for RENDERING and RPC CALLS ONLY.
 *     Never use these helpers to gate access or make business decisions.
 *     All states and transitions are enforced server-side.
 * ============================================================================
 */

;(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else {
    // Browser global
    root.EnterpriseEscalationContract = factory();
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
    throw new Error('[EnterpriseEscalationContract] supabase client not found on window/globalThis');
  }

  // ==========================================================================
  // ESCALATION_SEVERITY
  //
  // Maps severity keys to French display labels.
  // ==========================================================================
  const ESCALATION_SEVERITY = Object.freeze({
    critical : 'Critique',
    high     : 'Élevé',
    medium   : 'Moyen',
    low      : 'Faible',
  });

  // ==========================================================================
  // ESCALATION_REASON_CODES
  //
  // Maps reason_code keys to French display labels.
  // ==========================================================================
  const ESCALATION_REASON_CODES = Object.freeze({
    sla_breached       : 'SLA dépassé',
    sla_approaching    : 'SLA proche',
    urgent_unassigned  : 'Urgent non assigné',
    mission_stalled    : 'Mission bloquée',
    manual             : 'Escalade manuelle',
  });

  // ==========================================================================
  // ESCALATION_STATUS
  //
  // Maps status keys to French display labels.
  // ==========================================================================
  const ESCALATION_STATUS = Object.freeze({
    open         : 'Ouvert',
    acknowledged : 'Pris en charge',
    resolved     : 'Résolu',
  });

  // ==========================================================================
  // getSeverityBadgeClass(severity)
  //
  // Returns a CSS class string for the given severity level.
  // ==========================================================================
  function getSeverityBadgeClass (severity) {
    switch (severity) {
      case 'critical': return 'badge-severity-critical';
      case 'high':     return 'badge-severity-high';
      case 'medium':   return 'badge-severity-medium';
      case 'low':      return 'badge-severity-low';
      default:         return 'badge-severity-unknown';
    }
  }

  // ==========================================================================
  // getStatusBadgeClass(status)
  //
  // Returns a CSS class string for the given escalation status.
  // ==========================================================================
  function getStatusBadgeClass (status) {
    switch (status) {
      case 'open':         return 'badge-escalation-open';
      case 'acknowledged': return 'badge-escalation-acknowledged';
      case 'resolved':     return 'badge-escalation-resolved';
      default:             return 'badge-escalation-unknown';
    }
  }

  // ==========================================================================
  // openEscalation(params)
  //
  // Calls the open_escalation RPC.
  //
  // params: {
  //   enterpriseId      : string (uuid)  — required
  //   serviceRequestId  : string (uuid)  — required
  //   severity          : string         — 'critical'|'high'|'medium'|'low'
  //   reasonCode        : string         — see ESCALATION_REASON_CODES keys
  //   resolutionNote    : string | null  — optional (ignored server-side on open)
  // }
  //
  // Returns the new escalation UUID string.
  // Throws on validation or RPC error.
  // ==========================================================================
  async function openEscalation (params) {
    const {
      enterpriseId,
      serviceRequestId,
      severity,
      reasonCode,
      resolutionNote = null,
    } = params || {};

    if (!enterpriseId)     throw new Error('[openEscalation] enterpriseId is required');
    if (!serviceRequestId) throw new Error('[openEscalation] serviceRequestId is required');
    if (!severity)         throw new Error('[openEscalation] severity is required');
    if (!reasonCode)       throw new Error('[openEscalation] reasonCode is required');

    if (!Object.prototype.hasOwnProperty.call(ESCALATION_SEVERITY, severity)) {
      throw new Error('[openEscalation] invalid severity: ' + severity);
    }
    if (!Object.prototype.hasOwnProperty.call(ESCALATION_REASON_CODES, reasonCode)) {
      throw new Error('[openEscalation] invalid reasonCode: ' + reasonCode);
    }

    const { data, error } = await _client()
      .rpc('open_escalation', {
        p_enterprise_id      : enterpriseId,
        p_service_request_id : serviceRequestId,
        p_severity           : severity,
        p_reason_code        : reasonCode,
        p_resolution_note    : resolutionNote,
      });

    if (error) throw new Error('[openEscalation] ' + error.message);
    return data; // uuid of new escalation
  }

  // ==========================================================================
  // acknowledgeEscalation(escalationId)
  //
  // Calls the acknowledge_escalation RPC.
  // Returns void; throws on error (including insufficient_privilege or
  // escalation_not_open).
  // ==========================================================================
  async function acknowledgeEscalation (escalationId) {
    if (!escalationId) throw new Error('[acknowledgeEscalation] escalationId is required');

    const { error } = await _client()
      .rpc('acknowledge_escalation', {
        p_escalation_id: escalationId,
      });

    if (error) throw new Error('[acknowledgeEscalation] ' + error.message);
  }

  // ==========================================================================
  // resolveEscalation(escalationId, resolutionNote)
  //
  // Calls the resolve_escalation RPC.
  // resolutionNote is required and must be non-empty.
  // Returns void; throws on error.
  // ==========================================================================
  async function resolveEscalation (escalationId, resolutionNote) {
    if (!escalationId)   throw new Error('[resolveEscalation] escalationId is required');
    if (!resolutionNote || resolutionNote.trim().length === 0) {
      throw new Error('[resolveEscalation] resolutionNote is required and must be non-empty');
    }

    const { error } = await _client()
      .rpc('resolve_escalation', {
        p_escalation_id   : escalationId,
        p_resolution_note : resolutionNote,
      });

    if (error) throw new Error('[resolveEscalation] ' + error.message);
  }

  // ==========================================================================
  // listEscalations(params)
  //
  // Calls the list_enterprise_escalations RPC.
  //
  // params: {
  //   enterpriseId : string (uuid)         — required
  //   status       : string | null         — 'open'|'acknowledged'|'resolved'|null
  //   severity     : string | null         — severity filter or null
  //   siteId       : string (uuid) | null  — site filter or null
  //   limit        : number                — default 50, max 200
  //   offset       : number                — default 0
  // }
  //
  // Returns an array of enterprise_escalation_summary rows.
  // Throws on validation or RPC error.
  // ==========================================================================
  async function listEscalations (params) {
    const {
      enterpriseId,
      status   = null,
      severity = null,
      siteId   = null,
      limit    = 50,
      offset   = 0,
    } = params || {};

    if (!enterpriseId) throw new Error('[listEscalations] enterpriseId is required');

    if (status !== null && !Object.prototype.hasOwnProperty.call(ESCALATION_STATUS, status)) {
      throw new Error('[listEscalations] invalid status: ' + status);
    }
    if (severity !== null && !Object.prototype.hasOwnProperty.call(ESCALATION_SEVERITY, severity)) {
      throw new Error('[listEscalations] invalid severity: ' + severity);
    }

    const { data, error } = await _client()
      .rpc('list_enterprise_escalations', {
        p_enterprise_id : enterpriseId,
        p_status        : status,
        p_severity      : severity,
        p_site_id       : siteId,
        p_limit         : limit,
        p_offset        : offset,
      });

    if (error) throw new Error('[listEscalations] ' + error.message);
    return data || [];
  }

  // ==========================================================================
  // getEscalationSummaryKpis(enterpriseId)
  //
  // Queries the enterprise_escalation_summary view directly to compute KPI
  // aggregates: counts by status and counts by severity for non-resolved.
  //
  // Returns:
  // {
  //   total          : number,
  //   byStatus       : { open: number, acknowledged: number, resolved: number },
  //   openBySeverity : { critical: number, high: number, medium: number, low: number },
  // }
  //
  // Throws on query error.
  // ==========================================================================
  async function getEscalationSummaryKpis (enterpriseId) {
    if (!enterpriseId) throw new Error('[getEscalationSummaryKpis] enterpriseId is required');

    const { data, error } = await _client()
      .from('enterprise_escalation_summary')
      .select('status, severity')
      .eq('enterprise_id', enterpriseId);

    if (error) throw new Error('[getEscalationSummaryKpis] ' + error.message);

    const rows = data || [];

    const byStatus = { open: 0, acknowledged: 0, resolved: 0 };
    const openBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const row of rows) {
      if (Object.prototype.hasOwnProperty.call(byStatus, row.status)) {
        byStatus[row.status]++;
      }
      if (row.status !== 'resolved' &&
          Object.prototype.hasOwnProperty.call(openBySeverity, row.severity)) {
        openBySeverity[row.severity]++;
      }
    }

    return {
      total          : rows.length,
      byStatus,
      openBySeverity,
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  return Object.freeze({
    ESCALATION_SEVERITY,
    ESCALATION_REASON_CODES,
    ESCALATION_STATUS,
    getSeverityBadgeClass,
    getStatusBadgeClass,
    openEscalation,
    acknowledgeEscalation,
    resolveEscalation,
    listEscalations,
    getEscalationSummaryKpis,
  });

}));
