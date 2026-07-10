/*!
 * api/artisan-profile.js — Vercel Serverless Function
 * SEO Phase 2A — Server-Rendered Artisan Profile PoC
 *
 * Route:  GET /artisan/{public_slug}
 * Branch: feat/seo-phase2a-ssr-profile-poc
 *
 * Purpose:
 *   Return a fully server-rendered HTML page for a given artisan slug.
 *   Google must be able to index the page WITHOUT executing JavaScript.
 *
 * Security model:
 *   - Uses Supabase anon key + explicit field allowlist (no service_role)
 *   - Only PUBLIC_ALLOWED fields are fetched and rendered
 *   - Phone, owner_user_id, source, experience, legacy_id NEVER exposed
 *   - All output HTML-escaped before injection
 *
 * Cache strategy:
 *   - CDN: s-maxage=3600, stale-while-revalidate=86400
 *   - Supabase hit only on CDN miss (~once per hour per profile)
 *   - 404/400/503 responses: no-store (never cache errors)
 *
 * HTTP codes:
 *   200 — valid active profile
 *   400 — malformed slug (too short, invalid chars)
 *   404 — slug not found OR profile inactive
 *   503 — Supabase unavailable
 *
 * Status: PROOF OF CONCEPT — DO NOT merge to main without authorization
 */

'use strict';

/* ── Supabase public credentials (same as js/supabase-client.js — anon key, public) ── */
const SUPABASE_URL  = 'https://ztwtbgoqanqzvwiibtuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

/* ── PUBLIC field allowlist ── */
/* Only these fields are fetched from Supabase. Any field not listed here
   is never transmitted over the network, not just suppressed at render time. */
const PUBLIC_FIELDS = [
  'id',
  'name',
  'full_name',
  'city',
  'category',
  'service_category',
  'description',
  'public_slug',
  'photo_url',
  'availability',
  'verified',
  'is_verified',
  'claimed',
  'claim_status',
  'review_count',
  'price_from',
  'price_label',
  'services',
  'work_zone',
  'badge_label',
  'avatar_color',
  'completed_missions',
  'response_time_min',
  'is_featured',
  'claimable',
  'updated_at',
].join(',');

/* ── Slug validation regex ── */
/* Allows: lowercase letters, digits, hyphens. Min 5, max 120 chars.
   Rejects: uppercase, spaces, underscores, path traversal, SQL injections. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{3,118}[a-z0-9]$/;

/* ── Service category → display label map ── */
const SVC_LABELS = {
  'plomberie': 'Plombier',
  'plombier': 'Plombier',
  'électricité': 'Électricien',
  'electricite': 'Électricien',
  'électricite': 'Électricien',
  'electricité': 'Électricien',
  'electricite_generale': 'Électricien',
  'serrurerie': 'Serrurier',
  'serrurier': 'Serrurier',
  'climatisation': 'Technicien Climatisation',
  'peinture': 'Peintre',
  'peintre': 'Peintre',
  'carrelage': 'Carreleur',
  'maconnerie': 'Maçon',
  'menuiserie': 'Menuisier',
  'jardinage': 'Jardinier',
  'nettoyage': 'Agent de nettoyage',
  'demenagement': 'Déménageur',
};

/* ── Service category → LP URL slug map ── */
const SVC_URL_SLUG = {
  'plomberie': 'plombier',
  'plombier': 'plombier',
  'électricité': 'electricien',
  'electricite': 'electricien',
  'électricite': 'electricien',
  'electricité': 'electricien',
  'serrurerie': 'serrurier',
  'serrurier': 'serrurier',
  'climatisation': 'climatisation',
  'peinture': 'peinture',
  'peintre': 'peinture',
  'nettoyage': 'nettoyage',
};

/* ── City → URL slug map ── */
const CITY_URL_SLUG = {
  'casablanca': 'casablanca',
  'rabat': 'rabat',
  'marrakech': 'marrakech',
  'fès': 'fes',
  'fes': 'fes',
  'tanger': 'tanger',
  'agadir': 'agadir',
  'meknès': 'meknes',
  'meknes': 'meknes',
  'oujda': 'oujda',
  'kénitra': 'kenitra',
  'kenitra': 'kenitra',
  'témara': 'temara',
  'temara': 'temara',
  'salé': 'sale',
  'sale': 'sale',
  'mohammedia': 'mohammedia',
  'el jadida': 'el-jadida',
  'béni mellal': 'beni-mellal',
  'khouribga': 'khouribga',
  'safi': 'safi',
  'nador': 'nador',
  'taza': 'taza',
  'ouarzazate': 'ouarzazate',
  'tétouan': 'tetouan',
  'tetouan': 'tetouan',
};

/* ══════════════════════════════════════════════════════════════════════
   SECTION A — FIXEO HEROES: Category-aware hero selection
   ══════════════════════════════════════════════════════════════════════

   POLICY (Phase 2A.2):
     A category hero is used ONLY when the exact approved asset currently
     exists in the repository under heroes/{folder}/{filename}.
     No profession may display another profession's hero as an interim fallback.
     When a category's own asset is unavailable, RAFI_V2_BlackSilhouette is used.

   Current availability:
     AVAILABLE    — plomberie     heroes/plomberie/avatar-presenting-transparent.jpg
     AVAILABLE    — electricite   heroes/electricite/avatar-presenting-transparent.jpg
     NOT_AVAILABLE — serrurerie   (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — climatisation (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — menuiserie   (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — peinture     (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — maconnerie   (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — jardinage    (own asset pending — BlackSilhouette used)
     NOT_AVAILABLE — nettoyage    (own asset pending — BlackSilhouette used)

   V3 upgrade path (zero code rewrite):
     When Hero_03_MasterLocksmith.png is delivered for serrurerie:
       1. Place file at heroes/serrurerie/Hero_03_MasterLocksmith.png
       2. In HERO_SLOT_MAP.serrurerie set:
             available: true,
             folder:    'serrurerie',
             filename:  'Hero_03_MasterLocksmith.png'
       3. The resolver picks it up automatically. Nothing else changes.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Universal fallback (unknown category or NOT_AVAILABLE slot) ── */
