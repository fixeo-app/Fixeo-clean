/**
 * fixeo-request-modal-v3.js — fxrmv3-v1b
 * Request Modal — Definitive clean lifecycle
 *
 * OWNS:
 *   - One backdrop  (#fxrmv3-bd)
 *   - One modal     (#request-modal)
 *   - One open path
 *   - One close path
 *   - One scroll-lock/unlock pair
 *   - One header render (exactly: mode + title + subtitle)
 *   - One success confirmation (replaces silent close)
 *
 * PRESERVES (untouched):
 *   - request-form.js submit/validation/prefill/reset
 *   - All MutationObserver hooks (RAFI, fuv3, rmv2, analytics, ai-engine)
 *     They watch .open class + data-request-mode — both still toggled here.
 *   - window.openModal / window.closeModal globals (shimmed)
 *   - FixeoClientRequest.open / .closeStandard / .openExpress (patched)
 *   - fixeo-express-route-shim.js routing
 *
 * SCROLL LOCK: position:fixed body (iOS-safe).
 *   Saves scrollY on lock, restores exactly on unlock.
 *   Removes body.modal-open AND body.fxmsf-locked on every close.
 *
 * RAFI GUARD: ejects stale rfos-conv-header before each open,
 *   resets rfosInjected so RAFI OS re-injects exactly once.
 *
 * FEATURE FLAG: window.FIXEO_MODAL_V3 = false to fall back to legacy.
 *
 * VERSION: fxrmv3-v1b — 2026-07-24
 */

