const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const rafi=require('../../js/fixeo-enterprise-rafi.js');
const rafiUi=require('../../js/fixeo-enterprise-rafi-ui.js');
const backend=require('../../api/enterprise-rafi.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';

test('G01 RAFI client sends user bearer token and tenant id, never service role',async()=>{
  const oldFetch=global.fetch;
  const calls=[];
  global.fetch=async(url,opt)=>{calls.push({url,opt});return{ok:true,json:async()=>({ok:true,answer:'A',highlights:[],alerts:[],recommendations:[],image_observations:[],confidence:'high'})};};
  try{
    const client={auth:{getSession:async()=>({data:{session:{access_token:'a'.repeat(40)}}})}};
    const out=await rafi.ask(client,eid,'Quels sites sont à risque ?',[],null);
    assert.equal(out.answer,'A');
    assert.equal(calls[0].url,'/api/enterprise-rafi');
    assert.equal(calls[0].opt.headers.Authorization,'Bearer '+'a'.repeat(40));
    assert.match(calls[0].opt.body,new RegExp(eid));
    assert.doesNotMatch(JSON.stringify(calls),/service_role/);
  }finally{global.fetch=oldFetch;}
});

test('G02 RAFI backend context calls read-only Enterprise RPCs only and bounds arrays',async()=>{
  const called=[];
  const huge=Array.from({length:180},(_,i)=>({id:i}));
  const supa={rpc:async(name,args)=>{called.push(name);
    if(name==='get_enterprise_control_tower_v1')return{summary:{open_requests:1},attention:huge,site_load:huge,worker_load:huge};
    if(name==='get_enterprise_preventive_maintenance_v1')return{summary:{},plans:huge,runs:huge};
    if(name==='get_enterprise_equipment_fleet_v1')return{summary:{},equipment:huge};
    if(name==='get_enterprise_finance_v1')return{summary:{},rows:huge,cost_centers:huge,budgets:huge,purchase_orders:huge,worker_rates:huge};
    if(name==='get_enterprise_governance_v1')return{role:'admin',pending_for_me:1,policies:huge,cases:huge};
    throw new Error(name);
  }};
  const ctx=await backend.enterpriseContext(supa,eid);
  assert.deepEqual(called.sort(),[
    'get_enterprise_control_tower_v1','get_enterprise_equipment_fleet_v1','get_enterprise_finance_v1',
    'get_enterprise_governance_v1','get_enterprise_preventive_maintenance_v1'
  ].sort());
  assert.ok(ctx.control_tower.attention.length<=60);
  assert.ok(ctx.equipment.equipment.length<=100);
  assert.ok(Buffer.byteLength(JSON.stringify(ctx))<230000);
});

test('G03 RAFI backend contains no Enterprise mutator RPC calls or service role bypass',()=>{
  const code=fs.readFileSync(path.join(root,'api/enterprise-rafi.js'),'utf8');
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|service_role/);
  assert.doesNotMatch(code,/rpc\(['"](?:upsert|set_|create_|submit_|decide_|dispatch_|assign_|retry_|accept_|decline_)/);
  assert.match(code,/get_enterprise_control_tower_v1/);
  assert.match(code,/get_enterprise_finance_v1/);
  assert.match(code,/Authorization:'Bearer '\+token/);
});

test('G04 image is ephemeral: no storage upload/persistence in RAFI backend',()=>{
  const code=fs.readFileSync(path.join(root,'api/enterprise-rafi.js'),'utf8');
  assert.match(code,/input_image/);
  assert.doesNotMatch(code,/storage\/v1|storage\.objects|uploadTicket|insert into|enterprise_rafi_media/i);
  assert.equal(backend.MAX_IMAGE_BYTES,3*1024*1024);
});

test('G05 shared server and Vercel route expose enterprise RAFI without a new function build',()=>{
  const server=fs.readFileSync(path.join(root,'api/server.js'),'utf8');
  const vercel=fs.readFileSync(path.join(root,'vercel.json'),'utf8');
  assert.match(server,/\/api\/enterprise-rafi/);
  assert.match(server,/enterpriseRafiImageUpload/);
  assert.match(vercel,/"src": "\^\/api\/enterprise-rafi\$"[\s\S]*"dest": "\/api\/server\.js"/);
  const json=JSON.parse(vercel);
  assert.equal(json.builds.some(x=>String(x.src).includes('enterprise-rafi')),false);
});

test('G06 Enterprise RAFI UI exposes Parler and Montrer and renders structured answer',async()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterpriseRafi={
    ask:async()=>({ok:true,answer:'Deux sites sont à risque.',highlights:['Site A'],alerts:['SLA dépassé'],recommendations:['Prioriser A'],image_observations:[],confidence:'high'}),
    transcribe:async()=> 'Quels sites sont à risque ?'
  };
  const app=rafiUi.mount(w,{getClient:()=>({}),getEnterpriseId:()=>eid});
  assert.equal(w.document.getElementById('enterprise-rafi-speak').textContent,'Parler à RAFI');
  assert.equal(w.document.getElementById('enterprise-rafi-show').textContent,'Montrer à RAFI');
  const input=w.document.getElementById('enterprise-rafi-input');
  input.value='Quels sites sont à risque ?';
  w.document.getElementById('enterprise-rafi-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,0));
  assert.match(w.document.getElementById('enterprise-rafi-messages').textContent,/Deux sites sont à risque/);
  assert.match(w.document.getElementById('enterprise-rafi-messages').textContent,/SLA dépassé/);
  app.destroy();dom.window.close();
});

test('G07 RAFI prompt explicitly forbids autonomous mutations and unsafe image claims',()=>{
  const code=fs.readFileSync(path.join(root,'api/enterprise-rafi.js'),'utf8');
  assert.match(code,/You are read-only/);
  assert.match(code,/never claim you dispatched, approved, paid/);
  assert.match(code,/Never certify safety from an image/);
  assert.match(code,/Do not identify people/);
});

test('G08 voice reuses existing server transcription endpoint',()=>{
  const client=fs.readFileSync(path.join(root,'js/fixeo-enterprise-rafi.js'),'utf8');
  const server=fs.readFileSync(path.join(root,'api/server.js'),'utf8');
  assert.match(client,/\/api\/rafi-transcribe/);
  assert.match(server,/gpt-transcribe/);
  assert.match(server,/ar-MA/);
});
