'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer,selectTariff,validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const {tariffBreakdown}=require('../../data/pricing/engine/vap-tariff-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const code='peinture.mur_interieur.all_in';
const entries=catalogue.entries.filter(x=>x.service_code===code);
const inputs={active_moisture:false,paint_included_support:'PAINT_INCLUDED_READY',paint_included_access:'PAINT_INCLUDED_ACCESS_READY',paint_included_product:'PAINT_COLOVINYL900_WHITE',paint_included_finish:'PAINT_INCLUDED_TWO_COATS',painted_m2:20};
function evaluate(values=inputs,city='rabat'){return o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:city,known_inputs:values}).session);}

test('included paint: approved catalogue is active while disabled entries cannot persist an offer',async()=>{
 assert.equal(entries.length,20);assert.ok(entries.every(t=>t.approved===true&&t.approval_status==='OWNER_APPROVED'));
 const disabled=entries.map(t=>({...t,approved:false}));
 const session=evaluate().session;assert.equal(selectTariff(session,disabled),null);
 let calls=0;await assert.rejects(attachOffer(session,{}, {entries:disabled,fetchImpl:()=>{calls++;throw Error('unexpected network');}}),/not eligible/);assert.equal(calls,0);
 const svc=require('../../data/pricing/canonical/canonical-registry.v1.draft.json').services[code];
 for(const k of ['production_ready','active_in_estimator','active_in_reservation']){assert.equal(svc[k],true);assert.equal(svc.status_flags[k],true);}
 assert.equal(svc.provenance.approval_status,'OWNER_APPROVED');
});

test('included paint: quantities, supplies floor and progressive fees agree in every city',async()=>{
 for(const t of entries)for(const [area,vap,materials,fee,total] of [
  [20,600,450,90,1140],[20.25,607.5,450,91.13,1148.63],[29.99,899.7,450,134.96,1484.66],
  [30,900,450,135,1485],[30.01,900.3,450.15,135.05,1485.5],[40,1200,600,180,1980],
  [40.03,1200.9,600.45,180.14,1981.49],[60,1800,900,270,2970],
  [66.66,1999.8,999.9,299.97,3299.67],[66.67,2000.1,1000.05,300.01,3300.16],[100,3000,1500,400,4900]
 ]){
  const e=evaluate({...inputs,painted_m2:area},t.city_slug);assert.equal(e.ok,true);assert.equal(e.session.outcome.price.amount_mad,total);
  const p={service_code:code,city_slug:t.city_slug,session_id:e.session.session_id,context_id:'fxctx-'+'d'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};let saved;
  await attachOffer(e.session,p,{entries,env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{saved=JSON.parse(opts.body);return {ok:true};}});
  assert.equal(saved.vap_minor,Math.round(vap*100));assert.equal(saved.materials_minor,Math.round(materials*100));assert.equal(saved.commission_minor,Math.round(fee*100));assert.equal(saved.client_total_minor,Math.round(total*100));
  assert.equal(saved.scope.inputs.paint_included_product,'PAINT_COLOVINYL900_WHITE');assert.equal(saved.scope.inputs.painted_m2,area);
  assert.equal(p.financial_breakdown.artisanRetentionMinor,Math.round((vap+materials)*100));assert.equal(p.amount_mad,total);validateFinancialContext(p);
  const tampered=structuredClone(p);tampered.financial_breakdown.materialsMinor+=1;assert.throws(()=>validateFinancialContext(tampered),/Invalid/);
 }
});

test('included paint: guided selection, six questions and scope identify the included product',()=>{
 let s=o.startEstimator({situation_id:'travaux.repeindre-une-piece',city_slug:'rabat'}).session;
 assert.ok(o.getNextEstimatorStep(s).step.candidate_services.some(x=>x.service_code===code));s=o.selectService(s,code).session;
 const seen=[];for(let i=0;i<6;i++){const step=o.getNextEstimatorStep(s).step;seen.push(step.input_id);assert.ok(step.input_id in inputs);const a=o.answerEstimatorQuestion(s,step.question_id,inputs[step.input_id]);assert.equal(a.ok,true);s=a.session;}
 assert.deepEqual(seen,Object.keys(inputs));const outcome=o.evaluateEstimator(s).session.outcome;
 assert.equal(outcome.price.amount_mad,1140);assert.match(outcome.scope_summary.join(' '),/Colovinyl 900 blanc mat/);assert.match(outcome.scope_summary.join(' '),/minimum de 450 MAD/);
 assert.doesNotMatch(outcome.exclusions_summary.join(' '),/peinture.*fournir par le client/i);assert.match(outcome.exclusions_summary.join(' '),/sous-couche/);
});

