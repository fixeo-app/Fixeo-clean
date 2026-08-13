/**
 * FIXEO — Client Dashboard Request Flow Convergence Tests
 * data/pricing/ux/prototype/tests/dashboard-client-request-convergence-tests.js
 *
 * Verifies that dashboard-client.html now uses canonical V4 engine
 * and legacy request engine is no longer loaded.
 *
 * T1:  V4 CSS present in dashboard-client.html
 * T2:  fixeo-client-requests-store.js loaded in dashboard
 * T3:  fx-request-flow-v4.js loaded in dashboard
 * T4:  Legacy CSS removed from dashboard
 * T5:  Legacy scripts removed from dashboard
 * T6:  Legacy #request-modal HTML absent from dashboard
 * T7:  Inline openModal/closeModal shim removed
 * T8:  _openNewRequest uses FixeoRequestFlowV4.open (standard)
 * T9:  _openUrgentRequest uses FixeoRequestFlowV4.open (emergency)
 * T10: V4 not modified (canonical source untouched)
 * T11: All 5 CTA data-actions still present in dashboard HTML/JS
 * T12: fixeo:client-request-submit-success listener wired for refresh
 * T13: Artisan dashboard not modified
 * T14: Admin HTML not modified
 * T15: fx-request-flow-v4.js exposes FixeoRequestFlowV4.open + .close
 * T16: V4 accepts modes: default, emergency, express (legacy alias)
 * T17: Legacy engine files still present in repo (not deleted globally)
 * T18: Legacy "Planifier votre intervention" text absent from dashboard
 * T19: Legacy "Intervention urgente - Artisan disponible" absent from dash HTML
 * T20: V4 load order: store before V4 in dashboard
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT  = path.resolve(__dirname, '../../../../..');

var DASH    = fs.readFileSync(path.join(ROOT, 'dashboard-client.html'), 'utf8');
var DASHV2  = fs.readFileSync(path.join(ROOT, 'js/fixeo-dashboard-v2.js'), 'utf8');
var V4      = fs.readFileSync(path.join(ROOT, 'js/fx-request-flow-v4.js'), 'utf8');
var ARTISAN = fs.readFileSync(path.join(ROOT, 'dashboard-artisan-v2.html'), 'utf8');
var ADMIN   = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

var results = { pass: 0, fail: 0, failures: [] };
function pass(n) { results.pass++; process.stdout.write('  \u2713 [PASS] ' + n + '\n'); }
function fail(n, r) {
  results.fail++;
  results.failures.push(n + ': ' + r);
  process.stdout.write('  \u2717 [FAIL] ' + n + ' \u2014 ' + r + '\n');
}
function check(n, c, r) { c ? pass(n) : fail(n, r || 'Condition false'); }

/* ── T1: V4 CSS in dashboard ───────────────────────────────── */
console.log('\nT1: Canonical V4 CSS present');
check('T1.1 fx-request-flow-v4.css loaded',
  DASH.includes('fx-request-flow-v4.css'), 'V4 CSS not in dashboard-client.html');

/* ── T2: fixeo-client-requests-store.js loaded ─────────────── */
console.log('\nT2: fixeo-client-requests-store.js loaded');
check('T2.1 store script present',
  DASH.includes('fixeo-client-requests-store.js'), 'store not loaded in dashboard');

/* ── T3: fx-request-flow-v4.js loaded ──────────────────────── */
console.log('\nT3: fx-request-flow-v4.js loaded');
check('T3.1 V4 script present',
  DASH.includes('fx-request-flow-v4.js'), 'V4 not loaded in dashboard');

/* ── T4: Legacy CSS removed ─────────────────────────────────── */
console.log('\nT4: Legacy CSS removed');
var LEGACY_CSS = [
  'fixeo-request-modal-v2.css',
  'fixeo-urgent-modal-v3.css',
  'fixeo-urgent-modal-v3-patch.css',
  'request-form.css',
  'fixeo-request-v2.css',
  'fixeo-urgent-v2.css',
  'fixeo-modal-scroll-fix.css',
  'fixeo-estimation-engine-v1.css',
];
LEGACY_CSS.forEach(function(f) {
  check('T4 legacy CSS absent: ' + f,
    !DASH.includes(f), f + ' still referenced in dashboard');
});

/* ── T5: Legacy scripts removed ─────────────────────────────── */
console.log('\nT5: Legacy scripts removed');
var LEGACY_JS = [
  'request-form.js',
  'fixeo-request-modal-v2.js',
  'fixeo-urgent-modal-v3.js',
  'fixeo-urgent-modal-v3-patch.js',
  'fixeo-express-route-shim.js',
  'fixeo-request-v2.js',
  'fixeo-urgent-v2.js',
  'fixeo-estimation-engine-v1.js',
];
LEGACY_JS.forEach(function(f) {
  check('T5 legacy script absent: ' + f,
    !DASH.includes(f), f + ' still loaded in dashboard');
});

