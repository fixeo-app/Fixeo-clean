/**
 * FIXEO RAFI LANGUAGE LAYER — v1b
 * =============================================
 * Darija / Moroccan Arabic / Arabic / Arabizi / French
 * comprehension bridge for RAFI.
 *
 * PURPOSE
 * -------
 * Convert noisy Moroccan user language into canonical French hints
 * understood by the existing FixeoAIRE engine.
 *
 * IMPORTANT
 * ---------
 * - Does NOT implement matching
 * - Does NOT implement dispatch
 * - Does NOT modify FixeoAIRE
 * - Does NOT modify the client's original text
 * - Does NOT translate or rewrite the submitted request
 * - Adds canonical detection hints only
 * - Designed to tolerate imperfect browser speech transcription
 *
 * Supported canonical categories:
 *   plomberie
 *   electricite
 *   serrurerie
 *   climatisation
 *   menuiserie
 *   peinture
 *   maconnerie
 *   nettoyage
 *   carrelage
 *   jardinage
 *   bricolage
 *   demenagement
 *
 * Public API:
 *
 *   window.FixeoRafiLanguage.normalize(text)
 *
 * Example:
 *
 *   "الباب ست علي دابا"
 *
 * becomes internally:
 *
 *   "الباب ست علي دابا serrurerie porte bloquee cle serrure urgent maintenant"
 *
 * The original client text is still preserved separately by the Flagship.
 */

