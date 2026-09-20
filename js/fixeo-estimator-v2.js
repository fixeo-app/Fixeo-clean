/*!
 * js/fixeo-estimator-v2.js
 * FIXEO Estimator V2 — RAFI Core UX V3
 * Structural premium experience; engine/API contracts unchanged.
 *
 * Flow:
 *   1. COMPRENDRE
 *   2. IDENTIFIER
 *   3. VERIFIER
 *   4. PRIX FIXEO
 *
 * IMPORTANT:
 *   - UI/orchestration only.
 *   - Never calculates monetary values.
 *   - Never invents a métier from free text.
 *   - Never stores raw price amounts in sessionStorage.
 *   - Uses window.FixeoEstimatorAPI as the only estimator API boundary.
 */

(function() {
  'use strict';

  if (window._fxEstV2Loaded) return;

  // ───────────────────────────────────────────────────────────────────────────
  // Public disabled stub
  // ───────────────────────────────────────────────────────────────────────────

  window.FixeoEstimatorV2 = {
    open: function() {
      return Promise.resolve({
        accepted: false,
        reason: 'disabled'
      });
    },

    close: function() {},

    hide: function() {},

    reveal: function() {},

    isOpen: function() {
      return false;
    }
  };


  // ───────────────────────────────────────────────────────────────────────────
  // Preview override
  // ───────────────────────────────────────────────────────────────────────────

  var _isPreviewHost =
    typeof location !== 'undefined' &&
    location.hostname !== 'fixeo.ma' &&
    location.hostname !== 'www.fixeo.ma';

  var _previewOverride =
    _isPreviewHost &&
    window._FIXEO_ESTIMATOR_PREVIEW_OVERRIDE_ === true;


  // ───────────────────────────────────────────────────────────────────────────
  // Feature gate
  // ───────────────────────────────────────────────────────────────────────────

  if (
    !_previewOverride &&
    (
      !window.FixeoEstimatorConfig ||
      window.FixeoEstimatorConfig.estimatorV2Enabled !== true
    )
  ) {
    return;
  }

  window._fxEstV2Loaded = true;


  // ───────────────────────────────────────────────────────────────────────────
  // RAFI visual states
  // ───────────────────────────────────────────────────────────────────────────

  var RAFI_STATES = {
    idle: {
      label: 'RAFI',
      copy: 'Estimation FIXEO'
    },

    understanding: {
      label: 'RAFI',
      copy: 'Décrivez votre intervention'
    },

    analyzing: {
      label: 'RAFI analyse',
      copy: 'Je comprends votre besoin…'
    },

    identified: {
      label: 'RAFI',
      copy: 'Intervention identifiée'
    },

    verifying: {
      label: 'RAFI vérifie',
      copy: 'Je vérifie le périmètre'
    },

    complete: {
      label: 'RAFI',
      copy: 'Votre Prix FIXEO est prêt'
    }
  };


  var _SPHERE_STATE_MAP = {
    idle: 'idle',
    understanding: 'idle',
    analyzing: 'analyzing',
    identified: 'identified',
    verifying: 'verifying',
    complete: 'complete'
  };


  function setSphereState(state) {
    var sphere =
      document.querySelector('.rafi-sphere');

    if (sphere) {
      sphere.setAttribute(
        'data-state',
        state
      );
    }
  }


  function setRAFIState(state) {
    var s =
      RAFI_STATES[state] ||
      RAFI_STATES.idle;

    var markEl =
      document.getElementById(
        'rafi-mark'
      );

    var lineEl =
      document.getElementById(
        'rafi-state-line'
      );

    if (markEl) {
      markEl.textContent =
        s.label;

      markEl.classList.remove(
        'rafi-pulse'
      );

      void markEl.offsetWidth;

      markEl.classList.add(
        'rafi-pulse'
      );

      setTimeout(function() {
        markEl.classList.remove(
          'rafi-pulse'
        );
      }, 300);
    }

    if (lineEl) {
      lineEl.style.opacity =
        '0';

      setTimeout(function() {
        lineEl.textContent =
          s.copy;

        lineEl.style.opacity =
          '1';
      }, 90);
    }

    setSphereState(
      _SPHERE_STATE_MAP[state] ||
      'idle'
    );
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Display labels
  // ───────────────────────────────────────────────────────────────────────────

  var CLIENT_LABELS = {
    'menuiserie.reglage_porte.sans_rabotage': {
      primary: 'Réglage de porte',
      secondary: 'Sans rabotage'
    },

    'menuiserie.reglage_porte.avec_rabotage': {
      primary: 'Réglage de porte',
      secondary: 'Avec rabotage'
    },

    'menuiserie.remplacement_charniere': {
      primary: 'Remplacement de charnière',
      secondary: null
    },

    'plomberie.robinet_remplacement': {
      primary: 'Remplacement de robinet',
      secondary: null
    },

    'plomberie.diagnostic': {
      primary: 'Diagnostic plomberie',
      secondary: null
    },

    'plomberie.fuite_simple': {
      primary: 'Réparation fuite',
      secondary: null
    },

    'electricite.diagnostic': {
      primary: 'Diagnostic électrique',
      secondary: null
    },

    'electricite.prise_remplacement': {
      primary: 'Remplacement de prise',
      secondary: null
    },

    'electricite.interrupteur_remplacement.simple': {
      primary: 'Remplacement d\'interrupteur',
      secondary: null
    },

    'serrurerie.cylindre_remplacement.standard': {
      primary: 'Remplacement de cylindre',
      secondary: 'Standard'
    },

    'serrurerie.serrure_remplacement.standard': {
      primary: 'Remplacement de serrure',
      secondary: 'Standard'
    },

    'serrurerie.porte_claquee_ouverture': {
      primary: 'Ouverture porte claquée',
      secondary: null
    },

    'nettoyage.grand_menage': {
      primary: 'Grand ménage',
      secondary: null
    },

    'nettoyage.menage_standard': {
      primary: 'Ménage standard',
      secondary: null
    },

    'peinture.mur_interieur.all_in': {
      primary: 'Peinture mur intérieur',
      secondary: 'Fournitures incluses'
    },

    'peinture.mur_interieur.labour_only': {
      primary: 'Peinture mur intérieur',
      secondary: 'Main-d\'œuvre seulement'
    }
  };


  function resolveClientLabel(serviceCode) {
    var lbl =
      CLIENT_LABELS[serviceCode];

    if (lbl) return lbl;

    var parts =
      (serviceCode || '')
        .split('.');

    var primary =
      parts
        .slice(1)
        .join(' ')
        .replace(/_/g, ' ') ||
      serviceCode ||
      'Intervention';

    return {
      primary:
        primary.charAt(0).toUpperCase() +
        primary.slice(1),

      secondary: null
    };
  }


  var PROMPT_LABELS = {
    burning_smell:
      'Y a-t-il une odeur de brûlé ?',

    scorch_marks:
      'Y a-t-il des traces de carbonisation ?',

    active_moisture:
      'Y a-t-il une fuite active en cours ?',

    distributor_equipment_involved:
      'L\'intervention concerne-t-elle le tableau électrique principal ?',

    ddr_rcd_involved:
      'L\'intervention concerne-t-elle un disjoncteur différentiel ou DDR ?',

    multi_split:
      'S\'agit-il d\'un système multi-split ?',

    security_door:
      'S\'agit-il d\'une porte blindée ou de sécurité ?',

    lock_cylinder_involved:
      'La serrure comporte-t-elle un cylindre à remplacer ?',

    part_replacement_required:
      'Une pièce doit-elle être remplacée ?',

    worker_count:
      'Combien de prestataires souhaitez-vous ?',

    workers_count:
      'Combien de prestataires souhaitez-vous ?',

    hours:
      'Combien d\'heures d\'intervention ?',

    hours_per_worker:
      'Combien d\'heures par prestataire ?',

    painted_m2:
      'Quelle est la surface à peindre (m²) ?',

    ceiling_m2:
      'Quelle est la surface du plafond (m²) ?',

    surface_m2:
      'Quelle est la surface concernée (m²) ?',

    frame_condition:
      'Dans quel état est le cadre de porte ?',

    leak_location_confirmed:
      'La localisation de la fuite est-elle connue ?'
  };


  function promptFromKey(
    promptKey,
    questionId
  ) {
    if (
      PROMPT_LABELS[promptKey]
    ) {
      return PROMPT_LABELS[
        promptKey
      ];
    }

    var base =
      questionId
        ? questionId.split('@')[0]
        : '';

    return (
      PROMPT_LABELS[base] ||
      questionId ||
      'Question de qualification'
    );
  }


  function optionLabel(opt) {
    var labels = {
      SOUND:
        'Bon état',

      COMPATIBLE:
        'Compatible',

      MINOR_DAMAGE:
        'Légères marques',

      ROTTED:
        'Dégradé',

      STRUCTURALLY_DEFORMED:
        'Déformé',

      true:
        'Oui',

      false:
        'Non'
    };

    return (
      labels[opt] !== undefined
        ? labels[opt]
        : String(opt)
            .replace(/_/g, ' ')
    );
  }


  var METIER_LABELS = {
    menuiserie:
      'Menuiserie',

    plomberie:
      'Plomberie',

    electricite:
      'Électricité',

    serrurerie:
      'Serrurerie',

    climatisation:
      'Climatisation',

    nettoyage:
      'Nettoyage',

    peinture:
      'Peinture',

    bricolage:
      'Bricolage'
  };


  function metierLabel(
    metier
  ) {
    if (
      METIER_LABELS[
        metier
      ]
    ) {
      return METIER_LABELS[
        metier
      ];
    }

    var raw =
      String(
        metier || ''
      )
        .replace(/[_-]/g, ' ')
        .trim();

    if (!raw) {
      return 'Métier';
    }

    return (
      raw.charAt(0).toUpperCase() +
      raw.slice(1)
    );
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Entry context
  // ───────────────────────────────────────────────────────────────────────────

  var _ALLOWED_ENTRY_FIELDS = [
    'entry_point',
    'source',

    'metier_hint',
    'service_hint',

    'free_text',
    'description',

    'city_slug',
    'city',

    'artisan_id',

    'urgency_context',
    'urgency',

    'known_inputs'
  ];


  function _normalizeEntryContext(
    ctx
  ) {
    var out = {};

    if (
      !ctx ||
      typeof ctx !== 'object' ||
      Array.isArray(ctx)
    ) {
      return out;
    }

    _ALLOWED_ENTRY_FIELDS
      .forEach(function(k) {
        if (
          ctx[k] !== null &&
          ctx[k] !== undefined
        ) {
          out[k] =
            ctx[k];
        }
      });

    return out;
  }


  function _cleanText(
    value,
    max
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    var s =
      String(value)
        .trim();

    if (
      max &&
      s.length > max
    ) {
      s =
        s.slice(
          0,
          max
        );
    }

    return s;
  }


  function _displayCity(
    value
  ) {
    var s =
      _cleanText(
        value,
        120
      );

    if (!s) return '';

    s =
      s.replace(
        /[-_]+/g,
        ' '
      );

    return (
      s.charAt(0).toUpperCase() +
      s.slice(1)
    );
  }


  // ───────────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────────

  var STATE = {
    sessionToken: null,
    session: null,

    pendingAnswer: null,
    quantityValue: null,
    measurementValue: null,

    isSafetyActive: false,

    onClose: null
  };


  // ───────────────────────────────────────────────────────────────────────────
  // DOM utilities
  // ───────────────────────────────────────────────────────────────────────────

  function el(
    tag,
    cls,
    inner
  ) {
    var e =
      document.createElement(
        tag
      );

    if (cls) {
      e.className =
        cls;
    }

    if (
      inner !== null &&
      inner !== undefined
    ) {
      e.innerHTML =
        inner;
    }

    return e;
  }


  function formatMAD(n) {
    if (
      n === null ||
      n === undefined
    ) {
      return '—';
    }

    return (
      Math.round(n)
        .toString() +
      ' MAD'
    );
  }


  function getFocusable(
    container
  ) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        [
          'button:not([disabled])',
          '[href]',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])'
        ].join(',')
      )
    ).filter(function(node) {
      return (
        node.offsetWidth > 0 ||
        node.offsetHeight > 0 ||
        node ===
          document.activeElement
      );
    });
  }


  function trapFocus(
    container
  ) {
    container.addEventListener(
      'keydown',
      function(e) {
        if (
          e.key ===
          'Escape'
        ) {
          if (
            STATE.onClose
          ) {
            STATE.onClose();
          }

          return;
        }

        if (
          e.key !==
          'Tab'
        ) {
          return;
        }

        var focusable =
          getFocusable(
            container
          );

        if (
          !focusable.length
        ) {
          e.preventDefault();
          return;
        }

        var first =
          focusable[0];

        var last =
          focusable[
            focusable.length - 1
          ];

        if (
          e.shiftKey &&
          document.activeElement ===
            first
        ) {
          e.preventDefault();
          last.focus();

        } else if (
          !e.shiftKey &&
          document.activeElement ===
            last
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    );
  }


  function triggerIntelligenceLine() {
    var line =
      document.querySelector(
        '.intelligence-line'
      );

    if (!line) return;

    line.classList.remove(
      'active'
    );

    void line.offsetWidth;

    line.classList.add(
      'active'
    );
  }


  function focusSoon(
    selector
  ) {
    setTimeout(
      function() {
        var node =
          document.querySelector(
            selector
          );

        if (
          node &&
          typeof node.focus ===
            'function'
        ) {
          node.focus();
        }
      },
      50
    );
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Header
  // ───────────────────────────────────────────────────────────────────────────

  function renderHeader() {
    var header =
      el(
        'div',
        'estimator-header estimator-header--raficore'
      );

    header.setAttribute(
      'id',
      'estimator-header'
    );

    var intLine =
      el(
        'div',
        'intelligence-line'
      );

    header.appendChild(
      intLine
    );


    var left =
      el(
        'div',
        'header-left'
      );


    var sphereWrap =
      el(
        'div',
        'rafi-sphere-wrap'
      );


    var sphere =
      el(
        'div',
        'rafi-sphere'
      );

    sphere.setAttribute(
      'data-state',
      'idle'
    );

    sphere.setAttribute(
      'aria-hidden',
      'true'
    );


    sphere.appendChild(
      el(
        'span',
        'rafi-sphere-label',
        'RAFI'
      )
    );


    sphereWrap.appendChild(
      sphere
    );

    left.appendChild(
      sphereWrap
    );


    var headerText =
      el(
        'div',
        'header-text'
      );


    var brandLine =
      el(
        'div',
        'rafi-header-brandline'
      );

    brandLine.appendChild(
      el(
        'span',
        'rafi-header-brand',
        'RAFI'
      )
    );

    brandLine.appendChild(
      el(
        'span',
        'rafi-header-divider',
        '•'
      )
    );

    brandLine.appendChild(
      el(
        'span',
        'rafi-header-product',
        'ESTIMATION FIXEO'
      )
    );

    headerText.appendChild(
      brandLine
    );


    var title =
      el(
        'div',
        'header-title',
        'Votre estimation guidée'
      );

    headerText.appendChild(
      title
    );


    var rafiStateLine =
      el(
        'div',
        'rafi-state'
      );

    rafiStateLine.setAttribute(
      'id',
      'rafi-state-line'
    );

    rafiStateLine.textContent =
      'Décrivez votre intervention';


    headerText.appendChild(
      rafiStateLine
    );

    left.appendChild(
      headerText
    );

    header.appendChild(
      left
    );


    var closeBtn =
      el(
        'button',
        'modal-close'
      );

    closeBtn.setAttribute(
      'type',
      'button'
    );

    closeBtn.setAttribute(
      'aria-label',
      'Fermer l’estimation'
    );

    closeBtn.setAttribute(
      'id',
      'modal-close'
    );

    closeBtn.innerHTML =
      '<span aria-hidden="true">×</span>';

    closeBtn.addEventListener(
      'click',
      function() {
        if (
          STATE.onClose
        ) {
          STATE.onClose();
        }
      }
    );

    header.appendChild(
      closeBtn
    );

    return header;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // 4-state progress
  // ───────────────────────────────────────────────────────────────────────────

  function renderProgress(
    activeStage
  ) {
    var stages = [
      'COMPRENDRE',
      'IDENTIFIER',
      'VERIFIER',
      'PRIX'
    ];


    var labels = {
      COMPRENDRE:
        'Comprendre',

      IDENTIFIER:
        'Identifier',

      VERIFIER:
        'Vérifier',

      PRIX:
        'Prix FIXEO'
    };


    var activeIdx =
      stages.indexOf(
        activeStage
      );

    if (
      activeIdx < 0
    ) {
      activeIdx = 0;
    }


    var fillPct =
      [
        25,
        50,
        75,
        100
      ][activeIdx];


    var bar =
      el(
        'div',
        'rafi-state-bar rafi-state-bar--premium'
      );


    bar.style.setProperty(
      '--fill',
      fillPct + '%'
    );


    bar.setAttribute(
      'data-stage',
      stages[activeIdx]
    );

    bar.setAttribute(
      'role',
      'progressbar'
    );

    bar.setAttribute(
      'aria-valuemin',
      '0'
    );

    bar.setAttribute(
      'aria-valuemax',
      '100'
    );

    bar.setAttribute(
      'aria-valuenow',
      String(fillPct)
    );

    bar.setAttribute(
      'aria-label',
      'Étape ' +
        String(activeIdx + 1) +
        ' sur 4 : ' +
        labels[
          stages[
            activeIdx
          ]
        ]
    );


    stages.forEach(
      function(stage, i) {
        var isDone =
          i < activeIdx;

        var isActive =
          i === activeIdx;


        var cls =
          'rafi-stage' +
          (
            isActive
              ? ' active'
              : ''
          ) +
          (
            isDone
              ? ' done'
              : ''
          );


        var s =
          el(
            'div',
            cls
          );

        s.setAttribute(
          'data-step',
          String(i + 1)
        );


        var index =
          el(
            'span',
            'rafi-stage-index'
          );

        index.textContent =
          isDone
            ? '✓'
            : String(i + 1);


        s.appendChild(
          index
        );


        var text =
          el(
            'span',
            'rafi-stage-label'
          );

        text.textContent =
          labels[stage];


        s.appendChild(
          text
        );


        bar.appendChild(
          s
        );


        if (
          i <
          stages.length - 1
        ) {
          var sep =
            el(
              'div',
              'rafi-stage-sep' +
                (
                  isDone
                    ? ' done'
                    : ''
                )
            );


          sep.setAttribute(
            'aria-hidden',
            'true'
          );


          bar.appendChild(
            sep
          );
        }
      }
    );


    return bar;
  }


  function stageFromSessionState(
    state
  ) {
    if (!state) {
      return 'COMPRENDRE';
    }


    var map = {
      START:
        'COMPRENDRE',

      METIER_SELECTION:
        'IDENTIFIER',

      SERVICE_SELECTION:
        'IDENTIFIER',

      QUALIFICATION:
        'VERIFIER',

      QUESTION_REQUIRED:
        'VERIFIER',

      READY_FOR_ENGINE:
        'VERIFIER',

      ENGINE_EVALUATION:
        'VERIFIER',

      PRICE_READY:
        'PRIX',

      DIAGNOSTIC_READY:
        'PRIX',

      LABOUR_PLUS_PART_READY:
        'PRIX',

      ADD_ON_READY:
        'PRIX',

      QUOTE_REQUIRED:
        'PRIX',

      ROUTE_REQUIRED:
        'PRIX',

      SAFETY_STOP:
        'PRIX',

      REQUALIFY:
        'PRIX'
    };


    return (
      map[state] ||
      'IDENTIFIER'
    );
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Context strip
  // ───────────────────────────────────────────────────────────────────────────

  function renderContextBar(
    context,
    session
  ) {
    var wrap =
      el(
        'div',
        'estimator-context-bar'
      );


    var city =
      _displayCity(
        context.city ||
        context.city_slug
      );


    if (city) {
      var cityChip =
        el(
          'span',
          'estimator-context-chip'
        );

      cityChip.textContent =
        '📍 ' + city;

      wrap.appendChild(
        cityChip
      );
    }


    var metier =
      (
        session &&
        session.metier
      ) ||
      context.metier_hint;


    if (metier) {
      var metierChip =
        el(
          'span',
          'estimator-context-chip'
        );

      metierChip.textContent =
        metierLabel(
          metier
        );

      wrap.appendChild(
        metierChip
      );
    }


    return wrap;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Answer / choice cards
  // ───────────────────────────────────────────────────────────────────────────

  function renderAnswerCard(
    opt,
    isSelected,
    onSelect
  ) {
    opt =
      opt || {};


    var card =
      el(
        'button',
        'answer-card rafi-choice-card' +
          (
            opt.variant
              ? ' rafi-choice-card--' +
                  opt.variant
              : ''
          ) +
          (
            isSelected
              ? ' selected'
              : ''
          )
      );


    card.setAttribute(
      'type',
      'button'
    );


    card.setAttribute(
      'role',
      'radio'
    );


    card.setAttribute(
      'aria-checked',
      isSelected
        ? 'true'
        : 'false'
    );


    var check =
      el(
        'span',
        'answer-card__check rafi-choice-card__marker'
      );


    check.setAttribute(
      'aria-hidden',
      'true'
    );


    check.textContent =
      isSelected
        ? '✓'
        : (
            opt.indexLabel ||
            ''
          );


    card.appendChild(
      check
    );


    var content =
      el(
        'span',
        'rafi-choice-card__content'
      );


    if (
      opt.eyebrow
    ) {
      var eyebrow =
        el(
          'span',
          'rafi-choice-card__eyebrow'
        );

      eyebrow.textContent =
        opt.eyebrow;

      content.appendChild(
        eyebrow
      );
    }


    var label =
      el(
        'span',
        'answer-card__label rafi-choice-card__label'
      );


    label.textContent =
      opt.label ||
      String(opt);


    content.appendChild(
      label
    );


    if (
      opt.meta
    ) {
      var meta =
        el(
          'span',
          'rafi-choice-card__meta'
        );

      meta.textContent =
        opt.meta;

      content.appendChild(
        meta
      );
    }


    card.appendChild(
      content
    );


    var arrow =
      el(
        'span',
        'rafi-choice-card__arrow'
      );

    arrow.setAttribute(
      'aria-hidden',
      'true'
    );

    arrow.textContent =
      isSelected
        ? '✓'
        : '→';


    card.appendChild(
      arrow
    );


    card.addEventListener(
      'click',
      function() {
        onSelect(
          opt.value !==
            undefined
            ? opt.value
            : opt
        );
      }
    );


    return card;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Question renderer — RAFI verification console
  // ───────────────────────────────────────────────────────────────────────────

  function isSurfaceMeasurement(
    step
  ) {
    return [
      'painted_m2',
      'ceiling_m2',
      'surface_m2'
    ].indexOf(
      step.input_id
    ) !== -1;
  }


  function renderQuestion(
    step,
    onAutoAdvance
  ) {
    var isSafety =
      step.priority ===
      'SAFETY';


    var body =
      el(
        'div',
        'estimator-body step-enter' +
          (
            isSafety
              ? ' question-safety'
              : ''
          )
      );


    var consoleWrap =
      el(
        'div',
        'rafi-verification-console'
      );


    if (isSafety) {
      var note =
        el(
          'div',
          'question-safety-note'
        );


      note.textContent =
        '⚠ Point de sécurité — répondez avec précision.';


      consoleWrap.appendChild(
        note
      );
    }


    var kicker =
      el(
        'div',
        'rafi-verification-kicker'
      );


    kicker.appendChild(
      el(
        'span',
        'rafi-verification-kicker__dot'
      )
    );


    kicker.appendChild(
      el(
        'span',
        '',
        isSafety
          ? 'RAFI · SÉCURITÉ'
          : 'RAFI · VÉRIFICATION DU PÉRIMÈTRE'
      )
    );


    consoleWrap.appendChild(
      kicker
    );


    var questionNumber =
      el(
        'div',
        'rafi-verification-meta'
      );


    var remaining =
      Number(
        step.questions_remaining ||
        1
      );


    questionNumber.textContent =
      remaining > 1
        ? remaining +
          ' précisions maximum restantes'
        : 'Dernière précision avant l’évaluation';


    consoleWrap.appendChild(
      questionNumber
    );


    var heading =
      el(
        'h2',
        'question-heading rafi-verification-question'
      );


    heading.setAttribute(
      'id',
      'question-heading'
    );


    heading.textContent =
      promptFromKey(
        step.prompt_key,
        step.question_id
      );


    consoleWrap.appendChild(
      heading
    );


    if (!isSafety) {
      consoleWrap.appendChild(
        el(
          'p',
          'question-intelligence-copy rafi-verification-copy',
          'Une seule précision à la fois. RAFI vérifie uniquement ce qui peut changer le périmètre ou le tarif.'
        )
      );
    }


    STATE.pendingAnswer =
      null;


    var isBoolean =
      step.answer_type ===
      'boolean';


    var autoAdvanceLocked =
      false;


    var onSelect =
      function(val) {
        if (
          autoAdvanceLocked
        ) {
          return;
        }


        STATE.pendingAnswer =
          val;


        consoleWrap
          .querySelectorAll(
            '.answer-card'
          )
          .forEach(
            function(c) {
              var v =
                c.__optValue;


              var selected =
                v === val;


              c.classList.toggle(
                'selected',
                selected
              );


              c.setAttribute(
                'aria-checked',
                selected
                  ? 'true'
                  : 'false'
              );


              var check =
                c.querySelector(
                  '.answer-card__check'
                );


              if (check) {
                check.textContent =
                  selected
                    ? '✓'
                    : (
                        c.__indexLabel ||
                        ''
                      );
              }


              var arrow =
                c.querySelector(
                  '.rafi-choice-card__arrow'
                );


              if (arrow) {
                arrow.textContent =
                  selected
                    ? '✓'
                    : '→';
              }
            }
          );


        updateCTA(
          true
        );


        if (
          isBoolean &&
          onAutoAdvance
        ) {
          autoAdvanceLocked =
            true;


          consoleWrap
            .querySelectorAll(
              '.answer-card'
            )
            .forEach(
              function(c) {
                c.setAttribute(
                  'aria-disabled',
                  'true'
                );
              }
            );


          setTimeout(
            function() {
              onAutoAdvance(
                val
              );
            },
            260
          );
        }
      };


    if (isBoolean) {
      var opts = [
        {
          value: true,
          label: 'Oui',
          meta: 'Ce point est confirmé'
        },

        {
          value: false,
          label: 'Non',
          meta: 'Ce point ne s’applique pas'
        }
      ];


      var cards =
        el(
          'div',
          'answer-cards answer-cards--binary rafi-verification-choices'
        );


      cards.setAttribute(
        'role',
        'radiogroup'
      );


      opts.forEach(
        function(opt, idx) {
          opt.variant =
            'binary';

          opt.indexLabel =
            idx === 0
              ? 'O'
              : 'N';


          var card =
            renderAnswerCard(
              opt,
              false,
              onSelect
            );


          card.__optValue =
            opt.value;

          card.__indexLabel =
            opt.indexLabel;


          cards.appendChild(
            card
          );
        }
      );


      consoleWrap.appendChild(
        cards
      );


    } else if (
      isSurfaceMeasurement(
        step
      )
    ) {
      var measureCard =
        el(
          'div',
          'rafi-measurement-card'
        );


      measureCard.appendChild(
        el(
          'p',
          'diagnostic-intro',
          'Indiquez uniquement la surface concernée par cette intervention.'
        )
      );


      var inp =
        el(
          'input',
          'measurement-input'
        );


      inp.setAttribute(
        'type',
        'number'
      );


      inp.setAttribute(
        'min',
        '1'
      );


      inp.setAttribute(
        'max',
        '5000'
      );


      inp.setAttribute(
        'step',
        '1'
      );


      inp.setAttribute(
        'placeholder',
        'Ex. 45'
      );


      inp.setAttribute(
        'aria-label',
        'Surface en mètres carrés'
      );


      inp.addEventListener(
        'input',
        function() {
          var v =
            Number(
              inp.value
            );


          if (
            Number.isFinite(v) &&
            v > 0
          ) {
            STATE.measurementValue =
              v;

            STATE.pendingAnswer =
              v;

            updateCTA(
              true
            );

          } else {
            STATE.pendingAnswer =
              null;

            updateCTA(
              false
            );
          }
        }
      );


      measureCard.appendChild(
        inp
      );


      measureCard.appendChild(
        el(
          'div',
          'measurement-unit',
          'm²'
        )
      );


      consoleWrap.appendChild(
        measureCard
      );


    } else if (
      step.answer_type ===
        'integer' ||
      step.answer_type ===
        'number'
    ) {
      STATE.quantityValue =
        1;


      STATE.pendingAnswer =
        1;


      var qWrap =
        el(
          'div',
          'rafi-quantity-card'
        );


      qWrap.appendChild(
        el(
          'div',
          'rafi-quantity-label',
          'Quantité concernée'
        )
      );


      var qRow =
        el(
          'div',
          'quantity-row'
        );


      var qVal =
        el(
          'div',
          'qty-value',
          '1'
        );


      qVal.setAttribute(
        'aria-live',
        'polite'
      );


      var btnMinus =
        el(
          'button',
          'qty-btn',
          '−'
        );


      btnMinus.setAttribute(
        'type',
        'button'
      );


      btnMinus.setAttribute(
        'aria-label',
        'Diminuer'
      );


      btnMinus.addEventListener(
        'click',
        function() {
          var v =
            Math.max(
              1,
              (
                STATE.quantityValue ||
                1
              ) - 1
            );


          STATE.quantityValue =
            v;


          STATE.pendingAnswer =
            v;


          qVal.textContent =
            String(v);


          updateCTA(
            true
          );
        }
      );


      var btnPlus =
        el(
          'button',
          'qty-btn',
          '+'
        );


      btnPlus.setAttribute(
        'type',
        'button'
      );


      btnPlus.setAttribute(
        'aria-label',
        'Augmenter'
      );


      btnPlus.addEventListener(
        'click',
        function() {
          var v =
            Math.min(
              20,
              (
                STATE.quantityValue ||
                1
              ) + 1
            );


          STATE.quantityValue =
            v;


          STATE.pendingAnswer =
            v;


          qVal.textContent =
            String(v);


          updateCTA(
            true
          );
        }
      );


      qRow.appendChild(
        btnMinus
      );


      qRow.appendChild(
        qVal
      );


      qRow.appendChild(
        btnPlus
      );


      qWrap.appendChild(
        qRow
      );


      consoleWrap.appendChild(
        qWrap
      );


    } else if (
      step.options &&
      step.options.length > 0
    ) {
      var wrap =
        el(
          'div',
          'answer-cards rafi-verification-choices'
        );


      wrap.setAttribute(
        'role',
        'radiogroup'
      );


      wrap.setAttribute(
        'aria-labelledby',
        'question-heading'
      );


      step.options.forEach(
        function(opt, idx) {
          var card =
            renderAnswerCard(
              {
                value: opt,

                label:
                  optionLabel(
                    opt
                  ),

                eyebrow:
                  'Option ' +
                  String(idx + 1),

                indexLabel:
                  String(idx + 1)
              },
              false,
              onSelect
            );


          card.__optValue =
            opt;

          card.__indexLabel =
            String(idx + 1);


          wrap.appendChild(
            card
          );
        }
      );


      consoleWrap.appendChild(
        wrap
      );


    } else {
      var fallback =
        el(
          'div',
          'answer-cards answer-cards--binary rafi-verification-choices'
        );


      [
        {
          value: true,
          label: 'Oui',
          indexLabel: 'O'
        },

        {
          value: false,
          label: 'Non',
          indexLabel: 'N'
        }
      ].forEach(
        function(opt) {
          var card =
            renderAnswerCard(
              opt,
              false,
              onSelect
            );


          card.__optValue =
            opt.value;

          card.__indexLabel =
            opt.indexLabel;


          fallback.appendChild(
            card
          );
        }
      );


      consoleWrap.appendChild(
        fallback
      );
    }


    body.appendChild(
      consoleWrap
    );


    return body;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Scope/result helpers
  // ───────────────────────────────────────────────────────────────────────────

  function normalizeScopeItems(
    scopeSummary
  ) {
    if (
      !Array.isArray(
        scopeSummary
      )
    ) {
      return [];
    }


    return scopeSummary
      .map(function(item) {
        if (
          typeof item ===
          'string'
        ) {
          return item.trim();
        }

        return '';
      })
      .filter(Boolean);
  }


  function renderScopeChips(
    scopeSummary
  ) {
    var items =
      normalizeScopeItems(
        scopeSummary
      );


    if (!items.length) {
      return null;
    }


    var chips =
      el(
        'div',
        'scope-chips'
      );


    chips.setAttribute(
      'role',
      'list'
    );


    items.forEach(
      function(item) {
        var c =
          el(
            'span',
            'scope-chip'
          );


        c.setAttribute(
          'role',
          'listitem'
        );


        c.textContent =
          item;


        chips.appendChild(
          c
        );
      }
    );


    return chips;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Price result — FIXEO verified-price certificate
  // ───────────────────────────────────────────────────────────────────────────

  function renderPriceResult(
    outcome
  ) {
    var lbl =
      resolveClientLabel(
        outcome.service_code ||
        ''
      );


    var amountMAD =
      outcome.price &&
      outcome.price.amount_mad;


    var amtNum =
      amountMAD !== null &&
      amountMAD !== undefined
        ? Math.round(
            amountMAD
          ).toString()
        : '—';


    var shell =
      el(
        'div',
        'result-shell step-enter result-enter result-shell--price-certificate'
      );


    var certificate =
      el(
        'section',
        'price-certificate'
      );

    certificate.setAttribute(
      'aria-label',
      'Prix FIXEO vérifié'
    );


    var certTop =
      el(
        'div',
        'price-certificate__top'
      );


    var seal =
      el(
        'div',
        'price-certificate__seal'
      );


    seal.appendChild(
      el(
        'span',
        'price-certificate__seal-dot'
      )
    );


    seal.appendChild(
      el(
        'span',
        '',
        'PRIX FIXEO · VÉRIFIÉ'
      )
    );


    certTop.appendChild(
      seal
    );


    certTop.appendChild(
      el(
        'div',
        'price-certificate__analysis',
        'Analyse RAFI terminée'
      )
    );


    certificate.appendChild(
      certTop
    );


    var service =
      el(
        'div',
        'price-certificate__service'
      );


    service.appendChild(
      el(
        'div',
        'price-certificate__service-label',
        'INTERVENTION'
      )
    );


    service.appendChild(
      el(
        'h2',
        'price-certificate__service-name',
        lbl.primary
      )
    );


    if (
      lbl.secondary
    ) {
      service.appendChild(
        el(
          'div',
          'price-certificate__service-secondary',
          lbl.secondary
        )
      );
    }


    certificate.appendChild(
      service
    );


    var hero =
      el(
        'div',
        'price-hero price-certificate__amount'
      );


    var inner =
      el(
        'div',
        'price-hero-inner'
      );


    inner.appendChild(
      el(
        'div',
        'price-eyebrow',
        'Prix pour le périmètre validé'
      )
    );


    var display =
      el(
        'div',
        'price-display'
      );


    display.appendChild(
      el(
        'span',
        'amount',
        amtNum
      )
    );


    display.appendChild(
      el(
        'span',
        'currency',
        ' MAD'
      )
    );


    inner.appendChild(
      display
    );


    inner.appendChild(
      el(
        'div',
        'price-sublabel',
        'Périmètre vérifié par RAFI'
      )
    );


    hero.appendChild(
      inner
    );


    certificate.appendChild(
      hero
    );


    var proof =
      el(
        'div',
        'price-certificate__proof'
      );


    var proofScope =
      el(
        'div',
        'price-proof-item'
      );

    proofScope.appendChild(
      el(
        'span',
        'price-proof-item__icon',
        '✓'
      )
    );

    proofScope.appendChild(
      el(
        'span',
        'price-proof-item__text',
        'Périmètre analysé'
      )
    );

    proof.appendChild(
      proofScope
    );


    var proofConsent =
      el(
        'div',
        'price-proof-item'
      );

    proofConsent.appendChild(
      el(
        'span',
        'price-proof-item__icon',
        '✓'
      )
    );

    proofConsent.appendChild(
      el(
        'span',
        'price-proof-item__text',
        'Aucun supplément sans votre accord'
      )
    );

    proof.appendChild(
      proofConsent
    );


    certificate.appendChild(
      proof
    );


    var chips =
      renderScopeChips(
        outcome.scope_summary
      );


    if (chips) {
      var scope =
        el(
          'div',
          'scope-section price-certificate__scope'
        );


      scope.appendChild(
        el(
          'div',
          'scope-section-label',
          'Inclus dans ce périmètre'
        )
      );


      scope.appendChild(
        chips
      );


      certificate.appendChild(
        scope
      );
    }


    var doctrine =
      el(
        'div',
        'price-certificate__doctrine'
      );


    doctrine.appendChild(
      el(
        'span',
        'price-certificate__doctrine-mark',
        'FIXEO'
      )
    );


    doctrine.appendChild(
      el(
        'p',
        'scope-doctrine',
        'Ce prix s’applique au périmètre validé pendant l’analyse. Si la situation réelle est différente, aucun supplément ne doit être engagé sans votre accord.'
      )
    );


    certificate.appendChild(
      doctrine
    );


    shell.appendChild(
      certificate
    );


    return shell;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Labour + part result
  // ───────────────────────────────────────────────────────────────────────────

  function renderLabourPartResult(
    outcome
  ) {
    var lbl =
      resolveClientLabel(
        outcome.service_code ||
        ''
      );


    var labourAmt =
      outcome.price &&
      outcome.price
        .labour_amount_mad;


    var labAmtStr =
      labourAmt !== null &&
      labourAmt !== undefined
        ? Math.round(
            labourAmt
          ).toString()
        : '—';


    var shell =
      el(
        'div',
        'result-shell step-enter result-enter'
      );


    var rHead =
      el(
        'div',
        'result-header'
      );


    rHead.appendChild(
      el(
        'div',
        'result-verified-dot'
      )
    );


    var col =
      el(
        'div',
        'result-rafi-col'
      );


    col.appendChild(
      el(
        'div',
        'result-rafi-state',
        'Analyse terminée'
      )
    );


    col.appendChild(
      el(
        'div',
        'result-rafi-label',
        'Périmètre vérifié'
      )
    );


    rHead.appendChild(
      col
    );


    shell.appendChild(
      rHead
    );


    var srow =
      el(
        'div',
        'result-service-row'
      );


    srow.appendChild(
      el(
        'div',
        'result-service-name',
        lbl.primary
      )
    );


    if (
      lbl.secondary
    ) {
      srow.appendChild(
        el(
          'div',
          'result-service-secondary',
          lbl.secondary
        )
      );
    }


    shell.appendChild(
      srow
    );


    var split =
      el(
        'div',
        'labour-split'
      );


    var labCard =
      el(
        'div',
        'labour-card-new'
      );


    labCard.appendChild(
      el(
        'div',
        'labour-card-eyebrow',
        'Main-d’œuvre FIXEO'
      )
    );


    var labRow =
      el(
        'div',
        'labour-card-amount'
      );


    labRow.appendChild(
      el(
        'span',
        'amount',
        labAmtStr
      )
    );


    labRow.appendChild(
      el(
        'span',
        'currency',
        ' MAD'
      )
    );


    labCard.appendChild(
      labRow
    );


    split.appendChild(
      labCard
    );


    var partCard =
      el(
        'div',
        'labour-card-new'
      );


    partCard.style.borderStyle =
      'dashed';


    partCard.appendChild(
      el(
        'div',
        'labour-card-eyebrow',
        'Pièce / matériel'
      )
    );


    partCard.appendChild(
      el(
        'div',
        'labour-part-label',
        'Prix séparé<br>confirmé avec l’artisan'
      )
    );


    split.appendChild(
      partCard
    );


    shell.appendChild(
      split
    );


    shell.appendChild(
      el(
        'div',
        'labour-disclosure',
        'Si une pièce est nécessaire, son prix doit vous être communiqué et approuvé avant installation.'
      )
    );


    return shell;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Diagnostic result
  // ───────────────────────────────────────────────────────────────────────────

  function renderDiagnosticResult(
    outcome
  ) {
    var lbl =
      resolveClientLabel(
        outcome.service_code ||
        ''
      );


    var amountMAD =
      (
        outcome.price &&
        outcome.price.amount_mad
      ) !== undefined
        ? outcome.price &&
          outcome.price.amount_mad
        : outcome.diagnostic_price_mad;


    var amtNum =
      amountMAD !== null &&
      amountMAD !== undefined
        ? Math.round(
            amountMAD
          ).toString()
        : '—';


    var shell =
      el(
        'div',
        'result-shell step-enter result-enter'
      );


    var rHead =
      el(
        'div',
        'result-header'
      );


    rHead.appendChild(
      el(
        'div',
        'result-verified-dot'
      )
    );


    var col =
      el(
        'div',
        'result-rafi-col'
      );


    col.appendChild(
      el(
        'div',
        'result-rafi-label',
        'Diagnostic sur place'
      )
    );


    rHead.appendChild(
      col
    );


    shell.appendChild(
      rHead
    );


    shell.appendChild(
      el(
        'div',
        'diagnostic-tag-new',
        'Diagnostic FIXEO'
      )
    );


    var srow =
      el(
        'div',
        'result-service-row'
      );


    srow.appendChild(
      el(
        'div',
        'result-service-name',
        lbl.primary
      )
    );


    if (
      lbl.secondary
    ) {
      srow.appendChild(
        el(
          'div',
          'result-service-secondary',
          lbl.secondary
        )
      );
    }


    shell.appendChild(
      srow
    );


    var hero =
      el(
        'div',
        'price-hero'
      );


    var inner =
      el(
        'div',
        'price-hero-inner'
      );


    inner.appendChild(
      el(
        'div',
        'price-eyebrow',
        'Tarif diagnostic'
      )
    );


    var display =
      el(
        'div',
        'price-display'
      );


    display.appendChild(
      el(
        'span',
        'amount',
        amtNum
      )
    );


    display.appendChild(
      el(
        'span',
        'currency',
        ' MAD'
      )
    );


    inner.appendChild(
      display
    );


    inner.appendChild(
      el(
        'div',
        'price-sublabel',
        'Diagnostic sur place'
      )
    );


    hero.appendChild(
      inner
    );

    shell.appendChild(
      hero
    );


    shell.appendChild(
      el(
        'div',
        'diagnostic-absorption',
        'Les conditions d’une éventuelle déduction sur réparation sont confirmées avant intervention.'
      )
    );


    return shell;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Quote result
  // ───────────────────────────────────────────────────────────────────────────

  function renderQuoteResult(
    outcome
  ) {
    var lbl =
      resolveClientLabel(
        (
          outcome &&
          outcome.service_code
        ) ||
        ''
      );


    var shell =
      el(
        'div',
        'result-shell step-enter result-enter'
      );


    var rHead =
      el(
        'div',
        'result-header'
      );


    rHead.appendChild(
      el(
        'div',
        'result-verified-dot'
      )
    );


    var col =
      el(
        'div',
        'result-rafi-col'
      );


    col.appendChild(
      el(
        'div',
        'result-rafi-state',
        'Analyse terminée'
      )
    );


    col.appendChild(
      el(
        'div',
        'result-rafi-label',
        'Devis nécessaire'
      )
    );


    rHead.appendChild(
      col
    );


    shell.appendChild(
      rHead
    );


    var surf =
      el(
        'div',
        'outcome-surface'
      );


    surf.appendChild(
      el(
        'div',
        'outcome-tag muted',
        'Devis requis'
      )
    );


    surf.appendChild(
      el(
        'div',
        'outcome-title',
        lbl.primary
      )
    );


    if (
      lbl.secondary
    ) {
      surf.appendChild(
        el(
          'div',
          'result-service-secondary',
          lbl.secondary
        )
      );
    }


    surf.appendChild(
      el(
        'div',
        'outcome-body',
        'Cette intervention ne peut pas recevoir un prix fixe fiable sans vérification complémentaire.'
      )
    );


    shell.appendChild(
      surf
    );


    return shell;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Route result
  // ───────────────────────────────────────────────────────────────────────────

  function renderRouteResult(
    outcome
  ) {
    var targetMetier =
      (
        outcome &&
        outcome.metier
      ) ||
      'spécialiste';


    var shell =
      el(
        'div',
        'result-shell step-enter result-enter'
      );


    var rHead =
      el(
        'div',
        'result-header'
      );


    rHead.appendChild(
      el(
        'div',
        'result-verified-dot'
      )
    );


    var col =
      el(
        'div',
        'result-rafi-col'
      );


    col.appendChild(
      el(
        'div',
        'result-rafi-state',
        'Réorientation'
      )
    );


    col.appendChild(
      el(
        'div',
        'result-rafi-label',
        'Bon spécialiste identifié'
      )
    );


    rHead.appendChild(
      col
    );


    shell.appendChild(
      rHead
    );


    var surf =
      el(
        'div',
        'outcome-surface'
      );


    surf.appendChild(
      el(
        'div',
        'outcome-tag orange',
        'Réorientation RAFI'
      )
    );


    surf.appendChild(
      el(
        'div',
        'outcome-title',
        'RAFI a identifié un autre périmètre.'
      )
    );


    var dir =
      el(
        'div',
        'route-direction'
      );


    dir.appendChild(
      el(
        'span',
        'route-arrow',
        '→'
      )
    );


    dir.appendChild(
      el(
        'div',
        'route-target',
        METIER_LABELS[
          targetMetier
        ] ||
        targetMetier
      )
    );


    surf.appendChild(
      dir
    );


    shell.appendChild(
      surf
    );


    return shell;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Safety
  // ───────────────────────────────────────────────────────────────────────────

  function renderSafetyResult() {
    var body =
      el(
        'div',
        'estimator-body step-enter safety-stop-body'
      );


    var safetyWrap =
      el(
        'div',
        'safety-surface'
      );


    safetyWrap.appendChild(
      el(
        'span',
        'safety-icon',
        '⚠'
      )
    );


    var st =
      el(
        'h2',
        'safety-title',
        'Une vérification est nécessaire avant de continuer.'
      );


    st.setAttribute(
      'id',
      'safety-heading'
    );


    safetyWrap.appendChild(
      st
    );


    safetyWrap.appendChild(
      el(
        'div',
        'safety-body',
        'Pour votre sécurité, FIXEO ne peut pas établir un prix dans cette situation.'
      )
    );


    safetyWrap.appendChild(
      el(
        'div',
        'safety-recommendation',
        'Une intervention par un professionnel qualifié est recommandée.'
      )
    );


    body.appendChild(
      safetyWrap
    );


    return body;
  }


  function renderRequalifyResult() {
    var body =
      el(
        'div',
        'estimator-body step-enter result-enter'
      );


    body.appendChild(
      el(
        'div',
        'requali-title',
        'Votre besoin dépasse le périmètre du prix standard.'
      )
    );


    body.appendChild(
      el(
        'div',
        'requali-body',
        'Une évaluation spécifique est nécessaire avant de poursuivre.'
      )
    );


    return body;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Footer
  // ───────────────────────────────────────────────────────────────────────────

  function renderFooter(
    opts
  ) {
    opts =
      opts || {};


    var footer =
      el(
        'div',
        'estimator-footer'
      );


    footer.setAttribute(
      'id',
      'estimator-footer'
    );


    if (
      opts.primaryLabel
    ) {
      var primary =
        el(
          'button',
          'btn-primary'
        );


      primary.textContent =
        opts.primaryLabel;


      primary.setAttribute(
        'type',
        'button'
      );


      primary.setAttribute(
        'id',
        'cta-primary'
      );


      primary.disabled =
        !!opts.primaryDisabled;


      primary.addEventListener(
        'click',
        function() {
          if (
            !primary.disabled &&
            opts.onPrimary
          ) {
            opts.onPrimary();
          }
        }
      );


      footer.appendChild(
        primary
      );
    }


    if (
      opts.secondaryLabel
    ) {
      var secondary =
        el(
          'button',
          'btn-secondary'
        );


      secondary.textContent =
        opts.secondaryLabel;


      secondary.setAttribute(
        'type',
        'button'
      );


      secondary.addEventListener(
        'click',
        function() {
          if (
            opts.onSecondary
          ) {
            opts.onSecondary();
          }
        }
      );


      footer.appendChild(
        secondary
      );
    }


    if (
      opts.showBack
    ) {
      var back =
        el(
          'button',
          'btn-back',
          '← Retour'
        );


      back.setAttribute(
        'type',
        'button'
      );


      back.addEventListener(
        'click',
        function() {
          if (
            opts.onBack
          ) {
            opts.onBack();
          }
        }
      );


      footer.appendChild(
        back
      );
    }


    return footer;
  }


  function updateCTA(
    enabled
  ) {
    var btn =
      document.getElementById(
        'cta-primary'
      );


    if (btn) {
      btn.disabled =
        !enabled;
    }
  }


  // ───────────────────────────────────────────────────────────────────────────
  // CTA labels
  // ───────────────────────────────────────────────────────────────────────────

  function ctaLabel(
    outcome
  ) {
    var ot =
      outcome &&
      outcome.outcome_type;


    switch (ot) {
      case 'PRICE_READY':
        return (
          'Trouver mon artisan — ' +
          formatMAD(
            outcome.price &&
            outcome.price.amount_mad
          )
        );


      case 'LABOUR_PLUS_PART_READY':
        return (
          'Trouver mon artisan — Main-d’œuvre ' +
          formatMAD(
            outcome.price &&
            outcome.price
              .labour_amount_mad
          )
        );


      case 'DIAGNOSTIC_READY':
        return (
          'Réserver le diagnostic — ' +
          formatMAD(
            outcome.price &&
            outcome.price.amount_mad
          )
        );


      case 'QUOTE_REQUIRED':
        return 'Demander un devis';


      case 'ROUTE_REQUIRED':
        return 'Continuer';


      default:
        return 'Continuer';
    }
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Container management
  // ───────────────────────────────────────────────────────────────────────────

  var _activeModal =
    null;


  var _activeContainer =
    null;


  var _previousActiveElement =
    null;


  function _createContainer() {
    var c =
      document.createElement(
        'div'
      );


    c.setAttribute(
      'id',
      'fixeo-estimator-v2-root'
    );


    c.setAttribute(
      'aria-live',
      'polite'
    );


    document.body.appendChild(
      c
    );


    return c;
  }


  function _destroyContainer() {
    if (
      !_activeContainer &&
      !_activeModal
    ) {
      return;
    }


    try {
      document.body.classList.remove(
        'fx-estimator-tunnel-active'
      );
    } catch (_) {}


    try {
      if (
        _activeContainer &&
        _activeContainer.parentNode
      ) {
        _activeContainer
          .parentNode
          .removeChild(
            _activeContainer
          );
      }
    } catch (_) {}


    _activeContainer =
      null;


    _activeModal =
      null;


    if (
      _previousActiveElement &&
      typeof _previousActiveElement.focus ===
        'function'
    ) {
      try {
        _previousActiveElement.focus();
      } catch (_) {}
    }


    _previousActiveElement =
      null;


    try {
      document.dispatchEvent(
        new CustomEvent(
          'fixeo:estimator-closed'
        )
      );
    } catch (_) {}
  }


  // ───────────────────────────────────────────────────────────────────────────
  // EstimatorModal
  // ───────────────────────────────────────────────────────────────────────────

  function EstimatorModal(
    rootEl,
    opts
  ) {
    opts =
      opts || {};


    STATE.onClose =
      opts.onClose ||
      function() {};


    STATE.sessionToken =
      null;


    STATE.session =
      null;


    STATE.pendingAnswer =
      null;


    STATE.quantityValue =
      null;


    STATE.measurementValue =
      null;


    this._root =
      rootEl;


    this._entryContext =
      opts.entryContext ||
      {};


    this._pricingContextToken =
      null;
  }


  EstimatorModal.prototype.render =
    function() {
      var root =
        this._root;


      root.innerHTML =
        '';


      var backdrop =
        el(
          'div',
          'estimator-backdrop'
        );


      backdrop.setAttribute(
        'id',
        'estimator-backdrop'
      );


      backdrop.addEventListener(
        'click',
        function(e) {
          if (
            e.target ===
              backdrop &&
            STATE.onClose
          ) {
            STATE.onClose();
          }
        }
      );


      var modal =
        el(
          'div',
          'estimator-modal estimator-modal--raficore-v3'
        );


      modal.setAttribute(
        'data-ux-version',
        'raficore-v3'
      );


      modal.setAttribute(
        'role',
        'dialog'
      );


      modal.setAttribute(
        'aria-modal',
        'true'
      );


      modal.setAttribute(
        'aria-labelledby',
        'estimator-header'
      );


      modal.appendChild(
        renderHeader()
      );


      var progressSlot =
        el(
          'div',
          ''
        );


      progressSlot.setAttribute(
        'id',
        'progress-slot'
      );


      modal.appendChild(
        progressSlot
      );


      var ctxSlot =
        el(
          'div',
          ''
        );


      ctxSlot.setAttribute(
        'id',
        'ctx-slot'
      );


      modal.appendChild(
        ctxSlot
      );


      var bodySlot =
        el(
          'div',
          ''
        );


      bodySlot.setAttribute(
        'id',
        'body-slot'
      );


      modal.appendChild(
        bodySlot
      );


      var footerSlot =
        el(
          'div',
          ''
        );


      footerSlot.setAttribute(
        'id',
        'footer-slot'
      );


      modal.appendChild(
        footerSlot
      );


      backdrop.appendChild(
        modal
      );


      root.appendChild(
        backdrop
      );


      trapFocus(
        modal
      );


      this._renderUnderstand();
    };


  // ───────────────────────────────────────────────────────────────────────────
  // STATE 1 — COMPRENDRE
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderUnderstand =
    function() {
      var self =
        this;


      var progressSlot =
        document.getElementById(
          'progress-slot'
        );


      var ctxSlot =
        document.getElementById(
          'ctx-slot'
        );


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      if (
        !progressSlot ||
        !bodySlot ||
        !footerSlot
      ) {
        return;
      }


      setRAFIState(
        'understanding'
      );


      progressSlot.innerHTML =
        '';


      progressSlot.appendChild(
        renderProgress(
          'COMPRENDRE'
        )
      );


      if (ctxSlot) {
        ctxSlot.innerHTML =
          '';
      }


      var body =
        el(
          'div',
          'estimator-body estimator-understand step-enter'
        );


      var shell =
        el(
          'div',
          'rafi-understand-console'
        );


      var hero =
        el(
          'div',
          'rafi-understand-hero'
        );


      var eyebrow =
        el(
          'div',
          'estimator-understand-eyebrow'
        );


      eyebrow.textContent =
        'RAFI · ANALYSE AVANT INTERVENTION';


      hero.appendChild(
        eyebrow
      );


      var title =
        el(
          'h2',
          'question-heading estimator-understand-title'
        );


      title.textContent =
        'Expliquez simplement ce qui se passe';


      hero.appendChild(
        title
      );


      var intro =
        el(
          'p',
          'question-intelligence-copy estimator-understand-copy'
        );


      intro.textContent =
        'RAFI transforme votre besoin en un périmètre clair, puis vérifie uniquement les détails nécessaires avant d’établir le prix FIXEO.';


      hero.appendChild(
        intro
      );


      var promise =
        el(
          'div',
          'rafi-understand-promise'
        );


      [
        '1 besoin',
        'Quelques précisions',
        '1 prix clair'
      ].forEach(
        function(label, idx) {
          var item =
            el(
              'span',
              'rafi-understand-promise__item'
            );

          item.appendChild(
            el(
              'span',
              'rafi-understand-promise__index',
              String(idx + 1)
            )
          );

          item.appendChild(
            el(
              'span',
              '',
              label
            )
          );

          promise.appendChild(
            item
          );
        }
      );


      hero.appendChild(
        promise
      );


      shell.appendChild(
        hero
      );


      var capture =
        el(
          'div',
          'rafi-capture-card'
        );


      var captureHead =
        el(
          'div',
          'rafi-capture-card__head'
        );


      captureHead.appendChild(
        el(
          'div',
          'rafi-capture-card__label',
          'VOTRE BESOIN'
        )
      );


      captureHead.appendChild(
        el(
          'div',
          'rafi-capture-card__status',
          'RAFI écoute'
        )
      );


      capture.appendChild(
        captureHead
      );


      var textarea =
        el(
          'textarea',
          'estimator-need-input rafi-capture-card__textarea'
        );


      textarea.setAttribute(
        'id',
        'estimator-need-input'
      );


      textarea.setAttribute(
        'rows',
        '4'
      );


      textarea.setAttribute(
        'maxlength',
        '2000'
      );


      textarea.setAttribute(
        'placeholder',
        'Ex. : mon robinet fuit sous l’évier depuis ce matin…'
      );


      textarea.setAttribute(
        'aria-label',
        'Décrivez votre intervention'
      );


      var initialDescription =
        _cleanText(
          self._entryContext
            .free_text ||
          self._entryContext
            .description,
          2000
        );


      textarea.value =
        initialDescription;


      capture.appendChild(
        textarea
      );


      var cityBlock =
        el(
          'div',
          'estimator-city-block rafi-capture-card__city'
        );


      var cityLabel =
        el(
          'label',
          'estimator-city-label'
        );


      cityLabel.setAttribute(
        'for',
        'estimator-city-input'
      );


      cityLabel.textContent =
        'Ville';


      cityBlock.appendChild(
        cityLabel
      );

var cityInput =
        el(
          'select',
          'estimator-city-input'
        );


      cityInput.setAttribute(
        'id',
        'estimator-city-input'
      );


      cityInput.setAttribute(
        'aria-label',
        'Ville d’intervention'
      );


      cityInput.setAttribute(
        'autocomplete',
        'address-level2'
      );


      var FIXEO_ESTIMATOR_CITIES = [
        '',
        'Casablanca',
        'Rabat',
        'Marrakech',
        'Tanger',
        'Agadir',
        'Fès',
        'Meknès',
        'Oujda',
        'Kénitra',
        'Tétouan',
        'Salé',
        'Temara',
        'El Jadida',
        'Béni Mellal',
        'Nador',
        'Khouribga',
        'Safi',
        'Taza',
        'Ouarzazate',
        'Mohammedia'
      ];


      var currentCity =
        _displayCity(
          self._entryContext
            .city ||
          self._entryContext
            .city_slug
        );


      FIXEO_ESTIMATOR_CITIES.forEach(
        function(city) {
          var option =
            document.createElement(
              'option'
            );

          option.value =
            city;

          option.textContent =
            city ||
            'Choisir une ville';

          if (
            city &&
            currentCity &&
            city.toLowerCase() ===
              currentCity.toLowerCase()
          ) {
            option.selected =
              true;
          }

          cityInput.appendChild(
            option
          );
        }
      );


      cityBlock.appendChild(
        cityInput
      );
    

      capture.appendChild(
        cityBlock
      );


      var reassurance =
        el(
          'div',
          'estimator-understand-trust rafi-capture-card__trust'
        );


      reassurance.textContent =
        'Aucune demande n’est envoyée à un artisan à cette étape.';


      capture.appendChild(
        reassurance
      );


      shell.appendChild(
        capture
      );


      body.appendChild(
        shell
      );


      bodySlot.innerHTML =
        '';


      bodySlot.appendChild(
        body
      );


      function canContinue() {
        var text =
          _cleanText(
            textarea.value,
            2000
          );


        var city =
          _cleanText(
            cityInput.value,
            120
          );


        var hasStructuredHint =
          !!(
            self._entryContext
              .metier_hint ||
            self._entryContext
              .service_hint
          );


        return (
          city.length > 0 &&
          (
            text.length >= 3 ||
            hasStructuredHint
          )
        );
      }


      var footer =
        renderFooter({
          primaryLabel:
            'Lancer l’analyse RAFI →',

          primaryDisabled:
            !canContinue(),

          onPrimary:
            function() {
              var description =
                _cleanText(
                  textarea.value,
                  2000
                );


              var city =
                _cleanText(
                  cityInput.value,
                  120
                );


              if (city) {
                try { sessionStorage.setItem('fxrf4_trusted_city_session', city); } catch (_) {}
              }
              if (!city) {
                cityInput.focus();
                return;
              }


              var hasStructuredHint =
                !!(
                  self._entryContext
                    .metier_hint ||
                  self._entryContext
                    .service_hint
                );


              if (
                !hasStructuredHint &&
                description.length < 3
              ) {
                textarea.focus();
                return;
              }


              self._entryContext
                .free_text =
                description ||
                null;


              self._entryContext
                .description =
                description ||
                null;


              self._entryContext
                .city =
                city;


              self._entryContext
                .city_slug =
                city;


              if (
                !self._entryContext
                  .entry_point
              ) {
                self._entryContext
                  .entry_point =
                  'RAFI';
              }


              self._startSession();
            }
        });


      footerSlot.innerHTML =
        '';


      footerSlot.appendChild(
        footer
      );


      function refreshCTA() {
        updateCTA(
          canContinue()
        );
      }


      textarea.addEventListener(
        'input',
        refreshCTA
      );


      cityInput.addEventListener(
        'change',
        refreshCTA
      );


      focusSoon(
        '#estimator-need-input'
      );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Start session
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._startSession =
    function() {
      var self =
        this;


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      setRAFIState(
        'analyzing'
      );


      triggerIntelligenceLine();


      if (bodySlot) {
        bodySlot.innerHTML =
          '';


        var loading =
          el(
            'div',
            'estimator-body estimator-loading step-enter'
          );


        loading.appendChild(
          el(
            'div',
            'estimator-loading-title',
            'RAFI analyse votre besoin…'
          )
        );


        loading.appendChild(
          el(
            'div',
            'estimator-loading-copy',
            'Identification du métier et de l’intervention.'
          )
        );


        bodySlot.appendChild(
          loading
        );
      }


      if (footerSlot) {
        footerSlot.innerHTML =
          '';
      }


      window.FixeoEstimatorAPI
        .start(
          self._entryContext
        )
        .then(
          function(r) {
            if (
              !r ||
              !r.ok
            ) {
              return self._showError(
                'Impossible de démarrer l’estimation.'
              );
            }


            STATE.sessionToken =
              r.session
                .session_token;


            STATE.session =
              r.session;


            self._renderStep(
              r.session,
              r.next_step
            );
          }
        )
        .catch(
          function() {
            self._showError(
              'Problème de connexion. Veuillez réessayer.'
            );
          }
        );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Render server step
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderStep =
    function(
      session,
      nextStep
    ) {
      var self =
        this;


      var progressSlot =
        document.getElementById(
          'progress-slot'
        );


      var ctxSlot =
        document.getElementById(
          'ctx-slot'
        );


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      if (
        !progressSlot ||
        !bodySlot ||
        !footerSlot
      ) {
        return;
      }


      if (
        session &&
        session.ui_recommendation ===
          'PAGE_REQUIRED'
      ) {
        try {
          sessionStorage.setItem(
            'fixeo_estimator_token_v1',
            STATE.sessionToken
          );
        } catch (_) {}


        window.location.href =
          '/estimation';

        return;
      }


      var stage =
        stageFromSessionState(
          session &&
          session.state
        );


      progressSlot.innerHTML =
        '';


      progressSlot.appendChild(
        renderProgress(
          stage
        )
      );


      if (ctxSlot) {
        ctxSlot.innerHTML =
          '';


        ctxSlot.appendChild(
          renderContextBar(
            self._entryContext,
            session
          )
        );
      }


      triggerIntelligenceLine();


      if (
        nextStep &&
        nextStep.type ===
          'METIER_SELECTION'
      ) {
        setRAFIState(
          'analyzing'
        );


        return self
          ._renderMetierSelection(
            nextStep
          );
      }


      if (
        nextStep &&
        nextStep.type ===
          'SERVICE_SELECTION'
      ) {
        setRAFIState(
          'identified'
        );


        return self
          ._renderServiceSelection(
            nextStep
          );
      }


      if (
        nextStep &&
        nextStep.type ===
          'QUESTION'
      ) {
        setRAFIState(
          'verifying'
        );


        var isBoolean =
          nextStep.answer_type ===
          'boolean';


        var body =
          renderQuestion(
            nextStep,
            isBoolean
              ? function(val) {
                  self._submitAnswer(
                    nextStep.question_id,
                    val
                  );
                }
              : null
          );


        bodySlot.innerHTML =
          '';


        bodySlot.appendChild(
          body
        );


        footerSlot.innerHTML =
          '';


        if (!isBoolean) {
          var footer =
            renderFooter({
              primaryLabel:
                'Confirmer',

              primaryDisabled:
                STATE.pendingAnswer ===
                  null ||
                STATE.pendingAnswer ===
                  undefined,

              onPrimary:
                function() {
                  if (
                    STATE.pendingAnswer !==
                      null &&
                    STATE.pendingAnswer !==
                      undefined
                  ) {
                    self._submitAnswer(
                      nextStep.question_id,
                      STATE.pendingAnswer
                    );
                  }
                }
            });


          footerSlot.appendChild(
            footer
          );
        }


        return;
      }


      if (
        (
          session &&
          session.state ===
            'READY_FOR_ENGINE'
        ) ||
        (
          nextStep &&
          nextStep.type ===
            'READY'
        )
      ) {
        return self._evaluate();
      }


      if (
        nextStep &&
        nextStep.type ===
          'OUTCOME'
      ) {
        return self
          ._renderTerminalSession(
            session
          );
      }


      if (
        nextStep &&
        nextStep.type ===
          'CONFIRMATION'
      ) {
        return self
          ._renderTerminalSession(
            session
          );
      }


      if (
        nextStep &&
        nextStep.type ===
          'EVALUATING'
      ) {
        setRAFIState(
          'verifying'
        );

        return;
      }


      self._showError(
        'RAFI ne peut pas poursuivre cette estimation pour le moment.'
      );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // STATE 2 — Métier selection
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderMetierSelection =
    function(nextStep) {
      var self =
        this;


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      if (
        !bodySlot ||
        !footerSlot
      ) {
        return;
      }


      var candidates =
        (
          nextStep &&
          nextStep.candidate_metiers
        ) ||
        [];


      if (
        !candidates.length
      ) {
        return self._showError(
          'Aucun métier disponible pour poursuivre l’analyse.'
        );
      }


      var pending =
        false;


      var body =
        el(
          'div',
          'estimator-body step-enter estimator-metier-selection'
        );


      var selector =
        el(
          'div',
          'rafi-selector-console rafi-selector-console--metier'
        );


      var kicker =
        el(
          'div',
          'rafi-selector-kicker'
        );

      kicker.textContent =
        'RAFI · IDENTIFICATION DU MÉTIER';

      selector.appendChild(
        kicker
      );


      var title =
        el(
          'h2',
          'question-heading rafi-selector-title'
        );


      title.textContent =
        'Quel spécialiste correspond à votre besoin ?';


      selector.appendChild(
        title
      );


      selector.appendChild(
        el(
          'p',
          'question-intelligence-copy rafi-selector-copy',
          'Votre description est conservée. Sélectionnez simplement le métier : RAFI affinera ensuite l’intervention.'
        )
      );


      var cards =
        el(
          'div',
          'answer-cards rafi-choice-grid rafi-choice-grid--metiers'
        );


      candidates.forEach(
        function(metier, idx) {
          var card =
            renderAnswerCard(
              {
                value:
                  metier,

                label:
                  metierLabel(
                    metier
                  ),

                eyebrow:
                  'Métier ' +
                  String(idx + 1)
                    .padStart(
                      2,
                      '0'
                    ),

                meta:
                  'Choisir ce spécialiste',

                indexLabel:
                  String(idx + 1)
                    .padStart(
                      2,
                      '0'
                    ),

                variant:
                  'metier'
              },
              false,
              function(selectedMetier) {
                if (
                  pending
                ) {
                  return;
                }


                pending =
                  true;


                cards
                  .querySelectorAll(
                    '.answer-card'
                  )
                  .forEach(
                    function(c) {
                      c.setAttribute(
                        'aria-disabled',
                        'true'
                      );

                      c.classList.add(
                        'is-pending'
                      );
                    }
                  );


                self
                  ._restartWithMetier(
                    selectedMetier
                  );
              }
            );


          card.__indexLabel =
            String(idx + 1)
              .padStart(
                2,
                '0'
              );


          cards.appendChild(
            card
          );
        }
      );


      selector.appendChild(
        cards
      );


      body.appendChild(
        selector
      );


      bodySlot.innerHTML =
        '';


      bodySlot.appendChild(
        body
      );


      footerSlot.innerHTML =
        '';
    };


  EstimatorModal.prototype._restartWithMetier =
    function(metier) {
      var self =
        this;


      self._entryContext
        .metier_hint =
        metier;


      setRAFIState(
        'analyzing'
      );


      triggerIntelligenceLine();


      window.FixeoEstimatorAPI
        .start(
          self._entryContext
        )
        .then(
          function(r) {
            if (
              !r ||
              !r.ok
            ) {
              return self._showError(
                'Impossible de poursuivre avec ce métier.'
              );
            }


            STATE.sessionToken =
              r.session
                .session_token;


            STATE.session =
              r.session;


            self._renderStep(
              r.session,
              r.next_step
            );
          }
        )
        .catch(
          function() {
            self._showError(
              'Problème de connexion. Veuillez réessayer.'
            );
          }
        );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // STATE 2 — Service selection
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderServiceSelection =
    function(nextStep) {
      var self =
        this;


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      if (
        !bodySlot ||
        !footerSlot
      ) {
        return;
      }


      var candidates =
        (
          nextStep &&
          nextStep.candidate_services
        ) ||
        [];


      if (
        candidates.length ===
        0
      ) {
        return self._showError(
          'Aucun service disponible pour ce métier.'
        );
      }


      var pending =
        false;


      var body =
        el(
          'div',
          'estimator-body step-enter estimator-service-selection'
        );


      var selector =
        el(
          'div',
          'rafi-selector-console rafi-selector-console--service'
        );


      selector.appendChild(
        el(
          'div',
          'rafi-selector-kicker',
          'RAFI · INTERVENTION'
        )
      );


      var title =
        el(
          'h2',
          'question-heading rafi-selector-title'
        );


      title.textContent =
        'Quelle intervention décrit le mieux la situation ?';


      selector.appendChild(
        title
      );


      selector.appendChild(
        el(
          'p',
          'question-intelligence-copy rafi-selector-copy',
          'Choisissez le périmètre le plus proche. RAFI vérifiera ensuite les seuls détails qui peuvent changer l’estimation.'
        )
      );


      var cards =
        el(
          'div',
          'answer-cards rafi-choice-stack rafi-choice-stack--services'
        );


      candidates.forEach(
        function(svc, idx) {
          var label =
            svc.label_fr ||
            svc.short_label_fr ||
            svc.service_code;


          var card =
            renderAnswerCard(
              {
                label:
                  label,

                value:
                  svc.service_code,

                eyebrow:
                  'Intervention ' +
                  String(idx + 1)
                    .padStart(
                      2,
                      '0'
                    ),

                meta:
                  'Sélectionner ce périmètre',

                indexLabel:
                  String(idx + 1)
                    .padStart(
                      2,
                      '0'
                    ),

                variant:
                  'service'
              },
              false,
              function(serviceCode) {
                if (
                  pending
                ) {
                  return;
                }


                pending =
                  true;


                cards
                  .querySelectorAll(
                    '.answer-card'
                  )
                  .forEach(
                    function(c) {
                      c.setAttribute(
                        'aria-disabled',
                        'true'
                      );

                      c.classList.add(
                        'is-pending'
                      );
                    }
                  );


                setRAFIState(
                  'analyzing'
                );


                triggerIntelligenceLine();


                window.FixeoEstimatorAPI
                  .selectService(
                    STATE.sessionToken,
                    serviceCode
                  )
                  .then(
                    function(r) {
                      if (
                        !r ||
                        !r.ok
                      ) {
                        pending =
                          false;

                        return self._showError(
                          'Impossible de sélectionner cette intervention.'
                        );
                      }


                      STATE.sessionToken =
                        r.session
                          .session_token;


                      STATE.session =
                        r.session;


                      self._renderStep(
                        r.session,
                        r.next_step
                      );
                    }
                  )
                  .catch(
                    function() {
                      pending =
                        false;


                      self._showError(
                        'Problème de connexion. Veuillez réessayer.'
                      );
                    }
                  );
              }
            );


          card.__indexLabel =
            String(idx + 1)
              .padStart(
                2,
                '0'
              );


          cards.appendChild(
            card
          );
        }
      );


      selector.appendChild(
        cards
      );


      body.appendChild(
        selector
      );


      bodySlot.innerHTML =
        '';


      bodySlot.appendChild(
        body
      );


      footerSlot.innerHTML =
        '';
    };


  // ───────────────────────────────────────────────────────────────────────────
  // STATE 3 — qualification
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._submitAnswer =
    function(
      questionId,
      answer
    ) {
      var self =
        this;


      setRAFIState(
        'analyzing'
      );


      triggerIntelligenceLine();


      window.FixeoEstimatorAPI
        .answer(
          STATE.sessionToken,
          questionId,
          answer
        )
        .then(
          function(r) {
            if (
              !r ||
              !r.ok
            ) {
              return self._showError(
                'Impossible d’enregistrer cette réponse.'
              );
            }


            STATE.sessionToken =
              r.session
                .session_token;


            STATE.session =
              r.session;


            self._renderStep(
              r.session,
              r.next_step
            );
          }
        )
        .catch(
          function() {
            self._showError(
              'Problème de connexion. Veuillez réessayer.'
            );
          }
        );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Evaluate
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._evaluate =
    function() {
      var self =
        this;


      setRAFIState(
        'verifying'
      );


      triggerIntelligenceLine();


      window.FixeoEstimatorAPI
        .evaluate(
          STATE.sessionToken
        )
        .then(
          function(r) {
            if (
              !r ||
              !r.ok
            ) {
              return self._showError(
                'Impossible de calculer l’estimation.'
              );
            }


            STATE.sessionToken =
              r.session
                .session_token;


            STATE.session =
              r.session;


            self._pricingContextToken =
              r.pricing_context_token ||
              null;


            self._renderOutcome(
              r.session,
              r.outcome
            );
          }
        )
        .catch(
          function() {
            self._showError(
              'Problème de connexion. Veuillez réessayer.'
            );
          }
        );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Terminal session without evaluate()
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderTerminalSession =
    function(session) {
      var state =
        session &&
        session.state;


      var outcome =
        (
          session &&
          session.outcome
        ) ||
        {
          outcome_type:
            state,

          service_code:
            session &&
            session.service_code
        };


      this._renderOutcome(
        session,
        outcome
      );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // STATE 4 — Outcome
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._renderOutcome =
    function(
      session,
      outcome
    ) {
      var self =
        this;


      var progressSlot =
        document.getElementById(
          'progress-slot'
        );


      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      var modal =
        document.querySelector(
          '.estimator-modal'
        );


      if (
        !bodySlot ||
        !footerSlot
      ) {
        return;
      }


      if (progressSlot) {
        progressSlot.innerHTML =
          '';


        progressSlot.appendChild(
          renderProgress(
            'PRIX'
          )
        );
      }


      if (modal) {
        modal.classList.add(
          'result-active'
        );
      }


      var ot =
        outcome &&
        outcome.outcome_type;


      var bodyEl;


      switch (ot) {
        case 'PRICE_READY':
          setRAFIState(
            'complete'
          );

          bodyEl =
            renderPriceResult(
              outcome
            );
          break;


        case 'LABOUR_PLUS_PART_READY':
          setRAFIState(
            'complete'
          );

          bodyEl =
            renderLabourPartResult(
              outcome
            );
          break;


        case 'DIAGNOSTIC_READY':
          setRAFIState(
            'complete'
          );

          bodyEl =
            renderDiagnosticResult(
              outcome
            );
          break;


        case 'QUOTE_REQUIRED':
          setRAFIState(
            'idle'
          );

          bodyEl =
            renderQuoteResult(
              outcome
            );
          break;


        case 'ROUTE_REQUIRED':
          setRAFIState(
            'identified'
          );

          bodyEl =
            renderRouteResult(
              outcome
            );
          break;


        case 'SAFETY_STOP':
          setRAFIState(
            'idle'
          );

          bodyEl =
            renderSafetyResult();
          break;


        case 'REQUALIFY':
          setRAFIState(
            'idle'
          );

          bodyEl =
            renderRequalifyResult();
          break;


        default:
          setRAFIState(
            'idle'
          );


          bodyEl =
            el(
              'div',
              'estimator-body step-enter'
            );


          bodyEl.appendChild(
            el(
              'p',
              '',
              'Cette intervention nécessite une vérification complémentaire.'
            )
          );
      }


      bodySlot.innerHTML =
        '';


      bodySlot.appendChild(
        bodyEl
      );


      var footerOpts =
        {};


      var noPricingToken =
        new Set([
          'SAFETY_STOP',
          'QUOTE_REQUIRED',
          'ROUTE_REQUIRED',
          'REQUALIFY'
        ]);


      if (
        !noPricingToken.has(
          ot
        ) &&
        self._pricingContextToken
      ) {
        footerOpts.primaryLabel =
          ctaLabel(
            outcome
          );


        footerOpts.onPrimary =
          function() {
            if (
              window
                .FixeoEstimatorReservationBridge &&
              self._pricingContextToken
            ) {
              window
                .FixeoEstimatorReservationBridge
                .prepareContext(
                  self._pricingContextToken
                );
            }


            document.dispatchEvent(
              new CustomEvent(
                'fixeo:estimator-reserve',
                {
                  detail: {
                    pricing_context_token:
                      self._pricingContextToken
                  }
                }
              )
            );
          };


      } else if (
        ot ===
        'QUOTE_REQUIRED'
      ) {
        footerOpts.primaryLabel =
          'Demander un devis';


        footerOpts.onPrimary =
          function() {
            if (
              STATE.onClose
            ) {
              STATE.onClose();
            }
          };


      } else if (
        ot ===
        'SAFETY_STOP'
      ) {
        footerOpts.primaryLabel =
          'Fermer';


        footerOpts.onPrimary =
          function() {
            if (
              STATE.onClose
            ) {
              STATE.onClose();
            }
          };


      } else {
        footerOpts.primaryLabel =
          'Fermer';


        footerOpts.onPrimary =
          function() {
            if (
              STATE.onClose
            ) {
              STATE.onClose();
            }
          };
      }


      var footer =
        renderFooter(
          footerOpts
        );


      footerSlot.innerHTML =
        '';


      footerSlot.appendChild(
        footer
      );
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Error surface
  // ───────────────────────────────────────────────────────────────────────────

  EstimatorModal.prototype._showError =
    function(msg) {
      var bodySlot =
        document.getElementById(
          'body-slot'
        );


      var footerSlot =
        document.getElementById(
          'footer-slot'
        );


      if (!bodySlot) {
        return;
      }


      setRAFIState(
        'idle'
      );


      var div =
        el(
          'div',
          'estimator-body estimator-error step-enter'
        );


      var title =
        el(
          'div',
          'estimator-error-title'
        );


      title.textContent =
        'RAFI ne peut pas poursuivre';


      div.appendChild(
        title
      );


      var copy =
        el(
          'p',
          'estimator-error-copy'
        );


      copy.textContent =
        msg ||
        'Une erreur est survenue.';


      div.appendChild(
        copy
      );


      bodySlot.innerHTML =
        '';


      bodySlot.appendChild(
        div
      );


      if (footerSlot) {
        footerSlot.innerHTML =
          '';


        footerSlot.appendChild(
          renderFooter({
            primaryLabel:
              'Fermer',

            onPrimary:
              function() {
                if (
                  STATE.onClose
                ) {
                  STATE.onClose();
                }
              }
          })
        );
      }
    };


  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  window.FixeoEstimatorV2 = {
    open:
      function(
        entryContext
      ) {
        if (
          _activeModal
        ) {
          return Promise.resolve({
            accepted: true
          });
        }


        var normalizedCtx =
          _normalizeEntryContext(
            entryContext ||
            {}
          );


        try {
          _previousActiveElement =
            document.activeElement;


          _activeContainer =
            _createContainer();


          _activeModal =
            new EstimatorModal(
              _activeContainer,
              {
                entryContext:
                  normalizedCtx,

                onClose:
                  function() {
                    _destroyContainer();
                  }
              }
            );


          _activeModal.render();


          try {
            document.body.classList.add(
              'fx-estimator-tunnel-active'
            );
          } catch (_) {}


          return Promise.resolve({
            accepted: true
          });


        } catch (_) {
          _destroyContainer();


          return Promise.resolve({
            accepted: false,
            reason: 'init_error'
          });
        }
      },


    close:
      function() {
        if (
          STATE.onClose
        ) {
          STATE.onClose();

        } else {
          _destroyContainer();
        }
      },


    hide:
      function() {
        if (
          !_activeContainer
        ) {
          return;
        }


        try {
          _activeContainer
            .style
            .visibility =
            'hidden';


          _activeContainer
            .style
            .pointerEvents =
            'none';

        } catch (_) {}
      },


    reveal:
      function() {
        if (
          !_activeContainer
        ) {
          return;
        }


        try {
          _activeContainer
            .style
            .visibility =
            '';


          _activeContainer
            .style
            .pointerEvents =
            '';

        } catch (_) {}
      },


    isOpen:
      function() {
        return !!_activeModal;
      }
  };

}());


