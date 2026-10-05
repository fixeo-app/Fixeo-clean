const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261005085640_mobile_w5_artisan_authority_v2.sql','utf8');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',client='cccccccc-cccc-4ccc-8ccc-cccccccccccc',sid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
test('W5 real SQL policies: canonical role, active session, forged owners and foreign links remain separate',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA fixeo_private;
 CREATE TABLE local_actors(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE local_sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 CREATE VIEW auth.users AS SELECT * FROM local_actors;CREATE VIEW auth.sessions AS SELECT * FROM local_sessions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb$$;
 CREATE TABLE public.users(id uuid primary key,role text);CREATE TABLE public.artisans(id uuid,owner_user_id uuid,updated_at timestamptz);
 INSERT INTO local_actors(id) VALUES('${uid}'),('${client}');INSERT INTO local_sessions VALUES('${sid}','${uid}',null);
 INSERT INTO public.users VALUES('${uid}','artisan'),('${client}','client');
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 `);
 await db.exec(migration.split('-- W5_AUTHORITY_CORE_BEGIN')[1].split('-- W5_AUTHORITY_CORE_END')[0]);
 for(const table of ['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger']){
  await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY,owner_user_id uuid,note text);ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;CREATE POLICY owner ON public.${table} TO authenticated USING(owner_user_id=auth.uid()) WITH CHECK(owner_user_id=auth.uid());`);
  await db.exec(migration.match(new RegExp('CREATE POLICY w5_artisan_session ON public\\.'+table+' [^;]+;'))[0]);
  await db.exec(`INSERT INTO ${table} VALUES(gen_random_uuid(),'${other}','foreign-private');`);
 }
 const claims=async(user=uid,session=sid)=>db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);
 await claims();await db.exec('SET ROLE authenticated');
 assert.equal((await db.query('SELECT public.get_my_mobile_artisan_access_v1() result')).rows[0].result.user_id,uid);
 for(const table of ['artisan_business_clients','artisan_business_quotes','artisan_business_jobs','artisan_business_ledger']){
  assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);
  assert.equal((await db.query(`UPDATE ${table} SET note='attempt' WHERE owner_user_id='${other}' RETURNING id`)).rows.length,0);
  await assert.rejects(db.query(`INSERT INTO ${table} VALUES(gen_random_uuid(),'${other}','forged')`));
  const row=(await db.query(`INSERT INTO ${table} VALUES(gen_random_uuid(),'${uid}','mine') RETURNING id`)).rows[0];
  await assert.rejects(db.query(`UPDATE ${table} SET owner_user_id='${other}' WHERE id=$1`,[row.id]));
 }
 await db.exec('RESET ROLE');await db.exec(`UPDATE local_sessions SET user_id='${client}'`);await claims(client);await db.exec('SET ROLE authenticated');
 await assert.rejects(db.query('SELECT public.get_my_mobile_artisan_access_v1()'),/ARTISAN_REQUIRED/);
 await assert.rejects(db.query(`INSERT INTO artisan_business_clients VALUES(gen_random_uuid(),'${client}','client-forgery')`),/ARTISAN_REQUIRED/);
 await db.exec('RESET ROLE');await db.exec(`UPDATE local_sessions SET user_id='${uid}'`);await claims();await db.exec('DELETE FROM local_sessions');await db.exec('SET ROLE authenticated');
 await assert.rejects(db.query('SELECT public.get_my_mobile_artisan_access_v1()'),/SESSION_REVOKED/);
 await assert.rejects(db.query('SELECT * FROM artisan_business_clients'),/SESSION_REVOKED/);
 await db.exec('RESET ROLE');await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT public.get_my_mobile_artisan_access_v1()'));
 }finally{await db.close();}
});
test('W5 guards are added to canonical routines without rewriting their business decisions',()=>{
 assert.equal((migration.match(/PERFORM fixeo_private.w5_artisan_actor_v1\(\)/g)||[]).length,20);
 assert.match(migration,/W5_FUNCTION_DRIFT/);
 assert.match(migration,/FOR UPDATE/);
 assert.doesNotMatch(migration,/INSERT INTO auth\.(users|sessions)|UPDATE auth\./i);
});
