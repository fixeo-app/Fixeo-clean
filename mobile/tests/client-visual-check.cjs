const { chromium } = require(process.env.W4_PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'node_modules/.w4-visual');
const output = path.resolve(process.argv[3] || 'docs/w4/evidence');
const frames = (page, count = 8) => page.evaluate(n => new Promise(resolve => { const tick = () => --n <= 0 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), count);
(async () => {
 fs.mkdirSync(output, { recursive: true });
 const server = http.createServer((req, res) => {
  const requested = path.basename(req.url.split('?')[0]);
  const file = requested === 'app.js' || requested.endsWith('.png') ? requested : 'index.html';
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html');
  res.end(fs.readFileSync(path.join(root, file)));
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({ headless: true, executablePath: process.env.W4_CHROMIUM_EXECUTABLE, args: JSON.parse(process.env.W4_CHROMIUM_ARGS || '["--no-sandbox","--disable-dev-shm-usage"]') });
 const page = await browser.newPage({ reducedMotion: 'reduce' });
 const errors = [], externalRequests = [], results = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.route('**/*', route => { const url = route.request().url(); if (url.startsWith(base) || url.startsWith('data:')) return route.continue(); externalRequests.push(url); return route.abort(); });
 async function open(scene = 'idle', width = 390, extra = '', motion = 'reduce') {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(`${base}/?scene=${scene}${extra}`);
  await page.waitForFunction(() => globalThis.__w4 && document.querySelector('[role="button"]')).catch(error => { console.error(errors); throw error; });
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="rafi-master-material"] img')].every(img => img.complete && img.naturalWidth > 0));
  assert.deepEqual(errors, []);
 }
 async function geometry() {
  const violations = await page.evaluate(() => {
   const bad = [];
   if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('document overflow');
   for (const el of document.querySelectorAll('[dir="auto"],input,textarea')) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(el).fontFamily.toLowerCase().includes('ionicons')) continue;
    if (rect.left < -1 || rect.right > innerWidth + 1) bad.push(`text outside: ${el.textContent}`);
    if (el.scrollWidth > el.clientWidth + 2) bad.push(`text clipped: ${el.textContent}`);
   }
   for (const el of document.querySelectorAll('[role="button"]')) {
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height && (rect.width < 47.9 || rect.height < 47.9)) bad.push(`small target: ${el.getAttribute('aria-label') || el.textContent} ${rect.width}×${rect.height}`);
   }
   return bad;
  });
  assert.deepEqual(violations, []);
 }
 async function capture(name) { await geometry(); await page.screenshot({ path: path.join(output, name + '.png') }); }
 async function largeText() {
  await page.evaluate(() => { for (const el of document.querySelectorAll('[dir="auto"],input,textarea')) {
   const s = getComputedStyle(el); if (s.fontFamily.toLowerCase().includes('ionicons')) continue;
   const size = parseFloat(s.fontSize); el.style.fontSize = size * 2 + 'px'; el.style.lineHeight = (parseFloat(s.lineHeight) || size * 1.5) * 2 + 'px';
  } }); await frames(page);
 }
 async function writeProblem() {
  await page.getByRole('button', { name: 'Écrire à RAFI', exact: true }).click();
  await page.getByRole('textbox', { name: 'Décrivez le problème', exact: true }).fill('Une fuite sous le lavabo.');
 }
 try {
  for (const width of [390, 320]) {
   await open('idle', width);
   assert.equal(await page.getByTestId('client-request-fields').count(), 0);
   assert.equal(await page.getByTestId('rafi-composer').count(), 1);
   assert.deepEqual(await page.evaluate(() => __w4.locationCalls), []);
   const composer = await page.getByTestId('rafi-composer').boundingBox();
   assert.ok(composer.y + composer.height <= (width === 320 ? 568 - 16 : 844 - 34), JSON.stringify(composer));
   assert.equal((await page.getByTestId('client-hero').getByTestId('rafi-core').boundingBox()).width, width === 320 ? 120 : 160);
   await capture(`client-home-idle-${width}`);
   results.push({ scene: 'idle', width, primaryVisible: true, heroDiameter: width === 320 ? 120 : 160 });
  }
  for (const scene of ['matching', 'assigned', 'intervention', 'validation']) {
   await open(scene);
   await page.getByTestId('client-active-situation').waitFor();
   assert.equal(await page.getByTestId('rafi-composer').count(), 0);
   assert.equal(await page.getByTestId('client-primary-action').count(), scene === 'matching' ? 0 : 1);
   await capture(`client-home-${scene}-390`);
   if (scene !== 'matching') {
    await page.getByTestId('client-primary-action').click();
    const navigations = await page.evaluate(() => __w4.navigations);
    assert.deepEqual(navigations.at(-1), { pathname: '/client-mission/[id]', params: { id: '00000000-0000-4000-8000-000000000002' } });
   }
   results.push({ scene, onePrimaryAction: true, exactMissionRoute: scene !== 'matching' });
  }
  for (const scene of ['workspace', 'history', 'alerts', 'account', 'mission']) for (const width of [390, 320]) {
   await open(scene, width);
   await capture(`client-${scene}-${width}`);
   if (scene === 'workspace') {
    const dock = page.getByRole('toolbar'); assert.equal(await dock.getByRole('button').count(), 3);
    await page.getByTestId('client-primary-action').scrollIntoViewIfNeeded();
    const action = await page.getByTestId('client-primary-action').boundingBox(), box = await dock.boundingBox();
    assert.ok(action.y + action.height <= box.y, JSON.stringify({ action, box }));
   }
   results.push({ scene, width, geometry: true });
  }
  await open('mission', 390, '&status=new');
  assert.equal(await page.getByTestId('client-validation').count(), 0);
  assert.ok((await page.locator('body').innerText()).includes('FIXEO cherche pour vous.'));
  await capture('client-mission-matching-390');
  for (const status of ['assigned', 'in_progress', 'validated']) {
   await open('mission', 390, '&status=' + status); await capture('client-mission-' + status + '-390');
   assert.equal(await page.getByTestId('client-validation').count(), 0);
  }
  await open('mission');
  await page.getByRole('button', { name: 'Confirmer la fin de l’intervention', exact: true }).click();
  await page.getByText('Tout est terminé.', { exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'confirmCompletedRequest'), [{ name: 'confirmCompletedRequest', args: ['00000000-0000-4000-8000-000000000001'] }]);
  assert.equal(await page.getByTestId('client-validation').count(), 0);
  results.push({ scene: 'validation', originalCallback: true, canonicalId: true, validatedState: true });
  for (const approve of [true, false]) {
   await open('mission', 320, '&status=in_progress&change=1');
   await page.getByRole('button', { name: approve ? 'Accepter l’ajustement' : 'Refuser l’ajustement', exact: true }).click();
   await frames(page);
   assert.deepEqual((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'respondMissionChange')[0].args, ['change-1', approve]);
  }
  await open('mission', 390, '&photos=1');
  assert.equal(await page.getByRole('img', { name: 'Photo avant l’intervention' }).count(), 1);
  assert.equal(await page.getByRole('img', { name: 'Photo après l’intervention' }).count(), 1);
  await open('mission', 390, '&evidenceError=1');
  await page.getByText('Les photos n’ont pas pu être actualisées.', { exact: true }).waitFor();
  await capture('client-mission-evidence-unavailable-390');
  await open('alerts');
  await page.getByRole('button', { name: 'Intervention terminée. Marquer comme lu', exact: true }).click();
  await page.getByRole('button', { name: 'Intervention terminée. Déjà lu', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'markClientNotificationRead').length, 1);
  await open('account');
  assert.equal(await page.getByRole('textbox').count(), 0);
  await page.getByRole('button', { name: 'Modifier mes coordonnées', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre téléphone' }).fill('0600000000');
  await page.getByRole('textbox', { name: 'Votre ville' }).fill('Rabat');
  await page.getByRole('button', { name: 'Enregistrer les coordonnées', exact: true }).click();
  await page.getByText('✓ Coordonnées mises à jour.', { exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'updateClientProfile')[0].args, [{ phone: '0600000000', city: 'Rabat' }]);
  results.push({ scene: 'account-alerts', editDisclosure: true, profileContract: true, readAcknowledgement: true });
  for (const scene of ['workspace', 'history', 'alerts', 'account', 'mission']) {
   await open(scene, 320, '&error=1'); await geometry();
   assert.equal(await page.getByTestId('client-validation').count(), 0);
   if (scene === 'mission') assert.ok(!(await page.locator('body').innerText()).includes('Artisan trouvé'));
  }
  await open('workspace', 390, '&empty=1'); await capture('client-workspace-empty-390');
  for (const geo of ['success', 'denied', 'blocked', 'unavailable', 'no_city', 'timeout', 'web']) {
   await open('idle', 320, '&geo=' + geo);
   await writeProblem();
   assert.deepEqual(await page.evaluate(() => __w4.locationCalls), []);
   await page.getByRole('button', { name: 'Utiliser ma position', exact: true }).click();
   await page.getByRole('button', { name: 'Utiliser ma position', exact: true }).waitFor();
   await page.waitForFunction(() => !document.querySelector('[aria-label="Utiliser ma position"]').getAttribute('aria-disabled') || document.querySelector('[aria-label="Utiliser ma position"]').getAttribute('aria-disabled') === 'false');
   if (geo === 'success') {
    assert.equal(await page.getByRole('textbox', { name: 'Votre ville', exact: true }).inputValue(), 'Rabat');
    await page.getByRole('button', { name: 'Confirmer cette ville', exact: true }).click();
   }
   if (geo === 'web') assert.deepEqual(await page.evaluate(() => __w4.locationCalls), []);
   await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('  Fès  ');
   await page.getByRole('button', { name: 'Confier le problème à FIXEO', exact: true }).click();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(c=>c.name==='createRequest').length,0);
  await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();
   await page.getByTestId('client-active-situation').waitFor();
   const requests = (await page.evaluate(() => __w4.calls)).filter(call => call.name === 'createRequest');
   assert.equal(requests.length, 1); assert.equal(requests[0].args.length, 4); assert.equal(requests[0].args[1], 'Fès');
   assert.ok(requests[0].args.every(value => typeof value === 'string'));
   results.push({ scene: 'geolocation', scenario: geo, manualCorrection: true, normalizedCity: true, requestArguments: 4 });
  }
  await open('idle', 390, '&geo=success'); await writeProblem();
  await page.getByRole('button', { name: 'Utiliser ma position', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer cette ville', exact: true }).waitFor();
  await page.getByTestId('client-location').scrollIntoViewIfNeeded(); await capture('client-city-detected-390');
  await open('idle', 320, '&geo=late'); await writeProblem();
  await page.getByRole('button', { name: 'Utiliser ma position', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('Meknès');
  await frames(page, 30);
  assert.equal(await page.getByRole('textbox', { name: 'Votre ville', exact: true }).inputValue(), 'Meknès');
  assert.ok(!(await page.evaluate(() => __w4.locationCalls)).includes('geocode'));
  results.push({ scene: 'geolocation-late', manualInputCannotBeOverwritten: true });
  await open('idle', 390, '&hold=1'); await writeProblem();
  await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('Rabat');
  await page.getByRole('button', { name: 'Confier le problème à FIXEO', exact: true }).click();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(c=>c.name==='createRequest').length,0);
  await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();
  await page.getByText('On prépare la suite.', { exact: true }).waitFor();
  await capture('client-home-creating-390');
  assert.equal((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'createRequest').length, 1);
  await open('idle', 390, '&ai=1&photoHold=1');
  await page.getByRole('button', { name: 'Montrer une photo à RAFI', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('Rabat');
  await page.getByRole('button', { name: 'Analyser la photo avec RAFI', exact: true }).click();
  await page.getByText('Je regarde avec vous.', { exact: true }).waitFor();
  await page.getByTestId('client-hero').scrollIntoViewIfNeeded(); await capture('client-home-understanding-390');
  await open('idle', 320, '&ai=1&cityError=1');
  await page.getByRole('button', { name: 'Montrer une photo à RAFI', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('Autre ville');
  await page.getByRole('button', { name: 'Analyser la photo avec RAFI', exact: true }).click();
  await page.getByText('Choisissez une ville FIXEO prise en charge pour lancer l’analyse.', { exact: true }).waitFor();
  assert.equal(await page.getByText('LA SÉCURITÉ D’ABORD', { exact: true }).count(), 0);
  assert.equal(await page.getByTestId('client-diagnostic-safety').count(), 0);
  assert.equal((await page.evaluate(() => __w4.calls)).filter(call => call.name === 'createRequest').length, 0);
  await open('idle', 320, '&requestCityError=1'); await writeProblem();
  await page.getByRole('textbox', {name:'Votre ville',exact:true}).fill('Autre ville');
  await page.getByRole('button', {name:'Confier le problème à FIXEO',exact:true}).click();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(c=>c.name==='createRequest').length,0);
  await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();
  await page.getByText('Cette ville n’est pas encore prise en charge. Choisissez une autre ville.',{exact:true}).waitFor();
  assert.equal(await page.getByText('LA SÉCURITÉ D’ABORD', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('textbox',{name:'Votre ville',exact:true}).count(),1);
  for (const safety of [false, true]) {
   await open('idle', 320, '&ai=1' + (safety ? '&safety=1' : ''));
   await page.getByRole('button', { name: 'Montrer une photo à RAFI', exact: true }).click();
   await page.getByRole('textbox', { name: 'Votre ville', exact: true }).fill('Rabat');
   await page.getByRole('button', { name: 'Analyser la photo avec RAFI', exact: true }).click();
   const diagnostic = page.getByTestId(safety ? 'client-diagnostic-safety' : 'client-diagnostic');
   await diagnostic.waitFor(); await diagnostic.evaluate(el => {
     let scroll = el.parentElement; while (scroll && scroll.scrollHeight <= scroll.clientHeight) scroll=scroll.parentElement;
     if (scroll) scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
   }); await frames(page);
   await capture(safety ? 'client-diagnostic-safety-320' : 'client-diagnostic-result-320');
   assert.equal((await page.evaluate(() => __w4.calls)).filter(c => c.name === 'createRequest').length, 0);
   if (safety) {
    assert.equal(await page.getByRole('button', {name:'Cette description correspond',exact:true}).count(),0);
    assert.equal(await page.getByTestId('client-request-fields').count(), 0);
    assert.equal(await page.getByTestId('rafi-composer').count(), 0);
    await page.getByRole('button',{name:'Revenir à mon espace',exact:true}).click();
    assert.equal((await page.evaluate(()=>__w4.navigations)).at(-1),'/client-workspace');
    assert.equal(await page.getByTestId('client-diagnostic-safety').count(),1);
    assert.equal((await page.evaluate(()=>__w4.calls)).filter(c=>c.name==='createRequest').length,0);
   } else {
    assert.equal(await page.getByTestId('client-diagnostic-question').count(),0);
    await page.getByRole('button', {name:'Cette description correspond',exact:true}).click();
    assert.ok((await page.getByRole('textbox', {name:'Décrivez le problème'}).inputValue()).includes('fuite possible'));
    await page.getByRole('button', {name:'Comprendre l’analyse',exact:true}).click();
    assert.ok((await diagnostic.innerText()).includes('HYPOTHÈSE · Joint possiblement usé'));
    await page.getByRole('textbox', {name:'Décrivez le problème'}).fill('Une fuite au lavabo, description corrigée.');
    await page.getByRole('button', {name:'Confier le problème à FIXEO',exact:true}).click();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(c=>c.name==='createRequest').length,0);
  await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();
    await page.getByTestId('client-active-situation').waitFor();
    const requests=(await page.evaluate(() => __w4.calls)).filter(c => c.name === 'createRequest');
    assert.equal(requests.length,1); assert.equal(requests[0].args[2],'Une fuite au lavabo, description corrigée.');
   }
   results.push({scene:'diagnostic',safety,safetyQuestions:0,confirmationBeforeRequest:true,provenancePreserved:true});
  }
  await open('idle',320,'&ai=1&choice=1');
  await page.getByRole('button',{name:'Montrer une photo à RAFI',exact:true}).click();
  await page.getByRole('textbox',{name:'Votre ville',exact:true}).fill('Rabat');
  await page.getByRole('button',{name:'Analyser la photo avec RAFI',exact:true}).click();
  await page.getByTestId('client-diagnostic').waitFor();
  assert.equal(await page.getByTestId('client-diagnostic-question').count(),0);
  assert.equal(await page.getByTestId('client-diagnostic-review').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes('L’eau se propage-t-elle rapidement ?'));
  await page.getByRole('button',{name:'Cette description correspond',exact:true}).click();
  await page.getByRole('button',{name:'Confier le problème à FIXEO',exact:true}).click();
  assert.equal((await page.evaluate(() => __w4.calls)).filter(c=>c.name==='createRequest').length,0);
  await page.getByRole('button',{name:'Confirmer et chercher un artisan',exact:true}).click();
  await page.getByTestId('client-active-situation').waitFor();
  const normalCalls=await page.evaluate(()=>__w4.calls);
  assert.equal(normalCalls.filter(c=>c.name==='createRequest').length,1);
  assert.equal(normalCalls.filter(c=>c.name==='analyzePhoto').length,1);
  results.push({scene:'diagnostic-normal-preventive-prompts',safetyQuestions:0,extraAnalyses:0,requestAllowed:true});
  for (const skip of [false,true]) {
   await open('idle',320,'&ai=1&qualification=1');
   await page.getByRole('button',{name:'Montrer une photo à RAFI',exact:true}).click();
   await page.getByRole('textbox',{name:'Votre ville',exact:true}).fill('Rabat');
   await page.getByRole('button',{name:'Analyser la photo avec RAFI',exact:true}).click();
   await page.getByTestId('client-diagnostic-question').waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Depuis quand constatez-vous ce problème ?'}).count(),0);
   if(!skip) {
    await page.getByTestId('client-diagnostic-question').scrollIntoViewIfNeeded();
    await capture('client-diagnostic-clarification-320');
   }
   if(skip) await page.getByRole('button',{name:'Continuer sans cette précision',exact:true}).click();
   else {
    await page.getByRole('textbox',{name:'À quel moment le problème apparaît-il ?'}).fill('Quand l’eau coule.');
    await page.getByRole('button',{name:'Confirmer cette précision',exact:true}).click();
    assert.equal(await page.getByTestId('client-diagnostic-question').count(),0);
    await page.getByRole('button',{name:'Cette description correspond',exact:true}).click();
    assert.ok((await page.getByRole('textbox',{name:'Décrivez le problème'}).inputValue()).includes('Quand l’eau coule.'));
   }
   assert.equal((await page.evaluate(()=>__w4.calls)).filter(c=>c.name==='analyzePhoto').length,1);
   results.push({scene:'diagnostic-qualification',maxClarifications:1,optionalSkipped:skip,serverLoop:false});
  }
  for (const outcome of ['question','price','diagnostic','labour','addon','quote','route','safety','more']) {
   await open('estimator',320,'&outcome='+outcome); await capture('client-estimator-'+outcome+'-320');
   if (outcome === 'labour') assert.equal(await page.getByTestId('parts-separate').count(),1);
   if (['quote','route','safety','more','addon','question'].includes(outcome)) assert.equal(await page.getByTestId('canonical-amount').count(),0);
   assert.equal((await page.evaluate(() => __w4.calls)).length,0);
   results.push({scene:'estimator-contract',outcome,gatewayConnected:false,requests:0});
  }
  for (const scene of ['idle', 'workspace', 'history', 'alerts', 'account', 'mission']) {
   await open(scene, 320, '&large=1'); await largeText(); await geometry();
   await capture(scene === 'idle' ? 'client-large-text' : 'client-' + scene + '-large-text');
   if (scene === 'workspace') {
    const action = page.getByTestId('client-primary-action'); await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox(); const dock = await page.getByRole('toolbar').count();
    if (dock) assert.ok(box.y + box.height <= (await page.getByRole('toolbar').boundingBox()).y);
   }
  }
  await open('idle', 320, '&large=1&geo=denied'); await writeProblem();
  await page.getByRole('button', { name: 'Utiliser ma position', exact: true }).click(); await frames(page);
  await largeText(); await geometry(); await page.getByTestId('client-location').scrollIntoViewIfNeeded(); await capture('client-city-large-text-320');
  await open('idle', 390);
  const a = await page.screenshot(); await frames(page, 15); const b = await page.screenshot(); assert.ok(a.equals(b), 'Reduced Motion stable');
  fs.writeFileSync(path.join(output, 'client-reduced-motion.png'), b);
  await open('idle', 390, '', 'no-preference'); await geometry();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await frames(page);
  results.push({ scene: 'accessibility', fontScale: 2, screens: 6, cityFallback: true, reducedMotionStable: true, runtimeMotion: true });
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  fs.writeFileSync(path.join(output, 'client-browser-results.json'), JSON.stringify({ results, pageErrors: errors, externalRequests, fixtureNotice: 'Real Client React Native components; typed UI-only services; no backend or physical device.' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, errors: errors.length, externalRequests: externalRequests.length, output }));
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
