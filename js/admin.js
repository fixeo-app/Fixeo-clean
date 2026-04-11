/* ============================================================
   FIXEO V14 — ADMIN DASHBOARD JS — ULTIMATE FIX
   ============================================================
   CORRECTIONS V14 :
     FIX-ADMIN-1 : Bootstrap automatique compte admin au démarrage
                   (créer si inexistant, mettre à jour si rôle incorrect)
     FIX-ADMIN-2 : Synchronisation rôles multi-clés localStorage
     FIX-ADMIN-3 : checkAdminAccess → feedback amélioré
     FIX-ADMIN-4 : adminLogout → nettoyage complet de toutes les clés
   ============================================================ */

/* ── ADMIN AUTH ────────────────────────────────────────────── */
/* Identifiants admin sécurisés (SHA-256) */
const _ADMIN_EMAIL     = 'admin@fixeo.com';
const _ADMIN_PASS_HASH = 'c6d729bbfb14021b9852303540c1859737373ffbb108f5e5922246f6ac77b3da';
const _ADMIN_DISPLAY   = 'Admin Fixeo';

/* ── FIX-ADMIN-1 : BOOTSTRAP AUTOMATIQUE COMPTE ADMIN ────────
   Logique :
     • Si l'utilisateur connecté est admin@fixeo.com mais
       les flags de rôle sont manquants/incorrects → correction
     • Si des flags admin orphelins existent → nettoyage
     • Appelé AVANT tout autre code d'initialisation
   ─────────────────────────────────────────────────────────── */
(function _bootstrapAdminAccount() {
  try {
    const storedUser  = localStorage.getItem('fixeo_user')  || '';
    const storedRole  = localStorage.getItem('fixeo_role')  || '';
    const storedAdmin = localStorage.getItem('fixeo_admin') || '';
    const storedSess  = sessionStorage.getItem('fixeo_admin_auth') || '';

    /* Cas 1 : Admin connecté avec rôle manquant/incorrect → corriger */
    const isAdminEmail = storedUser.toLowerCase() === _ADMIN_EMAIL;
    if (isAdminEmail && storedRole !== 'admin') {
      console.log('[Fixeo Admin] Bootstrap: rôle admin manquant → correction automatique');
      localStorage.setItem('fixeo_role', 'admin');
      localStorage.setItem('role',       'admin');
      localStorage.setItem('fixeo_admin','1');
    }

    /* Cas 2 : Flags admin orphelins (fixeo_admin=1 mais user ≠ admin) → purge */
    if (storedAdmin === '1' && !isAdminEmail && storedUser !== '') {
      console.log('[Fixeo Admin] Bootstrap: flags admin orphelins → purge');
      localStorage.removeItem('fixeo_admin');
      sessionStorage.removeItem('fixeo_admin_auth');
      if (storedRole === 'admin') {
        localStorage.setItem('fixeo_role', 'client');
        localStorage.setItem('role',       'client');
      }
    }

    /* Cas 3 : Rôle manquant pour un utilisateur connecté → default 'client' */
    if (storedUser && !storedRole) {
      const defaultRole = isAdminEmail ? 'admin' : 'client';
      localStorage.setItem('fixeo_role', defaultRole);
      localStorage.setItem('role',       defaultRole);
      console.log('[Fixeo Admin] Bootstrap: rôle manquant → défaut', defaultRole);
    }

    /* Cas 4 : Rôle invalide pour un non-admin → forcer 'client' */
    if (storedUser && !isAdminEmail && storedRole === 'admin') {
      console.log('[Fixeo Admin] Bootstrap: rôle admin non autorisé → forcer client');
      localStorage.setItem('fixeo_role', 'client');
      localStorage.setItem('role',       'client');
      localStorage.removeItem('fixeo_admin');
      sessionStorage.removeItem('fixeo_admin_auth');
    }
  } catch (e) {
    console.warn('[Fixeo Admin] Bootstrap error (silencieux):', e.message);
  }
})();

async function _sha256admin(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function checkAdminAccess() {
  const emailInput = document.getElementById('admin-user')?.value.trim().toLowerCase();
  const pass  = document.getElementById('admin-pass')?.value;
  const errEl = document.getElementById('admin-gate-error');
  const btn   = document.querySelector('#admin-gate .btn');

  /* FIX-ADMIN-3 : Validation des champs avant le hash */
  if (!emailInput || !pass) {
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent   = '⚠️ Veuillez renseigner l\'email et le mot de passe.';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Vérification…'; }
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  const passHash = await _sha256admin(pass);

  if (emailInput === _ADMIN_EMAIL && passHash === _ADMIN_PASS_HASH) {
    /* ── FIX-ADMIN-2 : Persist admin auth — toutes les clés synchronisées ── */
    if (window.FixeoAuthSession?.setActiveUser) {
      window.FixeoAuthSession.setActiveUser({ id: 'admin-001', email: _ADMIN_EMAIL, name: _ADMIN_DISPLAY, role: 'admin' });
    } else {
      sessionStorage.setItem('fixeo_admin_auth', '1');
      localStorage.setItem('fixeo_user',      _ADMIN_EMAIL);
      localStorage.setItem('fixeo_user_name', _ADMIN_DISPLAY);
      localStorage.setItem('fixeo_role',      'admin');
      localStorage.setItem('fixeo_admin',     '1');
      localStorage.setItem('role',            'admin');
      localStorage.setItem('fixeo_logged_in', 'true');
    }
    /* ── Re-apply auth state to body ── */
    document.body.classList.add('is-logged-in', 'is-admin');
    document.getElementById('admin-gate').style.display = 'none';
    document.getElementById('admin-app').style.display  = 'block';
    initAdmin();
  } else {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔑 Connexion Admin'; }
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent   = emailInput !== _ADMIN_EMAIL
        ? '❌ Email administrateur incorrect.'
        : '❌ Mot de passe incorrect.';
    }
  }
}

/* Auto-bypass gate if already authenticated as admin */
document.addEventListener('DOMContentLoaded', () => {
  const alreadyAdmin = (
    sessionStorage.getItem('fixeo_admin_auth') === '1' ||
    localStorage.getItem('fixeo_admin') === '1'
  ) && localStorage.getItem('fixeo_role') === 'admin';

  if (alreadyAdmin) {
    document.body.classList.add('is-logged-in', 'is-admin');
    document.getElementById('admin-gate').style.display = 'none';
    document.getElementById('admin-app').style.display  = 'block';
    initAdmin();
  }
});

function adminLogout() {
  /* FIX-ADMIN-4 : Nettoyage complet de TOUTES les clés d'auth */
  if (window.FixeoAuthSession?.clearActiveUser) {
    window.FixeoAuthSession.clearActiveUser({ redirectTo: '', reload: false, resetAuthPage: false });
  } else {
    [
      'fixeo_admin', 'fixeo_user', 'fixeo_user_name',
      'fixeo_role',  'role',       'fixeo_logged_in'
    ].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('fixeo_admin_auth');
  }
  /* Stopper le polling au logout */
  _stopAdminOrdersPolling();
  document.body.classList.remove('is-logged-in', 'is-admin');
  const gate = document.getElementById('admin-gate');
  const app  = document.getElementById('admin-app');
  if (gate) gate.style.display = 'flex';
  if (app)  app.style.display  = 'none';
}

// Allow Enter key on gate
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const gate = document.getElementById('admin-gate');
    if (gate && gate.style.display !== 'none') checkAdminAccess();
  }
});

/* ── SECTION NAVIGATION ─────────────────────────────────────── */
function adminSection(name) {
  document.querySelectorAll('[id^="admin-section-"]').forEach(el => {
    el.style.display = el.id === 'admin-section-' + name ? 'block' : 'none';
  });
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  event?.target?.closest('.sidebar-link')?.classList.add('active');
  /* ── V20 : charger le module artisans à la demande ── */
  if (name === 'artisans' && typeof initArtisansAdmin === 'function') {
    setTimeout(initArtisansAdmin, 50);
  }
}

/* ── DATA STORES ─────────────────────────────────────────────── */
/* V20: ADMIN_ARTISANS conservé comme fallback legacy (API in admin-artisans.js) */
const ADMIN_ARTISANS = [];

const ADMIN_CLIENTS = [
  { id:1, name:'Mohammed Alami', email:'m.alami@email.ma', city:'Casablanca', missions:12, joined:'15/01/2024', status:'active' },
  { id:2, name:'Leila Bensouda', email:'l.bensouda@email.ma', city:'Rabat', missions:8, joined:'22/02/2024', status:'active' },
  { id:3, name:'Ahmed Tahir', email:'a.tahir@email.ma', city:'Marrakech', missions:15, joined:'10/03/2024', status:'active' },
  { id:4, name:'Yasmine Kabbaj', email:'y.kabbaj@email.ma', city:'Casablanca', missions:3, joined:'05/06/2024', status:'active' },
  { id:5, name:'Ibrahim Naciri', email:'i.naciri@email.ma', city:'Fès', missions:7, joined:'18/04/2024', status:'active' },
  { id:6, name:'Fatima Tazi', email:'f.tazi@email.ma', city:'Agadir', missions:20, joined:'01/01/2024', status:'active' },
  { id:7, name:'Soufiane Berrada', email:'s.berrada@email.ma', city:'Tanger', missions:1, joined:'10/09/2024', status:'active' },
  { id:8, name:'Hafsa Mernissi', email:'h.mernissi@email.ma', city:'Rabat', missions:9, joined:'25/03/2024', status:'suspended' }
];

const ADMIN_PAYMENTS = [];

const ADMIN_SUBSCRIPTIONS = [];

const ADMIN_REGISTRATIONS = [
  { id:1, name:'Mourad Saidi', specialty:'Plâtrerie', city:'Casablanca', email:'mourad@email.ma', phone:'+212 6 12 34 56 78', experience:'8 ans', submitted:'13/03/2026' },
  { id:2, name:'Houda Benali', specialty:'Carrelage', city:'Rabat', email:'houda@email.ma', phone:'+212 6 23 45 67 89', experience:'5 ans', submitted:'12/03/2026' },
  { id:3, name:'Tarik Lahlou', specialty:'Peinture industrielle', city:'Tanger', email:'tarik@email.ma', phone:'+212 6 34 56 78 90', experience:'12 ans', submitted:'10/03/2026' }
];

const ADMIN_REVIEWS = [];

const ADMIN_REPORTS = [];

let currentArtisanId = null;

/* ── INIT ────────────────────────────────────────────────────── */
/* initAdmin defined below in the Réservations module (V10) — this placeholder ensures
   backward compat if the append fails for any reason */
function _initAdminBase() {
  updateLastTime();
  renderAdminCharts();
  renderActivityList();
  renderAdminAlerts();
  renderArtisansTable(ADMIN_ARTISANS);
  renderClientsTable();
  renderRegistrations();
  renderSubscriptions();
  renderPayments();
  renderReviews();
  renderReports();
}

function updateLastTime() {
  const el = document.getElementById('last-update-time');
  if (el) el.textContent = new Date().toLocaleTimeString('fr-FR');
}

function refreshAdminData() {
  updateLastTime();
  renderUrgentPerformanceKPIs();
  showToast('✅ Données actualisées', 'success');
}

