/* Homepage interactions only. No artisan collection, matching or booking stack. */
(function () {
  'use strict';

  function selectCategory(category) {
    var found = false;
    document.querySelectorAll('#services [data-category]').forEach(function (chip) {
      var active = chip.dataset.category === category;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
      if (active) found = true;
    });
    return found;
  }
  window.FixeoSelectServiceCategory = selectCategory;

  function focusNeed() {
    var input = document.getElementById('fxhf-need-input');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  }

  // Preserve the generic modal contract used by the current request-flow shim.
  window.openModal = function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    var backdrop = document.getElementById('main-backdrop');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
    var backdrop = document.getElementById('main-backdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
  };

  function init() {
    // Keep explicitly chosen city available to subsequent RAFI handoffs.
    document.addEventListener('change', function (event) {
      if (event.target.id !== 'fxhf-location') return;
      try {
        if (event.target.value) sessionStorage.setItem('fxrf4_trusted_city_session', event.target.value);
        else sessionStorage.removeItem('fxrf4_trusted_city_session');
      } catch (_) {}
    });
    // The hidden legacy input is still consumed by estimate-resume components.
    // Header search must focus the visible current hero instead.
    if (window.QuickSearchModal) {
      window.QuickSearchModal.focusInline = focusNeed;
      window.QuickSearchModal.open = focusNeed;
    }
    document.getElementById('services')?.addEventListener('click', function (event) {
      var chip = event.target.closest('button[data-category]');
      if (!chip) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectCategory(chip.dataset.category);
      var city = document.getElementById('fxhf-location')?.value ||
        document.getElementById('services-city-filter')?.value || '';
      var label = chip.querySelector('.fc3-card-label')?.textContent.trim() || chip.textContent.trim();
      var input = document.getElementById('fxhf-need-input');
      if (input) {
        input.value = label;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (window.FixeoEstimatorV2 && typeof window.FixeoEstimatorV2.open === 'function') {
        window.FixeoEstimatorV2.open({
          source: 'homepage_service', city: city, description: label,
          metier_hint: chip.dataset.category
        });
      } else if (window.FixeoRequestFlowV4) {
        window.FixeoRequestFlowV4.open({
          source: 'homepage_service', mode: 'default',
          prefillCity: city, prefillService: chip.dataset.category
        });
      } else focusNeed();
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
