(function (window, document) {
  'use strict';

  var REQUESTS_KEY = 'fixeo_client_requests';
  var REGISTRY_KEY = 'fixeo_public_artisans_registry';
  var SLUG_MAP_KEY = 'fixeo_artisan_slug_map';
  var REVIEWS_BATCH = 5;
  var DEFAULT_PROFILE_DESCRIPTION = 'Artisan vérifié Fixeo. Voir avis clients, Trust Score, disponibilité et demander intervention.';
  var MARKETPLACE_FALLBACK_URL = '/index.html#artisans-section';

  function safeJSONParse(value, fallback) {
    try {
      var parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function pickValue() {
    for (var i = 0; i < arguments.length; i += 1) {
      if (hasValue(arguments[i])) return String(arguments[i]).trim();
    }
    return '';
  }

  function pickNumber() {
    for (var i = 0; i < arguments.length; i += 1) {
      var number = Number(arguments[i]);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return normalizeText(value)
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function loadSlugMap() {
    var parsed = safeJSONParse(localStorage.getItem(SLUG_MAP_KEY) || '{}', {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    var normalized = {};
    Object.keys(parsed).forEach(function (key) {
      var slug = slugify(key);
      var publicId = String(parsed[key] || '').trim();
      if (slug && publicId) normalized[slug] = publicId;
    });
    return normalized;
  }

  function extractSlugFromPathname(pathname) {
  if (!pathname) return '';

  var match = pathname.match(/\/artisan\/([^\/\?]+)/i);
  if (match && match[1]) {
    return slugify(match[1].trim());
  }

  var parts = pathname.split('/').filter(Boolean);
  return parts.length ? slugify(parts[parts.length - 1].trim()) : '';
}

  function normalizeStatus(value) {
    var normalized = normalizeText(value || '');
    if (!normalized || normalized === 'nouvelle' || normalized === 'disponible') return 'nouvelle';
    if (normalized === 'acceptee' || normalized === 'accepte') return 'acceptée';
    if (normalized === 'en cours' || normalized === 'en_cours' || normalized === 'encours') return 'en_cours';
    if (normalized === 'terminee' || normalized === 'termine') return 'terminée';
    if (normalized === 'validee' || normalized === 'valide') return 'validée';
    if (normalized === 'intervention confirmee' || normalized === 'intervention_confirmee') return 'intervention_confirmée';
    return String(value || '').trim() || 'nouvelle';
  }

  function normalizeConfirmation(value, status) {
    var normalized = normalizeText(value || '');
    if (normalized === 'confirmee') return 'confirmée';
    if (normalized === 'en attente' || normalized === 'en_attente') return 'en_attente';
    if (status === 'intervention_confirmée') return 'confirmée';
    return '';
  }

  function normalizeCommissionStatus(raw, status) {
    var normalized = normalizeText(raw && raw.commission_status);
    if (normalized === 'payee' || normalized === 'paye' || raw && raw.commission_paid === true) return 'payée';
    if (status === 'validée' || status === 'intervention_confirmée') return 'à_payer';
    return '';
  }

  function parseDate(value) {
    if (!hasValue(value)) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDate(value) {
    var date = parseDate(value);
    if (!date) return 'Date non précisée';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatPercent(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) number = 0;
    number = Math.max(0, Math.min(1, number));
    return Math.round(number * 100) + '%';
  }

  function formatRating(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) number = 0;
    number = Math.max(0, Math.min(5, Math.round(number * 10) / 10));
    return number.toFixed(1);
  }

  function formatStars(value) {
    var rounded = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    return (rounded ? '★'.repeat(rounded) : '') + '☆'.repeat(5 - rounded);
  }

  function categoryLabel(value) {
    var normalized = normalizeText(value);
    var labels = {
      plomberie: 'Plomberie',
      electricite: 'Électricité',
      peinture: 'Peinture',
      nettoyage: 'Nettoyage',
      jardinage: 'Jardinage',
      demenagement: 'Déménagement',
      bricolage: 'Bricolage',
      climatisation: 'Climatisation',
      menuiserie: 'Menuiserie',
      maconnerie: 'Maçonnerie',
      serrurerie: 'Serrurerie'
    };
    return labels[normalized] || pickValue(value, 'Catégorie non précisée');
  }

  function availabilityMeta(value) {
    var normalized = normalizeText(value);
    if (normalized === 'available' || normalized === 'disponible' || normalized === 'online' || normalized === 'active' || normalized === 'en ligne') {
      return { label: 'Disponible', className: 'is-available' };
    }
    if (normalized === 'busy' || normalized === 'occupe' || normalized === 'occupé') {
      return { label: 'Occupé', className: 'is-busy' };
    }
    if (normalized === 'offline' || normalized === 'hors ligne') {
      return { label: 'Hors ligne', className: 'is-offline' };
    }
    return { label: 'Disponibilité non précisée', className: 'is-unknown' };
  }

  function getTrustLevel(score) {
    var safeScore = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
    if (safeScore >= 90) return 'Elite';
    if (safeScore >= 75) return 'Fiable';
    if (safeScore >= 50) return 'Standard';
    return 'Nouveau';
  }

  function getTrustTheme(level) {
    if (level === 'Elite') return { color: '#7c3aed', bg: 'rgba(124,58,237,.16)', border: 'rgba(167,139,250,.45)' };
    if (level === 'Fiable') return { color: '#16a34a', bg: 'rgba(22,163,74,.15)', border: 'rgba(74,222,128,.45)' };
    if (level === 'Standard') return { color: '#2563eb', bg: 'rgba(37,99,235,.15)', border: 'rgba(96,165,250,.45)' };
    return { color: '#6b7280', bg: 'rgba(107,114,128,.15)', border: 'rgba(156,163,175,.45)' };
  }

  function getInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'FX';
    return parts.slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('');
  }

  function getRequestDate(raw) {
    return pickValue(raw && raw.review_date, raw && raw.validated_at, raw && raw.completed_at, raw && raw.accepted_at, raw && raw.created_at, raw && raw.date);
  }

  function loadRequests() {
    var parsed = safeJSONParse(localStorage.getItem(REQUESTS_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function loadRegistry() {
    var parsed = safeJSONParse(localStorage.getItem(REGISTRY_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function normalizeRegistryEntry(entry) {
    return {
      public_id: pickValue(entry && entry.public_id, entry && entry.id),
      slug: pickValue(entry && entry.slug),
      source_ids: Array.isArray(entry && entry.source_ids) ? entry.source_ids.map(function (value) { return String(value || '').trim(); }).filter(Boolean) : [],
      name: pickValue(entry && entry.name),
      category: pickValue(entry && entry.category),
      city: pickValue(entry && entry.city),
      avatar: pickValue(entry && entry.avatar),
      availability: pickValue(entry && entry.availability),
      trust_score: pickNumber(entry && entry.trust_score),
      created_at: pickValue(entry && entry.created_at)
    };
  }

  function findPublicIdBySlug(slug) {
    var normalizedSlug = slugify(slug);
    if (!normalizedSlug) return '';

    if (window.FixeoPublicProfileLinks && typeof window.FixeoPublicProfileLinks.findPublicIdBySlug === 'function') {
      var externalId = String(window.FixeoPublicProfileLinks.findPublicIdBySlug(normalizedSlug) || '').trim();
      if (externalId) return externalId;
    }

    var slugMap = loadSlugMap();
    if (slugMap[normalizedSlug]) return slugMap[normalizedSlug];

    var registryEntry = loadRegistry().map(normalizeRegistryEntry).find(function (entry) {
      return slugify(entry.slug) === normalizedSlug;
    });

    if (registryEntry && registryEntry.public_id) {
      slugMap[normalizedSlug] = registryEntry.public_id;
      persistSlugMap(slugMap);
      return registryEntry.public_id;
    }

    return '';
  }

  function setHeadMeta(name, content) {
    if (!document || !document.head || !name) return;
    var selector = 'meta[name="' + name + '"]';
    var meta = document.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content || '');
  }

  function setCanonicalHref(href) {
    if (!document || !document.head || !href) return;
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    try {
      link.setAttribute('href', new URL(href, window.location.origin).toString());
    } catch (error) {
      link.setAttribute('href', href);
    }
  }

  function buildCanonicalProfileHref(artisanLike) {
    var resolved = window.FixeoPublicProfileLinks && typeof window.FixeoPublicProfileLinks.resolve === 'function'
      ? window.FixeoPublicProfileLinks.resolve({
          id: pickValue(artisanLike && artisanLike.id, artisanLike && artisanLike.public_id, artisanLike && artisanLike.artisan_id),
          assigned_artisan_id: pickValue(artisanLike && artisanLike.assigned_artisan_id),
          name: pickValue(artisanLike && artisanLike.name),
          category: pickValue(artisanLike && artisanLike.category),
          city: pickValue(artisanLike && artisanLike.city),
          phone: pickValue(artisanLike && artisanLike.phone),
          email: pickValue(artisanLike && artisanLike.email)
        })
      : null;

    if (resolved && resolved.href) return resolved.href;

    var artisanId = pickValue(artisanLike && artisanLike.id, artisanLike && artisanLike.public_id, artisanLike && artisanLike.artisan_id);
    return artisanId ? ('/artisan-profile.html?id=' + encodeURIComponent(artisanId)) : '/artisan-profile.html';
  }

  function updateSeoMeta(meta) {
    document.title = pickValue(meta && meta.title, 'Profil artisan | Fixeo');
    setHeadMeta('description', pickValue(meta && meta.description, DEFAULT_PROFILE_DESCRIPTION));
    if (meta && meta.canonicalHref) setCanonicalHref(meta.canonicalHref);
  }

  function resolveArtisanIdFromLocation() {
    var params = new URLSearchParams(window.location.search || '');
    var artisanId = String(params.get('id') || '').trim();
    if (artisanId) return { artisanId: artisanId, slug: '', source: 'id' };

    var slug = extractSlugFromPathname(window.location.pathname || '');
    if (!slug) return { artisanId: '', slug: '', source: 'none' };

  var id = String(findPublicIdBySlug(slug) || '').trim();

if (!id) {
  id = slug;
}

return {
  artisanId: id,
  slug: slug,
  source: 'slug'
};

  function matchesArtisan(raw, artisanId) {
    if (!raw || typeof raw !== 'object') return false;
    var normalizedId = String(artisanId || '').trim();
    if (!normalizedId) return false;

    var nested = raw.artisan && typeof raw.artisan === 'object' ? raw.artisan : {};
    var candidateIds = [
      raw.assigned_artisan_id,
      raw.artisan_id,
      raw.id,
      nested.id,
      nested.public_id,
      nested.artisan_id
    ].map(function (value) {
      return String(value || '').trim();
    }).filter(Boolean);

    return candidateIds.indexOf(normalizedId) !== -1;
  }

  function matchesArtisanSnapshot(raw, artisanLike) {
    if (!raw || typeof raw !== 'object' || !artisanLike || typeof artisanLike !== 'object') return false;

    var candidateIds = [
      pickValue(artisanLike.id),
      pickValue(artisanLike.public_id),
      pickValue(artisanLike.assigned_artisan_id)
    ].filter(Boolean);

    var assignedId = String(raw.assigned_artisan_id || '').trim();
    var nestedId = String(raw.artisan && raw.artisan.id || '').trim();
    if (candidateIds.some(function (candidateId) { return candidateId === assignedId || candidateId === nestedId; })) {
      return true;
    }

    var nested = raw.artisan && typeof raw.artisan === 'object' ? raw.artisan : {};
    var sameName = normalizeText(pickValue(artisanLike.name)) && normalizeText(pickValue(artisanLike.name)) === normalizeText(pickValue(nested.name, raw.assigned_artisan));
    if (!sameName) return false;

    var artisanCity = normalizeText(pickValue(artisanLike.city));
    var requestCity = normalizeText(pickValue(nested.city, raw.city, raw.ville));
    var artisanCategory = normalizeText(pickValue(artisanLike.category));
    var requestCategory = normalizeText(pickValue(nested.category, nested.specialty, nested.job, raw.category, raw.service));

    var sameCity = !artisanCity || !requestCity || artisanCity === requestCity;
    var sameCategory = !artisanCategory || !requestCategory || artisanCategory === requestCategory;
    return sameCity && sameCategory;
  }

  function mergeArtisanSummary(current, raw, artisanId) {
    var next = Object.assign({}, current || {});
    var nested = raw && raw.artisan && typeof raw.artisan === 'object' ? raw.artisan : {};

    next.id = pickValue(next.id, nested.id, raw && raw.assigned_artisan_id, artisanId);
    next.name = pickValue(next.name, nested.name, raw && raw.assigned_artisan);
    next.category = pickValue(next.category, nested.category, nested.specialty, nested.job, raw && raw.category, raw && raw.service);
    next.city = pickValue(next.city, nested.city, raw && raw.city, raw && raw.ville);
    next.avatar = pickValue(next.avatar, nested.avatar, nested.photo, nested.image, nested.picture);
    next.availability = pickValue(next.availability, nested.availability, nested.status, raw && raw.availability);

    if (next.trust_score == null) {
      next.trust_score = pickNumber(nested.trust_score, nested.trustScore, raw && raw.trust_score, raw && raw.trustScore);
    }
    next.trust_level = pickValue(next.trust_level, nested.trust_level, nested.trustLevel, raw && raw.trust_level, raw && raw.trustLevel);
    next.created_at = pickValue(next.created_at, nested.created_at, nested.createdAt, raw && raw.created_at, raw && raw.date);

    return next;
  }

  function normalizeMission(raw) {
    var status = normalizeStatus(raw && raw.status);
    var rating = Number(raw && raw.review_rating || 0);
    return {
      id: pickValue(raw && raw.id),
      status: status,
      client_confirmation: normalizeConfirmation(raw && raw.client_confirmation, status),
      commission_status: normalizeCommissionStatus(raw || {}, status),
      review_submitted: raw && raw.review_submitted === true,
      review_rating: Number.isFinite(rating) ? rating : 0,
      review_comment: pickValue(raw && raw.review_comment),
      review_date: pickValue(raw && raw.review_date),
      created_at: pickValue(raw && raw.created_at, raw && raw.date),
      accepted_at: pickValue(raw && raw.accepted_at),
      completed_at: pickValue(raw && raw.completed_at),
      validated_at: pickValue(raw && raw.validated_at)
    };
  }

  function computeSeniority(missions, artisan) {
    if (!Array.isArray(missions) || !missions.length) return 'Nouveau artisan';

    var timestamps = [];
    missions.forEach(function (mission) {
      [mission.created_at, mission.accepted_at, mission.completed_at, mission.validated_at].forEach(function (value) {
        var date = parseDate(value);
        if (date) timestamps.push(date.getTime());
      });
    });

    var artisanDate = parseDate(artisan && artisan.created_at);
    if (artisanDate) timestamps.push(artisanDate.getTime());
    if (!timestamps.length) return 'Nouveau artisan';

    var earliest = new Date(Math.min.apply(Math, timestamps));
    var months = Math.max(0, (new Date().getFullYear() - earliest.getFullYear()) * 12 + (new Date().getMonth() - earliest.getMonth()));

    if (months >= 24) return Math.floor(months / 12) + ' ans';
    if (months >= 12) return '1 an';
    if (months >= 2) return months + ' mois';
    if (months === 1) return '1 mois';
    return 'Nouveau artisan';
  }

  function computeStaticProfileData(artisanLike, requestedId) {
    if (!artisanLike || typeof artisanLike !== 'object') return null;

    var trustScore = Number.isFinite(Number(artisanLike.trust_score)) ? Math.max(0, Math.min(100, Math.round(Number(artisanLike.trust_score)))) : 0;
    var trustLevel = pickValue(artisanLike.trust_level, getTrustLevel(trustScore));

    return {
      artisan: {
        id: pickValue(artisanLike.id, artisanLike.public_id, requestedId),
        name: pickValue(artisanLike.name, 'Artisan Fixeo'),
        category: categoryLabel(artisanLike.category),
        city: pickValue(artisanLike.city, 'Ville non précisée'),
        avatar: pickValue(artisanLike.avatar),
        availability: pickValue(artisanLike.availability),
        trust_score: trustScore,
        trust_level: trustLevel,
        created_at: pickValue(artisanLike.created_at)
      },
      missions: [],
      stats: {
        total_missions: 0,
        missions_validées: 0,
        missions_confirmées: 0,
        commissions_payées: 0,
        missions_terminées: 0,
        average_rating: null,
        total_reviews: 0,
        trust_score: trustScore,
        trust_level: trustLevel,
        confirmation_rate: 0,
        payment_rate: 0,
        seniority: 'Nouveau artisan'
      },
      reviews: []
    };
  }

  function buildProfileDataFromMatches(matchingRaw, artisanSeed, requestedId) {
    if (!matchingRaw.length) return computeStaticProfileData(artisanSeed, requestedId);

    var artisan = matchingRaw.reduce(function (accumulator, raw) {
      return mergeArtisanSummary(accumulator, raw, requestedId);
    }, Object.assign({ id: requestedId, trust_score: null, trust_level: '' }, artisanSeed || {}));

    var missions = matchingRaw.map(normalizeMission);
    var totalMissions = missions.length;
    var missionsValidated = missions.filter(function (mission) {
      return mission.status === 'validée';
    }).length;
    var missionsCompleted = missions.filter(function (mission) {
      return mission.status === 'terminée' || mission.status === 'validée' || mission.status === 'intervention_confirmée';
    }).length;
    var missionsConfirmed = missions.filter(function (mission) {
      return (mission.status === 'terminée' || mission.status === 'validée' || mission.status === 'intervention_confirmée')
        && mission.client_confirmation === 'confirmée';
    }).length;
    var commissionsPaid = missions.filter(function (mission) {
      return mission.status === 'validée' && mission.commission_status === 'payée';
    }).length;

    var reviewedMissions = missions
      .filter(function (mission) {
        return mission.review_submitted === true && mission.review_rating >= 1 && mission.review_rating <= 5;
      })
      .sort(function (left, right) {
        var rightDate = parseDate(getRequestDate(right));
        var leftDate = parseDate(getRequestDate(left));
        return (rightDate ? rightDate.getTime() : 0) - (leftDate ? leftDate.getTime() : 0);
      });

    var totalReviews = reviewedMissions.length;
    var averageRating = totalReviews
      ? Math.round((reviewedMissions.reduce(function (sum, mission) { return sum + Number(mission.review_rating || 0); }, 0) / totalReviews) * 10) / 10
      : null;

    var trustScore = Number.isFinite(Number(artisan.trust_score)) ? Math.max(0, Math.min(100, Math.round(Number(artisan.trust_score)))) : 0;
    var trustLevel = pickValue(artisan.trust_level, getTrustLevel(trustScore));

    return {
      artisan: {
        id: artisan.id || requestedId,
        name: pickValue(artisan.name, 'Artisan Fixeo'),
        category: categoryLabel(artisan.category),
        city: pickValue(artisan.city, 'Ville non précisée'),
        avatar: artisan.avatar || '',
        availability: artisan.availability || '',
        trust_score: trustScore,
        trust_level: trustLevel,
        created_at: artisan.created_at || ''
      },
      missions: missions,
      stats: {
        total_missions: totalMissions,
        missions_validées: missionsValidated,
        missions_confirmées: missionsConfirmed,
        commissions_payées: commissionsPaid,
        missions_terminées: missionsCompleted,
        average_rating: averageRating,
        total_reviews: totalReviews,
        trust_score: trustScore,
        trust_level: trustLevel,
        confirmation_rate: missionsCompleted > 0 ? missionsConfirmed / missionsCompleted : 0,
        payment_rate: missionsValidated > 0 ? commissionsPaid / missionsValidated : 0,
        seniority: computeSeniority(missions, artisan)
      },
      reviews: reviewedMissions
    };
  }

  function computeProfileData(artisanId, requests) {
    var matchingRaw = (Array.isArray(requests) ? requests : []).filter(function (raw) {
      return matchesArtisan(raw, artisanId);
    });

    if (!matchingRaw.length) return null;
    return buildProfileDataFromMatches(matchingRaw, {}, artisanId);
  }

  function computeProfileDataFromArtisanLike(artisanLike, requests, requestedId) {
    if (!artisanLike || typeof artisanLike !== 'object') return null;
    var matchingRaw = (Array.isArray(requests) ? requests : []).filter(function (raw) {
      return matchesArtisanSnapshot(raw, artisanLike);
    });
    return buildProfileDataFromMatches(matchingRaw, artisanLike, requestedId);
  }

  function buildReviewCard(review) {
    return '' +
      '<article class="public-review-card">' +
        '<div class="public-review-head">' +
          '<strong>' + escapeHtml(formatStars(review.review_rating) + ' ' + formatRating(review.review_rating) + ' / 5') + '</strong>' +
          '<span>' + escapeHtml(formatDate(getRequestDate(review))) + '</span>' +
        '</div>' +
        '<p>' + escapeHtml(review.review_comment || 'Avis client laissé sans commentaire.') + '</p>' +
      '</article>';
  }

  function buildStatCard(label, value, hint) {
    return '' +
      '<article class="public-stat-card">' +
        '<span class="public-stat-label">' + escapeHtml(label) + '</span>' +
        '<strong class="public-stat-value">' + escapeHtml(value) + '</strong>' +
        '<small class="public-stat-hint">' + escapeHtml(hint) + '</small>' +
      '</article>';
  }

  function bindActionButton() {
    var actionButton = document.getElementById('public-artisan-action');
    if (!actionButton) return;

    actionButton.addEventListener('click', function () {
      var target = document.querySelector('#intervention-form, form[data-intervention-form], .intervention-form');
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function bindReviewsToggle(reviews) {
    var button = document.getElementById('public-reviews-more');
    var list = document.getElementById('public-reviews-list');
    if (!button || !list) return;

    var visibleCount = REVIEWS_BATCH;

    function renderBatch() {
      list.innerHTML = reviews.slice(0, visibleCount).map(buildReviewCard).join('');
      button.hidden = visibleCount >= reviews.length;
    }

    button.addEventListener('click', function () {
      visibleCount += REVIEWS_BATCH;
      renderBatch();
    });

    renderBatch();
  }

  function renderNotFound(root) {
    updateSeoMeta({
      title: 'Profil indisponible | Fixeo',
      description: DEFAULT_PROFILE_DESCRIPTION,
      canonicalHref: MARKETPLACE_FALLBACK_URL
    });
    root.innerHTML = '' +
      '<section class="public-profile-state">' +
        '<div class="public-state-icon">🔎</div>' +
        '<h1>Profil indisponible</h1>' +
        '<p>Le profil artisan demandé est indisponible pour le moment.</p>' +
        '<a class="btn btn-secondary public-more-btn" href="' + escapeHtml(MARKETPLACE_FALLBACK_URL) + '">Retour aux artisans</a>' +
      '</section>';
  }

  function renderProfile(root, data) {
    var artisan = data.artisan;
    var stats = data.stats;
    var availability = availabilityMeta(artisan.availability);
    var trustTheme = getTrustTheme(stats.trust_level);
    var reviewsHtml = data.reviews.length
      ? '<div id="public-reviews-list"></div><button class="btn btn-secondary public-more-btn" id="public-reviews-more">Voir plus</button>'
      : '<p class="public-empty-copy">Aucun avis pour le moment</p>';

    updateSeoMeta({
      title: artisan.name + ' - ' + categoryLabel(artisan.category) + ' - ' + artisan.city + ' | Fixeo',
      description: DEFAULT_PROFILE_DESCRIPTION,
      canonicalHref: buildCanonicalProfileHref(artisan)
    });

    root.innerHTML = '' +
      '<section class="public-profile-hero">' +
        '<div class="public-avatar-wrap">' +
          (artisan.avatar
            ? '<img class="public-avatar" src="' + escapeHtml(artisan.avatar) + '" alt="' + escapeHtml(artisan.name) + '">'
            : '<div class="public-avatar public-avatar-fallback" aria-hidden="true">' + escapeHtml(getInitials(artisan.name)) + '</div>') +
        '</div>' +
        '<div class="public-hero-main">' +
          '<span class="public-availability ' + escapeHtml(availability.className) + '">' + escapeHtml(availability.label) + '</span>' +
          '<h1>' + escapeHtml(artisan.name) + '</h1>' +
          '<p class="public-hero-meta">' + escapeHtml(artisan.category + ' • ' + artisan.city) + '</p>' +
          '<div class="public-trust-card">' +
            '<div class="public-trust-top">' +
              '<div>' +
                '<div class="public-trust-rating">' + (stats.average_rating != null ? '⭐ ' + escapeHtml(formatRating(stats.average_rating)) + ' / 5' : '⭐ Aucun avis pour le moment') + '</div>' +
                '<div class="public-trust-sub">' + escapeHtml((stats.total_reviews || 0) + ' avis • ' + (stats.missions_validées || 0) + ' missions validées') + '</div>' +
              '</div>' +
              '<span class="public-trust-badge" style="color:' + trustTheme.color + ';background:' + trustTheme.bg + ';border-color:' + trustTheme.border + '">' + escapeHtml(stats.trust_level) + '</span>' +
            '</div>' +
            '<div class="public-trust-score">Trust Score : ' + escapeHtml(String(stats.trust_score || 0)) + ' / 100</div>' +
          '</div>' +
          '<button class="btn btn-primary public-action-btn" type="button" id="public-artisan-action">Demander intervention</button>' +
        '</div>' +
      '</section>' +

      '<section class="public-section-grid">' +
        '<article class="public-panel">' +
          '<div class="public-section-heading">Avis clients</div>' +
          '<h2>Les derniers avis</h2>' +
          reviewsHtml +
        '</article>' +
        '<article class="public-panel">' +
          '<div class="public-section-heading">Statistiques</div>' +
          '<h2>Indicateurs de confiance</h2>' +
          '<div class="public-stats-grid">' +
            buildStatCard('Missions terminées', String(stats.missions_terminées || 0), 'Interventions finalisées') +
            buildStatCard('Taux de confirmation', formatPercent(stats.confirmation_rate), 'Clients ayant confirmé') +
            buildStatCard('Taux de paiement', formatPercent(stats.payment_rate), 'Commissions réglées') +
            buildStatCard('Ancienneté', stats.seniority || 'Nouveau artisan', 'Présence estimée sur Fixeo') +
          '</div>' +
        '</article>' +
      '</section>';

    bindActionButton();
    bindReviewsToggle(data.reviews);
  }

  function init() {
    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    try {
      var locationContext = resolveArtisanIdFromLocation();
      var artisanId = String(locationContext.artisanId || '').trim();
      if (!artisanId) {
        renderNotFound(root);
        return;
      }

      var requests = loadRequests();
      var profileData = computeProfileData(artisanId, requests);

      if (!profileData) {
        var registryEntry = loadRegistry().map(normalizeRegistryEntry).find(function (entry) {
          return entry.public_id === artisanId || entry.source_ids.indexOf(artisanId) !== -1;
        });
        if (registryEntry) {
          profileData = computeProfileDataFromArtisanLike(registryEntry, requests, artisanId);
        }
      }

      if (!profileData) {
        renderNotFound(root);
        return;
      }

      renderProfile(root, profileData);
    } catch (error) {
      console.warn('[FixeoPublicArtisanProfile] render fallback after error:', error && error.message ? error.message : error);
      renderNotFound(root);
    }
  }

  window.FixeoPublicArtisanProfile = {
    init: init,
    computeProfileData: computeProfileData,
    computeProfileDataFromArtisanLike: computeProfileDataFromArtisanLike,
    resolveArtisanIdFromLocation: resolveArtisanIdFromLocation
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.setTimeout(function () {
    var root = document.getElementById('public-artisan-root');
    if (!root) return;
    var loadingTitle = root.querySelector('.public-profile-state h1');
    if (!loadingTitle) return;
    if (normalizeText(loadingTitle.textContent || '') !== normalizeText('Chargement du profil artisan')) return;
    renderNotFound(root);
  }, 2200);
})(window, document);
