'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../api/control/contracts');
test('A complete but old snapshot is stale and cannot trigger a recommendation',()=>{
 const state=C.sourceState('requests',{status:'healthy',asOf:new Date(Date.now()-120000).toISOString(),completeness:'complete',data:{metrics:{'urgency.active':10}}});
 assert.equal(state.status,'stale');assert.equal(C.metricValue({requests:state},'urgency.active'),null);assert.equal(C.signals({requests:state}).signals.length,0);
});
test('Missing or future provenance is unknown, never a healthy zero',()=>{
 for(const asOf of [null,'not-a-date',new Date(Date.now()+120000).toISOString()])assert.equal(C.sourceState('requests',{status:'healthy',asOf,completeness:'complete',data:{metrics:{'requests.total':0}}}).status,'unknown');
});
