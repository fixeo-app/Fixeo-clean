// Deterministic HTTP contract test of the real Expo export. Never contacts staging.
// This is not evidence of real email delivery or a real Supabase session.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.W6_EXPORT_DIR||path.resolve(__dirname,'../../dist-gate-a')),out=path.resolve(process.env.W6_EVIDENCE_DIR||path.resolve(__dirname,'../../docs/w6/runtime'));fs.mkdirSync(out,{recursive:true});
const srv=http.createServer((req,res)=>{let f=path.join(root,new URL(req.url,'http://local').pathname);if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.png')?'image/png':f.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>srv.listen(4177,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:process.env.CHROMIUM_ARGS_MODULE?require(process.env.CHROMIUM_ARGS_MODULE).default.args:[]});
const page=await browser.newPage({viewport:{width:390,height:844}});let role='client',revoked=false,delayRole=false,releaseRole;
const timings={},errors=[];page.on('pageerror',e=>errors.push(e.message));
const uid=()=>role==='client'?'00000000-0000-4000-8000-000000000001':'00000000-0000-4000-8000-000000000002';
const user=()=>({id:uid(),aud:'authenticated',role:'authenticated',email:'contact+w6-'+role+'@fixeo.ma',email_confirmed_at:'2026-10-05T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{role:role==='client'?'artisan':'client'},created_at:'2026-10-05T00:00:00Z'});
// Wrong metadata is intentional: only the canonical profile may authorize a universe.
const session=()=>({access_token:['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({sub:uid(),role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,session_id:'synthetic-contract-only'})).toString('base64url'),'synthetic'].join('.'),refresh_token:'synthetic-contract-only',expires_in:3600,token_type:'bearer',user:user()});
await page.route('https://kqyhusnbybsukbcaoqtu.supabase.co/**',async route=>{const req=route.request(),u=new URL(req.url());let status=200,body={};
 if(u.pathname==='/auth/v1/token'){if(revoked){status=400;body={code:'refresh_token_not_found',msg:'Session revoked'};}else body=session();}
 else if(u.pathname==='/auth/v1/user')body=user();
 else if(u.pathname==='/auth/v1/logout'){status=204;body=null;}
 else if(u.pathname==='/rest/v1/profiles'){if(delayRole)await new Promise(r=>releaseRole=r);body={role};}
 else if(u.pathname==='/rest/v1/artisans')body={id:'00000000-0000-4000-8000-000000000003',owner_user_id:uid()};
 else if(u.pathname==='/rest/v1/rpc/get_my_mobile_artisan_access_v1')body={user_id:uid(),artisan_id:'00000000-0000-4000-8000-000000000003'};
 else body=[];
 await route.fulfill({status,contentType:'application/json',body:body===null?'':JSON.stringify(body)});
});
async function login(next){role=next;await page.goto('http://127.0.0.1:4177/sign-in');await page.getByRole('textbox',{name:'Email',exact:true}).fill('contact+w6-'+role+'@fixeo.ma');await page.getByRole('textbox',{name:'Mot de passe',exact:true}).fill('synthetic-contract-only');const t=Date.now();await page.getByRole('button',{name:'Me connecter',exact:true}).click();await page.getByLabel('FIXEO, espace '+role,{exact:true}).waitFor();timings[role+'LoginMs']=Date.now()-t;}
async function logout(){await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();const t=Date.now();await page.getByRole('button',{name:/déconnect/i}).click();await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();timings.logoutMs=Date.now()-t;assert.equal(await page.getByLabel('FIXEO, espace '+role,{exact:true}).count(),0);}
await login('artisan');await logout();await login('client');await logout();await login('artisan');await logout();
// Delay canonical authority: no metadata-based private render may slip through.
role='client';delayRole=true;await page.getByRole('textbox',{name:'Email',exact:true}).fill('contact+w6-client@fixeo.ma');await page.getByRole('textbox',{name:'Mot de passe',exact:true}).fill('synthetic-contract-only');await page.getByRole('button',{name:'Me connecter',exact:true}).click();await page.getByText('Vérification de vos accès…').waitFor();assert.equal(await page.getByLabel('FIXEO, espace client',{exact:true}).count(),0);assert.equal(await page.getByLabel('FIXEO, espace artisan',{exact:true}).count(),0);await page.screenshot({path:path.join(out,'simulated-auth-resolving.png')});delayRole=false;releaseRole?.();await page.getByLabel('FIXEO, espace client',{exact:true}).waitFor();
revoked=true;await page.reload();await page.getByText('Votre session a été fermée.').waitFor();assert.equal(await page.getByLabel('FIXEO, espace client',{exact:true}).count(),0);await page.screenshot({path:path.join(out,'simulated-session-revoked.png')});
assert.deepEqual(errors,[]);const report={scope:'Deterministic HTTP simulation against actual Expo screens; NOT live staging Auth',timings,canonicalRoleOverridesUntrustedMetadata:true,artisanClientArtisanSwitch:true,noPrivateScreenBeforeRole:true,revokedBootstrapClosed:true,errors};fs.writeFileSync(path.join(out,'session-contract-runtime.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));await browser.close();srv.close();})().catch(e=>{console.error(e.message);srv.close();process.exit(1)});
