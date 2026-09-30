(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let canonicalSources={},currentView="overview",routeLoaded=false;
let S={requests:[],missions:[],artisans:[],quotes:[],claims:[],users:[],enterprises:[],sites:[],notifications:[],payments:[],health:{},error:null},loading=false,lastLoad=0;
const F={ops:{q:'',status:'all',urgency:'all'},network:{q:'',type:'all',state:'all'}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase();
const st=x=>norm(x?.status);
const statusLabel=v=>({new:'Nouvelle',assigned:'Assignée',in_progress:'En cours',completed:'Terminée',validated:'Validée',cancelled:'Annulée',no_match:'Sans correspondance',offered:'Proposée',pending:'En attente',declined:'Refusée',expired:'Expirée',done:'Terminée',accepted:'Acceptée',rejected:'Rejetée'}[norm(v)]||String(v||'—'));
const urgencyLabel=v=>({now:'Immédiate',urgent:'Urgente',normale:'Normale'}[norm(v)]||'Normale');
const money=n=>Number(n).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2})+' MAD';
const terminalReq=x=>['completed','validated','cancelled'].includes(st(x));
const pending=()=>S.requests.filter(x=>st(x)==='new');
const activeM=()=>S.missions.filter(x=>['offered','pending','accepted','assigned','in_progress'].includes(st(x)));
const urgentAll=()=>S.requests.filter(x=>['now','urgent'].includes(norm(x.urgency)));
const urgentActive=()=>urgentAll().filter(x=>!terminalReq(x));
const verified=a=>a?.verified===true;
const incomplete=a=>!String(a?.city||'').trim()||!String(a?.service_category||a?.category||'').trim()||a?.onboarding_completed===false;
const ageMinutes=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):0};
const ageLabel=v=>{const m=ageMinutes(v);if(m<60)return m+' min';const h=Math.floor(m/60);if(h<24)return h+' h';const d=Math.floor(h/24);return d+' j'};
const tone=(status,urgency)=>{const u=norm(urgency),s=norm(status);if(u==='now'||u==='urgent')return'danger';if(['new','pending','offered'].includes(s))return'warn';if(['completed','validated','done','accepted'].includes(s))return'good';return''};
function set(id,v){const e=document.getElementById(id);if(e)e.textContent=v}
async function client(){for(let i=0;i<30;i++){const c=window.FixeoSupabaseClient?.client;if(c)return c;await new Promise(r=>setTimeout(r,100))}throw Error('SUPABASE_UNAVAILABLE')}
async function token(){const c=await client(),r=await c.auth.getSession();return r?.data?.session?.access_token||''}
async function api(path,payload){const t=await token();if(!t)throw Error('SESSION_REQUIRED');const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw Error(j.detail||j.reason||('HTTP_'+r.status));await load();return j}
function timeout(p,ms=8000){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Error('TIMEOUT')),ms))])}
async function q(c,t,sel='id',limit=500){const at=Date.now(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);try{const r=await c.from(t).select(sel).order('id').limit(limit).abortSignal(abort.signal);if(r.error)throw Error(r.error.message||'QUERY_FAILED');return{data:r.data||[],ok:true,ms:Date.now()-at}}catch(e){return{data:null,ok:false,error:abort.signal.aborted?'TIMEOUT':e.message,ms:Date.now()-at}}finally{clearTimeout(timer)}}
async function loadGroup(c,defs){await Promise.all(defs.map(async d=>{const key=d[0],r=await q(c,d[1],d[2],d[3]);if(r.ok)S[key]=r.data;S.health[key]={ok:r.ok,status:r.ok?'partial':S[key]?.length?'stale':'unavailable',ms:r.ms,error:r.error||null,count:S[key]?.length||0,last_success_at:r.ok?new Date().toISOString():S.health[key]?.last_success_at};healthBanner()}))}

