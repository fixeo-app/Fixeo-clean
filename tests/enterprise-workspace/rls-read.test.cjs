// Local PostgreSQL 17, exact read policies/helpers from the Phase 2B catalogue.
// No Production connection or account: all fixtures are rolled back before close.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { PGlite } = createRequire(path.join(__dirname, '../auth-security-p0/package.json'))('@electric-sql/pglite');
const { evidence } = require('../../docs/auth/phase-2b-production-readonly.json');
const { uuid } = require('../auth-resolver/fixture.cjs');
const quote = s => '"' + s.replaceAll('"', '""') + '"';
const tables = ['users', 'enterprise_accounts', 'enterprise_members', 'enterprise_sites', 'enterprise_member_sites'];
test('P00 Current Production Enterprise reads in isolated PostgreSQL transaction', async t => {
  const db = new PGlite();
  const rows = async (sql, args) => (await db.query(sql, args)).rows;
  const asUser = async id => {
    await db.exec('RESET ROLE;');
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: 'authenticated' })]);
    await db.exec('SET LOCAL ROLE authenticated;');
  };
  try {
    await db.exec(`BEGIN;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA fixeo_private;
      GRANT USAGE ON SCHEMA public,auth,fixeo_private TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      CREATE TABLE public.users(id uuid PRIMARY KEY,role text);
      CREATE TABLE public.enterprise_accounts(id uuid PRIMARY KEY,name text,status text);
      CREATE TABLE public.enterprise_members(id uuid PRIMARY KEY,enterprise_id uuid,user_id uuid,role text,status text);
      CREATE TABLE public.enterprise_sites(id uuid PRIMARY KEY,enterprise_id uuid,name text,status text);
      CREATE TABLE public.enterprise_member_sites(id uuid PRIMARY KEY,enterprise_id uuid,member_id uuid,site_id uuid);
    `);
    for (const name of ['is_admin', '_fixeo_is_admin', '_fixeo_is_enterprise_member', '_fixeo_is_enterprise_manager', '_fixeo_can_access_enterprise_site']) {
      const helper = evidence.helpers.find(h => h.name === name);
      assert.equal(helper.authenticated_execute, true);
      await db.exec(helper.definition);
    }
    for (const table of tables) {
      assert.ok(evidence.grants.find(g => g.table === table && g.role === 'authenticated' && g.privilege === 'SELECT')?.allowed);
      if (table !== 'users') assert.ok(evidence.tables.find(t => t.name === table)?.rls);
      await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.${quote(table)} TO authenticated;`);
    }
    for (const p of evidence.policies.filter(p => tables.includes(p.tablename) && ['SELECT', 'ALL'].includes(p.cmd))) {
      await db.exec(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive}
        FOR ${p.cmd} TO ${p.roles.map(quote).join(',')} USING (${p.qual})${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`);
    }
    await db.exec(`INSERT INTO public.users VALUES ('${uuid(1)}','client'),('${uuid(2)}','artisan'),('${uuid(3)}','admin');
      INSERT INTO public.enterprise_accounts VALUES ('${uuid(101)}','A','active'),('${uuid(102)}','B','active'),('${uuid(103)}','Closed','closed');
      INSERT INTO public.enterprise_members VALUES
        ('${uuid(201)}','${uuid(101)}','${uuid(1)}','site_manager','active'),
        ('${uuid(202)}','${uuid(102)}','${uuid(2)}','owner','active'),
        ('${uuid(203)}','${uuid(103)}','${uuid(1)}','viewer','active');
      INSERT INTO public.enterprise_sites VALUES
        ('${uuid(301)}','${uuid(101)}','Assigned','active'),
        ('${uuid(302)}','${uuid(101)}','Unassigned','active'),
        ('${uuid(303)}','${uuid(102)}','Other tenant','active');
      INSERT INTO public.enterprise_member_sites VALUES ('${uuid(401)}','${uuid(101)}','${uuid(201)}','${uuid(301)}');`);
    await t.test('P01 Own canonical role/member/account SELECT works; other tenant hidden', async () => {
      await asUser(uuid(1));
      assert.deepEqual(await rows('SELECT id,role FROM public.users'), [{ id: uuid(1), role: 'client' }]);
      assert.deepEqual((await rows('SELECT id FROM public.enterprise_accounts ORDER BY id')).map(r => r.id), [uuid(101), uuid(103)]);
      assert.deepEqual(await rows('SELECT id FROM public.enterprise_accounts WHERE id=$1', [uuid(102)]), []);
      assert.equal((await rows("SELECT id FROM public.enterprise_members WHERE user_id=auth.uid() AND status='active'")).length, 2);
    });
    await t.test('P02 All six active Enterprise roles read account; no new grants required', async () => {
      for (const role of ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer']) {
        await db.exec('RESET ROLE; SAVEPOINT role_case;');
        await db.query('UPDATE public.enterprise_members SET role=$1 WHERE id=$2', [role, uuid(201)]);
        await asUser(uuid(1));
        assert.equal((await rows('SELECT id FROM public.enterprise_accounts WHERE id=$1', [uuid(101)])).length, 1);
        assert.equal((await rows('SELECT public.is_admin() AS admin'))[0].admin, false);
        await db.exec('RESET ROLE; ROLLBACK TO role_case; RELEASE role_case;');
      }
    });
    await t.test('P03 Admin broad SQL policy is not own Enterprise membership', async () => {
      await asUser(uuid(3));
      assert.equal((await rows('SELECT id FROM public.enterprise_accounts')).length, 3);
      assert.deepEqual(await rows("SELECT id FROM public.enterprise_members WHERE user_id=auth.uid() AND status='active'"), []);
    });
    await t.test('P04 site_manager only reads assigned site; cross-tenant helper false', async () => {
      await asUser(uuid(1));
      assert.deepEqual(await rows('SELECT id FROM public.enterprise_sites'), [{ id: uuid(301) }]);
      assert.deepEqual(await rows('SELECT site_id FROM public.enterprise_member_sites'), [{ site_id: uuid(301) }]);
      assert.equal((await rows('SELECT fixeo_private._fixeo_can_access_enterprise_site($1,$2) AS allowed', [uuid(101), uuid(303)]))[0].allowed, false);
    });
    await t.test('P05 Closed account remains readable under current RLS; resolver must reject it', async () => {
      await asUser(uuid(1));
      assert.deepEqual(await rows('SELECT status FROM public.enterprise_accounts WHERE id=$1', [uuid(103)]), [{ status: 'closed' }]);
    });
    await db.exec('RESET ROLE; ROLLBACK;');
    assert.equal((await rows("SELECT to_regclass('public.enterprise_members') AS relation"))[0].relation, null);
  } finally { await db.close(); }
});
