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
    let discoveryLoad;
    document.getElementById('rafi-discovery')?.addEventListener('click', async function(event) {
      const trigger=event.target.closest('button[data-discovery]');
      if(!trigger || trigger.disabled)return;
      const status=document.querySelector('.fxd-load-status');
      trigger.disabled=true;trigger.setAttribute('aria-busy','true');
      try {
        if(!window.FixeoDiscovery){
          if(!discoveryLoad) discoveryLoad=new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src='js/fixeo-discovery-v1.js?v=launcher2';
            script.onload=resolve;script.onerror=()=>{script.remove();discoveryLoad=null;reject(new Error('load'));};document.head.append(script);
          });
          await discoveryLoad;
        }
        status.textContent='';window.FixeoDiscovery.open(trigger.dataset.discovery,trigger);
      } catch(_){status.textContent='Les situations n’ont pas pu être ouvertes. Réessayez ou décrivez votre besoin à RAFI en haut de page.';}
      finally{trigger.disabled=false;trigger.removeAttribute('aria-busy');}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
