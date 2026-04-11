// ============================================================
//  FIXEO V3 — MAIN CORE (Artisans · Search · Map · Chat)
// ============================================================

// ── ARTISAN DATA ─────────────────────────────────────────────
const ARTISANS = [];
const MARKETPLACE_LOCAL_STORAGE_KEY = 'fixeo_admin_artisans_v21';

window.ARTISANS = ARTISANS;

function cleanupMarketplaceLocalArtisans() {
  try {
    const parsed = marketplaceSafeJSONParse(localStorage.getItem(MARKETPLACE_LOCAL_STORAGE_KEY) || '[]', []);
    const source = Array.isArray(parsed) ? parsed : [];
    const cleaned = source.filter(function (artisan) {
      const candidateId = marketplacePickFirst(artisan && artisan.id, artisan && artisan.artisan_id, artisan && artisan.public_id);
      return !marketplaceIsDemoIdentifier(candidateId);
    });
    if (cleaned.length !== source.length) {
      localStorage.setItem(MARKETPLACE_LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
    }
  } catch (error) {
    // no-op
  }
}

function marketplaceSafeJSONParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

function marketplaceHasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function marketplacePickFirst() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (marketplaceHasValue(arguments[i])) return String(arguments[i]).trim();
  }
  return '';
}

function marketplaceNormalizeCategory(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function marketplaceIsDemoIdentifier(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^art_demo_/i.test(normalized) || /^(?:[1-9]|1[0-2])$/.test(normalized);
}

function marketplaceBuildInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'FA';
}

function normalizeMarketplaceArtisanRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = marketplacePickFirst(raw.id, raw.artisan_id, raw.public_id);
  if (!id || marketplaceIsDemoIdentifier(id)) return null;

  const name = marketplacePickFirst(raw.name);
  if (!name) return null;

  const service = marketplacePickFirst(raw.category, raw.service, raw.specialty, raw.job);
  const category = marketplaceNormalizeCategory(service);
  const city = marketplacePickFirst(raw.city, raw.ville);
  const description = marketplacePickFirst(raw.description, raw.bio && raw.bio.fr, raw.bio && raw.bio.en, raw.bio && raw.bio.ar, raw.bio);
  const status = marketplacePickFirst(raw.status, 'active').toLowerCase();
  const availability = marketplacePickFirst(raw.availability, status === 'active' ? 'available' : 'offline');
  const trustScore = Number(raw.trust_score ?? raw.trustScore ?? 80);
  const rating = Number(raw.rating ?? raw.average_rating ?? 0);
  const reviewCount = Number(raw.reviewCount ?? raw.total_reviews ?? 0);
  const responseTime = Number(raw.responseTime ?? 15);
  const priceFrom = Number(raw.priceFrom ?? raw.price_from ?? 100);
  const priceUnit = marketplacePickFirst(raw.priceUnit, raw.price_unit, 'h');
  const certified = raw.certified === true || raw.certified === 'true' || raw.certified === 'yes';
  const skills = Array.isArray(raw.skills) && raw.skills.length
    ? raw.skills.filter(Boolean)
    : (service ? [service] : []);
  const badges = Array.isArray(raw.badges) ? raw.badges.filter(Boolean) : (certified ? ['verified'] : []);

  return {
    id,
    name,
    initials: marketplaceBuildInitials(name),
    avatar: marketplacePickFirst(raw.avatar, raw.photo, raw.image) || null,
    category: category || 'bricolage',
    service: service || '',
    city: city || 'Maroc',
    lat: Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null,
    lng: Number.isFinite(Number(raw.lng)) ? Number(raw.lng) : null,
    rating: Number.isFinite(rating) ? rating : 0,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
    trustScore: Number.isFinite(trustScore) ? Math.max(0, Math.min(100, Math.round(trustScore))) : 0,
    priceFrom: Number.isFinite(priceFrom) && priceFrom > 0 ? priceFrom : 100,
    priceUnit,
    availability,
    availabilityLabel: marketplacePickFirst(raw.availabilityLabel, availability === 'available' ? 'Immédiate' : ''),
    bio: { fr: description || '', ar: '', en: description || '' },
    badges,
    skills,
    portfolio: Array.isArray(raw.portfolio) && raw.portfolio.length ? raw.portfolio.filter(Boolean) : ['🔧'],
    phone: marketplacePickFirst(raw.phone, raw.telephone),
    email: marketplacePickFirst(raw.email),
    xp: Number(raw.xp ?? 0) || 0,
    level: Number(raw.level ?? 1) || 1,
    responseTime: Number.isFinite(responseTime) ? responseTime : 15,
    status,
    createdAt: marketplacePickFirst(raw.createdAt, raw.created_at),
    certified
  };
}

cleanupMarketplaceLocalArtisans();

function readMarketplaceLocalArtisans() {
  try {
    const parsed = marketplaceSafeJSONParse(localStorage.getItem(MARKETPLACE_LOCAL_STORAGE_KEY) || '[]', []);
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeMarketplaceArtisanRecord)
      .filter((artisan) => artisan && artisan.status === 'active');
  } catch (error) {
    return [];
  }
}

function replaceMarketplaceArtisans(list) {
  const source = Array.isArray(list) ? list : [];
  const seen = new Set();
  const normalized = [];

  source.forEach((raw) => {
    const artisan = normalizeMarketplaceArtisanRecord(raw) || raw;
    const id = marketplacePickFirst(artisan && artisan.id);
    if (!id || marketplaceIsDemoIdentifier(id) || seen.has(id)) return;
    seen.add(id);
    normalized.push(artisan);
  });

  ARTISANS.splice(0, ARTISANS.length, ...normalized);
  if (typeof syncOnboardingArtisans === 'function') {
    syncOnboardingArtisans();
  } else if (typeof window.syncOnboardingArtisans === 'function') {
    window.syncOnboardingArtisans();
  }
  window.ARTISANS = ARTISANS;

}

function refreshMarketplaceAfterLoad() {
  if (document.readyState === 'loading') return;
  refreshMarketplaceFromCurrentFilters();
}

