(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let canonicalSources={},currentView="overview";
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
const viewSources={overview:['missions'],rafi:[],operations:['requests','missions'],reservations:['requests','quotes'],network:['artisans','users','enterprises'],finance:['missions','payments'],trust:['claims','artisans'],intelligence:['requests','artisans'],urgent:['requests','missions','artisans'],governance:['users','notifications'],notifications:['notifications']};
const sourceDefinitions=[['requests','service_requests','id,status,city,service_category,urgency,created_at,target_artisan_id,client_profile_id,pricing_offer_id,data_classification',700],['missions','missions','id,request_id,artisan_profile_id,status,created_at,accepted_at,agreed_price,final_price,commission_amount,pricing_offer_id',700],['artisans','artisans','id,full_name,city,service_category,category,availability,claimed,claim_status,verified,is_verified,rating,onboarding_completed',1600],['quotes','quotes','id,request_id,artisan_profile_id,proposed_price,status,created_at,review_status,quote_version',500],['claims','claim_requests','id,artisan_id,status,created_at,reviewed_at',300],['users','users','id,full_name,role,city,created_at',700],['notifications','notifications','id,title,type,read,created_at,related_entity_type,related_entity_id',300],['payments','payments','id,mission_id,amount,status,created_at',500],['enterprises','enterprise_accounts','id,name,status,created_at',300],['sites','enterprise_sites','id,enterprise_id,name,city,status',500]];
async function load(){
 if(loading)return;loading=true;const requestedView=currentView;
 try{
  const c=await client(),sess=await c.auth.getSession();if(!sess?.data?.session)throw Error('SESSION_REQUIRED');
  const role=await c.from('users').select('role').eq('id',sess.data.session.user.id).single();
  if(role.error||role.data?.role!=='admin')throw Error('FORBIDDEN');
  S.error=null;window.FixeoRafi.load();canonicalSources={};applyCanonicalMetrics();
  window.FixeoControl.summary((source,state)=>{canonicalSources[source]=state;applyCanonicalMetrics()}).catch(()=>{canonicalSources={};applyCanonicalMetrics()});
  const needed=viewSources[requestedView]||[];
  await loadGroup(c,sourceDefinitions.filter(d=>needed.includes(d[0])));
  lastLoad=Date.now();healthBanner();renderAll();
 }catch(e){S.error=e.message;const el=$('#os-error');if(el){el.textContent='Session Control OS indisponible · '+e.message;el.hidden=false}}
 finally{loading=false;if(requestedView!==currentView)load()}
}

function exactMetric(id){for(const x of Object.values(canonicalSources)){const v=x.data?.metrics?.[id],age=Date.now()-Date.parse(x.as_of);if(x.status==='healthy'&&x.completeness==='complete'&&age>=-5000&&age<=60000&&(!x.data?.metric_quality?.[id]||x.data.metric_quality[id]==='complete')&&typeof v==='number')return v}return null}
function applyCanonicalMetrics(){
 const map={'k-requests':'requests.total','k-pending':'requests.new','k-missions':'missions.active','k-artisans':'artisans.total','k-claims':'trust.claims.pending','nav-pending':'requests.new','ops-new':'requests.new','ops-assigned':'requests.assigned','ops-progress':'requests.in_progress','n-artisans':'artisans.total','n-available':'artisans.available','n-verified':'artisans.verified','n-unclaimed':'artisans.unclaimed','n-clients':'network.clients','n-enterprises':'network.enterprises','t-unverified':'artisans.non_verified','t-claiming':'artisans.claiming','f-validated':'finance.price_finalized','t-claims':'trust.claims.pending','t-incomplete':'artisans.incomplete','u-requests':'urgency.total','u-active':'urgency.active','u-done':'urgency.fulfilled','i-available':'artisans.available','f-recorded':'finance.expected','f-to-settle':'finance.price_missing','f-paid':'finance.confirmed'};
 for(const [id,m] of Object.entries(map)){const v=exactMetric(m);set(id,v===null?'—':id==='f-recorded'||id==='f-paid'?money(v):v)}
 const closed=['requests.completed_pending_validation','requests.validated','requests.cancelled'].map(exactMetric);set('ops-closed',closed.some(x=>x===null)?'—':closed.reduce((a,b)=>a+b,0));
 for(const id of ['i-gaps','i-city','i-service','r-unquoted'])set(id,'À qualifier');
 const oldest=exactMetric('urgency.oldest_active_minutes');set('u-oldest',oldest===null?'—':Math.floor(oldest)+' min');
 for(const id of ['r-quotes','r-pending','r-accepted','g-users','g-notifs','no-unread','no-recent','no-missions','no-requests']){const e=$('#'+id);if(e&&!e.textContent.endsWith(' · sélection'))e.textContent=e.textContent+' · sélection'}
 if(Object.keys(canonicalSources).length<6||Object.values(canonicalSources).some(x=>x.status!=='healthy')){const e=$('#os-error');e.hidden=false;e.textContent='Métriques indisponibles ou partielles · les totaux inconnus restent —.'}
}

function rowHtml(x,kind,title,meta,badge){return '<button class="row" data-kind="'+kind+'" data-id="'+esc(x.id)+'"><b>'+esc(title)+'</b><small>'+esc(meta)+'</small><span class="pill '+tone(x.status,x.urgency)+'">'+esc(badge)+'</span></button>'}
function rows(arr,kind,title,meta,badge=x=>statusLabel(x.status)){return arr.length?arr.map(x=>rowHtml(x,kind,title(x),meta(x),badge(x))).join(''):'<div class="empty">Aucun élément dans cet état.</div>'}
function topCounts(list,key){const m={};list.forEach(x=>{const k=String(typeof key==='function'?key(x):x[key]||'Non renseigné').trim()||'Non renseigné';m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function coverage(){const demand={},supply={};S.requests.forEach(r=>{const k=(r.city||'Non renseignée')+' · '+(r.service_category||'Service');demand[k]=(demand[k]||0)+1});S.artisans.forEach(a=>{const k=(a.city||'Non renseignée')+' · '+(a.service_category||a.category||'Service');supply[k]=(supply[k]||0)+1});return[...new Set([...Object.keys(demand),...Object.keys(supply)])].map(k=>({key:k,d:demand[k]||0,s:supply[k]||0,g:(demand[k]||0)-(supply[k]||0)})).sort((a,b)=>b.g-a.g||b.d-a.d)}
function renderAll(){set('k-requests',S.requests.length);set('k-pending',pending().length);set('k-missions',activeM().length);set('k-artisans',S.artisans.length);set('k-claims',S.claims.filter(x=>['pending','new'].includes(st(x))).length);renderOverview();renderOperations();renderReservations();renderNetwork();renderFinance();renderTrust();renderIntelligence();renderUrgent();renderNotifications();renderGovernance();renderRafi();applyCanonicalMetrics()}

function renderOverview(){const unv=exactMetric('artisans.to_verify')??'—',u=exactMetric('urgency.active')??'—';
window.FixeoRafi?.renderTower();
const recent=[...S.missions].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8);
$('#overview-recent').innerHTML=rows(recent,'mission',x=>'Mission '+String(x.id||'').slice(0,8),x=>statusLabel(x.status)+' · commission '+money(x.commission_amount||0),x=>statusLabel(x.status))}

function renderOperations(){set('ops-new',S.requests.filter(x=>st(x)==='new').length);set('ops-assigned',S.requests.filter(x=>st(x)==='assigned').length);set('ops-progress',S.requests.filter(x=>st(x)==='in_progress').length);set('ops-closed',S.requests.filter(x=>['completed','validated','cancelled'].includes(st(x))).length);
let arr=[...S.requests];if(F.ops.status!=='all')arr=arr.filter(x=>st(x)===F.ops.status);if(F.ops.urgency!=='all')arr=arr.filter(x=>norm(x.urgency)===F.ops.urgency);if(F.ops.q)arr=arr.filter(x=>Object.values(x).join(' ').toLowerCase().includes(F.ops.q));arr.sort((a,b)=>{const w=x=>norm(x.urgency)==='now'?3:norm(x.urgency)==='urgent'?2:1;return w(b)-w(a)||new Date(a.created_at)-new Date(b.created_at)});set('ops-count',arr.length+' demande(s) affichée(s)');
$('#operations-list').innerHTML=rows(arr.slice(0,100),'request',x=>(x.service_category||'Demande')+' · '+(x.city||'—'),x=>urgencyLabel(x.urgency)+' · '+statusLabel(x.status)+' · '+ageLabel(x.created_at),x=>statusLabel(x.status));
const m=[...S.missions].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,40);
$('#operations-missions').innerHTML=rows(m,'mission',x=>'Mission '+String(x.id||'').slice(0,8),x=>statusLabel(x.status)+' · '+money(x.final_price||x.agreed_price||0),x=>statusLabel(x.status))}

function renderReservations(){const openReq=S.requests.filter(x=>!terminalReq(x)),quotedIds=new Set(S.quotes.map(q=>String(q.request_id))),unquoted=openReq.filter(r=>!quotedIds.has(String(r.id)));set('r-quotes',S.quotes.length);set('r-unquoted',unquoted.length);set('r-pending',S.quotes.filter(x=>st(x)==='pending').length);set('r-accepted',S.quotes.filter(x=>st(x)==='accepted').length);
const ctx=$('#reservations-context');if(ctx)ctx.innerHTML='<div><b>Pipeline marketplace</b><p>Sélection bornée : '+unquoted.length+' demande(s) sans devis dans les données chargées ; le besoin d’un devis reste à qualifier. Les devis personnels Artisan OS ne sont volontairement pas mélangés ici.</p></div><button class="btn primary" data-view="operations">Ouvrir les demandes</button>';
const q=[...S.quotes].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));$('#reservations-list').innerHTML=q.length?rows(q.slice(0,80),'quote',x=>'Devis '+String(x.id||'').slice(0,8),x=>money(x.proposed_price||x.total||0)+' · '+statusLabel(x.status),x=>statusLabel(x.status)):'<div class="empty">Aucun devis marketplace enregistré pour le moment. Le Control OS conserve cette distinction au lieu d\'afficher des devis personnels Artisan OS.</div>'}

