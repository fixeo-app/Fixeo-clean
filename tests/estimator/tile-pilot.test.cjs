const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const entries=require('../../data/pricing/canonical/vap-approved-v1.json').entries.filter(x=>x.service_code.startsWith('carrelage.'));
const common={tile_support:'TILE_SUPPORT_READY',tile_format:'TILE_STANDARD',tile_supplies:'TILE_CLIENT_SUPPLIED',tile_access:'TILE_ACCESS_READY',tile_finish:'TILE_STANDARD_FINISH'};
function evaluate(code,inputs,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:city,known_inputs:inputs}).session);}
const replacement={...common,tile_work:'TILE_REPLACE_ONLY',tile_count:4};
const installation={...common,tile_work:'TILE_INSTALL_ONLY',tile_area_m2:20};
test('both carrelage packages produce matching engine and stored VAP prices across 20 cities',async()=>{
 assert.equal(entries.length,40);assert.equal(new Set(entries.map(x=>x.city_slug)).size,20);
 for(const t of entries){const replace=t.service_code.includes('remplacement');
  for(const quantity of (replace?[1,4]:[10,10.01,20,20.25,30])){
   const inputs={...(replace?replacement:installation),[replace?'tile_count':'tile_area_m2']:quantity};
   const e=evaluate(t.service_code,inputs,t.city_slug);assert.equal(e.ok,true);assert.equal(e.session.outcome.outcome_type,'PRICE_READY');
   const p={service_code:t.service_code,city_slug:t.city_slug,session_id:e.session.session_id,context_id:'fxctx-'+'b'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};
   let saved;await attachOffer(e.session,p,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true}}});
   const vap=replace?30000:Math.round(quantity*5000),commission=Math.max(6000,Math.round(vap*0.15));
   assert.equal(p.amount_mad,(vap+commission)/100);assert.equal(e.session.outcome.price.amount_mad,p.amount_mad);assert.equal(saved.vap_minor,vap);assert.equal(saved.commission_minor,commission);validateFinancialContext(p);
   assert.ok(e.session.outcome.exclusions_summary.some(x=>x.includes('colle et joints')));
  }
 }
});
test('missing answers, extra work and incomplete supplies never get a fixed price',()=>{
 for(const [code,inputs] of [['carrelage.remplacement_local',replacement],['carrelage.pose_sol_droite',installation]]){
  for(const key of Object.keys(inputs)){
   const missing={...inputs};delete missing[key];assert.equal(evaluate(code,missing).ok,false,key);
   const bad=evaluate(code,{...inputs,[key]:'UNKNOWN'});assert.notEqual(bad.session?.outcome?.outcome_type,'PRICE_READY',key);
  }
  for(const key of Object.keys(common))assert.equal(evaluate(code,{...inputs,[key]:key==='tile_supplies'?'TILE_SUPPLIES_MISSING':'TILE_COMPLEX'}).session.outcome.outcome_type,'QUOTE_REQUIRED');
 }
});
test('out-of-range and malformed quantities cannot be priced or matched to a tariff',()=>{
 for(const [code,inputs,key,values] of [['carrelage.remplacement_local',replacement,'tile_count',[0,-1,1.5,5,'4',NaN,Infinity]],['carrelage.pose_sol_droite',installation,'tile_area_m2',[0,-1,9.99,30.01,20.001,'20',NaN,Infinity]]]){
  for(const q of values){const e=evaluate(code,{...inputs,[key]:q});assert.notEqual(e.session?.outcome?.outcome_type,'PRICE_READY',String(q));
   assert.equal(selectTariff({service_code:code,entry_context:{city_slug:'rabat'},outcome:{outcome_type:'PRICE_READY'},known_inputs:{...inputs,[key]:q}}),null);}
 }
});
test('unapproved city cannot use unversioned tile pricing',async()=>{
 const e=evaluate('carrelage.remplacement_local',replacement,'unsupported');
 await assert.rejects(attachOffer(e.session,{}),/city not eligible/);
});
