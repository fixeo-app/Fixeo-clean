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

  // Profession labels for the urgent card subtitle
  var URGENT_PROFESSION_LABELS = {
    plomberie: 'Plombier', electricite: 'Électricien', serrurerie: 'Serrurier',
    climatisation: 'Frigoriste', nettoyage: 'Agent de nettoyage', peinture: 'Peintre',
    menuiserie: 'Menuisier', bricolage: 'Bricoleur', maconnerie: 'Maçon',
    jardinage: 'Jardinier', demenagement: 'Déménageur'
  };

  // Dedicated urgent card — clean, mobile-safe, no layout conflicts with homepage CSS.
  // Does NOT use renderArtisans so city/category filtering is guaranteed.
  function buildUrgentCard(artisan) {
    var safeRating   = Number(artisan.rating || 0).toFixed(1);
    var reviewCount  = Number(artisan.reviewCount || 0);
    var responseTime = Number(artisan.responseTime || 0);
    var avatar       = artisan.avatar || artisan.photo || artisan.image || 'default-avatar.jpg';
    var verified     = Array.isArray(artisan.badges) && artisan.badges.includes('verified');
    var available    = (artisan.availability || '').toLowerCase() === 'available';
    var profession   = URGENT_PROFESSION_LABELS[artisan.category] || artisan.category || 'Artisan';
    var city         = artisan.city || 'Maroc';
    var price        = artisan.priceFrom || 150;
    var safeId       = JSON.stringify(String(artisan.id));

    return '<article class="artisan-card other-card discover-harmonized-card result-card fixeo-urgent-card" data-id="' + artisan.id + '">'
      + '<div class="result-top" style="display:flex;align-items:flex-start;gap:.85rem;margin-bottom:.9rem">'
      +   '<img class="artisan-avatar artisan-avatar-image" src="' + avatar + '" alt="' + artisan.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'demo-artisan.jpg\';" style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0"/>'
      +   '<div class="artisan-main artisan-identity artisan-card-heading" style="min-width:0;flex:1">'
      +     '<h3 class="artisan-name" style="margin:0 0 .2rem;font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + artisan.name + '</h3>'
      +     '<p class="artisan-service" style="margin:0 0 .45rem;font-size:.88rem;color:rgba(255,255,255,.75)">'
      +       '<strong style="color:#fff">' + profession + '</strong>'
      +       ' &bull; ' + city
      +     '</p>'
      +     '<div class="artisan-badges badges" style="display:flex;flex-wrap:wrap;gap:.35rem">'
      +       (available ? '<span class="badge available" style="background:rgba(46,204,113,.18);border:1px solid rgba(46,204,113,.4);color:#2ecc71;font-size:.74rem;padding:.2rem .55rem;border-radius:999px">🟢 Disponible</span>' : '<span class="badge" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.7);font-size:.74rem;padding:.2rem .55rem;border-radius:999px">⏱ Réponse rapide</span>')
      +       (verified ? '<span class="badge verified" style="background:rgba(55,66,250,.18);border:1px solid rgba(55,66,250,.35);color:#6c7bfa;font-size:.74rem;padding:.2rem .55rem;border-radius:999px">✔ Vérifié</span>' : '')
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="artisan-rating-row artisan-rating" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;padding:.6rem .8rem;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">'
      +   '<span style="font-weight:800;color:#ffd166">⭐ ' + safeRating + '</span>'
      +   '<span style="color:rgba(255,255,255,.7)">(' + reviewCount + ' avis)</span>'
      +   '<span style="margin-left:auto;font-size:.8rem;color:rgba(255,255,255,.55)">Dès ' + price + ' MAD</span>'
      +   (responseTime ? '<span style="font-size:.78rem;color:rgba(255,255,255,.5)">&bull; ' + responseTime + ' min</span>' : '')
      + '</div>'
      + '<div class="result-actions card-buttons" style="display:flex;gap:.7rem;flex-wrap:wrap">'
      +   '<button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" style="flex:1;min-width:120px;font-weight:700" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId(' + safeId + ',event);}else if(window.openArtisanModal){openArtisanModal(' + artisan.id + ');}">Voir profil</button>'
      +   '<button class="btn-secondary btn-other-reserve ssb2-btn-reserve primary-btn fixeo-reserve-btn" data-artisan-id="' + artisan.id + '" type="button" style="flex:1;min-width:120px;font-weight:700">Demander devis</button>'
      + '</div>'
      + '</article>';
  }

  // Keep buildFallbackCard as alias for backward compatibility (not called in urgent flow)
  function buildFallbackCard(artisan) { return buildUrgentCard(artisan); }

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

    // Always use the dedicated urgent card renderer — never delegating to
    // window.renderArtisans which re-sorts by global trust_score/missions and
    // could clobber the city+category-filtered list with wrong artisans.
    container.innerHTML = results.map(buildUrgentCard).join('');
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
