#!/usr/bin/env node
/*!
 * preflight-7c9f.js
 * Phase 7C.9F — FIXEO Estimator Activation Precheck
 *
 * Read-only verification tool.
 * Does NOT require FIXEO_ESTIMATOR_SECRET.
 * Does NOT connect to Supabase.
 * Does NOT deploy anything.
 *
 * Success output: CODE READY — HUMAN ENV ACTION REQUIRED
 * Failure output: lists every unresolved prerequisite
 *
 * Usage: node data/pricing/ux/prototype/preflight-7c9f.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

function read(rel)   { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let checks = 0, issues = 0;
const warnings = [];
const blockers = [];

function check(name, fn, isBlocker) {
  checks++;
  try {
    const result = fn();
    if (result === false) {
      issues++;
      const msg = '  ✗ ' + name;
      console.log(msg);
      (isBlocker !== false ? blockers : warnings).push(name);
    } else {
      console.log('  ✓ ' + name);
    }
  } catch (e) {
    issues++;
    const msg = '  ✗ ' + name + ' — ' + e.message;
    console.log(msg);
    (isBlocker !== false ? blockers : warnings).push(name + ' (' + e.message + ')');
  }
}
function ok(c) { if (!c) return false; }

/* ─────────────────────────────────── */

console.log('\n╔══════════════════════════════════════╗');
console.log('║  FIXEO Estimator Activation Preflight ║');
console.log('║  Phase 7C.9F — Read-only check        ║');
console.log('╚══════════════════════════════════════╝\n');

/* ── SECTION 1: Feature flag safety ── */
console.log('── 1. Feature flag safety ──');

check('estimatorV2Enabled is false in config', function() {
  const cfg = read('js/fixeo-estimator-config.js');
  if (!cfg.includes('estimatorV2Enabled: false')) return false;
  if (cfg.includes('estimatorV2Enabled: true')) return false;
});

check('Config uses Object.freeze (immutable)', function() {
  return read('js/fixeo-estimator-config.js').includes('Object.freeze');
});

/* ── SECTION 2: Core API files ── */
console.log('\n── 2. Core API files ──');

check('api/estimator-v1/index.js exists', function() {
  return exists('api/estimator-v1/index.js');
});
check('api/estimator-v1/fixeo-estimator-token-v1.js exists', function() {
  return exists('api/estimator-v1/fixeo-estimator-token-v1.js');
});
check('api/estimator-v1/fixeo-estimator-runtime-v1.js exists', function() {
  return exists('api/estimator-v1/fixeo-estimator-runtime-v1.js');
});
check('api/fixeo-booking-authority-v1.js exists', function() {
  return exists('api/fixeo-booking-authority-v1.js');
});
check('api/fixeo-estimator-idempotency-v1.js exists', function() {
  return exists('api/fixeo-estimator-idempotency-v1.js');
});
check('api/estimator-v1/package.json has zero npm dependencies', function() {
  const pkg = JSON.parse(read('api/estimator-v1/package.json'));
  return Object.keys(pkg.dependencies || {}).length === 0;
});

/* ── SECTION 3: Supabase migration ── */
console.log('\n── 3. Supabase migration ──');

check('supabase/estimator-context-redemptions-v1.sql exists', function() {
  return exists('supabase/estimator-context-redemptions-v1.sql');
});
check('Migration has CREATE TABLE IF NOT EXISTS', function() {
  return read('supabase/estimator-context-redemptions-v1.sql').includes('CREATE TABLE IF NOT EXISTS');
});
check('Migration has UNIQUE (context_id)', function() {
  const sql = read('supabase/estimator-context-redemptions-v1.sql');
  return sql.includes('UNIQUE (context_id)') || sql.includes('UNIQUE(context_id)');
});
check('Migration has ENABLE ROW LEVEL SECURITY', function() {
  return read('supabase/estimator-context-redemptions-v1.sql').includes('ENABLE ROW LEVEL SECURITY');
});
check('Migration has REVOKE ALL FROM anon', function() {
  return read('supabase/estimator-context-redemptions-v1.sql').includes('REVOKE ALL ON public.estimator_context_redemptions FROM anon');
});

/* ── SECTION 4: Secret hardcoding scan ── */
console.log('\n── 4. Secret hardcoding scan ──');

