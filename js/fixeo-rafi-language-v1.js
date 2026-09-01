/**
 * FIXEO RAFI LANGUAGE LAYER — v1c
 * ============================================================
 * Moroccan Darija / Arabic / Arabizi / French comprehension
 * bridge for RAFI.
 *
 * ROLE
 * ----
 * Converts noisy Moroccan user language into canonical French
 * hints understood by the existing FixeoAIRE engine.
 *
 * IMPORTANT
 * ---------
 * - Does NOT implement matching
 * - Does NOT implement dispatch
 * - Does NOT modify FixeoAIRE
 * - Does NOT modify the client's original request
 * - Does NOT send canonical hints as the client's real text
 * - Adds hints only to the local RAFI detection copy
 * - Tolerates common Safari / browser speech-recognition errors
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
 *   "الباب ست عليا دابا"
 *
 * -> detection copy:
 *
 *   "الباب ست عليا دابا serrurerie porte bloquee cle serrure urgent maintenant"
 *
 * The original client request remains unchanged elsewhere.
 */

(function () {
  'use strict';

  if (window.FixeoRafiLanguage) return;

  var VERSION = 'frl-v1c';

  /* =========================================================
     NORMALIZATION
     ========================================================= */

  function norm(value) {
    return String(value || '')
      .toLowerCase()

      /* Latin accents */
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

      /* Arabic tashkeel */
      .replace(/[\u064B-\u065F\u0670]/g, '')

      /* Tatweel */
      .replace(/\u0640/g, '')

      /* Arabic letter variants */
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')

      /* Apostrophes */
      .replace(/[’‘`´]/g, "'")

      /* Separators / punctuation */
      .replace(/[،؛,:;!?؟()[\]{}"«»]/g, ' ')

      /* Dashes */
      .replace(/[-–—]/g, ' ')

      .replace(/\s+/g, ' ')
      .trim();
  }

  /* =========================================================
     TERM MATCHING
     ========================================================= */

  /*
   * Short Latin fragments such as "ma", "do", "sd", "wc"
   * must be matched as tokens.
   *
   * Otherwise "ma" could accidentally match "maison".
   */
  function isShortLatinTerm(value) {
    return /^[a-z0-9]+$/.test(value) && value.length <= 3;
  }

  function hasTerm(text, term) {
    var candidate = norm(term);

    if (!text || !candidate) return false;

    if (isShortLatinTerm(candidate)) {
      return (
        (' ' + text + ' ').indexOf(
          ' ' + candidate + ' '
        ) !== -1
      );
    }

    return text.indexOf(candidate) !== -1;
  }

  function containsAny(text, terms) {
    if (!text || !terms || !terms.length) return false;

    for (var i = 0; i < terms.length; i++) {
      if (hasTerm(text, terms[i])) {
        return true;
      }
    }

    return false;
  }

  /*
   * Each element inside a group is a concept family.
   * At least one term from EVERY concept family must match.
   *
   * Example:
   *
   * [
   *   ['باب', 'الباب', 'bab'],
   *   ['تسد', 'سد', 'ست', 'tsed']
   * ]
   *
   * = DOOR + CLOSED/BLOCKED
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

    if (!terms) return 0;

    for (var i = 0; i < terms.length; i++) {
      if (hasTerm(text, terms[i])) {
        count++;
      }
    }

    return count;
  }

  /* =========================================================
     MOROCCAN KNOWLEDGE BASE
     ========================================================= */

  var RULES = [

    /* =======================================================
       PLOMBERIE
       ======================================================= */
    {
      cat: 'plomberie',

      hints:
        'plomberie fuite eau robinet tuyau canalisation sanitaire lavabo wc',

      strong: [
        'plomberie',
        'plombier',

        'تسرب الماء',
        'تسرب الما',
        'تسرب لما',

        'الماء كيسيل',
        'الما كيسيل',
        'لما كيسيل',

        'الماء سايل',
        'الما سايل',
        'لما سايل',

        'الماء كيدوز',
        'الما كيدوز',

        'fuite eau',
        'fuite d eau',
        'fuite lavabo',
        'fuite robinet',

        'wc bouche',
        'toilette bouchee',

        'chauffe eau',
        'chauffe-eau',

        'lavabo bouche',
        'evier bouche',
        'évier bouché'
      ],

      terms: [
        /* Water */
        'الماء',
        'الما',
        'لما',
        'ماء',
        'lma',
        'lmaa',
        'ma',
        'eau',

        /* Leak */
        'تسرب',
        'تسريب',
        'يسرب',
        'كيسرب',
        'كيهرب الماء',

        'كيسيل',
        'يسيل',
        'سايل',
        'سيل',

        'kaysil',
        'kayسيل',
        'kayssel',
        'kysil',

        'kaytsreb',
        'kaytsrab',
        'tsreb',
        'tsrab',

        'fuite',
        'fuit',
        'coule',

        /* Robinet */
        'روبيني',
        'روبينة',
        'روبين',
        'الروبين',
        'robinet',
        'robinetterie',

        /* Lavabo / sink */
        'لافابو',
        'لابافو',
        'lavabo',

        'ليفي',
        'اليفي',
        'evier',
        'évier',

        /* WC */
        'تواليت',
        'طواليط',
        'الطواليط',
        'toilette',
        'toilettes',
        'wc',

        /* Siphon */
        'سيفون',
        'السيفون',
        'sيفون',
        'siphon',

        /* Pipes */
        'تيو',
        'تويو',
        'tuyau',
        'tuyaux',
        'canalisation',
        'evacuation',
        'évacuation',

        /* Shower */
        'دوش',
        'الدوش',
        'douche',

        /* Bathroom */
        'حمام',
        'الحمام',
        'salle de bain',

        /* Bath */
        'بانيو',
        'البانيو',
        'baignoire',

        /* Water heater */
        'سخان',
        'السخان',
        'سخان الماء',
        'chauffe eau',
        'chauffe-eau',

        /* Blockage */
        'مسدود',
        'مسدودة',
        'مبلوكي',
        'بوشي',
        'bouche',
        'bouchee',
        'debouchage',
        'deboucher',

        /* Plumbing verbs */
        'يفرغ',
        'ما كيفرغش',
        'ما كيدوزش'
      ],

      groups: [
        [
          [
            'الماء',
            'الما',
            'لما',
            'ماء',
            'lma',
            'eau'
          ],
          [
            'كيسيل',
            'يسيل',
            'سايل',
            'تسرب',
            'تسريب',
            'يسرب',
            'كيسرب',
            'kaysil',
            'kaytsreb',
            'tsreb',
            'fuite',
            'coule'
          ]
        ],

        [
          [
            'لافابو',
            'lavabo',
            'ليفي',
            'evier',
            'روبيني',
            'روبين',
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
            'مسدودة',
            'بوشي',
            'bouche',
            'bouchee'
          ]
        ],

        [
          [
            'wc',
            'toilette',
            'toilettes',
            'طواليط',
            'تواليت'
          ],
          [
            'مسدود',
            'مسدودة',
            'بوشي',
            'bouche',
            'bouchee',
            'debouchage',
            'ما كيفرغش'
          ]
        ],

        [
          [
            'سخان',
            'السخان',
            'chauffe eau',
            'chauffe-eau'
          ],
          [
            'خاسر',
            'واقف',
            'ما خدامش',
            'ماكيخدمش',
            'panne',
            'marche pas'
          ]
        ]
      ]
    },

    /* =======================================================
       ELECTRICITE
       ======================================================= */
    {
      cat: 'electricite',

      hints:
        'electricite courant coupure disjoncteur prise eclairage panne electrique',

      strong: [
        'electricite',
        'electricien',

        'الكهرباء مقطوعة',
        'الكهربا مقطوعة',

        'الضو تقطع',
        'تقطع الضو',
        'الضو طفا',
        'الضو طافي',

        'ما عنديش الضو',
        'ماعنديش الضو',

        'plus de courant',
        'pas de courant',

        'panne electrique',
        'court circuit',
        'court-circuit'
      ],

      terms: [
        'الكهرباء',
        'الكهربا',
        'كهرباء',
        'كهربة',

        'الضو',
        'ضو',
        'daw',
        'dow',
        'do',

        'courant',
        'electricite',
        'electricien',

        'تقطع',
        'قطع',
        'مقطوع',
        'مقطوعة',

        'طفا',
        'طافي',
        'طافية',
        'طاف',

        't9ta3',
        'tqta3',
        '9ta3',

        'coupure',
        'panne',

        'disjoncteur',
        'disjoncte',
        'ديجونكتور',

        'prise',
        'prises',
        'بريز',
        'البريز',

        'interrupteur',
        'fusible',

        'compteur',
        'كونطور',
        'الكونطور',

        'court circuit',
        'court-circuit',

        'شرارة',
        'شرار',
        'etincelle',

        'حريق',
        'محروق',
        'محروقة',
        'brule',
        'grille'
      ],

      groups: [
        [
          [
            'الضو',
            'ضو',
            'daw',
            'dow',
            'do',
            'الكهرباء',
            'الكهربا',
            'courant'
          ],
          [
            'تقطع',
            'قطع',
            'مقطوع',
            'مقطوعة',
            'طفا',
            'طافي',
            'طاف',
            't9ta3',
            '9ta3',
            'coupure',
            'panne'
          ]
        ],

        [
          [
            'prise',
            'بريز'
          ],
          [
            'محروق',
            'محروقة',
            'brule',
            'grille',
            'شرارة',
            'etincelle'
          ]
        ],

        [
          [
            'disjoncteur',
            'ديجونكتور'
          ],
          [
            'كيطيح',
            'كيقطع',
            'saute',
            'disjoncte'
          ]
        ]
      ]
    },

    /* =======================================================
       SERRURERIE
       ======================================================= */
    {
      cat: 'serrurerie',

      hints:
        'serrurerie porte bloquee cle serrure ouverture verrou',

      strong: [
        'serrurerie',
        'serrurier',

        'porte bloquee',
        'porte coincee',

        'الباب مسدود',
        'باب مسدود',

        'الباب تسد',
        'باب تسد',

        'الباب سد',
        'باب سد',

        'الباب ست',
        'باب ست',

        'لباب تسد',
        'لباب سد',
        'لباب ست',

        'bab tsed',
        'bab sed',
        'bab msdoud',

        'cle cassee',
        'cle perdue'
      ],

      terms: [
        /* Door */
        'باب',
        'الباب',
        'لباب',
        'bab',
        'lbab',

        /* Closed / blocked — including ASR noise */
        'سد',
        'تسد',
        'تسد',
        'ست',
        'تست',
        'تسدات',
        'سدات',
        'مسدود',
        'مسدودة',
        'مبلوك',
        'مبلوكي',

        'tsed',
        'tsedd',
        'tsad',
        'tssed',
        'sed',
        'sedd',
        'sd',
        'msdoud',
        'msdod',

        /* Key */
        'مفتاح',
        'المفتاح',
        'لمفتاح',
        'مفاتيح',

        'mftah',
        'mfta7',
        'meftah',
        'mefta7',

        'cle',

        /* Lock */
        'قفل',
        'القفل',
        'لقفل',
        'serrure',
        'serrurier',
        'serrurerie',
        'verrou',

        /* Locked */
        'bloque',
        'bloquee',
        'coince',
        'coincee',
        'fermee',
        'ferme',

        /* Opening */
        'ouverture',
        'ouvrir',
        'حل الباب',
        'نحل الباب',

        /* Broken/lost key */
        'تكسر',
        'تكسرت',
        'مكسور',
        'مكسورة',
        'ضاع',
        'ضايع',
        'ضاعت',
        'نسيته',
        'نسيث',

        'casse',
        'cassee',
        'perdu',
        'perdue'
      ],

      groups: [
        [
          [
            'الباب',
            'باب',
            'لباب',
            'bab',
            'lbab'
          ],
          [
            'تسد',
            'سد',
            'ست',
            'تست',
            'تسدات',
            'سدات',
            'مسدود',
            'مبلوك',
            'tsed',
            'tsedd',
            'tsad',
            'sed',
            'sd',
            'msdoud',
            'bloque',
            'bloquee',
            'coince'
          ]
        ],

        [
          [
            'مفتاح',
            'المفتاح',
            'لمفتاح',
            'mftah',
            'mfta7',
            'meftah',
            'mefta7',
            'cle'
          ],
          [
            'تكسر',
            'تكسرت',
            'مكسور',
            'ضاع',
            'ضايع',
            'ضاعت',
            'casse',
            'cassee',
            'perdu',
            'perdue'
          ]
        ],

        [
          [
            'قفل',
            'القفل',
            'serrure',
            'verrou'
          ],
          [
            'خاسر',
            'مكسور',
            'bloque',
            'coince',
            'casse'
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
        'climatisation climatiseur clim split froid chauffage ventilation',

      strong: [
        'climatisation',
        'climatiseur',

        'المكيف ما خدامش',
        'المكيف ماكيخدمش',

        'الكليم ما خدامش',
        'كليم ما خدامش',

        'clim en panne',
        'clim ne marche pas',
        'clim ne refroidit plus'
      ],

      terms: [
        'مكيف',
        'المكيف',

        'كليم',
        'الكليم',
        'كليما',
        'كليمة',

        'klima',
        'clima',
        'clim',

        'climatiseur',
        'climatisation',

        'split',
        'سبليت',

        'تبريد',
        'يبرد',
        'كيبرد',
        'ما كيبردش',
        'ماكيبردش',

        'بارد',
        'برد',
        'سخون',

        'chaud',
        'froid',
        'refroidit',

        'chauffage',
        'radiateur',
        'thermostat',

        'ventilation',
        'vmc',

        'غاز',
        'freon',
        'fréon',

        'كيقطر',
        'goutte',
        'coule'
      ],

      groups: [
        [
          [
            'مكيف',
            'المكيف',
            'كليم',
            'الكليم',
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
            'كليم',
            'clim',
            'climatiseur'
          ],
          [
            'ما كيبردش',
            'ماكيبردش',
            'سخون',
            'chaud',
            'refroidit plus'
          ]
        ],

        [
          [
            'مكيف',
            'كليم',
            'clim'
          ],
          [
            'كيقطر',
            'goutte',
            'coule'
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
        'menuiserie bois menuisier porte fenetre placard meuble parquet',

      strong: [
        'menuiserie',
        'menuisier',

        'نجار',
        'النجار',

        'njar',
        'nejjar'
      ],

      terms: [
        'نجار',
        'النجار',
        'نجر',
        'njar',
        'nejjar',

        'خشب',
        'الخشب',
        'khashab',
        'khchb',
        'khochb',

        'bois',

        'menuisier',
        'menuiserie',

        'porte bois',
        'fenetre bois',

        'placard',
        'خزانة',
        'خزانه',
        'خزانات',

        'meuble',
        'meubles',
        'اثاث',

        'parquet',

        'volet',
        'شباك',
        'نافذة',

        'charniere',
        'مفصلة',

        'كيحك',
        'يحك',
        'frotte'
      ],

      groups: [
        [
          [
            'خشب',
            'الخشب',
            'khchb',
            'khochb',
            'bois'
          ],
          [
            'باب',
            'porte',
            'fenetre',
            'شباك',
            'placard',
            'خزانة',
            'meuble'
          ]
        ],

        [
          [
            'باب',
            'porte'
          ],
          [
            'كيحك',
            'يحك',
            'frotte',
            'خشب',
            'bois',
            'charniere',
            'مفصلة'
          ]
        ],

        [
          [
            'placard',
            'خزانة',
            'meuble'
          ],
          [
            'نجار',
            'njar',
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
        'peinture peintre mur facade enduit couleur vernis',

      strong: [
        'peinture',
        'peintre',

        'صباغ',
        'صباغة',
        'الصباغة',

        'sbagh',
        'sbagha'
      ],

      terms: [
        'صباغ',
        'الصباغ',
        'صباغة',
        'الصباغة',

        'sbagh',
        'sbagha',
        'sbagha',

        'peinture',
        'peintre',

        'حايط',
        'حيط',
        'الحايط',
        'الحائط',
        'mur',
        'murs',

        'facade',

        'لون',
        'اللون',
        'couleur',

        'دهان',
        'الدهان',

        'enduit',
        'crepi',

        'vernis',
        'vernir',

        'تقشر',
        'مقشر',
        'ecaille',
        'ecaillée'
      ],

      groups: [
        [
          [
            'حايط',
            'حيط',
            'mur',
            'facade'
          ],
          [
            'صباغ',
            'صباغة',
            'peinture',
            'دهان',
            'لون',
            'couleur'
          ]
        ],

        [
          [
            'mur',
            'حايط',
            'حيط'
          ],
          [
            'تقشر',
            'مقشر',
            'ecaille'
          ]
        ]
      ]
    },

    /* =======================================================
       MACONNERIE
       ======================================================= */
    {
      cat: 'maconnerie',

      hints:
        'maconnerie macon beton ciment mur construction dalle fissure',

      strong: [
        'maconnerie',
        'macon',

        'بناي',
        'بناء',
        'البناء',

        'bnay',
        'bennay'
      ],

      terms: [
        'بناء',
        'البناء',

        'بناي',
        'البناي',

        'bnay',
        'bennay',
        'bnaay',

        'macon',
        'maconnerie',

        'beton',

        'ciment',
        'سيمان',
        'السيمان',
        'سيمون',

        'دالة',
        'الدالة',
        'dalle',

        'حيط',
        'حايط',
        'mur',

        'fissure',
        'شق',
        'تشقق',
        'مشقوق',

        'هدم',
        'يهدم',
        'demolition',

        'fondation',
        'اساس',
        'الاساس',

        'terrasse',
        'سطح',

        'construction',
        'بني',
        'نبني'
      ],

      groups: [
        [
          [
            'بناء',
            'بناي',
            'bnay',
            'bennay',
            'macon'
          ],
          [
            'حيط',
            'mur',
            'beton',
            'ciment',
            'دالة',
            'dalle',
            'fondation',
            'construction'
          ]
        ],

        [
          [
            'حيط',
            'حايط',
            'mur'
          ],
          [
            'شق',
            'تشقق',
            'fissure'
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
        'nettoyage menage entretien proprete vitres desinfection',

      strong: [
        'nettoyage',
        'menage',

        'نظافة',
        'النظافة',

        'تنقية',
        'تنظيف'
      ],

      terms: [
        'نظافة',
        'النظافة',

        'تنقية',
        'تنظيف',
        'نقي',
        'نقاوة',

        'tn9iya',
        'tn9ia',
        'tndif',

        'nettoyage',
        'menage',
        'cleaning',

        'vitres',
        'زاج',
        'الزاج',

        'poussiere',
        'غبرة',
        'الغبرة',

        'salete',
        'وسخ',
        'موسخ',
        'موسخة',

        'تعقيم',
        'desinfection',

        'بعد الاشغال',
        'apres travaux',
        'fin de chantier'
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
        ],

        [
          [
            'دار',
            'بيت',
            'appartement',
            'maison'
          ],
          [
            'وسخ',
            'موسخ',
            'غبرة',
            'poussiere',
            'salete'
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
        'carrelage carreaux faience zellij joints sol pose',

      strong: [
        'carrelage',
        'carreaux',

        'زليج',
        'الزليج',

        'zellij',
        'zelij',
        'zellige'
      ],

      terms: [
        'زليج',
        'الزليج',
        'زلاج',

        'zellij',
        'zelij',
        'zellige',

        'carrelage',
        'carreaux',

        'faience',

        'mosaïque',
        'mosaique',

        'joints',
        'joint',

        'sol',
        'ارضية',
        'الأرضية',

        'pose',
        'تركيب',

        'مكسور',
        'مكسورة',
        'تكسر',
        'casse',
        'cassee'
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
            'مكسورة',
            'تكسر',
            'casse',
            'cassee',
            'pose',
            'joints'
          ]
        ],

        [
          [
            'ارضية',
            'sol'
          ],
          [
            'زليج',
            'carrelage',
            'carreaux'
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
        'jardinage jardin jardinier pelouse gazon taille tonte arrosage',

      strong: [
        'jardinage',
        'jardinier',

        'جنينة',
        'حديقة',

        'jnina'
      ],

      terms: [
        'جنينة',
        'الجنينة',
        'الجنان',

        'حديقة',
        'الحديقة',

        'jnina',
        'jnan',

        'jardin',
        'jardinage',
        'jardinier',

        'حشيش',
        'الحشيش',

        'عشب',
        'العشب',

        'gazon',
        'pelouse',

        'tonte',
        'tondre',

        'taille',
        'tailler',

        'haie',

        'شجر',
        'الشجر',
        'شجرة',
        'شجرة',

        'arbre',
        'arbres',

        'arrosage',
        'سقي',
        'نسقي'
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
            'arrosage',
            'سقي'
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
        'bricolage petits travaux montage fixation percer meuble etagere',

      strong: [
        'bricolage',
        'petits travaux',
        'montage meuble',

        'ركب لي',
        'بغيت نركب'
      ],

      terms: [
        'bricolage',

        'petits travaux',
        'petit travaux',

        'montage',
        'monter',

        'montage meuble',

        'fixation',
        'fixer',

        'percer',
        'trou',

        'meuble a monter',

        'ركب',
        'يركب',
        'نركب',
        'تركيب',

        'علق',
        'يعلق',
        'تعليق',

        'رف',
        'رفوف',

        'etagere',

        'تلفاز',
        'tv',

        'rideau',
        'tringle',

        'miroir',
        'مراية'
      ],

      groups: [
        [
          [
            'meuble',
            'رف',
            'etagere',
            'تلفاز',
            'tv',
            'rideau',
            'miroir',
            'مراية'
          ],
          [
            'ركب',
            'يركب',
            'نركب',
            'تركيب',
            'montage',
            'monter',
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
        'demenagement transport meubles camion cartons chargement',

      strong: [
        'demenagement',

        'نقل الاثاث',
        'نقل الأثاث',

        'نقل العفش',

        'بغيت نرحل',
        'بغيت ننتقل'
      ],

      terms: [
        'رحيل',
        'الرحيل',
        'نرحل',

        'نقل',
        'ننقل',

        'انتقال',
        'ننتقل',

        'نقل الاثاث',
        'نقل الأثاث',

        'نقل العفش',
        'عفش',

        'n9el',
        'n9l',
        'n9al',

        'demenagement',
        'demenager',

        'transport',

        'اثاث',
        'الأثاث',

        'meuble',
        'meubles',

        'camion',
        'شاحنة',

        'carton',
        'cartons',

        'chargement',
        'dechargement'
      ],

      groups: [
        [
          [
            'رحيل',
            'نرحل',
            'نقل',
            'ننقل',
            'ننتقل',
            'n9el',
            'n9l',
            'demenagement',
            'transport'
          ],
          [
            'اثاث',
            'الأثاث',
            'عفش',
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
     URGENCY
     ========================================================= */

  /*
   * These expressions mean actual immediacy.
   *
   * "Aujourd'hui" is intentionally NOT enough by itself
   * to classify a request as urgent.
   */
  var URGENCY_TERMS = [
    /* Arabic / Darija */
    'دابا',
    'دبا',
    'دابة',
    'دابه',

    'دابا دابا',

    'حالا',
    'حالاً',

    'دالحين',
    'دالحين',
    'فالحين',

    'ضروري',
    'بالضرورة',

    'مستعجل',
    'مستعجلة',

    'عاجل',
    'عاجلة',

    'بسرعة',
    'بالزربة',
    'بالزربه',

    'هاد الساعة',
    'هاد ساعه',
    'في اقرب وقت',

    /* Arabizi */
    'daba',
    'db',
    'daba daba',

    'darori',
    'darouri',

    'mest3jel',
    'mosta3jil',
    'msta3jel',

    '3ajel',

    'bzerba',
    'bzrba',
    'b zrb',

    /* French */
    'urgent',
    'urgente',
    'urgence',

    'maintenant',

    'tout de suite',

    'immediatement',

    'au plus vite',

    'des que possible'
  ];

  /*
   * Situations which normally carry an immediate-risk signal.
   * This is still only an urgency hint for FixeoAIRE.
   * No dispatch logic is implemented here.
   */
  var EMERGENCY_TERMS = [
    /* Water */
    'eau partout',
    'inonde',
    'inondation',

    'الماء في الدار',
    'الما فالدار',
    'لما فالدار',

    'غرق',
    'غارقة',
    'غارق',

    /* Electricity */
    'court circuit',
    'court-circuit',

    'شرارة',
    'شرار',

    'دخان',
    'fumee',

    'ريحة الحريق',
    'odeur de brule',

    'plus de courant',
    'الضو تقطع',
    'تقطع الضو',

    /* Locked out */
    'porte bloquee',
    'الباب تسد',
    'باب تسد',
    'الباب مسدود',
    'باب مسدود',

    /* Gas — urgency only, not métier classification */
    'odeur de gaz',
    'ريحة الغاز',
    'الغاز كيسرب'
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
     * Individual vocabulary gives weaker evidence.
     * Cap it so a long synonym list cannot dominate context.
     */
    var termHits = countTermMatches(text, rule.terms);

    if (termHits > 0) {
      score += Math.min(termHits, 4);
    }

    /*
     * Concept combinations are valuable because speech
     * recognition may alter one word while retaining the
     * semantic structure.
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
     * One isolated ambiguous word should normally not be enough.
     *
     * Score >= 2 means:
     * - multiple vocabulary clues, or
     * - one strong/contextual signal.
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
     * Nothing understood:
     * return the client's wording unchanged.
     */
    if (!additions.length) {
      return original;
    }

    /*
     * Canonical hints are appended only to the local
     * detection copy consumed by FixeoAIRE.
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
