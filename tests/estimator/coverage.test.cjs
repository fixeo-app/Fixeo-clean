const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const o=require(root+'/data/pricing/orchestrator/estimator-orchestrator-v1');
const routes=require(root+'/data/pricing/orchestrator/discovery-routing-v1.json').situations;
const resolver=require(root+'/data/pricing/orchestrator/estimator-service-resolver-v1');
const runtime=require(root+'/api/estimator-v1/fixeo-estimator-runtime-v1');
const engine=require(root+'/data/pricing/engine/pricing-engine-core-v1');
const handler=require(root+'/api/estimator-v1/index');
const data=JSON.parse(fs.readFileSync(root+'/js/fixeo-discovery-v1.js','utf8').match(/const DATA=(.*);\n/)[1]);
test('all 62 displayed situations have stable server routes and only relevant selectable candidates',()=>{
 const entries=Object.values(data).flatMap(g=>g.items);assert.equal(entries.length,62);assert.equal(new Set(entries.map(x=>x.id)).size,62);
 for(const item of entries){
  const route=routes[item.id];assert.equal(route.label,item.label);
  const start=o.startEstimator({situation_id:item.id,description:item.label,city:'rabat',metier_hint:'fake'});assert.equal(start.ok,true,item.id);
  const step=o.getNextEstimatorStep(start.session).step;assert.equal(step.type,'SERVICE_SELECTION');
  assert.deepEqual(step.candidate_services.filter(c=>!c.service_code.startsWith('devis.')).map(c=>c.service_code).sort(),[...route.candidate_services].sort());
  for(const c of step.candidate_services){const selected=o.selectService(start.session,c.service_code);assert.equal(selected.ok,true,c.service_code);if(c.service_code.startsWith('devis.')){assert.equal(selected.session.state,'QUOTE_REQUIRED');assert.equal(runtime.shouldIssuePricingContextToken(selected.session),false);assert.equal(selected.session.outcome.price,undefined);}}
 }
});
test('new métiers offer a quote route and never a fabricated tariff',()=>{for(const metier of ['demenagement']){assert.ok(resolver.VALID_METIERS.includes(metier));const s=o.startEstimator({metier_hint:metier}).session;const choices=o.getNextEstimatorStep(s).step.candidate_services;assert.equal(choices.length,1);assert.match(choices[0].service_code,/^devis\./);assert.equal(o.selectService(s,choices[0].service_code).session.state,'QUOTE_REQUIRED');}});
test('unknown situation and non-candidate service cannot bypass server qualification',()=>{
 assert.equal(o.startEstimator({situation_id:'invented'}).ok,false);
 const id=Object.keys(routes).find(k=>routes[k].label==='Monter un meuble');const s=o.startEstimator({situation_id:id,service_hint:'plomberie.fuite_simple'}).session;
 assert.equal(o.selectService(s,'plomberie.fuite_simple').ok,false);assert.equal(o.selectService(s,'devis.other').ok,false);
});
test('grand ménage: exact surface boundaries, missing measurement and villa',()=>{
 for(const [surface,want] of [[59,'QUOTE_REQUIRED'],[60,'PRICE_READY'],[100,'PRICE_READY'],[101,'QUOTE_REQUIRED'],[300,'QUOTE_REQUIRED']]){
  const s=o.startEstimator({service_hint:'nettoyage.grand_menage',known_inputs:{property_type:'APARTMENT',surface_m2:surface}}).session;
  const result=o.evaluateEstimator(s).session.outcome;assert.equal(result.outcome_type,want);if(want==='PRICE_READY'){assert.equal(result.price.amount_mad,600);assert.ok(result.scope_summary.some(x=>x.includes('60 à 100')));}
 }
 const s=o.startEstimator({service_hint:'nettoyage.grand_menage',known_inputs:{property_type:'APARTMENT'}}).session;assert.equal(o.getNextEstimatorStep(s).step.input_id,'surface_m2');assert.equal(o.evaluateEstimator(s).ok,false);
 assert.equal(engine.evaluateFixeoPrice({service_code:'nettoyage.grand_menage',inputs:{property_type:'APARTMENT'}}).ok,false);
 const villa=o.startEstimator({service_hint:'nettoyage.grand_menage',known_inputs:{property_type:'VILLA',surface_m2:80}}).session;assert.notEqual(o.evaluateEstimator(villa).session.outcome.outcome_type,'PRICE_READY');
});
test('plumbing unknown or complex scope does not receive a repair price',()=>{
 for(const code of ['plomberie.fuite_simple','plomberie.debouchage_wc_simple','plomberie.debouchage_evier']){
  const s=o.startEstimator({service_hint:code}).session;assert.equal(o.getNextEstimatorStep(s).step.input_id,'plumbing_scope');
  assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{}}).ok,false);
  for(const scope of ['UNKNOWN','COMPLEX','LOCAL_ACCESSIBLE']){
   const next=o.answerEstimatorQuestion(s,o.getNextEstimatorStep(s).step.question_id,scope);assert.equal(next.ok,true);
   const result=o.evaluateEstimator(next.session).session.outcome;assert.equal(result.outcome_type,scope==='LOCAL_ACCESSIBLE'?'PRICE_READY':'QUOTE_REQUIRED');
   if(scope==='LOCAL_ACCESSIBLE'){assert.ok(result.scope_summary.length);assert.ok(result.exclusions_summary.length);}
  }
 }
});
test('parts and diagnostic boundaries remain explicit, not a total repair price',()=>{
 const mapper=require(root+'/data/pricing/orchestrator/estimator-outcome-mapper-v1');
 for(const code of ['electricite.prise_remplacement','climatisation.diagnostic']){
  const result=engine.evaluateFixeoPrice({service_code:code,inputs:{}});assert.equal(result.ok,true);
  const out=mapper.mapEngineResultToOutcome(result,code,{known_inputs:{}});assert.ok(out.scope_summary.length);assert.ok(out.exclusions_summary.some(x=>/fournir|réparations/.test(x)));
 }
});
async function api(body){let payload,status;const req={method:'POST',headers:{host:'localhost'},body,socket:{remoteAddress:'test'}};const res={setHeader(){},status(n){status=n;return this;},json(p){payload=p;return this;},end(p){if(p)payload=JSON.parse(p);return this;}};await handler(req,res);return {status,body:payload};}
test('encrypted API roundtrip retains situation and exposes quote outcome without pricing authorization',async()=>{
 const old=process.env.FIXEO_ESTIMATOR_SECRET;process.env.FIXEO_ESTIMATOR_SECRET='local-test-secret-only';
 try{
  const id=Object.keys(routes).find(k=>routes[k].label==='Entretien de jardin');
  const start=await api({action:'start',entry_context:{situation_id:id,description:'Mon jardin',city:'rabat'}});assert.equal(start.status,200,JSON.stringify(start));
  const next=await api({action:'select_service',session_token:start.body.session.session_token,service_code:start.body.next_step.candidate_services.find(s=>s.service_code.startsWith("devis.")).service_code});
  assert.equal(next.status,200);assert.equal(next.body.session.outcome.service_label,'Entretien de jardin');assert.equal(next.body.session.outcome.outcome_type,'QUOTE_REQUIRED');assert.equal(next.body.pricing_context_token,undefined);
 }finally{if(old===undefined)delete process.env.FIXEO_ESTIMATOR_SECRET;else process.env.FIXEO_ESTIMATOR_SECRET=old;}
});
