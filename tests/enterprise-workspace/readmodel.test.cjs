const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../../js/fixeo-enterprise-readmodel.js');

const eid='00000000-0000-4000-8000-000000000101';
const sid='00000000-0000-4000-8000-000000000301';
const rid='00000000-0000-4000-8000-000000000401';
const mid='00000000-0000-4000-8000-000000000501';

function fake(data, failTable){
  const calls=[];
  const client={schema(name){
    assert.equal(name,'public');
    return {from(table){
      const call={table,filters:[],orders:[]}; calls.push(call);
      const q={
        select(columns){call.columns=columns; return q;},
        eq(column,value){call.filters.push({kind:'eq',column,value}); return q;},
        in(column,value){call.filters.push({kind:'in',column,value}); return q;},
        order(column,options){call.orders.push({column,options}); return q;},
        range(from,to){call.range=[from,to]; return q;},
        then(resolve,reject){
          return Promise.resolve().then(()=>{
            if(table===failTable) return {data:null,error:{message:'fail'}};
            let rows=(data[table]||[]).filter(row=>call.filters.every(f=>f.kind==='eq'?row[f.column]===f.value:f.value.includes(row[f.column])));
            if(call.orders.length){
              for(const o of [...call.orders].reverse()) rows.sort((a,b)=>String(a[o.column]||'').localeCompare(String(b[o.column]||'')));
            }
            if(call.range) rows=rows.slice(call.range[0],call.range[1]+1);
            return {data:rows,error:null};
          }).then(resolve,reject);
        }
      };
      return q;
    }};
  }};
  return {client,calls};
}

test('B1 read model maps tenant sites, requests and latest mission without sensitive fields',async()=>{
  const f=fake({
    enterprise_sites:[{id:sid,enterprise_id:eid,name:'Siège',site_code:'CAS-01',address_line:'Centre',city:'Casablanca',status:'active'}],
    enterprise_request_context:[{id:'00000000-0000-4000-8000-000000000601',enterprise_id:eid,site_id:sid,service_request_id:rid,created_at:'2026-09-24T09:00:00Z'}],
    service_requests:[{id:rid,service_category:'plomberie',city:'Casablanca',status:'pending',created_at:'2026-09-24T10:00:00Z',urgency:'urgent',client_phone:'SECRET',guest_token_hash:'SECRET'}],
    missions:[
      {id:mid,request_id:rid,status:'pending',created_at:'2026-09-24T10:10:00Z',accepted_at:null},
      {id:'00000000-0000-4000-8000-000000000502',request_id:rid,status:'accepted',created_at:'2026-09-24T10:20:00Z',accepted_at:'2026-09-24T10:21:00Z'}
    ],
    enterprise_request_sla:[{id:'00000000-0000-4000-8000-000000000701',service_request_id:rid,enterprise_id:eid,site_id:sid,
      policy_id:null,policy_urgency:'high',request_urgency:'urgent',acceptance_target_minutes:30,
      started_at:'2026-09-24T10:00:00Z',at_risk_at:'2026-09-24T10:22:30Z',due_at:'2026-09-24T10:30:00Z'}],
    enterprise_members:[{id:'00000000-0000-4000-8000-000000000801',enterprise_id:eid,
      user_id:'00000000-0000-4000-8000-000000000901',role:'site_manager',status:'active'}],
    enterprise_member_sites:[{id:'00000000-0000-4000-8000-000000000802',enterprise_id:eid,
      member_id:'00000000-0000-4000-8000-000000000801',site_id:sid}],
    enterprise_invitations:[{id:'00000000-0000-4000-8000-000000000803',enterprise_id:eid,
      email_normalized:'invite@example.com',role:'viewer',target_user_id:null,status:'pending',
      expires_at:'2026-10-01T10:00:00Z',created_at:'2026-09-24T10:00:00Z',token_hash:'SECRET'}],
    enterprise_sla_policies:[{id:'00000000-0000-4000-8000-000000000804',enterprise_id:eid,
      site_id:null,urgency:'normal',acceptance_target_minutes:90,status:'active',
      created_at:'2026-09-24T10:00:00Z',updated_at:'2026-09-24T10:00:00Z'}]
  });
  const out=await model.load(f.client,eid);
  assert.equal(out.sites.length,1);
  assert.equal(out.interventions.length,1);
  assert.equal(out.interventions[0].site_name,'Siège');
  assert.equal(out.interventions[0].mission_status,'accepted');
  assert.equal(out.interventions[0].sla.acceptance_target_minutes,30);
  assert.equal(out.interventions[0].sla.policy_source,'fixeo_default');
  assert.equal(out.members.length,1);
  assert.equal(out.members[0].role,'site_manager');
  assert.deepEqual(out.members[0].site_ids,[sid]);
  assert.equal(out.invitations.length,1);
  assert.equal(out.invitations[0].email,'invite@example.com');
  assert.equal(Object.hasOwn(out.invitations[0],'token_hash'),false);
  const invitationCall=f.calls.find(c=>c.table==='enterprise_invitations');
  assert.equal(invitationCall.columns.includes('token_hash'),false);
  assert.equal(out.sla_policies.length,1);
  assert.equal(out.sla_policies[0].urgency,'normal');
  assert.equal(out.sla_policies[0].acceptance_target_minutes,90);
  const requestCall=f.calls.find(c=>c.table==='service_requests');
  assert.equal(requestCall.columns.includes('client_phone'),false);
  assert.equal(requestCall.columns.includes('guest_token_hash'),false);
  assert.equal(Object.hasOwn(out.interventions[0],'client_phone'),false);
});

test('B1 empty tenant returns empty arrays without request or mission reads',async()=>{
  const f=fake({enterprise_sites:[],enterprise_request_context:[]});
  const out=await model.load(f.client,eid);
  assert.deepEqual(out.sites,[]);
  assert.deepEqual(out.interventions,[]);
  assert.equal(f.calls.some(c=>c.table==='service_requests'),false);
  assert.equal(f.calls.some(c=>c.table==='missions'),false);
  assert.equal(f.calls.some(c=>c.table==='enterprise_request_sla'),false);
});

test('B1 applies enterprise_id filter to site and context reads',async()=>{
  const f=fake({enterprise_sites:[],enterprise_request_context:[]});
  await model.load(f.client,eid);
  for(const name of ['enterprise_sites','enterprise_request_context']){
    const call=f.calls.find(c=>c.table===name);
    assert.ok(call.filters.some(x=>x.kind==='eq'&&x.column==='enterprise_id'&&x.value===eid));
  }
});

test('B1 rejects malformed enterprise identifiers before any DB call',async()=>{
  const f=fake({});
  await assert.rejects(()=>model.load(f.client,'bad-id'),/INVALID_ENTERPRISE_ID/);
  assert.equal(f.calls.length,0);
});

test('B1 fails closed on any table read error',async()=>{
  const f=fake({enterprise_sites:[],enterprise_request_context:[]},'enterprise_sites');
  await assert.rejects(()=>model.load(f.client,eid),/READ_FAILED/);
});

test('B1 source contains no mutation methods or service role authority',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-readmodel.js'),'utf8');
  assert.doesNotMatch(code,/\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.doesNotMatch(code,/service_role|client_phone|guest_token_hash|client_profile_id/);
});
