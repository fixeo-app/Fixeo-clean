/* ================================================================
   FIXEO — SECTIONS REVEAL (fixeo-sections-reveal.js)
   Ultra-early DOMContentLoaded handler.
   Adds body.fixeo-sections-ready as soon as DOM is interactive,
   ensuring how-it-works, feed, testimonials, final-cta are never
   permanently hidden if fixeo_homepage_premium_patch.js is slow.
   
   This is a SAFETY NET. fixeo_homepage_premium_patch.js also adds
   fixeo-sections-ready after rendering the premium grid.
   Whichever fires first wins (class add is idempotent).
================================================================ */
(function () {
  'use strict';

  function revealSections() {
    // Only on homepage
    if (!document.body.classList.contains('fixeo-homepage-mode')) return;
    document.body.classList.add('fixeo-sections-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealSections, { once: true });
  } else {
    // Already interactive
    revealSections();
  }
})();
