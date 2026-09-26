const test=require('node:test'),assert=require('node:assert/strict'),api=require('../../api/enterprise-rafi.js');

test('J8.16 new request is not treated as in progress or completed',()=>{
  const [x]=api.operationalTruth({control_tower:{attention:[{request_id:'r1',status:'new'}]}});
  assert.equal(x.request_created,true);assert.equal(x.in_progress,false);assert.equal(x.completed,false);
});

test('J8.16 external dispatch trigger does not imply provider contact or acceptance',()=>{
  const [x]=api.operationalTruth({control_tower:{attention:[{request_id:'r1',status:'open',dispatch:{external_started:true}}]}});
  assert.equal(x.dispatch_triggered,true);assert.equal(x.provider_contacted,false);assert.equal(x.accepted_or_assigned,false);assert.equal(x.in_progress,false);
});

test('J8.16 explicit provider contact remains distinct from acceptance',()=>{
  const [x]=api.operationalTruth({control_tower:{attention:[{request_id:'r1',status:'open',dispatch:{external_started:true,provider_contacted:true}}]}});
  assert.equal(x.provider_contacted,true);assert.equal(x.accepted_or_assigned,false);
});

test('J8.16 explicit assignment does not fabricate completion',()=>{
  const [x]=api.operationalTruth({control_tower:{attention:[{request_id:'r1',status:'open',dispatch:{assigned:true}}]}});
  assert.equal(x.accepted_or_assigned,true);assert.equal(x.completed,false);
});

test('J8.16 lifecycle recognizes explicit in progress and completed states only',()=>{
  const [a,b]=api.operationalTruth({control_tower:{attention:[{request_id:'r1',status:'in_progress'},{request_id:'r2',status:'completed'}]}});
  assert.equal(a.in_progress,true);assert.equal(a.completed,false);assert.equal(b.completed,true);
});

test('J8.16 proactive briefing embeds deterministic operational truth',()=>{
  const q=api.proactiveQuestion({control_tower:{summary:{},attention:[{request_id:'r1',status:'new',dispatch:{external_started:true}}],worker_load:[]},operational_changes:[],followups:[]});
  assert.match(q,/Vérité opérationnelle déterministe/);assert.match(q,/"dispatch_triggered":true/);assert.match(q,/"provider_contacted":false/);
});
