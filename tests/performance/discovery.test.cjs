'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
function setup(){const dom=new JSDOM('<body><button id="entry">Univers</button><textarea id="fxhf-need-input"></textarea><select id="fxhf-location"><option value="Fès">Fès</option></select></body>',{url:'https://www.fixeo.ma',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.matchMedia=()=>({matches:true});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;w.setTimeout(()=>this.dispatchEvent(new w.Event('close')),0);};w.eval(fs.readFileSync(path.join(root,'js/fixeo-cities.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'js/fixeo-discovery-v1.js'),'utf8'));return {dom,w,d:w.document};}
function click(d,text){const b=[...d.querySelectorAll('dialog button')].find(b=>b.textContent===text);assert.ok(b,text);b.click();}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('eight universes offer specific needs; no price or request call before explicit continue',()=>{const {dom,w,d}=setup();try{let calls=0;w.FixeoEstimatorV2={open(){calls++;}};let count=0;for(const key of ['eau','electricite','confort','portes','travaux','installation','entretien','demenagement']){w.FixeoDiscovery.open(key,d.getElementById('entry'));count+=d.querySelectorAll('.fxd-choices button').length-1;assert.ok(d.querySelectorAll('.fxd-choices button').length>=7);click(d,'✕');}assert.ok(count>=60);assert.equal(calls,0);}finally{dom.window.close();}});
test('selected situation and city reach estimator; delayed close cannot unlock estimator',async()=>{const {dom,w,d}=setup();try{let context;w.FixeoEstimatorV2={open(c){context=c;d.body.style.overflow='hidden';return Promise.resolve({accepted:true});}};w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'Fuite sous un évier');click(d,'Continuer avec RAFI →');await tick();assert.equal(context.city,'Fès');assert.equal(context.metier_hint,'plomberie');assert.equal(context.description,'Fuite sous un évier');assert.equal(d.querySelector('dialog').open,false);assert.equal(d.body.style.overflow,'hidden');}finally{dom.window.close();}});
test('back preserves edited text and city; ambiguous situation sends no invented métier',async()=>{const {dom,w,d}=setup();try{let context;w.FixeoEstimatorV2={open(c){context=c;return Promise.resolve({accepted:true});}};w.FixeoDiscovery.open('travaux',d.getElementById('entry'));click(d,'Rénover une cuisine');const input=d.getElementById('fxd-description');input.value='Rénover ma cuisine de 12 m²';input.dispatchEvent(new w.Event('input'));const sel=d.getElementById('fxd-city');sel.value='Rabat';sel.dispatchEvent(new w.Event('change'));click(d,'← Retour aux situations');click(d,'Rénover une cuisine');assert.equal(d.getElementById('fxd-description').value,input.value);assert.equal(d.getElementById('fxd-city').value,'Rabat');click(d,'Continuer avec RAFI →');await tick();assert.equal(context.metier_hint,undefined);assert.equal(context.city,'Rabat');}finally{dom.window.close();}});
test('failed estimator opening retains the form and permits retry',async()=>{const {dom,w,d}=setup();try{w.FixeoEstimatorV2={open:()=>Promise.resolve({accepted:false})};w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');click(d,'Continuer avec RAFI →');await tick();assert.equal(d.querySelector('dialog').open,true);assert.equal(d.getElementById('fxd-description').value,'WC bouché');assert.ok(d.querySelector('.fxd-error').textContent);assert.equal(d.querySelector('.fxd-primary').disabled,false);}finally{dom.window.close();}});
test('free entry allows reaching the microphone without typing; close restores focus',async()=>{const {dom,w,d}=setup();try{const entry=d.getElementById('entry');entry.focus();w.FixeoDiscovery.open('autre',entry);click(d,'✕');assert.equal(d.activeElement,entry);assert.equal(d.body.style.overflow,'');let context;w.FixeoEstimatorV2={open(c){context=c;return Promise.resolve({accepted:true});}};w.FixeoDiscovery.open('autre',entry);click(d,'Continuer avec RAFI →');await tick();assert.equal(context.description,'');assert.equal(context.metier_hint,undefined);}finally{dom.window.close();}});

const waitFor = async predicate => { for(let n=0;n<120;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Expected UI state'); };
test('slug city is canonical, optional precision is collapsed and the same header survives selection/back',()=>{const{w,d}=setup();try{
  d.getElementById('fxhf-location').innerHTML='<option value="fes">Fès</option>';
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));const header=d.querySelector('dialog header');
  click(d,'WC bouché');assert.equal(d.getElementById('fxd-city').value,'Fès');assert.equal(d.getElementById('fxd-description').value,'WC bouché');
  assert.equal(d.querySelector('.fxd-precision').open,false);assert.equal(d.querySelector('dialog header'),header);assert.notEqual(d.activeElement,d.getElementById('fxd-description'));
  click(d,'← Retour aux situations');assert.equal(d.querySelector('dialog header'),header);
}finally{w.close();}});
test('drafts survive back, a different situation, close/reopen and another universe without mixing',()=>{const{w,d}=setup();try{
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');
  const input=d.getElementById('fxd-description');input.value='WC bouché depuis hier';input.dispatchEvent(new w.Event('input'));
  const city=d.getElementById('fxd-city');city.value='Rabat';city.dispatchEvent(new w.Event('change'));
  click(d,'← Retour aux situations');click(d,'Robinet qui fuit');assert.equal(d.getElementById('fxd-description').value,'Robinet qui fuit');
  click(d,'← Retour aux situations');click(d,'WC bouché');assert.equal(d.getElementById('fxd-description').value,'WC bouché depuis hier');click(d,'✕');
  w.FixeoDiscovery.open('portes',d.getElementById('entry'));click(d,'Porte claquée');assert.equal(d.getElementById('fxd-description').value,'Porte claquée');assert.equal(d.getElementById('fxd-city').value,'Rabat');click(d,'✕');
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');assert.equal(d.getElementById('fxd-description').value,'WC bouché depuis hier');
}finally{w.close();}});
test('other need and free entry go directly to canonical RAFI without asking description/city again',async()=>{const{w,d}=setup();try{
  const calls=[];w.FixeoEstimatorV2={open(c){calls.push(c);return Promise.resolve({accepted:true});}};
  d.getElementById('fxhf-need-input').value='Mon besoin déjà écrit';
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'Autre besoin / Je ne sais pas');await tick();
  assert.equal(calls.length,1);assert.equal(calls[0].description,'Mon besoin déjà écrit');assert.equal(calls[0].city,'Fès');assert.equal(calls[0].metier_hint,undefined);assert.equal(d.querySelector('#fxd-description'),null);
  w.FixeoDiscovery.open('autre',d.getElementById('entry'));await tick();assert.equal(calls.length,2);assert.equal(d.querySelector('dialog').open,false);
}finally{w.close();}});
test('closing during the 180ms transition cancels handoff; retry is not left busy',async()=>{const{w,d}=setup();try{
  w.matchMedia=()=>({matches:false});let calls=0;w.FixeoEstimatorV2={open(){calls++;return Promise.resolve({accepted:true});}};
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');click(d,'Continuer avec RAFI →');
  assert.equal(d.querySelector('.fxd-body').inert,true);click(d,'✕');await new Promise(r=>setTimeout(r,200));assert.equal(calls,0);
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');click(d,'Continuer avec RAFI →');await waitFor(()=>calls===1);assert.equal(d.querySelector('dialog').open,false);
}finally{w.close();}});
test('an active Estimation remains the sole owner of its existing user data',()=>{const{w,d}=setup();try{
  let revealed=0;w.FixeoEstimatorV2={isOpen:()=>true,reveal:()=>revealed++,open(){throw Error('Must not replace journey');}};
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));assert.equal(revealed,1);assert.equal(d.querySelector('dialog'),null);
}finally{w.close();}});
test('homepage click lazy loads once and opens the shared launcher',async()=>{const{w,d}=setup();try{
  const section=d.createElement('section');section.id='rafi-discovery';section.innerHTML='<button data-discovery="eau">Plomberie</button><p class="fxd-load-status"></p>';d.body.append(section);
  const actual=w.FixeoDiscovery;delete w.FixeoDiscovery;let loads=0;const append=d.head.append.bind(d.head);
  d.head.append=node=>{append(node);if(node.tagName==='SCRIPT'){loads++;queueMicrotask(()=>{w.FixeoDiscovery=actual;node.onload();});}};
  w.eval(fs.readFileSync(path.join(root,'js/fixeo-home-core.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  section.querySelector('button').click();await tick();assert.equal(d.querySelector('dialog').open,true);click(d,'✕');section.querySelector('button').click();await tick();assert.equal(loads,1);assert.equal(d.querySelector('dialog').dataset.universe,'eau');
}finally{w.close();}});

for(const [key,label,hint] of [['eau','WC bouché','plomberie'],['portes','Porte claquée','serrurerie']]){
 test(`${key}: real Estimation prefills once and continues through the unchanged orchestrator`,async()=>{const{w,d}=setup();try{
  const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');const{normalizeSessionView,normalizeOutcomeView}=require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
  const calls=[];w.FixeoEstimatorConfig={estimatorV2Enabled:true};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.FixeoEstimatorAPI={start:async context=>{calls.push(JSON.parse(JSON.stringify(context)));const r=o.startEstimator(calls.at(-1));assert.equal(r.ok,true);return{ok:true,session:normalizeSessionView(r.session,'fixture-only'),next_step:o.getNextEstimatorStep(r.session).step,outcome:normalizeOutcomeView(r.session)};}};
  w.eval(fs.readFileSync(path.join(root,'js/fixeo-estimator-v2.js'),'utf8'));
  w.FixeoDiscovery.open(key,d.getElementById('entry'));click(d,label);
  const text=d.getElementById('fxd-description');text.value=label+' depuis hier';text.dispatchEvent(new w.Event('input'));
  click(d,'Continuer avec RAFI →');await waitFor(()=>d.getElementById('estimator-need-input'));
  assert.equal(d.querySelectorAll('#fixeo-estimator-v2-root').length,1);assert.equal(d.querySelector('dialog').open,false);
  assert.equal(d.getElementById('estimator-need-input').value,label+' depuis hier');assert.equal(d.getElementById('estimator-city-input').value,'Fès');assert.equal(calls.length,0);
  d.getElementById('cta-primary').click();await waitFor(()=>calls.length===1);assert.equal(calls[0].metier_hint,hint);assert.ok(calls[0].situation_id.startsWith(key+'.'));assert.equal(calls[0].city,'Fès');
  w.FixeoEstimatorV2.close();assert.equal(w.FixeoEstimatorV2.isOpen(),false);
 }finally{w.close();}});
}

// CSS/DOM contracts at the requested widths, not physical Safari rendering.
for(const [width,height] of [[320,568],[360,780],[390,844],[412,915]]){
 test(`launcher ${width}: header, viewport/keyboard, native city, scroll body and safe-area contracts`,()=>{const{w,d}=setup();try{
  w.innerWidth=width;w.innerHeight=height;const vp=new w.EventTarget();vp.height=height;vp.offsetTop=0;w.visualViewport=vp;
  const header=d.createElement('header');header.className='site-header';header.innerHTML='<a>Fixeo</a>';header.getBoundingClientRect=()=>({top:0,bottom:72,height:72});d.body.prepend(header);const original=header.outerHTML;
  const urgent=d.createElement('button');urgent.id='fixeo-urgent-fab';d.body.append(urgent);
  const home=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'));d.body.append(d.importNode(home.window.document.querySelector('.fxd-home'),true));home.window.close();
  const style=d.createElement('style');style.textContent=fs.readFileSync(path.join(root,'css/fixeo-discovery-v1.css'),'utf8');d.head.append(style);
  function active(rules){return [...rules].map(r=>{if(!r.media)return r.cssText;const q=r.media.mediaText;if(/hover:|prefers-reduced-motion/.test(q))return '';const matches=[...q.matchAll(/(max|min)-(width|height):\s*(\d+)px/g)].every(([,bound,axis,limit])=>bound==='max'?(axis==='width'?width:height)<=+limit:(axis==='width'?width:height)>=+limit);return matches?active(r.cssRules):'';}).join('\n');}
  style.textContent=active(style.sheet.cssRules);
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));const dialog=d.querySelector('dialog'),computed=s=>w.getComputedStyle(d.querySelector(s));
  assert.equal(dialog.style.getPropertyValue('--fxd-panel-top'),'72px');assert.equal(dialog.style.getPropertyValue('--fxd-panel-height'),height-72+'px');
  assert.equal(computed('.fxd-home .fxd-grid').gridTemplateColumns,'repeat(2,minmax(0,1fr))');assert.equal(computed('.fxd-home .fxd-card').minWidth,'0');
  assert.equal(computed('.fxd-choices').gridTemplateColumns,'minmax(0,1fr)');assert.equal(computed('.fxd-choices button').minHeight,'49px');assert.equal(computed('.fxd-close').width,'44px');
  assert.equal(computed('.fxd-body').overflow,'auto');assert.equal(computed('.fxd-body').minHeight,'0');assert.equal(computed('#fixeo-urgent-fab').visibility,'hidden');
  click(d,'WC bouché');assert.equal(d.getElementById('fxd-city').tagName,'SELECT');assert.equal(computed('#fxd-city').fontSize,'16px');assert.equal(computed('#fxd-city').minHeight,'44px');
  vp.height=340;vp.offsetTop=0;vp.dispatchEvent(new w.Event('resize'));assert.equal(dialog.dataset.compactViewport,'true');assert.equal(dialog.style.getPropertyValue('--fxd-panel-height'),'268px');
  vp.offsetTop=180;vp.dispatchEvent(new w.Event('scroll'));assert.equal(dialog.style.getPropertyValue('--fxd-panel-top'),'180px');assert.equal(dialog.style.getPropertyValue('--fxd-panel-height'),'340px');
  assert.match(style.textContent,/safe-area-inset-bottom/);assert.equal(header.outerHTML,original);
  dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(dialog.open,false);assert.equal(d.body.classList.contains('fxd-is-open'),false);assert.equal(d.activeElement,d.getElementById('entry'));assert.equal(computed('#fixeo-urgent-fab').visibility,'visible');
 }finally{w.close();}});
}

test('a newer explicit Hero city takes precedence over an older launcher choice',()=>{const{w,d}=setup();try{
  w.FixeoDiscovery.open('eau',d.getElementById('entry'));click(d,'WC bouché');
  const city=d.getElementById('fxd-city');city.value='Rabat';city.dispatchEvent(new w.Event('change'));click(d,'✕');
  d.getElementById('fxhf-location').innerHTML='<option value="casablanca">Casablanca</option>';
  w.FixeoDiscovery.open('portes',d.getElementById('entry'));click(d,'Porte claquée');assert.equal(d.getElementById('fxd-city').value,'Casablanca');
}finally{w.close();}});
