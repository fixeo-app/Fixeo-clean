/* ============================================================
   FIXEO V21 — MODULE ARTISANS ADMIN — COMPLET
   ============================================================
   Fonctionnalités :
     • Charger artisans depuis /api/admin/artisans
     • Ajouter artisan via formulaire modal (FormData + upload image)
     • Modifier artisan via modal d'édition (upload avatar)
     • Activer / désactiver dynamiquement
     • Supprimer artisan avec confirmation
     • Affichage complet : avatar, ville, plan, note, missions, certifié
     • Vérification doublons email + téléphone
     • Rafraîchissement automatique après chaque action
     • Fallback localStorage si API indisponible
   ============================================================ */

'use strict';

/* ── Base URL ─────────────────────────────────────────────── */
const _ART_API_BASE = (function () {
  const h     = window.location.hostname;
  const proto = window.location.protocol;
  if (h.includes('ngrok') || h.includes('tunnel') || h.includes('loca.lt'))
    return window.location.origin;
  if (h === 'localhost' || h === '127.0.0.1')
    return proto + '//' + h + ':3001';
  return window.location.origin;
})();

/* ── Headers admin (sans Content-Type pour FormData) ──────── */
const _ART_HEADERS_JSON = {
  'Content-Type'  : 'application/json',
  'X-Admin-Auth'  : 'fixeo_admin_v20'
};
const _ART_HEADERS_FORM = {
  'X-Admin-Auth'  : 'fixeo_admin_v20'
};

/* ── Store local (fallback offline) ───────────────────────── */
const _LS_KEY = 'fixeo_admin_artisans_v21';

function _lsGet() {
  try { return JSON.parse(localStorage.getItem(_LS_KEY) || '[]'); } catch { return []; }
}
function _lsSave(arr) {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(arr)); } catch {}
}

/* ── Liste en mémoire ─────────────────────────────────────── */
let _artisansList = [];

/* ── Artisan en cours d'édition ───────────────────────────── */
let _currentEditId = null;
let _trustBindingsReady = false;

function _getTrustedArtisans(list) {
  const source = Array.isArray(list) ? list : _artisansList;
  if (!window.FixeoTrustScore?.sortArtisansByTrust) return source.slice();
  return window.FixeoTrustScore.sortArtisansByTrust(source);
}

