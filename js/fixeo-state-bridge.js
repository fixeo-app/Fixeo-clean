/**
 * FIXEO STATE BRIDGE v1.0
 * ========================
 * Single shared state manager connecting Admin, Artisan & Client dashboards.
 * Reads/writes from localStorage via the existing stores:
 *   • window.FixeoClientRequestsStore  (fixeo_client_requests)
 *   • window.FixeoMissionSystem        (fixeo_missions_v2)
 *   • window.ARTISANS                  (marketplace artisan pool)
 *
 * Exposes: window.FixeoStateBridge
 *
 * Events dispatched (all dashboards listen):
 *   fixeo:state:updated          — any state change
 *   fixeo:client-request-created — client submitted a request
 *   fixeo:request-accepted       — client accepted artisan response
 *   fixeo:mission-started        — artisan started intervention
 *   fixeo:mission-completed      — artisan marked complete
 *   fixeo:mission-validated      — client confirmed completion
 *   fixeo:commission-paid        — admin marked commission paid
 *   fixeo:review-submitted       — client submitted review
 *
 * COMMISSION RULE: 15% of final mission price → Fixeo
 */
;(function (window, document) {
  'use strict';

  /* ─── Constants ─────────────────────────────────────────── */
  const COMMISSION_RATE   = 0.15;
  const REQUESTS_KEY      = 'fixeo_client_requests';
  const MISSIONS_KEY      = 'fixeo_missions_v2';
  const NOTIF_KEY         = 'fixeo_bridge_notifications';
  const BRIDGE_VER        = '1.0';

  /* Canonical status labels (maps both stores) */
  const STATUS = {
    PENDING   : 'nouvelle',
    RESPONDED : 'réponse_envoyée',
    ACCEPTED  : 'acceptée',
    ACTIVE    : 'en_cours',
    COMPLETED : 'terminée',
    VALIDATED : 'validée',
    PAID      : 'payée_cod',
    REVIEWED  : 'avis_soumis',
    CANCELLED : 'annulée'
  };

  /* ─── Utilities ─────────────────────────────────────────── */
  function safeJSON(v, fb) { try { return JSON.parse(v) ?? fb; } catch { return fb; } }
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function fmtMAD(n) { return Math.round(Number(n)||0).toLocaleString('fr-FR') + ' MAD'; }
  function fmtNum(n) { return (Math.round(Number(n)||0)).toLocaleString('fr-FR'); }
  function uid() { return 'br-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6); }
  function nowISO() { return new Date().toISOString(); }

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    window.dispatchEvent(new CustomEvent('fixeo:state:updated', { detail: { event: name, payload: detail } }));
  }

  /* ─── Raw storage access ────────────────────────────────── */
  function readRequests() {
    return safeJSON(localStorage.getItem(REQUESTS_KEY), []);
  }
  function writeRequests(arr) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(arr));
  }
  function readMissions() {
    return safeJSON(localStorage.getItem(MISSIONS_KEY), []);
  }

  /* ─── Artisan pool ───────────────────────────────────────── */
  function getArtisanPool() {
    const base = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
    const onboard = (window.FixeoArtisanOnboardingStore?.getEntries?.() || []);
    const seen = new Set();
    return base.concat(onboard).filter(a => {
      const id = String(a?.id || a?.artisan_id || '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /* ─── Notifications (cross-dashboard) ───────────────────── */
  function pushNotif(targetUserId, msg, type, meta) {
    if (!targetUserId) return;
    const all = safeJSON(localStorage.getItem(NOTIF_KEY), []);
    all.push({ id: uid(), targetUserId, msg, type: type||'info', meta: meta||{}, ts: nowISO(), read: false });
    localStorage.setItem(NOTIF_KEY, JSON.stringify(all.slice(-200)));
    // Also fire native notification if available
    if (window.notifications?.createNotification) {
      window.notifications.createNotification(targetUserId, msg, type||'info', meta||{});
    }
  }

  function getNotifs(userId) {
    return safeJSON(localStorage.getItem(NOTIF_KEY), []).filter(n => n.targetUserId === userId);
  }

  function markNotifsRead(userId) {
    const all = safeJSON(localStorage.getItem(NOTIF_KEY), []);
    const updated = all.map(n => n.targetUserId === userId ? { ...n, read: true } : n);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
  }

  /* ─── FixeoClientRequestsStore delegation ────────────────── */
  function getStore() { return window.FixeoClientRequestsStore || null; }
  function getMissionSys() { return window.FixeoMissionSystem || null; }

  /* ─── CORE METRICS ───────────────────────────────────────── */
  function computeGlobalMetrics() {
    const requests = readRequests();
    const artisanPool = getArtisanPool();

    let totalRequests   = 0;
    let pendingRequests = 0;
    let activeRequests  = 0;
    let completedRequests = 0;
    let validatedRequests = 0;
    let totalRevenue    = 0;
    let totalCommission = 0;
    let commissionPaid  = 0;
    let commissionDue   = 0;
    const clientIds     = new Set();
    const artisanIds    = new Set();
    const recentActivity = [];

    requests.forEach(function(r) {
      totalRequests++;

      // Unique clients
      const cid = String(r.client_id||r.user_id||r.phone||r.user_phone||'').trim();
      if (cid) clientIds.add(cid);

      // Unique artisans with accepted+ missions
      const aid = String(r.artisan_id||r.assigned_artisan_id||'').trim();
      const aname = String(r.artisan||r.assigned_artisan||'').trim();
      if (aid||aname) artisanIds.add(aid||aname);

      const status = String(r.status||'nouvelle').toLowerCase();
      const isCompleted = ['terminée','validée','intervention_confirmée','payée_cod','avis_soumis'].some(s => status.includes(s.replace('_','')));
      const isValidated = ['validée','intervention_confirmée','payée_cod','avis_soumis'].some(s => status.includes(s.replace('_','')));
      const isActive    = status.includes('cours') || status.includes('active') || status === 'acceptée' || status.includes('accept');
      const isPending   = ['nouvelle','réponse'].some(s => status.includes(s.slice(0,6)));

      if (isActive)    activeRequests++;
      else if (isCompleted) completedRequests++;
      else if (isPending)   pendingRequests++;

      if (isValidated || isCompleted) {
        const price = Number(r.final_price||r.price||r.price_from||r.price_to||r.amount||0);
        if (price > 0) {
          totalRevenue += price;
          const comm = Math.round(price * COMMISSION_RATE);
          totalCommission += comm;
          if (r.commission_paid || r.commission_status === 'paid') commissionPaid += comm;
          else commissionDue += comm;
        }
      }

      if (r.updated_at || r.created_at) {
        recentActivity.push({
          ts: r.updated_at || r.created_at,
          label: _activityLabel(r),
          status: status
        });
      }
    });

    // Mission system data
    const missionSys = getMissionSys();
    let missionMetrics = { total:0, active:0, completed:0, revenue:0, commission:0 };
    if (missionSys?.getMetrics) {
      try { missionMetrics = missionSys.getMetrics(); } catch(e) {}
    }

    // Artisan count
    const totalArtisans = artisanPool.filter(a => {
      const id = String(a?.id||'');
      // exclude pure demo/seeds (IDs 1-12, art_demo_*)
      return !/^art_demo_/i.test(id) && !/^([1-9]|1[0-2])$/.test(id);
    }).length;

    const activeArtisans = artisanPool.filter(a =>
      a.status === 'active' || a.available || a.available_today
    ).length;

    recentActivity.sort((a,b) => b.ts.localeCompare(a.ts));

    return {
      artisans: {
        total: totalArtisans,
        active: activeArtisans,
        inactive: totalArtisans - activeArtisans
      },
      clients: {
        total: Math.max(clientIds.size, 1)
      },
      requests: {
        total: totalRequests,
        pending: pendingRequests,
        active: activeRequests,
        completed: completedRequests,
        validated: validatedRequests
      },
      missions: {
        total: Math.max(totalRequests, missionMetrics.total||0),
        active: Math.max(activeRequests, missionMetrics.active||0),
        completed: Math.max(completedRequests, missionMetrics.completed||0)
      },
      revenue: {
        total: Math.max(totalRevenue, missionMetrics.revenue||0),
        commission: Math.max(totalCommission, missionMetrics.commission||0),
        commissionPaid: commissionPaid,
        commissionDue: commissionDue,
        rate: COMMISSION_RATE
      },
      recentActivity: recentActivity.slice(0, 20)
    };
  }

  function _activityLabel(r) {
    const s = String(r.status||'').toLowerCase();
    const service = String(r.service||r.category||'intervention').toLowerCase();
    const city    = String(r.city||'').trim();
    if (s.includes('validé') || s.includes('confirmé')) return `✅ Mission ${service} validée${city?' à '+city:''}`;
    if (s.includes('terminé')) return `🔧 Intervention ${service} terminée${city?' à '+city:''}`;
    if (s.includes('cours'))   return `⚡ Mission ${service} en cours${city?' à '+city:''}`;
    if (s.includes('accepté')) return `✔️ Devis accepté — ${service}${city?' à '+city:''}`;
    return `📋 Nouvelle demande ${service}${city?' à '+city:''}`;
  }

  /* ─── ADMIN KPI INJECTION ────────────────────────────────── */
  function injectAdminKPIs() {
    const m = computeGlobalMetrics();

    setText('kpi-artisans', fmtNum(m.artisans.total));
    setText('kpi-clients',  fmtNum(m.clients.total));
    setText('kpi-jobs',     fmtNum(m.missions.active + m.missions.completed));
    setText('kpi-revenue',  fmtNum(m.revenue.total));

    // Sidebar counts
    setText('sc-artisans',     fmtNum(m.artisans.total));
    setText('sc-clients',      fmtNum(m.clients.total));
    setText('sc-reservations', fmtNum(m.requests.pending));
    setText('sc-cod',          fmtNum(m.missions.active));

    // Reservations section KPIs
    setText('res-kpi-pending',    fmtNum(m.requests.pending));
    setText('res-kpi-confirmed',  fmtNum(m.requests.active));
    setText('res-kpi-inprogress', fmtNum(m.missions.active));
    setText('res-kpi-completed',  fmtNum(m.missions.completed));
    setText('res-kpi-revenue',    fmtNum(m.revenue.total));

    // COD/commission KPIs
    setText('cod-kpi-revenue',    fmtMAD(m.revenue.total));
    setText('cod-kpi-commission', fmtMAD(m.revenue.commission));
    setText('cod-kpi-paid',       fmtMAD(m.revenue.commissionPaid));
    setText('cod-kpi-due',        fmtMAD(m.revenue.commissionDue));

    // Art/kpi sub-section
    setText('art-kpi-total',    fmtNum(m.artisans.total));
    setText('art-kpi-active',   fmtNum(m.artisans.active));
    setText('art-kpi-inactive', fmtNum(m.artisans.inactive));

    // Activity feed
    _renderAdminActivity(m.recentActivity);

    // Update last-update timestamp
    const el = document.getElementById('last-update-time');
    if (el) el.textContent = new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  }

  function _renderAdminActivity(activities) {
    const list = document.getElementById('admin-activity-list');
    if (!list || !activities.length) return;
    list.innerHTML = activities.slice(0,8).map(a => `
      <div class="admin-activity-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
        <div class="activity-icon" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem">
          ${a.label.slice(0,2)}
        </div>
        <div class="activity-text" style="flex:1;min-width:0">
          <div style="font-size:.82rem;color:var(--text-primary,#f0f0f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.label.slice(3)}</div>
          <div style="font-size:.72rem;color:var(--text-muted,rgba(255,255,255,.45));margin-top:2px">${_relTime(a.ts)}</div>
        </div>
      </div>
    `).join('');
  }

  function _relTime(ts) {
    const diff = (Date.now() - Date.parse(ts)) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.round(diff/60)} min`;
    if (diff < 86400) return `Il y a ${Math.round(diff/3600)} h`;
    return `Il y a ${Math.round(diff/86400)} j`;
  }

  /* ─── ARTISAN DASHBOARD KPI INJECTION ───────────────────── */
  function injectArtisanKPIs() {
    const store = getStore();
    if (!store) return;

    const name = localStorage.getItem('user_name') || '';
    const id   = localStorage.getItem('user_id') || localStorage.getItem('fixeo_user_id') || '';

    const missions = store.getMissionsForArtisan ? store.getMissionsForArtisan(name, id) : [];
    const stats    = store.getMissionStatsForArtisan ? store.getMissionStatsForArtisan(name, id)
      : { demandes_acceptees:0, missions_en_cours:0, missions_terminees:0, chiffre_affaires:0, commissions:0 };

    const available = store.getAvailableForArtisan ? store.getAvailableForArtisan({
      city: localStorage.getItem('user_city')||'',
      job:  localStorage.getItem('user_job')||''
    }) : [];

    const newCount = available.length;
    const urgentCount = available.filter(r => r.urgency === 'urgente' || /urgent/i.test(r.description||'')).length;

    setText('new-requests-count',   `${newCount} nouvelle${newCount>1?'s':''} demande${newCount>1?'s':''}`);
    setText('urgent-requests-count', String(urgentCount));
    setText('stat-missions-count',   fmtNum(stats.missions_terminees || 0));

    // Earnings / commission
    const ca   = Number(stats.chiffre_affaires||0);
    const comm = Math.round(ca * COMMISSION_RATE);
    const net  = ca - comm;
    setText('artisan-earnings-total',     fmtMAD(ca));
    setText('artisan-commission-owed',    fmtMAD(comm));
    setText('artisan-net-earnings',       fmtMAD(net));

    // Revenue potential from available requests
    const potential = available.reduce((s,r) => s + (Number(r.price_from||r.amount||0)), 0);
    setText('potential-revenue-total', potential > 0 ? fmtMAD(potential) : '—');
  }

  /* ─── CLIENT DASHBOARD KPI INJECTION ────────────────────── */
  function injectClientKPIs() {
    const store = getStore();
    if (!store) return;

    const all = store.list ? store.list() : [];
    const myPhone = localStorage.getItem('user_phone') || localStorage.getItem('fixeo_user') || '';
    const myName  = localStorage.getItem('user_name') || '';

    // Filter to current user's requests
    const mine = all.filter(r => {
      const rPhone = String(r.phone||r.user_phone||'').trim();
      const rName  = String(r.client||r.client_name||'').trim();
      return (myPhone && rPhone === myPhone) || (myName && rName.toLowerCase() === myName.toLowerCase());
    });

    const pending   = mine.filter(r => ['nouvelle','réponse_envoyée'].some(s => r.status?.includes(s.slice(0,6)))).length;
    const active    = mine.filter(r => r.status?.includes('cours') || r.status === 'acceptée').length;
    const completed = mine.filter(r => ['terminée','validée','intervention_confirmée'].some(s => r.status?.includes(s.slice(0,4)))).length;

    const statsTarget = document.getElementById('client-stats-grid');
    if (statsTarget) {
      const stats = [
        { icon:'📋', label:'Demandes envoyées', value: mine.length },
        { icon:'⏳', label:'En attente',         value: pending },
        { icon:'⚡', label:'Missions actives',   value: active },
        { icon:'✅', label:'Missions terminées', value: completed }
      ];
      if (!statsTarget.dataset.bridgeRendered) {
        statsTarget.dataset.bridgeRendered = '1';
        statsTarget.innerHTML = stats.map(s => `
          <div class="client-stat-card" style="background:rgba(255,255,255,.05);border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px">
            <div style="font-size:1.5rem">${s.icon}</div>
            <div>
              <div style="font-size:1.4rem;font-weight:700">${fmtNum(s.value)}</div>
              <div style="font-size:.75rem;color:rgba(255,255,255,.55)">${s.label}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Hero name
    const heroName = document.getElementById('client-hero-name');
    if (heroName && myName) heroName.textContent = myName;
  }

  /* ─── WORKFLOW ACTIONS ───────────────────────────────────── */

  /**
   * 1. Client submits a request
   */
  function clientSubmitRequest(payload) {
    const store = getStore();
    if (!store?.appendRequest) return { ok: false, reason: 'store_missing' };
    const result = store.appendRequest(payload);
    if (result && !result.duplicated) {
      // Notify matching artisans (broadcast)
      dispatch('fixeo:client-request-created', result.request || result);
      _toastIfPresent('Demande envoyée', 'Les artisans disponibles vont vous contacter.', 'success');
    }
    return result;
  }

  /**
   * 2. Artisan sends a response/quote
   */
  function artisanSendResponse(missionId, artisanId, price, note) {
    const ms = getMissionSys();
    if (!ms?.addOrUpdateProposal) return { ok: false, reason: 'mission_sys_missing' };
    const artisanName = localStorage.getItem('user_name') || 'Artisan';
    ms.addOrUpdateProposal(missionId, {
      artisan_id: artisanId,
      artisan_name: artisanName,
      price: Number(price)||0,
      note: note||''
    });
    // Also update client_requests store
    const store = getStore();
    if (store?.updateMissionStatus) {
      store.updateMissionStatus(missionId, STATUS.RESPONDED, artisanName, artisanId);
    }
    dispatch('fixeo:artisan-responded', { missionId, artisanId, artisanName, price });
    _toastIfPresent('Devis envoyé', `Votre proposition de ${fmtMAD(price)} a été transmise.`, 'success');
    return { ok: true };
  }

  /**
   * 3. Client accepts artisan response
   */
  function clientAcceptResponse(requestId, artisanName, artisanId) {
    const store = getStore();
    if (!store?.acceptRequest) return { ok: false };
    const result = store.acceptRequest(requestId, artisanName, artisanId);
    if (result?.ok) {
      dispatch('fixeo:request-accepted', { requestId, artisanName, artisanId });
      pushNotif(artisanId, `✅ Le client a accepté votre devis. Intervention à planifier.`, 'success', { requestId });
      _toastIfPresent('Artisan choisi !', `${artisanName} va vous contacter pour l'intervention.`, 'success');
    }
    return result;
  }

  /**
   * 4. Artisan starts mission
   */
  function artisanStartMission(missionId) {
    const ms = getMissionSys();
    if (ms?.startMission) ms.startMission(missionId);
    const store = getStore();
    const artisanName = localStorage.getItem('user_name') || '';
    const artisanId   = localStorage.getItem('user_id') || '';
    if (store?.updateMissionStatus) {
      // Status must be 'acceptée' → 'en_cours'
      const all = readRequests();
      const req = all.find(function(r){ return String(r.id)===String(missionId); });
      const status = req ? String(req.status||'').toLowerCase() : '';
      if (status === 'acceptée' || status.includes('accept')) {
        store.updateMissionStatus(missionId, 'en_cours', artisanName, artisanId);
      }
    }
    dispatch('fixeo:mission-started', { missionId, artisanName });
    _toastIfPresent('Intervention démarrée', 'Le client est notifié.', 'info');
    return { ok: true };
  }

  /**
   * 5. Artisan marks mission complete
   */
  function artisanCompleteMission(missionId) {
    const ms = getMissionSys();
    if (ms?.completeMission) ms.completeMission(missionId);
    const store = getStore();
    const artisanName = localStorage.getItem('user_name') || '';
    const artisanId   = localStorage.getItem('user_id') || '';
    if (store?.updateMissionStatus) {
      // Must traverse: acceptée → en_cours → terminée
      const all = readRequests();
      const req = all.find(function(r){ return String(r.id)===String(missionId); });
      const status = req ? String(req.status||'').toLowerCase() : '';
      // If still at 'acceptée', move to en_cours first
      if (status === 'acceptée' || status.includes('accept')) {
        store.updateMissionStatus(missionId, 'en_cours', artisanName, artisanId);
      }
      // Now move to terminée (sets client_confirmation='en_attente' automatically)
      store.updateMissionStatus(missionId, 'terminée', artisanName, artisanId);
    }
    dispatch('fixeo:mission-completed', { missionId, artisanName });
    _toastIfPresent('Intervention terminée', 'Le client doit confirmer pour clôturer la mission.', 'success');
    return { ok: true };
  }

  /**
   * 6. Client validates/confirms completion
   */
  function clientValidateMission(requestId, artisanName, artisanId) {
    const store = getStore();
    if (!store?.confirmClientCompletion) return { ok: false };
    const result = store.confirmClientCompletion(requestId, artisanName, artisanId);
    if (result?.ok) {
      // Compute commission
      const req = (store.list?.() || []).find(r => String(r.id) === String(requestId));
      const price = Number(req?.final_price || req?.price_from || 0);
      const commission = Math.round(price * COMMISSION_RATE);
      dispatch('fixeo:mission-validated', { requestId, artisanName, artisanId, price, commission });
      pushNotif(artisanId, `🎉 Mission validée. Commission Fixeo : ${fmtMAD(commission)}`, 'success', { requestId, commission });
      _toastIfPresent('Mission validée !', `Merci. La commission Fixeo de ${fmtMAD(commission)} est due.`, 'success');
    }
    return result;
  }

  /**
   * 7. Client submits review
   */
  function clientSubmitReview(requestId, rating, comment, artisanId) {
    const store = getStore();
    if (!store?.submitClientReview) return { ok: false };
    const result = store.submitClientReview(requestId, rating, comment, artisanId);
    if (result?.ok) {
      dispatch('fixeo:review-submitted', { requestId, artisanId, rating, comment });
      pushNotif(artisanId, `⭐ Vous avez reçu un avis ${rating}/5.`, 'info', { requestId, rating });
      _toastIfPresent('Avis publié', `Merci d'avoir noté l'intervention.`, 'success');
    }
    return result;
  }

  /**
   * 8. Admin marks commission paid
   */
  function adminMarkCommissionPaid(requestId, artisanId) {
    const store = getStore();
    if (!store?.markCommissionPaid) return { ok: false };
    const result = store.markCommissionPaid(requestId);
    if (result?.ok) {
      dispatch('fixeo:commission-paid', { requestId, artisanId });
      pushNotif(artisanId, `💰 Commission Fixeo marquée payée pour la mission ${requestId}`, 'success', { requestId });
    }
    return result;
  }

  /* ─── MODAL WIRING ───────────────────────────────────────── */
  function wireModals() {
    // Client new request form submission
    document.addEventListener('fixeo:modal:submit-request', function(e) {
      clientSubmitRequest(e.detail || {});
      refreshAll();
    });

    // Artisan accept/respond action buttons
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-bridge-action]');
      if (!btn) return;
      const action    = btn.dataset.bridgeAction;
      const missionId = btn.dataset.missionId || btn.dataset.requestId;
      const artisanId = btn.dataset.artisanId || localStorage.getItem('user_id') || '';
      const price     = Number(btn.dataset.price) || 0;

      switch (action) {
        case 'artisan-respond':
          artisanSendResponse(missionId, artisanId, price, btn.dataset.note||'');
          break;
        case 'artisan-start':
          artisanStartMission(missionId);
          break;
        case 'artisan-complete':
          artisanCompleteMission(missionId);
          break;
        case 'client-accept':
          clientAcceptResponse(missionId, btn.dataset.artisanName||'', artisanId);
          break;
        case 'client-validate':
          clientValidateMission(missionId, btn.dataset.artisanName||'', artisanId);
          break;
        case 'client-review':
          const rating = Number(btn.dataset.rating) || 5;
          clientSubmitReview(missionId, rating, btn.dataset.comment||'', artisanId);
          break;
        case 'admin-commission-paid':
          adminMarkCommissionPaid(missionId, artisanId);
          break;
      }
      refreshAll();
    });

    // Request form in client dashboard
    const reqForm = document.getElementById('client-request-form') || document.getElementById('new-request-form');
    if (reqForm && !reqForm.dataset.bridgeWired) {
      reqForm.dataset.bridgeWired = '1';
      reqForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(reqForm));
        clientSubmitRequest({
          service:     data.service || data.category || '',
          description: data.description || data.details || '',
          city:        data.city || localStorage.getItem('user_city') || '',
          urgency:     data.urgency || 'normale',
          budget:      data.budget || '',
          phone:       data.phone || localStorage.getItem('user_phone') || '',
          client_name: data.name || localStorage.getItem('user_name') || '',
        });
        reqForm.reset();
        refreshAll();
      });
    }
  }

  /* ─── REFRESH ALL DASHBOARDS ─────────────────────────────── */
  function refreshAll() {
    const page = _currentPage();
    if (page === 'admin')    injectAdminKPIs();
    if (page === 'artisan')  injectArtisanKPIs();
    if (page === 'client')   injectClientKPIs();
    // Always fire global event so any page that's open refreshes
    dispatch('fixeo:state:updated', { ts: nowISO() });
  }

  function _currentPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('admin'))              return 'admin';
    if (path.includes('dashboard-artisan'))  return 'artisan';
    if (path.includes('dashboard-client'))   return 'client';
    return 'other';
  }

  /* ─── Toast helper ───────────────────────────────────────── */
  function _toastIfPresent(title, msg, type) {
    if (window.notifications?.success && type === 'success') { window.notifications.success(title, msg); return; }
    if (window.notifications?.info    && type === 'info')    { window.notifications.info(title, msg);    return; }
    if (window.notifications?.warning && type === 'warning') { window.notifications.warning(title, msg); return; }
    if (window.FixeoMissionSystem?.escapeHtml) {
      // Use built-in notification if custom one not available
      console.log(`[Fixeo Bridge] ${type.toUpperCase()}: ${title} — ${msg}`);
    }
  }

  /* ─── LISTEN FOR STATE CHANGES (cross-tab) ──────────────── */
  function bindListeners() {
    // Listen to existing store events
    ['fixeo:missions:updated',
     'fixeo:client-request-created',
     'fixeo:client-request-updated',
     'fixeo:commission-paid',
     'fixeo:review-submitted'].forEach(function(ev) {
      window.addEventListener(ev, refreshAll);
    });

    // StorageEvent: cross-tab sync
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY || e.key === MISSIONS_KEY) refreshAll();
    });
  }

  /* ─── INIT ───────────────────────────────────────────────── */
  function init() {
    const page = _currentPage();
    if (!['admin','artisan','client'].includes(page)) return;

    bindListeners();
    wireModals();

    // Initial render after stores are ready
    function doInit() {
      refreshAll();
      // Seed demo data if completely empty (first time)
      _maybeSeedDemoData();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        // Wait a tick for all other scripts to load
        setTimeout(doInit, 300);
      });
    } else {
      setTimeout(doInit, 300);
    }

    // Auto-refresh every 30s
    setInterval(refreshAll, 30000);
  }

  /* ─── DEMO SEED (only if store empty) ─────────────────────── */
  function _maybeSeedDemoData() {
    const existing = readRequests();
    if (existing.length > 0) return; // already has data

    const store = getStore();
    if (!store?.appendRequest) return;

    const DEMO = [
      { service:'plomberie', description:'Fuite sous évier, urgent', city:'Casablanca',
        urgency:'urgente', phone:'0600000001', client_name:'Ahmed Benali', price_from:250, status:'validée',
        assigned_artisan:'Karim Plombier', assigned_artisan_id:'art-demo-k1',
        final_price:300, commission_paid:false },
      { service:'électricité', description:'Court-circuit tableau général', city:'Rabat',
        urgency:'urgente', phone:'0600000002', client_name:'Fatima Zahra', price_from:200, status:'en_cours',
        assigned_artisan:'Hassan Elec', assigned_artisan_id:'art-demo-h2' },
      { service:'peinture', description:'Salon 35m², 2 couches', city:'Marrakech',
        urgency:'normale', phone:'0600000003', client_name:'Youssef Ait', price_from:1800, status:'acceptée',
        assigned_artisan:'Said Peintre', assigned_artisan_id:'art-demo-s3' },
      { service:'serrurerie', description:'Porte claquée, besoin urgence', city:'Casablanca',
        urgency:'urgente', phone:'0600000004', client_name:'Nadia Chraibi', price_from:180, status:'nouvelle' },
      { service:'nettoyage', description:'Nettoyage après travaux villa', city:'Agadir',
        urgency:'normale', phone:'0600000005', client_name:'Omar Tahiri', price_from:600, status:'terminée',
        assigned_artisan:'Clean Pro', assigned_artisan_id:'art-demo-c5',
        final_price:700, commission_paid:true }
    ];

    DEMO.forEach(function(d) {
      try { store.appendRequest(d); } catch(e) {}
    });

    console.log('[FixeoStateBridge] Demo data seeded (store was empty)');
  }

  /* ─── PUBLIC API ─────────────────────────────────────────── */
  window.FixeoStateBridge = {
    version: BRIDGE_VER,
    COMMISSION_RATE: COMMISSION_RATE,
    STATUS: STATUS,

    // Metrics
    computeGlobalMetrics: computeGlobalMetrics,

    // Dashboard injectors
    injectAdminKPIs:   injectAdminKPIs,
    injectArtisanKPIs: injectArtisanKPIs,
    injectClientKPIs:  injectClientKPIs,
    refreshAll:        refreshAll,

    // Workflow actions
    clientSubmitRequest:    clientSubmitRequest,
    artisanSendResponse:    artisanSendResponse,
    clientAcceptResponse:   clientAcceptResponse,
    artisanStartMission:    artisanStartMission,
    artisanCompleteMission: artisanCompleteMission,
    clientValidateMission:  clientValidateMission,
    clientSubmitReview:     clientSubmitReview,
    adminMarkCommissionPaid: adminMarkCommissionPaid,

    // Notifications
    pushNotif:    pushNotif,
    getNotifs:    getNotifs,
    markNotifsRead: markNotifsRead,

    // Utils
    fmtMAD: fmtMAD,
    fmtNum: fmtNum
  };

  init();

})(window, document);
