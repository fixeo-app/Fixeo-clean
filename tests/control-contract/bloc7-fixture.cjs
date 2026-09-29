'use strict';
const fs=require('node:fs'),path=require('node:path'),F=require('./bloc6-fixture.cjs');
const migration='20260929204000_control_os_b7_rafi_governance.sql',sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',migration),'utf8');
async function setup(){const db=await F.setup();await db.exec(sql);return db;}
module.exports={...F,setup,sql,migration};
