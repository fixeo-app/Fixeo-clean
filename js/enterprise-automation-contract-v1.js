/* ============================================================
   enterprise-automation-contract-v1.js
   BP15 — Automation Contract (UMD)
   Provides vocabulary, labels, RPC helpers for the automation
   rules engine.  Same pattern as BP12/BP13/BP14 contracts.
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EnterpriseAutomationContract = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ----------------------------------------------------------
     Vocabulary constants
  ---------------------------------------------------------- */
  var SIGNAL_TYPES = Object.freeze(['sla_breached', 'urgent_unattended', 'escalation_unacknowledged']);

  var ACTION_TYPES = Object.freeze(['open_escalation']);

  var SEVERITY_OPTIONS = Object.freeze(['critical', 'high', 'medium', 'low']);

  var URGENCY_FILTER_OPTIONS = Object.freeze(['normale', 'urgent', 'now']);

  /* ----------------------------------------------------------
     French labels
  ---------------------------------------------------------- */
  var SIGNAL_LABELS = {
    sla_breached:               'SLA dépassé',
    urgent_unattended:          'Demande urgente sans prise en charge',
    escalation_unacknowledged:  'Escalade non acquittée'
  };

  var ACTION_LABELS = {
    open_escalation: 'Ouvrir une escalade'
  };

  var SEVERITY_LABELS = {
    critical: 'Critique',
    high:     'Haute',
    medium:   'Moyenne',
    low:      'Basse'
  };

  var OUTCOME_LABELS = {
    executed: 'Exécuté',
    skipped:  'Ignoré',
    error:    'Erreur'
  };

  var URGENCY_LABELS = {
    normale: 'Normale',
    urgent:  'Urgente',
    now:     'Immédiate'
  };

  /* ----------------------------------------------------------
     Label helpers
  ---------------------------------------------------------- */
  function getSignalLabel(signal_type) {
    return SIGNAL_LABELS[signal_type] || signal_type || '—';
  }

  function getActionLabel(action_type) {
    return ACTION_LABELS[action_type] || action_type || '—';
  }

  function getSeverityLabel(severity) {
    return SEVERITY_LABELS[severity] || severity || '—';
  }

  function getOutcomeLabel(outcome) {
    return OUTCOME_LABELS[outcome] || outcome || '—';
  }

  /* ----------------------------------------------------------
     describeRule(rule) → "Quand X → faire Y" French string
  ---------------------------------------------------------- */
  function describeRule(rule) {
    if (!rule) return '—';

    var parts = [];

    // Signal
    var signal = getSignalLabel(rule.signal_type);
    var when = 'Quand : ' + signal;

    // Optional urgency filter
    if (rule.urgency_filter) {
      when += ' (' + (URGENCY_LABELS[rule.urgency_filter] || rule.urgency_filter) + ')';
    }

    // Optional threshold
    if (rule.threshold_minutes && rule.threshold_minutes > 0) {
      when += ' depuis ' + rule.threshold_minutes + ' min';
    }

    parts.push(when);

    // Action + severity
    var action = getActionLabel(rule.action_type);
    if (rule.severity) {
      action += ' [' + getSeverityLabel(rule.severity) + ']';
    }
    parts.push('Faire : ' + action);

    return parts.join(' → ');
  }

  /* ----------------------------------------------------------
     Validation helpers
  ---------------------------------------------------------- */
  function validateRuleName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, reason: 'Le nom de la règle est obligatoire.' };
    }
    var trimmed = name.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: 'Le nom de la règle ne peut pas être vide.' };
    }
    if (trimmed.length > 200) {
      return { valid: false, reason: 'Le nom de la règle ne doit pas dépasser 200 caractères.' };
    }
    return { valid: true, reason: null };
  }

  function validateThreshold(val) {
    // null / undefined / empty string → valid (means "no threshold")
    if (val === null || val === undefined || val === '') {
      return { valid: true, reason: null };
    }
    var n = parseInt(val, 10);
    if (isNaN(n)) {
      return { valid: false, reason: 'Le seuil doit être un nombre entier positif ou vide.' };
    }
    if (n < 1) {
      return { valid: false, reason: 'Le seuil doit être supérieur à 0 minute.' };
    }
    return { valid: true, reason: null };
  }

  /* ----------------------------------------------------------
     RPC helpers
     All helpers return Promises.
     They call window.supabase.rpc(...) with a try/catch wrapper.
  ---------------------------------------------------------- */

  /** Resolve the Supabase client from window context */
  function _client() {
    if (typeof window !== 'undefined' && window.supabase) {
      return window.supabase;
    }
    throw new Error('Supabase client unavailable');
  }

  /**
   * createRule(enterpriseId, params)
   *   params: { name, signal_type, action_type, severity,
   *             urgency_filter?, threshold_minutes?, reason_code? }
   * → calls create_automation_rule RPC
   */
  function createRule(enterpriseId, params) {
    return new Promise(function (resolve, reject) {
      try {
        var client = _client();
        var payload = {
          p_enterprise_id:    enterpriseId,
          p_name:             params.name,
          p_signal_type:      params.signal_type,
          p_action_type:      params.action_type,
          p_severity:         params.severity || 'high',
          p_urgency_filter:   params.urgency_filter || null,
          p_threshold_minutes: params.threshold_minutes
            ? parseInt(params.threshold_minutes, 10) : null,
          p_reason_code:      params.reason_code || 'sla_breached'
        };
        client.rpc('create_automation_rule', payload).then(function (res) {
          if (res.error) { reject(res.error); } else { resolve(res.data); }
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * setRuleActive(ruleId, active)
   * → calls set_automation_rule_active RPC
   */
  function setRuleActive(ruleId, active) {
    return new Promise(function (resolve, reject) {
      try {
        var client = _client();
        client.rpc('set_automation_rule_active', {
          p_rule_id: ruleId,
          p_active:  !!active
        }).then(function (res) {
          if (res.error) { reject(res.error); } else { resolve(res.data); }
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * listRules(enterpriseId, activeOnly)
   * → calls list_automation_rules RPC
   */
  function listRules(enterpriseId, activeOnly) {
    return new Promise(function (resolve, reject) {
      try {
        var client = _client();
        client.rpc('list_automation_rules', {
          p_enterprise_id: enterpriseId,
          p_active_only:   !!activeOnly
        }).then(function (res) {
          if (res.error) { reject(res.error); } else { resolve(res.data || []); }
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * listExecutions(enterpriseId, limit)
   * → calls list_automation_executions RPC
   */
  function listExecutions(enterpriseId, limit) {
    return new Promise(function (resolve, reject) {
      try {
        var client = _client();
        client.rpc('list_automation_executions', {
          p_enterprise_id: enterpriseId,
          p_limit:         limit || 50
        }).then(function (res) {
          if (res.error) { reject(res.error); } else { resolve(res.data || []); }
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * evaluateAutomations(enterpriseId)
   * → calls evaluate_enterprise_automations RPC
   */
  function evaluateAutomations(enterpriseId) {
    return new Promise(function (resolve, reject) {
      try {
        var client = _client();
        client.rpc('evaluate_enterprise_automations', {
          p_enterprise_id: enterpriseId
        }).then(function (res) {
          if (res.error) { reject(res.error); } else { resolve(res.data); }
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ----------------------------------------------------------
     Public API
  ---------------------------------------------------------- */
  return {
    SIGNAL_TYPES:          SIGNAL_TYPES,
    ACTION_TYPES:          ACTION_TYPES,
    SEVERITY_OPTIONS:      SEVERITY_OPTIONS,
    URGENCY_FILTER_OPTIONS: URGENCY_FILTER_OPTIONS,

    getSignalLabel:        getSignalLabel,
    getActionLabel:        getActionLabel,
    getSeverityLabel:      getSeverityLabel,
    getOutcomeLabel:       getOutcomeLabel,

    describeRule:          describeRule,
    validateRuleName:      validateRuleName,
    validateThreshold:     validateThreshold,

    createRule:            createRule,
    setRuleActive:         setRuleActive,
    listRules:             listRules,
    listExecutions:        listExecutions,
    evaluateAutomations:   evaluateAutomations
  };
}));
/* End BP15 Contract */
