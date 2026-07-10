#!/usr/bin/env node
/**
 * FIXEO Blog Engine — generate-blog.js
 * Version: bloggen-v1a — 2026-06-12
 * ─────────────────────────────────────────────────────────
 * Reads article definitions from blog/_content/*.json
 * Generates /blog/<slug>.html static pages at build time.
 * Generates /blog-index.html (category listing).
 * Auto-updates sitemap-blog.xml.
 *
 * Article JSON schema (blog/_content/prix-serrurier-maroc.json):
 * {
 *   "slug": "prix-serrurier-maroc",
 *   "category": "prix",
 *   "service": "serrurier",
 *   "city": null,
 *   "title": "Prix d'un serrurier au Maroc en 2026",
 *   "meta_desc": "...",
 *   "date": "2026-06-12",
 *   "hero_image": "/img/blog/serrurier-prix.webp",
 *   "tags": ["serrurier", "prix", "maroc"],
 *   "sections": [
 *     { "type": "intro",   "content": "..." },
 *     { "type": "h2",      "title": "...", "content": "..." },
 *     { "type": "table",   "caption": "...", "headers": [...], "rows": [[...]] },
 *     { "type": "tip",     "content": "..." },
 *     { "type": "faq",     "items": [ {"q":"...", "a":"..."} ] },
 *     { "type": "cta",     "text": "...", "href": "...", "label": "..." }
 *   ]
 * }
 *
 * Categories:
 *   prix        — pricing guides
 *   guide       — how-to guides
 *   urgence     — emergency advice
 *   comparatif  — comparisons
 *   villes      — city-specific articles
 *   conseils    — tips & maintenance
 *
 * Usage:
 *   node scripts/generate-blog.js                    # generate all articles
 *   node scripts/generate-blog.js --slug=prix-serrurier-maroc
 *   node scripts/generate-blog.js --dry-run
 * ─────────────────────────────────────────────────────────
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const BLOG_DIR    = path.join(ROOT, 'blog');
const CONTENT_DIR = path.join(ROOT, 'blog', '_content');

const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const SLUG   = (args.find(a => a.startsWith('--slug=')) || '').split('=')[1];

const CATEGORIES = {
  prix:       { label: 'Tarifs & Prix',           icon: '💰', desc: 'Guides de prix par service au Maroc.' },
  guide:      { label: 'Guides pratiques',         icon: '📖', desc: 'Comment choisir, quand appeler, que faire.' },
  urgence:    { label: 'Urgences',                 icon: '🚨', desc: 'Conseils d\'urgence pour pannes et dépannages.' },
  comparatif: { label: 'Comparatifs',              icon: '⚖️', desc: 'Artisan certifié vs non certifié, devis multiples.' },
  villes:     { label: 'Guides par ville',         icon: '📍', desc: 'Artisans recommandés par ville au Maroc.' },
  conseils:   { label: 'Conseils & Entretien',     icon: '🔧', desc: 'Prévention, entretien et saisonnalité.' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  } catch(e) { return d; }
}

/* ── Section renderers ── */
function renderSection(sec, article) {
  switch (sec.type) {
    case 'intro':
      return `<p class="blog-intro">${esc(sec.content)}</p>`;

    case 'h2':
      return `<h2>${esc(sec.title)}</h2>
      ${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;

    case 'h3':
      return `<h3>${esc(sec.title)}</h3>
      ${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;

    case 'paragraph':
      return `<p>${esc(sec.content)}</p>`;

    case 'list':
      return `${sec.title ? `<p><strong>${esc(sec.title)}</strong></p>` : ''}
      <ul class="blog-list">
        ${(sec.items || []).map(i => `<li>${esc(i)}</li>`).join('\n        ')}
      </ul>`;

    case 'table':
      return `<figure class="blog-table-wrap">
        <figcaption>${esc(sec.caption || '')}</figcaption>
        <table class="blog-table" role="table">
          <thead><tr>${(sec.headers || []).map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${(sec.rows || []).map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n            ')}
          </tbody>
        </table>
      </figure>`;

    case 'tip':
      return `<aside class="blog-tip" role="note">
        <span class="blog-tip-icon">💡</span>
        <p>${esc(sec.content)}</p>
      </aside>`;

    case 'warning':
      return `<aside class="blog-warning" role="note">
        <span class="blog-tip-icon">⚠️</span>
        <p>${esc(sec.content)}</p>
      </aside>`;

    case 'faq':
      const faqLD = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': (sec.items || []).map(f => ({
          '@type': 'Question', 'name': f.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
        }))
      };
      return `<section class="blog-faq" itemscope itemtype="https://schema.org/FAQPage" aria-label="FAQ">
        <h2>Questions fréquentes</h2>
        ${(sec.items || []).map(f => `<details class="blog-faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
          <summary itemprop="name"><strong>${esc(f.q)}</strong></summary>
          <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
            <p itemprop="text">${esc(f.a)}</p>
          </div>
        </details>`).join('\n        ')}
      </section>
      <script type="application/ld+json">${JSON.stringify(faqLD)}</script>`;

    case 'cta':
      return `<div class="blog-cta">
        <p>${esc(sec.text || '')}</p>
        <a href="${esc(sec.href || '/index.html#services')}" class="blog-cta-btn">${esc(sec.label || 'Trouver un artisan')}</a>
      </div>`;

    case 'related':
      return `<div class="blog-related">
        <h3>Articles liés</h3>
        <ul>
          ${(sec.links || []).map(l => `<li><a href="/blog/${esc(l.slug)}">${esc(l.title)}</a></li>`).join('\n          ')}
        </ul>
      </div>`;

    default:
      return sec.content ? `<p>${esc(sec.content)}</p>` : '';
  }
}

