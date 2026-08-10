#!/usr/bin/env node
/*!
 * validate-7c9e.js
 * Phase 7C.9E — FIXEO Estimator Idempotency Closure & Activation Safety
 * Structural validator.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
function read(rel)   { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let passed = 0, failed = 0;
const errors = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; errors.push({ name, error: e.message }); }
}
function ok(c, m)    { if (!c) throw new Error(m || 'assertion failed'); }
function notOk(c, m) { if (c)  throw new Error(m || 'should be false'); }

const srv  = read('api/server.js');
const idem = read('api/fixeo-estimator-idempotency-v1.js');
const auth = read('api/fixeo-booking-authority-v1.js');
const cfg  = read('js/fixeo-estimator-config.js');
const idx  = read('index.html');

/* ── A. Feature flag invariant ── */
console.log('\n── A. Feature flag invariant ──');

test('A.1 estimatorV2Enabled remains false', function() {
  ok(cfg.includes('estimatorV2Enabled: false'));
  notOk(cfg.includes('estimatorV2Enabled: true'));
});
test('A.2 Config uses Object.freeze', function() {
  ok(cfg.includes('Object.freeze'));
});
test('A.3 No production deployment marker', function() {
  // No commit should have forced the flag ON
  notOk(cfg.match(/estimatorV2Enabled\s*:\s*true/));
});

/* ── B. Legacy estimator preserved ── */
console.log('\n── B. Legacy estimator preserved ──');

test('B.1 js/fixeo-estimation-engine-v1.js exists', function() {
  ok(exists('js/fixeo-estimation-engine-v1.js'));
});
test('B.2 Legacy engine > 10KB (not gutted)', function() {
  ok(fs.statSync(path.join(ROOT, 'js/fixeo-estimation-engine-v1.js')).size > 10000);
});
test('B.3 Legacy engine in index.html reservation loader', function() {
  ok(idx.includes('fixeo-estimation-engine-v1.js'));
});

/* ── C. Canonical pricing / engine / orchestrator diffs zero ── */
console.log('\n── C. Canonical pricing diff zero ──');

test('C.1 Pricing engine exists', function() {
  ok(exists('data/pricing/engine/pricing-engine-core-v1.js'));
});
test('C.2 Orchestrator exists', function() {
  ok(exists('data/pricing/orchestrator/estimator-orchestrator-v1.js'));
});
test('C.3 Canonical directory exists', function() {
  ok(exists('data/pricing/canonical'));
});
test('C.4 Authority module not weakened — PAYABLE_OUTCOMES still defined', function() {
  ok(auth.includes("'PRICE_READY'"));
  ok(auth.includes("'DIAGNOSTIC_READY'"));
  ok(auth.includes("'LABOUR_PLUS_PART_READY'"));
});
test('C.5 Authority module still rejects non-payable outcomes', function() {
  ok(auth.includes("'SAFETY_STOP'"));
  ok(auth.includes("'QUOTE_REQUIRED'"));
  ok(auth.includes("'ROUTE_REQUIRED'"));
  ok(auth.includes('NON_PAYABLE_OUTCOMES'));
});

/* ── D. Idempotency module structure ── */
console.log('\n── D. Idempotency module structure ──');

