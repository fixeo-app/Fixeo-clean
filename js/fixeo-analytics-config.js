/* ============================================================
   FIXEO ANALYTICS CONFIGURATION
   js/fixeo-analytics-config.js   Version: fac-v1a

   PURPOSE
   ───────
   Single source of truth for all analytics feature flags.
   All flags default to FALSE — no tracking, no cookies,
   no network requests, no console output in production.

   ACTIVATION PROTOCOL
   ───────────────────
   This file MUST NOT be modified to enable analytics.
   Analytics is activated exclusively by:
     1. Obtaining a GA4 Measurement ID (G-XXXXXXXX)
     2. Authorising Phase 6.2.5 — GA4 Activation
     3. Setting analyticsEnabled + ga4Enabled to true
        in a separate, authorised deployment commit

   NEVER MODIFY without explicit Phase 6.2.5 authorisation.
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

    /* Master kill-switch. When false, the bootstrap module    */
    /* will not register any event listeners, will not call    */
    /* gtag(), will not write any cookies, and will not make   */
    /* any network requests. Takes precedence over all other   */
    /* flags.                                                  */
    analyticsEnabled: false,

    /* GA4-specific flag. When false, no gtag() calls are      */
    /* made even if analyticsEnabled is somehow true.          */
    /* Requires a real G-XXXXXXXX measurementId to be set.     */
    ga4Enabled: false,

    /* Debug flag. When true, the bootstrap module logs event  */
    /* lifecycle to console (never logged in production).      */
    /* Has zero effect when analyticsEnabled is false.         */
    debugAnalytics: false,

    /* GA4 Measurement ID placeholder.                         */
    /* MUST remain null until a real G-XXXXXXXX ID is          */
    /* provided in an authorised Phase 6.2.5 commit.           */
    /* Setting this alone does NOT enable tracking —            */
    /* ga4Enabled must also be true.                           */
    measurementId: null,

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
    version: 'fac-v1a'

  });

})();
