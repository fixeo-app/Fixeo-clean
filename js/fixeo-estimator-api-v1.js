/*!
 * js/fixeo-estimator-api-v1.js — FIXEO Estimator Browser API Client
 * Phase 7C.9M.4 — Verified Client Confirmation Bridge
 *
 * Browser-side client for /api/estimator-v1.
 * Reads base URL from FixeoEstimatorConfig (loaded before this file).
 */
(function() {
  'use strict';
  if (window._fxEstApiLoaded) return;
  window._fxEstApiLoaded = true;

  var BASE = (window.FixeoEstimatorConfig && window.FixeoEstimatorConfig.estimatorApiBase) || '/api/estimator-v1';
  var diagnosticTokens = new Set();

  function _call(body) {
    var diagnostic = !!(body.entry_context && body.entry_context.diagnostic_token)
      || diagnosticTokens.has(body.session_token || body.pricing_context_token);
    var headers = diagnostic && window.FixeoDiagnostic && window.FixeoDiagnostic.authHeaders
      ? window.FixeoDiagnostic.authHeaders(true) : Promise.resolve({'Content-Type':'application/json'});
    return headers.then(function(h) { return fetch(BASE, {
      method: 'POST',
      headers: h,
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }); }).then(function(r) { return r.json(); }).then(function(result) {
      if (diagnostic && result && result.ok) {
        [result.session && result.session.session_token, result.pricing_context_token].forEach(function(token) {
          if (typeof token === 'string') diagnosticTokens.add(token);
        });
        while (diagnosticTokens.size > 128) diagnosticTokens.delete(diagnosticTokens.values().next().value);
      }
      return result;
    });
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

    // 7C.9M.4: verified server-side request confirmation.
    // The browser supplies only the opaque pricing token + client phone.
    // Price, service, city, description and tracking credentials remain server-authoritative.
    confirmRequest: function(pricingToken, clientPhone) {
      return _call({
        action: 'confirm_request',
        pricing_context_token: pricingToken,
        client_phone: clientPhone
      });
    },
  };
}());
