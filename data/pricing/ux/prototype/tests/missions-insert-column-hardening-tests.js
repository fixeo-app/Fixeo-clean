/**
 * FIXEO Phase 7C.11F.6 — Missions INSERT Column Hardening Tests
 * data/pricing/ux/prototype/tests/missions-insert-column-hardening-tests.js
 *
 * Verifies:
 * T1  Delta SQL is transactional
 * T2  Delta SQL REVOKEs authenticated table-level INSERT
 * T3  Delta SQL GRANTs exact column-level INSERT for authenticated
 * T4  final_price NOT in authenticated INSERT grants
 * T5  commission_amount NOT in authenticated INSERT grants
 * T6  Verify SQL is READ-ONLY (no mutations)
 * T7  Verify SQL has 16 binary checks (E1–E16)
 * T8  Browser INSERT paths only use granted columns
 * T9  financial migration updated with correct prerequisite
 * T10 financial migration no longer attempts column REVOKE INSERT
 *     (superseded by table-level REVOKE in insert-column-hardening)
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT      = path.resolve(__dirname, '../../../../..');
var DELTA_PATH  = path.join(ROOT, 'supabase/7c11f6-missions-insert-column-hardening.sql');
var VERIFY_PATH = path.join(ROOT, 'supabase/7c11f6-missions-insert-column-hardening-verify.sql');
var MIG_PATH    = path.join(ROOT, 'supabase/7c11f6-financial-settlement.sql');
var CORE_PATH   = path.join(ROOT, 'js/fixeo-supabase-core.js');
var DASH_PATH   = path.join(ROOT, 'js/fixeo-artisan-dashboard-v2.js');
var DISP_PATH   = path.join(ROOT, 'js/fixeo-dispatch-engine.js');

var results = { pass: 0, fail: 0, failures: [] };
function pass(name) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  \u2717 [FAIL] ' + name + ' \u2014 ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var delta  = fs.readFileSync(DELTA_PATH,  'utf8');
var verify = fs.readFileSync(VERIFY_PATH, 'utf8');
var mig    = fs.readFileSync(MIG_PATH,    'utf8');
var core   = fs.readFileSync(CORE_PATH,   'utf8');
var dash   = fs.readFileSync(DASH_PATH,   'utf8');
var disp   = fs.readFileSync(DISP_PATH,   'utf8');

/* ── T1: Delta SQL is transactional ─────────────────────────── */
console.log('\nT1: Delta SQL is transactional');
check('T1.1 BEGIN present',   delta.includes('BEGIN;'),  'BEGIN; missing');
check('T1.2 COMMIT present',  delta.includes('COMMIT;'), 'COMMIT; missing');

/* ── T2: Delta SQL revokes authenticated table-level INSERT ─── */
console.log('\nT2: Delta revokes authenticated table-level INSERT');
check('T2.1 REVOKE INSERT ON TABLE missions FROM authenticated',
  delta.match(/REVOKE\s+INSERT\s+ON\s+TABLE\s+public\.missions\s+FROM\s+authenticated/i) !== null,
  'REVOKE INSERT table-level from authenticated missing');
check('T2.2 REVOKE INSERT ON TABLE missions FROM anon',
  delta.match(/REVOKE\s+INSERT\s+ON\s+TABLE\s+public\.missions\s+FROM\s+anon/i) !== null,
  'REVOKE INSERT table-level from anon missing');

/* ── T3: Delta grants exact column INSERT for authenticated ─── */
console.log('\nT3: Delta grants column-level INSERT for authenticated');
var grantBlock = (function() {
  var m = delta.match(/GRANT INSERT\s*\(([^)]+)\)\s*ON TABLE public\.missions TO authenticated/i);
  return m ? m[1] : '';
})();
var grantedCols = grantBlock.split(',').map(function(c){ return c.trim(); });

check('T3.1 GRANT INSERT column block present',
  grantBlock.length > 0, 'GRANT INSERT(...) TO authenticated not found');