function renderNetwork(){const clients=S.users.filter(x=>x.role==='client'),av=S.artisans.filter(x=>norm(x.availability)==='available'),ver=S.artisans.filter(verified),unclaimed=S.artisans.filter(x=>x.claimed!==true),ents=S.enterprises;set('n-artisans',S.artisans.length);set('n-available',av.length);set('n-verified',ver.length);set('n-unclaimed',unclaimed.length);set('n-clients',clients.length);set('n-enterprises',ents.length);
let all=[...S.artisans.map(x=>({...x,_k:'artisan'})),...clients.map(x=>({...x,_k:'client'})),...ents.map(x=>({...x,_k:'enterprise'}))];if(F.network.type!=='all')all=all.filter(x=>x._k===F.network.type);if(F.network.state==='available')all=all.filter(x=>x._k==='artisan'&&norm(x.availability)==='available');if(F.network.state==='unverified')all=all.filter(x=>x._k==='artisan'&&!verified(x));if(F.network.state==='unclaimed')all=all.filter(x=>x._k==='artisan'&&x.claimed!==true);if(F.network.q)all=all.filter(x=>Object.values(x).join(' ').toLowerCase().includes(F.network.q));
$('#network-list').innerHTML=all.length?all.slice(0,160).map(x=>'<button class="row" data-kind="'+x._k+'" data-id="'+esc(x.id)+'"><b>'+esc(x.full_name||x.name||'Profil')+'</b><small>'+esc(x._k==='artisan'?((x.service_category||x.category||'Métier à compléter')+' · '+(x.city||'Ville à qualifier')):(x.city||x.role||''))+'</small><span class="pill '+(x._k==='artisan'&&verified(x)?'good':'')+'">'+esc(x._k==='artisan'?(verified(x)?'Vérifié':(x.claimed?'À vérifier':'À revendiquer')):x._k)+'</span></button>').join(''):'<div class="empty">Aucun profil ne correspond à ces filtres.</div>'}

