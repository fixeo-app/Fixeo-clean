/**
 * how-it-works-premium.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Replace emoji icons with premium SVG icons (Lucide-style)
 * 2. Inject connector arrows between cards (desktop only)
 * 3. IntersectionObserver stagger fade-in (desktop)
 * 4. Mobile scroll snap dots indicator
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO logic changes — purely cosmetic DOM enrichment
 */
(function (window, document) {
  'use strict';

  /* ── Premium SVG icons per step (Lucide outline, stroke 1.7) ── */
  var STEP_ICONS = [
    /* 1 — Search / describe need (unchanged) */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7.5"/>' +
      '<path d="M21 21l-4.35-4.35"/>' +
      '<path d="M8.5 11h5M11 8.5v5" opacity="0.6"/>' +
    '</svg>',

    /* 2 — Matching / find artisan (location pin + lightning) */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/>' +
      '<circle cx="12" cy="9" r="2.5" opacity="0.6"/>' +
    '</svg>',

    /* 3 — Phone / artisan contacts you */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.1 19.79 19.79 0 0 1 1.6 3.53 2 2 0 0 1 3.56 1.35h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/>' +
    '</svg>',

    /* 4 — Shield check / secure payment after service */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<polyline points="9 12 11 14 15 10" opacity="0.8"/>' +
    '</svg>'
  ];

  /* ── Arrow SVG between cards ── */
  var ARROW_SVG =
    '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="9 18 15 12 9 6"/>' +
    '</svg>';

  var _done = false;

  function _init() {
    if (_done) return;
    var section = document.querySelector('.how-it-works-section');
    if (!section) return;
    var container = section.querySelector('.steps-container');
    var cards = section.querySelectorAll('.step-card');
    if (!cards.length) return;
    _done = true;

    /* 1. Swap emoji icons with SVG */
    cards.forEach(function (card, i) {
      var iconSlot = card.querySelector('.step-icon');
      if (!iconSlot) return;
      iconSlot.innerHTML = STEP_ICONS[i] || STEP_ICONS[0];
    });

    /* 2. Inject connector arrows between cards (desktop — CSS hides on mobile) */
    var cardArray = Array.from(cards);
    cardArray.forEach(function (card, i) {
      if (i === cardArray.length - 1) return; /* no arrow after last */
      var arrow = document.createElement('div');
      arrow.className = 'hiw-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = ARROW_SVG;
      card.parentNode.insertBefore(arrow, card.nextSibling);
    });

    /* 3. Stagger fade-in via IntersectionObserver (desktop only) */
    if (window.innerWidth > 768 && window.IntersectionObserver) {
      var delays = [0, 80, 160, 240]; /* ms per card */
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var card = entry.target;
          var idx = cardArray.indexOf(card);
          var delay = delays[idx] || 0;
          setTimeout(function () {
            card.classList.add('hiw-visible');
          }, delay);
          observer.unobserve(card);
        });
      }, { threshold: 0.15 });

      cardArray.forEach(function (card) {
        observer.observe(card);
      });
    } else {
      /* Mobile or no IO support: always visible */
      cardArray.forEach(function (card) {
        card.classList.add('hiw-visible');
      });
    }

    /* 4. Mobile scroll dots */
    _buildDots(section, container, cardArray);

    /* 5. Keep step-number positions compact (ensure single digit) */
    cardArray.forEach(function (card, i) {
      var num = card.querySelector('.step-number');
      if (num) num.textContent = i + 1;
    });
  }

  /* ── Mobile scroll dots ── */
  function _buildDots(section, container, cards) {
    if (!container) return;
    var wrap = document.createElement('div');
    wrap.className = 'hiw-dots';
    wrap.setAttribute('aria-hidden', 'true');
    cards.forEach(function (_, i) {
      var dot = document.createElement('div');
      dot.className = 'hiw-dot' + (i === 0 ? ' active' : '');
      wrap.appendChild(dot);
    });
    container.parentNode.insertBefore(wrap, container.nextSibling);

    /* Update active dot on scroll */
    var dots = wrap.querySelectorAll('.hiw-dot');
    container.addEventListener('scroll', function () {
      var scrollLeft = container.scrollLeft;
      var containerW = container.offsetWidth;
      var activeIdx = 0;
      var closest = Infinity;
      cards.forEach(function (card, i) {
        var cardCenter = card.offsetLeft + card.offsetWidth / 2;
        var viewCenter = scrollLeft + containerW / 2;
        var dist = Math.abs(cardCenter - viewCenter);
        if (dist < closest) { closest = dist; activeIdx = i; }
      });
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === activeIdx);
      });
    }, { passive: true });
  }

  /* ── Bootstrap ── */
  function boot() {
    _init();
    /* Watch for late render */
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (document.querySelector('.how-it-works-section .step-card')) {
          _init();
          if (_done) obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
