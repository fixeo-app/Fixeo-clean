/* ═══════════════════════════════════════════════════════════════════
   FIXEO Estimator Dormant Visual Prototype — Phase 7C.8C
   estimator-prototype.js — Component Renderers + Orchestrator Flow
   Status: PROTOTYPE INTERNE — NON PRODUCTION
   ═══════════════════════════════════════════════════════════════════

   ARCHITECTURE:
   - UI consumes ONLY orchestrator output (session, next_step, outcome)
   - UI does NOT calculate prices, apply multipliers, or read price tables
   - Monetary values are read from outcome.price.amount_mad (engine output)
   - All flow goes: UI → adapter → orchestrator → engine
*/

'use strict';

/* ── Adapter (Node / browser shim) ────────────────────────────────── */
var _adapter;
if (typeof require !== 'undefined') {
  _adapter = require('./estimator-prototype-adapter');
}
// In browser: window.EstimatorAdapter must be set before this script runs.
function getAdapter() {
  return _adapter || window.EstimatorAdapter;
}

/* ── RAFI State Machine ──────────────────────────────────────────── */
var RAFI_STATES = {
  idle:       { label: 'RAFI',          copy: 'Analyse de votre besoin' },
  analyzing:  { label: 'RAFI analyse',  copy: 'Identification de l\'intervention…' },
  identified: { label: 'RAFI',          copy: 'Intervention identifiée' },
  verifying:  { label: 'RAFI vérifie',  copy: 'Vérification du périmètre' },
  complete:   { label: 'RAFI',          copy: 'Prix FIXEO prêt' },
};

