'use strict';
// Runtime cross-universe contract; replaces the pre-Bloc-1 substring/path assertions.
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../../api/control/rafi-decisions');
const now=Date.parse('2026-09-29T12:00:00Z'),as_of=new Date(now).toISOString();
function build(input){return R.build(Object.fromEntries(R.SOURCES.map(source=>[source,R.sourceState(source,{contract_version:'rafi-observations-v1',source,as_of,observations:input[source]||[],total_observations:(input[source]||[]).length,has_more:false},null,now)])),{now});}
const observation=(kind,id,facts,extra={})=>({kind,target_type:'request',target_id:id,count:1,created_at:'2026-09-29T08:00:00Z',reference:'canonical_test_relation',facts,...extra});
test('Enterprise decisions retain tenant and site without tenant write delegation',()=>{
 const result=build({enterprise:[observation('enterprise.request','a',{sla:{acceptance_status:'at_risk'}},{enterprise_id:'tenant-a',site_id:'site-a'}),observation('enterprise.request','b',{sla:{acceptance_status:'at_risk'}},{enterprise_id:'tenant-b',site_id:'site-b'})]});
 assert.equal(result.decisions.length,2);for(const d of result.decisions){const suffix=d.target_id;assert.equal(d.recommended_action.context.enterprise_id,'tenant-'+suffix);assert.equal(d.recommended_action.context.site_id,'site-'+suffix);assert.equal(d.actionability.capability,null);}
});
test('Marketplace and Finance keep separate targets and canonical authorities',()=>{
 const result=build({operations:[observation('quote.review','quote',{quote_version:3},{target_type:'quote'})],finance:[observation('finance.price_missing','mission',{status:'done'},{target_type:'mission'})]});
 assert.equal(result.decisions.length,2);const quote=result.decisions.find(d=>d.target_id==='quote'),finance=result.decisions.find(d=>d.target_id==='mission');assert.equal(quote.actionability.capability,'quote.approve');assert.equal(finance.actionability.capability,'mission.settle');assert.equal(quote.authority,'Quotes');assert.equal(finance.authority,'Finance + Pricing');
});
test('An internal offer is an opportunity, not a promised worker allocation',()=>{
 const result=build({enterprise:[observation('enterprise.request','request',{mode:'internal_first',valid_internal_offers:2,status:'internal_offered',fallback_due_at:'2026-09-29T11:00:00Z'})]});
 assert.ok(result.decisions.some(d=>d.decision_type==='enterprise.fallback'));assert.ok(result.decisions.some(d=>d.decision_type==='enterprise.internal_capacity'));assert.ok(result.decisions.every(d=>d.actionability.execution_authorized===false));
});
