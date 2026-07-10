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

/* ── Avatar color → RAFI asset map ── */
/* When no real photo: use RAFI V2 BlackSilhouette as neutral fallback. */
const RAFI_FALLBACK_URL = '/rafi/RAFI_V2_BlackSilhouette.png';

/* ── HTML escape ── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── JSON-LD escape (for strings embedded in JSON) ── */
function escJson(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/* ── Service label resolution ── */
function svcLabel(category) {
  if (!category) return 'Artisan';
  const key = String(category).toLowerCase().trim();
  return SVC_LABELS[key] || category;
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
  const name       = esc(artisan.name || artisan.full_name || '');
  const city       = esc(artisan.city || '');
  const rawCity    = artisan.city || '';
  const category   = artisan.category || artisan.service_category || '';
  const label      = svcLabel(category);
  const slug       = artisan.public_slug || '';
  const photo      = artisan.photo_url || null;
  const hasPhoto   = !!photo;
  const services   = Array.isArray(artisan.services) ? artisan.services : [];
  const priceLabel = esc(artisan.price_label || '');
  const workZone   = esc(artisan.work_zone || '');
  const badgeLabel = esc(artisan.badge_label || '');
  const avail      = artisan.availability;
  const respTime   = artisan.response_time_min || 30;
  const isClaimed  = artisan.claimed || false;
  const description = artisan.description || '';

  /* Canonical URL */
  const canonicalUrl = `https://www.fixeo.ma/artisan/${esc(slug)}`;

  /* Title */
  const title = `${name} — ${label} à ${city} | Fixeo`;

  /* Meta description */
  const metaDesc = `${label} à ${city} — ${name}. ${esc(description.replace(/\.$/, ''))}. Profil sur Fixeo.ma.`;

  /* OG image: real photo OR RAFI fallback */
  const ogImage = hasPhoto ? esc(photo) : `https://www.fixeo.ma${RAFI_FALLBACK_URL}`;

  /* LP link for breadcrumb */
  const lpHref = lpUrl(category, rawCity) || 'https://www.fixeo.ma/services.html';
  const lpText = `${label}s à ${city}`;

  /* Related internal links */
  const relLinks = buildRelatedLinks(artisan);

  /* JSON-LD */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService',
        '@id': `${canonicalUrl}#service`,
        'name': escJson(name),
        'description': escJson(description),
        'url': canonicalUrl,
        'image': ogImage,
        'areaServed': { '@type': 'City', 'name': escJson(artisan.city || '') },
        'serviceType': escJson(label),
        'provider': {
          '@type': 'Organization',
          '@id': 'https://www.fixeo.ma/#organization',
          'name': 'Fixeo',
          'url': 'https://www.fixeo.ma/'
        },
        'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
        ...(artisan.price_from ? {
          'priceRange': `À partir de ${artisan.price_from} DH`,
          'offers': {
            '@type': 'Offer',
            'priceCurrency': 'MAD',
            'price': String(artisan.price_from),
            'availability': avail === 'available'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock'
          }
        } : {}),
        ...(services.length ? {
          'hasOfferCatalog': {
            '@type': 'OfferCatalog',
            'name': escJson(`Services ${label} à ${artisan.city || ''}`),
            'itemListElement': services.map(s => ({
              '@type': 'Offer',
              'name': escJson(s)
            }))
          }
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Fixeo', 'item': 'https://www.fixeo.ma/' },
          { '@type': 'ListItem', 'position': 2, 'name': escJson(label + 's'), 'item': lpHref },
          { '@type': 'ListItem', 'position': 3, 'name': escJson(name), 'item': canonicalUrl }
        ]
      },
      {
        '@type': 'WebPage',
        '@id': canonicalUrl,
        'url': canonicalUrl,
        'name': escJson(title),
        'description': escJson(metaDesc),
        'inLanguage': 'fr-MA',
        'isPartOf': { '@id': 'https://www.fixeo.ma/#website' }
      }
    ]
  };

  /* Photo or RAFI fallback section */
  const photoSection = hasPhoto
    ? `<div class="ssp-avatar-wrap">
        <img class="ssp-avatar"
             src="${esc(photo)}"
             alt="${name}, ${esc(label)} à ${city}"
             width="120" height="120"
             loading="eager"
             fetchpriority="high"
             decoding="async">
      </div>`
    : `<div class="ssp-avatar-wrap ssp-avatar-wrap--fallback">
        <img class="rafi-img rafi-img--head ssp-rafi-fallback"
             src="${RAFI_FALLBACK_URL}"
             alt=""
             aria-hidden="true"
             width="120" height="120"
             loading="eager"
             decoding="async"
             onerror="this.style.display='none'">
      </div>`;

  /* Services tags */
  const svcsSection = services.length
    ? `<ul class="ssp-services-list" aria-label="Services proposés">
        ${servicesHtml(services)}
      </ul>`
    : '';

  /* Price info */
  const priceSection = priceLabel
    ? `<div class="ssp-price">
        <span class="ssp-price-icon">💰</span>
        <span>${priceLabel}</span>
      </div>`
    : '';

  /* Zone info */
  const zoneSection = workZone
    ? `<div class="ssp-zone">
        <span class="ssp-zone-icon">📍</span>
        <span>Zone d'intervention : ${workZone}</span>
      </div>`
    : '';

  /* Response time */
  const respSection = `<div class="ssp-resp">
    <span class="ssp-resp-icon">⏱</span>
    <span>Réponse estimée : ${respTime} min</span>
  </div>`;

  /* Claim CTA */
  const claimSection = !isClaimed
    ? `<div class="ssp-claim-cta">
        <p class="ssp-claim-text">Êtes-vous <strong>${name}</strong> ?</p>
        <a href="https://www.fixeo.ma/rejoindre-fixeo.html" class="ssp-claim-btn">
          Rejoindre Fixeo &amp; revendiquer ce profil →
        </a>
      </div>`
    : '';

  /* Related links section */
  const relLinksHtml = relLinks.length
    ? `<nav class="ssp-related" aria-label="Pages liées">
        <h2 class="ssp-related-title">Voir aussi</h2>
        <ul class="ssp-related-list">
          ${relLinks.map(l => `<li><a href="${esc(l.href)}">${l.text}</a></li>`).join('\n          ')}
        </ul>
      </nav>`
    : '';

  /* ─── Full HTML ─── */
  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- SEO: Title — unique per artisan -->
  <title>${title}</title>

  <!-- SEO: Meta description — unique per artisan -->
  <meta name="description" content="${esc(metaDesc)}">

  <!-- SEO: Canonical — self-referencing -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- SEO: Robots -->
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">

  <!-- Open Graph -->
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${name} — ${esc(label)} à ${city}">
  <meta property="og:locale" content="fr_MA">
  <meta property="og:site_name" content="Fixeo">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@FixeoMaroc">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${ogImage}">

  <!-- JSON-LD: ProfessionalService + BreadcrumbList + WebPage -->
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
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
  <nav class="ssp-breadcrumb" aria-label="Fil d'Ariane">
    <a href="https://www.fixeo.ma/">Fixeo</a>
    <span class="ssp-breadcrumb-sep" aria-hidden="true">›</span>
    <a href="${esc(lpHref)}">${esc(lpText)}</a>
    <span class="ssp-breadcrumb-sep" aria-hidden="true">›</span>
    <span aria-current="page">${name}</span>
  </nav>

  <!-- Main profile card -->
  <article class="ssp-card" itemscope itemtype="https://schema.org/ProfessionalService">

    <!-- Photo or RAFI fallback -->
    ${photoSection}

    <!-- H1 — exactly one per page -->
    <h1 class="ssp-h1" itemprop="name">${name}</h1>

    <!-- Profession + city -->
    <p class="ssp-subtitle" itemprop="serviceType">
      ${esc(label)} à <span itemprop="areaServed">${city}</span>
    </p>

    <!-- Status badges -->
    <div class="ssp-badges">
      ${availBadge(artisan)}
      ${badgeLabel ? `<span class="ssp-badge ssp-badge--new">${badgeLabel}</span>` : ''}
    </div>

    <!-- Public description -->
    ${description
      ? `<p class="ssp-description" itemprop="description">${esc(description)}</p>`
      : ''}

    <!-- Info rows: price, zone, response time -->
    <div class="ssp-info-rows">
      ${priceSection}
      ${zoneSection}
      ${respSection}
    </div>

    <!-- Services offered -->
    ${services.length ? `<p class="ssp-services-title">Services proposés</p>${svcsSection}` : ''}

    <!-- Main CTA -->
    <a href="https://www.fixeo.ma/?open=request&artisan=${esc(slug)}"
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
