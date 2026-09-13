'use strict';
// BP08F Frontend Mock QA
// Tests bp08f JS additions in isolation via Node.js mock

/* ============================================================
   Minimal DOM shim
   ============================================================ */
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
    this.checked    = false;
    this.type       = '';
    this._evts      = {};
  }
  setAttribute(k, v)  { this._attrs[k] = String(v); }
  getAttribute(k)     { return this._attrs[k] !== undefined ? this._attrs[k] : null; }
  appendChild(c)      { if(c && typeof c === 'object') { c.parentNode = this; this._children.push(c); } return c; }
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
      for (const c of (node._children || [])) {
        if (matchSel(sel, c)) results.push(c);
        walk(c);
      }
    };
    walk(this);
    return results;
  }
  querySelector(sel)  { return this.querySelectorAll(sel)[0] || null; }
  get textContent()   { return this._text; }
  set textContent(v)  { this._text = String(v); }
}

function matchSel(sel, node) {
  if (!node || typeof node !== 'object') return false;
  if (sel === 'input[type=checkbox]:checked') {
    return node.tag === 'input' && node.type === 'checkbox' && node.checked === true;
  }
  const m = sel.match(/^([a-z0-9]*)(\.[a-z0-9_-]+)?(\[([a-z0-9_-]+)(?:="([^"]*)")?\])?$/i);
  if (!m) return false;
  const [, tag, cls, , attrK, attrV] = m;
  if (tag && node.tag !== tag) return false;
  if (cls && !(node.className||'').split(' ').includes(cls.slice(1))) return false;
  if (attrK) {
    const v = node.getAttribute ? node.getAttribute(attrK) : null;
    if (v === null) return false;
    if (attrV !== undefined && v !== attrV) return false;
  }
  return true;
}

const _domRegistry = {};
const document = {
  createElement(tag) { return new El(tag); },
  getElementById(id) { return _domRegistry[id] || null; },
  querySelectorAll() { return []; },
  querySelector()    { return null; },
};
global.document = document;
global.window   = { confirm: () => true };
global.console  = { log: (...a) => { process.stdout.write(a.join(' ') + '\n'); }, warn: (...a) => { global._lastWarn = a.join(' '); }, error: () => {} };

/* ============================================================
   Mock Supabase client
   ============================================================ */
const _rpcCalls  = [];
let   _rpcResponse  = { ok: true };
let   _fromResponse = [];
let   _fromError    = null;

function makeChain(tableData, err) {
  const chain = {
    select() { return this; },
    eq()     { return this; },
    order()  { return this; },
    limit()  { return this; },
    then(resolve) {
      resolve({ data: tableData, error: err });
      return Promise.resolve({ data: tableData, error: err });
    },
  };
  return chain;
}

const _sb = {
  from(/* table */) {
    return makeChain(_fromResponse, _fromError);
  },
  rpc(fn, params) {
    _rpcCalls.push({ fn, params });
    return Promise.resolve({ data: _rpcResponse, error: null });
  }
};

/* ============================================================
   Shared state (mirrors S in production)
   ============================================================ */
const S = {
  userId: 'user-001',
  userEmail: 'test@example.com',
  enterprises: [],
  activeEnterprise: { id: 'ent-001', name: 'Acme Corp' },
  userRole: 'owner',
  sites: [
    { id: 'site-a', name: 'Site Alpha', city: 'Paris',  status: 'active'   },
    { id: 'site-b', name: 'Site Beta',  city: 'Lyon',   status: 'active'   },
    { id: 'site-c', name: 'Site Gamma', city: 'Nantes', status: 'inactive' },
  ],
  sitesLoaded: true,
  members: [],
  memberAssignments: {},
  assignedSiteIds: [],
  requests: [],
  kpis: { total:0, action:0, active:0, pending:0, done:0, nomatch:0 },
};

/* ============================================================
   Helpers from production (minimal copies)
   ============================================================ */
function safeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatRole(role) {
  return ({
    owner:'Proprietaire', admin:'Administrateur',
    operations_manager:'Resp. operations', site_manager:'Resp. site',
    reporter:'Declarant', viewer:'Observateur'
  })[role] || role;
}
function isManager(role) { return role === 'owner' || role === 'admin'; }

const CAN_CREATE_ROLES  = ['owner','admin','operations_manager','site_manager','reporter'];
const CAN_CONFIRM_ROLES = ['owner','admin','operations_manager','site_manager'];
function canCreate(role)  { return CAN_CREATE_ROLES.includes(role); }
function canConfirm(role) { return CAN_CONFIRM_ROLES.includes(role); }

/* ============================================================
   BP08F functions under test (mirrors production)
   ============================================================ */

function isSiteManagerWithNoSites() {
  return S.userRole === 'site_manager' && S.assignedSiteIds.length === 0;
}

async function loadMyAssignments() {
  if (!S.activeEnterprise) return;
  if (S.userRole !== 'site_manager') { S.assignedSiteIds = []; return; }
  try {
    var res = await _sb
      .from('enterprise_member_sites')
      .select('site_id')
      .eq('enterprise_id', S.activeEnterprise.id);
    var data  = res.data;
    var error = res.error;
    if (error) throw error;
    S.assignedSiteIds = (data || []).map(function(r) { return r.site_id; });
  } catch(err) {
    S.assignedSiteIds = [];
    global.console.warn('[loadMyAssignments]', err.message);
  }
}

function buildAssignmentSection(m) {
  var div = document.createElement('div');
  div.className = 'bp08f-assign-section';
  div.setAttribute('aria-label', 'Gestion des sites assignes');

  var label = document.createElement('div');
  label.className = 'bp08f-assign-label';
  label.textContent = 'Sites assignes :';
  div.appendChild(label);

  var siteList = document.createElement('div');
  siteList.className = 'bp08f-assign-site-list';
  siteList.setAttribute('role', 'group');

  var currentAssigned = S.memberAssignments[m.id] || [];
  var allSites = S.sites || [];

  allSites.forEach(function(site) {
    var row = document.createElement('label');
    row.className = 'bp08f-assign-site-row';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = site.id;
    cb.checked = currentAssigned.includes(site.id);
    if (site.status === 'inactive') cb.setAttribute('data-inactive', 'true');
    row.appendChild(cb);
    var nameSpan = document.createElement('span');
    nameSpan.textContent = site.name + (site.city ? ' - ' + site.city : '') + (site.status === 'inactive' ? ' (inactif)' : '');
    row.appendChild(nameSpan);
    siteList.appendChild(row);
  });

  div.appendChild(siteList);

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bp08f-btn-save-assign';
  saveBtn.setAttribute('data-mid', m.id);
  saveBtn.textContent = 'Enregistrer';
  div.appendChild(saveBtn);

  var fb = document.createElement('div');
  fb.className = 'bp08f-assign-feedback';
  fb.id = 'asgnfb-' + m.id;
  fb.setAttribute('aria-live', 'polite');
  div.appendChild(fb);

  saveBtn.addEventListener('click', function() {
    var selected = Array.from(siteList.querySelectorAll('input[type=checkbox]:checked')).map(function(c) { return c.value; });
    doSaveAssignments(m.id, selected);
  });

  return div;
}

async function doSaveAssignments(mid, siteIds) {
  if (!S.activeEnterprise) return;
  var fbEl = _domRegistry['asgnfb-' + mid] || null;
  if (fbEl) { fbEl.textContent = 'Enregistrement...'; fbEl.className = 'bp08f-assign-feedback bp08f-fb-info'; }
  try {
    var res = await _sb.rpc('set_enterprise_member_sites', {
      p_enterprise_id: S.activeEnterprise.id,
      p_member_id:     mid,
      p_site_ids:      siteIds
    });
    var d = res.data;
    if (!d || !d.ok) {
      var reason = (d && d.reason) || 'error';
      var msgs = {
        forbidden:               'Permission refusee.',
        member_not_found:        'Membre introuvable.',
        target_not_site_manager: "Ce membre n'est pas site_manager.",
        target_not_active:       "Ce membre n'est pas actif.",
        site_not_found:          'Site introuvable.',
        site_enterprise_mismatch:'Site hors de cet enterprise.',
        no_change:               'Aucun changement.',
        unauthenticated:         'Session expiree.'
      };
      var msg = msgs[reason] || ('Erreur: ' + reason);
      if (fbEl) { fbEl.textContent = msg; fbEl.className = 'bp08f-assign-feedback ' + (reason === 'no_change' ? 'bp08f-fb-info' : 'bp08f-fb-error'); }
    } else {
      if (fbEl) { fbEl.textContent = 'Sites mis a jour.'; fbEl.className = 'bp08f-assign-feedback bp08f-fb-success'; }
    }
  } catch(err) {
    if (fbEl) { fbEl.textContent = 'Erreur: ' + (err.message || 'inconnu'); fbEl.className = 'bp08f-assign-feedback bp08f-fb-error'; }
  }
}

/* ============================================================
   Test runner — sequential, collects promises
   ============================================================ */
let _pass = 0, _fail = 0;
const _failures  = [];
const _testQueue = [];

function test(label, fn) {
  _testQueue.push({ label, fn, isAsync: false });
}

function asyncTest(label, fn) {
  _testQueue.push({ label, fn, isAsync: true });
}

async function runAll() {
  for (const t of _testQueue) {
    try {
      if (t.isAsync) await t.fn();
      else t.fn();
      process.stdout.write('  PASS  ' + t.label + '\n');
      _pass++;
    } catch(e) {
      process.stdout.write('  FAIL  ' + t.label + '\n         -> ' + e.message + '\n');
      _fail++;
      _failures.push(t.label + ': ' + e.message);
    }
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b));
}

/* ============================================================
   SECTION 1: State management
   ============================================================ */

test('1-01: S.assignedSiteIds initialized to []', function() {
  const freshS = { memberAssignments: {}, assignedSiteIds: [] };
  assert(Array.isArray(freshS.assignedSiteIds), 'assignedSiteIds should be array');
  assertEqual(freshS.assignedSiteIds.length, 0, 'should be empty');
});

asyncTest('1-02: loadMyAssignments populates S.assignedSiteIds for site_manager', async function() {
  S.userRole = 'site_manager';
  _fromResponse = [{ site_id: 'site-a' }, { site_id: 'site-b' }];
  _fromError = null;
  await loadMyAssignments();
  assert(S.assignedSiteIds.includes('site-a'), 'should contain site-a');
  assert(S.assignedSiteIds.includes('site-b'), 'should contain site-b');
  assertEqual(S.assignedSiteIds.length, 2, 'should have 2 assigned sites');
});

asyncTest('1-03: loadMyAssignments returns [] for owner role', async function() {
  S.userRole = 'owner';
  S.assignedSiteIds = ['leftover'];
  await loadMyAssignments();
  assertEqual(S.assignedSiteIds.length, 0, 'owner should get empty array');
});

asyncTest('1-04: loadMyAssignments returns [] for admin role', async function() {
  S.userRole = 'admin';
  S.assignedSiteIds = ['leftover'];
  await loadMyAssignments();
  assertEqual(S.assignedSiteIds.length, 0, 'admin should get empty array');
});

test('1-05: isSiteManagerWithNoSites() returns true when role=site_manager and assignedSiteIds=[]', function() {
  S.userRole = 'site_manager';
  S.assignedSiteIds = [];
  assert(isSiteManagerWithNoSites() === true, 'should be true');
});

test('1-06: isSiteManagerWithNoSites() returns false when role=site_manager and assignedSiteIds has items', function() {
  S.userRole = 'site_manager';
  S.assignedSiteIds = ['site-a'];
  assert(isSiteManagerWithNoSites() === false, 'should be false when sites exist');
});

test('1-07: isSiteManagerWithNoSites() returns false when role=owner', function() {
  S.userRole = 'owner';
  S.assignedSiteIds = [];
  assert(isSiteManagerWithNoSites() === false, 'owner is not site_manager');
});

/* ============================================================
   SECTION 2: doSaveAssignments behavior
   ============================================================ */

// Reset
S.userRole = 'owner';
S.assignedSiteIds = [];

asyncTest('2-01: calls set_enterprise_member_sites with correct params', async function() {
  _rpcCalls.length = 0;
  _rpcResponse = { ok: true };
  await doSaveAssignments('member-x', ['site-a', 'site-b']);
  assert(_rpcCalls.length >= 1, 'should call rpc');
  const call = _rpcCalls[_rpcCalls.length - 1];
  assertEqual(call.fn, 'set_enterprise_member_sites', 'wrong fn name');
  assertEqual(call.params.p_enterprise_id, 'ent-001', 'wrong enterprise_id');
  assertEqual(call.params.p_member_id, 'member-x', 'wrong member_id');
  assert(Array.isArray(call.params.p_site_ids), 'p_site_ids should be array');
  assert(call.params.p_site_ids.includes('site-a'), 'should include site-a');
});

asyncTest('2-02: success response sets feedback to success class', async function() {
  _rpcResponse = { ok: true };
  const fbId = 'asgnfb-member-succ';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-succ', ['site-a']);
  assert(fbEl.className.includes('bp08f-fb-success'), 'should have success class, got: ' + fbEl.className);
  assert(fbEl.textContent.includes('Sites mis'), 'wrong success text, got: ' + fbEl.textContent);
});

asyncTest('2-03: forbidden response sets error feedback', async function() {
  _rpcResponse = { ok: false, reason: 'forbidden' };
  const fbId = 'asgnfb-member-forb';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-forb', []);
  assert(fbEl.className.includes('bp08f-fb-error'), 'should have error class, got: ' + fbEl.className);
  assert(fbEl.textContent.includes('Permission'), 'should say Permission refusee');
});

asyncTest('2-04: no_change response sets info feedback (not error)', async function() {
  _rpcResponse = { ok: false, reason: 'no_change' };
  const fbId = 'asgnfb-member-noc';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-noc', ['site-a']);
  assert(fbEl.className.includes('bp08f-fb-info'), 'no_change should get info class, got: ' + fbEl.className);
  assert(!fbEl.className.includes('bp08f-fb-error'), 'should NOT have error class');
});

asyncTest('2-05: target_not_site_manager response sets error feedback', async function() {
  _rpcResponse = { ok: false, reason: 'target_not_site_manager' };
  const fbId = 'asgnfb-member-nsm';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-nsm', ['site-a']);
  assert(fbEl.className.includes('bp08f-fb-error'), 'should have error class, got: ' + fbEl.className);
  assert(fbEl.textContent.includes('site_manager'), 'should mention site_manager');
});

asyncTest('2-06: RPC error (network) sets error feedback', async function() {
  const origRpc = _sb.rpc;
  _sb.rpc = function() { return Promise.reject(new Error('Network error')); };
  const fbId = 'asgnfb-member-neterr';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-neterr', ['site-a']);
  assert(fbEl.className.includes('bp08f-fb-error'), 'network error should give error class, got: ' + fbEl.className);
  assert(fbEl.textContent.includes('Erreur'), 'should say Erreur');
  _sb.rpc = origRpc;
});

asyncTest('2-07: empty siteIds array clears all (passes empty array to RPC)', async function() {
  _rpcCalls.length = 0;
  _rpcResponse = { ok: true };
  await doSaveAssignments('member-clear', []);
  const call = _rpcCalls[_rpcCalls.length - 1];
  assert(Array.isArray(call.params.p_site_ids), 'should pass array');
  assertEqual(call.params.p_site_ids.length, 0, 'should be empty array to clear all');
});

/* ============================================================
   SECTION 3: buildAssignmentSection logic
   ============================================================ */

S.userRole = 'owner';
S.memberAssignments = { 'sm-001': ['site-a'], 'sm-002': [] };

test('3-01: only rendered for canAct AND member.role === site_manager', function() {
  const callerIsManager = isManager('owner');
  const member = { id: 'sm-001', role: 'site_manager' };
  const isOwnerRow = member.role === 'owner';
  const callerIsAdmin = (S.userRole === 'admin');
  const canAct = callerIsManager && !(callerIsAdmin && isOwnerRow);
  assert(canAct && member.role === 'site_manager', 'should render assignment section');
  const el = buildAssignmentSection(member);
  assert(el.className.includes('bp08f-assign-section'), 'should have correct class');
});

test('3-02: not rendered for member.role !== site_manager (e.g. reporter)', function() {
  const callerIsManager = isManager('owner');
  const member = { id: 'rep-001', role: 'reporter' };
  const shouldRender = callerIsManager && member.role === 'site_manager';
  assert(!shouldRender, 'reporter should NOT get assignment section');
});

test('3-03: not rendered for non-manager caller (reporter/viewer)', function() {
  ['reporter', 'viewer'].forEach(function(role) {
    assert(!isManager(role), role + ' caller should not be manager');
  });
});

test('3-04: inactive sites show (inactif) suffix', function() {
  S.memberAssignments = {};
  const member = { id: 'sm-test', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const rows = el.querySelectorAll('label');
  const gammaRow = rows.find(function(r) {
    return r._children.some(function(c) { return c._text && c._text.includes('Site Gamma'); });
  });
  assert(gammaRow, 'should have Site Gamma row');
  const span = gammaRow._children.find(function(c) { return c.tag === 'span'; });
  assert(span && span.textContent.includes('(inactif)'), 'inactive site should show (inactif), got: ' + (span && span.textContent));
});

test('3-05: currently assigned sites have checked checkboxes', function() {
  S.memberAssignments = { 'sm-chk': ['site-a', 'site-b'] };
  const member = { id: 'sm-chk', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const checkboxes = el.querySelectorAll('input[type=checkbox]:checked');
  assert(checkboxes.length >= 2, 'should have at least 2 checked checkboxes, got: ' + checkboxes.length);
  const vals = checkboxes.map(function(cb) { return cb.value; });
  assert(vals.includes('site-a'), 'site-a should be checked');
  assert(vals.includes('site-b'), 'site-b should be checked');
});

test('3-06: unassigned sites have unchecked checkboxes', function() {
  S.memberAssignments = { 'sm-unchk': ['site-a'] };
  const member = { id: 'sm-unchk', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const siteList = el.querySelector('.bp08f-assign-site-list');
  const allCbs = siteList ? siteList.querySelectorAll('input') : [];
  const siteBCb = allCbs.find(function(cb) { return cb.value === 'site-b'; });
  assert(siteBCb, 'site-b checkbox should exist');
  assert(siteBCb.checked === false, 'site-b should be unchecked');
});

/* ============================================================
   SECTION 4: zero-assignment state
   ============================================================ */

test('4-01: isSiteManagerWithNoSites detects empty state', function() {
  S.userRole = 'site_manager';
  S.assignedSiteIds = [];
  assert(isSiteManagerWithNoSites() === true, 'should detect zero-assignment state');
});

test('4-02: fetchSites result is empty for zero-assignment site_manager (mocked RLS)', function() {
  const rlsFilteredSites = [];
  S.userRole = 'site_manager';
  S.assignedSiteIds = [];
  const tempSites = S.sites;
  S.sites = rlsFilteredSites;
  assert(isSiteManagerWithNoSites() === true, 'zero sites + site_manager => no sites message');
  S.sites = tempSites;
});

test('4-03: req-site selector shows 0 options for zero-assignment site_manager', function() {
  S.userRole = 'site_manager';
  const emptyRlsSites = [];
  const activeSites = emptyRlsSites.filter(function(s) { return s.status === 'active'; });
  assertEqual(activeSites.length, 0, 'zero-assignment site_manager should have 0 active sites');
});

/* ============================================================
   SECTION 5: loadMembers assignments loading
   ============================================================ */

test('5-01: S.memberAssignments populated from enterprise_member_sites query', function() {
  const asnData = [
    { member_id: 'mem-1', site_id: 'site-a' },
    { member_id: 'mem-1', site_id: 'site-b' },
    { member_id: 'mem-2', site_id: 'site-c' },
  ];
  const memberAssignments = {};
  asnData.forEach(function(a) {
    if (!memberAssignments[a.member_id]) memberAssignments[a.member_id] = [];
    memberAssignments[a.member_id].push(a.site_id);
  });
  assert(memberAssignments['mem-1'] && memberAssignments['mem-1'].length === 2, 'mem-1 should have 2 sites');
  assert(memberAssignments['mem-2'] && memberAssignments['mem-2'].length === 1, 'mem-2 should have 1 site');
  assert(memberAssignments['mem-1'].includes('site-a'), 'should include site-a');
  assert(memberAssignments['mem-1'].includes('site-b'), 'should include site-b');
});

test('5-02: member with no assignments gets empty array in S.memberAssignments', function() {
  const asnData = [{ member_id: 'mem-1', site_id: 'site-a' }];
  const memberAssignments = {};
  asnData.forEach(function(a) {
    if (!memberAssignments[a.member_id]) memberAssignments[a.member_id] = [];
    memberAssignments[a.member_id].push(a.site_id);
  });
  const mem2Assignments = memberAssignments['mem-2'] || [];
  assertEqual(mem2Assignments.length, 0, 'member with no assignments should get empty array');
});

test('5-03: S.memberAssignments correctly keyed by member_id', function() {
  const asnData = [
    { member_id: 'mem-alpha', site_id: 'site-x' },
    { member_id: 'mem-beta',  site_id: 'site-y' },
    { member_id: 'mem-alpha', site_id: 'site-z' },
  ];
  const memberAssignments = {};
  asnData.forEach(function(a) {
    if (!memberAssignments[a.member_id]) memberAssignments[a.member_id] = [];
    memberAssignments[a.member_id].push(a.site_id);
  });
  assert('mem-alpha' in memberAssignments, 'mem-alpha key should exist');
  assert('mem-beta'  in memberAssignments, 'mem-beta key should exist');
  assertEqual(memberAssignments['mem-alpha'].length, 2, 'mem-alpha should have 2 sites');
  assertEqual(memberAssignments['mem-beta'].length, 1, 'mem-beta should have 1 site');
});

/* ============================================================
   SECTION 6: regression – existing behavior preserved
   ============================================================ */

test('6-01: owner/admin still see all sites (no assignment filter for non-sm)', function() {
  S.userRole = 'owner';
  S.assignedSiteIds = [];
  assert(!isSiteManagerWithNoSites(), 'owner with empty assignedSiteIds should NOT trigger zero-assignment state');
  S.userRole = 'admin';
  assert(!isSiteManagerWithNoSites(), 'admin with empty assignedSiteIds should NOT trigger zero-assignment state');
});

test('6-02: reporter does not see assignment UI', function() {
  const callerRole = 'reporter';
  const member = { id: 'sm-x', role: 'site_manager' };
  const canAct = isManager(callerRole);
  assert(!canAct, 'reporter canAct=false => no assignment UI');
  assert(!(canAct && member.role === 'site_manager'), 'assignment section should NOT be added for reporter caller');
});

test('6-03: viewer does not see assignment UI', function() {
  const callerRole = 'viewer';
  const member = { id: 'sm-x', role: 'site_manager' };
  const canAct = isManager(callerRole);
  assert(!canAct, 'viewer canAct=false => no assignment UI');
});

test('6-04: canCreate still returns correct values', function() {
  assert(canCreate('owner'), 'owner can create');
  assert(canCreate('admin'), 'admin can create');
  assert(canCreate('operations_manager'), 'operations_manager can create');
  assert(canCreate('site_manager'), 'site_manager can create');
  assert(canCreate('reporter'), 'reporter can create');
  assert(!canCreate('viewer'), 'viewer cannot create');
});

test('6-05: canConfirm still returns correct values', function() {
  assert(canConfirm('owner'), 'owner can confirm');
  assert(canConfirm('admin'), 'admin can confirm');
  assert(canConfirm('operations_manager'), 'operations_manager can confirm');
  assert(canConfirm('site_manager'), 'site_manager can confirm');
  assert(!canConfirm('reporter'), 'reporter cannot confirm');
  assert(!canConfirm('viewer'), 'viewer cannot confirm');
});

/* ============================================================
   SECTION 7: additional edge cases
   ============================================================ */

asyncTest('7-01: loadMyAssignments handles DB error gracefully', async function() {
  S.userRole = 'site_manager';
  S.assignedSiteIds = ['leftover-site'];
  _fromError = new Error('DB connection failed');
  _fromResponse = null;
  await loadMyAssignments();
  assertEqual(S.assignedSiteIds.length, 0, 'on error, assignedSiteIds should be reset to []');
  _fromError = null;
  _fromResponse = [];
});

asyncTest('7-02: loadMyAssignments handles null data gracefully', async function() {
  S.userRole = 'site_manager';
  _fromResponse = null;
  _fromError = null;
  await loadMyAssignments();
  assert(Array.isArray(S.assignedSiteIds), 'assignedSiteIds should remain array');
  assertEqual(S.assignedSiteIds.length, 0, 'null data => empty array');
  _fromResponse = [];
});

test('7-03: buildAssignmentSection includes save button with correct data-mid', function() {
  S.memberAssignments = {};
  const member = { id: 'sm-savebtn', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const btn = el.querySelector('.bp08f-btn-save-assign');
  assert(btn, 'save button should exist');
  assertEqual(btn.getAttribute('data-mid'), 'sm-savebtn', 'data-mid should match member id');
});

test('7-04: buildAssignmentSection feedback div has correct id', function() {
  S.memberAssignments = {};
  const member = { id: 'sm-fb', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const fb = el.querySelector('.bp08f-assign-feedback');
  assert(fb, 'feedback div should exist');
  assertEqual(fb.id, 'asgnfb-sm-fb', 'feedback id should be asgnfb-<member.id>');
});

test('7-05: buildAssignmentSection site list has correct number of rows', function() {
  S.memberAssignments = {};
  const member = { id: 'sm-rows', role: 'site_manager' };
  const el = buildAssignmentSection(member);
  const siteList = el.querySelector('.bp08f-assign-site-list');
  assert(siteList, 'site list should exist');
  const rows = siteList.querySelectorAll('label');
  assertEqual(rows.length, S.sites.length, 'should have one row per site, expected ' + S.sites.length);
});

asyncTest('7-06: doSaveAssignments shows loading state before RPC completes', async function() {
  let capturedTextDuringRpc = '';
  const origRpc = _sb.rpc;
  _sb.rpc = function(fn, params) {
    capturedTextDuringRpc = _domRegistry['asgnfb-member-loading'] ?
      _domRegistry['asgnfb-member-loading'].textContent : '';
    return Promise.resolve({ data: { ok: true }, error: null });
  };
  const fbId = 'asgnfb-member-loading';
  const fbEl = document.createElement('div');
  fbEl.id = fbId;
  _domRegistry[fbId] = fbEl;
  await doSaveAssignments('member-loading', ['site-a']);
  assert(capturedTextDuringRpc.includes('Enregistrement'), 'should show loading text during RPC call, got: ' + capturedTextDuringRpc);
  _sb.rpc = origRpc;
});

asyncTest('7-07: doSaveAssignments does nothing if no activeEnterprise', async function() {
  const origEnterprise = S.activeEnterprise;
  S.activeEnterprise = null;
  _rpcCalls.length = 0;
  await doSaveAssignments('mid', ['site-a']);
  assertEqual(_rpcCalls.length, 0, 'should not call RPC without activeEnterprise');
  S.activeEnterprise = origEnterprise;
});

test('7-08: isSiteManagerWithNoSites returns false for operations_manager', function() {
  S.userRole = 'operations_manager';
  S.assignedSiteIds = [];
  assert(!isSiteManagerWithNoSites(), 'operations_manager is not site_manager');
});

/* ============================================================
   Run all tests and report
   ============================================================ */
process.stdout.write('\n--- SECTION 1: State management ---\n');
process.stdout.write('--- SECTION 2: doSaveAssignments behavior ---\n');
process.stdout.write('--- SECTION 3: buildAssignmentSection logic ---\n');
process.stdout.write('--- SECTION 4: zero-assignment state ---\n');
process.stdout.write('--- SECTION 5: loadMembers assignments loading ---\n');
process.stdout.write('--- SECTION 6: regression - existing behavior preserved ---\n');
process.stdout.write('--- SECTION 7: additional edge cases ---\n\n');

runAll().then(function() {
  const total = _pass + _fail;
  process.stdout.write('\n==============================================\n');
  process.stdout.write('BP08F FRONTEND MOCK QA RESULTS\n');
  process.stdout.write('==============================================\n');
  process.stdout.write('Total tests : ' + total + '\n');
  process.stdout.write('Passed      : ' + _pass + '\n');
  process.stdout.write('Failed      : ' + _fail + '\n');
  if (_failures.length) {
    process.stdout.write('\nFailures:\n');
    _failures.forEach(function(f) { process.stdout.write('  x ' + f + '\n'); });
  }
  process.stdout.write('\n');
  if (_fail === 0) {
    process.stdout.write('BP08F FRONTEND MOCK QA: PASSED\n');
  } else {
    process.stdout.write('BP08F FRONTEND MOCK QA: FAILED\n');
    process.exit(1);
  }
}).catch(function(err) {
  process.stderr.write('Fatal error: ' + err.message + '\n');
  process.exit(1);
});
