(function (window, document) {
  'use strict';

  function updateStaticSeoState() {
    if (!document.body || document.body.getAttribute('data-fixeo-seo-static') !== 'true') return;
    var container = document.getElementById('artisans-container');
    var emptyState = document.getElementById('no-artisan');
    var countNode = document.getElementById('results-count');
    if (!container) return;

    var cards = container.querySelectorAll('.artisan-card');
    var count = cards.length;
    if (countNode) {
      countNode.textContent = count ? (count + ' artisan' + (count > 1 ? 's' : '') + ' trouvé' + (count > 1 ? 's' : '')) : '0 artisan trouvé';
    }
    if (emptyState) {
      emptyState.style.display = count ? 'none' : 'block';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateStaticSeoState);
  } else {
    updateStaticSeoState();
  }
})(window, document);
