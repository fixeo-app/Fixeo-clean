/**
 * feed-premium.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-render enrichment of feed cards — purely cosmetic/additive:
 * 1. Inject Moroccan city badge + "Artisan vérifié" badge into card header
 * 2. Format time display (2h → "il y a 2h", 1j → "hier", etc.)
 * 3. Stagger fade-in via IntersectionObserver (desktop)
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO feed.js modifications — reads existing DOM only
 */
(function (window, document) {
  'use strict';

  /* ── Moroccan city pool per card id (deterministic mapping) ── */
  var CITIES = {
    1: 'Casablanca', 2: 'Rabat',       3: 'Marrakech',
    4: 'Fès',        5: 'Tanger',      6: 'Agadir',
    7: 'Meknès',     8: 'Oujda',       9: 'Kénitra'
  };

  /* ── Time label humanizer ── */
  function _humanTime(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (/^[0-9]+h$/.test(s)) {
      var h = parseInt(s);
      if (h <= 1) return 'il y a 1h';
      if (h <= 3) return 'il y a ' + h + 'h';
      return 'aujourd\'hui';
    }
    if (s === '1j') return 'hier';
    if (/^[2-9]j$/.test(s)) return 'il y a ' + s.replace('j', ' jours');
    if (/sem/.test(s)) return 'cette semaine';
    return 'récemment';
  }

  /* ── SVG icons ── */
  var PIN_ICON  = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var CHECK_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var CLOCK_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  var _done = false;

  function _enrichCard(card) {
    if (card.dataset.feedEnriched) return;
    card.dataset.feedEnriched = '1';

    /* Get card id */
    var id = parseInt((card.id || '').replace('feed-card-', '')) || 0;
    var city = CITIES[id] || 'Maroc';

    /* Find header */
    var header = card.querySelector('.feed-card-header');
    if (!header) return;

    /* Find time element inside header and upgrade it */
    var metaEl = header.querySelector('div > div:last-child'); /* category · time div */
    if (metaEl) {
      var text = metaEl.textContent || '';
      var timeMatch = text.match(/·\s*(.+)$/);
      var rawTime = timeMatch ? timeMatch[1].trim() : '';
      var humanT = _humanTime(rawTime);
      if (humanT) {
        metaEl.innerHTML = metaEl.innerHTML.replace(
          /·\s*[^<]+$/,
          '· <span class="fc-time">' + CLOCK_ICON + humanT + '</span>'
        );
      }
    }

    /* Inject city + verified badge row after header */
    if (!header.nextElementSibling || !header.nextElementSibling.classList.contains('fc-meta-row')) {
      var metaRow = document.createElement('div');
      metaRow.className = 'fc-meta-row';
      metaRow.innerHTML =
        '<span class="fc-city">' + PIN_ICON + city + '</span>' +
        '<span class="fc-verified">' + CHECK_ICON + 'Artisan vérifié</span>';
      header.insertAdjacentElement('afterend', metaRow);
    }
  }

  function _enrichAll() {
    var container = document.getElementById('feed-container');
    if (!container) return;
    var cards = container.querySelectorAll('.feed-card');
    if (!cards.length) return;
    _done = true;

    Array.from(cards).forEach(_enrichCard);

    /* Stagger fade-in (desktop) */
    if (window.innerWidth > 768 && window.IntersectionObserver) {
      var cardArr = Array.from(cards);
      var observer = new IntersectionObserver(function (entries) {
        var hit = entries.some(function (e) { return e.isIntersecting; });
        if (!hit) return;
        observer.disconnect();
        cardArr.forEach(function (card, i) {
          setTimeout(function () {
            card.classList.add('fc-visible');
          }, i * 55);
        });
      }, { threshold: 0.08 });
      var grid = document.getElementById('feed-container');
      if (grid) observer.observe(grid);
    } else {
      Array.from(cards).forEach(function (c) { c.classList.add('fc-visible'); });
    }
  }

  function boot() {
    _enrichAll();
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (document.querySelector('#feed-container .feed-card')) {
          _enrichAll();
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
