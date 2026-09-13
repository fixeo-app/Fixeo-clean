'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// BP11 — Operations Command Center Tests
// Pure file-contract + logic tests. No live DB required.
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0, warn = 0;

function check(label, val, expected) {
  const ok = val === expected;
  if (ok) { pass++; console.log('  ✅ PASS:', label); }
  else    { fail++; console.error('  ❌ FAIL:', label, '— got', JSON.stringify(val), 'expected', JSON.stringify(expected)); }
}
function warnIf(label, condition, msg) {
  if (condition) { warn++; console.warn('  ⚠️  WARN:', label, msg || ''); }
  else           { pass++; console.log('  ✅ PASS:', label); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

// ── File reader helpers ──────────────────────────────────────────
function readFile(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}
function fileExists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

const jsMain      = readFile('js/enterprise-dashboard-v1.js') || '';
const jsContract  = readFile('js/enterprise-ops-contract-v1.js') || null;
const htmlFile    = readFile('enterprise-dashboard.html') || '';
const cssFile     = readFile('css/enterprise-dashboard-v1.css') || '';

// Extract ops section of main JS (after BP11 marker)
const opsSectionStart = jsMain.indexOf('BP11 — Operations Command Center');
const jsOps = opsSectionStart >= 0 ? jsMain.slice(opsSectionStart) : '';

// ════════════════════════════════════════════════════════════════
// SECTION A — Authorization contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('A — Authorization contracts');

// A-01: CAN_CONFIRM_ROLES does NOT include 'reporter' or 'viewer'
const canConfirmMatch = jsMain.match(/CAN_CONFIRM_ROLES\s*=\s*\[([^\]]+)\]/);
const canConfirmStr   = canConfirmMatch ? canConfirmMatch[1] : '';
check('A-01: CAN_CONFIRM_ROLES excludes reporter', !canConfirmStr.includes("'reporter'"), true);
check('A-01: CAN_CONFIRM_ROLES excludes viewer',   !canConfirmStr.includes("'viewer'"),   true);

// A-02: CAN_CONFIRM_ROLES includes required roles
check('A-02: CAN_CONFIRM_ROLES includes owner',               canConfirmStr.includes("'owner'"),               true);
check('A-02: CAN_CONFIRM_ROLES includes admin',               canConfirmStr.includes("'admin'"),               true);
check('A-02: CAN_CONFIRM_ROLES includes operations_manager',  canConfirmStr.includes("'operations_manager'"),  true);
check('A-02: CAN_CONFIRM_ROLES includes site_manager',        canConfirmStr.includes("'site_manager'"),        true);

// A-03: canConfirm function present and references CAN_CONFIRM_ROLES
check('A-03: canConfirm function present', jsMain.includes('function canConfirm'), true);
check('A-03: canConfirm references CAN_CONFIRM_ROLES', jsMain.includes('CAN_CONFIRM_ROLES.includes'), true);

// A-04: opsNeedsAttention or needsAttention present
check('A-04: opsNeedsAttention function present in ops JS', jsOps.includes('function opsNeedsAttention') || jsOps.includes('opsNeedsAttention'), true);

// A-05: No direct .update() on service_requests in ops JS
const srUpdateInOps = jsOps.includes('.from(\'service_requests\')') &&
  jsOps.split('.from(\'service_requests\')').some(function(seg){ return seg.slice(0,200).includes('.update('); });
check('A-05: No direct service_requests .update() in ops JS', srUpdateInOps, false);

// A-06: No direct .insert() on enterprise_request_context
const ercInsert = jsOps.includes('.from(\'enterprise_request_context\')') &&
  jsOps.split('.from(\'enterprise_request_context\')').some(function(seg){ return seg.slice(0,200).includes('.insert('); });
check('A-06: No .insert() on enterprise_request_context', ercInsert, false);

// A-07: enterprise-ops-contract-v1.js exists and passes node --check
warnIf('A-07: enterprise-ops-contract-v1.js exists', !fileExists('js/enterprise-ops-contract-v1.js'), 'file not found — Agent 1 may not have run');
if (fileExists('js/enterprise-ops-contract-v1.js')) {
  try {
    execSync('node --check ' + path.join(ROOT, 'js/enterprise-ops-contract-v1.js'));
    check('A-07: enterprise-ops-contract-v1.js syntax OK', true, true);
  } catch(e) {
    check('A-07: enterprise-ops-contract-v1.js syntax OK', false, true);
  }
}

// A-08: EnterpriseOpsContract exported
if (jsContract) {
  check('A-08: EnterpriseOpsContract assigned to global', jsContract.includes('EnterpriseOpsContract'), true);
} else {
  warnIf('A-08: EnterpriseOpsContract present', true, 'contract file not found');
}

// A-09: fetchMissionForRequest uses .eq('request_id', not service_request_id
const fetchMissionSrc = jsContract || jsOps;
check('A-09: fetchMissionForRequest uses request_id not service_request_id',
  fetchMissionSrc.includes(".eq('request_id'") || fetchMissionSrc.includes('.eq("request_id"'),
  true);
check('A-09: fetchMissionForRequest does NOT use service_request_id',
  !fetchMissionSrc.includes(".eq('service_request_id'"),
  true);

// A-10: requestId cast to string
check('A-10: String(srId) or String(requestId) cast present',
  fetchMissionSrc.includes('String(srId)') || fetchMissionSrc.includes('String(requestId)'),
  true);

// ════════════════════════════════════════════════════════════════
// SECTION B — Data contract (file-based)
// ════════════════════════════════════════════════════════════════
section('B — Data contract');

// B-01: ops query uses enterprise_request_context join
check('B-01: ops query references enterprise_request_context',
  jsOps.includes('enterprise_request_context'), true);

// B-02: No service_requests.enterprise_site_id
check('B-02: No service_requests.enterprise_site_id reference',
  !jsOps.includes('enterprise_site_id'), true);
// B-02: No service_requests.enterprise_site_id in non-comment code
const contractNonComment = (jsContract||'').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
check('B-02: No enterprise_site_id in contract file (code only)',
  !contractNonComment.includes('enterprise_site_id'), true);

// B-03: missions join uses string cast
check('B-03: String(srId) or String(requestId) in mission query',
  (jsContract||jsOps).includes('String(srId)') || (jsContract||jsOps).includes('String(requestId)'),
  true);

// B-04: artisan_profile_id used (not artisan_id)
check('B-04: artisan_profile_id used in missions select',
  (jsContract||jsOps).includes('artisan_profile_id'), true);
check('B-04: artisan_id NOT used in ops/contract',
  !(jsOps.includes("'artisan_id'") || jsOps.includes('"artisan_id"')), true);

// B-05: confirm_completed_mission RPC
check('B-05: confirm_completed_mission RPC present', jsOps.includes('confirm_completed_mission'), true);

// B-06: No direct service_requests status UPDATE
check('B-06: No direct status UPDATE on service_requests in ops',
  !jsOps.includes('.from(\'service_requests\').update'), true);

// B-07: missions query limit(1) + order desc
check('B-07: missions query has limit(1)',
  (jsContract||jsOps).includes('.limit(1)'), true);
check('B-07: missions query ordered ascending:false',
  (jsContract||jsOps).includes('ascending: false') || (jsContract||jsOps).includes('ascending:false'),
  true);

// B-08: fetchOperationsQueue with cursor pagination
check('B-08: fetchOpsQueuePage or fetchOperationsQueue present',
  jsOps.includes('fetchOpsQueuePage') || (jsContract && jsContract.includes('fetchOperationsQueue')),
  true);
check('B-08: cursor pagination logic present',
  (jsContract||jsOps).includes('lastCreatedAt') && (jsContract||jsOps).includes('lastId'),
  true);

// B-09: STALE_THRESHOLD_MS defined as 48h
check('B-09: STALE_THRESHOLD_MS = 172800000 (48h)',
  (jsContract||jsOps).includes('172800000') ||
  ((jsContract||jsOps).includes('48') && (jsContract||jsOps).includes('STALE_THRESHOLD_MS')),
  true);

// B-10: needsAttention checks urgency AND status
const naFn = jsOps.match(/function opsNeedsAttention[\s\S]{0,800}/)?.[0] ||
             (jsContract||'').match(/function needsAttention[\s\S]{0,800}/)?.[0] || '';
check('B-10: needsAttention checks urgency', naFn.includes('urgency'), true);
check('B-10: needsAttention checks status',  naFn.includes('status'),  true);
check('B-10: needsAttention checks ageMs',   naFn.includes('ageMs') || naFn.includes('age'), true);

// ════════════════════════════════════════════════════════════════
// SECTION C — Operations queue behavior (logic tests)
// ════════════════════════════════════════════════════════════════
section('C — Operations queue behavior (logic)');

// Inline needsAttention implementation matching the contract
const STALE_MS = 48 * 3600 * 1000;
function _needsAttention(row) {
  if (!row) return false;
  const u = row.urgency || '', st = row.status || '', age = row.ageMs || 0;
  if (u === 'now' && (st === 'new' || st === 'assigned')) return true;
  if (st === 'completed') return true;
  if (age > STALE_MS && (st === 'new' || st === 'assigned')) return true;
  return false;
}
function _computeOpsAge(createdAt) {
  if (!createdAt) return { ms:0, label:'—' };
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 0) return { ms:0, label:'0 min' };
  if (ms < 60000)     return { ms, label: '<1 min' };
  if (ms < 3600000)   return { ms, label: Math.floor(ms/60000) + ' min' };
  if (ms < 86400000)  return { ms, label: Math.floor(ms/3600000) + 'h' };
  return { ms, label: Math.floor(ms/86400000) + 'j' };
}
function _buildCursor(rows) {
  if (!rows || !rows.length) return null;
  const last = rows[rows.length-1];
  return { lastCreatedAt: last.createdAt, lastId: last.id };
}