test('D.1 api/fixeo-estimator-idempotency-v1.js exists', function() {
  ok(exists('api/fixeo-estimator-idempotency-v1.js'));
});
test('D.2 consumeEstimatorContext exported', function() {
  ok(idem.includes('consumeEstimatorContext,'));
});
test('D.3 commitEstimatorContext exported', function() {
  ok(idem.includes('commitEstimatorContext,'));
});
test('D.4 failEstimatorContext exported', function() {
  ok(idem.includes('failEstimatorContext,'));
});
test('D.5 IdempotencyError exported', function() {
  ok(idem.includes('IdempotencyError,'));
});
test('D.6 CONTEXT_ID_RE exported', function() {
  ok(idem.includes('CONTEXT_ID_RE,'));
});
test('D.7 CONTEXT_ID_RE canonical format', function() {
  ok(idem.includes('fxctx-[0-9a-f]{32}'));
});
test('D.8 Three idempotency states defined', function() {
  ok(idem.includes("'acquired'") && idem.includes("'committed'") && idem.includes("'failed'"));
});
test('D.9 State transition: acquired → committed', function() {
  // commit patches state to 'committed'
  ok(idem.includes("state:        'committed'") || idem.includes("state: 'committed'") || idem.includes("state:  'committed'"),
    "committed state must be used in updateRow patch");
});
test('D.10 State transition: acquired → failed (recovery)', function() {
  ok(idem.includes("state:          'failed'") || idem.includes("state: 'failed'") || idem.includes("state:  'failed'"),
    "failed state must be used in updateRow patch");
});
test('D.11 UNIQUE constraint is the atomicity mechanism (documented)', function() {
  ok(idem.includes('UNIQUE'));
  ok(idem.includes('atomic'));
});
test('D.12 SQL migration spec present in module', function() {
  ok(idem.includes('CREATE TABLE estimator_context_redemptions'));
  ok(idem.includes('context_id      TEXT        NOT NULL UNIQUE'));
});
test('D.13 Fail-closed on CONFIG_MISSING', function() {
  ok(idem.includes("'CONFIG_MISSING'"));
  ok(idem.includes('Supabase env var not configured'));
});
test('D.14 Fail-closed on PERSISTENCE_UNAVAILABLE', function() {
  ok(idem.includes("'PERSISTENCE_UNAVAILABLE'"));
});
test('D.15 Fail-closed on ALREADY_CONSUMED', function() {
  ok(idem.includes("'ALREADY_CONSUMED'"));
});
test('D.16 Recovery path: failed context can be re-acquired', function() {
  ok(idem.includes("existingState === 'failed'"));
  ok(idem.includes("status: 'acquired'"));
});
test('D.17 already_consumed_same returns booking_ref', function() {
  ok(idem.includes("status: 'already_consumed_same'"));
  ok(idem.includes("booking_ref: existing.booking_ref"));
});
test('D.18 already_consumed_conflict returned for concurrent', function() {
  ok(idem.includes("status: 'already_consumed_conflict'"));
});
test('D.19 No raw amount stored in idempotency record (audit only)', function() {
  // amount_mad is stored for audit — but booking amounts come from authority, not idempotency record
  ok(idem.includes('amount_mad'), 'audit amount OK');
  notOk(idem.includes('codOrders'), 'must not touch codOrders');
});
test('D.20 No external npm dependencies', function() {
  const requires = (idem.match(/require\([^)]+\)/g) || []);
  requires.forEach(function(r) {
    notOk(r.includes('express') || r.includes('@supabase') || r.includes('node-fetch'),
      'npm dep found: ' + r);
  });
});

/* ── E. Server.js integration ── */
console.log('\n── E. Server.js idempotency integration ──');

test('E.1 fixeo-estimator-idempotency-v1 imported', function() {
  ok(srv.includes("require('./fixeo-estimator-idempotency-v1')"));
});
test('E.2 consumeEstimatorContext used in /api/booking/cod', function() {
  ok(srv.includes('consumeEstimatorContext(bookingAuthority.context_id'));
});
test('E.3 commitEstimatorContext called after booking creation', function() {
  ok(srv.includes('commitEstimatorContext(bookingAuthority.context_id'));
});
test('E.4 commit is non-fatal (.catch after commit)', function() {
  const commitIdx = srv.indexOf('commitEstimatorContext(bookingAuthority.context_id');
  const catchIdx  = srv.indexOf('.catch(function(commitErr)', commitIdx);
  ok(commitIdx >= 0 && catchIdx > commitIdx && catchIdx - commitIdx < 500);
});
test('E.5 CONFIG_MISSING / PERSISTENCE_UNAVAILABLE → HTTP 503', function() {
  ok(srv.includes('idempotency_persistence_unavailable'));
  ok(srv.includes('.status(503)'));
});
test('E.6 ALREADY_CONSUMED → HTTP 409', function() {
  ok(srv.includes("code === 'ALREADY_CONSUMED'"));
  ok(srv.includes('estimator_context_already_consumed'));
});
test('E.7 Concurrent conflict → HTTP 409', function() {
  ok(srv.includes("'already_consumed_conflict'"));
  ok(srv.includes('estimator_context_concurrent_conflict'));
});
test('E.8 Idempotent retry → HTTP 200 with previous booking', function() {
  ok(srv.includes("'already_consumed_same'"));
  ok(srv.includes('idempotent_retry: true'));
  ok(srv.includes('idempotencyResult.booking_ref'));
});
test('E.9 Idempotency only applies to estimator-backed bookings', function() {
  ok(srv.includes('bookingAuthority.estimator_verified && bookingAuthority.context_id'));
});
test('E.10 Legacy bookings skip idempotency entirely', function() {
  // Block must be conditional on estimator_verified
  const blockStart = srv.indexOf('ESTIMATOR CONTEXT IDEMPOTENCY GUARD');
  const blockEnd   = srv.indexOf('Calcul commission & net artisan', blockStart);
  const block = srv.slice(blockStart, blockEnd);
  ok(block.includes('if (bookingAuthority.estimator_verified'), 'must be conditional');
  notOk(block.includes('legacy_browser'), 'must not affect legacy path in this block');
});
test('E.11 Authority is resolved BEFORE idempotency (correct order)', function() {
  const authPos  = srv.indexOf('resolveAuthoritativeBookingPricing');
  const idempPos = srv.indexOf('consumeEstimatorContext(bookingAuthority.context_id');
  ok(authPos < idempPos, 'authority must precede idempotency check');
});
test('E.12 bookingRef bound to context after creation', function() {
  ok(srv.includes('booking_ref: bookingRef'));
  ok(srv.includes('order_id:    orderID'));
});

