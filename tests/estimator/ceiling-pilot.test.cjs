'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const code='peinture.plafond.labour_only';
const entries=catalogue.entries.filter(x=>x.service_code===code);
const inputs={active_moisture:false,ceiling_support:'CEILING_READY',ceiling_access:'CEILING_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',ceiling_finish:'CEILING_TWO_COATS',ceiling_m2:20};
function evaluate(values,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:city,known_inputs:values}).session);}

test('ceiling: unapproved catalogue entries cannot persist an offer',async()=>{
 assert.equal(entries.length,20);assert.ok(entries.every(x=>x.approval_status==='OWNER_APPROVED'&&x.approved===true));
 const disabled=entries.map(x=>({...x,approved:false}));
 const session=evaluate(inputs).session;assert.equal(selectTariff(session,disabled),null);
 let calls=0;
 await assert.rejects(attachOffer(session,{}, {entries:disabled,fetchImpl:()=>{calls++;throw Error('unexpected network');}}),/not eligible/);
 assert.equal(calls,0);
});

test('ceiling: approved totals, decimals and progressive boundary hold in all 20 cities',async()=>{
 for(const t of entries)for(const [area,vap,fee,total] of [[20,800,120,920],[20.01,800.4,120.06,920.46],[20.25,810,121.5,931.5],[40,1600,240,1840],[50,2000,300,2300],[50.03,2001.2,300.12,2301.32],[60,2400,340,2740],[100,4000,500,4500]]){
  const e=evaluate({...inputs,ceiling_m2:area},t.city_slug);assert.equal(e.ok,true,JSON.stringify(e.error));
  assert.equal(e.session.outcome.outcome_type,'PRICE_READY');assert.equal(e.session.outcome.price.amount_mad,total);
  const p={service_code:code,city_slug:t.city_slug,session_id:e.session.session_id,context_id:'fxctx-'+'c'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};let saved;
  await attachOffer(e.session,p,{entries,env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true};}});
  assert.equal(saved.vap_minor,Math.round(vap*100));assert.equal(saved.commission_minor,Math.round(fee*100));assert.equal(saved.materials_minor,0);assert.equal(saved.client_total_minor,Math.round(total*100));
  assert.equal(saved.scope.inputs.ceiling_m2,area);assert.equal(p.amount_mad,total);validateFinancialContext(p);
 }
});

test('ceiling: guided selection, six questions and summary describe the ceiling alone',()=>{
 let s=o.startEstimator({situation_id:'travaux.repeindre-une-piece',city_slug:'rabat'}).session;
 const choices=o.getNextEstimatorStep(s).step.candidate_services.map(x=>x.service_code);
 assert.ok(choices.includes(code));assert.ok(choices.includes('peinture.mur_interieur.labour_only'));
 s=o.selectService(s,code).session;const seen=[];
 for(let i=0;i<6;i++){const step=o.getNextEstimatorStep(s).step;seen.push(step.input_id);assert.ok(step.input_id in inputs);const a=o.answerEstimatorQuestion(s,step.question_id,inputs[step.input_id]);assert.equal(a.ok,true);s=a.session;}
 assert.deepEqual(seen,['active_moisture','ceiling_support','ceiling_access','paint_supplies','ceiling_finish','ceiling_m2']);
 const outcome=o.evaluateEstimator(s).session.outcome;assert.equal(outcome.price.amount_mad,920);
 assert.match(outcome.scope_summary.join(' '),/plafond plat/);assert.doesNotMatch(outcome.scope_summary.join(' '),/m² de murs/);
 assert.match(outcome.exclusions_summary.join(' '),/murs, moulures/);assert.doesNotMatch(outcome.exclusions_summary.join(' '),/plafonds/);
 assert.equal(outcome.next_action,'CONTINUE_TO_RESERVATION');
});

