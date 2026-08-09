/* ═══════════════════════════════════════════════════════════════════
   FIXEO Estimator Dormant Visual Prototype — Phase 7C.8B
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

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT RENDERERS
   ═══════════════════════════════════════════════════════════════════ */

/* EstimatorHeader */
function renderHeader(opts) {
  opts = opts || {};
  var header = el('div', 'estimator-header');
  header.setAttribute('id', 'estimator-header');

  var glyph = el('div', 'estimator-header__rafi', 'R');
  header.appendChild(glyph);

  var titleWrap = el('div', 'estimator-header__title');
  titleWrap.appendChild(el('div', '', 'Estimation FIXEO'));
  if (opts.subline) {
    titleWrap.appendChild(el('div', 'estimator-header__sub', opts.subline));
  }
  header.appendChild(titleWrap);

  var closeBtn = el('button', 'estimator-header__close', '×');
  closeBtn.setAttribute('aria-label', 'Fermer l\'estimation');
  closeBtn.setAttribute('id', 'estimator-close');
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
  var ctx = el('div', 'estimator-context');
  var entry = session.entry_context && session.entry_context.entry_point;
  var rafiText = (entry === 'RAFI') ? 'RAFI a identifié :' : 'RAFI a identifié :';
  var rafi = el('span', 'rafi-indicator', rafiText);
  ctx.appendChild(rafi);

  var info = [];
  if (session.metier) info.push(METIER_LABELS[session.metier] || session.metier);
  if (session.service_label) info.push(session.service_label);
  if (info.length) {
    ctx.appendChild(el('span', 'rafi-identified', info.join(' — ')));
  }
  return ctx;
}

/* RAFIIndicator (verifying) */
function renderRAFIVerifying() {
  var ctx = el('div', 'estimator-context');
  ctx.appendChild(el('span', 'rafi-indicator', 'RAFI'));
  ctx.appendChild(el('span', '', 'vérifie quelques détails avant d\'afficher le prix.'));
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

/* YesNoChoice */
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

/* EstimatorQuestion — renders one question screen */
function renderQuestion(step) {
  var isSafety = step.priority === 'SAFETY';
  var body = el('div', 'estimator-body step-enter' + (isSafety ? ' question-safety' : ''));

  if (isSafety) {
    body.classList.add('question-safety');
    var note = el('div', 'question-safety-note');
    note.innerHTML = '⚠ Cette question concerne la sécurité. Répondez avec précision.';
    body.appendChild(note);
  }

  var heading = el('h2', 'question-heading');
  heading.setAttribute('id', 'question-heading');
  heading.textContent = promptFromKey(step.prompt_key, step.question_id);
  body.appendChild(heading);

  STATE.pendingAnswer = null;

  var onSelect = function(val) {
    STATE.pendingAnswer = val;
    // Re-render cards with updated selection
    body.querySelectorAll('.answer-card').forEach(function(c) {
      var v = c.__optValue;
      var sel = (v === val || (val === true && v === true) || (val === false && v === false));
      c.classList.toggle('selected', sel);
      c.setAttribute('aria-checked', sel ? 'true' : 'false');
      c.querySelector('.answer-card__check').textContent = sel ? '✓' : '';
    });
    updateCTA(true);
  };

  if (step.answer_type === 'boolean') {
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
    // Fallback: free text / single yes/no
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
  // Derive from question_id prefix
  var base = questionId ? questionId.split('@')[0] : '';
  return PROMPT_LABELS[base] || questionId || 'Question de qualification';
}

function optionLabel(opt) {
  return String(opt).replace(/_/g, ' ');
}

/* ── Scope List ─────────────────────────────────────────────────── */
function renderScopeList(included, excluded) {
  var defaultIncluded = ['Déplacement', 'Main-d\'oeuvre', 'Fournitures standard', 'Test final'];
  var items = (included && included.length > 0) ? included : defaultIncluded;
  var section = el('div', 'scope-section');

  var incHeading = el('div', 'scope-heading', 'Compris :');
  var incList = el('ul', 'scope-list');
  incList.setAttribute('aria-label', 'Ce qui est compris');
  items.forEach(function(item) {
    incList.appendChild(el('li', '', typeof item === 'string' ? item : JSON.stringify(item)));
  });
  section.appendChild(incHeading);
  section.appendChild(incList);

  if (excluded && excluded.length > 0) {
    var excHeading = el('div', 'scope-heading', 'Non compris :');
    var excList = el('ul', 'scope-list');
    excList.setAttribute('aria-label', 'Ce qui n\'est pas compris');
    excluded.forEach(function(item) {
      excList.appendChild(el('li', '', typeof item === 'string' ? item : JSON.stringify(item)));
    });
    section.appendChild(excHeading);
    section.appendChild(excList);
  }

  var doctrine = el('p', 'scope-doctrine',
    'Ce prix s\'applique au périmètre indiqué. Si l\'intervention réelle est différente, ' +
    'l\'artisan doit vous l\'expliquer et obtenir votre accord avant de continuer.');
  section.appendChild(doctrine);
  return section;
}

/* ── PriceResult (FIXEO_PRICE / ADD_ON) ─────────────────────────── */
function renderPriceResult(outcome) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'result-identified', '✓ Votre intervention est identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  // Price comes from orchestrator outcome — UI does NOT compute this
  var amountMAD = outcome.price && outcome.price.amount_mad;
  body.appendChild(el('div', 'result-price', formatMAD(amountMAD)));
  body.appendChild(el('div', 'result-price-label', 'PRIX FIXEO'));

  body.appendChild(renderScopeList(outcome.scope_summary, outcome.exclusions_summary));
  return body;
}

/* ── CalculatedPriceResult (FIXEO_CALCULATED_PRICE) ─────────────── */
function renderCalculatedPriceResult(outcome, session) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'result-identified', '✓ Votre intervention est identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  // Build basis line from engine_result trace — UI reads, does NOT recalculate
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
  body.appendChild(el('div', 'result-price', formatMAD(amountMAD)));
  body.appendChild(el('div', 'result-price-label', 'Prix FIXEO calculé'));
  body.appendChild(renderScopeList(outcome.scope_summary, outcome.exclusions_summary));
  return body;
}

