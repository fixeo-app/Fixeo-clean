'use strict';
/**
 * generate-service-hubs.js
 * ========================
 * Task 2.10 — Controlled production generation of 8 canonical service hubs.
 *
 * Generates:
 *   plombier.html, electricien.html, serrurier.html, climatisation.html,
 *   peintre.html, menuisier.html, macon.html, nettoyage.html
 *
 * Output: repository root (cwd when invoked from fixeo-clean/)
 *
 * Usage:
 *   node seo/generators/generate-service-hubs.js [--dry-run]
 *
 * Deterministic: no timestamps, no random seeds; byte-identical on repeat runs.
 */

const fs   = require('fs');
const path = require('path');
const { generateServiceHubPage } = require('./service-hub-v3');
const { check: contentGuardCheck } = require('./shared/content-guard');
const { run: syncV3Css } = require('./sync-v3-css');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT    = process.cwd();                     // must be repo root
const TODAY   = '2026-09-10';                      // deterministic lastmod

const SLUGS = [
  'plombier',
  'electricien',
  'serrurier',
  'climatisation',
  'peintre',
  'menuisier',
  'macon',
  'nettoyage',
];

const OUTFILES = {};
SLUGS.forEach(s => { OUTFILES[s] = path.join(ROOT, `${s}.html`); });

/** Generate all 8 hubs; return array of { slug, html, meta, warnings, outPath, bytes } */
function generateAll() {
  return SLUGS.map(slug => {
    const result = generateServiceHubPage({ serviceSlug: slug });
    // Run content-guard — throws if violation found
    contentGuardCheck(result.html, 'generated_html', `/${slug}`);
    const outPath = OUTFILES[slug];
    return {
      slug,
      html:     result.html,
      meta:     result.meta,
      warnings: result.warnings || [],
      outPath,
      bytes:    Buffer.byteLength(result.html, 'utf8'),
    };
  });
}

/** Write files to disk */
function writeAll(results) {
  results.forEach(r => {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would write ${path.basename(r.outPath)} (${r.bytes} bytes)`);
    } else {
      fs.writeFileSync(r.outPath, r.html, 'utf8');
      console.log(`  ✅ ${path.basename(r.outPath)} — ${r.bytes} bytes`);
    }
    if (r.warnings.length) {
      r.warnings.forEach(w => console.log(`     ⚠️  ${r.slug}: ${w}`));
    }
  });
}

/** Determinism check: generate twice, compare bytes */
function checkDeterminism() {
  const run1 = SLUGS.map(slug => generateServiceHubPage({ serviceSlug: slug }).html);
  const run2 = SLUGS.map(slug => generateServiceHubPage({ serviceSlug: slug }).html);
  const mismatches = [];
  SLUGS.forEach((slug, i) => {
    if (run1[i] !== run2[i]) mismatches.push(slug);
  });
  return mismatches;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('\n📦 FIXEO SEO V3 — Service Hub Generation\n');
  console.log(`  Mode:   ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}`);
  console.log(`  Output: ${ROOT}`);
  console.log(`  Slugs:  ${SLUGS.join(', ')}\n`);

  // Sync V3 CSS assets (seo/assets/ → css/) before any generation
  console.log('  🔄 Syncing V3 CSS assets...');
  try {
    syncV3Css({ checkOnly: DRY_RUN, silent: false });
  } catch (e) {
    console.error(`\n  ❌ CSS sync failed: ${e.message}`);
    process.exit(1);
  }
  console.log();

  // Determinism check first
  process.stdout.write('  🔍 Checking determinism... ');
  const mismatches = checkDeterminism();
  if (mismatches.length) {
    console.error(`FAIL — non-deterministic output for: ${mismatches.join(', ')}`);
    process.exit(1);
  }
  console.log('PASS (byte-identical on 2 runs)\n');

  // Generate
  console.log('  Generating hubs...');
  let results;
  try {
    results = generateAll();
  } catch (e) {
    console.error(`\n  ❌ Generation failed: ${e.message}`);
    process.exit(1);
  }

  // Write (or dry-run report)
  writeAll(results);

  // Summary
  console.log('\n  ── City policy summary ─────────────────────────────────────');
  results.forEach(r => {
    const m = r.meta;
    console.log(`  ${r.slug.padEnd(14)} linked=${m.linkedCityCount} review=${m.reviewCityCount}`);
  });

  console.log('\n  ── Content-guard ────────────────────────────────────────────');
  console.log('  All 8 hubs PASS (content-guard ran inline during generation)\n');

  console.log(`  ${DRY_RUN ? 'DRY-RUN complete' : 'Generation complete'} — ${SLUGS.length} hubs\n`);
  return results;
}

// If called directly
if (require.main === module) {
  main();
}

module.exports = { generateAll, checkDeterminism, SLUGS, OUTFILES, TODAY };
