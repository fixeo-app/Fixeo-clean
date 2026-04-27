(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const CATEGORY_RULES = [
    { category: 'plomberie', keywords: ['fuite', 'eau', 'robinet', 'toilette', 'wc', 'canalisation', 'chauffe eau', 'chauffe-eau', 'évier', 'evier', 'plomberie'] },
    { category: 'electricite', keywords: ['electricite', 'électricité', 'courant', 'prise', 'tableau', 'lumiere', 'lumière', 'disjoncteur', 'panne electrique', 'panne électrique'] },
    { category: 'serrurerie', keywords: ['serrure', 'porte', 'clé', 'cle', 'verrou'] },
    { category: 'climatisation', keywords: ['clim', 'climatisation', 'chauffage', 'vmc', 'pompe a chaleur', 'pompe à chaleur'] },
    { category: 'nettoyage', keywords: ['nettoyage', 'ménage', 'menage', 'désinfection', 'desinfection', 'vitre'] },
    { category: 'peinture', keywords: ['peinture', 'mur', 'enduit', 'plafond'] },
    { category: 'menuiserie', keywords: ['fenêtre', 'fenetre', 'placard', 'meuble', 'porte bois', 'charnière', 'charniere'] },
    { category: 'bricolage', keywords: ['fixation', 'montage', 'perçage', 'percage', 'petit travaux', 'petits travaux'] },
    { category: 'maconnerie', keywords: ['carrelage', 'béton', 'beton', 'fissure', 'maçonnerie', 'maconnerie'] },
    { category: 'jardinage', keywords: ['jardin', 'pelouse', 'taille', 'arrosage'] },
    { category: 'demenagement', keywords: ['déménagement', 'demenagement', 'transport', 'camion'] }
  ];


  const URGENT_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';
  const MAX_URGENT_EVENTS = 250;

  function getUrgentAnalytics() {
    if (window.FixeoUrgentAnalytics) return window.FixeoUrgentAnalytics;

    const readEvents = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(URGENT_EVENTS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    };

    const api = {
      track(type, payload = {}) {
        if (!type) return null;
        const event = {
          id: `urgent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          type,
          timestamp: new Date().toISOString(),
          page: window.location.pathname.split('/').pop() || 'results.html',
          payload,
        };

        try {
          const events = readEvents();
          events.unshift(event);
          localStorage.setItem(URGENT_EVENTS_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_URGENT_EVENTS)));
        } catch (error) {
          console.warn('Fixeo urgent analytics unavailable', error);
        }

        return event;
      },
      read: readEvents,
    };

    window.FixeoUrgentAnalytics = api;
    return api;
  }

  function trackUrgentEvent(type, payload = {}) {
    return getUrgentAnalytics().track(type, payload);
  }

  function norm(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function inferCategory(query) {
    const text = norm(query);
    if (!text) return '';

    let bestCategory = '';
    let bestScore = 0;

    CATEGORY_RULES.forEach((rule) => {
      const score = rule.keywords.reduce((sum, keyword) => sum + (text.includes(norm(keyword)) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = rule.category;
      }
    });

    return bestCategory;
  }

  function getUrlState() {
    const params = new URLSearchParams(window.location.search);
    return {
      urgent: params.get('urgent') === '1',
      query: (params.get('query') || '').trim(),
      city: (params.get('city') || '').trim(),
      category: inferCategory(params.get('query') || '')
    };
  }

  function availabilityRank(artisan) {
    if (artisan.availability === 'available') return 0;
    if (artisan.availability === 'busy') return 1;
    return 2;
  }

  function sortUrgentResults(list, sortBy) {
    const items = [...list];

    items.sort((a, b) => {
      const availabilityDiff = availabilityRank(a) - availabilityRank(b);
      if (availabilityDiff !== 0) return availabilityDiff;

      if (sortBy === 'price_asc') {
        const priceDiff = Number(a.priceFrom || 0) - Number(b.priceFrom || 0);
        if (priceDiff !== 0) return priceDiff;
      }

      if (sortBy === 'rating') {
        const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
      }

      const responseDiff = Number(a.responseTime || 999) - Number(b.responseTime || 999);
      if (responseDiff !== 0) return responseDiff;

      return Number(b.rating || 0) - Number(a.rating || 0);
    });

    return items;
  }

  function filterUrgentResults(baseList, state, uiFilters) {
    const cityNorm = norm(uiFilters.city || state.city);
    const category = uiFilters.category || state.category;
    const availability = uiFilters.availability || '';

    let list = Array.isArray(baseList) ? [...baseList] : [];

    if (cityNorm) {
      list = list.filter((artisan) => norm(artisan.city) === cityNorm);
    }

    if (category) {
      list = list.filter((artisan) => norm(artisan.category) === norm(category));
    }

    if (availability) {
      list = list.filter((artisan) => artisan.availability === availability);
    }

    return sortUrgentResults(list, uiFilters.sortBy || 'response');
  }

  function buildFallbackCard(artisan) {
    const safeRating = Number(artisan.rating || 0).toFixed(1);
    const reviewCount = Number(artisan.reviewCount || 0);
    const responseTime = Number(artisan.responseTime || 0);
    const skills = Array.isArray(artisan.skills) ? artisan.skills.slice(0, 3) : [];
    const avatar = artisan.avatar || artisan.photo || artisan.image || 'default-avatar.jpg';
    const verified = Array.isArray(artisan.badges) && artisan.badges.includes('verified');
    const available = artisan.availability === 'available';

    return `
      <article class="artisan-card other-card discover-harmonized-card result-card" data-id="${artisan.id}">
        <div class="result-top">
          <img class="artisan-avatar artisan-avatar-image" src="${avatar}" alt="${artisan.name}" loading="lazy" onerror="this.onerror=null;this.src='demo-artisan.jpg';" />
          <div class="artisan-main artisan-identity artisan-card-heading">
            <h3 class="artisan-name">${artisan.name}</h3>
            <p class="artisan-service">${artisan.city || 'Maroc'}</p>
            <div class="artisan-badges badges">
              ${verified ? '<span class="badge verified">✔ Vérifié</span>' : ''}
              ${available ? '<span class="badge available">🟢 Disponible</span>' : '<span class="badge">⏱ Réponse rapide</span>'}
            </div>
          </div>
          <div class="artisan-price-block">
            <strong>Dès ${artisan.priceFrom || 150} MAD</strong>
            <span>${responseTime ? `Réponse : ${responseTime} min` : 'Réponse rapide'}</span>
          </div>
        </div>
        <div class="artisan-rating-row artisan-rating">
          <span>⭐ ${safeRating}</span>
          <span>(${reviewCount} avis)</span>
        </div>
        <div class="artisan-skills">${skills.map((skill) => `<span>${skill}</span>`).join('')}</div>
        <div class="result-actions card-buttons">
          <button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId(${JSON.stringify(String(artisan.id))}, event);}else if(window.openArtisanModal){openArtisanModal(${artisan.id});}">Voir profil</button>
          <button class="btn-secondary btn-other-reserve ssb2-btn-reserve primary-btn fixeo-reserve-btn" data-artisan-id="${artisan.id}" type="button">Demander devis</button>
        </div>
      </article>`;
  }

  function updateSummary(state, results) {
    $('#urgent-city').textContent = state.city || 'Toutes les villes';
    $('#urgent-query').textContent = state.query || 'Besoin urgent';
    $('#results-main-meta').textContent = `${results.length} artisan${results.length > 1 ? 's' : ''} disponible${results.length > 1 ? 's' : ''} • Priorité aux réponses rapides`;
    $('#results-context-line').textContent = state.city
      ? `Ville sélectionnée : ${state.city} · besoin : ${state.query || 'urgence'}`
      : `Besoin : ${state.query || 'urgence'} · résultats classés par rapidité`;
    $('#results-count').textContent = `${results.length} résultat${results.length > 1 ? 's' : ''}`;
    $('#other-artisans-count-badge').textContent = `👷 ${results.length} profil${results.length > 1 ? 's' : ''}`;

    const editLink = $('#empty-edit-link');
    if (editLink) {
      editLink.href = `index.html#services`;
    }
  }

  function populateCities(baseList, selectedCity) {
    const citySelect = $('#results-filter-city');
    if (!citySelect) return;

    const cities = Array.from(new Set((Array.isArray(baseList) ? baseList : []).map((artisan) => artisan.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
    citySelect.innerHTML = '<option value="">Toutes les villes</option>' + cities.map((city) => `<option value="${city}">${city}</option>`).join('');
    if (selectedCity && cities.includes(selectedCity)) {
      citySelect.value = selectedCity;
    }
  }

  function openUrgentBooking(artisan, state) {
    if (!artisan) return;

    const payload = {
      artisanId: artisan.id,
      artisanName: artisan.name || 'Artisan',
      city: state.city || artisan.city || '',
      query: state.query || '',
      source: 'urgent_results_page'
    };

    trackUrgentEvent('artisan_click', payload);

    if (typeof window.openBookingModal === 'function') {
      trackUrgentEvent('conversion', payload);
      window.openBookingModal(artisan.id);
    }
  }

  function enhanceUrgentResultButtons(results, state) {
    const container = $('#artisans-container');
    if (!container) return;

    const artisanMap = new Map((Array.isArray(results) ? results : []).map((artisan) => [String(artisan.id), artisan]));

    $$('.btn-other-reserve, .fixeo-reserve-btn', container).forEach((button) => {
      const card = button.closest('.artisan-card[data-id], .result-card[data-id], article[data-id]');
      const artisanId = String(button.dataset.artisanId || card?.dataset.id || '');
      const artisan = artisanMap.get(artisanId);
      button.type = 'button';
      button.removeAttribute('onclick');
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openUrgentBooking(artisan, state);
      };
    });
  }

  function renderResults(results, state) {
    const container = $('#artisans-container');
    const loading = $('#loading-artisans');
    const empty = $('#no-artisan');

    if (loading) loading.style.display = 'none';

    if (!container) return;

    if (!results.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    if (typeof window.renderArtisans === 'function') {
      // Sort by urgent priority BEFORE passing to renderArtisans so the
      // global marketplace re-sort (trust_score/missions) does not override.
      // renderArtisans receives a pre-sorted copy; skipResultsPageFilters
      // prevents FixeoResultsPage from re-filtering.
      var urgentSorted = results.slice().sort(function(a, b) {
        var aAvail = (a.availability || '').toLowerCase() === 'available' ? 0 : 1;
        var bAvail = (b.availability || '').toLowerCase() === 'available' ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;               // 1. availability
        var aResp = Number(a.responseTime || 999);
        var bResp = Number(b.responseTime || 999);
        if (aResp !== bResp) return aResp - bResp;                   // 2. responseTime
        return Number(b.rating || 0) - Number(a.rating || 0);        // 3. rating
      });
      window.renderArtisans(urgentSorted, { skipResultsPageFilters: true });
      enhanceUrgentResultButtons(urgentSorted, state);
      return;
    }

    container.innerHTML = results.map(buildFallbackCard).join('');
    enhanceUrgentResultButtons(results, state);
  }

  function initUrgentResultsPage() {
    const state = getUrlState();
    const baseList = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];

    populateCities(baseList, state.city);

    const uiState = {
      city: state.city,
      category: state.category,
      availability: 'available',
      sortBy: 'response'
    };

    const apply = () => {
      uiState.city = $('#results-filter-city')?.value || state.city;
      uiState.availability = $('#results-filter-availability')?.value || 'available';
      uiState.sortBy = $('#results-sort-select')?.value || 'response';

      const results = filterUrgentResults(baseList, state, uiState);
      updateSummary(state, results);
      renderResults(results, state);
    };

    $('#results-filter-city')?.addEventListener('change', apply);
    $('#results-filter-availability')?.addEventListener('change', apply);
    $('#results-sort-select')?.addEventListener('change', apply);
    $('#results-reset-btn')?.addEventListener('click', () => {
      const citySelect = $('#results-filter-city');
      const availabilitySelect = $('#results-filter-availability');
      const sortSelect = $('#results-sort-select');
      if (citySelect) citySelect.value = state.city || '';
      if (availabilitySelect) availabilitySelect.value = 'available';
      if (sortSelect) sortSelect.value = 'response';
      apply();
    });

    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUrgentResultsPage, { once: true });
  } else {
    initUrgentResultsPage();
  }
})();
