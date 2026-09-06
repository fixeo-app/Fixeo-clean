/* ============================================================
   FIXEO ANALYTICS CONFIGURATION
   js/fixeo-analytics-config.js   Version: fac-v1c

   PURPOSE
   ───────
   Single source of truth for FIXEO analytics feature flags.

   PRODUCTION STATE
   ────────────────
   Analytics are enabled on the canonical production hostname
   and remain subject to the consent and surface-exclusion
   controls enforced by the analytics bootstrap.

   ACTIVE ANALYTICS PROVIDERS
   ──────────────────────────
   1. Google Analytics 4
      Measurement ID: G-ERS9JX72H7
      Consent-gated through FIXEO Consent Mode v2.

   2. Vercel Web Analytics
      Enabled through the FIXEO analytics bootstrap.
      Consent-gated and restricted to approved production
      surfaces.

   ACTIVATION HISTORY
   ──────────────────
   Phase 6.2.5B — GA4 Activation — authorised 2026-07-12.
   fac-v1c      — Vercel Web Analytics integration enabled.

   IMPORTANT
   ─────────
   Do not bypass the master kill-switch, hostname guard,
   excluded-path policy, or consent controls.
   ============================================================ */

(function () {
  'use strict';

  /* ── Guard: run once only ───────────────────────────────── */
  if (window._fxAnalyticsConfigLoaded) return;
  window._fxAnalyticsConfigLoaded = true;

  window.FixeoAnalyticsConfig = Object.freeze({

    /* ── Master analytics kill-switch ─────────────────────── */
    /*
     * false = all analytics bootstrap activity is disabled.
     * true  = individual provider flags below may activate.
     */
    analyticsEnabled: true,

    /* ── Google Analytics 4 ───────────────────────────────── */
    /* Phase 6.2.5B — production activation authorised.       */
    ga4Enabled: true,

    /* ── Vercel Web Analytics ─────────────────────────────── */
    /*
     * Activated in fac-v1c.
     * Actual loading remains controlled by the analytics
     * bootstrap, consent state, hostname guard and exclusions.
     */
    vercelAnalyticsEnabled: true,

    /* ── Debug ────────────────────────────────────────────── */
    /* Must remain false in production.                        */
    debugAnalytics: false,

    /* ── GA4 Measurement ID ───────────────────────────────── */
    measurementId: 'G-ERS9JX72H7',

    /* ── Event taxonomy ───────────────────────────────────── */
    /*
     * Canonical FIXEO analytics event names.
     * Do not rename existing events after production release:
     * doing so would fragment historical reporting.
     */
    events: Object.freeze({

      /* Tier 1 — Primary conversions / key events */
      CONTACT_FORM_SUBMIT:     'contact_form_submit',
      URGENT_REQUEST_SUBMIT:   'urgent_request_submit',
      MISSION_CREATED:         'mission_created',
      CLIENT_SIGNUP_COMPLETE:  'client_signup_complete',
      ARTISAN_SIGNUP_COMPLETE: 'artisan_signup_complete',
      WHATSAPP_CLICK:          'whatsapp_click',

      /* Tier 2 — Micro-conversions */
      ARTISAN_CARD_CLICK:      'artisan_card_click',
      ARTISAN_PROFILE_VIEW:    'artisan_profile_view',
      LP_VIEW:                 'lp_view',

      /* Tier 3 — Mission lifecycle */
      MISSION_ASSIGNED:        'mission_assigned',
      MISSION_COMPLETED:       'mission_completed',

      /* Tier 4 — Reviews engine */
      REVIEW_REQUESTED:        'review_requested',
      REVIEW_SUBMITTED:        'review_submitted'
    }),

    /* ── Surface exclusions ───────────────────────────────── */
    /*
     * Authenticated/internal surfaces are excluded from the
     * main public analytics pipeline.
     *
     * Prefix matching is performed by the bootstrap, therefore
     * /admin also excludes /admin/... and equivalent children.
     */
    excludedPaths: Object.freeze([
      '/admin',
      '/dashboard-artisan',
      '/dashboard-client',
      '/artisan-profile.html'   /* Legacy SPA shell — noindex */
    ]),

    /* ── Production hostname guard ────────────────────────── */
    /*
     * Analytics only fires on the canonical public hostname.
     * Vercel preview deployments and localhost stay excluded.
     */
    productionHostname: 'www.fixeo.ma',

    /* ── Consent Mode v2 defaults ─────────────────────────── */
    /*
     * Analytics storage starts denied.
     * It is upgraded to granted only after explicit consent.
     *
     * Advertising-related storage remains denied.
     */
    consentDefaults: Object.freeze({
      analytics_storage:  'denied',
      ad_storage:         'denied',
      ad_user_data:       'denied',
      ad_personalization: 'denied',
      wait_for_update:    500
    }),

    /* ── Consent persistence ──────────────────────────────── */
    consentStorageKey: 'fixeo_consent_analytics',

    /* ── Configuration version ────────────────────────────── */
    version: 'fac-v1c'

  });

})();