function setRAFIState(state) {
  var s = RAFI_STATES[state] || RAFI_STATES.idle;
  var markEl = document.getElementById('rafi-mark');
  var lineEl = document.getElementById('rafi-state-line');
  if (markEl) {
    markEl.textContent = s.label;
    markEl.classList.remove('rafi-pulse');
    // force reflow for re-trigger
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
}

/* ── State ──────────────────────────────────────────────────────── */
var STATE = {
  session: null,          // current orchestrator session
  history: [],            // stack of previous sessions (for back)
  stage: 'BESOIN',        // 'BESOIN' | 'PRECISIONS' | 'RESULTAT'
  pendingAnswer: null,    // currently selected but not submitted answer
  quantityValue: null,
  measurementValue: null,
  isSafetyActive: false,
  onClose: null,          // callback when estimator closes
  onPageHandoff: null,    // callback for modal→page transition
};

/* ── Progress Mapping ─────────────────────────────────────────────── */
function stageFromState(state) {
  if (!state) return 'BESOIN';
  var map = {
    START: 'BESOIN', METIER_SELECTION: 'BESOIN', SERVICE_SELECTION: 'BESOIN',
    QUALIFICATION: 'PRECISIONS', QUESTION_REQUIRED: 'PRECISIONS', READY_FOR_ENGINE: 'PRECISIONS',
    ENGINE_EVALUATION: 'PRECISIONS',
    PRICE_READY: 'RESULTAT', DIAGNOSTIC_READY: 'RESULTAT', LABOUR_PLUS_PART_READY: 'RESULTAT',
    ADD_ON_READY: 'RESULTAT', QUOTE_REQUIRED: 'RESULTAT', ROUTE_REQUIRED: 'RESULTAT',
    SAFETY_STOP: 'RESULTAT', REQUALIFY: 'RESULTAT', CONFIRMATION_READY: 'RESULTAT',
  };
  return map[state] || 'BESOIN';
}

/* ── Locale copy helpers (from UX contract, not from price tables) ── */
var ABSORPTION_COPY = {
  plomberie:    'Si un travail est réalisé suite au diagnostic, ce montant est déduit de la prestation.',
  electricite:  'Si un travail est réalisé suite au diagnostic, ce montant est déduit de la prestation.',
  climatisation:'Si un travail est réalisé suite au diagnostic, ce montant est déduit de la prestation.',
};

var METIER_LABELS = {
  menuiserie: 'Menuiserie', plomberie: 'Plomberie', electricite: 'Électricité',
  serrurerie: 'Serrurerie', climatisation: 'Climatisation', nettoyage: 'Nettoyage',
  peinture: 'Peinture', bricolage: 'Bricolage',
};

/* ── Utility ─────────────────────────────────────────────────────── */
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

/* ── Context-sensitive CTA labels ────────────────────────────────── */
function ctaLabel(outcome) {
  var ot = outcome && outcome.outcome_type;
  switch (ot) {
    case 'PRICE_READY':
    case 'LABOUR_PLUS_PART_READY':
      if (outcome.price && outcome.price.labour_amount_mad) {
        return 'Trouver un artisan — Main-d\'œuvre ' + formatMAD(outcome.price.labour_amount_mad);
      }
      return 'Trouver un artisan — ' + formatMAD(outcome.price && outcome.price.amount_mad);
    case 'DIAGNOSTIC_READY':
      return 'Réserver le diagnostic — ' + formatMAD(outcome.price && outcome.price.amount_mad);
    case 'QUOTE_REQUIRED':
      return 'Demander un devis';
    case 'ROUTE_REQUIRED':
      return 'Continuer' + (outcome.target_metier ? ' en ' + outcome.target_metier : '');
    default:
      return 'Continuer';
  }
}

/* ── Handoff screen (replaces browser alert for reservation) ──────────── */
function showHandoffScreen(session, outcome) {
  var bodySlot = document.getElementById('body-slot');
  var footerSlot = document.getElementById('footer-slot');
  if (!bodySlot || !footerSlot) return;

  setRAFIState('verifying');

  var serviceName = outcome && outcome.service_code
    ? outcome.service_code.split('.').pop().replace(/_/g, ' ')
    : (session && session.service_code ? session.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation');

  var body = el('div', 'estimator-body step-enter handoff-screen');

  var title = el('div', 'handoff-title', 'Réservation — handoff prototype');
  body.appendChild(title);

  if (serviceName) {
    body.appendChild(el('div', 'result-service-name', serviceName));
  }

  if (outcome && outcome.price) {
    var priceAmt = outcome.price.amount_mad || outcome.price.labour_amount_mad;
    if (priceAmt) {
      var priceEl = el('div', 'handoff-price', formatMAD(priceAmt));
      body.appendChild(priceEl);
    }
  }

  body.appendChild(el('div', 'handoff-body',
    'En production : ce bouton démarrerait la réservation FIXEO. ' +
    'Dans ce prototype, la réservation est dormante.'));

  var metierLabel = session && session.metier
    ? (METIER_LABELS[session.metier] || session.metier)
    : '';
  if (metierLabel) {
    body.appendChild(el('div', 'diagnostic-intro', 'Métier : ' + metierLabel));
  }

  bodySlot.innerHTML = '';
  bodySlot.appendChild(body);

  var footer = el('div', 'estimator-footer');
  var backBtn = el('button', 'handoff-back btn-secondary', 'Retour au prototype');
  backBtn.addEventListener('click', function() {
    if (STATE.onClose) STATE.onClose();
  });
  footer.appendChild(backBtn);

  footerSlot.innerHTML = '';
  footerSlot.appendChild(footer);
}

/* ── Focus trap ──────────────────────────────────────────────────── */
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

/* ── Intelligence line animation ─────────────────────────────────── */
function triggerIntelligenceLine() {
  var line = document.querySelector('.intelligence-line');
  if (!line) return;
  line.classList.remove('active');
  void line.offsetWidth;
  line.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT RENDERERS
   ═══════════════════════════════════════════════════════════════════ */

/* EstimatorHeader — new structure with RAFI state */
function renderHeader(opts) {
  opts = opts || {};
  var header = el('div', 'estimator-header');
  header.setAttribute('id', 'estimator-header');

  // Intelligence line
  var intLine = el('div', 'intelligence-line');
  header.appendChild(intLine);

  // Header left: RAFI badge + text
  var left = el('div', 'header-left');

  var rafiMark = el('span', 'rafi-indicator');
  rafiMark.setAttribute('id', 'rafi-mark');
  rafiMark.textContent = 'RAFI';
  left.appendChild(rafiMark);

  var headerText = el('div', 'header-text');
  headerText.appendChild(el('div', 'header-title', 'Estimation FIXEO'));
  var rafiStateLine = el('div', 'rafi-state');
  rafiStateLine.setAttribute('id', 'rafi-state-line');
  rafiStateLine.textContent = opts.rafiState || 'Analyse de votre besoin';
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

/* EstimatorProgress */
function renderProgress(activeStage) {
  var stages = ['BESOIN', 'PRECISIONS', 'RESULTAT'];
  var labels = { BESOIN: 'Besoin', PRECISIONS: 'Précisions', RESULTAT: 'Résultat FIXEO' };
  var activeIdx = stages.indexOf(activeStage);

  var progress = el('div', 'estimator-progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', 'Étape : ' + labels[activeStage]);

  stages.forEach(function(stage, i) {
    var isDone = i < activeIdx, isActive = i === activeIdx;
    var cls = 'progress-stage' + (isActive ? ' active' : '') + (isDone ? ' done' : '');
    var s = el('div', cls);
    var dot = el('span', 'progress-dot');
    dot.setAttribute('aria-hidden', 'true');
    s.appendChild(dot);
    s.appendChild(el('span', '', labels[stage]));
    progress.appendChild(s);
    if (i < stages.length - 1) {
      var line = el('div', 'progress-line' + (isDone ? ' done' : ''));
      line.setAttribute('aria-hidden', 'true');
      progress.appendChild(line);
    }
  });
  return progress;
}

/* RAFIIndicator + EstimatorContext */
function renderContext(session) {
  if (!session || (!session.metier && !session.service_code)) return null;
  var ctx = el('div', 'estimator-context rafi-question-header');
  var rafi = el('span', 'rafi-indicator small', 'RAFI vérifie');
  ctx.appendChild(rafi);
  ctx.appendChild(el('span', 'context-detail', ' un détail'));

  if (session.metier || session.service_label) {
    var info = [];
    if (session.metier) info.push(METIER_LABELS[session.metier] || session.metier);
    if (session.service_label) info.push(session.service_label);
    if (info.length) {
      ctx.appendChild(el('span', 'rafi-identified', ' — ' + info.join(' — ')));
    }
  }
  return ctx;
}

/* RAFIIndicator (verifying) */
function renderRAFIVerifying() {
  var ctx = el('div', 'estimator-context');
  ctx.appendChild(el('span', 'rafi-indicator', 'RAFI vérifie'));
  ctx.appendChild(el('span', 'context-detail', ' quelques détails avant d\'afficher le prix.'));
  return ctx;
}

/* AnswerCard */
function renderAnswerCard(opt, isSelected, onSelect) {
  var card = el('button', 'answer-card' + (isSelected ? ' selected' : ''));
  card.setAttribute('type', 'button');
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

  var check = el('span', 'answer-card__check', isSelected ? '✓' : '');
  check.setAttribute('aria-hidden', 'true');
  card.appendChild(check);
  card.appendChild(el('span', 'answer-card__label', opt.label || opt));
  card.addEventListener('click', function() { onSelect(opt.value !== undefined ? opt.value : opt); });
  return card;
}

/* YesNo */
function renderYesNo(includeUnknown, onSelect) {
  var opts = [
    { value: true,  label: 'Oui' },
    { value: false, label: 'Non' },
  ];
  if (includeUnknown) opts.push({ value: null, label: 'Je ne sais pas' });
  var wrap = el('div', 'answer-cards');
  opts.forEach(function(opt) {
    var card = renderAnswerCard(opt, STATE.pendingAnswer === opt.value, onSelect);
    wrap.appendChild(card);
  });
  return wrap;
}

/* QuantityInput */
function renderQuantityInput(current, min, max, onChange) {
  min = min || 1; max = max || 20;
  var row = el('div', 'quantity-row');
  var btnMinus = el('button', 'qty-btn', '−');
  btnMinus.setAttribute('aria-label', 'Diminuer');
  btnMinus.setAttribute('type', 'button');
  btnMinus.addEventListener('click', function() {
    var v = Math.max(min, (STATE.quantityValue || current) - 1);
    STATE.quantityValue = v; STATE.pendingAnswer = v;
    valEl.textContent = v;
    onChange(v);
  });
  var valEl = el('div', 'qty-value', String(STATE.quantityValue || current));
  valEl.setAttribute('aria-live', 'polite');
  var btnPlus = el('button', 'qty-btn', '+');
  btnPlus.setAttribute('aria-label', 'Augmenter');
  btnPlus.setAttribute('type', 'button');
  btnPlus.addEventListener('click', function() {
    var v = Math.min(max, (STATE.quantityValue || current) + 1);
    STATE.quantityValue = v; STATE.pendingAnswer = v;
    valEl.textContent = v;
    onChange(v);
  });
  row.appendChild(btnMinus);
  row.appendChild(valEl);
  row.appendChild(btnPlus);
  return row;
}

/* MeasurementInput (painted_m2) */
function renderMeasurementInput(onChange) {
  var wrap = el('div', '');
  wrap.appendChild(el('p', 'diagnostic-intro',
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
      STATE.measurementValue = v; STATE.pendingAnswer = v; onChange(v);
    } else {
      STATE.pendingAnswer = null; onChange(null);
    }
  });
  wrap.appendChild(inp);
  wrap.appendChild(el('div', 'measurement-unit', 'm²'));
  return wrap;
}

/* ── Scope chips renderer ────────────────────────────────────────── */
function renderScopeChips(included, excluded) {
  var defaultIncluded = ['Déplacement', 'Main-d\'oeuvre', 'Fournitures standard', 'Test final'];
  var items = (included && included.length > 0) ? included : defaultIncluded;

  var wrap = el('div', '');

  var chipsEl = el('div', 'scope-chips');
  items.forEach(function(item) {
    chipsEl.appendChild(el('span', 'scope-chip', typeof item === 'string' ? item : JSON.stringify(item)));
  });
  wrap.appendChild(chipsEl);

  if (excluded && excluded.length > 0) {
    var trigger = el('span', 'scope-collapse-trigger', 'Voir les exclusions ▾');
    var exclusionsEl = el('div', 'scope-exclusions');
    exclusionsEl.setAttribute('hidden', '');

    var excChips = el('div', 'scope-chips');
    excluded.forEach(function(item) {
      excChips.appendChild(el('span', 'scope-chip', typeof item === 'string' ? item : JSON.stringify(item)));
    });
    exclusionsEl.appendChild(excChips);

    trigger.addEventListener('click', function() {
      var hidden = exclusionsEl.hasAttribute('hidden');
      if (hidden) {
        exclusionsEl.removeAttribute('hidden');
        trigger.textContent = 'Masquer les exclusions ▴';
      } else {
        exclusionsEl.setAttribute('hidden', '');
        trigger.textContent = 'Voir les exclusions ▾';
      }
    });
    wrap.appendChild(trigger);
    wrap.appendChild(exclusionsEl);
  }

  var doctrine = el('p', 'scope-doctrine',
    'Ce prix s\'applique au périmètre indiqué. Si l\'intervention réelle est différente, ' +
    'l\'artisan doit vous l\'expliquer et obtenir votre accord avant de continuer.');
  wrap.appendChild(doctrine);

  return wrap;
}

/* ── Scope List (legacy compat) ──────────────────────────────────── */
function renderScopeList(included, excluded) {
  return renderScopeChips(included, excluded);
}

/* EstimatorQuestion — renders one question screen */
function renderQuestion(step, onAutoAdvance) {
  var isSafety = step.priority === 'SAFETY';
  var body = el('div', 'estimator-body step-enter' + (isSafety ? ' question-safety' : ''));

  if (isSafety) {
    body.classList.add('question-safety');
    var note = el('div', 'question-safety-note');
    note.innerHTML = '⚠ Cette question concerne la sécurité. Répondez avec précision.';
    body.appendChild(note);
  }

  // RAFI question header
  var rafiHeader = el('div', 'estimator-context rafi-question-header');
  var rafiSmall = el('span', 'rafi-indicator small', 'RAFI vérifie');
  rafiHeader.appendChild(rafiSmall);
  rafiHeader.appendChild(el('span', 'context-detail', ' un détail'));
  body.appendChild(rafiHeader);

  var heading = el('h2', 'question-heading');
  heading.setAttribute('id', 'question-heading');
  heading.textContent = promptFromKey(step.prompt_key, step.question_id);
  body.appendChild(heading);

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

    // Auto-advance for boolean answers after 400ms
    if (isBoolean && onAutoAdvance && typeof onAutoAdvance === 'function') {
      setTimeout(function() {
        onAutoAdvance(val);
      }, 400);
    }
  };

  if (isBoolean) {
    var includeUnknown = step.priority !== 'SAFETY';
    var cards = renderYesNo(includeUnknown, onSelect);
    cards.querySelectorAll('.answer-card').forEach(function(c, i) {
      c.__optValue = [true, false, null][i];
    });
    body.appendChild(cards);

  } else if (step.answer_type === 'integer') {
    STATE.quantityValue = 1;
    STATE.pendingAnswer = 1;
    var qInp = renderQuantityInput(1, 1, 20, function() { updateCTA(true); });
    body.appendChild(qInp);
    updateCTA(true);

  } else if (step.input_id && step.input_id.indexOf('painted_m2') >= 0) {
    var mInp = renderMeasurementInput(function(val) { updateCTA(val != null); });
    body.appendChild(mInp);

  } else if (step.options && step.options.length > 0) {
    var wrap2 = el('div', 'answer-cards');
    wrap2.setAttribute('role', 'radiogroup');
    wrap2.setAttribute('aria-labelledby', 'question-heading');
    step.options.forEach(function(opt) {
      var card = renderAnswerCard({ value: opt, label: optionLabel(opt) }, false, onSelect);
      card.__optValue = opt;
      wrap2.appendChild(card);
    });
    body.appendChild(wrap2);

  } else {
    var cards2 = renderYesNo(false, onSelect);
    cards2.querySelectorAll('.answer-card').forEach(function(c, i) {
      c.__optValue = [true, false][i];
    });
    body.appendChild(cards2);
  }

  return body;
}

/* ── Prompt key → French label ─────────────────────────────────── */
var PROMPT_LABELS = {
  'burning_smell':                  'Y a-t-il une odeur de brûlé ?',
  'scorch_marks':                   'Y a-t-il des traces de carbonisation ?',
  'active_moisture':                'Y a-t-il une fuite active en cours ?',
  'distributor_equipment_involved': 'L\'intervention concerne-t-elle le tableau électrique principal ?',
  'ddr_rcd_involved':               'L\'intervention concerne-t-elle un disjoncteur différentiel ou DDR ?',
  'multi_split':                    'S\'agit-il d\'un système multi-split ?',
  'security_door':                  'S\'agit-il d\'une porte blindée ou de sécurité ?',
  'part_replacement_required':      'Une pièce doit-elle être remplacée ?',
  'worker_count':                   'Combien de prestataires souhaitez-vous ?',
  'hours':                          'Combien d\'heures d\'intervention ?',
  'painted_m2':                     'Quelle est la surface à peindre (m²) ?',
  'leak_location_confirmed':        'La localisation de la fuite est-elle connue ?',
  'refrigerant_type':               'Quel est le type de réfrigérant du système ?',
};

function promptFromKey(promptKey, questionId) {
  if (PROMPT_LABELS[promptKey]) return PROMPT_LABELS[promptKey];
  var base = questionId ? questionId.split('@')[0] : '';
  return PROMPT_LABELS[base] || questionId || 'Question de qualification';
}

function optionLabel(opt) {
  return String(opt).replace(/_/g, ' ');
}

/* ── PriceResult (FIXEO_PRICE) ───────────────────────────────────── */
function renderPriceResult(outcome) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'result-identified', '✓ Intervention identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  var amountMAD = outcome.price && outcome.price.amount_mad;
  var amtNum = amountMAD != null ? Math.round(amountMAD).toString() : '—';

  var priceContainer = el('div', 'result-price-container');
  var priceRow = el('div', 'result-price');
  priceRow.appendChild(el('span', 'result-price-number', amtNum));
  priceRow.appendChild(el('span', 'result-price-unit', 'MAD'));
  priceContainer.appendChild(priceRow);
  priceContainer.appendChild(el('div', 'result-price-label', 'PRIX FIXEO'));
  priceContainer.appendChild(el('div', 'result-price-scope', 'Applicable au périmètre identifié'));
  body.appendChild(priceContainer);

  body.appendChild(renderScopeChips(outcome.scope_summary, outcome.exclusions_summary));
  return body;
}

/* ── CalculatedPriceResult ────────────────────────────────────────── */
function renderCalculatedPriceResult(outcome, session) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'result-identified', '✓ Intervention identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  var engineResult = session && session.engine_result;
  var pricing = engineResult && engineResult.pricing;
  if (pricing && pricing.calculation_model === 'TIME_BASED_TEAM') {
    var ki = session.known_inputs || {};
    var wc = ki.worker_count || '?';
    var h  = ki.hours || '?';
    var rate = pricing.base_amount_mad ? Math.round(pricing.base_amount_mad / (wc * h)) : '?';
    body.appendChild(el('div', 'result-basis',
      wc + ' prestataire(s) × ' + h + ' heure(s) × ' + rate + ' MAD'));
  }

  var amountMAD = outcome.price && outcome.price.amount_mad;
  var amtNum = amountMAD != null ? Math.round(amountMAD).toString() : '—';

  var priceContainer = el('div', 'result-price-container');
  var priceRow = el('div', 'result-price');
  priceRow.appendChild(el('span', 'result-price-number', amtNum));
  priceRow.appendChild(el('span', 'result-price-unit', 'MAD'));
  priceContainer.appendChild(priceRow);
  priceContainer.appendChild(el('div', 'result-price-label', 'PRIX FIXEO'));
  priceContainer.appendChild(el('div', 'result-price-scope', 'Applicable au périmètre identifié'));
  body.appendChild(priceContainer);

  body.appendChild(renderScopeChips(outcome.scope_summary, outcome.exclusions_summary));
  return body;
}