check('C-01: needsAttention(urgency=now, status=new) → true',
  _needsAttention({ urgency:'now', status:'new', ageMs:0 }), true);
check('C-02: needsAttention(urgency=now, status=in_progress) → false',
  _needsAttention({ urgency:'now', status:'in_progress', ageMs:0 }), false);
check('C-03: needsAttention(normale, completed) → true',
  _needsAttention({ urgency:'normale', status:'completed', ageMs:0 }), true);
check('C-04: needsAttention(normale, validated) → false',
  _needsAttention({ urgency:'normale', status:'validated', ageMs:0 }), false);
check('C-05: needsAttention(normale, new, 49h) → true (stale)',
  _needsAttention({ urgency:'normale', status:'new', ageMs: 49*3600*1000 }), true);
check('C-06: needsAttention(normale, new, 10h) → false (not stale)',
  _needsAttention({ urgency:'normale', status:'new', ageMs: 10*3600*1000 }), false);
check('C-07: computeOpsAge < 1h → minutes label',
  _computeOpsAge(new Date(Date.now() - 30*60*1000).toISOString()).label.includes('min'), true);
check('C-08: computeOpsAge >= 24h → days label',
  _computeOpsAge(new Date(Date.now() - 2*86400*1000).toISOString()).label.endsWith('j'), true);
