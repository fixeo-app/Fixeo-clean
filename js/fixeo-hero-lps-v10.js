/**
 * fixeo-hero-lps-v10.js  v=lps2
 * FIXEO LIVE PERCEPTION SYSTEM — Homepage Hero V10
 *
 * 1. Rotating platform signals (opacity crossfade, no fake numbers)
 * 2. Smart search placeholder rotation — H-INTEL upgrade
 *    - 18 human/real/contextual problems
 *    - Mix: urgent | home | local | availability intent
 *    - Smooth opacity fade via CSS class toggle
 *    - Slow 4.8s cycle — comfortable reading time
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

  /* ── H-INTEL: Intelligent placeholders ───────────────────────────── */
  /* 18 entries — mix of urgency, home, local, everyday Moroccan reality */
  /* No raw U+2019 in strings — all apostrophes are standard or escaped  */
  var PLACEHOLDERS = [
    /* Urgent breakdowns */
    'Fuite sous l\u2019\u00e9vier\u2026',
    'Prise \u00e9lectrique qui ne fonctionne plus\u2026',
    'Climatisation qui ne refroidit plus\u2026',
    'Canalisation bouch\u00e9e\u2026',
    'Chauffe-eau en panne\u2026',
    'Court-circuit dans l\u2019appartement\u2026',

    /* Home improvement */
    'Repeindre le salon\u2026',
    'Installer une TV murale\u2026',
    'R\u00e9parer une serrure bloqu\u00e9e\u2026',
    'Poser du carrelage dans la cuisine\u2026',
    'Changer les joints de la salle de bain\u2026',

    /* Natural local intent */
    '\u00c9lectricien disponible aujourd\u2019hui\u2026',
    'Plombier urgent \u00e0 Casablanca\u2026',
    'Artisan disponible \u00e0 Rabat\u2026',
    'R\u00e9paration climatisation \u00e0 Marrakech\u2026',

    /* Everyday household situations */
    'Volet roulant bloqu\u00e9\u2026',
    'Robinet qui goutte\u2026',
    'Installation de box internet\u2026'
  ];

  var FADE_MS        = 400;   /* placeholder opacity-out duration (ms) */
  var SIGNAL_MS      = 4200;  /* signal hold time */
  var PLACEHOLDER_MS = 4800;  /* placeholder rotation interval — slow enough to read */
  var PH_BLANK_MS    = 180;   /* blank gap between old/new placeholder text */

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

    if (_reducedMotion) return;

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

  /* ── H-INTEL: Smart placeholder rotator ─────────────────────────── */
  function initPlaceholders() {
    if (_reducedMotion) return;

    var attempts   = 0;
    var maxAttempts = 20;

    function tryPatch() {
      var host  = document.getElementById('hero-quick-search');
      if (!host) return;
      var input = host.querySelector('input[type="text"], input[type="search"], input:not([type="hidden"])');
      if (!input) {
        if (++attempts < maxAttempts) setTimeout(tryPatch, 300);
        return;
      }

      /* Shuffle to avoid always starting at index 0 on every visit */
      var startIdx = Math.floor(Math.random() * PLACEHOLDERS.length);
      var idx      = startIdx;

      var _focused = false;
      input.addEventListener('focus', function () { _focused = true; });
      input.addEventListener('blur',  function () { _focused = false; });

      /* Set initial placeholder */
      if (!input.value) {
        input.placeholder = PLACEHOLDERS[idx];
      }

      function rotatePlaceholder() {
        if (_focused || input.value) return;

        /* 1. Fade out: add CSS class that sets opacity:0 on the input  */
        input.classList.add('fxph-fade');

        /* 2. After fade-out, swap placeholder text */
        setTimeout(function () {
          if (_focused || input.value) {
            input.classList.remove('fxph-fade');
            return;
          }
          idx = (idx + 1) % PLACEHOLDERS.length;
          input.placeholder = PLACEHOLDERS[idx];

          /* Small blank gap so browser re-renders new placeholder */
          setTimeout(function () {
            input.classList.remove('fxph-fade');
          }, PH_BLANK_MS);
        }, FADE_MS);
      }

      setInterval(rotatePlaceholder, PLACEHOLDER_MS);
    }

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
