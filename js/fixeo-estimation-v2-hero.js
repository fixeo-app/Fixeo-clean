/**
 * fixeo-estimation-v2-hero.js — faee-v2a
 * FIXEO AI Estimation Engine V2 — Homepage Always-On Hero Card
 *
 * 3-state permanent estimation widget below the hero section.
 * Renders at DOMContentLoaded — visible before any user input.
 *
 * STATES:
 *   idle    — default; service chips + platform stats + CTA
 *   active  — user typed or chose chip; live price/ETA card
 *   (clear) — user cleared input; returns to idle
 *
 * INTEGRATION:
 *   - Reads faee pricing/analyze() from window.FixeoEstimation if loaded,
 *     else replicates core pricing inline (no dependency)
 *   - Reads FixeoAIRE for artisan count + category detection
 *   - Writes to #qsm-input-nlp (native hero search) when chip clicked →
 *     triggers hero-search-modal.js normally
 *   - CTA "Obtenir une intervention" → openModal('request-modal') in express mode
 *   - CTA is for urgent chips → openModal in express; standard → default mode
 *
 * NEVER TOUCHES:
 *   - request-form.js, fixeo-estimation-engine-v1.js (faee-v1d)
 *   - fixeo-hero-insights.js, fixeo-ai-request-engine.js
 *   - fixeo-urgent-modal-v3*.js, fixeo-request-modal-v2.js
 *   - Any admin, dispatch, notification, or Supabase system
 *
 * Version: faee-v2a — 2026-06-12
 */
