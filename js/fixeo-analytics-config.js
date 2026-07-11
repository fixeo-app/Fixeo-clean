/* ============================================================
   FIXEO ANALYTICS CONFIGURATION
   js/fixeo-analytics-config.js   Version: fac-v1b

   PURPOSE
   ───────
   Single source of truth for all analytics feature flags.
   All flags default to FALSE — no tracking, no cookies,
   no network requests, no console output in production.

   ACTIVATION PROTOCOL
   ───────────────────
   Phase 6.2.5B — GA4 Activation — authorised 2026-07-12.
   Measurement ID: G-ERS9JX72H7
   All flags activated in fac-v1b per explicit authorisation.
   ============================================================ */

(function () {
  'use strict';

  /* Guard: run once only */
  if (window._fxAnalyticsConfigLoaded) return;
  window._fxAnalyticsConfigLoaded = true;

  /* ── Feature flags ──────────────────────────────────────── */
  /* ALL FLAGS DEFAULT TO FALSE.                               */
  /* Do not change these values until Phase 6.2.5 authorised. */

  window.FixeoAnalyticsConfig = Object.freeze({

    /* Master kill-switch. Phase 6.2.5B — activated.           */
    analyticsEnabled: true,

    /* GA4-specific flag. Phase 6.2.5B — activated.            */
    ga4Enabled: true,

    /* Debug flag. false in production.                        */
    debugAnalytics: false,

    /* GA4 Measurement ID — Phase 6.2.5B authorised.           */
    measurementId: 'G-ERS9JX72H7',

    /* ── Event taxonomy (canonical names — read-only) ──────── */
    /* Locked names from Phase 6.2 blueprint.                  */
    /* Changing these post-deployment breaks historical data.  */
    events: Object.freeze({
      /* Tier 1 — Primary conversions (key events in GA4) */
      CONTACT_FORM_SUBMIT:    'contact_form_submit',
      URGENT_REQUEST_SUBMIT:  'urgent_request_submit',
      MISSION_CREATED:        'mission_created',
      CLIENT_SIGNUP_COMPLETE: 'client_signup_complete',
      ARTISAN_SIGNUP_COMPLETE: 'artisan_signup_complete',
      WHATSAPP_CLICK:         'whatsapp_click',

      /* Tier 2 — Micro-conversions */
      ARTISAN_CARD_CLICK:     'artisan_card_click',
      ARTISAN_PROFILE_VIEW:   'artisan_profile_view',
      LP_VIEW:                'lp_view',

      /* Tier 3 — Mission lifecycle (post-conversion) */
      MISSION_ASSIGNED:       'mission_assigned',
      MISSION_COMPLETED:      'mission_completed',

      /* Tier 4 — Future (Phase 6.1 reviews engine) */
      REVIEW_REQUESTED:       'review_requested',
      REVIEW_SUBMITTED:       'review_submitted'
    }),

    /* ── Surface exclusions ────────────────────────────────── */
    /* These authenticated surfaces are excluded from the main */
    /* GA4 property. They are tracked separately or not at all */
    excludedPaths: Object.freeze([
      '/admin',
      '/dashboard-artisan',
      '/dashboard-client',
      '/artisan-profile.html'   /* SPA shell — noindex */
    ]),

    /* ── Hostname guard ────────────────────────────────────── */
    /* Analytics only fires on the canonical production domain. */
    /* Preview deployments (*.vercel.app) are always excluded.  */
    productionHostname: 'www.fixeo.ma',

    /* ── Consent mode defaults ─────────────────────────────── */
    /* Consent Mode v2 configuration.                           */
    /* analytics_storage starts DENIED on every page load.      */
    /* Updated to 'granted' only after explicit user consent.   */
    consentDefaults: Object.freeze({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500
    }),

    /* ── localStorage key for consent persistence ───────────── */
    consentStorageKey: 'fixeo_consent_analytics',

    /* ── Version ─────────────────────────────────────────────  */
    version: 'fac-v1b'

  });

})();
