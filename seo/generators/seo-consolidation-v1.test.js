'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const master = JSON.parse(read('seo/data/seo-master-map-v1.json'));
const pseoPolicy = JSON.parse(read('seo/data/pseo-quality-policy-v1.json'));

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}
function meta(html, name) {
  const tags = html.match(/<meta\\b[^>]*>/gi) || [];
  const tag = tags.find(t => new RegExp(`name=["']${name}["']`, 'i').test(t));
  return tag ? ((tag.match(/content=["']([^"']*)["']/i) || [])[1] || '') : '';
}
function canonical(html) {
  return (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] || '';
}
function title(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
}

test('SEO-0 master map is frozen and covers the 11 Wave-1 intents', () => {
  assert.equal(master.version, 'seo-master-map-v1');
  assert.equal(master.wave1.length, 11);
  assert.deepEqual(master.rules.statuses, ['KEEP','UPGRADE','MERGE','REDIRECT','HOLD','NOINDEX']);
  assert.equal(master.rules.canonical_host, 'https://www.fixeo.ma');
  const seen = new Set();
  for (const row of master.wave1) {
    assert.ok(!seen.has(row.intent), 'duplicate intent ' + row.intent);
    seen.add(row.intent);
    assert.match(row.master, /^\/(plombier|electricien|serrurier|climatisation)\/[a-z-]+$/);
    assert.ok(Array.isArray(row.legacy));
    assert.ok(Array.isArray(row.support) && row.support.length >= 3);
  }
});

test('SEO-1 Wave-1 masters self-canonicalize and expose support graph', () => {
  for (const row of master.wave1) {
    const [service, city] = row.master.slice(1).split('/');
    const file = service + '-' + city + '.html';
    const html = read(file);
    assert.equal(canonical(html), 'https://www.fixeo.ma' + row.master, file + ' canonical');
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.match(html, /class="fxlp-section fxlp-intent-support"/, file + ' intent support block');
    for (const href of row.support) {
      assert.ok(html.includes('href="' + href + '"'), file + ' must link to ' + href);
    }
  }
});

test('SEO-1 legacy first-four service routes redirect permanently to clean canonical URLs', () => {
  const v = JSON.parse(read('vercel.legacy.json'));
  const routes = v.routes || [];
  const redirect = routes.find(r => String(r.src).includes('(plombier|electricien|serrurier|climatisation)-') && r.status === 301);
  assert.ok(redirect, 'legacy service-city redirect missing');
  assert.equal(redirect.headers?.Location, '/$1/$2');
  const cleanRewrites = new Set(routes.filter(r => /\^\/(plombier|electricien|serrurier|climatisation)\//.test(String(r.src))).map(r => r.src));
  assert.ok(cleanRewrites.size >= 4, 'clean service/city rewrites missing');
});

test('SEO-2 generated V3 service-city pages own the same support graph contract', () => {
  const generator = read('seo/generators/service-city-v3.js');
  assert.match(generator, /function buildIntentSupportHtml\(/);
  assert.match(generator, /\/prix\/plomberie\//);
  assert.match(generator, /\/panne-electrique\//);
  assert.match(generator, /\/porte-bloquee\//);
  assert.match(generator, /\/climatisation-en-panne\//);
  assert.match(generator, /GUIDES UTILES/);
});

test('SEO-3 high-value refreshed blog pages are current and truthful at metadata level', () => {
  const pages = [
    'blog/recharge-gaz-climatisation.html',
    'blog/prix-electricien-maroc.html',
    'blog/prix-climatisation-maroc.html',
    'blog/climatisation-agadir.html',
    'blog/urgence-plombier-casablanca.html',
    'blog/artisan-verifie-maroc.html',
  ];
  for (const file of pages) {
    const html = read(file);
    assert.ok(!/2025/.test(title(html)), file + ' stale title');
    assert.ok(!/2025/.test(meta(html, 'description')), file + ' stale meta description');
    assert.match(html, /"dateModified": "2026-09-29"/, file + ' dateModified');
    assert.ok(!/intervention en moins de 2h/i.test(html), file + ' unsupported fixed response time');
    assert.ok(!/Artisans vérifiés disponibles dans votre ville/i.test(html), file + ' unsupported availability claim');
  }
  const trust = read('blog/artisan-verifie-maroc.html');
  assert.ok(!/maintenu une note supérieure à 4\/5/i.test(trust));
  assert.ok(!/prendre en charge les frais de reprise/i.test(trust));
});

test('SEO-3 authority generator points internal links to clean canonical local routes', () => {
  const gen = read('scripts/generate-authority-blog-v3.js');
  for (const legacy of ['/plombier-casablanca','/electricien-rabat','/serrurier-tanger','/climatisation-marrakech']) {
    assert.ok(!gen.includes("['" + legacy + "'"), 'legacy internal link remains: ' + legacy);
  }
  for (const clean of ['/plombier/casablanca','/electricien/rabat','/serrurier/tanger','/climatisation/marrakech']) {
    assert.ok(gen.includes(clean), 'clean internal link missing: ' + clean);
  }
});

test('SEO-4 pSEO corpus is frozen and uses canonical URL shapes', () => {
  assert.equal(pseoPolicy.version, 'pseo-quality-gate-v1');
  assert.equal(pseoPolicy.current_limits.sitemap_pseo_urls, 391);
  const urls = locs(read('sitemap-pseo.xml'));
  assert.ok(urls.length <= 391, 'pSEO expansion beyond frozen gate');
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.ok(url.startsWith('https://www.fixeo.ma/'));
    assert.ok(!url.includes('.html'));
    assert.ok(!url.includes('?'));
  }
});

test('SEO-5 profile sitemap excludes unresolved and anonymous placeholder identities', () => {
  const urls = locs(read('sitemap-profiles.xml'));
  assert.ok(urls.length > 1000);
  for (const url of urls) {
    assert.ok(!/(ville-a-qualifier|\/unknown|participant-anonyme|membre-anonyme)/i.test(url), 'bad profile sitemap URL: ' + url);
  }
  const api = read('api/artisan-profile-fn/index.js');
  assert.match(api, /function isSeoPlaceholderProfile\(/);
  assert.match(api, /handlerSeoPlaceholder/);
  assert.match(api, /noindex, follow/);
});

test('SEO-6 sitemap index and robots advertise only the canonical sitemap host', () => {
  const index = read('sitemap-index.xml');
  const robots = read('robots.txt');
  assert.ok(locs(index).every(u => u.startsWith('https://www.fixeo.ma/')));
  assert.match(robots, /Sitemap: https:\/\/www\.fixeo\.ma\/sitemap-index\.xml/);
  assert.ok(!index.includes('sitemap-lp-poc.xml</loc>'));
});

test('SEO-6 no DB migration is part of this consolidation contract', () => {
  const policy = read('seo/docs/seo-master-map-v1.md');
  assert.match(policy, /No mass noindex/);
  assert.match(policy, /No redirect of a ranking URL unless/);
});


test('SEO hotfix: climatisation Agadir blog keeps its own editorial canonical', () => {
  const html = read('blog/climatisation-agadir.html');
  assert.equal(canonical(html), 'https://www.fixeo.ma/blog/climatisation-agadir');
  assert.ok(html.includes('href="/climatisation/agadir"'));
  assert.ok(!html.includes('href="/electricien-agadir"'));
});