test('ceiling: unsafe, complex, missing and invalid answers cannot receive an offer',()=>{
 for(const key of Object.keys(inputs)){const bad={...inputs};delete bad[key];assert.equal(evaluate(bad).ok,false,key);assert.equal(selectTariff({...evaluate(inputs).session,known_inputs:bad},entries),null,key);}
 for(const key of ['ceiling_support','ceiling_access','ceiling_finish','paint_supplies'])for(const value of [key==='paint_supplies'?'PAINT_COMPLEX':'CEILING_COMPLEX','UNKNOWN']){
  const e=evaluate({...inputs,[key]:value});assert.equal(e.session.outcome.outcome_type,'QUOTE_REQUIRED');assert.equal(selectTariff(e.session,entries),null);
 }
 for(const q of [19.99,100.01,20.001,0,-1,'40',NaN,Infinity]){
  const bad={...inputs,ceiling_m2:q};assert.notEqual(evaluate(bad).session?.outcome?.outcome_type,'PRICE_READY');assert.equal(selectTariff({...evaluate(inputs).session,known_inputs:bad},entries),null);
 }
 assert.equal(evaluate({...inputs,active_moisture:true}).session.outcome.outcome_type,'SAFETY_STOP');
 const walls={active_moisture:false,paint_support:'PAINT_READY',paint_access:'PAINT_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',paint_finish:'PAINT_TWO_COATS',painted_m2:40,ceiling_m2:40};
 assert.notEqual(engine.evaluateFixeoPrice({service_code:code,inputs:walls}).pricing?.commercial_output_type,'FIXEO_PRICE');
 const wrongArea={...inputs,painted_m2:40,floor_area_m2:40};delete wrongArea.ceiling_m2;assert.equal(evaluate(wrongArea).ok,false);
 assert.equal(selectTariff(evaluate(inputs,'unsupported').session,entries),null);
});

test('ceiling: real API preserves approved amounts and rejects disabled entries',async()=>{
 const handler=require('../../api/estimator-v1/index');
 const {normalizeSessionView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
 const keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]),oldFetch=global.fetch;
 async function api(body){let payload,status;await handler({method:'POST',headers:{host:'localhost'},body,socket:{remoteAddress:'ceiling-test'}},{setHeader(){},status(n){status=n;return this;},json(p){payload=p;return this;},end(){}});return {status,body:payload};}
 const approvals=entries.map(t=>t.approved);entries.forEach(t=>t.approved=false);
 const calls=[];process.env.FIXEO_ESTIMATOR_SECRET='ceiling-test-only';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 try{
  const session=o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:{...inputs,ceiling_m2:50.03}}).session;
  const view=normalizeSessionView(session,process.env.FIXEO_ESTIMATOR_SECRET);
  const blocked=await api({action:'evaluate',session_token:view.session_token});assert.equal(blocked.body.pricing_context_token,undefined);assert.equal(calls.length,0);
  entries.forEach(t=>t.approved=true);
  const r=await api({action:'evaluate',session_token:view.session_token});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.outcome.price.amount_mad,2301.32);assert.equal(calls.length,1);
  const verified=await api({action:'verify_pricing_context',pricing_context_token:r.body.pricing_context_token});assert.equal(verified.body.amount_mad,2301.32);
  const confirmed=await api({action:'confirm_request',pricing_context_token:r.body.pricing_context_token,client_phone:'0612345678'});assert.equal(confirmed.status,409);
  assert.match(calls[1].url,/confirm_estimator_request_vap_v1$/);assert.equal(calls[1].body.p_amount_mad,2301.32);assert.equal(calls[1].body.p_service_code,code);assert.equal(calls[1].body.p_offer_id,calls[0].body.id);
 }finally{entries.forEach((t,i)=>t.approved=approvals[i]);global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

test('ceiling: rendered questions use French ceiling labels and accept exact decimal area',()=>{
 const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.FixeoEstimatorConfig={estimatorV2Enabled:true};
  const src=fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8');
  w.eval(src.replace('}());','window.__ceilingTest={renderQuestion,resolveClientLabel,STATE};}());'));
  const ui=w.__ceilingTest;assert.equal(ui.resolveClientLabel(code).primary,'Peinture plafond');
  let s=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
  for(let i=0;i<6;i++){
   const step=o.getNextEstimatorStep(s).step,body=ui.renderQuestion(step,()=>{});w.document.body.appendChild(body);
   assert.doesNotMatch(body.textContent,/CEILING_|PAINT_CLIENT_SUPPLIED/);
   if(step.input_id==='ceiling_m2'){
    const input=body.querySelector('input[type=number]');assert.equal(input.step,'0.01');assert.match(body.textContent,/4 m × 5 m = 20 m²/);
    input.value='20.01';input.dispatchEvent(new w.Event('input'));assert.equal(ui.STATE.pendingAnswer,20.01);assert.equal(w.document.getElementById('cta-primary').disabled,false);
   }else if(step.input_id.startsWith('ceiling_'))assert.match(body.textContent,/plafond/i);
   body.remove();s=o.answerEstimatorQuestion(s,step.question_id,inputs[step.input_id]).session;
  }
 }finally{dom.window.close();}
});
