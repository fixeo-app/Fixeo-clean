(function () {
  'use strict';

  let eventsBound = false;

  function safeTrim(value) {
    return String(value || '').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildStableId(value) {
    return safeTrim(String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  }

  function resolveCurrentUserId() {
    return safeTrim(
      localStorage.getItem('user_id') ||
      localStorage.getItem('fixeo_user_id') ||
      localStorage.getItem('fixeo_user') ||
      localStorage.getItem('user_phone') ||
      ''
    ) || buildStableId(localStorage.getItem('user_name') || 'artisan-fixeo');
  }

  function getArtisanProfile() {
    return {
      name: safeTrim(localStorage.getItem('user_name')) || 'Artisan Fixeo',
      job: safeTrim(localStorage.getItem('user_job')) || 'Artisan',
      city: safeTrim(localStorage.getItem('user_city')) || 'Casablanca',
      userId: resolveCurrentUserId()
    };
  }

  function formatDate(value) {
    const timestamp = Date.parse(value || '');
    if (!timestamp) return 'Date non précisée';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }

  function formatBudget(value) {
    const budget = safeTrim(value);
    return budget || 'Budget à confirmer';
  }

  function getBudgetAmount(value) {
    const matches = String(value || '').match(/\d+[\d\s.,]*/g) || [];
    if (!matches.length) return 0;
    const numbers = matches
      .map((item) => Number(String(item).replace(/\s+/g, '').replace(',', '.')))
      .filter((item) => Number.isFinite(item) && item > 0);
    if (!numbers.length) return 0;
    return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
  }

  function formatMoney(amount) {
    const safeAmount = Number(amount || 0);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) return '—';
    return `${Math.round(safeAmount).toLocaleString('fr-FR')} MAD`;
  }

  function formatPercent(rate) {
    const safeRate = Number(rate || 0);
    if (!Number.isFinite(safeRate) || safeRate <= 0) return '0%';
    return `${Math.round(Math.max(0, Math.min(1, safeRate)) * 100)}%`;
  }

  function formatStars(rating) {
    const safeRating = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
    if (!safeRating) return '☆☆☆☆☆';
    return '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
  }

  function getTrustLevelMeta(level) {
    if (level === 'Elite') {
      return { label: 'Elite', color: '#0f766e', bg: 'rgba(16,185,129,.14)' };
    }
    if (level === 'Fiable') {
      return { label: 'Fiable', color: '#405DE6', bg: 'rgba(64,93,230,.14)' };
    }
    if (level === 'Standard') {
      return { label: 'Standard', color: '#b26a00', bg: 'rgba(252,175,69,.16)' };
    }
    return { label: 'Nouveau', color: '#7b8190', bg: 'rgba(123,129,144,.14)' };
  }

  function getTrustStats(profile) {
    return window.FixeoTrustScore?.getArtisanStats?.({ id: profile?.userId, name: profile?.name }) || {
      trust_score: 0,
      trust_level: 'Nouveau',
      total_reviews: 0,
      total_missions: 0,
      missions_validated: 0,
      average_rating: null,
      confirmation_rate: 0,
      payment_rate: 0
    };
  }

  function getStatusMeta(request) {
    const status = request?.status;
    const clientConfirmation = request?.client_confirmation;
    if (status === 'acceptée') {
      return { label: 'Acceptée', color: '#405DE6', bg: 'rgba(64,93,230,.12)' };
    }
    if (status === 'en_cours') {
      return { label: 'En cours', color: '#ff9800', bg: 'rgba(255,152,0,.14)' };
    }
    if (status === 'terminée' && clientConfirmation === 'en_attente') {
      return { label: 'En attente confirmation client', color: '#ff9800', bg: 'rgba(255,152,0,.14)' };
    }
    if (status === 'validée' || status === 'intervention_confirmée') {
      return { label: 'Mission validée par le client', color: '#20c997', bg: 'rgba(32,201,151,.12)' };
    }
    return { label: 'Terminée', color: '#20c997', bg: 'rgba(32,201,151,.12)' };
  }

  function getMissionAction(request) {
    if (request.status === 'acceptée') {
      return `<div class="fixeo-card-actions"><button type="button" class="btn btn-primary" data-mission-action="start" data-mission-id="${escapeHtml(request.id)}">Démarrer mission</button></div>`;
    }
    if (request.status === 'en_cours') {
      return `<div class="fixeo-card-actions"><button type="button" class="btn btn-primary" data-mission-action="finish" data-mission-id="${escapeHtml(request.id)}">Terminer mission</button></div>`;
    }
    if (request.status === 'terminée' && request.client_confirmation === 'en_attente') {
      return `
        <div class="fixeo-alert" style="margin-top:12px;color:#b26a00;background:rgba(255,152,0,.12);border:1px solid rgba(255,152,0,.22)">En attente confirmation client</div>
        <div class="fixeo-card-actions" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px">
          <button type="button" class="btn btn-secondary" disabled aria-disabled="true">Démarrer mission</button>
          <button type="button" class="btn btn-secondary" disabled aria-disabled="true">Terminer mission</button>
          <button type="button" class="btn btn-primary" data-mission-action="client-confirm" data-mission-id="${escapeHtml(request.id)}">Confirmer côté client</button>
        </div>`;
    }
    if (request.status === 'validée') {
      return '<div class="fixeo-alert fixeo-alert--success">Mission validée par le client.</div>';
    }
    if (request.status === 'intervention_confirmée') {
      return '<div class="fixeo-alert fixeo-alert--success">Intervention confirmée.</div>';
    }
    return '<div class="fixeo-alert fixeo-alert--success">Mission terminée et conservée dans votre historique.</div>';
  }

  function buildReviewFormBlock(request) {
    if (request.status !== 'validée' || request.review_submitted === true) return '';
    return `
      <div class="fixeo-review-box" style="margin-top:14px;padding:14px;border:1px solid rgba(64,93,230,.16);border-radius:16px;background:rgba(64,93,230,.04)">
        <button type="button" class="btn btn-primary" data-review-toggle="${escapeHtml(request.id)}">Laisser un avis client</button>
        <div class="fixeo-review-form" data-review-form="${escapeHtml(request.id)}" data-review-rating="0" style="display:none;margin-top:12px">
          <div style="font-weight:700;margin-bottom:8px">Note : ⭐⭐⭐⭐⭐ (1 à 5)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button type="button" class="btn btn-secondary" data-review-star="1" data-mission-id="${escapeHtml(request.id)}">★ 1</button>
            <button type="button" class="btn btn-secondary" data-review-star="2" data-mission-id="${escapeHtml(request.id)}">★ 2</button>
            <button type="button" class="btn btn-secondary" data-review-star="3" data-mission-id="${escapeHtml(request.id)}">★ 3</button>
            <button type="button" class="btn btn-secondary" data-review-star="4" data-mission-id="${escapeHtml(request.id)}">★ 4</button>
            <button type="button" class="btn btn-secondary" data-review-star="5" data-mission-id="${escapeHtml(request.id)}">★ 5</button>
          </div>
          <div class="fixeo-review-selected" style="font-size:14px;color:#405DE6;font-weight:600;margin-bottom:10px">Aucune note sélectionnée</div>
          <textarea data-review-comment="${escapeHtml(request.id)}" placeholder="Commentaire client" style="width:100%;min-height:96px;border-radius:14px;border:1px solid rgba(64,93,230,.18);padding:12px;resize:vertical;background:#fff"></textarea>
          <div style="margin-top:12px">
            <button type="button" class="btn btn-primary" data-review-submit="${escapeHtml(request.id)}">Envoyer avis</button>
          </div>
        </div>
      </div>`;
  }

  function buildReadonlyReview(request) {
    if (request.review_submitted !== true) return '';
    const comment = safeTrim(request.review_comment);
    return `
      <div class="fixeo-review-box" style="margin-top:14px;padding:14px;border:1px solid rgba(32,201,151,.16);border-radius:16px;background:rgba(32,201,151,.05)">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
          <strong style="color:#167d61">Avis client envoyé</strong>
          <span class="fixeo-status-badge" style="color:#167d61;background:rgba(32,201,151,.12);border-color:rgba(32,201,151,.25)">${escapeHtml(formatStars(request.review_rating))} ${escapeHtml(String(request.review_rating || 0))}/5</span>
        </div>
        ${comment ? `<p style="margin:10px 0 0;color:#334155">${escapeHtml(comment)}</p>` : '<p style="margin:10px 0 0;color:#7b8190">Aucun commentaire ajouté.</p>'}
        <div style="margin-top:8px;color:#7b8190;font-size:13px">Posté le ${escapeHtml(formatDate(request.review_date))}</div>
      </div>`;
  }

  function getCommissionMeta(status) {
    if (status === 'payée') {
      return { label: 'Commission réglée', color: '#20c997', bg: 'rgba(32,201,151,.12)' };
    }
    if (status === 'à_payer') {
      return { label: 'Commission à payer', color: '#E1306C', bg: 'rgba(225,48,108,.12)' };
    }
    return null;
  }

  function buildCommissionBlock(request) {
    const amount = Number(request?.commission_amount || 0);
    const isCommissionVisible = request?.commission_status === 'payée' || request?.status === 'validée' || request?.status === 'intervention_confirmée';
    if (!(amount > 0) || !isCommissionVisible) return '';
    const commissionMeta = getCommissionMeta(request.commission_status);
    const paymentDate = request.commission_status === 'payée'
      ? `<span>• Réglée le ${escapeHtml(formatDate(request.commission_paid_at))}</span>`
      : '';
    const badge = commissionMeta
      ? `<span class="fixeo-status-badge" style="color:${commissionMeta.color};background:${commissionMeta.bg};border-color:${commissionMeta.color}33">${commissionMeta.label}</span>`
      : '';

    return `
      <div class="fixeo-mission-card__meta" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span>💸 Commission Fixeo : ${escapeHtml(formatMoney(amount))}</span>
        ${badge}
        ${paymentDate}
      </div>`;
  }

  function buildRequestCard(request) {
    const isLocked = Boolean(request?.locked);
    const badge = isLocked
      ? '<span class="fixeo-client-request-pill" style="background:rgba(123,129,144,.16);color:#7b8190;border-color:rgba(123,129,144,.25)">Déjà prise</span>'
      : '<span class="fixeo-client-request-pill is-new">Disponible</span>';
    const buttonState = isLocked ? ' disabled aria-disabled="true"' : '';
    const buttonClass = isLocked ? 'btn btn-secondary' : 'btn btn-primary';
    const buttonText = isLocked ? 'Déjà prise' : 'Accepter la demande';
    return `
      <article class="fixeo-client-request-card" data-request-id="${escapeHtml(request.id)}">
        <div class="fixeo-client-request-head">
          <div>
            <h3>${escapeHtml(request.service || 'Service à préciser')}</h3>
            <div class="fixeo-client-request-meta">
              <span class="fixeo-client-request-pill">📍 ${escapeHtml(request.city || 'Ville à préciser')}</span>
              ${badge}
            </div>
          </div>
        </div>
        <p class="fixeo-client-request-desc">${escapeHtml(request.description || 'Description à préciser')}</p>
        <div class="fixeo-client-request-footer">
          <div>
            <div class="fixeo-client-request-budget">💰 ${escapeHtml(formatBudget(request.budget))}</div>
            <div class="fixeo-client-request-date">🕒 ${escapeHtml(formatDate(request.created_at))}</div>
          </div>
          <button type="button" class="${buttonClass}" data-accept-request="${escapeHtml(request.id)}"${buttonState}>${buttonText}</button>
        </div>
      </article>`;
  }

  function buildMissionCard(request) {
    const status = getStatusMeta(request);
    const acceptedAt = request.accepted_at || request.created_at;
    return `
      <article class="fixeo-mission-card" data-mission-card-id="${escapeHtml(request.id)}">
        <div class="fixeo-mission-card__top">
          <div>
            <h3 class="fixeo-mission-card__title">${escapeHtml(request.service || 'Service à préciser')} • ${escapeHtml(request.city || 'Ville à préciser')}</h3>
            <div class="fixeo-mission-card__meta">
              <span>🗓️ Acceptée le ${escapeHtml(formatDate(acceptedAt))}</span>
              <span>📍 ${escapeHtml(request.city || 'Ville à préciser')}</span>
            </div>
          </div>
          <span class="fixeo-status-badge" style="color:${status.color};background:${status.bg};border-color:${status.color}33">${status.label}</span>
        </div>
        <div class="payment-info">${escapeHtml(request.description || 'Description à préciser')}</div>
        <div class="fixeo-mission-card__meta" style="margin-top:10px;display:grid;gap:8px">
          <span>💰 Budget : ${escapeHtml(formatBudget(request.budget))}</span>
          <span>⚡ Urgence : ${escapeHtml(safeTrim(request.urgency) || 'Normale')}</span>
          <span>📞 Téléphone : ${escapeHtml(safeTrim(request.phone) || 'Non renseigné')}</span>
          <span>👤 Artisan : ${escapeHtml(request.assigned_artisan || 'Non attribuée')}</span>
        </div>
        ${buildCommissionBlock(request)}
        ${getMissionAction(request)}
        ${buildReviewFormBlock(request)}
        ${buildReadonlyReview(request)}
      </article>`;
  }

  function getRequestContainers() {
    return {
      overviewList: document.getElementById('priority-requests-list'),
      requestsList: document.getElementById('requests-grid')
    };
  }

  function getMissionContainers() {
    const section = document.getElementById('section-missions');
    return {
      section,
      list: document.getElementById('artisan-cod-missions'),
      extra: section ? section.querySelector('[data-missions]') : null,
      footer: document.getElementById('artisan-cod-notifications')
    };
  }

  function updateRequestHeadings() {
    const overviewHeading = document.querySelector('.artisan-requests .section-heading h2');
    const requestsHeading = document.querySelector('#section-requests .section-heading h2');
    if (overviewHeading) overviewHeading.textContent = 'Demandes disponibles';
    if (requestsHeading) requestsHeading.textContent = 'Demandes disponibles';
  }

  function updateRequestCounters(requests) {
    const count = requests.length;
    const heroCount = document.getElementById('new-requests-count');
    if (heroCount) {
      heroCount.textContent = count ? `${count} demande${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}` : 'Aucune demande disponible';
    }

    const urgentCount = document.getElementById('urgent-requests-count');
    if (urgentCount) urgentCount.textContent = String(count);

    const potentialRevenue = document.getElementById('potential-revenue-total');
    if (potentialRevenue) {
      const total = requests.reduce((sum, request) => sum + getBudgetAmount(request.budget), 0);
      potentialRevenue.textContent = formatMoney(total);
    }

    const requestsStat = document.getElementById('fixeo-dashboard-stat-requests');
    if (requestsStat) requestsStat.textContent = String(count);

    const sidebarBadge = document.querySelector('.sidebar-link[href="#requests"] span[style*="margin-left:auto"]');
    if (sidebarBadge) sidebarBadge.textContent = String(count);
  }

  function updateMissionOverviewStats(stats) {
    const acceptedValue = document.getElementById('stat-response-rate');
    const acceptedLabel = acceptedValue?.parentElement?.querySelector('span');
    if (acceptedValue) acceptedValue.textContent = String(stats.demandes_acceptees);
    if (acceptedLabel) acceptedLabel.textContent = 'Demandes acceptées';

    const inProgressValue = document.getElementById('stat-rating-score');
    const inProgressLabel = inProgressValue?.parentElement?.querySelector('span');
    if (inProgressValue) inProgressValue.textContent = String(stats.missions_en_cours);
    if (inProgressLabel) inProgressLabel.textContent = 'Missions en cours';

    const completedValue = document.getElementById('stat-missions-count');
    const completedLabel = completedValue?.parentElement?.querySelector('span');
    if (completedValue) completedValue.textContent = String(stats.missions_terminees);
    if (completedLabel) completedLabel.textContent = 'Missions terminées';
  }

  function ensureMissionStatsHost() {
    const { section, list } = getMissionContainers();
    if (!section || !list) return null;
    let host = document.getElementById('fixeo-mission-flow-stats');
    if (!host) {
      host = document.createElement('div');
      host.id = 'fixeo-mission-flow-stats';
      host.style.marginBottom = '18px';
      section.insertBefore(host, list);
    }
    return host;
  }

  function renderMissionStats(stats) {
    const host = ensureMissionStatsHost();
    if (!host) return;
    host.innerHTML = `
      <section class="fixeo-cod-shell">
        <div class="fixeo-cod-kpis">
          <div class="fixeo-cod-kpi"><strong>${stats.demandes_acceptees}</strong><span>Demandes acceptées</span></div>
          <div class="fixeo-cod-kpi"><strong>${stats.missions_en_cours}</strong><span>Missions en cours</span></div>
          <div class="fixeo-cod-kpi"><strong>${stats.missions_terminees}</strong><span>Missions terminées</span></div>
        </div>
      </section>`;
  }

  function renderReviewSummary(profile) {
    const host = ensureMissionStatsHost();
    if (!host) return;
    const stats = window.FixeoClientRequestsStore?.getReviewStatsForArtisan?.(profile.userId) || { total_reviews: 0, average_rating: null };
    let reviewHost = document.getElementById('fixeo-review-summary');
    if (!reviewHost) {
      reviewHost = document.createElement('div');
      reviewHost.id = 'fixeo-review-summary';
      reviewHost.style.marginTop = '12px';
      host.insertAdjacentElement('afterend', reviewHost);
    }

    if (stats.average_rating == null || !stats.total_reviews) {
      reviewHost.innerHTML = '';
      reviewHost.style.display = 'none';
      return;
    }

    reviewHost.style.display = '';
    reviewHost.innerHTML = `
      <section class="fixeo-cod-shell" style="margin-top:12px">
        <div class="fixeo-cod-kpi" style="display:block">
          <strong>${escapeHtml(formatStars(Math.round(stats.average_rating)))} ${escapeHtml(stats.average_rating.toFixed(1))} / 5</strong>
          <span>${escapeHtml(String(stats.total_reviews))} avis</span>
        </div>
      </section>`;
  }

  function renderTrustSummary(profile) {
    const host = ensureMissionStatsHost();
    if (!host) return;

    const stats = getTrustStats(profile);
    const theme = getTrustLevelMeta(stats.trust_level);
    let trustHost = document.getElementById('fixeo-trust-summary');
    if (!trustHost) {
      trustHost = document.createElement('div');
      trustHost.id = 'fixeo-trust-summary';
      trustHost.style.marginTop = '12px';
      const reviewHost = document.getElementById('fixeo-review-summary');
      if (reviewHost && reviewHost.parentNode) {
        reviewHost.insertAdjacentElement('afterend', trustHost);
      } else {
        host.insertAdjacentElement('afterend', trustHost);
      }
    }

    const ratingBlock = stats.average_rating == null || !stats.total_reviews
      ? ''
      : `<div class="fixeo-cod-kpi"><strong>${escapeHtml(formatStars(stats.average_rating))} ${escapeHtml(stats.average_rating.toFixed(1))} / 5</strong><span>${escapeHtml(String(stats.total_reviews))} avis</span></div>`;

    trustHost.innerHTML = `
      <section class="fixeo-cod-shell" style="margin-top:12px">
        <div class="chart-card" style="padding:18px;border:1px solid ${theme.color}22;background:linear-gradient(135deg, rgba(15,23,42,.94), rgba(15,23,42,.84))">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;font-weight:700">Trust Score artisan</div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px">
                <strong style="font-size:2rem;line-height:1;color:#fff">${escapeHtml(String(stats.trust_score || 0))} / 100</strong>
                <span class="fixeo-status-badge" style="color:${theme.color};background:${theme.bg};border-color:${theme.color}33">${escapeHtml(theme.label)}</span>
              </div>
            </div>
            <div style="font-size:.84rem;color:#94a3b8;max-width:240px">Calcul intelligent basé sur les avis, les missions validées, la confirmation client et les commissions réglées.</div>
          </div>
          <div class="fixeo-cod-kpis" style="margin-top:14px">
            ${ratingBlock}
            <div class="fixeo-cod-kpi"><strong>${escapeHtml(String(stats.missions_validated || 0))}</strong><span>Missions validées</span></div>
            <div class="fixeo-cod-kpi"><strong>${escapeHtml(formatPercent(stats.confirmation_rate))}</strong><span>Taux confirmation client</span></div>
            <div class="fixeo-cod-kpi"><strong>${escapeHtml(formatPercent(stats.payment_rate))}</strong><span>Paiement commission</span></div>
          </div>
        </div>
      </section>`;
  }

  function renderEmptyState(message) {
    return `<div class="fixeo-client-request-empty">${escapeHtml(message)}</div>`;
  }

  function getAvailableRequests() {
    if (!window.FixeoClientRequestsStore) return [];
    const requests = window.FixeoClientRequestsStore.getAvailableForArtisan(getArtisanProfile());
    const seenIds = new Set();
    return requests.filter((request) => {
      const requestId = safeTrim(request?.id);
      if (!requestId || seenIds.has(requestId)) return false;
      if (!window.FixeoClientRequestsStore?.isAvailableStatus?.(request?.status)) return false;
      if (request?.locked) return false;
      if (safeTrim(request?.assigned_artisan) || safeTrim(request?.assigned_artisan_id) || safeTrim(request?.accepted_at)) return false;
      seenIds.add(requestId);
      return true;
    });
  }

  function getMissions() {
    if (!window.FixeoClientRequestsStore) return [];
    const profile = getArtisanProfile();
    return window.FixeoClientRequestsStore.getMissionsForArtisan(profile.name, profile.userId);
  }

  function renderRequests() {
    if (!window.FixeoClientRequestsStore) return;
    updateRequestHeadings();
    const requests = getAvailableRequests();
    const html = requests.length
      ? `<div class="fixeo-client-requests-stack">${requests.map(buildRequestCard).join('')}</div>`
      : renderEmptyState('Aucune demande disponible pour le moment');

    const { overviewList, requestsList } = getRequestContainers();
    if (overviewList) overviewList.innerHTML = html;
    if (requestsList) requestsList.innerHTML = html;
    updateRequestCounters(requests);
  }

  function renderMissions() {
    if (!window.FixeoClientRequestsStore) return;
    const profile = getArtisanProfile();
    const missions = getMissions();
    const stats = window.FixeoClientRequestsStore.getMissionStatsForArtisan(profile.name, profile.userId);
    const { list, extra, footer } = getMissionContainers();

    renderMissionStats(stats);
    renderReviewSummary(profile);
    renderTrustSummary(profile);
    updateMissionOverviewStats(stats);

    if (list) {
      list.innerHTML = missions.length
        ? missions.map(buildMissionCard).join('')
        : renderEmptyState('Aucune mission pour le moment');
    }

    if (extra) {
      extra.innerHTML = '';
      extra.style.display = 'none';
    }

    if (footer) {
      footer.innerHTML = '';
      footer.style.display = 'none';
    }

    renderRecentMissionsTable(missions);
  }

  function renderRecentMissionsTable(missions) {
    const tbody = document.querySelector('.jobs-table-body');
    if (!tbody) return;

    if (!missions.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#7b8190;padding:18px">Aucune mission enregistrée</td></tr>';
      return;
    }

    tbody.innerHTML = missions.slice(0, 5).map((request) => {
      const status = getStatusMeta(request);
      return `
        <tr>
          <td>#${escapeHtml(String(request.id).slice(-6))}</td>
          <td>${escapeHtml(safeTrim(request.phone) || 'Client Fixeo')}</td>
          <td>${escapeHtml(request.service || 'Service')}</td>
          <td><span class="fixeo-status-badge" style="color:${status.color};background:${status.bg};border-color:${status.color}33">${status.label}</span></td>
          <td>${escapeHtml(formatBudget(request.budget))}</td>
          <td>${escapeHtml(formatDate(request.accepted_at || request.created_at))}</td>
        </tr>`;
    }).join('');
  }

  function removeCardByRequestId(requestId) {
    if (!requestId) return;
    const normalizedId = String(requestId);
    document.querySelectorAll('[data-request-id], [data-mission-card-id]').forEach((node) => {
      const nodeId = node.getAttribute('data-request-id') || node.getAttribute('data-mission-card-id');
      if (String(nodeId) === normalizedId) {
        node.remove();
      }
    });
  }

  function handleAccept(button) {
    const requestId = safeTrim(button?.getAttribute('data-accept-request'));
    if (!requestId || button.disabled) return;
    button.disabled = true;
    button.classList.add('loading');

    const profile = getArtisanProfile();
    const result = window.FixeoClientRequestsStore?.acceptRequest(requestId, profile.name, profile.userId);
    if (!result?.ok) {
      button.disabled = false;
      button.classList.remove('loading');
      if (result?.reason === 'already_taken') {
        button.textContent = 'Déjà prise';
        button.classList.remove('btn-primary');
        button.classList.add('btn-secondary');
        window.showToast?.("Cette demande vient d'être acceptée par un autre artisan", "info");
        window.notifications?.error?.("Cette demande vient d'être acceptée par un autre artisan", "");
      } else {
        window.notifications?.error?.('Impossible d’accepter la demande', 'Cette demande est introuvable ou déjà traitée.');
      }
      renderAll();
      return;
    }

    removeCardByRequestId(result.request?.id || requestId);
    window.notifications?.success?.('Demande acceptée', 'La mission a été ajoutée à votre section Missions.');
    renderAll();
  }

  function handleMissionAction(button) {
    const requestId = safeTrim(button?.getAttribute('data-mission-id'));
    const action = safeTrim(button?.getAttribute('data-mission-action'));
    if (!requestId || !action || button.disabled) return;
    button.disabled = true;

    const profile = getArtisanProfile();
    const isClientConfirm = action === 'client-confirm';
    const nextStatus = action === 'start' ? 'en_cours' : (action === 'finish' ? 'terminée' : '');
    const updated = isClientConfirm
      ? window.FixeoClientRequestsStore?.confirmClientCompletion?.(requestId, profile.name, profile.userId)
      : window.FixeoClientRequestsStore?.updateMissionStatus(requestId, nextStatus, profile.name, profile.userId);
    if (!updated) {
      button.disabled = false;
      window.notifications?.error?.('Action impossible', 'Cette mission ne peut pas être mise à jour.');
      renderAll();
      return;
    }

    if (isClientConfirm) {
      window.notifications?.success?.('Mission validée', 'La mission a été confirmée côté client.');
    } else {
      window.notifications?.success?.(
        action === 'start' ? 'Mission démarrée' : 'Mission terminée',
        action === 'start' ? 'La mission est maintenant en cours.' : 'En attente de la confirmation finale du client.'
      );
    }
    renderAll();
  }

  function handleReviewToggle(button) {
    const requestId = safeTrim(button?.getAttribute('data-review-toggle'));
    if (!requestId) return;
    const form = document.querySelector(`[data-review-form="${requestId}"]`);
    if (!form) return;
    const isHidden = form.style.display === 'none' || !form.style.display;
    form.style.display = isHidden ? 'block' : 'none';
    button.textContent = isHidden ? 'Masquer avis client' : 'Laisser un avis client';
  }

  function handleReviewStar(button) {
    const requestId = safeTrim(button?.getAttribute('data-mission-id'));
    const rating = Number(button?.getAttribute('data-review-star') || 0);
    const form = document.querySelector(`[data-review-form="${requestId}"]`);
    if (!form) return;
    form.dataset.reviewRating = String(rating);
    form.querySelectorAll('[data-review-star]').forEach((starButton) => {
      const starValue = Number(starButton.getAttribute('data-review-star') || 0);
      starButton.classList.toggle('btn-primary', starValue === rating);
      starButton.classList.toggle('btn-secondary', starValue !== rating);
    });
    const label = form.querySelector('.fixeo-review-selected');
    if (label) label.textContent = `${formatStars(rating)} ${rating}/5`;
  }

  function handleReviewSubmit(button) {
    const requestId = safeTrim(button?.getAttribute('data-review-submit'));
    if (!requestId || button.disabled) return;
    const form = document.querySelector(`[data-review-form="${requestId}"]`);
    if (!form) return;
    const rating = Number(form.dataset.reviewRating || 0);
    const comment = form.querySelector(`[data-review-comment="${requestId}"]`)?.value || '';
    if (rating < 1 || rating > 5) {
      window.showToast?.('Veuillez sélectionner une note entre 1 et 5', 'info');
      window.notifications?.error?.('Avis incomplet', 'Veuillez sélectionner une note valide.');
      return;
    }

    button.disabled = true;
    button.classList.add('loading');
    const profile = getArtisanProfile();
    const result = window.FixeoClientRequestsStore?.submitClientReview?.(requestId, rating, comment, profile.userId);
    if (!result?.ok) {
      button.disabled = false;
      button.classList.remove('loading');
      window.notifications?.error?.('Avis impossible', 'Cet avis est déjà envoyé ou la mission ne peut pas recevoir d’avis.');
      renderAll();
      return;
    }

    window.notifications?.success?.('Avis enregistré', 'L’avis client a été ajouté à la mission.');
    renderAll();
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    document.addEventListener('click', function (event) {
      const acceptButton = event.target.closest('[data-accept-request]');
      if (acceptButton) {
        handleAccept(acceptButton);
        return;
      }

      const missionButton = event.target.closest('[data-mission-action]');
      if (missionButton) {
        handleMissionAction(missionButton);
        return;
      }

      const reviewToggle = event.target.closest('[data-review-toggle]');
      if (reviewToggle) {
        handleReviewToggle(reviewToggle);
        return;
      }

      const reviewStar = event.target.closest('[data-review-star]');
      if (reviewStar) {
        handleReviewStar(reviewStar);
        return;
      }

      const reviewSubmit = event.target.closest('[data-review-submit]');
      if (reviewSubmit) {
        handleReviewSubmit(reviewSubmit);
      }
    });

    window.addEventListener('fixeo:client-request-created', renderAll);
    window.addEventListener('fixeo:client-request-updated', renderAll);
    window.addEventListener('storage', function (event) {
      if (event.key === (window.FixeoClientRequestsStore?.storageKey || 'fixeo_client_requests')) {
        renderAll();
      }
    });
  }

  function injectPanelClass() {
    const { overviewList, requestsList } = getRequestContainers();
    overviewList?.classList.add('fixeo-client-requests-panel');
    requestsList?.classList.add('fixeo-client-requests-panel');
  }

  function renderAll() {
    renderRequests();
    renderMissions();
  }

  function init() {
    if (!document.getElementById('priority-requests-list') || !document.getElementById('requests-grid')) return;
    injectPanelClass();
    bindEvents();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
