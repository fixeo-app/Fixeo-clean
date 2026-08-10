#!/usr/bin/env node
/**
 * estimator-v2-security-tests.js — FIXEO Estimator V2 Security Tests
 * Phase 7C.9B
 *
 * 35 security tests covering token security, outcome gating,
 * production cleanliness, and architectural constraints.
 *
 * Run: node estimator-v2-security-tests.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../..');
const r    = (p) => path.join(ROOT, p);

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ ok: true, name });
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    results.push({ ok: false, name, err: e.message });
    console.error('  ✗', name, '—', e.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function fileContains(file, str) { return fs.readFileSync(r(file), 'utf8').includes(str); }
function fileNotContains(file, str) { return !fs.readFileSync(r(file), 'utf8').includes(str); }

console.log('\n══ FIXEO Estimator V2 Security Tests — Phase 7C.9B ══\n');

// ─────────────────────────────────────────────────────────────────
// 1-5: Token cryptography
// ─────────────────────────────────────────────────────────────────

test('1. sealToken/unsealToken round-trip works', function() {
  const { sealToken, unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const secret = 'test-secret-32-chars-min-padding!';
  const payload = { foo: 'bar', expires_at: Date.now() + 60000 };
  const token = sealToken(payload, secret);
  const out = unsealToken(token, secret);
  assert(out.foo === 'bar', 'payload not preserved');
});

test('2. Modified ciphertext rejected (GCM auth failure)', function() {
  const { sealToken, unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const secret = 'test-secret-32-chars-min-padding!';
  const token = sealToken({ x: 1, expires_at: Date.now() + 60000 }, secret);
  // Decode, flip a byte in ct, re-encode
  const env = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  const ctBuf = Buffer.from(env.ct, 'base64');
  ctBuf[0] ^= 0xFF;
  env.ct = ctBuf.toString('base64');
  const tampered = Buffer.from(JSON.stringify(env)).toString('base64url');
  let threw = false;
  try { unsealToken(tampered, secret); } catch (_) { threw = true; }
  assert(threw, 'tampered token should throw');
});

test('3. Expired token rejected', function() {
  const { sealToken, unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const secret = 'test-secret-32-chars-min-padding!';
  const token = sealToken({ x: 1, expires_at: Date.now() - 1000 }, secret);
  let threw = false;
  try { unsealToken(token, secret); } catch (e) { threw = e.message === 'Token expired'; }
  assert(threw, 'expired token should throw Token expired');
});

test('4. Missing secret throws (not returns null)', function() {
  const { sealToken, unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  let threw1 = false, threw2 = false;
  try { sealToken({}, null); } catch (e) { threw1 = true; }
  try { unsealToken('anything', ''); } catch (e) { threw2 = true; }
  assert(threw1, 'sealToken with null secret must throw');
  assert(threw2, 'unsealToken with empty secret must throw');
});

test('5. Wrong token version rejected', function() {
  const { unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const secret = 'test-secret-32-chars-min-padding!';
  const badToken = Buffer.from(JSON.stringify({ v: 'bad-version', iv: 'x', tag: 'x', ct: 'x' })).toString('base64url');
  let threw = false;
  try { unsealToken(badToken, secret); } catch (_) { threw = true; }
  assert(threw, 'unknown token version should throw');
});

// ─────────────────────────────────────────────────────────────────
// 6-7: Outcome gating
// ─────────────────────────────────────────────────────────────────

test('6. SAFETY_STOP outcome → normalizeOutcomeView returns no pricing context flag', function() {
  const { shouldIssuePricingContextToken } = require(r('api/estimator-v1/fixeo-estimator-runtime-v1'));
  const session = { outcome: { outcome_type: 'SAFETY_STOP', service_code: 'x', price: {} } };
  assert(!shouldIssuePricingContextToken(session), 'SAFETY_STOP must not issue pricing context');
});

test('7. QUOTE_REQUIRED outcome → no pricing context', function() {
  const { shouldIssuePricingContextToken } = require(r('api/estimator-v1/fixeo-estimator-runtime-v1'));
  const session = { outcome: { outcome_type: 'QUOTE_REQUIRED', service_code: 'x', price: {} } };
  assert(!shouldIssuePricingContextToken(session), 'QUOTE_REQUIRED must not issue pricing context');
});

// ─────────────────────────────────────────────────────────────────
// 8. No eval() in production JS files
// ─────────────────────────────────────────────────────────────────

test('8. No eval() in production JS files (estimator-v2, api index)', function() {
  const files = [
    'js/fixeo-estimator-v2.js',
    'api/estimator-v1/index.js',
    'js/fixeo-estimator-api-v1.js',
    'js/fixeo-estimator-reservation-bridge-v1.js',
  ];
  files.forEach(function(f) {
    const content = fs.readFileSync(r(f), 'utf8');
    // Allow eval in comments but not as function calls
    const hasEval = /[^a-zA-Z]eval\s*\(/.test(content);
    assert(!hasEval, f + ' contains eval()');
  });
});

// ─────────────────────────────────────────────────────────────────
// 9. No hardcoded price constants as price sources in estimator-v2.js
// ─────────────────────────────────────────────────────────────────

test('9. No hardcoded price constants (300,250,200,390,280) as price sources in estimator-v2.js', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-v2.js'), 'utf8');
  // Price constants must not appear as standalone numeric assignments used as prices
  // We check for known canonical amounts in assignment context
  const pricePattern = /(?:amount|price|total)\s*[=:]\s*(?:300|250|200|390|280)\b/;
  assert(!pricePattern.test(content), 'hardcoded price constants found as price sources');
});

// ─────────────────────────────────────────────────────────────────
// 10. No prototype fixture strings in production files
// ─────────────────────────────────────────────────────────────────

test('10. No prototype fixture strings in production files', function() {
  const files = [
    'js/fixeo-estimator-v2.js',
    'js/fixeo-estimator-config.js',
    'js/fixeo-estimator-api-v1.js',
    'api/estimator-v1/index.js',
    'estimation.html',
  ];
  const fixtureStrings = ['fixture=', 'resolveFlow', 'Flow A', 'Flow B', 'Flow C', 'Flow D', 'Flow E', 'Flow F', 'Flow G', 'Flow H'];
  files.forEach(function(f) {
    const content = fs.readFileSync(r(f), 'utf8');
    fixtureStrings.forEach(function(s) {
      assert(!content.includes(s), f + ' contains fixture string: ' + s);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// 11. No UNIT_RATE_FROM_ENGINE in production files
// ─────────────────────────────────────────────────────────────────

test('11. No UNIT_RATE_FROM_ENGINE in production files', function() {
  const files = ['js/fixeo-estimator-v2.js', 'estimation.html', 'api/estimator-v1/index.js'];
  files.forEach(function(f) {
    assert(fileNotContains(f, 'UNIT_RATE_FROM_ENGINE'), f + ' contains UNIT_RATE_FROM_ENGINE');
  });
});

// ─────────────────────────────────────────────────────────────────
// 12. No 'Flow A'/'Flow B' etc in production files
// ─────────────────────────────────────────────────────────────────

test('12. No Flow A/B/C/D/E/F/G/H in production files', function() {
  const files = ['js/fixeo-estimator-v2.js', 'estimation.html'];
  const pattern = /Flow [A-H]\b/;
  files.forEach(function(f) {
    const content = fs.readFileSync(r(f), 'utf8');
    assert(!pattern.test(content), f + ' contains Flow A-H reference');
  });
});

// ─────────────────────────────────────────────────────────────────
// 13. No 'PROTOTYPE' or 'NON PRODUCTION' in estimation.html visible text
// ─────────────────────────────────────────────────────────────────

test('13. No PROTOTYPE or NON PRODUCTION in estimation.html', function() {
  const content = fs.readFileSync(r('estimation.html'), 'utf8');
  assert(!content.includes('PROTOTYPE INTERNE'), 'PROTOTYPE INTERNE found in estimation.html');
  assert(!content.includes('NON PRODUCTION'), 'NON PRODUCTION found in estimation.html');
});

// ─────────────────────────────────────────────────────────────────
// 14. Feature flag default is false in config file
// ─────────────────────────────────────────────────────────────────

test('14. Feature flag default is false in config file', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-config.js'), 'utf8');
  assert(content.includes('estimatorV2Enabled: false'), 'estimatorV2Enabled must be false');
});

// ─────────────────────────────────────────────────────────────────
// 15. Feature flag check: undefined check in estimator-v2.js
// ─────────────────────────────────────────────────────────────────

test('15. Feature flag check: estimatorV2Enabled !== true → blocked', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-v2.js'), 'utf8');
  assert(content.includes('estimatorV2Enabled !== true'), 'estimator-v2.js must check estimatorV2Enabled !== true');
});

// ─────────────────────────────────────────────────────────────────
// 16. API file requires orchestrator (not engine directly)
// ─────────────────────────────────────────────────────────────────

test('16. api/estimator-v1/index.js requires orchestrator not engine directly', function() {
  const content = fs.readFileSync(r('api/estimator-v1/index.js'), 'utf8');
  assert(content.includes('estimator-orchestrator-v1'), 'must require estimator-orchestrator-v1');
  assert(!content.includes('pricing-engine-core-v1'), 'must NOT require pricing-engine-core directly');
  assert(!content.includes('fixeo-estimation-engine-v1'), 'must NOT require fixeo-estimation-engine-v1');
});

// ─────────────────────────────────────────────────────────────────
// 17. No require() of pricing engine in any browser JS file
// ─────────────────────────────────────────────────────────────────

test('17. No require() of pricing engine in browser JS files', function() {
  const files = [
    'js/fixeo-estimator-v2.js',
    'js/fixeo-estimator-api-v1.js',
    'js/fixeo-estimator-config.js',
    'js/fixeo-estimator-reservation-bridge-v1.js',
  ];
  files.forEach(function(f) {
    const content = fs.readFileSync(r(f), 'utf8');
    assert(!content.includes("require("), f + ' must not contain require()');
  });
});

// ─────────────────────────────────────────────────────────────────
// 18. LABOUR_PLUS_PART: labour_amount_mad and amount_mad never summed
// ─────────────────────────────────────────────────────────────────

test('18. LABOUR_PLUS_PART: labour_amount_mad and amount_mad never summed', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-v2.js'), 'utf8');
  // Must not have pattern like labour_amount_mad + amount_mad or vice versa
  assert(
    !content.includes('labour_amount_mad + amount_mad') && !content.includes('amount_mad + labour_amount_mad'),
    'labour_amount_mad and amount_mad must never be summed'
  );
  // Also check runtime
  const runtime = fs.readFileSync(r('api/estimator-v1/fixeo-estimator-runtime-v1.js'), 'utf8');
  assert(
    !runtime.includes('labour_amount_mad + amount_mad') && !runtime.includes('amount_mad + labour_amount_mad'),
    'runtime: labour_amount_mad and amount_mad must never be summed'
  );
});

// ─────────────────────────────────────────────────────────────────
// 19. Reservation bridge stores only opaque token (no raw amounts)
// ─────────────────────────────────────────────────────────────────

test('19. Reservation bridge stores only opaque token (no raw amounts in setItem)', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-reservation-bridge-v1.js'), 'utf8');
  // setItem should ONLY store the opaque token string — never a raw amount
  // (amount_mad may appear in JSDoc/comments describing the server response, that is fine)
  assert(!content.match(/setItem\([^,]+,\s*amount/), 'bridge must not pass raw amount to setItem');
  assert(!content.match(/setItem\([^,]+,\s*\d+/), 'bridge must not pass literal number to setItem');
  // Verify prepareContext stores only pricingContextToken
  assert(content.includes('setItem(CTX_KEY, pricingContextToken)'), 'bridge must store opaque token');
});

// ─────────────────────────────────────────────────────────────────
// 20. sessionStorage key for pricing context stores opaque value only
// ─────────────────────────────────────────────────────────────────

test('20. sessionStorage key for pricing context is fixeo_estimator_ctx_v1', function() {
  const bridgeContent = fs.readFileSync(r('js/fixeo-estimator-reservation-bridge-v1.js'), 'utf8');
  assert(bridgeContent.includes("'fixeo_estimator_ctx_v1'"), 'bridge must use key fixeo_estimator_ctx_v1');
});

// ─────────────────────────────────────────────────────────────────
// 21. verifyContext is async (returns Promise)
// ─────────────────────────────────────────────────────────────────

test('21. verifyContext returns Promise', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-reservation-bridge-v1.js'), 'utf8');
  assert(content.includes('return Promise.resolve'), 'verifyContext must return Promise');
  assert(content.includes('.then(function'), 'verifyContext must use Promise chain');
});

// ─────────────────────────────────────────────────────────────────
// 22-23: vercel.json routes
// ─────────────────────────────────────────────────────────────────

test('22. vercel.json has /estimation route', function() {
  const v = JSON.parse(fs.readFileSync(r('vercel.json'), 'utf8'));
  const hasEstimation = v.routes.some(function(route) {
    return route.src && route.src.includes('/estimation') && route.dest && route.dest.includes('estimation.html');
  });
  assert(hasEstimation, 'vercel.json missing /estimation route');
});

test('23. vercel.json has /api/estimator-v1 route', function() {
  const v = JSON.parse(fs.readFileSync(r('vercel.json'), 'utf8'));
  const hasApi = v.routes.some(function(route) {
    return route.src && route.src.includes('estimator-v1') && route.dest && route.dest.includes('estimator-v1');
  });
  assert(hasApi, 'vercel.json missing /api/estimator-v1 route');
});

// ─────────────────────────────────────────────────────────────────
// 24. Legacy estimator V1 file still exists
// ─────────────────────────────────────────────────────────────────

test('24. Legacy estimator V1 file still exists and not deleted', function() {
  assert(fs.existsSync(r('js/fixeo-estimation-engine-v1.js')), 'js/fixeo-estimation-engine-v1.js must still exist');
});

// ─────────────────────────────────────────────────────────────────
// 25. api/estimator-v1/index.js fails closed when secret missing
// ─────────────────────────────────────────────────────────────────

test('25. api/estimator-v1/index.js fails closed when FIXEO_ESTIMATOR_SECRET missing', function() {
  const content = fs.readFileSync(r('api/estimator-v1/index.js'), 'utf8');
  assert(content.includes('config_error'), 'must return config_error when secret absent');
  assert(content.includes('503'), 'must return 503 status');
  assert(!content.includes("|| ''"), 'must not fall back to empty string secret');
});

// ─────────────────────────────────────────────────────────────────
// 26. Token cannot be decoded without secret
// ─────────────────────────────────────────────────────────────────

test('26. Token cannot be decoded without secret', function() {
  const { sealToken, unsealToken } = require(r('api/estimator-v1/fixeo-estimator-token-v1'));
  const secret = 'correct-secret-32-chars-padding!!';
  const token = sealToken({ x: 1, expires_at: Date.now() + 60000 }, secret);
  let threw = false;
  try { unsealToken(token, 'wrong-secret-32-chars-padding!!!!'); } catch (_) { threw = true; }
  assert(threw, 'wrong secret should cause GCM auth failure');
});

// ─────────────────────────────────────────────────────────────────
// 27-28: pricing_context_token not generated for SAFETY_STOP/ROUTE_REQUIRED
// ─────────────────────────────────────────────────────────────────

test('27. pricing_context_token not generated for SAFETY_STOP', function() {
  const { shouldIssuePricingContextToken } = require(r('api/estimator-v1/fixeo-estimator-runtime-v1'));
  assert(!shouldIssuePricingContextToken({ outcome: { outcome_type: 'SAFETY_STOP' } }));
});

test('28. pricing_context_token not generated for ROUTE_REQUIRED', function() {
  const { shouldIssuePricingContextToken } = require(r('api/estimator-v1/fixeo-estimator-runtime-v1'));
  assert(!shouldIssuePricingContextToken({ outcome: { outcome_type: 'ROUTE_REQUIRED' } }));
});

// ─────────────────────────────────────────────────────────────────
// 29. No price in URL in PAGE_REQUIRED flow
// ─────────────────────────────────────────────────────────────────

test('29. No price in URL (no amount= param) in PAGE_REQUIRED flow', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-v2.js'), 'utf8');
  // When navigating to /estimation, must not append amount= to URL
  assert(!content.includes("href = '/estimation?amount"), 'must not put amount in estimation URL');
  assert(!content.includes("+ '?amount="), 'must not append ?amount= to estimation URL');
});

// ─────────────────────────────────────────────────────────────────
// 30. Booking data preserves existing fields
// ─────────────────────────────────────────────────────────────────

test('30. Booking data preserves existing fields (isExpress still present)', function() {
  const content = fs.readFileSync(r('js/reservation.js'), 'utf8');
  assert(content.includes('isExpress   : state.isExpress'), 'isExpress field must be preserved in bookingData');
  assert(content.includes('_estimator_context_token'), '_estimator_context_token added to bookingData');
});

// ─────────────────────────────────────────────────────────────────
// 31. estimator-v2.js uses window.FixeoEstimatorAPI (not direct fetch to engine)
// ─────────────────────────────────────────────────────────────────

test('31. estimator-v2.js uses window.FixeoEstimatorAPI not direct engine fetch', function() {
  const content = fs.readFileSync(r('js/fixeo-estimator-v2.js'), 'utf8');
  assert(content.includes('window.FixeoEstimatorAPI'), 'must use window.FixeoEstimatorAPI');
  assert(!content.includes("fetch('/api/engine"), 'must not call engine directly');
  assert(!content.includes("pricing-engine-core"), 'must not reference engine directly');
});

// ─────────────────────────────────────────────────────────────────
// 32. css/fixeo-estimator-v2.css has no prototype-specific classes
// ─────────────────────────────────────────────────────────────────

test('32. css/fixeo-estimator-v2.css has no prototype-specific classes', function() {
  const content = fs.readFileSync(r('css/fixeo-estimator-v2.css'), 'utf8');
  assert(!content.includes('.fixeo-prototype-launcher'), 'must not have .fixeo-prototype-launcher');
  assert(!content.includes('.proto-banner'), 'must not have .proto-banner');
  assert(!content.includes('.fixture-'), 'must not have .fixture-* classes');
});

// ─────────────────────────────────────────────────────────────────
// 33. estimation.html has no hardcoded multiplication constants
// ─────────────────────────────────────────────────────────────────

test('33. estimation.html has no hardcoded multiplication constants (UNIT_RATE * m2)', function() {
  const content = fs.readFileSync(r('estimation.html'), 'utf8');
  assert(!content.includes('UNIT_RATE_FROM_ENGINE'), 'must not have UNIT_RATE_FROM_ENGINE');
  assert(!content.includes('* 65'), 'must not multiply by 65 (hardcoded rate)');
  assert(!content.includes('* UNIT_RATE'), 'must not multiply by any UNIT_RATE constant');
});

// ─────────────────────────────────────────────────────────────────
// 34. api/estimator-v1/index.js has no hardcoded FIXEO_ESTIMATOR_SECRET value
// ─────────────────────────────────────────────────────────────────

test('34. api/estimator-v1/index.js has no hardcoded FIXEO_ESTIMATOR_SECRET value', function() {
  const content = fs.readFileSync(r('api/estimator-v1/index.js'), 'utf8');
  // Must read from env, not contain a hardcoded key
  assert(content.includes('process.env.FIXEO_ESTIMATOR_SECRET'), 'must read from env');
  // Must not have a string that looks like an actual secret value
  assert(!/"[A-Za-z0-9_\-]{20,}"/.test(content.replace('FIXEO_ESTIMATOR_SECRET', '')),
    'must not have hardcoded secret value');
});

// ─────────────────────────────────────────────────────────────────
// 35. Token uses AES-256-GCM algorithm string in token module
// ─────────────────────────────────────────────────────────────────

test('35. Token module uses AES-256-GCM algorithm string', function() {
  const content = fs.readFileSync(r('api/estimator-v1/fixeo-estimator-token-v1.js'), 'utf8');
  assert(content.includes("'aes-256-gcm'"), "token module must use 'aes-256-gcm'");
});

// ─────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────

console.log('\n══ Results ══');
console.log('  Passed:', passed, '/ Total:', passed + failed);
if (failed > 0) {
  console.log('  Failed:', failed);
  process.exit(1);
} else {
  console.log('  All security tests passed ✓');
  process.exit(0);
}
