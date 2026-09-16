/**
 * FIXEO Enterprise Lead Flow V2 — fixeo-enterprise-lead-v2.js
 * Version: fxlf-v2c — 2026-09-16
 *
 * Standalone Enterprise lead flow.
 *
 * Supported entry intents:
 *   demo     → explicit product demonstration request
 *   cadrage  → operational scoping session; does not imply a demonstration
 *   contact  → general Enterprise contact
 *
 * THREE STEPS:
 *   Step 1 — Votre contact
 *   Step 2 — Votre organisation
 *   Step 3 — Votre besoin
 *
 * NEED PRESELECTION:
 *   demo     → "Démonstration de la solution" pre-selected
 *   cadrage  → nothing pre-selected
 *   contact  → nothing pre-selected
 *
 * SUBMISSION:
 *   POST /api/enterprise-contact
 *   Fallback: user-initiated mailto link after confirmed API/network failure
 *
 * PROTECTION:
 *   - Honeypot
 *   - Submit-once lock
 *   - Minimum 2-second fill time
 *   - Idempotency key generated per panel open
 *
 * ANALYTICS:
 *   Uses window.fixeoTrack() only. Never sends lead PII.
 */
(function () {
  'use strict';

  if (window._fxLeadFlowV2Loaded) return;
  window._fxLeadFlowV2Loaded = true;

  var VERSION = 'fxlf-v2c';
  var PANEL_ID = 'fxlf-panel';
  var OVERLAY_ID = 'fxlf-overlay';
  var MOBILE_CLOSE_ID = 'fxlf-mobile-close';
  var API_ENDPOINT = '/api/enterprise-contact';
  var TOTAL_STEPS = 3;
  var VALID_INTENTS = ['demo', 'cadrage', 'contact'];

  var _state = {
    intent: 'demo',
    sourceCta: '',
    step: 1,
    submitting: false,
    submitted: false,
    openedAt: 0,
    idempotencyKey: '',
    triggerEl: null,
    savedScrollY: 0
  };

  var _values = {};

  var CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia','Autre'
  ];

  var SECTORS = [
    { value: 'hotellerie',        label: 'Hôtellerie' },
    { value: 'restauration',      label: 'Restauration & Café' },
    { value: 'commerce_retail',   label: 'Commerce & Retail' },
    { value: 'centre_commercial', label: 'Centre commercial' },
    { value: 'bureaux',           label: 'Bureaux & Siège social' },
    { value: 'banque_finance',    label: 'Banque & Finance' },
    { value: 'education',         label: 'Éducation' },
    { value: 'clinique_sante',    label: 'Clinique & Santé' },
    { value: 'industrie',         label: 'Industrie & Logistique' },
    { value: 'immobilier',        label: 'Immobilier résidentiel' },
    { value: 'syndic',            label: 'Syndic & Gérance' },
    { value: 'autre',             label: 'Autre' }
  ];

  var ORG_TYPES = [
    { value: 'entreprise',       label: 'Entreprise privée' },
    { value: 'groupe',           label: 'Groupe multi-sites' },
    { value: 'etablissement',    label: 'Établissement unique' },
    { value: 'syndic_gerance',   label: 'Syndic / Gérance' },
    { value: 'organisme_public', label: 'Organisme public' },
    { value: 'association',      label: 'Association' },
    { value: 'autre',            label: 'Autre' }
  ];

  var NEEDS = [
    { value: 'interventions_ponctuelles', label: '🔧 Interventions ponctuelles' },
    { value: 'contrat_maintenance',       label: '🛡️ Contrat de maintenance' },
    { value: 'facility_management',       label: '🏗️ Facility Management complet' },
    { value: 'multi_sites',               label: '🏢 Gestion multi-sites' },
    { value: 'urgences',                  label: '⚡ Urgences 24h/24' },
    { value: 'demonstration',             label: '📊 Démonstration de la solution' },
    { value: 'autre_besoin',              label: '💬 Autre besoin' }
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $$(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36);
  }

  function normalizeIntent(intent) {
    var value = String(intent || '').toLowerCase();
    return VALID_INTENTS.indexOf(value) >= 0 ? value : 'demo';
  }

  function getPanel() {
    return document.getElementById(PANEL_ID);
  }

  function getOverlay() {
    return document.getElementById(OVERLAY_ID);
  }

  function getMobileClose() {
    return document.getElementById(MOBILE_CLOSE_ID);
  }

  function _intentCopy(intent) {
    if (intent === 'cadrage') {
      return {
        title: 'Planifier une session de cadrage',
        subtitle:
          'Présentez-nous votre organisation, vos sites et vos contraintes. Notre équipe préparera un échange adapté à votre réalité opérationnelle.',
        submit: 'Envoyer ma demande de cadrage'
      };
    }

    if (intent === 'contact') {
      return {
        title: 'Échanger avec l\'équipe Entreprise',
        subtitle:
          'Expliquez-nous votre besoin. Notre équipe vous recontactera pour étudier votre organisation.',
        submit: 'Contacter l\'équipe Entreprise'
      };
    }

    return {
      title: 'Planifier une démonstration',
      subtitle:
        'Présentez-nous votre organisation. Notre équipe préparera une démonstration adaptée à vos besoins.',
      submit: 'Envoyer ma demande de démonstration'
    };
  }

  function _track(event, props) {
    try {
      if (typeof window.fixeoTrack === 'function') {
        window.fixeoTrack(event, props);
      }
    } catch (_) {}
  }

  function _buildOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.className = 'fxlf-overlay';
    ov.setAttribute('aria-hidden', 'true');

    document.body.appendChild(ov);
    ov.addEventListener('click', closePanel);
  }

  function _buildMobileClose() {
    if (document.getElementById(MOBILE_CLOSE_ID)) return;

    var btn = document.createElement('button');
    btn.id = MOBILE_CLOSE_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Fermer le formulaire');
    btn.textContent = '×';
    btn.style.display = 'none';

    document.body.appendChild(btn);
    btn.addEventListener('click', closePanel);
  }

  function _showMobileClose() {
    if (window.innerWidth > 640) return;

    _buildMobileClose();

    var btn = getMobileClose();

    if (btn) {
      btn.style.display = '';
      btn.classList.add('fxlf-mobile-close-open');
    }
  }

  function _hideMobileClose() {
    var btn = getMobileClose();

    if (btn) {
      btn.style.display = 'none';
      btn.classList.remove('fxlf-mobile-close-open');
    }
  }

  function _buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var cityOpts = CITIES.map(function (c) {
      return '<option value="' + esc(c) + '">' +
        esc(c) +
        '</option>';
    }).join('');

    var sectorOpts =
      '<option value="" disabled selected>Sélectionnez votre secteur…</option>' +
      SECTORS.map(function (s) {
        return '<option value="' + esc(s.value) + '">' +
          esc(s.label) +
          '</option>';
      }).join('');

    var orgOpts =
      '<option value="" disabled selected>Sélectionnez le type…</option>' +
      ORG_TYPES.map(function (o) {
        return '<option value="' + esc(o.value) + '">' +
          esc(o.label) +
          '</option>';
      }).join('');

    var needCards = NEEDS.map(function (n) {
      return [
        '<label class="fxlf-need-card" data-value="' +
          esc(n.value) +
          '" tabindex="0" role="checkbox" aria-checked="false">',

          '<input type="checkbox" class="fxlf-hp" name="need_' +
            esc(n.value) +
            '" value="' +
            esc(n.value) +
            '" tabindex="-1" aria-hidden="true">',

          '<span class="fxlf-need-check" aria-hidden="true">✓</span>',
          '<span class="fxlf-need-label">' +
            esc(n.label) +
          '</span>',

        '</label>'
      ].join('');
    }).join('');

    var panel = document.createElement('div');

    panel.id = PANEL_ID;
    panel.className = 'fxlf-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'fxlf-title');
    panel.setAttribute('aria-describedby', 'fxlf-subtitle');
    panel.setAttribute('aria-hidden', 'true');

    panel.innerHTML = [

      '<div class="fxlf-header">',
        '<div class="fxlf-header-eyebrow" id="fxlf-eyebrow">Enterprise</div>',
        '<h2 class="fxlf-title" id="fxlf-title">Planifier une démonstration</h2>',
        '<p class="fxlf-subtitle" id="fxlf-subtitle">Présentez-nous votre organisation. Notre équipe préparera une démonstration adaptée à vos besoins.</p>',
        '<button class="fxlf-close" type="button" id="fxlf-close" aria-label="Fermer le formulaire">×</button>',
      '</div>',

      '<div class="fxlf-progress" aria-hidden="true">',
        '<span class="fxlf-progress-label" id="fxlf-step-label">Étape 1 sur 3</span>',
        '<div class="fxlf-progress-track">',
          '<div class="fxlf-progress-fill" id="fxlf-progress-fill" style="width:33%"></div>',
        '</div>',
      '</div>',

      '<div class="fxlf-error-band" id="fxlf-error-band" role="alert" aria-live="polite"></div>',

      '<div class="fxlf-body" id="fxlf-body">',

        '<div class="fxlf-step-pane active" data-step="1">',
          '<div class="fxlf-step-heading">Votre contact</div>',

          '<div class="fxlf-fields">',

            '<div class="fxlf-row-2">',

              '<div class="fxlf-field">',
                '<label class="fxlf-label" for="fxlf-prenom">Prénom <span class="fxlf-req" aria-hidden="true">*</span></label>',
                '<input class="fxlf-input" type="text" id="fxlf-prenom" name="prenom" autocomplete="given-name" placeholder="Mohamed" required>',
                '<span class="fxlf-field-error" id="fxlf-err-prenom" role="alert">Ce champ est requis.</span>',
              '</div>',

              '<div class="fxlf-field">',
                '<label class="fxlf-label" for="fxlf-nom">Nom <span class="fxlf-req" aria-hidden="true">*</span></label>',
                '<input class="fxlf-input" type="text" id="fxlf-nom" name="nom" autocomplete="family-name" placeholder="Benali" required>',
                '<span class="fxlf-field-error" id="fxlf-err-nom" role="alert">Ce champ est requis.</span>',
              '</div>',

            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-telephone">Téléphone <span class="fxlf-req" aria-hidden="true">*</span></label>',
              '<input class="fxlf-input" type="tel" id="fxlf-telephone" name="telephone" autocomplete="tel" placeholder="+212 6XX XXX XXX" required>',
              '<span class="fxlf-field-error" id="fxlf-err-telephone" role="alert">Numéro requis.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-email">Email professionnel <span class="fxlf-req" aria-hidden="true">*</span></label>',
              '<input class="fxlf-input" type="email" id="fxlf-email" name="email" autocomplete="email" placeholder="direction@hotel-atlas.ma" required>',
              '<span class="fxlf-field-error" id="fxlf-err-email" role="alert">Email invalide.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-fonction">Fonction <span class="fxlf-optional" aria-hidden="true">(optionnel)</span></label>',
              '<input class="fxlf-input" type="text" id="fxlf-fonction" name="fonction" autocomplete="organization-title" placeholder="Directeur Technique, Responsable FM…">',
            '</div>',

          '</div>',
        '</div>',

        '<div class="fxlf-step-pane" data-step="2">',
          '<div class="fxlf-step-heading">Votre organisation</div>',

          '<div class="fxlf-fields">',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-entreprise">Entreprise <span class="fxlf-req" aria-hidden="true">*</span></label>',
              '<input class="fxlf-input" type="text" id="fxlf-entreprise" name="entreprise" autocomplete="organization" placeholder="Hôtel Atlas Group" required>',
              '<span class="fxlf-field-error" id="fxlf-err-entreprise" role="alert">Ce champ est requis.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-ville">Ville <span class="fxlf-req" aria-hidden="true">*</span></label>',

              '<div class="fxlf-select-wrap">',
                '<select class="fxlf-select" id="fxlf-ville" name="ville" required>',
                  '<option value="" disabled selected>Sélectionnez votre ville…</option>',
                  cityOpts,
                '</select>',
              '</div>',

              '<span class="fxlf-field-error" id="fxlf-err-ville" role="alert">Ce champ est requis.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-secteur">Secteur d\'activité <span class="fxlf-req" aria-hidden="true">*</span></label>',

              '<div class="fxlf-select-wrap">',
                '<select class="fxlf-select" id="fxlf-secteur" name="secteur" required>',
                  sectorOpts,
                '</select>',
              '</div>',

              '<span class="fxlf-field-error" id="fxlf-err-secteur" role="alert">Ce champ est requis.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-org-type">Type d\'organisation <span class="fxlf-req" aria-hidden="true">*</span></label>',

              '<div class="fxlf-select-wrap">',
                '<select class="fxlf-select" id="fxlf-org-type" name="org_type" required>',
                  orgOpts,
                '</select>',
              '</div>',

              '<span class="fxlf-field-error" id="fxlf-err-org-type" role="alert">Ce champ est requis.</span>',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-batiments">Nombre de bâtiments ou de sites <span class="fxlf-optional" aria-hidden="true">(optionnel)</span></label>',
              '<input class="fxlf-input" type="number" id="fxlf-batiments" name="batiments" min="1" max="50" placeholder="ex. 3">',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-message">Message libre <span class="fxlf-optional" aria-hidden="true">(optionnel)</span></label>',
              '<textarea class="fxlf-textarea" id="fxlf-message" name="message" maxlength="2000" placeholder="Décrivez vos installations, vos défis actuels et vos attentes." rows="3"></textarea>',
            '</div>',

          '</div>',
        '</div>',

        '<div class="fxlf-step-pane" data-step="3">',
          '<div class="fxlf-step-heading">Votre besoin</div>',

          '<div class="fxlf-recap" id="fxlf-recap" aria-live="polite"></div>',

          '<div class="fxlf-fields">',

            '<div class="fxlf-field">',
              '<label class="fxlf-label">Ce qui vous intéresse <span style="color:rgba(255,255,255,0.3);font-size:10px;">(au moins un)</span></label>',

              '<div class="fxlf-needs-grid" id="fxlf-needs-grid" role="group" aria-label="Sélectionnez vos besoins">',
                needCards,
              '</div>',

              '<span class="fxlf-field-error" id="fxlf-err-needs" role="alert">Sélectionnez au moins un besoin.</span>',
            '</div>',

            '<div style="display:none;visibility:hidden;position:absolute;left:-9999px;" aria-hidden="true">',
              '<input type="text" name="fxlf_confirm" id="fxlf-hp" tabindex="-1" autocomplete="off" value="">',
            '</div>',

          '</div>',
        '</div>',

        '<div class="fxlf-success" id="fxlf-success" aria-live="polite" role="status">',
          '<div class="fxlf-success-icon" aria-hidden="true">✅</div>',
          '<h3 class="fxlf-success-title">Votre demande a bien été reçue</h3>',
          '<p class="fxlf-success-ref" id="fxlf-success-ref" aria-label="Référence de votre demande"></p>',
          '<p class="fxlf-success-text">L\'équipe FIXEO Entreprise examinera les informations transmises et vous recontactera pour poursuivre l\'échange.</p>',
          '<button type="button" class="fxlf-success-close" id="fxlf-success-close">Fermer</button>',
        '</div>',

      '</div>',

      '<div class="fxlf-footer" id="fxlf-footer">',

        '<div class="fxlf-footer-nav" id="fxlf-footer-nav">',
          '<button type="button" class="fxlf-btn-back" id="fxlf-btn-back" style="display:none;" aria-label="Étape précédente">← Retour</button>',
          '<button type="button" class="fxlf-btn-next" id="fxlf-btn-next">Continuer →</button>',
          '<button type="button" class="fxlf-btn-submit" id="fxlf-btn-submit" style="display:none;" disabled>Envoyer ma demande</button>',
        '</div>',

        '<p class="fxlf-trust-note">Sans engagement · Réponse sous 24h · Données confidentielles</p>',

      '</div>'

    ].join('');

    document.body.appendChild(panel);
    _bindPanelEvents(panel);
  }

  function _resetForm(panel) {
    if (!panel) return;

    _values = {};

    $$('input, select, textarea', panel).forEach(function (el) {

      if (el.type === 'checkbox') {
        el.checked = false;
      } else if (el.id === 'fxlf-hp') {
        el.value = '';
      } else if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }

    });

    _clearFieldErrors(panel);
    _hideErrorBand(panel);
  }

  function openPanel(intent, sourceCta, triggerEl) {
    _state.intent = normalizeIntent(intent);
    _state.sourceCta = String(sourceCta || '').slice(0, 100);
    _state.triggerEl = triggerEl || document.activeElement;
    _state.step = 1;
    _state.submitting = false;
    _state.submitted = false;
    _state.openedAt = Date.now();
    _state.idempotencyKey = uid();

    _buildOverlay();
    _buildPanel();

    var panel = getPanel();
    var overlay = getOverlay();

    if (!panel || !overlay) return;

    _resetForm(panel);
    _hideSuccess(panel);
    _applyIntentCopy(panel, _state.intent);
    _preselectNeeds(panel, _state.intent);
    _goToStep(1, panel);

    _state.savedScrollY =
      window.scrollY ||
      window.pageYOffset ||
      0;

    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

    document.body.style.overflow = 'hidden';

    _showMobileClose();

    setTimeout(function () {
      var first = panel.querySelector(
        '.fxlf-step-pane[data-step="1"] .fxlf-input, ' +
        '.fxlf-step-pane[data-step="1"] .fxlf-select'
      );

      if (first) first.focus();
    }, 80);

    document.addEventListener('keydown', _onKeydown);

    _track('enterprise_lead_open', {
      entry_intent: _state.intent,
      source_cta: _state.sourceCta
    });
  }

  function closePanel() {
    var panel = getPanel();
    var overlay = getOverlay();

    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }

    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }

    document.body.style.overflow = '';

    if (typeof _state.savedScrollY === 'number') {
      window.scrollTo(0, _state.savedScrollY);
    }

    _hideMobileClose();

    document.removeEventListener('keydown', _onKeydown);

    if (
      _state.triggerEl &&
      typeof _state.triggerEl.focus === 'function'
    ) {
      try {
        _state.triggerEl.focus();
      } catch (_) {}
    }
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') {
      closePanel();
    }
  }

  function _applyIntentCopy(panel, intent) {
    var copy = _intentCopy(intent);

    var titleEl = panel.querySelector('#fxlf-title');
    var subtitleEl = panel.querySelector('#fxlf-subtitle');
    var submitBtn = panel.querySelector('#fxlf-btn-submit');

    if (titleEl) {
      titleEl.textContent = copy.title;
    }

    if (subtitleEl) {
      subtitleEl.textContent = copy.subtitle;
    }

    if (submitBtn) {
      submitBtn.textContent = copy.submit;
    }
  }

  function _restoreSubmitLabel(panel) {
    var submitBtn = panel.querySelector('#fxlf-btn-submit');

    if (submitBtn) {
      submitBtn.textContent =
        _intentCopy(_state.intent).submit;
    }
  }

  function _goToStep(step, panel) {
    panel = panel || getPanel();

    if (!panel) return;

    step = Math.max(
      1,
      Math.min(TOTAL_STEPS, Number(step) || 1)
    );

    _state.step = step;

    $$('.fxlf-step-pane', panel).forEach(function (pane) {
      var paneStep =
        parseInt(pane.getAttribute('data-step'), 10);

      pane.classList.toggle(
        'active',
        paneStep === step
      );
    });

    var label =
      panel.querySelector('#fxlf-step-label');

    var fill =
      panel.querySelector('#fxlf-progress-fill');

    var pct =
      Math.round((step / TOTAL_STEPS) * 100);

    if (label) {
      label.textContent =
        'Étape ' + step + ' sur ' + TOTAL_STEPS;
    }

    if (fill) {
      fill.style.width = pct + '%';
    }

    var backBtn =
      panel.querySelector('#fxlf-btn-back');

    var nextBtn =
      panel.querySelector('#fxlf-btn-next');

    var submitBtn =
      panel.querySelector('#fxlf-btn-submit');

    if (backBtn) {
      backBtn.style.display =
        step > 1 ? '' : 'none';
    }

    if (step < TOTAL_STEPS) {

      if (nextBtn) {
        nextBtn.style.display = '';
      }

      if (submitBtn) {
        submitBtn.style.display = 'none';
      }

    } else {

      if (nextBtn) {
        nextBtn.style.display = 'none';
      }

      if (submitBtn) {
        submitBtn.style.display = '';
        submitBtn.disabled = false;
        _restoreSubmitLabel(panel);
      }
    }

    if (step === 3) {
      _updateRecap(panel);
    }

    var body =
      panel.querySelector('#fxlf-body');

    if (body) {
      body.scrollTop = 0;
    }

    _hideErrorBand(panel);

    setTimeout(function () {

      var pane =
        panel.querySelector(
          '.fxlf-step-pane[data-step="' +
          step +
          '"]'
        );

      if (!pane) return;

      var focusable =
        pane.querySelector(
          'input:not([type="checkbox"]):not([tabindex="-1"]), select, textarea, .fxlf-need-card'
        );

      if (focusable) {
        focusable.focus();
      }

    }, 60);

    _track('enterprise_lead_step', {
      step_number: step,
      entry_intent: _state.intent
    });
  }

  function _preselectNeeds(panel, intent) {
    panel = panel || getPanel();

    if (!panel) return;

    var grid =
      panel.querySelector('#fxlf-needs-grid');

    if (!grid) return;

    $$('.fxlf-need-card', grid)
      .forEach(function (card) {

        card.classList.remove('selected');
        card.setAttribute(
          'aria-checked',
          'false'
        );

        var cb =
          card.querySelector(
            'input[type="checkbox"]'
          );

        if (cb) {
          cb.checked = false;
        }

      });

    if (intent === 'demo') {

      var demoCard =
        grid.querySelector(
          '[data-value="demonstration"]'
        );

      if (demoCard) {

        demoCard.classList.add('selected');

        demoCard.setAttribute(
          'aria-checked',
          'true'
        );

        var demoCb =
          demoCard.querySelector(
            'input[type="checkbox"]'
          );

        if (demoCb) {
          demoCb.checked = true;
        }
      }
    }
  }

  function _saveValues(panel) {
    panel = panel || getPanel();

    if (!panel) return;

    var ids = [
      'fxlf-prenom',
      'fxlf-nom',
      'fxlf-entreprise',
      'fxlf-fonction',
      'fxlf-telephone',
      'fxlf-email',
      'fxlf-ville',
      'fxlf-secteur',
      'fxlf-org-type',
      'fxlf-batiments',
      'fxlf-message'
    ];

    ids.forEach(function (id) {

      var el =
        panel.querySelector('#' + id);

      if (el) {
        _values[id] = el.value;
      }

    });
  }

  function _updateRecap(panel) {
    panel = panel || getPanel();

    if (!panel) return;

    var recap =
      panel.querySelector('#fxlf-recap');

    if (!recap) return;

    var prenom =
      (_values['fxlf-prenom'] || '').trim();

    var nom =
      (_values['fxlf-nom'] || '').trim();

    var entreprise =
      (_values['fxlf-entreprise'] || '').trim();

    var ville =
      (_values['fxlf-ville'] || '').trim();

    var secteur =
      (_values['fxlf-secteur'] || '').trim();

    var sectorLabel = '';

    SECTORS.forEach(function (s) {
      if (s.value === secteur) {
        sectorLabel = s.label;
      }
    });

    var parts = [];

    var fullName =
      (prenom + ' ' + nom).trim();

    if (fullName) {
      parts.push(
        '<strong>' +
        esc(fullName) +
        '</strong>'
      );
    }

    if (entreprise) {
      parts.push(esc(entreprise));
    }

    if (ville) {
      parts.push(esc(ville));
    }

    if (sectorLabel) {
      parts.push(esc(sectorLabel));
    }

    recap.innerHTML =
      parts.length
        ? 'Vous êtes : ' + parts.join(' · ')
        : 'Complétez les étapes précédentes pour personnaliser votre demande.';
  }

  function _validateStep(step, panel) {
    panel = panel || getPanel();

    if (!panel) {
      return ['panel'];
    }

    var errors = [];

    _clearFieldErrors(panel);

    if (step === 1) {

      var fields = [
        {
          id: 'fxlf-prenom',
          errId: 'fxlf-err-prenom',
          msg: 'Le prénom est requis.'
        },
        {
          id: 'fxlf-nom',
          errId: 'fxlf-err-nom',
          msg: 'Le nom est requis.'
        },
        {
          id: 'fxlf-telephone',
          errId: 'fxlf-err-telephone',
          msg: 'Le téléphone est requis.'
        },
        {
          id: 'fxlf-email',
          errId: 'fxlf-err-email',
          msg: 'L\'email professionnel est requis.'
        }
      ];

      fields.forEach(function (f) {

        var el =
          panel.querySelector('#' + f.id);

        if (!el) return;

        if (!el.value.trim()) {

          _showFieldError(
            panel,
            f.id,
            f.errId,
            f.msg
          );

          errors.push(f.id);
        }
      });

      var emailEl =
        panel.querySelector('#fxlf-email');

      if (
        emailEl &&
        emailEl.value.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
          emailEl.value.trim()
        )
      ) {

        _showFieldError(
          panel,
          'fxlf-email',
          'fxlf-err-email',
          'Format d\'email invalide.'
        );

        if (
          errors.indexOf('fxlf-email') < 0
        ) {
          errors.push('fxlf-email');
        }
      }
    }

    if (step === 2) {

      var fields2 = [
        {
          id: 'fxlf-entreprise',
          errId: 'fxlf-err-entreprise',
          msg: 'Le nom de l\'entreprise est requis.'
        },
        {
          id: 'fxlf-ville',
          errId: 'fxlf-err-ville',
          msg: 'La ville est requise.'
        },
        {
          id: 'fxlf-secteur',
          errId: 'fxlf-err-secteur',
          msg: 'Le secteur d\'activité est requis.'
        },
        {
          id: 'fxlf-org-type',
          errId: 'fxlf-err-org-type',
          msg: 'Le type d\'organisation est requis.'
        }
      ];

      fields2.forEach(function (f) {

        var el =
          panel.querySelector('#' + f.id);

        if (!el) return;

        var val =
          el.value && el.value.trim
            ? el.value.trim()
            : el.value;

        if (!val) {

          _showFieldError(
            panel,
            f.id,
            f.errId,
            f.msg
          );

          errors.push(f.id);
        }
      });

      var buildingsEl =
        panel.querySelector('#fxlf-batiments');

      if (
        buildingsEl &&
        buildingsEl.value
      ) {

        var buildingCount =
          Number(buildingsEl.value);

        if (
          !Number.isInteger(buildingCount) ||
          buildingCount < 1 ||
          buildingCount > 50
        ) {

          buildingsEl.classList.add(
            'invalid'
          );

          _showErrorBand(
            panel,
            'Le nombre de bâtiments ou de sites doit être compris entre 1 et 50.'
          );

          errors.push(
            'fxlf-batiments'
          );
        }
      }
    }

    if (step === 3) {

      if (
        _getCheckedNeeds(panel).length === 0
      ) {

        var errEl =
          panel.querySelector(
            '#fxlf-err-needs'
          );

        if (errEl) {
          errEl.classList.add('visible');
        }

        errors.push('needs');
      }
    }

    return errors;
  }

  function _showFieldError(
    panel,
    fieldId,
    errId,
    msg
  ) {

    var el =
      panel.querySelector(
        '#' + fieldId
      );

    var errEl =
      panel.querySelector(
        '#' + errId
      );

    if (el) {
      el.classList.add('invalid');
    }

    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add('visible');
    }
  }

  function _clearFieldErrors(panel) {

    $$(
      '.fxlf-input.invalid, .fxlf-select.invalid, .fxlf-textarea.invalid',
      panel
    ).forEach(function (el) {

      el.classList.remove('invalid');

    });

    $$(
      '.fxlf-field-error.visible',
      panel
    ).forEach(function (el) {

      el.classList.remove('visible');

    });
  }

  function _getCheckedNeeds(panel) {

    return $$(
      '.fxlf-need-card.selected',
      panel
    ).map(function (card) {

      return (
        card.getAttribute(
          'data-value'
        ) || ''
      );

    }).filter(Boolean);
  }

  function _showErrorBand(panel, msg) {

    var band =
      panel.querySelector(
        '#fxlf-error-band'
      );

    if (!band) return;

    band.textContent = msg;

    band.classList.add(
      'visible'
    );

    band.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  function _hideErrorBand(panel) {

    var band =
      panel.querySelector(
        '#fxlf-error-band'
      );

    if (band) {
      band.classList.remove('visible');
      band.textContent = '';
    }
  }

  function _showSuccess(panel, ref) {

    var footer =
      panel.querySelector(
        '#fxlf-footer'
      );

    var progress =
      panel.querySelector(
        '.fxlf-progress'
      );

    var errBand =
      panel.querySelector(
        '#fxlf-error-band'
      );

    $$(
      '.fxlf-step-pane',
      panel
    ).forEach(function (p) {

      p.classList.remove('active');

    });

    if (footer) {
      footer.style.display = 'none';
    }

    if (progress) {
      progress.style.display = 'none';
    }

    if (errBand) {
      errBand.classList.remove('visible');
    }

    var success =
      panel.querySelector(
        '#fxlf-success'
      );

    if (success) {

      success.classList.add('active');

      var refEl =
        panel.querySelector(
          '#fxlf-success-ref'
        );

      if (refEl) {

        if (
          ref &&
          ref !== 'submitted'
        ) {

          refEl.textContent =
            'Référence : ' +
            String(ref).slice(0, 16);

          refEl.style.display = '';

        } else {

          refEl.textContent = '';
          refEl.style.display = 'none';

        }
      }

      setTimeout(function () {

        var closeBtn =
          panel.querySelector(
            '#fxlf-success-close'
          );

        if (closeBtn) {
          closeBtn.focus();
        }

      }, 80);
    }

    _track(
      'enterprise_lead_success',
      {
        entry_intent: _state.intent,
        source_cta: _state.sourceCta
      }
    );
  }

  function _hideSuccess(panel) {

    var success =
      panel.querySelector(
        '#fxlf-success'
      );

    var footer =
      panel.querySelector(
        '#fxlf-footer'
      );

    var progress =
      panel.querySelector(
        '.fxlf-progress'
      );

    if (success) {
      success.classList.remove('active');
    }

    if (footer) {
      footer.style.display = '';
    }

    if (progress) {
      progress.style.display = '';
    }
  }

  function _collectPayload(panel) {

    var needs =
      _getCheckedNeeds(panel);

    var prenom =
      (
        panel.querySelector(
          '#fxlf-prenom'
        ) || { value: '' }
      ).value.trim();

    var nom =
      (
        panel.querySelector(
          '#fxlf-nom'
        ) || { value: '' }
      ).value.trim();

    var entreprise =
      (
        panel.querySelector(
          '#fxlf-entreprise'
        ) || { value: '' }
      ).value.trim();

    var fonction =
      (
        panel.querySelector(
          '#fxlf-fonction'
        ) || { value: '' }
      ).value.trim();

    var telephone =
      (
        panel.querySelector(
          '#fxlf-telephone'
        ) || { value: '' }
      ).value.trim();

    var email =
      (
        panel.querySelector(
          '#fxlf-email'
        ) || { value: '' }
      ).value
        .trim()
        .toLowerCase();

    var ville =
      (
        panel.querySelector(
          '#fxlf-ville'
        ) || { value: '' }
      ).value;

    var secteur =
      (
        panel.querySelector(
          '#fxlf-secteur'
        ) || { value: '' }
      ).value;

    var orgType =
      (
        panel.querySelector(
          '#fxlf-org-type'
        ) || { value: '' }
      ).value;

    var batiments =
      (
        panel.querySelector(
          '#fxlf-batiments'
        ) || { value: '' }
      ).value.trim();

    var message =
      (
        panel.querySelector(
          '#fxlf-message'
        ) || { value: '' }
      ).value
        .trim()
        .slice(0, 2000);

    var needsStr =
      needs.join(', ');

    return {

      entry_intent:
        _state.intent,

      source_cta:
        _state.sourceCta,

      prenom:
        prenom,

      nom:
        nom,

      entreprise:
        entreprise,

      telephone:
        telephone,

      email:
        email,

      city:
        ville,

      business_sector:
        secteur,

      organisation_type:
        orgType,

      building_or_site_count:
        batiments,

      role:
        fonction,

      selected_needs:
        needsStr,

      message:
        message,

      ville:
        ville,

      secteur:
        secteur,

      org_type:
        orgType,

      fonction:
        fonction || 'Non précisé',

      batiments:
        batiments,

      needs:
        needsStr,

      source:
        'enterprise',

      mode:
        'enterprise',

      page:
        window.location.pathname,

      referrer:
        (
          document.referrer || ''
        ).slice(0, 200),

      idempotency:
        _state.idempotencyKey,

      submitted_at:
        new Date().toISOString()
    };
  }

  function _submitToApi(payload) {

    return fetch(
      API_ENDPOINT,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(payload)
      }
    )
    .then(function (res) {

      return res.json()
        .then(function (data) {

          return {
            ok: res.ok,
            data: data
          };

        })
        .catch(function () {

          return {
            ok: res.ok,
            data: {}
          };

        });
    })
    .catch(function () {

      return {
        ok: false,
        data: {}
      };

    });
  }

  function _buildMailtoHref(payload) {

    var bodyLines = [

      'Intention : ' +
        (payload.entry_intent || ''),

      'Prénom : ' +
        (payload.prenom || ''),

      'Nom : ' +
        (payload.nom || ''),

      'Entreprise : ' +
        (payload.entreprise || ''),

      'Fonction : ' +
        (
          payload.role ||
          payload.fonction ||
          '—'
        ),

      'Téléphone : ' +
        (payload.telephone || ''),

      'Email : ' +
        (payload.email || ''),

      'Ville : ' +
        (
          payload.city ||
          payload.ville ||
          ''
        ),

      'Secteur : ' +
        (
          payload.business_sector ||
          payload.secteur ||
          ''
        ),

      'Type d\'organisation : ' +
        (
          payload.organisation_type ||
          payload.org_type ||
          ''
        ),

      'Bâtiments/sites : ' +
        (
          payload.building_or_site_count ||
          payload.batiments ||
          '—'
        ),

      'Besoins : ' +
        (
          payload.selected_needs ||
          payload.needs ||
          '—'
        ),

      '',

      'Message :',

      payload.message || '—',

      '',

      '—',

      'Envoyé depuis : ' +
        (
          payload.page ||
          window.location.pathname
        )

    ].join('\n');

    var subject =
      encodeURIComponent(
        'Demande Enterprise – ' +
        (payload.entreprise || '') +
        ' / ' +
        (
          payload.city ||
          payload.ville ||
          ''
        )
      );

    return (
      'mailto:enterprise@fixeo.ma?subject=' +
      subject +
      '&body=' +
      encodeURIComponent(bodyLines)
    );
  }

  function _showFallbackInPanel(
    panel,
    mailtoHref
  ) {

    var band =
      panel.querySelector(
        '#fxlf-error-band'
      );

    if (!band) return;

    band.textContent =
      'Notre serveur est temporairement indisponible. Vous pouvez nous envoyer votre demande directement par email : ';

    var link =
      document.createElement('a');

    link.href = mailtoHref;

    link.textContent =
      'Ouvrir le brouillon email';

    link.style.color =
      'rgb(130,155,255)';

    link.style.textDecoration =
      'underline';

    link.style.whiteSpace =
      'nowrap';

    link.target = '_blank';
    link.rel = 'noopener';

    band.appendChild(link);

    band.classList.add(
      'visible'
    );

    band.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  function _handleSubmit(panel) {

    if (
      _state.submitting ||
      _state.submitted
    ) {
      return;
    }

    if (
      Date.now() -
      _state.openedAt <
      2000
    ) {

      _showErrorBand(
        panel,
        'Veuillez patienter quelques instants avant d\'envoyer.'
      );

      return;
    }

    var hp =
      panel.querySelector(
        '#fxlf-hp'
      );

    if (
      hp &&
      hp.value
    ) {

      _state.submitted = true;

      _showSuccess(
        panel,
        'submitted'
      );

      return;
    }

    var errors =
      _validateStep(
        3,
        panel
      );

    if (
      errors.length > 0
    ) {

      var firstErr =
        panel.querySelector(
          '.fxlf-field-error.visible, .invalid'
        );

      if (firstErr) {

        firstErr.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });

      }

      return;
    }

    _saveValues(panel);

    var payload =
      _collectPayload(panel);

    _state.submitting = true;

    var submitBtn =
      panel.querySelector(
        '#fxlf-btn-submit'
      );

    if (submitBtn) {

      submitBtn.disabled = true;

      submitBtn.textContent =
        'Envoi de votre demande…';

    }

    _track(
      'enterprise_lead_submit',
      {
        entry_intent:
          _state.intent,

        source_cta:
          _state.sourceCta
      }
    );

    _submitToApi(payload)
      .then(function (result) {

        _state.submitting = false;

        if (
          result.ok &&
          result.data &&
          result.data.ok
        ) {

          _state.submitted = true;

          var ref =
            result.data.ref || null;

          _showSuccess(
            panel,
            ref
          );

          return;
        }

        if (submitBtn) {
          submitBtn.disabled = false;
        }

        _restoreSubmitLabel(panel);

        var mailtoHref =
          _buildMailtoHref(payload);

        _showFallbackInPanel(
          panel,
          mailtoHref
        );

        _track(
          'enterprise_lead_fallback',
          {
            entry_intent:
              _state.intent
          }
        );

      });
  }

  function _bindPanelEvents(panel) {

    var closeBtn =
      panel.querySelector(
        '#fxlf-close'
      );

    if (closeBtn) {

      closeBtn.addEventListener(
        'click',
        closePanel
      );

    }

    panel.addEventListener(
      'click',
      function (e) {

        if (
          e.target &&
          e.target.id ===
            'fxlf-success-close'
        ) {

          closePanel();

        }

      }
    );

    var backBtn =
      panel.querySelector(
        '#fxlf-btn-back'
      );

    if (backBtn) {

      backBtn.addEventListener(
        'click',
        function () {

          _saveValues(panel);

          _goToStep(
            _state.step - 1,
            panel
          );

        }
      );

    }

    var nextBtn =
      panel.querySelector(
        '#fxlf-btn-next'
      );

    if (nextBtn) {

      nextBtn.addEventListener(
        'click',
        function () {

          var errors =
            _validateStep(
              _state.step,
              panel
            );

          if (
            errors.length > 0
          ) {

            var firstErr =
              panel.querySelector(
                '.fxlf-field-error.visible, .invalid'
              );

            if (firstErr) {

              firstErr.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
              });

            }

            return;
          }

          _saveValues(panel);

          _goToStep(
            _state.step + 1,
            panel
          );

        }
      );

    }

    var submitBtn =
      panel.querySelector(
        '#fxlf-btn-submit'
      );

    if (submitBtn) {

      submitBtn.addEventListener(
        'click',
        function () {

          _handleSubmit(panel);

        }
      );

    }

    var grid =
      panel.querySelector(
        '#fxlf-needs-grid'
      );

    if (grid) {

      grid.addEventListener(
        'click',
        function (e) {

          var card =
            e.target.closest(
              '.fxlf-need-card'
            );

          if (!card) return;

          var isSelected =
            card.classList.contains(
              'selected'
            );

          card.classList.toggle(
            'selected',
            !isSelected
          );

          card.setAttribute(
            'aria-checked',
            String(!isSelected)
          );

          var cb =
            card.querySelector(
              'input[type="checkbox"]'
            );

          if (cb) {
            cb.checked = !isSelected;
          }

          var errEl =
            panel.querySelector(
              '#fxlf-err-needs'
            );

          if (
            errEl &&
            _getCheckedNeeds(panel)
              .length > 0
          ) {

            errEl.classList.remove(
              'visible'
            );

          }

        }
      );

      grid.addEventListener(
        'keydown',
        function (e) {

          if (
            e.key !== ' ' &&
            e.key !== 'Enter'
          ) {
            return;
          }

          var card =
            e.target.closest(
              '.fxlf-need-card'
            );

          if (!card) return;

          e.preventDefault();

          card.click();

        }
      );
    }

    panel.addEventListener(
      'input',
      function (e) {

        var el = e.target;

        if (
          !el ||
          !el.classList ||
          !el.classList.contains(
            'invalid'
          )
        ) {
          return;
        }

        el.classList.remove(
          'invalid'
        );

        var errId =
          'fxlf-err-' +
          (el.id || '')
            .replace('fxlf-', '');

        var errEl =
          panel.querySelector(
            '#' + errId
          );

        if (errEl) {
          errEl.classList.remove(
            'visible'
          );
        }

      }
    );

    panel.addEventListener(
      'change',
      function (e) {

        var el = e.target;

        if (
          !el ||
          !el.classList ||
          !el.classList.contains(
            'invalid'
          )
        ) {
          return;
        }

        el.classList.remove(
          'invalid'
        );

        var errId =
          'fxlf-err-' +
          (el.id || '')
            .replace('fxlf-', '');

        var errEl =
          panel.querySelector(
            '#' + errId
          );

        if (errEl) {
          errEl.classList.remove(
            'visible'
          );
        }

      }
    );

    panel.addEventListener(
      'keydown',
      function (e) {

        if (
          e.key !== 'Enter'
        ) {
          return;
        }

        var tag =
          e.target.tagName
            .toLowerCase();

        if (
          tag === 'textarea' ||
          e.target.closest(
            '.fxlf-need-card'
          )
        ) {
          return;
        }

        if (
          (
            tag === 'input' ||
            tag === 'select'
          ) &&
          _state.step <
            TOTAL_STEPS
        ) {

          e.preventDefault();

          var nextBtn2 =
            panel.querySelector(
              '#fxlf-btn-next'
            );

          if (nextBtn2) {
            nextBtn2.click();
          }

        }

      }
    );
  }

  function _bindTriggers() {

    document.addEventListener(
      'click',
      function (e) {

        var el =
          e.target.closest(
            '[data-lead-intent]'
          );

        if (!el) return;

        e.preventDefault();

        var intent =
          normalizeIntent(
            el.getAttribute(
              'data-lead-intent'
            )
          );

        var sourceCta =
          el.getAttribute(
            'data-source-cta'
          ) || '';

        openPanel(
          intent,
          sourceCta,
          el
        );

      }
    );
  }

  function _patchV1Compatibility() {
    /*
     * V1 remains untouched.
     * V2 buttons use data-lead-intent.
     */
  }

  function init() {

    _buildOverlay();
    _buildPanel();
    _bindTriggers();
    _patchV1Compatibility();

  }

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );

  } else {

    init();

  }

  window.FixeoLeadFlowV2 = {
    VERSION: VERSION,
    open: openPanel,
    close: closePanel
  };

})();
