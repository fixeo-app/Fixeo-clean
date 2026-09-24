const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const api=require('../../js/fixeo-enterprise-equipment.js');
const ui=require('../../js/fixeo-enterprise-equipment-ui.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';
const eq='00000000-0000-4000-8000-000000000901';
const rid='00000000-0000-4000-8000-000000000401';
const pid='00000000-0000-4000-8000-000000000902';

function rpcClient(result){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};
}

test('D01 equipment management roles include site manager but not viewer',()=>{
  for(const r of ['owner','admin','operations_manager','site_manager'])assert.equal(api.canManage(r),true);
  for(const r of ['reporter','viewer',''])assert.equal(api.canManage(r),false);
});

test('D02 fleet and detail use secured canonical RPCs',async()=>{
  const c=rpcClient({ok:true,summary:{},equipment:[]});
  await api.loadFleet(c,eid);
  assert.equal(c.calls[0].name,'get_enterprise_equipment_fleet_v1');
  c.rpc=async(name,args)=>{c.calls.push({name,args});return{data:{ok:true,equipment:{},interventions:[],maintenance_plans:[],assets:[]},error:null};};
  await api.loadDetail(c,eid,eq,100);
  assert.equal(c.calls[1].name,'get_enterprise_equipment_detail_v1');
});

test('D03 equipment and relation mutations use RPCs only',async()=>{
  const c=rpcClient({ok:true,equipment_id:eq});
  await api.upsert(c,eid,{site_id:sid,name:'Clim 01',category:'climatisation',criticality:'high',status:'active'});
  await api.setRequestLink(c,eid,eq,rid,true);
  await api.setMaintenanceLink(c,eid,eq,pid,true);
  assert.deepEqual(c.calls.map(x=>x.name),[
    'upsert_enterprise_equipment_v1',
    'set_enterprise_equipment_request_link_v1',
    'set_enterprise_equipment_maintenance_link_v1'
  ]);
});

test('D04 private asset upload registers metadata and signed read uses private bucket',async()=>{
  const calls=[];
  const storage={
    upload:async(path,file,opts)=>{calls.push({kind:'upload',path,opts});return{data:{path},error:null};},
    remove:async(paths)=>{calls.push({kind:'remove',paths});return{data:[],error:null};},
    createSignedUrl:async(path,seconds)=>{calls.push({kind:'signed',path,seconds});return{data:{signedUrl:'https://signed.invalid/x'},error:null};}
  };
  const c={
    storage:{from(bucket){assert.equal(bucket,'enterprise-equipment-private');return storage;}},
    rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});return{data:{ok:true,asset_id:'00000000-0000-4000-8000-000000000999'},error:null};}
  };
  const file={name:'plaque.jpg',type:'image/jpeg',size:2048};
  const out=await api.uploadAsset(c,eid,eq,file,'photo','Plaque');
  assert.ok(out.storage_path.startsWith('enterprise/'+eid+'/equipment/'+eq+'/'));
  assert.equal(calls.some(x=>x.kind==='rpc'&&x.name==='register_enterprise_equipment_asset_v1'),true);
  const url=await api.signedAssetUrl(c,out.storage_path,300);
  assert.equal(url,'https://signed.invalid/x');
});

test('D05 browser source has no direct public-table mutations or service role authority',()=>{
  for(const p of ['js/fixeo-enterprise-equipment.js','js/fixeo-enterprise-equipment-ui.js']){
    const code=fs.readFileSync(path.join(root,p),'utf8');
    assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  }
});

test('D06 UI highlights critical and recurring-failure equipment',async()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterprisePreventiveMaintenance={load:async()=>({ok:true,plans:[]})};
  w.FixeoEnterpriseEquipment={
    canManage:r=>r==='owner',
    loadFleet:async()=>({ok:true,summary:{total:1,active:1,out_of_service:0,critical:1,recurring_failure:1},
      equipment:[{id:eq,site_id:sid,name:'Groupe froid',category:'climatisation',asset_code:'GF-01',
        manufacturer:'X',model:'Y',serial_number:'S',criticality:'critical',status:'active',intervention_count:4,
        open_intervention_count:1,failure_count_90d:4,recurring_failure:true,maintenance_plan_count:1,asset_count:2}]}),
    loadDetail:async()=>({ok:true,equipment:{id:eq,site_id:sid,name:'Groupe froid',category:'climatisation',criticality:'critical',status:'active'},
      interventions:[],maintenance_plans:[],assets:[]})
  };
  const app=ui.mount(w,{getClient:()=>({}),getEnterpriseId:()=>eid,getRole:()=> 'owner'});
  app.setContext({sites:[{id:sid,name:'Siège',city:'Casablanca',status:'active'}],interventions:[]});
  await app.refresh();
  assert.equal(w.document.getElementById('enterprise-equipment-module').hidden,false);
  assert.match(w.document.getElementById('enterprise-equipment-summary').textContent,/1/);
  assert.match(w.document.getElementById('enterprise-equipment-list').textContent,/Panne récurrente détectée/);
  assert.ok(w.document.querySelector('.fxew-equipment-card--critical'));
  app.destroy();dom.window.close();
});

test('D07 SQL creates private bucket, RLS and SELECT-only public tables',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924240000_enterprise_equipment_block_d.sql'),'utf8');
  assert.match(sql,/enterprise-equipment-private/);
  assert.match(sql,/false,\s*10485760/);
  for(const t of ['enterprise_equipment','enterprise_equipment_request_links','enterprise_equipment_maintenance_links','enterprise_equipment_assets']){
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+t+' ENABLE ROW LEVEL SECURITY'));
  }
  assert.match(sql,/GRANT SELECT ON TABLE[\s\S]*enterprise_equipment[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql,/GRANT\s+(INSERT|UPDATE|DELETE)\s+ON TABLE public\.enterprise_equipment/i);
});

test('D08 fleet derives recurring failure from linked real interventions, not copied history',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924240000_enterprise_equipment_block_d.sql'),'utf8');
  assert.match(sql,/failure_count_90d/);
  assert.match(sql,/count\(\*\)>=3/);
  assert.match(sql,/JOIN public\.service_requests sr ON sr\.id=l\.service_request_id/);
  assert.doesNotMatch(sql,/ALTER TABLE public\.service_requests ADD COLUMN equipment/i);
});

test('D09 storage path helper fails closed instead of direct UUID casts in policies',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260924240000_enterprise_equipment_block_d.sql'),'utf8');
  assert.match(sql,/_fixeo_can_access_enterprise_equipment_path/);
  assert.match(sql,/EXCEPTION WHEN invalid_text_representation/);
  assert.doesNotMatch(sql,/\(\(storage\.foldername\(name\)\)\[2\]\)::uuid/);
});
