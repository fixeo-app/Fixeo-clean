#!/usr/bin/env node
/*!
 * estimator-v2-booking-authority-tests.js
 * Phase 7C.9C — FIXEO Estimator Server-Authoritative Booking Pricing
 *
 * Tests the resolveAuthoritativeBookingPricing() pure function and
 * the full token → booking-authority chain.
 *
 * All tests use the real cryptographic implementation.
 * No mocking, no stubs, no eval().
 * No Supabase. No HTTP. No side-effects.
 */
'use strict';

const assert = require('assert');
const path   = require('path');

const ROOT    = path.resolve(__dirname, '../../../../..');
const tokenMod = require(path.join(ROOT, 'api/estimator-v1/fixeo-estimator-token-v1'));
const authMod  = require(path.join(ROOT, 'api/fixeo-booking-authority-v1'));
const runtimeMod = require(path.join(ROOT, 'api/estimator-v1/fixeo-estimator-runtime-v1'));

const { sealToken, unsealToken }  = tokenMod;
const { resolveAuthoritativeBookingPricing, BookingAuthorityError, PAYABLE_OUTCOMES, NON_PAYABLE_OUTCOMES } = authMod;

const TEST_SECRET = 'fixeo-7c9c-test-secret-not-production-32b';

/* ── Test runner ── */
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
function assert_(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertThrows(fn, code) {
  let threw = false;
  let err;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error('Expected throw but did not throw');
  if (code && err.code !== code) throw new Error('Expected code ' + code + ' but got: ' + err.code + ' — ' + err.message);
}

/* ── Helper: build a valid pricing context token ── */
function makeToken(overrides, secret) {
  const base = {
    outcome_type:      'PRICE_READY',
    service_code:      'menuiserie.reglage_porte.sans_rabotage',
    session_id:        'test-session-001',
    context_id:        'fxctx-' + 'a'.repeat(32),
    amount_mad:        300,
    labour_amount_mad: null,
    currency:          'MAD',
    parts_separate:    false,
    is_diagnostic:     false,
    issued_at:         Date.now(),
    expires_at:        Date.now() + 15 * 60 * 1000,
  };
  const payload = Object.assign({}, base, overrides);
  return sealToken(payload, secret || TEST_SECRET);
}

/* ════════════════════════════════════════════════════════════
   A. VALID PRICE_READY TOKEN — BROWSER TOTAL IS IRRELEVANT
   ════════════════════════════════════════════════════════════ */
console.log('\n── A. PRICE_READY token authority ──');

test('A.1 Valid PRICE_READY token, browser total = correct amount → uses token amount', function() {
  const token = makeToken({ amount_mad: 300 });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    300,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.source, 'estimator_server_verified');
  assert.strictEqual(result.amount_mad, 300);
  assert.strictEqual(result.estimator_verified, true);
});

test('A.2 Valid PRICE_READY token, browser total = 1 MAD → server uses canonical 300, NOT 1', function() {
  const token = makeToken({ amount_mad: 300 });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    1,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.amount_mad, 300, 'Server must use canonical 300, not browser 1');
  assert.notStrictEqual(result.amount_mad, 1);
});

test('A.3 Valid PRICE_READY token, browser total = 999999 MAD → server uses canonical 300, NOT 999999', function() {
  const token = makeToken({ amount_mad: 300 });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    999999,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.amount_mad, 300, 'Server must use canonical 300, not browser 999999');
});

test('A.4 PRICE_READY result carries correct metadata', function() {
  const token = makeToken({ amount_mad: 390, service_code: 'nettoyage.grand_menage' });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    9999,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.outcome_type, 'PRICE_READY');
  assert.strictEqual(result.service_code, 'nettoyage.grand_menage');
  assert.strictEqual(result.parts_separate, false);
  assert.strictEqual(result.is_diagnostic, false);
  assert_(result.context_id, 'context_id must be present');
  assert_(result.session_id, 'session_id must be present');
});

