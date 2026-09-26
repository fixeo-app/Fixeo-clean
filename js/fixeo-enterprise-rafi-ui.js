/* FIXEO Enterprise Block G — RAFI Intelligence UI. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FixeoEnterpriseRafiUI=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function mount(win,hooks){
    var d=win.document,by=id=>d.getElementById(id);
    var section=by('enterprise-rafi-module'),messages=by('enterprise-rafi-messages'),form=by('enterprise-rafi-form');
    var input=by('enterprise-rafi-input'),send=by('enterprise-rafi-send'),speak=by('enterprise-rafi-speak'),show=by('enterprise-rafi-show');
    var files=by('enterprise-rafi-file'),camera=by('enterprise-rafi-camera'),photo=by('enterprise-rafi-photo'),removePhoto=by('enterprise-rafi-photo-remove');
    var lang=by('enterprise-rafi-language'),status=by('enterprise-rafi-status'),cameraBtn=by('enterprise-rafi-camera-button'),brief=by('enterprise-rafi-briefing');
    var history=[],selected=null,previewUrl='',recorder=null,stream=null,chunks=[],busy=false;

    function api(){return win.FixeoEnterpriseRafi;}
    function client(){return hooks.getClient();}
    function eid(){return hooks.getEnterpriseId();}
    function el(tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
    function setStatus(t){status.textContent=t||'';}
    function actionApi(){return win.FixeoEnterpriseRafiActions;}
    function actionCard(a){
      var box=el('section','fxew-rafi-result-block fxew-rafi-action');
      box.append(el('h4','',a.title||'Action proposée'));
      if(a.summary)box.append(el('p','',a.summary));
      if(a.impact)box.append(el('small','fxew-module-meta','Impact · '+a.impact));
      var b=el('button','fxew-button fxew-button--primary','Confirmer cette action');b.type='button';b.dataset.rafiAction='confirm';b._rafiProposal=a;box.append(b);return box;
    }
    function cleanupStream(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}recorder=null;chunks=[];}
    function clearPhoto(){
      selected=null;if(previewUrl){win.URL.revokeObjectURL(previewUrl);previewUrl='';}
      photo.hidden=true;photo.replaceChildren();files.value='';camera.value='';
    }
    function choose(file){
      if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>3*1024*1024){
        setStatus('Photo acceptée : JPG, PNG ou WebP, 3 Mo maximum.');return;
      }
      clearPhoto();selected=file;previewUrl=win.URL.createObjectURL(file);
      var img=d.createElement('img');img.src=previewUrl;img.alt='Image sélectionnée pour RAFI';
      var meta=el('span','',file.name||'Photo');
      photo.append(img,meta,removePhoto);photo.hidden=false;setStatus('Image prête pour RAFI.');
    }
    function message(role,text,result){
      var wrap=el('article','fxew-rafi-message fxew-rafi-message--'+role);
      wrap.append(el('strong','',role==='user'?'Vous':'RAFI'));
      wrap.append(el('p','',text));
      if(result){
        [['Points clés',result.highlights],['Alertes',result.alerts],['Recommandations',result.recommendations],['Observations image',result.image_observations]].forEach(([title,items])=>{
          if(!Array.isArray(items)||!items.length)return;
          var box=el('section','fxew-rafi-result-block'),h=el('h4','',title),ul=d.createElement('ul');
          items.forEach(x=>ul.append(el('li','',x)));box.append(h,ul);wrap.append(box);
        });
        if(Array.isArray(result.action_proposals))result.action_proposals.forEach(a=>wrap.append(actionCard(a)));
        wrap.append(el('small','fxew-rafi-confidence','Confiance · '+(result.confidence||'—')));
      }
      messages.append(wrap);messages.scrollTop=messages.scrollHeight;
    }
    async function submit(ev){
      if(ev)ev.preventDefault();if(busy)return;
      var q=String(input.value||'').trim();if(!q){setStatus('Posez une question à RAFI.');return;}
      busy=true;send.disabled=speak.disabled=show.disabled=true;setStatus('RAFI analyse les données autorisées…');
      message('user',q);input.value='';
      var file=selected;
      try{
        var result=await api().ask(client(),eid(),q,history.slice(-6),file);
        message('assistant',result.answer,result);
        history.push({role:'user',content:q},{role:'assistant',content:result.answer});
        history=history.slice(-6);
        setStatus(file?'Analyse terminée · image non conservée.':'Analyse terminée.');
        clearPhoto();
      }catch(e){
        var r=e&&(e.reason||e.message)||'';
        setStatus(r==='AUTH_REQUIRED'?'Reconnectez-vous pour continuer.':r==='PROVIDER_BUSY'?'RAFI est momentanément occupé. Réessayez.':'RAFI est momentanément indisponible.');
      }finally{busy=false;send.disabled=speak.disabled=show.disabled=false;}
    }
    async function loadBriefing(){if(busy)return;busy=true;brief.disabled=true;setStatus('RAFI analyse les risques et prépare les meilleures actions possibles…');try{var result=await api().briefing(client(),eid());message('assistant',result.answer,result);setStatus('Priorités et prochaines actions recommandées actualisées.');}catch(_){setStatus('Briefing RAFI momentanément indisponible.');}finally{busy=false;brief.disabled=false;}}
    async function startVoice(){
      if(recorder&&recorder.state==='recording'){recorder.stop();speak.textContent='Parler à RAFI';return;}
      if(!win.navigator.mediaDevices||!win.MediaRecorder){setStatus('La reconnaissance vocale n’est pas disponible sur cet appareil.');return;}
      try{
        stream=await win.navigator.mediaDevices.getUserMedia({audio:true});
        recorder=new win.MediaRecorder(stream);chunks=[];
        recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
        recorder.onstop=async()=>{
          var blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});cleanupStream();speak.disabled=true;setStatus('Transcription en cours…');
          try{
            var text=await api().transcribe(blob,lang.value);input.value=(input.value?input.value+' ':'')+text;setStatus('Transcription prête.');
          }catch(_){setStatus('Impossible de transcrire cet enregistrement.');}
          finally{speak.disabled=false;speak.textContent='Parler à RAFI';input.focus();}
        };
        recorder.start();speak.textContent='Arrêter';setStatus('RAFI écoute…');
      }catch(_){cleanupStream();setStatus('Accès au microphone refusé ou indisponible.');}
    }
    async function suggestion(ev){
      var action=ev.target.closest('[data-rafi-action="confirm"]');
      if(action){
        var proposal=action._rafiProposal;if(!proposal||busy)return;
        var label=(proposal.title||'cette action')+'\n\n'+(proposal.summary||'')+'\n\n'+(proposal.impact?'Impact : '+proposal.impact:'');
        if(!win.confirm('RAFI propose : '+label+'\n\nConfirmer l’exécution ?'))return;
        busy=true;action.disabled=true;setStatus('Vérification des droits et exécution…');
        try{var out=await actionApi().execute(client(),eid(),proposal);message('assistant','Action confirmée et exécutée par le workflow Enterprise autorisé.',null);setStatus(out&&out.governance_status==='pending_approval'?'Action soumise au workflow d’approbation.':'Action exécutée.');}
        catch(e){setStatus('Action refusée ou impossible avec vos droits actuels.');action.disabled=false;}
        finally{busy=false;}return;
      }
      var b=ev.target.closest('[data-rafi-question]');if(!b)return;
      section.querySelectorAll('[data-rafi-question]').forEach(function(x){x.classList.toggle('is-selected',x===b);x.setAttribute('aria-pressed',x===b?'true':'false');});
      input.value=b.dataset.rafiQuestion||'';input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});
    }

    form.addEventListener('submit',submit);speak.addEventListener('click',startVoice);brief.addEventListener('click',loadBriefing);
    show.addEventListener('click',()=>files.click());cameraBtn.addEventListener('click',()=>camera.click());
    files.addEventListener('change',()=>choose(files.files&&files.files[0]));camera.addEventListener('change',()=>choose(camera.files&&camera.files[0]));
    removePhoto.addEventListener('click',clearPhoto);section.addEventListener('click',suggestion);

    message('assistant','Je peux analyser vos opérations, SLA, équipes, maintenance, équipements, finance et gouvernance. Posez-moi une question, parlez-moi ou montrez-moi une situation.');
    section.hidden=false;
    return {refreshBriefing:loadBriefing,destroy:function(){cleanupStream();clearPhoto();section.removeEventListener('click',suggestion);}};
  }
  return Object.freeze({mount:mount});
});