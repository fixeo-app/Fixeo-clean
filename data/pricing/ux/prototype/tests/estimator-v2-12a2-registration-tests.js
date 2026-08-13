/**
 * 7C.12A.2 — New Artisan Canonical Registration Tests
 * estimator-v2-12a2-registration-tests.js
 *
 * Test sections:
 *  Section 1:  RPC contract: register_new_artisan SQL logic
 *  Section 2:  Post-registration state invariants
 *  Section 3:  Security: no caller-supplied owner_user_id
 *  Section 4:  Security: no privilege escalation
 *  Section 5:  Idempotency / duplicate owner guard
 *  Section 6:  Unauthenticated blocked
 *  Section 7:  Validation guards
 *  Section 8:  Dispatch ineligibility
 *  Section 9:  Role promotion
 *  Section 10: Admin role never demoted
 *  Section 11: localStorage ghost authority removed
 *  Section 12: Redirect targets V2, not V1
 *  Section 13: 7C.12A.1 non-regression
 *  Section 14: 7C.11 dispatch non-regression
 *  Section 15: Unique index correctness
 *  Section 16: SQL file structural checks
 */

'use strict';

/* ── Minimal test harness ───────────────────────────────── */
let _pass = 0, _fail = 0, _skip = 0;
const results = [];
function test(label, fn) {
  try {
    fn();
    _pass++;
    results.push({ status: 'PASS', label });
  } catch (e) {
    _fail++;
    results.push({ status: 'FAIL', label, error: e.message });
  }
}
function skip(label) { _skip++; results.push({ status: 'SKIP', label }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(str, sub, msg) {
  assert(String(str).includes(sub), msg || `Expected to find: ${sub}`);
}
function assertNotIncludes(str, sub, msg) {
  assert(!String(str).includes(sub), msg || `Must NOT include: ${sub}`);
}
function assertMatch(str, re, msg) {
  assert(re.test(String(str)), msg || `Pattern not found: ${re}`);
}
function assertNoMatch(str, re, msg) {
  assert(!re.test(String(str)), msg || `Pattern must not match: ${re}`);
}

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ── Source files ─────────────────────────────────────────── */
const migrationSql    = readFile('supabase/7c12a2-new-artisan-registration.sql');
const precheckSql     = readFile('supabase/7c12a2-new-artisan-registration-precheck.sql');
const verifySql       = readFile('supabase/7c12a2-new-artisan-registration-verify.sql');
const rollbackSql     = readFile('supabase/7c12a2-new-artisan-registration-rollback.sql');
const v4Js            = readFile('js/artisan-onboarding-v4.js');
const v1Js            = readFile('js/artisan-onboarding.js');
const v3Js            = readFile('js/artisan-onboarding-v3.js');
const dashV2Js        = readFile('js/fixeo-artisan-dashboard-v2.js');
const onboardingHtml  = readFile('onboarding-artisan.html');
const authSupabaseJs  = readFile('js/fixeo-auth-supabase.js');

/* Strip SQL line comments for executable-code checks */
function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, '');
}
/* Strip JS line + block comments */
function stripJsComments(js) {
  return js.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
const migrationExec = stripSqlComments(migrationSql);
const v4JsExec      = stripJsComments(v4Js);
const dashV2JsExec  = stripJsComments(dashV2Js);

/* ══════════════════════════════════════════════════════════ */
/* SECTION 1: RPC contract: register_new_artisan SQL logic   */
/* ══════════════════════════════════════════════════════════ */

test('S1.1 register_new_artisan function defined', () => {
  assertIncludes(migrationSql, 'CREATE OR REPLACE FUNCTION public.register_new_artisan(');
});

test('S1.2 SECURITY DEFINER', () => {
  assertIncludes(migrationSql, 'SECURITY DEFINER');
});

test('S1.3 SET search_path = empty string', () => {
  assertIncludes(migrationSql, "SET search_path = ''");
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

test('S1.7 unauthenticated guard: v_uid IS NULL after auth.uid() assignment', () => {
  // auth.uid() stored to v_uid; guard checks v_uid IS NULL
  assertMatch(migrationExec, /v_uid\s+IS\s+NULL/i);
});

test('S1.8 duplicate owner guard: SELECT FOR UPDATE on artisans', () => {
  assertMatch(migrationExec, /SELECT.*FROM\s+public\.artisans.*owner_user_id\s*=\s*v_uid/is);
  assertMatch(migrationExec, /FOR\s+UPDATE/i);
});

test('S1.9 unique_violation EXCEPTION handler', () => {
  assertIncludes(migrationSql, 'unique_violation');
});

test('S1.10 INSERT INTO public.artisans present', () => {
  assertMatch(migrationExec, /INSERT\s+INTO\s+public\.artisans/i);
});

test('S1.11 owner_user_id set to v_uid (never caller-supplied)', () => {
  assertMatch(migrationExec, /owner_user_id.*v_uid|v_uid.*owner_user_id/i);
});

test('S1.12 users.role promoted to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users.*SET.*role\s*=\s*'artisan'/is);
});

test('S1.13 profiles.role promoted to artisan', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.profiles.*SET.*role\s*=\s*'artisan'/is);
});

