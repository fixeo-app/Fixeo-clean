/**
 * services-premium.js  v7 — SINGLE SOURCE OF TRUTH
 * ─────────────────────────────────────────────────────────────────────────────
 * LAYOUT: flex-wrap:wrap + justify-content:center on ALL viewports.
 * All chips visible without scrolling. No horizontal truncation.
 * Same order, same count, same chips — desktop and mobile identical.
 *
 * CITY PICKER: portal dropdown appended to document.body.
 * Position:fixed escapes all overflow:hidden ancestors.
 *
 * ZERO logic changes — no filtering or reservation modifications.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window, document) {
  'use strict';

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

  /* ══════════════════════════════════════════════════
     PORTAL DROPDOWN — appended to body, position:fixed
  ══════════════════════════════════════════════════ */
  function _buildCityPicker(citySelect) {
    if (document.querySelector('.svc-city-wrap')) return;

    var currentValue = citySelect.value || '';
    var currentLabel = (CITIES.find(function(c){ return c.value === currentValue; }) || CITIES[0]).label;

    var wrap = document.createElement('div');
    wrap.className = 'svc-city-wrap';

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

    /* Dropdown appended to body — escapes all overflow:hidden ancestors */
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

    document.body.appendChild(dropdown);

    function _getPos() {
      var rect = pill.getBoundingClientRect();
      var vw = window.innerWidth;
      var MARGIN = 8;
      var left = rect.left;
      var top  = rect.bottom + 6;
      var dropW = 192;
      if (left + dropW > vw - MARGIN) left = vw - dropW - MARGIN;
      if (left < MARGIN) left = MARGIN;
      var dropMaxH = 280;
      if (top + dropMaxH > window.innerHeight - MARGIN) {
        top = rect.top - dropMaxH - 6;
        if (top < MARGIN) top = MARGIN;
      }
      return { top: top, left: left };
    }

    function _open() {
      pill.classList.add('open');
      pill.setAttribute('aria-expanded', 'true');
      dropdown.classList.add('svc-open');
      var pos = _getPos();
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

    pill.addEventListener('click', _toggle);
    pill.addEventListener('touchend', function(e) { e.preventDefault(); _toggle(e); });

    dropdown.addEventListener('click', function(e) {
      var opt = e.target.closest('.svc-city-option');
      if (!opt) return;
      var val = opt.getAttribute('data-value');
      citySelect.value = val;
      citySelect.dispatchEvent(new Event('change', { bubbles: true }));
      var newLabel = (CITIES.find(function(c){ return c.value === val; }) || CITIES[0]).label;
      pillLabel.textContent = newLabel;
      pill.classList.toggle('has-value', !!val);
      dropdown.querySelectorAll('.svc-city-option').forEach(function(o) {
        var sel = o.getAttribute('data-value') === val;
        o.classList.toggle('selected', sel);
        o.setAttribute('aria-selected', sel ? 'true' : 'false');
      });
      var labelEl = document.getElementById('services-city-label');
      var nameEl  = document.getElementById('services-city-name');
      if (labelEl) labelEl.style.display = val ? 'inline' : 'none';
      if (nameEl)  nameEl.textContent = val || '';
      _close();
    });

    document.addEventListener('click',    function(e){ if (!wrap.contains(e.target) && !dropdown.contains(e.target)) _close(); });
    document.addEventListener('touchend', function(e){ if (!wrap.contains(e.target) && !dropdown.contains(e.target)) _close(); });
    window.addEventListener('scroll', _close, { passive: true });
    window.addEventListener('resize', _close, { passive: true });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') _close(); });

    wrap.appendChild(pill);
    var filterBar = citySelect.closest('.services-filter-bar, .services-filter');
    if (filterBar) filterBar.insertBefore(wrap, filterBar.firstChild);
  }

  /* ══════════════════════════════════════════════════
     CHIP STAGGER FADE-IN (desktop + mobile, same logic)
  ══════════════════════════════════════════════════ */
  function _initChipsFadeIn(section) {
    var chips = Array.from(section.querySelectorAll('.chip[data-category]'));
    if (!chips.length) return;

    if (!window.IntersectionObserver) {
      chips.forEach(function(c){ c.classList.add('svc-visible'); });
      return;
    }

    var container = section.querySelector('.category-chips');
    if (!container) { chips.forEach(function(c){ c.classList.add('svc-visible'); }); return; }

    var obs = new IntersectionObserver(function(entries) {
      if (!entries.some(function(e){ return e.isIntersecting; })) return;
      obs.disconnect();
      chips.forEach(function(chip, i) {
        setTimeout(function(){ chip.classList.add('svc-visible'); }, i * 18);
      });
    }, { threshold: 0.05 });
    obs.observe(container);
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

    _done = true;

    var citySelect = document.getElementById('services-city-filter');
    if (citySelect) _buildCityPicker(citySelect);

    _initChipsFadeIn(section);

    // Signal that the premium services UI is fully rendered.
    // CSS keeps #services at opacity:0 until this class is present.
    document.body.classList.add('fixeo-services-ready');
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
