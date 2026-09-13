/* ============================================================
   FIXEO BP05 V2 — enterprise-dashboard-v1.js
   Part 1: state / auth / navigation / overview
   ============================================================ */
'use strict';

// ── Supabase client
// BP09-FIX-01: window._supabase is never set by supabase-client.js (which exposes
// window.FixeoSupabaseClient.client). Use a lazy proxy so that _sb is resolved
// at call-time (inside async functions, after DOMContentLoaded + SDK load),
// not at parse time when the CDN SDK may not yet be loaded.
function _sbClient() {
  return window.FixeoSupabaseClient && window.FixeoSupabaseClient.client;
}
const _sb = new Proxy({}, {
  get: function(_t, prop) {
    const c = _sbClient();
    if (!c) {
      console.error('[enterprise-dashboard] Supabase client not ready (prop: ' + String(prop) + ')');
      // Minimal stub — prevents hard crashes; bootApp will show the error gate
      if (prop === 'auth') {
        return {
          getSession: async function() { return { data:{ session:null }, error: new Error('Supabase client not initialised') }; },
          onAuthStateChange: function() {},
          signOut: async function() { return {}; }
        };
      }
      if (prop === 'from') {
        return function() {
          var _stub = { select:function(){return _stub;}, eq:function(){return _stub;}, in:function(){return _stub;}, or:function(){return _stub;}, order:function(){return _stub;}, limit:function(){return _stub;}, gte:function(){return _stub;}, lte:function(){return _stub;}, single:function(){return _stub;}, maybeSingle:function(){return _stub;} };
          _stub.then = function(resolve) { return Promise.resolve({data:null,error:new Error('Supabase client not initialised')}).then(resolve); };
          return _stub;
        };
      }
      if (prop === 'rpc') {
        return async function() { return { data:null, error: new Error('Supabase client not initialised') }; };
      }
      return undefined;
    }
    const val = c[prop];
    return typeof val === 'function' ? val.bind(c) : val;
  }
});

// ── BP09 Observability — safe error normalization
// Strips Supabase/Postgres internals; maps known reason codes to user messages.
const _REASON_MSG = {
  unauthenticated:              'Session expirée. Veuillez vous reconnecter.',
  user_not_found:               'Utilisateur introuvable.',
  enterprise_required:          'Compte entreprise requis.',
  enterprise_not_found:         'Compte entreprise introuvable.',
  forbidden:                    'Accès refusé.',
  site_not_assigned:            'Ce site ne vous est pas assigné.',
  site_not_found:               'Site introuvable.',
  site_enterprise_mismatch:     'Le site n\'appartient pas à ce compte.',
  site_inactive:                'Ce site est inactif.',
  site_required:                'Veuillez sélectionner un site.',
  service_category_required:    'Veuillez sélectionner une catégorie.',
  description_required:         'La description est requise.',
  urgency_invalid:              'Niveau d\'urgence invalide.',
  request_not_found_or_not_owned: 'Demande introuvable ou accès refusé.',
  request_not_completed:        'Cette demande n\'est pas encore terminée.',
  completed_mission_not_found:  'Mission terminée introuvable.',
  mission_not_found:            'Mission introuvable.',
  atomicity_error:              'Erreur de synchronisation, veuillez réessayer.',
  internal_error:               'Erreur interne. Veuillez réessayer.',
  no_change:                    'Aucun changement.',
};
// Generates a short opaque correlation tag (no PII) for log correlation.
function _corrId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
}
// Normalize a backend error to a safe user-facing string.
// Never exposes raw SQL messages, JWT, or PII.
function _safeMsg(err, fallback) {
  if (!err) return fallback || 'Erreur inconnue.';
  // Supabase error objects can carry {message, details, hint, code}
  // Map known reason codes first (from RPC {ok:false,reason:...})
  if (err._reason && _REASON_MSG[err._reason]) return _REASON_MSG[err._reason];
  const msg = (typeof err === 'string') ? err : (err.message || '');
  // Block raw Postgres / Supabase internals
  if (/PGRST|column|relation|violates|constraint|syntax|unexpected/i.test(msg)) {
    return fallback || 'Erreur de chargement.';
  }
  // Allow through already-normalized messages
  if (msg && msg.length < 200) return msg;
  return fallback || 'Erreur de chargement.';
}
// Wrap an RPC {ok:false, reason:...} response as a normalized Error.
function _rpcErr(data, fallback) {
  const reason = (data && data.reason) || 'internal_error';
  const e = new Error(_REASON_MSG[reason] || fallback || 'Erreur lors de l\'opération.');
  e._reason = reason;
  return e;
}

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
  reqStatusFilter: 'all', reqSiteFilter: '', reqUrgencyFilter: '', reqSearchQuery: '', reqCategoryFilter: '', reqSortOrder: 'newest',
  savedViews: [],
  history: [], historyCursor: null, historyExhausted: false,
  histStatusFilter: '', histSiteFilter: '',
  members: [],
  memberAssignments: {},
  assignedSiteIds: [],
  kpis: { total:0, action:0, active:0, pending:0, done:0, nomatch:0 },
  pollTimer: null, isPolling: false,
  detailRequest: null, detailMission: null,
  formSubmitting: false, confirmSubmitting: false,
  searchDebounceTimer: null,
  searchOpen: false,
  searchQuery: '',
  cmdOpen: false,
  cmdQuery: '',
  cmdIndex: 0,
  lastFocusedElement: null,
  historyLoading: false,
  requestsLoading: false,
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

// ── Accessibility helpers (Workstream K)
function trapFocus(el) {
  const focusable = el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last  = focusable[focusable.length-1];
  function _handler(e) {
    if(e.key !== 'Tab') return;
    if(e.shiftKey) { if(document.activeElement===first){ e.preventDefault(); if(last) last.focus(); } }
    else           { if(document.activeElement===last) { e.preventDefault(); if(first) first.focus(); } }
  }
  el.addEventListener('keydown', _handler);
  return function releaseFocusTrap() {
    el.removeEventListener('keydown', _handler);
  };
}
function setLoading(sectionId, busy) {
  const el=$e(sectionId);
  if(el) el.setAttribute('aria-busy', busy?'true':'false');
}

// ── Gate helpers
// HTML IDs: ent-auth-gate | ent-access-denied | ent-selector | ent-dashboard
const GATES = ['ent-auth-gate','ent-access-denied','ent-selector','gate-accept-invitation'];
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
    if(!el) return;
    const isActive = s===name;
    el.hidden = !isActive;
    // Set explicit 'block' so the shared .fxv2-section{display:none} rule cannot
    // win when the inline style is cleared by setting it to ''.
    el.style.display = isActive ? 'block' : 'none';
  });
  // Bottom nav & sidebar nav active state
  document.querySelectorAll('[data-section]').forEach(btn => {
    const sec = btn.dataset.section;
    const match = sec===name
      ||(sec==='requests'&&(name==='request-detail'||name==='new-request'))
      ||(sec==='sites'&&name==='site-detail');
    btn.classList.toggle('active', match);
    if(btn.id&&btn.id.startsWith('bnav-')) btn.setAttribute('aria-current', match?'page':'');
  });
  // Sync sidebar nav links aria-current
  document.querySelectorAll('.fxv2-nav-link[data-section]').forEach(btn => {
    const sec = btn.dataset.section;
    const match = sec===name
      ||(sec==='requests'&&(name==='request-detail'||name==='new-request'))
      ||(sec==='sites'&&name==='site-detail');
    btn.setAttribute('aria-current', match?'page':'false');
  });
  // Auto-close mobile sidebar after navigation
  _closeSidebar();
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
    case 'ops':             populateOpsSiteFilter(); initOpsCommandCenter(); loadOpsQueue(true); refreshOpsKpis(); break;
  }
  pushNavState(section, ctx);
}

// Expose globally for inline onclick attributes in HTML
window.EntDashboard = { goTo: function(sec,ctx){ navigateTo(sec,ctx); } };