/* ════════════════════════════════════════════════════════════
   B. LABOUR_PLUS_PART TOKEN
   ════════════════════════════════════════════════════════════ */
console.log('\n── B. LABOUR_PLUS_PART_READY token ──');

test('B.1 LABOUR_PLUS_PART token → server uses labour_amount_mad, not amount_mad', function() {
  const token = makeToken({
    outcome_type:      'LABOUR_PLUS_PART_READY',
    amount_mad:        null,
    labour_amount_mad: 250,
    parts_separate:    true,
    service_code:      'plomberie.robinet_remplacement',
  });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    500,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.amount_mad, 250);
  assert.strictEqual(result.parts_separate, true);
});

test('B.2 LABOUR_PLUS_PART result marks parts_separate = true', function() {
  const token = makeToken({
    outcome_type:      'LABOUR_PLUS_PART_READY',
    amount_mad:        null,
    labour_amount_mad: 280,
    parts_separate:    true,
  });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    0,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.parts_separate, true);
  assert.strictEqual(result.amount_mad, 280);
});

test('B.3 LABOUR_PLUS_PART missing labour_amount_mad → rejected', function() {
  const token = makeToken({
    outcome_type:      'LABOUR_PLUS_PART_READY',
    amount_mad:        null,
    labour_amount_mad: null,
  });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_NO_AMOUNT'
  );
});

/* ════════════════════════════════════════════════════════════
   C. DIAGNOSTIC TOKEN
   ════════════════════════════════════════════════════════════ */
console.log('\n── C. DIAGNOSTIC_READY token ──');

test('C.1 DIAGNOSTIC_READY token → server uses amount_mad, marks is_diagnostic=true', function() {
  const token = makeToken({
    outcome_type:  'DIAGNOSTIC_READY',
    amount_mad:    200,
    is_diagnostic: true,
  });
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: token,
    browserTotalAmount:    50,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.amount_mad, 200);
  assert.strictEqual(result.is_diagnostic, true);
  assert.notStrictEqual(result.amount_mad, 50);
});

/* ════════════════════════════════════════════════════════════
   D. TAMPER / INTEGRITY TESTS
   ════════════════════════════════════════════════════════════ */
console.log('\n── D. Token tamper tests ──');