/* ── LabourPartResult ────────────────────────────────────────────── */
function renderLabourPartResult(outcome) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'result-identified', '✓ Votre intervention est identifiée'));

  var name = outcome.service_code ? outcome.service_code.split('.').pop().replace(/_/g, ' ') : 'Prestation';
  body.appendChild(el('div', 'result-service-name', name));

  var cards = el('div', 'labour-part-cards');

  // Card 1 — Labour (amount from orchestrator)
  var labourAmt = outcome.price && outcome.price.labour_amount_mad;
  var labour = el('div', 'labour-card');
  labour.appendChild(el('div', 'labour-card__label', 'Main-d\'oeuvre FIXEO'));
  labour.appendChild(el('div', 'labour-card__amount', formatMAD(labourAmt)));
  cards.appendChild(labour);

  // Card 2 — Part (never summed with labour)
  var part = el('div', 'part-card');
  part.appendChild(el('div', 'part-card__label', 'Pièce / matériel'));
  part.appendChild(el('div', 'part-card__value', 'Non compris dans les ' + formatMAD(labourAmt)));
  cards.appendChild(part);

  body.appendChild(cards);
  body.appendChild(el('div', 'part-disclosure',
    'Si l\'artisan fournit la pièce, son prix doit vous être communiqué et approuvé avant installation.'));
  return body;
}

/* ── DiagnosticResult ────────────────────────────────────────────── */
function renderDiagnosticResult(outcome) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'diagnostic-intro',
    'Votre intervention nécessite d\'abord un diagnostic.'));

  // Amount from orchestrator — exact integer, no "environ"
  var amountMAD = outcome.price && (outcome.price.amount_mad || outcome.diagnostic_price_mad);
  body.appendChild(el('div', 'result-price', formatMAD(amountMAD)));
  body.appendChild(el('div', 'result-price-label', 'Diagnostic FIXEO'));

  var metier = outcome.service_code ? outcome.service_code.split('.')[0] : 'plomberie';
  var absorption = ABSORPTION_COPY[metier] || ABSORPTION_COPY['electricite'];
  body.appendChild(el('div', 'diagnostic-absorption', absorption));
  return body;
}