(function loadMarketplaceArtisans() {
  const API_BASE = (function () {
    const h = window.location.hostname;
    if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt'))
      return window.location.origin;
    if (h === 'localhost' || h === '127.0.0.1')
      return window.location.protocol + '//' + h + ':3001';
    return window.location.origin;
  })();

  const localArtisans = readMarketplaceLocalArtisans();
  if (localArtisans.length) {
    replaceMarketplaceArtisans(localArtisans);
  }

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tmo = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;

  fetch(API_BASE + '/api/marketplace/artisans', { signal: ctrl ? ctrl.signal : undefined })
    .then((response) => {
      if (tmo) clearTimeout(tmo);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then((body) => {
      if (!body.success || !Array.isArray(body.artisans)) return;
      replaceMarketplaceArtisans(body.artisans);
      refreshMarketplaceAfterLoad();
      window.dispatchEvent(new CustomEvent('fixeo:marketplace-artisans-updated', {
        detail: { count: ARTISANS.length }
      }));
      console.log('[Fixeo Marketplace] ✅ Artisans chargés :', ARTISANS.length);
    })
    .catch((error) => {
      if (tmo) clearTimeout(tmo);
      refreshMarketplaceAfterLoad();
      console.warn('[Fixeo Marketplace] ⚠️ API indisponible — source locale utilisée si disponible. Err:', error.message);
    });
})();


// ── SEARCH & FILTER ───────────────────────────────────────────
class SearchEngine {
  constructor() {
    this.artisans = ARTISANS;
    this.filtered = [...ARTISANS];
    this.compareList = [];
  }

  filter({ query = '', category = '', city = '', availability = '', minRating = 0, sortBy = 'rating' }) {
    /* Helper: strip accents + lower-case for accent-insensitive comparison */
    const _norm = s => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    this.filtered = this.artisans.filter(a => a.status === 'active').filter(a => {
      const lang = window.i18n ? window.i18n.lang : 'fr';
      const q    = _norm(query);
      /* NLP-aware query: also check if query matches category name via normalised compare */
      const matchQuery = !q ||
        _norm(a.name).includes(q) ||
        _norm(a.category).includes(q) ||
        _norm(a.bio[lang] || a.bio.fr || '').includes(q) ||
        (a.skills || []).some(s => _norm(s).includes(q));
      const matchCat  = !category || a.category === category;
      /* Accent-insensitive city matching */
      const matchCity = !city || _norm(a.city).includes(_norm(city));
      const matchAvail  = !availability || a.availability === availability;
      const matchRating = a.rating >= minRating;
      return matchQuery && matchCat && matchCity && matchAvail && matchRating;
    });
    const sortFns = {
      rating: (a, b) => b.rating - a.rating,
      price_asc: (a, b) => a.priceFrom - b.priceFrom,
      price_desc: (a, b) => b.priceFrom - a.priceFrom,
      reviews: (a, b) => b.reviewCount - a.reviewCount,
      trust: (a, b) => b.trustScore - a.trustScore,
    };
    this.filtered.sort(sortFns[sortBy] || sortFns.rating);
    return this.filtered;
  }

  addToCompare(id) {
    if (this.compareList.includes(id)) return;
    if (this.compareList.length >= 3) {
      if (window.notifSystem) window.notifSystem.toast({ type: 'warning', title: 'Maximum 3 artisans', message: 'Retirez un artisan pour en ajouter un autre.', icon: '⚠️' });
      return;
    }
    this.compareList.push(id);
    updateComparatorBar();
  }

  removeFromCompare(id) {
    this.compareList = this.compareList.filter(i => i !== id);
    updateComparatorBar();
  }
}

if (typeof syncOnboardingArtisans === 'function') {
  syncOnboardingArtisans();
} else if (typeof window.syncOnboardingArtisans === 'function') {
  window.syncOnboardingArtisans();
} else {
  console.warn('[Fixeo Marketplace] syncOnboardingArtisans indisponible — poursuite sans synchronisation onboarding.');
}
window.searchEngine = new SearchEngine();
window.renderArtisans = renderArtisans;  // Exposed for SmartSearch v7

// ── OTHER ARTISANS PAGINATION STATE ───────────────────────────
const OTHER_VISIBLE_ROWS = 2;
let _otherArtisansList = [];
let _otherShownCount = 0;
let _otherExpanded = false;
let _otherResizeTimer = null;

function getResponsiveArtisanColumns() {
  const width = window.innerWidth || document.documentElement.clientWidth || 1440;
  if (width <= 760) return 1;
  if (width <= 1100) return 2;
  return 3;
}

function getResponsiveArtisanInitialCount() {
  return getResponsiveArtisanColumns() * OTHER_VISIBLE_ROWS;
}

function getResponsiveArtisanStep() {
  return getResponsiveArtisanColumns();
}

function getArtisanAvatarSrc(a) {
  return a.avatar || a.photo || a.image || 'default-avatar.jpg';
}

const MARKETPLACE_REQUESTS_KEY = 'fixeo_client_requests';
var _marketplaceSmartSortMetaCache = new Map();

function marketplaceHasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function marketplacePickValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (marketplaceHasValue(arguments[i])) return String(arguments[i]).trim();
  }
  return '';
}

