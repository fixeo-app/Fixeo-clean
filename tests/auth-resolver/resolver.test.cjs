const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resolve } = require('../../js/fixeo-auth-resolver.js');
const { fixture, member, account, uuid, USER } = require('./fixture.cjs');

function empty(result, status) {
  assert.equal(result.ok, false);
  assert.equal(result.status, status);
  assert.equal(result.identity, null);
  assert.equal(result.global_space, null);
  assert.deepEqual(result.spaces, []);
  assert.deepEqual(result.enterprise_spaces, []);
  assert.equal(result.has_multiple_spaces, false);
}
function global(result, role, count = 1) {
  assert.equal(result.ok, true);
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.identity, { user_id: USER, global_role: role });
  assert.deepEqual(result.global_space, { type: role, destination: {
    client: 'dashboard-client.html', artisan: 'dashboard-artisan-v2.html', admin: 'admin.html'
  }[role] });
  assert.equal(result.spaces.length, count);
  assert.deepEqual(result.spaces, [result.global_space, ...result.enterprise_spaces]);
  assert.equal(result.has_multiple_spaces, count > 1);
}
function partial(result, status) {
  assert.equal(result.status, status);
  assert.equal(result.ok, false);
  assert.equal(result.identity.global_role, 'client');
  assert.deepEqual(result.spaces, [{ type: 'client', destination: 'dashboard-client.html' }]);
  assert.deepEqual(result.enterprise_spaces, []);
  assert.equal(result.has_multiple_spaces, false);
}
function enterpriseFixture(role = 'client', enterpriseRole = 'owner') {
  return fixture({ users: [{ id: USER, role }], enterprise_members: [member(1, enterpriseRole)], enterprise_accounts: [account(1)] });
}

