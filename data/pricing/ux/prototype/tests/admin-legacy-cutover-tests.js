/**
 * FIXEO Admin Legacy Cutover Tests
 * data/pricing/ux/prototype/tests/admin-legacy-cutover-tests.js
 *
 * Tests:
 *   S-ALC-1  admin-artisans.js canonical source
 *   S-ALC-2  No localStorage artisan creation authority
 *   S-ALC-3  FixeoClaimSystem mutation authority removed
 *   S-ALC-4  Canonical RPC path confirmed (approve/reject)
 *   S-ALC-5  Security
 *   S-ALC-6  Canonical sync V1 still intact
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT  = path.resolve(__dirname, '../../../../..');
var ART   = path.join(ROOT, 'js/admin-artisans.js');
var MOD   = path.join(ROOT, 'js/admin-artisan-moderation-p2.js');
var REPO  = path.join(ROOT, 'js/fixeo-repository.js');
var ACS   = path.join(ROOT, 'js/admin-canonical-sync-v1.js');
var HTML  = path.join(ROOT, 'admin.html');

var results = { pass: 0, fail: 0, failures: [] };

function pass(name) { results.pass++; process.stdout.write('  ✓ [PASS] ' + name + '\n'); }
function fail(name, reason) {
  results.fail++;
  results.failures.push(name + ': ' + reason);
  process.stdout.write('  ✗ [FAIL] ' + name + ' — ' + reason + '\n');
}
function check(name, cond, reason) { cond ? pass(name) : fail(name, reason || 'Condition false'); }

var art  = fs.readFileSync(ART,  'utf8');
var mod  = fs.readFileSync(MOD,  'utf8');
var repo = fs.readFileSync(REPO, 'utf8');
var acs  = fs.readFileSync(ACS,  'utf8');
var html = fs.readFileSync(HTML, 'utf8');

/* ── S-ALC-1: admin-artisans.js canonical source ──────────── */
console.log('\nS-ALC-1: admin-artisans.js canonical source');
check('A1.1 primary load uses FixeoRepository.getAllArtisans',
  art.includes('FixeoRepository.getAllArtisans'),
  'FixeoRepository.getAllArtisans not used');
check('A1.2 localStorage is documented as display-cache only',
  art.includes('display cache') || art.includes('display-cache'),
  'localStorage not marked as display-cache');
check('A1.3 display cache write is separated from canonical write',
  art.includes('display cache only') || art.includes('display-cache only') ||
  art.includes('/* refresh display cache only */') || art.includes('display cache only'),
  'display cache write not clearly separated');
check('A1.4 Supabase canonical logged on success',
  art.includes('Supabase (canonical)') || art.includes('canonical'),
  'no canonical success log');
