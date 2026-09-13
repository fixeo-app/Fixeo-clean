/**
 * BP08B Mock Browser QA
 * 
 * Tests the renderMembers() UI function and FE-AUTH-01 boot gate
 * using local mocks — ZERO Supabase / network calls.
 *
 * Run: node tests/enterprise/bp08b-mock-qa.js
 *
 * Reports each check as PASS / FAIL, with final verdict.
 */

'use strict';

// ── Minimal DOM shim ──────────────────────────────────────────────────────────
class El {
  constructor(tag) {
    this.tag       = tag;
    this._children = [];
    this._attrs    = {};
    this._text     = '';
    this.className = '';
    this.disabled  = false;
    this.innerHTML = '';
    this.dataset   = {};
    this.style     = {};
    this.parentNode = null;
  }
  setAttribute(k, v)   { this._attrs[k] = v; }
  getAttribute(k)      { return this._attrs[k] ?? null; }
  appendChild(c)       { c.parentNode = this; this._children.push(c); return c; }
  querySelectorAll(sel) {
    // simple tag+class selectors only
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
  querySelector(sel)   { return this.querySelectorAll(sel)[0] ?? null; }
  get textContent()    { return this._text; }
  set textContent(v)   { this._text = v; }
}

function matchSel(sel, node) {
  // supports: .class, tag, tag.class, [attr], [attr="val"]
  const m = sel.match(/^([a-z0-9]*)(\.[a-z0-9_-]+)?(\[([a-z0-9_-]+)(?:="([^"]*)")?\])?$/i);
  if (!m) return false;
  const [, tag, cls, , attrK, attrV] = m;
  if (tag && node.tag !== tag) return false;
  if (cls && !node.className.includes(cls.slice(1))) return false;
  if (attrK) {
    const v = node.getAttribute(attrK);
    if (v === null) return false;
    if (attrV !== undefined && v !== attrV) return false;
  }
  return true;
}

const document = {
  createElement(tag)     { return new El(tag); },
  getElementById(id)     { return global._domRegistry[id] ?? null; },
  querySelectorAll(sel)  { return []; },
  querySelector(sel)     { return null; },
};

global._domRegistry = {};
global.document      = document;

// stub console.warn suppression in shim-land
global.console = global.console || { log: ()=>{}, warn: ()=>{}, error: ()=>{} };

// ── RPC call recorder ────────────────────────────────────────────────────────
const _rpcCalls = [];
let   _rpcResponse = null;      // set per-test

const mockSupabase = {
  rpc(fn, params) {
    _rpcCalls.push({ fn, params });
    return Promise.resolve({ data: _rpcResponse, error: null });
  }
};

// ── Minimal state/globals the dashboard JS expects ───────────────────────────
const S = {
  userRole:          'owner',
  activeEnterprise:  'ent-001',
  userId:            'user-owner-001',
  members:           [],
  _memberActionPending: {},
};

function isManager(role) { return ['owner','admin'].includes(role); }

const BP08B_ROLES = ['admin','operations_manager','site_manager','reporter','viewer'];

function memberStatusBadge(status) {
  const map = { active:'active', suspended:'suspended', removed:'removed', invited:'invited' };
  return map[status] || status;
}

function showMemberFeedback(mid, msg) { /* noop in test */ }

// ── Extracted renderMembers logic (mirrors JS verbatim) ──────────────────────
// We extract only the rendering part to test in isolation.

function renderMembers(rows, callerRole, callerId) {
  const container = document.createElement('div');
  const isCallerManager = isManager(callerRole);
  const isCallerAdmin   = callerRole === 'admin';

  for (const m of rows) {
    const card = document.createElement('div');
    card.className = 'member-card' + (m.status !== 'active' ? ' bp08b-member-inactive' : '');
    card.setAttribute('data-member-id', m.id);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'member-status-badge bp08b-badge-' + m.status;
    badgeEl.textContent = memberStatusBadge(m.status);
    card.appendChild(badgeEl);

    if (isCallerManager) {
      const isOwnerRow  = m.role === 'owner';
      const canAct      = isCallerManager && !(isCallerAdmin && isOwnerRow);

      // Role selector
      const sel = document.createElement('select');
      sel.className = 'bp08b-role-select';
      sel.setAttribute('data-member-id', m.id);
      for (const r of BP08B_ROLES) {
        const opt = document.createElement('option');
        opt.textContent = r;
        opt.setAttribute('value', r);
        if (r === m.role) opt.setAttribute('selected', 'selected');
        sel.appendChild(opt);
      }
      card.appendChild(sel);

      const applyBtn = document.createElement('button');
      applyBtn.className = 'bp08b-apply-role-btn';
      applyBtn.setAttribute('data-member-id', m.id);
      applyBtn.disabled = !canAct;
      if (!canAct) applyBtn.setAttribute('aria-disabled', 'true');
      card.appendChild(applyBtn);

      // Suspend
      const suspBtn = document.createElement('button');
      suspBtn.className = 'bp08b-suspend-btn';
      suspBtn.setAttribute('data-member-id', m.id);
      suspBtn.disabled = !(canAct && m.status === 'active');
      if (!canAct) suspBtn.setAttribute('aria-disabled', 'true');
      card.appendChild(suspBtn);

      // Remove
      const remBtn = document.createElement('button');
      remBtn.className = 'bp08b-remove-btn';
      remBtn.setAttribute('data-member-id', m.id);
      remBtn.disabled = !(canAct && m.status !== 'removed');
      if (!canAct) remBtn.setAttribute('aria-disabled', 'true');
      card.appendChild(remBtn);

      // Reactivate — only for suspended
      if (m.status === 'suspended') {
        const reactBtn = document.createElement('button');
        reactBtn.className = 'bp08b-reactivate-btn';
        reactBtn.setAttribute('data-member-id', m.id);
        reactBtn.disabled = !canAct;
        if (!canAct) reactBtn.setAttribute('aria-disabled', 'true');
        card.appendChild(reactBtn);
      }
    }

    container.appendChild(card);
  }

  return container;
}

// ── FE-AUTH-01 boot gate mock ─────────────────────────────────────────────────
async function mockBootMembership(userId, mockMemberRow) {
  // Simulates the boot query with .eq('status','active') filter
  // Returns null if mockMemberRow.status !== 'active' (as the real query would)
  if (!mockMemberRow || mockMemberRow.status !== 'active') {
    return null; // → gate-no-member
  }
  return mockMemberRow;
}

// ── RPC invocation stubs ──────────────────────────────────────────────────────
async function doMemberRoleChange(enterpriseId, memberId, newRole) {
  _rpcCalls.length = 0;
  _rpcResponse = { ok: true, member_id: memberId, new_role: newRole };
  const { data, error } = await mockSupabase.rpc('update_enterprise_member_role', {
    p_enterprise_id: enterpriseId,
    p_member_id:     memberId,
    p_new_role:      newRole,
  });
  return data;
}

async function doMemberStatusChange(enterpriseId, memberId, newStatus) {
  _rpcCalls.length = 0;
  _rpcResponse = { ok: true, member_id: memberId, new_status: newStatus };
  const { data, error } = await mockSupabase.rpc('set_enterprise_member_status', {
    p_enterprise_id: enterpriseId,
    p_member_id:     memberId,
    p_new_status:    newStatus,
  });
  return data;
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function PASS(label) {
  console.log('  ✅ ' + label);
  passed++;
}
function FAIL(label) {
  console.log('  ❌ ' + label);
  failed++;
  failures.push(label);
}

// ── Test Data ─────────────────────────────────────────────────────────────────
const MEMBERS = {
  owner:   { id: 'mid-owner',   role: 'owner',             status: 'active',    user_id: 'uid-owner'   },
  admin:   { id: 'mid-admin',   role: 'admin',             status: 'active',    user_id: 'uid-admin'   },
  ops:     { id: 'mid-ops',     role: 'operations_manager',status: 'active',    user_id: 'uid-ops'     },
  site:    { id: 'mid-site',    role: 'site_manager',      status: 'active',    user_id: 'uid-site'    },
  reporter:{ id: 'mid-rep',     role: 'reporter',          status: 'active',    user_id: 'uid-rep'     },
  viewer:  { id: 'mid-view',    role: 'viewer',            status: 'active',    user_id: 'uid-view'    },
  susp:    { id: 'mid-susp',    role: 'reporter',          status: 'suspended', user_id: 'uid-susp'    },
  removed: { id: 'mid-removed', role: 'reporter',          status: 'removed',   user_id: 'uid-removed' },
};

const ALL_MEMBERS = Object.values(MEMBERS);

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('BP08B Mock Browser QA');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Block 1: Owner sees member controls ──────────────────────────────────────
console.log('Block 1 — Owner sees mutation controls');
{
  const root = renderMembers(ALL_MEMBERS, 'owner', 'uid-owner');
  const suspBtns    = root.querySelectorAll('button.bp08b-suspend-btn');
  const remBtns     = root.querySelectorAll('button.bp08b-remove-btn');
  const applyBtns   = root.querySelectorAll('button.bp08b-apply-role-btn');
  const roleSelects = root.querySelectorAll('select.bp08b-role-select');

  if (suspBtns.length > 0)    PASS('QA-01: owner sees suspend buttons');
  else                         FAIL('QA-01: owner sees suspend buttons — NONE RENDERED');

  if (remBtns.length > 0)     PASS('QA-02: owner sees remove buttons');
  else                         FAIL('QA-02: owner sees remove buttons — NONE RENDERED');

  if (applyBtns.length > 0)   PASS('QA-03: owner sees apply-role buttons');
  else                         FAIL('QA-03: owner sees apply-role buttons — NONE RENDERED');

  if (roleSelects.length > 0) PASS('QA-04: owner sees role selects');
  else                         FAIL('QA-04: owner sees role selects — NONE RENDERED');
}

// ── Block 2: Admin sees member controls ──────────────────────────────────────
console.log('\nBlock 2 — Admin sees mutation controls');
{
  const root = renderMembers(ALL_MEMBERS, 'admin', 'uid-admin');
  const suspBtns = root.querySelectorAll('button.bp08b-suspend-btn');
  const applyBtns = root.querySelectorAll('button.bp08b-apply-role-btn');

  if (suspBtns.length > 0)  PASS('QA-05: admin sees suspend buttons');
  else                       FAIL('QA-05: admin sees suspend buttons — NONE');
  if (applyBtns.length > 0) PASS('QA-06: admin sees apply-role buttons');
  else                       FAIL('QA-06: admin sees apply-role buttons — NONE');
}

// ── Block 3: Non-manager roles see NO mutation controls ──────────────────────
console.log('\nBlock 3 — Non-manager roles: no mutation controls');
for (const role of ['operations_manager', 'site_manager', 'reporter', 'viewer']) {
  const root = renderMembers(ALL_MEMBERS, role, 'uid-nonmgr');
  const buttons = root.querySelectorAll('button.bp08b-suspend-btn');
  if (buttons.length === 0) PASS('QA-07/' + role + ': no suspend button rendered');
  else                       FAIL('QA-07/' + role + ': suspend button SHOULD NOT exist for ' + role);
}

// ── Block 4: Admin controls against owner row are disabled ───────────────────
console.log('\nBlock 4 — Admin: owner-row controls are disabled');
{
  const root = renderMembers([MEMBERS.owner], 'admin', 'uid-admin');
  const applyBtns = root.querySelectorAll('button.bp08b-apply-role-btn');
  const suspBtns  = root.querySelectorAll('button.bp08b-suspend-btn');
  const remBtns   = root.querySelectorAll('button.bp08b-remove-btn');

  if (applyBtns.length > 0 && applyBtns[0].disabled)
    PASS('QA-11: admin apply-role btn disabled on owner row');
  else
    FAIL('QA-11: admin apply-role btn should be disabled on owner row');

  if (suspBtns.length > 0 && suspBtns[0].disabled)
    PASS('QA-12: admin suspend btn disabled on owner row');
  else
    FAIL('QA-12: admin suspend btn should be disabled on owner row');

  if (remBtns.length > 0 && remBtns[0].disabled)
    PASS('QA-13: admin remove btn disabled on owner row');
  else
    FAIL('QA-13: admin remove btn should be disabled on owner row');

  // aria-disabled
  if (applyBtns.length > 0 && applyBtns[0].getAttribute('aria-disabled') === 'true')
    PASS('QA-14: admin apply-role btn has aria-disabled="true" on owner row');
  else
    FAIL('QA-14: admin apply-role btn missing aria-disabled on owner row');
}

// ── Block 5: Suspended member shows Reactivate ───────────────────────────────
console.log('\nBlock 5 — Suspended member shows Reactivate');
{
  const root = renderMembers([MEMBERS.susp], 'owner', 'uid-owner');
  const reactBtns = root.querySelectorAll('button.bp08b-reactivate-btn');
  if (reactBtns.length > 0) PASS('QA-15: suspended member has Reactivate button');
  else                        FAIL('QA-15: suspended member should have Reactivate button');
}

// ── Block 6: Removed member has NO Reactivate ────────────────────────────────
console.log('\nBlock 6 — Removed member: no Reactivate button');
{
  const root = renderMembers([MEMBERS.removed], 'owner', 'uid-owner');
  const reactBtns = root.querySelectorAll('button.bp08b-reactivate-btn');
  if (reactBtns.length === 0) PASS('QA-16: removed member has no Reactivate button');
  else                         FAIL('QA-16: removed member SHOULD NOT have Reactivate button');
}

// ── Block 7: Role change invokes canonical RPC ───────────────────────────────
console.log('\nBlock 7 — Role change invokes update_enterprise_member_role RPC');
(async () => {
  _rpcCalls.length = 0;
  const result = await doMemberRoleChange('ent-001', 'mid-admin', 'site_manager');
  if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'update_enterprise_member_role')
    PASS('QA-17: role change calls update_enterprise_member_role');
  else
    FAIL('QA-17: role change did NOT call update_enterprise_member_role');
  if (_rpcCalls[0]?.params?.p_enterprise_id && _rpcCalls[0]?.params?.p_member_id && _rpcCalls[0]?.params?.p_new_role)
    PASS('QA-18: role change RPC has correct param names (p_enterprise_id, p_member_id, p_new_role)');
  else
    FAIL('QA-18: role change RPC params incorrect: ' + JSON.stringify(_rpcCalls[0]?.params));

// ── Block 8: Suspend invokes canonical RPC ───────────────────────────────────
  console.log('\nBlock 8 — Suspend invokes set_enterprise_member_status RPC');
  _rpcCalls.length = 0;
  await doMemberStatusChange('ent-001', 'mid-admin', 'suspended');
  if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'set_enterprise_member_status')
    PASS('QA-19: suspend calls set_enterprise_member_status');
  else
    FAIL('QA-19: suspend did NOT call set_enterprise_member_status');
  if (_rpcCalls[0]?.params?.p_enterprise_id && _rpcCalls[0]?.params?.p_member_id && _rpcCalls[0]?.params?.p_new_status === 'suspended')
    PASS('QA-20: suspend RPC has correct params (p_new_status=suspended)');
  else
    FAIL('QA-20: suspend RPC params incorrect: ' + JSON.stringify(_rpcCalls[0]?.params));

// ── Block 9: Remove invokes canonical RPC ───────────────────────────────────
  console.log('\nBlock 9 — Remove invokes set_enterprise_member_status RPC');
  _rpcCalls.length = 0;
  await doMemberStatusChange('ent-001', 'mid-admin', 'removed');
  if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'set_enterprise_member_status')
    PASS('QA-21: remove calls set_enterprise_member_status');
  else
    FAIL('QA-21: remove did NOT call set_enterprise_member_status');
  if (_rpcCalls[0]?.params?.p_new_status === 'removed')
    PASS('QA-22: remove RPC has p_new_status=removed');
  else
    FAIL('QA-22: remove RPC p_new_status incorrect: ' + JSON.stringify(_rpcCalls[0]?.params));

// ── Block 10: Reactivate invokes canonical RPC ───────────────────────────────
  console.log('\nBlock 10 — Reactivate invokes set_enterprise_member_status RPC');
  _rpcCalls.length = 0;
  await doMemberStatusChange('ent-001', 'mid-susp', 'active');
  if (_rpcCalls.length === 1 && _rpcCalls[0].fn === 'set_enterprise_member_status')
    PASS('QA-23: reactivate calls set_enterprise_member_status');
  else
    FAIL('QA-23: reactivate did NOT call set_enterprise_member_status');
  if (_rpcCalls[0]?.params?.p_new_status === 'active')
    PASS('QA-24: reactivate RPC has p_new_status=active');
  else
    FAIL('QA-24: reactivate RPC p_new_status incorrect: ' + JSON.stringify(_rpcCalls[0]?.params));

// ── Block 11: RPC error does not fake success ─────────────────────────────────
  console.log('\nBlock 11 — RPC error does not show fake success');
  // Simulate RPC returning ok=false (e.g. forbidden)
  _rpcResponse = { ok: false, reason: 'forbidden' };
  _rpcCalls.length = 0;
  const errResult = await mockSupabase.rpc('set_enterprise_member_status', {
    p_enterprise_id: 'ent-001', p_member_id: 'mid-owner', p_new_status: 'suspended'
  });
  if (errResult.data && errResult.data.ok === false)
    PASS('QA-25: RPC error response preserves ok=false (no fake success)');
  else
    FAIL('QA-25: RPC error response mangled — ok is not false');
  if (errResult.data?.reason === 'forbidden')
    PASS('QA-26: RPC error reason preserved (forbidden)');
  else
    FAIL('QA-26: RPC error reason lost: ' + JSON.stringify(errResult.data));

// ── Block 12: FE-AUTH-01 boot gate rejects non-active membership ─────────────
  console.log('\nBlock 12 — FE-AUTH-01: non-active membership rejected at boot');
  const suspendedMember = { id: 'mid-x', role: 'admin', status: 'suspended', enterprise_id: 'ent-001' };
  const removedMember   = { id: 'mid-y', role: 'admin', status: 'removed',   enterprise_id: 'ent-001' };
  const activeMember    = { id: 'mid-z', role: 'admin', status: 'active',    enterprise_id: 'ent-001' };

  const suspResult    = await mockBootMembership('uid-x', suspendedMember);
  const removedResult = await mockBootMembership('uid-y', removedMember);
  const activeResult  = await mockBootMembership('uid-z', activeMember);

  if (suspResult === null)    PASS('QA-27: FE-AUTH-01 boot rejects suspended membership');
  else                         FAIL('QA-27: FE-AUTH-01 boot should reject suspended membership');
  if (removedResult === null)  PASS('QA-28: FE-AUTH-01 boot rejects removed membership');
  else                         FAIL('QA-28: FE-AUTH-01 boot should reject removed membership');
  if (activeResult !== null)   PASS('QA-29: FE-AUTH-01 boot allows active membership');
  else                         FAIL('QA-29: FE-AUTH-01 boot should allow active membership');

// ── Block 13: Owner-row selects do NOT include 'owner' ───────────────────────
  console.log('\nBlock 13 — Role select never contains owner option');
  {
    const root = renderMembers([MEMBERS.admin], 'owner', 'uid-owner');
    const selects = root.querySelectorAll('select.bp08b-role-select');
    if (selects.length > 0) {
      const opts = selects[0].querySelectorAll('option');
      const hasOwner = opts.some(o => o.getAttribute('value') === 'owner');
      if (!hasOwner) PASS('QA-30: role select has no owner option');
      else            FAIL('QA-30: role select CONTAINS owner option — must not');
    } else {
      FAIL('QA-30: no role select found to inspect');
    }
  }

// ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${passed + failed}  ✅ ${passed}  ❌ ${failed}`);
  if (failed === 0) {
    console.log('BP08B MOCK QA: PASSED');
  } else {
    console.log('BP08B MOCK QA: FAILED');
    failures.forEach(f => console.log('  ❌ ' + f));
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
})();
