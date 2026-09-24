// Offline PostgreSQL 17 only. No credentials, URLs, network or Production writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { PGlite } = require('../auth-security-p0/node_modules/@electric-sql/pglite');
const { fixtureSQL, transactionBody, catalogue: fullQuery, after: s0After, before: s0Before, evidence, ids, uuid, literal } = require('../enterprise-security-s0/fixture.cjs');
const root = path.join(__dirname, '../..');
const dir = path.join(root, 'docs/enterprise-os/security-s1a');
const patchFile = path.join(dir, 'patch-proposed.sql');
const patch = transactionBody(patchFile);
const query = fs.readFileSync(path.join(__dirname, 'catalogue-select.sql'), 'utf8');
const before = require('../../docs/enterprise-os/security-s1a/production-before.json');
const expectedPost = require('../../docs/enterprise-os/security-s1a/expected-post.json');

test('S1A exact authorized patch on isolated PostgreSQL 17', async t => {
  const db = new PGlite();
  const rows = async sql => (await db.query(sql)).rows;
  const scalar = async sql => Object.values((await rows(sql))[0])[0];
  const snapshot = async () => (await rows(query))[0].contract;
  const full = async () => (await rows(fullQuery))[0].contract;
  const role = async (r, sub = null) => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims',${literal(JSON.stringify({ role: r, sub }))},true); SET LOCAL ROLE ${r};`);
  const owner = () => role('postgres');
  const denied = async (sql, code = '42501') => {
    await db.exec('SAVEPOINT denied;');
    try { await assert.rejects(db.exec(sql), e => e.code === code); }
    finally { await db.exec('ROLLBACK TO denied; RELEASE denied;'); }
  };
  const isolated = async (name, fn) => t.test(name, async () => {
    await owner(); await db.exec('SAVEPOINT scenario;');
    try { await fn(); }
    finally { await db.exec('ROLLBACK TO scenario; RELEASE scenario;'); await owner(); }
  });
  const request = n => `INSERT INTO public.service_requests(id,client_profile_id,service_category,city,description) VALUES ('${uuid(n)}','${ids.client}','plomberie','Casablanca','Synthetic local S1A');`;
  const enterprise = uuid(700), site = uuid(701);
  const enterpriseFixture = async () => db.exec(`INSERT INTO public.enterprise_accounts(id,name) VALUES ('${enterprise}','Synthetic Enterprise');
    INSERT INTO public.enterprise_sites(id,enterprise_id,name,city) VALUES ('${site}','${enterprise}','Synthetic Site','Casablanca');
    INSERT INTO public.enterprise_members(enterprise_id,user_id,role,status) VALUES ('${enterprise}','${ids.client}','owner','active'),('${enterprise}','${ids.other}','viewer','active');`);
  const enterpriseRequest = async () => {
    await role('authenticated', ids.client);
    const result = await scalar(`SELECT public.create_enterprise_request('${enterprise}','${site}','plomberie','Synthetic Enterprise','urgent')`);
    assert.equal(result.ok, true); await owner(); return result.service_request_id;
  };
  const allData = async () => {
    const data = {};
    for (const tab of evidence.tables.tables) data[tab.name] = await scalar(`SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (SELECT to_jsonb(t) x FROM public.${tab.name} t)s`);
    return data;
  };
  try {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(patchFile)).digest('hex'), '7e998abb17c31ccc587715c81fa9ecad803cff7e8cb6f2cccd31db83f3322844');
    await db.exec('BEGIN;');
    await db.exec(fixtureSQL());
    await db.exec(transactionBody(path.join(root, 'docs/enterprise-os/security-s0/patch-proposed.sql')));
    // The shared S0 fixture models dispatch ACLs. Restore the independently captured Enterprise RPC ACL too.
    for (const f of before.rpc_acl) {
      await db.exec(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC,anon,authenticated,service_role;`);
      for (const r of ['anon','authenticated','service_role']) if (f[r]) await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${r};`);
    }
    assert.deepEqual(await full(), s0After);
    assert.deepEqual(await snapshot(), before.target);
    await isolated('G01 drift guard refuses a changed anon policy', async () => {
      await db.exec('ALTER POLICY anon_insert ON public.service_requests WITH CHECK(false);');
      const drift = await snapshot(); await denied(patch, 'P0001'); assert.deepEqual(await snapshot(), drift);
    });
    await isolated('G02 viewer assignment is reproducible before S1A', async () => {
      await enterpriseFixture(); const id = await enterpriseRequest();
      await role('authenticated', ids.other);
      assert.equal((await rows(`UPDATE public.service_requests SET status='assigned' WHERE id='${id}' RETURNING id`)).length, 1);
    });
    const businessBefore = await allData();
    await db.exec(patch);
    const actual = await snapshot();
    for (const [key, expected] of Object.entries(expectedPost)) {
      assert.equal(await scalar(`SELECT md5((${literal(JSON.stringify(actual))}::jsonb)->>${literal(key)})`), expected, key);
    }
    assert.deepEqual(await allData(), businessBefore);
    await isolated('A01 actual guest bridge emits four columns and INSERT succeeds', async () => {
      let handler, payload;
      const window = { addEventListener(name, fn) { if (name === 'fixeo:client-request-created') handler = fn; }, dispatchEvent() {}, FixeoSupabaseClient: { CONFIGURED: true, ready: async () => {}, client: { auth: { getSession: async () => ({ data: { session: null } }) }, from(name) { assert.equal(name, 'service_requests'); return { insert: async value => { payload = value; return { error: null }; } }; } } } };
      vm.runInNewContext(fs.readFileSync(path.join(root, 'js/fixeo-reservation-supabase-bridge.js'), 'utf8'), { window, console, CustomEvent: function() {} });
      handler({ detail: { id: 'local', service: 'plomberie', city: 'Casablanca', description: 'Synthetic guest', budget: 500, artisan_name: 'Synthetic', tracking_ref: 'local', commission_paid: true, client_profile_id: ids.other } });
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(Object.keys(payload).sort(), ['city','description','service_category','status']);
      assert.equal(payload.status, 'new');
      await role('anon');
      await db.exec(`INSERT INTO public.service_requests(service_category,city,description,status) VALUES (${literal(payload.service_category)},${literal(payload.city)},${literal(payload.description)},${literal(payload.status)});`);
    });
    await isolated('A02 guest status other than new is denied by RLS', async () => {
      await role('anon'); await denied("INSERT INTO public.service_requests(service_category,city,description,status) VALUES ('plomberie','Casablanca','Synthetic','assigned');");
    });
    await isolated('A03 guest client_profile_id write is denied', async () => {
      await role('anon'); await denied(`INSERT INTO public.service_requests(service_category,city,description,status,client_profile_id) VALUES ('plomberie','Casablanca','Synthetic','new','${ids.client}');`);
    });
    await isolated('A04 guest financial field is denied by column privilege', async () => {
      assert.equal(await scalar("SELECT has_column_privilege('anon','public.service_requests','commission_paid','INSERT')"), false);
      await role('anon'); await denied("INSERT INTO public.service_requests(service_category,city,description,status,commission_paid) VALUES ('plomberie','Casablanca','Synthetic','new',true);");
    });
    await isolated('A05 guest SELECT sees no rows', async () => {
      await db.exec(request(801)); await role('anon'); assert.deepEqual(await rows(`SELECT id FROM public.service_requests WHERE id='${uuid(801)}'`), []);
    });
    await isolated('A06 guest UPDATE affects no rows', async () => {
      await db.exec(request(802)); await role('anon'); assert.deepEqual(await rows(`UPDATE public.service_requests SET description='Forged' WHERE id='${uuid(802)}' RETURNING id`), []);
    });
    await isolated('A07 guest DELETE affects no rows', async () => {
      await db.exec(request(803)); await role('anon'); assert.deepEqual(await rows(`DELETE FROM public.service_requests WHERE id='${uuid(803)}' RETURNING id`), []);
      await owner(); assert.equal(await scalar(`SELECT count(*)::int FROM public.service_requests WHERE id='${uuid(803)}'`), 1);
    });
    await isolated('A08 authenticated personal request INSERT succeeds', async () => {
      await role('authenticated', ids.client); await db.exec(request(804));
      assert.equal(await scalar(`SELECT count(*)::int FROM public.service_requests WHERE id='${uuid(804)}'`), 1);
    });
    await isolated('A09 Enterprise RPC creates request, ERC, SLA and audit', async () => {
      await enterpriseFixture(); const id = await enterpriseRequest(); assert.ok(id);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.enterprise_request_context WHERE service_request_id='${id}'`), 1);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.enterprise_request_sla WHERE service_request_id='${id}'`), 1);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.enterprise_audit_events WHERE enterprise_id='${enterprise}'`), 2);
    });
    await isolated('A10 Enterprise viewer can read but cannot assign new request', async () => {
      await enterpriseFixture(); const id = await enterpriseRequest(); await role('authenticated', ids.other);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.service_requests WHERE id='${id}'`), 1);
      assert.deepEqual(await rows(`UPDATE public.service_requests SET status='assigned' WHERE id='${id}' RETURNING id`), []);
    });
    await isolated('A11 linked artisan owner retains UPDATE', async () => {
      await db.exec(request(805));
      await db.exec(`INSERT INTO public.missions(request_id,artisan_profile_id,status) VALUES ('${uuid(805)}','${ids.artisanRow}','pending');`);
      await role('authenticated', ids.artisan);
      assert.equal((await rows(`UPDATE public.service_requests SET status='in_progress' WHERE id='${uuid(805)}' RETURNING id`)).length, 1);
    });
    await isolated('A12 same phone without artisan ownership cannot UPDATE', async () => {
      await enterpriseFixture(); const id = await enterpriseRequest();
      await db.exec(`UPDATE public.artisans SET phone_public='+000000000099' WHERE id='${ids.artisanRow}'; INSERT INTO public.missions(request_id,artisan_profile_id,status) VALUES ('${id}','${ids.artisanRow}','pending');`);
      await role('authenticated', ids.other);
      await db.exec(`UPDATE public.profiles SET phone='+000000000099' WHERE id='${ids.other}';`);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.service_requests WHERE id='${id}'`), 1);
      assert.deepEqual(await rows(`UPDATE public.service_requests SET description='Forged phone' WHERE id='${id}' RETURNING id`), []);
    });
    await isolated('A13 canonical Artisan acceptance RPC succeeds', async () => {
      await db.exec(request(806)); await role('authenticated', ids.artisan);
      const result = await scalar(`SELECT public.accept_my_dispatch_offer_v1('${uuid(806)}')`);
      assert.equal(result.ok, true); assert.equal(result.reason, 'accepted');
      await owner(); assert.equal(await scalar(`SELECT status FROM public.service_requests WHERE id='${uuid(806)}'`), 'assigned');
    });
    await isolated('A14 guest INSERT still triggers unchanged historical dispatch locally', async () => {
      await role('anon'); await db.exec("INSERT INTO public.service_requests(service_category,city,description,status) VALUES ('plomberie','Casablanca','A14','new');");
      await owner(); assert.equal(await scalar("SELECT count(*)::int FROM public.dispatch_execution_queue q JOIN public.service_requests s ON q.request_id=s.id WHERE s.description='A14'"), 2);
      assert.deepEqual((await snapshot()).triggers, before.target.triggers);
    });
    await isolated('A15 P0 canonical role authority is preserved', async () => {
      await role('authenticated', ids.client); assert.equal(await scalar('SELECT public.is_admin()'), false);
      await denied(`UPDATE public.users SET role='admin' WHERE id='${ids.client}';`);
      await owner(); await db.exec(`DELETE FROM public.profiles WHERE id='${ids.artisan}';`);
      await role('authenticated', ids.artisan); await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','admin');`);
      assert.equal(await scalar(`SELECT role FROM public.profiles WHERE id='${ids.artisan}'`), 'artisan');
      await role('authenticated', ids.admin); assert.equal(await scalar('SELECT public.is_admin()'), true);
    });
    await isolated('A16 S0 ACLs, functions, triggers, constraints and other tables preserved', async () => {
      const current = await full();
      for (const key of ['function_inventory','all_function_definitions','triggers','constraints','schema_access','unprivileged_roles','browser_role_memberships']) assert.deepEqual(current[key], s0After[key], key);
      for (const key of ['table_inventory','table_effective','column_acl','policies']) {
        const outside = x => (x.table || x.name || x.tablename) !== 'service_requests';
        assert.deepEqual(current[key].filter(outside), s0After[key].filter(outside), key);
      }
      const removed = s0Before.table_effective.filter(x => ['anon','authenticated'].includes(x.role) && ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'].includes(x.privilege) && x.allowed);
      assert.equal(removed.length, 52);
      for (const x of removed) assert.equal(current.table_effective.find(y => y.table===x.table && y.role===x.role && y.privilege===x.privilege).allowed, false);
      for (const r of ['authenticated','service_role','postgres']) assert.deepEqual(current.table_effective.filter(x=>x.role===r),s0After.table_effective.filter(x=>x.role===r));
    });
    await isolated('A17 DDL changes no business rows; all scenario writes remain local', async () => {
      assert.deepEqual(await allData(), businessBefore);
    });
    await isolated('G03 reapply is blocked atomically', async () => {
      const post = await snapshot(); await denied(patch, 'P0001'); assert.deepEqual(await snapshot(), post);
    });
  } finally {
    await db.exec('ROLLBACK;'); // Local fixture cleanup only, never the rollback reference.
    await db.close();
  }
});
