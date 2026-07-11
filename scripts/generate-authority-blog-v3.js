#!/usr/bin/env node
/**
 * FIXEO Authority Blog Engine V3 — generate-authority-blog-v3.js
 * Version: authority-v3b — 2026-07-11
 * ─────────────────────────────────────────────────────────
 * Reads JSON files from blog/_content/authority/
 * Generates HTML files at blog/{slug}.html
 * Updates sitemap-blog.xml (appends new URLs, keeps existing)
 *
 * Changelog:
 *   authority-v3b  2026-07-11  Phase 6.2.5A.2 — full golden restoration:
 *     - Category-specific og:image / twitter:image / JSON-LD image
 *     - Author @id (https://www.fixeo.ma/#organization) — locked Phase 4.1 spec
 *     - wordCount from JSON source (golden values extracted from pre-regression baseline)
 *     - speakable specification in Article JSON-LD
 *     - Pretty-printed Article JSON-LD (matches golden format)
 *     - variables.css + blog-article-v3.css in <head>
 *     - blog-article-v3.js + reading-progress DOM (ba-progress-wrap)
 *     - SSR-format internal LP links (/service-city, not /service/city)
 *     - Canonical 6-city LP link set per service category
 *     - Intro CTA block with category-specific label/button
 *     - Author block v2 (blog-author-block-v2)
 *     - Consent CSS (fcv1b) in <head>, consent JS (fcv1b) before </body>
 *   authority-v3a  2026-06-12  Initial generator
 * ─────────────────────────────────────────────────────────
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..');
const BLOG_DIR      = path.join(ROOT, 'blog');
const AUTHORITY_DIR = path.join(ROOT, 'blog', '_content', 'authority');
const SITEMAP_BLOG  = path.join(ROOT, 'sitemap-blog.xml');

const args  = process.argv.slice(2);
const DRY   = args.includes('--dry-run');
const FORCE = args.includes('--force');

// ── Categories ───────────────────────────────────────────────
const CATEGORIES = {
  plomberie:     { label: 'Plomberie',            icon: '🔧', desc: 'Guides et conseils plomberie au Maroc.' },
  electricite:   { label: 'Électricité',          icon: '⚡', desc: 'Guides électricité pour votre maison.' },
  serrurerie:    { label: 'Serrurerie',           icon: '🔑', desc: 'Sécurité, serrures et accès au Maroc.' },
  climatisation: { label: 'Climatisation',        icon: '❄️', desc: 'Climatisation et ventilation au Maroc.' },
  prix:          { label: 'Tarifs & Prix',         icon: '💰', desc: 'Guides de prix par service au Maroc.' },
  urgence:       { label: 'Urgences',              icon: '🚨', desc: 'Conseils urgence et dépannage.' },
  confiance:     { label: 'Confiance & Garanties', icon: '🛡️', desc: 'Artisans vérifiés et garanties.' },
  local:         { label: 'Guides par ville',      icon: '📍', desc: 'Artisans et conseils par ville.' },
  guide:         { label: 'Guides pratiques',      icon: '📖', desc: 'Guides pratiques artisanat.' },
  conseils:      { label: 'Conseils & Entretien',  icon: '🔩', desc: 'Conseils entretien et prévention.' }
};

// ── Category → og/twitter/JSON-LD image (Phase 4.3 locked) ──
// og/twitter/JSON-LD use absolute URLs; hero <img src> uses root-relative path
const CATEGORY_IMAGES = {
  plomberie:     'https://www.fixeo.ma/img/blog/plomberie-blog.webp',
  electricite:   'https://www.fixeo.ma/img/blog/electricite-blog.webp',
  serrurerie:    'https://www.fixeo.ma/img/blog/serrurerie-blog.webp',
  climatisation: 'https://www.fixeo.ma/img/blog/climatisation-blog.webp',
  prix:          'https://www.fixeo.ma/img/blog/tarifs-blog.webp',
  urgence:       'https://www.fixeo.ma/img/blog/urgence-blog.webp',
  confiance:     'https://www.fixeo.ma/img/blog/confiance-blog.webp',
  local:         'https://www.fixeo.ma/img/blog/guides-blog.webp',
  guide:         'https://www.fixeo.ma/img/blog/guides-blog.webp',
  conseils:      'https://www.fixeo.ma/img/blog/guides-blog.webp'
};
// Root-relative paths for hero <img src> (matches golden format)
const CATEGORY_HERO_SRC = {
  plomberie:     '/img/blog/plomberie-blog.webp',
  electricite:   '/img/blog/electricite-blog.webp',
  serrurerie:    '/img/blog/serrurerie-blog.webp',
  climatisation: '/img/blog/climatisation-blog.webp',
  prix:          '/img/blog/tarifs-blog.webp',
  urgence:       '/img/blog/urgence-blog.webp',
  confiance:     '/img/blog/confiance-blog.webp',
  local:         '/img/blog/guides-blog.webp',
  guide:         '/img/blog/guides-blog.webp',
  conseils:      '/img/blog/guides-blog.webp'
};
const DEFAULT_IMAGE = 'https://www.fixeo.ma/img/fixeo-logo.webp';

// ── Category → Intro CTA block (Phase 4.4 locked) ───────────
const CATEGORY_CTA = {
  plomberie:     { icon: '🔧', label: 'Trouver un plombier vérifié',         desc: 'Intervention rapide, devis gratuit, artisan certifié Fixeo.',              btn: 'Demander un devis' },
  electricite:   { icon: '⚡', label: 'Trouver un électricien vérifié',      desc: 'Artisan certifié, intervention rapide, paiement sécurisé.',               btn: 'Trouver un électricien' },
  serrurerie:    { icon: '🔐', label: 'Trouver un serrurier vérifié',        desc: 'Serrurier disponible rapidement, tarifs transparents, certifié Fixeo.',  btn: 'Trouver un serrurier' },
  climatisation: { icon: '❄️', label: 'Trouver un technicien climatisation', desc: 'Installation et maintenance par un expert certifié Fixeo.',              btn: 'Trouver un technicien' }
};
const DEFAULT_CTA = { icon: '🔧', label: 'Trouver un artisan vérifié', desc: 'Artisan certifié, intervention rapide, paiement sécurisé.', btn: 'Trouver un artisan' };

// ── Category → SSR LP internal links (Phase 4.5 locked) ─────
// Format: /service-city (hyphen, SSR LP routes in vercel.json)
const CATEGORY_LP_LINKS = {
  plomberie: [
    ['/plombier-casablanca', 'Plombier Casablanca'],
    ['/plombier-rabat',      'Plombier Rabat'],
    ['/plombier-marrakech',  'Plombier Marrakech'],
    ['/plombier-fes',        'Plombier Fès'],
    ['/plombier-tanger',     'Plombier Tanger'],
    ['/plombier-agadir',     'Plombier Agadir']
  ],
  electricite: [
    ['/electricien-casablanca', 'Electricien Casablanca'],
    ['/electricien-rabat',      'Electricien Rabat'],
    ['/electricien-marrakech',  'Electricien Marrakech'],
    ['/electricien-fes',        'Electricien Fès'],
    ['/electricien-tanger',     'Electricien Tanger'],
    ['/electricien-agadir',     'Electricien Agadir']
  ],
  serrurerie: [
    ['/serrurier-casablanca', 'Serrurier Casablanca'],
    ['/serrurier-rabat',      'Serrurier Rabat'],
    ['/serrurier-marrakech',  'Serrurier Marrakech'],
    ['/serrurier-fes',        'Serrurier Fès'],
    ['/serrurier-tanger',     'Serrurier Tanger'],
    ['/serrurier-agadir',     'Serrurier Agadir']
  ],
  climatisation: [
    ['/climatisation-casablanca', 'Climatisation Casablanca'],
    ['/climatisation-rabat',      'Climatisation Rabat'],
    ['/climatisation-marrakech',  'Climatisation Marrakech']
  ]
};

// ── Build title lookup from all JSON sources (for related-article headings) ──
function buildTitleMap(authorityDir) {
  const map = {};
  try {
    const files = fs.readdirSync(authorityDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const art = JSON.parse(fs.readFileSync(path.join(authorityDir, f), 'utf8'));
        if (art.slug && art.title) map[art.slug] = art.title;
      } catch (e) { /* skip malformed */ }
    }
  } catch (e) { /* directory not found */ }
  return map;
}
const TITLE_MAP = buildTitleMap(AUTHORITY_DIR);

// ── Helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return d || ''; }
}

function countWords(text) {
  if (!text) return 0;
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 2).length;
}

function calcReadTime(sections, faq) {
  let words = 0;
  (sections || []).forEach(s => {
    if (s.content) words += countWords(s.content);
    if (s.title)   words += countWords(s.title);
  });
  (faq || []).forEach(f => { words += countWords(f.q); words += countWords(f.a); });
  return Math.max(3, Math.ceil(words / 200));
}

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

function renderSection(sec, idx) {
  const id = `section-${idx}`;
  switch (sec.type) {
    case 'intro':
      return `<p class="blog-intro">${esc(sec.content)}</p>`;
    case 'h2':
      return `<h2 id="${id}">${esc(sec.title)}</h2>\n${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;
    case 'h3':
      return `<h3 id="${id}">${esc(sec.title)}</h3>\n${sec.content ? `<p>${esc(sec.content)}</p>` : ''}`;
    case 'paragraph':
      return `<p>${esc(sec.content)}</p>`;
    case 'list':
      return `${sec.title ? `<p><strong>${esc(sec.title)}</strong></p>` : ''}\n<ul class="blog-list">\n  ${(sec.items || []).map(i => `<li>${esc(i)}</li>`).join('\n  ')}\n</ul>`;
    case 'tip':
      return `<aside class="blog-tip" role="note"><span class="blog-tip-icon">💡</span><p>${esc(sec.content)}</p></aside>`;
    case 'warning':
      return `<aside class="blog-warning" role="note"><span class="blog-tip-icon">⚠️</span><p>${esc(sec.content)}</p></aside>`;
    case 'cta':
      return `<div class="blog-cta-v2"><p>${esc(sec.text || '')}</p><a href="/?open=request" class="blog-cta-btn">Trouver un artisan</a></div>`;
    default:
      return sec.content ? `<p>${esc(sec.content)}</p>` : '';
  }
}

function buildRelatedSection(slugs) {
  if (!slugs || !slugs.length) return '';
  const cards = slugs.slice(0, 3).map(slug => {
    // Use full article title from title map (Phase 4.4 golden format)
    const title = TITLE_MAP[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<article class="blog-related-card">
    <a href="/blog/${esc(slug)}" class="blog-related-link"><h3>${esc(title)}</h3><span class="blog-reading-time-sm">→ Lire l'article</span>
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

function buildArticlePage(article) {
  const slug         = article.slug;
  const canonicalUrl = `https://www.fixeo.ma/blog/${slug}`;
  const cat          = CATEGORIES[article.category] || { label: article.category || 'Guide', icon: '📖', desc: '' };
  const today        = new Date().toISOString().slice(0, 10);
  const dateISO      = article.date || today;
  const dateFR       = formatDate(dateISO);
  const title        = article.title;
  const metaDesc     = article.meta_description || '';
  const tags         = article.tags || [];
  const faq          = article.faq || [];
  const sections     = article.sections || [];
  const readMin      = article.estimated_read_min || calcReadTime(sections, faq);

  // ── Category images (Phase 4.3 locked) ──────────────────
  // catImage: absolute URL for og/twitter/JSON-LD
  // catHeroSrc: root-relative for hero <img src>
  const catImage   = CATEGORY_IMAGES[article.category] || DEFAULT_IMAGE;
  const catHeroSrc = CATEGORY_HERO_SRC[article.category] || '/img/fixeo-logo.webp';

  // ── wordCount (from JSON source — Phase 4.4 golden values) ─
  const wordCount = article.wordCount || null;

  // ── TOC ───────────────────────────────────────────────────
  const tocHtml = buildTOC(sections);

  // ── Intro CTA (Phase 4.4 locked — inserted after section[0]) ─
  const cta = CATEGORY_CTA[article.category] || DEFAULT_CTA;
  const introCta = `      <div class="blog-intro-cta" role="complementary" aria-label="Trouver un artisan">
        <div class="blog-intro-cta-icon" aria-hidden="true">${cta.icon}</div>
        <div class="blog-intro-cta-text">
          <span class="blog-intro-cta-label">${esc(cta.label)}</span>
          <p class="blog-intro-cta-desc">${esc(cta.desc)}</p>
        </div>
        <a href="/?open=request" class="blog-intro-cta-btn">${esc(cta.btn)}</a>
      </div>`;

  // ── Body: intro section → intro CTA → remaining sections ─
  // Golden format: section[0] (intro) then CTA then sections[1+]
  const bodyParts = [];
  sections.forEach((s, idx) => {
    bodyParts.push(renderSection(s, idx));
    if (idx === 0) bodyParts.push(introCta);  // inject CTA after intro
  });
  const bodyHtml = bodyParts.join('\n');

  // ── Internal LP links (Phase 4.5 locked — /service-city SSR) ─
  const lpLinks = CATEGORY_LP_LINKS[article.category] || [];
  let internalLinksHtml = '';
  if (lpLinks.length) {
    const items = lpLinks.map(([href, label]) =>
      `<li><a href="${esc(href)}" class="lp-inline-link">${esc(label)}</a></li>`
    ).join('\n      ');
    internalLinksHtml = `<div class="blog-internal-links" aria-label="Pages de service associées">
        <span class="blog-internal-links-title">🗺️ Trouver un artisan dans votre ville</span>
        <ul>
      ${items}
      </ul></div>`;
  }

  // ── FAQ ───────────────────────────────────────────────────
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

  const relatedHtml = buildRelatedSection(article.related_articles);

  // ── Tag links ─────────────────────────────────────────────
  const tagLinks = tags.map(t => `<a href="/blog?tag=${esc(t)}" class="blog-tag">${esc(t)}</a>`).join(' ');

  // ── Article JSON-LD (pretty-printed, Phase 4.4 locked) ───
  const articleLD = {
    '@context':        'https://schema.org',
    '@type':           'Article',
    'headline':        title,
    'description':     metaDesc,
    'url':             canonicalUrl,
    'datePublished':   dateISO,
    'dateModified':    dateISO,
    'image':           catImage,
    'author': {
      '@type': 'Organization',
      '@id':   'https://www.fixeo.ma/#organization',
      'name':  'Fixeo',
      'url':   'https://www.fixeo.ma/'
    },
    'publisher': {
      '@type': 'Organization',
      'name':  'Fixeo',
      'logo':  { '@type': 'ImageObject', 'url': 'https://www.fixeo.ma/img/fixeo-logo.webp' }
    },
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'keywords':        tags.join(', '),
    'articleSection':  cat.label,
    'inLanguage':      'fr-MA'
  };
  if (wordCount) articleLD['wordCount'] = wordCount;
  articleLD['speakable'] = {
    '@type':      'SpeakableSpecification',
    'cssSelector': ['.blog-article-header h1', '.blog-lead', '.blog-intro']
  };

  const breadcrumbLD = {
    '@context':       'https://schema.org',
    '@type':          'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': 'https://www.fixeo.ma/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Blog',    'item': 'https://www.fixeo.ma/blog' },
      { '@type': 'ListItem', 'position': 3, 'name': cat.label, 'item': `https://www.fixeo.ma/blog?cat=${article.category}` },
      { '@type': 'ListItem', 'position': 4, 'name': title,     'item': canonicalUrl }
    ]
  };

  let faqLD = null;
  if (faq.length) {
    faqLD = {
      '@context':    'https://schema.org',
      '@type':       'FAQPage',
      'mainEntity':  faq.map(f => ({
        '@type':         'Question',
        'name':          f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
      }))
    };
  }

  // Pretty-print Article JSON-LD to match golden format
  const articleLDPretty = JSON.stringify(articleLD, null, 2);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="fixeo-authority-v3a">
  <title>${esc(title)} | Blog Fixeo</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${catImage}">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${catImage}">
  <script type="application/ld+json">${articleLDPretty}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>
  ${faqLD ? `<script type="application/ld+json">${JSON.stringify(faqLD)}</script>` : ''}
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/blog-v1.css">
  <link rel="stylesheet" href="/css/blog-v2.css">
  <link rel="stylesheet" href="/css/blog-article-v3.css?v=1">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="icon" href="/img/favicon.ico" type="image/x-icon">
  <style id="fixeo-logo-override">
    .navbar-brand .logo-icon, .logo-wrap .logo-icon { display:none !important; }
    .navbar-brand .logo-text, .logo-wrap .logo-text  { display:none !important; }
    img.fixeo-logo-img { display:block !important; height:32px !important; width:auto !important; }
  </style>
  <link rel="stylesheet" href="/css/fixeo-consent-v1.css?v=fcv1b">