/* ── LabourPartResult ────────────────────────────────────────────── */
function renderLabourPartResult(outcome) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'result-identified', '✓ Intervention identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  var labourAmt = outcome.price && outcome.price.labour_amount_mad;

  var labourCard = el('div', 'labour-card');
  labourCard.appendChild(el('div', 'labour-card__label', 'Main-d\'œuvre FIXEO'));
  var amountEl = el('div', 'labour-card__amount');
  amountEl.appendChild(el('span', '', labourAmt != null ? Math.round(labourAmt).toString() : '—'));
  amountEl.appendChild(el('span', 'result-price-unit', 'MAD'));
  labourCard.appendChild(amountEl);
  body.appendChild(labourCard);

  // part-card is separate — labour+part NEVER summed
  var partCard = el('div', 'part-card');
  partCard.appendChild(el('div', 'part-card__label', 'Pièce / matériel'));
  partCard.appendChild(el('div', 'part-card__value', 'Prix séparé — à confirmer avec l\'artisan'));
  body.appendChild(partCard);

  // labour-disclosure: part price must be disclosed (Si l'artisan fournit la pièce...)
  body.appendChild(el('div', 'labour-disclosure',
    'Si l\'artisan fournit la pièce, son prix doit vous être communiqué et approuvé avant installation.'));

  return body;
}

