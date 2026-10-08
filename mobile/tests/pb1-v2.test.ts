import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createMaterialMotion, materialFrame, type MaterialFrame } from '../ui/rafiMaterialMotion';
import { createArtisanProgressive } from '../lib/artisanProgressive';
import { canonicalCity, citySuggestions, withCanonicalCity, locateInterventionCity, type CityLocationAdapter } from '../lib/clientLocation';
import { understandArtisanCommand } from '../lib/artisanCopilot';
import { withMobileDeadline } from '../lib/mobileResilience';

function clock(compact=false) {
 let next=0; const callbacks=new Map<number,(time:number)=>void>(), frames:MaterialFrame[]=[];
 const driver=createMaterialMotion({ request: fn=>{callbacks.set(++next,fn);return next;},cancel:id=>{callbacks.delete(id);}},f=>frames.push(f),compact);
 const step=(time:number)=>{const batch=[...callbacks.values()]; callbacks.clear(); batch.forEach(f=>f(time));};
 return {driver,step,frames,callbacks};
}
test('PB1 V2 material: running frames change breath and independent internal flow without React',()=>{
 const c=clock();c.driver.setActivity(true,false);
 for(let n=0;n<600;n++)c.step(n*16.67);
 assert.ok(c.frames.length>200);const first=c.frames[0],last=c.frames.at(-1)!;
 assert.notEqual(first.breath,last.breath);assert.ok(last.flow>9);assert.ok(last.time>9);
 assert.ok(c.frames.every(f=>Math.abs(f.breath)<0.014));c.driver.dispose();assert.equal(c.callbacks.size,0);
});
test('PB1 V2 material: local touch, immediate response, peak and viscous relaxation',()=>{
 const c=clock();c.driver.setActivity(true,false);c.step(0);c.driver.touch(0.45,-0.3);
 assert.ok(c.frames.at(-1)!.touch>0);assert.equal(c.frames.at(-1)!.x,0.45);
 for(let n=1;n<190;n++)c.step(n*16.67);
 assert.ok(c.frames.some(f=>f.touch>0.5));assert.equal(c.frames.at(-1)!.touch,0);c.driver.dispose();
});
test('PB1 V2 material: background/viewport pause, no catch-up jump, Reduce Motion and cleanup',()=>{
 const c=clock();c.driver.setActivity(true,false);c.step(0);c.step(50);
 c.driver.setActivity(false,false);const paused=c.driver.snapshot();assert.equal(c.callbacks.size,0);c.step(100000);
 assert.deepEqual(c.driver.snapshot(),paused);
 c.driver.setActivity(true,false);c.step(200000);assert.equal(c.driver.snapshot().time,paused.time);
 c.driver.setActivity(true,true);const reduced=c.driver.snapshot();c.driver.touch(1,1);c.step(200100);assert.deepEqual(c.driver.snapshot(),reduced);assert.equal(c.callbacks.size,0);
 c.driver.dispose();c.driver.setActivity(true,false);assert.equal(c.callbacks.size,0);
});
test('PB1 V2 material: mode transitions preserve phase and compact reduces amplitude',()=>{
 const c=clock();c.driver.setActivity(true,false);for(let n=0;n<100;n++)c.step(n*20);
 const before=c.driver.snapshot();c.driver.setMode('listening');assert.equal(c.driver.snapshot().time,before.time);
 for(let n=100;n<300;n++)c.step(n*20);
 assert.ok(c.driver.snapshot().tension>1);assert.ok(c.driver.snapshot().tension<1.19);
 assert.ok(Math.abs(materialFrame(2,2,1,-10,0,0,true).breath)<Math.abs(materialFrame(2,2,1,-10,0,0,false).breath));c.driver.dispose();
});
test('PB1 V2 permission-return refresh keeps the Artisan capture mounted, failed authority clears private data',async()=>{
 let deny=false,release:(()=>void)|undefined;
 const c=createArtisanProgressive(async()=>{if(release===undefined && deny)throw Error('AUTH_REQUIRED');return {user_id:'fixture'};},{profile:async()=>({city:'Fes'})},()=>{});
 await c.refresh();assert.equal(c.state.authority.status,'ready');
 const refresh=c.refresh(true);assert.equal(c.state.authority.status,'ready');await refresh;
 deny=true;await c.refresh(true);assert.equal(c.state.authority.status,'unavailable');assert.equal(c.state.modules.profile.data,null);
});
test('PB1 V2 city: old spelling is projected canonically without mutation and search supports accents/case',()=>{
 const old={city:'Fes',id:'preserved'};assert.deepEqual(withCanonicalCity(old),{city:'Fès',id:'preserved'});assert.equal(old.city,'Fes');
 for(const s of ['fes','Fes','FES','Fez','Fès'])assert.equal(canonicalCity(s),'Fès');
 assert.equal(citySuggestions('FES')[0].label,'Fès');assert.equal(citySuggestions('rAb')[0].label,'Rabat');
});
const location=():CityLocationAdapter=>({supported:true,requestPermission:async()=>({granted:true}),servicesEnabled:async()=>true,currentPosition:async()=>({coords:{latitude:34,longitude:-5}}),reverseGeocode:async()=>[{city:'Fes',isoCountryCode:'MA'}]});
test('PB1 V2 geo: recent native cache bypasses cold GPS; missing cache falls back to live fix',async()=>{
 let gps=0;const a=location();a.currentPosition=async()=>{gps++;return {coords:{latitude:34,longitude:-5}}};
 a.lastPosition=async()=>({coords:{latitude:34,longitude:-5}});assert.deepEqual(await locateInterventionCity(a),{ok:true,city:'Fès'});assert.equal(gps,0);
 a.lastPosition=async()=>null;await locateInterventionCity(a);assert.equal(gps,1);
});
test('PB1 V2 geo: timeout and cancelled attempt cannot overwrite context or reverse-geocode a late fix',async()=>{
 let release:(v:any)=>void=()=>{},geocodes=0;const a=location();a.currentPosition=()=>new Promise(r=>release=r);a.reverseGeocode=async()=>{geocodes++;return []};
 const context={need:'fuite',city:'Rabat',media:'local://photo'};const copy={...context};
 assert.deepEqual(await locateInterventionCity(a,()=>true,5),{ok:false,reason:'timeout'});release({coords:{latitude:1,longitude:2}});await Promise.resolve();
 assert.equal(geocodes,0);assert.deepEqual(context,copy);assert.deepEqual(await locateInterventionCity(a,()=>false),{ok:false,reason:'cancelled'});
});
function load(file:string,deps:Record<string,unknown>,globals:Record<string,unknown>={}) {
 const exports:Record<string,any>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:(key:string)=>deps[key]||{},setTimeout,clearTimeout,Promise,process:{env:{EXPO_PUBLIC_FIXEO_API_BASE_URL:'https://staging.invalid'}},...globals});return exports;
}
test('PB1 V2 availability: write plus authority read; refusal/mismatch never returns a false success',async()=>{
 let status='unavailable',refuse=false,mismatch=false,writes=0,reads=0;
 const api=load('lib/artisanWorkspace.ts',{'./mobileResilience':{withMobileDeadline},'./artisanOS':{loadArtisanProfile:async()=>{reads++;return {availability:mismatch?'unavailable':status};}},'./supabase':{supabase:{rpc:async(name:string,args:any)=>{assert.equal(name,'update_artisan_availability');writes++;if(refuse)return {data:{ok:false,reason:'onboarding_required'}};status=args.p_status;return {data:{ok:true,status}};}}}});
 assert.equal(await api.setArtisanAvailability('available'),'available');assert.equal(reads,1);
 refuse=true;await assert.rejects(api.setArtisanAvailability('busy'),/onboarding_required/);assert.equal(reads,1);
 refuse=false;mismatch=true;await assert.rejects(api.setArtisanAvailability('available'),/AVAILABILITY_CONFIRMATION_PENDING/);assert.equal(writes,3);
});
test('PB1 V2 copilot: navigation, exact owned quote/client, explicit unsupported, write proposals only',()=>{
 const context:any={clients:[{id:'client-1',full_name:'PB1 Client Test'}],quotes:[{id:'quote-1',title:'PB1 Devis Test',quote_number:'DEV-2026-0001',client_id:'client-1'}]};
 const q=understandArtisanCommand('Ouvre mon devis PB1 Client Test',context);assert.equal(q.kind,'navigate');if(q.kind==='navigate')assert.equal(q.params?.id,'quote-1');
 const client=understandArtisanCommand('Montre le client PB1 Client Test',context);assert.equal(client.kind,'navigate');if(client.kind==='navigate')assert.equal(client.params?.id,'client-1');
 assert.equal(understandArtisanCommand('Passe-moi disponible').kind,'availability');
 assert.equal(understandArtisanCommand('Ne me passe pas disponible').kind,'unsupported');
 assert.equal(understandArtisanCommand('Supprime tous mes devis').kind,'unsupported');
 const finance=understandArtisanCommand('Ajoute un encaissement de 500,50 DH');assert.equal(finance.kind,'navigate');if(finance.kind==='navigate')assert.equal(finance.params?.amount,'500,50');
 for(const command of ['Qu’est-ce que j’ai aujourd’hui ?','Prépare un devis','Planifie une intervention demain','Ouvre mes finances','Qu’est-ce qui mérite mon attention ?'])assert.equal(understandArtisanCommand(command).kind,'navigate');
 assert.equal(understandArtisanCommand('Appelle un client et négocie le prix').kind,'unsupported');
 assert.equal(understandArtisanCommand('Fais une danse').kind,'unsupported');
});
test('PB1 V2 multipart uses the selected local photo bytes source and never starts until called',async()=>{
 const forms:any[]=[];let calls=0;
 class Form { entries:any[]=[];constructor(){forms.push(this)}append(...args:any[]){this.entries.push(args)} }
 const transport=load('lib/mobileResilience.ts',{}, {AbortController,fetch:async(_url:string,init:any)=>{calls++;assert.equal(init.body,forms[0]);return {ok:true,json:async()=>({ok:true,result:{facts:[]}})};}});
 const api=load('lib/mobileDiagnostic.ts',{'./mobileResilience':transport,'./supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}}}}, {FormData:Form});
 assert.equal(calls,0);await api.analyzeMobileDiagnosticPhoto({uri:'file:///selected-normalized.jpg',mimeType:'image/jpeg',city:'Fès',description:''});
 assert.equal(calls,1);assert.equal(forms[0].entries[0][1].uri,'file:///selected-normalized.jpg');assert.equal(forms[0].entries[0][1].type,'image/jpeg');
});

test('PB1 V2 city projection covers both mission details and the current request without changing RPC authority',async()=>{
 const calls:string[]=[];const api=load('lib/missionTerrain.ts',{'./clientLocation':{withCanonicalCity},'./supabase':{supabase:{rpc:async(name:string)=>{calls.push(name);return {data:{ok:true,city:'Fes',mission:{city:'Fes'},request:{city:'Fes'}}};}}}});
 for(const method of ['getMyCurrentArtisanMission','getMyCurrentClientMission','getClientMissionDetail','getArtisanMissionDetail','getMyCurrentClientRequest'])assert.equal((await api[method]('fixture-id')).city,'Fès');
 assert.deepEqual(calls,['get_my_current_artisan_mission_v1','get_my_current_client_mission_v1','get_my_client_mission_detail_v1','get_accepted_mission_detail','get_my_current_client_request_v1']);
});

test('PB1 V2 stalled native location cache still leaves time for a fresh fix',async()=>{
 const a=location();let fresh=0;a.lastPosition=()=>new Promise(()=>{});a.currentPosition=async()=>{fresh++;return {coords:{latitude:34,longitude:-5}}};
 assert.deepEqual(await locateInterventionCity(a,()=>true,80),{ok:true,city:'Fès'});assert.equal(fresh,1);
});
