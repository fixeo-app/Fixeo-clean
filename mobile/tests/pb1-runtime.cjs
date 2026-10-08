// Actual Expo export, deterministic synthetic HTTP. This is NOT live staging certification.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.PB1_EXPORT||'dist-gate-a');
const before=process.env.PB1_BEFORE==='1',out=path.resolve('docs/w6/pb1-correction',before?'before':'after');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(file));});
const ids={client:'00000000-0000-4000-8000-000000000001',artisan:'00000000-0000-4000-8000-000000000002',profile:'00000000-0000-4000-8000-000000000003',business:'00000000-0000-4000-8000-000000000004',job:'00000000-0000-4000-8000-000000000005',request:'00000000-0000-4000-8000-000000000006'};
let role='client',estimatorFail=true,confirmCalls=[],request=null,profileCity='Fes',pauseRefresh=false,releaseRefresh,holdEstimator=!before,releaseEstimator,holdAvailability=false,releaseAvailability,availability='available';
const user=()=>({id:ids[role],aud:'authenticated',role:'authenticated',email:'synthetic-'+role+'@example.invalid',email_confirmed_at:'2026-10-05T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{role:role==='client'?'artisan':'client'},created_at:'2026-10-05T00:00:00Z'});
const session=()=>({access_token:['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({sub:ids[role],role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,session_id:'synthetic-local-only'})).toString('base64url'),'synthetic'].join('.'),refresh_token:'synthetic-local-only',expires_in:3600,token_type:'bearer',user:user()});
const client={id:ids.business,full_name:'PB1 Client Test',phone:'0600000001',city:'Fes',address:'',notes:'',updated_at:'2026-10-06T10:00:00Z'};
const job={id:ids.job,client_id:ids.business,title:'PB1 intervention Test',source:'personal',status:'planned',scheduled_at:'2026-10-06T10:30:00Z',updated_at:'2026-10-06T10:00:00Z'};
const ledger=[{id:'income',entry_type:'income',category:'other',source:'personal',amount:500,occurred_on:'2026-10-06',client_id:ids.business,job_id:ids.job},{id:'expense',entry_type:'expense',category:'other',source:'personal',amount:120,occurred_on:'2026-10-06',client_id:null,job_id:null}];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Africa/Casablanca',reducedMotion:'reduce'});page.setDefaultTimeout(8000);
 const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin===origin||u.protocol==='data:')return route.continue();
  if(u.hostname!=='kqyhusnbybsukbcaoqtu.supabase.co')return route.abort();
  let body=[],status=200;const input=req.postDataJSON?.();
  if(u.pathname==='/auth/v1/token'){if(pauseRefresh&&u.searchParams.get('grant_type')==='refresh_token')await new Promise(r=>releaseRefresh=r);body=session();}
  else if(u.pathname==='/auth/v1/user')body=user();
  else if(u.pathname==='/auth/v1/logout'){body=null;status=204;}
  else if(u.pathname==='/rest/v1/profiles'){if(req.method()==='PATCH')profileCity=input.city;body={id:ids[role],role,full_name:'Compte de test PB1',phone:'0600000001',city:profileCity,email:user().email};}
  else if(u.pathname==='/rest/v1/users')body={id:ids[role],role};
  else if(u.pathname==='/rest/v1/artisans')body={id:ids.profile,owner_user_id:ids.artisan,name:'Artisan PB1',city:'Fès',work_zone:'Fès',description:'Artisan de test',phone_public:'0600000001',service_category:'Plomberie',services:['Plomberie'],availability};
  else if(u.pathname.endsWith('/update_artisan_availability')){if(holdAvailability)await new Promise(r=>releaseAvailability=r);availability=input.p_status;body={ok:true,status:availability};}
  else if(u.pathname.endsWith('/get_my_mobile_artisan_access_v1'))body={ok:true,user_id:ids.artisan,artisan_id:ids.profile};
  else if(u.pathname.endsWith('/list_my_mobile_artisan_missions_v1'))body={ok:true,missions:[]};
  else if(u.pathname.includes('current_client_request'))body={ok:true,request};
  else if(u.pathname.includes('current_')&&u.pathname.includes('mission'))body={ok:true,mission:null};
  else if(u.pathname.endsWith('/artisan_business_clients'))body=u.searchParams.has('id')?client:[client];
  else if(u.pathname.endsWith('/artisan_business_jobs'))body=[job];
  else if(u.pathname.endsWith('/artisan_business_ledger'))body=ledger;
  else if(u.pathname.endsWith('/artisan_business_quotes'))body=[{id:'00000000-0000-4000-8000-000000000007',quote_number:'DEV-2026-0001',title:'PB1 Devis Test',client_id:ids.business,source:'personal',status:'draft',subtotal:500,total:500,discount:0,items:[{type:'service',label:'Réparation fuite sous évier',quantity:2,unit_price:250,total:500}],updated_at:'2026-10-06T10:00:00Z'}];
  else if(u.pathname.includes('mobile-estimator-v1')){
   if(holdEstimator)await new Promise(r=>releaseEstimator=r);
   if(estimatorFail){status=503;body={ok:false,error:'GATEWAY_UNAVAILABLE'};}
   else body={ok:true,session:{session_token:'opaque-test-only',state:'QUALIFIED',metier:'Plomberie'},outcome:{outcome_type:'QUOTE_REQUIRED',service_code:null,scope_summary:['Fuite sous évier'],exclusions_summary:[]}};
  }
  else if(u.pathname.endsWith('/create_my_service_request_v1')){
   confirmCalls.push(input);body={id:ids.request};
   if(confirmCalls.length===1){status=503;body={error:'TEMPORARY_UNAVAILABLE'};}
   else request={request_id:ids.request,description:input.p_description,city:input.p_city,status:'pending'};
  }
  await route.fulfill({status,contentType:'application/json',body:body===null?'':JSON.stringify(body)});
 });
 async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
 async function login(next){role=next;await page.goto(origin+'/sign-in');await page.getByRole('textbox',{name:'Email',exact:true}).fill(user().email);await page.getByRole('textbox',{name:'Mot de passe',exact:true}).fill('synthetic-local-only');await page.getByRole('button',{name:'Me connecter',exact:true}).click();await page.getByLabel('FIXEO, espace '+role,{exact:true}).waitFor();}
 async function menu(label){await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Fermer le menu FIXEO'}).waitFor({state:'hidden'});}
 async function dock(){await page.getByRole('toolbar').waitFor();assert.equal(await page.getByRole('toolbar').getByRole('button').count(),3);}
 try {
  await login('client');await shot('client-rafi');
  await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();await page.getByRole('button',{name:'Fermer le menu FIXEO'}).waitFor();await shot('drawer-client');await page.getByRole('button',{name:'Fermer le menu FIXEO'}).click();
  for(const [label,name] of [['Mon espace','home'],['Interventions','history'],['Alertes','alerts'],['Mon compte','account']]){await menu(label);if(!before)await dock();await shot('client-'+name);results.push('client '+label);}
  await page.getByRole('button',{name:'Modifier mes coordonnées'}).click();await page.getByRole('textbox',{name:'Votre ville',exact:true}).fill('Fes');
  if(!before){await shot('city-suggestions');await page.getByRole('button',{name:'Choisir Fès',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Votre ville',exact:true}).inputValue(),'Fès');assert.equal(await page.getByRole('toolbar').count(),0);}
  await shot('city-client');await page.getByRole('button',{name:'Annuler',exact:true}).click();if(!before)await dock();
  await menu('RAFI');await page.getByRole('button',{name:'Écrire à RAFI',exact:true}).click();await page.getByRole('textbox',{name:'Décrivez le problème'}).fill('Fuite sous évier dans la cuisine');await page.getByRole('textbox',{name:'Votre ville',exact:true}).fill('Fes');
  if(!before)await page.getByRole('button',{name:'Choisir Fès',exact:true}).click();
  if(!before){
   pauseRefresh=true;
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});
   await page.getByText('Vérification de votre accès.',{exact:true}).waitFor();await shot('foreground-revalidation');
   pauseRefresh=false;releaseRefresh?.();await page.getByText('Vérification de votre accès.',{exact:true}).waitFor({state:'hidden'});
   assert.equal(await page.getByRole('textbox',{name:'Décrivez le problème'}).inputValue(),'Fuite sous évier dans la cuisine');
   assert.equal(await page.getByRole('textbox',{name:'Votre ville',exact:true}).inputValue(),'Fès');results.push('foreground preserves RAFI draft and step');
  }
  await page.getByRole('button',{name:'Utiliser ma position',exact:true}).click();await page.getByText('Sur cet appareil, saisissez votre ville ci-dessous.').waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Décrivez le problème'}).inputValue(),'Fuite sous évier dans la cuisine');await shot('geolocation-fallback');
  await page.getByRole('button',{name:'Voir aussi une estimation',exact:true}).click();
  if(!before){await page.getByRole('img',{name:'RAFI réfléchit',exact:true}).waitFor();holdEstimator=false;releaseEstimator?.();results.push('RAFI estimator is thinking during HTTP');}
  await page.getByRole('button',{name:'Réessayer avec RAFI',exact:true}).waitFor();
  if(!before)await page.getByRole('img',{name:'Une action demande votre attention',exact:true}).waitFor();await shot('rafi-retry');
  if(!before){estimatorFail=false;await page.getByRole('button',{name:'Réessayer avec RAFI',exact:true}).click();await page.getByRole('button',{name:'Préparer ma demande de devis',exact:true}).click();await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();await page.getByRole('button',{name:'Vérifier et réessayer la confirmation',exact:true}).waitFor();await shot('rafi-confirmation-retry');assert.equal(confirmCalls.length,1);await page.getByRole('button',{name:'Vérifier et réessayer la confirmation',exact:true}).click();await page.getByText('Votre demande est active. Inutile de la renvoyer.',{exact:true}).waitFor();assert.equal(confirmCalls.length,2);assert.deepEqual(confirmCalls[0],confirmCalls[1]);assert.equal(confirmCalls[0].p_city,'Fès');results.push('native-compatible estimator and identical confirmation retry');}
  await menu('Se déconnecter');await login('artisan');await shot('artisan-home');
  await page.getByRole('button',{name:'Ouvrir le menu FIXEO'}).click();await page.getByRole('button',{name:'Fermer le menu FIXEO'}).waitFor();await shot('drawer-artisan');await page.getByRole('button',{name:'Fermer le menu FIXEO'}).click();
  for(const [label,name] of [['Opportunités','opportunities'],['Missions','missions'],['RAFI','rafi'],['Agenda','agenda'],['Clients','clients'],['Devis','quotes'],['Finance','finance'],['Disponibilité','availability'],['Profil','profile'],['Notifications','notifications']]){
   await menu(label);if(!before)await dock();await shot('artisan-'+name);results.push('artisan '+label);
   if(label==='Finance'){await page.getByRole('button',{name:'Historique',exact:true}).click();if(!before){await page.getByText('Intervention · PB1 intervention Test',{exact:true}).waitFor();assert.equal(await page.getByText('other',{exact:true}).count(),0);}await page.getByText('PB1 Client Test',{exact:true}).scrollIntoViewIfNeeded();await shot('finance-linkage');await page.getByRole('button',{name:'Ajouter un mouvement'}).click();if(!before)assert.equal(await page.getByRole('toolbar').count(),0);await page.getByRole('button',{name:'Fermer la saisie'}).click();if(!before)await dock();}
   if(label==='Agenda'){await page.getByRole('button',{name:'Planifier une intervention'}).click();await page.getByRole('textbox',{name:'Date — JJ/MM/AAAA'}).fill('06102026');await page.getByRole('textbox',{name:'Heure — HH:MM'}).fill('1130');assert.equal(await page.getByRole('textbox',{name:'Date — JJ/MM/AAAA'}).inputValue(),'06/10/2026');assert.equal(await page.getByRole('textbox',{name:'Heure — HH:MM'}).inputValue(),'11:30');await shot('agenda-manual');if(!before)assert.equal(await page.getByRole('toolbar').count(),0);await page.getByRole('button',{name:'Fermer la planification'}).click();if(!before)await dock();}
   if(label==='Disponibilité'&&!before){holdAvailability=true;await page.getByRole('button',{name:'Occupé',exact:true}).click();await page.getByRole('img',{name:'RAFI réfléchit',exact:true}).waitFor();holdAvailability=false;releaseAvailability?.();await page.getByText('Disponibilité enregistrée.',{exact:true}).waitFor();assert.equal(availability,'busy');results.push('artisan action drives thinking and acknowledged success');}
   if(label==='Notifications')await page.getByText('Tout est à jour.',{exact:true}).waitFor();
  }
  await menu('Se déconnecter');await page.getByRole('textbox',{name:'Email',exact:true}).waitFor();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify({scope:'Actual Expo export + synthetic HTTP only, not live staging',before,results,errors,confirmedIntents:confirmCalls.length?1:0,nativePickers:'Not exercised: web renderer',physicalCertification:false},null,2));console.log('PASS',results.length,'flows');
 }catch(e){await shot('failure');console.error('BODY', (await page.locator('body').innerText()).slice(-3500));console.error('ERRORS',errors);throw e;}
 finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