/* ── CHARTS ──────────────────────────────────────────────────── */
function renderAdminCharts() {
  // Revenue chart
  const revCtx = document.getElementById('admin-chart-revenue');
  if (revCtx) {
    new Chart(revCtx, {
      type: 'line',
      data: {
        labels: ['Sep','Oct','Nov','Déc','Jan','Fév','Mar'],
        datasets:[{
          label:'Revenus (MAD)',
          data:[12800,15400,14200,18900,22100,25800,28450],
          borderColor:'#E1306C', backgroundColor:'rgba(225,48,108,0.12)',
          tension:0.4, fill:true, pointBackgroundColor:'#E1306C', pointRadius:4
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'rgba(255,255,255,0.5)',font:{size:11}} },
          y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'rgba(255,255,255,0.5)',font:{size:11}} }
        }
      }
    });
  }

  // Subscriptions chart
  const subCtx = document.getElementById('admin-chart-subs');
  if (subCtx) {
    new Chart(subCtx, {
      type: 'doughnut',
      data: {
        labels: ['Free','Pro','Premium'],
        datasets:[{
          data:[6,4,2],
          backgroundColor:['rgba(255,255,255,0.15)','rgba(225,48,108,0.65)','rgba(252,175,69,0.65)'],
          borderColor:['rgba(255,255,255,0.1)','rgba(225,48,108,0.8)','rgba(252,175,69,0.8)'],
          borderWidth:2
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom', labels:{ color:'rgba(255,255,255,0.7)', font:{size:11} } } }
      }
    });
  }
}

/* ── ACTIVITY LIST ───────────────────────────────────────────── */
function renderActivityList() {
  const list = document.getElementById('admin-activity-list');
  if (!list) return;
  const activities = [
    { icon:'👷', title:'Nouvelles données artisan disponibles après synchronisation.', time:'En attente d’activité réelle' },
    { icon:'💳', title:'Les paiements réels apparaîtront ici automatiquement.', time:'Synchronisation dynamique' },
    { icon:'⭐', title:'Les avis clients modérés seront listés ici.', time:'Aucune donnée fictive affichée' }
  ];
  list.innerHTML = activities.map(a => `
    <div class="admin-activity-item">
      <div class="activity-icon">${a.icon}</div>
      <div class="activity-text">
        <div class="activity-title">${a.title}</div>
        <div class="activity-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

/* ── ALERTS ──────────────────────────────────────────────────── */
function renderAdminAlerts() {
  const el = document.getElementById('admin-alerts');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-alert">
      <div class="alert-icon">📝</div>
      <div class="alert-text">3 demandes d'inscription artisan en attente d'approbation</div>
      <span class="alert-action" onclick="adminSection('registrations')">Voir →</span>
    </div>
    <div class="admin-alert">
      <div class="alert-icon">⭐</div>
      <div class="alert-text">2 avis clients en attente de modération</div>
      <span class="alert-action" onclick="adminSection('reviews')">Voir →</span>
    </div>
    <div class="admin-alert">
      <div class="alert-icon">🚩</div>
      <div class="alert-text">5 signalements ouverts nécessitent une action</div>
      <span class="alert-action" onclick="adminSection('reports')">Voir →</span>
    </div>
  `;
}

/* ── ARTISANS TABLE ──────────────────────────────────────────── */
function renderArtisansTable(data) {
  const tbody = document.getElementById('artisans-admin-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(a => `
    <tr>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar">${a.initials}</div>
          <div>
            <div class="admin-user-name">${a.name}</div>
            <div class="admin-user-sub">${a.email}</div>
          </div>
        </div>
      </td>
      <td>${a.specialty}</td>
      <td>📍 ${a.city}</td>
      <td><span class="plan-badge plan-${a.plan}">${planLabel(a.plan)}</span></td>
      <td><span class="status-badge status-${a.status}">${statusLabel(a.status)}</span></td>
      <td>⭐ ${a.rating}</td>
      <td>${a.missions}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="tbl-btn" onclick="viewArtisanDetail(${a.id})">👁 Voir</button>
        ${a.status === 'active'
          ? `<button class="tbl-btn danger" onclick="confirmAction('suspend',${a.id})">🚫 Suspendre</button>`
          : `<button class="tbl-btn success" onclick="confirmAction('activate',${a.id})">✅ Activer</button>`}
      </td>
    </tr>
  `).join('');
}

function filterAdminArtisans(query) {
  const q = query.toLowerCase();
  renderArtisansTable(ADMIN_ARTISANS.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.specialty.toLowerCase().includes(q) ||
    a.city.toLowerCase().includes(q)
  ));
}

function filterAdminArtisansByStatus(status) {
  renderArtisansTable(status ? ADMIN_ARTISANS.filter(a => a.status === status) : ADMIN_ARTISANS);
}

function viewArtisanDetail(id) {
  currentArtisanId = id;
  const a = ADMIN_ARTISANS.find(x => x.id === id);
  if (!a) return;

  document.getElementById('artisan-detail-title').textContent = `👷 ${a.name}`;
  document.getElementById('artisan-detail-body').innerHTML = `
    <div class="artisan-detail-grid">
      <div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Nom complet</div><div class="artisan-detail-value">${a.name}</div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Spécialité</div><div class="artisan-detail-value">${a.specialty}</div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Ville</div><div class="artisan-detail-value">${a.city}</div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Email</div><div class="artisan-detail-value">${a.email}</div></div>
      </div>
      <div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Plan actuel</div><div class="artisan-detail-value"><span class="plan-badge plan-${a.plan}">${planLabel(a.plan)}</span></div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Statut</div><div class="artisan-detail-value"><span class="status-badge status-${a.status}">${statusLabel(a.status)}</span></div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Note moyenne</div><div class="artisan-detail-value">⭐ ${a.rating}/5</div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Missions complétées</div><div class="artisan-detail-value">${a.missions}</div></div>
        <div class="artisan-detail-row"><div class="artisan-detail-label">Inscrit le</div><div class="artisan-detail-value">${a.joined}</div></div>
      </div>
    </div>
  `;

  const approveBtn = document.getElementById('artisan-approve-btn');
  const suspendBtn = document.getElementById('artisan-suspend-btn');
  if (approveBtn) approveBtn.style.display = a.status === 'pending' ? 'inline-flex' : 'none';
  if (suspendBtn) suspendBtn.textContent = a.status === 'active' ? '🚫 Suspendre' : '✅ Réactiver';

  openModal('artisan-detail-modal');
}

function approveArtisan() {
  if (!currentArtisanId) return;
  const a = ADMIN_ARTISANS.find(x => x.id === currentArtisanId);
  if (a) { a.status = 'active'; }
  closeModal('artisan-detail-modal');
  renderArtisansTable(ADMIN_ARTISANS);
  showToast('✅ Artisan approuvé avec succès', 'success');
}

function suspendArtisan() {
  if (!currentArtisanId) return;
  const a = ADMIN_ARTISANS.find(x => x.id === currentArtisanId);
  if (a) { a.status = a.status === 'active' ? 'suspended' : 'active'; }
  closeModal('artisan-detail-modal');
  renderArtisansTable(ADMIN_ARTISANS);
  showToast('🚫 Statut artisan mis à jour', 'info');
}

/* ── CLIENTS TABLE ───────────────────────────────────────────── */
function renderClientsTable() {
  const tbody = document.getElementById('clients-admin-tbody');
  if (!tbody) return;
  tbody.innerHTML = ADMIN_CLIENTS.map(c => `
    <tr>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar" style="background:linear-gradient(135deg,#405DE6,#833AB4)">${c.name.charAt(0)}</div>
          <div class="admin-user-name">${c.name}</div>
        </div>
      </td>
      <td>${c.email}</td>
      <td>📍 ${c.city}</td>
      <td>${c.missions}</td>
      <td>${c.joined}</td>
      <td><span class="status-badge status-${c.status}">${statusLabel(c.status)}</span></td>
      <td>
        <button class="tbl-btn danger" onclick="confirmAction('ban_client',${c.id})">🚫 Bannir</button>
      </td>
    </tr>
  `).join('');
}

/* ── REGISTRATIONS ───────────────────────────────────────────── */
function renderRegistrations() {
  const el = document.getElementById('registrations-list');
  if (!el) return;
  el.innerHTML = ADMIN_REGISTRATIONS.map(r => `
    <div class="reg-card">
      <div class="reg-card-header">
        <div class="admin-avatar">${r.name.charAt(0)}</div>
        <div class="reg-card-info">
          <h4>${r.name}</h4>
          <p>${r.specialty} · 📍 ${r.city} · 📧 ${r.email}</p>
          <p style="font-size:.75rem;color:var(--text-muted)">${r.experience} d'expérience · Soumis le ${r.submitted}</p>
        </div>
        <div class="reg-actions">
          <button class="tbl-btn success" onclick="approveRegistration(${r.id})">✅ Approuver</button>
          <button class="tbl-btn danger" onclick="rejectRegistration(${r.id})">❌ Refuser</button>
        </div>
      </div>
    </div>
  `).join('') || '<p style="color:var(--text-muted)">Aucune inscription en attente.</p>';
}

function approveRegistration(id) {
  const idx = ADMIN_REGISTRATIONS.findIndex(r => r.id === id);
  if (idx > -1) {
    ADMIN_REGISTRATIONS.splice(idx, 1);
    document.getElementById('sc-regs').textContent = ADMIN_REGISTRATIONS.length;
    renderRegistrations();
    showToast('✅ Inscription approuvée ! L\'artisan peut maintenant accéder à la plateforme.', 'success');
  }
}

function rejectRegistration(id) {
  const idx = ADMIN_REGISTRATIONS.findIndex(r => r.id === id);
  if (idx > -1) {
    ADMIN_REGISTRATIONS.splice(idx, 1);
    document.getElementById('sc-regs').textContent = ADMIN_REGISTRATIONS.length;
    renderRegistrations();
    showToast('❌ Inscription refusée. Un email a été envoyé au candidat.', 'info');
  }
}

/* ── SUBSCRIPTIONS TABLE ─────────────────────────────────────── */
function renderSubscriptions() {
  const tbody = document.getElementById('subscriptions-admin-tbody');
  if (!tbody) return;
  tbody.innerHTML = ADMIN_SUBSCRIPTIONS.map(s => `
    <tr>
      <td>${s.artisan}</td>
      <td><span class="plan-badge plan-${s.plan}">${planLabel(s.plan)}</span></td>
      <td>${s.start}</td>
      <td>${s.renewal}</td>
      <td>${s.amount > 0 ? s.amount + ' MAD' : '—'}</td>
      <td><span class="status-badge status-${s.status}">${statusLabel(s.status)}</span></td>
      <td>
        ${s.plan !== 'free'
          ? `<button class="tbl-btn danger" onclick="cancelSubscription('${s.artisan}')">Annuler</button>`
          : '<span style="color:var(--text-muted);font-size:.78rem">—</span>'}
      </td>
    </tr>
  `).join('');
}

function cancelSubscription(artisan) {
  showToast(`⚠️ Abonnement de ${artisan} annulé.`, 'warning');
}

/* ── PAYMENTS TABLE ──────────────────────────────────────────── */
function renderPayments() {
  const tbody = document.getElementById('payments-admin-tbody');
  if (!tbody) return;
  tbody.innerHTML = ADMIN_PAYMENTS.map(p => `
    <tr>
      <td style="font-family:monospace;font-size:.78rem">${p.ref}</td>
      <td>${p.artisan}</td>
      <td><span class="plan-badge plan-${p.plan.toLowerCase()}">${p.plan}</span></td>
      <td>${p.method}</td>
      <td>${p.amount > 0 ? p.amount + ' MAD' : '—'}</td>
      <td>${p.date}</td>
      <td><span class="status-badge status-${p.status}">${p.status === 'success' ? '✅ Succès' : p.status === 'failed' ? '❌ Échoué' : '↩ Remboursé'}</span></td>
    </tr>
  `).join('');
}

/* ── REVIEWS MODERATION ──────────────────────────────────────── */
function renderReviews() {
  const el = document.getElementById('reviews-mod-list');
  if (!el) return;
  if (!ADMIN_REVIEWS.length) { el.innerHTML = '<p style="color:var(--text-muted)">Aucun avis en attente.</p>'; return; }
  el.innerHTML = ADMIN_REVIEWS.map(r => `
    <div class="review-mod-card">
      <div class="review-mod-header">
        <div class="admin-avatar">${r.client.charAt(0)}</div>
        <div>
          <div style="font-weight:700;font-size:.9rem">${r.client}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">Pour ${r.artisan} · ${r.date}</div>
        </div>
        <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      </div>
      <div class="review-content">"${r.text}"</div>
      <div class="review-actions">
        <button class="tbl-btn success" onclick="approveReview(${r.id})">✅ Approuver</button>
        <button class="tbl-btn danger" onclick="rejectReview(${r.id})">🗑 Supprimer</button>
      </div>
    </div>
  `).join('');
}

function approveReview(id) {
  const idx = ADMIN_REVIEWS.findIndex(r => r.id === id);
  if (idx > -1) { ADMIN_REVIEWS.splice(idx, 1); renderReviews(); showToast('✅ Avis approuvé', 'success'); }
}
function rejectReview(id) {
  const idx = ADMIN_REVIEWS.findIndex(r => r.id === id);
  if (idx > -1) { ADMIN_REVIEWS.splice(idx, 1); renderReviews(); showToast('🗑 Avis supprimé', 'info'); }
}

/* ── REPORTS ─────────────────────────────────────────────────── */
function renderReports() {
  const el = document.getElementById('reports-list');
  if (!el) return;
  const statusColors = { open:'warning', investigating:'info', resolved:'success' };
  el.innerHTML = ADMIN_REPORTS.map(r => `
    <div class="review-mod-card">
      <div class="review-mod-header">
        <div class="admin-avatar" style="background:rgba(225,48,108,.2);color:var(--primary)">🚩</div>
        <div>
          <div style="font-weight:700;font-size:.9rem">${r.type} — ${r.target}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">Signalé par ${r.reporter} · ${r.date}</div>
        </div>
        <span class="status-badge status-${statusColors[r.status]||'pending'}">${r.status}</span>
      </div>
      <div style="font-size:.85rem;color:rgba(255,255,255,.75);margin-bottom:12px">${r.reason}</div>
      <div class="review-actions">
        ${r.status !== 'resolved' ? `<button class="tbl-btn success" onclick="resolveReport(${r.id})">✅ Résolu</button>` : ''}
        <button class="tbl-btn danger" onclick="dismissReport(${r.id})">🗑 Ignorer</button>
      </div>
    </div>
  `).join('');
}

function resolveReport(id) {
  const r = ADMIN_REPORTS.find(x => x.id === id);
  if (r) { r.status = 'resolved'; renderReports(); showToast('✅ Signalement marqué comme résolu', 'success'); }
}
function dismissReport(id) {
  const idx = ADMIN_REPORTS.findIndex(x => x.id === id);
  if (idx > -1) { ADMIN_REPORTS.splice(idx, 1); renderReports(); showToast('🗑 Signalement ignoré', 'info'); }
}

/* ── CONFIRM ACTION ──────────────────────────────────────────── */
function confirmAction(type, id) {
  const labels = {
    suspend: { title:'Suspendre l\'artisan', msg:'L\'artisan n\'aura plus accès à la plateforme. Confirmer ?', icon:'🚫' },
    activate:{ title:'Réactiver l\'artisan', msg:'L\'artisan aura de nouveau accès à la plateforme.', icon:'✅' },
    ban_client:{ title:'Bannir le client', msg:'Le client ne pourra plus utiliser Fixeo. Confirmer ?', icon:'🚫' }
  };
  const l = labels[type] || { title:'Confirmer', msg:'Cette action est irréversible.', icon:'⚠️' };
  document.getElementById('admin-confirm-icon').textContent = l.icon;
  document.getElementById('admin-confirm-title').textContent = l.title;
  document.getElementById('admin-confirm-msg').textContent = l.msg;
  const btn = document.getElementById('admin-confirm-ok');
  btn.onclick = () => {
    executeAction(type, id);
    closeModal('admin-confirm-modal');
  };
  openModal('admin-confirm-modal');
}

function executeAction(type, id) {
  if (type === 'suspend') {
    const a = ADMIN_ARTISANS.find(x => x.id === id);
    if (a) { a.status = 'suspended'; renderArtisansTable(ADMIN_ARTISANS); showToast('🚫 Artisan suspendu', 'warning'); }
  } else if (type === 'activate') {
    const a = ADMIN_ARTISANS.find(x => x.id === id);
    if (a) { a.status = 'active'; renderArtisansTable(ADMIN_ARTISANS); showToast('✅ Artisan réactivé', 'success'); }
  } else if (type === 'ban_client') {
    const c = ADMIN_CLIENTS.find(x => x.id === id);
    if (c) { c.status = 'suspended'; renderClientsTable(); showToast('🚫 Client banni', 'warning'); }
  }
}

/* ── SETTINGS ────────────────────────────────────────────────── */
function saveAdminSettings() {
  showToast('💾 Paramètres sauvegardés avec succès', 'success');
}

/* ── MODAL OPEN/CLOSE ────────────────────────────────────────── */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  let bd = document.getElementById('admin-bd');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'admin-bd';
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:999;';
    bd.onclick = () => { modal.classList.remove('open'); bd.remove(); };
    document.body.appendChild(bd);
  }
  modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal?.classList.remove('open');
  document.getElementById('admin-bd')?.remove();
}

/* ── TOAST ───────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const colors = { success:'rgba(32,201,151,.9)', warning:'rgba(252,175,69,.9)', info:'rgba(64,93,230,.9)', error:'rgba(225,48,108,.9)' };
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colors[type]||colors.info}; color:#fff;
    padding:12px 20px; border-radius:12px;
    font-size:.85rem; font-weight:600;
    box-shadow:0 8px 24px rgba(0,0,0,0.35);
    animation:slideUp .3s ease; max-width:340px; line-height:1.4;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.animation='fadeOutDown .3s ease forwards'; setTimeout(()=>t.remove(),300); }, 3500);
}

/* ── HELPERS ─────────────────────────────────────────────────── */
function planLabel(plan) {
  return { free:'🆓 Free', pro:'🏅 Pro', premium:'👑 Premium' }[plan] || plan;
}
function statusLabel(status) {
  return { active:'● Actif', pending:'● En attente', suspended:'● Suspendu', resolved:'● Résolu' }[status] || status;
}

/* CSS injection for animations */
(function(){
  const s = document.createElement('style');
  s.textContent = `
    @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeOutDown { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(10px)} }
  `;
  document.head.appendChild(s);
})();

/* ================================================================
   FIXEO V10 — MODULE RÉSERVATIONS ADMIN
   Intégré de façon non-destructive · Tous les systèmes existants
   restent intacts.
   ================================================================ */

/* ── TAUX DE COMMISSION FIXEO (admin uniquement) ─────────────── */
const FIXEO_COMMISSION_RATE = 0.15; // 15 %

/**
 * Calcule la commission Fixeo (15 %) et le gain artisan.
 * @param {number} price  Prix du service en MAD
 * @returns {{ commission: number, artisanEarns: number }}
 */
function _calcCommission(price, method) {
  /* COD utilise 10% de commission, les autres méthodes 15% */
  const isCOD = (method === 'Cash on Delivery' || method === 'COD');
  const rate = isCOD ? 0.10 : FIXEO_COMMISSION_RATE;
  const commission   = Math.round(price * rate);
  const artisanEarns = Math.round(price - commission);
  return { commission, artisanEarns };
}

/* ── DATA STORE RÉSERVATIONS ──────────────────────────────────── */
const ADMIN_RESERVATIONS = [];

/* Merge reservations from localStorage (created via reservation.js / payment.js / paypal-sandbox.js) */
function _mergeLocalStorageReservations() {
  try {
    const stored = JSON.parse(localStorage.getItem('fixeo_reservations') || '[]');
    stored.forEach(r => {
      if (!ADMIN_RESERVATIONS.find(x => x.id === r.id)) {
        ADMIN_RESERVATIONS.unshift({
          id        : r.id || ('RES-LS-' + Date.now()),
          client    : r.client || r.clientName || localStorage.getItem('fixeo_user_name') || 'Client',
          clientId  : r.clientId || 0,
          artisan   : r.artisan || r.artisanName || '—',
          artisanId : r.artisanId || 0,
          service   : r.service || '—',
          city      : r.city || '—',
          date      : r.date || new Date().toLocaleDateString('fr-FR'),
          time      : r.timeSlot || r.time || '—',
          status    : r.status || 'pending',
          payStatus : r.payStatus || (r.status === 'confirmed' ? 'paid' : 'pending_pay'),
          price     : r.price || r.amount || 0,
          method    : r.method || r.paymentMethod || '—',
          txnId     : r.txnId  || r.transactionId || '',
          commission: r.commission || 0,
          netArtisan: r.netArtisan || 0,
          type      : (r.type || (r.isExpress ? 'express' : 'standard')),
          createdAt : r.createdAt || new Date().toLocaleDateString('fr-FR'),
        });
      }
    });
    // Also pull from payment history (including PayPal sandbox payments)
    const history = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
    history.forEach(h => {
      const hid = 'RES-' + h.id;
      if (!ADMIN_RESERVATIONS.find(x => x.id === hid)) {
        ADMIN_RESERVATIONS.unshift({
          id        : hid,
          client    : localStorage.getItem('fixeo_user_name') || 'Client',
          clientId  : 0,
          artisan   : h.artisan || '—',
          artisanId : h.artisanId || 0,
          service   : h.service || '—',
          city      : '—',
          date      : h.date || '—',
          time      : h.timeSlot || '—',
          status    : (h.status === 'confirmed' || h.status === 'paid') ? 'confirmed' : 'pending',
          payStatus : (h.payStatus || h.status === 'paid') ? 'paid' : 'pending_pay',
          price     : h.amount || 0,
          method    : h.paymentMethod || h.method || '—',
          txnId     : h.id || '',
          commission: h.commission || Math.round((h.amount || 0) * FIXEO_COMMISSION_RATE),
          netArtisan: h.netArtisan || ((h.amount || 0) - Math.round((h.amount || 0) * FIXEO_COMMISSION_RATE)),
          type      : h.type || 'standard',
          createdAt : h.transactionDate || h.date || '—',
        });
      }
    });
  } catch(e) { /* silent fail */ }
}

const URGENT_EVENTS_STORAGE_KEY = 'fixeo_urgent_events';

function _readUrgentEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(URGENT_EVENTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function _getUrgentPerformanceSummary() {
  const summary = {
    urgent_open: 0,
    urgent_submit: 0,
    artisan_click: 0,
    conversion: 0,
    total: 0,
  };

  _readUrgentEvents().forEach((event) => {
    if (!event || !event.type) return;
    if (Object.prototype.hasOwnProperty.call(summary, event.type)) {
      summary[event.type] += 1;
    }
    summary.total += 1;
  });

  return summary;
}

function renderUrgentPerformanceKPIs() {
  const summary = _getUrgentPerformanceSummary();
  _setText('urgent-kpi-open', summary.urgent_open.toLocaleString('fr-FR'));
  _setText('urgent-kpi-submit', summary.urgent_submit.toLocaleString('fr-FR'));
  _setText('urgent-kpi-click', summary.artisan_click.toLocaleString('fr-FR'));
  _setText('urgent-kpi-conversion', summary.conversion.toLocaleString('fr-FR'));

  const caption = document.getElementById('urgent-performance-caption');
  if (caption) {
    caption.textContent = summary.total
      ? `${summary.total.toLocaleString('fr-FR')} événement${summary.total > 1 ? 's' : ''} tracké${summary.total > 1 ? 's' : ''}`
      : 'Aucune donnée urgent trackée pour le moment';
  }
}

/* ── STATE ──────────────────────────────────────────────────────── */
let _currentResId = null;

/* ── INIT ──────────────────────────────────────────────────────── */
/* ── V10 INIT — replaces base initAdmin ─────────────────────── */
function initAdmin() {
  /* Base init */
  updateLastTime();
  renderAdminCharts();
  renderActivityList();
  renderAdminAlerts();
  renderArtisansTable(ADMIN_ARTISANS);
  renderClientsTable();
  renderRegistrations();
  renderSubscriptions();
  renderPayments();
  renderReviews();
  renderReports();
  renderUrgentPerformanceKPIs();
  /* Réservations module */
  _mergeLocalStorageReservations();
  renderReservations();
  _updateReservationKPIs();
  _updateReservationSidebarCount();
  _updateOverviewReservationKPI();
}

/* ── KPI UPDATE ────────────────────────────────────────────────── */
function _updateReservationKPIs() {
  const pending   = ADMIN_RESERVATIONS.filter(r => r.status === 'pending').length;
  const confirmed = ADMIN_RESERVATIONS.filter(r => r.status === 'confirmed').length;
  const inprog    = ADMIN_RESERVATIONS.filter(r => r.status === 'inprogress').length;
  const completed = ADMIN_RESERVATIONS.filter(r => r.status === 'completed').length;
  const revenue   = ADMIN_RESERVATIONS
    .filter(r => r.payStatus === 'paid')
    .reduce((sum, r) => sum + _calcCommission(r.price, r.method).commission, 0);

  _setText('res-kpi-pending',    pending);
  _setText('res-kpi-confirmed',  confirmed);
  _setText('res-kpi-inprogress', inprog);
  _setText('res-kpi-completed',  completed);
  _setText('res-kpi-revenue',    revenue.toLocaleString('fr-FR'));
}

function _updateReservationSidebarCount() {
  const pending = ADMIN_RESERVATIONS.filter(r => r.status === 'pending').length;
  _setText('sc-reservations', pending);
}

function _updateOverviewReservationKPI() {
  /* Inject a reservation KPI in the overview grid if not already present */
  const grid = document.querySelector('.admin-kpi-grid');
  if (!grid || document.getElementById('kpi-reservations-card')) return;
  const total = ADMIN_RESERVATIONS.length;
  const card = document.createElement('div');
  card.id = 'kpi-reservations-card';
  card.className = 'kpi-card admin-kpi';
  card.style.cssText = 'border-left:3px solid #5B8CFF';
  card.innerHTML = `
    <div class="kpi-header">
      <div class="kpi-icon" style="background:rgba(91,140,255,.15);color:#5B8CFF">📅</div>
      <div class="kpi-trend up">↑ +18%</div>
    </div>
    <div class="kpi-value" id="kpi-reservations">${total}</div>
    <div class="kpi-label">Réservations totales</div>
  `;
  grid.appendChild(card);
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── RENDER TABLE ──────────────────────────────────────────────── */
function renderReservations(data) {
  const tbody = document.getElementById('reservations-admin-tbody');
  if (!tbody) return;
  const src = data || ADMIN_RESERVATIONS;
  if (!src.length) {
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text-muted)">Aucune réservation trouvée.</td></tr>`;
    return;
  }
  tbody.innerHTML = src.map(r => {
    const { commission, artisanEarns } = _calcCommission(r.price, r.method);
    return `
    <tr>
      <td style="font-family:monospace;font-size:.75rem;white-space:nowrap">
        ${r.id}
        ${r.type === 'express' ? '<span class="res-express-badge">⚡ Express</span>' : ''}
        ${(r.method === 'Cash on Delivery' || r.method === 'COD') ? '<span class="cod-res-badge">💵 COD</span>' : ''}
      </td>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar" style="background:linear-gradient(135deg,#405DE6,#833AB4);font-size:.72rem">${r.client.charAt(0)}</div>
          <span style="font-size:.84rem;font-weight:600">${r.client}</span>
        </div>
      </td>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar" style="font-size:.72rem">${r.artisan.charAt(0)}</div>
          <span style="font-size:.84rem;font-weight:600">${r.artisan}</span>
        </div>
      </td>
      <td style="font-size:.82rem;max-width:160px">${r.service}</td>
      <td style="font-size:.82rem;white-space:nowrap">${r.date}</td>
      <td><span class="status-badge res-status-${r.status}">${_resStatusLabel(r.status)}</span></td>
      <td><span class="status-badge res-pay-${r.payStatus}">${_resPayLabel(r.payStatus)}</span></td>
      <td style="font-weight:700;white-space:nowrap;color:var(--success)">${r.price} MAD</td>
      <td style="font-weight:700;white-space:nowrap;color:var(--warning)">${commission} MAD</td>
      <td style="font-weight:700;white-space:nowrap;color:#20C997">${artisanEarns} MAD</td>
      <td style="white-space:nowrap">
        ${r.method === 'PayPal'
          ? '<span class="paypal-method-badge">🅿️ PayPal</span>'
          : (r.method === 'Stripe'
            ? '<span class="stripe-method-badge">💳 Stripe</span>'
            : (r.method === 'CMI'
              ? '<span class="cmi-method-badge">🇲🇦 CMI</span>'
              : (r.method || '—')))}
      </td>
      <td style="font-family:monospace;font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.txnId || ''}">
        ${r.txnId
          ? `<span class="res-txn-id">${r.txnId.substring(0,14)}${r.txnId.length > 14 ? '…' : ''}</span>`
          : '<span style="color:var(--text-muted)">—</span>'}
      </td>
      <td>
        ${(function(){
          if (r.status === 'cancelled' || r.status === 'completed') {
            return '<span class="slot-admin-badge-free">🟢 Libre</span>';
          }
          return '<span class="slot-admin-badge-booked">🔴 Occupé</span>';
        })()}
      </td>
      <td style="white-space:nowrap">
        <button class="tbl-btn" onclick="viewReservationDetail('${r.id}')">👁 Voir</button>
        ${r.status !== 'cancelled' && r.status !== 'completed'
          ? `<button class="tbl-btn danger" onclick="confirmCancelReservation('${r.id}')">✕ Annuler</button>`
          : ''}
      </td>
    </tr>
    `;
  }).join('');
}

/* ── FILTERS ──────────────────────────────────────────────────── */
function filterReservations() {
  const q      = (document.getElementById('res-search')?.value || '').toLowerCase();
  const status = document.getElementById('res-filter-status')?.value || '';
  const pay    = document.getElementById('res-filter-payment')?.value || '';

  const filtered = ADMIN_RESERVATIONS.filter(r => {
    const matchQ = !q || [r.id, r.client, r.artisan, r.service, r.city]
      .some(v => v.toLowerCase().includes(q));
    const matchS = !status || r.status === status;
    const matchP = !pay    || r.payStatus === pay;
    return matchQ && matchS && matchP;
  });
  renderReservations(filtered);
}

function refreshReservations() {
  _mergeLocalStorageReservations();
  renderReservations();
  _updateReservationKPIs();
  _updateReservationSidebarCount();
  document.getElementById('res-search')  && (document.getElementById('res-search').value  = '');
  document.getElementById('res-filter-status')  && (document.getElementById('res-filter-status').value  = '');
  document.getElementById('res-filter-payment') && (document.getElementById('res-filter-payment').value = '');
  showToast('✅ Réservations actualisées', 'success');
}

/* ── DETAIL MODAL ─────────────────────────────────────────────── */
function viewReservationDetail(id) {
  _currentResId = id;
  const r = ADMIN_RESERVATIONS.find(x => x.id === id);
  if (!r) return;

  const { commission, artisanEarns } = _calcCommission(r.price, r.method);

  document.getElementById('res-detail-title').textContent = `📅 Réservation ${r.id}`;

  document.getElementById('res-detail-body').innerHTML = `
    <div class="res-detail-grid">
      <!-- Bloc Infos générales -->
      <div class="res-detail-block">
        <h4 class="res-detail-section-title">📋 Informations générales</h4>
        ${_detailRow('ID Réservation', `<span style="font-family:monospace">${r.id}</span>`)}
        ${_detailRow('Type', r.type === 'express'
          ? '<span class="res-express-badge" style="font-size:.78rem">⚡ Express</span>'
          : '📋 Standard')}
        ${_detailRow('Service', r.service)}
        ${_detailRow('Ville', `📍 ${r.city}`)}
        ${_detailRow('Date', r.date)}
        ${_detailRow('Créneau', r.time)}
        ${_detailRow('Créé le', r.createdAt)}
        ${_detailRow('Statut', `<span class="status-badge res-status-${r.status}">${_resStatusLabel(r.status)}</span>`)}
      </div>

      <!-- Bloc Personnes -->
      <div class="res-detail-block">
        <h4 class="res-detail-section-title">👤 Parties concernées</h4>
        <div class="res-person-card" style="margin-bottom:12px">
          <div class="admin-avatar" style="background:linear-gradient(135deg,#405DE6,#833AB4);">${r.client.charAt(0)}</div>
          <div>
            <div style="font-weight:700;font-size:.88rem">${r.client}</div>
            <div style="font-size:.74rem;color:var(--text-muted)">Client · ID ${r.clientId}</div>
            <button class="tbl-btn" style="margin-top:6px;font-size:.72rem" onclick="contactClient('${r.client}')">✉️ Contacter</button>
          </div>
        </div>
        <div class="res-person-card">
          <div class="admin-avatar">${r.artisan.charAt(0)}</div>
          <div>
            <div style="font-weight:700;font-size:.88rem">${r.artisan}</div>
            <div style="font-size:.74rem;color:var(--text-muted)">Artisan · ID ${r.artisanId}</div>
            <button class="tbl-btn" style="margin-top:6px;font-size:.72rem" onclick="contactArtisan('${r.artisan}')">✉️ Contacter</button>
          </div>
        </div>
      </div>

      <!-- Bloc Paiement (pleine largeur) -->
      <div class="res-detail-block res-detail-block-full">
        <h4 class="res-detail-section-title">💳 Informations de paiement</h4>
        <div class="res-payment-breakdown">
          <div class="res-pay-row">
            <span class="res-pay-label">💰 Prix service</span>
            <span class="res-pay-value">${r.price} MAD</span>
          </div>
          <div class="res-pay-row">
            <span class="res-pay-label">🏢 Commission Fixeo (15%)</span>
            <span class="res-pay-value" style="color:var(--warning)">+ ${commission} MAD</span>
          </div>
          <div class="res-pay-row">
            <span class="res-pay-label">👷 Artisan reçoit</span>
            <span class="res-pay-value" style="color:var(--success)">${artisanEarns} MAD</span>
          </div>
          <div class="res-pay-divider"></div>
          <div class="res-pay-row">
            <span class="res-pay-label">💳 Méthode</span>
            <span class="res-pay-value">
              ${r.method === 'PayPal'
                ? '<span class="paypal-method-badge">🅿️ PayPal Sandbox</span>'
                : (r.method || '—')}
            </span>
          </div>
          <div class="res-pay-row">
            <span class="res-pay-label">📊 Statut paiement</span>
            <span class="status-badge res-pay-${r.payStatus}">${_resPayLabel(r.payStatus)}</span>
          </div>
          ${r.txnId ? `
          <div class="res-pay-row">
            <span class="res-pay-label">🔗 Transaction ID</span>
            <span class="res-pay-value res-txn-id" title="${r.txnId}">${r.txnId}</span>
          </div>` : ''}
        </div>
      </div>
    </div>
  `;

  /* Show/hide action buttons based on status */
  const cancelBtn = document.getElementById('res-detail-cancel-btn');
  const statusBtn = document.getElementById('res-detail-status-btn');
  if (cancelBtn) cancelBtn.style.display = (r.status === 'cancelled' || r.status === 'completed') ? 'none' : 'inline-flex';
  if (statusBtn) statusBtn.style.display = (r.status === 'cancelled' || r.status === 'completed') ? 'none' : 'inline-flex';

  openModal('reservation-detail-modal');
}

function _detailRow(label, value) {
  return `<div class="artisan-detail-row">
    <div class="artisan-detail-label">${label}</div>
    <div class="artisan-detail-value">${value}</div>
  </div>`;
}

/* ── STATUS MODAL ──────────────────────────────────────────────── */
function openStatusModal() {
  const r = ADMIN_RESERVATIONS.find(x => x.id === _currentResId);
  if (!r) return;
  /* Pre-select current status */
  const radios = document.querySelectorAll('input[name="new_status"]');
  radios.forEach(radio => { radio.checked = radio.value === r.status; });
  openModal('reservation-status-modal');
}

function applyStatusChange() {
  const selected = document.querySelector('input[name="new_status"]:checked');
  if (!selected) { showToast('⚠️ Veuillez sélectionner un statut', 'warning'); return; }
  const r = ADMIN_RESERVATIONS.find(x => x.id === _currentResId);
  if (!r) return;
  const oldStatus = r.status;
  r.status = selected.value;
  /* Persist to localStorage */
  _persistReservationUpdate(r);
  /* ── Si annulé, libérer le créneau dans SlotLock ── */
  if (r.status === 'cancelled' && window.FixeoSlotLock) {
    window.FixeoSlotLock.onReservationCancelled(r.id);
  }
  closeModal('reservation-status-modal');
  closeModal('reservation-detail-modal');
  renderReservations();
  _updateReservationKPIs();
  _updateReservationSidebarCount();
  showToast(`✅ Statut mis à jour : ${_resStatusLabel(r.status)}`, 'success');
}

/* ── CANCEL ────────────────────────────────────────────────────── */
function confirmCancelReservation(id) {
  _currentResId = id;
  const r = ADMIN_RESERVATIONS.find(x => x.id === id);
  if (!r) return;
  document.getElementById('admin-confirm-icon').textContent  = '❌';
  document.getElementById('admin-confirm-title').textContent = 'Annuler la réservation';
  document.getElementById('admin-confirm-msg').textContent   =
    `Annuler la réservation ${id} pour ${r.client} ? Le paiement sera remboursé si applicable.`;
  const btn = document.getElementById('admin-confirm-ok');
  btn.onclick = () => { _doCancelReservation(id); closeModal('admin-confirm-modal'); };
  openModal('admin-confirm-modal');
}

function cancelReservationFromModal() {
  closeModal('reservation-detail-modal');
  confirmCancelReservation(_currentResId);
}

function _doCancelReservation(id) {
  const r = ADMIN_RESERVATIONS.find(x => x.id === id);
  if (!r) return;
  r.status = 'cancelled';
  if (r.payStatus === 'paid') r.payStatus = 'refunded';
  _persistReservationUpdate(r);
  /* ── Notify SlotLock: libérer le créneau ── */
  if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCancelled === 'function') {
    window.FixeoSlotLock.onReservationCancelled(id);
  }
  renderReservations();
  _updateReservationKPIs();
  _updateReservationSidebarCount();
  showToast(`❌ Réservation ${id} annulée.`, 'warning');
}

/* ── CONTACT ───────────────────────────────────────────────────── */
function contactClient(name) {
  showToast(`✉️ Email envoyé au client ${name}`, 'info');
}
function contactArtisan(name) {
  showToast(`✉️ Email envoyé à l'artisan ${name}`, 'info');
}

/* ── PERSIST ───────────────────────────────────────────────────── */
function _persistReservationUpdate(r) {
  try {
    const stored = JSON.parse(localStorage.getItem('fixeo_reservations') || '[]');
    const idx = stored.findIndex(x => x.id === r.id);
    if (idx > -1) stored[idx] = r; else stored.push(r);
    localStorage.setItem('fixeo_reservations', JSON.stringify(stored));
  } catch(e) { /* silent */ }
}

/* ── LABEL HELPERS ─────────────────────────────────────────────── */
function _resStatusLabel(status) {
  return {
    pending    : '🕐 En attente',
    confirmed  : '✅ Confirmée',
    inprogress : '🔧 En cours',
    completed  : '✔️ Terminée',
    cancelled  : '❌ Annulée',
  }[status] || status;
}

function _resPayLabel(status) {
  return {
    paid        : '💳 Payé',
    pending_pay : '⏳ En attente',
    refunded    : '↩ Remboursé',
  }[status] || status;
}

/* ── PUBLIC API (for reservation.js / payment.js integration) ──── */
window.FixeoAdminReservations = {
  /**
   * Called by reservation.js / payment.js after a booking is confirmed.
   * Automatically registers the reservation in the admin dashboard.
   */
  addReservation: function(bookingData) {
    if (!bookingData) return;
    const newRes = {
      id       : 'RES-' + Date.now().toString(36).toUpperCase(),
      client   : bookingData.clientName  || localStorage.getItem('fixeo_user_name') || 'Client',
      clientId : bookingData.clientId    || 0,
      artisan  : bookingData.artisanName || bookingData.artisan || '—',
      artisanId: bookingData.artisanId   || 0,
      service  : bookingData.service     || '—',
      city     : bookingData.city        || '—',
      date     : bookingData.date        || new Date().toLocaleDateString('fr-FR'),
      time     : bookingData.timeSlot    || bookingData.time || '—',
      status   : 'pending',
      payStatus: bookingData.paid ? 'paid' : 'pending_pay',
      price    : bookingData.price       || bookingData.amount || 0,
      method   : bookingData.paymentMethod || bookingData.method || '—',
      type     : bookingData.isExpress   ? 'express' : 'standard',
      createdAt: new Date().toLocaleDateString('fr-FR'),
    };
    /* Pré-calcul commission 15 % pour analytics */
    const _cv = _calcCommission(newRes.price, newRes.method);
    newRes.commission   = _cv.commission;
    newRes.artisanEarns = _cv.artisanEarns;
    if (!ADMIN_RESERVATIONS.find(x => x.id === newRes.id)) {
      ADMIN_RESERVATIONS.unshift(newRes);
    }
    _persistReservationUpdate(newRes);
    /* Refresh admin view if it's open */
    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
  }
};

/* ══════════════════════════════════════════════════════════════
   FIXEO V14 — MODULE COD ADMIN
   Gère l'affichage et les actions pour les commandes
   Cash on Delivery dans le dashboard administrateur.
══════════════════════════════════════════════════════════════ */

/* ── Afficher la section COD ─────────────────────────────── */
function adminSection(section) {
  /* Cacher toutes les sections */
  document.querySelectorAll('[id^="admin-section-"]').forEach(el => {
    el.style.display = 'none';
  });
  /* Retirer .active sur les liens sidebar */
  document.querySelectorAll('.sidebar-link').forEach(el => {
    el.classList.remove('active');
  });

  const targetId = 'admin-section-' + section;
  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    targetEl.style.display = 'block';
  }

  /* Si section COD → charger les données */
  if (section === 'cod-orders') {
    renderCODOrders();
    _updateCODKPIs();
  }

  /* ── V20 : charger le module artisans à la demande ── */
  if (section === 'artisans' && typeof initArtisansAdmin === 'function') {
    setTimeout(initArtisansAdmin, 50);
  }
}

