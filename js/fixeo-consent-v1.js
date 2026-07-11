/* ============================================================
   FIXEO COOKIE CONSENT MANAGER
   js/fixeo-consent-v1.js   Version: fcv-v1c

   PURPOSE
   ───────
   Implements the FIXEO cookie consent banner and preferences
   modal for analytics cookies under Loi 09-08 (Morocco) and
   GDPR standards.

   CONSENT CATEGORIES
   ──────────────────
   1. Necessary — always active, cannot be disabled.
      Required for authentication, session, and core functions.
   2. Analytics — disabled by default.
      Currently has zero effect (analytics remains dormant).
      Future: activates GA4 when Phase 6.2.5 is authorised.

   CONSENT MODE V2 INITIALISATION
   ───────────────────────────────
   This file sets:
     gtag('consent', 'default', { analytics_storage: 'denied', ... })
   BEFORE gtag.js is loaded — which is never, in the current
   dormant state. The consent default is therefore a no-op in
   production but is pre-wired for Phase 6.2.5.

   The gtag wrapper used here is a stub that queues commands
   into window.dataLayer. It is safe to call even when gtag.js
   is not loaded.

   STORAGE
   ───────
   Consent choice persisted in localStorage under key:
     fixeo_consent_analytics
   Values: 'granted' | 'denied'
   No consent = banner shows again on next visit.

   DORMANT STATE
   ─────────────
   When FixeoAnalyticsConfig.analyticsEnabled === false:
   • Banner renders and persists choice normally.
   • gtag('consent', 'update', ...) is called but has zero
     effect because gtag.js is never loaded.
   • No GA4 requests are emitted.
   • No cookies are written by Google.
   • The bootstrap module exits before wiring any listeners.

   ACTIVATION
   ──────────
   Phase 6.2.5 will:
   1. Insert the gtag.js <script async> before consent init
   2. Set analyticsEnabled + ga4Enabled to true in config
   3. On user Accept: gtag('consent','update',{analytics_storage:'granted'})
      triggers the bootstrap via window.FixeoAnalyticsBootstrap.grantConsent()

   REOPENING
   ─────────
   Call window.FixeoConsent.open() from anywhere to reopen the
   preferences modal (used by cookie settings links in CGU/footer).

   CHANGELOG
   ─────────
   fcv-v1c  2026-07-11  Phase 6.2.5A.3 — M-01: _denyAnalytics consent update; M-02: footer link; M-03: <head> init
   fcv-v1b  2026-07-11  Phase 6.2.5A.1 — blog+SSR coverage, versioned storage, GA cookie deletion, open() fix
   fcv-v1a  2026-07-11  Initial consent manager (Phase 6.2.5A)
   ============================================================ */