const RAFI_FALLBACK_URL = '/rafi/RAFI_V2_BlackSilhouette.png';

/* ── Hero slot map ──────────────────────────────────────────────────────
   Fields per slot:
     slot:      Symbolic name (future V3 naming convention — never changes)
     available: Boolean. true = asset exists on disk and may be served.
                         false = NOT_AVAILABLE, BlackSilhouette is used instead.
     folder:    Sub-directory under /heroes/ (only meaningful when available=true)
     filename:  Exact filename on disk (only meaningful when available=true)
                V3 target filename documented in comment for each NOT_AVAILABLE slot.
   ────────────────────────────────────────────────────────────────────── */
const HERO_SLOT_MAP = {
  /* Slot 01 — Master Plumber ─────────────── AVAILABLE */
  plomberie: {
    slot:      'Hero_01_MasterPlumber',
    available: true,
    folder:    'plomberie',
    filename:  'avatar-presenting-transparent.jpg', /* V3 target: Hero_01_MasterPlumber.png */
  },
  /* Slot 02 — Master Electrician ─────────── AVAILABLE */
  electricite: {
    slot:      'Hero_02_MasterElectrician',
    available: true,
    folder:    'electricite',
    filename:  'avatar-presenting-transparent.jpg', /* V3 target: Hero_02_MasterElectrician.png */
  },
  /* Slot 03 — Master Locksmith ──────────── NOT_AVAILABLE */
  serrurerie: {
    slot:      'Hero_03_MasterLocksmith',
    available: false,                               /* V3 target folder:   serrurerie */
    folder:    null,                                /* V3 target filename: Hero_03_MasterLocksmith.png */
    filename:  null,
  },
  /* Slot 04 — Master HVAC ────────────────── NOT_AVAILABLE */
  climatisation: {
    slot:      'Hero_04_MasterHVAC',
    available: false,                               /* V3 target folder:   climatisation */
    folder:    null,                                /* V3 target filename: Hero_04_MasterHVAC.png */
    filename:  null,
  },
  /* Slot 05 — Master Carpenter ──────────── NOT_AVAILABLE */
  menuiserie: {
    slot:      'Hero_05_MasterCarpenter',
    available: false,                               /* V3 target folder:   menuiserie */
    folder:    null,                                /* V3 target filename: Hero_05_MasterCarpenter.png */
    filename:  null,
  },
  /* Slot 06 — Master Painter ─────────────── NOT_AVAILABLE */
  peinture: {
    slot:      'Hero_06_MasterPainter',
    available: false,                               /* V3 target folder:   peinture */
    folder:    null,                                /* V3 target filename: Hero_06_MasterPainter.png */
    filename:  null,
  },
  /* Slot 07 — Master Mason ───────────────── NOT_AVAILABLE */
  maconnerie: {
    slot:      'Hero_07_MasterMason',
    available: false,                               /* V3 target folder:   maconnerie */
    folder:    null,                                /* V3 target filename: Hero_07_MasterMason.png */
    filename:  null,
  },
  /* Slot 08 — Master Gardener ────────────── NOT_AVAILABLE */
  jardinage: {
    slot:      'Hero_08_MasterGardener',
    available: false,                               /* V3 target folder:   jardinage */
    folder:    null,                                /* V3 target filename: Hero_08_MasterGardener.png */
    filename:  null,
  },
  /* Slot 09 — Master Cleaning ────────────── NOT_AVAILABLE */
  nettoyage: {
    slot:      'Hero_09_MasterCleaning',
    available: false,                               /* V3 target folder:   nettoyage */
    folder:    null,                                /* V3 target filename: Hero_09_MasterCleaning.png */
    filename:  null,
  },
};

/* ── Category string → hero slot key ───────────────────────────────────
   Maps every raw Supabase category string variant to a key in HERO_SLOT_MAP.
   Lookup is done on the normalized (lowercase, diacritics stripped) string.
   Any unmapped string returns null → caller uses RAFI_FALLBACK_URL.
   ────────────────────────────────────────────────────────────────────── */
const CATEGORY_TO_HERO_KEY = {
  /* Plomberie */
  'plomberie':             'plomberie',
  'plombier':              'plomberie',
  /* Électricité */
  'electricite':           'electricite',   /* after NFD diacritic strip */
  'electricite_generale':  'electricite',
  'electricien':           'electricite',
  /* Serrurerie */
  'serrurerie':            'serrurerie',
  'serrurier':             'serrurerie',
  /* Climatisation */
  'climatisation':         'climatisation',
  'clim':                  'climatisation',
  'chauffage':             'climatisation',
  /* Menuiserie */
  'menuiserie':            'menuiserie',
  'menuisier':             'menuiserie',
  /* Peinture */
  'peinture':              'peinture',
  'peintre':               'peinture',
  /* Maçonnerie */
  'maconnerie':            'maconnerie',   /* after diacritic strip */
  'carrelage':             'maconnerie',
  /* Jardinage */
  'jardinage':             'jardinage',
  /* Nettoyage */
  'nettoyage':             'nettoyage',
};

/* ── Category string normalizer ─────────────────────────────────────────
   Lowercases, trims, strips NFD diacritics, keeps only [a-z0-9 _].
   Example: 'Électricité' → 'electricite'
   ────────────────────────────────────────────────────────────────────── */
