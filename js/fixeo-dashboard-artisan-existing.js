(function () {
  'use strict';

  const REQUIRED_KEYS = [
    'user_name',
    'user_job',
    'user_city',
    'user_phone',
    'user_avatar',
    'user_status',
    'user_role'
  ];

  function safeTrim(value) {
    return String(value || '').trim();
  }

  function safeJSONParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function normalizeStatus(value) {
    return /offline|hors/i.test(String(value || '')) ? 'offline' : 'online';
  }

  function getInitials(name) {
    const parts = safeTrim(name).split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map(part => part.charAt(0).toUpperCase()).join('') || 'AF').slice(0, 2);
  }

  function makeAvatar(name) {
    const initials = getInitials(name);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#E1306C"/>
            <stop offset="100%" stop-color="#405DE6"/>
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="34" fill="url(#g)"/>
        <circle cx="80" cy="60" r="26" fill="rgba(255,255,255,0.18)"/>
        <text x="80" y="66" font-size="24" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif">🔧</text>
        <text x="80" y="118" font-size="34" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif">${initials}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function isUsableAvatar(value) {
    return /^(data:image|https?:|\/)/i.test(String(value || ''));
  }

  function getLatestOnboardingArtisan() {
    const entries = window.FixeoArtisanOnboardingStore?.getEntries?.() || [];
    return Array.isArray(entries) && entries.length ? entries[0] : null;
  }

  function getOnboardingCategoryLabel(entry) {
    if (!entry) return '';
    return window.FixeoArtisanOnboardingStore?.getCategoryLabel?.(
      entry.category,
      window.FixeoArtisanOnboardingStore?.getFallbackConfig?.()
    ) || entry.category || '';
  }

  function getStoredUserObject() {
    return safeJSONParse(localStorage.getItem('user') || 'null') || {};
  }

  function resolveProfile() {
    const sessionUser = window.FixeoSessionMobile?.getUser?.() || {};
    const storedUser = getStoredUserObject();
    const onboarded = getLatestOnboardingArtisan();
    const currentRole = safeTrim(localStorage.getItem('user_role') || sessionUser.role || localStorage.getItem('fixeo_role') || storedUser.role || 'artisan');
    const name = safeTrim(
      localStorage.getItem('user_name') ||
      sessionUser.name ||
      localStorage.getItem('fixeo_user_name') ||
      storedUser.name ||
      onboarded?.name ||
      'Nouvel artisan Fixeo'
    );
    const job = safeTrim(
      localStorage.getItem('user_job') ||
      sessionUser.job ||
      storedUser.job ||
      getOnboardingCategoryLabel(onboarded) ||
      'Artisan'
    );
    const city = safeTrim(
      localStorage.getItem('user_city') ||
      sessionUser.city ||
      storedUser.city ||
      onboarded?.city ||
      'Casablanca'
    );
    const phone = safeTrim(
      localStorage.getItem('user_phone') ||
      sessionUser.phone ||
      storedUser.phone ||
      onboarded?.phone ||
      ''
    );
    const status = normalizeStatus(
      localStorage.getItem('user_status') ||
      sessionUser.status ||
      storedUser.status ||
      onboarded?.onlineStatus ||
      'online'
    );

    let avatar = safeTrim(
      localStorage.getItem('user_avatar') ||
      sessionUser.avatar ||
      localStorage.getItem('fixeo_avatar') ||
      storedUser.avatar ||
      onboarded?.avatar ||
      ''
    );
    if (!isUsableAvatar(avatar)) {
      avatar = makeAvatar(name);
    }

    return {
      name,
      job,
      city,
      phone,
      avatar,
      status,
      role: currentRole || 'artisan'
    };
  }

  function persistRequiredProfile(profile) {
    const existingLogged = localStorage.getItem('user_logged');
    const roleToKeep = safeTrim(localStorage.getItem('user_role')) || profile.role || 'artisan';

    localStorage.setItem('user_name', profile.name);
    localStorage.setItem('user_job', profile.job);
    localStorage.setItem('user_city', profile.city);
    localStorage.setItem('user_phone', profile.phone || '');
    localStorage.setItem('user_avatar', profile.avatar);
    localStorage.setItem('user_status', profile.status);
    localStorage.setItem('user_role', roleToKeep);

    if (existingLogged === 'true') {
      localStorage.setItem('fixeo_user_name', profile.name);
      localStorage.setItem('fixeo_role', roleToKeep);
      localStorage.setItem('fixeo_avatar', profile.avatar);
      if (profile.phone) {
        localStorage.setItem('fixeo_user', profile.phone);
      }
      localStorage.setItem('user', JSON.stringify({
        name: profile.name,
        role: roleToKeep,
        job: profile.job,
        city: profile.city,
        phone: profile.phone || '',
        avatar: profile.avatar,
        status: profile.status
      }));
      window.FixeoSessionMobile?.syncSessionToFixeo?.();
    }
  }

  function statusLabel(status) {
    return status === 'offline' ? 'Hors ligne' : 'En ligne';
  }

  function statusGlyph(status) {
    return status === 'offline' ? '○' : '●';
  }

  function firstName(name) {
    return safeTrim(name).split(/\s+/)[0] || 'Artisan';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectBlocks(profile) {
    const overview = document.getElementById('section-overview');
    const layout = overview?.querySelector('.artisan-dashboard-layout');
    if (!overview || !layout || document.getElementById('fixeo-artisan-existing-grid')) return;

    const wrapper = document.createElement('section');
    wrapper.id = 'fixeo-artisan-existing-grid';
    wrapper.className = 'fixeo-artisan-existing-grid';
    wrapper.innerHTML = `
      <article class="chart-card fixeo-artisan-existing-card">
        <p class="fixeo-artisan-inline-label">Profil</p>
        <div class="fixeo-artisan-existing-profile-head">
          <img id="fixeo-dashboard-profile-avatar" class="fixeo-artisan-existing-avatar" src="${profile.avatar}" alt="${escapeHtml(profile.name)}">
          <div class="fixeo-artisan-existing-title">
            <h3 id="fixeo-dashboard-profile-name">${escapeHtml(profile.name)}</h3>
            <div class="fixeo-artisan-existing-meta" id="fixeo-dashboard-profile-job">${escapeHtml(profile.job)}</div>
            <div class="fixeo-artisan-existing-meta" id="fixeo-dashboard-profile-city">📍 ${escapeHtml(profile.city)}</div>
            <div class="fixeo-artisan-existing-phone" id="fixeo-dashboard-profile-phone">${profile.phone ? '📞 ' + escapeHtml(profile.phone) : '📞 Numéro à compléter'}</div>
          </div>
        </div>
        <div class="fixeo-artisan-existing-status-row">
          <span id="fixeo-dashboard-profile-status" class="fixeo-artisan-pill ${profile.status === 'offline' ? 'is-offline' : 'is-online'}">${statusGlyph(profile.status)} ${statusLabel(profile.status)}</span>
        </div>
        <div class="fixeo-artisan-existing-badges">
          <span class="fixeo-artisan-pill is-new">Nouveau</span>
          <span class="fixeo-artisan-pill is-pending">Profil en vérification</span>
        </div>
      </article>
      <article class="chart-card fixeo-artisan-existing-card">
        <p class="fixeo-artisan-inline-label">Actions rapides</p>
        <div class="fixeo-artisan-actions-list">
          <button type="button" class="btn btn-secondary" data-fixeo-dashboard-edit>✏️ Modifier le profil</button>
          <a class="btn btn-secondary" href="results.html">🧰 Voir le marketplace</a>
          <button type="button" class="btn btn-secondary" data-fixeo-dashboard-status data-status="${profile.status}">⚡ Passer ${profile.status === 'offline' ? 'en ligne' : 'hors ligne'}</button>
          <button type="button" class="btn btn-primary" data-fixeo-dashboard-logout>🚪 Déconnexion</button>
        </div>
      </article>
      <article class="chart-card fixeo-artisan-existing-card">
        <p class="fixeo-artisan-inline-label">Stats mock</p>
        <div class="fixeo-artisan-stats-list">
          <div class="fixeo-artisan-stat-item"><strong id="fixeo-dashboard-stat-requests">0</strong><span>Demandes reçues</span></div>
          <div class="fixeo-artisan-stat-item"><strong id="fixeo-dashboard-stat-views">0</strong><span>Vues du profil</span></div>
          <div class="fixeo-artisan-stat-item"><strong id="fixeo-dashboard-stat-score">new</strong><span>Score</span></div>
          <div class="fixeo-artisan-stat-item"><strong id="fixeo-dashboard-stat-availability">${escapeHtml(statusLabel(profile.status))}</strong><span>Disponibilité</span></div>
        </div>
      </article>`;

    overview.insertBefore(wrapper, layout);
  }

  function updateSidebar(profile) {
    const avatar = document.getElementById('sidebar-avatar');
    const username = document.getElementById('sidebar-username');
    const role = document.getElementById('sidebar-role');
    const availability = document.getElementById('avail-status');

    if (avatar) {
      avatar.innerHTML = `<img src="${profile.avatar}" alt="${escapeHtml(profile.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
    if (username) username.textContent = profile.name;
    if (role) role.textContent = `🔧 ${profile.job}`;
    if (availability) {
      availability.textContent = `${statusGlyph(profile.status)} ${profile.status === 'offline' ? 'Hors ligne' : 'Disponible'}`;
      availability.className = `availability-status ${profile.status === 'offline' ? 'offline' : 'online'}`;
    }
  }

  function updateHero(profile) {
    const heroTitle = document.querySelector('.dashboard-top h1');
    if (heroTitle) heroTitle.textContent = `Bonjour ${firstName(profile.name)} 👋`;
  }

  function updateSettingsForm(profile) {
    const profileCard = document.querySelector('#section-settings .chart-card');
    if (!profileCard) return;
    const inputs = profileCard.querySelectorAll('.form-control');
    if (inputs[0]) inputs[0].value = profile.name;
    if (inputs[1]) inputs[1].value = profile.job;
    if (inputs[3] && !safeTrim(inputs[3].value)) {
      inputs[3].value = `${profile.job} basé à ${profile.city}. Disponible pour répondre rapidement aux demandes locales.`;
    }
    const saveButton = profileCard.querySelector('.btn.btn-primary');
    if (saveButton && !saveButton.dataset.fixeoDashboardBound) {
      saveButton.dataset.fixeoDashboardBound = 'true';
      saveButton.addEventListener('click', function () {
        const nextProfile = resolveProfile();
        nextProfile.name = safeTrim(inputs[0]?.value) || nextProfile.name;
        nextProfile.job = safeTrim(inputs[1]?.value) || nextProfile.job;
        nextProfile.status = normalizeStatus(localStorage.getItem('user_status') || nextProfile.status);
        persistRequiredProfile(nextProfile);
        renderAll(nextProfile);
      });
    }

    const availabilityToggle = document.querySelector('#section-settings .toggle-switch input');
    if (availabilityToggle && !availabilityToggle.dataset.fixeoDashboardBound) {
      availabilityToggle.dataset.fixeoDashboardBound = 'true';
      availabilityToggle.checked = profile.status !== 'offline';
      availabilityToggle.addEventListener('change', function () {
        setStatus(this.checked ? 'online' : 'offline');
      });
    }
  }

  function updateProfileBlock(profile) {
    const avatar = document.getElementById('fixeo-dashboard-profile-avatar');
    const name = document.getElementById('fixeo-dashboard-profile-name');
    const job = document.getElementById('fixeo-dashboard-profile-job');
    const city = document.getElementById('fixeo-dashboard-profile-city');
    const phone = document.getElementById('fixeo-dashboard-profile-phone');
    const status = document.getElementById('fixeo-dashboard-profile-status');
    const statAvailability = document.getElementById('fixeo-dashboard-stat-availability');
    const statusBtn = document.querySelector('[data-fixeo-dashboard-status]');

    if (avatar) avatar.src = profile.avatar;
    if (name) name.textContent = profile.name;
    if (job) job.textContent = profile.job;
    if (city) city.textContent = `📍 ${profile.city}`;
    if (phone) phone.textContent = profile.phone ? `📞 ${profile.phone}` : '📞 Numéro à compléter';
    if (status) {
      status.textContent = `${statusGlyph(profile.status)} ${statusLabel(profile.status)}`;
      status.className = `fixeo-artisan-pill ${profile.status === 'offline' ? 'is-offline' : 'is-online'}`;
    }
    if (statAvailability) statAvailability.textContent = statusLabel(profile.status);
    if (statusBtn) {
      statusBtn.dataset.status = profile.status;
      statusBtn.textContent = `⚡ Passer ${profile.status === 'offline' ? 'en ligne' : 'hors ligne'}`;
    }
  }

  function bindActions() {
    const editBtn = document.querySelector('[data-fixeo-dashboard-edit]');
    if (editBtn && !editBtn.dataset.fixeoDashboardBound) {
      editBtn.dataset.fixeoDashboardBound = 'true';
      editBtn.addEventListener('click', function () {
        if (typeof window.showSection === 'function') {
          window.showSection('settings');
        }
      });
    }

    const statusBtn = document.querySelector('[data-fixeo-dashboard-status]');
    if (statusBtn && !statusBtn.dataset.fixeoDashboardBound) {
      statusBtn.dataset.fixeoDashboardBound = 'true';
      statusBtn.addEventListener('click', function () {
        const current = normalizeStatus(localStorage.getItem('user_status'));
        setStatus(current === 'offline' ? 'online' : 'offline');
      });
    }

    const logoutBtn = document.querySelector('[data-fixeo-dashboard-logout]');
    if (logoutBtn && !logoutBtn.dataset.fixeoDashboardBound) {
      logoutBtn.dataset.fixeoDashboardBound = 'true';
      logoutBtn.addEventListener('click', function () {
        logoutDashboard();
      });
    }

    const sidebarLogout = Array.from(document.querySelectorAll('.sidebar-link[href="auth.html"]')).pop();
    if (sidebarLogout && !sidebarLogout.dataset.fixeoDashboardBound) {
      sidebarLogout.dataset.fixeoDashboardBound = 'true';
      sidebarLogout.setAttribute('href', 'index.html');
      sidebarLogout.addEventListener('click', function (event) {
        event.preventDefault();
        logoutDashboard();
      });
    }
  }

  function logoutDashboard() {
    const moreKeys = ['role', 'fixeo_profile', 'fixeo_token', 'fixeo_logged', 'fixeo_session', 'fixeo_notif_count'];
    window.FixeoSessionMobile?.clearSession?.({ reload: false });
    moreKeys.forEach(key => {
      try { localStorage.removeItem(key); } catch (error) {}
      try { sessionStorage.removeItem(key); } catch (error) {}
    });
    window.location.href = 'index.html';
  }

  function setStatus(nextStatus) {
    const normalized = normalizeStatus(nextStatus);
    localStorage.setItem('user_status', normalized);
    if (localStorage.getItem('user_logged') === 'true') {
      localStorage.setItem('fixeo_profile_status', normalized);
      window.FixeoSessionMobile?.syncSessionToFixeo?.();
    }
    const profile = resolveProfile();
    profile.status = normalized;
    persistRequiredProfile(profile);
    renderAll(profile);
    if (window.notifications?.info) {
      window.notifications.info(
        normalized === 'offline' ? '⚪ Vous êtes hors ligne' : '✅ Vous êtes en ligne',
        ''
      );
    }
  }

  function renderAll(profile) {
    injectBlocks(profile);
    updateProfileBlock(profile);
    updateSidebar(profile);
    updateHero(profile);
    updateSettingsForm(profile);
    bindActions();
  }

  function init() {
    const missingKeys = REQUIRED_KEYS.filter(key => !safeTrim(localStorage.getItem(key)));
    const profile = resolveProfile();
    if (missingKeys.length || localStorage.getItem('user_avatar') !== profile.avatar || localStorage.getItem('user_status') !== profile.status) {
      persistRequiredProfile(profile);
    }
    renderAll(profile);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
