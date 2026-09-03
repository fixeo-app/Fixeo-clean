/**
 * fx-request-flow-v4.js — fxrf4-v5c
 * RAFI Request Flow V5 — Emergency Mode Adaptation
 *
 * EMOTIONAL ARC: Problem → Relief → Confidence → Momentum → Trust
 * DESIGN PRINCIPLES: One question per screen. Auto-advance. RAFI speaks first.
 * MOBILE-FIRST: Bottom sheet. Touch-optimized. Keyboard-aware.
 *
 * MODES:
 *   standard / marketplace — normal service request (3-step with urgency)
 *   emergency              — urgent situation (situation chips → city → phone)
 *   express                — alias for emergency (legacy CTA compat)
 *
 * ISOLATED: Zero dependency on .modal, MutationObservers, setTimeout injections.
 * ROLLBACK: window.FIXEO_FLOW_V4 = false
 *
 * VERSION: fxrf4-v5c — 2026-08-12
 */

(function () {
  'use strict';

  /* ── Feature flag ──────────────────────────────────────────── */
  if (window.FIXEO_FLOW_V4 === false) return;
  if (window._fxrf4Loaded) return;
  window._fxrf4Loaded = true;

  // ── 7C.9K.2: Estimator V2 one-shot guard (module scope) ─────────────────
  // Prevents multiple FixeoEstimatorV2.open() calls across chip taps in the
  // same fxrf4 session. Reset on accepted:false / catch / throw. Also reset
  // implicitly on next fxrf4 open() call via _fresh() reinit (new _st object).
  var _fxrf4EstimatorLaunched = false;

  /* ══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */

  var WHATSAPP = '212660484415';
  var STORAGE_KEY = 'fixeo_client_requests';
  var CITY_STORAGE_KEY = 'fixeo_detected_city';
  var PHONE_MEMORY_KEY = 'fxrf4_last_phone';
  /* 7C.9L.3H: session-scoped trusted-city key — written only when city is confirmed
   * this session (fresh geolocation or explicit user selection). Never from stale
   * localStorage restore. Read at Estimator launch as the canonical city_slug source. */
  var TRUSTED_CITY_SESSION_KEY = 'fxrf4_trusted_city_session';

  /* All 20 production cities — exact match with #request-city select */
  var ALL_CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia'
  ];

  /* Top 5 cities for the chip row — the ones most users tap */
  var TOP_CITIES = ['Casablanca','Rabat','Marrakech','Tanger','Agadir'];

  /* Service categories — spec: emoji + label + keyword trigger */
  var SERVICES = [
    { slug:'plomberie',     icon:'🔧', label:'Plomberie',
      words:['fuite','plomb','robinet','tuyau','wc','canalisation','débouchage','debouchage','chauffe-eau'] },
    { slug:'electricite',   icon:'⚡', label:'Électricité',
      words:['elect','panne','disjoncteur','court-circuit','prise','lumière','lumiere','tableau'] },
    { slug:'serrurerie',    icon:'🔐', label:'Serrurerie',
      words:['serrure','serrurier','porte bloqu','bloquée','clé','clef','barillet','effraction'] },
    { slug:'climatisation', icon:'❄️', label:'Climatisation',
      words:['clim','climatis','froid','chaleur','ventil','pompe'] },
    { slug:'menuiserie',    icon:'🪟', label:'Menuiserie',
      words:['menuiserie','menuisier','porte','fenêtre','fenetre','volet','parquet','bois','placard'] },
    { slug:'peinture',      icon:'🖌', label:'Peinture',
      words:['peinture','peintre','façade','facade','mur','enduit','ravalement'] },
    { slug:'maconnerie',    icon:'🧱', label:'Maçonnerie',
      words:['maconnerie','maçon','beton','béton','carrelage','chape','dallage','mur porteur'] },
    { slug:'nettoyage',     icon:'🧹', label:'Nettoyage',
      words:['nettoyage','ménage','menage','nettoyer','désinfection','vitres'] },
    { slug:'jardinage',     icon:'🌿', label:'Jardinage',
      words:['jardin','taille','haie','pelouse','arrosage','tondeuse'] },
    { slug:'demenagement',  icon:'📦', label:'Déménagement',
      words:['déménag','demenag','transport meuble','carton','meuble'] },
  ];

  /* Urgency choices — spec: now / today / later */
  var URGENCIES = [
    { value:'Urgent (moins de 30 min)', icon:'⚡', label:'Maintenant',
      meta:'Artisan disponible dès que possible', urgent:true },
    { value:"Aujourd'hui", icon:'📅', label:"Aujourd'hui",
      meta:'Dans la journée', urgent:false },
    { value:'Normal', icon:'🗓', label:'Plus tard',
      meta:'Planification flexible', urgent:false },
  ];

  /* ══════════════════════════════════════════════════════════
     EMERGENCY SITUATIONS — situation labels → service slug map
     Used only in emergency mode step 1.
  ══════════════════════════════════════════════════════════ */
 var EMERGENCY_SITUATIONS = [
  {
    icon: '💧',
    label: 'Fuite d’eau importante',
    slug: 'plomberie',
    serviceLabel: 'Plomberie'
  },
  {
    icon: '🚿',
    label: 'WC ou évier complètement bouché',
    slug: 'plomberie',
    serviceLabel: 'Plomberie'
  },
  {
    icon: '⚡',
    label: 'Plus de courant chez moi',
    slug: 'electricite',
    serviceLabel: 'Électricité'
  },
  {
    icon: '🔌',
    label: 'Panne électrique urgente',
    slug: 'electricite',
    serviceLabel: 'Électricité'
  },
  {
    icon: '🔐',
    label: 'Je suis bloqué dehors',
    slug: 'serrurerie',
    serviceLabel: 'Serrurerie'
  },
  {
    icon: '🚪',
    label: 'Porte ou fenêtre bloquée',
    slug: 'menuiserie',
    serviceLabel: 'Menuiserie'
  },
  {
    icon: '❄️',
    label: 'Climatiseur en panne',
    slug: 'climatisation',
    serviceLabel: 'Climatisation'
  },

   {
  icon: '🔥',
  label: 'Chauffe-eau en panne',
  slug: 'plomberie',
  serviceLabel: 'Plomberie'
}
   
];

  /* ── Emergency lane constants (7C.10D.2) ── */
  var URGENT_BADGE_TEXT = '\u26a1 URGENCE FIXEO';
  var URGENT_LANE_STEPS = ['1\u00a0Situation', '2\u00a0Ville', '3\u00a0Contact'];

  /* Estimator-eligible métiers from emergency (VALID_METIERS in orchestrator).
   * 'autre' is NOT a valid Estimator métier — bridge hidden for that slug. */
  var ESTIMATOR_ELIGIBLE_SLUGS = ['plomberie', 'electricite', 'serrurerie', 'climatisation', 'menuiserie'];

  /* RAFI messages — v5i (standard + emergency) */
  var MSG = {
    /* ── Standard mode ── */
    step1:         'De quoi avez-vous besoin\u00a0?',
    step2:         function() { return 'Parfait.\u00a0Vous \u00eates o\u00f9\u00a0?'; },
    step2DetCity:  function(s, city) { return 'Parfait.\u00a0Vous \u00eates \u00e0\u00a0' + city + '\u00a0?'; },
    step3:         'Sur quel num\u00e9ro peut-on vous joindre\u00a0?',
    step3Pre:      "C\u2019est toujours ce num\u00e9ro\u00a0?",
    interstitial:  'Je trouve les meilleurs pour vous.',
    interstitialLate: '\u00c7a prend un instant de plus\u2026',
    successDefault: "C\u2019est not\u00e9.",
    successMarket:  'Votre demande est entre de bonnes mains.',
    step1Other:    'D\u00e9crivez-le en quelques mots, je m\u2019en occupe.',

    /* ── Emergency mode ── */
    step1Emergency:     'Quelle est votre urgence\u00a0?',
    step1EmergencySub:  'Choisissez une situation ou décrivez-la à RAFI.',
    step1EmergencyAutre: 'D\u00e9crivez-moi rapidement ce qu\u2019il se passe.',
    step2Emergency:  'O\u00f9 faut-il intervenir\u00a0?',
    step2EmergencyCity: function(city) { return 'Intervention \u00e0\u00a0' + city + '\u00a0?'; },
    step3Emergency:  'Quel num\u00e9ro pour vous joindre\u00a0?',
    step3EmergencyPre: "C\u2019est bien ce num\u00e9ro\u00a0?",
    step3EmergencySub: 'FIXEO utilisera ce num\u00e9ro pour la coordination de votre demande.',
    interstitialEmergency: 'Transmission de votre demande\u2026',
    successEmergency: 'Urgence transmise \u00e0 FIXEO.',

    /* ── Per-situation ack (emergency) — calm, decisive ── */
    ackEmergency: {
      plomberie:     'Compris.',
      electricite:   'Je comprends.',
      serrurerie:    'D\u2019accord.',
      climatisation: 'Compris.',
      menuiserie:    'D\u2019accord.',
      autre:         'Compris.',
      _default:      'Compris.',
    },

    /* ── Per-service acknowledgements (standard) — non-repetitive, calm ── */
    ack: {
      plomberie:     'Tr\u00e8s bien.',
      electricite:   'Je comprends.',
      serrurerie:    'D\u2019accord.',
      climatisation: 'Parfait.',
      menuiserie:    'Bien not\u00e9.',
      peinture:      'Parfait.',
      maconnerie:    'Je comprends.',
      nettoyage:     'Tr\u00e8s bien.',
      jardinage:     'D\u2019accord.',
      demenagement:  'Bien not\u00e9.',
      _default:      'Parfait.',
    },
  };

  /* ══════════════════════════════════════════════════════════
     STATE — single plain object, fresh on every open
  ══════════════════════════════════════════════════════════ */

  var _st = null;
  var _isOpen = false;

  function _fresh(mode, source) {
    var isEmergency = mode === 'emergency';
    return {
      mode:         mode || 'default',
      source:       source || 'unknown',
      screen:       'step1',
      serviceSlug:  '',
      serviceLabel: '',
      city:         '',
      /* Emergency always means "now" — pre-lock urgency */
      urgency:      isEmergency ? URGENCIES[0].value : URGENCIES[2].value,
      phone:        '',
      description:  '',
      ref:          '',
      submitLocked: false,
      submitTs:     0,
      prefillService: '',
      prefillCity:    '',
      prefillPhone:   '',
      detectedCity:   '',
    };
  }

  /* ══════════════════════════════════════════════════════════
     CONTEXT PREFILL — reads what RAFI OS and hero know
  ══════════════════════════════════════════════════════════ */

  function _readContext(st) {
    /* Detected city */
    try {
      var dc = localStorage.getItem(CITY_STORAGE_KEY) || '';
      if (dc && ALL_CITIES.indexOf(dc) >= 0) st.detectedCity = dc;
    } catch(_) {}

    /* Remembered phone */
    try {
      var ph = localStorage.getItem(PHONE_MEMORY_KEY) || '';
      if (ph && _validPhone(ph)) st.prefillPhone = ph;
    } catch(_) {}

    /* Service from hero input */
    var srcEl = document.querySelector('#qsm-input-nlp, #smart-search-input, #secondary-search-input, #search-input');
    if (srcEl && srcEl.value && srcEl.value.trim().length > 2) {
      st.prefillService = srcEl.value.trim();
    }

    /* City from hero city picker */
    var citySrc = document.querySelector('#qsm-select-city, #filter-city, #services-city-filter');
    if (citySrc && citySrc.value && ALL_CITIES.indexOf(citySrc.value) >= 0) {
      st.prefillCity = citySrc.value;
    }
  }

  /* ══════════════════════════════════════════════════════════
     SCROLL LOCK — position:fixed body (iOS-safe)
  ══════════════════════════════════════════════════════════ */

  var _scrollY = 0;
  var _locked  = false;

  function _lock() {
    if (_locked) return;
    _locked  = true;
    _scrollY = window.scrollY || window.pageYOffset || 0;
    /* Scroll lock: overflow:hidden on <html> only.
       Do NOT set position:fixed on body — it creates a new stacking context
       that offsets position:fixed children (#fxrf4-root) by -scrollY on iOS Safari.
       Storing scrollY and blocking scroll on the root element is sufficient
       and does not shift the viewport coordinate space. */
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function _unlock() {
    if (!_locked) return;
    _locked = false;
    document.documentElement.style.overflow = '';
    document.body.style.overflow  = '';
    document.body.classList.remove('modal-open', 'fxmsf-locked');
    window.scrollTo(0, _scrollY);
  }

  /* ══════════════════════════════════════════════════════════
     BUSINESS LOGIC — inline, no legacy DOM dependency
  ══════════════════════════════════════════════════════════ */

  function _normPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.charAt(0) === '0' && d.length >= 2) d = '212' + d.slice(1);
    return d;
  }

  function _validPhone(raw) {
    if (!raw || !String(raw).trim()) return false;
    var d = _normPhone(String(raw).trim());
    if (!/^212[6-9]\d{8}$/.test(d)) return false;
    if (/^(\d)\1+$/.test(d)) return false;
    return true;
  }

  function _formatPhoneDisplay(raw) {
    /* Format for display: 06 12 34 56 78 */
    var d = String(raw || '').replace(/\D/g, '');
    if (d.indexOf('212') === 0) d = '0' + d.slice(3);
    return d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }

  function _maskPhone(raw) {
    var fmt = _formatPhoneDisplay(raw);
    var parts = fmt.split(' ');
    if (parts.length >= 5) {
      parts[1] = '••'; parts[2] = '••'; parts[3] = '••';
      return parts.join(' ');
    }
    return fmt;
  }

  function _normalizeSlug(raw) {
    var s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    for (var i = 0; i < SERVICES.length; i++) {
      var svc = SERVICES[i];
      for (var j = 0; j < svc.words.length; j++) {
        if (s.indexOf(svc.words[j]) >= 0) return { slug: svc.slug, label: svc.label };
      }
    }
    return null;
  }

  function _genRef() {
    return 'FX-' + Date.now().toString(36).toUpperCase().slice(-4) +
           Math.random().toString(36).slice(2,5).toUpperCase();
  }

  function _saveRequest(st) {
    try {
      var ref = _genRef();
      st.ref = ref;
      var req = {
        id:           Date.now(),
        service:      st.serviceSlug || st.serviceLabel,
        problem:      st.serviceLabel,
        description:  st.description || '',
        city:         st.city,
        phone:        st.phone,
        urgency:      st.urgency,
        tracking_ref: ref,
        status:       'nouvelle',
        created_at:   new Date().toISOString(),
        source:       'fxrf4-v5c',
        mode:         st.mode,
        viewed:       false
      };

      /* Try FixeoClientRequestsStore (primary) */
      if (window.FixeoClientRequestsStore && window.FixeoClientRequestsStore.appendRequest) {
        var r = window.FixeoClientRequestsStore.appendRequest(req);
        return r || { request: req, duplicated: false };
      }

      /* Fallback: localStorage */
      var key = (window.FixeoClientRequest && window.FixeoClientRequest.storageKey) || STORAGE_KEY;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) {}
      if (!Array.isArray(list)) list = [];

      /* Deduplicate within 2.5s */
      var last = list.length ? list[list.length - 1] : null;
      if (last) {
        var same = String(last.problem||'').trim() === st.serviceLabel.trim() &&
                   String(last.city||'').trim()    === st.city.trim() &&
                   String(last.phone||'').trim()   === st.phone.trim();
        if (same && Math.abs(Date.now() - Date.parse(last.created_at || 0)) < 2500) {
          return { request: last, duplicated: true };
        }
      }
      list.push(req);
      localStorage.setItem(key, JSON.stringify(list));
      return { request: req, duplicated: false };
    } catch(e) {
      console.warn('[fxrf4] saveRequest failed', e);
      return { request: null, duplicated: false };
    }
  }

  function _fireAnalytics(req, mode, duplicated) {
    try {
      window.dispatchEvent(new CustomEvent('fixeo:client-request-submit-success', {
        detail: { request: req, mode: mode, source: 'fxrf4-v5c',
                  storageKey: STORAGE_KEY, duplicated: duplicated, version: 'fxrf4-v5c' }
      }));
    } catch(_) {}
  }

  /* ══════════════════════════════════════════════════════════
     DOM HELPERS
  ══════════════════════════════════════════════════════════ */

  function _h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function(k) {
        if (k === 'cls')  el.className = attrs[k];
        else if (k === 'txt')  el.textContent = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else el.setAttribute(k, attrs[k]);
      });
    }
    if (children) children.forEach(function(c) { if (c) el.appendChild(c); });
    return el;
  }

  function _q(sel) { return _root ? _root.querySelector(sel) : null; }

  /* ══════════════════════════════════════════════════════════
     DOM STRUCTURE — built once, reused
  ══════════════════════════════════════════════════════════ */

  var _root = null;

  function _buildDOM() {
    if (_root) return;

    _root = _h('div', { id: 'fxrf4-root', 'aria-hidden': 'true' });

    /* Backdrop — tap to close */
    var bd = _h('div', { id: 'fxrf4-bd' });
    bd.addEventListener('click', function(e) { if (e.target === bd) close(); });

    /* Dialog */
    var dialog = _h('div', {
      id: 'fxrf4-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'fxrf4-rafi-msg-text'
    });

    /* Header */
    var head = _h('div', { id: 'fxrf4-head' });

    var rafiRow = _h('div', { id: 'fxrf4-rafi-row' });

    var avatar = _h('div', { id: 'fxrf4-avatar' });
    var rafiImgSrc = window.RAFI_MICRO || '/rafi/RAFI_V2_MicroGlyph.webp';
    var avImg = _h('img', { src: rafiImgSrc, alt: '', width: '36', height: '36',
                             loading: 'eager', decoding: 'async' });
    var avFallback = _h('span', { id: 'fxrf4-avatar-fallback', txt: 'R', 'aria-hidden': 'true' });
    avImg.onerror = function() {
      this.style.display = 'none';
      avatar.classList.add('img-failed');
    };
    avatar.appendChild(avImg);
    avatar.appendChild(avFallback);

    var rafiMsg = _h('div', { id: 'fxrf4-rafi-msg' });
    var rafiName = _h('span', { cls: 'fxrf4-rafi-name', txt: 'RAFI', 'aria-hidden': 'true' });
    var rafiText = _h('span', {
      cls: 'fxrf4-rafi-text',
      id: 'fxrf4-rafi-msg-text',
      txt: MSG.step1
    });
    rafiMsg.appendChild(rafiName);
    rafiMsg.appendChild(rafiText);

    rafiRow.appendChild(avatar);
    rafiRow.appendChild(rafiMsg);

    var closeBtn = _h('button', {
      id: 'fxrf4-close', type: 'button',
      'aria-label': 'Fermer',
      html: '&#x2715;'
    });

    function _doClose(e) { e.preventDefault(); e.stopPropagation(); close(); }
    closeBtn.addEventListener('click',    _doClose);
    closeBtn.addEventListener('touchend', _doClose, { passive: false });

    head.appendChild(rafiRow);
    head.appendChild(closeBtn);

    /* Progress */
    var progress = _h('div', { id: 'fxrf4-progress' });
    var fill = _h('div', { id: 'fxrf4-progress-fill' });
    progress.appendChild(fill);

    /* Body */
    var body = _h('div', { id: 'fxrf4-body' });

    /* Footer */
    var foot = _h('div', { id: 'fxrf4-foot' });

    dialog.appendChild(head);
    dialog.appendChild(progress);
    dialog.appendChild(body);
    dialog.appendChild(foot);

    _root.appendChild(bd);
    _root.appendChild(dialog);
    /* Append to <html> so body position/transform never affects #fxrf4-root */
    document.documentElement.appendChild(_root);

    /* Swipe-to-dismiss on mobile */
    _wireSwipeDismiss(dialog);

    /* Diagnostic */
    console.log('[fxrf4-v5c] DOM built. Header children:', head.childElementCount, '(expected 2: rafi-row, close)');
  }

  /* ══════════════════════════════════════════════════════════
     RAFI MESSAGE — typewriter effect
  ══════════════════════════════════════════════════════════ */

  var _typeTimer = null;

  function _rafiSpeak(text, urgent, instant) {
    var el = _q('#fxrf4-rafi-msg-text');
    var name = _q('.fxrf4-rafi-name');
    if (!el) return;

    /* Update urgent styling */
    if (name) name.classList.toggle('is-urgent', !!urgent);

    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      /* Cancel any in-progress typewriter before instant set */
      if (_typeTimer) { clearInterval(_typeTimer); _typeTimer = null; }
      el.textContent = text;
      el.classList.remove('is-typing');
      return;
    }

    /* Clear any in-progress type */
    if (_typeTimer) { clearInterval(_typeTimer); _typeTimer = null; }
    el.textContent = '';
    el.classList.add('is-typing');

    var i = 0;
    var chars = Array.from(text); /* handles emoji correctly */
    var delay = Math.max(22, Math.min(36, 1200 / chars.length)); /* 22–36ms per char, max ~1.2s total */

    _typeTimer = setInterval(function() {
      el.textContent += chars[i];
      i++;
      if (i >= chars.length) {
        clearInterval(_typeTimer);
        _typeTimer = null;
        el.classList.remove('is-typing');
      }
    }, delay);
  }

  /* ══════════════════════════════════════════════════════════
     PROGRESS
  ══════════════════════════════════════════════════════════ */

  function _setProgress(n, total) {
    var fill = _q('#fxrf4-progress-fill');
    if (fill) fill.style.width = Math.round((n / total) * 100) + '%';
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN TRANSITIONS
  ══════════════════════════════════════════════════════════ */

  var _transitioning = false;

  function _transition(renderFn, direction) {
    /* direction: 'forward' | 'back' */
    if (_transitioning) return;
    _transitioning = true;

    var body = _q('#fxrf4-body');
    if (!body) { renderFn(); _transitioning = false; return; }

    var outClass = direction === 'back' ? 'is-leaving-back' : 'is-leaving';
    var current = body.querySelector('.fxrf4-screen');

    if (!current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      body.innerHTML = '';
      renderFn();
      _transitioning = false;
      return;
    }

    current.classList.add(outClass);
    setTimeout(function() {
      body.innerHTML = '';
      renderFn();
      _transitioning = false;
    }, 180);
  }

  function _transitionFwd(renderFn) { _transition(renderFn, 'forward'); }
  function _transitionBck(renderFn) { _transition(renderFn, 'back'); }

  function _screen(children) {
    /* Wrap content in .fxrf4-screen for transition animation */
    var wrap = _h('div', { cls: 'fxrf4-screen' });
    if (children) children.forEach(function(c) { if (c) wrap.appendChild(c); });
    return wrap;
  }

  /* ══════════════════════════════════════════════════════════
     FOOTER MANAGEMENT
  ══════════════════════════════════════════════════════════ */

  function _setFoot() {
    var foot = _q('#fxrf4-foot');
    if (foot) foot.innerHTML = '';
    return foot;
  }

  function _primaryBtn(label, urgent, onClick) {
    var btn = _h('button', {
      cls: 'fxrf4-btn fxrf4-btn-primary' + (urgent ? ' is-urgent' : ''),
      type: 'button', txt: label
    });
    btn.addEventListener('click', function(e) { e.preventDefault(); onClick(btn); });
    btn.addEventListener('touchend', function(e) { e.preventDefault(); onClick(btn); }, { passive: false });
    return btn;
  }

  function _backBtn(onClick) {
    var btn = _h('button', { cls: 'fxrf4-btn fxrf4-btn-back', type: 'button', txt: '← Retour' });
    btn.addEventListener('click', function(e) { e.preventDefault(); onClick(); });
    btn.addEventListener('touchend', function(e) { e.preventDefault(); onClick(); }, { passive: false });
    return btn;
  }

  function _btnLoading(btn) {
    btn.disabled = true;
    btn.innerHTML = '';
    var dots = _h('div', { cls: 'fxrf4-btn-dots' });
    [1,2,3].forEach(function() { dots.appendChild(_h('span')); });
    btn.appendChild(dots);
  }

  function _btnRestore(btn, label, urgent) {
    btn.disabled = false;
    btn.textContent = label;
    btn.classList.toggle('is-urgent', !!urgent);
  }

  /* ══════════════════════════════════════════════════════════
     CHIP TAP — selection feedback + auto-advance
  ══════════════════════════════════════════════════════════ */

  function _chipTap(chip, allChips, onAdvance, ackMsg) {
    /* Spec: tap → scale (80ms) → dim others → advance (260ms total) */
    chip.classList.add('is-tapping');
    setTimeout(function() {
      chip.classList.remove('is-tapping');
      chip.classList.add('is-selected');
      allChips.forEach(function(c) {
        if (c !== chip) c.classList.add('is-dimmed');
      });
      /* RAFI acknowledges the choice instantly — shows during the dim beat */
      if (ackMsg) _rafiSpeak(ackMsg, false, true /* instant — no typewriter here */);
    }, 80);

    /* Haptic feedback */
    try { if (navigator.vibrate) navigator.vibrate(8); } catch(_) {}

    /* Auto-advance after brief breathing room (unchanged timing) */
    setTimeout(onAdvance, 260);
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 1 — SERVICE / SITUATION SELECTION
     Standard: 2-col service grid with "Autre chose"
     Emergency: single-column situation list, auto-advance on tap
  ══════════════════════════════════════════════════════════ */

  function _renderStep1() {
    var st = _st;
    var isEmergency = st.mode === 'emergency';

    _setProgress(1, 3);
    _setFoot();

    if (isEmergency) {
      _renderEmergencyStep1();
    } else {
      _renderStandardStep1();
    }
  }

  /* ── Emergency lane header extras (7C.10D.2) ── */
  function _injectUrgentLaneHeader() {
    /* Idempotent — only inject once per open */
    if (_q('#fxrf4-urgent-badge')) return;

    var head = _q('#fxrf4-head');
    if (!head) return;

    /* Urgent badge row above RAFI row */
    var badgeRow = _h('div', { id: 'fxrf4-urgent-badge-row' });
    var badge = _h('span', { id: 'fxrf4-urgent-badge', 'aria-label': 'Voie urgente FIXEO', txt: URGENT_BADGE_TEXT });
    badgeRow.appendChild(badge);
    head.insertBefore(badgeRow, head.firstChild);

    /* Compact step indicator below progress bar */
    var progress = _q('#fxrf4-progress');
    if (progress) {
      var laneSteps = _h('div', { id: 'fxrf4-lane-steps', 'aria-hidden': 'true' });
      URGENT_LANE_STEPS.forEach(function(lbl, i) {
        var s = _h('span', { cls: 'fxrf4-lane-step', txt: lbl });
        s.setAttribute('data-step', String(i + 1));
        laneSteps.appendChild(s);
      });
      progress.parentNode.insertBefore(laneSteps, progress.nextSibling);
    }
  }

  function _updateLaneStep(n) {
    var steps = _root ? _root.querySelectorAll('.fxrf4-lane-step') : [];
    for (var i = 0; i < steps.length; i++) {
      var idx = parseInt(steps[i].getAttribute('data-step'), 10);
      steps[i].classList.toggle('is-active',  idx === n);
      steps[i].classList.toggle('is-done',    idx < n);
    }
  }

  /* ── Emergency step 1 — situation list ─────────────────── */
  function _renderEmergencyStep1() {
    var st = _st;

    _injectUrgentLaneHeader();
    _updateLaneStep(1);
    _rafiSpeak(MSG.step1Emergency, false /* not urgent-red — calm */);

    /* Emergency mode label on RAFI name */
    var nameEl = _q('.fxrf4-rafi-name');
    if (nameEl) nameEl.classList.add('is-emergency');

    /* Emergency visual state on the canonical dialog */
var dialogEl = _q('#fxrf4-dialog');
if (dialogEl) dialogEl.classList.add('is-emergency');

    /* Helper sentence — low visual priority, appears below the RAFI question */
    var sub = _h('p', { cls: 'fxrf4-step1-sub', txt: MSG.step1EmergencySub });

    /* RAFI voice entry — universal emergency fallback */
    
var voiceBtn = _h('button', {
  cls: 'fxrf4-emergency-voice',
  type: 'button',
  'aria-label': 'Décrire mon urgence à RAFI'
});

    var speechLangSelect = _h('select', {
  cls: 'fxrf4-emergency-speech-lang',
  'aria-label': 'Langue de reconnaissance vocale'
});

var speechLangFr = _h('option', {
  value: 'fr-FR',
  txt: 'FR'
});

var speechLangDarija = _h('option', {
  value: 'ar-MA',
  txt: 'الدارجة'
});

speechLangSelect.appendChild(speechLangFr);
speechLangSelect.appendChild(speechLangDarija);

/* Même défaut que le Hero */
speechLangSelect.value = 'fr-FR';

voiceBtn.appendChild(_h('span', {
  cls: 'fxrf4-emergency-voice-icon',
  txt: '🎙️'
}));

voiceBtn.appendChild(_h('span', {
  cls: 'fxrf4-emergency-voice-label',
  txt: 'Décrire mon urgence à RAFI'
}));

    var voiceRow = _h('div', {
  cls: 'fxrf4-emergency-voice-row'
});

voiceRow.appendChild(voiceBtn);
voiceRow.appendChild(speechLangSelect);

    /* RAFI voice transcript — shown after transcription */
var transcriptWrap = _h('div', {
  cls: 'fxrf4-voice-transcript'
});

transcriptWrap.hidden = true;

var transcriptInput = _h('textarea', {
  cls: 'fxrf4-voice-transcript-input',
  rows: '3',
  maxlength: '300',
  placeholder: 'RAFI affichera ici ce qu’il a compris…',
  'aria-label': 'Transcription de votre urgence'
});

var transcriptConfirm = _h('button', {
  cls: 'fxrf4-btn fxrf4-btn-primary fxrf4-voice-transcript-confirm',
  type: 'button',
  txt: 'C’est correct →'
});

transcriptWrap.appendChild(transcriptInput);
transcriptWrap.appendChild(transcriptConfirm);

    transcriptConfirm.addEventListener('click', function () {
  var finalText = transcriptInput.value.trim();

  if (finalText.length < 3) return;

  var normalized =
    window.FixeoRafiLanguage &&
    typeof window.FixeoRafiLanguage.normalize === 'function'
      ? window.FixeoRafiLanguage.normalize(finalText)
      : finalText;

  var detected =
    window.FixeoAIRE &&
    typeof window.FixeoAIRE.detect === 'function'
      ? window.FixeoAIRE.detect(normalized)
      : null;

  /* La version validée/corrigée par le client devient la référence */
  st.description = finalText;

  if (detected) {
    st.serviceSlug  = detected.cat;
    st.serviceLabel = detected.label;
  } else {
    st.serviceSlug  = 'autre';
    st.serviceLabel = finalText;
  }

  _transitionFwd(_renderStep2);
});
    
/* RAFI voice recorder state — scoped to emergency step 1 */
var voiceRecorder = null;
var voiceStream = null;
var voiceChunks = [];
var voiceStopTimer = null;
var voiceProcessing = false;

var voiceLabel = voiceBtn.querySelector('.fxrf4-emergency-voice-label');

function _resetVoiceButton() {
  voiceProcessing = false;

  if (voiceLabel) {
    voiceLabel.textContent = 'Décrire mon urgence à RAFI';
  }

  voiceBtn.removeAttribute('disabled');
}

function _stopVoiceRecording() {
  if (
    voiceRecorder &&
    voiceRecorder.state === 'recording'
  ) {
    voiceRecorder.stop();
  }
}

voiceBtn.addEventListener('click', async function () {

  /* Second tap = stop */
  if (
    voiceRecorder &&
    voiceRecorder.state === 'recording'
  ) {
    if (voiceLabel) {
      voiceLabel.textContent = 'RAFI analyse…';
    }

    voiceProcessing = true;
    voiceBtn.setAttribute('disabled', 'disabled');

    _stopVoiceRecording();
    return;
  }

  if (voiceProcessing) return;

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia ||
    typeof MediaRecorder === 'undefined'
  ) {
    alert('Microphone non disponible sur cet appareil.');
    return;
  }

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    voiceChunks = [];
    voiceRecorder = new MediaRecorder(voiceStream);

    voiceRecorder.addEventListener('dataavailable', function (e) {
      if (e.data && e.data.size > 0) {
        voiceChunks.push(e.data);
      }
    });

    voiceRecorder.addEventListener('stop', function () {
      if (voiceStopTimer) {
        clearTimeout(voiceStopTimer);
        voiceStopTimer = null;
      }

      var audioBlob = new Blob(voiceChunks, {
        type:
          voiceRecorder.mimeType ||
          (voiceChunks[0] && voiceChunks[0].type) ||
          ''
      });

      if (voiceStream) {
        voiceStream.getTracks().forEach(function (track) {
          track.stop();
        });
      }

      voiceStream = null;

      var form = new FormData();

      form.append(
        'audio',
        audioBlob,
        audioBlob.type.indexOf('mp4') !== -1
          ? 'rafi-voice.mp4'
          : 'rafi-voice.webm'
      );

      form.append('language', speechLangSelect.value);

      fetch('/api/rafi-transcribe', {
        method: 'POST',
        body: form
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return {
              status: response.status,
              data: data
            };
          });
        })

        .then(function (result) {
          var transcript =
            result.data && result.data.text
              ? result.data.text.trim()
              : '';

          if (
            !result.data ||
            result.data.ok !== true ||
            !transcript
          ) {
            _resetVoiceButton();
            alert('RAFI n’a pas compris. Réessayez.');
            return;
          }

          var normalized =
            window.FixeoRafiLanguage &&
            typeof window.FixeoRafiLanguage.normalize === 'function'
              ? window.FixeoRafiLanguage.normalize(transcript)
              : transcript;

          var detected =
            window.FixeoAIRE &&
            typeof window.FixeoAIRE.detect === 'function'
              ? window.FixeoAIRE.detect(normalized)
              : null;

          st.description = transcript;

          if (detected) {
            st.serviceSlug = detected.cat;
            st.serviceLabel = detected.label;
          } else {
            st.serviceSlug = 'autre';
            st.serviceLabel = transcript;
          }

          /* Show editable transcription */
          transcriptInput.value = transcript;
          transcriptWrap.hidden = false;

          _resetVoiceButton();
          transcriptInput.focus();
        })

        .catch(function (err) {
          _resetVoiceButton();

          alert(
            'Erreur réseau : ' +
            (err && err.message
              ? err.message
              : String(err))
          );
        });
    });

    voiceRecorder.start();

    if (voiceLabel) {
      voiceLabel.textContent = '⏹️ Arrêter l’enregistrement';
    }

    /*
     * Safety limit only.
     * User normally stops with second tap.
     */
    voiceStopTimer = setTimeout(function () {
      if (
        voiceRecorder &&
        voiceRecorder.state === 'recording'
      ) {
        if (voiceLabel) {
          voiceLabel.textContent = 'RAFI analyse…';
        }

        voiceProcessing = true;
        voiceBtn.setAttribute('disabled', 'disabled');

        _stopVoiceRecording();
      }
    }, 12000);

  } catch (err) {
    _resetVoiceButton();
    alert('Accès au microphone refusé.');
  }
});

    var list = _h('div', {
  cls: 'fxrf4-situation-list',
  role: 'list'
}); 
    var chips = [];

    EMERGENCY_SITUATIONS.forEach(function(sit) {
      var isAutre = sit.slug === 'autre';

      var chip = _h('div', {
        cls: 'fxrf4-situation-item' + (isAutre ? ' is-autre' : ''),
        role: 'listitem button', tabindex: '0',
        'aria-label': sit.label
      });
      var icon  = _h('span', { cls: 'fxrf4-situation-icon', txt: sit.icon });
      var label = _h('span', { cls: 'fxrf4-situation-label', txt: sit.label });
      chip.appendChild(icon);
      chip.appendChild(label);
      chips.push(chip);
      list.appendChild(chip);

      if (!isAutre) {
        /* Standard tap → select → advance */
        function _onSitTap() {
          if (chip.classList.contains('is-dimmed')) return;
          st.serviceSlug  = sit.slug;
          st.serviceLabel = sit.serviceLabel;
          var ack = MSG.ackEmergency[sit.slug] || MSG.ackEmergency._default;
          _chipTap(chip, chips, function() { _transitionFwd(_renderStep2); }, ack);
        }
        chip.addEventListener('click',    _onSitTap);
        chip.addEventListener('touchend', function(e) { e.preventDefault(); _onSitTap(); }, { passive: false });
        chip.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onSitTap(); });

      } else {
        /* "Autre urgence" — inline expand into description field */
        var expanded = false;

        /* Expand panel — built once, hidden initially */
        var expandWrap = _h('div', { cls: 'fxrf4-autre-expand' });

        /* RAFI listening line — visual echo of the spoken question inside the card */
        var rafiLine = _h('p', { cls: 'fxrf4-autre-rafi-line', txt: MSG.step1EmergencyAutre });
        expandWrap.appendChild(rafiLine);

        var autreInput = _h('input', {
          cls: 'fxrf4-autre-input',
          type: 'text',
          placeholder: "Ex.\u00a0: Odeur de gaz, fuite d\u2019eau\u2026",
          maxlength: '100',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'sentences',
          'aria-label': "D\u00e9crire l\u2019urgence"
        });

        var confirmBtn = _h('button', {
          cls: 'fxrf4-btn fxrf4-btn-primary fxrf4-autre-confirm',
          type: 'button',
          txt: 'Continuer \u2192',
          disabled: 'true'
        });

        autreInput.addEventListener('input', function() {
          var hasVal = autreInput.value.trim().length >= 3;
          confirmBtn.disabled = !hasVal;
        });

        function _confirmAutre() {
          var val = autreInput.value.trim();
          if (val.length < 3) return;
          st.serviceSlug  = 'autre';
          st.serviceLabel = val;
          st.description  = val; /* F1: duplicate into description for downstream consumers */
          _transitionFwd(_renderStep2);
        }

        confirmBtn.addEventListener('click',    _confirmAutre);
        confirmBtn.addEventListener('touchend', function(e) { e.preventDefault(); _confirmAutre(); }, { passive: false });
        autreInput.addEventListener('keydown',  function(e) { if (e.key === 'Enter') _confirmAutre(); });

        expandWrap.appendChild(autreInput);
        expandWrap.appendChild(confirmBtn);
        chip.appendChild(expandWrap);

        function _onAutreTap() {
          if (expanded) return;
          expanded = true;

          /* Dim all other chips */
          chips.forEach(function(c) { if (c !== chip) c.classList.add('is-dimmed'); });

          /* Expand the card */
          chip.classList.add('is-autre-expanded');
          expandWrap.classList.add('is-visible');

          /* RAFI speaks the follow-up question */
          _rafiSpeak(MSG.step1EmergencyAutre, false, true);

          /* Focus the input after expand animation */
          setTimeout(function() { autreInput.focus(); }, 200);
        }

        chip.addEventListener('click',    _onAutreTap);
        chip.addEventListener('touchend', function(e) {
          /* CRITICAL: check expanded BEFORE preventDefault.
           * If expanded, the event target is a child (autreInput, confirmBtn).
           * Calling preventDefault() here would cancel iOS focus synthesis on the input.
           * When not yet expanded, preventDefault() prevents the 300ms click delay. */
          if (expanded) return;
          e.preventDefault();
          _onAutreTap();
        }, { passive: false });
        chip.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onAutreTap(); });

        /* Belt-and-suspenders: stop child touch events from bubbling to chip
         * when expanded. Ensures autreInput and confirmBtn events never reach
         * the chip handler regardless of iOS touch event routing. */
        expandWrap.addEventListener('touchstart', function(e) {
          if (expanded) e.stopPropagation();
        }, { passive: true });
        expandWrap.addEventListener('touchend', function(e) {
          if (expanded) e.stopPropagation();
        }, { passive: true });
      }
    });

    var body = _q('#fxrf4-body');
    if (body) body.appendChild(
  _screen([sub, voiceRow, transcriptWrap, list])
);
  }

  /* ── Standard step 1 — 2-col service grid ──────────────── */
  function _renderStandardStep1() {
    var st = _st;

    _rafiSpeak(MSG.step1, false);

    var grid = _h('div', { cls: 'fxrf4-chips-grid' });
    var chips = [];

    SERVICES.forEach(function(svc) {
      var chip = _h('div', {
        cls: 'fxrf4-chip',
        role: 'button', tabindex: '0', 'aria-label': svc.label
      });
      chip.appendChild(_h('span', { cls: 'fxrf4-chip-icon', txt: svc.icon }));
      chip.appendChild(_h('span', { cls: 'fxrf4-chip-label', txt: svc.label }));

      /* Pre-select from hero input — visual only, user must tap */
      if (st.prefillService) {
        var match = _normalizeSlug(st.prefillService);
        if (match && match.slug === svc.slug) {
          chip.classList.add('is-selected');
          st.serviceSlug  = svc.slug;
          st.serviceLabel = svc.label;
        }
      }

      function _onTap() {
        if (chip.classList.contains('is-dimmed')) return;
        st.serviceSlug  = svc.slug;
        st.serviceLabel = svc.label;
        var ack = MSG.ack[svc.slug] || MSG.ack._default;

        // ── 7C.9K.2: Estimator V2 takeover on standard métier-card tap ──────
        // GUARD: only fires when flag is ON and slug is canonical (not 'autre').
        // Flag OFF = byte-for-byte legacy _chipTap behavior unchanged.
        // ONE-SHOT: _fxrf4EstimatorLaunched (module scope) prevents multi-open.
        var _advance = function() { _transitionFwd(_renderStep2); };
        if (svc.slug !== 'autre' &&
            !_fxrf4EstimatorLaunched &&
            window.FixeoEstimatorConfig &&
            window.FixeoEstimatorConfig.estimatorV2Enabled === true &&
            window.FixeoEstimatorV2 &&
            typeof window.FixeoEstimatorV2.open === 'function') {
          _fxrf4EstimatorLaunched = true; // set before async — prevents races
          _chipTap(chip, chips, function() {
            /* 7C.9L.3H: only send city_slug when trusted this session.
             * sessionStorage.fxrf4_trusted_city_session is written ONLY by:
             *   (a) live geolocation resolution this session
             *   (b) explicit user city chip/select interaction this session
             * Never written from localStorage restore → no stale city is auto-trusted. */
            var _trustedCity = null;
            try { _trustedCity = sessionStorage.getItem(TRUSTED_CITY_SESSION_KEY) || null; } catch(_) {}
            window.FixeoEstimatorV2.open({
              source:       'rafi',
              metier_hint:  svc.slug,
              city_slug:    _trustedCity,   // 7C.9L.3H: canonical field (was 'city', now 'city_slug')
              urgency:      null, // urgency not yet known at step1 in standard mode
            }).then(function(result) {
              if (result && result.accepted === true) {
                // 7C.9K.5: Estimator V2 owns the interaction.
                // Dismiss RAFI so Estimator (z-index 1000) becomes visible.
                // fxrf4 close() is safe: Estimator has no dependency on _st.
                window.closeModal('request-modal');
                return; // city advance suppressed
              }
              // accepted:false — reset guard, continue legacy city flow.
              _fxrf4EstimatorLaunched = false;
              _advance();
            }).catch(function() {
              // Any error — reset guard, continue legacy city flow.
              _fxrf4EstimatorLaunched = false;
              _advance();
            });
          }, ack);
        } else {
          // Flag OFF, 'autre', or already launched — exact legacy behavior.
          _chipTap(chip, chips, _advance, ack);
        }
        // ── end estimator hook ───────────────────────────────────────────────
      }

      chip.addEventListener('click',    _onTap);
      chip.addEventListener('touchend', function(e) { e.preventDefault(); _onTap(); }, { passive: false });
      chip.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onTap(); });

      chips.push(chip);
      grid.appendChild(chip);
    });

    /* "Autre chose" chip — full width, quiet */
    var otherChip = _h('div', {
      cls: 'fxrf4-chip is-other',
      role: 'button', tabindex: '0', 'aria-label': 'Autre chose'
    });
    otherChip.appendChild(_h('span', { cls: 'fxrf4-chip-label', txt: '+ Autre chose' }));
    chips.push(otherChip);
    grid.appendChild(otherChip);

    var otherWrap = _h('div', { cls: 'fxrf4-other-input-wrap' });
    var otherInput = _h('input', {
      cls: 'fxrf4-phone-input',
      type: 'text', placeholder: 'Ex\u00a0: fuite d\u2019eau, vitres cass\u00e9es\u2026',
      maxlength: '80', autocomplete: 'off', autocorrect: 'off'
    });
    otherInput.style.fontSize = '0.96rem';
    otherInput.style.paddingLeft = '16px';
    otherWrap.appendChild(otherInput);

    var confirmOtherBtn = _h('button', {
      cls: 'fxrf4-btn fxrf4-btn-primary', type: 'button', txt: 'Confirmer \u2192'
    });
    confirmOtherBtn.style.marginTop = '10px';
    confirmOtherBtn.style.display = 'none';
    otherWrap.appendChild(confirmOtherBtn);

    otherInput.addEventListener('input', function() {
      confirmOtherBtn.style.display = otherInput.value.trim().length >= 3 ? 'flex' : 'none';
    });

    function _confirmOther() {
      var val = otherInput.value.trim();
      if (val.length < 3) return;
      st.serviceSlug  = 'autre';
      st.serviceLabel = val;
      st.description  = val; /* F1: duplicate into description for downstream consumers */
      _transitionFwd(_renderStep2);
    }
    confirmOtherBtn.addEventListener('click', _confirmOther);
    confirmOtherBtn.addEventListener('touchend', function(e) { e.preventDefault(); _confirmOther(); }, { passive: false });

    function _openOther() {
      chips.forEach(function(c) { if (c !== otherChip) c.classList.add('is-dimmed'); });
      otherChip.classList.add('is-selected');
      otherWrap.classList.add('is-visible');
      _rafiSpeak(MSG.step1Other, false);
      setTimeout(function() { otherInput.focus({ preventScroll: true }); }, 120);
    }

    otherChip.addEventListener('click', _openOther);
    otherChip.addEventListener('touchend', function(e) { e.preventDefault(); _openOther(); }, { passive: false });

    var body = _q('#fxrf4-body');
    if (body) body.appendChild(_screen([grid, otherWrap]));
    /* Never auto-advance. User must tap to confirm. */
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 2 — CITY + URGENCY
     "[Service]. Vous êtes où ?"
     City chip → urgency cards appear → tap → auto-advance to Step 3
  ══════════════════════════════════════════════════════════ */

  function _renderStep2() {
    var st = _st;
    var isEmergency = st.mode === 'emergency';
    /* Emergency mode acts like urgent for city tap (skip urgency section) */
    var isUrgent = isEmergency;
    var detected = st.detectedCity || st.prefillCity || '';

    _setProgress(2, 3);
    if (isEmergency) _updateLaneStep(2);

    /* RAFI message */
    var msg;
    if (isEmergency && detected) {
      msg = MSG.step2EmergencyCity(detected);
    } else if (isEmergency) {
      msg = MSG.step2Emergency;
    } else if (detected) {
      msg = MSG.step2DetCity(st.serviceLabel, detected);
    } else {
      msg = MSG.step2(st.serviceLabel);
    }
    _rafiSpeak(msg, false /* never red — calm */);

    _setFoot();

    var body = _q('#fxrf4-body');

    /* ── City section ── */
    var cityRow = _h('div', { cls: 'fxrf4-city-row', 'aria-label': 'Choisir une ville' });
    var cityChips = [];
    var selectedCity = st.city || detected || '';

    /* Build top-city chips, detected city first if not in top 5 */
    var displayCities = TOP_CITIES.slice();
    if (detected && displayCities.indexOf(detected) < 0) {
      displayCities.unshift(detected);
      displayCities = displayCities.slice(0, 5);
    }

    displayCities.forEach(function(city) {
      var chip = _h('div', {
        cls: 'fxrf4-city-chip',
        role: 'button', tabindex: '0', 'aria-label': city,
        txt: city
      });

      if (city === detected) chip.classList.add('is-detected');
      if (city === selectedCity) chip.classList.add('is-selected');

      function _onCityTap() {
        cityChips.forEach(function(c) { c.classList.remove('is-selected'); });
        chip.classList.add('is-selected');
        st.city = city;
        /* 7C.10D.2: In emergency mode, explicit city tap is trusted for this session.
         * Write TRUSTED_CITY_SESSION_KEY (same key used by /estimation city picker)
         * so that a subsequent Estimator launch can use city_slug from session trust.
         * City affects UX/routing only — no price effect (orchestrator doctrine). */
        if (isUrgent) {
          try { sessionStorage.setItem(TRUSTED_CITY_SESSION_KEY, city); } catch (_) {}
        }
        /* If express, skip urgency → go straight to step 3 */
        if (isUrgent) {
          setTimeout(function() { _transitionFwd(_renderStep3); }, 200);
        } else {
          _showUrgencyCards();
        }
      }

      chip.addEventListener('click',    _onCityTap);
      chip.addEventListener('touchend', function(e) { e.preventDefault(); _onCityTap(); }, { passive: false });
      chip.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onCityTap(); });

      cityChips.push(chip);
      cityRow.appendChild(chip);
    });

    /* "Autre ville →" chip */
    var moreChip = _h('div', { cls: 'fxrf4-city-chip is-more', role: 'button', tabindex: '0', txt: 'Autre ville →' });
    cityRow.appendChild(moreChip);

    /* City select (appears on "Autre ville" tap) */
    var citySelectWrap = _h('div', { cls: 'fxrf4-select-wrap' });
    citySelectWrap.style.display = 'none';
    var citySelect = _h('select', { cls: 'fxrf4-select', 'aria-label': 'Choisir une ville' });
    var defOpt = _h('option', { value: '', txt: 'Choisir une ville…' });
    citySelect.appendChild(defOpt);
    ALL_CITIES.forEach(function(c) {
      var opt = _h('option', { value: c, txt: c });
      if (c === selectedCity) opt.selected = true;
      citySelect.appendChild(opt);
    });
    citySelectWrap.appendChild(citySelect);

    citySelect.addEventListener('change', function() {
      var city = citySelect.value;
      if (!city) return;
      st.city = city;
      /* 7C.10D.2: explicit select = trusted for session (same as chip tap) */
      if (isUrgent) {
        try { sessionStorage.setItem(TRUSTED_CITY_SESSION_KEY, city); } catch (_) {}
      }
      cityChips.forEach(function(c) { c.classList.remove('is-selected'); });
      if (isUrgent) {
        setTimeout(function() { _transitionFwd(_renderStep3); }, 200);
      } else {
        _showUrgencyCards();
      }
    });

    moreChip.addEventListener('click', function() {
      citySelectWrap.style.display = 'block';
      setTimeout(function() { citySelect.focus(); }, 80);
    });
    moreChip.addEventListener('touchend', function(e) {
      e.preventDefault();
      citySelectWrap.style.display = 'block';
      setTimeout(function() { citySelect.focus(); }, 80);
    }, { passive: false });

    /* ── Urgency section — standard mode only ── */
    /* Emergency: city tap routes directly to step 3 (urgency is pre-locked to "now").
       Don't build urgency DOM at all in emergency mode. */
    var urgencySection = null;

    function _showUrgencyCards() {
      if (!urgencySection) return;
      if (urgencySection.style.display !== 'none') return;
      urgencySection.style.display = 'block';
      setTimeout(function() {
        urgencySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }

    if (!isEmergency) {
      urgencySection = _h('div');
      urgencySection.style.display = 'none';

      var urgCards = _h('div', { cls: 'fxrf4-urgency-cards', 'aria-label': 'Urgence' });

      URGENCIES.forEach(function(u) {
        var card = _h('div', {
          cls: 'fxrf4-urgency-card' + (u.urgent ? ' is-urgent' : ''),
          role: 'button', tabindex: '0', 'aria-label': u.label
        });

        card.appendChild(_h('span', { cls: 'fxrf4-urgency-icon', txt: u.icon }));
        var textDiv = _h('div', { cls: 'fxrf4-urgency-text' });
        textDiv.appendChild(_h('span', { cls: 'fxrf4-urgency-label', txt: u.label }));
        textDiv.appendChild(_h('span', { cls: 'fxrf4-urgency-meta', txt: u.meta }));
        card.appendChild(textDiv);

        if (u.value === st.urgency) card.classList.add('is-selected');

        function _onUrgTap() {
          card.classList.add('is-tapping');
          setTimeout(function() { card.classList.remove('is-tapping'); }, 120);
          st.urgency = u.value;
          urgCards.querySelectorAll('.fxrf4-urgency-card').forEach(function(c) {
            c.classList.remove('is-selected');
          });
          card.classList.add('is-selected');
          setTimeout(function() { _transitionFwd(_renderStep3); }, 240);
        }

        card.addEventListener('click',    _onUrgTap);
        card.addEventListener('touchend', function(e) { e.preventDefault(); _onUrgTap(); }, { passive: false });
        card.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onUrgTap(); });

        urgCards.appendChild(card);
      });

      urgencySection.appendChild(urgCards);
    }

    /* Back */
    var foot2 = _q('#fxrf4-foot');
    if (foot2) foot2.appendChild(_backBtn(function() { _transitionBck(_renderStep1); }));

    var screenChildren = [cityRow, citySelectWrap];
    if (urgencySection) screenChildren.push(urgencySection);
    if (body) body.appendChild(_screen(screenChildren));

    /* F2: Back from step 3 — if city + urgency already set in standard mode,
       reveal urgency section immediately (no re-tap of city required).
       Uses setTimeout(0) so the screen is in the DOM before style change. */
    if (!isEmergency && st.city && urgencySection) {
      setTimeout(_showUrgencyCards, 0);
    }
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 3 — PHONE NUMBER
     "Sur quel numéro vous rappelle-t-on ?"
     Large field. Auto-focused. Pre-fill if returning user.
  ══════════════════════════════════════════════════════════ */

  function _renderStep3() {
    var st = _st;
    var isEmergency = st.mode === 'emergency';
    var hasPrefill = !!st.prefillPhone;

    _setProgress(3, 3);
    if (isEmergency) _updateLaneStep(3);

    var rafiMsg3;
    if (hasPrefill) {
      rafiMsg3 = isEmergency ? MSG.step3EmergencyPre : MSG.step3Pre;
    } else {
      rafiMsg3 = isEmergency ? MSG.step3Emergency : MSG.step3;
    }
    _rafiSpeak(rafiMsg3, false /* calm */);

    var foot = _setFoot();
    var body = _q('#fxrf4-body');

    var elements = [];

    /* 7C.10D.2: Emergency step 3 — supporting sub-text (above phone input) */
    if (isEmergency) {
      elements.push(_h('p', { cls: 'fxrf4-step3-emergency-sub', txt: MSG.step3EmergencySub }));
    }

    if (hasPrefill && !st._phoneUnlocked) {
      /* Returning user — show masked number + "Ce n'est pas mon numéro" */
      var prefillRow = _h('div', { cls: 'fxrf4-prefill-row' });
      var masked = _h('span', { cls: 'fxrf4-prefill-number', txt: _maskPhone(st.prefillPhone) });
      var changeLink = _h('a', { cls: 'fxrf4-prefill-change', txt: 'Changer', role: 'button', tabindex: '0' });
      prefillRow.appendChild(masked);
      prefillRow.appendChild(changeLink);
      elements.push(prefillRow);

      st.phone = st.prefillPhone;

      function _onChangePhone() {
        st._phoneUnlocked = true;
        st.phone = '';
        _transitionBck(_renderStep3);
      }
      changeLink.addEventListener('click', _onChangePhone);
      changeLink.addEventListener('touchend', function(e) { e.preventDefault(); _onChangePhone(); }, { passive: false });

      /* Primary: confirm with pre-filled number */
      var confirmBtn = _primaryBtn(
        isEmergency ? '⚡ Transmettre mon urgence' : 'Confirmer et envoyer \u2192',
        isEmergency,
        function(btn) { _submitRequest(btn); }
      );
      foot.appendChild(confirmBtn);

    } else {
      /* Fresh phone input */
      var phoneWrap = _h('div', { cls: 'fxrf4-phone-wrap' });

      var prefix = _h('div', { cls: 'fxrf4-phone-prefix' });
      prefix.innerHTML = '🇲🇦 +212';

      var phoneInput = _h('input', {
        cls: 'fxrf4-phone-input',
        type: 'tel',
        id: 'fxrf4-phone',
        name: 'phone',
        inputmode: 'tel',
        autocomplete: 'tel',
        placeholder: '06 12 34 56 78',
        maxlength: '20',
        'aria-label': 'Votre numéro de téléphone'
      });

      var validIcon = _h('span', { cls: 'fxrf4-phone-valid-icon', txt: '✓', 'aria-hidden': 'true' });
      phoneWrap.appendChild(prefix);
      phoneWrap.appendChild(phoneInput);
      phoneWrap.appendChild(validIcon);
      elements.push(phoneWrap);

      var hint = _h('p', { cls: 'fxrf4-hint', 'aria-live': 'polite' });
      elements.push(hint);

      /* Real-time validation */
      phoneInput.addEventListener('input', function() {
        var val = phoneInput.value.trim();
        phoneInput.classList.remove('is-error');
        hint.classList.remove('is-visible');

        if (_validPhone(val)) {
          phoneInput.classList.add('is-valid');
          validIcon.classList.add('is-visible');
          submitBtn.disabled = false;
        } else {
          phoneInput.classList.remove('is-valid');
          validIcon.classList.remove('is-visible');
          submitBtn.disabled = true;
        }
      });

      /* Belt-and-suspenders: re-check keyboard inset on focus/blur.
         Some browsers (Samsung Internet) delay the visualViewport event;
         responding to focus immediately gives instant sheet lift. */
      phoneInput.addEventListener('focus', function() {
        /* Small delay — let the system keyboard begin to appear */
        setTimeout(_applyKeyboardInset, 100);
        setTimeout(_applyKeyboardInset, 300);
      });
      phoneInput.addEventListener('blur', function() {
        setTimeout(_applyKeyboardInset, 100);
        setTimeout(_applyKeyboardInset, 300);
      });

      var submitLabel = isEmergency ? '⚡ Transmettre mon urgence' : 'Envoyer ma demande';
      var submitBtn = _primaryBtn(submitLabel, isEmergency, function(btn) {
        var val = phoneInput.value.trim();
        if (!_validPhone(val)) {
          phoneInput.classList.add('is-error');
          hint.textContent = 'Un num\u00e9ro marocain, s\u2019il vous pla\u00eet\u00a0(06 ou 07 + 8 chiffres).';
          hint.classList.add('is-visible');
          phoneInput.focus({ preventScroll: true });
          return;
        }
        st.phone = val;
        try { localStorage.setItem(PHONE_MEMORY_KEY, val); } catch(_) {}
        _submitRequest(btn);
      });
      submitBtn.disabled = true;

      foot.appendChild(submitBtn);

      /* Auto-focus — keyboard opens during transition (spec requirement) */
      setTimeout(function() {
        phoneInput.focus({ preventScroll: true });
      }, 40);
    }

    /* Back */
    foot.appendChild(_backBtn(function() { _transitionBck(_renderStep2); }));

    if (body) body.appendChild(_screen(elements));
  }

  /* ══════════════════════════════════════════════════════════
     SUBMIT
  ══════════════════════════════════════════════════════════ */

  /* ──────────────────────────────────────────────────────────
   * 7C.10D.1: Durable Emergency Persist — POST /api/urgent-request
   * Called only in emergency mode. Returns Promise<{ok, id, ref}>.
   * Non-blocking to standard mode (never called there).
   * ────────────────────────────────────────────────────────── */
  function _persistEmergencyRequest(st, saved) {
    var payload = {
      service:      st.serviceSlug  || '',
      problem:      st.serviceLabel || '',
      description:  st.description  || '',
      city:         st.city         || '',
      phone:        st.phone        || '',
      tracking_ref: (saved && saved.tracking_ref) || st.ref || '',
      urgency:      'now',
      mode:         'emergency',
      source:       'fxrf4-v5c',
    };
    return fetch('/api/urgent-request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).then(function(res) {
      return res.json().then(function(data) {
        
  /* Attach server id to local record if returned */
  if (data && data.ok && data.id && saved) {
    saved._server_id = data.id;
  }

  /* Anonymous access credential:
   * keep the raw guest token outside the normal request record.
   */
  if (data && data.ok && data.guest_token) {
    var store = window.FixeoClientRequestsStore;

    if (store && typeof store.saveGuestAccess === 'function') {
      store.saveGuestAccess(
        data.ref || (saved && saved.tracking_ref) || st.ref || '',
        data.id || '',
        data.guest_token
      );
    }
  }

  return data;
});
    }).catch(function(err) {
      return { ok: false, error: err.message || 'network_error', code: 'NETWORK' };
    });
  }

  /* ──────────────────────────────────────────────────────────
   * _renderRetry — shown when emergency persist fails
   * Preserves all entered data. User can retry or dismiss.
   * ────────────────────────────────────────────────────────── */
  function _renderRetry(btn, retryFn) {
    _setProgress(3, 3);
    _rafiSpeak("Impossible de transmettre votre urgence pour le moment.", false, true);

    _setFoot();
    var body = _q('#fxrf4-body');
    if (!body) return;

    var wrap = _h('div', { cls: 'fxrf4-retry-wrap', 'aria-live': 'polite' });
    wrap.appendChild(_h('p', {
      cls: 'fxrf4-retry-msg',
      txt: "Votre situation, ville et num\u00e9ro sont conserv\u00e9s."
    }));

    var retryBtn = _primaryBtn('R\u00e9essayer', true, function(rb) {
      _btnLoading(rb);
      retryFn(rb);
    });
    wrap.appendChild(retryBtn);

    body.innerHTML = '';
    body.appendChild(_screen([wrap]));
  }

  function _submitRequest(btn) {
    var st = _st;

    /* Double-submit guard (spec: 1600ms) */
    if (st.submitLocked) return;
    var now = Date.now();
    if (now - st.submitTs < 1600) return;
    st.submitLocked = true;
    st.submitTs = now;

    _btnLoading(btn);

    /* Save to localStorage first (offline memory / idempotency / dedup) */
    var result = _saveRequest(st);
    var saved = result && result.request;

    if (!saved) {
      st.submitLocked = false;
      /* F3: mode-aware label restore — emergency has different CTA text */
      var _failIsEmergency = st && st.mode === 'emergency';
      if (btn.parentNode) _btnRestore(btn,
        _failIsEmergency ? '⚡ Transmettre mon urgence' : 'Envoyer ma demande',
        _failIsEmergency
      );
      else _renderStep3();
      return;
    }

    var isEmergency = st.mode === 'emergency';

    if (!isEmergency) {
      /* ── STANDARD mode: original behavior unchanged ── */
      setTimeout(function() { _renderInterstitial(); }, 60);
      _fireAnalytics(saved, st.mode, result.duplicated);
      setTimeout(function() {
        st.submitLocked = false;
        _renderSuccess(saved);
      }, 820);
      return;
    }

    /* ── EMERGENCY mode: durable persist contract ─────────────
     * 7C.10D.1: Show interstitial while real API call is in flight.
     * Success rendered ONLY after /api/urgent-request returns ok:true.
     * Failure renders retry state — no false success shown.
     * ────────────────────────────────────────────────────────── */
    setTimeout(function() { _renderInterstitial(); }, 60);

    /* Attempt durable persist */
    _persistEmergencyRequest(st, saved).then(function(data) {
      if (data && data.ok) {
        /* Durable success — fire analytics, render success */
        _fireAnalytics(saved, st.mode, result.duplicated);
        st.submitLocked = false;
        _renderSuccess(saved);
      } else {
        /* Persist failed — show retry, do NOT fire success analytics */
        st.submitLocked = false;
        _renderRetry(btn, function(rb) {
          /* Retry: unlock, re-attempt persist with same data */
          st.submitLocked = true;
          st.submitTs = Date.now();
          _persistEmergencyRequest(st, saved).then(function(d2) {
            if (d2 && d2.ok) {
              _fireAnalytics(saved, st.mode, result.duplicated);
              st.submitLocked = false;
              _renderSuccess(saved);
            } else {
              st.submitLocked = false;
              _renderRetry(rb, function() {});
            }
          });
        });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     INTERSTITIAL — RAFI is working
  ══════════════════════════════════════════════════════════ */

  function _renderInterstitial() {
    var st = _st;
    var isEmergency = st.mode === 'emergency';

    _setProgress(3, 3);
    _rafiSpeak(
      isEmergency ? MSG.interstitialEmergency : MSG.interstitial,
      false, true /* instant */
    );

    _setFoot();
    var body = _q('#fxrf4-body');
    if (!body) return;

    var inter = _h('div', { id: 'fxrf4-interstitial', 'aria-live': 'polite', 'aria-atomic': 'true' });
    /* 7C.10D.2: Emergency interstitial gets urgent-pulse class for CSS animation.
     * Animation respects prefers-reduced-motion (CSS media query handles it). */
    if (isEmergency) inter.classList.add('is-emergency-sending');

    /* Emergency: add sending label above dots */
    if (isEmergency) {
      inter.appendChild(_h('p', { cls: 'fxrf4-inter-sending-label', txt: 'Envoi s\u00e9curis\u00e9 \u00e0 FIXEO' }));
    }

    var dots = _h('div', { cls: 'fxrf4-inter-dots', 'aria-hidden': 'true' });
    [1,2,3].forEach(function() { dots.appendChild(_h('span')); });
    inter.appendChild(dots);

    /* 7C.10D.1: In emergency mode, interstitial persists until real API ack.
     * "Ça prend un instant" is deferred 2.5s (network can be slow on mobile). */
    var line2 = _h('p', { cls: 'fxrf4-inter-line2', txt: MSG.interstitialLate });
    inter.appendChild(line2);

    setTimeout(function() {
      if (line2.parentNode) line2.classList.add('is-visible');
    }, 2500);

    body.innerHTML = '';
    body.appendChild(_screen([inter]));
  }

  /* ══════════════════════════════════════════════════════════
     SUCCESS — The arrival. The delight. The emotional peak.
  ══════════════════════════════════════════════════════════ */

  function _renderSuccess(saved) {
    var st = _st;
    var isEmergency = st.mode === 'emergency';
    var isMarketplace = st.mode === 'marketplace';

    /* RAFI success message — emergency is decisive and instant */
    var successMsg = isEmergency ? MSG.successEmergency : MSG.successMarket;
    _rafiSpeak(successMsg, false, true);

    _setProgress(3, 3);
    /* 7C.10D.3: Complete all 3 lane steps on success — n=4 sets all (idx 0,1,2) to is-done */
    if (isEmergency) _updateLaneStep(4);
    var fill = _q('#fxrf4-progress-fill');
    if (fill) {
      fill.style.background = isEmergency
        ? 'rgba(234, 137, 54, 0.90)'   /* warm amber for emergency */
        : 'rgba(32, 201, 151, 0.80)';   /* teal for standard */
    }

    var foot = _setFoot();
    var body = _q('#fxrf4-body');
    if (!body) return;

    var succ = _h('div', { id: 'fxrf4-success', 'aria-live': 'polite' });

    /* Check ring */
    var ringWrap = _h('div', { cls: 'fxrf4-check-ring' });
    var ringInner = _h('div', {
      cls: 'fxrf4-check-ring-inner' + (isEmergency ? ' is-emergency' : ''),
      txt: '\u2713', 'aria-hidden': 'true'
    });
    var ringRipple = _h('div', {
      cls: 'fxrf4-check-ring-ripple' + (isEmergency ? ' is-emergency' : ''),
      'aria-hidden': 'true'
    });
    ringWrap.appendChild(ringInner);
    ringWrap.appendChild(ringRipple);
    succ.appendChild(ringWrap);

    /* RAFI attribution */
    succ.appendChild(_h('p', { cls: 'fxrf4-success-tag', txt: 'RAFI', 'aria-hidden': 'true' }));

    /* Title — mode-specific
     * 7C.10D.1: Emergency title now reflects REAL persistence (server-confirmed).
     * False claims ("Votre urgence est déjà prise en charge") replaced with
     * factual confirmed-persist copy. */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-title',
      txt: isEmergency
  ? "Demande transmise avec succès."
        : "Votre demande est d\u00e9j\u00e0 entre de bonnes mains."
    }));

    /* Body — mode-specific
     * 7C.10D.1: Emergency body no longer claims RAFI is contacting artisans.
     * Factual: request transmitted, team will use the phone number provided. */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-body',
      txt: isEmergency
  ? "FIXEO recherche maintenant un artisan disponible pour votre intervention."
        : "RAFI s\u00e9lectionne d\u00e9j\u00e0 les artisans disponibles pour vous.\nVous recevrez une confirmation d\u00e8s les premi\u00e8res r\u00e9ponses."
    }));

    /* Tracking ref */
    /* 7C.10D.2: In emergency mode show factual recap block (city + phone masked + ref).
     * In standard mode: just the tracking ref as before. */
    if (isEmergency && saved) {
      var recapBlock = _h('div', { cls: 'fxrf4-success-recap' });
      if (saved.city) {
        var recapCity = _h('p', { cls: 'fxrf4-recap-line' });
        recapCity.innerHTML = '<span class="fxrf4-recap-icon">📍</span> ' + saved.city;
        recapBlock.appendChild(recapCity);
      }
      if (saved.phone) {
        var maskedPhone = _maskPhone(saved.phone);
        var recapPhone = _h('p', { cls: 'fxrf4-recap-line' });
        recapPhone.innerHTML = '<span class="fxrf4-recap-icon">📞</span> ' + maskedPhone;
        recapBlock.appendChild(recapPhone);
      }
      if (saved.tracking_ref) {
        var recapRef = _h('p', { cls: 'fxrf4-recap-line fxrf4-recap-ref' });
        recapRef.innerHTML = 'R\u00e9f.\u00a0urgence\u00a0: <strong>' + saved.tracking_ref + '</strong>';
        recapBlock.appendChild(recapRef);
      }
      if (recapBlock.childElementCount > 0) succ.appendChild(recapBlock);
    } else if (saved && saved.tracking_ref) {
      var ref = _h('p', { cls: 'fxrf4-success-ref' });
      ref.innerHTML = 'R\u00e9f.\u00a0: <strong>' + saved.tracking_ref + '</strong>';
      succ.appendChild(ref);
    }

    /* Three-step visual — mode-specific labels */
    var stepsEl = _h('div', { cls: 'fxrf4-success-steps', 'aria-label': '\u00c9tapes suivantes' });
    /* 7C.10D.1: Emergency status rail — factual copy.
     * Step 1 (done): request recorded locally + durably on server — TRUE.
     * Step 2 (done): transmitted to FIXEO — TRUE (server confirmed before this screen).
     * Step 3 (waiting): coordination pending — honest future state.
     * Removed: "Artisans disponibles contactés" (not proven true). */
    var stepData = isEmergency
      ? [
          { dot: '\u2713', lbl: 'Demande\nre\u00e7ue', state: 'done' },
        { dot: '\u2713', lbl: 'Transmise\n\u00e0 FIXEO', state: 'done' },
         { dot: '\ud83d\udd0e', lbl: 'Recherche\nartisan', state: 'waiting' }
        ]
      : [
          { dot: '\u2705', lbl: 'Demande\nenregistr\u00e9e', state: 'done' },
          { dot: '\ud83d\udd0d', lbl: 'RAFI\ns\u00e9lectionne', state: 'active' },
          { dot: '\ud83d\udcac', lbl: 'Confirmation\nWhatsApp', state: 'waiting' }
        ];

    stepData.forEach(function(s, i) {
      if (i > 0) stepsEl.appendChild(_h('div', { cls: 'fxrf4-success-step-sep', 'aria-hidden': 'true' }));
      var step = _h('div', { cls: 'fxrf4-success-step' });
      var dotCls = 'fxrf4-success-step-dot'
        + (s.state === 'active' ? ' is-active' : '')
        + (s.state === 'active' && isEmergency ? ' is-emergency' : '');
      var dotEl = _h('div', { cls: dotCls, txt: s.dot, 'aria-hidden': 'true' });
      if (s.state === 'waiting') dotEl.style.opacity = '0.40';
      var lbl = _h('span', { cls: 'fxrf4-success-step-lbl' });
      lbl.style.whiteSpace = 'pre-line';
      lbl.textContent = s.lbl;
      step.appendChild(dotEl);
      step.appendChild(lbl);
      stepsEl.appendChild(step);
    });
    succ.appendChild(stepsEl);

    body.innerHTML = '';
    body.appendChild(_screen([succ]));

    /* Actions in footer */
    var actions = _h('div', { cls: 'fxrf4-success-actions' });

    var requestsHref = '/dashboard-client.html#requests';

