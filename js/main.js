// ============================================================
//  FIXEO V3 — MAIN CORE (Artisans · Search · Map · Chat)
// =====================f=======================================

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
function marketplaceResolveCanonicalCategory(raw) {
  const v = marketplaceNormalizeCategory(raw);

  if (!v) return '';

  // 🔧 Plomberie
  if (/(plomb|fuite|canalis|wc|evier|chauffe.?eau)/.test(v)) return 'plomberie';

  // ⚡ Électricité
  if (/(electr|courant|prise|cabl|interrupteur|panne)/.test(v)) return 'electricite';

  // 🎨 Peinture
  if (/(peint|peinture|mur|facade|vernis)/.test(v)) return 'peinture';

  // 🪵 Menuiserie
  if (/(menuis|bois|porte|placard|fenetre)/.test(v)) return 'menuiserie';

  // ❄️ Climatisation
  if (/(clim|climatiseur|froid|split)/.test(v)) return 'climatisation';

  // 🧱 Maçonnerie
  if (/(macon|beton|mur|construction|fondation)/.test(v)) return 'maconnerie';

  // 🔐 Serrurerie
  if (/(serrure|cle|porte bloque|verrou)/.test(v)) return 'serrurerie';

  // 🧹 Nettoyage
  if (/(nettoy|menage|proprete)/.test(v)) return 'nettoyage';

  // 🌿 Jardinage
  if (/(jardin|plante|pelouse)/.test(v)) return 'jardinage';

  // 🚚 Déménagement
  if (/(demenag|transport meuble)/.test(v)) return 'demenagement';

  return '';
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

// 🔥 SOURCE PRINCIPALE = DB
let category = raw.category;

if (window.FIXEO_DEBUG_SEARCH) console.log('DEBUG RAW:', raw.category, raw.service, raw.specialty, raw.job);

if (!category || category.trim() === '') {
  category = marketplacePickFirst(
    raw.service,
    raw.specialty,
    raw.job
  );
  if (window.FIXEO_DEBUG_SEARCH) console.log('DEBUG SKILLS:', raw.skills);

  if (!category && Array.isArray(raw.skills) && raw.skills.length) {
    category = raw.skills[0];
  }
}   
// sécurité ultime
if (!category) {
  category = 'bricolage';
}

// normalisation
category = marketplaceNormalizeCategory(category)
// Fallback intelligent

  const categoryResolved = marketplaceResolveCanonicalCategory(category) || 'bricolage';
  if (window.FIXEO_DEBUG_SEARCH) console.log('DEBUG RESOLVED:', categoryResolved);
  let service = categoryResolved;
  const city = marketplacePickFirst(raw.city, raw.ville);
  const description = marketplacePickFirst(raw.description, raw.bio && raw.bio.fr, raw.bio && raw.bio.en, raw.bio && raw.bio.ar, raw.bio);
  const status = marketplacePickFirst(raw.status, 'active').toLowerCase();
  const availability = marketplacePickFirst(raw.availability, status === 'active' ? 'available' : 'offline');
  const trustScore = Number(raw.trust_score ?? raw.trustScore ?? 80);
  const rating = Number(raw.rating ?? raw.average_rating ?? 0);
  const reviewCount = Number(raw.reviewCount ?? raw.total_reviews ?? 0);
  const responseTime = Number(raw.responseTime ?? 15);
  const priceFrom = Number(raw.priceFrom ?? raw.price_from ?? 100);
  const priceUnit = marketplacePickFirst(raw.priceUnit, raw.price_unit, 'intervention');
  const certified = raw.certified === true || raw.certified === 'true' || raw.certified === 'yes';
  const skills = Array.isArray(raw.skills) && raw.skills.length
  ? raw.skills.filter(Boolean)
  : (category ? [category] : []);
  const badges = Array.isArray(raw.badges) ? raw.badges.filter(Boolean) : (certified ? ['verified'] : []);
  const verified = raw.verified === true || raw.verified === 'true' || raw.verified === 'yes' || certified || badges.includes('verified');
  const hasRatingData = marketplaceHasValue(raw.rating) || marketplaceHasValue(raw.average_rating) || marketplaceHasValue(raw.review_rating);
  const hasPriceData = marketplaceHasValue(raw.priceFrom) || marketplaceHasValue(raw.price_from) || marketplaceHasValue(raw.price);
  const availableNow = raw.available === true || raw.available === 'true' || availability === 'available';
  const availabilityText = marketplaceNormalizeText(raw.availability);
  const availabilityLabelText = marketplaceNormalizeText(raw.availabilityLabel);
  const availableToday = raw.availableToday === true || raw.available_today === true || availabilityText.includes('today') || availabilityText.includes('aujourd') || availabilityLabelText.includes('today') || availabilityLabelText.includes('aujourd');

  return {
    id,
    name,
    initials: marketplaceBuildInitials(name),
    avatar: marketplacePickFirst(raw.avatar, raw.photo, raw.image) || null,
    category: categoryResolved || 'bricolage',
    service: service || 'bricolage', 
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
    certified,
    verified,
    hasRatingData,
    hasPriceData,
    availableNow,
    availableToday
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
  /* API fetch removed — /api/marketplace/artisans is not available on Vercel.
     Data comes from localStorage (FixeoDB) via readMarketplaceLocalArtisans()
     and is overridden by fixeo-supabase-loader.js (fires 800ms after DCL).
     Removing the fetch eliminates: the 404, the 4-second AbortController timer,
     and the stale console warn on every page load. */

  const localArtisans = readMarketplaceLocalArtisans();
  if (localArtisans.length) {
    replaceMarketplaceArtisans(localArtisans);
  }
  /* fixeo-supabase-loader.js will call replaceMarketplaceArtisans + refreshMarketplaceAfterLoad
     after loading from Supabase, so no explicit call needed here. */
})();