/* ── QuoteResult ─────────────────────────────────────────────────── */
function renderQuoteResult(outcome) {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'quote-title', 'Cette intervention nécessite un devis.'));
  body.appendChild(el('div', 'quote-reason',
    'L\'intervention dépasse le périmètre standard et requiert une évaluation personnalisée sur place.'));
  // No price — QUOTE_REQUIRED is a valid outcome, not an error
  return body;
}

/* ── RouteResult ─────────────────────────────────────────────────── */
function renderRouteResult(outcome) {
  var body = el('div', 'estimator-body step-enter');
  var targetMetier = (outcome && outcome.route_target_metier) || 'serrurerie';
  body.appendChild(el('div', 'route-title',
    'Cette intervention relève plutôt de la ' + (METIER_LABELS[targetMetier] || targetMetier) + '.'));
  body.appendChild(el('div', 'route-sub',
    'FIXEO vous redirige vers le bon type d\'artisan.'));
  return body;
}

/* ── SafetyResult ────────────────────────────────────────────────── */
function renderSafetyResult() {
  var body = el('div', 'estimator-body step-enter safety-stop-body');
  body.appendChild(el('div', 'safety-icon', '⚠'));
  body.appendChild(el('h2', 'safety-title', 'Une vérification est nécessaire avant de continuer.'));
  body.appendChild(el('div', 'safety-body',
    'Pour votre sécurité, nous ne pouvons pas établir un prix dans cette situation. ' +
    'Veuillez cesser d\'utiliser l\'installation et contacter un professionnel qualifié.'));
  // No price — safety stop never shows price
  return body;
}

/* ── RequalificationResult ───────────────────────────────────────── */
function renderRequalifyResult() {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'requali-title', 'Votre besoin dépasse le périmètre du prix standard.'));
  body.appendChild(el('div', 'requali-body',
    'L\'intervention nécessite une évaluation spécifique. Un artisan FIXEO vous contactera pour convenir d\'un devis.'));
  return body;
}

/* ── Modal→Page Handoff Screen ───────────────────────────────────── */
function renderHandoff() {
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('div', 'handoff-title',
    'Cette intervention demande quelques précisions supplémentaires.'));
  body.appendChild(el('div', 'handoff-body',
    'Nous allons continuer dans la page estimation pour finaliser votre demande.'));
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

  // Backdrop
  var backdrop = el('div', 'estimator-backdrop');
  backdrop.setAttribute('id', 'estimator-backdrop');
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) STATE.onClose();
  });

  // Modal container
  var modal = el('div', 'estimator-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'estimator-header');

  // Header
  var subline = 'Identifions l\'intervention et son prix.';
  modal.appendChild(renderHeader({ subline: subline }));

  // Progress placeholder
  var progressSlot = el('div', '');
  progressSlot.setAttribute('id', 'progress-slot');
  modal.appendChild(progressSlot);

  // Context placeholder
  var ctxSlot = el('div', '');
  ctxSlot.setAttribute('id', 'ctx-slot');
  modal.appendChild(ctxSlot);

  // Body placeholder
  var bodySlot = el('div', '');
  bodySlot.setAttribute('id', 'body-slot');
  modal.appendChild(bodySlot);

  // Footer placeholder
  var footerSlot = el('div', '');
  footerSlot.setAttribute('id', 'footer-slot');
  modal.appendChild(footerSlot);

  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  trapFocus(modal);

  // Start entry screen
  this._renderEntry();
};

