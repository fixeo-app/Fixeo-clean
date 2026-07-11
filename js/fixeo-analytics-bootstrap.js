/* ============================================================
   FIXEO ANALYTICS BOOTSTRAP
   js/fixeo-analytics-bootstrap.js   Version: fab-v1b
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
   Activated exclusively by Phase 6.2.5 — GA4 Activation:
     1. Real GA4 G-XXXXXXXX measurementId in config
     2. analyticsEnabled: true in config
     3. ga4Enabled: true in config
     4. Cookie consent banner live and verified
     5. Consent Mode v2 initialised before this module loads

   DO NOT MODIFY to enable tracking ahead of Phase 6.2.5.

   CHANGELOG
   ─────────
   fab-v1a  2026-07-11  Initial dormant bootstrap deployment (Phase 6.2.2)
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
              R-12  fixeo:auth:updated: redefined as Phase 6.2.5 stub
   ============================================================ */

(function () {
  'use strict';

  /* ── Guard ──────────────────────────────────────────────── */
  if (window._fxAnalyticsBootstrapLoaded) return;
  window._fxAnalyticsBootstrapLoaded = true;

  var VERSION = 'fab-v1b';
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
     which requires an explicit authorised deployment commit
     (Phase 6.2.5 — GA4 Activation).
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

  /* ══════════════════════════════════════════════════════════
     EVENT LISTENERS
     Each listener bridges one fixeo:* CustomEvent to one GA4
     event via _gtag(). Listeners are registered only when
     analyticsEnabled === true (unreachable in production).
     ══════════════════════════════════════════════════════════ */

  /* ── C1: contact_form_submit ────────────────────────────── */
  /* Source: js/request-form.js → fixeo:client-request-submit-success */
  /* Fires: after confirmed Supabase INSERT on service_requests */
  /*                                                            */
  /* R-01 fix: service field was req.service_type (undefined).  */
  /* Correct primary field is req.service. Fallback chain added */
  /* for defensive resilience. Date.now() dedup fallback        */
  /* removed — tracking_ref is always generated before dispatch.*/
  window.addEventListener('fixeo:client-request-submit-success', function (e) {
    var d = (e && e.detail) || {};
    var req = d.request || {};

    /* R-11: stable dedup key — tracking_ref always present;    */
    /* Date.now() fallback removed (non-deterministic).         */
    var dedupKey = 'cfs_' + (_str(req.id) || _str(req.tracking_ref));
    if (!dedupKey || dedupKey === 'cfs_') return; /* no stable key — drop safely */

    if (!_dedup(dedupKey)) {
      _log('Dedup suppressed', cfg.events.CONTACT_FORM_SUBMIT, dedupKey);
      return;
    }

    /* R-01: primary field = req.service (normalized service slug). */
    /* Fallback: req.service_type, req.service_category.           */
    var artisanService = _str(req.service || req.service_type || req.service_category);

    _log('Event', cfg.events.CONTACT_FORM_SUBMIT, d);
    _gtag('event', cfg.events.CONTACT_FORM_SUBMIT, {
      transaction_id:   _str(req.id || req.tracking_ref),
      artisan_service:  artisanService,
      artisan_city:     _str(req.city),
      request_mode:     _str(d.mode),
      was_duplicate:    !!d.duplicated,
      page_path:        _path
    });
  });

  /* ── C1b: urgent_request_submit ─────────────────────────── */
  /* Source: js/request-form.js → fixeo:urgent-event           */
  /* Fires: after urgent modal form submission only             */
  /*                                                            */
  /* R-02 fix (Option B — Final Design Freeze):                 */
  /* • Type guard: process ONLY type === 'urgent_submit'.       */
  /*   Ignores: urgent_open, artisan_click, conversion, others. */
  /* • City: read from d.payload.city (controlled <select>).    */
  /* • artisan_service: OMITTED — no canonical service slug     */
  /*   exists in the payload at submission time. inferring from */
  /*   raw problem text is prohibited (PII risk + no global fn).*/
  /* • problem_query: OMITTED — raw free text, PII-unsafe.      */
  /* • source: included as low-cardinality attribution signal.  */
  /* • Dedup key: 'urs_' + d.id (generated by FixeoUrgentAnalytics). */
  window.addEventListener('fixeo:urgent-event', function (e) {
    var d = (e && e.detail) || {};

    /* R-02: strict type guard — only urgent_submit qualifies.   */
    if (d.type !== 'urgent_submit') return;

    var payload = d.payload || {};

    var dedupKey = 'urs_' + _str(d.id);
    if (!_dedup(dedupKey)) {
      _log('Dedup suppressed', cfg.events.URGENT_REQUEST_SUBMIT, dedupKey);
      return;
    }

    /* PII gate: city comes from a controlled <select> list.     */
    /* source is a constant string ('urgent_modal_form').        */
    /* Neither the problem query nor any free text is sent.      */
    _log('Event', cfg.events.URGENT_REQUEST_SUBMIT, d);
    _gtag('event', cfg.events.URGENT_REQUEST_SUBMIT, {
      artisan_city: _str(payload.city),
      source:       _str(payload.source),
      page_path:    _path
    });
  });

  /* ── C2: mission_created ────────────────────────────────── */
  /* Source: js/fixeo-supabase-core.js → fixeo:data:changed   */
  /* type: 'service_request_created' (Supabase-confirmed)      */
  /*                                                            */
  /* R-03 fix: service field was req.service_type (undefined).  */
  /* Correct primary field is req.service_category (the actual  */
  /* Supabase column name in service_requests table).           */
  window.addEventListener('fixeo:data:changed', function (e) {
    var d = (e && e.detail) || {};
    if (d.type !== 'service_request_created') return;

    var req = d.request || {};
    var dedupKey = 'mcr_' + _str(req.id);
    if (!_dedup(dedupKey)) return;

    /* R-03: primary = req.service_category (Supabase column).   */
    /* Fallback: req.service_type, req.service.                  */
    var artisanService = _str(req.service_category || req.service_type || req.service);

    _log('Event', cfg.events.MISSION_CREATED, d);
    _gtag('event', cfg.events.MISSION_CREATED, {
      transaction_id:  _str(req.id),
      artisan_service: artisanService,
      artisan_city:    _str(req.city),
      page_path:       _path
    });
  });

  /* ── C3: mission_assigned / mission_completed ───────────── */
  /* Source: js/fixeo-mission-system.js → fixeo:missions:updated */
  /*                                                            */
  /* R-04 fix: trigger was 'assigned'|'pending' — both wrong.   */
  /* 'assigned' does not exist in the mission lifecycle.        */
  /* 'pending' = just submitted, no artisan yet.                */
  /* Correct trigger: 'accepted' (set by chooseArtisan()).      */
  /* artisan_service added (m.service) — authorized additive     */
  /* schema change per Phase 6.2.4 Final Design Freeze.         */
  /* Dedup 'ma_' + m.id: suppresses re-assignment correctly     */
  /* (first assignment tracked only).                           */
  /*                                                            */
  /* R-05 fix: artisan_service was m.service_type (undefined).   */
  /* Correct primary field: m.service (mission system field).   */
  /* Policy: 'completed' OR 'validated' qualifies — intentional  */
  /* (validated = client confirmed). Dedup 'mco_' + m.id        */
  /* guarantees one mission_completed per mission lifetime.     */
  window.addEventListener('fixeo:missions:updated', function (e) {
    var d = (e && e.detail) || {};
    var missions = d.missions || (Array.isArray(d) ? d : null);
    if (!missions) return;

    for (var j = 0; j < missions.length; j++) {
      var m = missions[j];
      if (!m || !m.id) continue;

      /* R-04: mission_assigned — trigger on 'accepted' only.    */
      if (m.status === 'accepted') {
        var ak = 'ma_' + _str(m.id);
        if (_dedup(ak)) {
          _log('Event', cfg.events.MISSION_ASSIGNED, m);
          _gtag('event', cfg.events.MISSION_ASSIGNED, {
            transaction_id:  _str(m.id),
            artisan_id:      _str(m.artisan_id),
            artisan_service: _str(m.service),       /* R-04: additive schema field */
            page_path:       _path
          });
        }
      }

      /* R-05: mission_completed — artisan_service from m.service. */
      if (m.status === 'completed' || m.status === 'validated') {
        var ck = 'mco_' + _str(m.id);
        if (_dedup(ck)) {
          _log('Event', cfg.events.MISSION_COMPLETED, m);
          _gtag('event', cfg.events.MISSION_COMPLETED, {
            transaction_id:  _str(m.id),
            artisan_id:      _str(m.artisan_id),
            artisan_service: _str(m.service || m.service_type), /* R-05 */
            page_path:       _path
          });
        }
      }
    }
  });

  /* ── C4: whatsapp_click ─────────────────────────────────── */
  /* Source: wa.me links across public pages                    */
  /* Registered via document-level click delegation.            */
  /*                                                            */
  /* R-09 fix: full anchor.href may contain encoded phone       */
  /* numbers or user-entered text (PII). The ?text= query        */
  /* parameter on auth.html contains the user's phone number.  */
  /* Only a sanitised destination classification is sent.       */
  /* destination_type: 'whatsapp' (constant, zero PII).         */
  /* page_path already identifies which page triggered the      */
  /* click — full URL provides no additional analytical value.  */
  document.addEventListener('click', function (e) {
    var target = e && e.target;
    if (!target) return;
    var anchor = target.closest ? target.closest('a[href*="wa.me"]') : null;
    if (!anchor) return;

    /* R-09: send only sanitised classification — never the URL. */
    _log('Event', cfg.events.WHATSAPP_CLICK, { destination_type: 'whatsapp' });
    _gtag('event', cfg.events.WHATSAPP_CLICK, {
      destination_type: 'whatsapp',
      page_path:        _path
    });
  });

  /* ── C5: phone_click ─────────────────────────────────────── */
  /* Source: tel: links across public pages                     */
  /* Registered via document-level click delegation.            */
  /*                                                            */
  /* R-08: interaction event only. Raw telephone number is       */
  /* never sent. destination_type 'phone' is a constant string. */
  /* Not a GA4 Key Event in this phase.                         */
  document.addEventListener('click', function (e) {
    var target = e && e.target;
    if (!target) return;
    var anchor = target.closest ? target.closest('a[href^="tel:"]') : null;
    if (!anchor) return;

    /* PII gate: never send the raw tel: href or phone number.  */
    _log('Event', cfg.events.PHONE_CLICK || 'phone_click', { destination_type: 'phone' });
    _gtag('event', cfg.events.PHONE_CLICK || 'phone_click', {
      destination_type: 'phone',
      page_path:        _path
    });
  });

  /* ── C6: artisan_card_click ─────────────────────────────── */
  /* Source: LP pages — .lp-card-link anchors in SSR output    */
  /* Registered via document-level click delegation.            */
  /*                                                            */
  /* R-07 fix: card.dataset.artisanId was always '' because LP  */
  /* card anchors carry no data-* attributes. Strategy A:       */
  /* extract public_slug from the canonical /artisan/{slug} URL.*/
  /* URL pattern is locked: https://www.fixeo.ma/artisan/{slug} */
  /* Split on '/artisan/' → index [1] = slug (single segment,   */
  /* never contains '/'. No query strings or fragments sent.    */
  document.addEventListener('click', function (e) {
    var target = e && e.target;
    if (!target) return;
    var card = target.closest ? target.closest('.lp-card-link') : null;
    if (!card) return;

    /* R-07: prefer explicit data attributes; fallback to href.  */
    var artisanId = _str(card.dataset.artisanId || card.dataset.id);
    if (!artisanId && card.href) {
      var parts = card.href.split('/artisan/');
      if (parts.length > 1) {
        artisanId = _str(parts[1].split('?')[0].split('#')[0]);
      }
    }

    _log('Event', cfg.events.ARTISAN_CARD_CLICK, { artisanId: artisanId });
    _gtag('event', cfg.events.ARTISAN_CARD_CLICK, {
      artisan_id: artisanId,
      page_path:  _path
    });
  });

  /* ── C7: signup completion ───────────────────────────────── */
  /* Source: auth.html → fixeo:signup:complete CustomEvent      */
  /* Dispatched immediately before showConfirmScreen() only     */
  /* after FixeoAuth.signUp() returns without error.            */
  /*                                                            */
  /* R-06 fix: previous approach used fixeo:auth:updated and    */
  /* inferred signup from user.created_at (always undefined in  */
  /* normalizedUser — heuristic never fired). New approach:     */
  /* dedicated CustomEvent dispatched at the confirmed success  */
  /* point in auth.html. role, city, user_id in scope there.   */
  /*                                                            */
  /* user_id used ONLY as local dedup key — not sent to GA4.   */
  /* email, phone, name, password: never dispatched or read.   */
  window.addEventListener('fixeo:signup:complete', function (e) {
    var d = (e && e.detail) || {};
    var userId = _str(d.user_id);

    if (!userId) return; /* guard: no valid signup without a user ID */

    var dedupKey = 'su_' + userId;
    if (!_dedup(dedupKey)) return;

    var role = _str(d.role) || 'client';
    var eventName = role === 'artisan'
      ? cfg.events.ARTISAN_SIGNUP_COMPLETE
      : cfg.events.CLIENT_SIGNUP_COMPLETE;

    _log('Event', eventName, { role: role });
    _gtag('event', eventName, {
      user_role:    role,
      artisan_city: _str(d.city),
      page_path:    _path
      /* user_id intentionally NOT sent as GA4 parameter        */
      /* pending Phase 6.2.5 user-property schema authorization */
    });
  });

  /* ── Phase 6.2.5 hook: fixeo:auth:updated ────────────────── */
  /* R-12: signup detection removed (broken heuristic).         */
  /* This listener is retained as the documented hook point     */
  /* for Phase 6.2.5 user-property instrumentation.            */
  /*                                                            */
  /* PHASE 6.2.5 TODO (requires separate authorization):        */
  /*   On login / session restore (d.user non-null):           */
  /*     _gtag('set', {                                         */
  /*       user_id:   _str(d.user.id),   // Supabase UUID only  */
  /*       user_role: _str(d.user.role)  // 'client'|'artisan' */
  /*     });                                                     */
  /*   On logout (d.user null):                                 */
  /*     _gtag('set', { user_id: null });                       */
  /*                                                            */
  /* FORBIDDEN in this listener at any phase:                   */
  /*   d.user.email — may be synthetic phone-derived address    */
  /*   d.profile.phone — phone number (PII)                    */
  /*   d.profile.full_name — personal name (PII)               */
  /*                                                            */
  /* DO NOT activate this listener body before Phase 6.2.5     */
  /* authorization is granted.                                  */
  window.addEventListener('fixeo:auth:updated', function (e) { /* eslint-disable-line no-unused-vars */
    /* Phase 6.2.5 user-property wiring goes here.              */
    /* This body is intentionally empty in Phase 6.2.4.         */
  });

  /* ── Consent update helper ──────────────────────────────── */
  /* Called by fixeo-consent-v1.js (Phase 6.2.5) when the user */
  /* accepts or refuses cookie consent.                         */
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
