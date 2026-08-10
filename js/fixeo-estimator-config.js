/*!
 * js/fixeo-estimator-config.js — FIXEO Estimator V2 Feature Gate
 * Phase 7C.9B — Production Dormant Integration
 *
 * estimatorV2Enabled MUST remain false until Phase 7C.9D.
 * This file is safe to serve to all browsers.
 */
(function() {
  'use strict';
  if (window._fxEstCfgLoaded) return;
  window._fxEstCfgLoaded = true;
  window.FixeoEstimatorConfig = Object.freeze({
    estimatorV2Enabled: false,  // MUST be false — dormant until 7C.9D
    estimatorApiBase: '/api/estimator-v1',
    estimatorSessionTTLMs: 30 * 60 * 1000,
    debugEstimator: false,
  });
}());
