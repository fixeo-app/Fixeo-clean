'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..');

// Run the actual homepage scripts against a DOM, with all network effects mocked.
// This is not a browser rendering, Web Vitals or live-backend test.
test('homepage boots without marketplace and preserves current entry points',async()=>{
 const requests=[],errors=[],scripts=[];
 class Assets extends ResourceLoader {
  fetch(url){
   const pathname=new URL(url).pathname;
   if(pathname.endsWith('.css'))return Promise.resolve(Buffer.from(''));
   if(pathname.endsWith('.js')){
    scripts.push(pathname);
    let file=path.join(root,pathname);
    if(!fs.existsSync(file) && process.env.FIXEO_TEST_ASSET_DIR)
     file=path.join(process.env.FIXEO_TEST_ASSET_DIR,path.basename(pathname));
    if(fs.existsSync(file))return Promise.resolve(fs.readFileSync(file));
   }
   return null;
  }
 }
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
  url:'https://www.fixeo.ma/',resources:new Assets(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){
   w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
   w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){},removeEventListener(){}});
   w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
   w.fetch=async url=>{requests.push(String(url));return {ok:true,json:async()=>({}),text:async()=>''}};
   const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
   w.supabase={createClient:()=>({auth})};
   w.localStorage.setItem('fixeo_admin_artisans_v21',JSON.stringify([{id:'stale-artisan',name:'Old cached record'}]));
  }
 });
 try {
  await new Promise(resolve=>setTimeout(resolve,3500));
  const w=dom.window,d=w.document;
  assert.deepEqual(errors,[],'no uncaught startup errors');
  assert.equal(d.querySelectorAll('#artisans-section,#request-modal,#artisan-modal,#top-artisans,#secondary-search-section').length,0);
  assert.ok(d.querySelector('footer.fxf-canonical'),'canonical full footer mounts');
  assert.ok(d.querySelector('footer a[href*="artisans"]'),'directory remains accessible');
  assert.ok(d.getElementById('fxhf-need-input'),'current hero mounts');
  assert.equal(w.FixeoDB,undefined,'no local artisan database bootstrap');
  assert.equal(w.FixeoSupabaseLoader,undefined,'no global Supabase artisan loader');
  assert.equal(w.searchEngine,undefined,'no legacy search engine');
  assert.equal(scripts.some(p=>/\/(reservation|payment|slot-lock|cod-payment)(?:-v2)?\.js$/.test(p)),false,'no idle reservation preload');
  assert.equal(requests.some(u=>/artisans|marketplace/.test(u)),false);

  // A microphone recognition update selects a métier without opening any dialog.
  assert.equal(w.FixeoSelectServiceCategory('electricite'),true);
  assert.equal(d.querySelector('#services [data-category="electricite"]').getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelectorAll('.fxrf4-overlay').length,0);

  w.QuickSearchModal.focusInline();
  assert.equal(d.activeElement.id,'fxhf-need-input','header focuses visible current hero');

  // User métier selection opens the existing RAFI flow with explicit city context.
  const city=d.getElementById('fxhf-location');city.value='Rabat';
  let received;const originalOpen=w.FixeoRequestFlowV4.open;
  w.FixeoRequestFlowV4.open=opts=>{received=opts;};
  d.querySelector('#services button[data-category="plomberie"]').click();
  assert.equal(received.prefillCity,'Rabat');assert.equal(received.prefillService,'plomberie');
  w.FixeoRequestFlowV4.open=originalOpen;
  originalOpen(received);
  assert.ok(d.querySelector('.fxrf4-chip.is-selected'),'actual request UI recognises the métier');
  w.FixeoRequestFlowV4.close();

  // Estimate gateway carries the visible description instead of hidden legacy text.
  let estimate;w.FixeoEstimatorV2.open=opts=>{estimate=opts;};
  w.sessionStorage.setItem('fxrf4_trusted_city_session','Rabat');
  d.getElementById('fxhf-need-input').value='Une fuite sous mon évier';
  d.getElementById('fxes-open-estimator').click();
  assert.equal(estimate.description,'Une fuite sous mon évier');assert.equal(estimate.city,'Rabat');
  assert.deepEqual(errors,[],'no interaction errors');
 } finally {dom.window.close();}
});
