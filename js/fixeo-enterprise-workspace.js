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
    var dataState = byId('enterprise-data-state'), dataMessage = byId('enterprise-data-message');
    var dataRetry = byId('enterprise-data-retry'), sitesList = byId('enterprise-sites-list');
    var interventionsList = byId('enterprise-interventions-list'), sitesEmpty = byId('enterprise-sites-empty');
    var interventionsEmpty = byId('enterprise-interventions-empty');
    var sitesCount = byId('enterprise-sites-count'), interventionsCount = byId('enterprise-interventions-count');
    var siteCreate = byId('enterprise-site-create'), sitesMode = byId('enterprise-sites-mode');
    var siteDialog = byId('enterprise-site-dialog'), siteDialogTitle = byId('enterprise-site-dialog-title');
    var siteClose = byId('enterprise-site-close'), siteCancel = byId('enterprise-site-cancel');
    var siteForm = byId('enterprise-site-form'), siteId = byId('enterprise-site-id');
    var siteName = byId('enterprise-site-name'), siteCity = byId('enterprise-site-city');
    var siteCode = byId('enterprise-site-code'), siteAddress = byId('enterprise-site-address');
    var siteSubmit = byId('enterprise-site-submit'), siteFormError = byId('enterprise-site-form-error');
    var currentEnterpriseId = '', currentEnterpriseRole = '', currentSites = [];
    var navigate = options.navigate || function (path) { win.location.replace(path); };
    var waitMs = options.waitMs || 15000;
    var client = null, subscription = null, generation = 0, stopped = false, logoutPending = false;
    var logoutFailed = false, logoutProof = null;

    function clear() {
      generation++;
      panel.hidden = true;
      currentEnterpriseId = '';
      currentEnterpriseRole = '';
      currentSites = [];
      if (siteCreate) siteCreate.hidden = true;
      if (sitesMode) sitesMode.textContent = 'Lecture seule';
      if (siteDialog) siteDialog.hidden = true;
      name.textContent = company.textContent = role.textContent = '';
      if (sitesList) sitesList.replaceChildren();
      if (interventionsList) interventionsList.replaceChildren();
      if (sitesCount) sitesCount.textContent = '—';
      if (interventionsCount) interventionsCount.textContent = '—';
      if (sitesEmpty) sitesEmpty.hidden = true;
      if (interventionsEmpty) interventionsEmpty.hidden = true;
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

    function text(value) { return String(value == null ? '' : value).trim(); }
    function label(value) {
      var v = text(value).replace(/[_-]+/g, ' ');
      return v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Non renseigné';
    }
    function dateLabel(value) {
      if (!value) return '';
      var d = new Date(value);
      return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    }
    function el(tag, cls, content) {
      var node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (content != null) node.textContent = content;
      return node;
    }
    function canManageSites() {
      return !!(win.FixeoEnterpriseSiteActions &&
        typeof win.FixeoEnterpriseSiteActions.canManage === 'function' &&
        win.FixeoEnterpriseSiteActions.canManage(currentEnterpriseRole));
    }
    function renderSites(rows) {
      currentSites = rows.slice();
      sitesList.replaceChildren();
      sitesCount.textContent = String(rows.length);
      sitesEmpty.hidden = rows.length !== 0;
      rows.forEach(function (site) {
        var card = el('article', 'fxew-site-card');
        card.dataset.siteId = site.id;
        var top = el('div', 'fxew-site-top');
        var copy = el('div');
        copy.append(el('strong', '', site.name || 'Site sans nom'));
        copy.append(el('span', '', [site.site_code, site.city].filter(Boolean).join(' · ') || 'Localisation non renseignée'));
        top.append(copy, el('span', 'fxew-status', label(site.status)));
        card.append(top);
        if (site.address_line) card.append(el('p', 'fxew-site-address', site.address_line));
        if (canManageSites()) {
          var actions = el('div', 'fxew-site-actions');
          var edit = el('button', 'fxew-site-action', 'Modifier');
          edit.type = 'button'; edit.dataset.siteAction = 'edit'; edit.dataset.siteId = site.id;
          var toggle = el('button', 'fxew-site-action', site.status === 'active' ? 'Désactiver' : 'Activer');
          toggle.type = 'button'; toggle.dataset.siteAction = 'status'; toggle.dataset.siteId = site.id;
          toggle.dataset.nextStatus = site.status === 'active' ? 'inactive' : 'active';
          actions.append(edit, toggle); card.append(actions);
        }
        sitesList.append(card);
      });
    }
    function renderInterventions(rows) {
      interventionsList.replaceChildren();
      interventionsCount.textContent = String(rows.length);
      interventionsEmpty.hidden = rows.length !== 0;
      rows.forEach(function (item) {
        var card = el('article', 'fxew-intervention');
        var mainRow = el('div', 'fxew-intervention-main');
        var copy = el('div');
        copy.append(el('strong', '', label(item.service_category)));
        copy.append(el('span', '', [item.site_name, item.city].filter(Boolean).join(' · ') || 'Site non renseigné'));
        mainRow.append(copy, el('span', 'fxew-status', label(item.request_status)));
        card.append(mainRow);
        var meta = el('div', 'fxew-intervention-meta');
        meta.append(el('span', '', item.urgency ? 'Urgence · ' + label(item.urgency) : 'Urgence · Non renseignée'));
        meta.append(el('span', '', item.mission_status ? 'Mission · ' + label(item.mission_status) : 'Mission · Non attribuée'));
        var when = dateLabel(item.created_at);
        if (when) meta.append(el('span', '', when));
        card.append(meta);
        interventionsList.append(card);
      });
    }
    function setDataState(messageText, retryable) {
      dataState.hidden = false;
      dataMessage.textContent = messageText;
      dataRetry.hidden = !retryable;
    }

    function siteById(id) {
      return currentSites.find(function (site) { return site.id === id; }) || null;
    }
    function setFormError(messageText) {
      siteFormError.textContent = messageText || '';
      siteFormError.hidden = !messageText;
    }
    function openSiteDialog(site) {
      if (!canManageSites()) return;
      siteForm.reset(); setFormError('');
      siteId.value = site ? site.id : '';
      siteName.value = site ? site.name : '';
      siteCity.value = site ? site.city : '';
      siteCode.value = site ? site.site_code : '';
      siteAddress.value = site ? site.address_line : '';
      siteDialogTitle.textContent = site ? 'Modifier le site' : 'Ajouter un site';
      siteDialog.hidden = false;
      win.setTimeout(function () { siteName.focus(); }, 0);
    }
    function closeSiteDialog() {
      siteDialog.hidden = true; setFormError(''); siteForm.reset(); siteId.value = '';
    }
    async function submitSite(event) {
      event.preventDefault();
      if (!canManageSites() || !currentEnterpriseId || !client || !win.FixeoEnterpriseSiteActions) return;
      siteSubmit.disabled = true; setFormError('');
      var payload = { name: siteName.value, city: siteCity.value, site_code: siteCode.value, address_line: siteAddress.value };
      try {
        if (siteId.value) await bounded(win.FixeoEnterpriseSiteActions.update(client, currentEnterpriseId, siteId.value, payload));
        else await bounded(win.FixeoEnterpriseSiteActions.create(client, currentEnterpriseId, payload));
        closeSiteDialog();
        await loadOperational(currentEnterpriseId, generation);
      } catch (error) {
        var reason = error && error.reason || error && error.message || '';
        var msg = reason === 'site_code_exists' ? 'Ce code site est déjà utilisé.'
          : reason === 'forbidden' ? 'Votre rôle ne permet pas cette action.'
          : reason === 'INVALID_INPUT' ? 'Vérifiez le nom, la ville et les longueurs saisies.'
          : 'Impossible d’enregistrer le site. Réessayez.';
        setFormError(msg);
      } finally { siteSubmit.disabled = false; }
    }
    async function handleSiteAction(event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-site-action]') : null;
      if (!button || !canManageSites()) return;
      var site = siteById(button.dataset.siteId || '');
      if (!site) return;
      if (button.dataset.siteAction === 'edit') { openSiteDialog(site); return; }
      if (button.dataset.siteAction !== 'status') return;
      button.disabled = true;
      try {
        await bounded(win.FixeoEnterpriseSiteActions.setStatus(client, currentEnterpriseId, site.id, button.dataset.nextStatus));
        await loadOperational(currentEnterpriseId, generation);
      } catch (_) {
        setDataState('Impossible de modifier le statut du site. Réessayez.', true);
      } finally { button.disabled = false; }
    }
    async function loadOperational(enterpriseId, run) {
      if (!win.FixeoEnterpriseReadModel || typeof win.FixeoEnterpriseReadModel.load !== 'function') {
        setDataState('Les données opérationnelles sont momentanément indisponibles.', true); return;
      }
      setDataState('Chargement des opérations…', false);
      try {
        var model = await bounded(win.FixeoEnterpriseReadModel.load(client, enterpriseId));
        if (run !== generation || stopped || doc.hidden || currentEnterpriseId !== enterpriseId) return;
        renderSites(model.sites || []);
        renderInterventions(model.interventions || []);
        dataState.hidden = true;
      } catch (_) {
        if (run === generation && !stopped && !doc.hidden) setDataState('Impossible de charger les opérations. Votre accès reste sécurisé.', true);
      }
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
        currentEnterpriseId = result.enterprise.id;
        currentEnterpriseRole = result.enterprise.role;
        name.textContent = company.textContent = result.enterprise.name;
        role.textContent = LABELS[result.enterprise.role];
        var manager = canManageSites();
        siteCreate.hidden = !manager;
        sitesMode.textContent = manager ? 'Gestion autorisée' : 'Lecture seule';
        state.hidden = true; panel.hidden = false; logout.hidden = false;
        main.setAttribute('aria-busy', 'false'); name.focus();
        await loadOperational(result.enterprise.id, run);
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
    dataRetry.addEventListener('click', function () {
      if (currentEnterpriseId) loadOperational(currentEnterpriseId, generation);
    });
    siteCreate.addEventListener('click', function () { openSiteDialog(null); });
    siteClose.addEventListener('click', closeSiteDialog);
    siteCancel.addEventListener('click', closeSiteDialog);
    siteDialog.addEventListener('click', function (event) { if (event.target === siteDialog) closeSiteDialog(); });
    siteForm.addEventListener('submit', submitSite);
    sitesList.addEventListener('click', handleSiteAction);
    logout.addEventListener('click', signOut);
    doc.addEventListener('visibilitychange', visibility);
    win.addEventListener('pagehide', pageHide);
    win.addEventListener('pageshow', pageShow);
    refresh();
    return { refresh: refresh, destroy: function () {
      stopped = true; clear();
      if (subscription) subscription.unsubscribe();
      retry.removeEventListener('click', refresh); logout.removeEventListener('click', signOut);
      siteClose.removeEventListener('click', closeSiteDialog); siteCancel.removeEventListener('click', closeSiteDialog);
      siteForm.removeEventListener('submit', submitSite); sitesList.removeEventListener('click', handleSiteAction);
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('pagehide', pageHide); win.removeEventListener('pageshow', pageShow);
    } };
  }
  return Object.freeze({ mount: mount });
});
