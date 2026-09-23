const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { fixtureSQL, sections, ids, uuid, literal, transactionBody } = require('./fixture.cjs');
const migration = join(__dirname, '../../supabase/migrations/20260923202411_auth_security_p0_canonical_role_authority.sql');
const adminPolicies = new Set(sections.profile_role_policy_dependencies.map(p => p.polname));
const changedPolicies = new Set([...adminPolicies, 'users_insert_own', 'profiles_insert_own']);

test('P0 PostgreSQL 17: every fixture and validation write is rolled back', async t => {
  const db = new PGlite(); // No connection string, filesystem directory, network or production client.
  const rows = async sql => (await db.query(sql)).rows;
  const scalar = async sql => Object.values((await rows(sql))[0])[0];
  const owner = () => db.exec("RESET ROLE; SELECT set_config('request.jwt.claims','{}',true);");
  const asUser = (id, metadata = {}) => db.exec(`RESET ROLE;
    SELECT set_config('request.jwt.claims',${literal(JSON.stringify({ sub: id, role: 'authenticated', user_metadata: metadata }))},true);
    SET LOCAL ROLE authenticated;`);
  const expectError = async (sql, code) => {
    await db.exec('SAVEPOINT expected_error;');
    try { await assert.rejects(db.exec(sql), e => e.code === code); }
    finally { await db.exec('ROLLBACK TO expected_error; RELEASE expected_error;'); }
  };
  const isolated = async (name, fn) => t.test(name, async () => {
    await db.exec('SAVEPOINT test_case;');
    try { await fn(); }
    finally { await db.exec('ROLLBACK TO test_case; RELEASE test_case;'); }
  });
  const policies = () => rows('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname');
  const acl = () => rows("SELECT relname,relacl::text FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname");
  const functions = () => rows("SELECT n.nspname,p.proname,md5(pg_get_functiondef(p.oid)) hash,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','fixeo_private') ORDER BY 1,2");
  const data = async () => {
    const result = {};
    for (const name of new Set(sections.test_table_columns.map(c => c.table_name))) {
      result[name] = await scalar(`SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM (SELECT to_jsonb(t) x FROM public."${name}" t) s`);
    }
    return result;
  };
  try {
    assert.match(await scalar('SHOW server_version'), /^17\./);
    await db.exec('BEGIN;');
    await db.exec(fixtureSQL());
    const before = { policies: await policies(), acl: await acl(), functions: await functions(), data: await data() };
    await db.exec(transactionBody(migration));
    const afterPolicies = await policies();

    await isolated('T01 Client cannot create an Admin profile; even arbitrary input is normalized', async () => {
      await db.exec(`DELETE FROM public.profiles WHERE id='${ids.client}';`);
      await asUser(ids.client);
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.client}','admin');`);
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'client');
      assert.equal(await scalar('SELECT public.is_admin()'), false);
      assert.equal(await scalar('SELECT count(*)::int FROM public.enterprise_leads'), 0);
    });
    await isolated('T02 Artisan without a profile cannot create an Admin profile', async () => {
      await asUser(ids.artisan);
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','admin');`);
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'artisan');
      assert.equal(await scalar('SELECT public.is_admin()'), false);
      assert.equal(await scalar('SELECT count(*)::int FROM public.estimator_context_redemptions'), 0);
    });
    await isolated('T03 Missing canonical identity cannot self-assign Admin or Artisan', async () => {
      await asUser(ids.missing);
      for (const role of ['admin','artisan']) {
        await expectError(`INSERT INTO public.users(id,role) VALUES ('${ids.missing}','${role}');`, '42501');
      }
      await expectError(`INSERT INTO public.profiles(id,role) VALUES ('${ids.missing}','client');`, '23514');
      await db.exec(`INSERT INTO public.users(id,role) VALUES ('${ids.missing}','client');`);
      assert.equal(await scalar('SELECT public.is_admin()'), false);
    });
    await isolated('T04 Canonical Admin retains existing grants and Admin RLS, even without a profile', async () => {
      await db.exec(`DELETE FROM public.profiles WHERE id='${ids.admin}';`);
      await asUser(ids.admin);
      assert.equal(await scalar('SELECT public.is_admin()'), true);
      for (const [table, count] of [['service_requests',2],['missions',2],['notifications',3],['enterprise_leads',1],['estimator_context_redemptions',1],['enterprise_request_context',1]]) {
        assert.equal(await scalar(`SELECT count(*)::int FROM public.${table}`), count, table);
      }
      for (const [table, assignment] of [['service_requests',"description='admin-test'"],['notifications',"title='admin-test'"],['enterprise_leads',"nom='admin-test'"]]) {
        assert.ok((await rows(`UPDATE public.${table} SET ${assignment} RETURNING id`)).length > 0, table);
      }
      // Production's authenticated role has SELECT-only on missions: do not invent new grants.
      await expectError("UPDATE public.missions SET status='completed'", '42501');
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.admin}','client');`);
      assert.equal(await scalar(`SELECT role FROM public.profiles WHERE id='${ids.admin}'`), 'admin');
    });
    await isolated('T05 Normal Client retains own identity, requests, missions and notifications', async () => {
      await asUser(ids.client);
      assert.equal(await scalar('SELECT count(*)::int FROM public.users'), 1);
      assert.equal(await scalar('SELECT count(*)::int FROM public.profiles'), 1);
      for (const table of ['service_requests','missions','notifications']) assert.equal(await scalar(`SELECT count(*)::int FROM public.${table}`), 1, table);
      assert.equal((await rows("UPDATE public.service_requests SET description='client-test' RETURNING id")).length, 1);
      assert.equal((await rows('UPDATE public.notifications SET read=true RETURNING id')).length, 1);
      assert.equal((await rows("UPDATE public.enterprise_leads SET nom='forbidden' RETURNING id")).length, 0);
    });
    await isolated('T06 Normal Artisan retains linked requests, own missions and onboarding RPC', async () => {
      await asUser(ids.artisan);
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','client');`);
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'artisan');
      for (const table of ['service_requests','missions','notifications']) assert.equal(await scalar(`SELECT count(*)::int FROM public.${table}`), 1, table);
      assert.equal((await rows("UPDATE public.service_requests SET description='artisan-test' RETURNING id")).length, 1);
      await asUser(ids.onboarding);
      const result = await scalar("SELECT public.register_new_artisan('Synthetic Artisan','plomberie','Casablanca','','local fixture')");
      assert.equal(result.ok, true);
      assert.equal(result.reason, 'registered');
      assert.equal(await scalar('SELECT role FROM public.users'), 'artisan');
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'artisan');
    });
    await isolated('T07 Enterprise membership Admin/Owner never becomes global Admin', async () => {
      for (const [id, enterprise, site] of [[ids.client,uuid(70),uuid(90)],[ids.artisan,uuid(71),uuid(91)]]) {
        await asUser(id);
        assert.equal(await scalar('SELECT public.is_admin()'), false);
        assert.equal(await scalar('SELECT fixeo_private._fixeo_is_admin()'), false);
        assert.equal(await scalar(`SELECT fixeo_private._fixeo_is_enterprise_manager('${enterprise}')`), true);
        assert.equal(await scalar(`SELECT fixeo_private._fixeo_can_access_enterprise_site('${enterprise}','${site}')`), true);
        assert.equal(await scalar('SELECT count(*)::int FROM public.enterprise_accounts'), 1);
        assert.equal(await scalar('SELECT count(*)::int FROM public.enterprise_leads'), 0);
      }
    });
    await isolated('T08 All six former profile-based Admin policies now use canonical is_admin()', async () => {
      assert.equal(adminPolicies.size, 6);
      for (const p of afterPolicies.filter(p => adminPolicies.has(p.policyname))) {
        assert.equal(p.qual, 'is_admin()');
        if (p.with_check) assert.equal(p.with_check, 'is_admin()');
      }
      assert.deepEqual(afterPolicies.filter(p => !changedPolicies.has(p.policyname)), before.policies.filter(p => !changedPolicies.has(p.policyname)));
      const deps = await rows(`SELECT DISTINCT p.polname FROM pg_depend d JOIN pg_policy p ON d.classid='pg_policy'::regclass AND d.objid=p.oid
        JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
        WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.profiles'::regclass AND a.attname='role'`);
      assert.deepEqual(deps, [{ polname: 'profiles_insert_own' }]);
    });
    await isolated('T09 User-editable metadata cannot authorize Admin', async () => {
      await asUser(ids.artisan, { role: 'admin', is_admin: true });
      await db.exec(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','admin');`);
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'artisan');
      assert.equal(await scalar('SELECT public.is_admin()'), false);
      assert.equal(await scalar('SELECT count(*)::int FROM public.enterprise_leads'), 0);
      await expectError(`UPDATE public.users SET role='admin' WHERE id='${ids.artisan}';`, '42501');
    });
    await isolated('T10 Non-Admin cannot change canonical role; ordinary self edits still work', async () => {
      for (const id of [ids.client,ids.artisan]) {
        await asUser(id);
        await expectError(`UPDATE public.users SET role='admin' WHERE id='${id}';`, '42501');
        assert.equal((await rows("UPDATE public.users SET full_name='Synthetic edit' RETURNING id")).length, 1);
        assert.equal(await scalar('SELECT public.is_admin()'), false);
      }
      await asUser(ids.client);
      await db.exec("UPDATE public.profiles SET role='admin';");
      assert.equal(await scalar('SELECT role FROM public.profiles'), 'client');
    });
    await isolated('ACL: exactly 16 excessive grants removed; CRUD and service_role unchanged', async () => {
      for (const g of sections.identity_effective_grants) {
        const excessive = ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'].includes(g.privilege) && g.role_name !== 'service_role';
        assert.equal(await scalar(`SELECT has_table_privilege('${g.role_name}','public.${g.table_name}','${g.privilege}')`), !excessive);
      }
      for (const role of ['anon','authenticated','service_role']) {
        assert.equal(await scalar(`SELECT has_function_privilege('${role}','fixeo_private.enforce_profile_canonical_role_p0()','EXECUTE')`), false);
      }
      assert.deepEqual((await acl()).filter(x => !['users','profiles'].includes(x.relname)), before.acl.filter(x => !['users','profiles'].includes(x.relname)));
    });
    await isolated('No migration data repair; existing functions and Enterprise memberships intact', async () => {
      assert.deepEqual(await data(), before.data);
      assert.deepEqual((await functions()).filter(x => x.proname !== 'enforce_profile_canonical_role_p0'), before.functions);
      assert.equal(await scalar(`SELECT count(*)::int FROM public.profiles WHERE id='${ids.artisan}'`), 0);
    });
    await isolated('RLS still rejects another user id and the private trigger grants no RPC', async () => {
      await asUser(ids.client);
      await expectError(`INSERT INTO public.profiles(id,role) VALUES ('${ids.artisan}','artisan');`, '42501');
      await expectError('SELECT fixeo_private.enforce_profile_canonical_role_p0()', '42501');
    });
    await isolated('Prepared read-only postapply queries execute and confirm six canonical policies', async () => {
      const sql = readFileSync(join(__dirname, 'postapply-readonly.sql'), 'utf8')
        .replace(/^BEGIN READ ONLY;$/m, '').replace(/^ROLLBACK;$/m, '');
      const result = await db.exec(sql);
      const canonical = result.flatMap(x => x.rows).filter(x => 'canonical_admin' in x);
      assert.equal(canonical.length, 6);
      assert.ok(canonical.every(x => x.canonical_admin));
      assert.equal(await scalar('SELECT count(*)::int FROM auth.users'), 0);
    });
    await isolated('Emergency rollback is guarded and restores reviewed policies/grants exactly', async () => {
      const rollback = transactionBody(join(__dirname, 'rollback-emergency.sql'));
      await expectError(rollback, 'P0001');
      await db.exec("SET LOCAL fixeo.p0.allow_insecure_rollback='I_ACCEPT_REOPENING_P0';");
      await db.exec(rollback);
      assert.deepEqual(await policies(), before.policies);
      assert.deepEqual(await acl(), before.acl);
      assert.deepEqual(await functions(), before.functions);
      assert.deepEqual(await data(), before.data);
      // A drift in a policy aborts the migration before changes.
      await db.exec('ALTER POLICY users_insert_own ON public.users WITH CHECK(false);');
      await expectError(transactionBody(migration), 'P0001');
    });
  } finally {
    await db.exec('ROLLBACK;');
    assert.equal(await scalar("SELECT to_regclass('public.users')"), null, 'all local fixtures removed');
    await db.close();
  }
});