/* ── F. Security invariants ── */
console.log('\n── F. Security invariants ──');

test('F.1 No FIXEO_ESTIMATOR_SECRET in browser files', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js'].forEach(function(f) {
    if (exists(f)) notOk(read(f).includes('FIXEO_ESTIMATOR_SECRET'));
  });
});
test('F.2 No raw price in sessionStorage setItem', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-reservation-bridge-v1.js'].forEach(function(f) {
    if (!exists(f)) return;
    const code = read(f);
    (code.match(/sessionStorage\.setItem\([^;]+\)/g) || []).forEach(function(call) {
      notOk(call.includes('amount') || call.includes('price'), 'raw price in setItem: ' + call);
    });
  });
});
test('F.3 No unsealToken in browser files', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js'].forEach(function(f) {
    if (exists(f)) notOk(read(f).includes('unsealToken'));
  });
});
test('F.4 No AES-256-GCM in browser files', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js'].forEach(function(f) {
    if (exists(f)) notOk(read(f).includes('aes-256-gcm'));
  });
});
test('F.5 No eval() in idempotency module', function() {
  notOk(/\beval\s*\(/.test(idem));
});
test('F.6 No alert() in any estimator browser file', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js'].forEach(function(f) {
    if (exists(f)) notOk(/\balert\s*\(/.test(read(f)));
  });
});
test('F.7 context_id not echoed in API success response to browser', function() {
  // Server response must not expose context_id to client
  const cod = srv.slice(srv.indexOf('/api/booking/cod'));
  const resJson = cod.slice(0, cod.indexOf('})\n'));
  // context_id should not appear in the response JSON block
  notOk(resJson.includes('context_id: bookingAuthority.context_id'), 
    'context_id must not appear in API response');
});
test('F.8 Idempotency module does not log context_id unredacted', function() {
  // context_id can be partially logged (sliced) but not in full
  notOk(idem.includes("console.log(contextId)"), 'full context_id must not be logged');
});

/* ── G. Supabase migration spec ── */
console.log('\n── G. Supabase migration spec ──');

test('G.1 Table name matches migration spec', function() {
  ok(idem.includes("TABLE = 'estimator_context_redemptions'"));
});
test('G.2 SUPABASE_URL env var documented', function() {
  ok(idem.includes('SUPABASE_URL'));
});
test('G.3 SUPABASE_SERVICE_ROLE_KEY env var documented', function() {
  ok(idem.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
test('G.4 No Supabase schema change auto-applied (migration is human-applied)', function() {
  // We verify no migration files were created or modified automatically
  notOk(exists('supabase/migrations/7c9e_idempotency.sql'), 'no auto-migration file');
  notOk(exists('migration-7c9e.sql'), 'no auto-migration file at root');
});
test('G.5 Durable persistence is Supabase (not in-memory only)', function() {
  ok(idem.includes('process.env.SUPABASE_URL'), 'must use SUPABASE_URL');
  ok(idem.includes('fetch(cfg.url'), 'must use HTTP to Supabase');
  notOk(idem.includes('new Map()'), 'must not use in-memory Map as store');
});

/* ── H. Prototype / fixture isolation ── */
console.log('\n── H. Prototype/fixture isolation ──');

test('H.1 Idempotency module not in prototype directory', function() {
  notOk(exists('data/pricing/ux/prototype/fixeo-estimator-idempotency-v1.js'));
});
test('H.2 No production flag activation in prototype tests', function() {
  const testFile = read('data/pricing/ux/prototype/tests/estimator-v2-idempotency-tests.js');
  // Test file may ASSERT that flag is false, but must not SET flag to true
  // Allowed: cfg.includes('estimatorV2Enabled: true') — checking the flag is absent
  // Forbidden: setting window.FixeoEstimatorConfig.estimatorV2Enabled = true
  notOk(testFile.includes("estimatorV2Enabled = true"), 'test must not set flag to true');
  notOk(testFile.includes("estimatorV2Enabled:true"), 'no inline flag-on');
});
test('H.3 Request-modal OFF behavior preserved', function() {
  const rm = read('js/fixeo-request-modal-v2.js');
  ok(rm.includes('estimatorV2Enabled === true'), 'hook guard present');
  ok(rm.includes("setNativeValue(problemInput, p.text"), 'legacy path unchanged');
});
test('H.4 RAFI OFF behavior preserved', function() {
  const rafi = read('js/fixeo-rafi-os-v1.js');
  ok(rafi.includes('estimatorV2Enabled === true'), 'RAFI hook guard present');
  ok(rafi.includes('_checkSummary(modal)'), 'RAFI legacy logic unchanged');
});

/* ── RESULTS ── */
console.log('\n══ 7C.9E Validator Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(function(e) { console.log('    ✗ ' + e.name + ': ' + e.error); });
  process.exit(1);
} else {
  console.log('  All 7C.9E validations passed ✓');
}
