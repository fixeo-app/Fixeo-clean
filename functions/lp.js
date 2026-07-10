/*!
 * functions/lp.js — Vercel Serverless Function
 * SEO Phase 3B.1 — SSR Local Landing Page Engine (PoC)
 *
 * Route:  GET /{service}-{city}
 * Branch: feat/seo-phase3b-local-lp-poc
 *
 * CORRECTIONS applied in Phase 3B.1:
 *   1. Artisan count semantics — fetchArtisans() now makes TWO queries:
 *      totalCount (all eligible, no LIMIT) and displayedArtisans (LIMIT 12).
 *      Title uses totalCount. Page copy distinguishes total vs displayed.
 *      numberOfItems in JSON-LD uses totalCount.
 *   2. Price quality gate — priceRangePhrase() requires >= 3 distinct records
 *      with price_from > 0 across the FULL eligible set (not just 12 displayed).
 *      Fetches price_from for all eligible artisans in a single extra Supabase
 *      query. Below threshold: no price in title, meta, copy, or JSON-LD.
 *   3. No-hero pages use zero images — RAFI BlackSilhouette completely removed
 *      from LP pages. No image element, no network request, no og:image pointing
 *      at RAFI. og:image for no-hero pages → /img/logo.png (18 KB, HTTP 200,
 *      already used site-wide — no new asset).
 *   4. Redirect status accuracy — vercel.json routes[].status:301 produces HTTP
 *      301 (not 308). 308 only arises from redirects[].permanent:true format.
 *      Our routes use explicit status:301 → actual HTTP 301 confirmed.
 *   5. Preview URL documented (SSO-protected).
 *
 * POC scope (Phase 3B):
 *   EXACTLY these 6 combinations are eligible for HTTP 200:
 *     /plombier-casablanca   /plombier-rabat
 *     /electricien-casablanca /electricien-rabat
 *     /peintre-casablanca    /macon-casablanca
 *   All other service-city combinations → HTTP 404.
 *   Unknown services → HTTP 404.
 *   Malformed slugs → HTTP 400.
 *
 * Page eligibility gate:
 *   totalCount >= 1 → HTTP 200 (indexable)
 *   totalCount == 0 → HTTP 404 (do not index empty pages)
 *
 * Cache strategy:
 *   200: s-maxage=86400, stale-while-revalidate=3600
 *   4xx/5xx: no-store
 *
 * HTTP codes:
 *   200 — eligible page with real artisans
 *   400 — malformed route slug
 *   404 — unsupported combination, unknown service, or 0 artisans
 *   503 — Supabase unavailable
 *
 * Status: PROOF OF CONCEPT — do NOT merge to main without authorization
 */

'use strict';

/* ── Supabase credentials (anon key — same as artisan-profile.js) ── */
const SUPABASE_URL  = 'https://ztwtbgoqanqzvwiibtuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

/*
 * FIXEO brand image used as og:image for services without a dedicated hero.
 * Constraints: must be publicly accessible, lightweight, already on production.
 * Asset: /img/logo.png — HTTP 200, 17,594 bytes (18 KB), already used on
 * index.html and comment-ca-marche.html as site-wide og:image fallback.
 * DO NOT replace with RAFI (2.8 MB) — no large images on no-hero LP pages.
 */
const FIXEO_OG_IMAGE = 'https://www.fixeo.ma/img/logo.png';

/* ══════════════════════════════════════════════════════════════════════
   SECTION A — AUTHORITATIVE SERVICE REGISTRY (Phase 3A.1)
   ══════════════════════════════════════════════════════════════════════
   Locked taxonomy. Never rename canonical slugs after indexation.
   heroAvailable: true  → full hero above fold + hero as og:image
   heroAvailable: false → text-first, NO image element at all (correction 3)
   ══════════════════════════════════════════════════════════════════════ */
