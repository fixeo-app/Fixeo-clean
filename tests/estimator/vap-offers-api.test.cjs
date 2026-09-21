const {test}=require('node:test'),assert=require('node:assert/strict');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const {sealToken}=require('../../api/estimator-v1/fixeo-estimator-token-v1');
const {resolveAuthoritativeBookingPricing}=require('../../api/fixeo-booking-authority-v1');
const session={service_code:'plomberie.test',entry_context:{city_slug:'rabat'},known_inputs:{accessible:true},outcome:{outcome_type:'PRICE_READY'}};
const entries=[{approved:true,service_code:'plomberie.test',city_slug:'rabat',outcome_type:'PRICE_READY',inputs:{accessible:true},vap_minor:30001,materials_minor:0,catalogue_version:'test-only'}];
function context(){return {service_code:'plomberie.test',city_slug:'rabat',session_id:'s',context_id:'fxctx-'+'a'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000,amount_mad:300};}
test('Migrated plumbing fails closed without a calibrated entry',async()=>{
 const p=context();await assert.rejects(attachOffer(session,p,{entries:[],fetchImpl:()=>{throw Error('unexpected')}}),/not eligible/);assert.equal(p.amount_mad,300);
 assert.equal(selectTariff({...session,known_inputs:{accessible:false}},entries),null);
 assert.equal(selectTariff({...session,entry_context:{city_slug:'fes'}},entries),null);
});
test('Persist offer before issuing signed context; preserve centimes and fail closed',async()=>{
 const p=context();let row;
 await attachOffer(session,p,{entries,env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(url,opts)=>{row=JSON.parse(opts.body);return {ok:true}}});
 assert.equal(row.client_total_minor,36001);assert.equal(p.amount_mad,360.01);assert.equal(p.offer_id,row.id);
 assert.equal(validateFinancialContext(p).commissionMinor,6000);
 assert.throws(()=>validateFinancialContext({...p,amount_mad:360}));
 assert.throws(()=>validateFinancialContext({...p,pricing_version:'unknown'}));
 const secret='test-only-secret';
 assert.throws(()=>resolveAuthoritativeBookingPricing({estimatorContextToken:sealToken(p,secret),browserTotalAmount:1,secret}),e=>e.code==='VAP_CONFIRMATION_REQUIRED');
 await assert.rejects(attachOffer(session,context(),{entries,env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async()=>({ok:false})}));
});
