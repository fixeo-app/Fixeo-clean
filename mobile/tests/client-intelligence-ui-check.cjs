// LOCAL COMPONENT REGRESSION ONLY. Backend fixtures; never staging/E2E certification.
const {chromium}=require(process.env.W4_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.argv[2] || '/tmp/w4-final-ui');
let base=process.env.W4_UI_URL;
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const server=require('node:http').createServer((req,res)=>{
  const name=path.basename(req.url.split('?')[0]);
  const file=name==='app.js'||name.endsWith('.png')?name:'index.html';
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'text/html');
  res.end(fs.readFileSync(path.join(process.env.W4_UI_ROOT || '/tmp/w4-final-app',file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base ||= `http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.W4_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.W4_CHROMIUM_ARGS || '["--no-sandbox"]')});
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'}),errors=[],passed=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
 const button=name=>page.getByRole('button',{name,exact:true});
 const calls=()=>page.evaluate(()=>__w4.calls);
 async function open(flags='') {await page.goto(base+'/?ai=1'+flags);await button('Écrire à RAFI').waitFor();}
 async function need(description='Combien pour une fuite sous le lavabo ?') {
  await button('Écrire à RAFI').click();await page.getByLabel('Décrivez le problème',{exact:true}).fill(description);await page.getByLabel('Votre ville',{exact:true}).fill('Rabat');
 }
 async function estimate(){await button('Obtenir mon estimation avec RAFI').click();}
 async function capture(name){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow');
  assert.ok(!(await page.locator('body').innerText()).includes('opaque-fixture'),'opaque context leaked');
  await page.screenshot({path:path.join(output,name+'.png')});
 }
 async function confirmPrice(){await button('Continuer avec cette estimation').click();await page.getByLabel('Téléphone de contact',{exact:true}).fill('0612345678');}
 try {
  await open();await need();await estimate();await page.getByTestId('canonical-amount').waitFor();
  await page.getByTestId('client-fixeo-result').scrollIntoViewIfNeeded();await capture('estimator-price-320-local');
  await confirmPrice();await page.getByTestId('client-estimator-confirmation').scrollIntoViewIfNeeded();await capture('estimator-confirmation-320-local');
  await button('Confirmer et chercher un artisan').evaluate(el=>{el.click();el.click();});await page.getByTestId('client-active-situation').waitFor();
  let entries=(await calls()).filter(c=>c.name==='mobileEstimator');
  assert.equal(entries.filter(c=>c.args[0].action==='confirm_request').length,1);
  assert.equal(entries[0].args[0].entry_context.diagnostic_token,undefined);passed.push('price_without_diagnostic_double_tap_one_handoff');

  await open('&confirmRetry=1');await need();await estimate();await confirmPrice();await button('Confirmer et chercher un artisan').click();
  await button('Vérifier et réessayer la confirmation').waitFor();
  assert.equal(await button('Revenir à mon besoin').count(),0);await capture('confirmation-retry-320-local');
  await button('Vérifier et réessayer la confirmation').click();await page.getByTestId('client-active-situation').waitFor();
  entries=(await calls()).filter(c=>c.name==='mobileEstimator'&&c.args[0].action==='confirm_request');assert.equal(entries.length,2);assert.deepEqual(entries[0].args,entries[1].args);passed.push('uncertain_confirmation_frozen_identical_manual_retry');

  await open('&quote=1&question=1');await need();await estimate();await page.getByTestId('client-estimator-question').waitFor();
  await capture('qualification-320-local');await button('Oui, un seul équipement accessible').click();
  await button('Préparer ma demande de devis').waitFor();await page.getByTestId('client-fixeo-result').scrollIntoViewIfNeeded();await capture('quote-required-320-local');
  assert.equal(await page.getByTestId('canonical-amount').count(),0);
  await button('Préparer ma demande de devis').click();await button('Confirmer et chercher un artisan').click();await page.getByTestId('client-active-situation').waitFor();
  assert.equal((await calls()).filter(c=>c.name==='createRequest').length,1);passed.push('one_qualification_quote_no_price_direct_request');

  await open('&quote=1');await need();await button('Montrer une photo à RAFI').click();
  await page.getByRole('checkbox',{name:'Conserver l’analyse pour la suite',exact:true}).click();
  await button('Analyser la photo avec RAFI').click();await button('Cette description correspond').click();
  await button('Voir aussi une estimation').click();await button('Préparer ma demande de devis').click();
  await page.getByLabel('Téléphone de contact',{exact:true}).fill('0612345678');await button('Confirmer et chercher un artisan').click();
  await page.getByTestId('client-active-situation').waitFor();
  entries=await calls();assert.equal(entries.filter(c=>c.name==='persistedPhoto').length,1);
  assert.equal(entries.find(c=>c.name==='mobileEstimator').args[0].entry_context.diagnostic_token,'opaque-fixture-reference');
  assert.equal(entries.filter(c=>c.name==='mobileEstimator'&&c.args[0].action==='confirm_quote').length,1);passed.push('persisted_consent_diagnostic_quote_bridge_canonical_id');

  await open('&estimateSafety=1');await need('Estimation : une très forte odeur de gaz.');await estimate();
  await page.getByTestId('client-safety-stop').waitFor();await capture('safety-stop-320-local');
  assert.equal(await page.getByTestId('client-request-fields').count(),0);assert.equal(await page.getByTestId('client-intelligence').count(),0);
  assert.equal((await calls()).filter(c=>c.name==='createRequest').length,0);passed.push('server_stop_removes_commercial_actions');

  for(const flag of ['gatewayError','expired','authError']){
   await open('&'+flag+'=1');await need();await estimate();await page.getByRole('alert').waitFor();
   assert.equal((await calls()).filter(c=>c.name==='createRequest').length,0);
   if(flag==='gatewayError'){await button('Réessayer avec RAFI').click();assert.equal((await calls()).filter(c=>c.name==='mobileEstimator').length,2);}
   if(flag==='authError')assert.equal(await button('Me reconnecter').count(),1);
   if(flag==='expired'){await button('Revenir à mon besoin').click();await page.getByTestId('client-request-fields').waitFor();}
   passed.push(flag+'_recoverable_no_false_success');
  }
  await page.goto(base+'/?bootstrapOffline=1');
  await button('Réessayer l’ouverture de mon espace').waitFor();
  assert.equal((await calls()).filter(c=>c.name==='getStableSession').length,3);
  await button('Réessayer l’ouverture de mon espace').click();
  await button('Réessayer l’ouverture de mon espace').waitFor();
  assert.equal((await calls()).filter(c=>c.name==='getStableSession').length,6);
  passed.push('offline_bootstrap_bounded_manual_retry');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({kind:'local-component-regression-with-fixtures',staging_certified:false,passed,errors},null,2));
  console.log(JSON.stringify({passed:passed.length,errors:errors.length,staging_certified:false}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
