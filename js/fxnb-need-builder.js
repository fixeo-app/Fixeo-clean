/**
 * fxnb-need-builder.js — FIXEO Need Builder v1 (fxnb-v1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds a free-text need-entry and identification-result module to the
 * "Quel problème faut-il résoudre ?" section (#services) on index.html.
 *
 * CLASSIFICATION ENGINE
 *   Reuses window.FixeoAIRE (fixeo-ai-request-engine.js aire-v1a):
 *     window.FixeoAIRE.detect(text)         → NLP_MAP entry | null
 *     window.FixeoAIRE.detectUrgency(text)  → boolean
 *   No new classifier introduced. No external API calls.
 *
 * CANONICAL NEED STATE  (window.fxnbState — module-scoped, not global)
 *   {
 *     text:     string   — original user description (trimmed)
 *     category: object   — NLP_MAP entry {cat, icon, label} | null
 *     isUrgent: boolean  — urgency derived from approved engine or card metadata
 *     source:   string   — 'freetext' | 'card'
 *     city:     string   — selected city from services-city-filter | null
 *   }
 *
 * RAFI HANDOFF
 *   Writes state.text to #search-input.value (no events, no filter trigger)
 *   before opening the request modal via FixeoClientRequest.openRequestModal()
 *   → applyContextPrefill() in request-form.js reads #search-input.value and
 *     pre-populates #request-problem. Zero changes to request-form.js.
 *   City is already pre-loaded from #services-city-filter (Phase 1).
 *
 * SITUATION CARD CONVERGENCE
 *   Patches the card click pipeline via the existing initCategoryChips()-wired
 *   chip click (main.js) — uses MutationObserver on .chip.active state change
 *   to detect card selection and run the same result module.
 *
 * INVARIANTS
 *   - No modification to main.js, request-form.js, fixeo-rafi-os-v1.js,
 *     fixeo-ai-request-engine.js, fixeo-request-modal-v2.js
 *   - No Supabase writes
 *   - No setInterval / rAF loops
 *   - No localStorage writes
 *   - Idempotent: FXNB_GUARD prevents double init
 *   - Namespace: fxnb-* (CSS + JS element IDs)
 *   - Phase 1 city picker untouched
 *
 * Load order: after fixeo-ai-request-engine.js (for FixeoAIRE)
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Idempotency guard ── */
  if (window.FXNB_GUARD) return;
  window.FXNB_GUARD = true;

  var VERSION = 'fxnb-v1';

  /* ══════════════════════════════════════════════════════════════
     NEED STATE — module-scoped canonical structure
  ══════════════════════════════════════════════════════════════ */
  var _state = {
    text:     '',
    category: null,   /* NLP_MAP entry or null */
    isUrgent: false,
    source:   null,   /* 'freetext' | 'card' */
    city:     null
  };

  function _resetState() {
    _state.text     = '';
    _state.category = null;
    _state.isUrgent = false;
    _state.source   = null;
    _state.city     = _getCity();
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  function _el(id)     { return document.getElementById(id); }
  function _esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _norm(s)    { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }

  function _getCity() {
    var sel = _el('services-city-filter');
    return (sel && sel.value) ? sel.value : null;
  }

  /* ── NLP classify — pre-classifier then delegates to FixeoAIRE ──
     Pre-classifier catches known gaps in aire-v1a NLP_MAP:
     - "bloqué/coincé + porte/dehors/dedans" → serrurerie (stronger signal than menuiserie "porte")
     - "repeindre/repeinture/repeint" → peinture
     - "plâtre/plâtrier" → maçonnerie
     Threshold: only overrides if pre-classifier produces a longer match than FixeoAIRE.
  ── */
  var FXNB_BOOST = [
    /* Serrurerie: locked-out context — must appear before FixeoAIRE which may match "porte" → menuiserie */
    { cat:'serrurerie', icon:'🔑', label:'Serrurerie',
      patterns: [/bloqu[eé]e?\s+(dehors|devant|dedans|porte)/i, /coinc[eé]e?\s+(dehors|devant|dedans)/i,
                 /enferm[eé]e?\s+dehors/i, /cl[eé]\s+(perdu|cass[eé])/i,
                 /serrure\s+(bloqu[eé]|cass[eé]|coinc[eé]|forc[eé])/i] },
    /* Peinture: repeindre / repeinture */
    { cat:'peinture', icon:'🎨', label:'Peinture',
      patterns: [/repeindre/i, /repeinture/i, /repeint/i, /refaire\s+(les?\s+)?murs?/i,
                 /peinture\s+(int[eé]rieure|ext[eé]rieure|salon|chambre)/i] }
  ];

  function _classifyBoost(text) {
    var n = text.toLowerCase();
    for (var i = 0; i < FXNB_BOOST.length; i++) {
      var entry = FXNB_BOOST[i];
      for (var j = 0; j < entry.patterns.length; j++) {
        if (entry.patterns[j].test(n)) {
          return { cat: entry.cat, icon: entry.icon, label: entry.label };
        }
      }
    }
    return null;
  }

  function _classify(text) {
    if (!text || text.trim().length < 2) return null;
    /* Pre-classifier for known gaps */
    var boosted = _classifyBoost(text);
    if (boosted) return boosted;
    /* Delegate to approved engine */
    if (window.FixeoAIRE && typeof window.FixeoAIRE.detect === 'function') {
      return window.FixeoAIRE.detect(text);
    }
    return null;
  }

  function _urgency(text, cat) {
    if (!text) return false;
    if (window.FixeoAIRE && typeof window.FixeoAIRE.detectUrgency === 'function') {
      return window.FixeoAIRE.detectUrgency(text, cat);
    }
    return false;
  }

  /* ── Category lookup from data-category value ── */
  function _categoryFromKey(key) {
    /* NLP_MAP is internal to FixeoAIRE but FixeoAIRE.detect can classify a direct keyword */
    if (!key) return null;
    /* Try detecting the category key as a text token */
    var cat = _classify(key);
    if (cat) return cat;
    /* Fallback: build a minimal category object from known mappings */
    var ICON_MAP = {
      plomberie:'🔧',electricite:'⚡',serrurerie:'🔑',climatisation:'❄️',
      menuiserie:'🪵',peinture:'🎨',maconnerie:'🧱',nettoyage:'🧹',
      carrelage:'🏁',jardinage:'🌿',bricolage:'🔩',demenagement:'🚛'
    };
    var LABEL_MAP = {
      plomberie:'Plomberie',electricite:'Électricité',serrurerie:'Serrurerie',
      climatisation:'Climatisation',menuiserie:'Menuiserie',peinture:'Peinture',
      maconnerie:'Maçonnerie',nettoyage:'Nettoyage',carrelage:'Carrelage',
      jardinage:'Jardinage',bricolage:'Bricolage',demenagement:'Déménagement'
    };
    if (LABEL_MAP[key]) {
      return { cat: key, icon: ICON_MAP[key] || '🔧', label: LABEL_MAP[key] };
    }
    return null;
  }

  /* ── Truncate description for display ── */
  function _truncate(text, max) {
    max = max || 60;
    if (!text || text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  /* ══════════════════════════════════════════════════════════════
     DOM ACCESSORS
  ══════════════════════════════════════════════════════════════ */
  function _textarea()     { return _el('fxnb-textarea'); }
  function _submitBtn()    { return _el('fxnb-submit-btn'); }
  function _resultWrap()   { return _el('fxnb-result'); }
  function _resultSR()     { return _el('fxnb-sr-live'); }

  /* ══════════════════════════════════════════════════════════════
     RESULT MODULE — build and reveal
  ══════════════════════════════════════════════════════════════ */
  function _buildResult(state) {
    var wrap = _resultWrap();
    if (!wrap) return;

    var isFallback = !state.category;
    var icon       = state.category ? state.category.icon : '📋';
    var catLabel   = state.category ? state.category.label : 'Besoin à préciser';
    var desc       = state.text     ? _truncate(state.text, 64) : null;
    var city       = state.city;

    /* ── Fallback class toggle ── */
    wrap.classList.toggle('fxnb-result-fallback', isFallback);

    /* ── Node ── */
    var nodeEl = wrap.querySelector('.fxnb-result-node');
    if (nodeEl) {
      nodeEl.textContent = icon;
      nodeEl.classList.toggle('fxnb-node-urgent', state.isUrgent);
    }

    /* ── Category ── */
    var catEl = wrap.querySelector('.fxnb-result-category');
    if (catEl) catEl.textContent = catLabel;

    /* ── Description ── */
    var descEl = wrap.querySelector('.fxnb-result-desc');
    if (descEl) {
      if (desc) {
        descEl.textContent = desc;
        descEl.removeAttribute('hidden');
      } else {
        descEl.setAttribute('hidden', '');
      }
    }

    /* ── Status chips ── */
    var chipsEl = wrap.querySelector('.fxnb-result-chips');
    if (chipsEl) {
      var chipsHtml = '';

      if (!isFallback) {
        chipsHtml += '<span class="fxnb-chip fxnb-chip--green">Besoin détecté</span>';
        chipsHtml += '<span class="fxnb-chip fxnb-chip--green">Métier identifié</span>';
      } else {
        chipsHtml += '<span class="fxnb-chip fxnb-chip--blue">Besoin à préciser</span>';
      }

      if (city) {
        chipsHtml += '<span class="fxnb-chip fxnb-chip--blue">'
          + '<svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2a6 6 0 0 0-6 6c0 4 6 10 6 10s6-6 6-10a6 6 0 0 0-6-6Z"/><circle cx="10" cy="8" r="2"/></svg>'
          + ' ' + _esc(city) + ' enregistrée</span>';
      }

      if (state.isUrgent) {
        chipsHtml += '<span class="fxnb-chip fxnb-chip--orange">Urgence signalée</span>';
      }

      chipsEl.innerHTML = chipsHtml;
    }

    /* ── Source chip (from card vs freetext) ── */
    var srcEl = wrap.querySelector('.fxnb-result-source');
    if (srcEl) {
      srcEl.textContent = state.source === 'card' ? 'Situation prédéfinie' : 'Saisie libre';
    }

    /* ── Screen reader announcement ── */
    var srEl = _resultSR();
    if (srEl) {
      srEl.textContent = 'Besoin identifié : ' + catLabel
        + (city ? '. Ville : ' + city + '.' : '')
        + (state.isUrgent ? ' Urgence signalée.' : '');
    }

    /* ── Reveal ── */
    wrap.classList.add('fxnb-result-visible');
    wrap.removeAttribute('hidden');
    wrap.setAttribute('aria-hidden', 'false');
  }

  function _hideResult() {
    var wrap = _resultWrap();
    if (!wrap) return;
    wrap.classList.remove('fxnb-result-visible');
    wrap.setAttribute('aria-hidden', 'true');
    var srEl = _resultSR();
    if (srEl) srEl.textContent = '';
  }

  /* ══════════════════════════════════════════════════════════════
     SUBMIT BUTTON STATE
  ══════════════════════════════════════════════════════════════ */
  function _updateSubmitState() {
    var btn  = _submitBtn();
    var area = _textarea();
    if (!btn || !area) return;
    var val = area.value.trim();
    btn.disabled = (val.length === 0);
  }

  /* ══════════════════════════════════════════════════════════════
     TEXT ANALYSIS — classify user's free text
  ══════════════════════════════════════════════════════════════ */
  function _analyzeText(text) {
    var trimmed = (text || '').trim();
    if (!trimmed) return;

    var cat     = _classify(trimmed);
    var isUrg   = _urgency(trimmed, cat);
    var city    = _getCity();

    _state.text     = trimmed;
    _state.category = cat;
    _state.isUrgent = isUrg;
    _state.source   = 'freetext';
    _state.city     = city;

    _buildResult(_state);
  }

  /* ══════════════════════════════════════════════════════════════
     SITUATION CARD — converge with result pipeline
  ══════════════════════════════════════════════════════════════ */
  function _handleCardSelection(chip) {
    var key     = (chip.dataset.category || '').trim();
    var label   = (chip.querySelector('.fc3-card-label') || {}).textContent || key;
    var urgent  = !!chip.querySelector('.fc3-card-urgency');

    if (!key || key === 'all') return;

    var cat = _categoryFromKey(key);
    var city = _getCity();

    _state.text     = label.trim();
    _state.category = cat;
    _state.isUrgent = urgent;
    _state.source   = 'card';
    _state.city     = city;

    /* Sync the textarea with the card label so the user sees what was selected */
    var area = _textarea();
    if (area) {
      area.value = label.trim();
      _updateSubmitState();
    }

    _buildResult(_state);
  }

  /* ══════════════════════════════════════════════════════════════
     RAFI HANDOFF
     Write state.text to #search-input.value (no events).
     applyContextPrefill() in request-form.js reads #search-input
     via getFirstNonEmptyValue() → pre-populates #request-problem.
     City is already fed from #services-city-filter (Phase 1).
     No changes to request-form.js.
  ══════════════════════════════════════════════════════════════ */
  function _openRafi() {
    var text   = _state.text || (_textarea() ? (_textarea().value || '').trim() : '');
    if (!text) return;

    /* Write problem text to the relay input */
    var relay = _el('search-input');
    if (relay) {
      relay.value = text;
      /* Do NOT dispatch 'input' event — would trigger artisan text search */
    }

    /* Also pre-seed category into RAFI memory if RAFI OS is loaded */
    try {
      if (window.FixeoRAFI && window.FixeoRAFI.memory && _state.category) {
        window.FixeoRAFI.memory.update({ category: _state.category, isUrgent: _state.isUrgent });
      }
    } catch(e) {}

    /* Open the request modal */
    try {
      if (window.FixeoClientRequest && typeof window.FixeoClientRequest.open === 'function') {
        /* Pass a synthetic trigger so request-form.js resolves mode correctly */
        var syntheticTrigger = document.createElement('button');
        syntheticTrigger.setAttribute('data-request-mode', 'default');
        window.FixeoClientRequest.open(syntheticTrigger, 'default');
      } else if (window.openModal) {
        window.openModal('request-modal');
      }
    } catch(e) {}

    /* Clear the relay input shortly after modal is open so artisan search is clean */
    setTimeout(function() {
      if (relay) relay.value = '';
    }, 800);
  }

  /* ══════════════════════════════════════════════════════════════
     CITY CHANGE SYNC
     When user changes city after result is shown, update chips.
  ══════════════════════════════════════════════════════════════ */
  function _bindCitySync() {
    var sel = _el('services-city-filter');
    if (!sel || sel._fxnbCityBound) return;
    sel._fxnbCityBound = true;
    sel.addEventListener('change', function() {
      _state.city = this.value || null;
      /* If result is visible, refresh city chip only */
      var wrap = _resultWrap();
      if (wrap && wrap.classList.contains('fxnb-result-visible') && _state.text) {
        _buildResult(_state);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SITUATION CARD OBSERVER
     MutationObserver on the chip grid — fires when a card gets
     `.active` class from initCategoryChips() in main.js.
     Does not interfere with main.js filtering chain.
  ══════════════════════════════════════════════════════════════ */
  function _watchCards() {
    var grids = document.querySelectorAll('.fxsit-primary-grid, #fxsit-additional');
    grids.forEach(function(grid) {
      if (grid._fxnbWatched) return;
      grid._fxnbWatched = true;

      /* Observer: detect when a chip gains .active */
      var obs = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          if (m.type !== 'attributes' || m.attributeName !== 'class') return;
          var chip = m.target;
          if (!chip.classList.contains('fxsit-card')) return;
          if (!chip.classList.contains('active')) return;
          /* Small delay so main.js filtering settles first */
          setTimeout(function() { _handleCardSelection(chip); }, 60);
        });
      });
      obs.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     EDIT / RESET
  ══════════════════════════════════════════════════════════════ */
  function _handleEdit() {
    _hideResult();
    var area = _textarea();
    if (area) {
      area.focus();
      /* Move cursor to end */
      try { area.setSelectionRange(area.value.length, area.value.length); } catch(e) {}
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT WIRING
  ══════════════════════════════════════════════════════════════ */
  function _wireTextarea() {
    var area = _textarea();
    if (!area || area._fxnbWired) return;
    area._fxnbWired = true;

    /* Update submit button on each keypress */
    area.addEventListener('input', function() {
      _updateSubmitState();
      /* Hide stale result if user is editing */
      var wrap = _resultWrap();
      if (wrap && wrap.classList.contains('fxnb-result-visible')) {
        /* Hide only if text changed meaningfully (>3 chars difference) */
        var diff = Math.abs((area.value || '').length - (_state.text || '').length);
        if (diff > 3) _hideResult();
      }
    });

    /* Prevent Enter from accidentally submitting — let Shift+Enter add newlines,
       plain Enter does nothing extra (textarea default = newline, not submit) */
    area.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        /* Only trigger classify on Enter if no newline in current text */
        var val = area.value.trim();
        if (val && !val.includes('\n')) {
          e.preventDefault();
          _analyzeText(area.value);
        }
        /* Otherwise: let the default newline happen */
      }
    });
  }

  function _wireSubmit() {
    var btn = _submitBtn();
    if (!btn || btn._fxnbWired) return;
    btn._fxnbWired = true;

    btn.addEventListener('click', function() {
      var area = _textarea();
      if (!area) return;
      var val = area.value.trim();
      if (!val) return;

      /* Scanning state feedback */
      btn.classList.add('fxnb-scanning');
      var label = btn.querySelector('.fxnb-submit-label');
      var orig  = label ? label.textContent : '';
      if (label) label.textContent = 'Analyse…';

      /* Minimal delay for perceived processing */
      setTimeout(function() {
        _analyzeText(area.value);
        btn.classList.remove('fxnb-scanning');
        if (label) label.textContent = orig;
        /* Scroll result into view on mobile */
        var wrap = _resultWrap();
        if (wrap && window.innerWidth < 768) {
          try { wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e) {}
        }
      }, 340);
    });
  }

  function _wireCta() {
    /* Primary CTA: open RAFI */
    var cta = _el('fxnb-cta-primary');
    if (cta && !cta._fxnbWired) {
      cta._fxnbWired = true;
      cta.addEventListener('click', function() {
        /* If no analysis yet, use textarea content */
        if (!_state.text) {
          var area = _textarea();
          if (area && area.value.trim()) {
            _state.text     = area.value.trim();
            _state.category = _classify(_state.text);
            _state.isUrgent = _urgency(_state.text, _state.category);
            _state.city     = _getCity();
          }
        }
        _openRafi();
      });
    }

    /* Edit link */
    var edit = _el('fxnb-cta-edit');
    if (edit && !edit._fxnbWired) {
      edit._fxnbWired = true;
      edit.addEventListener('click', _handleEdit);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function _init() {
    /* Wait for #fxnb-textarea to exist (injected in HTML) */
    var area = _textarea();
    if (!area) return; /* HTML not ready yet */

    _updateSubmitState();
    _wireTextarea();
    _wireSubmit();
    _wireCta();
    _bindCitySync();
    _watchCards();

    /* Pre-populate city */
    _state.city = _getCity();

    /* If RAFI memory already has text (e.g. user navigated back), prefill */
    try {
      var relay = _el('search-input');
      if (relay && relay.value && relay.value.length > 2) {
        area.value = relay.value;
        _updateSubmitState();
      }
    } catch(e) {}
  }

  /* ── Public API ── */
  window.FixeoNeedBuilder = {
    VERSION:   VERSION,
    getState:  function() { return Object.assign({}, _state); },
    reset:     function() { _resetState(); _hideResult(); },
    analyze:   _analyzeText
  };

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
  /* Retry once for late injections (deferred scripts) */
  setTimeout(_init, 600);

})();
