/**
 * services-premium.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Stagger fade-in for service chips (desktop, IntersectionObserver)
 * 2. City select: toggle .has-value class when a city is selected
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO logic changes — purely cosmetic
 */
(function (window, document) {
  'use strict';

  var _done = false;

  function _init() {
    if (_done) return;
    var section = document.getElementById('services');
    if (!section) return;
    var chips = section.querySelectorAll('.chip[data-category]');
    if (!chips.length) return;
    _done = true;

    /* 1. City select: has-value class */
    var citySelect = document.getElementById('services-city-filter');
    if (citySelect) {
      function _syncCityClass() {
        if (citySelect.value) {
          citySelect.classList.add('has-value');
        } else {
          citySelect.classList.remove('has-value');
        }
      }
      citySelect.addEventListener('change', _syncCityClass);
      _syncCityClass();
    }

    /* 2. Chip stagger fade-in (desktop only) */
    if (window.innerWidth > 768 && window.IntersectionObserver) {
      var chipArr = Array.from(chips);
      var observer = new IntersectionObserver(function (entries) {
        var inView = entries.some(function (e) { return e.isIntersecting; });
        if (!inView) return;
        observer.disconnect();
        chipArr.forEach(function (chip, i) {
          setTimeout(function () {
            chip.classList.add('svc-visible');
          }, i * 28); /* 28ms stagger per chip — 12 chips = ~330ms total */
        });
      }, { threshold: 0.1 });

      /* Observe the chips container */
      var container = section.querySelector('.category-chips');
      if (container) observer.observe(container);
    } else {
      /* Mobile: all visible immediately */
      Array.from(chips).forEach(function (chip) {
        chip.classList.add('svc-visible');
      });
    }
  }

  function boot() {
    _init();
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (document.querySelector('#services .chip[data-category]')) {
          _init();
          if (_done) obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
