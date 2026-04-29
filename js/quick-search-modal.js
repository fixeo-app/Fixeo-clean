/**
 * ================================================================
 *  FIXEO v8 — QUICK SEARCH MODAL  (js/quick-search-modal.js)
 *  Triggered by "Recherche rapide" button in header navbar.
 *  ▸ Opens a modal containing the FULL HERO search form
 *  ▸ Identical filters, identical results, identical card design
 *  ▸ Results rendered directly inside the modal (no redirect)
 *  ▸ Réserver / Express → centralized FixeoReservation modal
 *
 *  Dependencies (must load BEFORE this file):
 *    - smart-search.js  → SSB_DATA, SSBNLPMapper, ssbApplyFilters
 *    - main.js          → ARTISANS, window.searchEngine
 *    - reservation.js   → window.FixeoReservation
 * ================================================================
 */

'use strict';

(function (window) {

  /* ── DOM IDs ── */
  const MODAL_ID    = 'qsm-modal';
  const BACKDROP_ID = 'qsm-backdrop';

  /* ── Category maps (synced with smart-search.js SSB_DATA) ── */
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

  /* ── Internal state ── */
  const st = {
    query:   '',
    cat:     '',
    city:    '',
    filters: { availableNow: false, topScore: false, fastResponse: false },
    results: [],
    searched: false,
  };

  /* ══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */
  function _norm(s) {
    return (s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
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
    if (typeof SSBNLPMapper !== 'undefined') return new SSBNLPMapper();
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     FILTER ENGINE (mirrors secondary-search.js logic)
  ══════════════════════════════════════════════════════════ */
  function _filterArtisans(q, cat, city, filters) {
    let list = [..._artisans()];
    const n = _norm(q);

    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      if (mapper) {
        const cats = mapper.detectMulti ? mapper.detectMulti(q) : [];
        if (cats.length) list = list.filter(a => cats.includes(a.category));
      }
    }
    if (n.length >= 2 && !cat) {
      const mapper = _nlpMapper();
      const hasCat = mapper ? (mapper.detectMulti(q) || []).length > 0 : false;
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
    if (filters.availableNow) list = list.filter(a => a.availability === 'available');
    if (filters.topScore)     list = list.filter(a => (a.trustScore || 0) >= 85);
    if (filters.fastResponse) list = list.filter(a => (a.responseTime || 999) <= 30);

    list.sort((a, b) => {
      const sa = (a.trustScore||0) + (a.availability==='available'?15:0) - (a.responseTime||60)*0.2 + (a.rating||0)*2;
      const sb = (b.trustScore||0) + (b.availability==='available'?15:0) - (b.responseTime||60)*0.2 + (b.rating||0)*2;
      return sb - sa;
    });
    return list;
  }

  /* ══════════════════════════════════════════════════════════
     CARD RENDERER (.qsm-card — uniform design)
  ══════════════════════════════════════════════════════════ */
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
      <span style="font-weight:600;color:rgba(255,255,255,0.7)">💰 ${a.priceLabel || ('À partir de ' + (a.priceFrom||150) + ' MAD')}</span>
    </div>
    <div class="qsm-card-badges">
      ${trust >= 80 ? `<span class="qsm-badge trust">🛡 ${trust}%</span>` : ''}
      ${fastBdg}
      ${extraBdg}
    </div>
  </div>
  <div class="qsm-card-actions">
    <button class="qsm-btn-reserve"
      onclick="window.QuickSearchModal._book(${a.id}, false); event.stopPropagation();"
      aria-label="Réserver ${a.name}">
      📅 Réserver
    </button>
    <button class="qsm-btn-express"
      onclick="window.QuickSearchModal._book(${a.id}, true); event.stopPropagation();"
      aria-label="Demande express pour ${a.name}">
      ⚡ Urgent
    </button>
  </div>
</div>`;
  }

  /* ══════════════════════════════════════════════════════════
     BUILD MODAL HTML
  ══════════════════════════════════════════════════════════ */
  function _buildModalHTML() {
    /* Categories */
    let catOpts = '';
    if (typeof SSB_DATA !== 'undefined') {
      Object.entries(SSB_DATA.categories).forEach(([k, d]) => {
        catOpts += `<option value="${k}">${d.icon} ${d.label}</option>`;
      });
    } else {
      const fallback = [
        ['plomberie','🔧 Plomberie'], ['electricite','⚡ Électricité'],
        ['peinture','🎨 Peinture'],   ['nettoyage','🧹 Nettoyage'],
        ['jardinage','🌿 Jardinage'], ['demenagement','📦 Déménagement'],
        ['bricolage','🔨 Bricolage'], ['climatisation','❄️ Climatisation'],
        ['menuiserie','🪚 Menuiserie'], ['maconnerie','🧱 Maçonnerie'],
        ['serrurerie','🔑 Serrurerie'], ['carrelage','🏠 Carrelage'],
      ];
      catOpts = fallback.map(([k,l]) => `<option value="${k}">${l}</option>`).join('');
    }

    /* Cities */
    const cities = (typeof SSB_DATA !== 'undefined')
      ? SSB_DATA.cities
      : ['Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
         'Meknès','Oujda','Kénitra','Tétouan','Safi','El Jadida'];
    const cityOpts = cities.map(c => `<option value="${c}">📍 ${c}</option>`).join('');

    /* Results HTML */
    let resultsHTML = '';
    if (st.searched) {
      if (!st.results.length) {
        resultsHTML = `
<div class="qsm-empty">
  <div class="qsm-empty-icon">🔎</div>
  <div class="qsm-empty-title">Aucun artisan trouvé</div>
  <div class="qsm-empty-sub">Essayez d'autres critères ou élargissez votre zone.</div>
</div>`;
      } else {
        resultsHTML = st.results.map((a, i) => _renderCard(a, i)).join('');
      }
    }

    const suggestionTerms = [
      'Fuite d\'eau',
      'Panne électrique',
      'Climatisation',
      'Installation chauffe-eau'
    ];

    return `
<div class="qsm-dialog" role="document">

  <!-- Search form -->
  <div class="qsm-search-section">
    <div class="qsm-bar-card">

      <!-- Segment: Service/Besoin -->
      <div class="qsm-segment qsm-segment-service" data-qsm-focusable="service">
        <span class="qsm-seg-icon">🔍</span>
        <div class="qsm-seg-body">
          <span class="qsm-seg-label">🛠 Service ou besoin</span>
          <input
            type="text"
            id="qsm-input-nlp"
            class="qsm-seg-input"
            placeholder="D\u00e9crivez votre probl\u00e8me (fuite, panne, clim\u2026)"
            autocomplete="off"
            spellcheck="false"
            maxlength="80"
            aria-label="Décrire le service ou besoin"
            list="qsm-service-suggestions"
            value="${_esc(st.query)}"
          />
          <datalist id="qsm-service-suggestions">
            <option value="Fuite d'eau"></option>
            <option value="Panne électrique"></option>
            <option value="Climatisation en panne"></option>
            <option value="Installation chauffe-eau"></option>
            <option value="Serrure bloquée"></option>
          </datalist>
        </div>
        <button class="qsm-clear-btn" id="qsm-clear" aria-label="Effacer"
          style="${st.query ? '' : 'display:none'}">✕</button>
      </div>

      <div class="qsm-seg-divider"></div>

      <!-- Segment: Ville -->
      <div class="qsm-segment qsm-segment-city" data-qsm-focusable="city">
        <span class="qsm-seg-icon">🌆</span>
        <div class="qsm-seg-body">
          <span class="qsm-seg-label">🌆 Ville</span>
          <select id="qsm-select-city" class="qsm-seg-select" aria-label="Ville">
            <option value="">Choisir une ville</option>
            ${cityOpts}
          </select>
        </div>
      </div>

      <!-- CTA -->
      <button class="qsm-btn-search" id="qsm-btn-search" aria-label="Trouver mon artisan maintenant">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        Trouver mon artisan maintenant
      </button>

    </div><!-- /.qsm-bar-card -->

    <div class="qsm-service-suggestions" aria-hidden="true">
      <span class="qsm-suggestions-label">Suggestions :</span>
      ${suggestionTerms.map(term => `<button type="button" class="qsm-suggestion-chip" data-qsm-suggestion="${_esc(term)}">${_esc(term)}</button>`).join('')}
    </div>

    <!-- Quick filters -->
    <div class="qsm-filters-row">
      <span class="qsm-filters-label">Filtres rapides :</span>
      <button class="qsm-qfilter${st.filters.availableNow ? ' active' : ''}" data-filter="availableNow" aria-pressed="${st.filters.availableNow}">
        <span class="qsm-qdot"></span>🟢 Disponible maintenant
      </button>
      <button class="qsm-qfilter${st.filters.topScore ? ' active' : ''}" data-filter="topScore" aria-pressed="${st.filters.topScore}">
        <span class="qsm-qdot"></span>⭐ Score &gt; 85%
      </button>
      <button class="qsm-qfilter${st.filters.fastResponse ? ' active' : ''}" data-filter="fastResponse" aria-pressed="${st.filters.fastResponse}">
        <span class="qsm-qdot"></span>⚡ Réponse &lt; 30 min
      </button>
    </div>
  </div><!-- /.qsm-search-section -->

</div>`;
  }

  /* HTML-escape helper */
  function _esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ══════════════════════════════════════════════════════════
     DOM HELPERS
  ══════════════════════════════════════════════════════════ */
  function _ensureBackdrop() {
    let bd = document.getElementById(BACKDROP_ID);
    if (!bd) {
      bd = document.createElement('div');
      bd.id = BACKDROP_ID;
      bd.className = 'qsm-backdrop';
      bd.setAttribute('aria-hidden', 'true');
      bd.addEventListener('click', close);
      document.body.appendChild(bd);
    }
    return bd;
  }
  function _heroHost() {
    return document.getElementById('hero-quick-search');
  }

  function _getRoot() {
    return _heroHost() || document.getElementById(MODAL_ID);
  }

  function _isInlineMode() {
    return !!_heroHost();
  }

  function _renderInline() {
    const host = _heroHost();
    if (!host) return null;
    host.classList.add('qsm-inline-host');
    host.innerHTML = _buildModalHTML();
    _wireModalEvents();
    return host;
  }

  function _ensureModal() {
    let m = document.getElementById(MODAL_ID);
    if (!m) {
      m = document.createElement('div');
      m.id = MODAL_ID;
      m.className = 'qsm-modal';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-label', 'Recherche rapide d\'artisans');
      document.body.appendChild(m);
    }
    return m;
  }

  /* ══════════════════════════════════════════════════════════
     WIRE EVENTS inside modal
  ══════════════════════════════════════════════════════════ */
  function _wireModalEvents() {
    const root = _getRoot();
    if (!root) return;

    const inputNLP  = root.querySelector('#qsm-input-nlp');
    const catEl     = root.querySelector('#qsm-select-cat');
    const cityEl    = root.querySelector('#qsm-select-city');
    const searchBtn = root.querySelector('#qsm-btn-search');
    const clearBtn  = root.querySelector('#qsm-clear');
    const qfilters  = root.querySelectorAll('.qsm-qfilter');
    const suggestionChips = root.querySelectorAll('[data-qsm-suggestion]');
    const serviceSegment = root.querySelector('.qsm-segment-service');

    const openSuggestions = () => root.classList.add('qsm-service-focused');
    const closeSuggestions = () => {
      window.setTimeout(() => {
        if (!root.contains(document.activeElement)) {
          root.classList.remove('qsm-service-focused');
        }
      }, 90);
    };

    /* Restore state into selects */
    if (catEl)  catEl.value  = st.cat;
    if (cityEl) cityEl.value = st.city;

    /* Input events */
    inputNLP?.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = inputNLP.value.length ? 'flex' : 'none';
      if (inputNLP.value.length) openSuggestions();
    });
    inputNLP?.addEventListener('focus', openSuggestions);
    inputNLP?.addEventListener('click', openSuggestions);
    inputNLP?.addEventListener('blur', closeSuggestions);
    inputNLP?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _doSearch(); }
    });
    clearBtn?.addEventListener('click', () => {
      if (inputNLP) inputNLP.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      openSuggestions();
      inputNLP?.focus();
    });

    serviceSegment?.addEventListener('click', (event) => {
      if (event.target && event.target.closest('.qsm-clear-btn')) return;
      inputNLP?.focus();
    });

    suggestionChips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (!inputNLP) return;
        inputNLP.value = chip.getAttribute('data-qsm-suggestion') || '';
        if (clearBtn) clearBtn.style.display = inputNLP.value.length ? 'flex' : 'none';
        suggestionChips.forEach(btn => btn.classList.toggle('active', btn === chip));
        openSuggestions();
        inputNLP.focus();
      });
    });

    /* Select changes: update state only (search on button click) */
    catEl?.addEventListener('change',  () => { st.cat  = catEl.value; });
    cityEl?.addEventListener('change', () => { st.city = cityEl.value; });
    cityEl?.addEventListener('focus', () => root.classList.remove('qsm-service-focused'));

    /* Search button */
    searchBtn?.addEventListener('click', _doSearch);

    /* Quick filter chips */
    qfilters.forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.filter;
        if (key in st.filters) {
          st.filters[key] = !st.filters[key];
          chip.classList.toggle('active', st.filters[key]);
          chip.setAttribute('aria-pressed', String(st.filters[key]));
          if (st.searched) _doSearch();
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     DO SEARCH
  ══════════════════════════════════════════════════════════ */
  function _doSearch() {
    const root = _getRoot();
    if (!root) return;

    const inputNLP = root.querySelector('#qsm-input-nlp');
    const catEl    = root.querySelector('#qsm-select-cat');
    const cityEl   = root.querySelector('#qsm-select-city');

    st.query = (inputNLP?.value || '').trim();
    st.city  = cityEl?.value || '';

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

    /* Show loading spinner only in modal mode */
    const isInline = _isInlineMode();
    const grid    = root.querySelector('#qsm-cards-grid');
    const section = root.querySelector('#qsm-results-section');
    const counter = root.querySelector('#qsm-results-count');
    if (!isInline && section) section.style.display = '';
    if (!isInline && grid) {
      grid.innerHTML = `
<div class="qsm-loading">
  <div class="qsm-spinner"></div>
  <div class="qsm-loading-text">Recherche des meilleurs artisans…</div>
</div>`;
    }

    /* Run filter with brief delay for UX */
    setTimeout(() => {
      // ── Unified pipeline: SearchEngine + FixeoMatchingEngine ──
      let results;
      if (window.searchEngine) {
        const seState = {
          query:       st.query,
          category:    st.cat,
          city:        st.city,
          availability: st.filters.availableNow ? 'available_now' : '',
          minRating:    st.filters.topScore ? 85 : 0,
          maxPrice:     0,
          verifiedOnly: false,
          sortBy:       'rating',
        };
        results = window.searchEngine.filter(seState);
        // Apply matching sort with full context
        if (window.FixeoMatchingEngine && results.length > 1) {
          results = window.FixeoMatchingEngine.sortByMatch(results.slice(), {
            city:    st.city,
            service: st.cat,
            query:   st.query,
          });
        }
        // Fast-response filter (can't express in searchEngine API)
        if (st.filters.fastResponse) results = results.filter(a => (a.responseTime || 999) <= 30);
      } else {
        results = _filterArtisans(st.query, st.cat, st.city, st.filters);
      }
      st.results = results;
      st.searched = true;

      if (!isInline && counter) {
        counter.textContent = results.length
          ? `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`
          : 'Aucun résultat';
      }

      if (!isInline && grid) {
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
      }

      /* Scroll results into view only outside inline HERO mode */
      if (!isInline && section) {
        requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }

      /* Silently sync background artisan section */
      _syncBackground(results);

      if (isInline) {
        setTimeout(() => {
          document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 90);
      }
    }, 220);
  }

  /* Sync main artisan grid (silent, background) */
  function _syncBackground(results) {
    // Sync hero inputs into marketplace filter controls
    const catEl  = document.getElementById('filter-category');
    const cityEl = document.getElementById('filter-city');
    if (catEl  && st.cat  !== undefined) catEl.value  = st.cat;
    if (cityEl && st.city !== undefined) cityEl.value = st.city;

    // Vedette IS the results UI — enter search mode (internally refreshes vedette)
    if (window.FixeoHomepagePremium) {
      if (typeof window.FixeoHomepagePremium.enterSearch === 'function') {
        window.FixeoHomepagePremium.enterSearch();
      } else if (typeof window.FixeoHomepagePremium.refresh === 'function') {
        window.FixeoHomepagePremium.refresh();
      }
    }

    // Mark body as hero-search-mode AFTER enterSearch() so CSS takes effect last
    document.body.classList.add('fixeo-hero-search-mode');

    // Enforce hero-search UI suppression via JS (belt+suspenders over CSS)
    (function _enforceHeroClean() {
      var toHide = [
        document.querySelector('#artisans-section .results-header'),
        document.querySelector('#artisans-section .premium-results-header'),
        document.querySelector('#artisans-section .results-toolbar'),
        document.getElementById('fixeo-premium-filters-extra'),
        document.getElementById('other-artisans-banner'),
        document.getElementById('edit-results-search-btn'),
      ];
      toHide.forEach(function(el) {
        if (el) el.style.setProperty('display', 'none', 'important');
      });
    })();

    // Update fhp-counter with filtered result count
    const counter = document.querySelector('.fhp-counter');
    if (counter && results.length > 0) {
      const n = results.length;
      counter.textContent = n.toLocaleString('fr-FR') + ' artisan' + (n !== 1 ? 's' : '') + ' trouvé' + (n !== 1 ? 's' : '');
    }

    // Scroll smoothly to vedette — the modern results UI
    const vedetteGrid = document.getElementById('fixeo-homepage-vedette-grid');
    if (vedetteGrid) {
      setTimeout(() => vedetteGrid.scrollIntoView({behavior:'smooth', block:'start'}), 120);
    }
  }

  /* ══════════════════════════════════════════════════════════
     BOOK — delegate to FixeoReservation
  ══════════════════════════════════════════════════════════ */
  function _book(id, isExpress) {
    const artisan = _artisans().find(a => a.id === id || a.id === parseInt(id, 10)) || id;
    close();
    setTimeout(() => {
      if (window.FixeoReservation) {
        isExpress
          ? window.FixeoReservation.openExpress(artisan)
          : window.FixeoReservation.open(artisan, false);
      } else if (typeof openBookingModal === 'function') {
        openBookingModal(typeof id === 'number' ? id : parseInt(id, 10));
      } else {
        console.warn('[QuickSearchModal] FixeoReservation not ready. Artisan:', id);
      }
    }, 200);
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  /** Focus the inline component instead of opening a modal */
  function focusInline(preQuery) {
    if (preQuery) st.query = String(preQuery).trim();
    const host = _renderInline();
    if (!host) return;
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const input = host.querySelector('#qsm-input-nlp');
      input?.focus();
      if (preQuery && input) input.value = st.query;
    }, 120);
  }

  function open(preQuery) {
    focusInline(preQuery);
  }

  function close() {
    if (_isInlineMode()) return;
    const modal = document.getElementById(MODAL_ID);
    const bd    = document.getElementById(BACKDROP_ID);
    if (modal) modal.classList.remove('open');
    if (bd)    bd.classList.remove('open');
    document.body.style.overflow = '';
    if (document._qsmKeyHandler) {
      document.removeEventListener('keydown', document._qsmKeyHandler);
      document._qsmKeyHandler = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _renderInline);
  } else {
    _renderInline();
  }

  /* Expose globally */
  window.QuickSearchModal = { open, close, focusInline, _book, renderInline: _renderInline };

  console.log('✅ Fixeo Quick Search Modal v8 loaded (inline hero)');

}(window));
