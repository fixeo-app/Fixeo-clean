/*!
 * js/fixeo-estimator-reservation-bridge-v1.js — FIXEO Estimator Reservation Bridge
 * Phase 7C.9B — Production Dormant Integration
 *
 * Stores ONLY the opaque pricing context token in sessionStorage.
 * NEVER stores raw price amounts.
 * Active only when FixeoEstimatorConfig.estimatorV2Enabled === true.
 */
(function() {
  'use strict';
  if (window._fxEstBridgeLoaded) return;
  window._fxEstBridgeLoaded = true;

  var CTX_KEY = 'fixeo_estimator_ctx_v1';

  window.FixeoEstimatorReservationBridge = {
    /**
     * Store an opaque pricing context token before opening the reservation modal.
     * ONLY stores the opaque token — never raw amounts.
     */
    prepareContext: function(pricingContextToken) {
      if (!pricingContextToken) return;
      try {
        sessionStorage.setItem(CTX_KEY, pricingContextToken);
      } catch (_) {}
    },

    /**
     * Retrieve the stored opaque token.
     */
    getContext: function() {
      try {
        return sessionStorage.getItem(CTX_KEY);
      } catch (_) {
        return null;
      }
    },

    /**
     * Clear the stored token (e.g., after reservation completes).
     */
    clearContext: function() {
      try {
        sessionStorage.removeItem(CTX_KEY);
      } catch (_) {}
    },

    /**
     * Verify the stored token via the server and return a verified context.
     * Returns Promise<{valid, outcome_type, amount_mad, labour_amount_mad, parts_separate, is_diagnostic, _token} | null>
     */
    verifyContext: function() {
      var token = this.getContext();
      if (!token) return Promise.resolve(null);
      if (!window.FixeoEstimatorAPI) return Promise.resolve(null);
      return window.FixeoEstimatorAPI.verifyPricingContext(token)
        .then(function(r) {
          if (!r || !r.valid) return null;
          return {
            valid:             true,
            outcome_type:      r.outcome_type,
            amount_mad:        r.amount_mad,
            labour_amount_mad: r.labour_amount_mad,
            parts_separate:    r.parts_separate,
            is_diagnostic:     r.is_diagnostic,
            _token:            token,
          };
        })
        .catch(function() { return null; });
    },
  };
}());
