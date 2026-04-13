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
    /* 1 — Search / describe need */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7.5"/>' +
      '<path d="M21 21l-4.35-4.35"/>' +
      '<path d="M8.5 11h5M11 8.5v5" opacity="0.6"/>' +
    '</svg>',

    /* 2 — Document / receive quotes */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="8" y1="13" x2="16" y2="13" opacity="0.6"/>' +
      '<line x1="8" y1="17" x2="13" y2="17" opacity="0.6"/>' +
    '</svg>',

    /* 3 — Shield check / choose & pay */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<polyline points="9 12 11 14 15 10"/>' +
    '</svg>',

    /* 4 — Star / review */
    '<svg viewBox="0 0 24 24" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
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
