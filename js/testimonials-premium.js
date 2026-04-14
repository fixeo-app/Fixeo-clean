/* testimonials-premium.js v1.0
   Auto-scroll testimonials grid (desktop only, pauses on hover/touch).
   Zero logic changes — UI enhancement only.
*/
(function () {
  'use strict';

  function init() {
    var grid = document.querySelector('.testimonial-section .testimonials-grid');
    if (!grid) return;

    // Only on desktop
    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    var speed = 0.5;   // px per frame
    var paused = false;
    var raf;

    function step() {
      if (!paused) {
        grid.scrollLeft += speed;
        // When we've scrolled to the end, reset to start (loop)
        if (grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2) {
          grid.scrollLeft = 0;
        }
      }
      raf = requestAnimationFrame(step);
    }

    // Pause on hover or touch
    grid.addEventListener('mouseenter', function () { paused = true; });
    grid.addEventListener('mouseleave', function () { paused = false; });
    grid.addEventListener('touchstart', function () { paused = true; }, { passive: true });
    grid.addEventListener('touchend', function () {
      setTimeout(function () { paused = false; }, 2000);
    }, { passive: true });

    // Start after small delay so page is settled
    setTimeout(function () {
      raf = requestAnimationFrame(step);
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }
})();
