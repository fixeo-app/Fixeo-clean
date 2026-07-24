/**
 * fx-request-flow-v4.js — fxrf4-v5a
 * RAFI Request Flow V5 — Faithful implementation of the UX & Emotional Spec
 *
 * EMOTIONAL ARC: Problem → Relief → Confidence → Momentum → Trust
 * DESIGN PRINCIPLES: One question per screen. Auto-advance. RAFI speaks first.
 * MOBILE-FIRST: Bottom sheet. Touch-optimized. Keyboard-aware.
 *
 * ISOLATED: Zero dependency on .modal, MutationObservers, setTimeout injections.
 * ROLLBACK: window.FIXEO_FLOW_V4 = false
 *
 * VERSION: fxrf4-v5a — 2026-07-24
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

  /* RAFI messages — exact copy from spec */
  var MSG = {
    step1:         'Dites-moi ce qui se passe.',
    step1Urgent:   'Qu'est-ce qui se passe en ce moment\u00a0?',
    step2:         function(s) { return s + '. Vous êtes où\u00a0?'; },
    step2Urgent:   'Où êtes-vous maintenant\u00a0?',
    step2DetCity:  function(s, city) { return s + '. Vous êtes à\u00a0' + city + '\u00a0?'; },
    step3:         'Sur quel numéro vous rappelle-t-on\u00a0?',
    step3Urgent:   'Un artisan va vous rappeler. Votre numéro\u00a0?',
    step3Pre:      'C'est toujours ce numéro\u00a0?',
    interstitial:  'Je cherche les meilleurs professionnels pour vous.',
    interstitialLate: 'Ça prend un instant de plus…',
    successDefault: 'C'est noté. RAFI est sur le coup.',
    successUrgent:  'J'en ai déjà un pour vous.',
    successMarket:  'Votre demande est visible par les artisans.',
    step1Other:    'Décrivez-le en quelques mots.',
  };

  /* ══════════════════════════════════════════════════════════
     STATE — single plain object, fresh on every open
  ══════════════════════════════════════════════════════════ */

  var _st = null;
  var _isOpen = false;

  function _fresh(mode, source) {
    return {
      mode:         mode || 'default',
      source:       source || 'unknown',
      screen:       'step1',
      serviceSlug:  '',
      serviceLabel: '',
      city:         '',
      urgency:      mode === 'express' ? URGENCIES[0].value : URGENCIES[2].value,
      phone:        '',
      description:  '',
      ref:          '',
      submitLocked: false,
      submitTs:     0,
      // Prefills from context
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
    document.body.style.overflow  = 'hidden';
    document.body.style.position  = 'fixed';
    document.body.style.top       = '-' + _scrollY + 'px';
    document.body.style.width     = '100%';
    document.body.style.left      = '0';
    document.body.style.right     = '0';
  }

  function _unlock() {
    if (!_locked) return;
    _locked = false;
    document.body.style.overflow  = '';
    document.body.style.position  = '';
    document.body.style.top       = '';
    document.body.style.width     = '';
    document.body.style.left      = '';
    document.body.style.right     = '';
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
    if (d.startsWith('212')) d = '0' + d.slice(3);
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

  function _buildWAText(st) {
    var lines = st.mode === 'express'
      ? ['Bonjour, je lance une demande urgente via Fixeo :']
      : ['Bonjour, je viens de publier une demande sur Fixeo :'];
    if (st.serviceLabel) lines.push('Service\u00a0: ' + st.serviceLabel);
    if (st.city)         lines.push('Ville\u00a0: ' + st.city);
    if (st.urgency)      lines.push('Urgence\u00a0: ' + st.urgency);
    if (st.description)  lines.push('Détail\u00a0: ' + st.description);
    if (st.phone)        lines.push('Téléphone\u00a0: ' + st.phone);
    if (st.ref)          lines.push('Réf\u00a0: ' + st.ref);
    lines.push('', 'Pouvez-vous me recontacter\u00a0?');
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lines.join('\n'));
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
        source:       'fxrf4-v5a',
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
        detail: { request: req, mode: mode, source: 'fxrf4-v5a',
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
  function _qa(sel) { return _root ? Array.from(_root.querySelectorAll(sel)) : []; }

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
    /* Try to use the RAFI micro image if available */
    var rafiImgSrc = window.RAFI_MICRO || '/rafi/RAFI_V2_MicroGlyph.webp';
    var avImg = _h('img', { src: rafiImgSrc, alt: '', width: '36', height: '36',
                             loading: 'eager', decoding: 'async' });
    avImg.onerror = function() { this.style.display = 'none'; };
    avatar.appendChild(avImg);

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
    document.body.appendChild(_root);

    /* Swipe-to-dismiss on mobile */
    _wireSwipeDismiss(dialog);

    /* Diagnostic (spec requirement) */
    console.log('[fxrf4-v5a] DOM built. Header children:', head.childElementCount, '(expected 2: rafi-row, close)');
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

  function _chipTap(chip, allChips, onAdvance) {
    /* Spec: tap → scale 1.04 (80ms) → dim others (100ms) → advance (200ms) */
    chip.classList.add('is-tapping');
    setTimeout(function() {
      chip.classList.remove('is-tapping');
      chip.classList.add('is-selected');
      allChips.forEach(function(c) {
        if (c !== chip) c.classList.add('is-dimmed');
      });
    }, 80);

    /* Haptic feedback */
    try { if (navigator.vibrate) navigator.vibrate(8); } catch(_) {}

    /* Auto-advance after hold (spec: 200ms so user registers their choice) */
    setTimeout(onAdvance, 260);
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 1 — SERVICE SELECTION
     "Dites-moi ce qui se passe."
     One chip tap auto-advances. RAFI speaks first.
  ══════════════════════════════════════════════════════════ */

  function _renderStep1() {
    var st = _st;
    var isUrgent = st.mode === 'express';

    _setProgress(1, 3);
    _rafiSpeak(isUrgent ? MSG.step1Urgent : MSG.step1, isUrgent);

    var foot = _setFoot();

    /* Grid of service chips */
    var grid = _h('div', { cls: 'fxrf4-chips-grid' });
    var chips = [];

    SERVICES.forEach(function(svc) {
      var chip = _h('div', {
        cls: 'fxrf4-chip',
        role: 'button',
        tabindex: '0',
        'aria-label': svc.label
      });

      var icon  = _h('span', { cls: 'fxrf4-chip-icon', txt: svc.icon });
      var label = _h('span', { cls: 'fxrf4-chip-label', txt: svc.label });
      chip.appendChild(icon);
      chip.appendChild(label);

      /* Pre-selected if RAFI detected service from hero */
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
        _chipTap(chip, chips, function() { _transitionFwd(_renderStep2); });
      }

      chip.addEventListener('click',    _onTap);
      chip.addEventListener('touchend', function(e) { e.preventDefault(); _onTap(); }, { passive: false });
      chip.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onTap(); });

      chips.push(chip);
      grid.appendChild(chip);
    });

    /* "Autre chose" chip — full width */
    var otherChip = _h('div', {
      cls: 'fxrf4-chip is-other',
      role: 'button', tabindex: '0', 'aria-label': 'Autre chose'
    });
    otherChip.appendChild(_h('span', { cls: 'fxrf4-chip-label', txt: '+ Autre chose' }));
    chips.push(otherChip);
    grid.appendChild(otherChip);

    /* "Autre chose" → inline input */
    var otherWrap = _h('div', { cls: 'fxrf4-other-input-wrap' });
    var otherInput = _h('input', {
      cls: 'fxrf4-phone-input', /* reuse phone input style */
      type: 'text', placeholder: 'Ex\u00a0: fuite d\u2019eau, vitres cassées…',
      maxlength: '80', autocomplete: 'off', autocorrect: 'off'
    });
    otherInput.style.fontSize = '0.96rem';
    otherInput.style.paddingLeft = '16px';
    otherWrap.appendChild(otherInput);
    /* "Confirmer" chip appears inline when ≥3 chars */
    var confirmOtherBtn = _h('button', {
      cls: 'fxrf4-btn fxrf4-btn-primary',
      type: 'button', txt: 'Confirmer →'
    });
    confirmOtherBtn.style.marginTop = '10px';
    confirmOtherBtn.style.display = 'none';
    otherWrap.appendChild(confirmOtherBtn);

    otherInput.addEventListener('input', function() {
      var val = otherInput.value.trim();
      confirmOtherBtn.style.display = val.length >= 3 ? 'flex' : 'none';
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
      chips.forEach(function(c) {
        if (c !== otherChip) c.classList.add('is-dimmed');
      });
      otherChip.classList.add('is-selected');
      otherWrap.classList.add('is-visible');
      _rafiSpeak(MSG.step1Other, isUrgent);
      setTimeout(function() { otherInput.focus({ preventScroll: true }); }, 120);
    }

    otherChip.addEventListener('click', _openOther);
    otherChip.addEventListener('touchend', function(e) { e.preventDefault(); _openOther(); }, { passive: false });

    var body = _q('#fxrf4-body');
    if (body) body.appendChild(_screen([grid, otherWrap]));

    /* If hero pre-selected a service, auto-advance after brief pause */
    if (st.serviceSlug && !foot.innerHTML) {
      setTimeout(function() { _transitionFwd(_renderStep2); }, 600);
    }
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 2 — CITY + URGENCY
     "[Service]. Vous êtes où ?"
     City chip → urgency cards appear → tap → auto-advance to Step 3
  ══════════════════════════════════════════════════════════ */

  function _renderStep2() {
    var st = _st;
    var isUrgent = st.mode === 'express';
    var detected = st.detectedCity || st.prefillCity || '';

    _setProgress(2, 3);

    /* RAFI message — names the service (spec: "Plomberie. Vous êtes où ?") */
    var msg;
    if (isUrgent) {
      msg = MSG.step2Urgent;
    } else if (detected) {
      msg = MSG.step2DetCity(st.serviceLabel, detected);
    } else {
      msg = MSG.step2(st.serviceLabel);
    }
    _rafiSpeak(msg, isUrgent);

    var _setFoot2 = _setFoot;
    _setFoot2();

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

    /* ── Urgency section (appears after city selected) ── */
    var urgencySection = _h('div');
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
        /* Auto-advance spec: single tap IS the confirmation */
        setTimeout(function() { _transitionFwd(_renderStep3); }, 240);
      }

      card.addEventListener('click',    _onUrgTap);
      card.addEventListener('touchend', function(e) { e.preventDefault(); _onUrgTap(); }, { passive: false });
      card.addEventListener('keydown',  function(e) { if (e.key === 'Enter' || e.key === ' ') _onUrgTap(); });

      urgCards.appendChild(card);
    });

    urgencySection.appendChild(urgCards);

    function _showUrgencyCards() {
      if (urgencySection.style.display !== 'none') return; /* already visible */
      urgencySection.style.display = 'block';
      /* Scroll to urgency on mobile */
      setTimeout(function() {
        urgencySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }

    /* Auto-show if city already set (returning user) */
    if (selectedCity && !isUrgent) {
      setTimeout(_showUrgencyCards, 300);
    }

    /* If express mode and city already detected — auto-advance */
    if (isUrgent && detected) {
      st.city = detected;
      setTimeout(function() { _transitionFwd(_renderStep3); }, 600);
      return; /* Don't render this screen */
    }

    /* Back */
    var foot2 = _q('#fxrf4-foot');
    if (foot2) foot2.appendChild(_backBtn(function() { _transitionBck(_renderStep1); }));

    if (body) body.appendChild(_screen([cityRow, citySelectWrap, urgencySection]));
  }

  /* ══════════════════════════════════════════════════════════
     SCREEN 3 — PHONE NUMBER
     "Sur quel numéro vous rappelle-t-on ?"
     Large field. Auto-focused. Pre-fill if returning user.
  ══════════════════════════════════════════════════════════ */

  function _renderStep3() {
    var st = _st;
    var isUrgent = st.urgency === URGENCIES[0].value || st.mode === 'express';
    var hasPrefill = !!st.prefillPhone;

    _setProgress(3, 3);
    _rafiSpeak(
      hasPrefill ? MSG.step3Pre : (isUrgent ? MSG.step3Urgent : MSG.step3),
      isUrgent
    );

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
        isUrgent ? '\u26a1 Trouver un artisan maintenant' : 'Confirmer et envoyer \u2192',
        isUrgent,
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

      var submitLabel = isUrgent ? '\u26a1 Trouver un artisan maintenant' : 'Envoyer ma demande';
      var submitBtn = _primaryBtn(submitLabel, isUrgent, function(btn) {
        var val = phoneInput.value.trim();
        if (!_validPhone(val)) {
          phoneInput.classList.add('is-error');
          hint.textContent = 'Un numéro marocain, s\u2019il vous plaît\u00a0(06 ou 07 + 8 chiffres).';
          hint.classList.add('is-visible');
          phoneInput.focus({ preventScroll: true });
          return;
        }
        st.phone = val;
        /* Remember for next time */
        try { localStorage.setItem(PHONE_MEMORY_KEY, val); } catch(_) {}
        _submitRequest(btn);
      });
      submitBtn.disabled = true; /* enabled when valid number entered */

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

    /* Show interstitial after brief delay (feels intentional, not instant) */
    setTimeout(function() {
      _renderInterstitial();
    }, 80);

    /* Save (synchronous) */
    var result = _saveRequest(st);
    var saved = result && result.request;

    if (!saved) {
      st.submitLocked = false;
      _btnRestore(btn, 'Envoyer ma demande', false);
      _renderStep3(); /* back to phone, show error */
      return;
    }

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
    var isUrgent = st.mode === 'express';

    _setProgress(3, 3);
    _rafiSpeak(MSG.interstitial, isUrgent, true /* instant — no typing */);

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
    var isUrgent = st.mode === 'express';
    var isMarketplace = st.mode === 'marketplace';

    var successMsg = isUrgent ? MSG.successUrgent
                   : isMarketplace ? MSG.successMarket
                   : MSG.successDefault;
    _rafiSpeak(successMsg, false, true);

    _setProgress(3, 3);
    var fill = _q('#fxrf4-progress-fill');
    if (fill) fill.style.background = 'rgba(32, 201, 151, 0.75)';

    var foot = _setFoot();
    var body = _q('#fxrf4-body');
    if (!body) return;

    var succ = _h('div', { id: 'fxrf4-success', 'aria-live': 'polite' });

    /* Check ring — spec: bloom from a point, ripple once */
    var ringWrap = _h('div', { cls: 'fxrf4-check-ring' });
    var ringInner = _h('div', { cls: 'fxrf4-check-ring-inner', txt: '✓', 'aria-hidden': 'true' });
    var ringRipple = _h('div', { cls: 'fxrf4-check-ring-ripple', 'aria-hidden': 'true' });
    ringWrap.appendChild(ringInner);
    ringWrap.appendChild(ringRipple);
    succ.appendChild(ringWrap);

    /* RAFI attribution */
    succ.appendChild(_h('p', { cls: 'fxrf4-success-tag', txt: 'RAFI', 'aria-hidden': 'true' }));

    /* Title */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-title',
      txt: 'Votre demande a bien été envoyée.'
    }));

    /* Body */
    succ.appendChild(_h('p', {
      cls: 'fxrf4-success-body',
      txt: 'RAFI recherche maintenant les professionnels les plus adaptés à votre projet.'
    }));

    /* Tracking ref */
    if (saved && saved.tracking_ref) {
      var ref = _h('p', { cls: 'fxrf4-success-ref' });
      ref.innerHTML = 'Réf.\u00a0: <strong>' + saved.tracking_ref + '</strong>';
      succ.appendChild(ref);
    }

    /* Three-step visual — spec: done / active-pulse / waiting */
    var stepsEl = _h('div', { cls: 'fxrf4-success-steps', 'aria-label': 'Étapes suivantes' });
    var stepData = [
      { dot: '✅', lbl: 'Demande\nenregistrée', state: 'done' },
      { dot: '🔍', lbl: 'RAFI\nsélectionne',   state: 'active' },
      { dot: '💬', lbl: 'Confirmation\nWhatsApp', state: 'waiting' }
    ];

    stepData.forEach(function(s, i) {
      if (i > 0) stepsEl.appendChild(_h('div', { cls: 'fxrf4-success-step-sep', 'aria-hidden': 'true' }));
      var step = _h('div', { cls: 'fxrf4-success-step' });
      var dotEl = _h('div', {
        cls: 'fxrf4-success-step-dot' + (s.state === 'active' ? ' is-active' : ''),
        txt: s.dot,
        'aria-hidden': 'true'
      });
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
      href: '/client-dashboard.html',
      txt: 'Voir mes demandes'
    });
    dashLink.setAttribute('role', 'button');

    var homeLink = _h('a', {
      cls: 'fxrf4-btn-success-secondary',
      href: '/index.html',
      txt: 'Retour à l\u2019accueil'
    });
    homeLink.setAttribute('role', 'button');
    homeLink.addEventListener('click', function() { close(); });

    actions.appendChild(dashLink);
    actions.appendChild(homeLink);
    foot.appendChild(actions);

    /* Diagnostic — spec requirement */
    var head = _q('#fxrf4-head');
    if (head) {
      console.log('[fxrf4-v5a] Success rendered. Header children:', head.childElementCount,
                  '(expected 2 — rafi-row + close)');
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
     OPEN / CLOSE
  ══════════════════════════════════════════════════════════ */

  function open(opts) {
    if (_isOpen) return;
    _buildDOM();

    var mode   = (opts && opts.mode   && ['default','marketplace','express'].indexOf(opts.mode) >= 0)
                 ? opts.mode : 'default';
    var source = (opts && opts.source) || 'unknown';

    _st = _fresh(mode, source);
    _readContext(_st);

    _isOpen = true;

    _lock();
    _root.classList.add('fxrf4-active');
    _root.setAttribute('aria-hidden', 'false');

    /* Android: push history state for hardware back button */
    try { history.pushState({ fxrf4: true }, ''); } catch(_) {}

    _renderStep1();
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;

    /* Android: pop history state */
    try { if (history.state && history.state.fxrf4) history.back(); } catch(_) {}

    _root.classList.remove('fxrf4-active');
    _root.setAttribute('aria-hidden', 'true');

    /* Clear typing timer */
    if (_typeTimer) { clearInterval(_typeTimer); _typeTimer = null; }

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

  /* Patch FixeoClientRequest after request-form.js loads */
  function _patchFCR() {
    var fc = window.FixeoClientRequest;
    if (!fc || fc._fxrf4Patched) { setTimeout(_patchFCR, 60); return; }
    if (!fc.open)                 { setTimeout(_patchFCR, 60); return; }
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
    VERSION: 'fxrf4-v5a',
    open:    open,
    close:   close
  };

})();
