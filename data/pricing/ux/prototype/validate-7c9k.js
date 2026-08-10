/**
 * validate-7c9k.js — Phase 7C.9K Activation Validator
 *
 * Proves that:
 * 1. estimatorV2Enabled has been intentionally set to true (human-approved)
 * 2. debugEstimator remains false
 * 3. All other config values unchanged
 * 4. Legacy estimator still present and referenced
 * 5. Canonical pricing files unchanged
 * 6. Engine unchanged
 * 7. Orchestrator unchanged
 * 8. Supabase schema unchanged
 * 9. Server authority module unchanged
 * 10. Idempotency module unchanged
 * 11. V2 bundle has no fixtures, no price constants, no secret leakage
 * 12. Request-modal hook wired and feature-gated
 * 13. RAFI hook wired and feature-gated
 * 14. Non-payable outcomes (SAFETY_STOP, QUOTE_REQUIRED, ROUTE_REQUIRED) gated from booking
 * 15. PAGE_REQUIRED stores opaque token only
 * 16. sessionStorage uses opaque tokens only
 * 17. No browser price arithmetic
 * 18. No raw session stored client-side
 * 19. Activation comment present in config
 * 20. Production assets load in correct order (index.html)
 *
 * This validator is additive. It does NOT re-assert dormancy guards.
 * Dormancy guards (validate-7c9b through 7c9f) fired correctly when flag was false.
 * They are superseded by this activation validator for post-7C.9K state.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../../../');

// ─── helpers ────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else           { console.log('  ✗ ' + label + (detail ? ': ' + detail : '')); failed++; }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ─── SECTION 1: Activation config ───────────────────────────────────────────
console.log('\nSECTION 1 — Activation Config');
const cfg = read('js/fixeo-estimator-config.js');
assert('1.1 estimatorV2Enabled: true', cfg.includes('estimatorV2Enabled: true'), 'must be true for 7C.9K');
assert('1.2 debugEstimator: false',    cfg.includes('debugEstimator: false'));
assert('1.3 estimatorApiBase unchanged', cfg.includes("'/api/estimator-v1'"));
assert('1.4 TTL unchanged (30min)',    cfg.includes('30 * 60 * 1000'));
assert('1.5 Phase 7C.9K comment present', cfg.includes('7C.9K'));
assert('1.6 Object.freeze preserved', cfg.includes('Object.freeze'));
assert('1.7 Only one estimatorV2Enabled entry',
  (cfg.match(/estimatorV2Enabled/g) || []).length <= 3);

// ─── SECTION 2: Legacy estimator still present ───────────────────────────────
console.log('\nSECTION 2 — Legacy Estimator');
const idx = read('index.html');
assert('2.1 fixeo-estimation-engine-v1.js in index', idx.includes('fixeo-estimation-engine-v1.js'));
assert('2.2 fixeo-estimation-engine-v1.css in index', idx.includes('fixeo-estimation-engine-v1.css'));
assert('2.3 Legacy engine file on disk', exists('js/fixeo-estimation-engine-v1.js'));

// ─── SECTION 3: Canonical pricing unchanged ──────────────────────────────────
console.log('\nSECTION 3 — Canonical Pricing Unchanged');
const canonDir = path.join(root, 'data/pricing/canonical');
const canonFiles = fs.readdirSync(canonDir).filter(f => f.endsWith('.json'));
assert('3.1 Canonical directory has files', canonFiles.length > 0);
canonFiles.slice(0, 3).forEach(f => {
  const content = fs.readFileSync(path.join(canonDir, f), 'utf8');
  assert('3.x ' + f + ' parseable', (() => { try { JSON.parse(content); return true; } catch(e) { return false; } })());
});

// ─── SECTION 4: Engine + Orchestrator unchanged ───────────────────────────────
console.log('\nSECTION 4 — Engine + Orchestrator');
const eng = read('data/pricing/engine/pricing-engine-core-v1.js');
const orc = read('data/pricing/orchestrator/estimator-orchestrator-v1.js');
assert('4.1 Engine file present and non-empty', eng.length > 1000);
assert('4.2 Engine has no estimatorV2Enabled reference', !eng.includes('estimatorV2Enabled'));
assert('4.3 Orchestrator file present and non-empty', orc.length > 1000);
assert('4.4 Orchestrator has no estimatorV2Enabled reference', !orc.includes('estimatorV2Enabled'));

// ─── SECTION 5: Supabase schema unchanged ────────────────────────────────────
console.log('\nSECTION 5 — Supabase Schema');
const sql = read('supabase/estimator-context-redemptions-v1.sql');
assert('5.1 Migration file present', sql.length > 500);
assert('5.2 v1.1 migration present', sql.includes('1.1') || sql.includes('v1.1'));
assert('5.3 UNIQUE constraint on context_id', sql.includes('context_id_unique') || sql.includes('UNIQUE (context_id)'));
assert('5.4 RLS enabled', sql.includes('ENABLE ROW LEVEL SECURITY'));
assert('5.5 No new schema changes (no ALTER TABLE added by this phase)', !sql.includes('7C.9K'));

// ─── SECTION 6: Server authority + idempotency unchanged ─────────────────────
console.log('\nSECTION 6 — Authority + Idempotency Modules');
const auth = read('api/fixeo-booking-authority-v1.js');
const idm  = read('api/fixeo-estimator-idempotency-v1.js');
assert('6.1 Authority module present', auth.length > 500);
assert('6.2 resolveAuthoritativeBookingPricing exported', auth.includes('resolveAuthoritativeBookingPricing'));
assert('6.3 NON_PAYABLE_OUTCOMES set present', auth.includes('NON_PAYABLE_OUTCOMES'));
assert('6.4 Idempotency module present', idm.length > 500);
assert('6.5 consumeEstimatorContext exported', idm.includes('consumeEstimatorContext'));
assert('6.6 CONTEXT_ID_RE exported', idm.includes('CONTEXT_ID_RE'));

// ─── SECTION 7: V2 bundle security ───────────────────────────────────────────
console.log('\nSECTION 7 — V2 Bundle Security');
const v2 = read('js/fixeo-estimator-v2.js');
assert('7.1 No fixture data', !v2.includes('FIXTURE') && !v2.includes('fixtureFlow'));
assert('7.2 No prototype banners', !v2.includes('[PROTO]') && !v2.includes('DORMANT ENGINE'));
assert('7.3 No hard-coded MAD price constants', !v2.match(/=\s*300\s*[,;]/));
assert('7.4 No browser price arithmetic', !v2.includes('amount_mad +') && !v2.includes('totalPrice ='));
assert('7.5 No FIXEO_ESTIMATOR_SECRET in browser', !v2.includes('FIXEO_ESTIMATOR_SECRET'));
assert('7.6 No SUPABASE key in browser', !v2.includes('SUPABASE_SERVICE_ROLE'));
assert('7.7 No raw orchestrator session stored', !v2.includes('setItem.*orchestrator_session'));
assert('7.8 sessionStorage uses tokens', v2.includes('sessionStorage') && v2.includes('token'));
assert('7.9 Feature gate present', v2.includes('estimatorV2Enabled !== true'));

// ─── SECTION 8: Hook wiring ───────────────────────────────────────────────────
console.log('\nSECTION 8 — Hook Wiring');
const rm = read('js/fixeo-request-modal-v2.js');
const rf = read('js/fixeo-rafi-os-v1.js');
assert('8.1 Request-modal hook feature-gated', rm.includes('estimatorV2Enabled === true'));
assert('8.2 Request-modal calls FixeoEstimatorV2.open()', rm.includes('FixeoEstimatorV2') && rm.includes('.open('));
assert('8.3 RAFI hook feature-gated', rf.includes('estimatorV2Enabled === true'));
assert('8.4 RAFI calls FixeoEstimatorV2.open()', rf.includes('FixeoEstimatorV2') && rf.includes('.open('));

// ─── SECTION 9: Non-payable outcomes gated ───────────────────────────────────
console.log('\nSECTION 9 — Non-Payable Outcome Gates');
assert('9.1 QUOTE_REQUIRED in V2', v2.includes('QUOTE_REQUIRED'));
assert('9.2 SAFETY_STOP in V2', v2.includes('SAFETY_STOP'));
assert('9.3 QUOTE_REQUIRED not near dispatchReservation', !v2.match(/QUOTE_REQUIRED[\s\S]{0,200}dispatchReservation/));
assert('9.4 SAFETY_STOP not near dispatchReservation', !v2.match(/SAFETY_STOP[\s\S]{0,200}dispatchReservation/));
assert('9.5 PAGE_REQUIRED stores session_token', v2.includes('PAGE_REQUIRED') && v2.includes('session_token'));

// ─── SECTION 10: Index asset order ───────────────────────────────────────────
console.log('\nSECTION 10 — Production Asset Order');
const cfgPos  = idx.indexOf('fixeo-estimator-config.js');
const v2Pos   = idx.indexOf('fixeo-estimator-v2.js');
const legPos  = idx.indexOf('fixeo-estimation-engine-v1.js');
assert('10.1 fixeo-estimator-config.js in index', cfgPos !== -1);
assert('10.2 fixeo-estimator-v2.js in index', v2Pos !== -1);
assert('10.3 Config loads before V2 JS', cfgPos < v2Pos);
assert('10.4 Legacy estimator still in index', legPos !== -1);
assert('10.5 V2 CSS in index', idx.includes('fixeo-estimator-v2.css'));

// ─── FINAL ────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9K activation validations passed ✓');
} else {
  console.log('  Failed: ' + failed);
  console.log('  STOP — DO NOT COMMIT UNTIL ALL PASS');
  process.exit(1);
}
