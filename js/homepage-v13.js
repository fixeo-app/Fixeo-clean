/* ====================================================================
   FIXEO V13 — UX ENHANCEMENTS JS
   Scroll animations · Lazy-load · Counter · Sticky header
   Pagination · City filter · Vedette upgrade · Back-to-top
   ==================================================================== */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     1. SCROLL-TRIGGERED FADE-IN ANIMATIONS
  ══════════════════════════════════════════════════════════════════ */
  function initScrollAnimations() {
    const selectors = [
      '.step-card', '.testimonial-card', '.feed-card',
      '.ssb2-artisan-card', '.artisan-card', '.badge-item',
      '.mission-item', '.leaderboard-item', '.chip',
      '.section-header'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.classList.contains('v12-fade-in')) {
          el.classList.add('v12-fade-in');
        }
      });
    });

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.v12-fade-in').forEach(el => el.classList.add('visible'));
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

    document.querySelectorAll('.v12-fade-in').forEach(el => obs.observe(el));
  }

  /* ══════════════════════════════════════════════════════════════════
     2. LAZY-LOADING IMAGES
  ══════════════════════════════════════════════════════════════════ */
  function initLazyLoad() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.classList.add('loaded');
      });
      return;
    }

    const imgObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.onload = () => img.classList.add('loaded');
          }
          imgObs.unobserve(img);
        }
      });
    }, { rootMargin: '250px' });

    document.querySelectorAll('img[data-src]').forEach(img => imgObs.observe(img));

    // Re-observe dynamically added images
    const mutObs = new MutationObserver(() => {
      document.querySelectorAll('img[data-src]').forEach(img => {
        imgObs.observe(img);
      });
    });
    mutObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     3. STICKY NAVBAR SCROLL
  ══════════════════════════════════════════════════════════════════ */
  function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          navbar.classList.toggle('scrolled', window.pageYOffset > 60);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     4. ANIMATED HERO COUNTERS
  ══════════════════════════════════════════════════════════════════ */
  function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    if (!('IntersectionObserver' in window)) {
      counters.forEach(el => {
        el.textContent = parseInt(el.dataset.counter, 10).toLocaleString('fr-FR');
      });
      return;
    }

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.counter, 10);
        const duration = 1800;
        const start = performance.now();

        const tick = (now) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target).toLocaleString('fr-FR');
          if (progress < 1) requestAnimationFrame(tick);
          else el.textContent = target.toLocaleString('fr-FR');
        };

        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    }, { threshold: 0.35 });

    counters.forEach(c => obs.observe(c));
  }

  /* ══════════════════════════════════════════════════════════════════
     5. SMOOTH SCROLL FOR ANCHOR LINKS
  ══════════════════════════════════════════════════════════════════ */
  function initSmoothScroll() {
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();

      const navH = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--navbar-height') || '70', 10
      );
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.pageYOffset - navH - 16,
        behavior: 'smooth'
      });

      // Close mobile nav
      const mobileNav = document.querySelector('.mobile-nav');
      const hamburger = document.querySelector('.hamburger');
      if (mobileNav?.classList.contains('open')) {
        mobileNav.classList.remove('open');
        hamburger?.classList.remove('open');
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     6. CITY FILTER — SERVICES SECTION
  ══════════════════════════════════════════════════════════════════ */
  function initCityFilter() {
    const select = document.getElementById('services-city-filter');
    const label  = document.getElementById('services-city-label');
    const name   = document.getElementById('services-city-name');
    if (!select) return;

    select.addEventListener('change', () => {
      const city = select.value;
      if (city && label && name) {
        name.textContent = city;
        label.style.display = 'inline';
      } else if (label) {
        label.style.display = 'none';
      }

      // Relay filter to main search engine
      const filterCityEl = document.getElementById('filter-city');
      if (filterCityEl && window.searchEngine) {
        filterCityEl.value = city;
        filterCityEl.dispatchEvent(new Event('change'));
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     7. INJECT RÉSERVER BUTTON ON VEDETTE CARDS
  ══════════════════════════════════════════════════════════════════ */
  function upgradeVedetteCards() {
    const upgrade = () => {
      document.querySelectorAll('.ssb2-artisan-card').forEach(card => {
        if (card.querySelector('.ssb2-card-footer')) return;

        const artisanId = card.dataset.artisanId || card.dataset.id || '';
        const footer = document.createElement('div');
        footer.className = 'ssb2-card-footer v12-card-actions card-buttons';

        const btnR = document.createElement('button');
        btnR.className = 'ssb2-btn-reserve v12-btn-reserve fixeo-reserve-btn';
        btnR.innerHTML = '📅 Réserver';
        btnR.setAttribute('aria-label', 'Réserver cet artisan');
        btnR.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(artisanId);
          if (window.FixeoReservation && id) window.FixeoReservation.openBooking(id);
          else if (window.openBookingModal && id) window.openBookingModal(id);
          else card.click();
        });

        footer.appendChild(btnR);
        card.appendChild(footer);
        card.classList.add('v12-fade-in');
        setTimeout(() => card.classList.add('visible'), 60);
      });
    };

    upgrade();
    setTimeout(upgrade, 600);
    setTimeout(upgrade, 1800);

    // Watch for dynamically added cards
    const mutObs = new MutationObserver(() => upgrade());
    const vedetteGrid = document.getElementById('ssb2-vedette-grid');
    const artisansCont = document.getElementById('artisans-container');
    if (vedetteGrid) mutObs.observe(vedetteGrid, { childList: true, subtree: true });
    if (artisansCont) mutObs.observe(artisansCont, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     8. ARTISAN GRID PAGINATION
  ══════════════════════════════════════════════════════════════════ */
  function initArtisanPagination() {
    const container = document.getElementById('artisans-container');
    if (!container) return;

    const ITEMS_PER_PAGE = 10;
    let currentPage = 1;

    function renderPagination(totalItems) {
      const existing = document.getElementById('v12-pagination');
      if (existing) existing.remove();

      const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
      if (totalPages <= 1) return;

      const wrap = document.createElement('div');
      wrap.id = 'v12-pagination';
      wrap.className = 'v12-pagination';

      const mkBtn = (label, page, active, disabled) => {
        const btn = document.createElement('button');
        btn.className = 'v12-pagination-btn' + (active ? ' active' : '');
        btn.innerHTML = label;
        btn.disabled = disabled;
        if (!disabled) btn.addEventListener('click', () => { currentPage = page; applyPage(); });
        return btn;
      };

      wrap.appendChild(mkBtn('←', currentPage - 1, false, currentPage === 1));

      const maxV = 5;
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxV - 1);
      if (end - start < maxV - 1) start = Math.max(1, end - maxV + 1);

      for (let i = start; i <= end; i++) {
        wrap.appendChild(mkBtn(i, i, i === currentPage, false));
      }
      wrap.appendChild(mkBtn('→', currentPage + 1, false, currentPage === totalPages));

      container.after(wrap);
    }

    function applyPage() {
      const cards = container.querySelectorAll('.artisan-card');
      const total = cards.length;
      const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
      const endIdx = startIdx + ITEMS_PER_PAGE;

      cards.forEach((card, i) => {
        card.style.display = (i >= startIdx && i < endIdx) ? '' : 'none';
        if (i >= startIdx && i < endIdx) {
          card.classList.add('v12-fade-in');
          setTimeout(() => card.classList.add('visible'), i * 50);
        }
      });

      renderPagination(total);

      if (currentPage > 1) {
        const section = document.getElementById('artisans-section');
        if (section) {
          const navH = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--navbar-height') || '70', 10
          );
          window.scrollTo({
            top: section.getBoundingClientRect().top + window.pageYOffset - navH - 24,
            behavior: 'smooth'
          });
        }
      }
    }

    // Watch for cards being injected
    const obs = new MutationObserver(() => {
      const cards = container.querySelectorAll('.artisan-card');
      if (cards.length > ITEMS_PER_PAGE) applyPage();
    });
    obs.observe(container, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     9. FEED "VOIR PLUS" BUTTON
  ══════════════════════════════════════════════════════════════════ */
  function initFeedShowMore() {
    const btn = document.getElementById('feed-see-more-btn');
    const grid = document.getElementById('feed-container');
    if (!btn || !grid) return;

    btn.addEventListener('click', () => {
      setTimeout(() => {
        grid.querySelectorAll('.feed-card').forEach((card, idx) => {
          card.classList.add('v12-fade-in');
          setTimeout(() => card.classList.add('visible'), idx * 60);
        });
        initLazyLoad();
      }, 80);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     10. BACK-TO-TOP BUTTON
  ══════════════════════════════════════════════════════════════════ */
  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;

    const toggle = () => {
      const show = window.pageYOffset > 420;
      btn.style.opacity = show ? '1' : '0';
      btn.style.transform = show ? 'translateY(0)' : 'translateY(12px)';
      btn.style.pointerEvents = show ? 'all' : 'none';
    };

    btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    window.addEventListener('scroll', toggle, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ══════════════════════════════════════════════════════════════════
     11. GAMIFICATION — LEADERBOARD STAGGER ANIMATION
  ══════════════════════════════════════════════════════════════════ */
  function initLeaderboardAnimation() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.querySelectorAll('.leaderboard-item').forEach((item, idx) => {
          item.style.animationDelay = `${idx * 0.07}s`;
          item.classList.add('v12-fade-in');
          setTimeout(() => item.classList.add('visible'), idx * 70);
        });
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.2 });

    const lb = document.querySelector('.leaderboard-list');
    if (lb) obs.observe(lb);
  }

  /* ══════════════════════════════════════════════════════════════════
     12. REMOVE DUPLICATE "TROUVER ARTISAN" BUTTON
  ══════════════════════════════════════════════════════════════════ */
  function removeDuplicateCTA() {
    document.querySelectorAll('.hero-actions a, .hero-actions button').forEach(btn => {
      const txt = btn.textContent.trim().toLowerCase();
      if (txt.includes('trouver artisan') && !txt.includes('voir')) {
        btn.style.display = 'none';
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     13. STATS HERO — ADD DIVIDERS BETWEEN ITEMS
  ══════════════════════════════════════════════════════════════════ */
  function initHeroStatsDividers() {
    const stats = document.querySelector('.hero-stats');
    if (!stats) return;

    const items = stats.querySelectorAll('.hero-stat');
    items.forEach((item, idx) => {
      if (idx < items.length - 1) {
        const div = document.createElement('div');
        div.className = 'hero-stat-divider';
        div.setAttribute('aria-hidden', 'true');
        item.after(div);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     14. MOBILE NAV — HAMBURGER
  ══════════════════════════════════════════════════════════════════ */
  function initHamburger() {
    if (window.FixeoMobileMenu && window.FixeoMobileMenu.initialized) return;
    const hamburger = document.querySelector('.hamburger');
    const mobileNav = document.querySelector('.mobile-nav');
    if (!hamburger || !mobileNav) return;

    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close on backdrop click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     15. WATCH FOR DYNAMIC CARD ADDITIONS (LAZY ANIMATION)
  ══════════════════════════════════════════════════════════════════ */
  function watchDynamicCards() {
    if (!('IntersectionObserver' in window)) return;

    const cardObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          cardObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });

    const domObs = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const cards = node.matches?.('.artisan-card, .ssb2-artisan-card, .feed-card, .step-card')
            ? [node]
            : Array.from(node.querySelectorAll?.('.artisan-card, .ssb2-artisan-card, .feed-card, .step-card') || []);
          cards.forEach(card => {
            if (!card.classList.contains('v12-fade-in')) {
              card.classList.add('v12-fade-in');
              cardObs.observe(card);
            }
          });
        });
      });
    });

    domObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     16. TESTIMONIALS — ENSURE STARS
  ══════════════════════════════════════════════════════════════════ */
  function initTestimonialsStars() {
    document.querySelectorAll('.testimonial-card').forEach(card => {
      if (!card.querySelector('.testimonial-stars')) {
        const stars = document.createElement('div');
        stars.className = 'testimonial-stars';
        stars.textContent = '★★★★★';
        card.insertBefore(stars, card.firstChild);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     17. KEYBOARD ACCESSIBILITY — CHIPS
  ══════════════════════════════════════════════════════════════════ */
  function initChipKeyboard() {
    document.querySelectorAll('.chip[tabindex]').forEach(chip => {
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chip.click();
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  function init() {
    initScrollAnimations();
    initLazyLoad();
    initNavbarScroll();
    initCounters();
    initSmoothScroll();
    initCityFilter();
    upgradeVedetteCards();
    initArtisanPagination();
    initFeedShowMore();
    initBackToTop();
    initLeaderboardAnimation();
    removeDuplicateCTA();
    initHeroStatsDividers();
    initHamburger();
    watchDynamicCards();
    initTestimonialsStars();
    initChipKeyboard();

    console.log('%c✅ Fixeo V13 UX loaded', 'color:#E1306C;font-weight:700;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
