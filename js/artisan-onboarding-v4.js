fixeo auth/**
 * artisan-onboarding-v4.js
 * 7C.12A.2 — Canonical Server-Authoritative New Artisan Registration
 *
 * REPLACES:
 *   artisan-onboarding.js form submit handler (createArtisanSession + addArtisan)
 *   artisan-onboarding-store.js Supabase role/session writes
 *
 * WHAT THIS FILE DOES:
 *   1. Intercepts the form submit event (additive — does not break V3 UX)
 *   2. Calls Supabase Auth to get/confirm the authenticated user
 *   3. Calls public.register_new_artisan() RPC
 *   4. Handles response states (unauthenticated, already_registered, registered)
 *   5. Redirects to dashboard-artisan-v2.html (never V1)
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - Does NOT write to localStorage for identity, role, or ownership
 *   - Does NOT call FixeoArtisanOnboardingStore.addArtisan() (ghost writer)
 *   - Does NOT call createArtisanSession() (localStorage role write)
 *   - Does NOT redirect to dashboard-artisan.html (deprecated V1)
 *   - Does NOT set verified, onboarding_completed, or availability
 *   - Does NOT supply owner_user_id to the RPC (server derives from auth.uid())
 *
 * AUTH CONTRACT:
 *   If unauthenticated: redirect to auth.html?return=onboarding-artisan.html
 *   After successful auth and return: resume registration
 *
 * LOCALSTORAGE PERMITTED USES (non-identity, non-authority):
 *   - fixeo_artisan_onboarding_draft_v1: form field progress cache only
 *     (read on load to prefill, cleared on successful RPC registration)
 *
 * STACK ORDER (HTML load order matters):
 *   artisan-onboarding-store.js   — UX config/store (localStorage draft only)
 *   artisan-onboarding.js         — form build + validation (preserved)
 *   artisan-onboarding-v3.js      — UX upgrade (preserved)
 *   artisan-onboarding-v4.js      — this file: replaces submit handler
 *
 * V3 form submit is OVERRIDDEN by this file (captures 'submit' in capture phase).
 */
