/**
 * FIXEO Enterprise Lead Flow V2 — fixeo-enterprise-lead-v2.js
 * Version: fxlf-v2a — 2026-08-03
 *
 * ─────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────
 * Standalone IIFE. Zero dependencies.
 * Builds one shared lead flow panel with two contextual entry intentions:
 *   entry_intent = "demo"    → Planifier une démonstration
 *   entry_intent = "contact" → Échanger avec l'équipe Entreprise
 *
 * THREE STEPS:
 *   Step 1 — Votre contact       (Prénom*, Nom*, Téléphone*, Email*, Fonction optional)
 *   Step 2 — Votre organisation  (Entreprise*, Ville*, Secteur*, Type*, Bâtiments optional, Message optional)
 *   Step 3 — Votre besoin        (selectable need cards + recap)
 *
 * INTENT-SPECIFIC NEED PRESELECTION:
 *   demo    → "Démonstration" pre-selected only; visitor may add others
 *   contact → nothing pre-selected; visitor chooses freely
 *
 * Version: fxlf-v2b — 2026-08-03
 *
 * SUBMISSION:
 *   POST /api/enterprise-contact (Vercel serverless fn, service_role)
 *   Fallback: mailto: with pre-filled body
 *
 * PROTECTION:
 *   - Honeypot field
 *   - Submit-once lock (duplicate tap protection)
 *   - Minimum fill time (< 3 seconds rejected)
 *   - Idempotency key per panel open
 *
 * ANALYTICS:
 *   Uses existing window.fixeoTrack() wrapper only.
 *   Never sends PII.
 *   Never calls gtag directly.
 *
 * NEVER TOUCHES:
 *   - request-form.js / fixeo-request-modal-v2.js
 *   - fixeo-urgent-modal-v3.js / fixeo-express-route-shim.js
 *   - #request-modal / fem-* namespace
 *   - fixeo-enterprise-modal-v1.js (V1 — left in place for backward compat)
 *   - RAFI / artisan dashboards / admin surfaces
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window._fxLeadFlowV2Loaded) return;
  window._fxLeadFlowV2Loaded = true;

  var VERSION = 'fxlf-v2a';
  var PANEL_ID = 'fxlf-panel';
  var OVERLAY_ID = 'fxlf-overlay';
  var MOBILE_CLOSE_ID = 'fxlf-mobile-close';
  var API_ENDPOINT = '/api/enterprise-contact';
  var TOTAL_STEPS = 3;

  /* ── State ── */
  var _state = {
    intent: 'demo',       /* demo | contact */
    sourceCta: '',        /* data-source-cta value */
    step: 1,             /* 1..3 */
    submitting: false,
    submitted: false,
    openedAt: 0,
    idempotencyKey: '',
    triggerEl: null
  };

  /* ── Preserved values across steps ── */
  var _values = {};

  /* ── Data ── */
  var CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia','Autre'
  ];

  var SECTORS = [
    { value: 'hotellerie',       label: 'Hôtellerie' },
    { value: 'restauration',     label: 'Restauration & Café' },
    { value: 'commerce_retail',  label: 'Commerce & Retail' },
    { value: 'centre_commercial',label: 'Centre commercial' },
    { value: 'bureaux',          label: 'Bureaux & Siège social' },
    { value: 'banque_finance',   label: 'Banque & Finance' },
    { value: 'education',        label: 'Éducation' },
    { value: 'clinique_sante',   label: 'Clinique & Santé' },
    { value: 'industrie',        label: 'Industrie & Logistique' },
    { value: 'immobilier',       label: 'Immobilier résidentiel' },
    { value: 'syndic',           label: 'Syndic & Gérance' },
    { value: 'autre',            label: 'Autre' }
  ];

  var ORG_TYPES = [
    { value: 'entreprise',        label: 'Entreprise privée' },
    { value: 'groupe',            label: 'Groupe multi-sites' },
    { value: 'etablissement',     label: 'Établissement unique' },
    { value: 'syndic_gerance',    label: 'Syndic / Gérance' },
    { value: 'organisme_public',  label: 'Organisme public' },
    { value: 'association',       label: 'Association' },
    { value: 'autre',             label: 'Autre' }
  ];

  var NEEDS = [
    { value: 'interventions_ponctuelles', label: '🔧 Interventions ponctuelles',   icon: '🔧' },
    { value: 'contrat_maintenance',       label: '🛡️ Contrat de maintenance',       icon: '🛡️' },
    { value: 'facility_management',       label: '🏗️ Facility Management complet',  icon: '🏗️' },
    { value: 'multi_sites',               label: '🏢 Gestion multi-sites',           icon: '🏢' },
    { value: 'urgences',                  label: '⚡ Urgences 24h/24',              icon: '⚡' },
    { value: 'demonstration',             label: '📊 Démonstration de la solution',  icon: '📊' },
    { value: 'autre_besoin',              label: '💬 Autre besoin',                  icon: '💬' }
  ];

  /* ── Helpers ── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
  function getPanel() { return document.getElementById(PANEL_ID); }
  function getOverlay() { return document.getElementById(OVERLAY_ID); }
  function getMobileClose() { return document.getElementById(MOBILE_CLOSE_ID); }

  /* ── Analytics (safe, no PII) ── */
  function _track(event, props) {
    try {
      if (typeof window.fixeoTrack === 'function') {
        window.fixeoTrack(event, props);
      }
    } catch (_) { /* silently ignore */ }
  }

  /* ── Build the overlay ── */
  function _buildOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.className = 'fxlf-overlay';
    ov.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ov);
    ov.addEventListener('click', closePanel);
  }

  /* ── Build the mobile-level close button ──────────────────────────────────
   * On mobile the global FIXEO navbar has z-index:1200 and occupies the top
   * ~70px of the viewport. The close button inside #fxlf-panel (z-index:490)
   * cannot escape that parent stacking context, so even z-index:999 on the
   * button loses to the navbar. Solution: inject the mobile close button as a
   * DIRECT CHILD OF document.body — outside any stacking context — and give
   * it z-index:1300. It is hidden by default and shown/hidden by JS when the
   * panel opens/closes. The in-panel #fxlf-close is hidden on mobile via CSS.
   * ─────────────────────────────────────────────────────────────────────── */
  function _buildMobileClose() {
    if (document.getElementById(MOBILE_CLOSE_ID)) return;
    var btn = document.createElement('button');
    btn.id = MOBILE_CLOSE_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Fermer le formulaire');
    btn.textContent = '×';
    // Hidden initially; shown by _showMobileClose when panel opens
    btn.style.display = 'none';
    document.body.appendChild(btn);
    btn.addEventListener('click', closePanel);
  }

  function _showMobileClose() {
    // Only activate on mobile-width viewports (≤640px)
    if (window.innerWidth > 640) return;
    _buildMobileClose();
    var btn = getMobileClose();
    if (btn) {
      btn.style.display = '';  // CSS class controls actual display/position
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

  /* ── Build the panel ── */
  function _buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var cityOpts = CITIES.map(function(c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');

    var sectorOpts = '<option value="" disabled selected>Sélectionnez votre secteur…</option>' +
      SECTORS.map(function(s) {
        return '<option value="' + esc(s.value) + '">' + esc(s.label) + '</option>';
      }).join('');

    var orgOpts = '<option value="" disabled selected>Sélectionnez le type…</option>' +
      ORG_TYPES.map(function(o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
      }).join('');

    var needCards = NEEDS.map(function(n) {
      return [
        '<label class="fxlf-need-card" data-value="' + esc(n.value) + '" tabindex="0" role="checkbox" aria-checked="false">',
          '<input type="checkbox" class="fxlf-hp" name="need_' + esc(n.value) + '" value="' + esc(n.value) + '" tabindex="-1" aria-hidden="true">',
          '<span class="fxlf-need-check" aria-hidden="true">✓</span>',
          '<span class="fxlf-need-label">' + esc(n.label) + '</span>',
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

    panel.innerHTML = [
      /* ── Header ── */
      '<div class="fxlf-header">',
        '<div class="fxlf-header-eyebrow" id="fxlf-eyebrow">Enterprise</div>',
        '<h2 class="fxlf-title" id="fxlf-title">Planifier une démonstration</h2>',
        '<p class="fxlf-subtitle" id="fxlf-subtitle">Présentez-nous votre organisation. Notre équipe préparera une démonstration adaptée à vos besoins.</p>',
        '<button class="fxlf-close" type="button" id="fxlf-close" aria-label="Fermer le formulaire">×</button>',
      '</div>',

      /* ── Progress ── */
      '<div class="fxlf-progress" aria-hidden="true">',
        '<span class="fxlf-progress-label" id="fxlf-step-label">Étape 1 sur 3</span>',
        '<div class="fxlf-progress-track">',
          '<div class="fxlf-progress-fill" id="fxlf-progress-fill" style="width:33%"></div>',
        '</div>',
      '</div>',

      /* ── Error band ── */
      '<div class="fxlf-error-band" id="fxlf-error-band" role="alert" aria-live="polite"></div>',

      /* ── Body ── */
      '<div class="fxlf-body" id="fxlf-body">',

        /* ── STEP 1 — Contact ── */
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

        /* ── STEP 2 — Organisation ── */
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
              '<input class="fxlf-input" type="number" id="fxlf-batiments" name="batiments" min="1" max="9999" placeholder="ex. 3">',
            '</div>',

            '<div class="fxlf-field">',
              '<label class="fxlf-label" for="fxlf-message">Message libre <span class="fxlf-optional" aria-hidden="true">(optionnel)</span></label>',
              '<textarea class="fxlf-textarea" id="fxlf-message" name="message" placeholder="Décrivez vos installations, vos défis actuels et vos attentes." rows="3"></textarea>',
            '</div>',

          '</div>',
        '</div>',

        /* ── STEP 3 — Besoin ── */
        '<div class="fxlf-step-pane" data-step="3">',
          '<div class="fxlf-step-heading">Votre besoin</div>',

          /* Recap */
          '<div class="fxlf-recap" id="fxlf-recap" aria-live="polite"></div>',

          /* Need cards */
          '<div class="fxlf-fields">',
            '<div class="fxlf-field">',
              '<label class="fxlf-label">Ce qui vous intéresse <span style="color:rgba(255,255,255,0.3);font-size:10px;">(au moins un)</span></label>',
              '<div class="fxlf-needs-grid" id="fxlf-needs-grid" role="group" aria-label="Sélectionnez vos besoins">',
                needCards,
              '</div>',
              '<span class="fxlf-field-error" id="fxlf-err-needs" role="alert">Sélectionnez au moins un besoin.</span>',
            '</div>',

            /* Honeypot — never visible to real users */
            '<div style="display:none;visibility:hidden;position:absolute;left:-9999px;" aria-hidden="true">',
              '<input type="text" name="fxlf_confirm" id="fxlf-hp" tabindex="-1" autocomplete="off" value="">',
            '</div>',

          '</div>',
        '</div>',

        /* ── Success state (replaces steps when active) ── */
        '<div class="fxlf-success" id="fxlf-success" aria-live="polite" role="status">',
          '<div class="fxlf-success-icon" aria-hidden="true">✅</div>',
          '<h3 class="fxlf-success-title">Votre demande a bien été reçue</h3>',
          '<p class="fxlf-success-ref" id="fxlf-success-ref" aria-label="Référence de votre demande"></p>',
          '<p class="fxlf-success-text">',
            'L\'équipe FIXEO Entreprise examinera les informations transmises et vous recontactera pour poursuivre l\'échange.',
          '</p>',
          '<button type="button" class="fxlf-success-close" id="fxlf-success-close">Fermer</button>',
        '</div>',

      '</div>', /* /fxlf-body */

      /* ── Footer ── */
      '<div class="fxlf-footer" id="fxlf-footer">',
        '<div class="fxlf-footer-nav" id="fxlf-footer-nav">',
          '<button type="button" class="fxlf-btn-back" id="fxlf-btn-back" style="display:none;" aria-label="Étape précédente">',
            '← Retour',
          '</button>',
          '<button type="button" class="fxlf-btn-next" id="fxlf-btn-next">',
            'Continuer →',
          '</button>',
          '<button type="button" class="fxlf-btn-submit" id="fxlf-btn-submit" style="display:none;" disabled>',
            'Envoyer ma demande',
          '</button>',
        '</div>',
        '<p class="fxlf-trust-note">Sans engagement · Réponse sous 24h · Données confidentielles</p>',
      '</div>'

    ].join('');

    document.body.appendChild(panel);
    _bindPanelEvents(panel);
  }

  /* ── Open ── */
  function openPanel(intent, sourceCta, triggerEl) {
    _state.intent     = intent || 'demo';
    _state.sourceCta  = sourceCta || '';
    _state.triggerEl  = triggerEl || document.activeElement;
    _state.step       = 1;
    _state.submitting = false;
    _state.submitted  = false;
    _state.openedAt   = Date.now();
    _state.idempotencyKey = uid();

    _buildOverlay();
    _buildPanel();

    var panel = getPanel();
    var overlay = getOverlay();
    if (!panel) return;

    /* Update title/subtitle from intent */
    _applyIntentCopy(panel, _state.intent);

    /* Reset to step 1 */
    _goToStep(1, panel);

    /* Reset success state */
    _hideSuccess(panel);

    /* Reset error band */
    _hideErrorBand(panel);

    /* Restore any preserved values */
    _restoreValues(panel);

    /* Pre-select demo need if intent=demo */
    _preselectNeeds(panel, _state.intent);

    /* Save page scroll position — restores on close (prevents iOS Safari scroll-to-top) */
    _state.savedScrollY = window.scrollY || window.pageYOffset || 0;

    /* Show panel + overlay */
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    /* Show the body-level mobile close button (outside panel stacking context) */
    _showMobileClose();

    /* Focus first field */
    setTimeout(function () {
      var first = panel.querySelector('.fxlf-input, .fxlf-select');
      if (first) first.focus();
    }, 80);

    document.addEventListener('keydown', _onKeydown);

    _track('enterprise_lead_open', {
      entry_intent: _state.intent,
      source_cta: _state.sourceCta
    });
  }

  /* ── Close ── */
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
    /* Restore page scroll position (iOS Safari sets it to 0 when body overflow is hidden) */
    if (typeof _state.savedScrollY === 'number') {
      window.scrollTo(0, _state.savedScrollY);
    }
    /* Hide the body-level mobile close button */
    _hideMobileClose();
    document.removeEventListener('keydown', _onKeydown);

    /* Return focus */
    if (_state.triggerEl && typeof _state.triggerEl.focus === 'function') {
      try { _state.triggerEl.focus(); } catch (_) { /* ignore */ }
    }
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') closePanel();
  }

  /* ── Apply intent-specific copy ── */
  function _applyIntentCopy(panel, intent) {
    var titleEl    = panel.querySelector('#fxlf-title');
    var subtitleEl = panel.querySelector('#fxlf-subtitle');
    var submitBtn  = panel.querySelector('#fxlf-btn-submit');

    if (intent === 'demo') {
      if (titleEl)    titleEl.textContent = 'Planifier une démonstration';
      if (subtitleEl) subtitleEl.textContent = 'Présentez-nous votre organisation. Notre équipe préparera une démonstration adaptée à vos besoins.';
      if (submitBtn)  submitBtn.textContent = 'Envoyer ma demande de démonstration';
    } else {
      if (titleEl)    titleEl.textContent = 'Échanger avec l\'équipe Entreprise';
      if (subtitleEl) subtitleEl.textContent = 'Expliquez-nous votre besoin. Notre équipe vous recontactera pour étudier votre organisation.';
      if (submitBtn)  submitBtn.textContent = 'Contacter l\'équipe Entreprise';
    }
  }

  /* ── Navigate to step ── */
  function _goToStep(step, panel) {
    _state.step = step;
    panel = panel || getPanel();
    if (!panel) return;

    /* Show correct step pane */
    $$('.fxlf-step-pane', panel).forEach(function(pane) {
      var paneStep = parseInt(pane.getAttribute('data-step'), 10);
      pane.classList.toggle('active', paneStep === step);
    });

    /* Update progress */
    var label = panel.querySelector('#fxlf-step-label');
    var fill  = panel.querySelector('#fxlf-progress-fill');
    var pct   = Math.round((step / TOTAL_STEPS) * 100);
    if (label) label.textContent = 'Étape ' + step + ' sur ' + TOTAL_STEPS;
    if (fill)  fill.style.width = pct + '%';

    /* Update nav buttons */
    var backBtn   = panel.querySelector('#fxlf-btn-back');
    var nextBtn   = panel.querySelector('#fxlf-btn-next');
    var submitBtn = panel.querySelector('#fxlf-btn-submit');

    if (backBtn) backBtn.style.display = (step > 1) ? '' : 'none';
    if (step < TOTAL_STEPS) {
      if (nextBtn)   nextBtn.style.display = '';
      if (submitBtn) submitBtn.style.display = 'none';
    } else {
      if (nextBtn)   nextBtn.style.display = 'none';
      if (submitBtn) { submitBtn.style.display = ''; submitBtn.disabled = false; }
    }

    /* Update recap on step 3 */
    if (step === 3) _updateRecap(panel);

    /* Scroll panel body to top */
    var body = panel.querySelector('#fxlf-body');
    if (body) body.scrollTop = 0;

    /* Hide error band on step change */
    _hideErrorBand(panel);

    /* Focus first field of new step */
    setTimeout(function () {
      var pane = panel.querySelector('.fxlf-step-pane[data-step="' + step + '"]');
      if (pane) {
        var focusable = pane.querySelector('input:not([type=checkbox]):not([tabindex="-1"]), select, textarea');
        if (focusable) focusable.focus();
      }
    }, 60);

    _track('enterprise_lead_step', {
      step_number: step,
      entry_intent: _state.intent
    });
  }

  /* ── Pre-select needs ── */
  /* Rules:
   *   demo    → select "demonstration" only; visitor may add others freely
   *   contact → nothing pre-selected; visitor chooses freely
   * Called on openPanel — always resets to intent defaults (does not carry
   * over selections from a previous panel open). Manually added selections
   * during the session are NOT wiped when navigating Back/Forward within
   * the same open, because _preselectNeeds is only called at openPanel time.
   */
  function _preselectNeeds(panel, intent) {
    panel = panel || getPanel();
    if (!panel) return;
    var grid = panel.querySelector('#fxlf-needs-grid');
    if (!grid) return;

    /* Always clear all first */
    $$('.fxlf-need-card', grid).forEach(function(card) {
      card.classList.remove('selected');
      card.setAttribute('aria-checked', 'false');
      var cb = card.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });

    /* demo only → pre-select "demonstration" */
    if (intent === 'demo') {
      var demoCard = grid.querySelector('[data-value="demonstration"]');
      if (demoCard) {
        demoCard.classList.add('selected');
        demoCard.setAttribute('aria-checked', 'true');
        var demoCb = demoCard.querySelector('input[type="checkbox"]');
        if (demoCb) demoCb.checked = true;
      }
    }
    /* contact → nothing pre-selected (already cleared above) */
  }

  /* ── Restore preserved values ── */
  function _restoreValues(panel) {
    panel = panel || getPanel();
    if (!panel) return;
    var ids = ['fxlf-prenom','fxlf-nom','fxlf-entreprise','fxlf-fonction',
               'fxlf-telephone','fxlf-email','fxlf-ville','fxlf-secteur',
               'fxlf-org-type','fxlf-batiments','fxlf-message'];
    ids.forEach(function(id) {
      if (_values[id] !== undefined) {
        var el = panel.querySelector('#' + id);
        if (el) el.value = _values[id];
      }
    });
  }

  /* ── Save current step values ── */
  function _saveValues(panel) {
    panel = panel || getPanel();
    if (!panel) return;
    var ids = ['fxlf-prenom','fxlf-nom','fxlf-entreprise','fxlf-fonction',
               'fxlf-telephone','fxlf-email','fxlf-ville','fxlf-secteur',
               'fxlf-org-type','fxlf-batiments','fxlf-message'];
    ids.forEach(function(id) {
      var el = panel.querySelector('#' + id);
      if (el) _values[id] = el.value;
    });
  }

  /* ── Update recap on step 3 ── */
  function _updateRecap(panel) {
    panel = panel || getPanel();
    var recap = panel.querySelector('#fxlf-recap');
    if (!recap) return;
    var prenom    = (_values['fxlf-prenom']    || '').trim();
    var nom       = (_values['fxlf-nom']       || '').trim();
    var entreprise= (_values['fxlf-entreprise'] || '').trim();
    var ville     = (_values['fxlf-ville']      || '').trim();
    var secteur   = (_values['fxlf-secteur']    || '').trim();

    var sectorLabel = '';
    SECTORS.forEach(function(s) { if (s.value === secteur) sectorLabel = s.label; });

    var parts = [];
    if (prenom || nom) parts.push('<strong>' + esc(prenom + ' ' + nom).trim() + '</strong>');
    if (entreprise) parts.push(esc(entreprise));
    if (ville) parts.push(esc(ville));
    if (sectorLabel) parts.push(esc(sectorLabel));

    recap.innerHTML = parts.length
      ? 'Vous êtes : ' + parts.join(' · ')
      : 'Complétez les étapes précédentes pour personnaliser votre demande.';
  }

  /* ── Validate step ── */
  function _validateStep(step, panel) {
    panel = panel || getPanel();
    var errors = [];
    _clearFieldErrors(panel);

    if (step === 1) {
      /* Step 1: Prénom*, Nom*, Téléphone*, Email* — Fonction is OPTIONAL */
      var fields = [
        { id: 'fxlf-prenom',    errId: 'fxlf-err-prenom',    msg: 'Le prénom est requis.' },
        { id: 'fxlf-nom',       errId: 'fxlf-err-nom',        msg: 'Le nom est requis.' },
        { id: 'fxlf-telephone', errId: 'fxlf-err-telephone',  msg: 'Le téléphone est requis.' },
        { id: 'fxlf-email',     errId: 'fxlf-err-email',      msg: 'L\'email professionnel est requis.' }
      ];
      fields.forEach(function(f) {
        var el = panel.querySelector('#' + f.id);
        if (!el) return;
        var val = el.value.trim();
        if (!val) { _showFieldError(panel, f.id, f.errId, f.msg); errors.push(f.id); }
      });
      /* Email format */
      var emailEl = panel.querySelector('#fxlf-email');
      if (emailEl && emailEl.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailEl.value.trim())) {
        _showFieldError(panel, 'fxlf-email', 'fxlf-err-email', 'Format d\'email invalide.');
        if (errors.indexOf('fxlf-email') < 0) errors.push('fxlf-email');
      }
    }

    if (step === 2) {
      /* Step 2: Entreprise*, Ville*, Secteur*, Type* — Bâtiments + Message OPTIONAL */
      var fields2 = [
        { id: 'fxlf-entreprise',errId: 'fxlf-err-entreprise', msg: 'Le nom de l\'entreprise est requis.' },
        { id: 'fxlf-ville',     errId: 'fxlf-err-ville',      msg: 'La ville est requise.' },
        { id: 'fxlf-secteur',   errId: 'fxlf-err-secteur',    msg: 'Le secteur d\'activité est requis.' },
        { id: 'fxlf-org-type',  errId: 'fxlf-err-org-type',   msg: 'Le type d\'organisation est requis.' }
      ];
      fields2.forEach(function(f) {
        var el = panel.querySelector('#' + f.id);
        if (!el) return;
        var val = el.value.trim ? el.value.trim() : el.value;
        if (!val) { _showFieldError(panel, f.id, f.errId, f.msg); errors.push(f.id); }
      });
    }

    if (step === 3) {
      var checkedNeeds = _getCheckedNeeds(panel);
      if (checkedNeeds.length === 0) {
        var errEl = panel.querySelector('#fxlf-err-needs');
        if (errEl) errEl.classList.add('visible');
        errors.push('needs');
      }
    }

    return errors;
  }

  function _showFieldError(panel, fieldId, errId, msg) {
    var el = panel.querySelector('#' + fieldId);
    var errEl = panel.querySelector('#' + errId);
    if (el) el.classList.add('invalid');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('visible'); }
  }

  function _clearFieldErrors(panel) {
    $$('.fxlf-input.invalid, .fxlf-select.invalid, .fxlf-textarea.invalid', panel).forEach(function(el) {
      el.classList.remove('invalid');
    });
    $$('.fxlf-field-error.visible', panel).forEach(function(el) {
      el.classList.remove('visible');
    });
  }

  function _getCheckedNeeds(panel) {
    return $$('.fxlf-need-card.selected', panel).map(function(card) {
      return card.getAttribute('data-value') || '';
    }).filter(Boolean);
  }

  function _showErrorBand(panel, msg) {
    var band = panel.querySelector('#fxlf-error-band');
    if (!band) return;
    band.textContent = msg;
    band.classList.add('visible');
    band.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _hideErrorBand(panel) {
    var band = panel.querySelector('#fxlf-error-band');
    if (band) { band.classList.remove('visible'); band.textContent = ''; }
  }

  /* ── Success state ── */
  function _showSuccess(panel, ref) {
    /* Hide body + footer */
    var body   = panel.querySelector('#fxlf-body');
    var footer = panel.querySelector('#fxlf-footer');
    var header = panel.querySelector('.fxlf-header');
    var progress = panel.querySelector('.fxlf-progress');
    var errBand = panel.querySelector('#fxlf-error-band');

    /* Show elements needed, hide step panes */
    $$('.fxlf-step-pane', panel).forEach(function(p) { p.classList.remove('active'); });
    if (footer) footer.style.display = 'none';
    if (progress) progress.style.display = 'none';
    if (errBand) errBand.classList.remove('visible');

    var success = panel.querySelector('#fxlf-success');
    if (success) {
      success.classList.add('active');
      var refEl = panel.querySelector('#fxlf-success-ref');
      if (refEl) {
        if (ref && ref !== 'submitted') {
          refEl.textContent = 'Référence : ' + String(ref).slice(0,16);
          refEl.style.display = '';
        } else {
          refEl.style.display = 'none';
        }
      }
      /* Focus close button */
      setTimeout(function() {
        var closeBtn = panel.querySelector('#fxlf-success-close');
        if (closeBtn) closeBtn.focus();
      }, 80);
    }

    _track('enterprise_lead_success', {
      entry_intent: _state.intent,
      source_cta: _state.sourceCta
    });
  }

  function _hideSuccess(panel) {
    var success = panel.querySelector('#fxlf-success');
    var footer  = panel.querySelector('#fxlf-footer');
    var progress = panel.querySelector('.fxlf-progress');
    if (success)  success.classList.remove('active');
    if (footer)   footer.style.display = '';
    if (progress) progress.style.display = '';
  }

  /* ── Collect payload ── */
  /* Canonical V2 payload keys + V1 backward-compat aliases.
   * New keys:
   *   city                  = ville select value
   *   business_sector       = secteur select value
   *   organisation_type     = org_type select value
   *   building_or_site_count= batiments number value
   *   role                  = fonction text value (optional — may be empty string)
   *   selected_needs        = comma-separated need values
   * V1 aliases preserved for the existing enterprise_leads table columns:
   *   org_type, needs, batiments, secteur
   */
  function _collectPayload(panel) {
    var needs     = _getCheckedNeeds(panel);
    var prenom    = (panel.querySelector('#fxlf-prenom')     || {value:''}).value.trim();
    var nom       = (panel.querySelector('#fxlf-nom')        || {value:''}).value.trim();
    var entreprise= (panel.querySelector('#fxlf-entreprise') || {value:''}).value.trim();
    var fonction  = (panel.querySelector('#fxlf-fonction')   || {value:''}).value.trim();
    var telephone = (panel.querySelector('#fxlf-telephone')  || {value:''}).value.trim();
    var email     = (panel.querySelector('#fxlf-email')      || {value:''}).value.trim().toLowerCase();
    var ville     = (panel.querySelector('#fxlf-ville')      || {value:''}).value;
    var secteur   = (panel.querySelector('#fxlf-secteur')    || {value:''}).value;
    var orgType   = (panel.querySelector('#fxlf-org-type')   || {value:''}).value;
    var batiments = (panel.querySelector('#fxlf-batiments')  || {value:''}).value.trim();
    var message   = (panel.querySelector('#fxlf-message')    || {value:''}).value.trim().slice(0, 2000);
    var needsStr  = needs.join(', ');

    return {
      /* ── Primary fields (V2 canonical) ── */
      entry_intent:           _state.intent,
      source_cta:             _state.sourceCta,
      prenom:                 prenom,
      nom:                    nom,
      entreprise:             entreprise,
      telephone:              telephone,
      email:                  email,
      /* V2 new canonical keys */
      city:                   ville,
      business_sector:        secteur,
      organisation_type:      orgType,
      building_or_site_count: batiments,
      role:                   fonction,          /* optional — may be '' */
      selected_needs:         needsStr,
      message:                message,
      /* ── V1 backward-compat aliases (existing table columns) ── */
      ville:                  ville,             /* existing column */
      secteur:                secteur,           /* existing column */
      org_type:               orgType,           /* existing column */
      fonction:               fonction || 'Non précisé', /* existing NOT NULL col compat */
      batiments:              batiments,         /* existing column */
      needs:                  needsStr,          /* existing column */
      /* ── Meta ── */
      source:                 'enterprise',
      mode:                   'enterprise',
      page:                   window.location.pathname,
      referrer:               (document.referrer || '').slice(0, 200),
      idempotency:            _state.idempotencyKey,
      submitted_at:           new Date().toISOString()
    };
  }

  /* ── API submission ── */
  function _submitToApi(payload) {
    return fetch(API_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
    .then(function(res) {
      return res.json().then(function(data) {
        return { ok: res.ok, data: data };
      }).catch(function() {
        return { ok: res.ok, data: {} };
      });
    })
    .catch(function() { return { ok: false, data: {} }; });
  }

  /* ── Mailto fallback ── */
  /* Only called after a confirmed API failure (res.ok=false or network error).
   * Does NOT auto-navigate. Does NOT put lead data in URL or browser history.
   * Builds a mailto: href and injects it into the error band as a clickable
   * link so the visitor can choose to open it. The panel stays open.
   */
  function _buildMailtoHref(payload) {
    var bodyLines = [
      'Intention : '            + (payload.entry_intent || ''),
      'Prénom : '               + (payload.prenom || ''),
      'Nom : '                  + (payload.nom || ''),
      'Entreprise : '           + (payload.entreprise || ''),
      'Fonction : '             + (payload.role || payload.fonction || '—'),
      'Téléphone : '            + (payload.telephone || ''),
      'Email : '                + (payload.email || ''),
      'Ville : '                + (payload.city || payload.ville || ''),
      'Secteur : '              + (payload.business_sector || payload.secteur || ''),
      'Type d\'organisation : ' + (payload.organisation_type || payload.org_type || ''),
      'Bâtiments/sites : '      + (payload.building_or_site_count || payload.batiments || '—'),
      'Besoins : '              + (payload.selected_needs || payload.needs || '—'),
      '',
      'Message :',
      (payload.message || '—'),
      '',
      '—',
      'Envoyé depuis : ' + (payload.page || window.location.pathname)
    ].join('\n');

    var subject = encodeURIComponent(
      'Demande Enterprise – ' + (payload.entreprise || '') + ' / ' + (payload.city || payload.ville || '')
    );
    return 'mailto:enterprise@fixeo.ma?subject=' + subject + '&body=' + encodeURIComponent(bodyLines);
  }

  function _showFallbackInPanel(panel, mailtoHref) {
    var band = panel.querySelector('#fxlf-error-band');
    if (!band) return;
    band.innerHTML =
      'Notre serveur est temporairement indisponible. ' +
      'Vous pouvez nous envoyer votre demande directement par email : ' +
      '<a href="' + mailtoHref + '" ' +
         'style="color:rgb(130,155,255);text-decoration:underline;white-space:nowrap;" ' +
         'target="_blank" rel="noopener">Ouvrir le brouillon email</a>';
    band.classList.add('visible');
    band.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Handle submit ── */
  function _handleSubmit(panel) {
    if (_state.submitting || _state.submitted) return;

    /* Anti-spam: minimum fill time (< 2s = likely bot) */
    if (Date.now() - _state.openedAt < 2000) {
      _showErrorBand(panel, 'Veuillez patienter quelques instants avant d\'envoyer.');
      return;
    }

    /* Honeypot check */
    var hp = panel.querySelector('#fxlf-hp');
    if (hp && hp.value) { _showSuccess(panel, 'ref-ok'); return; /* silently fake success for bots */ }

    var errors = _validateStep(3, panel);
    if (errors.length > 0) {
      var firstErr = panel.querySelector('.fxlf-field-error.visible, .invalid');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    _saveValues(panel);
    var payload = _collectPayload(panel);

    /* Lock */
    _state.submitting = true;
    var submitBtn = panel.querySelector('#fxlf-btn-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi de votre demande…';
    }

    _track('enterprise_lead_submit', {
      entry_intent: _state.intent,
      source_cta:   _state.sourceCta
    });

    _submitToApi(payload).then(function(result) {
      _state.submitting = false;

      if (result.ok && result.data && result.data.ok) {
        /* ── Success ── */
        _state.submitted = true;
        var ref = (result.data && result.data.ref) ? result.data.ref : null;
        _showSuccess(panel, ref);
      } else {
        /* ── Confirmed API failure — show mailto link in panel, do NOT auto-navigate ── */
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = _state.intent === 'demo'
            ? 'Envoyer ma demande de démonstration'
            : 'Contacter l\'équipe Entreprise';
        }
        var mailtoHref = _buildMailtoHref(payload);
        _showFallbackInPanel(panel, mailtoHref);
        _track('enterprise_lead_fallback', { entry_intent: _state.intent });
      }
    }).catch(function() {
      /* ── Network error — same treatment as API failure ── */
      _state.submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = _state.intent === 'demo'
          ? 'Envoyer ma demande de démonstration'
          : 'Contacter l\'équipe Entreprise';
      }
      var mailtoHref = _buildMailtoHref(payload);
      _showFallbackInPanel(panel, mailtoHref);
      _track('enterprise_lead_error', { entry_intent: _state.intent });
    });
  }

  /* ── Bind panel events ── */
  function _bindPanelEvents(panel) {
    /* Close */
    var closeBtn = panel.querySelector('#fxlf-close');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    /* Success close */
    panel.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'fxlf-success-close') closePanel();
    });

    /* Back button */
    var backBtn = panel.querySelector('#fxlf-btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        _saveValues(panel);
        _goToStep(_state.step - 1, panel);
      });
    }

    /* Next button */
    var nextBtn = panel.querySelector('#fxlf-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        var errors = _validateStep(_state.step, panel);
        if (errors.length > 0) {
          var firstErr = panel.querySelector('.fxlf-field-error.visible, .invalid');
          if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        _saveValues(panel);
        _goToStep(_state.step + 1, panel);
      });
    }

    /* Submit button */
    var submitBtn = panel.querySelector('#fxlf-btn-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function() {
        _handleSubmit(panel);
      });
    }

    /* Need card toggles */
    var grid = panel.querySelector('#fxlf-needs-grid');
    if (grid) {
      grid.addEventListener('click', function(e) {
        var card = e.target.closest('.fxlf-need-card');
        if (!card) return;
        var isSelected = card.classList.contains('selected');
        card.classList.toggle('selected', !isSelected);
        card.setAttribute('aria-checked', String(!isSelected));
        var cb = card.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = !isSelected;
        /* Clear needs error if any need selected */
        var errEl = panel.querySelector('#fxlf-err-needs');
        if (errEl && _getCheckedNeeds(panel).length > 0) errEl.classList.remove('visible');
      });
      /* Keyboard accessibility for need cards */
      grid.addEventListener('keydown', function(e) {
        if (e.key === ' ' || e.key === 'Enter') {
          var card = e.target.closest('.fxlf-need-card');
          if (!card) return;
          e.preventDefault();
          card.click();
        }
      });
    }

    /* Live clear errors on input */
    panel.addEventListener('input', function(e) {
      var el = e.target;
      if (el.classList.contains('invalid')) {
        el.classList.remove('invalid');
        var errId = 'fxlf-err-' + (el.id || '').replace('fxlf-', '');
        var errEl = panel.querySelector('#' + errId);
        if (errEl) errEl.classList.remove('visible');
      }
    });

    /* Enter key navigation */
    panel.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var tag = e.target.tagName.toLowerCase();
        if (tag === 'textarea') return; /* allow Enter in textarea */
        if (tag === 'input' || tag === 'select') {
          e.preventDefault();
          /* On last step: submit. Otherwise: next */
          if (_state.step < TOTAL_STEPS) {
            var nextBtn2 = panel.querySelector('#fxlf-btn-next');
            if (nextBtn2) nextBtn2.click();
          }
        }
      }
    });
  }

  /* ── Bind page-level triggers ── */
  function _bindTriggers() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-lead-intent]');
      if (!el) return;
      e.preventDefault();
      var intent    = el.getAttribute('data-lead-intent') || 'demo';
      var sourceCta = el.getAttribute('data-source-cta') || '';
      openPanel(intent, sourceCta, el);
    });
  }

  /* ── Intercept V1 FixeoEnterpriseModal.open if still called ── */
  function _patchV1Compatibility() {
    /* Don't override V1 — it still serves any V1 buttons that remain.
       V2 buttons use data-lead-intent exclusively.
       This ensures zero regression on any V1 surface. */
  }

  /* ── Init ── */
  function init() {
    _buildOverlay();
    _buildPanel();
    _bindTriggers();
    _patchV1Compatibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /* ── Public API ── */
  window.FixeoLeadFlowV2 = {
    VERSION: VERSION,
    open:    openPanel,
    close:   closePanel
  };

})();
