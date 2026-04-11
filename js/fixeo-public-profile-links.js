(function (window, document) {
  'use strict';

  var REQUESTS_KEY = 'fixeo_client_requests';
  var REGISTRY_KEY = 'fixeo_public_artisans_registry';
  var SLUG_MAP_KEY = 'fixeo_artisan_slug_map';
  var MARKETPLACE_LOCAL_STORAGE_KEY = 'fixeo_admin_artisans_v21';
  var LEGACY_PROFILE_BASE = 'artisan-profile.html?id=';
  var SEO_PROFILE_BASE = '/artisan/';

  function isLocalFileEnvironment() {
    return Boolean(window.location && String(window.location.protocol || '').toLowerCase() === 'file:');
  }

  function buildProfileHref(slug, publicId) {
    return LEGACY_PROFILE_BASE + encodeURIComponent(String(publicId || '').trim());
  }

  function safeJSONParse(value, fallback) {
    try {
      var parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
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

  function uniquePush(list, value) {
    var nextValue = String(value || '').trim();
    if (!nextValue) return list;
    if (list.indexOf(nextValue) === -1) list.push(nextValue);
    return list;
  }

  function normalizeArtisanLike(artisanLike) {
    var artisan = artisanLike && typeof artisanLike === 'object' ? artisanLike : { id: artisanLike };
    return {
      id: pickValue(artisan.id, artisan.artisan_id, artisan.userId, artisan.profileId),
      public_id: pickValue(artisan.public_id, artisan.assigned_artisan_id, artisan.id, artisan.artisan_id, artisan.userId, artisan.profileId),
      assigned_artisan_id: pickValue(artisan.assigned_artisan_id, artisan.public_id),
      name: pickValue(artisan.name, artisan.assigned_artisan, artisan.artisanName, artisan.artisan),
      category: pickValue(artisan.category, artisan.specialty, artisan.job, artisan.service),
      city: pickValue(artisan.city, artisan.ville),
      phone: pickValue(artisan.phone, artisan.telephone),
      email: pickValue(artisan.email),
      avatar: pickValue(artisan.avatar, artisan.photo, artisan.image, artisan.picture),
      availability: pickValue(artisan.availability, artisan.status),
      trust_score: pickValue(artisan.trust_score, artisan.trustScore),
      created_at: pickValue(artisan.created_at, artisan.createdAt, artisan.joined_at, artisan.registered_at)
    };
  }

  function buildFingerprint(artisan) {
    return [artisan.name, artisan.category, artisan.city, artisan.phone || artisan.email].map(slugify).filter(Boolean).join('|');
  }

  function buildStablePublicId(artisan) {
    var parts = [artisan.name, artisan.category, artisan.city, artisan.phone || artisan.email].map(slugify).filter(Boolean);
    return parts.length ? parts.join('-') : '';
  }

  function isDemoIdentifier(value) {
    var normalized = String(value || '').trim().toLowerCase();
    return /^art_demo_/i.test(normalized) || /^(?:[1-9]|1[0-2])$/.test(normalized);
  }

  function readRegistry() {
    var parsed = safeJSONParse(localStorage.getItem(REGISTRY_KEY) || '[]', []);
    parsed = Array.isArray(parsed) ? parsed : [];
    return parsed.filter(function (entry) {
      var publicId = pickValue(entry && entry.public_id, entry && entry.id);
      return !isDemoIdentifier(publicId);
    });
  }

  function writeRegistry(entries) {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
  }

  function normalizeRegistryEntry(entry) {
    return {
      public_id: pickValue(entry && entry.public_id, entry && entry.id),
      slug: pickValue(entry && entry.slug),
      name: pickValue(entry && entry.name),
      category: pickValue(entry && entry.category),
      city: pickValue(entry && entry.city),
      phone: pickValue(entry && entry.phone),
      email: pickValue(entry && entry.email),
      avatar: pickValue(entry && entry.avatar),
      availability: pickValue(entry && entry.availability),
      trust_score: pickValue(entry && entry.trust_score),
      created_at: pickValue(entry && entry.created_at),
      fingerprint: pickValue(entry && entry.fingerprint),
      source_ids: Array.isArray(entry && entry.source_ids) ? entry.source_ids.map(function (value) { return String(value || '').trim(); }).filter(Boolean) : []
    };
  }

  function readSlugMap() {
    var parsed = safeJSONParse(localStorage.getItem(SLUG_MAP_KEY) || '{}', {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    var normalized = {};
    Object.keys(parsed).forEach(function (key) {
      var slug = slugify(key);
      var id = String(parsed[key] || '').trim();
      if (slug && id && !isDemoIdentifier(id)) normalized[slug] = id;
    });
    return normalized;
  }

  function writeSlugMap(map) {
    localStorage.setItem(SLUG_MAP_KEY, JSON.stringify(map && typeof map === 'object' ? map : {}));
  }

  function cleanupStoredMappings() {
    var registry = safeJSONParse(localStorage.getItem(REGISTRY_KEY) || '[]', []);
    if (!Array.isArray(registry)) registry = [];
    var cleanedRegistry = registry.filter(function (entry) {
      var publicId = pickValue(entry && entry.public_id, entry && entry.id);
      return !isDemoIdentifier(publicId);
    });
    if (cleanedRegistry.length !== registry.length) writeRegistry(cleanedRegistry);

    var slugMap = safeJSONParse(localStorage.getItem(SLUG_MAP_KEY) || '{}', {});
    if (!slugMap || typeof slugMap !== 'object' || Array.isArray(slugMap)) slugMap = {};
    var cleanedSlugMap = {};
    Object.keys(slugMap).forEach(function (key) {
      var slug = slugify(key);
      var publicId = String(slugMap[key] || '').trim();
      if (slug && publicId && !isDemoIdentifier(publicId)) cleanedSlugMap[slug] = publicId;
    });
    if (JSON.stringify(cleanedSlugMap) !== JSON.stringify(slugMap)) writeSlugMap(cleanedSlugMap);
  }

  function getSlugByPublicId(publicId, slugMap) {
    var normalizedId = String(publicId || '').trim();
    if (!normalizedId) return '';
    var map = slugMap && typeof slugMap === 'object' ? slugMap : readSlugMap();
    var entries = Object.keys(map);
    for (var i = 0; i < entries.length; i += 1) {
      if (String(map[entries[i]] || '').trim() === normalizedId) return entries[i];
    }
    return '';
  }

  function buildBaseSlug(artisan) {
    var normalized = normalizeArtisanLike(artisan);
    var nameSlug = slugify(normalized.name);
    var categorySlug = slugify(normalized.category);
    var citySlug = slugify(normalized.city);
    return [nameSlug, categorySlug, citySlug].filter(Boolean).join('-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }

  function ensureSlugEntry(publicId, artisan, preferredSlug) {
    var normalizedId = String(publicId || '').trim();
    if (!normalizedId) return '';

    var slugMap = readSlugMap();
    var existingSlug = getSlugByPublicId(normalizedId, slugMap);
    if (existingSlug) return existingSlug;

    var baseSlug = slugify(preferredSlug || buildBaseSlug(artisan));
    if (!baseSlug) baseSlug = slugify(normalizedId);

    var finalSlug = baseSlug;
    if (slugMap[finalSlug] && String(slugMap[finalSlug]) !== normalizedId) {
      finalSlug = slugify(baseSlug + '-' + normalizedId);
    }
    if (!finalSlug) finalSlug = slugify(normalizedId);

    slugMap[finalSlug] = normalizedId;
    writeSlugMap(slugMap);
    return finalSlug;
  }

  function upsertRegistryEntry(artisan, publicId, slug) {
    if (!publicId) return null;

    var normalized = normalizeArtisanLike(artisan);
    var fingerprint = buildFingerprint(normalized);
    var registry = readRegistry().map(normalizeRegistryEntry);
    var sourceIds = [];
    uniquePush(sourceIds, normalized.id);
    uniquePush(sourceIds, normalized.public_id);
    uniquePush(sourceIds, normalized.assigned_artisan_id);
    uniquePush(sourceIds, publicId);

    var foundIndex = registry.findIndex(function (entry) {
      if (entry.public_id === publicId) return true;
      if (fingerprint && entry.fingerprint && entry.fingerprint === fingerprint) return true;
      return sourceIds.some(function (sourceId) { return entry.source_ids.indexOf(sourceId) !== -1; });
    });

    var baseEntry = foundIndex >= 0 ? registry[foundIndex] : {
      public_id: publicId,
      slug: '',
      name: '',
      category: '',
      city: '',
      phone: '',
      email: '',
      avatar: '',
      availability: '',
      trust_score: '',
      created_at: '',
      fingerprint: '',
      source_ids: []
    };

    baseEntry.public_id = publicId;
    baseEntry.slug = pickValue(baseEntry.slug, slug);
    baseEntry.name = pickValue(baseEntry.name, normalized.name);
    baseEntry.category = pickValue(baseEntry.category, normalized.category);
    baseEntry.city = pickValue(baseEntry.city, normalized.city);
    baseEntry.phone = pickValue(baseEntry.phone, normalized.phone);
    baseEntry.email = pickValue(baseEntry.email, normalized.email);
    baseEntry.avatar = pickValue(baseEntry.avatar, normalized.avatar);
    baseEntry.availability = pickValue(baseEntry.availability, normalized.availability);
    baseEntry.trust_score = pickValue(baseEntry.trust_score, normalized.trust_score);
    baseEntry.created_at = pickValue(baseEntry.created_at, normalized.created_at);
    baseEntry.fingerprint = pickValue(baseEntry.fingerprint, fingerprint);
    uniquePush(baseEntry.source_ids, normalized.id);
    uniquePush(baseEntry.source_ids, normalized.public_id);
    uniquePush(baseEntry.source_ids, normalized.assigned_artisan_id);
    uniquePush(baseEntry.source_ids, publicId);

    if (foundIndex >= 0) registry[foundIndex] = baseEntry;
    else registry.unshift(baseEntry);

    writeRegistry(registry);
    return baseEntry;
  }

  function readRequests() {
    var parsed = safeJSONParse(localStorage.getItem(REQUESTS_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function readMarketplaceLocalArtisans() {
    var parsed = safeJSONParse(localStorage.getItem(MARKETPLACE_LOCAL_STORAGE_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function requestSnapshot(raw) {
    var nested = raw && raw.artisan && typeof raw.artisan === 'object' ? raw.artisan : {};
    var requestPublicId = pickValue(raw && raw.assigned_artisan_id, nested.id, raw && raw.artisan_id);
    return {
      request_public_id: isDemoIdentifier(requestPublicId) ? '' : requestPublicId,
      request_ids: [pickValue(raw && raw.assigned_artisan_id), pickValue(nested.id), pickValue(raw && raw.artisan_id)].filter(Boolean).filter(function (value) { return !isDemoIdentifier(value); }),
      name: pickValue(raw && raw.assigned_artisan, nested.name),
      name_key: normalizeText(pickValue(raw && raw.assigned_artisan, nested.name)),
      category: pickValue(nested.category, nested.specialty, nested.job, raw && raw.category, raw && raw.service),
      category_key: normalizeText(pickValue(nested.category, nested.specialty, nested.job, raw && raw.category, raw && raw.service)),
      city: pickValue(nested.city, raw && raw.city, raw && raw.ville),
      city_key: normalizeText(pickValue(nested.city, raw && raw.city, raw && raw.ville)),
      phone: pickValue(nested.phone, raw && raw.phone, raw && raw.telephone),
      email: pickValue(nested.email, raw && raw.email),
      avatar: pickValue(nested.avatar, nested.photo, nested.image),
      availability: pickValue(nested.availability, nested.status),
      trust_score: pickValue(nested.trust_score, nested.trustScore, raw && raw.trust_score, raw && raw.trustScore),
      created_at: pickValue(nested.created_at, nested.createdAt, raw && raw.created_at, raw && raw.date)
    };
  }

  function getArtisanPool() {
    var pool = [];
    if (Array.isArray(window.ARTISANS)) pool = pool.concat(window.ARTISANS);

    var localMarketplaceArtisans = readMarketplaceLocalArtisans();
    if (Array.isArray(localMarketplaceArtisans)) pool = pool.concat(localMarketplaceArtisans);

    var onboardingEntries = window.FixeoArtisanOnboardingStore && typeof window.FixeoArtisanOnboardingStore.getEntries === 'function'
      ? window.FixeoArtisanOnboardingStore.getEntries()
      : [];
    if (Array.isArray(onboardingEntries)) pool = pool.concat(onboardingEntries);

    var seen = {};
    return pool.filter(function (item) {
      var itemId = pickValue(item && item.public_id, item && item.assigned_artisan_id, item && item.id, item && item.artisan_id, item && item.profileId, item && item.userId);
      if (!itemId || isDemoIdentifier(itemId) || seen[itemId]) return false;
      seen[itemId] = true;
      return true;
    });
  }

  function findArtisanInPool(sourceId) {
    var normalizedId = String(sourceId || '').trim();
    if (!normalizedId || isDemoIdentifier(normalizedId)) return null;

    var pool = getArtisanPool();
    for (var i = 0; i < pool.length; i += 1) {
      var item = pool[i];
      if (!item || typeof item !== 'object') continue;
      var itemIds = [
        pickValue(item.public_id),
        pickValue(item.assigned_artisan_id),
        pickValue(item.id),
        pickValue(item.userId),
        pickValue(item.profileId),
        pickValue(item.artisan_id)
      ];
      if (Array.isArray(item.source_ids)) {
        item.source_ids.forEach(function (sourceId) { uniquePush(itemIds, sourceId); });
      }
      if (itemIds.indexOf(normalizedId) !== -1) return item;
    }

    var registry = readRegistry().map(normalizeRegistryEntry);
    var entry = registry.find(function (item) {
      return item.public_id === normalizedId || item.source_ids.indexOf(normalizedId) !== -1;
    });
    return entry || null;
  }

  function hydrateMappingsFromKnownSources() {
    var registry = readRegistry().map(normalizeRegistryEntry);
    registry.forEach(function (entry) {
      var slug = ensureSlugEntry(entry.public_id, entry, entry.slug);
      upsertRegistryEntry(entry, entry.public_id, slug);
    });

    getArtisanPool().forEach(function (artisan) {
      resolvePublicProfileId(artisan);
    });

    readRequests().forEach(function (raw) {
      var snapshot = requestSnapshot(raw);
      if (snapshot.request_public_id || snapshot.name) {
        resolvePublicProfileId({
          id: snapshot.request_public_id,
          assigned_artisan_id: snapshot.request_public_id,
          name: snapshot.name,
          category: snapshot.category,
          city: snapshot.city,
          phone: snapshot.phone,
          email: snapshot.email,
          avatar: snapshot.avatar,
          availability: snapshot.availability,
          trust_score: snapshot.trust_score,
          created_at: snapshot.created_at
        });
      }
    });
  }

  function findPublicIdBySlug(slug) {
    var normalizedSlug = slugify(slug);
    if (!normalizedSlug) return '';

    var slugMap = readSlugMap();
    if (slugMap[normalizedSlug]) return slugMap[normalizedSlug];

    cleanupStoredMappings();
  hydrateMappingsFromKnownSources();
    slugMap = readSlugMap();
    return slugMap[normalizedSlug] || '';
  }

  function resolvePublicProfileId(artisanLike) {
    var artisan = normalizeArtisanLike(artisanLike);
    var sourceIds = [];
    uniquePush(sourceIds, artisan.public_id);
    uniquePush(sourceIds, artisan.assigned_artisan_id);
    uniquePush(sourceIds, artisan.id);
    var nameKey = normalizeText(artisan.name);
    var cityKey = normalizeText(artisan.city);
    var categoryKey = normalizeText(artisan.category);

    var registry = readRegistry().map(normalizeRegistryEntry);
    var fingerprint = buildFingerprint(artisan);
    var existing = registry.find(function (entry) {
      if (sourceIds.some(function (sourceId) { return entry.public_id === sourceId || entry.source_ids.indexOf(sourceId) !== -1; })) return true;
      if (fingerprint && entry.fingerprint && entry.fingerprint === fingerprint) return true;
      return false;
    });

    var requests = readRequests();
    var matchedRequest = null;
    var matchedRequestById = false;

    for (var i = 0; i < requests.length; i += 1) {
      var snapshot = requestSnapshot(requests[i]);
      var hasMatchingId = sourceIds.some(function (sourceId) { return snapshot.request_ids.indexOf(sourceId) !== -1; });
      var sameName = nameKey && snapshot.name_key && nameKey === snapshot.name_key;
      var sameCity = !cityKey || !snapshot.city_key || cityKey === snapshot.city_key;
      var sameCategory = !categoryKey || !snapshot.category_key || categoryKey === snapshot.category_key;
      if (hasMatchingId || (sameName && sameCity && sameCategory)) {
        matchedRequest = snapshot;
        matchedRequestById = hasMatchingId;
        break;
      }
    }

    var poolMatch = null;
    for (var poolIndex = 0; poolIndex < sourceIds.length; poolIndex += 1) {
      poolMatch = findArtisanInPool(sourceIds[poolIndex]);
      if (poolMatch) break;
    }
    if (!poolMatch && matchedRequest && matchedRequest.request_public_id) {
      poolMatch = findArtisanInPool(matchedRequest.request_public_id);
    }

    var resolvedId = pickValue(
      matchedRequest && matchedRequest.request_public_id,
      existing && existing.public_id,
      artisan.public_id,
      artisan.assigned_artisan_id,
      poolMatch && pickValue(poolMatch.public_id, poolMatch.assigned_artisan_id, poolMatch.id, poolMatch.artisan_id),
      artisan.id,
      !sourceIds.length ? (matchedRequest && matchedRequest.request_public_id) : '',
      buildStablePublicId(artisan)
    );

    if (!resolvedId) return null;

    poolMatch = poolMatch || findArtisanInPool(resolvedId);
    var mergedArtisan = {
      id: pickValue(artisan.id, poolMatch && poolMatch.id, resolvedId),
      public_id: pickValue(artisan.public_id, matchedRequest && matchedRequest.request_public_id, existing && existing.public_id, poolMatch && pickValue(poolMatch.public_id, poolMatch.assigned_artisan_id, poolMatch.id, poolMatch.artisan_id), resolvedId),
      assigned_artisan_id: pickValue(artisan.assigned_artisan_id, matchedRequest && matchedRequest.request_public_id, poolMatch && pickValue(poolMatch.assigned_artisan_id, poolMatch.public_id)),
      name: pickValue(artisan.name, matchedRequest && matchedRequest.name, existing && existing.name, poolMatch && poolMatch.name),
      category: pickValue(artisan.category, matchedRequest && matchedRequest.category, existing && existing.category, poolMatch && poolMatch.category, poolMatch && poolMatch.service),
      city: pickValue(artisan.city, matchedRequest && matchedRequest.city, existing && existing.city, poolMatch && poolMatch.city),
      phone: pickValue(artisan.phone, matchedRequest && matchedRequest.phone, existing && existing.phone, poolMatch && poolMatch.phone),
      email: pickValue(artisan.email, matchedRequest && matchedRequest.email, existing && existing.email, poolMatch && poolMatch.email),
      avatar: pickValue(artisan.avatar, matchedRequest && matchedRequest.avatar, existing && existing.avatar, poolMatch && poolMatch.avatar, poolMatch && poolMatch.photo, poolMatch && poolMatch.image),
      availability: pickValue(artisan.availability, matchedRequest && matchedRequest.availability, existing && existing.availability, poolMatch && poolMatch.availability, poolMatch && poolMatch.status),
      trust_score: pickValue(artisan.trust_score, matchedRequest && matchedRequest.trust_score, existing && existing.trust_score, poolMatch && (poolMatch.trust_score || poolMatch.trustScore)),
      created_at: pickValue(artisan.created_at, matchedRequest && matchedRequest.created_at, existing && existing.created_at, poolMatch && (poolMatch.created_at || poolMatch.createdAt))
    };

    var slug = ensureSlugEntry(resolvedId, mergedArtisan, existing && existing.slug);
    var registryEntry = upsertRegistryEntry(mergedArtisan, resolvedId, slug);

    return {
      public_id: resolvedId,
      seo_slug: slug,
      href: buildProfileHref(slug, resolvedId),
      fallback_href: LEGACY_PROFILE_BASE + encodeURIComponent(resolvedId),
      registry: registryEntry,
      matched_request: matchedRequest
    };
  }

  function openResolved(result) {
    if (!result) return false;
    var nextHref = result.href || result.fallback_href;
    if (!nextHref) return false;
    window.location.href = nextHref;
    return true;
  }

  function openProfile(artisanLike, event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    return openResolved(resolvePublicProfileId(artisanLike));
  }

  function openBySourceId(sourceId, event) {
    var artisan = findArtisanInPool(sourceId) || { id: sourceId };
    return openProfile(artisan, event);
  }

  function markUnavailable(control) {
    if (!control || control.dataset.publicProfileBound === '1') return;
    control.dataset.publicProfileBound = '1';
    control.setAttribute('aria-disabled', 'true');
    control.classList.add('is-disabled');
    if ('disabled' in control) control.disabled = true;
    if ((control.textContent || '').trim().toLowerCase().indexOf('profil') !== -1) {
      control.textContent = 'Profil indisponible';
    }
  }

  function bindProfileControl(control, artisanLike) {
    if (!control || control.dataset.publicProfileBound === '1') return;
    var resolved = resolvePublicProfileId(artisanLike);
    if (!resolved) {
      markUnavailable(control);
      return;
    }

    control.dataset.publicProfileBound = '1';
    control.dataset.publicProfileId = resolved.public_id;
    control.dataset.publicProfileSlug = resolved.seo_slug || '';
    control.dataset.publicProfileFallback = resolved.fallback_href || '';

    if (control.tagName === 'A') {
      control.href = resolved.href;
      control.addEventListener('click', function (event) {
        event.stopPropagation();
      }, { once: true });
      return;
    }

    control.type = 'button';
    control.removeAttribute('onclick');
    control.addEventListener('click', function (event) {
      openResolved(resolved);
      event.stopPropagation();
    });
  }

  function extractArtisanCandidate(control, card) {
    var sourceId = pickValue(
      control && control.getAttribute('data-artisan-id'),
      control && control.getAttribute('data-id'),
      control && control.getAttribute('data-assigned-artisan-id'),
      control && control.dataset && control.dataset.artisanId,
      control && control.dataset && control.dataset.id,
      control && control.dataset && control.dataset.assignedArtisanId,
      card && card.getAttribute('data-artisan-id'),
      card && card.getAttribute('data-id')
    );

    var artisan = findArtisanInPool(sourceId);
    if (artisan) return artisan;

    var candidate = {
      id: sourceId,
      assigned_artisan_id: pickValue(
        control && control.getAttribute('data-assigned-artisan-id'),
        control && control.dataset && control.dataset.assignedArtisanId
      ),
      name: pickValue(
        control && control.getAttribute('data-artisan-name'),
        control && control.getAttribute('data-name'),
        control && control.dataset && control.dataset.artisanName,
        control && control.dataset && control.dataset.name,
        card && card.getAttribute('data-artisan-name'),
        card && card.getAttribute('data-name')
      ),
      category: pickValue(
        control && control.getAttribute('data-artisan-category'),
        control && control.getAttribute('data-category'),
        control && control.dataset && control.dataset.artisanCategory,
        control && control.dataset && control.dataset.category,
        card && card.getAttribute('data-artisan-category'),
        card && card.getAttribute('data-category')
      ),
      city: pickValue(
        control && control.getAttribute('data-artisan-city'),
        control && control.getAttribute('data-city'),
        control && control.dataset && control.dataset.artisanCity,
        control && control.dataset && control.dataset.city,
        card && card.getAttribute('data-artisan-city'),
        card && card.getAttribute('data-city')
      ),
      phone: pickValue(
        control && control.getAttribute('data-artisan-phone'),
        control && control.getAttribute('data-phone'),
        control && control.dataset && control.dataset.artisanPhone,
        control && control.dataset && control.dataset.phone
      ),
      email: pickValue(
        control && control.getAttribute('data-artisan-email'),
        control && control.getAttribute('data-email'),
        control && control.dataset && control.dataset.artisanEmail,
        control && control.dataset && control.dataset.email
      )
    };

    if (candidate.id || candidate.assigned_artisan_id || candidate.name) return candidate;
    return null;
  }

  function enhanceCards(root) {
    var scope = root || document;
    var selectors = [
      '.btn-other-profile',
      '.ssb2-btn-profile',
      '.ssb-art-btn-profile',
      '.mini-btn[data-profile-link]',
      '.top-artisan-card .mini-btn',
      '#rec-view-profile',
      '[data-public-profile="true"]'
    ].join(',');

    scope.querySelectorAll(selectors).forEach(function (control) {
      var label = normalizeText(control.textContent || control.getAttribute('aria-label') || '');
      if (label.indexOf('profil') === -1 && label !== 'voir') return;

      var card = control.closest('[data-artisan-id], [data-id], .artisan-card, .top-artisan-card, .service-mini-card, .featured-card, .reply-card');
      var artisan = extractArtisanCandidate(control, card);
      bindProfileControl(control, artisan);
    });
  }

  cleanupStoredMappings();
  hydrateMappingsFromKnownSources();

  window.FixeoPublicProfileLinks = {
    resolve: resolvePublicProfileId,
    open: openProfile,
    openBySourceId: openBySourceId,
    bindControl: bindProfileControl,
    enhanceCards: enhanceCards,
    findPublicIdBySlug: findPublicIdBySlug,
    ensureSlugEntry: ensureSlugEntry,
    readSlugMap: readSlugMap,
    slugify: slugify,
    registryKey: REGISTRY_KEY,
    slugMapKey: SLUG_MAP_KEY,
    legacyBase: LEGACY_PROFILE_BASE,
    seoBase: SEO_PROFILE_BASE
  };

  window.openPublicArtisanProfile = openProfile;
  window.openPublicArtisanProfileById = openBySourceId;

  function scheduleEnhance(root) {
    if (!scheduleEnhance._queue) scheduleEnhance._queue = [];
    if (!scheduleEnhance._scheduled) scheduleEnhance._scheduled = false;

    if (root && root.nodeType === 1) {
      scheduleEnhance._queue.push(root);
    }

    if (scheduleEnhance._scheduled) return;
    scheduleEnhance._scheduled = true;

    window.setTimeout(function () {
      scheduleEnhance._scheduled = false;
      var queue = scheduleEnhance._queue.splice(0, scheduleEnhance._queue.length);
      if (!queue.length) {
        enhanceCards(document);
        return;
      }

      var seen = [];
      queue.forEach(function (node) {
        if (!node || typeof node.querySelectorAll !== 'function') return;

        var scopedRoot = node.closest && node.closest('[data-artisan-id], [data-id], .artisan-card, .top-artisan-card, .service-mini-card, .featured-card, .reply-card, #artisans-container, #hero-results-grid') || node;
        if (seen.indexOf(scopedRoot) === -1) {
          seen.push(scopedRoot);
          enhanceCards(scopedRoot);
        }
      });
    }, 40);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhanceCards(document); }, { once: true });
  } else {
    enhanceCards(document);
  }

  var observer = new MutationObserver(function (mutations) {
    var hasRelevantAddition = false;
    mutations.forEach(function (mutation) {
      if (!mutation || !mutation.addedNodes || !mutation.addedNodes.length) return;
      Array.prototype.forEach.call(mutation.addedNodes, function (node) {
        if (!node || node.nodeType !== 1) return;
        hasRelevantAddition = true;
        scheduleEnhance(node);
      });
    });

    if (!hasRelevantAddition) return;
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})(window, document);
