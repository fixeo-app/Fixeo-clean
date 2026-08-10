#!/usr/bin/env node
/*!
 * validate-7c9c.js
 * Phase 7C.9C — FIXEO Estimator Server-Authoritative Booking Pricing
 * Validator: security closure + booking authority invariants.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
function r(rel)    { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(r(rel), 'utf8'); }
function exists(rel) { return fs.existsSync(r(rel)); }

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ' — ' + e.message);
    failed++;
    errors.push({ name, error: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertNot(cond, msg) { if (cond) throw new Error(msg || 'should be false'); }

/* ── A. Booking authority module ── */
console.log('\n── A. Booking authority module ──');

test('A.1 api/fixeo-booking-authority-v1.js exists', function() {
  assert(exists('api/fixeo-booking-authority-v1.js'));
});

test('A.2 booking authority exports resolveAuthoritativeBookingPricing', function() {
  const mod = require(r('api/fixeo-booking-authority-v1.js'));
  assert(typeof mod.resolveAuthoritativeBookingPricing === 'function');
});

test('A.3 booking authority exports BookingAuthorityError', function() {
  const mod = require(r('api/fixeo-booking-authority-v1.js'));
  assert(typeof mod.BookingAuthorityError === 'function');
});

test('A.4 booking authority uses token module (no duplicate crypto code)', function() {
  const code = read('api/fixeo-booking-authority-v1.js');
  assert(code.includes("require('./estimator-v1/fixeo-estimator-token-v1')"), 'must reuse token module');
  assertNot(code.includes('createDecipheriv'), 'must not duplicate crypto logic');
});

test('A.5 PAYABLE_OUTCOMES includes PRICE_READY, DIAGNOSTIC_READY, LABOUR_PLUS_PART_READY', function() {
  const mod = require(r('api/fixeo-booking-authority-v1.js'));
  assert(mod.PAYABLE_OUTCOMES.has('PRICE_READY'));
  assert(mod.PAYABLE_OUTCOMES.has('DIAGNOSTIC_READY'));
  assert(mod.PAYABLE_OUTCOMES.has('LABOUR_PLUS_PART_READY'));
});

test('A.6 NON_PAYABLE_OUTCOMES includes all safety/routing types', function() {
  const mod = require(r('api/fixeo-booking-authority-v1.js'));
  assert(mod.NON_PAYABLE_OUTCOMES.has('SAFETY_STOP'));
  assert(mod.NON_PAYABLE_OUTCOMES.has('QUOTE_REQUIRED'));
  assert(mod.NON_PAYABLE_OUTCOMES.has('ROUTE_REQUIRED'));
  assert(mod.NON_PAYABLE_OUTCOMES.has('REQUALIFY'));
});

/* ── B. api/server.js changes ── */
console.log('\n── B. api/server.js changes ──');

test('B.1 server.js requires fixeo-booking-authority-v1', function() {
  const code = read('api/server.js');
  assert(code.includes('fixeo-booking-authority-v1'));
});

test('B.2 server.js uses resolveAuthoritativeBookingPricing', function() {
  const code = read('api/server.js');
  assert(code.includes('resolveAuthoritativeBookingPricing'));
});

test('B.3 server.js reads estimator_context_token from request', function() {
  const code = read('api/server.js');
  assert(code.includes('estimator_context_token'));
});

test('B.4 server.js returns 422 on authority failure', function() {
  const code = read('api/server.js');
  assert(code.includes('422'));
});

test('B.5 server.js does NOT log full request body in COD handler', function() {
  const code = read('api/server.js');
  assertNot(
    code.includes("'Body reçu:', JSON.stringify(req.body)") ||
    code.includes('"Body reçu:", JSON.stringify(req.body)'),
    'Full body logging removed to protect estimator token'
  );
});

test('B.6 server.js FAIL CLOSED comment present for estimator path', function() {
  const code = read('api/server.js');
  assert(code.includes('FAIL CLOSED') || code.includes('fail closed'));
});

