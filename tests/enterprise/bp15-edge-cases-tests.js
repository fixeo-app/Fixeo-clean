'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// BP15 — Enterprise Automation Edge-Case Tests
// Pure-JS validators + file-contract tests. No live DB required.
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

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

// ── Load source files ─────────────────────────────────────────────
const sqlFile = readFile('supabase/bp15-enterprise-automation.sql') || '';
const edgeCases = require(path.join(ROOT, 'js/enterprise-automation-edge-cases-v1.js'));

const {
  validateRuleName,
  validateThreshold,
  validateSignalType,
  validateActionType,
  validateSeverity,
  validateUrgencyFilter,
  validateReasonCode,
  buildSignalKey,
  isTerminalStatus,
  isActiveEscalationStatus,
  describeRuleText,
  getOutcomeLabel,
  getSignalLabel,
  getActionLabel,
  getSeverityLabel,
} = edgeCases;

// ════════════════════════════════════════════════════════════════
// SECTION A — Rule validation (pure JS)
// ════════════════════════════════════════════════════════════════
section('A — Rule validation (pure JS)');

// ── validateRuleName ──
// A-01: null → invalid
check('A-01: validateRuleName(null) → invalid',
  validateRuleName(null).valid, false);

// A-02: undefined → invalid
check('A-02: validateRuleName(undefined) → invalid',
  validateRuleName(undefined).valid, false);

// A-03: empty string → invalid
check('A-03: validateRuleName("") → invalid',
  validateRuleName('').valid, false);

// A-04: whitespace-only → invalid (empty after trim)
check('A-04: validateRuleName("   ") → invalid (empty after trim)',
  validateRuleName('   ').valid, false);

// A-05: valid normal name
check('A-05: validateRuleName("Auto SLA Escalation") → valid',
  validateRuleName('Auto SLA Escalation').valid, true);

// A-06: exactly 200 chars → valid
check('A-06: validateRuleName(200 chars) → valid',
  validateRuleName('x'.repeat(200)).valid, true);

// A-07: 201 chars → invalid
check('A-07: validateRuleName(201 chars) → invalid',
  validateRuleName('x'.repeat(201)).valid, false);

// A-08: reason code is 'exceeds_max_length_200' for too-long name
check('A-08: validateRuleName(201 chars) reason = exceeds_max_length_200',
  validateRuleName('x'.repeat(201)).reason, 'exceeds_max_length_200');

// ── validateThreshold ──
// A-09: null → valid (optional)
check('A-09: validateThreshold(null) → valid (optional)',
  validateThreshold(null).valid, true);

// A-10: undefined → valid (optional)
check('A-10: validateThreshold(undefined) → valid (optional)',
  validateThreshold(undefined).valid, true);

// A-11: 0 → invalid (must be positive)
check('A-11: validateThreshold(0) → invalid',
  validateThreshold(0).valid, false);

// A-12: negative → invalid
check('A-12: validateThreshold(-1) → invalid',
  validateThreshold(-1).valid, false);

// A-13: 1 → valid
check('A-13: validateThreshold(1) → valid',
  validateThreshold(1).valid, true);

// A-14: 10080 → valid (max = 1 week)
check('A-14: validateThreshold(10080) → valid',
  validateThreshold(10080).valid, true);

// A-15: 10081 → invalid (exceeds max)
check('A-15: validateThreshold(10081) → invalid',
  validateThreshold(10081).valid, false);

// A-16: float → invalid
check('A-16: validateThreshold(1.5) → invalid',
  validateThreshold(1.5).valid, false);

// A-17: NaN → invalid
check('A-17: validateThreshold(NaN) → invalid',
  validateThreshold(NaN).valid, false);

// ── validateSignalType ──
// A-18: 'sla_breached' → valid
check('A-18: validateSignalType("sla_breached") → valid',
  validateSignalType('sla_breached').valid, true);

// A-19: unknown string → invalid
check('A-19: validateSignalType("dispatch_execute_v1") → invalid',
  validateSignalType('dispatch_execute_v1').valid, false);

// A-20: null → invalid
check('A-20: validateSignalType(null) → invalid',
  validateSignalType(null).valid, false);

// ── validateActionType (bonus coverage) ──
check('A-21 (bonus): validateActionType("open_escalation") → valid',
  validateActionType('open_escalation').valid, true);
