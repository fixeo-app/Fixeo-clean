// In-memory PostgreSQL model only. No URL, credentials, Auth accounts or real data.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const evidence = JSON.parse(readFileSync(join(__dirname, 'production-preflight.json'), 'utf8'));
const sections = Object.fromEntries(evidence.sections.map(x => [x.section, x.evidence]));
const quote = x => '"' + x.replaceAll('"', '""') + '"';
const literal = x => "'" + x.replaceAll("'", "''") + "'";
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = { client: uuid(1), artisan: uuid(2), admin: uuid(3), other: uuid(4), missing: uuid(5), onboarding: uuid(6) };

function fixtureSQL() {
  const sql = [
    'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;',
    'CREATE SCHEMA auth; CREATE SCHEMA fixeo_private;',
    'CREATE TABLE auth.users(id uuid PRIMARY KEY);', // Empty catalog stand-in: no Auth account is created.
    'GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;',
    'GRANT USAGE ON SCHEMA fixeo_private TO authenticated, service_role;',
    `CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`,
    `CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb $$;`,
    `CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;`
  ];
  const tables = new Map();
  for (const c of sections.test_table_columns) {
    if (!tables.has(c.table_name)) tables.set(c.table_name, []);
    tables.get(c.table_name).push(quote(c.column_name) + ' ' + c.sql_type);
  }
  for (const [name, columns] of tables) {
    sql.push(`CREATE TABLE public.${quote(name)} (${columns.join(',')});`);
    sql.push(`ALTER TABLE public.${quote(name)} ENABLE ROW LEVEL SECURITY;`);
  }
  // Identity column defaults/nullability and role checks are copied from Production.
  // Auth FKs and unrelated business constraints/triggers are outside this RLS model.
  for (const c of sections.identity_columns) {
    if (c.column_default) sql.push(`ALTER TABLE public.${quote(c.table_name)} ALTER COLUMN ${quote(c.column_name)} SET DEFAULT ${c.column_default};`);
    if (c.is_nullable === 'NO') sql.push(`ALTER TABLE public.${quote(c.table_name)} ALTER COLUMN ${quote(c.column_name)} SET NOT NULL;`);
  }
  for (const c of sections.identity_constraints.filter(c => !c.definition.startsWith('FOREIGN KEY'))) {
    sql.push(`ALTER TABLE public.${quote(c.table_name)} ADD CONSTRAINT ${quote(c.conname)} ${c.definition};`);
  }
  sql.push('ALTER TABLE public.artisans ALTER COLUMN id SET DEFAULT gen_random_uuid();');
  for (const f of sections.authority_functions.filter(f => f.proname !== 'approve_artisan_claim')) sql.push(f.definition + ';');
  for (const f of sections.enterprise_helper_definitions) sql.push(f.definition + ';');
  for (const p of sections.all_policies.filter(p => p.schemaname === 'public' && tables.has(p.tablename))) {
    sql.push(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd}
      TO ${p.roles.map(quote).join(',')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`);
  }
  for (const g of sections.test_table_grants.filter(g => g.privileges?.length)) {
    sql.push(`GRANT ${g.privileges.join(',')} ON public.${quote(g.table_name)} TO ${quote(g.role_name)};`);
  }
  for (const t of sections.identity_triggers.filter(t => t.table_name !== 'auth.users')) sql.push(t.definition + ';');
  sql.push(`INSERT INTO public.users(id,role) VALUES
    ('${ids.client}','client'),('${ids.artisan}','artisan'),('${ids.admin}','admin'),
    ('${ids.other}','client'),('${ids.onboarding}','artisan');
    INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users WHERE id <> '${ids.artisan}';
    INSERT INTO public.artisans(id,owner_user_id,phone_public,claimed) VALUES ('${uuid(20)}','${ids.artisan}',NULL,true);
    INSERT INTO public.service_requests(id,client_profile_id,status) VALUES
      ('${uuid(30)}','${ids.client}','assigned'),('${uuid(31)}','${ids.other}','assigned');
    INSERT INTO public.missions(id,request_id,client_profile_id,artisan_profile_id,status) VALUES
      ('${uuid(40)}','${uuid(30)}','${ids.client}','${uuid(20)}','pending'),
      ('${uuid(41)}','${uuid(31)}','${ids.other}',NULL,'pending');
    INSERT INTO public.notifications(id,recipient_user_id,title) VALUES
      ('${uuid(50)}','${ids.client}','client'),('${uuid(51)}','${ids.artisan}','artisan'),('${uuid(52)}','${ids.other}','other');
    INSERT INTO public.enterprise_leads(id,nom) VALUES ('${uuid(60)}','synthetic');
    INSERT INTO public.estimator_context_redemptions(id) VALUES (1);
    INSERT INTO public.enterprise_accounts(id) VALUES ('${uuid(70)}'),('${uuid(71)}');
    INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES
      ('${uuid(80)}','${uuid(70)}','${ids.client}','admin','active'),
      ('${uuid(81)}','${uuid(71)}','${ids.artisan}','owner','active');
    INSERT INTO public.enterprise_sites(id,enterprise_id) VALUES
      ('${uuid(90)}','${uuid(70)}'),('${uuid(91)}','${uuid(71)}');
    INSERT INTO public.enterprise_request_context(id,enterprise_id,site_id,service_request_id) VALUES
      ('${uuid(100)}','${uuid(70)}','${uuid(90)}','${uuid(30)}');`);
  return sql.join('\n');
}

function transactionBody(file) {
  const text = readFileSync(file, 'utf8');
  if ((text.match(/^BEGIN;$/gm) || []).length !== 1 || !/COMMIT;\s*$/.test(text)) throw new Error('Unexpected transaction envelope');
  // The exact candidate statements run inside the test's BEGIN ... ROLLBACK.
  return text.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '');
}

module.exports = { fixtureSQL, sections, ids, uuid, literal, transactionBody };
