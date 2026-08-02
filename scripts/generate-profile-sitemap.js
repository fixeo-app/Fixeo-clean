#!/usr/bin/env node
/**
 * FIXEO Profile Sitemap Generator — generate-profile-sitemap.js
 * Version: fxprofile-sitemap-v2 — 2026-08-02
 * ─────────────────────────────────────────────────────────────
 *
 * Generates / validates sitemap-profiles.xml and updates the profiles
 * entry metadata in sitemap-index.xml.
 *
 * Usage:
 *   node scripts/generate-profile-sitemap.js --check   # (default) validate only
 *   node scripts/generate-profile-sitemap.js --write   # write files
 *
 * Environment variables (loaded from .env / .env.local if present, or
 * inherited from the shell):
 *   SUPABASE_URL       — Supabase project REST endpoint
 *   SUPABASE_ANON_KEY  — Supabase anon/publishable key (read-only)
 *
 * If env vars are absent, falls back to the project's anon/publishable
 * constants (same values hardcoded in api/artisan-profile-fn/index.js —
 * safe for a publishable read-only key committed elsewhere in the repo).
 *
 * Eligibility rules mirror the live SSR noindex gate in
 * api/artisan-profile-fn/index.js @ commit c849f29:
 *   1. public_slug non-empty and matches SLUG_RE
 *   2. availability ∉ {inactive, deleted}
 *   3. city.trim().toLowerCase() ∉ {ville à qualifier, unknown}
 *
 * Ordering: alphabetical by public_slug (case-insensitive, ASCII order).
 *   Tie is impossible given 0 duplicate slugs, but public_slug is the
 *   explicit tie-breaker.
 *
 * Output format:
 *   - UTF-8 XML, sitemap 0.9 namespace
 *   - <url> at 2-space indent, children at 4-space indent
 *   - blank line between <url> blocks
 *   - <lastmod> from artisan.updated_at (ISO date, first 10 chars)
 *   - <changefreq>weekly</changefreq>
 *   - <priority> 0.8 / 0.7 / 0.6 (see PRIORITY function)
 *   - no trailing newline after </urlset>
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('https');

/* ── Environment ──────────────────────────────────────────── */
/* Load .env / .env.local without a dependency on dotenv */
for (const envFile of ['.env', '.env.local']) {
  const p = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf-8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
}

/* Fallback to project anon constants (publishable/read-only key) */
const SUPABASE_URL  = process.env.SUPABASE_URL      || 'https://ztwtbgoqanqzvwiibtuh.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
  process.exit(1);
}

/* ── Paths ────────────────────────────────────────────────── */
const ROOT         = path.resolve(__dirname, '..');
const SITEMAP_FILE = path.join(ROOT, 'sitemap-profiles.xml');
const INDEX_FILE   = path.join(ROOT, 'sitemap-index.xml');

/* ── CLI flags ────────────────────────────────────────────── */
const args    = process.argv.slice(2);
const WRITE   = args.includes('--write');
const CHECK   = args.includes('--check') || !WRITE; /* default: check */

/* ── Constants ────────────────────────────────────────────── */
const SLUG_RE        = /^[a-z0-9][a-z0-9-]{3,118}[a-z0-9]$/;
const INVALID_CITIES = new Set(['ville à qualifier', 'unknown']);
const INVALID_AVAIL  = new Set(['inactive', 'deleted']);
const BASE_URL       = 'https://www.fixeo.ma/artisan/';

/* Core services and Tier-1 cities for priority assignment */
const CORE_SVC_KW = ['plomberie', 'electricite', 'électricité', 'serrurerie', 'climatisation'];
const TIER1_CITIES = new Set(['casablanca', 'rabat', 'marrakech', 'fes', 'fès', 'tanger', 'agadir']);

/* Today's ISO date for sitemap-index lastmod when writing */
const TODAY = new Date().toISOString().slice(0, 10);

