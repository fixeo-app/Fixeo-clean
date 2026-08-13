/**
 * 7C.12A.2 — New Artisan Canonical Registration Tests (v2 — Hardened)
 * estimator-v2-12a2-registration-tests.js
 *
 * Test sections:
 *  Section 1:  RPC contract: register_new_artisan SQL logic
 *  Section 2:  Post-registration state invariants
 *  Section 3:  Security: no caller-supplied privileged fields
 *  Section 4:  Security: no privilege escalation in executable code
 *  Section 5:  Idempotency / duplicate owner guard
 *  Section 6:  Unauthenticated blocked
 *  Section 7:  Input validation guards
 *  Section 8:  Dispatch ineligibility invariants
 *  Section 9:  Role promotion
 *  Section 10: Admin role never demoted
 *  Section 11: BLOCKER 1 — REVOKE table-level UPDATE
 *  Section 12: BLOCKER 1 — Column-specific GRANTs for safe fields
 *  Section 13: BLOCKER 1 — Privileged fields NOT column-granted
 *  Section 14: BLOCKER 1 — update_artisan_availability RPC (gated)
 *  Section 15: BLOCKER 2 — users row existence check / identity_broken
 *  Section 16: BLOCKER 2 — profiles row / phone persistence
 *  Section 17: localStorage ghost authority removed
 *  Section 18: Redirect targets V2, not V1
 *  Section 19: 7C.12A.1 non-regression
 *  Section 20: 7C.11 dispatch non-regression
 *  Section 21: Unique index correctness
 *  Section 22: Rollback file structural checks
 *  Section 23: Precheck file structural checks
 *  Section 24: Verify file structural checks
 *  Section 25: Migration structural checks
 */

'use strict';

