/* ============================================================
   FIXEO BP05 V2 — enterprise-dashboard-v1.js
   Part 1: state / auth / navigation / overview
   ============================================================ */
'use strict';

// ── Supabase client
const _sb = window._supabase;

// ── Role constants
const CAN_CREATE_ROLES  = ['owner','admin','operations_manager','site_manager','reporter'];
const CAN_CONFIRM_ROLES = ['owner','admin','operations_manager','site_manager'];
function canCreate(role)  { return CAN_CREATE_ROLES.includes(role); }
function canConfirm(role) { return CAN_CONFIRM_ROLES.includes(role); }

// ── App state
const S = {
  userId: null, userEmail: null,
  enterprises: [], activeEnterprise: null, userRole: null,
  sites: [], sitesLoaded: false,
  activeSection: 'overview',
  detailRequestId: null, detailSiteId: null, prefillSiteId: null,
  requests: [], requestCursor: null, requestsExhausted: false,
  reqStatusFilter: 'all', reqSiteFilter: '', reqUrgencyFilter: '', reqSearchQuery: '',
  history: [], historyCursor: null, historyExhausted: false,
  histStatusFilter: '', histSiteFilter: '',
  members: [],
  kpis: { total:0, action:0, active:0, pending:0, done:0, nomatch:0 },
  pollTimer: null, isPolling: false,
  detailRequest: null, detailMission: null,
  formSubmitting: false, confirmSubmitting: false,
  searchDebounceTimer: null,
};

const PAGE_SIZE     = 20;
const POLL_INTERVAL = 30000;

// ── DOM helpers
function $e(id)          { return document.getElementById(id); }
function show(id)        { const el=$e(id); if(el){ el.style.display=''; el.hidden=false; } }
function hide(id)        { const el=$e(id); if(el){ el.style.display='none'; el.hidden=true; } }
function showEl(el)      { if(el){ el.style.display=''; el.hidden=false; } }
function hideEl(el)      { if(el){ el.style.display='none'; el.hidden=true; } }
function setText(id, v)  { const el=$e(id); if(el) el.textContent = v ?? ''; }
function safeHtml(s)     {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Gate helpers
// HTML IDs: ent-auth-gate | ent-access-denied | ent-selector | ent-dashboard
const GATES = ['ent-auth-gate','ent-access-denied','ent-selector'];
function showGate(name) {
  GATES.forEach(id => { const el=$e(id); if(el){ el.hidden=(id!==name); el.style.display=(id!==name)?'none':''; } });
  const dash=$e('ent-dashboard'); if(dash){ dash.hidden=true; dash.style.display='none'; }
}
function showApp() {
  GATES.forEach(id => { const el=$e(id); if(el){ el.hidden=true; el.style.display='none'; } });
  const dash=$e('ent-dashboard'); if(dash){ dash.hidden=false; dash.style.display=''; }
}

// ── Section navigation
const ALL_SECTIONS = [
  'overview','requests','request-detail','new-request',
  'sites','site-detail','members','history','account'
];

function showSection(name) {
  ALL_SECTIONS.forEach(s => {
    const el=$e('section-'+s);
    if(el){ el.hidden=(s!==name); el.style.display=(s!==name)?'none':''; }
  });
  // Bottom nav
  document.querySelectorAll('[data-section]').forEach(btn => {
    const sec = btn.dataset.section;
    const match = sec===name
      ||(sec==='requests'&&(name==='request-detail'||name==='new-request'))
      ||(sec==='sites'&&name==='site-detail');
    btn.classList.toggle('active', match);
    if(btn.id&&btn.id.startsWith('bnav-')) btn.setAttribute('aria-current', match?'page':'');
  });
  S.activeSection = name;
}

function navigateTo(section, ctx) {
  ctx = ctx||{};
  if(ctx.requestId   !== undefined) S.detailRequestId = ctx.requestId;
  if(ctx.siteId      !== undefined) S.detailSiteId    = ctx.siteId;
  if(ctx.prefillSiteId!==undefined) S.prefillSiteId   = ctx.prefillSiteId;
  showSection(section);
  switch(section) {
    case 'overview':        loadOverview();                        break;
    case 'requests':        loadRequests(true);                    break;
    case 'request-detail':  loadDetail(S.detailRequestId);         break;
    case 'new-request':     initNewRequestForm();                  break;
    case 'sites':           loadSites();                           break;
    case 'site-detail':     loadSiteDetail(S.detailSiteId);        break;
    case 'members':         loadMembers();                         break;
    case 'history':         loadHistory(true);                     break;
    case 'account':         renderAccount();                       break;
  }
}

// Expose globally for inline onclick attributes in HTML
window.EntDashboard = { goTo: function(sec,ctx){ navigateTo(sec,ctx); } };

// ── Nav listeners (idempotent)
let _navAttached = false;
function attachNavListeners() {
  if(_navAttached) return;
  _navAttached = true;

  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', function() {
      const sec = this.dataset.section;
      if(sec) navigateTo(sec);
    });
  });

  // Gate buttons: HTML uses ent-denied logout link, no dedicated retry/logout btn IDs
  // (auth gate uses <a href="auth.html"> links — no JS wiring needed)

  const entBtn = $e('ent-header-ent-btn');
  if(entBtn) entBtn.addEventListener('click', function(){ showEnterprisePicker(); });

  const logoutBtn = $e('account-logout-btn');
  if(logoutBtn) logoutBtn.addEventListener('click', function(){ doSignOut(); });

  const detailBack = $e('detail-back-btn');
  if(detailBack) detailBack.addEventListener('click', function(){ navigateTo('requests'); });

  const siteBack = $e('site-detail-back-btn');
  if(siteBack) siteBack.addEventListener('click', function(){ navigateTo('sites'); });
}

// ── Sign out
async function doSignOut() {
  stopPolling();
  await _sb.auth.signOut();
  window.location.href = '/';
}

// ── Enterprise picker
function showEnterprisePicker() {
  if(!S.enterprises||S.enterprises.length<=1) return;
  const names = S.enterprises.map(function(e,i){ return (i+1)+'. '+e.name+' ('+formatRole(e.role)+')'; }).join('\n');
  const choice = window.prompt('Choisir un espace :\n'+names+'\n\nEntrez le numéro :');
  if(!choice) return;
  const idx = parseInt(choice,10)-1;
  if(idx>=0&&idx<S.enterprises.length) selectEnterprise(S.enterprises[idx]);
}

function selectEnterprise(ent) {
  S.activeEnterprise = { id:ent.id, name:ent.name };
  S.userRole         = ent.role;
  S.sites=[]; S.sitesLoaded=false;
  S.requests=[]; S.requestCursor=null; S.requestsExhausted=false;
  S.history=[]; S.historyCursor=null; S.historyExhausted=false;
  S.members=[];
  S.kpis={ total:0, action:0, active:0, pending:0, done:0, nomatch:0 };

  setText('ent-header-ent-name', ent.name);
  setText('ent-header-role-badge', formatRole(ent.role));

  startPolling();
  navigateTo('overview');
}