check('FIXEO_ESTIMATOR_SECRET not hardcoded in config.js', function() {
  const code = read('js/fixeo-estimator-config.js');
  if (/FIXEO_ESTIMATOR_SECRET\s*[:=]\s*['"][^'"]+['"]/.test(code)) return false;
});
check('FIXEO_ESTIMATOR_SECRET not hardcoded in estimator-v2.js', function() {
  if (!exists('js/fixeo-estimator-v2.js')) return true;
  const code = read('js/fixeo-estimator-v2.js');
  if (/FIXEO_ESTIMATOR_SECRET\s*[:=]\s*['"][^'"]+['"]/.test(code)) return false;
});
check('FIXEO_ESTIMATOR_SECRET not hardcoded in api/server.js (other than process.env read)', function() {
  const srv = read('api/server.js');
  if (/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][^'"]+['"]/.test(srv)) return false;
});
check('No .env file with hardcoded secret in repo', function() {
  if (!exists('.env')) return true; // good — .env absent
  const env = read('.env');
  if (/FIXEO_ESTIMATOR_SECRET\s*=\s*\S+/.test(env)) return false;
  return true;
});

/* ── SECTION 5: Module dependency resolution ── */
console.log('\n── 5. Dependency resolution ──');

check('Orchestrator file resolves from estimator API path', function() {
  const target = path.resolve(ROOT, 'api/estimator-v1',
    '../../data/pricing/orchestrator/estimator-orchestrator-v1');
  return fs.existsSync(target) || fs.existsSync(target + '.js');
});
check('Pricing engine resolves', function() {
  return exists('data/pricing/engine/pricing-engine-core-v1.js');
});
check('Canonical JSON directory exists', function() {
  return exists('data/pricing/canonical');
});
check('Canonical JSON files exist (>0)', function() {
  const dir = path.join(ROOT, 'data/pricing/canonical');
  const files = fs.readdirSync(dir).filter(function(f) { return f.endsWith('.json'); });
  return files.length > 0;
});
check('All modules load without error (require graph)', function() {
  try {
    require(path.join(ROOT, 'api/estimator-v1/fixeo-estimator-token-v1'));
    require(path.join(ROOT, 'api/estimator-v1/fixeo-estimator-runtime-v1'));
    require(path.join(ROOT, 'api/fixeo-booking-authority-v1'));
    require(path.join(ROOT, 'api/fixeo-estimator-idempotency-v1'));
    require(path.join(ROOT, 'data/pricing/orchestrator/estimator-orchestrator-v1'));
    return true;
  } catch (e) {
    throw e;
  }
});

/* ── SECTION 6: Legacy estimator still active ── */
console.log('\n── 6. Legacy estimator ──');

check('js/fixeo-estimation-engine-v1.js exists', function() {
  return exists('js/fixeo-estimation-engine-v1.js');
});
check('Legacy engine > 10KB (not gutted)', function() {
  return fs.statSync(path.join(ROOT, 'js/fixeo-estimation-engine-v1.js')).size > 10000;
});
check('Legacy engine referenced in index.html', function() {
  return read('index.html').includes('fixeo-estimation-engine-v1.js');
});

/* ── SECTION 7: Dormant estimator assets loaded ── */
console.log('\n── 7. Dormant estimator assets ──');

check('fixeo-estimator-config.js in index.html (defer)', function() {
  const idx = read('index.html');
  return idx.includes('fixeo-estimator-config.js');
});
check('fixeo-estimator-v2.js in index.html (defer, dormant)', function() {
  return read('index.html').includes('fixeo-estimator-v2.js');
});
check('fixeo-estimator-api-v1.js in index.html (defer)', function() {
  return read('index.html').includes('fixeo-estimator-api-v1.js');
});
check('fixeo-estimator-reservation-bridge-v1.js in index.html (defer)', function() {
  return read('index.html').includes('fixeo-estimator-reservation-bridge-v1.js');
});
check('css/fixeo-estimator-v2.css in index.html', function() {
  return read('index.html').includes('fixeo-estimator-v2.css');
});

/* ── SECTION 8: Reservation bridge ── */
console.log('\n── 8. Reservation bridge ──');

check('js/fixeo-estimator-reservation-bridge-v1.js exists', function() {
  return exists('js/fixeo-estimator-reservation-bridge-v1.js');
});
check('Bridge uses fixeo_estimator_ctx_v1 sessionStorage key', function() {
  return read('js/fixeo-estimator-reservation-bridge-v1.js').includes('fixeo_estimator_ctx_v1');
});

/* ── SECTION 9: Vercel routing ── */
console.log('\n── 9. Vercel routing ──');

check('/estimation route in vercel.json', function() {
  return read('vercel.json').includes('/estimation');
});
check('/api/estimator-v1 route in vercel.json', function() {
  return read('vercel.json').includes('/api/estimator-v1');
});
check('estimation.html exists', function() {
  return exists('estimation.html');
});
check('api/estimator-v1/index.js build entry in vercel.json', function() {
  return read('vercel.json').includes('api/estimator-v1/index.js');
});

/* ── SECTION 10: Canonical pricing unchanged ── */
console.log('\n── 10. Canonical pricing integrity ──');

check('pricing-engine-core-v1.js exists', function() {
  return exists('data/pricing/engine/pricing-engine-core-v1.js');
});
check('estimator-orchestrator-v1.js exists', function() {
  return exists('data/pricing/orchestrator/estimator-orchestrator-v1.js');
});
check('Server-authoritative booking pricing in server.js', function() {
  return read('api/server.js').includes('resolveAuthoritativeBookingPricing');
});
check('Idempotency guard in server.js', function() {
  return read('api/server.js').includes('consumeEstimatorContext');
});

/* ── SECTION 11: Human env action status ── */
console.log('\n── 11. Human action requirements (env — cannot verify locally) ──');

check('SUPABASE_URL env known (cannot verify live table — human action A required)', function() {
  // We can't verify the table exists without a live connection.
  // This check is intentionally informational (always passes in code).
  // Human must apply supabase/estimator-context-redemptions-v1.sql manually.
  console.log('     → Run supabase/estimator-context-redemptions-v1.sql in Supabase SQL Editor');
  return true; // informational
}, false);

check('FIXEO_ESTIMATOR_SECRET status (cannot verify — human action B required)', function() {
  // If the env var is not set locally that's expected — server-side only.
  // We only verify it's not hardcoded (done in section 4).
  if (!process.env.FIXEO_ESTIMATOR_SECRET) {
    console.log('     → Not set locally (expected). Set in Vercel Dashboard → Preview env.');
  } else {
    console.log('     → Set in local environment. Confirm also set in Vercel Preview.');
  }
  return true; // informational
}, false);

check('Vercel CLI auth status (cannot verify — human action C required)', function() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('vercel whoami 2>&1', { encoding: 'utf8', timeout: 5000 });
    if (out.includes('Error') || out.includes('No existing credentials')) {
      console.log('     → Vercel CLI not authenticated. Run: vercel login');
      return true; // informational
    }
    console.log('     → Vercel CLI authenticated:', out.trim().split('\n').pop());
  } catch (_) {
    console.log('     → Vercel CLI check failed. Run: vercel login');
  }
  return true; // informational
}, false);

