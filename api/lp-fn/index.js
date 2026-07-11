/*!
 * api/lp-fn/index.js — Vercel Serverless Function
 * SEO Phase 3C — SSR Local Landing Page Engine (Production Expansion)
 *
 * Route:  GET /{service}-{city}
 * Branch: feat/seo-phase3c-lp-expansion
 *
 * Phase 3C changes vs Phase 3B.1:
 *   1. POC_WHITELIST removed — replaced by PHASE3C_SCOPE (8 services × 6 Tier-1 cities).
 *      Dynamic eligibility gate (totalCount >= 1) still controls HTTP 200/404.
 *      Any slug outside PHASE3C_SCOPE still returns HTTP 404.
 *   2. Expanded scope:
 *      Services:   plombier, electricien, serrurier, climatisation,
 *                  menuisier, peintre, macon, nettoyage
 *      Cities:     Casablanca, Rabat, Fès, Tanger, Marrakech, Agadir
 *      Eligible (totalCount >= 1): 40 pages (8 zero-artisan combos → 404)
 *   3. Enhanced related links — buildRelatedLinks() now links to:
 *      - All other eligible services in the same city (within scope)
 *      - Same service in all other cities (within scope)
 *      No longer limited to the 6 POC whitelist entries.
 *   4. Production sitemap (sitemap-lp.xml) replaces sitemap-lp-poc.xml.
 *      Sitemap is static (generated at commit time from live eligibility audit).
 *      Contains only HTTP 200 combinations confirmed live.
 *
 * All Phase 3B.1 corrections remain in force:
 *   - Two Supabase queries per page (count + cards, Promise.all)
 *   - Price quality gate: priceRecordCount >= 3 (full eligible set)
 *   - Zero RAFI on any LP page. No hero image for non-hero services.
 *   - og:image for no-hero pages → /img/logo.png
 *   - 301 redirects for legacy .html URLs
 *   - Counts: title uses totalCount; visible copy distinguishes total vs displayed
 *   - anon key only; explicit field allowlist; private fields never fetched
 *
 * Page eligibility gate:
 *   totalCount >= 1 → HTTP 200 (indexable)
 *   totalCount == 0 → HTTP 404 (do not index empty pages)
 *   slug outside PHASE3C_SCOPE → HTTP 404
 *   malformed slug → HTTP 400
 *
 * Cache:
 *   200: s-maxage=86400, stale-while-revalidate=3600
 *   4xx/5xx: no-store
 */

'use strict';

/* ── Supabase credentials (anon key only — never service_role) ── */
const SUPABASE_URL  = 'https://ztwtbgoqanqzvwiibtuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

/*
 * FIXEO brand image — og:image fallback for services without a dedicated hero.
 * /img/logo.png: HTTP 200, 17,594 bytes, already used site-wide as OG fallback.
 * Never replace with RAFI assets on LP pages.
 */
const FIXEO_OG_IMAGE = 'https://www.fixeo.ma/img/logo.png';

/* ══════════════════════════════════════════════════════════════════════
   SECTION A — AUTHORITATIVE SERVICE REGISTRY (Phase 3A.1, extended 3C)
   ══════════════════════════════════════════════════════════════════════
   Locked taxonomy. Never rename canonical slugs after indexation.
   heroAvailable: true  → full hero above fold + hero as og:image
   heroAvailable: false → text-first, NO image element at all (Phase 3B.1 correction 3)
   ══════════════════════════════════════════════════════════════════════ */