</head>
<body class="blog-page blog-v2 blog-authority" data-theme="dark">
<div id="ba-progress-wrap" aria-hidden="true"><div id="ba-progress"></div></div>
  <a href="#main-content" class="skip-link">Aller au contenu</a>
  <nav class="navbar" role="navigation" aria-label="Navigation principale">
    <a href="/" class="navbar-brand logo-wrap" aria-label="Fixeo — Accueil">
      <img src="/img/fixeo-logo.webp" alt="Fixeo" class="fixeo-logo-img" width="120" height="32">
    </a>
    <div class="nav-links">
      <a href="/" class="nav-link">Accueil</a>
      <a href="/services.html" class="nav-link">Services</a>
      <a href="/blog" class="nav-link nav-link-active">Blog</a>
      <a href="/auth.html" class="btn-nav btn-nav-outline" data-auth="guest">Connexion</a>
    </div>
  </nav>
  <main id="main-content" role="main" class="blog-main">
    <article class="blog-article" itemscope itemtype="https://schema.org/Article">
      <header class="blog-article-header">
        <nav class="seo-breadcrumbs blog-breadcrumb" aria-label="Fil d'Ariane">
          <a href="/">Fixeo</a>
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
      </header>
        <div class="blog-hero-image">
          <img src="${catHeroSrc}" alt="${esc(title)}" loading="eager" decoding="async" width="800" height="450">
        </div>
      ${tocHtml}
      <div class="blog-body" itemprop="articleBody">
        ${bodyHtml}
        ${internalLinksHtml}
      </div>
      ${topFaqHtml}
      <div class="blog-author-block-v2" role="complementary" aria-label="À propos de cet article">
        <div class="blog-author-header">
          <div class="blog-author-avatar-v2" aria-hidden="true">🛡️</div>
          <div class="blog-author-meta">
            <strong class="blog-author-name-v2">Guide éditorial Fixeo</strong>
            <span class="blog-author-role">Publié par l'équipe Fixeo</span>
          </div>
        </div>
        <p class="blog-author-bio-v2">Ce guide est publié par Fixeo, plateforme de mise en relation avec des artisans au Maroc. Les informations fournies sont d'ordre général — vérifiez toujours auprès d'un professionnel qualifié avant toute intervention.</p>
        <div class="blog-editorial-note" aria-label="Note éditoriale">
          <span class="blog-editorial-note-icon">📋</span>
          <span>Guide informatif Fixeo. Les tarifs, délais et procédures mentionnés sont indicatifs et peuvent varier selon votre situation et votre région.</span>
        </div>
      </div>
      <div class="blog-cta-v2" aria-label="Appel à l'action">
        <div class="blog-cta-v2-inner">
          <p class="blog-cta-title">🔧 Besoin d'un artisan vérifié ?</p>
          <p class="blog-cta-desc">Fixeo vous met en relation avec des professionnels qualifiés dans votre ville au Maroc — devis gratuit, paiement sécurisé après intervention.</p>
          <div class="blog-cta-btns">
            <a href="/?open=request" class="blog-cta-btn blog-cta-btn-primary">Demander un devis</a>
            <a href="/suivi" class="blog-cta-btn blog-cta-btn-secondary">Suivre mon intervention</a>
          </div>
        </div>
      </div>
      ${relatedHtml}
      <footer class="blog-article-footer">
        <div class="blog-tags blog-tags-footer">${tagLinks}</div>
      </footer>
    </article>
    <aside class="blog-sidebar" aria-label="Navigation blog">
      <div class="blog-sidebar-widget">
        <h3>Catégories</h3>
        <ul>
          <li><a href="/blog?cat=plomberie">🔧 Plomberie</a></li>
          <li><a href="/blog?cat=electricite">⚡ Électricité</a></li>
          <li><a href="/blog?cat=serrurerie">🔑 Serrurerie</a></li>
          <li><a href="/blog?cat=climatisation">❄️ Climatisation</a></li>
        </ul>
      </div>
      <div class="blog-sidebar-widget blog-sidebar-cta">
        <h3>Trouver un artisan</h3>
        <p>Artisans vérifiés disponibles dans votre ville.</p></div>
        <a href="/?open=request" class="blog-cta-btn">Demander un devis</a>
      </div>
    </aside>
  </main>
  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>
  <script src="/js/blog-article-v3.js?v=1" defer></script>
  <script src="/js/fixeo-consent-v1.js?v=fcv1b"></script>