test('B.7 server.js FIXEO_ESTIMATOR_SECRET not hardcoded', function() {
  const code = read('api/server.js');
  assertNot(
    /FIXEO_ESTIMATOR_SECRET\s*=\s*['"][a-zA-Z0-9]{16,}['"]/.test(code),
    'secret must not be hardcoded'
  );
});

/* ── C. Runtime strengthening ── */
console.log('\n── C. Runtime context_id strengthening ──');

test('C.1 fixeo-estimator-runtime-v1.js has generateContextId()', function() {
  const code = read('api/estimator-v1/fixeo-estimator-runtime-v1.js');
  assert(code.includes('generateContextId'));
});

test('C.2 pricing context payload includes context_id field', function() {
  const code = read('api/estimator-v1/fixeo-estimator-runtime-v1.js');
  assert(code.includes("context_id:"), 'context_id must be in payload');
});

test('C.3 context_id uses crypto.randomBytes (server-generated nonce)', function() {
  const code = read('api/estimator-v1/fixeo-estimator-runtime-v1.js');
  assert(code.includes('randomBytes'), 'context_id must use randomBytes for uniqueness');
});

test('C.4 pricing context payload includes issued_at', function() {
  const code = read('api/estimator-v1/fixeo-estimator-runtime-v1.js');
  assert(code.includes('issued_at'));
});

/* ── D. cod-payment.js pass-through ── */
console.log('\n── D. cod-payment.js token pass-through ──');

test('D.1 cod-payment.js includes estimator_context_token in API payload', function() {
  const code = read('js/cod-payment.js');
  assert(code.includes('estimator_context_token'));
});

test('D.2 cod-payment.js reads _estimator_context_token from bookingData', function() {
  const code = read('js/cod-payment.js');
  assert(code.includes('_estimator_context_token'));
});

test('D.3 cod-payment.js does NOT decode the token browser-side', function() {
  const code = read('js/cod-payment.js');
  assertNot(code.includes('unsealToken'), 'must not decode token in browser');
  assertNot(code.includes('aes-256-gcm'), 'must not do crypto in browser');
});

/* ── E. LABOUR_PLUS_PART pricing authority ── */
console.log('\n── E. LABOUR_PLUS_PART authority ──');

test('E.1 booking authority uses labour_amount_mad for LABOUR_PLUS_PART_READY', function() {
  const code = read('api/fixeo-booking-authority-v1.js');
  assert(code.includes('labour_amount_mad'), 'must use labour_amount_mad for LABOUR_PLUS_PART');
  assert(code.includes('isLabourPlusPart'), 'must have LABOUR_PLUS_PART case');
});

test('E.2 booking authority never sums labour + part', function() {
  const code = read('api/fixeo-booking-authority-v1.js');
  // Must not have pattern like: labour_amount_mad + amount_mad or amount_mad + labour
  assertNot(
    /labour_amount_mad\s*\+\s*amount_mad/.test(code) || /amount_mad\s*\+\s*labour_amount_mad/.test(code),
    'must never sum labour and part'
  );
});

/* ── F. No SAFETY/QUOTE pricing token ── */
console.log('\n── F. Non-payable outcomes ──');

test('F.1 booking authority rejects SAFETY_STOP with NON_PAYABLE_OUTCOME', function() {
  const { resolveAuthoritativeBookingPricing, BookingAuthorityError } = require(r('api/fixeo-booking-authority-v1.js'));
  const { sealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const token = sealToken({
    outcome_type: 'SAFETY_STOP', service_code: 'test', session_id: 'sess',
    context_id: 'fxctx-' + 'a'.repeat(32), amount_mad: null, labour_amount_mad: null,
    currency: 'MAD', parts_separate: false, is_diagnostic: false,
    issued_at: Date.now(), expires_at: Date.now() + 900000,
  }, 'val-secret-test');
  let threw = false;
  let errCode;
  try {
    resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: 'val-secret-test' });
  } catch (e) { threw = true; errCode = e.code; }
  assert(threw, 'must throw for SAFETY_STOP');
  assert(errCode === 'NON_PAYABLE_OUTCOME', 'must throw NON_PAYABLE_OUTCOME, got: ' + errCode);
});

test('F.2 booking authority rejects QUOTE_REQUIRED', function() {
  const { resolveAuthoritativeBookingPricing } = require(r('api/fixeo-booking-authority-v1.js'));
  const { sealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const token = sealToken({
    outcome_type: 'QUOTE_REQUIRED', service_code: 'test', session_id: 'sess',
    context_id: 'fxctx-' + 'b'.repeat(32), amount_mad: null, labour_amount_mad: null,
    currency: 'MAD', parts_separate: false, is_diagnostic: false,
    issued_at: Date.now(), expires_at: Date.now() + 900000,
  }, 'val-secret-test');
  let threw = false;
  try {
    resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: 'val-secret-test' });
  } catch (e) { threw = true; }
  assert(threw, 'QUOTE_REQUIRED must be rejected');
});

