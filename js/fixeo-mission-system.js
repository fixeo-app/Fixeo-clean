(function (window) {
  'use strict';

  const STORAGE_KEY = 'fixeo_missions_v2';
  const LEGACY_KEY = 'fixeo_reservations';
  const LEGACY_COD_KEY = 'fixeo_cod_orders';
  const COMMISSION_RATE = 0.15;
  const CASH_MESSAGE = '💵 Paiement directement à l’artisan après intervention';
  const ARTISAN_DIRECTORY = [];

  function isDemoIdentifier(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^art_demo_/i.test(normalized) || /^(?:[1-9]|1[0-2])$/.test(normalized);
  }

  function getLiveArtisanDirectory() {
    const marketplace = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
    const onboarding = window.FixeoArtisanOnboardingStore && typeof window.FixeoArtisanOnboardingStore.getEntries === 'function'
      ? window.FixeoArtisanOnboardingStore.getEntries()
      : [];
    const pool = marketplace.concat(onboarding).filter(function (artisan) {
      return artisan && typeof artisan === 'object';
    });
    const seen = new Set();
    return pool.map(function (artisan) {
      const id = String(artisan.id || artisan.public_id || artisan.artisan_id || '').trim();
      const name = String(artisan.name || '').trim();
      if (!id || !name || isDemoIdentifier(id) || seen.has(id)) return null;
      seen.add(id);
      return {
        id: id,
        name: name,
        service: String(artisan.service || artisan.category || '').trim(),
        city: String(artisan.city || 'Maroc').trim() || 'Maroc',
        rating: Number(artisan.rating || 0) || 0
      };
    }).filter(Boolean);
  }

  const STATUS_META = {
    pending: { label: 'Demande envoyée', color: '#ffa502', bg: 'rgba(255,165,2,.12)' },
    accepted: { label: 'Artisan choisi', color: '#4da3ff', bg: 'rgba(77,163,255,.14)' },
    in_progress: { label: 'Intervention commencée', color: '#7c5cff', bg: 'rgba(124,92,255,.14)' },
    completed: { label: 'Intervention terminée', color: '#20c997', bg: 'rgba(32,201,151,.12)' },
    validated: { label: 'Intervention confirmée', color: '#20c997', bg: 'rgba(32,201,151,.18)' },
    cancelled: { label: 'Mission annulée', color: '#ff5d73', bg: 'rgba(255,93,115,.14)' }
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function parseJSON(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function formatMad(value) {
    return `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} MAD`;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function roundCommission(amount) {
    return Math.round((Number(amount) || 0) * COMMISSION_RATE);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function dispatchUpdate(missions) {
    window.dispatchEvent(new CustomEvent('fixeo:missions:updated', {
      detail: { missions: clone(missions) }
    }));
  }

  function normalizeProposal(proposal, mission) {
    return {
      artisan_id: proposal.artisan_id,
      artisan_name: proposal.artisan_name,
      rating: Number(proposal.rating || 4.8),
      price: Math.round(Number(proposal.price) || 0),
      submitted_at: proposal.submitted_at || nowIso(),
      selected: !!proposal.selected,
      city: proposal.city || mission.city || 'Casablanca',
      payment_message: CASH_MESSAGE,
      note: proposal.note || 'Paiement cash après intervention'
    };
  }

  function ensureDerivedMission(rawMission) {
    const mission = Object.assign({
      proposals: [],
      payment_method: 'cash_after_service',
      payment_message: CASH_MESSAGE,
      issue_reported: false,
      issue_status: null,
      locked: false,
      price_validated: false,
      commission_rate: COMMISSION_RATE,
      commission_amount: 0,
      artisan_net: 0,
      commission_due: false,
      commission_paid: false,
      reminder_due: false,
      notifications: []
    }, rawMission || {});

    mission.proposals = (mission.proposals || []).map(function (proposal) {
      return normalizeProposal(proposal, mission);
    });

    if (mission.artisan_id) {
      mission.proposals = mission.proposals.map(function (proposal) {
        proposal.selected = proposal.artisan_id === mission.artisan_id;
        return proposal;
      });
      const chosen = mission.proposals.find(function (proposal) {
        return proposal.artisan_id === mission.artisan_id;
      });
      if (chosen && !mission.artisan_name) mission.artisan_name = chosen.artisan_name;
    }

    if (!mission.target_artisan_id && mission.proposals.length) {
      mission.target_artisan_id = mission.proposals[0].artisan_id;
      mission.target_artisan_name = mission.proposals[0].artisan_name;
    }

    if (mission.status === 'validated' && Number(mission.final_price) > 0) {
      mission.commission_rate = COMMISSION_RATE;
      mission.commission_amount = roundCommission(mission.final_price);
      mission.artisan_net = Math.round(Number(mission.final_price) - mission.commission_amount);
      mission.commission_due = true;
    }

    if (mission.status === 'completed' && mission.completed_at && !mission.validated_at) {
      const elapsed = Date.now() - new Date(mission.completed_at).getTime();
      mission.reminder_due = elapsed >= 24 * 60 * 60 * 1000;
      if (mission.reminder_due) {
        mission.client_reminder_message = 'Merci de confirmer que l’intervention a bien été réalisée.';
        if (!mission.reminder_sent_at) mission.reminder_sent_at = nowIso();
      }
    } else {
      mission.reminder_due = false;
    }

    return mission;
  }

  function generateInitialMissions() {
    return [];
  }

  function readMissions() {
    const parsed = parseJSON(localStorage.getItem(STORAGE_KEY), null);
    if (!Array.isArray(parsed) || !parsed.length) {
      const seeded = generateInitialMissions();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      syncLegacyReservations(seeded);
      return seeded;
    }
    const normalized = parsed.map(ensureDerivedMission);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    syncLegacyReservations(normalized);
    return normalized;
  }

  function writeMissions(missions) {
    const normalized = missions.map(ensureDerivedMission);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    syncLegacyReservations(normalized);
    dispatchUpdate(normalized);
    return normalized;
  }

  function syncLegacyReservations(missions) {
    const reservations = missions.map(function (mission) {
      return {
        id: mission.id,
        bookingRef: mission.id,
        client: mission.client_name,
        artisan: mission.artisan_name || '—',
        artisanName: mission.artisan_name || '—',
        artisanId: mission.artisan_id || null,
        service: mission.service,
        city: mission.city,
        date: new Date(mission.created_at || nowIso()).toLocaleDateString('fr-FR'),
        timeSlot: mission.locked ? 'Mission verrouillée' : 'À confirmer',
        status: mission.status,
        payStatus: mission.status === 'validated' ? 'validated' : mission.status,
        paymentMethod: 'Paiement cash après intervention',
        method: 'Paiement cash après intervention',
        price: Number(mission.final_price || 0),
        final_price: Number(mission.final_price || 0),
        commission: mission.status === 'validated' ? Number(mission.commission_amount || 0) : 0,
        netArtisan: mission.status === 'validated' ? Number(mission.artisan_net || 0) : Number(mission.final_price || 0),
        orderStatus: mission.status,
        slotLock: !!mission.locked,
        issue_reported: !!mission.issue_reported,
        issue_status: mission.issue_status || null,
        validated_at: mission.validated_at || null,
        commission_paid: !!mission.commission_paid,
        type: 'mission_cod'
      };
    });
    localStorage.setItem(LEGACY_KEY, JSON.stringify(reservations));
    localStorage.setItem(LEGACY_COD_KEY, JSON.stringify(reservations));
  }

  function getMission(id) {
    return readMissions().find(function (mission) { return mission.id === id; }) || null;
  }

  function updateMission(id, updater) {
    const missions = readMissions();
    const index = missions.findIndex(function (mission) { return mission.id === id; });
    if (index === -1) return null;
    const updated = updater(clone(missions[index]));
    missions[index] = ensureDerivedMission(updated);
    writeMissions(missions);
    return missions[index];
  }

  function getProposal(mission, artisanId) {
    return (mission.proposals || []).find(function (proposal) {
      return proposal.artisan_id === artisanId;
    }) || null;
  }

  function pushNotification(mission, title, body) {
    mission.notifications = mission.notifications || [];
    mission.notifications.unshift({
      id: uid('NOTIF'),
      artisan_id: mission.artisan_id || null,
      title: title,
      body: body,
      created_at: nowIso()
    });
  }

  function notifyUser(userId, message, type, options) {
    if (!userId) return;
    if (!window.notifications || typeof window.notifications.createNotification !== 'function') return;
    window.notifications.createNotification(userId, message, type, options || {});
  }

  function ensureMissionsStore() {
    return readMissions();
  }

  function addOrUpdateProposal(missionId, proposal) {
    return updateMission(missionId, function (mission) {
      if (mission.status !== 'pending') return mission;
      const existingIndex = mission.proposals.findIndex(function (item) {
        return item.artisan_id === proposal.artisan_id;
      });
      const normalized = normalizeProposal(proposal, mission);
      if (existingIndex >= 0) mission.proposals[existingIndex] = normalized;
      else mission.proposals.push(normalized);
      notifyUser(
        mission.client_id || localStorage.getItem('fixeo_user') || '',
        `${normalized.artisan_name} a répondu à votre demande ${mission.service}.`,
        'new_reply',
        {
          title: 'Nouvelle réponse artisan',
          action_href: 'dashboard-client.html',
          meta: { mission_id: mission.id, city: mission.city, service: mission.service }
        }
      );
      return mission;
    });
  }

  function chooseArtisan(missionId, artisanId) {
    return updateMission(missionId, function (mission) {
      const selectedProposal = getProposal(mission, artisanId);
      if (!selectedProposal) return mission;
      mission.status = 'accepted';
      mission.artisan_id = selectedProposal.artisan_id;
      mission.artisan_name = selectedProposal.artisan_name;
      mission.accepted_at = nowIso();
      mission.proposals = mission.proposals.map(function (proposal) {
        proposal.selected = proposal.artisan_id === artisanId;
        return proposal;
      });
      notifyUser(
        selectedProposal.artisan_id,
        `Vous avez été choisi pour la mission ${mission.service} à ${mission.city}.`,
        'mission_accepted',
        {
          title: 'Mission acceptée',
          action_href: 'dashboard-artisan.html',
          meta: { mission_id: mission.id, city: mission.city, service: mission.service }
        }
      );
      return mission;
    });
  }

  function validatePrice(missionId, price) {
    return updateMission(missionId, function (mission) {
      if (!mission.artisan_id) return mission;
      mission.final_price = Math.round(Number(price) || 0);
      mission.price_validated = true;
      mission.price_validated_at = nowIso();
      mission.locked = true;
      return mission;
    });
  }

  function startMission(missionId) {
    return updateMission(missionId, function (mission) {
      if (!mission.locked || !mission.price_validated || mission.status === 'cancelled') return mission;
      mission.status = 'in_progress';
      mission.in_progress_at = nowIso();
      return mission;
    });
  }

  function completeMission(missionId) {
    return updateMission(missionId, function (mission) {
      if (!mission.locked || ['cancelled', 'validated'].includes(mission.status)) return mission;
      mission.status = 'completed';
      mission.completed_at = nowIso();
      mission.reminder_due = false;
      notifyUser(
        mission.client_id || localStorage.getItem('fixeo_user') || '',
        `Votre artisan a terminé la mission ${mission.service}. Merci de confirmer si tout est OK.`,
        'mission_completed',
        {
          title: 'Mission terminée',
          action_href: 'dashboard-client.html',
          meta: { mission_id: mission.id, city: mission.city, service: mission.service }
        }
      );
      return mission;
    });
  }

  function validateMission(missionId) {
    return updateMission(missionId, function (mission) {
      if (mission.status !== 'completed') return mission;
      mission.status = 'validated';
      mission.validated_at = nowIso();
      mission.issue_reported = false;
      mission.issue_status = null;
      mission.commission_rate = COMMISSION_RATE;
      mission.commission_amount = roundCommission(mission.final_price);
      mission.artisan_net = Math.round(Number(mission.final_price || 0) - mission.commission_amount);
      mission.commission_due = true;
      pushNotification(mission, 'Nouvelle mission validée 🎉', `Commission ajoutée : ${mission.commission_amount} MAD`);
      notifyUser(
        mission.artisan_id || localStorage.getItem('fixeo_user') || '',
        `Le client a validé votre mission ${mission.service}. Commission calculée : ${mission.commission_amount} MAD.`,
        'mission_validated',
        {
          title: 'Mission validée',
          action_href: 'dashboard-artisan.html',
          meta: { mission_id: mission.id, city: mission.city, service: mission.service }
        }
      );
      return mission;
    });
  }

  function reportIssue(missionId, note) {
    return updateMission(missionId, function (mission) {
      mission.issue_reported = true;
      mission.issue_status = 'open';
      mission.issue_note = note || 'Problème signalé par le client';
      return mission;
    });
  }

  function cancelMission(missionId) {
    return updateMission(missionId, function (mission) {
      mission.status = 'cancelled';
      mission.cancelled_at = nowIso();
      return mission;
    });
  }

  function markCommissionPaid(missionId, paid) {
    return updateMission(missionId, function (mission) {
      if (mission.status !== 'validated') return mission;
      mission.commission_paid = !!paid;
      mission.commission_paid_at = paid ? nowIso() : null;
      return mission;
    });
  }

  function listMissions() {
    return readMissions().sort(function (a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }

  function getMissionsForArtisan(artisanName) {
    const targetName = String(artisanName || '').trim().toLowerCase();
    return listMissions().filter(function (mission) {
      const hasProposal = (mission.proposals || []).some(function (proposal) {
        return String(proposal.artisan_name || '').trim().toLowerCase() === targetName;
      });
      const isAssigned = String(mission.artisan_name || '').trim().toLowerCase() === targetName;
      return hasProposal || isAssigned;
    });
  }

  function getMetrics() {
    const missions = listMissions();
    const validated = missions.filter(function (mission) { return mission.status === 'validated'; });
    const completedPending = missions.filter(function (mission) { return mission.status === 'completed'; });
    return {
      total: missions.length,
      pending: missions.filter(function (mission) { return mission.status === 'pending'; }).length,
      accepted: missions.filter(function (mission) { return mission.status === 'accepted'; }).length,
      in_progress: missions.filter(function (mission) { return mission.status === 'in_progress'; }).length,
      completed: completedPending.length,
      validated: validated.length,
      cancelled: missions.filter(function (mission) { return mission.status === 'cancelled'; }).length,
      issues_open: missions.filter(function (mission) { return mission.issue_reported && mission.issue_status === 'open'; }).length,
      reminders_due: missions.filter(function (mission) { return mission.reminder_due; }).length,
      commission_due_total: validated.reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0),
      commissions_unpaid_total: validated.filter(function (mission) { return !mission.commission_paid; }).reduce(function (sum, mission) { return sum + Number(mission.commission_amount || 0); }, 0),
      gross_validated_total: validated.reduce(function (sum, mission) { return sum + Number(mission.final_price || 0); }, 0)
    };
  }

  function pickAlternativeArtisans(service, excludeId) {
    const directory = getLiveArtisanDirectory();
    const normalizedService = String(service || '').trim().toLowerCase();
    const candidates = directory.filter(function (artisan) {
      return artisan.id !== excludeId && String(artisan.service || '').trim().toLowerCase() === normalizedService;
    });
    if (candidates.length) return candidates.slice(0, 2);
    return directory.filter(function (artisan) { return artisan.id !== excludeId; }).slice(0, 2);
  }

  function createMissionFromQuote(payload) {
    const directory = getLiveArtisanDirectory();
    const requestedId = String(payload && payload.artisanId || '').trim();
    const requestedName = String(payload && payload.artisanName || '').trim().toLowerCase();
    const artisan = directory.find(function (item) {
      return (requestedId && item.id === requestedId)
        || (requestedName && String(item.name || '').trim().toLowerCase() === requestedName);
    });
    if (!artisan) return null;

    const safePrice = Number(payload.suggestedPrice || 0);
    const basePrice = Number.isFinite(safePrice) && safePrice > 0 ? Math.round(safePrice) : 200;
    const alternatives = pickAlternativeArtisans(payload.service || artisan.service, artisan.id);
    const mission = ensureDerivedMission({
      id: uid('MIS'),
      client_name: localStorage.getItem('fixeo_user_name') || 'Client',
      client_id: localStorage.getItem('fixeo_user') || '',
      service: payload.service || artisan.service || 'Service',
      city: payload.city || artisan.city || 'Maroc',
      description: payload.description,
      requested_date: payload.requestedDate || null,
      phone: payload.phone || '',
      status: 'pending',
      created_at: nowIso(),
      target_artisan_id: artisan.id,
      target_artisan_name: artisan.name,
      proposals: [
        { artisan_id: artisan.id, artisan_name: artisan.name, price: basePrice, rating: artisan.rating || 0, submitted_at: nowIso(), note: 'Proposition prioritaire depuis le profil artisan.' }
      ].concat(alternatives.map(function (alt, index) {
        return {
          artisan_id: alt.id,
          artisan_name: alt.name,
          price: basePrice + (index + 1) * 20,
          rating: alt.rating,
          submitted_at: nowIso(),
          note: 'Proposition alternative pour permettre la comparaison.'
        };
      }))
    });
    const missions = listMissions();
    missions.unshift(mission);
    writeMissions(missions);
    notifyUser(
      artisan.id,
      `Nouvelle demande reçue à ${mission.city || artisan.city || 'Maroc'}.`,
      'new_request',
      {
        title: 'Nouvelle demande reçue',
        action_href: 'dashboard-artisan.html',
        meta: { mission_id: mission.id, city: mission.city, service: mission.service }
      }
    );
    return mission;
  }

  function getStatusMeta(status) {
    return STATUS_META[status] || STATUS_META.pending;
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    COMMISSION_RATE: COMMISSION_RATE,
    CASH_MESSAGE: CASH_MESSAGE,
    STATUS_META: STATUS_META,
    formatMad: formatMad,
    escapeHtml: escapeHtml,
    seed: ensureMissionsStore,
    list: listMissions,
    get: getMission,
    getMetrics: getMetrics,
    getMissionsForArtisan: getMissionsForArtisan,
    getStatusMeta: getStatusMeta,
    addOrUpdateProposal: addOrUpdateProposal,
    chooseArtisan: chooseArtisan,
    validatePrice: validatePrice,
    startMission: startMission,
    completeMission: completeMission,
    validateMission: validateMission,
    reportIssue: reportIssue,
    cancelMission: cancelMission,
    markCommissionPaid: markCommissionPaid,
    createMissionFromQuote: createMissionFromQuote
  };

  window.FixeoMissionSystem = api;
  ensureMissionsStore();
})(window);
