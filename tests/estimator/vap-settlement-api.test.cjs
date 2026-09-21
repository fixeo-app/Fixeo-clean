const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('../../api/admin-settle-mission-fn/index.js');
const id='11111111-1111-4111-8111-111111111111';
test('Settlement reads persisted fee on fresh and idempotent calls, rejects force price changes',async()=>{
 const old=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 let row={id,status:'done',agreed_price:360.01,final_price:null,commission_amount:60,pricing_offer_id:id},patches=0;
 global.fetch=async(url,opts={})=>{
 let result;if(url.includes('/auth/v1/user'))result={id};else if(url.includes('/users?'))result=[{role:'admin'}];
 else if(opts.method==='PATCH'){patches++;row.final_price=JSON.parse(opts.body).final_price;result=[row];}else result=[row];
 return {ok:true,status:200,json:async()=>result};
 };
 async function call(price,force=false){let body,status;const res={status(n){status=n;return this},json(x){body=x;return this},setHeader(){}};await handler({method:'POST',headers:{authorization:'Bearer test'},body:{mission_id:id,final_price:price,force}},res);return {status,body};}
 try{
 let r=await call(360.01);assert.equal(r.status,200);assert.equal(r.body.commission_amount,60);assert.equal(r.body.artisan_net,300.01);
 r=await call(360.01);assert.equal(r.body.idempotent,true);assert.equal(r.body.commission_amount,60);assert.equal(patches,1);
 assert.equal((await call(400,true)).status,409);assert.equal(patches,1);
 assert.equal((await call('360.01oops')).status,400);
 }finally{global.fetch=old;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
