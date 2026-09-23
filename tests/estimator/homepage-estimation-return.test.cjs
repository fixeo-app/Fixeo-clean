'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const read = name => fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8');
const html = read('index.html');
const criticalStyle = html.match(/<style id="fixeo-clean-home-display">([\s\S]*?)<\/style>/)[1];
const snapshot = storage => Array.from({length: storage.length}, (_, i) => {
  const key = storage.key(i); return [key, storage.getItem(key)];
}).sort();
function home(t, {suppressed = true, completed = false, storage, verify} = {}) {
  const dom = new JSDOM('<!doctype html><html' + (suppressed ? ' data-fixeo-clean-home' : '') + '><head><style>' + criticalStyle +
    '</style></head><body><section id="home" class="fxhro-price-ready-state fxhro-has-city"><div class="hero-content">' +
    '<div class="rfos-stage-wrap"></div><input id="qsm-input-nlp" value="Un nouveau besoin">' +
    '<div id="fxhro-card">Ancien prix FIXEO</div></div></section><section id="fixeo-estimation-signature"></section>' +
    '<section id="fixeo-diagnostic-section"></section></body></html>',
    {url: 'https://fixture.invalid/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window, requests = [], timers = new Map();
  let timer = 0;
  w.setTimeout = fn => { timers.set(++timer, fn); return timer; };
  w.clearTimeout = id => timers.delete(id);
  w.FixeoEstimatorConfig = {estimatorV2Enabled: true};
  w.FixeoEstimatorV2 = {isOpen: () => false};
  w.FixeoEstimatorAPI = {verifyPricingContext: async token => {
    requests.push(token);
    return verify ? verify(token) : {valid: true, outcome_type: 'PRICE_READY', amount_mad: 220,
      service_label: 'Diagnostic serrurerie', city_slug: 'fes'};
  }};
  w.eval(read('js/fixeo-estimator-reservation-bridge-v1.js'));
  const bridge = w.FixeoEstimatorReservationBridge;
  if (storage) for (const [key, value] of storage) w.sessionStorage.setItem(key, value);
  else {
    bridge.prepareContext('opaque-price-context');
    w.sessionStorage.setItem('fixture-estimation-session', 'opaque-session');
    if (completed) bridge.completeContext('opaque-price-context', {tracking_ref: 'FX-FIXTURE'});
  }
  w.localStorage.setItem('fixture-idempotence', 'unchanged-fixture-key');
  const before = {session: snapshot(w.sessionStorage), local: snapshot(w.localStorage)};
  const firstPaintDisplay = w.getComputedStyle(w.document.getElementById('fxhro-card')).display;
  w.eval(read('js/fixeo-hero-resume-v1.js'));
  async function flush() {
    for (let cycle = 0; cycle < 4; cycle++) {
      await Promise.resolve();
      const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn());
    }
  }
  function clean() {
    assert.equal(w.document.getElementById('fxhro-card'), null);
    assert.equal(w.document.getElementById('home').classList.contains('fxhro-price-ready-state'), false);
    assert.equal(w.FixeoHeroResume.isActive(), false);
    assert.equal(w.document.getElementById('qsm-input-nlp').value, 'Un nouveau besoin');
    assert.deepEqual(snapshot(w.sessionStorage), before.session);
    assert.deepEqual(snapshot(w.localStorage), before.local);
  }
  return {w, bridge, requests, before, firstPaintDisplay, flush, clean};
}

for (const completed of [false, true]) {
  test('home return ' + (completed ? 'after confirmation' : 'after price') + ': no card/flash and exact persisted context retained', async t => {
    const s = home(t, {completed});
    assert.equal(s.firstPaintDisplay, 'none', 'critical CSS hides an old card before JS runs');
    for (const event of ['DOMContentLoaded', 'fixeo:estimator-closed', 'fixeo:reservation-closed']) {
      s.w.document.dispatchEvent(new s.w.Event(event));
      await s.flush(); s.clean();
    }
    s.w.dispatchEvent(new s.w.PageTransitionEvent('pageshow', {persisted: true}));
    s.w.dispatchEvent(new s.w.PopStateEvent('popstate'));
    s.w.FixeoHeroResume.refresh();
    await s.flush(); s.clean();
    assert.deepEqual(s.requests, []);
    assert.equal(s.bridge.getContext(), 'opaque-price-context');
    if (completed) assert.equal(s.bridge.getCompletion().tracking_ref, 'FX-FIXTURE');
    const reload = home(t, {storage: snapshot(s.w.sessionStorage)});
    reload.w.FixeoHeroResume.refresh(); await reload.flush(); reload.clean();
    assert.deepEqual(reload.requests, []);
    assert.equal(reload.bridge.getContext(), s.bridge.getContext());
    // Explicit technical resume still reaches server verification with the same token.
    const verified = await reload.bridge.verifyContext();
    assert.equal(verified._token, 'opaque-price-context');
    assert.equal(verified.amount_mad, 220);
    reload.clean();
  });
}

test('late pre-return verification cannot paint a card after homepage display policy applies', async t => {
  let resolve;
  const s = home(t, {suppressed: false, verify: () => new Promise(r => { resolve = r; })});
  s.w.FixeoHeroResume.refresh(); await s.flush();
  s.w.document.documentElement.setAttribute('data-fixeo-clean-home', '');
  resolve({valid: true, outcome_type: 'PRICE_READY', amount_mad: 220,
    service_label: 'Diagnostic serrurerie', city_slug: 'fes'});
  await s.flush();
  s.clean();
});

test('suppression is homepage-only: technical resume on other pages remains available', async t => {
  const s = home(t, {suppressed: false});
  s.w.FixeoHeroResume.refresh(); await s.flush();
  assert.equal(s.w.FixeoHeroResume.isActive(), true);
  assert.match(s.w.document.getElementById('fxhro-card').textContent, /220/);
  assert.deepEqual(snapshot(s.w.sessionStorage), s.before.session);
  assert.ok(!read('estimation.html').includes('data-fixeo-clean-home'));
});

test('homepage first-paint policy is narrowly scoped and preserves section order and the existing estimator entry', () => {
  const dom = new JSDOM(html);
  try {
    const d = dom.window.document;
    assert.ok(d.documentElement.hasAttribute('data-fixeo-clean-home'));
    const style = d.getElementById('fixeo-clean-home-display');
    assert.equal(style.parentElement, d.head);
    assert.equal(style.sheet.cssRules.length, 1);
    assert.equal(style.sheet.cssRules[0].selectorText, 'html[data-fixeo-clean-home] #fxhro-card');
    assert.ok(d.getElementById('home').compareDocumentPosition(d.getElementById('fixeo-estimation-signature')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(d.getElementById('fxes-open-estimator'));
    assert.equal(d.getElementById('fxhro-card'), null);
    assert.equal(d.querySelector('script[src*="fixeo-hero-resume-v1.js"]').getAttribute('src'), 'js/fixeo-hero-resume-v1.js?v=clean-home-v3');
  } finally { dom.window.close(); }
});