function formatRole(role) {
  return ({
    owner:'Propriétaire', admin:'Administrateur',
    operations_manager:'Resp. opérations', site_manager:'Resp. site',
    reporter:'Déclarant', viewer:'Observateur'
  })[role]||role;
}

// ── Boot / auth flow
async function bootApp() {
  showGate('ent-auth-gate');
  let session;
  try {
    const { data, error } = await _sb.auth.getSession();
    if(error) throw error;
    session = data.session;
  } catch(err) {
    setText('ent-gate-msg', err.message||'Erreur de connexion');
    showGate('ent-access-denied');
    return;
  }
  if(!session) { window.location.href='/'; return; }
  S.userId    = session.user.id;
  S.userEmail = session.user.email;

  let rows;
  try {
    const { data, error } = await _sb
      .from('enterprise_members')
      .select('role, enterprise_accounts!inner(id, name)')
      .eq('user_id', S.userId);
    if(error) throw error;
    rows = data||[];
  } catch(err) {
    setText('ent-denied-reason', err.message||'Erreur de chargement');
    showGate('ent-access-denied');
    return;
  }

  if(!rows.length) {
    setText('ent-denied-reason', "Vous n'\u00eates pas membre d'un compte entreprise actif.");
    showGate('ent-access-denied');
    return;
  }

  S.enterprises = rows.map(function(r){ return {
    id:   r.enterprise_accounts.id,
    name: r.enterprise_accounts.name,
    role: r.role,
  }; });

  if(!S.enterprises.length) {
    setText('ent-denied-reason', 'Aucun compte entreprise disponible.');
    showGate('ent-access-denied');
    return;
  }

  showApp();
  attachNavListeners();
  attachRequestsListeners();
  attachHistoryListeners();
  attachFormListeners();

  if(S.enterprises.length===1) {
    showApp();
    attachNavListeners();
    attachRequestsListeners();
    attachHistoryListeners();
    attachFormListeners();
    selectEnterprise(S.enterprises[0]);
  } else {
    // Multiple enterprises — render card selector
    const listEl=$e('ent-selector-list');
    if(listEl){
      listEl.innerHTML='';
      S.enterprises.forEach(function(ent){
        const btn=document.createElement('button');
        btn.className='fxv2-btn fxv2-btn-ghost';
        btn.style.cssText='display:block;width:100%;margin-bottom:8px;text-align:left';
        btn.setAttribute('role','listitem');
        btn.textContent=ent.name+' — '+formatRole(ent.role);
        btn.addEventListener('click',function(){
          showApp();
          attachNavListeners();
          attachRequestsListeners();
          attachHistoryListeners();
          attachFormListeners();
          selectEnterprise(ent);
        });
        listEl.appendChild(btn);
      });
    }
    showGate('ent-selector');
  }
}

// ── Polling
function startPolling() {
  stopPolling();
  S.pollTimer = setInterval(async function() {
    if(S.isPolling) return;
    S.isPolling = true;
    try { await refreshPolled(); }
    finally { S.isPolling=false; }
  }, POLL_INTERVAL);
}
function stopPolling() {
  if(S.pollTimer){ clearInterval(S.pollTimer); S.pollTimer=null; }
  S.isPolling=false;
}
async function refreshPolled() {
  if(!S.activeEnterprise) return;
  await refreshKpis();
  renderNavBadge();
  if(S.activeSection==='requests') await silentRefreshRequests();
  if(S.activeSection==='overview') await loadOverview();
}

