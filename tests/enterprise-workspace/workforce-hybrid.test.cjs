const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const actions=require('../../js/fixeo-enterprise-workforce-actions.js');
const ui=require('../../js/fixeo-enterprise-workforce-ui.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101';
const mid='00000000-0000-4000-8000-000000000801';
const wid='00000000-0000-4000-8000-000000000805';
const sid='00000000-0000-4000-8000-000000000301';
const rid='00000000-0000-4000-8000-000000000401';

function client(result={ok:true}){const calls=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};}

test('A01 workforce authority separates management and operations',()=>{
  assert.equal(actions.canManage('owner'),true);assert.equal(actions.canManage('admin'),true);
  assert.equal(actions.canManage('operations_manager'),false);
  assert.equal(actions.canOperate('operations_manager'),true);
  assert.equal(actions.canOperate('viewer'),false);
});

test('A02 worker, skills, sites and policy mutations use RPCs only',async()=>{
  const c=client({ok:true,worker_id:wid,policy_id:'00000000-0000-4000-8000-000000000808'});
  await actions.createWorker(c,eid,{member_id:mid,display_label:'Ahmed',max_concurrent_jobs:2});
  await actions.replaceSkills(c,eid,wid,[{service_category:'plomberie',skill_level:5}]);
  await actions.replaceSites(c,eid,wid,[sid]);
  await actions.upsertPolicy(c,eid,{mode:'internal_first',internal_offer_limit:3,offer_ttl_minutes:15,fallback_after_minutes:10,status:'active'});
  assert.deepEqual(c.calls.map(x=>x.name),[
    'create_enterprise_workforce_worker','replace_enterprise_workforce_skills',
    'replace_enterprise_workforce_sites','upsert_enterprise_dispatch_policy'
  ]);
});

test('A03 internal offer and assignment lifecycle use canonical RPCs',async()=>{
  const c=client();
  await actions.acceptOffer(c,rid);await actions.declineOffer(c,rid);
  await actions.setAssignmentStatus(c,eid,rid,'in_progress');
  await actions.retryDispatch(c,eid,rid);await actions.assignWorker(c,eid,rid,wid);
  assert.deepEqual(c.calls.map(x=>x.name),[
    'accept_my_enterprise_workforce_offer_v1','decline_my_enterprise_workforce_offer_v1',
    'set_enterprise_internal_assignment_status_v1','retry_enterprise_hybrid_dispatch_v1',
    'assign_enterprise_internal_worker_v1'
  ]);
});

test('A04 source has no browser table mutations or service role authority',()=>{
  const code=fs.readFileSync(path.join(root,'js/fixeo-enterprise-workforce-actions.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
});

test('A05 workforce UI renders manager registry, policy and own offer safely',()=>{
  const html=fs.readFileSync(path.join(root,'dashboard-enterprise.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://fixture.invalid/dashboard-enterprise.html'});
  const w=dom.window;
  w.FixeoEnterpriseWorkforceActions={canManage:r=>r==='owner',canOperate:r=>['owner','operations_manager'].includes(r)};
  const app=ui.mount(w,{getClient:()=>({}),getEnterpriseId:()=>eid,getRole:()=> 'owner',refresh:async()=>{}});
  app.render({
    sites:[{id:sid,name:'Siège',city:'Casablanca'}],
    members:[{id:mid,user_id:'00000000-0000-4000-8000-000000000901',status:'active'}],
    interventions:[{id:rid,service_category:'plomberie',site_name:'Siège',city:'Casablanca',request_status:'new',
      hybrid_dispatch:{mode:'internal_first',status:'internal_offered'},internal_assignment:null}],
    workforce:{
      my_worker_id:wid,
      workers:[{id:wid,member_id:mid,display_label:'<b>Ahmed</b>',employee_code:'M01',status:'active',availability:'available',
        all_sites:false,max_concurrent_jobs:2,skills:[{service_category:'plomberie',skill_level:5}],site_ids:[sid]}],
      dispatch_policies:[{id:'00000000-0000-4000-8000-000000000808',site_id:sid,service_category:'plomberie',mode:'internal_first',
        internal_offer_limit:3,offer_ttl_minutes:15,fallback_after_minutes:10,status:'active'}],
      offers:[{id:'00000000-0000-4000-8000-000000000809',service_request_id:rid,worker_id:wid,status:'offered',
        expires_at:'2099-09-24T10:15:00Z'}],
      assignments:[],dispatch_states:[]
    }
  });
  assert.match(w.document.getElementById('enterprise-workforce-list').textContent,/<b>Ahmed<\/b>/);
  assert.equal(w.document.getElementById('enterprise-workforce-list').querySelector('b b'),null);
  assert.equal(w.document.getElementById('enterprise-workforce-create').hidden,false);
  assert.match(w.document.getElementById('enterprise-dispatch-policy-list').textContent,/Interne puis externe/);
  assert.equal(w.document.getElementById('enterprise-my-workforce-module').hidden,false);
  assert.ok(w.document.querySelector('[data-wf-action="accept-offer"]'));
  app.destroy();dom.window.close();
});

test('A06 existing cron invokes Enterprise fallback service RPC without adding browser surface',()=>{
  const code=fs.readFileSync(path.join(root,'api/notification-timeout-fn/index.js'),'utf8');
  assert.match(code,/run_enterprise_dispatch_fallbacks_v1/);
  assert.match(code,/CRON_SECRET/);
  assert.doesNotMatch(code,/req\.query\.[A-Za-z]|req\.body\.[A-Za-z]/);
});