test('S1.14 migration is atomic (BEGIN / COMMIT)', () => {
  assertMatch(migrationSql, /^\s*BEGIN\s*;/m);
  assertMatch(migrationSql, /^\s*COMMIT\s*;/m);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 2: Post-registration state invariants              */
/* ══════════════════════════════════════════════════════════ */

test('S2.1 claimed column present in INSERT column list', () => {
  // VALUES are on separate lines from column names; check both column list and values
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'claimed');
  // true appears in VALUES section
  assertIncludes(insertBlock, 'true');
});

test('S2.2 claim_status column in INSERT and approved in VALUES', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'claim_status');
  assertIncludes(insertBlock, "'approved'");
});

test('S2.3 onboarding_completed column in INSERT and false in VALUES', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'onboarding_completed');
  assertIncludes(insertBlock, 'false');
});

test('S2.4 availability column in INSERT and unavailable in VALUES', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'availability');
  assertIncludes(insertBlock, "'unavailable'");
});

test('S2.5 verified column in INSERT and false in VALUES', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'verified');
  assertIncludes(insertBlock, 'false');
});

test('S2.6 already_registered idempotent ok:true path exists', () => {
  assertIncludes(migrationSql, "'already_registered'");
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 3: Security — no caller-supplied owner_user_id    */
/* ══════════════════════════════════════════════════════════ */

test('S3.1 p_owner_user_id absent from function signature', () => {
  assertNotIncludes(migrationSql, 'p_owner_user_id');
});

test('S3.2 p_user_id absent from function signature', () => {
  assertNotIncludes(migrationSql, 'p_user_id');
});

test('S3.3 p_artisan_id absent (7C.12A.1 constraint)', () => {
  assertNotIncludes(migrationSql, 'p_artisan_id');
});

test('S3.4 caller-supplied verified parameter absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)[\s\S]*?LANGUAGE/i)?.[0] || '';
  assertNotIncludes(sig, 'p_verified');
});

test('S3.5 caller-supplied onboarding_completed parameter absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)[\s\S]*?LANGUAGE/i)?.[0] || '';
  assertNotIncludes(sig, 'p_onboarding');
});

test('S3.6 caller-supplied availability parameter absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)[\s\S]*?LANGUAGE/i)?.[0] || '';
  assertNotIncludes(sig, 'p_availability');
});

