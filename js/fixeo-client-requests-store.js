(function () {
  'use strict';

  const STORAGE_KEY = 'fixeo_client_requests';
  const DEDUPE_WINDOW_MS = 2500;
  const COMMISSION_RATE = 0.15;
  const COMPLETED_STATUSES = ['terminée', 'validée', 'intervention_confirmée'];
  const COMMISSION_ACTIVE_STATUSES = ['validée', 'intervention_confirmée'];
  const CATEGORY_KEYWORDS = {
    plomberie: ['plomberie', 'plombier', 'fuite', 'eau', 'robinet', 'wc', 'canalisation', 'chauffe eau', 'chauffe-eau', 'sanitaire'],
    electricite: ['electricite', 'électricité', 'electricien', 'électricien', 'prise', 'panne', 'court circuit', 'court-circuit', 'tableau', 'lumiere', 'lumière'],
    peinture: ['peinture', 'peintre', 'mur', 'facade', 'façade', 'enduit'],
    nettoyage: ['nettoyage', 'menage', 'ménage', 'nettoyer', 'proprete', 'propreté', 'desinfection', 'désinfection'],
    jardinage: ['jardinage', 'jardinier', 'pelouse', 'haie', 'arrosage', 'jardin'],
    demenagement: ['demenagement', 'déménagement', 'demenager', 'déménager', 'transport', 'carton', 'meuble'],
    bricolage: ['bricolage', 'bricoleur', 'montage', 'reparation', 'réparation', 'fixation', 'petits travaux'],
    climatisation: ['climatisation', 'clim', 'climatiseur', 'froid', 'ventilation'],
    menuiserie: ['menuiserie', 'menuisier', 'bois', 'porte', 'placard', 'meuble sur mesure'],
    maconnerie: ['maconnerie', 'maçonnerie', 'macon', 'maçon', 'beton', 'béton', 'carrelage', 'mur'],
    serrurerie: ['serrurerie', 'serrurier', 'serrure', 'porte bloquee', 'porte bloquée', 'cle', 'clé']
  };

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

  function hasOwnValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
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

  function deriveFinalPrice(raw) {
    return roundMoney(
      raw?.final_price || raw?.price || raw?.agreed_price || raw?.budget_value || parseMoney(raw?.budget || raw?.price_label || '')
    );
  }

  function deriveCommission(raw, finalPrice) {
    const explicit = roundMoney(raw?.commission_amount || raw?.commission || raw?.fixeo_commission || 0);
    if (explicit > 0) return explicit;
    if (finalPrice > 0 && COMMISSION_ACTIVE_STATUSES.includes(normalizeStatus(raw?.status))) {
      return roundMoney(finalPrice * COMMISSION_RATE);
    }
    return 0;
  }

  function isAvailableStatus(value) {
    const normalized = normalizeText(value || 'nouvelle');
    return !normalized || normalized === 'nouvelle' || normalized === 'disponible';
  }

  function normalizeStatus(value) {
    const normalized = normalizeText(value || 'nouvelle');
    if (isAvailableStatus(normalized)) return 'nouvelle';
    if (normalized === 'acceptee' || normalized === 'accepte') return 'acceptée';
    if (normalized === 'en cours' || normalized === 'en cours ' || normalized === 'en_cours' || normalized === 'encours') return 'en_cours';
    if (normalized === 'terminee' || normalized === 'termine') return 'terminée';
    if (normalized === 'validee' || normalized === 'valide') return 'validée';
    if (normalized === 'intervention confirmee' || normalized === 'intervention confirmee ' || normalized === 'intervention_confirmee') return 'intervention_confirmée';
    return 'nouvelle';
  }

  function normalizeClientConfirmation(value, status) {
    const normalized = normalizeText(value || '');
    if (normalized === 'en attente' || normalized === 'en_attente') return 'en_attente';
    if (normalized === 'confirmee' || normalized === 'confirmee' || normalized === 'confirmee ') return 'confirmée';
    if (COMMISSION_ACTIVE_STATUSES.includes(status)) return 'confirmée';
    return '';
  }

  function buildStableArtisanId(value) {
    const normalized = normalizeText(value);
    return normalized ? normalized.replace(/\s+/g, '_') : '';
  }

  function resolveArtisanId(explicitId, artisanName) {
    return String(explicitId || '').trim() || buildStableArtisanId(artisanName) || 'artisan-fixeo';
  }

  function isRequestLocked(normalizedRequest) {
    if (!normalizedRequest) return true;
    return Boolean(normalizedRequest.locked)
      || hasOwnValue(normalizedRequest.assigned_artisan)
      || hasOwnValue(normalizedRequest.assigned_artisan_id)
      || !isAvailableStatus(normalizedRequest.status)
      || hasOwnValue(normalizedRequest.accepted_at);
  }

  function normalizeCommissionStatus(raw, commissionAmount, status) {
    const value = normalizeText(raw?.commission_status || '');
    if (commissionAmount > 0 && (value === 'payee' || value === 'paye')) return 'payée';
    if (commissionAmount > 0 && raw?.commission_paid === true) return 'payée';
    if (commissionAmount > 0 && COMMISSION_ACTIVE_STATUSES.includes(status)) return 'à_payer';
    return '';
  }

  function buildLegacyFallbackId(raw, index) {
    const createdAt = String(raw?.created_at || raw?.date || '').trim();
    const createdToken = Date.parse(createdAt || '') || 0;
    const serviceToken = normalizeText(raw?.service || raw?.probleme || raw?.problem || 'service').slice(0, 24) || 'service';
    const cityToken = normalizeText(raw?.city || raw?.ville || 'ville').slice(0, 24) || 'ville';
    return `legacy_${createdToken}_${serviceToken}_${cityToken}_${index}`;
  }

  function normalizeRawItem(raw, index, seenIds) {
    const nextItem = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
    let requestId = hasOwnValue(nextItem.id) ? String(nextItem.id).trim() : '';
    if (!requestId) {
      requestId = buildLegacyFallbackId(nextItem, index);
      nextItem.id = requestId;
    }
    if (seenIds.has(requestId)) {
      requestId = `${requestId}_${index}`;
      nextItem.id = requestId;
    }
    seenIds.add(String(requestId));
    nextItem.status = normalizeStatus(nextItem.status);
    nextItem.client_confirmation = nextItem.client_confirmation || '';
    nextItem.completed_at = nextItem.completed_at || '';
    nextItem.validated_at = nextItem.validated_at || '';
    nextItem.review_rating = Number(nextItem.review_rating || 0) || 0;
    nextItem.review_comment = String(nextItem.review_comment || '');
    nextItem.review_submitted = nextItem.review_submitted === true;
    nextItem.review_date = nextItem.review_date || '';
    return nextItem;
  }

  function readRawRequests() {
    const parsed = safeJSONParse(localStorage.getItem(STORAGE_KEY) || '[]', []);
    const list = Array.isArray(parsed) ? parsed.slice() : [];
    const seenIds = new Set();
    const withIds = list.map((item, index) => normalizeRawItem(item, index, seenIds));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withIds));
    return withIds;
  }

  function writeRawRequests(requests) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(requests) ? requests : []));
  }

  function normalizeRequest(raw, index) {
    const status = normalizeStatus(raw?.status);
    const finalPrice = deriveFinalPrice(raw);
    const commissionAmount = deriveCommission(raw, finalPrice);
    const commissionStatus = normalizeCommissionStatus(raw, commissionAmount, status);
    const artisanNet = roundMoney(raw?.artisan_net || raw?.net_amount || (finalPrice > 0 ? finalPrice - commissionAmount : 0));
    const timestamp = raw?.created_at || raw?.date || new Date().toISOString();
    const clientConfirmation = normalizeClientConfirmation(raw?.client_confirmation, status);

    return {
      id: hasOwnValue(raw?.id) ? String(raw.id).trim() : buildLegacyFallbackId(raw, index || 0),
      service: String(raw?.service || raw?.probleme || raw?.problem || '').trim() || 'Service à préciser',
      city: String(raw?.city || raw?.ville || '').trim() || 'Ville à préciser',
      description: String(raw?.description || raw?.probleme || raw?.problem || '').trim() || 'Description à préciser',
      budget: String(raw?.budget || '').trim(),
      phone: String(raw?.phone || raw?.telephone || '').trim(),
      urgency: String(raw?.urgency || raw?.urgence || '').trim() || 'Normale',
      status,
      client_confirmation: clientConfirmation,
      created_at: timestamp,
      accepted_at: String(raw?.accepted_at || '').trim(),
      completed_at: String(raw?.completed_at || '').trim(),
      validated_at: String(raw?.validated_at || '').trim(),
      assigned_artisan: String(raw?.assigned_artisan || '').trim() || null,
      assigned_artisan_id: String(raw?.assigned_artisan_id || '').trim() || null,
      locked: Boolean(raw?.locked),
      locked_at: raw?.locked_at || '',
      viewed: Boolean(raw?.viewed),
      final_price: finalPrice,
      commission_amount: commissionAmount,
      commission_status: commissionStatus,
      commission_paid_at: commissionStatus === 'payée' ? String(raw?.commission_paid_at || '').trim() : '',
      commission_paid_by: commissionStatus === 'payée' ? String(raw?.commission_paid_by || '').trim() || 'admin' : '',
      artisan_net: artisanNet,
      commission_paid: commissionStatus === 'payée',
      review_rating: Number(raw?.review_rating || 0) || 0,
      review_comment: String(raw?.review_comment || '').trim(),
      review_submitted: raw?.review_submitted === true,
      review_date: String(raw?.review_date || '').trim()
    };
  }

  function buildSignature(payload) {
    return [
      normalizeText(payload?.service),
      normalizeText(payload?.city),
      normalizeText(payload?.description),
      normalizeText(payload?.budget),
      normalizeText(payload?.phone || payload?.telephone),
      normalizeText(payload?.urgency || payload?.urgence)
    ].join('|');
  }

  function buildRequest(payload) {
    const now = Date.now();
    return {
      id: now,
      service: String(payload?.service || '').trim() || 'Service à préciser',
      description: String(payload?.description || '').trim() || 'Description à préciser',
      city: String(payload?.city || '').trim() || 'Ville à préciser',
      budget: String(payload?.budget || '').trim(),
      phone: String(payload?.phone || payload?.telephone || '').trim(),
      urgency: String(payload?.urgency || payload?.urgence || '').trim() || 'Normale',
      status: 'nouvelle',
      client_confirmation: '',
      created_at: new Date(now).toISOString(),
      accepted_at: '',
      completed_at: '',
      validated_at: '',
      assigned_artisan: null,
      assigned_artisan_id: null,
      locked: false,
      locked_at: '',
      viewed: false,
      final_price: 0,
      commission_amount: 0,
      commission_status: '',
      commission_paid_at: '',
      commission_paid_by: '',
      artisan_net: 0,
      review_rating: 0,
      review_comment: '',
      review_submitted: false,
      review_date: ''
    };
  }

  function isDuplicateCandidate(nextPayload, latestRaw) {
    if (!latestRaw) return false;
    const latest = normalizeRequest(latestRaw);
    const latestTime = Date.parse(latest.created_at || '') || 0;
    if (!latestTime || Math.abs(Date.now() - latestTime) > DEDUPE_WINDOW_MS) return false;
    return buildSignature(nextPayload) === buildSignature(latest);
  }

  function dispatchUpdate(eventName, request) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail: request }));
    } catch (error) {
      /* noop */
    }
  }

  function appendRequest(payload) {
    const rawRequests = readRawRequests();
    const latestRaw = rawRequests.length ? rawRequests[rawRequests.length - 1] : null;
    if (isDuplicateCandidate(payload, latestRaw)) {
      return { request: normalizeRequest(latestRaw, rawRequests.length - 1), duplicated: true };
    }

    const request = buildRequest(payload);
    rawRequests.push(request);
    writeRawRequests(rawRequests);
    dispatchUpdate('fixeo:client-request-created', request);
    return { request, duplicated: false };
  }

  function mutateRequest(requestId, mutator) {
    if (!hasOwnValue(requestId) || typeof mutator !== 'function') return null;
    const normalizedRequestId = String(requestId).trim();
    const rawRequests = readRawRequests();
    let updated = null;

    const nextRequests = rawRequests.map((item, index) => {
      const normalizedItem = normalizeRequest(item, index);
      if (String(normalizedItem.id) !== normalizedRequestId) {
        return Object.assign({}, item, { id: normalizedItem.id, status: normalizedItem.status });
      }
      const nextItem = mutator(Object.assign({}, item, { id: normalizedItem.id, status: normalizedItem.status }), normalizedItem);
      if (!nextItem) {
        updated = null;
        return Object.assign({}, item, { id: normalizedItem.id, status: normalizedItem.status });
      }
      updated = nextItem;
      return nextItem;
    });

    if (!updated) return null;
    writeRawRequests(nextRequests);
    const normalized = normalizeRequest(updated);
    dispatchUpdate('fixeo:client-request-updated', normalized);
    return normalized;
  }

  function acceptRequest(requestId, artisanName, artisanId) {
    const normalizedRequestId = String(requestId || '').trim();
    const artisan = String(artisanName || '').trim() || 'Artisan Fixeo';
    const resolvedArtisanId = resolveArtisanId(artisanId, artisan);
    if (!normalizedRequestId) return { ok: false, reason: 'missing_id' };

    const firstRead = readRawRequests();
    const firstIndex = firstRead.findIndex((item, index) => String(normalizeRequest(item, index).id) === normalizedRequestId);
    if (firstIndex < 0) return { ok: false, reason: 'not_found' };

    const firstNormalized = normalizeRequest(firstRead[firstIndex], firstIndex);
    if (isRequestLocked(firstNormalized)) {
      return { ok: false, reason: 'already_taken', request: firstNormalized };
    }

    const lockTimestamp = Date.now();
    const lockRead = readRawRequests();
    const lockIndex = lockRead.findIndex((item, index) => String(normalizeRequest(item, index).id) === normalizedRequestId);
    if (lockIndex < 0) return { ok: false, reason: 'not_found' };

    const lockNormalized = normalizeRequest(lockRead[lockIndex], lockIndex);
    if (isRequestLocked(lockNormalized)) {
      return { ok: false, reason: 'already_taken', request: lockNormalized };
    }

    const lockRequests = lockRead.slice();
    lockRequests[lockIndex] = Object.assign({}, lockRead[lockIndex], {
      id: lockNormalized.id,
      locked: true,
      locked_at: lockTimestamp
    });
    writeRawRequests(lockRequests);

    const assignRead = readRawRequests();
    const assignIndex = assignRead.findIndex((item, index) => String(normalizeRequest(item, index).id) === normalizedRequestId);
    if (assignIndex < 0) return { ok: false, reason: 'not_found' };

    const assignNormalized = normalizeRequest(assignRead[assignIndex], assignIndex);
    if (!assignNormalized.locked || Number(assignNormalized.locked_at || 0) !== lockTimestamp) {
      return { ok: false, reason: 'already_taken', request: assignNormalized };
    }
    if (hasOwnValue(assignNormalized.assigned_artisan) || hasOwnValue(assignNormalized.assigned_artisan_id) || !isAvailableStatus(assignNormalized.status) || hasOwnValue(assignNormalized.accepted_at)) {
      return { ok: false, reason: 'already_taken', request: assignNormalized };
    }

    const acceptedAt = new Date().toISOString();
    const assignRequests = assignRead.slice();
    assignRequests[assignIndex] = Object.assign({}, assignRead[assignIndex], {
      id: assignNormalized.id,
      locked: true,
      locked_at: lockTimestamp,
      status: 'acceptée',
      client_confirmation: assignNormalized.client_confirmation || '',
      assigned_artisan: artisan,
      assigned_artisan_id: resolvedArtisanId,
      accepted_at: acceptedAt,
      completed_at: assignNormalized.completed_at || '',
      validated_at: assignNormalized.validated_at || ''
    });
    writeRawRequests(assignRequests);

    const normalized = normalizeRequest(assignRequests[assignIndex], assignIndex);
    dispatchUpdate('fixeo:client-request-updated', normalized);
    return { ok: true, request: normalized };
  }

  function updateMissionStatus(requestId, nextStatus, artisanName, artisanId) {
    const targetStatus = normalizeStatus(nextStatus);
    const artisan = String(artisanName || '').trim();
    const resolvedArtisanId = resolveArtisanId(artisanId, artisan);
    if (!artisan || !['en_cours', 'terminée'].includes(targetStatus)) return null;

    return mutateRequest(requestId, function (item, normalizedItem) {
      const sameArtisan = hasOwnValue(normalizedItem.assigned_artisan_id)
        ? String(normalizedItem.assigned_artisan_id) === resolvedArtisanId
        : normalizeText(normalizedItem.assigned_artisan) === normalizeText(artisan);
      if (!normalizedItem.assigned_artisan || !sameArtisan) return null;
      if (targetStatus === 'en_cours' && normalizedItem.status !== 'acceptée') return null;
      if (targetStatus === 'terminée' && normalizedItem.status !== 'en_cours') return null;

      const nowIso = new Date().toISOString();
      if (targetStatus === 'en_cours') {
        return Object.assign({}, item, {
          id: normalizedItem.id,
          status: 'en_cours',
          client_confirmation: normalizedItem.client_confirmation || '',
          assigned_artisan: item?.assigned_artisan || artisan,
          assigned_artisan_id: normalizedItem.assigned_artisan_id || resolvedArtisanId,
          locked: normalizedItem.locked,
          locked_at: normalizedItem.locked_at || Date.now(),
          accepted_at: normalizedItem.accepted_at || nowIso,
          completed_at: normalizedItem.completed_at || '',
          validated_at: normalizedItem.validated_at || ''
        });
      }

      return Object.assign({}, item, {
        id: normalizedItem.id,
        status: 'terminée',
        client_confirmation: 'en_attente',
        assigned_artisan: item?.assigned_artisan || artisan,
        assigned_artisan_id: normalizedItem.assigned_artisan_id || resolvedArtisanId,
        locked: normalizedItem.locked,
        locked_at: normalizedItem.locked_at || Date.now(),
        accepted_at: normalizedItem.accepted_at || nowIso,
        completed_at: nowIso,
        validated_at: normalizedItem.validated_at || ''
      });
    });
  }

  function confirmClientCompletion(requestId, artisanName, artisanId) {
    const artisan = String(artisanName || '').trim();
    const resolvedArtisanId = resolveArtisanId(artisanId, artisan);

    return mutateRequest(requestId, function (item, normalizedItem) {
      const sameArtisan = hasOwnValue(normalizedItem.assigned_artisan_id)
        ? String(normalizedItem.assigned_artisan_id) === resolvedArtisanId
        : (!artisan || normalizeText(normalizedItem.assigned_artisan) === normalizeText(artisan));
      if (!normalizedItem.assigned_artisan || !sameArtisan) return null;
      if (normalizedItem.status !== 'terminée' || normalizedItem.client_confirmation !== 'en_attente') return null;

      return Object.assign({}, item, {
        id: normalizedItem.id,
        status: 'validée',
        client_confirmation: 'confirmée',
        assigned_artisan: item?.assigned_artisan || normalizedItem.assigned_artisan,
        assigned_artisan_id: normalizedItem.assigned_artisan_id || resolvedArtisanId,
        locked: normalizedItem.locked,
        locked_at: normalizedItem.locked_at || Date.now(),
        accepted_at: normalizedItem.accepted_at || '',
        completed_at: normalizedItem.completed_at || '',
        validated_at: new Date().toISOString()
      });
    });
  }

  function isCommissionPayable(request) {
    const normalized = request && request.id ? request : normalizeRequest(request || {});
    return COMMISSION_ACTIVE_STATUSES.includes(normalized.status)
      && Number(normalized.commission_amount || 0) > 0
      && normalized.commission_status !== 'payée';
  }

  function validateReviewRating(value) {
    const rating = Number(value || 0);
    if (!Number.isFinite(rating)) return 0;
    return Math.max(0, Math.min(5, Math.round(rating)));
  }

  function submitClientReview(requestId, ratingValue, comment, artisanId) {
    const expectedArtisanId = String(artisanId || '').trim();
    const rating = validateReviewRating(ratingValue);
    if (rating < 1 || rating > 5) return { ok: false, reason: 'invalid_rating' };

    const updated = mutateRequest(requestId, function (item, normalizedItem) {
      if (normalizedItem.status !== 'validée') return null;
      if (normalizedItem.review_submitted === true) return null;
      if (expectedArtisanId && String(normalizedItem.assigned_artisan_id || '').trim() !== expectedArtisanId) return null;

      return Object.assign({}, item, {
        id: normalizedItem.id,
        review_rating: rating,
        review_comment: String(comment || '').trim(),
        review_submitted: true,
        review_date: new Date().toISOString()
      });
    });

    if (!updated) return { ok: false, reason: 'not_allowed' };
    return { ok: true, request: updated };
  }

  function getReviewStatsForArtisan(artisanId) {
    const resolvedArtisanId = String(artisanId || '').trim();
    if (!resolvedArtisanId) {
      return { total_reviews: 0, average_rating: null };
    }

    const reviewed = readRawRequests()
      .map((item, index) => normalizeRequest(item, index))
      .filter((request) => {
        return String(request.assigned_artisan_id || '').trim() === resolvedArtisanId
          && request.review_submitted === true
          && Number(request.review_rating || 0) >= 1;
      });

    if (!reviewed.length) {
      return { total_reviews: 0, average_rating: null };
    }

    const total = reviewed.reduce((sum, request) => sum + Number(request.review_rating || 0), 0);
    return {
      total_reviews: reviewed.length,
      average_rating: Math.round((total / reviewed.length) * 10) / 10
    };
  }

  function markCommissionPaid(requestId, paidBy) {
    return mutateRequest(requestId, function (item, normalizedItem) {
      if (!isCommissionPayable(normalizedItem)) return null;
      return Object.assign({}, item, {
        id: normalizedItem.id,
        commission_status: 'payée',
        commission_paid: true,
        commission_paid_at: new Date().toISOString(),
        commission_paid_by: String(paidBy || '').trim() || 'admin'
      });
    });
  }

  function getJobKeywords(job) {
    const normalizedJob = normalizeText(job);
    const tokens = new Set(normalizedJob.split(' ').filter(Boolean));

    Object.keys(CATEGORY_KEYWORDS).forEach((key) => {
      const words = CATEGORY_KEYWORDS[key];
      if (normalizedJob.includes(key) || words.some((word) => normalizedJob.includes(normalizeText(word)))) {
        words.forEach((word) => tokens.add(normalizeText(word)));
      }
    });

    if (!tokens.size && normalizedJob) {
      normalizedJob.split(' ').forEach((word) => tokens.add(word));
    }
    return Array.from(tokens);
  }

  function matchesJob(request, job) {
    const haystack = `${request.service} ${request.description}`;
    const normalizedHaystack = normalizeText(haystack);
    const keywords = getJobKeywords(job);
    if (!keywords.length) return false;
    return keywords.some((word) => word && normalizedHaystack.includes(word));
  }

  function getAvailableForArtisan(profile) {
    const requests = readRawRequests().map((item, index) => normalizeRequest(item, index));
    const city = normalizeText(profile?.city);
    const sameCity = requests.filter((request) => {
      return isAvailableStatus(request.status) && !request.locked && !request.assigned_artisan && !request.assigned_artisan_id && normalizeText(request.city) === city;
    });

    const matched = sameCity.filter((request) => matchesJob(request, profile?.job));
    const result = matched.length ? matched : sameCity;
    return result.sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
  }

  function getMissionStatusWeight(status) {
    if (status === 'acceptée') return 0;
    if (status === 'en_cours') return 1;
    if (status === 'terminée') return 2;
    if (status === 'validée') return 3;
    if (status === 'intervention_confirmée') return 4;
    return 99;
  }

  function getMissionsForArtisan(artisanName, artisanId) {
    const artisan = normalizeText(artisanName);
    const resolvedArtisanId = resolveArtisanId(artisanId, artisanName);
    if (!artisan && !resolvedArtisanId) return [];
    return readRawRequests()
      .map((item, index) => normalizeRequest(item, index))
      .filter((request) => {
        if (isAvailableStatus(request.status)) return false;
        if (!request.assigned_artisan) return false;
        if (hasOwnValue(request.assigned_artisan_id)) {
          return String(request.assigned_artisan_id) === resolvedArtisanId;
        }
        return !resolvedArtisanId && normalizeText(request.assigned_artisan) === artisan;
      })
      .sort((a, b) => {
        const weightDiff = getMissionStatusWeight(a.status) - getMissionStatusWeight(b.status);
        if (weightDiff !== 0) return weightDiff;
        const timeA = Date.parse(a.accepted_at || a.created_at || '') || 0;
        const timeB = Date.parse(b.accepted_at || b.created_at || '') || 0;
        return timeB - timeA;
      });
  }

  function getMissionStatsForArtisan(artisanName, artisanId) {
    const missions = getMissionsForArtisan(artisanName, artisanId);
    return missions.reduce((stats, request) => {
      if (request.status === 'acceptée') stats.demandes_acceptees += 1;
      if (request.status === 'en_cours') stats.missions_en_cours += 1;
      if (COMPLETED_STATUSES.includes(request.status)) stats.missions_terminees += 1;
      return stats;
    }, {
      demandes_acceptees: 0,
      missions_en_cours: 0,
      missions_terminees: 0,
      total: missions.length
    });
  }

  function listRequests() {
    return readRawRequests().map((item, index) => normalizeRequest(item, index));
  }

  window.FixeoClientRequestsStore = {
    storageKey: STORAGE_KEY,
    appendRequest,
    acceptRequest,
    updateMissionStatus,
    confirmClientCompletion,
    submitClientReview,
    getReviewStatsForArtisan,
    markCommissionPaid,
    isCommissionPayable,
    list: listRequests,
    getAvailableForArtisan,
    getMissionsForArtisan,
    getMissionStatsForArtisan,
    normalizeRequest,
    normalizeText,
    isAvailableStatus
  };
})();
