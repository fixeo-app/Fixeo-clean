/* FIXEO ADMIN OS — B1/B2 shell controller. Presentation only. */
(function(){'use strict';
function e(id){return document.getElementById(id)}
function icon(g){return '<span class="icon fxao-icon" aria-hidden="true">'+g+'</span>'}
function install(){
 if(!document.body||document.body.dataset.dashType!=='admin')return;
 var side=e('admin-sidebar'),overview=e('admin-section-overview'); if(!side||!overview)return;
 if(!side.querySelector('.fxao-admin-rafi')){var r=document.createElement('button');r.type='button';r.className='fxao-admin-rafi';r.innerHTML='<span>✦</span><strong>RAFI Admin Intelligence</strong><small>Briefing · investigation · prochaine action</small>';r.addEventListener('click',function(){window.dispatchEvent(new CustomEvent('fixeo:admin:rafi-open'))});var nav=side.querySelector('.sidebar-nav');side.insertBefore(r,nav)}
 var map=[['overview','⌂'],['fxacs-requests','▤'],['reservations','◷'],['cod-orders','◫']];
 side.querySelectorAll('.sidebar-link').forEach(function(a){var oc=a.getAttribute('onclick')||'';for(var i=0;i<map.length;i++){if(oc.indexOf("'"+map[i][0]+"'")>-1){var x=a.querySelector('.icon');if(x){x.outerHTML=icon(map[i][1])}break}}});
 if(!e('fxao-command-head')){var h=document.createElement('div');h.id='fxao-command-head';h.className='fxao-command-head';h.innerHTML='<div><p>FIXEO COMMAND CENTER</p><h1>Supervision opérationnelle</h1><small>Client · Artisan · Enterprise · Marketplace</small></div><label class="fxao-global-search"><span aria-hidden="true">⌕</span><input id="fxao-global-search" type="search" placeholder="Rechercher demande, mission, client, artisan, entreprise…" autocomplete="off"><kbd>/</kbd></label>';overview.insertBefore(h,overview.firstChild)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
window.addEventListener('fixeo:admin:refresh',install);
})();