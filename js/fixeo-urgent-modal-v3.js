/**
 * fixeo-urgent-modal-v3.js — fuv3-v1a
 * FIXEO Urgent Modal V3 — Premium Emergency Flow Enhancement
 *
 * STRATEGY: Additive layer over rmv2-v1a. Fires 60ms AFTER rmv2 upgrade.
 * - Injects missing "WC bouché" chip into rmv2's PROBLEMS_URGENT grid
 * - Upgrades modal header for URGENT mode (pulsing accent bar, red badge)
 * - Adds live urgency trust signal (artisan availability counter)
 * - Adds submit validation gate: problem + city + phone required
 * - Real-time enable/disable of submit button as user fills required fields
 * - Auto-scroll selected city chip into view on mobile
 * - Cleans up on modal close (mirror resetChips pattern)
 *
 * NEVER TOUCHES:
 *   - request-form.js submit logic or payload
 *   - fixeo-request-modal-v2.js (rmv2)
 *   - fixeo-estimation-engine-v1.js (faee)
 *   - fixeo-ai-request-engine.js (AIRE)
 *   - fixeo-hero-insights.js
 *   - Supabase persistence chain
 *   - Notification / Dispatch engines
 *   - Admin Command Center
 *
 * DEPENDENCIES:
 *   - #request-modal must exist (static HTML in index.html)
 *   - rmv2 must have run first (fxrm2-chip-grid, fxrm2-city-section expected)
 *   - window.FixeoAIRE optional (artisan count enrichment)
 *
 * Version: fuv3-v1a — 2026-06-12
 */
