#!/usr/bin/env node
/**
 * sync-v3-css.js — deterministic source→public CSS sync for SEO V3 assets
 * =========================================================================
 *
 * PROBLEM:
 *   Vercel does not serve the `seo/` directory tree as public output.
 *   V3 CSS files authored under `seo/assets/` must be copied to `css/`
 *   (the Vercel-served public directory) before deployment.
 *
 * CONTRACT:
 *   - seo/assets/* is the canonical authoring/source location.
 *   - css/*        is the production-served output.
 *   - Generators emit /css/... URLs only (never /seo/assets/...).
 *   - This script is the ONLY mechanism that writes V3 CSS into css/.
 *   - It does not minify or transform — copies bytes verbatim.
 *   - It touches ONLY the files in the explicit V3_CSS_ASSETS allowlist.
 *   - It fails loudly if any source file is missing.
 *   - It is idempotent: rerunning produces identical output.
 *   - It verifies byte-identity after copy and reports hashes.
 *
 * USAGE:
 *   node seo/generators/sync-v3-css.js            # copy + verify
 *   node seo/generators/sync-v3-css.js --check    # verify only (no write)
 *
 * INTEGRATION:
 *   Run before any production generation or deployment.
 *   Called automatically by generate-service-hubs.js (sync runs first).
 *
 * ALLOWLIST (add here when a new V3 CSS asset is introduced):
 *   V3_CSS_ASSETS below — each entry maps source → destination.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// ── V3 CSS asset allowlist ────────────────────────────────────────────────────
// source:  canonical authoring path  (relative to repo root)
// public:  production-served path    (relative to repo root)
// Add a new entry here when a new V3 CSS file is introduced.
const V3_CSS_ASSETS = [
  {
    name:   'seo-v3.css',
    source: 'seo/assets/seo-v3.css',
    public: 'css/seo-v3.css',
  },
  {
    name:   'service-hub-v3.css',
    source: 'seo/assets/service-hub-v3.css',
    public: 'css/service-hub-v3.css',
  },
  {
    name:   'artisan-card-v3.css',
    source: 'seo/assets/artisan-card-v3.css',
    public: 'css/artisan-card-v3.css',
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run({ checkOnly = false, silent = false } = {}) {
  const results = [];
  let allOk = true;

  for (const asset of V3_CSS_ASSETS) {
    const srcPath = path.join(ROOT, asset.source);
    const pubPath = path.join(ROOT, asset.public);

    // ── 1. Source must exist ─────────────────────────────────────────────────
    if (!fs.existsSync(srcPath)) {
      const msg = `[sync-v3-css] FATAL: source missing: ${asset.source}`;
      if (!silent) console.error(msg);
      throw new Error(msg);
    }

    const srcBuf  = fs.readFileSync(srcPath);
    const srcHash = sha256(srcBuf);
    const srcSize = srcBuf.length;

    // ── 2. Copy if not check-only ────────────────────────────────────────────
    if (!checkOnly) {
      fs.writeFileSync(pubPath, srcBuf);
    }

    // ── 3. Public file must exist after copy ─────────────────────────────────
    if (!fs.existsSync(pubPath)) {
      const msg = `[sync-v3-css] FATAL: public copy missing after sync: ${asset.public}`;
      if (!silent) console.error(msg);
      throw new Error(msg);
    }

    // ── 4. Verify byte-identity ───────────────────────────────────────────────
    const pubBuf  = fs.readFileSync(pubPath);
    const pubHash = sha256(pubBuf);
    const pubSize = pubBuf.length;
    const identical = srcHash === pubHash;

    if (!identical) {
      const msg = `[sync-v3-css] FATAL: hash mismatch for ${asset.name}\n` +
                  `  source: ${srcHash}  (${srcSize} bytes)\n` +
                  `  public: ${pubHash}  (${pubSize} bytes)`;
      if (!silent) console.error(msg);
      throw new Error(msg);
    }

    results.push({
      name:   asset.name,
      source: asset.source,
      public: asset.public,
      hash:   srcHash,
      size:   srcSize,
      status: 'OK',
    });

    if (!silent) {
      const op = checkOnly ? 'verified' : 'synced';
      console.log(`  ✅ ${asset.name} — ${op}  sha256=${srcHash.slice(0,16)}…  ${srcSize} bytes`);
    }
  }

  if (!silent) {
    console.log(`\n  sync-v3-css: ${results.length}/${V3_CSS_ASSETS.length} assets ${checkOnly ? 'verified' : 'synced'} — all byte-identical ✅`);
  }

  return results;
}

// ── CLI entry-point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  console.log(`\n📦 sync-v3-css — ${checkOnly ? 'VERIFY ONLY' : 'SYNC'} (${V3_CSS_ASSETS.length} assets)\n`);
  try {
    run({ checkOnly });
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

// ── Module export (used by tests and generate-service-hubs.js) ───────────────
module.exports = { run, V3_CSS_ASSETS };
