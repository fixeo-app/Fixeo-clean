(function (window, document) {
  'use strict';

  var REQUESTS_KEY = 'fixeo_client_requests';
  var REGISTRY_KEY = 'fixeo_public_artisans_registry';
  var SLUG_MAP_KEY = 'fixeo_artisan_slug_map';
  var REVIEWS_BATCH = 5;
  var DEFAULT_PROFILE_DESCRIPTION = 'Artisan Fixeo. Voir interventions, disponibilit\u00e9 et r\u00e9server une intervention en ligne.';
  var MARKETPLACE_FALLBACK_URL = '/index.html#artisans-section';
  var MARKETPLACE_LOCAL_STORAGE_KEY = 'fixeo_admin_artisans_v21';

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

  function isDemoIdentifier(value) {
    var normalized = String(value || '').trim().toLowerCase();
    return /^art_demo_/i.test(normalized) || /^(?:[1-9]|1[0-2])$/.test(normalized);
  }

  function loadSlugMap() {
    var parsed = safeJSONParse(localStorage.getItem(SLUG_MAP_KEY) || '{}', {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    var normalized = {};
    Object.keys(parsed).forEach(function (key) {
      var slug = slugify(key);
      var publicId = String(parsed[key] || '').trim();
      if (slug && publicId && !isDemoIdentifier(publicId)) normalized[slug] = publicId;
    });
    return normalized;
  }

  function persistSlugMap(slugMap) {
    localStorage.setItem(SLUG_MAP_KEY, JSON.stringify(slugMap && typeof slugMap === 'object' ? slugMap : {}));
  }

  function extractSlugFromPathname(pathname) {
    var match = String(pathname || '').match(/^\/artisan\/([^/?#]+)/i);
    if (!match) return '';
    try {
      return slugify(decodeURIComponent(match[1] || ''));
    } catch (error) {
      return slugify(match[1] || '');
    }
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
    parsed = Array.isArray(parsed) ? parsed : [];
    return parsed.filter(function (entry) {
      var publicId = pickValue(entry && entry.public_id, entry && entry.id);
      return !isDemoIdentifier(publicId);
    });
  }

  function normalizeRegistryEntry(entry) {
    return {
      public_id: pickValue(entry && entry.public_id, entry && entry.id),
      slug: pickValue(entry && entry.slug),
      source_ids: Array.isArray(entry && entry.source_ids) ? entry.source_ids.map(function (value) { return String(value || '').trim(); }).filter(Boolean) : [],
      name: pickValue(entry && entry.name),
      category: pickValue(entry && entry.category),
      city: pickValue(entry && entry.city),
      phone: pickValue(entry && entry.phone),
      email: pickValue(entry && entry.email),
      avatar: pickValue(entry && entry.avatar),
      availability: pickValue(entry && entry.availability),
      trust_score: pickNumber(entry && entry.trust_score),
      trust_level: pickValue(entry && entry.trust_level, entry && entry.trustLevel),
      created_at: pickValue(entry && entry.created_at)
    };
  }


  function loadMarketplaceArtisans() {
    var parsed = safeJSONParse(localStorage.getItem(MARKETPLACE_LOCAL_STORAGE_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function normalizeArtisanSeed(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var publicId = pickValue(raw.public_id, raw.assigned_artisan_id, raw.id, raw.artisan_id, raw.profileId, raw.userId);
    var internalId = pickValue(raw.id, raw.artisan_id, raw.profileId, raw.userId, publicId);
    if (!publicId && !internalId) return null;
    if (isDemoIdentifier(publicId || internalId)) return null;

    return {
      id: internalId,
      public_id: publicId || internalId,
      assigned_artisan_id: pickValue(raw.assigned_artisan_id, raw.public_id),
      source_ids: Array.isArray(raw.source_ids) ? raw.source_ids.map(function (value) { return String(value || '').trim(); }).filter(Boolean) : [],
      name: pickValue(raw.name, raw.assigned_artisan, raw.artisanName, raw.artisan),
      category: pickValue(raw.category, raw.specialty, raw.job, raw.service),
      city: pickValue(raw.city, raw.ville),
      phone: pickValue(raw.phone, raw.telephone),
      email: pickValue(raw.email),
      avatar: pickValue(raw.avatar, raw.photo, raw.image, raw.picture),
      availability: pickValue(raw.availability, raw.status),
      trust_score: pickNumber(raw.trust_score, raw.trustScore),
      trust_level: pickValue(raw.trust_level, raw.trustLevel),
      created_at: pickValue(raw.created_at, raw.createdAt, raw.joined_at, raw.registered_at)
    };
  }

  function collectArtisanSeeds() {
    var pool = [];
    /* ── Fix A: sessionStorage prefetch — check before expensive localStorage parse ── */
    try {
      var _prefetchId = (function () {
        var params = new URLSearchParams(window.location.search || '');
        return String(params.get('id') || params.get('artisan') || '').trim();
      })();
      if (_prefetchId && typeof sessionStorage !== 'undefined') {
        var _raw = sessionStorage.getItem('fixeo_profile_prefetch_' + _prefetchId);
        if (_raw) {
          var _prefetchedArtisan = JSON.parse(_raw);
          if (_prefetchedArtisan) pool.unshift(_prefetchedArtisan);
        }
      }
    } catch (e) {}
    // Primary: FixeoDB (which is synced from Supabase via fixeo-supabase-loader.js)
    if (window.FixeoDB) {
      pool = pool.concat(window.FixeoDB.getAllArtisans());
    } else if (Array.isArray(window.ARTISANS)) {
      pool = pool.concat(window.ARTISANS);
    }
    pool = pool.concat(loadMarketplaceArtisans());

    var onboardingEntries = window.FixeoArtisanOnboardingStore && typeof window.FixeoArtisanOnboardingStore.getEntries === 'function'
      ? window.FixeoArtisanOnboardingStore.getEntries()
      : [];
    if (Array.isArray(onboardingEntries)) pool = pool.concat(onboardingEntries);

    pool = pool.concat(loadRegistry());

    var seen = {};
    return pool.map(normalizeArtisanSeed).filter(function (artisan) {
      if (!artisan) return false;
      var canonicalId = pickValue(artisan.public_id, artisan.assigned_artisan_id, artisan.id);
      if (!canonicalId || seen[canonicalId]) return false;
      seen[canonicalId] = true;
      return true;
    });
  }

  function artisanMatchesSeedId(artisanLike, artisanId) {
    if (!artisanLike || typeof artisanLike !== 'object') return false;
    var normalizedId = String(artisanId || '').trim();
    if (!normalizedId) return false;

    var candidateIds = [
      pickValue(artisanLike.public_id),
      pickValue(artisanLike.assigned_artisan_id),
      pickValue(artisanLike.id)
    ].filter(Boolean);

    if (Array.isArray(artisanLike.source_ids)) {
      artisanLike.source_ids.forEach(function (value) {
        var nextValue = String(value || '').trim();
        if (nextValue) candidateIds.push(nextValue);
      });
    }

    return candidateIds.indexOf(normalizedId) !== -1;
  }

  function findArtisanSeedById(artisanId) {
    var normalizedId = String(artisanId || '').trim();
    if (!normalizedId || isDemoIdentifier(normalizedId)) return null;

    var seeds = collectArtisanSeeds();
    for (var i = 0; i < seeds.length; i += 1) {
      if (artisanMatchesSeedId(seeds[i], normalizedId)) return seeds[i];
    }
    return null;
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
    if (artisanId && !isDemoIdentifier(artisanId)) return { artisanId: artisanId, slug: '', source: 'id' };

    var slug = extractSlugFromPathname(window.location.pathname || '');
    if (!slug) return { artisanId: '', slug: '', source: 'none' };

    artisanId = String(findPublicIdBySlug(slug) || '').trim();
    return { artisanId: isDemoIdentifier(artisanId) ? '' : artisanId, slug: slug, source: 'slug' };
  }

  function matchesArtisan(raw, artisanId) {
    if (!raw || typeof raw !== 'object') return false;
    var normalizedId = String(artisanId || '').trim();
    if (!normalizedId) return false;

    /* V2-B2A Patch 9: Use V2-A3 alias-based matching when FixeoArtisanIdentity is loaded.
     * Builds artisan reference with all known aliases (URL id + Supabase data).
     * Falls back to exact ID match for backward compat when module not loaded.
     */
    if (window.FixeoArtisanIdentity
        && typeof window.FixeoArtisanIdentity.requestMatchesArtisan === 'function') {
      var _artRef = { id: normalizedId };
      var _sbArt  = window._fixeoCurrentArtisan;
      if (_sbArt && typeof _sbArt === 'object') {
        _artRef = Object.assign({}, _sbArt, { id: normalizedId });
      }
      return window.FixeoArtisanIdentity.requestMatchesArtisan(raw, _artRef);
    }

    /* Legacy exact-match fallback (V2-A3 not loaded) */
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
function injectFloatingReserveButton() {
  if (document.getElementById('fixeo-floating-reserve')) return;

  var btn = document.createElement('button');
  btn.id = 'fixeo-floating-reserve';
  btn.className = 'fixeo-floating-reserve';
  btn.type = 'button';
  btn.textContent = '⚡ Demander une intervention';
  btn.setAttribute('aria-label', 'Demander une intervention');

  btn.addEventListener('click', function () {
    var mainBtn = document.getElementById('public-artisan-action');
    if (mainBtn) {
 btn.classList.remove('is-visible');
btn.style.display = 'none';
btn.setAttribute('aria-hidden', 'true');
mainBtn.click();

setTimeout(function () {
  btn.style.display = 'none';
  btn.classList.remove('is-visible');
}, 500);

  setTimeout(function () {
    var modal =
      document.querySelector('.fixeo-reservation-modal') ||
      document.querySelector('.reservation-modal') ||
      document.querySelector('.fx-reservation-modal');

    if (!modal) {
      btn.style.display = '';
    }
  }, 300);
}
  });

  document.body.appendChild(btn);
    btn.remove();
    document.body.appendChild(btn);
  
  var mainBtn = document.getElementById('public-artisan-action');
  if (!mainBtn || !('IntersectionObserver' in window)) {
    btn.classList.add('is-visible');
    return;
  }

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        btn.classList.remove('is-visible');
      } else {
        btn.classList.add('is-visible');
      }
    });
  }, {
    threshold: 0.1
  });

  observer.observe(mainBtn);
}

  function hideHeroActionButton() {
  var btn = document.getElementById('public-artisan-action');
  if (!btn) return;
  btn.style.display = 'none';
  btn.setAttribute('aria-hidden', 'true');
  btn.setAttribute('tabindex', '-1');
}
  
  function restoreFloatingReserveButton() {
  var btn = document.getElementById('fixeo-floating-reserve');
  if (!btn) return;

  var modal =
    document.querySelector('.fixeo-reservation-modal') ||
    document.querySelector('.reservation-modal') ||
    document.querySelector('.fx-reservation-modal');

  if (!modal) {
    btn.removeAttribute('aria-hidden');
    btn.style.display = '';
    btn.classList.add('is-visible');
  }
}
  function watchReservationModalClose() {
  if (window.__fixeoFloatingReserveWatcher) return;
  window.__fixeoFloatingReserveWatcher = true;

  var observer = new MutationObserver(function () {
    var modal =
      document.querySelector('.fixeo-reservation-modal') ||
      document.querySelector('.reservation-modal') ||
      document.querySelector('.fx-reservation-modal');

    if (!modal) {
      restoreFloatingReserveButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
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
   function renderHeroAvatar(artisan) {
  var name = artisan && artisan.name ? artisan.name : 'Artisan Fixeo';
  var category = String((artisan && artisan.category) || '').toLowerCase();

  var photo =
    artisan.photo_url ||
    artisan.avatar ||
    artisan.photo ||
    artisan.image ||
    '';

  var fallbackEmoji = '👷';

  if (category.includes('plomb')) fallbackEmoji = '👨‍🔧';
  else if (category.includes('élect') || category.includes('elect')) fallbackEmoji = '⚡';
  else if (category.includes('serr')) fallbackEmoji = '🔑';
  else if (category.includes('peint')) fallbackEmoji = '🎨';
  else if (category.includes('clim')) fallbackEmoji = '❄️';
  else if (category.includes('nettoy')) fallbackEmoji = '🧹';
  else if (category.includes('jardin')) fallbackEmoji = '🌿';
  else if (category.includes('menuis')) fallbackEmoji = '🪚';

  if (photo) {
    return '' +
      '<div class="fx-hero-avatar-card has-photo">' +
        '<img class="fx-hero-avatar-img" src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '">' +
        '<span class="fx-hero-avatar-check">✓</span>' +
      '</div>';
  }

  return '' +
    '<div class="fx-hero-avatar-card is-fixeo-hero">' +
      '<div class="fx-hero-avatar-emoji">' + fallbackEmoji + '</div>' +
      '<span class="fx-hero-avatar-check">✓</span>' +
      '<div class="fx-hero-avatar-label">FIXEO Hero</div>' +
    '</div>';
}
  function renderProfile(root, data) {
    /* rf4: mark sentinel so cold-visit index fetch .then() never overwrites a full render */
    try { window.__fxHeroRendered = window.__fxHeroRendered || (data && data.artisan && data.artisan.id) || '__rendered__'; } catch(e) {}
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

    /* rf5: hydrate-not-replace — if fxfp fast-path already rendered a hero,
       update it in-place rather than wiping root.innerHTML.
       This eliminates the "flash" between fast-path hero and full render.
       The fxfp-hero has the correct outer structure (.public-profile-hero,
       .public-hero-main, .public-availability, h1, .public-hero-meta, CTA)
       but is missing: .public-trust-card and .public-section-grid.
       We add them surgically. V2 enhance() finds them as expected. */
    var _fxfpHero = root.querySelector('.fxfp-hero');
    if (_fxfpHero) {
      try {
        var _hMain = _fxfpHero.querySelector('.public-hero-main');
        if (_hMain && !_fxfpHero.querySelector('.fx-hero-avatar-wrap')) {
  var _avatarWrap = document.createElement('div');
  _avatarWrap.className = 'fx-hero-avatar-wrap';
  _avatarWrap.innerHTML = renderHeroAvatar(artisan);
  _hMain.parentNode.insertBefore(_avatarWrap, _hMain);
}
        /* 1 — update availability, name, meta in place */
        var _aEl = _hMain && _hMain.querySelector('.public-availability');
        if (_aEl) { _aEl.textContent = availability.label; _aEl.className = 'public-availability ' + availability.className; }
        var _h1 = _hMain && _hMain.querySelector('h1');
        if (_h1) _h1.textContent = artisan.name;
        var _meta = _hMain && _hMain.querySelector('.public-hero-meta');
        if (_meta) _meta.textContent = artisan.category + ' \u2022 ' + artisan.city;
        /* 2 — inject trust-card before the CTA (it doesn't exist in fxfp-hero) */
        if (_hMain && !_hMain.querySelector('.public-trust-card')) {
          var _tc = document.createElement('div');
          _tc.className = 'public-trust-card';
          /* hts-1: Honest trust signals — no seeded rating/review_count display */
          _tc.innerHTML =
            '<div class="public-trust-top">' +
              '<div>' +
                '<div class="public-trust-rating">Profil enregistr\u00e9 sur Fixeo</div>' +
                '<div class="public-trust-sub">Donn\u00e9es en cours de v\u00e9rification</div>' +
              '</div>' +
              '<span class="public-trust-badge" style="color:' + trustTheme.color + ';background:' + trustTheme.bg + ';border-color:' + trustTheme.border + '">' + escapeHtml(stats.trust_level) + '</span>' +
            '</div>' +
            '<div class="public-trust-score">Paiement apr\u00e8s satisfaction</div>';
          var _cta = _hMain.querySelector('#public-artisan-action, .public-action-btn');
          if (_cta) _hMain.insertBefore(_tc, _cta);
          else _hMain.appendChild(_tc);
        }
        /* 3 — update CTA text to match full render */
        var _ctaEl = _fxfpHero.querySelector('#public-artisan-action');
        if (_ctaEl) _ctaEl.textContent = 'Demander intervention';
        /* 4 — append section-grid (reviews + stats) after hero */
        if (!root.querySelector('.public-section-grid')) {
          var _sg = document.createElement('section');
          _sg.className = 'public-section-grid';
          _sg.innerHTML =
            '<article class="public-panel">' +
              '<div class="public-section-heading">Avis clients</div>' +
              '<h2>Les derniers avis</h2>' +
              reviewsHtml +
            '</article>' +
            '<article class="public-panel">' +
              '<div class="public-section-heading">Statistiques</div>' +
              '<h2>TEST FIXEO 2026</h2>' +
              '<div class="public-stats-grid">' +
                buildStatCard('Missions terminées', String(stats.missions_terminées || 0), 'Interventions finalisées') +
                buildStatCard('Taux de confirmation', formatPercent(stats.confirmation_rate), 'Clients ayant confirmé') +
                buildStatCard('Taux de paiement', formatPercent(stats.payment_rate), 'Commissions réglées') +
                buildStatCard('Ancienneté', stats.seniority || 'Nouveau artisan', 'Présence estimée sur Fixeo') +
              '</div>' +
            '</article>';
          root.appendChild(_sg);
        }
        bindActionButton();
        injectFloatingReserveButton();
        hideHeroActionButton();
        watchReservationModalClose();
        bindReviewsToggle(data.reviews);
        return; /* hydration complete — skip full root.innerHTML write below */
      } catch(_e) {
        /* If hydration fails for any reason, fall through to full render */
      }
    }

    root.innerHTML = '' +
      '<section class="public-profile-hero fx-hero-premium">' +
'<div class="fx-profile-breadcrumb">Fixeo › ' + escapeHtml(categoryLabel(artisan.category)) + ' › ' + escapeHtml(artisan.city) + ' › ' + escapeHtml(artisan.name) + '</div>' +
       '<div class="fx-hero-avatar-wrap">' + renderHeroAvatar(artisan) + '</div>' +
        '<div class="public-hero-main">' +
          '<span class="public-availability ' + escapeHtml(availability.className) + '">' + escapeHtml(availability.label) + '</span>' +
          '<h1>' + escapeHtml(artisan.name) + '</h1>' +
          '<p class="public-hero-meta">' + escapeHtml(artisan.category + ' \u2022 ' + artisan.city) + '</p>' +
          /* hts-1: Honest trust signals — no seeded rating/review_count display */
          '<div class="public-trust-card">' +
            '<div class="public-trust-top">' +
              '<div>' +
                '<div class="public-trust-rating">Profil enregistr\u00e9 sur Fixeo</div>' +
                '<div class="public-trust-sub">Donn\u00e9es en cours de v\u00e9rification</div>' +
              '</div>' +
              '<span class="public-trust-badge" style="color:' + trustTheme.color + ';background:' + trustTheme.bg + ';border-color:' + trustTheme.border + '">' + escapeHtml(stats.trust_level) + '</span>' +
            '</div>' +
            '<div class="public-trust-score">Paiement apr\u00e8s satisfaction</div>' +
          '</div>' +
          '<button class="btn btn-primary public-action-btn public-action-hidden" type="button" id="public-artisan-action" aria-hidden="true" tabindex="-1">Demander intervention</button>' +
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
            buildStatCard('Disponibilité', availability.label, 'Statut actuel') +
            buildStatCard('Temps de réponse', 'En apprentissage', 'Mesuré avec les prochaines demandes') +
            buildStatCard('Confiance FIXEO', stats.trust_level || 'Vérification en cours', 'Contrôle qualité') +
            buildStatCard('Zone', artisan.city + ' et alentours', 'Zone d’intervention')
          '</div>' +
        '</article>' +
      '</section>';

    bindActionButton();
    bindReviewsToggle(data.reviews);
  }

  function init() {
    /* ── Step B: early prefetch render ─────────────────────────────────────────
       If sessionStorage has a prefetch written by the homepage card click,
       render immediately before the full data-resolution chain runs.
       The normal init() flow continues after this block — Supabase async,
       collectArtisanSeeds, fallback chain — all unchanged.
    ─────────────────────────────────────────────────────────────────────────── */
    try {
      var _earlyRoot = document.getElementById('public-artisan-root');
      var _earlyParams = new URLSearchParams(window.location.search || '');
      var _earlyId = String(_earlyParams.get('id') || _earlyParams.get('artisan') || '').trim();
      /* perf3: skip DCL early-render if inline fast-path already rendered the hero.
         window.__fxHeroRendered is set by the inline fxfp script at body-parse time.
         We still run the full Supabase resolution chain below — this only skips
         the redundant DOM write at DCL that would cause a flash. */
      if (_earlyRoot && _earlyId && window.__fxHeroRendered !== _earlyId
          && typeof sessionStorage !== 'undefined') {
        var _earlyRaw = sessionStorage.getItem('fixeo_profile_prefetch_' + _earlyId);
        if (_earlyRaw) {
          var _earlyArtisan = JSON.parse(_earlyRaw);
          if (_earlyArtisan && typeof _earlyArtisan === 'object') {
            var _earlyRequests = (function () {
              try { return JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]') || []; } catch (e) { return []; }
            })();
            var _earlyData = computeProfileDataFromArtisanLike(_earlyArtisan, _earlyRequests, _earlyId);
            if (_earlyData) {
              renderProfile(_earlyRoot, _earlyData);
              /* Task 3 — mark body so CSS can apply optional fade-in */
              document.body.classList.add('prefetch-render');
            }
          }
        }
      }
    } catch (e) {}

    // If FixeoSupabaseLoader available, try async lookup first (Supabase → FixeoDB fallback)
    var urlId = (new URLSearchParams(window.location.search)).get('id') ||
                (new URLSearchParams(window.location.search)).get('artisan');
    if (urlId && window.FixeoSupabaseLoader) {
      window.FixeoSupabaseLoader.getArtisanForProfile(urlId).then(function(a) {
        if (a) {
          // Inject into FixeoDB so the sync pool finds it
          if (window.FixeoDB && !window.FixeoDB.getArtisanById(a.id)) {
            window.FixeoDB.createArtisan(a);
          }
          // Re-trigger the profile render with fresh data
          if (typeof renderArtisanProfile === 'function') renderArtisanProfile(a);
          else if (typeof displayArtisan === 'function') displayArtisan(a);
        }
      }).catch(function(){});
    }

    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    try {
      var locationContext = resolveArtisanIdFromLocation();
      var requestedId = String(locationContext.artisanId || '').trim();
      if (!requestedId) {
        renderNotFound(root);
        return;
      }

      var registryEntries = loadRegistry().map(normalizeRegistryEntry);
      var registryEntry = registryEntries.find(function (entry) {
        return entry.public_id === requestedId || entry.source_ids.indexOf(requestedId) !== -1;
      }) || null;
      var artisanSeed = findArtisanSeedById(requestedId);
      var canonicalArtisanId = pickValue(
        registryEntry && registryEntry.public_id,
        artisanSeed && artisanSeed.public_id,
        artisanSeed && artisanSeed.assigned_artisan_id,
        requestedId
      );

      var requests = loadRequests();
      var profileData = computeProfileData(canonicalArtisanId, requests);

      if (!profileData && registryEntry) {
        profileData = computeProfileDataFromArtisanLike(registryEntry, requests, canonicalArtisanId);
      }

      if (!profileData && artisanSeed) {
        profileData = computeProfileDataFromArtisanLike(artisanSeed, requests, canonicalArtisanId);
      }

      if (!profileData && registryEntry && artisanSeed) {
        profileData = computeProfileDataFromArtisanLike(Object.assign({}, artisanSeed, registryEntry), requests, canonicalArtisanId);
      }

      if (!profileData) {
        /* rf5: If fast-path (fxfp) or index-fetch already rendered a hero for this artisan,
           DON'T wipe it with renderNotFound(). The FixeoSupabaseLoader async call above
           (getArtisanForProfile) is already in flight and will call renderArtisanProfile(a)
           when it resolves — PATH A will write the full profile correctly.
           Only show renderNotFound if no fast-path ran (true cold + no index either). */
        var _hasHeroSentinel = (typeof window.__fxHeroRendered === 'string' && window.__fxHeroRendered === requestedId);
        var _hasFxfpHero = !!root.querySelector('.fxfp-hero, .public-profile-hero');
        if (_hasHeroSentinel || _hasFxfpHero) {
          /* Hero already visible — defer to Supabase async path; do nothing here */
          return;
        }
        renderNotFound(root);
        return;
      }

      renderProfile(root, profileData);
    } catch (error) {
      console.warn('[FixeoPublicArtisanProfile] render fallback after error:', error && error.message ? error.message : error);
      /* rf5: Don't wipe a fast-path hero on non-fatal errors. Supabase async will recover. */
      if (!root.querySelector('.fxfp-hero, .public-profile-hero')) {
        renderNotFound(root);
      }
    }
  }

  /* V2-B2C P0: renderArtisanProfile — safe server-data hook (no DOM wipe after V2 ran).
   *
   * V2-B2A introduced a critical regression: this function called renderProfile(root, data)
   * unconditionally. renderProfile() does root.innerHTML = '...' — destroying every
   * V2-A/B injection (bio, zone strip, trust grid, badge, activity, portfolio, etc.)
   * because getArtisanForProfile() resolves at T+~900ms, well after enhance() rAF at T+~100ms.
   *
   * V2-B2C fix — two execution paths:
   *
   * PATH A (V2 NOT yet run): hero does not have data-v2a-done stamp AND body does not have
   *   fpv2b-loaded AND root does not have fpv2-sections-ready.
   *   → Safe to call renderProfile(root, data): V2 will run on top of the refreshed base.
   *   → Also updates SEO meta.
   *
   * PATH B (V2 already ran): hero has data-v2a-done, OR body has fpv2b-loaded, OR root has
   *   fpv2-sections-ready.
   *   → DO NOT call renderProfile(). DO NOT touch root.innerHTML.
   *   → Surgical field updates only:
   *       h1 — name
   *       .public-hero-meta — category + city
   *       .public-availability — label + className
   *       .public-avatar / .public-avatar-fallback — initials or src if available
   *   → These are the only fields that could differ from the localStorage-pool render
   *     and are safe to update in-place (text nodes and class attributes, not layout).
   *   → No V2-injected DOM is touched.
   *   → SEO meta still updated (no DOM).
   *
   * Idempotency: _serverRenderDoneId dedup prevents double-call for same artisan.
   * Guard: artisan.id required; root required; profile page only (root id check).
   * Does NOT touch booking/lifecycle/reservation paths.
   */
  var _serverRenderDoneId = '';
  window.renderArtisanProfile = function(artisan) {
    if (!artisan || typeof artisan !== 'object') return;
    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    var artisanId = String(artisan.id || artisan.legacy_id || '').trim();
    if (!artisanId) return;
    if (_serverRenderDoneId === artisanId) return;
    _serverRenderDoneId = artisanId;

    try {
      /* Detect whether V2 injections have already run on this page load.
       *
       * Three hard signals — all set inside enhance() rAF callback, never before:
       *   data-v2a-done  : stamped on hero by waitForHero() immediately before rAF
       *   fpv2b-loaded   : added to body at end of rAF (CSS gate for V1 hide rules)
       *   fpv2-sections-ready : added to root at end of rAF (CSS opacity trigger)
       *
       * Sentinel signal — __fixeoV2EnhanceStarted:
       *   Set at IIFE parse time (V2-C5D) AND at top of enhance() (V2-C5C).
       *   Means "enhance() module has loaded and started". NOT "rAF completed".
       *   V2-C6A FIX: sentinel only counts toward v2Done when a hero element
       *   is already in the DOM. If renderNotFound() was called (no hero —
       *   public-profile-state shown instead), sentinel MUST NOT block PATH A,
       *   because PATH A is the only way to recover the page with server data
       *   and give enhance() a hero to work with.
       *   When hero IS present + sentinel=true: V2 is in progress → PATH B safe.
       *   When hero IS absent + sentinel=true: V2 is waiting → PATH A required. */
      var hero     = root.querySelector('.public-profile-hero');
      var v2Done   = !!(
        (hero && hero.getAttribute('data-v2a-done')) ||
        document.body.classList.contains('fpv2b-loaded') ||
        root.classList.contains('fpv2-sections-ready') ||
        (window.__fixeoV2EnhanceStarted && !!hero)  /* V2-C6A: sentinel only if hero present */
      );

      if (v2Done) {
        /* ── PATH B: Surgical field updates only — preserve all V2 DOM ── */
        /*
         * V2 injections are in the tree. We must NOT call renderProfile().
         * Update only the 4 base-render fields that may differ from the
         * localStorage-pool version the user is currently viewing.
         * All selectors target the base hero structure written by renderProfile()
         * at T+0ms; they are guaranteed to exist when V2 has run (V2 needs them).
         */
        var avail = availabilityMeta(artisan.availability || 'available');

        /* Name */
        var h1 = hero && hero.querySelector('.public-hero-main h1');
        if (h1 && artisan.name) h1.textContent = artisan.name;

        /* Category + city meta */
        var metaEl = hero && hero.querySelector('.public-hero-meta');
        if (metaEl && artisan.category && artisan.city) {
          metaEl.textContent = artisan.category + ' \u2022 ' + artisan.city;
        }

        /* Availability badge */
        var availEl = hero && hero.querySelector('.public-availability');
        if (availEl) {
          availEl.textContent  = avail.label;
          availEl.className    = 'public-availability ' + avail.className;
        }

        /* Avatar: upgrade initials to real src if photo_url available;
         * only when V2 hasn't already replaced it (data-v2a-done means
         * upgradeProfileAvatar() may have run — don't fight it) */
        if (!hero.getAttribute('data-v2a-done')) {
          var avatarImg = hero && hero.querySelector('.public-avatar-img');
          var avatarFb  = hero && hero.querySelector('.public-avatar-fallback');
          if (!avatarImg && avatarFb && artisan.photo_url) {
            var img = document.createElement('img');
            img.className = 'public-avatar public-avatar-img';
            img.alt       = escapeHtml(artisan.name || '');
            img.src       = artisan.photo_url;
            avatarFb.parentNode.replaceChild(img, avatarFb);
          }
        }

        /* SEO meta — no DOM impact */
        try {
          updateSeoMeta({
            title: (artisan.name || '') + ' - ' + categoryLabel(artisan.category || '') + ' - ' + (artisan.city || '') + ' | Fixeo',
            description: DEFAULT_PROFILE_DESCRIPTION,
            canonicalHref: buildCanonicalProfileHref(artisan)
          });
        } catch(e) {}

        /* rf5: If hero is an fxfp-hero (fast-path minimal render), it is missing
           .public-trust-card and .public-section-grid. Inject them now via
           renderProfile() hydration path so V2 enhance() finds the expected scaffolds.
           We pass a computed profileData built from server artisan data.
           renderProfile()'s hydration branch detects .fxfp-hero and adds missing pieces
           without touching name/meta already updated above. */
        if (hero && hero.classList.contains('fxfp-hero') && !root.querySelector('.public-section-grid')) {
          try {
            var _requests = loadRequests();
            var _pd = computeProfileDataFromArtisanLike(artisan, _requests, artisanId);
            if (_pd) renderProfile(root, _pd); /* hydration branch fires (fxfp-hero detected) */
          } catch(_e) {}
        }

      } else {
        /* ── PATH A: V2 not yet run — safe full re-render with server data ── */
        /*
         * The base hero is still the T+0ms localStorage-pool render.
         * renderProfile() replaces root.innerHTML with server-correct data
         * (name, city, availability, rating from Supabase).
         * V2-A enhance() will run on top of this refreshed hero shortly after.
         */
        var requests    = loadRequests();
        var profileData = computeProfileDataFromArtisanLike(artisan, requests, artisanId);
        if (!profileData) return;
        renderProfile(root, profileData);
      }

      /* Notify downstream (premium-ui trust grid, V2-A3 identity, etc.) */
      try {
        document.dispatchEvent(new CustomEvent('fixeo:public-profile:server-rendered', {
          bubbles: false,
          detail: { artisan: artisan }
        }));
      } catch(e) {}

    } catch(e) {
      console.warn('[FixeoPublicArtisanProfile] renderArtisanProfile error:', e && e.message);
    }
  };

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
