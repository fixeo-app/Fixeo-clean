// Real staging transport and application screens. Native hardware alone is synthetic.
// Fresh credentials are supplied only via an operator file; never copied to this repository.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http');
const {chromium}=require(process.env.W5_PLAYWRIGHT_MODULE);
const root=process.env.W5_RUNTIME_ROOT,out=process.env.W5_RUNTIME_REPORT;
const sessions=JSON.parse(fs.readFileSync(process.env.W5_AUTH_FILE));
const session=sessions.find(x=>x.role==='artisan');assert(session?.token&&session?.refresh);
const report={kind:'integrated-artisan-os-real-staging',started_at:new Date().toISOString(),transport:'native HTTP forwarding; real staging; synthetic camera/microphone',calls:[],screenshots:[],passed:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
function save(){fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(report,null,2));}
let browser,server;const pages={};
(async()=>{
 const image=await require(path.resolve('api/node_modules/sharp'))({create:{width:256,height:192,channels:3,background:'#b0aa99'}}).png().toBuffer();
 const audio=fs.readFileSync(process.env.W5_AUDIO_FILE);
 server=http.createServer((req,res)=>{const name=path.basename(req.url.split('?')[0]);const f=name==='app.js'||name.endsWith('.png')?name:'index.html';res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(path.join(root,f)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.W5_CHROMIUM_EXECUTABLE,args:[...JSON.parse(process.env.W5_CHROMIUM_ARGS),'--remote-debugging-port=9225'],});
 async function open(name,{route='/artisan',large=false,width=390,height=844}={}){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});pages[name]=page;
  page.on('pageerror',e=>{report.errors.push({page:name,message:e.message.replace(/eyJ\S+/g,'[REDACTED]')});save();});
  await page.exposeFunction('__freshSession',()=>({token:session.token,refresh:session.refresh}));
  await page.addInitScript(({photo,voice})=>{
   const Original=FormData;globalThis.FormData=class extends Original{append(key,value,filename){if(value&&typeof value==='object'&&value.uri){const isVoice=key==='audio';super.append(key,new Blob([Uint8Array.from(isVoice?voice:photo)],{type:isVoice?'audio/wav':'image/png'}),isVoice?'w5-synthetic.wav':'w5-synthetic.png');}else if(filename!==undefined)super.append(key,value,filename);else super.append(key,value);}};
   const nativeFetch=globalThis.fetch;globalThis.fetch=(input,init)=>String(input).startsWith('synthetic://')?Promise.resolve(new Response(Uint8Array.from(photo),{status:200,headers:{'Content-Type':'image/png'}})):nativeFetch(input,init);
  },{photo:[...image],voice:[...audio]});
  await page.route('**/*',async route=>{
   const q=route.request(),url=q.url();if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
   if(!url.startsWith('https://kqyhusnbybsukbcaoqtu.supabase.co/'))return route.abort();
   const headers=q.headers();for(const k of Object.keys(headers))if(/^(origin|referer|host|sec-|connection|content-length)/i.test(k))delete headers[k];
   const started=Date.now();try{const response=await fetch(url,{method:q.method(),headers,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer(),redirect:'error',signal:AbortSignal.timeout(65000)});const bytes=Buffer.from(await response.arrayBuffer());let b;try{b=JSON.parse(bytes);}catch{};
    let action;try{action=JSON.parse(q.postData()||'{}').action;}catch{}
    const item={page:name,path:new URL(url).pathname,method:q.method(),action,status:response.status,latency_ms:Date.now()-started,code:b?.code,error:typeof b?.error==='string'?b.error:undefined,ok:b?.ok,id:b?.mission_id||b?.quote_id||b?.evidence_id,reason:b?.reason,count:Array.isArray(b)?b.length:undefined};
    report.calls.push(item);save();const h=Object.fromEntries(response.headers);delete h['content-encoding'];delete h['content-length'];h['access-control-allow-origin']=base;await route.fulfill({status:response.status,headers:h,body:bytes});
   }catch(e){report.calls.push({page:name,path:new URL(url).pathname,network_error:e.name});save();await route.abort();}
  });
  await page.goto(base+'/?route='+encodeURIComponent(route)+(large?'&large=1':''));
  await page.getByRole('button',{name:'Notifications Artisan',exact:true}).waitFor({timeout:35000});
  return page;
 }
 async function capture(name,file=name){const page=pages[name];assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');await page.screenshot({path:path.join(out,file+'.png')});report.screenshots.push({file:file+'.png',page:name,route:await page.evaluate(()=>globalThis.__runtimePath),viewport:page.viewportSize(),at:new Date().toISOString()});save();}
 const btn=(p,text)=>p.getByRole('button',{name:text,exact:true});
 async function body(name){console.log(JSON.stringify({page:name,text:(await pages[name].locator('body').innerText()).slice(0,8000)}));}
 async function go(name,route){await pages[name].evaluate(route=>globalThis.__runtimeNavigate(route),route);}
 await open('main');await pages.main.getByTestId('artisan-priority').or(pages.main.getByText('Le réseau met trop de temps.',{exact:false})).first().waitFor({timeout:45000});await capture('main','home-idle');await body('main');
 console.log('READY_REAL_ARTISAN_RUNTIME '+base);
 const rl=require('readline').createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const command of rl){if(command==='STOP')break;try{await eval('(async()=>{'+command+'})()');console.log('COMMAND_OK');}catch(e){console.log(JSON.stringify({command_failed:true,error:e.name,message:e.message.slice(0,200)}));}save();}
 report.finished_at=new Date().toISOString();save();
})().catch(e=>{report.failure={name:e.name,message:e.message.slice(0,180)};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