function _normalizeCategoryKey(category) {
  return String(category || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 _]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Category → hero URL resolver ───────────────────────────────────────
   Returns the /heroes/… path ONLY when:
     (a) the category maps to a known slot, AND
     (b) that slot's available flag is true.
   Returns null in all other cases — caller uses RAFI_FALLBACK_URL.
   ────────────────────────────────────────────────────────────────────── */
function resolveHeroUrl(category) {
  if (!category) return null;

  const normalized = _normalizeCategoryKey(category);
  const heroKey = CATEGORY_TO_HERO_KEY[normalized] || null;
  if (!heroKey) return null;

  const slot = HERO_SLOT_MAP[heroKey];
  if (!slot || !slot.available) return null;   /* NOT_AVAILABLE → null */

  return `/heroes/${slot.folder}/${slot.filename}`;
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION B — PHOTO URL SECURITY VALIDATION
   ══════════════════════════════════════════════════════════════════════

   An artisan photo_url overrides the hero ONLY when ALL conditions below pass.
   On any failure: silently return null → caller uses hero or RAFI fallback.

   CONDITIONS (in order):
     1.  Non-empty string.
     2.  No malformed percent-encoding (decodeURIComponent must not throw).
     3.  Parses successfully as a URL (no throws).
     4.  No embedded credentials (username or password in URL is rejected).
     5.  Protocol is exactly 'https:'.
     6.  Port: default HTTPS only — explicit port 443 is accepted; any other
         explicit port (e.g. :8080, :3000) is rejected.
     7.  Hostname is on PHOTO_HOSTNAME_ALLOWLIST (exact match — no wildcards).
     8.  Not a private-network or loopback address.
     9.  Pathname has an approved image extension (.jpg .jpeg .png .webp .avif).
         Supabase Storage URLs expose the filename in the path
         (e.g. /storage/v1/object/public/avatars/photo.jpg) so extension
         validation is reliable without downloading content.
         If the path has NO extension (e.g. a proxied URL), the URL is
         rejected — we never guess content type from a live download.

   PHOTO_HOSTNAME_ALLOWLIST (3 entries — exact hostnames, no wildcards):
     ztwtbgoqanqzvwiibtuh.supabase.co  — FIXEO primary Supabase storage bucket
     fixeo.ma                           — FIXEO apex domain
     www.fixeo.ma                       — FIXEO www (canonical)

   Rationale for removals vs Phase 2A.2:
     *.supabase.co wildcard  — Third parties can create their own Supabase
                                projects; a wildcard would trust any of them.
     fixeo-cdn.com           — Reserved / not yet owned or deployed;
                                trust must be established before use.
     lh3.googleusercontent.com — OAuth avatar ≠ artisan profile photo;
                                  Google image URLs expire and are user-scoped.
     avatars.githubusercontent.com — Same rationale as Google OAuth.
   ══════════════════════════════════════════════════════════════════════ */

/* Exact hostname allowlist — no wildcards, no sub-domain matching */
const PHOTO_HOSTNAME_ALLOWLIST = new Set([
  'ztwtbgoqanqzvwiibtuh.supabase.co', /* FIXEO primary Supabase storage */
  'fixeo.ma',                          /* FIXEO apex domain               */
  'www.fixeo.ma',                      /* FIXEO www (canonical)           */
]);

/* Private / reserved network ranges (IPv4) */
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

/* Approved image extensions for artisan profile photos */
const ALLOWED_IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function validatePhotoUrl(raw) {
  /* 1. Non-empty string */
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  /* 2. Reject malformed percent-encoding before further parsing */
  try {
    decodeURIComponent(trimmed);
  } catch (_) {
    return null;
  }

  /* Early-reject non-http schemes before URL constructor (prevents edge-case bypasses) */
  const lowered = trimmed.toLowerCase();
  if (
    lowered.startsWith('data:')       ||
    lowered.startsWith('javascript:') ||
    lowered.startsWith('vbscript:')   ||
    lowered.startsWith('blob:')
  ) return null;

  /* 3. URL must parse cleanly */
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return null;
  }

  /* 4. No embedded credentials */
  if (parsed.username || parsed.password) return null;

  /* 5. Protocol must be https: */
  if (parsed.protocol !== 'https:') return null;

  /* 6. Port: default HTTPS only.
        parsed.port is '' when using the scheme default (443 for https:).
        An explicit ':443' in the URL is normalized to '' by the URL parser,
        so both https://host/path and https://host:443/path produce port=''.
        Any other explicit port (e.g. ':8080') produces a non-empty string → reject. */
  if (parsed.port !== '') return null;

  /* 7. Hostname must be on the exact allowlist */
  const host = parsed.hostname.toLowerCase();
  if (!PHOTO_HOSTNAME_ALLOWLIST.has(host)) return null;

  /* 8. Reject private-network and loopback addresses */
  if (PRIVATE_IP_RE.test(host) || host === 'localhost' || host === '::1') return null;

  /* 9. Pathname must end with an approved image extension.
        We lowercase the full pathname before matching to catch .JPG, .JPEG, etc.
        Supabase Storage always exposes the original filename in the path, so this
        is reliable without fetching any content. A path with no extension, or an
        extension outside the approved set (e.g. .svg, .gif, .bmp, .html) is
        rejected — we never guess content type from a live download.

        SVG is explicitly excluded: SVG files can contain embedded scripts,
        foreignObject elements, and event handlers — unsafe as artisan photos. */
  const lowerPath = parsed.pathname.toLowerCase();
  const lastDot = lowerPath.lastIndexOf('.');
  if (lastDot === -1) return null; /* No extension at all — reject */
  const ext = lowerPath.slice(lastDot); /* e.g. '.jpg' */
  if (!ALLOWED_IMG_EXTS.has(ext)) return null;

  /* All checks passed */
  return trimmed;
}

/* ── Resolve the single image to use for a given artisan ───────────────
   Priority:
     1. photo_url — passes validatePhotoUrl() (HTTPS + allowlist + ext check)
     2. Category hero — slot available=true in HERO_SLOT_MAP
     3. RAFI BlackSilhouette — unavailable slot OR unknown category

   This function is the SOLE source of truth for the image.
   og:image, twitter:image, JSON-LD image, and visible <img> src
   all receive the exact same resolved URL — no divergence possible.
   ────────────────────────────────────────────────────────────────────── */
function resolveArtisanImage(artisan) {
  /* Step 1 — Validated real photo */
  const validatedPhoto = validatePhotoUrl(artisan.photo_url);
  if (validatedPhoto) {
    return { url: validatedPhoto, isReal: true, isHero: false, isFallback: false };
  }

  /* Step 2 — Available category hero */
  const category = artisan.category || artisan.service_category || '';
  const heroUrl = resolveHeroUrl(category);
  if (heroUrl) {
    return { url: heroUrl, isReal: false, isHero: true, isFallback: false };
  }

  /* Step 3 — RAFI BlackSilhouette
     Reached when: category unknown, or slot NOT_AVAILABLE, or photo invalid */
  return { url: RAFI_FALLBACK_URL, isReal: false, isHero: false, isFallback: true };
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION C — ESCAPING UTILITIES
   ══════════════════════════════════════════════════════════════════════

   ESCAPING POLICY (applied consistently throughout the renderer):

   Context              | Function      | Variables
   ─────────────────────┼───────────────┼────────────────────────────────
   HTML text content    | esc()         | rawName, rawCity, rawDesc, …
   HTML attributes      | esc()         | src=, alt=, href=, content=
   <title> text         | esc()         | rawName, rawCity, rawLabel
   JSON-LD object       | safeJsonLD()  | entire JSON object, post-stringify
   Internal URLs        | only fixeo.ma | artisan CTA, breadcrumb, related

   RULES:
   - All raw* variables hold UNESCAPED Supabase values.
   - esc() is called at the insertion point, never at variable assignment.
   - JSON-LD uses JSON.stringify on raw values, then safeJsonLD() replaces
     </script>-breaking characters in the final string.
   - escJson() is REMOVED — it was double-escaping pre-escaped values.
   - absoluteImageUrl is always either our own /heroes/… or /rafi/… URL,
     or a validated HTTPS URL from the allowlist — safe to embed as-is
     after esc() for attribute context.
   - Numeric fields (price_from, response_time_min) cast via Number() —
     only digits emitted, no injection possible.
   ══════════════════════════════════════════════════════════════════════ */

/* ── HTML attribute + text escape ── */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Safe JSON-LD serializer ────────────────────────────────────────────
   Builds the JSON string via JSON.stringify (handles quotes, backslashes,
   control chars), then replaces the three characters that would allow
   breaking out of a <script> block in HTML:
     <  →  \u003c
     >  →  \u003e
     &  →  \u0026
   The result is valid JSON and safe to embed inside <script type="application/ld+json">.
   This is the same technique used by Django, Ruby on Rails, Next.js.
   ────────────────────────────────────────────────────────────────────── */
function safeJsonLD(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/* ── Service label resolution — returns a hardcoded string from SVC_LABELS or raw category ── */
function svcLabel(category) {
  if (!category) return 'Artisan';
  /* Normalize with diacritic strip to match SVC_LABELS keys */
  const key = String(category)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 _]/g, '')
    .trim();
  return SVC_LABELS[key] || SVC_LABELS[String(category).toLowerCase().trim()] || String(category);
}

/* ── City URL slug resolution ── */
function citySlug(city) {
  if (!city) return null;
  const key = String(city).toLowerCase().trim();
  return CITY_URL_SLUG[key] || null;
}

/* ── Service URL slug resolution ── */
function svcSlug(category) {
  if (!category) return null;
  const key = String(category).toLowerCase().trim();
  return SVC_URL_SLUG[key] || null;
}

/* ── LP URL builder ── */
/* Returns the canonical LP URL for a given service+city combo if it exists in the known map. */
function lpUrl(category, city) {
  const sv = svcSlug(category);
  const ct = citySlug(city);
  if (sv && ct) return `https://www.fixeo.ma/${sv}-${ct}.html`;
  if (sv) return `https://www.fixeo.ma/services.html`;
  return null;
}

/* ── Related links generator ── */
function buildRelatedLinks(artisan) {
  const category = artisan.category || artisan.service_category || '';
  const city = artisan.city || '';
  const sv = svcSlug(category);
  const ct = citySlug(city);
  const label = svcLabel(category);

  const links = [];

  /* 1. Same service, same city LP */
  if (sv && ct) {
    links.push({
      href: `https://www.fixeo.ma/${sv}-${ct}.html`,
      text: `${label}s à ${esc(city)}`
    });
  }

  /* 2. Same service, nearby cities */
  const nearbyByCity = {
    'casablanca': ['rabat', 'mohammedia'],
    'rabat': ['casablanca', 'temara', 'sale'],
    'marrakech': ['casablanca'],
    'tanger': ['tetouan'],
    'fes': ['meknes'],
    'agadir': ['casablanca'],
  };
  const nearbyCities = nearbyByCity[ct] || [];
  nearbyCities.slice(0, 2).forEach(nc => {
    if (sv) {
      const cityLabel = nc.charAt(0).toUpperCase() + nc.slice(1);
      links.push({
        href: `https://www.fixeo.ma/${sv}-${nc}.html`,
        text: `${label}s à ${cityLabel}`
      });
    }
  });

  /* 3. Generic service pages */
  if (sv) {
    links.push({
      href: `https://www.fixeo.ma/services.html`,
      text: `Tous les services ${label.toLowerCase()}`
    });
  }

  return links.slice(0, 4);
}

/* ── Status badge ── */
function availBadge(artisan) {
  if (artisan.availability === 'available') {
    return `<span class="ssp-badge ssp-badge--avail">✓ Disponible</span>`;
  }
  return `<span class="ssp-badge ssp-badge--unavail">Indisponible actuellement</span>`;
}

/* ── Services list HTML ── */
function servicesHtml(services) {
  if (!Array.isArray(services) || services.length === 0) return '';
  return services.map(s => `<li class="ssp-service-tag">${esc(s)}</li>`).join('');
}

/* ── Main HTML generator ── */
function buildProfileHtml(artisan) {
  /* ── Raw variables — unescaped Supabase values ──
     esc() is applied at each insertion point, never here.
     This prevents double-escaping and makes escaping auditable. */
  const rawName        = String(artisan.name || artisan.full_name || '');
  const rawCity        = String(artisan.city || '');
  const rawCategory    = String(artisan.category || artisan.service_category || '');
  const rawLabel       = svcLabel(rawCategory);   /* from hardcoded SVC_LABELS — trusted */
  const rawSlugVal     = String(artisan.public_slug || '');
  const rawServices    = Array.isArray(artisan.services) ? artisan.services : [];
  const rawPriceLabel  = String(artisan.price_label || '');
  const rawWorkZone    = String(artisan.work_zone || '');
  const rawBadgeLabel  = String(artisan.badge_label || '');
  const rawAvail       = artisan.availability;
  /* Numeric fields: cast via Number() — only digits, no injection */
  const rawRespTime    = Number(artisan.response_time_min) > 0
                         ? Number(artisan.response_time_min) : 30;
  const rawPriceFrom   = Number(artisan.price_from) > 0
                         ? Number(artisan.price_from) : null;
  const isClaimed      = artisan.claimed === true;
  const rawDescription = String(artisan.description || '');

  /* ── Single image resolution ── */
  const imageRes = resolveArtisanImage(artisan);
  const absoluteImageUrl = imageRes.url.startsWith('http')
    ? imageRes.url
    : `https://www.fixeo.ma${imageRes.url}`;
  const imgSrc = imageRes.url;  /* relative for <img> src */

  /* ── Canonical URL — slug already validated by SLUG_RE in the handler ── */
  const canonicalUrl = `https://www.fixeo.ma/artisan/${rawSlugVal}`;

  /* ── Computed strings — use raw* values; esc() applied at insertion point ── */
  /* <title> text content: esc() applied once here for the title string itself */
  const titleRaw   = `${rawName} — ${rawLabel} à ${rawCity} | Fixeo`;
  /* meta description: raw, esc() at insertion point */
  const metaDescRaw = `${rawLabel} à ${rawCity} — ${rawName}. ${rawDescription.replace(/\.$/, '')}. Profil sur Fixeo.ma.`;

  /* ── LP link for breadcrumb ── */
  const lpHref = lpUrl(rawCategory, rawCity) || 'https://www.fixeo.ma/services.html';
  const lpTextRaw = `${rawLabel}s à ${rawCity}`;

  /* ── Related internal links ── */
  const relLinks = buildRelatedLinks(artisan);

  /* ── JSON-LD — built with raw values, serialized via safeJsonLD() ──
     safeJsonLD() = JSON.stringify + replace(</script>-breaking chars).
     Raw values go in directly — JSON.stringify handles all quoting/escaping.
     safeJsonLD() adds the final layer that makes it safe inside <script>. */
  const jsonLdObj = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService',
        '@id': `${canonicalUrl}#service`,
        'name': rawName,
        'description': rawDescription,
        'url': canonicalUrl,
        'image': absoluteImageUrl,
        'areaServed': { '@type': 'City', 'name': rawCity },
        'serviceType': rawLabel,
        'provider': {
          '@type': 'Organization',
          '@id': 'https://www.fixeo.ma/#organization',
          'name': 'Fixeo',
          'url': 'https://www.fixeo.ma/'
        },
        'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
        ...(rawPriceFrom ? {
          'priceRange': `À partir de ${rawPriceFrom} DH`,
          'offers': {
            '@type': 'Offer',
            'priceCurrency': 'MAD',
            'price': String(rawPriceFrom),
            'availability': rawAvail === 'available'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock'
          }
        } : {}),
        ...(rawServices.length ? {
          'hasOfferCatalog': {
            '@type': 'OfferCatalog',
            'name': `Services ${rawLabel} à ${rawCity}`,
            'itemListElement': rawServices.map(s => ({
              '@type': 'Offer',
              'name': String(s)
            }))
          }
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo', 'item': 'https://www.fixeo.ma/' },
          { '@type': 'ListItem', 'position': 2, 'name': `${rawLabel}s`, 'item': lpHref },
          { '@type': 'ListItem', 'position': 3, 'name': rawName, 'item': canonicalUrl }
        ]
      },
      {
        '@type': 'WebPage',
        '@id': canonicalUrl,
        'url': canonicalUrl,
        'name': titleRaw,
        'description': metaDescRaw,
        'inLanguage': 'fr-MA',
        'isPartOf': { '@id': 'https://www.fixeo.ma/#website' }
      }
    ]
  };

  /* ── Visible image section ──────────────────────────────────────────
     isReal     → real circular photo with border
     isHero     → category hero (transparent image, no circular crop)
     isFallback → RAFI BlackSilhouette (aria-hidden, neutral)
     ── esc() applied to all src/alt attributes at insertion point ───── */
  let photoSection;
  if (imageRes.isReal) {
    photoSection = `<div class="ssp-avatar-wrap">
        <img class="ssp-avatar"
             src="${esc(imgSrc)}"
             alt="${esc(rawName)}, ${esc(rawLabel)} à ${esc(rawCity)}"
             width="120" height="120"
             loading="eager"
             fetchpriority="high"
             decoding="async"
             onerror="this.style.display='none'">
      </div>`;
  } else if (imageRes.isHero) {
    photoSection = `<div class="ssp-avatar-wrap ssp-avatar-wrap--hero">
        <img class="ssp-hero-img"
             src="${esc(imgSrc)}"
             alt="${esc(rawName)}, ${esc(rawLabel)}"
             width="140" height="140"
             loading="eager"
             fetchpriority="high"
             decoding="async"
             onerror="this.style.display='none'">
      </div>`;
  } else {
    photoSection = `<div class="ssp-avatar-wrap ssp-avatar-wrap--fallback">
        <img class="rafi-img rafi-img--head ssp-rafi-fallback"
             src="${esc(imgSrc)}"
             alt=""
             aria-hidden="true"
             width="100" height="100"
             loading="eager"
             decoding="async"
             onerror="this.style.display='none'">
      </div>`;
  }

  /* Services tags — esc() at insertion */
  const svcsSection = rawServices.length
    ? `<ul class="ssp-services-list" aria-label="Services proposés">
        ${rawServices.map(s => `<li class="ssp-service-tag">${esc(s)}</li>`).join('')}
      </ul>`
    : '';

  /* Price info — rawPriceLabel is esc()d at insertion */
  const priceSection = rawPriceLabel
    ? `<div class="ssp-price">
        <span class="ssp-price-icon">💰</span>
        <span>${esc(rawPriceLabel)}</span>
      </div>`
    : '';

  /* Zone info — rawWorkZone is esc()d at insertion */
  const zoneSection = rawWorkZone
    ? `<div class="ssp-zone">
        <span class="ssp-zone-icon">📍</span>
        <span>Zone d'intervention : ${esc(rawWorkZone)}</span>
      </div>`
    : '';

  /* Response time — numeric, safe */
  const respSection = `<div class="ssp-resp">
    <span class="ssp-resp-icon">⏱</span>
    <span>Réponse estimée : ${rawRespTime} min</span>
  </div>`;

  /* Claim CTA — rawName is esc()d at insertion */
  const claimSection = !isClaimed
    ? `<div class="ssp-claim-cta">
        <p class="ssp-claim-text">Êtes-vous <strong>${esc(rawName)}</strong> ?</p>
        <a href="https://www.fixeo.ma/rejoindre-fixeo.html" class="ssp-claim-btn">
          Rejoindre Fixeo &amp; revendiquer ce profil →
        </a>
      </div>`
    : '';

  /* Related links — hrefs are our own generated URLs (safe); text is esc()d */
  const relLinksHtml = relLinks.length
    ? `<nav class="ssp-related" aria-label="Pages liées">
        <h2 class="ssp-related-title">Voir aussi</h2>
        <ul class="ssp-related-list">
          ${relLinks.map(l => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('\n          ')}
        </ul>
      </nav>`
    : '';

  /* ─── Full HTML ─────────────────────────────────────────────────────
     Escaping per context:
       <title>: esc(titleRaw)                  — HTML text node
       content=: esc(metaDescRaw)              — HTML attribute
       href=: canonicalUrl (fixeo.ma only)     — safe, no user input
       content= for OG/Twitter: esc(…)         — HTML attribute
       JSON-LD <script>: safeJsonLD(jsonLdObj) — safe JSON in script tag
       <h1>, <p> text: esc(rawName) etc.       — HTML text
     ────────────────────────────────────────────────────────────────── */
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- SEO: Title — unique per artisan -->
  <title>${esc(titleRaw)}</title>

  <!-- SEO: Meta description — unique per artisan -->
  <meta name="description" content="${esc(metaDescRaw)}">

  <!-- SEO: Canonical — self-referencing, fixeo.ma domain only -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- SEO: Robots -->
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">

  <!-- Open Graph — og:image, twitter:image, JSON-LD image all use the same resolved URL -->
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(titleRaw)}">
  <meta property="og:description" content="${esc(metaDescRaw)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${esc(absoluteImageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(rawName)} — ${esc(rawLabel)} à ${esc(rawCity)}">
  <meta property="og:locale" content="fr_MA">
  <meta property="og:site_name" content="Fixeo">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@FixeoMaroc">
  <meta name="twitter:title" content="${esc(titleRaw)}">
  <meta name="twitter:description" content="${esc(metaDescRaw)}">
  <meta name="twitter:image" content="${esc(absoluteImageUrl)}">

  <!-- JSON-LD: ProfessionalService + BreadcrumbList + WebPage -->
  <!-- safeJsonLD() = JSON.stringify + \u003c/\u003e/\u0026 replacement — safe in <script> -->
  <script type="application/ld+json">