test('included paint: no price for unsafe, incomplete, incompatible or unmeasured work',()=>{
 for(const key of Object.keys(inputs)){const bad={...inputs};delete bad[key];assert.equal(evaluate(bad).ok,false,key);assert.equal(selectTariff({...evaluate().session,known_inputs:bad},entries),null,key);}
 for(const key of Object.keys(inputs).filter(k=>k.startsWith('paint_included_')))for(const value of ['PAINT_COMPLEX','UNKNOWN','PAINT_CLIENT_SUPPLIED']){
  const e=evaluate({...inputs,[key]:value});assert.notEqual(e.session?.outcome?.outcome_type,'PRICE_READY');assert.equal(selectTariff({...evaluate().session,known_inputs:{...inputs,[key]:value}},entries),null);
 }
 for(const q of [19.99,100.01,20.001,0,-1,'40',NaN,Infinity]){const bad={...inputs,painted_m2:q};assert.notEqual(evaluate(bad).session?.outcome?.outcome_type,'PRICE_READY');assert.equal(selectTariff({...evaluate().session,known_inputs:bad},entries),null);}
 assert.equal(evaluate({...inputs,active_moisture:true}).session.outcome.outcome_type,'SAFETY_STOP');
 const loose={active_moisture:false,painted_m2:40,paint_support:'PAINT_READY',paint_access:'PAINT_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',paint_finish:'PAINT_TWO_COATS'};
 assert.notEqual(evaluate(loose).session?.outcome?.outcome_type,'PRICE_READY');
 const floor={...inputs,ceiling_m2:40,floor_area_m2:40};delete floor.painted_m2;assert.equal(evaluate(floor).ok,false);
 assert.equal(selectTariff(evaluate(inputs,'unsupported').session,entries),null);
});

test('quantity tariffs: material rounding, fixed/variable ambiguity and invalid configuration fail closed',()=>{
 const q={field:'area',min:1,max:100,decimals:2,unit_minor:1501};
 assert.equal(tariffBreakdown({vap_minor:10000,materials_minor:0,materials_quantity:q},{area:1.5}).materialsMinor,2252);
 assert.equal(tariffBreakdown({vap_minor:10000,materials_minor:0,materials_quantity:{...q,minimum_minor:45000}},{area:1.5}).materialsMinor,45000);
 assert.equal(tariffBreakdown({vap_minor:10000},{}).materialsMinor,0);
 for(const materials of [null,NaN,-1,'0'])assert.throws(()=>tariffBreakdown({vap_minor:10000,materials_minor:materials},{}));
 assert.throws(()=>tariffBreakdown({vap_minor:10000,materials_quantity:q},{area:1.5}),/explicit zero/);
 assert.throws(()=>tariffBreakdown({vap_minor:10000,materials_minor:100,materials_quantity:q},{area:1.5}),/explicit zero/);
 for(const patch of [{unit_minor:-1},{unit_minor:1.5},{minimum_minor:-1},{minimum_minor:1.5},{decimals:NaN},{min:NaN},{max:0},{unit_minor:Number.MAX_SAFE_INTEGER}])assert.throws(()=>tariffBreakdown({vap_minor:10000,materials_minor:0,materials_quantity:{...q,...patch}},{area:100}));
 assert.throws(()=>tariffBreakdown({vap_minor:10000,materials_minor:0,materials_quantity:q},{area:1.001}),/scope/);
});

