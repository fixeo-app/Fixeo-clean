'use strict';
// ══════════════════════════════════════════════════════════════
// BP09 Enterprise E2E UX — Regression Tests
// Covers findings from docs/bp09-enterprise-e2e-ux-audit.md
//
// BP09-FIX-01 : _sb proxy — no hard crash when FixeoSupabaseClient absent
// BP09-FIX-02 : fetchSites selects status, site_code, address_line
// Includes regression guards for Phase A fixes (DEF-01, DEF-02, DEF-03, DEF-04)
// ══════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../../');
const JS_FILE = path.join(ROOT, 'js/enterprise-dashboard-v1.js');

let pass = 0, fail = 0;
function PASS(name) { pass++; console.log('  \u2705  ' + name); }
function FAIL(name, why) { fail++; console.error('  \u274c  ' + name + (why ? ' — ' + why : '')); }
function assert(cond, name, why) { if (cond) PASS(name); else FAIL(name, why); }

if (!fs.existsSync(JS_FILE)) {
  console.error('FATAL: JS file not found: ' + JS_FILE);
  process.exit(1);
}
const src = fs.readFileSync(JS_FILE, 'utf8');

console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('  BP09 ENTERPRISE E2E UX \u2014 Regression Tests');
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

// ──────────────────────────────────────────────────────────────
// Block 1 — BP09-FIX-01: Supabase client proxy
// ──────────────────────────────────────────────────────────────
console.log('Block 1 \u2014 BP09-FIX-01: Supabase client proxy (window._supabase removed)');

// 1-01: The old direct assignment 'const _sb = window._supabase' must NOT exist
assert(
  !src.includes('const _sb = window._supabase'),
  '1-01: const _sb = window._supabase is absent (old broken pattern)'
);

// 1-02: Proxy pattern present
assert(
  src.includes('new Proxy({}'),
  '1-02: _sb uses Proxy pattern'
);

// 1-03: _sbClient helper function present
assert(
  src.includes('function _sbClient()'),
  '1-03: _sbClient() helper function defined'
);

// 1-04: _sbClient reads FixeoSupabaseClient.client
assert(
  src.includes('window.FixeoSupabaseClient && window.FixeoSupabaseClient.client'),
  '1-04: _sbClient reads window.FixeoSupabaseClient.client'
);

// 1-05: DOMContentLoaded waits for FixeoSupabaseClient.ready()
assert(
  src.includes("FixeoSupabaseClient.ready().then"),
  '1-05: DOMContentLoaded awaits FixeoSupabaseClient.ready() before bootApp()'
);

// 1-06: Fallback path present for QA/mock environments without FixeoSupabaseClient
assert(
  src.includes('// Fallback: FixeoSupabaseClient not present'),
  '1-06: Fallback boot path present for QA/mock environments'
);

// 1-07: Proxy handles 'auth' property
assert(
  src.includes("if (prop === 'auth')"),
  '1-07: Proxy stub handles auth property'
);

// 1-08: Proxy handles 'from' property
assert(
  src.includes("if (prop === 'from')"),
  '1-08: Proxy stub handles from property'
);

// 1-09: Proxy handles 'rpc' property
assert(
  src.includes("if (prop === 'rpc')"),
  '1-09: Proxy stub handles rpc property'
);

// 1-10: Error logged when client not ready (not silent)
assert(
  src.includes("'[enterprise-dashboard] Supabase client not ready"),
  '1-10: Error logged when _sbClient() returns null'
);

// ──────────────────────────────────────────────────────────────
// Block 2 — BP09-FIX-02: fetchSites status field
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 2 \u2014 BP09-FIX-02: fetchSites() includes status + address_line + site_code');

// Extract the fetchSites function body
const fetchSitesMatch = src.match(/async function fetchSites\(\)([\s\S]*?)(?=\n\/\/|^\s*async function|\n\/\*)/m);
const fetchSitesBody  = fetchSitesMatch ? fetchSitesMatch[0] : '';

// 2-01: fetchSites selects status
assert(
  fetchSitesBody.includes("'id, name, address, city, status, site_code, address_line'"),
  '2-01: fetchSites selects status, site_code, address_line'
);

// 2-02: status field is in select (broad check)
assert(
  fetchSitesBody.includes('status'),
  '2-02: status present in fetchSites select'
);

// 2-03: site_code present
assert(
  fetchSitesBody.includes('site_code'),
  '2-03: site_code present in fetchSites select'
);

// 2-04: address_line present
assert(
  fetchSitesBody.includes('address_line'),
  '2-04: address_line present in fetchSites select'
);

// 2-05: enterprise_sites table still referenced
assert(
  fetchSitesBody.includes("'enterprise_sites'"),
  '2-05: enterprise_sites table reference intact'
);

// 2-06: fetchSites still sets sitesLoaded = true
assert(
  fetchSitesBody.includes('S.sitesLoaded = true'),
  '2-06: S.sitesLoaded = true still set after fetch'
);

// 2-07: populateSiteFilters still called
assert(
  fetchSitesBody.includes('populateSiteFilters()'),
  '2-07: populateSiteFilters() called after fetch'
);

// ──────────────────────────────────────────────────────────────
// Block 3 — Regression: Phase A DEF-01 loadRequests deadlock guard
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 3 \u2014 Regression: DEF-01 loadRequests early-return deadlock');