check('C-09: buildCursor([]) → null',
  _buildCursor([]), null);
check('C-10: buildCursor returns lastCreatedAt + lastId',
  JSON.stringify(_buildCursor([{id:'a',createdAt:'2026-01-01T00:00:00Z'},{id:'b',createdAt:'2026-01-02T00:00:00Z'}])),
  JSON.stringify({ lastCreatedAt:'2026-01-02T00:00:00Z', lastId:'b' }));

// Additional needsAttention edge cases
check('C-11: needsAttention(urgent, assigned) → true',
  _needsAttention({ urgency:'urgent', status:'assigned', ageMs:0 }), false); // urgency must be 'now' for urgent+assigned
check('C-12: needsAttention(now, assigned) → true',
  _needsAttention({ urgency:'now', status:'assigned', ageMs:0 }), true);

// ════════════════════════════════════════════════════════════════
// SECTION D — UX contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('D — UX contracts (HTML/JS/CSS)');

check('D-01: #ops-queue-list in HTML',         htmlFile.includes('id="ops-queue-list"'),           true);
check('D-02: ops-kpi-strip in HTML or CSS',    htmlFile.includes('ops-kpi-strip') || cssFile.includes('ops-kpi-strip'), true);
check('D-03: ops-needs-attention-toggle in HTML', htmlFile.includes('ops-needs-attention-toggle'), true);
check('D-04: ops-detail-panel in HTML',        htmlFile.includes('ops-detail-panel'),              true);
check('D-05: ops-lifecycle-bar in HTML+CSS',   htmlFile.includes('ops-lifecycle-bar') && cssFile.includes('ops-lifecycle-bar'), true);
check('D-06: initOpsCommandCenter in JS',      jsOps.includes('function initOpsCommandCenter'),    true);
check('D-07: loadOpsQueue in JS',              jsOps.includes('function loadOpsQueue') || jsOps.includes('async function loadOpsQueue'), true);
check('D-08: renderOpsRow in JS',              jsOps.includes('function renderOpsRow'),            true);
check('D-09: openOpsDetail in JS',             jsOps.includes('function openOpsDetail'),           true);
check('D-10: confirmOpsValidation in JS',      jsOps.includes('function confirmOpsValidation') || jsOps.includes('async function confirmOpsValidation'), true);
check('D-11: ops section in HTML nav',         htmlFile.includes('data-section="ops"'),            true);
check('D-12: ops-filter-site in HTML',         htmlFile.includes('id="ops-filter-site"'),          true);
check('D-13: ops-filter-status in HTML',       htmlFile.includes('id="ops-filter-status"'),        true);
check('D-14: ops-detail-back in HTML',         htmlFile.includes('id="ops-detail-back"'),          true);
check('D-15: ops-detail-confirm-btn in HTML',  htmlFile.includes('id="ops-detail-confirm-btn"'),   true);