check('T3.2 request_id granted',
  grantedCols.includes('request_id'), 'request_id not in column INSERT grant');
check('T3.3 client_profile_id granted',
  grantedCols.includes('client_profile_id'), 'client_profile_id not in column INSERT grant');
check('T3.4 artisan_profile_id granted',
  grantedCols.includes('artisan_profile_id'), 'artisan_profile_id not in column INSERT grant');
check('T3.5 agreed_price granted',
  grantedCols.includes('agreed_price'), 'agreed_price not in column INSERT grant');
check('T3.6 status granted',
  grantedCols.includes('status'), 'status not in column INSERT grant');
check('T3.7 exactly 5 columns granted',
  grantedCols.length === 5,
  'Expected exactly 5 INSERT columns, got: ' + grantedCols.join(', '));

/* ── T4: final_price NOT in authenticated INSERT grants ──────── */
console.log('\nT4: final_price NOT granted INSERT to authenticated');
check('T4.1 final_price absent from GRANT INSERT block',
  !grantedCols.includes('final_price'),
  'final_price must NOT be in authenticated column INSERT grant');
check('T4.2 delta does not GRANT INSERT final_price anywhere',
  !delta.match(/GRANT INSERT\s*\([^)]*final_price[^)]*\)\s*ON.*missions.*TO\s+authenticated/i),
  'final_price must not appear in any authenticated INSERT GRANT');

/* ── T5: commission_amount NOT in authenticated INSERT grants ── */
console.log('\nT5: commission_amount NOT granted INSERT to authenticated');
check('T5.1 commission_amount absent from GRANT INSERT block',
  !grantedCols.includes('commission_amount'),
  'commission_amount must NOT be in authenticated column INSERT grant');

/* ── T6: Verify SQL is READ-ONLY ─────────────────────────────── */
console.log('\nT6: Verify SQL is READ-ONLY');
var verifyNoComments = verify.split('\n')
  .filter(function(l){ return l.trim().indexOf('--') !== 0; })
  .join('\n');
check('T6.1 no INSERT mutations in verify',
  !verifyNoComments.match(/^\s*INSERT\b/im), 'INSERT found in verify SQL');
check('T6.2 no UPDATE mutations in verify',
  !verifyNoComments.match(/^\s*UPDATE\b/im), 'UPDATE found in verify SQL');
check('T6.3 no DELETE mutations in verify',
  !verifyNoComments.match(/^\s*DELETE\b/im), 'DELETE found in verify SQL');
check('T6.4 no ALTER TABLE in verify',
  !verifyNoComments.match(/ALTER\s+TABLE/i), 'ALTER TABLE found in verify SQL');
check('T6.5 no GRANT/REVOKE in verify',
  !verifyNoComments.match(/^\s*(GRANT|REVOKE)\b/im), 'GRANT or REVOKE found in verify SQL');

/* ── T7: Verify SQL has 16 binary checks ─────────────────────── */
console.log('\nT7: Verify SQL covers all 16 binary checks');
var eChecks = (verify.match(/-- E\d+:/g) || []).length;
check('T7.1 16 E-block checks present', eChecks === 16,
  'Expected 16 E-checks, found ' + eChecks);
check('T7.2 authenticated table INSERT revoked check (E1)',
  verify.includes('authenticated table INSERT revoked'),
  'E1 missing: authenticated table INSERT revoked');
check('T7.3 authenticated INSERT(final_price) NOT granted check (E7)',
  verify.includes('INSERT(final_price) NOT granted'),
  'E7 missing: final_price INSERT not granted check');
check('T7.4 authenticated INSERT(commission_amount) NOT granted check (E8)',
  verify.includes('INSERT(commission_amount) NOT granted'),
  'E8 missing: commission_amount INSERT not granted check');
check('T7.5 RLS still enabled check (E16)',
  verify.includes('missions RLS enabled'),
  'E16 missing: RLS still enabled check');
check('T7.6 verify orders FAIL rows first',
  verify.includes('ORDER BY result DESC'),
  'FAIL-first ordering missing from verify SQL');

