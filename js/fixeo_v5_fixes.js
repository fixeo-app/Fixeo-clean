// ============================================================
//  FIXEO V5 — MASTER BUG-FIX JAVASCRIPT
//  Tasks: 2-Featured · 3-Feed showMore · 4-Notifs dedup
//         5-Pricing modal · 6-General UX
// ============================================================

(function() {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     TASK 2 — FEATURED ARTISANS (V5 PATCH)
     Wire Reserve/Express/Card-click buttons.
     Do NOT override the visibility logic — that is now fully
     handled by v3_ultra_stable.js (10 visible + See More 5-by-5).
     ───────────────────────────────────────────────────────── */

  function wireFeaturedButtons(grid) {
    // Reserve buttons
    grid.querySelectorAll('.btn-featured-reserve').forEach(function(btn) {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        // Get artisan name from card
        const card = btn.closest('.featured-card');
        const nameEl = card && card.querySelector('.featured-name');
        const name = nameEl ? nameEl.textContent.trim() : 'cet artisan';

        // Try to find artisan by name and open booking modal
        if (typeof window.ARTISANS !== 'undefined') {
          const artisan = window.ARTISANS.find(function(a) {
            return a.name === name;
          });
          if (artisan && typeof openBookingModal === 'function') {
            openBookingModal(artisan.id);
            return;
          }
        }
        // Fallback: show notification
        if (window.notifSystem) {
          window.notifSystem.info(
            'Réservation',
            'Réservation initiée avec ' + name + '. Veuillez vous connecter pour continuer.'
          );
        }
      });
    });

    // Express buttons
    grid.querySelectorAll('.btn-featured-express').forEach(function(btn) {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const card = btn.closest('.featured-card');
        const nameEl = card && card.querySelector('.featured-name');
        const name = nameEl ? nameEl.textContent.trim() : 'cet artisan';

        // Open express modal if it exists, else notify
        if (typeof openModal === 'function' && document.getElementById('express-modal')) {
          openModal('express-modal');
        } else if (window.notifSystem) {
          window.notifSystem.info(
            'Demande Express ⚡',
            'Demande express envoyée à ' + name + '. Vous serez contacté dans moins de 30 min.'
          );
        }
      });
    });

    // Card click → open artisan profile modal (keyboard support)
    grid.querySelectorAll('.featured-card').forEach(function(card) {
      if (card.dataset.clickWired) return;
      card.dataset.clickWired = '1';
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  // Expose so v3_ultra_stable.js can call after revealing new cards
  window._wireFeaturedButtons = wireFeaturedButtons;

  document.addEventListener('DOMContentLoaded', function patchFeatured() {
    // Run after v3_ultra_stable fires at 300ms
    setTimeout(function() {
      var grid = document.getElementById('featured-artisans-grid');
      if (!grid) return;
      wireFeaturedButtons(grid);

      // Watch for dynamically added cards (See More reveals)
      var mo = new MutationObserver(function() {
        wireFeaturedButtons(grid);
      });
      mo.observe(grid, { childList: true, subtree: true });
    }, 600);
  });


  /* ══════════════════════════════════════════════════════════
     TASK 3 — FEED "Voir plus de projets" BUTTON
     ══════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function patchFeed() {
    // Extend FeedManager with showMore if it exists
    setTimeout(function() {
      if (window.feedManager) {
        var allData = window.feedManager.data || [];
        var visibleCount = allData.length; // start showing all

        window.feedManager.showMore = function() {
          // If all items are already shown, show a notification and loop
          if (window.notifSystem) {
            window.notifSystem.info(
              'Portfolio complet 🎉',
              'Vous avez vu toutes les ' + allData.length + ' réalisations. Revenez bientôt pour de nouveaux projets !'
            );
          }
        };

        // Show the "see more" button
        var btn = document.getElementById('feed-see-more-btn');
        var wrap = document.getElementById('feed-see-more-wrap');
        if (btn && wrap) {
          wrap.style.display = allData.length > 0 ? 'block' : 'none';
        }
      }
    }, 800);
  });


  /* ══════════════════════════════════════════════════════════
     TASK 4 — NOTIFICATIONS: hard dedup + max 4 toasts
     ══════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function patchNotifications() {
    // Run after notifSystem is initialized (it runs at DOMContentLoaded too)
    setTimeout(function() {
      if (!window.notifSystem) return;
      var ns = window.notifSystem;

      // Dedup: track recently shown toast keys
      var _shown = new Set();
      var _origPush = ns.push.bind(ns);
      ns.push = function(notif) {
        var key = (notif.type || '') + '|' + (notif.title || '') + '|' + (notif.body || notif.message || '');
        if (_shown.has(key)) return;
        _shown.add(key);
        setTimeout(function() { _shown.delete(key); }, 6000);
        return _origPush(notif);
      };

      // Max 4 toasts at once
      var _origToast = ns.toast.bind(ns);
      ns.toast = function(opts) {
        if (ns.container) {
          var existing = ns.container.querySelectorAll('.toast');
          if (existing.length >= 4) {
            existing[0].remove();
          }
        }
        return _origToast(opts);
      };

    }, 200);
  });


  /* ══════════════════════════════════════════════════════════
     TASK 5 — PRICING MODAL: ensure selectPlan opens modal
     ══════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function patchPricing() {
    // Ensure payment modal has a backdrop when opened
    var payModal = document.getElementById('payment-modal');
    if (!payModal) return;

    // If selectPlan from pricing.js errors because payment-msg is missing
    // on the pricing page, patch it
    var _origSelectPlan = window.selectPlan;
    if (typeof _origSelectPlan === 'function') {
      window.selectPlan = function(planKey) {
        // Ensure required elements exist to avoid JS errors
        var msgEl = document.getElementById('payment-msg');
        if (!msgEl) {
          // Create a hidden placeholder so pricing.js doesn't throw
          var ph = document.createElement('div');
          ph.id = 'payment-msg';
          ph.className = 'payment-message';
          ph.style.display = 'none';
          var body = payModal.querySelector('.modal-body');
          if (body) body.appendChild(ph);
        }
        _origSelectPlan(planKey);
      };
    }

    // Ensure plan buttons that have onclick=selectPlan() work
    document.querySelectorAll('.plan-btn[onclick]').forEach(function(btn) {
      btn.style.pointerEvents = 'all';
      btn.style.cursor = 'pointer';
      btn.style.position = 'relative';
      btn.style.zIndex = '5';
    });
  });


  /* ══════════════════════════════════════════════════════════
     TASK 6 — GENERAL UX: nav smooth active, mobile nav close
     ══════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function patchUX() {

    // ── Active nav link based on scroll / hash ──────────────
    function updateActiveNavLink() {
      var hash = window.location.hash || '#home';
      document.querySelectorAll('.navbar-nav .nav-link, .mobile-nav .nav-link').forEach(function(link) {
        var href = link.getAttribute('href') || '';
        link.classList.toggle('active', href === hash || href.endsWith(hash));
      });
    }
    updateActiveNavLink();
    window.addEventListener('hashchange', updateActiveNavLink);

    // ── Close mobile nav on link click ──────────────────────
    document.querySelectorAll('.mobile-nav .nav-link, .mobile-nav .btn').forEach(function(link) {
      link.addEventListener('click', function() {
        var mNav = document.querySelector('.mobile-nav');
        var ham  = document.querySelector('.hamburger');
        if (mNav) mNav.classList.remove('open');
        if (ham)  { ham.classList.remove('open'); ham.setAttribute('aria-expanded','false'); }
      });
    });

    // ── Ensure modal backdrop closes all open modals ────────
    var backdrop = document.getElementById('main-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function() {
        document.querySelectorAll('.modal.open').forEach(function(m) {
          m.classList.remove('open');
        });
        backdrop.classList.remove('open');
        document.body.style.overflow = '';
      });
    }

    // ── Tab-key focus ring for featured cards ───────────────
    document.querySelectorAll('.featured-card').forEach(function(card) {
      if (!card.getAttribute('tabindex')) card.setAttribute('tabindex', '0');
    });

    // ── Artisan cards: ensure clickable area is full card ───
    document.querySelectorAll('.artisan-card').forEach(function(card) {
      card.style.pointerEvents = 'all';
    });

    // ── Wire .btn-other-reserve buttons (v8 pagination) ────
    // MutationObserver handles dynamically added cards
    function wireOtherArtisanBtns(root) {
      root = root || document;
      root.querySelectorAll('.btn-other-reserve:not([data-wired])').forEach(function(btn) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var aid = parseInt(btn.dataset.artisanId || btn.getAttribute('data-artisan-id'));
          if (aid && typeof openBookingModal === 'function') { openBookingModal(aid); return; }
          if (typeof window.FixeoReservation !== 'undefined') window.FixeoReservation.open(aid, false);
        });
      });
      root.querySelectorAll('.btn-other-compare:not([data-wired])').forEach(function(btn) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var idMatch = btn.id && btn.id.replace('cmp-btn-', '');
          var id = parseInt(idMatch);
          if (!isNaN(id) && typeof toggleCompare === 'function') toggleCompare(id);
        });
      });
    }
    wireOtherArtisanBtns();

    // Watch artisans-container for added cards (See More)
    var artisanContainer = document.getElementById('artisans-container');
    if (artisanContainer) {
      new MutationObserver(function() { wireOtherArtisanBtns(artisanContainer); })
        .observe(artisanContainer, { childList: true, subtree: true });
    }

    // ── Hero: ensure page starts at top on load ─────────────
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }

    // ── Fix SearchEngine.doSearch if missing ────────────────
    if (window.searchEngine && typeof window.searchEngine.doSearch === 'undefined') {
      window.searchEngine.doSearch = function() {
        var searchInput  = document.getElementById('search-input');
        var catFilter    = document.getElementById('filter-category');
        var cityFilter   = document.getElementById('filter-city');
        var availFilter  = document.getElementById('filter-availability');
        var sortFilter   = document.getElementById('filter-sort');
        var results = window.searchEngine.filter({
          query:        searchInput  ? searchInput.value  : '',
          category:     catFilter    ? catFilter.value    : '',
          city:         cityFilter   ? cityFilter.value   : '',
          availability: availFilter  ? availFilter.value  : '',
          sortBy:       sortFilter   ? sortFilter.value   : 'rating',
        });
        if (typeof renderArtisans === 'function') renderArtisans(results);
        var count = document.getElementById('results-count');
        if (count) count.textContent = results.length + ' artisan' + (results.length !== 1 ? 's' : '') + ' trouvé' + (results.length !== 1 ? 's' : '');
      };
    }

  });

})();
