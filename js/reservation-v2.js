/* ============================================================
   FIXEO — RESERVATION EXPERIENCE V2
   Pure additive enhancement layer.
   Strategy: MutationObserver on #fixeo-reservation-modal.
   Zero dependency on reservation.js internals.
   Zero changes to IDs, submit logic, routing, or payload.
   Namespace: _fxRv2 / fxrv2-*
   ============================================================ */
(function () {
  'use strict';

  if (window._fxRv2Loaded) return;
  window._fxRv2Loaded = true;

  /* ── CONFIG ──────────────────────────────────────────────── */
  var MODAL_ID = 'fixeo-reservation-modal';

  /* Stepper labels — emotional guided progression */
  var STEP_LABELS = {
    1: { dot: '1', label: 'Votre intervention' },
    2: { dot: '2', label: 'Votre disponibilit\u00e9' },
    3: { dot: '\u2713', label: 'Estimation' },
    4: { dot: '\u2713', label: 'Confirmation' },
  };

  /* Time slot helper texts — adaptive & human */
  var SLOT_HINTS = {
    matin:     { text: 'Plus disponibles le matin.', active: false },
    apresmidi: { text: 'Bon \u00e9quilibre disponibilit\u00e9.', active: false },
    soir:      { text: 'Disponibilit\u00e9 variable.', active: false },
  };

  /* Market trust pills */
  var TRUST_PILLS = [
    { icon: '\u25A3', text: 'Fixeo aide \u00e0 \u00e9viter les prix excessifs' },
    { icon: '\u25CE', text: 'Estimation bas\u00e9e sur le march\u00e9 local' },
    { icon: '\u25CF', text: 'Aucun paiement avant intervention' },
  ];

  /* CTA copy for step 1 — safe & progressive */
  var CTA_NORMAL  = 'Voir mon estimation finale \u2192';
  var CTA_URGENT  = '\u26A1 Trouver un artisan maintenant';
  var CTA_EXPRESS = '\uD83D\uDE80 Confirm\u00e9 \u2014 Voir r\u00e9capitulatif \u2192';

  /* Stepper copy */
  var STEPPER_STEP1 = 'Votre intervention';
  var STEPPER_STEP2 = 'R\u00e9capitulatif';

  /* ── HELPERS ─────────────────────────────────────────────── */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function modal() { return document.getElementById(MODAL_ID); }

  function isUrgent() {
    var m = modal();
    if (!m) return false;
    /* Detect urgent by presence of urgent CTA text or express banner content */
    var cta = qs('#res-step1-cta', m);
    if (cta && cta.textContent.indexOf('artisan maintenant') !== -1) return true;
    /* Also detect via hidden service + no slot grid */
    var slotGrid = qs('#res-slot-grid', m);
    var svcInput = qs('#res-service', m);
    if (svcInput && !slotGrid && !qs('#res-svc-pills', m)) return true;
    return false;
  }

  function isStep2() {
    var m = modal();
    if (!m) return false;
    return !!qs('.fixeo-res-summary', m);
  }

  /* ── UPGRADE STEPPER ─────────────────────────────────────── */
  function upgradeStepLabels(m) {
    /* Step 1 label */
    var labels = qsa('.fixeo-res-step-label', m);
    if (labels.length >= 1) {
      labels[0].textContent = STEPPER_STEP1;
    }
    if (labels.length >= 2) {
      labels[1].textContent = STEPPER_STEP2;
    }
  }

  /* ── INJECT CHECKMARKS ON SERVICE PILLS ─────────────────── */
  function injectServiceCheckmarks(m) {
    var pills = qsa('#res-svc-pills .fixeo-res-slot', m);
    pills.forEach(function (pill) {
      if (pill.querySelector('.fxrv2-check')) return; /* already injected */
      var chk = document.createElement('span');
      chk.className = 'fxrv2-check';
      chk.setAttribute('aria-hidden', 'true');
      chk.textContent = '\u2713'; /* ✓ */
      pill.appendChild(chk);
    });
  }

  /* ── INJECT SLOT HINTS ───────────────────────────────────── */
  function injectSlotHints(m) {
    var slotGrid = qs('#res-slot-grid', m);
    if (!slotGrid) return;
    var slots = qsa('.fixeo-res-slot:not(.slot-booked)', slotGrid);
    var slotMap = { matin: 0, apresmidi: 1, soir: 2 };
    slots.forEach(function (slot) {
      var val = slot.getAttribute('data-slot');
      if (!val || !SLOT_HINTS[val]) return;
      if (slot.querySelector('.fxrv2-slot-hint')) return; /* already injected */
      var hint = document.createElement('span');
      hint.className = 'fxrv2-slot-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = SLOT_HINTS[val].text;
      /* Check if currently active */
      if (slot.classList.contains('active')) {
        hint.classList.add('fxrv2-hint-active');
      }
      slot.appendChild(hint);
    });
    /* Delegate active state hint update */
    slotGrid.addEventListener('click', function (e) {
      var slotEl = e.target.closest('.fixeo-res-slot');
      if (!slotEl) return;
      qsa('.fxrv2-slot-hint', slotGrid).forEach(function (h) {
        h.classList.remove('fxrv2-hint-active');
      });
      var myHint = qs('.fxrv2-slot-hint', slotEl);
      if (myHint) myHint.classList.add('fxrv2-hint-active');
    });
  }

  /* ── UPGRADE ESTIMATION BLOCK ────────────────────────────── */
  /*
   * V2-C5A: Moved estimation to TOP of form — above service/date/address fields.
   * Goal: price transparency is the FIRST conversion signal the user sees.
   * New position: between .fixeo-res-artisan-card and .fixeo-res-form.
   * Wording updated: "Choisissez un service pour voir le prix indicatif" +
   *   "Prix indicatif basé sur des interventions similaires dans votre ville."
   *   "Le prix final est confirmé avec l'artisan avant toute intervention."
   */
  function upgradeEstimation(m) {
    var tarifEl = qs('#res-tarif-estime', m);
    if (!tarifEl || tarifEl.dataset.rv2) return;
    tarifEl.dataset.rv2 = '1';

    /* Skip urgent mode — keep as-is */
    if (isUrgent()) return;

    /* Build premium estimation block */
    var block = document.createElement('div');
    block.className = 'fxrv2-estimation';
    block.dataset.rv2est = '1';

    block.innerHTML =
      '<div class="fxrv2-est-header">' +
        '<div class="fxrv2-est-brain" aria-hidden="true">\u25A3</div>' +
        '<div>' +
          '<div class="fxrv2-est-title">Estimation Fixeo</div>' +
          /* V2-C5A: updated initial text — more instructional */
          '<div class="fxrv2-est-subtitle">Choisissez un service pour voir le prix indicatif</div>' +
        '</div>' +
      '</div>' +
      '<div class="fxrv2-est-price" id="fxrv2-price-row" style="display:none">' +
        '<span class="fxrv2-est-price-label">Estimation\u00a0:</span>' +
        '<span class="fxrv2-est-price-range" id="fxrv2-price-range"></span>' +
        '<span class="fxrv2-est-price-unit">MAD</span>' +
      '</div>' +
      '<div class="fxrv2-est-market">' +
        '<span class="fxrv2-est-market-icon" aria-hidden="true">\u25CE</span>' +
        /* V2-C5A: honest indicative pricing language */
        '<span id="fxrv2-price-rec">Bas\u00e9 sur les interventions similaires dans votre ville</span>' +
      '</div>' +
      '<div class="fxrv2-est-pay">' +
        '<span style="color:rgba(32,201,151,0.55)" aria-hidden="true">\u25CF</span>' +
        /* V2-C5A: short form only — full indicative text lives in #fxrv2-price-rec */
        'Aucun paiement maintenant.' +
      '</div>';

    /* V2-C5A: Insert ABOVE the form (before .fixeo-res-form), not inside it.
     * This makes price the first thing the user sees after the artisan card.
     * Fallback: if form not found, insert before tarifEl (original behavior). */
    var resForm = qs('.fixeo-res-form', m);
    var insertTarget = resForm || tarifEl;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(block, insertTarget);
    }

    /* Hide original tarif element (stays in DOM for JS hooks) */
    tarifEl.style.display = 'none';

    /* Watch for service changes via existing DOM updates */
    _watchEstimationUpdates(m, block);
  }

  /* SERVICE_PRICING fallback — mirrors reservation.js SERVICE_PRICING map.
     Used when FixeoPricing is not loaded (artisan-profile.html). */
  var SVC_PRICING_FB = {
    /* Plomberie */
    'Fuite d\u2019eau \u2014 r\u00e9paration':  { from: 150, to: 300 },
    'Urgence plomberie':                         { from: 200, to: 400 },
    'Installation sanitaire':                    { from: 250, to: 600 },
    'R\u00e9paration chauffe-eau':               { from: 200, to: 500 },
    'Salle de bain compl\u00e8te':               { from: 1500, to: 5000 },
    /* Electricite */
    'D\u00e9pannage \u00e9lectrique':             { from: 150, to: 350 },
    'Installation tableau':                      { from: 300, to: 800 },
    'Prise / interrupteur':                      { from: 80, to: 200 },
    /* Peinture */
    'Peinture int\u00e9rieure':                  { from: 20, to: 60 },
    'Peinture ext\u00e9rieure':                  { from: 25, to: 80 },
    /* Nettoyage */
    'Nettoyage domicile':                        { from: 150, to: 400 },
    /* Climatisation */
    'Installation climatiseur':                  { from: 400, to: 900 },
    'Maintenance / nettoyage clim':              { from: 200, to: 500 },
    /* Menuiserie */
    'R\u00e9paration porte / fen\u00eatre':      { from: 150, to: 400 },
    /* Ma\u00e7onnerie */
    'R\u00e9paration mur / plafond':             { from: 200, to: 600 },
    /* Serrurerie */
    'Ouverture de porte':                        { from: 150, to: 300 },
    /* Carrelage */
    'Pose carrelage':                            { from: 80, to: 180 },
    /* Toiture */
    'R\u00e9paration toiture':                   { from: 300, to: 800 },
  };

  /* Normalize service name for lookup — handles straight vs curly apostrophe,
     em dash vs hyphen, and smart quote variants */
  function _normSvcName(s) {
    return s
      .replace(/\u2019/g, '\u0027')  /* curly apostrophe → straight ' */
      .replace(/\u2018/g, '\u0027')  /* left single quote → straight ' */
      .replace(/\u2014/g, '-')       /* em dash → hyphen */
      .replace(/\u2013/g, '-')       /* en dash → hyphen */
      .trim();
  }

  /* Look up service price — try window.SERVICE_PRICING first, then fallback */
  function _getSvcPrice(svcName) {
    if (!svcName) return null;
    var norm = _normSvcName(svcName);
    var SP = window.SERVICE_PRICING || {};
    /* Try exact match */
    if (SP[svcName]) return SP[svcName];
    /* Try normalized match against SERVICE_PRICING */
    var spKey = Object.keys(SP).find(function (k) { return _normSvcName(k) === norm; });
    if (spKey) return SP[spKey];
    /* Try fallback map — exact */
    if (SVC_PRICING_FB[svcName]) return SVC_PRICING_FB[svcName];
    /* Try fallback map — normalized */
    var fbKey = Object.keys(SVC_PRICING_FB).find(function (k) { return _normSvcName(k) === norm; });
    if (fbKey) return SVC_PRICING_FB[fbKey];
    return null;
  }

  /* Update the V2 estimation block with a given service name */
  function _updateEstimationBlock(block, svcName) {
    if (!block) return;
    var priceRow  = qs('#fxrv2-price-row', block);
    var priceRangeEl = qs('#fxrv2-price-range', block);
    var priceRecEl   = qs('#fxrv2-price-rec', block);
    var subtitle     = qs('.fxrv2-est-subtitle', block);

    var sp = svcName ? _getSvcPrice(svcName) : null;
    if (sp && sp.from && sp.to && priceRangeEl && priceRow) {
      /* V2-C5A: show range as "N–M MAD — estimation indicative" */
      priceRangeEl.textContent = sp.from + '\u2013' + sp.to + '\u00a0MAD \u2014 estimation indicative';
      priceRow.style.display = '';
      if (subtitle) subtitle.textContent = 'Prix indicatif bas\u00e9 sur des interventions similaires'; /* V2-C5A */
      if (priceRecEl) {
        /* V2-C5A: market context line — "Le prix final" shown separately in fxrv2-est-pay */
        priceRecEl.innerHTML = 'Prix indicatif bas\u00e9 sur des interventions similaires dans votre ville';
      }
    } else {
      if (priceRow) priceRow.style.display = 'none';
      if (subtitle) subtitle.textContent = 'Choisissez un service pour voir le prix indicatif'; /* V2-C5A */
      if (priceRecEl) priceRecEl.innerHTML = 'Basé sur les interventions similaires dans votre ville'; /* V2-C5A: neutral when no service selected */
    }
  }

  /* Watch [data-res-svc-marche] for updates (when FixeoPricing IS loaded),
     AND hook service pill clicks directly for immediate response */
  function _watchEstimationUpdates(m, block) {
    /* Strategy 1: MutationObserver on existing hint elements (results.html, index.html) */
    var svcMarcheEl = qs('[data-res-svc-marche]', m);
    var svcRecEl    = qs('[data-res-svc-rec]', m);

    if (svcMarcheEl && svcRecEl) {
      var updateFn = function () {
        var marcheTxt = svcMarcheEl.textContent || '';
        var rangeMatch = marcheTxt.match(/(\d+[\u2013\-]\d+) MAD/);
        if (rangeMatch) {
          var priceRangeEl = qs('#fxrv2-price-range', block);
          var priceRow = qs('#fxrv2-price-row', block);
          if (priceRangeEl) priceRangeEl.textContent = rangeMatch[1] + '\u00a0MAD \u2014 estimation indicative'; /* V2-C5A */
          if (priceRow) priceRow.style.display = '';
          var subtitle = qs('.fxrv2-est-subtitle', block);
          if (subtitle) subtitle.textContent = 'Prix indicatif bas\u00e9 sur des interventions similaires'; /* V2-C5A */
        }
        var priceRecEl = qs('#fxrv2-price-rec', block);
        if (priceRecEl) {
          /* V2-C5A: market context line only — no duplication with fxrv2-est-pay */
          priceRecEl.innerHTML = 'Prix indicatif bas\u00e9 sur des interventions similaires dans votre ville';
        }
      };
      var obs = new MutationObserver(updateFn);
      obs.observe(svcMarcheEl, { childList: true, characterData: true, subtree: true });
      obs.observe(svcRecEl,    { childList: true, characterData: true, subtree: true });
    }

    /* Strategy 2: Delegate pill click on the modal body — bubbles up from pills.
       _onServiceChange() is a closure call inside _initPills so we can\u2019t wrap it.
       Instead: catch the click at modal level, after _initPills already fired. */
    m.addEventListener('click', function (e) {
      var pill = e.target.closest('#res-svc-pills [data-svc]');
      if (!pill) return;
      /* Let _initPills handler run first (synchronous), then update estimation */
      requestAnimationFrame(function () {
        var mo = document.getElementById('fixeo-reservation-modal');
        var blk = mo ? qs('.fxrv2-estimation', mo) : null;
        if (blk) _updateEstimationBlock(blk, pill.getAttribute('data-svc'));
      });
    });
  }

  /* ── INJECT TRUST PILLS ──────────────────────────────────── */
  function injectTrustPills(m) {
    /* Only on step 1 normal mode, not urgent, not step 2 */
    if (isUrgent()) return;
    if (isStep2()) return;
    var form = qs('#fixeo-res-form', m);
    if (!form) return;

    /* Already injected? */
    if (qs('.fxrv2-trust-mini', m)) return;

    var wrap = document.createElement('div');
    wrap.className = 'fxrv2-trust-mini';
    wrap.setAttribute('aria-hidden', 'true');

    TRUST_PILLS.forEach(function (p) {
      var pill = document.createElement('div');
      pill.className = 'fxrv2-trust-pill';
      pill.innerHTML =
        '<span class="fxrv2-trust-pill-icon">' + p.icon + '</span>' +
        '<span>' + p.text + '</span>';
      wrap.appendChild(pill);
    });

    /* V2-C5A: Insert trust pills before .fxrv2-estimation block (which is now above the form).
     * Fallback: before .fixeo-res-form or before #res-tarif-estime. */
    var estBlock = qs('.fxrv2-estimation', m);
    var resForm  = qs('.fixeo-res-form', m);
    var tarifEl  = qs('#res-tarif-estime', m);
    var insertBefore = estBlock || resForm || tarifEl;
    if (insertBefore && insertBefore.parentNode) {
      insertBefore.parentNode.insertBefore(wrap, insertBefore);
    }
  }

  /* ── INJECT DATE HELPER ──────────────────────────────────── */
  function injectDateHelper(m) {
    var dateInput = qs('#res-date', m);
    if (!dateInput) return;
    /* Already done? */
    if (dateInput.parentNode.classList.contains('fxrv2-date-wrap')) return;

    /* Wrap + add hint */
    var existing = dateInput.parentNode;
    var wrapper = document.createElement('div');
    wrapper.className = 'fxrv2-date-wrap';
    existing.insertBefore(wrapper, dateInput);
    wrapper.appendChild(dateInput);

    var hint = document.createElement('span');
    hint.className = 'fxrv2-date-hint';
    hint.textContent = 'Intervention planifi\u00e9e selon votre disponibilit\u00e9.';
    wrapper.appendChild(hint);
  }

  /* ── INJECT ADDRESS HELPER ───────────────────────────────── */
  function injectAddressHelper(m) {
    var addrInput = qs('#res-address', m);
    if (!addrInput) return;
    if (addrInput.nextElementSibling && addrInput.nextElementSibling.classList.contains('fxrv2-addr-hint')) return;

    var hint = document.createElement('span');
    hint.className = 'fxrv2-addr-hint';
    hint.textContent = 'Permet aux artisans de pr\u00e9parer leur d\u00e9placement.';
    addrInput.parentNode.insertBefore(hint, addrInput.nextSibling);
  }

  /* ── UPGRADE CTA TEXT (safe — non-urgent step1 only) ─────── */
  function upgradeCTAText(m) {
    if (isUrgent()) return; /* urgent CTA text is correct as-is */
    if (isStep2())  return; /* no step1 CTA on step 2 */
    var cta = qs('#res-step1-cta', m);
    if (!cta) return;
    /* Only replace if it still says original generic text */
    var txt = (cta.textContent || '').trim();
    /* Replace "Voir le prix final en 1 clic →" with V2 copy */
    if (txt.indexOf('Voir le prix final') !== -1 || txt.indexOf('1 clic') !== -1) {
      cta.textContent = CTA_NORMAL;
    }
  }

  /* ── INJECT CTA SUB TEXT ─────────────────────────────────── */
  function injectCTASub(m) {
    if (isUrgent()) return;
    if (isStep2())  return;
    var cta = qs('#res-step1-cta', m);
    if (!cta) return;
    if (cta.nextElementSibling && cta.nextElementSibling.classList.contains('fxrv2-cta-sub')) return;
    /* Remove any existing raw inline sub texts */
    var sibling = cta.nextElementSibling;
    while (sibling && sibling.tagName === 'DIV' && !sibling.id) {
      /* The original has 2 raw div subs — keep them by repurposing, or replace */
      var txt = sibling.textContent || '';
      if (txt.indexOf('engagement') !== -1 || txt.indexOf('disponibilit') !== -1) {
        sibling.style.display = 'none'; /* hide original; replace with V2 sub */
      }
      sibling = sibling.nextElementSibling;
    }

    var sub = document.createElement('div');
    sub.className = 'fxrv2-cta-sub';
    sub.innerHTML = '<strong>Sans engagement</strong> \u2014 paiement uniquement apr\u00e8s intervention';
    cta.parentNode.insertBefore(sub, cta.nextSibling);
  }

  /* ── STEP 2: upgrade recap labels ───────────────────────── */
  function upgradeStep2Labels(m) {
    if (!isStep2()) return;
    var labels = qsa('.fixeo-res-summary-label', m);
    /* Already upgraded? */
    if (labels.length && labels[0].dataset.rv2) return;

    /* Map existing label texts to uppercase equivalents (zero logic change) */
    labels.forEach(function (label) {
      label.dataset.rv2 = '1';
      /* already uppercase via CSS — just mark done */
    });

    /* Upgrade the "confirm" button copy — progressive feel */
    var payBtn = qs('.fixeo-res-btn-pay', m);
    if (payBtn) {
      var txt = (payBtn.textContent || '').trim();
      if (txt.indexOf('Confirmer ma r\u00e9servation') !== -1) {
        /* Extract the price part and keep it */
        var priceMatch = txt.match(/(\d[\d\s.,]+MAD)/);
        if (priceMatch) {
          payBtn.textContent = 'Confirmer l\u2019intervention \u2192 ' + priceMatch[1];
        }
      }
    }

    /* Upgrade "← Modifier" button */
    var backBtn = qs('.fixeo-res-btn-secondary', m);
    if (backBtn && backBtn.textContent.trim() === '\u2190 Modifier') {
      backBtn.textContent = '\u2190 Modifier ma demande';
    }
  }

  /* ── UPGRADE HEADER SUB ──────────────────────────────────── */
  function upgradeHeaderSub(m) {
    var sub = qs('.fixeo-res-header-sub', m);
    if (!sub || sub.dataset.rv2) return;
    sub.dataset.rv2 = '1';
    var txt = sub.textContent || '';

    /* Step 1 */
    if (txt.indexOf('\u00c9tape 1') !== -1 || txt.indexOf('tape 1') !== -1) {
      sub.textContent = 'Configurez votre intervention';
    }
    /* Step 2 */
    if (txt.indexOf('\u00c9tape 2') !== -1 || txt.indexOf('tape 2') !== -1) {
      sub.textContent = 'V\u00e9rifiez et confirmez votre r\u00e9servation';
    }
  }

  /* ── UPGRADE HEADER TITLE ────────────────────────────────── */
  function upgradeHeaderTitle(m) {
    var title = qs('.fixeo-res-header-title', m);
    if (!title || title.dataset.rv2) return;
    title.dataset.rv2 = '1';
    var txt = (title.textContent || '').trim();
    /* Remove any leading emoji/symbol that Cairo can\u2019t render (multi-codepoint emoji) */
    /* Replace emoji prefix patterns: 📅 📋 🚀 ⚡ 📍 */
    var cleaned = txt
      .replace(/^[\uD800-\uDFFF]{2}[\s]*/u, '') /* surrogate pair emoji */
      .replace(/^\u26A1\s*/, '')                  /* ⚡ */
      .replace(/^\uD83D[\uDCC5\uDCCB]\s*/u, '')   /* 📅 📋 */
      .replace(/^\uD83D\uDE80\s*/u, '')            /* 🚀 */
      .trim();
    if (cleaned && cleaned !== txt) {
      title.textContent = cleaned;
    }
  }

  /* ── FAKE CONTENT SUPPRESSION ────────────────────────────── */
  function suppressFakeContent(m) {
    /* Suppress "+23 réservations aujourd'hui" — fake counter */
    var body = qs('.fixeo-res-body', m);
    if (!body) return;
    var allDivs = qsa('div', body);
    allDivs.forEach(function (el) {
      if (el.id || el.className) return; /* skip named elements */
      var txt = el.textContent || '';
      if (txt.indexOf('r\u00e9servations') !== -1 && txt.indexOf('aujourd') !== -1 && el.children.length === 0) {
        el.style.display = 'none';
      }
      /* Suppress "⚡ Forte demande aujourd'hui — disponibilité limitée" — fake scarcity */
      if (txt.indexOf('Forte demande') !== -1 && txt.indexOf('disponibilit\u00e9 limit\u00e9e') !== -1 && el.children.length === 0) {
        el.style.display = 'none';
      }
    });
  }

  /* ── REMOVE FAKE "✔ +23 réservations" inline text ─────────── */
  /* This is rendered as raw text in .fixeo-res-body so we target it via TreeWalker */
  function suppressFakeTextNodes(m) {
    var body = qs('.fixeo-res-body', m);
    if (!body) return;
    /* Suppress ANY div (with or without style/class) that contains fake metrics
       and has zero element children (pure text leaf node) */
    body.querySelectorAll('div').forEach(function (el) {
      if (el.children.length > 0) return; /* skip containers */
      var txt = el.textContent || '';
      var isFake = (
        (txt.indexOf('+23') !== -1 && txt.indexOf('r\u00e9servations') !== -1) ||
        (txt.indexOf('Forte demande') !== -1 && txt.indexOf('disponibilit') !== -1)
      );
      if (isFake) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  /* ── MAIN UPGRADE FUNCTION ───────────────────────────────── */
  function upgradeModal(m) {
    if (!m || m.dataset.rv2 === 'upgraded') return;

    /* Run all upgrade steps */
    suppressFakeContent(m);
    suppressFakeTextNodes(m);
    upgradeStepLabels(m);
    upgradeHeaderTitle(m);
    upgradeHeaderSub(m);
    injectServiceCheckmarks(m);
    injectSlotHints(m);
    upgradeEstimation(m);
    injectTrustPills(m);
    injectDateHelper(m);
    injectAddressHelper(m);
    upgradeCTAText(m);
    injectCTASub(m);
    upgradeStep2Labels(m);

    m.dataset.rv2 = 'upgraded';
  }

  /* ── RE-UPGRADE ON STEP TRANSITION ──────────────────────── */
  /* When reservation.js calls render() (step1→2 or step2→1), innerHTML changes.
     We need to re-run after each render. */
  function reUpgradeAfterRender(m) {
    /* Clear the rv2 stamp so upgradeModal runs again */
    delete m.dataset.rv2;
    /* Defer one frame for render to complete */
    requestAnimationFrame(function () {
      upgradeModal(m);
    });
  }

  /* ── MUTATIONOBSERVER: watch modal open + inner renders ──── */
  function initObserver() {
    var m = document.getElementById(MODAL_ID);
    if (!m) {
      /* Modal not yet in DOM — wait for it */
      var bodyObs = new MutationObserver(function (mutations, obs) {
        var found = document.getElementById(MODAL_ID);
        if (found) {
          obs.disconnect();
          attachToModal(found);
        }
      });
      bodyObs.observe(document.body, { childList: true, subtree: false });
      return;
    }
    attachToModal(m);
  }

  function attachToModal(m) {
    /* Watch for .open class toggle (modal open) + innerHTML changes (step transitions) */
    var lastInner = '';

    var obs = new MutationObserver(function (mutations) {
      var mo = document.getElementById(MODAL_ID);
      if (!mo) return;

      /* Check if modal became visible */
      var isOpen = mo.classList.contains('open');
      if (!isOpen) return;

      /* Check if inner HTML changed (step render) */
      var inner = mo.innerHTML;
      if (inner === lastInner) return;
      lastInner = inner;

      /* Re-run upgrade after render */
      requestAnimationFrame(function () {
        upgradeModal(mo);
      });
    });

    obs.observe(m, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: false,
    });

    /* Also watch innerHTML for step transitions via childList on dialog */
    var bodyObs = new MutationObserver(function () {
      var mo = document.getElementById(MODAL_ID);
      if (!mo || !mo.classList.contains('open')) return;
      requestAnimationFrame(function () {
        upgradeModal(mo);
      });
    });

    bodyObs.observe(m, { childList: true });
  }

  /* ── HOOK FixeoReservation.open/close for instant upgrade ── */
  /* Strategy: wrap open() so we run upgradeModal right after render.
     This is more reliable than MutationObserver for innerHTML assignments. */
  function hookFixeoReservation() {
    if (!window.FixeoReservation) return false;
    if (window.FixeoReservation._rv2Hooked) return true;
    window.FixeoReservation._rv2Hooked = true;

    var _origOpen = window.FixeoReservation.open;
    var _origGoStep1 = window.FixeoReservation._goToStep1;
    var _origSubmitStep1 = window.FixeoReservation._submitStep1;

    /* Wrap open() */
    window.FixeoReservation.open = function () {
      _origOpen.apply(this, arguments);
      /* Defer 2 frames for render to complete */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var m = document.getElementById(MODAL_ID);
          if (m && m.classList.contains('open')) {
            delete m.dataset.rv2; /* clear stamp for fresh run */
            upgradeModal(m);
          }
        });
      });
    };

    /* Wrap _goToStep1() — step 2→1 transition */
    window.FixeoReservation._goToStep1 = function () {
      _origGoStep1.apply(this, arguments);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var m = document.getElementById(MODAL_ID);
          if (m) { delete m.dataset.rv2; upgradeModal(m); }
        });
      });
    };

    /* Wrap _submitStep1() — step 1→2 transition */
    window.FixeoReservation._submitStep1 = function () {
      _origSubmitStep1.apply(this, arguments);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var m = document.getElementById(MODAL_ID);
          if (m && m.classList.contains('open')) {
            delete m.dataset.rv2; upgradeModal(m);
          }
        });
      });
    };

    return true;
  }

  /* ── INIT ────────────────────────────────────────────────── */
  function init() {
    /* Try to hook immediately */
    if (!hookFixeoReservation()) {
      /* FixeoReservation not ready — poll up to 5s */
      var attempts = 0;
      var pollInterval = setInterval(function () {
        attempts++;
        if (hookFixeoReservation() || attempts > 50) {
          clearInterval(pollInterval);
        }
      }, 100);
    }
    /* Also run MutationObserver as belt+suspenders */
    initObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