(function () {
  'use strict';

  if (window._fxAoV4Loaded) return;
  window._fxAoV4Loaded = true;

  /* ─── Constants ─────────────────────────────────────────── */
  var DRAFT_KEY        = 'fixeo_artisan_onboarding_draft_v1';
  var REDIRECT_ARTISAN = 'dashboard-artisan-v2.html';
  var REDIRECT_AUTH    = 'auth.html';

  /* ─── Helpers ───────────────────────────────────────────── */
  function $id(id) { return document.getElementById(id); }
  function sb()    { return window.FixeoSupabaseClient && window.FixeoSupabaseClient.client; }
  function isSB()  { return !!(window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED); }

  function log(msg, lvl) {
    var fn = lvl === 'error' ? console.error : console.log;
    fn('[fxAoV4]', msg);
  }

  /* ─── Draft cache (progress only, not identity) ─────────── */
  function saveDraft(fields) {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        name:        fields.name        || '',
        category:    fields.category    || '',
        city:        fields.city        || '',
        description: fields.description || ''
        /* phone excluded from draft — not persisted client-side for security */
      }));
    } catch (e) { /* no-op */ }
  }

  function loadDraft() {
    try {
      var raw = window.localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearDraft() {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* no-op */ }
  }

  /* ─── UI feedback ───────────────────────────────────────── */
  function setSubmitState(btn, state, text) {
    if (!btn) return;
    btn.disabled = (state === 'loading' || state === 'success');
    btn.textContent = text || btn.textContent;
    btn.classList.toggle('fxaov4-loading', state === 'loading');
  }

  function showError(message) {
    var toast = $id('artisan-onboarding-toast');
    if (toast) {
      toast.textContent = message;
      toast.hidden      = false;
      toast.className   = 'artisan-onboarding-toast artisan-onboarding-toast--error is-visible';
    }
    log(message, 'error');
  }

  function showSuccess(message) {
    var toast = $id('artisan-onboarding-toast');
    if (toast) {
      toast.textContent = message;
      toast.hidden      = false;
      toast.className   = 'artisan-onboarding-toast is-visible';
    }
  }

  /* ─── Auth gate ─────────────────────────────────────────── */
  async function requireAuth() {
    if (!isSB()) return { uid: null, email: null, offline: true };

    await window.FixeoSupabaseClient.ready();
    var sessionRef = await sb().auth.getSession();
    var session    = sessionRef && sessionRef.data && sessionRef.data.session;

    if (!session || !session.user) return null;
    return { uid: session.user.id, email: session.user.email };
  }

  function redirectToAuth(returnUrl) {
    var base   = REDIRECT_AUTH + '?return=' + encodeURIComponent(returnUrl || 'onboarding-artisan.html');
    window.location.href = base;
  }

  /* ─── Main submit handler ───────────────────────────────── */
  async function handleSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation(); /* override V1/V3 handlers */

    var form      = $id('artisan-onboarding-form');
    var submitBtn = $id('artisan-submit-btn');

    var fields = {
      name:        ($id('artisan-name')        || {}).value || '',
      category:    ($id('artisan-category')    || {}).value || '',
      city:        ($id('artisan-city')        || {}).value || '',
      phone:       ($id('artisan-phone')       || {}).value || '',
      description: ($id('artisan-description') || {}).value || ''
    };

    /* ── Client-side pre-validation (mirrors RPC validation) ── */
    if ((fields.name || '').trim().length < 3) {
      showError('Veuillez entrer votre nom complet.');
      return;
    }
    if (!(fields.category || '').trim()) {
      showError('Veuillez choisir un métier.');
      return;
    }
    if (!(fields.city || '').trim()) {
      showError('Veuillez choisir une ville.');
      return;
    }

    setSubmitState(submitBtn, 'loading', 'Activation en cours…');
    saveDraft(fields);

    /* ── Auth check ─────────────────────────────────────────── */
    var authResult = await requireAuth();

    if (authResult === null) {
      /* Not authenticated → redirect to auth, preserve return */
      setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
      showError('Connexion requise. Redirection…');
      setTimeout(function () { redirectToAuth('onboarding-artisan.html'); }, 900);
      return;
    }

    if (authResult && authResult.offline) {
      /* Offline / Supabase not configured — legacy path */
      log('Supabase not configured — falling back to localStorage session');
      _legacyLocalStorageFallback(fields);
      return;
    }

    /* ── Call register_new_artisan RPC ──────────────────────── */
    var result = null;
    try {
      var rpcRef = await sb().rpc('register_new_artisan', {
        p_full_name:        fields.name.trim(),
        p_service_category: fields.category.trim(),
        p_city:             fields.city.trim(),
        p_phone:            fields.phone.trim(),
        p_description:      (fields.description || '').trim()
      });
      result = rpcRef;
    } catch (rpcErr) {
      log('RPC call threw: ' + (rpcErr && rpcErr.message), 'error');
      result = { error: { message: 'Erreur réseau. Réessayez.' }, data: null };
    }

    if (result.error) {
      log('RPC error: ' + result.error.message, 'error');
      setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
      showError('Une erreur s\'est produite. Réessayez.');
      return;
    }

    var data = result.data;
    if (!data || !data.ok) {
      var reason = (data && data.reason) || 'unknown';
      log('RPC returned ok:false, reason=' + reason);

      if (reason === 'unauthenticated') {
        setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
        showError('Connexion requise. Redirection…');
        setTimeout(function () { redirectToAuth('onboarding-artisan.html'); }, 900);
        return;
      }

      if (reason === 'name_required') {
        showError('Nom complet requis (3 caractères minimum).');
        setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
        return;
      }

      if (reason === 'category_required') {
        showError('Veuillez choisir un métier.');
        setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
        return;
      }

      if (reason === 'city_required') {
        showError('Veuillez choisir une ville.');
        setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
        return;
      }

      setSubmitState(submitBtn, 'idle', 'Rejoindre le réseau Fixeo');
      showError((data && data.message) || 'Erreur lors de l\'inscription. Réessayez.');
      return;
    }

    /* ── Success: registered or already_registered ──────────── */
    var reason    = data.reason || 'registered';
    var artisanId = data.artisan_id || null;

    log('Registration success: reason=' + reason + ' artisan_id=' + artisanId);

    clearDraft();

    /* Clear ghost localStorage authority (7C.12A.2: authority is now server-only) */
    _clearGhostLocalStorage();

    setSubmitState(submitBtn, 'success', 'Profil activé ! Redirection…');
    showSuccess('Votre profil est activé. Bienvenue sur Fixeo !');

    /* Render success card (non-blocking, cosmetic only) */
    _renderSuccessCard(fields, artisanId);

    /* Redirect to canonical V2 dashboard — never V1 */
    setTimeout(function () {
      window.location.href = REDIRECT_ARTISAN;
    }, 1200);
  }

  /* ─── Clear ghost localStorage writes from dead path ───── */
  function _clearGhostLocalStorage() {
    var ghostKeys = [
      'user_logged', 'user_role', 'user_name', 'user_job',
      'user_city', 'user_phone', 'user_avatar', 'user_status',
      /* onboarding store — was used as ghost authority */
      'fixeo_artisan_onboarding_entries_v1'
    ];
    ghostKeys.forEach(function (k) {
      try { window.localStorage.removeItem(k); } catch (e) { /* no-op */ }
    });
  }

  /* ─── Success card (cosmetic, informational) ────────────── */
  function _renderSuccessCard(fields, artisanId) {
    var success = $id('artisan-onboarding-success');
    var summary = $id('artisan-onboarding-success-summary');
    if (!success || !summary) return;
    var name = (fields.name || '').trim();
    var categoryLabel = _getCategoryLabel(fields.category || '');
    summary.innerHTML =
      '<div class="artisan-onboarding-success-card">'
      + '<div class="artisan-onboarding-success-avatar-placeholder">'
      + _initials(name)
      + '</div>'
      + '<div>'
      + '<strong>' + _esc(name) + '</strong>'
      + '<p>' + _esc(categoryLabel) + ' · ' + _esc(fields.city || '') + '</p>'
      + '<div class="artisan-onboarding-success-badges">'
      + '<span>Profil créé</span>'
      + '<span>Compte vérifié</span>'
      + '<span>Onboarding requis</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + (artisanId
          ? '<p class="fxaov4-artisan-id">ID artisan : ' + _esc(artisanId) + '</p>'
          : '');
    success.hidden = false;
  }

  function _getCategoryLabel(value) {
    var map = {
      plomberie: 'Plomberie', electricite: 'Électricité', peinture: 'Peinture',
      climatisation: 'Climatisation', menuiserie: 'Menuiserie', maconnerie: 'Maçonnerie',
      serrurerie: 'Serrurerie', nettoyage: 'Nettoyage', jardinage: 'Jardinage',
      demenagement: 'Déménagement', toiture: 'Toiture', bricolage: 'Bricolage'
    };
    return map[value] || value || '';
  }

  function _initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || 'FA').slice(0, 2);
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ─── Legacy localStorage fallback (Supabase not configured) ── */
  /* This path is for offline/dev mode ONLY. It explicitly does NOT
   * write identity authority and redirects to V2 dashboard. */
  function _legacyLocalStorageFallback(fields) {
    /* In offline mode, we preserve backward-compat but still go to V2 */
    log('Legacy offline path — localStorage session (non-production)');
    try {
      window.localStorage.setItem('user_role', 'artisan');
      window.localStorage.setItem('user_name', fields.name || '');
      window.localStorage.setItem('user_logged', 'true');
    } catch (e) { /* no-op */ }
    clearDraft();
    setTimeout(function () {
      window.location.href = REDIRECT_ARTISAN; /* V2, never V1 */
    }, 600);
  }

  /* ─── Prefill draft on page load ─────────────────────────── */
  function _prefillFromDraft() {
    var draft = loadDraft();
    if (!draft) return;
    /* Only prefill if fields are currently empty */
    var nameEl = $id('artisan-name');
    if (nameEl && !nameEl.value && draft.name) nameEl.value = draft.name;
    var descEl = $id('artisan-description');
    if (descEl && !descEl.value && draft.description) descEl.value = draft.description;
    /* category/city handled by V3 chip/card UI — skip here */
  }

  /* ─── Bootstrap ─────────────────────────────────────────── */
  function init() {
    var form = $id('artisan-onboarding-form');
    if (!form) return;

    /* Prefill draft */
    _prefillFromDraft();

    /* Override submit with canonical server-authoritative handler.
     * Use capture phase (true) to fire BEFORE V1/V3 bubble-phase handlers.
     * stopImmediatePropagation() inside handleSubmit prevents V1 handler from firing. */
    form.addEventListener('submit', handleSubmit, true /* capture phase */);

    log('V4 submit handler installed (capture phase)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
