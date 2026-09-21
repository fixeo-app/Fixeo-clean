const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),pilot=require('../../data/pricing/engine/climatisation-pilot-v1');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1'),engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {selectTariff,attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const entries=catalogue.entries.filter(e=>e.catalogue_version===pilot.version);
const approvedTotals={
 'climatisation.diagnostic':260,'climatisation.entretien_annuel':300,'climatisation.desinfection_profonde':450,
 'climatisation.installation.standard':1025,'climatisation.installation.mono_split_5m':1290,'climatisation.desinstallation':460
};
test('6 approved services across 20 cities: exact prices and strict qualification without legacy fallback',async()=>{
 assert.equal(entries.length,120);assert.equal(new Set(entries.map(e=>e.city_slug)).size,20);
 for(const entry of entries){
  const service=pilot.services[entry.service_code];let session=o.startEstimator({service_hint:entry.service_code,city_slug:entry.city_slug}).session;
  for(const field of Object.keys(service.inputs)){const step=o.getNextEstimatorStep(session).step;assert.equal(step.input_id,field);session=o.answerEstimatorQuestion(session,step.question_id,service.inputs[field]).session;}
  session=o.evaluateEstimator(session).session;assert.equal(session.outcome.price.amount_mad,approvedTotals[entry.service_code]);assert.equal(selectTariff(session),entry);
  assert.ok(session.outcome.scope_summary.includes(service.scope));
  if(entry.outcome_type==='DIAGNOSTIC_READY'){assert.equal(session.outcome.absorption_possible,true);assert.equal(session.outcome.qualifying_service_codes.length,2);}
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
test('Safety, faults, multiple units and installation limits never emit a payable offer',()=>{
 for(const [code,s] of Object.entries(pilot.services)){
  for(const field of ['smoke','sparks','burning_smell','water_on_electrics','unstable_support','dangerous_refrigerant_leak','exposed_live_wires']){
   const inputs={...s.inputs,[field]:true};
   const session=o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:inputs}).session;
   assert.equal(session.outcome.outcome_type,'SAFETY_STOP');
   assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs}).qualification.status,'STOP_SAFETY');
   assert.equal(selectTariff({...session,outcome:{outcome_type:code==='climatisation.diagnostic'?'DIAGNOSTIC_READY':'PRICE_READY'}}),null);
  }
  for(const patch of [{ac_count:2},{indoor_unit_count:2},{outdoor_unit_count:2},{ac_capacity_btu:s.capacity[0]-1},{ac_capacity_btu:s.capacity[1]+1},{facade_inaccessible:true},{multi_split:true}]){
   assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,...patch}}).ok,false,code+JSON.stringify(patch));
   assert.equal(o.startEstimator({service_hint:code,known_inputs:{...s.inputs,...patch}}).session.outcome.outcome_type,'QUOTE_REQUIRED');
  }
 }
 for(const code of ['climatisation.installation.standard','climatisation.installation.mono_split_5m']){
  const s=pilot.services[code],len=code.endsWith('standard')?3:5;
  assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,copper_length_m:len,installation_height_m:2.8,wall_thickness_cm:25}}).ok,true);
  for(const patch of [{copper_length_m:len+0.01},{copper_length_m:0},{copper_length_m:'3'},{installation_height_m:2.81},{wall_thickness_cm:25.01},{client_supplied_kit:true},{additional_refrigerant_required:true},{used_unit:true},{refrigerant_type:'R22'}]){
   assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,...patch}}).ok,false,JSON.stringify(patch));
   assert.equal(o.startEstimator({service_hint:code,known_inputs:{...s.inputs,...patch}}).session.outcome.outcome_type,'QUOTE_REQUIRED');
  }
 }
 for(const code of ['climatisation.recharge_gaz_r22','climatisation.reparation_fuite_recharge']){
  const result=o.startEstimator({service_hint:code,city_slug:'rabat'}).session.outcome;
  assert.equal(result.outcome_type,'ROUTE_REQUIRED');assert.equal(result.route.target_service,'climatisation.diagnostic');assert.equal(result.price.amount_mad,null);
 }
 assert.equal(o.startEstimator({service_hint:'climatisation.installation.cassette'}).session.outcome.outcome_type,'QUOTE_REQUIRED');
 for(const code of ['climatisation.entretien_annuel','climatisation.desinfection_profonde','climatisation.desinstallation']){
  const result=o.startEstimator({service_hint:code,known_inputs:{...pilot.services[code].inputs,clim_condition:'CLIM_PROBLEM'}}).session.outcome;
  assert.equal(result.outcome_type,'ROUTE_REQUIRED');assert.equal(result.route.target_service,'climatisation.diagnostic');
 }
});
test('Direct-repair screen requires all professional checks and uses the dedicated authenticated RPC',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],code='climatisation.desinstallation';w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const file of ['data/pricing/engine/climatisation-pilot-v1.js','js/fixeo-climatisation-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',file),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{direct_service_code:code,current_total_minor:46000,can_confirm_prework:true,prework_confirmed:name==='climatisation_prework_artisan_v1'}};}};
  await w.FixeoClimatisationRepair.openArtisan(sb,'10000000-0000-4000-8000-000000000001');
  const save=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer mes vérifications avant travaux');save.click();assert.equal(calls.length,1);
  const checks=[...w.document.querySelectorAll('input[type=checkbox]')];checks.slice(1).forEach(c=>{c.checked=true;});save.click();assert.equal(calls.length,1);
  checks[0].checked=true;save.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].name,'climatisation_prework_artisan_v1');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_professional_checks)),pilot.services[code].professional_checks);assert.match(w.document.body.textContent,/Vérifications professionnelles enregistrées/);
 }finally{dom.window.close();}
});
test('Public estimator API persists and signs the six exact climatisation offers; danger and utility routes issue no offer',async()=>{
 const handler=require('../../api/estimator-v1/index'),keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]),oldFetch=global.fetch,calls=[];
 process.env.FIXEO_ESTIMATOR_SECRET='climatisation-test';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 async function api(body){let status,data;await handler({method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'climatisation-estimator-test'},body},{setHeader(){},status(s){status=s;return this;},json(v){data=v;return this;},end(){}});return {status,data};}
 try{
  for(const [code,s]of Object.entries(pilot.services)){
   const start=await api({action:'start',entry_context:{service_hint:code,city_slug:'fes',known_inputs:s.inputs}});assert.equal(start.status,200);
   const result=await api({action:'evaluate',session_token:start.data.session.session_token});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.outcome.price.amount_mad,approvedTotals[code]);
   const verified=await api({action:'verify_pricing_context',pricing_context_token:result.data.pricing_context_token});assert.equal(verified.data.amount_mad,approvedTotals[code]);
   const row=calls.at(-1).body;assert.equal(row.service_code,code);assert.equal(row.client_total_minor,approvedTotals[code]*100);assert.equal(row.commission_minor,s.commission_minor);assert.equal(row.materials_minor,s.materials_minor);
   const confirmed=await api({action:'confirm_request',pricing_context_token:result.data.pricing_context_token,client_phone:'0612345678'});assert.equal(confirmed.status,409);assert.equal(calls.at(-1).body.p_offer_id,row.id);assert.equal(calls.at(-1).body.p_amount_mad,approvedTotals[code]);
  }
  const before=calls.length;
  for(const patch of [{burning_smell:true},{clim_condition:'CLIM_PROBLEM'}]){
   const r=await api({action:'start',entry_context:{service_hint:'climatisation.entretien_annuel',city_slug:'fes',known_inputs:{...pilot.services['climatisation.entretien_annuel'].inputs,...patch}}});
   assert.equal(r.status,200);assert.ok(['SAFETY_STOP','ROUTE_REQUIRED'].includes(r.data.session.state));assert.ok(!r.data.pricing_context_token);
  }
  assert.equal(calls.length,before);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Rendered climatisation questions, parts and diagnosis use customer language with explicit scope',()=>{
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/climatisation-pilot-v1.js'),'utf8'));w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8').replace('}());','window.__climatisationTest={renderQuestion,renderDiagnosticResult};}());'));
  for(const [code,s]of Object.entries(pilot.services)){
   let session=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
   for(const field of Object.keys(s.inputs)){
    const step=o.getNextEstimatorStep(session).step,body=w.__climatisationTest.renderQuestion(step,()=>{});w.document.body.appendChild(body);
    assert.doesNotMatch(body.textContent,/CLIM_|clim_work/);
    if(field==='clim_work')assert.match(body.textContent,new RegExp(s.scope.slice(0,20)));
    body.remove();session=o.answerEstimatorQuestion(session,step.question_id,s.inputs[field]).session;
   }
   if(code==='climatisation.diagnostic'){const outcome=o.evaluateEstimator(session).session.outcome;const body=w.__climatisationTest.renderDiagnosticResult(outcome);assert.match(body.textContent,/260/);assert.match(body.textContent,/seul frais FIXEO/);}
  }
 }finally{dom.window.close();}
});
test('Guest repair API hashes credentials, requires exact consent and maps rejected transitions',async()=>{
 const handler=require('../../api/urgent-request-fn/index'),oldFetch=global.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const calls=[];let reply={ok:true,json:async()=>({current_total_minor:30000,remaining_due_minor:4000})};global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return reply;};
 async function api(body){let status,data;await handler({method:'POST',headers:{},socket:{remoteAddress:'climatisation-api-test'},body},{setHeader(){},status(n){status=n;return this;},json(p){data=p;return this;}});return {status,data};}
 const body={action:'climatisation_repair_accept',tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64),proposal_id:'10000000-0000-4000-8000-000000000001',diagnostic_paid_minor:26000,consent_version:'climatisation-same-visit-v1'};
 try{
  assert.equal((await api({...body,consent_version:null})).status,400);assert.equal(calls.length,0);
  assert.equal((await api({...body,diagnostic_paid_minor:1000})).status,400);assert.equal(calls.length,0);
  const accepted=await api(body);assert.equal(accepted.status,200);assert.equal(accepted.data.repair.remaining_due_minor,4000);
  assert.equal(calls.length,1);assert.match(calls[0].url,/climatisation_repair_guest_v1$/);assert.notEqual(calls[0].body.p_guest_hash,body.guest_token);assert.equal(calls[0].body.p_action,'accept');assert.equal(calls[0].body.p_expected_paid_minor,26000);
  reply={ok:false,json:async()=>({code:'42501'})};assert.equal((await api(body)).status,404);
  reply={ok:false,json:async()=>({code:'22023'})};assert.equal((await api(body)).status,409);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Guest screen shows a single total and credit; acceptance stays disabled until explicit consent',async()=>{
 const dom=new JSDOM('<article id="card"></article>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],s=pilot.services['climatisation.entretien_annuel'];let status='PENDING';
  w.fetch=async(_,opts)=>{const body=JSON.parse(opts.body);calls.push(body);if(body.action==='climatisation_repair_accept')status='ACCEPTED';return {ok:true,json:async()=>({ok:true,repair:{proposal:{id:'10000000-0000-4000-8000-000000000001',label:s.label,scope:s.scope,client_total_minor:30000,vap_minor:24000,commission_minor:6000,diagnostic_paid_minor:26000,remaining_due_minor:4000,expires_at:new Date(Date.now()+60000).toISOString(),status}}})};};
  w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/climatisation-pilot-v1.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-climatisation-repair-ui.js'),'utf8'));
  const card=w.document.getElementById('card');await w.FixeoClimatisationRepair.mountGuest(card,{service_category:'climatisation'},{tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64)});
  assert.match(card.textContent,/Total final.*300 DH/);assert.match(card.textContent,/déjà versé.*260 DH/);assert.match(card.textContent,/Reste à payer.*40 DH/);
  const accept=[...card.querySelectorAll('button')].find(b=>b.textContent==='Accepter l’entretien');assert.equal(accept.disabled,true);accept.click();assert.equal(calls.length,1);
  const check=card.querySelector('input');check.checked=true;check.dispatchEvent(new w.Event('change'));accept.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].diagnostic_paid_minor,26000);assert.equal(calls[1].consent_version,'climatisation-same-visit-v1');assert.match(card.textContent,/Entretien accepté/);assert.equal(card.querySelector('input'),null);
 }finally{dom.window.close();}
});
test('Artisan form sends the selected repair, checked scope, declared cash credit and stable proposal identity',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[];w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const file of ['data/pricing/engine/climatisation-pilot-v1.js','js/fixeo-climatisation-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',file),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{can_propose:true,proposal:null}};}};
  await w.FixeoClimatisationRepair.openArtisan(sb,'10000000-0000-4000-8000-000000000001');
  const select=w.document.querySelector('select');assert.deepEqual([...select.options].map(o=>o.value),['','climatisation.entretien_annuel','climatisation.desinfection_profonde']);select.value='climatisation.desinfection_profonde';select.dispatchEvent(new w.Event('change'));
  let send=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Soumettre au client dans son suivi');send.click();assert.equal(calls.length,1);
  w.document.querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=true;});w.document.querySelector('[aria-label="Diagnostic déjà encaissé"]').value='26000';send.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].args.p_same_visit,true);assert.equal(calls[1].args.p_paid_minor,26000);assert.equal(calls[1].args.p_service_code,'climatisation.desinfection_profonde');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_professional_checks)),pilot.services['climatisation.desinfection_profonde'].professional_checks);assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_inputs)),pilot.services['climatisation.desinfection_profonde'].inputs);assert.match(calls[1].args.p_proposal_id,/^[a-f0-9-]{36}$/);
 }finally{dom.window.close();}
});

