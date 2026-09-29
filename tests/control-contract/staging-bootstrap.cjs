'use strict';
// Emits application schema only for an EMPTY approved staging. Never replaces
// Supabase Auth/Storage, their roles/functions, or any Production row.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [ref, structurePath, inventoryPath, outputPath] = process.argv.slice(2);
if (ref !== 'kqyhusnbybsukbcaoqtu' || !structurePath || !inventoryPath || !outputPath) {
  throw new Error('APPROVED_EMPTY_STAGING_REQUIRED');
}
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name + '.json'), 'utf8'));
const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
if (inventory.auth_users || inventory.storage_objects || inventory.cron || inventory.vault_secret_count) {
  throw new Error('STAGING_ISOLATION_REQUIRED');
}
const q = s => '"' + s.replaceAll('"', '""') + '"';
const lit = s => "'" + s.replaceAll("'", "''") + "'";
const ident = (s, n) => q(s) + '.' + q(n);
const cat = read('catalog');
const sql = ['BEGIN; SET LOCAL lock_timeout = \'5s\'; SET LOCAL statement_timeout = \'120s\'; SET LOCAL search_path = public, extensions; SET LOCAL check_function_bodies = off;'];
sql.push(`DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'EMPTY_STAGING_REQUIRED'; END IF;`);
for (const t of inventory.tables) sql.push(`IF EXISTS(SELECT 1 FROM ${ident(t.schema, t.name)}) THEN RAISE EXCEPTION 'EMPTY_APPLICATION_SCHEMA_REQUIRED'; END IF;`);
sql.push('END $empty$;');
for (const c of cat.columns) if (c.default?.includes('nextval')) {
  const m = c.default.match(/nextval\('([^']+)'/);
  if (m) sql.push('CREATE SEQUENCE IF NOT EXISTS ' + m[1] + ';');
}
let newTables = 0, newColumns = 0, newFunctions = 0, changedFunctions = 0, changedConstraints = 0;
for (const t of cat.table_acl.filter(t => cat.columns.some(c => c.schema === t.schema && c.table === t.table))) {
  const cols = cat.columns.filter(c => c.schema === t.schema && c.table === t.table);
  const definition = c => q(c.name) + ' ' + c.type + (c.default ? ' DEFAULT ' + c.default : '') + (c.not_null ? ' NOT NULL' : '');
  if (!inventory.tables.some(a => a.schema === t.schema && a.name === t.table)) {
    sql.push(`CREATE TABLE ${ident(t.schema, t.table)} (${cols.map(definition).join(',')});`); newTables++;
  } else for (const c of cols) {
    const old = structure.columns.find(a => a.schema === c.schema && a.table === c.table && a.name === c.name);
    if (!old) { sql.push(`ALTER TABLE ${ident(c.schema, c.table)} ADD COLUMN ${definition(c)};`); newColumns++; }
    else if (['type', 'default', 'not_null'].some(k => c[k] !== old[k])) throw new Error('INCOMPATIBLE_COLUMN:' + c.table + '.' + c.name);
  }
}
for (const f of read('db-definitions')) {
  const old = inventory.functions.find(a => a.schema === f.schema && a.proname === f.proname && a.args === f.args);
  if (!old || old.hash !== crypto.createHash('md5').update(f.definition).digest('hex')) {
    sql.push(f.definition + ';'); old ? changedFunctions++ : newFunctions++;
  }
}
for (const fk of [false, true]) for (const c of read('db-constraints').filter(c => (c.contype === 'f') === fk)) {
  const old = structure.constraints.find(a => a.schema === c.schema && a.table_name === c.table_name && a.conname === c.conname);
  if (old && old.definition === c.definition) continue;
  if (old) {
    if (!['c', 'f'].includes(c.contype)) throw new Error('INCOMPATIBLE_KEY:' + c.conname);
    sql.push(`ALTER TABLE ${ident(c.schema,c.table_name)} DROP CONSTRAINT ${q(c.conname)};`); changedConstraints++;
  }
  sql.push(`ALTER TABLE ${ident(c.schema,c.table_name)} ADD CONSTRAINT ${q(c.conname)} ${c.definition};`);
}
for (const i of read('db-indexes')) sql.push(i.indexdef.replace(/^(CREATE (?:UNIQUE )?INDEX) /, '$1 IF NOT EXISTS ') + ';');
for (const v of read('db-views')) sql.push(`CREATE OR REPLACE VIEW ${ident(v.schema,v.name)}${v.reloptions?.length ? ' WITH ('+v.reloptions.join(',')+')' : ''} AS ${v.definition};`);
const flags = {r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',X:'EXECUTE'};
function grant(object, acl) {
  for (const a of (acl || '').replace(/^\{|\}$/g,'').split(',')) {
    const m = a.match(/^([^=]*)=([^/]+)\//); if (!m || m[1] === 'postgres') continue;
    for (const c of m[2].replaceAll('*','')) if (flags[c]) sql.push(`GRANT ${flags[c]} ON ${object} TO ${m[1] ? q(m[1]) : 'PUBLIC'};`);
  }
}
for (const t of cat.table_acl) {
  if (t.rls) sql.push(`ALTER TABLE ${ident(t.schema,t.table)} ENABLE ROW LEVEL SECURITY;`);
  sql.push(`REVOKE ALL ON TABLE ${ident(t.schema,t.table)} FROM PUBLIC, anon, authenticated, service_role;`);
  grant('TABLE ' + ident(t.schema,t.table), t.acl);
}
for (const c of read('db-privileges')) sql.push(`GRANT ${c.privilege_type} (${q(c.column_name)}) ON ${ident(c.table_schema,c.table_name)} TO ${q(c.grantee)};`);
for (const f of read('db-functions')) {
  if (f.proacl === null) continue; // existing canonical implicit ACL, validated by preflight
  const sig = ident(f.schema,f.proname) + '(' + f.args + ')';
  sql.push('REVOKE ALL ON FUNCTION ' + sig + ' FROM PUBLIC, anon, authenticated, service_role;');
  grant('FUNCTION ' + sig, f.proacl);
}
for (const p of structure.policies) sql.push(`DROP POLICY ${q(p.policyname)} ON ${ident(p.schemaname,p.tablename)};`);
for (const p of cat.policies) sql.push(`CREATE POLICY ${q(p.policyname)} ON ${ident(p.schemaname,p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r=>r==='public'?'PUBLIC':q(r)).join(',')}${p.qual ? ' USING ('+p.qual+')' : ''}${p.with_check ? ' WITH CHECK ('+p.with_check+')' : ''};`);
for (const t of read('db-triggers')) {
  // CREATE OR REPLACE TRIGGER preserves the platform-managed auth triggers.
  sql.push(t.definition.replace(/^CREATE TRIGGER /,'CREATE OR REPLACE TRIGGER ') + ';');
}
sql.push("NOTIFY pgrst, 'reload schema'; COMMIT;");
fs.writeFileSync(outputPath, sql.join('\n') + '\n');
console.log(JSON.stringify({project_ref:ref,newTables,newColumns,newFunctions,changedFunctions,changedConstraints,bytes:fs.statSync(outputPath).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex')}));
