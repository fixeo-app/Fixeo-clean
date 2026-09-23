const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../../js/fixeo-enterprise-guard.js');
const { fixture, member, account, uuid, USER } = require('../auth-resolver/fixture.cjs');
const target = uuid(101);
const active = role => ({ enterprise_members: [member(1, role)], enterprise_accounts: [account(1)] });
const globalRole = role => ({ users: [{ id: USER, role }] });
const cases = [
  ['E01 No session → auth', { session: null }, false, 'NO_SESSION'],
  ['E02 Client without membership denied', globalRole('client'), false],
  ['E03 Artisan without membership denied', globalRole('artisan'), false],
  ['E04 Admin without membership denied', globalRole('admin'), false],
  ['E05 Client + active owner allowed', { ...globalRole('client'), ...active('owner') }, true],
  ['E06 Artisan + operations_manager allowed', { ...globalRole('artisan'), ...active('operations_manager') }, true],
  ['E07 Admin + own active owner allowed', { ...globalRole('admin'), ...active('owner') }, true],
  ['E08 Active viewer allowed', active('viewer'), true],
  ['E09 Active site_manager allowed (shell only)', active('site_manager'), true],
  ['E10 Invited membership denied', { ...active('owner'), enterprise_members: [member(1, 'owner', 'invited')] }, false],
  ['E11 Suspended membership denied', { ...active('owner'), enterprise_members: [member(1, 'owner', 'suspended')] }, false],
  ['E12 Removed membership denied', { ...active('owner'), enterprise_members: [member(1, 'owner', 'removed')] }, false],
  ['E13 Suspended account denied', { ...active('owner'), enterprise_accounts: [account(1, 'suspended')] }, false],
  ['E14 Closed account denied', { ...active('owner'), enterprise_accounts: [account(1, 'closed')] }, false],
  ['E15 Unknown member role denied', active('superadmin'), false, 'READ_ERROR'],
  ['E16 Tampered enterprise_id denied', active('owner'), false, 'INVALID_ENTERPRISE_ID', 'https://evil.invalid/'],
  ['E17 Other enterprise ID denied', active('owner'), false, 'ACCESS_DENIED', uuid(999)],
  ['E18 Two memberships + A → A only', { enterprise_members: [member(2), member(1)], enterprise_accounts: [account(2), account(1)] }, true, 'OK', target],
  ['E19 Two memberships + B → B only', { enterprise_members: [member(1), member(2)], enterprise_accounts: [account(1), account(2)] }, true, 'OK', uuid(102)],
  ['E20 Membership read error closes access', { ...active('owner'), errorTable: 'enterprise_members' }, false, 'READ_ERROR'],
  ['E21 Account read error closes access', { ...active('owner'), errorTable: 'enterprise_accounts' }, false, 'READ_ERROR'],
  ['E22 Forged user/app metadata cannot grant access', { verifiedUser: { id: USER, user_metadata: { role: 'admin', enterprise_id: target }, app_metadata: { role: 'admin' } } }, false],
  ['E23 Forged profiles.role cannot grant access', { profiles: [{ id: USER, role: 'admin', enterprise_id: target }] }, false],
  ['E24 Global Admin cannot use another user’s membership', { ...globalRole('admin'), enterprise_members: [member(1, 'owner', 'active', uuid(2))], enterprise_accounts: [account(1)] }, false],
  ['E25 Client + owner allowed without changing canonical Client', { ...globalRole('client'), ...active('owner') }, true]
];
for (const [name, options, allowed, status, requested = target] of cases) {
  test(name, async () => {
    const f = fixture(options), before = structuredClone(f.state);
    const result = await guard.check(f.client, requested);
    assert.equal(result.allowed, allowed);
    assert.equal(result.status, status || (allowed ? 'OK' : 'ACCESS_DENIED'));
    if (allowed) {
      assert.equal(result.enterprise.id, requested);
      assert.deepEqual(Object.keys(result), ['allowed', 'status', 'enterprise']);
      assert.equal(result.enterprise.name, options.enterprise_accounts.find(a => a.id === requested).name);
    } else assert.equal(result.enterprise, null);
    assert.deepEqual(f.state, before, 'No canonical role, membership or data mutation');
    for (const call of f.calls.filter(c => c.table === 'enterprise_members')) {
      assert.ok(call.filters.some(f => f.column === 'user_id' && f.value === USER));
      assert.ok(call.filters.some(f => f.column === 'status' && f.value === 'active'));
    }
    assert.ok(f.calls.every(c => !c.table || ['users', 'enterprise_members', 'enterprise_accounts'].includes(c.table)));
  });
}
test('E26 Missing/duplicate/malformed target never silently chooses a membership', async () => {
  for (const search of ['', '?enterprise_id=', '?enterprise_id=admin', `?enterprise_id=${target}&enterprise_id=${target}`, '?enterprise_id=%00']) {
    assert.equal(guard.targetFromSearch(search), null);
    const f = fixture(active('owner'));
    assert.equal((await guard.check(f.client, guard.targetFromSearch(search))).status, 'INVALID_ENTERPRISE_ID');
    assert.equal(f.calls.length, 0);
  }
  assert.equal(guard.targetFromSearch(`?enterprise_id=${target}&returnTo=https://evil.invalid`), target);
});
test('E27 Invalid server-verified identity, role or final session closes access', async () => {
  for (const override of [{ verificationError: true }, { verifiedUser: { id: uuid(2) } },
    { finalSession: null }, { users: [] }, globalRole('enterprise'), { sessionError: true }]) {
    assert.equal((await guard.check(fixture({ ...active('owner'), ...override }).client, target)).allowed, false);
  }
});
test('E28 Active enterprise admin and reporter roles allowed without global Admin', async () => {
  for (const role of ['admin', 'reporter']) {
    const result = await guard.check(fixture(active(role)).client, target);
    assert.equal(result.allowed, true); assert.equal(result.enterprise.role, role);
  }
});
test('E29 SDK exceptions and missing accounts fail closed', async () => {
  for (const override of [{ throwTable: 'enterprise_members' }, { enterprise_accounts: [] }]) {
    assert.equal((await guard.check(fixture({ ...active('owner'), ...override }).client, target)).status, 'READ_ERROR');
  }
});
