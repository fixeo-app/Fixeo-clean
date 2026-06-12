/**
 * FIXEO Request Modal V2 — fixeo-request-modal-v2.js
 * Version: rmv2-v1a — 2026-06-12
 * ─────────────────────────────────────────────────────────────────
 * PROGRESSIVE ENHANCEMENT over existing #request-modal.
 * Preserves ALL existing IDs so request-form.js continues to work:
 *   #request-form, #request-problem, #request-city, #request-phone
 *   #request-budget, #request-description, #request-success
 *   input[name="urgence"], .request-submit-btn
 *
 * STRATEGY:
 *   1. Intercepts #request-modal open (via MutationObserver on .open class)
 *   2. Injects chip UI on top of existing form fields
 *   3. Chips write directly to native inputs → request-form.js reads them normally
 *   4. Tracking/dispatch/notifications all unchanged — same event chain
 *   5. If upgrade() throws → original form remains fully functional (try/catch)
 *
 * NEVER TOUCHES:
 *   - request-form.js submit logic
 *   - fixeo-client-requests-store.js
 *   - fixeo-reservation-supabase-bridge.js
 *   - any notification/dispatch engine
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window._fxRMV2Loaded) return;
  window._fxRMV2Loaded = true;

  var VERSION = 'rmv2-v1a';

  /* ── Problem chips — maps to normalized service slugs ── */
  var PROBLEMS_URGENT = [
    { icon: '💧', label: 'Fuite d\'eau',       text: 'fuite d\'eau',      hint: 'Cuisine, salle de bain, robinet, canalisation…',    slug: 'plomberie'    },
    { icon: '⚡', label: 'Panne électrique',   text: 'panne électrique',  hint: 'Disjoncteur, court-circuit, prise, tableau…',        slug: 'electricite'  },
    { icon: '🔒', label: 'Porte bloquée',      text: 'porte bloquée',     hint: 'Serrure forcée, clé cassée, verrou…',                slug: 'serrurerie'   },
    { icon: '❄️', label: 'Clim en panne',      text: 'clim en panne',     hint: 'Modèle, étage, symptômes…',                         slug: 'climatisation'},
    { icon: '🔥', label: 'Chauffe-eau / gaz',  text: 'chauffe-eau',       hint: 'Fuite, pas d\'eau chaude, odeur de gaz…',            slug: 'plomberie'    },
    { icon: '🔧', label: 'Autre urgence',       text: 'urgence',           hint: 'Décrivez votre problème…',                          slug: ''             }
  ];

  var PROBLEMS_STANDARD = [
    { icon: '🚿', label: 'Plomberie',           text: 'plomberie',         hint: 'Fuite, installation sanitaire, chauffe-eau…',        slug: 'plomberie'    },
    { icon: '⚡', label: 'Électricité',         text: 'électricité',       hint: 'Tableau, prises, éclairage, câblage…',              slug: 'electricite'  },
    { icon: '🎨', label: 'Peinture',            text: 'peinture',          hint: 'Intérieur, extérieur, façade, ravalement…',          slug: 'peinture'     },
    { icon: '🪚', label: 'Menuiserie',          text: 'menuiserie',        hint: 'Portes, placards, parquet, boiseries…',              slug: 'menuiserie'   },
    { icon: '❄️', label: 'Climatisation',       text: 'climatisation',     hint: 'Installation, dépannage, entretien…',                slug: 'climatisation'},
    { icon: '🔒', label: 'Serrurerie',          text: 'serrurerie',        hint: 'Serrure, cylindre, porte blindée…',                  slug: 'serrurerie'   },
    { icon: '🧱', label: 'Maçonnerie',          text: 'maçonnerie',        hint: 'Murs, béton, carrelage, dallage…',                   slug: 'maconnerie'   },
    { icon: '🧹', label: 'Nettoyage',           text: 'nettoyage',         hint: 'Ménage, désinfection, vitres…',                     slug: 'nettoyage'    },
    { icon: '🌿', label: 'Jardinage',           text: 'jardinage',         hint: 'Taille, pelouse, arrosage, haie…',                   slug: 'jardinage'    },
    { icon: '🚚', label: 'Déménagement',        text: 'déménagement',      hint: 'Meubles, cartons, transport…',                       slug: 'demenagement' },
    { icon: '🏠', label: 'Toiture',             text: 'toiture',           hint: 'Fuite, tuiles, étanchéité…',                        slug: 'toiture'      },
    { icon: '✏️', label: 'Autre',               text: '',                  hint: 'Décrivez votre besoin…',                            slug: ''             }
  ];

  var CITIES_20 = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger',
    'Agadir','Meknès','Oujda','Kénitra','Tétouan',
    'Salé','Temara','El Jadida','Béni Mellal','Nador',
    'Khouribga','Safi','Taza','Ouarzazate','Mohammedia'
  ];

  /* ── Helpers ── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function setNativeValue(input, value) {
    /* Fires both change + input so framework listeners pick up the new value */
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ── Main upgrade function ── */
  function upgradeModal(modal, mode) {
    if (modal.dataset.fxRmv2 === mode) return; /* already upgraded for this mode */
    modal.dataset.fxRmv2 = mode;

    var form = $('#request-form', modal);
    if (!form) return;

    var problemInput = $('#request-problem', form);
    var citySelect   = $('#request-city',    form);
    if (!problemInput || !citySelect) return;

    var isExpress = (mode === 'express');
    var problems  = isExpress ? PROBLEMS_URGENT : PROBLEMS_STANDARD;

    /* ── 1. Problem chip grid ─────────────────────────────── */
    if (!form.querySelector('.fxrm2-chip-grid')) {
      var problemField = problemInput.closest('.request-field') || problemInput.parentElement;

      var chipWrap = document.createElement('div');
      chipWrap.className = 'fxrm2-chip-section';

      var chipLabel = document.createElement('p');
      chipLabel.className = 'fxrm2-chip-label';
      chipLabel.textContent = isExpress ? 'Quel est le problème ?' : 'Quel service recherchez-vous ?';
      chipWrap.appendChild(chipLabel);

      var grid = document.createElement('div');
      grid.className = 'fxrm2-chip-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Catégorie de service');

      problems.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fxrm2-chip';
        btn.setAttribute('aria-pressed', 'false');
        btn.dataset.slug = p.slug;
        btn.dataset.text = p.text;
        btn.dataset.hint = p.hint;
        btn.innerHTML = '<span class="fxrm2-chip-icon" aria-hidden="true">' + p.icon + '</span>'
                      + '<span class="fxrm2-chip-label-text">' + esc(p.label) + '</span>';

        btn.addEventListener('click', function () {
          /* Deselect all */
          grid.querySelectorAll('.fxrm2-chip').forEach(function (c) {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('selected');
          btn.setAttribute('aria-pressed', 'true');

          /* Write to native problem input */
          setNativeValue(problemInput, p.text || '');

          /* Update hint placeholder */
          if (p.hint) problemInput.placeholder = p.hint;

          /* Update city chips if showing */
          var citySection = form.querySelector('.fxrm2-city-section');
          if (citySection) citySection.classList.add('fxrm2-visible');

          /* Auto-focus problem input if "Autre" selected */
          if (!p.text) {
            problemInput.placeholder = p.hint;
            setTimeout(function () { problemInput.focus(); }, 50);
          }
        });

        grid.appendChild(btn);
      });
      chipWrap.appendChild(grid);
      problemField.insertAdjacentElement('afterend', chipWrap);

      /* Hide the native problem input visually but keep it in DOM for request-form.js */
      problemInput.classList.add('fxrm2-native-hidden');
    }

    /* ── 2. City chip row ─────────────────────────────────── */
    if (!form.querySelector('.fxrm2-city-section')) {
      var cityField = citySelect.closest('.request-field') || citySelect.parentElement;

      var cityWrap = document.createElement('div');
      cityWrap.className = 'fxrm2-city-section';

      var cityLbl = document.createElement('p');
      cityLbl.className = 'fxrm2-chip-label';
      cityLbl.textContent = '📍 Votre ville ?';
      cityWrap.appendChild(cityLbl);

      var cityRow = document.createElement('div');
      cityRow.className = 'fxrm2-city-row';

      CITIES_20.forEach(function (city) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fxrm2-city-chip';
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = city;

        btn.addEventListener('click', function () {
          cityRow.querySelectorAll('.fxrm2-city-chip').forEach(function (c) {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('selected');
          btn.setAttribute('aria-pressed', 'true');

          /* Write to native city select */
          setNativeValue(citySelect, city);

          /* Scroll to phone field for express, or show hint */
          if (isExpress) {
            var phoneInput = $('#request-phone', form);
            if (phoneInput) {
              setTimeout(function () { phoneInput.focus(); }, 100);
            }
          }
        });
        cityRow.appendChild(btn);
      });
      cityWrap.appendChild(cityRow);

      /* Pre-sync: if city select already has a value, mark the chip */
      if (citySelect.value) {
        var existingVal = citySelect.value;
        cityRow.querySelectorAll('.fxrm2-city-chip').forEach(function (c) {
          if (c.textContent.trim() === existingVal) {
            c.classList.add('selected');
            c.setAttribute('aria-pressed', 'true');
          }
        });
      }

      cityField.insertAdjacentElement('afterend', cityWrap);

      /* Hide native city select visually but keep in DOM */
      citySelect.classList.add('fxrm2-native-hidden');
    }

    /* ── 3. Mobile phone input upgrade ──────────────────── */
    var phoneInput = $('#request-phone', form);
    if (phoneInput && !phoneInput.classList.contains('fxrm2-phone-upgraded')) {
      phoneInput.classList.add('fxrm2-phone-upgraded');
      phoneInput.setAttribute('inputmode', 'tel');
      phoneInput.setAttribute('autocomplete', 'tel');
      phoneInput.setAttribute('pattern', '[0-9+\\s]{8,15}');
      if (!phoneInput.placeholder || phoneInput.placeholder === '06 12 34 56 78') {
        phoneInput.placeholder = isExpress ? '📱 06 XX XX XX XX' : '06 XX XX XX XX';
      }
    }

    /* ── 4. Express mode: pre-select "Urgent" radio ───── */
    if (isExpress) {
      var urgentRadio = form.querySelector('input[name="urgence"][value="Urgent (moins de 30 min)"]');
      if (urgentRadio) urgentRadio.checked = true;
    }
  }

  /* ── Teardown: reset chip state on modal close ── */
  function resetChips(modal) {
    modal.dataset.fxRmv2 = '';
    var form = $('#request-form', modal);
    if (!form) return;

    /* Remove injected sections */
    form.querySelectorAll('.fxrm2-chip-section, .fxrm2-city-section').forEach(function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });

    /* Restore native inputs */
    var problemInput = $('#request-problem', form);
    var citySelect   = $('#request-city',    form);
    if (problemInput) problemInput.classList.remove('fxrm2-native-hidden');
    if (citySelect)   citySelect.classList.remove('fxrm2-native-hidden');
    if (problemInput) problemInput.classList.remove('fxrm2-phone-upgraded');

    var phoneInput = $('#request-phone', form);
    if (phoneInput)   phoneInput.classList.remove('fxrm2-phone-upgraded');
  }

  /* ── Observe #request-modal for class changes ── */
  var modal = document.getElementById('request-modal');
  if (!modal) return; /* page doesn't have the modal — safe exit */

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName !== 'class' && m.attributeName !== 'data-request-mode') return;

      var isOpen = modal.classList.contains('open');
      var mode   = modal.getAttribute('data-request-mode') || 'default';

      if (isOpen) {
        /* Small defer — let request-form.js initialize first */
        setTimeout(function () {
          try { upgradeModal(modal, mode); } catch (e) {
            console.warn('[fxRMv2] upgrade error:', e && e.message);
          }
        }, 30);
      } else {
        /* Reset chip state when modal closes so next open starts fresh */
        try { resetChips(modal); } catch (_) {}
      }
    });
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['class', 'data-request-mode'] });

  /* ── Expose public API ── */
  window.FixeoRequestModalV2 = {
    VERSION: VERSION,
    upgradeModal: upgradeModal,
    resetChips: resetChips
  };

})();
