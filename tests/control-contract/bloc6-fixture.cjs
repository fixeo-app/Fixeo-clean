'use strict';
const fs=require('node:fs'),path=require('node:path'),F=require('./bloc5-fixture.cjs');
const migration=fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).find(n=>n.endsWith('_control_os_b6_intelligence_reads.sql'));
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',migration),'utf8');
async function setup(){const db=await F.setup();await db.exec(sql);return db;}
module.exports={...F,setup,sql,migration};
