/**
 * fx-request-flow-v4.js — fxrf4-v5o
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
 * VERSION: fxrf4-v5o — 2026-07-25
 */

(function () {
  'use strict';

  /* ── Feature flag ──────────────────────────────────────────── */
  if (window.FIXEO_FLOW_V4 === false) return;
  if (window._fxrf4Loaded) return;
  window._fxrf4Loaded = true;

  /* ══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */

  var WHATSAPP = '212660484415';
  var STORAGE_KEY = 'fixeo_client_requests';
  var CITY_STORAGE_KEY = 'fixeo_detected_city';
  var PHONE_MEMORY_KEY = 'fxrf4_last_phone';

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
      words:['maçon','beton','béton','carrelage','chape','dallage','mur porteur'] },
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
    { icon: '💧', label: "J\u2019ai une fuite d\u2019eau",              slug: 'plomberie',     serviceLabel: 'Plomberie'    },
    { icon: '⚡', label: 'Plus de courant chez moi',                    slug: 'electricite',   serviceLabel: '\u00c9lectricit\u00e9' },
    { icon: '🔐', label: 'Je suis bloqu\u00e9 dehors',                  slug: 'serrurerie',    serviceLabel: 'Serrurerie'   },
    { icon: '🚿', label: 'Mon WC ou \u00e9vier est bouch\u00e9',         slug: 'plomberie',     serviceLabel: 'Plomberie'    },
    { icon: '❄️', label: 'Mon climatiseur ne fonctionne plus',           slug: 'climatisation', serviceLabel: 'Climatisation'},
    { icon: '🚪', label: 'Une porte ou fen\u00eatre est bloqu\u00e9e',   slug: 'menuiserie',    serviceLabel: 'Menuiserie'   },
    { icon: '⚠️', label: 'Autre urgence',                                slug: 'autre',         serviceLabel: 'Autre urgence'},
  ];

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
    step1Emergency:  'Que se passe-t-il\u00a0?',
    step2Emergency:  'Vous \u00eates o\u00f9\u00a0?',
    step2EmergencyCity: function(city) { return 'Vous \u00eates \u00e0\u00a0' + city + '\u00a0?'; },
    step3Emergency:  'Sur quel num\u00e9ro peut-on vous rappeler\u00a0?',
    step3EmergencyPre: "C\u2019est bien ce num\u00e9ro\u00a0?",
    interstitialEmergency: 'Je m\u2019en occupe.',
    successEmergency: 'Je m\u2019en occupe imm\u00e9diatement.',

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
        source:       'fxrf4-v5o',
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
        detail: { request: req, mode: mode, source: 'fxrf4-v5o',
                  storageKey: STORAGE_KEY, duplicated: duplicated }
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
    console.log('[fxrf4-v5o] DOM built. Header children:', head.childElementCount, '(expected 2: rafi-row, close)');
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

  /* ── Emergency step 1 — situation list ─────────────────── */
  function _renderEmergencyStep1() {
    var st = _st;

    _rafiSpeak(MSG.step1Emergency, false /* not urgent-red — calm */);

    /* Emergency mode label on RAFI name */
    var nameEl = _q('.fxrf4-rafi-name');
    if (nameEl) nameEl.classList.add('is-emergency');

    var list = _h('div', { cls: 'fxrf4-situation-list', role: 'list' });
    var chips = [];

    EMERGENCY_SITUATIONS.forEach(function(sit) {
      var chip = _h('div', {
        cls: 'fxrf4-situation-item',
        role: 'listitem button', tabindex: '0',
        'aria-label': sit.label
      });
      var icon  = _h('span', { cls: 'fxrf4-situation-icon', txt: sit.icon });
      var label = _h('span', { cls: 'fxrf4-situation-label', txt: sit.label });
      chip.appendChild(icon);
      chip.appendChild(label);
      chips.push(chip);
      list.appendChild(chip);

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
    });

    var body = _q('#fxrf4-body');
    if (body) body.appendChild(_screen([list]));
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
        _chipTap(chip, chips, function() { _transitionFwd(_renderStep2); }, ack);
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
        isEmergency ? 'Trouver un artisan maintenant' : 'Confirmer et envoyer \u2192',
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

      var submitLabel = isEmergency ? 'Trouver un artisan maintenant' : 'Envoyer ma demande';
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

  function _submitRequest(btn) {
    var st = _st;

    /* Double-submit guard (spec: 1600ms) */
    if (st.submitLocked) return;
    var now = Date.now();
    if (now - st.submitTs < 1600) return;
    st.submitLocked = true;
    st.submitTs = now;

    _btnLoading(btn);

    /* Save synchronously before interstitial */
    var result = _saveRequest(st);
    var saved = result && result.request;

    if (!saved) {
      st.submitLocked = false;
      /* btn may still be in DOM — restore if so, otherwise just re-render step 3 */
      if (btn.parentNode) _btnRestore(btn, 'Envoyer ma demande', false);
      else _renderStep3();
      return;
    }

    /* Show interstitial — save succeeded, transition is cosmetic */
    setTimeout(function() {
      _renderInterstitial();
    }, 60);

    _fireAnalytics(saved, st.mode, result.duplicated);

    /* Interstitial for at least 800ms for emotional effect */
    setTimeout(function() {
      st.submitLocked = false;
      _renderSuccess(saved);
    }, 820);
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

    var dots = _h('div', { cls: 'fxrf4-inter-dots', 'aria-hidden': 'true' });
    [1,2,3].forEach(function() { dots.appendChild(_h('span')); });
    inter.appendChild(dots);

    var line2 = _h('p', { cls: 'fxrf4-inter-line2', txt: MSG.interstitialLate });
    inter.appendChild(line2);

    /* Show "ça prend un instant" if it takes > 1.5s */
    setTimeout(function() {
      if (line2.parentNode) line2.classList.add('is-visible');
    }, 1500);

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

    /* Title — mode-specific */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-title',
      txt: isEmergency
        ? 'Votre urgence est prise en charge.'
        : 'Votre demande est entre de bonnes mains.'
    }));

    /* Body — mode-specific */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-body',
      txt: isEmergency
        ? 'RAFI s\u00e9lectionne maintenant les artisans disponibles pr\u00e8s de chez vous.'
        : 'Les artisans concern\u00e9s peuvent d\u00e9sormais consulter votre demande. Vous serez inform\u00e9 d\u00e8s que les premi\u00e8res r\u00e9ponses arrivent.'
    }));

    /* Tracking ref */
    if (saved && saved.tracking_ref) {
      var ref = _h('p', { cls: 'fxrf4-success-ref' });
      ref.innerHTML = 'R\u00e9f.\u00a0: <strong>' + saved.tracking_ref + '</strong>';
      succ.appendChild(ref);
    }

    /* Three-step visual — mode-specific labels */
    var stepsEl = _h('div', { cls: 'fxrf4-success-steps', 'aria-label': '\u00c9tapes suivantes' });
    var stepData = isEmergency
      ? [
          { dot: '\u2705', lbl: 'Demande urgente\nenregistr\u00e9e', state: 'done' },
          { dot: '\ud83d\udcf2', lbl: 'Artisans disponibles\ncontact\u00e9s',     state: 'active' },
          { dot: '\ud83d\udcac', lbl: 'Confirmation\npar t\u00e9l. ou WhatsApp', state: 'waiting' }
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

    var dashLink = _h('a', {
      cls: 'fxrf4-btn-success-primary',
      href: '/dashboard-client.html#requests',
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

    var head = _q('#fxrf4-head');
    if (head) {
      console.log('[fxrf4-v5o] Success rendered. mode=' + (st.mode) +
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
    VERSION: 'fxrf4-v5o',
    open:    open,
    close:   close
  };

})();