// ── Mobile sidebar helpers
function _openSidebar() {
  const sidebar  = $e('ent-sidebar');
  const overlay  = $e('ent-overlay');
  const hamburger= $e('ent-hamburger');
  if(sidebar){ sidebar.classList.add('open'); sidebar.setAttribute('aria-hidden','false'); }
  if(overlay){ overlay.classList.add('show'); }
  if(hamburger){ hamburger.classList.add('open'); hamburger.setAttribute('aria-expanded','true'); }
  document.body.style.overflow='hidden';
}
function _closeSidebar() {
  const sidebar  = $e('ent-sidebar');
  const overlay  = $e('ent-overlay');
  const hamburger= $e('ent-hamburger');
  if(sidebar){ sidebar.classList.remove('open'); sidebar.setAttribute('aria-hidden','true'); }
  if(overlay){ overlay.classList.remove('show'); }
  if(hamburger){ hamburger.classList.remove('open'); hamburger.setAttribute('aria-expanded','false'); }
  document.body.style.overflow='';
}

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

  // Hamburger / mobile sidebar toggle
  const hamburger = $e('ent-hamburger');
  if(hamburger){
    hamburger.addEventListener('click', function(){
      const sidebar = $e('ent-sidebar');
      if(sidebar && sidebar.classList.contains('open')) _closeSidebar();
      else _openSidebar();
    });
  }

  // Mobile overlay — tap to close sidebar
  const overlay = $e('ent-overlay');
  if(overlay) overlay.addEventListener('click', _closeSidebar);

  // Enterprise selector button
  const entBtn = $e('ent-header-ent-btn');
  if(entBtn) entBtn.addEventListener('click', function(){ showEnterprisePicker(); });

  // Logout — both account section and sidebar footer
  const logoutBtn = $e('account-logout-btn');
  if(logoutBtn) logoutBtn.addEventListener('click', function(){ doSignOut(); });
  const sidebarLogout = $e('ent-logout-btn');
  if(sidebarLogout) sidebarLogout.addEventListener('click', function(){ doSignOut(); });

  const detailBack = $e('detail-back-btn');
  if(detailBack) detailBack.addEventListener('click', function(){ navigateTo('requests'); });

  const siteBack = $e('site-detail-back-btn');
  if(siteBack) siteBack.addEventListener('click', function(){ navigateTo('sites'); });

  // ── Search trigger button
  const searchTrigger = $e('ent-search-trigger');
  if(searchTrigger) searchTrigger.addEventListener('click', function(){ openSearch(); });

  // ── Global keyboard shortcuts
  document.addEventListener('keydown', function(e){
    // Ctrl+K / Cmd+K → command palette
    if((e.ctrlKey || e.metaKey) && e.key==='k'){
      e.preventDefault();
      if(S.cmdOpen) closeCmdPalette(); else openCmdPalette();
      return;
    }
    // '/' → search palette (not in inputs)
    if(e.key==='/' && !S.searchOpen && !S.cmdOpen){
      var tag = (document.activeElement||{}).tagName || '';
      var ce = document.activeElement && document.activeElement.isContentEditable;
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||ce) return;
      e.preventDefault();
      openSearch();
    }
  });

  // ── Init dialog event listeners
  _initSearchDialog();
  _initCmdPalette();
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
  S.members=[]; S.memberAssignments={}; S.assignedSiteIds=[];
  S.kpis={ total:0, action:0, active:0, pending:0, done:0, nomatch:0 };
  loadSavedViews();

  setText('ent-header-ent-name', ent.name);
  setText('ent-header-role-badge', formatRole(ent.role).toUpperCase());
  setText('ent-sb-enterprise', ent.name);
  setText('ent-sb-role', formatRole(ent.role));
  const _av=$e('ent-sb-avatar'); if(_av&&S.userEmail) _av.textContent=S.userEmail.charAt(0).toUpperCase();

  startPolling();
  navigateTo('overview');
  restoreNavState();
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
    setText('ent-gate-msg', _safeMsg(err,'Erreur de connexion'));
    showGate('ent-access-denied');
    return;
  }
  if(!session) { window.location.href='/'; return; }
  S.userId    = session.user.id;
  S.userEmail = session.user.email;
  setText('ent-sb-name', (session.user.user_metadata&&session.user.user_metadata.full_name)||session.user.email||'—');
  const _bav=$e('ent-sb-avatar'); if(_bav) _bav.textContent=(session.user.email||'?').charAt(0).toUpperCase();

  let rows;
  try {
    const { data, error } = await _sb
      .from('enterprise_members')
      .select('role, enterprise_accounts!inner(id, name)')
      .eq('user_id', S.userId)
      .eq('status', 'active'); // FE-AUTH-01: only active memberships enter the dashboard
    if(error) throw error;
    rows = data||[];
  } catch(err) {
    setText('ent-denied-reason', _safeMsg(err,'Erreur de chargement'));
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
      .select('id, status, enterprise_request_context!inner(enterprise_id, site_id)')
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
  await loadMyAssignments();
  await refreshKpis();
  renderKpis();
  renderNavBadge();
  try {
    const { data, error } = await _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(10);
    if(error) throw error;
    const rows = data||[];
    renderActionRequired(rows);
    renderRecentList(rows);
    renderRafiOps(rows);
    renderDailyBrief(rows);
    renderHealthSummary(rows);
    renderQuickActions(rows);
  } catch(err) {
    console.warn('[overview]', _safeMsg(err,'load error'));
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

  // Priority groupings
  const critique  = rows.filter(function(r){ return r.status==='completed'; });   // 🔴
  const attention = rows.filter(function(r){ return r.status==='no_match'; });    // 🟡
  const attente   = rows.filter(function(r){ return r.status==='new'; });         // 🔵

  const actionable = critique.concat(attention).concat(attente);
  if(!actionable.length){ block.style.display='none'; return; }
  block.style.display='';
  if(cntEl) cntEl.textContent = actionable.length;
  listEl.innerHTML='';

  function makeArItem(r, priority) {
    const siteName = getSiteName((r.enterprise_request_context&&r.enterprise_request_context.site_id));
    const ageDays  = r.created_at ? Math.floor((Date.now()-new Date(r.created_at).getTime())/(86400000)) : '?';
    const urgBadge = (r.urgency==='now'||r.urgency==='urgent')
      ? '<span class="ent-urgency-badge-'+(r.urgency==='now'?'now':'urgent')+' ent-ar-urg-badge">'+safeHtml(formatUrgency(r.urgency))+'</span> '
      : '';
    const severityClass = priority==='critique'?'ent-ar-sev-critical':priority==='attention'?'ent-ar-sev-warning':'ent-ar-sev-info';
    const label = priority==='critique'?'🔴 Validation requise'
      : priority==='attention'?'🟡 Sans artisan disponible — à réattribuer'
      : '🔵 En attente d\'attribution';

    const div = document.createElement('div');
    div.className='ent-ar-item ent-ar-item-priority-'+priority;
    div.setAttribute('role','listitem');
    div.setAttribute('tabindex','0');
    div.setAttribute('data-request-id', r.id);
    div.innerHTML =
      '<span class="ent-ar-item-sev '+severityClass+'" aria-hidden="true">'+safeHtml(label.slice(0,2))+'</span>'+
      '<div class="ent-ar-item-text">'+
        '<strong>'+safeHtml(r.category||'—')+'</strong>'+urgBadge+
        '<div class="ent-ar-item-site">'+safeHtml(siteName)+' · '+safeHtml(String(ageDays))+'j</div>'+
        '<div class="ent-ar-item-label">'+safeHtml(label.replace(/^../,'').trim())+'</div>'+
      '</div>'+
      '<div class="ent-ar-item-actions">'+
        '<button class="ent-ar-open-btn" data-rid="'+safeHtml(r.id)+'">Ouvrir</button>'+
        (priority==='critique'&&canConfirm(S.userRole)?
          ' <button class="ent-ar-confirm-btn fxv2-btn-success" data-rid="'+safeHtml(r.id)+'">✅ Valider</button>':'')+
      '</div>'+
      '<span class="ent-ar-item-arrow" aria-hidden="true">→</span>';
    div.querySelector('.ent-ar-open-btn').addEventListener('click', function(e){ e.stopPropagation(); navigateTo('request-detail',{requestId:r.id}); });
    const confirmBtn = div.querySelector('.ent-ar-confirm-btn');
    if(confirmBtn) confirmBtn.addEventListener('click', function(e){ e.stopPropagation(); confirmMission(r.id); });
    div.addEventListener('click', function(){ navigateTo('request-detail',{requestId:r.id}); });
    div.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') div.click(); });
    return div;
  }

  critique.forEach(function(r){  listEl.appendChild(makeArItem(r,'critique')); });
  attention.forEach(function(r){ listEl.appendChild(makeArItem(r,'attention')); });
  attente.forEach(function(r){   listEl.appendChild(makeArItem(r,'attente')); });
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
    const siteName = getSiteName((r.enterprise_request_context&&r.enterprise_request_context.site_id));
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
    if(isSiteManagerWithNoSites()) {
      var noSitesMsg = document.createElement('div');
      noSitesMsg.className = 'bp08f-no-sites-msg';
      noSitesMsg.textContent = 'Aucun site ne vous est encore assigné. Contactez un administrateur.';
      el.appendChild(noSitesMsg);
    } else if(emptyEl){ emptyEl.style.display=''; }
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  el.innerHTML='';
  S.sites.slice(0,4).forEach(function(s){
    const div = document.createElement('div');
    div.className='ent-site-snap-card';
    div.setAttribute('tabindex','0');
    div.setAttribute('role','button');
    div.setAttribute('aria-label',s.name);
    div.setAttribute('data-site-id',s.id);
    const snapOpen=S.requests.filter(function(r){return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&(r.status==='new'||r.status==='in_progress');}).length;
    const snapAct=S.requests.filter(function(r){return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&r.status==='completed';}).length;
    div.innerHTML =
      '<div class="ent-site-snap-left">'+
        '<div class="ent-site-snap-name">'+safeHtml(s.name)+'</div>'+
        (s.city?'<div class="ent-site-snap-city">'+safeHtml(s.city)+'</div>':'')+
      '</div>'+
      '<div class="ent-site-snap-right">'+
        (snapOpen?'<span class="ent-site-snap-count has-open">'+snapOpen+'</span>':'')+
        (snapAct?'<span class="ent-site-snap-count" style="color:#f59e0b">'+snapAct+' val.</span>':'')+
      '</div>';
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
  const action   = rows.filter(function(r){ return r.status==='completed'; }).length;
  const inprog   = rows.filter(function(r){ return r.status==='in_progress'; }).length;
  const newC     = rows.filter(function(r){ return r.status==='new'; }).length;
  const nomatch  = rows.filter(function(r){ return r.status==='no_match'; }).length;
  const assigned = rows.filter(function(r){ return r.status==='assigned'; }).length;
  const critiques= rows.filter(function(r){ return r.urgency==='now'; }).length;
  const lines=[];
  // Urgency breakdown — critical interventions listed first
  if(critiques>0) lines.push({ dot:'dot-red', text: '⚡ '+critiques+' intervention'+(critiques>1?'s':'')+' critique'+(critiques>1?'s':'')+' — réponse immédiate requise.' });
  if(action>0)   lines.push({ dot:'dot-red',    text: action+' intervention'+(action>1?'s':'')+' terminée'+(action>1?'s':'')+' — validation requise.' });
  if(assigned>0) lines.push({ dot:'dot-yellow', text: assigned+' en cours de traitement (artisan assigné).' });
  if(newC>0)     lines.push({ dot:'dot-blue',   text: newC+' nouvelle'+(newC>1?'s':'')+' demande'+(newC>1?'s':'')+' en attente d\'attribution.' });
  if(nomatch>0)  lines.push({ dot:'',           text: nomatch+' sans artisan disponible — réattribution manuelle recommandée.' });
  if(!lines.length) lines.push({ dot:'dot-green', text: 'Toutes les interventions récentes sont clôturées.' });
  linesEl.innerHTML='';
  lines.forEach(function(l){
    const p=document.createElement('p');
    p.className='ent-rafi-ops-line';
    p.innerHTML='<span class="ent-rafi-ops-dot '+(l.dot||'')+'" aria-hidden="true"></span>'+safeHtml(l.text);
    linesEl.appendChild(p);
  });
}

// ─────────────────────────────────────────────────────────────
// BP07-A  DAILY BRIEF
// ─────────────────────────────────────────────────────────────
function isThisWeek(dateStr) {
  if(!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

function renderDailyBrief(rows) {
  const el = $e('ov-db-items');
  if(!el) return;
  const needsAction  = rows.filter(function(r){ return r.status==='completed' && canConfirm(S.userRole); }).length
                     + rows.filter(function(r){ return r.status==='no_match'; }).length;
  const activeCount  = rows.filter(function(r){ return r.status==='in_progress'; }).length;
  const criticalCount= rows.filter(function(r){ return r.urgency==='now'; }).length;
  const pendingCount = rows.filter(function(r){ return r.status==='new'; }).length;
  const validatedWk  = rows.filter(function(r){ return r.status==='validated' && isThisWeek(r.updated_at||r.created_at); }).length;

  var items = [
    { icon:'🔴', val: needsAction,   label:'Action requise',         cls: needsAction>0?'ent-db-item-critical':'ent-db-item-zero' },
    { icon:'🔄', val: activeCount,   label:'Interventions actives',  cls: activeCount>0?'ent-db-item-info':'' },
    { icon:'⚡', val: criticalCount, label:'Critiques / urgentes',   cls: criticalCount>0?'ent-db-item-warn':'' },
    { icon:'🕐', val: pendingCount,  label:'En attente attribution', cls: pendingCount>0?'ent-db-item-info':'' },
    { icon:'✅', val: validatedWk,   label:'Validées cette semaine', cls: validatedWk>0?'ent-db-item-success':'' }
  ];

  el.innerHTML = '';
  items.forEach(function(item) {
    var zeroClass = item.val===0 ? ' ent-db-item-zero' : '';
    var div = document.createElement('div');
    div.className = 'ent-db-item ' + (item.cls||'') + zeroClass;
    div.innerHTML =
      '<span class="ent-db-item-icon" aria-hidden="true">' + item.icon + '</span>' +
      '<div class="ent-db-item-body">' +
        '<div class="ent-db-item-val">' + item.val + '</div>' +
        '<div class="ent-db-item-label">' + safeHtml(item.label) + '</div>' +
      '</div>';
    el.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────
// BP07-B  HEALTH SUMMARY
// ─────────────────────────────────────────────────────────────
function renderHealthSummary(rows) {
  var el = $e('ov-hs-body');
  if(!el) return;

  // Status counts
  var STATUSES = ['new','assigned','in_progress','completed','validated','cancelled','no_match'];
  var STATUS_LABELS = { new:'Nouvelle', assigned:'Assign\u00e9e', in_progress:'En cours',
    completed:'Termin\u00e9e', validated:'Valid\u00e9e', cancelled:'Annul\u00e9e', no_match:'Sans suite' };
  var statusCounts = {};
  STATUSES.forEach(function(s){ statusCounts[s]=0; });
  rows.forEach(function(r){ if(statusCounts[r.status]!==undefined) statusCounts[r.status]++; });
  var maxStatus = Math.max.apply(null, STATUSES.map(function(s){ return statusCounts[s]; }).concat([1]));

  // Urgency counts
  var urgCounts = { now:0, urgent:0, normale:0 };
  rows.forEach(function(r){ var u=r.urgency||'normale'; if(u==='normal') u='normale'; if(urgCounts[u]!==undefined) urgCounts[u]++; else urgCounts['normale']++; });
  var maxUrg = Math.max.apply(null, [urgCounts.now, urgCounts.urgent, urgCounts.normale, 1]);

  // Top sites by open count
  var siteOpen = {};
  rows.forEach(function(r){
    if(r.status==='new'||r.status==='assigned'||r.status==='in_progress'){
      siteOpen[(r.enterprise_request_context&&r.enterprise_request_context.site_id)] = (siteOpen[(r.enterprise_request_context&&r.enterprise_request_context.site_id)]||0) + 1;
    }
  });
  var topSites = Object.keys(siteOpen).sort(function(a,b){ return siteOpen[b]-siteOpen[a]; }).slice(0,3);
  var maxSite = topSites.length ? siteOpen[topSites[0]] : 1;

  // Top categories
  var catCounts = {};
  rows.forEach(function(r){ var c=r.category||'—'; catCounts[c]=(catCounts[c]||0)+1; });
  var topCats = Object.keys(catCounts).sort(function(a,b){ return catCounts[b]-catCounts[a]; }).slice(0,5);
  var maxCat = topCats.length ? catCounts[topCats[0]] : 1;

  function buildGroup(label, entries, maxVal) {
    var html = '<div class="ent-hs-group"><div class="ent-hs-group-label">'+safeHtml(label)+'</div>';
    entries.forEach(function(e) {
      var pct = maxVal>0 ? Math.round((e.count/maxVal)*100) : 0;
      html += '<div class="ent-hs-bar-row">'+
        '<span class="ent-hs-bar-label">'+safeHtml(e.label)+'</span>'+
        '<div class="ent-hs-bar-track"><div class="ent-hs-bar-fill" style="width:'+pct+'%"></div></div>'+
        '<span class="ent-hs-bar-count">'+e.count+'</span>'+
        '</div>';
    });
    html += '</div>';
    return html;
  }

  var html = '';
  html += buildGroup('Par statut', STATUSES.map(function(s){ return { label: STATUS_LABELS[s]||s, count: statusCounts[s] }; }), maxStatus);
  html += buildGroup('Par urgence', [
    { label: 'Imm\u00e9diat', count: urgCounts.now },
    { label: 'Urgent',     count: urgCounts.urgent },
    { label: 'Normale',    count: urgCounts.normale }
  ], maxUrg);
  if(topSites.length) {
    html += buildGroup('Top sites (ouvertes)', topSites.map(function(sid){
      return { label: getSiteName(sid), count: siteOpen[sid] };
    }), maxSite);
  }
  if(topCats.length) {
    html += buildGroup('Top cat\u00e9gories', topCats.map(function(c){
      return { label: c, count: catCounts[c] };
    }), maxCat);
  }

  el.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────
// BP07-C  SITE COMPARISON TABLE
// ─────────────────────────────────────────────────────────────
function renderSiteComparison() {
  var tableEl = $e('site-comparison-table');
  if(!tableEl) return;
  var sites = S.sites || [];
  if(!sites.length) { tableEl.innerHTML = '<p style="color:var(--v2-text-3);font-size:.80rem">Aucun site disponible.</p>'; return; }

  var rows = S.requests || [];
  var html = '<table class="ent-site-compare-table" role="table">'+
    '<thead><tr>'+
    '<th>Site</th><th>Ouvertes</th><th>Action req.</th><th>Sans artisan</th><th>Valid\u00e9es</th>'+
    '</tr></thead><tbody>';

  sites.forEach(function(s) {
    var open     = rows.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id && (r.status==='new'||r.status==='assigned'||r.status==='in_progress'); }).length;
    var action   = rows.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id && r.status==='completed'; }).length;
    var noMatch  = rows.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id && r.status==='no_match'; }).length;
    var validated= rows.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id && r.status==='validated'; }).length;

    var openCls   = open>0  ? (open>5?'ent-site-compare-warn':'ent-site-compare-num') : 'ent-site-compare-zero';
    var actionCls = action>0 ? 'ent-site-compare-danger' : 'ent-site-compare-zero';
    var noMatchCls= noMatch>0 ? 'ent-site-compare-warn' : 'ent-site-compare-zero';

    html += '<tr>'+
      '<td>'+safeHtml(s.name)+'</td>'+
      '<td class="'+openCls+'">'+open+'</td>'+
      '<td class="'+actionCls+'">'+action+'</td>'+
      '<td class="'+noMatchCls+'">'+noMatch+'</td>'+
      '<td class="ent-site-compare-num">'+validated+'</td>'+
      '</tr>';
  });
  html += '</tbody></table>';
  tableEl.innerHTML = html;
}

function toggleSiteComparison() {
  var tableEl  = $e('site-comparison-table');
  var toggleBtn= $e('site-comparison-toggle');
  if(!tableEl) return;
  var visible = tableEl.style.display !== 'none';
  tableEl.style.display = visible ? 'none' : '';
  if(toggleBtn) toggleBtn.textContent = visible ? '\uD83D\uDCCB Comparaison des sites' : '\uD83D\uDCCB Masquer comparaison';
  if(!visible) renderSiteComparison();
}

// ─────────────────────────────────────────────────────────────
// BP07-D  QUICK ACTIONS
// ─────────────────────────────────────────────────────────────
function renderQuickActions(rows) {
  var el = $e('ov-qa-buttons');
  if(!el) return;
  var completedCount = rows.filter(function(r){ return r.status==='completed'; }).length;
  var noMatchCount   = rows.filter(function(r){ return r.status==='no_match'; }).length;

  var btns = [];

  // Always
  btns.push({ label:'\uD83D\uDCCB Interventions', primary:false, action:function(){ navigateTo('requests'); } });
  btns.push({ label:'\uD83D\uDD34 Voir les urgences', primary:false, action:function(){
    S.reqUrgencyFilter='now';
    var uf=$e('filter-urgency'); if(uf) uf.value='now';
    navigateTo('requests');
  }});

  // Role-aware conditional
  if(canConfirm(S.userRole) && completedCount>0) {
    btns.push({ label:'\u2705 Valider ('+completedCount+')', primary:true, action:function(){
      S.reqStatusFilter='completed';
      var sf=$e('filter-status'); if(sf) sf.value='completed';
      navigateTo('requests');
    }});
  }
  if(noMatchCount>0) {
    btns.push({ label:'\u26A0\uFE0F Sans artisan ('+noMatchCount+')', primary:false, action:function(){
      S.reqStatusFilter='no_match';
      var sf=$e('filter-status'); if(sf) sf.value='no_match';
      navigateTo('requests');
    }});
  }
  if(canCreate(S.userRole)) {
    btns.push({ label:'\u2795 Nouvelle intervention', primary:false, action:function(){ navigateTo('new-request'); } });
  }
  btns.push({ label:'\uD83D\uDD0D Recherche (/)', primary:false, action:function(){ openSearch(); } });

  el.innerHTML = '';
  btns.forEach(function(b) {
    var btn = document.createElement('button');
    btn.className = 'ent-qa-btn' + (b.primary?' ent-qa-btn-primary':'');
    btn.textContent = b.label;
    btn.addEventListener('click', b.action);
    el.appendChild(btn);
  });
}

// ─────────────────────────────────────────────────────────────
// BP07-E  URL / NAVIGATION HASH STATE
// ─────────────────────────────────────────────────────────────
function pushNavState(section, params) {
  var hash = '#' + section + (params && params.requestId ? '/' + params.requestId : '');
  if(location.hash !== hash) history.replaceState(null, '', hash);
}

function restoreNavState() {
  var hash = location.hash.replace('#','');
  if(!hash) return;
  var parts = hash.split('/');
  var section = parts[0];
  var id = parts[1];
  if(ALL_SECTIONS.includes(section)) {
    if(section==='request-detail' && id) {
      navigateTo('request-detail', {requestId: id});
    } else {
      navigateTo(section);
    }
  }
}

// ── Age / next-action helpers
function formatAge(createdAt) {
  if(!createdAt) return '—';
  const diffMs  = Date.now() - new Date(createdAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if(diffMin < 60)  return 'il y a '+diffMin+'min';
  const diffH   = Math.floor(diffMin / 60);
  if(diffH < 24)   return 'il y a '+diffH+'h';
  const diffD   = Math.floor(diffH / 24);
  if(diffD < 14)   return 'il y a '+diffD+'j';
  const diffW   = Math.floor(diffD / 7);
  return 'il y a '+diffW+'sem';
}

function getNextAction(status, role) {
  switch(status) {
    case 'new':        return 'En attente d\'attribution RAFI';
    case 'assigned':   return 'Artisan assigné — intervention en cours';
    case 'in_progress':return 'Intervention en cours';
    case 'completed':  return canConfirm(role)?'Validation requise':'Terminée — en attente de validation';
    case 'validated':  return 'Validée \u2713';
    case 'cancelled':  return 'Annulée';
    case 'no_match':   return 'Aucun artisan disponible';
    default:           return status||'—';
  }
}

// ── Formatting helpers
function formatStatus(status) {
  return ({
    new:'Nouvelle', assigned:'Assignée', in_progress:'En cours', completed:'Terminée',
    validated:'Validée', cancelled:'Annulée', no_match:'Sans suite'
  })[status]||status;
}
function formatUrgency(urgency) {
  if(!urgency||urgency==='normale'||urgency==='normal') return 'Normale';
  return ({ now:'Immédiat', urgent:'Urgent', '':'Normale' })[urgency]||urgency;
}
function getSiteName(siteId) {
  if(!siteId) return '—';
  const s=S.sites.find(function(x){ return x.id===siteId; });
  return s?s.name:siteId;
}

// ── RAFI narration helper (Workstream I)
function rafiNarrate(r) {
  const site = getSiteName((r.enterprise_request_context&&r.enterprise_request_context.site_id));
  switch(r.status) {
    case 'new':         return 'En attente d\'attribution — ' + (r.category||'intervention') + ' (' + site + ')';
    case 'assigned':    return 'Artisan assigné — ' + (r.category||'intervention') + ' (' + site + ')';
    case 'in_progress': return 'Intervention en cours — ' + (r.category||'intervention') + ' (' + site + ')';
    case 'completed':   return 'Terminée — validation requise pour ' + (r.category||'intervention') + ' (' + site + ')';
    case 'validated':   return 'Validée — ' + (r.category||'intervention') + ' (' + site + ')';
    case 'cancelled':   return 'Annulée — ' + (r.category||'intervention');
    case 'no_match':    return 'Sans artisan — ' + (r.category||'intervention') + ' (' + site + ')';
    default:            return r.category || 'Intervention';
  }
}

// ── Sites cache
async function fetchSites() {
  if(!S.activeEnterprise) return;
  try {
    const { data, error } = await _sb
      .from('enterprise_sites')
      // BP09-FIX-02: include status (required for BP08C admin controls + inactive
      // site filtering) and address_line/site_code (used by doSiteUpdate)
      .select('id, name, address, city, status, site_code, address_line')
      .eq('enterprise_id', S.activeEnterprise.id)
      .order('name');
    if(error) throw error;
    S.sites = data||[];
    S.sitesLoaded = true;
    populateSiteFilters();
  } catch(err){ console.warn('[fetchSites]',_safeMsg(err,'load error')); }
}

function populateSiteFilters() {
  ['filter-site','hist-filter-site','req-site'].forEach(function(id){
    const sel=$e(id);
    if(!sel) return;
    const cur=sel.value;
    while(sel.options.length>1) sel.remove(1);
    // BP08C: req-site only shows active sites; filter/hist show all
    var sitesToShow = (id === 'req-site')
      ? S.sites.filter(function(s){ return s.status === 'active'; })
      : S.sites;
    sitesToShow.forEach(function(s){
      const opt=document.createElement('option');
      opt.value=s.id; opt.textContent=s.name;
      sel.appendChild(opt);
    });
    if(cur) sel.value=cur;
  });
}

// ── Auth state listener
// BP09-RES-02: handle TOKEN_REFRESHED failures and visibilitychange re-auth
function attachAuthListener() {
  _sb.auth.onAuthStateChange(function(event, session) {
    if(event==='SIGNED_OUT'){ stopPolling(); window.location.href='/'; return; }
    // Supabase emits SIGNED_IN on token refresh success.
    // If a refresh attempt fails, the client emits TOKEN_REFRESHED with null session
    // or a subsequent SIGNED_OUT. Guard: redirect on null session for any auth event.
    if(session === null && event !== 'INITIAL_SESSION') {
      stopPolling(); window.location.href='/';
    }
  });
  // BP09-RES-03: re-check session when tab regains visibility (browser back/forward
  // or returning from idle may leave the page with a stale/expired session).
  document.addEventListener('visibilitychange', async function() {
    if(document.visibilityState !== 'visible') return;
    try {
      const { data } = await _sb.auth.getSession();
      if(!data || !data.session) { stopPolling(); window.location.href='/'; }
    } catch(_) { /* network unavailable — stay on page, poll will catch RLS errors */ }
  });
}

// ── BP08F: Assignment helpers
async function loadMyAssignments() {
  if(!S.activeEnterprise) return;
  if(S.userRole !== 'site_manager') { S.assignedSiteIds=[]; return; }
  try {
    var { data, error } = await _sb
      .from('enterprise_member_sites')
      .select('site_id')
      .eq('enterprise_id', S.activeEnterprise.id);
    if(error) throw error;
    S.assignedSiteIds = (data||[]).map(function(r){ return r.site_id; });
  } catch(err) {
    S.assignedSiteIds = [];
    console.warn('[loadMyAssignments]', _safeMsg(err,'load error'));
  }
}

function isSiteManagerWithNoSites() {
  return S.userRole === 'site_manager' && S.assignedSiteIds.length === 0;
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
      renderFilterChips();
      renderSavedViews();
      loadRequests(true);
    });
  }

  // Urgency filter
  const urgFilter = $e('filter-urgency');
  if(urgFilter){
    urgFilter.addEventListener('change', function(){
      S.reqUrgencyFilter = urgFilter.value;
      updateFilterResetBtn();
      renderFilterChips();
      renderSavedViews();
      loadRequests(true);
    });
  }

  // Category filter
  const catFilter = $e('filter-category');
  if(catFilter){
    catFilter.addEventListener('change', function(){
      S.reqCategoryFilter = catFilter.value;
      updateFilterResetBtn();
      renderFilterChips();
      renderSavedViews();
      loadRequests(true);
    });
  }

  // Sort order
  const sortSel = $e('req-sort');
  if(sortSel){
    sortSel.addEventListener('change', function(){
      S.reqSortOrder = sortSel.value;
      renderSavedViews();
      loadRequests(true);
    });
  }

  // Filter reset
  const resetBtn = $e('filter-reset');
  if(resetBtn){
    resetBtn.addEventListener('click', function(){
      S.reqSiteFilter=''; S.reqUrgencyFilter=''; S.reqSearchQuery=''; S.reqCategoryFilter='';
      const sf=$e('filter-site'); if(sf) sf.value='';
      const uf=$e('filter-urgency'); if(uf) uf.value='';
      const cf=$e('filter-category'); if(cf) cf.value='';
      const sq=$e('req-search'); if(sq) sq.value='';
      updateFilterResetBtn();
      renderFilterChips();
      renderSavedViews();
      loadRequests(true);
    });
  }

  // Save view button
  const saveViewBtn = $e('save-view-btn');
  if(saveViewBtn) saveViewBtn.addEventListener('click', saveCurrentView);

  // Export CSV
  const exportBtn = $e('req-export-btn');
  if(exportBtn) exportBtn.addEventListener('click', exportRequestsCSV);

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
  const active = S.reqSiteFilter||S.reqUrgencyFilter||S.reqCategoryFilter;
  btn.style.display = active?'':'none';
}

