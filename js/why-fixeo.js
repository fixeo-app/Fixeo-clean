/**
 * why-fixeo.js
 * Staggered entrance animation for #why-fixeo-section cards.
 * IntersectionObserver: cards fade+slide in when section enters viewport.
 */
(function () {
  'use strict';

  function init() {
    var grid = document.getElementById('why-fixeo-grid');
    if (!grid) return;

    var cards = Array.from(grid.querySelectorAll('.wf-card'));
    if (!cards.length) return;

    if (!window.IntersectionObserver) {
      // Fallback: show all immediately
      cards.forEach(function (c) { c.classList.add('wf-visible'); });
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      obs.disconnect();
      cards.forEach(function (card, i) {
        setTimeout(function () {
          card.classList.add('wf-visible');
        }, i * 80);
      });
    }, { threshold: 0.12 });

    obs.observe(grid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
