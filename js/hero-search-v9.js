/**
 * ================================================================
 *  FIXEO v9 — HERO SEARCH BAR UPGRADE ENGINE
 *  js/hero-search-v9.js
 *
 *  ▸ Intercepts the HERO smart-search bar (#ssb-btn-search click)
 *  ▸ Runs the same filter engine as QuickSearchModal / SecondarySearch
 *  ▸ Renders results directly in #hero-inline-results (below HERO)
 *  ▸ Cards use .qsm-card design (uniform with modal)
 *  ▸ Quick-filter chips toggle and live-update results
 *  ▸ Reservation + Express → window.FixeoReservation (centralised)
 *  ▸ Zero disruption to existing features
 *
 *  Dependencies (loaded before this file):
 *    - smart-search.js   → SSB_DATA, SSBNLPMapper, SmartSearch
 *    - main.js           → window.ARTISANS
 *    - reservation.js    → window.FixeoReservation
 *    - quick-search-modal.js → .qsm-card HTML / CSS classes
 * ================================================================
 */

'use strict';

(function (window) {

  /* ══════════════════════════════════════════════════════
     INTERNAL STATE
  ══════════════════════════════════════════════════════ */
  const st = {
    query:   '',
    cat:     '',
    city:    '',
    filters: { ssl: false, threeDSecure: false, verified: false, refund: false },
    results: [],
    searched: false,
    nlpMapper: null,
  };

  /* ══════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════ */

  function _norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function _initials(name) {
    return (name || '?').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  }

  function _stars(r) {
    const f = Math.round(parseFloat(r) || 4);
    return '★'.repeat(Math.max(0, f)) + '☆'.repeat(Math.max(0, 5 - f));
  }

  function _artisans() {
    return window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
  }

  function _nlpMapper() {
    if (st.nlpMapper) return st.nlpMapper;
    if (window.SmartSearch && window.SmartSearch._suggestor && window.SmartSearch._suggestor._nlp) {
      st.nlpMapper = window.SmartSearch._suggestor._nlp;
      return st.nlpMapper;
    }
    if (typeof SSBNLPMapper !== 'undefined') {
      st.nlpMapper = new SSBNLPMapper();
      return st.nlpMapper;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════
     FILTER ENGINE  (mirrors quick-search-modal + secondary-search)
  ══════════════════════════════════════════════════════ */

  function _filterArtisans(q, cat, city, filters) {
    let list = [..._artisans()];
    const n = _norm(q);

    /* NLP category detection */
    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      if (mapper) {
        const cats = mapper.detectMulti ? mapper.detectMulti(q) : [];
        if (cats.length) list = list.filter(a => cats.includes(a.category));
      }
    }

    /* Free-text fallback */
    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      const hasCat = mapper ? (mapper.detectMulti ? mapper.detectMulti(q) : []).length > 0 : false;
      if (!hasCat) {
        list = list.filter(a =>
          _norm(a.name).includes(n) ||
          _norm(a.category).includes(n) ||
          (a.skills || []).some(sk => _norm(sk).includes(n)) ||
          _norm((a.bio && a.bio.fr) || '').includes(n)
        );
      }
    }

    if (cat)  list = list.filter(a => a.category === cat);
    if (city) {
      const ck = _norm(city);
      list = list.filter(a => _norm(a.city || '') === ck);
    }

    if (filters.ssl)          list = list.filter(a => (a.trustScore || 0) >= 75);
    if (filters.threeDSecure) list = list.filter(a => (a.trustScore || 0) >= 85);
    if (filters.verified)     list = list.filter(a => (a.badges || []).includes('verified'));
    if (filters.refund)       list = list.filter(a => (a.reviewCount || 0) >= 20);

    /* Smart ranking */
    list.sort((a, b) => {
      const sa = (a.trustScore || 0) + (a.availability === 'available' ? 15 : 0)
               - (a.responseTime || 60) * 0.2 + (a.rating || 0) * 2;
      const sb = (b.trustScore || 0) + (b.availability === 'available' ? 15 : 0)
               - (b.responseTime || 60) * 0.2 + (b.rating || 0) * 2;
      return sb - sa;
    });

    return list;
  }

  /* ══════════════════════════════════════════════════════
     CARD RENDERER  — uses .qsm-card classes (uniform design)
  ══════════════════════════════════════════════════════ */

  const CAT_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'🚛', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠',
  };
  const CAT_LABELS = {
    plomberie:'Plomberie', electricite:'Électricité', peinture:'Peinture',
    nettoyage:'Nettoyage', jardinage:'Jardinage', demenagement:'Déménagement',
    bricolage:'Bricolage', climatisation:'Climatisation', menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie', serrurerie:'Serrurerie', carrelage:'Carrelage',
  };

  function _renderCard(a, idx) {
    const avail   = (a.availability || '').toLowerCase();
    const isAvail = avail === 'available';
    const dotCls  = isAvail ? 'available' : (avail === 'busy' ? 'busy' : 'offline');
    const catIcon = CAT_ICONS[a.category]  || '🛠️';
    const catLbl  = CAT_LABELS[a.category] || (a.category || 'Service');
    const rating  = parseFloat(a.rating)   || 4.8;
    const trust   = a.trustScore           || 0;
    const ini     = a.initials             || _initials(a.name);
    const feat    = idx === 0 ? ' qsm-card--featured' : '';
    const fastBdg = (a.responseTime && a.responseTime <= 25)
      ? `<span class="qsm-badge fast">⚡ &lt;${a.responseTime}min</span>` : '';
    const extraBdg = (a.badges || []).slice(0, 1).map(b => {
      if (b === 'verified') return '<span class="qsm-badge">✅ Vérifié</span>';
      if (b === 'pro')      return '<span class="qsm-badge">🥇 Pro</span>';
      if (b === 'top_rated')return '<span class="qsm-badge">⭐ Top</span>';
      return `<span class="qsm-badge">${b}</span>`;
    }).join('');

    return `
<div class="qsm-card${feat}" data-artisan-id="${a.id}">
  <div class="qsm-card-avatar">
    ${ini}
    <span class="qsm-avail-dot ${dotCls}" title="${isAvail ? 'Disponible' : avail === 'busy' ? 'Occupé' : 'Hors ligne'}"></span>
  </div>
  <div class="qsm-card-info">
    <div class="qsm-card-top">
      <span class="qsm-card-name">${a.name || ''}</span>
      ${isAvail ? '<span class="qsm-badge-available">⚡ Disponible aujourd\'hui</span>' : ''}
    </div>
    <div class="qsm-card-meta">
      <span class="qsm-stars">${_stars(rating)}</span>
      <span style="color:rgba(255,215,0,0.9);font-weight:700">${rating.toFixed(1)}</span>
      <span class="qsm-meta-sep">·</span>
      <span>${catIcon} ${catLbl}</span>
      <span class="qsm-meta-sep">·</span>
      <span>📍 ${a.city || 'Maroc'}</span>
      <span class="qsm-meta-sep">·</span>
      <span style="font-weight:600;color:rgba(255,255,255,0.7)">💰 ${a.priceFrom || 150} MAD/${a.priceUnit || 'h'}</span>
    </div>
    <div class="qsm-card-badges">
      ${trust >= 80 ? `<span class="qsm-badge trust">🛡 ${trust}%</span>` : ''}
      ${fastBdg}
      ${extraBdg}
    </div>
  </div>
  <div class="qsm-card-actions">
    <button class="qsm-btn-reserve"
      onclick="window.HeroSearchV9._book(${a.id}, false); event.stopPropagation();"
      aria-label="Réserver ${a.name}">
      📅 Réserver
    </button>
    <button class="qsm-btn-express"
      onclick="window.HeroSearchV9._book(${a.id}, true); event.stopPropagation();"
      aria-label="Urgent pour ${a.name}">
      ⚡ Urgent
    </button>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════
     RENDER INLINE RESULTS  → #hero-inline-results
  ══════════════════════════════════════════════════════ */

  function _renderInlineResults(results) {
    const container = document.getElementById('hero-inline-results');
    const grid      = document.getElementById('hero-results-grid');
    const countEl   = document.getElementById('hero-results-count');
    if (!container || !grid) return;

    /* Count label */
    if (countEl) {
      countEl.textContent = results.length
        ? `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`
        : 'Aucun résultat';
    }

    /* Cards */
    if (!results.length) {
      grid.innerHTML = `
<div class="qsm-empty">
  <div class="qsm-empty-icon">🔎</div>
  <div class="qsm-empty-title">Aucun artisan trouvé</div>
  <div class="qsm-empty-sub">Essayez d'autres critères ou élargissez votre zone de recherche.</div>
</div>`;
    } else {
      grid.innerHTML = results.map((a, i) => _renderCard(a, i)).join('');
    }

    /* Show container */
    container.style.display = 'block';

    /* Smooth scroll to results */
    requestAnimationFrame(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* Sync background artisan section silently */
    _syncBackground(results);
  }

  /* ══════════════════════════════════════════════════════
     SYNC BACKGROUND — update artisan grid + count
  ══════════════════════════════════════════════════════ */

  function _syncBackground(results) {
    if (typeof window.renderArtisans === 'function') window.renderArtisans(results);
    else if (typeof renderArtisans === 'function')   renderArtisans(results);
    const cnt = document.getElementById('results-count');
    if (cnt) cnt.textContent =
      `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
  }

  /* ══════════════════════════════════════════════════════
     DO SEARCH
  ══════════════════════════════════════════════════════ */

  function _doSearch() {
    /* Read values from SmartSearch bar */
    const inputEl  = document.getElementById('ssb-input-nlp');
    const catEl    = document.getElementById('ssb-select-cat');
    const cityEl   = document.getElementById('ssb-select-city');

    st.query = (inputEl?.value || '').trim();
    st.city  = cityEl?.value  || '';

    /* NLP auto-detect category */
    let cat = catEl?.value || '';
    if (!cat && st.query) {
      const mapper = _nlpMapper();
      if (mapper) {
        const detected = mapper.detect ? mapper.detect(st.query) : null;
        if (detected) {
          cat = detected;
          if (catEl) catEl.value = cat;
        }
      }
    }
    st.cat = cat;
    st.searched = true;

    /* Show loading */
    const container = document.getElementById('hero-inline-results');
    const grid      = document.getElementById('hero-results-grid');
    const countEl   = document.getElementById('hero-results-count');

    if (container) container.style.display = 'block';
    if (countEl)   countEl.textContent = 'Recherche…';
    if (grid) {
      grid.innerHTML = `
<div class="qsm-loading">
  <div class="qsm-spinner"></div>
  <div class="qsm-loading-text">Recherche des meilleurs artisans…</div>
</div>`;
    }

    /* Run filter with brief UX delay */
    setTimeout(() => {
      const results = _filterArtisans(st.query, st.cat, st.city, st.filters);
      st.results = results;
      _renderInlineResults(results);
    }, 220);
  }

  /* ══════════════════════════════════════════════════════
     BOOK — centralized reservation modal
  ══════════════════════════════════════════════════════ */

  function _book(id, isExpress) {
    const artisan = _artisans().find(a => a.id === id || a.id === parseInt(id, 10)) || id;
    if (window.FixeoReservation) {
      isExpress
        ? window.FixeoReservation.openExpress(artisan)
        : window.FixeoReservation.open(artisan, false);
    } else if (typeof openBookingModal === 'function') {
      openBookingModal(typeof id === 'number' ? id : parseInt(id, 10));
    } else {
      console.warn('[HeroSearchV9] FixeoReservation not ready. Artisan:', id);
    }
  }

  /* ══════════════════════════════════════════════════════
     WIRE QUICK-FILTER CHIPS from Smart Search Bar
  ══════════════════════════════════════════════════════ */

  function _wireChips() {
    const chips = document.querySelectorAll('.ssb-filter-chip');
    chips.forEach(chip => {
      const filterKey = chip.dataset.filter;
      if (!filterKey || filterKey === 'map') return;
      chip.addEventListener('click', () => {
        if (filterKey in st.filters) {
          st.filters[filterKey] = !st.filters[filterKey];
          chip.classList.toggle('active', st.filters[filterKey]);
          chip.setAttribute('aria-pressed', String(st.filters[filterKey]));
          /* Live-update results if already searched */
          if (st.searched) _doSearch();
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     WIRE CLOSE BUTTON (inline results panel)
  ══════════════════════════════════════════════════════ */

  function _wireCloseBtn() {
    const btn = document.getElementById('hero-results-close-btn');
    btn?.addEventListener('click', () => {
      const container = document.getElementById('hero-inline-results');
      if (container) container.style.display = 'none';
      st.searched = false;
    });
  }

  /* ══════════════════════════════════════════════════════
     INTERCEPT SMART SEARCH BAR BUTTON
     Hooks into SmartSearch "Trouver un Artisan" button
  ══════════════════════════════════════════════════════ */

  function _hookSmartSearchButton() {
    /* Retry until SmartSearch bar is injected */
    const tryHook = () => {
      const btn = document.getElementById('ssb-btn-search');
      if (!btn) {
        setTimeout(tryHook, 150);
        return;
      }

      /* Replace click handlers: intercept and show inline results */
      btn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        _doSearch();
      }, true); /* capture phase: runs BEFORE SmartSearch's own listener */

      /* Also wire Enter key in NLP input */
      const inputEl = document.getElementById('ssb-input-nlp');
      if (inputEl) {
        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.stopImmediatePropagation();
            e.preventDefault();
            _doSearch();
          }
        }, true);
      }

      /* Wire filter chips */
      _wireChips();

      /* Wire close button */
      _wireCloseBtn();

      console.log('✅ HeroSearchV9: SmartSearch bar hooked successfully');
    };

    tryHook();
  }

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */

  function init() {
    _hookSmartSearchButton();
    console.log('✅ Fixeo Hero Search v9 initialized');
  }

  /* Bootstrap */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

  /* ══════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════ */
  window.HeroSearchV9 = {
    search:    _doSearch,
    _book:     _book,
    getState:  () => ({ ...st }),
  };

}(window));