function marketplacePickNumber() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = Number(arguments[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function marketplaceNormalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function marketplaceParseJSON(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

function marketplaceReadRequests() {
  try {
    const parsed = marketplaceParseJSON(localStorage.getItem(MARKETPLACE_REQUESTS_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function marketplaceNormalizeStatus(value) {
  return marketplaceNormalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function marketplaceIsValidatedMission(raw) {
  const status = marketplaceNormalizeStatus(raw && raw.status);
  const confirmation = marketplaceNormalizeStatus(raw && raw.client_confirmation_status);
  const payStatus = marketplaceNormalizeStatus(raw && raw.commission_status);
  if (status.indexOf('valide') !== -1 || status.indexOf('intervention confirmee') !== -1) return true;
  if (raw && (raw.client_confirmed === true || raw.mission_validated === true)) return true;
  if (confirmation.indexOf('confirmee') !== -1 && payStatus.indexOf('pay') !== -1) return true;
  return false;
}

function marketplaceGetReviewRating(raw) {
  const reviewSubmitted = raw && (raw.review_submitted === true || String(raw.review_submitted || '').toLowerCase() === 'true');
  const rating = marketplacePickNumber(
    raw && raw.review_rating,
    raw && raw.rating,
    raw && raw.review && raw.review.rating,
    raw && raw.artisan && raw.artisan.average_rating,
    raw && raw.artisan && raw.artisan.rating
  );
  if (!reviewSubmitted || rating == null) return null;
  return Math.max(0, Math.min(5, rating));
}

function marketplaceGetDateTimestamp(value) {
  if (!marketplaceHasValue(value)) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function marketplaceStableHash(value) {
  const input = String(value || 'fixeo');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function marketplaceGetArtisanKey(artisan) {
  const id = marketplacePickValue(artisan && artisan.id, artisan && artisan.artisan_id, artisan && artisan.assigned_artisan_id);
  if (id) return 'id:' + id;
  return 'fp:' + [
    marketplaceNormalizeText(artisan && artisan.name),
    marketplaceNormalizeText(artisan && artisan.category),
    marketplaceNormalizeText(artisan && artisan.city)
  ].filter(Boolean).join('|');
}

function marketplaceRequestMatchesArtisan(raw, artisan) {
  if (!raw || !artisan) return false;
  const nested = raw.artisan && typeof raw.artisan === 'object' ? raw.artisan : {};
  const artisanIds = [
    marketplacePickValue(artisan.id, artisan.artisan_id, artisan.assigned_artisan_id),
    marketplacePickValue(artisan.profileId),
    marketplacePickValue(artisan.userId)
  ].filter(Boolean);
  const requestIds = [
    marketplacePickValue(raw.assigned_artisan_id),
    marketplacePickValue(nested.id),
    marketplacePickValue(raw.artisan_id)
  ].filter(Boolean);
  if (artisanIds.some(id => requestIds.includes(id))) return true;

  const artisanName = marketplaceNormalizeText(artisan.name);
  const requestName = marketplaceNormalizeText(marketplacePickValue(raw.assigned_artisan, nested.name));
  if (!artisanName || artisanName !== requestName) return false;

  const artisanCity = marketplaceNormalizeText(artisan.city);
  const requestCity = marketplaceNormalizeText(marketplacePickValue(nested.city, raw.city, raw.ville));
  const artisanCategory = marketplaceNormalizeText(artisan.category);
  const requestCategory = marketplaceNormalizeText(marketplacePickValue(nested.category, nested.specialty, nested.job, raw.category, raw.service));
  const cityOk = !artisanCity || !requestCity || artisanCity === requestCity;
  const categoryOk = !artisanCategory || !requestCategory || artisanCategory === requestCategory;
  return cityOk && categoryOk;
}

function marketplaceBuildSortMeta(artisan, requests) {
  const matchedRequests = (Array.isArray(requests) ? requests : []).filter(raw => marketplaceRequestMatchesArtisan(raw, artisan));
  let derivedRatingSum = 0;
  let derivedRatingCount = 0;
  let derivedValidatedMissions = 0;
  let earliestTimestamp = null;

  matchedRequests.forEach(raw => {
    if (marketplaceIsValidatedMission(raw)) derivedValidatedMissions += 1;
    const rating = marketplaceGetReviewRating(raw);
    if (rating != null) {
      derivedRatingSum += rating;
      derivedRatingCount += 1;
    }
    [
      raw && raw.created_at,
      raw && raw.createdAt,
      raw && raw.validated_at,
      raw && raw.completed_at,
      raw && raw.review_date,
      raw && raw.date
    ].forEach(value => {
      const ts = marketplaceGetDateTimestamp(value);
      if (ts != null && (earliestTimestamp == null || ts < earliestTimestamp)) earliestTimestamp = ts;
    });
  });

  const trustScore = Math.max(0, marketplacePickNumber(artisan && artisan.trust_score, artisan && artisan.trustScore, 0) || 0);
  const averageRating = Math.max(0, marketplacePickNumber(
    artisan && artisan.average_rating,
    artisan && artisan.averageRating,
    derivedRatingCount ? (derivedRatingSum / derivedRatingCount) : null,
    artisan && artisan.rating,
    0
  ) || 0);
  const totalValidatedMissions = Math.max(0, marketplacePickNumber(
    artisan && artisan.total_missions_validated,
    artisan && artisan.total_missions_validées,
    artisan && artisan.missions_validated,
    artisan && artisan.missionsValidated,
    artisan && artisan.total_missions,
    derivedValidatedMissions,
    0
  ) || 0);
  const createdAtRaw = marketplacePickValue(
    artisan && artisan.created_at,
    artisan && artisan.createdAt,
    artisan && artisan.joined_at,
    artisan && artisan.registered_at,
    earliestTimestamp != null ? new Date(earliestTimestamp).toISOString() : ''
  );
  const stableKey = marketplaceGetArtisanKey(artisan);
  const createdAtTs = marketplaceGetDateTimestamp(createdAtRaw);
  const fallbackCreatedAtTs = Date.parse('2099-12-31T00:00:00.000Z') + (marketplaceStableHash(stableKey) % 86400000);

  return {
    key: stableKey,
    trust_score: trustScore,
    average_rating: Number(averageRating.toFixed(2)),
    total_missions_validated: totalValidatedMissions,
    created_at: createdAtRaw || 'fallback-stable',
    created_at_ts: createdAtTs != null ? createdAtTs : fallbackCreatedAtTs,
    top_artisan: trustScore >= 90
  };
}

function sortMarketplaceArtisansIntelligently(list) {
  const source = Array.isArray(list) ? list.slice() : [];
  const requests = marketplaceReadRequests();
  const metaMap = new Map();
  source.forEach(artisan => {
    metaMap.set(marketplaceGetArtisanKey(artisan), marketplaceBuildSortMeta(artisan, requests));
  });
  _marketplaceSmartSortMetaCache = metaMap;

  return source.sort((left, right) => {
    const leftMeta = metaMap.get(marketplaceGetArtisanKey(left)) || marketplaceBuildSortMeta(left, requests);
    const rightMeta = metaMap.get(marketplaceGetArtisanKey(right)) || marketplaceBuildSortMeta(right, requests);
    if (rightMeta.trust_score !== leftMeta.trust_score) return rightMeta.trust_score - leftMeta.trust_score;
    if (rightMeta.average_rating !== leftMeta.average_rating) return rightMeta.average_rating - leftMeta.average_rating;
    if (rightMeta.total_missions_validated !== leftMeta.total_missions_validated) return rightMeta.total_missions_validated - leftMeta.total_missions_validated;
    if (leftMeta.created_at_ts !== rightMeta.created_at_ts) return leftMeta.created_at_ts - rightMeta.created_at_ts;
    return marketplaceNormalizeText(left && left.name).localeCompare(marketplaceNormalizeText(right && right.name), 'fr');
  });
}

function getMarketplaceCardSortMeta(artisan) {
  return _marketplaceSmartSortMetaCache.get(marketplaceGetArtisanKey(artisan)) || marketplaceBuildSortMeta(artisan, marketplaceReadRequests());
}

window.FixeoMarketplaceSmartSort = {
  sortArtisans: sortMarketplaceArtisansIntelligently,
  getMeta: getMarketplaceCardSortMeta
};

// ── BUILD ONE OTHER-ARTISAN CARD ──────────────────────────────
function getResultProfessionLabel(cat, lang = 'fr') {
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
  return (labels[cat] && labels[cat][lang]) || getCategoryLabel(cat, lang) || 'Artisan';
}

function buildOtherArtisanCard(a) {
  const lang = window.i18n ? window.i18n.lang : 'fr';
  const service = getCategoryLabel(a.category, lang);
  const imageSrc = getArtisanAvatarSrc(a);
  const safeBadges = Array.isArray(a.badges) ? a.badges : [];
  const isAvailable = a.availability === 'available';
  const smartSortMeta = getMarketplaceCardSortMeta(a);
  const rating = Number(marketplacePickNumber(a.rating, smartSortMeta.average_rating, 0) || 0);
  const reviews = Number(a.reviewCount || 0);
  const responseTime = Number(a.responseTime || 0);
  const visibleSkills = (Array.isArray(a.skills) ? a.skills : []).slice(0, 3);
  const isVerified = safeBadges.includes('verified') || Number(a.trustScore || a.trust_score || smartSortMeta.trust_score || 0) >= 85;
  const verificationPending = safeBadges.includes('pending') || a.verificationStatus === 'pending';
  const isNewArtisan = safeBadges.includes('new') || a.onboardingStatus === 'nouveau';
  const primaryBadge = isVerified ? '<span class="badge verified">✔ Vérifié</span>' : '';
  const availableText = a.availabilityLabel || 'Disponible';
  const secondaryBadge = isAvailable ? `<span class="badge available">🟢 ${availableText}</span>` : '';
  const newBadge = isNewArtisan ? '<span class="badge new">✨ Nouveau</span>' : '';
  const topBadge = smartSortMeta.top_artisan ? '<span class="badge" style="background:rgba(124,58,237,.16);color:#a855f7;border:1px solid rgba(167,139,250,.42)">Top artisan</span>' : '';
  const pendingBadge = verificationPending ? `<span class="badge pending">${a.verificationLabel || 'Profil en vérification'}</span>` : '';
  const responseLabel = responseTime > 0 ? `Réponse : ${responseTime} min` : 'Réponse rapide';
  const serializedArtisanId = JSON.stringify(String(a.id));

  return `
    <article class="artisan-card other-card discover-harmonized-card result-card" data-id="${a.id}">
      <div class="result-top">
        <img class="artisan-avatar artisan-avatar-image" src="${imageSrc}" alt="${a.name}" loading="lazy" onerror="this.onerror=null;this.src='default-avatar.jpg';"/>
        <div class="artisan-main artisan-identity artisan-card-heading">
          <h3 class="artisan-name">${a.name}</h3>
          <p class="artisan-service">${service} • ${a.city || 'Maroc'}</p>
          <div class="artisan-badges badges">${primaryBadge}${topBadge}${newBadge}${secondaryBadge}${pendingBadge}</div>
        </div>
        <div class="artisan-price-block">
          <strong>Dès ${a.priceFrom || 150} MAD</strong>
          <span>${responseLabel}</span>
        </div>
      </div>

      <div class="artisan-rating-row artisan-rating">
        <span>⭐ ${rating.toFixed(1)}</span>
        <span>(${reviews} avis)</span>
      </div>

      <div class="artisan-skills">
        ${visibleSkills.map(skill => `<span>${skill}</span>`).join('')}
      </div>

      <div class="result-actions card-buttons">
        <button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId(${serializedArtisanId}, event);}else if(window.openArtisanModal){openArtisanModal(${serializedArtisanId});}" title="Voir le profil complet">Voir profil</button>
        <button class="btn-secondary btn-other-reserve ssb2-btn-reserve primary-btn fixeo-reserve-btn" data-artisan-id="${a.id}" onclick="return openHomepageArtisanBooking(${serializedArtisanId}, event)" title="Réserver cet artisan">Réserver cet artisan</button>
      </div>
    </article>`;
}

// ── UPDATE OTHER SEE-MORE BUTTON ──────────────────────────────
function _updateOtherSeeMoreBtn() {
  // Sync count badge in separator banner
  const badge = document.getElementById('other-artisans-count-badge');
  if (badge && _otherArtisansList.length > 0) {
    badge.textContent = '👷 ' + _otherArtisansList.length + ' artisan' + (_otherArtisansList.length !== 1 ? 's' : '');
  }
  // Locate or create the wrapper below artisans-container
  let wrap = document.getElementById('other-see-more-wrap');
  const section = document.querySelector('#artisans-section .container');
  if (!wrap && section) {
    wrap = document.createElement('div');
    wrap.id = 'other-see-more-wrap';
    const container = document.getElementById('artisans-container');
    if (container && container.parentNode) {
      container.parentNode.insertBefore(wrap, container.nextSibling);
    } else if (section) {
      section.appendChild(wrap);
    }
  }
  if (!wrap) return;

  const remaining = _otherArtisansList.length - _otherShownCount;
  const nextBatch = Math.min(remaining, getResponsiveArtisanStep());

  if (remaining <= 0) {
    wrap.style.opacity = '0';
    wrap.style.transform = 'translateY(-6px)';
    setTimeout(() => { wrap.style.display = 'none'; }, 260);
  } else {
    wrap.style.display = 'flex';
    wrap.style.opacity = '1';
    wrap.style.transform = 'translateY(0)';
    const isMobile = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
    wrap.innerHTML = isMobile
      ? `<button class="btn-other-see-more" onclick="otherSeeMore()">Voir plus d'artisans</button>`
      : `<button class="btn-other-see-more" onclick="otherSeeMore()">👁 Voir plus <span class="other-see-more-count">+${nextBatch}</span> artisans <span class="see-more-arrow">→</span></button>`;
  }
}

// ── REVEAL NEXT BATCH (append with animation) ─────────────────
function otherSeeMore() {
  const container = document.getElementById('artisans-container');
  if (!container) return;

  const prevCount = _otherShownCount;
  _otherExpanded = true;
  _otherShownCount = Math.min(_otherShownCount + getResponsiveArtisanStep(), _otherArtisansList.length);
  const newSlice = _otherArtisansList.slice(prevCount, _otherShownCount);

  newSlice.forEach((a, i) => {
    const div = document.createElement('div');
    div.innerHTML = buildOtherArtisanCard(a).trim();
    const card = div.firstChild;
    // Stagger animation
    card.style.animationDelay = (i * 60) + 'ms';
    card.classList.add('other-card--reveal');
    container.appendChild(card);
    setTimeout(() => card.classList.remove('other-card--reveal'), 600 + i * 60);
  });

  _updateOtherSeeMoreBtn();
}
window.otherSeeMore = otherSeeMore;

// ── RENDER ARTISANS (with pagination) ────────────────────────
function renderArtisans(list, options = {}) {
  const container = document.getElementById('artisans-container');
  const loadingEl = document.getElementById('loading-artisans');
  const emptyEl   = document.getElementById('no-artisan');
  const preserveShown = Boolean(options.preserveShown);
  const incomingList = Array.isArray(list) ? list : [];
  const resultsPageManager = window.FixeoResultsPage;
  const preparedList = resultsPageManager && typeof resultsPageManager.prepareList === 'function' && !options.skipResultsPageFilters
    ? resultsPageManager.prepareList(incomingList, Array.isArray(list))
    : incomingList;
  const smartSortedList = sortMarketplaceArtisansIntelligently(preparedList);

  if (!container) return;

  if (loadingEl) loadingEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';

  _otherArtisansList = smartSortedList;

  if (!preserveShown) {
    _otherExpanded = false;
    _otherShownCount = Math.min(getResponsiveArtisanInitialCount(), smartSortedList.length);
  } else if (!_otherExpanded) {
    _otherShownCount = Math.min(getResponsiveArtisanInitialCount(), smartSortedList.length);
  } else {
    _otherShownCount = Math.min(Math.max(_otherShownCount, getResponsiveArtisanInitialCount()), smartSortedList.length);
  }

  if (smartSortedList.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    _updateOtherSeeMoreBtn();
    if (resultsPageManager && typeof resultsPageManager.afterRender === 'function') {
      resultsPageManager.afterRender(smartSortedList, incomingList, { explicitBaseList: Array.isArray(list) });
    }
    return;
  }

  const visibleList = smartSortedList.slice(0, _otherShownCount);
  container.innerHTML = visibleList.map(a => buildOtherArtisanCard(a)).join('');
  _updateOtherSeeMoreBtn();

  if (resultsPageManager && typeof resultsPageManager.afterRender === 'function') {
    resultsPageManager.afterRender(smartSortedList, incomingList);
  }
}

function getCategoryColor(cat) {
  const colors = {
    plomberie: '#E1306C,#C13584', peinture: '#F77737,#FCAF45',
    electricite: '#3742fa,#833AB4', nettoyage: '#20c997,#0dcaf0',
    jardinage: '#2ecc71,#27ae60', demenagement: '#E1306C,#833AB4',
    bricolage: '#F77737,#E1306C', climatisation: '#3742fa,#20c997',
    menuiserie: '#8B4513,#D2691E', maconnerie: '#696969,#808080',
  };
  return colors[cat] || '#E1306C,#833AB4';
}

function getCategoryLabel(cat, lang='fr') {
  const labels = {
    plomberie: { fr: 'Plomberie', ar: 'السباكة', en: 'Plumbing' },
    peinture: { fr: 'Peinture', ar: 'الدهان', en: 'Painting' },
    electricite: { fr: 'Électricité', ar: 'الكهرباء', en: 'Electrical' },
    nettoyage: { fr: 'Nettoyage', ar: 'التنظيف', en: 'Cleaning' },
    jardinage: { fr: 'Jardinage', ar: 'البستنة', en: 'Gardening' },
    demenagement: { fr: 'Déménagement', ar: 'النقل', en: 'Moving' },
    bricolage: { fr: 'Bricolage', ar: 'الإصلاح', en: 'Repairs' },
    climatisation: { fr: 'Climatisation', ar: 'التكييف', en: 'AC & HVAC' },
    menuiserie: { fr: 'Menuiserie', ar: 'النجارة', en: 'Carpentry' },
    maconnerie: { fr: 'Maçonnerie', ar: 'البناء', en: 'Masonry' },
  };
  return (labels[cat] && labels[cat][lang]) || cat;
}

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) {
  document.querySelector(`#${id}`)?.classList.add('open');
  document.querySelector('.modal-backdrop')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const modalEl = document.querySelector(`#${id}`);
  if (modalEl) {
    modalEl.classList.remove('open');
    modalEl.removeAttribute('data-mode'); // reset comparison mode
  }
  document.querySelector('.modal-backdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}
function findMarketplaceArtisanById(id) {
  return ARTISANS.find(x => String(x.id) === String(id)) || null;
}

function openArtisanModal(id) {
  const a = findMarketplaceArtisanById(id);
  if (!a) return;
  const lang = window.i18n ? window.i18n.lang : 'fr';
  const modal = document.getElementById('artisan-modal');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-header">
      <h3>${a.name}</h3>
      <button class="modal-close" onclick="closeModal('artisan-modal')">✕</button>
    </div>
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <div class="artisan-avatar-placeholder" style="width:80px;height:80px;font-size:1.8rem">${a.initials}</div>
      <div style="flex:1">
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:.25rem">${a.name}</div>
        <div style="color:rgba(255,255,255,.6);font-size:.85rem;margin-bottom:.5rem">${getCategoryLabel(a.category,lang)} · ${a.city}</div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span class="stars">${'★'.repeat(Math.floor(a.rating))}</span>
          <span style="font-weight:700">${a.rating}</span>
          <span style="color:rgba(255,255,255,.5);font-size:.8rem">(${a.reviewCount} avis)</span>
          <span style="background:${a.availability==='available'?'rgba(32,201,151,.15)':'rgba(255,165,2,.15)'};color:${a.availability==='available'?'var(--success)':'var(--warning)'};padding:2px .6rem;border-radius:999px;font-size:.75rem;font-weight:700;border:1px solid ${a.availability==='available'?'var(--success)':'var(--warning)'}">
            ${a.availability==='available'?'Disponible':'Occupé'}
          </span>
        </div>
      </div>
    </div>
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.85rem;color:rgba(255,255,255,.7);line-height:1.6">${a.bio[lang]||a.bio.fr}</div>
    </div>
    <div class="artisan-trust" style="margin-bottom:1.25rem">
      <div class="trust-label"><span>Score de confiance</span><span style="font-weight:700;color:var(--success)">${a.trustScore}/100</span></div>
      <div class="trust-bar"><div class="trust-fill high" style="width:${a.trustScore}%"></div></div>
    </div>
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem">🛠 Compétences</div>
      <div class="tag-list">${a.skills.map(s=>`<span class="tag">${s}</span>`).join('')}</div>
    </div>
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem">🏆 Badges</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${a.badges.map(b => {
          const badge = window.gamification?.badges.find(bd=>bd.id===b);
          return badge ? `<div style="display:flex;align-items:center;gap:.4rem;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:.5rem;padding:.3rem .6rem;font-size:.8rem">${badge.icon} ${badge.name[lang]||badge.name.fr}</div>` : '';
        }).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem;font-size:.85rem">
      <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:.75rem;padding:.75rem;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent2)">${a.priceFrom} MAD</div>
        <div style="color:rgba(255,255,255,.5);font-size:.75rem">par ${a.priceUnit}</div>
      </div>
      <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:.75rem;padding:.75rem;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--info)">~${a.responseTime} min</div>
        <div style="color:rgba(255,255,255,.5);font-size:.75rem">Délai de réponse</div>
      </div>
    </div>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap">
      <button class="btn btn-primary fixeo-reserve-btn" style="flex:1" onclick="closeModal('artisan-modal');openBookingModal(${JSON.stringify(String(a.id))})">📅 Réserver</button>
      <a class="btn btn-secondary" href="https://wa.me/${a.phone}?text=${encodeURIComponent('Bonjour '+a.name+', je vous contacte via Fixeo.')}" target="_blank">💬 WhatsApp</a>
      <button class="btn btn-secondary" onclick="window.notifSystem.toastWithContact('${a.name}','${a.phone}','${a.email}')">📞 Contact</button>
    </div>
  `;
  openModal('artisan-modal');
}

function openHomepageArtisanBooking(artisanId, event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  const requestedId = String(artisanId || '').trim();
  const artisanObj = ARTISANS.find((artisan) => {
    if (!artisan || typeof artisan !== 'object') return false;
    const sourceIds = Array.isArray(artisan.source_ids) ? artisan.source_ids.map((value) => String(value || '').trim()) : [];
    return [String(artisan.id || '').trim(), String(artisan.artisan_id || '').trim(), String(artisan.public_id || '').trim()].includes(requestedId) || sourceIds.includes(requestedId);
  }) || null;

  if (artisanObj && window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
    window.FixeoReservation.open(artisanObj, false);
    return false;
  }

  if (artisanObj) {
    setTimeout(() => {
      if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
        window.FixeoReservation.open(artisanObj, false);
      } else if (window.openBookingModal && window.openBookingModal !== openHomepageArtisanBooking) {
        window.openBookingModal(artisanObj);
      }
    }, 250);
    return false;
  }

  if (window.openBookingModal && window.openBookingModal !== openHomepageArtisanBooking) {
    window.openBookingModal(requestedId);
  }

  return false;
}
window.openHomepageArtisanBooking = openHomepageArtisanBooking;

function openBookingModal(artisanId) {
  /* ── V7: Delegate to centralized FixeoReservation module ── */
  // Resolve full artisan object so FixeoReservation gets complete data
  const artisanObj = findMarketplaceArtisanById(artisanId) || artisanId;
  if (window.FixeoReservation) {
    window.FixeoReservation.open(artisanObj, false);
  } else {
    // Graceful fallback if reservation module not yet loaded
    if (window.FixeoPayment) {
      window.FixeoPayment.showToast('⏳ Chargement...', 'Module de réservation en cours de chargement.', 'info', 2000);
    }
    // Retry once after 500ms
    setTimeout(() => {
      if (window.FixeoReservation) window.FixeoReservation.open(artisanObj, false);
    }, 500);
  }
}
window.openBookingModal = openBookingModal;

function openExpressBookingModal(artisanId) {
  /* ── V7: Delegate express to centralized FixeoReservation module ── */
  const artisanObj = findMarketplaceArtisanById(artisanId) || artisanId;
  if (window.FixeoReservation) {
    window.FixeoReservation.openExpress(artisanObj);
  }
}
window.openExpressBookingModal = openExpressBookingModal;

// ── TOGGLE COMPARE HELPER ─────────────────────────────────────
function toggleCompare(id) {
  const list = window.searchEngine.compareList;
  if (list.includes(id)) {
    window.searchEngine.removeFromCompare(id);
    const btn = document.getElementById('cmp-btn-' + id);
    if (btn) { btn.textContent = '+ Comparer'; btn.style.background = ''; btn.style.color = ''; }
  } else {
    window.searchEngine.addToCompare(id);
    const btn = document.getElementById('cmp-btn-' + id);
    if (btn) { btn.textContent = '✓ Ajouté'; btn.style.background = 'rgba(32,201,151,.2)'; btn.style.color = '#20c997'; }
  }
}
window.toggleCompare = toggleCompare;

// ── COMPARATOR ────────────────────────────────────────────────
function updateComparatorBar() {
  const bar = document.querySelector('.comparator-bar');
  if (!bar) return;
  const list = window.searchEngine.compareList;
  if (list.length === 0) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  const slots = bar.querySelectorAll('.comparator-slot');
  slots.forEach((slot, i) => {
    const artisanId = list[i];
    if (artisanId) {
      const a = findMarketplaceArtisanById(artisanId);
      slot.classList.add('filled');
      slot.innerHTML = `<div style="text-align:center">
        <div style="font-size:1.2rem">${a.initials}</div>
        <div style="font-size:.6rem;color:rgba(255,255,255,.6);line-height:1.2">${a.name.split(' ')[0]}</div>
        <button onclick="window.searchEngine.removeFromCompare(${JSON.stringify(String(artisanId))})" style="background:none;color:var(--danger);font-size:.7rem;border:none;cursor:pointer">✕</button>
      </div>`;
    } else {
      slot.classList.remove('filled');
      slot.innerHTML = '<span style="font-size:1.2rem">+</span>';
    }
  });
  // Update compare button text & state
  const compareBtn = bar.querySelector('.comparator-btn');
  if (compareBtn) {
    compareBtn.textContent = list.length >= 2
      ? `⚖️ Comparer ${list.length} artisans`
      : `Comparer (${list.length}/2 min)`;
    // Highlight button when ready (2+)
    compareBtn.classList.toggle('ready', list.length >= 2);
    compareBtn.disabled = list.length < 2;
    compareBtn.style.opacity = list.length >= 2 ? '1' : '0.5';
  }
  // Update count hint text
  let hint = bar.querySelector('.comparator-hint');
  if (!hint) {
    hint = document.createElement('span');
    hint.className = 'comparator-hint';
    hint.style.cssText = 'font-size:.72rem;color:rgba(255,255,255,.45);white-space:nowrap';
    bar.appendChild(hint);
  }
  hint.textContent = list.length < 2
    ? `Sélectionnez ${2 - list.length} de plus`
    : list.length === 3 ? '✅ Prêt à comparer !' : '✅ Prêt !';
}

// ── MAP (Leaflet) — FIX 5 ────────────────────────────────────
let leafletMap = null;
let mapMarkers = [];
let geoMarker  = null;

function initMap() {
  const mapEl = document.getElementById('artisan-map');
  if (!mapEl) return;
  const ensureLeaflet = window.FixeoEnsureLeaflet;
  if (typeof L === 'undefined') {
    if (typeof ensureLeaflet === 'function') {
      ensureLeaflet().then(initMap).catch(() => {});
    }
    return;
  }
  if (leafletMap) { leafletMap.invalidateSize(); return; }
  leafletMap = L.map('artisan-map', { zoomControl: true }).setView([32.3, -6.5], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>', maxZoom: 18
  }).addTo(leafletMap);
  renderMapMarkers(ARTISANS);
  setTimeout(() => { leafletMap.invalidateSize(); }, 400);
}

function renderMapMarkers(artisanList) {
  if (!leafletMap) return;
  mapMarkers.forEach(m => leafletMap.removeLayer(m));
  mapMarkers = [];
  artisanList.forEach(a => {
    if (!a.lat || !a.lng) return;
    const color = a.availability === 'available' ? '#20c997'
                : a.availability === 'busy'      ? '#ffa502' : '#6c757d';
    const icon = L.divIcon({
      html: `<div style="width:40px;height:40px;background:${color};border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;color:white;box-shadow:0 3px 12px rgba(0,0,0,.5);cursor:pointer">${a.initials}</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 20],
    });
    const availTxt = a.availability==='available'?'✅ Disponible':a.availability==='busy'?'🟡 Occupé':'⚫ Hors ligne';
    const marker = L.marker([a.lat, a.lng], { icon })
      .addTo(leafletMap)
      .bindPopup(`<div style="min-width:200px;font-family:Cairo,sans-serif;padding:4px">
        <div style="font-weight:700;font-size:.95rem;margin-bottom:4px">${a.name}</div>
        <div style="color:#888;font-size:.78rem;margin-bottom:4px">${getCategoryLabel(a.category)} · 📍 ${a.city}</div>
        <div style="font-size:.82rem;margin-bottom:4px">⭐ ${a.rating} · 💰 ${a.priceFrom} MAD/${a.priceUnit}</div>
        <div style="font-size:.78rem;margin-bottom:8px;color:${color};font-weight:600">${availTxt}</div>
        <button onclick="if(leafletMap)leafletMap.closePopup();openBookingModal(${JSON.stringify(String(a.id))})"
          class="fixeo-reserve-btn"
          style="background:linear-gradient(135deg,#E1306C,#833AB4);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:.8rem;cursor:pointer;font-weight:700;width:100%;font-family:Cairo,sans-serif">
          📅 Réserver
        </button>
      </div>`, { maxWidth: 240 });
    mapMarkers.push(marker);
  });
}

// ── Geolocation — Fix 5 ──────────────────────────────────────
function mapGeolocate() {
  if (!navigator.geolocation) {
    if (window.notifSystem) window.notifSystem.toast({ type:'warning', title:'Géolocalisation indisponible', message:'Votre navigateur ne supporte pas la géolocalisation.', icon:'📍' });
    return;
  }
  const btn = document.getElementById('map-geolocate-btn');
  if (btn) { btn.textContent = '⏳ Localisation…'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!leafletMap) initMap();
      if (leafletMap) {
        leafletMap.setView([lat, lng], 11);
        if (geoMarker) leafletMap.removeLayer(geoMarker);
        geoMarker = L.marker([lat, lng], { icon: L.divIcon({
          html: '<div style="width:18px;height:18px;background:#405DE6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 6px rgba(64,93,230,.3)"></div>',
          className:'', iconSize:[18,18], iconAnchor:[9,9]
        }) }).addTo(leafletMap)
          .bindPopup('<b>📍 Votre position</b>').openPopup();
        leafletMap.invalidateSize();
      }
      if (btn) { btn.textContent='✅ Localisé'; btn.disabled=false; }
      setTimeout(() => { if (btn) btn.textContent='📍 Ma position'; }, 3000);
    },
    () => {
      if (window.notifSystem) window.notifSystem.toast({ type:'warning', title:'Accès refusé', message:'Autorisez la localisation dans les paramètres du navigateur.', icon:'🔒' });
      if (btn) { btn.textContent='📍 Ma position'; btn.disabled=false; }
    },
    { timeout: 8000, maximumAge: 60000 }
  );
}
window.mapGeolocate = mapGeolocate;