/* ── DiagnosticResult ────────────────────────────────────────────── */
function renderDiagnosticResult(outcome) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'result-identified', '✓ Intervention identifiée'));
  body.appendChild(el('div', 'diagnostic-intro', 'Un diagnostic est nécessaire avant réparation.'));

  var amountMAD = outcome.price && (outcome.price.amount_mad || outcome.diagnostic_price_mad);
  var amtNum = amountMAD != null ? Math.round(amountMAD).toString() : '—';

  var priceContainer = el('div', 'result-price-container');
  var priceRow = el('div', 'result-price');
  priceRow.appendChild(el('span', 'result-price-number', amtNum));
  priceRow.appendChild(el('span', 'result-price-unit', 'MAD'));
  priceContainer.appendChild(priceRow);
  priceContainer.appendChild(el('div', 'result-price-label', 'DIAGNOSTIC FIXEO'));
  body.appendChild(priceContainer);

  body.appendChild(el('div', 'diagnostic-absorption',
    'Ce diagnostic peut être déduit d\'une réparation éligible selon les conditions du service.'));

  return body;
}

/* ── QuoteResult ─────────────────────────────────────────────────── */
function renderQuoteResult(outcome) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'quote-title', 'Cette intervention doit être vérifiée sur place.'));
  body.appendChild(el('div', 'quote-reason',
    'FIXEO vous oriente vers un devis adapté au périmètre réel.'));
  return body;
}

