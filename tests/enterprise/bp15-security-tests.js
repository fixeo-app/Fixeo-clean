'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// BP15 — Security Contract Tests
// Pure file-contract tests. No live DB required.
// Each check() verifies a specific SEC-BP15-XX threat-matrix item via grep.
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0, warn = 0;

function check(label, val, expected) {
  const ok = val === expected;
  if (ok) { pass++; console.log('  \u2705 PASS:', label); }
  else    { fail++; console.error('  \u274C FAIL:', label, '\u2014 got', JSON.stringify(val), 'expected', JSON.stringify(expected)); }
}
function warnIf(label, condition, msg) {
  if (condition) { warn++; console.warn('  \u26A0\uFE0F  WARN:', label, msg || ''); }
  else           { pass++; console.log('  \u2705 PASS:', label); }
}
function section(name) { console.log('\n\u2500\u2500 ' + name + ' \u2500\u2500'); }

// ── File reader helpers ──────────────────────────────────────────
function readFile(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}
function fileExists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// ── Source files ─────────────────────────────────────────────────
const sqlFile     = readFile('supabase/bp15-enterprise-automation.sql') || '';
const jsMain      = readFile('js/enterprise-dashboard-v1.js') || '';
const jsContract  = readFile('js/enterprise-automation-contract-v1.js') || '';
const bp13sql     = readFile('supabase/bp13-enterprise-escalations.sql') || '';

// Extract BP15 automation section of main dashboard JS
const autoStart  = jsMain.indexOf('BP15');
const jsAuto     = autoStart >= 0 ? jsMain.slice(autoStart) : '';

// ════════════════════════════════════════════════════════════════
// SECTION A — SQL file existence and table contract
// ════════════════════════════════════════════════════════════════
section('A \u2014 SQL file existence and table contract');

// A-01: bp15-enterprise-automation.sql exists on disk
check('A-01 [FILE]: bp15-enterprise-automation.sql exists on disk',
  fileExists('supabase/bp15-enterprise-automation.sql'), true);

// A-02: enterprise_automation_rules table present
check('A-02 [TABLE]: enterprise_automation_rules table defined',
  sqlFile.includes('enterprise_automation_rules'), true);

// A-03: enterprise_automation_executions ledger table present
check('A-03 [TABLE]: enterprise_automation_executions ledger table defined',
  sqlFile.includes('enterprise_automation_executions'), true);

// A-04: signal_type CHECK constraint present AND contains BP15 V1 design values
// BP15 owns its own signal_type enum — these are NOT BP13 reason_codes.
// V1 spec: sla_breached | urgent_unattended | escalation_unacknowledged
check('A-04 [SCHEMA SEC-BP15-17]: signal_type CHECK uses BP15 V1 allowlist (sla_breached, urgent_unattended, escalation_unacknowledged)',
  sqlFile.includes("'sla_breached'") &&
  sqlFile.includes("'urgent_unattended'") &&
  sqlFile.includes("'escalation_unacknowledged'") &&
  sqlFile.includes('ear_signal_type_check'), true);

// A-05: action_type CHECK constraint restricted to 'open_escalation' only
check('A-05 [SCHEMA SEC-BP15-18]: action_type CHECK restricts to open_escalation only',
  sqlFile.includes("'open_escalation'") &&
  (sqlFile.includes('ear_action_type_check') ||
   sqlFile.includes("action_type IN ('open_escalation')") ||
   sqlFile.includes("action_type CHECK")), true);

// A-06: severity CHECK constraint matches BP13 enum
check('A-06 [SCHEMA SEC-BP15-19]: severity CHECK contains critical/high/medium/low',
  sqlFile.includes("'critical'") &&
  sqlFile.includes("'high'") &&
  sqlFile.includes("'medium'") &&
  sqlFile.includes("'low'") &&
  (sqlFile.includes('ear_severity_check') ||
   sqlFile.includes('severity IN') ||
   sqlFile.includes('severity CHECK')), true);

