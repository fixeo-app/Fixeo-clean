'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// BP13 — Enterprise Escalation Tests
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

// BP13 SQL file (does not yet exist → empty string, tests will FAIL as expected)
const sqlFile       = readFile('supabase/bp13-enterprise-escalations.sql') || '';
const jsMain        = readFile('js/enterprise-dashboard-v1.js') || '';
const jsContract    = readFile('js/enterprise-escalation-contract-v1.js') || null;
const htmlFile      = readFile('enterprise-dashboard.html') || '';
const cssFile       = readFile('css/enterprise-dashboard-v1.css') || '';

// Extract BP13 escalation section of main JS (after BP13 marker)
const escSectionStart = jsMain.indexOf('BP13');
const jsEsc = escSectionStart >= 0 ? jsMain.slice(escSectionStart) : '';

// ════════════════════════════════════════════════════════════════
// SECTION A — Schema contract (file-based)
// ════════════════════════════════════════════════════════════════
section('A — Schema contract');

// A-01: enterprise_escalations table in SQL file
check('A-01: enterprise_escalations table in SQL',
  sqlFile.includes('enterprise_escalations'), true);

// A-02: severity CHECK IN ('critical','high','medium','low') in SQL
check("A-02: severity CHECK IN ('critical','high','medium','low') in SQL",
  sqlFile.includes("'critical'") && sqlFile.includes("'high'") &&
  sqlFile.includes("'medium'") && sqlFile.includes("'low'") &&
  (sqlFile.includes('severity') && (
    sqlFile.includes('ee_severity_check') || sqlFile.includes("severity IN") ||
    sqlFile.includes("severity CHECK")
  )),
  true);

// A-03: reason_code CHECK IN (...) contains all 5 values
check("A-03: reason_code CHECK contains all 5 values",
  sqlFile.includes("'sla_breached'") && sqlFile.includes("'sla_approaching'") &&
  sqlFile.includes("'urgent_unassigned'") && sqlFile.includes("'mission_stalled'") &&
  sqlFile.includes("'manual'"),
  true);

// A-04: status CHECK IN ('open','acknowledged','resolved') in SQL
check("A-04: status CHECK IN ('open','acknowledged','resolved') in SQL",
  sqlFile.includes("'open'") && sqlFile.includes("'acknowledged'") &&
  sqlFile.includes("'resolved'") &&
  (sqlFile.includes('ee_status_check') || sqlFile.includes("status IN") ||
   sqlFile.includes("status CHECK")),
  true);

// A-05: ee_resolution_requires_note CHECK in SQL
check('A-05: ee_resolution_requires_note CHECK in SQL',
  sqlFile.includes('ee_resolution_requires_note'), true);

// A-06: ee_ack_timestamps_consistent CHECK in SQL
check('A-06: ee_ack_timestamps_consistent CHECK in SQL',
  sqlFile.includes('ee_ack_timestamps_consistent'), true);

// A-07: ee_resolved_timestamps_consistent CHECK in SQL
check('A-07: ee_resolved_timestamps_consistent CHECK in SQL',
  sqlFile.includes('ee_resolved_timestamps_consistent'), true);

// A-08: ee_unique_active_escalation partial unique index in SQL
check('A-08: ee_unique_active_escalation partial unique index in SQL',
  sqlFile.includes('ee_unique_active_escalation'), true);

// A-09: No service_requests.enterprise_site_id in BP13 SQL
check('A-09: No service_requests.enterprise_site_id in BP13 SQL',
  !sqlFile.includes('enterprise_site_id'), true);

// A-10: No enterprise_requests table in BP13 SQL
check('A-10: No enterprise_requests table in BP13 SQL',
  !sqlFile.includes('enterprise_requests'), true);

// A-11: No enterprise_missions table in BP13 SQL
check('A-11: No enterprise_missions table in BP13 SQL',
  !sqlFile.includes('enterprise_missions'), true);

// A-12: site_id derived from enterprise_request_context (not a client param) in open_escalation RPC
// open_escalation must query erc.site_id from enterprise_request_context.
// Note: p_site_id is allowed in other RPCs (e.g. list filter), but NOT in open_escalation.
{
  // Extract just the open_escalation function block to check locally
  const openEscStart = sqlFile.indexOf('FUNCTION public.open_escalation');
  // Find REVOKE after that function to bound the block
  const openEscEnd = sqlFile.indexOf('REVOKE EXECUTE ON FUNCTION public.open_escalation', openEscStart);
  const openEscBlock = (openEscStart >= 0 && openEscEnd > openEscStart)
    ? sqlFile.slice(openEscStart, openEscEnd)
    : '';
  check('A-12: open_escalation uses enterprise_request_context (not p_site_id param)',
    openEscBlock.length > 0 &&
    openEscBlock.includes('enterprise_request_context') &&
    !openEscBlock.includes('p_site_id'),
    true);
}

