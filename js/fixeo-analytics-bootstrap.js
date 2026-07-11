/* ============================================================
   FIXEO ANALYTICS BOOTSTRAP
   js/fixeo-analytics-bootstrap.js   Version: fab-v1a
   Guard: window._fxAnalyticsBootstrapLoaded

   PURPOSE
   ───────
   Bridges the existing fixeo:* CustomEvent system to GA4.
   All event listeners are pre-wired to the canonical event
   names defined in fixeo-analytics-config.js.

   PRODUCTION STATE: COMPLETELY DORMANT
   ─────────────────────────────────────
   When FixeoAnalyticsConfig.analyticsEnabled === false (the
   default), this module:
     • Registers zero event listeners
     • Makes zero network requests
     • Writes zero cookies
     • Calls gtag() zero times
     • Outputs zero console messages
     • Has zero effect on Core Web Vitals
     • Has zero effect on UX or behaviour

   DEPENDENCY
   ──────────
   Requires fixeo-analytics-config.js to be loaded first.
   If the config is absent, this module exits silently.

   ACTIVATION
   ──────────
   Activated exclusively by Phase 6.2.2 authorised deployment:
     1. Real GA4 G-XXXXXXXX measurementId in config
     2. analyticsEnabled: true in config
     3. ga4Enabled: true in config
     4. Cookie consent banner live
     5. Consent Mode v2 initialised before this module loads

   DO NOT MODIFY to enable tracking ahead of Phase 6.2.2.
   ============================================================ */

