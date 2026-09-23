'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'../..');
function setup(){const dom=new JSDOM(fs.readFileSync(path.join(root,'services.html'),'utf8'),{url:'https://www.fixeo.ma/services.html',runScripts:'outside-only'});const w=dom.window;w.matchMedia=()=>({matches:true});w.eval(fs.readFileSync(path.join(root,'js/fixeo-cities.js'),'utf8'));return{dom,w,d:w.document};}
const tick=()=>new Promise(r=>setTimeout(r,15));
test('services loads no artisan or estimation stack at startup and exposes the same universes',()=>{const{dom,w,d}=setup();try{w.eval(fs.readFileSync(path.join(root,'js/fixeo-services-page-v2.js'),'utf8'));const home=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'));assert.deepEqual([...d.querySelectorAll('.fxd-card')].map(n=>n.dataset.discovery),[...home.window.document.querySelectorAll('.fxd-card')].map(n=>n.dataset.discovery));home.window.close();assert.ok(d.querySelector('script[src*="fixeo-footer-global"]'));assert.equal([...d.scripts].some(s=>/estimator|discovery-v1|supabase-loader|reservation\.js/.test(s.src)),false);assert.equal(d.querySelectorAll('h1').length,1);}finally{w.close();}});
test('services retries failed lazy loading and forwards a valid saved city to the shared dialog',async()=>{const{w,d}=setup();try{const requested=[];let fail=true,context;const append=d.head.append.bind(d.head);d.head.append=function(node){append(node);if(node.tagName==='SCRIPT'){requested.push(node.src);queueMicrotask(()=>{if(fail){fail=false;node.onerror();}else node.onload();});}};w.FixeoDiscovery={open(...args){context=args;}};w.sessionStorage.setItem('fxrf4_trusted_city_session','Rabat');w.eval(fs.readFileSync(path.join(root,'js/fixeo-services-page-v2.js'),'utf8'));const trigger=d.querySelector('[data-discovery="eau"]');trigger.click();await tick();assert.equal(trigger.disabled,false);assert.match(d.getElementById('services-status').textContent,/Réessayez/);trigger.click();await tick();assert.equal(context[0],'eau');assert.equal(context[2].city,'Rabat');assert.equal(context[2].source,'services_discovery');const before=requested.length;trigger.click();await tick();assert.equal(requested.length,before);}finally{w.close();}});
test('shared dialog forwards Services context, situation and city into RAFI',async()=>{const{w,d}=setup();try{w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.eval(fs.readFileSync(path.join(root,'js/fixeo-discovery-v1.js'),'utf8'));let context;w.FixeoEstimatorV2={open(c){context=c;return Promise.resolve({accepted:true});}};w.FixeoDiscovery.open('portes',d.querySelector('[data-discovery="portes"]'),{source:'services_discovery',city:'Rabat'});[...d.querySelectorAll('.fxd-choices button')].find(b=>b.textContent==='Porte claquée').click();d.querySelector('.fxd-primary').click();await tick();assert.equal(context.source,'services_discovery');assert.equal(context.city,'Rabat');assert.equal(context.description,'Porte claquée');assert.equal(context.metier_hint,'serrurerie');}finally{w.close();}});

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const until = async predicate => { for (let n=0;n<100;n++) { if (predicate()) return; await tick(); } throw Error('UI state not reached'); };
function journeys(t) {
  const dom = new JSDOM(read('services.html'), {url:'https://www.fixeo.ma/services.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,loads=[],requests=[],observers=[];
  const Observer=w.MutationObserver;
  w.MutationObserver=class extends Observer{constructor(callback){super(callback);observers.push(this);}};
  t.after(()=>{observers.forEach(observer=>observer.disconnect());w.close();});
  w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=async (url,options={})=>{
    requests.push({url,options});
    if(url==='/api/diagnostic-v1'&&!options.method)return {ok:true,json:async()=>({enabled:true})};
    if(url==='/api/estimator-v1'){
      const body=JSON.parse(options.body);assert.equal(body.action,'start');
      const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
      const {normalizeSessionView,normalizeOutcomeView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
      const result=o.startEstimator(body.entry_context);assert.equal(result.ok,true);
      return {ok:true,json:async()=>({ok:true,session:normalizeSessionView(result.session,'fixture-only'),next_step:o.getNextEstimatorStep(result.session).step,outcome:normalizeOutcomeView(result.session)})};
    }
    throw Error('Unexpected request: '+url);
  };
  function append(parent,method){const original=parent[method].bind(parent);parent[method]=node=>{
    original(node);if(node.tagName==='SCRIPT')queueMicrotask(()=>{
      const file=new URL(node.src).pathname.slice(1);loads.push(file);
      try{w.eval(read(file));node.onload?.();}catch(error){node.onerror?.(error);}
    });return node;
  };}
  append(d.head,'append');append(d.head,'appendChild');
  w.eval(read('js/fixeo-cities.js'));w.eval(read('js/fixeo-services-page-v2.js'));
  return {w,d,loads,requests};
}

test('Services keeps the exact Homepage universe component and a single editorial page',t=>{
  const {w,d}=journeys(t);const home=new JSDOM(read('index.html'));t.after(()=>home.window.close());
  assert.equal(d.querySelector('.fxd-home .fxd-grid').outerHTML,home.window.document.querySelector('.fxd-home .fxd-grid').outerHTML);
  assert.equal(home.window.document.querySelector('.fxd-bottom a[href="services.html"]'),null,'no redundant catalogue link after the Homepage universes');
  assert.equal(d.querySelector('.fxs-primary').hash,'#rafi-discovery');
  assert.equal(d.querySelectorAll('main form,main dialog').length,0);
  assert.equal(d.querySelectorAll('.fxs-preview,.fxd-open').length,0);
  assert.equal(d.querySelectorAll('.fxs-results article').length,4);
  assert.equal(d.querySelectorAll('.fxs-results button,.fxs-results a').length,0,'Outcomes explain; they do not start new flows');
  assert.deepEqual([...d.querySelectorAll('.fxs-results h3')].map(n=>n.textContent),['Prix FIXEO','Diagnostic','Devis','Orientation']);
  assert.match(d.querySelector('.fxs-outcomes .fxs-note').textContent,/ne confirme ni un prix ni la disponibilité/);
  for(const details of d.querySelectorAll('.fxs-faq details')){
    details.querySelector('summary').click();assert.equal(details.open,true);
    details.querySelector('summary').click();assert.equal(details.open,false);
  }
  assert.equal(d.querySelectorAll('script[src*="diagnostic"],script[src*="estimator"]').length,0);
  w.eval(read('js/fixeo-footer-global.js'));
  assert.equal(d.querySelectorAll('.fxf-canonical').length,1);
  assert.equal(d.querySelectorAll('#fixeo-public-footer').length,1);
  assert.equal(d.querySelectorAll('.fxf-trust-badge').length,0);
  assert.equal(d.querySelectorAll('#fixeo-public-footer .fxf-group').length,3);
  assert.ok(d.querySelector('.fxf-logo'));
});

for(const [key,situation] of [['eau','Fuite sous un évier'],['electricite','Prise qui ne fonctionne plus'],['confort',null],['portes','Porte claquée'],['travaux','Rénover une cuisine'],['installation',null],['entretien',null],['demenagement',null]]){
 test(`Services ${key}: real launcher and Estimation share one prefilled journey`,async t=>{
  const {w,d,loads,requests}=journeys(t);w.sessionStorage.setItem('fxrf4_trusted_city_session','Rabat');
  d.querySelector('.fxd-card[data-discovery="'+key+'"]').click();
  await until(()=>d.querySelector('.fxd-choices button'));
  const choices=[...d.querySelectorAll('.fxd-choices button')];
  const choice=choices.find(b=>b.textContent===situation)||choices[0];const description=choice.textContent;
  choice.click();assert.equal(d.querySelector('#fxd-description').value,description);
  d.querySelector('.fxd-primary').click();await until(()=>d.querySelector('#estimator-need-input'));
  assert.equal(d.querySelector('#estimator-need-input').value,description);
  assert.equal(d.querySelector('#estimator-city-input').value,'Rabat');
  assert.equal(d.querySelectorAll('#fixeo-estimator-v2-root').length,1);
  assert.equal(d.querySelector('#fxd-launcher').open,false);
  assert.equal(requests.length,0,'Opening never submits an intervention');
  d.querySelector('#cta-primary').click();await until(()=>requests.length===1);
  const body=JSON.parse(requests[0].options.body);assert.equal(body.entry_context.source,'services_discovery');
  assert.equal(body.entry_context.description,description);assert.ok(body.entry_context.situation_id.startsWith(key+'.'));
  assert.equal(loads.filter(f=>f==='js/fixeo-discovery-v1.js').length,1);
  assert.equal(loads.filter(f=>f==='js/fixeo-estimator-v2.js').length,1);
  assert.equal(loads.some(f=>f.includes('diagnostic')),false);
  w.FixeoEstimatorV2.close();assert.equal(w.FixeoEstimatorV2.isOpen(),false);
 });
}

test('Hero, repair and final free CTAs reopen the same canonical Estimation; project keeps its universe',async t=>{
 const {w,d,loads,requests}=journeys(t);
 for(const selector of ['.fxs-secondary','.fxs-pair [data-discovery="autre"]','.fxs-final [data-discovery]']){
   d.querySelector(selector).click();await until(()=>w.FixeoEstimatorV2?.isOpen());
   assert.equal(d.querySelectorAll('#fixeo-estimator-v2-root').length,1);assert.equal(d.querySelector('#fxd-description'),null);
   w.FixeoEstimatorV2.close();await tick();
 }
 d.querySelector('.fxs-pair [data-discovery="travaux"]').click();await until(()=>d.querySelector('.fxd-choices button'));
 assert.equal(d.querySelector('#fxd-launcher').dataset.universe,'travaux');
 assert.equal(requests.length,0);assert.equal(loads.filter(f=>f==='js/fixeo-estimator-v2.js').length,1);
});

test('Diagnostic CTA uses the canonical bootstrap/modal, preserves draft and does not load Estimation',async t=>{
 const {w,d,loads,requests}=journeys(t);const trigger=d.querySelector('[data-services-diagnostic]');
 w.sessionStorage.setItem('fxrf4_trusted_city_session','Rabat');trigger.focus();trigger.click();trigger.click();
 await until(()=>d.querySelector('#fxdiag-description'));
 assert.equal(d.querySelectorAll('#fxdiag-dialog').length,1);assert.equal(d.querySelector('#fxdiag-city').value,'rabat');
 const input=d.querySelector('#fxdiag-description');input.value='Une trace sous mon lavabo';input.dispatchEvent(new w.Event('input'));
 const consent=d.querySelector('#fxdiag-consent');consent.checked=true;consent.dispatchEvent(new w.Event('change'));
 d.querySelector('#fxdiag-next').click();await tick();assert.ok(d.querySelector('.fxdiag-hazards'));
 d.querySelector('.fxdiag-close').click();await tick();assert.equal(d.activeElement,trigger);
 trigger.click();await until(()=>d.querySelector('#fxdiag-dialog').open);d.querySelector('#fxdiag-back').click();await tick();
 assert.equal(d.querySelector('#fxdiag-description').value,'Une trace sous mon lavabo');
 assert.equal(loads.filter(f=>f==='js/fixeo-diagnostic-modal-v1.js').length,1);
 assert.equal(loads.some(f=>/estimator|discovery-v1/.test(f)),false);
 assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined);
});

test('Diagnostic network failure is recoverable and never diverts the user into Estimation',async t=>{
 const {w,d}=journeys(t);let enabled=false,calls=0;
 w.fetch=async()=>{calls++;return {ok:enabled,json:async()=>({enabled:true})};};
 const trigger=d.querySelector('[data-services-diagnostic]');trigger.click();
 await until(()=>d.querySelector('#services-status').textContent.includes('Réessayez'));
 assert.equal(trigger.disabled,false);assert.equal(d.querySelector('#fixeo-estimator-v2-root'),null);
 enabled=true;trigger.click();await until(()=>d.querySelector('#fxdiag-dialog')?.open);
 assert.equal(calls,2);assert.equal(d.querySelector('#services-status').textContent,'');
});

// CSS/DOM contracts at these widths; physical Safari validation follows deployment.
for(const width of [320,360,390,412])test(`Services ${width}: responsive grids, touch targets, FAQ, footer and safe-area`,t=>{
 const {w,d}=journeys(t);w.innerWidth=width;w.eval(read('js/fixeo-footer-global.js'));
 function active(rules){return [...rules].map(rule=>{
   if(!rule.media)return rule.cssText;
   const q=rule.media.mediaText;if(/hover:|prefers-reduced-motion/.test(q))return '';
   const matches=[...q.matchAll(/(max|min)-width:\s*(\d+)px/g)].every(([,bound,limit])=>bound==='max'?width<=+limit:width>=+limit);
   return matches?active(rule.cssRules):'';
 }).join('\n');}
 for(const file of ['css/variables.css','css/main.css','css/fixeo-footer-global.css','css/fixeo-discovery-v1.css','css/fixeo-services-page-v2.css']){
   const style=d.createElement('style');style.textContent=read(file);d.head.append(style);style.textContent=active(style.sheet.cssRules);
 }
 const css=selector=>w.getComputedStyle(d.querySelector(selector));
 assert.equal(css('.fxd-grid').gridTemplateColumns,'repeat(2,minmax(0,1fr))');
 assert.equal(css('.fxd-card').minHeight,'170px');assert.equal(css('.fxd-card').minWidth,'0');
 assert.equal(css('.fxd-explore').marginTop,'auto');assert.equal(css('.fxd-explore').whiteSpace,'nowrap');
 assert.equal(css('.fxs-pair').gridTemplateColumns,'minmax(0,1fr)');
 assert.equal(css('.fxs-results').gridTemplateColumns,'repeat(2,minmax(0,1fr))');
 assert.equal(css('.fxs-primary').minHeight,'54px');assert.equal(css('.fxs-text').minHeight,'44px');
 assert.equal(css('.fxs-final .fxs-primary').minWidth,'0');assert.equal(css('.fxs-final .fxs-primary').width,'100%');
 assert.equal(css('.fxs-faq summary').minHeight,'56px');assert.equal(css('.fxs-hero h1').fontWeight,'700');
 assert.equal(d.querySelectorAll('#fixeo-public-footer .fxf-trust-badge').length,0,'canonical footer stays free of trust chips');
 assert.ok(d.querySelector('#fixeo-public-footer .fxf-local'),'local navigation remains available');
 assert.match(read('css/fixeo-services-page-v2.css'),/safe-area-inset-bottom/);
 assert.match(d.querySelector('meta[name=viewport]').content,/viewport-fit=cover/);
 assert.match(read('css/fixeo-services-page-v2.css'),/prefers-reduced-motion:reduce/);
 for(const details of d.querySelectorAll('.fxs-faq details')){details.querySelector('summary').click();assert.equal(details.open,true);}
 // Services has no Urgence/WhatsApp floating controls: these remain Homepage-only.
 assert.equal(d.querySelectorAll('#fixeo-urgent-fab,.chat-fab,#fixeo-whatsapp-fab').length,0);
 assert.equal(d.querySelector('.fxs-final button').disabled,false);
});