function healthBanner(){const bad=Object.entries(S.health).filter(([,v])=>!v.ok);const e=$('#os-error');if(!e)return;if(!bad.length){e.hidden=true;e.textContent='';return}e.hidden=false;e.textContent='Mode dégradé · '+bad.map(([k,v])=>k+': '+(v.error||'indisponible')).join(' · ')}
const viewSources={overview:['missions'],rafi:[],operations:[],reservations:[],network:[],supply:[],finance:[],trust:[],intelligence:[],urgent:['requests','missions','artisans'],governance:['users','notifications'],notifications:['notifications']};
const sourceDefinitions=[['requests','service_requests','id,status,city,service_category,urgency,created_at,target_artisan_id,client_profile_id,pricing_offer_id,data_classification',700],['missions','missions','id,request_id,artisan_profile_id,status,created_at,accepted_at,agreed_price,final_price,commission_amount,pricing_offer_id',700],['artisans','artisans','id,full_name,city,service_category,category,availability,claimed,claim_status,verified,is_verified,rating,onboarding_completed',1600],['quotes','quotes','id,request_id,artisan_profile_id,proposed_price,status,created_at,review_status,quote_version',500],['claims','claim_requests','id,artisan_id,status,created_at,reviewed_at',300],['users','users','id,full_name,role,city,created_at',700],['notifications','notifications','id,title,type,read,created_at,related_entity_type,related_entity_id',300],['payments','payments','id,mission_id,amount,status,created_at',500],['enterprises','enterprise_accounts','id,name,status,created_at',300],['sites','enterprise_sites','id,enterprise_id,name,city,status',500]];
async function load(){
 if(loading)return;loading=true;const requestedView=currentView;
 try{
  const c=await client(),sess=await c.auth.getSession();if(!sess?.data?.session)throw Error('SESSION_REQUIRED');
  const role=await c.from('users').select('role').eq('id',sess.data.session.user.id).single();
  if(role.error||role.data?.role!=='admin')throw Error('FORBIDDEN');
  if(!routeLoaded){routeLoaded=true;window.FixeoDossier.fromRoute();}
  if(requestedView==='operations')window.FixeoOperations.refresh();
  window.FixeoRegisters?.refresh(requestedView);
  if(requestedView==='intelligence')window.FixeoIntelligence?.refresh();
  if(requestedView==='supply')window.FixeoSupply?.refresh();
  S.error=null;window.FixeoRafi.load();canonicalSources={};applyCanonicalMetrics();
  window.FixeoControl.summary((source,state)=>{canonicalSources[source]=state;applyCanonicalMetrics()}).catch(()=>{canonicalSources={};applyCanonicalMetrics()});
  const needed=viewSources[requestedView]||[];
  await loadGroup(c,sourceDefinitions.filter(d=>needed.includes(d[0])));
  lastLoad=Date.now();healthBanner();renderAll();
 }catch(e){S.error=e.message;if(['FORBIDDEN','SESSION_REQUIRED'].includes(e.message)){window.FixeoRegisters?.clear(e.message);window.FixeoIntelligence?.clear();window.FixeoRafiFollowups?.clear();}const el=$('#os-error');if(el){el.textContent='Session Control OS indisponible · '+e.message;el.hidden=false}}
 finally{loading=false;if(requestedView!==currentView)load()}
}

