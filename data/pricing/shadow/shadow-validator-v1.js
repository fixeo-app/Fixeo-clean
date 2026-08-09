'use strict';
/**
 * FIXEO Pricing Engine — Shadow Validator V1
 * Phase 7C.5 — Shadow Validation
 *
 * Validates the shadow results report integrity and runs the shadow gate.
 * Calls all prior validators and shadow runner to produce a consolidated status.
 *
 * No eval, no Function, no network, no Supabase, no DOM.
 * DORMANT — not imported by any production runtime.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../../../');
let pass = 0, fail = 0;
const errors = [];

function check(condition, label, errorMsg) {
  if (condition) {
    pass++;
    process.stdout.write('  ✅ ' + label + '\n');
  } else {
    fail++;
    errors.push(errorMsg || label);
    process.stdout.write('  ❌ FAIL: ' + label + (errorMsg ? ' — ' + errorMsg : '') + '\n');
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('FIXEO PRICING ENGINE — SHADOW VALIDATOR V1');
console.log('Phase 7C.5 — Shadow Validation');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── 1. PRIOR VALIDATORS ──────────────────────────────────────────────────────
console.log('[1] Prior Validators');

function runValidator(file, expectedPass) {
  try {
    const out = execSync('node ' + file, { cwd: REPO_ROOT, encoding: 'utf8' });
    // Match final summary line like "PASS: 91" or "PASS: 91 / FAIL: 0"
    const summaryMatch = out.match(/^\s*PASS:\s*(\d+)/m);
    const passCount = summaryMatch ? parseInt(summaryMatch[1]) : 0;
    // Check Status line
    const allPassed = out.includes('ALL CHECKS PASSED') || out.includes('ALL 53') || out.includes('ALL PASS');
    const anyFailed = out.match(/FAIL:\s*[1-9]/);
    check(!anyFailed && passCount >= expectedPass, file + ' >= ' + expectedPass + ' PASS (got ' + passCount + ')',
      anyFailed ? 'Validator reported failures' : (passCount < expectedPass ? 'Pass count too low' : null));
  } catch(e) {
    check(false, file, 'Error: ' + e.message.slice(0, 100));
  }
}

runValidator('data/pricing/consolidation/validate-7c1-1.js', 91);
runValidator('data/pricing/canonical/validate-canonical-v1.js', 130);
runValidator('data/pricing/consolidation/validate-7c3.js', 92);
runValidator('data/pricing/consolidation/validate-7c3-1.js', 77);

// ─── 2. ENGINE VALIDATORS ─────────────────────────────────────────────────────
console.log('\n[2] Engine Validators');
runValidator('data/pricing/engine/pricing-engine-validator-v1.js', 664);
runValidator('data/pricing/engine/tests/engine-tests-v1.js', 209);

// ─── 3. GOLDEN FIXTURES ───────────────────────────────────────────────────────
console.log('\n[3] Golden Fixtures');
try {
  const { evaluateFixeoPrice } = require('../engine/pricing-engine-core-v1');
  const gold = JSON.parse(fs.readFileSync(path.join(__dirname, '../engine/fixtures/golden-fixtures.v1.json')));
  let gp = 0, gf = 0;
  gold.fixtures.forEach(x => {
    const r = evaluateFixeoPrice({ service_code: x.service_code, inputs: x.inputs });
    (r.ok === x.expected.ok && (!x.expected.ok || r.pricing.final_amount_mad === x.expected.final_amount_mad)) ? gp++ : gf++;
  });
  check(gf === 0, 'Golden fixtures ' + gp + '/' + gold.fixtures.length + ' PASS', gf > 0 ? gf + ' golden fixtures failed' : null);
} catch(e) {
  check(false, 'Golden fixtures', e.message);
}

// ─── 4. SHADOW RUNNER ────────────────────────────────────────────────────────
console.log('\n[4] Shadow Runner');
try {
  const { report } = require('./shadow-runner-v1');
  const s = report.summary;
  check(s.failed === 0, 'Shadow scenarios: ' + s.passed_exact + ' PASS_EXACT + ' + s.passed_semantic + ' PASS_SEMANTIC / ' + s.total_scenarios + ' TOTAL',
    s.failed > 0 ? s.failed + ' scenarios failed' : null);
  check(s.critical_failures.length === 0, 'Zero critical failures',
    s.critical_failures.length > 0 ? JSON.stringify(s.critical_failures.slice(0,3)) : null);
  check(s.shadow_validation_ready === true, 'SHADOW_VALIDATION_READY = true');
} catch(e) {
  check(false, 'Shadow runner', e.message);
}

// ─── 5. 53-SERVICE COVERAGE ──────────────────────────────────────────────────
console.log('\n[5] Coverage');
try {
  const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, 'shadow-scenarios.v1.json'))).scenarios;
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '../canonical/canonical-registry.v1.draft.json')));
  const legMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../canonical/legacy-code-map.v1.draft.json')));
  const allCanonical = new Set(Object.keys(reg.services));
  const covered = new Set();
  scenarios.forEach(s => {
    covered.add(s.service_code);
    const m = legMap.mappings[s.service_code];
    if (m && m.canonical_service_code) covered.add(m.canonical_service_code);
  });
  const covCount = [...allCanonical].filter(c => covered.has(c)).length;
  check(covCount === 53, '53/53 canonical services have at least one shadow scenario', covCount < 53 ? (53 - covCount) + ' services missing' : null);
  
  const metiers = ['plomberie','electricite','serrurerie','climatisation','bricolage','nettoyage','peinture','menuiserie'];
  metiers.forEach(m => {
    const count = scenarios.filter(s => s.metier === m).length;
    check(count >= 15, m + ' >= 15 scenarios (' + count + ')', count < 15 ? 'only ' + count + ' scenarios' : null);
  });
} catch(e) {
  check(false, '53-service coverage', e.message);
}

// ─── 6. SECURITY CHECK ────────────────────────────────────────────────────────
console.log('\n[6] Security');
try {
  const shadowFiles = ['shadow-runner-v1.js'];
  const engineFiles = ['../engine/pricing-engine-core-v1.js', '../engine/pricing-engine-loader-v1.js'];
  [...shadowFiles, ...engineFiles].forEach(f => {
    const fullPath = path.join(__dirname, f);
    const src = fs.readFileSync(fullPath, 'utf8');
    // Skip comments and string literals that mention eval as text (e.g. security checks)
    const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const noSecChecks = codeLines.filter(l => !l.includes('hasEval') && !l.includes('eval()'));
    const hasEval = noSecChecks.some(l => /\beval\s*\(/.test(l));
    const hasFunc = noSecChecks.some(l => /new\s+Function\s*\(/.test(l));
    check(!hasEval && !hasFunc, path.basename(f) + ': no eval() / new Function()');
  });
} catch(e) {
  check(false, 'Security check', e.message);
}

// ─── 7. RUNTIME ISOLATION ─────────────────────────────────────────────────────
console.log('\n[7] Runtime Isolation');
try {
  const grep = execSync(
    "grep -r 'pricing-engine\\|pricing/shadow\\|canonical-registry\\.v1\\.draft\\|pricing-engine-core' --include='*.js' --include='*.html' --include='*.json' " +
    "--exclude-dir=node_modules --exclude-dir='data' .",
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();
  const nonCanonical = grep.split('\n').filter(l => l && !l.includes('data/pricing/') && !l.includes('data\\pricing\\'));
  check(nonCanonical.length === 0, '0 runtime references to engine/shadow/canonical-draft in production files',
    nonCanonical.length > 0 ? nonCanonical.join('\n') : null);
} catch(e) {
  if (e.status === 1 && e.stdout === '') {
    check(true, '0 runtime references (grep returned empty)');
  } else {
    check(false, 'Runtime isolation grep', e.message.slice(0, 100));
  }
}

// ─── 8. PRODUCTION DIFF ───────────────────────────────────────────────────────
console.log('\n[8] Production Diff');
try {
  const diffRaw = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const diff = diffRaw.split('\n').filter(l => l && !l.startsWith('data/pricing/')).join('\n');
  check(diff === '', 'Production runtime diff = 0', diff || null);
} catch(e) {
  check(false, 'Production diff', e.message);
}

// ─── RESULT ───────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('SHADOW VALIDATOR V1 — RESULT');
console.log('  PASS: ' + pass + ' / FAIL: ' + fail + ' / TOTAL: ' + total);
if (fail > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(e => console.log('    ❌ ' + e));
}
console.log('\n  Status: ' + (fail === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + fail + ' CHECK(S) FAILED'));
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(fail > 0 ? 1 : 0);