/* ── RouteResult ─────────────────────────────────────────────────── */
function renderRouteResult(outcome) {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'route-title', 'RAFI a identifié un autre métier plus adapté.'));
  var targetMetier = (outcome && (outcome.route_target_metier || outcome.target_metier)) || 'serrurerie';
  body.appendChild(el('div', 'route-sub',
    'Métier recommandé : ' + (METIER_LABELS[targetMetier] || targetMetier)));
  return body;
}

/* ── SafetyResult ────────────────────────────────────────────────── */
function renderSafetyResult(outcome) {
  var body = el('div', 'estimator-body step-enter safety-stop-body');

  var safetyWrap = el('div', 'safety-surface');
  safetyWrap.appendChild(el('span', 'safety-icon', '⚠'));
  var st = el('h2', 'safety-title', 'Une vérification est nécessaire avant de continuer.');
  st.setAttribute('id', 'safety-heading');
  safetyWrap.appendChild(st);

  var reason = (outcome && outcome.safety_reason) ? outcome.safety_reason
    : 'Pour votre sécurité, nous ne pouvons pas établir un prix dans cette situation.';
  safetyWrap.appendChild(el('div', 'safety-body', reason));
  safetyWrap.appendChild(el('div', 'safety-body',
    'Nous vous recommandons de contacter un professionnel qualifié.'));
  body.appendChild(safetyWrap);

  return body;
}

/* ── RequalificationResult ───────────────────────────────────────── */
function renderRequalifyResult() {
  var body = el('div', 'estimator-body step-enter result-enter');
  body.appendChild(el('div', 'requali-title', 'Votre besoin dépasse le périmètre du prix standard.'));
  body.appendChild(el('div', 'requali-body',
    'L\'intervention nécessite une évaluation spécifique. Un artisan FIXEO vous contactera pour convenir d\'un devis.'));
  return body;
}

/* ── Modal→Page Handoff ──────────────────────────────────────────── */
function renderHandoff() {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'handoff-title', 'RAFI vérifie votre intervention'));
  body.appendChild(el('div', 'handoff-body',
    'Quelques précisions supplémentaires sont nécessaires pour calculer correctement le prix.'));
  return body;
}

/* ── EstimatorFooter ─────────────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════════════
   ESTIMATOR FLOW CONTROLLER
   ═══════════════════════════════════════════════════════════════════ */

function EstimatorModal(rootEl, opts) {
  opts = opts || {};
  STATE.onClose = opts.onClose || function() {};
  STATE.onPageHandoff = opts.onPageHandoff || function() {};
  STATE.history = [];
  STATE.pendingAnswer = null;
  STATE.quantityValue = null;
  STATE.measurementValue = null;

  this._root = rootEl;
  this._session = null;
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

  modal.appendChild(renderHeader({}));

  var progressSlot = el('div', '');
  progressSlot.setAttribute('id', 'progress-slot');
  modal.appendChild(progressSlot);

  var ctxSlot = el('div', '');
  ctxSlot.setAttribute('id', 'ctx-slot');
  modal.appendChild(ctxSlot);

  var bodySlot = el('div', '');
  bodySlot.setAttribute('id', 'body-slot');
  modal.appendChild(bodySlot);

  var footerSlot = el('div', '');
  footerSlot.setAttribute('id', 'footer-slot');
  modal.appendChild(footerSlot);

  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  trapFocus(modal);
  setRAFIState('idle');
  this._renderEntry();
};

