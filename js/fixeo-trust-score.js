(function () {
  'use strict';

  const STORAGE_KEY = 'fixeo_client_requests';

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

  function normalizeStatus(value) {
    const normalized = normalizeText(value || '');
    if (!normalized || normalized === 'nouvelle' || normalized === 'disponible') return 'nouvelle';
    if (normalized === 'acceptee' || normalized === 'accepte') return 'acceptée';
    if (normalized === 'en cours' || normalized === 'en_cours' || normalized === 'encours') return 'en_cours';
    if (normalized === 'terminee' || normalized === 'termine') return 'terminée';
    if (normalized === 'validee' || normalized === 'valide') return 'validée';
    if (normalized === 'intervention confirmee' || normalized === 'intervention_confirmee') return 'intervention_confirmée';
    return String(value || '').trim() || 'nouvelle';
  }

  function clamp01(value) {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue)) return 0;
    return Math.max(0, Math.min(1, safeValue));
  }

  function roundOne(value) {
    const safeValue = Number(value || 0);
    if (!Number.isFinite(safeValue)) return 0;
    return Math.round(safeValue * 10) / 10;
  }

  function formatStars(rating) {
    const safeRating = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
    if (!safeRating) return '☆☆☆☆☆';
    return '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
  }

  function formatPercent(rate) {
    return Math.round(clamp01(rate) * 100) + '%';
  }

  function getTrustLevel(score) {
    const safeScore = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
    if (safeScore >= 90) return 'Elite';
    if (safeScore >= 75) return 'Fiable';
    if (safeScore >= 50) return 'Standard';
    return 'Nouveau';
  }

  function getTrustLevelTheme(level) {
    if (level === 'Elite') {
      return { color: '#0f766e', bg: 'rgba(16,185,129,.14)', border: 'rgba(16,185,129,.26)' };
    }
    if (level === 'Fiable') {
      return { color: '#405DE6', bg: 'rgba(64,93,230,.14)', border: 'rgba(64,93,230,.24)' };
    }
    if (level === 'Standard') {
      return { color: '#b26a00', bg: 'rgba(252,175,69,.16)', border: 'rgba(252,175,69,.28)' };
    }
    return { color: '#7b8190', bg: 'rgba(123,129,144,.14)', border: 'rgba(123,129,144,.24)' };
  }

  function resolveArtisanRef(artisanLike) {
    return {
      id: String(artisanLike?.assigned_artisan_id || artisanLike?.id || artisanLike?.userId || '').trim(),
      name: String(artisanLike?.assigned_artisan || artisanLike?.name || artisanLike?.artisanName || artisanLike?.artisan || '').trim(),
      nameKey: normalizeText(artisanLike?.assigned_artisan || artisanLike?.name || artisanLike?.artisanName || artisanLike?.artisan || '')
    };
  }

  function readRequests() {
    const parsed = safeJSONParse(localStorage.getItem(STORAGE_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function missionBelongsToArtisan(request, artisanRef) {
    if (!request || !artisanRef) return false;
    const missionArtisanId = String(request.assigned_artisan_id || '').trim();
    const missionArtisanNameKey = normalizeText(request.assigned_artisan || '');

    if (artisanRef.id && missionArtisanId && missionArtisanId === artisanRef.id) return true;
    if (artisanRef.nameKey && missionArtisanNameKey && missionArtisanNameKey === artisanRef.nameKey) return true;
    if (artisanRef.id && missionArtisanId) return false;
    return Boolean(artisanRef.nameKey && missionArtisanNameKey && missionArtisanNameKey === artisanRef.nameKey);
  }

  function normalizeMission(request) {
    return {
      id: String(request?.id || '').trim(),
      status: normalizeStatus(request?.status),
      client_confirmation: normalizeText(request?.client_confirmation || ''),
      commission_status: normalizeText(request?.commission_status || ''),
      review_submitted: request?.review_submitted === true,
      review_rating: Number(request?.review_rating || 0) || 0,
      assigned_artisan: String(request?.assigned_artisan || '').trim(),
      assigned_artisan_id: String(request?.assigned_artisan_id || '').trim()
    };
  }

  function listNormalizedMissions() {
    return readRequests()
      .map(normalizeMission)
      .filter(function (mission) {
        return hasOwnValue(mission.assigned_artisan) || hasOwnValue(mission.assigned_artisan_id);
      });
  }

  function computeTrustStatsFromMissions(missions) {
    const reviewedMissions = missions.filter(function (mission) {
      const rating = Number(mission.review_rating || 0);
      return mission.review_submitted === true && rating >= 1 && rating <= 5;
    });

    const totalReviews = reviewedMissions.length;
    const averageRating = totalReviews
      ? roundOne(reviewedMissions.reduce(function (sum, mission) { return sum + Number(mission.review_rating || 0); }, 0) / totalReviews)
      : null;

    const missionsValidated = missions.filter(function (mission) {
      return mission.status === 'validée';
    }).length;

    const missionsCompleted = missions.filter(function (mission) {
      return mission.status === 'terminée' || mission.status === 'validée';
    }).length;

    const missionsConfirmed = missions.filter(function (mission) {
      return (mission.status === 'terminée' || mission.status === 'validée')
        && mission.client_confirmation === 'confirmee';
    }).length;

    const commissionsPaid = missions.filter(function (mission) {
      return mission.status === 'validée' && mission.commission_status === 'payee';
    }).length;

    const confirmationRate = missionsCompleted > 0 ? missionsConfirmed / missionsCompleted : 0;
    const paymentRate = missionsValidated > 0 ? commissionsPaid / missionsValidated : 0;

    const ratingScore = averageRating != null ? (averageRating / 5) * 40 : 0;
    const missionsScore = Math.min((missionsValidated / 10) * 20, 20);
    const confirmationScore = confirmationRate * 20;
    const paymentScore = paymentRate * 20;

    const trustScore = Math.min(100, Math.round(ratingScore + missionsScore + confirmationScore + paymentScore));
    const trustLevel = getTrustLevel(trustScore);

    return {
      trust_score: trustScore,
      trust_level: trustLevel,
      total_reviews: totalReviews,
      total_missions: missions.length,
      missions_validated: missionsValidated,
      average_rating: averageRating,
      confirmation_rate: clamp01(confirmationRate),
      payment_rate: clamp01(paymentRate),
      commissions_paid: commissionsPaid,
      missions_completed: missionsCompleted,
      missions_confirmed: missionsConfirmed,
      rating_score: roundOne(ratingScore),
      missions_score: roundOne(missionsScore),
      confirmation_score: roundOne(confirmationScore),
      payment_score: roundOne(paymentScore)
    };
  }

  function getEmptyTrustStats() {
    return {
      trust_score: 0,
      trust_level: 'Nouveau',
      total_reviews: 0,
      total_missions: 0,
      missions_validated: 0,
      average_rating: null,
      confirmation_rate: 0,
      payment_rate: 0,
      commissions_paid: 0,
      missions_completed: 0,
      missions_confirmed: 0,
      rating_score: 0,
      missions_score: 0,
      confirmation_score: 0,
      payment_score: 0
    };
  }

  function getArtisanStats(artisanLike, missionsPool) {
    const artisanRef = resolveArtisanRef(artisanLike || {});
    if (!artisanRef.id && !artisanRef.nameKey) {
      return getEmptyTrustStats();
    }

    const missions = (Array.isArray(missionsPool) ? missionsPool : listNormalizedMissions())
      .filter(function (mission) {
        return missionBelongsToArtisan(mission, artisanRef);
      });

    return computeTrustStatsFromMissions(missions);
  }

  function enrichArtisan(artisan, missionsPool) {
    const stats = getArtisanStats({
      id: artisan?.id,
      name: artisan?.name,
      assigned_artisan_id: artisan?.assigned_artisan_id,
      assigned_artisan: artisan?.assigned_artisan
    }, missionsPool);

    const enriched = Object.assign({}, artisan || {}, stats, {
      trustScore: stats.trust_score,
      trustLevel: stats.trust_level,
      reviewCount: stats.total_reviews,
      missions: stats.missions_validated
    });

    if (stats.average_rating != null) {
      enriched.rating = stats.average_rating;
    }

    return enriched;
  }

  function sortArtisansByTrust(list) {
    const missionsPool = listNormalizedMissions();
    return (Array.isArray(list) ? list : [])
      .map(function (artisan) { return enrichArtisan(artisan, missionsPool); })
      .sort(function (a, b) {
        const trustDiff = Number(b.trust_score || 0) - Number(a.trust_score || 0);
        if (trustDiff !== 0) return trustDiff;
        const ratingDiff = Number(b.average_rating || b.rating || 0) - Number(a.average_rating || a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        const reviewDiff = Number(b.total_reviews || 0) - Number(a.total_reviews || 0);
        if (reviewDiff !== 0) return reviewDiff;
        return normalizeText(a.name || '').localeCompare(normalizeText(b.name || ''), 'fr');
      });
  }

  function applyArtisanProfileTrust() {
    if (!document.querySelector('.artisan-profile-page') || !window.ARTISAN_DATA) return;

    const stats = getArtisanStats({ id: window.ARTISAN_DATA.id, name: window.ARTISAN_DATA.name });
    const hero = document.querySelector('.artisan-profile-hero .profile-main');
    if (!hero) return;

    if (stats.average_rating != null) {
      window.ARTISAN_DATA.rating = stats.average_rating;
      window.ARTISAN_DATA.reviewCount = stats.total_reviews;
    }
    window.ARTISAN_DATA.trustScore = stats.trust_score;
    window.ARTISAN_DATA.trust_score = stats.trust_score;
    window.ARTISAN_DATA.trustLevel = stats.trust_level;
    window.ARTISAN_DATA.trust_level = stats.trust_level;
    window.ARTISAN_DATA.total_reviews = stats.total_reviews;
    window.ARTISAN_DATA.total_missions = stats.total_missions;
    window.ARTISAN_DATA.confirmation_rate = stats.confirmation_rate;
    window.ARTISAN_DATA.payment_rate = stats.payment_rate;

    const ratingBox = hero.querySelector('.profile-rating');
    if (ratingBox) {
      if (stats.average_rating == null || !stats.total_reviews) {
        ratingBox.style.display = 'none';
      } else {
        ratingBox.style.display = '';
        ratingBox.innerHTML = '<strong>⭐ ' + stats.average_rating.toFixed(1) + ' / 5</strong><span>(' + stats.total_reviews + ' avis)</span>';
      }
    }

    const trustTheme = getTrustLevelTheme(stats.trust_level);
    let trustBox = document.getElementById('artisan-trust-summary');
    if (!trustBox) {
      trustBox = document.createElement('div');
      trustBox.id = 'artisan-trust-summary';
      trustBox.style.marginTop = '12px';
      trustBox.style.display = 'grid';
      trustBox.style.gap = '10px';
      const insertAfter = ratingBox && ratingBox.parentNode === hero ? ratingBox.nextSibling : null;
      hero.insertBefore(trustBox, insertAfter);
    }

    const ratingLine = (stats.average_rating != null && stats.total_reviews)
      ? '<div style="font-weight:700;color:#f59e0b">' + formatStars(stats.average_rating) + ' ' + stats.average_rating.toFixed(1) + ' / 5</div>'
      : '';

    trustBox.innerHTML = '' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">' +
        '<span style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;font-weight:800;color:' + trustTheme.color + ';background:' + trustTheme.bg + ';border:1px solid ' + trustTheme.border + '">🛡️ Trust Score ' + stats.trust_score + '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;font-weight:700;color:' + trustTheme.color + ';background:' + trustTheme.bg + ';border:1px solid ' + trustTheme.border + '">' + stats.trust_level + '</span>' +
      '</div>' +
      ratingLine +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:.84rem;color:#64748b">' +
        '<span>✔ ' + stats.missions_validated + ' missions validées</span>' +
        '<span>• Confirmation client ' + formatPercent(stats.confirmation_rate) + '</span>' +
        '<span>• Commission payée ' + formatPercent(stats.payment_rate) + '</span>' +
      '</div>';

    const badgesHost = hero.querySelector('.profile-badges');
    if (badgesHost) {
      let trustBadge = document.getElementById('artisan-trust-badge');
      if (!trustBadge) {
        trustBadge = document.createElement('span');
        trustBadge.id = 'artisan-trust-badge';
        trustBadge.className = 'badge level';
        badgesHost.appendChild(trustBadge);
      }
      trustBadge.textContent = '🛡️ ' + stats.trust_level + ' · ' + stats.trust_score;
      trustBadge.style.background = trustTheme.bg;
      trustBadge.style.color = trustTheme.color;
      trustBadge.style.border = '1px solid ' + trustTheme.border;
    }
  }

  window.FixeoTrustScore = {
    storageKey: STORAGE_KEY,
    normalizeText: normalizeText,
    getTrustLevel: getTrustLevel,
    getTrustLevelTheme: getTrustLevelTheme,
    formatPercent: formatPercent,
    formatStars: formatStars,
    getArtisanStats: getArtisanStats,
    enrichArtisan: enrichArtisan,
    sortArtisansByTrust: sortArtisansByTrust,
    applyArtisanProfileTrust: applyArtisanProfileTrust
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyArtisanProfileTrust);
  } else {
    applyArtisanProfileTrust();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) {
      applyArtisanProfileTrust();
    }
  });
})();