/* ─────────────────────────────────── */

console.log('\n══════════════════════════════════════════');
console.log('  Preflight Summary');
console.log('══════════════════════════════════════════');
console.log('  Checks: ' + checks + ' / Issues: ' + issues);

if (blockers.length > 0) {
  console.log('\n  ❌ BLOCKERS (' + blockers.length + '):');
  blockers.forEach(function(b) { console.log('    • ' + b); });
  console.log('\n  Resolve all blockers before proceeding to 7C.9G.');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('\n  ⚠️  WARNINGS (' + warnings.length + '):');
  warnings.forEach(function(w) { console.log('    • ' + w); });
}

console.log('\n  ╔══════════════════════════════════════════════════╗');
console.log('  ║  CODE READY — HUMAN ENV ACTION REQUIRED          ║');
console.log('  ╚══════════════════════════════════════════════════╝\n');
console.log('  Required human actions before Phase 7C.9G:');
console.log('    A. Apply supabase/estimator-context-redemptions-v1.sql in Supabase SQL Editor');
console.log('    B. Set FIXEO_ESTIMATOR_SECRET in Vercel Dashboard → Preview environment');
console.log('    C. Run: vercel login  (authenticate Vercel CLI)');
console.log('\n  After A+B+C: notify agent → Phase 7C.9G (Preview Deploy & QA) will begin.');
console.log('');