(function () {
  'use strict';

  /* ── Guard ──────────────────────────────────────────────── */
  if (window._fxConsentLoaded) return;
  window._fxConsentLoaded = true;

  var VERSION   = 'fcv-v1c';
  var STORAGE_KEY = 'fixeo_consent_analytics';

  /* ── Consent Mode v2 stub ────────────────────────────────── */
  /* Pre-wire dataLayer so gtag('consent','default',...) queues  */
  /* correctly even before gtag.js is loaded.                   */
  /* This is the Consent Mode v2 initialization pattern.        */
  /* In the current dormant state, gtag.js is never loaded, so  */
  /* these queued commands have zero network effect.             */
  window.dataLayer = window.dataLayer || [];
  function _gtag() {
    window.dataLayer.push(arguments);
  }

  /* ── Consent Mode v2 default ─────────────────────────────── */
  /* CRITICAL: analytics_storage denied before ANY gtag call.   */
  /* This must execute synchronously before gtag.js loads.      */
  /* Format required: _gtag('js', new Date()) must come first   */
  /* when gtag.js is actually loaded (Phase 6.2.5).             */
  _gtag('consent', 'default', {
    analytics_storage:   'denied',
    ad_storage:          'denied',
    ad_user_data:        'denied',
    ad_personalization:  'denied',
    wait_for_update:     500
  });

  /* ── Storage helpers ─────────────────────────────────────── */
  /* Consent record schema v1:                                  */
  /*   { v: 1, analytics: 'granted'|'denied',                  */
  /*     ts: <epoch ms first set>, updated: <epoch ms last set>}*/
  /* Migration: raw string 'granted'/'denied' (schema v0) is   */
  /* auto-upgraded to v1 with ts: null on first read.          */
  function _readRecord() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      /* v0 raw string migration */
      if (raw === 'granted' || raw === 'denied') {
        return { v: 0, analytics: raw, ts: null, updated: null };
      }
      /* v1+ JSON */
      var rec = JSON.parse(raw);
      if (rec && (rec.analytics === 'granted' || rec.analytics === 'denied')) return rec;
      return null; /* malformed — treat as unset */
    } catch (e) { return null; }
  }
  function _writeRecord(val) {
    try {
      var existing = _readRecord();
      var now = Date.now();
      var rec = {
        v:         1,
        analytics: val,
        ts:        (existing && existing.ts) ? existing.ts : now,
        updated:   now
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
    } catch (e) { /* localStorage blocked */ }
  }
  /* Backward-compatible helpers used throughout the module */
  function _getStored() {
    var rec = _readRecord();
    return rec ? rec.analytics : null;
  }
  function _setStored(val) { _writeRecord(val); }

  /* ── Consent grant/deny ──────────────────────────────────── */
  function _grantAnalytics() {
    _setStored('granted');
    _gtag('consent', 'update', { analytics_storage: 'granted' });
    /* Notify analytics bootstrap (harmless no-op if not loaded) */
    if (window.FixeoAnalyticsBootstrap && typeof window.FixeoAnalyticsBootstrap.grantConsent === 'function') {
      window.FixeoAnalyticsBootstrap.grantConsent();
    }
  }

  function _denyAnalytics() {
    _setStored('denied');
    /* Consent Mode v2 — queue denied update immediately.       */
    /* Harmless no-op in dormant state (gtag not loaded).       */
    /* Required: fires before any future gtag.js activation.    */
    _gtag('consent', 'update', {
      analytics_storage:    'denied',
      ad_storage:           'denied',
      ad_user_data:         'denied',
      ad_personalization:   'denied'
    });
    /* Attempt to expire known GA4 cookies on revocation.       */
    /* No-op in dormant state (no GA cookies exist yet).        */
    /* Required for post-activation revocation hygiene.         */
    try {
      var domains = [location.hostname, '.' + location.hostname.replace(/^www\./, '')];
      var gaCookies = ['_ga', '_gid', '_gat'];
      /* GA4 container cookie pattern — safe generic expiry attempt */
      document.cookie.split(';').forEach(function (c) {
        var name = c.trim().split('=')[0];
        if (name === '_ga' || name === '_gid' || name === '_gat' ||
            /^_ga_/.test(name) || /^_gat_GA/.test(name)) {
          gaCookies.push(name);
        }
      });
      gaCookies.forEach(function (name) {
        domains.forEach(function (domain) {
          ['/',''].forEach(function (path) {
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=' + (path || '/') + ';domain=' + domain;
          });
        });
      });
    } catch (e) { /* cookie access blocked */ }
    if (window.FixeoAnalyticsBootstrap && typeof window.FixeoAnalyticsBootstrap.denyConsent === 'function') {
      window.FixeoAnalyticsBootstrap.denyConsent();
    }
  }

  /* ── Restore persisted consent on page load ─────────────── */
  /* If the user already chose, apply immediately and skip      */
  /* the banner. This prevents the banner from flashing on     */
  /* returning visitors.                                        */
  var _stored = _getStored();
  if (_stored === 'granted') {
    _grantAnalytics();
  }
  /* 'denied' state is already the default — no update needed. */

  /* ═══════════════════════════════════════════════════════════
     UI — built programmatically to avoid flash-of-unstyled
     content and keep the HTML footprint zero for pages that
     have already consented.
     ═══════════════════════════════════════════════════════════ */

  /* Only render UI if consent has not yet been decided */
  if (_stored !== null) {
    /* Already chose — skip banner, expose API only */
    _exposePublicAPI();
    return;
  }

  /* ── Wait for DOM ────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* ── Banner HTML ─────────────────────────────────────────── */
  function _buildBanner() {
    var el = document.createElement('div');
    el.className   = 'fcb-banner';
    el.id          = 'fcb-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-label', 'Paramètres des cookies');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = [
      '<div class="fcb-inner">',
        '<div class="fcb-row">',
          '<div class="fcb-icon" aria-hidden="true">🍪</div>',
          '<div class="fcb-text">',
            '<h3>Vos préférences de cookies</h3>',
            '<p>',
              'Fixeo utilise des cookies essentiels pour le fonctionnement du service et, ',
              'avec votre accord, des cookies analytiques pour mesurer l\'audience et améliorer ',
              'l\'expérience. Conformément à la ',
              '<a href="/cgu.html#cookies" target="_blank" rel="noopener">Loi 09-08</a>.',
            '</p>',
          '</div>',
          '<div class="fcb-actions">',
            '<button class="fcb-btn fcb-btn--settings" id="fcb-open-modal" type="button">',
              'Personnaliser',
            '</button>',
            '<button class="fcb-btn fcb-btn--refuse" id="fcb-refuse" type="button">',
              'Refuser',
            '</button>',
            '<button class="fcb-btn fcb-btn--accept" id="fcb-accept" type="button">',
              'Accepter',
            '</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
    return el;
  }

  /* ── Modal HTML ──────────────────────────────────────────── */
  function _buildModal() {
    var el = document.createElement('div');
    el.className = 'fcb-modal-backdrop';
    el.id        = 'fcb-modal-backdrop';
    el.setAttribute('hidden', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fcb-modal-title');
    el.innerHTML = [
      '<div class="fcb-modal" id="fcb-modal" role="document">',

        '<!-- Modal header -->',
        '<div class="fcb-modal-header">',
          '<h2 class="fcb-modal-title" id="fcb-modal-title">Paramètres des cookies</h2>',
          '<button class="fcb-modal-close" id="fcb-modal-close" type="button" aria-label="Fermer">✕</button>',
        '</div>',

        '<!-- Modal body -->',
        '<div class="fcb-modal-body">',
          '<p class="fcb-modal-intro">',
            'Gérez vos préférences de cookies. Les cookies essentiels sont toujours actifs ',
            'car ils sont nécessaires au fonctionnement du service. Pour les autres catégories, ',
            'vous pouvez activer ou désactiver à tout moment.',
          '</p>',

          '<!-- Category 1: Necessary -->',
          '<div class="fcb-category">',
            '<div class="fcb-category-header">',
              '<p class="fcb-category-name">🔒 Cookies essentiels</p>',
              '<span class="fcb-badge-always">✓ Toujours actifs</span>',
            '</div>',
            '<p class="fcb-category-desc">',
              'Indispensables au fonctionnement de la plateforme : authentification, session, ',
              'sécurité, préférences de langue. Aucun consentement requis (légalement exemptés).',
            '</p>',
          '</div>',

          '<!-- Category 2: Analytics -->',
          '<div class="fcb-category">',
            '<div class="fcb-category-header">',
              '<p class="fcb-category-name">📊 Cookies analytiques</p>',
              '<label class="fcb-toggle" for="fcb-toggle-analytics" aria-label="Activer les cookies analytiques">',
                '<input type="checkbox" id="fcb-toggle-analytics" name="analytics">',
                '<div class="fcb-toggle-track"><div class="fcb-toggle-thumb"></div></div>',
              '</label>',
            '</div>',
            '<p class="fcb-category-desc">',
              'Nous permettent de mesurer l\'audience et d\'améliorer le service (Google Analytics 4). ',
              'Données anonymisées. Aucun profilage publicitaire. ',
              'Désactivés par défaut — activés uniquement après votre accord explicite.',
            '</p>',
          '</div>',

        '</div>',

        '<!-- Modal footer -->',
        '<div class="fcb-modal-footer">',
          '<button class="fcb-btn fcb-btn--accept-all" id="fcb-modal-accept-all" type="button">',
            'Tout accepter',
          '</button>',
          '<button class="fcb-btn fcb-btn--save" id="fcb-modal-save" type="button">',
            'Enregistrer mes choix',
          '</button>',
        '</div>',

      '</div>'
    ].join('');
    return el;
  }

  /* ── Init ────────────────────────────────────────────────── */
  function _init() {
    var banner = _buildBanner();
    var modal  = _buildModal();
    document.body.appendChild(banner);
    document.body.appendChild(modal);

    /* ── Banner buttons ────────────────────────────────────── */
    document.getElementById('fcb-accept').addEventListener('click', function () {
      _grantAnalytics();
      _hideBanner(banner);
    });

    document.getElementById('fcb-refuse').addEventListener('click', function () {
      _denyAnalytics();
      _hideBanner(banner);
    });

    document.getElementById('fcb-open-modal').addEventListener('click', function () {
      _openModal(modal, banner);
    });

    /* ── Modal buttons ─────────────────────────────────────── */
    document.getElementById('fcb-modal-close').addEventListener('click', function () {
      _closeModal(modal);
    });

    document.getElementById('fcb-modal-accept-all').addEventListener('click', function () {
      document.getElementById('fcb-toggle-analytics').checked = true;
      _grantAnalytics();
      _closeModal(modal);
      _hideBanner(banner);
    });

    document.getElementById('fcb-modal-save').addEventListener('click', function () {
      var analyticsOn = document.getElementById('fcb-toggle-analytics').checked;
      if (analyticsOn) {
        _grantAnalytics();
      } else {
        _denyAnalytics();
      }
      _closeModal(modal);
      _hideBanner(banner);
    });

    /* ── Backdrop click closes modal ───────────────────────── */
    modal.addEventListener('click', function (e) {
      if (e.target === modal) _closeModal(modal);
    });

    /* ── Keyboard: Escape closes modal ─────────────────────── */
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) &&
          !modal.hasAttribute('hidden')) {
        _closeModal(modal);
      }
    });

    _exposePublicAPI(modal, banner);
  }

  /* ── Banner hide ─────────────────────────────────────────── */
  function _hideBanner(banner) {
    banner.classList.add('fcb-banner--out');
    setTimeout(function () {
      banner.setAttribute('hidden', '');
    }, 380);
  }

  /* ── Modal open / close ──────────────────────────────────── */
  function _openModal(modal, banner) {
    modal.removeAttribute('hidden');
    /* Set toggle to current stored state */
    var stored = _getStored();
    var toggle = document.getElementById('fcb-toggle-analytics');
    if (toggle) toggle.checked = (stored === 'granted');
    /* Focus first interactive element */
    var closeBtn = document.getElementById('fcb-modal-close');
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 50);
  }

  function _closeModal(modal) {
    modal.setAttribute('hidden', '');
  }

  /* ── Public API ──────────────────────────────────────────── */
  function _exposePublicAPI(modal, banner) {
    window.FixeoConsent = {
      version: VERSION,

      /* Open preferences modal (used by "Gérer les cookies" links) */
      open: function () {
        if (!modal) {
          /* Banner already accepted/refused — re-init UI then open modal */
          _stored = null;
          _init();
          /* _init() builds fresh modal; open it immediately after append */
          var m = document.getElementById('fcb-modal');
          var b = document.getElementById('fcb-banner');
          if (m && b) _openModal(m, b);
          return;
        }
        _openModal(modal, banner);
      },

      /* Current state */
      getState: function () { return _getStored(); },

      /* Programmatic grant (for testing only — never call in prod) */
      _grant: function () { _grantAnalytics(); },
      _deny:  function () { _denyAnalytics();  }
    };
  }

})();
