const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/20261005085640_mobile_w5_artisan_authority_v2.sql', 'utf8');
const baseline = require('./fixtures/w5-v2-baseline.json');
const core = migration.split('-- W5_AUTHORITY_CORE_BEGIN')[1].split('-- W5_AUTHORITY_CORE_END')[0];
const wrapper = migration.split('-- W5_ACTIVITY_WRAPPER_BEGIN')[1].split('-- W5_ACTIVITY_WRAPPER_END')[0];
const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const client = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const aid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const foreignAid = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

test('W5 V2 isolated wrapper: no data effects on definition, direct legacy denied, valid Artisan only, historical body preserved', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA fixeo_private;
      CREATE TABLE local_actors(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
      CREATE TABLE local_sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      CREATE VIEW auth.users AS SELECT * FROM local_actors; CREATE VIEW auth.sessions AS SELECT * FROM local_sessions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
      CREATE TABLE public.users(id uuid primary key,role text,city text);
      CREATE TABLE public.profiles(id uuid primary key,city text);
      CREATE TABLE public.artisans(id uuid primary key,owner_user_id uuid,updated_at timestamptz,service_category text,category text,services jsonb,city text,work_zone text);
      CREATE TABLE public.artisan_service_categories(artisan_id uuid,service_category text);
      CREATE TABLE public.artisan_service_cities(artisan_id uuid,city text);
      INSERT INTO local_actors(id) VALUES('${uid}'),('${client}');
      INSERT INTO local_sessions VALUES('${sid}','${uid}',null);
      INSERT INTO public.users(id,role,city) VALUES('${uid}','artisan','Rabat'),('${client}','client','Rabat');
      INSERT INTO public.profiles VALUES('${uid}','Rabat');
      INSERT INTO public.artisans(id,owner_user_id,city) VALUES('${aid}','${uid}','Rabat'),('${foreignAid}','${other}','Fès');
      INSERT INTO public.artisan_service_categories VALUES('${aid}','Plomberie'),('${foreignAid}','Serrurerie');
      INSERT INTO public.artisan_service_cities VALUES('${aid}','Rabat'),('${foreignAid}','Fès');
      GRANT USAGE ON SCHEMA public,auth,fixeo_private TO authenticated,anon,service_role;`);
    await db.exec(fs.readFileSync('tests/mobile-artisan/fixtures/legacy-activity.sql', 'utf8'));
    await db.exec(`REVOKE ALL ON FUNCTION public.update_my_artisan_activity_v1(text[],text[]) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.update_my_artisan_activity_v1(text[],text[]) TO authenticated,service_role;`);
    const rows = async () => {
      const result = {};
      for (const name of ['local_actors','local_sessions','users','profiles','artisans','artisan_service_categories','artisan_service_cities'])
        result[name] = (await db.query(`SELECT to_jsonb(t) row FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows;
      return result;
    };
    const original = (await db.query("SELECT pg_get_functiondef('public.update_my_artisan_activity_v1(text[],text[])'::regprocedure) body")).rows[0].body;
    const before = await rows();
    // Components run solely in ephemeral PGlite; no complete migration is applied.
    await db.exec(core); await db.exec(wrapper);
    assert.deepEqual(await rows(), before);
    assert.equal((await db.query("SELECT pg_get_functiondef('public.update_my_artisan_activity_v1(text[],text[])'::regprocedure) body")).rows[0].body, original);
    assert.equal((await db.query("SELECT has_function_privilege('service_role','public.update_my_artisan_activity_v1(text[],text[])','EXECUTE') allowed")).rows[0].allowed, true);
    const claims = async (user=uid,session=sid) => db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);
    await claims(); await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query("SELECT public.update_my_artisan_activity_v1(ARRAY['Électricité'],ARRAY['Casablanca'])"), /permission denied/);
    assert.equal((await db.query("SELECT public.w5_update_my_artisan_activity_v1(ARRAY['Électricité'],ARRAY['Casablanca']) result")).rows[0].result.ok, true);
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT city FROM artisan_service_cities WHERE artisan_id=$1',[foreignAid])).rows,[{city:'Fès'}]);
    assert.deepEqual((await db.query('SELECT city FROM artisan_service_cities WHERE artisan_id=$1',[aid])).rows,[{city:'Casablanca'}]);
    await db.exec(`UPDATE local_sessions SET user_id='${client}' WHERE id='${sid}'`);
    await claims(client); await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query("SELECT public.w5_update_my_artisan_activity_v1(ARRAY['Plomberie'],ARRAY['Rabat'])"), /ARTISAN_REQUIRED/);
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE local_sessions SET user_id='${uid}',not_after=now()-interval '1 second' WHERE id='${sid}'`);
    await claims(); await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query("SELECT public.w5_update_my_artisan_activity_v1(ARRAY['Plomberie'],ARRAY['Rabat'])"), /SESSION_REVOKED/);
    await db.exec('RESET ROLE'); await db.exec(`DELETE FROM local_sessions WHERE id='${sid}'`); await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query("SELECT public.w5_update_my_artisan_activity_v1(ARRAY['Plomberie'],ARRAY['Rabat'])"), /SESSION_REVOKED/);
    await assert.rejects(db.query("SELECT public.update_my_artisan_activity_v1(ARRAY['Plomberie'],ARRAY['Rabat'])"), /permission denied/);
    await db.exec('RESET ROLE'); await claims(null); await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT public.get_my_mobile_artisan_access_v1()'), /AUTH_REQUIRED/);
    await db.exec('RESET ROLE'); await db.exec('SET ROLE anon');
    await assert.rejects(db.query("SELECT public.w5_update_my_artisan_activity_v1(ARRAY['Plomberie'],ARRAY['Rabat'])"), /permission denied/);
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT city FROM artisan_service_cities WHERE artisan_id=$1',[aid])).rows,[{city:'Casablanca'}]);
  } finally { await db.close(); }
});

test('W5 V2 exact literal gate, 19 guarded definitions, preserved business bodies and Mobile wrapper call', () => {
  for (const keyword of ['DROP','DELETE','TRUNCATE']) assert.doesNotMatch(migration,new RegExp('\\b'+keyword+'\\b','i'));
  const updates=migration.match(/^\s*UPDATE\s+(?:public|fixeo_private)\.[^;]+;/gim)||[];
  assert.equal(updates.length,17);
  for (const statement of updates) assert.match(statement,/\bWHERE\b/i);
  assert.equal((migration.match(/CREATE POLICY /g)||[]).length,7);
  assert.doesNotMatch(migration,/CREATE(?: OR REPLACE)? FUNCTION public\.update_my_artisan_activity_v1\(/);
  let replaced=0;
  for (const original of baseline) {
    if (original.name==='update_my_artisan_activity_v1') continue;
    const expression=new RegExp('CREATE OR REPLACE FUNCTION public\\.'+original.name+'\\([^\\n]*\\)[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$');
    const actual=migration.match(expression)?.[0].replace(/\r\n/g,'\n');
    const guard=['get_my_mission_timeline_v1','get_my_mobile_mission_change_v1'].includes(original.name)
      ? "IF EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='artisan') THEN PERFORM fixeo_private.w5_artisan_actor_v1(); END IF;"
      : 'PERFORM fixeo_private.w5_artisan_actor_v1();';
    const expected=original.definition.replace(/\r\n/g,'\n').trimEnd().replace(/\bBEGIN\b/i,'BEGIN\n  '+guard);
    assert.equal(actual,expected,original.name); replaced++;
  }
  assert.equal(replaced,19);
  const topLevel=migration.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g,"'body'").replace(/--[^\n]*/g,'');
  assert.doesNotMatch(topLevel,/(?:^|;)\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CALL|SELECT)\b/i);
  const mobile=fs.readFileSync('mobile/lib/artisanOS.ts','utf8');
  assert.match(mobile,/"w5_update_my_artisan_activity_v1"/);
  assert.doesNotMatch(mobile,/"update_my_artisan_activity_v1"/);
});

test('W5 V2 rollback file restores exactly the 19 baseline definitions and the original activity permission', () => {
  const rollback=fs.readFileSync('mobile/docs/w5/ROLLBACK_V2.sql','utf8');
  for (const original of baseline) {
    if (original.name==='update_my_artisan_activity_v1') continue;
    const expression=new RegExp('CREATE OR REPLACE FUNCTION public\\.'+original.name+'\\([^\\n]*\\)[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$');
    assert.equal(rollback.match(expression)?.[0].replace(/\r\n/g,'\n'),original.definition.replace(/\r\n/g,'\n').trimEnd(),original.name);
  }
  assert.doesNotMatch(rollback,/CREATE(?: OR REPLACE)? FUNCTION public\.update_my_artisan_activity_v1\(/);
  assert.match(rollback,/GRANT EXECUTE ON FUNCTION public\.update_my_artisan_activity_v1\(text\[\],text\[\]\) TO authenticated;/);
  assert.equal((rollback.match(/^DROP POLICY /gm)||[]).length,7);
  assert.equal((rollback.match(/^DROP FUNCTION /gm)||[]).length,4);
  assert.doesNotMatch(rollback,/DROP (TABLE|SCHEMA)|CASCADE|\bTRUNCATE\b/i);
});