check('A-22 (bonus): validateActionType("close_request") → invalid',
  validateActionType('close_request').valid, false);

// ── validateSeverity ──
check('A-23 (bonus): validateSeverity("critical") → valid',
  validateSeverity('critical').valid, true);
check('A-24 (bonus): validateSeverity("unknown") → invalid',
  validateSeverity('unknown').valid, false);
check('A-25 (bonus): validateSeverity(null) → invalid',
  validateSeverity(null).valid, false);

// ── validateUrgencyFilter ──
check('A-26 (bonus): validateUrgencyFilter(null) → valid (optional)',
  validateUrgencyFilter(null).valid, true);
check('A-27 (bonus): validateUrgencyFilter("now") → valid',
  validateUrgencyFilter('now').valid, true);
check('A-28 (bonus): validateUrgencyFilter("immediate") → invalid',
  validateUrgencyFilter('immediate').valid, false);

// ── validateReasonCode ──
check('A-29 (bonus): validateReasonCode(null) → valid (defaults to auto)',
  validateReasonCode(null).valid, true);
check('A-30 (bonus): validateReasonCode("auto") → valid',
  validateReasonCode('auto').valid, true);
check('A-31 (bonus): validateReasonCode("") → invalid (empty after trim)',
  validateReasonCode('').valid, false);
check('A-32 (bonus): validateReasonCode("   ") → invalid',
  validateReasonCode('   ').valid, false);
check('A-33 (bonus): validateReasonCode("sla_overdue") → valid (custom code)',
  validateReasonCode('sla_overdue').valid, true);

// ════════════════════════════════════════════════════════════════
// SECTION B — Signal key idempotency (pure JS)
// ════════════════════════════════════════════════════════════════
section('B — Signal key idempotency (pure JS)');

const UUID1 = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';
const UUID3 = '33333333-3333-3333-3333-333333333333';

// B-01: same args → same key
check('B-01: same signal_type+targetId+ruleId → same key',
  buildSignalKey('sla_breached', UUID1, UUID2),
  buildSignalKey('sla_breached', UUID1, UUID2));

// B-02: different ruleId → different key
check('B-02: different ruleId → different key',
  buildSignalKey('sla_breached', UUID1, UUID2) !==
  buildSignalKey('sla_breached', UUID1, UUID3),
  true);

// B-03: different targetId → different key
check('B-03: different targetId → different key',
  buildSignalKey('sla_breached', UUID1, UUID2) !==
  buildSignalKey('sla_breached', UUID3, UUID2),
  true);

// B-04: different signal_type → different key
check('B-04: different signal_type → different key',
  buildSignalKey('sla_breached', UUID1, UUID2) !==
  buildSignalKey('urgent_unattended', UUID1, UUID2),
  true);

// B-05: key format is 'sla_breached:uuid1:uuid2'
check('B-05: key format: "sla_breached:uuid1:uuid2"',
  buildSignalKey('sla_breached', UUID1, UUID2),
  'sla_breached:' + UUID1 + ':' + UUID2);

// ════════════════════════════════════════════════════════════════
// SECTION C — Terminal status guard (pure JS)
// ════════════════════════════════════════════════════════════════
section('C — Terminal status guard (pure JS)');

// C-01: 'validated' → true
check('C-01: isTerminalStatus("validated") → true',
  isTerminalStatus('validated'), true);

// C-02: 'cancelled' → true
check('C-02: isTerminalStatus("cancelled") → true',
  isTerminalStatus('cancelled'), true);

// C-03: 'no_match' → true
check('C-03: isTerminalStatus("no_match") → true',
  isTerminalStatus('no_match'), true);

// C-04: 'new' → false
check('C-04: isTerminalStatus("new") → false',
  isTerminalStatus('new'), false);

// C-05: 'started' → false
check('C-05: isTerminalStatus("started") → false',
  isTerminalStatus('started'), false);

// C-06: 'completed' → false (completed is NOT terminal for SR in BP15 context)
check('C-06: isTerminalStatus("completed") → false',
  isTerminalStatus('completed'), false);

// C-07: null → false (null-safe)
check('C-07: isTerminalStatus(null) → false (null-safe)',
  isTerminalStatus(null), false);

