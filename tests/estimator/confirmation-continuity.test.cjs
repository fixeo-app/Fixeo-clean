const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Minimal DOM double. No browser, live URL, production credentials or network.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.isConnected = true; this.hidden = false; this.value = ''; this.style = {setProperty() {}}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  fire(k, extra = {}) { for (const fn of this.listeners[k] || []) fn({preventDefault() {}, ...extra}); }
  focus() { this.focused = true; }
  contains(n) { return !!this.find(c=>c===n); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.isConnected = false; }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const n = c.find(pred); if(n) return n; } }
}
function storage() {
  const data = new Map();
  return {data, fail: false, getItem(k) {return data.get(k) || null;}, setItem(k,v) {if(this.fail) throw Error('blocked'); data.set(k,v);}, removeItem(k) {data.delete(k);} };
}
function deferred() {let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject};}
const flush = () => new Promise(resolve => setImmediate(resolve));
const validContext = {valid:true, outcome_type:'PRICE_READY', amount_mad:250, service_label:'Réparation fuite', city_slug:'rabat'};
const confirmed = {ok:true, replayed:false, request_id:'test-request', tracking_ref:'FX-TEST', guest_token:'a'.repeat(64), dispatch_ok:true};
function setup({context=validContext, confirm=()=>confirmed, flag=true} = {}) {
  const document = new Element('document'); document.body = new Element('body'); document.activeElement = new Element('button'); document.createElement = tag=>new Element(tag); document.querySelectorAll = ()=>[];
  const localStorage = storage(), sessionStorage = storage(), calls=[];
  const window = {innerHeight:844, addEventListener(){},removeEventListener(){},FixeoEstimatorConfig:{estimatorV2Enabled:flag}, FixeoEstimatorV2:{hide(){},reveal(){}}};
  const runtime = vm.createContext({window,document,localStorage,sessionStorage,Map,Set,Promise,Number,Date,console,
    fetch: async (url, options) => {
      assert.equal(url, '/api/estimator-v1');
      const body = JSON.parse(options.body); calls.push(body);
      const result = body.action === 'verify_pricing_context' ? context : await confirm(body);
      return {json:async()=>result};
    }});
  vm.runInContext(read('js/fixeo-estimator-api-v1.js'),runtime);
  vm.runInContext(read('js/fixeo-estimator-reservation-bridge-v1.js'),runtime);
  const open = (token='opaque-test-context') => {document.fire('fixeo:estimator-reserve',{detail:{pricing_context_token:token}});};
  const dialog = () => document.body.children.filter(n=>n.isConnected).at(-1);
  const field = () => dialog().find(n=>n.tag==='input');
  const submit = () => dialog().find(n=>n.tag==='form').fire('submit');
  const text = () => {const walk=n=>[n.textContent||'',...n.children.map(walk)].join(' ');return walk(dialog());};
  return {window,document,localStorage,sessionStorage,calls,open,dialog,field,submit,text};
}

