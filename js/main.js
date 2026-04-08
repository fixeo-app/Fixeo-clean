// ============================================================
//  FIXEO V3 — MAIN CORE (Artisans · Search · Map · Chat)
// ============================================================

// ── ARTISAN DATA ─────────────────────────────────────────────
const ARTISANS = [
  {
    id: 1, name: 'Karim Benali', initials: 'KB', avatar: null, category: 'plomberie',
    city: 'Casablanca', lat: 33.589, lng: -7.633,
    rating: 4.9, reviewCount: 127, trustScore: 96,
    priceFrom: 150, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Plombier certifié avec 12 ans d\'expérience. Spécialisé en rénovation et urgences 24/7.', ar: 'سباك معتمد بخبرة 12 عاماً.', en: '12 years certified plumber, 24/7 emergency.' },
    badges: ['verified', 'pro', 'responsive'],
    skills: ['Fuite d\'eau', 'Chauffe-eau', 'Salle de bain', 'Tuyaux'],
    portfolio: ['🔧','🚿','🪠','💧'],
    phone: '212600000001', email: 'karim@fixeo.ma',
    xp: 1850, level: 4, responseTime: 8,
    status: 'active',
  },
  {
    id: 2, name: 'Sara Doukkali', initials: 'SD', avatar: null, category: 'peinture',
    city: 'Casablanca', lat: 33.595, lng: -7.619,
    rating: 4.8, reviewCount: 98, trustScore: 91,
    priceFrom: 120, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Peintre décoratrice avec un œil artistique pour les espaces modernes.', ar: 'رسامة ديكور بعين فنية للمساحات العصرية.', en: 'Decorative painter with artistic eye for modern spaces.' },
    badges: ['verified', 'top_rated', 'friendly'],
    skills: ['Peinture intérieure', 'Décoration', 'Enduit', 'Ravalement'],
    portfolio: ['🎨','🖌️','🏠','✨'],
    phone: '212600000002', email: 'sara@fixeo.ma',
    xp: 1200, level: 3, responseTime: 12,
    status: 'active',
  },
  {
    id: 3, name: 'Omar Tahiri', initials: 'OT', avatar: null, category: 'electricite',
    city: 'Rabat', lat: 34.020, lng: -6.841,
    rating: 4.7, reviewCount: 85, trustScore: 88,
    priceFrom: 180, priceUnit: 'h',
    availability: 'busy',
    bio: { fr: 'Électricien agréé, installations aux normes NFC 15-100.', ar: 'كهربائي معتمد وفق المعايير الدولية.', en: 'Licensed electrician, NFC 15-100 compliant installations.' },
    badges: ['verified', 'expert'],
    skills: ['Tableau électrique', 'Prises', 'Éclairage', 'Domotique'],
    portfolio: ['⚡','💡','🔌','🏗️'],
    phone: '212600000003', email: 'omar@fixeo.ma',
    xp: 2100, level: 5, responseTime: 20,
    status: 'active',
  },
  {
    id: 4, name: 'Fatima Zahra', initials: 'FZ', avatar: null, category: 'nettoyage',
    city: 'Marrakech', lat: 31.638, lng: -8.008,
    rating: 4.9, reviewCount: 210, trustScore: 99,
    priceFrom: 80, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Entreprise de nettoyage professionnelle, résidentiel & commercial.', ar: 'شركة تنظيف احترافية للمساكن والأعمال.', en: 'Professional cleaning company, residential & commercial.' },
    badges: ['verified', 'top_rated', 'legendary'],
    skills: ['Nettoyage fin de chantier', 'Entretien', 'Désinfection', 'Vitrerie'],
    portfolio: ['🧹','✨','🧽','🪣'],
    phone: '212600000004', email: 'fatima@fixeo.ma',
    xp: 4850, level: 6, responseTime: 5,
    status: 'active',
  },
  {
    id: 5, name: 'Hassan Mrani', initials: 'HM', avatar: null, category: 'jardinage',
    city: 'Fès', lat: 34.037, lng: -5.000,
    rating: 4.8, reviewCount: 72, trustScore: 85,
    priceFrom: 100, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Paysagiste et jardinier avec 8 ans d\'expérience en aménagement extérieur.', ar: 'مهندس مناظر طبيعية بخبرة 8 سنوات.', en: 'Landscaper and gardener with 8 years of outdoor experience.' },
    badges: ['verified', 'pro'],
    skills: ['Tonte', 'Taille', 'Arrosage automatique', 'Pelouse'],
    portfolio: ['🌿','🌺','🌳','🏡'],
    phone: '212600000005', email: 'hassan@fixeo.ma',
    xp: 980, level: 3, responseTime: 15,
    status: 'active',
  },
  {
    id: 6, name: 'Aicha Lamine', initials: 'AL', avatar: null, category: 'demenagement',
    city: 'Agadir', lat: 30.428, lng: -9.598,
    rating: 4.6, reviewCount: 63, trustScore: 80,
    priceFrom: 200, priceUnit: 'jour',
    availability: 'available',
    bio: { fr: 'Service de déménagement professionnel avec camion et équipe expérimentée.', ar: 'خدمة نقل احترافية مع شاحنة وفريق متمرس.', en: 'Professional moving service with truck and experienced team.' },
    badges: ['verified', 'responsive'],
    skills: ['Déménagement', 'Emballage', 'Montage meubles', 'Transport'],
    portfolio: ['📦','🚛','🏠','🔧'],
    phone: '212600000006', email: 'aicha@fixeo.ma',
    xp: 620, level: 2, responseTime: 10,
    status: 'active',
  },
  {
    id: 7, name: 'Youssef Kadi', initials: 'YK', avatar: null, category: 'bricolage',
    city: 'Tanger', lat: 35.759, lng: -5.834,
    rating: 4.7, reviewCount: 91, trustScore: 87,
    priceFrom: 130, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Bricoleur polyvalent, petits travaux & montage de meubles.', ar: 'حرفي متعدد المهارات للأعمال الصغيرة.', en: 'Versatile handyman for small jobs & furniture assembly.' },
    badges: ['verified', 'friendly'],
    skills: ['Montage meubles', 'Fixations', 'Petits travaux', 'Carrelage'],
    portfolio: ['🔨','🪛','🪚','🔩'],
    phone: '212600000007', email: 'youssef@fixeo.ma',
    xp: 1100, level: 3, responseTime: 18,
    status: 'active',
  },
  {
    id: 8, name: 'Nadia Rhouat', initials: 'NR', avatar: null, category: 'climatisation',
    city: 'Casablanca', lat: 33.580, lng: -7.640,
    rating: 4.8, reviewCount: 54, trustScore: 89,
    priceFrom: 200, priceUnit: 'h',
    availability: 'offline',
    bio: { fr: 'Technicienne en climatisation & chauffage. Installation, entretien et réparation.', ar: 'تقنية في التكييف والتدفئة.', en: 'HVAC technician — installation, maintenance and repair.' },
    badges: ['verified', 'expert'],
    skills: ['Climatisation', 'Chauffage', 'Pompe à chaleur', 'VMC'],
    portfolio: ['❄️','🌡️','🔧','💨'],
    phone: '212600000008', email: 'nadia@fixeo.ma',
    xp: 1500, level: 4, responseTime: 25,
    status: 'active',
  },

  {
    id: 9, name: 'Rachid Ouali', initials: 'RO', avatar: null, category: 'menuiserie',
    city: 'Rabat', lat: 34.025, lng: -6.850,
    rating: 4.8, reviewCount: 67, trustScore: 88,
    priceFrom: 160, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Menuisier ébéniste avec 15 ans d\'expérience. Fabrication sur mesure et rénovation de meubles.', ar: 'نجار خبير بخبرة 15 عاماً في صنع الأثاث.', en: 'Master carpenter with 15 years experience in custom furniture.' },
    badges: ['verified', 'pro', 'expert'],
    skills: ['Portes', 'Fenêtres', 'Meubles sur mesure', 'Parquet'],
    portfolio: ['🪚','🪑','🚪','🛏️'],
    phone: '212600000009', email: 'rachid@fixeo.ma',
    xp: 1750, level: 4, responseTime: 14,
    status: 'active',
  },
  {
    id: 10, name: 'Imane Zahiri', initials: 'IZ', avatar: null, category: 'maconnerie',
    city: 'Casablanca', lat: 33.592, lng: -7.628,
    rating: 4.7, reviewCount: 42, trustScore: 83,
    priceFrom: 200, priceUnit: 'jour',
    availability: 'available',
    bio: { fr: 'Maçonne professionnelle, rénovation et construction. Carrelage, enduit et finitions.', ar: 'بنّاءة محترفة في البناء والتجديد والبلاط.', en: 'Professional mason specializing in renovation, tiling and finishes.' },
    badges: ['verified', 'responsive'],
    skills: ['Carrelage', 'Enduit', 'Béton', 'Rénovation'],
    portfolio: ['🧱','🪚','🏗️','🔨'],
    phone: '212600000010', email: 'imane@fixeo.ma',
    xp: 890, level: 3, responseTime: 22,
    status: 'active',
  },
  {
    id: 11, name: 'Samir Benhaddou', initials: 'SB', avatar: null, category: 'climatisation',
    city: 'Marrakech', lat: 31.645, lng: -8.015,
    rating: 4.9, reviewCount: 88, trustScore: 93,
    priceFrom: 180, priceUnit: 'h',
    availability: 'available',
    bio: { fr: 'Expert climatisation & énergies renouvelables. Installation, entretien et dépannage.', ar: 'خبير تكييف وطاقات متجددة لجميع أنواع الأجهزة.', en: 'AC & renewable energy expert — installation, maintenance and repair.' },
    badges: ['verified', 'top_rated', 'pro'],
    skills: ['Climatisation', 'Pompe à chaleur', 'Panneaux solaires', 'VMC'],
    portfolio: ['❄️','☀️','🌡️','💨'],
    phone: '212600000011', email: 'samir@fixeo.ma',
    xp: 2200, level: 5, responseTime: 10,
    status: 'active',
  },
];