function buildArticlePage(article) {
  const canonicalUrl = `https://www.fixeo.ma/blog/${article.slug}`;
  const cat = CATEGORIES[article.category] || { label: article.category, icon: '📝' };
  const bodyHtml = (article.sections || []).map(s => renderSection(s, article)).join('\n      ');
  const dateISO = article.date || new Date().toISOString().slice(0,10);
  const dateFR  = formatDate(dateISO);

  const articleLD = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': article.title,
    'description': article.meta_desc,
    'url': canonicalUrl,
    'datePublished': dateISO,
    'dateModified': article.date_modified || dateISO,
    'image': article.hero_image ? `https://fixeo.ma${article.hero_image}` : 'https://www.fixeo.ma/img/logo.png',
    'author': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://www.fixeo.ma/' },
    'publisher': { '@type': 'Organization', 'name': 'Fixeo', 'logo': { '@type': 'ImageObject', 'url': 'https://www.fixeo.ma/img/logo.png' } },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'keywords': (article.tags || []).join(', '),
    'articleSection': cat.label,
    'inLanguage': 'fr-MA'
  };

  const breadcrumbLD = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': 'https://www.fixeo.ma/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': 'https://www.fixeo.ma/blog' },
      { '@type': 'ListItem', 'position': 3, 'name': cat.label, 'item': `https://www.fixeo.ma/blog?cat=${article.category}` },
      { '@type': 'ListItem', 'position': 4, 'name': article.title, 'item': canonicalUrl }
    ]
  };

  const tagLinks = (article.tags || []).map(t =>
    `<a href="/blog?tag=${esc(t)}" class="blog-tag">${esc(t)}</a>`
  ).join(' ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-bloggen-v1a">
  <title>${esc(article.title)} | Blog Fixeo</title>
  <meta name="description" content="${esc(article.meta_desc)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(article.title)}">
  <meta property="og:description" content="${esc(article.meta_desc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${article.hero_image ? `https://fixeo.ma${esc(article.hero_image)}` : 'https://www.fixeo.ma/img/logo.png'}">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta property="article:published_time" content="${dateISO}">
  <meta property="article:section" content="${esc(cat.label)}">
  ${(article.tags||[]).map(t => `<meta property="article:tag" content="${esc(t)}">`).join('\n  ')}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(article.title)}">
  <meta name="twitter:description" content="${esc(article.meta_desc)}">

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(articleLD)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>

  <link rel="stylesheet" href="/css/blog-v1.css">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">

  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon { display:none !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text  { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
  </style>
</head>
<body class="blog-page" data-theme="dark">
  <a href="#main-content" class="skip-link">Aller au contenu</a>

  <nav class="navbar" role="navigation" aria-label="Navigation principale">
    <a href="/index.html" class="navbar-brand logo-wrap" aria-label="Fixeo — Accueil">
      <img src="/img/fixeo-logo.webp" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
    </a>
    <div class="nav-links">
      <a href="/index.html" class="nav-link">Accueil</a>
      <a href="/services.html" class="nav-link">Services</a>
      <a href="/blog" class="nav-link nav-link-active">Blog</a>
      <a href="/auth.html" class="btn-nav btn-nav-outline" data-auth="guest">Connexion</a>
    </div>
  </nav>

  <main id="main-content" role="main" class="blog-main">

    <article class="blog-article" itemscope itemtype="https://schema.org/Article">

      <header class="blog-article-header">
        <nav class="seo-breadcrumbs" aria-label="Fil d'Ariane">
          <a href="/index.html">Accueil</a>
          <span>›</span>
          <a href="/blog">Blog</a>
          <span>›</span>
          <a href="/blog?cat=${esc(article.category)}">${esc(cat.icon)} ${esc(cat.label)}</a>
          <span>›</span>
          <span itemprop="headline">${esc(article.title)}</span>
        </nav>

        <div class="blog-category-badge">
          <span class="blog-cat-icon">${esc(cat.icon)}</span>
          <span>${esc(cat.label)}</span>
        </div>

        <h1 itemprop="headline">${esc(article.title)}</h1>
        <p class="blog-lead" itemprop="description">${esc(article.meta_desc)}</p>

        <div class="blog-meta">
          <time datetime="${dateISO}" itemprop="datePublished">${dateFR}</time>
          <span class="blog-meta-sep">·</span>
          <span itemprop="author" itemscope itemtype="https://schema.org/Organization">
            <span itemprop="name">Fixeo</span>
          </span>
          ${(article.tags||[]).length ? `<span class="blog-meta-sep">·</span><div class="blog-tags">${tagLinks}</div>` : ''}
        </div>

        ${article.hero_image ? `
        <figure class="blog-hero-image">
          <img src="${esc(article.hero_image)}" alt="${esc(article.title)}"
               loading="eager" decoding="async" width="900" height="500"
               itemprop="image">
        </figure>` : ''}
      </header>

      <div class="blog-body" itemprop="articleBody">
        ${bodyHtml}
      </div>

      <footer class="blog-article-footer">
        <div class="blog-cta">
          <p>Besoin d'un artisan maintenant ?</p>
          <a href="/index.html#services" class="blog-cta-btn">Trouver un artisan Fixeo</a>
        </div>
        <div class="blog-tags blog-tags-footer">${tagLinks}</div>
      </footer>

    </article>

    <aside class="blog-sidebar" aria-label="Navigation blog">
      <div class="blog-sidebar-widget">
        <h3>Catégories</h3>
        <ul>
          ${Object.entries(CATEGORIES).map(([k,v]) =>
            `<li><a href="/blog?cat=${k}">${v.icon} ${esc(v.label)}</a></li>`
          ).join('\n          ')}
        </ul>
      </div>
      <div class="blog-sidebar-widget blog-sidebar-cta">
        <h3>Trouver un artisan</h3>
        <p>Artisans vérifiés disponibles dans votre ville.</p>
        <a href="/index.html#services" class="blog-cta-btn">Rechercher maintenant</a>
      </div>
    </aside>

  </main>

  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>

</body>
</html>`;
}

function buildIndexPage(articles) {
  const byCategory = {};
  articles.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  const catSections = Object.entries(CATEGORIES).map(([k, cat]) => {
    const catArticles = byCategory[k] || [];
    if (!catArticles.length) return '';
    const cards = catArticles.map(a => `<article class="blog-card">
          <a href="/blog/${esc(a.slug)}" class="blog-card-link">
            ${a.hero_image ? `<img src="${esc(a.hero_image)}" alt="${esc(a.title)}" loading="lazy" class="blog-card-img" width="400" height="225">` : ''}
            <div class="blog-card-body">
              <span class="blog-cat-badge">${esc(cat.icon)} ${esc(cat.label)}</span>
              <h3>${esc(a.title)}</h3>
              <p>${esc(a.meta_desc.slice(0, 120))}…</p>
              <time datetime="${esc(a.date)}">${formatDate(a.date)}</time>
            </div>
          </a>
        </article>`).join('\n        ');
    return `<section class="blog-category-section" aria-labelledby="cat-${k}">
      <h2 id="cat-${k}">${esc(cat.icon)} ${esc(cat.label)}</h2>
      <p class="blog-cat-desc">${esc(cat.desc)}</p>
      <div class="blog-card-grid">
        ${cards}
      </div>
    </section>`;
  }).filter(Boolean).join('\n    ');

  const sitemapEntries = articles.map(a =>
    `  <url>\n    <loc>https://www.fixeo.ma/blog/${a.slug}</loc>\n    <lastmod>${a.date || new Date().toISOString().slice(0,10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.70</priority>\n  </url>`
  ).join('\n');

  return {
    indexHtml: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-bloggen-v1a">
  <title>Blog Fixeo — Conseils, prix et guides artisans au Maroc</title>
  <meta name="description" content="Conseils pratiques, guides de prix et informations pour trouver le bon artisan au Maroc. Plomberie, électricité, serrurerie et plus.">
  <link rel="canonical" href="https://www.fixeo.ma/blog">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Blog Fixeo — Conseils artisans au Maroc">
  <meta property="og:description" content="Guides pratiques, tarifs et conseils pour trouver le bon artisan dans votre ville au Maroc.">
  <meta property="og:url" content="https://www.fixeo.ma/blog">
  <meta property="og:image" content="https://www.fixeo.ma/img/logo.png">
  <script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'Blog',
    'name':'Blog Fixeo','url':'https://www.fixeo.ma/blog',
    'description':'Conseils, guides de prix et informations artisans au Maroc.',
    'publisher':{'@type':'Organization','name':'Fixeo','url':'https://www.fixeo.ma/'},
    'inLanguage':'fr-MA'
  })}</script>
  <link rel="stylesheet" href="/css/blog-v1.css">
  <link rel="stylesheet" href="/css/main.css">
  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon { display:none !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text  { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
  </style>
</head>
<body class="blog-index-page" data-theme="dark">
  <a href="#main-content" class="skip-link">Aller au contenu</a>
  <nav class="navbar" role="navigation" aria-label="Navigation principale">
    <a href="/index.html" class="navbar-brand logo-wrap" aria-label="Fixeo — Accueil">
      <img src="/img/fixeo-logo.webp" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
    </a>
    <div class="nav-links">
      <a href="/index.html" class="nav-link">Accueil</a>
      <a href="/services.html" class="nav-link">Services</a>
      <a href="/blog" class="nav-link nav-link-active">Blog</a>
    </div>
  </nav>
  <main id="main-content" class="blog-index-main">
    <header class="blog-index-header">
      <h1>Blog Fixeo</h1>
      <p>Conseils pratiques, guides de prix et informations pour trouver le bon artisan au Maroc.</p>
      <div class="blog-cat-nav" aria-label="Catégories">
        ${Object.entries(CATEGORIES).map(([k,v]) =>
          `<a href="#cat-${k}" class="blog-cat-pill">${v.icon} ${v.label}</a>`
        ).join('\n        ')}
      </div>
    </header>
    ${catSections}
  </main>
  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>
</body>
</html>`,
    sitemapXml: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Fixeo Blog Sitemap — generated by bloggen-v1a -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.fixeo.ma/blog</loc>
    <lastmod>${new Date().toISOString().slice(0,10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.80</priority>
  </url>
${sitemapEntries}
</urlset>`
  };
}

