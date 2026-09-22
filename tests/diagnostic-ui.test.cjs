'use strict';
// Run with NODE_PATH=tests/performance/node_modules node --test tests/diagnostic-ui.test.cjs
// Install the existing UI-test dependencies with npm --prefix tests/performance install.
// All requests and uploads are fixtures: no production data, photo quota or AI call.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/fixeo-diagnostic-modal-v1.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'js/fixeo-diagnostic-v1.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const section = home.match(/<section id="fixeo-diagnostic-signature"[\s\S]*?<\/section>/)[0];
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, api) {
  const dom = new JSDOM('<button id="opener">Ouvrir</button><button id="fixeo-urgent-fab">Urgence</button><div class="chat-widget">WhatsApp</div>', { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, calls = [], uploads = [], revoked = [];
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.URL.createObjectURL = () => 'blob:fixture/' + Math.random();
  w.URL.revokeObjectURL = url => revoked.push(url);
  w.FixeoDiagnostic = { setActive() {}, api: async request => { calls.push(request); if (api) return api(request); throw Error('Unexpected API call'); } };
  w.XMLHttpRequest = class { constructor() { this.upload = {}; } open(method, url) { this.method = method; this.url = url; } setRequestHeader() {} send(file) { uploads.push({ method: this.method, url: this.url, file }); this.upload.onprogress({ lengthComputable: true, loaded: file.size, total: file.size }); this.status = 200; this.onload(); } };
  w.eval(source);
  const q = id => w.document.getElementById(id);
  const change = (id, value) => { const el = q(id); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const select = (files, id = 'fxdiag-files') => { const input = q(id); Object.defineProperty(input, 'files', { configurable: true, value: files }); input.dispatchEvent(new w.Event('change')); };
  const file = (type = 'image/jpeg', size = 100) => new w.File([new Uint8Array(size)], 'photo.jpg', { type });
  const open = async () => { q('opener').focus(); await w.FixeoDiagnosticModal.open({}); };
  const fill = () => { change('fxdiag-description', 'Une trace sous le lavabo.'); change('fxdiag-city', 'rabat'); change('fxdiag-consent', true); };
  return { w, q, change, select, file, open, fill, calls, uploads, revoked };
}
test('Continue requires content, valid city and consent; removing the only photo disables it again', async t => {
  const s = setup(t); await s.open();
  assert.equal(s.q('fxdiag-next').disabled, true);
  s.change('fxdiag-city', 'rabat'); s.change('fxdiag-consent', true);
  assert.equal(s.q('fxdiag-next').disabled, true);
  s.select([s.file()]); assert.equal(s.q('fxdiag-next').disabled, false);
  s.q('fxdiag-photos').querySelector('button').click(); await tick();
  assert.equal(s.q('fxdiag-next').disabled, true);
  assert.equal(s.revoked.length, 1);
  s.change('fxdiag-description', '   '); assert.equal(s.q('fxdiag-next').disabled, true);
  s.change('fxdiag-description', 'Une trace'); assert.equal(s.q('fxdiag-next').disabled, false);
  s.change('fxdiag-consent', false); assert.equal(s.q('fxdiag-next').disabled, true);
  assert.deepEqual(s.calls, []);
});
test('back and close/reopen retain description, city, consent, safety and selected photos without network writes', async t => {
  const s = setup(t); await s.open(); s.fill(); s.select([s.file()]);
  s.q('fxdiag-next').click(); await tick();
  s.w.document.querySelector('.fxdiag-hazards input[value="gas"]').checked = true;
  s.q('fxdiag-back').click(); await tick();
  assert.equal(s.q('fxdiag-description').value, 'Une trace sous le lavabo.');
  assert.equal(s.q('fxdiag-city').value, 'rabat');
  assert.equal(s.q('fxdiag-consent').checked, true);
  assert.equal(s.q('fxdiag-photos').children.length, 1);
  s.w.document.querySelector('.fxdiag-close').click();
  assert.equal(s.w.document.body.classList.contains('fxdiag-is-open'), false);
  assert.equal(s.w.document.activeElement.id, 'opener');
  await s.open();
  assert.equal(s.q('fxdiag-photos').children.length, 1);
  s.q('fxdiag-next').click(); await tick();
  assert.equal(s.w.document.querySelector('.fxdiag-hazards input[value="gas"]').checked, true);
  s.q('fxdiag-dialog').dispatchEvent(new s.w.Event('cancel', { cancelable: true }));
  assert.equal(s.q('fxdiag-dialog').open, false);
  assert.deepEqual(s.calls, []);
});
test('native camera and library retain original media limits and show rejection without clearing valid selections', async t => {
  const s = setup(t); await s.open();
  assert.equal(s.q('fxdiag-camera-file').getAttribute('capture'), 'environment');
  assert.equal(s.q('fxdiag-camera-file').multiple, false);
  assert.equal(s.q('fxdiag-files').multiple, true);
  let camera = 0, library = 0;
  s.q('fxdiag-camera-file').onclick = () => camera++;
  s.q('fxdiag-files').onclick = () => library++;
  s.q('fxdiag-camera').click(); s.q('fxdiag-library').click(); s.q('fxdiag-add').click();
  assert.equal(camera, 1); assert.equal(library, 2);
  s.select([s.file('image/png')], 'fxdiag-camera-file');
  s.select([s.file('application/pdf')]);
  assert.equal(s.q('fxdiag-photos').children.length, 1);
  assert.match(s.q('fxdiag-error').textContent, /photo/);
  s.select([s.file('image/webp'), s.file()]);
  assert.equal(s.q('fxdiag-photos').children.length, 3);
  assert.equal(s.q('fxdiag-library').disabled, true);
  assert.equal(s.q('fxdiag-camera').disabled, true);
  s.select([s.file()]); assert.equal(s.q('fxdiag-photos').children.length, 3);
  assert.equal(s.q('fxdiag-photos').hidden, false);
});
test('all retention information and provider consent remain accessible in a native details disclosure', async t => {
  const s = setup(t); await s.open();
  const disclosure = s.q('fxdiag-consent-details');
  assert.equal(disclosure.tagName, 'DETAILS'); assert.equal(disclosure.open, false);
  for (const text of ['24 h', '90 jours', '30 jours', '180 jours', 'description', 'photos']) assert.ok(disclosure.textContent.includes(text));
  assert.match(s.w.document.querySelector('.fxdiag-consent').textContent, /FIXEO et son fournisseur IA/);
  assert.equal(disclosure.querySelector('a').getAttribute('href'), '/confidentialite.html');
});
test('visual viewport resize keeps the modal within the keyboard viewport and cleans listeners on close', async t => {
  const s = setup(t), viewport = new s.w.EventTarget();
  viewport.height = 720; viewport.offsetTop = 0;
  s.w.visualViewport = viewport; s.w.innerWidth = 390;
  await s.open();
  assert.equal(s.q('fxdiag-dialog').style.getPropertyValue('--fxdiag-vv-height'), '720px');
  viewport.height = 340; viewport.offsetTop = 70; viewport.dispatchEvent(new s.w.Event('resize'));
  assert.equal(s.q('fxdiag-dialog').style.getPropertyValue('--fxdiag-vv-height'), '340px');
  assert.equal(s.q('fxdiag-dialog').style.getPropertyValue('--fxdiag-vv-top'), '70px');
  s.w.document.querySelector('.fxdiag-close').click();
  viewport.height = 400; viewport.dispatchEvent(new s.w.Event('resize'));
  assert.equal(s.q('fxdiag-dialog').style.getPropertyValue('--fxdiag-vv-height'), '340px');
});
test('single submission preserves create → private upload → validate → analyze protocol and result provenance', async t => {
  let release, session;
  const gate = new Promise(resolve => { release = resolve; });
  const s = setup(t, async r => {
    if (r.action === 'create') { await gate; session = { id: r.session_id, revision: 1, input: r.input, city_slug: r.city_slug, media: [], state: 'draft' }; }
    if (r.action === 'media_reserve') return { session: { ...session, revision: 2 }, upload: { url: 'https://storage.fixture.invalid/private', media_id: 'photo-one' } };
    if (r.action === 'media_validate') session = { ...session, revision: 3, media: [{ id: 'photo-one', state: 'ready' }] };
    if (r.action === 'analyze') session = { ...session, state: 'complete', result: { questions: [], safety: { stop: false }, trade: { value: 'plomberie', provenance: 'ai_inferred' }, problem: { value: 'Trace à vérifier' }, facts: [{ key: 'user_description', value: 'Trace déclarée', provenance: 'user_declared' }], hypotheses: [], possible_parts: [], checks: [], urgency: { value: 'moderate', reason: 'À confirmer.' } } };
    return { session };
  });
  await s.open(); s.fill(); s.select([s.file()]); s.q('fxdiag-next').click(); await tick();
  const submit = s.q('fxdiag-next'); submit.focus(); submit.click(); submit.click();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].action, 'create');
  assert.match(s.q('fxdiag-work-status').textContent, /Préparation/);
  release(); await tick(); await tick();
  assert.deepEqual(s.calls.map(r => r.action), ['create', 'media_reserve', 'media_validate', 'analyze']);
  assert.equal(s.uploads.length, 1); assert.equal(s.uploads[0].method, 'PUT');
  assert.equal(s.calls[0].consent_version, 'diagnostic-privacy-v1');
  assert.match(s.w.document.querySelector('.fxdiag-body').textContent, /Votre description/);
  assert.equal(s.q('fxdiag-error'), null);
});
test('homepage CTA and camera use the same guarded launcher and preserve the focus return target', async t => {
  const dom = new JSDOM(section, { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close()); const w = dom.window;
  let initialize, loadScript, opened = 0, focusTarget;
  w.requestIdleCallback = fn => { initialize = fn; };
  w.fetch = async () => ({ ok: true, json: async () => ({ enabled: true }) });
  w.document.head.appendChild = script => { loadScript = script; return script; };
  w.FixeoDiagnosticModal = { open: async context => { opened++; focusTarget = context.opener; } };
  w.eval(bootstrap); await initialize();
  const a = w.document.getElementById('fxdiag-open'), b = w.document.getElementById('fxdiag-camera-open');
  assert.equal(b.tagName, 'BUTTON'); assert.equal(b.getAttribute('aria-haspopup'), 'dialog');
  b.click(); a.click(); assert.equal(a.disabled, true); assert.equal(b.disabled, true);
  loadScript.onload(); await tick(); assert.equal(opened, 1); assert.equal(focusTarget, b);
  a.click(); await tick(); assert.equal(opened, 2); assert.equal(focusTarget, a);
  assert.equal(a.disabled, false); assert.equal(b.disabled, false);
});

test('footer measurement reserves its full height and keeps the city above actions after safe-area/keyboard changes', async t => {
  const s = setup(t), frames = new Map(); let next = 0, observer;
  s.w.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  s.w.cancelAnimationFrame = id => frames.delete(id);
  const flush = () => { for (let round = 0; frames.size && round < 5; round++) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } assert.equal(frames.size, 0); };
  s.w.ResizeObserver = class { constructor(fn) { this.notify = fn; observer = this; } observe(el) { this.target = el; } disconnect() { this.target = null; } };
  s.w.innerWidth = 390;
  await s.open();
  const modal = s.q('fxdiag-dialog'), body = modal.querySelector('.fxdiag-body'), footer = modal.querySelector('.fxdiag-footer');
  const city = s.q('fxdiag-city'), field = city.closest('.fxdiag-field');
  let footerHeight = 88, footerTop = 632;
  footer.getBoundingClientRect = () => ({ height: footerHeight, top: footerTop, bottom: footerTop + footerHeight });
  body.getBoundingClientRect = () => ({ top: 54, bottom: footerTop, height: footerTop - 54 });
  field.getBoundingClientRect = () => ({ top: 610 - body.scrollTop, bottom: 680 - body.scrollTop, height: 70 });
  flush(); city.focus(); flush();
  assert.equal(modal.style.getPropertyValue('--fxdiag-actions-height'), '88px');
  assert.equal(field.getBoundingClientRect().bottom, footerTop - 12);
  // 34px bottom safe-area is part of the measured footer, not counted twice.
  footerHeight = 122; footerTop = 598; observer.notify(); flush();
  assert.equal(modal.style.getPropertyValue('--fxdiag-actions-height'), '122px');
  assert.equal(field.getBoundingClientRect().bottom, footerTop - 12);
  // Reduced keyboard viewport: focused city remains usable above actions.
  footerHeight = 98; footerTop = 242; s.w.dispatchEvent(new s.w.Event('resize')); flush();
  assert.equal(field.getBoundingClientRect().bottom, 230);
  assert.ok(field.getBoundingClientRect().top >= 66);
  const unchangedScroll = body.scrollTop; observer.notify(); flush();
  assert.equal(body.scrollTop, unchangedScroll, 'No unnecessary layout/scroll jump');
  observer.notify(); assert.ok(frames.size > 0);
  modal.querySelector('.fxdiag-close').click();
  assert.equal(observer.target, null); assert.equal(frames.size, 0);
});

test('photo selected state and ready count are explicit while technical/privacy details remain available', async t => {
  const s = setup(t); await s.open();
  s.select([s.file()]);
  assert.equal(s.q('fxdiag-photo-status').textContent, '1 photo prête à analyser');
  assert.equal(s.q('fxdiag-photos').firstChild.dataset.state, 'selected');
  assert.equal(s.q('fxdiag-media').classList.contains('has-photos'), true);
  const details = s.w.document.querySelector('.fxdiag-photo-details');
  for (const text of ['JPEG', 'PNG', 'WebP', 'visages', 'papiers d’identité', 'informations personnelles', 'accord']) assert.ok(details.textContent.includes(text));
  assert.equal(details.open, false);
  s.select([s.file()]); assert.equal(s.q('fxdiag-photo-status').textContent, '2 photos prêtes à analyser');
  s.q('fxdiag-photos').querySelector('button').click(); await tick();
  s.q('fxdiag-photos').querySelector('button').click(); await tick();
  assert.equal(s.q('fxdiag-media').classList.contains('has-photos'), false);
  assert.equal(s.q('fxdiag-photo-status').textContent, 'Aucune photo sélectionnée');
});
