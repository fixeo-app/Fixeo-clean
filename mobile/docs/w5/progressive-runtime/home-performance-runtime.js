report.performance=[];
async function perfCase(name,{slowTable,delay=0,failTable}={}){
  await go('main','/artisan-workspace/profile');
  await pages.main.getByRole('textbox',{name:'Présentation professionnelle',exact:true}).waitFor({timeout:40000});
  const p=pages.main, filter='**/rest/v1/**'; let intercepted=0;
  const inject=async route=>{const path=new URL(route.request().url()).pathname;
    if(failTable&&path.endsWith('/'+failTable)){intercepted++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated module unavailable'})});}
    if(slowTable&&path.endsWith('/'+slowTable)){intercepted++;await new Promise(r=>setTimeout(r,delay));}
    await route.fallback();
  };
  if(slowTable||failTable)await p.route(filter,inject);
  const from=report.calls.length,t=Date.now();
  await go('main','/artisan');
  await p.getByTestId('artisan-priority').waitFor();
  const shellMs=Date.now()-t; assert(shellMs<1500,'Home shell should render without network');
  assert(await p.getByTestId('home-rafi').count());
  await btn(p,'Ouvrir le menu FIXEO').click(); await btn(p,'Fermer le menu FIXEO').waitFor();
  const drawerMs=Date.now()-t; await btn(p,'Fermer le menu FIXEO').click();
  await btn(p,'Parler avec RAFI').waitFor({timeout:35000}); const authorityMs=Date.now()-t;
  await btn(p,'Suivre la validation').waitFor({timeout:35000}); const missionMs=Date.now()-t;
  const ledgerAtMission=await p.getByTestId('home-ledger').getAttribute('aria-label');
  if(slowTable==='artisan_business_ledger')assert.match(ledgerAtMission,/loading/);
  if(failTable){await btn(p,'Réessayer · Finances').waitFor({timeout:35000});assert.equal(await p.getByTestId('home-mission').getAttribute('aria-label'),'Mission : ready');await capture('main',name+'-usable');}
  else await p.waitForFunction(()=>['mission','offers','jobs','profile','quotes','ledger'].every(k=>document.querySelector('[data-testid="home-'+k+'"]')?.getAttribute('aria-label')?.endsWith(': ready')),{},{timeout:35000});
  const modulesMs=Date.now()-t;
  const calls=report.calls.slice(from).filter(c=>c.page==='main');
  const counts={};for(const c of calls)counts[c.path]=(counts[c.path]||0)+1;
  assert.equal(counts['/rest/v1/artisan_business_clients']||0,0);assert.equal(counts['/rest/v1/notifications']||0,0);
  for(const [path,n]of Object.entries(counts))if(path.startsWith('/rest/'))assert.equal(n,1,'duplicate Home read: '+path);
  report.performance.push({name,synthetic_fault:slowTable?{table:slowTable,delay_ms:delay}:failTable?{table:failTable,status:503}:null,shell_ms:shellMs,drawer_interactive_ms:drawerMs,authority_rafi_ms:authorityMs,mission_action_ms:missionMs,all_modules_or_isolated_error_ms:modulesMs,ledger_state_at_mission:ledgerAtMission,intercepted,reads:counts});
  await capture('main',name);
  if(slowTable||failTable)await p.unroute(filter,inject);
  if(failTable){const before=report.calls.length;await btn(p,'Réessayer · Finances').click();await p.waitForFunction(()=>document.querySelector('[data-testid="home-ledger"]')?.getAttribute('aria-label')==='Finances : ready',{},{timeout:35000});const retryCalls=report.calls.slice(before).filter(c=>c.page==='main');assert.deepEqual(retryCalls.map(c=>c.path).sort(),['/rest/v1/artisan_business_ledger','/rest/v1/rpc/get_my_mobile_artisan_access_v1'].sort());report.performance.at(-1).retry_only_authority_and_ledger=true;}
  report.passed.push('HOME_PROGRESSIVE_'+name.toUpperCase());
  save();console.log(JSON.stringify(report.performance.at(-1)));
}
await perfCase('normal');
await perfCase('slow-crm',{slowTable:'artisan_business_clients',delay:25000});
await perfCase('slow-finance',{slowTable:'artisan_business_ledger',delay:15000});
await perfCase('slow-notifications',{slowTable:'notifications',delay:25000});
await perfCase('unavailable-finance',{failTable:'artisan_business_ledger'});
