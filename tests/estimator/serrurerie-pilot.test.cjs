const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),pilot=require('../../data/pricing/engine/serrurerie-pilot-v1');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1'),engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {selectTariff,attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const entries=catalogue.entries.filter(e=>e.catalogue_version===pilot.version);
const approvedTotals={'serrurerie.diagnostic':220,'serrurerie.porte_claquee_ouverture':260,'serrurerie.porte_claquee_blindee.ouverture':360,'serrurerie.cle_cassee_extraction':260,'serrurerie.cylindre_remplacement.standard':300,'serrurerie.serrure_remplacement.standard':400};
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

test('Danger, disputed access, legacy contradictions, locked doors, multiple units and missing parts issue no fixed offer',()=>{
 for(const [code,s]of Object.entries(pilot.services)){
  for(const patch of [{locksmith_safety:'IMMEDIATE_DANGER'},{locksmith_safety:'UNKNOWN'},{fire:true},{person_in_danger:'true'},{locksmith_access_right:'UNKNOWN'},{locksmith_access_right:'DISPUTED_OR_UNAUTHORIZED'},{occupancy_dispute:true},{authorization_verified:false},{property_occupied_status:'OCCUPIED_THIRD_PARTY'}]){
   const inputs={...s.inputs,...patch},session=o.startEstimator({service_hint:code,city_slug:'rabat',known_inputs:inputs}).session;
   assert.equal(session.outcome.outcome_type,'SAFETY_STOP',code+JSON.stringify(patch));assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs}).ok,false);assert.equal(selectTariff({...session,outcome:{outcome_type:code==='serrurerie.diagnostic'?'DIAGNOSTIC_READY':'PRICE_READY'}}),null);
  }
  for(const patch of [{cylinder_count:2},{lock_count:2},{door_count:0},{door_count:'1'},{appointment_hour:7.99},{appointment_hour:20},{appointment_hour:'10'},{connected_lock:true},{combined_opening_replacement:true},{destructive_work_required:true}]){
   assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,...patch}}).ok,false);assert.equal(o.startEstimator({service_hint:code,known_inputs:{...s.inputs,...patch}}).session.outcome.outcome_type,'QUOTE_REQUIRED');
  }
  for(const hour of [8,19.99])assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,appointment_hour:hour}}).ok,true);
  if(code!=='serrurerie.diagnostic')for(const patch of [{door_locked_with_key:true},{locksmith_door_state:'LOCKED'}])assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,...patch}}).ok,false);
  if(s.client_part)for(const patch of [{locksmith_part_supply:'UNKNOWN'},{locksmith_part_fit:'UNKNOWN'},{locksmith_door_state:'SLAMMED_NOT_LOCKED'}])assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{...s.inputs,...patch}}).ok,false);
 }
 for(const code of ['serrurerie.porte_verrouillee.ouverture','serrurerie.porte_verrouillee_ouverture']){
  const started=o.startEstimator({service_hint:code,city_slug:'fes'});if(started.ok){assert.equal(started.session.outcome.outcome_type,'QUOTE_REQUIRED');assert.equal(started.session.outcome.price.amount_mad,null);}else assert.ok(started.error);assert.equal(engine.evaluateFixeoPrice({service_code:code,inputs:{}}).ok,false);
 }
 const session=o.startEstimator({metier_hint:'serrurerie',city_slug:'fes'});assert.ok(session.candidate_services.some(s=>s.service_code==='serrurerie.diagnostic'));
});
test('Public estimator API persists and signs the six exact serrurerie offers; danger and disputed access issue no offer',async()=>{
 const handler=require('../../api/estimator-v1/index'),keys=['FIXEO_ESTIMATOR_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]),oldFetch=global.fetch,calls=[];
 process.env.FIXEO_ESTIMATOR_SECRET='serrurerie-test';process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:false,reason:'test_stop_before_dispatch'})};};
 async function api(body){let status,data;await handler({method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'serrurerie-estimator-test'},body},{setHeader(){},status(s){status=s;return this;},json(v){data=v;return this;},end(){}});return {status,data};}
 try{
  for(const [code,s]of Object.entries(pilot.services)){
   const start=await api({action:'start',entry_context:{service_hint:code,city_slug:'fes',known_inputs:s.inputs}});assert.equal(start.status,200);
   const result=await api({action:'evaluate',session_token:start.data.session.session_token});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.outcome.price.amount_mad,approvedTotals[code]);
   const verified=await api({action:'verify_pricing_context',pricing_context_token:result.data.pricing_context_token});assert.equal(verified.data.amount_mad,approvedTotals[code]);
   const row=calls.at(-1).body;assert.equal(row.service_code,code);assert.equal(row.client_total_minor,approvedTotals[code]*100);assert.equal(row.commission_minor,s.commission_minor);assert.equal(row.materials_minor,s.materials_minor);
   const confirmed=await api({action:'confirm_request',pricing_context_token:result.data.pricing_context_token,client_phone:'0612345678'});assert.equal(confirmed.status,409);assert.equal(calls.at(-1).body.p_offer_id,row.id);assert.equal(calls.at(-1).body.p_amount_mad,approvedTotals[code]);
  }
  const before=calls.length;
  for(const patch of [{fire:true},{locksmith_access_right:'DISPUTED_OR_UNAUTHORIZED'}]){
   const r=await api({action:'start',entry_context:{service_hint:'serrurerie.porte_claquee_ouverture',city_slug:'fes',known_inputs:{...pilot.services['serrurerie.porte_claquee_ouverture'].inputs,...patch}}});
   assert.equal(r.status,200);assert.ok(['SAFETY_STOP','ROUTE_REQUIRED'].includes(r.data.session.state));assert.ok(!r.data.pricing_context_token);
  }
  assert.equal(calls.length,before);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Rendered serrurerie questions, parts and diagnosis use customer language with explicit scope',()=>{
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/serrurerie-pilot-v1.js'),'utf8'));w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8').replace('}());','window.__serrurerieTest={renderQuestion,renderDiagnosticResult};}());'));
  for(const [code,s]of Object.entries(pilot.services)){
   let session=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
   for(const field of Object.keys(s.inputs)){
    const step=o.getNextEstimatorStep(session).step,body=w.__serrurerieTest.renderQuestion(step,()=>{});w.document.body.appendChild(body);
    assert.doesNotMatch(body.textContent,/SERR_|locksmith_work|DECLARED_AUTHORIZED/);
    if(field==='locksmith_work')assert.match(body.textContent,new RegExp(s.scope.slice(0,20)));
    body.remove();session=o.answerEstimatorQuestion(session,step.question_id,s.inputs[field]).session;
   }
   if(code==='serrurerie.diagnostic'){const outcome=o.evaluateEstimator(session).session.outcome;const body=w.__serrurerieTest.renderDiagnosticResult(outcome);assert.match(body.textContent,/220/);assert.match(body.textContent,/seul frais FIXEO/);}
  }
 }finally{dom.window.close();}
});
test('Guest repair API hashes credentials, requires exact consent and maps rejected transitions',async()=>{
 const handler=require('../../api/urgent-request-fn/index'),oldFetch=global.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const calls=[];let reply={ok:true,json:async()=>({current_total_minor:26000,remaining_due_minor:4000})};global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return reply;};
 async function api(body){let status,data;await handler({method:'POST',headers:{},socket:{remoteAddress:'serrurerie-api-test'},body},{setHeader(){},status(n){status=n;return this;},json(p){data=p;return this;}});return {status,data};}
 const body={action:'serrurerie_repair_accept',tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64),proposal_id:'10000000-0000-4000-8000-000000000001',diagnostic_paid_minor:22000,consent_version:'serrurerie-same-visit-v1'};
 try{
  assert.equal((await api({...body,consent_version:null})).status,400);assert.equal(calls.length,0);
  assert.equal((await api({...body,diagnostic_paid_minor:1000})).status,400);assert.equal(calls.length,0);
  const accepted=await api(body);assert.equal(accepted.status,200);assert.equal(accepted.data.repair.remaining_due_minor,4000);
  assert.equal(calls.length,1);assert.match(calls[0].url,/serrurerie_repair_guest_v1$/);assert.notEqual(calls[0].body.p_guest_hash,body.guest_token);assert.equal(calls[0].body.p_action,'accept');assert.equal(calls[0].body.p_expected_paid_minor,22000);
  reply={ok:false,json:async()=>({code:'42501'})};assert.equal((await api(body)).status,404);
  reply={ok:false,json:async()=>({code:'22023'})};assert.equal((await api(body)).status,409);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Guest screen shows a single total and credit; acceptance stays disabled until explicit consent',async()=>{
 const dom=new JSDOM('<article id="card"></article>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],s=pilot.services['serrurerie.porte_claquee_ouverture'];let status='PENDING';
  w.fetch=async(_,opts)=>{const body=JSON.parse(opts.body);calls.push(body);if(body.action==='serrurerie_repair_accept')status='ACCEPTED';return {ok:true,json:async()=>({ok:true,repair:{proposal:{id:'10000000-0000-4000-8000-000000000001',label:s.label,scope:s.scope,client_total_minor:26000,vap_minor:20000,commission_minor:6000,diagnostic_paid_minor:22000,remaining_due_minor:4000,expires_at:new Date(Date.now()+60000).toISOString(),status}}})};};
  w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/serrurerie-pilot-v1.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-serrurerie-repair-ui.js'),'utf8'));
  const card=w.document.getElementById('card');await w.FixeoSerrurerieRepair.mountGuest(card,{service_category:'serrurerie'},{tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64)});
  assert.match(card.textContent,/Total final.*260 DH/);assert.match(card.textContent,/déjà versé.*220 DH/);assert.match(card.textContent,/Reste à payer.*40 DH/);
  const accept=[...card.querySelectorAll('button')].find(b=>b.textContent==='Accepter l’intervention');assert.equal(accept.disabled,true);accept.click();assert.equal(calls.length,1);
  const check=card.querySelector('input');check.checked=true;check.dispatchEvent(new w.Event('change'));accept.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].diagnostic_paid_minor,22000);assert.equal(calls[1].consent_version,'serrurerie-same-visit-v1');assert.match(card.textContent,/Intervention acceptée/);assert.equal(card.querySelector('input'),null);
 }finally{dom.window.close();}
});

