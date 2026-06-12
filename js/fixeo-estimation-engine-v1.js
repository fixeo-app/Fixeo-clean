/* ============================================================
   FIXEO AI ESTIMATION ENGINE V1
   Version: faee-v1a
   Strategy: Additive hook onto #fixeo-reservation-modal via
             MutationObserver — ZERO changes to reservation.js,
             reservation-v2.js, or any other existing file.
   Namespace: .faee-* / #faee-* / window.FixeoEstimation
   Guard:     window._fxEstV1Loaded
   ============================================================ */
(function () {
  'use strict';

  if (window._fxEstV1Loaded) return;
  window._fxEstV1Loaded = true;

  var VERSION = 'faee-v1a';
  var MODAL_ID = 'fixeo-reservation-modal';

  /* ── HELPERS ─────────────────────────────────────────────── */
  function qs(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function _norm(s)      { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

  /* ── PRICING MATRIX ──────────────────────────────────────── */
  /* Realistic Morocco market prices (MAD) by category + complexity */
  var PRICING = {
    plomberie: {
      simple:  { from: 120, to: 250, label: 'Simple' },
      medium:  { from: 200, to: 450, label: 'Intermédiaire' },
      heavy:   { from: 400, to: 900, label: 'Complexe' },
      urgent:  { from: 250, to: 550, label: 'Urgent' }
    },
    electricite: {
      simple:  { from: 100, to: 200, label: 'Simple' },
      medium:  { from: 200, to: 500, label: 'Intermédiaire' },
      heavy:   { from: 400, to: 1200, label: 'Complexe' },
      urgent:  { from: 250, to: 600, label: 'Urgent' }
    },
    serrurerie: {
      simple:  { from: 150, to: 300, label: 'Simple' },
      medium:  { from: 200, to: 450, label: 'Intermédiaire' },
      heavy:   { from: 350, to: 800, label: 'Complexe' },
      urgent:  { from: 200, to: 500, label: 'Urgent' }
    },
    climatisation: {
      simple:  { from: 200, to: 400, label: 'Simple' },
      medium:  { from: 300, to: 700, label: 'Intermédiaire' },
      heavy:   { from: 500, to: 1200, label: 'Complexe' },
      urgent:  { from: 350, to: 750, label: 'Urgent' }
    },
    peinture: {
      simple:  { from: 150, to: 350, label: 'Pièce simple' },
      medium:  { from: 300, to: 800, label: 'Appartement' },
      heavy:   { from: 700, to: 2000, label: 'Grand chantier' },
      urgent:  { from: 250, to: 600, label: 'Urgent' }
    },
    menuiserie: {
      simple:  { from: 150, to: 350, label: 'Réparation' },
      medium:  { from: 400, to: 1000, label: 'Installation' },
      heavy:   { from: 800, to: 3000, label: 'Sur mesure' },
      urgent:  { from: 200, to: 500, label: 'Urgent' }
    },
    nettoyage: {
      simple:  { from: 150, to: 300, label: 'Studio/F1' },
      medium:  { from: 250, to: 550, label: 'Appartement' },
      heavy:   { from: 400, to: 900, label: 'Villa/Local' },
      urgent:  { from: 250, to: 500, label: 'Urgent' }
    },
    maconnerie: {
      simple:  { from: 200, to: 500, label: 'Petite réparation' },
      medium:  { from: 500, to: 1500, label: 'Travaux moyens' },
      heavy:   { from: 1200, to: 4000, label: 'Gros œuvre' },
      urgent:  { from: 350, to: 900, label: 'Urgent' }
    },
    carrelage: {
      simple:  { from: 200, to: 500, label: 'Réparation' },
      medium:  { from: 400, to: 1200, label: 'Pièce' },
      heavy:   { from: 800, to: 2500, label: 'Grand chantier' },
      urgent:  { from: 300, to: 700, label: 'Urgent' }
    }
  };

  /* City tier multipliers (relative to base) */
  var CITY_TIERS = {
    tier1: { cities: ['casablanca','rabat','marrakech'], mult: 1.15 },
    tier2: { cities: ['tanger','agadir','fes','meknes'], mult: 1.05 },
    tier3: { mult: 1.0 } /* default */
  };

  /* Surcharge table */
  var SURCHARGES = {
    night:     { pct: 25, label: 'Nuit +25%',    icon: '🌙' },
    weekend:   { pct: 20, label: 'Weekend +20%', icon: '📅' },
    emergency: { pct: 40, label: 'Urgence +40%', icon: '🚨' },
    express:   { pct: 15, label: 'Express +15%', icon: '⚡' }
  };

  /* ETA ranges by urgency */
  var ETA = {
    emergency: '10–25 min',
    urgent:    '20–45 min',
    normal:    '2–4 heures',
    scheduled: 'Selon disponibilité'
  };

  /* Complexity keyword maps */
  var COMPLEX_HEAVY = ['refaire','renovation','remplacement complet','installation complete',
    'tableau electrique','installation electrique','chauffe-eau solaire','pose carrelage',
    'salle de bain complete','facade','toiture'];
  var COMPLEX_MEDIUM = ['installation','remplacement','fuite importante','panne totale',
    'disjoncteur','court-circuit','chasse eau','chauffe-eau','cumulus','canalisation'];

  /* ── ANALYSIS ENGINE ─────────────────────────────────────── */

  function _getCityTier(city) {
    var c = _norm(city);
    if (!c) return CITY_TIERS.tier3.mult;
    for (var i = 0; i < CITY_TIERS.tier1.cities.length; i++) {
      if (c.includes(CITY_TIERS.tier1.cities[i])) return CITY_TIERS.tier1.mult;
    }
    for (var j = 0; j < CITY_TIERS.tier2.cities.length; j++) {
      if (c.includes(CITY_TIERS.tier2.cities[j])) return CITY_TIERS.tier2.mult;
    }
    return CITY_TIERS.tier3.mult;
  }

  function _detectComplexity(text, serviceName) {
    var n = _norm(text + ' ' + (serviceName || ''));
    for (var i = 0; i < COMPLEX_HEAVY.length; i++) {
      if (n.includes(_norm(COMPLEX_HEAVY[i]))) return 'heavy';
    }
    for (var j = 0; j < COMPLEX_MEDIUM.length; j++) {
      if (n.includes(_norm(COMPLEX_MEDIUM[j]))) return 'medium';
    }
    return 'simple';
  }

  function _isNight() {
    var h = new Date().getHours();
    return h >= 21 || h < 7;
  }

  function _isWeekend() {
    var d = new Date().getDay();
    return d === 0 || d === 6;
  }

  function _catKey(serviceName, artisan) {
    /* Try to derive category from service name or artisan category */
    var n = _norm(serviceName || '') + ' ' + _norm((artisan && artisan.category) || '');
    var map = {
      plomberie:     ['plomberie','plombier','fuite','chauffe-eau','sanitaire','canalisation','robinet','wc','cumulus'],
      electricite:   ['electricite','electrique','electricien','prise','disjoncteur','tableau','courant','cablage'],
      serrurerie:    ['serrurerie','serrurier','serrure','porte bloquee','ouverture','cylindre','cle','verrou'],
      climatisation: ['climatisation','climatiseur','clim','hvac','split','ventilation','froid','chauffage'],
      peinture:      ['peinture','peintre','facade','mur','plafond','enduit'],
      menuiserie:    ['menuiserie','menuisier','bois','porte','fenetre','placard','cuisine'],
      nettoyage:     ['nettoyage','menage','proprete','desinfection','vitres'],
      maconnerie:    ['maconnerie','macon','beton','dalle','construction','renovation'],
      carrelage:     ['carrelage','carreleur','faience','joints']
    };
    for (var cat in map) {
      var kws = map[cat];
      for (var i = 0; i < kws.length; i++) {
        if (n.includes(_norm(kws[i]))) return cat;
      }
    }
    return null;
  }

  function analyze(opts) {
    /* opts: { serviceName, description, artisan, isUrgent, isExpress } */
    var svc      = opts.serviceName || '';
    var desc     = opts.description || '';
    var artisan  = opts.artisan || {};
    var isUrgent = !!opts.isUrgent;
    var isExpress= !!opts.isExpress;

    var city     = artisan.city || artisan.ville || '';
    var catKey   = _catKey(svc, artisan);
    var cityMult = _getCityTier(city);

    /* Urgency: from flag or AIRE keyword detection */
    var urgencyDetected = isUrgent || isExpress;
    if (!urgencyDetected && window.FixeoAIRE && svc) {
      urgencyDetected = !!window.FixeoAIRE.detectUrgency(svc + ' ' + desc, null);
    }

    /* Complexity: from text analysis */
    var complexity   = urgencyDetected ? 'urgent' : _detectComplexity(desc + ' ' + svc, svc);
    var complexLabel = urgencyDetected ? 'Urgent' :
      (complexity === 'heavy' ? 'Complexe' : complexity === 'medium' ? 'Intermédiaire' : 'Simple');

    /* Price range */
    var priceRange = null;
    var pricing    = catKey && PRICING[catKey] ? PRICING[catKey][complexity] : null;
    if (pricing) {
      var lo = Math.round(pricing.from * cityMult);
      var hi = Math.round(pricing.to   * cityMult);
      priceRange = lo + '–' + hi + ' MAD';
    } else if (window.FixeoAIRE && catKey) {
      priceRange = window.FixeoAIRE.getPrice(catKey);
    }

    /* Surcharges */
    var activeSurcharges = [];
    if (urgencyDetected || isUrgent)  activeSurcharges.push(SURCHARGES.emergency);
    else if (isExpress)               activeSurcharges.push(SURCHARGES.express);
    if (_isNight())                   activeSurcharges.push(SURCHARGES.night);
    else if (_isWeekend())            activeSurcharges.push(SURCHARGES.weekend);

    /* ETA */
    var etaLabel = urgencyDetected ? ETA.urgent : (isExpress ? ETA.emergency : ETA.normal);

    /* Artisan count */
    var artisanCount = null;
    if (window.FixeoAIRE && catKey) {
      artisanCount = window.FixeoAIRE.getArtisanCount(catKey, city);
    }

    /* Service label */
    var serviceLabel = catKey ? (catKey.charAt(0).toUpperCase() + catKey.slice(1)) : (svc || '—');
    var categoryMap = {
      plomberie: '🔧 Plomberie', electricite: '⚡ Électricité', serrurerie: '🔐 Serrurerie',
      climatisation: '❄️ Climatisation', peinture: '🎨 Peinture', menuiserie: '🪚 Menuiserie',
      nettoyage: '🧹 Nettoyage', maconnerie: '🧱 Maçonnerie', carrelage: '⬜ Carrelage'
    };
    serviceLabel = (catKey && categoryMap[catKey]) || serviceLabel;

    return {
      service:        serviceLabel,
      catKey:         catKey,
      complexity:     complexLabel,
      isUrgent:       urgencyDetected,
      priceRange:     priceRange,
      eta:            etaLabel,
      artisanCount:   artisanCount,
      surcharges:     activeSurcharges,
      city:           city || null
    };
  }

  /* ── CARD RENDERER ───────────────────────────────────────── */

  function _renderCard(result, hasService) {
    if (!hasService || !result.catKey) {
      return (
        '<div class="faee-card faee-idle">' +
          '<div class="faee-idle-icon">✦</div>' +
          '<div class="faee-idle-text">Sélectionnez un service pour obtenir une estimation IA</div>' +
        '</div>'
      );
    }

    var surchargeHtml = '';
    if (result.surcharges.length > 0) {
      surchargeHtml = '<div class="faee-surcharges">' +
        result.surcharges.map(function(s) {
          return '<span class="faee-surcharge-badge">' + s.icon + ' ' + s.label + '</span>';
        }).join('') +
        '</div>';
    }

    var artisanHtml = result.artisanCount !== null && result.artisanCount >= 0
      ? '<div class="faee-stat"><span class="faee-stat-val">' + result.artisanCount + '</span><span class="faee-stat-lbl">artisans à proximité</span></div>'
      : '';

    var urgencyClass = result.isUrgent ? ' faee-urgent' : '';

    return (
      '<div class="faee-card' + urgencyClass + '">' +
        /* Header row */
        '<div class="faee-header">' +
          '<div class="faee-logo-row">' +
            '<span class="faee-logo-mark">✦</span>' +
            '<span class="faee-label">FIXEO AI ESTIMATION</span>' +
          '</div>' +
          (result.isUrgent ? '<span class="faee-urgent-badge">URGENT</span>' : '') +
        '</div>' +
        /* Price — the hero signal */
        '<div class="faee-price-block">' +
          '<div class="faee-price-range">' + (result.priceRange || '—') + '</div>' +
          '<div class="faee-price-note">estimation indicative</div>' +
        '</div>' +
        /* 3-col stats */
        '<div class="faee-stats">' +
          '<div class="faee-stat"><span class="faee-stat-val">' + result.service + '</span><span class="faee-stat-lbl">Service détecté</span></div>' +
          '<div class="faee-stat"><span class="faee-stat-val">' + result.complexity + '</span><span class="faee-stat-lbl">Complexité</span></div>' +
          '<div class="faee-stat"><span class="faee-stat-val">' + result.eta + '</span><span class="faee-stat-lbl">ETA artisan</span></div>' +
          artisanHtml +
        '</div>' +
        /* Surcharges */
        surchargeHtml +
        /* Disclaimer */
        '<div class="faee-disclaimer">Le prix final est confirmé sur place après diagnostic · Aucun paiement maintenant</div>' +
      '</div>'
    );
  }

  /* ── MODAL INTEGRATION ───────────────────────────────────── */

  function _readModalState(m) {
    /* Read live DOM state from the reservation modal */
    var svcEl   = qs('#res-service', m);
    var descEl  = qs('#res-desc', m);
    var isUrgentBanner = !!(qs('.fixeo-res-express-banner', m));
    var isExpress      = !!(m.getAttribute && m.getAttribute('data-express') === 'true');

    /* Try to extract artisan data from global state */
    var artisan = {};
    try {
      if (window.FixeoReservation && window.FixeoReservation._state) {
        artisan = window.FixeoReservation._state.artisan || {};
      }
      /* Fallback: read from DOM artisan card */
      if (!artisan.city) {
        var cityEl = qs('.fixeo-res-header-sub', m) || qs('[data-artisan-city]', m);
        if (cityEl) artisan.city = cityEl.textContent.replace(/^📍\s*/, '').trim();
      }
    } catch(e) {}

    return {
      serviceName: svcEl ? svcEl.value : '',
      description: descEl ? descEl.value : '',
      artisan:     artisan,
      isUrgent:    isUrgentBanner,
      isExpress:   isExpress
    };
  }

  function _getOrCreateContainer(m) {
    var existing = qs('#faee-container', m);
    if (existing) return existing;

    var container = document.createElement('div');
    container.id = 'faee-container';
    container.className = 'faee-container';

    /* Inject AFTER the existing .fxrv2-estimation block (the simpler price block),
       or after the artisan header card, or before the form — whichever comes first */
    var anchor = qs('.fxrv2-estimation', m)
              || qs('.fixeo-res-artisan-card', m)
              || qs('.fixeo-res-header', m);

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(container, anchor.nextSibling);
    } else {
      var form = qs('.fixeo-res-form', m) || qs('.fixeo-res-body', m);
      if (form) form.prepend(container);
    }

    return container;
  }

  function _update(m) {
    if (!m || !m.offsetParent) return; /* modal not visible */
    try {
      var st      = _readModalState(m);
      var result  = analyze(st);
      var html    = _renderCard(result, !!st.serviceName);
      var cont    = _getOrCreateContainer(m);
      if (cont) {
        if (cont.innerHTML !== html) cont.innerHTML = html;
        /* Animate in on first render */
        cont.classList.add('faee-visible');
      }
    } catch(e) {
      if (window.console && console.warn) console.warn('[faee] update error', e);
    }
  }

  function _attachToModal(m) {
    /* Debounced update */
    var _t = null;
    function _debounce() {
      clearTimeout(_t);
      _t = setTimeout(function() { _update(m); }, 180);
    }

    /* Immediate render */
    _update(m);

    /* Watch for service/desc changes */
    var svcEl  = qs('#res-service', m);
    var descEl = qs('#res-desc', m);

    if (svcEl)  svcEl.addEventListener('change',  _debounce);
    if (svcEl)  svcEl.addEventListener('input',   _debounce);
    if (descEl) descEl.addEventListener('input',  _debounce);

    /* MutationObserver to catch re-renders (pill clicks, step changes) */
    var obs = new MutationObserver(function(mutations) {
      var relevant = mutations.some(function(mu) {
        return mu.type === 'childList' || mu.attributeName === 'class';
      });
      if (relevant) _debounce();
    });
    obs.observe(m, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','data-express'] });

    m._faeeObs = obs; /* store ref for cleanup */
  }

  /* ── BOOT — MutationObserver on document ─────────────────── */

  function _boot() {
    /* Try immediate attach if modal already exists */
    var m = document.getElementById(MODAL_ID);
    if (m) _attachToModal(m);

    /* Watch for modal insertion / display */
    var docObs = new MutationObserver(function() {
      var modal = document.getElementById(MODAL_ID);
      if (modal && !modal._faeeObs) {
        _attachToModal(modal);
      }
    });
    docObs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  /* ── PUBLIC API ──────────────────────────────────────────── */
  window.FixeoEstimation = {
    VERSION:  VERSION,
    analyze:  analyze,
    update:   function() {
      var m = document.getElementById(MODAL_ID);
      if (m) _update(m);
    }
  };

}());