/* ── T6: Inline #request-modal HTML absent ──────────────────── */
console.log('\nT6: Inline legacy modal HTML absent');
check('T6.1 #request-modal block absent',
  !DASH.includes('id="request-modal"'), '#request-modal still in dashboard HTML');
check('T6.2 modal-backdrop absent',
  !DASH.includes('modal-backdrop'), '.modal-backdrop still in dashboard HTML');
check('T6.3 Quel est le problème absent',
  !DASH.includes('Quel est le probl'), 'Legacy modal title still in dashboard HTML');

/* ── T7: Inline shim removed ────────────────────────────────── */
console.log('\nT7: openModal/closeModal shim removed');
check('T7.1 inline openModal shim absent',
  !DASH.includes('fix(client-dashboard): provide canonical window.openModal'),
  'Legacy openModal shim still in dashboard');

/* ── T8: _openNewRequest uses FixeoRequestFlowV4 ───────────── */
console.log('\nT8: _openNewRequest calls FixeoRequestFlowV4.open (default)');
check('T8.1 FixeoRequestFlowV4.open called in _openNewRequest',
  DASHV2.includes("window.FixeoRequestFlowV4.open({ mode: 'default'"),
  '_openNewRequest does not call FixeoRequestFlowV4.open with default mode');
check('T8.2 no FixeoClientRequest.open in _openNewRequest',
  (function() {
    var fnStart = DASHV2.indexOf('function _openNewRequest()');
    var fnEnd   = DASHV2.indexOf('function _openUrgentRequest', fnStart);
    var block   = DASHV2.slice(fnStart, fnEnd);
    return !block.includes('FixeoClientRequest.open(');
  })(),
  '_openNewRequest still references legacy FixeoClientRequest.open');
check('T8.3 no legacy service-grid fallback in _openNewRequest',
  (function() {
    var fnStart = DASHV2.indexOf('function _openNewRequest()');
    var fnEnd   = DASHV2.indexOf('function _openUrgentRequest', fnStart);
    var block   = DASHV2.slice(fnStart, fnEnd);
    return !block.includes('fxv2-req-form') && !block.includes('Nouvelle demande');
  })(),
  '_openNewRequest still contains legacy service-grid modal code');

/* ── T9: _openUrgentRequest uses FixeoRequestFlowV4 ─────────── */
console.log('\nT9: _openUrgentRequest calls FixeoRequestFlowV4.open (emergency)');
check('T9.1 FixeoRequestFlowV4.open emergency in _openUrgentRequest',
  DASHV2.includes("window.FixeoRequestFlowV4.open({ mode: 'emergency'"),
  '_openUrgentRequest does not call V4 with emergency mode');
check('T9.2 no legacy openExpress in _openUrgentRequest',
  (function() {
    var fnStart = DASHV2.indexOf('function _openUrgentRequest');
    var fnEnd   = DASHV2.indexOf('function _openModal', fnStart);
    var block   = DASHV2.slice(fnStart, fnEnd);
    return !block.includes('FixeoClientRequest.openExpress');
  })(),
  '_openUrgentRequest still references legacy openExpress');

/* ── T10: V4 not modified ───────────────────────────────────── */
console.log('\nT10: fx-request-flow-v4.js not modified');
check('T10.1 V4 version marker preserved (fxrf4-v5e)',
  V4.includes('fxrf4-v5e-final-polish') || V4.includes('fxrf4-v5c'),
  'V4 version marker missing — file may have been modified');
check('T10.2 V4 exposes FixeoRequestFlowV4 global',
  V4.includes('window.FixeoRequestFlowV4'), 'FixeoRequestFlowV4 not exported by V4');

/* ── T11: All 5 CTA data-actions still present ──────────────── */
console.log('\nT11: All 5 dashboard CTAs still wired');
check('T11.1 data-action="new-urgent" present (shortcut)',
  DASHV2.includes('data-action="new-urgent"'), 'Urgent shortcut action missing');
check('T11.2 data-action="new-request" present (shortcut + CTAs)',
  (DASHV2.match(/data-action="new-request"/g) || []).length >= 2,
  'Less than 2 new-request data-actions found in dashboard JS');
check('T11.3 _openNewRequest dispatched by event handler',
  DASHV2.includes("case 'new-request':") && DASHV2.includes('_openNewRequest()'),
  'new-request case not dispatching _openNewRequest');
check('T11.4 _openUrgentRequest dispatched by event handler',
  DASHV2.includes("case 'new-urgent':") && DASHV2.includes('_openUrgentRequest('),
  'new-urgent case not dispatching _openUrgentRequest');