// ── SEARCH & FILTER ───────────────────────────────────────────
class SearchEngine {
  constructor() {
    this.artisans = ARTISANS;
    this.filtered = [...ARTISANS];
    this.compareList = [];
  }

  filter({ query = '', category = '', city = '', availability = '', minRating = 0, maxPrice = 0, verifiedOnly = false, sortBy = 'rating' }) {
    const _norm = s => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const ratingFloor = Number(minRating) || 0;
    const priceCeiling = Number(maxPrice) || 0;

    this.filtered = this.artisans.filter(a => a.status === 'active').filter(a => {
      const lang = window.i18n ? window.i18n.lang : 'fr';
      const q = _norm(query);
      const matchQuery = !q ||
        _norm(a.name).includes(q) ||
        _norm(a.category).includes(q) ||
        _norm(a.bio[lang] || a.bio.fr || '').includes(q) ||
        (a.skills || []).some(s => _norm(s).includes(q));
      const _normCat = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'').trim();
      const matchCat = !category || _normCat(a.category) === _normCat(category)
        || (a.service && _normCat(a.service) === _normCat(category))
        || (a.category && _normCat(a.category).startsWith(_normCat(category)));
      const matchCity = !city || !_norm(a.city) || _norm(a.city).includes(_norm(city));
      const matchAvail = !availability || marketplaceArtisanMatchesAvailability(a, availability);
      const ratingValue = Number(a.rating);
      const hasRating = a.hasRatingData === true || (Number.isFinite(ratingValue) && (ratingValue > 0 || Number(a.reviewCount || 0) > 0));
      const matchRating = !ratingFloor || !hasRating || ratingValue >= ratingFloor;
      const priceValue = Number(a.priceFrom ?? a.price);
      const hasPrice = a.hasPriceData === true || (Number.isFinite(priceValue) && priceValue > 0 && a.priceFrom !== undefined);
      const matchPrice = !priceCeiling || !hasPrice || priceValue <= priceCeiling;
      const matchVerified = !verifiedOnly || marketplaceIsVerifiedArtisan(a);
      return matchQuery && matchCat && matchCity && matchAvail && matchRating && matchPrice && matchVerified;
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

function marketplaceIsVerifiedArtisan(artisan) {
  if (!artisan || typeof artisan !== 'object') return false;
  if (artisan.verified === true || artisan.certified === true) return true;
  const badges = Array.isArray(artisan.badges) ? artisan.badges.map((badge) => marketplaceNormalizeText(badge)) : [];
  return badges.includes('verified') || Number(artisan.trustScore || artisan.trust_score || 0) >= 85;
}

function marketplaceArtisanMatchesAvailability(artisan, filterValue) {
  if (!filterValue || filterValue === 'all') return true;
  const availability = marketplaceNormalizeText(artisan && artisan.availability);
  const label = marketplaceNormalizeText(artisan && artisan.availabilityLabel);
  if (filterValue === 'available_now') {
    return artisan && (artisan.availableNow === true || availability === 'available' || availability.includes('disponible') || label.includes('immed') || label.includes('maintenant'));
  }
  if (filterValue === 'available_today') {
    return artisan && (artisan.availableToday === true || availability.includes('today') || availability.includes('aujourd') || label.includes('today') || label.includes('aujourd'));
  }
  return availability === marketplaceNormalizeText(filterValue);
}

function marketplaceGetUniqueCities(list) {
  const source = Array.isArray(list) ? list : [];
  const seen = new Set();
  return source
    .map((artisan) => String((artisan && artisan.city) || '').trim())
    .filter((city) => {
      if (!city) return false;
      const key = marketplaceNormalizeText(city);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function marketplaceGetUniqueCategories(list) {
  const source = Array.isArray(list) ? list : [];
  const seen = new Set();
  return source
    .map((artisan) => String((artisan && artisan.category) || '').trim())
    .filter((category) => {
      if (!category) return false;
      const key = marketplaceNormalizeText(category);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function marketplaceGetFilterControls() {
  return {
    searchInput: document.getElementById('search-input'),
    catFilter: document.getElementById('filter-category'),
    cityFilter: document.getElementById('filter-city'),
    availFilter: document.getElementById('filter-availability'),
    sortFilter: document.getElementById('filter-sort'),
    ratingFilter: document.getElementById('filter-rating'),
    priceFilter: document.getElementById('filter-price'),
    verifiedFilter: document.getElementById('filter-verified-only'),
    searchBtn: document.getElementById('search-btn'),
    servicesCityFilter: document.getElementById('services-city-filter'),
    resultsCount: document.getElementById('results-count')
  };
}

function marketplaceBuildResultsLabel(count) {
  return `${count} résultat${count !== 1 ? 's' : ''}`;
}

function marketplaceReadFilterState() {
  const controls = marketplaceGetFilterControls();
  return {
    query: controls.searchInput?.value || '',
    category: controls.catFilter?.value || '',
    city: controls.cityFilter?.value || '',
    availability: controls.availFilter?.value || '',
    minRating: Number(controls.ratingFilter?.value || 0) || 0,
    maxPrice: Number(controls.priceFilter?.value || 0) || 0,
    verifiedOnly: Boolean(controls.verifiedFilter?.checked),
    sortBy: controls.sortFilter?.value || 'rating'
  };
}

function marketplaceHasActiveFilters(state) {
  const current = state || marketplaceReadFilterState();
  return Boolean(
    current.query ||
    current.category ||
    current.city ||
    current.availability ||
    Number(current.minRating || 0) > 0 ||
    Number(current.maxPrice || 0) > 0 ||
    current.verifiedOnly
  );
}

function injectMarketplaceFilterStyles() {
  if (document.getElementById('fixeo-premium-filter-styles')) return;
  const style = document.createElement('style');
  style.id = 'fixeo-premium-filter-styles';
  style.textContent = `
    .fixeo-filters-premium-panel {
      background: rgba(20,20,25,0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.4);
      position: relative;
      z-index: 30;
    }
    .fixeo-filters-premium-shell {
      padding: 1rem;
      margin-bottom: 1rem;
    }
    #fixeo-premium-filters-extra {
      display: flex;
      flex-wrap: wrap;
      gap: .85rem;
      align-items: end;
      padding: 1rem 1.05rem;
      margin: 0 0 1rem;
    }
    .fixeo-filter-field {
      display: flex;
      flex-direction: column;
      gap: .38rem;
      min-width: 150px;
      flex: 1 1 150px;
    }
    .fixeo-filter-field--checkbox {
      min-width: 220px;
      justify-content: end;
    }
    .fixeo-filter-label {
      font-size: .76rem;
      font-weight: 700;
      letter-spacing: .02em;
      color: rgba(255,255,255,.72);
      text-transform: uppercase;
    }
    #filter-category,
    #filter-city,
    #filter-availability,
    #filter-sort,
    #filter-rating,
    #filter-price,
    .fixeo-premium-input,
    .fixeo-premium-select {
      width: 100%;
      min-height: 48px;
      padding: .82rem .95rem;
      background: rgba(20,20,25,0.98) !important;
      color: #ffffff !important;
      opacity: 1 !important;
      -webkit-text-fill-color: #ffffff !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
      outline: none;
      transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease, opacity .2s ease;
      position: relative;
      z-index: 9999;
      appearance: none;
      -webkit-appearance: none;
      color-scheme: dark;
      background-image: linear-gradient(45deg, transparent 50%, rgba(255,255,255,.88) 50%), linear-gradient(135deg, rgba(255,255,255,.88) 50%, transparent 50%);
      background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px);
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
      padding-right: 2.4rem;
    }
    #filter-category option,
    #filter-city option,
    #filter-availability option,
    #filter-sort option,
    #filter-rating option,
    #filter-price option,
    .fixeo-premium-select option {
      background: rgba(20,20,25,0.98) !important;
      color: #ffffff !important;
      opacity: 1 !important;
      -webkit-text-fill-color: #ffffff !important;
      text-shadow: none !important;
      font-weight: 600;
    }
    #filter-category option:hover,
    #filter-city option:hover,
    #filter-availability option:hover,
    #filter-sort option:hover,
    #filter-rating option:hover,
    #filter-price option:hover,
    .fixeo-premium-select option:hover,
    #filter-category option:focus,
    #filter-city option:focus,
    #filter-availability option:focus,
    #filter-sort option:focus,
    #filter-rating option:focus,
    #filter-price option:focus,
    .fixeo-premium-select option:focus {
      background: rgba(255,255,255,0.08) !important;
      color: #ffffff !important;
    }
    #filter-category option:checked,
    #filter-city option:checked,
    #filter-availability option:checked,
    #filter-sort option:checked,
    #filter-rating option:checked,
    #filter-price option:checked,
    .fixeo-premium-select option:checked,
    #filter-category option[selected],
    #filter-city option[selected],
    #filter-availability option[selected],
    #filter-sort option[selected],
    #filter-rating option[selected],
    #filter-price option[selected],
    .fixeo-premium-select option[selected] {
      background: rgba(255,0,120,0.18) !important;
      color: #ffffff !important;
    }
    #filter-category:hover,
    #filter-city:hover,
    #filter-availability:hover,
    #filter-sort:hover,
    #filter-rating:hover,
    #filter-price:hover,
    .fixeo-premium-input:hover,
    .fixeo-premium-select:hover {
      background: rgba(255,255,255,0.05) !important;
    }
    #filter-category:focus,
    #filter-city:focus,
    #filter-availability:focus,
    #filter-sort:focus,
    #filter-rating:focus,
    #filter-price:focus,
    .fixeo-premium-input:focus,
    .fixeo-premium-select:focus {
      border: 1px solid rgba(255,0,120,0.35) !important;
      box-shadow: 0 0 0 1px rgba(255,0,120,0.15), 0 10px 30px rgba(0,0,0,0.6) !important;
      animation: fixeoFilterDropdownIn .2s ease;
    }
    .fixeo-filter-checkbox {
      display: inline-flex;
      align-items: center;
      gap: .7rem;
      min-height: 48px;
      padding: 0 1rem;
      background: rgba(20,20,25,0.98);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      cursor: pointer;
      user-select: none;
      font-weight: 600;
    }
    .fixeo-filter-checkbox input {
      accent-color: #ff0078;
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .fixeo-filter-reset {
      min-height: 48px;
      padding: 0 1rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      transition: transform .2s ease, background .2s ease;
    }
    .fixeo-filter-reset:hover {
      background: rgba(255,0,120,0.15);
      transform: translateY(-1px);
    }
    .fixeo-filter-results {
      margin-left: auto;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 1rem;
      border-radius: 999px;
      background: rgba(255,0,120,0.15);
      color: #fff;
      font-weight: 800;
      border: 1px solid rgba(255,255,255,0.08);
      white-space: nowrap;
    }
    .artisan-card[data-filter-hidden='true'] {
      display: none !important;
    }
    @keyframes fixeoFilterDropdownIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 768px) {
      #fixeo-premium-filters-extra {
        gap: .75rem;
      }
      .fixeo-filter-field,
      .fixeo-filter-field--checkbox,
      .fixeo-filter-results,
      .fixeo-filter-reset {
        width: 100%;
        min-width: 100%;
      }
      .fixeo-filter-results {
        justify-content: flex-start;
        margin-left: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

function marketplaceFindPrimaryFilterShell() {
  const controls = [
    document.getElementById('search-input'),
    document.getElementById('search-btn'),
    document.getElementById('filter-category'),
    document.getElementById('filter-city'),
    document.getElementById('filter-availability'),
    document.getElementById('filter-sort')
  ].filter(Boolean);
  if (!controls.length) return null;
  let ancestor = controls[0].parentElement;
  while (ancestor && ancestor !== document.body) {
    if (controls.every((element) => ancestor.contains(element))) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return controls[0].parentElement || null;
}

function enhanceMarketplaceExistingFilterFields() {
  injectMarketplaceFilterStyles();
  const shell = marketplaceFindPrimaryFilterShell();
  if (shell) {
    shell.classList.add('fixeo-filters-premium-panel', 'fixeo-filters-premium-shell');
  }
  [
    document.getElementById('search-input'),
    document.getElementById('filter-category'),
    document.getElementById('filter-city'),
    document.getElementById('filter-availability'),
    document.getElementById('filter-sort')
  ].filter(Boolean).forEach((element) => {
    element.classList.add(element.tagName === 'SELECT' ? 'fixeo-premium-select' : 'fixeo-premium-input');
  });
}

function populateMarketplaceCategoryOptions() {
  const controls = marketplaceGetFilterControls();
  const select = controls.catFilter;
  if (!select) return;
  const previous = select.value || '';
  const categories = marketplaceGetUniqueCategories(ARTISANS);
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Toutes les catégories';
  select.appendChild(allOption);
  categories.forEach((category) => {
    if (!category) return;
    const option = document.createElement('option');
    option.value = category;
    option.textContent = typeof getCategoryLabel === 'function' ? getCategoryLabel(category, 'fr') : category;
    select.appendChild(option);
  });
  const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
  select.value = hasPrevious ? previous : '';
}

function populateMarketplaceCityOptions() {
  const controls = marketplaceGetFilterControls();
  const cities = marketplaceGetUniqueCities(ARTISANS);
  const nextCities = cities.length ? cities : ['Toutes les villes'];
  [controls.cityFilter, controls.servicesCityFilter].forEach((select) => {
    if (!select) return;
    const previous = select.value || '';
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Toutes les villes';
    select.appendChild(allOption);
    nextCities.forEach((city) => {
      if (!city || marketplaceNormalizeText(city) === marketplaceNormalizeText('Toutes les villes')) return;
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      select.appendChild(option);
    });
    const hasPrevious = Array.from(select.options).some((option) => option.value === previous);
    select.value = hasPrevious ? previous : '';
  });
}

function ensureMarketplaceAvailabilityOptions() {
  const { availFilter } = marketplaceGetFilterControls();
  if (!availFilter) return;
  const previous = availFilter.value || '';
  const options = [
    { value: '', label: 'Toutes' },
    { value: 'available_now', label: 'Disponible maintenant' },
    { value: 'available_today', label: "Disponible aujourd'hui" }
  ];
  availFilter.innerHTML = '';
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    availFilter.appendChild(option);
  });
  const hasPrevious = options.some((option) => option.value === previous);
  availFilter.value = hasPrevious ? previous : '';
}

function ensureMarketplaceAdvancedFilters() {
  const container = document.getElementById('artisans-container');
  if (!container || document.getElementById('fixeo-premium-filters-extra')) return;
  const panel = document.createElement('div');
  panel.id = 'fixeo-premium-filters-extra';
  panel.className = 'fixeo-filters-premium-panel';
  panel.innerHTML = `
    <div class="fixeo-filter-field">
      <span class="fixeo-filter-label">Note minimum</span>
      <select id="filter-rating" class="fixeo-premium-select" aria-label="Note minimum">
        <option value="">Toutes les notes</option>
        <option value="4">4+</option>
        <option value="3">3+</option>
        <option value="2">2+</option>
      </select>
    </div>
    <div class="fixeo-filter-field">
      <span class="fixeo-filter-label">Prix maximum</span>
      <select id="filter-price" class="fixeo-premium-select" aria-label="Prix maximum">
        <option value="">Tous les prix</option>
        <option value="100">&lt;100</option>
        <option value="200">&lt;200</option>
        <option value="300">&lt;300</option>
        <option value="500">&lt;500</option>
      </select>
    </div>
    <div class="fixeo-filter-field fixeo-filter-field--checkbox">
      <span class="fixeo-filter-label">Qualité</span>
      <label class="fixeo-filter-checkbox" for="filter-verified-only">
        <input type="checkbox" id="filter-verified-only" />
        <span>Artisans vérifiés uniquement</span>
      </label>
    </div>
    <button type="button" id="fixeo-filters-reset" class="fixeo-filter-reset">Réinitialiser</button>
    <div class="fixeo-filter-results" id="fixeo-filter-results-count">0 résultat</div>
  `;
  container.parentNode.insertBefore(panel, container);
}

function marketplaceSyncResultsCount(count) {
  const label = marketplaceBuildResultsLabel(count);
  const controls = marketplaceGetFilterControls();
  if (controls.resultsCount) controls.resultsCount.textContent = label;
  const premiumCount = document.getElementById('fixeo-filter-results-count');
  if (premiumCount) premiumCount.textContent = label;
}

function marketplaceSyncCardsVisibility(results, state) {
  const container = document.getElementById('artisans-container');
  const emptyEl = document.getElementById('no-artisan');
  if (!container) return;
  const allowedIds = new Set((Array.isArray(results) ? results : []).map((artisan) => String(artisan && artisan.id)));
  container.querySelectorAll('.artisan-card[data-id]').forEach((card) => {
    const visible = allowedIds.has(String(card.getAttribute('data-id') || ''));
    if (visible) {
      card.removeAttribute('data-filter-hidden');
      card.hidden = false;
      card.style.removeProperty('display');
    } else {
      card.setAttribute('data-filter-hidden', 'true');
      card.hidden = true;
      card.style.display = 'none';
    }
  });
  if (emptyEl) {
    emptyEl.style.display = results.length ? 'none' : 'block';
  }
  const seeMoreWrap = document.getElementById('other-see-more-wrap');
  if (seeMoreWrap) {
    if (marketplaceHasActiveFilters(state)) {
      seeMoreWrap.style.display = 'none';
    } else {
      _updateOtherSeeMoreBtn();
    }
  }
  marketplaceSyncResultsCount(results.length);
}

function applyMarketplaceFilters(options = {}) {
  if (!window.searchEngine) return [];
  const state = marketplaceReadFilterState();
  const hasActive = marketplaceHasActiveFilters(state);
  const container = document.getElementById('artisans-container');
  if (!container) return window.searchEngine.filter(state);

  const results = window.searchEngine.filter(state);
  // Re-render with matching sort if filters are active; otherwise use full set
  if (hasActive) {
  var sorted;

try {
  const matchingContext = {
    city: state.city || '',
    service: state.category || '',
    isUrgent: false
  };

  if (
    window.FixeoMatchingEngine &&
    typeof window.FixeoMatchingEngine.sortByMatch === 'function' &&
    (matchingContext.city || matchingContext.service)
  ) {
    sorted = window.FixeoMatchingEngine.sortByMatch(
      results.slice(),
      matchingContext
    );
  } else {
    sorted = results;
  }

} catch (error) {
  console.warn('[Fixeo Matching] applyMarketplaceFilters fallback', error);
  sorted = results;
}
    renderArtisans(sorted, { forceAll: true });
  } else {
    renderArtisans(_initialMatchSortedArtisans || ARTISANS);
  }
  marketplaceSyncCardsVisibility(results, state);

  // Refresh homepage vedette grid with filtered+sorted results
  if (typeof window.FixeoHomepagePremium !== 'undefined' && window.FixeoHomepagePremium.refresh) {
    window.FixeoHomepagePremium.refresh();
  }

  if (options.syncServiceCategory && typeof window.renderServiceArtisans === 'function') {
    const activeCategory = document.querySelector('.chip.active')?.dataset.category || 'all';
    window.renderServiceArtisans(activeCategory);
  }

  return results;
}

function resetMarketplaceFilters() {
  const controls = marketplaceGetFilterControls();
  if (controls.searchInput) controls.searchInput.value = '';
  if (controls.catFilter) controls.catFilter.value = '';
  if (controls.cityFilter) controls.cityFilter.value = '';
  if (controls.availFilter) controls.availFilter.value = '';
  if (controls.sortFilter) controls.sortFilter.value = 'rating';
  if (controls.ratingFilter) controls.ratingFilter.value = '';
  if (controls.priceFilter) controls.priceFilter.value = '';
  if (controls.verifiedFilter) controls.verifiedFilter.checked = false;
  if (controls.servicesCityFilter) controls.servicesCityFilter.value = '';
  const servicesLabel = document.getElementById('services-city-label');
  const servicesName = document.getElementById('services-city-name');
  if (servicesLabel) servicesLabel.style.display = 'none';
  if (servicesName) servicesName.textContent = '';
  const activeChip = document.querySelector('.chip.active');
  if (activeChip && activeChip.dataset.category !== 'all') {
    document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
    document.querySelector('.chip[data-category="all"]')?.classList.add('active');
  }
  window.__FIXEO_FILTERS_FORCE_ALL__ = false;
  var _resetList = window._initialMatchSortedArtisans || ARTISANS;
  renderArtisans(_resetList);
  applyMarketplaceFilters({ syncServiceCategory: true });
}
window.resetMarketplaceFilters = resetMarketplaceFilters;

function refreshMarketplaceFromCurrentFilters() {
  if (document.readyState === 'loading') return;
  enhanceMarketplaceExistingFilterFields();
  ensureMarketplaceAdvancedFilters();
  populateMarketplaceCategoryOptions();
  populateMarketplaceCityOptions();
  ensureMarketplaceAvailabilityOptions();
  requestAnimationFrame(() => {
    applyMarketplaceFilters({ syncServiceCategory: false });
  });
}
window.refreshMarketplaceFromCurrentFilters = refreshMarketplaceFromCurrentFilters;

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
  const profession = getResultProfessionLabel(a.category, lang);
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
  const primaryBadge = isVerified ? '<span class="badge verified" style="box-shadow:0 8px 24px rgba(46, 204, 113, .12)">✔ Vérifié</span>' : '';
  const availableText = a.availabilityLabel || 'Disponible maintenant';
  const secondaryBadge = isAvailable ? `<span class="badge available" style="box-shadow:0 8px 24px rgba(32, 201, 151, .16);font-weight:800">🟢 ${availableText}</span>` : '';
  const newBadge = isNewArtisan ? '<span class="badge new">✨ Nouveau</span>' : '';
  const topBadge = smartSortMeta.top_artisan ? '<span class="badge" style="background:rgba(124,58,237,.16);color:#a855f7;border:1px solid rgba(167,139,250,.42);box-shadow:0 8px 24px rgba(124,58,237,.14)">Top artisan</span>' : '';
  const pendingBadge = verificationPending ? `<span class="badge pending">${a.verificationLabel || 'Profil en vérification'}</span>` : '';
  const responseLabel = responseTime > 0 ? `Réponse : ${responseTime} min` : 'Réponse rapide';
  const serializedArtisanId = JSON.stringify(String(a.id));

  /* Change 6: skip skill chip if it duplicates the category label */
  const categoryNorm = (a.category || '').toLowerCase().trim();
  const deduped = visibleSkills.filter(sk => sk && sk.toLowerCase().trim() !== categoryNorm).slice(0, 3);

  return `
    <article class="artisan-card other-card discover-harmonized-card result-card" data-id="${a.id}" style="position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));box-shadow:0 18px 44px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.05);transition:transform .22s ease, box-shadow .22s ease, border-color .22s ease" onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='0 24px 54px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07)';this.style.borderColor='rgba(225,48,108,.28)'" onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 18px 44px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.05)';this.style.borderColor='rgba(255,255,255,.12)'">
      <!-- Change 7: tighter vertical rhythm — gap 8px header, 10px meta, 12px price, 16px CTA -->
      <div class="result-top" style="align-items:flex-start;gap:1rem;margin-bottom:8px">
        <img class="artisan-avatar artisan-avatar-image" src="${imageSrc}" alt="${a.name}" loading="lazy" onerror="this.onerror=null;this.src='default-avatar.jpg';" style="border:2px solid rgba(255,255,255,.14);box-shadow:0 10px 28px rgba(0,0,0,.18)"/>
        <div class="artisan-main artisan-identity artisan-card-heading" style="min-width:0;flex:1">
          <!-- Change 1: big price block — dominant number, label below, aligned left -->
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:8px">
            <div style="min-width:0;flex:1">
              <h3 class="artisan-name" style="margin:0;font-size:1.18rem;line-height:1.15;font-weight:800;letter-spacing:-.01em">${a.name}</h3>
              <p class="artisan-service" style="margin:8px 0 0;color:rgba(255,255,255,.78);font-size:.92rem"><span style="color:#fff;font-weight:700">${profession}</span> • ${a.city || 'Maroc'}</p>
            </div>
            <!-- Change 1: price dominance — big number first, label second -->
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;margin-left:auto;text-align:right">
              <span style="font-size:1.45rem;font-weight:800;color:#fff;line-height:1">${window._fpb ? '' : (a.priceFrom && a.priceFrom > 100 ? a.priceFrom : 150)}<span style="font-size:.75rem;font-weight:700;color:rgba(255,255,255,.6);margin-left:2px;vertical-align:super;line-height:0">${window._fpb ? '' : 'MAD'}</span></span>
              ${window._fpb ? _fpb(a) : '<span style="font-size:.68rem;color:rgba(255,255,255,.42);font-weight:500">\u00c0 partir de</span>'}
            </div>
          </div>
          <div class="artisan-badges badges" style="gap:.45rem;margin-top:8px">${primaryBadge}${topBadge}${newBadge}${secondaryBadge}${pendingBadge}</div>
        </div>
      </div>

      <!-- Change 7: 10px margin meta row -->
      <div class="artisan-rating-row artisan-rating" style="display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin-bottom:10px;padding:.8rem .95rem;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">
        <span style="font-weight:800;color:#ffd166">⭐ ${rating.toFixed(1)}</span>
        <span style="color:rgba(255,255,255,.82);font-weight:700">(${reviews} avis)</span>
        <span style="margin-left:auto;color:rgba(255,255,255,.5);font-size:.78rem">⚡ ${responseLabel}</span>
      </div>

      <!-- Step 1 — FOMO line -->
      <div class="pvc-fomo">🔥 23 réservations aujourd'hui dans votre zone</div>

      <!-- Step 3 — Trust line -->
      <div class="pvc-trust-line">✔️ Artisan vérifié • Paiement après intervention</div>

      <!-- skills chips -->
      <div class="artisan-skills" style="margin-bottom:12px;gap:.5rem;margin-top:8px">
        <span style="display:inline-flex;align-items:center;padding:.42rem .78rem;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:.8rem;font-weight:700">${service}</span>
        ${deduped.map(skill => `<span style="display:inline-flex;align-items:center;padding:.42rem .78rem;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.78);font-size:.78rem">${skill}</span>`).join('')}
      </div>

      <!-- CTAs + Step 6 under-CTA trust -->
      <div class="result-actions card-buttons" style="display:flex;flex-direction:column;align-items:stretch;gap:.5rem;margin-top:16px">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:.75rem;flex-wrap:wrap">
          <button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId(${serializedArtisanId}, event);}else if(window.openArtisanModal){openArtisanModal(${serializedArtisanId});}" title="Voir le profil complet" style="font-weight:700;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);box-shadow:none;min-width:100px">Voir profil</button>
          <button class="btn-primary fhp-btn-reserve-list" onclick="event.stopPropagation();if(window.FixeoReservation){window.FixeoReservation.open(${serializedArtisanId});}else if(window.openReservationModal){window.openReservationModal(${serializedArtisanId});}" title="Réserver cet artisan" style="min-width:170px;font-weight:800;background:linear-gradient(135deg,#E1306C,#833AB4);border:none;box-shadow:0 8px 22px rgba(225,48,108,.22);transition:all .2s ease" onmouseenter="this.style.transform='scale(1.02) translateY(-1px)';this.style.boxShadow='0 12px 28px rgba(225,48,108,.32)'" onmouseleave="this.style.transform='';this.style.boxShadow='0 8px 22px rgba(225,48,108,.22)'">R\u00e9server en 1 clic</button>
        </div>
        <!-- Step 6 — under-CTA trust text -->
        <div class="pvc-under-cta" style="text-align:right">Sans engagement — paiement après intervention</div>
      </div>
    </article>`;
}

// ── UPDATE OTHER SEE-MORE BUTTON ──────────────────────────────
function _updateOtherSeeMoreBtn() {
  if (window.__FIXEO_FILTERS_FORCE_ALL__) {
    const forcedWrap = document.getElementById('other-see-more-wrap');
    if (forcedWrap) forcedWrap.style.display = 'none';
    return;
  }
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
  const forceAll = Boolean(options.forceAll);
  const incomingList = Array.isArray(list) ? list : [];
  const resultsPageManager = window.FixeoResultsPage;
  const preparedList = resultsPageManager && typeof resultsPageManager.prepareList === 'function' && !options.skipResultsPageFilters
    ? resultsPageManager.prepareList(incomingList, Array.isArray(list))
    : incomingList;
  let smartSortedList = preparedList;

try {
  const matchingContext = {
    city: (document.getElementById('filter-city')?.value || document.getElementById('services-city-filter')?.value || '').trim(),
    service: (document.getElementById('filter-category')?.value || '').trim(),
    isUrgent: false
  };

  if (
    window.FixeoMatchingEngine &&
    typeof window.FixeoMatchingEngine.sortByMatch === 'function' &&
    (matchingContext.city || matchingContext.service)
  ) {
    smartSortedList = window.FixeoMatchingEngine.sortByMatch(preparedList.slice(), matchingContext);
  } else {
    smartSortedList = sortMarketplaceArtisansIntelligently(preparedList);
  }
} catch (error) {
  console.warn('[Fixeo Matching] Fallback → smart sort', error);
  smartSortedList = sortMarketplaceArtisansIntelligently(preparedList);
}

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

  const visibleList = forceAll ? smartSortedList : smartSortedList.slice(0, _otherShownCount);
  if (forceAll) {
    _otherExpanded = true;
    _otherShownCount = smartSortedList.length;
  }
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
        <div style="font-size:1.05rem;font-weight:700;color:var(--accent2)">${a.priceLabel||'\u00c0 partir de '+(a.priceFrom||150)+' MAD'}</div>
        <div style="color:rgba(255,255,255,.5);font-size:.72rem;margin-top:2px">${a.priceRange?'Fourchette '+a.priceRange:'Estimation intervention'}</div>
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
  if (!requestedId) return false;

  const artisanObj = ARTISANS.find((artisan) => {
    if (!artisan || typeof artisan !== 'object') return false;
    const sourceIds = Array.isArray(artisan.source_ids)
      ? artisan.source_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    return [
      String(artisan.id || '').trim(),
      String(artisan.artisan_id || '').trim(),
      String(artisan.public_id || '').trim()
    ].includes(requestedId) || sourceIds.includes(requestedId);
  }) || null;

  if (!artisanObj) {
    if (window.openBookingModal && window.openBookingModal !== openHomepageArtisanBooking) {
      window.openBookingModal(requestedId);
    }
    return false;
  }

  if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
    window.FixeoReservation.open(artisanObj, false);
    return false;
  }

  setTimeout(() => {
    if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
      window.FixeoReservation.open(artisanObj, false);
    }
  }, 300);

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
        <div style="font-size:.82rem;margin-bottom:4px">⭐ ${a.rating} · 💰 ${a.priceLabel || (a.priceFrom + " MAD")}</div>
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
  if (fc) fc.value = city || '';
  if (window.searchEngine) {
    applyMarketplaceFilters();
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
  enhanceMarketplaceExistingFilterFields();
  ensureMarketplaceAdvancedFilters();
  populateMarketplaceCategoryOptions();
  populateMarketplaceCityOptions();
  ensureMarketplaceAvailabilityOptions();

  const controls = marketplaceGetFilterControls();
  const doSearch = () => applyMarketplaceFilters();

  if (!window.__FIXEO_FILTER_EVENTS_BOUND__) {
    controls.searchBtn?.addEventListener('click', doSearch);
    controls.searchInput?.addEventListener('input', doSearch);
    controls.searchInput?.addEventListener('keyup', e => { if (e.key === 'Enter') doSearch(); });
    [controls.catFilter, controls.cityFilter, controls.availFilter, controls.sortFilter].forEach(el => el?.addEventListener('change', doSearch));

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!target) return;
      if (target.id === 'filter-rating' || target.id === 'filter-price' || target.id === 'filter-verified-only') {
        doSearch();
      }
    });

    document.addEventListener('click', (event) => {
      const resetBtn = event.target && event.target.closest ? event.target.closest('#fixeo-filters-reset') : null;
      if (resetBtn) {
        resetBtn.preventDefault();
        resetMarketplaceFilters();
      }
    });

    controls.servicesCityFilter?.addEventListener('change', () => {
      const city = controls.servicesCityFilter.value;
      const label = document.getElementById('services-city-label');
      const nameSpan = document.getElementById('services-city-name');
      const activeCategory = document.querySelector('.chip.active')?.dataset.category || 'all';
      if (city) {
        if (label) label.style.display = 'inline-flex';
        if (nameSpan) nameSpan.textContent = city;
        if (controls.cityFilter) controls.cityFilter.value = city;
      } else {
        if (label) label.style.display = 'none';
        if (nameSpan) nameSpan.textContent = '';
        if (controls.cityFilter) controls.cityFilter.value = '';
      }
      if (controls.catFilter) controls.catFilter.value = activeCategory === 'all' ? '' : activeCategory;
      applyMarketplaceFilters({ syncServiceCategory: true });
    });

    window.__FIXEO_FILTER_EVENTS_BOUND__ = true;
  }

  requestAnimationFrame(() => {
    applyMarketplaceFilters();
  });
}

// ── NAVBAR SCROLL ─────────────────────────────────────────────
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  /* 3A-2: cache .back-to-top once (was queried on every scroll tick);
     add passive:true so browser can parallelise scroll compositing. */
  const btt = document.querySelector('.back-to-top');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
    btt?.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
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
      applyMarketplaceFilters({ syncServiceCategory: true });
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
    // Sort by quality score for initial display (best artisans first)
    var _initList = (window.FixeoMatchingEngine && ARTISANS.length > 0)
      ? window.FixeoMatchingEngine.sortByMatch(ARTISANS.slice(), {})
      : ARTISANS;
    window._initialMatchSortedArtisans = _initList;
    renderArtisans(_initList);
    refreshMarketplaceFromCurrentFilters();
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
  div.style.cssText = 'display:flex;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,.07)';
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
