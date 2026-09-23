/* Page-specific orchestration; no provisioning, storage authority or DB writes. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else factory().mount(root);
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var LABELS = Object.freeze({ owner: 'Propriétaire', admin: 'Administrateur de l’entreprise',
    operations_manager: 'Responsable des opérations', site_manager: 'Responsable de site',
    reporter: 'Rapporteur', viewer: 'Consultation' });

  function mount(win, options) {
    options = options || {};
    var doc = win.document;
    var byId = function (id) { return doc.getElementById(id); };
    var main = byId('main'), panel = byId('enterprise-workspace'), state = byId('enterprise-state');
    var title = byId('state-title'), message = byId('state-message');
    var retry = byId('enterprise-retry'), home = byId('enterprise-home'), logout = byId('enterprise-logout');
    var name = byId('enterprise-name'), company = byId('enterprise-company'), role = byId('enterprise-role');
    var navigate = options.navigate || function (path) { win.location.replace(path); };
    var waitMs = options.waitMs || 15000;
    var client = null, subscription = null, generation = 0, stopped = false, logoutPending = false;
    var logoutFailed = false, logoutProof = null;

    function clear() {
      generation++;
      panel.hidden = true;
      name.textContent = company.textContent = role.textContent = '';
    }
    function show(heading, text, canRetry, loading, focus) {
      clear(); state.hidden = false; title.textContent = heading; message.textContent = text;
      main.setAttribute('aria-busy', String(!!loading));
      retry.hidden = !canRetry; home.hidden = !!loading;
      if (focus) title.focus();
    }
    function failure() {
      show('Accès momentanément indisponible', 'Votre accès n’a pas pu être vérifié. Veuillez réessayer.', true, false, true);
    }
    function bounded(promise) {
      return new Promise(function (resolve, reject) {
        var timer = win.setTimeout(function () { reject(new Error('TIMEOUT')); }, waitMs);
        Promise.resolve(promise).then(function (value) { win.clearTimeout(timer); resolve(value); },
          function (error) { win.clearTimeout(timer); reject(error); });
      });
    }
    function listen() {
      if (subscription) return;
      if (!client.auth || typeof client.auth.onAuthStateChange !== 'function') throw new Error('AUTH_EVENTS_UNAVAILABLE');
      var registered = client.auth.onAuthStateChange(function (event) {
        // Do not await an Auth method inside the SDK callback (its lock is held).
        if (stopped || event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') {
          clear();
          if (logoutPending && logoutProof) logoutProof.signedOut = true;
          else navigate('auth.html');
          return;
        }
        if (logoutPending || logoutFailed) return;
        show('Vérification de votre accès', 'Actualisation de votre session…', false, true, false);
        win.setTimeout(function () { if (!doc.hidden) refresh(); }, 0);
      });
      subscription = registered && registered.data && registered.data.subscription;
      if (!subscription || typeof subscription.unsubscribe !== 'function') throw new Error('AUTH_EVENTS_UNAVAILABLE');
    }
    async function refresh() {
      if (stopped || logoutPending || logoutFailed) return;
      show('Ouverture de votre espace', 'Vérification de votre accès en cours…', false, true, false);
      var run = generation;
      try {
        var loader = win.FixeoSupabaseClient;
        if (!loader || !loader.CONFIGURED || !win.FixeoEnterpriseGuard) throw new Error('UNAVAILABLE');
        var ready = await bounded(loader.ready());
        if (run !== generation || stopped || doc.hidden) return;
        if (!ready || !ready.client) throw new Error('UNAVAILABLE');
        client = ready.client;
        listen();
        var target = win.FixeoEnterpriseGuard.targetFromSearch(win.location.search);
        var result = await bounded(win.FixeoEnterpriseGuard.check(client, target));
        if (run !== generation || stopped || doc.hidden) return;
        if (result.status === 'NO_SESSION') { navigate('auth.html'); return; }
        if (result.status === 'INVALID_ENTERPRISE_ID') {
          show('Lien d’accès invalide', 'Utilisez un lien contenant l’identifiant de votre entreprise.', false, false, true); return;
        }
        if (result.status === 'ACCESS_DENIED') {
          logout.hidden = false;
          show('Cet espace n’est pas accessible', 'Votre compte ne dispose pas d’un accès actif à cette entreprise.', false, false, true); return;
        }
        if (!result.allowed) { failure(); return; }
        name.textContent = company.textContent = result.enterprise.name;
        role.textContent = LABELS[result.enterprise.role];
        state.hidden = true; panel.hidden = false; logout.hidden = false;
        main.setAttribute('aria-busy', 'false'); name.focus();
      } catch (_) { if (run === generation && !stopped && !doc.hidden) failure(); }
    }
    async function signOut() {
      if (logoutPending || stopped) return;
      logoutPending = true; logoutFailed = false;
      logout.disabled = true;
      show('Déconnexion en cours', 'Fermeture de votre session…', false, true, true);
      var proof = { signedOut: false };
      logoutProof = proof;
      var completed;
      try {
        if (!client || !subscription || typeof win.fixeoGlobalLogout !== 'function') throw new Error('UNAVAILABLE');
        // The canonical function is fire-and-forget and masks SDK errors. Observe BOTH
        // actual SDK SIGNED_OUT and canonical cleanup completion before leaving.
        var completion = new Promise(function (resolve) {
          completed = resolve;
          win.addEventListener('fixeo:user:logout', completed, { once: true });
        });
        win.fixeoGlobalLogout({ skipRedirect: true });
        await bounded(completion);
        if (!proof.signedOut) throw new Error('SIGNOUT_NOT_CONFIRMED');
        var current = await bounded(client.auth.getSession());
        if (!current || current.error || !current.data || current.data.session !== null) throw new Error('SESSION_REMAINS');
        if (!stopped) navigate('index.html');
      } catch (_) {
        logoutFailed = true;
        if (!stopped) show('Déconnexion non confirmée', 'Votre espace est masqué. Réessayez de vous déconnecter avant de quitter cet appareil.', false, false, true);
      } finally {
        if (completed) win.removeEventListener('fixeo:user:logout', completed);
        logoutPending = false; logoutProof = null; logout.disabled = false;
      }
    }
    function visibility() {
      if (doc.hidden) clear();
      else refresh();
    }
    function pageHide() { clear(); }
    function pageShow(event) { if (event.persisted) refresh(); }
    retry.addEventListener('click', refresh);
    logout.addEventListener('click', signOut);
    doc.addEventListener('visibilitychange', visibility);
    win.addEventListener('pagehide', pageHide);
    win.addEventListener('pageshow', pageShow);
    refresh();
    return { refresh: refresh, destroy: function () {
      stopped = true; clear();
      if (subscription) subscription.unsubscribe();
      retry.removeEventListener('click', refresh); logout.removeEventListener('click', signOut);
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('pagehide', pageHide); win.removeEventListener('pageshow', pageShow);
    } };
  }
  return Object.freeze({ mount: mount });
});
