#!/usr/bin/env node
/**
 * FIXEO Blog Engine V2 — generate-blog-v2.js
 * Version: bloggen-v2a — 2026-06-12
 * ─────────────────────────────────────────────────────────
 * Enhanced blog generator with:
 *  - Reading time badge (word count / 200, rounded up)
 *  - Table of contents (auto from H2/H3 — inline box, not sidebar)
 *  - FAQ accordion using <details>/<summary> (CSS-only, no JS)
 *  - Related articles section (3 links)
 *  - Author block: "Équipe Fixeo" with 🛡️
 *  - CTA block: glass card, gradient border
 *  - Breadcrumb: Fixeo > Blog > Category > Title
 *  - Article JSON-LD, FAQPage JSON-LD, BreadcrumbList JSON-LD
 *  - OG tags (og:title, og:description, og:type=article, og:image)
 *  - Twitter card (summary_large_image)
 *  - Canonical → /blog/slug (clean URL, no .html)
 *  - Internal LP links: auto-inject <a href="/service/city"> on mentions
 *
 * JSON schema (superset of bloggen-v1a):
 * {
 *   "slug": "prix-plombier-maroc",
 *   "category": "prix",          // prix|urgence|confiance|local|guide|conseils|comparatif|villes
 *   "service": "plombier",
 *   "city": null,
 *   "title": "...",
 *   "meta_description": "...",   // also accepts meta_desc for v1 compat
 *   "date": "2026-06-12",
 *   "hero_image": "/img/blog/...",
 *   "tags": ["plombier", "prix", "maroc"],
 *   "estimated_read_min": 5,     // optional, auto-calculated if missing
 *   "related_articles": ["slug-1","slug-2","slug-3"],
 *   "internal_links": ["/plombier/casablanca", "/plombier/rabat"],
 *   "faq": [{"q":"...", "a":"..."}],  // top-level faq (preferred in v2)
 *   "sections": [...]             // same as v1
 * }
 *
 * Usage:
 *   node scripts/generate-blog-v2.js               # all articles
 *   node scripts/generate-blog-v2.js --slug=prix-plombier-maroc
 *   node scripts/generate-blog-v2.js --force        # force regenerate all
 *   node scripts/generate-blog-v2.js --dry-run
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
const FORCE  = args.includes('--force');
const SLUG   = (args.find(a => a.startsWith('--slug=')) || '').split('=')[1];

// ── Categories ──────────────────────────────────────────────
const CATEGORIES = {
  prix:       { label: 'Tarifs & Prix',           icon: '💰', desc: 'Guides de prix par service au Maroc.' },
  urgence:    { label: 'Urgences',                 icon: '🚨', desc: 'Conseils d\'urgence pour pannes et dépannages.' },
  confiance:  { label: 'Confiance & Garanties',   icon: '🛡️', desc: 'Artisans vérifiés, garanties et sécurité.' },
  local:      { label: 'Guides par ville',         icon: '📍', desc: 'Artisans et conseils par quartier et ville.' },
  guide:      { label: 'Guides pratiques',         icon: '📖', desc: 'Comment choisir, quand appeler, que faire.' },
  conseils:   { label: 'Conseils & Entretien',     icon: '🔧', desc: 'Prévention, entretien et saisonnalité.' },
  comparatif: { label: 'Comparatifs',              icon: '⚖️', desc: 'Artisan certifié vs non certifié, devis multiples.' },
  villes:     { label: 'Guides par ville',         icon: '📍', desc: 'Artisans recommandés par ville au Maroc.' }
};

// ── LP link injection map ────────────────────────────────────
const SERVICES = ['plombier', 'electricien', 'serrurier', 'climatisation', 'peinture'];
const CITIES = [
  'casablanca','rabat','marrakech','fes','tanger','agadir','meknes','oujda',
  'kenitra','temara','sale','mohammedia','khouribga','el-jadida','taza',
  'nador','beni-mellal','ouarzazate','safi','tetouan'
];
// Accent → slug map for city names in text
const CITY_ALIASES = {
  'casablanca': 'casablanca', 'rabat': 'rabat', 'marrakech': 'marrakech',
  'fès': 'fes', 'fes': 'fes', 'tanger': 'tanger', 'agadir': 'agadir',
  'meknès': 'meknes', 'meknes': 'meknes', 'oujda': 'oujda',
  'kénitra': 'kenitra', 'kenitra': 'kenitra', 'témara': 'temara',
  'salé': 'sale', 'sale': 'sale', 'mohammedia': 'mohammedia',
  'khouribga': 'khouribga', 'el jadida': 'el-jadida', 'el-jadida': 'el-jadida',
  'taza': 'taza', 'nador': 'nador', 'beni mellal': 'beni-mellal',
  'béni mellal': 'beni-mellal', 'ouarzazate': 'ouarzazate', 'safi': 'safi',
  'tétouan': 'tetouan', 'tetouan': 'tetouan'
};

// ── Helper functions ─────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  } catch(e) { return d; }
}

function countWords(text) {
  return text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(w => w.length > 2).length;
}

function calcReadTime(sections, faq) {
  let words = 0;
  (sections || []).forEach(s => {
    if (s.content) words += countWords(s.content);
    if (s.title)   words += countWords(s.title);
    if (s.items)   s.items.forEach(i => words += countWords(typeof i === 'string' ? i : (i.q || '') + ' ' + (i.a || '')));
    if (s.rows)    s.rows.forEach(r => r.forEach(c => words += countWords(c)));
  });
  (faq || []).forEach(f => { words += countWords(f.q); words += countWords(f.a); });
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Auto-inject LP links into plain text: finds "service à/de city" patterns
 * Only inject once per service/city pair to avoid flooding.
 */