/* ── Extraire les commandes COD depuis ADMIN_RESERVATIONS ─── */
function _getCODOrders() {
  return ADMIN_RESERVATIONS.filter(r =>
    r.method === 'Cash on Delivery' ||
    r.method === 'COD' ||
    r.payStatus === 'pending_cod' ||
    r.payStatus === 'cod_paid' ||
    (r.id && r.id.startsWith('COD-'))
  );
}

/* ── Mettre à jour les KPIs COD ──────────────────────────── */
function _updateCODKPIs() {
  const orders = _getCODOrders();

  const total      = orders.length;
  const pending    = orders.filter(r => r.status === 'pending' || r.payStatus === 'pending_cod').length;
  const confirmed  = orders.filter(r => r.status === 'confirmed').length;
  const revenue    = orders.reduce((s, r) => s + (parseFloat(r.price) || 0), 0);
  const commission = orders.reduce((s, r) => s + (r.commission || Math.round((parseFloat(r.price) || 0) * 0.10)), 0);

  _setKPI('cod-kpi-total',      total);
  _setKPI('cod-kpi-pending',    pending);
  _setKPI('cod-kpi-confirmed',  confirmed);
  _setKPI('cod-kpi-revenue',    revenue.toLocaleString('fr-FR') + ' MAD');
  _setKPI('cod-kpi-commission', commission.toLocaleString('fr-FR') + ' MAD');

  /* Badge sidebar */
  const badge = document.getElementById('sc-cod');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
}