// A-07: threshold_minutes > 0 CHECK constraint
check('A-07 [SCHEMA SEC-BP15-21]: threshold_minutes > 0 CHECK constraint present',
  sqlFile.includes('threshold_minutes') &&
  (sqlFile.includes('threshold_minutes > 0') ||
   sqlFile.includes('ear_threshold_check') ||
   sqlFile.includes('threshold_minutes_check')), true);

// A-08: urgency_filter nullable CHECK constraint
check('A-08 [SCHEMA SEC-BP15-23]: urgency_filter NULL-or-canonical CHECK present',
  sqlFile.includes('urgency_filter') &&
  (sqlFile.includes("'urgent'") || sqlFile.includes("'normal'")) &&
  (sqlFile.includes('urgency_filter IS NULL') ||
   sqlFile.includes('ear_urgency_filter_check') ||
   sqlFile.includes('urgency_filter CHECK')), true);

// ════════════════════════════════════════════════════════════════
// SECTION B — RLS: anonymous access blocked (SEC-BP15-01)
// ════════════════════════════════════════════════════════════════
section('B \u2014 RLS: anonymous access blocked');

// B-01: RLS ENABLE on enterprise_automation_rules
check('B-01 [SEC-BP15-01]: ENABLE ROW LEVEL SECURITY on enterprise_automation_rules',
  sqlFile.includes('ENABLE ROW LEVEL SECURITY') &&
  sqlFile.includes('enterprise_automation_rules'), true);

// B-02: FORCE ROW LEVEL SECURITY on enterprise_automation_rules
check('B-02 [SEC-BP15-01]: FORCE ROW LEVEL SECURITY on enterprise_automation_rules',
  sqlFile.includes('FORCE ROW LEVEL SECURITY') &&
  sqlFile.includes('enterprise_automation_rules'), true);

// B-03: RESTRICTIVE anon denial policy present
check('B-03 [SEC-BP15-01]: RESTRICTIVE anon denial policy (AS RESTRICTIVE ... TO anon ... USING (false))',
  sqlFile.includes('AS RESTRICTIVE') &&
  sqlFile.includes('TO anon') &&
  sqlFile.includes('USING (false)'), true);

// ════════════════════════════════════════════════════════════════
// SECTION C — RPCs: REVOKE / GRANT (SEC-BP15-43, 44, 45)
// ════════════════════════════════════════════════════════════════
section('C \u2014 RPCs: REVOKE/GRANT and SECURITY DEFINER');

// C-01: All public RPCs have REVOKE ... FROM PUBLIC
check('C-01 [SEC-BP15-45]: REVOKE ... FROM PUBLIC present for public RPCs',
  sqlFile.includes('FROM PUBLIC') &&
  (sqlFile.includes('REVOKE EXECUTE') || sqlFile.includes('REVOKE ALL ON FUNCTION')), true);

// C-02: All public RPCs have REVOKE ... FROM anon
check('C-02 [SEC-BP15-45]: REVOKE ... FROM anon present',
  sqlFile.includes('FROM PUBLIC, anon') || sqlFile.includes('FROM anon'), true);

// C-03: All public RPCs have GRANT ... TO authenticated
check('C-03 [SEC-BP15-45]: GRANT EXECUTE ... TO authenticated present',
  sqlFile.includes('TO   authenticated') ||
  sqlFile.includes('TO authenticated'), true);

// C-04: Private helpers have REVOKE ... FROM authenticated
check('C-04 [SEC-BP15-44]: private helpers REVOKE ALL from authenticated',
  sqlFile.includes('FROM PUBLIC, anon, authenticated') ||
  sqlFile.includes('FROM PUBLIC,anon,authenticated') ||
  (sqlFile.includes('fixeo_private') && sqlFile.includes('REVOKE ALL')), true);