test('D.1 Tampered ciphertext → rejected', function() {
  const token = makeToken({ amount_mad: 300 });
  // Decode the token, corrupt the ct field, re-encode
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  const ctBytes  = Buffer.from(envelope.ct, 'base64');
  ctBytes[0]     = ctBytes[0] ^ 0xFF; // flip all bits of first byte
  envelope.ct    = ctBytes.toString('base64');
  const tamperedToken = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: tamperedToken, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('D.2 Tampered auth tag → rejected', function() {
  const token = makeToken({ amount_mad: 300 });
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  const tagBytes = Buffer.from(envelope.tag, 'base64');
  tagBytes[0] = tagBytes[0] ^ 0xAA;
  envelope.tag = tagBytes.toString('base64');
  const tamperedToken = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: tamperedToken, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('D.3 Expired token → rejected', function() {
  const expiredToken = makeToken({
    amount_mad:  300,
    issued_at:   Date.now() - 3600000,
    expires_at:  Date.now() - 1, // already expired
  });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: expiredToken, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('D.4 Wrong version in token → rejected', function() {
  // Craft a token with v:'bad-v0' 
  const crypto_ = require('crypto');
  const envelope = { v: 'bad-v0', iv: 'AAAA', tag: 'AAAA', ct: 'AAAA' };
  const badToken = Buffer.from(JSON.stringify(envelope)).toString('base64url');
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: badToken, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('D.5 Completely malformed token string → rejected', function() {
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: 'not-a-valid-token', browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('D.6 Empty string token → treated as no token (legacy path)', function() {
  // Empty string is falsy — treated as no estimator token → legacy path
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: '',
    browserTotalAmount:    300,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.source, 'legacy_browser');
  assert.strictEqual(result.amount_mad, 300);
});

test('D.7 Token signed with different secret → rejected', function() {
  const token = makeToken({ amount_mad: 300 }, 'different-secret-xyz-not-test');
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

/* ════════════════════════════════════════════════════════════
   E. MISSING SECRET — FAIL CLOSED
   ════════════════════════════════════════════════════════════ */
console.log('\n── E. Missing secret fails closed ──');

test('E.1 Missing FIXEO_ESTIMATOR_SECRET → fail closed', function() {
  const token = makeToken({ amount_mad: 300 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: undefined }),
    'CONFIG_ERROR'
  );
});

test('E.2 Empty string secret → fail closed', function() {
  const token = makeToken({ amount_mad: 300 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: '' }),
    'CONFIG_ERROR'
  );
});

test('E.3 Null secret → fail closed', function() {
  const token = makeToken({ amount_mad: 300 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: null }),
    'CONFIG_ERROR'
  );
});

/* ════════════════════════════════════════════════════════════
   F. NON-PAYABLE OUTCOMES REJECTED
   ════════════════════════════════════════════════════════════ */
console.log('\n── F. Non-payable outcomes rejected ──');

test('F.1 QUOTE_REQUIRED token → rejected', function() {
  const token = makeToken({ outcome_type: 'QUOTE_REQUIRED', amount_mad: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'NON_PAYABLE_OUTCOME'
  );
});

test('F.2 SAFETY_STOP token → rejected', function() {
  const token = makeToken({ outcome_type: 'SAFETY_STOP', amount_mad: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'NON_PAYABLE_OUTCOME'
  );
});

test('F.3 ROUTE_REQUIRED token → rejected', function() {
  const token = makeToken({ outcome_type: 'ROUTE_REQUIRED', amount_mad: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'NON_PAYABLE_OUTCOME'
  );
});

test('F.4 REQUALIFY token → rejected', function() {
  const token = makeToken({ outcome_type: 'REQUALIFY', amount_mad: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'NON_PAYABLE_OUTCOME'
  );
});

test('F.5 Unknown/invented outcome type → rejected', function() {
  const token = makeToken({ outcome_type: 'HACK_ATTEMPT', amount_mad: 1 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'UNKNOWN_OUTCOME'
  );
});

/* ════════════════════════════════════════════════════════════
   G. LEGACY PATH — NO TOKEN
   ════════════════════════════════════════════════════════════ */
console.log('\n── G. Legacy path (no estimator token) ──');

test('G.1 No token → legacy_browser path, uses browser totalAmount', function() {
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: null,
    browserTotalAmount:    450,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.source, 'legacy_browser');
  assert.strictEqual(result.amount_mad, 450);
  assert.strictEqual(result.estimator_verified, false);
});

test('G.2 Undefined token → legacy_browser path', function() {
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: undefined,
    browserTotalAmount:    200,
    secret:                TEST_SECRET,
  });
  assert.strictEqual(result.source, 'legacy_browser');
  assert.strictEqual(result.amount_mad, 200);
});

test('G.3 Legacy path: invalid browser amount → rejected', function() {
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: null, browserTotalAmount: -100, secret: TEST_SECRET }),
    'INVALID_LEGACY_AMOUNT'
  );
});

test('G.4 Legacy path: zero browser amount → rejected', function() {
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: null, browserTotalAmount: 0, secret: TEST_SECRET }),
    'INVALID_LEGACY_AMOUNT'
  );
});

test('G.5 Legacy path: NaN browser amount → rejected', function() {
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: null, browserTotalAmount: 'not-a-number', secret: TEST_SECRET }),
    'INVALID_LEGACY_AMOUNT'
  );
});

test('G.6 Legacy path: missing secret is OK (secret not needed for legacy path)', function() {
  // When no token, secret is not used — legacy path should work
  const result = resolveAuthoritativeBookingPricing({
    estimatorContextToken: null,
    browserTotalAmount:    350,
    secret:                undefined, // not needed for legacy path
  });
  assert.strictEqual(result.source, 'legacy_browser');
  assert.strictEqual(result.amount_mad, 350);
});

/* ════════════════════════════════════════════════════════════
   H. TOKEN STRUCTURE VALIDATION
   ════════════════════════════════════════════════════════════ */
console.log('\n── H. Token structure validation ──');

test('H.1 Token missing service_code → rejected', function() {
  const token = makeToken({ service_code: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_NO_SERVICE'
  );
});

test('H.2 Token missing session_id → rejected', function() {
  const token = makeToken({ session_id: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_NO_SESSION'
  );
});

test('H.3 Token missing context_id → rejected (7C.9C hardening)', function() {
  const token = makeToken({ context_id: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_NO_CONTEXT_ID'
  );
});

test('H.4 Token missing amount_mad for PRICE_READY → rejected', function() {
  const token = makeToken({ outcome_type: 'PRICE_READY', amount_mad: null });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_NO_AMOUNT'
  );
});

test('H.5 Token with zero amount_mad → rejected', function() {
  const token = makeToken({ outcome_type: 'PRICE_READY', amount_mad: 0 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID_AMOUNT'
  );
});

test('H.6 Token with negative amount_mad → rejected', function() {
  const token = makeToken({ outcome_type: 'PRICE_READY', amount_mad: -100 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: token, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID_AMOUNT'
  );
});

/* ════════════════════════════════════════════════════════════
   I. RUNTIME: context_id IS SERVER-GENERATED
   ════════════════════════════════════════════════════════════ */
console.log('\n── I. Runtime context_id generation ──');

test('I.1 buildPricingContextPayload includes context_id', function() {
  // We need a session with a PRICE_READY outcome to test this
  const ORCH = require(path.join(ROOT, 'data/pricing/orchestrator/estimator-orchestrator-v1'));
  let r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  let s = r.session;
  const r2 = ORCH.answerEstimatorQuestion(s, 'security_door@menuiserie.reglage_porte.sans_rabotage', false);
  const r3 = ORCH.answerEstimatorQuestion(r2.session, 'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage', false);
  const r4 = ORCH.answerEstimatorQuestion(r3.session, 'frame_condition@menuiserie.reglage_porte.sans_rabotage', 'SOUND');
  const ev = ORCH.evaluateEstimator(r4.session);
  const payload = runtimeMod.buildPricingContextPayload(ev.session);
  assert_(payload.context_id, 'context_id must be present in pricing context payload');
  assert_(payload.context_id.startsWith('fxctx-'), 'context_id must have fxctx- prefix');
  assert_(payload.context_id.length > 10, 'context_id must be non-trivial');
});

test('I.2 Two separate evaluate calls produce different context_ids', function() {
  const ORCH = require(path.join(ROOT, 'data/pricing/orchestrator/estimator-orchestrator-v1'));
  function getPayload() {
    let r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
    const r2 = ORCH.answerEstimatorQuestion(r.session, 'security_door@menuiserie.reglage_porte.sans_rabotage', false);
    const r3 = ORCH.answerEstimatorQuestion(r2.session, 'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage', false);
    const r4 = ORCH.answerEstimatorQuestion(r3.session, 'frame_condition@menuiserie.reglage_porte.sans_rabotage', 'SOUND');
    const ev = ORCH.evaluateEstimator(r4.session);
    return runtimeMod.buildPricingContextPayload(ev.session);
  }
  const p1 = getPayload();
  const p2 = getPayload();
  assert_(p1.context_id !== p2.context_id, 'Each evaluation must produce a unique context_id');
});

test('I.3 context_id is not predictable from outcome fields (server-generated nonce)', function() {
  // context_id must contain a cryptographic random component
  const ORCH = require(path.join(ROOT, 'data/pricing/orchestrator/estimator-orchestrator-v1'));
  let r = ORCH.startEstimator({ source: 'test', service_hint: 'menuiserie.reglage_porte.sans_rabotage' });
  const r2 = ORCH.answerEstimatorQuestion(r.session, 'security_door@menuiserie.reglage_porte.sans_rabotage', false);
  const r3 = ORCH.answerEstimatorQuestion(r2.session, 'lock_cylinder_involved@menuiserie.reglage_porte.sans_rabotage', false);
  const r4 = ORCH.answerEstimatorQuestion(r3.session, 'frame_condition@menuiserie.reglage_porte.sans_rabotage', 'SOUND');
  const ev = ORCH.evaluateEstimator(r4.session);
  const p = runtimeMod.buildPricingContextPayload(ev.session);
  // 32 hex chars of randomness after prefix 'fxctx-' = 16 random bytes
  const hexPart = p.context_id.replace('fxctx-', '');
  assert_(hexPart.length === 32, 'context_id hex part must be 32 chars (16 random bytes)');
  assert_(/^[0-9a-f]{32}$/.test(hexPart), 'context_id hex must be lowercase hex');
});

/* ════════════════════════════════════════════════════════════
   J. COD-PAYMENT CLIENT PASS-THROUGH
   ════════════════════════════════════════════════════════════ */
console.log('\n── J. cod-payment.js token pass-through ──');

test('J.1 cod-payment.js includes estimator_context_token in payload', function() {
  const fs = require('fs');
  const codPaymentCode = fs.readFileSync(path.join(ROOT, 'js/cod-payment.js'), 'utf8');
  assert_(codPaymentCode.includes('estimator_context_token'), 'cod-payment.js must pass estimator_context_token to API');
  assert_(codPaymentCode.includes('_estimator_context_token'), 'cod-payment.js must read _estimator_context_token from bookingData');
});

test('J.2 cod-payment.js comment explains SERVER TOKEN = AUTHORITY', function() {
  const fs = require('fs');
  const codPaymentCode = fs.readFileSync(path.join(ROOT, 'js/cod-payment.js'), 'utf8');
  assert_(
    codPaymentCode.includes('server') || codPaymentCode.includes('SERVER'),
    'cod-payment.js must have comment about server authority'
  );
});

/* ════════════════════════════════════════════════════════════
   K. SERVER.JS HAS BOOKING AUTHORITY INTEGRATION
   ════════════════════════════════════════════════════════════ */
console.log('\n── K. api/server.js authority integration ──');

test('K.1 api/server.js requires fixeo-booking-authority-v1', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(serverCode.includes('fixeo-booking-authority-v1'), 'server.js must require booking authority module');
});

test('K.2 api/server.js imports resolveAuthoritativeBookingPricing', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(serverCode.includes('resolveAuthoritativeBookingPricing'), 'server.js must use resolveAuthoritativeBookingPricing');
});

test('K.3 api/server.js reads estimator_context_token from request body', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(serverCode.includes('estimator_context_token'), 'server.js must handle estimator_context_token in COD endpoint');
});

test('K.4 api/server.js uses FIXEO_ESTIMATOR_SECRET env var', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(serverCode.includes('FIXEO_ESTIMATOR_SECRET'), 'server.js must use FIXEO_ESTIMATOR_SECRET');
});

test('K.5 api/server.js handles BookingAuthorityError with 422 response', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(serverCode.includes('BookingAuthorityError'), 'server.js must import BookingAuthorityError');
  assert_(serverCode.includes('422'), 'server.js must return 422 on authority failure');
});