${safeJsonLD(jsonLdObj)}
  </script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">

  <!-- RAFI CSS (for hero fallback) -->
  <link rel="stylesheet" href="/css/fixeo-rafi-v2.css?v=rfv2a">

  <!-- SSR Profile styles — self-contained, no JS required -->
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; }
    body {
      font-family: 'Cairo', 'Tajawal', Arial, sans-serif;
      background: linear-gradient(135deg, #0D0D1A 0%, #1a1a2e 50%, #16213e 100%);
      color: #e8eaf0;
      min-height: 100vh;
      line-height: 1.6;
    }
    a { color: #E1306C; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; }

    /* ── Page layout ── */
    .ssp-page { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }

    /* ── Breadcrumb ── */
    .ssp-breadcrumb {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.55);
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .ssp-breadcrumb a { color: rgba(255,255,255,0.7); }
    .ssp-breadcrumb a:hover { color: #E1306C; }
    .ssp-breadcrumb-sep { color: rgba(255,255,255,0.3); }

    /* ── Profile card ── */
    .ssp-card {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 32px 24px;
      margin-bottom: 24px;
      backdrop-filter: blur(16px);
    }

    /* ── Avatar ── */
    .ssp-avatar-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 20px;
    }
    .ssp-avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(225,48,108,0.5);
    }
    .ssp-avatar-wrap--fallback { opacity: 0.7; }
    .ssp-avatar-wrap--hero { opacity: 1; }
    /* Category hero: transparent image, no circular crop */
    .ssp-hero-img {
      width: 140px;
      height: 140px;
      object-fit: contain;
      object-position: center bottom;
    }
    .ssp-rafi-fallback {
      width: 100px;
      height: 100px;
      object-fit: contain;
    }

    /* ── H1 — one per page ── */
    .ssp-h1 {
      font-size: clamp(1.3rem, 4vw, 1.75rem);
      font-weight: 800;
      text-align: center;
      margin-bottom: 8px;
      color: #fff;
      line-height: 1.3;
    }

    /* ── Subtitle / profession ── */
    .ssp-subtitle {
      text-align: center;
      font-size: 1rem;
      color: rgba(255,255,255,0.7);
      margin-bottom: 16px;
    }

    /* ── Badges ── */
    .ssp-badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .ssp-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .ssp-badge--avail {
      background: rgba(32,201,151,0.18);
      color: #20c997;
      border: 1px solid rgba(32,201,151,0.35);
    }
    .ssp-badge--unavail {
      background: rgba(255,71,87,0.14);
      color: #ff6b81;
      border: 1px solid rgba(255,71,87,0.3);
    }
    .ssp-badge--new {
      background: rgba(252,175,69,0.15);
      color: #FCAF45;
      border: 1px solid rgba(252,175,69,0.3);
    }
    .ssp-badge--verified {
      background: rgba(64,93,230,0.18);
      color: #7fa2f0;
      border: 1px solid rgba(64,93,230,0.35);
    }

    /* ── Description ── */
    .ssp-description {
      font-size: 0.95rem;
      color: rgba(255,255,255,0.8);
      margin-bottom: 20px;
      text-align: center;
      line-height: 1.65;
    }

    /* ── Info rows ── */
    .ssp-info-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .ssp-price, .ssp-zone, .ssp-resp {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      color: rgba(255,255,255,0.75);
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 10px 14px;
    }
    .ssp-price-icon, .ssp-zone-icon, .ssp-resp-icon { font-size: 1.1rem; }

    /* ── Services list ── */
    .ssp-services-title {
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.45);
      margin-bottom: 10px;
    }
    .ssp-services-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .ssp-service-tag {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 5px 12px;
      font-size: 0.83rem;
      color: rgba(255,255,255,0.85);
    }

    /* ── CTA ── */
    .ssp-cta {
      display: block;
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #E1306C, #C13584);
      color: #fff;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 700;
      border: none;
      border-radius: 16px;
      text-align: center;
      cursor: pointer;
      text-decoration: none;
      margin-top: 8px;
      transition: opacity 0.2s;
    }
    .ssp-cta:hover { opacity: 0.9; text-decoration: none; color: #fff; }

    /* ── Claim CTA ── */
    .ssp-claim-cta {
      margin-top: 20px;
      padding: 16px;
      border: 1px dashed rgba(255,255,255,0.2);
      border-radius: 14px;
      text-align: center;
    }
    .ssp-claim-text { font-size: 0.88rem; color: rgba(255,255,255,0.55); margin-bottom: 8px; }
    .ssp-claim-btn {
      font-size: 0.85rem;
      color: rgba(225,48,108,0.9);
      border: 1px solid rgba(225,48,108,0.4);
      border-radius: 10px;
      padding: 7px 14px;
      display: inline-block;
    }
    .ssp-claim-btn:hover { background: rgba(225,48,108,0.08); text-decoration: none; }

    /* ── Related links ── */
    .ssp-related {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 16px;
      padding: 20px 24px;
      margin-top: 8px;
    }
    .ssp-related-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.4);
      margin-bottom: 12px;
      font-weight: 600;
    }
    .ssp-related-list { display: flex; flex-direction: column; gap: 8px; }
    .ssp-related-list a {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.65);
      padding: 2px 0;
    }
    .ssp-related-list a:hover { color: #E1306C; }

    /* ── Back nav ── */
    .ssp-back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
      margin-bottom: 16px;
    }
    .ssp-back:hover { color: rgba(255,255,255,0.8); text-decoration: none; }

    /* ── Footer ── */
    .ssp-footer {
      margin-top: 48px;
      text-align: center;
      font-size: 0.78rem;
      color: rgba(255,255,255,0.3);
    }
    .ssp-footer a { color: rgba(255,255,255,0.4); }

    /* ── Mobile ── */
    @media (max-width: 480px) {
      .ssp-page { padding: 16px 12px 48px; }
      .ssp-card { padding: 24px 16px; }
    }
  </style>
