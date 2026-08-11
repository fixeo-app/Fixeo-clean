/**
 * fixeo-estimation-page-v1.js
 * Phase 7C.10C — /estimation premium public gateway controller
 *
 * MODES:
 *   PAGE_REQUIRED  — fixeo_estimator_token_v1 present in sessionStorage
 *                    → existing painting continuation (estimation.html inline JS handles it)
 *                    → this module exits early, never touches the token
 *   PUBLIC         — no PAGE_REQUIRED token
 *                    → render premium Estimation FIXEO gateway
 *
 * AUTHORITIES:
 *   Pricing:  unchanged — Estimator V2 / AIRE / API (server)
 *   Booking:  unchanged — FixeoReservation + Bridge (lazy-loaded)
 *   Storage:  reads fixeo_estimator_token_v1 (read-once detection only, does NOT delete)
 *             reads/writes fixeo_estimator_ctx_v1 via FixeoEstimatorReservationBridge only
 *
 * DO NOT: duplicate pricing logic, create second reservation impl, touch Supabase,
 *         modify PAGE_REQUIRED painting flow, change token contracts.
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
             If the corresponding global exists, we're done. If not, listen for load. */
          var globalReady = (
            src.indexOf('reservation.js') !== -1   ? !!window.FixeoReservation :
            src.indexOf('supabase-loader') !== -1  ? !!window.FixeoSupabaseLoader :
            src.indexOf('homepage_premium') !== -1 ? !!(window.FixeoHomepagePremium) :
            true
          );
          if (globalReady) return resolve();
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
        .then(function () { return loadScriptOnce('js/reservation.js?v=v1l-syntax-fix'); })
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
  ══════════════════════════════════════════════════════ */
  var VALID_METIERS = [
    'plomberie', 'electricite', 'serrurerie', 'climatisation',
    'bricolage', 'nettoyage', 'peinture', 'menuiserie',
  ];

  var VALID_CITIES = _PAGE_CITIES;

  function _canonicalCity(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    var lower = trimmed.toLowerCase();
    for (var i = 0; i < VALID_CITIES.length; i++) {
      if (VALID_CITIES[i].toLowerCase() === lower) return VALID_CITIES[i];
    }
    return null; // rejects "Maroc", artisan card fallback, etc.
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

  function _getCity() {
    try {
      var raw = sessionStorage.getItem('fxrf4_trusted_city_session') ||
                localStorage.getItem(CITY_LS_KEY);
      return _canonicalCity(raw);
    } catch (_) { return null; }
  }

  function _detectMetier(query) {
    if (!query || !window.FixeoAIRE ||
        typeof window.FixeoAIRE.detect !== 'function') return null;
    var cat = window.FixeoAIRE.detect(query);
    if (!cat || !cat.cat) return null;
    return VALID_METIERS.indexOf(cat.cat) !== -1 ? cat.cat : null;
  }

  /* ══════════════════════════════════════════════════════
     RESUME CARD — verify existing pricing context
     Shows server-returned values only. No client arithmetic.
  ══════════════════════════════════════════════════════ */
  function _maybeRenderResume(container) {
    var token;
    try { token = sessionStorage.getItem(CTX_KEY); } catch (_) { return; }
    if (!token) return;
    if (!window.FixeoEstimatorReservationBridge) return;

    window.FixeoEstimatorReservationBridge.verifyContext()
      .then(function (ctx) {
        if (!ctx || !ctx.valid) {
          if (window.FixeoEstimatorReservationBridge) {
            window.FixeoEstimatorReservationBridge.clearContext();
          }
          return;
        }
        _renderResumeCard(container, ctx);
      })
      .catch(function () { /* Network failure: degrade gracefully */ });
  }

  function _renderResumeCard(container, ctx) {
    var wrap = _el('div', 'fxep-resume-wrap fxep-public-only');
    var card = _el('div', 'fxep-resume-card');

    card.appendChild(_el('div', 'fxep-resume-dot'));

    var body = _el('div', 'fxep-resume-body');
    body.appendChild(_el('div', 'fxep-resume-label', 'Prix FIXEO vérifié'));
    /* Display server-returned service label — never fabricate */
    var svc = ctx.service_label || (ctx.service_code || '').replace(/\./g, ' ');
    body.appendChild(_el('div', 'fxep-resume-service', _esc(svc)));
    if (ctx.amount_mad) {
      /* Server value only — no multiplication */
      body.appendChild(_el('div', 'fxep-resume-price', Math.round(ctx.amount_mad) + ' MAD'));
    }
    if (ctx.city_slug) {
      body.appendChild(_el('div', 'fxep-resume-price', '📍 ' + _esc(ctx.city_slug)));
    }
    card.appendChild(body);

    var actions = _el('div', 'fxep-resume-actions');

    var continueBtn = _el('button', 'fxep-resume-cta primary', 'Continuer avec ce prix');
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

    var freshBtn = _el('button', 'fxep-resume-cta secondary', 'Nouvelle demande');
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
    /* Insert after header but before hero */
    var hero = container.querySelector('.fxep-hero');
    if (hero) {
      container.insertBefore(wrap, hero);
    } else {
      container.appendChild(wrap);
    }
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
     iOS-safe: no scrollIntoView, no forced focus(), no viewport hacks.
     All chip font-size ≥14px (city list items, non-input).
     Touch targets ≥44px via min-height.
  ══════════════════════════════════════════════════════ */
  function _openCityPicker(onSelect) {
    var existing = document.getElementById('fxep-city-picker-overlay');
    if (existing) existing.remove();

    var overlay = _el('div', '');
    overlay.id = 'fxep-city-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choisir une ville');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9000',
      'background:rgba(9,9,14,0.80)', 'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'display:flex', 'align-items:flex-end', 'justify-content:center',
    ].join(';');

    var sheet = _el('div', '');
    sheet.style.cssText = [
      'width:100%', 'max-width:600px',
      'background:#13131a',
      'border-top:1px solid rgba(255,255,255,0.09)',
      'border-radius:18px 18px 0 0',
      'padding:20px 16px env(safe-area-inset-bottom, 24px)',
      'max-height:80dvh', 'overflow-y:auto',
    ].join(';');

    /* Header */
    var hdr = _el('div', '');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px';
    hdr.appendChild(_el('div', '', '<strong style="font-size:16px;color:#F2F0EC;letter-spacing:-.02em">Choisir une ville</strong>'));
    var closeBtn = _el('button', '');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.style.cssText = [
      'background:rgba(255,255,255,0.08)', 'border:none', 'border-radius:50%',
      'width:34px', 'height:34px', 'font-size:13px', 'color:rgba(242,240,236,0.6)',
      'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
      'flex-shrink:0',
    ].join(';');
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    hdr.appendChild(closeBtn);
    sheet.appendChild(hdr);

    function _sectionLabel(text) {
      var d = _el('div', '');
      d.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(242,240,236,0.32);margin-bottom:10px';
      d.textContent = text;
      return d;
    }

    function _buildChipGrid(cities) {
      var wrap = _el('div', '');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px';
      cities.forEach(function (c) {
        var btn = _el('button', '');
        btn.type = 'button';
        btn.textContent = c;
        btn.style.cssText = [
          'padding:10px 16px', 'border-radius:10px',
          'background:rgba(255,255,255,0.055)', 'border:1px solid rgba(255,255,255,0.09)',
          'color:rgba(242,240,236,0.82)', 'font-size:14px',
          'font-family:inherit', 'cursor:pointer', 'font-weight:500',
          'min-height:44px',
          'transition:background 120ms,border-color 120ms,color 120ms',
        ].join(';');
        btn.addEventListener('pointerover', function () {
          btn.style.background = 'rgba(255,122,0,0.1)';
          btn.style.borderColor = 'rgba(255,122,0,0.3)';
          btn.style.color = '#F2F0EC';
        });
        btn.addEventListener('pointerout', function () {
          btn.style.background = 'rgba(255,255,255,0.055)';
          btn.style.borderColor = 'rgba(255,255,255,0.09)';
          btn.style.color = 'rgba(242,240,236,0.82)';
        });
        btn.addEventListener('click', function () {
          overlay.remove();
          onSelect(c);
        });
        wrap.appendChild(btn);
      });
      return wrap;
    }

    sheet.appendChild(_sectionLabel('Villes principales'));
    sheet.appendChild(_buildChipGrid(_PAGE_TOP_CITIES));
    sheet.appendChild(_sectionLabel('Autres villes'));
    var others = _PAGE_CITIES.filter(function (c) { return _PAGE_TOP_CITIES.indexOf(c) === -1; });
    sheet.appendChild(_buildChipGrid(others));

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  /* ══════════════════════════════════════════════════════
     ESTIMATOR LAUNCH
     Canonical RFOS contract:
       source: 'rafi'
       metier_hint: <VALID_METIERS key> — only if AIRE confirms
       city: <canonical city label> — only if canonical
     DO NOT pass: initial_query, free_text
  ══════════════════════════════════════════════════════ */
  function _launchEstimator(query) {
    if (!window.FixeoEstimatorV2) return;
    var metier = _detectMetier(query);
    var city = _getCity();
    var ctx = { source: 'rafi' };
    if (metier) ctx.metier_hint = metier;
    if (city)   ctx.city = city;
    window.FixeoEstimatorV2.open(ctx);
  }

  /* ══════════════════════════════════════════════════════
     SUGGESTION REFRESH (AIRE-driven)
  ══════════════════════════════════════════════════════ */
  function _refreshSuggestions(wrap, inputEl, query) {
    if (!query || query.length < 2) {
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
    if (window.FixeoAIRE && typeof window.FixeoAIRE.detect === 'function') {
      var cat = window.FixeoAIRE.detect(query);
      if (cat && cat.cat &&
          window.FixeoHeroSuggestionsV2 &&
          typeof window.FixeoHeroSuggestionsV2.refreshForCategory === 'function') {
        window.FixeoHeroSuggestionsV2.refreshForCategory(cat.cat);
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     HEADER
  ══════════════════════════════════════════════════════ */
  function _renderHeader(container) {
    var header = _el('header', 'fxep-header fxep-public-only');
    header.setAttribute('role', 'banner');

    var brand = _el('a', 'fxep-header-brand');
    brand.href = '/';
    brand.setAttribute('aria-label', 'FIXEO — Accueil');
    var img = document.createElement('img');
    img.src = '/img/logo.png';
    img.alt = 'FIXEO';
    img.height = 26;
    img.loading = 'eager';
    brand.appendChild(img);
    header.appendChild(brand);

    /* RAFI technology badge */
    var badge = _el('div', 'fxep-header-rafi-badge');
    badge.setAttribute('aria-label', 'Technologie RAFI');
    badge.appendChild(_el('span', 'fxep-header-rafi-dot'));
    badge.appendChild(document.createTextNode('RAFI'));
    header.appendChild(badge);

    header.appendChild(_el('div', 'fxep-header-spacer'));

    var back = _el('a', 'fxep-header-back', '← Accueil');
    back.href = '/';
    header.appendChild(back);

    container.insertBefore(header, container.firstChild);
  }

  /* ══════════════════════════════════════════════════════
     HERO — RAFI COMMAND CENTER
  ══════════════════════════════════════════════════════ */
  function _renderHero(container) {
    var city = _getCity();

    var section = _el('section', 'fxep-hero fxep-public-only');
    section.setAttribute('aria-label', 'Estimation FIXEO — RAFI command center');

    /* RAFI technology signal */
    var signal = _el('div', 'fxep-hero-signal');
    signal.setAttribute('aria-hidden', 'true');
    signal.appendChild(_el('span', 'fxep-hero-signal-line'));
    signal.appendChild(_el('span', 'fxep-hero-signal-dot'));
    signal.appendChild(document.createTextNode('RAFI · Moteur d\'analyse FIXEO'));
    signal.appendChild(_el('span', 'fxep-hero-signal-line r'));
    section.appendChild(signal);

    /* Eyebrow */
    section.appendChild(_el('span', 'fxep-hero-eyebrow', 'ESTIMATION FIXEO'));

    /* H1 */
    var h1 = _el('h1', 'fxep-hero-h1', 'Obtenez votre estimation FIXEO');
    section.appendChild(h1);

    /* Subtitle */
    section.appendChild(_el('p', 'fxep-hero-sub',
      'Décrivez votre intervention. RAFI analyse votre besoin et vérifie ' +
      'si un Prix FIXEO peut être établi avant de choisir votre artisan.'));

    /* Input card / analysis console */
    var card = _el('div', 'fxep-input-card');
    card.setAttribute('role', 'search');

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
    /* CRITICAL: font-size ≥16px prevents iOS Safari auto-zoom on focus */
    input.style.fontSize = '1rem';
    inputRow.appendChild(input);

    var clearBtn = _el('button', 'fxep-input-clear', '✕');
    clearBtn.type = 'button';
    clearBtn.setAttribute('aria-label', 'Effacer la saisie');
    clearBtn.addEventListener('click', function () {
      input.value = '';
      card.classList.remove('has-value');
      input.focus();
      _refreshSuggestions(suggestWrap, input, null);
    });
    inputRow.appendChild(clearBtn);
    card.appendChild(inputRow);

    /* City row */
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
        city = selectedCity;
        _updateCityChip(selectedCity);
        try { sessionStorage.setItem('fxrf4_trusted_city_session', selectedCity); } catch (_) {}
        try { localStorage.setItem(CITY_LS_KEY, selectedCity); } catch (_) {}
      });
    });
    cityRow.appendChild(cityChip);
    card.appendChild(cityRow);

    /* Suggestion chips */
    var suggestWrap = _buildSuggestions(GENERAL_SUGGESTIONS, input);
    card.appendChild(suggestWrap);

    section.appendChild(card);

    /* Product pipeline micro-signal */
    var rail = _el('div', 'fxep-pipeline-rail');
    rail.setAttribute('aria-hidden', 'true');
    var nodes = [
      { icon: '🔍', label: 'RAFI analyse' },
      { icon: '→', label: null, arrow: true },
      { icon: '📐', label: 'Périmètre vérifié' },
      { icon: '→', label: null, arrow: true },
      { icon: '✓', label: 'Résultat adapté' },
    ];
    nodes.forEach(function (n) {
      if (n.arrow) {
        rail.appendChild(_el('span', 'fxep-pipeline-arrow', '→'));
      } else {
        var node = _el('span', 'fxep-pipeline-node');
        node.appendChild(_el('span', 'fxep-pipeline-icon', n.icon));
        node.appendChild(document.createTextNode(n.label));
        rail.appendChild(node);
      }
    });
    section.appendChild(rail);

    /* Primary CTA */
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

  /* ══════════════════════════════════════════════════════
     OUTCOME ARCHITECTURE — "Une analyse, le bon parcours."
     Shows 4 possible RAFI outcomes. No fake percentages.
     No fake confidence. No fake timing.
  ══════════════════════════════════════════════════════ */
  function _renderOutcomes(container) {
    var section = _el('section', 'fxep-outcomes fxep-public-only');
    section.setAttribute('aria-label', 'Parcours RAFI selon le type d\'intervention');

    section.appendChild(_el('div', 'fxep-section-label', 'Une analyse, le bon parcours.'));
    section.appendChild(_el('h2', 'fxep-outcomes-heading', 'RAFI choisit le bon résultat'));
    section.appendChild(_el('p', 'fxep-outcomes-sub',
      'RAFI ne produit pas de prix pour toute intervention. ' +
      'Quand le périmètre n\'est pas identifiable, il vous oriente vers la bonne étape suivante.'));

    var grid = _el('div', 'fxep-outcomes-grid');

    var OUTCOMES = [
      {
        icon: '💰',
        name: 'Prix FIXEO',
        desc: 'Le périmètre est identifiable : FIXEO peut afficher un prix vérifié.',
        cls: 'fxep-outcome-card is-price',
      },
      {
        icon: '🔎',
        name: 'Diagnostic',
        desc: 'Une vérification sur place est nécessaire avant de chiffrer correctement.',
        cls: 'fxep-outcome-card',
      },
      {
        icon: '📋',
        name: 'Devis',
        desc: 'Les travaux nécessitent une étude ou plusieurs paramètres sur mesure.',
        cls: 'fxep-outcome-card',
      },
      {
        icon: '👷',
        name: 'Artisan',
        desc: 'RAFI identifie le métier et vous dirige vers les professionnels adaptés.',
        cls: 'fxep-outcome-card',
      },
    ];

    OUTCOMES.forEach(function (o) {
      var card = _el('div', o.cls);
      card.appendChild(_el('span', 'fxep-outcome-icon', o.icon));
      card.appendChild(_el('div', 'fxep-outcome-name', _esc(o.name)));
      card.appendChild(_el('div', 'fxep-outcome-desc', _esc(o.desc)));
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     HOW IT WORKS — 3-step pipeline flow
  ══════════════════════════════════════════════════════ */
  function _renderHow(container) {
    var section = _el('section', 'fxep-how fxep-public-only');
    section.setAttribute('aria-label', 'Comment ça marche');

    section.appendChild(_el('div', 'fxep-section-label', 'Comment ça marche'));

    var steps = _el('div', 'fxep-steps');

    var STEPS = [
      {
        num: '1',
        title: 'Décrivez',
        desc: 'Expliquez simplement ce qui se passe, avec vos propres mots. Pas de jargon technique requis.',
      },
      {
        num: '2',
        title: 'RAFI analyse',
        desc: 'RAFI identifie le métier, précise le périmètre et pose uniquement les questions nécessaires.',
      },
      {
        num: '3',
        title: 'Continuez',
        desc: 'Prix FIXEO lorsqu\'il est vérifiable, sinon diagnostic, devis ou sélection d\'artisan.',
      },
    ];

    STEPS.forEach(function (s) {
      var step = _el('div', 'fxep-step');
      step.appendChild(_el('div', 'fxep-step-num', _esc(s.num)));
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
     ELIGIBLE SERVICES
     SOURCE AUDITED: golden-orchestration-fixtures.v1.json
     PRICE_READY proven services:
       plomberie    — debouchage_evier (GF-PLO-002)
       electricite  — prise_remplacement (GF-ELE-001)
       serrurerie   — porte_claquee_standard (GF-SERR-001), cle_cassee (GF-SERR-003)
       climatisation — installation standard (GF-CLIM-002)
       bricolage    — à l'heure / montage meuble (GF-BRIC-001/2/3)
       nettoyage    — grand ménage (GF-NET-001/2)
       peinture     — mur intérieur all_in (GF-PEIN-001)
       menuiserie   — installation_porte (GF-MENU-003)
     SAFE badge: "Analyse RAFI" for non-proven or ambiguous services.
     NEVER display price ranges (150–350 MAD etc).
  ══════════════════════════════════════════════════════ */
  function _renderServices(container) {
    var section = _el('section', 'fxep-services fxep-public-only');
    section.setAttribute('aria-label', 'Exemples de services');

    section.appendChild(_el('div', 'fxep-section-label', 'Exemples d\'interventions'));

    var SERVICES = [
      /* Proven PRICE_READY from fixtures */
      { icon: '🔧', name: 'Débouchage évier', badge: 'Prix FIXEO possible', priced: true },
      { icon: '⚡', name: 'Prise électrique défectueuse', badge: 'Prix FIXEO possible', priced: true },
      { icon: '🔑', name: 'Porte claquée', badge: 'Prix FIXEO possible', priced: true },
      { icon: '❄️', name: 'Installation climatisation', badge: 'Prix FIXEO possible', priced: true },
      { icon: '🎨', name: 'Peinture mur intérieur', badge: 'Prix FIXEO possible', priced: true },
      /* Proven PRICE_READY: bricolage à l'heure */
      { icon: '🔨', name: 'Bricolage à l\'heure', badge: 'Prix FIXEO possible', priced: true },
    ];

    var grid = _el('div', 'fxep-service-grid');
    SERVICES.forEach(function (s) {
      var item = _el('div', 'fxep-service-item');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      /* Clicking a service card pre-fills the hero input */
      var hint = s.name.toLowerCase();
      item.addEventListener('click', function () {
        var inp = document.getElementById('fxep-nlp-input');
        if (inp) {
          inp.value = hint;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          /* preventScroll: no viewport jump on iOS (3Z.2E.3 contract) */
          inp.focus({ preventScroll: true });
        }
      });
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
      item.appendChild(_el('span', 'fxep-service-icon', s.icon));
      var body = _el('div', 'fxep-service-body');
      body.appendChild(_el('div', 'fxep-service-name', _esc(s.name)));
      body.appendChild(_el('div', 'fxep-service-badge' + (s.priced ? ' is-price' : ''), _esc(s.badge)));
      item.appendChild(body);
      grid.appendChild(item);
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     FIXEO UNIVERSE GATEWAY
     Links to confirmed existing FIXEO routes only.
     No invented hrefs.
  ══════════════════════════════════════════════════════ */
  function _renderGateway(container) {
    var section = _el('section', 'fxep-gateway fxep-public-only');
    section.setAttribute('aria-label', 'Explorer FIXEO');

    section.appendChild(_el('div', 'fxep-section-label', 'Explorez FIXEO'));
    section.appendChild(_el('h2', 'fxep-gateway-heading', 'Continuez dans FIXEO'));
    section.appendChild(_el('p', 'fxep-gateway-sub',
      'Découvrez les autres entrées vers l\'univers FIXEO.'));

    var grid = _el('div', 'fxep-gateway-grid');

    var CARDS = [
      {
        icon: '👷',
        label: 'Explorer les artisans',
        desc: 'Parcourez les profils d\'artisans référencés sur FIXEO dans votre ville.',
        href: '/artisans.html',
      },
      {
        icon: '📝',
        label: 'Publier une demande',
        desc: 'Décrivez votre besoin et recevez des propositions d\'artisans disponibles.',
        href: '/',    /* Homepage — request form is on index */
        openRequest: true,
      },
      {
        icon: '💡',
        label: 'Comment ça marche',
        desc: 'Comprenez le fonctionnement de FIXEO, de RAFI et du Prix FIXEO.',
        href: '/comment-ca-marche.html',
      },
      {
        icon: '🏢',
        label: 'FIXEO Entreprises',
        desc: 'Solutions de maintenance et intervention pour les entreprises.',
        href: '/entreprises.html',
      },
    ];

    CARDS.forEach(function (c) {
      var card;
      if (c.href && !c.openRequest) {
        card = _el('a', 'fxep-gateway-card');
        card.href = c.href;
      } else {
        card = _el('div', 'fxep-gateway-card');
        card.setAttribute('tabindex', '0');
        if (c.openRequest) {
          card.addEventListener('click', function () {
            /* Navigate to homepage — request modal will auto-open via hash or user action */
            window.location.href = '/';
          });
          card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
          });
        }
      }
      card.appendChild(_el('span', 'fxep-gateway-icon', c.icon));
      card.appendChild(_el('div', 'fxep-gateway-label', _esc(c.label)));
      card.appendChild(_el('div', 'fxep-gateway-desc', _esc(c.desc)));
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }

  /* ══════════════════════════════════════════════════════
     TRUST RAIL
     Only verifiable product claims.
     "Profils référencés" (safer than "vérifiés").
     "Paiement après intervention" — confirmed product truth.
     "Analyse gratuite" — confirmed.
     "Prix vérifié lorsque le périmètre le permet" — accurate.
  ══════════════════════════════════════════════════════ */
  function _renderTrust(container) {
    var section = _el('section', 'fxep-trust fxep-public-only');
    section.setAttribute('aria-label', 'Engagements FIXEO');

    var rail = _el('div', 'fxep-trust-rail');
    var ITEMS = [
      { icon: '🆓', label: 'Analyse gratuite' },
      { icon: '🔒', label: 'Paiement après intervention' },
      { icon: '✓', label: 'Prix vérifié par RAFI' },
      { icon: '👷', label: 'Profils référencés FIXEO' },
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
     Max 5. Answers follow product doctrine exactly.
  ══════════════════════════════════════════════════════ */
  function _renderFAQ(container) {
    var section = _el('section', 'fxep-faq fxep-public-only');
    section.setAttribute('aria-label', 'Questions fréquentes');
    section.setAttribute('itemscope', '');
    section.setAttribute('itemtype', 'https://schema.org/FAQPage');

    section.appendChild(_el('div', 'fxep-section-label', 'Questions fréquentes'));

    var list = _el('div', 'fxep-faq-list');

    var QA = [
      {
        q: 'Comment FIXEO calcule-t-il mon estimation ?',
        a: 'RAFI identifie le type d\'intervention à partir de votre description. ' +
           'Lorsque le périmètre est clair et catalogué, le moteur de tarification FIXEO ' +
           'produit un prix vérifié — basé sur les conditions réelles du marché marocain.',
      },
      {
        q: 'Tous les services ont-ils un Prix FIXEO ?',
        a: 'Non. Les interventions dont le coût dépend de mesures précises (surface à peindre, ' +
           'longueur de tuyauterie…) ou de diagnostics sur place ne reçoivent pas de Prix FIXEO. ' +
           'Dans ces cas, RAFI vous oriente vers un artisan pour un diagnostic ou un devis.',
      },
      {
        q: 'Que se passe-t-il si l\'intervention réelle est différente ?',
        a: 'Le Prix FIXEO s\'applique au périmètre que vous avez décrit. Si l\'artisan ' +
           'constate une situation différente sur place, il doit vous l\'expliquer et obtenir ' +
           'votre accord avant de continuer.',
      },
      {
        q: 'Puis-je choisir mon artisan après l\'estimation ?',
        a: 'Oui. Une fois votre résultat obtenu, vous accédez à la liste des artisans référencés ' +
           'disponibles dans votre ville. Vous choisissez librement parmi les profils FIXEO.',
      },
      {
        q: 'Est-ce que l\'analyse est gratuite ?',
        a: 'Oui. L\'analyse par RAFI est entièrement gratuite. Vous ne payez qu\'après ' +
           'l\'intervention de l\'artisan.',
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
     FOOTER SHIM
  ══════════════════════════════════════════════════════ */
  function _renderFooter(container) {
    var footer = _el('footer', 'fxep-footer fxep-public-only');
    footer.setAttribute('role', 'contentinfo');

    var brand = _el('a', 'fxep-footer-brand', 'FIXEO');
    brand.href = '/';
    footer.appendChild(brand);

    var links = _el('div', 'fxep-footer-links');
    var LINKS = [
      { label: 'Comment ça marche', href: '/comment-ca-marche.html' },
      { label: 'Tarifs', href: '/pricing.html' },
      { label: 'Entreprises', href: '/entreprises.html' },
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

    /* Render in order */
    _renderHeader(wrap);
    _renderHero(wrap);

    /* Resume card: inject between header and hero (after _renderHero) */
    _maybeRenderResume(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderOutcomes(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderHow(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderServices(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderGateway(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderTrust(wrap);

    wrap.appendChild(_el('div', 'fxep-section-divider fxep-public-only'));
    _renderFAQ(wrap);

    _renderFooter(wrap);

    /* Prepend before PAGE_REQUIRED layout */
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
