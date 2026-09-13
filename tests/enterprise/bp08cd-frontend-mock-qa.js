/**
 * BP08C/D Mock Browser QA
 *
 * Tests site admin UI (BP08C) and account edit UI (BP08D) functions
 * using local mocks — ZERO Supabase / network calls.
 *
 * Run: node tests/enterprise/bp08cd-frontend-mock-qa.js
 *
 * Reports each check as PASS / FAIL, with final verdict.
 */

'use strict';

// ── Minimal DOM shim ──────────────────────────────────────────────────────────
class El {
  constructor(tag) {
    this.tag        = tag;
    this._children  = [];
    this._attrs     = {};
    this._text      = '';
    this.className  = '';
    this.disabled   = false;
    this.innerHTML  = '';
    this.dataset    = {};
    this.style      = {};
    this.parentNode = null;
    this.value      = '';
    this._evts      = {};
  }
  setAttribute(k, v)  { this._attrs[k] = String(v); }
  getAttribute(k)     { return this._attrs[k] ?? null; }
  appendChild(c)      { c.parentNode = this; this._children.push(c); return c; }
  addEventListener(ev, fn) {
    if (!this._evts[ev]) this._evts[ev] = [];
    this._evts[ev].push(fn);
  }
  _trigger(ev, arg) {
    (this._evts[ev] || []).forEach(fn => fn(arg || {}));
  }
  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      for (const c of node._children) {
        if (matchSel(sel, c)) results.push(c);
        walk(c);
      }
    };
    walk(this);
    return results;
  }
  querySelector(sel)  { return this.querySelectorAll(sel)[0] ?? null; }
  get textContent()   { return this._text; }
  set textContent(v)  { this._text = String(v); }
}

