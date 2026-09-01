/**
 * FIXEO RAFI LANGUAGE LAYER — v1a
 * Darija / Arabic / Arabizi comprehension bridge.
 *
 * IMPORTANT:
 * - Does NOT implement matching
 * - Does NOT implement dispatch
 * - Does NOT modify FixeoAIRE
 * - Preserves the client's original text
 * - Adds canonical French hints for FixeoAIRE.detect()
 */
(function () {
  'use strict';

  if (window.FixeoRafiLanguage) return;

  var VERSION = 'frl-v1a';

  function norm(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var RULES = [
    {
      hints: 'plomberie fuite eau',
      terms: [
        'تسرب',
        'كيسيل',
        'الماء كيسيل',
        'الما كيسيل',
        'روبيني',
        'لافابو',
        'lavabo',
        'toilette',
        'طواليط',
        'sيفون',
        'siphon',
        'tuyau',
        'fuite',
        'plombier',
        'plomberie',
        'kayسيل',
        'kaysil',
        'kaytsreb',
        'tsreb'
      ]
    },

    {
      hints: 'electricite courant coupure',
      terms: [
        'الكهرباء',
        'الضو',
        'ضو',
        'تقطع الضو',
        'الضو تقطع',
        'daw t9ta3',
        'do t9ta3',
        'daw',
        'courant',
        'electricien',
        'electricite',
        'disjoncteur',
        'prise'
      ]
    },

    {
      hints: 'serrurerie porte bloquee cle serrure',
      terms: [
        'مفتاح',
        'الباب مسدود',
        'باب مسدود',
        'الباب تسد',
        'bab tsed',
        'bab msdoud',
        'mftah',
        'serrure',
        'serrurier',
        'cle cassee',
        'porte bloquee'
      ]
    },

    {
      hints: 'climatisation climatiseur',
      terms: [
        'مكيف',
        'المكيف',
        'كليم',
        'klima',
        'clima',
        'clim',
        'climatiseur',
        'climatisation',
        'split'
      ]
    },

    {
      hints: 'menuiserie bois menuisier',
      terms: [
        'نجار',
        'النجار',
        'خشب',
        'njar',
        'khchb',
        'menuisier',
        'menuiserie'
      ]
    },

    {
      hints: 'peinture peintre mur',
      terms: [
        'صباغ',
        'صباغة',
        'sbاغ',
        'sbagh',
        'sbagha',
        'peinture',
        'peintre'
      ]
    },

    {
      hints: 'maconnerie beton ciment',
      terms: [
        'بناء',
        'البناء',
        'بناي',
        'bennay',
        'bnay',
        'beton',
        'ciment',
        'macon',
        'maconnerie'
      ]
    },

    {
      hints: 'nettoyage menage',
      terms: [
        'نظافة',
        'تنقية',
        'tn9iya',
        'nettoyage',
        'menage',
        'cleaning'
      ]
    },

    {
      hints: 'carrelage carreaux',
      terms: [
        'زليج',
        'zellij',
        'zelij',
        'carrelage',
        'carreaux',
        'faience'
      ]
    },

    {
      hints: 'jardinage jardin',
      terms: [
        'جنينة',
        'حديقة',
        'jnina',
        'jardin',
        'jardinage',
        'pelouse'
      ]
    },

    {
      hints: 'bricolage petits travaux montage',
      terms: [
        'bricolage',
        'petits travaux',
        'montage meuble',
        'fixation',
        'percer'
      ]
    },

    {
      hints: 'demenagement transport',
      terms: [
        'رحيل',
        'نقل الاثاث',
        'n9el',
        'transport meuble',
        'demenagement',
        'demenager'
      ]
    }
  ];

  var URGENCY_TERMS = [
    'دابا',
    'دابا دابا',
    'حالاً',
    'حالا',
    'ضروري',
    'مستعجل',
    'daba',
    'daba daba',
    'darori',
    'mest3jel',
    'mosta3jil'
  ];

  function containsAny(text, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (text.indexOf(norm(terms[i])) !== -1) {
        return true;
      }
    }

    return false;
  }

  function normalize(text) {
    var original = String(text || '').trim();

    if (!original) return original;

    var normalized = norm(original);
    var hints = [];

    RULES.forEach(function (rule) {
      if (containsAny(normalized, rule.terms)) {
        hints.push(rule.hints);
      }
    });

    if (containsAny(normalized, URGENCY_TERMS)) {
      hints.push('urgent maintenant');
    }

    if (!hints.length) {
      return original;
    }

    return original + ' ' + hints.join(' ');
  }

  window.FixeoRafiLanguage = {
    VERSION: VERSION,
    normalize: normalize
  };

})();