function ui(){const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};for(const f of ['data/pricing/engine/serrurerie-pilot-v1.js','js/fixeo-serrurerie-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',f),'utf8'));return dom;}
function click(w,label){const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);b.click();return b;}
const tick=()=>new Promise(r=>setImmediate(r));
test('Artisan verifies access before work, records actual result separately, then can propose a consented diagnostic conversion',async()=>{
 const dom=ui();try{
  const w=dom.window,calls=[],code='serrurerie.diagnostic',state={direct_service_code:code,current_total_minor:22000,can_confirm_prework:true,completion_required:true,prework_confirmed:false,completion_confirmed:false,can_propose:false};
  const sb={rpc:async(name,args)=>{calls.push({name,args});if(name==='serrurerie_prework_artisan_v1')state.prework_confirmed=true;if(name==='serrurerie_completion_artisan_v1'){state.completion_confirmed=true;state.can_propose=true;}return {data:{...state}};}};
  await w.FixeoSerrurerieRepair.openArtisan(sb,'mission');assert.equal(w.document.querySelector('[aria-label="Intervention après diagnostic"]'),null);
  click(w,'Enregistrer les vérifications avant intervention');assert.equal(calls.length,1);
  w.document.querySelectorAll('input').forEach(c=>c.checked=true);click(w,'Enregistrer les vérifications avant intervention');assert.equal(calls.length,1);
  w.document.querySelector('select').value='AUTHORIZED_MANDATE';click(w,'Enregistrer les vérifications avant intervention');await tick();
  assert.equal(calls[1].args.p_access_check_type,'AUTHORIZED_MANDATE');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_professional_checks)),pilot.services[code].professional_checks);
  assert.equal(w.document.querySelector('[aria-label="Intervention après diagnostic"]'),null);
  click(w,'Enregistrer le résultat réalisé');assert.equal(calls.length,2);w.document.querySelectorAll('input').forEach(c=>c.checked=true);click(w,'Enregistrer le résultat réalisé');await tick();assert.equal(calls[2].name,'serrurerie_completion_artisan_v1');
  const select=w.document.querySelector('[aria-label="Intervention après diagnostic"]');assert.deepEqual([...select.options].map(o=>o.value),['',...Object.keys(pilot.services).filter(k=>pilot.services[k].followup)]);
  select.value='serrurerie.cylindre_remplacement.standard';select.dispatchEvent(new w.Event('change'));click(w,'Soumettre au client dans son suivi');assert.equal(calls.length,3);
  w.document.querySelectorAll('input').forEach(c=>c.checked=true);w.document.querySelector('[aria-label="Diagnostic déjà encaissé"]').value='22000';click(w,'Soumettre au client dans son suivi');await tick();
  const args=calls[3].args;assert.equal(args.p_service_code,select.value);assert.equal(args.p_paid_minor,22000);assert.equal(args.p_same_visit,true);assert.match(args.p_proposal_id,/^[a-f0-9-]{36}$/);assert.deepEqual(JSON.parse(JSON.stringify(args.p_professional_checks)),pilot.services[args.p_service_code].professional_checks);
 }finally{dom.window.close();}
});
test('Every fixed locksmith offer requires capability confirmation; missing checks, closing and server errors cannot accept',async()=>{
 const dom=ui();try{
  const w=dom.window,calls=[],code='serrurerie.cylindre_remplacement.standard',s=pilot.services[code];let fail=false;
  const sb={rpc:async(name,args)=>{calls.push({name,args});return fail&&args.p_professional_checks?{error:{message:'unavailable'}}:{data:{service_code:code,scope:s.scope,vap_minor:s.vap_minor,materials_minor:0,commission_minor:6000,client_total_minor:s.total_minor,confirmed:!!args.p_professional_checks}};}};
  const cancelled=w.FixeoSerrurerieRepair.checkOffer(sb,'request');await tick();click(w,'Fermer sans accepter');assert.equal(await cancelled,false);assert.equal(calls.length,1);
  const accepted=w.FixeoSerrurerieRepair.checkOffer(sb,'request');await tick();assert.match(w.document.body.textContent,/Pièce client compatible/);assert.doesNotMatch(w.document.body.textContent,/Fournitures incluses/);
  click(w,'Confirmer le périmètre et poursuivre l’acceptation');assert.equal(calls.length,2);const checks=[...w.document.querySelectorAll('input')];checks.slice(1).forEach(c=>c.checked=true);click(w,'Confirmer le périmètre et poursuivre l’acceptation');assert.equal(calls.length,2);
  checks[0].checked=true;fail=true;click(w,'Confirmer le périmètre et poursuivre l’acceptation');await tick();assert.match(w.document.body.textContent,/Confirmation non enregistrée/);assert.ok(w.document.querySelector('dialog'));
  fail=false;click(w,'Confirmer le périmètre et poursuivre l’acceptation');assert.equal(await accepted,true);assert.equal(w.document.querySelector('dialog'),null);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args.p_professional_checks)),s.offer_checks);
 }finally{dom.window.close();}
});
test('Historical locksmith pricing contexts cannot bypass the current approved offer through a legacy booking endpoint',()=>{
 const {validateFinancialContext}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
 for(const payload of [{service_code:'serrurerie.porte_claquee_ouverture',amount_mad:220},{service_code:'serrurerie.porte_verrouillee.ouverture',amount_mad:380},{service_code:'serrurerie.cylindre_remplacement.standard',amount_mad:280}])assert.throws(()=>validateFinancialContext(payload),/current approved/);
});
