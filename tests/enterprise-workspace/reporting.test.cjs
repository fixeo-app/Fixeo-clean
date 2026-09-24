const test=require('node:test');
const assert=require('node:assert/strict');
const reporting=require('../../js/fixeo-enterprise-reporting.js');

const eid='00000000-0000-4000-8000-000000000101';

function client(results={}){
  const calls=[];
  return {
    calls,
    rpc:async(name,args)=>{
      calls.push({name,args});
      const data=results[name] || {ok:true};
      return {data,error:null};
    }
  };
}

test('B5 period ranges are canonical and deterministic',()=>{
  const now='2026-09-24T12:00:00.000Z';
  const seven=reporting.periodRange('7',now);
  assert.equal(seven.to,now);
  assert.equal(seven.from,'2026-09-17T12:00:00.000Z');
  const all=reporting.periodRange('all',now);
  assert.deepEqual(all,{from:null,to:null});
  assert.throws(()=>reporting.periodRange('365',now),/INVALID_PERIOD/);
});

test('B5 loads only the four canonical read-only reporting RPCs',async()=>{
  const c=client({
    get_enterprise_operational_summary:{ok:true,request_count:3},
    get_enterprise_sla_summary:{ok:true,eligible_count:2},
    get_enterprise_site_summary:{ok:true,sites:[{site_id:'s',site_name:'Siège'}]},
    get_enterprise_request_breakdown:{ok:true,by_service_category:[],by_urgency:[],by_request_status:[]}
  });
  const out=await reporting.load(c,eid,'30','2026-09-24T12:00:00.000Z');
  assert.equal(out.operational.request_count,3);
  assert.equal(out.sla.eligible_count,2);
  assert.equal(out.sites.length,1);
  assert.deepEqual(c.calls.map(x=>x.name),[
    'get_enterprise_operational_summary',
    'get_enterprise_sla_summary',
    'get_enterprise_site_summary',
    'get_enterprise_request_breakdown'
  ]);
  for(const call of c.calls){
    assert.equal(call.args.p_enterprise_id,eid);
    assert.equal(call.args.p_from,'2026-08-25T12:00:00.000Z');
    assert.equal(call.args.p_to,'2026-09-24T12:00:00.000Z');
  }
  assert.equal(c.calls[0].args.p_site_id,null);
  assert.equal(c.calls[3].args.p_site_id,null);
});

test('B5 all-history passes null boundaries without inventing dates',async()=>{
  const c=client({
    get_enterprise_operational_summary:{ok:true},
    get_enterprise_sla_summary:{ok:true},
    get_enterprise_site_summary:{ok:true,sites:[]},
    get_enterprise_request_breakdown:{ok:true,by_service_category:[],by_urgency:[],by_request_status:[]}
  });
  await reporting.load(c,eid,'all');
  for(const call of c.calls){
    assert.equal(call.args.p_from,null);
    assert.equal(call.args.p_to,null);
  }
});

test('B5 rejects malformed enterprise ids and RPC failures',async()=>{
  const c=client();
  await assert.rejects(()=>reporting.load(c,'bad','30'),/INVALID_ENTERPRISE_ID/);
  assert.equal(c.calls.length,0);

  const failing={
    rpc:async()=>({data:{ok:false,reason:'forbidden'},error:null})
  };
  await assert.rejects(reporting.load(failing,eid,'30','2026-09-24T12:00:00.000Z'),e=>e.reason==='forbidden');
});

test('B5 source has no table access, direct mutations or service role authority',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const code=fs.readFileSync(path.join(__dirname,'../../js/fixeo-enterprise-reporting.js'),'utf8');
  assert.doesNotMatch(code,/service_role|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  for(const name of [
    'get_enterprise_operational_summary',
    'get_enterprise_sla_summary',
    'get_enterprise_site_summary',
    'get_enterprise_request_breakdown'
  ]) assert.match(code,new RegExp(name));
});