const SERVICE_REGISTRY = {
  plombier: {
    categoryKey:     'plomberie',
    canonicalSlug:   'plombier',
    labelSingular:   'Plombier',
    labelPlural:     'Plombiers',
    supabaseAliases: ['Plomberie','plomberie','Plombier','plombier'],
    heroAvailable:   true,
    heroUrl:         '/heroes/plomberie/avatar-presenting-transparent.jpg',
    heroAlt:         'Plombier Fixeo',
    relatedSlugs:    ['electricien','serrurier','macon'],
  },
  electricien: {
    categoryKey:     'electricite',
    canonicalSlug:   'electricien',
    labelSingular:   'Électricien',
    labelPlural:     'Électriciens',
    supabaseAliases: [
      'Électricité','electricite','Electricite',
      'electricien','Electricien','electricite_generale',
    ],
    heroAvailable:   true,
    heroUrl:         '/heroes/electricite/avatar-presenting-transparent.jpg',
    heroAlt:         'Électricien Fixeo',
    relatedSlugs:    ['plombier','climatisation','serrurier'],
  },
  serrurier: {
    categoryKey:     'serrurerie',
    canonicalSlug:   'serrurier',
    labelSingular:   'Serrurier',
    labelPlural:     'Serruriers',
    supabaseAliases: ['Serrurerie','serrurerie','Serrurier','serrurier'],
    heroAvailable:   false,
    relatedSlugs:    ['menuisier','plombier','electricien'],
  },
  climatisation: {
    categoryKey:     'climatisation',
    canonicalSlug:   'climatisation',
    labelSingular:   'Technicien Climatisation',
    labelPlural:     'Techniciens Climatisation',
    supabaseAliases: ['Climatisation','climatisation','clim'],
    heroAvailable:   false,
    relatedSlugs:    ['electricien','plombier'],
  },
  menuisier: {
    categoryKey:     'menuiserie',
    canonicalSlug:   'menuisier',
    labelSingular:   'Menuisier',
    labelPlural:     'Menuisiers',
    supabaseAliases: ['Menuiserie','menuiserie','Menuisier','menuisier'],
    heroAvailable:   false,
    relatedSlugs:    ['peintre','macon','serrurier'],
  },
  peintre: {
    categoryKey:     'peinture',
    canonicalSlug:   'peintre',
    labelSingular:   'Peintre',
    labelPlural:     'Peintres',
    supabaseAliases: ['Peinture','peinture','Peintre','peintre'],
    heroAvailable:   false,
    relatedSlugs:    ['menuisier','macon'],
  },
  macon: {
    categoryKey:     'maconnerie',
    canonicalSlug:   'macon',
    labelSingular:   'Maçon',
    labelPlural:     'Maçons',
    supabaseAliases: ['Maçonnerie','maconnerie','Macon','macon'],
    heroAvailable:   false,
    relatedSlugs:    ['peintre','menuisier'],
  },
  nettoyage: {
    categoryKey:     'nettoyage',
    canonicalSlug:   'nettoyage',
    labelSingular:   'Agent de nettoyage',
    labelPlural:     'Agents de nettoyage',
    supabaseAliases: ['Nettoyage','nettoyage','Agent de nettoyage','agent-nettoyage'],
    heroAvailable:   false,
    relatedSlugs:    ['menuisier','peintre'],
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
   SECTION C — PHASE 3C SCOPE
   ══════════════════════════════════════════════════════════════════════
   Replaces Phase 3B POC_WHITELIST.
   Any slug outside this set returns HTTP 404 immediately (no Supabase call).
   Dynamic eligibility gate (totalCount >= 1) still applies within this set.

   Approved services (8):
     plombier, electricien, serrurier, climatisation,
     menuisier, peintre, macon, nettoyage

   Approved cities (6, Tier 1 only):
     casablanca, rabat, fes, tanger, marrakech, agadir

   Live eligibility (confirmed from Supabase 2026-07-10):
     40 eligible / 48 total (8 zero-artisan combos → HTTP 404)

   Zero-artisan combinations (→ HTTP 404, not in sitemap):
     serrurier-fes, serrurier-agadir
     climatisation-fes, climatisation-agadir
     macon-fes, macon-agadir
     peintre-agadir
     nettoyage-fes
   ══════════════════════════════════════════════════════════════════════ */
const PHASE3C_SERVICES = new Set([
  'plombier','electricien','serrurier','climatisation',
  'menuisier','peintre','macon','nettoyage',
]);

const PHASE3C_CITIES = new Set([
  'casablanca','rabat','fes','tanger','marrakech','agadir',
]);

/* Pre-computed set of all 48 scope slugs for O(1) lookup */
const PHASE3C_SCOPE = new Set();
for (const s of PHASE3C_SERVICES) {
  for (const c of PHASE3C_CITIES) {
    PHASE3C_SCOPE.add(`${s}-${c}`);
  }
}

/*
 * Known-zero combinations — confirmed 0 artisans from live Supabase audit (2026-07-10).
 * These slugs are within PHASE3C_SCOPE (handler accepts them, returns 404 dynamically),
 * but must NOT appear in related links or the production sitemap.
 * When new artisans are added to Supabase for these cities/services, remove from this set.
 */
const PHASE3C_ZERO_COMBOS = new Set([
  'serrurier-fes',
  'serrurier-agadir',
  'climatisation-fes',
  'climatisation-agadir',
  'macon-fes',
  'macon-agadir',
  'peintre-agadir',
  'nettoyage-fes',
]);

/* Eligible set = scope minus known-zero combos — use for internal links */
const PHASE3C_ELIGIBLE = new Set(
  [...PHASE3C_SCOPE].filter(slug => !PHASE3C_ZERO_COMBOS.has(slug))
);

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
     LIMIT 1000
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
 * Returns: { totalCount, priceRecordCount, artisans, error }
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

    const totalCount       = countData.length;
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
 */
function totalCountPhrase(totalCount, labelPlural, labelSingular) {
  if (totalCount === 0) return null;
  if (totalCount === 1) return `1 ${labelSingular} référencé`;
  return `${totalCount} ${labelPlural} référencés`;
}

/**
 * Price range phrase — requires >= 3 distinct records with price_from > 0
 * across the FULL eligible artisan set (priceRecordCount).
 * Range computed from displayed artisans only (max 12).
 */
function priceRangePhrase(priceRecordCount, displayedArtisans) {
  if (priceRecordCount < 3) return null;

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
const ALLOWED_IMG_EXTS  = new Set(['.jpg','.jpeg','.png','.webp','.avif']);
const PRIVATE_IP_RE     = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

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
  const dot   = lpath.lastIndexOf('.');
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

  const isAvail    = artisan.availability === 'available';
  const availBadge = isAvail
    ? `<span class="lp-badge lp-badge--avail">Disponible</span>`
    : '';

  const isVerified = artisan.is_verified === true || artisan.verified === true;
  const verifBadge = isVerified
    ? `<span class="lp-badge lp-badge--verif">Profil vérifié</span>`
    : '';

  const price     = Number(artisan.price_from);
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
   SECTION I — RELATED PAGES LINK GENERATOR (Phase 3C — expanded)
   ══════════════════════════════════════════════════════════════════════
   Phase 3C strategy (no orphan pages):
   1. Same service, other Tier 1 cities (within PHASE3C_SCOPE)
   2. Related services in the same city (via service.relatedSlugs, within scope)
   3. Homepage + trust pages always in footer (not here — handled in HTML)
   4. Artisan profile pages linked via card "Voir le profil →" buttons (Section H)

   Max 8 links returned (avoid link-stuffing).
   ══════════════════════════════════════════════════════════════════════ */

function buildRelatedLinks(serviceSlug, citySlug, service) {
  const links = [];
  const currentCity = CITY_REGISTRY[citySlug];
  const currentService = SERVICE_REGISTRY[serviceSlug];

  /* 1. Same service, other Tier 1 cities — eligible only (excludes known-zero combos) */
  for (const otherCitySlug of PHASE3C_CITIES) {
    if (otherCitySlug === citySlug) continue;
    const scopeKey = `${serviceSlug}-${otherCitySlug}`;
    if (!PHASE3C_ELIGIBLE.has(scopeKey)) continue;
    const otherCity = CITY_REGISTRY[otherCitySlug];
    if (!otherCity) continue;
    links.push({
      href: `https://www.fixeo.ma/${scopeKey}`,
      text: `${service.labelPlural} à ${otherCity.label}`,
      priority: otherCity.tier === 1 ? 0 : 1,
    });
  }

  /* 2. Related services in the same city — eligible only (excludes known-zero combos) */
  for (const relSlug of (service.relatedSlugs || [])) {
    const scopeKey = `${relSlug}-${citySlug}`;
    if (!PHASE3C_ELIGIBLE.has(scopeKey)) continue;
    const relService = SERVICE_REGISTRY[relSlug];
    if (!relService || !currentCity) continue;
    links.push({
      href: `https://www.fixeo.ma/${scopeKey}`,
      text: `${relService.labelPlural} à ${currentCity.label}`,
      priority: 2,
    });
  }

  /* Sort by priority, deduplicate, limit to 8 */
  const seen = new Set();
  return links
    .sort((a, b) => a.priority - b.priority)
    .filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; })
    .slice(0, 8)
    .map(({ href, text }) => ({ href, text }));
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION J — HTML PAGE BUILDER
   ══════════════════════════════════════════════════════════════════════ */

function buildLpHtml(service, city, citySlug, totalCount, priceRecordCount, artisans) {
  const svcSlug    = service.canonicalSlug;
  const cityName   = city.label;
  const displayedN = artisans.length;

  /* ── Safe copy ── */
  const rawTotalPhrase = totalCountPhrase(totalCount, service.labelPlural, service.labelSingular);
  const rawPricePhrase = priceRangePhrase(priceRecordCount, artisans);
  const rawVerifPhrase = verifiedPhrase(artisans);

  /* ── Canonical URL ── */
  const canonicalUrl = `https://www.fixeo.ma/${svcSlug}-${citySlug}`;

  /* ── Title — uses totalCount phrase, no price (stable) ── */
  const titleRaw = `${service.labelPlural} à ${cityName} — ${rawTotalPhrase} | Fixeo`;

  /* ── Meta description ── */
  const metaDescParts = [
    `Consultez les profils de ${service.labelSingular.toLowerCase()} à ${cityName} sur Fixeo.`,
    rawTotalPhrase ? `${rawTotalPhrase}.` : null,
    rawVerifPhrase ? `${rawVerifPhrase}.` : null,
    rawPricePhrase ? `Tarifs\u202f: ${rawPricePhrase}.` : null,
  ];
  const metaDescRaw = metaDescParts.filter(Boolean).join(' ');

  /* ── Hero image policy (Phase 3B.1 correction 3) ──
     heroAvailable: true  → hero img above fold, hero as og:image
     heroAvailable: false → NO image element at all (zero RAFI on LP pages)
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

  const ogImageUrl = hasHero
    ? `https://www.fixeo.ma${service.heroUrl}`
    : FIXEO_OG_IMAGE;

  /* ── Artisan cards ── */
  const cardsHtml = artisans.map(a => renderArtisanCard(a, svcSlug)).join('\n    ');

  /* ── Count summary ── */
  let countSummaryHtml = '';
  if (rawTotalPhrase) {
    if (displayedN < totalCount) {
      countSummaryHtml = `
    <p class="lp-count-summary">
      <strong>${totalCount} profils référencés</strong> à ${esc(cityName)}.
      <span class="lp-count-displayed">${displayedN} profils affichés.</span>
    </p>`;
    } else {
      countSummaryHtml = `
    <p class="lp-count-summary">
      <strong>${totalCount} profil${totalCount > 1 ? 's' : ''} référencé${totalCount > 1 ? 's' : ''}</strong> à ${esc(cityName)}.
    </p>`;
    }
  }

  const priceSummaryHtml = rawPricePhrase
    ? `<p class="lp-price-summary">${esc(rawPricePhrase)}</p>`
    : '';

  /* ── Related links ── */
  const related     = buildRelatedLinks(svcSlug, citySlug, service);
  const relLinksHtml = related.length
    ? `<nav class="lp-related" aria-label="Pages connexes">
        <h2 class="lp-related-title">Voir aussi</h2>
        <ul class="lp-related-list">
          ${related.map(l => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('\n          ')}
        </ul>
      </nav>`
    : '';

  /* ── JSON-LD ── */
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
        '@id':             `${canonicalUrl}#list`,
        'name':            `${service.labelPlural} à ${cityName}`,
        'description':     metaDescRaw,
        'url':             canonicalUrl,
        'numberOfItems':   totalCount,
        'itemListElement': itemListItems,
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo',
            'item': 'https://www.fixeo.ma/' },
          { '@type': 'ListItem', 'position': 2,
            'name': `${service.labelPlural} à ${cityName}`,
            'item': canonicalUrl },
        ],
      },
      {
        '@type': 'WebSite',
        '@id':   'https://www.fixeo.ma/#website',
        'url':   'https://www.fixeo.ma/',
        'name':  'Fixeo',
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
      display: flex; flex-direction: column; align-items: center;
      text-align: center; padding: 40px 24px 32px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px; margin-bottom: 28px;
    }
    .lp-hero-img {
      width: 160px; height: 160px;
      object-fit: contain; object-position: center bottom;
      margin-bottom: 20px;
    }
    .lp-hero-h1 {
      font-size: clamp(1.5rem, 4vw, 2.1rem);
      font-weight: 800; color: #fff; line-height: 1.2; margin-bottom: 12px;
    }
    .lp-hero-desc {
      font-size: 1rem; color: rgba(255,255,255,0.65);
      max-width: 560px; margin-bottom: 16px;
    }
    .lp-count-summary {
      font-size: 0.9rem; color: rgba(255,255,255,0.7); margin-bottom: 6px;
    }
    .lp-count-displayed {
      font-size: 0.82rem; color: rgba(255,255,255,0.45); margin-left: 6px;
    }
    .lp-price-summary {
      font-size: 0.88rem; color: rgba(255,255,255,0.6); margin-bottom: 6px;
    }
    .lp-hero-meta {
      display: flex; flex-wrap: wrap; gap: 10px;
      justify-content: center; font-size: 0.88rem; margin-bottom: 20px;
    }
    .lp-hero-meta-item {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px; padding: 5px 14px; color: rgba(255,255,255,0.8);
    }
    .lp-cta {
      display: inline-block; margin-top: 8px; padding: 14px 32px;
      background: linear-gradient(135deg,#E1306C,#C13584);
      color: #fff; font-weight: 700; font-size: 1rem;
      border-radius: 16px; text-decoration: none;
    }
    .lp-cta:hover { opacity: 0.9; text-decoration: none; color: #fff; }

    /* ── Section titles ── */
    .lp-section { margin-bottom: 32px; }
    .lp-section-title {
      font-size: 1.2rem; font-weight: 700; color: #fff;
      margin-bottom: 16px; border-left: 3px solid #E1306C; padding-left: 12px;
    }

    /* ── Artisan cards ── */
    .lp-cards { display: flex; flex-direction: column; gap: 12px; }
    .lp-card {
      display: flex; align-items: center; gap: 14px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.11);
      border-radius: 16px; padding: 16px 18px;
    }
    .lp-card-avatar {
      width: 56px; height: 56px; border-radius: 50%;
      object-fit: cover; border: 2px solid rgba(225,48,108,0.4); flex-shrink: 0;
    }
    .lp-card-initials {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg,#E1306C,#C13584);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.2rem; color: #fff; flex-shrink: 0;
    }
    .lp-card-body { flex: 1; min-width: 0; }
    .lp-card-name { font-weight: 700; color: #fff; font-size: 1rem; margin-bottom: 4px; }
    .lp-card-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
    .lp-badge {
      font-size: 0.72rem; font-weight: 600; border-radius: 999px; padding: 2px 10px;
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
      font-size: 0.83rem; font-weight: 600; color: #E1306C; white-space: nowrap;
      padding: 7px 14px; border: 1px solid rgba(225,48,108,0.35);
      border-radius: 10px; flex-shrink: 0;
    }
    .lp-card-link:hover { background: rgba(225,48,108,0.08); text-decoration: none; }

    /* ── Related links ── */
    .lp-related {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 16px; padding: 20px 24px; margin-top: 8px;
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

  /* Phase 3C scope gate — replaces POC_WHITELIST */
  if (!PHASE3C_SCOPE.has(rawSlug)) {
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
