/**
 * fixeo-hero-context-status.js — fxhcs-v1
 * RAFI Hero — Persistent context status line
 *
 * Shows what FIXEO currently knows about the user's location.
 * Presentation layer only. Zero business logic. Zero API calls.
 * Reads only from existing state already available in the application:
 *   - localStorage['fixeo_detected_city'] — authoritative city signal
 *   - #hero-city-label textContent — AIRE-updated DOM element
 *
 * Behaviour:
 *   1. At init: reads city from localStorage or #hero-city-label
 *   2. If city known → shows "📍 Vous semblez être à [City]. Artisans à proximité en priorité."
 *   3. If city unknown → shows "📍 Détection de votre position…" with gentle pulse
 *   4. Polls at 800ms intervals for up to 8s in case city resolves late
 *   5. Also watches #hero-city-label via MutationObserver (same as AIRE)
 *   6. If city never resolves → stays on neutral detecting message
 *
 * CLS: element reserved with min-height at parse time (CSS).
 *      Text is filled in, never causes layout shift.
 *
 * Namespace: fxhcs-*
 * Version: fxhcs-v1
 */
(function () {
  'use strict';

  if (window._fxhcsLoaded) return;
  window._fxhcsLoaded = true;

  /* ── City reader — mirrors AIRE's _getCity() ──────────────── */
  function _readCity() {
    try {
      /* 1. localStorage — authoritative cache (written by AIRE) */
      var ls = localStorage.getItem('fixeo_detected_city');
      if (ls && ls.length > 1) return ls;
    } catch (_) {}
    try {
      /* 2. #hero-city-label DOM element (AIRE-written, RAFI reads this) */
      var el = document.getElementById('hero-city-label');
      if (el) {
        var txt = (el.textContent || '').trim();
        if (txt && txt.indexOf('D\u00e9tect') < 0 && txt.indexOf('\u2026') < 0 && txt.length > 1) {
          return txt;
        }
      }
    } catch (_) {}
    return null;
  }

  /* ── Get the pre-inserted status line element ─────────────── */
  /* #fxhcs-line is in the HTML source (zero CLS). We just fill it. */
  function _getLine() {
    return document.getElementById('fxhcs-line');
  }

  /* ── Wait for RAFI OS to have mounted its stage ─────────────── */
  /* We don't insert the element — it's already in the DOM.
     We do wait for .rfos-stage-wrap to exist before rendering,
     to ensure RAFI OS has initialised and the hero is stable. */
  function _insertLine(line) {
    if (!line) return false;
    /* rfos-stage-wrap existence confirms RAFI OS has mounted */
    var stage = document.querySelector('.hero-content .rfos-stage-wrap');
    return !!stage; /* true = ready to render; false = not yet mounted */
  }

  /* ── Render status text ─────────────────────────────────────── */
  function _render(line, city) {
    line.classList.remove('fxhcs-detecting', 'fxhcs-known');

    if (city) {
      line.classList.add('fxhcs-known');
      /*
       * Two-line composition:
       *   Primary:   📍 Vous semblez être à [City] · Modifier
       *   Secondary: Artisans à proximité en priorité.
       *
       * "Modifier" opens V5 standard flow — picked up by the global
       * capture handler (data-open-request-form). No new JS.
       */
      line.innerHTML =
        '<span class="fxhcs-primary">' +
          '<span class="fxhcs-icon" aria-hidden="true">\uD83D\uDCCD</span>' +
          'Vous semblez \u00eatre \u00e0\u00a0' +
          '<span class="fxhcs-city">' + _esc(city) + '</span>' +
          '<span class="fxhcs-sep" aria-hidden="true">\u00a0\u00b7\u00a0</span>' +
          '<button class="fxhcs-modifier" type="button"' +
            ' data-open-request-form="true" data-request-mode="default"' +
            ' aria-label="Modifier ma ville">' +
            'Modifier' +
          '</button>' +
        '</span>' +
        '<span class="fxhcs-secondary">' +
          'Artisans \u00e0 proximit\u00e9 en priorit\u00e9.' +
        '</span>';
    } else {
      line.classList.add('fxhcs-detecting');
      /*
       * Single line: detecting state — no city, no modifier.
       */
      line.innerHTML =
        '<span class="fxhcs-primary">' +
          '<span class="fxhcs-icon" aria-hidden="true">\uD83D\uDCCD</span>' +
          'D\u00e9tection de votre position\u2026' +
        '</span>';
    }
  }

  /* ── HTML escape (city name from localStorage — safe, but defensive) ── */
  function _esc(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Main init — waits for RAFI OS to mount stage ─────────── */
  function _init() {
    var line = _getLine();
    var inserted = false;
    var pollCount = 0;
    var MAX_POLLS = 25; /* 25 × 320ms = 8s max wait for RAFI OS mount */

    /* City poll: checks at 800ms intervals for up to 8s */
    var cityPollCount = 0;
    var MAX_CITY_POLLS = 10; /* 10 × 800ms = 8s */
    var cityPollTimer = null;

    /* ── MutationObserver on #hero-city-label ── */
    var cityObserver = null;
    function _observeCityLabel() {
      var cityEl = document.getElementById('hero-city-label');
      if (!cityEl || cityObserver) return;
      cityObserver = new MutationObserver(function () {
        var city = _readCity();
        if (city) {
          _render(line, city);
          if (cityPollTimer) { clearInterval(cityPollTimer); cityPollTimer = null; }
          if (cityObserver) { cityObserver.disconnect(); cityObserver = null; }
        }
      });
      cityObserver.observe(cityEl, { childList: true, characterData: true, subtree: true });
    }

    /* ── Stage insertion poll ── */
    function _tryInsert() {
      pollCount++;
      inserted = _insertLine(line);

      if (!inserted) {
        if (pollCount < MAX_POLLS) {
          setTimeout(_tryInsert, 320);
        }
        /* Give up silently after MAX_POLLS — no console spam in prod */
        return;
      }

      /* Inserted — render initial state */
      var city = _readCity();
      _render(line, city);

      /* Reveal with fade */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          line.classList.add('fxhcs-ready');
        });
      });

      /* Start observing city label for late resolution */
      _observeCityLabel();

      /* If no city yet, also poll localStorage at 800ms intervals */
      if (!city) {
        cityPollTimer = setInterval(function () {
          cityPollCount++;
          var resolved = _readCity();
          if (resolved) {
            _render(line, resolved);
            clearInterval(cityPollTimer);
            cityPollTimer = null;
            if (cityObserver) { cityObserver.disconnect(); cityObserver = null; }
            return;
          }
          if (cityPollCount >= MAX_CITY_POLLS) {
            clearInterval(cityPollTimer);
            cityPollTimer = null;
            /* City never resolved — detecting message stays, no error */
          }
        }, 800);
      }
    }

    /* Start polling for stage mount */
    _tryInsert();
  }

  /* ── Entry point ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    /* DOM already ready (deferred script) */
    _init();
  }

})();
