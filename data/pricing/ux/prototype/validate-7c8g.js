/* ═══════════════════════════════════════════════════════════════════
   FIXEO Prototype — Phase 7C.8G Validator
   RAFI Intelligence Core Flagship Polish
   Status: PROTOTYPE INTERNE — NON PRODUCTION
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const protoDir = __dirname;
const repoRoot = path.join(__dirname, '../../../..');

const cssSrc  = fs.readFileSync(path.join(protoDir, 'estimator-prototype.css'), 'utf8');
const jsSrc   = fs.readFileSync(path.join(protoDir, 'estimator-prototype.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(protoDir, 'estimator-prototype.html'), 'utf8');
const pageSrc = fs.readFileSync(path.join(protoDir, 'estimation-page-prototype.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(name, result) {
  if (result) { pass++; }
  else { fail++; failures.push('  • ' + name); }
}

/* ── File existence ─────────────────────────────────────────────── */
check('File: estimator-prototype.css exists',
  fs.existsSync(path.join(protoDir, 'estimator-prototype.css')));
check('File: estimator-prototype.js exists',
  fs.existsSync(path.join(protoDir, 'estimator-prototype.js')));
check('File: estimator-prototype.html exists',
  fs.existsSync(path.join(protoDir, 'estimator-prototype.html')));
check('File: estimation-page-prototype.html exists',
  fs.existsSync(path.join(protoDir, 'estimation-page-prototype.html')));
check('File: prototype-tests-v4.js exists',
  fs.existsSync(path.join(protoDir, 'tests/prototype-tests-v4.js')));

/* ── CSS — Sphere ───────────────────────────────────────────────── */
check('CSS: .rafi-sphere class', cssSrc.indexOf('.rafi-sphere') >= 0);
check('CSS: .rafi-sphere-wrap class', cssSrc.indexOf('.rafi-sphere-wrap') >= 0);
check('CSS: .rafi-sphere-label class', cssSrc.indexOf('.rafi-sphere-label') >= 0);
check('CSS: sphere data-state=idle', cssSrc.indexOf('[data-state="idle"]') >= 0);
check('CSS: sphere data-state=analyzing', cssSrc.indexOf('[data-state="analyzing"]') >= 0);
check('CSS: sphere data-state=verifying', cssSrc.indexOf('[data-state="verifying"]') >= 0);
check('CSS: sphere data-state=complete', cssSrc.indexOf('[data-state="complete"]') >= 0);
check('CSS: sphere data-state=safety', cssSrc.indexOf('[data-state="safety"]') >= 0);
check('CSS: sphere data-state=routing', cssSrc.indexOf('[data-state="routing"]') >= 0);
check('CSS: sphere data-state=quote', cssSrc.indexOf('[data-state="quote"]') >= 0);
check('CSS: rafi-breathe animation (analyzing)', /rafi-breathe/.test(cssSrc));
check('CSS: rafi-orbit animation (orbit ring)', /rafi-orbit/.test(cssSrc));
check('CSS: rafi-lock animation (identified)', /rafi-lock/.test(cssSrc));
check('CSS: sphere reduced-motion handling', /prefers-reduced-motion[\s\S]{0,300}rafi-sphere/.test(cssSrc));

/* ── CSS — Intelligence language ────────────────────────────────── */
check('CSS: .question-intelligence-copy exists', cssSrc.indexOf('question-intelligence-copy') >= 0);
check('CSS: .page-sphere for /estimation header', cssSrc.indexOf('.page-sphere') >= 0);