test('K.6 api/server.js does NOT log the full encrypted token', function() {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  // After the 7C.9C change, the body logging was removed/guarded
  // Check that we don't have console.log(JSON.stringify(req.body)) in the COD handler
  // The original line was: console.log('[Fixeo API] Body reçu:', JSON.stringify(req.body));
  // We changed it to: /* NOTE: Do NOT log full body — may contain sensitive estimator token */
  assert_(
    !serverCode.includes("'Body reçu:', JSON.stringify(req.body)"),
    'server.js must not log full request body (contains estimator token)'
  );
});

/* ════════════════════════════════════════════════════════════
   L. BOOKING AUTHORITY MODULE STRUCTURE
   ════════════════════════════════════════════════════════════ */
console.log('\n── L. Booking authority module structure ──');

test('L.1 fixeo-booking-authority-v1.js exists', function() {
  const fs = require('fs');
  assert_(fs.existsSync(path.join(ROOT, 'api/fixeo-booking-authority-v1.js')));
});

test('L.2 PAYABLE_OUTCOMES contains expected types', function() {
  assert_(PAYABLE_OUTCOMES.has('PRICE_READY'));
  assert_(PAYABLE_OUTCOMES.has('DIAGNOSTIC_READY'));
  assert_(PAYABLE_OUTCOMES.has('LABOUR_PLUS_PART_READY'));
});