function renderFilterChips() {
  const chipsEl=$e('filter-chips');
  if(!chipsEl) return;
  chipsEl.innerHTML='';
  function makeChip(label, onRemove) {
    const chip=document.createElement('span');
    chip.className='ent-filter-chip';
    chip.innerHTML=safeHtml(label)+' <button class="ent-chip-remove" aria-label="Retirer filtre: '+safeHtml(label)+'">✕</button>';
    chip.querySelector('.ent-chip-remove').addEventListener('click', onRemove);
    return chip;
  }
  if(S.reqSiteFilter){
    const siteName=getSiteName(S.reqSiteFilter);
    chipsEl.appendChild(makeChip('Site: '+siteName, function(){
      S.reqSiteFilter='';
      const sf=$e('filter-site'); if(sf) sf.value='';
      updateFilterResetBtn(); renderFilterChips(); loadRequests(true);
    }));
  }
  if(S.reqUrgencyFilter){
    chipsEl.appendChild(makeChip('Urgence: '+formatUrgency(S.reqUrgencyFilter), function(){
      S.reqUrgencyFilter='';
      const uf=$e('filter-urgency'); if(uf) uf.value='';
      updateFilterResetBtn(); renderFilterChips(); loadRequests(true);
    }));
  }
  if(S.reqCategoryFilter){
    chipsEl.appendChild(makeChip('Catégorie: '+S.reqCategoryFilter, function(){
      S.reqCategoryFilter='';
      const cf=$e('filter-category'); if(cf) cf.value='';
      updateFilterResetBtn(); renderFilterChips(); loadRequests(true);
    }));
  }
}

// ═══ SAVED VIEWS ═══
const DEFAULT_VIEWS = [
  { id: 'preset-urgent',  name: '\uD83D\uDD34 Urgentes',   filters: { reqSiteFilter:'', reqStatusFilter:'all',        reqUrgencyFilter:'now',       reqCategoryFilter:'', reqSort:'newest' }},
  { id: 'preset-action',  name: '\u26A1 \u00C0 valider',  filters: { reqSiteFilter:'', reqStatusFilter:'completed',   reqUrgencyFilter:'',          reqCategoryFilter:'', reqSort:'newest' }},
  { id: 'preset-inprog',  name: '\uD83D\uDD04 En cours',  filters: { reqSiteFilter:'', reqStatusFilter:'in_progress', reqUrgencyFilter:'',          reqCategoryFilter:'', reqSort:'newest' }},
  { id: 'preset-new',     name: '\uD83C\uDD95 En attente', filters: { reqSiteFilter:'', reqStatusFilter:'new',         reqUrgencyFilter:'',          reqCategoryFilter:'', reqSort:'newest' }},
];

function loadSavedViews() {
  S.savedViews = [];
  if(!S.activeEnterprise) return;
  try {
    const raw = localStorage.getItem('fixeo_ent_views_' + S.activeEnterprise.id);
    if(raw) {
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) S.savedViews = parsed;
    }
  } catch(e) { S.savedViews = []; }
  renderSavedViews();
}

function saveSavedViews() {
  if(!S.activeEnterprise) return;
  try {
    localStorage.setItem('fixeo_ent_views_' + S.activeEnterprise.id, JSON.stringify(S.savedViews));
  } catch(e) { /* storage full or unavailable */ }
}

function saveCurrentView() {
  const name = window.prompt('Nom de la vue :');
  if(!name || !name.trim()) return;
  const view = {
    id: 'view-' + Date.now(),
    name: name.trim(),
    filters: {
      reqStatusFilter:   S.reqStatusFilter,
      reqSiteFilter:     S.reqSiteFilter,
      reqUrgencyFilter:  S.reqUrgencyFilter,
      reqCategoryFilter: S.reqCategoryFilter,
      reqSort:           S.reqSortOrder,
    }
  };
  S.savedViews.push(view);
  saveSavedViews();
  renderSavedViews();
}

function applySavedView(view) {
  S.reqStatusFilter   = view.filters.reqStatusFilter   || 'all';
  S.reqSiteFilter     = view.filters.reqSiteFilter     || '';
  S.reqUrgencyFilter  = view.filters.reqUrgencyFilter  || '';
  S.reqCategoryFilter = view.filters.reqCategoryFilter || '';
  S.reqSortOrder      = view.filters.reqSort           || 'newest';
  // sync DOM selectors
  const sf=$e('filter-site');     if(sf) sf.value = S.reqSiteFilter;
  const uf=$e('filter-urgency');  if(uf) uf.value = S.reqUrgencyFilter;
  const cf=$e('filter-category'); if(cf) cf.value = S.reqCategoryFilter;
  const ss=$e('req-sort');        if(ss) ss.value = S.reqSortOrder;
  // sync status tabs
  document.querySelectorAll('.ent-status-tab[data-status-tab]').forEach(function(b){
    const tabVal = b.dataset.statusTab || 'all';
    const active = (tabVal === S.reqStatusFilter) || (S.reqStatusFilter === 'all' && tabVal === '');
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  updateFilterResetBtn();
  renderFilterChips();
  renderSavedViews();
  loadRequests(true);
}

function deleteSavedView(id) {
  S.savedViews = S.savedViews.filter(function(v){ return v.id !== id; });
  saveSavedViews();
  renderSavedViews();
}

function renderSavedViews() {
  const listEl = $e('saved-views-list');
  if(!listEl) return;
  listEl.innerHTML = '';
  const allViews = DEFAULT_VIEWS.concat(S.savedViews);
  allViews.forEach(function(view) {
    const chip = document.createElement('span');
    chip.className = 'ent-saved-view-chip';
    chip.setAttribute('role', 'listitem');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-label', 'Appliquer la vue : ' + view.name);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = view.name;
    chip.appendChild(nameSpan);
    if(!view.id.startsWith('preset-')) {
      const delBtn = document.createElement('button');
      delBtn.className = 'ent-saved-view-delete';
      delBtn.setAttribute('aria-label', 'Supprimer la vue : ' + view.name);
      delBtn.textContent = '\u00D7';
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteSavedView(view.id);
      });
      chip.appendChild(delBtn);
    }
    chip.addEventListener('click', function() { applySavedView(view); });
    chip.addEventListener('keydown', function(e) { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); applySavedView(view); } });
    listEl.appendChild(chip);
  });
}

