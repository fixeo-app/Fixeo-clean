'use strict';
/**
 * estimator-v2-reservation-handoff-tests.js
 * Phase 7C.9L.1 — Estimator V2 → Reservation handoff tests
 * 20 targeted tests
 */

const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../../../../');

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else           { console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const idxSrc = read('index.html');
const v2Src  = read('js/fixeo-estimator-v2.js');
const resSrc = read('js/reservation.js');
const authSrc = read('api/fixeo-booking-authority-v1.js');

// ─── SECTION 1: Listener wiring ──────────────────────────────────────────────
console.log('\nSECTION 1 — fixeo:estimator-reserve listener');

assert('1. Listener exists in index.html',
  idxSrc.includes("document.addEventListener('fixeo:estimator-reserve'"));

assert('2. Exactly ONE listener registered (no duplicate)',
  (idxSrc.match(/addEventListener\('fixeo:estimator-reserve'/g) || []).length === 1);

assert('3. Valid token check — missing token returns early',
  idxSrc.includes('if (!token) return'));

assert('4. _reservationHandoffPending guard declared',
  idxSrc.includes('_reservationHandoffPending = false') &&
  idxSrc.includes('_reservationHandoffPending = true'));

assert('5. Double-tap guard prevents duplicate loads',
  idxSrc.match(/_reservationHandoffPending[\s\S]{0,20}return/));

assert('6. loadReservationStack called inside listener',
  idxSrc.match(/addEventListener\('fixeo:estimator-reserve'[\s\S]{0,600}loadReservationStack/));

assert('7. FixeoReservation.open check — unavailable leaves Estimator visible',
  idxSrc.match(/FixeoReservation\.open[\s\S]{0,50}function/) &&
  idxSrc.match(/FixeoReservation[\s\S]{0,50}FixeoReservation\.open[\s\S]{0,50}!== 'function'[\s\S]{0,100}_reservationHandoffPending = false;\s*\n\s*return/));

assert('8. FixeoReservation.open(null, false, null) called with exact signature',
  idxSrc.includes('window.FixeoReservation.open(null, false, null)'));

assert('9. FixeoEstimatorV2.close() called AFTER open() — not before',
  (function() {
    var openIdx = idxSrc.indexOf('window.FixeoReservation.open(null, false, null)');
    var closeIdx = idxSrc.indexOf('window.FixeoEstimatorV2.close()', openIdx);
    return openIdx > 0 && closeIdx > openIdx;
  })());

assert('10. catch block resets guard and does NOT close Estimator',
  idxSrc.match(/catch\s*\(_err\)[\s\S]{0,100}_reservationHandoffPending = false/) &&
  !idxSrc.match(/catch\s*\(_err\)[\s\S]{0,100}FixeoEstimatorV2\.close/));

assert('11. Guard reset on success after handoff',
  idxSrc.match(/FixeoEstimatorV2\.close\(\)[\s\S]{0,200}_reservationHandoffPending = false/));

// ─── SECTION 2: Estimator V2 CTA behavior ────────────────────────────────────
console.log('\nSECTION 2 — PRICE_READY CTA close behavior');

assert('12. pricing_context_token event detail still present',
  v2Src.includes("detail: { pricing_context_token: self._pricingContextToken }"));

assert('13. PRICE_READY CTA no longer calls STATE.onClose() unconditionally',
  (function() {
    var ctaStart = v2Src.indexOf('7C.9L.1: dispatch reservation event');
    var ctaEnd   = v2Src.indexOf("} else if (ot === 'QUOTE_REQUIRED')", ctaStart);
    if (ctaStart < 0 || ctaEnd < 0) return false;
    var block = v2Src.slice(ctaStart, ctaEnd);
    var noComments = block.replace(/\/\/[^\n]*/g, '');
    return !noComments.includes('STATE.onClose()');
  })());

assert('14. X close button (closeBtn) still calls STATE.onClose()',
  v2Src.match(/closeBtn\.addEventListener\('click', function\(\) \{ if \(STATE\.onClose\) STATE\.onClose\(\); \}\)/));

assert('15. Other outcome CTAs (QUOTE_REQUIRED, SAFETY_STOP) unchanged',
  v2Src.match(/QUOTE_REQUIRED[\s\S]{0,200}STATE\.onClose\(\)/) &&
  v2Src.match(/SAFETY_STOP[\s\S]{0,200}STATE\.onClose\(\)/));

// ─── SECTION 3: Token chain integrity ────────────────────────────────────────
console.log('\nSECTION 3 — pricing_context_token chain');

assert('16. _pricingContextToken set from evaluate response',
  v2Src.includes('self._pricingContextToken = r.pricing_context_token || null'));

assert('17. prepareContext stores token to sessionStorage before dispatch',
  (function() {
    var prepIdx = v2Src.indexOf('FixeoEstimatorReservationBridge.prepareContext(self._pricingContextToken)');
    var dispIdx = v2Src.indexOf("'fixeo:estimator-reserve'", prepIdx);
    return prepIdx > 0 && dispIdx > prepIdx;
  })());

assert('18. booking authority _estimator_context_token chain intact',
  resSrc.includes('_estimator_context_token: (state._estimatorCtx && state._estimatorCtx._token) || null') &&
  authSrc.includes('estimatorContextToken'));

// ─── SECTION 4: Integrity ─────────────────────────────────────────────────────
console.log('\nSECTION 4 — Canonical integrity');

assert('19. canonical pricing diff = 0',
  !read('data/pricing/canonical/canonical-registry.v1.draft.json').includes('7C.9L'));

assert('20. booking authority unchanged (no 7C.9L reference)',
  !authSrc.includes('7C.9L'));

// ─── FINAL ─────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9L.1 reservation handoff tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exit(1);
}
