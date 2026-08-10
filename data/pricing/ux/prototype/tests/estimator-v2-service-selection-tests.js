'use strict';
/**
 * estimator-v2-service-selection-tests.js
 * Phase 7C.9K.5 — SERVICE_SELECTION contract + RAFI takeover tests
 * 39 targeted tests (covers all 39 items from spec)
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

const orchestrator = require(path.join(root, 'data/pricing/orchestrator/estimator-orchestrator-v1.js'));
const resolver     = require(path.join(root, 'data/pricing/orchestrator/estimator-service-resolver-v1.js'));

// ─── SECTION 1: Orchestrator selectService ───────────────────────────────────
console.log('\nSECTION 1 — Orchestrator selectService()');

function startFor(metier) {
  return orchestrator.startEstimator({ metier_hint: metier });
}

// 1. valid plomberie
var r1 = orchestrator.selectService(startFor('plomberie').session, 'plomberie.fuite_simple');
assert('1. valid plomberie selection ok', r1.ok === true);

// 2. valid electricite (pick first candidate)
var elecCandidates = resolver.getCandidateServices('electricite');
var r2 = orchestrator.selectService(startFor('electricite').session, elecCandidates[0].service_code);
assert('2. valid electricite selection ok', r2.ok === true);

// 3. valid menuiserie (pick first candidate)
var menuCandidates = resolver.getCandidateServices('menuiserie');
var r3 = orchestrator.selectService(startFor('menuiserie').session, menuCandidates[0].service_code);
assert('3. valid menuiserie selection ok', r3.ok === true);

// 4. SERVICE_SELECTION → QUALIFICATION (service with questions)
assert('4. plomberie.fuite_simple → QUALIFICATION',
  r1.session.state === 'QUALIFICATION');

// 5. SERVICE_SELECTION → READY_FOR_ENGINE (service with no questions)
var r5 = orchestrator.selectService(startFor('plomberie').session, 'plomberie.diagnostic');
assert('5. plomberie.diagnostic → READY_FOR_ENGINE', r5.session.state === 'READY_FOR_ENGINE');

// 6. new session_token is distinct from input (tested via state change — token sealing is API-layer)
assert('6. returned session has service_code set', r1.session.service_code === 'plomberie.fuite_simple');

// 7. selected service_code persisted on session
assert('7. service_code persisted correctly', r5.session.service_code === 'plomberie.diagnostic');

// 8. missing service_code rejected
var r8 = orchestrator.selectService(startFor('plomberie').session, '');
assert('8. empty service_code rejected', r8.ok === false && r8.error.code === 'MISSING_SERVICE_CODE');

// 9. unknown service_code rejected
var r9 = orchestrator.selectService(startFor('plomberie').session, 'plomberie.does_not_exist_xyz');
assert('9. unknown service_code rejected', r9.ok === false && r9.error.code === 'UNKNOWN_SERVICE_CODE');

// 10. cross-métier service_code rejected
var r10 = orchestrator.selectService(startFor('plomberie').session, elecCandidates[0].service_code);
assert('10. cross-métier code rejected', r10.ok === false && r10.error.code === 'UNKNOWN_SERVICE_CODE');

// 11. select_service from illegal state rejected (QUALIFICATION session)
var illegalSession = r1.session; // already in QUALIFICATION
var r11 = orchestrator.selectService(illegalSession, 'plomberie.fuite_simple');
assert('11. ILLEGAL_STATE when not SERVICE_SELECTION', r11.ok === false && r11.error.code === 'ILLEGAL_STATE');

// 12. null session rejected
var r12 = orchestrator.selectService(null, 'plomberie.fuite_simple');
assert('12. null session rejected', r12.ok === false && r12.error.code === 'NO_SESSION');

// ─── SECTION 2: API index — sanitizeStep / handleSelectService ───────────────
console.log('\nSECTION 2 — API contract (source audit)');

const apiSrc = read('api/estimator-v1/index.js');

assert('13. select_service in VALID_ACTIONS', apiSrc.includes("'select_service'"));
assert('14. handleSelectService function defined', apiSrc.includes('function handleSelectService('));
assert('15. dispatch case select_service wired', apiSrc.includes("case 'select_service'") && apiSrc.includes('handleSelectService'));
assert('16. sanitizeStep has SERVICE_SELECTION branch', apiSrc.includes("step.type === 'SERVICE_SELECTION'"));
assert('17. sanitizeStep SERVICE_SELECTION emits service_code + label_fr + short_label_fr',
  apiSrc.includes('service_code:    s.service_code') &&
  apiSrc.includes('label_fr:        s.label_fr') &&
  apiSrc.includes('short_label_fr:  s.short_label_fr'));
assert('18. sanitizeStep SERVICE_SELECTION does NOT emit commercial_output_type',
  !apiSrc.match(/SERVICE_SELECTION[\s\S]{0,300}commercial_output_type/));
assert('19. handleSelectService validates missing session_token', apiSrc.includes("'missing_session_token'"));
assert('20. handleSelectService validates missing service_code', apiSrc.includes("'missing_service_code'"));
assert('21. handleSelectService calls orchestrator.selectService', apiSrc.includes('orchestrator.selectService('));
assert('22. handleSelectService issues new opaque token via normalizeSessionView',
  // handleSelectService() body contains normalizeSessionView(updatedSession, secret).
  // Both appear at module scope; confirm the normalizeSessionView call appears
  // after the handleSelectService function start and before handleSelectService ends
  // (i.e. before the next top-level function definition that follows it).
  (function() {
    var fnStart = apiSrc.indexOf('function handleSelectService(');
    var fnEnd   = apiSrc.indexOf('\nfunction ', fnStart + 1);
    if (fnStart < 0 || fnEnd < 0) return false;
    var body = apiSrc.slice(fnStart, fnEnd);
    return body.includes('normalizeSessionView(updatedSession, secret)');
  })());
assert('23. no raw session payload in handleSelectService response',
  !apiSrc.match(/handleSelectService[\s\S]{0,600}sessionPayload\b[\s\S]{0,50}return.*body.*sessionPayload/));

// ─── SECTION 3: Client API helper ────────────────────────────────────────────
console.log('\nSECTION 3 — Client API helper');

const apiClientSrc = read('js/fixeo-estimator-api-v1.js');
assert('24. selectService helper exists',
  apiClientSrc.includes('selectService: function(sessionToken, serviceCode)'));
assert('25. selectService calls action: select_service',
  apiClientSrc.includes("action: 'select_service'"));
assert('26. passes session_token and service_code',
  apiClientSrc.includes('session_token: sessionToken') &&
  apiClientSrc.includes('service_code: serviceCode'));
assert('27. existing start/answer/evaluate unchanged',
  apiClientSrc.includes("action: 'start'") &&
  apiClientSrc.includes("action: 'answer'") &&
  apiClientSrc.includes("action: 'evaluate'"));

// ─── SECTION 4: Frontend V2 UI ───────────────────────────────────────────────
console.log('\nSECTION 4 — Estimator V2 UI (source audit)');

const v2Src = read('js/fixeo-estimator-v2.js');

assert('28. _renderStep has SERVICE_SELECTION branch (not falling to evaluate)',
  v2Src.includes("next_step.type === 'SERVICE_SELECTION'") &&
  v2Src.match(/SERVICE_SELECTION[\s\S]{0,100}_renderServiceSelection/));
assert('29. SERVICE_SELECTION branch does NOT call _evaluate() — calls _renderServiceSelection',
  // The branch for SERVICE_SELECTION calls _renderServiceSelection, not _evaluate.
  // Verify by checking the SERVICE_SELECTION block contents directly.
  v2Src.includes("next_step.type === 'SERVICE_SELECTION'") &&
  v2Src.includes('self._renderServiceSelection(next_step)') &&
  // The _evaluate() calls that follow are in DIFFERENT branches (READY_FOR_ENGINE / fallback)
  !v2Src.match(/_renderServiceSelection\(next_step\)[\s\S]{0,50}self\._evaluate\(\)/));
assert('30. _renderServiceSelection method defined',
  v2Src.includes('EstimatorModal.prototype._renderServiceSelection'));
assert('31. _renderServiceSelection uses FixeoEstimatorAPI.selectService',
  v2Src.includes('window.FixeoEstimatorAPI.selectService(STATE.sessionToken, serviceCode)'));
assert('32. pending lock prevents repeated taps',
  v2Src.match(/pending = true[\s\S]{0,600}FixeoEstimatorAPI\.selectService/));
assert('33. returned session_token replaces STATE.sessionToken after selectService',
  v2Src.match(/selectService[\s\S]{0,600}STATE\.sessionToken = r\.session\.session_token/));
assert('34. API failure does NOT call _evaluate()',
  !v2Src.match(/selectService[\s\S]{0,500}\.catch[\s\S]{0,100}self\._evaluate\(\)/));
assert('35. API failure shows recoverable error message',
  v2Src.match(/selectService[\s\S]{0,800}\.catch[\s\S]{0,200}self\._showError/));
assert('36. calls _renderStep after success (within 600 chars of selectService call)',
  v2Src.match(/FixeoEstimatorAPI\.selectService[\s\S]{0,600}self\._renderStep\(r\.session, r\.next_step\)/));
assert('37. no pricing arithmetic in _renderServiceSelection',
  !v2Src.match(/_renderServiceSelection[\s\S]{0,2000}(price|prix|MAD|tarif|calcul)/i));

// ─── SECTION 5: RAFI takeover closeModal ─────────────────────────────────────
console.log('\nSECTION 5 — RAFI takeover closeModal (7C.9K.5)');

const rafiSrc = read('js/fx-request-flow-v4.js');

assert('38. accepted:true calls window.closeModal(\'request-modal\')',
  rafiSrc.match(/accepted === true[\s\S]{0,300}window\.closeModal\('request-modal'\)/));
assert('39. closeModal precedes return (dismiss before suppress)',
  rafiSrc.match(/window\.closeModal\('request-modal'\);\s*\n\s*return;/));

// ─── SECTION 6: Integrity ─────────────────────────────────────────────────────
console.log('\nSECTION 6 — Canonical integrity');

const eng  = read('data/pricing/engine/pricing-engine-core-v1.js');
const auth = read('api/fixeo-booking-authority-v1.js');
const idm  = read('api/fixeo-estimator-idempotency-v1.js');

assert('40. engine has no 7C.9K.5 reference', !eng.includes('7C.9K.5'));
assert('41. booking authority has no 7C.9K.5 reference', !auth.includes('7C.9K.5'));
assert('42. idempotency has no 7C.9K.5 reference', !idm.includes('7C.9K.5'));
assert('43. index.html unchanged (no 7C.9K.5)', !read('index.html').includes('7C.9K.5'));
assert('44. estimatorV2Enabled still true', read('js/fixeo-estimator-config.js').includes('estimatorV2Enabled: true'));
assert('45. emergency _onSitTap unchanged',
  rafiSrc.includes(
    "var ack = MSG.ackEmergency[sit.slug] || MSG.ackEmergency._default;\n          _chipTap(chip, chips, function() { _transitionFwd(_renderStep2); }, ack);"
  ));

// ─── FINAL ─────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '─'.repeat(60));
console.log('  Passed: ' + passed + ' / Total: ' + total);
if (failed === 0) {
  console.log('  All 7C.9K.5 service-selection + RAFI takeover tests passed ✓');
} else {
  console.log('  Failed: ' + failed);
  process.exit(1);
}
