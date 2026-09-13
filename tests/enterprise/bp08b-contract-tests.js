'use strict';
// ════════════════════════════════════════════════════════════
// BP08B Contract + Behavioral Tests (static / DOM-parse)
// Run with: node tests/enterprise/bp08b-contract-tests.js
// ════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_PATH  = path.join(ROOT, 'js', 'enterprise-dashboard-v1.js');
const CSS_PATH = path.join(ROOT, 'css', 'enterprise-dashboard-v1.css');
const HTML_PATH= path.join(ROOT, 'enterprise-dashboard.html');
const SQL_PATH = path.join(ROOT, 'supabase', '7c15a1-enterprise-member-admin.sql');

const js  = fs.readFileSync(JS_PATH,  'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const sql = fs.readFileSync(SQL_PATH, 'utf8');

let pass=0, fail=0, warn=0;
function PASS(n){ console.log('  \u2705 '+n); pass++; }
function FAIL(n){ console.error('  \u274c '+n); fail++; }
function WARN(n){ console.warn('  \u26a0\ufe0f  '+n); warn++; }
function H(t){ console.log('\n'+t); }

console.log('');
console.log('\u2550'.repeat(63));
console.log('BP08B Contract Tests');
console.log('\u2550'.repeat(63));

// ── A: FE-AUTH-01 fix ────────────────────────────────────────
H('A \u2014 FE-AUTH-01: Boot query status filter');
if(js.includes(".eq('status', 'active'); // FE-AUTH-01") ||
   js.includes('.eq(\'status\', \'active\'); // FE-AUTH-01'))
  PASS('A-01: boot query has .eq(status,active) with FE-AUTH-01 comment');
else if(js.match(/enterprise_members[\s\S]{0,200}\.eq\('user_id'/m) &&
        js.match(/\.eq\('status',\s*'active'\)/))
  PASS('A-01: boot query has .eq(status,active)');
else FAIL('A-01: FE-AUTH-01 fix missing — no .eq(status,active) near boot query');

// ── B: loadMembers does NOT filter active-only ───────────────
H('B \u2014 loadMembers: NO active-only filter (owner/admin sees all statuses)');
// Check that the loadMembers function does NOT contain .eq('status','active')
const loadMembersFn = js.match(/async function loadMembers\(\)[\s\S]*?^}/m)||
                      js.match(/async function loadMembers[\s\S]*?^}/m)||
                      js.match(/loadMembers[\s\S]{0,2000}renderMembers/);
if(loadMembersFn) {
  const fnStr = loadMembersFn[0];
  if(fnStr.includes(".eq('status', 'active')") || fnStr.includes('.eq(\'status\',\'active\')'))
    FAIL('B-01: loadMembers incorrectly filters to active-only (must show all statuses)');
  else
    PASS('B-01: loadMembers does not filter to active-only (correct)');
} else WARN('B-01: could not isolate loadMembers function body');

if(js.includes("'id, role, status, user_id, users!inner(email, full_name)'"))
  PASS('B-02: loadMembers query includes status column');
else FAIL('B-02: loadMembers query missing status column');

// ── C: renderMembers admin controls ─────────────────────────
H('C \u2014 renderMembers: Admin controls present');
if(js.includes('bp08b-btn-suspend'))       PASS('C-01: suspend button rendered');
else FAIL('C-01: suspend button missing');
if(js.includes('bp08b-btn-remove'))        PASS('C-02: remove button rendered');
else FAIL('C-02: remove button missing');
if(js.includes('bp08b-btn-reactivate'))    PASS('C-03: reactivate button rendered');
else FAIL('C-03: reactivate button missing');
if(js.includes('bp08b-btn-role'))          PASS('C-04: role change button rendered');
else FAIL('C-04: role change button missing');
if(js.includes('bp08b-role-select'))       PASS('C-05: role select rendered');
else FAIL('C-05: role select missing');

// ── D: Owner protection — disabled controls ──────────────────
H('D \u2014 Owner-protected controls: disabled/hidden for admin caller');
if(js.includes('callerIsAdmin && isOwnerRow'))
  PASS('D-01: admin cannot act on owner row check present');