let _pass = 0, _fail = 0, _skip = 0;
const results = [];
function test(label, fn) {
  try { fn(); _pass++; results.push({ status: 'PASS', label }); }
  catch (e) { _fail++; results.push({ status: 'FAIL', label, error: e.message }); }
}
function skip(label) { _skip++; results.push({ status: 'SKIP', label }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(str, sub, msg) { assert(String(str).includes(sub), msg || `Expected: ${sub}`); }
function assertNotIncludes(str, sub, msg) { assert(!String(str).includes(sub), msg || `Must NOT include: ${sub}`); }
function assertMatch(str, re, msg) { assert(re.test(String(str)), msg || `Pattern not found: ${re}`); }
function assertNoMatch(str, re, msg) { assert(!re.test(String(str)), msg || `Pattern must not match: ${re}`); }

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const migrationSql   = readFile('supabase/7c12a2-new-artisan-registration.sql');
const precheckSql    = readFile('supabase/7c12a2-new-artisan-registration-precheck.sql');
const verifySql      = readFile('supabase/7c12a2-new-artisan-registration-verify.sql');
const rollbackSql    = readFile('supabase/7c12a2-new-artisan-registration-rollback.sql');
const v4Js           = readFile('js/artisan-onboarding-v4.js');
const v1Js           = readFile('js/artisan-onboarding.js');
const dashV2Js       = readFile('js/fixeo-artisan-dashboard-v2.js');
const onboardingHtml = readFile('onboarding-artisan.html');

function stripSqlComments(sql) { return sql.replace(/--[^\n]*/g, ''); }
function stripJsComments(js)   { return js.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }

const migrationExec  = stripSqlComments(migrationSql);
const v4JsExec       = stripJsComments(v4Js);
const dashV2JsExec   = stripJsComments(dashV2Js);

/* ══════════════════════════════════════════════════════════ */
/* SECTION 1: register_new_artisan SQL contract              */
/* ══════════════════════════════════════════════════════════ */

test('S1.1 register_new_artisan function defined', () => {
  assertIncludes(migrationSql, 'CREATE OR REPLACE FUNCTION public.register_new_artisan(');
});
test('S1.2 SECURITY DEFINER on register_new_artisan', () => {
  assertMatch(migrationSql, /register_new_artisan[\s\S]{0,500}?SECURITY DEFINER/i);
});
test('S1.3 SET search_path = empty on register_new_artisan', () => {
  assertMatch(migrationSql, /register_new_artisan[\s\S]{0,600}?SET search_path = ''/i);
});
test('S1.4 LANGUAGE plpgsql', () => {
  assertIncludes(migrationSql, 'LANGUAGE plpgsql');
});
test('S1.5 returns JSONB', () => {
  assertMatch(migrationSql, /RETURNS jsonb/i);
});
test('S1.6 auth.uid() called in function body', () => {
  assertIncludes(migrationSql, 'auth.uid()');
});
test('S1.7 v_uid IS NULL unauthenticated guard', () => {
  assertMatch(migrationExec, /v_uid\s+IS\s+NULL/i);
});
test('S1.8 FOR UPDATE lock on duplicate owner check', () => {
  assertMatch(migrationExec, /FOR\s+UPDATE/i);
});
test('S1.9 unique_violation EXCEPTION handler', () => {
  assertIncludes(migrationSql, 'unique_violation');
});
test('S1.10 INSERT INTO public.artisans present', () => {
  assertMatch(migrationExec, /INSERT\s+INTO\s+public\.artisans/i);
});
test('S1.11 owner_user_id set to v_uid only', () => {
  assertMatch(migrationExec, /owner_user_id.*v_uid|v_uid.*owner_user_id/i);
});
test('S1.12 users.role updated to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?role\s*=\s*'artisan'/i);
});
test('S1.13 profiles.role updated to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.profiles[\s\S]*?role\s*=\s*'artisan'/i);
});
test('S1.14 migration is atomic (BEGIN / COMMIT)', () => {
  assertMatch(migrationSql, /^\s*BEGIN\s*;/m);
  assertMatch(migrationSql, /^\s*COMMIT\s*;/m);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 2: Post-registration state invariants             */
/* ══════════════════════════════════════════════════════════ */

test('S2.1 claimed in INSERT column list', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'claimed');
  assertIncludes(block, 'true');
});
test('S2.2 claim_status=approved in INSERT', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'claim_status');
  assertIncludes(block, "'approved'");
});
test('S2.3 onboarding_completed=false in INSERT', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'onboarding_completed');
  assertIncludes(block, 'false');
});
test('S2.4 availability=unavailable in INSERT', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'availability');
  assertIncludes(block, "'unavailable'");
});
test('S2.5 verified=false in INSERT', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'verified');
  assertIncludes(block, 'false');
});
test('S2.6 already_registered idempotent path exists', () => {
  assertIncludes(migrationSql, "'already_registered'");
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 3: No caller-supplied privileged fields           */
/* ══════════════════════════════════════════════════════════ */

test('S3.1 p_owner_user_id absent from signature', () => {
  assertNotIncludes(migrationSql, 'p_owner_user_id');
});
test('S3.2 p_user_id absent from signature', () => {
  assertNotIncludes(migrationSql, 'p_user_id');
});
test('S3.3 p_artisan_id absent (7C.12A.1 constraint)', () => {
  assertNotIncludes(migrationSql, 'p_artisan_id');
});
test('S3.4 p_verified absent from signature', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)/i)?.[0] || '';
  assertNotIncludes(sig, 'p_verified');
});
test('S3.5 p_onboarding_completed absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)/i)?.[0] || '';
  assertNotIncludes(sig, 'p_onboarding');
});
test('S3.6 p_availability absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)/i)?.[0] || '';
  assertNotIncludes(sig, 'p_availability');
});
test('S3.7 p_claim_status absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)/i)?.[0] || '';
  assertNotIncludes(sig, 'p_claim_status');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 4: No privilege escalation in executable code     */
/* ══════════════════════════════════════════════════════════ */

test('S4.1 verified NOT set to true in executable SQL', () => {
  assertNoMatch(migrationExec, /verified\s*=\s*true/i);
});
test('S4.2 onboarding_completed NOT set to true in executable SQL', () => {
  assertNoMatch(migrationExec, /onboarding_completed\s*=\s*true/i);
});
test('S4.3 availability NOT set to available in register INSERT', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertNotIncludes(insertBlock, "'available'");
});
test('S4.4 no SERVICE_ROLE secret in migration', () => {
  assertNotIncludes(migrationSql, 'service_role_key');
  assertNotIncludes(migrationSql, 'eyJhbGci');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 5: Idempotency / duplicate owner guard            */
/* ══════════════════════════════════════════════════════════ */

test('S5.1 partial UNIQUE index on owner_user_id defined', () => {
  assertMatch(migrationSql, /CREATE\s+UNIQUE\s+INDEX.*artisans_owner_user_id_unique/i);
});
test('S5.2 index is partial (WHERE owner_user_id IS NOT NULL)', () => {
  assertMatch(migrationSql, /WHERE\s+owner_user_id\s+IS\s+NOT\s+NULL/i);
});
test('S5.3 idempotent index creation (IF NOT EXISTS)', () => {
  assertMatch(migrationSql, /IF NOT EXISTS/i);
});
test('S5.4 already_registered returned on duplicate without INSERT', () => {
  const afterGuard = migrationExec.split('v_existing_id IS NOT NULL')[1] || '';
  const firstReturn = afterGuard.match(/RETURN[\s\S]*?;/i)?.[0] || '';
  assertIncludes(firstReturn, 'already_registered');
  const tillReturn = afterGuard.split(/RETURN/i)[0] || '';
  assertNotIncludes(tillReturn, 'INSERT');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 6: Unauthenticated blocked                        */
/* ══════════════════════════════════════════════════════════ */

test('S6.1 unauthenticated returns ok:false reason:unauthenticated', () => {
  assertIncludes(migrationSql, "'unauthenticated'");
});
test('S6.2 anon + PUBLIC REVOKED from register_new_artisan EXECUTE', () => {
  assertMatch(migrationSql, /REVOKE\s+EXECUTE.*FROM\s+anon/i);
  assertMatch(migrationSql, /REVOKE\s+EXECUTE.*FROM\s+PUBLIC/i);
});
test('S6.3 authenticated GRANTED EXECUTE on register_new_artisan', () => {
  assertMatch(migrationSql, /GRANT\s+EXECUTE.*register_new_artisan.*TO\s+authenticated/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 7: Input validation guards                        */
/* ══════════════════════════════════════════════════════════ */

test('S7.1 name_required validation', () => {
  assertIncludes(migrationSql, "'name_required'");
});
test('S7.2 category_required validation', () => {
  assertIncludes(migrationSql, "'category_required'");
});
test('S7.3 city_required validation', () => {
  assertIncludes(migrationSql, "'city_required'");
});
test('S7.4 description_too_long with 500 char limit', () => {
  assertIncludes(migrationSql, "'description_too_long'");
  assertMatch(migrationSql, /500/);
});
test('S7.5 name minimum 3 chars enforced', () => {
  assertMatch(migrationSql, /length.*v_full_name.*[<>=]\s*3|3\s*[<>=].*length.*v_full_name/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 8: Dispatch ineligibility                         */
/* ══════════════════════════════════════════════════════════ */

test('S8.1 onboarding_completed=false keeps new artisan dispatch-ineligible', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, 'onboarding_completed');
  assertIncludes(block, 'false');
});
test('S8.2 availability=unavailable keeps new artisan dispatch-ineligible', () => {
  const block = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(block, "'unavailable'");
});
test('S8.3 dispatch_request_v1 not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'dispatch_request_v1');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 9: Role promotion                                 */
/* ══════════════════════════════════════════════════════════ */

test('S9.1 users.role promoted to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?role\s*=\s*'artisan'/i);
});
test('S9.2 profiles.role promoted to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.profiles[\s\S]*?role\s*=\s*'artisan'/i);
});
test('S9.3 users UPDATE scoped to v_uid only', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?WHERE\s+id\s*=\s*v_uid/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 10: Admin role never demoted                      */
/* ══════════════════════════════════════════════════════════ */

test('S10.1 admin demotion guard in users UPDATE executable code', () => {
  assertMatch(migrationExec, /role\s*!=\s*'admin'|role\s*<>\s*'admin'/i);
});
test('S10.2 admin guard in profiles UPDATE', () => {
  const profilesBlock = migrationExec.match(/UPDATE\s+public\.profiles[\s\S]*?;/i)?.[0] || '';
  assertMatch(profilesBlock, /admin/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 11: BLOCKER 1 — REVOKE table-level UPDATE         */
/* ══════════════════════════════════════════════════════════ */

test('S11.1 REVOKE UPDATE on artisans FROM authenticated present', () => {
  assertMatch(migrationExec, /REVOKE\s+UPDATE\s+ON\s+public\.artisans\s+FROM\s+authenticated/i);
});
test('S11.2 REVOKE UPDATE on artisans FROM anon present', () => {
  assertMatch(migrationExec, /REVOKE\s+UPDATE\s+ON\s+public\.artisans\s+FROM\s+anon/i);
});
test('S11.3 BLOCKER 1 root cause documented in migration header', () => {
  assertIncludes(migrationSql, 'BLOCKER 1');
  assertIncludes(migrationSql, 'REVOKE');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 12: BLOCKER 1 — Column-specific GRANTs            */
/* ══════════════════════════════════════════════════════════ */

test('S12.1 GRANT UPDATE column-specific for safe profile fields', () => {
  assertMatch(migrationExec, /GRANT\s+UPDATE\s*\(/i);
});
test('S12.2 full_name in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertIncludes(grantBlock, 'full_name');
});
test('S12.3 service_category in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertIncludes(grantBlock, 'service_category');
});
test('S12.4 city in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertIncludes(grantBlock, 'city');
});
test('S12.5 description in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertIncludes(grantBlock, 'description');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 13: BLOCKER 1 — Privileged fields NOT granted     */
/* ══════════════════════════════════════════════════════════ */

test('S13.1 owner_user_id NOT in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertNotIncludes(grantBlock, 'owner_user_id');
});
test('S13.2 claimed NOT in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  // 'claimed' should not appear as standalone word (service_category contains no 'claimed')
  assertNoMatch(grantBlock, /\bclaimed\b/i);
});
test('S13.3 claim_status NOT in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertNotIncludes(grantBlock, 'claim_status');
});
test('S13.4 onboarding_completed NOT in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertNotIncludes(grantBlock, 'onboarding_completed');
});
test('S13.5 verified NOT in column grant', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertNotIncludes(grantBlock, 'verified');
});
test('S13.6 availability NOT in column grant (gated via RPC)', () => {
  const grantBlock = migrationExec.match(/GRANT\s+UPDATE\s*\([^)]*\)/i)?.[0] || '';
  assertNotIncludes(grantBlock, 'availability');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 14: BLOCKER 1 — update_artisan_availability RPC   */
/* ══════════════════════════════════════════════════════════ */

test('S14.1 update_artisan_availability RPC defined', () => {
  assertIncludes(migrationSql, 'CREATE OR REPLACE FUNCTION public.update_artisan_availability(');
});
test('S14.2 update_artisan_availability is SECURITY DEFINER', () => {
  assertMatch(migrationSql, /update_artisan_availability[\s\S]{0,500}?SECURITY DEFINER/i);
});
test('S14.3 update_artisan_availability has SET search_path', () => {
  assertMatch(migrationSql, /update_artisan_availability[\s\S]{0,600}?SET search_path = ''/i);
});
test('S14.4 onboarding_required gate present', () => {
  assertIncludes(migrationSql, "'onboarding_required'");
});
test('S14.5 available and busy require onboarding in executable code', () => {
  // The gate: v_target_status IN ('available', 'busy') AND NOT v_onboarding_done
  const availRpc = migrationExec.match(/update_artisan_availability[\s\S]*?END;\s*\$\$/i)?.[0] || '';
  assertMatch(availRpc, /onboarding/i);
  assertMatch(availRpc, /'available'.*'busy'|'busy'.*'available'/i);
});
test('S14.6 unavailable always permitted (artisan can go offline)', () => {
  assertIncludes(migrationSql, "'unavailable'");
  assertMatch(migrationSql, /unavailable.*always|always.*unavailable/i);
});
test('S14.7 update_artisan_availability does NOT SET owner_user_id (SELECT WHERE is OK)', () => {
  // The RPC reads owner_user_id in a WHERE clause — that is correct.
  // What's forbidden: a SET owner_user_id = ... in an UPDATE statement.
  const availRpcExec = migrationExec.match(/update_artisan_availability[\s\S]*?END;\s*\$\$/i)?.[0] || '';
  // Check UPDATE...SET blocks only — not WHERE clauses
  const updateSetBlocks = [...availRpcExec.matchAll(/UPDATE[\s\S]*?SET([\s\S]*?)(WHERE|RETURNING|;)/gi)]
    .map(m => m[1]).join(' ');
  assertNotIncludes(updateSetBlocks, 'owner_user_id');
});
test('S14.8 update_artisan_availability does NOT write verified', () => {
  const availRpcExec = migrationExec.match(/update_artisan_availability[\s\S]*?END;\s*\$\$/i)?.[0] || '';
  assertNoMatch(availRpcExec, /verified\s*=/i);
});
test('S14.9 update_artisan_availability does NOT write claimed', () => {
  const availRpcExec = migrationExec.match(/update_artisan_availability[\s\S]*?END;\s*\$\$/i)?.[0] || '';
  assertNoMatch(availRpcExec, /\bclaimed\s*=/i);
});
test('S14.10 authenticated GRANTED EXECUTE on update_artisan_availability', () => {
  assertMatch(migrationSql, /GRANT\s+EXECUTE.*update_artisan_availability.*TO\s+authenticated/i);
});
test('S14.11 anon REVOKED from update_artisan_availability', () => {
  assertMatch(migrationSql, /REVOKE\s+EXECUTE.*update_artisan_availability.*FROM\s+anon/i);
});
test('S14.12 artisans_owner_update policy replaced with narrowed version', () => {
  assertMatch(migrationExec, /DROP\s+POLICY\s+IF\s+EXISTS.*artisans_owner_update/i);
  assertMatch(migrationExec, /CREATE\s+POLICY.*artisans_owner_update/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 15: BLOCKER 2 — users row integrity               */
/* ══════════════════════════════════════════════════════════ */

test('S15.1 users row existence checked before INSERT (BLOCKER 2)', () => {
  // NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid)
  assertMatch(migrationExec, /NOT\s+EXISTS[\s\S]*?public\.users[\s\S]*?v_uid/i);
});
test('S15.2 identity_broken hard-fail present', () => {
  assertIncludes(migrationSql, "'identity_broken'");
});
test('S15.3 identity_broken returns ok:false (not ok:true with broken identity)', () => {
  // Find the executable identity_broken path (skip comment block — look for RETURN jsonb after the check)
  const exec = migrationExec;
  const idx = exec.indexOf('identity_broken');
  assert(idx >= 0, 'identity_broken not found in exec SQL');
  // From the identity_broken string, find the surrounding RETURN jsonb_build_object
  const surrounding = exec.slice(Math.max(0, idx - 200), idx + 400);
  // Must contain false and must NOT contain 'registered' as the reason
  assertIncludes(surrounding, 'false');
  assertNotIncludes(surrounding, "'registered'");
});
test('S15.4 registration does NOT return ok:true with missing users row', () => {
  // identity_broken path must RETURN before the INSERT
  const idxIdentity = migrationExec.indexOf('identity_broken');
  const idxInsert   = migrationExec.indexOf('INSERT INTO public.artisans');
  assert(idxIdentity > 0 && idxInsert > 0, 'Both blocks must exist');
  assert(idxIdentity < idxInsert, 'identity_broken guard must appear before INSERT');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 16: BLOCKER 2 — profiles + phone persistence      */
/* ══════════════════════════════════════════════════════════ */

test('S16.1 phone persisted to public.users.phone in executable code', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?phone/i);
});
test('S16.2 phone persisted to public.profiles.phone in executable code', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.profiles[\s\S]*?phone/i);
});
test('S16.3 phone NOT written to artisans.phone_public', () => {
  assertNotIncludes(migrationExec, 'phone_public');
});
test('S16.4 profiles UPDATE is non-fatal (not HARD FAIL on 0 rows)', () => {
  // GET DIAGNOSTICS for profiles; no RAISE EXCEPTION on v_prof_updated = 0
  assertIncludes(migrationSql, 'v_prof_updated');
  assertNotIncludes(migrationSql.match(/v_prof_updated[\s\S]{0,300}?RETURN/i)?.[0] || '', 'RAISE EXCEPTION');
});
test('S16.5 users UPDATE failure does not silently succeed (admin case documented)', () => {
  assertIncludes(migrationSql, 'v_users_updated');
});
test('S16.6 phone conditional (empty string skips overwrite)', () => {
  // CASE WHEN v_phone != '' THEN v_phone ELSE phone END
  assertMatch(migrationExec, /v_phone\s*!=\s*''|v_phone\s*<>\s*''/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 17: localStorage ghost authority removed          */
/* ══════════════════════════════════════════════════════════ */

test('S17.1 V4 JS clears ghost localStorage keys', () => {
  assertIncludes(v4Js, '_clearGhostLocalStorage');
  assertIncludes(v4Js, "'user_role'");
  assertIncludes(v4Js, "'user_logged'");
  assertIncludes(v4Js, "'fixeo_artisan_onboarding_entries_v1'");
});
test('S17.2 V4 JS does NOT call addArtisan in executable code', () => {
  assertNotIncludes(v4JsExec, 'addArtisan');
});
test('S17.3 V4 JS does NOT call createArtisanSession in executable code', () => {
  assertNotIncludes(v4JsExec, 'createArtisanSession');
});
test('S17.4 V4 JS does NOT write user_role to localStorage in main path', () => {
  const mainPath = v4Js.split('_legacyLocalStorageFallback')[0] || v4Js;
  assertNotIncludes(mainPath, "localStorage.setItem('user_role'");
});
test('S17.5 V4 JS draft does not store phone (security)', () => {
  const saveDraftExec = stripJsComments(v4Js.match(/function saveDraft[\s\S]*?setItem[\s\S]*?\}\s*\)/)?.[0] || '');
  assertNoMatch(saveDraftExec, /phone\s*:/);
});
test('S17.6 V4 JS does NOT directly update artisans availability', () => {
  // After BLOCKER 1 hardening, V4 must not do .from('artisans').update({availability})
  assertNotIncludes(v4JsExec, "from('artisans')");
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 18: Redirect targets V2, not V1                   */
/* ══════════════════════════════════════════════════════════ */

test('S18.1 V4 JS REDIRECT_ARTISAN = dashboard-artisan-v2.html', () => {
  assertIncludes(v4Js, "'dashboard-artisan-v2.html'");
});
test('S18.2 V4 override fires before V1 (capture phase + stopImmediatePropagation)', () => {
  assertIncludes(v4Js, 'stopImmediatePropagation');
  assertIncludes(v4Js, 'capture phase');
});
test('S18.3 onboarding-artisan.html loads v4 script', () => {
  assertIncludes(onboardingHtml, 'artisan-onboarding-v4.js');
});
test('S18.4 V4 script loads AFTER V3', () => {
  const v3pos = onboardingHtml.indexOf('artisan-onboarding-v3.js');
  const v4pos = onboardingHtml.indexOf('artisan-onboarding-v4.js');
  assert(v3pos >= 0 && v4pos > v3pos, 'V4 must load after V3');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 19: 7C.12A.1 non-regression                      */
/* ══════════════════════════════════════════════════════════ */

test('S19.1 approve_artisan_claim not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'approve_artisan_claim');
});
test('S19.2 reject_artisan_claim not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'reject_artisan_claim');
});
test('S19.3 claim_requests not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'claim_requests');
});
test('S19.4 sync_artisan_claim not restored', () => {
  assertNotIncludes(migrationSql, 'sync_artisan_claim');
});
test('S19.5 dashboard V2 identity uses auth.uid() → owner_user_id (display reads ok)', () => {
  assertIncludes(dashV2Js, "eq('owner_user_id', userId)");
  // phone_public in _loadArtisanProfile body must be comment-only
  const rawLoadFn = dashV2Js.match(/function _loadArtisanProfile[\s\S]*?return null;\s*\}/i)?.[0] || '';
  const execLoadFn = rawLoadFn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assertNotIncludes(execLoadFn, 'phone_public');
});
test('S19.6 register_new_artisan does NOT reference phone_public in executable SQL', () => {
  assertNotIncludes(migrationExec, 'phone_public');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 20: 7C.11 dispatch non-regression                */
/* ══════════════════════════════════════════════════════════ */

test('S20.1 dispatch_request_v1 not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'dispatch_request_v1');
});
test('S20.2 register_new_artisan leaves new artisan dispatch-ineligible', () => {
  assertNoMatch(migrationExec, /onboarding_completed\s*=\s*true/i);
  assertNoMatch(migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '', /availability.*'available'/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 21: Unique index correctness                      */
/* ══════════════════════════════════════════════════════════ */

test('S21.1 unique index artisans_owner_user_id_unique defined', () => {
  assertMatch(migrationSql, /CREATE\s+UNIQUE\s+INDEX.*artisans_owner_user_id_unique/i);
});
test('S21.2 partial index (WHERE owner_user_id IS NOT NULL)', () => {
  assertMatch(migrationSql, /WHERE\s+owner_user_id\s+IS\s+NOT\s+NULL/i);
});
test('S21.3 rollback drops unique index', () => {
  assertIncludes(rollbackSql, 'artisans_owner_user_id_unique');
  assertMatch(rollbackSql, /DROP\s+INDEX\s+IF\s+EXISTS/i);
});
test('S21.4 rollback drops register_new_artisan', () => {
  assertMatch(rollbackSql, /DROP\s+FUNCTION\s+IF\s+EXISTS.*register_new_artisan/i);
});
test('S21.5 rollback drops update_artisan_availability', () => {
  assertMatch(rollbackSql, /DROP\s+FUNCTION\s+IF\s+EXISTS.*update_artisan_availability/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 22: Rollback structural checks                    */
/* ══════════════════════════════════════════════════════════ */

test('S22.1 rollback has HARD STOP on self-registered artisans', () => {
  assertIncludes(rollbackSql, 'ROLLBACK HARD STOP');
  assertIncludes(rollbackSql, 'owner_user_id IS NOT NULL');
});
test('S22.2 rollback restores table-level UPDATE grant', () => {
  assertMatch(rollbackSql, /GRANT\s+UPDATE\s+ON\s+public\.artisans\s+TO\s+authenticated/i);
});
test('S22.3 rollback revokes column-specific grants', () => {
  assertMatch(rollbackSql, /REVOKE\s+UPDATE\s*\([^)]*full_name[^)]*\)/i);
});
test('S22.4 rollback restores artisans_owner_update policy', () => {
  assertMatch(rollbackSql, /CREATE\s+POLICY.*artisans_owner_update/i);
});
test('S22.5 rollback does not touch 7C.12A.1 RPCs in executable SQL', () => {
  // approve_artisan_claim may appear in comments documenting what is NOT touched
  const rollbackExec = stripSqlComments(rollbackSql);
  assertNotIncludes(rollbackExec, 'approve_artisan_claim');
  assertNotIncludes(rollbackExec, 'reject_artisan_claim');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 23: Precheck structural checks                    */
/* ══════════════════════════════════════════════════════════ */

test('S23.1 precheck has 52 PM checks (PM-1 to PM-52)', () => {
  const nums = [...new Set([...precheckSql.matchAll(/-- PM-(\d+)/g)].map(m => parseInt(m[1])))];
  assert(nums.length >= 52, `Expected ≥52 PM checks, found ${nums.length}`);
});
test('S23.2 precheck covers BLOCKER 1 (PM-36 to PM-39)', () => {
  assertMatch(precheckSql, /PM-36/);
  assertMatch(precheckSql, /PM-39/);
  assertIncludes(precheckSql, 'BLOCKER 1');
});
test('S23.3 precheck covers BLOCKER 2 (PM-40 to PM-44)', () => {
  assertMatch(precheckSql, /PM-40/);
  assertMatch(precheckSql, /PM-44/);
  assertIncludes(precheckSql, 'BLOCKER 2');
});
test('S23.4 precheck is READ ONLY (no CREATE/ALTER/DROP/INSERT/UPDATE/DELETE in executable SQL)', () => {
  const exec = stripSqlComments(precheckSql);
  // Allowed: inside RAISE EXCEPTION/NOTICE string literals
  // Forbidden: actual DDL/DML statements
  // Check: no standalone CREATE outside a string context
  // The precheck wraps everything in DO $$ ... $$; with only RAISE and SELECT
  assertNotIncludes(exec, 'INSERT INTO');
  assertNotIncludes(exec, 'UPDATE public');
  assertNotIncludes(exec, 'DELETE FROM');
  assertNotIncludes(exec, 'DROP TABLE');
  assertNotIncludes(exec, 'DROP FUNCTION');
  assertNotIncludes(exec, 'DROP INDEX');
  assertNotIncludes(exec, 'ALTER TABLE');
});
test('S23.5 precheck checks pm-49 phone_public audit', () => {
  assertMatch(precheckSql, /PM-49/);
  assertIncludes(precheckSql, 'phone_public');
});
test('S23.6 precheck checks users.phone and profiles.phone columns (BLOCKER 2)', () => {
  assertMatch(precheckSql, /PM-43/);
  assertMatch(precheckSql, /PM-44/);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 24: Verify structural checks                      */
/* ══════════════════════════════════════════════════════════ */

test('S24.1 verify has 36 V-checks', () => {
  const nums = [...new Set([...verifySql.matchAll(/-- V-(\d+)/g)].map(m => parseInt(m[1])))];
  assert(nums.length >= 36, `Expected ≥36 V-checks, found ${nums.length}`);
});
test('S24.2 verify uses v_def_exec for comment-stripped checks', () => {
  assertIncludes(verifySql, 'v_def_exec');
  assertIncludes(verifySql, "regexp_replace(v_def, '--[^\\n]*', '', 'g')");
});
test('S24.3 verify checks V-16 (authenticated no table-level UPDATE)', () => {
  assertMatch(verifySql, /V-16/);
  assertIncludes(verifySql, 'table-level UPDATE');
});
test('S24.4 verify checks V-20 and V-21 (privileged columns not granted)', () => {
  assertMatch(verifySql, /V-20/);
  assertMatch(verifySql, /V-21/);
  assertIncludes(verifySql, 'owner_user_id');
  assertIncludes(verifySql, 'onboarding_completed');
});
test('S24.5 verify checks V-9 identity_broken (BLOCKER 2)', () => {
  assertMatch(verifySql, /V-9/);
  assertIncludes(verifySql, 'identity_broken');
});
test('S24.6 verify checks V-32 onboarding gate in update_artisan_availability', () => {
  assertMatch(verifySql, /V-32/);
  assertIncludes(verifySql, 'onboarding_completed');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 25: Migration structural checks                   */
/* ══════════════════════════════════════════════════════════ */

test('S25.1 every AS $$ has matching $$;', () => {
  const opens  = (migrationSql.match(/AS \$\$/g) || []).length;
  const closes = (migrationSql.match(/^\$\$;/mg) || []).length;
  assert(opens === closes, `AS $$ (${opens}) !== $$; (${closes})`);
});
test('S25.2 every DO $$ has matching END $$;', () => {
  const opens  = (migrationSql.match(/^DO \$\$/mg) || []).length;
  const closes = (migrationSql.match(/^END \$\$;/mg) || []).length;
  assert(opens === closes, `DO $$ (${opens}) !== END $$; (${closes})`);
});
test('S25.3 no ellipsis in migration', () => {
  assertNotIncludes(migrationSql, '...');
});
test('S25.4 migration header documents column writability matrix', () => {
  assertIncludes(migrationSql, 'COLUMN WRITABILITY MATRIX');
  assertIncludes(migrationSql, 'owner_user_id');
  assertIncludes(migrationSql, 'onboarding_completed');
});
test('S25.5 both BLOCKER resolutions documented in header', () => {
  assertIncludes(migrationSql, 'BLOCKER 1');
  assertIncludes(migrationSql, 'BLOCKER 2');
});
test('S25.6 V4 JS _fxAoV4Loaded guard prevents double-init', () => {
  assertIncludes(v4Js, '_fxAoV4Loaded');
});
test('S25.7 V4 JS calls register_new_artisan RPC', () => {
  assertIncludes(v4Js, "'register_new_artisan'");
});
test('S25.8 V4 JS owner_user_id not in RPC call params', () => {
  const rpcCall = v4Js.match(/rpc\('register_new_artisan'[\s\S]*?\}\)/)?.[0] || '';
  assertNotIncludes(rpcCall, 'owner_user_id');
});

/* ── Summary ──────────────────────────────────────────────── */
console.log('\n══ 7C.12A.2 Registration Tests (v2 — Hardened) ══');
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'SKIP' ? '○' : '✗';
  const msg  = r.status === 'FAIL' ? ` — ${r.error}` : '';
  console.log(`  ${icon} [${r.status}] ${r.label}${msg}`);
});
console.log(`\n  Total: ${_pass + _fail + _skip} | PASS: ${_pass} | FAIL: ${_fail} | SKIP: ${_skip}`);
if (_fail > 0) {
  console.error(`\n  ✗ ${_fail} test(s) FAILED`);
  process.exit(1);
} else {
  console.log(`\n  ✓ ALL ${_pass} PASS`);
  process.exit(0);
}