/* ══════════════════════════════════════════════════════════════
   LOAD — Charger les artisans (API → fallback localStorage)
══════════════════════════════════════════════════════════════ */
async function loadArtisans() {
  try {
    const url  = _ART_API_BASE + '/api/admin/artisans';
    const ctrl = new AbortController();
    const tmo  = setTimeout(() => ctrl.abort(), 5000);

    const res  = await fetch(url, { headers: _ART_HEADERS_JSON, signal: ctrl.signal });
    clearTimeout(tmo);

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();

    if (body.success && Array.isArray(body.artisans)) {
      _artisansList = body.artisans;
      _lsSave(_artisansList);
      console.log('[Fixeo Artisans] ✅ Chargés depuis API :', _artisansList.length);
    }
  } catch (err) {
    console.warn('[Fixeo Artisans] ⚠️ API indisponible — fallback localStorage. Err:', err.message);
    _artisansList = _lsGet();
  }

  renderArtisansAdminTable(_artisansList);
  _updateArtisansSidebarCount();
  _updateArtisansKPIs(_artisansList);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — Table artisans admin (colonnes enrichies V21)
══════════════════════════════════════════════════════════════ */
function renderArtisansAdminTable(data) {
  const tbody = document.getElementById('artisans-admin-tbody');
  if (!tbody) return;

  const trustedData = _getTrustedArtisans(data);
  if (!trustedData || trustedData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">
          <div style="font-size:2rem;margin-bottom:8px">👷</div>
          <div>Aucun artisan enregistré pour l'instant.</div>
          <div style="font-size:.8rem;margin-top:6px">Utilisez le formulaire ci-dessus pour ajouter votre premier artisan.</div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = trustedData.map(a => {
    const initials   = (a.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarHtml = a.avatar
      ? `<img src="${_esc(a.avatar)}" alt="${_esc(a.name)}"
              style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.15)"
              onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
      : '';
    const avatarFallback = `<div class="admin-avatar" style="display:${a.avatar ? 'none' : 'flex'}">${initials}</div>`;

    /* Badge certifié */
    const certified = (a.certified === true || a.certified === 'true' || a.certified === 'yes')
      ? `<span title="Artisan certifié" style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:.62rem;font-weight:700;
              background:linear-gradient(135deg,#ffd700,#ff8c00);
              color:#000;padding:2px 7px;border-radius:20px;margin-left:5px">
              ✅ Certifié</span>`
      : `<span style="font-size:.62rem;color:var(--text-muted);margin-left:5px">—</span>`;

    /* Badge statut */
    const statusBadge = a.status === 'active'
      ? `<span class="status-badge status-active">🟢 Actif</span>`
      : `<span class="status-badge" style="background:rgba(255,100,100,.15);color:#ff6464;border:1px solid rgba(255,100,100,.3)">🔴 Inactif</span>`;

    /* Badge plan abonnement */
    const planColors = {
      premium : { bg:'rgba(252,175,69,.15)', color:'#fcaf45', border:'rgba(252,175,69,.3)', label:'👑 Premium' },
      pro     : { bg:'rgba(225,48,108,.15)', color:'var(--primary)', border:'rgba(225,48,108,.3)', label:'🚀 Pro' },
      free    : { bg:'rgba(255,255,255,.07)', color:'rgba(255,255,255,.5)', border:'rgba(255,255,255,.15)', label:'🆓 Gratuit' }
    };
    const planKey   = (a.subscriptionPlan || a.plan || 'free').toLowerCase();
    const planStyle = planColors[planKey] || planColors.free;
    const planBadge = `<span style="
      display:inline-block;padding:2px 9px;border-radius:20px;font-size:.68rem;font-weight:700;
      background:${planStyle.bg};color:${planStyle.color};border:1px solid ${planStyle.border}">
      ${planStyle.label}</span>`;

    /* Note ⭐ */
    const ratingValue = Number(a.average_rating ?? a.rating ?? 0);
    const reviewsCount = Number(a.total_reviews ?? a.reviewCount ?? 0);
    const rating = (reviewsCount > 0 && Number.isFinite(ratingValue) && ratingValue > 0)
      ? `<div style="display:grid;gap:3px"><span style="color:#ffd700;font-weight:700">⭐ ${ratingValue.toFixed(1)} / 5</span><span style="color:var(--text-muted);font-size:.72rem">${reviewsCount} avis</span></div>`
      : `<span style="color:var(--text-muted);font-size:.8rem">—</span>`;

    /* Missions & Trust */
    const trustScore = Math.max(0, Math.min(100, Math.round(Number(a.trust_score || a.trustScore || 0))));
    const trustLevel = a.trust_level || a.trustLevel || 'Nouveau';
    const trustTheme = window.FixeoTrustScore?.getTrustLevelTheme?.(trustLevel) || { color:'var(--text-muted)', bg:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.14)' };
    const missionsValidated = Number(a.missions_validated ?? a.missions ?? 0);
    const missions = `<div style="display:grid;gap:4px"><span style="font-weight:700">${missionsValidated}</span><span style="display:inline-flex;align-items:center;gap:6px;width:max-content;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:800;color:${trustTheme.color};background:${trustTheme.bg};border:1px solid ${trustTheme.border}">🛡️ ${trustScore} · ${_esc(trustLevel)}</span></div>`;

    /* Ville */
    const city = a.city ? `📍 ${_esc(a.city)}` : `<span style="color:var(--text-muted)">—</span>`;

    /* Boutons toggle */
    const toggleBtn = a.status === 'active'
      ? `<button class="tbl-btn danger" onclick="toggleArtisanStatus('${a.id}','inactive')" title="Désactiver">🚫</button>`
      : `<button class="tbl-btn success" onclick="toggleArtisanStatus('${a.id}','active')" title="Activer">✅</button>`;

    const date = a.createdAt
      ? new Date(a.createdAt).toLocaleDateString('fr-FR')
      : '—';

    return `
      <tr id="artisan-row-${a.id}">
        <td>
          <div class="admin-user-cell">
            ${avatarHtml}${avatarFallback}
            <div>
              <div class="admin-user-name">${_esc(a.name)}</div>
              <div class="admin-user-sub" style="font-size:.72rem">${_esc(a.email || '—')}</div>
            </div>
          </div>
        </td>
        <td style="font-size:.82rem">${_esc(a.service || '—')}</td>
        <td style="font-size:.82rem">${_esc(a.phone || '—')}</td>
        <td style="font-size:.82rem">${city}</td>
        <td>${planBadge}</td>
        <td>${rating}</td>
        <td style="text-align:center">${missions}</td>
        <td>${statusBadge}</td>
        <td style="text-align:center">${certified}</td>
        <td style="white-space:nowrap">
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
            <button class="tbl-btn" onclick="openEditArtisanModal('${a.id}')" title="Modifier">✏️ Modifier</button>
            ${toggleBtn}
            <button class="tbl-btn danger" onclick="deleteArtisanConfirm('${a.id}','${_esc(a.name)}')" title="Supprimer">🗑</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   TOGGLE STATUS — Activer / Désactiver
══════════════════════════════════════════════════════════════ */
async function toggleArtisanStatus(id, newStatus) {
  try {
    const url = _ART_API_BASE + `/api/admin/artisans/${encodeURIComponent(id)}/status`;
    const res = await fetch(url, {
      method : 'PUT',
      headers: _ART_HEADERS_JSON,
      body   : JSON.stringify({ status: newStatus })
    });
    const body = await res.json();

    if (body.success) {
      const idx = _artisansList.findIndex(a => a.id === id);
      if (idx !== -1) { _artisansList[idx].status = newStatus; _lsSave(_artisansList); }

      renderArtisansAdminTable(_artisansList);
      _updateArtisansSidebarCount();
      _updateArtisansKPIs(_artisansList);

      const label = newStatus === 'active' ? '✅ Artisan activé' : '🚫 Artisan désactivé';
      if (typeof showToast === 'function') showToast(label, newStatus === 'active' ? 'success' : 'info');
    } else {
      if (typeof showToast === 'function') showToast('❌ Erreur : ' + (body.error || 'Statut non mis à jour'), 'error');
    }
  } catch (err) {
    console.warn('[Fixeo Artisans] ⚠️ API indisponible — mise à jour locale. Err:', err.message);
    const idx = _artisansList.findIndex(a => a.id === id);
    if (idx !== -1) { _artisansList[idx].status = newStatus; _lsSave(_artisansList); }
    renderArtisansAdminTable(_artisansList);
    _updateArtisansSidebarCount();
    if (typeof showToast === 'function') showToast('⚠️ Mis à jour en local (API hors ligne)', 'warning');
  }
}

/* ══════════════════════════════════════════════════════════════
   DELETE — Supprimer artisan
══════════════════════════════════════════════════════════════ */
function deleteArtisanConfirm(id, name) {
  const icon  = document.getElementById('admin-confirm-icon');
  const title = document.getElementById('admin-confirm-title');
  const msg   = document.getElementById('admin-confirm-msg');
  const okBtn = document.getElementById('admin-confirm-ok');

  if (icon)  icon.textContent  = '🗑️';
  if (title) title.textContent = 'Supprimer l\'artisan ?';
  if (msg)   msg.innerHTML     = `Voulez-vous vraiment supprimer <strong>${_esc(name)}</strong> ? Cette action est irréversible.`;
  if (okBtn) {
    okBtn.textContent = '🗑 Supprimer';
    okBtn.onclick = async () => {
      if (typeof closeModal === 'function') closeModal('admin-confirm-modal');
      await _deleteArtisan(id);
    };
  }
  if (typeof openModal === 'function') openModal('admin-confirm-modal');
  else if (confirm(`Supprimer l'artisan "${name}" ?`)) _deleteArtisan(id);
}

async function _deleteArtisan(id) {
  try {
    const url = _ART_API_BASE + `/api/admin/artisans/${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: 'DELETE', headers: _ART_HEADERS_JSON });
    const body = await res.json();

    if (body.success) {
      _artisansList = _artisansList.filter(a => a.id !== id);
      _lsSave(_artisansList);
      renderArtisansAdminTable(_artisansList);
      _updateArtisansSidebarCount();
      _updateArtisansKPIs(_artisansList);
      if (typeof showToast === 'function') showToast('🗑 Artisan supprimé', 'success');
    } else {
      if (typeof showToast === 'function') showToast('❌ Erreur : ' + (body.error || 'Suppression impossible'), 'error');
    }
  } catch (err) {
    console.warn('[Fixeo Artisans] ⚠️ API indisponible — suppression locale. Err:', err.message);
    _artisansList = _artisansList.filter(a => a.id !== id);
    _lsSave(_artisansList);
    renderArtisansAdminTable(_artisansList);
    _updateArtisansSidebarCount();
    if (typeof showToast === 'function') showToast('⚠️ Supprimé en local (API hors ligne)', 'warning');
  }
}

/* ══════════════════════════════════════════════════════════════
   ADD ARTISAN — Soumission formulaire (FormData + upload image)
══════════════════════════════════════════════════════════════ */
async function submitArtisanForm(e) {
  e && e.preventDefault();

  const btn       = document.getElementById('artisan-form-submit-btn');
  const errEl     = document.getElementById('artisan-form-error');
  const successEl = document.getElementById('artisan-form-success');

  if (errEl)     { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (successEl) { successEl.style.display = 'none'; }
  if (btn)       { btn.disabled = true; btn.innerHTML = '⏳ Ajout en cours…'; }

  /* Récupération des champs */
  const name        = (document.getElementById('af-name')?.value        || '').trim();
  const email       = (document.getElementById('af-email')?.value       || '').trim();
  const phone       = (document.getElementById('af-phone')?.value       || '').trim();
  const service     = (document.getElementById('af-service')?.value     || '').trim();
  const city        = (document.getElementById('af-city')?.value        || '').trim();
  const zones       = (document.getElementById('af-zones')?.value       || '').trim();
  const subPlan     = document.getElementById('af-subplan')?.value      || 'free';
  const status      = document.getElementById('af-status')?.value       || 'active';
  const certified   = document.getElementById('af-certified')?.checked  || false;
  const description = (document.getElementById('af-description')?.value || '').trim();
  const avatarFile  = document.getElementById('af-avatar-file')?.files[0] || null;

  /* ── Validation front ── */
  if (!name)    { _artFormError(errEl, btn, '⚠️ Le nom est requis.'); return; }
  if (!phone)   { _artFormError(errEl, btn, '⚠️ Le téléphone est requis.'); return; }
  if (!service) { _artFormError(errEl, btn, '⚠️ La spécialité est requise.'); return; }
  if (email && !/\S+@\S+\.\S+/.test(email)) { _artFormError(errEl, btn, '⚠️ Email invalide.'); return; }

  /* ── Vérification doublons locaux ── */
  const dupEmail = email && _artisansList.find(a => a.email && a.email.toLowerCase() === email.toLowerCase());
  if (dupEmail) { _artFormError(errEl, btn, `❌ Un artisan avec l'email "${email}" existe déjà.`); return; }

  const dupPhone = _artisansList.find(a => a.phone && a.phone.replace(/\s/g,'') === phone.replace(/\s/g,''));
  if (dupPhone) { _artFormError(errEl, btn, `❌ Un artisan avec le téléphone "${phone}" existe déjà.`); return; }

  /* ── Build FormData ── */
  const formData = new FormData();
  formData.append('name',            name);
  formData.append('email',           email || '');
  formData.append('phone',           phone);
  formData.append('service',         service);
  formData.append('city',            city);
  formData.append('zones',           zones);
  formData.append('subscriptionPlan', subPlan);
  formData.append('status',          status);
  formData.append('certified',       certified ? 'true' : 'false');
  formData.append('description',     description);
  if (avatarFile) formData.append('avatar', avatarFile);

  try {
    const url = _ART_API_BASE + '/api/admin/artisans/add';
    const res = await fetch(url, {
      method : 'POST',
      headers: _ART_HEADERS_FORM,
      body   : formData
    });
    const body = await res.json();

    if (body.success && body.artisan) {
      _artisansList.unshift(body.artisan);
      _lsSave(_artisansList);

      /* Reset & fermer le formulaire */
      document.getElementById('artisan-add-form')?.reset();
      _closeArtisanFormPanel();

      renderArtisansAdminTable(_artisansList);
      _updateArtisansSidebarCount();
      _updateArtisansKPIs(_artisansList);

      if (typeof showToast === 'function')
        showToast(`✅ Artisan "${body.artisan.name}" ajouté avec succès !`, 'success');

      console.log('[Fixeo Artisans] ✅ Artisan ajouté :', body.artisan.id);
    } else {
      _artFormError(errEl, btn, '❌ ' + (body.error || 'Erreur lors de l\'ajout.'));
    }
  } catch (err) {
    /* Fallback local */
    console.warn('[Fixeo Artisans] ⚠️ API indisponible — ajout local. Err:', err.message);
    const newArtisan = {
      id              : 'art_local_' + Date.now(),
      name, email, phone, service, city, zones,
      subscriptionPlan: subPlan,
      status, certified,
      description,
      avatar          : '',
      rating          : 0,
      missions        : 0,
      role            : 'artisan',
      createdAt       : new Date().toISOString(),
      _isLocal        : true,
    };
    _artisansList.unshift(newArtisan);
    _lsSave(_artisansList);

    document.getElementById('artisan-add-form')?.reset();
    _closeArtisanFormPanel();

    renderArtisansAdminTable(_artisansList);
    _updateArtisansSidebarCount();
    _updateArtisansKPIs(_artisansList);
    if (typeof showToast === 'function')
      showToast('⚠️ Artisan ajouté en local (API hors ligne)', 'warning');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '➕ Ajouter l\'artisan'; }
}

/* ══════════════════════════════════════════════════════════════
   EDIT ARTISAN — Ouvrir / Fermer le modal d'édition
══════════════════════════════════════════════════════════════ */
function closeEditArtisanModal() {
  const modal = document.getElementById('edit-artisan-modal');
  if (!modal) return;

  if (typeof closeModal === 'function') {
    closeModal('edit-artisan-modal');
  } else {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
  }
}

function openEditArtisanModal(id) {
  const a = _artisansList.find(x => x.id === id);
  if (!a) {
    if (typeof showToast === 'function') showToast('❌ Artisan introuvable', 'error');
    return;
  }
  _currentEditId = id;

  /* Remplir les champs du modal d'édition */
  const f = id => document.getElementById(id);
  if (f('ef-name'))        f('ef-name').value        = a.name        || '';
  if (f('ef-email'))       f('ef-email').value       = a.email       || '';
  if (f('ef-phone'))       f('ef-phone').value       = a.phone       || '';
  if (f('ef-service'))     f('ef-service').value     = a.service     || '';
  if (f('ef-city'))        f('ef-city').value        = a.city        || '';
  if (f('ef-zones'))       f('ef-zones').value       = a.zones       || '';
  if (f('ef-subplan'))     f('ef-subplan').value     = a.subscriptionPlan || a.plan || 'free';
  if (f('ef-status'))      f('ef-status').value      = a.status      || 'active';
  if (f('ef-certified'))   f('ef-certified').checked = (a.certified === true || a.certified === 'true' || a.certified === 'yes');
  if (f('ef-description')) f('ef-description').value = a.description || '';
  if (f('ef-rating'))      f('ef-rating').value      = a.rating      || 0;
  if (f('ef-missions'))    f('ef-missions').value    = a.missions    || 0;

  /* Aperçu avatar actuel */
  const prevDiv = document.getElementById('ef-avatar-preview');
  if (prevDiv) {
    if (a.avatar) {
      prevDiv.innerHTML = `<img src="${_esc(a.avatar)}" alt="Avatar actuel" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2)">
        <span style="font-size:.75rem;color:var(--text-muted);margin-left:10px">Avatar actuel</span>`;
    } else {
      const initials = (a.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      prevDiv.innerHTML = `<div class="admin-avatar" style="flex-shrink:0">${initials}</div>
        <span style="font-size:.75rem;color:var(--text-muted);margin-left:10px">Aucun avatar</span>`;
    }
  }

  /* Reset erreur + champ fichier */
  const errEl = document.getElementById('edit-artisan-form-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (f('ef-avatar-file')) f('ef-avatar-file').value = '';

  /* Titre modal */
  const title = document.getElementById('edit-artisan-modal-title');
  if (title) title.textContent = `✏️ Modifier — ${a.name}`;

  const modal = document.getElementById('edit-artisan-modal');
  if (!modal) return;

  const dialog = modal.querySelector('.modal-dialog');
  const body = modal.querySelector('.modal-body');

  if (modal.dataset.editArtisanBound !== 'true') {
    modal.dataset.editArtisanBound = 'true';

    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeEditArtisanModal();
    });

    modal.querySelectorAll('.modal-close, .modal-footer .btn.btn-secondary').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        closeEditArtisanModal();
      });
    });
  }

  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.padding = '16px';
  modal.style.background = 'rgba(0,0,0,.65)';
  modal.style.overflowY = 'auto';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  if (dialog) {
    dialog.style.position = 'relative';
    dialog.style.margin = 'auto';
    dialog.style.maxHeight = 'calc(100vh - 48px)';
    dialog.style.overflow = 'hidden';
    dialog.scrollTop = 0;
  }

  if (body) {
    body.style.overflowY = 'auto';
    body.scrollTop = 0;
  }
}

window.openEditArtisanModal = openEditArtisanModal;
window.closeEditArtisanModal = closeEditArtisanModal;

/* ══════════════════════════════════════════════════════════════
   EDIT ARTISAN — Soumettre le formulaire de modification
══════════════════════════════════════════════════════════════ */
async function submitEditArtisanForm(e) {
  e && e.preventDefault();
  if (!_currentEditId) return;

  const btn   = document.getElementById('edit-artisan-submit-btn');
  const errEl = document.getElementById('edit-artisan-form-error');

  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (btn)   { btn.disabled = true; btn.innerHTML = '⏳ Mise à jour…'; }

  const f = id => document.getElementById(id);

  const name        = (f('ef-name')?.value        || '').trim();
  const email       = (f('ef-email')?.value       || '').trim();
  const phone       = (f('ef-phone')?.value       || '').trim();
  const service     = (f('ef-service')?.value     || '').trim();
  const city        = (f('ef-city')?.value        || '').trim();
  const zones       = (f('ef-zones')?.value       || '').trim();
  const subPlan     = f('ef-subplan')?.value      || 'free';
  const status      = f('ef-status')?.value       || 'active';
  const certified   = f('ef-certified')?.checked  || false;
  const description = (f('ef-description')?.value || '').trim();
  const rating      = parseFloat(f('ef-rating')?.value  || 0);
  const missions    = parseInt(f('ef-missions')?.value   || 0, 10);
  const avatarFile  = f('ef-avatar-file')?.files[0] || null;

  /* Validation */
  if (!name)    { _editFormError(errEl, btn, '⚠️ Le nom est requis.'); return; }
  if (!phone)   { _editFormError(errEl, btn, '⚠️ Le téléphone est requis.'); return; }
  if (!service) { _editFormError(errEl, btn, '⚠️ La spécialité est requise.'); return; }
  if (email && !/\S+@\S+\.\S+/.test(email)) { _editFormError(errEl, btn, '⚠️ Email invalide.'); return; }

  /* Vérif doublons (on exclut l'artisan en cours d'édition) */
  const dupEmail = email && _artisansList.find(a => a.id !== _currentEditId && a.email && a.email.toLowerCase() === email.toLowerCase());
  if (dupEmail) { _editFormError(errEl, btn, `❌ L'email "${email}" est déjà utilisé par un autre artisan.`); return; }

  const dupPhone = _artisansList.find(a => a.id !== _currentEditId && a.phone && a.phone.replace(/\s/g,'') === phone.replace(/\s/g,''));
  if (dupPhone) { _editFormError(errEl, btn, `❌ Le téléphone "${phone}" est déjà utilisé par un autre artisan.`); return; }

  /* Build FormData */
  const formData = new FormData();
  formData.append('name',            name);
  formData.append('email',           email || '');
  formData.append('phone',           phone);
  formData.append('service',         service);
  formData.append('city',            city);
  formData.append('zones',           zones);
  formData.append('subscriptionPlan', subPlan);
  formData.append('status',          status);
  formData.append('certified',       certified ? 'true' : 'false');
  formData.append('description',     description);
  formData.append('rating',          isNaN(rating) ? 0 : rating);
  formData.append('missions',        isNaN(missions) ? 0 : missions);
  if (avatarFile) formData.append('avatar', avatarFile);

  try {
    const url = _ART_API_BASE + `/api/admin/artisans/${encodeURIComponent(_currentEditId)}`;
    const res = await fetch(url, {
      method : 'PUT',
      headers: _ART_HEADERS_FORM,
      body   : formData
    });
    const body = await res.json();

    if (body.success && body.artisan) {
      const idx = _artisansList.findIndex(a => a.id === _currentEditId);
      if (idx !== -1) { _artisansList[idx] = { ..._artisansList[idx], ...body.artisan }; }
      _lsSave(_artisansList);

      renderArtisansAdminTable(_artisansList);
      _updateArtisansSidebarCount();
      _updateArtisansKPIs(_artisansList);

      if (typeof closeModal === 'function') closeModal('edit-artisan-modal');
      if (typeof showToast === 'function')
        showToast(`✅ Artisan "${name}" mis à jour !`, 'success');

      console.log('[Fixeo Artisans] ✅ Artisan mis à jour :', _currentEditId);
    } else {
      _editFormError(errEl, btn, '❌ ' + (body.error || 'Erreur lors de la mise à jour.'));
    }
  } catch (err) {
    /* Fallback local */
    console.warn('[Fixeo Artisans] ⚠️ API indisponible — mise à jour locale. Err:', err.message);
    const idx = _artisansList.findIndex(a => a.id === _currentEditId);
    if (idx !== -1) {
      _artisansList[idx] = {
        ..._artisansList[idx],
        name, email, phone, service, city, zones,
        subscriptionPlan: subPlan,
        status, certified, description, rating, missions
      };
    }
    _lsSave(_artisansList);
    renderArtisansAdminTable(_artisansList);
    _updateArtisansSidebarCount();
    _updateArtisansKPIs(_artisansList);

    if (typeof closeModal === 'function') closeModal('edit-artisan-modal');
    if (typeof showToast === 'function')
      showToast('⚠️ Mis à jour en local (API hors ligne)', 'warning');
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '💾 Enregistrer'; }
}

/* ── Helpers ──────────────────────────────────────────────── */
function _artFormError(errEl, btn, msg) {
  if (errEl) { errEl.style.display = 'block'; errEl.textContent = msg; }
  if (btn)   { btn.disabled = false; btn.innerHTML = '➕ Ajouter l\'artisan'; }
}
function _editFormError(errEl, btn, msg) {
  if (errEl) { errEl.style.display = 'block'; errEl.textContent = msg; }
  if (btn)   { btn.disabled = false; btn.innerHTML = '💾 Enregistrer'; }
}

function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _closeArtisanFormPanel() {
  const formPanel = document.getElementById('artisan-form-panel');
  if (formPanel) formPanel.style.display = 'none';
  const toggleBtn = document.getElementById('artisan-form-toggle-btn');
  if (toggleBtn) toggleBtn.innerHTML = '➕ Ajouter un artisan';
}

function _updateArtisansSidebarCount() {
  const active = _artisansList.filter(a => a.status === 'active').length;
  const badge  = document.getElementById('sc-artisans');
  const kpiEl  = document.getElementById('kpi-artisans');
  if (badge) badge.textContent = active;
  if (kpiEl) kpiEl.textContent = active;
  const sidebarArt = document.querySelector('.sidebar-link[onclick*="artisans"] .sidebar-count');
  if (sidebarArt) sidebarArt.textContent = active;
}

/* ══════════════════════════════════════════════════════════════
   KPIs artisans
══════════════════════════════════════════════════════════════ */
function _updateArtisansKPIs(list) {
  list = list || _artisansList;
  const total     = list.length;
  const active    = list.filter(a => a.status === 'active').length;
  const inactive  = list.filter(a => a.status !== 'active').length;
  const certified = list.filter(a => a.certified === true || a.certified === 'true' || a.certified === 'yes').length;

  const el = id => document.getElementById(id);
  if (el('art-kpi-total'))     el('art-kpi-total').textContent    = total;
  if (el('art-kpi-active'))    el('art-kpi-active').textContent   = active;
  if (el('art-kpi-inactive'))  el('art-kpi-inactive').textContent = inactive;
  if (el('art-kpi-certified')) el('art-kpi-certified').textContent = certified;
}

/* ══════════════════════════════════════════════════════════════
   FILTRES
══════════════════════════════════════════════════════════════ */
function filterAdminArtisansV20(query) {
  const q = (query || '').toLowerCase();
  const filtered = _artisansList.filter(a =>
    (a.name    || '').toLowerCase().includes(q) ||
    (a.service || '').toLowerCase().includes(q) ||
    (a.email   || '').toLowerCase().includes(q) ||
    (a.phone   || '').includes(q) ||
    (a.city    || '').toLowerCase().includes(q)
  );
  renderArtisansAdminTable(filtered);
}

function filterAdminArtisansByStatusV20(status) {
  const filtered = status ? _artisansList.filter(a => a.status === status) : _artisansList;
  renderArtisansAdminTable(filtered);
}

/* ══════════════════════════════════════════════════════════════
   TOGGLE FORM PANEL (accordéon)
══════════════════════════════════════════════════════════════ */
function toggleArtisanFormPanel() {
  const panel  = document.getElementById('artisan-form-panel');
  const btn    = document.getElementById('artisan-form-toggle-btn');
  const isOpen = panel && panel.style.display !== 'none';

  if (panel) panel.style.display = isOpen ? 'none' : 'block';
  if (btn)   btn.innerHTML = isOpen ? '➕ Ajouter un artisan' : '✕ Fermer le formulaire';
}

/* ══════════════════════════════════════════════════════════════
   INIT — Appelé par adminSection('artisans')
══════════════════════════════════════════════════════════════ */
function _bindTrustRefresh() {
  if (_trustBindingsReady) return;
  _trustBindingsReady = true;

  const refresh = () => {
    renderArtisansAdminTable(_artisansList);
    _updateArtisansKPIs(_artisansList);
  };

  window.addEventListener('fixeo:client-request-updated', refresh);
  window.addEventListener('fixeo:client-request-created', refresh);
  window.addEventListener('storage', function (event) {
    if (event.key === 'fixeo_client_requests') refresh();
  });
}

function initArtisansAdmin() {
  _bindTrustRefresh();
  loadArtisans();
}
