const {chromium}=require(process.env.W2_PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'), fs=require('node:fs'), assert=require('node:assert/strict');
const {waitForDrawerOpen, checkDrawerContent, captureDrawer}=require('./fixtures/drawer-visual-assertions.cjs');
(async()=>{
 const root=require('node:path').resolve(process.argv[2] || 'node_modules/.w2-visual');
 const server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/app.js'?'app.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(root+'/'+file));});
 await new Promise(resolve=>server.listen(8124,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,timeout:20000,executablePath:process.env.W2_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.W2_CHROMIUM_ARGS || '["--no-sandbox","--disable-dev-shm-usage"]')});
 const results=[];
 const page=await browser.newPage();
 try {
  for(const universe of ['client','artisan'])for(const width of [320,390])for(const reducedMotion of ['reduce','no-preference']){
   await page.setViewportSize({width,height:width===320?568:844});
   await page.emulateMedia({reducedMotion});
   const errors=[];page.removeAllListeners('pageerror');page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8124/?universe='+universe);
   const menu=page.getByRole('button',{name:'Ouvrir le menu FIXEO'}), close=page.getByRole('button',{name:'Fermer le menu FIXEO'});
   await menu.waitFor();
   const menuBefore=await menu.boundingBox();
   const toolbar=page.getByRole('toolbar');await toolbar.waitFor();
   assert.equal(await toolbar.getByRole('button').count(),3);
   for(const button of await page.getByRole('button').all()){const b=await button.boundingBox();if(b)assert.ok(b.width>=48&&b.height>=48,JSON.stringify(b));}
   await page.getByTestId('workspace-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const last=await page.getByTestId('final-action').boundingBox(), dock=await toolbar.boundingBox();
   assert.ok(last.y+last.height<=dock.y,JSON.stringify({last,dock}));
   const menuAfter=await menu.boundingBox();assert.equal(menuBefore.y,menuAfter.y);
   await page.getByTestId('final-action').click();assert.equal(await page.title(),'FINAL_ACTION_PASS');
   await menu.click({timeout:5000});await waitForDrawerOpen(page);
   const selected=page.getByRole('button',{name:universe==='client'?'Mon espace':'Artisan OS',exact:true});
   assert.equal(await selected.getAttribute('aria-selected'),'true');
   await selected.click();await close.waitFor({state:'hidden'});
   await menu.click({timeout:5000});await waitForDrawerOpen(page);
   await page.keyboard.press('Escape');await close.waitFor({state:'hidden'});
   await menu.click({timeout:5000});await waitForDrawerOpen(page);
   await page.mouse.click(width-4,Math.floor((width===320?568:844)/2));await close.waitFor({state:'hidden'});
   await menu.click({timeout:5000});await waitForDrawerOpen(page);
   const target=universe==='client'?'Interventions':'Devis';
   await page.getByRole('button',{name:target,exact:true}).click();await close.waitFor({state:'hidden'});
   assert.equal(await toolbar.count(),0);
   await menu.click({timeout:5000});await waitForDrawerOpen(page);await page.getByRole('button',{name:universe==='client'?'Mon espace':'Artisan OS',exact:true}).click();await close.waitFor({state:'hidden'});
   await toolbar.waitFor();
   await page.getByTestId('workspace-scroll').evaluate(el=>{el.scrollTop=0;});
   await page.screenshot({path:root+`/${universe}-${width}-${reducedMotion}.png`});
   await menu.click({timeout:5000});
   const panel=await waitForDrawerOpen(page);
   const reachableControls=await checkDrawerContent(panel,universe==='client'?5:6);
   const drawer=await captureDrawer(page,panel,root+`/${universe}-drawer-${width}-${reducedMotion}.png`);
   await page.getByRole('button',{name:'Se déconnecter',exact:true}).click();
   const busy=page.getByRole('button',{name:'Déconnexion en cours'});await busy.waitFor();assert.equal(await busy.getAttribute('aria-disabled'),'true');
   await close.waitFor({state:'hidden'});assert.equal(await page.getByTestId('current-route').innerText(),'/sign-in');
   assert.deepEqual(errors,[]);
   console.log('PASS',universe,width,reducedMotion);
   results.push({universe,width,reducedMotion,drawer,reachableControls,passed:['targets','content reservation','stable header','fully opened Drawer geometry','critical content containment and reachability','selected destination','active no-op','Escape','backdrop','navigation','logout busy'],pageErrors:errors.length});

  }
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:8124/?legacy=1');
  await page.getByRole('button',{name:'Action compatible'}).click();assert.equal(await page.title(),'LEGACY_ACTION_PASS');
  // Browser emulation of larger native text, not a substitute for device Dynamic Type.
  await page.evaluate(()=>{for(const el of document.querySelectorAll('[dir="auto"]')){const s=getComputedStyle(el);if(s.fontFamily.toLowerCase().includes('ionicons'))continue;el.style.fontSize=(parseFloat(s.fontSize)*2)+'px';el.style.lineHeight=(parseFloat(s.lineHeight)*2)+'px';}});
  await page.getByTestId('workspace-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.getByTestId('final-action').click();
  await page.waitForFunction(() => {
    const dock=document.querySelector('[role="toolbar"]');
    if (!dock) return true;
    const scroll=document.querySelector('[data-testid="workspace-scroll"]');
    return scroll.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top;
  });
  if (await page.getByRole('toolbar').count()) {
    const overflow = await page.getByRole('toolbar').evaluate(el => [...el.querySelectorAll('[dir="auto"]')].filter(text => text.scrollWidth > text.clientWidth + 1).map(text => text.textContent));
    assert.deepEqual(overflow, []);
  }
  await page.screenshot({path:root+'/large-text.png'});
  await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();
  const largeTextPanel=await waitForDrawerOpen(page);
  await page.evaluate(()=>{for(const el of document.querySelectorAll('[role="dialog"] [dir="auto"]')){const s=getComputedStyle(el);if(s.fontFamily.toLowerCase().includes('ionicons'))continue;el.style.fontSize=(parseFloat(s.fontSize)*2)+'px';el.style.lineHeight=(parseFloat(s.lineHeight)*2)+'px';}});
  const largeTextControls=await checkDrawerContent(largeTextPanel,5);
  await page.getByRole('button',{name:'Mon espace',exact:true}).scrollIntoViewIfNeeded();
  const largeTextDrawer=await captureDrawer(page,largeTextPanel,root+'/drawer-large-text.png');
  await page.getByRole('button',{name:'Fermer le menu FIXEO'}).click();
  results.push({legacyCompatibility:true,largeTextEmulation:true,drawer:largeTextDrawer,reachableControls:largeTextControls});await page.close();
  fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }catch(e){console.log('FAIL_BODY',await page.locator('body').innerText());console.log('FAIL_ERRORS',await page.evaluate(()=>document.body.innerHTML.slice(-5000)));await page.screenshot({path:root+'/failure.png'});throw e;}finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