// ── City filter on map — Fix 5 ───────────────────────────────
function mapFilterByCity(city) {
  /* Accent-insensitive city comparison */
  const _normCity = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const cityNorm = _normCity(city);
  const filtered = city ? ARTISANS.filter(a => _normCity(a.city) === cityNorm) : ARTISANS;
  renderMapMarkers(filtered);
  const centers = { 'Casablanca':[33.589,-7.633], 'Rabat':[34.020,-6.841], 'Marrakech':[31.638,-8.008],
    'Fès':[34.037,-5.000], 'Agadir':[30.428,-9.598], 'Tanger':[35.759,-5.834],
    'Meknès':[33.893,-5.545], 'Oujda':[34.682,-1.900] };
  if (leafletMap) {
    const c = centers[city];
    if (c) leafletMap.setView(c, 12);
    else if (filtered.length) leafletMap.fitBounds(L.latLngBounds(filtered.map(a=>[a.lat,a.lng])), {padding:[40,40]});
    else leafletMap.setView([32.3,-6.5], 6);
    leafletMap.invalidateSize();
  }
  const fc = document.getElementById('filter-city');
  if (fc) fc.value = city;
  if (window.searchEngine) {
    const r = window.searchEngine.filter({ city });
    renderArtisans(r);
    const cnt = document.getElementById('results-count');
    if (cnt) cnt.textContent = r.length+' artisan'+(r.length!==1?'s':'')+' trouvé'+(r.length!==1?'s':'');
  }
}
window.mapFilterByCity = mapFilterByCity;

