/*!
 * js/fixeo-estimator-config.js — FIXEO Estimator V2 Feature Gate
 * Phase 7C.9K — Controlled Production Activation
 *
 * estimatorV2Enabled activated under human approval — Phase 7C.9K.
 * This file is safe to serve to all browsers.
 */
(function() {
  'use strict';
  if (window._fxEstCfgLoaded) return;
  window._fxEstCfgLoaded = true;
  window.FixeoEstimatorConfig = Object.freeze({
    estimatorV2Enabled: true,   // Phase 7C.9K — human-approved controlled activation
    estimatorApiBase: '/api/estimator-v1',
    estimatorSessionTTLMs: 30 * 60 * 1000,
    debugEstimator: false,
  });
}());
