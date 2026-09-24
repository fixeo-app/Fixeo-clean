const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const routerPath = path.join(__dirname, '../../js/fixeo-workspace-router.js');
const resolverRequest = './fixeo-auth-resolver.js';
function load(resolveImpl) {
  delete require.cache[require.resolve(routerPath)];
  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === routerPath && request === resolverRequest) return { resolve: resolveImpl };
    return orig.apply(this, arguments);
  };
  try { return require(routerPath); } finally { Module._load = orig; }
}
const eid='00000000-0000-4000-8000-000000000101';

test('client without enterprise preserves legacy destination', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[]}));
  assert.deepEqual(await r.resolvePostLogin({},'client'),{mode:'legacy',destination:'dashboard-client.html',reason:'GLOBAL_ONLY'});
});

test('artisan without enterprise preserves V2 artisan destination', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'artisan',destination:'dashboard-artisan-v2.html'},enterprise_spaces:[]}));
  assert.equal((await r.resolvePostLogin({},'artisan')).destination,'dashboard-artisan-v2.html');
});

test('one active enterprise requires selector instead of implicit tenant choice', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:eid,name:'ACME',role:'owner'}]}));
  assert.deepEqual(await r.resolvePostLogin({},'client'),{mode:'selector',destination:'workspace-select.html',reason:'ENTERPRISE_SPACE_AVAILABLE'});
});

test('multiple enterprise spaces still route only to selector', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'admin',destination:'admin.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:eid,name:'A',role:'owner'},{type:'enterprise',enterprise_id:'00000000-0000-4000-8000-000000000102',name:'B',role:'viewer'}]}));
  assert.equal((await r.resolvePostLogin({},'admin')).destination,'workspace-select.html');
});

test('malformed enterprise data cannot force selector', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:'javascript:alert(1)',name:'X',role:'owner'}]}));
  assert.equal((await r.resolvePostLogin({},'client')).destination,'dashboard-client.html');
});

test('resolver failure never produces enterprise destination and preserves canonical legacy space', async()=>{
  const r=load(async()=>({ok:false,status:'ENTERPRISE_ACCOUNT_READ_ERROR'}));
  const out=await r.resolvePostLogin({},'artisan');
  assert.equal(out.mode,'legacy');
  assert.equal(out.destination,'dashboard-artisan-v2.html');
});

test('resolver exception fails to legacy space, not an enterprise URL', async()=>{
  const r=load(async()=>{throw Error('network');});
  const out=await r.resolvePostLogin({},'admin');
  assert.equal(out.destination,'admin.html');
  assert.equal(out.destination.includes('enterprise'),false);
});


test('unknown enterprise role cannot force selector', async()=>{
  const r=load(async()=>({ok:true,status:'OK',global_space:{type:'client',destination:'dashboard-client.html'},enterprise_spaces:[{type:'enterprise',enterprise_id:eid,name:'ACME',role:'superadmin'}]}));
  assert.equal((await r.resolvePostLogin({},'client')).destination,'dashboard-client.html');
});

test('hung resolver times out to canonical legacy destination', async()=>{
  const r=load(async()=>new Promise(()=>{}));
  const out=await r.resolvePostLogin({},'client',{waitMs:10});
  assert.equal(out.destination,'dashboard-client.html');
  assert.equal(out.reason,'RESOLUTION_TIMEOUT');
});