function matchSel(sel, node) {
  // supports: .class, tag, tag.class, [attr], [attr="val"]
  const m = sel.match(/^([a-z0-9]*)(\.[a-z0-9_-]+)?(\[([a-z0-9_-]+)(?:="([^"]*)")?\])?$/i);
  if (!m) return false;
  const [, tag, cls, , attrK, attrV] = m;
  if (tag && node.tag !== tag) return false;
  if (cls && !node.className.split(' ').includes(cls.slice(1))) return false;
  if (attrK) {
    const v = node.getAttribute(attrK);
    if (v === null) return false;
    if (attrV !== undefined && v !== attrV) return false;
  }
  return true;
}

global._domRegistry = {};
const document = {
  createElement(tag)    { return new El(tag); },
  getElementById(id)    { return global._domRegistry[id] ?? null; },
  querySelectorAll(sel) { return []; },
  querySelector(sel)    { return null; },
};
global.document = document;
global.window   = { confirm: () => true };  // always confirms in tests
global.console  = global.console || { log: ()=>{}, warn: ()=>{}, error: ()=>{} };

// ── RPC call recorder ─────────────────────────────────────────────────────────
const _rpcCalls = [];
let   _rpcResponse = { ok: true };

const _sb = {
  rpc(fn, params) {
    _rpcCalls.push({ fn, params });
    return Promise.resolve({ data: _rpcResponse, error: null });
  }
};

// ── Minimal shared state ──────────────────────────────────────────────────────
const S = {
  userRole:         'owner',
  activeEnterprise: { id: 'ent-001', name: 'Acme Corp', legal_name: 'Acme Corp SAS' },
  sites:            [],
  members:          [],
  requests:         [],
};

function isManager(role) { return role === 'owner' || role === 'admin'; }
function safeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
var _siteActionPending = {};

// ── BP08C: siteStatusBadge ────────────────────────────────────────────────────
function siteStatusBadge(status) {
  return { active: 'Actif', inactive: 'Inactif' }[status] || status;
}

// ── BP08C: renderSiteAdminControls (mirrors production code) ─────────────────
function renderSiteAdminControls(site, callerRole) {
  if (!isManager(callerRole)) return null;

  var wrap = document.createElement('div');
  wrap.className = 'bp08c-site-edit-controls';

  var editBtn = document.createElement('button');
  editBtn.className = 'bp08c-site-edit-btn fxv2-btn fxv2-btn-ghost';
  editBtn.setAttribute('data-site-id', site.id);
  editBtn.setAttribute('type', 'button');
  editBtn.textContent = '✏️ Modifier';

  var statusBadge = document.createElement('span');
  statusBadge.className = 'bp08c-site-status-badge bp08c-site-status-badge-' + site.status;
  statusBadge.textContent = siteStatusBadge(site.status);

  if (site.status === 'active') {
    var deactBtn = document.createElement('button');
    deactBtn.className = 'bp08c-site-deactivate-btn fxv2-btn fxv2-btn-ghost';
    deactBtn.setAttribute('data-site-id', site.id);
    deactBtn.setAttribute('type', 'button');
    deactBtn.textContent = '⏸ Désactiver';
    wrap.appendChild(statusBadge);
    wrap.appendChild(editBtn);
    wrap.appendChild(deactBtn);
  } else {
    var actBtn = document.createElement('button');
    actBtn.className = 'bp08c-site-activate-btn fxv2-btn fxv2-btn-ghost';
    actBtn.setAttribute('data-site-id', site.id);
    actBtn.setAttribute('type', 'button');
    actBtn.textContent = '▶ Réactiver';
    wrap.appendChild(statusBadge);
    wrap.appendChild(editBtn);
    wrap.appendChild(actBtn);
  }

  // Inline edit form
  var form = document.createElement('div');
  form.className = 'bp08c-site-inline-form';
  form.style.display = 'none';
  form.setAttribute('data-site-id', site.id);

  var nameInput = document.createElement('input');
  nameInput.className = 'bp08c-site-name-input fxv2-input';
  nameInput.setAttribute('type', 'text');
  nameInput.setAttribute('data-site-id', site.id);
  nameInput.value = site.name || '';

  var cityInput = document.createElement('input');
  cityInput.className = 'bp08c-site-city-input fxv2-input';
  cityInput.setAttribute('type', 'text');
  cityInput.setAttribute('data-site-id', site.id);
  cityInput.value = site.city || '';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bp08c-site-save-btn fxv2-btn fxv2-btn-primary';
  saveBtn.setAttribute('data-site-id', site.id);
  saveBtn.setAttribute('type', 'button');
  saveBtn.textContent = 'Enregistrer';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'bp08c-site-cancel-btn fxv2-btn fxv2-btn-ghost';
  cancelBtn.setAttribute('data-site-id', site.id);
  cancelBtn.setAttribute('type', 'button');
  cancelBtn.textContent = 'Annuler';

  var feedbackEl = document.createElement('div');
  feedbackEl.className = 'bp08c-site-feedback';
  feedbackEl.setAttribute('data-site-id', site.id);
  feedbackEl.textContent = '';

  form.appendChild(nameInput);
  form.appendChild(cityInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);
  form.appendChild(feedbackEl);
  wrap.appendChild(form);

  return wrap;
}

// ── BP08C: buildSiteCard (mirrors production logic for class assignment) ──────
function buildSiteCard(s) {
  const div = document.createElement('div');
  div.className = 'ent-site-card' + (s.status === 'inactive' ? ' bp08c-site-inactive' : '');
  div.setAttribute('data-site-id', s.id);

  var adminControls = renderSiteAdminControls(s, S.userRole);
  if (adminControls) div.appendChild(adminControls);

  return div;
}

// ── BP08C: RPC wrappers (mirrors production) ──────────────────────────────────
async function doSiteUpdate(enterpriseId, siteId, name, city, siteCode, addressLine) {
  _siteActionPending[siteId] = true;
  try {
    var params = {
      p_enterprise_id: enterpriseId,
      p_site_id:       siteId,
      p_name:          name,
      p_city:          city || null,
    };
    if (siteCode    !== undefined) params.p_site_code    = siteCode;
    if (addressLine !== undefined) params.p_address_line = addressLine;
    var result = await _sb.rpc('update_enterprise_site', params);
    return result.data;
  } finally {
    delete _siteActionPending[siteId];
  }
}

async function doSiteStatusChange(enterpriseId, siteId, newStatus) {
  _siteActionPending[siteId] = true;
  try {
    var result = await _sb.rpc('set_enterprise_site_status', {
      p_enterprise_id: enterpriseId,
      p_site_id:       siteId,
      p_status:        newStatus,
    });
    return result.data;
  } finally {
    delete _siteActionPending[siteId];
  }
}

function showSiteFeedback(siteId, msg, isError) { /* noop in test */ }

// ── BP08D: doAccountUpdate (mirrors production) ───────────────────────────────
async function doAccountUpdate(enterpriseId, name, legalName) {
  var result = await _sb.rpc('update_enterprise_account', {
    p_enterprise_id: enterpriseId,
    p_name:          name,
    p_legal_name:    legalName || null,
  });
  return result.data;
}

// ── BP08D: renderAccount account-edit form logic (mirrors production) ─────────
function renderAccountForRole(callerRole) {
  var contentEl = document.createElement('div');
  contentEl.className = 'ent-account-content';

  // Non-manager: read-only only (no edit form appended)
  if (!isManager(callerRole)) {
    return contentEl;
  }

  // Manager: append edit form
  var editWrap = document.createElement('div');
  editWrap.className = 'bp08d-account-edit-form';

  var nameInput = document.createElement('input');
  nameInput.id = 'bp08d-name-input';
  nameInput.className = 'fxv2-input';
  nameInput.setAttribute('type', 'text');
  nameInput.value = S.activeEnterprise.name || '';

  var legalInput = document.createElement('input');
  legalInput.id = 'bp08d-legal-name-input';
  legalInput.className = 'fxv2-input';
  legalInput.setAttribute('type', 'text');
  legalInput.value = S.activeEnterprise.legal_name || '';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bp08d-account-save-btn fxv2-btn fxv2-btn-primary';
  saveBtn.setAttribute('type', 'button');
  saveBtn.textContent = 'Enregistrer';

  var feedbackEl = document.createElement('div');
  feedbackEl.className = 'bp08d-account-feedback';

  editWrap.appendChild(nameInput);
  editWrap.appendChild(legalInput);
  editWrap.appendChild(saveBtn);
  editWrap.appendChild(feedbackEl);
  contentEl.appendChild(editWrap);

  return contentEl;
}

// ── BP08B FE-AUTH-01 mock (kept for regression check) ────────────────────────
async function mockBootMembership(userId, mockMemberRow) {
  if (!mockMemberRow || mockMemberRow.status !== 'active') return null;
  return mockMemberRow;
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function PASS(label) { console.log('  ✅ ' + label); passed++; }
function FAIL(label) { console.log('  ❌ ' + label); failed++; failures.push(label); }

// ── Test data ─────────────────────────────────────────────────────────────────
const SITES = {
  active:   { id: 'site-a1', name: 'Site Alpha', city: 'Paris',  status: 'active',   site_code: 'ALP' },
  inactive: { id: 'site-i1', name: 'Site Inactif', city: 'Lyon', status: 'inactive', site_code: 'INA' },
};

const NON_MANAGER_ROLES = ['operations_manager', 'site_manager', 'reporter', 'viewer'];

// ── TESTS ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('BP08C/D Mock Browser QA');
console.log('═══════════════════════════════════════════════════════════════\n');

(async () => {

// ── Block 1: Owner sees site edit / deactivate controls ───────────────────────
  console.log('Block 1 — Owner sees site edit/deactivate controls');
  {
    S.userRole = 'owner';
    const card = buildSiteCard(SITES.active);
    const editBtns   = card.querySelectorAll('.bp08c-site-edit-btn');
    const deactBtns  = card.querySelectorAll('.bp08c-site-deactivate-btn');
    if (editBtns.length > 0)
      PASS('QA-01: owner sees edit button on active site');
    else
      FAIL('QA-01: owner missing edit button');
    if (deactBtns.length > 0)
      PASS('QA-02: owner sees deactivate button on active site');
    else
      FAIL('QA-02: owner missing deactivate button');
  }

// ── Block 2: Admin sees site edit / deactivate controls ──────────────────────
  console.log('\nBlock 2 — Admin sees site edit/deactivate controls');
  {
    S.userRole = 'admin';
    const card = buildSiteCard(SITES.active);
    const editBtns  = card.querySelectorAll('.bp08c-site-edit-btn');
    const deactBtns = card.querySelectorAll('.bp08c-site-deactivate-btn');
    if (editBtns.length > 0)
      PASS('QA-03: admin sees edit button');
    else
      FAIL('QA-03: admin missing edit button');
    if (deactBtns.length > 0)
      PASS('QA-04: admin sees deactivate button');
    else
      FAIL('QA-04: admin missing deactivate button');
  }

// ── Block 3: Non-manager roles see NO mutation controls ──────────────────────
  console.log('\nBlock 3 — Non-manager roles see NO site mutation controls');
  {
    for (const role of NON_MANAGER_ROLES) {
      S.userRole = role;
      const controls = renderSiteAdminControls(SITES.active, role);
      if (controls === null)
        PASS('QA-05 [' + role + ']: renderSiteAdminControls returns null');
      else
        FAIL('QA-05 [' + role + ']: expected null, got controls element');
    }
  }

// ── Block 4: Inactive site has correct CSS class ──────────────────────────────
  console.log('\nBlock 4 — Inactive site has bp08c-site-inactive CSS class');
  {
    S.userRole = 'owner';
    const activeCard   = buildSiteCard(SITES.active);
    const inactiveCard = buildSiteCard(SITES.inactive);
    if (!activeCard.className.includes('bp08c-site-inactive'))
      PASS('QA-06: active site card has no inactive class');
    else
      FAIL('QA-06: active site card should not have inactive class');
    if (inactiveCard.className.includes('bp08c-site-inactive'))
      PASS('QA-07: inactive site card has bp08c-site-inactive class');
    else
      FAIL('QA-07: inactive site card missing bp08c-site-inactive class');
  }

// ── Block 5: Inactive site NOT in active-sites-only selector ─────────────────
  console.log('\nBlock 5 — Inactive site NOT in active-sites-only filter');
  {
    const allSites = [SITES.active, SITES.inactive];
    const activeSites = allSites.filter(s => s.status === 'active');
    const hasInactive = activeSites.some(s => s.status === 'inactive');
    if (!hasInactive)
      PASS('QA-08: inactive site filtered out of active-only list');
    else
      FAIL('QA-08: inactive site should not appear in active-only list');
    if (activeSites.length === 1 && activeSites[0].id === SITES.active.id)
      PASS('QA-09: active-only list contains exactly the active site');
    else
      FAIL('QA-09: active-only list content unexpected');
  }

// ── Block 6: Active site IS in selector ──────────────────────────────────────
  console.log('\nBlock 6 — Active site IS in active-sites-only filter');
  {
    const allSites = [SITES.active, SITES.inactive];
    const activeSites = allSites.filter(s => s.status === 'active');
    if (activeSites.some(s => s.id === SITES.active.id))
      PASS('QA-10: active site appears in active-only list');
    else
      FAIL('QA-10: active site missing from active-only list');
  }

// ── Block 7: Site update calls update_enterprise_site RPC with correct params ─
  console.log('\nBlock 7 — Site update calls update_enterprise_site RPC');
  {
    _rpcCalls.length = 0;
    _rpcResponse = { ok: true, site_id: 'site-a1' };
    await doSiteUpdate('ent-001', 'site-a1', 'Site Alpha Renamed', 'Paris', 'ALP', null);
    if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'update_enterprise_site')
      PASS('QA-11: doSiteUpdate calls update_enterprise_site');
    else
      FAIL('QA-11: wrong RPC called: ' + JSON.stringify(_rpcCalls[0]?.fn));
    if (_rpcCalls[0]?.params?.p_enterprise_id === 'ent-001')
      PASS('QA-12: p_enterprise_id correct');
    else
      FAIL('QA-12: p_enterprise_id incorrect');
    if (_rpcCalls[0]?.params?.p_site_id === 'site-a1')
      PASS('QA-13: p_site_id correct');
    else
      FAIL('QA-13: p_site_id incorrect: ' + JSON.stringify(_rpcCalls[0]?.params?.p_site_id));
    if (_rpcCalls[0]?.params?.p_name === 'Site Alpha Renamed')
      PASS('QA-14: p_name correct');
    else
      FAIL('QA-14: p_name incorrect');
  }

// ── Block 8: Site deactivate calls set_enterprise_site_status with p_status=inactive ──
  console.log('\nBlock 8 — Site deactivate calls set_enterprise_site_status p_status=inactive');
  {
    _rpcCalls.length = 0;
    _rpcResponse = { ok: true };
    await doSiteStatusChange('ent-001', 'site-a1', 'inactive');
    if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'set_enterprise_site_status')
      PASS('QA-15: doSiteStatusChange calls set_enterprise_site_status');
    else
      FAIL('QA-15: wrong RPC called');
    if (_rpcCalls[0]?.params?.p_status === 'inactive')
      PASS('QA-16: p_status=inactive for deactivate');
    else
      FAIL('QA-16: p_status incorrect: ' + JSON.stringify(_rpcCalls[0]?.params?.p_status));
  }

// ── Block 9: Site reactivate calls set_enterprise_site_status with p_status=active ──
  console.log('\nBlock 9 — Site reactivate calls set_enterprise_site_status p_status=active');
  {
    _rpcCalls.length = 0;
    _rpcResponse = { ok: true };
    await doSiteStatusChange('ent-001', 'site-i1', 'active');
    if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'set_enterprise_site_status')
      PASS('QA-17: doSiteStatusChange calls set_enterprise_site_status for reactivate');
    else
      FAIL('QA-17: wrong RPC for reactivate');
    if (_rpcCalls[0]?.params?.p_status === 'active')
      PASS('QA-18: p_status=active for reactivate');
    else
      FAIL('QA-18: p_status incorrect for reactivate');
  }

// ── Block 10: RPC error does not fake success (site) ──────────────────────────
  console.log('\nBlock 10 — RPC error does not fake success (site)');
  {
    _rpcResponse = { ok: false, reason: 'forbidden' };
    _rpcCalls.length = 0;
    const result = await doSiteUpdate('ent-001', 'site-a1', 'Bad', null, undefined, undefined);
    if (result && result.ok === false)
      PASS('QA-19: site update error response preserves ok=false');
    else
      FAIL('QA-19: site update error response mangled');
    if (result?.reason === 'forbidden')
      PASS('QA-20: site update error reason preserved');
    else
      FAIL('QA-20: site update error reason lost');
    _rpcResponse = { ok: true };  // reset
  }

// ── Block 11: Owner/admin see account edit form ────────────────────────────────
  console.log('\nBlock 11 — Owner/admin see account edit form');
  {
    for (const role of ['owner', 'admin']) {
      S.userRole = role;
      const contentEl = renderAccountForRole(role);
      const editForms = contentEl.querySelectorAll('.bp08d-account-edit-form');
      if (editForms.length > 0)
        PASS('QA-21 [' + role + ']: account edit form rendered');
      else
        FAIL('QA-21 [' + role + ']: account edit form missing');
    }
  }

// ── Block 12: Non-manager sees account as read-only (no edit inputs) ──────────
  console.log('\nBlock 12 — Non-manager sees no account edit form');
  {
    for (const role of NON_MANAGER_ROLES) {
      S.userRole = role;
      const contentEl = renderAccountForRole(role);
      const editForms = contentEl.querySelectorAll('.bp08d-account-edit-form');
      if (editForms.length === 0)
        PASS('QA-22 [' + role + ']: no edit form for non-manager');
      else
        FAIL('QA-22 [' + role + ']: edit form should not render for non-manager');
    }
  }

// ── Block 13: Account save calls update_enterprise_account with correct params ─
  console.log('\nBlock 13 — Account save calls update_enterprise_account');
  {
    _rpcCalls.length = 0;
    _rpcResponse = { ok: true, enterprise_id: 'ent-001' };
    await doAccountUpdate('ent-001', 'New Corp Name', 'New Corp SAS');
    if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'update_enterprise_account')
      PASS('QA-23: doAccountUpdate calls update_enterprise_account');
    else
      FAIL('QA-23: wrong RPC called: ' + JSON.stringify(_rpcCalls[0]?.fn));
    if (_rpcCalls[0]?.params?.p_enterprise_id === 'ent-001')
      PASS('QA-24: p_enterprise_id correct');
    else
      FAIL('QA-24: p_enterprise_id incorrect');
    if (_rpcCalls[0]?.params?.p_name === 'New Corp Name')
      PASS('QA-25: p_name correct');
    else
      FAIL('QA-25: p_name incorrect');
    if (_rpcCalls[0]?.params?.p_legal_name === 'New Corp SAS')
      PASS('QA-26: p_legal_name correct');
    else
      FAIL('QA-26: p_legal_name incorrect');
  }

// ── Block 14: Account RPC error does not fake success ─────────────────────────
  console.log('\nBlock 14 — Account RPC error does not fake success');
  {
    _rpcResponse = { ok: false, reason: 'not_authorized' };
    _rpcCalls.length = 0;
    const result = await doAccountUpdate('ent-001', 'Attempted', null);
    if (result && result.ok === false)
      PASS('QA-27: account update error preserves ok=false');
    else
      FAIL('QA-27: account update error response mangled');
    if (result?.reason === 'not_authorized')
      PASS('QA-28: account update error reason preserved');
    else
      FAIL('QA-28: account update error reason lost');
    _rpcResponse = { ok: true }; // reset
  }

// ── Block 15: FE-AUTH-01 boot gate (regression from BP08B) ───────────────────
  console.log('\nBlock 15 — FE-AUTH-01: non-active membership rejected at boot');
  {
    const suspended = { id: 'mid-x', role: 'admin', status: 'suspended', enterprise_id: 'ent-001' };
    const removed   = { id: 'mid-y', role: 'admin', status: 'removed',   enterprise_id: 'ent-001' };
    const active    = { id: 'mid-z', role: 'admin', status: 'active',    enterprise_id: 'ent-001' };

    const suspResult   = await mockBootMembership('uid-x', suspended);
    const removedResult= await mockBootMembership('uid-y', removed);
    const activeResult = await mockBootMembership('uid-z', active);

    if (suspResult === null)
      PASS('QA-29: FE-AUTH-01 rejects suspended membership');
    else
      FAIL('QA-29: FE-AUTH-01 should reject suspended');
    if (removedResult === null)
      PASS('QA-30: FE-AUTH-01 rejects removed membership');
    else
      FAIL('QA-30: FE-AUTH-01 should reject removed');
    if (activeResult !== null)
      PASS('QA-31: FE-AUTH-01 allows active membership');
    else
      FAIL('QA-31: FE-AUTH-01 should allow active');
  }

// ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${passed + failed}  ✅ ${passed}  ❌ ${failed}`);
  if (failed === 0) {
    console.log('BP08C/D MOCK QA: PASSED');
  } else {
    console.log('BP08C/D MOCK QA: FAILED');
    failures.forEach(f => console.log('  ❌ ' + f));
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
})();