EstimatorModal.prototype._update = function(bodyEl, footerEl, session) {
  var progressSlot = document.getElementById('progress-slot');
  var ctxSlot = document.getElementById('ctx-slot');
  var bodySlot = document.getElementById('body-slot');
  var footerSlot = document.getElementById('footer-slot');

  var stage = stageFromState(session && session.state);
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
  var body = el('div', 'estimator-body step-enter');
  body.appendChild(el('h2', 'entry-headline', 'Que faut-il réparer, installer ou entretenir ?'));

  var inputWrap = el('div', 'entry-input-wrap');
  var textarea = el('textarea', 'entry-input');
  textarea.setAttribute('placeholder', 'Ex. Ma porte frotte au sol et ferme mal');
  textarea.setAttribute('rows', '3');
  textarea.setAttribute('aria-label', 'Décrivez votre besoin');
  inputWrap.appendChild(textarea);
  body.appendChild(inputWrap);

  // Métier shortcuts
  body.appendChild(el('div', '', '<span style="font-size:12px;color:#A0A0A0;margin-bottom:6px;display:block;">Ou choisissez directement :</span>'));
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
        // No text — show métier selection
        self._renderMetierSelection();
      }
    },
  });

  this._update(body, footer, null);
};

/* Direct-text entry → show métier selection (no AI classifier in prototype) */
EstimatorModal.prototype._startWithFreeText = function(txt) {
  this._renderMetierSelection({ free_text: txt });
};

EstimatorModal.prototype._startWithMetier = function(metier) {
  var self = this;
  var adapter = getAdapter();
  var result = adapter.startSession({ entry_point: 'DIRECT_CTA', metier_hint: metier });
  if (!result.ok) { this._renderError(result.error); return; }
  STATE.history.push(null); // entry
  this._session = result.session;
  this._advance(result.session);
};

/* Métier selection screen */
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

/* Service selection screen */
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
      var res = adapter.selectService(session, svc.service_code);
      if (!res.ok) { self._renderError(res.error); return; }
      self._session = res.session;
      self._advance(res.session);
    });
    cards.appendChild(card);
  });
  body.appendChild(cards);

  var footer = renderFooter({
    showBack: true,
    onBack: function() { self._back(); },
  });
  this._update(body, footer, session);
};

/* Advance: interrogate orchestrator for next step */
EstimatorModal.prototype._advance = function(session) {
  var self = this;
  var adapter = getAdapter();

  // Check UI recommendation for page handoff
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
    // Check PAGE_RECOMMENDED threshold (4+ questions)
    if (session.ui_recommendation === 'PAGE_RECOMMENDED') {
      this._renderHandoffScreen(session, false);
      return;
    }
    this._renderQuestionScreen(session, s);
    return;
  }

  if (s.type === 'READY') {
    // Evaluate
    var evalRes = adapter.evaluate(session);
    if (!evalRes.ok) { this._renderError(evalRes.error); return; }
    self._session = evalRes.session;
    self._renderOutcome(evalRes.session);
    return;
  }

  if (s.type === 'OUTCOME') {
    this._renderOutcome(session);
    return;
  }

  this._renderError({ code: 'UNEXPECTED_STEP', step: s.type });
};

/* Question screen */
EstimatorModal.prototype._renderQuestionScreen = function(session, step) {
  var self = this;
  var adapter = getAdapter();
  STATE.pendingAnswer = null;
  STATE.quantityValue = step.answer_type === 'integer' ? 1 : null;

  var body = renderQuestion(step);
  var isQty = step.answer_type === 'integer';
  var isMeasurement = step.input_id && step.input_id.indexOf('painted_m2') >= 0;

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

      STATE.history.push(session);
      var res = adapter.answerQuestion(session, step.question_id, answer);
      if (!res.ok) { self._renderError(res.error); return; }
      self._session = res.session;
      self._advance(res.session);
    },
  });

  this._update(body, footer, session);
};