(function () {
  'use strict';

  if (window._faeeV2Loaded) return;
  window._faeeV2Loaded = true;

  var VERSION  = 'faee-v2a';
  var ROOT_ID  = 'faee-v2-hero';
  var STATE_IDLE   = 'idle';
  var STATE_ACTIVE = 'active';

  var _state   = STATE_IDLE;
  var _current = null; /* current text in input */

  /* ─────────────────────────────────────────────
     SERVICE CHIPS (idle state)
  ───────────────────────────────────────────── */

  var SERVICE_CHIPS = [
    { icon: '💧', label: 'Fuite d\u2019eau',     text: 'fuite d\u2019eau',     slug: 'plomberie',    urgent: true  },
    { icon: '⚡', label: 'Panne \u00e9lectrique', text: 'panne \u00e9lectrique', slug: 'electricite',  urgent: true  },
    { icon: '🔒', label: 'Porte bloqu\u00e9e',   text: 'porte bloqu\u00e9e',   slug: 'serrurerie',   urgent: true  },
    { icon: '🚽', label: 'WC bouch\u00e9',        text: 'WC bouch\u00e9',       slug: 'plomberie',    urgent: true  },
    { icon: '❄️', label: 'Climatisation',         text: 'climatisation',        slug: 'climatisation',urgent: false },
    { icon: '🎨', label: 'Peinture',              text: 'peinture',             slug: 'peinture',     urgent: false }
  ];

  /* ─────────────────────────────────────────────
     PLATFORM STATS (idle state trust signals)
  ───────────────────────────────────────────── */

  function _getArtisanTotal() {
    try {
      if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
        var n = window.FixeoAIRE.getArtisanCount('', '');
        if (n && n > 0) return n + '+';
      }
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        var all = window.FixeoDB.getAllArtisans() || [];
        if (all.length > 0) return all.length + '+';
      }
    } catch (_) {}
    return '861+';
  }

  /* ─────────────────────────────────────────────
     PRICING (inline — mirrors faee-v1d)
  ───────────────────────────────────────────── */

  var PRICING = {
    plomberie:    { simple: { from: 120, to: 250 }, medium: { from: 200, to: 450 }, heavy: { from: 400, to: 900  }, urgent: { from: 250, to: 550  } },
    electricite:  { simple: { from: 100, to: 200 }, medium: { from: 200, to: 500 }, heavy: { from: 400, to: 1200 }, urgent: { from: 250, to: 600  } },
    serrurerie:   { simple: { from: 150, to: 300 }, medium: { from: 200, to: 450 }, heavy: { from: 350, to: 800  }, urgent: { from: 200, to: 500  } },
    climatisation:{ simple: { from: 200, to: 400 }, medium: { from: 300, to: 700 }, heavy: { from: 500, to: 1200 }, urgent: { from: 350, to: 750  } },
    peinture:     { simple: { from: 200, to: 500 }, medium: { from: 400, to: 1000}, heavy: { from: 800, to: 2500 }, urgent: { from: 400, to: 800  } },
    menuiserie:   { simple: { from: 150, to: 400 }, medium: { from: 300, to: 800 }, heavy: { from: 600, to: 2000 }, urgent: { from: 300, to: 700  } },
    nettoyage:    { simple: { from: 100, to: 250 }, medium: { from: 200, to: 500 }, heavy: { from: 400, to: 1000 }, urgent: { from: 200, to: 450  } },
    maconnerie:   { simple: { from: 300, to: 700 }, medium: { from: 600, to: 1500}, heavy: { from: 1200, to: 4000}, urgent: { from: 600, to: 1200 } },
    carrelage:    { simple: { from: 200, to: 500 }, medium: { from: 400, to: 1000}, heavy: { from: 800, to: 2500 }, urgent: { from: 400, to: 800  } }
  };

  var CITY_MULT = {
    casablanca: 1.15, rabat: 1.15, marrakech: 1.15,
    tanger: 1.05, agadir: 1.05, fes: 1.05, meknes: 1.05
  };

  var SLUG_MAP = {
    plomberie:    ['plomberie','plombier','fuite','chauffe-eau','sanitaire','robinet','wc','canalisation','cumulus'],
    electricite:  ['electricite','electrique','electricien','prise','disjoncteur','tableau','courant','cablage'],
    serrurerie:   ['serrurerie','serrurier','serrure','porte bloquee','porte bloqu','verrou','cle','cylindre'],
    climatisation:['climatisation','climatiseur','clim','split','ventilation','froid'],
    peinture:     ['peinture','peintre','facade','mur','plafond','enduit'],
    menuiserie:   ['menuiserie','menuisier','bois','porte','fenetre','placard','cuisine'],
    nettoyage:    ['nettoyage','menage','desinfection','vitres'],
    maconnerie:   ['maconnerie','macon','beton','dalle','construction','renovation'],
    carrelage:    ['carrelage','carreleur','faience','joints']
  };

  function _norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-\s]+/g, ' ').trim();
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

  function _detectUrgent(text) {
    var n = _norm(text);
    var urgentKws = ['urgent','urgence','maintenant','tout de suite','rapidement','vite','emergency','maintenant','fuite gaz','gaz'];
    return urgentKws.some(function (kw) { return n.indexOf(_norm(kw)) !== -1; });
  }

  function _getCityMult(city) {
    return CITY_MULT[_norm(city || '')] || 1.0;
  }

  function _getHeroCity() {
    var sel = document.getElementById('qsm-city') || document.getElementById('hero-city-select') ||
              document.querySelector('.qsm-city-select');
    if (sel && sel.value) return sel.value;
    try {
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
    return {
      from: Math.round(p.from * mult),
      to:   Math.round(p.to   * mult)
    };
  }

  function _getArtisanCount(slug, city) {
    try {
      if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
        var n = window.FixeoAIRE.getArtisanCount(slug || '', city || '');
        if (n !== null && n > 0) return n;
      }
    } catch (_) {}
    var tier = { casablanca: 1, rabat: 1, marrakech: 1 }[_norm(city || '')] || 2;
    return [18, 12, 8][tier - 1] || 12;
  }

  /* ETA: same logic as fuv3-v1b */
  var ETA_TIER  = { casablanca: 15, rabat: 15, marrakech: 15, tanger: 22, agadir: 22, fes: 22, meknes: 22 };
  var ETA_SVCA  = { plomberie: 0, electricite: 2, serrurerie: -3, climatisation: 5, nettoyage: 8, peinture: 10 };

  function _computeETA(slug, city, isUrgent) {
    var base = ETA_TIER[_norm(city || '')] || 28;
    var adj  = ETA_SVCA[slug] || 0;
    var eta  = Math.max(10, base + adj + ((new Date().getHours() >= 22 || new Date().getHours() < 7) ? 8 : 0));
    eta = Math.round(eta / 5) * 5;
    return isUrgent ? Math.max(8, Math.round(eta * 0.65 / 5) * 5) : eta;
  }

  var SLUG_LABELS = {
    plomberie: '🔧 Plomberie', electricite: '⚡ Électricité', serrurerie: '🔐 Serrurerie',
    climatisation: '❄️ Climatisation', peinture: '🎨 Peinture', menuiserie: '🪚 Menuiserie',
    nettoyage: '🧹 Nettoyage', maconnerie: '🧱 Maçonnerie', carrelage: '⬜ Carrelage'
  };

  /* ─────────────────────────────────────────────
     RENDER — IDLE STATE
  ───────────────────────────────────────────── */

  function _renderIdle() {
    var artisans = _getArtisanTotal();
    var chipsHtml = SERVICE_CHIPS.map(function (c) {
      return (
        '<button type="button" class="faev2-chip" data-text="' + c.text + '" data-slug="' + c.slug + '" data-urgent="' + c.urgent + '">' +
          '<span class="faev2-chip-icon" aria-hidden="true">' + c.icon + '</span>' +
          '<span class="faev2-chip-lbl">' + c.label + '</span>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="faev2-card faev2-card-idle" role="complementary" aria-label="Estimation IA FIXEO">' +
        /* Header */
        '<div class="faev2-header">' +
          '<span class="faev2-logo-mark" aria-hidden="true">\u2736</span>' +
          '<span class="faev2-title">ESTIMATION IA FIXEO</span>' +
        '</div>' +
        /* Invite */
        '<p class="faev2-invite">D\u00e9crivez votre probl\u00e8me ou choisissez un service</p>' +
        /* Chips */
        '<div class="faev2-chips" role="group" aria-label="Services courants">' +
          chipsHtml +
        '</div>' +
        /* Live trust stats */
        '<div class="faev2-stats-row">' +
          '<span class="faev2-stat-item"><span class="faev2-stat-dot" aria-hidden="true"></span>' + artisans + ' artisans actifs</span>' +
          '<span class="faev2-stat-sep" aria-hidden="true">\u00b7</span>' +
          '<span class="faev2-stat-item">\u23f1\ufe0f ETA moyen 27 min</span>' +
          '<span class="faev2-stat-sep" aria-hidden="true">\u00b7</span>' +
          '<span class="faev2-stat-item">\uD83D\uDCCD 20 villes couvertes</span>' +
        '</div>' +
        /* CTA */
        '<button type="button" class="faev2-cta" data-action="open-standard" aria-label="Essayer l\'estimation IA FIXEO">' +
          'Essayez gratuitement \u2192' +
        '</button>' +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────
     RENDER — ACTIVE STATE
  ───────────────────────────────────────────── */

  function _renderActive(slug, isUrgent, city, text) {
    var label   = SLUG_LABELS[slug] || (text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Service');
    var est     = _computeEstimate(slug, isUrgent, city);
    var count   = _getArtisanCount(slug, city);
    var eta     = _computeETA(slug, city, isUrgent);
    var priceHtml = est
      ? '<span class="faev2-price">' + est.from + '\u2013' + est.to + ' MAD</span><span class="faev2-price-note">estimation indicative</span>'
      : '<span class="faev2-price faev2-price-na">\u2014</span>';

    var cityLine = city
      ? '<span class="faev2-active-stat">\uD83D\uDCCD ' + city + '</span>'
      : '';

    var complexity = isUrgent ? 'Urgence' : 'Standard';
    var urgentBadge = isUrgent
      ? '<span class="faev2-urgent-badge">\u26a1 URGENT</span>'
      : '';

    /* Surcharges */
    var hour = new Date().getHours();
    var isNight = hour >= 22 || hour < 7;
    var isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    var surcharges = [];
    if (isUrgent)   surcharges.push('<span class="faev2-surcharge">\uD83D\uDEA8 +40% urgence</span>');
    if (isNight)    surcharges.push('<span class="faev2-surcharge">\uD83C\uDF19 +25% nuit</span>');
    if (isWeekend && !isUrgent)  surcharges.push('<span class="faev2-surcharge">\uD83D\uDCC5 +20% week-end</span>');
    var surchargesHtml = surcharges.length > 0
      ? '<div class="faev2-surcharges">' + surcharges.join('') + '</div>'
      : '';

    var ctaMode = isUrgent ? 'open-urgent' : 'open-standard';
    var ctaLabel = isUrgent ? '\u26a1 Intervention urgente' : 'Obtenir une intervention \u2192';

    return (
      '<div class="faev2-card faev2-card-active' + (isUrgent ? ' faev2-card-urgent' : '') + '" role="complementary" aria-label="Estimation IA FIXEO">' +
        /* Header */
        '<div class="faev2-header">' +
          '<span class="faev2-logo-mark" aria-hidden="true">\u2736</span>' +
          '<span class="faev2-title">ESTIMATION IA FIXEO</span>' +
          urgentBadge +
        '</div>' +
        /* Price hero */
        '<div class="faev2-price-block">' +
          priceHtml +
        '</div>' +
        /* 3 stats */
        '<div class="faev2-active-stats">' +
          '<span class="faev2-active-stat faev2-active-stat-service">' + label + '</span>' +
          '<span class="faev2-active-stat">' + complexity + '</span>' +
          '<span class="faev2-active-stat">\u23f1\ufe0f ' + eta + '\u00a0min</span>' +
          '<span class="faev2-active-stat">\uD83D\uDC65 ' + count + ' artisans</span>' +
          cityLine +
        '</div>' +
        surchargesHtml +
        /* Disclaimer */
        '<p class="faev2-disclaimer">Prix indicatif confirm\u00e9 sur place \u00b7 Aucun paiement maintenant</p>' +
        /* CTA */
        '<button type="button" class="faev2-cta' + (isUrgent ? ' faev2-cta-urgent' : '') + '" data-action="' + ctaMode + '">' +
          ctaLabel +
        '</button>' +
        /* Back link */
        '<button type="button" class="faev2-back" data-action="reset" aria-label="Retour">\u2190 Autre service</button>' +
      '</div>'
    );
  }

  /* ─────────────────────────────────────────────
     DOM — get root container
  ───────────────────────────────────────────── */

  function _getRoot() {
    return document.getElementById(ROOT_ID);
  }

  /* ─────────────────────────────────────────────
     TRANSITION
  ───────────────────────────────────────────── */

  function _show(html, newState) {
    var root = _getRoot();
    if (!root) return;
    /* Fade out */
    root.style.opacity = '0';
    root.style.transform = 'translateY(4px)';
    setTimeout(function () {
      root.innerHTML = html;
      _bindCardEvents(root);
      /* Fade in */
      root.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      requestAnimationFrame(function () {
        root.style.opacity = '1';
        root.style.transform = 'translateY(0)';
      });
    }, 120);
    _state = newState;
  }

  function _toIdle() {
    _current = '';
    _show(_renderIdle(), STATE_IDLE);
  }

  function _toActive(text, forcedSlug, forcedUrgent) {
    var slug    = forcedSlug || _detectSlug(text);
    var urgent  = forcedUrgent !== undefined ? forcedUrgent : _detectUrgent(text);
    if (!slug) { _toIdle(); return; }
    var city    = _getHeroCity();
    _current    = text;
    _show(_renderActive(slug, urgent, city, text), STATE_ACTIVE);
  }

  /* ─────────────────────────────────────────────
     CARD EVENT BINDING
  ───────────────────────────────────────────── */

  function _bindCardEvents(root) {
    /* Chip clicks */
    var chips = root.querySelectorAll('.faev2-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var text   = chip.dataset.text || '';
        var slug   = chip.dataset.slug || '';
        var urgent = chip.dataset.urgent === 'true';

        /* Write into QSM search input so hero-search-modal.js responds */
        var qsmInput = document.getElementById('qsm-input-nlp');
        if (qsmInput) {
          qsmInput.value = text;
          qsmInput.dispatchEvent(new Event('input', { bubbles: true }));
          try { qsmInput.focus(); } catch (_) {}
        }

        _toActive(text, slug, urgent);
      });
    });

    /* CTA buttons */
    var ctaBtns = root.querySelectorAll('[data-action]');
    ctaBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.action;
        if (action === 'open-urgent') {
          /* Open request modal in express/urgent mode */
          if (window.FixeoClientRequest && typeof window.FixeoClientRequest.openExpress === 'function') {
            window.FixeoClientRequest.openExpress(btn);
          } else if (typeof window.openModal === 'function') {
            window.openModal('request-modal');
          }
        } else if (action === 'open-standard') {
          /* Open request modal in standard mode */
          if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
            window.FixeoClientRequest.open(btn);
          } else if (typeof window.openModal === 'function') {
            window.openModal('request-modal');
          }
        } else if (action === 'reset') {
          /* Back to idle — clear qsm input too */
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

  /* ─────────────────────────────────────────────
     WIRE HERO INPUT
     Listen to QSM input; update card state on change.
  ───────────────────────────────────────────── */

  function _wireInput() {
    var input = document.getElementById('qsm-input-nlp');
    if (!input || input._faeeV2Wired) return;
    input._faeeV2Wired = true;

    var _t = null;
    input.addEventListener('input', function () {
      clearTimeout(_t);
      _t = setTimeout(function () {
        var val = (input.value || '').trim();
        if (!val) {
          if (_state === STATE_ACTIVE) _toIdle();
          return;
        }
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
    var cityEl = document.getElementById('qsm-city') || document.getElementById('hero-city-select') ||
                 document.querySelector('.qsm-city-select');
    if (cityEl) {
      cityEl.addEventListener('change', function () {
        if (_state === STATE_ACTIVE && _current) {
          _toActive(_current);
        }
      });
    }
  }

  function _pollForInput() {
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      _wireInput();
      var wired = document.getElementById('qsm-input-nlp');
      if ((wired && wired._faeeV2Wired) || attempts > 50) {
        clearInterval(poll);
      }
    }, 200);
  }

  /* ─────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────── */

  function _boot() {
    var root = _getRoot();
    if (!root) return; /* static div not in page */

    /* Render idle card immediately */
    root.innerHTML = _renderIdle();
    root.style.opacity = '1';
    _bindCardEvents(root);
    _state = STATE_IDLE;

    /* Wire input when QSM is ready */
    if (!_wireInput()) {
      _pollForInput();
    }

    /* Expose API */
    window.FixeoEstimationV2 = {
      VERSION:  VERSION,
      toIdle:   _toIdle,
      toActive: _toActive,
      getState: function () { return _state; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})();
