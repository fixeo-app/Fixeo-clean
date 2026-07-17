/**
 * FIXEO Enterprise Modal V1 — fixeo-enterprise-modal-v1.js
 * Version: fem-v1a — 2026-07-17
 *
 * ─────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────
 * Completely standalone IIFE — zero dependencies on request-form.js.
 * Builds and manages its OWN DOM node: #fixeo-enterprise-modal
 * Intercepts FixeoClientRequest.open(trigger, 'enterprise') via shim.
 * The marketplace #request-modal and request-form.js are NEVER touched.
 *
 * SUBMISSION
 * Form data is submitted to the Enterprise contact endpoint.
 * Graceful fallback: mailto: if fetch fails.
 *
 * ROUTING
 * data-request-mode="enterprise" on any button/link triggers this modal.
 * FixeoClientRequest.openEnterprise(trigger) is also exposed.
 *
 * NEVER TOUCHES:
 *   - request-form.js
 *   - fixeo-request-modal-v2.js
 *   - fixeo-urgent-modal-v3.js
 *   - fixeo-express-route-shim.js
 *   - #request-modal DOM node
 *   - any existing modal infrastructure
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window._fxEnterpriseModalLoaded) return;
  window._fxEnterpriseModalLoaded = true;

  var VERSION = 'fem-v1a';

  /* ── Config ─────────────────────────────────────────────────── */
  var MODAL_ID       = 'fixeo-enterprise-modal';
  var FORM_ID        = 'fixeo-enterprise-form';
  var EMAIL_ENDPOINT = 'mailto:enterprise@fixeo.ma'; /* graceful fallback always available */
  var WHATSAPP_TEAM  = 'https://wa.me/212660484415?text=' +
    encodeURIComponent('Bonjour, je souhaite une démonstration FIXEO Enterprise.');

  var CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger',
    'Agadir','Meknès','Oujda','Kénitra','Tétouan',
    'Salé','Temara','El Jadida','Béni Mellal','Nador',
    'Khouribga','Safi','Taza','Ouarzazate','Mohammedia',
    'Autre'
  ];

  var ORG_TYPES = [
    { value: 'hotel',       label: 'Hôtel' },
    { value: 'restaurant',  label: 'Restaurant' },
    { value: 'cafe',        label: 'Café' },
    { value: 'bureau',      label: 'Bureau' },
    { value: 'clinique',    label: 'Clinique' },
    { value: 'ecole',       label: 'École' },
    { value: 'syndic',      label: 'Syndic' },
    { value: 'commerce',    label: 'Commerce' },
    { value: 'industrie',   label: 'Industrie' },
    { value: 'autre',       label: 'Autre' }
  ];

  var NEEDS = [
    { value: 'maintenance_ponctuelle',  label: 'Maintenance ponctuelle' },
    { value: 'contrat_maintenance',     label: 'Contrat de maintenance' },
    { value: 'facility_management',     label: 'Facility Management' },
    { value: 'multi_sites',             label: 'Multi-sites' },
    { value: 'demonstration',           label: 'Démonstration' }
  ];

  /* ── Helpers ─────────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  /* ── Build modal HTML ────────────────────────────────────────── */
  function buildModal() {
    if (document.getElementById(MODAL_ID)) return;

    /* ── Backdrop (shared with main .modal-backdrop if already present,
       else we reuse the existing one from the standard modal stack) ─ */
    var backdrop = document.querySelector('.modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
      /* Let backdrop click close enterprise modal */
      backdrop.addEventListener('click', closeModal);
    }

    /* ── Modal node ─────────────────────────────────────────────── */
    var modal = document.createElement('div');
    modal.id   = MODAL_ID;
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fem-title');
    modal.setAttribute('aria-describedby', 'fem-subtitle');
    modal.setAttribute('data-request-mode', 'enterprise');

    /* ── City options ── */
    var cityOptions = CITIES.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');

    /* ── Org type options ── */
    var orgOptions = '<option value="" disabled selected>Sélectionnez…</option>' +
      ORG_TYPES.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
      }).join('');

    /* ── Need checkboxes ── */
    var needChecks = NEEDS.map(function (n) {
      var checkId = 'fem-need-' + n.value;
      return '<label class="fem-check-item" for="' + checkId + '">' +
        '<input type="checkbox" id="' + checkId + '" name="needs" value="' + esc(n.value) + '">' +
        '<span class="fem-check-label">' + esc(n.label) + '</span>' +
        '</label>';
    }).join('');

    modal.innerHTML = [
      /* ── Header ── */
      '<div class="fem-header">',
        '<div class="fem-header-eyebrow">Enterprise</div>',
        '<h2 id="fem-title">Demander une démo Enterprise</h2>',
        '<p class="fem-header-subtitle" id="fem-subtitle">',
          'Expliquez-nous vos besoins.<br>Notre équipe vous recontacte rapidement.',
        '</p>',
        '<button class="fem-close" type="button" aria-label="Fermer" id="fem-close-btn">×</button>',
      '</div>',

      /* ── Form body ── */
      '<form id="' + FORM_ID + '" class="fem-body" novalidate autocomplete="on">',

        /* Nom + Prénom */
        '<p class="fem-section-label">Contact</p>',
        '<div class="fem-row-2">',
          '<div class="request-field">',
            '<label class="request-label" for="fem-nom">Nom <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="text" id="fem-nom" name="nom" placeholder="Dupont" required autocomplete="family-name">',
          '</div>',
          '<div class="request-field">',
            '<label class="request-label" for="fem-prenom">Prénom <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="text" id="fem-prenom" name="prenom" placeholder="Mohamed" required autocomplete="given-name">',
          '</div>',
        '</div>',

        /* Entreprise + Fonction */
        '<div class="fem-row-2">',
          '<div class="request-field">',
            '<label class="request-label" for="fem-entreprise">Entreprise <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="text" id="fem-entreprise" name="entreprise" placeholder="Hôtel Atlas" required autocomplete="organization">',
          '</div>',
          '<div class="request-field">',
            '<label class="request-label" for="fem-fonction">Fonction <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="text" id="fem-fonction" name="fonction" placeholder="Directeur Technique" required autocomplete="organization-title">',
          '</div>',
        '</div>',

        /* Téléphone + Email */
        '<div class="fem-row-2">',
          '<div class="request-field">',
            '<label class="request-label" for="fem-telephone">Téléphone <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="tel" id="fem-telephone" name="telephone" placeholder="+212 6XX XXX XXX" required autocomplete="tel">',
          '</div>',
          '<div class="request-field">',
            '<label class="request-label" for="fem-email">Email professionnel <span class="request-optional" aria-hidden="true">*</span></label>',
            '<input type="email" id="fem-email" name="email" placeholder="direction@hotel-atlas.ma" required autocomplete="email">',
          '</div>',
        '</div>',

        /* Ville */
        '<div class="request-field">',
          '<label class="request-label" for="fem-ville">Ville</label>',
          '<select id="fem-ville" name="ville" autocomplete="address-level2">',
            '<option value="">Sélectionnez votre ville…</option>',
            cityOptions,
          '</select>',
        '</div>',

        /* Organisation type */
        '<p class="fem-section-label" style="margin-top:4px;">Type d\'organisation</p>',
        '<div class="request-field">',
          '<label class="request-label" for="fem-org-type">Secteur d\'activité <span class="request-optional" aria-hidden="true">*</span></label>',
          '<select id="fem-org-type" name="org_type" required>',
            orgOptions,
          '</select>',
        '</div>',

        /* Need checkboxes */
        '<p class="fem-section-label" style="margin-top:4px;">Besoin</p>',
        '<div class="fem-checks" role="group" aria-label="Sélectionnez votre besoin">',
          needChecks,
        '</div>',

        /* Optional: buildings + message */
        '<p class="fem-section-label" style="margin-top:4px;">Informations complémentaires <span class="request-optional">(optionnel)</span></p>',
        '<div class="request-field">',
          '<label class="request-label" for="fem-batiments">Nombre de bâtiments</label>',
          '<input type="number" id="fem-batiments" name="batiments" placeholder="ex. 3" min="1" max="999" autocomplete="off">',
        '</div>',
        '<div class="request-field">',
          '<label class="request-label" for="fem-message">Message libre</label>',
          '<textarea id="fem-message" name="message" class="fem-textarea" placeholder="Décrivez vos installations, vos défis actuels, vos attentes…" rows="3"></textarea>',
        '</div>',

        /* Error message area */
        '<div class="fem-error-msg" id="fem-error-msg" role="alert" aria-live="polite"></div>',

      '</form>',

      /* ── Sticky footer / submit ── */
      '<div class="fem-footer">',
        '<button type="submit" form="' + FORM_ID + '" class="fem-submit-btn" id="fem-submit-btn">',
          'Demander une démonstration',
        '</button>',
        '<p class="fem-trust-line">Sans engagement · Réponse sous 24h · Données confidentielles</p>',
      '</div>',

      /* ── Success state (replaces form+footer) ── */
      '<div class="fem-success" id="fem-success" aria-live="polite">',
        '<div class="fem-success-icon" aria-hidden="true">✅</div>',
        '<h3 class="fem-success-title">Merci.</h3>',
        '<p class="fem-success-text">',
          'Notre équipe Enterprise vous contactera dans les plus brefs délais.',
        '</p>',
        '<button type="button" class="fem-success-close" id="fem-success-close">Fermer</button>',
      '</div>'
    ].join('\n');

    document.body.appendChild(modal);
    _bindEvents(modal);
  }

  /* ── Open ────────────────────────────────────────────────────── */
  function openModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) { buildModal(); modal = document.getElementById(MODAL_ID); }
    if (!modal) return;

    /* Reset to form view */
    _showForm(modal);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    /* Backdrop */
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'block';
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
    }

    /* Scroll lock */
    document.body.style.overflow = 'hidden';

    /* Focus first field */
    setTimeout(function () {
      var first = modal.querySelector('input[required]');
      if (first) first.focus();
    }, 80);

    /* ESC to close */
    document.addEventListener('keydown', _onKeydown);
  }

  /* ── Close ───────────────────────────────────────────────────── */
  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');

    /* Only lower backdrop if #request-modal is also closed */
    var reqModal = document.getElementById('request-modal');
    var reqOpen = reqModal && reqModal.classList.contains('open');
    if (!reqOpen) {
      var backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.style.display = '';
      }
      document.body.style.overflow = '';
    }

    document.removeEventListener('keydown', _onKeydown);
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  /* ── Show/hide views ─────────────────────────────────────────── */
  function _showForm(modal) {
    var form    = $('#' + FORM_ID, modal);
    var footer  = modal.querySelector('.fem-footer');
    var success = $('#fem-success', modal);
    if (form)    form.style.display    = '';
    if (footer)  footer.style.display  = '';
    if (success) success.classList.remove('active');
  }

  function _showSuccess(modal) {
    var form    = $('#' + FORM_ID, modal);
    var footer  = modal.querySelector('.fem-footer');
    var success = $('#fem-success', modal);
    if (form)    form.style.display   = 'none';
    if (footer)  footer.style.display = 'none';
    if (success) {
      success.classList.add('active');
      var closeBtn = $('#fem-success-close', success);
      if (closeBtn) closeBtn.focus();
    }
  }

  /* ── Event bindings ──────────────────────────────────────────── */
  function _bindEvents(modal) {
    /* Close button */
    var closeBtn = $('#fem-close-btn', modal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    /* Success close */
    var successClose = $('#fem-success-close', modal);
    if (successClose) successClose.addEventListener('click', closeModal);

    /* Form submit */
    var form = $('#' + FORM_ID, modal);
    if (form) form.addEventListener('submit', _handleSubmit);

    /* Backdrop click (enterprise modal only — guard against standard modal) */
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        if (modal.classList.contains('open')) closeModal();
      });
    }
  }

  /* ── Form validation ─────────────────────────────────────────── */
  function _validate(form) {
    var errors = [];

    /* Clear previous */
    $$('.fem-invalid', form).forEach(function (el) { el.classList.remove('fem-invalid'); });
    var errBox = $('#fem-error-msg', form.closest('.modal') || document);
    if (errBox) { errBox.classList.remove('visible'); errBox.textContent = ''; }

    var required = [
      { id: 'fem-nom',       label: 'Nom' },
      { id: 'fem-prenom',    label: 'Prénom' },
      { id: 'fem-entreprise',label: 'Entreprise' },
      { id: 'fem-fonction',  label: 'Fonction' },
      { id: 'fem-telephone', label: 'Téléphone' },
      { id: 'fem-email',     label: 'Email' },
      { id: 'fem-org-type',  label: 'Type d\'organisation' }
    ];

    required.forEach(function (field) {
      var el = $('#' + field.id, form);
      if (!el) return;
      var val = el.value.trim();
      if (!val || val === '') {
        el.classList.add('fem-invalid');
        errors.push(field.label);
      }
    });

    /* Email format */
    var emailEl = $('#fem-email', form);
    if (emailEl && emailEl.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
      emailEl.classList.add('fem-invalid');
      if (!errors.includes('Email')) errors.push('Email (format invalide)');
    }

    return errors;
  }

  /* ── Collect form data ───────────────────────────────────────── */
  function _collectData(form) {
    var needs = $$('input[name="needs"]:checked', form).map(function (el) { return el.value; });
    return {
      source:       'enterprise',
      mode:         'enterprise',
      nom:          ($('#fem-nom',        form) || {}).value || '',
      prenom:       ($('#fem-prenom',     form) || {}).value || '',
      entreprise:   ($('#fem-entreprise', form) || {}).value || '',
      fonction:     ($('#fem-fonction',   form) || {}).value || '',
      telephone:    ($('#fem-telephone',  form) || {}).value || '',
      email:        ($('#fem-email',      form) || {}).value || '',
      ville:        ($('#fem-ville',      form) || {}).value || '',
      org_type:     ($('#fem-org-type',   form) || {}).value || '',
      needs:        needs.join(', '),
      batiments:    ($('#fem-batiments',  form) || {}).value || '',
      message:      ($('#fem-message',    form) || {}).value || '',
      submitted_at: new Date().toISOString(),
      page:         window.location.pathname
    };
  }

  /* ── Submit handler ──────────────────────────────────────────── */
  function _handleSubmit(e) {
    e.preventDefault();

    var form    = e.target;
    var modal   = document.getElementById(MODAL_ID);
    var submitBtn = $('#fem-submit-btn', document);
    var errBox    = $('#fem-error-msg', modal);

    /* Validate */
    var errors = _validate(form);
    if (errors.length > 0) {
      if (errBox) {
        errBox.textContent = 'Veuillez renseigner : ' + errors.join(', ') + '.';
        errBox.classList.add('visible');
      }
      /* Focus first invalid */
      var firstInvalid = $('.fem-invalid', form);
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    /* Disable submit */
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi en cours…';
    }

    var data = _collectData(form);

    /* ── Attempt fetch to /api/enterprise-contact ── */
    _submitToApi(data).then(function (ok) {
      if (ok) {
        _showSuccess(modal);
        /* Store locally for CRM follow-up */
        _storeLocally(data);
      } else {
        /* Fallback: open mailto: pre-filled */
        _fallbackMailto(data);
        _showSuccess(modal);
      }
    }).catch(function () {
      _fallbackMailto(data);
      _showSuccess(modal);
    });
  }

  /* ── API submission ──────────────────────────────────────────── */
  function _submitToApi(data) {
    return fetch('/api/enterprise-contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data)
    })
    .then(function (res) { return res.ok; })
    .catch(function () { return false; });
  }

  /* ── Mailto fallback ─────────────────────────────────────────── */
  function _fallbackMailto(data) {
    var body = [
      'Nom : '            + (data.nom || '') + ' ' + (data.prenom || ''),
      'Entreprise : '     + (data.entreprise || ''),
      'Fonction : '       + (data.fonction || ''),
      'Téléphone : '      + (data.telephone || ''),
      'Email : '          + (data.email || ''),
      'Ville : '          + (data.ville || ''),
      'Type d\'organisation : ' + (data.org_type || ''),
      'Besoins : '        + (data.needs || ''),
      'Bâtiments : '      + (data.batiments || '—'),
      '',
      'Message :',
      (data.message || '—'),
      '',
      '—',
      'Envoyé depuis : '  + (data.page || window.location.pathname)
    ].join('\n');

    var subject = encodeURIComponent('Demande démo Enterprise – ' + (data.entreprise || '') + ' / ' + (data.ville || ''));
    var mailtoUrl = 'mailto:enterprise@fixeo.ma?subject=' + subject + '&body=' + encodeURIComponent(body);

    /* Open in new tab so success state still shows */
    var a = document.createElement('a');
    a.href = mailtoUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ── Local storage (CRM) ─────────────────────────────────────── */
  function _storeLocally(data) {
    try {
      var KEY = 'fixeo_enterprise_leads';
      var existing = JSON.parse(localStorage.getItem(KEY) || '[]');
      existing.push(data);
      if (existing.length > 50) existing = existing.slice(-50);
      localStorage.setItem(KEY, JSON.stringify(existing));
    } catch (_) { /* storage unavailable — ignore */ }
  }

  /* ── Intercept FixeoClientRequest.open for 'enterprise' mode ─── */
  function _patchFixeoClientRequest() {
    var fc = window.FixeoClientRequest;
    if (!fc) {
      /* request-form.js not yet ready — retry */
      setTimeout(_patchFixeoClientRequest, 80);
      return;
    }

    var _originalOpen = fc.open;

    /* Wrap .open to intercept enterprise mode */
    fc.open = function (trigger, forcedMode) {
      var mode = forcedMode;
      if (!mode && trigger && typeof trigger.getAttribute === 'function') {
        mode = trigger.getAttribute('data-request-mode');
      }
      if (mode === 'enterprise') {
        openModal();
        return;
      }
      /* Pass through to marketplace modal for all other modes */
      return _originalOpen.apply(fc, arguments);
    };

    /* Convenience shorthand */
    fc.openEnterprise = openModal;
  }

  /* ── Wire data-request-mode="enterprise" triggers ───────────── */
  function _bindTriggers() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-request-mode="enterprise"], [data-open-enterprise]');
      if (!el) return;
      e.preventDefault();
      openModal();
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    buildModal();
    _bindTriggers();
    _patchFixeoClientRequest();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.FixeoEnterpriseModal = {
    VERSION: VERSION,
    open:  openModal,
    close: closeModal
  };

})();
