/**
 * RAFI Classifier V1
 * js/rafi-classifier-v1.js  v1a
 *
 * Deterministic keyword-rule engine for:
 *   1. service_category suggestion from description text
 *   2. urgency suggestion from description text
 *
 * Rules:
 *   - No external API calls
 *   - No Supabase / DB reads
 *   - No auth interaction
 *   - No financial decisions
 *   - No winner selection
 *   - No mission-state mutations
 *   - Returns suggestions only — user always has final say
 *
 * Integration contract (for callers):
 *   var result = RafiClassifier.classify(descriptionText);
 *   result.category  → { value: 'plomberie', confidence: 3, evidence: ['fuite','eau','tuyau'] }
 *                    → null if no match
 *   result.urgency   → { value: 'now'|'urgent'|'normale', evidence: ['fuite importante'] }
 *
 * Caller responsibilities:
 *   - Only PRE-FILL or SUGGEST — do NOT silently override user selection
 *   - Show evidence / reason for suggestion (improves trust)
 *   - User must always be able to correct category, urgency, description
 *
 * Canonical category slugs match public.service_requests.service_category:
 *   plomberie, electricite, serrurerie, climatisation, menuiserie,
 *   peinture, maconnerie, nettoyage, carrelage, jardinage, bricolage,
 *   demenagement, autre
 *
 * Canonical urgency values match public.service_requests.urgency:
 *   null (normale), 'urgent', 'now'
 */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════════
   * CATEGORY RULES
   * Each entry: { slug, label, keywords[] }
   * Keywords are matched case-insensitively against normalized input.
   * Longer/more-specific keywords get higher base weight.
   * A keyword appearing multiple times in the text only counts once.
   * ════════════════════════════════════════════════════════════ */

  var CATEGORY_RULES = [
    {
      slug: 'plomberie',
      label: 'Plomberie',
      keywords: [
        // high-signal
        'plomberie', 'plombier', 'fuite d\'eau', 'fuite importante', 'inondation',
        // standard
        'fuite', 'robinet', 'robinets', 'tuyau', 'tuyaux', 'canalisation',
        'évier', 'lavabo', 'douche', 'baignoire', 'toilette', 'wc', 'chasse d\'eau',
        'eau chaude', 'chauffe-eau', 'ballon d\'eau', 'siphon', 'égout',
        'pompe à eau', 'compteur d\'eau', 'joint', 'vanne', 'gouttière', 'trop-plein'
      ]
    },
    {
      slug: 'electricite',
      label: 'Électricité',
      keywords: [
        // high-signal
        'électricité', 'électricien', 'panne de courant', 'panne électrique',
        'pas de courant', 'court-circuit',
        // standard
        'prise', 'prises', 'disjoncteur', 'tableau électrique', 'fusible',
        'câble', 'câbles', 'lumière', 'ampoule', 'interrupteur', 'éclairage',
        'compteur électrique', 'installation électrique', 'fil électrique',
        'onduleur', 'groupe électrogène', 'borne de recharge'
      ]
    },
    {
      slug: 'serrurerie',
      label: 'Serrurerie',
      keywords: [
        // high-signal
        'serrurier', 'serrurerie', 'serrure cassée', 'porte bloquée', 'clé cassée',
        'porte fermée à clé',
        // standard
        'serrure', 'clé', 'clés', 'verrou', 'cadenas', 'portail', 'volet',
        'porte d\'entrée', 'porte blindée', 'coffre-fort', 'digicode',
        'poignée', 'charnière', 'gonds', 'loquet', 'verrou de sécurité'
      ]
    },
    {
      slug: 'climatisation',
      label: 'Climatisation',
      keywords: [
        // high-signal
        'climatisation', 'climatiseur', 'clim en panne',
        // standard
        'clim', 'ac', 'ventilation', 'ventilateur', 'chauffage',
        'chaudière', 'radiateur', 'pompe à chaleur', 'split', 'réversible',
        'entretien clim', 'nettoyage clim', 'froid', 'trop chaud', 'température'
      ]
    },
    {
      slug: 'menuiserie',
      label: 'Menuiserie',
      keywords: [
        // high-signal
        'menuisier', 'menuiserie',
        // standard
        'bois', 'porte en bois', 'fenêtre', 'fenêtres', 'placard', 'armoire',
        'parquet', 'escalier', 'rampe', 'portail bois', 'volet bois',
        'plinthes', 'boiserie', 'caisson', 'cuisine équipée', 'dressing'
      ]
    },
    {
      slug: 'peinture',
      label: 'Peinture',
      keywords: [
        // high-signal
        'peintre', 'peinture', 'repeindre', 'peindre', 'peinture intérieure', 'peinture extérieure',
        // standard
        'mur à peindre', 'plafond', 'façade', 'enduit', 'crépi', 'badigeon',
        'teinte', 'couleur', 'blanc', 'tapisserie', 'papier peint', 'décoration murale',
        'apprêt', 'sous-couche', 'rouleau', 'pinceau'
      ]
    },
    {
      slug: 'maconnerie',
      label: 'Maçonnerie',
      keywords: [
        // high-signal
        'maçon', 'maçonnerie', 'béton', 'fissure dans le mur', 'mur porteur',
        // standard — NOTE: 'carrelage' NOT here to avoid conflict with carrelage category
        'fissure', 'dallage', 'dalle', 'fondation',
        'agglo', 'brique', 'parpaing', 'enduit de façade', 'isolation',
        'cloison', 'demolition', 'démolition', 'muret', 'seuil', 'marche'
      ]
    },
    {
      slug: 'nettoyage',
      label: 'Nettoyage',
      keywords: [
        // high-signal
        'nettoyage', 'nettoyeur', 'société de nettoyage', 'ménage professionnel',
        // standard — NOTE: 'ménage' NOT included to avoid false match inside 'emménagement'
        'nettoyer', 'agent de ménage', 'propreté', 'désinfection', 'vitres',
        'moquette', 'tapis', 'après chantier', 'fin de chantier',
        'poussière', 'débarras', 'encombrants'
      ]
    },
    {
      slug: 'carrelage',
      label: 'Carrelage',
      keywords: [
        // high-signal
        'carreleur', 'carrelage', 'pose de carrelage',
        // standard
        'faïence', 'mosaïque', 'joint de carrelage', 'carreau',
        'carreau cassé', 'recollage', 'sol carrelé', 'mur carrelé'
      ]
    },
    {
      slug: 'jardinage',
      label: 'Jardinage',
      keywords: [
        // high-signal
        'jardinier', 'jardinage', 'entretien jardin',
        // standard
        'jardin', 'gazon', 'tonte', 'taille', 'arbres', 'haie',
        'plantes', 'arrosage', 'débroussaillage', 'engazonnement',
        'potager', 'terrasse verte', 'élagage'
      ]
    },
    {
      slug: 'bricolage',
      label: 'Bricolage',
      keywords: [
        // high-signal
        'bricolage', 'bricoleur', 'homme toutes mains',
        // standard
        'fixer', 'accrocher', 'monter', 'assembler', 'installer',
        'montage meuble', 'percer', 'chevilles', 'petite réparation',
        'tablette', 'étagère', 'store', 'miroir à fixer'
      ]
    },
    {
      slug: 'demenagement',
      label: 'Déménagement',
      keywords: [
        // high-signal
        'déménagement', 'déménageur', 'société de déménagement',
        // standard
        'déménager', 'transporter', 'transport de meubles', 'camion de déménagement',
        'cartons', 'emballage', 'monte-meubles', 'déménage', 'nouvel appartement'
      ]
    }
  ];

  /* ════════════════════════════════════════════════════════════
   * URGENCY RULES
   * Evaluated in order: first match wins (now > urgent > normale).
   * Confidence = number of matching signals.
   * ════════════════════════════════════════════════════════════ */

  var URGENCY_RULES = [
    {
      value: 'now',
      signals: [
        // NOTE: 'urgent' (adj) is intentionally in the 'urgent' tier below,
        // not here, to avoid false-positive on 'urgente'/'urgents' substrings.
        // 'urgence' (noun) stays here as the clear critical signal.
        'urgence', 'immédiatement', 'immédiate', 'de suite',
        'inondation', 'inondé',
        'fuite importante', 'grosse fuite', 'eau partout',
        'pas de courant', 'panne totale', 'plus d\'électricité',
        'porte bloquée', 'coincé', 'enfermé',
        'danger', 'dangereux', 'risque',
        'incendie', 'fumée', 'court-circuit visible',
        'SOS', 'sos'
      ]
    },
    {
      value: 'urgent',
      signals: [
        'urgent',  // word-level match (no 'urgente' false positive — checked at indexOf level)
        'dès que possible', 'des que possible', 'dès aujourd\'hui', 'aujourd\'hui',
        'rapidement', 'au plus vite', 'vite', 'assez urgent',
        'problème', 'gêne', 'dérangement', 'bloquée', 'bloque',
        'ne fonctionne plus', 'ne marche plus', 'en panne',
        'avant ce soir', 'cette semaine', 'dans la journée'
      ]
    }
    // 'normale' is the default when no signals match
  ];

  /* ════════════════════════════════════════════════════════════
   * NORMALIZATION HELPERS
   * ════════════════════════════════════════════════════════════ */

  /**
   * Normalize text for matching:
   * - lowercase
   * - strip accents / diacritics (ASCII fold)
   * - collapse multiple spaces
   */
  function normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      // French accent normalization
      .replace(/[àâä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/[ùûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[ñ]/g, 'n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Test whether a signal phrase appears in normalized text.
   * For single-word signals: requires word boundary (space, start, or end).
   * For multi-word signals (phrases): simple indexOf is sufficient.
   */
  function signalMatches(text, signal) {
    var idx = text.indexOf(signal);
    if (idx === -1) return false;
    // For single-word signals, check surrounding characters are non-alpha
    // to avoid 'urgent' matching inside 'urgente' or 'urgents'
    if (signal.indexOf(' ') === -1) {
      var before = idx === 0 ? '' : text[idx - 1];
      var after  = idx + signal.length >= text.length ? '' : text[idx + signal.length];
      var bOk = before === '' || !/[a-z0-9]/.test(before);
      var aOk = after  === '' || !/[a-z0-9]/.test(after);
      return bOk && aOk;
    }
    return true;  // phrase match: indexOf is sufficient
  }
  var normalizedCategoryRules = CATEGORY_RULES.map(function (rule) {
    return {
      slug:     rule.slug,
      label:    rule.label,
      keywords: rule.keywords.map(normalize)
    };
  });

  var normalizedUrgencyRules = URGENCY_RULES.map(function (rule) {
    return {
      value:   rule.value,
      signals: rule.signals.map(normalize)
    };
  });

  /* ════════════════════════════════════════════════════════════
   * CLASSIFICATION ENGINE
   * ════════════════════════════════════════════════════════════ */

  /**
   * Classify a description string.
   *
   * @param {string} description — raw user input
   * @returns {{
   *   category: { value: string, confidence: number, evidence: string[] } | null,
   *   urgency:  { value: string, confidence: number, evidence: string[] }
   * }}
   */
  function classify(description) {
    var normalized = normalize(description || '');
    return {
      category: classifyCategory(normalized, description),
      urgency:  classifyUrgency(normalized, description)
    };
  }

  /**
   * Category classification.
   * Scores each category by counting distinct keyword hits.
   * Returns the best-scoring category only if confidence >= 1.
   * On tie: returns both candidates (caller can ask user).
   */
  function classifyCategory(normalized, rawDescription) {
    var scores = [];

    normalizedCategoryRules.forEach(function (rule) {
      var hits = [];
      rule.keywords.forEach(function (kw) {
        if (signalMatches(normalized, kw)) {
          var origIdx = normalizedCategoryRules.indexOf(rule);
          var origKw = CATEGORY_RULES[origIdx] ? CATEGORY_RULES[origIdx].keywords[rule.keywords.indexOf(kw)] : kw;
          hits.push(origKw || kw);
        }
      });
      if (hits.length > 0) {
        scores.push({ slug: rule.slug, label: rule.label, confidence: hits.length, evidence: hits });
      }
    });

    if (!scores.length) return null;

    // Sort by confidence descending
    scores.sort(function (a, b) { return b.confidence - a.confidence; });

    var best = scores[0];

    // Check for ties at top score
    var ties = scores.filter(function (s) { return s.confidence === best.confidence; });

    return {
      value:      best.slug,
      label:      best.label,
      confidence: best.confidence,
      evidence:   best.evidence,
      isTie:      ties.length > 1,
      tieCandidates: ties.length > 1 ? ties.map(function (t) { return t.slug; }) : []
    };
  }

  /**
   * Urgency classification.
   * Always returns a result (default: 'normale').
   */
  function classifyUrgency(normalized) {
    for (var i = 0; i < normalizedUrgencyRules.length; i++) {
      var rule = normalizedUrgencyRules[i];
      var hits = [];
      rule.signals.forEach(function (signal) {
        if (signalMatches(normalized, signal)) {
          var origSignal = URGENCY_RULES[i].signals[rule.signals.indexOf(signal)];
          hits.push(origSignal || signal);
        }
      });
      if (hits.length > 0) {
        return {
          value:      rule.value,
          confidence: hits.length,
          evidence:   hits
        };
      }
    }
    return {
      value:      'normale',
      confidence: 0,
      evidence:   []
    };
  }

  /* ════════════════════════════════════════════════════════════
   * SUGGESTION DISPLAY HELPERS
   * ════════════════════════════════════════════════════════════ */

  /**
   * Format a human-readable reason for the category suggestion.
   * Used in the UI tooltip / hint below the category dropdown.
   *
   * @param {{ value, confidence, evidence, isTie }} catResult
   * @returns {string} French sentence
   */
  function categoryReason(catResult) {
    if (!catResult) return '';
    var ev = catResult.evidence.slice(0, 3);  // show max 3 keywords
    var joined = ev.map(function (e) { return '\u00ab\u00a0' + e + '\u00a0\u00bb'; }).join(', ');
    if (catResult.isTie) {
      return 'RAFI hésite entre plusieurs catégories (' + catResult.tieCandidates.join(', ') + ').';
    }
    return 'RAFI suggère \u00ab\u00a0' + catResult.label + '\u00a0\u00bb d\'après : ' + joined + '.';
  }

  /**
   * Format a human-readable reason for the urgency suggestion.
   *
   * @param {{ value, confidence, evidence }} urgencyResult
   * @returns {string} French sentence
   */
  function urgencyReason(urgencyResult) {
    if (!urgencyResult || urgencyResult.value === 'normale') return '';
    var ev = urgencyResult.evidence.slice(0, 2);
    var joined = ev.map(function (e) { return '\u00ab\u00a0' + e + '\u00a0\u00bb'; }).join(', ');
    return 'RAFI détecte une urgence (' + urgencyResult.value + ') d\'après : ' + joined + '.';
  }

  /* ════════════════════════════════════════════════════════════
   * MINIMUM DESCRIPTION LENGTH
   * Classification is unreliable on very short input.
   * ════════════════════════════════════════════════════════════ */

  /** Min characters before RAFI attempts classification */
  var MIN_CLASSIFY_LENGTH = 12;

  /**
   * Classify only if description is long enough.
   * Returns null for both if too short.
   *
   * @param {string} description
   * @returns {{ category, urgency } | null}
   */
  function classifyIfReady(description) {
    if (!description || description.trim().length < MIN_CLASSIFY_LENGTH) return null;
    return classify(description);
  }

  /* ════════════════════════════════════════════════════════════
   * SELF-TEST
   * Run in browser console: RafiClassifier.selfTest()
   * ════════════════════════════════════════════════════════════ */

  var SELF_TESTS = [
    // [description, expectedCategory, expectedUrgency]
    ['j\'ai une fuite dans ma salle de bain',                 'plomberie',   'normale'],
    ['le robinet de la cuisine coule',                        'plomberie',   'normale'],
    ['grosse fuite d\'eau dans la cuisine, urgence!',         'plomberie',   'now'],
    ['inondation au sous-sol, eau partout',                   'plomberie',   'now'],
    ['prise électrique ne fonctionne plus dans le bureau',    'electricite', 'urgent'],
    ['disjoncteur qui saute tout le temps',                   'electricite', 'normale'],
    ['panne de courant dans tout l\'appartement',             'electricite', 'normale'],
    ['la serrure de la porte principale est bloquée',         'serrurerie',  'urgent'],
    ['j\'ai perdu ma clé et je suis coincé dehors',           'serrurerie',  'now'],
    ['climatisation ne refroidit plus en été',                'climatisation', 'normale'],  // 'ne refroidit plus' ≠ 'ne fonctionne plus'
    ['parquet qui grince, lames décollées',                   'menuiserie',  'normale'],
    ['peindre les murs du salon avant emménagement',          'peinture',    'normale'],
    ['fissure dans le mur porteur du garage',                 'maconnerie',  'normale'],
    ['nettoyage après fin de chantier de rénovation',         'nettoyage',   'normale'],
    ['carrelage cassé dans le couloir',                       'carrelage',   'normale'],
    ['taille de haie et tonte du gazon',                      'jardinage',   'normale'],
    ['monter des meubles IKEA et fixer étagères',             'bricolage',   'normale'],
    ['déménagement appartement 3 pièces mercredi prochain',   'demenagement','normale'],
    // edge cases
    ['problème',                                              null,          'urgent'],
    ['réparation urgente',                                    null,          'normale'],  // 'urgente' ≠ 'urgent' (word boundary)
    ['bonjour',                                               null,          'normale'],  // too short → null from classifyIfReady
  ];

  function selfTest() {
    var pass = 0, fail = 0;
    console.group('[RafiClassifier] Self-test');
    SELF_TESTS.forEach(function (tc) {
      var desc = tc[0], expectedCat = tc[1], expectedUrg = tc[2];
      // Use classify() directly (not classifyIfReady) so short inputs are tested too
      var result = classify(desc);
      var gotCat = result.category ? result.category.value : null;
      var gotUrg = result.urgency.value;
      var catOk = (gotCat === expectedCat);
      var urgOk = (gotUrg === expectedUrg);
      var ok = catOk && urgOk;
      if (ok) { pass++; }
      else {
        fail++;
        console.warn(
          'FAIL:', JSON.stringify(desc),
          '\n  cat expected:', expectedCat, '→ got:', gotCat,
          '\n  urg expected:', expectedUrg, '→ got:', gotUrg
        );
      }
    });
    console.log('Results: ' + pass + '/' + (pass + fail) + ' PASS' + (fail ? ' (' + fail + ' FAIL)' : ''));
    console.groupEnd();
    return { pass: pass, fail: fail, total: pass + fail };
  }

  /* ════════════════════════════════════════════════════════════
   * PUBLIC API
   * ════════════════════════════════════════════════════════════ */

  window.RafiClassifier = {
    /** Full classify (no min-length gate) */
    classify:         classify,
    /** Classify only if description is long enough (>= 12 chars) */
    classifyIfReady:  classifyIfReady,
    /** Format human reason for category suggestion */
    categoryReason:   categoryReason,
    /** Format human reason for urgency suggestion */
    urgencyReason:    urgencyReason,
    /** Run built-in test suite */
    selfTest:         selfTest,
    /** Constants */
    MIN_CLASSIFY_LENGTH: MIN_CLASSIFY_LENGTH
  };

})(window);