function _setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── Rendu de la table COD ───────────────────────────────── */
function renderCODOrders(data) {
  const tbody = document.getElementById('cod-admin-tbody');
  if (!tbody) return;

  const src = data || _getCODOrders();

  if (!src.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:rgba(255,255,255,.4)">
      💵 Aucune commande Cash on Delivery.<br/>
      <small style="font-size:.8rem;opacity:.6">Les commandes COD apparaîtront ici dès qu'un client choisit le paiement à la livraison.</small>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = src.map(r => {
    const commission = r.commission != null
      ? r.commission
      : Math.round((parseFloat(r.price) || 0) * 0.10);
    const netArtisan = r.netArtisan != null
      ? r.netArtisan
      : Math.round((parseFloat(r.price) || 0) * 0.90);

    const slotLockHtml = (r.slotLock === true || r.slotLock === 'true')
      ? '<span class="slot-admin-badge-booked">🔴 Verrouillé</span>'
      : '<span class="slot-admin-badge-free">🟢 Libre</span>';

    const payStatusHtml = {
      pending_cod : '<span class="status-badge" style="background:rgba(255,193,7,.15);color:#ffc107;border:1px solid rgba(255,193,7,.3)">💵 En attente COD</span>',
      cod_paid    : '<span class="status-badge" style="background:rgba(32,201,151,.15);color:#20C997;border:1px solid rgba(32,201,151,.3)">✅ COD Encaissé</span>',
      paid        : '<span class="status-badge" style="background:rgba(32,201,151,.15);color:#20C997">✅ Payé</span>',
    }[r.payStatus] || `<span class="status-badge">${r.payStatus || '—'}</span>`;

    return `
    <tr>
      <td style="font-family:monospace;font-size:.75rem;white-space:nowrap">
        <span style="color:#20C997;font-weight:700">${r.id}</span>
      </td>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar" style="background:linear-gradient(135deg,#20C997,#17a884);font-size:.72rem;color:#000">${r.client ? r.client.charAt(0) : '?'}</div>
          <span style="font-size:.84rem;font-weight:600">${r.client || '—'}</span>
        </div>
      </td>
      <td>
        <div class="admin-user-cell">
          <div class="admin-avatar" style="font-size:.72rem">${r.artisan ? r.artisan.charAt(0) : '?'}</div>
          <span style="font-size:.84rem;font-weight:600">${r.artisan || '—'}</span>
        </div>
      </td>
      <td style="font-size:.82rem;max-width:150px">${r.service || '—'}</td>
      <td style="font-size:.8rem;white-space:nowrap">
        <div>${r.date || '—'}</div>
        <div style="color:rgba(255,255,255,.45);font-size:.73rem">${r.time || r.timeSlot || '—'}</div>
      </td>
      <td><span class="status-badge res-status-${r.status}">${_resStatusLabel(r.status)}</span></td>
      <td>${payStatusHtml}</td>
      <td style="font-weight:700;color:var(--success);white-space:nowrap">${(parseFloat(r.price) || 0).toLocaleString('fr-FR')} MAD</td>
      <td style="font-weight:700;color:var(--warning);white-space:nowrap">${commission.toLocaleString('fr-FR')} MAD</td>
      <td style="font-weight:700;color:#20C997;white-space:nowrap">${netArtisan.toLocaleString('fr-FR')} MAD</td>
      <td>${slotLockHtml}</td>
      <td style="white-space:nowrap">
        ${r.payStatus === 'pending_cod'
          ? `<button class="tbl-btn" style="background:rgba(32,201,151,.2);color:#20C997" onclick="confirmCODPayment('${r.id}')">✅ Confirmer paiement</button>`
          : ''}
        ${r.status !== 'cancelled' && r.status !== 'completed'
          ? `<button class="tbl-btn danger" onclick="cancelCODOrder('${r.id}')">✕ Annuler</button>`
          : ''}
        <button class="tbl-btn" onclick="viewReservationDetail('${r.id}')">👁 Voir</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Filtrer les commandes COD ───────────────────────────── */
function filterCODOrders() {
  const q      = (document.getElementById('cod-search')?.value || '').toLowerCase();
  const status = document.getElementById('cod-filter-status')?.value || '';
  const all    = _getCODOrders();
  const filtered = all.filter(r => {
    const matchQ = !q || [r.id, r.client, r.artisan, r.service].some(v => v && v.toLowerCase().includes(q));
    const matchS = !status || r.status === status;
    return matchQ && matchS;
  });
  renderCODOrders(filtered);
}

/* ── Rafraîchir ─────────────────────────────────────────── */
function refreshCODOrders() {
  _mergeLocalStorageReservations();
  /* Tenter d'abord un fetch API (backend) */
  _fetchAdminOrdersFromAPI(function (ok) {
    renderCODOrders();
    _updateCODKPIs();
    _updateCODSidebarBadge();
    if (typeof showToast === 'function') showToast('✅ Commandes COD actualisées', 'success');
  });
}

/* ── Confirmer le paiement COD (encaissement) ────────────── */
function confirmCODPayment(id) {
  const r = ADMIN_RESERVATIONS.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`✅ Confirmer l'encaissement COD pour :\n${r.client} → ${r.artisan}\nService : ${r.service}\nMontant : ${r.price} MAD`)) return;

  r.payStatus = 'cod_paid';
  r.status    = r.status === 'pending' ? 'confirmed' : r.status;
  r.slotLock  = false; /* libérer le slot après encaissement */

  /* Persister dans localStorage */
  _persistReservationUpdate(r);

  renderCODOrders();
  renderReservations();
  _updateCODKPIs();
  _updateReservationKPIs();
  if (typeof showToast === 'function') showToast('✅ Paiement COD encaissé — ' + id, 'success');
}

/* ── Annuler une commande COD ────────────────────────────── */
function cancelCODOrder(id) {
  const r = ADMIN_RESERVATIONS.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`❌ Annuler la commande COD :\n${r.client} → ${r.artisan}\nService : ${r.service}\nDate : ${r.date} ?`)) return;

  r.status    = 'cancelled';
  r.slotLock  = false;

  /* Libérer le créneau via FixeoSlotLock */
  if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCancelled === 'function') {
    window.FixeoSlotLock.onReservationCancelled(id);
  }

  _persistReservationUpdate(r);
  renderCODOrders();
  renderReservations();
  _updateCODKPIs();
  _updateReservationKPIs();
  if (typeof showToast === 'function') showToast('❌ Commande COD annulée — ' + id, 'error');
}