test('Before acceptance, the artisan must confirm the fixed kit; closing, partial checks and server errors cannot accept',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],code='climatisation.installation.standard',s=pilot.services[code];let fail=false;
  w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const f of ['data/pricing/engine/climatisation-pilot-v1.js','js/fixeo-climatisation-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',f),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return fail&&args.p_professional_checks?{error:{message:'unavailable'}}:{data:{service_code:code,scope:s.scope,vap_minor:s.vap_minor,materials_minor:s.materials_minor,commission_minor:s.commission_minor,client_total_minor:s.total_minor,confirmed:!!args.p_professional_checks}};}};
  const pending=w.FixeoClimatisationRepair.checkOffer(sb,'request');await new Promise(r=>setImmediate(r));
  [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Fermer sans accepter').click();assert.equal(await pending,false);assert.equal(calls.length,1);
  const accepted=w.FixeoClimatisationRepair.checkOffer(sb,'request');await new Promise(r=>setImmediate(r));
  const save=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Confirmer le kit et poursuivre l’acceptation');
  assert.match(w.document.body.textContent,/Fournitures incluses : 450 DH/);assert.match(w.document.body.textContent,/Frais FIXEO : 75 DH/);
  save.click();assert.equal(calls.length,2);const checks=[...w.document.querySelectorAll('input')];checks.slice(1).forEach(c=>c.checked=true);save.click();assert.equal(calls.length,2);
  checks[0].checked=true;fail=true;save.click();await new Promise(r=>setImmediate(r));assert.equal(w.document.querySelectorAll('dialog').length,1);assert.match(w.document.body.textContent,/Confirmation non enregistrée/);
  fail=false;save.click();assert.equal(await accepted,true);assert.equal(w.document.querySelector('dialog'),null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args.p_professional_checks)),s.offer_checks);
 }finally{dom.window.close();}
});