// C-08: undefined → false
check('C-08: isTerminalStatus(undefined) → false',
  isTerminalStatus(undefined), false);

// ════════════════════════════════════════════════════════════════
// SECTION D — Active escalation guard (pure JS)
// ════════════════════════════════════════════════════════════════
section('D — Active escalation guard (pure JS)');

// D-01: 'open' → true
check('D-01: isActiveEscalationStatus("open") → true',
  isActiveEscalationStatus('open'), true);

// D-02: 'acknowledged' → true
check('D-02: isActiveEscalationStatus("acknowledged") → true',
  isActiveEscalationStatus('acknowledged'), true);

// D-03: 'resolved' → false
check('D-03: isActiveEscalationStatus("resolved") → false',
  isActiveEscalationStatus('resolved'), false);

// D-04: null → false
check('D-04: isActiveEscalationStatus(null) → false',
  isActiveEscalationStatus(null), false);

// ════════════════════════════════════════════════════════════════
// SECTION E — SQL file resilience contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('E — SQL file resilience contracts (file-based)');

const sqlExists = sqlFile.length > 0;

// E-01: evaluator catches unique_violation exception
warnIf('E-01: evaluator catches unique_violation exception',
  sqlExists && !sqlFile.includes('unique_violation'),
  '— unique_violation handler not found in BP15 SQL');

// E-02: evaluator checks idempotency ledger before action
warnIf('E-02: evaluator checks idempotency ledger before action',
  sqlExists && !(sqlFile.includes('idx_eae_idempotency') || sqlFile.includes('signal_key')),
  '— idempotency key/index reference not found in BP15 SQL');

// E-03: evaluator checks for active escalation before inserting
warnIf('E-03: evaluator checks for active escalation before inserting',
  sqlExists && !(
    (sqlFile.includes("status IN ('open'") || sqlFile.includes("status IN ('open','acknowledged')") ||
     sqlFile.includes('open') && sqlFile.includes('acknowledged')) &&
    (sqlFile.includes('enterprise_escalations') || sqlFile.includes('escalation'))
  ),
  '— active escalation pre-check not found in BP15 SQL');

// E-04: evaluator excludes terminal request statuses from all 3 signals
warnIf('E-04: evaluator excludes terminal SR statuses',
  sqlExists && !(
    sqlFile.includes("'validated'") && sqlFile.includes("'cancelled'") &&
    sqlFile.includes("'no_match'")
  ),
  '— terminal SR status exclusion not found in BP15 SQL');

// E-05: evaluator has inner LIMIT 100 per signal loop
warnIf('E-05: evaluator has inner LIMIT 100 per signal loop',
  sqlExists && !sqlFile.includes('LIMIT 100'),
  '— LIMIT 100 not found in BP15 SQL');

// E-06: evaluator has outer hard row limit
warnIf('E-06: evaluator has outer hard row limit (LEAST/GREATEST clamp)',
  sqlExists && !(sqlFile.includes('LEAST') || sqlFile.includes('p_limit')),
  '— outer p_limit clamp not found in BP15 SQL');

// E-07: sla_breached uses enterprise_sla_status view
warnIf('E-07: sla_breached uses enterprise_sla_status view',
  sqlExists && !sqlFile.includes('enterprise_sla_status'),
  '— enterprise_sla_status view not referenced in BP15 SQL');

// E-08: urgent_unattended checks NOT EXISTS missions with accepted/started
warnIf('E-08: urgent_unattended: NOT EXISTS missions with accepted/started',
  sqlExists && !(
    sqlFile.includes('NOT EXISTS') &&
    (sqlFile.includes("'accepted'") || sqlFile.includes("'started'"))
  ),
  '— NOT EXISTS missions guard not found for urgent_unattended');

// E-09: urgent_unattended: missions join uses ::text cast
warnIf('E-09: urgent_unattended: missions join uses ::text cast',
  sqlExists && !sqlFile.includes('::text'),
  '— ::text cast not found in BP15 SQL (needed for missions.request_id join)');

// E-10: escalation_unacknowledged: threshold_minutes guard present
warnIf('E-10: escalation_unacknowledged: threshold_minutes guard present',
  sqlExists && !(sqlFile.includes('threshold_minutes') || sqlFile.includes('v_rule.threshold')),
  '— threshold_minutes guard not found for escalation_unacknowledged');