// ═══ CSV EXPORT ═══
function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportRequestsCSV() {
  if(!S.requests.length) { alert('Aucune intervention \u00e0 exporter.'); return; }
  const header = ['R\u00e9f\u00e9rence','Site','Ville','Cat\u00e9gorie','Urgence','Statut','Cr\u00e9\u00e9e le'];
  const rows = S.requests.map(function(r) {
    const site = S.sites.find(function(s){ return s.id === (r.enterprise_request_context&&r.enterprise_request_context.site_id); }) || {};
    return [
      r.id.slice(0,8).toUpperCase(),
      csvEscape(site.name || '\u2014'),
      csvEscape(site.city || '\u2014'),
      csvEscape(r.category || '\u2014'),
      csvEscape(formatUrgency(r.urgency)),
      csvEscape(formatStatus(r.status)),
      r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '\u2014'
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'interventions-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Load requests (paginated with composite cursor)
async function loadRequests(reset) {
  if(!S.activeEnterprise) return;
  if(S.requestsLoading) return;
  S.requestsLoading = true;
  setLoading('section-requests', true);
  if(reset){
    S.requests=[]; S.requestCursor=null; S.requestsExhausted=false;
  }
  if(S.requestsExhausted&&!reset) { S.requestsLoading=false; setLoading('section-requests',false); return; }

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
  let statuses=null;
  switch(S.reqStatusFilter){
    case 'new':         statuses=['new'];          break;
    case 'in_progress': statuses=['in_progress'];  break;
    case 'completed':   statuses=['completed'];    break;
    case 'validated':   statuses=['validated'];    break;
    case 'all':
    default:            statuses=null; break;
  }

  try {
    let q = _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(PAGE_SIZE+1);

    if(statuses) q=q.in('status', statuses);
    if(S.reqSiteFilter)     q=q.eq('enterprise_request_context.site_id', S.reqSiteFilter);
    if(S.reqUrgencyFilter)  q=q.eq('urgency', S.reqUrgencyFilter);
    if(S.reqCategoryFilter) q=q.eq('category', S.reqCategoryFilter);

    // Sort order (composite cursor always descending; client-side resort for urgent-first)
    const sortAsc = S.reqSortOrder==='oldest';
    q=q.order('created_at',{ ascending:sortAsc }).order('id',{ ascending:sortAsc });

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
    if(errorMsgEl){ errorMsgEl.textContent=_safeMsg(err,'Erreur de chargement.'); }
  } finally {
    S.requestsLoading = false;
    setLoading('section-requests', false);
  }
}

async function silentRefreshRequests() {
  if(!S.activeEnterprise) return;
  const saved=S.requestCursor;
  S.requestCursor=null;
  let q = _sb
    .from('service_requests')
    .select('id, status, category, urgency, description, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
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
  const countEl = $e('req-result-count');
  if(!listEl) return;

  // Urgent-first client-side sort
  let display = S.requests.slice();
  if(S.reqSortOrder==='urgent-first'){
    const urgPrio = function(r){ return r.urgency==='now'?0:r.urgency==='urgent'?1:2; };
    display.sort(function(a,b){ return urgPrio(a)-urgPrio(b); });
  }

  if(countEl) countEl.textContent = display.length+' intervention'+(display.length!==1?'s':'');

  if(!display.length){
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
  display.forEach(function(r){
    if(listEl.querySelector('[data-request-id="'+r.id+'"]')) return;
    listEl.appendChild(buildRequestCard(r));
  });
}

function buildRequestCard(r) {
  const siteName = getSiteName((r.enterprise_request_context&&r.enterprise_request_context.site_id));
  const ageStr   = formatAge(r.created_at);
  const refStr   = r.id ? r.id.slice(0,8).toUpperCase() : '—';
  const nextAct  = getNextAction(r.status, S.userRole);
  const div=document.createElement('div');
  div.className='ent-req-card fxv2-card';
  div.setAttribute('role','listitem');
  div.setAttribute('tabindex','0');
  div.setAttribute('data-request-id',r.id);
  div.setAttribute('data-status',r.status||'new');
  div.setAttribute('aria-label',(r.category||'Intervention')+' — '+formatStatus(r.status));
  const urgHtml=(r.urgency==='now'||r.urgency==='urgent')
    ?'<span class="ent-urgency-badge-'+(r.urgency==='now'?'now':'urgent')+'">'+safeHtml(formatUrgency(r.urgency))+'</span>'
    :'';
  const confirmHtml=(r.status==='completed'&&canConfirm(S.userRole))
    ?'<button class="ent-req-confirm-btn" data-rid="'+safeHtml(r.id)+'" aria-label="Valider cette intervention">✅ Valider</button>'
    :'';
  div.innerHTML =
    '<div class="ent-req-top">'+
      '<span class="ent-req-site-chip">'+safeHtml(siteName)+'</span>'+
      (urgHtml?'<span class="ent-req-top-right">'+urgHtml+'</span>':'')+
    '</div>'+
    '<div class="ent-req-mid">'+
      '<span class="ent-req-cat">'+safeHtml(r.category||'—')+'</span>'+
      '<span class="ent-status-badge ent-status-'+safeHtml(r.status)+'">'+safeHtml(formatStatus(r.status))+'</span>'+
    '</div>'+
    (r.description?'<p class="ent-req-desc ent-req-desc-clamp">'+safeHtml(r.description.substring(0,200))+(r.description.length>200?'…':'')+'</p>':'')+
    '<div class="ent-req-footer">'+
      '<span class="ent-req-age">'+safeHtml(ageStr)+'</span>'+
      '<span class="ent-req-ref">#'+safeHtml(refStr)+'</span>'+
      '<span class="ent-req-nextact">'+safeHtml(nextAct)+'</span>'+
      (confirmHtml?confirmHtml:'')+
    '</div>'+
    '<div class="rafi-card-narration">'+
      '<span class="rafi-card-text">'+safeHtml(rafiNarrate(r))+'</span>'+
    '</div>';
  const confirmBtn=div.querySelector('.ent-req-confirm-btn');
  if(confirmBtn) confirmBtn.addEventListener('click',function(e){ e.stopPropagation(); confirmMission(r.id); });
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
      .select('id, status, category, urgency, description, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
      .eq('id', requestId)
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .single();
    if(error) throw error;
    S.detailRequest = data;
    renderDetailContent(data, contentEl);
    setText('detail-back-title', data.category||'Intervention');
    // Desktop only: show modal dialog
    if(window.innerWidth >= 768) { openDetailDialog(data); }
  } catch(err){
    contentEl.innerHTML='<div class="ent-error"><span>⚠️ '+safeHtml(_safeMsg(err,'Erreur de chargement.'))+'</span></div>';
  }
}

function renderDetailContent(r, container) {
  const siteName = getSiteName((r.enterprise_request_context&&r.enterprise_request_context.site_id));
  const date = r.created_at?new Date(r.created_at).toLocaleString('fr-FR'):'—';
  const ref  = r.id ? r.id.slice(0,8).toUpperCase() : '—';
  const urgBadge = (r.urgency==='now'||r.urgency==='urgent')
    ? '<span class="ent-urgency-badge-'+(r.urgency==='now'?'now':'urgent')+'">'+safeHtml(formatUrgency(r.urgency))+'</span>'
    : '<span style="color:var(--v2-text-3)">Normale</span>';

  // ── Lifecycle stepper
  const lifesteps = [
    { key:'new',        label:'Nouvelle' },
    { key:'assigned',   label:'Assignée' },
    { key:'in_progress',label:'En cours' },
    { key:'completed',  label:'Terminée' },
    { key:'validated',  label:'Validée' },
  ];
  const ORDER = ['new','assigned','in_progress','completed','validated'];
  const curIdx = ORDER.indexOf(r.status);
  const isTerminal = r.status==='cancelled'||r.status==='no_match';
  let stepperHtml='<div class="ent-lifecycle-steps" role="list" aria-label="Étapes du cycle de vie">';
  lifesteps.forEach(function(step, i){
    let cls='ent-lifecycle-step step-pending';
    if(!isTerminal){
      if(i<curIdx)       cls='ent-lifecycle-step step-done';
      else if(i===curIdx) cls='ent-lifecycle-step step-active';
    }
    stepperHtml+='<div class="'+cls+'" role="listitem">'+
      '<span class="ent-lifecycle-step-icon" aria-hidden="true">'+(i<curIdx&&!isTerminal?'✓':i===curIdx&&!isTerminal?'●':'◦')+'</span>'+
      '<span class="ent-lifecycle-step-label">'+safeHtml(step.label)+'</span>'+
    '</div>';
  });
  if(isTerminal){
    stepperHtml+='<div class="ent-lifecycle-step ent-lifecycle-terminal" role="listitem">'+
      '<span class="ent-lifecycle-step-icon" aria-hidden="true">⚠️</span>'+
      '<span class="ent-lifecycle-step-label">'+safeHtml(formatStatus(r.status))+'</span>'+
    '</div>';
  }
  stepperHtml+='</div>';

  // ── Next action
  const nextAction = getNextAction(r.status, S.userRole);

  // ── RAFI verbose narration
  const rafiLines = (function(){
    switch(r.status){
      case 'new':        return 'Cette demande attend d\'être prise en charge par RAFI pour l\'attribution d\'un artisan qualifié.';
      case 'assigned':   return 'Un artisan a été assigné à cette intervention. Il devrait intervenir prochainement sur le site.';
      case 'in_progress':return 'L\'artisan est actuellement en intervention sur le site. Aucune action requise de votre part.';
      case 'completed':  return canConfirm(S.userRole)
        ? 'L\'artisan a signalé la fin de l\'intervention. Vous pouvez maintenant valider ou signaler un problème.'
        : 'L\'intervention est terminée. Elle est en attente de validation par un responsable habilité.';
      case 'validated':  return 'Cette intervention a été validée. Dossier clôturé.';
      case 'cancelled':  return 'Cette demande a été annulée. Contactez votre administrateur si nécessaire.';
      case 'no_match':   return 'Aucun artisan disponible n\'a pu être assigné. Une réattribution manuelle est recommandée.';
      default:           return 'Statut: '+formatStatus(r.status);
    }
  })();

  container.innerHTML =
    // Lifecycle stepper
    '<div class="ent-detail-section">'+
      '<div class="ent-detail-section-title">Cycle de vie</div>'+
      stepperHtml+
    '</div>'+
    // Core details
    '<div class="ent-detail-section">'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Catégorie</span><span class="ent-detail-val">'+safeHtml(r.category||'—')+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Site</span><span class="ent-detail-val">'+safeHtml(siteName)+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Urgence</span><span class="ent-detail-val">'+urgBadge+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Statut</span><span class="ent-detail-val"><span class="ent-status-badge ent-status-'+safeHtml(r.status)+'">'+safeHtml(formatStatus(r.status))+'</span></span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Créée le</span><span class="ent-detail-val">'+safeHtml(date)+'</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Référence</span><span class="ent-detail-val">'+safeHtml(ref)+'</span></div>'+
      // Factual next step
      '<div class="ent-detail-row"><span class="ent-detail-key">Prochaine étape</span><span class="ent-detail-val ent-detail-nextstep">'+safeHtml(nextAction)+'</span></div>'+
    '</div>'+
    // RAFI section
    '<div class="rafi-hint-block" aria-label="Analyse RAFI">'+
      '<div class="rafi-hint-header"><span class="rafi-badge" aria-hidden="true">RAFI</span><span class="rafi-hint-title">Analyse opérationnelle</span></div>'+
      '<p style="font-size:.85rem;color:var(--v2-text-2);margin:0">'+safeHtml(rafiLines)+'</p>'+
    '</div>'+
    // Copy buttons
    '<div class="ent-detail-copy-row">'+
      '<button class="ent-copy-btn" id="ent-copy-ref-btn">📋 Copier la référence</button>'+
      '<button class="ent-copy-btn" id="ent-copy-summary-btn">📄 Copier le résumé</button>'+
    '</div>'+
    (r.description?
      '<div class="ent-detail-section"><div class="ent-detail-section-title">Description</div><div class="ent-detail-desc-block">'+safeHtml(r.description)+'</div></div>':'')+
    '<div id="ent-mission-block" class="ent-detail-section" style="display:none"></div>'+
    (r.status==='completed'&&canConfirm(S.userRole)?
      '<div class="ent-detail-action-row">'+
        '<button class="ent-confirm-btn" id="ent-confirm-btn" data-request-id="'+safeHtml(r.id)+'" aria-label="Valider cette intervention">'+
          '<span id="ent-confirm-text">✅ Valider l\'intervention</span>'+
          '<span id="ent-confirm-spinner" class="ent-confirm-spinner" style="display:none" aria-hidden="true"></span>'+
        '</button>'+
        '<div class="ent-confirm-result err" id="ent-confirm-error" style="display:none" role="alert" aria-live="assertive"></div>'+
      '</div>':'');

  // Wire confirm btn
  const confirmBtn = container.querySelector('#ent-confirm-btn');
  if(confirmBtn){
    confirmBtn.addEventListener('click', function(){
      confirmMission(r.id);
    });
  }

  // Wire copy reference btn
  const copyRefBtn = container.querySelector('#ent-copy-ref-btn');
  if(copyRefBtn){
    copyRefBtn.addEventListener('click', function(){
      navigator.clipboard.writeText(ref).then(function(){
        copyRefBtn.textContent='✓ Référence copiée';
        setTimeout(function(){ copyRefBtn.textContent='📋 Copier la référence'; }, 2000);
      }).catch(function(){ copyRefBtn.textContent='Erreur clipboard'; });
    });
  }

  // Wire copy summary btn
  const copySumBtn = container.querySelector('#ent-copy-summary-btn');
  if(copySumBtn){
    copySumBtn.addEventListener('click', function(){
      const summary='Demande '+ref+' | '+safeHtml(r.category||'—')+' | '+safeHtml(siteName)+' | '+formatStatus(r.status)+' | '+date;
      navigator.clipboard.writeText(summary).then(function(){
        copySumBtn.textContent='✓ Résumé copié';
        setTimeout(function(){ copySumBtn.textContent='📄 Copier le résumé'; }, 2000);
      }).catch(function(){ copySumBtn.textContent='Erreur clipboard'; });
    });
  }

  // Load mission block async
  loadDetailMission(r.id, container);
}

async function loadDetailMission(requestId, container) {
  try {
    const { data, error } = await _sb
      .from('missions')
      .select('id, status, artisan_profile_id, started_at, completed_at')
      .eq('request_id', String(requestId))
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
      '<div class="ent-detail-section-title">Mission</div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Statut mission</span><span class="ent-detail-val"><span class="ent-status-badge ent-status-'+safeHtml(data.status)+'">'+safeHtml(formatStatus(data.status))+'</span></span></div>'+
      (data.completed_at?'<div class="ent-detail-row"><span class="ent-detail-key">Terminée le</span><span class="ent-detail-val">'+safeHtml(new Date(data.completed_at).toLocaleString('fr-FR'))+'</span></div>':'');
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
    const { data, error } = await _sb.rpc('confirm_completed_mission',{ p_request_id: requestId });
    if(error) throw error;
    // BP09-RES-01: check RPC business-logic failures ({ok:false, reason:...})
    if(data && data.ok === false) throw _rpcErr(data, 'Erreur lors de la validation.');
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
    if(errEl){ errEl.textContent=_safeMsg(err,'Erreur lors de la validation.'); errEl.style.display=''; }
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
  const _releaseTrap = trapFocus(dialog);

  // Focus management: track triggering element, focus close btn
  S.lastFocusedElement = document.activeElement;
  const closeBtn = $e('ent-dialog-close');
  const backdrop = $e('ent-dialog-backdrop');

  setTimeout(function(){
    if(closeBtn) closeBtn.focus();
  }, 50);

  function closeDialog() {
    _releaseTrap();
    dialog.style.display='none';
    // Return focus to trigger
    if(S.lastFocusedElement&&typeof S.lastFocusedElement.focus==='function'){
      S.lastFocusedElement.focus();
    }
    S.lastFocusedElement=null;
  }

  if(closeBtn){ closeBtn.onclick=closeDialog; }
  if(backdrop){ backdrop.onclick=closeDialog; }

  // Keyboard trap + Escape
  dialog.onkeydown=function(e){
    if(e.key==='Escape'){ closeDialog(); return; }
    if(e.key!=='Tab') return;
    const panel=dialog.querySelector('.ent-detail-dialog-panel');
    if(!panel) return;
    const focusable=Array.from(panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function(el){ return !el.closest('[style*="display:none"]'); });
    if(!focusable.length) return;
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    if(e.shiftKey){
      if(document.activeElement===first){ e.preventDefault(); last.focus(); }
    } else {
      if(document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  };
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
      if(errMsgEl){ errMsgEl.textContent=_safeMsg(err,'Erreur de chargement des sites.'); }
      return;
    }
  }

  if(!S.sites.length){
    listEl.innerHTML='';
    if(isSiteManagerWithNoSites()) {
      var noSitesMsg = document.createElement('div');
      noSitesMsg.className = 'bp08f-no-sites-msg';
      noSitesMsg.textContent = 'Aucun site ne vous est encore assign\u00e9. Contactez un administrateur.';
      listEl.appendChild(noSitesMsg);
    } else if(emptyEl) emptyEl.style.display='';
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
  const sOpen   = S.requests.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&(r.status==='new'||r.status==='in_progress'); }).length;
  const sAction = S.requests.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&r.status==='completed'; }).length;
  const sNoMatch= S.requests.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&r.status==='no_match'; }).length;
  // Last activity: most recent created_at for this site
  const siteReqs = S.requests.filter(function(r){ return (r.enterprise_request_context&&r.enterprise_request_context.site_id)===s.id&&r.created_at; });
  const lastAct  = siteReqs.reduce(function(acc, r){ return (!acc||r.created_at>acc)?r.created_at:acc; }, null);
  const lastActStr = lastAct ? new Date(lastAct).toLocaleDateString('fr-FR') : null;

  const div=document.createElement('div');
  // BP08C: inactive site gets visual indicator class
  div.className='ent-site-card'+(s.status==='inactive'?' bp08c-site-inactive':'');
  div.setAttribute('role','listitem');
  div.setAttribute('tabindex','0');
  div.setAttribute('data-site-id',s.id);
  div.setAttribute('aria-label',s.name+(s.city?' — '+s.city:''));
  div.innerHTML =
    '<div class="ent-site-card-top">'+
      '<div>'+
        '<div class="ent-site-name">'+safeHtml(s.name)+'</div>'+
        (s.city?'<div class="ent-site-city">'+safeHtml(s.city)+'</div>':'')+
      '</div>'+
      (sOpen||sAction||sNoMatch?'<div style="display:flex;gap:4px;flex-wrap:wrap">'+
        (sOpen?'<span class="ent-site-stat has-open">'+sOpen+' actif'+(sOpen>1?'s':'')+'</span>':'')+
        (sAction?'<span class="ent-site-stat" style="color:#f59e0b">'+sAction+' val.</span>':'')+
        (sNoMatch?'<span class="ent-site-stat" style="color:#ef4444">'+sNoMatch+' non traité</span>':'')+
      '</div>':'')+
    '</div>'+
    (s.address?'<div style="font-size:.78rem;color:var(--v2-text-3);margin-top:4px">'+safeHtml(s.address+(s.city?' — '+s.city:''))+'</div>':'')+
    (lastActStr?'<div style="font-size:.73rem;color:var(--v2-text-3);margin-top:4px">⏰ Dernière activité : '+safeHtml(lastActStr)+'</div>':'')+
    '<div style="font-size:.78rem;color:var(--v2-primary);margin-top:8px;font-weight:700">Voir le détail →</div>';
  // BP08C: append admin controls (DOM-safe, no innerHTML for user data)
  var adminControls = renderSiteAdminControls(s, S.userRole);
  if (adminControls) {
    div.appendChild(adminControls);
    wireSiteAdminControls(div, s);
  }
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
      .select('id, status, category, urgency, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .eq('enterprise_request_context.site_id', siteId)
      .in('status',['new','in_progress','completed'])
      .order('created_at',{ ascending:false })
      .limit(20);
    if(error) throw error;
    const reqs=data||[];
    renderSiteDetail(site, reqs, contentEl);
  } catch(err){
    contentEl.innerHTML='<div class="ent-error"><span>⚠️ '+safeHtml(_safeMsg(err,'Erreur de chargement.'))+'</span></div>';
  }
}

function renderSiteDetail(site, reqs, container) {
  const actionC  = reqs.filter(function(r){ return r.status==='completed'; }).length;
  const openC    = reqs.filter(function(r){ return r.status==='new'||r.status==='in_progress'; }).length;
  const newC     = reqs.filter(function(r){ return r.status==='new'; }).length;
  const inProgC  = reqs.filter(function(r){ return r.status==='in_progress'; }).length;
  const validC   = reqs.filter(function(r){ return r.status==='validated'; }).length;

  // This month stats
  const now = new Date();
  const thisMonthC = reqs.filter(function(r){
    if(!r.created_at) return false;
    const d = new Date(r.created_at);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }).length;

  // Category distribution
  const catCount = {};
  reqs.forEach(function(r){ if(r.category){ catCount[r.category]=(catCount[r.category]||0)+1; } });
  const topCats = Object.entries(catCount).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3);

  // Quick stats row
  const quickStatsHtml =
    '<div class="ent-site-quick-stats">'+
      '<div class="ent-site-quick-stat">'+
        '<div class="ent-site-quick-stat-val">'+reqs.length+'</div>'+
        '<div class="ent-site-quick-stat-label">Total</div>'+
      '</div>'+
      '<div class="ent-site-quick-stat">'+
        '<div class="ent-site-quick-stat-val" style="color:#60a5fa">'+openC+'</div>'+
        '<div class="ent-site-quick-stat-label">Actives</div>'+
      '</div>'+
      '<div class="ent-site-quick-stat">'+
        '<div class="ent-site-quick-stat-val" style="color:#f59e0b">'+actionC+'</div>'+
        '<div class="ent-site-quick-stat-label">\u00c0 valider</div>'+
      '</div>'+
      '<div class="ent-site-quick-stat">'+
        '<div class="ent-site-quick-stat-val" style="color:#86efac">'+thisMonthC+'</div>'+
        '<div class="ent-site-quick-stat-label">Ce mois</div>'+
      '</div>'+
    '</div>';

  // Status distribution
  const statusDistHtml =
    '<div class="ent-site-dist">'+
      '<span class="ent-site-dist-item"><span class="ent-site-dist-label">Nouvelle :</span><span class="ent-site-dist-count">'+newC+'</span></span>'+
      '<span class="ent-site-dist-item"><span class="ent-site-dist-label">En cours :</span><span class="ent-site-dist-count">'+inProgC+'</span></span>'+
      '<span class="ent-site-dist-item"><span class="ent-site-dist-label">Termin\u00e9e :</span><span class="ent-site-dist-count">'+actionC+'</span></span>'+
      '<span class="ent-site-dist-item"><span class="ent-site-dist-label">Valid\u00e9e :</span><span class="ent-site-dist-count">'+validC+'</span></span>'+
    '</div>';

  // Category distribution (top 3)
  const catDistHtml = topCats.length
    ? '<div class="ent-detail-section-title" style="margin-top:12px">Cat\u00e9gories principales</div>'+
      '<div class="ent-site-dist">'+
        topCats.map(function(c){ return '<span class="ent-site-dist-item"><span class="ent-site-dist-label">'+safeHtml(c[0])+' :</span><span class="ent-site-dist-count">'+c[1]+'</span></span>'; }).join('')+
      '</div>'
    : '';

  let html=
    quickStatsHtml+
    '<div class="ent-detail-section">'+
      '<div class="ent-detail-section-title">Informations du site</div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">Site</span><span class="ent-detail-val">'+safeHtml(site.name)+'</span></div>'+
      (site.address?'<div class="ent-detail-row"><span class="ent-detail-key">Adresse</span><span class="ent-detail-val">'+safeHtml(site.address+(site.city?' \u2014 '+site.city:''))+'</span></div>':'')+
      '<div class="ent-detail-row"><span class="ent-detail-key">En cours</span><span class="ent-detail-val">'+
        (openC?'<span class="ent-site-stat has-open">'+openC+' active'+(openC>1?'s':'')+'</span>':'<span style="color:var(--v2-text-3)">0</span>')+
      '</span></div>'+
      '<div class="ent-detail-row"><span class="ent-detail-key">\u00c0 valider</span><span class="ent-detail-val">'+
        (actionC?'<span class="ent-site-stat" style="color:#f59e0b">'+actionC+' \u00e0 valider</span>':'<span style="color:var(--v2-text-3)">0</span>')+
      '</span></div>'+
      '<div class="ent-detail-section-title" style="margin-top:12px">R\u00e9partition des statuts</div>'+
      statusDistHtml+
      catDistHtml+
    '</div>';

  if(canCreate(S.userRole)){
    html+='<div class="ent-detail-actions">'+
      '<button class="fxv2-btn fxv2-btn-primary ent-action-primary" id="site-detail-new-btn">\u2795 Nouvelle demande pour ce site</button>'+
    '</div>';
  }

  if(reqs.length){
    html+='<div class="ent-detail-section"><div class="ent-detail-section-title">Interventions actives</div><div id="site-detail-req-list" class="fxv2-card-list" role="list"></div></div>';
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
    // BP08B: include status in query; NO active-only filter (owner/admin must see all statuses)
    const { data, error } = await _sb
      .from('enterprise_members')
      .select('id, role, status, user_id, users!inner(email, full_name)')
      .eq('enterprise_id', S.activeEnterprise.id)
      .order('role')
      .order('status');
    if(error) throw error;
    S.members=data||[];
    // BP08F: load site assignments for all members (owner/admin view)
    var { data: asnData } = await _sb.from('enterprise_member_sites')
      .select('member_id, site_id').eq('enterprise_id', S.activeEnterprise.id);
    S.memberAssignments = {};
    (asnData||[]).forEach(function(a){
      if(!S.memberAssignments[a.member_id]) S.memberAssignments[a.member_id]=[];
      S.memberAssignments[a.member_id].push(a.site_id);
    });
    renderMembers(S.members, listEl, emptyEl);
    renderInvitePanel();
  } catch(err){
    if(listEl) listEl.innerHTML='';
    if(errEl){ errEl.style.display=''; }
    if(errMsgEl){ errMsgEl.textContent=_safeMsg(err,'Erreur de chargement.'); }
  }
}

// BP08B: status badge helper
function memberStatusBadge(status) {
  var label = { active: 'Actif', suspended: 'Suspendu', removed: 'Retiré', invited: 'Invité' }[status] || status;
  var cls   = { active: 'bp08b-badge-active', suspended: 'bp08b-badge-suspended',
                removed: 'bp08b-badge-removed', invited: 'bp08b-badge-invited' }[status] || '';
  return '<span class="bp08b-member-status-badge '+safeHtml(cls)+'">'+safeHtml(label)+'</span>';
}

// BP08B: role selector options (no owner)
var BP08B_ROLES = [
  {v:'admin',            l:'Administrateur'},
  {v:'operations_manager',l:'Responsable opérations'},
  {v:'site_manager',     l:'Responsable site'},
  {v:'reporter',         l:'Rapporteur'},
  {v:'viewer',           l:'Lecteur'}
];

// BP08B: in-progress state per member (prevents double-submit)
var _memberActionPending = {};

function renderMembers(members, listEl, emptyEl) {
  if(!listEl) return;
  if(!members.length){
    listEl.innerHTML='';
    if(emptyEl) emptyEl.style.display='';
    return;
  }
  if(emptyEl) emptyEl.style.display='none';
  listEl.innerHTML='';

  var isManager = (S.userRole==='owner'||S.userRole==='admin');

  members.forEach(function(m){
    var profile  = m.users||{};
    var fullName = profile.full_name||profile.email||m.user_id;
    var initials = fullName.split(' ').slice(0,2).map(function(w){return w.charAt(0).toUpperCase();}).join('');
    var isOwnerRow   = (m.role==='owner');
    var callerIsAdmin = (S.userRole==='admin');
    // Admin cannot act on owner rows; owner can act on any non-self-last-owner
    var canAct = isManager && !(callerIsAdmin && isOwnerRow);

    var div = document.createElement('div');
    div.className = 'ent-member-card bp08b-member-card' + (m.status!=='active'?' bp08b-member-inactive':'');
    div.setAttribute('role','listitem');
    div.setAttribute('data-member-id', m.id);

    var actionsHtml = '';
    if(canAct) {
      // Role selector (disabled for owner rows — no promotion to owner via UI)
      var roleOpts = BP08B_ROLES.map(function(r){
        return '<option value="'+safeHtml(r.v)+'"'+(m.role===r.v?' selected':'')+'>'+safeHtml(r.l)+'</option>';
      }).join('');
      actionsHtml +=
        '<div class="bp08b-member-actions" role="group" aria-label="Actions membre">'+
          '<select class="bp08b-role-select" aria-label="Rôle" data-mid="'+safeHtml(m.id)+'" data-current-role="'+safeHtml(m.role)+'">'+
          roleOpts+'</select>'+
          '<button class="bp08b-btn bp08b-btn-role" data-mid="'+safeHtml(m.id)+'" title="Appliquer rôle">✓ Rôle</button>';

      if(m.status==='active') {
        if(isOwnerRow) {
          // Owner row — suspend/remove shown but disabled (last-owner protection)
          actionsHtml +=
            '<button class="bp08b-btn bp08b-btn-suspend" data-mid="'+safeHtml(m.id)+'" '+
            'disabled aria-disabled="true" title="Protégé: seul propriétaire actif">Suspendre</button>'+
            '<button class="bp08b-btn bp08b-btn-remove" data-mid="'+safeHtml(m.id)+'" '+
            'disabled aria-disabled="true" title="Protégé: seul propriétaire actif">Retirer</button>';
        } else {
          actionsHtml +=
            '<button class="bp08b-btn bp08b-btn-suspend" data-mid="'+safeHtml(m.id)+'">Suspendre</button>'+
            '<button class="bp08b-btn bp08b-btn-remove" data-mid="'+safeHtml(m.id)+'">Retirer</button>';
        }
      } else if(m.status==='suspended') {
        actionsHtml +=
          '<button class="bp08b-btn bp08b-btn-reactivate" data-mid="'+safeHtml(m.id)+'">Réactiver</button>'+
          '<button class="bp08b-btn bp08b-btn-remove" data-mid="'+safeHtml(m.id)+'">Retirer</button>';
      } else if(m.status==='removed') {
        actionsHtml += '<span class="bp08b-label-removed" aria-label="Membre retiré">Retiré (définitif)</span>';
      }
      actionsHtml += '<div class="bp08b-member-feedback" id="mbfb-'+safeHtml(m.id)+'" aria-live="polite"></div></div>';
    }

    div.innerHTML =
      '<div class="ent-member-avatar" aria-hidden="true">'+safeHtml(initials||'?')+'</div>'+
      '<div class="ent-member-info">'+
        '<div class="ent-member-name">'+safeHtml(fullName)+'</div>'+
        '<div class="ent-member-role-line">'+safeHtml(formatRole(m.role))+' '+memberStatusBadge(m.status)+'</div>'+
        (profile.email?'<div class="ent-member-email">'+safeHtml(profile.email)+'</div>':'')+
        actionsHtml+
      '</div>';
    // BP08F: assignment section for site_manager members (owner/admin only)
    if(canAct && m.role === 'site_manager') {
      var assignSection = buildAssignmentSection(m);
      var infoDiv = div.querySelector('.ent-member-info');
      if(infoDiv) infoDiv.appendChild(assignSection);
      else div.appendChild(assignSection);
    }
    listEl.appendChild(div);
  });

  // Wire action buttons (event delegation on list)
  listEl.onclick = null; // reset before re-wiring
  listEl.addEventListener('click', function bp08bClickHandler(e) {
    var btn = e.target.closest('button[data-mid]');
    if(!btn||!btn.dataset.mid) return;
    var mid  = btn.dataset.mid;
    if(_memberActionPending[mid]) return;
    if(btn.classList.contains('bp08b-btn-role')) {
      var sel = listEl.querySelector('.bp08b-role-select[data-mid="'+mid+'"]');
      if(!sel) return;
      var newRole = sel.value;
      var curRole = sel.dataset.currentRole;
      if(newRole===curRole) { showMemberFeedback(mid,'Aucun changement.','info'); return; }
      confirmMemberAction(mid,'Changer le rôle vers «'+formatRole(newRole)+'» ?',function(){
        doMemberRoleChange(mid, newRole);
      });
    } else if(btn.classList.contains('bp08b-btn-suspend')) {
      confirmMemberAction(mid,'Suspendre ce membre ?',function(){ doMemberStatusChange(mid,'suspended'); });
    } else if(btn.classList.contains('bp08b-btn-remove')) {
      confirmMemberAction(mid,'Retirer définitivement ce membre ? Cette action est irréversible.',function(){
        doMemberStatusChange(mid,'removed');
      });
    } else if(btn.classList.contains('bp08b-btn-reactivate')) {
      confirmMemberAction(mid,'Réactiver ce membre ?',function(){ doMemberStatusChange(mid,'active'); });
    }
  }, {once:false});

  // Hide old mutation note
  var mutNote=$e('members-mutation-note');
  if(mutNote) { mutNote.style.display='none'; mutNote.setAttribute('aria-hidden','true'); }
}

// ── BP08F: buildAssignmentSection
function buildAssignmentSection(m) {
  var div = document.createElement('div');
  div.className = 'bp08f-assign-section';
  div.setAttribute('aria-label', 'Gestion des sites assignés');

  var label = document.createElement('div');
  label.className = 'bp08f-assign-label';
  label.textContent = 'Sites assignés :';
  div.appendChild(label);

  var siteList = document.createElement('div');
  siteList.className = 'bp08f-assign-site-list';
  siteList.setAttribute('role', 'group');

  var currentAssigned = S.memberAssignments[m.id] || [];
  var allSites = S.sites || [];

  allSites.forEach(function(site) {
    var row = document.createElement('label');
    row.className = 'bp08f-assign-site-row';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = site.id;
    cb.checked = currentAssigned.includes(site.id);
    if(site.status === 'inactive') cb.setAttribute('data-inactive','true');
    row.appendChild(cb);
    var nameSpan = document.createElement('span');
    nameSpan.textContent = site.name + (site.city ? ' — ' + site.city : '') + (site.status === 'inactive' ? ' (inactif)' : '');
    row.appendChild(nameSpan);
    siteList.appendChild(row);
  });

  div.appendChild(siteList);

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bp08f-btn-save-assign';
  saveBtn.setAttribute('data-mid', m.id);
  saveBtn.textContent = 'Enregistrer';
  div.appendChild(saveBtn);

  var fb = document.createElement('div');
  fb.className = 'bp08f-assign-feedback';
  fb.id = 'asgnfb-' + m.id;
  fb.setAttribute('aria-live', 'polite');
  div.appendChild(fb);

  // Wire save button
  saveBtn.addEventListener('click', function() {
    var selected = Array.from(siteList.querySelectorAll('input[type=checkbox]:checked')).map(function(cb){ return cb.value; });
    doSaveAssignments(m.id, selected);
  });

  return div;
}

// ── BP08F: doSaveAssignments
async function doSaveAssignments(mid, siteIds) {
  if(!S.activeEnterprise) return;
  var fbEl = document.getElementById('asgnfb-'+mid);
  if(fbEl) { fbEl.textContent = 'Enregistrement…'; fbEl.className='bp08f-assign-feedback bp08f-fb-info'; }
  try {
    var res = await _sb.rpc('set_enterprise_member_sites', {
      p_enterprise_id: S.activeEnterprise.id,
      p_member_id:     mid,
      p_site_ids:      siteIds
    });
    // BP09-FIX-03: check Supabase transport error before inspecting data
    if(res.error) throw res.error;
    var d = res.data;
    if(!d||!d.ok) {
      var reason = (d&&d.reason)||'error';
      var msg = {
        forbidden:              'Permission refusée.',
        member_not_found:       'Membre introuvable.',
        target_not_site_manager:'Ce membre n\'est pas site_manager.',
        target_not_active:      'Ce membre n\'est pas actif.',
        site_not_found:         'Site introuvable.',
        site_enterprise_mismatch:'Site hors de cet enterprise.',
        no_change:              'Aucun changement.',
        unauthenticated:        'Session expirée.'
      }[reason]||('Erreur: '+reason);
      if(fbEl){ fbEl.textContent=msg; fbEl.className='bp08f-assign-feedback '+(reason==='no_change'?'bp08f-fb-info':'bp08f-fb-error'); }
    } else {
      if(fbEl){ fbEl.textContent='Sites mis à jour.'; fbEl.className='bp08f-assign-feedback bp08f-fb-success'; }
      setTimeout(function(){ loadMembers(); }, 800);
    }
  } catch(err) {
    if(fbEl){ fbEl.textContent=_safeMsg(err,'Erreur.'); fbEl.className='bp08f-assign-feedback bp08f-fb-error'; }
  }
}

function showMemberFeedback(mid, msg, type) {
  var el = document.getElementById('mbfb-'+mid);
  if(!el) return;
  el.textContent = msg;
  el.className = 'bp08b-member-feedback bp08b-fb-'+(type||'info');
  setTimeout(function(){ el.textContent=''; el.className='bp08b-member-feedback'; }, 4000);
}

function confirmMemberAction(mid, message, onConfirm) {
  // Simple inline confirmation via feedback area before destructive action.
  var el = document.getElementById('mbfb-'+mid);
  if(!el) { onConfirm(); return; }
  el.innerHTML = safeHtml(message)+
    ' <button class="bp08b-btn-confirm-yes" style="margin-left:4px">Confirmer</button>'+
    ' <button class="bp08b-btn-confirm-no">Annuler</button>';
  el.className = 'bp08b-member-feedback bp08b-fb-warn';
  el.querySelector('.bp08b-btn-confirm-yes').onclick = function(){
    el.innerHTML=''; el.className='bp08b-member-feedback';
    onConfirm();
  };
  el.querySelector('.bp08b-btn-confirm-no').onclick = function(){
    el.innerHTML=''; el.className='bp08b-member-feedback';
  };
}

async function doMemberRoleChange(mid, newRole) {
  if(!S.activeEnterprise) return;
  _memberActionPending[mid] = true;
  showMemberFeedback(mid, 'En cours…', 'info');
  try {
    var res = await _sb.rpc('update_enterprise_member_role', {
      p_enterprise_id: S.activeEnterprise.id,
      p_member_id:     mid,
      p_new_role:      newRole
    });
    // BP09-FIX-03: check Supabase transport error before inspecting data
    if(res.error) throw res.error;
    var d = res.data;
    if(!d||!d.ok) {
      var reason = (d&&d.reason)||'error';
      var msg = {
        forbidden:                 'Permission refusée.',
        cannot_modify_owner:       'Impossible de modifier un propriétaire.',
        owner_invariant_violation: 'Dernier propriétaire actif — action impossible.',
        invalid_role:              'Rôle invalide.',
        member_not_found:          'Membre introuvable.',
        caller_not_active:         'Votre compte n\'est pas actif.',
        unauthenticated:           'Session expirée.',
        no_change:                 'Aucun changement.'
      }[reason]||('Erreur: '+reason);
      showMemberFeedback(mid, msg, reason==='no_change'?'info':'error');
    } else {
      showMemberFeedback(mid, 'Rôle mis à jour.', 'success');
      setTimeout(function(){ loadMembers(); }, 800);
    }
  } catch(err) {
    showMemberFeedback(mid, _safeMsg(err,'Erreur réseau.'), 'error');
  } finally {
    _memberActionPending[mid] = false;
  }
}

async function doMemberStatusChange(mid, newStatus) {
  if(!S.activeEnterprise) return;
  _memberActionPending[mid] = true;
  showMemberFeedback(mid, 'En cours…', 'info');
  try {
    var res = await _sb.rpc('set_enterprise_member_status', {
      p_enterprise_id: S.activeEnterprise.id,
      p_member_id:     mid,
      p_new_status:    newStatus
    });
    // BP09-FIX-03: check Supabase transport error before inspecting data
    if(res.error) throw res.error;
    var d = res.data;
    if(!d||!d.ok) {
      var reason = (d&&d.reason)||'error';
      var msg = {
        forbidden:                 'Permission refusée.',
        cannot_modify_owner:       'Impossible de modifier un propriétaire.',
        owner_invariant_violation: 'Dernier propriétaire actif — action impossible.',
        member_already_removed:    'Ce membre est déjà retiré.',
        caller_not_active:         'Votre compte n\'est pas actif.',
        unauthenticated:           'Session expirée.',
        invalid_status:            'Statut invalide.'
      }[reason]||('Erreur: '+reason);
      showMemberFeedback(mid, msg, 'error');
    } else {
      var labels = {suspended:'Membre suspendu.',removed:'Membre retiré.',active:'Membre réactivé.'};
      showMemberFeedback(mid, labels[newStatus]||'Statut mis à jour.', 'success');
      setTimeout(function(){ loadMembers(); }, 800);
    }
  } catch(err) {
    showMemberFeedback(mid, _safeMsg(err,'Erreur réseau.'), 'error');
  } finally {
    _memberActionPending[mid] = false;
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
  if(S.historyLoading) return;
  S.historyLoading = true;
  setLoading('section-history', true);
  if(reset){
    S.history=[]; S.historyCursor=null; S.historyExhausted=false;
  }
  if(S.historyExhausted&&!reset) { S.historyLoading=false; setLoading('section-history',false); return; }

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
      .select('id, status, category, urgency, description, created_at, enterprise_request_context!inner(enterprise_id, site_id)')
      .eq('enterprise_request_context.enterprise_id', S.activeEnterprise.id)
      .in('status', HIST_STATUSES)
      .order('created_at',{ ascending:false })
      .order('id',{ ascending:false })
      .limit(PAGE_SIZE+1);

    if(S.histSiteFilter) q=q.eq('enterprise_request_context.site_id', S.histSiteFilter);

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
    if(errMsgEl){ errMsgEl.textContent=_safeMsg(err,'Erreur de chargement.'); }
  } finally {
    S.historyLoading = false;
    setLoading('section-history', false);
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
      '<div class="ent-account-row"><span class="ent-account-label">Email</span><span class="ent-account-val">'+safeHtml(S.userEmail||'—')+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Votre rôle</span><span class="ent-account-val">'+safeHtml(formatRole(S.userRole))+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Création demandes</span><span class="ent-account-val">'+(canCreate(S.userRole)?'Autorisé':'Non autorisé')+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Validation missions</span><span class="ent-account-val">'+(canConfirm(S.userRole)?'Autorisé':'Non autorisé')+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Sites enregistrés</span><span class="ent-account-val">'+safeHtml(String(S.sites.length||0))+'</span></div>'+
      '<div class="ent-account-row"><span class="ent-account-label">Membres</span><span class="ent-account-val">'+safeHtml(String(S.members.length||0))+'</span></div>'+
      (S.enterprises.length>1?
        '<div class="ent-account-row"><span class="ent-account-label">Espaces</span>'+
        '<span class="ent-account-val">'+S.enterprises.map(function(e){ return safeHtml(e.name); }).join(', ')+'</span></div>':'')+
    '</div>';

  // BP08D: append account edit form for owner/admin (DOM-only, no innerHTML for user data)
  if (isManager(S.userRole)) {
    var editWrap = document.createElement('div');
    editWrap.className = 'bp08d-account-edit-form';

    var heading = document.createElement('div');
    heading.className = 'ent-detail-section-title';
    heading.textContent = 'Modifier les informations du compte';
    editWrap.appendChild(heading);

    var nameField = document.createElement('div');
    nameField.className = 'bp08d-account-field';
    var nameLabel = document.createElement('label');
    nameLabel.setAttribute('for', 'bp08d-name-input');
    nameLabel.textContent = 'Nom de l’organisation';
    var nameInput = document.createElement('input');
    nameInput.className = 'fxv2-input';
    nameInput.id = 'bp08d-name-input';
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('placeholder', 'Nom');
    nameInput.setAttribute('aria-label', 'Nom de l’organisation');
    nameInput.value = S.activeEnterprise.name || '';
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);
    editWrap.appendChild(nameField);

    var legalField = document.createElement('div');
    legalField.className = 'bp08d-account-field';
    var legalLabel = document.createElement('label');
    legalLabel.setAttribute('for', 'bp08d-legal-name-input');
    legalLabel.textContent = 'Raison sociale (optionnel)';
    var legalInput = document.createElement('input');
    legalInput.className = 'fxv2-input';
    legalInput.id = 'bp08d-legal-name-input';
    legalInput.setAttribute('type', 'text');
    legalInput.setAttribute('placeholder', 'Raison sociale');
    legalInput.setAttribute('aria-label', 'Raison sociale');
    legalInput.value = S.activeEnterprise.legal_name || '';
    legalField.appendChild(legalLabel);
    legalField.appendChild(legalInput);
    editWrap.appendChild(legalField);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'bp08d-account-save-btn fxv2-btn fxv2-btn-primary';
    saveBtn.setAttribute('type', 'button');
    saveBtn.textContent = 'Enregistrer';
    editWrap.appendChild(saveBtn);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'bp08d-account-feedback';
    feedbackEl.setAttribute('aria-live', 'polite');
    editWrap.appendChild(feedbackEl);

    saveBtn.addEventListener('click', function() {
      var name      = nameInput.value.trim();
      var legalName = legalInput.value.trim();
      if (!name) { showAccountFeedback('Le nom est requis.', true); return; }
      saveBtn.disabled = true;
      showAccountFeedback('En cours…', false);
      doAccountUpdate(S.activeEnterprise.id, name, legalName)
        .then(function(result) {
          saveBtn.disabled = false;
          if (!result || result.ok === false) {
            var msg = (result && result.reason) ? result.reason : 'Erreur lors de la mise à jour.';
            showAccountFeedback(msg, true);
          } else {
            S.activeEnterprise.name = name;
            if (legalName) S.activeEnterprise.legal_name = legalName;
            showAccountFeedback('Informations mises à jour.', false);
          }
        })
        .catch(function(err) {
          saveBtn.disabled = false;
          showAccountFeedback(_safeMsg(err,'Erreur réseau.'), true);
        });
    });

    contentEl.appendChild(editWrap);
  }
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
      document.querySelectorAll('.ent-urgency-btn').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
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

  document.querySelectorAll('.ent-urgency-btn').forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  // Default urgency: first button (data-value="") = normale
  const normalBtn=document.querySelector('.ent-urgency-btn[data-value=""]');
  if(normalBtn){ normalBtn.classList.add('active'); normalBtn.setAttribute('aria-pressed','true'); }

  // Prefill site if coming from site-detail
  if(S.prefillSiteId){
    const siteSel=$e('req-site');
    if(siteSel) siteSel.value=S.prefillSiteId;
    const siteHint=$e('site-hint');
    const site=S.sites.find(function(s){ return s.id===S.prefillSiteId; });
    if(siteHint&&site) siteHint.textContent='Site sélectionné : '+site.name;
    S.prefillSiteId=null;
  }

  // Populate site select — BP08C: active sites only
  const siteSel=$e('req-site');
  if(siteSel){
    while(siteSel.options.length>1) siteSel.remove(1);
    S.sites.filter(function(s){ return s.status === 'active'; }).forEach(function(s){
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
  const _urgBtn  = document.querySelector('.ent-urgency-btn.active');
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
    const newId=(data&&(data.service_request_id||data.request_id||data.id))||null;
    if(viewBtn&&newId){ viewBtn.dataset.requestId=newId; }
    form.reset();
    const descChars=$e('desc-chars'); if(descChars) descChars.textContent='0';
    await refreshKpis(); renderNavBadge();

  } catch(err){
    S.formSubmitting=false;
    if(submitBtn) submitBtn.disabled=false;
    if(submitSpin) submitSpin.style.display='none';
    if(submitText) submitText.style.display='';
    if(errEl){ errEl.textContent=_safeMsg(err,'Erreur lors de la création.'); errEl.style.display=''; }
  }
}

// ── DOMContentLoaded bootstrap
// BP09-FIX-01 (cont.): Wait for FixeoSupabaseClient.ready() before bootApp()
// so that _sbClient() returns a real client (not null) when bootApp() runs.
document.addEventListener('DOMContentLoaded', function() {
  if (window.FixeoSupabaseClient && typeof window.FixeoSupabaseClient.ready === 'function') {
    window.FixeoSupabaseClient.ready().then(function() {
      attachAuthListener();
      bootApp();
    }).catch(function(err) {
      // SDK load failure — show error gate
      const msg = $e('ent-gate-msg');
      if (msg) msg.textContent = 'Impossible de charger le SDK. ' + (err && err.message ? err.message : '');
      showGate('ent-access-denied');
    });
  } else {
    // Fallback: FixeoSupabaseClient not present; try direct boot (QA/mock environment)
    attachAuthListener();
    bootApp();
  }
});

// ══════════════════════════════════════════════════════════════
// WORKSTREAM D — GLOBAL SEARCH PALETTE
// ══════════════════════════════════════════════════════════════

let _searchPrevFocus = null;
let _searchTrapRelease = null;

function openSearch() {
  if(S.searchOpen) return;
  if(S.cmdOpen) closeCmdPalette();
  S.searchOpen = true;
  const dlg = $e('ent-search-dialog');
  if(!dlg) return;
  dlg.style.display = '';
  dlg.hidden = false;
  _searchPrevFocus = document.activeElement;
  _searchTrapRelease = trapFocus(dlg);
  const inp = $e('ent-search-q');
  if(inp){ inp.value = ''; inp.focus(); }
  renderSearchResults('');
}

function closeSearch() {
  if(!S.searchOpen) return;
  S.searchOpen = false;
  if(typeof _searchTrapRelease==='function'){ _searchTrapRelease(); _searchTrapRelease=null; }
  const dlg = $e('ent-search-dialog');
  if(dlg){ dlg.style.display='none'; dlg.hidden=true; }
  if(_searchPrevFocus && typeof _searchPrevFocus.focus==='function') _searchPrevFocus.focus();
  _searchPrevFocus = null;
}

function runSearch(query) {
  query = (query||'').trim().toLowerCase();
  const q = query;
  const results = { interventions: [], sites: [], members: [] };
  if(q.length === 0) return results;

  (S.requests||[]).forEach(function(r){
    const hay = ((r.category||'') + ' ' + (r.description||'')).toLowerCase();
    if(hay.includes(q)) results.interventions.push({ type:'request', item:r });
  });
  (S.history||[]).forEach(function(r){
    const hay = ((r.category||'') + ' ' + (r.description||'')).toLowerCase();
    if(hay.includes(q)) results.interventions.push({ type:'history', item:r });
  });
  results.interventions = results.interventions.slice(0,5);

  (S.sites||[]).forEach(function(s){
    const hay = ((s.name||'') + ' ' + (s.city||'')).toLowerCase();
    if(hay.includes(q)) results.sites.push(s);
  });
  results.sites = results.sites.slice(0,5);

  (S.members||[]).forEach(function(m){
    const hay = ((m.full_name||'') + ' ' + (m.email||'')).toLowerCase();
    if(hay.includes(q)) results.members.push(m);
  });
  results.members = results.members.slice(0,5);

  return results;
}

function renderSearchResults(query) {
  const container = $e('ent-search-results');
  if(!container) return;
  const results = runSearch(query);
  const hasAny = results.interventions.length || results.sites.length || results.members.length;
  let html = '';

  if(!query || query.trim().length===0) {
    container.innerHTML = '<div class="ent-search-empty">Commencez à taper pour rechercher\u2026</div>';
    return;
  }
  if(!hasAny) {
    container.innerHTML = '<div class="ent-search-empty">Aucun résultat pour <strong>' + safeHtml(query) + '</strong></div>';
    return;
  }

  function statusIcon(status) {
    var m = { open:'\uD83D\uDD35', in_progress:'\uD83D\uDFE1', done:'\uD83D\uDFE2', cancelled:'\u26AB' };
    return m[status] || '\u26AA';
  }

  if(results.interventions.length) {
    html += '<div class="ent-search-group-label">Interventions</div>';
    results.interventions.forEach(function(entry){
      var r = entry.item;
      var icon = entry.type==='history' ? '\uD83D\uDCC2' : '\uD83D\uDCCB';
      var title = safeHtml(r.category || 'Sans catégorie');
      var sub = safeHtml((r.description||'').slice(0,60) || '\u2014');
      html += '<div class="ent-search-item" role="option" tabindex="-1"'
        + ' data-search-action="request" data-search-id="' + safeHtml(r.id) + '" aria-selected="false">'
        + '<span class="ent-search-item-icon" aria-hidden="true">' + icon + '</span>'
        + '<div class="ent-search-item-main">'
        + '<div class="ent-search-item-title">' + title + '</div>'
        + '<div class="ent-search-item-sub">' + sub + '</div>'
        + '</div>'
        + '<span class="ent-search-item-badge" aria-hidden="true">' + statusIcon(r.status) + '</span>'
        + '</div>';
    });
  }
  if(results.sites.length) {
    html += '<div class="ent-search-group-label">Sites</div>';
    results.sites.forEach(function(s){
      var title = safeHtml(s.name || 'Site sans nom');
      var sub = safeHtml(s.city || '');
      html += '<div class="ent-search-item" role="option" tabindex="-1"'
        + ' data-search-action="site" data-search-id="' + safeHtml(s.id) + '" aria-selected="false">'
        + '<span class="ent-search-item-icon" aria-hidden="true">\uD83C\uDFD7\uFE0F</span>'
        + '<div class="ent-search-item-main">'
        + '<div class="ent-search-item-title">' + title + '</div>'
        + '<div class="ent-search-item-sub">' + sub + '</div>'
        + '</div></div>';
    });
  }
  if(results.members.length) {
    html += '<div class="ent-search-group-label">Membres</div>';
    results.members.forEach(function(m){
      var title = safeHtml(m.full_name || m.email || '\u2014');
      var sub = safeHtml(m.email || '');
      html += '<div class="ent-search-item" role="option" tabindex="-1"'
        + ' data-search-action="member" data-search-id="' + safeHtml(m.id) + '" aria-selected="false">'
        + '<span class="ent-search-item-icon" aria-hidden="true">\uD83D\uDC64</span>'
        + '<div class="ent-search-item-main">'
        + '<div class="ent-search-item-title">' + title + '</div>'
        + '<div class="ent-search-item-sub">' + sub + '</div>'
        + '</div></div>';
    });
  }

  container.innerHTML = html;
  container.querySelectorAll('.ent-search-item').forEach(function(el){
    el.addEventListener('click', function(){ _activateSearchItem(el); });
  });
}

function _activateSearchItem(el) {
  if(!el) return;
  var action = el.dataset.searchAction;
  var id = el.dataset.searchId;
  closeSearch();
  if(action==='request') navigateTo('request-detail', {requestId: id});
  else if(action==='site') navigateTo('site-detail', {siteId: id});
  else if(action==='member') navigateTo('members');
}

function _searchDialogKeydown(e) {
  var items = Array.from(document.querySelectorAll('#ent-search-results .ent-search-item'));
  var selectedIdx = items.findIndex(function(el){ return el.getAttribute('aria-selected')==='true'; });

  if(e.key==='Escape'){ e.preventDefault(); closeSearch(); return; }
  if(e.key==='ArrowDown'){
    e.preventDefault();
    var next = selectedIdx < items.length-1 ? selectedIdx+1 : 0;
    items.forEach(function(el,i){ el.setAttribute('aria-selected', i===next ? 'true' : 'false'); });
    if(items[next]) items[next].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='ArrowUp'){
    e.preventDefault();
    var prev = selectedIdx > 0 ? selectedIdx-1 : items.length-1;
    items.forEach(function(el,i){ el.setAttribute('aria-selected', i===prev ? 'true' : 'false'); });
    if(items[prev]) items[prev].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    var sel = document.querySelector('#ent-search-results .ent-search-item[aria-selected="true"]');
    if(sel) _activateSearchItem(sel);
    return;
  }
  if(e.key==='Tab'){
    e.preventDefault();
    var inp2 = $e('ent-search-q');
    if(inp2) inp2.focus();
  }
}

function _initSearchDialog() {
  var dlg = $e('ent-search-dialog');
  if(!dlg) return;
  var backdrop = $e('ent-search-backdrop');
  if(backdrop) backdrop.addEventListener('click', closeSearch);
  var inp = $e('ent-search-q');
  if(inp) inp.addEventListener('input', function(){ renderSearchResults(inp.value); });
  dlg.addEventListener('keydown', _searchDialogKeydown);
}

// ══════════════════════════════════════════════════════════════
// WORKSTREAM E — COMMAND PALETTE
// ══════════════════════════════════════════════════════════════

var COMMANDS = [
  { id: 'go-overview',  icon: '\uD83C\uDFE0', label: "Vue d'ensemble",       action: function(){ navigateTo('overview'); },      roles: 'all' },
  { id: 'go-requests',  icon: '\uD83D\uDCCB', label: 'Interventions',        action: function(){ navigateTo('requests'); },      roles: 'all' },
  { id: 'go-new',       icon: '\u2795',        label: 'Nouvelle intervention', action: function(){ navigateTo('new-request'); },   roles: CAN_CREATE_ROLES },
  { id: 'go-sites',     icon: '\uD83C\uDFD7\uFE0F', label: 'Sites',          action: function(){ navigateTo('sites'); },         roles: 'all' },
  { id: 'go-members',   icon: '\uD83D\uDC65', label: 'Membres',              action: function(){ navigateTo('members'); },       roles: 'all' },
  { id: 'go-history',   icon: '\uD83D\uDCC2', label: 'Historique',           action: function(){ navigateTo('history'); },       roles: 'all' },
  { id: 'go-account',   icon: '\u2699\uFE0F', label: 'Compte',               action: function(){ navigateTo('account'); },       roles: 'all' },
  { id: 'open-search',  icon: '\uD83D\uDD0D', label: 'Recherche rapide',     action: function(){ openSearch(); },                roles: 'all' },
  { id: 'refresh',      icon: '\uD83D\uDD04', label: 'Rafra\xEEchir',        action: function(){ refreshPolled(); },             roles: 'all' },
  { id: 'sign-out',     icon: '\uD83D\uDEAA', label: 'D\xE9connexion',       action: function(){ doSignOut(); },                 roles: 'all' },
];

var _cmdPrevFocus = null;
var _cmdTrapRelease = null;

function _visibleCommands(query) {
  var q = (query||'').trim().toLowerCase();
  return COMMANDS.filter(function(cmd){
    if(cmd.roles !== 'all' && !cmd.roles.includes(S.userRole)) return false;
    if(!q) return true;
    return cmd.label.toLowerCase().includes(q) || cmd.id.includes(q);
  });
}

function openCmdPalette() {
  if(S.cmdOpen) return;
  if(S.searchOpen) closeSearch();
  S.cmdOpen = true;
  S.cmdIndex = 0;
  var dlg = $e('ent-cmd-palette');
  if(!dlg) return;
  dlg.style.display = '';
  dlg.hidden = false;
  _cmdPrevFocus = document.activeElement;
  _cmdTrapRelease = trapFocus(dlg);
  var inp = $e('ent-cmd-input');
  if(inp){ inp.value = ''; inp.focus(); }
  renderCmdItems('');
}

function closeCmdPalette() {
  if(!S.cmdOpen) return;
  S.cmdOpen = false;
  if(typeof _cmdTrapRelease==='function'){ _cmdTrapRelease(); _cmdTrapRelease=null; }
  var dlg = $e('ent-cmd-palette');
  if(dlg){ dlg.style.display='none'; dlg.hidden=true; }
  if(_cmdPrevFocus && typeof _cmdPrevFocus.focus==='function') _cmdPrevFocus.focus();
  _cmdPrevFocus = null;
}

function renderCmdItems(query) {
  var list = $e('ent-cmd-list');
  if(!list) return;
  var cmds = _visibleCommands(query);
  if(!cmds.length){
    list.innerHTML = '<div class="ent-search-empty">Aucune commande trouvée</div>';
    S.cmdIndex = 0;
    return;
  }
  var html = '';
  cmds.forEach(function(cmd, idx){
    var sel = idx === S.cmdIndex ? 'true' : 'false';
    html += '<div class="ent-search-item ent-cmd-item" role="option" tabindex="-1"'
      + ' data-cmd-id="' + safeHtml(cmd.id) + '" aria-selected="' + sel + '">'
      + '<span class="ent-search-item-icon" aria-hidden="true">' + cmd.icon + '</span>'
      + '<div class="ent-search-item-main">'
      + '<div class="ent-search-item-title">' + safeHtml(cmd.label) + '</div>'
      + '</div></div>';
  });
  list.innerHTML = html;

  list.querySelectorAll('.ent-cmd-item').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.dataset.cmdId;
      var cmd = COMMANDS.find(function(c){ return c.id===id; });
      closeCmdPalette();
      if(cmd) cmd.action();
    });
  });

  var selEl = list.querySelector('.ent-cmd-item[aria-selected="true"]');
  if(selEl) selEl.scrollIntoView({block:'nearest'});
}

