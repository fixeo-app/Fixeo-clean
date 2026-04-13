/**
 * services-premium.js  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. City select: toggle .has-value class on selection
 * 2. Desktop: IntersectionObserver stagger fade-in for chips
 * 3. Mobile: wrap category-chips in .svc-chips-wrap for fade-out gradient
 * 4. Mobile: scroll-end detection → .at-end to hide gradient
 * 5. Mobile: one-shot scroll hint animation on first chip
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO logic changes — purely cosmetic
 */
(function (window, document) {
  'use strict';

  var MOBILE_BP = 768;
  var _done = false;

  function _isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  function _init() {
    if (_done) return;
    var section = document.getElementById('services');
    if (!section) return;
    var chips = section.querySelectorAll('.chip[data-category]');
    if (!chips.length) return;
    _done = true;

    /* 1. City select has-value */
    var citySelect = document.getElementById('services-city-filter');
    if (citySelect) {
      function _syncCity() {
        citySelect.classList.toggle('has-value', !!citySelect.value);
      }
      citySelect.addEventListener('change', _syncCity);
      _syncCity();
    }

    if (_isMobile()) {
      _initMobile(section, chips);
    } else {
      _initDesktop(section, chips);
    }
  }

  /* ── Desktop: stagger IO fade-in ── */
  function _initDesktop(section, chips) {
    if (!window.IntersectionObserver) {
      Array.from(chips).forEach(function (c) { c.classList.add('svc-visible'); });
      return;
    }
    var chipArr = Array.from(chips);
    var obs = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      obs.disconnect();
      chipArr.forEach(function (chip, i) {
        setTimeout(function () { chip.classList.add('svc-visible'); }, i * 28);
      });
    }, { threshold: 0.1 });
    var container = section.querySelector('.category-chips');
    if (container) obs.observe(container);
  }

  /* ── Mobile: wrap + fade gradient + scroll hint ── */
  function _initMobile(section, chips) {
    /* Always visible immediately on mobile */
    Array.from(chips).forEach(function (c) { c.classList.add('svc-visible'); });

    var chipsContainer = section.querySelector('.category-chips');
    if (!chipsContainer) return;

    /* --- Wrap chips in .svc-chips-wrap for ::after pseudo --- */
    var parent = chipsContainer.parentNode;
    if (parent && !parent.classList.contains('svc-chips-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'svc-chips-wrap';
      parent.insertBefore(wrap, chipsContainer);
      wrap.appendChild(chipsContainer);
    }

    var wrap2 = chipsContainer.parentNode; /* may be same wrap */

    /* --- Scroll-end detection: hide gradient when at end --- */
    function _checkEnd() {
      var atEnd = chipsContainer.scrollLeft + chipsContainer.clientWidth
                  >= chipsContainer.scrollWidth - 16;
      wrap2.classList.toggle('at-end', atEnd);
    }
    chipsContainer.addEventListener('scroll', _checkEnd, { passive: true });
    /* Initial check (may already be at end if few chips) */
    setTimeout(_checkEnd, 200);

    /* --- One-shot hint animation on first chip --- */
    var firstChip = chips[0];
    if (firstChip && !sessionStorage.getItem('svc_hint_shown')) {
      sessionStorage.setItem('svc_hint_shown', '1');
      setTimeout(function () {
        firstChip.classList.add('svc-hint-anim');
        firstChip.addEventListener('animationend', function () {
          firstChip.classList.remove('svc-hint-anim');
        }, { once: true });
      }, 800);
    }
  }

  /* ── Boot ── */
  function boot() {
    _init();
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (document.querySelector('#services .chip[data-category]')) {
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
