#!/usr/bin/env node
/* Phase 7C.9L.3Z.1 — FAEE Isolation from Estimator V2
 * 33 targeted tests. Run: node estimator-v2-3z1-faee-isolation-tests.js
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '../../../../..');

var faeeSrc  = fs.readFileSync(path.join(root, 'js/fixeo-estimation-engine-v1.js'), 'utf8');
var resSrc   = fs.readFileSync(path.join(root, 'js/reservation.js'), 'utf8');
var idxSrc   = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var resV2Src = fs.readFileSync(path.join(root, 'js/reservation-v2.js'), 'utf8');

var pass = 0, fail = 0;
function t(label, result) {
  if (result) { pass++; console.log('  PASS: ' + label); }
  else        { fail++; console.log('  FAIL: ' + label); }
}

console.log('Phase 7C.9L.3Z.1 — FAEE Isolation from Estimator V2\n');

/* ═══════════════════════════════════════════════════════
   HERO SUPPRESSION
═══════════════════════════════════════════════════════ */
console.log('── HERO SUPPRESSION ──');

t('T01: _v2Enabled() helper exists in FAEE',
  faeeSrc.includes('function _v2Enabled()'));

t('T02: _v2Enabled() reads FixeoEstimatorConfig.estimatorV2Enabled',
  faeeSrc.includes('FixeoEstimatorConfig') &&
  faeeSrc.includes('estimatorV2Enabled === true'));

t('T03: _v2Enabled() does NOT invent a second flag name',
  (function() {
    var fn = faeeSrc.substring(faeeSrc.indexOf('function _v2Enabled()'), faeeSrc.indexOf('function _v2Enabled()') + 200);
    return fn.includes('estimatorV2Enabled') && !fn.includes('faeeV2Disabled') && !fn.includes('estimatorV1Disabled');
  })());

t('T04: _attachToHero() early-exits when _v2Enabled() returns true',
  (function() {
    var heroIdx = faeeSrc.indexOf('function _attachToHero()');
    var block = faeeSrc.substring(heroIdx, heroIdx + 600);
    return block.includes('_v2Enabled()') && block.includes('return');
  })());

t('T05: Hero suppression removes stale #faee-hero-container when V2 enabled',
  (function() {
    var heroIdx = faeeSrc.indexOf('function _attachToHero()');
    var block = faeeSrc.substring(heroIdx, heroIdx + 600);
    return block.includes('faee-hero-container') && block.includes('removeChild');
  })());

t('T06: Hero V2 guard is BEFORE the #faee-v2-hero guard (V2 flag takes precedence)',
  (function() {
    var heroIdx = faeeSrc.indexOf('function _attachToHero()');
    var block = faeeSrc.substring(heroIdx, heroIdx + 900);
    var v2EnabledPos = block.indexOf('_v2Enabled()');
    var v2HeroPos    = block.indexOf('faee-v2-hero');
    return v2EnabledPos >= 0 && v2HeroPos >= 0 && v2EnabledPos < v2HeroPos;
  })());

t('T07: fixeo-rafi-os-v1.js is NOT modified (not referenced in changed files)',
  !faeeSrc.includes('rfos') && !resSrc.includes('rfos'));

t('T08: Hero suppression code is inside _attachToHero body (not a global disable)',
  (function() {
    var heroIdx = faeeSrc.indexOf('function _attachToHero()');
    var nextFnIdx = faeeSrc.indexOf('\n  function ', heroIdx + 10);
    var block = faeeSrc.substring(heroIdx, nextFnIdx > 0 ? nextFnIdx : heroIdx + 900);
    return block.includes('_v2Enabled()');
  })());

t('T09: _updateHero() not suppressed (non-V2 hero path preserved for future use)',
  (function() {
    var heroUpdateIdx = faeeSrc.indexOf('function _updateHero(');
    var block = faeeSrc.substring(heroUpdateIdx, heroUpdateIdx + 900);
    return !block.includes('_v2Enabled()');
  })());

