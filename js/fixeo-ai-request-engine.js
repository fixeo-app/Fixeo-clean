/**
 * FIXEO AI REQUEST ENGINE — aire-v1a
 * =============================================
 * Transforms the homepage request form into an intelligent
 * conversion experience. 7 features, zero API calls.
 *
 * FEATURES:
 *   F1 — AI Smart Request Builder (real-time category detection)
 *   F2 — AI Urgency Detection (keyword → alert banner + auto-select)
 *   F3 — AI City Auto-Fill (geolocation → pre-fill request-city)
 *   F4 — AI Match Preview (artisan count by category/city)
 *   F5 — AI Price Estimator (price range after category detection)
 *   F6 — AI Dispatch Experience (animated post-submit steps)
 *   F7 — AI Conversion Microcopy (contextual CTA labels)
 *
 * CONSTRAINTS:
 *   - Zero API calls, zero Supabase writes
 *   - Zero modifications to: request-form.js, smart-search.js,
 *     fixeo-pricing-marocain.js, auth, dashboards, Supabase schema
 *   - Progressive enhancement — all features degrade gracefully
 *   - Mobile-first implementation
 *   - Idempotent: window.FixeoAIRE guard
 *
 * READS (non-destructive):
 *   - #request-problem value (input)
 *   - #request-city select (read + write)
 *   - input[name="urgence"] radio (write)
 *   - window.FixeoDB.getAllArtisans() — real artisan pool
 *   - window.FixeoPricingMarocain.getPricing() — real price data
 *   - localStorage['fixeo_detected_city'] — geolocation cache
 *   - #hero-city-label text — rendered city name
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoAIRE) return; // idempotent
  var VERSION = 'aire-v1a';

  /* ══════════════════════════════════════════════════════════
     KNOWLEDGE BASE — client-side NLP
     Keyword → category mapping (reuses smart-search.js logic,
     extended with more problem-space vocabulary)
  ══════════════════════════════════════════════════════════ */
  var NLP_MAP = [
    {
      cat: 'plomberie',
      icon: '🔧',
      label: 'Plomberie',
      keywords: ['plomb','plombier','fuite','robinet','tuyau','chauffe-eau','chauffe eau',
                 'eau','canalisation','wc','toilette','evacuation','évacuation','sanitaire',
                 'douche','baignoire','siphon','débouchage','debouchage','inondation',
                 'robinetterie','réservoir','reservoir','ballon','cumulus'],
      urgencyBoost: ['inondation','fuite importante','fuite gaz','coupure eau']
    },
    {
      cat: 'electricite',
      icon: '⚡',
      label: 'Électricité',
      keywords: ['élect','electr','électr','courant','prise','tableau','câble','cable',
                 'lumière','lumiere','éclairage','eclairage','disjoncteur','court-circuit',
                 'coupure','brûlée','brulee','brulée','interrupteur','plomb','domotique',
                 'fil','fusible','compteur','branchement','mise aux normes'],
      urgencyBoost: ['court-circuit','court circuit','coupure électrique','coupure electrique',
                     'prise brûlée','prise brulee','odeur brûlée','choc électrique']
    },
    {
      cat: 'serrurerie',
      icon: '🔑',
      label: 'Serrurerie',
      keywords: ['serrur','clé','cle','verrou','porte bloquée','porte bloquee','clé cassée',
                 'clé cassee','cle cassee','ouverture','blindée','blindee','coffre',
                 'portail','gond','charnière','charniere','ferme','fermée','fermee'],
      urgencyBoost: ['porte bloquée','porte bloquée','coincé','coince','enfermé','enferme',
                     'serrure forcée','serrure forcee']
    },
    {
      cat: 'climatisation',
      icon: '❄️',
      label: 'Climatisation',
      keywords: ['clim','climatiseur','climatisation','chaudière','chaudiere','chauffage',
                 'radiateur','pompe à chaleur','pompe a chaleur','pac','vmc','ventilation',
                 'froid','chaud','thermostat','split','réversible','reversible'],
      urgencyBoost: ['panne totale','plus de chauffage','froid','nuit','enfants']
    },
    {
      cat: 'menuiserie',
      icon: '🪵',
      label: 'Menuiserie',
      keywords: ['menuisier','bois','porte','fenêtre','fenetre','parquet','placard',
                 'meuble','charpente','ébéniste','ebeniste','portail','volet','shutter',
                 'store','persienne','boiserie','escalier'],
      urgencyBoost: []
    },
    {
      cat: 'peinture',
      icon: '🎨',
      label: 'Peinture',
      keywords: ['peintr','peint','mur','façade','facade','enduit','déco','deco',
                 'badigeon','ravalement','couleur','crépi','crepi','laque','vernis'],
      urgencyBoost: []
    },
    {
      cat: 'maconnerie',
      icon: '🧱',
      label: 'Maçonnerie',
      keywords: ['maçon','macon','béton','beton','ciment','mur porteur','démolition',
                 'demolition','rénovation','renovation','crépissage','crepissage',
                 'fondation','terrassement','dalle','agglo'],
      urgencyBoost: []
    },
    {
      cat: 'nettoyage',
      icon: '🧹',
      label: 'Nettoyage',
      keywords: ['nettoy','ménage','menage','vitres','entretien','désinfect','desinfect',
                 'propret','cleaning','aspirateur','poussière','poussiere','taches'],
      urgencyBoost: []
    },
    {
      cat: 'carrelage',
      icon: '🏁',
      label: 'Carrelage',
      keywords: ['carrelage','carreaux','sol','faïence','faience','mosaïque','mosaique',
                 'joints','pose sol','dallage','tomette'],
      urgencyBoost: []
    },
    {
      cat: 'jardinage',
      icon: '🌿',
      label: 'Jardinage',
      keywords: ['jardin','tonte','taille','pelouse','haie','arbust','arrosage',
                 'débroussaillage','debroussaillage','gazon','compost','plante'],
      urgencyBoost: []
    },
    {
      cat: 'bricolage',
      icon: '🔩',
      label: 'Bricolage',
      keywords: ['bricol','montage','fixation','petits travaux','petites réparations',
                 'meuble à monter','meuble a monter','assemble','percer','trous','chevilles'],
      urgencyBoost: []
    },
    {
      cat: 'demenagement',
      icon: '🚛',
      label: 'Déménagement',
      keywords: ['déménag','demenag','transport','camion','emballage','monte-charge',
                 'monte charge','déplacement','déplacer','cartons'],
      urgencyBoost: []
    }
  ];

  /* Global urgency keywords (cross-category) */
  var URGENCY_KEYWORDS = [
    'urgence','urgent','urgente','immediat','immédiat','immédiatement','immediatement',
    'maintenant','tout de suite','dès maintenant','des maintenant','maintenant même',
    'inondation','noyé','noye','eau partout','court-circuit','court circuit',
    'porte bloquée','porte bloquee','coincé dehors','coincé dedans','coince',
    'panne totale','plus de courant','coupure totale','odeur de gaz','fuite gaz',
    'brûlée','brulee','fumée','fumee','choc électrique','électrocuté','electrocute',
    'soir','nuit','weekend','dimanche','samedi'
  ];

  /* Problem suggestions per detected category */
  var SUGGESTIONS = {
    plomberie:    ['Fuite sous l\'évier', 'Robinet qui goutte', 'WC bouché', 'Chauffe-eau en panne'],
    electricite:  ['Prise brûlée', 'Disjoncteur qui saute', 'Lumière qui ne marche plus', 'Panne générale'],
    serrurerie:   ['Porte bloquée', 'Clé cassée dans la serrure', 'Serrure à changer', 'Portail bloqué'],
    climatisation:['Clim qui ne refroidit plus', 'Panne chauffage', 'Radiateur froid', 'Bruit anormal clim'],
    menuiserie:   ['Porte qui frotte', 'Fenêtre cassée', 'Placard abîmé', 'Parquet à réparer'],
    peinture:     ['Peinture intérieure chambre', 'Murs à refaire', 'Peinture façade', 'Crépi abîmé'],
    maconnerie:   ['Fissures mur', 'Rénovation pièce', 'Pose carrelage', 'Travaux extérieurs'],
    nettoyage:    ['Nettoyage après travaux', 'Vitres à nettoyer', 'Nettoyage complet appartement'],
    carrelage:    ['Carrelage cassé', 'Joints à refaire', 'Pose faïence salle de bain'],
    jardinage:    ['Tonte pelouse', 'Taille haies', 'Aménagement jardin'],
    bricolage:    ['Meuble à monter', 'Fixation murale', 'Petits travaux divers'],
    demenagement: ['Déménagement appartement', 'Transport meubles', 'Déménagement urgent'],
    _default:     ['Fuite d\'eau', 'Panne électrique', 'Porte bloquée', 'Clim en panne']
  };

  /* Price data (duplicated locally — no dependency on fixeo-pricing-marocain.js
   * but we check if window.FixeoPricingMarocain.getPricing() is available first) */
  var PRICE_MAP = {
    plomberie:    { range: '150–350 MAD',   label: 'Plomberie' },
    electricite:  { range: '100–400 MAD',   label: 'Électricité' },
    serrurerie:   { range: '150–400 MAD',   label: 'Serrurerie' },
    climatisation:{ range: '200–900 MAD',   label: 'Climatisation' },
    menuiserie:   { range: '150–900 MAD',   label: 'Menuiserie' },
    peinture:     { range: '800–2500 MAD',  label: 'Peinture' },
    maconnerie:   { range: '200–800 MAD',   label: 'Maçonnerie' },
    nettoyage:    { range: '200–600 MAD',   label: 'Nettoyage' },
    carrelage:    { range: '150–600 MAD',   label: 'Carrelage' },
    jardinage:    { range: '150–500 MAD',   label: 'Jardinage' },
    bricolage:    { range: '100–400 MAD',   label: 'Bricolage' },
    demenagement: { range: '500–2000 MAD',  label: 'Déménagement' }
  };

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function _el(id) { return document.getElementById(id); }
  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['']/g, "'")
      .trim();
  }

  /* ── NLP: detect category from free-text input ───────────── */
  function detectCategory(text) {
    if (!text || text.length < 2) return null;
    var n = _norm(text);
    var best = null, bestScore = 0;
    for (var i = 0; i < NLP_MAP.length; i++) {
      var entry = NLP_MAP[i];
      var score = 0;
      for (var j = 0; j < entry.keywords.length; j++) {
        if (n.includes(_norm(entry.keywords[j]))) {
          score += entry.keywords[j].length; // longer match = higher confidence
        }
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= 3 ? best : null; // minimum confidence threshold
  }

  /* ── NLP: detect urgency from text ──────────────────────── */
  function detectUrgency(text, category) {
    if (!text) return false;
    var n = _norm(text);
    /* Global urgency keywords */
    for (var i = 0; i < URGENCY_KEYWORDS.length; i++) {
      if (n.includes(_norm(URGENCY_KEYWORDS[i]))) return true;
    }
    /* Category-specific urgency boost keywords */
    if (category && category.urgencyBoost) {
      for (var j = 0; j < category.urgencyBoost.length; j++) {
        if (n.includes(_norm(category.urgencyBoost[j]))) return true;
      }
    }
    return false;
  }

  /* ── Artisan count by category + city ───────────────────── */
  function getArtisanCount(catKey, city) {
    try {
      var db = window.FixeoDB;
      if (!db || typeof db.getAllArtisans !== 'function') return null;
      var artisans = db.getAllArtisans() || [];
      if (artisans.length === 0) return null;
      var n = _norm(catKey);
      var c = _norm(city || '');
      var filtered = artisans.filter(function(a) {
        var aCat  = _norm(a.category || a.service || a.service_category || '');
        var aCity = _norm(a.city || a.ville || '');
        var catMatch  = !catKey || aCat.includes(n) || n.includes(aCat);
        var cityMatch = !city   || aCity === c || aCity.includes(c) || c.includes(aCity);
        return catMatch && cityMatch;
      });
      return filtered.length;
    } catch(e) { return null; }
  }

  /* ── Get price for category ──────────────────────────────── */
  function getPrice(catKey) {
    try {
      /* Prefer real pricing module if loaded */
      if (window.FixeoPricingMarocain && typeof window.FixeoPricingMarocain.getPricing === 'function') {
        var p = window.FixeoPricingMarocain.getPricing(catKey);
        if (p && p.range) return p.range;
      }
    } catch(e) {}
    return (PRICE_MAP[catKey] || {}).range || null;
  }

  /* ── Read detected city ──────────────────────────────────── */
  function getDetectedCity() {
    /* F3: multiple sources, in priority order */
    try {
      /* 1. Already selected in form */
      var sel = _el('request-city');
      if (sel && sel.value) return sel.value;

      /* 2. Quick search modal city select */
      var qsm = document.querySelector('#qsm-select-city');
      if (qsm && qsm.value) return qsm.value;

      /* 3. Services city filter */
      var svc = document.querySelector('#services-city-filter');
      if (svc && svc.value) return svc.value;

      /* 4. Hero city label text */
      var heroCityEl = _el('hero-city-label');
      if (heroCityEl) {
        var txt = heroCityEl.textContent.trim();
        if (txt && !txt.includes('Détect') && !txt.includes('…') && txt.length > 1) {
          return txt;
        }
      }

      /* 5. localStorage cache */
      var lsCity = localStorage.getItem('fixeo_detected_city') ||
                   localStorage.getItem('fixeo_city') ||
                   localStorage.getItem('userCity');
      if (lsCity && lsCity.length > 1) return lsCity;
    } catch(e) {}
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  var _state = {
    category:      null,  // detected NLP_MAP entry
    isUrgent:      false,
    urgencyDismissed: false,
    city:          null,
    submitting:    false,
    dispatchStarted: false
  };

  /* ══════════════════════════════════════════════════════════
     DOM INJECTION — inject AI elements into the request form
     Called once when form is ready; idempotent on re-open.
  ══════════════════════════════════════════════════════════ */
  function _ensureAIElements() {
    var form = _el('request-form');
    if (!form) return false;

    /* Inject chips row after #request-problem field */
    if (!_el('faire-chips')) {
      var problemField = form.querySelector('#request-problem');
      if (problemField) {
        var chipsWrap = document.createElement('div');
        chipsWrap.id = 'faire-chips';
        chipsWrap.setAttribute('aria-live', 'polite');
        chipsWrap.setAttribute('aria-label', 'Analyse de votre demande');
        problemField.parentNode.insertBefore(chipsWrap, problemField.nextSibling);
      }
    }

    /* Inject suggestions below chips */
    if (!_el('faire-suggestions')) {
      var chips = _el('faire-chips');
      if (chips) {
        var suggestWrap = document.createElement('div');
        suggestWrap.id = 'faire-suggestions';
        suggestWrap.setAttribute('role', 'list');
        suggestWrap.setAttribute('aria-label', 'Suggestions rapides');
        chips.parentNode.insertBefore(suggestWrap, chips.nextSibling);
      }
    }

    /* Inject price strip after suggestions */
    if (!_el('faire-price-strip')) {
      var sugg = _el('faire-suggestions');
      if (sugg) {
        var priceDiv = document.createElement('div');
        priceDiv.id = 'faire-price-strip';
        priceDiv.setAttribute('role', 'status');
        priceDiv.setAttribute('aria-label', 'Estimation de prix');
        sugg.parentNode.insertBefore(priceDiv, sugg.nextSibling);
      }
    }

    /* Inject match preview after price strip */
    if (!_el('faire-match-preview')) {
      var priceStrip = _el('faire-price-strip');
      if (priceStrip) {
        var matchDiv = document.createElement('div');
        matchDiv.id = 'faire-match-preview';
        matchDiv.setAttribute('aria-live', 'polite');
        priceStrip.parentNode.insertBefore(matchDiv, priceStrip.nextSibling);
      }
    }

    /* Inject urgency banner before submit button */
    if (!_el('faire-urgency-banner')) {
      var submitBtn = form.querySelector('.request-submit-btn');
      if (submitBtn && submitBtn.parentNode) {
        var bannerDiv = document.createElement('div');
        bannerDiv.id = 'faire-urgency-banner';
        bannerDiv.setAttribute('role', 'alert');
        bannerDiv.setAttribute('aria-live', 'assertive');
        bannerDiv.innerHTML =
          '<span class="faire-urgency-pulse"></span>'
          + '<span class="faire-urgency-text">⚡ Urgence détectée — Intervention prioritaire recommandée</span>'
          + '<button class="faire-urgency-dismiss" aria-label="Ignorer" type="button">✕</button>';
        submitBtn.parentNode.insertBefore(bannerDiv, submitBtn);

        /* Dismiss button */
        bannerDiv.querySelector('.faire-urgency-dismiss').addEventListener('click', function() {
          _state.urgencyDismissed = true;
          _hideEl('faire-urgency-banner');
        });
      }
    }

    /* F7: Dispatch experience container — inject inside #request-success */
    if (!_el('faire-dispatch')) {
      var success = _el('request-success');
      if (success) {
        var dispDiv = document.createElement('div');
        dispDiv.id = 'faire-dispatch';
        /* Insert after the success icon / before the title */
        var firstChild = success.querySelector('.fxrva-success-title') || success.firstElementChild;
        success.insertBefore(dispDiv, firstChild);
      }
    }

    return true;
  }

  /* ── Show / hide helpers ─────────────────────────────────── */
  function _showEl(id) { var e = _el(id); if (e) e.classList.add('visible'); }
  function _hideEl(id) { var e = _el(id); if (e) e.classList.remove('visible'); }

  /* ══════════════════════════════════════════════════════════
     F1 + F2 — ANALYSIS ENGINE
     Runs on every keystroke in #request-problem
  ══════════════════════════════════════════════════════════ */
  function _analyzeInput(text) {
    var category  = detectCategory(text);
    var isUrgent  = detectUrgency(text, category);

    _state.category = category;
    _state.isUrgent = isUrgent;
    _state.city     = getDetectedCity();

    /* F1: Update chips */
    _updateChips(category, isUrgent, _state.city);

    /* F1: Update suggestions */
    _updateSuggestions(category, text);

    /* F2: Urgency banner + radio */
    _updateUrgency(isUrgent);

    /* F5: Price estimate */
    _updatePrice(category);

    /* F4: Match preview */
    _updateMatchPreview(category, _state.city);

    /* F7: Submit label */
    _updateSubmitLabel(category, isUrgent);
  }

  /* F1: Chip row update */
  function _updateChips(category, isUrgent, city) {
    var container = _el('faire-chips');
    if (!container) return;

    var html = '';

    if (category) {
      html += '<span class="faire-chip faire-chip-category">'
        + category.icon + ' ' + category.label
        + '</span>';
    }

    if (isUrgent) {
      html += '<span class="faire-chip faire-chip-urgent">⚡ Urgence</span>';
    }

    if (city) {
      html += '<span class="faire-chip faire-chip-city">📍 ' + _escHtml(city) + '</span>';
    }

    if (html) {
      container.innerHTML = html;
      _showEl('faire-chips');
    } else {
      _hideEl('faire-chips');
    }
  }

  /* F1: Suggestion pills */
  function _updateSuggestions(category, currentText) {
    var container = _el('faire-suggestions');
    if (!container) return;

    /* Don't show suggestions once user has typed a meaningful amount */
    if (currentText && currentText.length > 18) {
      _hideEl('faire-suggestions');
      return;
    }

    var suggestions = (category ? SUGGESTIONS[category.cat] : null) || SUGGESTIONS._default;
    var html = '';
    suggestions.forEach(function(s) {
      /* Don't suggest if it matches what they already typed */
      if (currentText && _norm(s).includes(_norm(currentText).slice(0, 5))) return;
      html += '<button class="faire-suggestion" type="button" data-faire-suggest="' + _escHtml(s) + '">'
        + _escHtml(s)
        + '</button>';
    });

    if (html && !currentText) {
      container.innerHTML = html;
      _showEl('faire-suggestions');
    } else if (html && currentText.length < 4 && !category) {
      container.innerHTML = html;
      _showEl('faire-suggestions');
    } else {
      _hideEl('faire-suggestions');
    }
  }

  /* F2: Urgency alert + radio auto-select */
  function _updateUrgency(isUrgent) {
    if (isUrgent && !_state.urgencyDismissed) {
      _showEl('faire-urgency-banner');
      /* Auto-select urgent radio */
      var urgentRadio = document.querySelector('input[name="urgence"][value="Urgent (moins de 30 min)"]');
      if (urgentRadio && !urgentRadio.checked) {
        urgentRadio.checked = true;
        /* Trigger visual update if request-form.js listens to change event */
        try { urgentRadio.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
      }
    } else {
      _hideEl('faire-urgency-banner');
    }
  }

  /* F5: Price estimate */
  function _updatePrice(category) {
    var container = _el('faire-price-strip');
    if (!container) return;

    if (!category) {
      _hideEl('faire-price-strip');
      return;
    }

    var range = getPrice(category.cat);
    if (!range) {
      _hideEl('faire-price-strip');
      return;
    }

    container.innerHTML =
      '<span>' + category.icon + ' ' + category.label + ' :</span>'
      + '<span class="faire-price-amount">' + _escHtml(range) + '</span>'
      + '<span class="faire-price-label">Prix indicatif</span>';
    _showEl('faire-price-strip');
  }

  /* F4: Match preview */
  function _updateMatchPreview(category, city) {
    var container = _el('faire-match-preview');
    if (!container) return;

    if (!category) {
      _hideEl('faire-match-preview');
      return;
    }

    var count = getArtisanCount(category.cat, city);
    if (count === null || count === 0) {
      /* Fallback: show generic positive signal without fabricating numbers */
      container.innerHTML =
        '<span class="faire-match-dot"></span>'
        + '<span>Artisans disponibles dans votre zone</span>';
      _showEl('faire-match-preview');
      return;
    }

    var cityText = city ? ' à ' + city : '';
    container.innerHTML =
      '<span class="faire-match-dot"></span>'
      + '<span class="faire-match-count">✓ ' + count + ' artisan' + (count > 1 ? 's' : '') + ' compatible' + (count > 1 ? 's' : '') + '</span>'
      + '<span>' + _escHtml(cityText) + '</span>';
    _showEl('faire-match-preview');
  }

  /* F7: Submit button microcopy */
  function _updateSubmitLabel(category, isUrgent) {
    var btn = document.querySelector('#request-form .request-submit-btn');
    if (!btn) return;
    /* Don't override if currently disabled (submitting) */
    if (btn.disabled) return;

    var label;
    if (isUrgent) {
      label = '⚡ Trouver un artisan maintenant';
    } else if (category) {
      label = 'Trouver mon ' + category.label.toLowerCase().replace(/é/g, 'e').replace(/è/g, 'e');
      /* Cap length */
      if (label.length > 32) label = 'Trouver mon artisan →';
    } else {
      label = 'Trouver mon artisan →';
    }
    btn.textContent = label;
  }

  /* ══════════════════════════════════════════════════════════
     F3 — CITY AUTO-FILL
     Called when request modal opens.
  ══════════════════════════════════════════════════════════ */
  function _prefillCity() {
    var sel = _el('request-city');
    if (!sel || sel.value) return; // already filled

    var city = getDetectedCity();
    if (!city) return;

    /* Match against available options */
    var options = Array.from(sel.options);
    var match = options.find(function(opt) {
      return _norm(opt.value) === _norm(city) || _norm(opt.text) === _norm(city);
    });
    if (match) {
      sel.value = match.value;
      /* Store for future opens */
      _state.city = match.value;
    }
  }

  /* Watch hero city label for late resolution */
  function _watchHeroCity() {
    var heroCityEl = _el('hero-city-label');
    if (!heroCityEl) return;
    var observer = new MutationObserver(function() {
      var txt = heroCityEl.textContent.trim();
      if (txt && !txt.includes('Détect') && !txt.includes('…')) {
        _state.city = txt;
        /* Cache for the form */
        try { localStorage.setItem('fixeo_detected_city', txt); } catch(e) {}
        /* Update chips if visible */
        _updateChips(_state.category, _state.isUrgent, _state.city);
        _updateMatchPreview(_state.category, _state.city);
      }
    });
    observer.observe(heroCityEl, { childList: true, characterData: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     F6 — AI DISPATCH EXPERIENCE
     Animated steps after form submission.
     Called after the existing showSuccess() completes.
  ══════════════════════════════════════════════════════════ */
  var DISPATCH_STEPS = [
    { label: 'Demande reçue',                    icon: '📨', delay: 0    },
    { label: 'Analyse du besoin',                icon: '🔍', delay: 400  },
    { label: 'Catégorie détectée',               icon: '🏷️', delay: 900  },
    { label: 'Recherche des artisans',           icon: '🗺️', delay: 1500 },
    { label: 'Notification des artisans',        icon: '📲', delay: 2300 },
    { label: 'Mise en relation en cours…',       icon: '🤝', delay: 3300 }
  ];

  function _startDispatchExperience(detectedCat, isUrg) {
    if (_state.dispatchStarted) return;
    _state.dispatchStarted = true;

    var container = _el('faire-dispatch');
    if (!container) return;

    /* Build step rows */
    var stepsHtml = DISPATCH_STEPS.map(function(step, i) {
      /* Contextualise "Catégorie détectée" label */
      var label = step.label;
      if (i === 2 && detectedCat) {
        label = 'Catégorie : ' + detectedCat.label + ' ' + detectedCat.icon;
      }
      return '<div class="faire-dispatch-step waiting" data-step="' + i + '">'
        + '<div class="faire-dispatch-icon">•</div>'
        + '<span class="faire-dispatch-label">' + _escHtml(label) + '</span>'
        + '<span class="faire-dispatch-check"></span>'
        + '</div>';
    }).join('');

    container.innerHTML = stepsHtml;
    _showEl('faire-dispatch');

    /* Animate steps in sequence */
    var steps = container.querySelectorAll('.faire-dispatch-step');
    DISPATCH_STEPS.forEach(function(step, i) {
      /* Mark previous step done, current active */
      setTimeout(function() {
        if (i > 0) {
          var prev = steps[i - 1];
          if (prev) {
            prev.classList.remove('active');
            prev.classList.add('done');
            var prevIcon = prev.querySelector('.faire-dispatch-icon');
            if (prevIcon) prevIcon.textContent = DISPATCH_STEPS[i - 1].icon;
            var prevCheck = prev.querySelector('.faire-dispatch-check');
            if (prevCheck) prevCheck.textContent = '✓';
          }
        }
        var curr = steps[i];
        if (curr) {
          curr.classList.remove('waiting');
          curr.classList.add('active');
          var currIcon = curr.querySelector('.faire-dispatch-icon');
          if (currIcon) currIcon.textContent = '↺';
        }
        /* Mark final step done at the end */
        if (i === DISPATCH_STEPS.length - 1) {
          setTimeout(function() {
            curr.classList.remove('active');
            curr.classList.add('done');
            var fIcon = curr.querySelector('.faire-dispatch-icon');
            if (fIcon) fIcon.textContent = DISPATCH_STEPS[i].icon;
            var fCheck = curr.querySelector('.faire-dispatch-check');
            if (fCheck) fCheck.textContent = '✓';
          }, 800);
        }
      }, step.delay);
    });
  }

  /* ══════════════════════════════════════════════════════════
     EVENT WIRING
  ══════════════════════════════════════════════════════════ */

  /* Wire problem input → real-time analysis */
  function _wireProblemInput() {
    var input = _el('request-problem');
    if (!input || input._faireWired) return;
    input._faireWired = true;

    input.addEventListener('input', function() {
      _analyzeInput(this.value);
    });

    /* Initial analysis if pre-filled */
    if (input.value) _analyzeInput(input.value);
  }

  /* Wire suggestion pill clicks */
  function _wireSuggestions() {
    var container = _el('faire-suggestions');
    if (!container || container._faireWired) return;
    container._faireWired = true;

    container.addEventListener('click', function(e) {
      var btn = e.target.closest('.faire-suggestion');
      if (!btn) return;
      var suggestion = btn.dataset.faireSuggest || btn.textContent.trim();
      var input = _el('request-problem');
      if (input) {
        input.value = suggestion;
        input.focus();
        _analyzeInput(suggestion);
        _hideEl('faire-suggestions');
      }
    });
  }

  /* Observe form submit — hook dispatch experience */
  function _wireFormSubmit() {
    var form = _el('request-form');
    if (!form || form._faireSubmitWired) return;
    form._faireSubmitWired = true;

    form.addEventListener('submit', function() {
      /* Capture state at submit time */
      var cat  = _state.category;
      var isUrg = _state.isUrgent;
      /* Delay to let request-form.js showSuccess() run first (it hides form + shows success) */
      setTimeout(function() {
        _state.dispatchStarted = false; // allow fresh animation on re-open
        _startDispatchExperience(cat, isUrg);
      }, 600);
    }, { capture: true, passive: true });
  }

  /* Watch for modal open events — ensure AI elements injected, city pre-filled */
  function _watchModalOpen() {
    /* MutationObserver on #request-modal class changes (open/close) */
    var modal = _el('request-modal');
    if (!modal) return;

    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          var isOpen = modal.classList.contains('open');
          if (isOpen) {
            /* Modal just opened */
            setTimeout(function() {
              _ensureAIElements();
              _wireProblemInput();
              _wireSuggestions();
              _wireFormSubmit();
              _prefillCity();
              _state.dispatchStarted = false;
              /* Reset chips on fresh open */
              var input = _el('request-problem');
              if (input && input.value) {
                _analyzeInput(input.value);
              } else {
                /* Show default suggestions on empty open */
                _updateSuggestions(null, '');
              }
            }, 80);
          }
        }
      });
    });
    observer.observe(modal, { attributes: true });

    /* Also hook the FixeoClientRequest.openRequestModal path */
    _hookClientRequest();
  }

  /* Hook FixeoClientRequest.openRequestModal (non-destructive wrapper) */
  function _hookClientRequest() {
    /* Retry up to 20x in case script hasn't loaded yet */
    var attempts = 0;
    function _tryHook() {
      attempts++;
      if (window.FixeoClientRequest && window.FixeoClientRequest.openRequestModal &&
          !window.FixeoClientRequest._faireHooked) {
        var orig = window.FixeoClientRequest.openRequestModal.bind(window.FixeoClientRequest);
        window.FixeoClientRequest.openRequestModal = function(trigger, mode) {
          orig(trigger, mode);
          setTimeout(function() {
            _ensureAIElements();
            _wireProblemInput();
            _wireSuggestions();
            _wireFormSubmit();
            _prefillCity();
            _state.dispatchStarted = false;
            var input = _el('request-problem');
            if (!input || !input.value) _updateSuggestions(null, '');
          }, 120);
        };
        window.FixeoClientRequest._faireHooked = true;
        return;
      }
      if (attempts < 20) setTimeout(_tryHook, 300);
    }
    _tryHook();
  }

  /* ══════════════════════════════════════════════════════════
     UTILITY
  ══════════════════════════════════════════════════════════ */
  function _escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function _init() {
    /* Try to inject AI elements into already-open modal */
    _ensureAIElements();
    _wireProblemInput();
    _wireSuggestions();
    _wireFormSubmit();
    _watchModalOpen();
    _watchHeroCity();

    /* Pre-fill city if modal is already open */
    var modal = _el('request-modal');
    if (modal && modal.classList.contains('open')) {
      _prefillCity();
    }

    console.log('[FixeoAIRE] AI Request Engine ' + VERSION + ' ready');
  }

  /* ── Public API ───────────────────────────────────────────── */
  window.FixeoAIRE = {
    VERSION:         VERSION,
    detect:          detectCategory,
    detectUrgency:   detectUrgency,
    getPrice:        getPrice,
    getArtisanCount: getArtisanCount,
    analyze:         _analyzeInput,
    prefillCity:     _prefillCity
  };

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
