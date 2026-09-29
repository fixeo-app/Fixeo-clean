'use strict';
const fs=require('node:fs'),path=require('node:path');
const F=require('./bloc34-fixture.cjs');
const migration=fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).find(n=>n.endsWith('_control_os_b5_command_reads.sql'));
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',migration),'utf8');
const guard=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260929161248_control_os_b5_finance_integrity.sql'),'utf8');
async function setup({financeGuard=true}={}){const db=await F.setup();await db.exec(sql);if(financeGuard)await db.exec(guard);return db;}
async function seed(db){const u=F.uuid;await db.exec(`
 INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,10)n;
 INSERT INTO public.users(id,role,full_name,city) SELECT id,CASE id WHEN '${u(3)}' THEN 'admin' WHEN '${u(2)}' THEN 'artisan' ELSE 'client' END,'Synthetic user','Fès' FROM auth.users;
 INSERT INTO public.profiles(id,role) SELECT id,role FROM public.users;
 SELECT set_config('request.jwt.claims','{"sub":"${u(3)}","role":"authenticated"}',false);
 INSERT INTO public.artisans(id,full_name,phone,city,service_category,description,photo_url,owner_user_id,claimed,onboarding_completed,availability,data_classification) VALUES
 ('${u(20)}','Synthetic Complete','+000000000001','Fès','plomberie','PRIVATE PROFILE DESCRIPTION','https://example.invalid/synthetic.png','${u(2)}',true,true,'available','test'),
 ('${u(21)}','Synthetic Incomplete',NULL,'Rabat','electricite',NULL,NULL,NULL,false,false,'unavailable','test');
 INSERT INTO public.artisan_service_cities(artisan_id,city) VALUES('${u(20)}','Casablanca');
 INSERT INTO public.artisan_service_categories(artisan_id,service_category) VALUES('${u(20)}','electricite');
 INSERT INTO public.enterprise_accounts(id,name,status,data_classification) VALUES('${u(30)}','Synthetic A','active','test'),('${u(31)}','Synthetic B','active','test');
 INSERT INTO public.enterprise_sites(id,enterprise_id,name,city,status) VALUES('${u(40)}','${u(30)}','Synthetic A site','Fès','active'),('${u(41)}','${u(31)}','Synthetic B site','Rabat','active');
 INSERT INTO public.enterprise_members(id,enterprise_id,user_id,role,status) VALUES
 ('${u(50)}','${u(30)}','${u(4)}','owner','active'),('${u(51)}','${u(30)}','${u(2)}','site_manager','active'),('${u(52)}','${u(31)}','${u(5)}','owner','active');
 INSERT INTO public.enterprise_member_sites(enterprise_id,member_id,site_id,assigned_by) VALUES('${u(30)}','${u(51)}','${u(40)}','${u(4)}');
 INSERT INTO public.enterprise_workforce_workers(id,enterprise_id,member_id,display_label,employee_code,all_sites,created_by,max_concurrent_jobs) VALUES
 ('${u(60)}','${u(30)}','${u(51)}','PRIVATE EMPLOYEE LABEL','PRIVATE EMPLOYEE CODE',true,'${u(4)}',2),
 ('${u(61)}','${u(31)}','${u(52)}','OTHER TENANT PRIVATE LABEL','PRIVATE CODE',true,'${u(5)}',1);
 INSERT INTO public.enterprise_workforce_skills(enterprise_id,worker_id,service_category,skill_level,active) VALUES('${u(30)}','${u(60)}','plomberie',3,true);
 `);}
module.exports={...F,setup,seed,sql,migration,guard};