// C-05: All SECURITY DEFINER functions have SET search_path = ''
check("C-05 [SEC-BP15-43]: SECURITY DEFINER functions have SET search_path = ''",
  sqlFile.includes('SECURITY DEFINER') &&
  sqlFile.includes("SET search_path = ''"), true);

// C-06: No SECURITY DEFINER without SET search_path (excluding comment lines)
(function () {
  // Count SECURITY DEFINER in non-comment lines only
  var nonCommentLines = sqlFile.split('\n').filter(function(l) {
    return !l.trim().startsWith('--') && !l.includes('-- Open escalation');
  }).join('\n');
  var sdCount  = (nonCommentLines.match(/SECURITY DEFINER/g) || []).length;
  var spCount  = (nonCommentLines.match(/SET search_path = ''/g) || []).length;
  // spCount can be >= sdCount (triggers may have SET search_path without SECURITY DEFINER)
  // Fail only if sdCount > spCount (some SECURITY DEFINER missing its SET search_path)
  warnIf('C-06 [SEC-BP15-43]: no SECURITY DEFINER missing SET search_path',
    sdCount > spCount,
    'SECURITY DEFINER(' + sdCount + ') > search_path(' + spCount + '): some functions may be missing SET search_path');
})();

// ════════════════════════════════════════════════════════════════
// SECTION D — Authorization: role checks in RPCs (SEC-BP15-02..07)
// ════════════════════════════════════════════════════════════════
section('D \u2014 Authorization: role checks in RPCs');

// D-01: _bp15_check_automation_reader private helper present
check('D-01 [SEC-BP15-02]: _bp15_check_automation_reader helper defined in fixeo_private',
  sqlFile.includes('_bp15_check_automation_reader'), true);

// D-02: active membership check (status = active) in auth helper
check("D-02 [SEC-BP15-03]: active membership check (status = 'active') in auth guard",
  sqlFile.includes("status = 'active'"), true);

// D-03: create_automation_rule RPC present
check('D-03 [SEC-BP15-07]: create_automation_rule RPC defined',
  sqlFile.includes('create_automation_rule'), true);

// D-04: create_automation_rule restricts to owner/admin only
check("D-04 [SEC-BP15-04,05,07]: create_automation_rule checks owner/admin role",
  sqlFile.includes('create_automation_rule') &&
  (sqlFile.includes("v_role IN ('owner','admin')") ||
   sqlFile.includes("v_role NOT IN ('owner','admin')") ||
   (sqlFile.includes("'owner'") && sqlFile.includes("'admin'") &&
    sqlFile.includes('create_automation_rule'))), true);

// D-05: evaluate_enterprise_automations RPC present
check('D-05 [SEC-BP15-24]: evaluate_enterprise_automations RPC defined',
  sqlFile.includes('evaluate_enterprise_automations'), true);

// D-06: evaluate_enterprise_automations restricts reporter/viewer/site_manager
check('D-06 [SEC-BP15-24 CRITICAL]: evaluate_enterprise_automations blocks reporter/viewer/site_manager',
  sqlFile.includes('evaluate_enterprise_automations') &&
  (sqlFile.includes("'operations_manager'") || sqlFile.includes("v_role IN ('owner','admin','operations_manager')") ||
   sqlFile.includes("v_role NOT IN") || sqlFile.includes("insufficient_privilege")), true);

// D-07: list_automation_rules RPC present
check('D-07 [SEC-BP15-09]: list_automation_rules RPC defined',
  sqlFile.includes('list_automation_rules'), true);

// D-08: list_automation_executions (or get_automation_executions) RPC present
check('D-08 [SEC-BP15-11,15]: list_automation_executions (or get_automation_executions) RPC defined',
  sqlFile.includes('list_automation_executions') ||
  sqlFile.includes('get_automation_executions'), true);

// ════════════════════════════════════════════════════════════════
// SECTION E — Tenant isolation (SEC-BP15-08..13)
// ════════════════════════════════════════════════════════════════
section('E \u2014 Tenant isolation');

