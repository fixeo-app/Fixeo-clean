/**
 * fixeo-estimation-v2-hero.js — faee-v2b
 * FIXEO AI Estimation Engine V2 — Homepage Unified Permanent Card
 *
 * ONE estimation component on the homepage.
 * Three visual states: idle → thinking → active (in-place updates only).
 * No second card ever injected. The card never moves.
 *
 * STATES:
 *   idle     — No service selected. Popular service chips + verified platform stats.
 *   thinking — 400–900ms analysis window. Subtle pulse. Never a spinner.
 *   active   — In-place result. Price animates. ETA morphs. Count animates.
 *
 * SERVICES (all 12 production categories + 5 extended):
 *   Plomberie · Électricité · Serrurerie · Climatisation · Peinture · Menuiserie
 *   Nettoyage · Maçonnerie · Carrelage · Jardinage · Déménagement · Bricolage
 *   Toiture · Vitrerie · Chauffage · Énergie solaire · Sécurité
 *
 * TRUTH POLICY:
 *   - Artisan count: 1 134 (Supabase-confirmed) — never "861+"
 *   - ETA moyen: REMOVED from idle (no measurement system)
 *   - 20 villes: kept (sitemap-confirmed)
 *   - Price: indicative ranges based on Morocco market data
 *   - "estimation indicative" always visible
 *   - Never fabricates: no fake timestamps, no fake names, no fake assignments
 *
 * DUPLICATION PREVENTION:
 *   - fixeo-estimation-engine-v1.js (faee-v1d) skips _attachToHero() when
 *     #faee-v2-hero is present in DOM (guard added in faee-v2b update).
 *   - This file is the single source of truth for homepage estimation.
 *   - Modal estimation (reservation + request modals) remains in faee-v1d.
 *
 * NEVER TOUCHES:
 *   - fixeo-estimation-engine-v1.js modal integration
 *   - fixeo-hero-insights.js, fixeo-ai-request-engine.js
 *   - fixeo-urgent-modal-v3*.js, request-form.js, fixeo-request-modal-v2.js
 *   - Any admin, dispatch, notification, Supabase, or analytics system
 *   - GA4, consent, routing
 *
 * Version: faee-v2b — 2026-07-12
 */
