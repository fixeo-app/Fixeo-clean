/*
 * fixeo-profile-v1jb.js — V1-JB Mobile Profile Conversion & Trust Polish
 * Version: v1jb
 * Loaded on: artisan-profile.html only (deferred)
 *
 * Responsibilities:
 *   1. Premium typographic avatar (initials, per-name gradient)
 *   2. Sticky CTA: hidden on load, slides in after hero scrolls past
 *   3. Trust indicators: hide when profile too sparse (missions < 3 OR confirmations < 2)
 *   4. Empty review state: upgrade cold "Aucun avis" copy
 *   5. "Indicateurs de confiance" section label hide when section hidden
 *
 * Constraints:
 *   - Render-once (data-v1jbDone guards)
 *   - No polling. No setInterval. No new network calls.
 *   - Reads only from DOM + Supabase artisan object (passed via window._v1jbArtisan)
 *   - Does NOT touch reservation.js, V1-A → V1-J pipeline, or COD flow
 */
(function () {
  'use strict';
  if (window._fxV1jbLoaded) return;
  window._fxV1jbLoaded = true;

  /* ── Avatar gradient palette ────────────────────────────
   * 9 premium pairs. Hashed from name string to ensure
   * same artisan always gets the same gradient (deterministic).
   * No random. No childish. No Instagram pink.
   * Inspired by: Linear, Stripe, Notion — product-grade gradients.
   * ─────────────────────────────────────────────────────── */
  var AVATAR_GRADIENTS = [
    ['135deg', '#1e3a5f', '#2d6a9f'],   /* deep ocean blue */
    ['135deg', '#1a2a1a', '#2d5a3d'],   /* forest green */
    ['135deg', '#2a1a3e', '#5a2d8a'],   /* deep indigo */
    ['135deg', '#2a1a1a', '#7a3d2d'],   /* warm mahogany */
    ['135deg', '#1a2a3a', '#2d5a7a'],   /* steel blue */
    ['135deg', '#2a2a1a', '#6a5a2d'],   /* muted gold */
    ['135deg', '#1a1a2a', '#3d3d6a'],   /* slate indigo */
    ['135deg', '#2a1a2a', '#6a2d5a'],   /* plum */
    ['135deg', '#1a2a2a', '#2d6a6a'],   /* teal */
  ];

  /* Deterministic hash 0–8 from a string */
  function _nameHash(str) {
    var h = 0;
    for (var i = 0; i < (str || '').length; i++) {
      h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
    }
    return h % AVATAR_GRADIENTS.length;
  }

  /* Extract initials: "Mohammed Alaoui" → "MA", "Ali" → "AL" */
  function _initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0].slice(0, 2)).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ── 1. Premium typographic avatar ──────────────────────
   * Target: .public-avatar-fallback (rendered by renderProfile)
   * Only applied when no real <img> is visible.
   * Removes the V2C silhouette (fpv2c-silhouette-host) safely.
   * ─────────────────────────────────────────────────────── */
  function _upgradeAvatar() {
    var fallback = document.querySelector('.public-avatar-fallback');
    if (!fallback || fallback.dataset.v1jbAvatar) return;
    fallback.dataset.v1jbAvatar = '1';

    /* Check if a real image is already showing */
    var img = document.querySelector('.public-avatar');
    if (img && img.naturalWidth > 0) return; /* real photo present — do nothing */

    /* Get artisan name from h1 or aria */
    var h1 = document.querySelector('#public-artisan-root h1, .public-hero-main h1');
    var artisanName = h1 ? h1.textContent.trim() : '';
    if (!artisanName) {
      /* Fallback: try meta or title */
      artisanName = (document.querySelector('meta[property="og:title"]') || {}).content || '';
    }

    var letters = _initials(artisanName);
    var idx     = _nameHash(artisanName);
    var grad    = AVATAR_GRADIENTS[idx];

    /* Remove V2C silhouette classes that fight us */
    fallback.classList.remove('fpv2c-silhouette-host');
    fallback.classList.remove('fpv2c-grad--plomberie', 'fpv2c-grad--electricite',
      'fpv2c-grad--peinture', 'fpv2c-grad--nettoyage', 'fpv2c-grad--jardinage',
      'fpv2c-grad--demenagement', 'fpv2c-grad--bricolage', 'fpv2c-grad--climatisation',
      'fpv2c-grad--menuiserie', 'fpv2c-grad--maconnerie', 'fpv2c-grad--serrurerie',
      'fpv2c-grad--default');

    /* Apply initials avatar */
    fallback.classList.add('fpv1jb-initials-avatar');
    fallback.style.background = 'linear-gradient(' + grad[0] + ', ' + grad[1] + ', ' + grad[2] + ')';
    fallback.textContent = letters;

    /* Also make the wrapper circular to match */
    var wrap = document.querySelector('.public-avatar-wrap');
    if (wrap && !wrap.dataset.v1jbAvatarWrap) {
      wrap.dataset.v1jbAvatarWrap = '1';
      /* Ensure circular clip matches the avatar */
      fallback.style.borderRadius = '50%';
    }
  }

  /* ── 2. Sticky CTA: hidden on load, shows after hero scrolls past ──
   * Uses IntersectionObserver on #public-artisan-action (hero CTA).
   * When hero CTA is NOT intersecting → add .fpv1jb-sticky-visible
   * When hero CTA IS intersecting (in viewport) → remove class
   * This matches the EXACT UX: sticky appears only when hero is gone.
   * ─────────────────────────────────────────────────────────────────── */
  function _initStickyReveal() {
    var sticky = document.getElementById('ppui-sticky-cta');
    if (!sticky || sticky.dataset.v1jbSticky) return;
    sticky.dataset.v1jbSticky = '1';

    /* Initial state: ensure hidden (CSS handles it via fpv1jb-initials-avatar class,
     * but we also force transform via class absence) */
    sticky.classList.remove('fpv1jb-sticky-visible');

    var heroBtn = document.getElementById('public-artisan-action');
    if (!heroBtn) {
      /* No hero button found — show sticky immediately */
      sticky.classList.add('fpv1jb-sticky-visible');
      return;
    }

    if (!window.IntersectionObserver) {
      /* Fallback: scroll listener */
      window.addEventListener('scroll', function _stickyScroll() {
        var rect = heroBtn.getBoundingClientRect();
        var visible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (visible) {
          sticky.classList.remove('fpv1jb-sticky-visible');
        } else {
          sticky.classList.add('fpv1jb-sticky-visible');
        }
      }, { passive: true });
      return;
    }

    var obs = new IntersectionObserver(function(entries) {
      /* When hero CTA is visible: hide sticky. When gone: show sticky. */
      if (entries[0].isIntersecting) {
        sticky.classList.remove('fpv1jb-sticky-visible');
      } else {
        sticky.classList.add('fpv1jb-sticky-visible');
      }
    }, { threshold: 0.15, rootMargin: '0px' });
    obs.observe(heroBtn);
  }

  /* ── 3. Trust indicators: hide when profile is sparse ───
   * "Indicateurs de confiance" section hides when:
   *   missions < 3  AND  confirmed < 2
   * Reads DOM values already rendered by _injectTrustIndicators()
   * (fixeo-profile-premium-ui.js). We read the rendered numbers,
   * not external data — safe and decoupled.
   * ─────────────────────────────────────────────────────── */
  function _guardTrustIndicators() {
    var trustGrid = document.querySelector('.ppui-trust-grid--v2a, .ppui-trust-grid');
    if (!trustGrid || trustGrid.dataset.v1jbGuard) return;
    trustGrid.dataset.v1jbGuard = '1';

    /* Read mission count and confirmation rate from rendered items */
    var items = trustGrid.querySelectorAll('.ppui-trust-item');
    var missions = 0;
    var confirmed = 0;
    items.forEach(function(item) {
      var val = parseInt((item.querySelector('.ppui-trust-value') || {}).textContent || '0', 10);
      var label = ((item.querySelector('.ppui-trust-label') || {}).textContent || '').toLowerCase();
      if (label.includes('mission') || label.includes('intervention')) missions = val;
      if (label.includes('confirm') || label.includes('valid')) confirmed = val;
    });

    /* Also check V1-H operational memory (trusted count from localStorage) */
    try {
      var store = window.FixeoClientRequestsStore;
      if (store && typeof store.list === 'function') {
        var h1 = document.querySelector('#public-artisan-root h1');
        var name = h1 ? h1.textContent.trim().toLowerCase() : '';
        var validated = store.list().filter(function(r) {
          var st = (r.status || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[\s_]/g, '');
          return st === 'validee'
            && String(r.artisan_name || r.assigned_artisan || '').trim().toLowerCase() === name;
        });
        if (validated.length > missions) missions = validated.length;
        if (validated.length > confirmed) confirmed = validated.length;
      }
    } catch(e) {}

    /* V2-C5A: If the grid is already in --operational mode (no metrics, only guarantees),
     * NEVER hide it — operational guarantees must always be visible to the user.
     * Only hide the metrics-heavy qualified grid when evidence is too sparse. */
    if (trustGrid.classList.contains('ppui-trust-grid--operational')) return;

    /* Hide the qualified (metrics) grid when below threshold */
    if (missions < 3 || confirmed < 2) {
      trustGrid.classList.add('fpv1jb-trust-hidden');

      /* Also hide parent section panel if it only contains this grid */
      var panel = trustGrid.closest('.ppui-section, .public-panel');
      if (panel) {
        /* Count visible non-hidden children */
        var visibleChildren = Array.from(panel.children).filter(function(c) {
          return !c.classList.contains('fpv1jb-trust-hidden')
            && getComputedStyle(c).display !== 'none';
        });
        if (visibleChildren.length <= 1) {
          panel.style.display = 'none';
        }
      }
    }
  }

  /* ── 4. Empty review state: upgrade copy ─────────────────
   * Replaces "Aucun avis pour le moment" with operational framing.
   * Target: any element containing that exact text.
   * ─────────────────────────────────────────────────────── */
  function _upgradeReviewEmpty() {
    var COLD_STRINGS = ['Aucun avis pour le moment', 'Aucun avis', 'Pas encore d\'avis'];
    var REPLACEMENT  = 'Ce profil commence \u00e0 recevoir ses premi\u00e8res interventions.';

    /* Search all text nodes in the artisan root */
    var root = document.getElementById('public-artisan-root') || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    var patched = [];
    while ((node = walker.nextNode())) {
      var text = node.textContent.trim();
      if (COLD_STRINGS.some(function(s) { return text.indexOf(s) !== -1; })) {
        node.textContent = node.textContent.replace(/Aucun avis[^.]*\.?/g, REPLACEMENT);
        var parent = node.parentElement;
        if (parent && !parent.dataset.v1jbReviewDone) {
          parent.dataset.v1jbReviewDone = '1';
          parent.classList.add('fpv1jb-review-state-text');
          patched.push(parent);
        }
      }
    }
  }

  /* ── 5. Re-run sticky reveal when premium-ui.js injects the sticky bar ──
   * premium-ui.js injects #ppui-sticky-cta asynchronously.
   * We watch for it with a brief MutationObserver.
   * ─────────────────────────────────────────────────────── */
  function _watchStickyInjection() {
    if (document.getElementById('ppui-sticky-cta')) {
      _initStickyReveal();
      return;
    }
    var obs = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.id === 'ppui-sticky-cta'
              || (node.querySelector && node.querySelector('#ppui-sticky-cta'))) {
            obs.disconnect();
            setTimeout(_initStickyReveal, 0);
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Main ───────────────────────────────────────────────── */
  function _init() {
    _upgradeAvatar();
    _upgradeReviewEmpty();
    _watchStickyInjection();

    /* Trust indicators: wait for premium-ui.js to render them */
    setTimeout(_guardTrustIndicators, 600);

    /* Re-check avatar after V2-A pipeline fires (it may re-render hero) */
    window.addEventListener('fixeo:profile:enhanced', function() {
      setTimeout(function() {
        _upgradeAvatar();
        _upgradeReviewEmpty();
        _guardTrustIndicators();
      }, 100);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_init, 200); });
  } else {
    setTimeout(_init, 200);
  }

  /* Also watch for async profile render */
  var _profileObs = new MutationObserver(function() {
    var hero = document.querySelector('.public-profile-hero');
    if (hero) {
      _profileObs.disconnect();
      setTimeout(function() {
        _upgradeAvatar();
        _upgradeReviewEmpty();
      }, 150);
    }
  });
  var _root = document.getElementById('public-artisan-root');
  if (_root) _profileObs.observe(_root, { childList: true, subtree: false });

})();
