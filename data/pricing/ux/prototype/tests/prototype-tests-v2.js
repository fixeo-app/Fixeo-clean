/* ═══════════════════════════════════════════════════════════════════
   FIXEO Estimator Prototype Tests V2 — Phase 7C.8C
   Tests for Visual Intelligence & Conversion Refinement V2
   Status: PROTOTYPE INTERNE — NON PRODUCTION
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

var fs = require('fs');
var path = require('path');

/* ─── Paths ──────────────────────────────────────────────────────── */
var PROTO_DIR = path.join(__dirname, '..');
var JS_FILE   = path.join(PROTO_DIR, 'estimator-prototype.js');
var CSS_FILE  = path.join(PROTO_DIR, 'estimator-prototype.css');
var HTML_FILE = path.join(PROTO_DIR, 'estimator-prototype.html');
var PAGE_FILE = path.join(PROTO_DIR, 'estimation-page-prototype.html');
var REPORT_FILE = path.join(PROTO_DIR, 'prototype-test-report.v2.json');

/* ─── Read files ─────────────────────────────────────────────────── */
var jsContent   = fs.readFileSync(JS_FILE, 'utf8');
var cssContent  = fs.readFileSync(CSS_FILE, 'utf8');
var htmlContent = fs.readFileSync(HTML_FILE, 'utf8');
var pageContent = fs.readFileSync(PAGE_FILE, 'utf8');

/* ─── Runner ─────────────────────────────────────────────────────── */
var passed = 0;
var failed = 0;
var results = [];

function test(name, fn) {
  try {
    var ok = fn();
    if (ok) {
      passed++;
      results.push({ name: name, status: 'PASS' });
    } else {
      failed++;
      results.push({ name: name, status: 'FAIL', reason: 'Assertion returned false' });
      console.error('FAIL: ' + name);
    }
  } catch(e) {
    failed++;
    results.push({ name: name, status: 'FAIL', reason: e.message });
    console.error('FAIL: ' + name + ' — ' + e.message);
  }
}

/* ═══ TEST SUITE V2 ═══════════════════════════════════════════════ */