// ── V7: Expose ARTISANS globally for FixeoReservation module ──
window.ARTISANS = ARTISANS;

function syncOnboardingArtisans() {
  if (!window.FixeoArtisanOnboardingStore || typeof window.FixeoArtisanOnboardingStore.mergeIntoArtisans !== 'function') return;
  window.FixeoArtisanOnboardingStore.mergeIntoArtisans(ARTISANS);
  window.ARTISANS = ARTISANS;
}

function refreshMarketplaceFromCurrentFilters() {
  if (window.FixeoServiceSeoPage && typeof window.FixeoServiceSeoPage.isActive === 'function' && window.FixeoServiceSeoPage.isActive()) {
    if (typeof window.FixeoServiceSeoPage.rerender === 'function') window.FixeoServiceSeoPage.rerender();
    return;
  }
  if (!window.searchEngine || typeof renderArtisans !== 'function') return;
  window.searchEngine.artisans = ARTISANS;
  const results = window.searchEngine.filter({
    query: document.getElementById('search-input')?.value || '',
    category: document.getElementById('filter-category')?.value || '',
    city: document.getElementById('filter-city')?.value || '',
    availability: document.getElementById('filter-availability')?.value || '',
    sortBy: document.getElementById('filter-sort')?.value || 'rating'
  });
  renderArtisans(results);
}

