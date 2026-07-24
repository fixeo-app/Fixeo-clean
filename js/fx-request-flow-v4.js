/**
 * fx-request-flow-v4.js — fxrf4-v1a
 * Fixeo Request Flow V4 — completely isolated request component
 *
 * OWNS:
 *   DOM injection (#fxrf4-root — never in HTML)
 *   Backdrop, dialog, header, close button, progress bar
 *   All 3 form screens + review + success
 *   One open(), one close(), one submit()
 *   Scroll lock (position:fixed body, iOS-safe)
 *   State store (plain object, never shared)
 *
 * REUSES (via public APIs, not DOM coupling):
 *   window.FixeoClientRequest.storageKey
 *   window.FixeoClientRequestsStore.appendRequest
 *   window.FixeoClientRequest.buildWhatsappLink
 *   _validatePayload, _saveRequest (inline copies, no legacy DOM needed)
 *   'fixeo:client-request-submit-success' CustomEvent (analytics/admin)
 *
 * DOES NOT TOUCH:
 *   #request-modal, .modal, .fxrmv3-*, .rfos-*, .fuv3-*, .fxrm2-*
 *   window.openModal, window.closeModal (left alone)
 *   MutationObservers in RAFI OS, fuv3, rmv2 (never triggered)
 *   request-form.js, fixeo-rafi-os-v1.js, any legacy engine
 *
 * FEATURE FLAG: window.FIXEO_FLOW_V4 = false → return early (rollback)
 *
 * VERSION: fxrf4-v1a — 2026-07-24
 */

