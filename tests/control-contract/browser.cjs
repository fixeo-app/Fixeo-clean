'use strict';
// Isolated browser fixture server. No Production configuration, identities or network writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/control-os/bloc34/evidence/browser');
const id='00000000-0000-4000-8000-000000000100',other='00000000-0000-4000-8000-000000000020',now=new Date().toISOString();let fault=false,executions=0;
const row={id,city:'Fès',service_category:'plomberie',status:'new',urgency:'urgent',age_minutes:120,origin:'client',executor:'unassigned',operational_state:'waiting',active_offers:0,missions:[],internal_assignments:[],dispatch:{queued:0,sent_evidence:0,retry_count:0}};
const R=require('../../api/control/rafi-decisions');
const brief=R.build(Object.fromEntries(R.SOURCES.map(s=>[s,R.sourceState(s,{source:s,contract_version:'rafi-observations-v1',as_of:now,total_observations:s==='operations'?1:0,has_more:false,observations:s==='operations'?[{kind:'request.waiting',target_type:'request',target_id:id,count:1,city:'Fès',service_category:'plomberie',created_at:new Date(Date.now()-120*60000).toISOString(),reference:'public.service_requests',facts:{status:'new',urgency:'urgent'}}]:[]})])));
function result(op,b){
 if(op==='operations')return {items:b.city&&b.city!=='Fès'?[]:[row],as_of:now,has_more:false,next_cursor:null};
 if(op==='decisions')return brief;
 if(op==='dossier')return {entity_type:b.type,id:b.id,request_id:b.type==='request'?b.id:null,summary:b.type==='request'?row:{id:b.id,name:'Profil synthétique isolé',availability:'available'},provenance:b.type==='request'?'public.service_requests':'public.artisans',as_of:now};
 if(op==='dossier-section')return {items:b.section==='relations'&&b.type==='request'?[{type:'artisan',id:other,relation:'target_proposal',source:'public.service_requests.target_artisan_id',access:'accessible'}]:[],has_more:false,as_of:now};
 if(op==='operation-context')return {item:row,as_of:now};
 if(op==='dispatch-candidates')return {candidates:[{id:other,rank:1,city:'Fès',service_category:'plomberie'}]};
 if(op==='action/preview')return {preview_id:id,current:row,target:{id,type:'request'},effect:b.payload,preconditions:['admin','request new'],expires_at:new Date(Date.now()+300000).toISOString(),authority:'Dispatch',effect_description:'Proposition synthétique isolée — aucune notification réelle.'};
 if(op==='action/execute'){executions++;return {ok:true,audit_id:id,correlation_id:id,idempotency_key:b.idempotency_key,verified:{id}};}
 if(op==='search')return {items:[{type:'request',id,summary:row}],has_more:false,as_of:now};
 throw Error('UNEXPECTED_FIXTURE_OPERATION');
}
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/control-v1/')){let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text||'{}'),op=pathname.slice('/api/control-v1/'.length);res.setHeader('Content-Type','application/json');if(fault&&op==='dossier-section'&&body.section==='timeline'){res.statusCode=503;return res.end(JSON.stringify({ok:false,code:'SOURCE_TIMEOUT'}));}return res.end(JSON.stringify({ok:true,...result(op,body)}));}
 if(pathname==='/admin.html'){
  let html=fs.readFileSync(path.join(root,'admin.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]+(?:fonts.googleapis|preconnect)[^>]*>/gi,'');
  const boot=`window.FixeoSupabaseClient={client:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic.isolated.token',user:{id:'${other}'}}}})}}};window.FixeoAdmin={navigate:view=>{document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id==='sec-'+view));}};`;
  html=html.replace('</body>',`<script>${boot}</script>`+['fixeo-control-client-v1.js','admin-fixeo-dossier.js','admin-fixeo-operations.js','admin-rafi-decision-center.js'].map(x=>`<script src="/js/${x}"></script>`).join('')+`<script>FixeoAdmin.navigate('operations');FixeoOperations.refresh(true);FixeoRafi.load();document.getElementById('page-title').textContent='Recette isolée — données synthétiques';document.addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(b)FixeoDossier.open(b.dataset.kind,b.dataset.id);});</script></body>`);
  res.setHeader('Content-Type','text/html');return res.end(html);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;const checks=[];try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/admin.html';browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Reject unexpected external traffic: fixtures and assets are local only.
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
 await page.goto(url);await page.waitForSelector('.operation-row');assert.equal(await page.locator('.operation-row').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('desktop_operations_layout');
 fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'operations-desktop.png')});
 await page.getByRole('button',{name:/plomberie.*Fès/}).click();await page.waitForSelector('#dossier-timeline');assert.equal(await page.locator('#drawer').getAttribute('aria-modal'),'true');assert.equal(await page.locator('#drawer-close').evaluate(e=>e===document.activeElement),true);checks.push('dossier_focus_and_provenance');await page.screenshot({path:path.join(out,'dossier-desktop.png')});
 await page.getByRole('button',{name:'Préparer le dispatch',exact:true}).click();await page.locator('textarea[name=reason]').fill('Revue synthétique isolée');await page.getByRole('button',{name:'Vérifier les préconditions et voir l’aperçu'}).click();await page.waitForSelector('dialog[open]');assert.equal(executions,0);await page.getByRole('button',{name:'Revenir',exact:true}).click();assert.equal(executions,0);checks.push('prepare_confirm_cancel_no_execution');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#drawer').isHidden(),true);await page.locator('#ops-city').fill('Ville absente');await page.waitForSelector('.empty');assert.equal(await page.locator('.operation-row').count(),0);await page.locator('#ops-reset').click();await page.waitForSelector('.operation-row');checks.push('canonical_filter_empty_reset');
 fault=true;await page.getByRole('button',{name:/plomberie.*Fès/}).click();await page.waitForSelector('#dossier-timeline .error');assert.match(await page.locator('#dossier-timeline').innerText(),/SOURCE_TIMEOUT/);assert.match(await page.locator('#drawer-summary').innerText(),/public.service_requests/);checks.push('independent_source_error');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'dossier-mobile.png')});await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'operations-mobile.png')});checks.push('mobile_390_no_overflow');assert.deepEqual(errors,[]);checks.push('no_browser_runtime_errors');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'PASS',checks,executions,source:'isolated synthetic HTTP renderer; no Production credentials'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,executions}));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));}})();
