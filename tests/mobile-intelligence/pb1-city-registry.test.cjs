'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'../..');
test('PB1 city migration adds Martil and canonical accents without changing function guards or privileges',async()=>{
 const db=new PGlite();await db.exec('CREATE SCHEMA fixeo_private; CREATE TABLE fixeo_private.diagnostic_sessions_v1(city_slug text CONSTRAINT diagnostic_sessions_v1_city_slug_check CHECK(city_slug IN (\'fes\',\'temara\',\'mohammedia\')));');
 const names=['confirm_estimator_request_v1','confirm_estimator_request_vap_v1','create_diagnostic_critical_request_v1','create_diagnostic_quote_request_v1'];
 for(const name of names)await db.exec(`CREATE FUNCTION public.${name}(city text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF city='blocked' THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF; RETURN CASE city WHEN 'fes' THEN 'Fès' WHEN 'temara' THEN 'Temara' WHEN 'mohammedia' THEN 'Mohammedia' ELSE NULL END; END $$; REVOKE ALL ON FUNCTION public.${name}(text) FROM PUBLIC;`);
 const before=(await db.query("SELECT proname,proacl,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname")).rows;
 const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.endsWith('_pb1_mobile_city_registry.sql'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 assert.deepEqual((await db.query("SELECT proname,proacl,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname")).rows,before);
 for(const name of names){assert.equal((await db.query(`SELECT public.${name}('martil') AS city`)).rows[0].city,'Martil');assert.equal((await db.query(`SELECT public.${name}('temara') AS city`)).rows[0].city,'Témara');await assert.rejects(db.query(`SELECT public.${name}('blocked')`),/AUTH_REQUIRED/);}
 for(const city of require('../../api/diagnostic/contract').CITIES)await db.query('INSERT INTO fixeo_private.diagnostic_sessions_v1 VALUES ($1)',[city]);
 await assert.rejects(db.query("INSERT INTO fixeo_private.diagnostic_sessions_v1 VALUES ('invented')"),/check constraint/);
 await db.close();
});
