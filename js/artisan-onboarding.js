(function () {
  async function loadConfig() {
    try {
      const response = await fetch('api/artisan-onboarding-config.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('config');
      return await response.json();
    } catch (error) {
      return window.FixeoArtisanOnboardingStore?.getFallbackConfig?.() || { categories: [], cities: [] };
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setFieldError(field, message) {
    const wrap = field?.closest('[data-field]');
    const error = wrap?.querySelector('.artisan-onboarding-error');
    if (!wrap || !error) return;
    wrap.classList.toggle('is-invalid', Boolean(message));
    wrap.classList.toggle('is-valid', !message && Boolean(field?.value));
    error.textContent = message || '';
  }

  function validateName(value) {
    return String(value || '').trim().length >= 3 ? '' : 'Entrez votre nom complet.';
  }

  function validateSelect(value, label) {
    return String(value || '').trim() ? '' : `Choisissez ${label}.`;
  }

  function validatePhone(value) {
    const digits = window.FixeoArtisanOnboardingStore?.normalizePhone?.(value) || String(value || '').replace(/\D+/g, '');
    return digits.length >= 10 ? '' : 'Entrez un numéro valide.';
  }

  function validateDescription(value) {
    return String(value || '').trim().length <= 180 ? '' : '180 caractères maximum.';
  }

  function createOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function showToast(message) {
    const toast = $('artisan-onboarding-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
  }

  function createArtisanSession(artisan, config) {
    const categoryLabel = window.FixeoArtisanOnboardingStore?.getCategoryLabel?.(artisan.category, config) || artisan.category;
    if (window.FixeoSessionMobile?.loginArtisan) {
      window.FixeoSessionMobile.loginArtisan({
        name: artisan.name,
        job: categoryLabel,
        city: artisan.city,
        phone: artisan.phone,
        avatar: artisan.avatar,
        categoryLabel
      });
      return;
    }

    localStorage.setItem('user_logged', 'true');
    localStorage.setItem('user_role', 'artisan');
    localStorage.setItem('user_name', artisan.name);
    localStorage.setItem('user_job', categoryLabel);
    localStorage.setItem('user_city', artisan.city);
    localStorage.setItem('user_phone', artisan.phone || '');
    localStorage.setItem('user_avatar', artisan.avatar || artisan.initials || 'A');
    localStorage.setItem('user_status', 'online');
  }

  function redirectAfterOnboarding() {
    const target = 'dashboard-artisan.html';
    setTimeout(() => {
      window.location.href = target;
    }, 650);
  }

  function renderSuccess(artisan, config) {
    const success = $('artisan-onboarding-success');
    const summary = $('artisan-onboarding-success-summary');
    if (!success || !summary) return;
    const categoryLabel = window.FixeoArtisanOnboardingStore?.getCategoryLabel?.(artisan.category, config) || artisan.category;
    summary.innerHTML = `
      <div class="artisan-onboarding-success-card">
        <img src="${artisan.avatar}" alt="${artisan.name}" class="artisan-onboarding-success-avatar" />
        <div>
          <strong>${artisan.name}</strong>
          <p>${categoryLabel} · ${artisan.city}</p>
          <div class="artisan-onboarding-success-badges">
            <span>Nouveau</span>
            <span>En ligne</span>
            <span>Profil en vérification</span>
          </div>
        </div>
      </div>`;
    success.hidden = false;
  }

  async function init() {
    const form = $('artisan-onboarding-form');
    if (!form || !window.FixeoArtisanOnboardingStore) return;

    const config = await loadConfig();
    const categorySelect = $('artisan-category');
    const citySelect = $('artisan-city');
    const submitBtn = $('artisan-submit-btn');
    const fields = {
      name: $('artisan-name'),
      category: categorySelect,
      city: citySelect,
      phone: $('artisan-phone'),
      description: $('artisan-description')
    };

    (config.categories || []).forEach(item => categorySelect?.appendChild(createOption(item.value, item.label)));
    (config.cities || []).forEach(city => citySelect?.appendChild(createOption(city, city)));

    const professionFromQuery = new URLSearchParams(window.location.search).get('metier');
    if (professionFromQuery && categorySelect) {
      const normalized = professionFromQuery.toLowerCase();
      const candidate = Array.from(categorySelect.options).find(option => option.value === normalized);
      if (candidate) categorySelect.value = candidate.value;
    }

    const runValidation = () => {
      const errors = {
        name: validateName(fields.name?.value),
        category: validateSelect(fields.category?.value, 'un métier'),
        city: validateSelect(fields.city?.value, 'une ville'),
        phone: validatePhone(fields.phone?.value),
        description: validateDescription(fields.description?.value)
      };
      setFieldError(fields.name, errors.name);
      setFieldError(fields.category, errors.category);
      setFieldError(fields.city, errors.city);
      setFieldError(fields.phone, errors.phone);
      setFieldError(fields.description, errors.description);
      const isValid = Object.values(errors).every(value => !value);
      if (submitBtn) submitBtn.disabled = !isValid;
      return { isValid, errors };
    };

    Object.values(fields).forEach(field => {
      field?.addEventListener('input', runValidation);
      field?.addEventListener('change', runValidation);
      field?.addEventListener('blur', runValidation);
    });

    runValidation();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const { isValid } = runValidation();
      if (!isValid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Activation...';

      const artisan = window.FixeoArtisanOnboardingStore.addArtisan({
        name: fields.name.value,
        category: fields.category.value,
        city: fields.city.value,
        phone: fields.phone.value,
        description: fields.description.value
      }, config);

      createArtisanSession(artisan, config);
      window.FixeoArtisanOnboardingStore.storeNotice('Votre profil est actif, vous pouvez recevoir des demandes');
      showToast('Votre profil est actif, vous pouvez recevoir des demandes');
      renderSuccess(artisan, config);
      submitBtn.textContent = 'Redirection...';
      submitBtn.disabled = true;
      redirectAfterOnboarding();
    });
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
