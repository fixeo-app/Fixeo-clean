const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),pilot=require('../../data/pricing/engine/plumbing-pilot-v1');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1'),engine=require('../../data/pricing/engine/pricing-engine-core-v1');
const {selectTariff,attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
const entries=catalogue.entries.filter(e=>e.catalogue_version===pilot.version);
test('6 approved services across 20 cities: exact prices and strict qualification without legacy fallback',async()=>{
 assert.equal(entries.length,120);assert.equal(new Set(entries.map(e=>e.city_slug)).size,20);
 for(const entry of entries){
  const service=pilot.services[entry.service_code];let session=o.startEstimator({service_hint:entry.service_code,city_slug:entry.city_slug}).session;
  for(const field of Object.keys(service.inputs)){const step=o.getNextEstimatorStep(session).step;assert.equal(step.input_id,field);session=o.answerEstimatorQuestion(session,step.question_id,service.inputs[field]).session;}
  session=o.evaluateEstimator(session).session;assert.equal(session.outcome.price.amount_mad,service.total_minor/100);assert.equal(selectTariff(session),entry);
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
test('Rendered plumbing questions, parts and diagnosis use customer language with explicit scope',()=>{
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8').replace('}());','window.__plumbingTest={renderQuestion,renderDiagnosticResult};}());'));
  for(const [code,s]of Object.entries(pilot.services)){
   let session=o.startEstimator({service_hint:code,city_slug:'rabat'}).session;
   for(const field of Object.keys(s.inputs)){
    const step=o.getNextEstimatorStep(session).step,body=w.__plumbingTest.renderQuestion(step,()=>{});w.document.body.appendChild(body);
    assert.doesNotMatch(body.textContent,/PLUMB_|LOCAL_ACCESSIBLE|plumbing_work/);
    if(field==='plumbing_work')assert.match(body.textContent,new RegExp(s.scope.slice(0,20)));
    if(field==='plumbing_parts')assert.match(body.textContent,/pièce neuve compatible/);
    body.remove();session=o.answerEstimatorQuestion(session,step.question_id,s.inputs[field]).session;
   }
   if(code==='plomberie.diagnostic'){const outcome=o.evaluateEstimator(session).session.outcome;const body=w.__plumbingTest.renderDiagnosticResult(outcome);assert.match(body.textContent,/220/);assert.match(body.textContent,/seul frais FIXEO/);}
  }
 }finally{dom.window.close();}
});
test('Guest repair API hashes credentials, requires exact consent and maps rejected transitions',async()=>{
 const handler=require('../../api/urgent-request-fn/index'),oldFetch=global.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],old=keys.map(k=>process.env[k]);
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const calls=[];let reply={ok:true,json:async()=>({current_total_minor:28000,remaining_due_minor:6000})};global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return reply;};
 async function api(body){let status,data;await handler({method:'POST',headers:{},socket:{remoteAddress:'plumbing-api-test'},body},{setHeader(){},status(n){status=n;return this;},json(p){data=p;return this;}});return {status,data};}
 const body={action:'plumbing_repair_accept',tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64),proposal_id:'10000000-0000-4000-8000-000000000001',diagnostic_paid_minor:22000,consent_version:'plumbing-same-visit-v1'};
 try{
  assert.equal((await api({...body,consent_version:null})).status,400);assert.equal(calls.length,0);
  assert.equal((await api({...body,diagnostic_paid_minor:1000})).status,400);assert.equal(calls.length,0);
  const accepted=await api(body);assert.equal(accepted.status,200);assert.equal(accepted.data.repair.remaining_due_minor,6000);
  assert.equal(calls.length,1);assert.match(calls[0].url,/plumbing_repair_guest_v1$/);assert.notEqual(calls[0].body.p_guest_hash,body.guest_token);assert.equal(calls[0].body.p_action,'accept');assert.equal(calls[0].body.p_expected_paid_minor,22000);
  reply={ok:false,json:async()=>({code:'42501'})};assert.equal((await api(body)).status,404);
  reply={ok:false,json:async()=>({code:'22023'})};assert.equal((await api(body)).status,409);
 }finally{global.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
test('Guest screen shows a single total and credit; acceptance stays disabled until explicit consent',async()=>{
 const dom=new JSDOM('<article id="card"></article>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[],s=pilot.services['plomberie.fuite_simple'];let status='PENDING';
  w.fetch=async(_,opts)=>{const body=JSON.parse(opts.body);calls.push(body);if(body.action==='plumbing_repair_accept')status='ACCEPTED';return {ok:true,json:async()=>({ok:true,repair:{proposal:{id:'10000000-0000-4000-8000-000000000001',label:s.label,scope:s.scope,client_total_minor:28000,vap_minor:22000,commission_minor:6000,diagnostic_paid_minor:22000,remaining_due_minor:6000,expires_at:new Date(Date.now()+60000).toISOString(),status}}})};};
  w.eval(fs.readFileSync(path.join(__dirname,'../../data/pricing/engine/plumbing-pilot-v1.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-plumbing-repair-ui.js'),'utf8'));
  const card=w.document.getElementById('card');await w.FixeoPlumbingRepair.mountGuest(card,{service_category:'plomberie'},{tracking_ref:'FX-TEST1234',guest_token:'a'.repeat(64)});
  assert.match(card.textContent,/Total final.*280 DH/);assert.match(card.textContent,/déjà versé.*220 DH/);assert.match(card.textContent,/Reste à payer.*60 DH/);
  const accept=[...card.querySelectorAll('button')].find(b=>b.textContent==='Accepter la réparation');assert.equal(accept.disabled,true);accept.click();assert.equal(calls.length,1);
  const check=card.querySelector('input');check.checked=true;check.dispatchEvent(new w.Event('change'));accept.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].diagnostic_paid_minor,22000);assert.equal(calls[1].consent_version,'plumbing-same-visit-v1');assert.match(card.textContent,/Réparation acceptée/);assert.equal(card.querySelector('input'),null);
 }finally{dom.window.close();}
});
test('Artisan form sends the selected repair, checked scope, declared cash credit and stable proposal identity',async()=>{
 const dom=new JSDOM('',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[];w.HTMLDialogElement.prototype.showModal=function(){};w.HTMLDialogElement.prototype.close=function(){};
  for(const file of ['data/pricing/engine/plumbing-pilot-v1.js','js/fixeo-plumbing-repair-ui.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../',file),'utf8'));
  const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:{can_propose:true,proposal:null}};}};
  await w.FixeoPlumbingRepair.openArtisan(sb,'10000000-0000-4000-8000-000000000001');
  const select=w.document.querySelector('select');select.value='plomberie.chasse_eau';select.dispatchEvent(new w.Event('change'));
  let send=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Soumettre au client dans son suivi');send.click();assert.equal(calls.length,1);
  w.document.querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=true;});w.document.querySelector('[aria-label="Diagnostic déjà encaissé"]').value='22000';send.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.equal(calls[1].args.p_same_visit,true);assert.equal(calls[1].args.p_paid_minor,22000);assert.equal(calls[1].args.p_service_code,'plomberie.chasse_eau');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args.p_inputs)),pilot.services['plomberie.chasse_eau'].inputs);assert.match(calls[1].args.p_proposal_id,/^[a-f0-9-]{36}$/);
 }finally{dom.window.close();}
});
test('Artisan financial center uses the recorded fee: repair retention 220/270, diagnostic 160, no second diagnostic revenue',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../js/fixeo-artisan-cockpit-v1.js'),'utf8');
 const fn=src.slice(src.indexOf('  function _computeFinancials('),src.indexOf('  function _renderFinancialCenter('));
 const rows=[{status:'validated',pricing_offer_id:'offer',agreed_price:280,final_price:280,commission_amount:60},{status:'validated',pricing_offer_id:'offer',agreed_price:330,final_price:330,commission_amount:60},{status:'completed',pricing_offer_id:'offer',agreed_price:220,commission_amount:60}];
 const vm=require('node:vm'),ctx={rows};vm.runInNewContext(fn+'result=_computeFinancials(rows);',ctx);assert.equal(ctx.result.knownRevenue,490);assert.equal(ctx.result.pendingRevenue,160);
 const missing={rows:[{status:'validated',pricing_offer_id:'offer',agreed_price:280,commission_amount:null}]};vm.runInNewContext(fn+'result=_computeFinancials(rows);',missing);assert.equal(missing.result.knownRevenue,null);
});
