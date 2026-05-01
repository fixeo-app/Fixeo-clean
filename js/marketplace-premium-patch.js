/* ================================================================
   FIXEO — Marketplace Premium Patch
   Harmonise search + cards + CTA sans casser l’existant
   ================================================================ */

(function () {
  'use strict';

  const state = {
    availableNow: false,
    topScore: false,
    fastResponse: false,
    mapActive: false,
    city: '',
    minRating: 0,
    availability: '',
    maxPrice: '',
    verifiedOnly: false,
    sortBy: 'rating',
  };

  function getArtisans() {
    return Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
  }

  function norm(value) {
    return (value || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function pluralize(count, singular, plural) {
    return count > 1 ? plural : singular;
  }

  function getBaseList(list, explicit = false) {
    if (Array.isArray(list) && (list.length || explicit)) return [...list];

    const heroState = window.HeroSearchV9 && typeof window.HeroSearchV9.getState === 'function'
      ? window.HeroSearchV9.getState()
      : null;

    if (heroState && Array.isArray(heroState.results) && heroState.results.length) {
      return [...heroState.results];
    }

    if (window.searchEngine && Array.isArray(window.searchEngine.filtered) && window.searchEngine.filtered.length) {
      return [...window.searchEngine.filtered];
    }

    return getArtisans();
  }

  function applyStateFilters(list) {
    let results = Array.isArray(list) ? [...list] : [];

    if (state.availableNow || state.availability === 'available') {
      results = results.filter(a => (a.availability || '').toLowerCase() === 'available');
    } else if (state.availability === 'busy') {
      results = results.filter(a => (a.availability || '').toLowerCase() !== 'available');
    }

    if (state.topScore) {
      results = results.filter(a => Number(a.trustScore || 0) >= 80);
    }

    if (state.fastResponse) {
      results = results.filter(a => Number(a.responseTime || 999) <= 30);
    }

    if (state.city) {
      results = results.filter(a => norm(a.city).includes(norm(state.city)));
    }

    if (Number(state.minRating || 0) > 0) {
      results = results.filter(a => Number(a.rating || 0) >= Number(state.minRating));
    }

    if (state.maxPrice) {
      results = results.filter(a => Number(a.priceFrom || 0) <= Number(state.maxPrice));
    }

    if (state.verifiedOnly) {
      results = results.filter(a => {
        const badges = Array.isArray(a.badges) ? a.badges : [];
        return badges.includes('verified') || Number(a.trustScore || 0) >= 85;
      });
    }

    const sortFns = {
      rating: (a, b) => Number(b.rating || 0) - Number(a.rating || 0),
      response: (a, b) => Number(a.responseTime || 999) - Number(b.responseTime || 999),
      price_asc: (a, b) => Number(a.priceFrom || 9999) - Number(b.priceFrom || 9999),
    };

    results.sort(sortFns[state.sortBy] || sortFns.rating);
    return results;
  }

  function prepareList(list, explicit = false) {
    return applyStateFilters(getBaseList(list, explicit));
  }

  function getDominantValue(list, key) {
    const counts = new Map();
    (Array.isArray(list) ? list : []).forEach(item => {
      const value = (item && item[key]) || '';
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  function getHeaderContext(filteredList, baseList) {
    const referenceList = filteredList.length ? filteredList : baseList;
    const hiddenCategory = document.getElementById('filter-category')?.value || '';
    const hiddenCity = document.getElementById('filter-city')?.value || '';
    const city = state.city || hiddenCity || getDominantValue(referenceList, 'city');
    const category = hiddenCategory || getDominantValue(referenceList, 'category');
    const responseValues = (filteredList.length ? filteredList : referenceList)
      .map(a => Number(a.responseTime || 0))
      .filter(Boolean);
    const averageResponse = responseValues.length
      ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length)
      : 18;
    return { city, category, averageResponse };
  }

  function getResultProfessionLabel(cat, lang = 'fr') {
    if (typeof window.getResultProfessionLabel === 'function') {
      return window.getResultProfessionLabel(cat, lang);
    }
    const labels = {
      plomberie: { fr: 'Plombier', ar: 'سباك', en: 'Plumber' },
      peinture: { fr: 'Peintre', ar: 'دهان', en: 'Painter' },
      electricite: { fr: 'Électricien', ar: 'كهربائي', en: 'Electrician' },
      nettoyage: { fr: 'Agent de nettoyage', ar: 'عامل نظافة', en: 'Cleaner' },
      jardinage: { fr: 'Jardinier', ar: 'بستاني', en: 'Gardener' },
      demenagement: { fr: 'Déménageur', ar: 'عامل نقل', en: 'Mover' },
      bricolage: { fr: 'Bricoleur', ar: 'فني إصلاح', en: 'Handyman' },
      climatisation: { fr: 'Frigoriste', ar: 'فني تكييف', en: 'HVAC specialist' },
      menuiserie: { fr: 'Menuisier', ar: 'نجار', en: 'Carpenter' },
      maconnerie: { fr: 'Maçon', ar: 'بنّاء', en: 'Mason' },
    };
    return (labels[cat] && labels[cat][lang]) || 'Artisan';
  }

  function updateSharedButtons() {
    document.querySelectorAll('[data-market-filter]').forEach(btn => {
      const key = btn.getAttribute('data-market-filter');
      const active = !!state[key];
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-market-map]').forEach(btn => {
      btn.classList.toggle('active', !!state.mapActive);
      btn.setAttribute('aria-pressed', String(!!state.mapActive));
    });
  }

  function afterRender(filteredList, rawBaseList, options = {}) {
    const filtered = Array.isArray(filteredList) ? filteredList : [];
    const baseList = getBaseList(rawBaseList, !!options.explicitBaseList);
    const lang = window.i18n ? window.i18n.lang : 'fr';
    const { city, category, averageResponse } = getHeaderContext(filtered, baseList);
    const title = document.getElementById('results-main-title');
    const meta = document.getElementById('results-main-meta');
    const countEl = document.getElementById('results-count');
    const badgeEl = document.getElementById('other-artisans-count-badge');

    const profession = category ? getResultProfessionLabel(category, lang) : 'Artisans';
    if (title) {
      title.textContent = city ? `${profession} à ${city}` : `${profession} disponibles`;
    }

    if (meta) {
      meta.textContent = `${filtered.length} artisans disponibles • Réponse moyenne : ${averageResponse} min`;
    }

    if (countEl) {
      countEl.textContent = `${filtered.length} ${pluralize(filtered.length, 'résultat', 'résultats')}`;
    }

    if (badgeEl) {
      badgeEl.textContent = `👷 ${filtered.length} ${pluralize(filtered.length, 'profil', 'profils')}`;
    }

    const noResult = document.querySelector('#no-artisan p');
    if (noResult) {
      noResult.textContent = filtered.length
        ? ''
        : 'Aucun artisan disponible pour ces critères. Modifiez vos filtres ou publiez votre demande.';
    }

    populateCityOptions(baseList.length ? baseList : getArtisans());
  }

  function populateCityOptions(sourceList) {
    const select = document.getElementById('results-filter-city');
    if (!select) return;

    const currentValue = state.city || '';
    const cities = [...new Set((Array.isArray(sourceList) ? sourceList : [])
      .map(a => (a && a.city) || '')
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

    const options = ['<option value="">Toutes les villes</option>']
      .concat(cities.map(city => `<option value="${city}">${city}</option>`))
      .join('');

    if (select.dataset.optionsCache !== options) {
      select.innerHTML = options;
      select.dataset.optionsCache = options;
    }

    select.value = cities.includes(currentValue) ? currentValue : '';
  }

  function syncHeroResults(baseList) {
    const grid = document.getElementById('hero-results-grid');
    if (!grid) return;

    const heroState = window.HeroSearchV9 && typeof window.HeroSearchV9.getState === 'function'
      ? window.HeroSearchV9.getState()
      : null;

    const source = Array.isArray(baseList) && baseList.length
      ? baseList
      : heroState && Array.isArray(heroState.results)
        ? heroState.results
        : [];

    if (!source.length) return;

    const allowedIds = new Set(prepareList(source).map(a => String(a.id)));
    const cards = Array.from(grid.querySelectorAll('.qsm-card[data-artisan-id]'));
    if (!cards.length) return;

    let visible = 0;
    cards.forEach(card => {
      const show = allowedIds.has(String(card.dataset.artisanId));
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    let emptyState = grid.querySelector('.fixeo-hero-empty');
    if (visible === 0) {
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'qsm-empty fixeo-hero-empty';
        emptyState.innerHTML = [
          '<div class="qsm-empty-icon">🔎</div>',
          '<div class="qsm-empty-title">Aucun artisan ne correspond à ces filtres</div>',
          '<div class="qsm-empty-sub">Essayez de désactiver un filtre pour élargir la sélection.</div>'
        ].join('');
        grid.appendChild(emptyState);
      }
    } else if (emptyState) {
      emptyState.remove();
    }

    const countEl = document.getElementById('hero-results-count');
    if (countEl) {
      countEl.textContent = `${visible} ${pluralize(visible, 'artisan trouvé', 'artisans trouvés')}`;
    }
  }

  function refreshResults(baseList) {
    syncHeroResults(baseList);
    if (typeof window.renderArtisans === 'function') {
      window.renderArtisans(getBaseList(baseList), { skipResultsPageFilters: false });
    }
    updateSharedButtons();
  }

  function toggleFilter(key) {
    if (!(key in state)) return;
    state[key] = !state[key];
    refreshResults();
  }

  function toggleMarketplaceMap() {
    const smartSearchMapBtn = document.querySelector('.ssb-filter-chip[data-filter="map"]');
    if (smartSearchMapBtn) {
      smartSearchMapBtn.click();
      state.mapActive = smartSearchMapBtn.classList.contains('active');
    } else {
      const btn = document.querySelector('.results-header .filter-chip[aria-label="Afficher/masquer la carte"]');
      if (btn && typeof window.toggleMapView === 'function') {
        window.toggleMapView(btn);
        state.mapActive = btn.classList.contains('active');
      } else {
        state.mapActive = !state.mapActive;
      }
    }
    updateSharedButtons();
  }

  function buildFilterButtonsHTML() {
    return [
      '<button class="fixeo-filter-btn" data-market-filter="availableNow" aria-pressed="false">🟢 Disponible maintenant</button>',
      '<button class="fixeo-filter-btn" data-market-filter="topScore" aria-pressed="false">⭐ Score &gt; 80%</button>',
      '<button class="fixeo-filter-btn" data-market-filter="fastResponse" aria-pressed="false">⚡ Réponse &lt; 30 min</button>',
      '<button class="fixeo-filter-btn" data-market-map="1" aria-pressed="false">🗺 Carte</button>'
    ].join('');
  }

  function buildSearchInfoHTML() {
    return [
      '<span>🔒 SSL sécurisé</span>',
      '<span>💳 3D Secure</span>',
      '<span>✅ Artisan vérifié</span>'
    ].join('');
  }

  function wireMarketplaceButtons(scope) {
    if (!scope) return;

    scope.querySelectorAll('[data-market-filter]').forEach(btn => {
      if (btn.dataset.marketWired === '1') return;
      btn.dataset.marketWired = '1';
      btn.addEventListener('click', () => toggleFilter(btn.getAttribute('data-market-filter')));
    });

    scope.querySelectorAll('[data-market-map]').forEach(btn => {
      if (btn.dataset.marketWired === '1') return;
      btn.dataset.marketWired = '1';
      btn.addEventListener('click', toggleMarketplaceMap);
    });
  }

  function injectHeroMarketplaceFilters() {
    const wrap = document.querySelector('.search-bar-wrap .ssb-wrap');
    if (!wrap || wrap.querySelector('.fixeo-hero-marketplace')) return;

    const box = document.createElement('div');
    box.className = 'fixeo-hero-marketplace';
    box.innerHTML = [
      `<div class="quick-filters fixeo-hero-filters" role="group" aria-label="Filtres prioritaires">${buildFilterButtonsHTML()}</div>`,
      `<div class="search-info" aria-label="Garanties Fixeo">${buildSearchInfoHTML()}</div>`
    ].join('');

    wrap.appendChild(box);
    wireMarketplaceButtons(box);
    updateSharedButtons();
  }

  function readResultsControls() {
    state.city = document.getElementById('results-filter-city')?.value || '';
    state.minRating = Number(document.getElementById('results-filter-rating')?.value || 0);
    state.availability = document.getElementById('results-filter-availability')?.value || '';
    state.maxPrice = document.getElementById('results-filter-price')?.value || '';
    state.verifiedOnly = !!document.getElementById('results-filter-verified')?.checked;
    state.sortBy = document.getElementById('results-sort-select')?.value || 'rating';

    const hiddenCity = document.getElementById('filter-city');
    const hiddenAvailability = document.getElementById('filter-availability');
    const hiddenSort = document.getElementById('filter-sort');
    if (hiddenCity) hiddenCity.value = state.city;
    if (hiddenAvailability && state.availability) hiddenAvailability.value = state.availability === 'busy' ? '' : state.availability;
    if (hiddenSort) hiddenSort.value = state.sortBy;
  }

  function resetResultsControls() {
    const ids = ['results-filter-city', 'results-filter-rating', 'results-filter-availability', 'results-filter-price', 'results-sort-select'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'results-filter-rating') el.value = '0';
      else if (id === 'results-sort-select') el.value = 'rating';
      else el.value = '';
    });
    const verified = document.getElementById('results-filter-verified');
    if (verified) verified.checked = false;
    state.city = '';
    state.minRating = 0;
    state.availability = '';
    state.maxPrice = '';
    state.verifiedOnly = false;
    state.sortBy = 'rating';
  }

  function scrollToPrimarySearch() {
    const hero = document.querySelector('.hero');
    hero?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      if (window.QuickSearchModal && typeof window.QuickSearchModal.focusInline === 'function') {
        window.QuickSearchModal.focusInline();
        return;
      }
      const input = document.getElementById('ssb-input-nlp') || document.getElementById('hero-search-input');
      input?.focus();
    }, 250);
  }

  function openPublishRequest() {
    if (window.FixeoReservation && typeof window.FixeoReservation.openExpress === 'function') {
      window.FixeoReservation.openExpress();
    } else if (typeof window.openModal === 'function' && document.getElementById('express-modal')) {
      window.openModal('express-modal');
    } else {
      scrollToPrimarySearch();
    }
  }

  function bindResultsControls() {
    const controls = [
      'results-filter-city',
      'results-filter-rating',
      'results-filter-availability',
      'results-filter-price',
      'results-sort-select',
    ];

    controls.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.marketBound === '1') return;
      el.dataset.marketBound = '1';
      el.addEventListener('change', () => {
        readResultsControls();
        refreshResults();
      });
    });

    const verified = document.getElementById('results-filter-verified');
    if (verified && verified.dataset.marketBound !== '1') {
      verified.dataset.marketBound = '1';
      verified.addEventListener('change', () => {
        readResultsControls();
        refreshResults();
      });
    }

    const editBtn = document.getElementById('edit-results-search-btn');
    if (editBtn && editBtn.dataset.marketBound !== '1') {
      editBtn.dataset.marketBound = '1';
      editBtn.addEventListener('click', scrollToPrimarySearch);
    }

    const stickyBtn = document.getElementById('mobile-sticky-cta');
    if (stickyBtn && stickyBtn.dataset.marketBound !== '1') {
      stickyBtn.dataset.marketBound = '1';
      stickyBtn.addEventListener('click', openPublishRequest);
    }

    const resetBtn = document.getElementById('results-reset-btn');
    if (resetBtn && resetBtn.dataset.marketBound !== '1') {
      resetBtn.dataset.marketBound = '1';
      resetBtn.addEventListener('click', () => {
        resetResultsControls();
        refreshResults();
      });
    }
  }

  function bindSearchInteractions() {
    const heroSearchBtn = document.getElementById('ssb-btn-search');
    if (heroSearchBtn && heroSearchBtn.dataset.marketBound !== '1') {
      heroSearchBtn.dataset.marketBound = '1';
      heroSearchBtn.addEventListener('click', () => {
        window.setTimeout(() => refreshResults(), 450);
      }, true);
    }

    const heroInput = document.getElementById('ssb-input-nlp');
    if (heroInput && heroInput.dataset.marketBound !== '1') {
      heroInput.dataset.marketBound = '1';
      heroInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          window.setTimeout(() => refreshResults(), 450);
        }
      }, true);
    }
  }

  function observeDynamicContent() {
    const heroGrid = document.getElementById('hero-results-grid');
    if (heroGrid && !heroGrid.dataset.marketObserved) {
      heroGrid.dataset.marketObserved = '1';
      new MutationObserver(() => {
        window.setTimeout(() => syncHeroResults(), 50);
      }).observe(heroGrid, { childList: true, subtree: true });
    }
  }

  function initPremiumPatch() {
    /* Critical: inject hero filters + bind interactions immediately */
    injectHeroMarketplaceFilters();
    bindResultsControls();
    bindSearchInteractions();
    observeDynamicContent();
    readResultsControls();

    /* Deferred: populateCityOptions scans entire artisan list to build <option> set;
       refreshResults calls renderArtisans which at DCL time may have 0 artisans
       (ARTISANS populated async by fixeo-supabase-loader). Guard + defer both. */
    var _idle = window.requestIdleCallback
      ? function(cb){ window.requestIdleCallback(cb, { timeout: 2000 }); }
      : function(cb){ setTimeout(cb, 350); };

    _idle(function() {
      populateCityOptions(getBaseList());
      updateSharedButtons();
      /* Only call refreshResults if artisans exist — otherwise it triggers
         a renderArtisans([]) no-op that still traverses the DOM */
      if (getBaseList().length > 0) {
        refreshResults();
      }
    });
  }

  window.FixeoResultsPage = {
    prepareList,
    afterRender,
    refresh: refreshResults,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPremiumPatch);
  } else {
    initPremiumPatch();
  }
})();
