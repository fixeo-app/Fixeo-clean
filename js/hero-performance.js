(function() {
  'use strict';

  const idle = window.requestIdleCallback
    ? (cb, timeout) => window.requestIdleCallback(cb, { timeout: timeout || 1800 })
    : (cb) => setTimeout(cb, 900);

  function scheduleTopArtisans(fn) {
    if (typeof fn !== 'function') return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      fn();
    };

    const section = document.getElementById('top-artisans');
    if ('IntersectionObserver' in window && section) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      }, { rootMargin: '280px 0px' });
      observer.observe(section);
    }

    idle(run, 2200);
    window.addEventListener('load', () => idle(run, 2500), { once: true });
  }

  function optimizeImages() {
    document.querySelectorAll('#top-artisans img, #recommended-artisan-section img, #feed-section img').forEach((img) => {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
  }

  function init() {
    optimizeImages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.FixeoHeroPerf = Object.assign(window.FixeoHeroPerf || {}, {
    scheduleTopArtisans
  });
})();