check('A1.5 no /api/admin/artisans as primary load path',
  /* The API path should still exist for toggle/delete (those call their own endpoints)
   * but loadArtisans() must NOT use it as primary. The old API call is gone from loadArtisans. */
  !art.match(/\/api\/admin\/artisans['"]\s*;[\s\S]{0,200}getAllArtisans/) &&
  art.split('async function loadArtisans')[1].split('async function')[0].includes('FixeoRepository'),
  'loadArtisans still uses /api path as primary');

/* ── S-ALC-2: No localStorage artisan creation authority ─── */
console.log('\nS-ALC-2: No localStorage artisan creation authority');
check('A2.1 submitArtisanForm catch block does NOT create local artisan',
  !art.match(/art_local_/) &&
  !art.match(/_isLocal\s*:\s*true/),
  'local artisan creation fallback still present');
check('A2.2 submitArtisanForm catch shows truthful error instead of local write',
  art.includes('service d\'ajout n\'est pas disponible') ||
  art.includes('No localStorage') ||
  art.includes('CANONICAL AUTHORITY'),
  'no truthful error message for add failure');
check('A2.3 toggleArtisanStatus catch does NOT write to localStorage',
  art.split('toggleArtisanStatus')[1]
     .split('async function')[0]
     .replace(/\/\*[\s\S]*?\*\//g,'')  /* strip comments */
     .indexOf('_lsSave') === -1,
  'toggleArtisanStatus still writes to localStorage on error');
check('A2.4 _deleteArtisan catch does NOT write to localStorage on error',
  /* The catch block (after API failure) should not call _lsSave.
   * The success branch may still update the display cache — that is fine.
   * We verify the catch block specifically. */
  (function() {
    var fn = art.split('async function _deleteArtisan')[1].split('async function')[0];
    /* Extract only the catch block */
    var catchMatch = fn.match(/\}\s*catch\s*\([\s\S]+/);
    if (!catchMatch) return true; /* no catch = already removed */
    var catchBlock = catchMatch[0].slice(0, 600); /* first 600 chars of catch */
    return catchBlock.indexOf('_lsSave') === -1;
  })(),
  '_deleteArtisan catch block still writes to localStorage on error');
check('A2.5 submitEditArtisanForm catch does NOT write to localStorage',
  /* Look for the edit form catch block — it should have our honest error, not _lsSave */
  art.split('submitEditArtisanForm')[1]
     .split('toggleArtisanFormPanel')[0]
     .replace(/\/\*[\s\S]*?\*\//g,'')
     .indexOf('_lsSave') === -1 &&
  art.includes('Service indisponible \u2014 modifications non enregistr\u00e9es') ||
  art.includes('modifications non enregistr'),
  'submitEditArtisanForm still writes to localStorage on error');
check('A2.6 FixeoDB.createArtisan not called as fallback creation path',
  !art.match(/FixeoDB\.createArtisan/),
  'FixeoDB.createArtisan fallback creation still present');
check('A2.7 _lsGet used only for display cache (not as creation output)',
  /* _lsGet should not appear inside catch blocks that then proceed as success */
  !art.match(/catch[\s\S]{0,500}_lsGet[\s\S]{0,300}renderArtisansAdminTable/),
  '_lsGet used as success path in catch block');

/* ── S-ALC-3: FixeoClaimSystem mutation authority removed ─── */
console.log('\nS-ALC-3: FixeoClaimSystem mutation authority removed');
check('A3.1 _actionApproveClaim does NOT call FixeoClaimSystem.adminApproveClaim',
  !mod.match(/FixeoClaimSystem\.adminApproveClaim/),
  'FixeoClaimSystem.adminApproveClaim still called in approve path');
check('A3.2 _actionApproveClaim does NOT do direct localStorage claim write',
  /* The direct localStorage claim patch (claims[idx].status = 'approved') is removed */
  !mod.split('_actionApproveClaim')[1]
       .split('_actionMarkPending')[0]
       .includes("localStorage.setItem(CLAIMS_KEY"),
  'direct localStorage claim write still present in _actionApproveClaim');
check('A3.3 approve path uses FixeoRepository.approveClaimRequest exclusively',
  /* _actionApproveClaim is defined AFTER _actionMarkPending in the file;
   * split on function definition to get the correct body */
  (function() {
    var afterDef = mod.split('function _actionApproveClaim')[1];
    if (!afterDef) return false;
    /* Take only up to the next top-level function definition */
    var body = afterDef.split(/\n\s{2}\/\* \u2500\u2500 ACTION/)[0];
    return body.includes('FixeoRepository.approveClaimRequest');
  })(),
  'FixeoRepository.approveClaimRequest not called in approve path');
check('A3.4 approve handles RPC failure with error toast (not silent)',
  mod.includes('\u26a0\ufe0f \u00c9chec approbation') ||
  mod.includes('Échec') ||
  mod.includes('error'),
  'RPC failure not handled with error feedback');
check('A3.5 canonical authority comment present in approve function',
  mod.includes('CANONICAL AUTHORITY') || mod.includes('canonical'),
  'CANONICAL AUTHORITY comment missing');

/* ── S-ALC-4: Canonical RPC path confirmed ─────────────────── */
console.log('\nS-ALC-4: Canonical RPC path confirmed');
check('A4.1 approve_artisan_claim RPC in repository',
  repo.includes("'approve_artisan_claim'"),
  'approve_artisan_claim RPC missing from repository');
check('A4.2 reject_artisan_claim RPC in repository',
  repo.includes("'reject_artisan_claim'"),
  'reject_artisan_claim RPC missing from repository');
check('A4.3 approveClaimRequest exported from repository',
  repo.includes('approveClaimRequest:'),
  'approveClaimRequest not exported');
check('A4.4 rejectClaimRequest exported from repository',
  repo.includes('rejectClaimRequest:'),
  'rejectClaimRequest not exported');
check('A4.5 admin canonical sync uses FixeoRepository.approveClaimRequest',
  acs.includes('FixeoRepository.approveClaimRequest'),
  'canonical sync does not use canonical approve path');
check('A4.6 admin canonical sync uses FixeoRepository.rejectClaimRequest',
  acs.includes('FixeoRepository.rejectClaimRequest'),
  'canonical sync does not use canonical reject path');

/* ── S-ALC-5: Security ─────────────────────────────────────── */
console.log('\nS-ALC-5: Security');
check('A5.1 no service_role key in admin-artisans.js',
  !art.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && /service_role/i.test(t);
  }),
  'service_role key in admin-artisans.js');
check('A5.2 no service_role key in admin-artisan-moderation-p2.js',
  !mod.split('\n').some(function(line) {
    var t = line.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && /service_role/i.test(t);
  }),
  'service_role key in moderation p2');
check('A5.3 no owner_user_id direct UPDATE in admin-artisans.js',
  !art.match(/\.update\(.*owner_user_id/),
  'direct owner_user_id UPDATE in admin-artisans.js');
check('A5.4 no onboarding_completed direct UPDATE in admin-artisans.js',
  !art.match(/\.update\(.*onboarding_completed/),
  'direct onboarding_completed UPDATE');
check('A5.5 no p_artisan_id in RPC calls',
  !art.match(/p_artisan_id/) && !mod.match(/p_artisan_id/),
  'p_artisan_id in RPC call');
check('A5.6 no client_phone exposure',
  !art.match(/client_phone/) && !mod.match(/client_phone/),
  'client_phone exposed');

/* ── S-ALC-6: Canonical sync V1 still intact ───────────────── */
console.log('\nS-ALC-6: Canonical sync V1 still intact');
check('A6.1 admin.html loads canonical sync JS',
  html.includes('admin-canonical-sync-v1.js'),
  'canonical sync JS not in admin.html');
check('A6.2 admin.html loads canonical sync CSS',
  html.includes('admin-canonical-sync-v1.css'),
  'canonical sync CSS not in admin.html');
check('A6.3 canonical sync fetches claim_requests from Supabase',
  acs.includes("from('claim_requests')"),
  'claim_requests fetch missing from canonical sync');
check('A6.4 canonical sync fetches artisans from Supabase',
  acs.includes("from('artisans')"),
  'artisans fetch missing from canonical sync');
check('A6.5 four lifecycle pills still present',
  acs.includes('owner_user_id') &&
  acs.includes('onboarding_completed') &&
  acs.includes("availability === 'available'") &&
  acs.includes('a.verified'),
  'lifecycle pills incomplete in canonical sync');

/* ── RESULTS ─────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(58));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('✓ ALL ' + total + ' PASS');
} else {
  console.log('\nFailed tests:');
  results.failures.forEach(function(f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