// ── KPI fetch
async function refreshKpis() {
  if(!S.activeEnterprise) return;
  try {
    const thirtyDaysAgo = new Date(Date.now()-30*24*60*60*1000).toISOString();
    const { data, error } = await _sb
      .from('service_requests')
      .select('id, status, enterprise_request_context!inner(enterprise_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .gte('created_at', thirtyDaysAgo);
    if(error) throw error;
    const rows = data||[];
    S.kpis = {
      total:   rows.length,
      action:  rows.filter(function(r){ return r.status==='completed'; }).length,
      active:  rows.filter(function(r){ return r.status==='in_progress'; }).length,
      pending: rows.filter(function(r){ return r.status==='new'; }).length,
      done:    rows.filter(function(r){ return r.status==='completed'||r.status==='validated'; }).length,
      nomatch: rows.filter(function(r){ return r.status==='no_match'; }).length,
    };
  } catch(_){ /* silent */ }
}

function renderNavBadge() {
  // HTML badges: nav-badge-overview (sidebar) + nav-badge-requests (sidebar)
  ['nav-badge-overview','nav-badge-requests'].forEach(function(bid){
    const badge=$e(bid);
    if(!badge) return;
    const n=S.kpis.action;
    if(n>0){ badge.textContent=n>99?'99+':String(n); badge.hidden=false; badge.style.display=''; }
    else   { badge.hidden=true; badge.style.display='none'; }
  });
}

// ── Overview
async function loadOverview() {
  if(!S.activeEnterprise) return;
  if(!S.sitesLoaded) await fetchSites();
  await refreshKpis();
  renderKpis();
  renderNavBadge();
  try {
    const { data, error } = await _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(10);
    if(error) throw error;
    const rows = data||[];
    renderActionRequired(rows);
    renderRecentList(rows);
    renderRafiOps(rows);
  } catch(err) {
    console.warn('[overview]', err.message);
  }
  renderSitesSnap();
  updateOverviewRefreshHint();
}

function updateOverviewRefreshHint() {
  const el=$e('ov-refresh-hint');
  if(!el) return;
  const now = new Date();
  el.textContent = 'Mis à jour à ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}

function renderKpis() {
  const k=S.kpis;
  setText('kpi-total',   k.total);
  setText('kpi-action',  k.action);
  setText('kpi-active',  k.active);
  setText('kpi-pending', k.pending);
  setText('kpi-done',    k.done);
  setText('kpi-nomatch', k.nomatch);
  // Strip loading class
  ['kpi-total','kpi-action','kpi-active','kpi-pending','kpi-done','kpi-nomatch'].forEach(function(id){
    const el=$e(id); if(el) el.classList.remove('loading');
  });
}

function renderActionRequired(rows) {
  const block   = $e('ov-action-required');
  const cntEl   = $e('ov-ar-count');
  const listEl  = $e('ov-ar-items');
  if(!block||!listEl) return;
  const actionable = rows.filter(function(r){ return r.status==='completed'; });
  if(!actionable.length){ block.style.display='none'; return; }
  block.style.display='';
  if(cntEl) cntEl.textContent = actionable.length;
  listEl.innerHTML='';
  actionable.forEach(function(r){
    const siteName = getSiteName(r.enterprise_site_id);
    const div = document.createElement('div');
    div.className='ent-ar-item';
    div.setAttribute('role','listitem');
    div.setAttribute('tabindex','0');
    div.setAttribute('data-request-id', r.id);
    div.innerHTML =
      '<span class="ent-ar-cat">'+safeHtml(r.category||'—')+'</span>'+
      '<span class="ent-ar-site">'+safeHtml(siteName)+'</span>'+
      '<span class="ent-ar-cta">Valider →</span>';
    div.addEventListener('click', function(){ navigateTo('request-detail',{requestId:r.id}); });
    div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
    listEl.appendChild(div);
  });
}

function renderRecentList(rows) {
  const listEl  = $e('ov-recent-list');
  const emptyEl = $e('ov-recent-empty');
  if(!listEl) return;
  if(!rows.length){
    listEl.innerHTML=''; listEl.style.display='none';
    if(emptyEl){ emptyEl.style.display=''; }
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  listEl.style.display='';
  listEl.innerHTML='';
  rows.slice(0,6).forEach(function(r){
    const siteName = getSiteName(r.enterprise_site_id);
    const date     = r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '—';
    const div = document.createElement('div');
    div.className='ent-req-card';
    div.setAttribute('role','listitem');
    div.setAttribute('tabindex','0');
    div.setAttribute('data-request-id',r.id);
    div.innerHTML =
      '<div class="ent-req-top">'+
        '<span class="ent-req-cat">'+safeHtml(r.category||'—')+'</span>'+
        '<span class="ent-status-badge ent-status-'+safeHtml(r.status)+'">'+safeHtml(formatStatus(r.status))+'</span>'+
      '</div>'+
      '<div class="ent-req-meta">'+
        '<span class="ent-req-site">'+safeHtml(siteName)+'</span>'+
        '<span class="ent-req-date">'+safeHtml(date)+'</span>'+
      '</div>';
    div.addEventListener('click', function(){ navigateTo('request-detail',{requestId:r.id}); });
    div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
    listEl.appendChild(div);
  });
}

function renderSitesSnap() {
  const el      = $e('ov-sites-snap');
  const emptyEl = $e('ov-sites-empty');
  if(!el) return;
  if(!S.sites.length){
    el.innerHTML='';
    if(emptyEl){ emptyEl.style.display=''; }
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  el.innerHTML='';
  S.sites.slice(0,4).forEach(function(s){
    const div = document.createElement('div');
    div.className='ent-site-snap';
    div.setAttribute('tabindex','0');
    div.setAttribute('role','button');
    div.setAttribute('data-site-id',s.id);
    div.innerHTML =
      '<span class="ent-site-snap-name">'+safeHtml(s.name)+'</span>'+
      (s.city?'<span class="ent-site-snap-city">'+safeHtml(s.city)+'</span>':'');
    div.addEventListener('click', function(){ navigateTo('site-detail',{siteId:s.id}); });
    div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
    el.appendChild(div);
  });
}

function renderRafiOps(rows) {
  const block  = $e('ov-rafi-summary');
  const tsEl   = $e('ov-rafi-ts');
  const linesEl= $e('ov-rafi-lines');
  if(!block||!linesEl) return;
  if(!rows.length){ block.style.display='none'; return; }
  block.style.display='';
  if(tsEl) tsEl.textContent = new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const action  = rows.filter(function(r){ return r.status==='completed'; }).length;
  const inprog  = rows.filter(function(r){ return r.status==='in_progress'; }).length;
  const newC    = rows.filter(function(r){ return r.status==='new'; }).length;
  const nomatch = rows.filter(function(r){ return r.status==='no_match'; }).length;
  const lines=[];
  if(action>0)  lines.push({ icon:'🔴', text: action+' intervention'+(action>1?'s':'')+' terminée'+(action>1?'s':'')+' attendant validation.' });
  if(inprog>0)  lines.push({ icon:'🟡', text: inprog+' en cours de traitement.' });
  if(newC>0)    lines.push({ icon:'🔵', text: newC+' nouvelle'+(newC>1?'s':'')+' demande'+(newC>1?'s':'')+' en attente d\'attribution.' });
  if(nomatch>0) lines.push({ icon:'⚪', text: nomatch+' sans artisan disponible.' });
  if(!lines.length) lines.push({ icon:'✅', text: 'Toutes les interventions récentes sont clôturées.' });
  linesEl.innerHTML='';
  lines.forEach(function(l){
    const p=document.createElement('p');
    p.className='ent-rafi-ops-line';
    p.innerHTML='<span class="ent-rafi-icon" aria-hidden="true">'+safeHtml(l.icon)+'</span> '+safeHtml(l.text);
    linesEl.appendChild(p);
  });
}

// ── Formatting helpers
function formatStatus(status) {
  return ({
    new:'Nouvelle', in_progress:'En cours', completed:'Terminée',
    validated:'Validée', cancelled:'Annulée', no_match:'Sans suite'
  })[status]||status;
}
function formatUrgency(urgency) {
  return ({ low:'Faible', normal:'Normale', high:'Haute', critical:'Critique' })[urgency]||urgency;
}
function getSiteName(siteId) {
  if(!siteId) return '—';
  const s=S.sites.find(function(x){ return x.id===siteId; });
  return s?s.name:siteId;
}

// ── Sites cache
async function fetchSites() {
  if(!S.activeEnterprise) return;
  try {
    const { data, error } = await _sb
      .from('enterprise_sites')
      .select('id, name, address, city')
      .eq('enterprise_id', S.activeEnterprise.id)
      .order('name');
    if(error) throw error;
    S.sites = data||[];
    S.sitesLoaded = true;
    populateSiteFilters();
  } catch(err){ console.warn('[fetchSites]',err.message); }
}

function populateSiteFilters() {
  ['filter-site','hist-filter-site','req-site'].forEach(function(id){
    const sel=$e(id);
    if(!sel) return;
    const cur=sel.value;
    while(sel.options.length>1) sel.remove(1);
    S.sites.forEach(function(s){
      const opt=document.createElement('option');
      opt.value=s.id; opt.textContent=s.name;
      sel.appendChild(opt);
    });
    if(cur) sel.value=cur;
  });
}

// ── Auth state listener
function attachAuthListener() {
  _sb.auth.onAuthStateChange(function(event) {
    if(event==='SIGNED_OUT'){ stopPolling(); window.location.href='/'; }
  });
}


/* ============================================================
   Part 2: requests / request-detail / new-request / sites / site-detail
   ============================================================ */

// ── Requests list listeners (idempotent)
let _reqAttached = false;
function attachRequestsListeners() {
  if(_reqAttached) return;
  _reqAttached = true;

  // Status tabs
  document.querySelectorAll('.ent-status-tab[data-status-tab]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const val = btn.dataset.statusTab||'all';
      S.reqStatusFilter = val;
      document.querySelectorAll('.ent-status-tab[data-status-tab]').forEach(function(b){
        b.classList.toggle('active', b.dataset.statusTab===val);
        b.setAttribute('aria-selected', b.dataset.statusTab===val?'true':'false');
      });
      loadRequests(true);
    });
  });

  // Search (debounced 400 ms)
  const searchEl = $e('req-search');
  if(searchEl){
    searchEl.addEventListener('input', function(){
      clearTimeout(S.searchDebounceTimer);
      S.searchDebounceTimer = setTimeout(function(){
        S.reqSearchQuery = searchEl.value.trim();
        loadRequests(true);
      }, 400);
    });
  }

  // Site filter
  const siteFilter = $e('filter-site');
  if(siteFilter){
    siteFilter.addEventListener('change', function(){
      S.reqSiteFilter = siteFilter.value;
      updateFilterResetBtn();
      loadRequests(true);
    });
  }

  // Urgency filter
  const urgFilter = $e('filter-urgency');
  if(urgFilter){
    urgFilter.addEventListener('change', function(){
      S.reqUrgencyFilter = urgFilter.value;
      updateFilterResetBtn();
      loadRequests(true);
    });
  }

  // Filter reset
  const resetBtn = $e('filter-reset');
  if(resetBtn){
    resetBtn.addEventListener('click', function(){
      S.reqSiteFilter=''; S.reqUrgencyFilter=''; S.reqSearchQuery='';
      const sf=$e('filter-site'); if(sf) sf.value='';
      const uf=$e('filter-urgency'); if(uf) uf.value='';
      const sq=$e('req-search'); if(sq) sq.value='';
      updateFilterResetBtn();
      loadRequests(true);
    });
  }

  // Load more
  const loadMoreBtn = $e('load-more-btn');
  if(loadMoreBtn){
    loadMoreBtn.addEventListener('click', function(){
      loadRequests(false);
    });
  }

  // Retry
  const retryBtn = $e('requests-retry-btn');
  if(retryBtn){
    retryBtn.addEventListener('click', function(){
      loadRequests(true);
    });
  }
}

function updateFilterResetBtn() {
  const btn=$e('filter-reset');
  if(!btn) return;
  const active = S.reqSiteFilter||S.reqUrgencyFilter;
  btn.style.display = active?'':'none';
}

// ── Load requests (paginated with composite cursor)
async function loadRequests(reset) {
  if(!S.activeEnterprise) return;
  if(reset){
    S.requests=[]; S.requestCursor=null; S.requestsExhausted=false;
  }
  if(S.requestsExhausted&&!reset) return;

  const listEl     = $e('requests-list');
  const emptyEl    = $e('requests-empty');
  const errorEl    = $e('requests-error');
  const errorMsgEl = $e('requests-error-msg');
  const loadWrap   = $e('load-more-wrap');

  if(reset&&listEl){
    listEl.innerHTML='<div class="fxv2-skeleton-card" role="listitem"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div></div>';
  }
  if(errorEl) errorEl.style.display='none';
  if(emptyEl) emptyEl.style.display='none';

  // Build status list from current filter
  const DONE_STATUSES = ['completed','validated','cancelled','no_match'];
  let statuses=null;
  switch(S.reqStatusFilter){
    case 'active':    statuses=['new','in_progress']; break;
    case 'pending':   statuses=['new']; break;
    case 'validated': statuses=['validated']; break;
    default:          statuses=null; // all
  }

  try {
    let q = _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(PAGE_SIZE+1);

    if(statuses) q=q.in('status', statuses);
    if(S.reqSiteFilter) q=q.eq('enterprise_site_id', S.reqSiteFilter);
    if(S.reqUrgencyFilter) q=q.eq('urgency', S.reqUrgencyFilter);

    // Composite cursor
    if(S.requestCursor){
      q=q.or('created_at.lt.'+S.requestCursor.lastCreatedAt+',and(created_at.eq.'+S.requestCursor.lastCreatedAt+',id.lt.'+S.requestCursor.lastId+')');
    }

    const { data, error } = await q;
    if(error) throw error;
    const rows = data||[];
    const hasMore = rows.length>PAGE_SIZE;
    const page = hasMore?rows.slice(0,PAGE_SIZE):rows;

    // Dedupe
    const existing = new Set(S.requests.map(function(r){ return r.id; }));
    const fresh = page.filter(function(r){ return !existing.has(r.id); });

    // Client-side search filter
    let filtered = fresh;
    if(S.reqSearchQuery){
      const q2=S.reqSearchQuery.toLowerCase();
      filtered=fresh.filter(function(r){
        return (r.category&&r.category.toLowerCase().includes(q2))||
               (r.description&&r.description.toLowerCase().includes(q2));
      });
    }

    if(reset) S.requests=filtered;
    else S.requests=S.requests.concat(filtered);

    if(page.length>0){
      const last=page[page.length-1];
      S.requestCursor={ lastCreatedAt:last.created_at, lastId:last.id };
    }
    S.requestsExhausted = !hasMore;

    renderRequestsList(reset);
    if(loadWrap) loadWrap.style.display = (!S.requestsExhausted&&S.requests.length>=PAGE_SIZE)?'':'none';

  } catch(err){
    if(errorEl){ errorEl.style.display=''; }
    if(errorMsgEl){ errorMsgEl.textContent=err.message||'Erreur de chargement.'; }
  }
}

async function silentRefreshRequests() {
  if(!S.activeEnterprise) return;
  const saved=S.requestCursor;
  S.requestCursor=null;
  let q = _sb
    .from('service_requests')
    .select('id, status, category, urgency, description, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
    .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
    .order('created_at',{ ascending:false })
    .order('id',{ ascending:false })
    .limit(PAGE_SIZE);
  try {
    const { data } = await q;
    const rows=data||[];
    const existing=new Set(S.requests.map(function(r){ return r.id; }));
    const fresh=rows.filter(function(r){ return !existing.has(r.id); });
    if(fresh.length){
      S.requests=fresh.concat(S.requests).slice(0,S.requests.length+fresh.length);
      renderRequestsList(false);
    }
    // Update status for existing
    rows.forEach(function(nr){
      const idx=S.requests.findIndex(function(r){ return r.id===nr.id; });
      if(idx>=0) S.requests[idx]=nr;
    });
    renderRequestsList(false);
  } catch(_){
    S.requestCursor=saved;
  }
}

function renderRequestsList(reset) {
  const listEl  = $e('requests-list');
  const emptyEl = $e('requests-empty');
  const subEl   = $e('requests-empty-sub');
  if(!listEl) return;

  if(!S.requests.length){
    listEl.innerHTML='';
    if(emptyEl){ emptyEl.style.display=''; }
    if(subEl){
      subEl.textContent = S.reqStatusFilter!=='all'
        ? 'Aucune demande dans ce statut.'
        : 'Créez votre première demande pour démarrer.';
    }
    return;
  }
  if(emptyEl) emptyEl.style.display='none';

  if(reset) listEl.innerHTML='';
  S.requests.forEach(function(r){
    if(listEl.querySelector('[data-request-id="'+r.id+'"]')) return;
    listEl.appendChild(buildRequestCard(r));
  });
}

function buildRequestCard(r) {
  const siteName = getSiteName(r.enterprise_site_id);
  const date = r.created_at?new Date(r.created_at).toLocaleDateString('fr-FR'):'—';
  const div=document.createElement('div');
  div.className='ent-req-card';
  div.setAttribute('role','listitem');
  div.setAttribute('tabindex','0');
  div.setAttribute('data-request-id',r.id);
  div.innerHTML =
    '<div class="ent-req-top">'+
      '<span class="ent-req-cat">'+safeHtml(r.category||'—')+'</span>'+
      '<span class="ent-status-badge ent-status-'+safeHtml(r.status)+'">'+safeHtml(formatStatus(r.status))+'</span>'+
    '</div>'+
    '<div class="ent-req-meta">'+
      '<span class="ent-req-site">'+safeHtml(siteName)+'</span>'+
      '<span class="ent-req-urgency ent-urg-'+safeHtml(r.urgency||'normal')+'">'+safeHtml(formatUrgency(r.urgency||'normal'))+'</span>'+
      '<span class="ent-req-date">'+safeHtml(date)+'</span>'+
    '</div>'+
    (r.description?'<p class="ent-req-desc">'+safeHtml(r.description.substring(0,120))+(r.description.length>120?'…':'')+'</p>':'');
  div.addEventListener('click', function(){ navigateTo('request-detail',{requestId:r.id}); });
  div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
  return div;
}

// ── Request detail
async function loadDetail(requestId) {
  if(!requestId) return;
  const contentEl = $e('request-detail-content');
  if(!contentEl) return;
  contentEl.innerHTML='<div class="fxv2-skeleton-card"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div><div class="fxv2-skel fxv2-skel-line"></div></div>';

  // Check dialog vs inline section (use inline section always on mobile)
  try {
    const { data, error } = await _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
      .eq('id', requestId)
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .single();
    if(error) throw error;
    S.detailRequest = data;
    renderDetailContent(data, contentEl);
    setText('detail-back-title', data.category||'Intervention');
    // Also populate dialog if it exists (desktop)
    openDetailDialog(data);
  } catch(err){
    contentEl.innerHTML='<div class="ent-error"><span>⚠️ '+safeHtml(err.message)+'</span></div>';
  }
}

function renderDetailContent(r, container) {
  const siteName = getSiteName(r.enterprise_site_id);
  const date = r.created_at?new Date(r.created_at).toLocaleString('fr-FR'):'—';
  container.innerHTML =
    '<div class="ent-detail-section">'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Catégorie</span><span class="ent-detail-val">'+safeHtml(r.category||'—')+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Site</span><span class="ent-detail-val">'+safeHtml(siteName)+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Urgence</span><span class="ent-detail-val ent-urg-'+safeHtml(r.urgency||'normal')+'">'+safeHtml(formatUrgency(r.urgency||'normal'))+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Statut</span><span class="ent-status-badge ent-status-'+safeHtml(r.status)+'">'+safeHtml(formatStatus(r.status))+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Créée le</span><span class="ent-detail-val">'+safeHtml(date)+'</span></div>'+
    '</div>'+
    (r.description?
      '<div class="ent-detail-section"><h3 class="ent-detail-sub">Description</h3><p class="ent-detail-desc">'+safeHtml(r.description)+'</p></div>':'')+
    '<div id="ent-mission-block" class="ent-detail-section" style="display:none"></div>'+
    (r.status==='completed'&&canConfirm(S.userRole)?
      '<div class="ent-detail-actions">'+
        '<button class="fxv2-btn fxv2-btn-primary" id="ent-confirm-btn" data-request-id="'+safeHtml(r.id)+'">'+
          '<span id="ent-confirm-text">✅ Valider l\'intervention</span>'+
          '<span id="ent-confirm-spinner" class="ent-btn-spinner" style="display:none" aria-hidden="true"></span>'+
        '</button>'+
        '<div class="ent-form-error" id="ent-confirm-error" style="display:none" role="alert" aria-live="assertive"></div>'+
      '</div>':'');

  // Wire confirm btn
  const confirmBtn = container.querySelector('#ent-confirm-btn');
  if(confirmBtn){
    confirmBtn.addEventListener('click', function(){
      confirmMission(r.id);
    });
  }

  // Load mission block async
  loadDetailMission(r.id, container);
}

async function loadDetailMission(requestId, container) {
  try {
    const { data, error } = await _sb
      .from('missions')
      .select('id, status, artisan_id, started_at, completed_at')
      .eq('service_request_id', requestId)
      .order('created_at',{ ascending:false })
      .limit(1)
      .maybeSingle();
    if(error) throw error;
    if(!data) return;
    S.detailMission = data;
    const missionBlock = container.querySelector('#ent-mission-block');
    if(!missionBlock) return;
    missionBlock.style.display='';
    missionBlock.innerHTML =
      '<h3 class="ent-detail-sub">Mission</h3>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Statut mission</span><span class="ent-status-badge ent-status-'+safeHtml(data.status)+'">'+safeHtml(formatStatus(data.status))+'</span></div>'+
      (data.completed_at?'<div class="ent-detail-row"><span class="ent-detail-label">Terminée le</span><span class="ent-detail-val">'+safeHtml(new Date(data.completed_at).toLocaleString('fr-FR'))+'</span></div>':'');
  } catch(_){/* mission optional */ }
}

// ── Confirm completed mission (role-gated)
async function confirmMission(requestId) {
  if(S.confirmSubmitting) return;
  if(!canConfirm(S.userRole)) return;
  S.confirmSubmitting = true;

  const btn    = document.querySelector('#ent-confirm-btn');
  const spinner= document.querySelector('#ent-confirm-spinner');
  const text   = document.querySelector('#ent-confirm-text');
  const errEl  = document.querySelector('#ent-confirm-error');

  if(btn) btn.disabled=true;
  if(spinner) spinner.style.display='';
  if(text) text.style.display='none';
  if(errEl) errEl.style.display='none';

  try {
    const { error } = await _sb.rpc('confirm_completed_mission',{ p_request_id: requestId });
    if(error) throw error;
    // Success — reload detail
    S.confirmSubmitting=false;
    await loadDetail(requestId);
    await refreshKpis();
    renderNavBadge();
  } catch(err){
    S.confirmSubmitting=false;
    if(btn){ btn.disabled=false; }
    if(spinner) spinner.style.display='none';
    if(text) text.style.display='';
    if(errEl){ errEl.textContent=err.message||'Erreur lors de la validation.'; errEl.style.display=''; }
  }
}

// ── Request detail dialog (desktop accessible modal)
function openDetailDialog(r) {
  const dialog  = $e('ent-detail-dialog');
  const bodyEl  = $e('ent-dialog-body');
  const titleEl = $e('ent-dialog-title');
  if(!dialog||!bodyEl) return;
  if(titleEl) titleEl.textContent=r.category||'Intervention';

  const clone=document.createElement('div');
  renderDetailContent(r, clone);
  bodyEl.innerHTML='';
  while(clone.firstChild) bodyEl.appendChild(clone.firstChild);

  dialog.style.display='';
  dialog.removeAttribute('hidden');

  // Close
  const closeBtn = $e('ent-dialog-close');
  const backdrop = $e('ent-dialog-backdrop');
  function closeDialog() { dialog.style.display='none'; }
  if(closeBtn){ closeBtn.onclick=closeDialog; }
  if(backdrop){ backdrop.onclick=closeDialog; }
  dialog.onkeydown=function(e){ if(e.key==='Escape') closeDialog(); };
}

// ── Sites section
async function loadSites() {
  if(!S.activeEnterprise) return;

  const listEl  = $e('sites-list');
  const emptyEl = $e('sites-empty');
  const errEl   = $e('sites-error');
  const errMsgEl= $e('sites-error-msg');
  if(!listEl) return;
  if(errEl) errEl.style.display='none';

  if(!S.sitesLoaded) {
    try {
      await fetchSites();
    } catch(err) {
      if(errEl){ errEl.style.display=''; }
      if(errMsgEl){ errMsgEl.textContent=err.message||'Erreur de chargement des sites.'; }
      return;
    }
  }

  if(!S.sites.length){
    listEl.innerHTML='';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  listEl.innerHTML='';
  S.sites.forEach(function(s){
    listEl.appendChild(buildSiteCard(s));
  });

  // Retry
  const retryBtn=$e('sites-retry-btn');
  if(retryBtn){
    retryBtn.onclick=function(){ loadSites(); };
  }
}

function buildSiteCard(s) {
  const div=document.createElement('div');
  div.className='ent-site-card';
  div.setAttribute('role','listitem');
  div.setAttribute('tabindex','0');
  div.setAttribute('data-site-id',s.id);
  div.innerHTML =
    '<div class="ent-site-name">'+safeHtml(s.name)+'</div>'+
    (s.address?'<div class="ent-site-address">'+safeHtml(s.address)+(s.city?', '+safeHtml(s.city):'')+'</div>':'')+
    '<div class="ent-site-link">Voir le détail →</div>';
  div.addEventListener('click', function(){ navigateTo('site-detail',{siteId:s.id}); });
  div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
  return div;
}

// ── Site detail
async function loadSiteDetail(siteId) {
  if(!siteId) return;
  const contentEl = $e('site-detail-content');
  if(!contentEl) return;
  contentEl.innerHTML='<div class="fxv2-skeleton-card"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div></div>';

  const site = S.sites.find(function(s){ return s.id===siteId; });
  if(!site){ contentEl.innerHTML='<p class="ent-error">Site introuvable.</p>'; return; }

  setText('site-detail-back-title', site.name);

  try {
    const { data, error } = await _sb
      .from('service_requests')
      .select('id, status, category, urgency, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .eq('enterprise_site_id', siteId)
      .in('status',['new','in_progress','completed'])
      .order('created_at',{ ascending:false })
      .limit(20);
    if(error) throw error;
    const reqs=data||[];
    renderSiteDetail(site, reqs, contentEl);
  } catch(err){
    contentEl.innerHTML='<div class="ent-error"><span>⚠️ '+safeHtml(err.message)+'</span></div>';
  }
}

function renderSiteDetail(site, reqs, container) {
  const actionC  = reqs.filter(function(r){ return r.status==='completed'; }).length;
  const openC    = reqs.filter(function(r){ return r.status==='new'||r.status==='in_progress'; }).length;

  let html=
    '<div class="ent-detail-section">'+
      '<div class="ent-detail-row"><span class="ent-detail-label">Site</span><span class="ent-detail-val">'+safeHtml(site.name)+'</span></div>'+
      (site.address?'<div class="ent-detail-row"><span class="ent-detail-label">Adresse</span><span class="ent-detail-val">'+safeHtml(site.address+(site.city?', '+site.city:''))+'</span></div>':'')+
      '<div class="ent-detail-row"><span class="ent-detail-label">En cours</span><span class="ent-detail-val">'+safeHtml(String(openC))+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-label">À valider</span><span class="ent-detail-val">'+safeHtml(String(actionC))+'</span></div>'+
    '</div>';

  if(canCreate(S.userRole)){
    html+='<div class="ent-detail-actions">'+
      '<button class="fxv2-btn fxv2-btn-primary" id="site-detail-new-btn">➕ Nouvelle demande pour ce site</button>'+
    '</div>';
  }

  if(reqs.length){
    html+='<div class="ent-detail-section"><h3 class="ent-detail-sub">Interventions actives</h3><div id="site-detail-req-list" class="fxv2-card-list" role="list"></div></div>';
  }

  container.innerHTML=html;

  const newBtn=container.querySelector('#site-detail-new-btn');
  if(newBtn) newBtn.addEventListener('click', function(){ navigateTo('new-request',{prefillSiteId:site.id}); });

  const reqListEl=container.querySelector('#site-detail-req-list');
  if(reqListEl){
    reqs.forEach(function(r){ reqListEl.appendChild(buildRequestCard(r)); });
  }
}


/* ============================================================
   Part 3: members / history / account / new-request form / init
   ============================================================ */

// ── Members
async function loadMembers() {
  if(!S.activeEnterprise) return;

  const roleGate = $e('members-role-gate');
  const listEl   = $e('members-list');
  const emptyEl  = $e('members-empty');
  const errEl    = $e('members-error');
  const errMsgEl = $e('members-error-msg');
  const retryBtn = $e('members-retry-btn');

  // viewer cannot see members
  if(S.userRole==='viewer'){
    if(roleGate) roleGate.style.display='';
    if(listEl)   listEl.style.display='none';
    if(emptyEl)  emptyEl.style.display='none';
    return;
  }
  if(roleGate) roleGate.style.display='none';

  if(listEl) listEl.innerHTML=
    '<div class="fxv2-skeleton-card" role="listitem"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div></div>'+
    '<div class="fxv2-skeleton-card" role="listitem"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div></div>';
  if(errEl) errEl.style.display='none';
  if(emptyEl) emptyEl.style.display='none';

  if(retryBtn) retryBtn.onclick=function(){ loadMembers(); };

  try {
    const { data, error } = await _sb
      .from('enterprise_members')
      .select('id, role, user_id, users!inner(email, full_name)')
      .eq('enterprise_id', S.activeEnterprise.id)
      .order('role');
    if(error) throw error;
    S.members=data||[];
    renderMembers(S.members, listEl, emptyEl);
  } catch(err){
    if(listEl) listEl.innerHTML='';
    if(errEl){ errEl.style.display=''; }
    if(errMsgEl){ errMsgEl.textContent=err.message||'Erreur de chargement.'; }
  }
}

function renderMembers(members, listEl, emptyEl) {
  if(!listEl) return;
  if(!members.length){
    listEl.innerHTML='';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  listEl.innerHTML='';
  members.forEach(function(m){
    const profile=m.users||{};
    const fullName=profile.full_name||profile.email||m.user_id;
    const div=document.createElement('div');
    div.className='ent-member-card';
    div.setAttribute('role','listitem');
    div.innerHTML=
      '<div class="ent-member-name">'+safeHtml(fullName)+'</div>'+
      '<div class="ent-member-role">'+safeHtml(formatRole(m.role))+'</div>'+
      (profile.email?'<div class="ent-member-email">'+safeHtml(profile.email)+'</div>':'');
    listEl.appendChild(div);
  });
  // Show mutation note (read-only)
  const mutNote=$e('members-mutation-note');
  if(mutNote&&(S.userRole==='owner'||S.userRole==='admin')){
    mutNote.style.display=''; mutNote.removeAttribute('aria-hidden');
  }
}

// ── History section listeners (idempotent)
let _histAttached = false;
function attachHistoryListeners() {
  if(_histAttached) return;
  _histAttached = true;

  const siteFilter=$e('hist-filter-site');
  if(siteFilter) siteFilter.addEventListener('change', function(){
    S.histSiteFilter=siteFilter.value;
    updateHistResetBtn();
    loadHistory(true);
  });

  const statusFilter=$e('hist-filter-status');
  if(statusFilter) statusFilter.addEventListener('change', function(){
    S.histStatusFilter=statusFilter.value;
    updateHistResetBtn();
    loadHistory(true);
  });

  const resetBtn=$e('hist-reset');
  if(resetBtn) resetBtn.addEventListener('click', function(){
    S.histSiteFilter=''; S.histStatusFilter='';
    const sf=$e('hist-filter-site'); if(sf) sf.value='';
    const stf=$e('hist-filter-status'); if(stf) stf.value='';
    updateHistResetBtn();
    loadHistory(true);
  });

  const loadMoreBtn=$e('hist-load-more-btn');
  if(loadMoreBtn) loadMoreBtn.addEventListener('click', function(){ loadHistory(false); });

  const retryBtn=$e('history-retry-btn');
  if(retryBtn) retryBtn.addEventListener('click', function(){ loadHistory(true); });
}

function updateHistResetBtn() {
  const btn=$e('hist-reset');
  if(!btn) return;
  const active=S.histSiteFilter||S.histStatusFilter;
  btn.style.display=active?'':'none';
}

// ── Load history (completed / validated / cancelled / no_match)
async function loadHistory(reset) {
  if(!S.activeEnterprise) return;
  if(reset){
    S.history=[]; S.historyCursor=null; S.historyExhausted=false;
  }
  if(S.historyExhausted&&!reset) return;

  const listEl    = $e('history-list');
  const emptyEl   = $e('history-empty');
  const errEl     = $e('history-error');
  const errMsgEl  = $e('history-error-msg');
  const loadWrap  = $e('hist-load-more-wrap');

  if(reset&&listEl) listEl.innerHTML=
    '<div class="fxv2-skeleton-card" role="listitem"><div class="fxv2-skel fxv2-skel-title"></div><div class="fxv2-skel fxv2-skel-line"></div></div>';
  if(errEl) errEl.style.display='none';
  if(emptyEl) emptyEl.style.display='none';

  const HIST_STATUSES = S.histStatusFilter
    ? [S.histStatusFilter]
    : ['completed','validated','cancelled','no_match'];

  try {
    let q=_sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_site_id, enterprise_request_context!inner(enterprise_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .in('status', HIST_STATUSES)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(PAGE_SIZE+1);

    if(S.histSiteFilter) q=q.eq('enterprise_site_id', S.histSiteFilter);

    if(S.historyCursor){
      q=q.or('created_at.lt.'+S.historyCursor.lastCreatedAt+',and(created_at.eq.'+S.historyCursor.lastCreatedAt+',id.lt.'+S.historyCursor.lastId+')');
    }

    const { data, error }=await q;
    if(error) throw error;
    const rows=data||[];
    const hasMore=rows.length>PAGE_SIZE;
    const page=hasMore?rows.slice(0,PAGE_SIZE):rows;

    const existing=new Set(S.history.map(function(r){ return r.id; }));
    const fresh=page.filter(function(r){ return !existing.has(r.id); });

    if(reset) S.history=fresh;
    else S.history=S.history.concat(fresh);

    if(page.length>0){
      const last=page[page.length-1];
      S.historyCursor={ lastCreatedAt:last.created_at, lastId:last.id };
    }
    S.historyExhausted=!hasMore;

    renderHistoryList(reset, listEl, emptyEl);
    if(loadWrap) loadWrap.style.display=(!S.historyExhausted&&S.history.length>=PAGE_SIZE)?'':'none';

  } catch(err){
    if(listEl) listEl.innerHTML='';
    if(errEl){ errEl.style.display=''; }
    if(errMsgEl){ errMsgEl.textContent=err.message||'Erreur de chargement.'; }
  }
}

function renderHistoryList(reset, listEl, emptyEl) {
  if(!listEl) return;
  if(!S.history.length){
    listEl.innerHTML='';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  if(reset) listEl.innerHTML='';
  S.history.forEach(function(r){
    if(listEl.querySelector('[data-request-id="'+r.id+'"]')) return;
    listEl.appendChild(buildRequestCard(r));
  });
}

// ── Account section
function renderAccount() {
  if(!S.activeEnterprise) return;
  const contentEl=$e('account-content');
  if(!contentEl) return;
  contentEl.innerHTML=
    '<div class="ent-account-block">'+
      '<div class="ent-account-row"><span class="ent-account-label">Organisation</span><span class="ent-account-val">'+safeHtml(S.activeEnterprise.name)+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Plan</span><span class="ent-account-val">'+safeHtml(S.activeEnterprise.plan||'—')+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Votre rôle</span><span class="ent-account-val">'+safeHtml(formatRole(S.userRole))+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Email</span><span class="ent-account-val">'+safeHtml(S.userEmail||'—')+'</span></div>'+
      (S.enterprises.length>1?
        '<div class="ent-account-row"><span class="ent-account-label">Espaces</span>'+
        '<span class="ent-account-val">'+S.enterprises.map(function(e){ return safeHtml(e.name); }).join(', ')+'</span></div>':'')+
    '</div>';
}

// ── New request form
let _formAttached = false;
function attachFormListeners() {
  if(_formAttached) return;
  _formAttached = true;

  const form     = $e('new-request-form');
  const catSel   = $e('req-category');
  const catOther = $e('req-category-other');
  const descTA   = $e('req-desc');
  const descChars= $e('desc-chars');
  const cancelBtn= $e('req-cancel-btn');
  const viewBtn  = $e('form-success-view');

  if(descTA&&descChars){
    descTA.addEventListener('input', function(){
      descChars.textContent=String(descTA.value.length);
    });
  }

  if(catSel&&catOther){
    catSel.addEventListener('change', function(){
      const isOther=catSel.value==='other';
      catOther.style.display=isOther?'':'none';
      if(isOther) catOther.focus();
      triggerRafiSuggestion();
    });
  }

  if(descTA){
    descTA.addEventListener('input', function(){
      clearTimeout(S.searchDebounceTimer);
      S.searchDebounceTimer=setTimeout(triggerRafiSuggestion, 600);
    });
  }

  if(cancelBtn){
    cancelBtn.addEventListener('click', function(){ navigateTo('requests'); });
  }

  if(viewBtn){
    viewBtn.addEventListener('click', function(){
      const id=viewBtn.dataset.requestId;
      if(id) navigateTo('request-detail',{requestId:id});
      else navigateTo('requests');
    });
  }

  if(form){
    form.addEventListener('submit', async function(evt){
      evt.preventDefault();
      if(S.formSubmitting) return;
      await submitNewRequest(form);
    });
  }

  // Urgency grid
  document.querySelectorAll('.ent-urgency-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.ent-urgency-btn').forEach(function(b){ b.classList.remove('selected'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('selected'); btn.setAttribute('aria-pressed','true');
    });
  });
}

function initNewRequestForm() {
  // Viewer cannot create
  const viewerNotice=$e('viewer-notice');
  const formWrap=$e('new-request-form-wrap');
  if(S.userRole==='viewer'){
    if(viewerNotice) viewerNotice.style.display='';
    if(formWrap) formWrap.style.display='none';
    return;
  }
  if(viewerNotice) viewerNotice.style.display='none';
  if(formWrap) formWrap.style.display='';

  // Reset form state
  const form=$e('new-request-form');
  if(form) form.reset();
  const successEl=$e('form-success');
  const errEl=$e('form-error');
  if(successEl) successEl.style.display='none';
  if(errEl) errEl.style.display='none';

  const descChars=$e('desc-chars');
  if(descChars) descChars.textContent='0';

  document.querySelectorAll('.ent-urgency-btn').forEach(function(b){ b.classList.remove('selected'); b.setAttribute('aria-pressed','false'); });
  // Default urgency: first button (data-value="") = normale
  const normalBtn=document.querySelector('.ent-urgency-btn[data-value=""]');
  if(normalBtn){ normalBtn.classList.add('selected'); normalBtn.setAttribute('aria-pressed','true'); }

  // Prefill site if coming from site-detail
  if(S.prefillSiteId){
    const siteSel=$e('req-site');
    if(siteSel) siteSel.value=S.prefillSiteId;
    const siteHint=$e('site-hint');
    const site=S.sites.find(function(s){ return s.id===S.prefillSiteId; });
    if(siteHint&&site) siteHint.textContent='Site sélectionné : '+site.name;
    S.prefillSiteId=null;
  }

  // Populate site select
  const siteSel=$e('req-site');
  if(siteSel){
    while(siteSel.options.length>1) siteSel.remove(1);
    S.sites.forEach(function(s){
      const opt=document.createElement('option');
      opt.value=s.id; opt.textContent=s.name;
      siteSel.appendChild(opt);
    });
  }
}

function triggerRafiSuggestion() {
  const hintEl=$e('rafi-form-hint');
  if(!hintEl) return;
  const catSel=$e('req-category');
  const descTA=$e('req-desc');
  const cat=catSel?catSel.value:'';
  const desc=descTA?descTA.value.trim():'';
  if(!cat&&!desc){ hintEl.style.display='none'; return; }
  // RAFI form hint — soft guidance only, no override
  let hint='';
  if(cat==='plumbing'||cat==='Plomberie') hint='💧 Précisez la localisation de la fuite et si l\'eau est coupée.';
  else if(cat==='electrical'||cat==='Électricité') hint='⚡ Précisez si une coupure de courant est présente et le tableau concerné.';
  else if(cat==='hvac'||cat==='CVC') hint='🌡️ Indiquez la température relevée et si le bâtiment est affecté.';
  else if(desc.length>30) hint='📋 Description suffisamment détaillée. Vérifiez l\'urgence.';
  if(hint){ hintEl.textContent=hint; hintEl.style.display=''; }
  else { hintEl.style.display='none'; }
}

async function submitNewRequest(form) {
  S.formSubmitting=true;
  const submitBtn  =$e('req-submit');
  const submitText =$e('req-submit-text');
  const submitSpin =$e('req-submit-spinner');
  const errEl      =$e('form-error');
  const successEl  =$e('form-success');

  if(submitBtn) submitBtn.disabled=true;
  if(submitSpin) submitSpin.style.display='';
  if(submitText) submitText.style.display='none';
  if(errEl){ errEl.textContent=''; errEl.style.display='none'; }
  if(successEl) successEl.style.display='none';

  // Validate
  const siteId   = ($e('req-site')||{}).value||'';
  const category = ($e('req-category')||{}).value||'';
  const catOther = ($e('req-category-other')||{}).value||'';
  const desc     = (($e('req-desc')||{}).value||'').trim();
  const _urgBtn  = document.querySelector('.ent-urgency-btn.selected');
  const urgency  = (_urgBtn&&_urgBtn.dataset.value!==undefined) ? (_urgBtn.dataset.value||'normale') : 'normale';

  const catFinal = category==='other'?(catOther.trim()||'other'):category;

  const catErrEl=$e('category-error');
  const descErrEl=$e('desc-error');
  if(catErrEl) catErrEl.textContent='';
  if(descErrEl) descErrEl.textContent='';

  let valid=true;
  if(!siteId){
    if(errEl){ errEl.textContent='Veuillez s\u00e9lectionner un site.'; errEl.style.display=''; }
    valid=false;
  }
  if(!catFinal){ if(catErrEl){ catErrEl.textContent='Veuillez s\u00e9lectionner une cat\u00e9gorie.'; } valid=false; }
  if(!desc||desc.length<10){ if(descErrEl){ descErrEl.textContent='La description doit comporter au moins 10 caract\u00e8res.'; } valid=false; }

  if(!valid){
    S.formSubmitting=false;
    if(submitBtn) submitBtn.disabled=false;
    if(submitSpin) submitSpin.style.display='none';
    if(submitText) submitText.style.display='';
    return;
  }

  try {
    const payload={
      p_enterprise_id:    S.activeEnterprise.id,
      p_site_id:          siteId||null,
      p_service_category: catFinal,
      p_description:      desc,
      p_urgency:          urgency,
    };
    const { data, error }=await _sb.rpc('create_enterprise_request', payload);
    if(error) throw error;
    // Handle business-logic errors: RPC returns {ok:false, reason:...}
    if(data&&data.ok===false){
      throw new Error(data.reason||'Erreur lors de la cr\u00e9ation.');
    }

    S.formSubmitting=false;
    if(submitBtn) submitBtn.disabled=false;
    if(submitSpin) submitSpin.style.display='none';
    if(submitText) submitText.style.display='';
    if(successEl){ successEl.style.display=''; }
    const viewBtn=$e('form-success-view');
    const newId=(data&&(data.id||data.request_id))||null;
    if(viewBtn&&newId){ viewBtn.dataset.requestId=newId; }
    form.reset();
    const descChars=$e('desc-chars'); if(descChars) descChars.textContent='0';
    await refreshKpis(); renderNavBadge();

  } catch(err){
    S.formSubmitting=false;
    if(submitBtn) submitBtn.disabled=false;
    if(submitSpin) submitSpin.style.display='none';
    if(submitText) submitText.style.display='';
    if(errEl){ errEl.textContent=err.message||'Erreur lors de la création.'; errEl.style.display=''; }
  }
}

// ── DOMContentLoaded bootstrap
document.addEventListener('DOMContentLoaded', function() {
  attachAuthListener();
  bootApp();
});