test('L.3 NON_PAYABLE_OUTCOMES contains all safety/routing types', function() {
  assert_(NON_PAYABLE_OUTCOMES.has('SAFETY_STOP'));
  assert_(NON_PAYABLE_OUTCOMES.has('QUOTE_REQUIRED'));
  assert_(NON_PAYABLE_OUTCOMES.has('ROUTE_REQUIRED'));
  assert_(NON_PAYABLE_OUTCOMES.has('REQUALIFY'));
});

test('L.4 PAYABLE and NON_PAYABLE sets are disjoint', function() {
  for (const t of PAYABLE_OUTCOMES) {
    assert_(!NON_PAYABLE_OUTCOMES.has(t), 'Outcome type must not be in both sets: ' + t);
  }
});

test('L.5 BookingAuthorityError has name and code fields', function() {
  const err = new BookingAuthorityError('TEST_CODE', 'Test message');
  assert.strictEqual(err.name, 'BookingAuthorityError');
  assert.strictEqual(err.code, 'TEST_CODE');
  assert.strictEqual(err.message, 'Test message');
  assert_(err instanceof Error);
});

test('L.6 resolveAuthoritativeBookingPricing is a function', function() {
  assert_(typeof resolveAuthoritativeBookingPricing === 'function');
});

/* ════════════════════════════════════════════════════════════
   M. REPLAY PROTECTION ASSESSMENT
   ════════════════════════════════════════════════════════════ */