</head>
<body>
<main class="ssp-page" role="main">

  <!-- Back link -->
  <a href="https://www.fixeo.ma/" class="ssp-back" aria-label="Retour à l'accueil Fixeo">
    ← Fixeo.ma
  </a>

  <!-- Visible breadcrumb navigation (also in BreadcrumbList JSON-LD above) -->
  <!-- hrefs are fixeo.ma generated URLs — no user input in href -->
  <nav class="ssp-breadcrumb" aria-label="Fil d'Ariane">
    <a href="https://www.fixeo.ma/">Fixeo</a>
    <span class="ssp-breadcrumb-sep" aria-hidden="true">›</span>
    <a href="${esc(lpHref)}">${esc(lpTextRaw)}</a>
    <span class="ssp-breadcrumb-sep" aria-hidden="true">›</span>
    <span aria-current="page">${esc(rawName)}</span>
  </nav>

  <!-- Main profile card -->
  <article class="ssp-card" itemscope itemtype="https://schema.org/ProfessionalService">

    <!-- Photo or hero or RAFI fallback -->
    ${photoSection}

    <!-- H1 — exactly one per page; esc() on rawName -->
    <h1 class="ssp-h1" itemprop="name">${esc(rawName)}</h1>

    <!-- Profession + city; rawLabel from hardcoded map (trusted), rawCity esc()d -->
    <p class="ssp-subtitle" itemprop="serviceType">
      ${esc(rawLabel)} à <span itemprop="areaServed">${esc(rawCity)}</span>
    </p>

    <!-- Status badges -->
    <div class="ssp-badges">
      ${availBadge(artisan)}
      ${rawBadgeLabel ? `<span class="ssp-badge ssp-badge--new">${esc(rawBadgeLabel)}</span>` : ''}
    </div>

    <!-- Public description; rawDescription esc()d -->
    ${rawDescription
      ? `<p class="ssp-description" itemprop="description">${esc(rawDescription)}</p>`
      : ''}

    <!-- Info rows: price, zone, response time -->
    <div class="ssp-info-rows">
      ${priceSection}
      ${zoneSection}
      ${respSection}
    </div>

    <!-- Services offered -->
    ${rawServices.length ? `<p class="ssp-services-title">Services proposés</p>${svcsSection}` : ''}

    <!-- Main CTA — slug already validated by SLUG_RE (alphanum + hyphens only) -->
    <a href="https://www.fixeo.ma/?open=request&amp;artisan=${esc(rawSlugVal)}"
       class="ssp-cta"
       rel="nofollow">
      Demander une intervention →
    </a>

    <!-- Claim CTA (unclaimed profiles only) -->
    ${claimSection}

  </article>

  <!-- Internal links — city & service pages -->
  ${relLinksHtml}

  <!-- Footer -->
  <footer class="ssp-footer" role="contentinfo">
    <p>
      Profil publié sur
      <a href="https://www.fixeo.ma/" itemprop="url">Fixeo.ma</a>
      — Annuaire d'artisans vérifiés au Maroc.
    </p>
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