// ── CHAT ──────────────────────────────────────────────────────
function initChat() {
  const toggle = document.querySelector('.chat-toggle');
  const panel = document.querySelector('.chat-panel');
  const sendBtn = document.querySelector('.chat-send');
  const input = document.querySelector('.chat-input');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
}

function sendMessage() {
  const input = document.querySelector('.chat-input');
  const messages = document.querySelector('.chat-messages');
  if (!input || !messages || !input.value.trim()) return;
  const msg = document.createElement('div');
  msg.className = 'chat-message out';
  msg.textContent = input.value.trim();
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  input.value = '';
  setTimeout(() => {
    const reply = document.createElement('div');
    reply.className = 'chat-message in';
    reply.textContent = 'Merci pour votre message ! Un artisan vous répondra bientôt. 👷';
    messages.appendChild(reply);
    messages.scrollTop = messages.scrollHeight;
  }, 1200);
}

// ── SEARCH INIT ───────────────────────────────────────────────
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const catFilter = document.getElementById('filter-category');
  const cityFilter = document.getElementById('filter-city');
  const availFilter = document.getElementById('filter-availability');
  const sortFilter = document.getElementById('filter-sort');
  const searchBtn = document.getElementById('search-btn');

  const doSearch = () => {
    const results = window.searchEngine.filter({
      query: searchInput?.value || '',
      category: catFilter?.value || '',
      city: cityFilter?.value || '',
      availability: availFilter?.value || '',
      sortBy: sortFilter?.value || 'rating',
    });
    renderArtisans(results);
    const count = document.getElementById('results-count');
    if (count) count.textContent = `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
  };

  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keyup', e => { if (e.key === 'Enter') doSearch(); });
  [catFilter, cityFilter, availFilter, sortFilter].forEach(el => el?.addEventListener('change', doSearch));

  // Hero search bar — legacy selects removed, now handled by SmartSearch v7
  // SmartSearch.js syncs its own selects with #filter-category and #filter-city automatically.

  // Services section city filter
  const servicesCityFilter = document.getElementById('services-city-filter');
  servicesCityFilter?.addEventListener('change', () => {
    const city = servicesCityFilter.value;
    const label = document.getElementById('services-city-label');
    const nameSpan = document.getElementById('services-city-name');
    const activeCategory = document.querySelector('.chip.active')?.dataset.category || 'all';
    if (city) {
      if (label) label.style.display = 'inline-flex';
      if (nameSpan) nameSpan.textContent = city;
      if (cityFilter) cityFilter.value = city;
    } else {
      if (label) label.style.display = 'none';
      if (cityFilter) cityFilter.value = '';
    }
    const results = window.searchEngine.filter({
      query: searchInput?.value || '',
      category: activeCategory === 'all' ? '' : activeCategory,
      city,
      availability: availFilter?.value || '',
      sortBy: sortFilter?.value || 'rating',
    });
    renderArtisans(results);
    const count = document.getElementById('results-count');
    if (count) count.textContent = `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
    if (typeof window.renderServiceArtisans === 'function') {
      window.renderServiceArtisans(activeCategory);
    }
  });
}