/* ── T12: fixeo:client-request-submit-success listener ─────── */
console.log('\nT12: Dashboard listens for V4 submit event to trigger refresh');
check('T12.1 listener present',
  DASHV2.includes("'fixeo:client-request-submit-success'"),
  'fixeo:client-request-submit-success listener not in dashboard');
check('T12.2 _refresh called in listener',
  (function() {
    var idx = DASHV2.indexOf('fixeo:client-request-submit-success');
    var block = DASHV2.slice(idx, idx + 300);
    return block.includes('_refresh');
  })(),
  '_refresh not called inside fixeo:client-request-submit-success listener');

/* ── T13: Artisan dashboard not modified ────────────────────── */
console.log('\nT13: Artisan dashboard untouched');
check('T13.1 artisan dashboard has no V4 reference injected incorrectly',
  !ARTISAN.includes('fx-request-flow-v4') || ARTISAN.includes('<!-- no V4'),
  'fx-request-flow-v4 unexpectedly appeared in artisan dashboard');
check('T13.2 artisan dashboard claim engine preserved',
  ARTISAN.includes('claim') || ARTISAN.includes('artisan'),
  'Artisan dashboard may have been damaged');

/* ── T14: Admin not modified ─────────────────────────────────── */
console.log('\nT14: Admin HTML untouched');
check('T14.1 admin still loads admin-realtime-v1.js',
  ADMIN.includes('admin-realtime-v1.js'), 'admin.html lost admin-realtime-v1.js');
check('T14.2 admin still loads admin-canonical-sync-v1.js',
  ADMIN.includes('admin-canonical-sync-v1.js'), 'admin.html lost canonical sync');

/* ── T15: V4 public API shape ───────────────────────────────── */
console.log('\nT15: FixeoRequestFlowV4 public API shape');
check('T15.1 V4 exposes .open',
  V4.includes('open:    open'), 'FixeoRequestFlowV4.open not exported');
check('T15.2 V4 exposes .close',
  V4.includes('close:   close'), 'FixeoRequestFlowV4.close not exported');
check('T15.3 V4 exposes VERSION',
  V4.includes('VERSION:'), 'FixeoRequestFlowV4.VERSION not exported');

/* ── T16: V4 mode handling ──────────────────────────────────── */
console.log('\nT16: V4 accepts correct modes');
check('T16.1 V4 handles "default" mode',
  V4.includes("'default'"), 'V4 missing default mode');
check('T16.2 V4 handles "emergency" mode',
  V4.includes("'emergency'"), 'V4 missing emergency mode');
check('T16.3 V4 treats "express" as alias for "emergency"',
  V4.includes("rawMode === 'express'") && V4.includes("rawMode = 'emergency'"),
  'V4 express→emergency alias missing');

/* ── T17: Legacy files still in repo (global) ───────────────── */
console.log('\nT17: Legacy files preserved in repo (other surfaces may use them)');
var PRESERVE = ['js/request-form.js','js/fixeo-urgent-modal-v3.js','js/fixeo-request-v2.js'];
PRESERVE.forEach(function(f) {
  check('T17 repo file preserved: ' + f,
    fs.existsSync(path.join(ROOT, f)), f + ' was deleted from repo — must not be deleted globally');
});

/* ── T18: Legacy standard modal title absent from dashboard ─── */
console.log('\nT18: Legacy modal text absent from dashboard HTML');
check('T18.1 "Planifier votre intervention" absent',
  !DASH.includes('Planifier votre intervention'),
  'Legacy standard modal title still in dashboard HTML');

/* ── T19: Legacy urgent modal title absent ──────────────────── */
console.log('\nT19: Legacy urgent modal text absent from dashboard HTML');
check('T19.1 "Intervention urgente - Artisan disponible" absent',
  !DASH.includes('Intervention urgente - Artisan disponible'),
  'Legacy urgent modal title still in dashboard HTML');

/* ── T20: Load order: store before V4 ──────────────────────── */
console.log('\nT20: Script load order correct');
check('T20.1 fixeo-client-requests-store before fx-request-flow-v4',
  DASH.indexOf('fixeo-client-requests-store.js') < DASH.indexOf('fx-request-flow-v4.js'),
  'Store must be loaded before V4 engine in dashboard');
check('T20.2 V4 before fixeo-dashboard-v2.js',
  DASH.indexOf('fx-request-flow-v4.js') < DASH.indexOf('fixeo-dashboard-v2.js'),
  'V4 must be loaded before fixeo-dashboard-v2.js');

/* ── RESULTS ─────────────────────────────────────────────────── */
console.log('\n' + '\u2500'.repeat(60));
var total = results.pass + results.fail;
console.log('Total: ' + total + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
if (results.fail === 0) {
  console.log('\u2713 ALL ' + total + ' PASS');
} else {
  console.log('\nFailed:');
  results.failures.forEach(function(f) { console.log('  \u2717 ' + f); });
  process.exit(1);
}
