/* FIXEO Enterprise Block G — RAFI client. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseRafi=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  async function token(client){
    if(!client||!client.auth||typeof client.auth.getSession!=='function')throw new Error('AUTH_UNAVAILABLE');
    var r=await client.auth.getSession();
    var t=r&&r.data&&r.data.session&&r.data.session.access_token;
    if(!t)throw new Error('AUTH_REQUIRED');
    return t;
  }
  async function ask(client,eid,question,history,file){
    var t=await token(client),headers={Authorization:'Bearer '+t},body;
    if(file){
      var fd=new FormData();
      fd.append('enterprise_id',eid);fd.append('question',question);fd.append('history',JSON.stringify(history||[]));fd.append('image',file,file.name||'rafi-image');
      body=fd;
    }else{
      headers['Content-Type']='application/json';
      body=JSON.stringify({enterprise_id:eid,question:question,history:history||[]});
    }
    var r=await fetch('/api/enterprise-rafi',{method:'POST',headers,body,credentials:'same-origin'});
    var data=await r.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
    if(!r.ok||!data.ok){var e=new Error(data.error||'RAFI_FAILED');e.reason=data.error||'RAFI_FAILED';throw e;}
    return data;
  }
  async function briefing(client,eid){
    var t=await token(client);var r=await fetch('/api/enterprise-rafi',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({enterprise_id:eid,mode:'briefing',history:[]}),credentials:'same-origin'});var data=await r.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));if(!r.ok||!data.ok){var e=new Error(data.error||'RAFI_FAILED');e.reason=data.error||'RAFI_FAILED';throw e;}return data;
  }
  async function transcribe(blob,language){
    var fd=new FormData();
    fd.append('audio',blob,'rafi-enterprise.webm');
    fd.append('language',language||'fr-FR');
    var r=await fetch('/api/rafi-transcribe',{method:'POST',body:fd,credentials:'same-origin'});
    var data=await r.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
    if(!r.ok||!data.ok){var e=new Error(data.error||'TRANSCRIPTION_FAILED');e.reason=data.error||'TRANSCRIPTION_FAILED';throw e;}
    return data.text;
  }
  return Object.freeze({ask:ask,briefing:briefing,transcribe:transcribe});
});