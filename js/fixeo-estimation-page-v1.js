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

      /* Phase 0: Artisan data dependencies — MUST load before fixeo-supabase-loader.js.
         Without these, FixeoSupabaseLoader.load() enters "not configured" branch because
         window.FixeoSupabaseClient === undefined and window.FixeoDB === undefined,
         causing window.ARTISANS to remain empty and producing a false zero-match result.
         See audit 7C.10C.0.1. Same cache keys as index.html (idempotent via loadScriptOnce). */
      loadScriptOnce('js/fixeo-db.js?v=db2')
        .then(function () { return loadScriptOnce('js/supabase-client.js?v=sc2'); })
        /* Phase 1: Artisan data — loader runs after client + DB are ready */
        .then(function () { return loadScriptOnce('js/fixeo-supabase-loader.js?v=sl2'); })
        .then(function () { return loadScriptOnce('js/fixeo_homepage_premium_patch.js?v=fxhome-artisan-section-v1a5-return'); })
        /* Phase 2: Reservation stack — same order as index.html */
        .then(function () { return loadScriptOnce('js/reservation.js?v=v1o-canonical-gate'); })
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
     ARTISAN DATA READINESS
     /estimation: fixeo-supabase-loader.js is lazy-loaded by the reservation
     stack, but its path-guard auto-load only fires for homepage/marketplace/admin.
     On /estimation the LOADED flag stays false and window.ARTISANS stays empty
     unless load() is called explicitly.

     _waitForArtisanData(cb, timeoutMs):
       1. Checks whether ARTISANS is already populated (data-ready fast path).
       2. Otherwise calls FixeoSupabaseLoader.load() — idempotent (LOADED guard).
       3. Waits for the fixeo:artisans:loaded event (fires after _injectIntoMarketplace).
       4. Falls back after timeoutMs (Supabase unreachable / truly zero artisans).
       5. Always calls cb exactly once.

     This ensures window.ARTISANS is populated BEFORE FixeoReservation.open() runs,
     so renderEstimatorArtisanPicker() reads a full dataset and never produces a
     false "Aucun artisan" result due to an empty-array race.

     Reservation.js is NOT modified.
     Supabase schema is NOT modified.
  ══════════════════════════════════════════════════════ */
  var ARTISAN_DATA_TIMEOUT_MS = 6000; // wait up to 6s before fallback-open

  function _waitForArtisanData(cb) {
    /* Fast path: artisans already in window.ARTISANS */
    if (Array.isArray(window.ARTISANS) && window.ARTISANS.length > 0) {
      cb();
      return;
    }

    var done = false;
    function _once() {
      if (done) return;
      done = true;
      window.removeEventListener('fixeo:artisans:loaded', _once);
      cb();
    }

    /* Listen for the event fired by _injectIntoMarketplace */
    window.addEventListener('fixeo:artisans:loaded', _once, { once: true });

    /* Safety timeout: if Supabase is unreachable or FixeoDB is empty,
       the event never fires — open reservation anyway (true zero-match handled by UI) */
    setTimeout(function () {
      if (!done) {
        console.warn('[fxep] artisan data timeout — opening reservation with available data');
        _once();
      }
    }, ARTISAN_DATA_TIMEOUT_MS);

    /* Trigger load — idempotent (LOADED flag prevents double-fetch) */
    if (window.FixeoSupabaseLoader &&
        typeof window.FixeoSupabaseLoader.load === 'function') {
      window.FixeoSupabaseLoader.load();
    } else {
      /* Loader not yet attached — script still loading; event will fire after script evaluates
         and auto-attach; worst case the timeout fires */
    }
  }

  /* Estimator confirmation is handled once by FixeoEstimatorReservationBridge. */

  /* Preload reservation stack on idle — also triggers artisan data fetch early,
     so that window.ARTISANS is populated before the user taps "Trouver un artisan".
     This minimizes visible loading time on the handoff. */
  (function () {
    var _idle = window.requestIdleCallback
      ? function (cb) { window.requestIdleCallback(cb, { timeout: 3000 }); }
      : function (cb) { setTimeout(cb, 2000); };
    _idle(function () {
      _ensureReservationLoader();
      window._loadReservationStack(function () {
        /* After scripts load, start artisan fetch immediately (idempotent) */
        if (window.FixeoSupabaseLoader &&
            typeof window.FixeoSupabaseLoader.load === 'function') {
          window.FixeoSupabaseLoader.load();
        }
      });
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

    var completed = window.FixeoEstimatorReservationBridge.getCompletion(token);
    if (completed) {
      _renderResumeCard(container, {completed: completed});
      return;
    }
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
    body.appendChild(_el('div', 'fxep-resume-label', ctx.completed ? 'Demande enregistrée' : 'Prix FIXEO vérifié'));
    /* Display server-returned service label — never fabricate */
    var svc = ctx.completed ? 'Référence : ' + ctx.completed.tracking_ref : ctx.service_label || (ctx.service_code || '').replace(/\./g, ' ');
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

    var continueBtn = _el('button', 'fxep-resume-cta primary', ctx.completed ? 'Suivre ma demande' : 'Continuer avec ce prix');
    continueBtn.type = 'button';
    continueBtn.addEventListener('click', function () {
      if (ctx.completed) { window.location.assign('/suivi-demande.html'); return; }
      var bridge = window.FixeoEstimatorReservationBridge;
      if (bridge && typeof bridge.openConfirmation === 'function') {
        bridge.openConfirmation(bridge.getContext());
      }
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
     Pass the description as editable text; the server still qualifies the request.
  ══════════════════════════════════════════════════════ */
  function _launchEstimator(query) {
    if (!window.FixeoEstimatorV2) return;
    var metier = _detectMetier(query);
    var city = _getCity();
    var ctx = { source: 'rafi', description: String(query || '').slice(0, 2000) };
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
    var h1 = _el('h1', 'fxep-hero-h1', 'Un problème.<br><span>Voyons plus clair.</span>');
    section.appendChild(h1);

    /* Subtitle */
    section.appendChild(_el('p', 'fxep-hero-sub',
      'Vos mots suffisent. RAFI vous guide vers un périmètre précis et, lorsque c’est possible, un prix vérifié.'));

    /* Input card / analysis console */
    var card = _el('div', 'fxep-input-card');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Commencer mon estimation');
    card.appendChild(_el('div', 'fxep-console-kicker', '<span class="fxep-rafi-orb" aria-hidden="true">✦</span><span>RAFI<small>Votre estimation commence ici</small></span>'));
    var inputLabel = _el('label', 'fxep-console-title', 'Que se passe-t-il ?');
    inputLabel.htmlFor = 'fxep-nlp-input';
    card.appendChild(inputLabel);

    var inputRow = _el('div', 'fxep-input-row');
    var icon = _el('span', 'fxep-input-icon');
    icon.textContent = '↗';
    icon.setAttribute('aria-hidden', 'true');
    inputRow.appendChild(icon);

    var input = document.createElement('textarea');
    input.rows = 2;
    input.maxLength = 2000;
    input.className = 'fxep-nlp-input';
    input.id = 'fxep-nlp-input';
    input.placeholder = 'Ex. : une fuite sous mon évier depuis ce matin…';
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
    // The three-step explanation below replaces the duplicate pipeline rail.

    /* Primary CTA */
    var cta = _el('button', 'fxep-hero-cta', 'Continuer avec RAFI →');
    cta.type = 'button';
    cta.addEventListener('click', function () {
      _launchEstimator(input.value.trim());
    });
    card.insertBefore(cta, suggestWrap);
    var inspiration = document.createElement('details');
    inspiration.className = 'fxep-inspiration';
    inspiration.appendChild(_el('summary', '', 'Besoin d’une idée ?'));
    inspiration.appendChild(suggestWrap);
    card.appendChild(inspiration);
    card.appendChild(_el('p', 'fxep-console-note', 'Analyse gratuite · Aucune intervention déclenchée à cette étape.'));
    var intro = _el('div', 'fxep-hero-intro');
    [signal, section.querySelector('.fxep-hero-eyebrow'), h1, section.querySelector('.fxep-hero-sub')].forEach(function (n) { intro.appendChild(n); });
    intro.appendChild(_el('div', 'fxep-hero-signature', '<span>01 · Votre besoin</span><span>02 · Les bonnes questions</span><span>03 · Une décision éclairée</span>'));
    section.insertBefore(intro, card);

    /* Wire input events */
    input.addEventListener('input', function () {
      var val = input.value;
      card.classList.toggle('has-value', val.length > 0);
      _refreshSuggestions(suggestWrap, input, val);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
    section.appendChild(_el('h2', 'fxep-outcomes-heading', 'Le bon résultat, selon votre intervention.'));
    section.appendChild(_el('p', 'fxep-outcomes-sub',
      'Un prix lorsque le périmètre le permet. Une étape adaptée lorsqu’il faut aller plus loin.'));

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
        name: 'Orientation',
        desc: 'Le besoin demande à être précisé avant de poursuivre. Aucun prix n’est inventé.',
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

    section.appendChild(_el('div', 'fxep-section-label', 'SIMPLE, DU DÉBUT À LA SUITE'));
    section.appendChild(_el('h2', 'fxep-section-title', 'Vous décrivez. RAFI vous guide.'));

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
        title: 'Décidez de la suite',
        desc: 'Consultez votre résultat. Si un prix est proposé, vous choisissez ensuite de confirmer votre demande.',
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

    section.appendChild(_el('div', 'fxep-section-label', 'LES BESOINS DU QUOTIDIEN'));
    section.appendChild(_el('h2', 'fxep-section-title', 'Par où commencer ?'));
    section.appendChild(_el('p', 'fxep-section-copy', 'Choisissez un exemple, puis adaptez-le à votre situation.'));

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
          inp.scrollIntoView({behavior: 'auto', block: 'center'});
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
    // The three-step explanation below replaces the duplicate pipeline rail.
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
           'établit le Prix FIXEO applicable au périmètre validé.',
      },
      {
        q: 'Tous les services ont-ils un Prix FIXEO ?',
        a: 'Non. Selon votre besoin et les précisions recueillies, le résultat peut être un prix, un diagnostic, un devis ou une invitation à préciser votre demande. Le tarif et son périmètre sont indiqués avant toute confirmation.',
      },
      {
        q: 'Que se passe-t-il si l\'intervention réelle est différente ?',
        a: 'Le Prix FIXEO s\'applique au périmètre que vous avez décrit. Si l\'artisan ' +
           'constate une situation différente sur place, il doit vous l\'expliquer et obtenir ' +
           'votre accord avant de continuer.',
      },
      {
        q: 'Que se passe-t-il après mon estimation ?',
        a: 'Lorsqu’un prix est proposé, vous pouvez poursuivre vers la confirmation avec votre téléphone. ' +
           'Une fois la demande enregistrée, FIXEO recherche un artisan. Son acceptation reste à confirmer et vous pouvez suivre votre demande.',
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
  /* Illustrative examples: never an API result, quote or automatic diagnosis. */
  function _renderDiscovery(container) {
    var section = _el('section', 'fxep-discovery fxep-public-only');
    section.setAttribute('aria-labelledby', 'fxep-discovery-title');
    section.appendChild(_el('div', 'fxep-section-label', 'LE DÉCLIC RAFI · EXEMPLE INTERACTIF'));
    var title = _el('h2', 'fxep-section-title', 'Derrière vos mots,<br>les bonnes questions.');
    title.id = 'fxep-discovery-title';
    section.appendChild(title);
    section.appendChild(_el('p', 'fxep-section-copy', 'Explorez un exemple pour comprendre la démarche. Votre analyse personnelle commence dans RAFI.'));
    var examples = [
      { name: 'Une fuite', phrase: '« Il y a de l’eau sous mon évier. »', category: 'Plomberie', detail: 'Localiser la fuite avant de définir l’intervention.', questions: ['D’où vient l’eau ?', 'Le raccord est-il accessible ?'], hint: 'Il y a de l’eau sous mon évier.' },
      { name: 'Une prise', phrase: '« Ma prise ne fonctionne plus. »', category: 'Électricité', detail: 'Distinguer une prise à remplacer d’une panne à diagnostiquer.', questions: ['Une seule prise est concernée ?', 'Le courant fonctionne-t-il ailleurs ?'], hint: 'Ma prise électrique ne fonctionne plus.' },
      { name: 'Une porte', phrase: '« Ma porte est bloquée. »', category: 'Serrurerie', detail: 'Préciser la situation pour orienter l’intervention.', questions: ['La porte est-elle simplement claquée ?', 'La clé tourne-t-elle dans la serrure ?'], hint: 'Ma porte est bloquée.' }
    ];
    var choices = _el('div', 'fxep-example-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Choisir un exemple');
    section.appendChild(choices);
    var stage = _el('div', 'fxep-example-stage');
    stage.id = 'fxep-example-stage';
    stage.setAttribute('aria-live', 'polite');
    stage.setAttribute('aria-atomic', 'true');
    section.appendChild(stage);
    var selected = 0;
    function show(index) {
      selected = index;
      var ex = examples[index];
      Array.prototype.forEach.call(choices.children, function (btn, i) { btn.setAttribute('aria-pressed', String(i === index)); });
      stage.innerHTML = '<div class="fxep-example-before"><span class="fxep-example-label">VOUS LE DITES SIMPLEMENT</span><p>' + _esc(ex.phrase) + '</p><span class="fxep-example-caption">Pas besoin de connaître le nom de la panne.</span></div>' +
        '<div class="fxep-example-transform" aria-hidden="true">✦</div>' +
        '<div class="fxep-example-after"><span class="fxep-example-label">CE QU’IL FAUT PRÉCISER · ' + _esc(ex.category) + '</span><h3>' + _esc(ex.detail) + '</h3><ul><li>' + _esc(ex.questions[0]) + '</li><li>' + _esc(ex.questions[1]) + '</li></ul><p class="fxep-example-caption">Un prix si le périmètre le permet. Sinon, une orientation adaptée.</p></div>';
    }
    examples.forEach(function (ex, index) {
      var btn = _el('button', '', _esc(ex.name));
      btn.type = 'button';
      btn.setAttribute('aria-controls', stage.id);
      btn.addEventListener('click', function () { show(index); });
      choices.appendChild(btn);
    });
    show(0);
    var tryBtn = _el('button', 'fxep-example-try', 'Partir de cet exemple ↗');
    tryBtn.type = 'button';
    tryBtn.addEventListener('click', function () {
      var input = document.getElementById('fxep-nlp-input');
      if (!input) return;
      input.value = examples[selected].hint;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.scrollIntoView({ behavior: 'auto', block: 'center' });
      input.focus({ preventScroll: true });
    });
    section.appendChild(tryBtn);
    container.appendChild(section);
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

    _renderDiscovery(wrap);
    _renderHow(wrap);
    _renderServices(wrap);
    _renderOutcomes(wrap);
    _renderFAQ(wrap);

    /* Full canonical footer is mounted once by fixeo-footer-global.js. */

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
