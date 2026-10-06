const fs=require('fs'),http=require('http'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.W6_EXPORT_DIR||path.resolve(__dirname,'../../dist-gate-a'));
const out=path.resolve(process.env.W6_EVIDENCE_DIR||path.resolve(__dirname,'../../docs/w6/runtime'));fs.mkdirSync(out,{recursive:true});
const srv=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>srv.listen(4176,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:process.env.CHROMIUM_ARGS_MODULE ? require(process.env.CHROMIUM_ARGS_MODULE).default.args : []});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});const errors=[],requests=[];page.on('request',r=>{if(r.url().includes('supabase.co'))requests.push({method:r.method(),path:new URL(r.url()).pathname});});page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://127.0.0.1:4176/entry');await page.getByText('Le quotidien, en bonnes mains.').waitFor({timeout:15000});await page.screenshot({path:path.join(out,'entry-390.png')});
const entryMs=await page.evaluate(()=>performance.now());
await page.getByRole('button',{name:'J’ai déjà un compte'}).click();await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();await page.screenshot({path:path.join(out,'login-390.png')});
await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByRole('button',{name:'Client · Trouver une solution chez moi'}).waitFor();await page.screenshot({path:path.join(out,'role-choice-390.png')});
await page.getByRole('button',{name:'Client · Trouver une solution chez moi'}).click();await page.getByRole('textbox',{name:'Nom complet'}).waitFor();await page.screenshot({path:path.join(out,'signup-client-390.png')});
await page.getByRole('button',{name:'Changer de type de compte'}).click();await page.getByRole('button',{name:'Artisan · Développer mon activité'}).click();await page.getByRole('textbox',{name:'Nom complet'}).waitFor();await page.screenshot({path:path.join(out,'signup-artisan-390.png')});
await page.goto('http://127.0.0.1:4176/forgot-password');await page.getByRole('button',{name:'Recevoir un lien'}).waitFor();await page.screenshot({path:path.join(out,'recovery-request-390.png')});
await page.setViewportSize({width:320,height:720});await page.goto('http://127.0.0.1:4176/sign-in');await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();await page.screenshot({path:path.join(out,'login-320.png')});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
if(overflow)throw Error('320px overflow');
await page.getByRole('textbox',{name:'Email',exact:true}).fill('contact+w6-client@fixeo.ma');
await page.keyboard.press('Tab');
const keyboardFocus=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
if(keyboardFocus!=='Mot de passe')throw Error('Keyboard focus order');
await page.setViewportSize({width:320,height:410});
await page.getByRole('textbox',{name:'Mot de passe',exact:true}).fill('synthetic-local-only');
await page.getByRole('button',{name:'Me connecter',exact:true}).scrollIntoViewIfNeeded();
await page.screenshot({path:path.join(out,'keyboard-focus-320.png')});
await page.setViewportSize({width:320,height:720});
// Text-only scaling of the actual exported RN Web UI, not an OS/VoiceOver certification.
await page.evaluate(()=>{for(const el of document.querySelectorAll('div,input,span')){if((el.childNodes.length===1&&el.firstChild.nodeType===3)||el.tagName==='INPUT'){const style=getComputedStyle(el);el.style.fontSize=(parseFloat(style.fontSize)*2)+'px';if(style.lineHeight!=='normal')el.style.lineHeight=(parseFloat(style.lineHeight)*2)+'px';}}});
await page.getByRole('button',{name:'Me connecter',exact:true}).scrollIntoViewIfNeeded();
await page.screenshot({path:path.join(out,'text-200-320.png')});
const overflow200=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
if(overflow200)throw Error('200% text overflow');
// Rejected legacy URL uses only a synthetic marker. No real token is generated or stored.
await page.goto('http://127.0.0.1:4176/auth-callback#access_token=synthetic-contract-marker');
await page.getByText('Ce lien ne peut pas être ouvert ici.').waitFor();
if(page.url().includes('#')||page.url().includes('access_token'))throw Error('Callback was not scrubbed');
await page.screenshot({path:path.join(out,'callback-rejected-320.png')});
for(const route of ['/artisan','/artisan-workspace/finance','/client-workspace/account','/reset-password']){
  await page.goto('http://127.0.0.1:4176'+route);await page.getByText('Le quotidien, en bonnes mains.').waitFor();
}
if(requests.some(r=>!r.path.startsWith('/auth/')))throw Error('Private request from signed-out public screens');
if(errors.length)throw Error('Runtime errors: '+errors.length);
const report={scope:'Real Expo web export, signed-out UI; no authenticated staging certification',entryMs,viewport320:true,text200Web:true,keyboardFocus,privateRoutesBlocked:true,legacyCallbackScrubbed:true,errors,requests};
fs.writeFileSync(path.join(out,'public-runtime.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
await browser.close();srv.close();})().catch(e=>{console.error(e.message);srv.close();process.exit(1)});
