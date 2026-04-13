/**
 * feed-premium-v2.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Full post-render enrichment of the feed section — ZERO feed.js changes:
 *
 * 1. Carousel: wrap #feed-container in .feed-carousel-wrap, inject nav arrows
 * 2. Enrich cards: Moroccan city/quartier, artisan names, price badge, CTAs
 * 3. Dots indicator: live tracking via scroll
 * 4. Desktop nav arrows: prev/next scroll
 * 5. Stagger fade-in via IntersectionObserver
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window, document) {
  'use strict';

  /* ── Enrichment data — per card id ── */
  var CARD_DATA = {
    1: { city: 'Casablanca', quarter: 'Maarif',     price: 'Dès 150 MAD',       artisan: 'Karim L.',  urgent: false },
    2: { city: 'Rabat',      quarter: 'Agdal',      price: '900 — 1 500 MAD',   artisan: 'Sara D.',   urgent: false },
    3: { city: 'Fès',        quarter: 'Centre-ville',price: 'Dès 120 MAD',      artisan: 'Omar H.',   urgent: true  },
    4: { city: 'Marrakech',  quarter: 'Guéliz',     price: 'Dès 350 MAD',       artisan: 'Fatima Z.', urgent: false },
    5: { city: 'Tanger',     quarter: 'Malabata',   price: 'Dès 600 MAD',       artisan: 'Hassan M.', urgent: false },
    6: { city: 'Agadir',     quarter: 'Centre-ville',price: 'Dès 400 MAD',      artisan: 'Aicha L.',  urgent: false },
    7: { city: 'Meknès',     quarter: 'Hamria',     price: 'Dès 300 MAD',       artisan: 'Youssef T.',urgent: false },
    8: { city: 'Casablanca', quarter: 'Hay Riad',   price: 'Dès 800 MAD',       artisan: 'Imad E.',   urgent: false },
    9: { city: 'Marrakech',  quarter: 'Route Imouzzer', price: 'Dès 450 MAD',   artisan: 'Samir B.',  urgent: false }
  };

  /* ── Time humanizer ── */
  function _humanTime(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (/^1h$/.test(s)) return 'il y a 1h';
    if (/^[2-4]h$/.test(s)) return 'il y a ' + s;
    if (/^[5-9]h$/.test(s)) return 'aujourd\'hui';
    if (s === '1j') return 'hier';
    if (/^[2-4]j$/.test(s)) return 'il y a ' + s.replace('j',' jours');
    if (/^[5-9]j$/.test(s)) return 'cette semaine';
    if (/sem/.test(s)) return 'cette semaine';
    return 'récemment';
  }

  /* ── SVG icons ── */
  var PIN  = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var CHK  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var CLK  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  var TAG  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
  var PREV_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var NEXT_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  var _done = false;

  /* ══════════════════════════════════════════════════
     ENRICH A SINGLE CARD
  ══════════════════════════════════════════════════ */
  function _enrichCard(card) {
    if (card.dataset.v2Enriched) return;
    card.dataset.v2Enriched = '1';

    var id = parseInt((card.id || '').replace('feed-card-', '')) || 0;
    var d = CARD_DATA[id] || { city: 'Maroc', quarter: '', price: 'Dès 150 MAD', artisan: 'Artisan', urgent: false };

    /* ── 1. Header: upgrade artisan name + add time ── */
    var header = card.querySelector('.feed-card-header');
    if (header) {
      /* Update artisan name with Moroccan version */
      var nameEl = header.querySelector('div > div:first-child'); /* first inner div */
      if (nameEl && nameEl.style && !nameEl.dataset.v2Name) {
        nameEl.textContent = d.artisan;
        nameEl.dataset.v2Name = '1';
      }
      /* Get time from category·time text */
      var metaEl = header.querySelector('div > div:last-child');
      var rawTime = '';
      if (metaEl) {
        var m = (metaEl.textContent || '').match(/·\s*(.+)$/);
        if (m) rawTime = m[1].trim();
      }
    }

    /* ── 2. Meta row (city + verified + time) ── */
    if (!card.querySelector('.fc-meta-row')) {
      var metaRow = document.createElement('div');
      metaRow.className = 'fc-meta-row';
      var cityText = d.quarter ? d.city + ' — ' + d.quarter : d.city;
      var timeHuman = _humanTime(rawTime);
      metaRow.innerHTML =
        '<span class="fc-city">' + PIN + cityText + '</span>' +
        '<span class="fc-verified">' + CHK + 'Artisan vérifié</span>' +
        (timeHuman ? '<span class="fc-time">' + CLK + timeHuman + '</span>' : '') +
        (d.urgent ? '<span style="margin-left:auto;background:rgba(252,175,69,0.15);border:1px solid rgba(252,175,69,0.30);border-radius:9999px;padding:2px 7px;font-size:0.62rem;font-weight:800;color:rgba(252,175,69,0.9)">🔥 URGENT</span>' : '');
      if (header) header.insertAdjacentElement('afterend', metaRow);
    }

    /* ── 3. Price badge + CTAs ── */
    var content = card.querySelector('.realisation-content');
    if (content && !content.querySelector('.fc-price-badge')) {
      /* Remove old btn-view (CSS also hides it, JS removes it for cleanliness) */
      var oldBtn = content.querySelector('.btn-view, .feed-action-btn-link');
      /* Insert price badge before old btn or at end */
      var priceBadge = document.createElement('div');
      priceBadge.className = 'fc-price-badge';
      priceBadge.innerHTML = TAG + d.price;

      /* CTA row */
      var ctaRow = document.createElement('div');
      ctaRow.className = 'fc-cta-row';
      ctaRow.innerHTML =
        '<a href="#feed-card-' + id + '" class="fc-cta-primary" onclick="window.feedManager?.openProject(' + id + ');return false;">Voir transformation →</a>' +
        '<a href="artisans.html" class="fc-cta-secondary">Voir artisan</a>';

      if (oldBtn) {
        content.insertBefore(priceBadge, oldBtn);
        content.insertBefore(ctaRow, oldBtn);
      } else {
        content.appendChild(priceBadge);
        content.appendChild(ctaRow);
      }
    }
  }

  /* ══════════════════════════════════════════════════
     CAROUSEL SETUP
  ══════════════════════════════════════════════════ */
  function _buildCarousel(container, cards) {
    var parent = container.parentNode;
    if (!parent || parent.classList.contains('feed-carousel-wrap')) return;

    /* 1. Wrap */
    var wrap = document.createElement('div');
    wrap.className = 'feed-carousel-wrap';
    parent.insertBefore(wrap, container);
    wrap.appendChild(container);

    /* 2. Nav arrows */
    var prevBtn = document.createElement('button');
    prevBtn.className = 'feed-nav-btn feed-nav-prev';
    prevBtn.setAttribute('aria-label', 'Précédent');
    prevBtn.innerHTML = PREV_ICON;
    var nextBtn = document.createElement('button');
    nextBtn.className = 'feed-nav-btn feed-nav-next';
    nextBtn.setAttribute('aria-label', 'Suivant');
    nextBtn.innerHTML = NEXT_ICON;
    wrap.appendChild(prevBtn);
    wrap.appendChild(nextBtn);

    /* 3. Dots */
    var dots = document.createElement('div');
    dots.className = 'feed-carousel-dots';
    Array.from(cards).forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.className = 'feed-carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Carte ' + (i + 1));
      dot.dataset.idx = i;
      dots.appendChild(dot);
    });
    wrap.insertAdjacentElement('afterend', dots);

    /* 4. Scroll helpers */
    var cardArr = Array.from(cards);
    function _getCardWidth() {
      var c = cardArr[0];
      return c ? c.offsetWidth + 16 : 376; /* card + gap */
    }
    function _scrollTo(idx) {
      var targetCard = cardArr[Math.max(0, Math.min(idx, cardArr.length - 1))];
      if (targetCard) {
        container.scrollTo({ left: targetCard.offsetLeft - 24, behavior: 'smooth' });
      }
    }
    function _getActiveIdx() {
      var center = container.scrollLeft + container.clientWidth / 2;
      var closest = 0;
      var minDist = Infinity;
      cardArr.forEach(function (c, i) {
        var dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      return closest;
    }
    function _updateDots(idx) {
      var dotEls = dots.querySelectorAll('.feed-carousel-dot');
      dotEls.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
    }
    function _updateNav() {
      var atStart = container.scrollLeft <= 10;
      var atEnd   = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
      prevBtn.classList.toggle('is-disabled', atStart);
      nextBtn.classList.toggle('is-disabled', atEnd);
    }

    container.addEventListener('scroll', function () {
      _updateDots(_getActiveIdx());
      _updateNav();
    }, { passive: true });

    prevBtn.addEventListener('click', function () {
      var idx = Math.max(0, _getActiveIdx() - 1);
      _scrollTo(idx);
    });
    nextBtn.addEventListener('click', function () {
      var idx = Math.min(cardArr.length - 1, _getActiveIdx() + 1);
      _scrollTo(idx);
    });
    dots.addEventListener('click', function (e) {
      var dot = e.target.closest('.feed-carousel-dot');
      if (!dot) return;
      _scrollTo(parseInt(dot.dataset.idx));
    });

    _updateNav();
    _updateDots(0);
  }

  /* ══════════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════════ */
  function _init() {
    if (_done) return;
    var container = document.getElementById('feed-container');
    if (!container) return;
    var cards = container.querySelectorAll('.feed-card');
    if (!cards.length) return;
    _done = true;

    /* Enrich all cards */
    Array.from(cards).forEach(_enrichCard);

    /* Build carousel */
    _buildCarousel(container, cards);

    /* Stagger fade-in */
    var cardArr = Array.from(cards);
    if (window.IntersectionObserver) {
      var obs = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        obs.disconnect();
        cardArr.forEach(function (card, i) {
          setTimeout(function () { card.classList.add('fc-visible'); }, i * 60);
        });
      }, { threshold: 0.05 });
      obs.observe(container);
    } else {
      cardArr.forEach(function (c) { c.classList.add('fc-visible'); });
    }
  }

  function boot() {
    _init();
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (document.querySelector('#feed-container .feed-card')) {
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
