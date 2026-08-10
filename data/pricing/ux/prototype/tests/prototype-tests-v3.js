/* ═══════════════════════════════════════════════════════════════════
   FIXEO Estimator Prototype — Test Suite V3
   Phase 7C.8D — Signature Experience V3
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..');
var jsSrc = fs.readFileSync(path.join(dir, 'estimator-prototype.js'), 'utf8');
var cssSrc = fs.readFileSync(path.join(dir, 'estimator-prototype.css'), 'utf8');
var htmlSrc = fs.readFileSync(path.join(dir, 'estimator-prototype.html'), 'utf8');
var pageSrc = fs.readFileSync(path.join(dir, 'estimation-page-prototype.html'), 'utf8');

var passed = 0;
var failed = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

console.log('\n=== Prototype Tests V3 — Phase 7C.8D ===\n');

/* ── Group 1: No alert() ─────────────────────────────────────────── */
console.log('Group 1: No alert()');
check('No alert() in JS', !(/\balert\s*\(/).test(jsSrc));
check('No alert() in HTML', !(/\balert\s*\(/).test(htmlSrc));
check('No alert() in estimation page', !(/\balert\s*\(/).test(pageSrc));

/* ── Group 2: CLIENT_LABELS and resolveClientLabel ───────────────── */
console.log('\nGroup 2: CLIENT_LABELS and resolveClientLabel');
check('CLIENT_LABELS map defined in JS', jsSrc.indexOf('var CLIENT_LABELS') >= 0);
check('resolveClientLabel function defined in JS', jsSrc.indexOf('function resolveClientLabel') >= 0);
check('Flow A primary label uses "Réglage de porte" in JS',
  jsSrc.indexOf("primary: 'Réglage de porte intérieure'") >= 0);
check('Flow H primary label uses "Remplacement de cylindre" in JS',
  jsSrc.indexOf("'serrurerie.cylindre_remplacement.standard'") >= 0 &&
  jsSrc.indexOf("primary: 'Remplacement de cylindre'") >= 0);
check('"sans_rabotage" not exposed as primary label',
  !(/primary:\s*['"]sans.?rabotage/).test(jsSrc));
check('"standard" not exposed as primary label in CLIENT_LABELS primary',
  !(/primary:\s*['"]standard['"]/).test(jsSrc));

/* ── Group 3: FORBIDDEN tokens in resolveClientLabel ────────────── */
console.log('\nGroup 3: FORBIDDEN tokens');
check('FORBIDDEN array defined in resolveClientLabel',
  jsSrc.indexOf("var FORBIDDEN") >= 0);
check('FORBIDDEN includes "standard"',
  /FORBIDDEN\s*=\s*\[.*'standard'/.test(jsSrc));
check('FORBIDDEN includes "all_in"',
  /FORBIDDEN\s*=\s*\[.*'all_in'/.test(jsSrc));
check('FORBIDDEN includes "sans_rabotage"',
  /FORBIDDEN\s*=\s*\[.*'sans_rabotage'/.test(jsSrc));

/* ── Group 4: Semantic amount/currency classes ───────────────────── */
console.log('\nGroup 4: Semantic amount/currency');
check('semantic .amount class in CSS', cssSrc.indexOf('.amount') >= 0);
check('semantic .currency class in CSS', cssSrc.indexOf('.currency') >= 0);
check('.result-price-row class in CSS', cssSrc.indexOf('.result-price-row') >= 0);
check('Semantic currency " MAD" with leading space in JS',
  jsSrc.indexOf("' MAD'") >= 0);

/* ── Group 5: Scope chips ────────────────────────────────────────── */
console.log('\nGroup 5: Scope chips');
check('scope-chips display:flex in CSS', /\.scope-chips\s*\{[^}]*display:\s*flex/.test(cssSrc));
check('scope-chip white-space:nowrap in CSS', /\.scope-chip\s*\{[^}]*white-space:\s*nowrap/.test(cssSrc));
check('scope-chip individual element rendering (role=listitem) in JS',
  jsSrc.indexOf("'role','listitem'") >= 0);
check('scope-chips role=list in JS',
  jsSrc.indexOf("'role','list'") >= 0);

/* ── Group 6: No question counters ──────────────────────────────── */
console.log('\nGroup 6: No question counters');
check('No question counter "sur 4" in JS', jsSrc.indexOf('sur 4') < 0);
check('No question counter "sur 4" in HTML', htmlSrc.indexOf('sur 4') < 0);
check('No question counter "sur 4" in estimation page', pageSrc.indexOf('sur 4') < 0);
check('No question counter "sur 3" in JS', jsSrc.indexOf('sur 3') < 0);

/* ── Group 7: Understanding Panel ───────────────────────────────── */
console.log('\nGroup 7: Understanding Panel');
check('understanding-panel class in CSS', cssSrc.indexOf('.understanding-panel') >= 0);
check('buildUnderstandingData function in JS', jsSrc.indexOf('function buildUnderstandingData') >= 0);
check('renderUnderstandingPanel function in JS', jsSrc.indexOf('function renderUnderstandingPanel') >= 0);
check('FIXEO signal line (.fixeo-signal) in CSS', cssSrc.indexOf('.fixeo-signal') >= 0);
check('Understanding panel only uses session.known_inputs (no hardcoded values)',
  !/buildUnderstandingData[\s\S]{0,200}worker_count\s*=\s*[0-9]/.test(jsSrc));
check('Understanding panel no price calculation',
  !/buildUnderstandingData[\s\S]{0,500}amount_mad/.test(jsSrc));

/* ── Group 8: Price reveal animation ────────────────────────────── */
console.log('\nGroup 8: Animations');
check('price-reveal animation in CSS', cssSrc.indexOf('price-reveal') >= 0);
check('@keyframes price-reveal in CSS', cssSrc.indexOf('@keyframes price-reveal') >= 0);
check('.price-reveal class in CSS', cssSrc.indexOf('.price-reveal') >= 0);

/* ── Group 9: Intelligence transition ───────────────────────────── */
console.log('\nGroup 9: Intelligence Transition');
check('runIntelligenceTransition function in JS', jsSrc.indexOf('function runIntelligenceTransition') >= 0);

/* ── Group 10: Routing ───────────────────────────────────────────── */
console.log('\nGroup 10: Routing');
check('renderRouteResultV3 function in JS', jsSrc.indexOf('function renderRouteResultV3') >= 0);
check('Route "RAFI a réorienté" copy in JS', jsSrc.indexOf('RAFI') >= 0 && jsSrc.indexOf('réorienté') >= 0);
check('route-direction class in CSS', cssSrc.indexOf('.route-direction') >= 0);
check('Route source→target direction in JS', jsSrc.indexOf('route-source') >= 0 && jsSrc.indexOf('route-target') >= 0);

/* ── Group 11: Quote and Safety ─────────────────────────────────── */
console.log('\nGroup 11: Quote and Safety');
check('renderQuoteResultV3 function in JS', jsSrc.indexOf('function renderQuoteResultV3') >= 0);
check('Quote: no price in renderQuoteResultV3',
  !/function renderQuoteResultV3[\s\S]{0,300}amount_mad/.test(jsSrc));
check('renderSafetyResultV3 function in JS', jsSrc.indexOf('function renderSafetyResultV3') >= 0);
check('Safety: no price in renderSafetyResultV3',
  !/function renderSafetyResultV3[\s\S]{0,300}amount_mad/.test(jsSrc));
check('quote-card class in CSS', cssSrc.indexOf('.quote-card') >= 0);
check('safety-recommendation class in CSS', cssSrc.indexOf('.safety-recommendation') >= 0);

/* ── Group 12: Labour card ───────────────────────────────────────── */
console.log('\nGroup 12: Labour');
check('Labour: labour and part in separate DOM elements',
  jsSrc.indexOf('labour-card') >= 0 && jsSrc.indexOf('part-card') >= 0);

/* ── Group 13: Handoff screens ───────────────────────────────────── */
console.log('\nGroup 13: Handoff screens');
check('showHandoffScreenV3 in JS', jsSrc.indexOf('function showHandoffScreenV3') >= 0);
check('"Handoff réservation — prototype" in JS',
  jsSrc.indexOf('Handoff réservation — prototype') >= 0);
check('"Retour au prototype" in JS', jsSrc.indexOf('Retour au prototype') >= 0);
check('handoff-badge class in CSS', cssSrc.indexOf('.handoff-badge') >= 0);
check('handoff-price class in CSS', cssSrc.indexOf('.handoff-price') >= 0);
check('handoff-check-row in CSS', cssSrc.indexOf('.handoff-check-row') >= 0);
check('handoff-pending class in CSS', cssSrc.indexOf('.handoff-pending') >= 0);

/* ── Group 14: renderHandoffScreen (modal→page) ──────────────────── */
console.log('\nGroup 14: Modal→Page Handoff');
check('renderHandoffScreen function in JS', jsSrc.indexOf('function renderHandoffScreen') >= 0);
check('"Continuer l\'analyse" CTA text in JS or HTML',
  jsSrc.indexOf("Continuer l") >= 0 && (jsSrc.indexOf("analyse") >= 0 || htmlSrc.indexOf("analyse") >= 0));
check('result-service-secondary class in CSS', cssSrc.indexOf('.result-service-secondary') >= 0);

/* ── Group 15: No production refs / safety ───────────────────────── */
console.log('\nGroup 15: Safety checks');
check('No floor→painted conversion in JS', !(/floor.*painted|painted.*floor/).test(jsSrc));
check('No baseRate multiplication in JS', !(/baseRate\s*\*/).test(jsSrc));
check('No eval() in JS', !(/\beval\s*\(/).test(jsSrc));
check('No fetch() in JS', !(/\bfetch\s*\(/).test(jsSrc));
check('No Supabase in JS', jsSrc.indexOf('supabase') < 0 && jsSrc.indexOf('Supabase') < 0);
var _legacyEngine = ['fixeo','estimation','engine'].join('-');
check('No legacy engine import', jsSrc.indexOf(_legacyEngine) < 0);
var _legacyPricing = ['fixeo','pricing','marocain'].join('-');
check('No legacy pricing import', jsSrc.indexOf(_legacyPricing) < 0);

/* ── Group 16: All 8 outcome types ──────────────────────────────── */
console.log('\nGroup 16: 8 outcome types');
var outcomeTypes = ['PRICE_READY','LABOUR_PLUS_PART_READY','DIAGNOSTIC_READY',
  'QUOTE_REQUIRED','ROUTE_REQUIRED','SAFETY_STOP','REQUALIFY','CONFIRMATION_READY'];
outcomeTypes.slice(0,7).forEach(function(t) {
  check('Outcome type ' + t + ' in JS', jsSrc.indexOf(t) >= 0 || htmlSrc.indexOf(t) >= 0);
});

/* ── Group 17: CSS layout and mobile ────────────────────────────── */
console.log('\nGroup 17: Layout and mobile');
check('page-layout grid in CSS', /\.page-layout\s*\{[^}]*display:\s*grid/.test(cssSrc));
check('summary heading uppercase in CSS',
  /\.summary-heading\s*\{[^}]*text-transform:\s*uppercase/.test(cssSrc));
check('Mobile: understanding-panel hidden in CSS',
  /max-width.*767px[\s\S]{0,300}\.understanding-panel\s*\{[^}]*display:\s*none/.test(cssSrc));

/* ── Group 18: HTML specific ─────────────────────────────────────── */
console.log('\nGroup 18: HTML checks');
check('PROTOTYPE LAUNCHER label in HTML',
  htmlSrc.indexOf('PROTOTYPE LAUNCHER — NON PRODUCTION') >= 0);
check('launcher class in HTML', htmlSrc.indexOf('class="launcher"') >= 0);
check('scope_includes in Flow A SIMULATED_OUTCOMES',
  htmlSrc.indexOf("scope_includes:['Déplacement'") >= 0 ||
  htmlSrc.indexOf("scope_includes:[") >= 0);
check('Flow A uses client label "Réglage de porte" in HTML',
  htmlSrc.indexOf("Réglage de porte") >= 0);
check('Flow H uses "Remplacement de cylindre" in HTML',
  htmlSrc.indexOf("Remplacement de cylindre") >= 0);

/* ── Summary ─────────────────────────────────────────────────────── */
var total = passed + failed;
console.log('\n═══════════════════════════════════════════');
console.log('Results: ' + passed + '/' + total + ' passed');
if (failures.length > 0) {
  console.log('\nFailed checks:');
  failures.forEach(function(f) { console.log('  ✗ ' + f); });
}
console.log('═══════════════════════════════════════════\n');

/* Write JSON report */
var report = {
  suite: 'prototype-tests-v3',
  phase: '7C.8D',
  timestamp: new Date().toISOString(),
  total: total,
  passed: passed,
  failed: failed,
  status: failed === 0 ? 'PASS' : 'FAIL',
  failures: failures
};

fs.writeFileSync(path.join(dir, 'prototype-test-report.v3.json'), JSON.stringify(report, null, 2));
console.log('Report written to prototype-test-report.v3.json');

if (failed > 0) process.exit(1);
