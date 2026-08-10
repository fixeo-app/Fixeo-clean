/*!
 * js/fixeo-estimator-v2.js — FIXEO Estimator V2 Production Flagship UI
 * Phase 7C.9B — Production Dormant Integration
 *
 * Feature-gated: only activates when FixeoEstimatorConfig.estimatorV2Enabled === true.
 * Uses window.FixeoEstimatorAPI for all orchestrator calls (no direct engine require).
 * Stores ONLY opaque tokens in sessionStorage — never raw price amounts.
 */
(function() {
  'use strict';

  if (window._fxEstV2Loaded) return;

  // ── Public API stub — always defined so callers never get undefined ──
  // Overwritten below when flag is ON or preview override is active.
  window.FixeoEstimatorV2 = {
    open:   function() { return Promise.resolve({ accepted: false, reason: 'disabled' }); },
    close:  function() {},
    isOpen: function() { return false; },
  };

  // ── Preview-only override (non-production hostnames only) ──────────
  // Usage: window._FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ = true (in devtools on preview URL)
  // Production hosts (fixeo.ma, www.fixeo.ma) ALWAYS ignore this override.
  var _isPreviewHost = (typeof location !== 'undefined') &&
    location.hostname !== 'fixeo.ma' &&
    location.hostname !== 'www.fixeo.ma';
  var _previewOverride = _isPreviewHost &&
    (window._FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ === true);

  // ── Feature gate — DORMANT until 7C.9D activation ─────────────────
  if (!_previewOverride &&
      (!window.FixeoEstimatorConfig ||
       window.FixeoEstimatorConfig.estimatorV2Enabled !== true)) return;

  window._fxEstV2Loaded = true;

  // ─────────────────────────────────────────────────────────────────
  // RAFI State Machine
  // ─────────────────────────────────────────────────────────────────
  var RAFI_STATES = {
    idle:       { label: 'RAFI',          copy: 'Analyse de votre besoin' },
    analyzing:  { label: 'RAFI analyse',  copy: 'Identification de l\'intervention…' },
    identified: { label: 'RAFI',          copy: 'Intervention identifiée' },
    verifying:  { label: 'RAFI vérifie',  copy: 'Vérification du périmètre' },
    complete:   { label: 'RAFI',          copy: 'Prix FIXEO prêt' },
  };

  function setSphereState(sphereState) {
    var sphere = document.querySelector('.rafi-sphere');
    if (sphere) sphere.setAttribute('data-state', sphereState);
  }

  var _SPHERE_STATE_MAP = {
    idle: 'idle', analyzing: 'analyzing', verifying: 'verifying',
    identified: 'identified', complete: 'complete',
  };

  function setRAFIState(state) {
    var s = RAFI_STATES[state] || RAFI_STATES.idle;
    var markEl = document.getElementById('rafi-mark');
    var lineEl = document.getElementById('rafi-state-line');
    if (markEl) {
      markEl.textContent = s.label;
      markEl.classList.remove('rafi-pulse');
      void markEl.offsetWidth;
      markEl.classList.add('rafi-pulse');
      setTimeout(function() { markEl.classList.remove('rafi-pulse'); }, 300);
    }
    if (lineEl) {
      lineEl.style.opacity = '0';
      setTimeout(function() {
        lineEl.textContent = s.copy;
        lineEl.style.opacity = '1';
      }, 90);
    }
    setSphereState(_SPHERE_STATE_MAP[state] || 'idle');
  }

  // ─────────────────────────────────────────────────────────────────
  // CLIENT_LABELS — service display names
  // ─────────────────────────────────────────────────────────────────
  var CLIENT_LABELS = {
    'menuiserie.reglage_porte.sans_rabotage': { primary: 'Réglage de porte', secondary: 'Sans rabotage' },
    'menuiserie.reglage_porte.avec_rabotage': { primary: 'Réglage de porte', secondary: 'Avec rabotage' },
    'menuiserie.remplacement_charniere':      { primary: 'Remplacement de charnière', secondary: null },
    'plomberie.robinet_remplacement':         { primary: 'Remplacement de robinet', secondary: null },
    'plomberie.diagnostic':                   { primary: 'Diagnostic plomberie', secondary: null },
    'plomberie.fuite_simple':                 { primary: 'Réparation fuite', secondary: null },
    'electricite.diagnostic':                 { primary: 'Diagnostic électrique', secondary: null },
    'electricite.prise_remplacement':         { primary: 'Remplacement de prise', secondary: null },
    'electricite.interrupteur_remplacement.simple': { primary: 'Remplacement d\'interrupteur', secondary: null },
    'serrurerie.cylindre_remplacement.standard': { primary: 'Remplacement de cylindre', secondary: 'Standard' },
    'serrurerie.serrure_remplacement.standard': { primary: 'Remplacement de serrure', secondary: 'Standard' },
    'serrurerie.porte_claquee_ouverture':     { primary: 'Ouverture porte claquée', secondary: null },
    'nettoyage.grand_menage':                 { primary: 'Grand ménage', secondary: null },
    'nettoyage.menage_standard':              { primary: 'Ménage standard', secondary: null },
    'peinture.mur_interieur.all_in':          { primary: 'Peinture mur intérieur', secondary: 'Fournitures incluses' },
    'peinture.mur_interieur.labour_only':     { primary: 'Peinture mur intérieur', secondary: 'Main-d\'œuvre seulement' },
  };

  function resolveClientLabel(serviceCode) {
    var lbl = CLIENT_LABELS[serviceCode];
    if (lbl) return lbl;
    // Fallback: derive from service code
    var parts = (serviceCode || '').split('.');
    var primary = parts.slice(1).join(' ').replace(/_/g, ' ') || serviceCode || 'Intervention';
    return { primary: primary.charAt(0).toUpperCase() + primary.slice(1), secondary: null };
  }

  // ─────────────────────────────────────────────────────────────────
  // Prompt labels — question text
  // ─────────────────────────────────────────────────────────────────
  var PROMPT_LABELS = {
    'burning_smell':                  'Y a-t-il une odeur de brûlé ?',
    'scorch_marks':                   'Y a-t-il des traces de carbonisation ?',
    'active_moisture':                'Y a-t-il une fuite active en cours ?',
    'distributor_equipment_involved': 'L\'intervention concerne-t-elle le tableau électrique principal ?',
    'ddr_rcd_involved':               'L\'intervention concerne-t-elle un disjoncteur différentiel ou DDR ?',
    'multi_split':                    'S\'agit-il d\'un système multi-split ?',
    'security_door':                  'S\'agit-il d\'une porte blindée ou de sécurité ?',
    'lock_cylinder_involved':         'La serrure comporte-t-elle un cylindre à remplacer ?',
    'part_replacement_required':      'Une pièce doit-elle être remplacée ?',
    'worker_count':                   'Combien de prestataires souhaitez-vous ?',
    'workers_count':                  'Combien de prestataires souhaitez-vous ?',
    'hours':                          'Combien d\'heures d\'intervention ?',
    'hours_per_worker':               'Combien d\'heures par prestataire ?',
    'painted_m2':                     'Quelle est la surface à peindre (m²) ?',
    'frame_condition':                'Dans quel état est le cadre de porte ?',
    'leak_location_confirmed':        'La localisation de la fuite est-elle connue ?',
  };

  function promptFromKey(promptKey, questionId) {
    if (PROMPT_LABELS[promptKey]) return PROMPT_LABELS[promptKey];
    var base = questionId ? questionId.split('@')[0] : '';
    return PROMPT_LABELS[base] || questionId || 'Question de qualification';
  }

  function optionLabel(opt) {
    var labels = {
      SOUND: 'Bon état', COMPATIBLE: 'Compatible', MINOR_DAMAGE: 'Légères marques',
      ROTTED: 'Dégradé', STRUCTURALLY_DEFORMED: 'Déformé',
      true: 'Oui', false: 'Non',
    };
    return labels[opt] !== undefined ? labels[opt] : String(opt).replace(/_/g, ' ');
  }

  var METIER_LABELS = {
    menuiserie: 'Menuiserie', plomberie: 'Plomberie', electricite: 'Électricité',
    serrurerie: 'Serrurerie', climatisation: 'Climatisation', nettoyage: 'Nettoyage',
    peinture: 'Peinture', bricolage: 'Bricolage',
  };

  // ─────────────────────────────────────────────────────────────────
  // Entry context normalization
  // ─────────────────────────────────────────────────────────────────
  var _ALLOWED_ENTRY_FIELDS = ['source', 'metier_hint', 'service_hint', 'city', 'urgency', 'description'];

  function _normalizeEntryContext(ctx) {
    var out = {};
    if (!ctx || typeof ctx !== 'object') return out;
    _ALLOWED_ENTRY_FIELDS.forEach(function(k) {
      if (ctx[k] != null) out[k] = ctx[k];
    });
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────
  var STATE = {
    sessionToken: null,
    session: null,
    pendingAnswer: null,
    quantityValue: null,
    measurementValue: null,
    isSafetyActive: false,
    onClose: null,
  };

  // ─────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────
  function el(tag, cls, inner) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (inner != null) e.innerHTML = inner;
    return e;
  }

  function formatMAD(n) {
    if (n == null) return '—';
    return Math.round(n).toString() + ' MAD';
  }

  function trapFocus(container) {
    var focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    container.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
      if (e.key === 'Escape') { if (STATE.onClose) STATE.onClose(); }
    });
    first.focus();
  }

  function triggerIntelligenceLine() {
    var line = document.querySelector('.intelligence-line');
    if (!line) return;
    line.classList.remove('active');
    void line.offsetWidth;
    line.classList.add('active');
  }

  // ─────────────────────────────────────────────────────────────────
  // Renderers
  // ─────────────────────────────────────────────────────────────────

  function renderHeader() {
    var header = el('div', 'estimator-header');
    header.setAttribute('id', 'estimator-header');

    var intLine = el('div', 'intelligence-line');
    header.appendChild(intLine);

    var left = el('div', 'header-left');

    var sphereWrap = el('div', 'rafi-sphere-wrap');
    var sphere = el('div', 'rafi-sphere');
    sphere.setAttribute('data-state', 'idle');
    sphere.setAttribute('aria-hidden', 'true');
    sphere.appendChild(el('span', 'rafi-sphere-label', 'RAFI'));
    sphereWrap.appendChild(sphere);
    left.appendChild(sphereWrap);

    var rafiMark = el('span', 'rafi-indicator');
    rafiMark.setAttribute('id', 'rafi-mark');
    rafiMark.textContent = 'RAFI';
    rafiMark.style.display = 'none';
    left.appendChild(rafiMark);

    var headerText = el('div', 'header-text');
    headerText.appendChild(el('div', 'header-title', 'Estimation FIXEO'));
    var rafiStateLine = el('div', 'rafi-state');
    rafiStateLine.setAttribute('id', 'rafi-state-line');
    rafiStateLine.textContent = 'Analyse de votre besoin';
    headerText.appendChild(rafiStateLine);
    left.appendChild(headerText);
    header.appendChild(left);

    var closeBtn = el('button', 'modal-close');
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.setAttribute('id', 'modal-close');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', function() { if (STATE.onClose) STATE.onClose(); });
    header.appendChild(closeBtn);

    return header;
  }

  function renderProgress(activeStage) {
    var stages = ['BESOIN', 'PRECISIONS', 'RESULTAT'];
    var labels = { BESOIN: 'Métier', PRECISIONS: 'Périmètre', RESULTAT: 'Tarification' };
    var activeIdx = stages.indexOf(activeStage);
    var fillPct = [33, 66, 100][activeIdx] || 33;

    var bar = el('div', 'rafi-state-bar');
    bar.style.setProperty('--fill', fillPct + '%');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', fillPct);
    bar.setAttribute('aria-label', 'Analyse : ' + labels[activeStage]);

    stages.forEach(function(stage, i) {
      var isDone = i < activeIdx, isActive = i === activeIdx;
      var cls = 'rafi-stage' + (isActive ? ' active' : '') + (isDone ? ' done' : '');
      var s = el('div', cls);
      var dot = el('span', 'rafi-stage-dot'); dot.setAttribute('aria-hidden', 'true');
      s.appendChild(dot);
      s.appendChild(el('span', '', labels[stage]));
      bar.appendChild(s);
      if (i < stages.length - 1) {
        var sep = el('div', 'rafi-stage-sep' + (isDone ? ' done' : ''));
        sep.setAttribute('aria-hidden', 'true');
        bar.appendChild(sep);
      }
    });

    return bar;
  }

  function stageFromSessionState(state) {
    if (!state) return 'BESOIN';
    var map = {
      METIER_SELECTION: 'BESOIN', SERVICE_SELECTION: 'BESOIN', START: 'BESOIN',
      QUALIFICATION: 'PRECISIONS', QUESTION_REQUIRED: 'PRECISIONS', READY_FOR_ENGINE: 'PRECISIONS',
      ENGINE_EVALUATION: 'PRECISIONS',
      PRICE_READY: 'RESULTAT', DIAGNOSTIC_READY: 'RESULTAT', LABOUR_PLUS_PART_READY: 'RESULTAT',
      ADD_ON_READY: 'RESULTAT', QUOTE_REQUIRED: 'RESULTAT', ROUTE_REQUIRED: 'RESULTAT',
      SAFETY_STOP: 'RESULTAT', REQUALIFY: 'RESULTAT',
    };
    return map[state] || 'BESOIN';
  }

  function renderAnswerCard(opt, isSelected, onSelect) {
    var card = el('button', 'answer-card' + (isSelected ? ' selected' : ''));
    card.setAttribute('type', 'button');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    var check = el('span', 'answer-card__check', isSelected ? '✓' : '');
    check.setAttribute('aria-hidden', 'true');
    card.appendChild(check);
    card.appendChild(el('span', 'answer-card__label', opt.label || String(opt)));
    card.addEventListener('click', function() {
      onSelect(opt.value !== undefined ? opt.value : opt);
    });
    return card;
  }

  function renderQuestion(step, onAutoAdvance) {
    var isSafety = step.priority === 'SAFETY';
    var body = el('div', 'estimator-body step-enter' + (isSafety ? ' question-safety' : ''));

    if (isSafety) {
      var note = el('div', 'question-safety-note');
      note.innerHTML = '⚠ Cette question concerne la sécurité. Répondez avec précision.';
      body.appendChild(note);
    }

    var rafiHeader = el('div', 'estimator-context rafi-question-header');
    var rafiSmall = el('span', 'rafi-indicator small', 'RAFI vérifie');
    rafiHeader.appendChild(rafiSmall);
    rafiHeader.appendChild(el('span', 'context-detail', ' un détail'));
    body.appendChild(rafiHeader);

    var heading = el('h2', 'question-heading');
    heading.setAttribute('id', 'question-heading');
    heading.textContent = promptFromKey(step.prompt_key, step.question_id);
    body.appendChild(heading);

    if (!isSafety) {
      body.appendChild(el('p', 'question-intelligence-copy',
        'Ce détail permet à FIXEO de calculer le périmètre exact.'));
    }

    STATE.pendingAnswer = null;

    var isBoolean = step.answer_type === 'boolean';

    var onSelect = function(val) {
      STATE.pendingAnswer = val;
      body.querySelectorAll('.answer-card').forEach(function(c) {
        var v = c.__optValue;
        var sel = (v === val || (val === true && v === true) || (val === false && v === false));
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-checked', sel ? 'true' : 'false');
        c.querySelector('.answer-card__check').textContent = sel ? '✓' : '';
      });
      updateCTA(true);
      if (isBoolean && onAutoAdvance) {
        setTimeout(function() { onAutoAdvance(val); }, 400);
      }
    };

    if (isBoolean) {
      var opts = [
        { value: true, label: 'Oui' },
        { value: false, label: 'Non' },
      ];
      if (step.priority !== 'SAFETY') opts.push({ value: null, label: 'Je ne sais pas' });
      var cards = el('div', 'answer-cards');
      opts.forEach(function(opt, i) {
        var card = renderAnswerCard(opt, STATE.pendingAnswer === opt.value, onSelect);
        card.__optValue = opt.value;
        cards.appendChild(card);
      });
      body.appendChild(cards);

    } else if (step.answer_type === 'integer' || step.answer_type === 'number') {
      STATE.quantityValue = 1;
      STATE.pendingAnswer = 1;
      var qRow = el('div', 'quantity-row');
      var qVal = el('div', 'qty-value', '1');
      qVal.setAttribute('aria-live', 'polite');
      var btnMinus = el('button', 'qty-btn', '−');
      btnMinus.setAttribute('type', 'button');
      btnMinus.setAttribute('aria-label', 'Diminuer');
      btnMinus.addEventListener('click', function() {
        var v = Math.max(1, (STATE.quantityValue || 1) - 1);
        STATE.quantityValue = v; STATE.pendingAnswer = v;
        qVal.textContent = v;
        updateCTA(true);
      });
      var btnPlus = el('button', 'qty-btn', '+');
      btnPlus.setAttribute('type', 'button');
      btnPlus.setAttribute('aria-label', 'Augmenter');
      btnPlus.addEventListener('click', function() {
        var v = Math.min(20, (STATE.quantityValue || 1) + 1);
        STATE.quantityValue = v; STATE.pendingAnswer = v;
        qVal.textContent = v;
        updateCTA(true);
      });
      qRow.appendChild(btnMinus);
      qRow.appendChild(qVal);
      qRow.appendChild(btnPlus);
      body.appendChild(qRow);
      updateCTA(true);

    } else if (step.input_id && step.input_id.indexOf('painted_m2') >= 0) {
      body.appendChild(el('p', 'diagnostic-intro',
        'Pour calculer correctement votre prix, nous avons besoin de la surface à peindre.'));
      var inp = el('input', 'measurement-input');
      inp.setAttribute('type', 'number');
      inp.setAttribute('min', '1');
      inp.setAttribute('max', '5000');
      inp.setAttribute('placeholder', 'Ex. 45');
      inp.setAttribute('aria-label', 'Surface à peindre en m²');
      inp.addEventListener('input', function() {
        var v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) {
          STATE.measurementValue = v; STATE.pendingAnswer = v; updateCTA(true);
        } else {
          STATE.pendingAnswer = null; updateCTA(false);
        }
      });
      body.appendChild(inp);
      body.appendChild(el('div', 'measurement-unit', 'm²'));

    } else if (step.options && step.options.length > 0) {
      var wrap = el('div', 'answer-cards');
      wrap.setAttribute('role', 'radiogroup');
      wrap.setAttribute('aria-labelledby', 'question-heading');
      step.options.forEach(function(opt) {
        var card = renderAnswerCard({ value: opt, label: optionLabel(opt) }, false, onSelect);
        card.__optValue = opt;
        wrap.appendChild(card);
      });
      body.appendChild(wrap);

    } else {
      var yesno = el('div', 'answer-cards');
      [{ value: true, label: 'Oui' }, { value: false, label: 'Non' }].forEach(function(opt) {
        var card = renderAnswerCard(opt, false, onSelect);
        card.__optValue = opt.value;
        yesno.appendChild(card);
      });
      body.appendChild(yesno);
    }

    return body;
  }

  function renderScopeChips(scopeSummary) {
    var defaults = ['Déplacement', 'Main-d\'œuvre', 'Fournitures standard', 'Test final'];
    var items = (scopeSummary && scopeSummary.length > 0) ? scopeSummary : defaults;
    var chips = el('div', 'scope-chips');
    chips.setAttribute('role', 'list');
    items.forEach(function(item) {
      var c = el('span', 'scope-chip');
      c.setAttribute('role', 'listitem');
      c.textContent = typeof item === 'string' ? item : JSON.stringify(item);
      chips.appendChild(c);
    });
    return chips;
  }

  function renderPriceResult(outcome) {
    var lbl = resolveClientLabel(outcome.service_code || '');
    var amountMAD = outcome.price && outcome.price.amount_mad;
    var amtNum = amountMAD != null ? Math.round(amountMAD).toString() : '—';

    var shell = el('div', 'result-shell step-enter result-enter');

    var rHead = el('div', 'result-header');
    rHead.appendChild(el('div', 'result-verified-dot'));
    var col = el('div', 'result-rafi-col');
    col.appendChild(el('div', 'result-rafi-state', 'Analyse terminée'));
    col.appendChild(el('div', 'result-rafi-label', 'Intervention identifiée'));
    rHead.appendChild(col);
    shell.appendChild(rHead);

    var srow = el('div', 'result-service-row');
    srow.appendChild(el('div', 'result-service-name', lbl.primary));
    if (lbl.secondary) srow.appendChild(el('div', 'result-service-secondary', lbl.secondary));
    shell.appendChild(srow);

    var hero = el('div', 'price-hero');
    var inner = el('div', 'price-hero-inner');
    inner.appendChild(el('div', 'price-eyebrow', 'Prix FIXEO'));
    var display = el('div', 'price-display');
    display.appendChild(el('span', 'amount', amtNum));
    display.appendChild(el('span', 'currency', ' MAD'));
    inner.appendChild(display);
    inner.appendChild(el('div', 'price-sublabel', 'Périmètre vérifié'));
    hero.appendChild(inner);
    shell.appendChild(hero);

    var scope = el('div', 'scope-section');
    scope.appendChild(el('div', 'scope-section-label', 'Ce qui est inclus'));
    scope.appendChild(renderScopeChips(outcome.scope_summary));
    scope.appendChild(el('p', 'scope-doctrine',
      'Ce prix s\'applique au périmètre indiqué. Si l\'intervention réelle est différente, ' +
      'l\'artisan doit vous l\'expliquer et obtenir votre accord avant de continuer.'));
    shell.appendChild(scope);
    return shell;
  }

  function renderLabourPartResult(outcome) {
    var lbl = resolveClientLabel(outcome.service_code || '');
    // labour_amount_mad and amount_mad are NEVER summed — shown separately
    var labourAmt = outcome.price && outcome.price.labour_amount_mad;
    var labAmtStr = labourAmt != null ? Math.round(labourAmt).toString() : '—';

    var shell = el('div', 'result-shell step-enter result-enter');

    var rHead = el('div', 'result-header');
    rHead.appendChild(el('div', 'result-verified-dot'));
    var col = el('div', 'result-rafi-col');
    col.appendChild(el('div', 'result-rafi-state', 'Analyse terminée'));
    col.appendChild(el('div', 'result-rafi-label', 'Intervention identifiée'));
    rHead.appendChild(col);
    shell.appendChild(rHead);

    var srow = el('div', 'result-service-row');
    srow.appendChild(el('div', 'result-service-name', lbl.primary));
    if (lbl.secondary) srow.appendChild(el('div', 'result-service-secondary', lbl.secondary));
    shell.appendChild(srow);

    var split = el('div', 'labour-split');

    var labCard = el('div', 'labour-card-new');
    labCard.appendChild(el('div', 'labour-card-eyebrow', 'Main-d\'œuvre FIXEO'));
    var labRow = el('div', 'labour-card-amount');
    labRow.appendChild(el('span', 'amount', labAmtStr));
    labRow.appendChild(el('span', 'currency', ' MAD'));
    labCard.appendChild(labRow);
    split.appendChild(labCard);

    var partCard = el('div', 'labour-card-new');
    partCard.style.borderStyle = 'dashed';
    partCard.appendChild(el('div', 'labour-card-eyebrow', 'Pièce / matériel'));
    partCard.appendChild(el('div', 'labour-part-label', 'Prix séparé\nconfirmé avec l\'artisan'));
    split.appendChild(partCard);

    shell.appendChild(split);
    shell.appendChild(el('div', 'labour-disclosure',
      'Si l\'artisan fournit la pièce, son prix doit vous être communiqué et approuvé avant installation.'));
    return shell;
  }

  function renderDiagnosticResult(outcome) {
    var lbl = resolveClientLabel(outcome.service_code || '');
    var amountMAD = (outcome.price && outcome.price.amount_mad) || outcome.diagnostic_price_mad;
    var amtNum = amountMAD != null ? Math.round(amountMAD).toString() : '—';

    var shell = el('div', 'result-shell step-enter result-enter');

    var rHead = el('div', 'result-header');
    rHead.appendChild(el('div', 'result-verified-dot'));
    var col = el('div', 'result-rafi-col');
    col.appendChild(el('div', 'result-rafi-state', 'Diagnostic requis'));
    col.appendChild(el('div', 'result-rafi-label', 'Évaluation préalable'));
    rHead.appendChild(col);
    shell.appendChild(rHead);

    shell.appendChild(el('div', 'diagnostic-tag-new', 'Diagnostic FIXEO'));

    var srow = el('div', 'result-service-row');
    srow.appendChild(el('div', 'result-service-name', lbl.primary));
    if (lbl.secondary) srow.appendChild(el('div', 'result-service-secondary', lbl.secondary));
    shell.appendChild(srow);

    var hero = el('div', 'price-hero');
    var inner = el('div', 'price-hero-inner');
    inner.appendChild(el('div', 'price-eyebrow', 'Tarif diagnostic'));
    var display = el('div', 'price-display');
    display.appendChild(el('span', 'amount', amtNum));
    display.appendChild(el('span', 'currency', ' MAD'));
    inner.appendChild(display);
    inner.appendChild(el('div', 'price-sublabel', 'Déductible d\'une réparation'));
    hero.appendChild(inner);
    shell.appendChild(hero);

    shell.appendChild(el('div', 'diagnostic-absorption',
      'Ce montant peut être déduit d\'une réparation éligible selon les conditions du service.'));
    return shell;
  }

  function renderQuoteResult(outcome) {
    var lbl = resolveClientLabel((outcome && outcome.service_code) || '');
    var shell = el('div', 'result-shell step-enter result-enter');

    var rHead = el('div', 'result-header');
    rHead.appendChild(el('div', 'result-verified-dot'));
    var col = el('div', 'result-rafi-col');
    col.appendChild(el('div', 'result-rafi-state', 'Analyse terminée'));
    col.appendChild(el('div', 'result-rafi-label', 'Devis nécessaire'));
    rHead.appendChild(col);
    shell.appendChild(rHead);

    var surf = el('div', 'outcome-surface');
    surf.appendChild(el('div', 'outcome-tag muted', 'Devis requis'));
    surf.appendChild(el('div', 'outcome-title', lbl.primary));
    if (lbl.secondary) surf.appendChild(el('div', 'result-service-secondary', lbl.secondary));
    surf.appendChild(el('div', 'outcome-body',
      'RAFI a identifié que cette intervention ne peut pas avoir un prix fixe sans vérification sur site.'));
    surf.appendChild(el('div', 'outcome-why', 'Complexité ou périmètre variable'));
    shell.appendChild(surf);
    return shell;
  }

  function renderRouteResult(outcome) {
    var targetMetier = (outcome && outcome.metier) || 'spécialiste';
    var shell = el('div', 'result-shell step-enter result-enter');

    var rHead = el('div', 'result-header');
    rHead.appendChild(el('div', 'result-verified-dot'));
    var col = el('div', 'result-rafi-col');
    col.appendChild(el('div', 'result-rafi-state', 'Réorientation'));
    col.appendChild(el('div', 'result-rafi-label', 'Bon spécialiste identifié'));
    rHead.appendChild(col);
    shell.appendChild(rHead);

    var surf = el('div', 'outcome-surface');
    surf.appendChild(el('div', 'outcome-tag orange', 'Réorientation RAFI'));
    surf.appendChild(el('div', 'outcome-title', 'RAFI a identifié le bon spécialiste.'));
    var dir = el('div', 'route-direction');
    dir.appendChild(el('span', 'route-arrow', '→'));
    dir.appendChild(el('div', 'route-target', METIER_LABELS[targetMetier] || targetMetier));
    surf.appendChild(dir);
    surf.appendChild(el('div', 'outcome-body',
      'Cette intervention relève d\'un autre périmètre. RAFI vous oriente vers le bon spécialiste FIXEO.'));
    shell.appendChild(surf);
    return shell;
  }

  function renderSafetyResult(outcome) {
    var body = el('div', 'estimator-body step-enter safety-stop-body');
    var safetyWrap = el('div', 'safety-surface');
    safetyWrap.appendChild(el('span', 'safety-icon', '⚠'));
    var st = el('h2', 'safety-title', 'Une vérification est nécessaire avant de continuer.');
    st.setAttribute('id', 'safety-heading');
    safetyWrap.appendChild(st);
    safetyWrap.appendChild(el('div', 'safety-body',
      'Pour votre sécurité, nous ne pouvons pas établir un prix dans cette situation.'));
    safetyWrap.appendChild(el('div', 'safety-recommendation',
      'Nous vous recommandons de contacter un professionnel qualifié.'));
    body.appendChild(safetyWrap);
    return body;
  }

  function renderRequalifyResult() {
    var body = el('div', 'estimator-body step-enter result-enter');
    body.appendChild(el('div', 'requali-title', 'Votre besoin dépasse le périmètre du prix standard.'));
    body.appendChild(el('div', 'requali-body',
      'L\'intervention nécessite une évaluation spécifique. Un artisan FIXEO vous contactera.'));
    return body;
  }

  function renderFooter(opts) {
    opts = opts || {};
    var footer = el('div', 'estimator-footer');
    footer.setAttribute('id', 'estimator-footer');

    if (opts.primaryLabel) {
      var primary = el('button', 'btn-primary', opts.primaryLabel);
      primary.setAttribute('id', 'cta-primary');
      primary.disabled = opts.primaryDisabled || false;
      primary.addEventListener('click', function() {
        if (!primary.disabled && opts.onPrimary) opts.onPrimary();
      });
      footer.appendChild(primary);
    }

    if (opts.secondaryLabel) {
      var secondary = el('button', 'btn-secondary', opts.secondaryLabel);
      secondary.addEventListener('click', function() {
        if (opts.onSecondary) opts.onSecondary();
      });
      footer.appendChild(secondary);
    }

    if (opts.showBack) {
      var back = el('button', 'btn-back', '← Retour');
      back.addEventListener('click', function() { if (opts.onBack) opts.onBack(); });
      footer.appendChild(back);
    }

    return footer;
  }

  function updateCTA(enabled) {
    var btn = document.getElementById('cta-primary');
    if (btn) btn.disabled = !enabled;
  }

  // ─────────────────────────────────────────────────────────────────
  // CTA label
  // ─────────────────────────────────────────────────────────────────
  function ctaLabel(outcome) {
    var ot = outcome && outcome.outcome_type;
    switch (ot) {
      case 'PRICE_READY':
        return 'Trouver un artisan — ' + formatMAD(outcome.price && outcome.price.amount_mad);
      case 'LABOUR_PLUS_PART_READY':
        return 'Trouver un artisan — Main-d\'œuvre ' + formatMAD(outcome.price && outcome.price.labour_amount_mad);
      case 'DIAGNOSTIC_READY':
        return 'Réserver le diagnostic — ' + formatMAD(outcome.price && outcome.price.amount_mad);
      case 'QUOTE_REQUIRED':
        return 'Demander un devis';
      case 'ROUTE_REQUIRED':
        return 'Continuer';
      default:
        return 'Continuer';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Container management (self-managed DOM)
  // ─────────────────────────────────────────────────────────────────
  var _activeModal = null;
  var _activeContainer = null;

  function _createContainer() {
    var c = document.createElement('div');
    c.setAttribute('id', 'fixeo-estimator-v2-root');
    c.setAttribute('aria-live', 'polite');
    document.body.appendChild(c);
    return c;
  }

  function _destroyContainer() {
    try {
      if (_activeContainer && _activeContainer.parentNode) {
        _activeContainer.parentNode.removeChild(_activeContainer);
      }
    } catch (_) {}
    _activeContainer = null;
    _activeModal = null;
  }

  // ─────────────────────────────────────────────────────────────────
  // EstimatorModal — main flow controller
  // ─────────────────────────────────────────────────────────────────

  function EstimatorModal(rootEl, opts) {
    opts = opts || {};
    STATE.onClose = opts.onClose || function() {};
    STATE.sessionToken = null;
    STATE.session = null;
    STATE.pendingAnswer = null;
    STATE.quantityValue = null;
    STATE.measurementValue = null;

    this._root = rootEl;
    this._entryContext = opts.entryContext || {};
    this._pricingContextToken = null;
  }

  EstimatorModal.prototype.render = function() {
    var self = this;
    var root = this._root;
    root.innerHTML = '';

    var backdrop = el('div', 'estimator-backdrop');
    backdrop.setAttribute('id', 'estimator-backdrop');
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) STATE.onClose();
    });

    var modal = el('div', 'estimator-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'estimator-header');

    modal.appendChild(renderHeader());

    var progressSlot = el('div', ''); progressSlot.setAttribute('id', 'progress-slot');
    modal.appendChild(progressSlot);

    var ctxSlot = el('div', ''); ctxSlot.setAttribute('id', 'ctx-slot');
    modal.appendChild(ctxSlot);

    var bodySlot = el('div', ''); bodySlot.setAttribute('id', 'body-slot');
    modal.appendChild(bodySlot);

    var footerSlot = el('div', ''); footerSlot.setAttribute('id', 'footer-slot');
    modal.appendChild(footerSlot);

    backdrop.appendChild(modal);
    root.appendChild(backdrop);

    trapFocus(modal);
    setRAFIState('idle');
    this._startSession();
  };

  EstimatorModal.prototype._startSession = function() {
    var self = this;
    setRAFIState('analyzing');
    triggerIntelligenceLine();

    window.FixeoEstimatorAPI.start(self._entryContext)
      .then(function(r) {
        if (!r.ok) return self._showError('Impossible de démarrer l\'estimation.');
        STATE.sessionToken = r.session.session_token;
        STATE.session = r.session;
        self._renderStep(r.session, r.next_step);
      })
      .catch(function() {
        self._showError('Problème de connexion. Veuillez réessayer.');
      });
  };

  EstimatorModal.prototype._renderStep = function(session, next_step) {
    var self = this;
    var progressSlot = document.getElementById('progress-slot');
    var bodySlot = document.getElementById('body-slot');
    var footerSlot = document.getElementById('footer-slot');
    if (!progressSlot || !bodySlot || !footerSlot) return;

    // Handle PAGE_REQUIRED — navigate to /estimation page
    if (session.ui_recommendation === 'PAGE_REQUIRED') {
      // Store opaque session token only — never raw amounts
      try {
        sessionStorage.setItem('fixeo_estimator_token_v1', STATE.sessionToken);
      } catch (_) {}
      window.location.href = '/estimation';
      return;
    }

    var stage = stageFromSessionState(session.state);
    progressSlot.innerHTML = '';
    progressSlot.appendChild(renderProgress(stage));

    triggerIntelligenceLine();

    if (next_step && next_step.type === 'QUESTION') {
      setRAFIState('verifying');
      var body = renderQuestion(next_step, function(val) {
        // Auto-advance for boolean
        self._submitAnswer(next_step.question_id, val);
      });
      bodySlot.innerHTML = '';
      bodySlot.appendChild(body);

      var footer = renderFooter({
        primaryLabel: 'Confirmer',
        primaryDisabled: true,
        onPrimary: function() {
          if (STATE.pendingAnswer !== null && STATE.pendingAnswer !== undefined) {
            self._submitAnswer(next_step.question_id, STATE.pendingAnswer);
          }
        },
        showBack: false,
      });
      footerSlot.innerHTML = '';
      footerSlot.appendChild(footer);

    } else if (next_step && next_step.type === 'SERVICE_SELECTION') {
      // 7C.9K.5: render service choice — must NOT call _evaluate() here.
      setRAFIState('idle');
      self._renderServiceSelection(next_step);

    } else if (session.state === 'READY_FOR_ENGINE' || next_step && next_step.type === 'READY') {
      self._evaluate();
    } else {
      // Fallback — evaluate only for genuinely unexpected states (not SERVICE_SELECTION).
      self._evaluate();
    }
  };

  /**
   * _renderServiceSelection — Phase 7C.9K.5
   *
   * Renders a generic list of service choices from nextStep.candidate_services.
   * No métier-specific hardcoding. One tap selects and advances the session.
   * Repeated taps blocked while the API request is in-flight.
   */
  EstimatorModal.prototype._renderServiceSelection = function(nextStep) {
    var self = this;
    var bodySlot = document.getElementById('body-slot');
    var footerSlot = document.getElementById('footer-slot');
    if (!bodySlot || !footerSlot) return;

    var candidates = (nextStep && nextStep.candidate_services) || [];
    if (candidates.length === 0) {
      // No candidates — show recoverable error; never fall through to evaluate.
      return self._showError('Aucun service disponible pour ce métier.');
    }

    var pending = false; // lock to prevent duplicate API calls

    var body = el('div', 'estimator-body step-enter');
    body.appendChild(el('p', 'question-prompt', 'Quel type d\'intervention souhaitez-vous ?'));

    var cards = el('div', 'answer-cards');

    candidates.forEach(function(svc) {
      var card = renderAnswerCard(
        { label: svc.label_fr || svc.short_label_fr || svc.service_code, value: svc.service_code },
        false,
        function(serviceCode) {
          if (pending) return; // block repeated taps
          pending = true;

          // Dim all cards visually while awaiting response
          cards.querySelectorAll('.answer-card').forEach(function(c) {
            c.setAttribute('aria-disabled', 'true');
            c.style.opacity = '0.5';
          });

          setRAFIState('analyzing');
          triggerIntelligenceLine();

          window.FixeoEstimatorAPI.selectService(STATE.sessionToken, serviceCode)
            .then(function(r) {
              if (!r.ok) {
                pending = false;
                return self._showError('Impossible de sélectionner ce service.');
              }
              // Store new opaque token — old token must not be reused.
              STATE.sessionToken = r.session.session_token;
              STATE.session = r.session;
              // _renderStep handles QUESTION, READY_FOR_ENGINE, PAGE_REQUIRED, etc.
              self._renderStep(r.session, r.next_step);
            })
            .catch(function() {
              pending = false;
              self._showError('Problème de connexion. Veuillez réessayer.');
            });
        }
      );
      cards.appendChild(card);
    });

    body.appendChild(cards);
    bodySlot.innerHTML = '';
    bodySlot.appendChild(body);
    footerSlot.innerHTML = ''; // no footer action needed — tap auto-advances
  };

  EstimatorModal.prototype._submitAnswer = function(questionId, answer) {
    var self = this;
    setRAFIState('analyzing');
    triggerIntelligenceLine();

    window.FixeoEstimatorAPI.answer(STATE.sessionToken, questionId, answer)
      .then(function(r) {
        if (!r.ok) return self._showError('Impossible d\'enregistrer la réponse.');
        STATE.sessionToken = r.session.session_token;
        STATE.session = r.session;
        self._renderStep(r.session, r.next_step);
      })
      .catch(function() {
        self._showError('Problème de connexion. Veuillez réessayer.');
      });
  };

  EstimatorModal.prototype._evaluate = function() {
    var self = this;
    setRAFIState('verifying');
    triggerIntelligenceLine();

    window.FixeoEstimatorAPI.evaluate(STATE.sessionToken)
      .then(function(r) {
        if (!r.ok) return self._showError('Impossible de calculer l\'estimation.');
        STATE.sessionToken = r.session.session_token;
        STATE.session = r.session;
        self._pricingContextToken = r.pricing_context_token || null;
        self._renderOutcome(r.session, r.outcome);
      })
      .catch(function() {
        self._showError('Problème de connexion. Veuillez réessayer.');
      });
  };

  EstimatorModal.prototype._renderOutcome = function(session, outcome) {
    var self = this;
    var progressSlot = document.getElementById('progress-slot');
    var bodySlot = document.getElementById('body-slot');
    var footerSlot = document.getElementById('footer-slot');
    var modal = document.querySelector('.estimator-modal');
    if (!bodySlot || !footerSlot) return;

    progressSlot && progressSlot.innerHTML && (progressSlot.innerHTML = '');
    if (progressSlot) progressSlot.appendChild(renderProgress('RESULTAT'));
    if (modal) modal.classList.add('result-active');

    var ot = outcome && outcome.outcome_type;
    var bodyEl;

    switch (ot) {
      case 'PRICE_READY':
        setRAFIState('complete');
        bodyEl = renderPriceResult(outcome);
        break;
      case 'LABOUR_PLUS_PART_READY':
        setRAFIState('complete');
        bodyEl = renderLabourPartResult(outcome);
        break;
      case 'DIAGNOSTIC_READY':
        setRAFIState('complete');
        bodyEl = renderDiagnosticResult(outcome);
        break;
      case 'QUOTE_REQUIRED':
        setRAFIState('idle');
        bodyEl = renderQuoteResult(outcome);
        break;
      case 'ROUTE_REQUIRED':
        setRAFIState('analyzing');
        bodyEl = renderRouteResult(outcome);
        break;
      case 'SAFETY_STOP':
        setRAFIState('idle');
        bodyEl = renderSafetyResult(outcome);
        break;
      case 'REQUALIFY':
        setRAFIState('idle');
        bodyEl = renderRequalifyResult();
        break;
      default:
        setRAFIState('idle');
        bodyEl = el('div', 'estimator-body', '<p>Estimation disponible sur site.</p>');
    }

    bodySlot.innerHTML = '';
    bodySlot.appendChild(bodyEl);

    // Footer
    var footerOpts = {};
    var noPricingToken = new Set(['SAFETY_STOP', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED', 'REQUALIFY']);

    if (!noPricingToken.has(ot) && self._pricingContextToken) {
      footerOpts.primaryLabel = ctaLabel(outcome);
      footerOpts.onPrimary = function() {
        // Store opaque token — never raw amounts
        if (window.FixeoEstimatorReservationBridge && self._pricingContextToken) {
          window.FixeoEstimatorReservationBridge.prepareContext(self._pricingContextToken);
        }
        // 7C.9L.1: dispatch reservation event — listener in index.html owns the
        // lifecycle from here. Estimator is NOT closed unconditionally:
        // - on success: listener calls FixeoEstimatorV2.close() after open() returns
        // - on failure: Estimator stays visible, user can retry
        // STATE.onClose() intentionally removed from this path.
        document.dispatchEvent(new CustomEvent('fixeo:estimator-reserve', {
          detail: { pricing_context_token: self._pricingContextToken }
        }));
        // Do NOT call STATE.onClose() here — listener handles Estimator close.
      };
    } else if (ot === 'QUOTE_REQUIRED') {
      footerOpts.primaryLabel = 'Demander un devis';
      footerOpts.onPrimary = function() { if (STATE.onClose) STATE.onClose(); };
    } else if (ot === 'SAFETY_STOP') {
      footerOpts.primaryLabel = 'Fermer';
      footerOpts.onPrimary = function() { if (STATE.onClose) STATE.onClose(); };
    } else {
      footerOpts.primaryLabel = 'Fermer';
      footerOpts.onPrimary = function() { if (STATE.onClose) STATE.onClose(); };
    }

    var footer = renderFooter(footerOpts);
    footerSlot.innerHTML = '';
    footerSlot.appendChild(footer);
  };

  EstimatorModal.prototype._showError = function(msg) {
    var bodySlot = document.getElementById('body-slot');
    if (!bodySlot) return;
    var div = el('div', 'estimator-body');
    div.appendChild(el('p', '', msg));
    bodySlot.innerHTML = '';
    bodySlot.appendChild(div);
  };

  // ─────────────────────────────────────────────────────────────────
  // Public API (overwrites stub defined at top of IIFE)
  // ─────────────────────────────────────────────────────────────────
  window.FixeoEstimatorV2 = {
    /**
     * Open the estimator modal with an entry context.
     * Returns Promise<{ accepted: true }> on success.
     * Returns Promise<{ accepted: false, reason }> if already open, disabled, or error.
     */
    open: function(entryContext) {
      if (_activeModal) {
        return Promise.resolve({ accepted: true }); // already open
      }
      var normalizedCtx = _normalizeEntryContext(entryContext || {});
      try {
        _activeContainer = _createContainer();
        _activeModal = new EstimatorModal(_activeContainer, {
          entryContext: normalizedCtx,
          onClose: function() { _destroyContainer(); },
        });
        _activeModal.render();
        return Promise.resolve({ accepted: true });
      } catch (e) {
        _destroyContainer();
        return Promise.resolve({ accepted: false, reason: 'init_error' });
      }
    },

    /** Close the estimator modal. */
    close: function() {
      if (STATE.onClose) STATE.onClose();
      else _destroyContainer();
    },

    /** Returns true if the estimator modal is currently open. */
    isOpen: function() {
      return !!_activeModal;
    },
  };

}());
