// Offline generator: reads the audited catalogue; never connects to a server.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../auth-security-p0/node_modules/@electric-sql/pglite');
const dir = path.join(__dirname, '../../docs/enterprise-os/security-s0');
const before = JSON.parse(fs.readFileSync(path.join(dir, 'contract-before.json'), 'utf8'));
const after = structuredClone(before);
const targets = [
  'dispatch_request_v1_backup_20260821(uuid)',
  'dispatch_notification_worker_peek_v1(text)',
  'auto_dispatch_service_request_v1()',
  'enqueue_dispatch_notification_from_mission_v1()',
  'trigger_dispatch_v2_on_service_request()'
];
const excess = new Set(['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']);
const browser = new Set(['anon', 'authenticated']);
const functionRevokes = targets.map(sig => `REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
const tableRevokes = [];
const rollback = [];
for (const f of after.function_inventory) {
  if (!targets.includes(f.signature)) continue;
  const removed = f.acl.filter(a => ['PUBLIC', ...browser].includes(a.grantee));
  f.acl = f.acl.filter(a => !['PUBLIC', ...browser].includes(a.grantee));
  for (const role of ['PUBLIC', ...browser]) f.execute[role] = false;
  for (const a of removed) rollback.push(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${a.grantee}${a.grantable ? ' WITH GRANT OPTION' : ''};`);
}
for (const t of after.table_inventory) {
  for (const role of browser) {
    const removed = t.acl.filter(a => a.grantee === role && excess.has(a.privilege));
    if (!removed.length) continue;
    if (removed.some(a => a.grantor !== 'postgres' || a.grantable)) throw Error('Unexpected grant provenance');
    const privileges = removed.map(a => a.privilege).sort().join(', ');
    tableRevokes.push(`REVOKE ${privileges} ON TABLE public.${t.name} FROM ${role};`);
    rollback.push(`GRANT ${privileges} ON TABLE public.${t.name} TO ${role};`);
  }
  t.acl = t.acl.filter(a => !(browser.has(a.grantee) && excess.has(a.privilege)));
}
let removed = 0;
for (const p of after.table_effective) {
  if (browser.has(p.role) && excess.has(p.privilege) && p.allowed) { p.allowed = false; removed++; }
}
if (removed !== 52 || targets.length !== 5) throw Error('Unexpected scope');
const select = fs.readFileSync(path.join(__dirname, 'catalogue-select.sql'), 'utf8').trim();
const write = (name, text, tests = false) => fs.writeFileSync(path.join(tests ? __dirname : dir, name), text);
const literal = x => "'" + x.replaceAll("'", "''") + "'";
async function main() {
  const db = new PGlite();
  const hashes = {};
  for (const [label, contract] of Object.entries({before, after})) {
    hashes[label] = (await db.query(`SELECT jsonb_object_agg(key, md5(value::text)) AS hashes FROM jsonb_each($1::jsonb)`, [JSON.stringify(contract)])).rows[0].hashes;
  }
  await db.close();
  const checkSelect = expected => `WITH captured AS (\n${select}\n), checks AS (\n SELECT e.key AS check_name, e.value AS expected_md5,\n md5(c.contract->>e.key) AS actual_md5,\n md5(c.contract->>e.key) = e.value AS pass\n FROM captured c CROSS JOIN jsonb_each_text(${literal(JSON.stringify(expected))}::jsonb) e\n)\nSELECT * FROM checks\nUNION ALL SELECT 'ALL_CHECKS', NULL, NULL, bool_and(pass) FROM checks\nORDER BY check_name`;
  const guard = (label, expected) => `DO $s0_${label}$\nDECLARE failed text;\nBEGIN\n SELECT string_agg(check_name, ', ' ORDER BY check_name) INTO failed FROM (\n${checkSelect(expected)}\n ) checks WHERE pass IS DISTINCT FROM true;\n IF failed IS NOT NULL THEN RAISE EXCEPTION 'S0 ${label} failed: %', failed USING ERRCODE='P0001'; END IF;\nEND $s0_${label}$;`;
  const preamble = '-- REVIEW ONLY — NOT APPLIED. Requires a new explicit Production authorization.\n-- Recheck GitHub main and Vercel Production = cb55e54cafb3792ed561b21b0da6bc104599d2e7.\n-- No business RPC execution, DML, RLS, function body, trigger or default-ACL changes.\n';
  const envelope = "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '30s';\nSET LOCAL search_path = public, pg_catalog;\n";
  write('contract-after-expected.json', JSON.stringify(after, null, 2) + '\n');
  write('contract-hashes.json', JSON.stringify(hashes, null, 2) + '\n');
  write('patch-proposed.sql', preamble + envelope + '\n' + guard('preflight', hashes.before) +
    '\n\n-- Five function ACLs; privileged callers and all definitions are retained.\n' + functionRevokes.join('\n') +
    '\n\n-- 52 table/role/privilege combinations. No CRUD or column grant is revoked.\n' + tableRevokes.join('\n') +
    '\n\n' + guard('postflight', hashes.after) + '\nCOMMIT;\n');
  for (const [label, expected] of [['preflight', hashes.before], ['postflight', hashes.after]]) {
    write(`${label}-readonly.sql`, '-- Catalogue only. Never invokes a business/dispatch function or reads business rows.\nBEGIN READ ONLY;\nSET LOCAL statement_timeout = \'30s\';\nSET LOCAL search_path = public, pg_catalog;\n' + checkSelect(expected) + ';\nROLLBACK;\n', true);
  }
  write('rollback-reference.sql', '-- BLOCKED REFERENCE ONLY. NOT AUTHORIZED. NO AUTOMATIC ROLLBACK.\n-- Restores the prior exposure: public worker contact data and browser-callable backup.\n-- Also restores excessive table privileges. Requires NEW explicit authorization.\n' + envelope +
    `DO $blocked$ BEGIN\n IF current_setting('fixeo.s0_rollback_authorized', true) IS DISTINCT FROM 'RESTORE_KNOWN_EXPOSURE' THEN\n  RAISE EXCEPTION 'BLOCKED: a new explicit authorization is required; this rollback reopens security exposures';\n END IF;\nEND $blocked$;\n` +
    guard('rollback_preflight', hashes.after) + '\n' + rollback.join('\n') + '\n' + guard('rollback_postflight', hashes.before) + '\nCOMMIT;\n');
  console.log(JSON.stringify({functions: targets.length, removedTablePrivileges: removed, tableRevokeStatements: tableRevokes.length, status:'OFFLINE_ARTIFACTS_GENERATED'}));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