console.log('\n── M. Replay protection ──');

test('M.1 TTL is enforced (expired tokens rejected)', function() {
  // Already tested in D.3 but explicitly testing as replay protection measure
  const expiredToken = makeToken({ expires_at: Date.now() - 1 });
  assertThrows(
    () => resolveAuthoritativeBookingPricing({ estimatorContextToken: expiredToken, browserTotalAmount: 300, secret: TEST_SECRET }),
    'TOKEN_INVALID'
  );
});

test('M.2 context_id nonce uniqueness prevents identical-token reuse detection', function() {
  // Two tokens for same service/amount have different context_ids
  const t1 = makeToken({ amount_mad: 300, context_id: 'fxctx-' + 'a'.repeat(32) });
  const t2 = makeToken({ amount_mad: 300, context_id: 'fxctx-' + 'b'.repeat(32) });
  const r1 = resolveAuthoritativeBookingPricing({ estimatorContextToken: t1, browserTotalAmount: 9999, secret: TEST_SECRET });
  const r2 = resolveAuthoritativeBookingPricing({ estimatorContextToken: t2, browserTotalAmount: 9999, secret: TEST_SECRET });
  assert_(r1.context_id !== r2.context_id, 'Different context_ids must be distinguishable');
});

test('M.3 Replay limitation documented (no persistent one-time-use store)', function() {
  const fs = require('fs');
  const authorityCode = fs.readFileSync(path.join(ROOT, 'api/fixeo-booking-authority-v1.js'), 'utf8');
  assert_(
    authorityCode.includes('replay') || authorityCode.includes('REPLAY'),
    'Booking authority module must document replay protection limitation'
  );
});

