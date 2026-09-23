'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('js/fixeo-footer-global.js');
const excluded=new Set(['admin.html','auth.html','artisan.html','confirmation.html','dashboard-artisan.html','dashboard-artisan-v2.html','dashboard-client.html','dashboard-client-v1.html','dashboard-client-v2.html','onboarding-artisan.html','payment-cancel.html','payment-success.html','rafi-v2-preview.html','suivi.html','suivi-demande.html']);
const pages=[...fs.readdirSync(root).filter(p=>p.endsWith('.html')&&!excluded.has(p)),...fs.readdirSync(path.join(root,'blog')).filter(p=>p.endsWith('.html')).map(p=>'blog/'+p)].sort();
function setup(html,page='index.html',width=390){
 const dom=new JSDOM(html,{url:'https://www.fixeo.ma/'+page,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;w.innerWidth=width;
 const changes=[];w.matchMedia=()=>({matches:width>768,addEventListener:(event,fn)=>changes.push(fn),addListener:fn=>changes.push(fn)});
 return {dom,w,d,changes};
}
function key(href){const u=new URL(href,'https://www.fixeo.ma/');return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\.html$/,'').replace(/\/$/,'').replace(/^\/index$/,'')+u.search+u.hash;}
const legacy='footer.fixeo-footer,footer.fixeo-footer-v1,.seo-footer,.seo-footer-card,.blog-index-footer,footer.ssp-footer';

test('every public HTML page loads canonical assets, preserves existing links and mounts one footer',()=>{
 for(const page of pages){const html=read(page),{w,d}=setup(html,page);
  try{
   assert.equal(d.querySelectorAll('script[src*="fixeo-footer-global.js?v=gf5a"]').length,1,page+' JS');
   assert.equal(d.querySelectorAll('link[href*="fixeo-footer-global.css?v=gf5a"]').length,1,page+' CSS');
   const retained=[...d.querySelectorAll(legacy+',nav.seo-authority-links')].flatMap(el=>[...el.querySelectorAll('a[href]')].map(a=>key(a.href)));
   const articleFooters=[...d.querySelectorAll('.blog-article-footer')].map(e=>e.outerHTML);
   w.eval(code);
   const footer=d.querySelector('#fixeo-public-footer');assert.ok(footer,page+' public footer');
   assert.equal(d.querySelectorAll('footer.fxf-canonical').length,1,page+' unique');
   assert.equal(footer.querySelectorAll('details').length,3,page+' groups');
   assert.equal(footer.querySelectorAll('.fxf-trust-row').length,0,page+' no trust cards');
   assert.equal(footer.querySelectorAll('.fxf-local').length,1,page+' local links');
   const hrefs=new Set([...footer.querySelectorAll('a[href]')].map(a=>key(a.href)));
   for(const href of retained)assert.ok(hrefs.has(href),page+' retained '+href);
   assert.deepEqual([...d.querySelectorAll('.blog-article-footer')].map(e=>e.outerHTML),articleFooters,page+' editorial footer unchanged');
   assert.equal(d.querySelectorAll('nav.seo-authority-links').length,0,page+' local links are inside the footer');
   assert.equal([...d.querySelectorAll(legacy)].filter(el=>!el.classList.contains('fxf-canonical')).length,0,page+' no legacy duplicate');
   const first=footer.outerHTML;w.eval(code);assert.equal(d.querySelectorAll('footer.fxf-canonical').length,1,page+' idempotence');assert.equal(footer.outerHTML,first);
  }finally{w.close();}
 }
});

test('native mobile accordions expose their state and desktop links stay available',async()=>{
 const {w,d,changes}=setup('<div id="fxf-mount"></div>');try{
  w.eval(code);
  for(const group of d.querySelectorAll('.fxf-group')){
   const summary=group.querySelector('summary');assert.equal(group.open,false);assert.equal(summary.tabIndex,0);assert.equal(summary.getAttribute('aria-expanded'),'false');
   summary.click();await new Promise(r=>w.setTimeout(r,0));assert.equal(group.open,true);assert.equal(summary.getAttribute('aria-expanded'),'true');
   summary.click();await new Promise(r=>w.setTimeout(r,0));assert.equal(group.open,false);assert.equal(summary.getAttribute('aria-expanded'),'false');
  }
 }finally{w.close();}
 const desktop=setup('<div id="fxf-mount"></div>','index.html',1280);try{desktop.w.eval(code);for(const group of desktop.d.querySelectorAll('.fxf-group')){assert.equal(group.open,true);assert.equal(group.querySelector('summary').tabIndex,-1);assert.ok(group.querySelector('a[href]'));}}finally{desktop.w.close();}
});

test('existing consent preferences open without an extra request; missing consent loads only on demand',async()=>{
 const a=setup('<div id="fxf-mount"></div>');try{let opens=0;a.w.FixeoConsent={open(){opens++;}};a.w.eval(code);a.d.querySelector('.footer-cookie-btn').click();assert.equal(opens,1);assert.equal(a.d.querySelectorAll('script[src*="consent"]').length,0);}finally{a.w.close();}
 const b=setup('<div id="fxf-mount"></div>');try{
  await new Promise(r=>b.w.setTimeout(r,0));b.w.eval(code);assert.equal(b.d.querySelectorAll('script').length,0,'no added startup request');
  const button=b.d.querySelector('.footer-cookie-btn');button.click();button.click();assert.equal(b.d.querySelectorAll('script[src*="consent"]').length,1,'deduplicated load');assert.equal(b.d.querySelectorAll('link[href*="consent"]').length,1);
  b.w.eval(read('js/fixeo-consent-v1.js'));b.d.querySelector('script[src*="consent"]').dispatchEvent(new b.w.Event('load'));
  assert.ok(b.w.FixeoConsent);assert.equal(b.d.querySelector('#fcb-modal-backdrop').hasAttribute('hidden'),false);assert.equal(button.hasAttribute('aria-busy'),false);
  b.d.querySelector('#fcb-modal-close').click();assert.equal(b.d.querySelector('#fcb-modal-backdrop').hasAttribute('hidden'),true);
 }finally{b.w.close();}
 const c=setup('<div id="fxf-mount"></div>');try{c.w.eval(code);const button=c.d.querySelector('.footer-cookie-btn');button.click();c.d.querySelector('script').dispatchEvent(new c.w.Event('error'));assert.match(c.d.querySelector('[role=status]').textContent,/Réessayez/);button.click();assert.equal(c.d.querySelectorAll('script').length,1,'retry remains possible');}finally{c.w.close();}
});

test('protected and application screens do not acquire a public premium footer',()=>{
 for(const page of [...excluded].filter(p=>p!=='artisan.html')){const {w,d}=setup(read(page),page);try{if(d.querySelector('script[src*="fixeo-footer-global"]'))w.eval(code);assert.equal(d.querySelector('#fixeo-public-footer'),null,page);}finally{w.close();}}
});

test('server profile footer is enhanced outside its narrow main and retains its links',()=>{
 const html='<main class="ssp-page"><article><h1>Artisan</h1></article><footer class="ssp-footer"><a href="/nos-garanties">Nos garanties</a></footer></main>';
 const {w,d}=setup(html,'artisan/test-public-profile');try{w.eval(code);assert.ok(d.querySelector('body > #fixeo-public-footer'));assert.equal(d.querySelectorAll('main footer').length,0);assert.ok(d.querySelector('.fxf-related a[href="/nos-garanties"]'));assert.equal(d.querySelector('main article h1').textContent,'Artisan');}finally{w.close();}
});

for(const width of [320,360,390,412,1280])test(`footer ${width}: fluid layout, touch targets, focus, local links and safe area`,()=>{
 const {w,d}=setup('<div id="fxf-mount"></div>','index.html',width);try{
  w.eval(code);
  function active(rules){return [...rules].map(r=>{if(!r.media)return r.cssText;const q=r.media.mediaText;if(q.includes('prefers-reduced-motion'))return '';const ok=[...q.matchAll(/(max|min)-width:\s*(\d+)px/g)].every(([,bound,n])=>bound==='max'?width<=+n:width>=+n);return ok?active(r.cssRules):'';}).join('\n');}
  for (const file of ['css/main.css', 'css/homepage-v13.css', 'css/homepage-bottom-v1.css', 'css/fixeo-footer-global.css']) {
   const style=d.createElement('style');style.textContent=read(file);d.head.append(style);style.textContent=active(style.sheet.cssRules);
  }
  const css=s=>w.getComputedStyle(d.querySelector(s));
  assert.equal(css('#fixeo-public-footer').overflow,'visible');assert.equal(css('#fixeo-public-footer').paddingRight,'24px');assert.equal(css('.fxf-shell').padding,'0px');assert.equal(css('.fxf-shell').width,'100%');
  if(width<=768){assert.equal(css('.fxf-grid').gridTemplateColumns,'minmax(0, 1fr)');assert.equal(css('.fxf-group-heading').minHeight,'48px');for(const sel of ['.fxf-links a','.fxf-legal-links a','.footer-cookie-btn','.fxf-local a'])assert.equal(css(sel).minHeight,'44px');assert.equal(css('.fxf-local ul').gridTemplateColumns,'repeat(2, minmax(0, 1fr))');assert.equal(css('.fxf-bottom').paddingBottom,'16px');}
  assert.equal(css('.fxf-logo').height,'32px');assert.equal(css('.fxf-desc').fontSize,'13px');
  const raw=read('css/fixeo-footer-global.css');assert.match(raw,/#fixeo-public-footer[^]*safe-area-inset-bottom/);assert.match(raw,/:focus-visible/);assert.match(raw,/@media \(prefers-reduced-motion: reduce\)/);
 }finally{w.close();}
});
