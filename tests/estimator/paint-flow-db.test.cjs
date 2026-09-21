const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const o=require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {attachOffer}=require('../../api/estimator-v1/fixeo-vap-offers-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');
for(const [serviceCode,inputs,amount,fee,materials=0] of [
 ['peinture.mur_interieur.labour_only',{active_moisture:false,paint_support:'PAINT_READY',paint_access:'PAINT_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',paint_finish:'PAINT_TWO_COATS',painted_m2:20.25},698.63,91.13],
 ['peinture.mur_interieur.all_in',{active_moisture:false,paint_included_support:'PAINT_INCLUDED_READY',paint_included_access:'PAINT_INCLUDED_ACCESS_READY',paint_included_product:'PAINT_COLOVINYL900_WHITE',paint_included_finish:'PAINT_INCLUDED_TWO_COATS',painted_m2:20.25},1148.63,91.13,450],
 ['peinture.mur_interieur.all_in',{active_moisture:false,paint_included_support:'PAINT_INCLUDED_READY',paint_included_access:'PAINT_INCLUDED_ACCESS_READY',paint_included_product:'PAINT_COLOVINYL900_WHITE',paint_included_finish:'PAINT_INCLUDED_TWO_COATS',painted_m2:66.67},3300.16,300.01,1000.05],
 ['peinture.plafond.labour_only',{active_moisture:false,ceiling_support:'CEILING_READY',ceiling_access:'CEILING_ACCESS_READY',paint_supplies:'PAINT_CLIENT_SUPPLIED',ceiling_finish:'CEILING_TWO_COATS',ceiling_m2:50.03},2301.32,300.12]
]) test(serviceCode+' '+(inputs.painted_m2||inputs.ceiling_m2)+' m2: estimation, confirmation, dispatch and settlement retain exact amounts',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE artisans(owner_user_id uuid,full_name text,name text,phone_public text,phone text,source text,claimed boolean,claim_status text,photo_url text,is_public boolean,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text,service_category text,work_zone text,availability text,review_count integer,rating numeric,updated_at timestamptz);
 CREATE TABLE service_requests(target_artisan_id uuid,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_category text,city text,description text,client_phone text,urgency text,status text,idempotency_key text,tracking_ref text,guest_token_hash text);
 CREATE TABLE estimator_context_redemptions(context_id text PRIMARY KEY,outcome_type text,service_code text,session_id text,amount_mad integer,state text,acquired_at timestamptz,service_request_id uuid,committed_at timestamptz,failed_at timestamptz,failure_reason text,booking_ref text,order_id text);
 CREATE TABLE missions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id text,artisan_profile_id uuid,status text,agreed_price numeric,final_price numeric,commission_amount numeric);
 CREATE FUNCTION set_commission_amount() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.commission_amount:=coalesce(round(coalesce(NEW.final_price,NEW.agreed_price)*0.15,2),0);RETURN NEW;END $$;
 CREATE TRIGGER trg_set_commission_amount BEFORE INSERT OR UPDATE ON missions FOR EACH ROW EXECUTE FUNCTION set_commission_amount();
 INSERT INTO missions(request_id,agreed_price) VALUES('legacy',300);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role,authenticated;`);
 for(const file of ['20260921005143_vap_bp33_offers_foundation.sql','20260921012731_vap_booking_settlement_binding.sql','20260921090058_garden_vap_confirmation.sql','20260921091341_tile_vap_confirmation.sql']) await db.exec('BEGIN;'+fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8')+'COMMIT;');
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/dispatch-request-live-20260921.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/category-resolution-live-20260921.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921100804_masonry_vap_confirmation.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260921103223_moving_vap_confirmation.sql'),'utf8'));
 await db.exec("INSERT INTO artisans(city,service_category,availability,review_count,rating,updated_at) VALUES ('Rabat','Carrelage','available',500,5,now()),('Rabat','Peinture','available',0,0,now());");
 // Build the real estimator offer. Simulate approval ONLY for the new supplies proposal.
 const entries=catalogue.entries.map(t=>t.service_code==='peinture.mur_interieur.all_in'?{...t,approved:true}:t);
 const session=o.evaluateEstimator(o.startEstimator({service_hint:serviceCode,city_slug:'rabat',known_inputs:inputs}).session).session;
 assert.equal(session.outcome.price.amount_mad,amount);
 const payload={service_code:serviceCode,city_slug:'rabat',session_id:session.session_id,context_id:'fxctx-'+'a'.repeat(32),outcome_type:'PRICE_READY',expires_at:Date.now()+60000};let row;
 await attachOffer(session,payload,{entries,env:{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},fetchImpl:async(_,opts)=>{row=JSON.parse(opts.body);return {ok:true};}});
 assert.equal(row.materials_minor,Math.round(materials*100));assert.equal(payload.financial_breakdown.artisanRetentionMinor,row.vap_minor+row.materials_minor);
 assert.equal(row.client_total_minor,Math.round(amount*100));assert.equal(row.commission_minor,Math.round(fee*100));
 const id=(await db.query(`INSERT INTO fixeo_pricing_offers_v1(id,offer_key,pricing_version,currency,service_code,catalogue_version,city,scope,vap_minor,materials_minor,commission_minor,client_total_minor,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[row.id,row.offer_key,row.pricing_version,row.currency,row.service_code,row.catalogue_version,row.city,JSON.stringify(row.scope),row.vap_minor,row.materials_minor,row.commission_minor,row.client_total_minor,row.expires_at])).rows[0].id;
 const args=[payload.context_id,'PRICE_READY',serviceCode,session.session_id,String(amount),'rabat','0612345678','Test only','FX-TEST','a'.repeat(64),id];
 const sql='SELECT confirm_estimator_request_vap_v1('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS r';
 await db.exec('SET ROLE service_role');
 let result=(await db.query(sql,args)).rows[0].r;assert.equal(result.ok,true);const request=result.request_id;assert.equal(result.service_category,'peinture');
 assert.equal((await db.query(sql,args)).rows[0].r.replayed,true);
 const bad=[...args];bad[4]='360';assert.equal((await db.query(sql,bad)).rows[0].r.reason,'offer_mismatch');
 const preview=(await db.query('SELECT * FROM dispatch_preview_v21($1)',[request])).rows;assert.equal(preview.length,1);assert.equal(preview[0].artisan_category,'Peinture');
 const dispatched=(await db.query('SELECT dispatch_request_v1($1) AS r',[request])).rows[0].r;assert.equal(dispatched.ok,true);
 const mission=(await db.query('SELECT * FROM missions WHERE id=$1',[dispatched.mission_id])).rows[0];
 assert.equal((await db.query('SELECT service_category FROM artisans WHERE id=$1',[mission.artisan_profile_id])).rows[0].service_category,'Peinture');
 assert.equal(mission.pricing_offer_id,id);assert.equal(Number(mission.agreed_price),amount);assert.equal(Number(mission.commission_amount),fee);
 await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[mission.id,amount]);
 await db.query('UPDATE missions SET final_price=$2 WHERE id=$1',[mission.id,amount]);
 await assert.rejects(db.query('UPDATE missions SET final_price=400 WHERE id=$1',[mission.id]));
 await assert.rejects(db.query('UPDATE missions SET pricing_offer_id=NULL WHERE id=$1',[mission.id]));
 await assert.rejects(db.query('UPDATE service_requests SET pricing_offer_id=NULL WHERE id=$1',[request]));
 await db.exec('RESET ROLE; SET ROLE authenticated');
 await assert.rejects(db.query(sql,args));
 await assert.rejects(db.query("INSERT INTO missions(request_id,status) VALUES($1,'pending')",[request]));
 await db.query("UPDATE missions SET status='validated' WHERE id=$1",[mission.id]);
 assert.equal(Number((await db.query('SELECT commission_amount FROM missions WHERE id=$1',[mission.id])).rows[0].commission_amount),fee);
 await db.exec('RESET ROLE');
 const legacyRequest=(await db.query("INSERT INTO service_requests(service_category,city,status,description) VALUES('maconnerie','Rabat','new','Legacy compatibility') RETURNING id")).rows[0].id;
 const legacyDispatch=(await db.query('SELECT dispatch_request_v1($1) AS r',[legacyRequest])).rows[0].r;assert.equal(legacyDispatch.ok,true);
 assert.equal((await db.query('SELECT service_category FROM artisans WHERE id=$1',[legacyDispatch.artisan_id])).rows[0].service_category,'Carrelage');
 assert.equal(Number((await db.query("SELECT commission_amount FROM missions WHERE request_id='legacy'")).rows[0].commission_amount),45);
 }finally{await db.close();}
});