/* ── T8: Browser INSERT paths use only granted columns ────────── */
console.log('\nT8: Browser INSERT paths only use exactly-granted columns');
var FINANCIAL_FORBIDDEN = ['final_price', 'commission_amount'];

/* fixeo-supabase-core.js maybeCreateMissionFallback */
check('T8.1 core.js INSERT: no final_price',
  FINANCIAL_FORBIDDEN.every(function(col) {
    var insertBlock = core.match(/sb\.from\('missions'\)\.insert\(\{([^}]+)\}/);
    return insertBlock ? !insertBlock[1].includes(col) : true;
  }),
  'core.js missions INSERT contains forbidden financial column');

/* fixeo-artisan-dashboard-v2.js */
check('T8.2 dashboard.js INSERT: no final_price or commission_amount',
  (function() {
    var m = dash.match(/sb\.from\('missions'\)\.insert\(\{([^}]+)\}/);
    if (!m) return true;
    return !FINANCIAL_FORBIDDEN.some(function(col){ return m[1].includes(col); });
  })(),
  'dashboard.js missions INSERT contains forbidden financial column');

/* fixeo-dispatch-engine.js */
check('T8.3 dispatch.js INSERT: no final_price or commission_amount',
  (function() {
    var m = disp.match(/missionRow\s*=\s*\{([^}]+)\}/);
    if (!m) return true;
    return !FINANCIAL_FORBIDDEN.some(function(col){ return m[1].includes(col); });
  })(),
  'dispatch.js missions INSERT contains forbidden financial column');

check('T8.4 core.js INSERT: contains all 5 required columns',
  (function() {
    var m = core.match(/sb\.from\('missions'\)\.insert\(\{([^}]+)\}/);
    if (!m) return false;
    var block = m[1];
    return ['request_id','client_profile_id','artisan_profile_id','agreed_price','status']
      .every(function(col){ return block.includes(col); });
  })(),
  'core.js INSERT missing one or more required columns');

/* ── T9: financial migration updated with correct prerequisite ── */
console.log('\nT9: Financial migration references insert-column-hardening prerequisite');
check('T9.1 migration references insert-column-hardening as PREREQUISITE',
  mig.includes('insert-column-hardening'),
  'Financial migration does not reference insert-column-hardening as prerequisite');
check('T9.2 migration notes 16 checks for insert-column-hardening',
  mig.includes('16 checks'),
  'Financial migration does not reference 16 checks for insert-column-hardening');

/* ── T10: financial migration no longer uses column REVOKE INSERT ─ */
console.log('\nT10: Financial migration does not attempt column-level REVOKE INSERT(final_price)');
check('T10.1 no REVOKE INSERT(final_price) in financial migration',
  (function() {
    /* Strip comment lines AND RAISE NOTICE lines (which may mention the pattern) */
    var migNoComments = mig.split('\n')
      .filter(function(l){
        var t = l.trim();
        return t.indexOf('--') !== 0 && !t.match(/^RAISE\s+NOTICE/i);
      })
      .join('\n');
    return !migNoComments.match(/REVOKE\s+INSERT\s*\(\s*final_price\s*\)/i);
  })(),
  'Financial migration still contains REVOKE INSERT(final_price) — superseded by column hardening');
check('T10.2 no REVOKE INSERT(final_price) from authenticated in migration',
  (function() {
    var migNoComments = mig.split('\n')
      .filter(function(l){ return l.trim().indexOf('--') !== 0; })
      .join('\n');
    return !migNoComments.match(/REVOKE\s+INSERT\s*\([^)]*final_price[^)]*\).*authenticated/i);
  })(),
  'Financial migration REVOKEs INSERT(final_price) from authenticated — no-op that should be removed');

/* ── RESULTS ─────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(58));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('\u2713 ALL ' + total + ' PASS');
} else {
  console.log('\nFailed tests:');
  results.failures.forEach(function(f) { console.log('  \u2717 ' + f); });
  process.exit(1);
}