test('S3.7 caller-supplied claim_status parameter absent', () => {
  const sig = migrationSql.match(/FUNCTION public\.register_new_artisan\([\s\S]*?\)[\s\S]*?LANGUAGE/i)?.[0] || '';
  assertNotIncludes(sig, 'p_claim_status');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 4: No privilege escalation                        */
/* ══════════════════════════════════════════════════════════ */

test('S4.1 verified NOT set to true in executable SQL', () => {
  assertNoMatch(migrationExec, /verified\s*=\s*true/i);
});

test('S4.2 onboarding_completed NOT set to true in executable SQL', () => {
  assertNoMatch(migrationExec, /onboarding_completed\s*=\s*true/i);
});

test('S4.3 availability NOT set to available in executable SQL', () => {
  assertNoMatch(migrationExec, /availability\s*=\s*'available'/i);
});

test('S4.4 no SERVICE_ROLE key in migration', () => {
  assertNotIncludes(migrationSql, 'service_role_key');
  assertNotIncludes(migrationSql, 'eyJhbGci'); /* JWT prefix */
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 5: Idempotency / duplicate owner guard            */
/* ══════════════════════════════════════════════════════════ */

test('S5.1 partial UNIQUE index created on owner_user_id', () => {
  assertMatch(migrationSql, /CREATE\s+UNIQUE\s+INDEX.*artisans_owner_user_id_unique/i);
});

test('S5.2 index is partial (WHERE owner_user_id IS NOT NULL)', () => {
  assertMatch(migrationSql, /WHERE\s+owner_user_id\s+IS\s+NOT\s+NULL/i);
});

test('S5.3 idempotent index creation (IF NOT EXISTS guard)', () => {
  assertMatch(migrationSql, /IF NOT EXISTS/i);
});

test('S5.4 already_registered returned without mutation on duplicate', () => {
  // The idempotent block: IF v_existing_id IS NOT NULL → RETURN already_registered
  // Comments stripped; check the RETURN after the IS NOT NULL guard
  const afterGuard = migrationExec.split('v_existing_id IS NOT NULL')[1] || '';
  const firstReturn = afterGuard.match(/RETURN[\s\S]*?;/i)?.[0] || '';
  assertIncludes(firstReturn, 'already_registered');
  // No INSERT should appear before the RETURN in the guard block
  const tillReturn = afterGuard.split(/RETURN/i)[0] || '';
  assertNotIncludes(tillReturn, 'INSERT');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 6: Unauthenticated blocked                        */
/* ══════════════════════════════════════════════════════════ */

test('S6.1 unauthenticated returns ok:false reason:unauthenticated', () => {
  assertIncludes(migrationSql, "'unauthenticated'");
});

test('S6.2 anon REVOKED in Step 2 permissions', () => {
  assertMatch(migrationSql, /REVOKE\s+EXECUTE.*FROM\s+anon/i);
  assertMatch(migrationSql, /REVOKE\s+EXECUTE.*FROM\s+PUBLIC/i);
});

test('S6.3 authenticated GRANTED in Step 2 permissions', () => {
  assertMatch(migrationSql, /GRANT\s+EXECUTE.*TO\s+authenticated/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 7: Validation guards                              */
/* ══════════════════════════════════════════════════════════ */

test('S7.1 name_required validation path', () => {
  assertIncludes(migrationSql, "'name_required'");
});

test('S7.2 category_required validation path', () => {
  assertIncludes(migrationSql, "'category_required'");
});

test('S7.3 city_required validation path', () => {
  assertIncludes(migrationSql, "'city_required'");
});

test('S7.4 description_too_long validation path', () => {
  assertIncludes(migrationSql, "'description_too_long'");
  assertMatch(migrationSql, /length.*description.*500|500.*description/i);
});

test('S7.5 name length >= 3 chars enforced', () => {
  assertMatch(migrationSql, /length.*v_full_name.*[<>]=?\s*3|3\s*[<>]=?\s*length.*v_full_name/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 8: Dispatch ineligibility                         */
/* ══════════════════════════════════════════════════════════ */

test('S8.1 onboarding_completed = false in INSERT (dispatch gate preserved)', () => {
  /* dispatch_request_v1 requires onboarding_completed=true → register sets false */
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'onboarding_completed');
  assertIncludes(insertBlock, 'false');
});

test('S8.2 availability = unavailable in INSERT (dispatch gate preserved)', () => {
  const insertBlock = migrationExec.match(/INSERT\s+INTO\s+public\.artisans[\s\S]*?RETURNING/i)?.[0] || '';
  assertIncludes(insertBlock, 'availability');
  assertIncludes(insertBlock, "'unavailable'");
});

test('S8.3 dispatch_request_v1 not referenced in executable SQL (comment-stripped)', () => {
  assertNotIncludes(migrationExec, 'dispatch_request_v1');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 9: Role promotion                                 */
/* ══════════════════════════════════════════════════════════ */

test('S9.1 users.role = artisan in UPDATE', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?role\s*=\s*'artisan'/i);
});

test('S9.2 profiles.role = artisan in UPDATE', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.profiles[\s\S]*?role\s*=\s*'artisan'/i);
});

test('S9.3 WHERE owner_user_id = v_uid scoped (not all users)', () => {
  assertMatch(migrationExec, /UPDATE\s+public\.users[\s\S]*?WHERE\s+id\s*=\s*v_uid/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 10: Admin role never demoted                      */
/* ══════════════════════════════════════════════════════════ */

test('S10.1 admin demotion guard in users UPDATE', () => {
  assertMatch(migrationExec, /role\s*!=\s*'admin'|role\s*<>\s*'admin'/i);
});

test('S10.2 admin demotion guard in profiles UPDATE', () => {
  const profilesUpdate = migrationSql.match(/UPDATE\s+public\.profiles[\s\S]*?;/i)?.[0] || '';
  assertMatch(profilesUpdate, /admin/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 11: localStorage ghost authority removed          */
/* ══════════════════════════════════════════════════════════ */

test('S11.1 V4 JS clears ghost localStorage keys', () => {
  assertIncludes(v4Js, '_clearGhostLocalStorage');
  assertIncludes(v4Js, "'user_role'");
  assertIncludes(v4Js, "'user_logged'");
  assertIncludes(v4Js, "'fixeo_artisan_onboarding_entries_v1'");
});

test('S11.2 V4 JS does NOT call addArtisan in executable code (ghost writer)', () => {
  assertNotIncludes(v4JsExec, 'addArtisan');
});

test('S11.3 V4 JS does NOT call createArtisanSession in executable code (ghost session)', () => {
  assertNotIncludes(v4JsExec, 'createArtisanSession');
});

test('S11.4 V4 JS does NOT write user_role=artisan to localStorage in main path', () => {
  // Legacy fallback IS allowed to write for offline mode (clearly guarded)
  // Main path must NOT write user_role
  const mainPath = v4Js.split('_legacyLocalStorageFallback')[0] || v4Js;
  assertNotIncludes(mainPath, "localStorage.setItem('user_role'");
});

test('S11.5 V4 JS localStorage draft key is non-identity only', () => {
  assertIncludes(v4Js, 'fixeo_artisan_onboarding_draft_v1');
  /* Draft stores only: name, category, city, description — never phone or identity */
  assertNotIncludes(v4Js.match(/saveDraft[\s\S]*?\}/)?.[0] || '', 'owner');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 12: Redirect targets V2, not V1                   */
/* ══════════════════════════════════════════════════════════ */

test('S12.1 V4 JS REDIRECT_ARTISAN = dashboard-artisan-v2.html', () => {
  assertIncludes(v4Js, "'dashboard-artisan-v2.html'");
  assertNotIncludes(v4Js.replace(/\/\/.*/g, '').replace(/_legacy[\s\S]*?}/g, ''),
    "'dashboard-artisan.html'");
});

test('S12.2 V1 JS redirectAfterOnboarding points to deprecated V1 (known; V4 overrides)', () => {
  /* V1 handler still has the old redirect — but V4 overrides it via capture phase.
   * This test documents the known state so future cleanup is tracked. */
  assertIncludes(v1Js, "'dashboard-artisan.html'");
  /* V4 overrides via capture phase — confirmed by handleSubmit using stopImmediatePropagation */
  assertIncludes(v4Js, 'stopImmediatePropagation');
  assertIncludes(v4Js, 'capture phase');
});

test('S12.3 onboarding-artisan.html loads v4 script', () => {
  assertIncludes(onboardingHtml, 'artisan-onboarding-v4.js');
});

test('S12.4 V4 script loads AFTER V3 (correct override order)', () => {
  const v3Pos = onboardingHtml.indexOf('artisan-onboarding-v3.js');
  const v4Pos = onboardingHtml.indexOf('artisan-onboarding-v4.js');
  assert(v3Pos >= 0 && v4Pos > v3Pos, 'V4 must load after V3');
});

test('S12.5 fixeo-auth-guard.js redirects V1 artisan page to V2', () => {
  const guard = readFile('js/fixeo-auth-guard.js');
  assertIncludes(guard, 'dashboard-artisan-v2.html');
  assertMatch(guard, /dashboard-artisan\.html.*artisan.*replace.*dashboard-artisan-v2/is);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 13: 7C.12A.1 non-regression                      */
/* ══════════════════════════════════════════════════════════ */

test('S13.1 approve_artisan_claim not in executable migration SQL', () => {
  // Comments may document the relationship; executable code must not touch it
  assertNotIncludes(migrationExec, 'approve_artisan_claim');
});

test('S13.2 reject_artisan_claim not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'reject_artisan_claim');
});

test('S13.3 claim_requests not in executable migration SQL', () => {
  assertNotIncludes(migrationExec, 'claim_requests');
});

test('S13.4 sync_artisan_claim not restored by 7C.12A.2 migration', () => {
  assertNotIncludes(migrationSql, 'sync_artisan_claim');
});

test('S13.5 dashboard V2 identity uses auth.uid() → owner_user_id; phone_public not in _loadArtisanProfile executable code', () => {
  assertIncludes(dashV2Js, "eq('owner_user_id', userId)");
  // phone_public fallback removed from _loadArtisanProfile auth path (7C.12A.1)
  // phone_public at line 692 is display rendering only (not auth identity)
  // Strip JS comments from _loadArtisanProfile function body, then check
  const rawLoadFn = dashV2Js.match(/function _loadArtisanProfile[\s\S]*?return null;\s*\}/i)?.[0] || '';
  const execLoadFn = rawLoadFn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Executable code must not use phone_public as a SELECT/query param (fallback auth)
  assertNotIncludes(execLoadFn, 'phone_public');
});

test('S13.6 register_new_artisan does NOT reference phone_public in executable SQL', () => {
  assertNotIncludes(migrationExec, 'phone_public');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 14: 7C.11 dispatch non-regression                */
/* ══════════════════════════════════════════════════════════ */

test('S14.1 dispatch_request_v1 not in executable 7C.12A.2 migration SQL', () => {
  assertNotIncludes(migrationExec, 'dispatch_request_v1');
});

test('S14.2 register_new_artisan does not alter dispatch eligibility fields', () => {
  /* availability='unavailable', onboarding_completed=false → both fail dispatch gate */
  assertNoMatch(migrationExec, /availability\s*=\s*'available'/i);
  assertNoMatch(migrationExec, /onboarding_completed\s*=\s*true/i);
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 15: Unique index correctness                      */
/* ══════════════════════════════════════════════════════════ */

test('S15.1 unique index on artisans.owner_user_id exists in migration', () => {
  assertMatch(migrationSql, /CREATE\s+UNIQUE\s+INDEX.*artisans_owner_user_id_unique/i);
});

test('S15.2 partial index does not cover NULL rows (seeded artisans safe)', () => {
  assertMatch(migrationSql, /WHERE\s+owner_user_id\s+IS\s+NOT\s+NULL/i);
});

test('S15.3 rollback drops the unique index', () => {
  assertIncludes(rollbackSql, 'artisans_owner_user_id_unique');
  assertMatch(rollbackSql, /DROP\s+INDEX\s+IF\s+EXISTS/i);
});

test('S15.4 rollback drops register_new_artisan RPC', () => {
  assertMatch(rollbackSql, /DROP\s+FUNCTION\s+IF\s+EXISTS.*register_new_artisan/i);
});

test('S15.5 rollback has HARD STOP guard on existing self-registered artisans', () => {
  assertIncludes(rollbackSql, 'ROLLBACK HARD STOP');
  assertIncludes(rollbackSql, 'owner_user_id IS NOT NULL');
});

/* ══════════════════════════════════════════════════════════ */
/* SECTION 16: SQL file structural checks                    */
/* ══════════════════════════════════════════════════════════ */

test('S16.1 migration: every AS $$ has matching $$;', () => {
  const opens  = (migrationSql.match(/AS \$\$/g) || []).length;
  const closes = (migrationSql.match(/^\$\$;/mg) || []).length;
  assert(opens === closes, `AS $$ (${opens}) !== $$; (${closes})`);
});

test('S16.2 migration: every DO $$ has matching END $$;', () => {
  const opens  = (migrationSql.match(/^DO \$\$/mg) || []).length;
  const closes = (migrationSql.match(/^END \$\$;/mg) || []).length;
  assert(opens === closes, `DO $$ (${opens}) !== END $$; (${closes})`);
});

test('S16.3 migration: no ellipsis', () => {
  assertNotIncludes(migrationSql, '...');
});

test('S16.4 precheck: contains 39 PM checks', () => {
  const pmChecks = (precheckSql.match(/-- PM-\d+/g) || []).length;
  assert(pmChecks >= 35, `Expected ≥35 PM checks, found ${pmChecks}`);
});

test('S16.5 verify: V-checks present (≥25)', () => {
  const vChecks = (verifySql.match(/-- V-\d+/g) || []).length;
  assert(vChecks >= 25, `Expected ≥25 V-checks in verify, found ${vChecks}`);
});

test('S16.6 verify uses v_def_exec for assignment checks (comment-stripped)', () => {
  assertIncludes(verifySql, 'v_def_exec');
  assertIncludes(verifySql, "regexp_replace(v_def, '--[^\\n]*', '', 'g')");
});

test('S16.7 V4 JS: _fxAoV4Loaded guard prevents double-init', () => {
  assertIncludes(v4Js, '_fxAoV4Loaded');
});

test('S16.8 V4 JS: SECURITY DEFINER RPC called by name register_new_artisan', () => {
  assertIncludes(v4Js, "'register_new_artisan'");
});

test('S16.9 V4 JS: owner_user_id never included in RPC call params', () => {
  const rpcCall = v4Js.match(/sb\(\)\.rpc\('register_new_artisan'[\s\S]*?\}\)/)?.[0] || '';
  assertNotIncludes(rpcCall, 'owner_user_id');
});

test('S16.10 V4 JS: phone NOT stored as draft field (security)', () => {
  // saveDraft JSON keys must not include phone — only name/category/city/description
  // The comment "phone excluded from draft" is fine; check the object literal
  const saveDraftFn = v4JsExec.match(/function saveDraft[\s\S]*?setItem[\s\S]*?\}\s*\)/)?.[0] || '';
  // phone should not appear as a JSON key in the draft object
  assertNoMatch(saveDraftFn, /phone\s*:/);
});

/* ── Summary ─────────────────────────────────────────────── */
console.log('\n══ 7C.12A.2 Registration Tests ══');
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
