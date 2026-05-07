/**
 * fixeo-request-v2.js
 * REQUEST MODAL V2 — Planned Intervention UX overlay
 *
 * PRODUCT POSITIONING:
 *   This is NOT the urgent modal.
 *   This modal = organized work, planning, receiving multiple proposals,
 *                choosing the right artisan, scheduling at your convenience.
 *
 * STRATEGY: Intercept modal open + copy updates. Inject premium planning
 *   UX elements without touching any IDs, submit logic, or payload structure.
 *
 * PRESERVED: #request-form, #request-problem, #request-city,
 *   #request-budget, #request-phone, submit handler, payload, storage.
 *
 * ZERO CHANGES to request-form.js logic.
 */
(function () {
  'use strict';

  if (window._fxRequestV2Loaded) return;
  window._fxRequestV2Loaded = true;

  /* ── Planning copy map ────────────────────────────────────────────── */

  var PLAN_COPY = {
    'default': {
      title: 'Planifiez votre intervention',
      subtitle: 'Recevez plusieurs propositions d\u2019artisans et choisissez tranquillement',
      submit: 'Recevoir des propositions d\u2019artisans',
      urgenceLabel: 'Quand souhaitez-vous intervenir ?',
      urgentCard:  { title: 'Dès que possible',    meta: 'prioritaire',           icon: '\u26A1' },
      normalCard:  { title: 'Moment flexible',     meta: 'à votre convenance',    icon: '\uD83D\uDCC5' },
      planBanner:  'Organisez les travaux <strong>au moment qui vous arrange</strong>',
      scheduleHint: 'Intervention planifi\u00e9e possible \u2014 les artisans s\u2019adaptent \u00e0 votre agenda'
    },
    'marketplace': {
      title: 'Publiez votre demande',
      subtitle: 'Comparez plusieurs propositions et choisissez l\u2019artisan qui vous convient',
      submit: 'Recevoir plusieurs propositions',
      urgenceLabel: 'Quand souhaitez-vous intervenir ?',
      urgentCard:  { title: 'Dès que possible',    meta: 'prioritaire',           icon: '\u26A1' },
      normalCard:  { title: 'Moment flexible',     meta: 'à votre convenance',    icon: '\uD83D\uDCC5' },
      planBanner:  'Comparez les artisans et <strong>choisissez tranquillement</strong>',
      scheduleHint: 'Intervention planifi\u00e9e possible \u2014 les artisans s\u2019adaptent \u00e0 votre agenda'
    },
    'express': null  /* urgent mode — skip V2 overlay completely */
  };

  /* ── Problem input planning placeholders ─────────────────────────── */

  var PLAN_PLACEHOLDERS = [
    'Ex\u00a0: r\u00e9novation salle de bain\u2026',
    'Ex\u00a0: peinture appartement\u2026',
    'Ex\u00a0: installation climatisation\u2026',
    'Ex\u00a0: travaux \u00e9lectricit\u00e9\u2026',
    'Ex\u00a0: pose carrelage\u2026',
    'Ex\u00a0: menuiserie, porte, fen\u00eatre\u2026'
  ];
  var _placeholderIdx = 0;
  var _placeholderTimer = null;

  /* ── State ────────────────────────────────────────────────────────── */

  var _currentMode = 'default';

  /* ── Helpers ──────────────────────────────────────────────────────── */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function getModal()  { return document.getElementById('request-modal'); }
  function getForm()   { return document.getElementById('request-form');  }

  /* ── Apply planning copy to modal ────────────────────────────────── */

  function applyPlanCopy(mode) {
    var cfg = PLAN_COPY[mode] || PLAN_COPY['default'];
    if (!cfg) return;  /* express mode — skip */
    _currentMode = mode;

    /* Title + subtitle */
    var title    = document.getElementById('request-modal-title');
    var subtitle = document.getElementById('request-modal-subtitle');
    if (title)    title.textContent = cfg.title;
    if (subtitle) subtitle.textContent = cfg.subtitle;

    /* Urgency label */
    var urgLabel = $('.request-label', getForm());
    if (urgLabel) urgLabel.textContent = cfg.urgenceLabel;

    /* Urgency cards — rewrite meta copy */
    var cards = document.querySelectorAll('#request-modal .request-choice-card');
    cards.forEach(function (card) {
      var radio  = card.querySelector('input[type=radio]');
      var cTitle = card.querySelector('.request-choice-title');
      var cMeta  = card.querySelector('.request-choice-meta');
      if (!radio) return;

      var isUrgent = radio.value.toLowerCase().indexOf('30') !== -1 || radio.value.toLowerCase().indexOf('urgent') !== -1;
      var def = isUrgent ? cfg.urgentCard : cfg.normalCard;

      /* Icon badge */
      var iconEl = card.querySelector('.fxrq2-urgence-icon');
      if (!iconEl) {
        iconEl = document.createElement('span');
        iconEl.className = 'fxrq2-urgence-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        card.insertBefore(iconEl, card.firstChild);
      }
      iconEl.textContent = def.icon;

      if (cTitle) cTitle.textContent = def.title;
      if (cMeta)  cMeta.textContent  = def.meta;
    });

    /* CTA text */
    var cta = $('#request-form .request-submit-btn');
    if (cta) cta.textContent = cfg.submit;

    /* Planning banner */
    var modal = getModal();
    if (!modal) return;
    var banner = modal.querySelector('.fxrq2-plan-strip');
    if (banner) banner.querySelector('.fxrq2-plan-text').innerHTML = cfg.planBanner;

    /* Schedule hint */
    var hint = modal.querySelector('.fxrq2-schedule-hint .fxrq2-schedule-text');
    if (hint) hint.textContent = cfg.scheduleHint;
  }

  /* ── Inject premium planning UI elements (once per modal) ─────────── */

  function upgradeRequestModal(modal) {
    if (modal.dataset.fxrqV2 === '1') return;
    modal.dataset.fxrqV2 = '1';

    var form = getForm();
    if (!form) return;

    /* 1 ── Planning banner at top of form ─────────────────── */
    var planStrip = document.createElement('div');
    planStrip.className = 'fxrq2-plan-strip';
    planStrip.innerHTML =
      '<span class="fxrq2-plan-icon" aria-hidden="true">\uD83D\uDCCB</span>' +
      '<span class="fxrq2-plan-text">Organisez les travaux <strong>au moment qui vous arrange</strong></span>';
    form.insertBefore(planStrip, form.firstChild);

    /* 2 ── Scheduling perception hint — after urgency section ── */
    var urgencyField = form.querySelector('.request-choice-grid');
    if (urgencyField) {
      var scheduleHint = document.createElement('div');
      scheduleHint.className = 'fxrq2-schedule-hint';
      scheduleHint.innerHTML =
        '<span class="fxrq2-schedule-icon" aria-hidden="true">\uD83D\uDDD3\uFE0F</span>' +
        '<span class="fxrq2-schedule-text">Intervention planifi\u00e9e possible \u2014 les artisans s\u2019adaptent \u00e0 votre agenda</span>';
      urgencyField.insertAdjacentElement('afterend', scheduleHint);
    }

    /* 3 ── Proposals perception — before submit button ──────── */
    var cta = form.querySelector('.request-submit-btn');
    if (cta) {
      var proposals = document.createElement('div');
      proposals.className = 'fxrq2-proposals';
      proposals.innerHTML =
        '<span class="fxrq2-proposals-text">Recevez plusieurs propositions d\u2019artisans v\u00e9rifi\u00e9s</span>' +
        '<span class="fxrq2-proposals-count">Gratuit &amp; sans engagement</span>';
      cta.insertAdjacentElement('beforebegin', proposals);
    }

    /* 4 ── Update problem field placeholder to planning tone ─── */
    var problemInput = $('#request-problem', form);
    if (problemInput) {
      problemInput.placeholder = 'Ex\u00a0: plomberie, \u00e9lectricit\u00e9, peinture, r\u00e9novation\u2026';
    }

    /* 5 ── Upgrade description placeholder (injected by request-form.js) */
    window.setTimeout(function () {
      var desc = $('#request-description', form);
      if (desc) {
        desc.placeholder = 'D\u00e9crivez votre besoin\u2026 \u00e9tat actuel, surface, contraintes particulières';
        desc.setAttribute('rows', '3');
      }
    }, 80);

    /* 6 ── Phone placeholder planning tone ──────────────────── */
    var phoneInput = $('#request-phone', form);
    if (phoneInput) {
      phoneInput.placeholder = '06 \u2219\u2219 \u2219\u2219 \u2219\u2219 \u2219\u2219';
    }

    /* 7 ── Apply copy for current mode ──────────────────────── */
    var currentMode = modal.getAttribute('data-request-mode') || 'default';
    applyPlanCopy(currentMode);
  }

  /* ── Rotating placeholder on problem field (calm, planning-toned) ── */

  function startPlaceholderRotation() {
    var input = $('#request-problem');
    if (!input || input._fxrqRotating) return;
    input._fxrqRotating = true;
    var focused = false;
    input.addEventListener('focus', function () { focused = true; });
    input.addEventListener('blur',  function () { focused = false; });

    _placeholderTimer = setInterval(function () {
      if (focused || input.value.trim()) return;
      _placeholderIdx = (_placeholderIdx + 1) % PLAN_PLACEHOLDERS.length;
      input.placeholder = PLAN_PLACEHOLDERS[_placeholderIdx];
    }, 3600);
  }

  function stopPlaceholderRotation() {
    if (_placeholderTimer) {
      clearInterval(_placeholderTimer);
      _placeholderTimer = null;
    }
  }

  /* ── Watch for mode changes (called by request-form.js updateModalCopy) ── */

  function watchModeAttr() {
    var modal = getModal();
    if (!modal) return;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === 'data-request-mode') {
          var newMode = modal.getAttribute('data-request-mode');
          if (newMode && newMode !== 'express') {
            applyPlanCopy(newMode);
          }
        }
      });
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['data-request-mode'] });
  }

  /* ── Hook into FixeoClientRequest.open ─────────────────────────────── */

  function hookOpen() {
    var fcr = window.FixeoClientRequest;
    if (!fcr || !fcr.open) return false;
    if (fcr.open._fxrqV2Hooked) return true;

    var _origOpen = fcr.open;
    fcr.open = function (trigger, forcedMode) {
      _origOpen.apply(this, arguments);

      /* Only activate V2 for non-express modes */
      var mode = forcedMode ||
        (trigger && typeof trigger.getAttribute === 'function' ? trigger.getAttribute('data-request-mode') : null) ||
        'default';

      if (mode === 'express') return;

      window.setTimeout(function () {
        var modal = getModal();
        if (!modal) return;
        upgradeRequestModal(modal);
        applyPlanCopy(modal.getAttribute('data-request-mode') || mode);
        startPlaceholderRotation();
      }, 25);
    };
    fcr.open._fxrqV2Hooked = true;
    return true;
  }

  /* ── Also hook openExpress to EXCLUDE request modal V2 ─────────────── */
  /* (No-op needed — express mode bypasses V2 by mode check above)        */

  /* ── Bootstrap ─────────────────────────────────────────────────────── */

  function init() {
    /* If modal already in DOM (e.g. pre-opened), upgrade it */
    var modal = getModal();
    if (modal && modal.classList.contains('open')) {
      var mode = modal.getAttribute('data-request-mode') || 'default';
      if (mode !== 'express') {
        upgradeRequestModal(modal);
        applyPlanCopy(mode);
        startPlaceholderRotation();
      }
    }

    /* Watch for attribute changes (mode switches) */
    watchModeAttr();

    /* Hook open function */
    if (!hookOpen()) {
      var attempts = 0;
      var timer = setInterval(function () {
        if (hookOpen() || ++attempts > 40) clearInterval(timer);
      }, 100);
    }

    /* Also upgrade if modal opens via CSS class (e.g. openModal shim) */
    var domModal = getModal();
    if (domModal) {
      var classObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.attributeName === 'class') {
            var isOpen = domModal.classList.contains('open');
            var mode   = domModal.getAttribute('data-request-mode') || 'default';
            if (isOpen && mode !== 'express') {
              window.setTimeout(function () {
                upgradeRequestModal(domModal);
                applyPlanCopy(mode);
                startPlaceholderRotation();
              }, 25);
            }
            if (!isOpen) stopPlaceholderRotation();
          }
        });
      });
      classObserver.observe(domModal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