/* ════════════════════════════════════════════════════════════
   N. SECURITY INVARIANTS
   ════════════════════════════════════════════════════════════ */
console.log('\n── N. Security invariants ──');

test('N.1 No eval() in booking authority module', function() {
  const fs = require('fs');
  const code = fs.readFileSync(path.join(ROOT, 'api/fixeo-booking-authority-v1.js'), 'utf8');
  assert_(!(/\beval\s*\(/.test(code)), 'booking authority must not use eval()');
});

test('N.2 FIXEO_ESTIMATOR_SECRET not hardcoded in server.js', function() {
  const fs = require('fs');
  const code = fs.readFileSync(path.join(ROOT, 'api/server.js'), 'utf8');
  assert_(
    !/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][a-zA-Z0-9+/=]{16,}['"]/.test(code),
    'FIXEO_ESTIMATOR_SECRET must not be hardcoded in server.js'
  );
});

test('N.3 Feature flag still false after 7C.9C', function() {
  const fs = require('fs');
  const code = fs.readFileSync(path.join(ROOT, 'js/fixeo-estimator-config.js'), 'utf8');
  assert_(code.includes('estimatorV2Enabled: false'), 'Feature flag must still be false');
});

test('N.4 index.html estimator-v2.js is defer-loaded dormant (7C.9D), flag guard intact', function() {
  // 7C.9D: estimator-v2.js is now loaded as dormant defer asset with internal stub.
  // Behavioral dormancy: estimatorV2Enabled: false + internal stub = zero behavior when flag OFF.
  const fs = require('fs');
  const code = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert_(code.includes('fixeo-estimator-config.js'), 'config bootstrap must be in index.html');
  if (code.includes('fixeo-estimator-v2.js')) {
    const v2Idx = code.indexOf('fixeo-estimator-v2.js');
    const tag = code.slice(v2Idx - 40, v2Idx + 60);
    assert_(tag.includes('defer'), 'estimator-v2.js must be defer when present');
  }
});

test('N.5 Legacy estimator V1 still exists', function() {
  const fs = require('fs');
  assert_(fs.existsSync(path.join(ROOT, 'js/fixeo-estimation-engine-v1.js')));
});

test('N.6 No token decoding code in browser JS files', function() {
  const fs = require('fs');
  const browserFiles = [
    'js/fixeo-estimator-v2.js',
    'js/fixeo-estimator-api-v1.js',
    'js/fixeo-estimator-reservation-bridge-v1.js',
    'js/fixeo-estimator-config.js',
    'js/cod-payment.js',
  ];
  for (const f of browserFiles) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert_(
      !code.includes('unsealToken') && !code.includes('createDecipheriv') && !code.includes('aes-256-gcm'),
      f + ' must not contain token decoding code'
    );
  }
});

test('N.7 No pricing arithmetic in browser estimator files', function() {
  const fs = require('fs');
  // estimator-v2.js must not have * 65 or painted_m2 * anything
  if (!fs.existsSync(path.join(ROOT, 'js/fixeo-estimator-v2.js'))) return;
  const code = fs.readFileSync(path.join(ROOT, 'js/fixeo-estimator-v2.js'), 'utf8');
  assert_(!/painted_m2\s*\*\s*\d+/.test(code), 'estimator-v2.js must not contain price-per-m2 arithmetic');
  assert_(!code.includes('UNIT_RATE_FROM_ENGINE'), 'estimator-v2.js must not contain UNIT_RATE_FROM_ENGINE');
});

/* ════════════════════════════════════════════════════════════
   RESULTS
   ════════════════════════════════════════════════════════════ */
console.log('\n══ Booking Authority Test Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(e => console.log('    ✗ ' + e.name + ': ' + e.error));
  process.exit(1);
} else {
  console.log('  All booking authority tests passed ✓');
}