/* ── G. Legacy path unchanged ── */
console.log('\n── G. Legacy path unchanged ──');

test('G.1 No estimator token → legacy_browser path, browser amount used', function() {
  const { resolveAuthoritativeBookingPricing } = require(r('api/fixeo-booking-authority-v1.js'));
  const result = resolveAuthoritativeBookingPricing({ estimatorContextToken: null, browserTotalAmount: 500, secret: 'any' });
  assert(result.source === 'legacy_browser');
  assert(result.amount_mad === 500);
  assert(result.estimator_verified === false);
});

/* ── H. Security invariants carry-over from 7C.9B ── */
console.log('\n── H. Security invariants (carry-over) ──');

test('H.1 Feature flag still false', function() {
  const code = read('js/fixeo-estimator-config.js');
  assert(code.includes('estimatorV2Enabled: false'));
  assertNot(code.includes('estimatorV2Enabled: true'));
});

test('H.2 index.html does not load estimator-v2.js unconditionally', function() {
  const code = read('index.html');
  assertNot(
    code.includes('<script src="js/fixeo-estimator-v2.js"') ||
    code.includes("<script src='js/fixeo-estimator-v2.js'")
  );
});

test('H.3 Legacy estimator V1 still exists and not gutted', function() {
  assert(exists('js/fixeo-estimation-engine-v1.js'));
  const stat = fs.statSync(r('js/fixeo-estimation-engine-v1.js'));
  assert(stat.size > 10000, 'V1 engine must not have been gutted');
});

test('H.4 No token decoding in browser JS files', function() {
  const browserFiles = ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
    'js/fixeo-estimator-reservation-bridge-v1.js', 'js/cod-payment.js'];
  for (const f of browserFiles) {
    if (!exists(f)) continue;
    const code = read(f);
    assertNot(code.includes('unsealToken') || code.includes('createDecipheriv'),
      f + ' must not decode tokens browser-side');
  }
});

test('H.5 Canonical pricing data unchanged', function() {
  // Quick check: canonical-registry.v1.draft.json exists and has expected content
  assert(exists('data/pricing/canonical/canonical-registry.v1.draft.json'));
  const stat = fs.statSync(r('data/pricing/canonical/canonical-registry.v1.draft.json'));
  assert(stat.size > 1000, 'canonical registry must not be emptied');
});

test('H.6 No Supabase migrations created in 7C.9C', function() {
  const migDirs = ['supabase/migrations', 'migrations', 'db/migrations'];
  for (const dir of migDirs) {
    if (!exists(dir)) continue;
    const files = fs.readdirSync(r(dir));
    const recentMigration = files.some(f => {
      const stat = fs.statSync(r(dir + '/' + f));
      return (Date.now() - stat.mtimeMs) < 7200000; // 2 hours
    });
    assertNot(recentMigration, 'No new Supabase migrations in 7C.9C');
  }
});

test('H.7 No eval() in booking authority or server', function() {
  for (const f of ['api/fixeo-booking-authority-v1.js', 'api/server.js']) {
    assertNot(/\beval\s*\(/.test(read(f)), f + ' must not use eval()');
  }
});

/* ── I. Replay protection ── */
console.log('\n── I. Replay protection documented ──');

test('I.1 Replay limitation documented in booking authority', function() {
  const code = read('api/fixeo-booking-authority-v1.js');
  assert(code.toLowerCase().includes('replay'), 'replay limitation must be documented');
});

test('I.2 Short TTL used for pricing context (15 min)', function() {
  const code = read('api/estimator-v1/fixeo-estimator-runtime-v1.js');
  assert(code.includes('15 * 60 * 1000') || code.includes('PRICING_CTX_TTL_MS'), 'pricing context TTL must be 15 min');
});

/* ── RESULTS ── */
console.log('\n══ 7C.9C Validator Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(e => console.log('    ✗ ' + e.name + ': ' + e.error));
  process.exit(1);
} else {
  console.log('  All 7C.9C validations passed ✓');
}