syncOnboardingArtisans();

// ── V20: Marketplace — Charger artisans actifs depuis l'API ──────────────
// Enrichit la liste statique avec les artisans ajoutés depuis l'admin.
(function _loadMarketplaceArtisans() {
  const API_BASE = (function () {
    const h = window.location.hostname;
    if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt'))
      return window.location.origin;
    if (h === 'localhost' || h === '127.0.0.1')
      return window.location.protocol + '//' + h + ':3001';
    return window.location.origin;
  })();

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tmo  = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;

  fetch(API_BASE + '/api/marketplace/artisans', { signal: ctrl ? ctrl.signal : undefined })
    .then(r => { if (tmo) clearTimeout(tmo); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(body => {
      if (!body.success || !Array.isArray(body.artisans)) return;

      const existingEmails = new Set(ARTISANS.map(a => a.email.toLowerCase()));
      let added = 0;

      body.artisans.forEach(api => {
        if (existingEmails.has((api.email || '').toLowerCase())) {
          /* Mettre à jour le statut de l'artisan existant */
          const existing = ARTISANS.find(a => a.email.toLowerCase() === api.email.toLowerCase());
          if (existing) existing.status = api.status;
          return;
        }
        /* Artisan nouveau (ajouté depuis admin) — créer une carte compatible */
        const initials = api.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        ARTISANS.push({
          id          : ARTISANS.length + 100,
          name        : api.name,
          initials    : initials,
          avatar      : api.avatar || null,
          category    : (api.service || 'bricolage').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''),
          city        : 'Maroc',
          lat         : 33.589, lng: -7.633,
          rating      : 4.5, reviewCount: 0, trustScore: 80,
          priceFrom   : 100, priceUnit: 'h',
          availability: 'available',
          bio         : { fr: api.description || '', ar: '', en: '' },
          badges      : api.certified ? ['verified'] : [],
          skills      : [api.service],
          portfolio   : ['🔧'],
          phone       : api.phone || '', email: api.email,
          xp: 0, level: 1, responseTime: 15,
          status      : api.status,
          _fromAdmin  : true,
        });
        existingEmails.add((api.email || '').toLowerCase());
        added++;
      });

      /* Resync window.ARTISANS */
      syncOnboardingArtisans();
      window.ARTISANS = ARTISANS;
      console.log('[Fixeo Marketplace] ✅ Artisans API chargés :', body.count, '(ajoutés:', added, ')');
      window.dispatchEvent(new CustomEvent('fixeo:marketplace-artisans-updated', {
        detail: { count: body.count, added }
      }));
    })
    .catch(err => {
      if (tmo) clearTimeout(tmo);
      console.warn('[Fixeo Marketplace] ⚠️ API indisponible — artisans statiques utilisés. Err:', err.message);
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

syncOnboardingArtisans();
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
let _marketplaceSmartSortMetaCache = new Map();

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
  const safeSourceId = String(a.id).replace(/'/g, "\'");

  return `
    <article class="artisan-card other-card discover-harmonized-card result-card" data-id="${a.id}">
      <div class="result-top">
        <img class="artisan-avatar artisan-avatar-image" src="${imageSrc}" alt="${a.name}" loading="lazy" onerror="this.onerror=null;this.src='demo-artisan.jpg';"/>
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
        <button class="btn-primary btn-other-profile ssb2-btn-profile secondary-btn" onclick="event.stopPropagation();if(window.FixeoPublicProfileLinks){window.FixeoPublicProfileLinks.openBySourceId('${safeSourceId}', event);}else if(window.openArtisanModal){openArtisanModal(${a.id});}" title="Voir le profil complet">Voir profil</button>
        <button class="btn-secondary btn-other-reserve ssb2-btn-reserve primary-btn fixeo-reserve-btn" data-artisan-id="${a.id}" onclick="event.stopPropagation();openBookingModal(${a.id})" title="Demander un devis à cet artisan">Demander devis</button>
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
function openArtisanModal(id) {
  const a = ARTISANS.find(x => x.id === id);
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
      <button class="btn btn-primary fixeo-reserve-btn" style="flex:1" onclick="closeModal('artisan-modal');openBookingModal(${a.id})">📅 Réserver</button>
      <a class="btn btn-secondary" href="https://wa.me/${a.phone}?text=${encodeURIComponent('Bonjour '+a.name+', je vous contacte via Fixeo.')}" target="_blank">💬 WhatsApp</a>
      <button class="btn btn-secondary" onclick="window.notifSystem.toastWithContact('${a.name}','${a.phone}','${a.email}')">📞 Contact</button>
    </div>
  `;
  openModal('artisan-modal');
}

function openBookingModal(artisanId) {
  /* ── V7: Delegate to centralized FixeoReservation module ── */
  // Resolve full artisan object so FixeoReservation gets complete data
  const artisanObj = ARTISANS.find(x => x.id === artisanId || x.id === parseInt(artisanId)) || artisanId;
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
  const artisanObj = ARTISANS.find(x => x.id === artisanId || x.id === parseInt(artisanId)) || artisanId;
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
      const a = ARTISANS.find(x => x.id === artisanId);
      slot.classList.add('filled');
      slot.innerHTML = `<div style="text-align:center">
        <div style="font-size:1.2rem">${a.initials}</div>
        <div style="font-size:.6rem;color:rgba(255,255,255,.6);line-height:1.2">${a.name.split(' ')[0]}</div>
        <button onclick="window.searchEngine.removeFromCompare(${artisanId})" style="background:none;color:var(--danger);font-size:.7rem;border:none;cursor:pointer">✕</button>
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
        <button onclick="if(leafletMap)leafletMap.closePopup();openBookingModal(${a.id})"
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
  syncOnboardingArtisans();
  refreshMarketplaceFromCurrentFilters();
});

window.addEventListener('fixeo:artisan-created', () => {
  syncOnboardingArtisans();
  refreshMarketplaceFromCurrentFilters();
});

document.addEventListener('DOMContentLoaded', () => {
  syncOnboardingArtisans();
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