else FAIL('D-01: admin-cannot-act-on-owner check missing');

if(js.includes("disabled aria-disabled=\"true\""))
  PASS('D-02: owner-protected buttons rendered as disabled');
else FAIL('D-02: disabled aria-disabled not found on owner-protected buttons');

// ── E: Role constants ────────────────────────────────────────
H('E \u2014 Role constants: owner not in admin-selectable list');
if(js.includes('BP08B_ROLES'))
  PASS('E-01: BP08B_ROLES constant defined');
else FAIL('E-01: BP08B_ROLES constant missing');

const rolesBlock = js.match(/BP08B_ROLES\s*=\s*\[[\s\S]*?\];/);
if(rolesBlock && !rolesBlock[0].includes("'owner'"))
  PASS('E-02: BP08B_ROLES does not include owner role');
else if(!rolesBlock)
  WARN('E-02: could not parse BP08B_ROLES');
else FAIL('E-02: BP08B_ROLES contains owner — must not allow promotion to owner via UI');

// ── F: RPC calls correct contract ────────────────────────────
H('F \u2014 RPC call contracts');
if(js.includes("'update_enterprise_member_role'"))
  PASS('F-01: update_enterprise_member_role RPC called');
else FAIL('F-01: update_enterprise_member_role RPC not called');

if(js.includes("'set_enterprise_member_status'"))
  PASS('F-02: set_enterprise_member_status RPC called');
else FAIL('F-02: set_enterprise_member_status RPC not called');

if(js.includes('p_enterprise_id') && js.includes('p_member_id') && js.includes('p_new_role'))
  PASS('F-03: update_enterprise_member_role correct param names');
else FAIL('F-03: update_enterprise_member_role param names wrong');

if(js.includes('p_enterprise_id') && js.includes('p_member_id') && js.includes('p_new_status'))
  PASS('F-04: set_enterprise_member_status correct param names');
else FAIL('F-04: set_enterprise_member_status param names wrong');

// ── G: Feedback states ───────────────────────────────────────
H('G \u2014 Feedback states');
const feedbackStates = [
  ['forbidden',                 'G-01'],
  ['cannot_modify_owner',       'G-02'],
  ['owner_invariant_violation', 'G-03'],
  ['caller_not_active',         'G-04'],
  ['unauthenticated',           'G-05'],
  ['member_already_removed',    'G-06']
];
feedbackStates.forEach(function([k,id]){
  // keys appear as unquoted object properties in the feedback maps
  if(js.includes(k+':') || js.includes("'"+k+"'")) PASS(id+': feedback for '+k+' present');
  else FAIL(id+': feedback for '+k+' missing');
});

// ── H: Non-manager roles: no mutation controls ───────────────
H('H \u2014 Non-manager roles: mutation controls not shown');
if(js.includes("isManager = (S.userRole==='owner'||S.userRole==='admin')"))
  PASS('H-01: isManager gate gates mutation controls');
else FAIL('H-01: isManager gate missing');

if(js.includes('if(canAct)'))
  PASS('H-02: canAct gates actions block');
else FAIL('H-02: canAct gate missing');

// ── I: Status badge + inactive card styling ──────────────────
H('I \u2014 Status badges and inactive card CSS');
if(css.includes('bp08b-badge-active'))   PASS('I-01: active badge CSS present');
else FAIL('I-01: active badge CSS missing');
if(css.includes('bp08b-badge-suspended'))PASS('I-02: suspended badge CSS present');
else FAIL('I-02: suspended badge CSS missing');
if(css.includes('bp08b-badge-removed'))  PASS('I-03: removed badge CSS present');
else FAIL('I-03: removed badge CSS missing');
if(css.includes('bp08b-member-inactive'))PASS('I-04: inactive card CSS present');
else FAIL('I-04: inactive card CSS missing');
if(css.includes('bp08b-btn-suspend'))    PASS('I-05: suspend button CSS present');
else FAIL('I-05: suspend button CSS missing');