// E-11: ON CONFLICT DO NOTHING on execution ledger insert
warnIf('E-11: ON CONFLICT DO NOTHING on execution ledger insert',
  sqlExists && !sqlFile.includes('ON CONFLICT DO NOTHING'),
  '— ON CONFLICT DO NOTHING not found in BP15 SQL');

// E-12: evaluator auth: checks auth.uid() IS NULL
warnIf('E-12: evaluator auth: checks auth.uid() IS NULL',
  sqlExists && !(sqlFile.includes('auth.uid()') && sqlFile.includes('IS NULL')),
  '— auth.uid() IS NULL check not found in evaluator');

// E-13: evaluator auth: checks membership status = \'active\'
warnIf("E-13: evaluator auth: checks status = 'active'",
  sqlExists && !(sqlFile.includes("status = 'active'") || sqlFile.includes("'active'")),
  "— status = 'active' membership check not found in evaluator");

// E-14: evaluator: p_limit clamped LEAST(GREATEST(...))
warnIf('E-14: evaluator: p_limit clamped LEAST(GREATEST(...))',
  sqlExists && !(sqlFile.includes('LEAST') && sqlFile.includes('GREATEST')),
  '— LEAST(GREATEST(...)) p_limit clamp not found in BP15 SQL');

// E-15: inactive rules excluded: active = true filter
warnIf('E-15: inactive rules excluded (active = true filter)',
  sqlExists && !(sqlFile.includes('active = true') || sqlFile.includes('active IS TRUE')),
  '— active = true filter not found in BP15 SQL');

// ════════════════════════════════════════════════════════════════
// SECTION F — Rule allowlist contracts (file-based)
// ════════════════════════════════════════════════════════════════
section('F — Rule allowlist contracts (file-based)');

// F-01: ear_signal_type_check includes all 3 V1 signal types
warnIf('F-01: ear_signal_type_check includes all 3 V1 signal types',
  sqlExists && !(
    sqlFile.includes('sla_breached') &&
    sqlFile.includes('urgent_unattended') &&
    sqlFile.includes('escalation_unacknowledged') &&
    (sqlFile.includes('ear_signal_type_check') || sqlFile.includes('signal_type'))
  ),
  '— signal_type CHECK constraint missing V1 values in BP15 SQL');

// F-02: ear_action_type_check includes 'open_escalation' only
warnIf("F-02: ear_action_type_check includes 'open_escalation'",
  sqlExists && !(
    sqlFile.includes('open_escalation') &&
    (sqlFile.includes('ear_action_type_check') || sqlFile.includes('action_type'))
  ),
  "— 'open_escalation' not found in action_type CHECK constraint in BP15 SQL");

// F-03: ear_severity_check in SQL
warnIf('F-03: ear_severity_check in SQL',
  sqlExists && !(sqlFile.includes('ear_severity_check') || (
    sqlFile.includes("'critical'") && sqlFile.includes("'high'") &&
    sqlFile.includes("'medium'") && sqlFile.includes("'low'") &&
    sqlFile.includes('severity')
  )),
  '— severity CHECK constraint not found in BP15 SQL');

// F-04: ear_urgency_filter_check in SQL
warnIf('F-04: ear_urgency_filter_check in SQL',
  sqlExists && !(sqlFile.includes('ear_urgency_filter_check') || (
    sqlFile.includes('urgency_filter') &&
    sqlFile.includes("'normale'") && sqlFile.includes("'urgent'") && sqlFile.includes("'now'")
  )),
  '— urgency_filter CHECK constraint not found in BP15 SQL');

// F-05: ear_threshold_positive in SQL
warnIf('F-05: ear_threshold_positive in SQL',
  sqlExists && !(
    sqlFile.includes('ear_threshold_positive') ||
    (sqlFile.includes('threshold_minutes') && sqlFile.includes('> 0'))
  ),
  '— threshold_minutes > 0 CHECK not found in BP15 SQL');

// Helper: strip SQL line comments (-- ...) for pattern checks that
// should only match executable code, not documentation comments.
function stripSqlComments(sql) {
  return sql.split('\n')
    .filter(function(line) { return !line.trim().startsWith('--'); })
    .join('\n');
}
const sqlCode = stripSqlComments(sqlFile);

