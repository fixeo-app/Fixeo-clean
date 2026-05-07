/**
 * artisan-onboarding-v3.js
 * ARTISAN ACTIVATION V3 — Premium Network Entry Experience
 *
 * TWO MODES:
 *   NEW ("new")   → "Je rejoins le réseau Fixeo"
 *   CLAIM ("claim") → "Mon profil existe peut-être déjà — je l'active"
 *
 * PRESERVED (zero changes):
 *   #artisan-onboarding-form, #artisan-name, #artisan-category,
 *   #artisan-city, #artisan-phone, #artisan-description,
 *   #artisan-submit-btn, all validation, all submit logic,
 *   FixeoArtisanOnboardingStore, createArtisanSession, redirectAfterOnboarding
 *
 * STRATEGY: Additive DOM injection + CSS class toggling.
 *   Native selects hidden via CSS, kept in DOM, synced by JS.
 *   artisan_activation_mode hidden field added (non-breaking, backend ignores if unknown).
 */
(function () {
  'use strict';

  if (window._fxAoV3Loaded) return;
  window._fxAoV3Loaded = true;

  /* ── Config ──────────────────────────────────────────────────────── */

  /* SVG CSS class names matching auth-premium.css .ap-si-{value} system.
     Zero emoji dependency — SVG data URI backgrounds, cross-environment. */
  var METIERS = [
    { value: 'plomberie',    label: 'Plomberie',            svgClass: 'ap-si-plomberie'    },
    { value: 'electricite',  label: '\u00c9lectricit\u00e9', svgClass: 'ap-si-electricite'  },
    { value: 'peinture',     label: 'Peinture',             svgClass: 'ap-si-peinture'     },
    { value: 'climatisation',label: 'Climatisation',        svgClass: 'ap-si-clim'         },
    { value: 'menuiserie',   label: 'Menuiserie',           svgClass: 'ap-si-menuiserie'   },
    { value: 'maconnerie',   label: 'Ma\u00e7onnerie',      svgClass: 'ap-si-maconnerie'   },
    { value: 'serrurerie',   label: 'Serrurerie',           svgClass: 'ap-si-serrurerie'   },
    { value: 'nettoyage',    label: 'Nettoyage',            svgClass: 'ap-si-nettoyage'    },
    { value: 'jardinage',    label: 'Jardinage',            svgClass: 'ap-si-jardinage'    },
    { value: 'demenagement', label: 'D\u00e9m\u00e9nagement', svgClass: 'ap-si-demenagement' },
    { value: 'toiture',      label: 'Toiture',              svgClass: 'ap-si-toiture'      },
    { value: 'bricolage',    label: 'Bricolage',            svgClass: 'ap-si-bricolage'    }
  ];

  var CITIES = [
    'Casablanca', 'Rabat', 'F\u00e8s', 'Tanger',
    'Marrakech', 'Agadir', 'Mekn\u00e8s', 'Oujda',
    'K\u00e9nitra', 'T\u00e9touan', 'Safi', 'El Jadida'
  ];

  var MODES = {
    'new': {
      kicker: 'Rejoindre Fixeo',
      title: 'Activez votre pr\u00e9sence artisan',
      subtitle: 'Cr\u00e9ez votre profil et commencez \u00e0 recevoir des demandes de clients v\u00e9rifi\u00e9s.',
      cta: 'Rejoindre le r\u00e9seau Fixeo',
      hint: 'Votre profil sera actif imm\u00e9diatement apr\u00e8s validation.',
      system: [
        { icon: '\u25CF', text: 'Les demandes sont distribu\u00e9es selon votre m\u00e9tier et votre ville.' },
        { icon: '\u25CE', text: 'Votre visibilit\u00e9 d\u00e9pend de votre zone d\u2019intervention.' },
        { icon: '\u25A3', text: 'Les profils sont v\u00e9rifi\u00e9s avant activation compl\u00e8te.' }
      ]
    },
    'claim': {
      kicker: 'Revendiquer un profil',
      title: 'Activez votre pr\u00e9sence existante',
      subtitle: 'Votre fiche existe peut-\u00eatre d\u00e9j\u00e0 sur Fixeo. Renseignez vos informations pour la r\u00e9clamer.',
      cta: 'Demander la revendication de mon profil',
      hint: 'Votre profil pourra \u00eatre activ\u00e9 apr\u00e8s validation par l\u2019\u00e9quipe Fixeo.',
      system: [
        { icon: '\u25A3', text: 'Nous utiliserons ces informations pour v\u00e9rifier votre profil.' },
        { icon: '\u25CE', text: 'Votre ville et votre m\u00e9tier permettent d\u2019identifier votre fiche.' },
        { icon: '\u25B7', text: 'La v\u00e9rification prend g\u00e9n\u00e9ralement moins de 24h.' }
      ]
    }
  };

  var _currentMode = 'new';

  /* ── Helpers ──────────────────────────────────────────────────────── */

  function $id(id) { return document.getElementById(id); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  /* ── Mode selector injection ─────────────────────────────────────── */

  function injectModeSelector(form) {
    if ($('.fxao3-mode-selector')) return;

    var selector = document.createElement('div');
    selector.className = 'fxao3-mode-selector';

    var cards = [
      { mode: 'new',   icon: '\u2B50', title: 'Nouveau sur Fixeo',    meta: 'Cr\u00e9ez votre pr\u00e9sence et recevez des demandes.' },
      { mode: 'claim', icon: '\u25A1', title: 'Revendiquer un profil', meta: 'Votre fiche existe peut-\u00eatre d\u00e9j\u00e0 sur Fixeo. Activez-la.' }
    ];

    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'fxao3-mode-card';
      card.dataset.mode = c.mode;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', c.mode === 'new' ? 'true' : 'false');
      card.innerHTML =
        '<span class="fxao3-mode-check" aria-hidden="true">\u2713</span>' +
        '<span class="fxao3-mode-icon" aria-hidden="true">' + c.icon + '</span>' +
        '<span class="fxao3-mode-title">' + c.title + '</span>' +
        '<span class="fxao3-mode-meta">' + c.meta + '</span>';

      card.addEventListener('click', function () { switchMode(c.mode); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchMode(c.mode); }
      });

      selector.appendChild(card);
    });

    /* Insert before form */
    form.parentElement.insertBefore(selector, form);

    /* Set initial selection */
    selector.classList.add('fxao3-has-mode');
    selector.querySelector('[data-mode="new"]').classList.add('fxao3-selected');
  }

  /* ── Mode switch ──────────────────────────────────────────────────── */

  function switchMode(mode) {
    if (mode !== 'new' && mode !== 'claim') return;
    _currentMode = mode;

    var selector = $('.fxao3-mode-selector');
    if (selector) {
      selector.querySelectorAll('.fxao3-mode-card').forEach(function (c) {
        var isThis = c.dataset.mode === mode;
        c.classList.toggle('fxao3-selected', isThis);
        c.setAttribute('aria-pressed', isThis ? 'true' : 'false');
      });
    }

    var cfg = MODES[mode];
    var card = $('.artisan-onboarding-card');

    /* Title */
    var title = $id('artisan-onboarding-title');
    if (title) title.textContent = cfg.title;

    /* Subtitle */
    var subtitle = $('.artisan-onboarding-card > p');
    if (subtitle) subtitle.textContent = cfg.subtitle;

    /* Kicker */
    var kicker = $('.artisan-onboarding-kicker');
    if (kicker) kicker.textContent = cfg.kicker;

    /* CTA */
    var cta = $id('artisan-submit-btn');
    if (cta) cta.textContent = cfg.cta;

    /* Hint — only update if badge row not yet injected (avoid clobbering badge row) */
    var hint = document.querySelector('#artisan-onboarding-form .artisan-onboarding-hint');
    if (hint && !hint.querySelector('.fxao3-badge-row')) {
      hint.textContent = cfg.hint;
    }

    /* System block */
    updateSystemBlock(cfg.system);

    /* Hidden activation mode field */
    var modeField = $id('artisan-activation-mode');
    if (modeField) modeField.value = mode;

    /* Form mode class */
    if (card) {
      card.classList.toggle('fxao3-new-mode', mode === 'new');
      card.classList.toggle('fxao3-claim-mode', mode === 'claim');
    }
  }

  function updateSystemBlock(lines) {
    var block = $('.fxao3-system-block');
    if (!block) return;
    block.innerHTML = '';
    lines.forEach(function (l) {
      var line = document.createElement('div');
      line.className = 'fxao3-system-line';
      line.innerHTML =
        '<span class="fxao3-system-line-icon" aria-hidden="true">' + l.icon + '</span>' +
        '<span>' + l.text + '</span>';
      block.appendChild(line);
    });
  }

  /* ── Métier cards injection ──────────────────────────────────────── */

  function injectMetierGrid(form) {
    var categoryField = form.querySelector('[data-field="category"]');
    if (!categoryField) return;
    if (categoryField.querySelector('.fxao3-metier-grid')) return;

    var nativeSelect = $id('artisan-category');
    var label = categoryField.querySelector('label');

    var grid = document.createElement('div');
    grid.className = 'fxao3-metier-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Choisissez votre m\u00e9tier');

    METIERS.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'fxao3-metier-card';
      card.dataset.value = m.value;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', 'false');
      /* Use SVG CSS icon (same system as Auth V7 ap-scard-icon) — zero emoji dependency */
      card.innerHTML =
        '<span class="fxao3-metier-icon ap-scard-icon ' + m.svgClass + '" aria-hidden="true"></span>' +
        '<span class="fxao3-metier-label">' + m.label + '</span>';

      card.addEventListener('click', function () { selectMetier(m.value, grid, nativeSelect); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMetier(m.value, grid, nativeSelect); }
      });

      grid.appendChild(card);
    });

    /* Insert grid after label */
    if (label) {
      label.insertAdjacentElement('afterend', grid);
    } else {
      categoryField.insertBefore(grid, nativeSelect);
    }

    /* Prefill from native select if already has value */
    if (nativeSelect && nativeSelect.value) {
      selectMetier(nativeSelect.value, grid, nativeSelect);
    }
  }

  function selectMetier(value, grid, nativeSelect) {
    var wasSelected = grid.querySelector('[data-value="' + value + '"]')?.classList.contains('fxao3-metier-sel');

    grid.querySelectorAll('.fxao3-metier-card').forEach(function (c) {
      c.classList.remove('fxao3-metier-sel');
      c.setAttribute('aria-pressed', 'false');
    });

    if (!wasSelected) {
      var card = grid.querySelector('[data-value="' + value + '"]');
      if (card) {
        card.classList.add('fxao3-metier-sel');
        card.setAttribute('aria-pressed', 'true');
        grid.classList.add('fxao3-has-sel');
      }
      if (nativeSelect) {
        nativeSelect.value = value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      grid.classList.remove('fxao3-has-sel');
      if (nativeSelect) {
        nativeSelect.value = '';
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  /* ── City chips injection ────────────────────────────────────────── */

  function injectCityChips(form) {
    var cityField = form.querySelector('[data-field="city"]');
    if (!cityField) return;
    if (cityField.querySelector('.fxao3-city-grid')) return;

    var nativeSelect = $id('artisan-city');
    var label = cityField.querySelector('label');

    var cityGrid = document.createElement('div');
    cityGrid.className = 'fxao3-city-grid';
    cityGrid.setAttribute('role', 'group');
    cityGrid.setAttribute('aria-label', 'Choisissez votre ville');

    CITIES.forEach(function (city) {
      var chip = document.createElement('div');
      chip.className = 'fxao3-city-chip';
      chip.dataset.city = city;
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML =
        '<span class="fxao3-city-check" aria-hidden="true">\u2713</span>' +
        city;

      chip.addEventListener('click', function () { selectCity(city, cityGrid, nativeSelect); });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCity(city, cityGrid, nativeSelect); }
      });

      cityGrid.appendChild(chip);
    });

    if (label) {
      label.insertAdjacentElement('afterend', cityGrid);
    } else {
      cityField.insertBefore(cityGrid, nativeSelect);
    }

    /* Prefill */
    if (nativeSelect && nativeSelect.value) {
      selectCity(nativeSelect.value, cityGrid, nativeSelect);
    }
  }

  function selectCity(city, cityGrid, nativeSelect) {
    var wasSelected = cityGrid.querySelector('[data-city="' + city + '"]')?.classList.contains('fxao3-city-sel');

    cityGrid.querySelectorAll('.fxao3-city-chip').forEach(function (c) {
      c.classList.remove('fxao3-city-sel');
      c.setAttribute('aria-pressed', 'false');
    });

    if (!wasSelected) {
      var chip = cityGrid.querySelector('[data-city="' + city + '"]');
      if (chip) {
        chip.classList.add('fxao3-city-sel');
        chip.setAttribute('aria-pressed', 'true');
        cityGrid.classList.add('fxao3-city-has-sel');
      }
      if (nativeSelect) {
        nativeSelect.value = city;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      cityGrid.classList.remove('fxao3-city-has-sel');
      if (nativeSelect) {
        nativeSelect.value = '';
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  /* ── Phone hint injection ────────────────────────────────────────── */

  function injectPhoneHint(form) {
    var phoneField = form.querySelector('[data-field="phone"]');
    if (!phoneField || phoneField.querySelector('.fxao3-phone-hint')) return;

    var phoneInput = $id('artisan-phone');
    var hint = document.createElement('div');
    hint.className = 'fxao3-phone-hint';
    hint.innerHTML =
      '<span class="fxao3-phone-hint-icon" aria-hidden="true">\u25CF</span>' +
      '<span>Les clients pourront vous contacter rapidement via WhatsApp ou t\u00e9l\u00e9phone.</span>';

    phoneInput?.insertAdjacentElement('afterend', hint);
  }

  /* ── Description label rewrite ───────────────────────────────────── */

  function upgradeDescriptionField(form) {
    var descField = form.querySelector('[data-field="description"]');
    if (!descField) return;
    var label = descField.querySelector('label');
    if (label && !label.dataset.v3) {
      label.dataset.v3 = '1';
      label.innerHTML = 'Pr\u00e9sentez rapidement votre activit\u00e9 <span class="artisan-onboarding-hint" style="text-transform:none;">(optionnel)</span>';
    }
    var textarea = $id('artisan-description');
    if (textarea && !textarea.dataset.v3) {
      textarea.dataset.v3 = '1';
      textarea.placeholder = 'Zone d\u2019intervention, sp\u00e9cialit\u00e9s, exp\u00e9rience, disponibilit\u00e9\u2026';
    }
  }

  /* ── System perception block injection ──────────────────────────── */

  function injectSystemBlock(form) {
    if ($('.fxao3-system-block')) return;

    var submitBtn = $id('artisan-submit-btn');
    if (!submitBtn) return;

    var block = document.createElement('div');
    block.className = 'fxao3-system-block';
    submitBtn.insertAdjacentElement('beforebegin', block);

    /* Will be populated by switchMode */
    updateSystemBlock(MODES[_currentMode].system);
  }

  /* ── Badge chips injection ───────────────────────────────────────── */

  function injectBadgeRow(form) {
    /* Target the static HTML hint right after #artisan-submit-btn */
    var submitBtn = $id('artisan-submit-btn');
    var hint = submitBtn ? submitBtn.nextElementSibling : null;
    if (!hint || !hint.classList.contains('artisan-onboarding-hint')) {
      /* Fallback: last .artisan-onboarding-hint in form */
      var all = form.querySelectorAll('.artisan-onboarding-hint');
      hint = all.length ? all[all.length - 1] : null;
    }
    if (!hint || hint.querySelector('.fxao3-badge-row')) return;

    /* Replace old hint text with badge row + subtle text */
    var badgeRow = document.createElement('div');
    badgeRow.className = 'fxao3-badge-row';
    badgeRow.innerHTML =
      '<span class="fxao3-badge fxao3-badge-new">Nouveau</span>' +
      '<span class="fxao3-badge fxao3-badge-online"><span class="fxao3-badge-online-dot"></span>En ligne</span>' +
      '<span class="fxao3-badge fxao3-badge-pending">Profil en v\u00e9rification</span>';
    hint.innerHTML = '';
    hint.appendChild(badgeRow);
  }

  /* ── Claim note injection ────────────────────────────────────────── */

  function injectClaimNote(form) {
    if ($('.fxao3-claim-note')) return;
    var firstField = form.querySelector('[data-field="name"]');
    if (!firstField) return;

    var note = document.createElement('div');
    note.className = 'fxao3-claim-note';
    note.innerHTML =
      '<span class="fxao3-claim-note-icon" aria-hidden="true">\u25A3</span>' +
      '<span>Nous utiliserons ces informations pour v\u00e9rifier votre profil existant. <strong style="color:rgba(255,255,255,0.55);">Aucun faux profil ne sera cr\u00e9\u00e9.</strong> Votre demande de revendication sera examin\u00e9e par l\u2019\u00e9quipe Fixeo.</span>';

    /* Insert after first field */
    firstField.insertAdjacentElement('afterend', note);
  }

  /* ── Hidden activation mode field ───────────────────────────────── */

  function injectModeField(form) {
    if ($id('artisan-activation-mode')) return;
    var field = document.createElement('input');
    field.type = 'hidden';
    field.id = 'artisan-activation-mode';
    field.name = 'artisan_activation_mode';
    field.value = _currentMode;
    form.appendChild(field);
  }

  /* ── Name label rewrite ──────────────────────────────────────────── */

  function upgradeNameField(form) {
    var nameField = form.querySelector('[data-field="name"]');
    if (!nameField) return;
    var label = nameField.querySelector('label');
    if (label && !label.dataset.v3) {
      label.dataset.v3 = '1';
      label.textContent = 'Votre nom complet';
    }
    var input = $id('artisan-name');
    if (input && !input.dataset.v3) {
      input.dataset.v3 = '1';
      input.placeholder = 'Ex\u00a0: Mohamed Alaoui';
    }
  }

  /* ── Initial mode setup ──────────────────────────────────────────── */

  function applyInitialMode(form) {
    var card = $('.artisan-onboarding-card');
    if (card) card.classList.add('fxao3-new-mode');
    switchMode('new');
  }

  /* ── Bootstrap ───────────────────────────────────────────────────── */

  function init() {
    var form = $id('artisan-onboarding-form');
    if (!form) return;

    /* Wait for artisan-onboarding.js to finish populating selects (async loadConfig) */
    window.setTimeout(function () {
      injectModeSelector(form);
      injectMetierGrid(form);
      injectCityChips(form);
      injectPhoneHint(form);
      upgradeDescriptionField(form);
      upgradeNameField(form);
      injectSystemBlock(form);
      injectBadgeRow(form);
      injectClaimNote(form);
      injectModeField(form);
      applyInitialMode(form);

      /* Also sync if native select gets values set (e.g. ?metier= URL param) */
      var nativeCat  = $id('artisan-category');
      var nativeCity = $id('artisan-city');
      var metierGrid = form.querySelector('.fxao3-metier-grid');
      var cityGrid   = form.querySelector('.fxao3-city-grid');

      if (nativeCat && metierGrid && nativeCat.value) {
        var cardEl = metierGrid.querySelector('[data-value="' + nativeCat.value + '"]');
        if (cardEl) {
          cardEl.classList.add('fxao3-metier-sel');
          cardEl.setAttribute('aria-pressed', 'true');
          metierGrid.classList.add('fxao3-has-sel');
        }
      }
      if (nativeCity && cityGrid && nativeCity.value) {
        var chipEl = cityGrid.querySelector('[data-city="' + nativeCity.value + '"]');
        if (chipEl) {
          chipEl.classList.add('fxao3-city-sel');
          chipEl.setAttribute('aria-pressed', 'true');
          cityGrid.classList.add('fxao3-city-has-sel');
        }
      }

      /* Secondary CTA text fix — after artisan-onboarding.js async init completes */
      window.setTimeout(function () {
        var cta = $id('artisan-submit-btn');
        var cfg = MODES[_currentMode];
        if (cta && cfg) cta.textContent = cfg.cta;
      }, 600);

    }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
