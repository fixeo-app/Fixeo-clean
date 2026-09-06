/* ============================================================
   FIXEO ANALYTICS BOOTSTRAP
   js/fixeo-analytics-bootstrap.js   Version: fab-v1d
   Guard: window._fxAnalyticsBootstrapLoaded

   PURPOSE
   ───────
   Analytics bootstrap for FIXEO public production surfaces.

   Responsibilities:
     1. Bridges the existing fixeo:* CustomEvent system to GA4.
     2. Loads GA4 only after explicit analytics consent.
     3. Loads Vercel Web Analytics only after explicit consent.
     4. Keeps FIXEO business/conversion events GA4-only.
     5. Prevents analytics on previews, localhost and excluded
        authenticated/internal surfaces.

   PRODUCTION MODEL
   ────────────────
   Master switch:
     FixeoAnalyticsConfig.analyticsEnabled

   GA4 switch:
     FixeoAnalyticsConfig.ga4Enabled
     + valid measurementId

   Vercel Web Analytics switch:
     FixeoAnalyticsConfig.vercelAnalyticsEnabled

   PRIVACY MODEL
   ─────────────
   analytics consent DENIED:
     • GA4 script is not loaded
     • Vercel Analytics script is not loaded
     • no FIXEO analytics listeners transmit data

   analytics consent GRANTED:
     • GA4 loads
     • Vercel Web Analytics loads if its feature flag is enabled
     • FIXEO business events continue to be sent only to GA4

   Vercel Analytics:
     • receives automatic traffic/page-view analytics only
     • receives no FIXEO CustomEvent payload
     • beforeSend re-checks persisted consent before transmission
     • automatically stops sending if consent is later revoked

   DEPENDENCY
   ──────────
   Requires fixeo-analytics-config.js to be loaded first.
   If the config is absent, this module exits silently.

   CHANGELOG
   ─────────
   fab-v1d  2026-09-06  Vercel Web Analytics integration:
              VA-01 consent-gated dynamic loader
              VA-02 dedicated config kill-switch
              VA-03 beforeSend consent defence-in-depth
              VA-04 production hostname + surface guards inherited
              VA-05 business events remain GA4-only
              VA-06 returning-consent auto-load
              VA-07 revocation-safe event suppression

   fab-v1c  2026-07-12  Phase 6.2.5B — GA4 Activation:
              dynamic gtag.js loader,
              consent-gated loading,
              returning visitor auto-load,
              page_view + Enhanced Measurement,
              grantConsent() wired

   fab-v1b  2026-07-11  Instrumentation repair (Phase 6.2.4):
              R-01  contact_form_submit: req.service field correction
              R-02  urgent_request_submit: type guard + Option B schema
              R-03  mission_created: req.service_category correction
              R-04  mission_assigned: 'accepted' trigger + artisan_service
              R-05  mission_completed: m.service field correction
              R-06  signup: fixeo:signup:complete listener replaces heuristic
              R-07  artisan_card_click: slug extraction from href
              R-08  phone_click: tel: link interaction event (PII-safe)
              R-09  whatsapp_click: sanitised destination only (no href)
              R-11  dedup: removed Date.now() fallback from cfs_ key
              R-12  fixeo:auth:updated: Phase 6.2.5 stub
   ============================================================ */

