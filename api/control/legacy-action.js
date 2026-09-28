'use strict';
// Compatibility route, no second mutation path. A reviewed preview is mandatory.
const {createHandler}=require('./index');
function handler(){return (req,res)=>{
 if(!req.body?.preview_id){res.setHeader('Cache-Control','no-store');return res.status(428).json({ok:false,code:'CONTROL_PREVIEW_REQUIRED'});}
 const original=req.url;req.url='/api/control-v1/action/execute';
 const proxy={method:req.method,path:'/api/control-v1/action/execute',headers:req.headers,body:req.body};
 req.url=original;return createHandler()(proxy,res);
};}
module.exports={handler};