function renderFinance(){const recorded=S.missions.reduce((a,m)=>a+Number(m.commission_amount||0),0),toSettle=S.missions.filter(m=>['done','validated'].includes(st(m))&&!Number(m.final_price)).length,paid=S.payments.filter(p=>['paid','validated','completed'].includes(st(p))).reduce((a,p)=>a+Number(p.amount||0),0),finalized=S.missions.filter(m=>Number(m.final_price)>0).length;set('f-recorded',money(recorded));set('f-to-settle',toSettle);set('f-paid',money(paid));set('f-validated',finalized);
const arr=[...S.missions].filter(m=>Number(m.commission_amount)>0||['done','validated'].includes(st(m))).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));$('#finance-list').innerHTML=arr.length?rows(arr,'mission',x=>'Mission '+String(x.id||'').slice(0,8),x=>statusLabel(x.status)+' · prix '+money(x.final_price||x.agreed_price||0)+' · commission '+money(x.commission_amount||0),x=>(['done','validated'].includes(st(x))&&!Number(x.final_price))?'À finaliser':statusLabel(x.status)):'<div class="empty">Aucun mouvement financier marketplace exploitable pour le moment.</div>'}

function renderTrust(){const claims=S.claims.filter(x=>['pending','new'].includes(st(x))),unv=S.artisans.filter(a=>!verified(a)),claiming=S.artisans.filter(a=>norm(a.claim_status)==='pending'),inc=S.artisans.filter(incomplete);set('t-claims',claims.length);set('t-unverified',unv.length);set('t-claiming',claiming.length);set('t-incomplete',inc.length);
const claimHtml=claims.slice(0,20).map(x=>'<div class="row"><b>Claim '+esc(String(x.id||'').slice(0,8))+'</b><small>'+esc(x.requester_name||x.requester_phone||'Demande de revendication')+'</small><span class="actions"><button class="btn primary" data-claim-approve="'+esc(x.id)+'">Approuver</button><button class="btn" data-claim-reject="'+esc(x.id)+'">Rejeter</button></span></div>').join('');
const artHtml=unv.slice(0,50).map(a=>'<button class="row" data-kind="artisan" data-id="'+esc(a.id)+'"><b>'+esc(a.full_name||a.name||'Artisan')+'</b><small>'+esc((a.service_category||a.category||'Métier à compléter')+' · '+(a.city||'Ville à qualifier'))+'</small><span class="pill warn">'+esc(a.claimed?'À vérifier':'Non revendiqué')+'</span></button>').join('');
$('#trust-list').innerHTML=claimHtml+artHtml||'<div class="empty">Aucune action Trust en attente.</div>'}

