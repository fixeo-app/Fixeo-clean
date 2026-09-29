(function(root){'use strict';
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function ensure(){
  const section=$('#sec-governance');if(!section||$('#control-observability'))return;
  const card=document.createElement('div');card.className='card control-observability';card.id='control-observability';
  card.innerHTML='<div class="card-head"><div><h2>Observabilité Control</h2><p>Traces locales minimisées : route, statut, latence et corrélation. Aucun payload, token, téléphone, nom ou texte métier.</p></div><span class="pill" id="control-trace-state">Aucune requête</span></div><div class="grid kpis compact control-trace-kpis"><div class="card kpi"><span>Requêtes observées</span><b id="trace-count">0</b></div><div class="card kpi"><span>Erreurs</span><b id="trace-errors">0</b></div><div class="card kpi"><span>p95 local</span><b id="trace-p95">—</b></div><div class="card kpi"><span>Dernière corrélation</span><b id="trace-correlation">—</b></div></div><div class="list" id="control-trace-list" aria-live="polite"></div>';
  section.append(card);
 }
 function render(){
  ensure();const rows=root.FixeoControl?.traceSnapshot?.()||[],list=$('#control-trace-list');if(!list)return;
  const errors=rows.filter(x=>x.status==='error').length,sorted=rows.map(x=>x.ms).sort((a,b)=>a-b),p95=sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]:null,last=rows.at(-1);
  $('#trace-count').textContent=String(rows.length);$('#trace-errors').textContent=String(errors);$('#trace-p95').textContent=p95==null?'—':p95+' ms';$('#trace-correlation').textContent=last?.correlation_id?last.correlation_id.slice(0,8):'—';
  const state=$('#control-trace-state');state.textContent=errors?'Dégradé observé':'OK';state.className='pill '+(errors?'warn':'good');
  list.innerHTML=rows.slice(-8).reverse().map(x=>'<div class="row control-trace-row"><b>'+esc(x.operation)+'</b><small>'+esc(x.http_status??'transport')+' · '+esc(x.ms)+' ms · '+esc(x.at)+'</small><span class="pill '+(x.status==='success'?'good':'warn')+'">'+esc(x.status==='success'?'OK':x.code||'ERREUR')+'</span></div>').join('')||'<div class="empty">Aucune requête Control observée dans cette session.</div>';
 }
 root.addEventListener?.('fixeo:control-trace',render);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();render();});else{ensure();render();}
 root.FixeoControlObservability={render};
})(window);