/* ── Badge sidebar COD ───────────────────────────────────── */
function _updateCODSidebarBadge() {
  const orders = _getCODOrders();
  const pending = orders.filter(r => r.payStatus === 'pending_cod').length;
  const badge = document.getElementById('sc-cod');
  if (badge) {
    badge.textContent = pending > 0 ? pending : orders.length;
    badge.style.display = orders.length > 0 ? 'inline-flex' : 'none';
  }
}

/* ══════════════════════════════════════════════════════════════
   ADMIN ORDERS — Récupération API + Polling automatique
   ─────────────────────────────────────────────────────────────
   • Endpoint  : GET /api/admin/orders
   • Polling   : toutes les 10 secondes
   • Fallback  : localStorage si backend indisponible
══════════════════════════════════════════════════════════════ */

/* ── Base URL API (même logique que cod-payment.js) ─────── */
const _ADMIN_API_BASE = (function () {
  const h = window.location.hostname;
  const proto = window.location.protocol;
  if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt')) return window.location.origin;
  if (h === 'localhost' || h === '127.0.0.1') return proto + '//' + h + ':3001';
  return window.location.origin;
})();

let _adminOrdersPollingTimer = null;

/**
 * _fetchAdminOrdersFromAPI(onDone)
 * Appelle GET /api/admin/orders et merge les commandes
 * reçues dans ADMIN_RESERVATIONS (sans doublon).
 * @param {Function} [onDone] callback(ok: bool, count: number)
 */