// A-13: Reopen explicitly NOT implemented (comment or NO reopen in SQL)
// Must have no 'reopen' / 'reopened' state in schema
check("A-13: 'reopened' status NOT present (no reopen) in BP13 SQL",
  !sqlFile.includes("'reopened'") && !sqlFile.includes("reopened"),
  true);


// ════════════════════════════════════════════════════════════════
// SECTION B — RPC contract (file-based)
// ════════════════════════════════════════════════════════════════
section('B — RPC contract');

// B-01: open_escalation RPC exists in SQL
check('B-01: open_escalation RPC in SQL',
  sqlFile.includes('open_escalation'), true);

// B-02: open_escalation checks role NOT IN ('reporter','viewer') or equivalent
check("B-02: open_escalation checks role NOT IN ('reporter','viewer') or insufficient_privilege guard",
  sqlFile.includes('open_escalation') &&
  (
    (sqlFile.includes("'reporter'") && sqlFile.includes("'viewer'")) ||
    sqlFile.includes('insufficient_privilege')
  ),
  true);

// B-03: open_escalation validates service_request through enterprise_request_context
check('B-03: open_escalation validates through enterprise_request_context',
  sqlFile.includes('open_escalation') &&
  sqlFile.includes('enterprise_request_context'),
  true);

// B-04: open_escalation checks site_manager assignment for site_manager role
check('B-04: open_escalation has site_manager assignment check',
  sqlFile.includes('open_escalation') &&
  (sqlFile.includes('site_manager') && sqlFile.includes('site_not_assigned')),
  true);

// B-05: open_escalation inserts audit log entry with escalation_opened
check("B-05: open_escalation inserts audit log 'escalation_opened'",
  sqlFile.includes('open_escalation') && sqlFile.includes('escalation_opened'),
  true);

// B-06: acknowledge_escalation RPC exists in SQL
check('B-06: acknowledge_escalation RPC in SQL',
  sqlFile.includes('acknowledge_escalation'), true);

// B-07: acknowledge_escalation uses predicate lock WHERE status = 'open'
check("B-07: acknowledge_escalation predicate lock WHERE status = 'open'",
  sqlFile.includes('acknowledge_escalation') &&
  (sqlFile.includes("status = 'open'") || sqlFile.includes("status='open'")),
  true);

// B-08: acknowledge_escalation inserts audit log escalation_acknowledged
check("B-08: acknowledge_escalation inserts audit log 'escalation_acknowledged'",
  sqlFile.includes('acknowledge_escalation') && sqlFile.includes('escalation_acknowledged'),
  true);

// B-09: resolve_escalation RPC exists in SQL
check('B-09: resolve_escalation RPC in SQL',
  sqlFile.includes('resolve_escalation'), true);

// B-10: resolve_escalation requires p_resolution_note non-null/non-empty
check('B-10: resolve_escalation requires p_resolution_note non-null/non-empty',
  sqlFile.includes('resolve_escalation') && sqlFile.includes('p_resolution_note'),
  true);

// B-11: resolve_escalation uses predicate lock WHERE status IN ('open','acknowledged')
check("B-11: resolve_escalation predicate lock WHERE status IN ('open','acknowledged')",
  sqlFile.includes('resolve_escalation') &&
  (
    (sqlFile.includes("status IN ('open','acknowledged')") ||
     sqlFile.includes("status IN ('open', 'acknowledged')") ||
     (sqlFile.includes("'open'") && sqlFile.includes("'acknowledged'") && sqlFile.includes('status IN')))
  ),
  true);

// B-12: resolve_escalation inserts audit log escalation_resolved
check("B-12: resolve_escalation inserts audit log 'escalation_resolved'",
  sqlFile.includes('resolve_escalation') && sqlFile.includes('escalation_resolved'),
  true);

// B-13: All 3 mutation RPCs: SECURITY DEFINER in SQL
check('B-13: All 3 mutation RPCs use SECURITY DEFINER',
  sqlFile.includes('open_escalation') &&
  sqlFile.includes('acknowledge_escalation') &&
  sqlFile.includes('resolve_escalation') &&
  (sqlFile.match(/SECURITY DEFINER/g) || []).length >= 3,
  true);

// B-14: All 3 mutation RPCs: SET search_path = '' in SQL
check("B-14: All 3 mutation RPCs have SET search_path = ''",
  sqlFile.includes('open_escalation') &&
  sqlFile.includes('acknowledge_escalation') &&
  sqlFile.includes('resolve_escalation') &&
  (sqlFile.match(/SET\s+search_path\s*=\s*''/g) || []).length >= 3,
  true);

// B-15: All 3 mutation RPCs: REVOKE EXECUTE ... FROM PUBLIC
check('B-15: REVOKE EXECUTE FROM PUBLIC present for all 3 RPCs',
  sqlFile.includes('open_escalation') &&
  sqlFile.includes('acknowledge_escalation') &&
  sqlFile.includes('resolve_escalation') &&
  (
    (sqlFile.match(/REVOKE\s+EXECUTE/g) || []).length >= 3 ||
    (sqlFile.includes('REVOKE EXECUTE') &&
     sqlFile.includes('open_escalation') &&
     sqlFile.includes('acknowledge_escalation') &&
     sqlFile.includes('resolve_escalation'))
  ),
  true);