</body>
</html>`;
}

// ── Update sitemap-blog.xml ───────────────────────────────────
function updateSitemapBlog(slugs, today) {
  let existing = '';
  if (fs.existsSync(SITEMAP_BLOG)) {
    existing = fs.readFileSync(SITEMAP_BLOG, 'utf8');
  }
  const newEntries = slugs.filter(slug => !existing.includes(`/blog/${slug}`)).map(slug =>
    `  <url>\n    <loc>https://www.fixeo.ma/blog/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.70</priority>\n  </url>`
  ).join('\n');
  if (!newEntries) return;
  const updated = existing.replace('</urlset>', newEntries + '\n</urlset>');
  fs.writeFileSync(SITEMAP_BLOG, updated, 'utf8');
  console.log(`[OK]  sitemap-blog.xml updated`);
}

// ── Main ──────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(AUTHORITY_DIR)) {
    console.log('No JSON files found in blog/_content/authority/');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const jsonFiles = fs.readdirSync(AUTHORITY_DIR).filter(f => f.endsWith('.json'));

  if (!jsonFiles.length) {
    console.log('No JSON files found in blog/_content/authority/');
    return;
  }

  const slugs = [];
  let generated = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const f of jsonFiles) {
    let article;
    try {
      article = JSON.parse(fs.readFileSync(path.join(AUTHORITY_DIR, f), 'utf8'));
    } catch (e) {
      console.error(`[ERR] ${f}: ${e.message}`);
      errors++;
      continue;
    }

    const slug = article.slug;
    if (!slug) { console.error(`[ERR] ${f}: missing slug`); errors++; continue; }

    const outPath = path.join(BLOG_DIR, `${slug}.html`);
    slugs.push(slug);

    if (!FORCE && fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    const html = buildArticlePage(article);
    if (DRY) {
      console.log(`[DRY] /blog/${slug}.html`);
    } else {
      fs.writeFileSync(outPath, html, 'utf8');
      console.log(`[OK]  /blog/${slug}.html`);
    }
    generated++;
  }

  if (!DRY) updateSitemapBlog(slugs, today);

  console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${errors} errors.`);
}

main();
