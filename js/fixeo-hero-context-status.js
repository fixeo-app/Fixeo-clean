/**
 * fixeo-hero-context-status.js — fxhcs-v1.3
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
 *   2. If city known → shows "📍 Vous semblez être à [City] · Modifier"
 *                            "Artisans à proximité en priorité."
 *   3. If city unknown → shows "📍 Détection de votre position…" with gentle pulse
 *   4. Polls at 800ms intervals for up to 8s in case city resolves late
 *   5. Also watches #hero-city-label via MutationObserver (same as AIRE)
 *   6. If city never resolves → stays on neutral detecting message
 *
 * "Modifier" action (v1.3):
 *   - Scrolls #hero-quick-search into view (smooth)
 *   - Focuses #qsm-select-city after 320ms (scroll landing time)
 *   - Opens native city picker on mobile; dropdown on desktop
 *   - Does NOT open the RAFI V5 modal
 *   - Does NOT touch QSM, V5, or any frozen file
 *   - Handled by a delegated listener on #fxhcs-line (data-fxhcs-action="modify-city")
 *
 * CLS: element reserved with min-height at parse time (CSS).
 *      Text is filled in, never causes layout shift.
 *
 * Namespace: fxhcs-*
 * Version: fxhcs-v1.4
 */
(function () {
  'use strict';

  if (window._fxhcsLoaded) return;
  window._fxhcsLoaded = true;

  /* ── City name sanitizer ────────────────────────────────────── */
  /*
   * AIRE's _watchHeroCity() stores #hero-city-label's full textContent
   * directly into localStorage['fixeo_detected_city'].
   * _setLabel() writes decorated strings like:
   *   "📍 Fès détectée · Modifier"
   *   "📍 Fès — Agdal détecté · Modifier"
   *   "📍 Choisir une ville"
   *   "📍 Résultats autour de vous · Modifier"
   *   "Détection de votre ville…"
   *
   * We must strip decoration to extract the bare city name before
   * rendering it inside .fxhcs-city — otherwise the full label,
   * including "· Modifier", bleeds into the rendered output and
   * produces a duplicate "Modifier".
   *
   * Strategy: strip pin emoji prefix, cut at "·", cut at " —",
   * strip known non-city suffixes, trim. Return null if not a
   * recognisable Moroccan city name (prevents "Résultats autour…").
   */
  function _sanitizeCity(raw) {
    if (!raw) return null;
    var s = raw.trim();
    /* Strip pin emoji prefix (📍 + optional space) */
    s = s.replace(/^\uD83D\uDCCD\s*/u, '');
    /* Cut everything from · onwards (strips "· Modifier", "· district") */
    var dotIdx = s.indexOf('\u00b7');
    if (dotIdx >= 0) s = s.slice(0, dotIdx);
    /* Cut everything from " — " onwards (strips district suffix) */
    var dashIdx = s.indexOf(' \u2014 ');
    if (dashIdx >= 0) s = s.slice(0, dashIdx);
    /* Strip known suffix words that appear without · separator */
    s = s.replace(/\s+d\u00e9tect\u00e9e?\s*$/i, '');
    s = s.trim();
    /* Reject non-city values — detecting/placeholder/generic strings */
    if (!s) return null;
    if (s.indexOf('D\u00e9tect') === 0) return null;  /* "Détection de…" */
    if (s.indexOf('Choisir') >= 0) return null;        /* "Choisir une ville" */
    if (s.indexOf('Autour') >= 0) return null;         /* case-variant */
    if (s.indexOf('autour') >= 0) return null;         /* "Résultats autour de vous" */
    if (s.indexOf('R\u00e9sultats') >= 0) return null; /* "Résultats…" */
    if (s.length < 2) return null;
    return s;
  }

  /* ── City reader ─────────────────────────────────────────────── */
  /*
   * Reads from localStorage (path 1) and #hero-city-label (path 2).
   * Both values may be AIRE's decorated labels — sanitized before return.
   * Path 1 (localStorage) is tried first as the authoritative cache.
   * Path 2 (#hero-city-label) is the live DOM element, always sanitized.
   */
  function _readCity() {
    try {
      /* 1. localStorage — written by AIRE's _watchHeroCity() */
      var ls = localStorage.getItem('fixeo_detected_city');
      if (ls) {
        var clean1 = _sanitizeCity(ls);
        if (clean1) return clean1;
      }
    } catch (_) {}
    try {
      /* 2. #hero-city-label — live DOM, AIRE-written */
      var el = document.getElementById('hero-city-label');
      if (el) {
        var clean2 = _sanitizeCity(el.textContent);
        if (clean2) return clean2;
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
       * "Modifier" uses data-fxhcs-action="modify-city" — handled by
       * the delegated listener below. No data-open-request-form.
       * No V5 modal. No QSM internals. One button, exactly once.
       */
      line.innerHTML =
        '<span class="fxhcs-primary">' +
          '<span class="fxhcs-icon" aria-hidden="true">\uD83D\uDCCD</span>' +
          'Vous semblez \u00eatre \u00e0\u00a0' +
          '<span class="fxhcs-city">' + _esc(city) + '</span>' +
          '<span class="fxhcs-sep" aria-hidden="true">\u00a0\u00b7\u00a0</span>' +
          '<button class="fxhcs-modifier" type="button"' +
            ' data-fxhcs-action="modify-city"' +
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

  /* ── "Modifier" action — scroll to city selector ────────────── */
  /*
   * Delegated listener on #fxhcs-line.
   * Intercepts clicks on [data-fxhcs-action="modify-city"].
   * Behaviour:
   *   1. scrollIntoView on #hero-quick-search (smooth, center)
   *   2. 320ms later: focus #qsm-select-city
   *      → mobile: opens native system city picker
   *      → desktop: opens <select> dropdown
   *      → city already pre-selected (QSM seeds from localStorage on load)
   * Does NOT open V5 modal. Does NOT call QuickSearchModal internals.
   * Does NOT modify QSM, V5, RAFI OS, or any frozen file.
   */
  function _wireModifier(line) {
    line.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-fxhcs-action="modify-city"]');
      if (!btn) return;
      e.preventDefault();
      var searchBox = document.getElementById('hero-quick-search');
      if (searchBox) {
        searchBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      /* 320ms: scroll landing time before focus */
      setTimeout(function () {
        var citySelect = document.getElementById('qsm-select-city');
        if (citySelect) citySelect.focus();
      }, 320);
    });
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

      /* Wire modifier action (once, delegated on the container) */
      _wireModifier(line);

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