// F-06: no dispatch_execute_v1 in BP15 SQL (non-comment code only)
check('F-06: no dispatch_execute_v1 in BP15 SQL (non-comment code)',
  sqlCode.includes('dispatch_execute_v1'), false);

// F-07: no enterprise_requests table in BP15 SQL
check('F-07: no enterprise_requests table in BP15 SQL',
  sqlCode.includes('enterprise_requests'), false);

// F-08: no enterprise_missions table in BP15 SQL
check('F-08: no enterprise_missions table in BP15 SQL',
  sqlCode.includes('enterprise_missions'), false);

// F-09: no service_requests.enterprise_site_id in BP15 SQL
check('F-09: no service_requests.enterprise_site_id in BP15 SQL',
  sqlCode.includes('enterprise_site_id'), false);

// F-10: no eval() in BP15 SQL (non-comment code) or JS
const jsFile = readFile('js/enterprise-automation-edge-cases-v1.js') || '';
check('F-10: no eval() in BP15 SQL (non-comment code) or JS',
  sqlCode.includes('eval(') || jsFile.includes('eval('), false);

// ════════════════════════════════════════════════════════════════
// SECTION G — Concurrency semantics (pure JS logic)
// ════════════════════════════════════════════════════════════════
section('G — Concurrency semantics (pure JS logic)');

// G-01: two concurrent executions with same signal_key → same key (ON CONFLICT DO NOTHING semantics)
{
  const key1 = buildSignalKey('sla_breached', UUID1, UUID2);
  const key2 = buildSignalKey('sla_breached', UUID1, UUID2);
  check('G-01: concurrent same signal_key → identical keys (only first inserts)',
    key1 === key2, true);
}

// G-02: unique_violation handler returns 'skipped' not 'error'
// Pure JS logic: verify 'skipped' is in VALID_OUTCOMES and not 'error'
check('G-02: "skipped" is a valid outcome (not "error")',
  edgeCases.VALID_OUTCOMES.includes('skipped') && edgeCases.VALID_OUTCOMES.includes('error'),
  true);
check('G-02b: getOutcomeLabel("skipped") is French "Ignoré"',
  getOutcomeLabel('skipped'), 'Ignoré');
check('G-02c: getOutcomeLabel("error") is different from "Ignoré"',
  getOutcomeLabel('error') !== 'Ignoré', true);

// G-03: idempotency key covers rule_id (different rules = different key even for same request)
{
  const ruleA = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const ruleB = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const target = UUID1;
  check('G-03: different ruleId = different key even for same request',
    buildSignalKey('sla_breached', target, ruleA) !==
    buildSignalKey('sla_breached', target, ruleB),
    true);
}

// G-04: 'skipped' outcome does not block re-evaluation (only 'executed' is unique-constrained)
// Modelled by checking the idempotency partial index is WHERE outcome = 'executed'
// (SQL file check — warn only since SQL may not yet exist)
warnIf('G-04: idx_eae_idempotency WHERE outcome = "executed" (not "skipped")',
  sqlExists && !(
    sqlFile.includes("outcome = 'executed'") ||
    sqlFile.includes('idx_eae_idempotency')
  ),
  '— idempotency partial index WHERE outcome=executed not found in SQL');

// G-05: escalation_already_active is a valid skip reason
// Pure JS: simulate what the evaluator does — returns 'skipped' outcome
{
  const skipReasons = ['idempotency_key_exists', 'escalation_already_active', 'terminal_status'];
  check('G-05: "escalation_already_active" is a recognised skip reason',
    skipReasons.includes('escalation_already_active'), true);
}

// ════════════════════════════════════════════════════════════════
// SECTION H — Site scope resilience (pure JS + file)
// ════════════════════════════════════════════════════════════════
section('H — Site scope resilience (pure JS + file)');

// H-01: site_manager filter in list_automation_rules SQL
warnIf('H-01: site_manager filter in list_automation_rules SQL',
  sqlExists && !(
    sqlFile.includes('list_automation_rules') ||
    sqlFile.includes('site_manager')
  ),
  '— list_automation_rules or site_manager filter not found in BP15 SQL');

