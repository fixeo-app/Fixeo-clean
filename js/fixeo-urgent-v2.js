/**
 * fixeo-urgent-v2.js
 * URGENT MODAL V2 — Uber-level UX overlay
 *
 * STRATEGY: Intercept express modal after creation, inject premium UI.
 * - Problem cards (replaces chip row)
 * - City chips (replaces native select)
 * - Adaptive placeholder
 * - Live perception strip
 * - CTA text upgrade
 *
 * PRESERVED: all IDs, all submit logic, all payload fields.
 * The hidden native inputs are still synced and submitted.
 *
 * SAFETY: idempotent, zero fetch, zero Supabase.
 */
(function () {
  'use strict';

  if (window._fxUrgentV2Loaded) return;
  window._fxUrgentV2Loaded = true;

  /* ── Config ──────────────────────────────────────────────────────── */

  var PROBLEMS = [
    { icon: '\uD83D\uDCA7', label: 'Fuite d\u2019eau',      text: 'Fuite d\u2019eau',        hint: 'Cuisine, salle de bain, fuite importante\u2026'        },
    { icon: '\u26A1',       label: 'Panne \u00e9lectrique', text: 'Panne \u00e9lectrique',    hint: 'Disjoncteur, court-circuit, tableau\u2026'              },
    { icon: '\u274C\uFE0F', label: 'Porte bloqu\u00e9e',    text: 'Porte bloqu\u00e9e',       hint: 'Serrure forc\u00e9e, cl\u00e9 cass\u00e9e, gond\u2026'  },
    { icon: '\u2744\uFE0F', label: 'Clim en panne',         text: 'Clim en panne',            hint: 'Mod\u00e8le, \u00e9tage, sympt\u00f4mes\u2026'           },
    { icon: '\uD83D\uDD25', label: 'Chauffe-eau',           text: 'Chauffe-eau / gaz',        hint: 'Fuite, no eau chaude, odeur\u2026'                       },
    { icon: '\uD83E\uDE9B', label: 'R\u00e9paration',       text: 'R\u00e9paration urgente',  hint: 'D\u00e9crivez le probl\u00e8me\u2026'                    }
  ];

  var CITIES = [
    'Casablanca', 'Rabat', 'F\u00e8s', 'Tanger',
    'Marrakech', 'Agadir', 'Mekn\u00e8s', 'Oujda'
  ];

  var DEFAULT_HINT = 'D\u00e9crivez le probl\u00e8me en quelques mots\u2026';

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  /* ── Core upgrade ────────────────────────────────────────────────── */

  function upgradeModal(modal) {
    if (modal.dataset.fxuV2 === '1') return;
    modal.dataset.fxuV2 = '1';

    var form = $('#express-request-form', modal);
    if (!form) return;

    var problemField = $('#express-request-problem', modal);
    var citySelect   = $('#express-request-city',   modal);
    if (!problemField || !citySelect) return;

    /* 1 ── Live perception strip ─────────────────────────────── */
    var liveStrip = document.createElement('div');
    liveStrip.className = 'fxu2-live';
    liveStrip.innerHTML =
      '<span class="fxu2-live-dot"></span>' +
      '<span class="fxu2-live-text">Des artisans peuvent r\u00e9pondre rapidement</span>';
    form.insertBefore(liveStrip, form.firstChild);

    /* 2 ── Problem cards ─────────────────────────────────────── */
    var problemContainer = problemField.closest('.request-field') || problemField.parentElement;

    var grid = document.createElement('div');
    grid.className = 'fxu2-problem-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Choisissez un probl\u00e8me');

    PROBLEMS.forEach(function (p) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'fxu2-pcard';
      card.dataset.text = p.text;
      card.dataset.hint = p.hint;
      card.setAttribute('aria-pressed', 'false');
      card.innerHTML =
        '<span class="fxu2-pcard-icon" aria-hidden="true">' + p.icon + '</span>' +
        '<span class="fxu2-pcard-label">' + p.label + '</span>';
      grid.appendChild(card);
    });

    /* Insert grid before the problem textarea container */
    problemContainer.parentElement.insertBefore(grid, problemContainer);

    /* Update textarea label */
    var problemLabel = $('label[for="express-request-problem"]', form);
    if (problemLabel) {
      problemLabel.textContent = 'D\u00e9tail (optionnel)';
    }

    /* Add hint text */
    var hint = document.createElement('span');
    hint.className = 'fxu2-detail-hint';
    hint.textContent = 'Ajoutez un d\u00e9tail utile si n\u00e9cessaire';
    if (problemField.nextSibling) {
      problemContainer.insertBefore(hint, problemField.nextSibling);
    } else {
      problemContainer.appendChild(hint);
    }

    /* Card click handler */
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.fxu2-pcard');
      if (!card) return;

      var wasSelected = card.classList.contains('fxu2-selected');

      /* Deselect all */
      Array.from(grid.querySelectorAll('.fxu2-pcard')).forEach(function (c) {
        c.classList.remove('fxu2-selected');
        c.setAttribute('aria-pressed', 'false');
      });

      if (!wasSelected) {
        card.classList.add('fxu2-selected');
        card.setAttribute('aria-pressed', 'true');
        grid.classList.add('fxu2-has-selection');

        /* Sync textarea value */
        problemField.value = card.dataset.text || '';
        /* Adaptive placeholder */
        problemField.placeholder = card.dataset.hint || DEFAULT_HINT;
        /* Dispatch input event so chips-used logic fires */
        problemField.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        grid.classList.remove('fxu2-has-selection');
        problemField.value = '';
        problemField.placeholder = DEFAULT_HINT;
      }
    });

    /* If textarea already has value (prefill), set default placeholder */
    if (!problemField.value) {
      problemField.placeholder = DEFAULT_HINT;
    }

    /* 3 ── City chips ─────────────────────────────────────────── */
    var cityContainer = citySelect.closest('.request-field') || citySelect.parentElement;

    var cityLabel = document.createElement('span');
    cityLabel.className = 'fxu2-city-label';
    cityLabel.textContent = 'Votre ville';

    var cityGrid = document.createElement('div');
    cityGrid.className = 'fxu2-city-grid';
    cityGrid.setAttribute('role', 'group');
    cityGrid.setAttribute('aria-label', 'Choisissez votre ville');

    CITIES.forEach(function (city) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'fxu2-city-chip';
      chip.dataset.city = city;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML =
        '<span class="fxu2-city-chip-check" aria-hidden="true">✓</span>' +
        city;
      cityGrid.appendChild(chip);
    });

    cityContainer.parentElement.insertBefore(cityLabel, cityContainer);
    cityContainer.parentElement.insertBefore(cityGrid, cityContainer);

    /* Prefill city from native select if already set */
    var prefilledCity = citySelect.value;
    if (prefilledCity) {
      var preChip = cityGrid.querySelector('[data-city="' + prefilledCity + '"]');
      if (preChip) {
        preChip.classList.add('fxu2-city-selected');
        preChip.setAttribute('aria-pressed', 'true');
        cityGrid.classList.add('fxu2-city-has-sel');
      }
    }

    /* City chip click */
    cityGrid.addEventListener('click', function (e) {
      var chip = e.target.closest('.fxu2-city-chip');
      if (!chip) return;

      var wasSelected = chip.classList.contains('fxu2-city-selected');

      /* Deselect all */
      Array.from(cityGrid.querySelectorAll('.fxu2-city-chip')).forEach(function (c) {
        c.classList.remove('fxu2-city-selected');
        c.setAttribute('aria-pressed', 'false');
      });

      if (!wasSelected) {
        chip.classList.add('fxu2-city-selected');
        chip.setAttribute('aria-pressed', 'true');
        cityGrid.classList.add('fxu2-city-has-sel');
        /* Sync native select (preserves submit logic) */
        citySelect.value = chip.dataset.city;
        /* Fire change so any listeners fire */
        citySelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        cityGrid.classList.remove('fxu2-city-has-sel');
        citySelect.value = '';
      }
    });

    /* 4 ── CTA text upgrade ──────────────────────────────────── */
    var cta = form.querySelector('.request-submit-btn');
    if (cta && cta.textContent.trim().toLowerCase() === 'trouver un artisan maintenant') {
      cta.textContent = 'Trouver un artisan maintenant';
    }

    /* 5 ── Trust line keep, FOMO remove ─────────────────────── */
    var fomo = form.querySelector('.express-modal-fomo');
    if (fomo) fomo.style.display = 'none';
  }

  /* ── Watch for modal creation ────────────────────────────────────── */

  function tryUpgrade() {
    var modal = document.getElementById('express-modal');
    if (modal) {
      upgradeModal(modal);
    }
  }

  /* Hook into FixeoClientRequest.openExpress */
  function hookOpenExpress() {
    var orig = window.FixeoClientRequest && window.FixeoClientRequest.openExpress;
    if (!orig) return false;
    if (orig._fxuV2Hooked) return true;

    window.FixeoClientRequest.openExpress = function () {
      orig.apply(this, arguments);
      /* Upgrade after modal is in DOM */
      window.setTimeout(tryUpgrade, 20);
    };
    window.FixeoClientRequest.openExpress._fxuV2Hooked = true;
    return true;
  }

  /* ── Bootstrap ───────────────────────────────────────────────────── */

  function init() {
    /* Try immediate hook if FixeoClientRequest already set */
    if (!hookOpenExpress()) {
      /* Poll until it's ready (max ~3s) */
      var attempts = 0;
      var timer = setInterval(function () {
        if (hookOpenExpress() || ++attempts > 30) clearInterval(timer);
      }, 100);
    }
    /* Also upgrade if modal already exists in DOM (rare) */
    tryUpgrade();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