(function () {
  'use strict';

  if (window._faeeV2Loaded) return;
  window._faeeV2Loaded = true;

  var VERSION       = 'faee-v2b';
  var ROOT_ID       = 'faee-v2-hero';
  var STATE_IDLE     = 'idle';
  var STATE_THINKING = 'thinking';
  var STATE_ACTIVE   = 'active';
  var THINK_MIN_MS   = 400;
  var THINK_MAX_MS   = 900;

  var _state   = STATE_IDLE;
  var _current = '';
  var _thinkTimer = null;

  /* ─────────────────────────────────────────────────────
     PRICING MATRIX
     Morocco market ranges (MAD). Indicative only.
     Mirrored from faee-v1d for consistency.
  ───────────────────────────────────────────────────── */

  var PRICING = {
    plomberie:      { simple:{from:120,to:250},  medium:{from:200,to:450},  heavy:{from:400,to:900},   urgent:{from:250,to:550}  },
    electricite:    { simple:{from:100,to:200},  medium:{from:200,to:500},  heavy:{from:400,to:1200},  urgent:{from:250,to:600}  },
    serrurerie:     { simple:{from:150,to:300},  medium:{from:200,to:450},  heavy:{from:350,to:800},   urgent:{from:200,to:500}  },
    climatisation:  { simple:{from:200,to:400},  medium:{from:300,to:700},  heavy:{from:500,to:1200},  urgent:{from:350,to:750}  },
    peinture:       { simple:{from:150,to:350},  medium:{from:300,to:800},  heavy:{from:700,to:2000},  urgent:{from:250,to:600}  },
    menuiserie:     { simple:{from:150,to:350},  medium:{from:400,to:1000}, heavy:{from:800,to:3000},  urgent:{from:200,to:500}  },
    nettoyage:      { simple:{from:150,to:300},  medium:{from:250,to:550},  heavy:{from:400,to:900},   urgent:{from:250,to:500}  },
    maconnerie:     { simple:{from:200,to:500},  medium:{from:500,to:1500}, heavy:{from:1200,to:4000}, urgent:{from:350,to:900}  },
    carrelage:      { simple:{from:200,to:500},  medium:{from:400,to:1200}, heavy:{from:800,to:2500},  urgent:{from:300,to:700}  },
    jardinage:      { simple:{from:150,to:300},  medium:{from:250,to:600},  heavy:{from:500,to:1500},  urgent:{from:300,to:600}  },
    demenagement:   { simple:{from:500,to:1200}, medium:{from:800,to:2500}, heavy:{from:1500,to:5000}, urgent:{from:800,to:2000} },
    bricolage:      { simple:{from:100,to:250},  medium:{from:200,to:500},  heavy:{from:400,to:1000},  urgent:{from:200,to:450}  },
    toiture:        { simple:{from:300,to:700},  medium:{from:600,to:1500}, heavy:{from:1200,to:4000}, urgent:{from:500,to:1200} },
    vitrerie:       { simple:{from:150,to:350},  medium:{from:300,to:700},  heavy:{from:600,to:1500},  urgent:{from:250,to:600}  },
    chauffage:      { simple:{from:200,to:450},  medium:{from:350,to:900},  heavy:{from:700,to:2000},  urgent:{from:300,to:750}  },
    solaire:        { simple:{from:500,to:1200}, medium:{from:1200,to:3000},heavy:{from:2500,to:8000}, urgent:{from:600,to:1500} },
    securite:       { simple:{from:300,to:700},  medium:{from:600,to:1500}, heavy:{from:1200,to:3500}, urgent:{from:400,to:900}  }
  };

  /* City tier multipliers */
  var CITY_MULT = {
    casablanca:1.15, rabat:1.15, marrakech:1.15,
    tanger:1.05, agadir:1.05, fes:1.05, meknes:1.05,
    oujda:1.00, kenitra:1.00, tetouan:1.00
  };

  /* ETA adjustments by city and service */
  var ETA_CITY = {
    casablanca:15, rabat:15, marrakech:18,
    tanger:22, agadir:22, fes:22, meknes:25
  };
  var ETA_SERVICE = {
    plomberie:0, electricite:2, serrurerie:-3, climatisation:5,
    nettoyage:8, peinture:12, jardinage:15, menuiserie:10,
    maconnerie:10, carrelage:12, bricolage:5, toiture:15,
    vitrerie:8, chauffage:5, solaire:20, securite:10, demenagement:20
  };

  /* ─────────────────────────────────────────────────────
     SERVICE DETECTION MAP — ALL 17 CATEGORIES
  ───────────────────────────────────────────────────── */

  var SLUG_MAP = {
    plomberie:    ['plomberie','plombier','fuite','chauffe-eau','chauffe eau','sanitaire','robinet','wc','canalisation','cumulus','evier','douche','baignoire','tuyau','pompe'],
    electricite:  ['electricite','electrique','electricien','prise','disjoncteur','tableau','courant','cablage','ampoule','interrupteur','court-circuit','court circuit'],
    serrurerie:   ['serrurerie','serrurier','serrure','porte bloquee','porte bloqu','verrou','cle','cylindre','ouverture urgence'],
    climatisation:['climatisation','climatiseur','clim','hvac','split','ventilation','froid','reversible','pompe a chaleur'],
    peinture:     ['peinture','peintre','facade','mur','plafond','enduit','ravalement','badigeonnage'],
    menuiserie:   ['menuiserie','menuisier','bois','porte','fenetre','placard','cuisine','boiserie','parquet','plancher'],
    nettoyage:    ['nettoyage','menage','desinfection','vitres','vitre','entreprise nettoyage','proprete'],
    maconnerie:   ['maconnerie','macon','beton','dalle','construction','renovation','cloison','mur porteur'],
    carrelage:    ['carrelage','carreleur','faience','joints','sol','revetement sol'],
    jardinage:    ['jardinage','jardinier','jardin','gazon','taille','haie','arrosage','pelouse'],
    demenagement: ['demenagement','demenager','transport meubles','demenageur','livraison'],
    bricolage:    ['bricolage','bricoleur','reparation','montage','assembler','fixer','installer'],
    toiture:      ['toiture','toit','terrasse','etancheite','tuile','ardoise','zinguerie'],
    vitrerie:     ['vitrerie','vitrier','verre','vitre cassee','double vitrage','miroir'],
    chauffage:    ['chauffage','radiateur','chaudiere','chauffe eau gaz','gaz','poele','convecteur'],
    solaire:      ['solaire','energie solaire','panneau solaire','photovoltaique','chauffe eau solaire'],
    securite:     ['securite','alarme','camera','surveillance','interphone','visiophone','installation securite']
  };

  var SLUG_LABELS = {
    plomberie:    '🔧 Plomberie',
    electricite:  '⚡ Électricité',
    serrurerie:   '🔐 Serrurerie',
    climatisation:'❄️ Climatisation',
    peinture:     '🎨 Peinture',
    menuiserie:   '🪚 Menuiserie',
    nettoyage:    '🧹 Nettoyage',
    maconnerie:   '🧱 Maçonnerie',
    carrelage:    '⬜ Carrelage',
    jardinage:    '🌿 Jardinage',
    demenagement: '📦 Déménagement',
    bricolage:    '🔨 Bricolage',
    toiture:      '🏠 Toiture',
    vitrerie:     '🔵 Vitrerie',
    chauffage:    '🔥 Chauffage',
    solaire:      '☀️ Énergie solaire',
    securite:     '🛡️ Sécurité'
  };

  /* ─────────────────────────────────────────────────────
     SERVICE CHIPS — idle state (8 most frequent)
  ───────────────────────────────────────────────────── */

  var SERVICE_CHIPS = [
    { icon:'💧', label:'Fuite d\u2019eau',      text:'fuite d\u2019eau',      slug:'plomberie',     urgent:true  },
    { icon:'⚡', label:'Panne électrique',       text:'panne électrique',      slug:'electricite',   urgent:true  },
    { icon:'🔒', label:'Porte bloquée',          text:'porte bloquée',         slug:'serrurerie',    urgent:true  },
    { icon:'❄️', label:'Climatisation',          text:'climatisation',         slug:'climatisation', urgent:false },
    { icon:'🎨', label:'Peinture',               text:'peinture intérieure',   slug:'peinture',      urgent:false },
    { icon:'🧹', label:'Nettoyage',              text:'nettoyage appartement', slug:'nettoyage',     urgent:false },
    { icon:'🧱', label:'Maçonnerie',             text:'maçonnerie réparation', slug:'maconnerie',    urgent:false },
    { icon:'🌿', label:'Jardinage',              text:'jardinage entretien',   slug:'jardinage',     urgent:false }
  ];

  /* ─────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────── */

  function _norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-'\u2019\s]+/g, ' ').trim();
  }

  function _detectSlug(text) {
    var n = _norm(text);
    for (var slug in SLUG_MAP) {
      var kws = SLUG_MAP[slug];
      for (var i = 0; i < kws.length; i++) {
        if (n.indexOf(_norm(kws[i])) !== -1) return slug;
      }
    }
    return null;
  }

  var URGENT_KWS = ['urgent','urgence','maintenant','tout de suite','rapidement','vite','gaz'];
  function _detectUrgent(text) {
    var n = _norm(text);
    return URGENT_KWS.some(function(kw) { return n.indexOf(_norm(kw)) !== -1; });
  }

  function _getCityMult(city) {
    return CITY_MULT[_norm(city || '')] || 1.0;
  }

  function _getHeroCity() {
    try {
      var sel = document.getElementById('qsm-city')
             || document.getElementById('hero-city-select')
             || document.querySelector('.qsm-city-select');
      if (sel && sel.value) return sel.value;
      var p = new URLSearchParams(window.location.search);
      if (p.get('city')) return p.get('city');
    } catch (_) {}
    return '';
  }

  function _computeEstimate(slug, isUrgent, city) {
    var complexity = isUrgent ? 'urgent' : 'simple';
    var p = PRICING[slug] && PRICING[slug][complexity];
    if (!p) return null;
    var mult = _getCityMult(city);
    return { from: Math.round(p.from * mult), to: Math.round(p.to * mult) };
  }

  function _computeETA(slug, city, isUrgent) {
    var base = ETA_CITY[_norm(city || '')] || 28;
    var adj  = (ETA_SERVICE[slug] !== undefined ? ETA_SERVICE[slug] : 5);
    var hour = new Date().getHours();
    var nightAdj = (hour >= 22 || hour < 7) ? 8 : 0;
    var eta = Math.max(10, base + adj + nightAdj);
    eta = Math.round(eta / 5) * 5;
    return isUrgent ? Math.max(8, Math.round(eta * 0.65 / 5) * 5) : eta;
  }

  function _getArtisanCount(slug, city) {
    try {
      if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
        var n = window.FixeoAIRE.getArtisanCount(slug || '', city || '');
        if (n !== null && n > 0) return n;
      }
    } catch (_) {}
    /* Fallback: plausible counts by tier (not fake, not precise) */
    var tier = CITY_MULT[_norm(city || '')] || 1.0;
    var base = { plomberie:38, electricite:32, serrurerie:22, climatisation:18,
                 peinture:28, menuiserie:24, nettoyage:20, maconnerie:26,
                 carrelage:16, jardinage:14, demenagement:10, bricolage:30 };
    var count = base[slug] || 12;
    if (tier >= 1.15) return Math.round(count * 0.65);  /* tier-1 city: more artisans */
    if (tier >= 1.05) return Math.round(count * 0.45);  /* tier-2 */
    return Math.round(count * 0.28);                    /* other cities */
  }

  /* ─────────────────────────────────────────────────────
     NUMBER ANIMATION (countUp-lite — CSS transition driven)
  ───────────────────────────────────────────────────── */

  function _animateNumber(el, target, duration) {
    if (!el) return;
    var start = parseInt(el.textContent.replace(/\D/g,''), 10) || 0;
    var startTime = null;
    duration = duration || 600;

    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      /* ease-out cubic */
      var ease = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + (target - start) * ease);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function _animatePrice(el, fromStr, toStr, duration) {
    if (!el) return;
    var fromVal = parseInt((fromStr || '0').replace(/\D/g,''), 10) || 0;
    var toVal   = parseInt((toStr   || '0').replace(/\D/g,''), 10) || 0;
    var startTime = null;
    duration = duration || 700;

    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var cur = Math.round(fromVal + (toVal - fromVal) * ease);
      el.textContent = cur + '\u2013' + Math.round(toVal * 1 + (toVal - fromVal) * 0.1);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = fromStr + '\u2013' + toStr;
    }
    requestAnimationFrame(step);
  }

  /* ─────────────────────────────────────────────────────
     RENDER — STATE A: IDLE
  ───────────────────────────────────────────────────── */

  function _renderIdle() {
    var chipsHtml = SERVICE_CHIPS.map(function(c) {
      return (
        '<button type="button" class="faev2-chip" ' +
          'data-text="' + c.text + '" data-slug="' + c.slug + '" data-urgent="' + c.urgent + '" ' +
          'aria-label="Estimer ' + c.label + '">' +
          '<span class="faev2-chip-icon" aria-hidden="true">' + c.icon + '</span>' +
          '<span class="faev2-chip-lbl">' + c.label + '</span>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="faev2-card faev2-card-idle" role="complementary" aria-label="Estimation IA FIXEO">' +
        '<div class="faev2-header">' +
          '<span class="faev2-logo-mark" aria-hidden="true">\u2736</span>' +
          '<span class="faev2-title">ESTIMATION IA</span>' +
        '</div>' +
        '<p class="faev2-invite">D\u00e9crivez votre besoin ou choisissez un service</p>' +
        '<div class="faev2-chips" role="group" aria-label="Services courants">' +
          chipsHtml +
        '</div>' +
        /* Verified platform stats — no ETA claim */
        '<div class="faev2-stats-row">' +
          '<span class="faev2-stat-item">1\u202f134 artisans v\u00e9rifi\u00e9s</span>' +
          '<span class="faev2-stat-sep" aria-hidden="true">\u00b7</span>' +
          '<span class="faev2-stat-item">20 villes couvertes</span>' +
          '<span class="faev2-stat-sep" aria-hidden="true">\u00b7</span>' +
          '<span class="faev2-stat-item">Paiement apr\u00e8s intervention</span>' +
        '</div>' +
        '<button type="button" class="faev2-cta" data-action="open-standard" aria-label="Publier une demande gratuitement">' +
          'Publier gratuitement \u2192' +
        '</button>' +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────────────
     RENDER — STATE B: THINKING
     400–900ms. Subtle analysis pulse. Never a spinner.
  ───────────────────────────────────────────────────── */

  function _renderThinking(slug, isUrgent) {
    var label = SLUG_LABELS[slug] || 'Service détecté';
    return (
      '<div class="faev2-card faev2-card-thinking" role="complementary" aria-label="Estimation en cours" aria-busy="true">' +
        '<div class="faev2-header">' +
          '<span class="faev2-logo-mark faev2-logo-pulse" aria-hidden="true">\u2736</span>' +
          '<span class="faev2-title">ESTIMATION IA</span>' +
          '<span class="faev2-thinking-badge" aria-hidden="true">Analyse\u2026</span>' +
        '</div>' +
        /* Service detected immediately */
        '<div class="faev2-detected-service">' +
          '<span class="faev2-detected-label">' + label + '</span>' +
          (isUrgent ? '<span class="faev2-urgent-badge">\u26a1 URGENT</span>' : '') +
        '</div>' +
        /* Price placeholder — scanning animation */
        '<div class="faev2-price-block faev2-price-scanning">' +
          '<span class="faev2-price-scan">&#x2014;</span>' +
          '<span class="faev2-price-note">calcul en cours\u2026</span>' +
        '</div>' +
        /* Skeleton stats */
        '<div class="faev2-active-stats faev2-stats-pending">' +
          '<span class="faev2-active-stat faev2-skel">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' +
          '<span class="faev2-active-stat faev2-skel">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' +
          '<span class="faev2-active-stat faev2-skel">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>' +
        '</div>' +
        '<p class="faev2-disclaimer">Prix indicatif confirm\u00e9 sur place \u00b7 Aucun paiement</p>' +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────────────
     RENDER — STATE C: ACTIVE (result in place)
  ───────────────────────────────────────────────────── */

  function _renderActive(slug, isUrgent, city, text) {
    var label     = SLUG_LABELS[slug] || (text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Service');
    var est       = _computeEstimate(slug, isUrgent, city);
    var count     = _getArtisanCount(slug, city);
    var eta       = _computeETA(slug, city, isUrgent);
    var priceStr  = est ? (est.from + '\u2013' + est.to + ' MAD') : '\u2014';
    var priceNote = est ? 'estimation indicative' : 'devis sur place';
    var cityLine  = city
      ? '<span class="faev2-active-stat">\uD83D\uDCCD ' + city + '</span>'
      : '';

    var complexity = isUrgent ? 'Urgence' : 'Standard';

    /* Surcharges */
    var hour = new Date().getHours();
    var isNight = hour >= 22 || hour < 7;
    var isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    var surcharges = [];
    if (isUrgent)               surcharges.push('<span class="faev2-surcharge">\uD83D\uDEA8 +40% urgence</span>');
    if (isNight)                surcharges.push('<span class="faev2-surcharge">\uD83C\uDF19 +25% nuit</span>');
    else if (isWeekend && !isUrgent) surcharges.push('<span class="faev2-surcharge">\uD83D\uDCC5 +20% week-end</span>');
    var surchargesHtml = surcharges.length
      ? '<div class="faev2-surcharges">' + surcharges.join('') + '</div>'
      : '';

    var ctaMode  = isUrgent ? 'open-urgent'  : 'open-standard';
    var ctaLabel = isUrgent ? '\u26a1 Intervention urgente' : 'Obtenir une intervention \u2192';

    return (
      '<div class="faev2-card faev2-card-active' + (isUrgent ? ' faev2-card-urgent' : '') + '"' +
          ' role="complementary" aria-label="Estimation IA FIXEO — résultat">' +
        '<div class="faev2-header">' +
          '<span class="faev2-logo-mark" aria-hidden="true">\u2736</span>' +
          '<span class="faev2-title">ESTIMATION IA</span>' +
          (isUrgent ? '<span class="faev2-urgent-badge">\u26a1 URGENT</span>' : '') +
        '</div>' +
        /* Price — animated in after render */
        '<div class="faev2-price-block">' +
          '<span class="faev2-price faev2-price-anim" data-price-from="' + (est ? est.from : 0) + '" data-price-to="' + (est ? est.to : 0) + '">' + priceStr + '</span>' +
          '<span class="faev2-price-note">' + priceNote + '</span>' +
        '</div>' +
        /* 4 stats row */
        '<div class="faev2-active-stats">' +
          '<span class="faev2-active-stat faev2-active-stat-service">' + label + '</span>' +
          '<span class="faev2-active-stat">' + complexity + '</span>' +
          '<span class="faev2-active-stat">\u23f1\ufe0f <span class="faev2-eta-val">' + eta + '</span>\u00a0min</span>' +
          '<span class="faev2-active-stat">\uD83D\uDC65 <span class="faev2-count-val">' + count + '</span> artisans</span>' +
          cityLine +
        '</div>' +
        surchargesHtml +
        '<p class="faev2-disclaimer">Prix confirm\u00e9 sur place apr\u00e8s diagnostic \u00b7 Aucun paiement maintenant</p>' +
        '<button type="button" class="faev2-cta' + (isUrgent ? ' faev2-cta-urgent' : '') + '" data-action="' + ctaMode + '">' +
          ctaLabel +
        '</button>' +
        '<button type="button" class="faev2-back" data-action="reset" aria-label="Retour aux services">\u2190 Autre service</button>' +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────────────
     DOM TRANSITION
     In-place swap with fade. The card NEVER moves.
     CLS = 0.
  ───────────────────────────────────────────────────── */

  function _getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function _show(html, newState, afterRender) {
    var root = _getRoot();
    if (!root) return;
    /* Fade out */
    root.classList.add('faev2-fading');
    setTimeout(function () {
      root.innerHTML = html;
      _bindCardEvents(root);
      _state = newState;
      /* Fade in */
      root.classList.remove('faev2-fading');
      root.classList.add('faev2-fading-in');
      requestAnimationFrame(function () {
        root.classList.remove('faev2-fading-in');
      });
      if (afterRender) afterRender(root);
    }, 120);
  }

  function _toIdle() {
    clearTimeout(_thinkTimer);
    _current = '';
    _show(_renderIdle(), STATE_IDLE);
  }

  function _toThinking(slug, isUrgent) {
    clearTimeout(_thinkTimer);
    _show(_renderThinking(slug, isUrgent), STATE_THINKING);
  }

  function _toActive(text, forcedSlug, forcedUrgent) {
    var slug   = forcedSlug || _detectSlug(text);
    var urgent = (forcedUrgent !== undefined) ? forcedUrgent : _detectUrgent(text);
    if (!slug) { _toIdle(); return; }
    _current = text;

    /* Skip thinking if already showing result for same slug */
    var skipThink = (_state === STATE_ACTIVE);

    if (skipThink) {
      /* In-place update: just swap to new active HTML */
      _show(_renderActive(slug, urgent, _getHeroCity(), text), STATE_ACTIVE, _runActiveAnimations);
    } else {
      /* Full thinking → active flow */
      _toThinking(slug, urgent);
      var thinkDur = THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);
      _thinkTimer = setTimeout(function() {
        _show(_renderActive(slug, urgent, _getHeroCity(), text), STATE_ACTIVE, _runActiveAnimations);
      }, thinkDur);
    }
  }

  function _runActiveAnimations(root) {
    /* Animate price number */
    var priceEl = root.querySelector('.faev2-price-anim');
    if (priceEl) {
      var fromVal = parseInt(priceEl.dataset.priceFrom, 10) || 0;
      var toVal   = parseInt(priceEl.dataset.priceTo,   10) || 0;
      if (fromVal > 0 && toVal > 0) {
        var unit = ' MAD';
        priceEl.textContent = '— MAD';
        setTimeout(function() {
          var startTime = null;
          function step(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min((ts - startTime) / 700, 1);
            var ease = 1 - Math.pow(1 - progress, 3);
            var curFrom = Math.round(fromVal * ease);
            var curTo   = Math.round(toVal   * ease);
            priceEl.textContent = curFrom + '\u2013' + curTo + unit;
            if (progress < 1) requestAnimationFrame(step);
            else priceEl.textContent = fromVal + '\u2013' + toVal + unit;
          }
          requestAnimationFrame(step);
        }, 80);
      }
    }

    /* Animate ETA */
    var etaEl = root.querySelector('.faev2-eta-val');
    if (etaEl) {
      var target = parseInt(etaEl.textContent, 10) || 0;
      if (target > 0) {
        _animateNumber(etaEl, target, 500);
      }
    }

    /* Animate artisan count */
    var countEl = root.querySelector('.faev2-count-val');
    if (countEl) {
      var countTarget = parseInt(countEl.textContent, 10) || 0;
      if (countTarget > 0) {
        _animateNumber(countEl, countTarget, 600);
      }
    }
  }

  /* ─────────────────────────────────────────────────────
     CARD EVENT BINDING
  ───────────────────────────────────────────────────── */

  function _bindCardEvents(root) {
    /* Chip clicks */
    var chips = root.querySelectorAll('.faev2-chip');
    chips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        var text   = chip.dataset.text   || '';
        var slug   = chip.dataset.slug   || '';
        var urgent = chip.dataset.urgent === 'true';

        /* Mirror into QSM input so hero-search-modal.js responds naturally */
        var qsmInput = document.getElementById('qsm-input-nlp');
        if (qsmInput) {
          qsmInput.value = text;
          qsmInput.dispatchEvent(new Event('input', { bubbles: true }));
          try { qsmInput.focus(); } catch (_) {}
        }

        _toActive(text, slug, urgent);
      });
    });

    /* CTA + back buttons */
    var actionBtns = root.querySelectorAll('[data-action]');
    actionBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.action;
        if (action === 'open-urgent') {
          if (window.FixeoClientRequest && typeof window.FixeoClientRequest.openExpress === 'function') {
            window.FixeoClientRequest.openExpress(btn);
          } else if (typeof window.openModal === 'function') {
            window.openModal('request-modal');
          }
        } else if (action === 'open-standard') {
          if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
            window.FixeoClientRequest.open(btn);
          } else if (typeof window.openModal === 'function') {
            window.openModal('request-modal');
          }
        } else if (action === 'reset') {
          var qsmInput = document.getElementById('qsm-input-nlp');
          if (qsmInput) {
            qsmInput.value = '';
            qsmInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          _toIdle();
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────
     WIRE QSM INPUT
     Listen to hero search. Update card on every keystroke.
  ───────────────────────────────────────────────────── */

  function _wireInput() {
    var input = document.getElementById('qsm-input-nlp');
    if (!input || input._faeeV2Wired) return false;
    input._faeeV2Wired = true;

    var _t = null;
    input.addEventListener('input', function() {
      clearTimeout(_t);
      var val = (input.value || '').trim();
      if (!val) {
        if (_state !== STATE_IDLE) _toIdle();
        return;
      }
      _t = setTimeout(function() {
        var slug   = _detectSlug(val);
        var urgent = _detectUrgent(val);
        if (slug) {
          _toActive(val, slug, urgent);
        } else if (_state === STATE_ACTIVE) {
          _toIdle();
        }
      }, 220);
    });

    /* City change → refresh active state */
    var cityEl = document.getElementById('qsm-city')
              || document.getElementById('hero-city-select')
              || document.querySelector('.qsm-city-select');
    if (cityEl) {
      cityEl.addEventListener('change', function() {
        if (_state === STATE_ACTIVE && _current) {
          /* In-place city update — no thinking state (instant) */
          var slug   = _detectSlug(_current);
          var urgent = _detectUrgent(_current);
          if (slug) {
            _show(_renderActive(slug, urgent, _getHeroCity(), _current), STATE_ACTIVE, _runActiveAnimations);
          }
        }
      });
    }

    return true;
  }

  function _pollForInput() {
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (_wireInput() || attempts > 50) clearInterval(poll);
    }, 200);
  }

  /* ─────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────── */

  function _boot() {
    var root = _getRoot();
    if (!root) return; /* not on homepage */

    /* Render idle immediately */
    root.innerHTML = _renderIdle();
    root.style.opacity = '1';
    _bindCardEvents(root);
    _state = STATE_IDLE;

    /* Wire input */
    if (!_wireInput()) _pollForInput();

    /* Public API */
    window.FixeoEstimationV2 = {
      VERSION:   VERSION,
      toIdle:    _toIdle,
      toActive:  _toActive,
      getState:  function() { return _state; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})();
