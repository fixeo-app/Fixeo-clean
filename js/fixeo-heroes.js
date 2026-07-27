(function () {
  'use strict';

  /* FixeoHeroes V3 — Pure data provider. Zero DOM access.
   *
   * V3 additions (fxhome-artisans-v2b1):
   *   FixeoHeroes.getCardAvatar(category)  → { slug, webp, png, label } or null
   *   FixeoHeroes.normalizeCategorySlug(category) → canonical slug string or null
   *   All 18 canonical métier card assets registered.
   *   Existing public API unchanged for backward compat.
   *
   * Contract (unchanged):
   *   window.FixeoHeroes.getAvatar(category)  → URL string or null
   *   window.FixeoHeroes.hasHero(category)    → boolean
   *   window.FixeoHeroes.getHero(category, asset) → URL string or null
   *
   * Returns null (not a default) when category is unknown or empty.
   * Caller decides the fallback behaviour.
   *
   * Backward-compat aliases retained:
   *   window.FIXEO_HEROES.get(category, asset) → URL or null
   *   window.getFixeoHero(category, asset)     → URL or null
   */

  var HERO_BASE = '/heroes';

  /* Primary avatar filename for each active category folder.
   * All files are .jpg — actual filenames on disk. */
  var AVATAR_MAP = {
    plomberie:     'avatar-presenting-transparent.jpg',
    electricite:   'avatar-presenting-transparent.jpg',
    climatisation: 'avatar-presenting-transparent.jpg'
  };

  /* Additional named assets per category (for getHero(category, asset)). */
  /* Keys are post-_normalize() form: lowercase, ASCII, no hyphens/punctuation, spaces→removed. */
  var ASSET_MAP = {
    plomberie: {
      'avatar':                    'avatar-presenting-transparent.jpg',
      'avatararmscrossed':         'avatar-arms-crossed-transparent.jpg',
      'avatardefault':             'avatar-default.jpg',
      'avatarthumbsuptoolbox':     'avatar-thumbs-up-toolbox-transparent.jpg',
      'avatarthumbsupwrench':      'avatar-thumbs-up-wrench-transparent.jpg',
      'avatartransparent':         'avatar-transparent.jpg',
      'avatarwrench':              'avatar-wrench-transparent.jpg',
      'avatarround':               'avatar-round.jpg',
      'fallback':                  'fallback.jpg'
    }
  };

  /* Category folder routing — slug → folder name.
   * All unmapped slugs fall through to null (caller handles fallback). */
  var FOLDER_MAP = {
    plomberie:     'plomberie',
    electricite:   'electricite',
    climatisation: 'plomberie',   /* climatisation/ assets pending */
    serrurerie:    'plomberie',
    menuiserie:    'plomberie',
    peinture:      'plomberie',
    nettoyage:     'plomberie',
    jardinage:     'plomberie',
    maconnerie:    'plomberie',
    carrelage:     'plomberie',
    bricolage:     'plomberie',
    chauffage:     'plomberie',
    toiture:       'plomberie',
    vitrerie:      'plomberie',
    demenagement:  'plomberie',
    securite:      'plomberie',
    energie:       'plomberie',
    corporate:     'plomberie'
  };

  /* Alias table — raw category string variants → canonical slug. */
  var ALIAS_MAP = {
    /* Plomberie */
    'plombier':           'plomberie',
    'plomberie':          'plomberie',
    'plumbing':           'plomberie',
    /* Electricité */
    'electricien':        'electricite',
    'electricite':        'electricite',
    'electricite ':       'electricite',
    'electrical':         'electricite',
    /* Climatisation */
    'clim':               'climatisation',
    'climatisation':      'climatisation',
    'hvac':               'climatisation',
    'air conditioning':   'climatisation',
    'chauffage':          'chauffage',
    /* Serrurerie */
    'serrurier':          'serrurerie',
    'serrurerie':         'serrurerie',
    /* Menuiserie */
    'menuisier':          'menuiserie',
    'menuiserie':         'menuiserie',
    /* Peinture */
    'peintre':            'peinture',
    'peinture':           'peinture',
    /* Others */
    'nettoyage':          'nettoyage',
    'jardinage':          'jardinage',
    'maconnerie':         'maconnerie',
    'carrelage':          'carrelage',
    'bricolage':          'bricolage',
    'toiture':            'toiture',
    'vitrerie':           'vitrerie',
    'demenagement':       'demenagement',
    'securite':           'securite',
    'surveillance':       'securite',
    'solaire':            'energie',
    'energie solaire':    'energie',
    'corporate':          'corporate'
  };

  /* ── Card avatar map (V3) ───────────────────────────────────────────
   * Maps every canonical slug to its card-avatar filenames and French label.
   * Used exclusively by getCardAvatar() — does not affect getAvatar()/getHero(). */
  var CARD_LABELS = {
    plomberie:             'Plomberie',
    electricite:           '\u00c9lectricit\u00e9',
    nettoyage:             'Nettoyage',
    climatisation:         'Climatisation',
    serrurerie:            'Serrurerie',
    menuiserie:            'Menuiserie',
    peinture:              'Peinture',
    maconnerie:            'Ma\u00e7onnerie',
    carrelage:             'Carrelage',
    jardinage:             'Jardinage',
    bricolage:             'Bricolage',
    chauffage:             'Chauffage',
    toiture:               'Toiture',
    vitrerie:              'Vitrerie',
    demenagement:          'D\u00e9m\u00e9nagement',
    'securite-surveillance': 'S\u00e9curit\u00e9 et surveillance',
    'energie-solaire':     '\u00c9nergie solaire',
    'corporate-facilities':'Corporate Facilities'
  };

  /* Full canonical slug set for card avatars — includes hyphenated slugs
   * that diverge from the legacy securite/energie/corporate short forms. */
  var CARD_SLUGS = [
    'plomberie','electricite','nettoyage','climatisation','serrurerie',
    'menuiserie','peinture','maconnerie','carrelage','jardinage','bricolage',
    'chauffage','toiture','vitrerie','demenagement',
    'securite-surveillance','energie-solaire','corporate-facilities'
  ];

  /* Extended alias table for card-avatar resolution.
   * Maps normalized raw values → canonical card slug.
   * Must NOT conflate: chauffage↔climatisation, bricolage↔corporate-facilities,
   * electricite↔energie-solaire. Unknown → null. */
  var CARD_ALIAS = {
    /* Plomberie */
    'plombier':                    'plomberie',
    'plomberie':                   'plomberie',
    /* Électricité — accent-stripped form handled by _normalize() */
    'electricite':                 'electricite',
    'electricien':                 'electricite',
    /* Nettoyage */
    'nettoyage':                   'nettoyage',
    /* Climatisation — strictly climatisation only, never chauffage */
    'climatisation':               'climatisation',
    'clim':                        'climatisation',
    /* Serrurerie */
    'serrurerie':                  'serrurerie',
    'serrurier':                   'serrurerie',
    /* Menuiserie */
    'menuiserie':                  'menuiserie',
    'menuisier':                   'menuiserie',
    /* Peinture */
    'peinture':                    'peinture',
    'peintre':                     'peinture',
    /* Maçonnerie */
    'maconnerie':                  'maconnerie',
    /* Carrelage */
    'carrelage':                   'carrelage',
    /* Jardinage */
    'jardinage':                   'jardinage',
    /* Bricolage — strictly bricolage, never corporate */
    'bricolage':                   'bricolage',
    /* Chauffage — strictly chauffage, never climatisation */
    'chauffage':                   'chauffage',
    /* Toiture */
    'toiture':                     'toiture',
    /* Vitrerie */
    'vitrerie':                    'vitrerie',
    /* Déménagement */
    'demenagement':                'demenagement',
    'demenag':                     'demenagement',
    /* Sécurité / Surveillance — all variants → securite-surveillance */
    'securite':                    'securite-surveillance',
    'securite surveillance':       'securite-surveillance',
    'surveillance':                'securite-surveillance',
    'security':                    'securite-surveillance',
    'securite-surveillance':       'securite-surveillance',
    /* Énergie solaire — strictly solar, never electricite */
    'energie':                     'energie-solaire',
    'energie solaire':             'energie-solaire',
    'solaire':                     'energie-solaire',
    'energie-solaire':             'energie-solaire',
    /* Corporate Facilities — strictly corporate, never bricolage */
    'corporate':                   'corporate-facilities',
    'corporate facilities':        'corporate-facilities',
    'corporate-facilities':        'corporate-facilities',
    'facilities':                  'corporate-facilities'
  };

  /* Normalize any raw category string to a lowercase ASCII slug.
   * Strips accents, trims, collapses spaces. Hyphens preserved for
   * compound slugs that reach here already normalized. */
  function _normalize(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  /* strip combining diacritics */
      .replace(/[^a-z0-9 \-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Resolve a raw category string to a canonical slug (legacy API).
   * Returns null when no match found — never a default. */
  function _resolveSlug(category) {
    var key = _normalize(category);
    if (!key) return null;
    var slug = ALIAS_MAP[key];
    if (slug) return slug;
    /* Direct match against known slugs (already normalized input) */
    if (FOLDER_MAP.hasOwnProperty(key)) return key;
    return null;
  }

  /* Resolve a raw category to a canonical CARD slug (V3, full set).
   * Handles slash-separated strings such as "Sécurité / Surveillance".
   * Returns null for unknown categories — never defaults to plomberie. */
  function _resolveCardSlug(category) {
    if (!category) return null;
    /* Strip slash separators then normalize */
    var key = _normalize(String(category).replace(/\//g, ' '));
    if (!key) return null;
    /* CARD_ALIAS lookup */
    if (CARD_ALIAS.hasOwnProperty(key)) return CARD_ALIAS[key];
    /* Direct match against full card slug set */
    for (var i = 0; i < CARD_SLUGS.length; i++) {
      if (CARD_SLUGS[i] === key) return CARD_SLUGS[i];
    }
    return null;
  }

  /* ── Public API ───────────────────────────────────────────────────── */

  /* getAvatar(category) [UNCHANGED — backward compat]
   * Returns the primary avatar URL for the category, or null if unknown.
   * Never returns a default — caller decides the fallback. */
  function getAvatar(category) {
    var slug = _resolveSlug(category);
    if (!slug) return null;
    var folder = FOLDER_MAP[slug];
    if (!folder) return null;
    var filename = AVATAR_MAP[folder] || AVATAR_MAP['plomberie'];
    if (!filename) return null;
    return HERO_BASE + '/' + folder + '/' + filename;
  }

  /* hasHero(category) [UNCHANGED — backward compat]
   * Returns true when getAvatar() would return a non-null URL. */
  function hasHero(category) {
    return getAvatar(category) !== null;
  }

  /* getHero(category, asset) [UNCHANGED — backward compat]
   * Returns a specific named asset URL, or null if not found.
   * Falls back to primary avatar when asset name unrecognised. */
  function getHero(category, asset) {
    var slug = _resolveSlug(category);
    if (!slug) return null;
    var folder = FOLDER_MAP[slug];
    if (!folder) return null;
    var assetKey = _normalize(asset || 'avatar');
    var assets = ASSET_MAP[folder];
    var filename = (assets && assets[assetKey]) || AVATAR_MAP[folder];
    if (!filename) return null;
    return HERO_BASE + '/' + folder + '/' + filename;
  }

  /* normalizeCategorySlug(category) [V3 — new]
   * Public wrapper around _resolveCardSlug.
   * Returns canonical card slug or null. Never a default. */
  function normalizeCategorySlug(category) {
    return _resolveCardSlug(category);
  }

  /* getCardAvatar(category) [V3 — new]
   * Returns { slug, webp, png, label } for the mapped métier, or null.
   * webp and png are root-relative URLs ready for use in <picture> elements.
   * alt-text format follows manifest spec: "Illustration métier : [Label]"
   * Unknown categories return null — never default to plomberie. */
  function getCardAvatar(category) {
    var slug = _resolveCardSlug(category);
    if (!slug) return null;
    return {
      slug:  slug,
      webp:  HERO_BASE + '/' + slug + '/avatar-card.webp',
      png:   HERO_BASE + '/' + slug + '/avatar-card.png',
      label: CARD_LABELS[slug] || slug,
      alt:   'Illustration m\u00e9tier\u00a0: ' + (CARD_LABELS[slug] || slug)
    };
  }

  /* ── Expose ───────────────────────────────────────────────────────── */

  window.FixeoHeroes = {
    /* V2 unchanged */
    getAvatar:             getAvatar,
    hasHero:               hasHero,
    getHero:               getHero,
    /* V3 additions */
    normalizeCategorySlug: normalizeCategorySlug,
    getCardAvatar:         getCardAvatar
  };

  /* Backward-compat aliases — keep existing callers working. */
  window.FIXEO_HEROES = {
    get: getHero,
    hasPack: hasHero
  };
  window.getFixeoHero = getHero;

})();
