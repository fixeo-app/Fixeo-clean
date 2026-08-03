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

  /* City list — single source of truth via window.FIXEO_CITIES (fixeo-cities.js).
     Falls back to inline list if the shared file is not yet loaded. */
  var _citiesBase = (window.FIXEO_CITIES && window.FIXEO_CITIES.length)
    ? window.FIXEO_CITIES
    : ['Casablanca','Rabat','Marrakech','Fès','Agadir','Tanger',
       'Meknès','Oujda','Kénitra','Tétouan','Safi','El Jadida'];
  var CITIES = [{ value: '', label: '📍 Toutes les villes' }].concat(
    _citiesBase.map(function(c){ return { value: c, label: c }; })
  );

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

    /* ── Mobile scrim — shown behind bottom-sheet on ≤640px ── */
    var scrim = document.createElement('div');
    scrim.id = 'svc-city-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99998',
      'background:rgba(0,0,0,0.42)', 'display:none',
      'touch-action:none', '-webkit-tap-highlight-color:transparent'
    ].join(';');
    document.body.appendChild(scrim);

    function _isMobile() { return window.innerWidth <= 640; }

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
      if (_isMobile()) {
        /* Bottom sheet: CSS handles position via @media override;
           JS only needs z-index (CSS cannot override inline z-index without !important,
           and the CSS override already uses !important on top/left/right/bottom). */
        dropdown.style.position = 'fixed';
        dropdown.style.zIndex   = '99999';
        scrim.style.display     = 'block';
        /* Scroll lock — save + lock body */
        try {
          scrim._savedScrollY = window.scrollY || 0;
          document.body.style.overflow = 'hidden';
        } catch(e) {}
      } else {
        var pos = _getPos();
        dropdown.style.position = 'fixed';
        dropdown.style.top      = pos.top  + 'px';
        dropdown.style.left     = pos.left + 'px';
        dropdown.style.width    = '192px';
        dropdown.style.zIndex   = '99999';
      }
    }

    function _close() {
      pill.classList.remove('open');
      pill.setAttribute('aria-expanded', 'false');
      dropdown.classList.remove('svc-open');
      scrim.style.display = 'none';
      /* Restore scroll lock */
      try {
        document.body.style.overflow = '';
        if (typeof scrim._savedScrollY === 'number') {
          window.scrollTo(0, scrim._savedScrollY);
        }
      } catch(e) {}
      /* Return focus to pill */
      try { pill.focus(); } catch(e) {}
    }

    function _toggle(e) {
      e.stopPropagation();
      if (dropdown.classList.contains('svc-open')) { _close(); } else { _open(); }
    }

    /* Expose open/close for external callers (e.g. "+ Plus" chip handler) */
    wrap._svcOpen  = _open;
    wrap._svcClose = _close;
    /* Also expose on the select so any caller with a reference can open the picker */
    citySelect._svcPickerOpen = _open;

    pill.addEventListener('click', _toggle);
    pill.addEventListener('touchend', function(e) { e.preventDefault(); _toggle(e); });
    scrim.addEventListener('click',    _close);
    scrim.addEventListener('touchend', function(e){ e.preventDefault(); _close(); });

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
      /* ── Sync fxsit-city-row state (fxhome-situations-v2 city row) ── */
      (function _syncFxsitRow(city) {
        try {
          var section  = document.getElementById('services');
          var nameEl   = document.getElementById('fxsit-city-name');
          var knownDiv = document.getElementById('fxsit-city-known');
          var unkDiv   = document.getElementById('fxsit-city-unknown');
          var chipsDiv = document.getElementById('city-quick-chips');
          var chooseBtn = document.getElementById('fxsit-city-choose-btn');
          var modifyBtn = document.getElementById('fxsit-city-modify-btn');
          if (city) {
            if (nameEl)  nameEl.textContent = city;
            if (section) section.setAttribute('data-fc3-city-known', '1');
            if (knownDiv) knownDiv.setAttribute('aria-hidden', 'false');
            if (unkDiv)   unkDiv.setAttribute('aria-hidden', 'true');
          } else {
            if (section)  section.removeAttribute('data-fc3-city-known');
            if (knownDiv) knownDiv.setAttribute('aria-hidden', 'true');
            if (unkDiv)   unkDiv.removeAttribute('aria-hidden');
          }
          /* Sync active chip highlight */
          if (chipsDiv) {
            chipsDiv.querySelectorAll('.city-chip[data-city]').forEach(function (c) {
              var isActive = c.dataset.city === city;
              c.classList.toggle('active', isActive);
              if (isActive) c.setAttribute('aria-pressed', 'true');
              else c.removeAttribute('aria-pressed');
            });
          }
          /* Close chip drawer if open */
          if (chipsDiv && !chipsDiv.hasAttribute('hidden')) {
            chipsDiv.setAttribute('hidden', '');
            if (section) section.removeAttribute('data-fc3-chips-open');
            if (chooseBtn) chooseBtn.setAttribute('aria-expanded', 'false');
            if (modifyBtn) modifyBtn.setAttribute('aria-expanded', 'false');
          }
        } catch (err) { /* non-fatal */ }
      }(val));
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
