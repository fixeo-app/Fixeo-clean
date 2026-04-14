/**
 * FIXEO — Auth Supabase Foundation v1.0
 * ======================================
 * Hooks d'authentification.
 *
 * Si Supabase est configuré:
 *   signUp / signIn / signOut → Supabase Auth
 *   session → JWT dans localStorage via Supabase SDK
 *
 * Sinon (mode offline/localStorage):
 *   signIn / signUp → session localStorage simulée
 *   Compatible avec auth-global.js existant
 *
 * Usage:
 *   const { user, error } = await FixeoAuth.signIn({ email, password })
 *   const { user, error } = await FixeoAuth.signUp({ email, password, full_name, role })
 *   await FixeoAuth.signOut()
 *   const session = await FixeoAuth.getSession()
 *   const user    = await FixeoAuth.getCurrentUser()
 */
;(function (window) {
  'use strict';

  var VERSION = '1.0';

  function isSB() { return !!(window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED); }
  function sb()    { return window.FixeoSupabaseClient && window.FixeoSupabaseClient.client; }
  function log(msg, lvl) {
    var fn = lvl === 'error' ? console.error : console.log;
    fn('[FixeoAuth]', msg);
  }

  /* ── Role → redirect map ─────────────────────────────────── */
  var ROLE_REDIRECT = {
    admin:   'admin.html',
    artisan: 'dashboard-artisan.html',
    client:  'dashboard-client.html'
  };

  /* ══════════════════════════════════════════════════════════
   * SIGN UP
   * ══════════════════════════════════════════════════════════ */
  async function signUp(opts) {
    // opts: { email, password, full_name, phone, role, city }
    var email    = (opts.email    || '').trim().toLowerCase();
    var password = opts.password  || '';
    var role     = opts.role      || 'client';
    var fullName = opts.full_name || opts.name || '';
    var phone    = opts.phone     || '';

    if (!email || !password) return { user: null, error: { message: 'Email et mot de passe requis.' } };

    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.signUp({
        email:    email,
        password: password,
        options: {
          data: { full_name: fullName, phone: phone, role: role }
        }
      });
      var user = _ref.data && _ref.data.user;
      var error = _ref.error;
      if (error) return { user: null, error: error };

      // Insert profile into users table
      if (user) {
        var _ref2 = await sb().from('users').insert([{
          id:        user.id,
          email:     email,
          full_name: fullName,
          phone:     phone,
          role:      role,
          created_at: new Date().toISOString()
        }]);
        if (_ref2.error) log('signUp: users table insert error: ' + _ref2.error.message, 'error');
      }

      _setLocalSession({ id: user && user.id, email: email, role: role, name: fullName });
      log('signUp: success — ' + email + ' (' + role + ')');
      return { user: user, error: null };
    }

    // Offline mode — simulate registration
    var uid = 'local-' + Date.now();
    _setLocalSession({ id: uid, email: email, role: role, name: fullName, phone: phone });
    log('signUp: offline mode — session set for ' + email);
    return { user: { id: uid, email: email, role: role }, error: null };
  }

  /* ══════════════════════════════════════════════════════════
   * SIGN IN
   * ══════════════════════════════════════════════════════════ */
  async function signIn(opts) {
    // opts: { email, password } or { phone, password }
    var email    = (opts.email    || '').trim().toLowerCase();
    var password = opts.password  || '';

    if (!email || !password) return { user: null, error: { message: 'Email et mot de passe requis.' } };

    if (isSB()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.signInWithPassword({ email: email, password: password });
      var session = _ref.data && _ref.data.session;
      var user    = _ref.data && _ref.data.user;
      var error   = _ref.error;
      if (error) return { user: null, error: error };

      // Fetch role from users table
      var _ref2 = await sb().from('users').select('role, full_name, phone').eq('id', user.id).single();
      var profile = _ref2.data;
      var role = (profile && profile.role) || (user.user_metadata && user.user_metadata.role) || 'client';

      _setLocalSession({ id: user.id, email: email, role: role, name: (profile && profile.full_name) || '' });
      log('signIn: success — ' + email + ' role=' + role);
      return { user: Object.assign({}, user, { role: role }), error: null };
    }

    // Offline fallback — look up admin/demo credentials from localStorage
    var knownAdmin = localStorage.getItem('fixeo_admin') === '1' &&
                     (localStorage.getItem('fixeo_user') === email ||
                      email.includes('admin'));
    var role = knownAdmin ? 'admin' : (localStorage.getItem('fixeo_role') || 'client');

    _setLocalSession({ id: localStorage.getItem('user_id') || 'local-' + Date.now(), email: email, role: role });
    log('signIn: offline mode — role=' + role);
    return { user: { id: localStorage.getItem('user_id'), email: email, role: role }, error: null };
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
    // Offline session
    var uid = localStorage.getItem('fixeo_user_id') || localStorage.getItem('user_id');
    if (!uid) return null;
    return {
      user: {
        id:    uid,
        email: localStorage.getItem('fixeo_user') || '',
        role:  localStorage.getItem('fixeo_role')  || 'client'
      }
    };
  }

  async function getCurrentUser() {
    var session = await getSession();
    return session && session.user || null;
  }

  /* ── Auth state change listener ─────────────────────────── */
  function onAuthStateChange(callback) {
    if (isSB() && sb()) {
      sb().auth.onAuthStateChange(function(event, session) {
        var user = session && session.user || null;
        if (user) _syncRoleFromSession(user);
        callback(event, user);
      });
      return;
    }
    // localStorage — fire once with current state
    var uid = localStorage.getItem('user_id');
    callback(uid ? 'SIGNED_IN' : 'SIGNED_OUT', uid ? { id: uid, role: localStorage.getItem('fixeo_role') } : null);
  }

  /* ── Redirect after login ────────────────────────────────── */
  function redirectByRole(role) {
    var dest = ROLE_REDIRECT[role] || 'index.html';
    window.location.href = dest;
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function _setLocalSession(s) {
    localStorage.setItem('user_id',     s.id    || '');
    localStorage.setItem('fixeo_user',  s.email || '');
    localStorage.setItem('fixeo_role',  s.role  || 'client');
    localStorage.setItem('user_name',   s.name  || '');
    if (s.role === 'admin') {
      localStorage.setItem('fixeo_admin', '1');
      sessionStorage.setItem('fixeo_admin_auth', '1');
    }
    if (s.phone) localStorage.setItem('user_phone', s.phone);
    window.dispatchEvent(new CustomEvent('fixeo:auth:changed', { detail: s }));
  }

  function _clearLocalSession() {
    var keys = ['user_id','fixeo_user','fixeo_role','user_name','user_phone',
                'fixeo_admin','fixeo_logged','fixeo_user_id','fixeo_token',
                'fixeo_session','fixeo_logged_in'];
    keys.forEach(function(k){ try { localStorage.removeItem(k); } catch (_) {} });
    try { sessionStorage.removeItem('fixeo_admin_auth'); } catch (_) {}
  }

  function _syncRoleFromSession(user) {
    // When Supabase fires auth event, sync role to localStorage
    var meta = user.user_metadata || {};
    if (meta.role) localStorage.setItem('fixeo_role', meta.role);
  }

  /* ── Wire auth.html form handlers ───────────────────────── */
  function _wireAuthForms() {
    var loginForm  = document.getElementById('login-form');
    var signupForm = document.getElementById('signup-form');

    if (loginForm && !loginForm._wiredBySupabase) {
      loginForm._wiredBySupabase = true;
      loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = document.getElementById('login-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }

        var email    = (document.getElementById('login-email')?.value    || '').trim();
        var password = (document.getElementById('login-password')?.value || '').trim();
        var role     = document.getElementById('userRole')?.value || 'client';

        var _ref = await signIn({ email: email, password: password });
        var error = _ref.error;

        if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }

        var errEl = document.getElementById('login-error');
        if (error) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = error.message || 'Erreur de connexion.'; }
          return;
        }
        if (errEl) errEl.style.display = 'none';

        var user = _ref.user;
        var userRole = (user && user.role) || role;
        redirectByRole(userRole);
      });
      log('wireAuthForms: login-form wired');
    }

    if (signupForm && !signupForm._wiredBySupabase) {
      signupForm._wiredBySupabase = true;
      signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var btn = document.getElementById('signup-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Création…'; }

        var fullName = (document.getElementById('signup-name')?.value  || '').trim();
        var email    = (document.getElementById('signup-email')?.value || '').trim();
        var phone    = (document.getElementById('signup-phone')?.value || '').trim();
        var password = (document.getElementById('signup-password')?.value || '').trim();
        var role     = document.getElementById('signup-type')?.value || 'client';

        var _ref = await signUp({ email: email, password: password, full_name: fullName, phone: phone, role: role });
        var error = _ref.error;

        if (btn) { btn.disabled = false; btn.textContent = 'Créer mon compte'; }

        var errEl = document.getElementById('signup-error');
        if (error) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = error.message || 'Erreur inscription.'; }
          return;
        }
        if (errEl) errEl.style.display = 'none';

        var user = _ref.user;
        redirectByRole((user && user.role) || role);
      });
      log('wireAuthForms: signup-form wired');
    }
  }

  /* ── Auto-wire on auth.html ──────────────────────────────── */
  if (window.location.pathname.toLowerCase().includes('auth')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _wireAuthForms);
    } else {
      setTimeout(_wireAuthForms, 100);
    }
  }

  /* ── Listen for Supabase ready, then re-init ─────────────── */
  window.addEventListener('fixeo:supabase:ready', function() {
    log('Supabase ready — re-checking auth state');
    onAuthStateChange(function(event, user) {
      if (event === 'SIGNED_IN' && user) {
        log('Auth state change: SIGNED_IN — ' + (user.email || user.id));
      }
    });
  });

  /* ── Public API ─────────────────────────────────────────── */
  window.FixeoAuth = {
    version:         VERSION,
    signUp:          signUp,
    signIn:          signIn,
    signOut:         signOut,
    getSession:      getSession,
    getCurrentUser:  getCurrentUser,
    onAuthStateChange: onAuthStateChange,
    redirectByRole:  redirectByRole,
    isConfigured:    isSB
  };

  console.info('[FixeoAuth] Ready — ' + (isSB() ? 'Supabase mode' : 'localStorage mode'));

})(window);