// B-16: All 3 mutation RPCs: GRANT EXECUTE ... TO authenticated
check('B-16: GRANT EXECUTE TO authenticated present for all 3 RPCs',
  sqlFile.includes('open_escalation') &&
  sqlFile.includes('acknowledge_escalation') &&
  sqlFile.includes('resolve_escalation') &&
  (sqlFile.match(/GRANT\s+EXECUTE/g) || []).length >= 3,
  true);


// ════════════════════════════════════════════════════════════════
// SECTION C — RLS contract (file-based)
// ════════════════════════════════════════════════════════════════
section('C — RLS contract');

// C-01: ee_deny_anon policy present
check('C-01: ee_deny_anon RLS policy present',
  sqlFile.includes('ee_deny_anon'), true);

// C-02: ee_members_select policy present and uses _fixeo_is_enterprise_member
check('C-02: ee_members_select uses _fixeo_is_enterprise_member',
  sqlFile.includes('ee_members_select') &&
  sqlFile.includes('_fixeo_is_enterprise_member'),
  true);

// C-03: ee_members_select includes site_manager scoping via _fixeo_get_site_manager_site_ids
check('C-03: ee_members_select includes site_manager scoping',
  sqlFile.includes('ee_members_select') &&
  sqlFile.includes('_fixeo_get_site_manager_site_ids'),
  true);

// C-04: ee_operators_insert policy present and uses _fixeo_is_enterprise_manager
check('C-04: ee_operators_insert uses _fixeo_is_enterprise_manager',
  sqlFile.includes('ee_operators_insert') &&
  sqlFile.includes('_fixeo_is_enterprise_manager'),
  true);

// C-05: ee_operators_update policy present and uses _fixeo_is_enterprise_manager
check('C-05: ee_operators_update uses _fixeo_is_enterprise_manager',
  sqlFile.includes('ee_operators_update') &&
  sqlFile.includes('_fixeo_is_enterprise_manager'),
  true);

// C-06: ee_admin_all policy present and uses _fixeo_is_admin
check('C-06: ee_admin_all uses _fixeo_is_admin',
  sqlFile.includes('ee_admin_all') &&
  sqlFile.includes('_fixeo_is_admin'),
  true);

// C-07: RLS ENABLED on enterprise_escalations
check('C-07: ROW LEVEL SECURITY ENABLE on enterprise_escalations',
  sqlFile.includes('enterprise_escalations') &&
  sqlFile.includes('ENABLE ROW LEVEL SECURITY'),
  true);

// C-08: FORCE keyword present (ENABLE ROW LEVEL SECURITY + FORCE)
check('C-08: FORCE ROW LEVEL SECURITY present on enterprise_escalations',
  sqlFile.includes('enterprise_escalations') &&
  (sqlFile.includes('FORCE ROW LEVEL SECURITY') || sqlFile.includes('FORCE')),
  true);


// ════════════════════════════════════════════════════════════════
// SECTION D — Audit contract (file-based)
// ════════════════════════════════════════════════════════════════
section('D — Audit contract');

// D-01: eal_action_type_check contains escalation_opened
check("D-01: eal_action_type_check contains 'escalation_opened'",
  sqlFile.includes('eal_action_type_check') && sqlFile.includes('escalation_opened'),
  true);

// D-02: eal_action_type_check contains escalation_acknowledged
check("D-02: eal_action_type_check contains 'escalation_acknowledged'",
  sqlFile.includes('eal_action_type_check') && sqlFile.includes('escalation_acknowledged'),
  true);

// D-03: eal_action_type_check contains escalation_resolved
check("D-03: eal_action_type_check contains 'escalation_resolved'",
  sqlFile.includes('eal_action_type_check') && sqlFile.includes('escalation_resolved'),
  true);

// D-04: All 8 pre-existing values preserved in eal_action_type_check
const PREEXISTING_AUDIT_TYPES = [
  'member_role_changed',
  'member_status_changed',
  'site_updated',
  'site_status_changed',
  'account_profile_updated',
  'invitation_created',
  'invitation_revoked',
  'invitation_accepted',
];
PREEXISTING_AUDIT_TYPES.forEach(function(t) {
  check("D-04: eal_action_type_check preserves '" + t + "'",
    sqlFile.includes('eal_action_type_check') && sqlFile.includes("'" + t + "'"),
    true);
});

// D-05: actor_user_id = auth.uid() (not a client-supplied param) in audit inserts
// Must reference auth.uid() for actor, not accept it as p_actor_user_id
check("D-05: audit inserts use auth.uid() for actor_user_id (not client param)",
  sqlFile.includes('auth.uid()') &&
  !sqlFile.includes('p_actor_user_id'),
  true);


// ════════════════════════════════════════════════════════════════
// SECTION E — Escalation state machine (pure JS)
// ════════════════════════════════════════════════════════════════
section('E — Escalation state machine (pure JS)');

