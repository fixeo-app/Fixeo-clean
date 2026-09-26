/* FIXEO Auth Phase 2C.1 — workspace selector.
 * Re-resolves on every load; browser storage and DOM are never authorization authorities.
 */
(function () {
  'use strict';

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var ROLE_LABELS = Object.freeze({
    owner: 'Propriétaire', admin: 'Administrateur', operations_manager: 'Responsable opérations',
    site_manager: 'Responsable de site', reporter: 'Reporting', viewer: 'Lecture'
  });
  var GLOBAL = Object.freeze({
    admin: Object.freeze({ label: 'Administration FIXEO', destination: 'admin.html' }),
    artisan: Object.freeze({ label: 'Espace Artisan', destination: 'dashboard-artisan-v2.html' }),
    client: Object.freeze({ label: 'Espace Client', destination: 'dashboard-client.html' })
  });
  var WAIT_MS = 15000;
  var generation = 0;

  function q(id) { return document.getElementById(id); }
  function clearList() { var list = q('workspace-list'); while (list && list.firstChild) list.removeChild(list.firstChild); }
  function setState(title, message, retry) {
    q('workspace-state').hidden = false;
    q('workspace-content').hidden = true;
    q('workspace-title').textContent = title;
    q('workspace-message').textContent = message;
    q('workspace-retry').hidden = !retry;
    clearList();
  }
  function addCard(label, meta, href, kind) {
    var a = document.createElement('a');
    a.className = 'fxws-card';
    a.href = href;
    a.dataset.kind = kind;
    var strong = document.createElement('strong'); strong.textContent = label;
    var span = document.createElement('span'); span.textContent = meta;
    var arrow = document.createElement('b'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
    a.append(strong, span, arrow); q('workspace-list').appendChild(a);
  }
  function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('WORKSPACE_RESOLUTION_TIMEOUT')); }, WAIT_MS);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer); resolve(value);
      }, function (error) {
        clearTimeout(timer); reject(error);
      });
    });
  }

  function render(access) {
    clearList();
    var global = access.global_space;
    var globalContract = global && GLOBAL[global.type];
    if (!globalContract || global.destination !== globalContract.destination) throw new Error('GLOBAL_SPACE_INVALID');
    addCard(globalContract.label, 'Votre espace personnel FIXEO', globalContract.destination, 'global');

    (access.enterprise_spaces || []).forEach(function (space) {
      var id = String(space && space.enterprise_id || '');
      var role = String(space && space.member_role || '');
      if (!space || space.type !== 'enterprise' || !UUID_RE.test(id) || !ROLE_LABELS[role] || !String(space.enterprise_name || '').trim()) return;
      addCard(String(space.enterprise_name), ROLE_LABELS[role], 'dashboard-enterprise.html?enterprise_id=' + encodeURIComponent(id), 'enterprise');
    });

    q('workspace-state').hidden = true;
    q('workspace-content').hidden = false;
    q('workspace-heading').focus();
  }

  async function refresh() {
    var current = ++generation;
    setState('Ouverture de vos espaces', 'Vérification de vos accès en cours…', false);
    try {
      if (!window.FixeoSupabaseClient || !window.FixeoAuthResolver) throw new Error('AUTH_RUNTIME_UNAVAILABLE');
      if (window.FixeoSupabaseClient.ready) await withTimeout(window.FixeoSupabaseClient.ready());
      var client = window.FixeoSupabaseClient.client;
      var access = await withTimeout(window.FixeoAuthResolver.resolve(client));
      if (current !== generation) return;
      if (access && (access.status === 'NO_SESSION' || access.status === 'INVALID_SESSION')) {
        window.location.href = 'auth.html';
        return;
      }
      if (!access || access.ok !== true || access.status !== 'OK') {
        setState('Accès momentanément indisponible', 'Impossible de vérifier vos espaces FIXEO. Réessayez.', true);
        return;
      }
      if (!Array.isArray(access.enterprise_spaces) || access.enterprise_spaces.length === 0) {
        var global = access.global_space;
        var contract = global && GLOBAL[global.type];
        window.location.href = contract && global.destination === contract.destination ? contract.destination : 'index.html';
        return;
      }
      render(access);
    } catch (_) {
      if (current !== generation) return;
      setState('Accès momentanément indisponible', 'Impossible de vérifier vos espaces FIXEO. Réessayez.', true);
    }
  }

  async function logout() {
    generation++;
    clearList();
    q('workspace-content').hidden = true;
    if (typeof window.fixeoGlobalLogout !== 'function') {
      setState('Déconnexion indisponible', 'Impossible de confirmer la déconnexion. Réessayez.', true);
      return;
    }
    try {
      await window.fixeoGlobalLogout({ skipRedirect: true });
    } catch (_) {
      setState('Déconnexion non confirmée', 'Impossible de confirmer la déconnexion. Réessayez.', true);
      return;
    }
    window.location.href = 'index.html';
  }

  document.addEventListener('DOMContentLoaded', function () {
    q('workspace-retry').addEventListener('click', refresh);
    q('workspace-logout').addEventListener('click', logout);
    refresh();
  });
})();
