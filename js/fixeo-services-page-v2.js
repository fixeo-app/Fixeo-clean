/* Services discovery: shared situations and RAFI, loaded on explicit interaction. */
(function(){
 'use strict';
 const loaded=new Map();let pending=false;
 function script(src){
  if(!loaded.has(src))loaded.set(src,new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src=src;
   s.onload=resolve;s.onerror=()=>{s.remove();loaded.delete(src);reject(new Error('load'));};document.head.append(s);
  }));return loaded.get(src);
 }
 function css(href){if(!document.querySelector('link[href="'+href+'"]')){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}}
 async function prepare(){
  css('css/fixeo-estimator-v2.css?v=coverage1');
  css('css/fixeo-estimation-voice-v1.css?v=voice1');
  // Sequential dependencies; successful files stay cached if a later request fails.
  for(const src of ['js/fixeo-estimator-config.js','js/fixeo-estimator-api-v1.js','js/fixeo-estimator-reservation-bridge-v1.js?v=7c9m4-continuity2','js/fixeo-ai-request-engine.js?v=aire-v1a','js/fixeo-rafi-language-v1.js?v=frl-v1a','js/fixeo-estimator-v2.js?v=coverage1','js/fixeo-estimation-voice-v1.js?v=mic-svg1','js/fixeo-discovery-v1.js?v=launcher2'])await script(src);
 }
 async function prepareDiagnostic(){
  css('css/fixeo-diagnostic-v1.css?v=diagnostic-flagship-v1');
  // The canonical bootstrap owns availability, dossier resumption and modal loading.
  await script('js/fixeo-diagnostic-v1.js?v=diagnostic-flagship-v1');
 }
 document.getElementById('services-main').addEventListener('click',async event=>{
  const trigger=event.target.closest('button[data-discovery],button[data-services-diagnostic]');if(!trigger||pending)return;
  const diagnostic=trigger.hasAttribute('data-services-diagnostic');
  const status=document.getElementById('services-status');pending=true;trigger.disabled=true;trigger.setAttribute('aria-busy','true');status.textContent=diagnostic?'Ouverture du diagnostic…':'Ouverture des situations…';
  try{
   await (diagnostic?prepareDiagnostic():prepare());let city='';try{city=sessionStorage.getItem('fxrf4_trusted_city_session')||'';}catch(_){}
   if(!window.FIXEO_CITIES_MAP?.some(item=>item.value===city))city='';
   status.textContent='';
   if(diagnostic)await window.FixeoDiagnostic.open({opener:trigger,city});
   else window.FixeoDiscovery.open(trigger.dataset.discovery,trigger,{source:'services_discovery',city});
  }catch(_){status.textContent='Le parcours n’a pas pu être chargé. Réessayez : votre page reste disponible.';}
  finally{pending=false;trigger.disabled=false;trigger.removeAttribute('aria-busy');}
 });
})();