const SERVICE_REGISTRY = {
  plombier: {
    categoryKey:   'plomberie',
    canonicalSlug: 'plombier',
    labelSingular: 'Plombier',
    labelPlural:   'Plombiers',
    supabaseAliases: ['Plomberie','plomberie','Plombier','plombier'],
    heroAvailable: true,
    heroUrl:       '/heroes/plomberie/avatar-presenting-transparent.jpg',
    heroAlt:       'Plombier Fixeo',
    relatedSlugs:  ['electricien','macon'],
  },
  electricien: {
    categoryKey:   'electricite',
    canonicalSlug: 'electricien',
    labelSingular: 'Électricien',
    labelPlural:   'Électriciens',
    supabaseAliases: [
      'Électricité','electricite','Electricite',
      'electricien','Electricien','electricite_generale',
    ],
    heroAvailable: true,
    heroUrl:       '/heroes/electricite/avatar-presenting-transparent.jpg',
    heroAlt:       'Électricien Fixeo',
    relatedSlugs:  ['plombier','chauffagiste'],
  },
  serrurier: {
    categoryKey:   'serrurerie',
    canonicalSlug: 'serrurier',
    labelSingular: 'Serrurier',
    labelPlural:   'Serruriers',
    supabaseAliases: ['Serrurerie','serrurerie','Serrurier','serrurier'],
    heroAvailable: false,
    relatedSlugs:  ['menuisier','vitrier'],
  },
  climatisation: {
    categoryKey:   'climatisation',
    canonicalSlug: 'climatisation',
    labelSingular: 'Technicien Climatisation',
    labelPlural:   'Techniciens Climatisation',
    supabaseAliases: ['Climatisation','climatisation','clim'],
    heroAvailable: false,
    relatedSlugs:  ['chauffagiste','electricien'],
  },
  menuisier: {
    categoryKey:   'menuiserie',
    canonicalSlug: 'menuisier',
    labelSingular: 'Menuisier',
    labelPlural:   'Menuisiers',
    supabaseAliases: ['Menuiserie','menuiserie','Menuisier','menuisier'],
    heroAvailable: false,
    relatedSlugs:  ['peintre','macon'],
  },
  peintre: {
    categoryKey:   'peinture',
    canonicalSlug: 'peintre',
    labelSingular: 'Peintre',
    labelPlural:   'Peintres',
    supabaseAliases: ['Peinture','peinture','Peintre','peintre'],
    heroAvailable: false,
    relatedSlugs:  ['menuisier','macon'],
  },
  macon: {
    categoryKey:   'maconnerie',
    canonicalSlug: 'macon',
    labelSingular: 'Maçon',
    labelPlural:   'Maçons',
    supabaseAliases: ['Maçonnerie','maconnerie','Macon','macon'],
    heroAvailable: false,
    relatedSlugs:  ['peintre','menuisier','carreleur'],
  },
  jardinier: {
    categoryKey:   'jardinage',
    canonicalSlug: 'jardinier',
    labelSingular: 'Jardinier',
    labelPlural:   'Jardiniers',
    supabaseAliases: ['Jardinage','jardinage','Jardinier','jardinier'],
    heroAvailable: false,
    relatedSlugs:  ['nettoyage'],
  },
  nettoyage: {
    categoryKey:   'nettoyage',
    canonicalSlug: 'nettoyage',
    labelSingular: 'Agent de nettoyage',
    labelPlural:   'Agents de nettoyage',
    supabaseAliases: ['Nettoyage','nettoyage','Agent de nettoyage','agent-nettoyage'],
    heroAvailable: false,
    relatedSlugs:  ['jardinier'],
  },
  demenagement: {
    categoryKey:   'demenagement',
    canonicalSlug: 'demenagement',
    labelSingular: 'Déménageur',
    labelPlural:   'Déménageurs',
    supabaseAliases: ['Déménagement','demenagement','Déménageur','demenageur'],
    heroAvailable: false,
    relatedSlugs:  ['macon'],
  },
  chauffagiste: {
    categoryKey:   'chauffage',
    canonicalSlug: 'chauffagiste',
    labelSingular: 'Chauffagiste',
    labelPlural:   'Chauffagistes',
    supabaseAliases: ['Chauffage','chauffage','Chauffagiste','chauffagiste'],
    heroAvailable: false,
    relatedSlugs:  ['climatisation','plombier'],
  },
  vitrier: {
    categoryKey:   'vitrerie',
    canonicalSlug: 'vitrier',
    labelSingular: 'Vitrier',
    labelPlural:   'Vitriers',
    supabaseAliases: ['Vitrerie','vitrerie','Vitrier','vitrier'],
    heroAvailable: false,
    relatedSlugs:  ['serrurier','menuisier'],
  },
  carreleur: {
    categoryKey:   'carrelage',
    canonicalSlug: 'carreleur',
    labelSingular: 'Carreleur',
    labelPlural:   'Carreleurs',
    supabaseAliases: ['Carrelage','carrelage','Carreleur','carreleur'],
    heroAvailable: false,
    relatedSlugs:  ['macon','peintre'],
  },
};

/* ══════════════════════════════════════════════════════════════════════
   SECTION B — AUTHORITATIVE CITY REGISTRY (Phase 3A.1)
   ══════════════════════════════════════════════════════════════════════ */
const CITY_REGISTRY = {
  casablanca: { label:'Casablanca', tier:1, nearbySlugs:['mohammedia','rabat','sale'] },
  rabat:      { label:'Rabat',      tier:1, nearbySlugs:['sale','temara','kenitra'] },
  marrakech:  { label:'Marrakech',  tier:1, nearbySlugs:['casablanca','safi'] },
  fes:        { label:'Fès',        tier:1, nearbySlugs:['meknes','taza'] },
  tanger:     { label:'Tanger',     tier:1, nearbySlugs:['tetouan','larache'] },
  agadir:     { label:'Agadir',     tier:1, nearbySlugs:['safi','casablanca'] },
  meknes:     { label:'Meknès',     tier:2, nearbySlugs:['fes','rabat'] },
  oujda:      { label:'Oujda',      tier:2, nearbySlugs:['nador','taza'] },
  kenitra:    { label:'Kénitra',    tier:2, nearbySlugs:['rabat','sale'] },
  temara:     { label:'Témara',     tier:2, nearbySlugs:['rabat','sale'] },
  sale:       { label:'Salé',       tier:2, nearbySlugs:['rabat','temara'] },
  mohammedia: { label:'Mohammedia', tier:2, nearbySlugs:['casablanca','sale'] },
  'el-jadida':{ label:'El Jadida',  tier:2, nearbySlugs:['casablanca','safi'] },
  'beni-mellal':{ label:'Béni Mellal', tier:2, nearbySlugs:['khouribga','casablanca'] },
  khouribga:  { label:'Khouribga',  tier:2, nearbySlugs:['beni-mellal','casablanca'] },
  safi:       { label:'Safi',       tier:2, nearbySlugs:['marrakech','agadir'] },
  nador:      { label:'Nador',      tier:2, nearbySlugs:['oujda','tanger'] },
  tetouan:    { label:'Tétouan',    tier:2, nearbySlugs:['tanger','nador'] },
  settat:     { label:'Settat',     tier:3, nearbySlugs:['casablanca','khouribga'] },
  larache:    { label:'Larache',    tier:3, nearbySlugs:['tanger','kenitra'] },
  khemisset:  { label:'Khémisset',  tier:3, nearbySlugs:['rabat','meknes'] },
  taza:       { label:'Taza',       tier:3, nearbySlugs:['fes','oujda'] },
  ouarzazate: { label:'Ouarzazate', tier:3, nearbySlugs:['marrakech','agadir'] },
};

