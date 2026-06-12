/**
 * FIXEO Hero Dynamic Suggestions V2 — fxhsv2-v1a
 * ====================================================
 * Replaces static QSM suggestion chips with a dynamic,
 * time-aware, demand-aware, session-rotating set.
 *
 * SURFACES:
 *   .qsm-service-suggestions  ← inner HTML replaced (chip content only)
 *   .qsm-suggestions-label    ← text node replaced with contextual label
 *
 * NEVER MODIFIES:
 *   quick-search-modal.js, fixeo-hero-insights.js,
 *   fixeo-ai-request-engine.js, request-form.js, reservation.js
 *
 * CHIP CLICK CHAIN:
 *   1. Fill #qsm-input-nlp
 *   2. dispatch 'input' event  → triggers Hero Insights (fxhi-v1c)
 *   3. dispatch 'change' event → triggers any remaining listeners
 *   4. focus input             → triggers fxlps-v10 pause
 *   (FAEE V2 listens to 'input' event on #qsm-input-nlp — auto-triggered by step 2)
 *
 * PRIORITY STACK:
 *   Layer 1 (40pts)  — Time tier (hour of day)
 *   Layer 2 (40pts)  — Demand-aware (localStorage 'fixeo_client_requests')
 *   Layer 3 (20pts)  — Session rotation (sessionStorage 'fxhsv2_seen')
 *
 * ZERO Supabase queries. Zero polling. Zero typing latency.
 *
 * Version: fxhsv2-v1a
 */

