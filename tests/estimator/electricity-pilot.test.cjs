const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),pilot=require('../../data/pricing/engine/electricity-pilot-v1');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1'),engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {selectTariff,attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const entries=catalogue.entries.filter(e=>e.catalogue_version===pilot.version);
const approvedTotals={
 'electricite.diagnostic':240,'electricite.prise_remplacement':260,'electricite.interrupteur_remplacement.simple':260,
 'electricite.interrupteur_remplacement.va_et_vient':300,'electricite.luminaire_installation':280,'electricite.disjoncteur_remplacement':310
};
test('6 approved services across 20 cities: exact prices and strict qualification without legacy fallback',async()=>{
 assert.equal(entries.length,120);assert.equal(new Set(entries.map(e=>e.city_slug)).size,20);
 for(const entry of entries){
  const service=pilot.services[entry.service_code];let session=o.startEstimator({service_hint:entry.service_code,city_slug:entry.city_slug}).session;
  for(const field of Object.keys(service.inputs)){const step=o.getNextEstimatorStep(session).step;assert.equal(step.input_id,field);session=o.answerEstimatorQuestion(session,step.question_id,service.inputs[field]).session;}
  session=o.evaluateEstimator(session).session;assert.equal(session.outcome.price.amount_mad,approvedTotals[entry.service_code]);assert.equal(selectTariff(session),entry);
  assert.ok(session.outcome.scope_summary.includes(service.scope));
  if(entry.outcome_type==='DIAGNOSTIC_READY'){assert.equal(session.outcome.absorption_possible,true);assert.equal(session.outcome.qualifying_service_codes.length,5);}
  assert.equal(selectTariff({...session,entry_context:{city_slug:'unapproved-city'}}),null);
 }
 for(const [code,s] of Object.entries(pilot.services)){
  for(const field of Object.keys(s.inputs))for(const value of [undefined,'COMPLEX','UNKNOWN',false]){
   const result=engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,[field]:value}});assert.equal(result.ok,false);assert.equal(result.pricing,null);
  }
  const session=o.evaluateEstimator(o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:s.inputs}).session).session;
  await assert.rejects(attachOffer(session,{}, {entries:[],fetchImpl:()=>{throw Error('must not call network');}}),/not eligible/);
 }
});
test('Electrical safety, operator and scope boundaries agree across interactive, prefilled and direct engine paths',()=>{
 for(const [code,s] of Object.entries(pilot.services)){
  for(const [field,value,status] of [['electricity_safety','ELEC_DANGER','SAFETY_STOP'],['electricity_safety','UNKNOWN','SAFETY_STOP'],['electricity_operator','ELEC_DISTRIBUTOR','ROUTE_REQUIRED'],['electricity_operator','UNKNOWN','ROUTE_REQUIRED'],['electricity_access','COMPLEX','QUOTE_REQUIRED']]){
   let interactive=o.startEstimator({service_hint:code}).session;
   for(const k of Object.keys(s.inputs)){const q=o.getNextEstimatorStep(interactive).step;interactive=o.answerEstimatorQuestion(interactive,q.question_id,k===field?value:s.inputs[k]).session;if(k===field)break;}
   const prefilled=o.startEstimator({service_hint:code,known_inputs:{...s.inputs,[field]:value}}).session;
   const direct=require('../../data/pricing/orchestrator/estimator-outcome-mapper-v1').mapEngineResultToOutcome(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,[field]:value}}),code);
   for(const outcome of [interactive.outcome,prefilled.outcome,direct]){assert.equal(outcome.outcome_type,status);assert.equal(outcome.price.amount_mad,null);}
  }
  for(const field of ['burning_smell','scorch_marks','active_moisture','smoke','sparks','exposed_live_wires','water_near_electricity']){
   const inputs={...s.inputs,[field]:true},session=o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:inputs}).session;
   assert.equal(session.outcome.outcome_type,'SAFETY_STOP');assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs}).qualification.status,'STOP_SAFETY');
   assert.equal(selectTariff({...session,outcome:{outcome_type:code==='electricite.diagnostic'?'DIAGNOSTIC_READY':'PRICE_READY'}}),null);
  }
 }
 const code='electricite.disjoncteur_remplacement',inputs=pilot.services[code].inputs;
 for(const patch of [{electricity_fault:'ELEC_TRIPS_OR_UNKNOWN'},{electricity_fault:'UNKNOWN'},{mcb_defect_confirmed:'trips_repeatedly'},{mcb_trips_repeatedly:true}]){
  const s=o.startEstimator({service_hint:code,known_inputs:{...inputs,...patch}}).session;
  assert.equal(s.outcome.outcome_type,'ROUTE_REQUIRED');assert.equal(s.outcome.route.target_service,'electricite.diagnostic');assert.equal(s.outcome.price.amount_mad,null);
 }
 const light='electricite.luminaire_installation';
 for(const [height,weight,ok] of [[2.8,3,true],[2.81,3,false],[2.8,3.01,false],[0,1,false],['2.8',1,false]])assert.equal(engine.evaluateFixeoPrice({service_code:light,inputs:{...pilot.services[light].inputs,fixture_height_m:height,fixture_weight_kg:weight}}).ok,ok);
 for(const [code,count,ok] of [['electricite.prise_remplacement',2,false],['electricite.interrupteur_remplacement.va_et_vient',2,true],['electricite.interrupteur_remplacement.va_et_vient',1,false],['electricite.luminaire_installation',2,false]])assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...pilot.services[code].inputs,item_count:count}}).ok,ok);
});
test('Direct-repair screen requires all professional checks and uses the dedicated authenticated RPC',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],code='electricite.luminaire_installation';w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const file of ['data/pricing/engine/electricity-pilot-v1.js','js/fixeo-electricity-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',file),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{direct_service_code:code,current_total_minor:28000,can_confirm_prework:true,prework_confirmed:name==='electricity_prework_artisan_v1'}};}};
  await w.FixeoElectricityRepair.openArtisan(sb,'10000000-0000-4000-8000-000000000001');
  const save=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer mes vérifications avant travaux');save.click();assert.equal(calls.length,1);
  const checks=[...w.document.querySelectorAll('input[type=checkbox]')];checks.slice(1).forEach(c=>{c.checked=true;});save.click();assert.equal(calls.length,1);
  checks[0].checked=true;save.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].name,'electricity_prework_artisan_v1');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_professional_checks)),pilot.services[code].professional_checks);assert.match(w.document.body.textContent,/Vérifications professionnelles enregistrées/);
 }finally{dom.window.close();}
});
test('Public estimator API persists and signs the six exact electrical offers; danger and utility routes issue no offer',async()=>{
 const handler=require('../../api/estimator-v1/index'),keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]),oldFetch=global.fetch,calls=[];
 process.env.FIXEO_ESTIMATOR_SECRET='electricity-test';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 async function api(body){let status,data;await handler({method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'electricity-estimator-test'},body},{setHeader(){},status(s){status=s;return this;},json(v){data=v;return this;},end(){}});return {status,data};}
 try{
  for(const [code,s]of Object.entries(pilot.services)){
   const start=await api({action:'start',entry_context:{service_hint:code,city_slug:'fes',known_inputs:s.inputs}});assert.equal(start.status,200);
   const result=await api({action:'evaluate',session_token:start.data.session.session_token});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.outcome.price.amount_mad,approvedTotals[code]);
   const verified=await api({action:'verify_pricing_context',pricing_context_token:result.data.pricing_context_token});assert.equal(verified.data.amount_mad,approvedTotals[code]);
   const row=calls.at(-1).body;assert.equal(row.service_code,code);assert.equal(row.client_total_minor,approvedTotals[code]*100);assert.equal(row.commission_minor,6000);
   const confirmed=await api({action:'confirm_request',pricing_context_token:result.data.pricing_context_token,client_phone:'0612345678'});assert.equal(confirmed.status,409);assert.equal(calls.at(-1).body.p_offer_id,row.id);assert.equal(calls.at(-1).body.p_amount_mad,approvedTotals[code]);
  }
  const before=calls.length;
  for(const patch of [{burning_smell:true},{electricity_operator:'ELEC_DISTRIBUTOR'}]){
   const r=await api({action:'start',entry_context:{service_hint:'electricite.prise_remplacement',city_slug:'fes',known_inputs:{...pilot.services['electricite.prise_remplacement'].inputs,...patch}}});
   assert.equal(r.status,200);assert.ok(['SAFETY_STOP','ROUTE_REQUIRED'].includes(r.data.session.state));assert.ok(!r.data.pricing_context_token);
  }
  assert.equal(calls.length,before);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Rendered electricity questions, parts and diagnosis use customer language with explicit scope',()=>{
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/electricity-pilot-v1.js'),'utf8'));w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8').replace('}());','window.__electricityTest={renderQuestion,renderDiagnosticResult};}());'));
  for(const [code,s]of Object.entries(pilot.services)){
   let session=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
   for(const field of Object.keys(s.inputs)){
    const step=o.getNextEstimatorStep(session).step,body=w.__electricityTest.renderQuestion(step,()=>{});w.document.body.appendChild(body);
    assert.doesNotMatch(body.textContent,/ELEC_|LOCAL_ACCESSIBLE|electricity_work/);
    if(field==='electricity_work')assert.match(body.textContent,new RegExp(s.scope.slice(0,20)));
    if(field==='electricity_parts')assert.match(body.textContent,/pièce neuve/);
    body.remove();session=o.answerEstimatorQuestion(session,step.question_id,s.inputs[field]).session;
   }
   if(code==='electricite.diagnostic'){const outcome=o.evaluateEstimator(session).session.outcome;const body=w.__electricityTest.renderDiagnosticResult(outcome);assert.match(body.textContent,/240/);assert.match(body.textContent,/seul frais FIXEO/);}
  }
 }finally{dom.window.close();}
});
test('Guest repair API hashes credentials, requires exact consent and maps rejected transitions',async()=>{
 const handler=require('../../api/urgent-request-fn/index'),oldFetch=global.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const calls=[];let reply={ok:true,json:async()=>({current_total_minor:26000,remaining_due_minor:2000})};global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return reply;};
 async function api(body){let status,data;await handler({method:'POST',headers:{},socket:{remoteAddress:'electricity-api-test'},body},{setHeader(){},status(n){status=n;return this;},json(p){data=p;return this;}});return {status,data};}
 const body={action:'electricity_repair_accept',tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64),proposal_id:'10000000-0000-4000-8000-000000000001',diagnostic_paid_minor:24000,consent_version:'electricity-same-visit-v1'};
 try{
  assert.equal((await api({...body,consent_version:null})).status,400);assert.equal(calls.length,0);
  assert.equal((await api({...body,diagnostic_paid_minor:1000})).status,400);assert.equal(calls.length,0);
  const accepted=await api(body);assert.equal(accepted.status,200);assert.equal(accepted.data.repair.remaining_due_minor,2000);
  assert.equal(calls.length,1);assert.match(calls[0].url,/electricity_repair_guest_v1$/);assert.notEqual(calls[0].body.p_guest_hash,body.guest_token);assert.equal(calls[0].body.p_action,'accept');assert.equal(calls[0].body.p_expected_paid_minor,24000);
  reply={ok:false,json:async()=>({code:'42501'})};assert.equal((await api(body)).status,404);
  reply={ok:false,json:async()=>({code:'22023'})};assert.equal((await api(body)).status,409);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Guest screen shows a single total and credit; acceptance stays disabled until explicit consent',async()=>{
 const dom=new JSDOM('<article id="card"></article>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],s=pilot.services['electricite.prise_remplacement'];let status='PENDING';
  w.fetch=async(_,opts)=>{const body=JSON.parse(opts.body);calls.push(body);if(body.action==='electricity_repair_accept')status='ACCEPTED';return {ok:true,json:async()=>({ok:true,repair:{proposal:{id:'10000000-0000-4000-8000-000000000001',label:s.label,scope:s.scope,client_total_minor:26000,vap_minor:20000,commission_minor:6000,diagnostic_paid_minor:24000,remaining_due_minor:2000,expires_at:new Date(Date.now()+60000).toISOString(),status}}})};};
  w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/electricity-pilot-v1.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-electricity-repair-ui.js'),'utf8'));
  const card=w.document.getElementById('card');await w.FixeoElectricityRepair.mountGuest(card,{service_category:'electricite'},{tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64)});
  assert.match(card.textContent,/Total final.*260 DH/);assert.match(card.textContent,/déjà versé.*240 DH/);assert.match(card.textContent,/Reste à payer.*20 DH/);
  const accept=[...card.querySelectorAll('button')].find(b=>b.textContent==='Accepter la réparation');assert.equal(accept.disabled,true);accept.click();assert.equal(calls.length,1);
  const check=card.querySelector('input');check.checked=true;check.dispatchEvent(new w.Event('change'));accept.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].diagnostic_paid_minor,24000);assert.equal(calls[1].consent_version,'electricity-same-visit-v1');assert.match(card.textContent,/Réparation acceptée/);assert.equal(card.querySelector('input'),null);
 }finally{dom.window.close();}
});
test('Artisan form sends the selected repair, checked scope, declared cash credit and stable proposal identity',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[];w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const file of ['data/pricing/engine/electricity-pilot-v1.js','js/fixeo-electricity-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',file),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{can_propose:true,proposal:null}};}};
  await w.FixeoElectricityRepair.openArtisan(sb,'10000000-0000-4000-8000-000000000001');
  const select=w.document.querySelector('select');select.value='electricite.disjoncteur_remplacement';select.dispatchEvent(new w.Event('change'));
  let send=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Soumettre au client dans son suivi');send.click();assert.equal(calls.length,1);
  w.document.querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=true;});w.document.querySelector('[aria-label="Diagnostic déjà encaissé"]').value='24000';send.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].args.p_same_visit,true);assert.equal(calls[1].args.p_paid_minor,24000);assert.equal(calls[1].args.p_service_code,'electricite.disjoncteur_remplacement');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_professional_checks)),pilot.services['electricite.disjoncteur_remplacement'].professional_checks);assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_inputs)),pilot.services['electricite.disjoncteur_remplacement'].inputs);assert.match(calls[1].args.p_proposal_id,/^[a-f0-9-]{36}$/);
 }finally{dom.window.close();}
});
