const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const entries=require('../../data/pricing/canonical/vap-approved-v1.json').entries.filter(x=>x.service_code.startsWith('peinture.'));
const code='peinture.mur_interieur.labour_only';
const inputs={active_moisture:false,paint_support:'PAINT_READY',paint_access:'PAINT_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',paint_finish:'PAINT_TWO_COATS',painted_m2:20};
function evaluate(values,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:city,known_inputs:values}).session);}
test('paint: two-coat area and progressive fee match approved amounts in all 20 cities',async()=>{
 assert.equal(entries.length,20);
 for(const t of entries){for(const [area,total,fee] of [[20,690,90],[20.25,698.63,91.13],[40,1380,180],[60,2070,270],[100,3400,400]]){
  const e=evaluate({...inputs,painted_m2:area},t.city_slug);assert.equal(e.ok,true,JSON.stringify(e.error));assert.equal(e.session.outcome.outcome_type,'PRICE_READY');assert.equal(e.session.outcome.price.amount_mad,total);
  const p={service_code:code,city_slug:t.city_slug,session_id:e.session.session_id,context_id:'fxctx-'+'e'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};let saved;
  await attachOffer(e.session,p,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true}}});assert.equal(saved.vap_minor,Math.round(area*3000));assert.equal(saved.commission_minor,Math.round(fee*100));assert.equal(p.amount_mad,total);validateFinancialContext(p);
 }}
});
test('paint: sequential questions preserve exact wall area and client supplies',()=>{
 let s=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
 for(let i=0;i<6;i++){const step=o.getNextEstimatorStep(s).step;assert.ok(step.input_id in inputs,JSON.stringify(step));const a=o.answerEstimatorQuestion(s,step.question_id,inputs[step.input_id]);assert.equal(a.ok,true);s=a.session;}
 assert.equal(o.evaluateEstimator(s).session.outcome.price.amount_mad,690);
});
test('paint: limits, supplies, moisture and unsupported cities cannot receive fixed price',async()=>{
 for(const key of Object.keys(inputs)){const bad={...inputs};delete bad[key];assert.equal(evaluate(bad).ok,false,key);}
 for(const key of ['paint_support','paint_access','paint_supplies','paint_finish'])for(const value of ['PAINT_COMPLEX','UNKNOWN'])assert.equal(evaluate({...inputs,[key]:value}).session.outcome.outcome_type,'QUOTE_REQUIRED');
 for(const q of [19.99,100.01,20.001,0,-1,'40',NaN,Infinity]){const bad={...inputs,painted_m2:q};assert.notEqual(evaluate(bad).session?.outcome?.outcome_type,'PRICE_READY');assert.equal(selectTariff({service_code:code,entry_context:{city_slug:'rabat'},outcome:{outcome_type:'PRICE_READY'},known_inputs:bad}),null);}
 assert.notEqual(evaluate({...inputs,active_moisture:true}).session?.outcome?.outcome_type,'PRICE_READY');
 const floor={...inputs,floor_area_m2:40};delete floor.painted_m2;assert.equal(evaluate(floor).ok,false);
 await assert.rejects(attachOffer(evaluate(inputs,'unsupported').session,{}),/city not eligible/);
});
test('paint: old minimum, supplies, ceiling and preparation codes cannot bypass new scope',()=>{
 for(const c of ['peinture.forfait_minimum','peinture.mur_interieur.all_in','peinture.plafond.labour_only','peinture.mur_interieur.all_in_avec_prep','peinture.preparation_surface']){
  const r=engine.evaluateFixeoPrice({service_code:c,inputs:{active_moisture:false,painted_m2:40,ceiling_m2:40,primary_service_code:code}});assert.equal(r.qualification?.status,'QUOTE_REQUIRED',JSON.stringify(r));
 }
});