EstimatorModal.prototype._update = function(bodyEl, footerEl, session) {
  var progressSlot = document.getElementById('progress-slot');
  var ctxSlot = document.getElementById('ctx-slot');
  var bodySlot = document.getElementById('body-slot');
  var footerSlot = document.getElementById('footer-slot');
  var modal = document.querySelector('.estimator-modal');

  var stage = stageFromState(session && session.state);

  // Progress de-emphasis on result screens
  if (modal) {
    if (stage === 'RESULTAT') {
      modal.classList.add('result-active');
    } else {
      modal.classList.remove('result-active');
    }
  }

  progressSlot.innerHTML = '';
  progressSlot.appendChild(renderProgress(stage));

  ctxSlot.innerHTML = '';
  if (session) {
    var ctxEl = renderContext(session);
    if (ctxEl) ctxSlot.appendChild(ctxEl);
  }

  bodySlot.innerHTML = '';
  bodySlot.appendChild(bodyEl);

  footerSlot.innerHTML = '';
  footerSlot.appendChild(footerEl);
};

/* Entry screen */
EstimatorModal.prototype._renderEntry = function() {
  var self = this;
  setRAFIState('idle');
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('h2', 'entry-headline', 'Que faut-il réparer, installer ou entretenir ?'));

  var inputWrap = el('div', 'entry-input-wrap');
  var textarea = el('textarea', 'entry-input');
  textarea.setAttribute('placeholder', 'Ex. Ma porte frotte au sol et ferme mal');
  textarea.setAttribute('rows', '3');
  textarea.setAttribute('aria-label', 'Décrivez votre besoin');
  inputWrap.appendChild(textarea);
  body.appendChild(inputWrap);

  body.appendChild(el('div', '', '<span style="font-size:12px;color:#8A8784;margin-bottom:6px;display:block;">Ou choisissez directement :</span>'));
  var metierGrid = el('div', 'metier-shortcuts');
  var metiers = [
    { code: 'plomberie', icon: '🔧', label: 'Plomberie' },
    { code: 'electricite', icon: '⚡', label: 'Électricité' },
    { code: 'menuiserie', icon: '🚪', label: 'Menuiserie' },
    { code: 'serrurerie', icon: '🔑', label: 'Serrurerie' },
    { code: 'nettoyage', icon: '🧹', label: 'Nettoyage' },
    { code: 'peinture', icon: '🖌', label: 'Peinture' },
    { code: 'climatisation', icon: '❄️', label: 'Climatisation' },
    { code: 'bricolage', icon: '🛠', label: 'Bricolage' },
  ];
  metiers.forEach(function(m) {
    var chip = el('button', 'metier-chip', m.icon + ' ' + m.label);
    chip.setAttribute('type', 'button');
    chip.addEventListener('click', function() { self._startWithMetier(m.code); });
    metierGrid.appendChild(chip);
  });
  body.appendChild(metierGrid);

  var footer = renderFooter({
    primaryLabel: 'Continuer',
    primaryDisabled: false,
    onPrimary: function() {
      var txt = textarea.value.trim();
      if (txt) {
        self._startWithFreeText(txt);
      } else {
        self._renderMetierSelection();
      }
    },
  });

  this._update(body, footer, null);
};

EstimatorModal.prototype._startWithFreeText = function(txt) {
  this._renderMetierSelection({ free_text: txt });
};

EstimatorModal.prototype._startWithMetier = function(metier) {
  var self = this;
  var adapter = getAdapter();
  var result = adapter.startSession({ entry_point: 'DIRECT_CTA', metier_hint: metier });
  if (!result.ok) { this._renderError(result.error); return; }
  STATE.history.push(null);
  this._session = result.session;
  setRAFIState('analyzing');
  triggerIntelligenceLine();
  this._advance(result.session);
};

EstimatorModal.prototype._renderMetierSelection = function(opts) {
  var self = this;
  opts = opts || {};
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('h2', 'question-heading', 'Quel type de prestation souhaitez-vous ?'));

  var metiers = [
    { code: 'plomberie',    label: '🔧 Plomberie' },
    { code: 'electricite',  label: '⚡ Électricité' },
    { code: 'menuiserie',   label: '🚪 Menuiserie' },
    { code: 'serrurerie',   label: '🔑 Serrurerie' },
    { code: 'nettoyage',    label: '🧹 Nettoyage' },
    { code: 'peinture',     label: '🖌 Peinture' },
    { code: 'climatisation',label: '❄️ Climatisation' },
    { code: 'bricolage',    label: '🛠 Bricolage' },
  ];

  var cards = el('div', 'answer-cards');
  metiers.forEach(function(m) {
    var card = el('button', 'answer-card', '');
    card.setAttribute('type', 'button');
    var check = el('span', 'answer-card__check', '');
    check.setAttribute('aria-hidden', 'true');
    card.appendChild(check);
    card.appendChild(el('span', 'answer-card__label', m.label));
    card.addEventListener('click', function() { self._startWithMetier(m.code); });
    cards.appendChild(card);
  });
  body.appendChild(cards);

  var footer = renderFooter({ showBack: true, onBack: function() { self._renderEntry(); } });
  this._update(body, footer, null);
};