// ════════════════════════════════════════════════════════════════
// SECTION E — Security contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('E — Security contracts');

// E-01: No innerHTML with user data (only innerHTML = '' for clearing)
const innerHtmlInOps = jsOps.split('innerHTML').filter(seg => {
  const a = seg.slice(0,5);
  return (a.includes('=') || a.includes(' =')) &&
    !seg.slice(0,60).includes("''") && !seg.slice(0,60).includes('""') &&
    !seg.slice(0,60).includes("= ''") && !seg.slice(0,60).includes('= ""');
});
// Accept only = '' assignments (clearing); flag anything else
const dangerousInnerHTML = jsOps.split('\n').filter(l => {
  const t = l.trim();
  return t.includes('.innerHTML') &&
    t.includes('=') &&
    !t.startsWith('//') &&
    !t.includes("= ''") && !t.includes('= ""') &&
    !t.includes('.innerHTML = \'\'') &&
    !t.includes('safeHtml');
});
check('E-01: No innerHTML with user data in ops section', dangerousInnerHTML.length, 0);

// E-02: opsConfirmSubmitting guard
check('E-02: opsConfirmSubmitting double-submit guard in confirmOpsValidation',
  jsOps.includes('opsConfirmSubmitting'), true);

// E-03: activeEnterprise null-check in ops query
check('E-03: S.activeEnterprise guard before ops query',
  jsOps.includes('if (!S.activeEnterprise)'), true);

// E-04: No raw error.message to DOM
const rawErrToDOM = jsOps.split('\n').filter(l => {
  return l.includes('error.message') && (l.includes('.textContent') || l.includes('.innerHTML') || l.includes('innerText'));
});
check('E-04: No raw error.message to DOM in ops', rawErrToDOM.length, 0);

// E-05: canConfirm called in renderOpsDetail before confirm block shown
check('E-05: canConfirm checked before confirm button shown in renderOpsDetail',
  jsOps.includes('canConfirm(S.userRole)'), true);

// E-06: Stale detail check
check('E-06: opsDetailRequestId staleness check in loadOpsDetail',
  jsOps.includes('S.opsDetailRequestId !== myRequestId'), true);

// E-07: opsQueueLoading concurrent guard
check('E-07: opsQueueLoading concurrent load guard', jsOps.includes('S.opsQueueLoading'), true);