function renderIntelligence(){const cov=coverage(),gaps=cov.filter(x=>x.d>0&&x.s===0),city=topCounts(S.requests,'city')[0]||['—',0],service=topCounts(S.requests,'service_category')[0]||['—',0],available=S.artisans.filter(x=>norm(x.availability)==='available').length;set('i-gaps',gaps.length);set('i-city',city[0]+' · '+city[1]);set('i-service',service[0]+' · '+service[1]);set('i-available',available);
$('#intel-list').innerHTML=cov.slice(0,80).map(x=>'<div class="row"><b>'+esc(x.key)+'</b><small>Sélection chargée : demandes '+x.d+' · profils référencés '+x.s+'</small><span class="pill">Éligibilité à qualifier</span></div>').join('')||'<div class="empty">Aucun signal de couverture disponible.</div>';
const top=topCounts(S.requests,'city').slice(0,8),max=Math.max(1,...top.map(x=>x[1]));$('#intel-top').innerHTML=top.map(([k,v])=>'<div class="mini-bar"><b>'+esc(k)+'</b><div class="track"><div class="fill" style="width:'+Math.round(v/max*100)+'%"></div></div><span>'+v+'</span></div>').join('')}

function renderUrgent(){const u=urgentAll(),a=urgentActive(),d=u.filter(terminalReq),old=a.length?Math.max(...a.map(x=>ageMinutes(x.created_at))):0;set('u-requests',u.length);set('u-active',a.length);set('u-done',d.length);set('u-oldest',old?ageLabel(Date.now()-old*60000):'—');
const arr=[...u].sort((x,y)=>{const w=z=>norm(z.urgency)==='now'?2:1;return w(y)-w(x)||new Date(x.created_at)-new Date(y.created_at)});$('#urgent-list').innerHTML=rows(arr.slice(0,100),'request',x=>(x.service_category||'Urgence')+' · '+(x.city||'—'),x=>urgencyLabel(x.urgency)+' · '+statusLabel(x.status)+' · '+ageLabel(x.created_at),x=>terminalReq(x)?statusLabel(x.status):'À traiter')}

function renderRafi(){window.FixeoRafi?.render()}

function renderNotifications(){const n=[...S.notifications].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),recent=n.filter(x=>ageMinutes(x.created_at)<=1440),miss=n.filter(x=>norm(x.related_entity_type)==='mission'),req=n.filter(x=>['request','service_request'].includes(norm(x.related_entity_type)));set('nav-notifs',n.filter(x=>x.read===false).length);set('no-unread',n.filter(x=>x.read===false).length);set('no-recent',recent.length);set('no-missions',miss.length);set('no-requests',req.length);
$('#notifications-list').innerHTML=n.length?n.slice(0,100).map(x=>{const type=norm(x.related_entity_type),kind=type==='mission'?'mission':(['request','service_request'].includes(type)?'request':null);return '<'+(kind?'button':'div')+' class="row" '+(kind?'data-kind="'+kind+'" data-id="'+esc(x.related_entity_id)+'"':'')+'><b>'+esc(x.title||x.type||'Notification')+'</b><small>'+esc(x.message||'')+' · '+esc(ageLabel(x.created_at))+'</small><span class="pill '+(x.read===false?'warn':'')+'">'+(x.read===false?'Non lue':'Lue')+'</span></'+(kind?'button':'div')+'>'}).join(''):'<div class="empty">Aucune notification visible.</div>'}