test('included paint: real API gates approval, signs supplies and confirms the exact offer',async()=>{
 const handler=require('../../api/estimator-v1/index'),{normalizeSessionView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
 const keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]),oldFetch=global.fetch;
 async function api(body){let payload,status;await handler({method:'POST',headers:{host:'localhost'},body,socket:{remoteAddress:'paint-supplies-test'}},{setHeader(){},status(n){status=n;return this;},json(p){payload=p;return this;},end(){}});return {status,body:payload};}
 const approvals=entries.map(t=>t.approved),calls=[];process.env.FIXEO_ESTIMATOR_SECRET='paint-supplies-test-only';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 try{
  entries.forEach(t=>t.approved=false);
  const session=o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:{...inputs,painted_m2:66.67}}).session;
  const view=normalizeSessionView(session,process.env.FIXEO_ESTIMATOR_SECRET);
  const blocked=await api({action:'evaluate',session_token:view.session_token});assert.equal(blocked.body.pricing_context_token,undefined);assert.equal(calls.length,0);
  entries.forEach(t=>t.approved=true);
  const r=await api({action:'evaluate',session_token:view.session_token});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.outcome.price.amount_mad,3300.16);assert.equal(calls.length,1);
  assert.equal(r.body.outcome.financial_breakdown.materialsMinor,100005);assert.equal(r.body.outcome.financial_breakdown.commissionMinor,30001);
  const verified=await api({action:'verify_pricing_context',pricing_context_token:r.body.pricing_context_token});assert.equal(verified.body.amount_mad,3300.16);
  const confirmed=await api({action:'confirm_request',pricing_context_token:r.body.pricing_context_token,client_phone:'0612345678'});assert.equal(confirmed.status,409);
  assert.match(calls[1].url,/confirm_estimator_request_vap_v1$/);assert.equal(calls[1].body.p_amount_mad,3300.16);assert.equal(calls[1].body.p_service_code,code);assert.equal(calls[1].body.p_offer_id,calls[0].body.id);
 }finally{entries.forEach((t,i)=>t.approved=approvals[i]);global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

test('included paint: rendered questions name the supplied paint and accept exact wall area',()=>{
 const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.FixeoEstimatorConfig={estimatorV2Enabled:true};
  const src=fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8');
  w.eval(src.replace('}());','window.__paintTest={renderQuestion,resolveClientLabel,STATE,EstimatorModal};}());'));
  const ui=w.__paintTest;assert.equal(ui.resolveClientLabel(code).secondary,'Blanc mat — peinture incluse');
  let s=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
  for(let i=0;i<6;i++){
   const step=o.getNextEstimatorStep(s).step,body=ui.renderQuestion(step,()=>{});w.document.body.appendChild(body);
   assert.doesNotMatch(body.textContent,/PAINT_INCLUDED_|PAINT_COLOVINYL|PAINT_CLIENT_SUPPLIED/);
   if(step.input_id==='painted_m2'){
    const input=body.querySelector('input[type=number]');assert.equal(input.step,'0.01');assert.match(body.textContent,/retirez portes et fenêtres/);
    input.value='20.01';input.dispatchEvent(new w.Event('input'));assert.equal(ui.STATE.pendingAnswer,20.01);assert.equal(w.document.getElementById('cta-primary').disabled,false);
   }else if(step.input_id==='paint_included_product')assert.match(body.textContent,/Colovinyl 900 blanc mat/);
   body.remove();s=o.answerEstimatorQuestion(s,step.question_id,inputs[step.input_id]).session;
  }
  w.document.body.innerHTML='<div id="body-slot"></div><div id="footer-slot"></div>';
  const modal=Object.create(ui.EstimatorModal.prototype);modal._restoring=true;modal._history=[];
  const session=evaluate().session,outcome={...session.outcome,financial_breakdown:tariffBreakdown(entries[0],inputs)};
  modal._renderOutcome(session,outcome);
  const result=w.document.getElementById('body-slot').textContent.replace(/[\s\u00a0\u202f]+/g,' ');
  assert.match(result,/Prestation artisan : 600/);assert.match(result,/Service FIXEO : 90/);assert.match(result,/Fournitures incluses : 450/);assert.match(result,/1[ .]140 MAD/);
 }finally{dom.window.close();}
});