(function () {
  'use strict';

  if (window._fxUrgentV3Loaded) return;
  window._fxUrgentV3Loaded = true;

  var VERSION = 'fuv3-v1a';

  /* ─────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────── */

  /* WC bouché chip: inserted after "Porte bloquée" (index 2), before "Clim en panne" */
  var WC_CHIP = {
    icon: '🚽',
    label: 'WC bouché',
    text: 'WC bouché',
    hint: 'Toilette bouchée, refoulement, odeurs…',
    slug: 'plomberie'
  };

  /* How many artisans to show in trust signal — pulled from AIRE if available */
  var FALLBACK_ARTISAN_COUNT = 12;

  /* Validation guard timing */
  var VALIDATE_DEBOUNCE_MS = 120;

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function _phone(val) {
    /* Accepts: 06XXXXXXXX, +2126XXXXXXXX, 07XXXXXXXX. Min 8 digits. */
    var digits = (val || '').replace(/[\s\-().+]/g, '');
    return digits.length >= 8 && /^[0-9]+$/.test(digits);
  }

  function _getModalMode(modal) {
    return (modal && modal.getAttribute('data-request-mode')) || 'default';
  }

  function _isExpress(modal) {
    return _getModalMode(modal) === 'express';
  }

  /* ─────────────────────────────────────────────
     G-1: WC BOUCHÉ CHIP INJECTION
     Inserts into rmv2's existing .fxrm2-chip-grid
     at position 2 (after Porte bloquée, before Clim en panne)
  ───────────────────────────────────────────── */

  function _injectWCChip(form) {
    var grid = $('.fxrm2-chip-grid', form);
    if (!grid || grid.dataset.fuv3WcInjected) return;
    grid.dataset.fuv3WcInjected = '1';

    /* Only in express mode (urgent chips) — check for presence of 🔒 chip */
    var hasLock = $$('.fxrm2-chip', grid).some(function (c) {
      return c.querySelector('.fxrm2-chip-icon') &&
             (c.querySelector('.fxrm2-chip-icon').textContent || '').trim() === '🔒';
    });
    if (!hasLock) return; /* Not in urgent chip set — skip */

    /* Build the WC bouché chip in exact same structure as rmv2 */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fxrm2-chip fuv3-wc-chip';
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.slug = WC_CHIP.slug;
    btn.dataset.text = WC_CHIP.text;
    btn.dataset.hint = WC_CHIP.hint;
    btn.innerHTML =
      '<span class="fxrm2-chip-icon" aria-hidden="true">' + WC_CHIP.icon + '</span>' +
      '<span class="fxrm2-chip-label-text">' + WC_CHIP.label + '</span>';

    /* Find the 🔒 chip (Porte bloquée) and insert WC bouché AFTER it */
    var chips = $$('.fxrm2-chip', grid);
    var lockChip = null;
    chips.forEach(function (c) {
      var icon = c.querySelector('.fxrm2-chip-icon');
      if (icon && icon.textContent.trim() === '🔒') lockChip = c;
    });

    if (lockChip && lockChip.nextSibling) {
      grid.insertBefore(btn, lockChip.nextSibling);
    } else {
      /* Fallback: append */
      grid.appendChild(btn);
    }

    /* Wire click — same pattern as rmv2 */
    btn.addEventListener('click', function () {
      var problemInput = $('#request-problem', form);
      if (!problemInput) return;

      /* Deselect all rmv2 chips */
      $$('.fxrm2-chip', grid).forEach(function (c) {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
      });

      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');

      /* Write to native input */
      problemInput.value = WC_CHIP.text;
      problemInput.placeholder = WC_CHIP.hint;
      problemInput.dispatchEvent(new Event('input',  { bubbles: true }));
      problemInput.dispatchEvent(new Event('change', { bubbles: true }));

      /* Show city section if hidden */
      var citySection = form.querySelector('.fxrm2-city-section');
      if (citySection) citySection.classList.add('fxrm2-visible');
    });
  }

  /* ─────────────────────────────────────────────
     G-4: URGENT HEADER VISUAL UPGRADE
     Adds pulsing red accent bar + URGENCE badge to modal header
     Cleans up on modal close (dataset flag)
  ───────────────────────────────────────────── */

  function _upgradeHeader(modal) {
    if (modal.dataset.fuv3Header === '1') return;
    modal.dataset.fuv3Header = '1';

    /* Pulsing top accent bar */
    if (!modal.querySelector('.fuv3-accent-bar')) {
      var bar = document.createElement('div');
      bar.className = 'fuv3-accent-bar';
      bar.setAttribute('aria-hidden', 'true');
      modal.insertBefore(bar, modal.firstChild);
    }

    /* URGENCE badge in header */
    var headerTitle = $('#request-modal-title', modal);
    if (headerTitle && !modal.querySelector('.fuv3-urgent-badge')) {
      var badge = document.createElement('span');
      badge.className = 'fuv3-urgent-badge';
      badge.setAttribute('aria-label', 'Mode urgence activé');
      badge.textContent = '⚡ URGENCE';
      headerTitle.insertAdjacentElement('beforebegin', badge);
    }

    /* Override subtitle */
    var subtitle = $('#request-modal-subtitle', modal);
    if (subtitle && !subtitle.dataset.fuv3Orig) {
      subtitle.dataset.fuv3Orig = subtitle.textContent;
      subtitle.textContent = 'Intervention rapide · Artisan disponible maintenant dans votre ville';
    }
  }

  function _downgradeHeader(modal) {
    modal.dataset.fuv3Header = '';

    var bar = modal.querySelector('.fuv3-accent-bar');
    if (bar) bar.parentNode && bar.parentNode.removeChild(bar);

    var badge = modal.querySelector('.fuv3-urgent-badge');
    if (badge) badge.parentNode && badge.parentNode.removeChild(badge);

    var subtitle = $('#request-modal-subtitle', modal);
    if (subtitle && subtitle.dataset.fuv3Orig) {
      subtitle.textContent = subtitle.dataset.fuv3Orig;
      delete subtitle.dataset.fuv3Orig;
    }
  }

  /* ─────────────────────────────────────────────
     G-3: LIVE URGENCY TRUST SIGNAL
     Shows real artisan count from AIRE, or fallback.
     Injected as first child of .request-modal-shell
  ───────────────────────────────────────────── */

  function _getArtisanCount(problemSlug) {
    try {
      if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
        var count = window.FixeoAIRE.getArtisanCount(problemSlug || 'plomberie', '');
        if (count && count > 0) return count;
      }
    } catch (_) {}
    return FALLBACK_ARTISAN_COUNT;
  }

  function _injectLiveSignal(modal, count) {
    var shell = modal.querySelector('.request-modal-shell');
    if (!shell) return;

    var existing = modal.querySelector('#fuv3-live-signal');
    if (existing) {
      /* Update count only */
      var countEl = existing.querySelector('.fuv3-signal-count');
      if (countEl) countEl.textContent = count;
      return;
    }

    var signal = document.createElement('div');
    signal.id = 'fuv3-live-signal';
    signal.className = 'fuv3-live-signal';
    signal.setAttribute('aria-live', 'polite');
    signal.setAttribute('aria-label', 'Artisans disponibles maintenant');
    signal.innerHTML =
      '<span class="fuv3-signal-dot" aria-hidden="true"></span>' +
      '<span class="fuv3-signal-text">' +
        '<span class="fuv3-signal-count">' + count + '</span>' +
        ' artisans disponibles maintenant dans votre zone' +
      '</span>';

    shell.insertBefore(signal, shell.firstChild);
  }

  function _removeLiveSignal(modal) {
    var el = modal.querySelector('#fuv3-live-signal');
    if (el) el.parentNode && el.parentNode.removeChild(el);
  }

  /* ─────────────────────────────────────────────
     G-2 / G-6: SUBMIT VALIDATION GATE
     Reads problem + city + phone from native fields.
     Enables/disables submit button.
     Adds visual validation hints on fields.
  ───────────────────────────────────────────── */

  function _getValidationState(form) {
    var problem = ($('#request-problem', form)?.value || '').trim();
    var city    = ($('#request-city',    form)?.value || '').trim();
    var phone   = ($('#request-phone',   form)?.value || '').trim();

    return {
      hasProblem: problem.length > 0,
      hasCity:    city.length > 0,
      hasPhone:   _phone(phone),
      problem:    problem,
      city:       city,
      phone:      phone
    };
  }

  function _applyValidationGate(form, modal) {
    if (!form || !modal) return;
    if (!_isExpress(modal)) return; /* gate only in urgent mode */

    var state   = _getValidationState(form);
    var isValid = state.hasProblem && state.hasCity && state.hasPhone;

    var submitBtn = form.querySelector('.request-submit-btn');
    if (!submitBtn) return;

    if (isValid) {
      submitBtn.removeAttribute('disabled');
      submitBtn.classList.remove('fuv3-btn-disabled');
    } else {
      submitBtn.setAttribute('disabled', 'disabled');
      submitBtn.classList.add('fuv3-btn-disabled');

      /* Build contextual micro-hint */
      var hint = '';
      if (!state.hasProblem) hint = '← Choisissez le type de problème';
      else if (!state.hasCity) hint = '← Sélectionnez votre ville';
      else if (!state.hasPhone) hint = '← Ajoutez votre numéro de téléphone';
      _setSubmitHint(form, hint);
      return;
    }
    _setSubmitHint(form, '');
  }

  function _setSubmitHint(form, text) {
    var hint = form.querySelector('#fuv3-submit-hint');
    if (!text) {
      if (hint) hint.style.display = 'none';
      return;
    }
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'fuv3-submit-hint';
      hint.className = 'fuv3-submit-hint';
      hint.setAttribute('aria-live', 'polite');
      var submitBtn = form.querySelector('.request-submit-btn');
      if (submitBtn) submitBtn.insertAdjacentElement('beforebegin', hint);
      else form.appendChild(hint);
    }
    hint.textContent = text;
    hint.style.display = 'block';
  }

  /* ─────────────────────────────────────────────
     G-5: AUTO-SCROLL CITY CHIP INTO VIEW
     Called whenever a city chip is selected
  ───────────────────────────────────────────── */

  function _watchCityScrollSync(form) {
    var cityRow = form.querySelector('.fxrm2-city-row');
    if (!cityRow || cityRow.dataset.fuv3ScrollWired) return;
    cityRow.dataset.fuv3ScrollWired = '1';

    cityRow.addEventListener('click', function (e) {
      var chip = e.target.closest('.fxrm2-city-chip');
      if (!chip) return;
      setTimeout(function () {
        try {
          chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch (_) {}
      }, 60);
    });
  }

  /* ─────────────────────────────────────────────
     WATCHER — watch native inputs for validation
  ───────────────────────────────────────────── */

  function _wireValidation(modal, form) {
    if (form.dataset.fuv3ValidationWired) return;
    form.dataset.fuv3ValidationWired = '1';

    var _t = null;
    function debounced() {
      clearTimeout(_t);
      _t = setTimeout(function () { _applyValidationGate(form, modal); }, VALIDATE_DEBOUNCE_MS);
    }

    /* Watch all relevant inputs */
    ['#request-problem', '#request-city', '#request-phone'].forEach(function (sel) {
      var el = $(sel, form);
      if (!el) return;
      el.addEventListener('input',  debounced);
      el.addEventListener('change', debounced);
    });

    /* Also watch via MutationObserver on form — catches chip writes (dispatchEvent) */
    var obs = new MutationObserver(debounced);
    obs.observe(form, { subtree: true, attributes: true, attributeFilter: ['value'] });

    /* Store observer for teardown */
    form._fuv3ValidationObs = obs;
  }

  function _teardownValidation(form) {
    if (!form) return;
    form.dataset.fuv3ValidationWired = '';
    if (form._fuv3ValidationObs) {
      try { form._fuv3ValidationObs.disconnect(); } catch (_) {}
      form._fuv3ValidationObs = null;
    }
    /* Re-enable submit on teardown (reset to clean state) */
    var submitBtn = form && form.querySelector('.request-submit-btn');
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      submitBtn.classList.remove('fuv3-btn-disabled');
    }
  }

  /* ─────────────────────────────────────────────
     MAIN UPGRADE — called on express modal open
  ───────────────────────────────────────────── */

  function _upgrade(modal) {
    if (!modal) return;
    var form = $('#request-form', modal);
    if (!form) return;

    try {
      /* G-1: WC bouché chip */
      _injectWCChip(form);

      /* G-4: Header */
      _upgradeHeader(modal);

      /* G-3: Live signal — derive slug from selected chip or default */
      var selectedChip = form.querySelector('.fxrm2-chip.selected');
      var slug = (selectedChip && selectedChip.dataset.slug) || 'plomberie';
      var count = _getArtisanCount(slug);
      _injectLiveSignal(modal, count);

      /* G-5: City scroll sync */
      _watchCityScrollSync(form);

      /* G-2 / G-6: Validation gate */
      _wireValidation(modal, form);

      /* Initial validation pass */
      _applyValidationGate(form, modal);

    } catch (e) {
      if (window.console && console.warn) console.warn('[fuv3] upgrade error:', e && e.message);
    }
  }

  /* ─────────────────────────────────────────────
     TEARDOWN — called on modal close
  ───────────────────────────────────────────── */

  function _teardown(modal) {
    if (!modal) return;

    try {
      /* Header */
      _downgradeHeader(modal);

      /* Live signal */
      _removeLiveSignal(modal);

      /* Validation gate */
      var form = $('#request-form', modal);
      _teardownValidation(form);

      /* WC chip — will be re-injected on next open */
      var wcChip = modal.querySelector('.fuv3-wc-chip');
      if (wcChip) wcChip.parentNode && wcChip.parentNode.removeChild(wcChip);
      var grid = modal.querySelector('.fxrm2-chip-grid');
      if (grid) delete grid.dataset.fuv3WcInjected;

    } catch (e) {
      if (window.console && console.warn) console.warn('[fuv3] teardown error:', e && e.message);
    }
  }

  /* ─────────────────────────────────────────────
     BOOT — watch #request-modal class changes
     Fires 60ms after rmv2 (rmv2 fires at 30ms)
  ───────────────────────────────────────────── */

  var modal = document.getElementById('request-modal');
  if (!modal) return; /* page doesn't have the modal */

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName !== 'class' && m.attributeName !== 'data-request-mode') return;

      var isOpen   = modal.classList.contains('open');
      var isExpress = _isExpress(modal);

      if (isOpen && isExpress) {
        /* Fire 60ms after rmv2's 30ms → rmv2 chips exist by now */
        setTimeout(function () { _upgrade(modal); }, 60);
      } else if (!isOpen) {
        /* Teardown when modal closes */
        setTimeout(function () { _teardown(modal); }, 20);
      }
    });
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['class', 'data-request-mode'] });

  /* Expose public API */
  window.FixeoUrgentV3 = {
    VERSION:  VERSION,
    upgrade:  function () { _upgrade(modal); },
    teardown: function () { _teardown(modal); }
  };

})();