test('opening verifies only; double CTA opens one dialog and never confirms', async()=>{
  const x=setup();x.open();x.open();await flush();assert.equal(x.document.body.children.filter(n=>n.tag==='dialog').length,1);
  assert.deepEqual(x.calls.map(c=>c.action),['verify_pricing_context']);assert.match(x.text(),/250 MAD/);
});
test('confirmation sends only action/token/phone and blocks repeated submit', async()=>{
  const d=deferred();const x=setup({confirm:()=>d.promise});x.open();await flush();x.field().value='06 00 00 00 00';x.submit();x.submit();await flush();
  assert.deepEqual(x.calls[1],{action:'confirm_request',pricing_context_token:'opaque-test-context',client_phone:'0600000000'});
  assert.equal(x.calls.length,2); assert.equal(x.dialog().find(n=>n.tag==='button'&&n.type==='submit').disabled,true);
  x.dialog().fire('cancel');assert.equal(x.dialog().isConnected,true);
  d.resolve(confirmed);await flush();assert.match(x.text(),/Votre demande est enregistrée/);
  assert.equal(x.dialog().find(n=>n.tag==='a').href,'/suivi-demande.html');
  assert.equal(JSON.parse(x.localStorage.getItem('fixeo_guest_access_v1'))['FX-TEST'].server_request_id,'test-request');
  assert.ok(!x.text().includes(confirmed.guest_token));assert.ok(!x.text().includes('opaque-test-context'));
});
test('invalid phone makes no confirmation call',async()=>{
  const x=setup();x.open();await flush();x.field().value='123';x.submit();await flush();assert.equal(x.calls.length,1);assert.match(x.text(),/numéro marocain valide/);
});
test('lost response and reopen retry the identical payload; replay stores same access',async()=>{
  let count=0;const x=setup({confirm:()=>{if(++count===1)throw Error('lost');return {...confirmed,replayed:true};}});
  x.open();await flush();x.field().value='0600000000';x.submit();await flush();assert.match(x.text(),/peut-être été enregistrée/);
  x.dialog().fire('cancel');x.open();await flush();assert.equal(x.field().readOnly,true);
  assert.match(x.text(),/Réparation fuite · Rabat — 250 MAD/);
  x.field().value='0700000000';x.submit();await flush();assert.deepEqual(x.calls[1],x.calls[2]);assert.equal(x.calls.length,3);
  x.dialog().fire('cancel');x.open();await flush();assert.equal(x.calls.length,3);assert.match(x.text(),/enregistrée/);
  assert.equal(Object.keys(JSON.parse(x.localStorage.getItem('fixeo_guest_access_v1'))).length,1);
});
test('dispatch failure remains a confirmed request without claiming an artisan',async()=>{
  const x=setup({confirm:()=>({...confirmed,dispatch_ok:false})});x.open();await flush();x.field().value='0600000000';x.submit();await flush();
  assert.match(x.text(),/recherche d’un artisan reste à confirmer/);assert.equal(x.dialog().find(n=>n.tag==='form').hidden,true);
});
test('storage failure retries saving only, never sends another confirmation',async()=>{
  const x=setup();x.localStorage.fail=true;x.open();await flush();x.field().value='0600000000';x.submit();await flush();
  assert.match(x.text(),/suivi n’a pas pu être conservé/);assert.equal(x.dialog().find(n=>n.tag==='a'),undefined);
  x.localStorage.fail=false;x.dialog().find(n=>n.textContent==='Réessayer d’ouvrir le suivi').fire('click');await flush();
  assert.equal(x.calls.length,2);assert.equal(x.dialog().find(n=>n.tag==='a').href,'/suivi-demande.html');
});
test('expired or non-payable contexts fail closed',async()=>{
  for(const context of [{valid:false},{...validContext,outcome_type:'SAFETY_STOP'},{...validContext,amount_mad:null}]) {
    const x=setup({context});x.open();await flush();x.field().value='0600000000';x.submit();await flush();assert.equal(x.calls.length,1);
    assert.equal(x.dialog().find(n=>n.tag==='button'&&n.type==='submit').disabled,true);
  }
});
test('late verification after close cannot update a different attempt',async()=>{
  const x=setup();x.open();x.dialog().fire('cancel');await flush();assert.equal(x.document.body.children[0].isConnected,false);
  x.open('other-context');await flush();assert.equal(x.calls.at(-1).pricing_context_token,'other-context');
});
test('partial pricing and diagnostic retain their scope',async()=>{
  for(const context of [{...validContext,outcome_type:'LABOUR_PLUS_PART_READY',labour_amount_mad:150},{...validContext,outcome_type:'DIAGNOSTIC_READY'}]) {
    const x=setup({context});x.open();await flush();assert.match(x.text(),context.outcome_type==='DIAGNOSTIC_READY'?/pour le diagnostic/:/150 MAD de main-d’œuvre/);
  }
});
test('disabled feature and missing token never open or send',async()=>{
  const x=setup({flag:false});x.open();await flush();assert.equal(x.calls.length,0);assert.equal(x.dialog(),undefined);
  const y=setup();y.open('');await flush();assert.equal(y.calls.length,0);assert.equal(y.dialog(),undefined);
});
test('both entry points delegate to the shared bridge; resume cannot open picker',()=>{
  for(const p of ['index.html','js/fixeo-estimation-page-v1.js'])assert.ok(!/addEventListener\('fixeo:estimator-reserve'/.test(read(p)));
  assert.match(read('js/fixeo-estimation-page-v1.js'),/bridge.openConfirmation\(bridge.getContext\(\)\)/);
  for(const p of ['index.html','estimation.html'])assert.match(read(p),/fixeo-estimator-reservation-bridge-v1.js\?v=ultra-premium-v3/);
});


test('confirmed context survives bridge reload and never confirms again', async()=>{
  const x=setup(); x.window.FixeoEstimatorReservationBridge.prepareContext('opaque-test-context');
  x.open(); await flush(); x.field().value='0600000000'; x.submit(); await flush();
  assert.equal(x.window.FixeoEstimatorReservationBridge.getCompletion().tracking_ref,'FX-TEST');
  const done=x.sessionStorage.getItem('fixeo_estimator_completed_v1');
  assert.ok(!done.includes(confirmed.guest_token)); assert.ok(!done.includes('0600000000'));
  const y=setup(); y.sessionStorage.setItem('fixeo_estimator_completed_v1',done);
  y.open(); await flush(); assert.equal(y.calls.length,0); assert.match(y.text(),/Votre demande est enregistrée/);
  y.window.FixeoEstimatorReservationBridge.clearContext();
  assert.equal(y.window.FixeoEstimatorReservationBridge.getCompletion('opaque-test-context'),null);
});
test('completion never applies to another estimation token', async()=>{
  const x=setup(); x.window.FixeoEstimatorReservationBridge.completeContext('old-token',confirmed);
  x.open('new-token'); await flush(); assert.equal(x.calls.length,1); assert.match(x.text(),/Confirmer votre intervention/);
});
