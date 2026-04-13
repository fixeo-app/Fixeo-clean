(function () {
  const STORAGE_KEY = 'fixeo_artisan_onboarding_entries_v1';
  const NOTICE_KEY = 'fixeo_artisan_onboarding_notice_v1';
  const FALLBACK_CONFIG = {
    categories: [
      { value: 'plomberie', label: 'Plomberie', emoji: '🚿' },
      { value: 'electricite', label: 'Électricité', emoji: '⚡' },
      { value: 'peinture', label: 'Peinture', emoji: '🎨' },
      { value: 'demenagement', label: 'Déménagement', emoji: '📦' },
      { value: 'jardinage', label: 'Jardinage', emoji: '🌿' },
      { value: 'nettoyage', label: 'Nettoyage', emoji: '🧹' },
      { value: 'bricolage', label: 'Bricolage', emoji: '🔨' },
      { value: 'climatisation', label: 'Climatisation', emoji: '❄️' },
      { value: 'menuiserie', label: 'Menuiserie', emoji: '🪚' },
      { value: 'maconnerie', label: 'Maçonnerie', emoji: '🧱' },
      { value: 'serrurerie', label: 'Serrurerie', emoji: '🔐' }
    ],
    cities: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Agadir', 'Tanger', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Safi', 'El Jadida'],
    categoryMeta: {
      plomberie: { priceFrom: 150, portfolio: ['🔧', '🚿', '💧'], skills: ['Fuite', 'Installation', 'Dépannage'] },
      electricite: { priceFrom: 170, portfolio: ['⚡', '💡', '🔌'], skills: ['Installation', 'Panne', 'Mise aux normes'] },
      peinture: { priceFrom: 120, portfolio: ['🎨', '🖌️', '✨'], skills: ['Peinture', 'Finition', 'Décoration'] },
      demenagement: { priceFrom: 220, portfolio: ['📦', '🚛', '🏠'], skills: ['Transport', 'Emballage', 'Montage'] },
      jardinage: { priceFrom: 110, portfolio: ['🌿', '🌳', '🌺'], skills: ['Taille', 'Entretien', 'Arrosage'] },
      nettoyage: { priceFrom: 90, portfolio: ['🧹', '🧽', '✨'], skills: ['Entretien', 'Nettoyage', 'Désinfection'] },
      bricolage: { priceFrom: 130, portfolio: ['🔨', '🪛', '🔩'], skills: ['Montage', 'Réparation', 'Fixations'] },
      climatisation: { priceFrom: 180, portfolio: ['❄️', '🌡️', '💨'], skills: ['Installation', 'Entretien', 'Dépannage'] },
      menuiserie: { priceFrom: 160, portfolio: ['🪚', '🚪', '🪑'], skills: ['Bois', 'Meubles', 'Sur mesure'] },
      maconnerie: { priceFrom: 190, portfolio: ['🧱', '🏗️', '🔨'], skills: ['Construction', 'Rénovation', 'Carrelage'] },
      serrurerie: { priceFrom: 160, portfolio: ['🔐', '🚪', '🛠️'], skills: ['Ouverture', 'Serrures', 'Sécurité'] }
    },
    defaults: {
      rating: 4.8,
      reviewCount: 0,
      trustScore: 78,
      priceUnit: 'intervention',
      availability: 'available',
      availabilityLabel: 'Immédiate',
      responseTime: 9,
      xp: 0,
      level: 1,
      status: 'active',
      onlineStatus: 'en ligne'
    }
  };

  function norm(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return norm(value).replace(/\s+/g, '-');
  }

  function safeStorage() {
    try {
      if (!window.localStorage) return null;
      const testKey = '__fixeo_onboarding_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map(part => part.charAt(0).toUpperCase()).join('') || 'FA').slice(0, 2);
  }

  function getCategoryConfig(category, config) {
    return (config.categoryMeta && config.categoryMeta[category]) || FALLBACK_CONFIG.categoryMeta[category] || {};
  }

  function getCategoryLabel(category, config) {
    const categories = (config.categories || FALLBACK_CONFIG.categories || []);
    const match = categories.find(item => item.value === category);
    return match ? match.label : category;
  }

  function getCategoryEmoji(category, config) {
    const categories = (config.categories || FALLBACK_CONFIG.categories || []);
    const match = categories.find(item => item.value === category);
    return (match && match.emoji) || '🛠️';
  }

  function buildDefaultDescription(payload, config) {
    const label = getCategoryLabel(payload.category, config);
    return `${label} basé${/a$/.test(payload.name || '') ? 'e' : ''} à ${payload.city}. Disponible immédiatement sur Fixeo pour les demandes locales avec réponse rapide.`;
  }

  function makeAvatar(initials, category, config) {
    const emoji = getCategoryEmoji(category, config);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#E1306C"/>
            <stop offset="100%" stop-color="#405DE6"/>
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="36" fill="url(#g)"/>
        <circle cx="80" cy="70" r="34" fill="rgba(255,255,255,0.16)"/>
        <text x="80" y="82" font-size="42" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif">${emoji}</text>
        <text x="80" y="128" font-size="28" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif">${initials}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function normalizePhone(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function getEntries() {
    const storage = safeStorage();
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveEntries(entries) {
    const storage = safeStorage();
    if (!storage) return [];
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return entries;
  }

  function buildArtisanProfile(payload, config = FALLBACK_CONFIG) {
    const defaults = { ...FALLBACK_CONFIG.defaults, ...(config.defaults || {}) };
    const name = String(payload.name || '').trim();
    const category = String(payload.category || '').trim();
    const city = String(payload.city || '').trim();
    const phone = normalizePhone(payload.phone);
    const initials = getInitials(name);
    const now = Date.now();
    const categoryConfig = getCategoryConfig(category, config);
    const description = String(payload.description || '').trim() || buildDefaultDescription({ name, category, city }, config);
    const emailSlug = slugify(name || `artisan-${now}`) || `artisan-${now}`;
    const generatedEmail = `${emailSlug}@artisan.fixeo.local`;

    return {
      id: now,
      name,
      initials,
      avatar: makeAvatar(initials, category, config),
      category,
      city,
      lat: 33.589,
      lng: -7.633,
      rating: Number(defaults.rating || 4.8),
      reviewCount: Number(defaults.reviewCount || 0),
      trustScore: Number(defaults.trustScore || 78),
      priceFrom: Number(categoryConfig.priceFrom || 120),
      priceUnit: defaults.priceUnit || 'intervention',
      availability: defaults.availability || 'available',
      availabilityLabel: defaults.availabilityLabel || 'Immédiate',
      bio: { fr: description, ar: '', en: description },
      badges: ['new', 'pending'],
      skills: Array.isArray(categoryConfig.skills) && categoryConfig.skills.length ? categoryConfig.skills : [getCategoryLabel(category, config)],
      portfolio: Array.isArray(categoryConfig.portfolio) && categoryConfig.portfolio.length ? categoryConfig.portfolio : ['🛠️'],
      phone,
      email: generatedEmail,
      xp: Number(defaults.xp || 0),
      level: Number(defaults.level || 1),
      responseTime: Number(defaults.responseTime || 9),
      status: defaults.status || 'active',
      onlineStatus: defaults.onlineStatus || 'en ligne',
      onboardingStatus: 'nouveau',
      verificationStatus: 'pending',
      verificationLabel: 'Profil en vérification',
      createdAt: new Date(now).toISOString(),
      _fromOnboarding: true
    };
  }

  function isSameArtisan(a, b) {
    const aPhone = normalizePhone(a && a.phone);
    const bPhone = normalizePhone(b && b.phone);
    const aEmail = String(a && a.email || '').toLowerCase();
    const bEmail = String(b && b.email || '').toLowerCase();
    return Boolean(
      (aPhone && bPhone && aPhone === bPhone) ||
      (aEmail && bEmail && aEmail === bEmail) ||
      (a && b && String(a.id) === String(b.id))
    );
  }

  function addArtisan(payload, config = FALLBACK_CONFIG) {
    const artisan = payload && payload._fromOnboarding ? payload : buildArtisanProfile(payload, config);
    const entries = getEntries().filter(entry => !isSameArtisan(entry, artisan));
    entries.unshift(artisan);
    saveEntries(entries);
    try {
      window.dispatchEvent(new CustomEvent('fixeo:artisan-created', { detail: artisan }));
    } catch (error) {
      // no-op
    }
    return artisan;
  }

  function mergeIntoArtisans(target) {
    if (!Array.isArray(target)) return target;
    const entries = getEntries();
    entries.slice().reverse().forEach(entry => {
      const existingIndex = target.findIndex(item => isSameArtisan(item, entry));
      if (existingIndex >= 0) {
        target[existingIndex] = { ...target[existingIndex], ...entry };
      } else {
        target.unshift(entry);
      }
    });
    return target;
  }

  function storeNotice(message) {
    try {
      window.sessionStorage?.setItem(NOTICE_KEY, String(message || ''));
    } catch (error) {
      // no-op
    }
  }

  function consumeNotice() {
    try {
      const value = window.sessionStorage?.getItem(NOTICE_KEY);
      if (value) {
        window.sessionStorage.removeItem(NOTICE_KEY);
      }
      return value || '';
    } catch (error) {
      return '';
    }
  }

  function showInlineNotice(message) {
    if (!message || !document || !document.body) return;
    const existing = document.querySelector('.fixeo-artisan-inline-notice');
    if (existing) existing.remove();
    const notice = document.createElement('div');
    notice.className = 'fixeo-artisan-inline-notice';
    notice.textContent = message;
    document.body.appendChild(notice);
    requestAnimationFrame(() => notice.classList.add('is-visible'));
    setTimeout(() => {
      notice.classList.remove('is-visible');
      setTimeout(() => notice.remove(), 280);
    }, 3600);
  }

  function flushStoredNotice() {
    const message = consumeNotice();
    if (!message) return;
    const run = function () {
      if (window.notifSystem && typeof window.notifSystem.toast === 'function') {
        window.notifSystem.toast({ type: 'success', title: 'Profil artisan', message, icon: '✅' });
      } else {
        showInlineNotice(message);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  window.FixeoArtisanOnboardingStore = {
    STORAGE_KEY,
    NOTICE_KEY,
    getFallbackConfig: () => JSON.parse(JSON.stringify(FALLBACK_CONFIG)),
    getEntries,
    saveEntries,
    addArtisan,
    mergeIntoArtisans,
    buildArtisanProfile,
    getInitials,
    buildDefaultDescription,
    storeNotice,
    flushStoredNotice,
    normalizePhone,
    getCategoryLabel,
    getCategoryEmoji
  };

  flushStoredNotice();
})();