function exactMetric(id){for(const x of Object.values(canonicalSources)){const v=x.data?.metrics?.[id],age=Date.now()-Date.parse(x.as_of);if(x.status==='healthy'&&x.completeness==='complete'&&age>=-5000&&age<=60000&&(!x.data?.metric_quality?.[id]||x.data.metric_quality[id]==='complete')&&typeof v==='number')return v}return null}
function applyCanonicalMetrics(){
 const map={'k-requests':'requests.total','k-pending':'requests.new','k-missions':'missions.active','k-artisans':'artisans.total','k-claims':'trust.claims.pending','nav-pending':'requests.new','ops-new':'requests.new','ops-assigned':'requests.assigned','ops-progress':'requests.in_progress','n-artisans':'artisans.total','n-available':'artisans.available','n-verified':'artisans.verified','n-unclaimed':'artisans.unclaimed','n-clients':'network.clients','n-enterprises':'network.enterprises','t-unverified':'artisans.non_verified','t-claiming':'artisans.claiming','t-claims':'trust.claims.pending','t-incomplete':'artisans.incomplete','u-requests':'urgency.total','u-active':'urgency.active','u-done':'urgency.fulfilled','i-available':'artisans.available'};
 for(const [id,m] of Object.entries(map)){const v=exactMetric(m);set(id,v===null?'—':id==='f-recorded'||id==='f-paid'?money(v):v)}
 const closed=['requests.completed_pending_validation','requests.validated','requests.cancelled'].map(exactMetric);set('ops-closed',closed.some(x=>x===null)?'—':closed.reduce((a,b)=>a+b,0));
 for(const id of ['i-gaps','i-city','i-service'])set(id,'À qualifier');
 const oldest=exactMetric('urgency.oldest_active_minutes');set('u-oldest',oldest===null?'—':Math.floor(oldest)+' min');
 for(const id of ['g-users','g-notifs','no-unread','no-recent','no-missions','no-requests']){const e=$('#'+id);if(e&&!e.textContent.endsWith(' · sélection'))e.textContent=e.textContent+' · sélection'}
 if(Object.keys(canonicalSources).length<6||Object.values(canonicalSources).some(x=>x.status!=='healthy')){const e=$('#os-error');e.hidden=false;e.textContent='Métriques indisponibles ou partielles · les totaux inconnus restent —.'}
}

