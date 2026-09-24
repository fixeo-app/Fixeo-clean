/* FIXEO Enterprise Block D — Equipment client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseEquipment=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var CRITICALITY=Object.freeze(['low','medium','high','critical']);
  var STATUS=Object.freeze(['active','out_of_service','retired']);
  var ASSET_TYPES=Object.freeze(['photo','document','manual','warranty','invoice','other']);
  var MIME=Object.freeze(['image/jpeg','image/png','image/webp','application/pdf']);
  var BUCKET='enterprise-equipment-private';

  function validId(v){return UUID_RE.test(String(v||''));}
  function canManage(role){return ['owner','admin','operations_manager','site_manager'].includes(String(role||''));}
  async function rpc(client,name,args){
    if(!client||typeof client.rpc!=='function')throw new Error('RPC_UNAVAILABLE');
    var r=await client.rpc(name,args);
    if(!r||r.error)throw new Error('RPC_FAILED');
    if(!r.data||r.data.ok!==true){
      var e=new Error((r.data&&r.data.reason)||'RPC_REJECTED');e.reason=(r.data&&r.data.reason)||'RPC_REJECTED';throw e;
    }
    return r.data;
  }
  async function loadFleet(client,eid){
    if(!validId(eid))throw new Error('INVALID_ENTERPRISE_ID');
    return rpc(client,'get_enterprise_equipment_fleet_v1',{p_enterprise_id:eid});
  }
  async function loadDetail(client,eid,equipmentId,limit){
    if(!validId(eid)||!validId(equipmentId))throw new Error('INVALID_ID');
    var n=Number(limit||100);if(!Number.isInteger(n)||n<1||n>500)throw new Error('INVALID_LIMIT');
    return rpc(client,'get_enterprise_equipment_detail_v1',{p_enterprise_id:eid,p_equipment_id:equipmentId,p_history_limit:n});
  }
  async function upsert(client,eid,input){
    input=input||{};
    if(!validId(eid)||!validId(input.site_id))throw new Error('INVALID_ID');
    var equipmentId=input.equipment_id?String(input.equipment_id):null;
    if(equipmentId&&!validId(equipmentId))throw new Error('INVALID_EQUIPMENT_ID');
    if(!CRITICALITY.includes(String(input.criticality||'')))throw new Error('INVALID_CRITICALITY');
    if(!STATUS.includes(String(input.status||'')))throw new Error('INVALID_STATUS');
    return rpc(client,'upsert_enterprise_equipment_v1',{
      p_enterprise_id:eid,p_equipment_id:equipmentId,p_site_id:String(input.site_id),
      p_name:String(input.name||'').trim(),p_category:String(input.category||'').trim(),
      p_asset_code:String(input.asset_code||'').trim()||null,
      p_manufacturer:String(input.manufacturer||'').trim()||null,
      p_model:String(input.model||'').trim()||null,
      p_serial_number:String(input.serial_number||'').trim()||null,
      p_installed_at:input.installed_at||null,
      p_criticality:String(input.criticality),p_status:String(input.status),
      p_notes:String(input.notes||'').trim()||null
    });
  }
  async function setRequestLink(client,eid,equipmentId,requestId,linked){
    if(!validId(eid)||!validId(equipmentId)||!validId(requestId))throw new Error('INVALID_ID');
    return rpc(client,'set_enterprise_equipment_request_link_v1',{
      p_enterprise_id:eid,p_equipment_id:equipmentId,p_request_id:requestId,p_linked:!!linked
    });
  }
  async function setMaintenanceLink(client,eid,equipmentId,planId,linked){
    if(!validId(eid)||!validId(equipmentId)||!validId(planId))throw new Error('INVALID_ID');
    return rpc(client,'set_enterprise_equipment_maintenance_link_v1',{
      p_enterprise_id:eid,p_equipment_id:equipmentId,p_plan_id:planId,p_linked:!!linked
    });
  }
  function safeFilename(name){
    return String(name||'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-120)||'file';
  }
  function storagePath(eid,equipmentId,file){
    if(!validId(eid)||!validId(equipmentId))throw new Error('INVALID_ID');
    var ext=safeFilename(file&&file.name||'file');
    var nonce=(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function')
      ? globalThis.crypto.randomUUID().replace(/-/g,'')
      : String(Date.now())+String(Math.random()).slice(2);
    return 'enterprise/'+eid+'/equipment/'+equipmentId+'/'+nonce+'-'+ext;
  }
  async function uploadAsset(client,eid,equipmentId,file,assetType,title){
    if(!client||!client.storage||typeof client.storage.from!=='function')throw new Error('STORAGE_UNAVAILABLE');
    if(!file||!MIME.includes(String(file.type||'')))throw new Error('INVALID_MIME_TYPE');
    if(!Number.isFinite(file.size)||file.size<1||file.size>10485760)throw new Error('INVALID_SIZE');
    if(!ASSET_TYPES.includes(String(assetType||'')))throw new Error('INVALID_ASSET_TYPE');
    var path=storagePath(eid,equipmentId,file);
    var bucket=client.storage.from(BUCKET);
    var up=await bucket.upload(path,file,{contentType:file.type,upsert:false});
    if(!up||up.error)throw new Error('UPLOAD_FAILED');
    try{
      var meta=await rpc(client,'register_enterprise_equipment_asset_v1',{
        p_enterprise_id:eid,p_equipment_id:equipmentId,p_asset_type:String(assetType),
        p_title:String(title||file.name||'Document').trim(),p_storage_path:path,
        p_mime_type:String(file.type),p_size_bytes:Number(file.size)
      });
      return {asset_id:meta.asset_id,storage_path:path};
    }catch(e){
      try{await bucket.remove([path]);}catch(_){}
      throw e;
    }
  }
  async function signedAssetUrl(client,path,expires){
    if(!client||!client.storage||typeof client.storage.from!=='function')throw new Error('STORAGE_UNAVAILABLE');
    var seconds=Number(expires||300);if(!Number.isInteger(seconds)||seconds<60||seconds>3600)throw new Error('INVALID_EXPIRY');
    var r=await client.storage.from(BUCKET).createSignedUrl(path,seconds);
    if(!r||r.error||!r.data||!r.data.signedUrl)throw new Error('SIGNED_URL_FAILED');
    return r.data.signedUrl;
  }
  async function removeAsset(client,eid,asset){
    if(!asset||!validId(asset.id)||!asset.storage_path)throw new Error('INVALID_ASSET');
    if(!client||!client.storage||typeof client.storage.from!=='function')throw new Error('STORAGE_UNAVAILABLE');
    var rem=await client.storage.from(BUCKET).remove([asset.storage_path]);
    if(!rem||rem.error)throw new Error('STORAGE_REMOVE_FAILED');
    return rpc(client,'remove_enterprise_equipment_asset_v1',{p_enterprise_id:eid,p_asset_id:asset.id});
  }
  return Object.freeze({
    bucket:BUCKET,criticality:CRITICALITY,statuses:STATUS,assetTypes:ASSET_TYPES,
    canManage:canManage,loadFleet:loadFleet,loadDetail:loadDetail,upsert:upsert,
    setRequestLink:setRequestLink,setMaintenanceLink:setMaintenanceLink,
    uploadAsset:uploadAsset,signedAssetUrl:signedAssetUrl,removeAsset:removeAsset
  });
});