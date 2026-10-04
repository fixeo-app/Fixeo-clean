const {chromium}=require(process.env.W3_PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {waitForDrawerOpen}=require('./fixtures/drawer-visual-assertions.cjs');
const root=path.resolve(process.argv[2] || 'node_modules/.w3-visual');
const output=path.resolve(process.argv[3] || 'docs/w3/evidence');
const frames=async(page,count=4)=>page.evaluate(n=>new Promise(resolve=>{const tick=()=>--n<=0?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),count);
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{const file=req.url.split('?')[0]==='/app.js'?'app.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(path.join(root,file)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.W3_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.W3_CHROMIUM_ARGS || '["--no-sandbox","--disable-dev-shm-usage"]')});
 const page=await browser.newPage();const errors=[],requests=[],results=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:'))return route.continue();requests.push(url);return route.abort();});
 async function open(scene,width=390,reduce='reduce',extra=''){
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:reduce});
  await page.goto(`${base}/?scene=${scene}${extra}`);await page.getByTestId('rafi-orb').first().waitFor();await page.evaluate(()=>document.fonts.ready);await frames(page);
 }
 async function geometry(){
  const violations=await page.evaluate(()=>{
   const bad=[];const within=(i,o)=>i.left>=o.left-1&&i.right<=o.right+1&&i.top>=o.top-1&&i.bottom<=o.bottom+1;
   for(const orb of document.querySelectorAll('[data-testid="rafi-orb"]')){
    const box=orb.getBoundingClientRect();if(box.width<40||box.left<0||box.right>innerWidth+1)bad.push('orb frame outside viewport');
    for(const part of orb.querySelectorAll('[data-testid="rafi-halo"],[data-testid="rafi-core"]'))if(!within(part.getBoundingClientRect(),box))bad.push('part outside frame');
    for(const part of orb.querySelectorAll('*'))if(/NaN|Infinity/.test(part.getAttribute('style')||''))bad.push('invalid transform');
   }
   if(document.documentElement.scrollWidth>innerWidth+1)bad.push('horizontal overflow');return bad;
  });assert.deepEqual(violations,[]);
 }
 try {
  for(const width of [390,320]){
   await open('states',width,'no-preference');await geometry();
   for(const state of ['idle','listening','understanding','working','matching','intervention','success','attention'])assert.equal(await page.getByTestId('state-'+state).getByRole('img').count(),1);
   const a=await page.screenshot({fullPage:true});await frames(page,10);const b=await page.screenshot({fullPage:true});assert.ok(a.equals(b),'static poses stable');
   fs.writeFileSync(path.join(output,`rafi-states-${width}.png`),b);results.push({scene:'states',width,states:8,stable:true});console.log('PASS states',width);
  }
  await open('states',390,'reduce','&reduced=1');await geometry();await page.screenshot({path:path.join(output,'rafi-reduced-motion.png'),fullPage:true});
  for(const scene of ['client','artisan'])for(const width of [390,320]){
   await open(scene,width);await geometry();
   if(scene==='client'){
    await page.getByRole('button',{name:'Écrire à RAFI',exact:true}).click();await page.getByRole('textbox',{name:'Décrivez le problème',exact:true}).evaluate(el=>{if(document.activeElement!==el)throw new Error('write failed to focus');el.blur();});
    assert.equal(await page.getByRole('textbox',{name:'Votre ville',exact:true}).count(),1);
   }
   await page.screenshot({path:path.join(output,`rafi-${scene}-presence${width===320?'-320':''}.png`)});
   await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();const panel=await waitForDrawerOpen(page);
   const compact=await panel.$$('[data-testid="rafi-orb"]');assert.equal(compact.length,1);const b=await compact[0].boundingBox();assert.equal(b.width,55);
   await geometry();if(scene==='client'&&width===390)await page.screenshot({path:path.join(output,'rafi-compact-drawer.png')});
   results.push({scene,width,compact:b.width,backend:'disabled / empty boundaries'});console.log('PASS',scene,width);
  }
  await open('composer');await geometry();await page.screenshot({path:path.join(output,'rafi-composer.png')});
  for(const button of await page.getByTestId('rafi-composer').getByRole('button').all()){const b=await button.boundingBox();assert.ok(b.width>=48&&b.height>=48);}
  await page.getByRole('button',{name:'Écrire à RAFI',exact:true}).click();await page.getByRole('button',{name:'Parler à RAFI',exact:true}).click();
  await page.getByRole('button',{name:'Arrêter l’enregistrement',exact:true}).click();await page.getByRole('button',{name:'Montrer une photo à RAFI',exact:true}).click();await frames(page);
  assert.deepEqual(await page.evaluate(()=>__w3.stats.events),[['write'],['listening',true],['listening',false],['voice','fixture://voice.m4a'],['photo','fixture://photo.jpg','image/jpeg']]);
  assert.deepEqual(await page.evaluate(()=>__w3.captureCalls),['micro-permission','audio-mode:true','prepare','record','stop','audio-mode:false','camera-permission','camera:{"quality":0.72,"allowsEditing":false}']);
  await open('composer',320,'reduce','&denied=1');await page.getByRole('button',{name:'Parler à RAFI',exact:true}).click();await frames(page);
  assert.deepEqual(await page.evaluate(()=>__w3.stats.events),[]);assert.ok((await page.getByTestId('rafi-composer').innerText()).includes('Microphone non autorisé.'));
  await page.getByRole('button',{name:'Montrer une photo à RAFI',exact:true}).click();await frames(page);assert.deepEqual(await page.evaluate(()=>__w3.stats.events),[]);
  await page.evaluate(()=>{for(const el of document.querySelectorAll('[dir="auto"]')){const s=getComputedStyle(el);if(s.fontFamily.toLowerCase().includes('ionicons'))continue;el.style.fontSize=parseFloat(s.fontSize)*2+'px';el.style.lineHeight=parseFloat(s.lineHeight)*2+'px';}});await geometry();
  const overflow=await page.getByTestId('rafi-composer').evaluate(el=>[...el.querySelectorAll('[dir="auto"]')].filter(t=>t.scrollWidth>t.clientWidth+1).map(t=>t.textContent));assert.deepEqual(overflow,[]);
  await page.screenshot({path:path.join(output,'rafi-composer-large-text.png'),fullPage:true});results.push({scene:'composer',callbacks:true,denied:true,largeText:true});console.log('PASS composer');
  await open('runtime',390,'no-preference');await page.waitForFunction(()=>__w3.stats.loopStarts===1);assert.equal(await page.evaluate(()=>__w3.stats.activitySubscriptions),1);
  await page.evaluate(()=>__w3.setMode('success'));await page.waitForFunction(()=>__w3.stats.timingStarts>=3);await frames(page,65);
  const settled=await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform);await frames(page,65);
  assert.equal(await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform),settled);assert.equal(await page.evaluate(()=>__w3.stats.loopStarts),1);
  const starts=await page.evaluate(()=>__w3.stats.timingStarts);await page.evaluate(()=>__w3.background(false));await frames(page);await page.evaluate(()=>__w3.background(true));await frames(page);assert.equal(await page.evaluate(()=>__w3.stats.timingStarts),starts);
  await page.evaluate(()=>__w3.setMode('matching'));await frames(page);await geometry();const loops=await page.evaluate(()=>__w3.stats.loopStarts);
  await page.evaluate(()=>__w3.background(false));await frames(page);const backgroundPose=await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform);await frames(page,15);
  assert.equal(await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform),backgroundPose);
  await page.evaluate(()=>__w3.background(true));await frames(page);assert.equal(await page.evaluate(()=>__w3.stats.loopStarts),loops+1);
  await page.evaluate(()=>__w3.focus(false));await frames(page);const stopped=await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform);await frames(page,15);assert.equal(await page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform),stopped);
  await page.evaluate(()=>__w3.focus(true));await frames(page);assert.equal(await page.evaluate(()=>__w3.stats.loopStarts),loops+2);
  await page.emulateMedia({reducedMotion:'reduce'});await frames(page);const reducedStarts=await page.evaluate(()=>__w3.stats.timingStarts);await frames(page,15);assert.equal(await page.evaluate(()=>__w3.stats.timingStarts),reducedStarts);
  await page.evaluate(()=>__w3.setMounted(false));await frames(page);assert.equal(await page.evaluate(()=>__w3.stats.activitySubscriptions-__w3.stats.activityStops),0);assert.equal(await page.evaluate(()=>__w3.navigationListeners.focus.size+__w3.navigationListeners.blur.size),0);
  results.push({scene:'runtime',successNoLoop:true,successNoResumeReplay:true,background:true,focus:true,reducedMotion:true,cleanup:true,stats:await page.evaluate(()=>__w3.stats)});console.log('PASS runtime');
  await open('runtime',390,'no-preference','&compact=1');await frames(page,15);assert.equal(await page.evaluate(()=>__w3.stats.loopStarts),0);assert.equal(await page.evaluate(()=>__w3.stats.activitySubscriptions),0);
  const motionEvidence=[];
  for(const [mode,duration] of [['listening',2000],['attention',4200],['matching',1400],['success',1100]]){
   await open('runtime',390,'no-preference');
   const samples=await page.evaluate(({mode,duration})=>new Promise(resolve=>{
    const samples=[],start=performance.now();__w3.setMode(mode);
    const sample=()=>{
     const style=id=>getComputedStyle(document.querySelector('[data-testid="'+id+'"]'));
     const scale=id=>new DOMMatrixReadOnly(style(id).transform).a;
     const orbit=document.querySelector('[data-testid="rafi-orbit"]');
     const matrix=orbit?new DOMMatrixReadOnly(getComputedStyle(orbit).transform):null;
     samples.push({ms:Math.round(performance.now()-start),core:scale('rafi-core'),halo:scale('rafi-halo'),
      opacity:Number(style('rafi-halo').opacity),orbitDegrees:matrix?Math.atan2(matrix.b,matrix.a)*180/Math.PI:null});
     if(performance.now()-start<duration)requestAnimationFrame(sample);else resolve(samples);
    };requestAnimationFrame(sample);
   }),{mode,duration});
   const range=key=>[Math.min(...samples.map(s=>s[key])),Math.max(...samples.map(s=>s[key]))];
   const evidence={mode,durationMs:duration,sampleCount:samples.length,coreScale:range('core'),haloScale:range('halo'),haloOpacity:range('opacity'),last:samples.at(-1)};
   if(mode==='listening'){assert.ok(evidence.coreScale[1]>1.030);assert.ok(evidence.haloScale[1]>1.075);}
   if(mode==='attention'){assert.ok(evidence.haloScale[1]>1.06);assert.ok(evidence.haloOpacity[1]>.97);}
   if(mode==='matching'){assert.ok(evidence.last.orbitDegrees>35);assert.equal(await page.getByTestId('rafi-orbit').count(),1);}
   if(mode==='success'){assert.ok(evidence.haloScale[1]>1.15);assert.equal(evidence.last.core,1);assert.equal(evidence.last.halo,1);}
   await geometry();motionEvidence.push(evidence);
  }
  fs.writeFileSync(path.join(output,'runtime-motion.json'),JSON.stringify(motionEvidence,null,2)+'\n');
  results.push({scene:'runtime-motion',states:motionEvidence.map(s=>s.mode),observed:true});console.log('PASS runtime motion amplitudes');
  const detail=await browser.newPage({viewport:{width:390,height:520},deviceScaleFactor:3,reducedMotion:'reduce'});
  detail.on('pageerror',error=>errors.push(error.message));
  await detail.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:'))return route.continue();requests.push(url);return route.abort();});
  await detail.goto(base+'/?scene=hero');await detail.getByTestId('rafi-orb').first().waitFor();await detail.evaluate(()=>document.fonts.ready);await frames(detail);
  assert.equal((await detail.getByTestId('rafi-core').first().boundingBox()).width,96);
  await detail.screenshot({path:path.join(output,'rafi-hero-closeup.png')});
  results.push({scene:'hero-closeup',cssDiameter:96,deviceScaleFactor:3});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({results,pageErrors:errors,externalRequests:requests},null,2));console.log(JSON.stringify({passed:results.length,pageErrors:errors.length,externalRequests:requests.length,output}));
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