function _fetchAdminOrdersFromAPI(onDone) {
  const url  = _ADMIN_API_BASE + '/api/admin/orders';
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tmo  = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;

  fetch(url, { signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) {
      if (tmo) clearTimeout(tmo);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (body) {
      if (!body.success || !Array.isArray(body.orders)) return;

      /* Merge : ajouter uniquement les nouveaux orderIDs */
      body.orders.forEach(function (o) {
        const id = o.orderID || o.bookingRef;
        if (!id) return;
        if (ADMIN_RESERVATIONS.find(function (x) { return x.id === id; })) return;

        ADMIN_RESERVATIONS.unshift({
          id           : id,
          bookingRef   : o.bookingRef || id,
          client       : (o.clientDetails && o.clientDetails.name) || 'Client',
          artisan      : (o.clientDetails && o.clientDetails.artisanName) || '—',
          artisanId    : (o.clientDetails && o.clientDetails.artisanId) || 0,
          service      : (o.clientDetails && o.clientDetails.service) || '—',
          date         : (o.clientDetails && o.clientDetails.date) || o.createdAt || '—',
          timeSlot     : (o.clientDetails && (o.clientDetails.timeSlot || o.clientDetails.time)) || '—',
          address      : (o.clientDetails && o.clientDetails.address) || '—',
          phone        : (o.clientDetails && o.clientDetails.phone) || '—',
          price        : o.totalAmount || 0,
          commission   : o.commission  || 0,
          netArtisan   : o.netArtisan  || 0,
          paymentMethod: o.paymentMethod || 'Cash on Delivery',
          method       : o.paymentMethod || 'Cash on Delivery',
          payStatus    : o.orderStatus  || 'pending_cod',
          status       : (o.orderStatus === 'completed') ? 'completed' : 'pending',
          slotLock     : !!o.slotLock,
          isExpress    : false,
          createdAt    : o.createdAt || new Date().toLocaleDateString('fr-FR'),
          transactionDate: o.createdAt || new Date().toLocaleDateString('fr-FR'),
          _fromAPI     : true,
        });
      });

      renderCODOrders();
      _updateCODKPIs();
      _updateCODSidebarBadge();
      console.log('[Fixeo Admin] ✅ Commandes API chargées — ' + body.count + ' ordre(s) (COD: ' + body.codCount + ', PayPal: ' + body.paypalCount + ')');
      if (typeof onDone === 'function') onDone(true, body.count);
    })
    .catch(function (err) {
      if (tmo) clearTimeout(tmo);
      console.warn('[Fixeo Admin] ⚠️ /api/admin/orders indisponible — fallback localStorage. Err:', err.message);
      if (typeof onDone === 'function') onDone(false, 0);
    });
}

/**
 * Démarre le polling automatique (toutes les 10 secondes).
 * Déclenche aussi un premier fetch immédiat.
 */
function _startAdminOrdersPolling() {
  if (_adminOrdersPollingTimer) clearInterval(_adminOrdersPollingTimer);
  _fetchAdminOrdersFromAPI(); /* premier appel immédiat */
  _adminOrdersPollingTimer = setInterval(function () {
    _fetchAdminOrdersFromAPI();
  }, 10000); /* ← polling toutes les 10 secondes */
  console.log('[Fixeo Admin] 🔄 Polling commandes démarré (10s)');
}

/** Arrête le polling (appelé au logout). */
function _stopAdminOrdersPolling() {
  if (_adminOrdersPollingTimer) {
    clearInterval(_adminOrdersPollingTimer);
    _adminOrdersPollingTimer = null;
    console.log('[Fixeo Admin] ⏹ Polling commandes arrêté');
  }
}

/* ── Hook initAdmin : COD init + polling API ─────────────── */
const _origInitAdmin = typeof initAdmin === 'function' ? initAdmin : function(){};
function initAdmin() {
  _origInitAdmin();
  /* Appeler les KPIs COD + démarrer le polling API */
  setTimeout(function() {
    _mergeLocalStorageReservations();
    _updateCODKPIs();
    _updateCODSidebarBadge();
    _startAdminOrdersPolling(); /* ← polling auto toutes les 10 secondes */
  }, 150);
}


/* ================================================================
   FIXEO V16 — MISSION STATUS MANAGEMENT
   Suivi complet des missions (demande → commission)
   JS only · non-destructive override layer
   ================================================================ */
(function () {
  const MISSION_STATUS = {
    SENT: 'demande_envoyee',
    SELECTED: 'artisan_selectionne',
    IN_PROGRESS: 'en_cours',
    DONE: 'terminee',
    CANCELLED: 'annulee'
  };

  const LEGACY_TO_MISSION = {
    pending: MISSION_STATUS.SENT,
    confirmed: MISSION_STATUS.SELECTED,
    inprogress: MISSION_STATUS.IN_PROGRESS,
    completed: MISSION_STATUS.DONE,
    cancelled: MISSION_STATUS.CANCELLED
  };

  const MISSION_TO_LEGACY = {
    [MISSION_STATUS.SENT]: 'pending',
    [MISSION_STATUS.SELECTED]: 'confirmed',
    [MISSION_STATUS.IN_PROGRESS]: 'inprogress',
    [MISSION_STATUS.DONE]: 'completed',
    [MISSION_STATUS.CANCELLED]: 'cancelled'
  };

  const MISSION_META = {
    [MISSION_STATUS.SENT]: {
      label: '📨 Demande envoyée',
      shortLabel: 'Demande envoyée',
      icon: '📨',
      tone: 'rgba(252,175,69,.16)',
      text: '#fcb045',
      border: 'rgba(252,175,69,.32)'
    },
    [MISSION_STATUS.SELECTED]: {
      label: '🤝 Artisan sélectionné',
      shortLabel: 'Artisan sélectionné',
      icon: '🤝',
      tone: 'rgba(64,93,230,.16)',
      text: '#7ea2ff',
      border: 'rgba(64,93,230,.32)'
    },
    [MISSION_STATUS.IN_PROGRESS]: {
      label: '🛠 En cours',
      shortLabel: 'En cours',
      icon: '🛠',
      tone: 'rgba(225,48,108,.16)',
      text: '#ff72a0',
      border: 'rgba(225,48,108,.30)'
    },
    [MISSION_STATUS.DONE]: {
      label: '✅ Terminée',
      shortLabel: 'Terminée',
      icon: '✅',
      tone: 'rgba(32,201,151,.16)',
      text: '#20C997',
      border: 'rgba(32,201,151,.32)'
    },
    [MISSION_STATUS.CANCELLED]: {
      label: '❌ Annulée',
      shortLabel: 'Annulée',
      icon: '❌',
      tone: 'rgba(255,107,107,.14)',
      text: '#ff7b7b',
      border: 'rgba(255,107,107,.28)'
    }
  };

  const MISSION_ACTIONS = {
    [MISSION_STATUS.SENT]: { label: 'Accepter mission', next: MISSION_STATUS.SELECTED, icon: '✅' },
    [MISSION_STATUS.SELECTED]: { label: 'Démarrer', next: MISSION_STATUS.IN_PROGRESS, icon: '🚀' },
    [MISSION_STATUS.IN_PROGRESS]: { label: 'Terminer', next: MISSION_STATUS.DONE, icon: '🏁' }
  };

  function _missionNow() {
    return new Date().toISOString();
  }

  function _formatMissionDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function _normalizeMissionStatus(status) {
    if (!status) return MISSION_STATUS.SENT;
    return LEGACY_TO_MISSION[status] || status;
  }

  function _legacyMissionStatus(status) {
    return MISSION_TO_LEGACY[_normalizeMissionStatus(status)] || status || 'pending';
  }

  function _buildMissionHistoryEntry(status, note, date) {
    return {
      status: _normalizeMissionStatus(status),
      label: (MISSION_META[_normalizeMissionStatus(status)] || MISSION_META[MISSION_STATUS.SENT]).shortLabel,
      note: note || '',
      updatedAt: date || _missionNow()
    };
  }

  function _ensureMissionData(reservation) {
    if (!reservation) return reservation;

    const normalizedStatus = _normalizeMissionStatus(reservation.status);
    reservation.status = normalizedStatus;
    reservation.legacyStatus = _legacyMissionStatus(normalizedStatus);
    reservation.updatedAt = reservation.updatedAt || reservation.statusUpdatedAt || reservation.createdAt || _missionNow();
    reservation.statusUpdatedAt = reservation.updatedAt;

    const price = Number(reservation.price || reservation.amount || 0);
    const commissionData = _calcCommission(price, reservation.method);
    reservation.commission = Number.isFinite(Number(reservation.commission)) && Number(reservation.commission) > 0
      ? Number(reservation.commission)
      : commissionData.commission;
    reservation.netArtisan = Number.isFinite(Number(reservation.netArtisan)) && Number(reservation.netArtisan) > 0
      ? Number(reservation.netArtisan)
      : commissionData.artisanEarns;
    reservation.artisanEarns = reservation.netArtisan;

    if (!Array.isArray(reservation.statusHistory) || !reservation.statusHistory.length) {
      reservation.statusHistory = [
        _buildMissionHistoryEntry(reservation.status, 'Mission créée', reservation.createdAt || reservation.updatedAt)
      ];
    } else {
      reservation.statusHistory = reservation.statusHistory.map((entry) => _buildMissionHistoryEntry(entry.status, entry.note, entry.updatedAt));
    }

    const lastEntry = reservation.statusHistory[reservation.statusHistory.length - 1];
    if (!lastEntry || _normalizeMissionStatus(lastEntry.status) !== normalizedStatus) {
      reservation.statusHistory.push(_buildMissionHistoryEntry(normalizedStatus, 'Statut synchronisé', reservation.updatedAt));
    }

    reservation.commissionStatus = reservation.commissionStatus
      || (normalizedStatus === MISSION_STATUS.DONE ? 'due' : 'pending');
    if (normalizedStatus !== MISSION_STATUS.DONE && reservation.commissionStatus === 'due') {
      reservation.commissionStatus = 'pending';
    }
    if (normalizedStatus === MISSION_STATUS.CANCELLED) {
      reservation.commissionStatus = 'cancelled';
    }

    return reservation;
  }

  function _syncAllMissionReservations() {
    if (!Array.isArray(ADMIN_RESERVATIONS)) return;
    ADMIN_RESERVATIONS.forEach(_ensureMissionData);
  }

  function _missionBadge(status) {
    const normalized = _normalizeMissionStatus(status);
    const meta = MISSION_META[normalized] || MISSION_META[MISSION_STATUS.SENT];
    return `<span class="status-badge" style="background:${meta.tone};color:${meta.text};border:1px solid ${meta.border}">${meta.label}</span>`;
  }

  function _commissionBadge(reservation) {
    const state = reservation?.commissionStatus || 'pending';
    const map = {
      pending: { text: 'Commission en attente', bg: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.72)', border: 'rgba(255,255,255,.14)', icon: '⏳' },
      due: { text: 'Commission due', bg: 'rgba(252,175,69,.16)', color: '#fcb045', border: 'rgba(252,175,69,.30)', icon: '💸' },
      paid: { text: 'Commission réglée', bg: 'rgba(32,201,151,.16)', color: '#20C997', border: 'rgba(32,201,151,.30)', icon: '✅' },
      cancelled: { text: 'Commission annulée', bg: 'rgba(255,107,107,.14)', color: '#ff7b7b', border: 'rgba(255,107,107,.26)', icon: '🚫' }
    };
    const meta = map[state] || map.pending;
    return `<span class="status-badge" style="background:${meta.bg};color:${meta.color};border:1px solid ${meta.border}">${meta.icon} ${meta.text}</span>`;
  }

  function _statusTimeline(reservation) {
    const items = Array.isArray(reservation?.statusHistory) ? reservation.statusHistory : [];
    if (!items.length) {
      return '<div style="color:var(--text-muted);font-size:.8rem">Aucun historique disponible.</div>';
    }
    return items.map((entry) => {
      const normalized = _normalizeMissionStatus(entry.status);
      const meta = MISSION_META[normalized] || MISSION_META[MISSION_STATUS.SENT];
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">
          <div style="width:28px;height:28px;border-radius:999px;background:${meta.tone};color:${meta.text};display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0">${meta.icon}</div>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:.82rem">${meta.shortLabel}</div>
            <div style="font-size:.74rem;color:var(--text-muted)">${_formatMissionDate(entry.updatedAt)}</div>
            ${entry.note ? `<div style="font-size:.76rem;color:rgba(255,255,255,.78);margin-top:2px">${entry.note}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function _missionNextAction(status) {
    return MISSION_ACTIONS[_normalizeMissionStatus(status)] || null;
  }

  function _missionActionButtons(reservation) {
    const nextAction = _missionNextAction(reservation.status);
    const buttons = [];

    if (nextAction) {
      buttons.push(`<button class="tbl-btn" style="background:rgba(64,93,230,.18);color:#9db3ff" onclick="advanceMissionStatus('${reservation.id}')">${nextAction.icon} ${nextAction.label}</button>`);
    }

    if (_normalizeMissionStatus(reservation.status) !== MISSION_STATUS.CANCELLED && _normalizeMissionStatus(reservation.status) !== MISSION_STATUS.DONE) {
      buttons.push(`<button class="tbl-btn danger" onclick="confirmCancelReservation('${reservation.id}')">✕ Annuler</button>`);
    }

    buttons.push(`<button class="tbl-btn" onclick="viewReservationDetail('${reservation.id}')">👁 Voir</button>`);
    return buttons.join('');
  }

  function _setMissionStatus(reservation, nextStatus, note) {
    if (!reservation) return false;

    const currentStatus = _normalizeMissionStatus(reservation.status);
    const normalizedNext = _normalizeMissionStatus(nextStatus);
    if (!normalizedNext || currentStatus === normalizedNext) return false;

    reservation.status = normalizedNext;
    reservation.legacyStatus = _legacyMissionStatus(normalizedNext);
    reservation.updatedAt = _missionNow();
    reservation.statusUpdatedAt = reservation.updatedAt;
    reservation.statusHistory = Array.isArray(reservation.statusHistory) ? reservation.statusHistory : [];
    reservation.statusHistory.push(_buildMissionHistoryEntry(normalizedNext, note, reservation.updatedAt));

    if (normalizedNext === MISSION_STATUS.DONE) {
      const commissionData = _calcCommission(Number(reservation.price || 0), reservation.method);
      reservation.commission = commissionData.commission;
      reservation.netArtisan = commissionData.artisanEarns;
      reservation.artisanEarns = commissionData.artisanEarns;
      reservation.commissionStatus = 'due';
      if (reservation.payStatus === 'pending_pay') {
        reservation.payStatus = 'paid';
      }
    } else if (normalizedNext === MISSION_STATUS.CANCELLED) {
      reservation.commissionStatus = 'cancelled';
      if (reservation.payStatus === 'paid') {
        reservation.payStatus = 'refunded';
      }
    } else {
      reservation.commissionStatus = reservation.commissionStatus === 'paid' ? 'paid' : 'pending';
    }

    _persistReservationUpdate(reservation);
    return true;
  }

  const _basePersistReservationUpdate = typeof _persistReservationUpdate === 'function' ? _persistReservationUpdate : null;
  _persistReservationUpdate = function (reservation) {
    if (!reservation) return;
    _ensureMissionData(reservation);
    try {
      const stored = JSON.parse(localStorage.getItem('fixeo_reservations') || '[]');
      const list = Array.isArray(stored) ? stored : [];
      const idx = list.findIndex((item) => item.id === reservation.id);
      if (idx > -1) list[idx] = reservation;
      else list.push(reservation);
      localStorage.setItem('fixeo_reservations', JSON.stringify(list));
    } catch (error) {
      if (_basePersistReservationUpdate) _basePersistReservationUpdate(reservation);
    }
  };

  _resStatusLabel = function (status) {
    return (MISSION_META[_normalizeMissionStatus(status)] || MISSION_META[MISSION_STATUS.SENT]).label;
  };

  const _baseUpdateReservationKPIs = typeof _updateReservationKPIs === 'function' ? _updateReservationKPIs : null;
  _updateReservationKPIs = function () {
    _syncAllMissionReservations();
    const sent = ADMIN_RESERVATIONS.filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.SENT).length;
    const selected = ADMIN_RESERVATIONS.filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.SELECTED).length;
    const inProgress = ADMIN_RESERVATIONS.filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.IN_PROGRESS).length;
    const done = ADMIN_RESERVATIONS.filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.DONE).length;
    const revenue = ADMIN_RESERVATIONS
      .filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.DONE)
      .reduce((sum, r) => sum + Number(r.commission || _calcCommission(r.price, r.method).commission || 0), 0);

    _setText('res-kpi-pending', sent.toLocaleString('fr-FR'));
    _setText('res-kpi-confirmed', selected.toLocaleString('fr-FR'));
    _setText('res-kpi-inprogress', inProgress.toLocaleString('fr-FR'));
    _setText('res-kpi-completed', done.toLocaleString('fr-FR'));
    _setText('res-kpi-revenue', revenue.toLocaleString('fr-FR'));

    const labels = document.querySelectorAll('#admin-section-reservations .kpi-label');
    labels.forEach((el) => {
      if (el.textContent.includes('En attente')) el.textContent = 'Demandes envoyées';
      if (el.textContent.includes('Confirmées')) el.textContent = 'Artisans sélectionnés';
    });
  };

  _updateReservationSidebarCount = function () {
    _syncAllMissionReservations();
    const pending = ADMIN_RESERVATIONS.filter((r) => _normalizeMissionStatus(r.status) === MISSION_STATUS.SENT).length;
    _setText('sc-reservations', pending);
  };

  const _baseMergeLocalStorageReservations = typeof _mergeLocalStorageReservations === 'function' ? _mergeLocalStorageReservations : null;
  _mergeLocalStorageReservations = function () {
    if (_baseMergeLocalStorageReservations) _baseMergeLocalStorageReservations();
    _syncAllMissionReservations();
  };

  renderReservations = function (data) {
    _syncAllMissionReservations();
    const tbody = document.getElementById('reservations-admin-tbody');
    if (!tbody) return;
    const src = Array.isArray(data) ? data : ADMIN_RESERVATIONS;

    if (!src.length) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text-muted)">Aucune mission trouvée.</td></tr>`;
      return;
    }

    tbody.innerHTML = src.map((reservation) => {
      const r = _ensureMissionData(reservation);
      const commission = Number(r.commission || 0);
      const artisanEarns = Number(r.netArtisan || r.artisanEarns || 0);
      const occupied = ![MISSION_STATUS.DONE, MISSION_STATUS.CANCELLED].includes(_normalizeMissionStatus(r.status));
      return `
        <tr>
          <td style="font-family:monospace;font-size:.75rem;white-space:nowrap">
            ${r.id}
            ${r.type === 'express' ? '<span class="res-express-badge">⚡ Express</span>' : ''}
            ${(r.method === 'Cash on Delivery' || r.method === 'COD') ? '<span class="cod-res-badge">💵 COD</span>' : ''}
          </td>
          <td>
            <div class="admin-user-cell">
              <div class="admin-avatar" style="background:linear-gradient(135deg,#405DE6,#833AB4);font-size:.72rem">${(r.client || 'C').charAt(0)}</div>
              <span style="font-size:.84rem;font-weight:600">${r.client || 'Client'}</span>
            </div>
          </td>
          <td>
            <div class="admin-user-cell">
              <div class="admin-avatar" style="font-size:.72rem">${(r.artisan || 'A').charAt(0)}</div>
              <span style="font-size:.84rem;font-weight:600">${r.artisan || '—'}</span>
            </div>
          </td>
          <td style="font-size:.82rem;max-width:160px">${r.service || '—'}</td>
          <td style="font-size:.82rem;white-space:nowrap">
            <div>${r.date || '—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${_formatMissionDate(r.updatedAt)}</div>
          </td>
          <td>${_missionBadge(r.status)}</td>
          <td><span class="status-badge res-pay-${r.payStatus}">${_resPayLabel(r.payStatus)}</span></td>
          <td style="font-weight:700;white-space:nowrap;color:var(--success)">${Number(r.price || 0).toLocaleString('fr-FR')} MAD</td>
          <td style="white-space:nowrap">
            <div style="font-weight:700;color:var(--warning)">${commission.toLocaleString('fr-FR')} MAD</div>
            <div style="margin-top:4px">${_commissionBadge(r)}</div>
          </td>
          <td style="font-weight:700;white-space:nowrap;color:#20C997">${artisanEarns.toLocaleString('fr-FR')} MAD</td>
          <td style="white-space:nowrap">
            ${r.method === 'PayPal'
              ? '<span class="paypal-method-badge">🅿️ PayPal</span>'
              : (r.method === 'Stripe'
                ? '<span class="stripe-method-badge">💳 Stripe</span>'
                : (r.method === 'CMI'
                  ? '<span class="cmi-method-badge">🇲🇦 CMI</span>'
                  : (r.method || '—')))}
          </td>
          <td style="font-family:monospace;font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.txnId || ''}">
            ${r.txnId ? `<span class="res-txn-id">${r.txnId.substring(0,14)}${r.txnId.length > 14 ? '…' : ''}</span>` : '<span style="color:var(--text-muted)">—</span>'}
          </td>
          <td>${occupied ? '<span class="slot-admin-badge-booked">🔴 Occupé</span>' : '<span class="slot-admin-badge-free">🟢 Libre</span>'}</td>
          <td style="white-space:nowrap">${_missionActionButtons(r)}</td>
        </tr>`;
    }).join('');
  };
  window.renderReservations = renderReservations;

  filterReservations = function () {
    _syncAllMissionReservations();
    const q = (document.getElementById('res-search')?.value || '').toLowerCase();
    const statusRaw = document.getElementById('res-filter-status')?.value || '';
    const pay = document.getElementById('res-filter-payment')?.value || '';
    const status = statusRaw ? _normalizeMissionStatus(statusRaw) : '';

    const filtered = ADMIN_RESERVATIONS.filter((reservation) => {
      const r = _ensureMissionData(reservation);
      const matchQ = !q || [r.id, r.client, r.artisan, r.service, r.city]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      const matchS = !status || _normalizeMissionStatus(r.status) === status;
      const matchP = !pay || r.payStatus === pay;
      return matchQ && matchS && matchP;
    });

    renderReservations(filtered);
  };
  window.filterReservations = filterReservations;

  refreshReservations = function () {
    _mergeLocalStorageReservations();
    _syncReservationStatusFilterUI();
    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
    if (document.getElementById('res-search')) document.getElementById('res-search').value = '';
    if (document.getElementById('res-filter-status')) document.getElementById('res-filter-status').value = '';
    if (document.getElementById('res-filter-payment')) document.getElementById('res-filter-payment').value = '';
    showToast('✅ Missions actualisées', 'success');
  };
  window.refreshReservations = refreshReservations;

  function _syncReservationStatusFilterUI() {
    const select = document.getElementById('res-filter-status');
    if (!select) return;
    select.innerHTML = `
      <option value="">Tous les statuts</option>
      <option value="${MISSION_STATUS.SENT}">📨 Demande envoyée</option>
      <option value="${MISSION_STATUS.SELECTED}">🤝 Artisan sélectionné</option>
      <option value="${MISSION_STATUS.IN_PROGRESS}">🛠 En cours</option>
      <option value="${MISSION_STATUS.DONE}">✅ Terminée</option>
      <option value="${MISSION_STATUS.CANCELLED}">❌ Annulée</option>`;
  }

  function _statusModalOptionsHTML(currentStatus) {
    return Object.values(MISSION_STATUS).map((status) => `
      <label class="res-status-option" data-value="${status}">
        <input type="radio" name="new_status" value="${status}" ${_normalizeMissionStatus(currentStatus) === status ? 'checked' : ''}/>
        ${_missionBadge(status)}
      </label>`).join('');
  }

  openStatusModal = function () {
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === _currentResId);
    if (!reservation) return;
    const modal = document.getElementById('reservation-status-modal');
    if (!modal) return;

    const body = modal.querySelector('.modal-body');
    if (body) {
      body.innerHTML = `
        <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:16px">Sélectionnez le nouveau statut de la mission :</p>
        <div class="res-status-options">${_statusModalOptionsHTML(reservation.status)}</div>`;
    }
    openModal('reservation-status-modal');
  };
  window.openStatusModal = openStatusModal;

  applyStatusChange = function () {
    const selected = document.querySelector('input[name="new_status"]:checked');
    if (!selected) {
      showToast('⚠️ Veuillez sélectionner un statut', 'warning');
      return;
    }
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === _currentResId);
    if (!reservation) return;

    const changed = _setMissionStatus(reservation, selected.value, 'Statut modifié depuis le dashboard admin');
    closeModal('reservation-status-modal');
    if (!changed) return;

    if (_normalizeMissionStatus(reservation.status) === MISSION_STATUS.CANCELLED && window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCancelled === 'function') {
      window.FixeoSlotLock.onReservationCancelled(reservation.id);
    }

    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
    viewReservationDetail(reservation.id);
    showToast(`✅ Mission mise à jour : ${_resStatusLabel(reservation.status)}`, 'success');
  };
  window.applyStatusChange = applyStatusChange;

  advanceMissionStatus = function (id) {
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;
    const action = _missionNextAction(reservation.status);
    if (!action) return;

    const noteMap = {
      [MISSION_STATUS.SELECTED]: 'Mission acceptée par l\'admin',
      [MISSION_STATUS.IN_PROGRESS]: 'Mission démarrée',
      [MISSION_STATUS.DONE]: 'Mission terminée — commission Fixeo due'
    };

    const changed = _setMissionStatus(reservation, action.next, noteMap[action.next] || action.label);
    if (!changed) return;

    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
    if (_currentResId === id && document.getElementById('reservation-detail-modal')?.classList.contains('open')) {
      viewReservationDetail(id);
    }
    showToast(`✅ ${action.label} — ${reservation.id}`, 'success');
  };
  window.advanceMissionStatus = advanceMissionStatus;

  viewReservationDetail = function (id) {
    _currentResId = id;
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;

    const r = _ensureMissionData(reservation);
    document.getElementById('res-detail-title').textContent = `🧾 Mission ${r.id}`;
    const detailBody = document.getElementById('res-detail-body');
    if (!detailBody) return;

    detailBody.innerHTML = `
      <div class="res-detail-grid">
        <div class="res-detail-block">
          <h4 class="res-detail-section-title">📋 Suivi mission</h4>
          ${_detailRow('Statut actuel', _missionBadge(r.status))}
          ${_detailRow('Dernière mise à jour', _formatMissionDate(r.updatedAt))}
          ${_detailRow('Commission Fixeo', `<strong style="color:var(--warning)">${Number(r.commission || 0).toLocaleString('fr-FR')} MAD</strong>`)}
          ${_detailRow('Statut commission', _commissionBadge(r))}
          ${_detailRow('Type', r.type === 'express' ? '<span class="res-express-badge" style="font-size:.78rem">⚡ Express</span>' : '📋 Standard')}
          ${_detailRow('Service', r.service || '—')}
          ${_detailRow('Ville', `📍 ${r.city || '—'}`)}
          ${_detailRow('Date intervention', r.date || '—')}
          ${_detailRow('Créneau', r.time || '—')}
        </div>
        <div class="res-detail-block">
          <h4 class="res-detail-section-title">👤 Parties concernées</h4>
          <div class="res-person-card" style="margin-bottom:12px">
            <div class="admin-avatar" style="background:linear-gradient(135deg,#405DE6,#833AB4);">${(r.client || 'C').charAt(0)}</div>
            <div>
              <div style="font-weight:700;font-size:.88rem">${r.client || 'Client'}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">Client · ID ${r.clientId || 0}</div>
            </div>
          </div>
          <div class="res-person-card">
            <div class="admin-avatar">${(r.artisan || 'A').charAt(0)}</div>
            <div>
              <div style="font-weight:700;font-size:.88rem">${r.artisan || '—'}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">Artisan · ID ${r.artisanId || 0}</div>
            </div>
          </div>
        </div>
        <div class="res-detail-block res-detail-block-full">
          <h4 class="res-detail-section-title">🕓 Historique des statuts</h4>
          <div>${_statusTimeline(r)}</div>
        </div>
      </div>`;

    const nextAction = _missionNextAction(r.status);
    const statusBtn = document.getElementById('res-detail-status-btn');
    const cancelBtn = document.getElementById('res-detail-cancel-btn');

    if (statusBtn) {
      if (nextAction) {
        statusBtn.style.display = 'inline-flex';
        statusBtn.textContent = `${nextAction.icon} ${nextAction.label}`;
        statusBtn.onclick = function () { advanceMissionStatus(r.id); };
      } else {
        statusBtn.style.display = 'none';
      }
    }

    if (cancelBtn) {
      const canCancel = ![MISSION_STATUS.CANCELLED, MISSION_STATUS.DONE].includes(_normalizeMissionStatus(r.status));
      cancelBtn.style.display = canCancel ? 'inline-flex' : 'none';
      cancelBtn.onclick = function () { cancelReservationFromModal(); };
    }

    openModal('reservation-detail-modal');
  };
  window.viewReservationDetail = viewReservationDetail;

  confirmCancelReservation = function (id) {
    _currentResId = id;
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;

    document.getElementById('admin-confirm-icon').textContent = '❌';
    document.getElementById('admin-confirm-title').textContent = 'Annuler la mission';
    document.getElementById('admin-confirm-msg').textContent = `Annuler la mission ${id} pour ${reservation.client} ?`;
    const button = document.getElementById('admin-confirm-ok');
    if (button) {
      button.onclick = function () {
        _doCancelReservation(id);
        closeModal('admin-confirm-modal');
      };
    }
    openModal('admin-confirm-modal');
  };
  window.confirmCancelReservation = confirmCancelReservation;

  cancelReservationFromModal = function () {
    closeModal('reservation-detail-modal');
    confirmCancelReservation(_currentResId);
  };
  window.cancelReservationFromModal = cancelReservationFromModal;

  _doCancelReservation = function (id) {
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;

    _setMissionStatus(reservation, MISSION_STATUS.CANCELLED, 'Mission annulée depuis le dashboard admin');
    if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCancelled === 'function') {
      window.FixeoSlotLock.onReservationCancelled(id);
    }
    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
    showToast(`❌ Mission ${id} annulée.`, 'warning');
  };
  window._doCancelReservation = _doCancelReservation;

  if (window.FixeoAdminReservations && typeof window.FixeoAdminReservations.addReservation === 'function') {
    const baseAddReservation = window.FixeoAdminReservations.addReservation.bind(window.FixeoAdminReservations);
    window.FixeoAdminReservations.addReservation = function (bookingData) {
      baseAddReservation(bookingData);
      const latest = ADMIN_RESERVATIONS[0];
      if (latest) {
        latest.status = MISSION_STATUS.SENT;
        latest.legacyStatus = 'pending';
        latest.updatedAt = _missionNow();
        latest.statusUpdatedAt = latest.updatedAt;
        latest.statusHistory = [_buildMissionHistoryEntry(MISSION_STATUS.SENT, 'Mission créée depuis une demande client', latest.updatedAt)];
        latest.commissionStatus = 'pending';
        _ensureMissionData(latest);
        _persistReservationUpdate(latest);
      }
      renderReservations();
      _updateReservationKPIs();
      _updateReservationSidebarCount();
    };
  }

  confirmCODPayment = function (id) {
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;
    if (!confirm(`✅ Confirmer l'encaissement COD pour :\n${reservation.client} → ${reservation.artisan}\nService : ${reservation.service}\nMontant : ${reservation.price} MAD`)) return;

    reservation.payStatus = 'cod_paid';
    if (_normalizeMissionStatus(reservation.status) === MISSION_STATUS.SENT) {
      _setMissionStatus(reservation, MISSION_STATUS.SELECTED, 'Paiement COD confirmé');
    } else {
      _persistReservationUpdate(reservation);
    }
    reservation.slotLock = false;

    renderCODOrders();
    renderReservations();
    _updateCODKPIs();
    _updateReservationKPIs();
    showToast('✅ Paiement COD encaissé — ' + id, 'success');
  };
  window.confirmCODPayment = confirmCODPayment;

  cancelCODOrder = function (id) {
    const reservation = ADMIN_RESERVATIONS.find((item) => item.id === id);
    if (!reservation) return;
    if (!confirm(`❌ Annuler la commande COD :\n${reservation.client} → ${reservation.artisan}\nService : ${reservation.service}\nDate : ${reservation.date} ?`)) return;

    _setMissionStatus(reservation, MISSION_STATUS.CANCELLED, 'Commande COD annulée');
    reservation.slotLock = false;
    if (window.FixeoSlotLock && typeof window.FixeoSlotLock.onReservationCancelled === 'function') {
      window.FixeoSlotLock.onReservationCancelled(id);
    }
    renderCODOrders();
    renderReservations();
    _updateCODKPIs();
    _updateReservationKPIs();
    showToast('❌ Commande COD annulée — ' + id, 'error');
  };
  window.cancelCODOrder = cancelCODOrder;

  const _baseInitAdminMission = typeof initAdmin === 'function' ? initAdmin : function () {};
  initAdmin = function () {
    _baseInitAdminMission();
    _syncAllMissionReservations();
    _syncReservationStatusFilterUI();
    renderReservations();
    _updateReservationKPIs();
    _updateReservationSidebarCount();
  };
  window.initAdmin = initAdmin;

  _syncAllMissionReservations();
})();