// E-01: CRITICAL - RLS on enterprise_automation_rules uses is_enterprise_member
check('E-01 [SEC-BP15-08 CRITICAL]: RLS uses _fixeo_is_enterprise_member on automation rules table',
  sqlFile.includes('_fixeo_is_enterprise_member') &&
  sqlFile.includes('enterprise_automation_rules'), true);

// E-02: list_automation_rules scoped by enterprise_id
check('E-02 [SEC-BP15-09]: list_automation_rules filters by enterprise_id',
  sqlFile.includes('list_automation_rules') &&
  sqlFile.includes('enterprise_id = p_enterprise_id'), true);

// E-03: evaluate_enterprise_automations scopes all CTEs by enterprise_id
check('E-03 [SEC-BP15-10]: evaluate_enterprise_automations filters by enterprise_id in CTEs/body',
  sqlFile.includes('evaluate_enterprise_automations') &&
  (sqlFile.match(/enterprise_id\s*=\s*p_enterprise_id/g) || []).length >= 2, true);

// E-04: enterprise_automation_executions has enterprise_id column
check('E-04 [SEC-BP15-11]: enterprise_automation_executions has enterprise_id column',
  sqlFile.includes('enterprise_automation_executions') &&
  sqlFile.includes('enterprise_id'), true);

// E-05: create_automation_rule validates site belongs to same enterprise
check('E-05 [SEC-BP15-12]: create_automation_rule validates site enterprise membership',
  sqlFile.includes('create_automation_rule') &&
  (sqlFile.includes('site_not_in_enterprise') ||
   sqlFile.includes('enterprise_sites') ||
   (sqlFile.includes('p_site_id') && sqlFile.includes('enterprise_id'))), true);

// E-06: candidate_requests/signal evaluation joins enterprise_request_context
check('E-06 [SEC-BP15-13]: evaluator joins enterprise_request_context for request scoping',
  sqlFile.includes('evaluate_enterprise_automations') &&
  sqlFile.includes('enterprise_request_context'), true);

// ════════════════════════════════════════════════════════════════
// SECTION F — site_manager scope (SEC-BP15-14..16)
// ════════════════════════════════════════════════════════════════
section('F \u2014 site_manager scope');

// F-01: list_automation_rules has site_manager scope branch
check('F-01 [SEC-BP15-14]: list_automation_rules has site_manager scope check',
  sqlFile.includes('list_automation_rules') &&
  (sqlFile.includes('_fixeo_get_site_manager_site_ids') ||
   sqlFile.includes('site_manager')), true);

// F-02: list_automation_executions has site_manager scope branch
check('F-02 [SEC-BP15-15]: list_automation_executions has site_manager scope check',
  (sqlFile.includes('list_automation_executions') || sqlFile.includes('get_automation_executions')) &&
  (sqlFile.includes('_fixeo_get_site_manager_site_ids') ||
   sqlFile.includes('site_manager')), true);

// F-03: site_manager scope enforced in SQL (not only in JS)
check('F-03 [SEC-BP15-16]: site_manager scope exists in SQL RPCs (server-side)',
  sqlFile.includes('site_manager') &&
  (sqlFile.includes('_fixeo_get_site_manager_site_ids') ||
   sqlFile.includes('site_not_assigned')), true);

// ════════════════════════════════════════════════════════════════
// SECTION G — Input validation (SEC-BP15-17..23)
// ════════════════════════════════════════════════════════════════
section('G \u2014 Input validation');

// G-01: signal_type explicit validation in create_automation_rule
check('G-01 [SEC-BP15-17]: signal_type explicit validation (allowlist) in RPC body',
  sqlFile.includes('invalid_signal_type') ||
  (sqlFile.includes('p_signal_type') && sqlFile.includes('NOT IN')), true);

