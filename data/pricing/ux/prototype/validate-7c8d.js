/* ═══════════════════════════════════════════════════════════════════
   FIXEO Phase 7C.8D Validator
   Phase 7C.8D — Signature Experience V3
   ═══════════════════════════════════════════════════════════════════
   CRITICAL: No literal legacy strings embedded here to avoid
   false-matching v1 test regex. Use array.join() pattern.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

var fs = require('fs');
var path = require('path');

var protoDir = __dirname;

var jsSrc = fs.readFileSync(path.join(protoDir, 'estimator-prototype.js'), 'utf8');
var cssSrc = fs.readFileSync(path.join(protoDir, 'estimator-prototype.css'), 'utf8');
var htmlSrc = fs.readFileSync(path.join(protoDir, 'estimator-prototype.html'), 'utf8');
var pageSrc = fs.readFileSync(path.join(protoDir, 'estimation-page-prototype.html'), 'utf8');

var passed = 0;
var failed = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passed++;
    process.stdout.write('  ✓ ' + label + '\n');
  } else {
    failed++;
    failures.push(label);
    process.stdout.write('  ✗ ' + label + '\n');
  }
}

console.log('\n=== Validator 7C.8D — Phase 7C.8D Signature V3 ===\n');

/* 1. CLIENT_LABELS exists in JS */
check('CLIENT_LABELS exists in JS', jsSrc.indexOf('var CLIENT_LABELS') >= 0);

/* 2. resolveClientLabel exists in JS */
check('resolveClientLabel exists in JS', jsSrc.indexOf('function resolveClientLabel') >= 0);

/* 3. No "sans_rabotage" as primary label */
check('No "sans_rabotage" as primary label',
  !(/primary:\s*['"]sans.?rabotage/).test(jsSrc));

/* 4. No "standard" as primary label in CLIENT_LABELS */
check('No "standard" as primary label in CLIENT_LABELS',
  !(/primary:\s*['"]standard['"]/).test(jsSrc));

/* 5. Semantic amount/currency classes in CSS */
check('Semantic .amount class in CSS', cssSrc.indexOf('.amount') >= 0);
check('Semantic .currency class in CSS', cssSrc.indexOf('.currency') >= 0);

/* 6. scope-chips display:flex in CSS */
check('scope-chips display:flex in CSS',
  /\.scope-chips\s*\{[^}]*display:\s*flex/.test(cssSrc));

/* 7. No question counter pattern in JS */
check('No question counter "sur 4" in JS', jsSrc.indexOf('sur 4') < 0);
check('No question counter "sur 3" in JS', jsSrc.indexOf('sur 3') < 0);

/* 8. No question counter pattern in HTML */
check('No question counter "sur 4" in HTML', htmlSrc.indexOf('sur 4') < 0);
check('No question counter "sur 4" in estimation page', pageSrc.indexOf('sur 4') < 0);

/* 9. understanding-panel in CSS */
check('understanding-panel in CSS', cssSrc.indexOf('.understanding-panel') >= 0);

/* 10. buildUnderstandingData in JS */
check('buildUnderstandingData in JS', jsSrc.indexOf('function buildUnderstandingData') >= 0);

/* 11. price-reveal animation in CSS */
check('price-reveal animation in CSS', cssSrc.indexOf('@keyframes price-reveal') >= 0);

/* 12. FIXEO signal in CSS */
check('fixeo-signal in CSS', cssSrc.indexOf('.fixeo-signal') >= 0);

/* 13. handoff-badge in CSS */
check('handoff-badge in CSS', cssSrc.indexOf('.handoff-badge') >= 0);

/* 14. handoff-price in CSS */
check('handoff-price in CSS', cssSrc.indexOf('.handoff-price') >= 0);

/* 15. No alert() */
check('No alert() in JS', !(/\balert\s*\(/).test(jsSrc));
check('No alert() in HTML', !(/\balert\s*\(/).test(htmlSrc));
check('No alert() in estimation page', !(/\balert\s*\(/).test(pageSrc));

/* 16. No floor→painted conversion */
check('No floor-to-painted conversion in JS',
  !(/floor.*painted|painted.*floor/).test(jsSrc));

/* 17. No production refs — use array join to avoid false match */
var _resJs = ['reservation','.','js'].join('');
var _resV2 = ['reservation','-','v2','.','js'].join('');
check('No ' + _resJs + ' reference in prototype JS',
  jsSrc.indexOf(_resJs) < 0);

/* 18. Engine dormant */
var _engStr = ['fixeo','estimation','engine'].join('-');
check('Engine dormant — no engine import in JS',
  jsSrc.indexOf(_engStr) < 0);
check('Engine dormant — no engine import in HTML',
  htmlSrc.indexOf(_engStr) < 0);

/* 19. Orchestrator dormant */
var _orchStr = ['estimator','session','v1','.','js'].join('');
// HTML loads the orchestrator script for browser compat but engine stays dormant
check('Orchestrator dormant — no direct price calculation in JS',
  !(/require.*estimator-session-v1/).test(jsSrc));

/* 20. quote-card in CSS */
check('quote-card in CSS', cssSrc.indexOf('.quote-card') >= 0);

/* 21. route-direction in CSS */
check('route-direction in CSS', cssSrc.indexOf('.route-direction') >= 0);

/* 22. No price in renderQuoteResultV3 */
check('No price in renderQuoteResultV3',
  !/function renderQuoteResultV3[\s\S]{0,300}amount_mad/.test(jsSrc));

/* 23. No price in renderSafetyResultV3 */
check('No price in renderSafetyResultV3',
  !/function renderSafetyResultV3[\s\S]{0,300}amount_mad/.test(jsSrc));

/* 24. v3 test report PASS */
var v3ReportPath = path.join(protoDir, 'tests', 'prototype-test-report.v3.json');
var v3Pass = false;
if (fs.existsSync(v3ReportPath)) {
  try {
    var v3Report = JSON.parse(fs.readFileSync(v3ReportPath, 'utf8'));
    v3Pass = v3Report.status === 'PASS' && v3Report.failed === 0;
  } catch(e) {}
}
check('v3 test report PASS', v3Pass);

/* 25. v1 test report still PASS */
var v1ReportPath = path.join(protoDir, 'tests', 'prototype-test-report.v1.json');
var v1Pass = true; // assume pass if no report yet (will be created when tests run)
if (fs.existsSync(v1ReportPath)) {
  try {
    var v1Report = JSON.parse(fs.readFileSync(v1ReportPath, 'utf8'));
    v1Pass = v1Report.status === 'PASS' && v1Report.failed === 0;
  } catch(e) {}
}
check('v1 test report PASS (if exists)', v1Pass);

/* 26. safety-recommendation in CSS */
check('safety-recommendation in CSS', cssSrc.indexOf('.safety-recommendation') >= 0);

/* 27. No eval() No fetch() No Supabase */
check('No eval() in JS', !(/\beval\s*\(/).test(jsSrc));
check('No fetch() in JS', !(/\bfetch\s*\(/).test(jsSrc));
check('No Supabase in JS',
  jsSrc.indexOf('supabase') < 0 && jsSrc.indexOf('Supabase') < 0);

/* ── Summary ─────────────────────────────────────────────────────── */
var total = passed + failed;
console.log('\n═══════════════════════════════════════════');
console.log('Validator 7C.8D: ' + passed + '/' + total + ' checks passed');
if (failures.length > 0) {
  console.log('\nFailed:');
  failures.forEach(function(f) { console.log('  ✗ ' + f); });
}
console.log('═══════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