(function () {
  'use strict';

  if (window.FixeoRafiLanguage) return;

  var VERSION = 'frl-v1b';

  /* =========================================================
     TEXT NORMALIZATION
     ========================================================= */

  function norm(value) {
    return String(value || '')
      .toLowerCase()

      /* French / latin accents */
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

      /* Arabic tashkeel */
      .replace(/[\u064B-\u065F\u0670]/g, '')

      /* Arabic tatweel */
      .replace(/\u0640/g, '')

      /* Arabic letter variants */
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')

      /* Apostrophe variants */
      .replace(/[’‘`´]/g, "'")

      /* Common separators */
      .replace(/[،؛,:;!?؟()[\]{}]/g, ' ')

      .replace(/\s+/g, ' ')
      .trim();
  }

  /* =========================================================
     BASIC MATCH HELPERS
     ========================================================= */

  function containsAny(text, terms) {
    if (!text || !terms || !terms.length) return false;

    for (var i = 0; i < terms.length; i++) {
      var candidate = norm(terms[i]);

      if (
        candidate &&
        text.indexOf(candidate) !== -1
      ) {
        return true;
      }
    }

    return false;
  }

  /*
   * A group represents several concepts that must all be present.
   *
   * Example:
   *
   * [
   *   ['باب', 'الباب', 'bab'],
   *   ['سد', 'تسد', 'ست', 'tsed', 'sed']
   * ]
   *
   * means:
   *
   *   (door concept) AND (closed/blocked concept)
   */
  function containsGroup(text, group) {
    if (!group || !group.length) return false;

    for (var i = 0; i < group.length; i++) {
      if (!containsAny(text, group[i])) {
        return false;
      }
    }

    return true;
  }

  function countTermMatches(text, terms) {
    var count = 0;

    if (!terms) return count;

    for (var i = 0; i < terms.length; i++) {
      var candidate = norm(terms[i]);

      if (
        candidate &&
        text.indexOf(candidate) !== -1
      ) {
        count++;
      }
    }

    return count;
  }

  /* =========================================================
     RAFI MOROCCAN KNOWLEDGE BASE
     ========================================================= */

  var RULES = [

    /* =======================================================
       PLOMBERIE
       ======================================================= */
    {
      cat: 'plomberie',

      hints:
        'plomberie fuite eau robinet tuyau canalisation sanitaire',

      strong: [
        'plomberie',
        'plombier',

        'تسرب الماء',
        'تسرب الما',
        'الماء كيسيل',
        'الما كيسيل',
        'الماء سايل',
        'الما سايل',

        'fuite eau',
        'fuite d eau',
        'fuite lavabo',

        'wc bouché',
        'wc bouche',
        'toilette bouchee',
        'toilette bouchée',

        'chauffe eau',
        'chauffe-eau'
      ],

      terms: [
        /* Water */
        'الماء',
        'الما',
        'ماء',
        'ma',
        'lma',
        'eau',

        /* Leak */
        'تسرب',
        'تسريب',
        'كيسيل',
        'يسيل',
        'سايل',
        'سيل',
        'kayسيل',
        'kaysil',
        'kaytsreb',
        'tsreb',
        'fuite',

        /* Fixtures */
        'لافابو',
        'lavabo',
        'روبيني',
        'روبين',
        'robinet',
        'robinetterie',

        'تواليت',
        'طواليط',
        'toilette',
        'toilettes',
        'wc',

        'سيفون',
        'sيفون',
        'siphon',

        'tuyau',
        'canalisation',
        'evacuation',
        'évacuation',

        'دوش',
        'douche',

        'بانيو',
        'baignoire',

        'chauffe eau',
        'chauffe-eau',
        'سخان',
        'سخان الماء',

        /* blockage */
        'مسدود',
        'بوشي',
        'bouché',
        'bouche',
        'debouchage',
        'débouchage'
      ],

      groups: [
        [
          ['الماء', 'الما', 'ماء', 'ma', 'lma', 'eau'],
          [
            'كيسيل',
            'يسيل',
            'سايل',
            'تسرب',
            'تسريب',
            'kaysil',
            'tsreb',
            'fuite'
          ]
        ],

        [
          [
            'لافابو',
            'lavabo',
            'روبيني',
            'robinet',
            'siphon',
            'سيفون',
            'tuyau',
            'canalisation'
          ],
          [
            'كيسيل',
            'يسيل',
            'تسرب',
            'fuite',
            'مسدود',
            'bouche',
            'bouché'
          ]
        ],

        [
          ['wc', 'toilette', 'طواليط', 'تواليت'],
          ['مسدود', 'bouche', 'bouché', 'debouchage']
        ],

        [
          ['سخان', 'chauffe eau', 'chauffe-eau'],
          ['خاسر', 'ما خدامش', 'panne', 'marche pas']
        ]
      ]
    },

    /* =======================================================
       ELECTRICITE
       ======================================================= */
    {
      cat: 'electricite',

      hints:
        'electricite courant coupure disjoncteur prise eclairage',

      strong: [
        'electricite',
        'electricien',
        'الكهرباء مقطوعة',
        'الضو تقطع',
        'تقطع الضو',
        'plus de courant',
        'panne electrique',
        'panne électrique',
        'court circuit',
        'court-circuit'
      ],

      terms: [
        'الكهرباء',
        'الكهربا',
        'كهرباء',

        'الضو',
        'ضو',
        'daw',
        'do',

        'courant',
        'electricite',
        'électricité',
        'electricien',
        'électricien',

        'تقطع',
        'تقطع',
        'مقطوع',
        'مقطوعة',
        'طافي',
        'طاف',
        't9ta3',
        '9ta3',

        'coupure',
        'panne',

        'disjoncteur',
        'ديجونكتور',

        'prise',
        'بريز',

        'interrupteur',
        'fusible',
        'compteur',

        'court circuit',
        'court-circuit',

        'شرارة',
        'étincelle',
        'etincelle',

        'حريق',
        'محروق',
        'brule',
        'brûlé'
      ],

      groups: [
        [
          [
            'الضو',
            'ضو',
            'daw',
            'do',
            'الكهرباء',
            'الكهربا',
            'courant'
          ],
          [
            'تقطع',
            'مقطوع',
            'مقطوعة',
            'طافي',
            'طاف',
            't9ta3',
            '9ta3',
            'coupure',
            'panne'
          ]
        ],

        [
          ['prise', 'بريز'],
          ['محروق', 'brule', 'brûlé', 'شرارة']
        ]
      ]
    },

    /* =======================================================
       SERRURERIE
       ======================================================= */
    {
      cat: 'serrurerie',

      hints:
        'serrurerie porte bloquee cle serrure ouverture',

      strong: [
        'serrurerie',
        'serrurier',
        'porte bloquee',
        'porte bloquée',

        'الباب مسدود',
        'الباب تسد',
        'باب تسد',

        'bab tsed',
        'bab msdoud',

        'clé cassée',
        'cle cassee'
      ],

      terms: [
        'باب',
        'الباب',
        'bab',

        'سد',
        'تسد',
        'تسد',
        'ست',
        'مسدود',
        'مبلوك',
        'tsed',
        'sed',
        'sd',
        'msdoud',

        'مفتاح',
        'المفتاح',
        'mftah',
        'meftah',

        'serrure',
        'serrurier',
        'serrurerie',

        'cle',
        'clé',

        'قفل',
        'القفل',
        'verrou',

        'bloque',
        'bloquee',
        'bloquée',

        'coince',
        'coincé',

        'ouverture'
      ],

      groups: [
        [
          ['الباب', 'باب', 'bab'],
          [
            'تسد',
            'سد',
            'ست',
            'مسدود',
            'مبلوك',
            'tsed',
            'sed',
            'sd',
            'msdoud',
            'bloque',
            'bloquee',
            'coince'
          ]
        ],

        [
          ['مفتاح', 'المفتاح', 'mftah', 'meftah', 'cle', 'clé'],
          [
            'تكسر',
            'مكسور',
            'ضاع',
            'ضايع',
            'casse',
            'cassee',
            'cassée',
            'perdu'
          ]
        ]
      ]
    },

    /* =======================================================
       CLIMATISATION
       ======================================================= */
    {
      cat: 'climatisation',

      hints:
        'climatisation climatiseur clim split froid chauffage',

      strong: [
        'climatisation',
        'climatiseur',
        'المكيف ما خدامش',
        'clim en panne',
        'clim ne refroidit plus'
      ],

      terms: [
        'مكيف',
        'المكيف',

        'كليم',
        'كليما',

        'klima',
        'clima',
        'clim',

        'climatiseur',
        'climatisation',

        'split',

        'تبريد',
        'بارد',
        'برد',

        'chaud',
        'froid',

        'chauffage',
        'radiateur',
        'thermostat',

        'ventilation',
        'vmc'
      ],

      groups: [
        [
          [
            'مكيف',
            'المكيف',
            'كليم',
            'كليما',
            'clim',
            'clima',
            'klima',
            'climatiseur',
            'split'
          ],
          [
            'خاسر',
            'واقف',
            'ما خدامش',
            'ماكيخدمش',
            'panne',
            'marche pas'
          ]
        ],

        [
          [
            'مكيف',
            'clim',
            'climatiseur'
          ],
          [
            'ما كيبردش',
            'ماكيبردش',
            'chaud',
            'refroidit plus',
            'froid'
          ]
        ]
      ]
    },

    /* =======================================================
       MENUISERIE
       ======================================================= */
    {
      cat: 'menuiserie',

      hints:
        'menuiserie bois menuisier porte fenetre meuble',

      strong: [
        'menuiserie',
        'menuisier',
        'نجار',
        'النجار'
      ],

      terms: [
        'نجار',
        'النجار',
        'njar',

        'خشب',
        'الخشب',
        'khchb',
        'khochb',

        'menuisier',
        'menuiserie',

        'porte bois',
        'fenetre bois',
        'fenêtre bois',

        'placard',
        'خزانة',
        'خزانه',

        'meuble',
        'اثاث',

        'parquet',

        'volet',

        'charniere',
        'charnière'
      ],

      groups: [
        [
          ['خشب', 'الخشب', 'khchb', 'bois'],
          [
            'باب',
            'porte',
            'fenetre',
            'fenêtre',
            'placard',
            'meuble'
          ]
        ],

        [
          ['باب', 'porte'],
          [
            'كيحك',
            'يحك',
            'frotte',
            'خشب',
            'bois'
          ]
        ]
      ]
    },

    /* =======================================================
       PEINTURE
       ======================================================= */
    {
      cat: 'peinture',

      hints:
        'peinture peintre mur facade enduit',

      strong: [
        'peinture',
        'peintre',
        'صباغ',
        'صباغة'
      ],

      terms: [
        'صباغ',
        'صباغة',
        'الصباغة',

        'sbagh',
        'sbagha',

        'peinture',
        'peintre',

        'حايط',
        'حيط',
        'الحائط',
        'mur',

        'facade',
        'façade',

        'لون',
        'couleur',

        'دهان',

        'enduit',
        'crepi',
        'crépi',

        'vernis'
      ],

      groups: [
        [
          ['حايط', 'حيط', 'mur', 'facade', 'façade'],
          ['صباغ', 'صباغة', 'peinture', 'دهان', 'لون']
        ]
      ]
    },

    /* =======================================================
       MACONNERIE
       ======================================================= */
    {
      cat: 'maconnerie',

      hints:
        'maconnerie macon beton ciment mur construction',

      strong: [
        'maconnerie',
        'maçonnerie',
        'macon',
        'maçon',
        'بناي',
        'بناء'
      ],

      terms: [
        'بناء',
        'البناء',
        'بناي',
        'بناي',

        'bnay',
        'bennay',

        'macon',
        'maçon',
        'maconnerie',
        'maçonnerie',

        'beton',
        'béton',

        'ciment',
        'السيمان',
        'سيمان',

        'دالة',
        'dalle',

        'حيط',
        'حايط',
        'mur',

        'fissure',
        'شق',

        'هدم',
        'demolition',
        'démolition',

        'fondation',
        'terrasse'
      ],

      groups: [
        [
          [
            'بناء',
            'بناي',
            'bnay',
            'bennay',
            'macon',
            'maçon'
          ],
          [
            'حيط',
            'mur',
            'beton',
            'béton',
            'ciment',
            'dalle',
            'fondation'
          ]
        ]
      ]
    },

    /* =======================================================
       NETTOYAGE
       ======================================================= */
    {
      cat: 'nettoyage',

      hints:
        'nettoyage menage entretien proprete',

      strong: [
        'nettoyage',
        'ménage',
        'menage',
        'نظافة',
        'تنقية'
      ],

      terms: [
        'نظافة',
        'النظافة',

        'تنقية',
        'تنظيف',

        'tn9iya',
        'tndif',

        'nettoyage',
        'menage',
        'ménage',
        'cleaning',

        'vitres',
        'زاج',

        'poussiere',
        'poussière',

        'salete',
        'saleté',

        'تعقيم',
        'desinfection',
        'désinfection'
      ],

      groups: [
        [
          [
            'نظافة',
            'تنقية',
            'تنظيف',
            'tn9iya',
            'nettoyage',
            'menage'
          ],
          [
            'دار',
            'الدار',
            'بيت',
            'appartement',
            'maison',
            'vitres',
            'travaux'
          ]
        ]
      ]
    },

    /* =======================================================
       CARRELAGE
       ======================================================= */
    {
      cat: 'carrelage',

      hints:
        'carrelage carreaux faience zellij joints',

      strong: [
        'carrelage',
        'زليج',
        'zellij',
        'zelij'
      ],

      terms: [
        'زليج',
        'الزليج',

        'zellij',
        'zelij',
        'zellige',

        'carrelage',
        'carreaux',

        'faience',
        'faïence',

        'mosaïque',
        'mosaique',

        'joints',
        'joint',

        'sol',
        'ارضية',
        'الأرضية'
      ],

      groups: [
        [
          [
            'زليج',
            'zellij',
            'zelij',
            'carrelage',
            'carreaux'
          ],
          [
            'مكسور',
            'تكسر',
            'casse',
            'cassé',
            'pose',
            'joints'
          ]
        ]
      ]
    },

    /* =======================================================
       JARDINAGE
       ======================================================= */
    {
      cat: 'jardinage',

      hints:
        'jardinage jardin pelouse gazon taille tonte',

      strong: [
        'jardinage',
        'jardinier',
        'جنينة',
        'حديقة'
      ],

      terms: [
        'جنينة',
        'الجنان',
        'حديقة',
        'الحديقة',

        'jnina',
        'jardin',
        'jardinage',
        'jardinier',

        'حشيش',
        'عشب',

        'gazon',
        'pelouse',

        'tonte',
        'taille',

        'haie',
        'شجر',
        'شجرة',

        'arrosage',
        'سقي'
      ],

      groups: [
        [
          [
            'جنينة',
            'حديقة',
            'jnina',
            'jardin'
          ],
          [
            'حشيش',
            'عشب',
            'gazon',
            'pelouse',
            'taille',
            'tonte',
            'شجر',
            'arrosage'
          ]
        ]
      ]
    },

    /* =======================================================
       BRICOLAGE
       ======================================================= */
    {
      cat: 'bricolage',

      hints:
        'bricolage petits travaux montage fixation percer meuble',

      strong: [
        'bricolage',
        'petits travaux',
        'montage meuble'
      ],

      terms: [
        'bricolage',

        'petits travaux',
        'petit travaux',

        'montage',
        'montage meuble',

        'fixation',
        'fixer',

        'percer',
        'trou',

        'meuble a monter',
        'meuble à monter',

        'ركب',
        'يركب',
        'تركيب',

        'علق',
        'تعليق'
      ],

      groups: [
        [
          [
            'meuble',
            'رف',
            'étagère',
            'etagere',
            'تلفاز',
            'tv'
          ],
          [
            'ركب',
            'تركيب',
            'montage',
            'fixer',
            'fixation',
            'علق'
          ]
        ]
      ]
    },

    /* =======================================================
       DEMENAGEMENT
       ======================================================= */
    {
      cat: 'demenagement',

      hints:
        'demenagement transport meubles camion cartons',

      strong: [
        'demenagement',
        'déménagement',
        'نقل الاثاث',
        'نقل الأثاث'
      ],

      terms: [
        'رحيل',
        'الرحيل',

        'نقل',
        'نقل الاثاث',
        'نقل الأثاث',

        'n9el',
        'n9l',

        'demenagement',
        'déménagement',
        'demenager',
        'déménager',

        'transport',

        'اثاث',
        'الأثاث',
        'meuble',
        'meubles',

        'camion',

        'carton',
        'cartons'
      ],

      groups: [
        [
          [
            'رحيل',
            'نقل',
            'n9el',
            'n9l',
            'demenagement',
            'déménagement',
            'transport'
          ],
          [
            'اثاث',
            'الأثاث',
            'meuble',
            'meubles',
            'carton',
            'cartons',
            'دار',
            'maison',
            'appartement'
          ]
        ]
      ]
    }
  ];

  /* =========================================================
     URGENCY — MOROCCAN EXPRESSIONS
     ========================================================= */

  var URGENCY_TERMS = [
    /* Arabic */
    'دابا',
    'دابا دابا',
    'دابا حالا',
    'حالا',
    'حالاً',
    'فالحين',
    'ضروري',
    'بالضرورة',
    'مستعجل',
    'مستعجلة',
    'عاجل',
    'بسرعة',
    'سريع',
    'اليوم',
    'هاد الساعة',

    /* Arabizi */
    'daba',
    'daba daba',
    'daba7',
    'daba hna',
    'darori',
    'darouri',
    'mest3jel',
    'mosta3jil',
    'msta3jel',
    '3ajel',
    'bzerba',
    'bzrba',

    /* French */
    'urgent',
    'urgente',
    'urgence',
    'maintenant',
    'tout de suite',
    'immediatement',
    'immédiatement',
    'au plus vite'
  ];

  /* Higher-risk emergency concepts. */
  var EMERGENCY_TERMS = [
    'eau partout',
    'الماء في الدار',
    'الما فالدار',
    'غرق',
    'غارقة',

    'odeur de gaz',
    'ريحة الغاز',
    'الغاز كيسرب',

    'court circuit',
    'court-circuit',
    'شرارة',
    'دخان',
    'fumee',
    'fumée',

    'porte bloquee',
    'porte bloquée',
    'الباب تسد',
    'الباب مسدود',

    'plus de courant',
    'الضو تقطع',
    'تقطع الضو'
  ];

  /* =========================================================
     RULE SCORING
     ========================================================= */

  function scoreRule(text, rule) {
    var score = 0;

    /*
     * Strong expressions are highly reliable.
     */
    if (containsAny(text, rule.strong)) {
      score += 8;
    }

    /*
     * Individual vocabulary contributes weaker evidence.
     * Cap this contribution to avoid giant synonym lists
     * overwhelming contextual signals.
     */
    var termHits = countTermMatches(text, rule.terms);

    if (termHits > 0) {
      score += Math.min(termHits, 4);
    }

    /*
     * Concept groups are especially valuable because Safari
     * may alter one exact phrase but preserve the core concepts.
     */
    if (rule.groups) {
      for (var i = 0; i < rule.groups.length; i++) {
        if (containsGroup(text, rule.groups[i])) {
          score += 6;
        }
      }
    }

    return score;
  }

  function findBestRule(text) {
    var bestRule = null;
    var bestScore = 0;

    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      var score = scoreRule(text, rule);

      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    /*
     * Minimum threshold.
     *
     * A single vague word should not force a métier.
     * But one reliable strong phrase or several contextual
     * terms can classify the request.
     */
    if (bestScore < 2) {
      return null;
    }

    return {
      rule: bestRule,
      score: bestScore
    };
  }

  /* =========================================================
     PUBLIC NORMALIZER
     ========================================================= */

  function normalize(text) {
    var original = String(text || '').trim();

    if (!original) return original;

    var normalized = norm(original);

    var additions = [];

    var best = findBestRule(normalized);

    if (best && best.rule) {
      additions.push(best.rule.hints);
    }

    if (
      containsAny(normalized, URGENCY_TERMS) ||
      containsAny(normalized, EMERGENCY_TERMS)
    ) {
      additions.push('urgent maintenant');
    }

    /*
     * Nothing detected:
     * preserve input exactly.
     */
    if (!additions.length) {
      return original;
    }

    /*
     * The canonical hints are appended only to the analysis copy.
     * Flagship still submits the original need value to backend.
     */
    return original + ' ' + additions.join(' ');
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.FixeoRafiLanguage = {
    VERSION: VERSION,
    normalize: normalize
  };

})();
