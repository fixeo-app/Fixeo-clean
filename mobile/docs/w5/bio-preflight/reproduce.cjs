// Isolated PostgreSQL reproduction of the live timestamp trigger.
// No HTTP, staging credentials, or production connection is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PGlite } = require(path.resolve('tests/mobile-intelligence/node_modules/@electric-sql/pglite'));
const folder = __dirname;
const sql = fs.readFileSync(path.join(folder, '20261005104459_mobile_w5_artisan_bio.sql'), 'utf8');
const live = require('./staging-readonly.json');
const trigger = live.triggers.find(x => x.tgname === 'artisans_updated_at');
const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const aid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA fixeo_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT '${uid}'::uuid$$;
      CREATE FUNCTION fixeo_private.w5_artisan_actor_v1() RETURNS uuid LANGUAGE sql AS $$SELECT auth.uid()$$;
      CREATE TABLE public.artisans(id uuid PRIMARY KEY,owner_user_id uuid,description text,updated_at timestamptz,name text,city text,verified boolean);
      INSERT INTO public.artisans VALUES('${aid}','${uid}','Bio initiale','2026-10-01T00:00:00Z','Fixture locale','Rabat',false);
    `);
    await db.exec(trigger.function_definition);
    await db.exec(trigger.definition);
    const row = async () => (await db.query('SELECT to_jsonb(a) AS value FROM public.artisans a')).rows[0].value;
    const beforeApply = await row();
    await db.exec(sql);
    const afterApply = await row();
    assert.deepEqual(afterApply, beforeApply);
    const rpc = (await db.query("SELECT public.w5_update_my_artisan_bio_v1('Bio modifiée') AS result")).rows[0].result;
    assert.equal(rpc.ok, true);
    const afterRpc = await row();
    const changed = Object.keys(beforeApply).filter(k => beforeApply[k] !== afterRpc[k]);
    assert.deepEqual(changed.sort(), ['description', 'updated_at']);
    const proof = {
      verdict: 'BLOCKED_UPDATED_AT_TRIGGER_CONFLICT',
      environment: 'isolated PGlite; actual live trigger definition; actor guard stubbed only for this local side-effect reproduction',
      migration: '20261005104459_mobile_w5_artisan_bio.sql',
      sha256: crypto.createHash('sha256').update(sql).digest('hex'),
      literal: Object.fromEntries(['DROP','DELETE','TRUNCATE'].map(k => [k,(sql.match(new RegExp('\\b'+k+'\\b','gi')) || []).length])),
      data_changes_at_definition: 0,
      rpc_changed_columns: changed,
      strict_description_only_requirement_met: false,
      trigger_modified_or_disabled: false,
      before: beforeApply,
      after: afterRpc,
      staging_application_performed: false,
    };
    fs.writeFileSync(path.join(folder, 'reproduction.json'), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify(proof, null, 2));
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