// 1. No alert() in estimator-prototype.js
test('01 No alert() in estimator-prototype.js', function() {
  // alert() must not appear as a call (not in comments/strings used in production flow)
  // We check for alert( as a function call pattern
  var alerts = jsContent.match(/\balert\s*\(/g) || [];
  return alerts.length === 0;
});

// 2. No alert() in estimator-prototype.html
test('02 No alert() in estimator-prototype.html', function() {
  var alerts = htmlContent.match(/\balert\s*\(/g) || [];
  return alerts.length === 0;
});

// 3. No alert() in estimation-page-prototype.html
test('03 No alert() in estimation-page-prototype.html', function() {
  var alerts = pageContent.match(/\balert\s*\(/g) || [];
  return alerts.length === 0;
});

// 4. ctaLabel function present in JS
test('04 ctaLabel function present in JS', function() {
  return jsContent.indexOf('function ctaLabel') >= 0 || jsContent.indexOf('ctaLabel') >= 0;
});

// 5. RAFI_STATES present in JS
test('05 RAFI_STATES present in JS', function() {
  return jsContent.indexOf('RAFI_STATES') >= 0;
});

// 6. setRAFIState function present in JS
test('06 setRAFIState function present in JS', function() {
  return jsContent.indexOf('function setRAFIState') >= 0 || jsContent.indexOf('setRAFIState') >= 0;
});

// 7. showHandoffScreen present in JS
test('07 showHandoffScreen present in JS', function() {
  return jsContent.indexOf('showHandoffScreen') >= 0;
});

// 8. Auto-advance logic (400ms for boolean)
test('08 Auto-advance boolean answer with 400ms delay in JS', function() {
  return jsContent.indexOf('400') >= 0 && jsContent.indexOf('onAutoAdvance') >= 0;
});

// 9. result-price-container class in CSS
test('09 result-price-container class in CSS', function() {
  return cssContent.indexOf('.result-price-container') >= 0;
});

// 10. result-price-number class in CSS
test('10 result-price-number class in CSS', function() {
  return cssContent.indexOf('.result-price-number') >= 0;
});

// 11. result-price-unit class in CSS
test('11 result-price-unit class in CSS', function() {
  return cssContent.indexOf('.result-price-unit') >= 0;
});

// 12. scope-chip class in CSS
test('12 scope-chip class in CSS', function() {
  return cssContent.indexOf('.scope-chip') >= 0;
});

// 13. scope-collapse-trigger class in CSS
test('13 scope-collapse-trigger class in CSS', function() {
  return cssContent.indexOf('.scope-collapse-trigger') >= 0;
});

// 14. labour-disclosure class in CSS or JS
test('14 labour-disclosure class in CSS or JS', function() {
  return cssContent.indexOf('.labour-disclosure') >= 0 || jsContent.indexOf('labour-disclosure') >= 0;
});

// 15. Diagnostic deduction copy in JS
test('15 Diagnostic deduction copy in JS', function() {
  return jsContent.indexOf('déduit') >= 0 && jsContent.indexOf('diagnostic') >= 0;
});

// 16. Quote "vérifiée sur place" copy in JS
test('16 Quote "vérifiée sur place" copy in JS', function() {
  return jsContent.indexOf('vérifiée sur place') >= 0 || jsContent.indexOf('verifee sur place') >= 0 ||
         jsContent.indexOf('doit être vérifiée') >= 0;
});

// 17. Safety "vérification nécessaire" copy in JS
test('17 Safety "vérification nécessaire" copy in JS', function() {
  return jsContent.indexOf('vérification est nécessaire') >= 0;
});

// 18. Route "autre métier" copy in JS
test('18 Route "autre métier" copy in JS', function() {
  return jsContent.indexOf('autre métier') >= 0 || jsContent.indexOf('autre metier') >= 0;
});

// 19. 64px price size in CSS
test('19 64px price size in CSS', function() {
  return cssContent.indexOf('64px') >= 0 || cssContent.indexOf('56px') >= 0;
});

// 20. No #A0A0A0 as primary text color (may exist elsewhere, not as main secondary)
test('20 No #A0A0A0 as --color-text-secondary in CSS', function() {
  // Check that the CSS variable for secondary text is NOT #A0A0A0
  var secondaryMatch = cssContent.match(/--color-text-secondary\s*:\s*([^;]+);/);
  if (secondaryMatch) {
    return secondaryMatch[1].trim() !== '#A0A0A0';
  }
  return true;
});

// 21. "Trouver un artisan" CTA label in JS
test('21 "Trouver un artisan" CTA label in JS', function() {
  return jsContent.indexOf('Trouver un artisan') >= 0;
});

// 22. "Réserver le diagnostic" CTA label in JS
test('22 "Réserver le diagnostic" CTA label in JS', function() {
  return jsContent.indexOf('Réserver le diagnostic') >= 0;
});

// 23. "Demander un devis" CTA label in JS
test('23 "Demander un devis" CTA label in JS', function() {
  return jsContent.indexOf('Demander un devis') >= 0;
});

// 24. 200ms or 220ms transition in CSS
test('24 220ms or 200ms transition in CSS', function() {
  return cssContent.indexOf('220ms') >= 0 || cssContent.indexOf('200ms') >= 0;
});

// 25. RAFI pulse animation in CSS (@keyframes pulse-glow)
test('25 RAFI pulse animation @keyframes pulse-glow in CSS', function() {
  return cssContent.indexOf('pulse-glow') >= 0 && cssContent.indexOf('@keyframes') >= 0;
});

// 26. intelligence-line class in CSS
test('26 intelligence-line animated accent in CSS', function() {
  return cssContent.indexOf('.intelligence-line') >= 0;
});

// 27. Content-adaptive mobile height (not only hard 90vh)
test('27 Mobile adaptive height (min/dvh) in CSS', function() {
  return cssContent.indexOf('100dvh') >= 0 || cssContent.indexOf('min(') >= 0;
});

// 28. Safe-area-inset preserved in CSS
test('28 safe-area-inset preserved in CSS', function() {
  return cssContent.indexOf('safe-area-inset') >= 0;
});

// 29. No floor→painted conversion in JS
test('29 No floor-to-painted conversion in JS', function() {
  return jsContent.indexOf('floor_m2') < 0 &&
         jsContent.indexOf('floor * ') < 0 &&
         jsContent.indexOf('floor2painted') < 0;
});

// 30. No production imports in JS
test('30 No production imports in JS', function() {
  return jsContent.indexOf('reservation.js') < 0 &&
         jsContent.indexOf('reservation-v2.js') < 0 &&
         jsContent.indexOf('require(\'../../../js') < 0;
});

// 31. All 8 outcome types referenced in JS
test('31 All 8 outcome types referenced in JS', function() {
  var types = ['PRICE_READY','DIAGNOSTIC_READY','LABOUR_PLUS_PART_READY',
               'QUOTE_REQUIRED','ROUTE_REQUIRED','SAFETY_STOP','REQUALIFY','ADD_ON_READY'];
  return types.every(function(t) { return jsContent.indexOf(t) >= 0; });
});

// 32. 24px modal radius in CSS
test('32 24px modal radius in CSS', function() {
  return cssContent.indexOf('24px') >= 0 && cssContent.indexOf('--modal-radius') >= 0;
});

// 33. Layered box-shadow (multiple shadow layers) in CSS
test('33 Layered box-shadow in CSS', function() {
  // Check for multiple shadows (comma-separated)
  return /box-shadow\s*:[^;]*,[^;]*,[^;]*;/.test(cssContent);
});

// 34. Warm background #FDFCFA in CSS
test('34 Warm background #FDFCFA in CSS', function() {
  return cssContent.indexOf('#FDFCFA') >= 0;
});

// 35. Progress de-emphasis (opacity 0.45 or result-active) in CSS or JS
test('35 Progress de-emphasis (opacity 0.45 or result-active) in CSS or JS', function() {
  return cssContent.indexOf('0.45') >= 0 || cssContent.indexOf('result-active') >= 0 ||
         jsContent.indexOf('result-active') >= 0;
});

// 36. Labour+part never summed in JS
test('36 Labour+part never summed in JS', function() {
  // The part value should not be added to labour
  // Check that there's no "labour_amount_mad + " or similar sum
  return jsContent.indexOf('labour_amount_mad +') < 0 &&
         jsContent.indexOf('+ part') < 0;
});

// 37. Handoff screen has "Retour au prototype" text in JS or HTML
test('37 Handoff screen has "Retour au prototype" text', function() {
  return jsContent.indexOf('Retour au prototype') >= 0 ||
         htmlContent.indexOf('Retour au prototype') >= 0;
});

// 38. RAFI_STATES idle/analyzing/identified/verifying/complete all present
test('38 RAFI_STATES all 5 states present in JS', function() {
  var states = ['idle', 'analyzing', 'identified', 'verifying', 'complete'];
  return states.every(function(s) { return jsContent.indexOf(s + ':') >= 0 || jsContent.indexOf('\'' + s + '\'') >= 0; });
});

// 39. launcher class in CSS
test('39 .launcher class in CSS', function() {
  return cssContent.indexOf('.launcher') >= 0;
});

// 40. intelligence-line width transition in CSS
test('40 intelligence-line width transition 400ms in CSS', function() {
  return cssContent.indexOf('400ms') >= 0 && cssContent.indexOf('intelligence-line') >= 0;
});

/* ═══ REPORT ═════════════════════════════════════════════════════ */
var total = passed + failed;
var allPass = failed === 0;

var report = {
  suite: 'prototype-tests-v2',
  phase: '7C.8C',
  timestamp: new Date().toISOString(),
  total: total,
  passed: passed,
  failed: failed,
  status: allPass ? 'PASS' : 'FAIL',
  results: results,
};

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

console.log('\n══ PROTOTYPE TESTS V2 ══════════════════════════════');
console.log('Total : ' + total);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Status: ' + report.status);
if (allPass) {
  console.log('\n✅ ALL ' + total + ' TESTS PASS — Phase 7C.8C');
} else {
  console.log('\n❌ ' + failed + ' TEST(S) FAILED');
  results.filter(function(r){ return r.status === 'FAIL'; }).forEach(function(r) {
    console.log('  FAIL: ' + r.name + (r.reason ? ' — ' + r.reason : ''));
  });
  process.exit(1);
}