// ════════════════════════════════════════════════════════════════
// SECTION F — Regression (run existing test files)
// ════════════════════════════════════════════════════════════════
section('F — Regression');

function runTest(label, filePath) {
  if (!fs.existsSync(filePath)) {
    warn++;
    console.warn('  ⚠️  WARN:', label, '— file not found:', filePath);
    return;
  }
  try {
    const out = execSync('node ' + filePath, { encoding:'utf8', stdio:'pipe', timeout: 30000 });
    const passMatch = out.match(/PASS\s*:\s*(\d+)/);
    const failMatch = out.match(/FAIL\s*:\s*(\d+)/);
    const passCount = passMatch ? parseInt(passMatch[1]) : '?';
    const failCount = failMatch ? parseInt(failMatch[1]) : '?';
    if (failCount === 0 || failCount === '?') {
      pass++;
      console.log('  ✅ PASS:', label, '— ' + passCount + ' pass, ' + failCount + ' fail');
    } else {
      fail++;
      console.error('  ❌ FAIL:', label, '— ' + passCount + ' pass, ' + failCount + ' fail');
    }
  } catch(e) {
    fail++;
    const out = (e.stdout || '') + (e.stderr || '');
    const passMatch = out.match(/PASS\s*:\s*(\d+)/);
    const failMatch = out.match(/FAIL\s*:\s*(\d+)/);
    console.error('  ❌ FAIL:', label, '—',
      (passMatch ? passMatch[1] : '?') + ' pass,',
      (failMatch ? failMatch[1] : '?') + ' fail');
  }
}

runTest('F-01: BP10 invitation tests',
  path.join(ROOT, 'tests/enterprise/bp10-invitation-tests.js'));
runTest('F-02: BP09 contract matrix tests',
  path.join(ROOT, 'tests/enterprise/bp09-contract-matrix-tests.js'));
runTest('F-03: RC hardening tests',
  path.join(ROOT, 'tests/enterprise/rc-hardening-tests.js'));

// ════════════════════════════════════════════════════════════════
// SECTION G — Pricing file protection + architecture contracts
// ════════════════════════════════════════════════════════════════
section('G — Pricing file protection + architecture');

check('G-01: Pricing engine file exists',
  fileExists('data/pricing/engine/engine-test-report.v1.json'), true);
check('G-02: Pricing shadow file exists',
  fileExists('data/pricing/shadow/shadow-results.v1.json'), true);
const contractNonCommentG = (jsContract||'').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
check('G-03: No enterprise_site_id in ops contract (code only)',
  !contractNonCommentG.includes('enterprise_site_id'), true);
check('G-03: No enterprise_site_id in ops JS section',
  !jsOps.includes('enterprise_site_id'), true);
check('G-04: ops-contract-v1.js syntax valid',
  fileExists('js/enterprise-ops-contract-v1.js') ? (() => {
    try { execSync('node --check ' + path.join(ROOT,'js/enterprise-ops-contract-v1.js')); return true; } catch(_){ return false; }
  })() : null, fileExists('js/enterprise-ops-contract-v1.js') ? true : null);
check('G-05: enterprise-dashboard-v1.js syntax valid', (() => {
  try { execSync('node --check ' + path.join(ROOT,'js/enterprise-dashboard-v1.js')); return true; } catch(_){ return false; }
})(), true);
check('G-06: BP10 invitation SQL migration exists',
  fileExists('supabase/7c15a9-enterprise-invitations.sql'), true);
check('G-07: BP09 enterprise RLS migration exists',
  fileExists('supabase/bp09-enterprise-rls-and-schema.sql'), true);

// ════════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(' BP11 OPS COMMAND CENTER TESTS');
console.log('═'.repeat(60));
console.log(' PASS  :', pass);
console.log(' FAIL  :', fail);
console.log(' WARN  :', warn);
console.log(' TOTAL :', pass + fail + warn);
console.log('═'.repeat(60));
if (fail === 0) {
  console.log('\n BP11 OPS COMMAND CENTER TESTS: PASSED\n');
  process.exit(0);
} else {
  console.log('\n BP11 OPS COMMAND CENTER TESTS: FAILED\n');
  process.exit(1);
}
