/**
 * fixeo-request-modal-v3.js — fxrmv3-v1a
 * Request Modal V3 — Clean open/close lifecycle
 *
 * REPLACES the broken lifecycle in:
 *   forceOpenRequestModal()  (inline script in index.html)
 *   fixeo-header-global.js   (openModal('request-modal') path)
 *   header-unified.js        (modal-open class path)
 *
 * PRESERVES all existing engines by keeping the same:
 *   #request-modal element          (observers still fire)
 *   .open class toggle              (MutationObserver hooks intact)
 *   data-request-mode attribute     (fuv3 / rmv2 / RAFI watchers intact)
 *   FixeoClientRequest public API   (open / openExpress / closeStandard)
 *   window.openModal('request-modal') global shim
 *
 * SCROLL LOCK: Uses the position:fixed body technique (iOS-safe).
 *   Saves scrollY, fixes body, restores on close.
 *   Removes both body.modal-open AND body.fxmsf-locked on close.
 *
 * VERSION: fxrmv3-v1a — 2026-07-24
 */

(function () {
  'use strict';

  if (window._fxRMV3Loaded) return;
  window._fxRMV3Loaded = true;

  /* ── Private state ─────────────────────────────────────────── */
  var _scrollY  = 0;
  var _locked   = false;
  var _modal    = null;
  var _backdrop = null;

  /* ── Helpers ────────────────────────────────────────────────── */
  function _q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function _el(id)      { return document.getElementById(id); }

  /* ── Resolve open/close trigger mode ─────────────────────────
     Reads data-request-mode from trigger element (button/link).
     Falls back to 'default'. ──────────────────────────────── */
  function _resolveMode(trigger, forced) {
    if (forced) return forced;
    if (trigger && typeof trigger.getAttribute === 'function') {
      return trigger.getAttribute('data-request-mode') || 'default';
    }
    return 'default';
  }

  /* ── Header content map ──────────────────────────────────────
     Exactly one eyebrow, one title, one subtitle per mode.
     These match what request-form.js REQUEST_COPY defines.
  ──────────────────────────────────────────────────────────── */
  var HEADER_COPY = {
    'default': {
      eyebrow:  'FIXEO',
      title:    'Quel est le probl\u00e8me\u00a0?',
      subtitle: 'Un artisan Fixeo vous rappelle sous 30\u00a0min'
    },
    'marketplace': {
      eyebrow:  'FIXEO',
      title:    'D\u00e9crivez votre besoin',
      subtitle: 'Un artisan disponible pr\u00e8s de chez vous vous r\u00e9pond rapidement'
    },
    'express': {
      eyebrow:  'URGENT',
      title:    'Intervention urgente \u26a1',
      subtitle: 'Fixeo trouve un artisan disponible maintenant dans votre ville'
    }
  };

  /* ── Render header with exactly one set of copy ──────────────
     Writes to .fxrmv3-mode, .fxrmv3-title, .fxrmv3-subtitle.
     Safe to call on every open — no duplication possible.
  ──────────────────────────────────────────────────────────── */
  function _renderHeader(modal, mode) {
    var copy = HEADER_COPY[mode] || HEADER_COPY['default'];
    var eyebrow  = _q('.fxrmv3-mode',     modal);
    var title    = _q('.fxrmv3-title',    modal);
    var subtitle = _q('.fxrmv3-subtitle', modal);
    if (eyebrow)  eyebrow.textContent  = copy.eyebrow;
    if (title)    title.textContent    = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
  }

  /* ── Scroll lock (iOS-safe) ──────────────────────────────────
     Saves scroll position, fixes body top to simulate lock.
     Restored exactly on close.
  ──────────────────────────────────────────────────────────── */
  function _lockScroll() {
    if (_locked) return;
    _locked  = true;
    _scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top      = '-' + _scrollY + 'px';
    document.body.style.width    = '100%';
    document.body.style.left     = '0';
  }

  function _unlockScroll() {
    if (!_locked) return;
    _locked = false;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.width    = '';
    document.body.style.left     = '';
    /* Remove ALL legacy scroll-lock classes */
    document.body.classList.remove('modal-open', 'fxmsf-locked');
    window.scrollTo(0, _scrollY);
  }

  /* ── Backdrop ────────────────────────────────────────────────
     #fxrmv3-backdrop is a dedicated element (not .modal-backdrop)
     so it never conflicts with other modals.
  ──────────────────────────────────────────────────────────── */
  function _getBackdrop() {
    if (_backdrop) return _backdrop;
    _backdrop = _el('fxrmv3-backdrop');
    if (!_backdrop) {
      _backdrop = document.createElement('div');
      _backdrop.id = 'fxrmv3-backdrop';
      document.body.insertBefore(_backdrop, document.body.firstChild);
    }
    return _backdrop;
  }

  function _showBackdrop() {
    var bd = _getBackdrop();
    bd.classList.add('fxrmv3-open');
    /* Tap backdrop to close */
    if (!bd._fxrmv3Bound) {
      bd._fxrmv3Bound = true;
      bd.addEventListener('click',    close);
      bd.addEventListener('touchend', close, { passive: true });
    }
  }

  function _hideBackdrop() {
    var bd = _getBackdrop();
    bd.classList.remove('fxrmv3-open');
  }

  /* Also dim the legacy .modal-backdrop so it doesn't double-show */
  function _syncLegacyBackdrop(show) {
    var legacy = _q('.modal-backdrop:not(#fxrmv3-backdrop)');
    if (legacy) legacy.classList.toggle('open', show);
  }

  /* ── Open ────────────────────────────────────────────────────
     Single entry point. Called by:
       FixeoClientRequest.open(trigger, forcedMode)
       window.openModal('request-modal')
       forceOpenRequestModal() shim (mobile nav)
  ──────────────────────────────────────────────────────────── */
  function open(trigger, forcedMode) {
    var modal = _el('request-modal');
    if (!modal) return;
    _modal = modal;

    var mode = _resolveMode(trigger, forcedMode);

    /* 1. Set mode attribute BEFORE adding .open — observers fire after */
    modal.setAttribute('data-request-mode', mode);

    /* 2. Render header copy exactly once */
    _renderHeader(modal, mode);

    /* 3. Remove stale RAFI injection so it re-injects fresh */
    modal.dataset.rfosInjected = '';
    var staleRafi = _q('.rfos-conv-header', modal);
    if (staleRafi) staleRafi.remove();

    /* 4. Show backdrop */
    _showBackdrop();
    _syncLegacyBackdrop(true);

    /* 5. Lock scroll */
    _lockScroll();

    /* 6. Show modal — triggers MutationObserver on .open → engines fire */
    modal.classList.add('open');

    /* 7. Focus management */
    requestAnimationFrame(function () {
      var first = _q('#request-problem, #express-request-problem, input, select', modal);
      if (first && typeof first.focus === 'function') first.focus();
    });
  }

  /* ── Close ───────────────────────────────────────────────────
     Single exit point. Replaces closeCoreModal, closeModal, all.
  ──────────────────────────────────────────────────────────── */
  function close() {
    var modal = _modal || _el('request-modal');
    if (!modal) return;

    /* 1. Remove open class → MutationObserver fires → RAFI ejects */
    modal.classList.remove('open');
    modal.removeAttribute('aria-hidden');

    /* 2. Hide backdrop */
    _hideBackdrop();
    _syncLegacyBackdrop(false);

    /* 3. Restore scroll (iOS-safe, also removes legacy classes) */
    _unlockScroll();

    /* 4. Reset inline styles set by forceOpenRequestModal */
    modal.style.display = '';
    modal.removeAttribute('hidden');
  }

  /* ── Close button wiring ─────────────────────────────────────
     Attaches close() to .fxrmv3-close inside the modal.
     Called once after DOM is ready.
  ──────────────────────────────────────────────────────────── */
  function _wireCloseButton() {
    var modal = _el('request-modal');
    if (!modal) return;
    var btn = _q('.fxrmv3-close', modal);
    if (!btn) return;
    if (btn._fxrmv3Bound) return;
    btn._fxrmv3Bound = true;

    function _doClose(e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    btn.addEventListener('click',    _doClose);
    btn.addEventListener('touchend', _doClose, { passive: false });
  }

  /* ── Escape key ─────────────────────────────────────────────── */
  function _wireEscape() {
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27)) {
        var modal = _el('request-modal');
        if (modal && modal.classList.contains('open')) close();
      }
    });
  }

  /* ── Patch FixeoClientRequest ────────────────────────────────
     Replace closeStandard with V3 close.
     Wrap open() to use V3 open.
     Keep all other methods (reset, storageKey, etc.) untouched.
  ──────────────────────────────────────────────────────────── */
  function _patchClientRequest() {
    var fc = window.FixeoClientRequest;
    if (!fc) {
      setTimeout(_patchClientRequest, 80);
      return;
    }
    if (fc._fxrmv3Patched) return;
    fc._fxrmv3Patched = true;

    /* Wrap open: call original (for form reset/prefill), then V3 lifecycle */
    var _origOpen = fc.open;
    fc.open = function (trigger, forcedMode) {
      /* Let request-form.js do its reset/copy/prefill logic */
      if (_origOpen) _origOpen.call(this, trigger, forcedMode);
      /* V3 owns the lifecycle from here */
      var mode = _resolveMode(trigger, forcedMode);
      _renderHeader(_el('request-modal'), mode);
      /* Scroll lock + backdrop already handled by open() above via openModal shim,
         but if request-form.js called window.openModal directly, we need to
         ensure backdrop/lock are set. */
      var modal = _el('request-modal');
      if (modal && modal.classList.contains('open')) {
        _showBackdrop();
        _syncLegacyBackdrop(true);
        _lockScroll();
      }
    };

    /* closeStandard → V3 close */
    fc.closeStandard = close;

    /* openExpress already patched by fixeo-express-route-shim.js
       (it calls fc.open(trigger,'express') which now goes through V3) */
  }

  /* ── Global shims ────────────────────────────────────────────
     Keeps window.openModal('request-modal') and closeModal() working
     for all callers: fixeo-header-global.js, estimation engine,
     header-unified.js, etc.
  ──────────────────────────────────────────────────────────── */
  function _shimGlobals() {
    /* openModal: intercept request-modal calls */
    var _origOpenModal = window.openModal;
    window.openModal = function (id) {
      if (id === 'request-modal') {
        open(null, null); /* mode from data-request-mode attr or 'default' */
        return;
      }
      if (_origOpenModal) _origOpenModal.call(this, id);
    };

    /* closeModal: intercept request-modal calls */
    var _origCloseModal = window.closeModal;
    window.closeModal = function (id) {
      if (id === 'request-modal') {
        close();
        return;
      }
      if (_origCloseModal) _origCloseModal.call(this, id);
    };

    /* forceOpenRequestModal: used by mobile nav inline script.
       Reroute to V3 open. */
    window.forceOpenRequestModal = function () {
      open(null, null);
    };
  }

  /* ── Boot ─────────────────────────────────────────────────── */
  function _init() {
    _wireCloseButton();
    _wireEscape();
    _patchClientRequest();
    _shimGlobals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  /* Expose public API */
  window.FixeoRequestModalV3 = {
    VERSION: 'fxrmv3-v1a',
    open:    open,
    close:   close
  };

})();