// ── NAVBAR SCROLL ─────────────────────────────────────────────
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
    const btt = document.querySelector('.back-to-top');
    btt?.classList.toggle('visible', window.scrollY > 400);
  });
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  if (hamburger && mobileNav && !window.FixeoMobileMenu?.initialized) {
    const ensureBackdrop = () => {
      let backdrop = document.querySelector('.mobile-nav-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = 'mobile-nav-backdrop';
        backdrop.setAttribute('aria-label', 'Fermer le menu mobile');
        backdrop.setAttribute('aria-hidden', 'true');
        mobileNav.insertAdjacentElement('afterend', backdrop);
      }
      return backdrop;
    };

    const backdrop = ensureBackdrop();
    const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

    const setMenuState = (shouldOpen) => {
      const open = Boolean(shouldOpen && isMobileViewport());
      mobileNav.classList.toggle('open', open);
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
      mobileNav.setAttribute('aria-hidden', String(!open));
      backdrop.classList.toggle('open', open);
      backdrop.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('mobile-menu-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };

    window.FixeoMobileMenu = {
      initialized: true,
      open: () => setMenuState(true),
      close: () => setMenuState(false),
      toggle: () => setMenuState(!mobileNav.classList.contains('open')),
      isOpen: () => mobileNav.classList.contains('open')
    };

    hamburger.dataset.mobileMenuBound = '1';
    mobileNav.dataset.mobileMenuBound = '1';
    backdrop.dataset.mobileMenuBound = '1';
    mobileNav.setAttribute('aria-hidden', 'true');

    hamburger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.FixeoMobileMenu.toggle();
    });

    mobileNav.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        window.FixeoMobileMenu.close();
      });
    });

    mobileNav.addEventListener('click', (e) => {
      if (!window.FixeoMobileMenu.isOpen()) return;
      if (e.target.closest('a, button, input, select, textarea, label, [role="button"]')) return;
      window.FixeoMobileMenu.close();
    });

    backdrop.addEventListener('click', () => {
      window.FixeoMobileMenu.close();
    });

    document.addEventListener('click', e => {
      if (!window.FixeoMobileMenu.isOpen()) return;
      if (mobileNav.contains(e.target) || hamburger.contains(e.target)) return;
      window.FixeoMobileMenu.close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && window.FixeoMobileMenu.isOpen()) {
        window.FixeoMobileMenu.close();
      }
    });

    window.addEventListener('resize', () => {
      if (!isMobileViewport()) {
        window.FixeoMobileMenu.close();
      }
    });
  }
  // Notification btn
  document.querySelector('.notif-btn')?.addEventListener('click', () => window.notifSystem?.togglePanel());
  document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    document.querySelector('.modal-backdrop')?.classList.remove('open');
    document.body.style.overflow = '';
  });
  // Lang
  document.getElementById('lang-select')?.addEventListener('change', e => window.i18n?.setLang(e.target.value));
  document.addEventListener('langchange', () => {
    renderArtisans(window.searchEngine.filtered);
    window.feedManager?.render(document.getElementById('feed-container'));
    window.gamification?.renderAll();
  });
}

