/**
 * FIXEO CLAIM SYSTEM v1.0
 * ========================
 * Artisan profile claim + onboarding + admin validation + dashboard sync.
 *
 * Storage keys:
 *   fixeo_claim_requests   — all pending/processed claim requests
 *   fixeo_admin_artisans_v21 — master artisan pool (extended with claim fields)
 *
 * New fields added to artisan objects:
 *   claimed (bool)          — has an approved owner
 *   claim_status            — 'unclaimed' | 'pending' | 'approved' | 'rejected'
 *   owner_account_id        — localStorage user id of the approved owner
 *   onboarding_completed    — bool
 *   verification_status     — 'unverified' | 'pending' | 'verified'
 *   availability            — 'available' | 'busy' | 'unavailable'
 *   editable                — { services, description, work_zone, availability }
 */
;(function (window, document) {
  'use strict';

  /* ─── Constants ─────────────────────────────────────────── */
  const CLAIMS_KEY    = 'fixeo_claim_requests';
  const ARTISANS_KEY  = 'fixeo_admin_artisans_v21';
  const ONBOARD_KEY   = 'fixeo_onboarding_sessions';
  const VERSION       = '1.0';

  const MOROCCAN_CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Agadir','Tanger','Meknès','Oujda',
    'Kénitra','Tétouan','Salé','Laâyoune','Mohammedia','El Jadida','Nador',
    'Beni Mellal','Khouribga','Settat','Safi','Berrechid'
  ];

  const SERVICES = [
    'Plomberie','Électricité','Peinture','Climatisation','Nettoyage',
    'Menuiserie','Serrurerie','Maçonnerie','Jardinage','Bricolage',
    'Déménagement','Carrelage','Toiture','Vitrerie','Chauffage'
  ];

  /* ─── Utils ──────────────────────────────────────────────── */
  function safeJSON(v, fb) { try { return JSON.parse(v) ?? fb; } catch { return fb; } }
  function uid()  { return 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6); }
  function nowISO() { return new Date().toISOString(); }
  function esc(s) { return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /* ─── Storage ────────────────────────────────────────────── */
  function readClaims()  { return safeJSON(localStorage.getItem(CLAIMS_KEY), []); }
  function writeClaims(a) { localStorage.setItem(CLAIMS_KEY, JSON.stringify(a)); }

  function readArtisans() {
    // Pull from localStorage pool (same key admin uses)
    const stored = safeJSON(localStorage.getItem(ARTISANS_KEY), []);
    // Also merge from window.ARTISANS
    const live = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
    const seen = new Set(stored.map(a => String(a.id)));
    const merged = stored.slice();
    live.forEach(a => { const id = String(a.id||''); if (id && !seen.has(id)) { merged.push(a); seen.add(id); } });
    return merged;
  }

  function patchArtisanInStorage(artisanId, patch) {
    const stored = safeJSON(localStorage.getItem(ARTISANS_KEY), []);
    let found = false;
    const updated = stored.map(a => {
      if (String(a.id) === String(artisanId)) { found = true; return Object.assign({}, a, patch); }
      return a;
    });
    if (!found) {
      // Artisan exists only in window.ARTISANS — add to storage with patch
      const live = (window.ARTISANS || []).find(a => String(a.id) === String(artisanId));
      if (live) updated.push(Object.assign({}, live, patch));
    }
    localStorage.setItem(ARTISANS_KEY, JSON.stringify(updated));
    // Also patch window.ARTISANS in-place
    if (window.ARTISANS) {
      const idx = window.ARTISANS.findIndex(a => String(a.id) === String(artisanId));
      if (idx >= 0) window.ARTISANS[idx] = Object.assign({}, window.ARTISANS[idx], patch);
    }
  }

  function getArtisanById(id) {
    return readArtisans().find(a => String(a.id) === String(id)) || null;
  }

  /* ─── Current user ───────────────────────────────────────── */
  function currentUserId() {
    return (localStorage.getItem('user_id') ||
            localStorage.getItem('fixeo_user_id') ||
            localStorage.getItem('fixeo_user') ||
            localStorage.getItem('user_phone') || '').trim();
  }
  function currentUserName() {
    return (localStorage.getItem('user_name') ||
            localStorage.getItem('fixeo_user_name') || 'Utilisateur').trim();
  }
  function currentUserPhone() {
    return (localStorage.getItem('user_phone') || '').trim();
  }

  /* ─────────────────────────────────────────────────────────
   * 1. CLAIM REQUEST
   * ─────────────────────────────────────────────────────── */

  /**
   * Submit a claim request for an artisan profile
   * Returns { ok, claimId, reason }
   */
  function submitClaimRequest(artisanId, onboardingData) {
    if (!artisanId) return { ok: false, reason: 'missing_artisan_id' };

    const artisan = getArtisanById(artisanId);
    if (!artisan) return { ok: false, reason: 'artisan_not_found' };

    // Check existing claims
    const claims = readClaims();
    const existing = claims.find(c =>
      String(c.artisan_id) === String(artisanId) &&
      ['pending','approved'].includes(c.status)
    );
    if (existing?.status === 'approved') return { ok: false, reason: 'already_claimed' };
    if (existing?.status === 'pending')  return { ok: false, reason: 'claim_pending' };

    const claimId = uid();
    const userId  = currentUserId() || uid();

    const claim = {
      id: claimId,
      artisan_id: String(artisanId),
      artisan_name: artisan.name || '',
      artisan_service: artisan.service || artisan.category || '',
      artisan_city: artisan.city || '',
      status: 'pending',
      user_id: userId,
      user_name: currentUserName(),
      user_phone: currentUserPhone() || (onboardingData && onboardingData.phone) || '',
      onboarding: onboardingData || null,
      submitted_at: nowISO(),
      processed_at: null,
      admin_note: ''
    };

    claims.push(claim);
    writeClaims(claims);

    // Mark artisan as pending claim
    patchArtisanInStorage(artisanId, {
      claim_status: 'pending',
      claimed: false,
      verification_status: 'pending'
    });

    dispatch('fixeo:claim-submitted', { claimId, artisanId });
    return { ok: true, claimId };
  }

  /* ─────────────────────────────────────────────────────────
   * 2. ADMIN APPROVE / REJECT
   * ─────────────────────────────────────────────────────── */

  function adminApproveClaim(claimId, adminNote) {
    const claims = readClaims();
    const idx = claims.findIndex(c => c.id === claimId);
    if (idx < 0) return { ok: false, reason: 'claim_not_found' };

    const claim = claims[idx];
    claim.status       = 'approved';
    claim.processed_at = nowISO();
    claim.admin_note   = adminNote || '';
    writeClaims(claims);

    // Apply onboarding data to the artisan profile
    const patch = {
      claimed: true,
      claim_status: 'approved',
      owner_account_id: claim.user_id,
      onboarding_completed: !!(claim.onboarding),
      verification_status: 'verified',
      availability: 'available',
      _claim_id: claimId
    };

    if (claim.onboarding) {
      const ob = claim.onboarding;
      if (ob.phone)       patch.phone        = ob.phone;
      if (ob.description) patch.description  = ob.description;
      if (ob.availability)patch.availability = ob.availability;
      if (ob.work_zone)   patch.work_zone    = ob.work_zone;
      if (ob.services && ob.services.length) patch.services = ob.services;
      if (ob.city)        patch.city         = ob.city;
    }

    patchArtisanInStorage(claim.artisan_id, patch);

    // Also set session for the artisan owner (so dashboard links immediately)
    // Store the claim approval in localStorage so the owner's next login picks it up
    const pending = safeJSON(localStorage.getItem('fixeo_claim_approvals') || '[]', []);
    pending.push({ user_id: claim.user_id, artisan_id: claim.artisan_id, claim_id: claimId, approved_at: nowISO() });
    localStorage.setItem('fixeo_claim_approvals', JSON.stringify(pending));

    dispatch('fixeo:claim-approved', { claimId, artisanId: claim.artisan_id, userId: claim.user_id });
    return { ok: true, artisanId: claim.artisan_id };
  }

  function adminRejectClaim(claimId, adminNote) {
    const claims = readClaims();
    const idx = claims.findIndex(c => c.id === claimId);
    if (idx < 0) return { ok: false, reason: 'claim_not_found' };

    claims[idx].status       = 'rejected';
    claims[idx].processed_at = nowISO();
    claims[idx].admin_note   = adminNote || 'Demande refusée.';
    writeClaims(claims);

    patchArtisanInStorage(claims[idx].artisan_id, {
      claim_status: 'rejected',
      claimed: false,
      verification_status: 'unverified'
    });

    dispatch('fixeo:claim-rejected', { claimId });
    return { ok: true };
  }

  /* ─────────────────────────────────────────────────────────
   * 3. ARTISAN DASHBOARD — PROFILE EDIT
   * ─────────────────────────────────────────────────────── */

  /**
   * Returns the artisan profile owned by the current user, or null
   */
  function getOwnedProfile() {
    const uid = currentUserId();
    if (!uid) return null;

    // Check approvals
    const approvals = safeJSON(localStorage.getItem('fixeo_claim_approvals') || '[]', []);
    const myApproval = approvals.find(a => a.user_id === uid);
    if (!myApproval) {
      // Fallback: check artisans directly
      return readArtisans().find(a => a.owner_account_id === uid && a.claimed) || null;
    }
    return getArtisanById(myApproval.artisan_id);
  }

  /**
   * Artisan updates their own profile (only editable fields)
   * Returns { ok, artisan }
   */
  function updateOwnedProfile(artisanId, updates) {
    const uid = currentUserId();
    const artisan = getArtisanById(artisanId);
    if (!artisan) return { ok: false, reason: 'not_found' };
    if (artisan.owner_account_id !== uid) return { ok: false, reason: 'not_owner' };

    // Only allow these fields (never allow name/id/city change via self-edit)
    const EDITABLE = ['description','availability','work_zone','services','phone'];
    const allowed = {};
    EDITABLE.forEach(k => { if (updates[k] !== undefined) allowed[k] = updates[k]; });
    allowed.updated_at = nowISO();

    patchArtisanInStorage(artisanId, allowed);

    dispatch('fixeo:profile-updated', { artisanId, updates: allowed });
    return { ok: true, artisan: getArtisanById(artisanId) };
  }

  /* ─────────────────────────────────────────────────────────
   * 4. CLAIM BUTTON — injected into public profile page
   * ─────────────────────────────────────────────────────── */

  function injectClaimButton(artisanId) {
    if (!artisanId) return;

    // Don't inject twice
    if (document.getElementById('fixeo-claim-btn')) return;

    const artisan = getArtisanById(artisanId);
    const claimStatus = artisan?.claim_status || 'unclaimed';
    const isClaimed   = artisan?.claimed;

    let btnHtml = '';
    if (isClaimed || claimStatus === 'approved') {
      btnHtml = `<div class="fixeo-claim-badge fixeo-claim-approved">
        <span>✅</span> Profil revendiqué — Artisan vérifié
      </div>`;
    } else if (claimStatus === 'pending') {
      btnHtml = `<div class="fixeo-claim-badge fixeo-claim-pending">
        <span>⏳</span> Demande de revendication en cours…
      </div>`;
    } else {
      btnHtml = `<button id="fixeo-claim-btn" class="fixeo-claim-btn" onclick="window.FixeoClaimSystem.openClaimModal('${esc(String(artisanId))}')">
        <span class="claim-icon">🏷️</span>
        <span>Revendiquer ce profil</span>
        <span class="claim-badge">Profil à revendiquer</span>
      </button>`;
    }

    // Find the best injection point on the profile page
    const targets = [
      document.querySelector('.ppui-cta-wrap'),
      document.querySelector('.public-artisan-action-wrap'),
      document.querySelector('.artisan-cta-row'),
      document.getElementById('public-artisan-action')?.parentElement,
      document.querySelector('.public-artisan-shell')
    ];

    for (const target of targets) {
      if (target) {
        const wrapper = document.createElement('div');
        wrapper.className = 'fixeo-claim-wrapper';
        wrapper.innerHTML = btnHtml;
        target.appendChild(wrapper);
        break;
      }
    }
  }

  /* ─────────────────────────────────────────────────────────
   * 5. ONBOARDING MODAL (multi-step)
   * ─────────────────────────────────────────────────────── */

  function openClaimModal(artisanId) {
    const artisan = getArtisanById(artisanId);
    if (!artisan) return;

    // Remove existing modal
    document.getElementById('fixeo-claim-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'fixeo-claim-modal';
    modal.className = 'fixeo-claim-modal-overlay';
    modal.innerHTML = `
      <div class="fixeo-claim-modal-box" role="dialog" aria-modal="true" aria-labelledby="claim-modal-title">
        <button class="fixeo-claim-modal-close" onclick="document.getElementById('fixeo-claim-modal').remove()" aria-label="Fermer">✕</button>
        <div id="fixeo-claim-modal-content">
          ${_renderStep1(artisan)}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Store artisanId on modal for step navigation
    modal.dataset.artisanId = String(artisanId);
  }

  function _renderStep1(artisan) {
    return `
      <div class="claim-step" data-step="1">
        <div class="claim-step-header">
          <div class="claim-step-icon">🏷️</div>
          <h2 id="claim-modal-title">Revendiquer ce profil</h2>
          <p class="claim-step-sub">Vous êtes <strong>${esc(artisan.name)}</strong> ? Complétez votre identité pour revendiquer ce profil.</p>
        </div>
        <div class="claim-progress"><span style="width:20%"></span></div>
        <form class="claim-form" onsubmit="window.FixeoClaimSystem._submitStep1(event)">
          <div class="claim-field">
            <label>Votre nom complet</label>
            <input type="text" name="name" placeholder="Ex : Karim El Mansouri" required
              value="${esc(artisan.name)}" class="claim-input">
          </div>
          <div class="claim-field">
            <label>Téléphone professionnel</label>
            <input type="tel" name="phone" placeholder="06 00 00 00 00" required class="claim-input">
          </div>
          <div class="claim-field">
            <label>Ville</label>
            <select name="city" required class="claim-input">
              <option value="">-- Choisir --</option>
              ${MOROCCAN_CITIES.map(c => `<option value="${c}" ${c===artisan.city?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="claim-btn-primary">Continuer →</button>
        </form>
      </div>
    `;
  }

  function _renderStep2(data) {
    return `
      <div class="claim-step" data-step="2">
        <div class="claim-step-header">
          <div class="claim-step-icon">🔧</div>
          <h2 id="claim-modal-title">Vos services & zone</h2>
          <p class="claim-step-sub">Définissez vos spécialités et votre zone d'intervention.</p>
        </div>
        <div class="claim-progress"><span style="width:55%"></span></div>
        <form class="claim-form" onsubmit="window.FixeoClaimSystem._submitStep2(event)">
          <div class="claim-field">
            <label>Services proposés (sélectionnez plusieurs)</label>
            <div class="claim-services-grid">
              ${SERVICES.map(s => `
                <label class="claim-service-chip">
                  <input type="checkbox" name="services" value="${s}" ${data.category&&s.toLowerCase().includes(data.category.toLowerCase())?'checked':''}>
                  <span>${s}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="claim-field">
            <label>Zone d'intervention</label>
            <input type="text" name="work_zone" class="claim-input"
              placeholder="Ex : Casablanca et environs, 30km"
              value="${esc(data.city || '')} et environs">
          </div>
          <div class="claim-field">
            <label>Disponibilité</label>
            <select name="availability" class="claim-input">
              <option value="available">Disponible</option>
              <option value="busy">Chargé (délais possibles)</option>
              <option value="unavailable">Indisponible actuellement</option>
            </select>
          </div>
          <div style="display:flex;gap:10px">
            <button type="button" class="claim-btn-outline" onclick="window.FixeoClaimSystem._goBack()">← Retour</button>
            <button type="submit" class="claim-btn-primary" style="flex:1">Continuer →</button>
          </div>
        </form>
      </div>
    `;
  }

  function _renderStep3(data) {
    return `
      <div class="claim-step" data-step="3">
        <div class="claim-step-header">
          <div class="claim-step-icon">📝</div>
          <h2 id="claim-modal-title">Votre présentation</h2>
          <p class="claim-step-sub">Décrivez votre expérience et ce qui vous différencie.</p>
        </div>
        <div class="claim-progress"><span style="width:80%"></span></div>
        <form class="claim-form" onsubmit="window.FixeoClaimSystem._submitStep3(event)">
          <div class="claim-field">
            <label>Présentation professionnelle</label>
            <textarea name="description" class="claim-input" rows="4" required
              placeholder="Ex : Plombier avec 10 ans d'expérience à Casablanca. Intervention rapide, devis gratuit…">${esc(data.description||'')}</textarea>
          </div>
          <div class="claim-field">
            <label>Années d'expérience</label>
            <select name="experience" class="claim-input">
              ${['Moins de 1 an','1-3 ans','3-5 ans','5-10 ans','Plus de 10 ans'].map(v =>
                `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:10px">
            <button type="button" class="claim-btn-outline" onclick="window.FixeoClaimSystem._goBack()">← Retour</button>
            <button type="submit" class="claim-btn-primary" style="flex:1">Confirmer la demande →</button>
          </div>
        </form>
      </div>
    `;
  }

  function _renderStepConfirm(data, artisanId) {
    const artisan = getArtisanById(artisanId);
    return `
      <div class="claim-step" data-step="4">
        <div class="claim-step-header">
          <div class="claim-step-icon">📤</div>
          <h2 id="claim-modal-title">Confirmer la revendication</h2>
          <p class="claim-step-sub">Vérifiez vos informations avant envoi.</p>
        </div>
        <div class="claim-progress"><span style="width:100%"></span></div>
        <div class="claim-confirm-card">
          <div class="claim-confirm-row"><span>Profil</span><strong>${esc(artisan?.name||'')}</strong></div>
          <div class="claim-confirm-row"><span>Nom</span><strong>${esc(data.name)}</strong></div>
          <div class="claim-confirm-row"><span>Téléphone</span><strong>${esc(data.phone)}</strong></div>
          <div class="claim-confirm-row"><span>Ville</span><strong>${esc(data.city)}</strong></div>
          <div class="claim-confirm-row"><span>Services</span><strong>${(data.services||[]).join(', ')||'—'}</strong></div>
          <div class="claim-confirm-row"><span>Zone</span><strong>${esc(data.work_zone||'—')}</strong></div>
          <div class="claim-confirm-row"><span>Disponibilité</span><strong>${esc(data.availability||'Disponible')}</strong></div>
        </div>
        <div class="claim-disclaimer">
          En soumettant, vous certifiez être l'artisan concerné. L'équipe Fixeo validera votre demande sous 24h.
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button type="button" class="claim-btn-outline" onclick="window.FixeoClaimSystem._goBack()">← Modifier</button>
          <button type="button" class="claim-btn-primary" style="flex:1"
            onclick="window.FixeoClaimSystem._finalSubmit('${esc(String(artisanId))}')">
            ✅ Envoyer ma demande
          </button>
        </div>
      </div>
    `;
  }

  function _renderStepSuccess(artisanName) {
    return `
      <div class="claim-step claim-success" data-step="5">
        <div class="claim-step-icon" style="font-size:3rem;margin:16px 0">🎉</div>
        <h2>Demande envoyée !</h2>
        <p>Votre demande de revendication pour <strong>${esc(artisanName)}</strong> a été soumise.</p>
        <p style="margin-top:8px;color:rgba(255,255,255,.65);font-size:.85rem">
          L'équipe Fixeo va vérifier votre identité et vous contacter dans les 24h.<br>
          Une fois approuvé, vous pourrez accéder à votre tableau de bord artisan.
        </p>
        <button class="claim-btn-primary" style="margin-top:20px;width:100%"
          onclick="document.getElementById('fixeo-claim-modal').remove()">
          Fermer
        </button>
      </div>
    `;
  }

  /* ─── Step navigation state ──────────────────────────────── */
  let _claimData = {};
  let _currentStep = 1;

  function _getModal()     { return document.getElementById('fixeo-claim-modal'); }
  function _getContent()   { return document.getElementById('fixeo-claim-modal-content'); }
  function _getArtisanId() { return _getModal()?.dataset?.artisanId || ''; }

  function _goBack() {
    _currentStep = Math.max(1, _currentStep - 1);
    _rerenderStep();
  }

  function _rerenderStep() {
    const art = getArtisanById(_getArtisanId());
    const content = _getContent();
    if (!content || !art) return;
    if (_currentStep === 1) content.innerHTML = _renderStep1(art);
    if (_currentStep === 2) content.innerHTML = _renderStep2(Object.assign({}, art, _claimData));
    if (_currentStep === 3) content.innerHTML = _renderStep3(_claimData);
    if (_currentStep === 4) content.innerHTML = _renderStepConfirm(_claimData, _getArtisanId());
  }

  function _submitStep1(e) {
    e.preventDefault();
    const f = e.target;
    _claimData.name  = f.name.value.trim();
    _claimData.phone = f.phone.value.trim();
    _claimData.city  = f.city.value;
    _currentStep = 2;
    _getContent().innerHTML = _renderStep2(Object.assign({}, getArtisanById(_getArtisanId()), _claimData));
  }

  function _submitStep2(e) {
    e.preventDefault();
    const f = e.target;
    _claimData.services     = Array.from(f.querySelectorAll('[name=services]:checked')).map(el => el.value);
    _claimData.work_zone    = f.work_zone.value.trim();
    _claimData.availability = f.availability.value;
    _currentStep = 3;
    const art = getArtisanById(_getArtisanId());
    _getContent().innerHTML = _renderStep3(Object.assign({}, art, _claimData));
  }

  function _submitStep3(e) {
    e.preventDefault();
    const f = e.target;
    _claimData.description = f.description.value.trim();
    _claimData.experience  = f.experience.value;
    _currentStep = 4;
    _getContent().innerHTML = _renderStepConfirm(_claimData, _getArtisanId());
  }

  function _finalSubmit(artisanId) {
    const result = submitClaimRequest(artisanId, _claimData);
    const art = getArtisanById(artisanId);
    if (result.ok) {
      _getContent().innerHTML = _renderStepSuccess(art?.name || '');
      // Refresh the claim button on the page
      setTimeout(() => injectClaimButton(artisanId), 300);
    } else {
      const err = {
        'already_claimed': 'Ce profil est déjà revendiqué.',
        'claim_pending':   'Une demande est déjà en cours pour ce profil.',
        'artisan_not_found': 'Profil introuvable.'
      }[result.reason] || 'Erreur inattendue. Réessayez.';
      _getContent().insertAdjacentHTML('beforeend',
        `<div style="color:#ff5d73;padding:10px;margin-top:8px;border-radius:8px;background:rgba(255,93,115,.1)">${err}</div>`
      );
    }
  }

  /* ─────────────────────────────────────────────────────────
   * 6. ADMIN PANEL — Claims section
   * ─────────────────────────────────────────────────────── */

  function renderAdminClaimsSection() {
    const container = document.getElementById('admin-section-claims');
    if (!container) return;

    const claims = readClaims();
    const pending  = claims.filter(c => c.status === 'pending');
    const approved = claims.filter(c => c.status === 'approved');
    const rejected = claims.filter(c => c.status === 'rejected');

    // Update sidebar badge
    const badge = document.getElementById('sc-claims');
    if (badge) badge.textContent = pending.length;

    container.innerHTML = `
      <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:16px">
        🏷️ Revendications de profil
        ${pending.length ? `<span style="background:#E1306C;color:#fff;font-size:.7rem;padding:2px 8px;border-radius:20px;margin-left:8px">${pending.length} en attente</span>` : ''}
      </h2>

      ${pending.length === 0 ? `
        <div style="color:rgba(255,255,255,.45);text-align:center;padding:40px">
          Aucune demande en attente.
        </div>
      ` : ''}

      <div class="claims-table-wrap">
        ${[...pending,...approved,...rejected].map(c => _renderClaimRow(c)).join('')}
      </div>
    `;
  }

  function _renderClaimRow(c) {
    const statusColors = {
      pending:  { bg:'rgba(255,165,2,.12)', text:'#ffa502', label:'En attente' },
      approved: { bg:'rgba(32,201,151,.12)',text:'#20c997', label:'Approuvée' },
      rejected: { bg:'rgba(255,93,115,.12)',text:'#ff5d73', label:'Refusée' }
    };
    const sc = statusColors[c.status] || statusColors.pending;
    const ob = c.onboarding || {};

    return `
      <div class="claim-admin-row" style="background:rgba(255,255,255,.04);border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:700;font-size:.95rem">${esc(c.artisan_name)} <span style="font-size:.75rem;color:rgba(255,255,255,.5)">#${c.artisan_id}</span></div>
            <div style="font-size:.82rem;color:rgba(255,255,255,.55);margin-top:3px">
              ${esc(c.artisan_service)} — ${esc(c.artisan_city)}
            </div>
          </div>
          <div style="background:${sc.bg};color:${sc.text};padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:600">
            ${sc.label}
          </div>
        </div>

        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.8rem;color:rgba(255,255,255,.7)">
          <div>👤 ${esc(c.user_name)}</div>
          <div>📞 ${esc(c.user_phone || ob.phone || '—')}</div>
          <div>🏙️ ${esc(ob.city || c.artisan_city)}</div>
          <div>📅 ${new Date(c.submitted_at).toLocaleDateString('fr-FR')}</div>
          ${ob.services?.length ? `<div style="grid-column:1/-1">🔧 ${esc(ob.services.join(', '))}</div>` : ''}
          ${ob.description ? `<div style="grid-column:1/-1;color:rgba(255,255,255,.5);font-style:italic">"${esc(ob.description.slice(0,120))}…"</div>` : ''}
        </div>

        ${c.status === 'pending' ? `
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="tbl-btn success" onclick="window.FixeoClaimSystem.adminApproveClaim('${c.id}','')">
              ✅ Approuver
            </button>
            <button class="tbl-btn danger" onclick="window.FixeoClaimSystem.adminRejectClaim('${c.id}','Non éligible.')">
              ❌ Refuser
            </button>
            <a href="artisan-profile.html?id=${esc(String(c.artisan_id))}" target="_blank"
              style="font-size:.78rem;color:#4da3ff;align-self:center;margin-left:auto">
              Voir profil →
            </a>
          </div>
        ` : `
          <div style="margin-top:8px;font-size:.75rem;color:rgba(255,255,255,.4)">
            Traité le ${c.processed_at ? new Date(c.processed_at).toLocaleDateString('fr-FR') : '—'}
            ${c.admin_note ? ` — ${esc(c.admin_note)}` : ''}
          </div>
        `}
      </div>
    `;
  }

  /* ─────────────────────────────────────────────────────────
   * 7. ARTISAN DASHBOARD — Profile edit panel
   * ─────────────────────────────────────────────────────── */

  function renderDashboardProfileEditor() {
    const container = document.getElementById('section-profile-editor') ||
                      document.getElementById('artisan-cod-overview-panel');
    if (!container) return;

    const artisan = getOwnedProfile();
    if (!artisan) {
      // Check if there's a pending claim
      const uid = currentUserId();
      const claims = readClaims();
      const pendingClaim = claims.find(c => c.user_id === uid && c.status === 'pending');

      if (pendingClaim) {
        container.innerHTML = `
          <div class="claim-dashboard-notice pending">
            <div class="notice-icon">⏳</div>
            <div>
              <strong>Demande de revendication en cours</strong><br>
              <span style="font-size:.8rem;color:rgba(255,255,255,.55)">
                Votre demande pour <strong>${esc(pendingClaim.artisan_name)}</strong> est en attente de validation par Fixeo.
                Vous serez notifié sous 24h.
              </span>
            </div>
          </div>
        `;
      }
      return;
    }

    // Render the editable profile panel
    container.innerHTML = `
      <div class="dash-profile-editor" style="background:rgba(255,255,255,.04);border-radius:16px;padding:20px;margin-bottom:20px;border:1px solid rgba(225,48,108,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:1rem;font-weight:700;margin:0">
            ✅ Mon profil public — <span style="color:#E1306C">${esc(artisan.name)}</span>
          </h3>
          <a href="artisan-profile.html?id=${esc(String(artisan.id))}" target="_blank"
            style="font-size:.78rem;color:#4da3ff">
            Voir profil public →
          </a>
        </div>

        <form id="profile-edit-form" onsubmit="window.FixeoClaimSystem.saveProfileEdit(event,'${esc(String(artisan.id))}')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="claim-field" style="grid-column:1/-1">
              <label style="font-size:.8rem;color:rgba(255,255,255,.6)">Présentation</label>
              <textarea name="description" class="claim-input" rows="3"
                style="width:100%;resize:vertical">${esc(artisan.description||artisan.shortBio||'')}</textarea>
            </div>
            <div class="claim-field">
              <label style="font-size:.8rem;color:rgba(255,255,255,.6)">Disponibilité</label>
              <select name="availability" class="claim-input">
                <option value="available" ${artisan.availability==='available'?'selected':''}>Disponible</option>
                <option value="busy"      ${artisan.availability==='busy'?'selected':''}>Chargé</option>
                <option value="unavailable" ${artisan.availability==='unavailable'?'selected':''}>Indisponible</option>
              </select>
            </div>
            <div class="claim-field">
              <label style="font-size:.8rem;color:rgba(255,255,255,.6)">Zone d'intervention</label>
              <input type="text" name="work_zone" class="claim-input"
                value="${esc(artisan.work_zone||artisan.city||'')}">
            </div>
            <div class="claim-field" style="grid-column:1/-1">
              <label style="font-size:.8rem;color:rgba(255,255,255,.6)">Services proposés</label>
              <div class="claim-services-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
                ${SERVICES.map(s => {
                  const checked = (artisan.services||[]).includes(s) ||
                    (artisan.service||'').toLowerCase().includes(s.toLowerCase()) ||
                    (artisan.category||'').toLowerCase().includes(s.toLowerCase().slice(0,5));
                  return `<label class="claim-service-chip"><input type="checkbox" name="services" value="${s}" ${checked?'checked':''}><span>${s}</span></label>`;
                }).join('')}
              </div>
            </div>
          </div>
          <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
            <button type="submit" class="claim-btn-primary" style="width:auto;padding:0 24px">
              💾 Enregistrer les modifications
            </button>
            <div id="profile-edit-feedback" style="font-size:.8rem;color:#20c997;display:none">
              ✓ Profil mis à jour !
            </div>
          </div>
        </form>
      </div>
    `;
  }

  function saveProfileEdit(e, artisanId) {
    e.preventDefault();
    const f = e.target;
    const updates = {
      description:  f.description.value.trim(),
      availability: f.availability.value,
      work_zone:    f.work_zone.value.trim(),
      services:     Array.from(f.querySelectorAll('[name=services]:checked')).map(el => el.value)
    };

    const result = updateOwnedProfile(artisanId, updates);
    const fb = document.getElementById('profile-edit-feedback');
    if (result.ok) {
      if (fb) { fb.style.display = 'block'; setTimeout(() => { fb.style.display = 'none'; }, 3000); }
      dispatch('fixeo:profile-updated', { artisanId, updates });
    } else {
      if (fb) { fb.style.color='#ff5d73'; fb.textContent='Erreur: '+result.reason; fb.style.display='block'; }
    }
  }

  /* ─────────────────────────────────────────────────────────
   * 8. CSS INJECTION
   * ─────────────────────────────────────────────────────── */

  function injectCSS() {
    if (document.getElementById('fixeo-claim-css')) return;
    const style = document.createElement('style');
    style.id = 'fixeo-claim-css';
    style.textContent = `
      /* ── Claim button on public profile ── */
      .fixeo-claim-wrapper { margin-top: 14px; }
      .fixeo-claim-btn {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 12px 20px; border-radius: 12px; border: none; cursor: pointer;
        background: linear-gradient(135deg,rgba(225,48,108,.15),rgba(131,58,180,.15));
        border: 1px solid rgba(225,48,108,.4);
        color: #f0f0f0; font-size: .88rem; font-weight: 600; width: 100%;
        justify-content: center; transition: all .2s;
      }
      .fixeo-claim-btn:hover {
        background: linear-gradient(135deg,rgba(225,48,108,.25),rgba(131,58,180,.25));
        transform: translateY(-1px); box-shadow: 0 6px 20px rgba(225,48,108,.2);
      }
      .claim-badge {
        font-size:.65rem; padding:2px 8px; border-radius:20px;
        background:rgba(225,48,108,.2); color:#E1306C; border:1px solid rgba(225,48,108,.3);
      }
      .fixeo-claim-badge {
        display:flex; align-items:center; gap:8px; padding:10px 16px;
        border-radius:10px; font-size:.82rem; font-weight:500; margin-top:10px;
      }
      .fixeo-claim-approved { background:rgba(32,201,151,.12); color:#20c997; border:1px solid rgba(32,201,151,.25); }
      .fixeo-claim-pending  { background:rgba(255,165,2,.10);  color:#ffa502; border:1px solid rgba(255,165,2,.25); }

      /* ── Modal overlay ── */
      .fixeo-claim-modal-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;
      }
      .fixeo-claim-modal-box {
        background:#0f0f1a; border:1px solid rgba(255,255,255,.12);
        border-radius:20px; padding:28px 24px; width:100%; max-width:480px;
        max-height:90vh; overflow-y:auto; position:relative;
        box-shadow:0 24px 80px rgba(0,0,0,.6);
      }
      .fixeo-claim-modal-close {
        position:absolute; top:14px; right:16px; background:none; border:none;
        color:rgba(255,255,255,.4); font-size:1.1rem; cursor:pointer; padding:4px 8px;
      }
      .fixeo-claim-modal-close:hover { color:#fff; }

      /* ── Step UI ── */
      .claim-step-header { text-align:center; margin-bottom:20px; }
      .claim-step-icon { font-size:2rem; margin-bottom:8px; }
      .claim-step-header h2 { font-size:1.2rem; font-weight:700; margin:0 0 6px; color:#f0f0f0; }
      .claim-step-sub { font-size:.83rem; color:rgba(255,255,255,.55); margin:0; }

      .claim-progress {
        height:3px; background:rgba(255,255,255,.1); border-radius:2px; margin-bottom:20px; overflow:hidden;
      }
      .claim-progress span { display:block; height:100%; background:linear-gradient(90deg,#E1306C,#833AB4); border-radius:2px; transition:width .4s; }

      .claim-form { display:flex; flex-direction:column; gap:14px; }
      .claim-field { display:flex; flex-direction:column; gap:5px; }
      .claim-field label { font-size:.78rem; color:rgba(255,255,255,.6); font-weight:500; }
      .claim-input {
        background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
        border-radius:10px; padding:10px 14px; color:#f0f0f0; font-size:.9rem; width:100%;
        box-sizing:border-box; transition:border-color .2s;
      }
      .claim-input:focus { outline:none; border-color:rgba(225,48,108,.5); }
      textarea.claim-input { resize:vertical; }

      .claim-services-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; }
      .claim-service-chip {
        display:flex; align-items:center; gap:6px; padding:7px 10px;
        border-radius:8px; background:rgba(255,255,255,.05); cursor:pointer;
        font-size:.78rem; color:rgba(255,255,255,.75); border:1px solid rgba(255,255,255,.08);
        transition:all .15s;
      }
      .claim-service-chip input { width:14px; height:14px; accent-color:#E1306C; }
      .claim-service-chip:has(input:checked) {
        background:rgba(225,48,108,.12); border-color:rgba(225,48,108,.4); color:#f0f0f0;
      }

      .claim-btn-primary {
        width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
        background:linear-gradient(135deg,#E1306C,#833AB4); color:#fff;
        font-size:.9rem; font-weight:600; transition:all .2s;
      }
      .claim-btn-primary:hover { opacity:.9; transform:translateY(-1px); }
      .claim-btn-outline {
        padding:12px 16px; border-radius:10px; border:1px solid rgba(255,255,255,.15);
        background:transparent; color:rgba(255,255,255,.7); cursor:pointer; font-size:.9rem; transition:all .2s;
      }
      .claim-btn-outline:hover { border-color:rgba(255,255,255,.35); color:#fff; }

      .claim-confirm-card {
        background:rgba(255,255,255,.04); border-radius:10px; padding:14px; margin:12px 0;
        border:1px solid rgba(255,255,255,.08);
      }
      .claim-confirm-row {
        display:flex; justify-content:space-between; padding:6px 0;
        border-bottom:1px solid rgba(255,255,255,.05); font-size:.82rem;
      }
      .claim-confirm-row:last-child { border-bottom:none; }
      .claim-confirm-row span { color:rgba(255,255,255,.45); }
      .claim-confirm-row strong { color:#f0f0f0; text-align:right; }
      .claim-disclaimer { font-size:.72rem; color:rgba(255,255,255,.35); text-align:center; line-height:1.5; }

      .claim-success { text-align:center; padding:12px 0; }
      .claim-success h2 { font-size:1.3rem; margin:8px 0; }
      .claim-success p { font-size:.85rem; color:rgba(255,255,255,.65); line-height:1.5; }

      /* ── Admin claims section ── */
      .claim-admin-row { transition:background .2s; }
      .claim-admin-row:hover { background:rgba(255,255,255,.06) !important; }
      .tbl-btn { padding:7px 14px; border-radius:8px; border:none; cursor:pointer; font-size:.78rem; font-weight:600; }
      .tbl-btn.success { background:rgba(32,201,151,.15); color:#20c997; border:1px solid rgba(32,201,151,.3); }
      .tbl-btn.success:hover { background:rgba(32,201,151,.25); }
      .tbl-btn.danger { background:rgba(255,93,115,.12); color:#ff5d73; border:1px solid rgba(255,93,115,.3); }
      .tbl-btn.danger:hover { background:rgba(255,93,115,.22); }

      /* ── Dashboard notice ── */
      .claim-dashboard-notice {
        display:flex; align-items:center; gap:14px; padding:16px 20px;
        border-radius:14px; margin-bottom:16px;
      }
      .claim-dashboard-notice.pending {
        background:rgba(255,165,2,.1); border:1px solid rgba(255,165,2,.25);
      }
      .claim-dashboard-notice .notice-icon { font-size:1.8rem; flex-shrink:0; }

      @media (max-width:480px) {
        .fixeo-claim-modal-box { padding:20px 16px; border-radius:16px 16px 0 0; margin:auto 0 0; max-height:85vh; }
        .fixeo-claim-modal-overlay { align-items:flex-end; }
        .claim-services-grid { grid-template-columns:1fr 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────────────────
   * 9. ADMIN HTML INJECTION (sidebar + section)
   * ─────────────────────────────────────────────────────── */

  function injectAdminClaimsUI() {
    if (!window.location.pathname.toLowerCase().includes('admin')) return;
    if (document.getElementById('admin-section-claims')) return; // already present

    // Add sidebar link
    const sidebar = document.querySelector('.sidebar nav, .sidebar-nav, #admin-sidebar nav, #admin-sidebar');
    if (sidebar) {
      const li = document.createElement('a');
      li.className = 'sidebar-link';
      li.setAttribute('onclick', "adminSection('claims')");
      li.innerHTML = `<span class="icon">🏷️</span><span>Revendications</span><span class="sidebar-count pending" id="sc-claims">0</span>`;
      // Insert after 'artisans' link
      const artLink = Array.from(sidebar.querySelectorAll('.sidebar-link')).find(el => el.textContent.includes('Artisan'));
      if (artLink) artLink.insertAdjacentElement('afterend', li);
      else sidebar.appendChild(li);
    }

    // Add the section div after existing sections
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      const div = document.createElement('div');
      div.id = 'admin-section-claims';
      div.style.display = 'none';
      mainContent.appendChild(div);
    }

    // Patch adminSection() to handle 'claims'
    const origAdminSection = window.adminSection;
    window.adminSection = function(name) {
      if (name === 'claims') {
        // Hide all sections
        document.querySelectorAll('[id^="admin-section-"]').forEach(el => el.style.display = 'none');
        const el = document.getElementById('admin-section-claims');
        if (el) el.style.display = 'block';
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        window.FixeoClaimSystem.renderAdminClaimsSection();
      } else {
        if (typeof origAdminSection === 'function') origAdminSection(name);
      }
    };
  }

  /* ─────────────────────────────────────────────────────────
   * 10. AUTO-INIT
   * ─────────────────────────────────────────────────────── */

  function init() {
    injectCSS();

    const path = window.location.pathname.toLowerCase();
    const isProfile   = path.includes('artisan-profile');
    const isAdmin     = path.includes('admin');
    const isArtDash   = path.includes('dashboard-artisan');

    function run() {
      if (isAdmin) {
        injectAdminClaimsUI();
        // Auto-refresh badge
        const claims = readClaims();
        const badge = document.getElementById('sc-claims');
        if (badge) badge.textContent = claims.filter(c => c.status==='pending').length;
      }

      if (isArtDash) {
        renderDashboardProfileEditor();
      }

      if (isProfile) {
        // Get artisan ID from URL
        const params = new URLSearchParams(window.location.search);
        const artisanId = params.get('id') || params.get('artisan');
        if (artisanId) {
          // Wait for profile to render then inject claim button
          const tryInject = () => {
            if (document.querySelector('.ppui-cta-wrap, .public-artisan-action-wrap, #public-artisan-action')) {
              injectClaimButton(artisanId);
            } else {
              setTimeout(tryInject, 400);
            }
          };
          setTimeout(tryInject, 800);

          // Also watch for async render
          if (window.MutationObserver) {
            const obs = new MutationObserver(() => {
              if (document.querySelector('#public-artisan-action')) {
                obs.disconnect();
                setTimeout(() => injectClaimButton(artisanId), 200);
              }
            });
            obs.observe(document.body, { childList: true, subtree: true });
          }
        }
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(run, 200));
    } else {
      setTimeout(run, 200);
    }

    // Listen for profile updates to refresh public profile data
    window.addEventListener('fixeo:profile-updated', function(e) {
      const { artisanId, updates } = e.detail || {};
      // Sync SearchEngine if present
      if (window.SearchEngine?.artisans) {
        const idx = window.SearchEngine.artisans.findIndex(a => String(a.id)===String(artisanId));
        if (idx >= 0) Object.assign(window.SearchEngine.artisans[idx], updates);
      }
      dispatch('fixeo:state:updated', { source: 'profile-edit', artisanId });
    });

    // Listen for approvals → refresh dashboard
    window.addEventListener('fixeo:claim-approved', function(e) {
      if (isArtDash) setTimeout(renderDashboardProfileEditor, 200);
      if (isAdmin)   setTimeout(renderAdminClaimsSection, 200);
    });
  }

  /* ─── Public API ─────────────────────────────────────────── */
  window.FixeoClaimSystem = {
    version: VERSION,
    // Core claim flow
    submitClaimRequest,
    adminApproveClaim: function(claimId, note) {
      const r = adminApproveClaim(claimId, note);
      renderAdminClaimsSection();
      return r;
    },
    adminRejectClaim: function(claimId, note) {
      const r = adminRejectClaim(claimId, note);
      renderAdminClaimsSection();
      return r;
    },
    // Dashboard
    getOwnedProfile,
    updateOwnedProfile,
    saveProfileEdit,
    renderDashboardProfileEditor,
    // Admin
    renderAdminClaimsSection,
    injectAdminClaimsUI,
    // Public profile
    injectClaimButton,
    openClaimModal,
    // Step handlers (called from inline HTML)
    _submitStep1, _submitStep2, _submitStep3, _finalSubmit, _goBack,
    // Data access
    readClaims,
    getArtisanById,
    // Utils
    MOROCCAN_CITIES, SERVICES
  };

  init();

})(window, document);