(function () {
  'use strict';

  /* ── Feature flag ─────────────────────────────────────────── */
  if (window.FIXEO_FLOW_V4 === false) return;
  if (window._fxrf4Loaded) return;
  window._fxrf4Loaded = true;

  /* ═══════════════════════════════════════════════════════════
     CONSTANTS
  ═══════════════════════════════════════════════════════════ */
  var WHATSAPP_NUMBER = '212660484415';
  var STORAGE_KEY = 'fixeo_client_requests';

  var CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Safi','El Jadida',
    'Nador','Settat','Khouribga','Béni Mellal','Larache','Ksar el-Kébir',
    'Khémisset','Guelmim'
  ];

  var SERVICE_NORM = [
    { slug:'plomberie',     words:['fuite','plomberie','plombier','robinet','tuyau','chauffe-eau','canalisation','débouchage','debouchage','wc'] },
    { slug:'serrurerie',    words:['serrure','serrurier','serrurerie','porte bloqu','bloquée','bloquee','clé','clef','barillet'] },
    { slug:'electricite',   words:['panne elec','panne élec','electricit','électricité','electricien','électricien','disjoncteur','court-circuit','tableau','interrupteur'] },
    { slug:'climatisation', words:['clim','climatisation','climatiseur','pompe chaleur','ventilation'] },
    { slug:'peinture',      words:['peinture','peintre','façade','facade','ravalement','enduit'] },
    { slug:'menuiserie',    words:['menuiserie','menuisier','volet','parquet','fenetre','fenêtre','placard'] },
    { slug:'maconnerie',    words:['maçonnerie','maconnerie','maçon','béton','carrelage','chape'] },
    { slug:'nettoyage',     words:['nettoyage','ménage','menage','nettoyer','désinfection'] },
    { slug:'jardinage',     words:['jardin','jardinage','tondeuse','taille','haie'] },
    { slug:'demenagement',  words:['déménagement','demenagement','déménager','demenager'] },
  ];

  /* ═══════════════════════════════════════════════════════════
     STATE — single source of truth
  ═══════════════════════════════════════════════════════════ */
  var _state = null;  /* null when closed */

  function _freshState(mode, source) {
    return {
      mode: mode || 'default',
      source: source || 'unknown',
      screen: 'step1',          /* step1 | step2 | step3 | review | success */
      service: '',
      city: '',
      urgency: mode === 'express' ? 'Urgent (moins de 30 min)' : 'Normal',
      description: '',
      phone: '',
      trackingRef: '',
      submitLocked: false,
      submitTs: 0
    };
  }

  /* ═══════════════════════════════════════════════════════════
     SCROLL LOCK — position:fixed body (iOS-safe)
  ═══════════════════════════════════════════════════════════ */
  var _scrollY = 0;
  var _locked  = false;

  function _lock() {
    if (_locked) return;
    _locked  = true;
    _scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top      = '-' + _scrollY + 'px';
    document.body.style.width    = '100%';
    document.body.style.left     = '0';
    document.body.style.right    = '0';
  }

  function _unlock() {
    if (!_locked) return;
    _locked = false;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.width    = '';
    document.body.style.left     = '';
    document.body.style.right    = '';
    document.body.classList.remove('modal-open', 'fxmsf-locked');
    window.scrollTo(0, _scrollY);
  }

  /* ═══════════════════════════════════════════════════════════
     BUSINESS LOGIC (inline copies — no legacy DOM dependency)
  ═══════════════════════════════════════════════════════════ */

  function _normalizeService(raw) {
    var s = String(raw || '').toLowerCase();
    for (var i = 0; i < SERVICE_NORM.length; i++) {
      var entry = SERVICE_NORM[i];
      for (var j = 0; j < entry.words.length; j++) {
        if (s.indexOf(entry.words[j]) >= 0) return entry.slug;
      }
    }
    return raw;
  }

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

  function _validService(raw) {
    var s = String(raw || '').trim();
    if (s.length < 3) return false;
    if (/^(.)\1+$/i.test(s.replace(/\s/g, ''))) return false;
    if (/^\d+$/.test(s)) return false;
    if (['test','aaa','aaaa','bbbb','xxx','xxxx','essai','demo'].indexOf(s.toLowerCase()) >= 0) return false;
    return true;
  }

  function _genRef() {
    return 'FX-' + Date.now().toString(36).toUpperCase().slice(-5) +
           Math.random().toString(36).slice(2,5).toUpperCase();
  }

  function _buildWALink(st) {
    var lines = ['Bonjour, je viens de publier une demande sur Fixeo :'];
    if (st.mode === 'express') lines[0] = 'Bonjour, je viens de lancer une demande urgente sur Fixeo :';
    if (st.service)     lines.push('Service\u00a0: ' + st.service);
    if (st.city)        lines.push('Ville\u00a0: ' + st.city);
    if (st.urgency)     lines.push('Urgence\u00a0: ' + st.urgency);
    if (st.description) lines.push('D\u00e9tail\u00a0: ' + st.description);
    if (st.phone)       lines.push('T\u00e9l\u00e9phone\u00a0: ' + st.phone);
    lines.push('', 'Pouvez-vous me recontacter\u00a0?');
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  function _saveRequest(st) {
    try {
      var ref = _genRef();
      st.trackingRef = ref;

      var req = {
        id:           Date.now(),
        service:      _normalizeService(st.service),
        problem:      st.service,
        description:  st.description || '',
        city:         st.city,
        phone:        st.phone,
        urgency:      st.urgency,
        tracking_ref: ref,
        status:       'nouvelle',
        created_at:   new Date().toISOString(),
        source:       'fxrf4-v1a',
        viewed:       false
      };

      /* Try FixeoClientRequestsStore first */
      if (window.FixeoClientRequestsStore && window.FixeoClientRequestsStore.appendRequest) {
        var result = window.FixeoClientRequestsStore.appendRequest(req);
        return result || { request: req, duplicated: false };
      }

      /* Fallback: direct localStorage */
      var key = (window.FixeoClientRequest && window.FixeoClientRequest.storageKey) || STORAGE_KEY;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) {}
      if (!Array.isArray(list)) list = [];

      /* Deduplicate: same service+city+phone within 2.5s */
      var last = list.length ? list[list.length - 1] : null;
      if (last) {
        var sameContent = String(last.service||'').trim() === _normalizeService(st.service).trim() &&
                          String(last.city||'').trim()    === st.city.trim() &&
                          String(last.phone||'').trim()   === st.phone.trim();
        var recentMs = Math.abs(Date.now() - Date.parse(last.created_at || 0));
        if (sameContent && recentMs < 2500) return { request: last, duplicated: true };
      }

      list.push(req);
      localStorage.setItem(key, JSON.stringify(list));
      return { request: req, duplicated: false };
    } catch(e) {
      console.warn('[fxrf4] saveRequest failed', e);
      return { request: null, duplicated: false };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DOM CONSTRUCTION — build once, reuse
  ═══════════════════════════════════════════════════════════ */

  function _h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k) {
      if (k === 'cls') { el.className = attrs[k]; }
      else if (k === 'txt') { el.textContent = attrs[k]; }
      else if (k === 'html') { el.innerHTML = attrs[k]; }
      else el.setAttribute(k, attrs[k]);
    });
    if (children) children.forEach(function(c) { if (c) el.appendChild(c); });
    return el;
  }

  var _root = null;

  function _buildDOM() {
    if (_root) return;

    _root = _h('div', { id: 'fxrf4-root' });

    /* Backdrop */
    var bd = _h('div', { id: 'fxrf4-bd' });
    bd.addEventListener('click', function(e) { if (e.target === bd) close(); });

    /* Dialog */
    var dialog = _h('div', { id: 'fxrf4-dialog', role: 'dialog', 'aria-modal': 'true',
                              'aria-labelledby': 'fxrf4-title' });

    /* Header */
    var head = _h('div', { id: 'fxrf4-head' });
    var eyebrow = _h('span', { cls: 'fxrf4-eyebrow', txt: 'FIXEO' });
    var title   = _h('span', { cls: 'fxrf4-title', id: 'fxrf4-title', txt: 'Votre demande' });
    var closeBtn = _h('button', { id: 'fxrf4-close', type: 'button',
                                   'aria-label': 'Fermer', html: '&#x2715;' });
    closeBtn.addEventListener('click',    function(e) { e.preventDefault(); close(); });
    closeBtn.addEventListener('touchend', function(e) { e.preventDefault(); close(); }, { passive: false });
    head.appendChild(eyebrow);
    head.appendChild(title);
    head.appendChild(closeBtn);

    /* Progress bar */
    var progress = _h('div', { id: 'fxrf4-progress' });
    var progressFill = _h('div', { id: 'fxrf4-progress-fill' });
    progress.appendChild(progressFill);

    /* Body (swapped per screen) */
    var body = _h('div', { id: 'fxrf4-body' });

    /* Footer (swapped per screen) */
    var foot = _h('div', { id: 'fxrf4-foot' });

    dialog.appendChild(head);
    dialog.appendChild(progress);
    dialog.appendChild(body);
    dialog.appendChild(foot);
    _root.appendChild(bd);
    _root.appendChild(dialog);
    document.body.appendChild(_root);
  }

  /* ── helpers ── */
  function _q(s) { return _root ? _root.querySelector(s) : null; }
  function _setTitle(eyebrow, title, urgent) {
    var ey = _q('.fxrf4-eyebrow');
    var ti = _q('.fxrf4-title');
    if (ey) { ey.textContent = eyebrow; ey.classList.toggle('is-urgent', !!urgent); }
    if (ti)   ti.textContent  = title;
  }
  function _setProgress(step, total) {
    var fill = _q('#fxrf4-progress-fill');
    if (fill) fill.style.width = Math.round((step / total) * 100) + '%';
  }
  function _clearBody() {
    var b = _q('#fxrf4-body'); if (b) b.innerHTML = '';
  }
  function _clearFoot() {
    var f = _q('#fxrf4-foot'); if (f) f.innerHTML = '';
  }
  function _btn(label, cls, id, urgent) {
    var b = _h('button', { cls: 'fxrf4-btn ' + cls, type: 'button', txt: label });
    if (id) b.id = id;
    if (urgent) b.classList.add('is-urgent');
    return b;
  }
  function _field(labelTxt, inputEl, id) {
    var wrap = _h('div', { cls: 'fxrf4-field' });
    var lbl  = _h('label', { cls: 'fxrf4-label', txt: labelTxt, 'for': id });
    if (id) inputEl.id = id;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }
  function _showError(msg) {
    var e = _q('#fxrf4-error');
    if (e) { e.textContent = msg; e.classList.add('is-visible'); }
  }
  function _clearError() {
    var e = _q('#fxrf4-error'); if (e) e.classList.remove('is-visible');
  }

  /* ═══════════════════════════════════════════════════════════
     SCREENS
  ═══════════════════════════════════════════════════════════ */

  /* ── STEP 1: Service + City ──────────────────────────────── */
  function _renderStep1() {
    var st = _state;
    var isUrgent = st.mode === 'express';
    _setTitle(isUrgent ? 'URGENT' : 'FIXEO',
              isUrgent ? 'Quel est le probl\u00e8me\u00a0?' : 'Quel service vous faut-il\u00a0?',
              isUrgent);
    _setProgress(1, 3);
    _clearBody();
    _clearFoot();

    var body = _q('#fxrf4-body');
    var foot = _q('#fxrf4-foot');

    /* Error placeholder */
    var errEl = _h('div', { id: 'fxrf4-error' });
    body.appendChild(errEl);

    /* Service input */
    var svcInput = _h('input', {
      cls: 'fxrf4-input', type: 'text', name: 'service',
      placeholder: 'Ex\u00a0: plomberie, panne \u00e9lectrique, serrure\u2026',
      maxlength: '80', autocomplete: 'off'
    });
    svcInput.value = st.service;
    body.appendChild(_field('Service demand\u00e9', svcInput, 'fxrf4-svc'));

    /* City select */
    var citySelect = _h('select', { cls: 'fxrf4-select', name: 'city' });
    var defaultOpt = _h('option', { value: '', txt: 'Choisir une ville' });
    citySelect.appendChild(defaultOpt);
    CITIES.forEach(function(c) {
      var opt = _h('option', { value: c, txt: c });
      if (c === st.city) opt.selected = true;
      citySelect.appendChild(opt);
    });
    var selectWrap = _h('div', { cls: 'fxrf4-select-wrap' });
    selectWrap.appendChild(citySelect);
    body.appendChild(_field('Ville', selectWrap, 'fxrf4-city'));
    citySelect.id = 'fxrf4-city';

    /* Pre-fill city from detected city */
    if (!st.city) {
      var detected = localStorage.getItem('fixeo_detected_city');
      if (detected && CITIES.indexOf(detected) >= 0) {
        citySelect.value = detected;
      }
    }

    /* Next button */
    var nextBtn = _btn('Continuer \u2192', 'fxrf4-btn-primary', 'fxrf4-next1', isUrgent);
    nextBtn.addEventListener('click', function() {
      _clearError();
      var svc  = svcInput.value.trim();
      var city = citySelect.value;
      if (!svc || !_validService(svc)) {
        svcInput.classList.add('is-error');
        _showError('D\u00e9crivez votre besoin en quelques mots\u00a0(ex\u00a0: fuite d\u2019eau).');
        svcInput.focus();
        return;
      }
      if (!city) {
        citySelect.classList.add('is-error');
        _showError('Veuillez choisir une ville.');
        citySelect.focus();
        return;
      }
      st.service = svc;
      st.city    = city;
      _renderStep2();
    });

    /* Keyboard: enter on city → next */
    citySelect.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') nextBtn.click();
    });

    foot.appendChild(nextBtn);

    /* Focus service input */
    requestAnimationFrame(function() { svcInput.focus({ preventScroll: true }); });
  }

  /* ── STEP 2: Urgency ─────────────────────────────────────── */
  function _renderStep2() {
    var st = _state;
    var isUrgent = st.mode === 'express';
    _setTitle(isUrgent ? 'URGENT' : 'FIXEO', "C'est pour quand\u00a0?", isUrgent);
    _setProgress(2, 3);
    _clearBody();
    _clearFoot();

    var body = _q('#fxrf4-body');
    var foot = _q('#fxrf4-foot');

    var errEl = _h('div', { id: 'fxrf4-error' });
    body.appendChild(errEl);

    var choices = [
      { value: 'Urgent (moins de 30 min)', icon: '\u26a1', label: 'Maintenant', meta: 'Artisan disponible \u00e0 la demande', urgent: true },
      { value: 'Aujourd\u2019hui',          icon: '\ud83d\uddd3\ufe0f', label: 'Aujourd\u2019hui', meta: 'Dans la journ\u00e9e', urgent: false },
      { value: 'Normal',                   icon: '\ud83d\udcc5', label: 'Plus tard',    meta: 'Planification flexible',    urgent: false },
    ];

    var grid = _h('div', { cls: 'fxrf4-choices' });
    choices.forEach(function(c) {
      var el = _h('div', { cls: 'fxrf4-choice' + (c.urgent ? ' is-urgent' : '') });
      if (c.value === st.urgency) el.classList.add('is-selected');
      var icon = _h('span', { cls: 'fxrf4-choice-icon', txt: c.icon });
      var txt  = _h('span', { cls: 'fxrf4-choice-text' });
      txt.appendChild(_h('span', { cls: 'fxrf4-choice-label', txt: c.label }));
      txt.appendChild(_h('span', { cls: 'fxrf4-choice-meta',  txt: c.meta  }));
      el.appendChild(icon);
      el.appendChild(txt);

      function _select() {
        grid.querySelectorAll('.fxrf4-choice').forEach(function(x) { x.classList.remove('is-selected'); });
        el.classList.add('is-selected');
        st.urgency = c.value;
      }
      el.addEventListener('click',    _select);
      el.addEventListener('touchend', function(e) { e.preventDefault(); _select(); }, { passive: false });
      grid.appendChild(el);
    });
    body.appendChild(grid);

    /* If express mode, pre-select urgent */
    if (isUrgent) st.urgency = 'Urgent (moins de 30 min)';

    /* Next */
    var nextBtn = _btn('Continuer \u2192', 'fxrf4-btn-primary', 'fxrf4-next2', isUrgent);
    nextBtn.addEventListener('click', function() {
      _renderStep3();
    });

    /* Back */
    var backBtn = _btn('\u2190 Retour', 'fxrf4-btn-ghost', 'fxrf4-back2', false);
    backBtn.addEventListener('click', function() { _renderStep1(); });

    foot.appendChild(nextBtn);
    foot.appendChild(backBtn);
  }

  /* ── STEP 3: Description + Phone ────────────────────────── */
  function _renderStep3() {
    var st = _state;
    var isUrgent = st.urgency === 'Urgent (moins de 30 min)';
    _setTitle(isUrgent ? 'URGENT' : 'FIXEO',
              'D\u00e9tails de votre demande', isUrgent);
    _setProgress(3, 3);
    _clearBody();
    _clearFoot();

    var body = _q('#fxrf4-body');
    var foot = _q('#fxrf4-foot');

    var errEl = _h('div', { id: 'fxrf4-error' });
    body.appendChild(errEl);

    /* Description textarea */
    var descTA = _h('textarea', {
      cls: 'fxrf4-textarea', name: 'description',
      placeholder: 'D\u00e9crivez bri\u00e8vement votre besoin\u2026',
      maxlength: '180', rows: '3'
    });
    descTA.value = st.description;
    body.appendChild(_field('Description (optionnelle)', descTA, 'fxrf4-desc'));

    /* Phone input */
    var phoneInput = _h('input', {
      cls: 'fxrf4-input', type: 'tel', name: 'phone',
      placeholder: '06 12 34 56 78', maxlength: '20',
      inputmode: 'tel', autocomplete: 'tel'
    });
    phoneInput.value = st.phone;
    body.appendChild(_field('T\u00e9l\u00e9phone', phoneInput, 'fxrf4-phone'));

    /* Submit / Review button */
    var submitLabel = isUrgent ? '\u26a1 Envoyer ma demande' : 'V\u00e9rifier et envoyer';
    var nextBtn = _btn(submitLabel, 'fxrf4-btn-primary', 'fxrf4-next3', isUrgent);
    nextBtn.addEventListener('click', function() {
      _clearError();
      var desc  = descTA.value.trim();
      var phone = phoneInput.value.trim();

      if (!phone) {
        phoneInput.classList.add('is-error');
        _showError('Veuillez renseigner votre t\u00e9l\u00e9phone.');
        phoneInput.focus();
        return;
      }
      if (!_validPhone(phone)) {
        phoneInput.classList.add('is-error');
        _showError('V\u00e9rifiez votre num\u00e9ro (format\u00a0: 06 ou 07 + 8 chiffres).');
        phoneInput.focus();
        return;
      }
      st.description = desc;
      st.phone = phone;

      if (isUrgent) {
        /* Urgent: skip review, submit directly */
        _submitRequest();
      } else {
        _renderReview();
      }
    });

    var backBtn = _btn('\u2190 Retour', 'fxrf4-btn-ghost', 'fxrf4-back3', false);
    backBtn.addEventListener('click', function() { _renderStep2(); });

    foot.appendChild(nextBtn);
    foot.appendChild(backBtn);

    requestAnimationFrame(function() { descTA.focus({ preventScroll: true }); });
  }

  /* ── REVIEW ──────────────────────────────────────────────── */
  function _renderReview() {
    var st = _state;
    _setTitle('FIXEO', 'Votre demande', false);
    _setProgress(3, 3);
    _clearBody();
    _clearFoot();

    var body = _q('#fxrf4-body');
    var foot = _q('#fxrf4-foot');

    var rows = [
      { key: 'Service',  val: st.service },
      { key: 'Ville',    val: st.city },
      { key: 'Urgence',  val: st.urgency },
      { key: 'D\u00e9tail', val: st.description || '—' },
      { key: 'T\u00e9l.',   val: st.phone },
    ];

    var table = _h('div', { cls: 'fxrf4-review-rows' });
    rows.forEach(function(r) {
      var row = _h('div', { cls: 'fxrf4-review-row' });
      row.appendChild(_h('span', { cls: 'fxrf4-review-key', txt: r.key }));
      row.appendChild(_h('span', { cls: 'fxrf4-review-val', txt: r.val }));
      table.appendChild(row);
    });
    body.appendChild(table);

    var errEl = _h('div', { id: 'fxrf4-error' });
    body.appendChild(errEl);

    var submitBtn = _btn('Envoyer ma demande', 'fxrf4-btn-primary', 'fxrf4-submit', false);
    submitBtn.addEventListener('click', function() { _submitRequest(); });

    var editBtn = _btn('\u270f\ufe0f Modifier', 'fxrf4-btn-ghost', 'fxrf4-edit', false);
    editBtn.addEventListener('click', function() { _renderStep1(); });

    foot.appendChild(submitBtn);
    foot.appendChild(editBtn);
  }

  /* ── SUBMIT ──────────────────────────────────────────────── */
  function _submitRequest() {
    var st = _state;

    /* Double-submit guard */
    if (st.submitLocked) return;
    var now = Date.now();
    if (now - st.submitTs < 1600) return;
    st.submitLocked = true;
    st.submitTs = now;

    /* Disable submit button */
    var btn = _q('#fxrf4-submit') || _q('#fxrf4-next3');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours\u2026'; }

    /* Save */
    var result = _saveRequest(st);
    var saved = result && result.request;

    if (!saved) {
      st.submitLocked = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Envoyer ma demande'; }
      _showError('Impossible d\u2019envoyer pour le moment. V\u00e9rifiez votre connexion.');
      return;
    }

    /* Fire analytics event (non-blocking) */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:client-request-submit-success', {
        detail: {
          request: saved,
          mode: st.mode,
          source: 'fxrf4-v1a',
          storageKey: STORAGE_KEY,
          duplicated: result.duplicated
        }
      }));
    } catch (_) {}

    /* Show success */
    st.submitLocked = false;
    _renderSuccess(saved, result.duplicated);
  }

  /* ── SUCCESS ─────────────────────────────────────────────── */
  function _renderSuccess(saved, duplicated) {
    var st = _state;
    _setTitle('RAFI', 'Demande envoy\u00e9e', false);
    _setProgress(3, 3);
    _clearBody();
    _clearFoot();

    var body = _q('#fxrf4-body');
    var foot = _q('#fxrf4-foot');

    /* ── Diagnostic: log header children count ── */
    var headEl = _q('#fxrf4-head');
    if (headEl) {
      console.log('[fxrf4] Header children count:', headEl.childElementCount,
                  '(expected: 3 — eyebrow, title, close)');
    }

    var succ = _h('div', { id: 'fxrf4-success' });

    /* Check ring */
    succ.appendChild(_h('div', { cls: 'fxrf4-check-ring', html: '\u2713' }));

    /* RAFI tag */
    succ.appendChild(_h('p', { cls: 'fxrf4-success-tag', txt: 'RAFI' }));

    /* Title */
    succ.appendChild(_h('p', { cls: 'fxrf4-success-title',
                                txt: 'Votre demande a bien \u00e9t\u00e9 envoy\u00e9e.' }));

    /* Body */
    succ.appendChild(_h('p', { cls: 'fxrf4-success-body',
                                txt: 'RAFI recherche maintenant les professionnels les plus adapt\u00e9s \u00e0 votre projet.' }));

    /* Tracking ref */
    if (saved && saved.tracking_ref) {
      succ.appendChild(_h('p', { cls: 'fxrf4-success-ref',
                                  html: 'R\u00e9f.\u00a0: <strong>' + saved.tracking_ref + '</strong>' }));
    }

    /* Steps */
    var steps = _h('div', { cls: 'fxrf4-success-steps' });
    [
      { dot: '\u2705', lbl: 'Demande\nenregistr\u00e9e' },
      { dot: '\ud83d\udd0d', lbl: 'RAFI\ns\u00e9lectionne' },
      { dot: '\ud83d\udcac', lbl: 'Confirmation\nWhatsApp' }
    ].forEach(function(s, i) {
      if (i > 0) steps.appendChild(_h('div', { cls: 'fxrf4-success-step-sep' }));
      var step = _h('div', { cls: 'fxrf4-success-step' });
      step.appendChild(_h('div', { cls: 'fxrf4-success-step-dot', txt: s.dot }));
      var lbl = _h('span', { cls: 'fxrf4-success-step-lbl' });
      lbl.style.whiteSpace = 'pre-line';
      lbl.textContent = s.lbl;
      step.appendChild(lbl);
      steps.appendChild(step);
    });
    succ.appendChild(steps);

    body.appendChild(succ);

    /* Actions */
    var waLink = _buildWALink(st);

    var dashBtn = _h('a', { cls: 'fxrf4-btn fxrf4-btn-primary',
                             href: '/client-dashboard.html',
                             txt: 'Voir mes demandes' });
    var homeBtn = _h('a', { cls: 'fxrf4-btn fxrf4-btn-ghost',
                             href: '/index.html',
                             txt: 'Retour \u00e0 l\u2019accueil' });

    var actions = _h('div', { cls: 'fxrf4-success-actions' });
    actions.appendChild(dashBtn);
    actions.appendChild(homeBtn);
    foot.appendChild(actions);
  }

  /* ═══════════════════════════════════════════════════════════
     OPEN / CLOSE
  ═══════════════════════════════════════════════════════════ */

  var _isOpen = false;

  function open(opts) {
    if (_isOpen) return;
    _buildDOM();

    var mode   = (opts && opts.mode)   || 'default';
    var source = (opts && opts.source) || 'unknown';

    _state  = _freshState(mode, source);
    _isOpen = true;

    _lock();
    _root.classList.add('fxrf4-active');
    _root.setAttribute('aria-hidden', 'false');

    /* Render first screen */
    _renderStep1();
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    _state  = null;

    if (_root) {
      _root.classList.remove('fxrf4-active');
      _root.setAttribute('aria-hidden', 'true');
    }
    _unlock();
  }

  /* Escape key */
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && _isOpen) close();
  });

  /* ═══════════════════════════════════════════════════════════
     TRIGGER MIGRATION
     Route every CTA to FixeoRequestFlowV4.open()
     Intercepts BEFORE request-form.js bindTriggers (loaded after this).
  ═══════════════════════════════════════════════════════════ */

  function _routeTrigger(trigger, forcedMode) {
    var mode = forcedMode || (trigger && trigger.getAttribute('data-request-mode')) || 'default';
    var source = 'unknown';
    if (trigger) {
      if (trigger.classList.contains('final-cta-primary'))  source = 'final-cta';
      else if (trigger.closest && trigger.closest('#home'))  source = 'hero';
      else if (trigger.closest && trigger.closest('.mobile-nav')) source = 'mobile-nav';
      else if (trigger.id === 'mobile-sticky-cta')          source = 'sticky';
      else source = 'cta';
    }
    open({ mode: mode, source: source });
  }

  /* Override window.openModal for 'request-modal' calls */
  var _origOpenModal = window.openModal;
  window.openModal = function(id) {
    if (id === 'request-modal') {
      _routeTrigger(null, null);
      return;
    }
    if (_origOpenModal) _origOpenModal.call(this, id);
  };

  /* Override window.closeModal for 'request-modal' calls */
  var _origCloseModal = window.closeModal;
  window.closeModal = function(id) {
    if (id === 'request-modal') { close(); return; }
    if (_origCloseModal) _origCloseModal.call(this, id);
  };

  /* forceOpenRequestModal (mobile nav inline script) */
  window.forceOpenRequestModal = function() {
    _routeTrigger(null, null);
  };

  /* Patch FixeoClientRequest after it's ready */
  function _patchFCR() {
    var fc = window.FixeoClientRequest;
    if (!fc || fc._fxrf4Patched) { setTimeout(_patchFCR, 60); return; }
    if (!fc.open) { setTimeout(_patchFCR, 60); return; }
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

  /* data-open-request-form triggers: intercept at capture phase
     before request-form.js bubbling listener */
  document.addEventListener('click', function(e) {
    var trigger = e.target.closest('[data-open-request-form="true"]');
    if (!trigger) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    _routeTrigger(trigger, null);
  }, true /* capture */);

  /* Run after DOM ready */
  function _init() {
    _buildDOM();
    _patchFCR();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */
  window.FixeoRequestFlowV4 = {
    VERSION: 'fxrf4-v1a',
    open:    open,
    close:   close
  };

})();
