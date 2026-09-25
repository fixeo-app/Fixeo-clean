/* FIXEO Enterprise H5 — explicit operational follow-ups, never conversation memory. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.FixeoEnterpriseRafiFollowups=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(v){v=String(v||'');if(!UUID.test(v))throw new Error('INVALID_ID');return v;}
async function call(client,name,args){if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');var r=await client.rpc(name,args);if(!r||r.error||!r.data||r.data.ok!==true)throw new Error('RPC_REJECTED');return r.data;}
async function list(client,eid){return call(client,'get_enterprise_rafi_followups_v1',{p_enterprise_id:id(eid)});}
async function set(client,eid,input){input=input||{};var note=String(input.note||'').trim();if(note.length>500)throw new Error('INVALID_NOTE');return call(client,'upsert_enterprise_rafi_followup_v1',{p_enterprise_id:id(eid),p_target_type:String(input.target_type||''),p_target_id:id(input.target_id),p_followup_kind:String(input.followup_kind||''),p_status:String(input.status||'open'),p_note:note||null});}
return Object.freeze({list:list,set:set});});