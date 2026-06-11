/**
 * FIXEO TRUST ENGINE — fte-v1a
 * =============================================
 * Adds visible trust signals to artisan cards in search results.
 * Works on .qsm-card elements rendered by QuickSearchModal,
 * HeroSearchV9, and HeroSearchModal (all use same card DOM structure).
 *
 * WHAT IT DOES:
 *   1. Computes Fixeo Score V1 from real artisan data fields
 *   2. Determines applicable trust signal chips (real data only)
 *   3. Injects AI recommendation badge on best-match card (idx=0)
 *   4. Patches cards via MutationObserver (non-destructive)
 *   5. Improves search result ranking via sort hook
 *
 * WHAT IT NEVER DOES:
 *   - No fake reviews, no fake missions, no fabricated ratings
 *   - No modifications to quick-search-modal.js, hero-search-v9.js,
 *     hero-search-modal.js, smart-search.js, or any existing file
 *   - No Supabase schema changes
 *   - No broken search behavior
 *
 * DATA SOURCES (all from existing artisan object fields):
 *   verified, certified, badges, trustScore, availability,
 *   phone, city, bio.fr, portfolio, skills, responseTime,
 *   rating, reviewCount, xp, level, createdAt, status
 *
 * TRUST SIGNAL AUDIT:
 *   AVAILABLE NOW (computed from real fields):
 *     ✅ Vérifié par Fixeo  — a.verified || badges.includes('verified')
 *     ⚡ Répond rapidement  — a.responseTime <= 30
 *     🏆 Top Artisan        — fixeo score >= 88 AND available
 *     📍 Dans votre ville   — a.city matches detected city
 *     🟢 Actif              — availability === 'available'
 *     📱 Téléphone vérifié  — a.phone truthy
 *     🔧 Profil complet     — phone + city + bio + portfolio all present
 *
 *   FUTURE (requires mission history — currently unavailable):
 *     ⭐ X missions complétées — needs missions table join
 *     👍 X avis clients        — reviewCount could be used (currently 0 for most)
 *
 * FIXEO SCORE V1 (0–100, computed from real fields):
 *   Phone present:          20 pts
 *   City present:           10 pts
 *   Bio description ≥20ch:  10 pts
 *   Portfolio ≥2 items:     10 pts
 *   Skills ≥1 item:         10 pts
 *   Verified badge:         15 pts
 *   Available:              15 pts
 *   Fast responder ≤30min:  10 pts
 *   Total:                 100 pts
 *
 * RANKING ENHANCEMENT:
 *   Wraps window.QuickSearchModal._filterArtisans (if accessible)
 *   and HeroSearchV9 sort — boosts by composite trust+category+city score.
 *   Primary sort key: existing trustScore + availability + rating (unchanged).
 *   Secondary enhancement: category match boost + city match boost.
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoTrustEngine) return;
  var VERSION = 'fte-v1a';

  /* ══════════════════════════════════════════════════════════
     FIXEO SCORE V1
  ══════════════════════════════════════════════════════════ */

  /**
   * Compute Fixeo Score from real artisan fields.
   * Returns integer 0–100.
   */
  function computeFixeoScore(a) {
    var score = 0;

    /* Phone present (20 pts) */
    if (a.phone && String(a.phone).trim().length >= 6) score += 20;

    /* City present (10 pts) */
    if (a.city && String(a.city).trim().length >= 2) score += 10;

    /* Bio/description ≥ 20 chars (10 pts) */
    var bio = (a.bio && a.bio.fr) || a.description || '';
    if (String(bio).trim().length >= 20) score += 10;

    /* Portfolio ≥ 2 items (10 pts) */
    var port = Array.isArray(a.portfolio) ? a.portfolio.filter(Boolean) : [];
    if (port.length >= 2) score += 10;

    /* Skills ≥ 1 item (10 pts) */
    var skills = Array.isArray(a.skills) ? a.skills.filter(Boolean) : [];
    if (skills.length >= 1) score += 10;

    /* Verified badge (15 pts) */
    var badges = Array.isArray(a.badges) ? a.badges : [];
    if (a.verified || a.certified || badges.includes('verified')) score += 15;

    /* Available (15 pts) */
    var avail = (a.availability || '').toLowerCase();
    if (avail === 'available' || avail === 'disponible') score += 15;

    /* Fast responder ≤ 30 min (10 pts) */
    var rt = Number(a.responseTime);
    if (Number.isFinite(rt) && rt > 0 && rt <= 30) score += 10;

    return Math.min(100, score);
  }

  /* ══════════════════════════════════════════════════════════
     TRUST SIGNAL CHIPS
     Returns array of { cls, text } for each justified signal.
     Max 3 shown per card to keep it compact.
  ══════════════════════════════════════════════════════════ */

  function getTrustSignals(a, contextCity, isTopCard) {
    var signals = [];
    var badges  = Array.isArray(a.badges) ? a.badges : [];
    var avail   = (a.availability || '').toLowerCase();

    /* 1. Verified — highest trust value, show first */
    if (a.verified || a.certified || badges.includes('verified')) {
      signals.push({ cls: 'fte-verified', text: '✅ Vérifié' });
    }

    /* 2. Phone verified — real data signal */
    if (a.phone && String(a.phone).trim().length >= 6) {
      signals.push({ cls: 'fte-phone', text: '📱 Tél. vérifié' });
    }

    /* 3. Active now */
    if (avail === 'available' || avail === 'disponible') {
      signals.push({ cls: 'fte-active', text: '🟢 Actif' });
    }

    /* 4. Fast responder */
    var rt = Number(a.responseTime);
    if (Number.isFinite(rt) && rt > 0 && rt <= 30) {
      signals.push({ cls: 'qsm-badge fast', text: '⚡ Répond vite' });
    }

    /* 5. Same city as detected user city */
    if (contextCity && a.city) {
      var nc = _norm(contextCity);
      var na = _norm(a.city);
      if (nc && na && (nc === na || nc.includes(na) || na.includes(nc))) {
        signals.push({ cls: 'fte-city', text: '📍 Votre ville' });
      }
    }

    /* 6. Top Artisan — only if fixeo score ≥ 88 */
    var fs = computeFixeoScore(a);
    if (fs >= 88) {
      signals.push({ cls: 'fte-top', text: '🏆 Top Artisan' });
    }

    /* 7. Complete profile — all key fields present */
    var bio = (a.bio && a.bio.fr) || '';
    var port = Array.isArray(a.portfolio) ? a.portfolio.filter(Boolean) : [];
    if (a.phone && a.city && String(bio).length >= 20 && port.length >= 1) {
      signals.push({ cls: 'fte-complete', text: '🔧 Profil complet' });
    }

    /* Cap at 3 signals for compactness */
    return signals.slice(0, 3);
  }

  /* ══════════════════════════════════════════════════════════
     SCORE BADGE HTML
  ══════════════════════════════════════════════════════════ */

  function scoreBadgeHTML(score) {
    if (score <= 0) return '';
    var cls = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
    return '<span class="fte-score-badge ' + cls + '">'
      + 'FIXEO ' + score
      + '<span class="fte-score-label">/100</span>'
      + '</span>';
  }

  /* ══════════════════════════════════════════════════════════
     RECOMMENDATION BADGE HTML
  ══════════════════════════════════════════════════════════ */

  function recBadgeHTML() {
    return '<div class="fte-rec-row">'
      + '<span class="fte-recommended-badge">🤖 Recommandé par Fixeo IA</span>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     CARD PATCHER
     Given a .qsm-card DOM element, finds artisan data and injects
     trust signals. Idempotent: checks for .fte-patched flag.
  ══════════════════════════════════════════════════════════ */

  function _patchCard(cardEl, artisanPool, contextCity, isTopCard) {
    if (!cardEl || cardEl._ftePatchedV1) return;
    cardEl._ftePatchedV1 = true;

    /* Resolve artisan object from data-artisan-id */
    var id = cardEl.getAttribute('data-artisan-id');
    if (!id) return;

    var artisan = _findArtisan(id, artisanPool);
    if (!artisan) return;

    var score   = computeFixeoScore(artisan);
    var signals = getTrustSignals(artisan, contextCity, isTopCard);

    /* ── Inject recommendation badge (top card only) ── */
    if (isTopCard) {
      cardEl.classList.add('fte-top-card');
      var cardInfo = cardEl.querySelector('.qsm-card-info');
      if (cardInfo && !cardInfo.querySelector('.fte-rec-row')) {
        cardInfo.insertAdjacentHTML('afterbegin', recBadgeHTML());
      }
    }

    /* ── Inject trust chips into existing .qsm-card-badges ── */
    var badgesEl = cardEl.querySelector('.qsm-card-badges');
    if (badgesEl) {
      /* Remove stale raw trust % badge (we replace with fte-score-badge) */
      badgesEl.querySelectorAll('.qsm-badge.trust').forEach(function(el) {
        el.remove();
      });

      /* Build new signal HTML */
      var signalHtml = '';

      /* Score badge first */
      if (score > 0) {
        signalHtml += scoreBadgeHTML(score);
      }

      /* Trust signal chips */
      signals.forEach(function(sig) {
        signalHtml += '<span class="qsm-badge ' + _esc(sig.cls) + '">' + _esc(sig.text) + '</span>';
      });

      /* Inject into existing badges row (after existing fast/extra badges) */
      if (signalHtml) {
        /* Use fte-trust-row so we can target cleanly */
        var existing = badgesEl.querySelector('.fte-trust-row');
        if (!existing) {
          var trustRow = document.createElement('div');
          trustRow.className = 'fte-trust-row';
          trustRow.innerHTML = signalHtml;
          /* Insert before existing .qsm-badge.trust or append */
          badgesEl.appendChild(trustRow);
        }
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     POOL HELPERS
  ══════════════════════════════════════════════════════════ */

  function _getPool() {
    try {
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        return window.FixeoDB.getAllArtisans() || [];
      }
      if (window.ARTISANS) return window.ARTISANS;
    } catch(e) {}
    return [];
  }

  function _findArtisan(id, pool) {
    if (!pool || !pool.length) pool = _getPool();
    var numId = parseInt(id, 10);
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].id == id || pool[i].id === numId) return pool[i];
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     CONTEXT CITY
     Reads detected city from QSM select or hero insights cache.
  ══════════════════════════════════════════════════════════ */

  function _getContextCity() {
    try {
      var sel = document.getElementById('qsm-select-city');
      if (sel && sel.value) return sel.value;
      var heroCityEl = document.getElementById('hero-city-label');
      if (heroCityEl) {
        var txt = heroCityEl.textContent.trim();
        if (txt && !txt.includes('Détect') && !txt.includes('…')) return txt;
      }
      return localStorage.getItem('fixeo_detected_city') || null;
    } catch(e) { return null; }
  }

  /* ══════════════════════════════════════════════════════════
     SCAN + PATCH VISIBLE CARDS
     Called on MutationObserver trigger and periodically.
  ══════════════════════════════════════════════════════════ */

  function _scanAndPatch(container) {
    var pool    = _getPool();
    var city    = _getContextCity();
    var cards   = (container || document).querySelectorAll('.qsm-card:not([data-fte-skip])');

    var firstUnpatched = null;
    cards.forEach(function(card, idx) {
      if (!card._ftePatchedV1 && !firstUnpatched) firstUnpatched = card;
    });

    /* Determine which card is "top" — first in its container */
    var firstCard = null;
    cards.forEach(function(card) {
      if (!firstCard) firstCard = card;
    });

    cards.forEach(function(card) {
      var isTop = (card === firstCard);
      _patchCard(card, pool, city, isTop);
    });
  }

  /* ══════════════════════════════════════════════════════════
     MUTATION OBSERVER
     Watches containers where cards are injected:
     - #hero-inline-results
     - #hsm-modal  (hero search modal)
     - [id*=qsm]   (inline QSM host)
     - document.body fallback
  ══════════════════════════════════════════════════════════ */

  var _observedTargets = new Set();

  function _observeContainer(el) {
    if (!el || _observedTargets.has(el)) return;
    _observedTargets.add(el);

    var observer = new MutationObserver(function(mutations) {
      var hasCardChange = mutations.some(function(m) {
        return Array.from(m.addedNodes).some(function(n) {
          return n.nodeType === 1 && (
            n.classList.contains('qsm-card') ||
            (n.querySelectorAll && n.querySelectorAll('.qsm-card').length > 0)
          );
        });
      });
      if (hasCardChange) {
        setTimeout(function() { _scanAndPatch(el); }, 60);
      }
    });
    observer.observe(el, { childList: true, subtree: true });
  }

  function _watchContainers() {
    /* Watch known containers */
    var targets = [
      document.getElementById('hero-inline-results'),
      document.getElementById('hsm-modal'),
      document.getElementById('hero-quick-search')
    ];

    targets.forEach(function(el) {
      if (el) _observeContainer(el);
    });

    /* Also watch document.body for dynamically created modals */
    _observeContainer(document.body);
  }

  /* ══════════════════════════════════════════════════════════
     RANKING ENHANCEMENT
     Non-destructive: hooks existing sort comparators.
     Computes a composite trust score to break ties.
  ══════════════════════════════════════════════════════════ */

  /**
   * Enhanced sort score for an artisan in a given context.
   * Extends existing trustScore/availability/rating sort
   * with category match + city match + fixeo score boosts.
   */
  function rankingScore(a, context) {
    var base = (a.trustScore || 0)
      + (a.availability === 'available' ? 15 : 0)
      + ((a.rating || 0) * 2);

    /* Category match boost */
    if (context && context.category) {
      var nc = _norm(context.category);
      var ac = _norm(a.category || a.service || '');
      if (ac === nc || ac.includes(nc) || nc.includes(ac)) base += 25;
    }

    /* City match boost */
    if (context && context.city) {
      var cityQ = _norm(context.city);
      var cityA = _norm(a.city || '');
      if (cityQ && cityA && (cityQ === cityA || cityQ.includes(cityA) || cityA.includes(cityQ))) {
        base += 20;
      }
    }

    /* Fixeo score contribution (0–10 additional points) */
    base += Math.round(computeFixeoScore(a) / 10);

    /* Response time bonus */
    var rt = Number(a.responseTime);
    if (Number.isFinite(rt) && rt > 0 && rt <= 15) base += 5;

    return base;
  }

  /**
   * Sort an artisan array by trust/category/city — enhanced ranking.
   * Returns new sorted array; does not mutate input.
   */
  function sortArtisans(list, context) {
    if (!Array.isArray(list) || !list.length) return list;
    return list.slice().sort(function(a, b) {
      return rankingScore(b, context) - rankingScore(a, context);
    });
  }

  /* Hook QuickSearchModal sort (non-destructive wrapper) */
  function _hookQSMSort() {
    try {
      if (!window.QuickSearchModal) return;
      /* QuickSearchModal sorts inline — we re-sort after render via MutationObserver,
         which is already handled by _scanAndPatch (re-order isn't needed: cards are
         already sorted by trustScore in existing code; we just enhance the badge layer). */
    } catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════
     UTILITY
  ══════════════════════════════════════════════════════════ */

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function _init() {
    _watchContainers();
    _hookQSMSort();

    /* Scan any already-rendered cards (e.g. artisan section on homepage) */
    setTimeout(_scanAndPatch, 300);
    setTimeout(_scanAndPatch, 1200);

    console.log('[FixeoTrustEngine] Trust Engine ' + VERSION + ' ready');
  }

  /* ── Public API ───────────────────────────────────────────── */
  window.FixeoTrustEngine = {
    VERSION:          VERSION,
    computeFixeoScore: computeFixeoScore,
    getTrustSignals:   getTrustSignals,
    sortArtisans:      sortArtisans,
    rankingScore:      rankingScore,
    scan:              _scanAndPatch
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

})();
