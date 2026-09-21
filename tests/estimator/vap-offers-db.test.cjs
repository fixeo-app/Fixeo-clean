const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {commissionMinor}=require('../../data/pricing/engine/vap-bp33-v1');
const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20260921005143_vap_bp33_offers_foundation.sql'),'utf8');

test('VAP storage: migration, arithmetic, privileges, immutability and legacy isolation',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
   CREATE TABLE missions(id int PRIMARY KEY, agreed_price numeric, commission_amount numeric);
   INSERT INTO missions VALUES(1,300,45);`);
  await db.exec('BEGIN;'+migration+'COMMIT;');
  const values=[1,39999,40000,40004,199999,200000,200005,499999,500000,500008,999999,1000000,1000010,2099999,2100000,2100001,50000000];
  for(let v=1;v<3000000;v+=7919) values.push(v);
  const rows=await db.query('SELECT v,public.fixeo_vap_commission_minor_v1(v) AS c FROM unnest($1::bigint[]) v',[values]);
  for(const row of rows.rows) assert.equal(Number(row.c),commissionMinor(Number(row.v)));
  for(const v of [null,0,-1,50000001]) await assert.rejects(db.query('SELECT public.fixeo_vap_commission_minor_v1($1)',[v]));
  const insert=`INSERT INTO public.fixeo_pricing_offers_v1
   (offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at)
   VALUES(gen_random_uuid(),$1,'MAD','pilot.garden','draft-1','rabat','{"area_m2":80}',30000,0,$2,$3,now()+interval '15 minutes') RETURNING id,offer_key`;
  await db.exec('SET ROLE service_role');
  const good=await db.query(insert,['vap-bp33-v1',6000,36000]);
  assert.equal(good.rows.length,1);
  await assert.rejects(db.query(insert,['legacy',6000,36000]));
  await assert.rejects(db.query(insert,['vap-bp33-v1',4500,34500]));
  await assert.rejects(db.query(insert,['vap-bp33-v1',6000,30000]));
  await assert.rejects(db.exec('UPDATE public.fixeo_pricing_offers_v1 SET city=\'fes\''));
  await assert.rejects(db.exec('DELETE FROM public.fixeo_pricing_offers_v1'));
  await assert.rejects(db.exec('TRUNCATE public.fixeo_pricing_offers_v1'));
  for(const role of ['anon','authenticated']){
   await db.exec('RESET ROLE; SET ROLE '+role);
   await assert.rejects(db.exec('SELECT * FROM public.fixeo_pricing_offers_v1'));
   await assert.rejects(db.query(insert,['vap-bp33-v1',6000,36000]));
   await assert.rejects(db.exec('SELECT public.fixeo_vap_commission_minor_v1(30000)'));
  }
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec('UPDATE public.fixeo_pricing_offers_v1 SET city=\'fes\''));
  await assert.rejects(db.exec('DELETE FROM public.fixeo_pricing_offers_v1'));
  await assert.rejects(db.exec(`INSERT INTO public.fixeo_pricing_offers_v1 SELECT * FROM public.fixeo_pricing_offers_v1`));
  assert.deepEqual((await db.query('SELECT * FROM missions')).rows,[{id:1,agreed_price:'300',commission_amount:'45'}]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.fixeo_pricing_offers_v1')).rows[0].n,1);
 }finally{await db.close();}
});
