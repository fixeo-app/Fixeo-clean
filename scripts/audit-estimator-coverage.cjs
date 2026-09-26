'use strict';
// Read-only audit: runs local orchestration, never calls API or writes requests.
// Usage: node scripts/audit-estimator-coverage.cjs [repository-root]
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const load=p=>require(path.join(root,p));
const discovery=JSON.parse(read('js/fixeo-discovery-v1.js').match(/const DATA=(.*);\n/)[1]);
const registry=load('data/pricing/canonical/canonical-registry.v1.draft.json');
const orchestrator=load('data/pricing/orchestrator/estimator-orchestrator-v1.js');
const planner=load('data/pricing/orchestrator/estimator-question-planner-v1.js');
const resolver=load('data/pricing/orchestrator/estimator-service-resolver-v1.js');
const situations=Object.entries(discovery).flatMap(([universe,group])=>group.items.map(item=>{
 const context={source:'homepage_discovery',description:item.label,city:'rabat',...(item.hint?{metier_hint:item.hint}:{})};
 const result=orchestrator.startEstimator(context);
 const step=result.ok?orchestrator.getNextEstimatorStep(result.session):null;
 return {universe,label:item.label,hint:item.hint,hint_supported:resolver.VALID_METIERS.includes(item.hint),state:result.session?.state||null,error:result.error||null,candidates:step?.step?.candidate_services?.map(s=>s.service_code)||[],service_code:result.session?.service_code||null};
}));
const services=Object.entries(registry.services).map(([code,s])=>{
 const plan=planner.getServiceQuestionPlan(code);
 const start=orchestrator.startEstimator({service_hint:code});
 return {code,metier:s.metier,output:s.price_model.commercial_output_type,questions:plan?.questions.map(q=>q.input_id)||[],plan_present:!!plan,initial_state:start.session?.state||null,production_ready:s.production_ready,transaction_backed:s.provenance?.transaction_backed,scope_confidence:s.confidence?.scope_confidence};
});
const counts=key=>situations.reduce((a,s)=>(a[s[key]]=(a[s[key]]||0)+1,a),{});
const probes={};
for(const [name,code,inputs] of [['wc_without_scope','plomberie.debouchage_wc_simple',{}],['grand_menage_small','nettoyage.grand_menage',{property_type:'APARTMENT',surface_m2:60}],['grand_menage_large','nettoyage.grand_menage',{property_type:'APARTMENT',surface_m2:300}]]){
 const s=orchestrator.startEstimator({service_hint:code,known_inputs:inputs});
 const r=s.ok?orchestrator.evaluateEstimator(s.session):s;
 probes[name]={state:s.session?.state,outcome:r.session?.outcome||r.outcome||null,error:r.error||null};
}
console.log(JSON.stringify({source_commit:'fdcd532a16bffa8f08555def181f21e6c90d7921',scope:'Local server orchestration; no browser classifier, no production HTTP call, no reservation',summary:{situations:situations.length,services:services.length,supported_metiers:resolver.VALID_METIERS,states:counts('state'),unsupported_explicit_hints:situations.filter(s=>s.hint&&!s.hint_supported).length,no_question_services:services.filter(s=>!s.questions.length).length,missing_plans:services.filter(s=>!s.plan_present).length},situations,services,probes},null,2));