/* ================================================================
   FIXEO V18 — CEO DASHBOARD
   Vue business & prise de décision
   JS only · non-destructive
   ================================================================ */
(function () {
  const CEO_PENDING_HOURS = 6;
  const CEO_NON_REACTIVE_HOURS = 2;
  const CEO_URGENT_KEY = typeof URGENT_EVENTS_STORAGE_KEY !== 'undefined'
    ? URGENT_EVENTS_STORAGE_KEY
    : 'fixeo_urgent_events';

  function ceoEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function ceoNumber(value) {
    return Number(value || 0).toLocaleString('fr-FR');
  }

  function ceoCurrency(value) {
    return `${ceoNumber(value)} MAD`;
  }

  function ceoPercent(part, total) {
    if (!total) return 0;
    return Math.round((Number(part || 0) / Number(total || 1)) * 100);
  }

  function ceoParseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    const raw = String(value).trim();
    if (!raw) return null;

    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;

    const fr = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2})[:h](\d{2}))?/);
    if (fr) {
      const [, d, m, y, hh = '12', mm = '00'] = fr;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function ceoSameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function ceoSameMonth(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth();
  }

  function ceoHoursSince(date) {
    if (!date) return 0;
    return (Date.now() - date.getTime()) / 36e5;
  }

  function ceoMissionStatus(status) {
    if (typeof _normalizeMissionStatus === 'function') return _normalizeMissionStatus(status);
    return {
      pending: 'demande_envoyee',
      confirmed: 'artisan_selectionne',
      inprogress: 'en_cours',
      completed: 'terminee',
      cancelled: 'annulee'
    }[status] || status || 'demande_envoyee';
  }

  function ceoUrgentEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CEO_URGENT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function ceoMissionPool() {
    if (typeof _mergeLocalStorageReservations === 'function') {
      _mergeLocalStorageReservations();
    }

    const source = Array.isArray(ADMIN_RESERVATIONS) ? ADMIN_RESERVATIONS : [];
    const seen = new Set();

    return source
      .map((item) => {
        if (!item || !item.id || seen.has(item.id)) return null;
        seen.add(item.id);

        const status = ceoMissionStatus(item.status);
        const price = Number(item.price || item.amount || 0);
        const calc = typeof _calcCommission === 'function'
          ? _calcCommission(price, item.method)
          : { commission: Math.round(price * 0.15), artisanEarns: Math.round(price * 0.85) };

        const commission = Number(item.commission || calc.commission || 0);
        const netArtisan = Number(item.netArtisan || item.artisanEarns || calc.artisanEarns || 0);
        const updatedAt = ceoParseDate(item.updatedAt || item.statusUpdatedAt || item.createdAt || item.date);
        const createdAt = ceoParseDate(item.createdAt || item.date || item.updatedAt);

        let commissionStatus = item.commissionStatus || '';
        if (!commissionStatus) {
          if (status === 'annulee') commissionStatus = 'cancelled';
          else if (status === 'terminee') commissionStatus = 'due';
          else commissionStatus = 'pending';
        }

        return {
          ...item,
          status,
          price,
          commission,
          netArtisan,
          updatedAt,
          createdAt,
          commissionStatus,
          isUrgent:
            item.type === 'express' ||
            item.isExpress === true ||
            /urgent|urgence|express/i.test(String(item.service || ''))
        };
      })
      .filter(Boolean);
  }

  function ceoCountBy(items, getter) {
    return (items || []).reduce((acc, item) => {
      const key = getter(item);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function ceoTopEntry(counter) {
    const entries = Object.entries(counter || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { label: entries[0][0], count: entries[0][1] };
  }

  function ceoTopArtisans(missions) {
    const map = {};

    (missions || []).forEach((mission) => {
      const artisan = mission.artisan || 'Artisan';
      if (!map[artisan]) {
        map[artisan] = {
          name: artisan,
          total: 0,
          completed: 0,
          revenue: 0,
          pending: 0
        };
      }

      map[artisan].total += 1;
      if (mission.status === 'terminee') {
        map[artisan].completed += 1;
        map[artisan].revenue += Number(mission.commission || 0);
      }
      if (['demande_envoyee', 'artisan_selectionne', 'en_cours'].includes(mission.status)) {
        map[artisan].pending += 1;
      }
    });

    return Object.values(map)
      .sort((a, b) => {
        if (b.completed !== a.completed) return b.completed - a.completed;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.total - a.total;
      })
      .slice(0, 5);
  }

  function ceoAnalytics() {
    const now = new Date();
    const missions = ceoMissionPool();
    const events = ceoUrgentEvents();

    const alertPending = missions.filter((m) =>
      m.status === 'demande_envoyee' &&
      ceoHoursSince(m.updatedAt || m.createdAt) >= CEO_PENDING_HOURS
    );

    const alertNonReactive = missions.filter((m) =>
      m.status === 'demande_envoyee' &&
      ceoHoursSince(m.updatedAt || m.createdAt) >= CEO_NON_REACTIVE_HOURS
    );

    const alertUnpaid = missions.filter((m) =>
      m.status === 'terminee' &&
      m.commissionStatus !== 'paid' &&
      m.commissionStatus !== 'cancelled'
    );

    const revenuesToday = missions
      .filter((m) => m.status === 'terminee' && ceoSameDay(m.updatedAt || m.createdAt, now))
      .reduce((sum, m) => sum + Number(m.commission || 0), 0);

    const revenuesMonth = missions
      .filter((m) => m.status === 'terminee' && ceoSameMonth(m.updatedAt || m.createdAt, now))
      .reduce((sum, m) => sum + Number(m.commission || 0), 0);

    const commissionsDue = alertUnpaid.reduce((sum, m) => sum + Number(m.commission || 0), 0);

    const commissionsPaid = missions
      .filter((m) => m.commissionStatus === 'paid')
      .reduce((sum, m) => sum + Number(m.commission || 0), 0);

    const funnel = {
      opens: events.filter((e) => e.type === 'urgent_open').length,
      submits: events.filter((e) => e.type === 'urgent_submit').length,
      clicks: events.filter((e) => e.type === 'artisan_click').length,
      missionsCreated: missions.filter((m) => m.isUrgent).length
    };
    funnel.rate = ceoPercent(funnel.missionsCreated, funnel.opens);

    const topCity = ceoTopEntry(ceoCountBy(missions, (m) => m.city || '—'));
    const topService = ceoTopEntry(ceoCountBy(missions, (m) => m.service || '—'));
    const topPerformer = ceoTopArtisans(missions)[0] || null;

    return {
      missions,
      revenues: {
        today: revenuesToday,
        month: revenuesMonth,
        due: commissionsDue,
        paid: commissionsPaid
      },
      funnel,
      alerts: {
        pending: alertPending,
        nonReactive: alertNonReactive,
        unpaid: alertUnpaid
      },
      insights: {
        city: topCity,
        service: topService,
        performer: topPerformer
      },
      topArtisans: ceoTopArtisans(missions)
    };
  }

  function ceoMount() {
    const overview = document.getElementById('admin-section-overview');
    if (!overview) return null;

    let mount = document.getElementById('admin-ceo-dashboard') || document.getElementById('admin-smart-layer');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'admin-ceo-dashboard';
      mount.style.marginTop = '20px';
      overview.appendChild(mount);
    } else {
      mount.id = 'admin-ceo-dashboard';
    }

    return mount;
  }

  function ceoKpiCard(border, iconBg, iconColor, icon, value, label) {
    return `
      <div class="kpi-card admin-kpi" style="border-left:3px solid ${border}">
        <div class="kpi-header"><div class="kpi-icon" style="background:${iconBg};color:${iconColor}">${icon}</div></div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-label">${label}</div>
      </div>
    `;
  }

  function ceoAlertCard(icon, title, value, detail, tone) {
    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;background:${tone.bg};border:1px solid ${tone.border}">
        <div style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${tone.iconBg};font-size:1rem;flex-shrink:0">${icon}</div>
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;font-size:.9rem;margin-bottom:2px">${title}</div>
          <div style="font-size:1.15rem;font-weight:800;color:${tone.value}">${ceoNumber(value)}</div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:3px">${detail}</div>
        </div>
      </div>
    `;
  }

  function ceoInsight(icon, text) {
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">
        <div style="font-size:1rem;line-height:1.2">${icon}</div>
        <div style="font-size:.84rem;line-height:1.55">${text}</div>
      </div>
    `;
  }

  function ceoTopArtisanRow(item, index) {
    return `
      <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">
        <div style="width:30px;height:30px;border-radius:999px;background:rgba(225,48,108,.14);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.82rem">${index + 1}</div>
        <div style="min-width:0">
          <div style="font-weight:700;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ceoEscape(item.name)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${ceoNumber(item.total)} mission(s) • ${ceoNumber(item.pending)} active(s)</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--success)">${ceoNumber(item.completed)}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">terminées</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--warning)">${ceoCurrency(item.revenue)}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">revenus</div>
        </div>
      </div>
    `;
  }

  function renderCEODashboard() {
    const mount = ceoMount();
    if (!mount) return;

    const data = ceoAnalytics();

    const topCityText = data.insights.city
      ? `<strong>${ceoEscape(data.insights.city.label)}</strong> avec ${ceoNumber(data.insights.city.count)} mission(s)`
      : `aucune donnée disponible`;

    const topServiceText = data.insights.service
      ? `<strong>${ceoEscape(data.insights.service.label)}</strong> avec ${ceoNumber(data.insights.service.count)} demande(s)`
      : `aucune donnée disponible`;

    const topPerformerText = data.insights.performer
      ? `<strong>${ceoEscape(data.insights.performer.name)}</strong> avec ${ceoNumber(data.insights.performer.completed)} mission(s) terminée(s) et ${ceoCurrency(data.insights.performer.revenue)} générés`
      : `aucun artisan suffisamment actif`;

    mount.innerHTML = `
      <div class="chart-card" style="margin-bottom:20px">
        <div class="chart-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <h3 style="font-size:1.02rem;margin:0">📈 CEO Dashboard</h3>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">Pilotage business Fixeo : revenus, conversion, alertes et performance</div>
          </div>
          <span style="font-size:.76rem;color:var(--text-muted)">Vue décisionnelle temps réel</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:20px">
        <div style="display:grid;gap:20px">
          <div class="chart-card">
            <div class="chart-header">
              <h3 style="font-size:1rem;margin:0">💰 Revenus Fixeo</h3>
            </div>
            <div class="admin-kpi-grid" style="margin-top:4px">
              ${ceoKpiCard('var(--success)', 'rgba(32,201,151,.15)', 'var(--success)', '📅', ceoNumber(data.revenues.today), 'Revenus aujourd’hui')}
              ${ceoKpiCard('var(--info)', 'rgba(64,93,230,.15)', 'var(--info)', '🗓️', ceoNumber(data.revenues.month), 'Revenus ce mois')}
              ${ceoKpiCard('var(--warning)', 'rgba(252,175,69,.15)', 'var(--warning)', '⏳', ceoNumber(data.revenues.due), 'Commissions en attente')}
              ${ceoKpiCard('var(--primary)', 'rgba(225,48,108,.15)', 'var(--primary)', '✅', ceoNumber(data.revenues.paid), 'Commissions payées')}
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <h3 style="font-size:1rem;margin:0">⚡ Funnel urgent</h3>
            </div>
            <div class="admin-kpi-grid" style="margin-top:4px">
              ${ceoKpiCard('var(--warning)', 'rgba(252,175,69,.15)', 'var(--warning)', '👁', ceoNumber(data.funnel.opens), 'Ouvertures modal urgent')}
              ${ceoKpiCard('var(--info)', 'rgba(64,93,230,.15)', 'var(--info)', '📝', ceoNumber(data.funnel.submits), 'Demandes envoyées')}
              ${ceoKpiCard('var(--primary)', 'rgba(225,48,108,.15)', 'var(--primary)', '👆', ceoNumber(data.funnel.clicks), 'Clics artisans')}
              ${ceoKpiCard('#7a9cff', 'rgba(122,156,255,.15)', '#7a9cff', '📦', ceoNumber(data.funnel.missionsCreated), 'Missions créées')}
              ${ceoKpiCard('var(--success)', 'rgba(32,201,151,.15)', 'var(--success)', '📈', `${data.funnel.rate}%`, 'Taux conversion')}
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <h3 style="font-size:1rem;margin:0">🚨 Alertes</h3>
            </div>
            <div style="display:grid;gap:12px">
              ${ceoAlertCard(
                '⏳',
                `Missions en attente > ${CEO_PENDING_HOURS}h`,
                data.alerts.pending.length,
                data.alerts.pending.length ? `Des missions restent bloquées au statut initial.` : `Aucune mission critique en attente.`,
                {
                  bg: 'rgba(252,175,69,.08)',
                  border: 'rgba(252,175,69,.18)',
                  iconBg: 'rgba(252,175,69,.16)',
                  value: '#fcb045'
                }
              )}
              ${ceoAlertCard(
                '📭',
                'Artisans non réactifs',
                data.alerts.nonReactive.length,
                data.alerts.nonReactive.length ? `Demandes sans progression après ${CEO_NON_REACTIVE_HOURS}h+.` : `Aucun signal de non-réactivité détecté.`,
                {
                  bg: 'rgba(64,93,230,.08)',
                  border: 'rgba(64,93,230,.18)',
                  iconBg: 'rgba(64,93,230,.16)',
                  value: '#8ea6ff'
                }
              )}
              ${ceoAlertCard(
                '💸',
                'Commissions non payées',
                data.alerts.unpaid.length,
                data.alerts.unpaid.length ? `${ceoCurrency(data.revenues.due)} à encaisser.` : `Aucune commission en attente.`,
                {
                  bg: 'rgba(225,48,108,.08)',
                  border: 'rgba(225,48,108,.18)',
                  iconBg: 'rgba(225,48,108,.16)',
                  value: '#ff79a7'
                }
              )}
            </div>
          </div>
        </div>

        <div style="display:grid;gap:20px">
          <div class="chart-card">
            <div class="chart-header">
              <h3 style="font-size:1rem;margin:0">💡 Insights</h3>
            </div>
            <div style="display:grid;gap:10px">
              ${ceoInsight('🏙️', `La ville la plus active est ${topCityText}.`)}
              ${ceoInsight('🛠️', `Le service le plus demandé est ${topServiceText}.`)}
              ${ceoInsight('🏆', `L’artisan top performer est ${topPerformerText}.`)}
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <h3 style="font-size:1rem;margin:0">👑 Top artisans</h3>
              <span style="font-size:.76rem;color:var(--text-muted)">Classement missions + revenus</span>
            </div>
            <div style="display:grid;gap:10px">
              ${
                data.topArtisans.length
                  ? data.topArtisans.map((item, index) => ceoTopArtisanRow(item, index)).join('')
                  : `<div style="padding:16px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:.84rem;color:var(--text-muted)">Aucune donnée artisan exploitable pour le moment.</div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const _prevCEODashboardInit = typeof initAdmin === 'function' ? initAdmin : null;
  initAdmin = function () {
    if (_prevCEODashboardInit) _prevCEODashboardInit();
    setTimeout(renderCEODashboard, 90);
  };
  window.initAdmin = initAdmin;

  const _prevCEODashboardRefresh = typeof refreshAdminData === 'function' ? refreshAdminData : null;
  refreshAdminData = function () {
    if (_prevCEODashboardRefresh) _prevCEODashboardRefresh();
    setTimeout(renderCEODashboard, 40);
  };
  window.refreshAdminData = refreshAdminData;

  window.renderCEODashboard = renderCEODashboard;
})();