/* ── Supabase REST fetch (paginated) ─────────────────────── */
function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Accept': 'application/json',
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchAllArtisans() {
  const fields = 'public_slug,city,availability,updated_at,category,name,full_name';
  const PAGE   = 1000;
  let offset   = 0;
  const rows   = [];
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/artisans` +
                `?select=${fields}&limit=${PAGE}&offset=${offset}&order=public_slug.asc`;
    const batch = await fetchJson(url);
    if (!Array.isArray(batch)) throw new Error(`Unexpected response shape at offset ${offset}`);
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  if (rows.length === 0) throw new Error('FATAL: zero rows returned — pagination may have failed');
  return rows;
}

/* ── Eligibility ─────────────────────────────────────────── */
function isEligible(row) {
  const slug  = (row.public_slug || '').trim();
  const city  = (row.city        || '').trim().toLowerCase();
  const avail = (row.availability || '').trim().toLowerCase();
  if (!slug)                          return { ok: false, reason: 'empty_slug' };
  if (!SLUG_RE.test(slug))            return { ok: false, reason: 'malformed_slug' };
  if (INVALID_AVAIL.has(avail))       return { ok: false, reason: 'invalid_avail' };
  if (INVALID_CITIES.has(city))       return { ok: false, reason: 'invalid_city' };
  return { ok: true };
}

/* ── Priority ────────────────────────────────────────────── */
function priority(row) {
  const cat  = (row.category || '').toLowerCase()
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e');
  const city = (row.city || '').trim().toLowerCase()
    .replace(/é/g, 'e').replace(/è/g, 'e');
  const isCore = CORE_SVC_KW.some(k => cat.includes(k.replace(/é/g,'e').replace(/è/g,'e')));
  const isT1   = TIER1_CITIES.has(city) || TIER1_CITIES.has(city.replace('è','e'));
  if (isCore && isT1) return '0.8';
  if (isCore)         return '0.7';
  return '0.6';
}

/* ── lastmod ─────────────────────────────────────────────── */
function lastmod(row) {
  const upd = row.updated_at || '';
  return (upd.length >= 10) ? upd.slice(0, 10) : TODAY;
}

/* ── XML builder ─────────────────────────────────────────── */
function buildSitemap(eligible, totalRows) {
  const excluded = totalRows - eligible.length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!--',
    '  Fixeo Artisan Profiles Sitemap — Phase 5.2',
    '  Format: /artisan/{public_slug} (SSR canonical, HTTP 200 + index,follow)',
    `  Generated: ${TODAY}`,
    `  Total artisan records in DB: ${totalRows}`,
    `  Eligible profiles (valid city + available): ${eligible.length}`,
    `  Excluded: ${excluded} (${excluded} unresolved city)`,
    '  Priority tiers:',
    '    0.8 = core service (Plomberie/Électricité/Serrurerie/Climatisation) + Tier-1 city',
    '    0.7 = core service, other cities',
    '    0.6 = other service categories',
    '  lastmod: sourced from artisan.updated_at field (ISO 8601 date)',
    '  Sorted by: public_slug (alphabetical)',
    '-->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '',
  ];

  for (const row of eligible) {
    lines.push(
      '  <url>',
      `    <loc>${BASE_URL}${row.public_slug}</loc>`,
      `    <lastmod>${lastmod(row)}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${priority(row)}</priority>`,
      '  </url>',
      '',
    );
  }

  lines.push('</urlset>');
  /* Join with newlines — no trailing newline after </urlset> (matches approved file) */
  return lines.join('\n');
}

/* ── sitemap-index updater ───────────────────────────────── */
function updateIndexFile(current, count) {
  /* Replace only the profiles sitemap lastmod and count comment */
  return current
    .replace(
      /(<loc>https:\/\/www\.fixeo\.ma\/sitemap-profiles\.xml<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/,
      `$1${TODAY}$2`
    )
    .replace(
      /<!--\s*Artisan profiles\s*\([^)]*\)/,
      `<!-- Artisan profiles (${count} eligible profiles — valid city, available, index,follow)`
    );
}

/* ── Self-validation ─────────────────────────────────────── */
function validate(xml, eligible) {
  const locs = [...xml.matchAll(/<loc>(https:\/\/www\.fixeo\.ma\/artisan\/[^<]+)<\/loc>/g)]
    .map(m => m[1]);
  const slugsInXml = locs.map(l => l.replace(BASE_URL, ''));
  const eligibleSet = new Set(eligible.map(r => r.public_slug));
  const xmlSet      = new Set(slugsInXml);

  const dupes    = slugsInXml.filter((s, i) => slugsInXml.indexOf(s) !== i);
  const malformed = slugsInXml.filter(s => s.includes('?') || s.includes('.html') || s.includes('/api/'));
  const inXmlNotEligible = slugsInXml.filter(s => !eligibleSet.has(s));
  const inEligibleNotXml = eligible.filter(r => !xmlSet.has(r.public_slug));

  const KNOWN_NOINDEX = [
    'mouad-mouad-ville-a-qualifier-8703-v2',
    'ahmad-aabid-ville-a-qualifier-8431-v2',
    'participant-anonyme-547-unknown-2402-after722',
  ];
  const KNOWN_VALID = [
    'air-tropical-casablanca-1081',
    'plombier-nourddine-rabat-5974',
    'ebentra-fes-1346',
    'iso-froid-tanger-1691',
    'cle-marrakech-marrakech-3393',
    'menage-lik-agadir-agadir-5657',
  ];

  return {
    count: locs.length,
    dupes, malformed, inXmlNotEligible, inEligibleNotXml,
    noindexAbsent:  KNOWN_NOINDEX.every(s => !xmlSet.has(s)),
    validPresent:   KNOWN_VALID.every(s => xmlSet.has(s)),
    ok: dupes.length === 0 && malformed.length === 0 &&
        inXmlNotEligible.length === 0 && inEligibleNotXml.length === 0,
  };
}

/* ── Main ────────────────────────────────────────────────── */
async function main() {
  console.log(`\n== FIXEO Profile Sitemap Generator (${WRITE ? 'WRITE' : 'CHECK'} mode) ==\n`);

  /* 1. Fetch */
  console.log('Fetching artisan rows from Supabase…');
  const allRows = await fetchAllArtisans();
  console.log(`  Total DB rows: ${allRows.length}`);

  /* 2. Classify */
  const eligible    = [];
  const excluded    = { invalid_city: [], invalid_avail: [], malformed_slug: [], empty_slug: [] };

  for (const row of allRows) {
    const { ok, reason } = isEligible(row);
    if (ok) {
      eligible.push(row);
    } else {
      (excluded[reason] || (excluded[reason] = [])).push(row.public_slug || '(empty)');
    }
  }

  /* 3. Sort — alphabetical by slug */
  eligible.sort((a, b) => a.public_slug < b.public_slug ? -1 : a.public_slug > b.public_slug ? 1 : 0);

  console.log(`  Eligible:       ${eligible.length}`);
  console.log(`  Excl city:      ${excluded.invalid_city.length}`);
  console.log(`  Excl avail:     ${excluded.invalid_avail.length}`);
  console.log(`  Excl malformed: ${excluded.malformed_slug.length}`);
  console.log(`  Excl empty:     ${excluded.empty_slug.length}`);

  /* 4. Build XML */
  const generated = buildSitemap(eligible, allRows.length);

  /* 5. Self-validate */
  const v = validate(generated, eligible);
  console.log(`\nSelf-validation:`);
  console.log(`  <loc> count:       ${v.count} (expected ${eligible.length})`);
  console.log(`  Duplicates:        ${v.dupes.length}`);
  console.log(`  Malformed:         ${v.malformed.length}`);
  console.log(`  In XML not elig:   ${v.inXmlNotEligible.length}`);
  console.log(`  In elig not XML:   ${v.inEligibleNotXml.length}`);
  console.log(`  Noindex absent:    ${v.noindexAbsent}`);
  console.log(`  Valid present:     ${v.validPresent}`);
  if (!v.ok) {
    console.error('\nFATAL: Self-validation failed. Refusing to write.');
    process.exit(1);
  }

  /* 6. Compare against tracked file */
  const currentXml = fs.readFileSync(SITEMAP_FILE, 'utf-8');
  const currentIdx = fs.readFileSync(INDEX_FILE,   'utf-8');

  /* Diff at slug level — match only <loc> entries, not comment lines */
  const currentSlugs   = [...currentXml.matchAll(/<loc>https:\/\/www\.fixeo\.ma\/artisan\/([^<\s]+)<\/loc>/g)].map(m => m[1]);
  const generatedSlugs = [...generated.matchAll(/<loc>https:\/\/www\.fixeo\.ma\/artisan\/([^<\s]+)<\/loc>/g)].map(m => m[1]);
  const curSet = new Set(currentSlugs);
  const genSet = new Set(generatedSlugs);
  const toAdd  = generatedSlugs.filter(s => !curSet.has(s));
  const toRem  = currentSlugs.filter(s => !genSet.has(s));

  /* Header comment differs because Generated date changes — compare slug-only */
  const byteMatch = (generated === currentXml);

  console.log(`\nComparison vs tracked sitemap-profiles.xml:`);
  console.log(`  Current entries:    ${currentSlugs.length}`);
  console.log(`  Expected entries:   ${generatedSlugs.length}`);
  console.log(`  To add:             ${toAdd.length}${toAdd.length ? '  ' + toAdd.slice(0,3).join(', ') : ''}`);
  console.log(`  To remove:          ${toRem.length}${toRem.length ? '  ' + toRem.slice(0,3).join(', ') : ''}`);
  console.log(`  Byte-for-byte:      ${byteMatch}`);

  /* Check sitemap-index profiles entry */
  const idxLastmod = (currentIdx.match(/sitemap-profiles[^<]*<\/loc>[^<]*<lastmod>([^<]+)<\/lastmod>/) || [])[1];
  console.log(`\nsitemap-index profiles lastmod: ${idxLastmod}`);

  if (CHECK && !WRITE) {
    const synced = toAdd.length === 0 && toRem.length === 0;
    if (synced) {
      console.log('\n✅ SYNCHRONIZED — sitemap-profiles.xml matches eligible corpus. No changes needed.');
      process.exit(0);
    } else {
      console.log('\n⚠️  DRIFT DETECTED — run with --write to update sitemap-profiles.xml.');
      process.exit(1);
    }
  }

  /* 7. Write mode */
  if (WRITE) {
    if (toAdd.length === 0 && toRem.length === 0 && byteMatch) {
      console.log('\n✅ ALREADY SYNCHRONIZED — no writes needed.');
      process.exit(0);
    }

    /* Atomic write via temp file */
    const tmpXml = SITEMAP_FILE + '.tmp';
    const tmpIdx = INDEX_FILE   + '.tmp';
    fs.writeFileSync(tmpXml, generated,                          'utf-8');
    fs.writeFileSync(tmpIdx, updateIndexFile(currentIdx, eligible.length), 'utf-8');
    fs.renameSync(tmpXml, SITEMAP_FILE);
    fs.renameSync(tmpIdx, INDEX_FILE);

    console.log(`\n✅ WRITTEN:`);
    console.log(`  sitemap-profiles.xml — ${eligible.length} entries (+${toAdd.length} -${toRem.length})`);
    console.log(`  sitemap-index.xml    — profiles lastmod → ${TODAY}, count → ${eligible.length}`);
    process.exit(0);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
