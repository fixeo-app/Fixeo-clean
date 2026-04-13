/**
 * services-premium.js  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Custom city picker: hides native <select>, injects .svc-city-wrap
 *    containing .svc-city-pill trigger + .svc-city-dropdown panel
 *    → selection fires change event on original <select> (zero logic change)
 * 2. Desktop: IntersectionObserver stagger fade-in for chips (28ms/chip)
 * 3. Mobile: wrap category-chips in .svc-chips-wrap for ::after fade gradient
 * 4. Mobile: scroll-end detection → .at-end (hides gradient)
 * 5. Mobile: one-shot scroll hint animation on first chip (sessionStorage)
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO logic changes — no modifications to filtering, routing, or reservation
 */
(function (window, document) {
  'use strict';

  var MOBILE_BP = 768;
  var _done = false;

  /* Cities list — mirrors <select> options (value + label) */
  var CITIES = [
    { value: '',           label: '📍 Toutes les villes' },
    { value: 'Casablanca', label: 'Casablanca' },
    { value: 'Rabat',      label: 'Rabat' },
    { value: 'Marrakech',  label: 'Marrakech' },
    { value: 'Fès',        label: 'Fès' },
    { value: 'Agadir',     label: 'Agadir' },
    { value: 'Tanger',     label: 'Tanger' },
    { value: 'Meknès',     label: 'Meknès' },
    { value: 'Oujda',      label: 'Oujda' },
    { value: 'Kénitra',    label: 'Kénitra' },
    { value: 'Tétouan',    label: 'Tétouan' },
    { value: 'Safi',       label: 'Safi' },
    { value: 'El Jadida',  label: 'El Jadida' }
  ];

  /* SVG helpers */
  var PIN_SVG =
    '<svg class="svc-city-pin" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="10" r="3" stroke-width="2"/>' +
    '</svg>';
  var CHEV_SVG =
    '<svg class="svc-city-chevron" viewBox="0 0 10 6" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 1l4 4 4-4" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
    '</svg>';

  function _isMobile() { return window.innerWidth <= MOBILE_BP; }

  /* ══════════════════════════════════════════════════
     BUILD CUSTOM CITY PICKER
  ══════════════════════════════════════════════════ */
  function _buildCityPicker(citySelect) {
    if (document.querySelector('.svc-city-wrap')) return; /* already built */

    var currentValue = citySelect.value || '';
    var currentLabel = (CITIES.find(function(c){ return c.value === currentValue; }) || CITIES[0]).label;

    /* Wrapper (provides relative positioning for dropdown) */
    var wrap = document.createElement('div');
    wrap.className = 'svc-city-wrap';

    /* Pill trigger */
    var pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'svc-city-pill' + (currentValue ? ' has-value' : '');
    pill.setAttribute('aria-haspopup', 'listbox');
    pill.setAttribute('aria-expanded', 'false');
    pill.setAttribute('aria-label', 'Filtrer par ville');

    var pillLabel = document.createElement('span');
    pillLabel.className = 'svc-city-label-text';
    pillLabel.textContent = currentLabel;
    pill.innerHTML = PIN_SVG;
    pill.appendChild(pillLabel);
    pill.insertAdjacentHTML('beforeend', CHEV_SVG);

    /* Dropdown */
    var dropdown = document.createElement('div');
    dropdown.className = 'svc-city-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Choisir une ville');

    CITIES.forEach(function(city) {
      var opt = document.createElement('div');
      opt.className = 'svc-city-option' + (city.value === currentValue ? ' selected' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', city.value === currentValue ? 'true' : 'false');
      opt.dataset.value = city.value;
      opt.textContent = city.label;
      dropdown.appendChild(opt);
    });

    wrap.appendChild(pill);
    wrap.appendChild(dropdown);

    /* Insert wrap before the native select in the DOM */
    citySelect.parentNode.insertBefore(wrap, citySelect);

    /* ── Open / close ── */
    function _open() {
      pill.classList.add('open');
      pill.setAttribute('aria-expanded', 'true');
      dropdown.classList.add('visible');
      // On mobile, position:fixed needs explicit top/left
      if (window.innerWidth <= 768) {
        var rect = pill.getBoundingClientRect();
        dropdown.style.cssText = (
          'display:block;' +
          'position:fixed;' +
          'top:' + (rect.bottom + 8) + 'px;' +
          'left:' + Math.max(8, rect.left) + 'px;' +
          'z-index:9999;'
        );
      } else {
        dropdown.style.cssText = '';
      }
    }
    function _close() {
      pill.classList.remove('open');
      pill.setAttribute('aria-expanded', 'false');
      dropdown.classList.remove('visible');
      dropdown.style.cssText = '';
    }
    function _toggle() {
      if (dropdown.classList.contains('visible')) { _close(); } else { _open(); }
    }

    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      _toggle();
    });

    /* Click outside → close */
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) _close();
    });

    /* Escape → close */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') _close();
    });

    /* ── Select option ── */
    dropdown.addEventListener('click', function(e) {
      var opt = e.target.closest('.svc-city-option');
      if (!opt) return;

      var val = opt.dataset.value;

      /* Update UI */
      dropdown.querySelectorAll('.svc-city-option').forEach(function(o) {
        o.classList.toggle('selected', o.dataset.value === val);
        o.setAttribute('aria-selected', o.dataset.value === val ? 'true' : 'false');
      });

      var displayLabel = val
        ? val /* just city name when selected */
        : '📍 Toutes les villes';
      pillLabel.textContent = displayLabel;
      pill.classList.toggle('has-value', !!val);

      /* Sync native <select> + fire change → existing filter logic picks it up */
      citySelect.value = val;
      var evt = new Event('change', { bubbles: true });
      citySelect.dispatchEvent(evt);

      _close();
    });
  }

  /* ══════════════════════════════════════════════════
     DESKTOP: stagger IO fade-in
  ══════════════════════════════════════════════════ */
  function _initDesktop(section, chips) {
    if (!window.IntersectionObserver) {
      Array.from(chips).forEach(function(c){ c.classList.add('svc-visible'); });
      return;
    }
    var chipArr = Array.from(chips);
    var container = section.querySelector('.category-chips');
    if (!container) return;
    var obs = new IntersectionObserver(function(entries) {
      if (!entries.some(function(e){ return e.isIntersecting; })) return;
      obs.disconnect();
      chipArr.forEach(function(chip, i) {
        setTimeout(function(){ chip.classList.add('svc-visible'); }, i * 28);
      });
    }, { threshold: 0.1 });
    obs.observe(container);
  }

  /* ══════════════════════════════════════════════════
     MOBILE: scroll wrap + fade + hint
  ══════════════════════════════════════════════════ */
  function _initMobile(section, chips) {
    /* All visible immediately */
    Array.from(chips).forEach(function(c){ c.classList.add('svc-visible'); });

    var chipsContainer = section.querySelector('.category-chips');
    if (!chipsContainer) return;

    /* Wrap chips in .svc-chips-wrap (for ::after pseudo gradient) */
    var parent = chipsContainer.parentNode;
    if (parent && !parent.classList.contains('svc-chips-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'svc-chips-wrap';
      parent.insertBefore(wrap, chipsContainer);
      wrap.appendChild(chipsContainer);
    }
    var wrap2 = chipsContainer.parentNode;

    /* Scroll-end detection */
    function _checkEnd() {
      var atEnd = chipsContainer.scrollLeft + chipsContainer.clientWidth
                  >= chipsContainer.scrollWidth - 18;
      wrap2.classList.toggle('at-end', atEnd);
    }
    chipsContainer.addEventListener('scroll', _checkEnd, { passive: true });
    setTimeout(_checkEnd, 250);

    /* One-shot hint on first chip */
    var firstChip = chips[0];
    if (firstChip && !sessionStorage.getItem('svc_hint_v3')) {
      sessionStorage.setItem('svc_hint_v3', '1');
      setTimeout(function() {
        firstChip.classList.add('svc-hint-anim');
        firstChip.addEventListener('animationend', function() {
          firstChip.classList.remove('svc-hint-anim');
        }, { once: true });
      }, 700);
    }
  }

  /* ══════════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════════ */
  function _init() {
    if (_done) return;

    var section = document.getElementById('services');
    if (!section) return;

    var chips = section.querySelectorAll('.chip[data-category]');
    if (!chips.length) return;

    var citySelect = document.getElementById('services-city-filter');

    _done = true;

    /* 1. Custom city picker */
    if (citySelect) {
      _buildCityPicker(citySelect);
    }

    /* 2. Desktop stagger / mobile scroll */
    if (_isMobile()) {
      _initMobile(section, chips);
    } else {
      _initDesktop(section, chips);
    }
  }

  /* Boot with MutationObserver fallback */
  function boot() {
    _init();
    if (!_done && window.MutationObserver) {
      var obs = new MutationObserver(function() {
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
