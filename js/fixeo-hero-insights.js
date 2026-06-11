/**
 * FIXEO HERO INSIGHTS BAR — fxhi-v1a
 * =============================================
 * Renders a glass insight strip between the Hero QSM search card
 * and the city line. Purely perceptual — zero new logic.
 *
 * REUSES (never duplicates):
 *   window.FixeoAIRE.detect()          — category NLP (aire-v1a)
 *   window.FixeoAIRE.detectUrgency()   — urgency keywords
 *   window.FixeoAIRE.getArtisanCount() — real artisan pool count
 *   window.FixeoAIRE.getPrice()        — pricing estimation
 *
 * NEVER MODIFIES:
 *   smart-search.js, quick-search-modal.js, hero-search-v9.js,
 *   hero-search-modal.js, request-form.js, fixeo-ai-request-engine.js,
 *   Supabase schema, auth, dashboards, reservation, search results
 *
 * ONLY TWO VISIBLE CHANGES:
 *   1. #fxhi-bar appears/fades below the search card as user types
 *   2. #qsm-btn-search text node updates contextually
 *      (SVG icon preserved; aria-label updated too)
 *
 * TECHNIQUE:
 *   MutationObserver on #hero-quick-search (QSM injects dynamically).
 *   Once #qsm-input-nlp exists → wire 'input' listener.
 *   Insert #fxhi-bar after #hero-quick-search via parentNode.insertBefore.
 *   Idempotent: window.FixeoHeroInsights guard.
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoHeroInsights) return;
  var VERSION = 'fxhi-v1b';

  /* ══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */

  /* Default CTA label (shown when no category detected) */
  var CTA_DEFAULT = 'Trouver mon artisan maintenant';

  /* CTA label templates per category */
  var CTA_LABELS = {
    plomberie:    'Trouver mon plombier',
    electricite:  'Trouver mon électricien',
    serrurerie:   'Trouver mon serrurier',
    climatisation:'Trouver mon technicien clim',
    menuiserie:   'Trouver mon menuisier',
    peinture:     'Trouver mon peintre',
    maconnerie:   'Trouver mon maçon',
    nettoyage:    'Trouver mon agent de nettoyage',
    carrelage:    'Trouver mon carreleur',
    jardinage:    'Trouver mon jardinier',
    bricolage:    'Trouver un bricoleur',
    demenagement: 'Trouver un déménageur'
  };
  var CTA_URGENT = '⚡ Trouver un artisan maintenant';

  /* Category icons (matches QSM + aire-v1a) */
  var CAT_ICONS = {
    plomberie:    '🔧',
    electricite:  '⚡',
    serrurerie:   '🔑',
    climatisation:'❄️',
    menuiserie:   '🪵',
    peinture:     '🎨',
    maconnerie:   '🧱',
    nettoyage:    '🧹',
    carrelage:    '🏁',
    jardinage:    '🌿',
    bricolage:    '🔩',
    demenagement: '🚛'
  };

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  var _state = {
    wired: false,
    category: null,
    isUrgent: false,
    city: null
  };

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _el(id) { return document.getElementById(id); }

  /* Get current city (QSM city select is the authoritative hero source) */
  function _getCity() {
    var sel = _el('qsm-select-city');
    if (sel && sel.value) return sel.value;
    /* Fall back to aire-v1a's detected city */
    try {
      var heroCityEl = _el('hero-city-label');
      if (heroCityEl) {
        var txt = heroCityEl.textContent.trim();
        if (txt && !txt.includes('Détect') && !txt.includes('…')) return txt;
      }
      return localStorage.getItem('fixeo_detected_city') || null;
    } catch(e) { return null; }
  }

  /* ══════════════════════════════════════════════════════════
     DOM — build and insert #fxhi-bar
  ══════════════════════════════════════════════════════════ */
  function _ensureBar() {
    if (_el('fxhi-bar')) return _el('fxhi-bar');

    var bar = document.createElement('div');
    bar.id = 'fxhi-bar';
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Analyse intelligente de votre demande');
    bar.innerHTML = '<div class="fxhi-pills" id="fxhi-pills"></div>';

    /* Insert inside .qsm-search-section, after .qsm-bar-card,
       before .qsm-service-suggestions (the QSM suggestion chips).
       This places the bar: problem → city → CTA → [bar] → suggestion pills */
    var qsmHost = _el('hero-quick-search');
    if (!qsmHost) return null;

    var searchSection = qsmHost.querySelector('.qsm-search-section');
    var suggPills     = searchSection && searchSection.querySelector('.qsm-service-suggestions');

    if (searchSection && suggPills) {
      /* Between .qsm-bar-card and .qsm-service-suggestions */
      searchSection.insertBefore(bar, suggPills);
    } else if (searchSection) {
      /* Fallback: append at end of .qsm-search-section */
      searchSection.appendChild(bar);
    } else {
      /* Last fallback: after #hero-quick-search in parent */
      qsmHost.parentNode.insertBefore(bar, qsmHost.nextSibling);
    }

    return bar;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER — update bar content based on analysis
  ══════════════════════════════════════════════════════════ */
  function _renderBar(category, isUrgent, city) {
    var bar = _el('fxhi-bar');
    if (!bar) return;
    var pills = _el('fxhi-pills');
    if (!pills) return;

    var html = '';
    var hasPills = false;

    /* Pill 1: Category */
    if (category) {
      var icon = CAT_ICONS[category.cat] || '🛠️';
      html += '<div class="fxhi-pill fxhi-pill-category">'
        + '<span class="fxhi-pill-icon">' + icon + '</span>'
        + '<span>' + _escHtml(category.label) + '</span>'
        + '<span class="fxhi-pill-label">détectée</span>'
        + '</div>';
      hasPills = true;
    }

    /* Pill 2: Count or urgency */
    if (isUrgent) {
      html += '<div class="fxhi-pill fxhi-pill-urgent">'
        + '<span>⚡</span>'
        + '<span>Intervention urgente</span>'
        + '</div>';
      hasPills = true;
    } else if (category) {
      var count = null;
      try {
        count = window.FixeoAIRE ? window.FixeoAIRE.getArtisanCount(category.cat, city) : null;
      } catch(e) {}

      if (count !== null && count > 0) {
        var cityTxt = city ? ' à ' + city : '';
        html += '<div class="fxhi-pill fxhi-pill-count">'
          + '<span>✓</span>'
          + '<span class="fxhi-pill-value">' + count + ' artisan' + (count > 1 ? 's' : '') + '</span>'
          + '<span style="opacity:.5;font-weight:400">' + _escHtml(cityTxt) + '</span>'
          + '</div>';
      } else if (category) {
        html += '<div class="fxhi-pill fxhi-pill-count">'
          + '<span>✓</span>'
          + '<span>Artisans disponibles</span>'
          + '</div>';
      }
      hasPills = true;
    }

    /* Pill 3: Price */
    if (category && !isUrgent) {
      var range = null;
      try {
        range = window.FixeoAIRE ? window.FixeoAIRE.getPrice(category.cat) : null;
      } catch(e) {}

      if (range) {
        html += '<div class="fxhi-pill fxhi-pill-price">'
          + '<span>💰</span>'
          + '<span class="fxhi-pill-range">' + _escHtml(range) + '</span>'
          + '</div>';
        hasPills = true;
      }
    }

    pills.innerHTML = html;

    /* Show or hide bar */
    if (hasPills) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  /* ══════════════════════════════════════════════════════════
     CTA LABEL UPDATE
  ══════════════════════════════════════════════════════════ */
  function _updateCTA(category, isUrgent) {
    var btn = _el('qsm-btn-search');
    if (!btn) return;

    var label;
    if (isUrgent) {
      label = CTA_URGENT;
    } else if (category && CTA_LABELS[category.cat]) {
      label = CTA_LABELS[category.cat];
    } else if (category) {
      label = 'Trouver mon artisan';
    } else {
      label = CTA_DEFAULT;
    }

    /* Update text node only — keep the SVG icon intact */
    var nodes = btn.childNodes;
    var textNodeFound = false;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.nodeType === 3 /* TEXT_NODE */ && node.textContent.trim().length > 0) {
        node.textContent = '\n        ' + label + '\n      ';
        textNodeFound = true;
        break;
      }
    }
    /* If no text node found (first run or re-render), append one */
    if (!textNodeFound) {
      var tn = document.createTextNode('\n        ' + label + '\n      ');
      btn.appendChild(tn);
    }

    /* Update aria-label too */
    btn.setAttribute('aria-label', label.replace('⚡ ', ''));
  }

  /* ══════════════════════════════════════════════════════════
     ANALYSIS — called on every input event
  ══════════════════════════════════════════════════════════ */
  function _analyze(text) {
    /* Delegate detection to aire-v1a — never duplicate logic */
    if (!window.FixeoAIRE) return;

    var category = window.FixeoAIRE.detect(text);
    var isUrgent = window.FixeoAIRE.detectUrgency(text, category);
    var city     = _getCity();

    _state.category = category;
    _state.isUrgent = isUrgent;
    _state.city     = city;

    if (!text || text.length < 2) {
      /* Input cleared — hide bar, reset CTA */
      var bar = _el('fxhi-bar');
      if (bar) bar.classList.remove('visible');
      _updateCTA(null, false);
      return;
    }

    _renderBar(category, isUrgent, city);
    _updateCTA(category, isUrgent);
  }

  /* ══════════════════════════════════════════════════════════
     WIRE INPUT
     Called once #qsm-input-nlp exists in the DOM.
  ══════════════════════════════════════════════════════════ */
  function _wireInput() {
    if (_state.wired) return;

    var input = _el('qsm-input-nlp');
    if (!input) return;

    _state.wired = true;

    /* Ensure bar exists in DOM */
    _ensureBar();

    /* Listen for input events */
    input.addEventListener('input', function() {
      _analyze(this.value.trim());
    });

    /* Also watch city select — refresh count/city chip when city changes */
    var citySelect = _el('qsm-select-city');
    if (citySelect) {
      citySelect.addEventListener('change', function() {
        _state.city = this.value;
        if (input.value.trim().length >= 2) {
          _analyze(input.value.trim());
        }
      });
    }

    /* If already has a value on wire (e.g. browser auto-fill) */
    if (input.value.trim().length >= 2) {
      _analyze(input.value.trim());
    }

    console.log('[FixeoHeroInsights] ' + VERSION + ' wired to #qsm-input-nlp');
  }

  /* ══════════════════════════════════════════════════════════
     WAIT FOR QSM TO INJECT #qsm-input-nlp
     The QSM renders hero-quick-search dynamically after DOM ready.
     Use MutationObserver to detect when the input appears.
  ══════════════════════════════════════════════════════════ */
  function _watchForInput() {
    /* If already in DOM */
    if (_el('qsm-input-nlp')) {
      _wireInput();
      return;
    }

    /* Observe #hero-quick-search for childList changes */
    var qsm = _el('hero-quick-search');
    if (!qsm) {
      /* hero-quick-search not yet in DOM — retry shortly */
      setTimeout(_watchForInput, 200);
      return;
    }

    var observer = new MutationObserver(function(mutations) {
      if (_el('qsm-input-nlp')) {
        observer.disconnect();
        _wireInput();
      }
    });
    observer.observe(qsm, { childList: true, subtree: true });

    /* Fallback: poll for up to 5 seconds in case MutationObserver misses */
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (_el('qsm-input-nlp') && !_state.wired) {
        clearInterval(poll);
        _wireInput();
      }
      if (attempts > 25) clearInterval(poll);
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════
     AIRE DEPENDENCY WAIT
     aire-v1a loads deferred — wait for it before initialising.
  ══════════════════════════════════════════════════════════ */
  function _waitForAIRE() {
    if (window.FixeoAIRE) {
      _watchForInput();
      return;
    }
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (window.FixeoAIRE) {
        clearInterval(poll);
        _watchForInput();
      }
      if (attempts > 30) {
        /* Give up waiting for AIRE — still wire input, analysis will skip gracefully */
        clearInterval(poll);
        console.warn('[FixeoHeroInsights] FixeoAIRE not found — insights disabled');
        _watchForInput();
      }
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════
     UTILITY
  ══════════════════════════════════════════════════════════ */
  function _escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function _init() {
    _waitForAIRE();
    console.log('[FixeoHeroInsights] Hero Insights ' + VERSION + ' init');
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoHeroInsights = {
    VERSION: VERSION,
    analyze: _analyze
  };

  /* Boot after DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
