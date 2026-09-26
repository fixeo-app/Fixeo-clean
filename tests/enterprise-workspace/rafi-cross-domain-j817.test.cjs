const test=require('node:test'),assert=require('node:assert/strict'),api=require('../../api/enterprise-rafi.js');

test('J8.17 correlates SLA pressure with canonical zero workforce capacity',()=>{
 const x=api.crossDomainSignals({control_tower:{summary:{sla_breached:2},worker_load:[]}});
 assert.equal(x[0].signal,'sla_pressure_without_internal_capacity');assert.deepEqual(x[0].domains,['sla','workforce']);assert.equal(x[0].facts.internal_available,0);
});
test('J8.17 does not emit SLA-workforce pressure when eligible capacity exists',()=>{
 const x=api.crossDomainSignals({control_tower:{summary:{sla_breached:2},worker_load:[{worker_id:'w1',status:'active',availability:'available',active_assignments:0,max_concurrent_jobs:1}]}});
 assert.equal(x.some(s=>s.signal==='sla_pressure_without_internal_capacity'),false);
});
test('J8.17 maintenance-equipment signal explicitly avoids causal inference',()=>{
 const x=api.crossDomainSignals({control_tower:{summary:{},worker_load:[]},maintenance:{summary:{due:2}},equipment:{summary:{alerts:1}}});
 const s=x.find(v=>v.signal==='maintenance_and_equipment_risk_overlap');assert.ok(s);assert.match(s.interpretation,/causality is not established/i);
});
test('J8.17 finance and SLA coexistence does not fabricate causality',()=>{
 const x=api.crossDomainSignals({control_tower:{summary:{sla_breached:1},worker_load:[]},finance:{summary:{variance:120}}});
 const s=x.find(v=>v.signal==='sla_and_budget_variance_coexist');assert.ok(s);assert.match(s.interpretation,/no causal relationship/i);
});
test('J8.17 governance and SLA signal remains review-only',()=>{
 const x=api.crossDomainSignals({control_tower:{summary:{sla_breached:1},worker_load:[]},governance:{pending_for_me:2}});
 const s=x.find(v=>v.signal==='pending_governance_with_sla_pressure');assert.ok(s);assert.match(s.interpretation,/without assuming blockage causality/i);
});
test('J8.17 proactive briefing exposes bounded deterministic cross-domain signals',()=>{
 const q=api.proactiveQuestion({control_tower:{summary:{sla_breached:1},attention:[],worker_load:[]},operational_changes:[],followups:[]});
 assert.match(q,/Signaux cross-domain déterministes/);assert.match(q,/sla_pressure_without_internal_capacity/);assert.match(q,/ne fabrique jamais une cause/);
});