// 3-01: requestsExhausted early return resets requestsLoading
assert(
  src.includes('if(S.requestsExhausted&&!reset) { S.requestsLoading=false; setLoading(\'section-requests\',false); return; }'),
  '3-01: requestsExhausted early-return resets S.requestsLoading (DEF-01 fix intact)'
);

// ──────────────────────────────────────────────────────────────
// Block 4 — Regression: Phase A DEF-02 loadHistory deadlock guard
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 4 \u2014 Regression: DEF-02 loadHistory early-return deadlock');

// 4-01: historyExhausted early return resets historyLoading
assert(
  src.includes('if(S.historyExhausted&&!reset) { S.historyLoading=false; setLoading(\'section-history\',false); return; }'),
  '4-01: historyExhausted early-return resets S.historyLoading (DEF-02 fix intact)'
);

// ──────────────────────────────────────────────────────────────
// Block 5 — Regression: Phase A DEF-03/04 trapFocus in search/cmd dialogs
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 5 \u2014 Regression: DEF-03/04 trapFocus in search + cmd palette');

// 5-01: Search dialog uses trapFocus via _searchTrapRelease
assert(
  src.includes('_searchTrapRelease = trapFocus(dlg)'),
  '5-01: openSearch() calls trapFocus (DEF-03 fix intact)'
);

// 5-02: cmd palette uses trapFocus via _cmdTrapRelease
assert(
  src.includes('_cmdTrapRelease = trapFocus(dlg)'),
  '5-02: openCmdPalette() calls trapFocus (DEF-04 fix intact)'
);

// 5-03: Search releases trap on close
assert(
  src.includes("_searchTrapRelease(); _searchTrapRelease=null;"),
  '5-03: closeSearch() releases focus trap'
);

// 5-04: Cmd palette releases trap on close
assert(
  src.includes("_cmdTrapRelease(); _cmdTrapRelease=null;"),
  '5-04: closeCmdPalette() releases focus trap'
);

// ──────────────────────────────────────────────────────────────
// Block 6 — Role gate integrity (P0 guards unchanged)
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 6 \u2014 Role gate integrity (no regressions)');

// 6-01: CAN_CREATE_ROLES does not include viewer
const createRolesMatch = src.match(/const CAN_CREATE_ROLES\s*=\s*(\[.*?\]);/);
if (createRolesMatch) {
  assert(
    !createRolesMatch[1].includes("'viewer'"),
    '6-01: viewer absent from CAN_CREATE_ROLES'
  );
} else { FAIL('6-01', 'CAN_CREATE_ROLES not found'); }

// 6-02: CAN_CONFIRM_ROLES does not include reporter or viewer
const confirmRolesMatch = src.match(/const CAN_CONFIRM_ROLES\s*=\s*(\[.*?\]);/);
if (confirmRolesMatch) {
  assert(
    !confirmRolesMatch[1].includes("'reporter'") && !confirmRolesMatch[1].includes("'viewer'"),
    '6-02: reporter and viewer absent from CAN_CONFIRM_ROLES'
  );
} else { FAIL('6-02', 'CAN_CONFIRM_ROLES not found'); }

// 6-03: confirmMission hard guard present
assert(
  src.includes("if(!canConfirm(S.userRole)) return;"),
  '6-03: confirmMission() has hard guard on canConfirm()'
);

// 6-04: viewer gate in initNewRequestForm
assert(
  src.includes("if(S.userRole==='viewer'){") && src.includes("if(viewerNotice)"),
  '6-04: viewer blocked in initNewRequestForm()'
);

// 6-05: viewer gate in loadMembers
assert(
  src.includes("if(S.userRole==='viewer'){") && src.includes("if(roleGate) roleGate.style.display=''"),
  '6-05: viewer blocked in loadMembers()'
);

// ──────────────────────────────────────────────────────────────
// Block 7 — Double-submit guards
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 7 \u2014 Double-submit guards');

// 7-01: confirmMission double-submit guard
assert(
  src.includes('if(S.confirmSubmitting) return;'),
  '7-01: confirmMission() checks S.confirmSubmitting'
);

// 7-02: submitNewRequest double-submit guard
assert(
  src.includes('if(S.formSubmitting) return;'),
  '7-02: submitNewRequest() checks S.formSubmitting'
);

// 7-03: Member action pending guard
assert(
  src.includes('if(_memberActionPending[mid]) return;'),
  '7-03: member actions check _memberActionPending[mid]'
);

// ──────────────────────────────────────────────────────────────
// Block 8 — Syntax check (Node.js parses the file cleanly)
// ──────────────────────────────────────────────────────────────
console.log('\nBlock 8 \u2014 Syntax check');

const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, ['--check', JS_FILE]);
assert(
  result.status === 0,
  '8-01: enterprise-dashboard-v1.js passes node --check (no syntax errors)',
  result.stderr ? result.stderr.toString() : ''
);

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(64));
console.log('  BP09 E2E UX REGRESSION RESULTS');
console.log('\u2550'.repeat(64));
console.log('  Total : ' + (pass + fail));
console.log('  \u2705 PASS  : ' + pass);
console.log('  \u274c FAIL  : ' + fail);
console.log('\u2550'.repeat(64));

if (fail > 0) {
  console.error('\nBP09 E2E UX REGRESSION: FAILED');
  process.exit(1);
} else {
  console.log('\nBP09 E2E UX REGRESSION: PASSED');
  process.exit(0);
}