function _cmdPaletteKeydown(e) {
  var list = $e('ent-cmd-list');
  var items = list ? Array.from(list.querySelectorAll('.ent-cmd-item')) : [];

  if(e.key==='Escape'){ e.preventDefault(); closeCmdPalette(); return; }
  if(e.key==='ArrowDown'){
    e.preventDefault();
    S.cmdIndex = S.cmdIndex < items.length-1 ? S.cmdIndex+1 : 0;
    items.forEach(function(el,i){ el.setAttribute('aria-selected', i===S.cmdIndex ? 'true' : 'false'); });
    if(items[S.cmdIndex]) items[S.cmdIndex].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='ArrowUp'){
    e.preventDefault();
    S.cmdIndex = S.cmdIndex > 0 ? S.cmdIndex-1 : items.length-1;
    items.forEach(function(el,i){ el.setAttribute('aria-selected', i===S.cmdIndex ? 'true' : 'false'); });
    if(items[S.cmdIndex]) items[S.cmdIndex].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    var inp3 = $e('ent-cmd-input');
    var q = inp3 ? inp3.value : '';
    var cmds = _visibleCommands(q);
    var cmd = cmds[S.cmdIndex];
    if(cmd){ closeCmdPalette(); cmd.action(); }
    return;
  }
  if(e.key==='Tab'){
    e.preventDefault();
    var inp4 = $e('ent-cmd-input');
    if(inp4) inp4.focus();
  }
}