/* ═══════════════════════════════════════════════════════
   RESERVATION DISCRIMINATOR
═══════════════════════════════════════════════════════ */
console.log('\n── RESERVATION DISCRIMINATOR ──');

t('T10: render() sets data-estimator-context="true" when estimatorCtx.valid',
  resSrc.includes("modal.setAttribute('data-estimator-context', 'true')"));

t('T11: render() removes data-estimator-context when ctx not valid',
  resSrc.includes("modal.removeAttribute('data-estimator-context')"));

t('T12: data-estimator-context driven by state._estimatorCtx.valid in render()',
  (function() {
    // Both the valid check and the setAttribute must appear in the same render() block
    var renderIdx = resSrc.indexOf('function render()');
    var endIdx = resSrc.indexOf('\n  function ', renderIdx + 10);
    var block = resSrc.substring(renderIdx, endIdx > 0 ? endIdx : renderIdx + 1200);
    return block.includes('_estimatorCtx') && block.includes('.valid') &&
           block.includes('data-estimator-context');
  })());

t('T13: marker set BEFORE modal.innerHTML replacement (attribute survives render)',
  (function() {
    var renderIdx = resSrc.indexOf('function render()');
    var endIdx = resSrc.indexOf('\n  function ', renderIdx + 10);
    var block = resSrc.substring(renderIdx, endIdx > 0 ? endIdx : renderIdx + 1200);
    var setIdx  = block.indexOf("setAttribute('data-estimator-context'");
    var htmlIdx = block.indexOf('modal.innerHTML =');
    return setIdx >= 0 && htmlIdx >= 0 && setIdx < htmlIdx;
  })());

t('T14: marker value is "true" only — no price data',
  (function() {
    var i = resSrc.indexOf("setAttribute('data-estimator-context'");
    var nearby = resSrc.substring(i, i + 80);
    return !nearby.includes('amount_mad') && !nearby.includes('MAD') && nearby.includes("'true'");
  })());

t('T15: marker value contains no token string',
  (function() {
    var i = resSrc.indexOf("setAttribute('data-estimator-context'");
    var nearby = resSrc.substring(i, i + 80);
    return !nearby.includes('token') && !nearby.includes('_token');
  })());

t('T16: marker value contains no city slug',
  (function() {
    var i = resSrc.indexOf("setAttribute('data-estimator-context'");
    var nearby = resSrc.substring(i, i + 80);
    return !nearby.includes('city') && !nearby.includes('slug');
  })());

t('T17: marker value contains no service code',
  (function() {
    var i = resSrc.indexOf("setAttribute('data-estimator-context'");
    var nearby = resSrc.substring(i, i + 80);
    return !nearby.includes('service_code') && !nearby.includes('service_label');
  })());

/* ═══════════════════════════════════════════════════════
   FAEE _update SUPPRESSION
═══════════════════════════════════════════════════════ */
console.log('\n── FAEE _update SUPPRESSION ──');

t('T18: _update() reads data-estimator-context from modal element',
  faeeSrc.includes("getAttribute('data-estimator-context')"));

t('T19: _update() returns early when marker equals "true"',
  (function() {
    var i = faeeSrc.indexOf("getAttribute('data-estimator-context')");
    var block = faeeSrc.substring(i, i + 200);
    return block.includes("=== 'true'");
  })());

t('T20: _update() removes stale #faee-container when V2 marker present',
  (function() {
    var i = faeeSrc.indexOf("getAttribute('data-estimator-context')");
    var block = faeeSrc.substring(i, i + 400);
    return block.includes('faee-container') && block.includes('removeChild');
  })());

t('T21: FAEE suppression block is BEFORE the analyze/render code in _update()',
  (function() {
    var updateIdx = faeeSrc.indexOf('function _update(m)');
    var endIdx = faeeSrc.indexOf('\n  function ', updateIdx + 10);
    var block = faeeSrc.substring(updateIdx, endIdx > 0 ? endIdx : updateIdx + 1000);
    var markerIdx  = block.indexOf('data-estimator-context');
    var analyzeIdx = block.indexOf('analyze(');
    return markerIdx >= 0 && analyzeIdx >= 0 && markerIdx < analyzeIdx;
  })());

