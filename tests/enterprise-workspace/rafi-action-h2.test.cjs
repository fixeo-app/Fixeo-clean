const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const actions=require('../../js/fixeo-enterprise-rafi-actions.js');
const root=path.join(__dirname,'../..');
const eid='00000000-0000-4000-8000-000000000101',sid='00000000-0000-4000-8000-000000000301',rid='00000000-0000-4000-8000-000000000701',wid='00000000-0000-4000-8000-000000000805',cid='00000000-0000-4000-8000-000000000901';
function client(result={ok:true}){const calls=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});return{data:result,error:null};}};}
function p(type,target={},params={}){return{proposal_version:'h1',type,requires_confirmation:true,executable:false,target,params};}

test('H2-01 governed request routes only through governance intake',async()=>{const c=client({ok:true,governance_status:'pending_approval'});await actions.execute(c,eid,p('create_governed_request',{site_id:sid},{service_category:'plomberie',description:'Fuite',urgency:'urgent',requested_amount:1200}));assert.equal(c.calls[0].name,'submit_enterprise_governed_request_v1');});
test('H2-02 assignment and hybrid retry use canonical RPCs',async()=>{const c=client();await actions.execute(c,eid,p('propose_internal_assignment',{request_id:rid,worker_id:wid}));await actions.execute(c,eid,p('propose_hybrid_dispatch',{request_id:rid}));assert.deepEqual(c.calls.map(x=>x.name),['assign_enterprise_internal_worker_v1','retry_enterprise_hybrid_dispatch_v1']);});
test('H2-03 approval decision cannot bypass governance RPC',async()=>{const c=client();await actions.execute(c,eid,p('decide_approval',{case_id:cid},{decision:'approved',note:'Validé'}));assert.equal(c.calls[0].name,'decide_enterprise_approval_case_v1');await assert.rejects(()=>actions.execute(c,eid,p('decide_approval',{case_id:cid},{decision:'force'})),/INVALID_DECISION/);});
test('H2-04 control tower and maintenance use existing guarded RPCs',async()=>{const c=client();await actions.execute(c,eid,p('upsert_control_tower_escalation',{request_id:rid},{priority:'critical',status:'open',note:'SLA'}));await actions.execute(c,eid,p('prepare_maintenance_action',{site_id:sid},{name:'Clim',service_category:'climatisation',frequency:'monthly',interval_count:1,next_due_at:'2026-10-01T08:00:00Z',reminder_hours:24,status:'active'}));assert.deepEqual(c.calls.map(x=>x.name),['upsert_enterprise_control_tower_escalation_v1','upsert_enterprise_maintenance_plan_v1']);});
test('H2-05 malformed or unconfirmed proposals are rejected before RPC',async()=>{const c=client();await assert.rejects(()=>actions.execute(c,eid,{...p('propose_hybrid_dispatch',{request_id:rid}),requires_confirmation:false}),/INVALID_PROPOSAL/);await assert.rejects(()=>actions.execute(c,eid,p('unknown',{})),/ACTION_NOT_ALLOWED/);assert.equal(c.calls.length,0);});
test('H2-06 UI requires explicit human confirmation',()=>{const code=fs.readFileSync(path.join(root,'js/fixeo-enterprise-rafi-ui.js'),'utf8');assert.match(code,/win\.confirm/);assert.match(code,/Confirmer l’exécution/);assert.match(code,/data-rafi-action/);});
test('H2-07 browser action router has no service role or direct table mutation',()=>{const code=fs.readFileSync(path.join(root,'js/fixeo-enterprise-rafi-actions.js'),'utf8');assert.doesNotMatch(code,/service_role|SUPABASE_SERVICE_ROLE_KEY|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);});
