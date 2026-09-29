(function(root){'use strict';
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const views=[
  ['overview',"Vue d'ensemble",'Control Tower'],['operations','Opérations','Demandes et missions'],
  ['reservations','Réservations','Devis Marketplace'],['network','Réseau 360','People & Enterprise'],
  ['finance','Finance & Trust','Commissions et reversements'],['trust','Claims & Trust','Confiance et vérifications'],
  ['intelligence','Marketplace Intelligence','Activation, couverture et cohortes'],['urgent','Urgent Performance','Urgences actives'],
  ['rafi','RAFI Decision Center','Priorités et décisions gouvernées'],['notifications','Notifications','Événements et alertes'],
  ['governance','Système & gouvernance','Santé et sources']
 ];
 let dialog,input,list,status,active=0,items=[],ticket=0,returnFocus=null;
 const editable=e=>e&&(['INPUT','TEXTAREA','SELECT'].includes(e.tagName)||e.isContentEditable);
 function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='control-command-palette';dialog.className='command-palette';dialog.setAttribute('aria-labelledby','command-title');
  dialog.innerHTML='<div class="command-shell"><div class="command-head"><div><span class="kicker">COMMAND PALETTE</span><h2 id="command-title">Aller à une vue ou ouvrir un dossier</h2></div><button class="btn command-close" type="button" aria-label="Fermer la palette">Échap</button></div><label class="sr-only" for="command-input">Rechercher une commande ou un dossier</label><input id="command-input" class="control command-input" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="command-results" aria-expanded="true" placeholder="Vue, métier, ville, identifiant…"><div id="command-status" class="command-status" role="status" aria-live="polite"></div><div id="command-results" class="command-results" role="listbox" aria-label="Résultats"></div><p class="command-help">↑ ↓ naviguer · Entrée ouvrir · Échap fermer · aucune commande ne déclenche une mutation métier.</p></div>';
  document.body.append(dialog);input=$('#command-input');list=$('#command-results');status=$('#command-status');
  dialog.querySelector('.command-close').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  input.addEventListener('input',()=>render(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(e.key==='ArrowDown'?1:-1);}else if(e.key==='Enter'){e.preventDefault();activate();}});
  list.addEventListener('click',e=>{const b=e.target.closest('[data-command-index]');if(!b)return;active=Number(b.dataset.commandIndex);activate();});
 }
 function commandRows(q){
  const n=q.trim().toLocaleLowerCase('fr');
  return views.filter(v=>!n||(v[1]+' '+v[2]).toLocaleLowerCase('fr').includes(n)).map(v=>({kind:'view',id:v[0],title:v[1],meta:v[2]}));
 }
 function paint(message=''){
  active=Math.max(0,Math.min(active,Math.max(0,items.length-1)));
  list.innerHTML=items.length?items.map((x,i)=>'<button type="button" role="option" aria-selected="'+(i===active)+'" class="command-row'+(i===active?' active':'')+'" data-command-index="'+i+'"><span><b>'+esc(x.title)+'</b><small>'+esc(x.meta)+'</small></span><span class="command-kind">'+esc(x.kind==='view'?'Vue':x.type||'Dossier')+'</span></button>').join(''):'<div class="empty command-empty">Aucun résultat accessible.</div>';
  status.textContent=message||(items.length+' résultat'+(items.length>1?'s':''));
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});
 }
 async function render(value=''){
  const local=commandRows(value),q=value.trim(),mark=++ticket;items=local;active=0;paint(q.length>=2?'Recherche des dossiers autorisés…':'Commandes disponibles');
  if(q.length<2||!root.FixeoControl?.request)return;
  try{
   const r=await root.FixeoControl.request('search',{query:q,type:'all',limit:8});if(mark!==ticket)return;
   const remote=(r.items||[]).map(x=>({kind:'dossier',type:x.type,id:x.id,title:(x.summary?.service_category||x.summary?.name||x.summary?.full_name||x.type||'Dossier')+' · '+String(x.id||'').slice(0,8),meta:[x.summary?.city,x.summary?.status,x.type].filter(Boolean).join(' · ')}));
   items=[...local,...remote];active=0;paint(items.length+' résultat'+(items.length>1?'s':'')+' · accès canonique');
  }catch(error){if(mark!==ticket)return;items=local;paint('Recherche dossier indisponible · '+error.message);}
 }
 function move(delta){if(!items.length)return;active=(active+delta+items.length)%items.length;paint();}
 function activate(){const item=items[active];if(!item)return;if(item.kind==='view'){root.FixeoAdmin?.navigate(item.id);close();return;}if(item.kind==='dossier'){close(false);root.FixeoDossier?.open(item.type,item.id);}}
 function open(){ensure();if(dialog.open)return;returnFocus=document.activeElement;dialog.showModal();input.value='';render('');queueMicrotask(()=>input.focus());}
 function close(restore=true){if(!dialog?.open)return;ticket++;dialog.close();if(restore&&returnFocus?.focus)queueMicrotask(()=>returnFocus.focus());}
 async function searchGlobal(inputEl,typeEl,results){
  const q=inputEl.value.trim(),mark=++inputEl._fixeoTicket;if(q.length<2){results.hidden=true;results.innerHTML='';return;}
  results.hidden=false;results.innerHTML='<div class="empty">Recherche autorisée…</div>';
  try{
   const r=await root.FixeoControl.request('search',{query:q,type:typeEl?.value||'all',limit:12});if(mark!==inputEl._fixeoTicket)return;
   results.innerHTML=(r.items||[]).length?(r.items||[]).map((x,i)=>'<button class="row global-search-result" type="button" data-search-type="'+esc(x.type)+'" data-search-id="'+esc(x.id)+'" data-search-index="'+i+'"><b>'+esc(x.summary?.service_category||x.summary?.name||x.summary?.full_name||x.type)+'</b><small>'+esc([x.summary?.city,x.summary?.status,String(x.id).slice(0,8)].filter(Boolean).join(' · '))+'</small><span class="pill">'+esc(x.type)+'</span></button>').join(''):'<div class="empty">Aucun dossier accessible.</div>';
  }catch(error){if(mark!==inputEl._fixeoTicket)return;results.innerHTML='<div class="error">Recherche indisponible · '+esc(error.message)+'</div>';}
 }
 function wireGlobal(){
  const g=$('#global-search'),t=$('#global-type'),r=$('#global-results');if(!g||!r)return;g._fixeoTicket=0;
  let timer;const run=()=>{clearTimeout(timer);timer=setTimeout(()=>searchGlobal(g,t,r),180);};
  g.addEventListener('input',run);t?.addEventListener('change',run);
  r.addEventListener('click',e=>{const b=e.target.closest('[data-search-type]');if(!b)return;r.hidden=true;root.FixeoDossier?.open(b.dataset.searchType,b.dataset.searchId);});
  g.addEventListener('keydown',e=>{const rows=[...r.querySelectorAll('[data-search-type]')];if(e.key==='Escape'){r.hidden=true;g.blur();return;}if(!rows.length)return;let i=rows.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();(rows[Math.min(rows.length-1,i<0?0:i+1)]||rows[0]).focus();}});
  r.addEventListener('keydown',e=>{const rows=[...r.querySelectorAll('[data-search-type]')],i=rows.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();rows[(i+1)%rows.length]?.focus();}if(e.key==='ArrowUp'){e.preventDefault();(i<=0?g:rows[i-1])?.focus();}if(e.key==='Escape'){e.preventDefault();r.hidden=true;g.focus();}});
 }
 function boot(){
  ensure();wireGlobal();
  const actions=$('.top .actions');if(actions&&!$('#command-open')){const b=document.createElement('button');b.id='command-open';b.className='btn command-open';b.type='button';b.setAttribute('aria-keyshortcuts','Control+K Meta+K');b.innerHTML='Commandes <kbd>⌘K</kbd>';b.onclick=open;actions.insertBefore(b,actions.firstChild);}
  const menu=$('#menu'),side=$('#side');if(menu&&side)document.addEventListener('click',e=>{if(e.target.closest('#menu')||e.target.closest('[data-view]'))queueMicrotask(()=>menu.setAttribute('aria-expanded',String(side.classList.contains('open'))));});
  document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open();return;}
   if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!editable(e.target)){e.preventDefault();root.FixeoAdmin?.navigate('overview');queueMicrotask(()=>$('#global-search')?.focus());return;}
   if(e.key==='Escape'&&!dialog.open){const side=$('#side');if(side?.classList.contains('open')){e.preventDefault();side.classList.remove('open');$('#menu')?.setAttribute('aria-expanded','false');$('#menu')?.focus();}}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 root.FixeoCommandUX={open,close};
})(window);