(function (window, document) {
  'use strict';

  if (window._fxHsv2Loaded) return;
  window._fxHsv2Loaded = true;

  var VERSION = 'fxhsv2-v1a';

  /* ══════════════════════════════════════════════════════════
     CHIP POOL — all available chips across all categories
     Format: { text, cat, tier, urgent, emoji }
     tier: 'morning' | 'afternoon' | 'evening' | 'night' | 'all'
  ══════════════════════════════════════════════════════════ */

  var CHIP_POOL = [
    /* ── Morning tier (6–11h) ── */
    { text: 'Chauffe-eau en panne',        cat: 'plomberie',     tier: 'morning',   emoji: '🚿' },
    { text: 'Fuite cuisine',               cat: 'plomberie',     tier: 'morning',   emoji: '🔧' },
    { text: 'WC bouché',                   cat: 'plomberie',     tier: 'morning',   emoji: '🚽' },
    { text: 'Chauffage en panne',          cat: 'plomberie',     tier: 'morning',   emoji: '🌡️' },

    /* ── Afternoon tier (11–18h) ── */
    { text: 'Climatisation en panne',      cat: 'climatisation', tier: 'afternoon', emoji: '❄️' },
    { text: 'Panne électrique',            cat: 'electricite',   tier: 'afternoon', emoji: '⚡' },
    { text: 'Peinture intérieure',         cat: 'peinture',      tier: 'afternoon', emoji: '🎨' },
    { text: 'Serrure à changer',           cat: 'serrurerie',    tier: 'afternoon', emoji: '🔑' },
    { text: 'Clim qui ne refroidit plus',  cat: 'climatisation', tier: 'afternoon', emoji: '❄️' },
    { text: 'Installation électrique',     cat: 'electricite',   tier: 'afternoon', emoji: '⚡' },

    /* ── Evening tier (18–22h) ── */
    { text: 'Serrure bloquée',             cat: 'serrurerie',    tier: 'evening',   emoji: '🔒' },
    { text: 'Urgence plomberie',           cat: 'plomberie',     tier: 'evening',   emoji: '🔧' },
    { text: 'Panne disjoncteur',           cat: 'electricite',   tier: 'evening',   emoji: '⚡' },
    { text: 'Robinet qui goutte',          cat: 'plomberie',     tier: 'evening',   emoji: '💧' },
    { text: 'Volet roulant bloqué',        cat: 'bricolage',     tier: 'evening',   emoji: '🪟' },

    /* ── Night tier (22–6h) — urgent-styled ── */
    { text: 'Urgence fuite eau',           cat: 'plomberie',     tier: 'night',     emoji: '🚨', urgent: true },
    { text: 'Porte bloquée urgence',       cat: 'serrurerie',    tier: 'night',     emoji: '🚨', urgent: true },
    { text: 'Court-circuit appartement',   cat: 'electricite',   tier: 'night',     emoji: '⚡', urgent: true },
    { text: 'Bruit anormal clim',          cat: 'climatisation', tier: 'night',     emoji: '❄️', urgent: true },

    /* ── All-day pool (rotation fodder) ── */
    { text: 'Fuite d\'eau',               cat: 'plomberie',     tier: 'all',       emoji: '💧' },
    { text: 'Installation chauffe-eau',    cat: 'plomberie',     tier: 'all',       emoji: '🚿' },
    { text: 'Disjoncteur qui saute',       cat: 'electricite',   tier: 'all',       emoji: '⚡' },
    { text: 'Prise électrique en panne',   cat: 'electricite',   tier: 'all',       emoji: '🔌' },
    { text: 'Climatisation',              cat: 'climatisation', tier: 'all',       emoji: '❄️' },
    { text: 'Ouverture porte urgence',     cat: 'serrurerie',    tier: 'all',       emoji: '🔑' },
    { text: 'Peinture salon',             cat: 'peinture',      tier: 'all',       emoji: '🎨' },
    { text: 'Carrelage salle de bain',     cat: 'carrelage',     tier: 'all',       emoji: '🏠' },
    { text: 'Nettoyage après travaux',     cat: 'nettoyage',     tier: 'all',       emoji: '🧹' },
    { text: 'Meuble à monter',            cat: 'bricolage',     tier: 'all',       emoji: '🔨' },
  ];

  /* Category → chip text map for demand layer */
  var CAT_TO_CHIP = {
    plomberie:    { text: 'Fuite d\'eau',               emoji: '💧', urgent: false },
    electricite:  { text: 'Panne électrique',           emoji: '⚡', urgent: false },
    climatisation:{ text: 'Climatisation en panne',     emoji: '❄️', urgent: false },
    serrurerie:   { text: 'Serrure bloquée',            emoji: '🔑', urgent: false },
    peinture:     { text: 'Peinture intérieure',        emoji: '🎨', urgent: false },
    maconnerie:   { text: 'Travaux maçonnerie',         emoji: '🧱', urgent: false },
    carrelage:    { text: 'Pose carrelage',             emoji: '🏠', urgent: false },
    nettoyage:    { text: 'Nettoyage maison',           emoji: '🧹', urgent: false },
    menuiserie:   { text: 'Porte qui frotte',           emoji: '🚪', urgent: false },
    jardinage:    { text: 'Taille haies',               emoji: '🌿', urgent: false },
    bricolage:    { text: 'Petits travaux',             emoji: '🔨', urgent: false },
    demenagement: { text: 'Déménagement urgent',        emoji: '🚛', urgent: false },
  };

  /* Time tier boundaries */
  var TIERS = {
    morning:   [6, 11],
    afternoon: [11, 18],
    evening:   [18, 22],
    night:     [22, 30], /* 22–6 (30 = 6 next day via modular wrap) */
  };

  /* Contextual label config per tier */
  var LABEL_CONFIG = {
    morning:   { icon: '☀️', text: 'Suggestions ce matin' },
    afternoon: { icon: '🔆', text: 'Suggestions populaires' },
    evening:   { icon: '🌆', text: 'Suggestions ce soir' },
    night:     { icon: '🌙', text: 'Urgences disponibles' },
  };

  /* Session storage key for rotation memory */
  var SEEN_KEY = 'fxhsv2_seen';

  /* ══════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════ */

  function _getCurrentTier() {
    var h = new Date().getHours();
    if (h >= 6  && h < 11) return 'morning';
    if (h >= 11 && h < 18) return 'afternoon';
    if (h >= 18 && h < 22) return 'evening';
    return 'night';
  }

  /* Read last-seen chip texts from sessionStorage */
  function _getSeenChips() {
    try {
      return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  /* Write current selection to sessionStorage */
  function _markSeen(chips) {
    try {
      /* Keep last 8 seen texts as rotation memory */
      var prev = _getSeenChips();
      var combined = prev.concat(chips.map(function (c) { return c.text; }));
      if (combined.length > 8) combined = combined.slice(combined.length - 8);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(combined));
    } catch (e) {}
  }

  /* Read demand signal from localStorage — zero Supabase */
  function _getDemandCats() {
    try {
      var raw = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      if (!Array.isArray(raw) || raw.length === 0) return [];
      var counts = {};
      /* Count last 50 requests only */
      var slice = raw.slice(-50);
      slice.forEach(function (r) {
        var cat = (r.service_category || r.service || r.serviceType || '').toLowerCase().trim();
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
      });
      /* Return sorted categories, highest demand first */
      return Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a];
      });
    } catch (e) {
      return [];
    }
  }

  /* Read detected city from localStorage/DOM */
  function _getCity() {
    try {
      var lsCity = localStorage.getItem('fixeo_detected_city');
      if (lsCity && lsCity.length > 1) return lsCity;
    } catch (e) {}
    /* Fallback: read from AIRE-updated DOM element */
    try {
      var el = document.getElementById('hero-city-label');
      if (el) {
        var txt = (el.textContent || '').trim();
        if (txt && !txt.includes('Détect') && !txt.includes('…') && txt.length > 1) {
          return txt;
        }
      }
    } catch (e) {}
    return null;
  }

  /* Fisher-Yates shuffle — in place */
  function _shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ══════════════════════════════════════════════════════════
     CHIP SELECTION ALGORITHM
  ══════════════════════════════════════════════════════════ */

  function _selectChips() {
    var tier      = _getCurrentTier();
    var seen      = _getSeenChips();
    var demandCats = _getDemandCats(); /* top demand categories from localStorage */
    var seenSet   = {};
    seen.forEach(function (t) { seenSet[t] = true; });

    /* SCORE every chip in CHIP_POOL */
    var scored = CHIP_POOL.map(function (chip) {
      var score = 0;

      /* Layer 1 — Time tier (40pts) */
      if (chip.tier === tier)  score += 40;
      if (chip.tier === 'all') score += 10; /* all-day eligible */

      /* Layer 2 — Demand-aware (40pts) */
      if (demandCats.length > 0) {
        var catRank = demandCats.indexOf(chip.cat);
        if (catRank === 0) score += 40;       /* top demand category */
        else if (catRank === 1) score += 25;  /* 2nd demand category */
        else if (catRank === 2) score += 12;  /* 3rd demand category */
      }

      /* Layer 3 — Session rotation (−20 penalty if recently seen) */
      if (seenSet[chip.text]) score -= 20;

      /* Small jitter to avoid ties always resolving same way */
      score += Math.random() * 8;

      return { chip: chip, score: score };
    });

    /* Sort by score DESC */
    scored.sort(function (a, b) { return b.score - a.score; });

    /* Pick top 4, enforcing: no more than 2 from same category */
    var selected = [];
    var catCounts = {};
    for (var i = 0; i < scored.length && selected.length < 4; i++) {
      var c = scored[i].chip;
      var cc = catCounts[c.cat] || 0;
      if (cc < 2) {
        selected.push(c);
        catCounts[c.cat] = cc + 1;
      }
    }

    /* Guarantee 4 chips — fill from all-day pool if needed */
    if (selected.length < 4) {
      var fallbacks = CHIP_POOL.filter(function (c) { return c.tier === 'all'; });
      _shuffle(fallbacks);
      for (var j = 0; j < fallbacks.length && selected.length < 4; j++) {
        var alreadyIn = selected.some(function (s) { return s.text === fallbacks[j].text; });
        if (!alreadyIn) selected.push(fallbacks[j]);
      }
    }

    /* First chip gets trending treatment — highest scorer */
    selected[0]._trending = true;

    return selected;
  }

  /* ══════════════════════════════════════════════════════════
     BUILD CONTEXTUAL LABEL
  ══════════════════════════════════════════════════════════ */

  function _buildLabel(tier, city) {
    var cfg = LABEL_CONFIG[tier] || LABEL_CONFIG.afternoon;
    var labelEl = document.querySelector('.qsm-service-suggestions .qsm-suggestions-label');
    if (!labelEl) return;

    /* Build context text — city-aware if available */
    var labelText = cfg.text;
    if (city && (tier === 'afternoon' || tier === 'morning')) {
      var cityShort = city.replace(/^(Casablanca|Casa)$/i, 'Casa')
                          .replace(/^Marrakech$/i, 'Marrakech')
                          .replace(/^Mohammedia$/i, 'Mohammedia');
      labelText = 'Populaires \u00e0 ' + cityShort;
    }
    if (tier === 'night') {
      labelText = 'Urgences disponibles 24h/7';
    }

    labelEl.className = 'qsm-suggestions-label fxhsv2-label';
    labelEl.innerHTML =
      '<span class="fxhsv2-label-icon" aria-hidden="true">' + cfg.icon + '</span>' +
      '<span>' + labelText + '</span>';
  }

  /* ══════════════════════════════════════════════════════════
     BUILD MICROCOPY
  ══════════════════════════════════════════════════════════ */

  function _buildMicrocopy(city, demandCats, tier) {
    var container = document.querySelector('.qsm-service-suggestions');
    if (!container) return;

    /* Remove old microcopy */
    var old = container.querySelector('.fxhsv2-microcopy');
    if (old) old.parentNode.removeChild(old);

    /* Build microcopy text */
    var micro = null;
    if (city && demandCats.length > 0) {
      micro = '\uD83D\uDCCD Demand\u00e9 \u00e0 ' + city + ' en ce moment';
    } else if (demandCats.length > 0) {
      micro = '\uD83D\uDD25 Tendance aujourd\u2019hui au Maroc';
    } else if (tier === 'morning') {
      micro = '\u2600\uFE0F Suggestions ce matin';
    } else if (tier === 'night') {
      micro = '\uD83C\uDF19 Service d\u2019urgence disponible maintenant';
    }

    if (micro) {
      var el = document.createElement('span');
      el.className = 'fxhsv2-microcopy';
      el.textContent = micro;
      container.appendChild(el);
    }
  }

  /* ══════════════════════════════════════════════════════════
     CHIP CLICK HANDLER
     Fills #qsm-input-nlp + fires input/change events
     → triggers Hero Insights (fxhi-v1c) + FAEE V2 (faee-v2a)
  ══════════════════════════════════════════════════════════ */

  function _handleChipClick(text) {
    var input = document.getElementById('qsm-input-nlp');
    if (!input) return;

    input.value = text;

    /* Fire 'input' → triggers fxhi-v1c + faee-v2a (both listen to this) */
    try {
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    } catch (e) {}

    /* Fire 'change' for any remaining listeners */
    try {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}

    /* Focus input (pauses fxlps placeholder rotation too) */
    try {
      input.focus();
    } catch (e) {}

    /* Open QSM suggestions panel (mirrors QSM internal openSuggestions) */
    var root = document.getElementById('hero-quick-search');
    if (root) {
      root.classList.add('qsm-service-focused');
    }
  }

  /* ══════════════════════════════════════════════════════════
     RENDER CHIPS INTO .qsm-service-suggestions
  ══════════════════════════════════════════════════════════ */

  function _renderChips() {
    var container = document.querySelector('.qsm-service-suggestions');
    if (!container) return;

    var chips     = _selectChips();
    var tier      = _getCurrentTier();
    var city      = _getCity();
    var demandCats = _getDemandCats();

    /* Save to session rotation memory */
    _markSeen(chips);

    /* Update label */
    _buildLabel(tier, city);

    /* Remove all existing chips (but preserve label element) */
    var oldChips = container.querySelectorAll('.qsm-suggestion-chip, .fxhsv2-dynamic-chip');
    oldChips.forEach(function (el) { el.parentNode.removeChild(el); });

    /* Inject new chips */
    chips.forEach(function (chip, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';

      /* Base classes — keep qsm-suggestion-chip so QSM CSS still styles it */
      btn.className = 'qsm-suggestion-chip fxhsv2-dynamic-chip fxhsv2-chip-animate';

      /* Mark demand-sourced chips */
      if (demandCats.length > 0 && demandCats.indexOf(chip.cat) >= 0) {
        btn.classList.add('fxhsv2-demand-chip');
      }

      /* Mark urgent (night tier) chips */
      if (chip.urgent || tier === 'night') {
        btn.classList.add('fxhsv2-urgent-chip');
      }

      /* Mark trending chip (first one) */
      if (chip._trending) {
        btn.classList.add('fxhsv2-trending-chip');
      }

      /* Animation stagger */
      btn.setAttribute('data-fxhsv2-delay', String(idx + 1));

      /* Data attribute expected by QSM click handler */
      btn.setAttribute('data-qsm-suggestion', chip.text);

      /* Inner HTML: emoji + label + optional trending badge */
      var badge = '';
      if (chip._trending && demandCats.length > 0) {
        badge = '<span class="fxhsv2-badge" aria-hidden="true">\uD83D\uDD25 Tendance</span>';
      } else if (chip._trending && tier === 'morning') {
        badge = '<span class="fxhsv2-badge" aria-hidden="true">\u2600\uFE0F Maintenant</span>';
      } else if (chip.urgent) {
        badge = '<span class="fxhsv2-badge" style="background:linear-gradient(90deg,#ff4444,#ff7a00)" aria-hidden="true">\uD83D\uDEA8 Urgent</span>';
      }

      btn.innerHTML = chip.text + badge;

      /* Click handler */
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        /* Toggle active state (mirrors QSM behaviour) */
        var allChips = container.querySelectorAll('.qsm-suggestion-chip');
        allChips.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _handleChipClick(chip.text);
      });

      container.insertBefore(btn, null); /* append */
    });

    /* Build microcopy after chips */
    _buildMicrocopy(city, demandCats, tier);
  }

  /* ══════════════════════════════════════════════════════════
     WAIT FOR QSM CHIP CONTAINER
     QSM renders async — MutationObserver + fallback poll
  ══════════════════════════════════════════════════════════ */

  var _rendered = false;

  function _tryRender() {
    if (_rendered) return;
    var container = document.querySelector('.qsm-service-suggestions');
    if (!container) return;
    _rendered = true;
    _renderChips();
  }

  function _watchForContainer() {
    var host = document.getElementById('hero-quick-search');
    if (!host) {
      /* No hero search on this page — abort silently */
      return;
    }

    /* Try immediately in case QSM already rendered */
    _tryRender();
    if (_rendered) return;

    /* MutationObserver — watch hero-quick-search for QSM injection */
    var obs = new MutationObserver(function () {
      _tryRender();
      if (_rendered) obs.disconnect();
    });
    obs.observe(host, { childList: true, subtree: true });

    /* Fallback poll: 250ms × 24 = 6s cap */
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      _tryRender();
      if (_rendered || attempts >= 24) clearInterval(poll);
    }, 250);
  }

  /* ══════════════════════════════════════════════════════════
     PAGE FOCUS REFRESH
     Re-evaluate on tab re-focus (next visit, new time of day)
  ══════════════════════════════════════════════════════════ */

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && _rendered) {
      /* Reset render flag so chips can be refreshed */
      _rendered = false;
      /* Small delay — let any pending QSM re-render complete first */
      setTimeout(function () {
        _tryRender();
      }, 200);
    }
  });

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _watchForContainer, { once: true });
  } else {
    _watchForContainer();
  }

  /* Public API (for debugging / manual trigger) */
  window.FixeoHeroSuggestionsV2 = {
    version: VERSION,
    refresh: function () {
      _rendered = false;
      _tryRender();
    },
    selectChips: _selectChips,   /* debug: inspect selected chips */
    getDemandCats: _getDemandCats, /* debug: inspect demand signal */
  };

  console.log('[FixeoHeroSuggestionsV2] ' + VERSION + ' loaded');

}(window, document));