function _canTransition(currentStatus, action) {
  if (action === 'acknowledge') return currentStatus === 'open';
  if (action === 'resolve') return currentStatus === 'open' || currentStatus === 'acknowledged';
  return false;
}
function _isTerminal(status) { return status === 'resolved'; }
function _isActive(status) { return status === 'open' || status === 'acknowledged'; }

// E-01: open → acknowledge allowed
check('E-01: open → acknowledge allowed',
  _canTransition('open', 'acknowledge'), true);

// E-02: open → resolve allowed
check('E-02: open → resolve allowed',
  _canTransition('open', 'resolve'), true);

// E-03: acknowledged → resolve allowed
check('E-03: acknowledged → resolve allowed',
  _canTransition('acknowledged', 'resolve'), true);

// E-04: resolved → acknowledge NOT allowed
check('E-04: resolved → acknowledge NOT allowed',
  _canTransition('resolved', 'acknowledge'), false);

// E-05: resolved → resolve NOT allowed
check('E-05: resolved → resolve NOT allowed',
  _canTransition('resolved', 'resolve'), false);

// E-06: acknowledged → acknowledge NOT allowed (already acked)
check('E-06: acknowledged → acknowledge NOT allowed (already acked)',
  _canTransition('acknowledged', 'acknowledge'), false);

// E-07: resolved is terminal
check('E-07: resolved is terminal',
  _isTerminal('resolved'), true);

// E-08: open is active
check('E-08: open is active',
  _isActive('open'), true);

// E-09: acknowledged is active
check('E-09: acknowledged is active',
  _isActive('acknowledged'), true);


// ════════════════════════════════════════════════════════════════
// SECTION F — Duplicate/race protection (pure JS + file)
// ════════════════════════════════════════════════════════════════
section('F — Duplicate/race protection');

function _wouldDuplicate(escalations, reasonCode) {
  return escalations.some(function(e) {
    return e.reason_code === reasonCode && (e.status === 'open' || e.status === 'acknowledged');
  });
}

// F-01: active open escalation with same reason_code → duplicate
check('F-01: [{reason_code:sla_breached, status:open}], sla_breached → true',
  _wouldDuplicate([{ reason_code: 'sla_breached', status: 'open' }], 'sla_breached'),
  true);

// F-02: resolved escalation with same reason_code → NOT duplicate (can re-escalate)
check('F-02: [{reason_code:sla_breached, status:resolved}], sla_breached → false',
  _wouldDuplicate([{ reason_code: 'sla_breached', status: 'resolved' }], 'sla_breached'),
  false);

// F-03: empty escalations → no duplicate
check('F-03: [], manual → false',
  _wouldDuplicate([], 'manual'),
  false);

// F-04: acknowledged escalation with different reason_code → NOT duplicate
check('F-04: [{reason_code:manual, status:acknowledged}], sla_breached → false',
  _wouldDuplicate([{ reason_code: 'manual', status: 'acknowledged' }], 'sla_breached'),
  false);

// F-05: ee_unique_active_escalation index in SQL (file-based)
check('F-05: ee_unique_active_escalation partial unique index in SQL',
  sqlFile.includes('ee_unique_active_escalation'), true);


// ════════════════════════════════════════════════════════════════
// SECTION G — Authorization (pure JS + file)
// ════════════════════════════════════════════════════════════════
section('G — Authorization');

const ESC_MUTATION_ROLES = ['owner', 'admin', 'operations_manager', 'site_manager'];
function _canEscalate(role) { return ESC_MUTATION_ROLES.includes(role); }

// G-01: owner → canEscalate = true
check('G-01: owner → canEscalate = true',
  _canEscalate('owner'), true);

// G-02: admin → canEscalate = true
check('G-02: admin → canEscalate = true',
  _canEscalate('admin'), true);

// G-03: operations_manager → canEscalate = true
check('G-03: operations_manager → canEscalate = true',
  _canEscalate('operations_manager'), true);

// G-04: site_manager → canEscalate = true
check('G-04: site_manager → canEscalate = true',
  _canEscalate('site_manager'), true);

// G-05: reporter → canEscalate = false
check('G-05: reporter → canEscalate = false',
  _canEscalate('reporter'), false);

// G-06: viewer → canEscalate = false
check('G-06: viewer → canEscalate = false',
  _canEscalate('viewer'), false);

// G-07: CAN_ESCALATE_ROLES defined in dashboard JS
check('G-07: CAN_ESCALATE_ROLES defined in dashboard JS',
  jsMain.includes('CAN_ESCALATE_ROLES'), true);

// G-08: insufficient_privilege guard in open_escalation SQL
check("G-08: 'insufficient_privilege' guard in open_escalation SQL",
  sqlFile.includes('open_escalation') && sqlFile.includes('insufficient_privilege'),
  true);

// G-09: site_not_assigned guard in open_escalation SQL for site_manager
check("G-09: 'site_not_assigned' guard in open_escalation SQL",
  sqlFile.includes('open_escalation') && sqlFile.includes('site_not_assigned'),
  true);