if (isEmergency && saved && saved.tracking_ref) {
  try {
    var guestRegistry = JSON.parse(
      localStorage.getItem('fixeo_guest_access_v1') || '{}'
    );

    var guestAccess = guestRegistry &&
      guestRegistry[saved.tracking_ref];

    if (
      guestAccess &&
      /^[a-f0-9]{64}$/i.test(
        String(guestAccess.guest_token || '')
      )
    ) {
      requestsHref = '/suivi-demande.html';
    }
  } catch (_) {}
}

var dashLink = _h('a', {
  cls: 'fxrf4-btn-success-primary',
  href: requestsHref,
  txt: 'Voir mes demandes'
});
    dashLink.setAttribute('role', 'button');

    var homeLink = _h('a', {
      cls: 'fxrf4-btn-success-secondary',
      href: '/index.html',
      txt: 'Retour à l\u2019accueil'
    });
    homeLink.setAttribute('role', 'button');

    actions.appendChild(dashLink);
    actions.appendChild(homeLink);
    foot.appendChild(actions);

    /* ── 7C.10D.2: Optional post-ACK Estimator bridge ──────────────
     * Shown ONLY after server-confirmed urgent persistence (data.ok=true).
     * Hidden for 'autre' slug (not a valid Estimator métier).
     * Closing Estimator: fxrf4 closes first (z-index 19000 > Estimator 1000),
     * so we close fxrf4 before opening Estimator to ensure Estimator is visible.
     * The urgent request is already server-saved — no double-submit risk.
     * ─────────────────────────────────────────────────────────────── */
    var isEstimatorEligible = isEmergency &&
      ESTIMATOR_ELIGIBLE_SLUGS.indexOf(st.serviceSlug) >= 0 &&
      typeof window.FixeoEstimatorV2 === 'object' &&
      typeof window.FixeoEstimatorV2.open === 'function';

    if (isEstimatorEligible) {
      var bridgeWrap = _h('div', { cls: 'fxrf4-estimator-bridge', 'aria-label': 'Option prix FIXEO', role: 'region' });

      var bridgeEyebrow = _h('p', {
  cls: 'fxrf4-bridge-eyebrow',
  txt: 'OPTION'
});

var bridgeTitle = _h('p', {
  cls: 'fxrf4-bridge-title',
  txt: 'Estimer le prix de l\u2019intervention'
});

var bridgeCopy = _h('p', {
  cls: 'fxrf4-bridge-copy',
  txt: 'RAFI peut v\u00e9rifier si une estimation FIXEO est disponible.'
});

      var bridgeCTA = _h('button', {
        cls: 'fxrf4-bridge-cta',
        type: 'button',
        txt: 'V\u00e9rifier le prix \u2192'
      });
      var bridgeSkip = _h('button', {
        cls: 'fxrf4-bridge-skip',
        type: 'button',
        txt: 'Pas maintenant'
      });

      bridgeCTA.addEventListener('click', function() {
        /* ── 7C.10D.2.1: PARENT SUSPEND / CHILD ESTIMATOR ─────────────────────
         * Urgent SUCCESS is the parent journey. Estimator is an optional child.
         * We do NOT call close() here — that would destroy the parent context.
         * Instead: suspend fxrf4 (hidden but DOM-mounted), open Estimator,
         * then restore the exact same SUCCESS screen when Estimator truly closes.
         *
         * Lifecycle signals from Estimator (frozen — must not be modified):
         *   fixeo:estimator-closed  — fires on every true _destroyContainer() call.
         *   fixeo:estimator-reserve — fires when user taps "Trouver un artisan".
         *   fx-estimator-tunnel-active body class — added on open, removed on destroy.
         *
         * Escalation guard: if user taps "Trouver un artisan" (reservation path),
         * we disarm the return-to-urgent-success behavior and clean up fxrf4 silently.
         * Reservation continues exactly as today. Urgent SUCCESS is NOT resurrected.
         *
         * NO second POST. NO _persistEmergencyRequest. NO new service_request.
         * NO re-render of SUCCESS screen. NO _st reconstruction.
         * ────────────────────────────────────────────────────────────────────── */

        var trustedCity = null;
        try { trustedCity = sessionStorage.getItem(TRUSTED_CITY_SESSION_KEY) || null; } catch (_) {}

        var entryCtx = {
          source:      'urgent',
          metier_hint: st.serviceSlug,
          city_slug:   trustedCity,
          urgency:     'urgent',
        };

        /* ── A. SUSPEND: hide fxrf4, don't close/destroy ── */
        _root.classList.add('fxrf4-estimator-child');
        /* Release scroll lock so Estimator can scroll normally.
         * We hold _isOpen = true and _st intact — state is fully preserved. */
        _unlock();

        /* Escalation flag — set when fixeo:estimator-reserve is received */
        var _escalated = false;

        /* ── B. ARM lifecycle listeners (one-shot each) ── */
        function _onEstimatorReserve() {
          /* User has entered the Reservation tunnel.
           * Disarm the return-to-urgent-success behavior.
           * Silently tear down the suspended fxrf4 parent AFTER Estimator fully closes
           * (handled in _onEstimatorClosed below). */
          _escalated = true;
          document.removeEventListener('fixeo:estimator-reserve', _onEstimatorReserve);
        }

        function _onEstimatorClosed() {
          document.removeEventListener('fixeo:estimator-closed',  _onEstimatorClosed);
          document.removeEventListener('fixeo:estimator-reserve', _onEstimatorReserve);

          if (_escalated) {
            /* ── ESCALATED: user went into Reservation ──
             * Reservation is running. Silently dispose the suspended urgent parent.
             * DO NOT show the urgent SUCCESS screen again.
             * DO NOT emit any sounds/transitions.
             * The close() call here correctly tears down fxrf4 state
             * without triggering any UI transition (root is already hidden). */
            _root.classList.remove('fxrf4-estimator-child');
            close();
          } else {
            /* ── NOT ESCALATED: user pressed × on Estimator ──
             * Restore the exact same urgent SUCCESS screen.
             * No re-render, no new POST, no state reconstruction. */
            _lock();
            _root.classList.remove('fxrf4-estimator-child');
            /* Estimator is now fully destroyed. fxrf4 SUCCESS is visible again. */
          }
        }

        document.addEventListener('fixeo:estimator-reserve', _onEstimatorReserve);
        document.addEventListener('fixeo:estimator-closed',  _onEstimatorClosed);

        /* ── C. OPEN ESTIMATOR ── */
        window.FixeoEstimatorV2.open(entryCtx).then(function(result) {
          if (!result || !result.accepted) {
            /* Estimator declined to open (e.g. already open, init_error).
             * Restore urgent parent immediately. */
            document.removeEventListener('fixeo:estimator-closed',  _onEstimatorClosed);
            document.removeEventListener('fixeo:estimator-reserve', _onEstimatorReserve);
            _lock();
            _root.classList.remove('fxrf4-estimator-child');
            /* Show factual inline error inside bridge (minimal, non-blocking) */
            var errEl = bridgeWrap.querySelector('.fxrf4-bridge-open-error');
            if (!errEl) {
              errEl = _h('p', { cls: 'fxrf4-bridge-open-error',
                txt: 'L\u2019estimation n\u2019a pas pu \u00eatre ouverte. Votre demande urgente reste enregistr\u00e9e.' });
              bridgeWrap.appendChild(errEl);
            }
          }
          /* result.accepted === true: Estimator is open, listeners will handle return. */
        }).catch(function() {
          /* Network/throw — restore urgent parent */
          document.removeEventListener('fixeo:estimator-closed',  _onEstimatorClosed);
          document.removeEventListener('fixeo:estimator-reserve', _onEstimatorReserve);
          _lock();
          _root.classList.remove('fxrf4-estimator-child');
          var errEl = bridgeWrap.querySelector('.fxrf4-bridge-open-error');
          if (!errEl) {
            errEl = _h('p', { cls: 'fxrf4-bridge-open-error',
              txt: 'L\u2019estimation n\u2019a pas pu \u00eatre ouverte. Votre demande urgente reste enregistr\u00e9e.' });
            bridgeWrap.appendChild(errEl);
          }
        });
      });

      bridgeSkip.addEventListener('click', function() {
        if (bridgeWrap.parentNode) bridgeWrap.parentNode.removeChild(bridgeWrap);
      });

      bridgeWrap.appendChild(bridgeEyebrow);
      bridgeWrap.appendChild(bridgeTitle);
      bridgeWrap.appendChild(bridgeCopy);
      bridgeWrap.appendChild(bridgeCTA);
      bridgeWrap.appendChild(bridgeSkip);

      /* Append below the success card, above the footer */
      var succEl = _q('#fxrf4-success');
      if (succEl && succEl.parentNode) {
        succEl.parentNode.appendChild(bridgeWrap);
      }
    }

    var head = _q('#fxrf4-head');
    if (head) {
      console.log('[fxrf4-v5c] Success rendered. mode=' + (st.mode) +
                  ' Header children:', head.childElementCount);
    }
  }

  /* ══════════════════════════════════════════════════════════
     SWIPE TO DISMISS (mobile)
  ══════════════════════════════════════════════════════════ */

  function _wireSwipeDismiss(dialog) {
    var startY = 0;
    var swipeActive = false;

    dialog.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
      swipeActive = true;
    }, { passive: true });

    dialog.addEventListener('touchmove', function(e) {
      if (!swipeActive) return;
      var body = dialog.querySelector('#fxrf4-body');
      if (body && body.scrollTop > 0) { swipeActive = false; return; }
    }, { passive: true });

    dialog.addEventListener('touchend', function(e) {
      if (!swipeActive) return;
      var dy = e.changedTouches[0].clientY - startY;
      if (dy > 80) close();
      swipeActive = false;
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════
     KEYBOARD-AWARE SHEET POSITIONING
     Uses visualViewport (Safari, Chrome, Samsung) to detect
     when the software keyboard opens and lifts the sheet.
     CSS --fxrf4-kb-inset drives the `bottom` offset.
     CSS --fxrf4-vvh drives the max-height recalc.
  ══════════════════════════════════════════════════════════ */

  var _kbRaf = null;
  var _kbHandler = null;

  function _onViewportChange() {
    /* Cancel any pending RAF to coalesce rapid resize events */
    if (_kbRaf) cancelAnimationFrame(_kbRaf);
    _kbRaf = requestAnimationFrame(function() {
      _kbRaf = null;
      _applyKeyboardInset();
    });
  }

  function _applyKeyboardInset() {
    var dialog = _root ? _root.querySelector('#fxrf4-dialog') : null;
    if (!dialog || !_isOpen) return;

    var isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) return;

    var vv = window.visualViewport;
    if (!vv) return;

    var windowH = window.innerHeight;
    var vvH     = vv.height;
    var vvTop   = vv.offsetTop || 0;  /* scroll offset on non-Safari */

    /*
     * kbInset = how many CSS px the keyboard rises above the bottom of the
     * layout viewport.  On iOS Safari, vv.height shrinks when keyboard opens;
     * on Android Chrome the same.
     *
     * We also account for visualViewport.offsetTop when the address bar
     * is scrolled up (Samsung Internet, Android Chrome).
     */
    var kbInset = Math.max(0, windowH - vvH - vvTop);

    /* Update CSS custom properties on the root element */
    _root.style.setProperty('--fxrf4-kb-inset', kbInset + 'px');
    _root.style.setProperty('--fxrf4-vvh',      vvH      + 'px');

    var kbActive = kbInset > 60; /* 60px threshold — small resize ≠ keyboard */
    dialog.classList.toggle('fxrf4-kb-active', kbActive);
  }

  function _wireKeyboard() {
    if (!window.visualViewport) return;
    if (_kbHandler) return;
    _kbHandler = _onViewportChange;
    window.visualViewport.addEventListener('resize', _kbHandler);
    window.visualViewport.addEventListener('scroll', _kbHandler);
    /* Also listen to window resize as a fallback */
    window.addEventListener('resize', _kbHandler);
    /* Prime the values immediately */
    _applyKeyboardInset();
  }

  function _teardownKeyboard() {
    if (_kbHandler) {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', _kbHandler);
        window.visualViewport.removeEventListener('scroll', _kbHandler);
      }
      window.removeEventListener('resize', _kbHandler);
      _kbHandler = null;
    }
    if (_kbRaf) { cancelAnimationFrame(_kbRaf); _kbRaf = null; }
    /* Remove kb state from dialog so next open starts clean */
    var dialog = _root ? _root.querySelector('#fxrf4-dialog') : null;
    if (dialog) dialog.classList.remove('fxrf4-kb-active');
  }

  /* ══════════════════════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════════════════════ */

  function open(opts) {
    if (_isOpen) return;
    _buildDOM();

    var rawMode = (opts && opts.mode) || 'default';
    /* 'express' is a legacy alias for 'emergency' — urgent CTAs use data-request-mode="express" */
    if (rawMode === 'express') rawMode = 'emergency';
    var mode = (['default','marketplace','emergency'].indexOf(rawMode) >= 0) ? rawMode : 'default';
    var source = (opts && opts.source) || 'unknown';

    _st = _fresh(mode, source);
    _readContext(_st);

    /* Hero Flagship explicit prefill.
       Additive only: legacy context remains the fallback authority. */
    if (opts && typeof opts.prefillService === 'string') {
      var flagshipService = opts.prefillService.trim();

      if (flagshipService.length > 2) {
        _st.prefillService = flagshipService;
      }
    }

    if (
      opts &&
      typeof opts.prefillCity === 'string' &&
      ALL_CITIES.indexOf(opts.prefillCity) >= 0
    ) {
      _st.prefillCity = opts.prefillCity;
    }
    
    // 7C.9K.2: reset estimator guard on each fxrf4 session open
    _fxrf4EstimatorLaunched = false;

    // 7C.10D.2: tag root element for emergency lane CSS
    if (mode === 'emergency') {
      _root.setAttribute('data-fxrf4-mode', 'emergency');
    } else {
      _root.removeAttribute('data-fxrf4-mode');
    }

    _isOpen = true;

    /* Reset transition lock and clear previous screen content.
       open() calls _renderStep1() directly (not through _transition) so
       body.innerHTML is not cleared automatically. Without this, re-opens
       append a second .fxrf4-screen on top of the previous one. */
    _transitioning = false;
    var _bodyEl = _root.querySelector('#fxrf4-body');
    var _footEl = _root.querySelector('#fxrf4-foot');
    if (_bodyEl) _bodyEl.innerHTML = '';
    if (_footEl) _footEl.innerHTML = '';

    _lock();
    _root.classList.add('fxrf4-active');
    _root.setAttribute('aria-hidden', 'false');

    /* Start keyboard-aware positioning (mobile only) */
    _wireKeyboard();

    /* Android: push history state for hardware back button */
    try { history.pushState({ fxrf4: true }, ''); } catch(_) {}

    _renderStep1();
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;

    try { if (history.state && history.state.fxrf4) history.back(); } catch(_) {}

    _root.classList.remove('fxrf4-active');
    _root.setAttribute('aria-hidden', 'true');

    /* Clear typing timer */
    if (_typeTimer) { clearInterval(_typeTimer); _typeTimer = null; }

    /* Reset transition lock — prevents tap-blocked re-open if closed mid-transition */
    _transitioning = false;

    /* Tear down keyboard listener */
    _teardownKeyboard();

    /* Reset emergency label on RAFI name (persists across opens) */
    var nameEl = _root ? _root.querySelector('.fxrf4-rafi-name') : null;
    if (nameEl) nameEl.classList.remove('is-emergency');

    var dialogEl = _root ? _root.querySelector('#fxrf4-dialog') : null;
if (dialogEl) dialogEl.classList.remove('is-emergency');

    _unlock();
    _st = null;
  }

  /* Android back button */
  window.addEventListener('popstate', function(e) {
    if (_isOpen) close();
  });

  /* Escape key */
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && _isOpen) close();
  });

  /* ══════════════════════════════════════════════════════════
     TRIGGER MIGRATION
     Routes every existing CTA through V5 open().
     Capture-phase listener intercepts before request-form.js.
  ══════════════════════════════════════════════════════════ */

  function _routeTrigger(trigger, forcedMode) {
    var mode = forcedMode
      || (trigger && trigger.getAttribute && trigger.getAttribute('data-request-mode'))
      || 'default';
    var source = 'unknown';
    if (trigger) {
      var c = trigger.classList;
      var closest = trigger.closest ? trigger.closest.bind(trigger) : function() { return null; };
      if (c && c.contains('final-cta-primary'))                source = 'final-cta';
      else if (closest('#home'))                                source = 'hero';
      else if (trigger.id === 'mobile-sticky-cta')             source = 'sticky';
      else if (closest('.mobile-nav') || closest('.fxgh-nav'))  source = 'mobile-nav';
      else                                                       source = 'cta';
    }
    open({ mode: mode, source: source });
  }

  /* Capture phase — fires before bubbling listeners in request-form.js */
  document.addEventListener('click', function(e) {
    var trigger = e.target.closest
      ? e.target.closest('[data-open-request-form="true"]')
      : null;
    if (!trigger) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    _routeTrigger(trigger, null);
  }, true /* capture */);

  /* window.openModal shim */
  var _origOpenModal = window.openModal;
  window.openModal = function(id) {
    if (id === 'request-modal') { _routeTrigger(null, null); return; }
    if (_origOpenModal) _origOpenModal.call(this, id);
  };

  /* window.closeModal shim */
  var _origCloseModal = window.closeModal;
  window.closeModal = function(id) {
    if (id === 'request-modal') { close(); return; }
    if (_origCloseModal) _origCloseModal.call(this, id);
  };

  /* forceOpenRequestModal (mobile nav inline script) */
  window.forceOpenRequestModal = function() { _routeTrigger(null, null); };

  /* Patch FixeoClientRequest if it exists (request-form.js optional) */
  var _patchAttempts = 0;
  function _patchFCR() {
    var fc = window.FixeoClientRequest;
    /* If already patched or not present after 3s — stop */
    if (!fc) {
      if (_patchAttempts++ < 50) setTimeout(_patchFCR, 60);
      return;
    }
    if (fc._fxrf4Patched) return;
    if (!fc.open) {
      if (_patchAttempts++ < 50) setTimeout(_patchFCR, 60);
      return;
    }
    fc._fxrf4Patched = true;

    fc.open = function(trigger, forcedMode) {
      if (_isOpen) return;
      _routeTrigger(trigger, forcedMode);
    };
    fc.openExpress = function(trigger) {
      if (_isOpen) return;
      _routeTrigger(trigger, 'express');
    };
    fc.closeStandard = close;
  }

  /* Boot */
  function _init() {
    _buildDOM(); /* pre-build for faster first open */
    setTimeout(_patchFCR, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  window.FixeoRequestFlowV4 = {
    VERSION: 'fxrf4-v5e-final-polish',
    open:    open,
    close:   close
  };

})();