/* ── MAIN ── */
if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });

const contentFiles = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
let articles = contentFiles.map(f => {
  try { return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')); }
  catch(e) { console.error(`[ERR] ${f}: ${e.message}`); return null; }
}).filter(Boolean);

if (SLUG) articles = articles.filter(a => a.slug === SLUG);

if (!articles.length) {
  console.log('No article definitions found in blog/_content/*.json');
  console.log('Create JSON files there to generate articles. See script header for schema.');
  process.exit(0);
}

articles.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

let generated = 0, errors = 0;
articles.forEach(article => {
  const html = buildArticlePage(article);
  const outPath = path.join(BLOG_DIR, `${article.slug}.html`);
  if (DRY) {
    console.log(`[DRY] /blog/${article.slug}.html`);
    generated++;
    return;
  }
  try {
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`[OK]  /blog/${article.slug}.html`);
    generated++;
  } catch(e) {
    console.error(`[ERR] ${article.slug}: ${e.message}`); errors++;
  }
});

// Blog index + sitemap
const { indexHtml, sitemapXml } = buildIndexPage(articles);
if (!DRY) {
  fs.writeFileSync(path.join(ROOT, 'blog-index.html'), indexHtml, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'sitemap-blog.xml'), sitemapXml, 'utf8');
  console.log('[OK]  /blog-index.html');
  console.log('[OK]  /sitemap-blog.xml');
} else {
  console.log('[DRY] /blog-index.html');
  console.log('[DRY] /sitemap-blog.xml');
}

console.log(`\nDone: ${generated} articles, ${errors} errors`);
