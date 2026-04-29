/**
 * FIXEO — Auth Supabase Foundation v2.0
 * ======================================
 * Real Supabase authentication — Phase 1
 *
 * Supabase mode (CONFIGURED=true):
 *   signUp  → sb().auth.signUp  → insert public.users → insert public.profiles
 *   signIn  → sb().auth.signInWithPassword → fetch role from public.users
 *   signOut → sb().auth.signOut
 *   resetPassword → sb().auth.resetPasswordForEmail
 *
 * Offline / localStorage fallback (CONFIGURED=false):
 *   Same localStorage-based simulation as before.
 *   Admin SHA-256 path in auth.html is a separate emergency bypass.
 *
 * DB write order (FK chain):
 *   auth.users (Supabase internal) → public.users → public.profiles
 *   Both writes use the authenticated JWT returned by signUp/signIn,
 *   so RLS policy "auth.uid() = id" is satisfied.
 *
 * Tables targeted:
 *   - public.users    (id, email, full_name, phone, role, city, created_at)
 *   - public.profiles (id, role, full_name, phone, city, created_at)
 *   NOT public.users via anon — only via authenticated session after signup
 *
 * v2.0 changes (2026-04-29):
 *   - signUp: writes to public.users then public.profiles (not users-only)
 *   - signIn: reads role from public.users (with FK-safe fallback to user_metadata)
 *   - resetPassword: new function — real Supabase password reset email
 *   - _setLocalSession: added fixeo_user_name + user + role keys (header-unified compat)
 */