// ── COUNTERS ANIMATION ─────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    const target = parseInt(el.dataset.counter);
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = Math.floor(current).toLocaleString();
    }, 16);
  });
}

// ── INTERSECTION OBSERVER ──────────────────────────────────────
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animation = 'slideUp 0.5s ease forwards';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.card, .artisan-card, .other-card, .featured-card, .step-card, .kpi-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
}

// ── CATEGORY CHIPS ─────────────────────────────────────────────
function initCategoryChips() {
  document.querySelectorAll('.chip[data-category]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.dataset.category;
      const servicesCityFilter = document.getElementById('services-city-filter');
      const selectedCity = servicesCityFilter?.value || '';
      const catFilter = document.getElementById('filter-category');
      const cityFilter = document.getElementById('filter-city');
      if (catFilter) { catFilter.value = cat === 'all' ? '' : cat; }
      if (cityFilter) { cityFilter.value = selectedCity; }
      const results = window.searchEngine.filter({ category: cat === 'all' ? '' : cat, city: selectedCity });
      renderArtisans(results);
      const count = document.getElementById('results-count');
      if (count) count.textContent = `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}`;
      if (typeof window.renderServiceArtisans === 'function') {
        window.renderServiceArtisans(cat);
      }
    });
  });
}

// ── EXPRESS MODAL — Fix 2 ─────────────────────────────────────
function initExpressModal() {
  // Ensure any .btn-express without inline onclick opens the express modal
  document.querySelectorAll('.btn-express, [data-open="express-modal"]').forEach(btn => {
    if (!btn.getAttribute('onclick')) {
      btn.addEventListener('click', () => openModal('express-modal'));
    }
  });
  // The express-form submit handler lives in the inline DOMContentLoaded
  // script in index.html (which calls FixeoPayment). Do not duplicate here.
}

