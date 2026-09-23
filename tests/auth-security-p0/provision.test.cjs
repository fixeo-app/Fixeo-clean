const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = readFileSync(join(__dirname, '../../js/fixeo-profile-provision.js'), 'utf8');

async function provision({ canonical = 'client', metadata = { role: 'admin' }, existing = false,
  profileError = null, canonicalError = null, insertError = null, session = true, configured = true } = {}) {
  const writes = [], reads = [], warnings = [];
  const user = { id: 'synthetic-user', email: 'fixture@example.invalid', user_metadata: metadata };
  let listener;
  const sb = {
    auth: {
      getSession: async () => ({ data: { session: session ? { user } : null } }),
      onAuthStateChange: cb => { listener = cb; }
    },
    from(table) {
      return {
        select(columns) { reads.push({ table, columns }); return this; },
        eq(column, value) { assert.equal(column, 'id'); assert.equal(value, user.id); return this; },
        async maybeSingle() {
          return table === 'profiles'
            ? { data: existing ? { id: user.id } : null, error: profileError }
            : { data: canonical === null ? null : { role: canonical }, error: canonicalError };
        },
        async insert(value) { writes.push({ table, value }); return { error: insertError }; }
      };
    }
  };
  const context = { document: { readyState: 'complete' }, console: { warn: (...args) => warnings.push(args) },
    window: { FixeoSupabaseClient: { CONFIGURED: configured, client: sb, ready: async () => {} } } };
  vm.runInNewContext(source, context, { filename: 'fixeo-profile-provision.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { writes, reads, warnings, user, listener, context };
}

test('Provisioning trusts canonical Client/Artisan, even when metadata claims Admin', async () => {
  for (const canonical of ['client','artisan']) {
    const r = await provision({ canonical, metadata: { role: 'admin', full_name: 'Synthetic Name' } });
    assert.equal(r.writes.length, 1);
    assert.equal(r.writes[0].table, 'profiles');
    assert.equal(r.writes[0].value.role, canonical);
    assert.equal(r.writes[0].value.full_name, 'Synthetic Name');
    assert.deepEqual(r.reads.map(x => x.table), ['profiles','users']);
  }
});
test('A real canonical Admin may provision their Admin mirror', async () => {
  const r = await provision({ canonical: 'admin', metadata: { role: 'client' } });
  assert.equal(r.writes[0].value.role, 'admin');
});
test('Missing, invalid or unreadable canonical role fails closed', async () => {
  for (const canonical of [null, undefined, '', 'enterprise', 'Admin', 'superadmin']) {
    const options = canonical === undefined ? { canonicalError: { code: '42501' } } : { canonical };
    const r = await provision(options);
    assert.equal(r.writes.length, 0);
  }
  assert.equal((await provision({ canonical: 'admin', canonicalError: { message: 'unavailable' } })).writes.length, 0);
});
test('Existing profile stays untouched; failed profile lookup never triggers a write', async () => {
  const r = await provision({ existing: true });
  assert.equal(r.writes.length, 0);
  assert.deepEqual(r.reads.map(x => x.table), ['profiles']);
  assert.equal((await provision({ profileError: { code: '42501' } })).writes.length, 0);
});
test('Guest/unconfigured pages are silent; concurrent insert remains harmless', async () => {
  for (const options of [{ session: false },{ configured: false }]) {
    const r = await provision(options);
    assert.equal(r.writes.length, 0);
    assert.equal(r.warnings.length, 0);
  }
  assert.equal((await provision({ insertError: { code: '23505' } })).warnings.length, 0);
});
test('Sign-in/refresh keep canonical provisioning; script duplicate load remains inert', async () => {
  const r = await provision({ session: false, canonical: 'artisan' });
  for (const event of ['SIGNED_IN','TOKEN_REFRESHED']) {
    r.listener(event, { user: r.user });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(r.writes.length, 2);
  assert.ok(r.writes.every(w => w.value.role === 'artisan'));
  vm.runInNewContext(source, r.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.writes.length, 2);
});