test('R01 No session => NO_SESSION, no Auth validation or DB read', async () => {
  const f = fixture({ session: null }); empty(await resolve(f.client), 'NO_SESSION');
  assert.deepEqual(f.calls, [{ method: 'getSession' }]);
});
for (const [id, role] of [['R02', 'client'], ['R03', 'artisan'], ['R04', 'admin']]) {
  test(`${id} ${role} alone => exactly one canonical global space`, async () => {
    const f = fixture({ users: [{ id: USER, role }] }); global(await resolve(f.client), role);
    assert.deepEqual(f.calls.slice(0, 2), [{ method: 'getSession' }, { method: 'getUser' }]);
    assert.equal(f.calls.some(c => c.table === 'enterprise_accounts'), false);
  });
}
for (const [id, role, memberRole] of [['R05', 'client', 'owner'], ['R06', 'artisan', 'operations_manager'], ['R07', 'admin', 'owner']]) {
  test(`${id} ${role} + Enterprise ${memberRole} => independent spaces`, async () => {
    const f = enterpriseFixture(role, memberRole); const result = await resolve(f.client);
    global(result, role, 2);
    assert.deepEqual(result.enterprise_spaces[0], {
      type: 'enterprise', enterprise_id: uuid(101), enterprise_name: 'Entreprise 1', member_role: memberRole,
      membership_status: 'active', account_status: 'active', destination: null, destination_status: 'NOT_IMPLEMENTED'
    });
  });
}
test('R08 Two active enterprises => three spaces, even with identical names', async () => {
  const f = fixture({ enterprise_members: [member(1), member(2, 'site_manager')], enterprise_accounts: [account(1, 'active', 'Même nom'), account(2, 'active', 'Même nom')] });
  const result = await resolve(f.client); global(result, 'client', 3);
  assert.deepEqual(result.enterprise_spaces.map(s => s.enterprise_id), [uuid(101), uuid(102)]);
});
for (const [id, status] of [['R09', 'invited'], ['R10', 'suspended'], ['R11', 'removed']]) {
  test(`${id} Membership ${status} excluded; global preserved`, async () => {
    const f = fixture({ enterprise_members: [member(1, 'owner', status)], enterprise_accounts: [account(1)] });
    global(await resolve(f.client), 'client');
    // Also defend against a malformed SDK response that ignored the active filter.
    f.state.transform = (table, call, response) => table === 'enterprise_members'
      ? { data: [member(1, 'owner', status)], count: 1, error: null } : response;
    global(await resolve(f.client), 'client');
  });
}
for (const [id, status] of [['R12', 'suspended'], ['R13', 'closed']]) {
  test(`${id} Enterprise ${status} excluded without global error`, async () => {
    const f = fixture({ enterprise_members: [member(1)], enterprise_accounts: [account(1, status)] });
    global(await resolve(f.client), 'client');
  });
}
test('R14 Missing public user => no client fallback or Enterprise read', async () => {
  const f = fixture({ users: [] }); empty(await resolve(f.client), 'MISSING_PUBLIC_USER');
  assert.equal(f.calls.filter(c => c.table).length, 1);
});
test('R15 Invalid global roles, including enterprise and prototype keys, fail closed', async () => {
  for (const role of ['enterprise', '', null, 'ADMIN', ' client ', '__proto__', 'constructor']) {
    empty(await resolve(fixture({ users: [{ id: USER, role }] }).client), 'INVALID_GLOBAL_ROLE');
  }
});
test('R16 Editable metadata admin cannot override canonical client', async () => {
  const f = fixture(); f.state.session.user.raw_user_meta_data = { role: 'admin' };
  f.state.verifiedUser.user_metadata = { role: 'admin' }; f.state.verifiedUser.app_metadata = { role: 'admin' };
  global(await resolve(f.client), 'client');
});
test('R17 A conflicting profiles.role is never read', async () => {
  const f = fixture({ profiles: [{ id: USER, role: 'admin' }] });
  global(await resolve(f.client), 'client');
  assert.equal(f.calls.some(c => c.table === 'profiles'), false);
});
test('R18 Membership read errors preserve global, expose incomplete resolution', async () => {
  for (const key of ['errorTable', 'throwTable']) {
    const f = enterpriseFixture(); f.state[key] = 'enterprise_members';
    partial(await resolve(f.client), 'ENTERPRISE_MEMBERSHIP_READ_ERROR');
  }
});
test('R19 Enterprise ordering is deterministic by UUID, independent of input/name order', async () => {
  const f = fixture({ enterprise_members: [member(2), member(1)], enterprise_accounts: [account(2, 'active', 'Alpha'), account(1, 'active', 'Zèbre')] });
  const first = await resolve(f.client); f.state.enterprise_accounts.reverse(); f.state.enterprise_members.reverse();
  assert.deepEqual(await resolve(f.client), first);
  assert.deepEqual(first.enterprise_spaces.map(s => s.enterprise_id), [uuid(101), uuid(102)]);
});
test('R20 Enterprise destination remains null and NOT_IMPLEMENTED for all member roles', async () => {
  for (const role of ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer']) {
    const result = await resolve(enterpriseFixture('client', role).client); global(result, 'client', 2);
    assert.equal(result.enterprise_spaces[0].destination, null);
    assert.equal(result.enterprise_spaces[0].destination_status, 'NOT_IMPLEMENTED');
    assert.equal(result.enterprise_spaces[0].member_role, role);
  }
});
test('R21 Public user read errors and exceptions expose no space', async () => {
  for (const key of ['errorTable', 'throwTable']) empty(await resolve(fixture({ [key]: 'users' }).client), 'PUBLIC_USER_READ_ERROR');
});
test('R22 Account read errors and exceptions discard all Enterprise spaces', async () => {
  for (const key of ['errorTable', 'throwTable']) {
    const f = enterpriseFixture(); f.state[key] = 'enterprise_accounts';
    partial(await resolve(f.client), 'ENTERPRISE_ACCOUNT_READ_ERROR');
  }
});
test('R23 Missing SDK does not use a local identity fallback', async () => {
  for (const client of [undefined, null, {}, { auth: {} }]) empty(await resolve(client), 'CLIENT_UNAVAILABLE');
});
test('R24 Malformed session, failed token validation and identity mismatch block DB reads', async () => {
  for (const [options, status] of [
    [{ session: {} }, 'INVALID_SESSION'],
    [{ session: { user: { id: 'not-a-uuid' }, access_token: 'fake' } }, 'INVALID_SESSION'],
    [{ sessionError: true }, 'SESSION_READ_ERROR'],
    [{ verificationError: true }, 'SESSION_VALIDATION_ERROR'],
    [{ verifiedUser: null }, 'SESSION_VALIDATION_ERROR'],
    [{ verifiedUser: { id: uuid(2) } }, 'SESSION_IDENTITY_MISMATCH']
  ]) { const f = fixture(options); empty(await resolve(f.client), status); assert.equal(f.calls.some(c => c.table), false); }
});
test('R25 Logout, account switch or token rotation during resolution discards every space', async () => {
  for (const finalSession of [null, { user: { id: uuid(2) }, access_token: 'fixture-token' }, { user: { id: USER }, access_token: 'rotated' }]) {
    const f = enterpriseFixture(); f.state.finalSession = finalSession; empty(await resolve(f.client), 'SESSION_CHANGED');
  }
});
test('R26 Canonical Admin is filtered to own memberships, never every visible enterprise', async () => {
  const f = fixture({ users: [{ id: USER, role: 'admin' }], enterprise_members: [member(1, 'owner', 'active', uuid(2))], enterprise_accounts: [account(1)] });
  global(await resolve(f.client), 'admin');
  assert.ok(f.calls.find(c => c.table === 'enterprise_members').filters.some(f => f.column === 'user_id' && f.value === USER));
});
test('R27 Unknown Enterprise roles or statuses never create access', async () => {
  for (const bad of [member(1, 'superadmin'), member(1, '__proto__'), member(1, 'owner', 'unexpected'), member(1, 'owner', 'active', uuid(2))]) {
    const f = fixture({ transform: (table, call, response) => table === 'enterprise_members' ? { data: [bad], count: 1 } : response });
    partial(await resolve(f.client), 'INVALID_ENTERPRISE_MEMBERSHIP');
  }
});
test('R28 Pagination covers 1201 memberships, even under a lower server cap; accounts batched', async () => {
  const f = fixture({ serverCap: 37, enterprise_members: Array.from({ length: 1201 }, (_, n) => member(n)), enterprise_accounts: Array.from({ length: 1201 }, (_, n) => account(n)) });
  const result = await resolve(f.client); global(result, 'client', 1202);
  assert.equal(new Set(result.enterprise_spaces.map(s => s.enterprise_id)).size, 1201);
  assert.ok(f.calls.filter(c => c.table === 'enterprise_accounts').every(c => c.filters[0].value.length <= 100));
});
test('R29 Duplicate memberships fail closed instead of arbitrarily choosing a role', async () => {
  const f = fixture({ enterprise_members: [member(1, 'owner'), member(1, 'viewer')] });
  partial(await resolve(f.client), 'INVALID_ENTERPRISE_MEMBERSHIP');
});
test('R30 Missing or changing count/empty intermediate page does not return a truncated list', async () => {
  for (const change of ['count', 'empty', 'missing']) {
    const f = fixture({ serverCap: 1, enterprise_members: [member(1), member(2)], enterprise_accounts: [account(1), account(2)], transform(table, call, response) {
      if (table === 'enterprise_members' && call.range[0] > 0) {
        if (change === 'count') response.count = 3;
        if (change === 'empty') response.data = [];
        if (change === 'missing') response.count = null;
      }
      return response;
    } });
    partial(await resolve(f.client), 'ENTERPRISE_MEMBERSHIP_READ_ERROR');
  }
});
test('R31 Missing/RLS-hidden Enterprise account is explicit, global remains available', async () => {
  partial(await resolve(fixture({ enterprise_members: [member(1)] }).client), 'ENTERPRISE_ACCOUNT_UNAVAILABLE');
});
test('R32 Invalid account rows fail closed, including duplicate, foreign and invalid status', async () => {
  for (const accounts of [[account(1, 'unknown')], [account(1, 'active', '')], [account(2)], [account(1), account(1)]]) {
    const f = enterpriseFixture(); f.state.transform = (table, call, response) => table === 'enterprise_accounts' ? { data: accounts } : response;
    partial(await resolve(f.client), 'INVALID_ENTERPRISE_ACCOUNT');
  }
});
test('R33 Loading/browser resolution performs no navigation, storage, UI, RPC or writes', async () => {
  const f = enterpriseFixture(); const sandbox = {};
  for (const forbidden of ['document', 'location', 'localStorage', 'sessionStorage', 'fetch', 'window']) {
    Object.defineProperty(sandbox, forbidden, { get() { throw new Error(`Forbidden side effect: ${forbidden}`); } });
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/fixeo-auth-resolver.js'), 'utf8'), sandbox);
  assert.equal(f.calls.length, 0); // No auto-run/subscription on module load.
  const result = await sandbox.FixeoAuthResolver.resolve(f.client);
  assert.equal(result.status, 'OK'); assert.equal(result.spaces.length, 2);
  assert.equal(Object.isFrozen(sandbox.FixeoAuthResolver), true);
  assert.equal(/fixture-token|private details/.test(JSON.stringify(result)), false);
});
test('R34 No cached role: each invocation revalidates session and canonical users row', async () => {
  const f = fixture(); global(await resolve(f.client), 'client');
  f.state.users[0].role = 'artisan'; global(await resolve(f.client), 'artisan');
  f.state.session = null; empty(await resolve(f.client), 'NO_SESSION');
});
test('R35 Mismatched public user id is rejected even if the SDK response is malformed', async () => {
  const f = fixture({ transform: (table, call, response) => table === 'users' ? { data: { id: uuid(2), role: 'admin' } } : response });
  empty(await resolve(f.client), 'PUBLIC_USER_IDENTITY_MISMATCH');
});
