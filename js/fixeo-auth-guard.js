/* ================================================================
   FIXEO V14 — AUTH GUARD (js/fixeo-auth-guard.js) — ULTIMATE FIX
   ─────────────────────────────────────────────────────────────────
   CORRECTIONS V14 :
     FIX-GUARD-1 : Normalisation des rôles (admin/client/artisan)
                   → default "client" si rôle manquant ou invalide
     FIX-GUARD-2 : Protection admin renforcée : vérifier user + role
                   + flag fixeo_admin + sessionStorage
     FIX-GUARD-3 : Redirection dashboard selon rôle :
                   admin    → admin.html
                   artisan  → dashboard-artisan.html
                   client   → dashboard-client.html
     FIX-GUARD-4 : Éviter les boucles de redirection
   ================================================================ */
(function () {
  'use strict';

  function normalizeRole(value) {
    value = String(value || '').toLowerCase();
    return ['admin', 'artisan', 'client'].indexOf(value) !== -1 ? value : 'client';
  }

  function hydrateFromSupabaseStorage() {
    try {
      if (localStorage.getItem('fixeo_user') && localStorage.getItem('fixeo_role')) return;
      var env = window.FIXEO_ENV || {};
      var refMatch = String(env.SUPABASE_URL || '').match(/^https:\/\/([^.]+)\.supabase\.co/i);
      var keys = [];
      if (refMatch) keys.push('sb-' + refMatch[1] + '-auth-token');
      Object.keys(localStorage).forEach(function (key) {
        if (/^sb-.*-auth-token$/.test(key) && keys.indexOf(key) === -1) keys.push(key);
      });
      for (var i = 0; i < keys.length; i++) {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        var session = null;
        if (parsed && parsed.user) session = parsed;
        if (!session && parsed && parsed.currentSession && parsed.currentSession.user) session = parsed.currentSession;
        if (!session && Array.isArray(parsed)) {
          for (var j = 0; j < parsed.length; j++) {
            if (parsed[j] && parsed[j].user) { session = parsed[j]; break; }
          }
        }
        if (session && session.user) {
          var email = session.user.email || session.user.id || '';
          var roleValue = normalizeRole((session.user.user_metadata && session.user.user_metadata.role) || 'client');
          var name = (session.user.user_metadata && session.user.user_metadata.full_name) || (email.indexOf('@') > -1 ? email.split('@')[0] : 'Utilisateur');
          localStorage.setItem('fixeo_user', email);
          localStorage.setItem('fixeo_user_name', name);
          localStorage.setItem('fixeo_role', roleValue);
          localStorage.setItem('role', roleValue);
          localStorage.setItem('user', JSON.stringify({ id: session.user.id, name: name, role: roleValue, email: email }));
          break;
        }
      }
    } catch (e) {}
  }

  hydrateFromSupabaseStorage();

  var user  = localStorage.getItem('fixeo_user')  || '';
  var role  = localStorage.getItem('fixeo_role')  || localStorage.getItem('role') || '';
  var admin = localStorage.getItem('fixeo_admin') === '1';
  var sess  = sessionStorage.getItem('fixeo_admin_auth') === '1';

  /* ── FIX-GUARD-0 : Lire aussi l'objet normalisé 'user' (JSON) si clés fixeo_* absentes ── */
  if (!user) {
    try {
      var userJSON = localStorage.getItem('user');
      if (userJSON) {
        var userObj = JSON.parse(userJSON);
        if (userObj && userObj.id) {
          user = userObj.id;
          if (!role && userObj.role) {
            role = userObj.role;
            localStorage.setItem('fixeo_role', role);
            localStorage.setItem('role', role);
          }
        }
      }
    } catch(e) {}
  }

  var page  = window.location.pathname.split('/').pop() || 'index.html';

  /* ── FIX-GUARD-1 : Normalisation du rôle ──────────────────── */
  var VALID_ROLES = ['admin', 'artisan', 'client'];

  if (user && !VALID_ROLES.includes(role)) {
    /* Rôle manquant ou invalide → default 'client'
       Exception : si l'utilisateur EST l'admin par email */
    var isAdminEmail = user.toLowerCase() === 'admin@fixeo.com';
    role = isAdminEmail ? 'admin' : 'client';
    localStorage.setItem('fixeo_role', role);
    localStorage.setItem('role', role);
    /* Si admin par email mais sans flags → ajouter les flags */
    if (isAdminEmail) {
      localStorage.setItem('fixeo_admin', '1');
    }
  }

  /* ── Pages nécessitant une connexion quelconque ─────────────── */
  var requiresLogin = ['dashboard-client.html', 'dashboard-artisan.html'];
  /* Pages nécessitant un rôle admin */
  var requiresAdmin = ['admin.html'];
  /* Pages nécessitant un rôle artisan */
  var requiresArtisan = ['dashboard-artisan.html'];
  /* Pages nécessitant un rôle client */
  var requiresClient = ['dashboard-client.html'];

  /* ── FIX-GUARD-4 : Éviter les boucles ───────────────────────── */
  var REDIRECT_PAGES = ['auth.html', 'index.html'];
  if (REDIRECT_PAGES.indexOf(page) !== -1) return; // déjà sur une page de sortie

  /* ── Redirection si non connecté ─────────────────────────── */
  if (requiresLogin.indexOf(page) !== -1 && !user) {
    window.location.replace('auth.html');
    return;
  }

  /* ── FIX-GUARD-2 : Protection admin renforcée ──────────────── */
  if (requiresAdmin.indexOf(page) !== -1) {
    var isAdmin = (role === 'admin') && (admin || sess);
    if (!isAdmin) {
      /* Non-admin : rediriger vers l'accueil */
      window.location.replace('index.html');
      return;
    }
  }

  /* ── FIX-GUARD-3 : Redirection dashboard selon rôle ─────────── */
  if (page === 'dashboard-artisan.html' && user && role !== 'artisan' && role !== 'admin') {
    window.location.replace('dashboard-client.html');
    return;
  }
  if (page === 'dashboard-client.html' && user && role === 'artisan') {
    window.location.replace('dashboard-artisan.html');
    return;
  }

})();
