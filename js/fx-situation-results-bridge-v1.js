/**
 * fx-situation-results-bridge-v1.js
 * Phase 3B — Situation → Artisan Results Continuity
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a compact, inline context header inside #artisans-section that
 * confirms the selected situation and city before the artisan grid.
 *
 * Invariants:
 *   - NEVER modifies filter logic (applyMarketplaceFilters, renderArtisans)
 *   - NEVER modifies scroll logic (homepage-conversion-optimizer.js)
 *   - NEVER modifies situation cards (frozen Phase 3A)
 *   - NEVER modifies RAFI (fx-request-flow-v4.js, request-form.js, fixeo-rafi-os-v1.js)
 *   - Purely additive: one new DOM element, one delegated listener
 *   - No globals, no setInterval, no rAF loops
 *
 * DOM insertion: inside #artisans-section .results-page-shell,
 *   before the .results-layout div.
 *
 * Namespace: fxasb-* (fx-artisan-section-bridge)
 */
(function (window, document) {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
     §1  CATEGORY METADATA
     Mirrors fxnb-need-builder.js ICON_MAP / LABEL_MAP — standalone, no import.
  ───────────────────────────────────────────────────────────────────────── */
  var CAT_META = {
    plomberie:    { icon: '🔧', label: 'Plomberie' },
    electricite:  { icon: '⚡', label: 'Électricité' },
    serrurerie:   { icon: '🔑', label: 'Serrurerie' },
    climatisation:{ icon: '❄️', label: 'Climatisation' },
    menuiserie:   { icon: '🪵', label: 'Menuiserie' },
    peinture:     { icon: '🎨', label: 'Peinture' },
    maconnerie:   { icon: '🧱', label: 'Maçonnerie' },
    nettoyage:    { icon: '🧹', label: 'Nettoyage' },
    carrelage:    { icon: '🏁', label: 'Carrelage' },
    jardinage:    { icon: '🌿', label: 'Jardinage' },
    bricolage:    { icon: '🔩', label: 'Bricolage' },
    demenagement: { icon: '🚛', label: 'Déménagement' }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     §2  CSS — scoped to fxasb-* namespace
     Injected once into <head>. Contains all states.
  ───────────────────────────────────────────────────────────────────────── */
  var CSS = [
    /* Context header container */
    '#fxasb-header {',
    '  display: none;',                          /* hidden until first activation  */
    '  align-items: center;',
    '  gap: 10px;',
    '  padding: 12px 0 20px 0;',                /* above the artisan grid         */
    '  opacity: 0;',
    '  transform: translateY(-6px);',
    '  transition: opacity 0.22s ease, transform 0.22s ease;',
    '  will-change: opacity, transform;',
    '}',

    /* Visible state */
    '#fxasb-header.fxasb-visible {',
    '  display: flex;',
    '  opacity: 1;',
    '  transform: none;',
    '}',

    /* Reduced motion: remove animation, still show */
    '@media (prefers-reduced-motion: reduce) {',
    '  #fxasb-header {',
    '    transition: none;',
    '  }',
    '}',

    /* Status pill (✓ confirmed) */
    '.fxasb-pill {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 5px;',
    '  padding: 3px 8px 3px 6px;',
    '  background: rgba(93, 170, 100, 0.12);',  /* muted green, not alarming      */
    '  border: 1px solid rgba(93, 170, 100, 0.25);',
    '  border-radius: 20px;',
    '  font-size: 0.70rem;',
    '  font-weight: 600;',
    '  letter-spacing: 0.04em;',
    '  color: #7dbf84;',
    '  white-space: nowrap;',
    '  flex-shrink: 0;',
    '}',
    '.fxasb-pill-dot {',
    '  width: 6px;',
    '  height: 6px;',
    '  border-radius: 50%;',
    '  background: #7dbf84;',
    '  flex-shrink: 0;',
    '}',

    /* Divider between pill and metier */
    '.fxasb-sep {',
    '  width: 1px;',
    '  height: 16px;',
    '  background: rgba(255,255,255,0.12);',
    '  flex-shrink: 0;',
    '}',

    /* Metier block: icon + name */
    '.fxasb-metier {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  min-width: 0;',
    '}',
    '.fxasb-metier-icon {',
    '  font-size: 1.0rem;',
    '  line-height: 1;',
    '  flex-shrink: 0;',
    '}',
    '.fxasb-metier-name {',
    '  font-size: 0.9rem;',
    '  font-weight: 700;',
    '  color: #e8eaf2;',
    '  letter-spacing: 0.01em;',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '}',

    /* City tag */
    '.fxasb-city {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 4px;',
    '  font-size: 0.80rem;',
    '  color: rgba(185, 192, 212, 0.85);',
    '  white-space: nowrap;',
    '  flex-shrink: 0;',
    '}',
    '.fxasb-city::before {',
    '  content: "·";',
    '  color: rgba(255,255,255,0.2);',
    '  margin-right: 2px;',
    '}',

    /* Section title: "Artisans correspondants" */
    '.fxasb-section-title {',
    '  display: none;',                          /* hidden when no filter active   */
    '  font-size: 0.7rem;',
    '  font-weight: 700;',
    '  letter-spacing: 0.12em;',
    '  text-transform: uppercase;',
    '  color: rgba(185, 192, 212, 0.5);',
    '  padding-bottom: 8px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.06);',
    '  margin-bottom: 4px;',
    '}',
    '.fxasb-section-title.fxasb-shown {',
    '  display: block;',
    '}',

    /* Mobile: ensure full-width, no overflow */
    '@media (max-width: 480px) {',
    '  #fxasb-header {',
    '    flex-wrap: wrap;',
    '    gap: 8px;',
    '    padding: 10px 0 16px 0;',
    '  }',
    '  .fxasb-metier-name {',
    '    font-size: 0.85rem;',
    '  }',
    '}'
  ].join('\n');

  /* ─────────────────────────────────────────────────────────────────────────
     §3  INJECT CSS
  ───────────────────────────────────────────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('fxasb-style')) return;
    var s = document.createElement('style');
    s.id = 'fxasb-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §4  BUILD HEADER DOM
     Inserted inside #artisans-section .results-page-shell,
     before .results-layout.
  ───────────────────────────────────────────────────────────────────────── */
  function _buildHeader() {
    if (document.getElementById('fxasb-header')) return;

    var shell = document.querySelector('#artisans-section .results-page-shell');
    if (!shell) return;

    var layout = shell.querySelector('.results-layout');
    if (!layout) return;

    /* Section title above the context row */
    var sectionTitle = document.createElement('p');
    sectionTitle.id = 'fxasb-section-title';
    sectionTitle.className = 'fxasb-section-title';
    sectionTitle.textContent = 'Artisans correspondants';
    sectionTitle.setAttribute('aria-hidden', 'true');

    /* Context row */
    var header = document.createElement('div');
    header.id = 'fxasb-header';
    header.setAttribute('role', 'status');
    header.setAttribute('aria-live', 'polite');
    header.setAttribute('aria-atomic', 'true');

    /* Status pill */
    var pill = document.createElement('span');
    pill.className = 'fxasb-pill';
    pill.innerHTML = '<span class="fxasb-pill-dot" aria-hidden="true"></span>Besoin identifié';

    /* Sep */
    var sep = document.createElement('span');
    sep.className = 'fxasb-sep';
    sep.setAttribute('aria-hidden', 'true');

    /* Metier block */
    var metier = document.createElement('span');
    metier.className = 'fxasb-metier';
    metier.innerHTML = '<span class="fxasb-metier-icon" id="fxasb-icon" aria-hidden="true"></span>' +
                       '<span class="fxasb-metier-name" id="fxasb-name"></span>';

    /* City tag */
    var city = document.createElement('span');
    city.className = 'fxasb-city';
    city.id = 'fxasb-city';
    city.setAttribute('aria-hidden', 'true');

    header.appendChild(pill);
    header.appendChild(sep);
    header.appendChild(metier);
    header.appendChild(city);

    /* Insert section title then context row before .results-layout */
    shell.insertBefore(header, layout);
    shell.insertBefore(sectionTitle, header);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §5  CITY RESOLVER
     Reads from services-city-filter (primary), then localStorage fallback.
  ───────────────────────────────────────────────────────────────────────── */
  function _getCity() {
    var sel = document.getElementById('services-city-filter');
    if (sel && sel.value) return sel.value;
    try { return localStorage.getItem('fixeo_detected_city') || ''; } catch(e) { return ''; }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §6  UPDATE HEADER
     Called after renderArtisans has completed (via rAF to ensure paint).
  ───────────────────────────────────────────────────────────────────────── */
  function _updateHeader(cat) {
    var header = document.getElementById('fxasb-header');
    var sectionTitle = document.getElementById('fxasb-section-title');
    if (!header) return;

    /* cat = 'all' → hide context header */
    if (!cat || cat === 'all') {
      header.classList.remove('fxasb-visible');
      if (sectionTitle) sectionTitle.classList.remove('fxasb-shown');
      /* After transition completes, set display:none for accessibility */
      setTimeout(function () {
        if (!header.classList.contains('fxasb-visible')) {
          header.style.display = 'none';
        }
      }, 260);
      return;
    }

    var meta = CAT_META[cat];
    if (!meta) return; /* unknown category — do nothing */

    var city = _getCity();

    /* Update content */
    var iconEl = document.getElementById('fxasb-icon');
    var nameEl = document.getElementById('fxasb-name');
    var cityEl = document.getElementById('fxasb-city');

    if (iconEl) iconEl.textContent = meta.icon;
    if (nameEl) nameEl.textContent = meta.label;
    if (cityEl) {
      cityEl.textContent = city || '';
      cityEl.style.display = city ? '' : 'none';
    }

    /* Accessible summary for screen readers */
    header.setAttribute('aria-label',
      'Besoin identifié\u202f: ' + meta.label + (city ? ' à ' + city : ''));

    /* Show — two-step to allow CSS transition to trigger */
    header.style.display = 'flex';
    /* Force reflow so transition fires */
    header.offsetHeight; // jshint ignore:line
    header.classList.add('fxasb-visible');

    /* Section title */
    if (sectionTitle) sectionTitle.classList.add('fxasb-shown');
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §7  CHIP CLICK LISTENER
     Delegated on document — fires after main.js initCategoryChips() has
     already updated filter + called applyMarketplaceFilters().
     We use requestAnimationFrame to ensure renderArtisans DOM paint is done.
  ───────────────────────────────────────────────────────────────────────── */
  function _initListener() {
    /* Guard: only run once */
    if (window._fxasb_init) return;
    window._fxasb_init = true;

    document.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip[data-category]');
      if (!chip) return;

      var cat = chip.dataset.category || '';

      /* Wait for renderArtisans to complete, then update header */
      requestAnimationFrame(function () {
        _updateHeader(cat);
      });
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     §8  INIT
  ───────────────────────────────────────────────────────────────────────── */
  function _init() {
    _injectCSS();
    _buildHeader();
    _initListener();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

}(window, document));
