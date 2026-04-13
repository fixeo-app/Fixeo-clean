/**
 * services-premium.js  v6 — PORTAL DROPDOWN
 * ─────────────────────────────────────────────────────────────────────────────
 * FIXES:
 * 1. Dropdown appended to document.body (portal pattern) — escapes ALL
 *    overflow:hidden ancestors. No more section scroll when dropdown opens.
 * 2. Position:fixed, recalculated from pill.getBoundingClientRect() on open.
 * 3. Reposition on window scroll/resize (or close).
 * 4. Works identically on desktop and mobile/touch.
 * 5. City picker: hides native <select>, custom pill + dropdown.
 * 6. Desktop: IntersectionObserver stagger fade-in for chips.
 * 7. Mobile: wrap category-chips in .svc-chips-wrap for fade gradient.
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO logic changes — no modifications to filtering or reservation.
 */
(function (window, document) {
  'use strict';

  var MOBILE_BP = 768;
  var _done = false;

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
     PORTAL DROPDOWN — appended to body, position:fixed
  ══════════════════════════════════════════════════ */
  function _buildCityPicker(citySelect) {
    if (document.querySelector('.svc-city-wrap')) return;

    var currentValue = citySelect.value || '';
    var currentLabel = (CITIES.find(function(c){ return c.value === currentValue; }) || CITIES[0]).label;

    /* Wrapper inside filter bar (just holds the pill) */
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

    /* ── DROPDOWN: appended to document.body (portal pattern) ── */
    var dropdown = document.createElement('div');
    dropdown.className = 'svc-city-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Choisir une ville');

    CITIES.forEach(function(city) {
      var opt = document.createElement('div');
      opt.className = 'svc-city-option' + (city.value === currentValue ? ' selected' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-value', city.value);
      opt.setAttribute('aria-selected', city.value === currentValue ? 'true' : 'false');
      opt.textContent = city.label;
      dropdown.appendChild(opt);
    });

    /* Append dropdown to BODY — escapes all overflow:hidden ancestors */
    document.body.appendChild(dropdown);

    /* ── Open / Close / Position ── */
    function _getDropdownPos() {
      var rect = pill.getBoundingClientRect();
      var viewW = window.innerWidth;
      var MARGIN = 8;

      var left = rect.left;
      var top  = rect.bottom + 6;
      var dropW = 192;

      // Prevent right-side clip
      if (left + dropW > viewW - MARGIN) {
        left = viewW - dropW - MARGIN;
      }
      // Prevent left-side clip
      if (left < MARGIN) left = MARGIN;

      // Prevent bottom clip — show above if needed
      var dropMaxH = 280;
      if (top + dropMaxH > window.innerHeight - MARGIN) {
        top = rect.top - dropMaxH - 6;
        if (top < MARGIN) top = MARGIN;
      }

      return { top: top, left: left };
    }

    function _reposition() {
      if (!dropdown.classList.contains('svc-open')) return;
      var pos = _getDropdownPos();
      dropdown.style.top  = pos.top  + 'px';
      dropdown.style.left = pos.left + 'px';
    }

    function _open() {
      pill.classList.add('open');
      pill.setAttribute('aria-expanded', 'true');
      dropdown.classList.add('svc-open');

      var pos = _getDropdownPos();
      dropdown.style.position = 'fixed';
      dropdown.style.top      = pos.top  + 'px';
      dropdown.style.left     = pos.left + 'px';
      dropdown.style.width    = '192px';
      dropdown.style.zIndex   = '99999';
    }

    function _close() {
      pill.classList.remove('open');
      pill.setAttribute('aria-expanded', 'false');
      dropdown.classList.remove('svc-open');
    }

    function _toggle(e) {
      e.stopPropagation();
      if (dropdown.classList.contains('svc-open')) { _close(); } else { _open(); }
    }

    /* Events */
    pill.addEventListener('click',       _toggle);
    pill.addEventListener('touchend', function(e) {
      e.preventDefault();
      _toggle(e);
    });

    /* Select option */
    dropdown.addEventListener('click', function(e) {
      var opt = e.target.closest('.svc-city-option');
      if (!opt) return;
      var val = opt.getAttribute('data-value');

      /* Update city select */
      citySelect.value = val;
      citySelect.dispatchEvent(new Event('change', { bubbles: true }));

      /* Update pill label */
      var newLabel = (CITIES.find(function(c){ return c.value === val; }) || CITIES[0]).label;
      pillLabel.textContent = newLabel;
      pill.classList.toggle('has-value', !!val);

      /* Update selected option */
      dropdown.querySelectorAll('.svc-city-option').forEach(function(o) {
        var sel = o.getAttribute('data-value') === val;
        o.classList.toggle('selected', sel);
        o.setAttribute('aria-selected', sel ? 'true' : 'false');
      });

      /* Update label elements if present */
      var labelEl  = document.getElementById('services-city-label');
      var nameEl   = document.getElementById('services-city-name');
      if (labelEl) labelEl.style.display = val ? 'inline' : 'none';
      if (nameEl)  nameEl.textContent = val || '';

      _close();
    });

    /* Close on outside click / tap */
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target) && !dropdown.contains(e.target)) _close();
    });
    document.addEventListener('touchend', function(e) {
      if (!wrap.contains(e.target) && !dropdown.contains(e.target)) _close();
    });

    /* Close + reposition on scroll/resize */
    window.addEventListener('scroll', _close, { passive: true });
    window.addEventListener('resize', function() {
      _close();
    }, { passive: true });

    /* Escape key */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') _close();
    });

    /* Insert pill wrap into filter bar */
    wrap.appendChild(pill);
    var filterBar = citySelect.closest('.services-filter-bar, .services-filter');
    if (filterBar) {
      filterBar.insertBefore(wrap, filterBar.firstChild);
    }
  }

  /* ══════════════════════════════════════════════════
     DESKTOP: stagger IO fade-in
  ══════════════════════════════════════════════════ */
  function _initDesktop(section, chips) {
    if (!window.IntersectionObserver) {
      Array.from(chips).forEach(function(c){ c.classList.add('svc-visible'); });
      return;
    }
    var chipArr  = Array.from(chips);
    var container = section.querySelector('.category-chips');
    if (!container) return;
    var obs = new IntersectionObserver(function(entries) {
      if (!entries.some(function(e){ return e.isIntersecting; })) return;
      obs.disconnect();
      chipArr.forEach(function(chip, i) {
        setTimeout(function(){ chip.classList.add('svc-visible'); }, i * 22);
      });
    }, { threshold: 0.1 });
    obs.observe(container);
  }

  /* ══════════════════════════════════════════════════
     MOBILE: scroll wrap + fade gradient + hint
  ══════════════════════════════════════════════════ */
  function _initMobile(section, chips) {
    Array.from(chips).forEach(function(c){ c.classList.add('svc-visible'); });

    var chipsContainer = section.querySelector('.category-chips');
    if (!chipsContainer) return;

    /* Wrap chips in .svc-chips-wrap for ::after gradient */
    var parent = chipsContainer.parentNode;
    if (parent && !parent.classList.contains('svc-chips-wrap')) {
      var wrap2 = document.createElement('div');
      wrap2.className = 'svc-chips-wrap';
      parent.insertBefore(wrap2, chipsContainer);
      wrap2.appendChild(chipsContainer);
    }
    var wrapEl = chipsContainer.parentNode;

    /* Scroll-end detection */
    function _checkEnd() {
      var atEnd = chipsContainer.scrollLeft + chipsContainer.clientWidth
                  >= chipsContainer.scrollWidth - 18;
      wrapEl.classList.toggle('at-end', atEnd);
    }
    chipsContainer.addEventListener('scroll', _checkEnd, { passive: true });
    setTimeout(_checkEnd, 250);

    /* One-shot hint */
    var firstChip = chips[0];
    if (firstChip && !sessionStorage.getItem('svc_hint_v6')) {
      sessionStorage.setItem('svc_hint_v6', '1');
      setTimeout(function() {
        firstChip.classList.add('svc-hint-anim');
        firstChip.addEventListener('animationend', function() {
          firstChip.classList.remove('svc-hint-anim');
        }, { once: true });
      }, 800);
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

    if (citySelect) _buildCityPicker(citySelect);

    if (_isMobile()) {
      _initMobile(section, chips);
    } else {
      _initDesktop(section, chips);
    }
  }

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
