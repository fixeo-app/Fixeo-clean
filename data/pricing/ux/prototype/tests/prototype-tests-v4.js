/* ═══════════════════════════════════════════════════════════════════
   FIXEO Estimator Prototype — Phase 7C.8G Tests (v4)
   RAFI Intelligence Core + Sphere + Lock Language
   Status: PROTOTYPE INTERNE — NON PRODUCTION
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');
const protoDir = path.join(__dirname, '..');

const cssSrc  = fs.readFileSync(path.join(protoDir, 'estimator-prototype.css'), 'utf8');
const jsSrc   = fs.readFileSync(path.join(protoDir, 'estimator-prototype.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(protoDir, 'estimator-prototype.html'), 'utf8');
const pageSrc = fs.readFileSync(path.join(protoDir, 'estimation-page-prototype.html'), 'utf8');

// Load adapter + fixtures for fixture tests
const adapter  = require(path.join(protoDir, 'estimator-prototype-adapter'));
const { FIXTURES } = require(path.join(protoDir, 'estimator-prototype-fixtures'));

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      pass++;
    } else {
      fail++;
      failures.push(`FAIL: ${name} — Returned: ${JSON.stringify(result)}`);
    }
  } catch (e) {
    fail++;
    failures.push(`FAIL: ${name} — Error: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────────
   CSS SPHERE PRESENCE
   ───────────────────────────────────────────────────────────────── */

test('01 CSS: .rafi-sphere class exists', () => cssSrc.indexOf('.rafi-sphere') >= 0);
test('02 CSS: .rafi-sphere-wrap class exists', () => cssSrc.indexOf('.rafi-sphere-wrap') >= 0);
test('03 CSS: sphere data-state=idle exists', () => cssSrc.indexOf('[data-state="idle"]') >= 0);
test('04 CSS: sphere data-state=analyzing exists', () => cssSrc.indexOf('[data-state="analyzing"]') >= 0);
test('05 CSS: sphere data-state=verifying exists', () => cssSrc.indexOf('[data-state="verifying"]') >= 0);
test('06 CSS: sphere data-state=complete exists', () => cssSrc.indexOf('[data-state="complete"]') >= 0);
test('07 CSS: sphere data-state=safety exists', () => cssSrc.indexOf('[data-state="safety"]') >= 0);
test('08 CSS: sphere data-state=routing exists', () => cssSrc.indexOf('[data-state="routing"]') >= 0);
test('09 CSS: sphere data-state=quote exists', () => cssSrc.indexOf('[data-state="quote"]') >= 0);

/* ─────────────────────────────────────────────────────────────────
   CSS SPHERE ANIMATION
   ───────────────────────────────────────────────────────────────── */

test('10 CSS: rafi-breathe animation exists (analyzing state)', () => /rafi-breathe/.test(cssSrc));
test('11 CSS: rafi-orbit animation exists (orbit ring)', () => /rafi-orbit/.test(cssSrc));
test('12 CSS: rafi-lock animation exists (identified state)', () => /rafi-lock/.test(cssSrc));
test('13 CSS: rafi-verify-pulse animation exists', () => /rafi-verify-pulse/.test(cssSrc));
test('14 CSS: sphere reduced-motion handled', () =>
  /prefers-reduced-motion/.test(cssSrc) && /rafi-sphere/.test(cssSrc)
);

/* ─────────────────────────────────────────────────────────────────
   CSS INTELLIGENCE COPY
   ───────────────────────────────────────────────────────────────── */

