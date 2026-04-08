(function () {
  'use strict';

  const REQUESTS_KEY = 'fixeo_client_requests';
  const SCROLL_FLAG_KEY = 'fixeo_artisan_request_notifications_target';
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

  function getPath() {
    return (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function isArtisanLogged() {
    const logged = String(localStorage.getItem('user_logged') || '').trim().toLowerCase() === 'true';
    const role = String(localStorage.getItem('user_role') || '').trim().toLowerCase();
    return Boolean(logged && role === 'artisan');
  }

  function getArtisanProfile() {
    return {
      city: String(localStorage.getItem('user_city') || '').trim() || 'Casablanca',
      job: String(localStorage.getItem('user_job') || '').trim() || 'Artisan'
    };
  }

  function getViewerId(profile) {
    const artisan = profile || getArtisanProfile();
    return normalizeText([artisan.city, artisan.job].join('|')) || 'artisan-fixeo';
  }

  function readRequests() {
    const parsed = safeJSONParse(localStorage.getItem(REQUESTS_KEY) || '[]', []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function writeRequests(requests) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(Array.isArray(requests) ? requests : []));
  }

  function normalizeViewedByArtisan(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).reduce((acc, key) => {
        if (key && value[key]) acc[key] = true;
        return acc;
      }, {});
    }

    if (Array.isArray(value)) {
      return value.reduce((acc, key) => {
        const normalizedKey = String(key || '').trim();
        if (normalizedKey) acc[normalizedKey] = true;
        return acc;
      }, {});
    }

    return {};
  }

  function isAvailableStatus(status) {
    const normalized = normalizeText(status || 'nouvelle');
    return !normalized || normalized === 'nouvelle' || normalized === 'disponible';
  }

  function normalizeRequest(raw) {
    return {
      id: raw?.id || '',
      service: String(raw?.service || raw?.probleme || raw?.problem || '').trim() || 'Service à préciser',
      city: String(raw?.city || raw?.ville || '').trim() || 'Ville à préciser',
      description: String(raw?.description || raw?.probleme || raw?.problem || '').trim() || 'Description à préciser',
      budget: String(raw?.budget || '').trim(),
      status: String(raw?.status || 'nouvelle').trim() || 'nouvelle',
      created_at: raw?.created_at || raw?.date || new Date().toISOString(),
      assigned_artisan: raw?.assigned_artisan || null,
      assigned_artisan_id: raw?.assigned_artisan_id || null,
      accepted_at: raw?.accepted_at || '',
      locked: Boolean(raw?.locked),
      viewed_by_artisan: normalizeViewedByArtisan(raw?.viewed_by_artisan || raw?.viewed_by_artisans)
    };
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
    const haystack = normalizeText(`${request.service} ${request.description}`);
    const keywords = getJobKeywords(job);
    if (!keywords.length) return false;
    return keywords.some((word) => word && haystack.includes(word));
  }

  function getRelevantRequests(profile) {
    const artisan = profile || getArtisanProfile();
    const city = normalizeText(artisan.city);
    const requests = readRequests().map(normalizeRequest);
    const sameCity = requests.filter((request) => {
      return isAvailableStatus(request.status) && !request.locked && !request.assigned_artisan && !request.assigned_artisan_id && !request.accepted_at && normalizeText(request.city) === city;
    });
    const matched = sameCity.filter((request) => matchesJob(request, artisan.job));
    return (matched.length ? matched : sameCity).sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
  }

  function getUnseenRequests(profile) {
    const viewerId = getViewerId(profile);
    return getRelevantRequests(profile).filter((request) => !request.viewed_by_artisan[viewerId]);
  }

  function markRelevantRequestsAsViewed(profile) {
    if (!isArtisanLogged()) return 0;
    const artisan = profile || getArtisanProfile();
    const viewerId = getViewerId(artisan);
    const relevantIds = new Set(getRelevantRequests(artisan).map((request) => String(request.id)));
    if (!relevantIds.size) return 0;

    let updatedCount = 0;
    const nextRequests = readRequests().map((raw) => {
      if (!relevantIds.has(String(raw?.id))) return raw;
      const viewed = normalizeViewedByArtisan(raw?.viewed_by_artisan || raw?.viewed_by_artisans);
      if (viewed[viewerId]) return raw;
      viewed[viewerId] = true;
      updatedCount += 1;
      return Object.assign({}, raw, { viewed_by_artisan: viewed });
    });

    if (updatedCount > 0) {
      writeRequests(nextRequests);
      try {
        window.dispatchEvent(new CustomEvent('fixeo:artisan-requests-viewed', { detail: { count: updatedCount, viewerId } }));
      } catch (error) {
        /* noop */
      }
    }
    return updatedCount;
  }

  function injectStyles() {
    if (document.getElementById('fixeo-artisan-request-notifications-style')) return;
    const style = document.createElement('style');
    style.id = 'fixeo-artisan-request-notifications-style';
    style.textContent = `
      @media (max-width: 768px) {
        .fixeo-gh-badge.fixeo-request-bell-badge,
        .notif-badge.fixeo-request-bell-badge {
          top: 3px !important;
          right: 3px !important;
          min-width: 16px !important;
          height: 16px !important;
          padding: 0 4px !important;
          border-radius: 999px !important;
          background: #ff3b30 !important;
          color: #fff !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          line-height: 16px !important;
          text-align: center !important;
          box-shadow: 0 6px 14px rgba(255, 59, 48, 0.28) !important;
          border: 1.5px solid rgba(8, 12, 24, 0.92) !important;
        }
        .fixeo-gh-notif.fixeo-request-bell-active {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 20px rgba(255,59,48,0.12) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getBadgeElements() {
    return Array.from(document.querySelectorAll('.fixeo-gh-badge, .notif-badge'));
  }

  function usesGlobalBell() {
    return Boolean(window.notifSystem && window.notifSystem.usesGlobalBell);
  }

  function syncBadge() {
    if (usesGlobalBell()) {
      window.notifSystem?.syncExternalBadges?.();
      return;
    }

    injectStyles();

    const isLoggedArtisan = isArtisanLogged();
    const unseen = isLoggedArtisan ? getUnseenRequests() : [];
    const count = unseen.length;
    const badgeText = count > 99 ? '99+' : (count > 0 ? String(count) : '');
    const bellButtons = document.querySelectorAll('.fixeo-gh-notif, .notif-btn');

    getBadgeElements().forEach((badge) => {
      badge.classList.add('fixeo-request-bell-badge');
      badge.textContent = badgeText;
      badge.classList.toggle('has-notif', isLoggedArtisan && count > 0);
      badge.setAttribute('aria-label', isLoggedArtisan && count > 0 ? `${count} nouvelle${count > 1 ? 's' : ''} demande${count > 1 ? 's' : ''}` : 'Aucune nouvelle demande');
    });

    bellButtons.forEach((button) => {
      button.classList.toggle('fixeo-request-bell-active', isLoggedArtisan && count > 0);
      button.setAttribute('aria-label', isLoggedArtisan && count > 0 ? `${count} nouvelles demandes disponibles` : 'Demandes disponibles');
      button.setAttribute('title', isLoggedArtisan && count > 0 ? `${count} nouvelle${count > 1 ? 's' : ''} demande${count > 1 ? 's' : ''}` : 'Demandes disponibles');
    });
  }

  function scrollToRequestsSection() {
    if (typeof window.showSection === 'function') {
      window.showSection('requests');
    }

    const target = document.getElementById('requests-grid') || document.getElementById('section-requests');
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleBellNavigation(event) {
    if (usesGlobalBell()) return;
    if (!isArtisanLogged()) return;
    const bell = event.target.closest('.fixeo-gh-notif, .notif-btn');
    if (!bell) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    try {
      sessionStorage.setItem(SCROLL_FLAG_KEY, 'requests');
    } catch (error) {
      /* noop */
    }

    if (getPath() === 'dashboard-artisan.html') {
      scrollToRequestsSection();
      markRelevantRequestsAsViewed();
      syncBadge();
      return;
    }

    window.location.href = 'dashboard-artisan.html#requests';
  }

  function maybeHandleDashboardArrival() {
    if (getPath() !== 'dashboard-artisan.html' || !isArtisanLogged()) return;

    if (!usesGlobalBell()) {
      markRelevantRequestsAsViewed();
    }
    syncBadge();

    let shouldScroll = false;
    try {
      shouldScroll = sessionStorage.getItem(SCROLL_FLAG_KEY) === 'requests';
      sessionStorage.removeItem(SCROLL_FLAG_KEY);
    } catch (error) {
      shouldScroll = false;
    }

    if (window.location.hash === '#requests') {
      shouldScroll = true;
    }

    if (shouldScroll) {
      window.setTimeout(scrollToRequestsSection, 180);
      window.setTimeout(scrollToRequestsSection, 420);
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleBellNavigation, true);

    window.addEventListener('storage', function (event) {
      if (event.key === REQUESTS_KEY || event.key === 'user_logged' || event.key === 'user_role' || event.key === 'user_city' || event.key === 'user_job') {
        syncBadge();
      }
    });

    window.addEventListener('fixeo:client-request-created', syncBadge);
    window.addEventListener('fixeo:client-request-updated', syncBadge);
    window.addEventListener('fixeo:artisan-requests-viewed', syncBadge);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncBadge();
    });
  }

  function init() {
    syncBadge();
    maybeHandleDashboardArrival();
    bindEvents();
    window.setTimeout(syncBadge, 160);
    window.setTimeout(syncBadge, 520);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
