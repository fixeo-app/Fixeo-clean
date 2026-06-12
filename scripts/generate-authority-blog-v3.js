#!/usr/bin/env node
/**
 * FIXEO Authority Blog Engine V3 — generate-authority-blog-v3.js
 * Version: authority-v3a — 2026-06-12
 * ─────────────────────────────────────────────────────────
 * Reads JSON files from blog/_content/authority/
 * Generates HTML files at blog/{slug}.html
 * Updates sitemap-blog.xml (appends new URLs, keeps existing)
 * ─────────────────────────────────────────────────────────
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const BLOG_DIR     = path.join(ROOT, 'blog');
const AUTHORITY_DIR = path.join(ROOT, 'blog', '_content', 'authority');
const SITEMAP_BLOG = path.join(ROOT, 'sitemap-blog.xml');

const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const FORCE  = args.includes('--force');

// ── Categories ──────────────────────────────────────────────
const CATEGORIES = {
  plomberie:     { label: 'Plomberie',          icon: '🔧', desc: 'Guides et conseils plomberie au Maroc.' },
  electricite:   { label: 'Électricité',        icon: '⚡', desc: 'Guides électricité pour votre maison.' },
  serrurerie:    { label: 'Serrurerie',         icon: '🔑', desc: 'Sécurité, serrures et accès au Maroc.' },
  climatisation: { label: 'Climatisation',      icon: '❄️', desc: 'Climatisation et ventilation au Maroc.' },
  prix:          { label: 'Tarifs & Prix',       icon: '💰', desc: 'Guides de prix par service au Maroc.' },
  urgence:       { label: 'Urgences',            icon: '🚨', desc: 'Conseils urgence et dépannage.' },
  confiance:     { label: 'Confiance & Garanties', icon: '🛡️', desc: 'Artisans vérifiés et garanties.' },
  local:         { label: 'Guides par ville',    icon: '📍', desc: 'Artisans et conseils par ville.' },
  guide:         { label: 'Guides pratiques',    icon: '📖', desc: 'Guides pratiques artisanat.' },
  conseils:      { label: 'Conseils & Entretien', icon: '🔩', desc: 'Conseils entretien et prévention.' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  } catch(e) { return d || ''; }
}

function countWords(text) {
  if (!text) return 0;
  return text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(w => w.length > 2).length;
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
  const cards = slugs.slice(0,3).map(slug => {
    return `<article class="blog-related-card">
    <a href="/blog/${esc(slug)}" class="blog-related-link">
      <h4>${esc(slug.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase()))}</h4>
      <span class="blog-reading-time-sm">→ Lire l'article</span>
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
  const today        = new Date().toISOString().slice(0,10);
  const dateISO      = article.date || today;
  const dateFR       = formatDate(dateISO);
  const title        = article.title;
  const metaDesc     = article.meta_description || '';
  const tags         = article.tags || [];
  const faq          = article.faq || [];
  const sections     = article.sections || [];
  const readMin      = article.estimated_read_min || calcReadTime(sections, faq);

  const tocHtml = buildTOC(sections);

  const bodyParts = sections.map((s, idx) => renderSection(s, idx));
  const bodyHtml = bodyParts.join('\n');

  // Top-level FAQ
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

  // Internal links section
  let internalLinksHtml = '';
  if (article.internal_links && article.internal_links.length) {
    const linkItems = article.internal_links.map(l => `<li><a href="${esc(l)}" class="lp-inline-link">${esc(l.replace(/\//g,' ').trim().replace(/\b\w/g, c => c.toUpperCase()))}</a></li>`).join('\n      ');
    internalLinksHtml = `<div class="blog-internal-links"><ul>${linkItems}</ul></div>`;
  }

  const articleLD = {
    '@context': 'https://schema.org', '@type': 'Article',
    'headline': title, 'description': metaDesc,
    'url': canonicalUrl, 'datePublished': dateISO, 'dateModified': dateISO,
    'image': 'https://www.fixeo.ma/img/fixeo-logo.webp',
    'author': { '@type': 'Organization', 'name': 'Fixeo', 'url': 'https://www.fixeo.ma/' },
    'publisher': { '@type': 'Organization', 'name': 'Fixeo', 'logo': { '@type': 'ImageObject', 'url': 'https://www.fixeo.ma/img/fixeo-logo.webp' }},
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'keywords': tags.join(', '), 'articleSection': cat.label, 'inLanguage': 'fr-MA'
  };

  const breadcrumbLD = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': 'https://www.fixeo.ma/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': 'https://www.fixeo.ma/blog' },
      { '@type': 'ListItem', 'position': 3, 'name': cat.label, 'item': `https://www.fixeo.ma/blog?cat=${article.category}` },
      { '@type': 'ListItem', 'position': 4, 'name': title, 'item': canonicalUrl }
    ]
  };

  let faqLD = null;
  if (faq.length) {
    faqLD = {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      'mainEntity': faq.map(f => ({ '@type': 'Question', 'name': f.q, 'acceptedAnswer': { '@type': 'Answer', 'text': f.a }}))
    };
  }

  const tagLinks = tags.map(t => `<a href="/blog?tag=${esc(t)}" class="blog-tag">${esc(t)}</a>`).join(' ');

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
  <meta property="og:image" content="https://www.fixeo.ma/img/fixeo-logo.webp">
  <meta property="og:site_name" content="Fixeo">
  <meta property="og:locale" content="fr_MA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="https://www.fixeo.ma/img/fixeo-logo.webp">
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
<body class="blog-page blog-v2 blog-authority" data-theme="dark">
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
      ${tocHtml}
      <div class="blog-body" itemprop="articleBody">
        ${bodyHtml}
        ${internalLinksHtml}
      </div>
      ${topFaqHtml}
      <div class="blog-author-block">
        <div class="blog-author-avatar">🛡️</div>
        <div class="blog-author-info">
          <strong class="blog-author-name">Équipe Fixeo</strong>
          <p class="blog-author-bio">Nos experts artisans rédigent des guides de qualité pour vous aider à trouver le bon professionnel au Maroc. Tous nos artisans sont vérifiés et notés par de vrais clients.</p>
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
        <p>Artisans vérifiés disponibles dans votre ville.</p>
        <a href="/?open=request" class="blog-cta-btn">Demander un devis</a>
      </div>
    </aside>
  </main>
  <script src="/js/fixeo-header-global.js" defer></script>
  <script src="/js/fixeo-footer-global.js?v=gf3a" defer></script>
  <script src="/js/auth-global.js" defer></script>
</body>
</html>`;
}

// ── Update sitemap-blog.xml ────────────────────────────────
function updateSitemapBlog(slugs, today) {
  let existing = '';
  if (fs.existsSync(SITEMAP_BLOG)) {
    existing = fs.readFileSync(SITEMAP_BLOG, 'utf8');
  }
  const newEntries = slugs.filter(slug => !existing.includes(`/blog/${slug}`)).map(slug =>
    `  <url>\n    <loc>https://www.fixeo.ma/blog/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.70</priority>\n  </url>`
  ).join('\n');
  if (!newEntries) return;
  // Insert before </urlset>
  const updated = existing.replace('</urlset>', newEntries + '\n</urlset>');
  fs.writeFileSync(SITEMAP_BLOG, updated, 'utf8');
  console.log(`[OK]  sitemap-blog.xml updated with ${slugs.length} new URLs`);
}

// ── MAIN ────────────────────────────────────────────────────
if (!fs.existsSync(AUTHORITY_DIR)) {
  console.error(`[ERR] Directory not found: ${AUTHORITY_DIR}`);
  process.exit(1);
}

const jsonFiles = fs.readdirSync(AUTHORITY_DIR).filter(f => f.endsWith('.json'));
if (!jsonFiles.length) {
  console.log('No JSON files found in blog/_content/authority/');
  process.exit(0);
}

const today = new Date().toISOString().slice(0,10);
let generated = 0, errors = 0, skipped = 0;
const generatedSlugs = [];

jsonFiles.forEach(f => {
  let article;
  try {
    article = JSON.parse(fs.readFileSync(path.join(AUTHORITY_DIR, f), 'utf8'));
  } catch(e) {
    console.error(`[ERR] Parse error ${f}: ${e.message}`);
    errors++;
    return;
  }
  if (!article.slug) { console.error(`[ERR] Missing slug in ${f}`); errors++; return; }
  if (!article.date) article.date = today;

  const outPath = path.join(BLOG_DIR, `${article.slug}.html`);
  if (!FORCE && fs.existsSync(outPath)) {
    skipped++;
    return;
  }
  if (DRY) {
    console.log(`[DRY] /blog/${article.slug}.html`);
    generated++;
    generatedSlugs.push(article.slug);
    return;
  }
  try {
    const html = buildArticlePage(article);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`[OK]  /blog/${article.slug}.html`);
    generated++;
    generatedSlugs.push(article.slug);
  } catch(e) {
    console.error(`[ERR] ${article.slug}: ${e.message}`);
    errors++;
  }
});

if (!DRY && generatedSlugs.length) {
  updateSitemapBlog(generatedSlugs, today);
}

console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${errors} errors`);
