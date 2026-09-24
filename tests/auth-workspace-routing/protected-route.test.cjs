const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-auth-guard.js'),'utf8');

function query(data){
  return {
    select(){return this;},
    eq(){return this;},
    async maybeSingle(){return {data,error:null};}
  };
}

async function run(page, role, opts={}){
  const replacements=[];
  const appended=[];
  const user={id:'00000000-0000-4000-8000-000000000001',email:'user@example.com'};
  let sandbox;
  const sb={
    auth:{async getSession(){return {data:{session:{user}}};}},
    from(table){
      if(table==='users') return query({role,full_name:'User',email:user.email,phone:''});
      if(table==='artisans') return query(opts.artisan === false ? null : {id:'a1'});
      throw new Error('unexpected table '+table);
    }
  };
  const head={appendChild(node){
    appended.push(node.src);
    if(opts.workspaceDestination){
      sandbox.window.FixeoWorkspaceEntry={resolveDestination:async()=>opts.workspaceDestination};
      if(node.onload) node.onload();
    } else if(node.onerror) node.onerror();
  }};
  const local=new Map(), session=new Map();
  const store=m=>({setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),getItem:k=>m.get(k)||null});
  sandbox={
    console:{info(){},error(){}},
    Promise,setTimeout,clearTimeout,
    window:null,
    document:{createElement(){return {};},head},
    localStorage:store(local),
    sessionStorage:store(session)
  };
  sandbox.window={
    location:{pathname:'/'+page,replace:v=>replacements.push(v)},
    FixeoSupabaseClient:{async ready(){return {client:sb}},client:sb}
  };
  sandbox.window.window=sandbox.window;
  sandbox.window.document=sandbox.document;
  sandbox.window.localStorage=sandbox.localStorage;
  sandbox.window.sessionStorage=sandbox.sessionStorage;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox);
  await new Promise(r=>setTimeout(r,10));
  return {replacements,appended};
}

test('correct client dashboard remains direct',async()=>{
  const r=await run('dashboard-client.html','client',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,[]);
  assert.deepEqual(r.appended,[]);
});

test('correct admin dashboard remains direct',async()=>{
  const r=await run('admin.html','admin',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,[]);
});

test('wrong global dashboard resolves through workspace entry',async()=>{
  const r=await run('dashboard-client.html','admin',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,['workspace-select.html']);
  assert.equal(r.appended.length,1);
});

test('workspace-entry failure falls back to canonical global dashboard',async()=>{
  const r=await run('dashboard-client.html','admin');
  assert.deepEqual(r.replacements,['admin.html']);
});

test('legacy client V1 for client converges directly to canonical client dashboard',async()=>{
  const r=await run('dashboard-client-v1.html','client',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,['dashboard-client.html']);
  assert.deepEqual(r.appended,[]);
});

test('legacy client V2 for non-client resolves through available workspaces',async()=>{
  const r=await run('dashboard-client-v2.html','admin',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,['workspace-select.html']);
});

test('legacy artisan V1 for artisan always upgrades directly to V2',async()=>{
  const r=await run('dashboard-artisan.html','artisan',{workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,['dashboard-artisan-v2.html']);
  assert.deepEqual(r.appended,[]);
});

test('artisan without owned artisan row still goes to onboarding first',async()=>{
  const r=await run('dashboard-client.html','artisan',{artisan:false,workspaceDestination:'workspace-select.html'});
  assert.deepEqual(r.replacements,['onboarding-artisan.html']);
  assert.deepEqual(r.appended,[]);
});

test('legacy client pages are explicitly protected',()=>{
  assert.match(code,/'dashboard-client-v1\.html'/);
  assert.match(code,/'dashboard-client-v2\.html'/);
});

test('enterprise dashboard remains outside global guard scope',()=>{
  const m=code.match(/var PROTECTED = \[([\s\S]*?)\];/);
  assert.ok(m);
  assert.equal(m[1].includes('dashboard-enterprise.html'),false);
});