test('The installation screen records pre-work separately from actual tightness, vacuum and commissioning checks',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],code='climatisation.installation.mono_split_5m',state={direct_service_code:code,current_total_minor:129000,can_confirm_prework:true,completion_required:true,prework_confirmed:false,completion_confirmed:false};
  w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const f of ['data/pricing/engine/climatisation-pilot-v1.js','js/fixeo-climatisation-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',f),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});if(name==='climatisation_prework_artisan_v1')state.prework_confirmed=true;if(name==='climatisation_completion_artisan_v1')state.completion_confirmed=true;return {data:{...state}};}};
  await w.FixeoClimatisationRepair.openArtisan(sb,'mission');assert.doesNotMatch(w.document.body.textContent,/Après la pose/);
  w.document.querySelectorAll('input').forEach(c=>c.checked=true);[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer mes vérifications avant travaux').click();await new Promise(r=>setImmediate(r));
  assert.match(w.document.body.textContent,/Après la pose/);const finish=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer la mise en service');finish.click();assert.equal(calls.length,2);
  w.document.querySelectorAll('input').forEach(c=>c.checked=true);finish.click();await new Promise(r=>setImmediate(r));assert.equal(calls.length,3);assert.equal(calls[2].name,'climatisation_completion_artisan_v1');assert.deepEqual(JSON.parse(JSON.stringify(calls[2].args.p_professional_checks)),{tightness_verified:true,vacuum_completed:true,commissioning_successful:true});assert.match(w.document.body.textContent,/Contrôles de mise en service enregistrés/);
 }finally{dom.window.close();}
});