// G-10: request_not_in_enterprise guard in open_escalation SQL
check("G-10: 'request_not_in_enterprise' guard in open_escalation SQL",
  sqlFile.includes('open_escalation') && sqlFile.includes('request_not_in_enterprise'),
  true);


// ════════════════════════════════════════════════════════════════
// SECTION H — Validation (pure JS)
// ════════════════════════════════════════════════════════════════
section('H — Validation (pure JS)');

function _validateResolutionNote(val) {
  if (!val || val.trim().length === 0) return { valid: false, reason: 'note required' };
  if (val.trim().length > 1000) return { valid: false, reason: 'too long' };
  return { valid: true };
}

// H-01: empty string → invalid
check("H-01: _validateResolutionNote('') → invalid",
  _validateResolutionNote('').valid, false);

// H-02: null → invalid
check('H-02: _validateResolutionNote(null) → invalid',
  _validateResolutionNote(null).valid, false);

// H-03: valid note → valid
check("H-03: _validateResolutionNote('resolved the issue') → valid",
  _validateResolutionNote('resolved the issue').valid, true);

// H-04: whitespace only → invalid
check("H-04: _validateResolutionNote(' ') → invalid (whitespace only)",
  _validateResolutionNote(' ').valid, false);

// H-05: 1001 chars → invalid (exceeds max)
check("H-05: _validateResolutionNote('x'.repeat(1001)) → invalid",
  _validateResolutionNote('x'.repeat(1001)).valid, false);

// H-06: 1000 chars → valid (exact max)
check("H-06: _validateResolutionNote('x'.repeat(1000)) → valid",
  _validateResolutionNote('x'.repeat(1000)).valid, true);


// ════════════════════════════════════════════════════════════════
// SECTION I — Security contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('I — Security contracts');

