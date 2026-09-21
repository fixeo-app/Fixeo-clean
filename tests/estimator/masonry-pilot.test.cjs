const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const entries=require('../../data/pricing/canonical/vap-approved-v1.json').entries.filter(x=>x.service_code.startsWith('maconnerie.'));
const common={masonry_support:'MASONRY_SOUND_DRY',masonry_access:'MASONRY_ACCESSIBLE',masonry_supplies:'MASONRY_CLIENT_SUPPLIED',masonry_finish:'MASONRY_STANDARD_FINISH'};
const cases=[['maconnerie.rebouchage_local','masonry_hole_count','MASONRY_SMALL_HOLES',360,[1,5]],['maconnerie.reprise_enduit','masonry_area_m2','MASONRY_THIN_RENDER',575,[1,2.5,3]]];
function evaluate(code,inputs,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:city,known_inputs:inputs}).session);}
test('two approved masonry packages have matching prices across all 20 cities',async()=>{
 assert.equal(entries.length,40);assert.equal(new Set(entries.map(x=>x.city_slug)).size,20);
 for(const t of entries){const [code,key,scope,total,quantities]=cases.find(x=>x[0]===t.service_code);
  for(const q of quantities){const e=evaluate(code,{...common,masonry_scope:scope,[key]:q},t.city_slug);assert.equal(e.ok,true);assert.equal(e.session.outcome.outcome_type,'PRICE_READY');assert.equal(e.session.outcome.price.amount_mad,total);
   const p={service_code:code,city_slug:t.city_slug,session_id:e.session.session_id,context_id:'fxctx-'+'c'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};
   let saved;await attachOffer(e.session,p,{env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true}}});
   assert.equal(p.amount_mad,total);assert.equal(saved.vap_minor,total===360?30000:50000);assert.equal(saved.commission_minor,total===360?6000:7500);validateFinancialContext(p);
   assert.ok(e.session.outcome.exclusions_summary.some(x=>x.includes('fissures')));
  }
 }
});
test('missing answers, fissures, complex access and absent supplies cannot get a masonry fixed price',()=>{
 for(const [code,key,scope] of cases){const inputs={...common,masonry_scope:scope,[key]:2};
  for(const k of Object.keys(inputs)){const missing={...inputs};delete missing[k];assert.equal(evaluate(code,missing).ok,false,k);assert.notEqual(evaluate(code,{...inputs,[k]:'UNKNOWN'}).session?.outcome?.outcome_type,'PRICE_READY',k);}
  for(const k of [...Object.keys(common),'masonry_scope'])assert.equal(evaluate(code,{...inputs,[k]:k==='masonry_supplies'?'MASONRY_SUPPLIES_MISSING':'MASONRY_COMPLEX'}).session.outcome.outcome_type,'QUOTE_REQUIRED');
 }
});
test('masonry quantities and unapproved cities cannot bypass tariff qualification',async()=>{
 for(const [code,key,scope,total] of cases){const inputs={...common,masonry_scope:scope,[key]:2};
  for(const q of (total===360?[0,-1,1.5,6,'2',NaN,Infinity]:[0,-1,0.99,3.01,2.001,'2',NaN,Infinity])){
   const bad={...inputs,[key]:q};assert.notEqual(evaluate(code,bad).session?.outcome?.outcome_type,'PRICE_READY');
   assert.equal(selectTariff({service_code:code,entry_context:{city_slug:'rabat'},outcome:{outcome_type:'PRICE_READY'},known_inputs:bad}),null);
  }
  await assert.rejects(attachOffer(evaluate(code,inputs,'unsupported').session,{}),/city not eligible/);
 }
});
