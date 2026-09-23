// Real PostgreSQL RLS in memory. No Production connection, login or Auth account.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { PGlite } = createRequire(path.join(__dirname, '../auth-security-p0/package.json'))('@electric-sql/pglite');
const { evidence } = require('../../docs/auth/phase-2a-production-readonly.json');
const { uuid } = require('./fixture.cjs');
const quote = s => '"' + s.replaceAll('"', '""') + '"';
const tables = ['users', 'enterprise_members', 'enterprise_accounts'];

test('L00 Current Production SELECT policies and helpers in PostgreSQL 17, BEGIN/ROLLBACK', async t => {
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
      CREATE TABLE public.enterprise_members(enterprise_id uuid,user_id uuid,role text,status text,
        UNIQUE(enterprise_id,user_id));
    `);
    for (const helper of evidence.helpers.filter(h => h.name !== 'enforce_profile_canonical_role_p0')) {
      await db.exec(helper.definition);
    }
    for (const table of tables) {
      assert.ok(evidence.rls.find(r => r.table === table)?.rls);
      assert.ok(evidence.privileges.find(g => g.table === table && g.role === 'authenticated' && g.privilege === 'SELECT')?.allowed);
      await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.${quote(table)} TO authenticated;`);
    }
    for (const p of evidence.policies.filter(p => tables.includes(p.tablename) && ['SELECT', 'ALL'].includes(p.cmd))) {
      await db.exec(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive}
        FOR ${p.cmd} TO ${p.roles.map(quote).join(',')} USING (${p.qual})${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`);
    }
    await db.exec(`INSERT INTO public.users VALUES ('${uuid(1)}','client'),('${uuid(2)}','artisan'),('${uuid(3)}','admin');
      INSERT INTO public.enterprise_accounts VALUES ('${uuid(101)}','Active','active'),('${uuid(102)}','Suspended','suspended'),('${uuid(103)}','Closed','closed'),('${uuid(104)}','Other','active');
      INSERT INTO public.enterprise_members VALUES
        ('${uuid(101)}','${uuid(1)}','viewer','active'),
        ('${uuid(102)}','${uuid(1)}','owner','active'),
        ('${uuid(103)}','${uuid(1)}','admin','active'),
        ('${uuid(104)}','${uuid(1)}','reporter','invited'),
        ('${uuid(104)}','${uuid(2)}','operations_manager','active');`);

    await t.test('L01 Client reads canonical self, own memberships and member accounts', async () => {
      await asUser(uuid(1));
      assert.deepEqual(await rows('SELECT id,role FROM public.users'), [{ id: uuid(1), role: 'client' }]);
      const memberships = await rows("SELECT enterprise_id,user_id,role,status FROM public.enterprise_members WHERE user_id=$1 AND status='active' ORDER BY enterprise_id", [uuid(1)]);
      assert.equal(memberships.length, 3);
      const accounts = await rows('SELECT id,name,status FROM public.enterprise_accounts ORDER BY id');
      assert.deepEqual(accounts.map(a => a.status), ['active', 'suspended', 'closed']);
      assert.equal(accounts.filter(a => a.status === 'active').length, 1);
    });
    await t.test('L02 Artisan only sees its own active organization', async () => {
      await asUser(uuid(2));
      assert.deepEqual(await rows('SELECT id,role FROM public.users'), [{ id: uuid(2), role: 'artisan' }]);
      assert.deepEqual(await rows('SELECT id FROM public.enterprise_accounts'), [{ id: uuid(104) }]);
    });
    await t.test('L03 Canonical Admin has broad RLS, but resolver own-membership filter yields zero', async () => {
      await asUser(uuid(3));
      assert.equal((await rows('SELECT id FROM public.enterprise_accounts')).length, 4);
      assert.deepEqual(await rows("SELECT enterprise_id FROM public.enterprise_members WHERE user_id=$1 AND status='active'", [uuid(3)]), []);
    });
    await t.test('L04 All six Enterprise roles can read their organization without a global Admin role', async () => {
      for (const role of ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer']) {
        await db.exec('RESET ROLE; SAVEPOINT member_role_case;');
        await db.query('UPDATE public.enterprise_members SET role=$1 WHERE enterprise_id=$2 AND user_id=$3', [role, uuid(101), uuid(1)]);
        await asUser(uuid(1));
        assert.equal((await rows('SELECT id,name,status FROM public.enterprise_accounts WHERE id=$1', [uuid(101)])).length, 1);
        assert.equal((await rows('SELECT public.is_admin() AS admin'))[0].admin, false);
        await db.exec('RESET ROLE; ROLLBACK TO member_role_case; RELEASE member_role_case;');
      }
    });
    await db.exec('RESET ROLE; ROLLBACK;');
    assert.equal((await rows("SELECT to_regclass('public.enterprise_members') AS relation"))[0].relation, null);
  } finally {
    await db.close();
  }
});
