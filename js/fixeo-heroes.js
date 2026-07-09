(function () {
  'use strict';

  /* FixeoHeroes V2 — Pure data provider. Zero DOM access.
   *
   * Contract:
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

  /* Normalize any raw category string to a lowercase ASCII slug. */
  function _normalize(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  /* strip combining diacritics */
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Resolve a raw category string to a canonical slug.
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

  /* ── Public API ───────────────────────────────────────────────────── */

  /* getAvatar(category)
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

  /* hasHero(category)
   * Returns true when getAvatar() would return a non-null URL. */
  function hasHero(category) {
    return getAvatar(category) !== null;
  }

  /* getHero(category, asset)
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

  /* ── Expose ───────────────────────────────────────────────────────── */

  window.FixeoHeroes = {
    getAvatar: getAvatar,
    hasHero:   hasHero,
    getHero:   getHero
  };

  /* Backward-compat aliases — keep existing callers working. */
  window.FIXEO_HEROES = {
    get: getHero,
    hasPack: hasHero
  };
  window.getFixeoHero = getHero;

})();
