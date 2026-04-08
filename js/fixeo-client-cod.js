(function (window, document) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function missionCard(mission, extraActions) {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const meta = FixeoMissionSystem.getStatusMeta(mission.status);
    const selectedProposal = (mission.proposals || []).find(function (proposal) { return proposal.selected; }) || null;
    const finalPrice = mission.final_price ? FixeoMissionSystem.formatMad(mission.final_price) : 'À confirmer';
    return `
      <article class="fixeo-mission-card">
        <div class="fixeo-mission-card__top">
          <div>
            <h3 class="fixeo-mission-card__title">${FixeoMissionSystem.escapeHtml(mission.service)} • ${FixeoMissionSystem.escapeHtml(mission.city || 'Maroc')}</h3>
            <div class="fixeo-mission-card__meta">
              <span>Réf. ${FixeoMissionSystem.escapeHtml(mission.id)}</span>
              <span>${FixeoMissionSystem.escapeHtml(mission.description || '—')}</span>
            </div>
          </div>
          <span class="fixeo-status-badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.color}33">${meta.label}</span>
        </div>
        <div class="fixeo-mission-card__meta">
          <span>👷 Artisan : ${FixeoMissionSystem.escapeHtml(mission.artisan_name || 'En attente de choix')}</span>
          <span>💰 Prix final : ${FixeoMissionSystem.escapeHtml(finalPrice)}</span>
          ${mission.locked ? '<span class="fixeo-lock-badge">🔒 Mission verrouillée</span>' : ''}
        </div>
        <div class="payment-info">${FixeoMissionSystem.escapeHtml(mission.payment_message)}</div>
        ${selectedProposal && mission.status === 'accepted' && !mission.price_validated ? `<div class="quote-price">Proposition : <strong>${FixeoMissionSystem.formatMad(selectedProposal.price)}</strong></div>` : ''}
        ${mission.reminder_due ? `<div class="fixeo-alert fixeo-alert--warning">${FixeoMissionSystem.escapeHtml(mission.client_reminder_message)}</div>` : ''}
        ${mission.issue_reported ? `<div class="fixeo-alert fixeo-alert--danger">Signalement ouvert : ${FixeoMissionSystem.escapeHtml(mission.issue_note || 'Le support Fixeo analysera le problème.')}</div>` : ''}
        ${extraActions || ''}
      </article>
    `;
  }

  function renderOverview() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const container = document.getElementById('client-cod-overview');
    if (!container || !FixeoMissionSystem) return;
    const missions = FixeoMissionSystem.list();
    const metrics = FixeoMissionSystem.getMetrics();
    const active = missions.filter(function (mission) {
      return ['pending', 'accepted', 'in_progress', 'completed'].includes(mission.status);
    }).slice(0, 3);

    container.innerHTML = `
      <section class="fixeo-cod-shell" style="margin-bottom:20px">
        <div class="fixeo-cod-kpis">
          <div class="fixeo-cod-kpi"><strong>${metrics.pending}</strong><span>Demandes en attente</span></div>
          <div class="fixeo-cod-kpi"><strong>${metrics.accepted + metrics.in_progress}</strong><span>Missions en cours de préparation</span></div>
          <div class="fixeo-cod-kpi"><strong>${metrics.completed}</strong><span>En attente de confirmation client</span></div>
          <div class="fixeo-cod-kpi"><strong>${metrics.validated}</strong><span>Missions déjà confirmées</span></div>
        </div>
        <div class="fixeo-section-title">
          <h2>Flow COD Fixeo</h2>
          <span class="fixeo-inline-note">Cash après intervention • Commission invisible côté client</span>
        </div>
        <div class="fixeo-proposal-list">
          ${active.length ? active.map(function (mission) { return missionCard(mission); }).join('') : '<div class="fixeo-empty">Aucune mission active pour le moment.</div>'}
        </div>
      </section>
    `;
  }

  function renderProposalManager() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const container = document.getElementById('client-cod-messages');
    if (!container || !FixeoMissionSystem) return;
    const missions = FixeoMissionSystem.list().filter(function (mission) {
      return mission.status === 'pending' || (mission.status === 'accepted' && !mission.price_validated);
    });

    if (!missions.length) {
      container.innerHTML = '<div class="fixeo-empty">Aucune proposition en attente. Dès qu’un artisan répond, vous pourrez le choisir ici.</div>';
      return;
    }

    container.innerHTML = missions.map(function (mission) {
      const selectedProposal = (mission.proposals || []).find(function (proposal) { return proposal.selected; }) || null;
      return `
        <section class="fixeo-cod-card" style="margin-bottom:16px">
          <div class="fixeo-section-title">
            <h3>${FixeoMissionSystem.escapeHtml(mission.service)} • ${FixeoMissionSystem.escapeHtml(mission.city || 'Maroc')}</h3>
            <span class="fixeo-inline-note">${FixeoMissionSystem.escapeHtml(mission.description || '')}</span>
          </div>
          <div class="fixeo-proposal-list">
            ${(mission.proposals || []).map(function (proposal) {
              const isSelected = proposal.selected;
              return `
                <div class="fixeo-proposal-card ${isSelected ? 'is-selected' : ''}">
                  <div>
                    <h4 style="margin:0 0 6px">${FixeoMissionSystem.escapeHtml(proposal.artisan_name)}</h4>
                    <div class="fixeo-inline-note">⭐ ${proposal.rating} • ${FixeoMissionSystem.escapeHtml(proposal.city || mission.city || 'Maroc')}</div>
                  </div>
                  <div class="quote-price">Proposition : <strong>${FixeoMissionSystem.formatMad(proposal.price)}</strong></div>
                  <div class="payment-info">${FixeoMissionSystem.escapeHtml(FixeoMissionSystem.CASH_MESSAGE)}</div>
                  <div class="fixeo-card-actions">
                    <button class="btn btn-primary" data-fixeo-action="choose-artisan" data-mission-id="${mission.id}" data-artisan-id="${proposal.artisan_id}">Choisir cet artisan</button>
                    ${isSelected && !mission.price_validated ? `<button class="btn btn-secondary" data-fixeo-action="validate-price" data-mission-id="${mission.id}" data-price="${proposal.price}">Valider le prix final</button>` : ''}
                  </div>
                  ${isSelected && mission.price_validated ? '<div class="fixeo-alert fixeo-alert--success">Prix validé et mission verrouillée.</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
          ${selectedProposal && mission.price_validated ? `<div class="fixeo-alert fixeo-alert--success" style="margin-top:14px">Artisan choisi : <strong>${FixeoMissionSystem.escapeHtml(selectedProposal.artisan_name)}</strong> • Prix final : <strong>${FixeoMissionSystem.formatMad(mission.final_price)}</strong> • Paiement cash après intervention</div>` : ''}
        </section>
      `;
    }).join('');
  }

  function renderBookings() {
    const FixeoMissionSystem = window.FixeoMissionSystem;
    const container = document.getElementById('client-cod-bookings');
    if (!container || !FixeoMissionSystem) return;
    const missions = FixeoMissionSystem.list();

    container.innerHTML = `
      <section class="fixeo-cod-shell" style="margin-bottom:18px">
        <div class="fixeo-section-title">
          <h2>Mes missions COD</h2>
          <span class="fixeo-inline-note">Le client paie directement l’artisan après intervention</span>
        </div>
        <div class="fixeo-proposal-list">
          ${missions.map(function (mission) {
            let actions = '';
            if (mission.status === 'completed') {
              actions = `
                <div class="fixeo-card-actions">
                  <button class="btn btn-primary" data-fixeo-action="validate-mission" data-mission-id="${mission.id}">Confirmer que le travail est terminé</button>
                  <button class="btn btn-secondary" data-fixeo-action="report-issue" data-mission-id="${mission.id}">Signaler un problème</button>
                </div>
              `;
            }
            if (mission.status === 'accepted' && mission.locked) {
              actions = '<div class="fixeo-inline-note">Mission verrouillée. L’intervention peut maintenant avoir lieu.</div>';
            }
            if (mission.status === 'validated') {
              actions = '<div class="fixeo-alert fixeo-alert--success">Mission clôturée après votre confirmation. Merci.</div>';
            }
            return missionCard(mission, actions);
          }).join('')}
        </div>
      </section>
    `;
  }

  function bindActions(root) {
    root.addEventListener('click', function (event) {
      const target = event.target.closest('[data-fixeo-action]');
      if (!target || !window.FixeoMissionSystem) return;
      const action = target.getAttribute('data-fixeo-action');
      const missionId = target.getAttribute('data-mission-id');
      const artisanId = target.getAttribute('data-artisan-id');
      const price = Number(target.getAttribute('data-price') || 0);
      if (action === 'choose-artisan') {
        window.FixeoMissionSystem.chooseArtisan(missionId, artisanId);
        window.notifications?.success('Artisan choisi', 'La mission passe au statut accepté.');
      }
      if (action === 'validate-price') {
        window.FixeoMissionSystem.validatePrice(missionId, price);
        window.notifications?.success('Prix final validé', 'La mission est verrouillée et prête pour l’intervention.');
      }
      if (action === 'validate-mission') {
        window.FixeoMissionSystem.validateMission(missionId);
        window.notifications?.success('Mission confirmée', 'Merci. Le dossier Fixeo est clôturé.');
      }
      if (action === 'report-issue') {
        window.FixeoMissionSystem.reportIssue(missionId, 'Signalement client ouvert depuis le dashboard.');
        window.notifications?.warning('Problème signalé', 'L’équipe Fixeo verra ce dossier avant toute clôture.');
      }
    });
  }

  function renderAll() {
    renderOverview();
    renderProposalManager();
    renderBookings();
  }

  ready(function () {
    if (document.body.dataset.dashType !== 'client') return;
    if (!window.FixeoMissionSystem) return;
    renderAll();
    bindActions(document.body);
    window.addEventListener('fixeo:missions:updated', renderAll);
  });
})(window, document);