function rowHtml(x,kind,title,meta,badge){return '<button class="row" data-kind="'+kind+'" data-id="'+esc(x.id)+'"><b>'+esc(title)+'</b><small>'+esc(meta)+'</small><span class="pill '+tone(x.status,x.urgency)+'">'+esc(badge)+'</span></button>'}
function rows(arr,kind,title,meta,badge=x=>statusLabel(x.status)){return arr.length?arr.map(x=>rowHtml(x,kind,title(x),meta(x),badge(x))).join(''):'<div class="empty">Aucun élément dans cet état.</div>'}
function topCounts(list,key){const m={};list.forEach(x=>{const k=String(typeof key==='function'?key(x):x[key]||'Non renseigné').trim()||'Non renseigné';m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function renderAll(){set('k-requests',S.requests.length);set('k-pending',pending().length);set('k-missions',activeM().length);set('k-artisans',S.artisans.length);set('k-claims',S.claims.filter(x=>['pending','new'].includes(st(x))).length);renderOverview();renderUrgent();renderNotifications();renderGovernance();renderRafi();applyCanonicalMetrics()}

function renderOverview(){const unv=exactMetric('artisans.to_verify')??'—',u=exactMetric('urgency.active')??'—';
window.FixeoRafi?.renderTower();
const recent=[...S.missions].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8);
$('#overview-recent').innerHTML=rows(recent,'mission',x=>'Mission '+String(x.id||'').slice(0,8),x=>statusLabel(x.status)+' · commission '+money(x.commission_amount||0),x=>statusLabel(x.status))}

function renderUrgent(){const u=urgentAll(),a=urgentActive(),d=u.filter(terminalReq),old=a.length?Math.max(...a.map(x=>ageMinutes(x.created_at))):0;set('u-requests',u.length);set('u-active',a.length);set('u-done',d.length);set('u-oldest',old?ageLabel(Date.now()-old*60000):'—');
const arr=[...u].sort((x,y)=>{const w=z=>norm(z.urgency)==='now'?2:1;return w(y)-w(x)||new Date(x.created_at)-new Date(y.created_at)});$('#urgent-list').innerHTML=rows(arr.slice(0,100),'request',x=>(x.service_category||'Urgence')+' · '+(x.city||'—'),x=>urgencyLabel(x.urgency)+' · '+statusLabel(x.status)+' · '+ageLabel(x.created_at),x=>terminalReq(x)?statusLabel(x.status):'À traiter')}

function renderRafi(){window.FixeoRafi?.render()}

function renderNotifications(){const n=[...S.notifications].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),recent=n.filter(x=>ageMinutes(x.created_at)<=1440),miss=n.filter(x=>norm(x.related_entity_type)==='mission'),req=n.filter(x=>['request','service_request'].includes(norm(x.related_entity_type)));set('nav-notifs',n.filter(x=>x.read===false).length);set('no-unread',n.filter(x=>x.read===false).length);set('no-recent',recent.length);set('no-missions',miss.length);set('no-requests',req.length);
$('#notifications-list').innerHTML=n.length?n.slice(0,100).map(x=>{const type=norm(x.related_entity_type),kind=type==='mission'?'mission':(['request','service_request'].includes(type)?'request':null);return '<'+(kind?'button':'div')+' class="row" '+(kind?'data-kind="'+kind+'" data-id="'+esc(x.related_entity_id)+'"':'')+'><b>'+esc(x.title||x.type||'Notification')+'</b><small>'+esc(x.message||'')+' · '+esc(ageLabel(x.created_at))+'</small><span class="pill '+(x.read===false?'warn':'')+'">'+(x.read===false?'Non lue':'Lue')+'</span></'+(kind?'button':'div')+'>'}).join(''):'<div class="empty">Aucune notification visible.</div>'}

function renderGovernance(){set('g-users',S.users.length);set('g-notifs',S.notifications.length);set('g-bad',Object.values(S.health).filter(x=>!x.ok).length);set('g-time',new Date(lastLoad||Date.now()).toLocaleTimeString('fr-FR'));set('nav-pending',pending().length);const h=Object.entries(S.health);$('#governance-health').innerHTML=h.map(([k,v])=>'<div class="row"><b>'+esc(k)+'</b><small>'+esc(v.count)+' éléments · '+esc(v.ms)+' ms</small><span class="pill '+(v.ok?'good':'danger')+'">'+(v.ok?'Sélection partielle':v.status==='stale'?'Ancienne sélection':'Indisponible')+'</span></div>').join('')}

function drawer(kind,id){return window.FixeoRafi.openDossier(kind,id)}
async function canonicalCommand(capability,id,payload){const out=await window.FixeoControl.command(capability,id,payload);await load();return out}
function show(id){if(!viewSources[id])return;currentView=id;const url=new URL(location.href);url.searchParams.set('view',id);history.replaceState(history.state,'',url);load();$$('.section').forEach(x=>x.classList.toggle('active',x.id==='sec-'+id));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#side').classList.remove('open');set('page-title',({overview:'Control Tower',operations:'Operations Command Center',reservations:'Réservations & devis',network:'Network 360',finance:'Finance & Trust',trust:'Claims & Trust',intelligence:'Marketplace Intelligence',urgent:'Urgent Performance',governance:'System & Governance',rafi:'RAFI Decision Center',notifications:'Notifications',supply:'Supply Engine'}[id]||'Control OS'))}

window.FixeoAdmin={navigate:show};
document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v){show(v.dataset.view);return}const r=e.target.closest('[data-kind]');if(r){drawer(r.dataset.kind,r.dataset.id);return}if(e.target.closest('#menu')){$('#side').classList.toggle('open');return}if(e.target.closest('#refresh')){load();if(currentView==='operations')window.FixeoOperations.refresh(true);window.FixeoRegisters?.refresh(currentView,true);if(currentView==='intelligence')window.FixeoIntelligence?.refresh(true);if(currentView==='supply')window.FixeoSupply?.refresh(true);return}

const cp=e.target.closest('[data-copy-ref]');if(cp){navigator.clipboard?.writeText(cp.dataset.copyRef);cp.textContent='Copié ✓'}});

window.addEventListener('load',()=>{const view=new URL(location.href).searchParams.get('view');if(view&&viewSources[view])show(view);else load();});setInterval(()=>{if(document.visibilityState==='visible')load()},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
})();