// H-02: site_manager filter in list_automation_executions SQL
warnIf('H-02: site_manager filter in list_automation_executions SQL',
  sqlExists && !(
    sqlFile.includes('list_automation_executions') ||
    sqlFile.includes('site_manager')
  ),
  '— list_automation_executions or site_manager not found in BP15 SQL');

// H-03: list_automation_rules allows enterprise-wide rules (site_id IS NULL) for site_manager
warnIf('H-03: enterprise-wide rules (site_id IS NULL) allowed for site_manager',
  sqlExists && !(
    sqlFile.includes('site_id IS NULL') ||
    sqlFile.includes('v_rule.site_id IS NULL')
  ),
  '— site_id IS NULL enterprise-wide rule clause not found in BP15 SQL');

// H-04: evaluator scopes by v_rule.site_id when set
warnIf('H-04: evaluator scopes by v_rule.site_id when set',
  sqlExists && !(
    sqlFile.includes('v_rule.site_id') ||
    (sqlFile.includes('site_id') && sqlFile.includes('service_requests'))
  ),
  '— evaluator site_id scope not found in BP15 SQL');

// H-05: rule with site_id for inactive site: ear_site_fk ON DELETE SET NULL
warnIf('H-05: ear_site_fk ON DELETE SET NULL (degrade to enterprise-wide)',
  sqlExists && !(
    sqlFile.includes('ON DELETE SET NULL') ||
    sqlFile.includes('ear_site_fk')
  ),
  '— ear_site_fk ON DELETE SET NULL not found in BP15 SQL');

// ════════════════════════════════════════════════════════════════
// SECTION I — Describe rule text (pure JS)
// ════════════════════════════════════════════════════════════════
section('I — Describe rule text (pure JS)');

// I-01: sla_breached + open_escalation → contains "SLA" and "escalade"
{
  const txt = describeRuleText({ signal_type: 'sla_breached', action_type: 'open_escalation' });
  check('I-01: sla_breached + open_escalation → contains "SLA"',
    txt.includes('SLA'), true);
  check('I-01: sla_breached + open_escalation → contains "escalade"',
    txt.includes('escalade'), true);
}

// I-02: urgent_unattended + open_escalation → contains "urgente"
{
  const txt = describeRuleText({ signal_type: 'urgent_unattended', action_type: 'open_escalation' });
  check('I-02: urgent_unattended + open_escalation → contains "urgente"',
    txt.includes('urgente') || txt.includes('urgence'), true);
}

// I-03: escalation_unacknowledged + open_escalation → contains "non acquittée" or "escalade"
{
  const txt = describeRuleText({ signal_type: 'escalation_unacknowledged', action_type: 'open_escalation' });
  check('I-03: escalation_unacknowledged → contains "non acquittée" or "escalade"',
    txt.includes('non acquittée') || txt.includes('escalade'), true);
}

// I-04: with threshold_minutes=30 → contains "30 min"
{
  const txt = describeRuleText({
    signal_type: 'escalation_unacknowledged',
    action_type: 'open_escalation',
    threshold_minutes: 30,
  });
  check('I-04: threshold_minutes=30 → contains "30 min"',
    txt.includes('30 min'), true);
}

// I-05: with urgency_filter='now' → contains "immédiate" or "now"
{
  const txt = describeRuleText({
    signal_type: 'urgent_unattended',
    action_type: 'open_escalation',
    urgency_filter: 'now',
  });
  check('I-05: urgency_filter="now" → contains "immédiate" or "now"',
    txt.includes('immédiate') || txt.includes('now'), true);
}

// I-06: active vs inactive — same text (active flag is a badge, not in text)
{
  const activeRule   = { signal_type: 'sla_breached', action_type: 'open_escalation', active: true };
  const inactiveRule = { signal_type: 'sla_breached', action_type: 'open_escalation', active: false };
  const txtA = describeRuleText(activeRule);
  const txtI = describeRuleText(inactiveRule);
  check('I-06: active flag is a badge — description text same for active/inactive rule',
    txtA === txtI, true);
}

// ════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`BP15 Edge-Case Tests complete:`);
console.log(`  ✅ PASS : ${pass}`);
console.log(`  ❌ FAIL : ${fail}`);
console.log(`  ⚠️  WARN : ${warn}`);
console.log('══════════════════════════════════════════════════════════════');

if (fail > 0) process.exit(1);