function _initCmdPalette() {
  var dlg = $e('ent-cmd-palette');
  if(!dlg) return;
  var backdrop = $e('ent-cmd-backdrop');
  if(backdrop) backdrop.addEventListener('click', closeCmdPalette);
  var inp = $e('ent-cmd-input');
  if(inp){
    inp.addEventListener('input', function(){
      S.cmdIndex = 0;
      renderCmdItems(inp.value);
    });
  }
  dlg.addEventListener('keydown', _cmdPaletteKeydown);
}

/* ============================================================
   BP08C — Site Administration UI
   ============================================================ */

// ── BP08C helpers ─────────────────────────────────────────────────────────────
function isManager(role) { return role === 'owner' || role === 'admin'; }

const BP08C_SITE_STATUSES = ['active', 'inactive'];
var   _siteActionPending  = {};

function siteStatusBadge(status) {
  return { active: 'Actif', inactive: 'Inactif' }[status] || status;
}

// ── BP08C: render admin controls per site card (DOM-only, no innerHTML for user data) ──
function renderSiteAdminControls(site, callerRole) {
  if (!isManager(callerRole)) return null;

  var wrap = document.createElement('div');
  wrap.className = 'bp08c-site-edit-controls';

  var editBtn = document.createElement('button');
  editBtn.className = 'bp08c-site-edit-btn fxv2-btn fxv2-btn-ghost';
  editBtn.setAttribute('data-site-id', site.id);
  editBtn.setAttribute('aria-label', 'Modifier le site');
  editBtn.setAttribute('type', 'button');
  editBtn.textContent = '✏️ Modifier';

  var statusBadge = document.createElement('span');
  statusBadge.className = 'bp08c-site-status-badge bp08c-site-status-badge-' + site.status;
  statusBadge.textContent = siteStatusBadge(site.status);

  if (site.status === 'active') {
    var deactBtn = document.createElement('button');
    deactBtn.className = 'bp08c-site-deactivate-btn fxv2-btn fxv2-btn-ghost';
    deactBtn.setAttribute('data-site-id', site.id);
    deactBtn.setAttribute('aria-label', 'Désactiver le site');
    deactBtn.setAttribute('type', 'button');
    deactBtn.textContent = '⏸ Désactiver';
    wrap.appendChild(statusBadge);
    wrap.appendChild(editBtn);
    wrap.appendChild(deactBtn);
  } else {
    var actBtn = document.createElement('button');
    actBtn.className = 'bp08c-site-activate-btn fxv2-btn fxv2-btn-ghost';
    actBtn.setAttribute('data-site-id', site.id);
    actBtn.setAttribute('aria-label', 'Réactiver le site');
    actBtn.setAttribute('type', 'button');
    actBtn.textContent = '▶ Réactiver';
    wrap.appendChild(statusBadge);
    wrap.appendChild(editBtn);
    wrap.appendChild(actBtn);
  }

  // Inline edit form (initially hidden)
  var form = document.createElement('div');
  form.className = 'bp08c-site-inline-form';
  form.style.display = 'none';
  form.setAttribute('data-site-id', site.id);

  var nameInput = document.createElement('input');
  nameInput.className = 'bp08c-site-name-input fxv2-input';
  nameInput.setAttribute('type', 'text');
  nameInput.setAttribute('data-site-id', site.id);
  nameInput.setAttribute('placeholder', 'Nom du site');
  nameInput.setAttribute('aria-label', 'Nom du site');
  nameInput.value = site.name || '';

  var cityInput = document.createElement('input');
  cityInput.className = 'bp08c-site-city-input fxv2-input';
  cityInput.setAttribute('type', 'text');
  cityInput.setAttribute('data-site-id', site.id);
  cityInput.setAttribute('placeholder', 'Ville');
  cityInput.setAttribute('aria-label', 'Ville du site');
  cityInput.value = site.city || '';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bp08c-site-save-btn fxv2-btn fxv2-btn-primary';
  saveBtn.setAttribute('data-site-id', site.id);
  saveBtn.setAttribute('type', 'button');
  saveBtn.textContent = 'Enregistrer';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'bp08c-site-cancel-btn fxv2-btn fxv2-btn-ghost';
  cancelBtn.setAttribute('data-site-id', site.id);
  cancelBtn.setAttribute('type', 'button');
  cancelBtn.textContent = 'Annuler';

  var feedbackEl = document.createElement('div');
  feedbackEl.className = 'bp08c-site-feedback';
  feedbackEl.setAttribute('data-site-id', site.id);
  feedbackEl.setAttribute('aria-live', 'polite');
  feedbackEl.textContent = '';

  form.appendChild(nameInput);
  form.appendChild(cityInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);
  form.appendChild(feedbackEl);
  wrap.appendChild(form);

  return wrap;
}

// ── BP08C: wire admin controls click handlers ─────────────────────────────────
function wireSiteAdminControls(cardEl, site) {
  var editBtn  = cardEl.querySelector('.bp08c-site-edit-btn[data-site-id="' + site.id + '"]');
  var deactBtn = cardEl.querySelector('.bp08c-site-deactivate-btn[data-site-id="' + site.id + '"]');
  var actBtn   = cardEl.querySelector('.bp08c-site-activate-btn[data-site-id="' + site.id + '"]');
  var form     = cardEl.querySelector('.bp08c-site-inline-form[data-site-id="' + site.id + '"]');
  var saveBtn  = cardEl.querySelector('.bp08c-site-save-btn[data-site-id="' + site.id + '"]');
  var cancelBtn= cardEl.querySelector('.bp08c-site-cancel-btn[data-site-id="' + site.id + '"]');

  if (editBtn && form) {
    editBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      form.style.display = form.style.display === 'none' ? '' : 'none';
    });
  }

  if (cancelBtn && form) {
    cancelBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      form.style.display = 'none';
      showSiteFeedback(site.id, '', false);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (_siteActionPending[site.id]) return;
      var nameInput = cardEl.querySelector('.bp08c-site-name-input[data-site-id="' + site.id + '"]');
      var cityInput = cardEl.querySelector('.bp08c-site-city-input[data-site-id="' + site.id + '"]');
      var name = nameInput ? nameInput.value.trim() : site.name;
      var city = cityInput ? cityInput.value.trim() : site.city;
      if (!name) { showSiteFeedback(site.id, 'Le nom du site est requis.', true); return; }
      doSiteUpdate(S.activeEnterprise.id, site.id, name, city, site.site_code, site.address_line)
        .then(function(result) {
          if (!result || result.ok === false) {
            var msg = (result && result.reason) ? result.reason : 'Erreur lors de la mise à jour.';
            showSiteFeedback(site.id, msg, true);
          } else {
            showSiteFeedback(site.id, 'Site mis à jour.', false);
            // Update local state
            var idx = S.sites.findIndex(function(s){ return s.id === site.id; });
            if (idx >= 0) { S.sites[idx].name = name; S.sites[idx].city = city; }
            if (form) form.style.display = 'none';
          }
        })
        .catch(function(err) {
          showSiteFeedback(site.id, _safeMsg(err,'Erreur réseau.'), true);
        });
    });
  }

  if (deactBtn) {
    deactBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (_siteActionPending[site.id]) return;
      if (!window.confirm('Désactiver ce site ?')) return;
      doSiteStatusChange(S.activeEnterprise.id, site.id, 'inactive')
        .then(function(result) {
          if (!result || result.ok === false) {
            var msg = (result && result.reason) ? result.reason : 'Erreur lors de la désactivation.';
            showSiteFeedback(site.id, msg, true);
          } else {
            showSiteFeedback(site.id, 'Site désactivé.', false);
            var idx = S.sites.findIndex(function(s){ return s.id === site.id; });
            if (idx >= 0) S.sites[idx].status = 'inactive';
            setTimeout(function(){ loadSites(); }, 600);
          }
        })
        .catch(function(err) {
          showSiteFeedback(site.id, _safeMsg(err,'Erreur réseau.'), true);
        });
    });
  }

  if (actBtn) {
    actBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (_siteActionPending[site.id]) return;
      if (!window.confirm('Réactiver ce site ?')) return;
      doSiteStatusChange(S.activeEnterprise.id, site.id, 'active')
        .then(function(result) {
          if (!result || result.ok === false) {
            var msg = (result && result.reason) ? result.reason : 'Erreur lors de la réactivation.';
            showSiteFeedback(site.id, msg, true);
          } else {
            showSiteFeedback(site.id, 'Site réactivé.', false);
            var idx = S.sites.findIndex(function(s){ return s.id === site.id; });
            if (idx >= 0) S.sites[idx].status = 'active';
            setTimeout(function(){ loadSites(); }, 600);
          }
        })
        .catch(function(err) {
          showSiteFeedback(site.id, _safeMsg(err,'Erreur réseau.'), true);
        });
    });
  }
}

