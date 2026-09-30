'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const html = read('dashboard-client.html');
const js = read('js/fixeo-dashboard-v2.js');
const core = read('js/fixeo-supabase-core.js');
const css = read('css/fixeo-dashboard-v2.css');
const vercel = JSON.parse(read('vercel.json'));
const clientContextSource = read('api/client-context-fn/index.js');
const clientContextHandler = require('../../api/client-context-fn/index.js');
const clientContext = clientContextHandler._test;

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
  assert.match(core, /payload\.idempotency_key = payload\.idempotency_key \|\| crypto\.randomUUID\(\)/);
  assert.match(core, /create_my_service_request_v1/);
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
  assert.match(js, /_renderC39DecisionPage\(_state\.requests \|\| \[\]\)/);
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

test('cachebusters point at the certified Client OS assets', () => {
  assert.match(html, /fixeo-dashboard-v2\.css\?v=client-os-header-master/);
  assert.match(html, /fixeo-dashboard-v2\.js\?v=client-os-c4-final/);
  assert.match(css, /CLIENT OS C4/);
  assert.match(css, /Header Optical Master/);
});


function apiRes(){
  return {
    code:null,body:null,headers:{},
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    status(v){this.code=v;return this;},
    json(v){this.body=v;return this;}
  };
}
function fetchResponse(status,data){
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)};
}

test('client context handler enforces canonical client role and returns evidence-backed decision', async () => {
  const oldEnv={...process.env}, oldFetch=global.fetch;
  process.env.SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';
  process.env.SUPABASE_ANON_KEY='sb_publishable_testkey';
  delete process.env.FIXEO_STAGING_PROJECT_REF;
  delete process.env.VERCEL_ENV;
  const uid='11111111-1111-1111-1111-111111111111';
  global.fetch=async url=>{
    const u=String(url);
    if(u.endsWith('/auth/v1/user')) return fetchResponse(200,{id:uid});
    if(u.includes('/rest/v1/users?')) return fetchResponse(200,[{role:'client'}]);
    if(u.includes('/rest/v1/service_requests?')) return fetchResponse(200,[{id:'22222222-2222-2222-2222-222222222222',service_category:'plomberie',city:'Fès',status:'completed',created_at:'2026-09-30T10:00:00Z',updated_at:'2026-09-30T11:00:00Z'}]);
    if(u.includes('/rest/v1/missions?')) return fetchResponse(200,[]);
    if(u.includes('/rest/v1/notifications?')) return fetchResponse(200,[]);
    if(u.includes('/rest/v1/quotes?')) return fetchResponse(200,[]);
    throw new Error('unexpected fetch '+u);
  };
  try{
    const res=apiRes();
    await clientContextHandler({
      method:'POST',
      headers:{authorization:'Bearer '+('a'.repeat(32)),origin:'https://www.fixeo.ma','sec-fetch-site':'same-origin'},
      body:{}
    },res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,true);
    assert.equal(res.body.source,'client_context_v1');
    assert.equal(res.body.decision.kind,'confirm_completed');
    assert.equal(res.body.evidence.active_requests,1);
  }finally{
    global.fetch=oldFetch;
    for(const k of Object.keys(process.env)) if(!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env,oldEnv);
  }
});

test('client context handler fails closed for a non-client canonical role', async () => {
  const oldEnv={...process.env}, oldFetch=global.fetch;
  process.env.SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';
  process.env.SUPABASE_ANON_KEY='sb_publishable_testkey';
  delete process.env.FIXEO_STAGING_PROJECT_REF;
  delete process.env.VERCEL_ENV;
  const uid='11111111-1111-1111-1111-111111111111';
  global.fetch=async url=>{
    const u=String(url);
    if(u.endsWith('/auth/v1/user')) return fetchResponse(200,{id:uid});
    if(u.includes('/rest/v1/users?')) return fetchResponse(200,[{role:'artisan'}]);
    throw new Error('unexpected fetch '+u);
  };
  try{
    const res=apiRes();
    await clientContextHandler({
      method:'POST',
      headers:{authorization:'Bearer '+('a'.repeat(32)),origin:'https://www.fixeo.ma','sec-fetch-site':'same-origin'},
      body:{}
    },res);
    assert.equal(res.code,403);
    assert.equal(res.body.error,'CLIENT_ROLE_REQUIRED');
  }finally{
    global.fetch=oldFetch;
    for(const k of Object.keys(process.env)) if(!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env,oldEnv);
  }
});


test('client context selects only columns present in the production contract', () => {
  assert.equal(clientContextSource.includes('created_at,updated_at'), false);
  assert.match(clientContextSource, /service_requests\?client_profile_id=eq\./);
  assert.match(clientContextSource, /missions\?client_profile_id=eq\./);
  assert.match(clientContextSource, /quotes\?request_id=in\./);
});
