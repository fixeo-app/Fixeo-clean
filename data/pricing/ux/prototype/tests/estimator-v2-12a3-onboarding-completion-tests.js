/**
 * 7C.12A.3 — Artisan Onboarding Completion Gate Tests
 * estimator-v2-12a3-onboarding-completion-tests.js
 *
 * Sections:
 *  S1:  RPC existence + SECURITY DEFINER contract
 *  S2:  Guards and preconditions
 *  S3:  UPDATE SET — required fields written
 *  S4:  UPDATE SET — privileged fields NOT written (SET-clause scoped)
 *  S5:  Idempotency
 *  S6:  Privilege: EXECUTE grants
 *  S7:  No caller-supplied privileged parameters
 *  S8:  Dispatch ineligibility preserved until completion
 *  S9:  7C.12A.2 non-regression
 *  S10: 7C.12A.1 non-regression
 *  S11: Migration structural checks
 *  S12: Precheck structural checks
 *  S13: Verify structural checks
 *  S14: Rollback structural checks
 */

'use strict';

let _pass = 0, _fail = 0;
const results = [];
function test(label, fn) {
  try { fn(); _pass++; results.push({ status: 'PASS', label }); }
  catch (e) { _fail++; results.push({ status: 'FAIL', label, error: e.message }); }
}
function assert(cond, msg)        { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(s, sub, m){ assert(String(s).includes(sub), m || `Expected: ${sub}`); }
function assertNotIncludes(s, sub, m){ assert(!String(s).includes(sub), m || `Must NOT include: ${sub}`); }
function assertMatch(s, re, m)    { assert(re.test(String(s)), m || `Pattern not found: ${re}`); }
function assertNoMatch(s, re, m)  { assert(!re.test(String(s)), m || `Must not match: ${re}`); }

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function stripSqlComments(s) { return s.replace(/--[^\n]*/g, ''); }

const migSql     = read('supabase/7c12a3-artisan-onboarding-completion.sql');
const preCheckSql= read('supabase/7c12a3-artisan-onboarding-completion-precheck.sql');
const verifySql  = read('supabase/7c12a3-artisan-onboarding-completion-verify.sql');
const rollSql    = read('supabase/7c12a3-artisan-onboarding-completion-rollback.sql');
const migExec    = stripSqlComments(migSql);

// Extract only the complete_artisan_onboarding function body from exec SQL
const rpcBlock  = (() => {
  const m = migExec.match(/FUNCTION public\.complete_artisan_onboarding[\s\S]*?END;\s*\$\$/i);
  return m ? m[0] : '';
})();

// Extract UPDATE SET clauses from rpc body only
const setClauseText = (() => {
  const matches = [...rpcBlock.matchAll(/UPDATE\s[\s\S]*?\sSET\s([\s\S]*?)(?=\sWHERE\s|\sRETURNING\s|;)/gi)];
  return matches.map(m => m[1]).join(' ');
})();

/* ══════════════════════════════════════════════════════════ */
/* S1: RPC existence + SECURITY DEFINER contract             */
/* ══════════════════════════════════════════════════════════ */

test('S1.1 CREATE OR REPLACE FUNCTION complete_artisan_onboarding defined', () => {
  assertIncludes(migSql, 'CREATE OR REPLACE FUNCTION public.complete_artisan_onboarding()');
});
test('S1.2 SECURITY DEFINER present', () => {
  assertMatch(migSql, /complete_artisan_onboarding[\s\S]{0,500}?SECURITY DEFINER/i);
});
test('S1.3 SET search_path present', () => {
  assertMatch(migSql, /complete_artisan_onboarding[\s\S]{0,600}?SET search_path = ''/i);
});
test('S1.4 RETURNS jsonb', () => {
  assertMatch(migSql, /RETURNS jsonb/i);
});
test('S1.5 LANGUAGE plpgsql', () => {
  assertIncludes(migSql, 'LANGUAGE plpgsql');
});
test('S1.6 auth.uid() used for identity in executable code', () => {
  assertIncludes(rpcBlock, 'auth.uid()');
});
test('S1.7 FOR UPDATE row lock present', () => {
  assertMatch(rpcBlock, /FOR\s+UPDATE/i);
});
test('S1.8 migration is atomic (BEGIN / COMMIT)', () => {
  assertMatch(migSql, /^\s*BEGIN\s*;/m);
  assertMatch(migSql, /^\s*COMMIT\s*;/m);
});

/* ══════════════════════════════════════════════════════════ */
/* S2: Guards and preconditions                              */
/* ══════════════════════════════════════════════════════════ */

test('S2.1 unauthenticated guard present', () => {
  assertIncludes(migSql, "'unauthenticated'");
});
test('S2.2 not_owner guard present', () => {
  assertIncludes(migSql, "'not_owner'");
});
test('S2.3 not_approved guard present', () => {
  assertIncludes(migSql, "'not_approved'");
});
test('S2.4 profile_incomplete guard present', () => {
  assertIncludes(migSql, "'profile_incomplete'");
});
test('S2.5 claim_status approved check in executable code', () => {
  assertMatch(rpcBlock, /claim_status.*'approved'|'approved'.*claim_status/i);
});
test('S2.6 claimed=true pre-condition checked in executable code', () => {
  assertMatch(rpcBlock, /v_claimed\s+IS\s+NOT\s+TRUE|v_claimed\s*!=\s*true|v_claimed\s*<>\s*true/i);
});
test('S2.7 full_name length checked in executable code (≥3)', () => {
  assertMatch(rpcBlock, /length.*v_full_name.*[<>=]\s*3|3\s*[<>=].*length.*v_full_name/i);
});
test('S2.8 service_category length checked in executable code', () => {
  assertMatch(rpcBlock, /length.*v_service_category.*=\s*0|v_service_cat/i);
});
test('S2.9 city length checked in executable code', () => {
  assertMatch(rpcBlock, /length.*v_city.*=\s*0/i);
});
test('S2.10 missing_fields array used for multi-field validation', () => {
  assertIncludes(migSql, 'missing_fields');
  assertMatch(rpcBlock, /v_missing_fields\s*:=\s*ARRAY\[\]/i);
});
test('S2.11 onboarding gate checks onboarding_completed=true already (idempotent)', () => {
  assertMatch(rpcBlock, /v_onboarding_done\s*=\s*true/i);
});

/* ══════════════════════════════════════════════════════════ */
/* S3: UPDATE SET — required fields written                   */
/* ══════════════════════════════════════════════════════════ */

test('S3.1 onboarding_completed=true in SET clause', () => {
  assertMatch(setClauseText, /onboarding_completed\s*=\s*true/i);
});
test('S3.2 availability=available in SET clause', () => {
  assertMatch(setClauseText, /availability\s*=\s*'available'/i);
});
test('S3.3 updated_at=now() in SET clause', () => {
  assertMatch(setClauseText, /updated_at\s*=\s*now\(\)/i);
});
test('S3.4 WHERE id = v_artisan_id scopes UPDATE (not owner_user_id)', () => {
  assertMatch(rpcBlock, /WHERE\s+id\s*=\s*v_artisan_id/i);
});

/* ══════════════════════════════════════════════════════════ */
/* S4: UPDATE SET — privileged fields NOT written             */
/* (SET-clause scoped — avoids WHERE-clause false positives) */
/* ══════════════════════════════════════════════════════════ */

test('S4.1 owner_user_id NOT in SET clause', () => {
  assertNotIncludes(setClauseText.toLowerCase(), 'owner_user_id');
});
test('S4.2 verified NOT in SET clause', () => {
  assertNoMatch(setClauseText, /verified\s*=/i);
});
test('S4.3 claimed NOT in SET clause', () => {
  assertNoMatch(setClauseText, /\bclaimed\s*=/i);
});
test('S4.4 claim_status NOT in SET clause', () => {
  assertNotIncludes(setClauseText.toLowerCase(), 'claim_status');
});
test('S4.5 verified NOT set to true anywhere in executable SQL', () => {
  assertNoMatch(migExec, /verified\s*=\s*true/i);
});
test('S4.6 no SERVICE_ROLE secret in migration', () => {
  assertNotIncludes(migSql, 'service_role_key');
  assertNotIncludes(migSql, 'eyJhbGci');
});

/* ══════════════════════════════════════════════════════════ */
/* S5: Idempotency                                           */
/* ══════════════════════════════════════════════════════════ */

test('S5.1 already_completed reason present', () => {
  assertIncludes(migSql, "'already_completed'");
});
test('S5.2 already_completed returns ok:true', () => {
  // already_completed is inside a RETURN jsonb_build_object(...) call;
  // look for 'ok', true within a window around the already_completed string in exec SQL
  const idx = migExec.indexOf('already_completed');
  assert(idx >= 0, 'already_completed not found in exec SQL');
  // The surrounding RETURN jsonb_build_object context (look backward up to 150 chars)
  const surrounding = migExec.slice(Math.max(0, idx - 150), idx + 50);
  assertIncludes(surrounding, 'true');
  assertNotIncludes(surrounding, 'false');
});
test('S5.3 already_completed RETURN appears before INSERT/UPDATE in executable path', () => {
  const idxAlready = migExec.indexOf('already_completed');
  const idxUpdate  = migExec.indexOf('UPDATE public.artisans');
  assert(idxAlready > 0 && idxUpdate > 0, 'Both blocks must exist');
  assert(idxAlready < idxUpdate, 'already_completed guard must precede UPDATE');
});

/* ══════════════════════════════════════════════════════════ */
/* S6: Privilege: EXECUTE grants                             */
/* ══════════════════════════════════════════════════════════ */

test('S6.1 REVOKE EXECUTE FROM PUBLIC present', () => {
  assertMatch(migSql, /REVOKE\s+EXECUTE.*complete_artisan_onboarding.*FROM\s+PUBLIC/i);
});
test('S6.2 REVOKE EXECUTE FROM anon present', () => {
  assertMatch(migSql, /REVOKE\s+EXECUTE.*complete_artisan_onboarding.*FROM\s+anon/i);
});
test('S6.3 GRANT EXECUTE TO authenticated present', () => {
  assertMatch(migSql, /GRANT\s+EXECUTE.*complete_artisan_onboarding.*TO\s+authenticated/i);
});
test('S6.4 GRANT EXECUTE TO service_role present', () => {
  assertMatch(migSql, /GRANT\s+EXECUTE.*complete_artisan_onboarding.*TO\s+service_role/i);
});

/* ══════════════════════════════════════════════════════════ */
/* S7: No caller-supplied privileged parameters              */
/* ══════════════════════════════════════════════════════════ */

test('S7.1 no parameters at all (zero-arg RPC — identity from auth.uid())', () => {
  // Function signature must have empty parameter list
  assertMatch(migSql, /complete_artisan_onboarding\s*\(\s*\)/i);
});
test('S7.2 p_owner_user_id absent', () => {
  assertNotIncludes(migSql, 'p_owner_user_id');
});
test('S7.3 p_artisan_id absent', () => {
  assertNotIncludes(migSql, 'p_artisan_id');
});
test('S7.4 p_verified absent', () => {
  assertNotIncludes(migSql, 'p_verified');
});
test('S7.5 p_onboarding_completed absent', () => {
  assertNotIncludes(migSql, 'p_onboarding_completed');
});

/* ══════════════════════════════════════════════════════════ */
/* S8: Dispatch ineligibility until completion               */
/* ══════════════════════════════════════════════════════════ */

test('S8.1 completed reason returns ok:true (artisan becomes dispatch-eligible)', () => {
  assertIncludes(migSql, "'completed'");
});
test('S8.2 availability available only set AFTER all guards pass (order: UPDATE is last)', () => {
  const idxUpdate  = migExec.indexOf('UPDATE public.artisans');
  const idxGuards  = migExec.indexOf('not_approved');
  assert(idxGuards > 0 && idxUpdate > 0);
  assert(idxGuards < idxUpdate, 'Guards must precede UPDATE');
});
test('S8.3 dispatch_request_v1 not touched in migration', () => {
  assertNotIncludes(migExec, 'dispatch_request_v1');
});

/* ══════════════════════════════════════════════════════════ */
/* S9: 7C.12A.2 non-regression                              */
/* ══════════════════════════════════════════════════════════ */

test('S9.1 register_new_artisan not altered by this migration', () => {
  assertNotIncludes(migExec, 'register_new_artisan');
});
test('S9.2 update_artisan_availability not altered by this migration', () => {
  assertNotIncludes(migExec, 'update_artisan_availability');
});
test('S9.3 REVOKE UPDATE on artisans not undone', () => {
  assertNotIncludes(migExec, 'GRANT UPDATE ON public.artisans');
});
test('S9.4 phone_public not referenced in migration executable SQL', () => {
  assertNotIncludes(migExec, 'phone_public');
});

/* ══════════════════════════════════════════════════════════ */
/* S10: 7C.12A.1 non-regression                             */
/* ══════════════════════════════════════════════════════════ */

test('S10.1 approve_artisan_claim not altered', () => {
  assertNotIncludes(migExec, 'approve_artisan_claim');
});
test('S10.2 reject_artisan_claim not altered', () => {
  assertNotIncludes(migExec, 'reject_artisan_claim');
});
test('S10.3 sync_artisan_claim not restored', () => {
  assertNotIncludes(migSql, 'sync_artisan_claim');
});

/* ══════════════════════════════════════════════════════════ */
/* S11: Migration structural checks                         */
/* ══════════════════════════════════════════════════════════ */

test('S11.1 AS $$ / $$; balanced', () => {
  const opens  = (migSql.match(/AS \$\$/g) || []).length;
  const closes = (migSql.match(/^\$\$;/mg) || []).length;
  assert(opens === closes, `AS $$ (${opens}) != $$; (${closes})`);
});
test('S11.2 no ellipsis in migration', () => {
  assertNotIncludes(migSql, '...');
});
test('S11.3 required onboarding fields documented in header', () => {
  assertIncludes(migSql, 'full_name');
  assertIncludes(migSql, 'service_category');
  assertIncludes(migSql, 'city');
});
test('S11.4 description documented as optional (not required)', () => {
  assertMatch(migSql, /description.*optional|optional.*description/i);
});

/* ══════════════════════════════════════════════════════════ */
/* S12: Precheck structural checks                          */
/* ══════════════════════════════════════════════════════════ */

test('S12.1 precheck has 16 PM checks', () => {
  const nums = [...new Set([...preCheckSql.matchAll(/-- PM-(\d+)/g)].map(m => parseInt(m[1])))];
  assert(nums.length >= 16, `Expected ≥16 PM checks, found ${nums.length}`);
});
test('S12.2 precheck is READ ONLY (no DML/DDL in executable SQL)', () => {
  const exec = stripSqlComments(preCheckSql);
  assertNotIncludes(exec, 'INSERT INTO');
  assertNotIncludes(exec, 'UPDATE public');
  assertNotIncludes(exec, 'DELETE FROM');
  assertNotIncludes(exec, 'DROP FUNCTION');
  assertNotIncludes(exec, 'DROP TABLE');
  assertNotIncludes(exec, 'ALTER TABLE');
});
test('S12.3 precheck checks PM-3 (no table-level UPDATE regression)', () => {
  assertMatch(preCheckSql, /PM-3/);
  assertIncludes(preCheckSql, 'table-level UPDATE');
});
test('S12.4 precheck checks PM-4 onboarding_completed column grant', () => {
  assertMatch(preCheckSql, /PM-4/);
  assertIncludes(preCheckSql, 'onboarding_completed');
});
test('S12.5 precheck checks PM-14 RPC collision', () => {
  assertMatch(preCheckSql, /PM-14/);
  assertIncludes(preCheckSql, 'complete_artisan_onboarding');
});

/* ══════════════════════════════════════════════════════════ */
/* S13: Verify structural checks                            */
/* ══════════════════════════════════════════════════════════ */

test('S13.1 verify has 22 V-checks', () => {
  const nums = [...new Set([...verifySql.matchAll(/-- V-(\d+)/g)].map(m => parseInt(m[1])))];
  assert(nums.length >= 22, `Expected ≥22 V-checks, found ${nums.length}`);
});
test('S13.2 verify uses v_def_exec for comment-stripped SET checks', () => {
  assertIncludes(verifySql, 'v_def_exec');
  assertIncludes(verifySql, "regexp_replace(v_def, '--[^\\n]*', '', 'g')");
});
test('S13.3 verify uses SET-clause extraction (regexp_matches)', () => {
  assertIncludes(verifySql, 'regexp_matches');
  assertIncludes(verifySql, 'string_agg');
});
test('S13.4 verify checks V-10 onboarding_completed in SET', () => {
  assertMatch(verifySql, /V-10/);
  assertIncludes(verifySql, 'onboarding_completed');
});
test('S13.5 verify checks V-12 owner_user_id NOT in SET', () => {
  assertMatch(verifySql, /V-12/);
  assertIncludes(verifySql, 'owner_user_id');
});
test('S13.6 verify checks V-13 verified NOT in SET', () => {
  assertMatch(verifySql, /V-13/);
});
test('S13.7 verify checks V-18 no table-level UPDATE regression', () => {
  assertMatch(verifySql, /V-18/);
  assertIncludes(verifySql, 'table-level UPDATE');
});
test('S13.8 verify checks V-22 dispatch_request_v1 regression', () => {
  assertMatch(verifySql, /V-22/);
  assertIncludes(verifySql, 'dispatch_request_v1');
});
test('S13.9 verify is READ ONLY', () => {
  const exec = stripSqlComments(verifySql);
  assertNotIncludes(exec, 'INSERT INTO');
  assertNotIncludes(exec, 'UPDATE public');
  assertNotIncludes(exec, 'DROP FUNCTION');
  assertNotIncludes(exec, 'ALTER TABLE');
});

/* ══════════════════════════════════════════════════════════ */
/* S14: Rollback structural checks                          */
/* ══════════════════════════════════════════════════════════ */

test('S14.1 rollback drops complete_artisan_onboarding', () => {
  assertMatch(rollSql, /DROP\s+FUNCTION\s+IF\s+EXISTS.*complete_artisan_onboarding/i);
});
test('S14.2 rollback warns about completed artisan rows (data not reverted)', () => {
  assertIncludes(rollSql, 'onboarding_completed = true');
  assertIncludes(rollSql, 'ROLLBACK WARN');
});
test('S14.3 rollback does NOT touch 7C.12A.2 RPCs in executable SQL', () => {
  const rollExec = stripSqlComments(rollSql);
  assertNotIncludes(rollExec, 'register_new_artisan');
  assertNotIncludes(rollExec, 'update_artisan_availability');
});
test('S14.4 rollback does NOT touch 7C.12A.1 RPCs in executable SQL', () => {
  const rollExec = stripSqlComments(rollSql);
  assertNotIncludes(rollExec, 'approve_artisan_claim');
  assertNotIncludes(rollExec, 'reject_artisan_claim');
});
test('S14.5 rollback does NOT restore table-level UPDATE grant', () => {
  assertNotIncludes(rollSql, 'GRANT UPDATE ON public.artisans');
});

/* ── Summary ─────────────────────────────────────────────── */
console.log('\n══ 7C.12A.3 Onboarding Completion Gate Tests ══');
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  const err  = r.status === 'FAIL' ? ` — ${r.error}` : '';
  console.log(`  ${icon} [${r.status}] ${r.label}${err}`);
});
console.log(`\n  Total: ${_pass + _fail} | PASS: ${_pass} | FAIL: ${_fail}`);
if (_fail > 0) { console.error(`\n  ✗ ${_fail} test(s) FAILED`); process.exit(1); }
else { console.log(`\n  ✓ ALL ${_pass} PASS`); process.exit(0); }
