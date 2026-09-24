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
    var requestCreate = byId('enterprise-request-create'), requestsMode = byId('enterprise-requests-mode');
    var requestDialog = byId('enterprise-request-dialog'), requestClose = byId('enterprise-request-close');
    var requestCancel = byId('enterprise-request-cancel'), requestForm = byId('enterprise-request-form');
    var requestSite = byId('enterprise-request-site'), requestCategory = byId('enterprise-request-category');
    var requestDescription = byId('enterprise-request-description'), requestUrgency = byId('enterprise-request-urgency');
    var requestSubmit = byId('enterprise-request-submit'), requestFormError = byId('enterprise-request-form-error');
    var interventionDialog = byId('enterprise-intervention-dialog'), interventionClose = byId('enterprise-intervention-close');
    var interventionDismiss = byId('enterprise-intervention-dismiss'), interventionDetail = byId('enterprise-intervention-detail');
    var interventionDialogTitle = byId('enterprise-intervention-dialog-title');
    var reportPeriod = byId('enterprise-report-period'), reportState = byId('enterprise-report-state');
    var reportMessage = byId('enterprise-report-message'), reportRetry = byId('enterprise-report-retry');
    var reportContent = byId('enterprise-report-content'), reportKpis = byId('enterprise-report-kpis');
    var reportSla = byId('enterprise-report-sla'), reportStatuses = byId('enterprise-report-statuses');
    var reportSites = byId('enterprise-report-sites');
    var teamList = byId('enterprise-team-list'), teamEmpty = byId('enterprise-team-empty'), teamMode = byId('enterprise-team-mode');
    var memberDialog = byId('enterprise-member-dialog'), memberDialogTitle = byId('enterprise-member-dialog-title');
    var memberClose = byId('enterprise-member-close'), memberDismiss = byId('enterprise-member-dismiss');
    var memberDetail = byId('enterprise-member-detail'), memberError = byId('enterprise-member-error');
    var currentEnterpriseId = '', currentEnterpriseRole = '', currentSites = [], currentInterventions = [], currentMembers = [];
    var currentReportPeriod = '30';
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
      currentInterventions = [];
      currentMembers = [];
      if (siteCreate) siteCreate.hidden = true;
      if (sitesMode) sitesMode.textContent = 'Lecture seule';
      if (requestCreate) requestCreate.hidden = true;
      if (requestsMode) requestsMode.textContent = 'Lecture seule';
      if (siteDialog) siteDialog.hidden = true;
      if (requestDialog) requestDialog.hidden = true;
      if (interventionDialog) interventionDialog.hidden = true;
      if (interventionDetail) interventionDetail.replaceChildren();
      if (reportContent) reportContent.hidden = true;
      if (reportKpis) reportKpis.replaceChildren();
      if (reportSla) reportSla.replaceChildren();
      if (reportStatuses) reportStatuses.replaceChildren();
      if (reportSites) reportSites.replaceChildren();
      if (reportState) reportState.hidden = false;
      if (reportMessage) reportMessage.textContent = 'Chargement des indicateurs…';
      if (reportRetry) reportRetry.hidden = true;
      if (teamList) teamList.replaceChildren();
      if (teamEmpty) teamEmpty.hidden = true;
      if (teamMode) teamMode.textContent = 'Lecture seule';
      if (memberDialog) memberDialog.hidden = true;
      if (memberDetail) memberDetail.replaceChildren();
      if (memberError) { memberError.hidden = true; memberError.textContent = ''; }
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
    function dateTimeLabel(value) {
      if (!value) return 'Non renseigné';
      var d = new Date(value);
      return Number.isNaN(d.getTime()) ? 'Non renseigné' : new Intl.DateTimeFormat('fr-MA', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(d);
    }
    function slaState(sla) {
      if (!sla || !sla.due_at) return { key: 'none', label: 'SLA non disponible' };
      var now = Date.now();
      var due = Date.parse(sla.due_at);
      var risk = sla.at_risk_at ? Date.parse(sla.at_risk_at) : NaN;
      if (!Number.isNaN(due) && now > due) return { key: 'late', label: 'Échéance dépassée' };
      if (!Number.isNaN(risk) && now >= risk) return { key: 'risk', label: 'À risque' };
      return { key: 'track', label: 'Dans les temps' };
    }
    function el(tag, cls, content) {
      var node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (content != null) node.textContent = content;
      return node;
    }

    function numeric(value) {
      var n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    function numberLabel(value) {
      var n = numeric(value);
      return n == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(n);
    }
    function percentLabel(value) {
      var n = numeric(value);
      return n == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 1 }).format(n) + ' %';
    }
    function minutesLabel(value) {
      var n = numeric(value);
      return n == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 1 }).format(n) + ' min';
    }
    function kpi(labelText, valueText, hintText) {
      var card = el('div', 'fxew-kpi');
      card.append(el('span', 'fxew-kpi-label', labelText), el('strong', 'fxew-kpi-value', valueText));
      if (hintText) card.append(el('small', 'fxew-kpi-hint', hintText));
      return card;
    }
    function breakdownRow(key, count) {
      var row = el('div', 'fxew-breakdown-row');
      row.append(el('span', '', label(key)), el('strong', '', numberLabel(count)));
      return row;
    }
    function renderReporting(model) {
      reportKpis.replaceChildren(
        kpi('Demandes', numberLabel(model.operational.request_count), 'Période sélectionnée'),
        kpi('Acceptées', numberLabel(model.operational.accepted_request_count), percentLabel(model.operational.acceptance_rate_percent)),
        kpi('Acceptation moyenne', minutesLabel(model.operational.avg_first_acceptance_minutes), 'Première acceptation'),
        kpi('Missions terminées', numberLabel(model.operational.completed_mission_request_count), 'Demandes avec mission terminée')
      );

      reportSla.replaceChildren(
        kpi('Éligibles', numberLabel(model.sla.eligible_count), ''),
        kpi('SLA respecté', numberLabel(model.sla.met_count), percentLabel(model.sla.sla_met_rate_percent)),
        kpi('À risque', numberLabel(model.sla.at_risk_count), ''),
        kpi('Dépassé', numberLabel(model.sla.breached_count), '')
      );

      reportStatuses.replaceChildren();
      var statuses = model.breakdown.by_request_status || [];
      if (!statuses.length) reportStatuses.append(el('p', 'fxew-report-empty', 'Aucune demande sur cette période.'));
      else statuses.forEach(function (row) { reportStatuses.append(breakdownRow(row.key, row.count)); });

      reportSites.replaceChildren();
      if (!model.sites.length) {
        reportSites.append(el('p', 'fxew-report-empty', 'Aucun site accessible.'));
      } else {
        model.sites.forEach(function (site) {
          var card = el('article', 'fxew-site-performance-card');
          var head = el('div', 'fxew-site-performance-head');
          var copy = el('div');
          copy.append(el('strong', '', site.site_name || 'Site sans nom'));
          copy.append(el('span', '', [site.city, label(site.site_status)].filter(Boolean).join(' · ')));
          head.append(copy, el('span', 'fxew-status', numberLabel(site.request_count) + ' demande' + (Number(site.request_count) === 1 ? '' : 's')));
          card.append(head);
          var metrics = el('div', 'fxew-site-performance-metrics');
          metrics.append(
            kpi('Acceptées', numberLabel(site.accepted_count), percentLabel(site.acceptance_rate_percent)),
            kpi('Terminées', numberLabel(site.completed_count), '')
          );
          card.append(metrics);
          reportSites.append(card);
        });
      }

      reportState.hidden = true;
      reportContent.hidden = false;
    }
    function setReportState(messageText, retryable) {
      reportContent.hidden = true;
      reportState.hidden = false;
      reportMessage.textContent = messageText;
      reportRetry.hidden = !retryable;
    }
    async function loadReporting(enterpriseId, run) {
      if (!win.FixeoEnterpriseReporting || typeof win.FixeoEnterpriseReporting.load !== 'function') {
        setReportState('Les indicateurs sont momentanément indisponibles.', true);
        return;
      }
      setReportState('Chargement des indicateurs…', false);
      try {
        var model = await bounded(win.FixeoEnterpriseReporting.load(client, enterpriseId, currentReportPeriod));
        if (run !== generation || stopped || doc.hidden || currentEnterpriseId !== enterpriseId) return;
        renderReporting(model);
      } catch (_) {
        if (run === generation && !stopped && !doc.hidden) {
          setReportState('Impossible de charger la synthèse opérationnelle. Réessayez.', true);
        }
      }
    }
    function canManageSites() {
      return !!(win.FixeoEnterpriseSiteActions &&
        typeof win.FixeoEnterpriseSiteActions.canManage === 'function' &&
        win.FixeoEnterpriseSiteActions.canManage(currentEnterpriseRole));
    }
    function canCreateRequests() {
      return !!(win.FixeoEnterpriseRequestActions &&
        typeof win.FixeoEnterpriseRequestActions.canCreate === 'function' &&
        win.FixeoEnterpriseRequestActions.canCreate(currentEnterpriseRole));
    }

    function canManageMembers() {
      return !!(win.FixeoEnterpriseMemberActions &&
        typeof win.FixeoEnterpriseMemberActions.canManage === 'function' &&
        win.FixeoEnterpriseMemberActions.canManage(currentEnterpriseRole));
    }
    function memberIdentity(member) {
      var raw = String(member && member.user_id || '').replace(/-/g, '');
      return 'Membre • ' + (raw ? raw.slice(-6) : 'inconnu');
    }
    function siteNameById(id) {
      var site = currentSites.find(function (row) { return row.id === id; });
      return site ? (site.name || site.site_code || site.city || 'Site') : 'Site';
    }
    function memberById(id) {
      return currentMembers.find(function (member) { return member.id === id; }) || null;
    }
    function setMemberError(messageText) {
      memberError.textContent = messageText || '';
      memberError.hidden = !messageText;
    }
    function renderTeam(rows) {
      currentMembers = rows.slice();
      teamList.replaceChildren();
      teamEmpty.hidden = rows.length !== 0;
      teamMode.textContent = canManageMembers() ? 'Gestion autorisée' : 'Lecture seule';
      rows.forEach(function (member) {
        var card = el('article', 'fxew-member-card');
        var head = el('div', 'fxew-member-head');
        var copy = el('div');
        copy.append(el('strong', '', memberIdentity(member)));
        copy.append(el('span', '', LABELS[member.role] || label(member.role)));
        head.append(copy, el('span', 'fxew-status', label(member.status)));
        card.append(head);
        if (member.role === 'site_manager') {
          var assigned = (member.site_ids || []).map(siteNameById);
          card.append(el('p', 'fxew-member-sites', assigned.length ? 'Sites · ' + assigned.join(' · ') : 'Aucun site affecté visible'));
        }
        var mayEdit = canManageMembers() && member.status !== 'removed' &&
          !(currentEnterpriseRole === 'admin' && member.role === 'owner');
        if (mayEdit) {
          var actions = el('div', 'fxew-site-actions');
          var manage = el('button', 'fxew-site-action', 'Gérer l’accès');
          manage.type = 'button'; manage.dataset.memberAction = 'manage'; manage.dataset.memberId = member.id;
          actions.append(manage); card.append(actions);
        }
        teamList.append(card);
      });
    }
    function memberField(labelText, control) {
      var wrap = el('label', 'fxew-member-field');
      wrap.append(el('span', '', labelText), control);
      return wrap;
    }
    function openMemberDialog(member) {
      if (!member || !canManageMembers()) return;
      setMemberError('');
      memberDetail.replaceChildren();
      memberDialogTitle.textContent = memberIdentity(member);

      var roleSelect = doc.createElement('select');
      var roleOptions = member.role === 'owner'
        ? ['owner','admin','operations_manager','site_manager','reporter','viewer']
        : ['admin','operations_manager','site_manager','reporter','viewer'];
      roleOptions.forEach(function (value) {
        var option = doc.createElement('option');
        option.value = value; option.textContent = LABELS[value] || label(value);
        if (member.role === value) option.selected = true;
        roleSelect.append(option);
      });
      roleSelect.disabled = member.status === 'invited' || member.status === 'removed';

      var statusSelect = doc.createElement('select');
      ['active','suspended','removed'].forEach(function (value) {
        var option = doc.createElement('option');
        option.value = value; option.textContent = label(value);
        if (member.status === value) option.selected = true;
        statusSelect.append(option);
      });
      statusSelect.disabled = member.status === 'invited' || member.status === 'removed';

      var fields = el('div', 'fxew-member-fields');
      fields.append(
        memberField('Identifiant', el('span', 'fxew-member-static', memberIdentity(member))),
        memberField('Rôle', roleSelect),
        memberField('Statut', statusSelect)
      );

      var save = el('button', 'fxew-button fxew-button--primary', 'Enregistrer rôle / statut');
      save.type = 'button';
      save.disabled = roleSelect.disabled && statusSelect.disabled;
      save.addEventListener('click', async function () {
        save.disabled = true; setMemberError('');
        try {
          var roleChanged = roleSelect.value !== member.role;
          var statusChanged = statusSelect.value !== member.status;
          if (roleChanged && statusChanged) {
            setMemberError('Modifiez le rôle ou le statut, puis enregistrez avant de changer l’autre.');
            return;
          }
          if (roleChanged) {
            await bounded(win.FixeoEnterpriseMemberActions.updateRole(client, currentEnterpriseId, member.id, roleSelect.value));
          } else if (statusChanged) {
            await bounded(win.FixeoEnterpriseMemberActions.setStatus(client, currentEnterpriseId, member.id, statusSelect.value));
          }
          closeMemberDialog();
          await loadOperational(currentEnterpriseId, generation);
        } catch (error) {
          var reason = error && (error.reason || error.message) || '';
          var msg = reason === 'owner_invariant_violation' ? 'Le dernier propriétaire actif ne peut pas être modifié.'
            : reason === 'cannot_modify_owner' ? 'Un administrateur ne peut pas modifier un propriétaire.'
            : reason === 'member_not_modifiable' || reason === 'member_already_removed' ? 'Ce membre ne peut plus être modifié.'
            : reason === 'invited_status_not_managed_here' ? 'Cette invitation doit être gérée depuis le module Invitations.'
            : reason === 'forbidden' ? 'Votre rôle ne permet pas cette action.'
            : 'Impossible de modifier cet accès. Réessayez.';
          setMemberError(msg);
        } finally { save.disabled = false; }
      });
      fields.append(save);
      memberDetail.append(fields);

      if (member.role === 'site_manager' && member.status === 'active') {
        var siteBox = el('section', 'fxew-member-site-box');
        siteBox.append(el('h3', '', 'Sites affectés'));
        currentSites.forEach(function (site) {
          var row = el('label', 'fxew-member-site-row');
          var check = doc.createElement('input');
          check.type = 'checkbox';
          check.checked = (member.site_ids || []).indexOf(site.id) !== -1;
          check.addEventListener('change', async function () {
            check.disabled = true; setMemberError('');
            try {
              if (check.checked) await bounded(win.FixeoEnterpriseMemberActions.assignSite(client, currentEnterpriseId, member.id, site.id));
              else await bounded(win.FixeoEnterpriseMemberActions.unassignSite(client, currentEnterpriseId, member.id, site.id));
              await loadOperational(currentEnterpriseId, generation);
              var fresh = memberById(member.id);
              if (fresh) openMemberDialog(fresh);
            } catch (_) {
              check.checked = !check.checked;
              setMemberError('Impossible de modifier cette affectation de site.');
            } finally { check.disabled = false; }
          });
          row.append(check, el('span', '', [site.name || 'Site', site.city].filter(Boolean).join(' · ')));
          siteBox.append(row);
        });
        memberDetail.append(siteBox);
      }
      memberDialog.hidden = false;
      win.setTimeout(function () { memberClose.focus(); }, 0);
    }
    function closeMemberDialog() {
      memberDialog.hidden = true;
      memberDetail.replaceChildren();
      setMemberError('');
    }
    function handleMemberAction(event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-member-action]') : null;
      if (!button || button.dataset.memberAction !== 'manage') return;
      openMemberDialog(memberById(button.dataset.memberId || ''));
    }
    function activeSites() {
      return currentSites.filter(function (site) { return site.status === 'active'; });
    }
    function syncRequestControls() {
      var allowed = canCreateRequests();
      var active = activeSites();
      requestCreate.hidden = !allowed || active.length === 0;
      requestsMode.textContent = !allowed ? 'Lecture seule'
        : active.length === 0 ? 'Aucun site actif'
        : 'Création autorisée';
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
      syncRequestControls();
    }
    function renderInterventions(rows) {
      currentInterventions = rows.slice();
      interventionsList.replaceChildren();
      interventionsCount.textContent = String(rows.length);
      interventionsEmpty.hidden = rows.length !== 0;
      rows.forEach(function (item) {
        var card = el('article', 'fxew-intervention');
        card.dataset.interventionId = item.id;
        var mainRow = el('div', 'fxew-intervention-main');
        var copy = el('div');
        copy.append(el('strong', '', label(item.service_category)));
        copy.append(el('span', '', [item.site_name, item.city].filter(Boolean).join(' · ') || 'Site non renseigné'));
        mainRow.append(copy, el('span', 'fxew-status', label(item.request_status)));
        card.append(mainRow);
        var meta = el('div', 'fxew-intervention-meta');
        meta.append(el('span', '', item.urgency ? 'Urgence · ' + label(item.urgency) : 'Urgence · Non renseignée'));
        meta.append(el('span', '', item.mission_status ? 'Mission · ' + label(item.mission_status) : 'Mission · Non attribuée'));
        if (item.sla) meta.append(el('span', '', 'SLA · ' + slaState(item.sla).label));
        var when = dateLabel(item.created_at);
        if (when) meta.append(el('span', '', when));
        card.append(meta);
        var actions = el('div', 'fxew-intervention-actions');
        var detail = el('button', 'fxew-site-action', 'Voir le détail');
        detail.type = 'button'; detail.dataset.interventionAction = 'detail'; detail.dataset.interventionId = item.id;
        actions.append(detail); card.append(actions);
        interventionsList.append(card);
      });
    }
    function setDataState(messageText, retryable) {
      dataState.hidden = false;
      dataMessage.textContent = messageText;
      dataRetry.hidden = !retryable;
    }

    function interventionById(id) {
      return currentInterventions.find(function (item) { return item.id === id; }) || null;
    }
    function detailRow(term, value) {
      var wrap = el('div', 'fxew-detail-row');
      wrap.append(el('dt', '', term), el('dd', '', value || 'Non renseigné'));
      return wrap;
    }
    function openInterventionDetail(item) {
      if (!item) return;
      interventionDetail.replaceChildren();
      interventionDialogTitle.textContent = label(item.service_category);
      var overview = el('dl', 'fxew-detail-grid');
      overview.append(
        detailRow('Référence', item.id),
        detailRow('Site', item.site_name || item.site_code || 'Non renseigné'),
        detailRow('Ville', item.city),
        detailRow('Urgence', label(item.urgency)),
        detailRow('Statut de la demande', label(item.request_status)),
        detailRow('Statut de mission', item.mission_status ? label(item.mission_status) : 'Non attribuée'),
        detailRow('Créée le', dateTimeLabel(item.created_at)),
        detailRow('Acceptée le', item.accepted_at ? dateTimeLabel(item.accepted_at) : 'Non renseigné')
      );
      interventionDetail.append(overview);

      var slaBox = el('section', 'fxew-sla-box');
      var slaHeading = el('div', 'fxew-sla-head');
      slaHeading.append(el('h3', '', 'SLA'));
      var stateInfo = slaState(item.sla);
      var badge = el('span', 'fxew-sla-state fxew-sla-state--' + stateInfo.key, stateInfo.label);
      slaHeading.append(badge);
      slaBox.append(slaHeading);

      if (!item.sla) {
        slaBox.append(el('p', 'fxew-detail-muted', 'Aucun snapshot SLA n’est disponible pour cette intervention.'));
      } else {
        var slaGrid = el('dl', 'fxew-detail-grid fxew-detail-grid--sla');
        slaGrid.append(
          detailRow('Source de la politique', item.sla.policy_source === 'enterprise_policy' ? 'Politique entreprise' : 'Valeur FIXEO par défaut'),
          detailRow('Priorité SLA', label(item.sla.policy_urgency)),
          detailRow('Objectif d’acceptation', item.sla.acceptance_target_minutes ? String(item.sla.acceptance_target_minutes) + ' min' : 'Non renseigné'),
          detailRow('Démarrage', dateTimeLabel(item.sla.started_at)),
          detailRow('À risque à partir de', dateTimeLabel(item.sla.at_risk_at)),
          detailRow('Échéance', dateTimeLabel(item.sla.due_at))
        );
        slaBox.append(slaGrid);
      }
      interventionDetail.append(slaBox);
      interventionDialog.hidden = false;
      win.setTimeout(function () { interventionClose.focus(); }, 0);
    }
    function closeInterventionDetail() {
      interventionDialog.hidden = true;
      interventionDetail.replaceChildren();
    }
    function handleInterventionAction(event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-intervention-action]') : null;
      if (!button || button.dataset.interventionAction !== 'detail') return;
      openInterventionDetail(interventionById(button.dataset.interventionId || ''));
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

    function setRequestError(messageText) {
      requestFormError.textContent = messageText || '';
      requestFormError.hidden = !messageText;
    }
    function populateRequestSites() {
      requestSite.replaceChildren();
      activeSites().forEach(function (site) {
        var option = doc.createElement('option');
        option.value = site.id;
        option.textContent = [site.name || 'Site sans nom', site.city].filter(Boolean).join(' · ');
        requestSite.append(option);
      });
    }
    function openRequestDialog() {
      if (!canCreateRequests()) return;
      var sites = activeSites();
      if (!sites.length) {
        setDataState('Aucun site actif n’est disponible pour créer une intervention.', false);
        return;
      }
      requestForm.reset();
      setRequestError('');
      populateRequestSites();
      requestUrgency.value = 'normale';
      requestDialog.hidden = false;
      win.setTimeout(function () { requestCategory.focus(); }, 0);
    }
    function closeRequestDialog() {
      requestDialog.hidden = true;
      setRequestError('');
      requestForm.reset();
      requestSite.replaceChildren();
    }
    async function submitRequest(event) {
      event.preventDefault();
      if (!canCreateRequests() || !currentEnterpriseId || !client || !win.FixeoEnterpriseRequestActions) return;
      var site = siteById(requestSite.value);
      if (!site || site.status !== 'active') {
        setRequestError('Choisissez un site actif auquel vous avez accès.');
        return;
      }
      requestSubmit.disabled = true;
      setRequestError('');
      try {
        await bounded(win.FixeoEnterpriseRequestActions.create(client, currentEnterpriseId, {
          site_id: site.id,
          service_category: requestCategory.value,
          description: requestDescription.value,
          urgency: requestUrgency.value
        }));
        closeRequestDialog();
        await loadOperational(currentEnterpriseId, generation);
      } catch (error) {
        var reason = error && error.reason || error && error.message || '';
        var msg = reason === 'site_inactive' ? 'Ce site n’est plus actif.'
          : reason === 'site_forbidden' || reason === 'forbidden' ? 'Votre rôle ou votre périmètre ne permet pas cette création.'
          : reason === 'INVALID_INPUT' ? 'Renseignez le métier et la description.'
          : reason === 'INVALID_URGENCY' || reason === 'urgency_invalid' ? 'Le niveau d’urgence est invalide.'
          : 'Impossible de créer l’intervention. Réessayez.';
        setRequestError(msg);
      } finally { requestSubmit.disabled = false; }
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
        renderTeam(model.members || []);
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
        requestCreate.hidden = true;
        requestsMode.textContent = canCreateRequests() ? 'Chargement des sites…' : 'Lecture seule';
        state.hidden = true; panel.hidden = false; logout.hidden = false;
        main.setAttribute('aria-busy', 'false'); name.focus();
        await Promise.all([
          loadOperational(result.enterprise.id, run),
          loadReporting(result.enterprise.id, run)
        ]);
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
    reportRetry.addEventListener('click', function () {
      if (currentEnterpriseId) loadReporting(currentEnterpriseId, generation);
    });
    reportPeriod.addEventListener('change', function () {
      currentReportPeriod = reportPeriod.value || '30';
      if (currentEnterpriseId) loadReporting(currentEnterpriseId, generation);
    });
    siteCreate.addEventListener('click', function () { openSiteDialog(null); });
    siteClose.addEventListener('click', closeSiteDialog);
    siteCancel.addEventListener('click', closeSiteDialog);
    siteDialog.addEventListener('click', function (event) { if (event.target === siteDialog) closeSiteDialog(); });
    siteForm.addEventListener('submit', submitSite);
    sitesList.addEventListener('click', handleSiteAction);
    requestCreate.addEventListener('click', openRequestDialog);
    requestClose.addEventListener('click', closeRequestDialog);
    requestCancel.addEventListener('click', closeRequestDialog);
    requestDialog.addEventListener('click', function (event) { if (event.target === requestDialog) closeRequestDialog(); });
    requestForm.addEventListener('submit', submitRequest);
    teamList.addEventListener('click', handleMemberAction);
    memberClose.addEventListener('click', closeMemberDialog);
    memberDismiss.addEventListener('click', closeMemberDialog);
    memberDialog.addEventListener('click', function (event) { if (event.target === memberDialog) closeMemberDialog(); });
    interventionsList.addEventListener('click', handleInterventionAction);
    interventionClose.addEventListener('click', closeInterventionDetail);
    interventionDismiss.addEventListener('click', closeInterventionDetail);
    interventionDialog.addEventListener('click', function (event) { if (event.target === interventionDialog) closeInterventionDetail(); });
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
      requestCreate.removeEventListener('click', openRequestDialog);
      requestClose.removeEventListener('click', closeRequestDialog); requestCancel.removeEventListener('click', closeRequestDialog);
      requestForm.removeEventListener('submit', submitRequest);
      teamList.removeEventListener('click', handleMemberAction);
      memberClose.removeEventListener('click', closeMemberDialog);
      memberDismiss.removeEventListener('click', closeMemberDialog);
      interventionsList.removeEventListener('click', handleInterventionAction);
      interventionClose.removeEventListener('click', closeInterventionDetail);
      interventionDismiss.removeEventListener('click', closeInterventionDetail);
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('pagehide', pageHide); win.removeEventListener('pageshow', pageShow);
    } };
  }
  return Object.freeze({ mount: mount });
});
