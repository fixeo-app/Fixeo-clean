/**
 * fixeo-urgent-modal-v3-patch.js — fuv3-v1b
 * FIXEO Urgent Modal V3.1 — Conversion Optimization Patch
 *
 * Additive over fuv3-v1a. Fires at 90ms (after fuv3 at 60ms).
 * Guard: window._fxUrgentV3PatchLoaded (idempotent).
 *
 * Upgrades:
 *   P-1: Smart chip ranking — time + season reorder in .fxrm2-chip-grid
 *   P-2: Enhanced live ETA signal — artisan count + ETA + updates on chip/city change
 *   P-3: Extreme urgency toggle — compact dual-button above submit
 *   P-4: Trust booster block — 3 reassurance lines above submit
 *   P-5: Micro-UX polish — chip section label, CTA text update
 *
 * NEVER TOUCHES:
 *   - request-form.js submit logic / payload / Supabase persistence
 *   - fixeo-request-modal-v2.js (rmv2)
 *   - fixeo-urgent-modal-v3.js (fuv3-v1a)
 *   - fixeo-estimation-engine-v1.js (faee)
 *   - fixeo-ai-request-engine.js (AIRE)
 *   - Any notification / dispatch / admin engine
 *
 * Version: fuv3-v1b — 2026-06-12
 */
