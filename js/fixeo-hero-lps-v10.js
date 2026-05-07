/**
 * fixeo-hero-lps-v10.js
 * FIXEO LIVE PERCEPTION SYSTEM — Homepage Hero V10
 *
 * 1. Rotating platform signals (opacity crossfade, no fake numbers)
 * 2. Smart search placeholder rotation (slow, elegant)
 *
 * CONSTRAINTS:
 * - Zero Supabase. Zero fetch. Zero fake metrics.
 * - Pure cosmetic. Idempotent. No side effects.
 * - Respects prefers-reduced-motion.
 * - Does NOT touch search logic, modal, auth, routing.
 */
(function () {
  'use strict';

  if (window._fxLpsLoaded) return;
  window._fxLpsLoaded = true;

  /* ── Platform signals ─────────────────────────────────────────────── */
  var SIGNALS = [
    'Activit\u00e9 dans 12 villes du Maroc',
    'Artisans disponibles selon votre zone',
    'Demandes distribu\u00e9es rapidement',
    'Des artisans rejoignent Fixeo chaque semaine',
    'Mise en relation en quelques minutes',
    'R\u00e9seau actif partout au Maroc'
  ];

  /* ── Smart placeholders ───────────────────────────────────────────── */
  var PLACEHOLDERS = [
    'Plombier \u00e0 Casablanca\u2026',
    '\u00c9lectricien \u00e0 F\u00e8s\u2026',
    'Climatisation \u00e0 Rabat\u2026',
    'Menuisier \u00e0 Tanger\u2026',
    'Peintre \u00e0 Marrakech\u2026',
    'Serrurier \u00e0 Agadir\u2026',
    'Plombier \u00e0 Casablanca\u2026'
  ];

  var FADE_MS     = 450;   /* crossfade duration */
  var SIGNAL_MS   = 4200;  /* signal hold time */
  var PLACEHOLDER_MS = 3800;

  var _reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  /* ── Signal rotator ──────────────────────────────────────────────── */
  function initSignals() {
    var el = document.getElementById('fxlps-text');
    if (!el) return;

    var idx = 0;
    el.textContent = SIGNALS[idx];
    el.classList.add('fxlps-fade-in');

    if (_reducedMotion) return; /* show first signal only */

    function next() {
      el.classList.remove('fxlps-fade-in');
      el.classList.add('fxlps-fade-out');

      setTimeout(function () {
        idx = (idx + 1) % SIGNALS.length;
        el.textContent = SIGNALS[idx];
        el.classList.remove('fxlps-fade-out');
        el.classList.add('fxlps-fade-in');
      }, FADE_MS);
    }

    setInterval(next, SIGNAL_MS);
  }

  /* ── Smart placeholder rotator ───────────────────────────────────── */
  function initPlaceholders() {
    if (_reducedMotion) return;

    /* The quick search renders inside #hero-quick-search.
       We wait for QSM to render, then patch the input. */
    var attempts = 0;
    var maxAttempts = 20;

    function tryPatch() {
      /* QSM renders an <input> inside #hero-quick-search */
      var host  = document.getElementById('hero-quick-search');
      if (!host) return;
      var input = host.querySelector('input[type="text"], input[type="search"], input:not([type="hidden"])');
      if (!input) {
        if (++attempts < maxAttempts) setTimeout(tryPatch, 300);
        return;
      }

      var idx = 0;
      /* Only rotate when input is empty and not focused */
      var _focused = false;
      input.addEventListener('focus', function () { _focused = true; });
      input.addEventListener('blur',  function () { _focused = false; });

      /* Set initial placeholder without overriding existing one if set */
      if (!input.value && !input.placeholder) {
        input.placeholder = PLACEHOLDERS[0];
      }

      function rotatePlaceholder() {
        if (_focused || input.value) return; /* user is typing */
        idx = (idx + 1) % PLACEHOLDERS.length;
        /* Soft transition: clear then set after short delay */
        input.placeholder = '';
        setTimeout(function () {
          if (!_focused && !input.value) {
            input.placeholder = PLACEHOLDERS[idx];
          }
        }, 180);
      }

      setInterval(rotatePlaceholder, PLACEHOLDER_MS);
    }

    /* Wait for DOMContentLoaded then poll for QSM input */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(tryPatch, 600);
      }, { once: true });
    } else {
      setTimeout(tryPatch, 600);
    }
  }

  /* ── Bootstrap ───────────────────────────────────────────────────── */
  function init() {
    initSignals();
    initPlaceholders();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