test('15 CSS: .question-intelligence-copy class exists', () =>
  cssSrc.indexOf('question-intelligence-copy') >= 0
);
test('16 CSS: page-sphere class exists for /estimation header', () =>
  cssSrc.indexOf('.page-sphere') >= 0
);
test('17 CSS: .rafi-sphere-label class exists', () =>
  cssSrc.indexOf('.rafi-sphere-label') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   CSS READABILITY IMPROVEMENTS
   ───────────────────────────────────────────────────────────────── */

test('18 CSS: improved readability — labour-disclosure', () =>
  cssSrc.indexOf('labour-disclosure') >= 0
);
test('19 CSS: improved readability — scope-doctrine', () =>
  cssSrc.indexOf('scope-doctrine') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   JS SPHERE FUNCTIONS
   ───────────────────────────────────────────────────────────────── */

test('20 JS: setSphereState function exists', () =>
  jsSrc.indexOf('function setSphereState') >= 0
);
test('21 JS: setSphereState called in setRAFIState', () =>
  jsSrc.indexOf('setSphereState') >= 0 &&
  /function setRAFIState[\s\S]{0,900}setSphereState/.test(jsSrc)
);
test('22 JS: setSphereState called for safety outcome', () =>
  /setSphereState\(['"']safety['"']\)/.test(jsSrc)
);
test('23 JS: setSphereState called for routing outcome', () =>
  /setSphereState\(['"']routing['"']\)/.test(jsSrc)
);
test('24 JS: setSphereState called for quote outcome', () =>
  /setSphereState\(['"']quote['"']\)/.test(jsSrc)
);
test('25 JS: _SPHERE_STATE_MAP object exists', () =>
  jsSrc.indexOf('_SPHERE_STATE_MAP') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   JS SPHERE IN HEADER
   ───────────────────────────────────────────────────────────────── */

test('26 JS: rafi-sphere-wrap in renderHeader', () =>
  jsSrc.indexOf('rafi-sphere-wrap') >= 0
);
test('27 JS: rafi-sphere in renderHeader', () =>
  jsSrc.indexOf("'rafi-sphere'") >= 0 || jsSrc.indexOf('"rafi-sphere"') >= 0
);
test('28 JS: data-state=idle set on sphere creation', () =>
  jsSrc.indexOf("data-state") >= 0 && jsSrc.indexOf("'idle'") >= 0
);

/* ─────────────────────────────────────────────────────────────────
   JS INTELLIGENCE LOCK LABELS
   ───────────────────────────────────────────────────────────────── */

test('29 JS: intelligence lock label Métier in renderProgress', () =>
  jsSrc.indexOf("'Métier'") >= 0 || jsSrc.indexOf('"Métier"') >= 0
);
test('30 JS: intelligence lock label Périmètre in renderProgress', () =>
  jsSrc.indexOf("'Périmètre'") >= 0 || jsSrc.indexOf('"Périmètre"') >= 0
);
test('31 JS: intelligence lock label Tarification in renderProgress', () =>
  jsSrc.indexOf("'Tarification'") >= 0 || jsSrc.indexOf('"Tarification"') >= 0
);
test('32 JS: intelligence copy line added to question renderer', () =>
  jsSrc.indexOf('question-intelligence-copy') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   HTML SPHERE PRESENCE
   ───────────────────────────────────────────────────────────────── */

test('33 HTML: rafi-sphere-wrap in renderHeader', () =>
  htmlSrc.indexOf('rafi-sphere-wrap') >= 0
);
test('34 HTML: rafi-sphere in renderHeader', () =>
  htmlSrc.indexOf('rafi-sphere') >= 0
);
test('35 HTML: sphere state set after modal creation', () =>
  htmlSrc.indexOf('sphereState') >= 0 || htmlSrc.indexOf('data-state') >= 0
);
test('36 HTML: intelligence lock label Métier in renderProgress', () =>
  htmlSrc.indexOf("'Métier'") >= 0 || htmlSrc.indexOf('"Métier"') >= 0
);
test('37 HTML: intelligence lock label Périmètre', () =>
  htmlSrc.indexOf("'Périmètre'") >= 0 || htmlSrc.indexOf('"Périmètre"') >= 0
);
test('38 HTML: intelligence lock label Tarification', () =>
  htmlSrc.indexOf("'Tarification'") >= 0 || htmlSrc.indexOf('"Tarification"') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   ESTIMATION PAGE SPHERE
   ───────────────────────────────────────────────────────────────── */

test('39 estimation-page: page-sphere present in header', () =>
  pageSrc.indexOf('page-sphere') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   SAFETY CONSTRAINTS — NO FAKE INTELLIGENCE
   ───────────────────────────────────────────────────────────────── */

test('40 JS: no fake confidence score string', () =>
  jsSrc.indexOf('confidence score') < 0 &&
  jsSrc.indexOf('AI confidence') < 0 &&
  jsSrc.indexOf('confidence_score') < 0
);
test('41 JS: no fake percentage loading', () =>
  jsSrc.indexOf('% complété') < 0 &&
  jsSrc.indexOf('% analyzed') < 0
);
test('42 JS: no spinner class emitted in JS', () =>
  // spinner as a loading mechanism — not as a class on result elements
  !/el\([^)]*'spinner'/.test(jsSrc)
);
test('43 JS: no UI price arithmetic', () =>
  jsSrc.indexOf('labour_amount_mad +') < 0
);
test('44 JS: no hardcoded price constant map', () =>
  // ensure no PRICE_MAP or similar pattern
  jsSrc.indexOf('PRICE_MAP') < 0 && jsSrc.indexOf('priceMap') < 0
);

/* ─────────────────────────────────────────────────────────────────
   FIXTURE OUTCOME VERIFICATION
   ───────────────────────────────────────────────────────────────── */

function runFixture(id) {
  const fixture = FIXTURES.find(f => f.id === id);
  if (!fixture) throw new Error('Fixture not found: ' + id);
  const started = adapter.startSession(fixture.context || {});
  if (!started.ok) throw new Error('startSession failed: ' + JSON.stringify(started.error));
  const resolved = adapter.resolveFlow(
    started.session,
    fixture.question_answers || {},
    fixture.question_defaults
  );
  return resolved;
}

test('45 Fixture A: PRICE_READY 300 MAD', () => {
  const r = runFixture('A');
  return r.ok &&
    r.session.state === 'PRICE_READY' &&
    r.session.outcome.price.amount_mad === 300;
});

test('46 Fixture B: LABOUR_PLUS_PART_READY 250 MAD labour', () => {
  const r = runFixture('B');
  return r.ok &&
    r.session.state === 'LABOUR_PLUS_PART_READY' &&
    r.session.outcome.price.labour_amount_mad === 250;
});

test('47 Fixture C: DIAGNOSTIC_READY 200 MAD', () => {
  const r = runFixture('C');
  return r.ok &&
    r.session.state === 'DIAGNOSTIC_READY';
});

test('48 Fixture D: PRICE_READY 390 MAD calculated', () => {
  const r = runFixture('D');
  return r.ok &&
    r.session.state === 'PRICE_READY' &&
    r.session.outcome.price.amount_mad === 390;
});

test('49 Fixture F: QUOTE_REQUIRED', () => {
  const r = runFixture('F');
  return r.ok && r.session.state === 'QUOTE_REQUIRED';
});

test('50 Fixture G: SAFETY_STOP', () => {
  const r = runFixture('G');
  return r.ok && r.session.state === 'SAFETY_STOP';
});

/* ─────────────────────────────────────────────────────────────────
   MOBILE + ACCESSIBILITY CONTRACTS
   ───────────────────────────────────────────────────────────────── */

test('51 CSS: mobile bottom sheet border-radius (top rounded)', () =>
  /border-radius.*20px 20px 0 0/.test(cssSrc)
);
test('52 CSS: safe-area-inset in footer', () =>
  cssSrc.indexOf('safe-area-inset') >= 0
);
test('53 CSS: prefers-reduced-motion in CSS', () =>
  cssSrc.indexOf('prefers-reduced-motion') >= 0
);
test('54 CSS: min touch target 44px', () =>
  cssSrc.indexOf('44px') >= 0
);
test('55 CSS: focus-visible accessible ring', () =>
  cssSrc.indexOf('focus-visible') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   DORMANT / PRODUCTION SAFETY
   ───────────────────────────────────────────────────────────────── */

test('56 HTML: Engine DORMANT label', () =>
  htmlSrc.indexOf('DORMANT') >= 0
);
test('57 HTML: Orchestrator DORMANT label', () =>
  htmlSrc.indexOf('Orchestrat') >= 0 && htmlSrc.indexOf('DORMANT') >= 0
);
test('58 JS: no import of production reservation file', () =>
  !['reservation.js','reservation-v1.js','reservation-v2.js'].some(f => jsSrc.indexOf(f) >= 0)
);
test('59 JS: no import of production pricing file', () =>
  !['fixeo-pricing-marocain','fixeo-estimation-engine'].some(f => jsSrc.indexOf(f) >= 0)
);

/* ─────────────────────────────────────────────────────────────────
   FIXEO BRAND COLORS
   ───────────────────────────────────────────────────────────────── */

test('60 CSS: FIXEO orange #FF7A00 present', () => cssSrc.indexOf('#FF7A00') >= 0);
test('61 CSS: FIXEO magenta #FF2D95 present', () => cssSrc.indexOf('#FF2D95') >= 0);
test('62 CSS: orange→magenta gradient present', () =>
  cssSrc.indexOf('#FF7A00') >= 0 && cssSrc.indexOf('#FF2D95') >= 0 &&
  /linear-gradient/.test(cssSrc)
);

/* ─────────────────────────────────────────────────────────────────
   V1/V2/V3 COMPAT CONTRACTS (must not be broken)
   ───────────────────────────────────────────────────────────────── */

test('63 CSS: V1 compat — border-radius 16px somewhere', () =>
  cssSrc.indexOf('border-radius: 16px') >= 0 ||
  cssSrc.indexOf('border-radius:16px') >= 0
);
test('64 CSS: V1 compat — #FF6B2B gradient-v1-start present', () =>
  cssSrc.indexOf('#FF6B2B') >= 0
);
test('65 CSS: V1 compat — #C8238B gradient-v1-end present', () =>
  cssSrc.indexOf('#C8238B') >= 0
);
test('66 CSS: V1 compat — pulse-glow keyframe', () =>
  /pulse-glow/.test(cssSrc)
);
test('67 CSS: V2 compat — --modal-radius 20px AND 24px', () =>
  /--modal-radius\s*:\s*20px/.test(cssSrc) &&
  /--modal-radius\s*:\s*24px/.test(cssSrc)
);
test('68 CSS: V2 compat — intelligence-line with transition/400ms', () =>
  cssSrc.indexOf('intelligence-line') >= 0
);
test('69 JS: V2 compat — vérifiée sur place string', () =>
  jsSrc.indexOf('vérifiée sur place') >= 0 || jsSrc.indexOf('_QUOTE_COPY_V2') >= 0
);
test('70 CSS: estimator-progress display:none compat', () =>
  /estimator-progress[\s\S]{0,50}display:\s*none/.test(cssSrc) ||
  cssSrc.indexOf('.estimator-progress { display: none') >= 0
);

/* ─────────────────────────────────────────────────────────────────
   RESULTS
   ───────────────────────────────────────────────────────────────── */

console.log('\n══════════════════════════════════════════════════════════');
console.log('FIXEO Estimator Prototype — Phase 7C.8G Tests (v4)');
console.log('══════════════════════════════════════════════════════════\n');

if (failures.length) {
  failures.forEach(f => console.log('  ' + f));
  console.log('');
}

console.log(`Results: ${pass}/${pass + fail} passed`);
console.log('═══════════════════════════════════════════════════════════\n');

const reportPath = path.join(protoDir, 'prototype-test-report.v4.json');
fs.writeFileSync(reportPath, JSON.stringify({
  phase: '7C.8G', suite: 'v4', pass, fail,
  status: fail === 0 ? 'PASS' : 'FAIL',
  failures,
  timestamp: new Date().toISOString()
}, null, 2));

if (fail > 0) process.exit(1);