// ── BP08C: RPC wrappers ───────────────────────────────────────────────────────
async function doSiteUpdate(enterpriseId, siteId, name, city, siteCode, addressLine) {
  _siteActionPending[siteId] = true;
  try {
    var params = {
      p_enterprise_id: enterpriseId,
      p_site_id:       siteId,
      p_name:          name,
      p_city:          city || null,
    };
    if (siteCode     !== undefined) params.p_site_code   = siteCode;
    if (addressLine  !== undefined) params.p_address_line = addressLine;
    var result = await _sb.rpc('update_enterprise_site', params);
    // BP09-FIX-03: surface Supabase transport errors to caller
    if (result.error) throw result.error;
    return result.data;
  } finally {
    delete _siteActionPending[siteId];
  }
}

async function doSiteStatusChange(enterpriseId, siteId, newStatus) {
  _siteActionPending[siteId] = true;
  try {
    var result = await _sb.rpc('set_enterprise_site_status', {
      p_enterprise_id: enterpriseId,
      p_site_id:       siteId,
      p_status:        newStatus,
    });
    // BP09-FIX-03: surface Supabase transport errors to caller
    if (result.error) throw result.error;
    return result.data;
  } finally {
    delete _siteActionPending[siteId];
  }
}

function showSiteFeedback(siteId, msg, isError) {
  // Look in the rendered cards
  var feedbackEls = document.querySelectorAll('.bp08c-site-feedback[data-site-id="' + siteId + '"]');
  feedbackEls.forEach(function(el) {
    el.textContent = msg;
    el.className   = 'bp08c-site-feedback' + (msg ? (isError ? ' error' : ' success') : '');
  });
}

/* ============================================================
   BP08D — Account Edit UI
   ============================================================ */

async function doAccountUpdate(enterpriseId, name, legalName) {
  var result = await _sb.rpc('update_enterprise_account', {
    p_enterprise_id: enterpriseId,
    p_name:          name,
    p_legal_name:    legalName || null,
  });
  // BP09-FIX-03: surface Supabase transport errors to caller
  if (result.error) throw result.error;
  return result.data;
}

function showAccountFeedback(msg, isError) {
  var el = document.querySelector('.bp08d-account-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'bp08d-account-feedback' + (msg ? (isError ? ' error' : ' success') : '');
}

// ══════════════════════════════════════════════════════════════
// BP10 — INVITATION MANAGEMENT
// ══════════════════════════════════════════════════════════════

// Constants
const CAN_INVITE_ROLES = ['owner', 'admin'];
const INVITABLE_ROLES = ['admin','operations_manager','site_manager','reporter','viewer'];

function canInvite(role) { return CAN_INVITE_ROLES.includes(role); }

// Show/hide invite panel based on role
function renderInvitePanel() {
  const panel = document.getElementById('invite-panel');
  const pendingPanel = document.getElementById('pending-invitations-panel');
  if (!panel || !pendingPanel) return;
  if (canInvite(S.userRole)) {
    panel.hidden = false;
    pendingPanel.hidden = false;
    populateInviteSitesCheckboxes();
    loadPendingInvitations();
  } else {
    panel.hidden = true;
    pendingPanel.hidden = true;
  }
}

// Populate site checkboxes for site_manager role
function populateInviteSitesCheckboxes() {
  const container = document.getElementById('invite-sites-checkboxes');
  if (!container) return;
  container.innerHTML = '';
  (S.sites || []).forEach(site => {
    const label = document.createElement('label');
    label.className = 'ent-site-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = site.id;
    cb.className = 'ent-site-checkbox';
    const text = document.createTextNode(' ' + site.name);
    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);
  });
}

// Load pending invitations
async function loadPendingInvitations() {
  const listEl = document.getElementById('pending-list');
  const loadingEl = document.getElementById('pending-loading');
  const emptyEl = document.getElementById('pending-empty');
  const errorEl = document.getElementById('pending-error');
  const errorMsgEl = document.getElementById('pending-error-msg');
  if (!listEl) return;
  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;
  if (errorEl) errorEl.hidden = true;
  listEl.innerHTML = '';
  const sb = _sbClient();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('enterprise_invitations')
      .select('id, email_normalized, role, status, expires_at, created_at')
      .eq('enterprise_id', S.activeEnterprise.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (loadingEl) loadingEl.hidden = true;
    if (!data || data.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    data.forEach(inv => {
      const card = renderPendingInvitationCard(inv);
      listEl.appendChild(card);
    });
  } catch (err) {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) errorEl.hidden = false;
    if (errorMsgEl) errorMsgEl.textContent = 'Erreur lors du chargement des invitations.';
  }
}

// Render a single pending invitation card
function renderPendingInvitationCard(inv) {
  const card = document.createElement('div');
  card.className = 'ent-pending-card';
  card.dataset.invId = inv.id;
  const info = document.createElement('div');
  info.className = 'ent-pending-info';
  const emailEl = document.createElement('span');
  emailEl.className = 'ent-pending-email';
  emailEl.textContent = inv.email_normalized;
  const roleEl = document.createElement('span');
  roleEl.className = 'ent-pending-role';
  roleEl.textContent = formatRole(inv.role);
  const expiryEl = document.createElement('span');
  expiryEl.className = 'ent-pending-expiry';
  const exp = new Date(inv.expires_at);
  expiryEl.textContent = 'Expire: ' + exp.toLocaleDateString('fr-FR');
  info.appendChild(emailEl);
  info.appendChild(roleEl);
  info.appendChild(expiryEl);
  const revokeBtn = document.createElement('button');
  revokeBtn.className = 'ent-btn ent-btn-danger ent-btn-sm';
  revokeBtn.textContent = 'Révoquer';
  revokeBtn.setAttribute('aria-label', 'Révoquer invitation pour ' + inv.email_normalized);
  revokeBtn.addEventListener('click', () => handleRevokeInvitation(inv.id, card));
  card.appendChild(info);
  card.appendChild(revokeBtn);
  return card;
}

// Submit invitation form
async function handleInviteSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('invite-email');
  const roleSelect = document.getElementById('invite-role');
  const submitBtn = document.getElementById('invite-submit-btn');
  const loadingEl = document.getElementById('invite-loading');
  const successEl = document.getElementById('invite-success');
  const successMsgEl = document.getElementById('invite-success-msg');
  const linkBlock = document.getElementById('invite-link-block');
  const linkInput = document.getElementById('invite-link-input');
  const errorEl = document.getElementById('invite-error');
  const errorMsgEl = document.getElementById('invite-error-msg');
  if (!emailInput || !roleSelect) return;
  const email = emailInput.value.trim();
  const role = roleSelect.value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errorEl) errorEl.hidden = false;
    if (errorMsgEl) errorMsgEl.textContent = 'Adresse e-mail invalide.';
    return;
  }
  if (!INVITABLE_ROLES.includes(role)) {
    if (errorEl) errorEl.hidden = false;
    if (errorMsgEl) errorMsgEl.textContent = 'Rôle non autorisé.';
    return;
  }
  // Collect site IDs if site_manager
  let siteIds = null;
  if (role === 'site_manager') {
    const checkboxes = document.querySelectorAll('#invite-sites-checkboxes .ent-site-checkbox:checked');
    siteIds = Array.from(checkboxes).map(cb => cb.value);
    if (!siteIds.length) siteIds = null;
  }
  if (submitBtn) submitBtn.disabled = true;
  if (loadingEl) loadingEl.hidden = false;
  if (successEl) successEl.hidden = true;
  if (errorEl) errorEl.hidden = true;
  const sb = _sbClient();
  if (!sb) return;
  try {
    const params = { p_enterprise_id: S.activeEnterprise.id, p_email: email, p_role: role };
    if (siteIds && siteIds.length) params.p_site_ids = siteIds;
    const { data, error } = await sb.rpc('create_enterprise_invitation', params);
    if (loadingEl) loadingEl.hidden = true;
    if (submitBtn) submitBtn.disabled = false;
    if (error) throw error;
    if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'Erreur inconnue');
    emailInput.value = '';
    if (successEl) successEl.hidden = false;
    if (successMsgEl) successMsgEl.textContent = 'Invitation envoyée à ' + email + '.';
    // Show copy link block if raw_token returned
    if (data.raw_token && linkInput && linkBlock) {
      const baseUrl = window.location.origin + window.location.pathname;
      const link = baseUrl + '?invite=' + encodeURIComponent(data.raw_token);
      linkInput.value = link;
      linkBlock.hidden = false;
    } else if (linkBlock) {
      linkBlock.hidden = true;
    }
    loadPendingInvitations();
  } catch (err) {
    if (loadingEl) loadingEl.hidden = true;
    if (submitBtn) submitBtn.disabled = false;
    if (errorEl) errorEl.hidden = false;
    const code = err && err.message ? err.message : '';
    if (code.includes('already_member')) {
      if (errorMsgEl) errorMsgEl.textContent = 'Cette personne est déjà membre.';
    } else if (code.includes('invalid_role')) {
      if (errorMsgEl) errorMsgEl.textContent = 'Rôle non autorisé.';
    } else if (code.includes('pending_exists')) {
      if (errorMsgEl) errorMsgEl.textContent = 'Une invitation est déjà en attente pour cet e-mail.';
    } else {
      if (errorMsgEl) errorMsgEl.textContent = 'Échec de l\'invitation. Veuillez réessayer.';
    }
  }
}

// Revoke invitation
async function handleRevokeInvitation(invitationId, cardEl) {
  const sb = _sbClient();
  if (!sb || !invitationId) return;
  const revokeBtn = cardEl ? cardEl.querySelector('button') : null;
  if (revokeBtn) revokeBtn.disabled = true;
  try {
    const { data, error } = await sb.rpc('revoke_enterprise_invitation', { p_invitation_id: invitationId });
    if (error) throw error;
    if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'Erreur inconnue');
    if (cardEl) cardEl.remove();
    const listEl = document.getElementById('pending-list');
    const emptyEl = document.getElementById('pending-empty');
    if (listEl && emptyEl && listEl.children.length === 0) emptyEl.hidden = false;
  } catch (err) {
    if (revokeBtn) revokeBtn.disabled = false;
  }
}

// Copy invite link
function attachInviteCopyBtn() {
  const btn = document.getElementById('invite-copy-btn');
  const input = document.getElementById('invite-link-input');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    if (!input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
      btn.textContent = 'Copié !';
      setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      btn.textContent = 'Copié !';
      setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
    });
  });
}

// Toggle site checkboxes visibility
function attachInviteRoleChange() {
  const roleSelect = document.getElementById('invite-role');
  const sitesRow = document.getElementById('invite-sites-row');
  if (!roleSelect || !sitesRow) return;
  roleSelect.addEventListener('change', () => {
    sitesRow.hidden = (roleSelect.value !== 'site_manager');
  });
}

// Invite form submit listener
function attachInviteFormListeners() {
  const form = document.getElementById('invite-form');
  if (!form) return;
  form.addEventListener('submit', handleInviteSubmit);
  attachInviteRoleChange();
  attachInviteCopyBtn();
}

// ─────────────────────────────────────────────────────────
// INVITATION ACCEPTANCE FLOW
// Called at page load if ?invite= param is present in URL
// ─────────────────────────────────────────────────────────
async function checkInvitationParam() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (!token) return false;
  // Show acceptance gate screen
  showGate('gate-accept-invitation');
  const titleEl = document.getElementById('accept-title');
  const statusEl = document.getElementById('accept-status-msg');
  const actionsEl = document.getElementById('accept-actions');
  const acceptBtn = document.getElementById('accept-btn');
  if (statusEl) statusEl.textContent = 'Vérification de l\'invitation…';
  // Wait for auth state — user may need to sign in first
  const sb = _sbClient();
  if (!sb) return true;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    if (titleEl) titleEl.textContent = 'Connexion requise';
    if (statusEl) statusEl.textContent = 'Veuillez vous connecter pour accepter cette invitation.';
    return true;
  }
  // User is authenticated — show accept button
  if (statusEl) statusEl.textContent = '';
  if (titleEl) titleEl.textContent = 'Accepter l\'invitation';
  if (actionsEl) actionsEl.hidden = false;
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true;
      const loadingEl = document.getElementById('accept-loading');
      if (loadingEl) loadingEl.hidden = false;
      if (statusEl) statusEl.textContent = '';
      try {
        const sbInner = _sbClient();
        if (!sbInner) throw new Error('Client non disponible');
        const { data, error } = await sbInner.rpc('accept_enterprise_invitation', { p_token: token });
        if (loadingEl) loadingEl.hidden = true;
        if (error) throw error;
        if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'Erreur inconnue');
        if (statusEl) statusEl.textContent = 'Invitation acceptée ! Chargement du tableau de bord…';
        if (actionsEl) actionsEl.hidden = true;
        // Remove ?invite= from URL cleanly
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
        // Reboot into app
        setTimeout(() => bootApp(), 1500);
      } catch (err) {
        if (loadingEl) loadingEl.hidden = true;
        acceptBtn.disabled = false;
        const code = err && err.message ? err.message : '';
        if (code.includes('invitation_expired')) {
          if (statusEl) statusEl.textContent = 'Cette invitation a expiré. Demandez une nouvelle invitation.';
        } else if (code.includes('email_mismatch')) {
          if (statusEl) statusEl.textContent = 'Cette invitation est destinée à une autre adresse e-mail.';
        } else if (code.includes('already_member')) {
          if (statusEl) statusEl.textContent = 'Vous êtes déjà membre de cette entreprise.';
        } else {
          if (statusEl) statusEl.textContent = 'Invitation invalide ou déjà utilisée.';
        }
      }
    });
  }
  return true;
}

// Wire invitation listeners at DOM ready
document.addEventListener('DOMContentLoaded', () => {
  attachInviteFormListeners();
  checkInvitationParam();
});

// ════════════════════════════════════════════════════════════════
// BP11 — Operations Command Center
// Extends enterprise-dashboard-v1.js
// Uses window.EnterpriseOpsContract (enterprise-ops-contract-v1.js)
// ════════════════════════════════════════════════════════════════

// ── State additions ──────────────────────────────────────────────
// (appended to existing S object at runtime via Object.assign)
(function(){
  Object.assign(S, {
    opsQueue:              [],
    opsQueueCursor:        null,
    opsQueueExhausted:     false,
    opsQueueLoading:       false,
    opsConfirmSubmitting:  false,
    opsFilters: { site:'', status:'', urgency:'', search:'', needsAttention:false },
    opsDetailRequestId:    null,
    opsDetailMission:      null,
    opsSearchDebounce:     null,
    opsInitDone:           false,
  });
}());

// ── Contract helpers (defer to EnterpriseOpsContract if loaded) ──
function _opsContract() {
  return (typeof window !== 'undefined' && window.EnterpriseOpsContract) || null;
}
const OPS_PAGE_SIZE       = 20;
const OPS_STALE_MS        = 48 * 60 * 60 * 1000;
const OPEN_STATUSES_OPS   = ['new','assigned','in_progress'];
const URGENT_URGENCIES_OPS= ['now','urgent'];

function opsNeedsAttention(row) {
  var c = _opsContract();
  if (c) return c.needsAttention(row);
  if (!row) return false;
  var u = row.urgency || '', st = row.status || '', age = row.ageMs || 0;
  if (u === 'now' && (st === 'new' || st === 'assigned')) return true;
  if (st === 'completed') return true;
  if (age > OPS_STALE_MS && (st === 'new' || st === 'assigned')) return true;
  return false;
}

function computeOpsAge(createdAt) {
  if (!createdAt) return { ms: 0, label: '—' };
  var ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 0) ms = 0;
  if (ms < 60000)           return { ms: ms, label: '<1 min' };
  if (ms < 3600000)         return { ms: ms, label: Math.floor(ms/60000) + ' min' };
  if (ms < 86400000)        return { ms: ms, label: Math.floor(ms/3600000) + 'h' };
  return { ms: ms, label: Math.floor(ms/86400000) + 'j' };
}

function buildOpsCursor(rows) {
  var c = _opsContract();
  if (c) return c.buildCursor(rows);
  if (!rows || !rows.length) return null;
  var last = rows[rows.length - 1];
  return { lastCreatedAt: last.createdAt || last.created_at, lastId: last.id };
}

// ── fetchOpsQueue ────────────────────────────────────────────────
async function fetchOpsQueuePage(enterpriseId, filters, cursor) {
  var c = _opsContract();
  if (c) {
    var f = Object.assign({}, filters, { cursor: cursor });
    return await c.fetchOperationsQueue(enterpriseId, f);
  }
  // Inline fallback (same logic as contract module)
  var q = _sb
    .from('service_requests')
    .select(
      'id, status, category, urgency, description, created_at, city,' +
      'enterprise_request_context!inner(id, enterprise_id, site_id,' +
      'enterprise_sites!inner(id, name, site_code))'
    )
    .eq('enterprise_request_context.enterprise_id', enterpriseId)
    .order('created_at', { ascending: false })
    .limit(OPS_PAGE_SIZE);
  if (filters.site)    q = q.eq('enterprise_request_context.site_id', filters.site);
  if (filters.status)  q = q.eq('status', filters.status);
  if (filters.urgency) q = q.eq('urgency', filters.urgency);
  if (filters.search) {
    var t = '%' + filters.search + '%';
    q = q.or('category.ilike.' + t + ',description.ilike.' + t);
  }
  if (cursor && cursor.lastCreatedAt) {
    q = q.or('created_at.lt.' + cursor.lastCreatedAt +
      ',and(created_at.eq.' + cursor.lastCreatedAt + ',id.lt.' + cursor.lastId + ')');
  }
  var res = await q;
  if (res.error) throw res.error;
  var now = Date.now();
  var rows = (res.data||[]).map(function(r){
    var erc  = Array.isArray(r.enterprise_request_context) ? r.enterprise_request_context[0] : r.enterprise_request_context;
    var site = erc && (Array.isArray(erc.enterprise_sites) ? erc.enterprise_sites[0] : erc.enterprise_sites);
    var age  = r.created_at ? now - new Date(r.created_at).getTime() : 0;
    return { id:r.id, ercId:erc?erc.id:null, siteId:erc?erc.site_id:null, siteName:site?site.name:'—',
             category:r.category||'', urgency:r.urgency||'normale', status:r.status||'',
             description:r.description||'', city:r.city||'', createdAt:r.created_at, ageMs:age };
  });
  if (filters.needsAttention) rows = rows.filter(opsNeedsAttention);
  return { rows:rows, cursor:buildOpsCursor(rows), exhausted:(res.data||[]).length < OPS_PAGE_SIZE };
}