EstimatorModal.prototype._renderServiceSelection = function(session, candidates) {
  var self = this;
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('h2', 'question-heading', 'Quel type d\'intervention ?'));

  var adapter = getAdapter();
  var cards = el('div', 'answer-cards');
  (candidates || []).forEach(function(svc) {
    var label = (svc.label && svc.label !== 'undefined') ? svc.label : svc.service_code.split('.').pop().replace(/_/g, ' ');
    var card = el('button', 'answer-card', '');
    card.setAttribute('type', 'button');
    var check = el('span', 'answer-card__check', '');
    check.setAttribute('aria-hidden', 'true');
    card.appendChild(check);
    card.appendChild(el('span', 'answer-card__label', label));
    card.addEventListener('click', function() {
      STATE.history.push(session);
      setRAFIState('analyzing');
      triggerIntelligenceLine();
      var res = adapter.selectService(session, svc.service_code);
      if (!res.ok) { self._renderError(res.error); return; }
      self._session = res.session;
      self._advance(res.session);
    });
    cards.appendChild(card);
  });
  body.appendChild(cards);

  var footer = renderFooter({ showBack: true, onBack: function() { self._back(); } });
  this._update(body, footer, session);
};

EstimatorModal.prototype._advance = function(session) {
  var self = this;
  var adapter = getAdapter();

  if (session.ui_recommendation === 'PAGE_REQUIRED') {
    this._renderHandoffScreen(session, true);
    return;
  }

  var step = adapter.getNextStep(session);
  if (!step.ok) { this._renderError(step.error); return; }

  var s = step.step;

  if (s.type === 'METIER_SELECTION') {
    this._renderMetierSelection();
    return;
  }

  if (s.type === 'SERVICE_SELECTION') {
    this._renderServiceSelection(session, s.candidate_services);
    return;
  }

  if (s.type === 'QUESTION') {
    if (session.ui_recommendation === 'PAGE_RECOMMENDED') {
      this._renderHandoffScreen(session, false);
      return;
    }
    setRAFIState('verifying');
    this._renderQuestionScreen(session, s);
    return;
  }

  if (s.type === 'READY') {
    setRAFIState('analyzing');
    var evalRes = adapter.evaluate(session);
    if (!evalRes.ok) { this._renderError(evalRes.error); return; }
    self._session = evalRes.session;
    setRAFIState('complete');
    triggerIntelligenceLine();
    self._renderOutcome(evalRes.session);
    return;
  }

  if (s.type === 'OUTCOME') {
    setRAFIState('complete');
    this._renderOutcome(session);
    return;
  }

  this._renderError({ code: 'UNEXPECTED_STEP', step: s.type });
};

EstimatorModal.prototype._renderQuestionScreen = function(session, step) {
  var self = this;
  var adapter = getAdapter();
  STATE.pendingAnswer = null;
  STATE.quantityValue = step.answer_type === 'integer' ? 1 : null;

  var isBoolean = step.answer_type === 'boolean';
  var isQty = step.answer_type === 'integer';
  var isMeasurement = step.input_id && step.input_id.indexOf('painted_m2') >= 0;

  // Auto-advance callback for boolean answers
  var onAutoAdvance = isBoolean ? function(val) {
    STATE.pendingAnswer = val;
    triggerIntelligenceLine();
    setRAFIState('analyzing');
    STATE.history.push(session);
    var res = adapter.answerQuestion(session, step.question_id, val);
    if (!res.ok) { self._renderError(res.error); return; }
    self._session = res.session;
    self._advance(res.session);
  } : null;

  var body = renderQuestion(step, onAutoAdvance);

  var footer = renderFooter({
    primaryLabel: 'Continuer',
    primaryDisabled: !isQty,
    showBack: STATE.history.length > 0,
    onBack: function() { self._back(); },
    onPrimary: function() {
      var answer = STATE.pendingAnswer;
      if (isQty) answer = STATE.quantityValue || 1;
      if (isMeasurement) answer = STATE.measurementValue;
      if (answer === null || answer === undefined) return;

      triggerIntelligenceLine();
      setRAFIState('analyzing');
      STATE.history.push(session);
      var res = adapter.answerQuestion(session, step.question_id, answer);
      if (!res.ok) { self._renderError(res.error); return; }
      self._session = res.session;
      self._advance(res.session);
    },
  });

  this._update(body, footer, session);
};

