// PostgreSQL 17 in memory. No URL, credentials, network or Production client.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../../docs/enterprise-os/security-s0');
const evidence = JSON.parse(fs.readFileSync(path.join(dir, 'production-readonly.json'), 'utf8'));
const before = JSON.parse(fs.readFileSync(path.join(dir, 'contract-before.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(dir, 'contract-after-expected.json'), 'utf8'));
const quote = x => '"' + x.replaceAll('"', '""') + '"';
const literal = x => "'" + x.replaceAll("'", "''") + "'";
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = { client: uuid(1), artisan: uuid(2), admin: uuid(3), other: uuid(4), artisanRow: uuid(20), otherArtisan: uuid(21) };
function fixtureSQL() {
  const s = [
    'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;',
    'CREATE SCHEMA auth; CREATE SCHEMA fixeo_private;',
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
    'GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;',
    'GRANT USAGE ON SCHEMA fixeo_private TO authenticated, service_role;',
    // Only an ID stand-in for foreign keys. No Supabase/Auth account is created.
    'CREATE TABLE auth.users(id uuid PRIMARY KEY);',
    `CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`,
    `CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb $$;`,
    `CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;`,
    'CREATE SEQUENCE public.estimator_context_redemptions_id_seq;',
    // Required only to register the unrelated diagnostic function return type.
    // Diagnostic and priced-offer branches are NOT exercised by this ACL model.
    'CREATE TYPE fixeo_private.diagnostic_sessions_v1 AS (id uuid);',
    'SET LOCAL check_function_bodies = off;'
  ];
  for (const t of evidence.tables.tables) {
    const cols = evidence.tables.columns.filter(c => c.table === t.name).map(c => `${quote(c.name)} ${c.type}${c.default ? ' DEFAULT ' + c.default : ''}${c.not_null ? ' NOT NULL' : ''}`);
    s.push(`CREATE TABLE public.${quote(t.name)} (${cols.join(',')});`);
  }
  // Register exact Production definitions, with no replacement of dispatch logic.
  for (const f of evidence.functions.db_source_inventory) s.push(f.definition + ';');
  s.push('SET LOCAL check_function_bodies = on;');
  for (const fk of [false, true]) for (const c of evidence.tables.constraints.filter(c => (c.type === 'f') === fk)) {
    s.push(`ALTER TABLE public.${quote(c.table)} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`);
  }
  const constraintNames = new Set(evidence.tables.constraints.map(c => c.name));
  for (const ix of evidence.tables.indexes.filter(i => !constraintNames.has(i.indexname))) s.push(ix.indexdef + ';');
  for (const t of evidence.tables.tables) {
    if (t.rls) s.push(`ALTER TABLE public.${quote(t.name)} ENABLE ROW LEVEL SECURITY;`);
    if (t.force_rls) s.push(`ALTER TABLE public.${quote(t.name)} FORCE ROW LEVEL SECURITY;`);
    for (const a of t.acl_normalized) if (a.grantee !== 'postgres') s.push(`GRANT ${a.privilege} ON public.${quote(t.name)} TO ${a.grantee === 'PUBLIC' ? 'PUBLIC' : quote(a.grantee)}${a.grantable ? ' WITH GRANT OPTION' : ''};`);
  }
  const privileges = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', x: 'REFERENCES' };
  for (const c of evidence.tables.column_acl) for (const a of c.acl) {
    const [, role, flags] = a.match(/^([^=]+)=([^/]+)\/postgres$/) || [];
    if (!role || flags.includes('*')) throw Error('Unsupported column ACL');
    for (const flag of flags) s.push(`GRANT ${privileges[flag]} (${quote(c.column)}) ON public.${quote(c.table)} TO ${quote(role)};`);
  }
  for (const f of before.function_inventory) {
    s.push(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC, anon, authenticated, service_role;`);
    for (const a of f.acl) if (a.grantee !== 'postgres') s.push(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${a.grantee === 'PUBLIC' ? 'PUBLIC' : quote(a.grantee)}${a.grantable ? ' WITH GRANT OPTION' : ''};`);
  }
  for (const p of evidence.tables.policies) s.push(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r => r === 'public' ? 'PUBLIC' : quote(r)).join(',')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`);
  for (const t of evidence.tables.triggers) {
    s.push(t.definition + ';');
    if (t.enabled !== 'O') throw Error('Unexpected trigger status');
  }
  // Synthetic, in-memory identifiers, all enclosed in the caller's transaction.
  s.push(`INSERT INTO auth.users(id) VALUES ('${ids.client}'),('${ids.artisan}'),('${ids.admin}'),('${ids.other}');
    INSERT INTO public.users(id,role) VALUES ('${ids.client}','client'),('${ids.artisan}','artisan'),('${ids.admin}','admin'),('${ids.other}','artisan');
    INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users;
    INSERT INTO public.artisans(id,owner_user_id,full_name,phone,phone_public,city,service_category,claimed,claim_status,onboarding_completed)
    VALUES ('${ids.artisanRow}','${ids.artisan}','Synthetic A','+000000000001','','Casablanca','plomberie',true,'approved',true),
           ('${ids.otherArtisan}','${ids.other}','Synthetic B','+000000000002','','Casablanca','plomberie',true,'approved',true);`);
  return s.join('\n');
}
function transactionBody(file) {
  const sql = fs.readFileSync(file, 'utf8');
  if ((sql.match(/^BEGIN;$/gm) || []).length !== 1 || !/COMMIT;\s*$/.test(sql)) throw Error('Unexpected transaction envelope');
  // Statements are unchanged; the enclosing test uses BEGIN ... ROLLBACK.
  return sql.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '');
}
const catalogue = fs.readFileSync(path.join(__dirname, 'catalogue-select.sql'), 'utf8');
module.exports = { evidence, before, after, dir, quote, literal, uuid, ids, fixtureSQL, transactionBody, catalogue };