(function () {
  'use strict';

  /* ── Guard ──────────────────────────────────────────────── */
  if (window._fxAnalyticsBootstrapLoaded) return;
  window._fxAnalyticsBootstrapLoaded = true;

  var VERSION = 'fab-v1d';
  var LOG     = '[fab]';

  /* ── Config dependency check ────────────────────────────── */
  var cfg = window.FixeoAnalyticsConfig;
  if (!cfg) {
    return;
  }

  /* ── Master kill-switch ─────────────────────────────────── */
  /*
   * Controls ALL optional analytics managed by this bootstrap.
   * If false:
   *   - no listeners
   *   - no GA4
   *   - no Vercel Analytics
   */
  if (!cfg.analyticsEnabled) {
    return;
  }

  /* ── Debug logger ───────────────────────────────────────── */
  function _log() {
    if (!cfg.debugAnalytics) return;

    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG + ' [v' + VERSION + ']');

    /* eslint-disable no-console */
    console.log.apply(console, args);
    /* eslint-enable no-console */
  }

  /* ── Hostname guard ─────────────────────────────────────── */
  /*
   * Never fire analytics on:
   *   - Vercel previews
   *   - localhost
   *   - alternate domains
   *
   * Only the canonical production hostname is accepted.
   */
  if (window.location.hostname !== cfg.productionHostname) {
    _log(
      'Hostname mismatch — analytics suppressed on ' +
      window.location.hostname
    );
    return;
  }

  /* ── Surface exclusion guard ────────────────────────────── */
  var _path = window.location.pathname;
  var _excluded = cfg.excludedPaths || [];

  for (var i = 0; i < _excluded.length; i++) {
    if (
      _path === _excluded[i] ||
      _path.indexOf(_excluded[i]) === 0
    ) {
      _log('Excluded surface — analytics suppressed on ' + _path);
      return;
    }
  }

  /* ══════════════════════════════════════════════════════════
     ANALYTICS PROVIDER GUARDS
     ══════════════════════════════════════════════════════════ */

  /* ── GA4 guard ──────────────────────────────────────────── */
  var _ga4Active =
    cfg.ga4Enabled === true &&
    !!cfg.measurementId;

  /* ── Vercel Web Analytics guard ─────────────────────────── */
  /*
   * Explicit opt-in feature flag.
   *
   * IMPORTANT:
   * Until vercelAnalyticsEnabled: true exists in
   * fixeo-analytics-config.js, this remains false.
   */
  var _vercelAnalyticsActive =
    cfg.vercelAnalyticsEnabled === true;

  /* ══════════════════════════════════════════════════════════
     CONSENT HELPERS
     ══════════════════════════════════════════════════════════ */

  /*
   * Reads the canonical FIXEO analytics consent record.
   *
   * Supported formats:
   *
   * v0:
   *   "granted"
   *   "denied"
   *
   * v1:
   *   {
   *     v: 1,
   *     analytics: "granted" | "denied",
   *     ...
   *   }
   *
   * Fail closed:
   *   malformed / unavailable localStorage => false.
   */
  function _analyticsConsentGranted() {
    try {
      var raw = localStorage.getItem(cfg.consentStorageKey);

      if (!raw) return false;

      /* Legacy v0 */
      if (raw === 'granted') return true;
      if (raw === 'denied') return false;

      /* Current JSON record */
      var rec = JSON.parse(raw);

      return !!(
        rec &&
        rec.analytics === 'granted'
      );

    } catch (_) {
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     GA4
     ══════════════════════════════════════════════════════════ */

  /* ── Dynamic GA4 loader ──────────────────────────────────── */
  /*
   * Injects gtag.js ONLY after analytics consent.
   */
  function _loadGa4() {
    if (!_ga4Active) return;
    if (!_analyticsConsentGranted()) return;
    if (window._fxGa4Loaded) return;

    window._fxGa4Loaded = true;

    var mid = cfg.measurementId;
    var s = document.createElement('script');

    s.async = true;
    s.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(mid);

    s.onload = function () {

      /*
       * dataLayer already contains the Consent Mode default
       * and consent update queued by fixeo-consent-v1.js.
       */
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };

      window.gtag('js', new Date());

      window.gtag('config', mid, {
        ads_data_redaction: true,
        url_passthrough: false
      });

      _log('GA4 loaded and configured —', mid);
    };

    s.onerror = function () {
      window._fxGa4Loaded = false;
      _log('GA4 script load error');
    };

    var head = document.getElementsByTagName('head')[0];

    if (!head) {
      window._fxGa4Loaded = false;
      return;
    }

    head.insertBefore(s, head.firstChild);

    _log('Injecting gtag.js for', mid);
  }

  /* ── Safe gtag wrapper ──────────────────────────────────── */
  function _gtag() {
    if (!_ga4Active) return;
    if (!_analyticsConsentGranted()) return;
    if (typeof window.gtag !== 'function') return;

    window.gtag.apply(window, arguments);
  }

  /* ══════════════════════════════════════════════════════════
     VERCEL WEB ANALYTICS
     ══════════════════════════════════════════════════════════ */

  /*
   * Called by the Vercel Analytics runtime before an event is
   * transmitted.
   *
   * Returning null cancels the transmission.
   *
   * This gives FIXEO a second consent gate even after the
   * Vercel script has already been loaded.
   *
   * Example:
   *   User accepts → Vercel loads.
   *   User later revokes → localStorage becomes denied.
   *   beforeSend sees denied → further events are discarded.
   */
  function _vercelBeforeSend(event) {
    if (!_analyticsConsentGranted()) {
      return null;
    }

    return event;
  }

  /* ── Dynamic Vercel Analytics loader ────────────────────── */
  function _loadVercelAnalytics() {
    if (!_vercelAnalyticsActive) return;
    if (!_analyticsConsentGranted()) return;

    /*
     * Official queue-compatible Vercel Analytics API stub.
     *
     * Commands queued here are processed when
     * /_vercel/insights/script.js finishes loading.
     */
    window.va = window.va || function () {
      (window.vaq = window.vaq || []).push(arguments);
    };

    /*
     * Queue beforeSend BEFORE script loading.
     *
     * Vercel processes the queue before its initial automatic
     * page-view event, ensuring the consent gate is active from
     * the first possible transmission.
     */
    window.va('beforeSend', _vercelBeforeSend);

    /*
     * Do not inject the script twice.
     */
    if (window._fxVercelAnalyticsLoaded) {
      return;
    }

    /*
     * Defensive duplicate-script detection in case Vercel
     * Analytics is later integrated elsewhere.
     */
    var existingScript =
      document.querySelector(
        'script[src="/_vercel/insights/script.js"],' +
        'script[src^="/_vercel/insights/script.js?"],' +
        'script[src*="/_vercel/insights/script.js"]'
      );

    if (existingScript) {
      window._fxVercelAnalyticsLoaded = true;

      _log(
        'Vercel Analytics script already present — duplicate load suppressed'
      );

      return;
    }

    var head = document.getElementsByTagName('head')[0];

    if (!head) {
      return;
    }

    var s = document.createElement('script');

    s.defer = true;
    s.src = '/_vercel/insights/script.js';

    s.onload = function () {
      _log('Vercel Web Analytics loaded');
    };

    s.onerror = function () {
      window._fxVercelAnalyticsLoaded = false;
      _log('Vercel Analytics script load error');
    };

    window._fxVercelAnalyticsLoaded = true;

    head.appendChild(s);

    _log('Vercel Web Analytics loader triggered');
  }

  /* ══════════════════════════════════════════════════════════
     COMMON HELPERS
     ══════════════════════════════════════════════════════════ */

  /* ── Deduplication helper ───────────────────────────────── */
  var _firedKeys = {};

  function _dedup(key) {
    if (_firedKeys[key]) return false;

    _firedKeys[key] = true;
    return true;
  }

  /* ── Event parameter sanitiser ──────────────────────────── */
  function _str(v) {
    return v != null
      ? String(v).trim()
      : '';
  }

  /* ══════════════════════════════════════════════════════════
     GA4 BUSINESS EVENT LISTENERS

     IMPORTANT:
     These FIXEO business events remain GA4-only.

     They are NOT forwarded to Vercel Web Analytics.
     ══════════════════════════════════════════════════════════ */

  /* ── C1: contact_form_submit ────────────────────────────── */
  window.addEventListener(
    'fixeo:client-request-submit-success',
    function (e) {

      var d = (e && e.detail) || {};
      var req = d.request || {};

      var dedupKey =
        'cfs_' +
        (
          _str(req.id) ||
          _str(req.tracking_ref)
        );

      if (!dedupKey || dedupKey === 'cfs_') {
        return;
      }

      if (!_dedup(dedupKey)) {
        _log(
          'Dedup suppressed',
          cfg.events.CONTACT_FORM_SUBMIT,
          dedupKey
        );

        return;
      }

      var artisanService = _str(
        req.service ||
        req.service_type ||
        req.service_category
      );

      _log(
        'Event',
        cfg.events.CONTACT_FORM_SUBMIT,
        d
      );

      _gtag(
        'event',
        cfg.events.CONTACT_FORM_SUBMIT,
        {
          transaction_id:
            _str(req.id || req.tracking_ref),

          artisan_service:
            artisanService,

          artisan_city:
            _str(req.city),

          request_mode:
            _str(d.mode),

          was_duplicate:
            !!d.duplicated,

          page_path:
            _path
        }
      );
    }
  );

  /* ── C1b: urgent_request_submit ─────────────────────────── */
  window.addEventListener(
    'fixeo:urgent-event',
    function (e) {

      var d = (e && e.detail) || {};

      if (d.type !== 'urgent_submit') {
        return;
      }

      var payload = d.payload || {};

      var dedupKey =
        'urs_' +
        _str(d.id);

      if (!_dedup(dedupKey)) {
        _log(
          'Dedup suppressed',
          cfg.events.URGENT_REQUEST_SUBMIT,
          dedupKey
        );

        return;
      }

      _log(
        'Event',
        cfg.events.URGENT_REQUEST_SUBMIT,
        d
      );

      _gtag(
        'event',
        cfg.events.URGENT_REQUEST_SUBMIT,
        {
          artisan_city:
            _str(payload.city),

          source:
            _str(payload.source),

          page_path:
            _path
        }
      );
    }
  );

  /* ── C2: mission_created ────────────────────────────────── */
  window.addEventListener(
    'fixeo:data:changed',
    function (e) {

      var d = (e && e.detail) || {};

      if (d.type !== 'service_request_created') {
        return;
      }

      var req = d.request || {};

      var dedupKey =
        'mcr_' +
        _str(req.id);

      if (!_dedup(dedupKey)) {
        return;
      }

      var artisanService = _str(
        req.service_category ||
        req.service_type ||
        req.service
      );

      _log(
        'Event',
        cfg.events.MISSION_CREATED,
        d
      );

      _gtag(
        'event',
        cfg.events.MISSION_CREATED,
        {
          transaction_id:
            _str(req.id),

          artisan_service:
            artisanService,

          artisan_city:
            _str(req.city),

          page_path:
            _path
        }
      );
    }
  );

  /* ── C3: mission_assigned / mission_completed ───────────── */
  window.addEventListener(
    'fixeo:missions:updated',
    function (e) {

      var d = (e && e.detail) || {};

      var missions =
        d.missions ||
        (
          Array.isArray(d)
            ? d
            : null
        );

      if (!missions) {
        return;
      }

      for (var j = 0; j < missions.length; j++) {

        var m = missions[j];

        if (!m || !m.id) {
          continue;
        }

        /* mission_assigned */
        if (m.status === 'accepted') {

          var ak =
            'ma_' +
            _str(m.id);

          if (_dedup(ak)) {

            _log(
              'Event',
              cfg.events.MISSION_ASSIGNED,
              m
            );

            _gtag(
              'event',
              cfg.events.MISSION_ASSIGNED,
              {
                transaction_id:
                  _str(m.id),

                artisan_id:
                  _str(m.artisan_id),

                artisan_service:
                  _str(m.service),

                page_path:
                  _path
              }
            );
          }
        }

        /* mission_completed */
        if (
          m.status === 'completed' ||
          m.status === 'validated'
        ) {

          var ck =
            'mco_' +
            _str(m.id);

          if (_dedup(ck)) {

            _log(
              'Event',
              cfg.events.MISSION_COMPLETED,
              m
            );

            _gtag(
              'event',
              cfg.events.MISSION_COMPLETED,
              {
                transaction_id:
                  _str(m.id),

                artisan_id:
                  _str(m.artisan_id),

                artisan_service:
                  _str(
                    m.service ||
                    m.service_type
                  ),

                page_path:
                  _path
              }
            );
          }
        }
      }
    }
  );

  /* ── C4: whatsapp_click ─────────────────────────────────── */
  document.addEventListener(
    'click',
    function (e) {

      var target = e && e.target;

      if (!target) {
        return;
      }

      var anchor =
        target.closest
          ? target.closest('a[href*="wa.me"]')
          : null;

      if (!anchor) {
        return;
      }

      _log(
        'Event',
        cfg.events.WHATSAPP_CLICK,
        {
          destination_type: 'whatsapp'
        }
      );

      _gtag(
        'event',
        cfg.events.WHATSAPP_CLICK,
        {
          destination_type: 'whatsapp',
          page_path: _path
        }
      );
    }
  );

  /* ── C5: phone_click ─────────────────────────────────────── */
  document.addEventListener(
    'click',
    function (e) {

      var target = e && e.target;

      if (!target) {
        return;
      }

      var anchor =
        target.closest
          ? target.closest('a[href^="tel:"]')
          : null;

      if (!anchor) {
        return;
      }

      var eventName =
        cfg.events.PHONE_CLICK ||
        'phone_click';

      _log(
        'Event',
        eventName,
        {
          destination_type: 'phone'
        }
      );

      _gtag(
        'event',
        eventName,
        {
          destination_type: 'phone',
          page_path: _path
        }
      );
    }
  );

  /* ── C6: artisan_card_click ─────────────────────────────── */
  document.addEventListener(
    'click',
    function (e) {

      var target = e && e.target;

      if (!target) {
        return;
      }

      var card =
        target.closest
          ? target.closest('.lp-card-link')
          : null;

      if (!card) {
        return;
      }

      var artisanId =
        _str(
          card.dataset.artisanId ||
          card.dataset.id
        );

      if (!artisanId && card.href) {

        var parts =
          card.href.split('/artisan/');

        if (parts.length > 1) {

          artisanId =
            _str(
              parts[1]
                .split('?')[0]
                .split('#')[0]
            );
        }
      }

      _log(
        'Event',
        cfg.events.ARTISAN_CARD_CLICK,
        {
          artisanId: artisanId
        }
      );

      _gtag(
        'event',
        cfg.events.ARTISAN_CARD_CLICK,
        {
          artisan_id: artisanId,
          page_path: _path
        }
      );
    }
  );

  /* ── C7: signup completion ──────────────────────────────── */
  window.addEventListener(
    'fixeo:signup:complete',
    function (e) {

      var d = (e && e.detail) || {};
      var userId = _str(d.user_id);

      if (!userId) {
        return;
      }

      var dedupKey =
        'su_' +
        userId;

      if (!_dedup(dedupKey)) {
        return;
      }

      var role =
        _str(d.role) ||
        'client';

      var eventName =
        role === 'artisan'
          ? cfg.events.ARTISAN_SIGNUP_COMPLETE
          : cfg.events.CLIENT_SIGNUP_COMPLETE;

      _log(
        'Event',
        eventName,
        {
          role: role
        }
      );

      _gtag(
        'event',
        eventName,
        {
          user_role:
            role,

          artisan_city:
            _str(d.city),

          page_path:
            _path
        }
      );
    }
  );

  /* ── Auth update hook ───────────────────────────────────── */
  /*
   * Reserved for future user-property instrumentation.
   *
   * PII remains forbidden here.
   */
  window.addEventListener(
    'fixeo:auth:updated',
    function (e) { /* eslint-disable-line no-unused-vars */

      /*
       * Intentionally empty.
       */
    }
  );

  /* ══════════════════════════════════════════════════════════
     PUBLIC CONSENT BRIDGE
     ══════════════════════════════════════════════════════════ */

  window.FixeoAnalyticsBootstrap = {

    version: VERSION,

    /*
     * Called AFTER fixeo-consent-v1.js persisted:
     *
     *   analytics = granted
     *
     * and queued the Consent Mode update.
     */
    grantConsent: function () {

      if (_ga4Active) {
        _loadGa4();
      }

      if (_vercelAnalyticsActive) {
        _loadVercelAnalytics();
      }

      _log(
        'Consent granted — analytics loaders triggered'
      );
    },

    /*
     * Called after consent is denied or revoked.
     *
     * GA4 receives its Consent Mode denial from
     * fixeo-consent-v1.js.
     *
     * Vercel Web Analytics remains physically loaded during
     * the current document if it had already loaded, but
     * _vercelBeforeSend() now rejects every transmission
     * because persisted consent is denied.
     */
    denyConsent: function () {

      _log(
        'Consent denied — analytics transmission suppressed'
      );
    },

    /*
     * Raw persisted state.
     *
     * Kept backward-compatible with the existing public API.
     */
    getConsentState: function () {

      try {
        return localStorage.getItem(
          cfg.consentStorageKey
        );

      } catch (err) {
        return null;
      }
    }
  };

  /* ══════════════════════════════════════════════════════════
     RETURNING VISITOR
     ══════════════════════════════════════════════════════════ */

  /*
   * fixeo-consent-v1.js executes before this bootstrap.
   *
   * For returning users it may already have restored the
   * consent state before FixeoAnalyticsBootstrap exists.
   *
   * Re-check persisted consent here and load providers when
   * appropriate.
   */
  try {

    var _storedConsent =
      localStorage.getItem(
        cfg.consentStorageKey
      );

    var _consentRecord = null;

    try {
      _consentRecord =
        JSON.parse(_storedConsent);
    } catch (_) {
      /* legacy raw value */
    }

    var _analyticsValue =
      (
        _consentRecord &&
        _consentRecord.analytics
      )
        ? _consentRecord.analytics
        : _storedConsent;

    if (_analyticsValue === 'granted') {

      _log(
        'Returning visitor — stored consent granted — auto-loading analytics'
      );

      if (_ga4Active) {
        _loadGa4();
      }

      if (_vercelAnalyticsActive) {
        _loadVercelAnalytics();
      }

    } else {

      _log(
        'Returning visitor — stored consent denied or absent — analytics suppressed'
      );
    }

  } catch (_e) {

    _log(
      'localStorage read error at init — analytics suppressed'
    );
  }

  /* ── Final debug state ──────────────────────────────────── */
  _log(
    'Bootstrap initialised — v' +
    VERSION +
    ' | GA4 active:',
    _ga4Active,
    '| Vercel Analytics active:',
    _vercelAnalyticsActive
  );

})();