EstimatorModal.prototype._renderOutcome = function(session) {
  var self = this;
  var outcome = session.outcome || {};
  var outcomeType = session.state;
  var comercialType = outcome.commercial_output_type;

  var body, primaryLabel, primaryHandler, secondaryLabel, secondaryHandler;
  secondaryLabel = 'Modifier mon besoin';
  secondaryHandler = function() { self._renderEntry(); };

  // Assign outcome_type for ctaLabel
  var outcomeForCta = Object.assign({}, outcome, { outcome_type: outcomeType });

  if (outcomeType === 'PRICE_READY' && comercialType === 'FIXEO_CALCULATED_PRICE') {
    body = renderCalculatedPriceResult(outcome, session);
    setRAFIState('complete');
    primaryLabel = ctaLabel(outcomeForCta);
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else if (outcomeType === 'PRICE_READY') {
    body = renderPriceResult(outcome);
    setRAFIState('complete');
    primaryLabel = ctaLabel(outcomeForCta);
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else if (outcomeType === 'LABOUR_PLUS_PART_READY') {
    body = renderLabourPartResult(outcome);
    setRAFIState('complete');
    primaryLabel = ctaLabel(outcomeForCta);
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else if (outcomeType === 'DIAGNOSTIC_READY') {
    body = renderDiagnosticResult(outcome);
    setRAFIState('identified');
    primaryLabel = ctaLabel(outcomeForCta);
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else if (outcomeType === 'QUOTE_REQUIRED') {
    body = renderQuoteResult(outcome);
    setRAFIState('complete');
    primaryLabel = ctaLabel(outcomeForCta);
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else if (outcomeType === 'ROUTE_REQUIRED') {
    body = renderRouteResult(outcome);
    var target = outcome.route_target_metier || outcome.target_metier || 'serrurerie';
    setRAFIState('complete');
    primaryLabel = 'Continuer en ' + (METIER_LABELS[target] || target);
    primaryHandler = function() { self._startWithMetier(target); };

  } else if (outcomeType === 'SAFETY_STOP') {
    body = renderSafetyResult(outcome);
    setRAFIState('idle');
    primaryLabel = null;
    secondaryLabel = 'Fermer';
    secondaryHandler = function() { STATE.onClose(); };

  } else if (outcomeType === 'REQUALIFY') {
    body = renderRequalifyResult();
    setRAFIState('complete');
    primaryLabel = 'Demander un devis';
    primaryHandler = function() { showHandoffScreen(session, outcome); };

  } else {
    body = el('div', 'estimator-body step-enter');
    body.appendChild(el('p', '', 'Résultat : ' + outcomeType));
    primaryLabel = null;
  }

  var footerOpts = {
    secondaryLabel: secondaryLabel,
    onSecondary: secondaryHandler,
    showBack: false,
  };
  if (primaryLabel) {
    footerOpts.primaryLabel = primaryLabel;
    footerOpts.primaryDisabled = false;
    footerOpts.onPrimary = primaryHandler;
  }

  var footer = renderFooter(footerOpts);
  this._update(body, footer, session);

  var live = document.getElementById('aria-live-result');
  if (live) live.textContent = 'Résultat : ' + outcomeType;
};

EstimatorModal.prototype._renderHandoffScreen = function(session, isRequired) {
  var self = this;
  setRAFIState('verifying');
  var body = renderHandoff();
  var footer = renderFooter({
    primaryLabel: 'Continuer l\'estimation',
    onPrimary: function() {
      if (STATE.onPageHandoff) STATE.onPageHandoff(session);
    },
    secondaryLabel: 'Modifier mon besoin',
    onSecondary: function() { self._renderEntry(); },
  });
  this._update(body, footer, session);
};

EstimatorModal.prototype._back = function() {
  if (STATE.history.length === 0) { this._renderEntry(); return; }
  var prev = STATE.history.pop();
  if (!prev) { this._renderEntry(); return; }
  this._session = prev;
  this._advance(prev);
};

EstimatorModal.prototype._renderError = function(err) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('p', 'diagnostic-intro',
    'Une erreur est survenue : ' + (err && err.code ? err.code : JSON.stringify(err))));
  var footer = renderFooter({
    primaryLabel: 'Recommencer',
    onPrimary: function() { location.reload(); },
  });
  this._update(body, footer, null);
};

/* ─── EstimatorSummary (page mode) ─────────────────────────────── */
function renderSummary(session, knownSelections) {
  var summary = el('div', 'page-summary');
  summary.setAttribute('id', 'estimator-summary');
  summary.setAttribute('aria-label', 'Résumé de votre demande');
  summary.appendChild(el('div', 'summary-heading', 'Votre demande'));

  if (session && session.metier) {
    var item = el('div', 'summary-item');
    item.appendChild(el('div', 'summary-item__key', 'Métier'));
    item.appendChild(el('div', 'summary-item__val', METIER_LABELS[session.metier] || session.metier));
    summary.appendChild(item);
  }

  if (session && session.service_code) {
    var svcItem = el('div', 'summary-item');
    svcItem.appendChild(el('div', 'summary-item__key', 'Service'));
    svcItem.appendChild(el('div', 'summary-item__val',
      session.service_code.split('.').pop().replace(/_/g, ' ')));
    summary.appendChild(svcItem);
  }

  var progressItem = el('div', 'summary-item');
  progressItem.appendChild(el('div', 'summary-item__key', 'Étape'));
  progressItem.appendChild(el('div', 'summary-item__val',
    stageFromState(session && session.state) === 'PRECISIONS' ? 'Précisions' : 'Besoin'));
  summary.appendChild(progressItem);

  return summary;
}

/* ─── Public API ────────────────────────────────────────────────── */
function launchEstimator(rootEl, context, opts) {
  opts = opts || {};
  var modal = new EstimatorModal(rootEl, opts);
  modal.render();

  if (context && (context.service_hint || context.metier_hint)) {
    var adapter = getAdapter();
    var result = adapter.startSession(context);
    if (result.ok) {
      STATE.history.push(null);
      modal._session = result.session;
      modal._advance(result.session);
    }
  }

  return modal;
}

/* Node.js export for tests */
if (typeof module !== 'undefined') {
  module.exports = {
    launchEstimator: launchEstimator,
    EstimatorModal: EstimatorModal,
    renderPriceResult: renderPriceResult,
    renderCalculatedPriceResult: renderCalculatedPriceResult,
    renderLabourPartResult: renderLabourPartResult,
    renderDiagnosticResult: renderDiagnosticResult,
    renderQuoteResult: renderQuoteResult,
    renderRouteResult: renderRouteResult,
    renderSafetyResult: renderSafetyResult,
    renderRequalifyResult: renderRequalifyResult,
    renderScopeList: renderScopeList,
    renderScopeChips: renderScopeChips,
    renderSummary: renderSummary,
    renderProgress: renderProgress,
    renderHeader: renderHeader,
    renderHandoff: renderHandoff,
    stageFromState: stageFromState,
    formatMAD: formatMAD,
    ctaLabel: ctaLabel,
    setRAFIState: setRAFIState,
    showHandoffScreen: showHandoffScreen,
    RAFI_STATES: RAFI_STATES,
    ABSORPTION_COPY: ABSORPTION_COPY,
    METIER_LABELS: METIER_LABELS,
    STATE: STATE,
  };
}