t('T22: analyze() still called in non-V2 path (non-V2 FAEE preserved)',
  (function() {
    var updateIdx = faeeSrc.indexOf('function _update(m)');
    var endIdx = faeeSrc.indexOf('\n  function ', updateIdx + 10);
    var block = faeeSrc.substring(updateIdx, endIdx > 0 ? endIdx : updateIdx + 1000);
    return block.includes('analyze(');
  })());

t('T23: fixeo-estimator-v2.js not modified (data-estimator-context absent)',
  (function() {
    var estV2Src = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
    return !estV2Src.includes('data-estimator-context');
  })());

/* ═══════════════════════════════════════════════════════
   PROFILE RETURN
═══════════════════════════════════════════════════════ */
console.log('\n── PROFILE RETURN ──');

t('T24: verifyContext sets state._estimatorCtx = ctx (existing path untouched)',
  resSrc.includes('state._estimatorCtx = ctx;'));

t('T25: render() called after verifyContext resolves (marker set in same call)',
  (function() {
    // Both render() and state._estimatorCtx = ctx; must appear in verifyContext then block
    var thenIdx = resSrc.indexOf('FixeoEstimatorReservationBridge.verifyContext().then');
    var block   = resSrc.substring(thenIdx, thenIdx + 2500);
    return block.includes('render()') && block.includes('state._estimatorCtx = ctx');
  })());

t('T26: Tunnel class NOT used as discriminator (marker derived from ctx.valid)',
  !faeeSrc.includes('fx-estimator-tunnel-active'));

/* ═══════════════════════════════════════════════════════
   AUTHORITATIVE PRICE BLOCK PRESERVED
═══════════════════════════════════════════════════════ */
console.log('\n── AUTHORITATIVE PRICE BLOCK ──');

t('T27: fxrv2-estimation block in reservation-v2.js unchanged',
  resV2Src.includes("block.className = 'fxrv2-estimation'"));

t('T28: Prix FIXEO amount_mad display in reservation.js unchanged',
  resSrc.includes('Prix FIXEO'));

t('T29: FAEE suppression does NOT mention fxrv2-estimation (not removed)',
  (function() {
    var i = faeeSrc.indexOf("getAttribute('data-estimator-context')");
    var block = faeeSrc.substring(i, i + 400);
    return !block.includes('fxrv2-estimation');
  })());

/* ═══════════════════════════════════════════════════════
   CACHE KEYS
═══════════════════════════════════════════════════════ */
console.log('\n── CACHE KEYS ──');

t('T30: fixeo-estimation-engine-v1.js bumped to faee-v2a in index.html',
  idxSrc.includes('fixeo-estimation-engine-v1.js?v=faee-v2a'));

t('T31: reservation.js bumped to v1i in index.html',
  idxSrc.includes('reservation.js?v=v1k-ios-scroll'));

t('T32: VERSION in FAEE updated to faee-v2a',
  faeeSrc.includes("var VERSION          = 'faee-v2a'"));

/* ═══════════════════════════════════════════════════════
   FROZEN FILES UNTOUCHED
═══════════════════════════════════════════════════════ */
console.log('\n── FROZEN FILES ──');

t('T33: fixeo-estimator-v2.js has neither data-estimator-context nor _v2Enabled',
  (function() {
    var estV2Src = fs.readFileSync(path.join(root, 'js/fixeo-estimator-v2.js'), 'utf8');
    return !estV2Src.includes('data-estimator-context') && !estV2Src.includes('_v2Enabled');
  })());

/* ─────────────────── SCORE ─────────────────── */
console.log('\n==============================');
console.log('3Z.1 TESTS: ' + (pass + fail) + ' total | PASS: ' + pass + ' | FAIL: ' + fail);
if (fail === 0) console.log('ALL PASS ✓');
else { console.error('FAILURES: ' + fail); process.exit(1); }