function injectLpLinks(html, article) {
  const injected = new Set();
  // Inject for internal_links defined in article
  if (article.internal_links && article.internal_links.length) {
    article.internal_links.forEach(link => {
      // link = "/plombier/casablanca"
      const parts = link.replace(/^\//, '').split('/');
      if (parts.length !== 2) return;
      const [service, city] = parts;
      const key = `${service}-${city}`;
      if (injected.has(key)) return;
      // Find city mention in text (after tags, not inside existing links)
      const cityDisplay = Object.keys(CITY_ALIASES).find(k => CITY_ALIASES[k] === city) || city;
      // Simple replacement: first occurrence of city name not inside a tag/link
      const re = new RegExp(`(?<!href="[^"]*)(${cityDisplay})(?![^<]*</a>)`, 'i');
      if (re.test(html)) {
        html = html.replace(re, `<a href="${link}" class="lp-inline-link">$1</a>`);
        injected.add(key);
      }
    });
  }
  return html;
}

// ── TOC builder ──────────────────────────────────────────────
function buildTOC(sections) {
  const headings = [];
  (sections || []).forEach((s, idx) => {
    if (s.type === 'h2') headings.push({ level: 2, title: s.title, id: `section-${idx}` });
    if (s.type === 'h3') headings.push({ level: 3, title: s.title, id: `section-${idx}` });
  });
  if (headings.length < 2) return '';
  const items = headings.map(h => {
    const indent = h.level === 3 ? ' style="margin-left:1rem"' : '';
    return `<li${indent}><a href="#${h.id}">${esc(h.title)}</a></li>`;
  }).join('\n      ');
  return `<nav class="blog-toc" aria-label="Table des matières">
  <div class="blog-toc-inner">
    <span class="blog-toc-title">📋 Dans cet article</span>
    <ol class="blog-toc-list">
      ${items}
    </ol>
  </div>
</nav>`;
}

// ── Section renderers ─────────────────────────────────────────
function renderSection(sec, idx) {
  const id = `section-${idx}`;
  switch (sec.type) {
    case 'intro':
      return `<p class="blog-intro">${esc(sec.content)}</p>`;

    case 'h2':
      return `<h2 id="${id}">${esc(sec.title)}</h2>
${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;

    case 'h3':
      return `<h3 id="${id}">${esc(sec.title)}</h3>
${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;

    case 'paragraph':
      return `<p>${esc(sec.content)}</p>`;

    case 'list':
      return `${sec.title ? `<p><strong>${esc(sec.title)}</strong></p>` : ''}
<ul class="blog-list">
  ${(sec.items || []).map(i => `<li>${esc(i)}</li>`).join('\n  ')}
</ul>`;

    case 'table':
      return `<figure class="blog-table-wrap">
  <figcaption>${esc(sec.caption || '')}</figcaption>
  <table class="blog-table" role="table">
    <thead><tr>${(sec.headers || []).map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${(sec.rows || []).map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n      ')}
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
      return `<section class="blog-faq" aria-label="FAQ">
  <h2 id="${id}">Questions fréquentes</h2>
  ${(sec.items || []).map(f => `<details class="blog-faq-item">
    <summary><strong>${esc(f.q)}</strong></summary>
    <div class="blog-faq-answer"><p>${esc(f.a)}</p></div>
  </details>`).join('\n  ')}
</section>`;

    case 'cta':
      return `<div class="blog-cta-v2">
  <p>${esc(sec.text || '')}</p>
  <a href="${esc(sec.href || '/index.html?open=request')}" class="blog-cta-btn">${esc(sec.label || 'Trouver un artisan')}</a>
</div>`;

    case 'related':
      return `<div class="blog-related-inline">
  <h3>Articles liés</h3>
  <ul>
    ${(sec.links || []).map(l => `<li><a href="/blog/${esc(l.slug)}">${esc(l.title)}</a></li>`).join('\n    ')}
  </ul>
</div>`;

    default:
      return sec.content ? `<p>${esc(sec.content)}</p>` : '';
  }
}

// ── Related articles builder ──────────────────────────────────
function buildRelatedSection(slugs, allArticles) {
  const related = (slugs || []).slice(0, 3).map(slug => {
    return allArticles.find(a => a.slug === slug);
  }).filter(Boolean);
  if (!related.length) return '';
  const cards = related.map(a => {
    const cat = CATEGORIES[a.category] || { icon: '📝', label: a.category };
    const readMin = a.estimated_read_min || calcReadTime(a.sections, a.faq);
    return `<article class="blog-related-card">
    <a href="/blog/${esc(a.slug)}" class="blog-related-link">
      <span class="blog-related-cat">${esc(cat.icon)} ${esc(cat.label)}</span>
      <h4>${esc(a.title)}</h4>
      <span class="blog-reading-time-sm">⏱ ${readMin} min</span>
    </a>
  </article>`;
  }).join('\n  ');
  return `<section class="blog-related-articles" aria-label="Articles connexes">
  <h2>Articles connexes</h2>
  <div class="blog-related-grid">
    ${cards}
  </div>
</section>`;
}

// ── FAQ JSON-LD builder ───────────────────────────────────────
function buildFaqLD(faq, sections) {
  const allFaq = [...(faq || [])];
  (sections || []).forEach(s => {
    if (s.type === 'faq' && s.items) allFaq.push(...s.items);
  });
  if (!allFaq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': allFaq.map(f => ({
      '@type': 'Question',
      'name': f.q,
      'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
    }))
  };
}

// ── Main article page builder ────────────────────────────────
function buildArticlePage(article, allArticles) {
  const slug         = article.slug;
  const canonicalUrl = `https://fixeo.ma/blog/${slug}`;
  const cat          = CATEGORIES[article.category] || { label: article.category, icon: '📝', desc: '' };
  const dateISO      = article.date || new Date().toISOString().slice(0,10);
  const dateFR       = formatDate(dateISO);
  const title        = article.title;
  const metaDesc     = article.meta_description || article.meta_desc || '';
  const heroImg      = article.hero_image || null;
  const tags         = article.tags || [];
  const faq          = article.faq || [];
  const sections     = article.sections || [];

  // Reading time
  const readMin = article.estimated_read_min || calcReadTime(sections, faq);

  // TOC (from H2/H3 sections)
  const tocHtml = buildTOC(sections);

  // Body HTML
  const bodyParts = sections.map((s, idx) => renderSection(s, idx));
  let bodyHtml = bodyParts.join('\n');

  // Inline LP links injection
  bodyHtml = injectLpLinks(bodyHtml, article);

  // Top-level FAQ section (if faq[] provided at article root level, add after body)
  let topFaqHtml = '';
  if (faq.length) {
    topFaqHtml = `<section class="blog-faq" aria-label="FAQ">
  <h2>Questions fréquentes</h2>
  ${faq.map((f, i) => `<details class="blog-faq-item"${i === 0 ? ' open' : ''}>
    <summary><strong>${esc(f.q)}</strong></summary>
    <div class="blog-faq-answer"><p>${esc(f.a)}</p></div>
  </details>`).join('\n  ')}
</section>`;
  }

  // Related articles
  const relatedHtml = buildRelatedSection(article.related_articles, allArticles);

  // Structured Data
  const articleLD = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': title,
    'description': metaDesc,
    'url': canonicalUrl,
    'datePublished': dateISO,
    'dateModified': article.date_modified || dateISO,
    'image': heroImg ? `https://fixeo.ma${heroImg}` : 'https://fixeo.ma/img/logo.png',
    'author': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://fixeo.ma/' },
    'publisher': {
      '@type': 'Organization', 'name': 'Fixeo',
      'logo': { '@type': 'ImageObject', 'url': 'https://fixeo.ma/img/logo.png' }
    },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'keywords': tags.join(', '),
    'articleSection': cat.label,
    'inLanguage': 'fr-MA',
    'wordCount': readMin * 200
  };

  const breadcrumbLD = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': 'https://fixeo.ma/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': 'https://fixeo.ma/blog' },
      { '@type': 'ListItem', 'position': 3, 'name': cat.label, 'item': `https://fixeo.ma/blog?cat=${article.category}` },
      { '@type': 'ListItem', 'position': 4, 'name': title, 'item': canonicalUrl }
    ]
  };

  const faqLD = buildFaqLD(faq, sections);

  const tagLinks = tags.map(t =>
    `<a href="/blog?tag=${esc(t)}" class="blog-tag">${esc(t)}</a>`
  ).join(' ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-bloggen-v2a">
  <title>${esc(title)} | Blog Fixeo</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${heroImg ? `https://fixeo.ma${esc(heroImg)}` : 'https://fixeo.ma/img/logo.png'}">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta property="article:published_time" content="${dateISO}">
  <meta property="article:section" content="${esc(cat.label)}">
  ${tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('\n  ')}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${heroImg ? `https://fixeo.ma${esc(heroImg)}` : 'https://fixeo.ma/img/logo.png'}">

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(articleLD)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  ${faqLD ? `<script type="application/ld+json">${JSON.stringify(faqLD)}</script>` : ''}

  <link rel="stylesheet" href="/css/blog-v1.css">
  <link rel="stylesheet" href="/css/blog-v2.css">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">

  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon { display:none !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text  { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
  </style>
</head>
<body class="blog-page blog-v2" data-theme="dark">
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
        <!-- Breadcrumb -->
        <nav class="seo-breadcrumbs blog-breadcrumb" aria-label="Fil d'Ariane">
          <a href="/index.html">Fixeo</a>
          <span aria-hidden="true">›</span>
          <a href="/blog">Blog</a>
          <span aria-hidden="true">›</span>
          <a href="/blog?cat=${esc(article.category)}">${esc(cat.icon)} ${esc(cat.label)}</a>
          <span aria-hidden="true">›</span>
          <span itemprop="headline">${esc(title)}</span>
        </nav>

        <div class="blog-category-badge">
          <span class="blog-cat-icon">${esc(cat.icon)}</span>
          <span>${esc(cat.label)}</span>
        </div>

        <h1 itemprop="headline">${esc(title)}</h1>
        <p class="blog-lead" itemprop="description">${esc(metaDesc)}</p>

        <div class="blog-meta">
          <time datetime="${dateISO}" itemprop="datePublished">${dateFR}</time>
          <span class="blog-meta-sep">·</span>
          <span class="blog-reading-time">⏱ ${readMin} min de lecture</span>
          <span class="blog-meta-sep">·</span>
          <span itemprop="author" itemscope itemtype="https://schema.org/Organization">
            <span itemprop="name">Équipe Fixeo</span>
          </span>
          ${tags.length ? `<span class="blog-meta-sep">·</span><div class="blog-tags">${tagLinks}</div>` : ''}
        </div>

        ${heroImg ? `
        <figure class="blog-hero-image">
          <img src="${esc(heroImg)}" alt="${esc(title)}"
               loading="eager" decoding="async" width="900" height="500"
               itemprop="image">
        </figure>` : ''}
      </header>

      <!-- Table of Contents -->
      ${tocHtml}

      <div class="blog-body" itemprop="articleBody">
        ${bodyHtml}
      </div>

      <!-- Top-level FAQ -->
      ${topFaqHtml}

      <!-- Author block -->
      <div class="blog-author-block">
        <div class="blog-author-avatar">🛡️</div>
        <div class="blog-author-info">
          <strong class="blog-author-name">Équipe Fixeo</strong>
          <p class="blog-author-bio">Nos experts artisans rédigent des guides de qualité pour vous aider à trouver le bon professionnel au Maroc. Tous nos artisans sont vérifiés et notés par de vrais clients.</p>
        </div>
      </div>

      <!-- CTA Block -->
      <div class="blog-cta-v2" aria-label="Appel à l'action">
        <div class="blog-cta-v2-inner">
          <p class="blog-cta-title">🔧 Besoin d'un artisan vérifié ?</p>
          <p class="blog-cta-desc">Fixeo vous met en relation avec des professionnels qualifiés dans votre ville au Maroc — devis gratuit, paiement sécurisé après intervention.</p>
          <div class="blog-cta-btns">
            <a href="/index.html?open=request" class="blog-cta-btn blog-cta-btn-primary">Demander un devis</a>
            <a href="/suivi" class="blog-cta-btn blog-cta-btn-secondary">Suivre mon intervention</a>
          </div>
        </div>
      </div>

      <!-- Related Articles -->
      ${relatedHtml}

      <footer class="blog-article-footer">
        <div class="blog-tags blog-tags-footer">${tagLinks}</div>
      </footer>

    </article>

    <aside class="blog-sidebar" aria-label="Navigation blog">
      <div class="blog-sidebar-widget">
        <h3>Catégories</h3>
        <ul>
          ${Object.entries(CATEGORIES).filter(([k]) => ['prix','urgence','confiance','local','guide','conseils'].includes(k)).map(([k,v]) =>
            `<li><a href="/blog?cat=${k}">${v.icon} ${esc(v.label)}</a></li>`
          ).join('\n          ')}
        </ul>
      </div>
      <div class="blog-sidebar-widget blog-sidebar-cta">
        <h3>Trouver un artisan</h3>
        <p>Artisans vérifiés disponibles dans votre ville.</p>
        <a href="/index.html?open=request" class="blog-cta-btn">Demander un devis</a>
      </div>
    </aside>

  </main>

  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>

</body>
</html>`;
}

// ── Index page builder ───────────────────────────────────────
function buildIndexPage(articles) {
  const byCategory = {};
  articles.forEach(a => {
    const cat = a.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  });

  // Featured article (first/most recent)
  const featured = articles[0];
  const featuredCat = featured ? (CATEGORIES[featured.category] || { icon: '📝', label: featured.category }) : null;
  const featuredReadMin = featured ? (featured.estimated_read_min || calcReadTime(featured.sections, featured.faq)) : 0;

  const featuredHtml = featured ? `
  <section class="blog-featured" aria-labelledby="blog-featured-title">
    <a href="/blog/${esc(featured.slug)}" class="blog-featured-link">
      ${featured.hero_image ? `<div class="blog-featured-img-wrap">
        <img src="${esc(featured.hero_image)}" alt="${esc(featured.title)}" loading="eager" width="800" height="420">
      </div>` : ''}
      <div class="blog-featured-body">
        <span class="blog-cat-badge">${esc(featuredCat.icon)} ${esc(featuredCat.label)}</span>
        <span class="blog-reading-time">⏱ ${featuredReadMin} min</span>
        <h2 id="blog-featured-title" class="blog-featured-title">${esc(featured.title)}</h2>
        <p class="blog-featured-desc">${esc((featured.meta_description || featured.meta_desc || '').slice(0,180))}</p>
        <span class="blog-featured-cta">Lire l'article →</span>
      </div>
    </a>
  </section>` : '';

  // Category sections (skip featured in first category)
  const catOrder = ['prix','urgence','confiance','local','guide','conseils','comparatif','villes'];
  const catSections = catOrder.map(k => {
    const cat = CATEGORIES[k];
    if (!cat) return '';
    const catArticles = (byCategory[k] || []);
    if (!catArticles.length) return '';
    const cards = catArticles.map(a => {
      const readMin = a.estimated_read_min || calcReadTime(a.sections, a.faq);
      return `<article class="blog-card">
          <a href="/blog/${esc(a.slug)}" class="blog-card-link">
            ${a.hero_image ? `<img src="${esc(a.hero_image)}" alt="${esc(a.title)}" loading="lazy" class="blog-card-img" width="400" height="225">` : ''}
            <div class="blog-card-body">
              <span class="blog-cat-badge">${esc(cat.icon)} ${esc(cat.label)}</span>
              <h3>${esc(a.title)}</h3>
              <p>${esc((a.meta_description || a.meta_desc || '').slice(0,120))}…</p>
              <div class="blog-card-meta">
                <time datetime="${esc(a.date)}">${formatDate(a.date)}</time>
                <span class="blog-reading-time">⏱ ${readMin} min</span>
              </div>
            </div>
          </a>
        </article>`;
    }).join('\n        ');
    return `<section class="blog-category-section" aria-labelledby="cat-${k}">
      <h2 id="cat-${k}">${esc(cat.icon)} ${esc(cat.label)}</h2>
      <p class="blog-cat-desc">${esc(cat.desc)}</p>
      <div class="blog-card-grid">
        ${cards}
      </div>
    </section>`;
  }).filter(Boolean).join('\n    ');

  const sitemapEntries = articles.map(a =>
    `  <url>\n    <loc>https://fixeo.ma/blog/${a.slug}</loc>\n    <lastmod>${a.date || new Date().toISOString().slice(0,10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.70</priority>\n  </url>`
  ).join('\n');

  const catNavHtml = catOrder.filter(k => byCategory[k] && byCategory[k].length).map(k => {
    const cat = CATEGORIES[k];
    return `<a href="#cat-${k}" class="blog-cat-pill">${esc(cat.icon)} ${esc(cat.label)}</a>`;
  }).join('\n        ');

  return {
    indexHtml: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-bloggen-v2a">
  <title>Blog Fixeo — Conseils, prix et guides artisans au Maroc</title>
  <meta name="description" content="Conseils pratiques, guides de prix et informations pour trouver le bon artisan au Maroc. Plomberie, électricité, serrurerie et plus.">
  <link rel="canonical" href="https://fixeo.ma/blog">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Blog Fixeo — Conseils artisans au Maroc">
  <meta property="og:description" content="Guides pratiques, tarifs et conseils pour trouver le bon artisan dans votre ville au Maroc.">
  <meta property="og:url" content="https://fixeo.ma/blog">
  <meta property="og:image" content="https://fixeo.ma/img/logo.png">
  <script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'Blog',
    'name':'Blog Fixeo','url':'https://fixeo.ma/blog',
    'description':'Conseils, guides de prix et informations artisans au Maroc.',
    'publisher':{'@type':'Organization','name':'Fixeo','url':'https://fixeo.ma/'},
    'inLanguage':'fr-MA'
  })}</script>
  <link rel="stylesheet" href="/css/blog-v1.css">
  <link rel="stylesheet" href="/css/blog-v2.css">
  <link rel="stylesheet" href="/css/main.css">
  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon { display:none !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text  { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
  </style>
</head>
<body class="blog-index-page blog-v2" data-theme="dark">
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
        ${catNavHtml}
      </div>
    </header>
    ${featuredHtml}
    ${catSections}
  </main>
  <footer class="blog-index-footer">
    <p>Vous avez déjà fait une demande ? <a href="/suivi" class="blog-footer-link">Suivez votre intervention →</a></p>
  </footer>
  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>
</body>
</html>`,
    sitemapXml: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Fixeo Blog Sitemap — generated by bloggen-v2a -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://fixeo.ma/blog</loc>
    <lastmod>${new Date().toISOString().slice(0,10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.80</priority>
  </url>
${sitemapEntries}
</urlset>`
  };
}

// ── MAIN ────────────────────────────────────────────────────
if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });

const contentFiles = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
let articles = contentFiles.map(f => {
  try { return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')); }
  catch(e) { console.error(`[ERR] ${f}: ${e.message}`); return null; }
}).filter(Boolean);

if (SLUG) articles = articles.filter(a => a.slug === SLUG);

if (!articles.length) {
  console.log('No article definitions found in blog/_content/*.json');
  process.exit(0);
}

articles.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

let generated = 0, errors = 0;
articles.forEach(article => {
  const outPath = path.join(BLOG_DIR, `${article.slug}.html`);
  if (DRY) {
    console.log(`[DRY] /blog/${article.slug}.html`);
    generated++;
    return;
  }
  try {
    const html = buildArticlePage(article, articles);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`[OK]  /blog/${article.slug}.html`);
    generated++;
  } catch(e) {
    console.error(`[ERR] ${article.slug}: ${e.message}`);
    errors++;
  }
});

// Blog index + sitemap
if (!SLUG) {
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
}

console.log(`\nDone: ${generated} articles generated, ${errors} errors`);
