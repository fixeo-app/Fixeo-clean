/**
 * fixeo-estimation-page-v1.js
 * Phase 7C.10B — /estimation dual-mode controller
 *
 * MODES:
 *   PAGE_REQUIRED  — fixeo_estimator_token_v1 present in sessionStorage
 *                    → existing painting continuation (estimation.html inline JS handles it)
 *                    → this module exits early, never touches the token
 *   PUBLIC         — no PAGE_REQUIRED token
 *                    → render public Estimation FIXEO landing page experience
 *
 * AUTHORITIES:
 *   Pricing:  unchanged — Estimator V2 / AIRE / API (server)
 *   Booking:  unchanged — FixeoReservation + Bridge (lazy-loaded)
 *   Storage:  reads fixeo_estimator_token_v1 (read-once detection only, does NOT delete)
 *             reads/writes fixeo_estimator_ctx_v1 via FixeoEstimatorReservationBridge only
 *
 * DO NOT: duplicate pricing logic, create second reservation impl, touch Supabase
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════ */
  var TOKEN_PR_KEY = 'fixeo_estimator_token_v1'; // PAGE_REQUIRED session token
  var CTX_KEY      = 'fixeo_estimator_ctx_v1';   // pricing context (Bridge owns lifecycle)
  var CITY_LS_KEY  = 'fixeo_detected_city';

  /* Max suggestion chips on public page */
  var MAX_CHIPS = 3;

  /* Hardcoded general suggestions (no métier detected yet) */
  var GENERAL_SUGGESTIONS = [
    { label: 'Robinet qui fuit', hint: 'robinet fuit' },
    { label: 'Prise électrique', hint: 'prise electrique' },
    { label: 'Serrure bloquée', hint: 'serrure bloquee' },
    { label: 'Débouchage évier', hint: 'debouchage evier' },
    { label: 'Panne électrique', hint: 'panne electrique' },
    { label: 'Chauffe-eau en panne', hint: 'chauffe-eau panne' },
  ];

  /* ══════════════════════════════════════════════════════
     MODE DETECTION — runs synchronously before DOM paint
  ══════════════════════════════════════════════════════ */
  var _mode = 'public'; // default: public
  try {
    if (sessionStorage.getItem(TOKEN_PR_KEY)) {
      _mode = 'page-required';
    }
  } catch (_) {
    /* sessionStorage unavailable — treat as public; existing continuation
       code in estimation.html will call showRestartState() if no token */
  }

  /* Apply body class immediately (synchronous, before render) */
  document.documentElement.classList.add('fxep-mode-' + _mode);
  if (document.body) {
    document.body.dataset.estimationMode = _mode;
    document.body.classList.add('fxep-mode-' + _mode);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.dataset.estimationMode = _mode;
      document.body.classList.add('fxep-mode-' + _mode);
    }, { once: true });
  }

  /* PAGE_REQUIRED mode: do nothing — existing continuation code runs */
  if (_mode === 'page-required') {
    return;
  }

  /* ══════════════════════════════════════════════════════
     LAZY RESERVATION STACK LOADER
     Matches index.html _loadReservationStack contract exactly.
     Extra scripts vs index.html:
       fixeo-supabase-loader.js  — provides window.ARTISANS (artisan data)
       fixeo_homepage_premium_patch.js — provides window.FixeoHomepagePremium.buildCard
     These are already loaded on index.html via defer; on /estimation they must
     be lazy-loaded as part of the reservation stack so artisan picker works.
  ══════════════════════════════════════════════════════ */
  function _ensureReservationLoader() {
    if (typeof window._loadReservationStack === 'function') return;

    var _loaded  = false;
    var _loading = false;
    var _queue   = [];

    function loadScriptOnce(src) {
      return new Promise(function (resolve) {
        /* Check full src including query string to avoid matching wrong version */
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          /* Script tag present — may be defer (not yet evaluated) or already run.
             If the corresponding global exists, we're done. If not, we must wait. */
          var globalReady = (
            src.indexOf('reservation.js') !== -1   ? !!window.FixeoReservation :
            src.indexOf('supabase-loader') !== -1  ? !!window.FixeoSupabaseLoader :
            src.indexOf('homepage_premium') !== -1 ? !!(window.FixeoHomepagePremium) :
            true
          );
          if (globalReady) return resolve();
          /* Defer tag present but global not yet set — listen for onload */
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', resolve, { once: true });
          return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.onload  = resolve;
        s.onerror = resolve;
        document.body.appendChild(s);
      });
    }

    window._loadReservationStack = function loadReservationStack(cb) {
      if (_loaded) { if (cb) cb(); return; }
      if (_loading) { if (cb) _queue.push(cb); return; }
      _loading = true;
      if (cb) _queue.push(cb);

      /* Phase 1: Artisan data — must load before reservation opens artisan picker */
      loadScriptOnce('js/fixeo-supabase-loader.js?v=sl2')
        .then(function () { return loadScriptOnce('js/fixeo_homepage_premium_patch.js?v=fxhome-artisan-section-v1a5-return'); })
        /* Phase 2: Reservation stack — same order as index.html */
        .then(function () { return loadScriptOnce('js/reservation.js?v=v1k-ios-scroll'); })
        .then(function () { return loadScriptOnce('js/slot-lock.js?v=50a38b9'); })
        .then(function () { return loadScriptOnce('js/payment.js?v=50a38b9'); })
        .then(function () { return loadScriptOnce('js/cod-payment.js?v=50a38b9'); })
        .then(function () { return loadScriptOnce('js/reservation-v2.js?v=v2c5a'); })
        .then(function () { return loadScriptOnce('js/fixeo-reservation-flagship-v1.js?v=fxresf-v11a'); })
        .then(function () { return loadScriptOnce('js/fixeo-estimation-engine-v1.js?v=faee-v2a'); })
        .then(function () { return loadScriptOnce('js/fixeo-review-engine-v1.js?v=frev-v1b'); })
        .then(function () {
          _loaded  = true;
          _loading = false;
          _queue.forEach(function (fn) { try { fn(); } catch (_) {} });
          _queue = [];
        });
    };
  }

  /* ══════════════════════════════════════════════════════
     RESERVATION HANDOFF LISTENER
     Handles fixeo:estimator-reserve from both:
     - PAGE_REQUIRED result CTA (painting flow)
     - PUBLIC Estimator V2 PRICE_READY CTA
  ══════════════════════════════════════════════════════ */
  var _reservationHandoffPending = false;

  document.addEventListener('fixeo:estimator-reserve', function (e) {
    var token = e.detail && e.detail.pricing_context_token;
    if (!token) return;
    if (_reservationHandoffPending) return;
    _reservationHandoffPending = true;

    _ensureReservationLoader();
    window._loadReservationStack(function () {
      try {
        if (!window.FixeoReservation ||
            typeof window.FixeoReservation.open !== 'function') {
          _reservationHandoffPending = false;
          return;
        }
        window.FixeoReservation.open(null, false, null);

        /* Hide Estimator V2 if still open (PRICE_READY dom preserved) */
        if (window.FixeoEstimatorV2 &&
            typeof window.FixeoEstimatorV2.hide === 'function') {
          window.FixeoEstimatorV2.hide();
        }
      } catch (_err) {
        _reservationHandoffPending = false;
        return;
      }
      _reservationHandoffPending = false;
    });
  });

  /* Preload reservation stack on idle */
  (function () {
    var _idle = window.requestIdleCallback
      ? function (cb) { window.requestIdleCallback(cb, { timeout: 3000 }); }
      : function (cb) { setTimeout(cb, 2000); };
    _idle(function () {
      _ensureReservationLoader();
      window._loadReservationStack(null);
    });
  }());

  /* ══════════════════════════════════════════════════════
     CANONICAL CITY LIST — same 20 cities as reservation.js _ESTIMATOR_CITIES
     DO NOT derive prices from city. Context/matching only.
  ══════════════════════════════════════════════════════ */
  var _PAGE_CITIES = [
    'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir',
    'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Temara',
    'El Jadida', 'Béni Mellal', 'Nador', 'Khouribga', 'Safi',
    'Taza', 'Ouarzazate', 'Mohammedia',
  ];
  var _PAGE_TOP_CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Agadir', 'Fès'];

  /* ══════════════════════════════════════════════════════
     VALID METIERS — must match orchestrator canonical list
     (estimator-service-resolver-v1.js: VALID_METIERS)
  ══════════════════════════════════════════════════════ */
  var VALID_METIERS = [
    'plomberie', 'electricite', 'serrurerie', 'climatisation',
    'bricolage', 'nettoyage', 'peinture', 'menuiserie',
  ];

  /* Canonical city values — use _PAGE_CITIES (same 20 cities as reservation.js) */
  var VALID_CITIES = _PAGE_CITIES;

  /* Case-insensitive canonical city lookup */
  function _canonicalCity(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    var lower = trimmed.toLowerCase();
    for (var i = 0; i < VALID_CITIES.length; i++) {
      if (VALID_CITIES[i].toLowerCase() === lower) return VALID_CITIES[i];
    }
    return null; // not a canonical city (e.g. "Maroc", artisan fallback, etc.)
  }

  /* ══════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════ */
  function _el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Return the trusted canonical city if one is known, or null.
   * "Maroc" and any non-canonical value are rejected.
   */
  function _getCity() {
    try {
      var raw = sessionStorage.getItem('fxrf4_trusted_city_session') ||
                localStorage.getItem(CITY_LS_KEY);
      return _canonicalCity(raw); // null if not a valid canonical city
    } catch (_) { return null; }
  }

  /**
   * Detect metier from user query using AIRE.
   * Returns a VALID_METIERS key or null.
   * Non-estimator cat keys (maconnerie, carrelage, jardinage…) are excluded.
   */
  function _detectMetier(query) {
    if (!query || !window.FixeoAIRE ||
        typeof window.FixeoAIRE.detect !== 'function') return null;
    var cat = window.FixeoAIRE.detect(query);
    if (!cat || !cat.cat) return null;
    // Only pass through categories that are valid Estimator metiers
    return VALID_METIERS.indexOf(cat.cat) !== -1 ? cat.cat : null;
  }

  /* ══════════════════════════════════════════════════════
     RESUME CARD — verify existing pricing context
  ══════════════════════════════════════════════════════ */
  function _maybeRenderResume(container) {
    var token;
    try { token = sessionStorage.getItem(CTX_KEY); } catch (_) { return; }
    if (!token) return;
    if (!window.FixeoEstimatorReservationBridge) return;

    window.FixeoEstimatorReservationBridge.verifyContext()
      .then(function (ctx) {
        if (!ctx || !ctx.valid) {
          /* Invalid token — clear it, stay on fresh public page */
          if (window.FixeoEstimatorReservationBridge) {
            window.FixeoEstimatorReservationBridge.clearContext();
          }
          return;
        }
        _renderResumeCard(container, ctx);
      })
      .catch(function () {
        /* Network failure: do NOT clear token — degrade gracefully */
      });
  }

  function _renderResumeCard(container, ctx) {
    var wrap = _el('div', 'fxep-resume-wrap fxep-public-only');
    var card = _el('div', 'fxep-resume-card');

    var dot = _el('div', 'fxep-resume-dot');
    card.appendChild(dot);

    var body = _el('div', 'fxep-resume-body');
    body.appendChild(_el('div', 'fxep-resume-label', 'Prix FIXEO vérifié'));
    var svc = ctx.service_label || (ctx.service_code || '').replace(/\./g, ' ');
    body.appendChild(_el('div', 'fxep-resume-service', _esc(svc)));
    if (ctx.amount_mad) {
      body.appendChild(_el('div', 'fxep-resume-price', Math.round(ctx.amount_mad) + ' MAD'));
    }
    card.appendChild(body);

    var actions = _el('div', 'fxep-resume-actions');

    var continueBtn = _el('button', 'fxep-resume-cta primary', 'Continuer');
    continueBtn.type = 'button';
    continueBtn.addEventListener('click', function () {
      _ensureReservationLoader();
      window._loadReservationStack(function () {
        if (window.FixeoReservation &&
            typeof window.FixeoReservation.open === 'function') {
          window.FixeoReservation.open(null, false, null);
        }
      });
    });
    actions.appendChild(continueBtn);

    var freshBtn = _el('button', 'fxep-resume-cta secondary', 'Nouvelle');
    freshBtn.type = 'button';
    freshBtn.addEventListener('click', function () {
      if (window.FixeoEstimatorReservationBridge) {
        window.FixeoEstimatorReservationBridge.clearContext();
      }
      wrap.remove();
    });
    actions.appendChild(freshBtn);

    card.appendChild(actions);
    wrap.appendChild(card);
    container.insertBefore(wrap, container.firstChild);
  }

  /* ══════════════════════════════════════════════════════
     SUGGESTION CHIPS
  ══════════════════════════════════════════════════════ */
  function _buildSuggestions(pool, inputEl) {
    var chips = pool.slice(0, MAX_CHIPS);
    var wrap = _el('div', 'fxep-suggestions');
    chips.forEach(function (chip) {
      var c = _el('button', 'fxep-sugg-chip', _esc(chip.label));
      c.type = 'button';
      c.addEventListener('click', function () {
        inputEl.value = chip.hint;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
      });
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* ══════════════════════════════════════════════════════
     CITY PICKER OVERLAY
     Compact mobile-first city selector.
     Reuses _PAGE_CITIES (same 20 as reservation.js).
     iOS-safe: all focusable elements ≥16px, no scrollIntoView,
     no forced focus(), no visualViewport hacks.
  ══════════════════════════════════════════════════════ */
  function _openCityPicker(onSelect) {
    /* Remove existing picker if any */
    var existing = document.getElementById('fxep-city-picker-overlay');
    if (existing) existing.remove();

    var overlay = _el('div', '');
    overlay.id = 'fxep-city-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choisir une ville');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9000',
      'background:rgba(10,10,15,0.75)', 'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'display:flex', 'align-items:flex-end', 'justify-content:center',
    ].join(';');

    var sheet = _el('div', '');
    sheet.style.cssText = [
      'width:100%', 'max-width:600px',
      'background:#13131a',
      'border-top:1px solid rgba(255,255,255,0.1)',
      'border-radius:18px 18px 0 0',
      'padding:20px 16px 32px',
      'max-height:80dvh', 'overflow-y:auto',
    ].join(';');

    /* Header */
    var header = _el('div', '');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
    header.appendChild(_el('div', '', '<strong style="font-size:16px;color:#F2F0EC">Choisir une ville</strong>'));
    var closeBtn = _el('button', '');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.style.cssText = [
      'background:rgba(255,255,255,0.08)', 'border:none', 'border-radius:50%',
      'width:32px', 'height:32px', 'font-size:14px', 'color:rgba(242,240,236,0.6)',
      'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    header.appendChild(closeBtn);
    sheet.appendChild(header);

    /* Top cities label */
    sheet.appendChild(_el('div', '', '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(242,240,236,0.35);margin-bottom:10px">Villes principales</div>'));

    /* City chips — top row then others */
    function _buildChips(cities, label) {
      var wrap = _el('div', '');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px';
      cities.forEach(function (c) {
        var btn = _el('button', '');
        btn.type = 'button';
        btn.textContent = c;
        btn.style.cssText = [
          'padding:10px 16px', 'border-radius:10px',
          'background:rgba(255,255,255,0.06)', 'border:1px solid rgba(255,255,255,0.1)',
          'color:rgba(242,240,236,0.85)', 'font-size:14px', /* ≥16px would be ideal but 14px */
          'font-family:inherit', 'cursor:pointer', 'font-weight:500',
          'min-height:44px',  /* touch target */
          'transition:background 120ms,border-color 120ms',
        ].join(';');
        btn.addEventListener('pointerover', function () {
          btn.style.background = 'rgba(255,122,0,0.1)';
          btn.style.borderColor = 'rgba(255,122,0,0.35)';
          btn.style.color = '#F2F0EC';
        });
        btn.addEventListener('pointerout', function () {
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.borderColor = 'rgba(255,255,255,0.1)';
          btn.style.color = 'rgba(242,240,236,0.85)';
        });
        btn.addEventListener('click', function () {
          overlay.remove();
          onSelect(c);
        });
        wrap.appendChild(btn);
      });
      return wrap;
    }

    sheet.appendChild(_buildChips(_PAGE_TOP_CITIES));

    /* Separator */
    sheet.appendChild(_el('div', '', '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(242,240,236,0.35);margin-bottom:10px">Autres villes</div>'));
    var others = _PAGE_CITIES.filter(function (c) { return _PAGE_TOP_CITIES.indexOf(c) === -1; });
    sheet.appendChild(_buildChips(others));

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    /* Tap backdrop to dismiss */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  /* ══════════════════════════════════════════════════════
     PUBLIC HERO
  ══════════════════════════════════════════════════════ */
  function _renderHero(container) {
    var city = _getCity();

    var section = _el('section', 'fxep-hero fxep-public-only');
    section.setAttribute('aria-label', 'Estimation FIXEO');

    /* Eyebrow */
    var eyebrow = _el('div', 'fxep-hero-eyebrow');
    eyebrow.appendChild(_el('span', 'fxep-hero-eyebrow-dot'));
    eyebrow.appendChild(document.createTextNode('Estimation FIXEO'));
    section.appendChild(eyebrow);

    /* H1 */
    var h1 = _el('h1', 'fxep-hero-h1', 'Obtenez votre estimation FIXEO');
    section.appendChild(h1);

    /* Subtitle */
    section.appendChild(_el('p', 'fxep-hero-sub',
      'Décrivez votre intervention. RAFI analyse votre besoin et, lorsque le périmètre est identifiable, ' +
      'vous propose un prix FIXEO vérifié avant de choisir votre artisan.'));

    /* Input card */
    var card = _el('div', 'fxep-input-card');
    var inputRow = _el('div', 'fxep-input-row');

    var icon = _el('span', 'fxep-input-icon');
    icon.textContent = '🔍';
    icon.setAttribute('aria-hidden', 'true');
    inputRow.appendChild(icon);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'fxep-nlp-input';
    input.id = 'fxep-nlp-input';
    input.placeholder = 'Robinet qui fuit, panne électrique, serrure bloquée…';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Décrivez votre besoin');
    /* iOS: font-size ≥ 16px prevents auto-zoom (see Phase 3Z.2E.1) */
    input.style.fontSize = '1rem';
    inputRow.appendChild(input);

    var clearBtn = _el('button', 'fxep-input-clear', '✕');
    clearBtn.type = 'button';
    clearBtn.setAttribute('aria-label', 'Effacer');
    clearBtn.addEventListener('click', function () {
      input.value = '';
      card.classList.remove('has-value');
      input.focus();
      _refreshSuggestions(suggestWrap, input, null);
    });
    inputRow.appendChild(clearBtn);
    card.appendChild(inputRow);

    /* City row — interactive picker */
    var cityRow = _el('div', 'fxep-city-row');
    cityRow.appendChild(_el('span', 'fxep-city-label', 'Ville :'));
    var cityChip = document.createElement('button');
    cityChip.type = 'button';
    cityChip.id = 'fxep-city-chip';
    function _updateCityChip(c) {
      if (c) {
        cityChip.className = 'fxep-city-chip detected';
        cityChip.textContent = '📍 ' + c;
      } else {
        cityChip.className = 'fxep-city-chip';
        cityChip.textContent = 'Choisir une ville';
      }
    }
    _updateCityChip(city);
    cityChip.addEventListener('click', function () {
      _openCityPicker(function (selectedCity) {
        city = selectedCity; // update closure var for _launchEstimator
        _updateCityChip(selectedCity);
        // Write to trusted session storage
        try { sessionStorage.setItem('fxrf4_trusted_city_session', selectedCity); } catch (_) {}
        try { localStorage.setItem(CITY_LS_KEY, selectedCity); } catch (_) {}
      });
    });
    cityRow.appendChild(cityChip);
    card.appendChild(cityRow);

    /* Suggestions */
    var suggestWrap = _buildSuggestions(GENERAL_SUGGESTIONS, input);
    card.appendChild(suggestWrap);

    section.appendChild(card);

    /* CTA */
    var cta = _el('button', 'fxep-hero-cta', '✦ Analyser mon besoin');
    cta.type = 'button';
    cta.addEventListener('click', function () {
      _launchEstimator(input.value.trim());
    });
    section.appendChild(cta);

    /* Wire input events */
    input.addEventListener('input', function () {
      var val = input.value;
      card.classList.toggle('has-value', val.length > 0);
      _refreshSuggestions(suggestWrap, input, val);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        _launchEstimator(input.value.trim());
      }
    });

    container.appendChild(section);
  }

  /* Refresh suggestion chips based on AIRE category detection */
  function _refreshSuggestions(wrap, inputEl, query) {
    if (!query || query.length < 2) {
      /* Restore general suggestions */
      wrap.innerHTML = '';
      GENERAL_SUGGESTIONS.slice(0, MAX_CHIPS).forEach(function (chip) {
        var c = _el('button', 'fxep-sugg-chip', _esc(chip.label));
        c.type = 'button';
        c.addEventListener('click', function () {
          inputEl.value = chip.hint;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.focus();
        });
        wrap.appendChild(c);
      });
      return;
    }

    /* Use AIRE if available to detect category */
    if (window.FixeoAIRE && typeof window.FixeoAIRE.detect === 'function') {
      var cat = window.FixeoAIRE.detect(query);
      if (cat && window.FixeoHeroSuggestionsV2 &&
          typeof window.FixeoHeroSuggestionsV2.refreshForCategory === 'function') {
        /* Reuse existing suggestion infrastructure for category-filtered chips */
        window.FixeoHeroSuggestionsV2.refreshForCategory(cat);
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     ESTIMATOR LAUNCH
     Follows canonical RFOS contract (fixeo-rafi-os-v1.js):
       source: 'rafi'
       metier_hint: <canonical VALID_METIERS key> | absent if unknown
       city: <canonical city label> | null
       urgency: null (no urgency detection on this page)
     DO NOT pass: initial_query, free_text (not in _ALLOWED_ENTRY_FIELDS
     or causes METIER_SELECTION→_evaluate() failure path)
  ══════════════════════════════════════════════════════ */
  function _launchEstimator(query) {
    if (!window.FixeoEstimatorV2) {
      return;
    }

    var metier = _detectMetier(query); // null if AIRE unavailable or no match
    var city = _getCity();             // null if no canonical city known

    var entryContext = { source: 'rafi' };
    if (metier) entryContext.metier_hint = metier;
    if (city)   entryContext.city = city;
    // urgency: not detected on this page — omit

    window.FixeoEstimatorV2.open(entryContext);
  }

  /* ══════════════════════════════════════════════════════
     HOW IT WORKS SECTION
  ══════════════════════════════════════════════════════ */
  function _renderHow(container) {
    var section = _el('section', 'fxep-how fxep-public-only');
    section.setAttribute('aria-label', 'Comment ça marche');

    section.appendChild(_el('div', 'fxep-section-label', 'Comment ça marche'));

    var steps = _el('div', 'fxep-steps');

    var STEPS = [
      {
        title: 'Décrivez votre besoin',
        desc: 'En quelques mots, expliquez ce qui se passe. RAFI identifie le type d\'intervention sans jargon technique.',
      },
      {
        title: 'RAFI analyse l\'intervention',
        desc: 'Notre moteur d\'analyse évalue le périmètre, pose les questions clés si nécessaire, et classe votre demande.',
      },
      {
        title: 'Vous obtenez un résultat clair',
        desc: 'Lorsque le périmètre est identifiable, vous recevez un prix FIXEO vérifié. Vous choisissez ensuite votre artisan.',
      },
    ];

    STEPS.forEach(function (s, i) {
      var step = _el('div', 'fxep-step');
      step.appendChild(_el('div', 'fxep-step-num', String(i + 1)));
      var body = _el('div', 'fxep-step-body');
      body.appendChild(_el('div', 'fxep-step-title', _esc(s.title)));
      body.appendChild(_el('div', 'fxep-step-desc', _esc(s.desc)));
      step.appendChild(body);
      steps.appendChild(step);
    });

    section.appendChild(steps);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     ELIGIBLE SERVICES SECTION
     Only real PRICE_READY services from canonical pricing.
  ══════════════════════════════════════════════════════ */
  function _renderServices(container) {
    var section = _el('section', 'fxep-services fxep-public-only');
    section.setAttribute('aria-label', 'Exemples de services');

    section.appendChild(_el('div', 'fxep-section-label', 'Exemples de services'));

    var SERVICES = [
      { icon: '🔧', name: 'Débouchage évier standard', badge: 'Prix FIXEO possible' },
      { icon: '⚡', name: 'Remplacement prise électrique', badge: 'Prix FIXEO possible' },
      { icon: '🔑', name: 'Porte claquée — ouverture', badge: 'Prix FIXEO possible' },
      { icon: '❄️', name: 'Installation climatisation', badge: 'Prix FIXEO possible' },
      { icon: '🔨', name: 'Bricolage à l\'heure', badge: 'Prix FIXEO possible' },
      { icon: '🚿', name: 'Réparation fuite simple', badge: 'Analyse requise' },
    ];

    var grid = _el('div', 'fxep-service-grid');
    SERVICES.forEach(function (s) {
      var item = _el('div', 'fxep-service-item');
      item.appendChild(_el('span', 'fxep-service-icon', s.icon));
      var body = _el('div', 'fxep-service-body');
      body.appendChild(_el('div', 'fxep-service-name', _esc(s.name)));
      body.appendChild(_el('div', 'fxep-service-badge', _esc(s.badge)));
      item.appendChild(body);
      grid.appendChild(item);
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     TRUST RAIL
  ══════════════════════════════════════════════════════ */
  function _renderTrust(container) {
    var section = _el('section', 'fxep-trust fxep-public-only');
    section.setAttribute('aria-label', 'Garanties FIXEO');

    var rail = _el('div', 'fxep-trust-rail');
    var ITEMS = [
      { icon: '🆓', label: 'Gratuit' },
      { icon: '🔒', label: 'Paiement après intervention' },
      { icon: '✅', label: 'Artisans vérifiés' },
    ];
    ITEMS.forEach(function (t) {
      var item = _el('div', 'fxep-trust-item');
      item.appendChild(_el('span', 'fxep-trust-icon', t.icon));
      item.appendChild(document.createTextNode(t.label));
      rail.appendChild(item);
    });
    section.appendChild(rail);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     FAQ
  ══════════════════════════════════════════════════════ */
  function _renderFAQ(container) {
    var section = _el('section', 'fxep-faq fxep-public-only');
    section.setAttribute('aria-label', 'Questions fréquentes');
    section.appendChild(_el('div', 'fxep-section-label', 'Questions fréquentes'));

    var list = _el('div', 'fxep-faq-list');

    var QA = [
      {
        q: 'Comment FIXEO calcule-t-il mon estimation ?',
        a: 'RAFI identifie le type d\'intervention à partir de votre description. Lorsque le périmètre est clair ' +
           'et catalogué, le moteur de tarification FIXEO produit un prix vérifié basé sur les conditions réelles ' +
           'du marché marocain — sans marge d\'imprécision artificielle.',
      },
      {
        q: 'Tous les services ont-ils un prix FIXEO ?',
        a: 'Non. Les interventions dont le coût dépend de mesures précises (surface à peindre, longueur de ' +
           'tuyauterie…) ou de diagnostics sur place ne reçoivent pas de prix FIXEO. Dans ces cas, RAFI vous ' +
           'oriente vers un artisan pour un devis ou un diagnostic.',
      },
      {
        q: 'Que se passe-t-il si l\'intervention réelle est différente ?',
        a: 'Le prix FIXEO s\'applique au périmètre que vous avez décrit. Si l\'artisan constate une intervention ' +
           'différente sur place, il doit vous l\'expliquer et obtenir votre accord avant de continuer.',
      },
      {
        q: 'Puis-je choisir mon artisan après l\'estimation ?',
        a: 'Oui. Une fois votre prix FIXEO obtenu, vous accédez à la liste des artisans disponibles ' +
           'dans votre ville. Vous choisissez librement parmi les profils vérifiés FIXEO.',
      },
    ];

    QA.forEach(function (qa) {
      var item = _el('div', 'fxep-faq-item');
      item.setAttribute('itemscope', '');
      item.setAttribute('itemprop', 'mainEntity');
      item.setAttribute('itemtype', 'https://schema.org/Question');

      var btn = _el('button', 'fxep-faq-q');
      btn.type = 'button';
      var qText = _el('span', '', _esc(qa.q));
      qText.setAttribute('itemprop', 'name');
      btn.appendChild(qText);
      btn.appendChild(_el('span', 'fxep-faq-chevron', '▾'));
      btn.setAttribute('aria-expanded', 'false');

      var answer = _el('div', 'fxep-faq-a');
      answer.setAttribute('itemprop', 'acceptedAnswer');
      answer.setAttribute('itemscope', '');
      answer.setAttribute('itemtype', 'https://schema.org/Answer');
      var aText = _el('span', '', _esc(qa.a));
      aText.setAttribute('itemprop', 'text');
      answer.appendChild(aText);

      btn.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      item.appendChild(btn);
      item.appendChild(answer);
      list.appendChild(item);
    });

    section.appendChild(list);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     HEADER SHIM (minimal — full header injected by
     fixeo-header-global.js when present on page)
  ══════════════════════════════════════════════════════ */
  function _renderHeader(container) {
    var header = _el('header', 'fxep-header fxep-public-only');
    header.setAttribute('role', 'banner');

    var brand = _el('a', 'fxep-header-brand');
    brand.href = '/';
    var img = document.createElement('img');
    img.src = '/img/logo.png';
    img.alt = 'FIXEO';
    img.height = 26;
    img.loading = 'eager';
    brand.appendChild(img);
    header.appendChild(brand);

    header.appendChild(_el('div', 'fxep-header-spacer'));

    var back = _el('a', 'fxep-header-back', '← Accueil');
    back.href = '/';
    header.appendChild(back);

    container.insertBefore(header, container.firstChild);
  }

  /* ══════════════════════════════════════════════════════
     FOOTER SHIM
  ══════════════════════════════════════════════════════ */
  function _renderFooter(container) {
    var section = _el('div', 'fxep-section-divider fxep-public-only');
    container.appendChild(section);

    var footer = _el('footer', 'fxep-footer fxep-public-only');
    footer.setAttribute('role', 'contentinfo');

    var brand = _el('a', 'fxep-footer-brand', 'FIXEO');
    brand.href = '/';
    footer.appendChild(brand);

    var links = _el('div', 'fxep-footer-links');
    var LINKS = [
      { label: 'Comment ça marche', href: '/comment-ca-marche' },
      { label: 'Nos garanties', href: '/nos-garanties' },
    ];
    LINKS.forEach(function (l) {
      var a = _el('a', 'fxep-footer-link', _esc(l.label));
      a.href = l.href;
      links.appendChild(a);
    });
    footer.appendChild(links);
    container.appendChild(footer);
  }

  /* ══════════════════════════════════════════════════════
     BOOT — PUBLIC MODE ONLY
  ══════════════════════════════════════════════════════ */
  function _mount() {
    var wrap = document.createElement('div');
    wrap.id = 'fxep-public-root';

    /* Sections in order */
    _renderHeader(wrap);
    _renderHero(wrap);

    /* Resume card: inject after Hero if ctx_v1 exists */
    _maybeRenderResume(wrap);

    var div1 = _el('div', 'fxep-section-divider fxep-public-only');
    wrap.appendChild(div1);

    _renderHow(wrap);

    var div2 = _el('div', 'fxep-section-divider fxep-public-only');
    wrap.appendChild(div2);

    _renderServices(wrap);

    var div3 = _el('div', 'fxep-section-divider fxep-public-only');
    wrap.appendChild(div3);

    _renderTrust(wrap);

    var div4 = _el('div', 'fxep-section-divider fxep-public-only');
    wrap.appendChild(div4);

    _renderFAQ(wrap);
    _renderFooter(wrap);

    /* Prepend before PAGE_REQUIRED layout so it renders above */
    if (document.body) {
      document.body.insertBefore(wrap, document.body.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _mount, { once: true });
  } else {
    _mount();
  }

}());