(function () {
  'use strict';

  /* ── Guard ──────────────────────────────────────────────── */
  if (window._fxAnalyticsBootstrapLoaded) return;
  window._fxAnalyticsBootstrapLoaded = true;

  var VERSION = 'fab-v1a';
  var LOG     = '[fab]';

  /* ── Config dependency check ────────────────────────────── */
  var cfg = window.FixeoAnalyticsConfig;
  if (!cfg) {
    /* Config not loaded — exit silently. Zero side effects.   */
    return;
  }

  /* ── Master kill-switch ─────────────────────────────────── */
  /* When analyticsEnabled is false, register nothing, do      */
  /* nothing, return immediately. This is the production path. */
  if (!cfg.analyticsEnabled) {
    return;
  }

  /* ══════════════════════════════════════════════════════════
     Everything below this line is UNREACHABLE in production.
     It only executes when analyticsEnabled === true,
     which requires an explicit authorised deployment commit.
     ══════════════════════════════════════════════════════════ */

  /* ── Hostname guard ─────────────────────────────────────── */
  /* Never fire on Vercel preview deployments or localhost.    */
  if (window.location.hostname !== cfg.productionHostname) {
    _log('Hostname mismatch — analytics suppressed on ' + window.location.hostname);
    return;
  }

  /* ── Surface exclusion guard ────────────────────────────── */
  var _path = window.location.pathname;
  var _excluded = cfg.excludedPaths || [];
  for (var i = 0; i < _excluded.length; i++) {
    if (_path === _excluded[i] || _path.indexOf(_excluded[i]) === 0) {
      _log('Excluded surface — analytics suppressed on ' + _path);
      return;
    }
  }

  /* ── GA4 guard ──────────────────────────────────────────── */
  /* ga4Enabled must be true AND a real measurementId must     */
  /* be present for any gtag() calls to be made.              */
  var _ga4Active = cfg.ga4Enabled && !!cfg.measurementId;

  /* ── Debug logger ───────────────────────────────────────── */
  function _log() {
    if (!cfg.debugAnalytics) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG + ' [v' + VERSION + ']');
    /* eslint-disable no-console */
    console.log.apply(console, args);
    /* eslint-enable no-console */
  }

  /* ── Safe gtag wrapper ──────────────────────────────────── */
  /* Calls gtag() only when GA4 is active and gtag is loaded.  */
  /* Fails silently when gtag is not yet available.            */
  function _gtag() {
    if (!_ga4Active) return;
    if (typeof window.gtag !== 'function') return;
    window.gtag.apply(window, arguments);
  }

  /* ── Deduplication helper ───────────────────────────────── */
  /* GA4 deduplicates key events with matching transaction_id  */
  /* within 24h, but we also guard at the JS level to prevent  */
  /* duplicate fires on browser back+refresh cycles.           */
  var _firedKeys = {};
  function _dedup(key) {
    if (_firedKeys[key]) return false;
    _firedKeys[key] = true;
    return true;
  }

  /* ── Event parameter sanitiser ──────────────────────────── */
  /* Trims strings, coerces null/undefined to empty string.    */
  function _str(v) {
    return v != null ? String(v).trim() : '';
  }
  function _num(v) {
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  /* ══════════════════════════════════════════════════════════
     EVENT LISTENERS
     Each listener bridges one fixeo:* CustomEvent to one GA4
     event via _gtag(). Listeners are registered only when
     analyticsEnabled === true (unreachable in production).
     ══════════════════════════════════════════════════════════ */

  /* ── C1: contact_form_submit ────────────────────────────── */
  /* Source: js/request-form.js → fixeo:client-request-submit-success */
  /* Fires: after confirmed Supabase INSERT on service_requests */
  window.addEventListener('fixeo:client-request-submit-success', function (e) {
    var d = (e && e.detail) || {};
    var req = d.request || {};
    var dedupKey = 'cfs_' + (_str(req.id) || _str(req.tracking_ref) || Date.now());

    if (!_dedup(dedupKey)) {
      _log('Dedup suppressed', cfg.events.CONTACT_FORM_SUBMIT, dedupKey);
      return;
    }

    _log('Event', cfg.events.CONTACT_FORM_SUBMIT, d);
    _gtag('event', cfg.events.CONTACT_FORM_SUBMIT, {
      transaction_id:   _str(req.id || req.tracking_ref),
      artisan_service:  _str(req.service_type),
      artisan_city:     _str(req.city),
      request_mode:     _str(d.mode),
      was_duplicate:    !!d.duplicated,
      page_path:        _path
    });
  });

  /* ── C1b: urgent_request_submit ─────────────────────────── */
  /* Source: js/request-form.js → fixeo:urgent-event           */
  /* Fires: after urgent modal submission confirmed             */
  window.addEventListener('fixeo:urgent-event', function (e) {
    var d = (e && e.detail) || {};
    _log('Event', cfg.events.URGENT_REQUEST_SUBMIT, d);
    _gtag('event', cfg.events.URGENT_REQUEST_SUBMIT, {
      artisan_service:  _str(d.service_type || d.service),
      artisan_city:     _str(d.city),
      page_path:        _path
    });
  });

  /* ── C2: mission_created ────────────────────────────────── */
  /* Source: js/fixeo-supabase-core.js → fixeo:data:changed   */
  /* type: 'service_request_created'                           */
  window.addEventListener('fixeo:data:changed', function (e) {
    var d = (e && e.detail) || {};
    if (d.type !== 'service_request_created') return;

    var req = d.request || {};
    var dedupKey = 'mc_' + _str(req.id);
    if (!_dedup(dedupKey)) return;

    _log('Event', cfg.events.MISSION_CREATED, d);
    _gtag('event', cfg.events.MISSION_CREATED, {
      transaction_id:  _str(req.id),
      artisan_service: _str(req.service_type),
      artisan_city:    _str(req.city),
      page_path:       _path
    });
  });

  /* ── C3: mission_assigned / mission_completed ───────────── */
  /* Source: js/fixeo-mission-system.js → fixeo:missions:updated */
  window.addEventListener('fixeo:missions:updated', function (e) {
    var d = (e && e.detail) || {};
    var missions = d.missions || (Array.isArray(d) ? d : null);
    if (!missions) return;

    for (var j = 0; j < missions.length; j++) {
      var m = missions[j];
      if (!m || !m.id) continue;

      if (m.status === 'assigned' || m.status === 'pending') {
        var ak = 'ma_' + _str(m.id);
        if (_dedup(ak)) {
          _log('Event', cfg.events.MISSION_ASSIGNED, m);
          _gtag('event', cfg.events.MISSION_ASSIGNED, {
            transaction_id: _str(m.id),
            artisan_id:     _str(m.artisan_id),
            page_path:      _path
          });
        }
      }

      if (m.status === 'completed' || m.status === 'validated') {
        var ck = 'mco_' + _str(m.id);
        if (_dedup(ck)) {
          _log('Event', cfg.events.MISSION_COMPLETED, m);
          _gtag('event', cfg.events.MISSION_COMPLETED, {
            transaction_id:  _str(m.id),
            artisan_id:      _str(m.artisan_id),
            artisan_service: _str(m.service_type),
            page_path:       _path
          });
        }
      }
    }
  });

  /* ── C4: whatsapp_click ─────────────────────────────────── */
  /* Source: index.html wa.me link (line 3453)                  */
  /* Registered via document-level click delegation.            */
  document.addEventListener('click', function (e) {
    var target = e && e.target;
    if (!target) return;
    /* Walk up the DOM to catch clicks on child elements of <a> */
    var anchor = target.closest ? target.closest('a[href*="wa.me"]') : null;
    if (!anchor) return;

    _log('Event', cfg.events.WHATSAPP_CLICK, { href: anchor.href });
    _gtag('event', cfg.events.WHATSAPP_CLICK, {
      destination_url: _str(anchor.href),
      link_text:       _str(anchor.textContent).slice(0, 100),
      page_path:       _path
    });
  });

  /* ── C5: artisan_card_click ─────────────────────────────── */
  /* Source: LP pages — .lp-card-link anchors in SSR output    */
  /* Registered via document-level click delegation.            */
  document.addEventListener('click', function (e) {
    var target = e && e.target;
    if (!target) return;
    var card = target.closest ? target.closest('.lp-card-link') : null;
    if (!card) return;

    var artisanId = _str(card.dataset.artisanId || card.dataset.id);
    _log('Event', cfg.events.ARTISAN_CARD_CLICK, { artisanId: artisanId });
    _gtag('event', cfg.events.ARTISAN_CARD_CLICK, {
      artisan_id:  artisanId,
      page_path:   _path,
      destination: _str(card.href)
    });
  });

  /* ── Signup events ──────────────────────────────────────── */
  /* Source: auth.html — no dedicated CustomEvent is dispatched */
  /* on signup success. The bootstrap hooks into the fixeo:auth */
  /* updated event and infers first-time signup from the user   */
  /* object (created_at ≈ now).                                 */
  window.addEventListener('fixeo:auth:updated', function (e) {
    var d = (e && e.detail) || {};
    var user = d.user;
    var profile = d.profile;
    if (!user || !user.id) return;

    /* Infer signup: created_at within last 30 seconds          */
    var createdAt = user.created_at ? new Date(user.created_at) : null;
    var isNewSignup = createdAt && (Date.now() - createdAt.getTime()) < 30000;
    if (!isNewSignup) return;

    var role = (profile && _str(profile.role)) || 'client';
    var dedupKey = 'su_' + _str(user.id);
    if (!_dedup(dedupKey)) return;

    var eventName = role === 'artisan'
      ? cfg.events.ARTISAN_SIGNUP_COMPLETE
      : cfg.events.CLIENT_SIGNUP_COMPLETE;

    _log('Event', eventName, { role: role });
    _gtag('event', eventName, {
      user_role:    role,
      artisan_city: _str(profile && profile.city),
      page_path:    _path
    });
  });

  /* ── Consent update helper (Phase 6.2.2 integration point) ─ */
  /* Called by fixeo-consent-v1.js (to be built in Phase 6.2.2) */
  /* when the user accepts or refuses cookie consent.            */
  window.FixeoAnalyticsBootstrap = {
    version: VERSION,

    /* Called by consent banner on Accept */
    grantConsent: function () {
      if (!_ga4Active) return;
      _gtag('consent', 'update', { analytics_storage: 'granted' });
      try {
        localStorage.setItem(cfg.consentStorageKey, 'granted');
      } catch (err) { /* storage may be blocked */ }
      _log('Consent granted');
    },

    /* Called by consent banner on Refuse */
    denyConsent: function () {
      try {
        localStorage.setItem(cfg.consentStorageKey, 'denied');
      } catch (err) { /* storage may be blocked */ }
      _log('Consent denied — analytics_storage remains denied');
    },

    /* Returns the persisted consent state, or null if unknown  */
    getConsentState: function () {
      try {
        return localStorage.getItem(cfg.consentStorageKey);
      } catch (err) {
        return null;
      }
    }
  };

  _log('Bootstrap initialised — v' + VERSION + ' | GA4 active:', _ga4Active);

})();