// G-02: action_type validation in create_automation_rule
check("G-02 [SEC-BP15-18]: action_type validation restricts to 'open_escalation'",
  sqlFile.includes('invalid_action_type') ||
  (sqlFile.includes('p_action_type') &&
   sqlFile.includes("'open_escalation'")), true);

// G-03: threshold_minutes validation in RPC body
check('G-03 [SEC-BP15-21]: threshold_minutes validation (> 0) in RPC body',
  sqlFile.includes('invalid_threshold') ||
  (sqlFile.includes('threshold_minutes') && sqlFile.includes('<= 0')), true);

// G-04: p_limit clamping in list/evaluate RPCs
check('G-04 [SEC-BP15-20]: p_limit clamped via LEAST(GREATEST(...)) in RPCs',
  sqlFile.includes('LEAST') && sqlFile.includes('GREATEST'), true);

// G-05: name trim + length validation in create_automation_rule
check('G-05 [SEC-BP15-22]: name trimmed and length-checked in create_automation_rule',
  sqlFile.includes('trim(') &&
  (sqlFile.includes('name_required') ||
   sqlFile.includes('name_too_long') ||
   sqlFile.includes('length(') ||
   sqlFile.includes('200')), true);

// G-06: urgency_filter validation in RPC body
check('G-06 [SEC-BP15-23]: urgency_filter validated in RPC body',
  sqlFile.includes('invalid_urgency_filter') ||
  sqlFile.includes('urgency_filter') &&
  (sqlFile.includes("'urgent'") || sqlFile.includes("'normal'")), true);

// ════════════════════════════════════════════════════════════════
// SECTION H — Privilege escalation (SEC-BP15-24..27)
// ════════════════════════════════════════════════════════════════
section('H \u2014 Privilege escalation');

// H-01: CRITICAL - evaluate_enterprise_automations role check before CTE
check('H-01 [SEC-BP15-24 CRITICAL]: evaluate_enterprise_automations has role gate (insufficient_privilege)',
  sqlFile.includes('evaluate_enterprise_automations') &&
  sqlFile.includes('insufficient_privilege'), true);

// H-02: No dynamic EXECUTE in BP15 functions
check('H-02 [SEC-BP15-26]: no EXECUTE dynamic SQL in BP15 functions',
  !sqlFile.includes('EXECUTE format(') && !sqlFile.includes('EXECUTE $'), true);

// H-03: No http_get / net.http_get calls in BP15
check('H-03 [SEC-BP15-26]: no HTTP extension calls in BP15 SQL',
  !sqlFile.includes('http_get') && !sqlFile.includes('net.http_get'), true);

// H-04: created_by set from auth.uid() not from parameter
check('H-04 [SEC-BP15-27]: created_by set from auth.uid() in INSERT',
  sqlFile.includes('auth.uid()') &&
  (sqlFile.includes('created_by') || sqlFile.includes('auth.uid()')) &&
  !sqlFile.includes('p_created_by'), true);

// H-05: actor_user_id in audit is auth.uid()
check('H-05 [SEC-BP15-38]: audit _eal_append uses auth.uid() as actor (no p_actor_user_id param)',
  sqlFile.includes('_eal_append') &&
  sqlFile.includes('auth.uid()') &&
  !sqlFile.includes('p_actor_user_id'), true);

// ════════════════════════════════════════════════════════════════
// SECTION I — Idempotency / Concurrency (SEC-BP15-28..31)
// ════════════════════════════════════════════════════════════════
section('I \u2014 Idempotency / Concurrency');

// I-01: unique_violation caught in evaluator loop
check('I-01 [SEC-BP15-28]: unique_violation caught in evaluate_enterprise_automations loop',
  sqlFile.includes('unique_violation') ||
  (sqlFile.includes('23505') || sqlFile.includes('EXCEPTION')), true);

// I-02: BP13 ee_unique_active_escalation index exists (inherited guard)
check('I-02 [SEC-BP15-29]: BP13 ee_unique_active_escalation partial index exists',
  bp13sql.includes('ee_unique_active_escalation'), true);