/* Outcome rendering */
EstimatorModal.prototype._renderOutcome = function(session) {
  var self = this;
  var outcome = session.outcome || {};
  var outcomeType = session.state;
  var comercialType = outcome.commercial_output_type;

  var body, primaryLabel, primaryHandler, secondaryLabel, secondaryHandler;
  secondaryLabel = 'Modifier mon besoin';
  secondaryHandler = function() { self._renderEntry(); };

  if (outcomeType === 'PRICE_READY' && comercialType === 'FIXEO_CALCULATED_PRICE') {
    body = renderCalculatedPriceResult(outcome, session);
    var amt = outcome.price && outcome.price.amount_mad;
    primaryLabel = 'Continuer avec ce prix — ' + formatMAD(amt);
    primaryHandler = function() { alert('Réservation → (dormante)'); };

  } else if (outcomeType === 'PRICE_READY') {
    body = renderPriceResult(outcome);
    var amt2 = outcome.price && outcome.price.amount_mad;
    primaryLabel = 'Continuer avec ce prix — ' + formatMAD(amt2);
    primaryHandler = function() { alert('Réservation → (dormante)'); };

  } else if (outcomeType === 'LABOUR_PLUS_PART_READY') {
    body = renderLabourPartResult(outcome);
    var labour = outcome.price && outcome.price.labour_amount_mad;
    primaryLabel = 'Continuer — Main-d\'oeuvre ' + formatMAD(labour);
    primaryHandler = function() { alert('Réservation → (dormante)'); };

  } else if (outcomeType === 'DIAGNOSTIC_READY') {
    body = renderDiagnosticResult(outcome);
    var diag = outcome.price && outcome.price.amount_mad;
    primaryLabel = 'Réserver le diagnostic — ' + formatMAD(diag);
    primaryHandler = function() { alert('Réservation diagnostic → (dormante)'); };

  } else if (outcomeType === 'QUOTE_REQUIRED') {
    body = renderQuoteResult(outcome);
    primaryLabel = 'Demander un devis';
    primaryHandler = function() { alert('Devis → (dormant)'); };

  } else if (outcomeType === 'ROUTE_REQUIRED') {
    body = renderRouteResult(outcome);
    var target = outcome.route_target_metier || 'serrurerie';
    primaryLabel = 'Continuer en ' + (METIER_LABELS[target] || target);
    primaryHandler = function() { self._startWithMetier(target); };

  } else if (outcomeType === 'SAFETY_STOP') {
    body = renderSafetyResult();
    primaryLabel = null;
    secondaryLabel = 'Fermer';
    secondaryHandler = function() { STATE.onClose(); };

  } else if (outcomeType === 'REQUALIFY') {
    body = renderRequalifyResult();
    primaryLabel = 'Demander un devis';
    primaryHandler = function() { alert('Devis → (dormant)'); };

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

  // Announce result for accessibility
  var live = document.getElementById('aria-live-result');
  if (live) live.textContent = 'Résultat : ' + outcomeType;
};

/* Modal → Page handoff screen */
EstimatorModal.prototype._renderHandoffScreen = function(session, isRequired) {
  var self = this;
  var body = renderHandoff();
  var footer = renderFooter({
    primaryLabel: 'Continuer l\'estimation',
    onPrimary: function() {
      // Serialize session and pass to /estimation page
      if (STATE.onPageHandoff) STATE.onPageHandoff(session);
    },
    secondaryLabel: 'Modifier mon besoin',
    onSecondary: function() { self._renderEntry(); },
  });
  this._update(body, footer, session);
};

/* Back */
EstimatorModal.prototype._back = function() {
  if (STATE.history.length === 0) { this._renderEntry(); return; }
  var prev = STATE.history.pop();
  if (!prev) { this._renderEntry(); return; }
  this._session = prev;
  this._advance(prev);
};

/* Error */
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

  // Progress stage — no price before engine result
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
    renderSummary: renderSummary,
    renderProgress: renderProgress,
    renderHeader: renderHeader,
    renderHandoff: renderHandoff,
    stageFromState: stageFromState,
    formatMAD: formatMAD,
    ABSORPTION_COPY: ABSORPTION_COPY,
    METIER_LABELS: METIER_LABELS,
    STATE: STATE,
  };
}
