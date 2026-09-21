const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {normalizeOutcomeView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
const {JSDOM}=require('jsdom');

test('Public route view retains only approved destinations and explanation, with legacy string compatibility',()=>{
 const session={outcome:{outcome_type:'ROUTE_REQUIRED',route:{target_service:'climatisation.diagnostic',target_external:'https://unapproved.invalid',message:'Diagnostic avant devis',engine_result:{private:true},token:'private'}}};
 assert.deepEqual(normalizeOutcomeView(session).route,{target_service:'climatisation.diagnostic',target_external:null,message:'Diagnostic avant devis'});
 session.outcome.route.target_service='unknown.diagnostic';assert.equal(normalizeOutcomeView(session).route.target_service,null);
 session.outcome.route='Service hors périmètre';assert.equal(normalizeOutcomeView(session).route,'Service hors périmètre');
 session.outcome.route=null;assert.equal(normalizeOutcomeView(session).route,null);
});

test('Real public API preserves diagnostic and utility routes at start and rejects pricing evaluation of blocked sessions',async()=>{
 const handler=require('../../api/estimator-v1/index'),secret=process.env.FIXEO_ESTIMATOR_SECRET,oldFetch=global.fetch;
 process.env.FIXEO_ESTIMATOR_SECRET='public-route-test';global.fetch=async()=>{throw Error('A blocked route must never persist an offer');};
 async function api(body){let status,data;await handler({method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'public-route-contract'},body},{setHeader(){},status(n){status=n;return this;},json(v){data=v;return this;},end(){}});return {status,data};}
 try{
  const electric=require('../../data/pricing/engine/electricity-pilot-v1'),clim=require('../../data/pricing/engine/climatisation-pilot-v1');
  const cases=[
   ['climatisation.recharge_gaz_r22',{},'climatisation.diagnostic',null],
   ['climatisation.reparation_fuite_recharge',{},'climatisation.diagnostic',null],
   ['climatisation.entretien_annuel',{...clim.services['climatisation.entretien_annuel'].inputs,clim_condition:'CLIM_PROBLEM'},'climatisation.diagnostic',null],
   ['electricite.disjoncteur_remplacement',{...electric.services['electricite.disjoncteur_remplacement'].inputs,electricity_fault:'ELEC_TRIPS_OR_UNKNOWN'},'electricite.diagnostic',null],
   ['electricite.prise_remplacement',{...electric.services['electricite.prise_remplacement'].inputs,electricity_operator:'ELEC_DISTRIBUTOR'},null,'LOCAL_ELECTRICITY_OPERATOR']
  ];
  for(const [code,inputs,target,external] of cases){
   const start=await api({action:'start',entry_context:{service_hint:code,city_slug:'fes',known_inputs:inputs}});assert.equal(start.status,200);
   const evaluated=await api({action:'evaluate',session_token:start.data.session.session_token});assert.equal(evaluated.status,422);
   for(const out of [start.data.session.outcome]){
    assert.equal(out.outcome_type,'ROUTE_REQUIRED');assert.equal(out.route.target_service,target);assert.equal(out.route.target_external,external);assert.ok(out.route.message.length>10);assert.equal(out.price.amount_mad,null);
   }
   assert.ok(!evaluated.data.pricing_context_token);
  }
 }finally{global.fetch=oldFetch;if(secret===undefined)delete process.env.FIXEO_ESTIMATOR_SECRET;else process.env.FIXEO_ESTIMATOR_SECRET=secret;}
});

test('The browser renders the diagnostic explanation from the public API view',()=>{
 const dom=new JSDOM('<button id="cta-primary" disabled></button>',{url:'https://test.invalid',runScripts:'outside-only'});
 try{
  const w=dom.window;w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.eval(fs.readFileSync(path.join(__dirname,'../../js/fixeo-estimator-v2.js'),'utf8').replace('}());','window.__routeTest={renderRouteResult};}());'));
  const out=normalizeOutcomeView({outcome:{outcome_type:'ROUTE_REQUIRED',route:{target_service:'climatisation.diagnostic',message:'La cause doit être identifiée avant un devis.'}}});
  const body=w.__routeTest.renderRouteResult(JSON.parse(JSON.stringify(out)));assert.match(body.textContent,/Diagnostic préalable/);assert.match(body.textContent,/La cause doit être identifiée avant un devis/);
 }finally{dom.window.close();}
});