/* ══════════════════════════════════════════════════════════════════════
   SECTION C — POC WHITELIST
   ══════════════════════════════════════════════════════════════════════ */
const POC_WHITELIST = new Set([
  'plombier-casablanca',
  'plombier-rabat',
  'electricien-casablanca',
  'electricien-rabat',
  'peintre-casablanca',
  'macon-casablanca',
]);

/* ══════════════════════════════════════════════════════════════════════
   SECTION D — PUBLIC FIELD ALLOWLIST
   phone, owner_user_id, source, experience, legacy_id: NEVER fetched.
   ══════════════════════════════════════════════════════════════════════ */
const LP_CARD_FIELDS = [
  'id',
  'name',
  'full_name',
  'city',
  'category',
  'service_category',
  'public_slug',
  'photo_url',
  'availability',
  'verified',
  'is_verified',
  'claimed',
  'price_from',
  'price_label',
  'services',
  'badge_label',
  'completed_missions',
  'response_time_min',
  'is_featured',
  'updated_at',
].join(',');

/* Lightweight fields for the count + price-quality queries */
const LP_COUNT_FIELDS = 'id,price_from';

/* ══════════════════════════════════════════════════════════════════════
   SECTION E — ESCAPING & SERIALIZATION UTILITIES
   ══════════════════════════════════════════════════════════════════════ */

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function safeJsonLD(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g,  '\\u003c')
    .replace(/>/g,  '\\u003e')
    .replace(/&/g,  '\\u0026');
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION F — SUPABASE DATA FETCHERS
   ══════════════════════════════════════════════════════════════════════

   Two queries per page load (both anon key only):

   Query 1 — COUNT + PRICE QUALITY (all eligible artisans, small fields):
     SELECT id, price_from FROM artisans
     WHERE category IN (aliases) AND city ILIKE cityLabel
     LIMIT 1000          ← effectively unbounded for Moroccan cities
     → used for: totalCount, priceQualityCheck (# records with price_from > 0)

   Query 2 — DISPLAY CARDS (top 12 artisans for visible cards):
     SELECT <full field list> FROM artisans
     WHERE category IN (aliases) AND city ILIKE cityLabel
     ORDER BY is_featured DESC, response_time_min ASC
     LIMIT 12
     → used for: rendered <li> cards

   Both returned simultaneously via Promise.all.
   ══════════════════════════════════════════════════════════════════════ */

function buildOrClause(aliases) {
  return aliases.map(a => 'category.eq.' + encodeURIComponent(a)).join(',');
}

function buildCityFilter(cityLabel) {
  return 'city=ilike.' + encodeURIComponent(cityLabel);
}

async function supabaseFetch(url) {
  const resp = await fetch(url, {
    headers: {
      apikey:        SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Accept:        'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error('supabase_error_' + resp.status);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch both count+price data and display cards in parallel.
 * Returns:
 *   { totalCount, priceRecordCount, artisans, error }
 * On Supabase failure:
 *   { totalCount:null, priceRecordCount:null, artisans:null, error:'network'|'supabase' }
 */
async function fetchPageData(service, cityLabel) {
  const orClause   = buildOrClause(service.supabaseAliases);
  const cityFilter = buildCityFilter(cityLabel);
  const baseQuery  = `${SUPABASE_URL}/rest/v1/artisans?or=(${orClause})&${cityFilter}`;

  const countUrl = `${baseQuery}&select=${encodeURIComponent(LP_COUNT_FIELDS)}&limit=1000`;
  const cardsUrl = `${baseQuery}&select=${encodeURIComponent(LP_CARD_FIELDS)}` +
                   `&order=is_featured.desc,response_time_min.asc&limit=12`;

  try {
    const [countData, cardsData] = await Promise.all([
      supabaseFetch(countUrl),
      supabaseFetch(cardsUrl),
    ]);

    const totalCount      = countData.length;
    const priceRecordCount = countData.filter(r => Number(r.price_from) > 0).length;

    return { totalCount, priceRecordCount, artisans: cardsData, error: null };

  } catch (err) {
    console.error('[lp] Supabase fetch error:', err.message);
    const errKind = err.message.startsWith('supabase_error') ? 'supabase' : 'network';
    return { totalCount: null, priceRecordCount: null, artisans: null, error: errKind };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION G — SAFE COPY GENERATORS
   All copy is derived from real Supabase values only.
   No marketing claims without data backing.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Title phrase — uses TOTAL count (all eligible artisans), not displayed count.
 * Returns null when count is 0 (page will be 404'd before this runs).
 */
function totalCountPhrase(totalCount, labelPlural, labelSingular) {
  if (totalCount === 0) return null;
  if (totalCount === 1) return `1 ${labelSingular} référencé`;
  return `${totalCount} ${labelPlural} référencés`;
}

/**
 * Price range phrase — CORRECTION 2: requires >= 3 distinct records with
 * price_from > 0 across the FULL eligible artisan set (priceRecordCount).
 * priceValues is the array of actual price_from values from the 12 displayed cards,
 * used only for the min/max range calculation when the threshold is met.
 * Returns null when threshold is not met.
 */
function priceRangePhrase(priceRecordCount, displayedArtisans) {
  if (priceRecordCount < 3) return null;   /* quality gate: < 3 records → no price copy */

  const prices = displayedArtisans
    .map(a => Number(a.price_from))
    .filter(p => p > 0);
  if (prices.length === 0) return null;

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  if (minP === maxP) return `À partir de ${minP}\u202fDH`;
  return `Entre ${minP}\u202fDH et ${maxP}\u202fDH`;
}

function verifiedPhrase(artisans) {
  const count = artisans.filter(
    a => a.is_verified === true || a.verified === true
  ).length;
  if (count === 0) return null;
  if (count === 1) return `1 profil vérifié`;
  return `${count} profils vérifiés`;
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION H — ARTISAN CARD RENDERER
   ══════════════════════════════════════════════════════════════════════ */

const LP_PHOTO_ALLOWLIST = new Set([
  'ztwtbgoqanqzvwiibtuh.supabase.co',
  'fixeo.ma',
  'www.fixeo.ma',
]);
const ALLOWED_IMG_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.avif']);
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

function validatePhotoUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try { decodeURIComponent(trimmed); } catch(_) { return null; }
  const low = trimmed.toLowerCase();
  if (low.startsWith('data:') || low.startsWith('javascript:') ||
      low.startsWith('vbscript:') || low.startsWith('blob:')) return null;
  let parsed;
  try { parsed = new URL(trimmed); } catch(_) { return null; }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol !== 'https:') return null;
  if (parsed.port !== '') return null;
  const host = parsed.hostname.toLowerCase();
  if (!LP_PHOTO_ALLOWLIST.has(host)) return null;
  if (PRIVATE_IP_RE.test(host) || host === 'localhost' || host === '::1') return null;
  const lpath = parsed.pathname.toLowerCase();
  const dot = lpath.lastIndexOf('.');
  if (dot === -1) return null;
  if (!ALLOWED_IMG_EXTS.has(lpath.slice(dot))) return null;
  return trimmed;
}

function renderArtisanCard(artisan, serviceSlug) {
  const rawName = String(artisan.name || artisan.full_name || '');
  const rawSlug = String(artisan.public_slug || '');

  const validPhoto = validatePhotoUrl(artisan.photo_url);
  let avatarHtml;
  if (validPhoto) {
    avatarHtml = `<img class="lp-card-avatar"
         src="${esc(validPhoto)}"
         alt="${esc(rawName)}"
         width="64" height="64"
         loading="lazy"
         decoding="async"
         onerror="this.style.display='none'">`;
  } else {
    const initials = rawName.split(/\s+/).map(w => w[0] || '').join('').slice(0,2).toUpperCase();
    avatarHtml = `<div class="lp-card-initials" aria-hidden="true">${esc(initials)}</div>`;
  }

  const isAvail = artisan.availability === 'available';
  const availBadge = isAvail
    ? `<span class="lp-badge lp-badge--avail">Disponible</span>`
    : '';

  const isVerified = artisan.is_verified === true || artisan.verified === true;
  const verifBadge = isVerified
    ? `<span class="lp-badge lp-badge--verif">Profil vérifié</span>`
    : '';

  const price = Number(artisan.price_from);
  const priceHtml = price > 0
    ? `<span class="lp-card-price">À partir de ${price}\u202fDH</span>`
    : '';

  const profileUrl = rawSlug ? `https://www.fixeo.ma/artisan/${rawSlug}` : null;

  return `<li class="lp-card" itemscope itemtype="https://schema.org/ProfessionalService">
    <meta itemprop="serviceType" content="${esc(serviceSlug)}">
    ${rawSlug ? `<meta itemprop="url" content="https://www.fixeo.ma/artisan/${esc(rawSlug)}">` : ''}
    ${avatarHtml}
    <div class="lp-card-body">
      <p class="lp-card-name">${esc(rawName)}</p>
      <div class="lp-card-badges">${availBadge}${verifBadge}</div>
      ${priceHtml}
    </div>
    ${profileUrl ? `<a class="lp-card-link" href="${esc(profileUrl)}" aria-label="Voir le profil de ${esc(rawName)}">Voir le profil →</a>` : ''}
  </li>`;
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION I — RELATED PAGES LINK GENERATOR
   ══════════════════════════════════════════════════════════════════════ */

function buildRelatedLinks(serviceSlug, citySlug, service) {
  const links = [];

  for (const key of POC_WHITELIST) {
    if (key === `${serviceSlug}-${citySlug}`) continue;
    const dashIdx = key.indexOf('-');
    const s = key.slice(0, dashIdx);
    const c = key.slice(dashIdx + 1);
    if (s === serviceSlug) {
      const city = CITY_REGISTRY[c];
      if (city) {
        links.push({ href: `https://www.fixeo.ma/${key}`, text: `${service.labelPlural} à ${city.label}` });
      }
    }
  }

  for (const relSlug of (service.relatedSlugs || [])) {
    const relKey = `${relSlug}-${citySlug}`;
    if (POC_WHITELIST.has(relKey)) {
      const relService = SERVICE_REGISTRY[relSlug];
      const city = CITY_REGISTRY[citySlug];
      if (relService && city) {
        links.push({ href: `https://www.fixeo.ma/${relKey}`, text: `${relService.labelPlural} à ${city.label}` });
      }
    }
  }

  return links.slice(0, 6);
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION J — HTML PAGE BUILDER
   ══════════════════════════════════════════════════════════════════════ */

function buildLpHtml(service, city, citySlug, totalCount, priceRecordCount, artisans) {
  const svcSlug     = service.canonicalSlug;
  const cityName    = city.label;
  const displayedN  = artisans.length;   /* cards actually rendered on page */

  /* ── Safe copy — correction 1: title uses totalCount, not displayedN ── */
  const rawTotalPhrase   = totalCountPhrase(totalCount, service.labelPlural, service.labelSingular);
  const rawPricePhrase   = priceRangePhrase(priceRecordCount, artisans);
  const rawVerifPhrase   = verifiedPhrase(artisans);

  /* ── Canonical URL ── */
  const canonicalUrl = `https://www.fixeo.ma/${svcSlug}-${citySlug}`;

  /* ── Title — uses totalCount phrase, no price (clean and stable) ── */
  const titleRaw = `${service.labelPlural} à ${cityName} — ${rawTotalPhrase} | Fixeo`;

  /* ── Meta description ── */
  const metaDescParts = [
    `Consultez les profils de ${service.labelSingular.toLowerCase()} à ${cityName} sur Fixeo.`,
    rawTotalPhrase ? `${rawTotalPhrase} référencés.` : null,
    rawVerifPhrase ? `${rawVerifPhrase}.` : null,
    rawPricePhrase ? `Tarifs\u202f: ${rawPricePhrase}.` : null,
  ];
  const metaDescRaw = metaDescParts.filter(Boolean).join(' ');

  /* ── CORRECTION 3: Hero image policy ──
     heroAvailable: true  → full hero img above fold, hero as og:image
     heroAvailable: false → NO image element at all, not even RAFI;
                            og:image = FIXEO_OG_IMAGE (logo.png, 18 KB)
     The RAFI_V2_BlackSilhouette.png (2.8 MB) is NOT loaded on any LP page.
  ── */
  const hasHero = service.heroAvailable;

  const heroImgHtml = hasHero
    ? `<img class="lp-hero-img"
            src="${esc(service.heroUrl)}"
            alt="${esc(service.heroAlt)} à ${esc(cityName)}"
            width="200" height="200"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            onerror="this.style.display='none'">`
    : `<!-- no hero image for this service category -->`;

  /* og:image — hero for plomberie/electricite, logo.png for all others */
  const ogImageUrl = hasHero
    ? `https://www.fixeo.ma${service.heroUrl}`
    : FIXEO_OG_IMAGE;

  /* ── Artisan cards ── */
  const cardsHtml = artisans.map(a => renderArtisanCard(a, svcSlug)).join('\n    ');

  /* ── Count summary — clearly distinguishes total vs displayed ── */
  /* Only rendered when totalCount > displayedN (pagination context matters) */
  let countSummaryHtml = '';
  if (rawTotalPhrase) {
    if (displayedN < totalCount) {
      /* Both numbers present and different — label them explicitly */
      countSummaryHtml = `
    <p class="lp-count-summary">
      <strong>${totalCount} profils référencés</strong> à ${esc(cityName)}.
      <span class="lp-count-displayed">${displayedN} profils affichés.</span>
    </p>`;
    } else {
      /* Total equals displayed (e.g. 4 macon-casablanca) — single label */
      countSummaryHtml = `
    <p class="lp-count-summary">
      <strong>${totalCount} profil${totalCount > 1 ? 's' : ''} référencé${totalCount > 1 ? 's' : ''}</strong> à ${esc(cityName)}.
    </p>`;
    }
  }

  /* ── Price summary — only when quality gate passes (>= 3 records) ── */
  const priceSummaryHtml = rawPricePhrase
    ? `<p class="lp-price-summary">${esc(rawPricePhrase)}</p>`
    : '';

  /* ── Related links ── */
  const related = buildRelatedLinks(svcSlug, citySlug, service);
  const relLinksHtml = related.length
    ? `<nav class="lp-related" aria-label="Pages connexes">
        <h2 class="lp-related-title">Voir aussi</h2>
        <ul class="lp-related-list">
          ${related.map(l => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('\n          ')}
        </ul>
      </nav>`
    : '';

  /* ── JSON-LD ──
     numberOfItems = totalCount (all eligible artisans, not just the 12 displayed).
     itemListElement = up to 10 items from displayed artisans (real data).
     No price/Offer schema: prices are seed-quality data (all 150 DH) —
       priceRangePhrase gate applies same logic to JSON-LD.
  ── */
  const itemListItems = artisans.slice(0, 10).map((a, i) => {
    const rawName = String(a.name || a.full_name || '');
    const rawSlug = String(a.public_slug || '');
    const item = {
      '@type':       'ProfessionalService',
      'name':        rawName,
      'areaServed':  { '@type': 'City', 'name': cityName },
      'serviceType': service.labelSingular,
    };
    if (rawSlug) item['url'] = `https://www.fixeo.ma/artisan/${rawSlug}`;
    return { '@type': 'ListItem', 'position': i + 1, 'item': item };
  });

  const jsonLdObj = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type':           'ItemList',
        'name':            `${service.labelPlural} à ${cityName}`,
        'description':     metaDescRaw,
        'url':             canonicalUrl,
        'numberOfItems':   totalCount,    /* CORRECTION 1: total, not displayed */
        'itemListElement': itemListItems,
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type':'ListItem', 'position':1, 'name':'Fixeo',
            'item':'https://www.fixeo.ma/' },
          { '@type':'ListItem', 'position':2, 'name':service.labelPlural,
            'item':`https://www.fixeo.ma/${svcSlug}` },
          { '@type':'ListItem', 'position':3, 'name':`${service.labelPlural} à ${cityName}`,
            'item': canonicalUrl },
        ],
      },
      {
        '@type':       'WebPage',
        '@id':         canonicalUrl,
        'url':         canonicalUrl,
        'name':        titleRaw,
        'description': metaDescRaw,
        'inLanguage':  'fr-MA',
        'isPartOf':    { '@id': 'https://www.fixeo.ma/#website' },
      },
    ],
  };

  /* ── Full HTML ── */
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${esc(titleRaw)}</title>
  <meta name="description" content="${esc(metaDescRaw)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">

  <meta property="og:type"         content="website">
  <meta property="og:title"        content="${esc(titleRaw)}">
  <meta property="og:description"  content="${esc(metaDescRaw)}">
  <meta property="og:url"          content="${canonicalUrl}">
  <meta property="og:image"        content="${esc(ogImageUrl)}">
  <meta property="og:image:alt"    content="${esc(service.labelSingular)} à ${esc(cityName)} — Fixeo">
  <meta property="og:locale"       content="fr_MA">
  <meta property="og:site_name"    content="Fixeo">

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="@FixeoMaroc">
  <meta name="twitter:title"       content="${esc(titleRaw)}">
  <meta name="twitter:description" content="${esc(metaDescRaw)}">
  <meta name="twitter:image"       content="${esc(ogImageUrl)}">

  <script type="application/ld+json">
${safeJsonLD(jsonLdObj)}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  ${hasHero ? `<link rel="preload" as="image" href="${esc(service.heroUrl)}">` : ''}

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; }
    body {
      font-family: 'Cairo', Arial, sans-serif;
      background: linear-gradient(135deg, #0D0D1A 0%, #1a1a2e 50%, #16213e 100%);
      color: #e8eaf0;
      min-height: 100vh;
      line-height: 1.65;
    }
    a { color: #E1306C; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; }
    .lp-page { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }

    /* ── Breadcrumb ── */
    .lp-breadcrumb {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      font-size: 0.82rem; color: rgba(255,255,255,0.5);
      margin-bottom: 28px;
    }
    .lp-breadcrumb a { color: rgba(255,255,255,0.65); }
    .lp-breadcrumb a:hover { color: #E1306C; }
    .lp-breadcrumb-sep { color: rgba(255,255,255,0.3); }

    /* ── Hero section ── */
    .lp-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 40px 24px 32px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      margin-bottom: 28px;
    }
    .lp-hero-img {
      width: 160px; height: 160px;
      object-fit: contain;
      object-position: center bottom;
      margin-bottom: 20px;
    }
    .lp-hero-h1 {
      font-size: clamp(1.5rem, 4vw, 2.1rem);
      font-weight: 800;
      color: #fff;
      line-height: 1.2;
      margin-bottom: 12px;
    }
    .lp-hero-desc {
      font-size: 1rem;
      color: rgba(255,255,255,0.65);
      max-width: 560px;
      margin-bottom: 16px;
    }
    .lp-count-summary {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.7);
      margin-bottom: 6px;
    }
    .lp-count-displayed {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.45);
      margin-left: 6px;
    }
    .lp-price-summary {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.6);
      margin-bottom: 6px;
    }
    .lp-hero-meta {
      display: flex; flex-wrap: wrap; gap: 10px;
      justify-content: center;
      font-size: 0.88rem;
      margin-bottom: 20px;
    }
    .lp-hero-meta-item {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px;
      padding: 5px 14px;
      color: rgba(255,255,255,0.8);
    }
    .lp-cta {
      display: inline-block;
      margin-top: 8px;
      padding: 14px 32px;
      background: linear-gradient(135deg,#E1306C,#C13584);
      color: #fff;
      font-weight: 700;
      font-size: 1rem;
      border-radius: 16px;
      text-decoration: none;
    }
    .lp-cta:hover { opacity: 0.9; text-decoration: none; color: #fff; }

    /* ── Section titles ── */
    .lp-section { margin-bottom: 32px; }
    .lp-section-title {
      font-size: 1.2rem; font-weight: 700;
      color: #fff; margin-bottom: 16px;
      border-left: 3px solid #E1306C;
      padding-left: 12px;
    }

    /* ── Artisan cards ── */
    .lp-cards { display: flex; flex-direction: column; gap: 12px; }
    .lp-card {
      display: flex; align-items: center; gap: 14px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.11);
      border-radius: 16px;
      padding: 16px 18px;
    }
    .lp-card-avatar {
      width: 56px; height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(225,48,108,0.4);
      flex-shrink: 0;
    }
    .lp-card-initials {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg,#E1306C,#C13584);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.2rem; color: #fff;
      flex-shrink: 0;
    }
    .lp-card-body { flex: 1; min-width: 0; }
    .lp-card-name { font-weight: 700; color: #fff; font-size: 1rem; margin-bottom: 4px; }
    .lp-card-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
    .lp-badge {
      font-size: 0.72rem; font-weight: 600;
      border-radius: 999px; padding: 2px 10px;
    }
    .lp-badge--avail {
      background: rgba(32,201,151,0.16); color: #20c997;
      border: 1px solid rgba(32,201,151,0.3);
    }
    .lp-badge--verif {
      background: rgba(64,93,230,0.16); color: #7fa2f0;
      border: 1px solid rgba(64,93,230,0.3);
    }
    .lp-card-price { font-size: 0.85rem; color: rgba(255,255,255,0.6); }
    .lp-card-link {
      font-size: 0.83rem; font-weight: 600;
      color: #E1306C; white-space: nowrap;
      padding: 7px 14px;
      border: 1px solid rgba(225,48,108,0.35);
      border-radius: 10px;
      flex-shrink: 0;
    }
    .lp-card-link:hover { background: rgba(225,48,108,0.08); text-decoration: none; }

    /* ── Related links ── */
    .lp-related {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 16px;
      padding: 20px 24px;
      margin-top: 8px;
    }
    .lp-related-title {
      font-size: 0.82rem; text-transform: uppercase;
      letter-spacing: 0.08em; color: rgba(255,255,255,0.4);
      margin-bottom: 12px; font-weight: 600;
    }
    .lp-related-list { display: flex; flex-direction: column; gap: 8px; }
    .lp-related-list a { font-size: 0.9rem; color: rgba(255,255,255,0.6); }
    .lp-related-list a:hover { color: #E1306C; }

    /* ── Footer ── */
    .lp-footer {
      margin-top: 56px; text-align: center;
      font-size: 0.78rem; color: rgba(255,255,255,0.28);
    }
    .lp-footer a { color: rgba(255,255,255,0.38); }

    @media (max-width: 520px) {
      .lp-page { padding: 16px 12px 48px; }
      .lp-hero { padding: 28px 16px; }
      .lp-card { flex-wrap: wrap; }
      .lp-card-link { margin-top: 8px; }
    }
  </style>
</head>
<body>
<main class="lp-page" role="main">

  <!-- Breadcrumb -->
  <nav class="lp-breadcrumb" aria-label="Fil d'Ariane">
    <a href="https://www.fixeo.ma/">Fixeo</a>
    <span class="lp-breadcrumb-sep" aria-hidden="true">›</span>
    <span>${esc(service.labelPlural)} à ${esc(cityName)}</span>
  </nav>

  <!-- Hero section -->
  <section class="lp-hero" aria-labelledby="lp-h1">
    ${heroImgHtml}
    <h1 class="lp-hero-h1" id="lp-h1">${esc(service.labelPlural)} à ${esc(cityName)}</h1>
    <p class="lp-hero-desc">
      Consultez les profils référencés sur Fixeo à ${esc(cityName)}.
    </p>
    ${countSummaryHtml}
    ${priceSummaryHtml}
    <div class="lp-hero-meta">
      ${rawVerifPhrase ? `<span class="lp-hero-meta-item">${esc(rawVerifPhrase)}</span>` : ''}
    </div>
    <a href="https://www.fixeo.ma/?open=request&amp;service=${esc(svcSlug)}&amp;city=${esc(citySlug)}"
       class="lp-cta" rel="nofollow">
      Demander une intervention →
    </a>
  </section>

  <!-- Artisan listing -->
  <section class="lp-section" aria-labelledby="lp-artisans-title">
    <h2 class="lp-section-title" id="lp-artisans-title">
      ${esc(service.labelPlural)} disponibles à ${esc(cityName)}
    </h2>
    <ul class="lp-cards">
      ${cardsHtml}
    </ul>
  </section>

  <!-- Why Fixeo -->
  <section class="lp-section" aria-labelledby="lp-why-title">
    <h2 class="lp-section-title" id="lp-why-title">Pourquoi passer par Fixeo ?</h2>
    <ul style="display:flex;flex-direction:column;gap:10px;padding-left:0;">
      <li style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;font-size:0.92rem;color:rgba(255,255,255,0.75);">
        Profils publiés et maintenus par les artisans eux-mêmes
      </li>
      <li style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;font-size:0.92rem;color:rgba(255,255,255,0.75);">
        Mise en relation directe — sans intermédiaire
      </li>
      <li style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;font-size:0.92rem;color:rgba(255,255,255,0.75);">
        Garantie Fixeo sur les interventions réservées via la plateforme —
        <a href="https://www.fixeo.ma/nos-garanties">voir nos garanties</a>
      </li>
    </ul>
  </section>

  <!-- Related pages -->
  ${relLinksHtml}

  <p style="margin-top:24px;font-size:0.85rem;">
    <a href="https://www.fixeo.ma/">← Retour à Fixeo.ma</a>
  </p>

  <footer class="lp-footer" role="contentinfo">
    <p>Page publiée sur <a href="https://www.fixeo.ma/">Fixeo.ma</a> — Annuaire d'artisans au Maroc.</p>
    <p style="margin-top:6px">
      <a href="https://www.fixeo.ma/nos-garanties">Nos garanties</a> ·
      <a href="https://www.fixeo.ma/comment-ca-marche">Comment ça marche</a> ·
      <a href="https://www.fixeo.ma/verification-artisans">Vérification artisans</a>
    </p>
  </footer>

</main>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION K — ERROR PAGE BUILDERS
   ══════════════════════════════════════════════════════════════════════ */

function build404Html(slug) {
  const safeSlug = esc(slug || '');
  return `<!DOCTYPE html><html lang="fr"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Page introuvable | Fixeo</title>
  <meta name="robots" content="noindex, follow">
  <style>
    body{font-family:sans-serif;background:#0D0D1A;color:#e8eaf0;display:flex;
         align-items:center;justify-content:center;min-height:100vh;margin:0}
    .b{max-width:440px;text-align:center;padding:48px 24px;border:1px solid rgba(255,255,255,.1);border-radius:20px}
    h1{font-size:1.3rem;margin-bottom:12px}
    p{color:rgba(255,255,255,.55);font-size:.9rem;margin-bottom:24px;line-height:1.6}
    a{display:inline-block;padding:11px 26px;background:linear-gradient(135deg,#E1306C,#C13584);
      color:#fff;border-radius:12px;font-weight:700;text-decoration:none}
  </style>
</head><body>
  <div class="b">
    <h1>Page introuvable</h1>
    <p>La page <strong>${safeSlug}</strong> n'existe pas sur Fixeo.</p>
    <a href="https://www.fixeo.ma/">Retour à l'accueil →</a>
  </div>
</body></html>`;
}

function build503Html() {
  return `<!DOCTYPE html><html lang="fr"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Service temporairement indisponible | Fixeo</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    body{font-family:sans-serif;background:#0D0D1A;color:#e8eaf0;display:flex;
         align-items:center;justify-content:center;min-height:100vh;margin:0}
    .b{max-width:440px;text-align:center;padding:48px 24px;border:1px solid rgba(255,255,255,.1);border-radius:20px}
    h1{font-size:1.25rem;margin-bottom:12px}
    p{color:rgba(255,255,255,.5);font-size:.88rem;line-height:1.6}
  </style>
</head><body>
  <div class="b">
    <h1>Service temporairement indisponible</h1>
    <p>Problème technique momentané. Veuillez réessayer dans quelques secondes.</p>
  </div>
</body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION L — VERCEL REQUEST HANDLER
   ══════════════════════════════════════════════════════════════════════ */

const LP_SLUG_RE = /^[a-z][a-z0-9-]{3,60}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end('Method Not Allowed');
    return;
  }

  const rawSlug = String(req.query.slug || '').trim().toLowerCase();

  if (!rawSlug || !LP_SLUG_RE.test(rawSlug)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400).send(build404Html(rawSlug));
    return;
  }

  if (!POC_WHITELIST.has(rawSlug)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(build404Html(rawSlug));
    return;
  }

  /* Parse service + city from combined slug */
  let serviceSlug = null;
  let citySlug    = null;
  for (const sKey of Object.keys(SERVICE_REGISTRY)) {
    if (rawSlug.startsWith(sKey + '-')) {
      serviceSlug = sKey;
      citySlug    = rawSlug.slice(sKey.length + 1);
      break;
    }
  }

  const service = serviceSlug ? SERVICE_REGISTRY[serviceSlug] : null;
  const city    = citySlug    ? CITY_REGISTRY[citySlug]       : null;

  if (!service || !city) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(build404Html(rawSlug));
    return;
  }

  /* Fetch both count+price quality and display cards in parallel */
  const { totalCount, priceRecordCount, artisans, error } =
    await fetchPageData(service, city.label);

  if (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(503).send(build503Html());
    return;
  }

  /* Eligibility gate — uses totalCount (not displayed cards) */
  if (totalCount === 0) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(build404Html(rawSlug));
    return;
  }

  const html = buildLpHtml(service, city, citySlug, totalCount, priceRecordCount, artisans);

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('Content-Type',  'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag',  'index, follow');
  res.setHeader('X-LP-Slug',     rawSlug);
  res.setHeader('X-LP-Total',    String(totalCount));
  res.setHeader('X-LP-Displayed',String(artisans.length));

  res.status(200).send(html);
};
