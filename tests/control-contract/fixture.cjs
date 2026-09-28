'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n+'.json'),'utf8'));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const ident=(s,t)=>q(s)+'.'+q(t);
const literal=s=>"'"+s.replaceAll("'","''")+"'";
function acl(sql,object,value){
  for(const a of (value||'').replace(/^\{|\}$/g,'').split(',')) {
    if(!a)continue; const m=a.match(/^([^=]*)=([^/]+)\//);if(!m||m[1]==='postgres')continue;
    const flags={r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',X:'EXECUTE'};
    for(const c of m[2].replaceAll('*',''))if(flags[c])sql.push(`GRANT ${flags[c]} ON ${object} TO ${m[1]?q(m[1]):'PUBLIC'};`);
  }
}
async function baseline(options={}){
 const db=options.db||new PGlite();
 const cat=read('catalog');
 const sql=[`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA fixeo_private; CREATE SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 GRANT USAGE ON SCHEMA public,auth,fixeo_private TO anon,authenticated,service_role;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
 CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$; SET check_function_bodies=off;`];
 // Canonical schemas and function bodies only. No Production rows, media or secrets.
 for(const c of cat.columns){if(c.default?.includes('nextval')){const m=c.default.match(/nextval\('([^']+)'/);if(m)sql.push('CREATE SEQUENCE IF NOT EXISTS '+m[1]+';');}}
 for(const t of cat.table_acl.filter(t=>cat.columns.some(c=>c.schema===t.schema&&c.table===t.table))){
  const cols=cat.columns.filter(c=>c.schema===t.schema&&c.table===t.table).map(c=>q(c.name)+' '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.not_null?' NOT NULL':''));
  sql.push('CREATE TABLE '+ident(t.schema,t.table)+' ('+cols.join(',')+');');
 }
 for(const f of read('db-definitions'))sql.push(f.definition+';');
 for(const fk of [false,true])for(const c of read('db-constraints').filter(c=>(c.contype==='f')===fk))sql.push(`ALTER TABLE ${ident(c.schema,c.table_name)} ADD CONSTRAINT ${q(c.conname)} ${c.definition};`);
 for(const i of read('db-indexes'))sql.push(i.indexdef.replace(/^(CREATE (?:UNIQUE )?INDEX) /,'$1 IF NOT EXISTS ')+';');
 // Views and their policies are restored below after function registration.
 for(const v of read('db-views'))sql.push(`CREATE VIEW ${ident(v.schema,v.name)}${v.reloptions?.length?' WITH ('+v.reloptions.join(',')+')':''} AS ${v.definition};`);
 for(const t of cat.table_acl){if(t.rls)sql.push(`ALTER TABLE ${ident(t.schema,t.table)} ENABLE ROW LEVEL SECURITY;`);acl(sql,'TABLE '+ident(t.schema,t.table),t.acl);}
 for(const c of read('db-privileges'))sql.push(`GRANT ${c.privilege_type} (${q(c.column_name)}) ON ${ident(c.table_schema,c.table_name)} TO ${q(c.grantee)};`);
 for(const f of read('db-functions')){const sig=ident(f.schema,f.proname)+'('+f.args+')';if(f.proacl!==null){sql.push('REVOKE ALL ON FUNCTION '+sig+' FROM PUBLIC;');acl(sql,'FUNCTION '+sig,f.proacl);}}
 for(const p of cat.policies)sql.push(`CREATE POLICY ${q(p.policyname)} ON ${ident(p.schemaname,p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r=>r==='public'?'PUBLIC':q(r)).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`);
 for(const t of read('db-triggers'))sql.push(t.definition+';');
 sql.push('SET check_function_bodies=on;');
 await db.exec(sql.join('\n'));return db;
}
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function actor(db,n,role='authenticated'){await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims',${literal(JSON.stringify({sub:uuid(n),role}))},false); SET ROLE ${q(role)};`);}
async function migrate(db){for(const file of fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).filter(x=>x.includes('_control_os_b1_')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8'));}
module.exports={baseline,actor,migrate,uuid,read};
