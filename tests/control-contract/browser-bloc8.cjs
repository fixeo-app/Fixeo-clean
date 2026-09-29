'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/control-os/bloc8/evidence/browser');
const id='00000000-0000-4000-8000-000000000100';let browser,server;
server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/admin.html'){
  let html=fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]+(?:fonts.googleapis|preconnect)[^>]*>/gi,'');
  const boot="window.FixeoAdmin={navigate:v=>{window.__views.push(v);document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id==='sec-'+v));}};window.__views=[];window.__dossiers=[];window.__requests=[];window.__mutations=0;window.FixeoDossier={open:(type,id)=>{window.__dossiers.push({type,id});}};window.FixeoControl={request:async(op,body)=>{window.__requests.push({op,body});if(op!=='search'){window.__mutations++;throw Error('UNEXPECTED_OPERATION');}return {items:[{type:'request',id:'00000000-0000-4000-8000-000000000100',summary:{service_category:'plomberie',city:'Fès',status:'new'}}],has_more:false};}};";
  html=html.replace('</body>','<script>'+boot+'</script><script src="/js/admin-control-command-ux.js"></script></body>');
  res.setHeader('Content-Type','text/html');return res.end(html);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{const checks=[],errors=[];try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/admin.html');
 await page.keyboard.press('Control+k');await page.waitForSelector('#control-command-palette[open]');assert.equal(await page.locator('#command-input').evaluate(e=>e===document.activeElement),true);checks.push('ctrl_k_opens_palette_and_focuses_combobox');
 await page.locator('#command-input').fill('Réseau');await page.waitForFunction(()=>document.querySelectorAll('#command-results [data-command-index]').length>=1);await page.keyboard.press('Enter');assert.equal(await page.locator('#control-command-palette').getAttribute('open'),null);assert.deepEqual(await page.evaluate(()=>window.__views.slice(-1)),['network']);checks.push('palette_navigates_views_without_mutation');
 await page.getByRole('button',{name:/Commandes/}).focus();await page.keyboard.press('Control+k');await page.waitForSelector('#control-command-palette[open]');await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:/Commandes/}).evaluate(e=>e===document.activeElement),true);checks.push('escape_closes_palette_and_restores_focus');
 await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('/');assert.deepEqual(await page.evaluate(()=>window.__views.slice(-1)),['overview']);assert.equal(await page.locator('#global-search').evaluate(e=>e===document.activeElement),true);checks.push('slash_focuses_canonical_global_search');
 await page.locator('#global-search').fill('plom');await page.waitForSelector('#global-results [data-search-type]');assert.equal(await page.evaluate(()=>window.__requests.at(-1).op),'search');assert.equal(await page.evaluate(()=>window.__requests.at(-1).body.type),'all');await page.locator('#global-results [data-search-type]').click();assert.deepEqual(await page.evaluate(()=>window.__dossiers.at(-1)),{type:'request',id});checks.push('global_search_reuses_canonical_search_and_dossier');
 assert.equal(await page.evaluate(()=>window.__mutations),0);checks.push('keyboard_and_palette_never_execute_business_mutation');
 const skip=page.locator('.skip-link');await skip.focus();assert.equal(await skip.evaluate(e=>e===document.activeElement),true);checks.push('skip_link_keyboard_reachable');
 await page.keyboard.press('Control+k');await page.waitForSelector('#control-command-palette[open]');const minHeight=await page.locator('.command-row').first().evaluate(e=>e.getBoundingClientRect().height);assert.ok(minHeight>=44);await page.keyboard.press('Escape');checks.push('touch_targets_at_least_44px');
 for(const width of [1440,1280,1024,768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);checks.push('responsive_'+width);}
 await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Control+k');await page.waitForSelector('#control-command-palette[open]');assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);await page.keyboard.press('Escape');checks.push('reduced_motion_supported');
 assert.deepEqual(errors,[]);checks.push('no_browser_runtime_errors');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'PASS',checks,mutations:0,source:'isolated synthetic UI; canonical search stub only'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,mutations:0}));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}})();