function renderGovernance(){set('g-users',S.users.length);set('g-notifs',S.notifications.length);set('g-bad',Object.values(S.health).filter(x=>!x.ok).length);set('g-time',new Date(lastLoad||Date.now()).toLocaleTimeString('fr-FR'));set('nav-pending',pending().length);const h=Object.entries(S.health);$('#governance-health').innerHTML=h.map(([k,v])=>'<div class="row"><b>'+esc(k)+'</b><small>'+esc(v.count)+' éléments · '+esc(v.ms)+' ms</small><span class="pill '+(v.ok?'good':'danger')+'">'+(v.ok?'Sélection partielle':v.status==='stale'?'Ancienne sélection':'Indisponible')+'</span></div>').join('')}

function drawer(kind,id){return window.FixeoRafi.openDossier(kind,id)}
async function canonicalCommand(capability,id,payload){const out=await window.FixeoControl.command(capability,id,payload);await load();return out}
async function claim(id,approve){return canonicalCommand(approve?'claim.approve':'claim.reject',id,{})}
function show(id){currentView=id;load();$$('.section').forEach(x=>x.classList.toggle('active',x.id==='sec-'+id));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#side').classList.remove('open');set('page-title',({overview:'Control Tower',operations:'Operations Command Center',reservations:'Réservations & devis',network:'Network 360',finance:'Finance & Trust',trust:'Claims & Trust',intelligence:'Marketplace Intelligence',urgent:'Urgent Performance',governance:'System & Governance',rafi:'RAFI Decision Center',notifications:'Notifications'}[id]||'Control OS'))}

window.FixeoAdmin={navigate:show};
document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v){show(v.dataset.view);return}const r=e.target.closest('[data-kind]');if(r){drawer(r.dataset.kind,r.dataset.id);return}if(e.target.closest('#menu')){$('#side').classList.toggle('open');return}if(e.target.closest('#drawer-close')){$('#drawer').classList.remove('open');return}if(e.target.closest('#refresh')){load();return}
const ca=e.target.closest('[data-claim-approve]');if(ca){ca.disabled=true;claim(ca.dataset.claimApprove,true).catch(err=>{ca.disabled=false;ca.textContent='Échec · '+err.message});return}
const cr=e.target.closest('[data-claim-reject]');if(cr){cr.disabled=true;claim(cr.dataset.claimReject,false).catch(err=>{cr.disabled=false;cr.textContent='Échec · '+err.message});return}
const cp=e.target.closest('[data-copy-ref]');if(cp){navigator.clipboard?.writeText(cp.dataset.copyRef);cp.textContent='Copié ✓'}});
$('#ops-search')?.addEventListener('input',e=>{F.ops.q=e.target.value.toLowerCase().trim();renderOperations()});$('#ops-status')?.addEventListener('change',e=>{F.ops.status=e.target.value;renderOperations()});$('#ops-urgency')?.addEventListener('change',e=>{F.ops.urgency=e.target.value;renderOperations()});$('#network-search')?.addEventListener('input',e=>{F.network.q=e.target.value.toLowerCase().trim();renderNetwork()});$('#network-type')?.addEventListener('change',e=>{F.network.type=e.target.value;renderNetwork()});$('#network-state')?.addEventListener('change',e=>{F.network.state=e.target.value;renderNetwork()});
let searchTimer,searchTicket=0;
$('#global-search')?.addEventListener('input',e=>{
 const query=e.target.value.trim(),box=$('#global-results'),ticket=++searchTicket;clearTimeout(searchTimer);
 if(query.length<2){box.hidden=true;box.innerHTML='';return}
 box.hidden=false;box.innerHTML='<div class="empty">Recherche canonique…</div>';
 searchTimer=setTimeout(async()=>{
  const types=['request','artisan','client','enterprise','mission'];
  const results=await Promise.allSettled(types.map(async type=>{const result=await window.FixeoControl.request('search',{query,type,limit:5});return result.items.map(x=>({...x,_k:type}))}));
  if(ticket!==searchTicket)return;
  const items=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const partial=results.some(r=>r.status==='rejected');
  box.innerHTML=(partial?'<p>Recherche partielle : certaines sources sont indisponibles.</p>':'')+(items.length?items.slice(0,15).map(x=>'<button class="row" data-kind="'+x._k+'" data-id="'+esc(x.id)+'"><b>'+esc(x.name||x.service_category||x._k)+'</b><small>'+esc(x.city||x.status||'')+'</small><span class="pill">'+esc(x._k)+'</span></button>').join(''):'<div class="empty">'+(partial?'Résultat inconnu sur les sources absentes.':'Aucun résultat dans les pages interrogées.')+'</div>');
 },350);
});
window.addEventListener('load',load);setInterval(()=>{if(document.visibilityState==='visible')load()},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
})();