async function fetchOpsMission(srId) {
  var c = _opsContract();
  if (c) return await c.fetchMissionForRequest(srId);
  try {
    var res = await _sb
      .from('missions')
      .select('id, status, artisan_profile_id, started_at, completed_at, created_at')
      .eq('request_id', String(srId))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) return null;
    return res.data || null;
  } catch(_) { return null; }
}

// ── renderOpsRow ─────────────────────────────────────────────────
function renderOpsRow(r) {
  var li = document.createElement('li');
  li.className = 'ops-queue-row';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  li.setAttribute('data-rid', r.id);
  // Attention class
  if (r.urgency === 'now' && (r.status === 'new' || r.status === 'assigned')) {
    li.classList.add('ops-attention-urgent');
  } else if (r.status === 'completed') {
    li.classList.add('ops-attention-validation');
  } else if (r.ageMs > OPS_STALE_MS && (r.status === 'new' || r.status === 'assigned')) {
    li.classList.add('ops-attention-stale');
  }
  var ageLabel = computeOpsAge(r.createdAt).label;

  // Main row (all textContent — no innerHTML with user data)
  var top = document.createElement('div');
  top.className = 'ops-queue-row-top';

  var siteName = document.createElement('span');
  siteName.className = 'ops-queue-row-site';
  siteName.textContent = r.siteName;
  top.appendChild(siteName);

  var cat = document.createElement('span');
  cat.className = 'ops-queue-row-category';
  cat.textContent = r.category;
  top.appendChild(cat);

  var desc = document.createElement('div');
  desc.className = 'ops-queue-row-desc';
  desc.textContent = r.description;

  var age = document.createElement('div');
  age.className = 'ops-queue-row-age';
  age.textContent = ageLabel;

  // Badges (use safeHtml values for class names only, textContent for text)
  var badges = document.createElement('div');
  badges.className = 'ops-queue-row-badges';

  var urgBadge = document.createElement('span');
  urgBadge.className = 'ops-urgency-badge ops-urgency-' + safeHtml(r.urgency || 'normale');
  urgBadge.textContent = formatUrgency(r.urgency);
  badges.appendChild(urgBadge);

  var stBadge = document.createElement('span');
  stBadge.className = 'ops-status-badge ops-status-' + safeHtml(r.status || '');
  stBadge.textContent = formatStatus(r.status);
  badges.appendChild(stBadge);

  var main = document.createElement('div');
  main.appendChild(top);
  main.appendChild(desc);
  main.appendChild(badges);
  main.appendChild(age);
  li.appendChild(main);

  // Click / keyboard
  function _open(e) {
    if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e) e.preventDefault();
    openOpsDetail(r.id);
  }
  li.addEventListener('click', _open);
  li.addEventListener('keydown', _open);

  return li;
}

// ── loadOpsQueue ─────────────────────────────────────────────────
async function loadOpsQueue(reset) {
  if (!S.activeEnterprise) return;
  if (S.opsQueueLoading) return;
  if (!reset && S.opsQueueExhausted) return;

  S.opsQueueLoading = true;
  var list      = document.getElementById('ops-queue-list');
  var loadEl    = document.getElementById('ops-queue-loading');
  var emptyEl   = document.getElementById('ops-queue-empty');
  var errorEl   = document.getElementById('ops-queue-error');
  var loadMore  = document.getElementById('ops-queue-load-more');

  if (reset) {
    S.opsQueue = [];
    S.opsQueueCursor = null;
    S.opsQueueExhausted = false;
    if (list) list.innerHTML = '';
  }
  if (loadEl)   { loadEl.style.display = ''; }
  if (emptyEl)  { emptyEl.style.display = 'none'; }
  if (errorEl)  { errorEl.style.display = 'none'; }
  if (loadMore) { loadMore.style.display = 'none'; }

  try {
    var result = await fetchOpsQueuePage(
      S.activeEnterprise.id,
      S.opsFilters,
      reset ? null : S.opsQueueCursor
    );
    S.opsQueue = reset ? result.rows : S.opsQueue.concat(result.rows);
    S.opsQueueCursor   = result.cursor;
    S.opsQueueExhausted= result.exhausted;

    if (loadEl) loadEl.style.display = 'none';

    if (S.opsQueue.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
    } else {
      if (list) {
        if (reset) list.innerHTML = '';
        result.rows.forEach(function(r) { list.appendChild(renderOpsRow(r)); });
      }
    }
    if (loadMore) {
      loadMore.style.display = S.opsQueueExhausted ? 'none' : '';
    }
  } catch(err) {
    if (loadEl) loadEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = '';
      var msg = document.getElementById('ops-queue-error-msg');
      if (msg) msg.textContent = 'Erreur de chargement. Veuillez réessayer.';
    }
  }
  S.opsQueueLoading = false;
}

// ── KPI strip ────────────────────────────────────────────────────
function renderOpsKpis(counts) {
  function set(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = (val === null || val === undefined) ? '—' : String(val);
  }
  set('ops-kpi-open-val',      counts.open      ?? '—');
  set('ops-kpi-urgent-val',    counts.urgent     ?? '—');
  set('ops-kpi-awaiting-val',  counts.awaiting   ?? '—');
  set('ops-kpi-missions-val',  counts.activeMissions === null ? '—' : counts.activeMissions);
  set('ops-kpi-attention-val', counts.attention  ?? '—');
}

async function refreshOpsKpis() {
  if (!S.activeEnterprise) return;
  try {
    var c = _opsContract();
    var counts;
    if (c) {
      counts = await c.fetchOperationsKpis(S.activeEnterprise.id);
    } else {
      // Derive from loaded queue as fallback
      var rows = S.opsQueue;
      counts = {
        open:    rows.filter(function(r){ return OPEN_STATUSES_OPS.indexOf(r.status) !== -1; }).length,
        urgent:  rows.filter(function(r){ return URGENT_URGENCIES_OPS.indexOf(r.urgency) !== -1; }).length,
        awaiting:rows.filter(function(r){ return r.status === 'completed'; }).length,
        activeMissions: null,
      };
    }
    counts.attention = S.opsQueue.filter(opsNeedsAttention).length;
    renderOpsKpis(counts);
  } catch(_) { /* kpis optional */ }
}

// ── Detail panel ─────────────────────────────────────────────────
function _setOpsDetailText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text || '—';
}
function _setOpsDetailBadge(id, cssClass, text) {
  var el = document.getElementById(id);
  if (!el) return;
  // Remove old badge classes
  el.className = el.className.replace(/ops-[a-z]+-[a-z_]+/g, '').trim();
  el.classList.add(cssClass);
  el.textContent = text || '';
}
function _setOpsLifecycleStep(status, hasMission) {
  var bar = document.getElementById('ops-lifecycle-bar');
  if (!bar) return;
  var steps = bar.querySelectorAll('.ops-lifecycle-step');
  // step order: need, request, dispatch, mission, validation
  // need: always done (request exists)
  // request: always done
  // dispatch: done if mission exists or status in_progress+
  // mission: done/active based on status
  // validation: done if validated
  var stepMap = { need:0, request:1, dispatch:2, mission:3, validation:4 };
  var activeStep = 1; // request is always at least the active step
  if (hasMission)                                          activeStep = 3;
  if (status === 'in_progress')                            activeStep = 3;
  if (status === 'completed')                              activeStep = 4;
  if (status === 'validated')                              activeStep = 4;
  steps.forEach(function(step, idx) {
    step.classList.remove('done', 'active');
    if (idx < activeStep)  step.classList.add('done');
    if (idx === activeStep) step.classList.add('active');
  });
}

async function loadOpsDetail(requestId) {
  if (!requestId) return;
  // Guard: discard stale response if a newer request was opened
  var myRequestId = requestId;
  S.opsDetailRequestId = requestId;

  var panel   = document.getElementById('ops-detail-panel');
  var queueSec= document.getElementById('ops-queue-section');
  var loadEl  = document.getElementById('ops-detail-loading');
  if (panel)    panel.style.display = '';
  if (queueSec) queueSec.style.display = 'none';
  if (loadEl)   loadEl.style.display = '';

  // Reset confirm block
  var confirmBlock = document.getElementById('ops-detail-confirm-block');
  var confirmErr   = document.getElementById('ops-detail-confirm-error');
  if (confirmBlock) confirmBlock.style.display = 'none';
  if (confirmErr)   { confirmErr.style.display = 'none'; confirmErr.textContent = ''; }

  try {
    // Fetch SR
    var srRes = await _sb
      .from('service_requests')
      .select('id, status, category, urgency, description, created_at, city,' +
              'enterprise_request_context!inner(id, site_id, enterprise_id,' +
              'enterprise_sites!inner(id, name))')
      .eq('id', requestId)
      .maybeSingle();

    // Staleness check: another row was opened while awaiting
    if (S.opsDetailRequestId !== myRequestId) return;

    if (srRes.error || !srRes.data) {
      if (loadEl) loadEl.style.display = 'none';
      return;
    }
    var sr  = srRes.data;
    var erc = Array.isArray(sr.enterprise_request_context) ? sr.enterprise_request_context[0] : sr.enterprise_request_context;
    var site= erc && (Array.isArray(erc.enterprise_sites) ? erc.enterprise_sites[0] : erc.enterprise_sites);

    // Fetch mission (null-safe — may not be visible pre-BP09)
    var mission = await fetchOpsMission(requestId);
    if (S.opsDetailRequestId !== myRequestId) return; // stale check again
    S.opsDetailMission = mission;

    if (loadEl) loadEl.style.display = 'none';
    renderOpsDetail(sr, mission, site);
  } catch(_) {
    if (S.opsDetailRequestId !== myRequestId) return;
    if (loadEl) loadEl.style.display = 'none';
  }
}

function renderOpsDetail(sr, mission, site) {
  var age = computeOpsAge(sr.created_at);
  _setOpsDetailText('ops-detail-site', site ? site.name : '—');
  _setOpsDetailText('ops-detail-category', sr.category || '—');
  _setOpsDetailBadge('ops-detail-urgency', 'ops-urgency-badge ops-urgency-' + safeHtml(sr.urgency||'normale'), formatUrgency(sr.urgency));
  _setOpsDetailBadge('ops-detail-status',  'ops-status-badge ops-status-' + safeHtml(sr.status||''), formatStatus(sr.status));
  _setOpsDetailText('ops-detail-age', age.label);
  _setOpsDetailText('ops-detail-description', sr.description || '—');

  // Mission block
  var mBlock = document.getElementById('ops-detail-mission-block');
  if (mission) {
    if (mBlock) mBlock.style.display = '';
    _setOpsDetailBadge('ops-detail-mission-status',
      'ops-status-badge ops-mission-' + safeHtml(mission.status||''),
      formatStatus(mission.status));
    var startRow = document.getElementById('ops-detail-mission-started-row');
    var compRow  = document.getElementById('ops-detail-mission-completed-row');
    if (mission.started_at && startRow) {
      startRow.style.display = '';
      _setOpsDetailText('ops-detail-mission-started', new Date(mission.started_at).toLocaleString('fr-FR'));
    }
    if (mission.completed_at && compRow) {
      compRow.style.display = '';
      _setOpsDetailText('ops-detail-mission-completed', new Date(mission.completed_at).toLocaleString('fr-FR'));
    }
  } else {
    if (mBlock) {
      var mStatus = document.getElementById('ops-detail-mission-status');
      if (mStatus) { mStatus.className = 'ops-status-badge ops-mission-none'; mStatus.textContent = 'Aucune mission'; }
    }
  }

  // Lifecycle bar
  _setOpsLifecycleStep(sr.status, !!mission);

  // Confirm button — show only if canConfirm + status=completed
  var confirmBlock = document.getElementById('ops-detail-confirm-block');
  if (confirmBlock) {
    var show = sr.status === 'completed' && canConfirm(S.userRole);
    confirmBlock.style.display = show ? '' : 'none';
    var btn = document.getElementById('ops-detail-confirm-btn');
    if (btn) btn.setAttribute('data-rid', sr.id);
  }
}

// ── confirmOpsValidation ─────────────────────────────────────────
async function confirmOpsValidation(requestId) {
  if (S.opsConfirmSubmitting) return;           // double-submit guard
  if (!canConfirm(S.userRole)) return;          // role gate
  S.opsConfirmSubmitting = true;

  var btn     = document.getElementById('ops-detail-confirm-btn');
  var loading = document.getElementById('ops-detail-confirm-loading');
  var errEl   = document.getElementById('ops-detail-confirm-error');

  if (btn)     { btn.disabled = true; }
  if (loading) { loading.style.display = ''; }
  if (errEl)   { errEl.style.display = 'none'; errEl.textContent = ''; }

  try {
    var res = await _sb.rpc('confirm_completed_mission', { p_request_id: requestId });
    if (res.error) throw res.error;
    // Success: reload detail
    S.opsConfirmSubmitting = false;
    if (btn) btn.disabled = false;
    if (loading) loading.style.display = 'none';
    await loadOpsDetail(requestId);
    // Refresh queue row & KPIs
    await loadOpsQueue(true);
    await refreshOpsKpis();
  } catch(_) {
    S.opsConfirmSubmitting = false;
    if (btn)     { btn.disabled = false; }
    if (loading) { loading.style.display = 'none'; }
    if (errEl)   { errEl.textContent = 'Erreur lors de la validation. Veuillez réessayer.'; errEl.style.display = ''; }
  }
}

// ── Navigation ───────────────────────────────────────────────────
function openOpsDetail(requestId) {
  loadOpsDetail(requestId);
}

function closeOpsDetail() {
  S.opsDetailRequestId = null;
  var panel    = document.getElementById('ops-detail-panel');
  var queueSec = document.getElementById('ops-queue-section');
  if (panel)    panel.style.display = 'none';
  if (queueSec) queueSec.style.display = '';
}

// ── Site filter population ───────────────────────────────────────
function populateOpsSiteFilter() {
  var sel = document.getElementById('ops-filter-site');
  if (!sel || !S.sites) return;
  // Keep the "Tous les sites" option; rebuild rest
  while (sel.options.length > 1) sel.remove(1);
  S.sites.forEach(function(site) {
    if (!site || site.status === 'inactive') return;
    var opt = document.createElement('option');
    opt.value = site.id;
    opt.textContent = site.name;
    if (site.id === S.opsFilters.site) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── initOpsCommandCenter ─────────────────────────────────────────
function initOpsCommandCenter() {
  if (S.opsInitDone) return;
  S.opsInitDone = true;

  // Filter bar
  var siteSel   = document.getElementById('ops-filter-site');
  var statusSel = document.getElementById('ops-filter-status');
  var urgSel    = document.getElementById('ops-filter-urgency');
  var searchIn  = document.getElementById('ops-search-input');
  var attToggle = document.getElementById('ops-needs-attention-toggle');
  var refreshBtn= document.getElementById('ops-refresh-btn');
  var loadMore  = document.getElementById('ops-queue-load-more');
  var retryBtn  = document.getElementById('ops-queue-retry-btn');
  var backBtn   = document.getElementById('ops-detail-back');
  var confirmBtn= document.getElementById('ops-detail-confirm-btn');

  if (siteSel)   siteSel.addEventListener('change',   function(){ S.opsFilters.site    = siteSel.value;   loadOpsQueue(true); });
  if (statusSel) statusSel.addEventListener('change', function(){ S.opsFilters.status  = statusSel.value; loadOpsQueue(true); });
  if (urgSel)    urgSel.addEventListener('change',    function(){ S.opsFilters.urgency = urgSel.value;    loadOpsQueue(true); });
  if (searchIn) {
    searchIn.addEventListener('input', function() {
      clearTimeout(S.opsSearchDebounce);
      S.opsSearchDebounce = setTimeout(function(){
        S.opsFilters.search = searchIn.value.trim();
        loadOpsQueue(true);
      }, 350);
    });
  }
  if (attToggle) {
    attToggle.addEventListener('click', function() {
      S.opsFilters.needsAttention = !S.opsFilters.needsAttention;
      attToggle.setAttribute('aria-checked', S.opsFilters.needsAttention ? 'true' : 'false');
      loadOpsQueue(true);
    });
  }
  if (refreshBtn) refreshBtn.addEventListener('click', function(){ loadOpsQueue(true); refreshOpsKpis(); });
  if (loadMore)   loadMore.addEventListener('click',   function(){ loadOpsQueue(false); });
  if (retryBtn)   retryBtn.addEventListener('click',   function(){ loadOpsQueue(true); });
  if (backBtn)    backBtn.addEventListener('click',    closeOpsDetail);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function(){
      var rid = confirmBtn.getAttribute('data-rid') || S.opsDetailRequestId;
      if (rid) confirmOpsValidation(rid);
    });
  }

  // KPI card filters
  document.querySelectorAll('.ops-kpi-card[data-ops-filter-status]').forEach(function(card){
    card.addEventListener('click', function(){
      S.opsFilters.status = card.getAttribute('data-ops-filter-status') === 'open' ? '' : card.getAttribute('data-ops-filter-status');
      if (statusSel) statusSel.value = S.opsFilters.status;
      loadOpsQueue(true);
    });
  });
  document.querySelectorAll('.ops-kpi-card[data-ops-filter-attention]').forEach(function(card){
    card.addEventListener('click', function(){
      S.opsFilters.needsAttention = true;
      if (attToggle) attToggle.setAttribute('aria-checked', 'true');
      loadOpsQueue(true);
    });
  });
}

// ── navigateTo extension (ops section) ───────────────────────────
(function patchNavigateTo() {
  var _origNav = window.EntDashboard.goTo;
  window.EntDashboard.goTo = function(sec, ctx) {
    _origNav(sec, ctx);
  };
  // Patch internal navigateTo switch — hook via section show
  var _origShowSection = typeof showSection === 'function' ? showSection : null;
  if (_origShowSection) {
    // Override showSection to trigger ops init + load
    window._opsShowSectionHooked = true;
  }
  // Simpler: listen for section-ops becoming active
  var obs = new MutationObserver(function(muts) {
    muts.forEach(function(m) {
      if (m.target && m.target.id === 'section-ops' &&
          m.target.classList.contains('active')) {
        populateOpsSiteFilter();
        initOpsCommandCenter();
        loadOpsQueue(true);
        refreshOpsKpis();
      }
    });
  });
  var opsSection = document.getElementById('section-ops');
  if (opsSection) {
    obs.observe(opsSection, { attributes: true, attributeFilter: ['class'] });
  }
}());

// Also wire navigateTo 'ops' case via DOMContentLoaded patch
document.addEventListener('DOMContentLoaded', function() {
  // Patch navigateTo to handle 'ops' section
  if (typeof navigateTo === 'function') {
    var _origNavigateTo = navigateTo;
    // We can't easily reassign the closure, but the MutationObserver above handles it
  }
  // Wire data-section=ops nav buttons
  document.querySelectorAll('[data-section="ops"]').forEach(function(btn){
    btn.addEventListener('click', function(){
      // showSection is already called by the existing nav handler;
      // the MutationObserver triggers ops init/load
    });
  });
});
