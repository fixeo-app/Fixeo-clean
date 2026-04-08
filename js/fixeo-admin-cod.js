(function (window, document) {
  'use strict';

  const STORAGE_KEY = 'fixeo_client_requests';
  const COMMISSION_RATE = 0.15;
  const COMPLETED_STATUSES = ['terminée', 'validée', 'intervention_confirmée'];
  const COMMISSION_ACTIVE_STATUSES = ['validée', 'intervention_confirmée'];
  let actionsBound = false;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function safeJSONParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeStatus(value) {
    const normalized = normalizeText(value || 'nouvelle');
    if (normalized === 'acceptee' || normalized === 'accepte') return 'acceptée';
    if (normalized === 'en cours' || normalized === 'en cours ' || normalized === 'en_cours' || normalized === 'encours') return 'en_cours';
    if (normalized === 'terminee' || normalized === 'termine') return 'terminée';
    if (normalized === 'validee' || normalized === 'valide') return 'validée';
    if (normalized === 'intervention confirmee' || normalized === 'intervention confirmee ' || normalized === 'intervention_confirmee') return 'intervention_confirmée';
    return 'nouvelle';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function roundMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount);
  }

  function parseMoney(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value);
    const matches = String(value || '').match(/\d+[\d\s.,]*/g) || [];
    if (!matches.length) return 0;
    const numbers = matches
      .map((item) => Number(String(item).replace(/\s+/g, '').replace(',', '.')))
      .filter((item) => Number.isFinite(item) && item > 0);
    if (!numbers.length) return 0;
    return roundMoney(numbers.reduce((sum, item) => sum + item, 0) / numbers.length);
  }

  function formatMoney(amount) {
    const safeAmount = roundMoney(amount);
    return safeAmount > 0 ? `${safeAmount.toLocaleString('fr-FR')} MAD` : '—';
  }

  function formatDate(value) {
    const timestamp = Date.parse(value || '');
    if (!timestamp) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }

  function getStatusMeta(mission) {
    const status = mission?.status;
    const clientConfirmation = mission?.client_confirmation;
    if (status === 'acceptée') return { label: 'Acceptée', color: '#405DE6', bg: 'rgba(64,93,230,.12)' };
    if (status === 'en_cours') return { label: 'En cours', color: '#ff9800', bg: 'rgba(255,152,0,.14)' };
    if (status === 'terminée' && clientConfirmation === 'en_attente') return { label: 'En attente confirmation client', color: '#ff9800', bg: 'rgba(255,152,0,.14)' };
    if (status === 'validée' || status === 'intervention_confirmée') return { label: 'Validée', color: '#20c997', bg: 'rgba(32,201,151,.12)' };
    if (status === 'terminée') return { label: 'Terminée', color: '#E1306C', bg: 'rgba(225,48,108,.12)' };
    return { label: 'Nouvelle', color: '#9aa0aa', bg: 'rgba(154,160,170,.12)' };
  }

  function getPaymentMeta(status) {
    if (status === 'payée') return { label: 'Payée', color: '#20c997', bg: 'rgba(32,201,151,.12)' };
    if (status === 'à_payer') return { label: 'À payer', color: '#E1306C', bg: 'rgba(225,48,108,.12)' };
    return { label: '—', color: '#9aa0aa', bg: 'rgba(154,160,170,.12)' };
  }

  function deriveFinalPrice(raw) {
    return roundMoney(raw?.final_price || raw?.price || raw?.agreed_price || parseMoney(raw?.budget || ''));
  }

  function deriveCommission(raw, finalPrice, status) {
    const explicit = roundMoney(raw?.commission_amount || raw?.commission || raw?.fixeo_commission || 0);
    if (explicit > 0) return explicit;
    if (finalPrice > 0 && COMMISSION_ACTIVE_STATUSES.includes(status)) return roundMoney(finalPrice * COMMISSION_RATE);
    return 0;
  }

  function normalizePaymentStatus(raw, commissionAmount, status) {
    const value = normalizeText(raw?.commission_status || '');
    if (commissionAmount > 0 && (value === 'payee' || value === 'paye' || raw?.commission_paid === true)) return 'payée';
    if (commissionAmount > 0 && COMMISSION_ACTIVE_STATUSES.includes(status)) return 'à_payer';
    return '';
  }

  function readAllRequests() {
    const rawList = safeJSONParse(localStorage.getItem(STORAGE_KEY) || '[]', []);
    return Array.isArray(rawList) ? rawList : [];
  }

  function normalizeMission(raw, index) {
    const status = normalizeStatus(raw?.status);
    const id = String(raw?.id || '').trim();
    const finalPrice = deriveFinalPrice(raw);
    const commissionAmount = deriveCommission(raw, finalPrice, status);
    const commissionStatus = normalizePaymentStatus(raw, commissionAmount, status);
    const clientConfirmation = (function () {
      const normalized = normalizeText(raw?.client_confirmation || '');
      if (normalized === 'en attente' || normalized === 'en_attente') return 'en_attente';
      if (normalized === 'confirmee' || normalized === 'confirmee') return 'confirmée';
      if (COMMISSION_ACTIVE_STATUSES.includes(status)) return 'confirmée';
      return '';
    })();
    return {
      id,
      service: String(raw?.service || '').trim() || 'Service à préciser',
      city: String(raw?.city || raw?.ville || '').trim() || 'Ville à préciser',
      description: String(raw?.description || '').trim() || 'Description à préciser',
      phone: String(raw?.phone || raw?.telephone || '').trim(),
      budget: String(raw?.budget || '').trim(),
      assigned_artisan: String(raw?.assigned_artisan || '').trim(),
      assigned_artisan_id: String(raw?.assigned_artisan_id || '').trim(),
      status,
      client_confirmation: clientConfirmation,
      created_at: String(raw?.created_at || '').trim(),
      accepted_at: String(raw?.accepted_at || '').trim(),
      completed_at: String(raw?.completed_at || '').trim(),
      validated_at: String(raw?.validated_at || '').trim(),
      final_price: finalPrice,
      commission_amount: commissionAmount,
      commission_status: commissionStatus,
      commission_paid_at: commissionStatus === 'payée' ? String(raw?.commission_paid_at || '').trim() : '',
      commission_paid_by: commissionStatus === 'payée' ? String(raw?.commission_paid_by || '').trim() || 'admin' : '',
      review_rating: Number(raw?.review_rating || 0) || 0,
      review_comment: String(raw?.review_comment || '').trim(),
      review_submitted: raw?.review_submitted === true,
      review_date: String(raw?.review_date || '').trim()
    };
  }

  function isRealMission(mission) {
    return !!mission.id && !!mission.assigned_artisan && mission.status !== 'nouvelle';
  }

  function isEligibleForPayment(mission) {
    return COMMISSION_ACTIVE_STATUSES.includes(mission.status)
      && mission.commission_amount > 0
      && mission.commission_status !== 'payée';
  }

  function getAllMissions() {
    return readAllRequests().map(normalizeMission).filter(isRealMission);
  }

  function getFilteredMissions() {
    const search = normalizeText(document.getElementById('cod-search')?.value || '');
    const filter = String(document.getElementById('cod-filter-status')?.value || '').trim();
    return getAllMissions().filter(function (mission) {
      const haystack = normalizeText([
        mission.id,
        mission.service,
        mission.city,
        mission.description,
        mission.phone,
        mission.assigned_artisan,
        mission.review_comment
      ].join(' '));
      const matchesSearch = !search || haystack.includes(search);
      let matchesFilter = true;
      if (filter === 'en_attente') matchesFilter = (mission.status !== 'nouvelle') && !COMMISSION_ACTIVE_STATUSES.includes(mission.status);
      if (filter === 'validee') matchesFilter = COMMISSION_ACTIVE_STATUSES.includes(mission.status);
      if (filter === 'a_payer') matchesFilter = isEligibleForPayment(mission);
      if (filter === 'payee') matchesFilter = mission.commission_status === 'payée';
      return matchesSearch && matchesFilter;
    });
  }

  function getMetrics(missions) {
    const list = Array.isArray(missions) ? missions : getAllMissions();
    return list.reduce(function (metrics, mission) {
      metrics.total += 1;
      if (!COMMISSION_ACTIVE_STATUSES.includes(mission.status) && mission.status !== 'nouvelle') metrics.pending += 1;
      if (COMMISSION_ACTIVE_STATUSES.includes(mission.status)) metrics.validated += 1;
      if (mission.commission_status === 'payée') metrics.commissionsPaid += mission.commission_amount;
      if (mission.commission_amount > 0 && mission.commission_status !== 'payée' && COMMISSION_ACTIVE_STATUSES.includes(mission.status)) metrics.commissionsDue += mission.commission_amount;
      return metrics;
    }, {
      total: 0,
      pending: 0,
      validated: 0,
      commissionsDue: 0,
      commissionsPaid: 0
    });
  }

  function updateKpis(metrics) {
    const total = document.getElementById('cod-kpi-total');
    const pending = document.getElementById('cod-kpi-pending');
    const confirmed = document.getElementById('cod-kpi-confirmed');
    const revenue = document.getElementById('cod-kpi-revenue');
    const commission = document.getElementById('cod-kpi-commission');
    if (total) total.textContent = String(metrics.total);
    if (pending) pending.textContent = String(metrics.pending);
    if (confirmed) confirmed.textContent = String(metrics.validated);
    if (revenue) revenue.textContent = formatMoney(metrics.commissionsPaid);
    if (commission) commission.textContent = formatMoney(metrics.commissionsDue);

    total?.nextElementSibling && (total.nextElementSibling.textContent = 'Missions réelles');
    pending?.nextElementSibling && (pending.nextElementSibling.textContent = 'Missions en attente');
    confirmed?.nextElementSibling && (confirmed.nextElementSibling.textContent = 'Missions validées');
    revenue?.nextElementSibling && (revenue.nextElementSibling.textContent = 'Commissions payées');
    commission?.nextElementSibling && (commission.nextElementSibling.textContent = 'Commissions dues');

    const sidebarCount = document.getElementById('sc-cod');
    if (sidebarCount) sidebarCount.textContent = String(metrics.total);
  }

  function updateFiltersUi() {
    const sectionTitle = document.querySelector('#admin-section-cod-orders > h2');
    const sectionSubtitle = document.querySelector('#admin-section-cod-orders > p');
    if (sectionTitle) sectionTitle.textContent = '💵 Missions & commissions';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Paiement des commissions Fixeo basé uniquement sur les missions réelles enregistrées dans l’application.';

    const filter = document.getElementById('cod-filter-status');
    if (filter) {
      filter.innerHTML = [
        '<option value="">Tous statuts</option>',
        '<option value="en_attente">🕐 Missions en attente</option>',
        '<option value="validee">✅ Missions validées</option>',
        '<option value="a_payer">🟠 Commissions à payer</option>',
        '<option value="payee">🟢 Commissions payées</option>'
      ].join('');
    }
  }

  function renderReviewStars(rating, submitted) {
    if (submitted !== true || Number(rating || 0) < 1) return '—';
    const safeRating = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
    return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)} ${safeRating}/5`;
  }

  function renderTable(missions) {
    const table = document.getElementById('cod-admin-table');
    const tbody = document.getElementById('cod-admin-tbody');
    if (!table || !tbody) return;

    const thead = table.querySelector('thead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Réf.</th>
          <th>Artisan</th>
          <th>Service</th>
          <th>Prix final</th>
          <th>Commission</th>
          <th>Statut mission</th>
          <th>Statut paiement</th>
          <th>Date paiement</th>
          <th>Avis ⭐</th>
          <th>Commentaire</th>
          <th>Date avis</th>
          <th>Actions</th>
        </tr>`;
    }

    tbody.innerHTML = missions.length ? missions.map(function (mission) {
      const statusMeta = getStatusMeta(mission);
      const paymentMeta = getPaymentMeta(mission.commission_status);
      const canPay = isEligibleForPayment(mission);
      const actionHtml = canPay
        ? `<button class="btn btn-sm btn-primary" data-admin-action="mark-commission-paid" data-mission-id="${escapeHtml(mission.id)}">Marquer payé</button>`
        : (mission.commission_status === 'payée'
            ? '<span class="fixeo-status-badge" style="color:#20c997;background:rgba(32,201,151,.12);border-color:rgba(32,201,151,.25)">Payée</span>'
            : '—');
      return `
        <tr>
          <td><strong>#${escapeHtml(String(mission.id).slice(-8))}</strong></td>
          <td>${escapeHtml(mission.assigned_artisan || 'Non attribuée')}</td>
          <td>${escapeHtml(mission.service)}</td>
          <td>${escapeHtml(formatMoney(mission.final_price))}</td>
          <td>${escapeHtml(formatMoney(mission.commission_amount))}</td>
          <td><span class="fixeo-status-badge" style="color:${statusMeta.color};background:${statusMeta.bg};border-color:${statusMeta.color}33">${statusMeta.label}</span></td>
          <td>${mission.commission_status ? `<span class="fixeo-status-badge" style="color:${paymentMeta.color};background:${paymentMeta.bg};border-color:${paymentMeta.color}33">${paymentMeta.label}</span>` : '—'}</td>
          <td>${escapeHtml(formatDate(mission.commission_paid_at))}</td>
          <td>${escapeHtml(renderReviewStars(mission.review_rating, mission.review_submitted))}</td>
          <td>${mission.review_submitted ? escapeHtml(mission.review_comment || '—') : '—'}</td>
          <td>${escapeHtml(formatDate(mission.review_date))}</td>
          <td style="white-space:nowrap">${actionHtml}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="12" style="text-align:center;color:#7b8190">Aucune mission réelle à afficher.</td></tr>';
  }

  function markCommissionPaidById(missionId) {
    const id = String(missionId || '').trim();
    if (!id) return false;
    const rawRequests = readAllRequests();
    let changed = false;
    const nextRequests = rawRequests.map(function (raw, index) {
      const mission = normalizeMission(raw, index);
      if (String(mission.id) !== id) return raw;
      if (!isEligibleForPayment(mission)) return raw;
      changed = true;
      return Object.assign({}, raw, {
        id: mission.id,
        commission_status: 'payée',
        commission_paid: true,
        commission_paid_at: new Date().toISOString(),
        commission_paid_by: 'admin'
      });
    });
    if (!changed) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRequests));
    try {
      window.dispatchEvent(new CustomEvent('fixeo:client-request-updated', { detail: { id: id, commission_status: 'payée' } }));
    } catch (error) {
      /* noop */
    }
    return true;
  }

  function renderAll() {
    updateFiltersUi();
    const allMissions = getAllMissions();
    updateKpis(getMetrics(allMissions));
    renderTable(getFilteredMissions());
  }

  function bindActions() {
    if (actionsBound) return;
    actionsBound = true;

    document.body.addEventListener('click', function (event) {
      const target = event.target.closest('[data-admin-action="mark-commission-paid"]');
      if (!target) return;
      const missionId = target.getAttribute('data-mission-id');
      const changed = markCommissionPaidById(missionId);
      if (changed) {
        window.showToast?.('✅ Commission marquée payée', 'success');
        renderAll();
      } else {
        window.showToast?.('ℹ️ Cette commission est déjà réglée ou non éligible', 'info');
      }
    });

    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) renderAll();
    });
    window.addEventListener('fixeo:client-request-updated', renderAll);
    window.addEventListener('fixeo:client-request-created', renderAll);
  }

  window.filterCODOrders = function () {
    renderAll();
  };

  window.refreshCODOrders = function () {
    renderAll();
  };

  ready(function () {
    if (document.body.dataset.dashType !== 'admin') return;
    if (!document.getElementById('admin-section-cod-orders')) return;
    bindActions();
    renderAll();
  });
})(window, document);
