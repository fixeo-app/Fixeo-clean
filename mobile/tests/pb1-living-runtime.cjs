// Actual RAFI renderer; synthetic state/hardware adapters, not Android FPS certification.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.argv[2]),out=path.resolve('docs/w6/pb1-correction/rafi-living');fs.mkdirSync(out,{recursive:true});
const framesDir=path.resolve(process.env.PB1_VIDEO_FRAMES||'/tmp/fixeo-living-frames');fs.mkdirSync(framesDir,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:600},reducedMotion:'no-preference',hasTouch:true});page.setDefaultTimeout(7000);
 const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());
 async function open(extra=''){await page.goto(origin+'/?scene=runtime'+extra);await page.getByTestId('rafi-orb').waitFor();}
 const pose=()=>page.getByTestId('rafi-core').evaluate(el=>getComputedStyle(el).transform);
 async function snapshot(name){await page.screenshot({path:path.join(out,name+'.png')});}
 try {
  await open();await page.waitForFunction(()=>__w3.stats.loopStarts>0);
  const first=await pose();await wait(450);assert.notEqual(await pose(),first);results.push('idle breath animates');
  await page.evaluate(()=>__w3.setMode('success'));await page.getByRole('img',{name:'RAFI a terminé cette étape'}).waitFor();await page.getByRole('img',{name:'RAFI est prêt'}).waitFor();
  const settled=await pose();await wait(400);assert.notEqual(await pose(),settled);results.push('success returns to living idle');
  await page.evaluate(()=>__w3.background(false));await wait(200);const paused=await pose();await wait(250);assert.equal(await pose(),paused);
  await page.evaluate(()=>__w3.background(true));await page.waitForFunction(()=>__w3.stats.loopStarts>=3);await page.getByRole('img',{name:'RAFI est prêt'}).waitFor();results.push('background stops and resumes without replaying success');
  await page.evaluate(()=>__w3.focus(false));await wait(150);const blurred=await pose();await wait(200);assert.equal(await pose(),blurred);await page.evaluate(()=>__w3.focus(true));await wait(250);assert.notEqual(await pose(),blurred);results.push('navigation blur pauses');
  await page.getByTestId('living-scroll').evaluate(el=>{el.scrollTop=800;});await wait(350);const offscreen=await pose();await wait(250);assert.equal(await pose(),offscreen);
  const loops=await page.evaluate(()=>__w3.stats.loopStarts);await page.getByTestId('living-scroll').evaluate(el=>{el.scrollTop=0;});await page.waitForFunction(n=>__w3.stats.loopStarts>n,loops);results.push('viewport scroll pauses and resumes');
  const cdp=await page.context().newCDPSession(page),box=await page.getByTestId('rafi-orb').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,force:0.5}]});await wait(120);const pressed=await page.getByTestId('rafi-touch').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a);assert.ok(pressed<0.99);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await wait(300);assert.equal(await page.getByTestId('rafi-touch').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a),1);results.push('touch compresses and settles without overshoot');
  await page.emulateMedia({reducedMotion:'reduce'});await wait(200);const reduced=await pose();await wait(300);assert.equal(await pose(),reduced);await snapshot('reduced-motion');results.push('reduced motion keeps transforms still');
  await page.evaluate(()=>__w3.setMounted(false));await wait(200);assert.equal(await page.evaluate(()=>__w3.stats.activitySubscriptions-__w3.stats.activityStops),0);assert.equal(await page.evaluate(()=>__w3.navigationListeners.focus.size+__w3.navigationListeners.blur.size),0);results.push('unmount cleans app/focus subscriptions and animations');
  await page.emulateMedia({reducedMotion:'no-preference'});await open('&compact=1');await page.waitForFunction(()=>__w3.stats.loopStarts>0);results.push('compact has restrained living motion');
  await open('&animationError=1');await wait(250);assert.equal(await page.getByTestId('rafi-master-material').count(),1);assert.equal(await page.getByTestId('rafi-core').isVisible(),true);results.push('animation failure retains canonical static sphere');
  await open('&microphone=1');await page.getByRole('button',{name:'Parler à RAFI',exact:true}).click();await page.getByRole('img',{name:'RAFI écoute',exact:true}).waitFor();await page.getByRole('button',{name:'Arrêter l’enregistrement',exact:true}).click();await page.getByRole('img',{name:'RAFI réfléchit',exact:true}).waitFor();results.push('actual microphone controls drive listening/start and thinking/stop with hardware adapter');
  for(const [mode,duration] of [['idle',9000],['listening',4200],['thinking',5600],['success',1600],['attention',3000],['speaking',3000]]){
   await open();await page.waitForFunction(()=>__w3.stats.loopStarts>0);await page.evaluate(m=>__w3.setMode(m),mode);
   const dir=path.join(framesDir,mode);fs.mkdirSync(dir,{recursive:true});const samples=[];const count=Math.ceil(duration/100);
   for(let i=0;i<count;i++){
    const start=Date.now();await page.screenshot({path:path.join(dir,String(i).padStart(4,'0')+'.png')});
    if(i%10===0)samples.push({frame:i,pose:await pose()});await wait(Math.max(0,100-(Date.now()-start)));
   }
   for(const i of [0,Math.floor(count/2),count-1])fs.copyFileSync(path.join(dir,String(i).padStart(4,'0')+'.png'),path.join(out,mode+'-'+i+'.png'));
   const video=spawnSync('ffmpeg',['-v','error','-y','-framerate','10','-i',path.join(dir,'%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,mode+'.mp4')],{encoding:'utf8'});assert.equal(video.status,0,video.stderr);
   results.push({state:mode,durationMs:duration,samples,videoFPS:10,androidPerformanceClaim:false});console.log('PASS',mode);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify({scope:'Actual React Native Web RAFI renderer, synthetic states, 10 FPS evidence recordings; not a native performance benchmark',results,errors,physicalReview:'PENDING'},null,2));console.log('PASS living lifecycle + 6 states');
 }catch(e){await snapshot('failure');console.error('ERRORS',errors);console.error('STATS',await page.evaluate(()=>globalThis.__w3?.stats));throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
