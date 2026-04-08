(function (window, document) {
  'use strict';

  var PAGE_FLAG = '__FIXEO_SERVICE_SEO_PAGE__';
  var DEFAULT_DESCRIPTION = 'Trouvez un artisan vérifié Fixeo par service et par ville au Maroc avec avis clients et Trust Score.';
  var DEFAULT_TITLE = 'Services artisans au Maroc | Fixeo';
  var DEFAULT_SUBTITLE = 'Artisans vérifiés Fixeo disponibles dans votre ville';
  var MARKETPLACE_URL = 'index.html#artisans-section';
  var SERVICES_URL = 'index.html#services';
  var SITE_ORIGIN = (window.location && /^https?:/i.test(String(window.location.origin || ''))) ? window.location.origin : 'https://fixeo.ma';
  var STATIC_SEO_PAGE_MAP = {
    'plombier-casablanca': 'plombier-casablanca.html',
    'electricien-rabat': 'electricien-rabat.html',
    'peinture-fes': 'peinture-fes.html',
    'serrurier-marrakech': 'serrurier-marrakech.html'
  };

  var CITY_MAP = {
    casablanca: { slug: 'casablanca', label: 'Casablanca' },
    rabat: { slug: 'rabat', label: 'Rabat' },
    marrakech: { slug: 'marrakech', label: 'Marrakech' },
    fes: { slug: 'fes', label: 'Fès' },
    tanger: { slug: 'tanger', label: 'Tanger' },
    agadir: { slug: 'agadir', label: 'Agadir' },
    meknes: { slug: 'meknes', label: 'Meknès' },
    oujda: { slug: 'oujda', label: 'Oujda' },
    kenitra: { slug: 'kenitra', label: 'Kénitra' },
    tetouan: { slug: 'tetouan', label: 'Tétouan' },
    safi: { slug: 'safi', label: 'Safi' },
    'el-jadida': { slug: 'el-jadida', label: 'El Jadida' },
    mohammedia: { slug: 'mohammedia', label: 'Mohammedia' },
    'beni-mellal': { slug: 'beni-mellal', label: 'Béni Mellal' },
    nador: { slug: 'nador', label: 'Nador' },
    taza: { slug: 'taza', label: 'Taza' },
    khouribga: { slug: 'khouribga', label: 'Khouribga' },
    settat: { slug: 'settat', label: 'Settat' },
    larache: { slug: 'larache', label: 'Larache' },
    khemisset: { slug: 'khemisset', label: 'Khémisset' }
  };

  var SERVICE_MAP = {
    plombier: {
      slug: 'plombier',
      title: 'Plombier',
      plural: 'plombiers',
      serviceType: 'Plomberie',
      internalCategories: ['plomberie'],
      aliases: ['plomberie', 'plombier', 'plombiers'],
      related: ['chauffe-eau', 'renovation', 'electricien', 'serrurier']
    },
    electricien: {
      slug: 'electricien',
      title: 'Électricien',
      plural: 'électriciens',
      serviceType: 'Électricité',
      internalCategories: ['electricite'],
      aliases: ['electricien', 'electriciens', 'electricite'],
      related: ['camera-surveillance', 'climatisation', 'plombier', 'renovation']
    },
    climatisation: {
      slug: 'climatisation',
      title: 'Climatisation',
      plural: 'spécialistes climatisation',
      serviceType: 'Climatisation',
      internalCategories: ['climatisation'],
      aliases: ['climatisation', 'climaticien', 'frigoriste'],
      related: ['chauffe-eau', 'electricien', 'renovation', 'plombier']
    },
    serrurier: {
      slug: 'serrurier',
      title: 'Serrurier',
      plural: 'serruriers',
      serviceType: 'Serrurerie',
      internalCategories: ['serrurerie', 'bricolage'],
      aliases: ['serrurier', 'serrurerie'],
      related: ['menuisier', 'plombier', 'electricien', 'renovation']
    },
    menuisier: {
      slug: 'menuisier',
      title: 'Menuisier',
      plural: 'menuisiers',
      serviceType: 'Menuiserie',
      internalCategories: ['menuiserie'],
      aliases: ['menuisier', 'menuiserie'],
      related: ['vitrier', 'serrurier', 'renovation', 'peintre']
    },
    peintre: {
      slug: 'peintre',
      title: 'Peintre',
      plural: 'peintres',
      serviceType: 'Peinture',
      internalCategories: ['peinture'],
      aliases: ['peintre', 'peintres', 'peinture'],
      related: ['platre', 'renovation', 'macon', 'menuisier']
    },
    carreleur: {
      slug: 'carreleur',
      title: 'Carreleur',
      plural: 'carreleurs',
      serviceType: 'Carrelage',
      internalCategories: ['maconnerie', 'bricolage'],
      aliases: ['carreleur', 'carrelage'],
      related: ['macon', 'renovation', 'plombier', 'peintre']
    },
    macon: {
      slug: 'macon',
      title: 'Maçon',
      plural: 'maçons',
      serviceType: 'Maçonnerie',
      internalCategories: ['maconnerie'],
      aliases: ['macon', 'maçon', 'maconnerie'],
      related: ['carreleur', 'renovation', 'platre', 'peintre']
    },
    jardinier: {
      slug: 'jardinier',
      title: 'Jardinier',
      plural: 'jardiniers',
      serviceType: 'Jardinage',
      internalCategories: ['jardinage'],
      aliases: ['jardinier', 'jardiniers', 'jardinage'],
      related: ['nettoyage', 'renovation', 'bricolage', 'menuisier']
    },
    nettoyage: {
      slug: 'nettoyage',
      title: 'Nettoyage',
      plural: 'artisans de nettoyage',
      serviceType: 'Nettoyage',
      internalCategories: ['nettoyage'],
      aliases: ['nettoyage', 'cleaner', 'menage'],
      related: ['vitrier', 'jardinier', 'platre', 'renovation']
    },
    vitrier: {
      slug: 'vitrier',
      title: 'Vitrier',
      plural: 'vitriers',
      serviceType: 'Vitrerie',
      internalCategories: ['menuiserie', 'bricolage', 'nettoyage'],
      aliases: ['vitrier', 'vitrerie'],
      related: ['menuisier', 'serrurier', 'nettoyage', 'renovation']
    },
    platre: {
      slug: 'platre',
      title: 'Plaquiste / Plâtre',
      plural: 'artisans plâtre',
      serviceType: 'Plâtre',
      internalCategories: ['maconnerie', 'peinture'],
      aliases: ['platre', 'plâtrier', 'platrerie', 'platre'],
      related: ['peintre', 'macon', 'renovation', 'carreleur']
    },
    renovation: {
      slug: 'renovation',
      title: 'Rénovation',
      plural: 'artisans rénovation',
      serviceType: 'Rénovation',
      internalCategories: ['maconnerie', 'peinture', 'menuiserie', 'plomberie', 'electricite', 'bricolage', 'climatisation'],
      aliases: ['renovation', 'rénovation', 'travaux'],
      related: ['macon', 'peintre', 'plombier', 'electricien']
    },
    'chauffe-eau': {
      slug: 'chauffe-eau',
      title: 'Chauffe-eau',
      plural: 'spécialistes chauffe-eau',
      serviceType: 'Chauffe-eau',
      internalCategories: ['plomberie', 'climatisation'],
      aliases: ['chauffe-eau', 'chauffeeau', 'chauffe eau'],
      related: ['plombier', 'climatisation', 'electricien', 'renovation']
    },
    'camera-surveillance': {
      slug: 'camera-surveillance',
      title: 'Caméra de surveillance',
      plural: 'installateurs caméra de surveillance',
      serviceType: 'Caméra de surveillance',
      internalCategories: ['electricite', 'bricolage'],
      aliases: ['camera-surveillance', 'camera surveillance', 'caméra de surveillance', 'securite', 'sécurité'],
      related: ['electricien', 'serrurier', 'renovation', 'climatisation']
    }
  };

  var serviceAliasIndex = {};
  var cityAliasIndex = {};
  var lastRenderSignature = '';

  function normalizeKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  Object.keys(SERVICE_MAP).forEach(function (key) {
    var config = SERVICE_MAP[key];
    serviceAliasIndex[normalizeKey(config.slug)] = config;
    (config.aliases || []).forEach(function (alias) {
      serviceAliasIndex[normalizeKey(alias)] = config;
    });
    (config.internalCategories || []).forEach(function (alias) {
      serviceAliasIndex[normalizeKey(alias)] = config;
    });
  });

  Object.keys(CITY_MAP).forEach(function (key) {
    var city = CITY_MAP[key];
    cityAliasIndex[normalizeKey(city.slug)] = city;
    cityAliasIndex[normalizeKey(city.label)] = city;
  });

  function getServiceBySlug(value) {
    return serviceAliasIndex[normalizeKey(value)] || null;
  }

  function getCityBySlug(value) {
    return cityAliasIndex[normalizeKey(value)] || null;
  }


  function isLocalFileEnvironment() {
    return Boolean(window.location && String(window.location.protocol || '').toLowerCase() === 'file:');
  }

  function buildAbsoluteUrl(path) {
    return new URL(path, SITE_ORIGIN).toString();
  }

  function buildServiceSeoFallbackHref(serviceSlug, citySlug) {
    var params = new URLSearchParams();
    if (serviceSlug) params.set('service', serviceSlug);
    if (citySlug) params.set('ville', citySlug);
    var query = params.toString();
    return 'service-seo.html' + (query ? ('?' + query) : '');
  }

  function buildSeoHref(serviceSlug, citySlug) {
    if (!serviceSlug) return 'service-seo.html';
    if (isLocalFileEnvironment()) {
      var staticKey = String(serviceSlug || '').trim() + '-' + String(citySlug || '').trim();
      if (citySlug && STATIC_SEO_PAGE_MAP[staticKey]) return STATIC_SEO_PAGE_MAP[staticKey];
      return buildServiceSeoFallbackHref(serviceSlug, citySlug);
    }
    return citySlug ? ('/services/' + serviceSlug + '/' + citySlug) : ('/services/' + serviceSlug);
  }

  function parseRouteState() {
    var params = new URLSearchParams(window.location.search || '');
    var pathMatch = String(window.location.pathname || '').match(/^\/services\/([^/?#]+)(?:\/([^/?#]+))?/i);
    var requestedService = pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : (params.get('service') || '');
    var requestedCity = pathMatch && pathMatch[2] ? decodeURIComponent(pathMatch[2]) : (params.get('ville') || params.get('city') || '');

    var service = getServiceBySlug(requestedService);
    var city = getCityBySlug(requestedCity);
    var invalidService = Boolean(normalizeKey(requestedService) && !service);
    var invalidCity = Boolean(normalizeKey(requestedCity) && !city);

    return {
      requestedService: requestedService,
      requestedCity: requestedCity,
      service: service,
      city: city,
      invalidService: invalidService,
      invalidCity: invalidCity,
      canonicalPath: service
        ? (city && !invalidCity ? ('/services/' + service.slug + '/' + city.slug) : ('/services/' + service.slug))
        : 'service-seo.html'
    };
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setHtml(id, value) {
    var node = document.getElementById(id);
    if (node) node.innerHTML = value;
  }

  function setHeadMeta(name, content) {
    if (!document.head) return;
    var selector = 'meta[name="' + name + '"]';
    var meta = document.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content || '');
  }

  function setPropertyMeta(property, content) {
    if (!document.head) return;
    var selector = 'meta[property="' + property + '"]';
    var meta = document.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content || '');
  }

  function setCanonical(href) {
    if (!document.head) return;
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', buildAbsoluteUrl(href));
  }

  function setSchema(data) {
    if (!document.head) return;
    var script = document.getElementById('fixeo-service-seo-schema');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'fixeo-service-seo-schema';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data || {});
  }

  function getCityValue(artisan) {
    return artisan && (artisan.city || artisan.ville || '');
  }

  function getCategoryValue(artisan) {
    return normalizeKey(artisan && (artisan.category || artisan.service || artisan.specialty || artisan.job || ''));
  }

  function getArtisans() {
    return Array.isArray(window.ARTISANS) ? window.ARTISANS.slice() : [];
  }

  function filterArtisans(state) {
    if (!state.service) return [];
    var allowedCategories = (state.service.internalCategories || []).map(normalizeKey);
    return getArtisans().filter(function (artisan) {
      var artisanCategory = getCategoryValue(artisan);
      if (!allowedCategories.includes(artisanCategory)) return false;
      if (state.city && !state.invalidCity) {
        return normalizeKey(getCityValue(artisan)) === state.city.slug;
      }
      return true;
    });
  }

  function buildTitle(state) {
    if (!state.service) return DEFAULT_TITLE;
    if (state.city && !state.invalidCity) return state.service.title + ' à ' + state.city.label + ' | Fixeo';
    return state.service.title + ' au Maroc | Fixeo';
  }

  function buildDescription(state) {
    if (!state.service) return DEFAULT_DESCRIPTION;
    if (state.city && !state.invalidCity) {
      return 'Trouvez les meilleurs ' + state.service.plural + ' à ' + state.city.label + ' avec avis clients et Trust Score.';
    }
    return 'Trouvez les meilleurs ' + state.service.plural + ' au Maroc avec avis clients et Trust Score.';
  }

  function buildHeading(state) {
    if (!state.service) return 'Artisans au Maroc';
    if (state.city && !state.invalidCity) return state.service.title + ' à ' + state.city.label;
    return state.service.title + ' au Maroc';
  }

  function updateMeta(state) {
    var title = buildTitle(state);
    var description = buildDescription(state);
    var canonical = state.canonicalPath || 'service-seo.html';

    document.title = title;
    setHeadMeta('description', description);
    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:url', buildAbsoluteUrl(canonical));
    setCanonical(canonical);

    setSchema(state.service ? {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: buildHeading(state),
      serviceType: state.service.serviceType,
      url: buildAbsoluteUrl(canonical),
      description: description,
      areaServed: state.city && !state.invalidCity
        ? { '@type': 'City', name: state.city.label, addressCountry: 'MA' }
        : { '@type': 'Country', name: 'Maroc' },
      provider: {
        '@type': 'Organization',
        name: 'Fixeo',
        url: buildAbsoluteUrl('/index.html')
      }
    } : {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: DEFAULT_TITLE,
      url: new URL('service-seo.html', window.location.origin).toString(),
      description: DEFAULT_DESCRIPTION
    });
  }

  function renderValidationNote(state, count) {
    var note = document.getElementById('seo-validation-note');
    if (!note) return;
    var messages = [];
    if (state.invalidService) messages.push('Service invalide : retour vers une page SEO propre sans erreur JavaScript.');
    if (state.invalidCity) messages.push('Ville non reconnue : affichage automatique de la page nationale du service.');
    if (!state.service) messages.push('Utilisez /services/:service ou /services/:service/:ville, ou le fallback service-seo.html?service=...&ville=....');
    if (state.service && !state.invalidService && count > 0) messages.push('Filtrage service + ville appliqué, puis tri intelligent marketplace existant conservé.');

    if (!messages.length) {
      note.classList.remove('is-visible');
      note.textContent = '';
      return;
    }

    note.classList.add('is-visible');
    note.textContent = messages.join(' ');
  }

  function buildSeoLinkCard(href, kicker, title, copy) {
    return '<a class="seo-link-card" href="' + href + '">' +
      '<span>' + kicker + '</span>' +
      '<strong>' + title + '</strong>' +
      '<p>' + copy + '</p>' +
    '</a>';
  }

  function renderCityLinks(state, filteredList) {
    var target = document.getElementById('seo-city-links');
    if (!target || !state.service) return;

    var availabilityByCity = {};
    getArtisans().forEach(function (artisan) {
      var category = getCategoryValue(artisan);
      if ((state.service.internalCategories || []).map(normalizeKey).indexOf(category) === -1) return;
      var city = getCityBySlug(getCityValue(artisan));
      if (!city) return;
      availabilityByCity[city.slug] = (availabilityByCity[city.slug] || 0) + 1;
    });

    var cityKeys = Object.keys(CITY_MAP).sort(function (left, right) {
      return (availabilityByCity[right] || 0) - (availabilityByCity[left] || 0) || CITY_MAP[left].label.localeCompare(CITY_MAP[right].label, 'fr');
    });

    target.innerHTML = cityKeys.filter(function (slug) {
      return !state.city || slug !== state.city.slug;
    }).slice(0, 8).map(function (slug) {
      var city = CITY_MAP[slug];
      var href = buildSeoHref(state.service.slug, city.slug);
      var count = availabilityByCity[city.slug] || 0;
      return buildSeoLinkCard(href, city.label, state.service.title + ' à ' + city.label, count ? (count + ' artisan' + (count > 1 ? 's' : '') + ' disponibles dans cette zone.') : 'Version locale prête pour le référencement et le fallback mobile.');
    }).join('');
  }

  function renderServiceLinks(state) {
    var target = document.getElementById('seo-service-links');
    if (!target) return;

    var related = state.service ? state.service.related.slice(0, 6) : Object.keys(SERVICE_MAP).slice(0, 6);
    target.innerHTML = related.map(function (slug) {
      var service = SERVICE_MAP[slug];
      if (!service) return '';
      var href = state.city && !state.invalidCity ? buildSeoHref(service.slug, state.city.slug) : buildSeoHref(service.slug, '');
      return buildSeoLinkCard(href, service.serviceType, state.city && !state.invalidCity ? (service.title + ' à ' + state.city.label) : (service.title + ' au Maroc'), 'Page dynamique compatible avec le profil public, les avis et le Trust Score.');
    }).join('');
  }

  function renderEmptyState(state) {
    var emptyEl = document.getElementById('no-artisan');
    if (!emptyEl) return;
    var title = state.invalidService ? 'Service indisponible pour le moment' : 'Aucun artisan disponible pour le moment';
    var copy = state.invalidService
      ? 'Le service demandé n\'est pas reconnu. Vous pouvez revenir vers la marketplace Fixeo ou explorer un autre service.'
      : 'Aucun artisan disponible pour le moment pour cette recherche. Essayez une autre ville, un service proche ou revenez à la marketplace.';
    emptyEl.innerHTML = '' +
      '<h2>' + title + '</h2>' +
      '<p>' + copy + '</p>' +
      '<div class="seo-empty-actions">' +
        '<a class="seo-btn-link primary" href="' + MARKETPLACE_URL + '">Retour marketplace</a>' +
        '<a class="seo-btn-link secondary" href="' + SERVICES_URL + '">Voir services similaires</a>' +
        (state.service ? '<a class=\"seo-btn-link secondary\" href=\"' + buildSeoHref(state.service.slug, '') + '\">Voir autres villes</a>' : '') +
      '</div>';
  }

  function applyPageCopy(state, filteredList) {
    var count = filteredList.length;
    var pageTitle = buildHeading(state);
    setText('seo-title', pageTitle);
    setText('seo-breadcrumb-current', pageTitle);
    setText('seo-description', buildDescription(state));
    setText('seo-subtitle', DEFAULT_SUBTITLE);
    setText('seo-stat-service', state.service ? state.service.serviceType : 'Service à sélectionner');
    setText('seo-stat-city', state.city && !state.invalidCity ? state.city.label : 'Toutes les villes');
    setText('seo-stat-count', count + ' artisan' + (count > 1 ? 's' : ''));
    setText('seo-page-copy', state.service ? 'Routing /services compatible + fallback stable service-seo.html?service=' + state.service.slug + (state.city && !state.invalidCity ? '&ville=' + state.city.slug : '') + '.' : 'Activez la page avec un service valide ou un fallback par paramètres.');
    setText('seo-kicker', state.city && !state.invalidCity ? ('SEO local • ' + state.city.label) : 'SEO service • Maroc');
    setText('results-count', count + ' artisan' + (count > 1 ? 's' : '') + ' trouvé' + (count > 1 ? 's' : ''));
  }

  function renderFilteredArtisans(state) {
    var filteredList = filterArtisans(state);
    var signature = [state.service ? state.service.slug : 'none', state.city && !state.invalidCity ? state.city.slug : 'all', filteredList.length, getArtisans().length].join('|');
    lastRenderSignature = signature;

    updateMeta(state);
    applyPageCopy(state, filteredList);
    renderValidationNote(state, filteredList.length);
    renderCityLinks(state, filteredList);
    renderServiceLinks(state);
    renderEmptyState(state);

    if (window.searchEngine) {
      window.searchEngine.artisans = getArtisans();
      window.searchEngine.filtered = filteredList.slice();
    }

    if (typeof window.renderArtisans === 'function') {
      window.renderArtisans(state.service && !state.invalidService ? filteredList : [], { skipResultsPageFilters: true });
    }

    var loadingEl = document.getElementById('loading-artisans');
    if (loadingEl) loadingEl.style.display = 'none';
  }

  function boot() {
    if (!window[PAGE_FLAG]) return;
    if (!document.getElementById('artisans-container')) return;
    renderFilteredArtisans(parseRouteState());
  }

  function rerender() {
    if (!window[PAGE_FLAG]) return;
    var state = parseRouteState();
    var nextSignature = [state.service ? state.service.slug : 'none', state.city && !state.invalidCity ? state.city.slug : 'all', getArtisans().length].join('|');
    if (nextSignature === lastRenderSignature && document.getElementById('artisans-container') && document.getElementById('artisans-container').children.length) return;
    renderFilteredArtisans(state);
  }

  window.FixeoServiceSeoPage = {
    isActive: function () { return Boolean(window[PAGE_FLAG]); },
    boot: boot,
    rerender: rerender,
    parseRouteState: parseRouteState,
    getServiceBySlug: getServiceBySlug,
    getCityBySlug: getCityBySlug,
    filterArtisans: filterArtisans
  };

  window.addEventListener('fixeo:marketplace-artisans-updated', rerender);
  window.addEventListener('fixeo:artisan-created', rerender);
  window.addEventListener('storage', function () { setTimeout(rerender, 40); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
