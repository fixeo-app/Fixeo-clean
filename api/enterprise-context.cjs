'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
const HEADER = 'x-fixeo-enterprise-context';
function context(req) {
 const raw=req.headers?.[HEADER];
 if(raw===undefined)return null;
 if(typeof raw!=='string'||Buffer.byteLength(raw)>1500)throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});
 let value;try{value=JSON.parse(raw);}catch{throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});}
 if(!value||typeof value!=='object'||Array.isArray(value)||!value.binding||value.binding.project_ref!=='akeyuruypurmendksusc')throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN',status:403});
 return JSON.stringify(value);
}
module.exports={HEADER,current:()=>storage.getStore()||null,run:(req,work)=>storage.run(context(req),work)};