/* ── 404 HTML ── */
function build404Html(slug) {
  const safeSlug = esc(slug || '');
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profil introuvable | Fixeo</title>
  <meta name="robots" content="noindex, follow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', sans-serif;
      background: linear-gradient(135deg, #0D0D1A, #1a1a2e, #16213e);
      color: #e8eaf0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .err-box {
      max-width: 480px;
      text-align: center;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 48px 32px;
    }
    h1 { font-size: 1.4rem; margin-bottom: 12px; color: #fff; }
    p { color: rgba(255,255,255,0.6); font-size: 0.95rem; margin-bottom: 24px; line-height: 1.6; }
    a {
      display: inline-block;
      padding: 12px 28px;
      background: linear-gradient(135deg, #E1306C, #C13584);
      color: #fff;
      border-radius: 12px;
      font-weight: 700;
      text-decoration: none;
    }
    a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="err-box">
    <h1>Profil introuvable</h1>
    <p>Le profil artisan <strong>${safeSlug}</strong> n'existe pas ou n'est plus disponible sur Fixeo.</p>
    <a href="https://www.fixeo.ma/">Trouver un artisan →</a>
  </div>
</body>
</html>`;
}

/* ── 503 HTML ── */
function build503Html() {
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service temporairement indisponible | Fixeo</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', sans-serif;
      background: #0D0D1A;
      color: #e8eaf0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .err-box {
      max-width: 440px;
      text-align: center;
      padding: 48px 32px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
    }
    h1 { font-size: 1.3rem; margin-bottom: 12px; }
    p { color: rgba(255,255,255,0.55); font-size: 0.9rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="err-box">
    <h1>Service temporairement indisponible</h1>
    <p>Nous rencontrons un problème technique momentané. Veuillez réessayer dans quelques secondes.</p>
  </div>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
   VERCEL SERVERLESS HANDLER
   ═══════════════════════════════════════════════════════════════ */
module.exports = async function handler(req, res) {
  /* ── Only GET/HEAD allowed ── */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end('Method Not Allowed');
    return;
  }

  /* ── Extract slug from URL ── */
  /* Route in vercel.json: /artisan/(.+) → this function */
  /* req.query.slug is injected by vercel.json route capture */
  const rawSlug = (req.query.slug || '').trim().toLowerCase();

  /* ── Slug validation: HTTP 400 for malformed ── */
  if (!rawSlug || !SLUG_RE.test(rawSlug)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400).send(build404Html(rawSlug));
    return;
  }

  /* ── Supabase fetch — anon key, explicit field list ── */
  let artisan = null;
  try {
    const supabaseUrl =
      `${SUPABASE_URL}/rest/v1/artisans` +
      `?select=${encodeURIComponent(PUBLIC_FIELDS)}` +
      `&public_slug=eq.${encodeURIComponent(rawSlug)}` +
      `&limit=1`;

    const response = await fetch(supabaseUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000), // 8s timeout
    });

    if (!response.ok) {
      /* Supabase returned an error status → 503 */
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(503).send(build503Html());
      return;
    }

    const data = await response.json();
    artisan = Array.isArray(data) && data.length > 0 ? data[0] : null;

  } catch (err) {
    /* Network error, timeout → 503 */
    console.error('[artisan-profile] Supabase fetch error:', err.message);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(503).send(build503Html());
    return;
  }

  /* ── Not found → HTTP 404 ── */
  if (!artisan) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(build404Html(rawSlug));
    return;
  }

  /* ── Inactive profile → HTTP 404 ── */
  /* Choice: 404 (not 410) because unclaimed/inactive profiles may become active again.
     410 Gone signals permanent removal — inappropriate here. */
  if (artisan.availability === 'inactive' || artisan.availability === 'deleted') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(build404Html(rawSlug));
    return;
  }

  /* ── Valid profile → HTTP 200 ── */
  const html = buildProfileHtml(artisan);

  /* CDN cache: 1 hour fresh, stale served up to 24h while revalidating */
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('X-Artisan-Slug', rawSlug); // Debug header — harmless

  res.status(200).send(html);
};