// ── J: Migration checks ──────────────────────────────────────
H('J \u2014 SQL migration: security requirements');
if(sql.includes('SECURITY DEFINER'))
  PASS('J-01: migration uses SECURITY DEFINER');
else FAIL('J-01: SECURITY DEFINER missing from migration');

if(sql.match(/SET search_path = ''/))
  PASS("J-02: migration sets search_path = ''");
else FAIL("J-02: search_path = '' missing from migration");

if(sql.includes('FOR UPDATE'))
  PASS('J-03: migration uses FOR UPDATE locking');
else FAIL('J-03: FOR UPDATE locking missing from migration');

if(sql.includes('enterprise_accounts') && sql.match(/enterprise_accounts[\s\S]{0,200}FOR UPDATE/))
  PASS('J-04: FOR UPDATE on enterprise_accounts for owner serialization');
else FAIL('J-04: FOR UPDATE on enterprise_accounts not found');

if(sql.includes('em_enforce_owner_invariant'))
  PASS('J-05: owner-safety trigger defined');
else FAIL('J-05: owner-safety trigger missing');

if(sql.includes("REVOKE EXECUTE ON FUNCTION public.update_enterprise_member_role"))
  PASS('J-06: REVOKE EXECUTE from PUBLIC on role RPC');
else FAIL('J-06: REVOKE EXECUTE from PUBLIC missing for role RPC');

if(sql.includes("REVOKE EXECUTE ON FUNCTION public.set_enterprise_member_status"))
  PASS('J-07: REVOKE EXECUTE from PUBLIC on status RPC');
else FAIL('J-07: REVOKE EXECUTE from PUBLIC missing for status RPC');

if(sql.includes("role NOT IN\n      ('admin','operations_manager','site_manager','reporter','viewer')") ||
   sql.match(/p_new_role.*NOT IN.*owner/s) ||
   sql.match(/NOT IN\s*\(\s*'admin','operations_manager'/))
  PASS('J-08: role=owner rejected in role RPC');
else if(sql.includes("'admin','operations_manager','site_manager','reporter','viewer'"))
  PASS('J-08: valid role list excludes owner');
else FAIL('J-08: role=owner rejection guard not found');

if(sql.includes("REVOKE INSERT, UPDATE, DELETE ON public.enterprise_members FROM authenticated"))
  PASS('J-09: INSERT/UPDATE/DELETE revoked from authenticated on enterprise_members');
else FAIL('J-09: privilege revocation missing');

if(sql.includes('owner_invariant_violation'))
  PASS('J-10: owner_invariant_violation error code present');
else FAIL('J-10: owner_invariant_violation error code missing');

if(sql.includes('cannot_modify_owner'))
  PASS('J-11: cannot_modify_owner error code present');
else FAIL('J-11: cannot_modify_owner error code missing');

if(sql.includes('caller_not_active'))
  PASS('J-12: caller_not_active error code present');
else FAIL('J-12: caller_not_active error code missing');

if(sql.includes('DEFERRED') && sql.includes('email'))
  PASS('J-13: invitation deferred + documented in migration');
else FAIL('J-13: invitation deferral not documented');

// ── K: Pricing file protection ───────────────────────────────
H('K \u2014 Pricing files untouched');
['data/pricing/engine/engine-test-report.v1.json',
 'data/pricing/shadow/shadow-results.v1.json'].forEach(function(p){
  const full = path.join(ROOT,p);
  if(!fs.existsSync(full)) WARN('K: pricing file not found: '+p);
  else PASS('K: exists (not deleted): '+p);
});

// ── SUMMARY ──────────────────────────────────────────────────
console.log('\n'+'\u2550'.repeat(63));
console.log('Total: '+(pass+fail+warn)+'  \u2705 '+pass+'  \u274c '+fail+'  \u26a0\ufe0f  '+warn);
if(fail>0) { console.error('BP08B CONTRACT TESTS: FAILED ('+fail+' failure(s))'); process.exit(1); }
else if(warn>0){ console.warn('BP08B CONTRACT TESTS: PASSED ('+warn+' warning(s))'); }
else { console.log('BP08B CONTRACT TESTS: PASSED'); }