/* ── CSS — Brand & Compat ───────────────────────────────────────── */
check('CSS: FIXEO orange #FF7A00', cssSrc.indexOf('#FF7A00') >= 0);
check('CSS: FIXEO magenta #FF2D95', cssSrc.indexOf('#FF2D95') >= 0);
check('CSS: border-radius 20px somewhere', /border-radius.*20px/.test(cssSrc));
check('CSS: --modal-radius 20px (7C.8B compat)', /--modal-radius\s*:\s*20px/.test(cssSrc));
check('CSS: --modal-radius 24px (7C.8C compat)', /--modal-radius\s*:\s*24px/.test(cssSrc));
check('CSS: #FF6B2B V1 compat', cssSrc.indexOf('#FF6B2B') >= 0);
check('CSS: #C8238B V1 compat', cssSrc.indexOf('#C8238B') >= 0);
check('CSS: @keyframes pulse-glow V2 compat', /pulse-glow/.test(cssSrc));
check('CSS: intelligence-line present', cssSrc.indexOf('intelligence-line') >= 0);
check('CSS: estimator-progress display:none compat',
  /estimator-progress[\s\S]{0,100}display:\s*none/.test(cssSrc) ||
  cssSrc.indexOf("estimator-progress { display: none") >= 0
);
check('CSS: prefers-reduced-motion', cssSrc.indexOf('prefers-reduced-motion') >= 0);
check('CSS: safe-area-inset', cssSrc.indexOf('safe-area-inset') >= 0);
check('CSS: 44px touch target', cssSrc.indexOf('44px') >= 0);