;(function (window) {
  'use strict';

  var VERSION = '2.0';

  function isSB() { return !!(window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED); }
  function sb()    { return window.FixeoSupabaseClient && window.FixeoSupabaseClient.client; }
  function log(msg, lvl) {
    var fn = lvl === 'error' ? console.error : console.log;
    fn('[FixeoAuth v2]', msg);
  }

  /* ── Role → redirect map ─────────────────────────────────── */
  var ROLE_REDIRECT = {
    admin:   'admin.html',
    artisan: 'dashboard-artisan.html',
    client:  'dashboard-client.html'
  };

  /* ══════════════════════════════════════════════════════════
   * SIGN UP
   * Creates: auth.users → public.users → public.profiles
   * ══════════════════════════════════════════════════════════ */
  async function signUp(opts) {
    var email    = (opts.email    || '').trim().toLowerCase();
    var password =  opts.password || '';
    var role     = (opts.role     || 'client').toLowerCase();
    var fullName =  opts.full_name || opts.name || '';
    var phone    =  opts.phone    || '';
    var city     =  opts.city     || '';

    if (!email || !password) return { user: null, error: { message: 'Email et mot de passe requis.' } };

    if (isSB()) {
      await window.FixeoSupabaseClient.ready();

      /* Step 1: Create auth user */
      var _ref = await sb().auth.signUp({
        email:    email,
        password: password,
        options: {
          data: { full_name: fullName, phone: phone, role: role }
        }
      });
      var user  = _ref.data && _ref.data.user;
      var error = _ref.error;
      if (error) return { user: null, error: error };
      if (!user) return { user: null, error: { message: 'Inscription échouée. Vérifiez votre email.' } };

      /* Step 2: Insert into public.users (authenticated JWT auto-used by client) */
      var _ref2 = await sb().from('users').insert([{
        id:         user.id,
        email:      email,
        full_name:  fullName,
        phone:      phone,
        role:       role,
        city:       city,
        created_at: new Date().toISOString()
      }]);
      if (_ref2.error) {
        /* Non-fatal: log and continue — user is created in auth.users */
        log('signUp: public.users insert error: ' + _ref2.error.message, 'error');
      }

      /* Step 3: Insert into public.profiles (requires public.users FK satisfied) */
      var _ref3 = await sb().from('profiles').insert([{
        id:         user.id,
        role:       role,
        full_name:  fullName,
        phone:      phone,
        city:       city,
        created_at: new Date().toISOString()
      }]);
      if (_ref3.error) {
        log('signUp: public.profiles insert error: ' + _ref3.error.message, 'error');
      }

      _setLocalSession({ id: user.id, email: email, role: role, name: fullName, phone: phone });
      log('signUp: success — ' + email + ' (' + role + ')');
      return { user: Object.assign({}, user, { role: role }), error: null };
    }

    /* Offline fallback */
    var uid = 'local-' + Date.now();
    _setLocalSession({ id: uid, email: email, role: role, name: fullName, phone: phone });
    log('signUp: offline mode — ' + email);
    return { user: { id: uid, email: email, role: role }, error: null };
  }

  /* ══════════════════════════════════════════════════════════
   * SIGN IN
   * Reads role from public.users; falls back to user_metadata
   * ══════════════════════════════════════════════════════════ */
  async function signIn(opts) {
    var email    = (opts.email    || '').trim().toLowerCase();
    var password =  opts.password || '';

    if (!email || !password) return { user: null, error: { message: 'Email et mot de passe requis.' } };

    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.signInWithPassword({ email: email, password: password });
      var user  = _ref.data && _ref.data.user;
      var error = _ref.error;
      if (error) return { user: null, error: error };
      if (!user) return { user: null, error: { message: 'Connexion échouée.' } };

      /* Fetch role + name from public.users (authenticated — RLS satisfied) */
      var role     = 'client';
      var fullName = '';
      var _ref2 = await sb().from('users').select('role, full_name').eq('id', user.id).maybeSingle();
      if (_ref2.data) {
        role     = _ref2.data.role     || role;
        fullName = _ref2.data.full_name || fullName;
      } else {
        /* Fallback: user_metadata set at signup */
        var meta = user.user_metadata || {};
        role     = meta.role      || role;
        fullName = meta.full_name  || '';
      }

      _setLocalSession({ id: user.id, email: email, role: role, name: fullName });
      log('signIn: success — ' + email + ' role=' + role);
      return { user: Object.assign({}, user, { role: role, full_name: fullName }), error: null };
    }

    /* Offline fallback */
    var knownAdmin = localStorage.getItem('fixeo_admin') === '1' &&
                     (localStorage.getItem('fixeo_user') === email || email.includes('admin'));
    var role = knownAdmin ? 'admin' : (localStorage.getItem('fixeo_role') || 'client');
    _setLocalSession({ id: localStorage.getItem('user_id') || 'local-' + Date.now(), email: email, role: role });
    log('signIn: offline mode — role=' + role);
    return { user: { id: localStorage.getItem('user_id'), email: email, role: role }, error: null };
  }

  /* ══════════════════════════════════════════════════════════
   * RESET PASSWORD
   * Sends Supabase password reset email
   * ══════════════════════════════════════════════════════════ */
  async function resetPassword(email) {
    email = (email || '').trim().toLowerCase();
    if (!email) return { error: { message: 'Veuillez entrer votre adresse email.' } };

    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      /* redirectTo: after clicking the reset link, Supabase redirects here */
      var redirectTo = window.location.origin + '/auth.html#reset-password';
      var _ref = await sb().auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      if (_ref.error) return { error: _ref.error };
      log('resetPassword: email sent to ' + email);
      return { error: null };
    }

    /* Offline: can't send email — inform user */
    return { error: { message: 'Réinitialisation non disponible en mode hors-ligne.' } };
  }

  /* ══════════════════════════════════════════════════════════
   * SIGN OUT
   * ══════════════════════════════════════════════════════════ */
  async function signOut() {
    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.signOut();
      if (_ref.error) log('signOut error: ' + _ref.error.message, 'error');
    }
    _clearLocalSession();
    log('signOut: done');
    return { error: null };
  }

  /* ══════════════════════════════════════════════════════════
   * SESSION / USER
   * ══════════════════════════════════════════════════════════ */
  async function getSession() {
    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.getSession();
      return (_ref.data && _ref.data.session) || null;
    }
    var uid = localStorage.getItem('fixeo_user_id') || localStorage.getItem('user_id');
    if (!uid) return null;
    return { user: { id: uid, email: localStorage.getItem('fixeo_user') || '', role: localStorage.getItem('fixeo_role') || 'client' } };
  }

  async function getCurrentUser() {
    var session = await getSession();
    return (session && session.user) || null;
  }

  /* ── Auth state change listener ─────────────────────────── */
  function onAuthStateChange(callback) {
    if (isSB() && sb()) {
      sb().auth.onAuthStateChange(function(event, session) {
        var user = session && session.user || null;
        if (user) _syncRoleFromMeta(user);
        callback(event, user);
      });
      return;
    }
    var uid = localStorage.getItem('user_id');
    callback(uid ? 'SIGNED_IN' : 'SIGNED_OUT', uid ? { id: uid, role: localStorage.getItem('fixeo_role') } : null);
  }

  /* ── Redirect after login ────────────────────────────────── */
  function redirectByRole(role) {
    window.location.href = ROLE_REDIRECT[role] || 'index.html';
  }

  /* ── Internal helpers ────────────────────────────────────── */
  function _setLocalSession(s) {
    /* Keys required by header-unified.js and auth-global.js */
    localStorage.setItem('user_id',          s.id    || '');
    localStorage.setItem('fixeo_user',        s.email || '');
    localStorage.setItem('fixeo_role',        s.role  || 'client');
    localStorage.setItem('fixeo_user_name',   s.name  || '');
    localStorage.setItem('user_name',         s.name  || '');
    localStorage.setItem('role',              s.role  || 'client');
    localStorage.setItem('user', JSON.stringify({
      id:   s.id    || '',
      name: s.name  || '',
      role: s.role  || 'client'
    }));
    if (s.role === 'admin') {
      localStorage.setItem('fixeo_admin', '1');
      sessionStorage.setItem('fixeo_admin_auth', '1');
    } else {
      localStorage.removeItem('fixeo_admin');
      sessionStorage.removeItem('fixeo_admin_auth');
    }
    if (s.phone) localStorage.setItem('user_phone', s.phone);
    window.dispatchEvent(new CustomEvent('fixeo:auth:changed', { detail: s }));
  }

  function _clearLocalSession() {
    var keys = [
      'user_id','fixeo_user','fixeo_role','user_name','user_phone',
      'fixeo_admin','fixeo_logged','fixeo_user_id','fixeo_token',
      'fixeo_session','fixeo_logged_in','fixeo_user_name','role','user'
    ];
    keys.forEach(function(k) { try { localStorage.removeItem(k); } catch (_) {} });
    try { sessionStorage.removeItem('fixeo_admin_auth'); } catch (_) {}
  }

  function _syncRoleFromMeta(user) {
    var meta = user.user_metadata || {};
    if (meta.role) localStorage.setItem('fixeo_role', meta.role);
  }

  /* ── Wire auth.html form handlers (secondary wiring path) ─── */
  /* Note: auth.html inline JS now calls FixeoAuth directly.
     This _wireAuthForms is preserved as a fallback safety net
     in case auth.html inline handlers are not present. */
  function _wireAuthForms() {
    /* intentionally minimal — auth.html inline JS is primary */
  }

  /* ── Auto-wire on auth.html ──────────────────────────────── */
  if (window.location.pathname.toLowerCase().includes('auth')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _wireAuthForms);
    } else {
      setTimeout(_wireAuthForms, 100);
    }
  }

  /* ── Listen for Supabase ready ───────────────────────────── */
  window.addEventListener('fixeo:supabase:ready', function() {
    log('Supabase ready');
    onAuthStateChange(function(event, user) {
      if (event === 'SIGNED_IN' && user) {
        log('Auth state: SIGNED_IN — ' + (user.email || user.id));
      }
    });
  });

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoAuth = {
    version:           VERSION,
    signUp:            signUp,
    signIn:            signIn,
    signOut:           signOut,
    resetPassword:     resetPassword,
    getSession:        getSession,
    getCurrentUser:    getCurrentUser,
    onAuthStateChange: onAuthStateChange,
    redirectByRole:    redirectByRole,
    isConfigured:      isSB
  };

  console.info('[FixeoAuth v2] Ready — ' + (isSB() ? 'Supabase mode' : 'localStorage mode'));

})(window);
