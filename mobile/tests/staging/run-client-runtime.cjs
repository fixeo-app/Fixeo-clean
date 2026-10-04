// Operator-only real staging renderer. Browser HTTP is forwarded by Node as native fetch
// (no browser Origin). Actual URL, JWT, body, status and response are preserved.
// This does not certify a physical camera/microphone or a browser gateway contract.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http');
const {chromium}=require(process.env.W4_PLAYWRIGHT_MODULE);
const root=process.env.W4_RUNTIME_ROOT,out=process.env.W4_RUNTIME_REPORT;
const sessions=JSON.parse(fs.readFileSync(process.env.W41_AUTH_FILE));
const report={kind:'integrated-client-os-real-staging',candidate:'3e9724819ef5d15053436a516064a29fa96d6356',started_at:new Date().toISOString(),transport:'native HTTP forwarding; real staging responses; synthetic hardware',calls:[],screenshots:[],passed:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
function save(){fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(report,null,2));}
let browser,server;const pages={};
(async()=>{
 const image=await require(path.resolve('api/node_modules/sharp'))({create:{width:128,height:128,channels:3,background:'#b0aa99'}}).png().toBuffer();
 const audio=fs.readFileSync(process.env.W41_AUDIO_FILE);
 server=http.createServer((req,res)=>{const name=path.basename(req.url.split('?')[0]);const f=name==='app.js'||name.endsWith('.png')?name:'index.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(path.join(root,f)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.W4_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.W4_CHROMIUM_ARGS)});
 async function open(name,large=false){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});pages[name]=page;
  page.on('pageerror',e=>{report.errors.push({page:name,message:e.message.replace(/eyJ\S+/g,'[REDACTED]')});save();});
  await page.exposeFunction('__freshSession',()=>({token:sessions[process.env.W4_CAPTURE_ONLY ? 0 : 1].token,refresh:sessions[process.env.W4_CAPTURE_ONLY ? 0 : 1].refresh}));
  await page.addInitScript(({photo,voice})=>{const Original=FormData;globalThis.FormData=class extends Original{append(key,value,filename){if(value&&typeof value==='object'&&value.uri){const isVoice=key==='audio';super.append(key,new Blob([Uint8Array.from(isVoice?voice:photo)],{type:isVoice?'audio/wav':'image/png'}),isVoice?'w4-synthetic.wav':'w4-synthetic.png');}else if(filename!==undefined)super.append(key,value,filename);else super.append(key,value);}};},{photo:[...image],voice:[...audio]});
  await page.route('**/*',async route=>{
   const q=route.request(),url=q.url();if(url.startsWith(base)||url.startsWith('data:'))return route.continue();
   if(!url.startsWith('https://kqyhusnbybsukbcaoqtu.supabase.co/'))return route.abort();
   const headers=q.headers();for(const k of Object.keys(headers))if(/^(origin|referer|host|sec-|connection|content-length)/i.test(k))delete headers[k];
   const started=Date.now();try{const response=await fetch(url,{method:q.method(),headers,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer(),redirect:'error',signal:AbortSignal.timeout(65000)});const bytes=Buffer.from(await response.arrayBuffer());let b;try{b=JSON.parse(bytes);}catch{};
    let action;try{action=JSON.parse(q.postData()||'{}').action;}catch{}
    const item={page:name,path:new URL(url).pathname,method:q.method(),action,status:response.status,latency_ms:Date.now()-started,error:b?.error?.code||b?.error,outcome:b?.outcome?.outcome_type,next_step:b?.next_step?.type,privacy:b?.privacy,reference_present:!!b?.diagnostic_reference,safety_stop:b?.result?.safety?.stop,request_id:b?.request_id||(b?.id&&url.includes('create_my_service_request')?b.id:undefined)};
    if(typeof item.error!=='string')delete item.error;report.calls.push(item);save();
    const h=Object.fromEntries(response.headers);delete h['content-encoding'];delete h['content-length'];h['access-control-allow-origin']=base;await route.fulfill({status:response.status,headers:h,body:bytes});
   }catch(e){report.calls.push({page:name,path:new URL(url).pathname,network_error:e.name});save();await route.abort();}
  });
  await page.goto(base+(large?'/?large=1':'/'));await page.getByRole('button',{name:'Écrire à RAFI',exact:true}).or(page.getByTestId('client-active-situation')).first().waitFor({timeout:35000});
  // Wait for the genuine initial current-request RPC to settle before interacting.
  await page.waitForTimeout(700);return page;
 }
 async function capture(name,file=name){const page=pages[name];assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');await page.screenshot({path:path.join(out,file+'.png')});report.screenshots.push({file:file+'.png',page:name,viewport:page.viewportSize(),at:new Date().toISOString()});save();}
 const btn=(p,text)=>p.getByRole('button',{name:text,exact:true});
 async function need(name,text){const p=pages[name];await btn(p,'Écrire à RAFI').click();await p.getByLabel('Décrivez le problème',{exact:true}).fill(text);await p.getByLabel('Votre ville',{exact:true}).fill('Rabat');}
 async function body(name){console.log(JSON.stringify({page:name,text:(await pages[name].locator('body').innerText()).slice(0,6500)}));}
 if(process.env.W4_CAPTURE_ONLY){
  await open('large-final',true);
  await pages['large-final'].getByTestId('client-active-situation').waitFor();
  await pages['large-final'].setViewportSize({width:320,height:568});
  await pages['large-final'].evaluate(()=>{for(const el of document.querySelectorAll('[dir="auto"],input,textarea')){const s=getComputedStyle(el);if(s.fontFamily.toLowerCase().includes('ionicons'))continue;const size=parseFloat(s.fontSize);el.style.fontSize=size*2+'px';el.style.lineHeight=(parseFloat(s.lineHeight)||size*1.5)*2+'px';}});
  await capture('large-final','large-text-200');
  await pages['large-final'].getByTestId('client-active-situation').scrollIntoViewIfNeeded();
  await capture('large-final','large-text-200-active-request');
  report.passed.push('REAL_CURRENT_REQUEST_320_FONT_SIZE_200_PERCENT');report.status='PASS';report.finished_at=new Date().toISOString();save();return;
 }
 for(const n of ['direct','voice','ephemeral','persistent','estimate','safety','large'])await open(n,n==='large');
 await capture('direct','home-idle');await btn(pages.direct,'Écrire à RAFI').click();await capture('direct','composer-active');
 await pages.direct.getByLabel('Décrivez le problème',{exact:true}).fill('W4 FINAL synthétique : une fuite sous le lavabo.');await pages.direct.getByLabel('Votre ville',{exact:true}).fill('Rabat');await capture('direct','city');
 await need('estimate','W4 FINAL synthétique : combien pour une visite de bricolage ?');
 await need('persistent','W4 FINAL synthétique : fuite du robinet déclarée par le client.');
 await need('ephemeral','W4 FINAL synthétique : fuite du robinet déclarée par le client.');
 await need('safety','W4 FINAL synthétique : estimation, une très forte odeur de gaz.');
 await need('large','W4 FINAL synthétique : une fuite sous le lavabo.');await capture('large','large-text-200');
 await pages.direct.setViewportSize({width:320,height:568});await capture('direct','city-320');
 console.log('READY_REAL_CLIENT_RUNTIME');
 // Commands stay in this operator process; no evaluation endpoint is exposed to the browser/network.
 const rl=require('readline').createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const command of rl){if(command==='STOP'){break;}try{await eval('(async()=>{'+command+'})()');console.log('COMMAND_OK');}catch(e){console.log(JSON.stringify({command_failed:true,error:e.name,message:e.message.slice(0,180)}));}save();}
 report.finished_at=new Date().toISOString();save();
})().catch(e=>{report.failure={name:e.name,message:e.message.slice(0,180)};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
