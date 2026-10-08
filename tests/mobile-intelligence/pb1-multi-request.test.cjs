const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
test('PB1 canonical SQL: independent A/B, same trade C, abandon, retry, state isolation, owner and role',async()=>{
 const db=new PGlite(), uid=randomUUID(), other=randomUUID();
 try {
  await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY,role text); CREATE TABLE service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_profile_id uuid,service_category text,city text,description text,status text,idempotency_key text UNIQUE);`);
  await db.query('INSERT INTO users VALUES ($1,$3),($2,$3)',[uid,other,'client']);
  const migration=fs.readFileSync('supabase/migrations/20260928212721_control_os_b1_authorities.sql','utf8');
  const sql=migration.match(/CREATE FUNCTION public\.create_my_service_request_v1\([\s\S]*?END \$\$;/)[0];
  await db.exec(sql); await db.query("SELECT set_config('test.uid',$1,false)",[uid]);
  const create=async(service,description,key)=> (await db.query('SELECT * FROM create_my_service_request_v1($1,$2,$3,$4)',[service,'Fès',description,key])).rows[0];
  const ka=randomUUID(),kb=randomUUID(),kc=randomUUID();
  const a=await create('Plomberie','Fuite sous évier',ka),b=await create('Électricité','Prise en panne',kb);
  assert.notEqual(a.id,b.id); assert.equal((await create('Plomberie','Fuite sous évier',ka)).id,a.id);
  const c=await create('Plomberie','Fuite dans la douche',kc);assert.notEqual(c.id,a.id);
  const before=(await db.query('SELECT * FROM service_requests ORDER BY id')).rows;
  // Abandon has no database operation, and re-reading after session restoration cannot create anything.
  await db.query("SELECT set_config('test.uid',$1,false)",['']);await db.query("SELECT set_config('test.uid',$1,false)",[uid]);
  assert.deepEqual((await db.query('SELECT * FROM service_requests ORDER BY id')).rows,before);
  await db.query("UPDATE service_requests SET status='validated' WHERE id=$1",[a.id]);
  assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1',[b.id])).rows[0].status,'new');
  await assert.rejects(create('Plomberie','Autre description',ka),/IDEMPOTENCY_CONFLICT/);
  await db.query("SELECT set_config('test.uid',$1,false)",[other]);
  const d=await create('Plomberie','Fuite sous évier',ka);assert.notEqual(d.id,a.id);
  await db.query("UPDATE users SET role='artisan' WHERE id=$1",[other]);await assert.rejects(create('Électricité','Prise',randomUUID()),/FORBIDDEN/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM service_requests')).rows[0].n,4);
 } finally {await db.close();}
});