(function () {
  'use strict';

  if (window._fxUrgentV3PatchLoaded) return;
  window._fxUrgentV3PatchLoaded = true;

  var VERSION = 'fuv3-v1b';

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  /* ─────────────────────────────────────────────
     P-1: SMART CHIP RANKING
     Reorders chips already injected by rmv2 + fuv3.
     Logic: time-of-day + season context scoring.
     Preserves all click listeners (DOM move keeps them).
     Adds label "Urgences fréquentes près de vous" above chip grid.
  ───────────────────────────────────────────── */

  var CHIP_SCORES = {
    'fuite':   function (h, m) { return (h >= 6  && h < 10 ? 4 : 0) + (m >= 10 || m <= 2 ? 2 : 0); },
    'wc':      function (h)    { return  h >= 6  && h < 10 ? 3 : 0; },
    'chauffe': function (h, m) { return (h >= 6  && h < 12 ? 2 : 0) + (m >= 10 || m <= 3 ? 4 : 0); },
    'panne':   function (h)    { return  h >= 18 && h < 23 ? 3 : 1; },
    'porte':   function (h)    { return (h >= 22 || h < 7  ? 5 : 0); },
    'clim':    function (h, m) { return (h >= 10 && h < 20 ? 2 : 0) + (m >= 4  && m <= 8 ? 4 : 0); },
    'urgence': function ()     { return 0; }
  };

  function _getChipScore(text) {
    var t   = (text || '').toLowerCase();
    var now = new Date();
    var h   = now.getHours();
    var m   = now.getMonth();
    for (var key in CHIP_SCORES) {
      if (t.indexOf(key) !== -1) return CHIP_SCORES[key](h, m);
    }
    return 0;
  }

  function _rankChips(form) {
    var grid = form && form.querySelector('.fxrm2-chip-grid');
    if (!grid || grid.dataset.fuv3Ranked) return;
    grid.dataset.fuv3Ranked = '1';

    var chips = Array.from(grid.querySelectorAll('.fxrm2-chip'));
    if (chips.length < 3) return;

    var scored = chips.map(function (chip) {
      var text = (chip.dataset.text || '').toLowerCase();
      if (!text) {
        var lbl = chip.querySelector('.fxrm2-chip-label-text');
        if (lbl) text = lbl.textContent.toLowerCase();
      }
      return { chip: chip, score: _getChipScore(text) };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    scored.forEach(function (item) { grid.appendChild(item.chip); });

    var section = form.querySelector('.fxrm2-chip-section');
    if (section && !section.querySelector('.fuv3-chip-context-label')) {
      var lbl = document.createElement('p');
      lbl.className = 'fuv3-chip-context-label';
      lbl.textContent = 'Urgences fréquentes près de vous';
      var existing = section.querySelector('.fxrm2-chip-label');
      if (existing) {
        existing.insertAdjacentElement('afterend', lbl);
        existing.style.display = 'none';
      } else {
        section.insertBefore(lbl, section.firstChild);
      }
    }
  }

  /* ─────────────────────────────────────────────
     P-2: ENHANCED LIVE ETA SIGNAL
  ───────────────────────────────────────────── */

  var ETA_CITY_TIER = {
    'Casablanca': 1, 'Rabat': 1, 'Marrakech': 1,
    'Fès': 2, 'Tanger': 2, 'Agadir': 2, 'Meknès': 2,
    'Oujda': 3, 'Kénitra': 3, 'Tétouan': 3, 'Salé': 3,
    'Temara': 3, 'El Jadida': 3, 'Béni Mellal': 3,
    'Nador': 3, 'Khouribga': 3, 'Safi': 3, 'Taza': 3,
    'Ouarzazate': 3, 'Mohammedia': 3
  };

  var ETA_BASE    = { 1: 15, 2: 22, 3: 35 };
  var ETA_SERVICE = {
    plomberie: 0, electricite: 2, serrurerie: -3,
    climatisation: 5, nettoyage: 8, peinture: 10
  };

  function _isNight() {
    var h = new Date().getHours();
    return h >= 22 || h < 7;
  }

  function _computeETA(city, slug) {
    var tier = ETA_CITY_TIER[city] || 2;
    var base = ETA_BASE[tier];
    var adj  = (slug && ETA_SERVICE[slug] !== undefined) ? ETA_SERVICE[slug] : 0;
    var eta  = Math.max(10, base + adj + (_isNight() ? 8 : 0));
    return Math.round(eta / 5) * 5;
  }

  function _getSelectedSlug(form) {
    var chip = form && form.querySelector('.fxrm2-chip.selected');
    return (chip && chip.dataset.slug) || 'plomberie';
  }

  function _getSelectedCity(form) {
    var el = form && $('#request-city', form);
    return (el && el.value) || '';
  }

  function _getArtisanCount(slug, city) {
    try {
      if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
        var n = window.FixeoAIRE.getArtisanCount(slug || 'plomberie', city || '');
        if (n !== null && n > 0) return n;
      }
    } catch (_) {}
    var tier = ETA_CITY_TIER[city] || 2;
    return tier === 1 ? 18 : tier === 2 ? 12 : 8;
  }

  function _renderSignalHTML(count, eta, isExtreme) {
    var etaVal = isExtreme ? Math.max(8, Math.round(eta * 0.65 / 5) * 5) : eta;
    return (
      '<span class="fuv3-signal-dot" aria-hidden="true"></span>' +
      '<span class="fuv3-signal-body">' +
        '<span class="fuv3-signal-line">' +
          '<span class="fuv3-signal-count">' + count + '</span>' +
          '\u00a0artisans disponibles maintenant' +
        '</span>' +
        '<span class="fuv3-signal-sep" aria-hidden="true">\u00b7</span>' +
        '<span class="fuv3-signal-line">' +
          '<span aria-hidden="true">\u23f1\ufe0f</span>' +
          '\u00a0Arriv\u00e9e moyenne\u00a0: ' +
          '<span class="fuv3-signal-eta">' + etaVal + '\u00a0min</span>' +
        '</span>' +
      '</span>'
    );
  }

  function _refreshSignal(modal, form) {
    var el = modal && modal.querySelector('#fuv3-live-signal');
    if (!el) return;
    var slug    = _getSelectedSlug(form);
    var city    = _getSelectedCity(form);
    var count   = _getArtisanCount(slug, city);
    var eta     = _computeETA(city, slug);
    var extreme = modal.dataset.fuv3Extreme === '1';
    var html    = _renderSignalHTML(count, eta, extreme);
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  function _wireSignalUpdates(modal, form) {
    if (form.dataset.fuv3SignalWired) return;
    form.dataset.fuv3SignalWired = '1';
    var _t = null;
    function debounce() {
      clearTimeout(_t);
      _t = setTimeout(function () { _refreshSignal(modal, form); }, 160);
    }
    var cityEl = $('#request-city', form);
    if (cityEl) cityEl.addEventListener('change', debounce);
    var grid = form.querySelector('.fxrm2-chip-grid');
    if (grid) grid.addEventListener('click', function () { setTimeout(debounce, 20); });
  }

  /* ─────────────────────────────────────────────
     P-3: EXTREME URGENCY TOGGLE
  ───────────────────────────────────────────── */

  var EXTREME_KEYWORDS = [
    'gaz', 'inondation', 'enfant bloqu', 'court-circuit',
    'feu', 'incendie', 'danger', 'electrocution', 'urgence extreme',
    'fuite importante', 'noyade'
  ];

  function _autoDetectExtreme(text) {
    var t = (text || '').toLowerCase();
    return EXTREME_KEYWORDS.some(function (kw) { return t.indexOf(kw) !== -1; });
  }

  function _updateToggleUI(modal, isExtreme) {
    var std = modal.querySelector('.fuv3-toggle-std');
    var ext = modal.querySelector('.fuv3-toggle-ext');
    if (!std || !ext) return;
    std.classList.toggle('fuv3-toggle-active', !isExtreme);
    ext.classList.toggle('fuv3-toggle-active',  isExtreme);
  }

  function _patchExtremeState(modal, form, isExtreme) {
    modal.dataset.fuv3Extreme = isExtreme ? '1' : '0';
    modal.classList.toggle('fuv3-extreme', isExtreme);
    _updateToggleUI(modal, isExtreme);
    _refreshSignal(modal, form);
    _updateCTAText(form, isExtreme);

    /* Encode in hidden field (no backend schema change) */
    var hidden = form.querySelector('#fuv3-extreme-flag');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.id   = 'fuv3-extreme-flag';
      hidden.name = 'extreme_urgency';
      form.appendChild(hidden);
    }
    hidden.value = isExtreme ? 'true' : '';
  }

  function _injectExtremeToggle(modal, form) {
    if (modal.querySelector('#fuv3-extreme-toggle')) return;

    var wrap = document.createElement('div');
    wrap.id = 'fuv3-extreme-toggle';
    wrap.className = 'fuv3-extreme-toggle';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', "Niveau d'urgence");
    wrap.innerHTML =
      '<button type="button" class="fuv3-toggle-btn fuv3-toggle-std fuv3-toggle-active" data-mode="standard">Urgence standard</button>' +
      '<button type="button" class="fuv3-toggle-btn fuv3-toggle-ext" data-mode="extreme">&#x1F6A8;\u00a0Urgence extr\u00eame</button>';

    var submitBtn = form.querySelector('.request-submit-btn');
    if (submitBtn) submitBtn.parentNode.insertBefore(wrap, submitBtn);
    else form.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.fuv3-toggle-btn');
      if (!btn) return;
      _patchExtremeState(modal, form, btn.dataset.mode === 'extreme');
    });

    /* Auto-detect from problem input */
    var problemInput = $('#request-problem', form);
    if (problemInput) {
      problemInput.addEventListener('input', function () {
        if (_autoDetectExtreme(problemInput.value)) {
          _patchExtremeState(modal, form, true);
        }
      });
    }
  }

  /* ─────────────────────────────────────────────
     P-4: TRUST BOOSTER
  ───────────────────────────────────────────── */

  function _injectTrustBooster(form) {
    if (form.querySelector('#fuv3-trust-booster')) return;

    var block = document.createElement('div');
    block.id = 'fuv3-trust-booster';
    block.className = 'fuv3-trust-booster';
    block.setAttribute('aria-label', 'Garanties Fixeo');
    block.innerHTML =
      '<span class="fuv3-trust-item"><span class="fuv3-trust-check" aria-hidden="true">\u2713</span>Aucun paiement maintenant</span>' +
      '<span class="fuv3-trust-item"><span class="fuv3-trust-check" aria-hidden="true">\u2713</span>Artisan v\u00e9rifi\u00e9 Fixeo</span>' +
      '<span class="fuv3-trust-item"><span class="fuv3-trust-check" aria-hidden="true">\u2713</span>Prix confirm\u00e9 avant intervention</span>';

    var submitBtn = form.querySelector('.request-submit-btn');
    if (submitBtn) submitBtn.parentNode.insertBefore(block, submitBtn);
    else form.appendChild(block);
  }

  /* ─────────────────────────────────────────────
     P-5: CTA TEXT
  ───────────────────────────────────────────── */

  function _updateCTAText(form, isExtreme) {
    var btn = form && form.querySelector('.request-submit-btn');
    if (!btn || btn.classList.contains('fuv3-btn-disabled')) return;
    if (isExtreme) {
      if (!btn.dataset.fuv3OrigText) btn.dataset.fuv3OrigText = btn.textContent;
      btn.textContent = '\uD83D\uDEA8 Intervention extr\u00eame maintenant';
    } else if (btn.dataset.fuv3OrigText) {
      btn.textContent = btn.dataset.fuv3OrigText;
    }
  }

  /* ─────────────────────────────────────────────
     MAIN PATCH — fires at 90ms
  ───────────────────────────────────────────── */

  function _patch(modal) {
    if (!modal) return;
    var form = modal.querySelector('#request-form');
    if (!form) return;

    try {
      _rankChips(form);

      /* P-2: Enhance existing fuv3 signal */
      var slug  = _getSelectedSlug(form);
      var city  = _getSelectedCity(form);
      var count = _getArtisanCount(slug, city);
      var eta   = _computeETA(city, slug);
      var el    = modal.querySelector('#fuv3-live-signal');
      if (el) {
        el.innerHTML = _renderSignalHTML(count, eta, false);
        el.classList.add('fuv3-signal-enhanced');
      }
      _wireSignalUpdates(modal, form);

      /* P-3 */
      _injectExtremeToggle(modal, form);

      /* P-4 */
      _injectTrustBooster(form);

    } catch (e) {
      if (window.console && console.warn) console.warn('[fuv3-patch]', e && e.message);
    }
  }

  /* ─────────────────────────────────────────────
     TEARDOWN PATCH
  ───────────────────────────────────────────── */

  function _teardownPatch(modal) {
    if (!modal) return;
    try {
      var form = modal.querySelector('#request-form');
      modal.classList.remove('fuv3-extreme');
      modal.dataset.fuv3Extreme = '0';

      ['#fuv3-extreme-toggle', '#fuv3-trust-booster', '#fuv3-extreme-flag'].forEach(function (sel) {
        var el = modal.querySelector(sel);
        if (el) el.parentNode && el.parentNode.removeChild(el);
      });

      if (form) {
        var grid = form.querySelector('.fxrm2-chip-grid');
        if (grid) delete grid.dataset.fuv3Ranked;

        var ctxLbl = form.querySelector('.fuv3-chip-context-label');
        if (ctxLbl) ctxLbl.parentNode && ctxLbl.parentNode.removeChild(ctxLbl);

        var oldLbl = form.querySelector('.fxrm2-chip-label');
        if (oldLbl) oldLbl.style.display = '';

        form.dataset.fuv3SignalWired = '';

        var btn = form.querySelector('.request-submit-btn');
        if (btn && btn.dataset.fuv3OrigText) {
          btn.textContent = btn.dataset.fuv3OrigText;
          delete btn.dataset.fuv3OrigText;
        }
      }
    } catch (e) {
      if (window.console && console.warn) console.warn('[fuv3-patch] teardown', e && e.message);
    }
  }

  /* ─────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────── */

  var modal = document.getElementById('request-modal');
  if (!modal) return;

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName !== 'class' && m.attributeName !== 'data-request-mode') return;
      var isOpen    = modal.classList.contains('open');
      var isExpress = (modal.getAttribute('data-request-mode') || '') === 'express';
      if (isOpen && isExpress) {
        setTimeout(function () { _patch(modal); }, 90);
      } else if (!isOpen) {
        setTimeout(function () { _teardownPatch(modal); }, 25);
      }
    });
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class', 'data-request-mode'] });

  window.FixeoUrgentV3Patch = {
    VERSION:  VERSION,
    patch:    function () { _patch(modal); },
    teardown: function () { _teardownPatch(modal); }
  };

})();
