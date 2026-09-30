'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const html = read('dashboard-client.html');
const js = read('js/fixeo-dashboard-v2.js');
const css = read('css/fixeo-dashboard-v2.css');
const vercel = JSON.parse(read('vercel.json'));
const clientContext = require('../../api/client-context-fn/index.js')._test;

test('C4.0 legacy empty marketing block and V4 modal entry are detached', () => {
  assert.equal(js.includes('_renderPremiumEmpty'), false);
  assert.equal(js.includes('FixeoRequestFlowV4'), false);
  assert.equal(html.includes('fx-request-flow-v4.js'), false);
  assert.equal(html.includes('fixeo-client-requests-store.js'), false);
  assert.match(js, /function _renderClientEmptyActions/);
  assert.match(js, /function _renderRequestComposer/);
  assert.match(html, /id="fxv2-sec-new-request"/);
});

test('C4.1 Client OS no longer loads parallel dashboard tracking truth', () => {
  assert.equal(html.includes('fixeo-tracking-engine.js'), false);
  assert.equal(html.includes('fixeo-tracking-engine.css'), false);
  assert.equal(js.includes('ANALYZING'), false);
  assert.equal(js.includes('MATCHING'), false);
});

test('C4.2 authenticated request creation is direct and idempotent', () => {
  assert.match(js, /FixeoSupabase\.submitServiceRequest/);
  assert.match(js, /idempotency_key/);
  assert.match(js, /X-Fxauth-Token/);
  assert.match(js, /fetch\('\/api\/urgent-request'/);
  assert.equal(js.includes("window.addEventListener('fixeo:client-request-created'"), false);
  assert.equal(js.includes('_fxv2PersistedIds'), false);
});

test('C4.3 notifications use one canonical Client OS reader', () => {
  assert.equal(html.includes('fixeo-notifications-real-v1.js'), false);
  assert.equal(html.includes('fixeo-notification-engine.js'), false);
  assert.equal(html.includes('fixeo-notification-center-v1.js'), false);
  assert.equal(html.includes('fixeo-notification-center-v1.css'), false);
  assert.equal(html.includes('fixeo-notifications-real-v1.css'), false);
  assert.match(js, /from\('notifications'\)/);
  assert.match(js, /postgres_changes/);
  assert.match(js, /recipient_user_id=eq\./);
});

test('C4.4 RAFI is grounded in the server context contract', () => {
  assert.match(js, /fetch\('\/api\/client-context'/);
  assert.match(js, /_renderRafiCanonicalProof/);
  assert.match(js, /source:'server'/);
  const route = vercel.routes.find(r => r.src === '^/api/client-context$');
  assert.ok(route);
  assert.equal(route.dest, '/api/client-context-fn/index.js');
  assert.ok(vercel.builds.some(b => b.src === 'api/client-context-fn/index.js'));
});

test('C4.4 server decision contract prioritizes confirmation then quote then live state', () => {
  const base = {requests:[],quotes:[],missions:[],notifications:[]};
  let d = clientContext.decisionFrom({
    ...base,
    requests:[{id:'r1',status:'completed',updated_at:'2026-09-30T10:00:00Z'}],
    quotes:[{id:'q1',request_id:'r1',status:'pending',created_at:'2026-09-30T11:00:00Z'}]
  });
  assert.equal(d.kind,'confirm_completed');
  d = clientContext.decisionFrom({
    ...base,
    requests:[{id:'r1',status:'new',updated_at:'2026-09-30T10:00:00Z'}],
    quotes:[{id:'q1',request_id:'r1',status:'pending',created_at:'2026-09-30T11:00:00Z'}]
  });
  assert.equal(d.kind,'review_quote');
  d = clientContext.decisionFrom({...base,requests:[{id:'r1',status:'in_progress',updated_at:'2026-09-30T10:00:00Z'}]});
  assert.equal(d.kind,'track_mission');
  d = clientContext.decisionFrom(base);
  assert.equal(d.kind,'new_request');
});

test('C4.5 navigation exposes decisions, requests, interventions and canonical dossier labels', () => {
  assert.match(html, /data-section="decision"[^>]*><span class="icon">◆/);
  assert.match(html, /data-section="requests"[^>]*><span class="icon">▦/);
  assert.match(html, />Dossier & preuves</);
  assert.match(html, />Contacts & échanges</);
  assert.match(html, /data-section="decision" aria-label="Décisions"/);
});

test('C4.5 support number is centralized for later 0663 cutover', () => {
  assert.equal(html.includes('212660484415'), false);
  assert.equal((js.match(/212660484415/g)||[]).length,1);
  assert.match(js, /FIXEO_CONTACTS/);
  assert.match(js, /_fixeoSupportWhatsAppUrl/);
});

test('C4.5 desktop sidebar accessibility and modal focus are explicit', () => {
  assert.match(js, /function _syncSidebarA11y/);
  assert.match(js, /aria-current/);
  assert.match(js, /_modalReturnFocus/);
  assert.match(js, /e\.key==='Escape'/);
});

test('legacy client dashboard URLs redirect at the edge', () => {
  const redirects = new Map(vercel.redirects.map(r => [r.source,r]));
  assert.equal(redirects.get('/dashboard-client-v1.html').destination,'/dashboard-client.html');
  assert.equal(redirects.get('/dashboard-client-v2.html').destination,'/dashboard-client.html');
  assert.equal(redirects.get('/dashboard-client-v1.html').permanent,true);
  assert.equal(redirects.get('/dashboard-client-v2.html').permanent,true);
});

test('cachebusters point at the C4 final assets', () => {
  assert.match(html, /fixeo-dashboard-v2\.css\?v=client-os-c4-final/);
  assert.match(html, /fixeo-dashboard-v2\.js\?v=client-os-c4-final/);
  assert.match(css, /CLIENT OS C4/);
});
