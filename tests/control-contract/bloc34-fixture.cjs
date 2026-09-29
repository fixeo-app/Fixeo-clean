'use strict';
const fs=require('node:fs'),path=require('node:path');
const F=require('./fixture.cjs');
const migration=fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).find(n=>n.includes('_control_os_b34_'));
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',migration),'utf8');
async function setup(){const db=await F.baseline();await F.migrate(db);await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260929021750_control_os_b2_rafi_reads.sql'),'utf8'));await db.exec(sql);return db;}
module.exports={...F,setup,sql,migration};
