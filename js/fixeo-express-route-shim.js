/**
 * fixeo-express-route-shim.js — fxrs-v1a
 *
 * ROOT CAUSE FIX: request-form.js contains two IIFEs.
 * IIFE 2 (legacy express booking) runs last on DOMContentLoaded and
 * OVERWRITES FixeoClientRequest.openExpress → openExpressModal(),
 * which opens the legacy #express-modal (NOT #request-modal).
 * This prevents rmv2 / fuv3-v1a / fuv3-v1b observers from ever firing.
 *
 * SHIM: Re-routes openExpress to use IIFE 1's openRequestModal()
 * (exposed as FixeoClientRequest.open) with forcedMode='express',
 * which opens #request-modal with data-request-mode='express'
 * → triggers rmv2@30ms → fuv3-v1a@60ms → fuv3-v1b@90ms → faee@120ms.
 *
 * NEVER TOUCHES: request-form.js, rmv2, fuv3, faee, admin, dispatch
 * Version: fxrs-v1a — 2026-06-12
 */
(function () {
  'use strict';

  if (window._fxExpressShimLoaded) return;
  window._fxExpressShimLoaded = true;

  function _patch() {
    var fc = window.FixeoClientRequest;
    if (!fc || typeof fc.open !== 'function') {
      /* request-form.js IIFE 1 not ready yet — retry once */
      setTimeout(_patch, 80);
      return;
    }

    /* Re-assert correct openExpress (IIFE 1 path → #request-modal) */
    fc.openExpress = function (trigger) {
      fc.open(trigger, 'express');
    };
  }

  /* Run after DOMContentLoaded so both IIFEs in request-form.js have fired */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patch, { once: true });
  } else {
    _patch();
  }

  window.FixeoExpressShim = { VERSION: 'fxrs-v1b' };
})();

/* ── iOS body scroll lock for #request-modal ── */
(function () {
  'use strict';
  var _scrollY = 0;
  var _locked  = false;

  function _lock() {
    if (_locked) return;
    _locked  = true;
    _scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('fxmsf-locked');
    document.body.style.top = '-' + _scrollY + 'px';
  }

  function _unlock() {
    if (!_locked) return;
    _locked = false;
    document.body.classList.remove('fxmsf-locked');
    document.body.style.top = '';
    document.body.style.overflow = '';
    window.scrollTo(0, _scrollY);
  }

  function _init() {
    var modal = document.getElementById('request-modal');
    if (!modal) return;

    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName !== 'class') return;
        if (modal.classList.contains('open')) {
          _lock();
        } else {
          _unlock();
        }
      });
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }
})();
