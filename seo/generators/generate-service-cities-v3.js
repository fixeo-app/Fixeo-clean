'use strict';
/**
 * generate-service-cities-v3.js
 * ==============================
 * Phase 4 Step 1 — Controlled rollout of approved V3 service×city pages.
 *
 * Generates ALL eligible service×city pages according to approved publishability doctrine:
 *   - existing URL + artisan_count >= 1 → MIGRATE_V3 (regenerate in V3)
 *   - existing URL + artisan_count == 0 → SKIP (REVIEW — not auto-published)
 *   - new URL + artisan_count >= 3 + city publishable:true → CREATE_V3
 *   - new URL + artisan_count < 3 → SKIP
 *
 * Artisan data: fetched live from Supabase (anon key, public fields only):
 *   name, public_slug, photo_url, description, price_label, price_from
 *   NO: id, phone, email, verified, rating, reviews, availability, etc.
 *
 * Deterministic output:
 *   - Artisans sorted by name ascending (stable, public field only)
 *   - Max 3 cards per page
 *   - Same generator as approved /plombier/casablanca pilot
 *
 * Usage:
 *   node seo/generators/generate-service-cities-v3.js [--dry-run]
 *
 * Output: repo root (cwd = fixeo-clean/)
 *
 * FILE: seo/generators/generate-service-cities-v3.js
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const { generateServiceCityPage } = require('./service-city-v3');
const { run: syncV3Css }          = require('./sync-v3-css');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT    = process.cwd();

// ── Supabase credentials (public anon key — same as artisan-profile-fn) ─────
const SUPABASE_URL  = 'https://ztwtbgoqanqzvwiibtuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_OGW8g7fM5ct1_ZFUxFIs-g_UzXuQPSk';

// ── Load canonical data ───────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, '../data');
const citiesRaw  = require(path.join(DATA_DIR, 'cities.json'));
const servicesRaw = require(path.join(DATA_DIR, 'services.json'));
const countsRaw   = require(path.join(DATA_DIR, 'artisan-counts.json'));

// Strip _meta
const CITIES   = Object.fromEntries(Object.entries(citiesRaw).filter(([k]) => k !== '_meta'));
const SERVICES = Object.fromEntries(Object.entries(servicesRaw).filter(([k]) => k !== '_meta'));
const COUNTS   = Object.fromEntries(Object.entries(countsRaw).filter(([k]) => k !== '_meta'));

const NEW_THRESHOLD = 3;

// ── Build rollout manifest ─────────────────────────────────────────────────────
function buildManifest() {
  const manifest = [];
  const publishableCities = Object.keys(CITIES).filter(c => CITIES[c].publishable === true);

  for (const svc of Object.keys(SERVICES).sort()) {
    for (const city of publishableCities.sort()) {
      const cnt    = (COUNTS[city] || {})[svc] || 0;
      const fname  = `${svc}-${city}.html`;
      const fpath  = path.join(ROOT, fname);
      const exists = fs.existsSync(fpath);

      let kind = null;
      if (exists && cnt >= 1)                           kind = 'EXISTING_ELIGIBLE';
      else if (exists && cnt === 0)                     kind = 'SKIP_ZERO_ARTISANS';
      else if (!exists && cnt >= NEW_THRESHOLD)         kind = 'NEW_ELIGIBLE';
      else if (!exists && cnt > 0 && cnt < NEW_THRESHOLD) kind = 'SKIP_BELOW_THRESHOLD';
      else                                               kind = 'SKIP_NO_ARTISANS';

      manifest.push({ svc, city, cnt, fname, fpath, exists, kind });
    }
  }
  return manifest;
}

// ── Fetch V3-safe artisan records from Supabase ────────────────────────────────
function fetchArtisans(supabaseCategory, cityLabel) {
  return new Promise((resolve, reject) => {
    // V3-safe fields only — no id, phone, email, verified, rating, availability
    const fields = 'name,public_slug,photo_url,description,price_label,price_from';
    const query  = [
      `select=${fields}`,
      `category=eq.${encodeURIComponent(supabaseCategory)}`,
      `city=eq.${encodeURIComponent(cityLabel)}`,
      `order=name.asc`,
      `limit=10`,   // fetch 10, generator takes max 3
    ].join('&');

    const options = {
      hostname: 'ztwtbgoqanqzvwiibtuh.supabase.co',
      path:     `/rest/v1/artisans?${query}`,
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Accept':        'application/json',
      },
      timeout: 10000,
    };

    const req = https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!Array.isArray(parsed)) {
            return reject(new Error(`Supabase returned non-array: ${data.slice(0,200)}`));
          }
          // Map to V3 artisan record format
          const records = parsed.map(r => {
            const rec = {
              name:        String(r.name  || '').trim(),
              publicSlug:  r.public_slug  || null,
              photoUrl:    r.photo_url    || null,
              description: r.description  || null,
              priceLabel:  r.price_label  || (r.price_from ? `À partir de ${r.price_from} DH` : null),
            };
            // Remove null values to keep records lean
            Object.keys(rec).forEach(k => { if (rec[k] === null) delete rec[k]; });
            return rec;
          }).filter(r => r.name);  // filter out blank names (generator also validates, but be safe)
          resolve(records);
        } catch (e) {
          reject(new Error(`JSON parse error from Supabase: ${e.message} — body: ${data.slice(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Supabase request timed out for ${supabaseCategory}/${cityLabel}`));
    });
  });
}

// ── Main generation loop ──────────────────────────────────────────────────────
async function run() {
  console.log('\n=== FIXEO SEO V3 — Service×City Rollout (Phase 4 Step 1) ===\n');

  // Step 0: Sync V3 CSS
  if (!DRY_RUN) {
    console.log('Syncing V3 CSS assets...');
    const cssResult = syncV3Css({ checkOnly: false, silent: true });
    if (cssResult && cssResult.errors && cssResult.errors.length > 0) {
      console.error('❌ CSS sync failed:', cssResult.errors);
      process.exit(1);
    }
    console.log('  css/seo-v3.css ✅  css/artisan-card-v3.css ✅  css/service-hub-v3.css ✅\n');
  }

  const manifest = buildManifest();
  const toGenerate = manifest.filter(m => m.kind === 'EXISTING_ELIGIBLE' || m.kind === 'NEW_ELIGIBLE');
  const toSkip     = manifest.filter(m => m.kind.startsWith('SKIP'));

  console.log(`Manifest: ${manifest.length} total combinations`);
  console.log(`  Generate: ${toGenerate.length}`);
  console.log(`    - Existing eligible: ${toGenerate.filter(m => m.kind==='EXISTING_ELIGIBLE').length}`);
  console.log(`    - New eligible:      ${toGenerate.filter(m => m.kind==='NEW_ELIGIBLE').length}`);
  console.log(`  Skip:     ${toSkip.length}`);
  console.log(`    - Zero artisans (existing): ${toSkip.filter(m => m.kind==='SKIP_ZERO_ARTISANS').length}`);
  console.log(`    - Below threshold (new):    ${toSkip.filter(m => m.kind==='SKIP_BELOW_THRESHOLD').length}`);
  console.log(`    - No artisans (new):        ${toSkip.filter(m => m.kind==='SKIP_NO_ARTISANS').length}`);
  console.log();

  if (DRY_RUN) {
    console.log('[DRY RUN] Would generate:');
    toGenerate.forEach(m => console.log(`  ${m.fname} [${m.cnt} artisans] ${m.kind}`));
    console.log('\n[DRY RUN] No files written.');
    return { manifest, generated: [], skipped: toSkip, errors: [] };
  }

  const generated = [];
  const errors    = [];

  for (const entry of toGenerate) {
    const { svc, city, cnt, fname, fpath } = entry;
    const svcData  = SERVICES[svc];
    const cityData = CITIES[city];

    process.stdout.write(`  Generating ${fname} [${cnt} artisans]...`);

    try {
      // Fetch artisan records from Supabase
      const artisanRecords = await fetchArtisans(
        svcData.supabase_category,
        cityData.label
      );

      // Generate page
      const result = generateServiceCityPage({
        serviceSlug:    svc,
        citySlug:       city,
        artisanRecords,
      });

      // Write file
      fs.writeFileSync(fpath, result.html, 'utf8');

      const cardCount = result.meta.cardCount;
      const excluded  = result.excluded.length;
      const warnings  = result.warnings.length;

      process.stdout.write(` ✅ ${cardCount} cards`);
      if (excluded > 0) process.stdout.write(` (${excluded} excluded)`);
      if (warnings > 0) process.stdout.write(` ⚠ ${warnings} warnings`);
      process.stdout.write('\n');

      generated.push({
        svc, city, fname, cardCount, excluded,
        warnings: result.warnings,
        artisansFetched: artisanRecords.length,
        kind: entry.kind,
        bytes: Buffer.byteLength(result.html, 'utf8'),
      });

    } catch (e) {
      process.stdout.write(` ❌ ERROR: ${e.message}\n`);
      errors.push({ svc, city, fname, error: e.message });
    }
  }

  console.log();
  console.log(`Generated: ${generated.length}/${toGenerate.length}`);
  if (errors.length > 0) {
    console.log(`Errors:    ${errors.length}`);
    errors.forEach(e => console.log(`  ❌ ${e.fname}: ${e.error}`));
  }

  return { manifest, generated, skipped: toSkip, errors };
}

// ── Entry point ───────────────────────────────────────────────────────────────
run().then(result => {
  // Write manifest to stdout for capture
  console.log('\n=== MANIFEST SUMMARY ===');
  console.log(JSON.stringify({
    generated: result.generated.map(g => ({
      fname: g.fname, cardCount: g.cardCount,
      artisansFetched: g.artisansFetched, kind: g.kind,
    })),
    errors: result.errors,
  }, null, 2));
  if (result.errors.length > 0) process.exit(1);
}).catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
