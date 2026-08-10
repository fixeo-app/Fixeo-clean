/*!
 * js/fixeo-estimator-api-v1.js — FIXEO Estimator Browser API Client
 * Phase 7C.9B — Production Dormant Integration
 *
 * Browser-side client for /api/estimator-v1.
 * Reads base URL from FixeoEstimatorConfig (loaded before this file).
 */
(function() {
  'use strict';
  if (window._fxEstApiLoaded) return;
  window._fxEstApiLoaded = true;

  var BASE = (window.FixeoEstimatorConfig && window.FixeoEstimatorConfig.estimatorApiBase) || '/api/estimator-v1';

  function _call(body) {
    return fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.json(); });
  }

  window.FixeoEstimatorAPI = {
    start: function(entryContext) {
      return _call({ action: 'start', entry_context: entryContext });
    },
    answer: function(sessionToken, questionId, answer) {
      return _call({ action: 'answer', session_token: sessionToken, question_id: questionId, answer: answer });
    },
    // 7C.9K.5: advance from SERVICE_SELECTION to QUALIFICATION/READY_FOR_ENGINE
    selectService: function(sessionToken, serviceCode) {
      return _call({ action: 'select_service', session_token: sessionToken, service_code: serviceCode });
    },
    evaluate: function(sessionToken) {
      return _call({ action: 'evaluate', session_token: sessionToken });
    },
    verifyPricingContext: function(pricingToken) {
      return _call({ action: 'verify_pricing_context', pricing_context_token: pricingToken });
    },
  };
}());