(function () {
  'use strict';

  /* ── Feature flag — set to false for instant rollback ─────── */
  if (window.FIXEO_MODAL_V3 === false) return;

  if (window._fxRMV3Loaded) return;
  window._fxRMV3Loaded = true;

  /* ═══════════════════════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════════════════════ */
  var _scrollY = 0;
  var _locked  = false;
  var _isOpen  = false;

  /* ═══════════════════════════════════════════════════════════
     DOM HELPERS
  ═══════════════════════════════════════════════════════════ */
  function _el(id)        { return document.getElementById(id); }
  function _q(s, ctx)     { return (ctx || document).querySelector(s); }

  function _modal()       { return _el('request-modal'); }
  function _backdrop()    {
    var bd = _el('fxrmv3-bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'fxrmv3-bd';
      document.body.insertBefore(bd, document.body.firstChild);
    }
    return bd;
  }

  /* ═══════════════════════════════════════════════════════════
     HEADER COPY
     Exactly one set of strings per mode.
     Written directly into .fxrmv3-* elements — no innerHTML.
  ═══════════════════════════════════════════════════════════ */
  var COPY = {
    'default': {
      mode:     'FIXEO',
      title:    'Quel est le probl\u00e8me\u00a0?',
      subtitle: 'Un artisan Fixeo vous rappelle sous 30\u00a0min'
    },
    'marketplace': {
      mode:     'FIXEO',
      title:    'D\u00e9crivez votre besoin',
      subtitle: 'Un artisan disponible pr\u00e8s de chez vous vous r\u00e9pond rapidement'
    },
    'express': {
      mode:     'URGENT',
      title:    'Intervention urgente \u26a1',
      subtitle: 'Fixeo trouve un artisan disponible maintenant dans votre ville'
    }
  };

  function _renderHeader(modal, mode) {
    var c = COPY[mode] || COPY['default'];
    var modeEl = _q('.fxrmv3-mode',     modal);
    var titleEl= _q('.fxrmv3-title',    modal);
    var subEl  = _q('.fxrmv3-subtitle', modal);
    /* Guard: only write if element exists and value differs (no flicker) */
    if (modeEl  && modeEl.textContent  !== c.mode)     modeEl.textContent  = c.mode;
    if (titleEl && titleEl.textContent !== c.title)    titleEl.textContent = c.title;
    if (subEl   && subEl.textContent   !== c.subtitle) subEl.textContent   = c.subtitle;
    /* Also update legacy IDs so request-form.js updateModalCopy() reads correctly */
    var legacyTitle = _el('request-modal-title');
    var legacySub   = _el('request-modal-subtitle');
    if (legacyTitle) legacyTitle.textContent = c.title;
    if (legacySub)   legacySub.textContent   = c.subtitle;
  }

  /* ═══════════════════════════════════════════════════════════
     SCROLL LOCK — position:fixed body (works on iOS Safari)
  ═══════════════════════════════════════════════════════════ */
  function _lock() {
    if (_locked) return;
    _locked  = true;
    _scrollY = window.scrollY || window.pageYOffset || 0;
    var body = document.body;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top      = '-' + _scrollY + 'px';
    body.style.width    = '100%';
    body.style.left     = '0';
    body.style.right    = '0';
  }

  function _unlock() {
    if (!_locked) return;
    _locked = false;
    var body = document.body;
    body.style.overflow = '';
    body.style.position = '';
    body.style.top      = '';
    body.style.width    = '';
    body.style.left     = '';
    body.style.right    = '';
    /* Remove every legacy scroll-lock class */
    body.classList.remove('modal-open', 'fxmsf-locked');
    window.scrollTo(0, _scrollY);
  }

  /* ═══════════════════════════════════════════════════════════
     RAFI GUARD
     Eject any stale RAFI injection before open.
     Resets rfosInjected so RAFI OS injects exactly once at +70ms.
  ═══════════════════════════════════════════════════════════ */
  function _ejectedRafi(modal) {
    modal.dataset.rfosInjected = '';
    var old = _q('.rfos-conv-header', modal);
    if (old) old.remove();
  }

  /* ═══════════════════════════════════════════════════════════
     MODE RESOLVER
  ═══════════════════════════════════════════════════════════ */
  function _mode(trigger, forced) {
    if (forced && COPY[forced]) return forced;
    if (trigger && typeof trigger.getAttribute === 'function') {
      var m = trigger.getAttribute('data-request-mode');
      if (m && COPY[m]) return m;
    }
    /* Read from modal attribute as fallback */
    var modal = _modal();
    if (modal) {
      var attr = modal.getAttribute('data-request-mode');
      if (attr && COPY[attr]) return attr;
    }
    return 'default';
  }

  /* ═══════════════════════════════════════════════════════════
     OPEN
     Single entry point for every trigger.
  ═══════════════════════════════════════════════════════════ */
  function open(trigger, forced) {
    if (_isOpen) return;          /* prevent double-open */

    var modal = _modal();
    if (!modal) return;
    var mode = _mode(trigger, forced);

    /* 1. Render header — exactly one set of text nodes */
    _renderHeader(modal, mode);

    /* 2. Set mode attribute FIRST (engines observe this) */
    modal.setAttribute('data-request-mode', mode);

    /* 3. Eject any stale RAFI from previous session */
    _ejectedRafi(modal);

    /* 4. Show backdrop */
    _backdrop().classList.add('is-open');

    /* 5. Lock scroll */
    _lock();

    /* 6. Add .is-open first (CSS shows modal), then .open (MutationObserver → engines) */
    modal.classList.add('is-open');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    _isOpen = true;

    /* 7. Focus first interactive field */
    requestAnimationFrame(function () {
      var first = _q('#request-problem, input:not([type=hidden]), select, textarea', modal);
      if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     CLOSE
     Single exit point. Called by: close button, backdrop tap,
     ESC key, FixeoClientRequest.closeStandard, window.closeModal.
  ═══════════════════════════════════════════════════════════ */
  function close() {
    if (!_isOpen) return;

    var modal = _modal();
    if (!modal) return;

    /* 1. Remove classes — MutationObserver fires → RAFI ejects */
    modal.classList.remove('open', 'is-open');
    modal.setAttribute('aria-hidden', 'true');
    _isOpen = false;

    /* 2. Hide backdrop */
    _backdrop().classList.remove('is-open');

    /* 3. Restore scroll (iOS-safe) */
    _unlock();

    /* 4. Clear any inline display set by legacy forceOpenRequestModal */
    modal.style.display = '';
  }

  /* ═══════════════════════════════════════════════════════════
     SUCCESS CONFIRMATION
     Replaces #request-success with the new confirmation UX.
     Called after successful form submission.
     Injects into the existing #request-success container.
  ═══════════════════════════════════════════════════════════ */
  function _buildSuccessHTML() {
    return (
      '<div class="fxrmv3-success-check" aria-hidden="true">&#x2713;</div>' +
      '<p class="fxrmv3-success-rafi">RAFI</p>' +
      '<h4 class="fxrmv3-success-title">Votre demande a bien \u00e9t\u00e9 envoy\u00e9e.</h4>' +
      '<p class="fxrmv3-success-sub">RAFI recherche maintenant les meilleurs professionnels pour votre projet.</p>' +
      '<div class="fxrmv3-steps" aria-label="\u00c9tapes suivantes">' +
        '<div class="fxrmv3-step"><div class="fxrmv3-step-dot">&#x2705;</div><span class="fxrmv3-step-label">Demande enregistr\u00e9e</span></div>' +
        '<div class="fxrmv3-step-sep" aria-hidden="true"></div>' +
        '<div class="fxrmv3-step"><div class="fxrmv3-step-dot">&#x1F50D;</div><span class="fxrmv3-step-label">RAFI s\u00e9lectionne</span></div>' +
        '<div class="fxrmv3-step-sep" aria-hidden="true"></div>' +
        '<div class="fxrmv3-step"><div class="fxrmv3-step-dot">&#x1F4AC;</div><span class="fxrmv3-step-label">Confirmation WhatsApp</span></div>' +
      '</div>' +
      '<div class="fxrmv3-success-actions">' +
        '<a href="/client-dashboard.html" class="fxrmv3-btn-primary">Voir mes demandes</a>' +
        '<a href="/index.html" class="fxrmv3-btn-secondary">Retour \u00e0 l\u2019accueil</a>' +
      '</div>'
    );
  }

  function _hookSuccess() {
    /* Watch for #request-success becoming visible (request-form.js calls showSuccess()) */
    var modal = _modal();
    if (!modal) return;
    var successEl = _el('request-success');
    if (!successEl) return;

    /* MutationObserver: when hidden attr is removed → success shown → replace content */
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName !== 'hidden') return;
        if (!successEl.hasAttribute('hidden') && !successEl.dataset.fxrmv3Success) {
          successEl.dataset.fxrmv3Success = '1';

          /* Update modal header to match success state */
          var modeEl = _q('.fxrmv3-mode', modal);
          var titleEl= _q('.fxrmv3-title', modal);
          var subEl  = _q('.fxrmv3-subtitle', modal);
          if (modeEl)  modeEl.textContent  = 'RAFI';
          if (titleEl) titleEl.textContent  = 'Demande envoy\u00e9e';
          if (subEl)   subEl.textContent    = '';

          /* Replace success content with V3 confirmation */
          successEl.innerHTML = _buildSuccessHTML();
        }
        /* Reset when hidden again (new request) */
        if (successEl.hasAttribute('hidden')) {
          delete successEl.dataset.fxrmv3Success;
        }
      });
    });
    obs.observe(successEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ═══════════════════════════════════════════════════════════
     CLOSE BUTTON WIRING
     Single listener. Guard prevents double-binding.
  ═══════════════════════════════════════════════════════════ */
  function _wireClose() {
    var modal = _modal();
    if (!modal) return;
    var btn = _q('.fxrmv3-close', modal);
    if (!btn || btn._v3Bound) return;
    btn._v3Bound = true;

    function _tap(e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    btn.addEventListener('click',    _tap);
    btn.addEventListener('touchend', _tap, { passive: false });
  }

  /* ═══════════════════════════════════════════════════════════
     BACKDROP TAP
  ═══════════════════════════════════════════════════════════ */
  function _wireBackdrop() {
    var bd = _backdrop();
    if (bd._v3Bound) return;
    bd._v3Bound = true;

    function _tap(e) {
      if (e.target === bd) close();
    }
    bd.addEventListener('click',    _tap);
    bd.addEventListener('touchend', _tap, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════════
     ESC KEY
  ═══════════════════════════════════════════════════════════ */
  function _wireEsc() {
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && _isOpen) close();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     GLOBAL SHIMS
     Intercept every existing call site without modifying them.
  ═══════════════════════════════════════════════════════════ */
  function _shimGlobals() {
    /* window.openModal ─────────────────────────────────────── */
    var _origOpen = window.openModal;
    window.openModal = function (id) {
      if (id === 'request-modal') { open(null, null); return; }
      if (_origOpen) _origOpen.call(this, id);
    };

    /* window.closeModal ────────────────────────────────────── */
    var _origClose = window.closeModal;
    window.closeModal = function (id) {
      if (id === 'request-modal') { close(); return; }
      if (_origClose) _origClose.call(this, id);
    };

    /* forceOpenRequestModal (mobile nav inline script) ──────── */
    window.forceOpenRequestModal = function () { open(null, null); };
  }

  /* ═══════════════════════════════════════════════════════════
     PATCH FixeoClientRequest
     Wraps open/closeStandard with V3 lifecycle.
     All other methods (reset, storageKey, buildWhatsappLink) untouched.
  ═══════════════════════════════════════════════════════════ */
  function _patchFCR() {
    var fc = window.FixeoClientRequest;
    if (!fc || fc._v3Patched) { setTimeout(_patchFCR, 60); return; }
    if (!fc.open) { setTimeout(_patchFCR, 60); return; }
    fc._v3Patched = true;

    /* Wrap open: request-form.js runs first (reset/prefill/copy),
       then V3 handles lifecycle. */
    var _origFCROpen = fc.open;
    fc.open = function (trigger, forcedMode) {
      /* Block if already open — prevents double-fire */
      if (_isOpen) return;

      /* Let request-form.js do its reset / updateModalCopy / applyContextPrefill */
      _origFCROpen.apply(this, arguments);

      /* V3 lifecycle: ensure scroll lock, backdrop, header */
      var mode = _mode(trigger, forcedMode);
      var modal = _modal();
      if (modal && modal.classList.contains('is-open')) {
        /* openModal shim already ran → backdrop + lock may not be set yet */
        _backdrop().classList.add('is-open');
        _lock();
        _renderHeader(modal, mode);
      }
    };

    /* closeStandard → V3 close */
    fc.closeStandard = close;
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════ */
  function _init() {
    _shimGlobals();
    _wireClose();
    _wireBackdrop();
    _wireEsc();
    _hookSuccess();
    /* Patch FCR after a tick — request-form.js DOMContentLoaded fires first */
    setTimeout(_patchFCR, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */
  window.FixeoRequestModalV3 = {
    VERSION: 'fxrmv3-v1b',
    open:    open,
    close:   close
  };

})();