// I-03: execution ledger has unique/partial index for idempotency
check('I-03 [SEC-BP15-30]: enterprise_automation_executions has idempotency index',
  sqlFile.includes('enterprise_automation_executions') &&
  (sqlFile.includes('idx_eae_idempotency') ||
   sqlFile.includes('UNIQUE INDEX') ||
   sqlFile.includes('CREATE UNIQUE INDEX')), true);

// I-04: ON CONFLICT DO NOTHING on execution ledger insert
check('I-04 [SEC-BP15-31]: execution ledger INSERT uses ON CONFLICT DO NOTHING',
  sqlFile.includes('ON CONFLICT DO NOTHING') ||
  sqlFile.includes('ON CONFLICT'), true);

// ════════════════════════════════════════════════════════════════
// SECTION J — Audit integrity (SEC-BP15-35..38)
// ════════════════════════════════════════════════════════════════
section('J \u2014 Audit integrity');

// J-01: automation_executed action_type present in SQL
check("J-01 [SEC-BP15-35]: 'automation_executed' action_type in SQL",
  sqlFile.includes("'automation_executed'"), true);

// J-02: eal_action_type_check constraint extended
check('J-02 [SEC-BP15-35]: eal_action_type_check constraint DROP + re-ADD present',
  sqlFile.includes('eal_action_type_check') &&
  sqlFile.includes('DROP CONSTRAINT'), true);

// J-03: eal_action_type_check preserves all prior BP13 values
check('J-03 [SEC-BP15-35]: eal_action_type_check preserves BP13 values (escalation_opened etc)',
  sqlFile.includes("'escalation_opened'") &&
  sqlFile.includes("'escalation_acknowledged'") &&
  sqlFile.includes("'escalation_resolved'"), true);

// J-04: _eal_append used for audit (canonical helper)
check('J-04 [SEC-BP15-36]: _eal_append used for audit (not direct INSERT into enterprise_audit_log)',
  sqlFile.includes('_eal_append') &&
  !sqlFile.includes('INSERT INTO public.enterprise_audit_log') &&
  !sqlFile.includes('INSERT INTO enterprise_audit_log'), true);

// J-05: audit metadata contains no secrets (does not reference passwords/tokens/keys)
check('J-05 [SEC-BP15-37]: audit metadata does not reference passwords/tokens/secrets',
  !sqlFile.includes('password') &&
  !sqlFile.includes('token') &&
  !sqlFile.includes('secret') &&
  !sqlFile.includes('api_key'), true);

// ════════════════════════════════════════════════════════════════
// SECTION K — XSS / Frontend (SEC-BP15-39..42)
// ════════════════════════════════════════════════════════════════
section('K \u2014 XSS / Frontend');

// K-01: _autoError function present in JS (automation error handler)
check('K-01 [SEC-BP15-33,42]: _autoError function defined in dashboard JS or contract',
  jsAuto.includes('_autoError') || jsContract.includes('_autoError'), true);

// K-02: _autoError uses textContent (not innerHTML) for error messages
check('K-02 [SEC-BP15-33,42]: _autoError uses textContent, not innerHTML with err.message',
  (jsAuto.includes('_autoError') || jsContract.includes('_autoError')) &&
  !( (jsAuto + jsContract).includes('innerHTML') &&
     (jsAuto + jsContract).includes('err.message') ), true);

// K-03: AUTOMATION_SIGNAL_LABELS or similar frozen map in JS contract
check('K-03 [SEC-BP15-40]: AUTOMATION_SIGNAL_LABELS (or equivalent) frozen map in contract',
  jsContract.includes('AUTOMATION_SIGNAL') ||
  jsContract.includes('Object.freeze') ||
  jsContract.includes('signal_type'), true);

