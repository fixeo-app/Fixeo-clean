/* ============================================================
   FIXEO Reservation Flagship V1 — Presentation Enhancer
   Version: fxresf-v11a
   Namespace: fxresf-* ONLY

   Architecture:
   - Pure presentation layer — zero engine modifications
   - Observes #fixeo-reservation-modal via ONE MutationObserver
   - Debounces enhancement via microtask queue (queueMicrotask)
   - Double-mount guard: data-fxresf="1" sentinel on modal root
   - Tears down on modal close (body class removal)
   - Remounts cleanly on reopen
   - All DOM reads from rendered production nodes (no state duplication)
   - All writes are additive (classes, new elements, text patches)
   - Never replaces or clones business-state inputs
   - Never duplicates IDs
   - Fails silently back to production modal
   ============================================================ */
(function (window, document) {
  'use strict';

  /* ── global guard ─────────────────────────────────────── */
  if (window._fxresfLoaded) return;
  window._fxresfLoaded = true;

  var MODAL_ID  = 'fixeo-reservation-modal';
  var DATA_KEY  = 'fxresf';        /* sentinel attribute on modal root */
  var STEP1_KEY = 'fxresfS1';      /* applied after Step 1 enhance */
  var STEP2_KEY = 'fxresfS2';      /* applied after Step 2 enhance */

  var _observer = null;
  var _bodyObserver = null;
  var _pendingMicrotask = false;

  /* ── Safe DOM helpers ────────────────────────────────── */
  function _el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function _esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }
  function _try(fn) {
    try { return fn(); } catch (_) { return null; }
  }

  /* ════════════════════════════════════════════════════════
     ARTISAN IDENTITY RESOLUTION
     Priority: photo_url > FixeoHeroes.webp > .png > emoji
     Never produces [object Object] or broken img
  ════════════════════════════════════════════════════════ */
  function _resolveAvatar(artisan) {
    if (!artisan) return null;

    /* 1. Real photo */
    var photo = artisan.photo_url || artisan.avatar || artisan.photo || '';
    if (photo && typeof photo === 'string' && photo.indexOf('http') === 0) {
      return photo;
    }

    /* 2–3. FixeoHeroes canonical chain */
    if (window.FixeoHeroes && typeof window.FixeoHeroes.getCardAvatar === 'function') {
      var cat = (artisan.category || artisan.specialty || '').toLowerCase();
      if (cat) {
        var heroObj = _try(function () { return window.FixeoHeroes.getCardAvatar(cat); });
        if (heroObj && typeof heroObj === 'object') {
          var heroSrc = heroObj.webp || heroObj.png;
          if (heroSrc && typeof heroSrc === 'string') return heroSrc;
        }
      }
    }

    /* 4. Deliberate fallback — no broken img */
    return null;
  }

  function _getCategoryEmoji(cat) {
    var MAP = {
      plomberie: '🔧', electricite: '⚡', peinture: '🎨', nettoyage: '🧹',
      jardinage: '🌿', demenagement: '🚛', bricolage: '🔨', climatisation: '❄️',
      menuiserie: '🪚', maconnerie: '🧱', serrurerie: '🔑', carrelage: '🪟',
      toiture: '🏠'
    };
    return MAP[(cat || '').toLowerCase()] || '🛠️';
  }

  function _getCategoryLabel(cat) {
    var MAP = {
      plomberie: 'Plomberie', electricite: 'Électricité', peinture: 'Peinture',
      nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement',
      bricolage: 'Bricolage', climatisation: 'Climatisation', menuiserie: 'Menuiserie',
      maconnerie: 'Maçonnerie', serrurerie: 'Serrurerie', carrelage: 'Carrelage',
      toiture: 'Toiture'
    };
    return MAP[(cat || '').toLowerCase()] || 'Service';
  }

  /* Read artisan identity from the rendered modal DOM — no state duplication */
  function _readArtisanFromDOM(modal) {
    /* Primary source: window._fixeoCurrentArtisan set by fixeo-profile-v2a.js */
    var sb = window._fixeoCurrentArtisan;
    if (sb && typeof sb === 'object') {
      return {
        name:     sb.name     || sb.artisanName || '',
        category: sb.category || sb.specialty || '',
        city:     sb.city     || '',
        photo_url:sb.photo_url|| sb.avatar || '',
        avatar:   sb.photo_url|| sb.avatar || '',
      };
    }
    /* Fallback: read rendered DOM */
    var nameEl = modal.querySelector('.fixeo-res-artisan-name');
    var metaEl = modal.querySelector('.fixeo-res-artisan-meta');
    if (!nameEl) return null;
    var name   = nameEl.textContent.trim();
    var meta   = metaEl ? metaEl.textContent.trim() : '';
    /* meta: "🔧 Plomberie · 📍 Casablanca" */
    var city   = '';
    var cat    = '';
    var mParts = meta.split('·');
    if (mParts.length >= 2) {
      cat  = mParts[0].replace(/[🔧⚡🎨🧹🌿🚛🔨❄️🪚🧱🔑🪟🏠🛠️]/gu, '').trim();
      city = mParts[1].replace('📍', '').trim();
    }
    /* Resolve category slug from label */
    var catSlug = cat.toLowerCase()
      .replace('électricité', 'electricite')
      .replace('déménagement', 'demenagement')
      .replace('maçonnerie', 'maconnerie');

    return { name: name, category: catSlug, city: city, photo_url: '', avatar: '' };
  }

  /* ════════════════════════════════════════════════════════
     HEADER STRIP INJECTION
     Builds the compact artisan identity strip in .fixeo-res-header
  ════════════════════════════════════════════════════════ */
  function _buildHeaderStrip(artisan, stepNum) {
    var avatarSrc = _resolveAvatar(artisan);
    var catEmoji  = _getCategoryEmoji(artisan.category);
    var catLabel  = _getCategoryLabel(artisan.category);
    var name      = artisan.name || 'Artisan';
    var city      = artisan.city || '';

    /* Build strip root */
    var strip = _el('div', 'fxresf-header-strip');

    /* Avatar */
    var avWrap;
    if (avatarSrc) {
      avWrap = _el('div', 'fxresf-hav-wrap');
      var img = document.createElement('img');
      img.src = avatarSrc;
      img.alt = _esc(name);
      img.setAttribute('loading', 'lazy');
      img.addEventListener('error', function () {
        /* on error: replace with fallback emoji */
        var fb = _el('div', 'fxresf-hav-fallback');
        fb.setAttribute('aria-hidden', 'true');
        fb.textContent = catEmoji;
        if (avWrap && avWrap.parentNode) {
          avWrap.parentNode.replaceChild(fb, avWrap);
        }
      });
      avWrap.appendChild(img);
    } else {
      avWrap = _el('div', 'fxresf-hav-fallback');
      avWrap.setAttribute('aria-hidden', 'true');
      avWrap.textContent = catEmoji;
    }
    strip.appendChild(avWrap);

    /* Info */
    var info = _el('div', 'fxresf-hinfo');

    var hname = _el('div', 'fxresf-hname');
    hname.textContent = name;
    info.appendChild(hname);

    var hmeta = _el('div', 'fxresf-hmeta');
    hmeta.textContent = catLabel + (city ? ' · ' + city : '');
    info.appendChild(hmeta);

    var hstatus = _el('div', 'fxresf-hstatus');
    var dot = _el('span', 'fxresf-hstatus-dot');
    dot.setAttribute('aria-hidden', 'true');
    hstatus.appendChild(dot);
    hstatus.appendChild(document.createTextNode('Profil référencé sur FIXEO'));
    info.appendChild(hstatus);

    strip.appendChild(info);

    /* Step indicator */
    var stepWrap = _el('div', 'fxresf-header-step');
    var stepLbl  = _el('div', 'fxresf-header-step-label');
    stepLbl.textContent = 'Étape';
    var stepNum2 = _el('div', 'fxresf-header-step-num');
    stepNum2.textContent = stepNum + ' / 2';
    stepWrap.appendChild(stepLbl);
    stepWrap.appendChild(stepNum2);
    strip.appendChild(stepWrap);

    return strip;
  }

  function _injectHeaderStrip(modal, artisan, stepNum) {
    var header = modal.querySelector('.fixeo-res-header');
    if (!header) return;

    /* Remove any existing strip before reinserting */
    var existing = header.querySelector('.fxresf-header-strip');
    if (existing) existing.remove();

    var strip = _buildHeaderStrip(artisan, stepNum);

    /* Prepend strip as first child */
    header.insertBefore(strip, header.firstChild);

    /* Mark header as enhanced (CSS uses this to hide legacy left content) */
    header.classList.add('fxresf-enhanced');
    /* Mark modal root as enhanced (CSS uses this to hide duplicate artisan card) */
    var modalRoot = header.closest('#fixeo-reservation-modal');
    if (modalRoot) modalRoot.classList.add('fxresf-enhanced');
  }

  /* ════════════════════════════════════════════════════════
     PRODUCT-TRUTH TEXT PATCHES
     All patches wrapped in try/catch — fail silently
  ════════════════════════════════════════════════════════ */
  function _patchTarificationChip(modal) {
    /* "Tarification encadrée Fixeo" → "Profil référencé sur FIXEO"
       Selector: .fxrva-coord-chip:nth-child(2) inside .fxrva-coord-chips */
    _try(function () {
      var chips = modal.querySelectorAll('.fxrva-coord-chips .fxrva-coord-chip');
      chips.forEach(function (chip) {
        if (chip.textContent.indexOf('Tarification') !== -1 ||
            chip.textContent.indexOf('encadr') !== -1) {
          chip.textContent = 'Profil référencé sur FIXEO';
          chip.setAttribute('aria-label', 'Profil référencé sur FIXEO');
        }
      });
    });
  }

  function _patchTotalLabel(modal) {
    /* "Total à payer" → "Total indicatif"
       Inside .fixeo-res-summary-total > span:first-child */
    _try(function () {
      var totalRow = modal.querySelector('.fixeo-res-summary-total');
      if (!totalRow) return;
      var span = totalRow.querySelector('span:first-child');
      if (span && span.textContent.indexOf('Total à payer') !== -1) {
        span.textContent = 'Total indicatif';
      }
    });
  }

  function _patchCODLabel(modal) {
    /* "Paiement à la livraison (Cash on Delivery)" → "Règlement espèces après intervention"
       Inside label[for="pay-method-cod"] > div > div:first-child */
    _try(function () {
      var codLabel = modal.querySelector('label[for="pay-method-cod"]');
      if (!codLabel) return;
      var textDiv = codLabel.querySelector('div > div:first-child');
      if (textDiv && (
        textDiv.textContent.indexOf('Cash on Delivery') !== -1 ||
        textDiv.textContent.indexOf('à la livraison') !== -1
      )) {
        textDiv.textContent = 'Règlement espèces après intervention';
      }
    });
  }

  function _injectTariffDisclaimer(modal) {
    /* Add honest disclaimer after .fixeo-res-summary-total */
    _try(function () {
      var summary = modal.querySelector('.fixeo-res-summary');
      if (!summary) return;
      /* Remove any existing disclaimer */
      var existing = summary.querySelector('.fxresf-tariff-disclaimer');
      if (existing) existing.remove();
      var disc = _el('div', 'fxresf-tariff-disclaimer');
      disc.textContent = 'Tarif définitif à confirmer avec l\'artisan avant l\'intervention. Paiement après intervention uniquement.';
      summary.appendChild(disc);
    });
  }

  function _injectCODNote(modal) {
    /* Inject ".fxresf-cod-note" after payment section */
    _try(function () {
      var paySection = modal.querySelector('.fixeo-res-payment-section');
      if (!paySection) return;
      if (paySection.nextElementSibling &&
          paySection.nextElementSibling.classList &&
          paySection.nextElementSibling.classList.contains('fxresf-cod-note')) return;
      /* Remove stale */
      var stale = modal.querySelector('.fxresf-cod-note');
      if (stale) stale.remove();
      var note = _el('div', 'fxresf-cod-note');
      note.textContent = 'Aucun paiement maintenant. Le règlement s\'effectue après l\'intervention.';
      paySection.parentNode.insertBefore(note, paySection.nextSibling);
    });
  }

  /* ════════════════════════════════════════════════════════
     ACCESSIBILITY ATTRIBUTE ENHANCEMENTS
     Adds only — never replaces existing attributes
  ════════════════════════════════════════════════════════ */
  function _enhanceAccessibility(modal) {
    _try(function () {
      /* Error element: add role="alert" and aria-live if missing */
      var errEl = modal.querySelector('#res-error');
      if (errEl) {
        if (!errEl.getAttribute('role'))       errEl.setAttribute('role', 'alert');
        if (!errEl.getAttribute('aria-live'))  errEl.setAttribute('aria-live', 'polite');
        if (!errEl.getAttribute('aria-atomic'))errEl.setAttribute('aria-atomic', 'true');
      }

      /* Service pills: add aria-checked */
      var pills = modal.querySelectorAll('#res-svc-pills .fixeo-res-slot[data-svc]');
      pills.forEach(function (pill) {
        if (!pill.getAttribute('role')) pill.setAttribute('role', 'radio');
        var isActive = pill.classList.contains('active');
        pill.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });

      /* Time slots: add aria-pressed */
      var slots = modal.querySelectorAll('#res-slot-grid .fixeo-res-slot');
      slots.forEach(function (slot) {
        if (!slot.getAttribute('role')) slot.setAttribute('role', 'button');
        var isActive = slot.classList.contains('active');
        slot.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      /* CMI: aria-disabled */
      var cmiLabel = modal.querySelector('label[for="pay-method-cmi"]');
      if (cmiLabel && !cmiLabel.getAttribute('aria-disabled')) {
        cmiLabel.setAttribute('aria-disabled', 'true');
      }
      var cmiInput = modal.querySelector('#pay-method-cmi');
      if (cmiInput && !cmiInput.getAttribute('aria-disabled')) {
        cmiInput.setAttribute('aria-disabled', 'true');
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     STEP 1 ENHANCEMENT
  ════════════════════════════════════════════════════════ */
  function _enhanceStep1(modal) {
    if (modal.dataset[STEP1_KEY]) return;
    modal.dataset[STEP1_KEY] = '1';

    var artisan = _readArtisanFromDOM(modal);
    if (artisan && artisan.name) {
      _injectHeaderStrip(modal, artisan, 1);
    }

    _patchTarificationChip(modal);
    _enhanceAccessibility(modal);
  }

  /* ════════════════════════════════════════════════════════
     STEP 2 ENHANCEMENT
  ════════════════════════════════════════════════════════ */
  function _enhanceStep2(modal) {
    if (modal.dataset[STEP2_KEY]) return;
    modal.dataset[STEP2_KEY] = '1';

    /* Re-read artisan — same session */
    var artisan = _readArtisanFromDOM(modal);
    if (artisan && artisan.name) {
      _injectHeaderStrip(modal, artisan, 2);
    }

    _patchTotalLabel(modal);
    _patchCODLabel(modal);
    _injectTariffDisclaimer(modal);
    _injectCODNote(modal);
    _enhanceAccessibility(modal);
  }

  /* ════════════════════════════════════════════════════════
     STEP DETECTION
     Step 1: has #res-step1-cta or #res-svc-pills
     Step 2: has .fixeo-res-summary-total or .fixeo-res-actions
  ════════════════════════════════════════════════════════ */
  function _detectStep(modal) {
    if (modal.querySelector('.fixeo-res-summary-total') ||
        modal.querySelector('.fixeo-res-payment-section')) {
      return 2;
    }
    if (modal.querySelector('#res-step1-cta') ||
        modal.querySelector('#res-svc-pills') ||
        modal.querySelector('#res-address')) {
      return 1;
    }
    return 0;
  }

  /* ════════════════════════════════════════════════════════
     MAIN ENHANCE DISPATCH
  ════════════════════════════════════════════════════════ */
  function _enhance(modal) {
    /* Reset step sentinels on each new render cycle */
    delete modal.dataset[STEP1_KEY];
    delete modal.dataset[STEP2_KEY];
    /* Remove any existing header strips (re-render) */
    _try(function () {
      var strip = modal.querySelector('.fxresf-header-strip');
      if (strip) strip.remove();
      var hdr = modal.querySelector('.fixeo-res-header.fxresf-enhanced');
      if (hdr) hdr.classList.remove('fxresf-enhanced');
      /* Also clear modal-root enhanced flag — re-set after strip injected */
      modal.classList.remove('fxresf-enhanced');
    });

    var step = _detectStep(modal);
    if (step === 1) {
      _enhanceStep1(modal);
    } else if (step === 2) {
      _enhanceStep2(modal);
    }
  }

  /* Debounce via microtask — one per animation frame */
  function _scheduledEnhance(modal) {
    if (_pendingMicrotask) return;
    _pendingMicrotask = true;
    queueMicrotask(function () {
      _pendingMicrotask = false;
      if (!modal || !document.getElementById(MODAL_ID)) return;
      var isOpen = modal.classList.contains('open') ||
                   modal.style.display === 'block'  ||
                   modal.style.display === 'flex'   ||
                   (modal.offsetParent !== null && modal.style.display !== 'none');
      if (isOpen) {
        _enhance(modal);
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     MUTATION OBSERVER — scoped to #fixeo-reservation-modal ONLY
  ════════════════════════════════════════════════════════ */
  function _mountObserver(modal) {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }

    _observer = new MutationObserver(function (mutations) {
      /* Only respond to childList on modal root (re-render) */
      var needsEnhance = mutations.some(function (m) {
        return m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0);
      });
      if (needsEnhance) {
        _scheduledEnhance(modal);
      }
    });

    _observer.observe(modal, {
      childList: true,
      subtree: false   /* only direct children — reservation.js replaces modal.innerHTML */
    });
  }

  /* ════════════════════════════════════════════════════════
     BODY CLASS OBSERVER — detects modal open/close
     Watches body.fixeo-booking-modal-open add/remove
  ════════════════════════════════════════════════════════ */
  function _mountBodyObserver() {
    if (_bodyObserver) {
      _bodyObserver.disconnect();
      _bodyObserver = null;
    }

    _bodyObserver = new MutationObserver(function () {
      var isOpen = document.body.classList.contains('fixeo-booking-modal-open');
      var modal  = document.getElementById(MODAL_ID);
      if (!modal) return;

      if (isOpen) {
        /* Modal opened or reopened */
        if (!_observer) _mountObserver(modal);
        _scheduledEnhance(modal);
      } else {
        /* Modal closed — disconnect inner observer, reset sentinels */
        if (_observer) {
          _observer.disconnect();
          _observer = null;
        }
        delete modal.dataset[STEP1_KEY];
        delete modal.dataset[STEP2_KEY];
        _try(function () {
          var strip = modal.querySelector('.fxresf-header-strip');
          if (strip) strip.remove();
          var hdr = modal.querySelector('.fixeo-res-header.fxresf-enhanced');
          if (hdr) hdr.classList.remove('fxresf-enhanced');
          modal.classList.remove('fxresf-enhanced');
        });
      }
    });

    _bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /* ════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════ */
  function _init() {
    _mountBodyObserver();

    /* If modal is already open on init (e.g. hot reload) */
    if (document.body.classList.contains('fixeo-booking-modal-open')) {
      var modal = document.getElementById(MODAL_ID);
      if (modal) {
        _mountObserver(modal);
        _scheduledEnhance(modal);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init, { once: true });
  } else {
    _init();
  }

})(window, document);