// ── STAR RATING ───────────────────────────────────────────────
function initStarRating() {
  document.querySelectorAll('.star-input').forEach(wrap => {
    wrap.querySelectorAll('label').forEach(label => {
      label.addEventListener('click', () => {
        const val = wrap.querySelector('input:checked')?.value;
        if (val) wrap.dataset.rating = val;
      });
    });
  });
}

// ── BACK TO TOP ──────────────────────────────────────────────
function initBackToTop() {
  document.querySelector('.back-to-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initResponsiveArtisanGrid() {
  let lastColumns = getResponsiveArtisanColumns();

  window.addEventListener('resize', () => {
    clearTimeout(_otherResizeTimer);
    _otherResizeTimer = setTimeout(() => {
      const nextColumns = getResponsiveArtisanColumns();
      if (nextColumns === lastColumns) return;
      lastColumns = nextColumns;

      if (_otherArtisansList.length) {
        renderArtisans(_otherArtisansList, { preserveShown: true });
      }

      if (window.SecondarySearch && typeof window.SecondarySearch.syncResponsiveVedette === 'function') {
        window.SecondarySearch.syncResponsiveVedette();
      }
    }, 120);
  });
}

// ── MAIN INIT ─────────────────────────────────────────────────
window.addEventListener('storage', event => {
  if (!window.FixeoArtisanOnboardingStore || event.key !== window.FixeoArtisanOnboardingStore.STORAGE_KEY) return;
  if (typeof syncOnboardingArtisans === 'function') {
    syncOnboardingArtisans();
  } else if (typeof window.syncOnboardingArtisans === 'function') {
    window.syncOnboardingArtisans();
  }
  refreshMarketplaceFromCurrentFilters();
});

window.addEventListener('fixeo:artisan-created', () => {
  if (typeof syncOnboardingArtisans === 'function') {
    syncOnboardingArtisans();
  } else if (typeof window.syncOnboardingArtisans === 'function') {
    window.syncOnboardingArtisans();
  }
  refreshMarketplaceFromCurrentFilters();
});

document.addEventListener('DOMContentLoaded', () => {
  if (typeof syncOnboardingArtisans === 'function') {
    syncOnboardingArtisans();
  } else if (typeof window.syncOnboardingArtisans === 'function') {
    window.syncOnboardingArtisans();
  }
  initNavbar();
  initSearch();
  initChat();
  initMap();
  initCategoryChips();
  initExpressModal();
  initStarRating();
  initBackToTop();
  initResponsiveArtisanGrid();
  if (!window.__FIXEO_SERVICE_SEO_PAGE__) {
    renderArtisans(ARTISANS);
  }
  setTimeout(animateCounters, 500);
  setTimeout(initAnimations, 300);
  // Apply saved lang
  if (window.i18n) window.i18n.applyTranslations();
  // Leaflet map needs size trigger after render
  setTimeout(() => { leafletMap?.invalidateSize(); }, 500);
});

// ── SUBMIT COMMENT ────────────────────────────────────────
function submitComment() {
  const input = document.getElementById('new-comment-input');
  if (!input || !input.value.trim()) return;
  const list = document.getElementById('comment-list');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.07)';
  div.innerHTML = `
    <div style="font-size:1.5rem">😊</div>
    <div style="flex:1">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:.25rem">Vous</div>
      <div style="font-size:.85rem;color:rgba(255,255,255,.8)">${input.value.trim()}</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:.25rem">À l'instant</div>
    </div>
  `;
  if (list) list.prepend(div);
  input.value = '';
  if (window.notifSystem) window.notifSystem.toast({ type:'success', title:'Commentaire ajouté !', message:'Votre commentaire a été publié.', icon:'💬' });
}
window.submitComment = submitComment;


// ── Hero search (simplified — Fix 3, handled in initSearch above) ──
