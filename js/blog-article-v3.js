/**
 * FIXEO Blog Article V3 — blog-article-v3.js
 * Reading progress bar + Active TOC highlighting
 * Zero dependencies. Vanilla JS. Non-blocking (defer).
 * Version: 1.0 — 2026-07-11
 */
(function () {
  'use strict';

  /* ── 1. READING PROGRESS BAR ───────────────────────────────── */
  var progressBar = document.getElementById('ba-progress');
  if (progressBar) {
    var updateProgress = function () {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docH > 0 ? Math.min(100, (scrollTop / docH) * 100) : 0;
      progressBar.style.width = pct + '%';
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  /* ── 2. ACTIVE TOC HIGHLIGHTING (IntersectionObserver) ─────── */
  var tocLinks = document.querySelectorAll('.blog-toc-list a[href^="#"]');
  if (tocLinks.length > 0 && 'IntersectionObserver' in window) {
    var activeLink = null;

    var setActive = function (id) {
      if (activeLink) activeLink.classList.remove('ba-toc-active');
      var next = document.querySelector('.blog-toc-list a[href="#' + id + '"]');
      if (next) {
        next.classList.add('ba-toc-active');
        activeLink = next;
      }
    };

    var headingIds = [];
    tocLinks.forEach(function (a) {
      var id = a.getAttribute('href').replace('#', '');
      if (id) headingIds.push(id);
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-10% 0px -75% 0px',
        threshold: 0
      }
    );

    headingIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    // Activate first section on load if no intersection fires
    if (headingIds[0]) {
      setTimeout(function () {
        if (!activeLink) setActive(headingIds[0]);
      }, 300);
    }
  }

  /* ── 3. SMOOTH SCROLL for TOC anchor links ─────────────────── */
  /* (CSS scroll-behavior: smooth is already set on html — this is a fallback
     for browsers that don't support it and for JS-driven active state) */
  document.querySelectorAll('.blog-toc-list a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = this.getAttribute('href').replace('#', '');
      var target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Update hash without jumping
        if (history.replaceState) {
          history.replaceState(null, '', '#' + id);
        }
      }
    });
  });

})();