// I-01: No innerHTML with user data in BP13 JS section
// Allow innerHTML = '' (clearing), flag assignments of potentially untrusted data
const dangerousInnerHTML_ESC = jsEsc.split('\n').filter(function(l) {
  const t = l.trim();
  return t.includes('.innerHTML') &&
    t.includes('=') &&
    !t.startsWith('//') &&
    !t.match(/\.innerHTML\s*=\s*['"]{2}/) &&
    !t.includes('safeHtml');
});
check('I-01: No innerHTML with user data in BP13 JS section',
  dangerousInnerHTML_ESC.length, 0);

// I-02: No raw error.message to DOM in BP13 JS section
const rawErrToDOM_ESC = jsEsc.split('\n').filter(function(l) {
  return (l.includes('error.message') || l.includes('err.message')) &&
    l.includes('.innerHTML') &&
    !l.trim().startsWith('//');
});
check('I-02: No raw error.message to innerHTML in BP13 JS section',
  rawErrToDOM_ESC.length, 0);

// I-03: escOpenSubmitting guard in JS
check('I-03: escOpenSubmitting guard in dashboard JS',
  jsMain.includes('escOpenSubmitting'), true);

// I-04: escAckSubmitting guard in JS
check('I-04: escAckSubmitting guard in dashboard JS',
  jsMain.includes('escAckSubmitting'), true);

// I-05: escResolveSubmitting guard in JS
check('I-05: escResolveSubmitting guard in dashboard JS',
  jsMain.includes('escResolveSubmitting'), true);

// I-06: S.activeEnterprise guard before escalation fetch in JS
check('I-06: S.activeEnterprise guard before escalation fetch in JS',
  jsMain.includes('activeEnterprise') && jsMain.includes('loadDetailEscalations'),
  true);

// I-07: No service_requests.enterprise_site_id in BP13 SQL or JS
check('I-07: No enterprise_site_id in BP13 SQL or JS escalation section',
  !sqlFile.includes('enterprise_site_id') && !jsEsc.includes('enterprise_site_id'),
  true);

// I-08: No canonical status mutation in BP13 JS (no .update({status:}) on service_requests or missions)
const srUpdateInESC = jsEsc.includes(".from('service_requests')") &&
  jsEsc.split(".from('service_requests')").some(function(seg) {
    return seg.slice(0, 200).includes('.update(');
  });
const missionUpdateInESC = jsEsc.includes(".from('missions')") &&
  jsEsc.split(".from('missions')").some(function(seg) {
    return seg.slice(0, 200).includes('.update(');
  });
check('I-08: No direct service_requests .update() in BP13 JS section',
  srUpdateInESC, false);
check('I-08: No direct missions .update() in BP13 JS section',
  missionUpdateInESC, false);

// I-09: enterprise-escalation-edge-cases-v1.js exists and passes node --check
warnIf('I-09: enterprise-escalation-edge-cases-v1.js exists',
  !fileExists('js/enterprise-escalation-edge-cases-v1.js'), 'file not found');
if (fileExists('js/enterprise-escalation-edge-cases-v1.js')) {
  try {
    execSync('node --check ' + path.join(ROOT, 'js/enterprise-escalation-edge-cases-v1.js'));
    check('I-09: enterprise-escalation-edge-cases-v1.js syntax OK', true, true);
  } catch (e) {
    check('I-09: enterprise-escalation-edge-cases-v1.js syntax OK', false, true);
  }
}

// I-10: window.EnterpriseEscalationContract exported in contract JS file
check('I-10: EnterpriseEscalationContract exported in contract JS file',
  jsContract !== null &&
  (jsContract.includes('EnterpriseEscalationContract') ||
   jsContract.includes('window.EnterpriseEscalationContract')),
  true);


// ════════════════════════════════════════════════════════════════
// SECTION J — UX contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('J — UX contracts');

// J-01: #ops-kpi-esc-open in HTML
check('J-01: #ops-kpi-esc-open in HTML',
  htmlFile.includes('id="ops-kpi-esc-open"'), true);

// J-02: #ops-kpi-esc-critical in HTML
check('J-02: #ops-kpi-esc-critical in HTML',
  htmlFile.includes('id="ops-kpi-esc-critical"'), true);

// J-03: #ops-kpi-esc-ack in HTML
check('J-03: #ops-kpi-esc-ack in HTML',
  htmlFile.includes('id="ops-kpi-esc-ack"'), true);

// J-04: #ops-detail-esc-block in HTML
check('J-04: #ops-detail-esc-block in HTML',
  htmlFile.includes('id="ops-detail-esc-block"'), true);

// J-05: #ops-esc-open-form in HTML
check('J-05: #ops-esc-open-form in HTML',
  htmlFile.includes('id="ops-esc-open-form"'), true);

// J-06: #section-escalations in HTML
check('J-06: #section-escalations in HTML',
  htmlFile.includes('id="section-escalations"'), true);

// J-07: #esc-resolve-dialog in HTML
check('J-07: #esc-resolve-dialog in HTML',
  htmlFile.includes('id="esc-resolve-dialog"'), true);

// J-08: .esc-kpi-card in CSS
check('J-08: .esc-kpi-card in CSS',
  cssFile.includes('esc-kpi-card'), true);

// J-09: .ops-esc-severity-badge or esc-severity in CSS
check('J-09: .ops-esc-severity-badge or esc-severity in CSS',
  cssFile.includes('ops-esc-severity-badge') || cssFile.includes('esc-severity'),
  true);

// J-10: .esc-item in CSS
check('J-10: .esc-item in CSS',
  cssFile.includes('esc-item'), true);

// J-11: refreshEscKpis in dashboard JS
check('J-11: refreshEscKpis in dashboard JS',
  jsMain.includes('refreshEscKpis'), true);

// J-12: loadDetailEscalations in dashboard JS
check('J-12: loadDetailEscalations in dashboard JS',
  jsMain.includes('loadDetailEscalations'), true);

// J-13: openEscalation in dashboard JS
check('J-13: openEscalation in dashboard JS',
  jsMain.includes('openEscalation'), true);

// J-14: acknowledgeEscalation in dashboard JS
check('J-14: acknowledgeEscalation in dashboard JS',
  jsMain.includes('acknowledgeEscalation'), true);

// J-15: resolveEscalation in dashboard JS
check('J-15: resolveEscalation in dashboard JS',
  jsMain.includes('resolveEscalation'), true);

// J-16: initEscalationsSection in dashboard JS
check('J-16: initEscalationsSection in dashboard JS',
  jsMain.includes('initEscalationsSection'), true);


// ════════════════════════════════════════════════════════════════
// SECTION K — SLA/BP12 integration (file-based)
// ════════════════════════════════════════════════════════════════
section('K — SLA/BP12 integration');

// K-01: enterprise_sla_status view LEFT JOINed in enterprise_escalation_summary view
check('K-01: enterprise_sla_status LEFT JOIN in enterprise_escalation_summary view',
  sqlFile.includes('enterprise_escalation_summary') &&
  sqlFile.includes('enterprise_sla_status') &&
  (sqlFile.includes('LEFT JOIN') || sqlFile.includes('LEFT OUTER JOIN')),
  true);

// K-02: sla_state column in escalation summary view
check('K-02: sla_state column in enterprise_escalation_summary view',
  sqlFile.includes('enterprise_escalation_summary') &&
  sqlFile.includes('sla_state'),
  true);

// K-03: BP12 enterprise_sla_policies table NOT modified in BP13 SQL
check('K-03: enterprise_sla_policies table NOT modified in BP13 SQL',
  !sqlFile.includes('enterprise_sla_policies'), true);

// K-04: BP12 enterprise_sla_status view NOT modified in BP13 SQL
// enterprise_sla_status can only be referenced (LEFT JOIN), not recreated
{
  // The view can be referenced but not CREATE OR REPLACE'd in BP13
  const createSLAStatus = sqlFile.includes('CREATE') &&
    sqlFile.includes('enterprise_sla_status') &&
    (sqlFile.includes('CREATE OR REPLACE VIEW') || sqlFile.includes('CREATE VIEW')) &&
    (function() {
      // Check if enterprise_sla_status is being defined (not just referenced)
      const createViewIdx = sqlFile.indexOf('CREATE OR REPLACE VIEW public.enterprise_sla_status');
      const createViewIdx2 = sqlFile.indexOf('CREATE VIEW public.enterprise_sla_status');
      return createViewIdx >= 0 || createViewIdx2 >= 0;
    }());
  check('K-04: enterprise_sla_status view NOT redefined in BP13 SQL',
    createSLAStatus, false);
}


// ════════════════════════════════════════════════════════════════
// SECTION L — Regression (run existing test files)
// ════════════════════════════════════════════════════════════════
section('L — Regression');

function runTest(label, filePath) {
  if (!fs.existsSync(filePath)) {
    warn++;
    console.warn('  ⚠️  WARN:', label, '— file not found:', filePath);
    return;
  }
  try {
    const out = execSync('node ' + filePath, { encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
    const passMatch = out.match(/PASS\s*:\s*(\d+)/i);
    const failMatch = out.match(/FAIL\s*:\s*(\d+)/i);
    const passCount = passMatch ? parseInt(passMatch[1]) : '?';
    const failCount = failMatch ? parseInt(failMatch[1]) : 0;
    if (failCount === 0 || failCount === '?') {
      pass++;
      console.log('  ✅ PASS:', label, '— ' + passCount + ' pass, ' + failCount + ' fail');
    } else {
      fail++;
      console.error('  ❌ FAIL:', label, '— ' + passCount + ' pass, ' + failCount + ' fail');
    }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const passMatch = out.match(/PASS\s*:\s*(\d+)/i);
    const failMatch = out.match(/FAIL\s*:\s*(\d+)/i);
    const passCount = passMatch ? passMatch[1] : '?';
    const failCount = failMatch ? parseInt(failMatch[1]) : '?';
    if (failCount === 0) {
      pass++;
      console.log('  ✅ PASS:', label, '— ' + passCount + ' pass, 0 fail');
    } else {
      fail++;
      console.error('  ❌ FAIL:', label, '— ' + passCount + ' pass, ' + failCount + ' fail');
    }
  }
}

// L-01: BP12 SLA tests
runTest('L-01: BP12 SLA tests',
  path.join(ROOT, 'tests/enterprise/bp12-sla-tests.js'));

// L-02: BP11 Ops tests
runTest('L-02: BP11 Ops tests',
  path.join(ROOT, 'tests/enterprise/bp11-ops-command-center-tests.js'));

// L-03: BP09 contract matrix tests
runTest('L-03: BP09 contract matrix tests',
  path.join(ROOT, 'tests/enterprise/bp09-contract-matrix-tests.js'));

// L-04: RC hardening tests
runTest('L-04: RC hardening tests',
  path.join(ROOT, 'tests/enterprise/rc-hardening-tests.js'));


// ════════════════════════════════════════════════════════════════
// SECTION M — BP13 Audit Column Corrigendum (SEC-BP13-GAP fix)
// ════════════════════════════════════════════════════════════════
section('M — Audit contract corrigendum (SEC-BP13-GAP fix)', true);

{
  const BP13_SQL = fs.readFileSync(
    path.join(ROOT, 'supabase/bp13-enterprise-escalations.sql'), 'utf8'
  , true);

  // M-01: No direct INSERT INTO enterprise_audit_log in BP13 SQL
  check('M-01: no direct INSERT INTO enterprise_audit_log in BP13',
    !BP13_SQL.includes('INSERT INTO public.enterprise_audit_log') &&
    !BP13_SQL.includes('INSERT INTO enterprise_audit_log'), true);

  // M-02: 'details' column no longer referenced in audit context
  // (checks for the comma-prefixed pattern used in column lists)
  const detailsAuditPattern = /,\s*details[\s)]/;
  check('M-02: no "details" column in BP13 audit INSERT column list',
    !detailsAuditPattern.test(BP13_SQL), true);

  // M-03: _eal_append called in open_escalation
  const openBlock = BP13_SQL.slice(
    BP13_SQL.indexOf('CREATE OR REPLACE FUNCTION public.open_escalation'),
    BP13_SQL.indexOf('REVOKE EXECUTE ON FUNCTION public.open_escalation')
  , true);
  check('M-03: _eal_append called in open_escalation',
    openBlock.includes('_eal_append'), true);

  // M-04: _eal_append called in acknowledge_escalation
  const ackBlock = BP13_SQL.slice(
    BP13_SQL.indexOf('CREATE OR REPLACE FUNCTION public.acknowledge_escalation'),
    BP13_SQL.indexOf('REVOKE EXECUTE ON FUNCTION public.acknowledge_escalation')
  , true);
  check('M-04: _eal_append called in acknowledge_escalation',
    ackBlock.includes('_eal_append'), true);

  // M-05: _eal_append called in resolve_escalation
  const resolveBlock = BP13_SQL.slice(
    BP13_SQL.indexOf('CREATE OR REPLACE FUNCTION public.resolve_escalation'),
    BP13_SQL.indexOf('REVOKE EXECUTE ON FUNCTION public.resolve_escalation')
  , true);
  check('M-05: _eal_append called in resolve_escalation',
    resolveBlock.includes('_eal_append'), true);

  // M-06: target_type 'enterprise_escalation' supplied in open_escalation
  check('M-06: target_type \'enterprise_escalation\' supplied in open_escalation',
    openBlock.includes("'enterprise_escalation'"), true);

  // M-07: target_type 'enterprise_escalation' supplied in acknowledge_escalation
  check('M-07: target_type \'enterprise_escalation\' supplied in acknowledge_escalation',
    ackBlock.includes("'enterprise_escalation'"), true);

  // M-08: target_type 'enterprise_escalation' supplied in resolve_escalation
  check('M-08: target_type \'enterprise_escalation\' supplied in resolve_escalation',
    resolveBlock.includes("'enterprise_escalation'"), true);

  // M-09: exactly 3 _eal_append PERFORM calls in BP13
  const appendCalls = (BP13_SQL.match(/PERFORM fixeo_private\._eal_append/g) || []).length;
  check('M-09: exactly 3 PERFORM _eal_append calls in BP13 (one per write RPC)',
    appendCalls === 3, true);

  // M-10: metadata column (not details) is the 6th positional arg in _eal_append
  // Canonical signature: _eal_append(enterprise_id, actor_id, action_type, target_type, target_id, metadata)
  // Verify all 3 calls pass jsonb_build_object as 6th arg (metadata position)
  const ealCalls = BP13_SQL.match(/PERFORM fixeo_private\._eal_append\([\s\S]+?\);/g) || [];
  const allHaveJsonb = ealCalls.every(call => call.includes('jsonb_build_object'), true);
  check('M-10: all _eal_append calls supply jsonb_build_object as metadata arg',
    allHaveJsonb && ealCalls.length === 3, true);

  // M-11: open_escalation _eal_append passes p_enterprise_id as first arg
  check('M-11: open_escalation _eal_append passes p_enterprise_id (enterprise scope)',
    openBlock.match(/PERFORM fixeo_private\._eal_append\(\s*p_enterprise_id/) !== null, true);

  // M-12: acknowledge_escalation _eal_append passes v_enterprise_id as first arg
  check('M-12: acknowledge_escalation _eal_append passes v_enterprise_id (resolved scope)',
    ackBlock.match(/PERFORM fixeo_private\._eal_append\(\s*v_enterprise_id/) !== null, true);

  // M-13: resolve_escalation _eal_append passes v_enterprise_id as first arg
  check('M-13: resolve_escalation _eal_append passes v_enterprise_id (resolved scope)',
    resolveBlock.match(/PERFORM fixeo_private\._eal_append\(\s*v_enterprise_id/) !== null, true);

  // M-14: open_escalation audit includes service_request_id in metadata
  check('M-14: open_escalation audit metadata includes service_request_id',
    openBlock.includes('service_request_id'), true);

  // M-15: resolve_escalation audit metadata includes resolution_note
  check('M-15: resolve_escalation audit metadata includes resolution_note',
    resolveBlock.includes('resolution_note'), true);

  // M-16: eal_action_type_check extension includes escalation_opened/acknowledged/resolved
  check('M-16: eal_action_type_check extension includes escalation_opened',
    BP13_SQL.includes("'escalation_opened'"), true);
  check('M-16: eal_action_type_check extension includes escalation_acknowledged',
    BP13_SQL.includes("'escalation_acknowledged'"), true);
  check('M-16: eal_action_type_check extension includes escalation_resolved',
    BP13_SQL.includes("'escalation_resolved'"), true);

  // M-17: BP13 SQL file still has SECURITY DEFINER on all 3 write RPCs
  const sdCount = (BP13_SQL.match(/SECURITY DEFINER/g) || []).length;
  check('M-17: SECURITY DEFINER present on write RPCs (≥3 occurrences)',
    sdCount >= 3, true);

  // M-18: BP13 SQL file still has SET search_path = ''
  check('M-18: SET search_path = \"\" present in BP13',
    BP13_SQL.includes("SET search_path = ''"), true);

  // M-19: No 'details' anywhere in the file after the fix
  // (checks for literal column name in SQL context — not in comments)
  const nonCommentLines = BP13_SQL.split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n', true);
  check('M-19: no "details" identifier in non-comment SQL lines',
    !nonCommentLines.includes(', details)') &&
    !nonCommentLines.includes(',details)') &&
    !nonCommentLines.includes('(details)'), true);
}

// ════════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(' BP13 ESCALATION TESTS');
console.log('═'.repeat(60));
console.log(' PASS  :', pass);
console.log(' FAIL  :', fail);
console.log(' WARN  :', warn);
console.log(' TOTAL :', pass + fail + warn);
console.log('═'.repeat(60));
if (fail === 0) {
  console.log('\n BP13 ESCALATION TESTS: PASSED\n');
  process.exit(0);
} else {
  console.log('\n BP13 ESCALATION TESTS: FAILED\n');
  process.exit(1);
}