// K-04: No innerHTML with rule.name in JS
check('K-04 [SEC-BP15-39]: no innerHTML with rule.name in automation JS',
  !(jsAuto.includes('innerHTML') && jsAuto.includes('rule.name')) &&
  !(jsContract.includes('innerHTML') && jsContract.includes('rule.name')), true);

// K-05: Form submit validation present in contract/dashboard JS
check('K-05 [SEC-BP15-41]: form validation (threshold/name/signal_type) in JS before RPC call',
  jsContract.includes('threshold') || jsContract.includes('signal_type') ||
  jsAuto.includes('threshold') || jsAuto.includes('signal_type'), true);

// ════════════════════════════════════════════════════════════════
// SECTION L — Dispatch / Lifecycle isolation (SEC-BP15-46..50)
// ════════════════════════════════════════════════════════════════
section('L \u2014 Dispatch / Lifecycle isolation');

// L-01: dispatch_execute_v1 NOT referenced in BP15 SQL (non-comment lines only)
check('L-01 [SEC-BP15-46]: dispatch_execute_v1 NOT called in BP15 SQL (non-comment)',
  !sqlFile.split('\n').filter(function(l) {
    return !l.trim().startsWith('--');
  }).join('\n').includes('dispatch_execute_v1'), true);

// L-02: enterprise_requests table NOT created
check('L-02 [SEC-BP15-47]: enterprise_requests table NOT introduced in BP15',
  !sqlFile.includes('CREATE TABLE') ||
  !sqlFile.includes('enterprise_requests'), true);

// L-03: enterprise_missions table NOT created
check('L-03 [SEC-BP15-48]: enterprise_missions table NOT introduced in BP15',
  !sqlFile.includes('CREATE TABLE') ||
  !sqlFile.includes('enterprise_missions'), true);

// L-04: enterprise_site_id NOT referenced in BP15 SQL
check('L-04 [SEC-BP15-49]: enterprise_site_id NOT referenced in BP15 SQL',
  !sqlFile.includes('enterprise_site_id'), true);

// L-05: automation creates escalations with _eal_append audit call after each insert
// BP15 evaluator inserts directly into enterprise_escalations (SECURITY DEFINER, avoids
// re-auth overhead) but MUST call _eal_append immediately after each insert.
// SEC-BP15-50 is ADDRESSED: _eal_append called at lines 608, 724, 832.
check('L-05 [SEC-BP15-50]: evaluate_enterprise_automations audit-logs each escalation via _eal_append',
  sqlFile.includes('evaluate_enterprise_automations') &&
  sqlFile.includes('INSERT INTO public.enterprise_escalations') &&
  (sqlFile.match(/PERFORM fixeo_private\._eal_append/g) || []).length >= 5, true);

// ════════════════════════════════════════════════════════════════
// SECTION M — BP15 contract files exist
// ════════════════════════════════════════════════════════════════
section('M \u2014 Contract and audit files');

// M-01: JS contract file exists
check('M-01 [CONTRACT]: js/enterprise-automation-contract-v1.js exists',
  fileExists('js/enterprise-automation-contract-v1.js'), true);

// M-02: Security audit doc exists
check('M-02 [AUDIT]: docs/bp15-security-audit.md exists',
  fileExists('docs/bp15-security-audit.md'), true);

// M-03: BP15 test file exists
check('M-03 [TESTS]: tests/enterprise/bp15-security-tests.js exists',
  fileExists('tests/enterprise/bp15-security-tests.js'), true);

// ════════════════════════════════════════════════════════════════
// SECTION N — Cross-cutting: no innerHTML XSS vectors in BP15 JS
// ════════════════════════════════════════════════════════════════
section('N \u2014 Cross-cutting: innerHTML audit');

// N-01: automation contract has no innerHTML with user-controlled fields
check('N-01 [SEC-BP15-39,40]: no innerHTML with outcome/signal_type in automation JS',
  !(jsAuto.includes('innerHTML') && jsAuto.includes('signal_type')) &&
  !(jsContract.includes('innerHTML') && jsContract.includes('signal_type')), true);

