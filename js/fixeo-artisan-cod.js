(function (window, document) {
  'use strict';

  const CURRENT_ARTISAN = localStorage.getItem('fixeo_user_name') || '';
  const CURRENT_ARTISAN_ID = localStorage.getItem('fixeo_user') || '';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function renderRequestCard(mission, proposal) {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const hasQuote = !!proposal;
    const amount = proposal ? proposal.price : suggestPrice(mission.service);
    return `
      <div class="request-card business-priority" data-request-id="${mission.id}">
        <div class="request-header">
          <h3>${FixeoMissionSystem.escapeHtml(mission.service)} • ${FixeoMissionSystem.escapeHtml(mission.city || 'Maroc')}</h3>
          <span class="request-time">${new Date(mission.created_at).toLocaleString('fr-FR')}</span>
        </div>
        <p class="request-desc">${FixeoMissionSystem.escapeHtml(mission.description || '—')}</p>
        <div class="request-client">👤 ${FixeoMissionSystem.escapeHtml(mission.client_name || 'Client')}</div>
        <div class="request-meta">
          <span>💰 Proposition : ${FixeoMissionSystem.formatMad(amount)}</span>
          <span class="${mission.status === 'pending' ? 'urgent' : ''}">${hasQuote ? '✅ Proposition déjà envoyée' : '⚡ Réponse à envoyer'}</span>
        </div>
        <div class="request-actions">
          <button class="btn btn-primary" data-artisan-action="send-quote" data-mission-id="${mission.id}" data-price="${amount}">${hasQuote ? 'Mettre à jour le devis' : 'Envoyer ma proposition'}</button>
          <button class="btn btn-secondary" data-artisan-action="ignore-request" data-mission-id="${mission.id}">Ignorer</button>
        </div>
      </div>
    `;
  }

  function suggestPrice(service) {
    const prices = {
      Plomberie: 200,
      Électricité: 250,
      Peinture: 800,
      Nettoyage: 180,
      Jardinage: 220,
      'Déménagement': 450
    };
    return prices[service] || 200;
  }

  function renderOverview() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const container = document.getElementById('artisan-cod-overview-panel');
    if (!FixeoMissionSystem || !container) return;

    const artisanMissions = FixeoMissionSystem.getMissionsForArtisan(CURRENT_ARTISAN);
    const pendingRequests = FixeoMissionSystem.list().filter(function (mission) {
      return mission.status === 'pending';
    });
    const validated = artisanMissions.filter(function (mission) {
      return mission.status === 'validated' && mission.artisan_name === CURRENT_ARTISAN;
    });
    const gains = validated.reduce(function (sum, mission) { return sum + Number(mission.artisan_net || 0); }, 0);
    const commissions = validated.reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0);
    const unpaid = validated.filter(function (mission) { return !mission.commission_paid; }).reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0);
    const waitingClient = artisanMissions.filter(function (mission) { return mission.status === 'completed' && mission.artisan_name === CURRENT_ARTISAN; }).length;

    container.innerHTML = `
      <section class="fixeo-cod-shell" style="margin-bottom:22px">
        <div class="artisan-revenue">
          <div class="revenue-card"><strong>${FixeoMissionSystem.formatMad(gains)}</strong><span>Gains ce mois</span></div>
          <div class="revenue-card"><strong>${FixeoMissionSystem.formatMad(commissions)}</strong><span>Commission Fixeo</span></div>
        </div>
        <div class="fixeo-cod-kpis">
          <div class="fixeo-cod-kpi"><strong>${pendingRequests.length}</strong><span>Demandes à traiter</span></div>
          <div class="fixeo-cod-kpi"><strong>${waitingClient}</strong><span>Interventions en attente de validation client</span></div>
          <div class="fixeo-cod-kpi"><strong>${FixeoMissionSystem.formatMad(unpaid)}</strong><span>Total commissions à payer</span></div>
          <div class="fixeo-cod-kpi"><strong>${validated.length}</strong><span>Missions validées</span></div>
        </div>
        <div class="commission-summary">Total commissions à payer : <strong>${FixeoMissionSystem.formatMad(unpaid)}</strong></div>
        <div class="billing-reminder">Vos commissions sont calculées automatiquement et réglées en fin de semaine.</div>
      </section>
    `;

    const countEl = document.getElementById('new-requests-count');
    if (countEl) countEl.textContent = `${pendingRequests.length} nouvelles demandes`;
    const urgentEl = document.getElementById('urgent-requests-count');
    if (urgentEl) urgentEl.textContent = String(pendingRequests.length);
    const potentialEl = document.getElementById('potential-revenue-total');
    if (potentialEl) {
      const total = pendingRequests.reduce(function (sum, mission) { return sum + suggestPrice(mission.service); }, 0);
      potentialEl.textContent = FixeoMissionSystem.formatMad(total);
    }
    const missionCountEl = document.getElementById('stat-missions-count');
    if (missionCountEl) missionCountEl.textContent = String(validated.length);
  }

  function renderRequests() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    if (!FixeoMissionSystem) return;
    const priorityList = document.getElementById('priority-requests-list');
    const requestsGrid = document.getElementById('requests-grid');
    const pendingRequests = FixeoMissionSystem.list().filter(function (mission) {
      return mission.status === 'pending';
    });
    const html = pendingRequests.length ? pendingRequests.map(function (mission) {
      const proposal = (mission.proposals || []).find(function (item) { return item.artisan_id === CURRENT_ARTISAN_ID; }) || null;
      return renderRequestCard(mission, proposal);
    }).join('') : '<div class="fixeo-empty">Aucune nouvelle demande à traiter.</div>';
    if (priorityList) priorityList.innerHTML = html;
    if (requestsGrid) requestsGrid.innerHTML = html;
  }

  function renderMissions() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const section = document.getElementById('artisan-cod-missions');
    const notificationsContainer = document.getElementById('artisan-cod-notifications');
    if (!FixeoMissionSystem || !section) return;

    const artisanMissions = FixeoMissionSystem.getMissionsForArtisan(CURRENT_ARTISAN).filter(function (mission) {
      return mission.artisan_name === CURRENT_ARTISAN || (mission.proposals || []).some(function (proposal) { return proposal.artisan_id === CURRENT_ARTISAN_ID; });
    });

    const active = artisanMissions.filter(function (mission) {
      return ['accepted', 'in_progress', 'completed', 'validated'].includes(mission.status) && mission.artisan_name === CURRENT_ARTISAN;
    });

    section.innerHTML = active.length ? active.map(function (mission) {
      const meta = FixeoMissionSystem.getStatusMeta(mission.status);
      let actions = '';
      if (mission.status === 'accepted' && mission.locked) {
        actions = `<div class="fixeo-card-actions"><button class="btn btn-primary" data-artisan-action="start-mission" data-mission-id="${mission.id}">Démarrer l’intervention</button></div>`;
      }
      if (mission.status === 'in_progress') {
        actions = `<div class="fixeo-card-actions"><button class="btn btn-primary" data-artisan-action="complete-mission" data-mission-id="${mission.id}">Intervention terminée</button></div>`;
      }
      if (mission.status === 'completed') {
        actions = `<div class="fixeo-alert fixeo-alert--warning">Le client doit encore confirmer la fin de mission.${mission.reminder_due ? ' Rappel envoyé.' : ''}</div>`;
      }
      if (mission.status === 'validated') {
        actions = `<div class="commission-info">Commission Fixeo (15%) : ${FixeoMissionSystem.formatMad(mission.commission_amount)}</div>`;
      }
      return `
        <article class="fixeo-mission-card">
          <div class="fixeo-mission-card__top">
            <div>
              <h3 class="fixeo-mission-card__title">${FixeoMissionSystem.escapeHtml(mission.service)} • ${FixeoMissionSystem.escapeHtml(mission.client_name || 'Client')}</h3>
              <div class="fixeo-mission-card__meta">
                <span>Prix final : ${FixeoMissionSystem.formatMad(mission.final_price || 0)}</span>
                <span>${mission.locked ? '🔒 Mission verrouillée' : 'Mission non verrouillée'}</span>
              </div>
            </div>
            <span class="fixeo-status-badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.color}33">${meta.label}</span>
          </div>
          <div class="payment-info">${FixeoMissionSystem.escapeHtml(FixeoMissionSystem.CASH_MESSAGE)}</div>
          ${actions}
        </article>
      `;
    }).join('') : '<div class="fixeo-empty">Aucune mission active attribuée pour le moment.</div>';

    const notifications = artisanMissions.filter(function (mission) { return mission.artisan_name === CURRENT_ARTISAN; }).flatMap(function (mission) {
      return mission.notifications || [];
    }).slice(0, 4);
    if (notificationsContainer) {
      notificationsContainer.innerHTML = notifications.length ? notifications.map(function (item) {
        return `<div class="fixeo-notification-item"><strong>${FixeoMissionSystem.escapeHtml(item.title)}</strong><div>${FixeoMissionSystem.escapeHtml(item.body)}</div></div>`;
      }).join('') : '<div class="fixeo-empty">Aucune notification métier pour le moment.</div>';
    }
  }

  function renderEarnings() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const container = document.getElementById('artisan-cod-earnings');
    if (!FixeoMissionSystem || !container) return;
    const validated = FixeoMissionSystem.getMissionsForArtisan(CURRENT_ARTISAN).filter(function (mission) {
      return mission.status === 'validated' && mission.artisan_name === CURRENT_ARTISAN;
    });
    const unpaid = validated.filter(function (mission) { return !mission.commission_paid; }).reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0);

    container.innerHTML = `
      <section class="fixeo-cod-shell">
        <div class="warning">⚠️ Toute mission réalisée hors Fixeo peut entraîner une suspension du compte.</div>
        <div class="fixeo-section-title"><h3>Historique des missions et commissions</h3></div>
        <section class="mission-history">
          ${validated.length ? validated.map(function (mission) {
            return `<div class="mission-row"><span>${FixeoMissionSystem.escapeHtml(mission.service)}</span><span>${FixeoMissionSystem.formatMad(mission.final_price)}</span><span class="commission">-${FixeoMissionSystem.formatMad(mission.commission_amount)}</span></div>`;
          }).join('') : '<div class="fixeo-empty">Aucune mission validée pour l’instant.</div>'}
        </section>
        <div class="commission-summary">Total commissions à payer : <strong>${FixeoMissionSystem.formatMad(unpaid)}</strong></div>
        <div class="billing-reminder">Vos commissions sont calculées automatiquement et réglées en fin de semaine.</div>
      </section>
    `;
  }

  function bindActions(root) {
    root.addEventListener('click', function (event) {
      const target = event.target.closest('[data-artisan-action]');
      if (!target || !window.FixeoMissionSystem) return;
      const action = target.getAttribute('data-artisan-action');
      const missionId = target.getAttribute('data-mission-id');
      const price = Number(target.getAttribute('data-price') || 0);
      if (action === 'send-quote') {
        window.FixeoMissionSystem.addOrUpdateProposal(missionId, {
          artisan_id: CURRENT_ARTISAN_ID,
          artisan_name: CURRENT_ARTISAN,
          price: price,
          rating: 4.9,
          city: 'Casablanca',
          note: 'Disponible rapidement, paiement cash après intervention.'
        });
        window.notifications?.success('Devis envoyé', 'Votre proposition est maintenant visible côté client.');
      }
      if (action === 'ignore-request') {
        target.closest('.request-card')?.remove();
      }
      if (action === 'start-mission') {
        window.FixeoMissionSystem.startMission(missionId);
        window.notifications?.success('Intervention démarrée', 'La mission est passée en cours.');
      }
      if (action === 'complete-mission') {
        window.FixeoMissionSystem.completeMission(missionId);
        window.notifications?.success('Intervention terminée', 'Le client peut maintenant confirmer la fin de mission.');
      }
    });
  }

  function renderAll() {
    renderOverview();
    renderRequests();
    renderMissions();
    renderEarnings();
  }

  ready(function () {
    if (document.body.dataset.dashType !== 'artisan') return;
    if (!window.FixeoMissionSystem) return;
    renderAll();
    bindActions(document.body);
    window.addEventListener('fixeo:missions:updated', renderAll);
  });
})(window, document);