/* ── JS — Sphere functions ──────────────────────────────────────── */
check('JS: setSphereState function defined', jsSrc.indexOf('function setSphereState') >= 0);
check('JS: _SPHERE_STATE_MAP defined', jsSrc.indexOf('_SPHERE_STATE_MAP') >= 0);
check('JS: setSphereState called in setRAFIState',
  jsSrc.indexOf('setSphereState') >= 0 &&
  /function setRAFIState[\s\S]{0,900}setSphereState/.test(jsSrc)
);
check('JS: setSphereState called for safety', /setSphereState\(['"]safety['"]\)/.test(jsSrc));
check('JS: setSphereState called for routing', /setSphereState\(['"]routing['"]\)/.test(jsSrc));
check('JS: setSphereState called for quote', /setSphereState\(['"]quote['"]\)/.test(jsSrc));
check('JS: rafi-sphere-wrap in renderHeader', jsSrc.indexOf('rafi-sphere-wrap') >= 0);
check('JS: sphere data-state=idle set on creation',
  jsSrc.indexOf('data-state') >= 0 && jsSrc.indexOf("'idle'") >= 0
);
check('JS: intelligence lock label Métier',
  jsSrc.indexOf("'Métier'") >= 0 || jsSrc.indexOf('"Métier"') >= 0
);
check('JS: intelligence lock label Périmètre',
  jsSrc.indexOf("'Périmètre'") >= 0 || jsSrc.indexOf('"Périmètre"') >= 0
);
check('JS: intelligence lock label Tarification',
  jsSrc.indexOf("'Tarification'") >= 0 || jsSrc.indexOf('"Tarification"') >= 0
);
check('JS: question-intelligence-copy added', jsSrc.indexOf('question-intelligence-copy') >= 0);
check('JS: V2 compat vérifiée sur place',
  jsSrc.indexOf('vérifiée sur place') >= 0 || jsSrc.indexOf('_QUOTE_COPY_V2') >= 0
);
check('JS: no UI price arithmetic (no labour_amount_mad +)', jsSrc.indexOf('labour_amount_mad +') < 0);
check('JS: no hardcoded PRICE_MAP', jsSrc.indexOf('PRICE_MAP') < 0 && jsSrc.indexOf('priceMap') < 0);
check('JS: Engine DORMANT reference', jsSrc.indexOf('DORMANT') >= 0 || htmlSrc.indexOf('DORMANT') >= 0);

/* ── HTML — Sphere ──────────────────────────────────────────────── */
check('HTML: rafi-sphere-wrap in header', htmlSrc.indexOf('rafi-sphere-wrap') >= 0);
check('HTML: rafi-sphere element', htmlSrc.indexOf('rafi-sphere') >= 0);
check('HTML: sphere state driven after modal creation',
  htmlSrc.indexOf('sphereState') >= 0
);
check('HTML: intelligence lock Métier in renderProgress',
  htmlSrc.indexOf("'Métier'") >= 0 || htmlSrc.indexOf('"Métier"') >= 0
);
check('HTML: intelligence lock Périmètre',
  htmlSrc.indexOf("'Périmètre'") >= 0 || htmlSrc.indexOf('"Périmètre"') >= 0
);
check('HTML: intelligence lock Tarification',
  htmlSrc.indexOf("'Tarification'") >= 0 || htmlSrc.indexOf('"Tarification"') >= 0
);
check('HTML: Engine DORMANT', htmlSrc.indexOf('DORMANT') >= 0);
check('HTML: Orchestrator DORMANT', htmlSrc.indexOf('Orchestrat') >= 0);

/* ── Estimation page ────────────────────────────────────────────── */
check('Estimation page: page-sphere present', pageSrc.indexOf('page-sphere') >= 0);

/* ── Test suite results ─────────────────────────────────────────── */
function runSuite(label, scriptPath) {
  try {
    execSync('node ' + scriptPath, { cwd: repoRoot, stdio: 'pipe' });
    check(label + ': all pass', true);
  } catch (e) {
    const out = (e.stdout || '').toString() + (e.stderr || '').toString();
    const failMatch = out.match(/FAIL:\s*(\d+)/);
    const failCount = failMatch ? failMatch[1] : '?';
    check(label + ': all pass ('+failCount+' failed)', false);
  }
}

runSuite('Suite: prototype-tests-v1', path.join(protoDir, 'tests/prototype-tests-v1.js'));
runSuite('Suite: prototype-tests-v2', path.join(protoDir, 'tests/prototype-tests-v2.js'));
runSuite('Suite: prototype-tests-v3', path.join(protoDir, 'tests/prototype-tests-v3.js'));
runSuite('Suite: prototype-tests-v4', path.join(protoDir, 'tests/prototype-tests-v4.js'));
runSuite('Suite: validate-7c8b', path.join(protoDir, 'validate-7c8b.js'));
runSuite('Suite: validate-7c8c', path.join(protoDir, 'validate-7c8c.js'));
runSuite('Suite: validate-7c8d', path.join(protoDir, 'validate-7c8d.js'));
runSuite('Suite: validate-7c8a', path.join(repoRoot, 'data/pricing/ux/validate-7c8a.js'));
runSuite('Suite: validate-orchestrator-v1', path.join(repoRoot, 'data/pricing/orchestrator/validate-orchestrator-v1.js'));

/* ── Production isolation ───────────────────────────────────────── */
try {
  const diffOut = execSync('git diff --name-only', { cwd: repoRoot }).toString().trim();
  const lines = diffOut ? diffOut.split('\n').filter(Boolean) : [];
  const outside = lines.filter(l => !l.startsWith('data/pricing/'));
  check('Production isolation: no files outside data/pricing/ in diff', outside.length === 0);
} catch(e) {
  check('Production isolation: git diff check', false);
}

check('Engine DORMANT: JS contains DORMANT',
  jsSrc.indexOf('DORMANT') >= 0 || htmlSrc.indexOf('DORMANT') >= 0
);
check('Orchestrator DORMANT: HTML contains Orchestrat + DORMANT',
  htmlSrc.indexOf('Orchestrat') >= 0 && htmlSrc.indexOf('DORMANT') >= 0
);

/* ── Report ─────────────────────────────────────────────────────── */
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('FIXEO Prototype — Phase 7C.8G Validator');
console.log('═══════════════════════════════════════════════════════════════\n');

if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log(f));
  console.log('');
}

console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + (pass + fail));
console.log('  Status: ' + (fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES:'));
if (failures.length) failures.forEach(f => console.log('    ' + f));
console.log('═══════════════════════════════════════════════════════════════\n');

if (fail > 0) process.exit(1);