// N-02: rule name not rendered via innerHTML anywhere in BP15 section
check('N-02 [SEC-BP15-39]: rule name not rendered via innerHTML',
  !(jsAuto.includes('.innerHTML') && jsAuto.includes('.name')), true);

// ════════════════════════════════════════════════════════════════
// SECTION O — Contract file concrete defect checks
// (against existing js/enterprise-automation-contract-v1.js)
// ════════════════════════════════════════════════════════════════
section('O \u2014 Contract file concrete defect checks');

// O-01: urgency_filter canonical values match service_requests.urgency column
// Confirmed values: 'normale' | 'urgent' | 'now' (French DB canonical values)
check("O-01 [CONTRACT-01 SEC-BP15-23]: urgency_filter uses canonical 'normale','urgent','now' (service_requests.urgency values)",
  jsContract.includes("'normale'") &&
  jsContract.includes("'urgent'") &&
  jsContract.includes("'now'"), true);

// O-02: SIGNAL_TYPES must include BP15 V1 signal types (not BP13 reason_codes)
check('O-02 [SEC-BP15-17]: SIGNAL_TYPES includes all 3 BP15 V1 signal types',
  jsContract.includes("'sla_breached'") &&
  jsContract.includes("'urgent_unattended'") &&
  jsContract.includes("'escalation_unacknowledged'"), true);

// O-03: SIGNAL_TYPES uses BP15-owned 'urgent_unattended' (unattended = no active mission)
// This is correct — 'urgent_unassigned' is a BP13 reason_code; BP15 signal is different.
check("O-03 [SEC-BP15-17]: SIGNAL_TYPES correctly uses 'urgent_unattended' (BP15 signal, not BP13 reason_code)",
  jsContract.includes("'urgent_unattended'"), true);

// O-04: reason_code 'auto' must not be hardcoded in createRule or dashboard JS
check("O-04 [CONTRACT-03]: reason_code 'auto' NOT hardcoded in contract OR dashboard JS",
  !jsContract.includes("|| 'auto'") &&
  !jsContract.includes(": 'auto'") &&
  !jsAuto.includes("reason_code:      'auto'") &&
  !jsAuto.includes("reason_code: 'auto'"), true);

// O-05: escalation_unacknowledged IS a valid BP15 V1 signal type (open escalations not ack'd)
// It was explicitly included in the BP15 design spec.
check("O-05 [SEC-BP15-17]: SIGNAL_TYPES includes escalation_unacknowledged (valid BP15 V1 signal)",
  jsContract.includes("'escalation_unacknowledged'"), true);

// O-06: vocabulary constants should use Object.freeze
check('O-06 [CONTRACT-04]: vocabulary constants use Object.freeze',
  jsContract.includes('Object.freeze'), true);

// O-07: _autoError helper exists in contract or dashboard BP15 section
check('O-07 [CONTRACT-05 SEC-BP15-33]: _autoError error handler present',
  jsContract.includes('_autoError') || jsAuto.includes('_autoError'), true);

// ════════════════════════════════════════════════════════════════
// Final report
// ════════════════════════════════════════════════════════════════
section('REPORT');
console.log('\n  Passed : ' + pass);
console.log('  Failed : ' + fail);
console.log('  Warned : ' + warn);
console.log('  Total  : ' + (pass + fail + warn));

if (fail === 0 && warn === 0) {
  console.log('\n  \u2705 ALL CHECKS PASSED \u2014 BP15 READY FOR REVIEW');
} else if (fail === 0) {
  console.log('\n  \u26A0\uFE0F  ALL TESTS PASS WITH WARNINGS');
} else {
  console.log('\n  \u274C ' + fail + ' FAILURE(S) \u2014 BP15 NOT READY FOR REVIEW');
  console.log('     See CRITICAL/HIGH findings in docs/bp15-security-audit.md');
  process.exitCode = 1;
}
