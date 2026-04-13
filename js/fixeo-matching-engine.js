/**
 * fixeo-matching-engine.js  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Based on matching-logic.json (Fixeo Matching Engine v1.0).
 * Implements weighted scoring for artisan↔client matching.
 *
 * WEIGHTS (normal mode):
 *   métier:       0.30 (eliminatory filter)
 *   localisation: 0.25
 *   disponibilité:0.20
 *   score_artisan:0.15
 *   budget:       0.10
 *
 * URGENCY mode (disponibilite weight increases to 0.35):
 *   métier:       0.25
 *   localisation: 0.25
 *   disponibilité:0.35
 *   score_artisan:0.10
 *   budget:       0.05
 *
 * Quick-score bonuses (for UI display/sorting):
 *   +40 same city
 *   +30 same service
 *   +10 available
 *   +10 premium
 *   +10 rating > 4.5
 *
 * ZERO UI/CSS changes. Data/logic layer only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     METIERS CONNEXES (from matching-logic.json)
  ══════════════════════════════════════════════════════════ */
  var METIERS_CONNEXES = {
    plomberie:     ['chauffage', 'bricolage'],
    plombier:      ['chauffage', 'bricolage'],
    electricite:   ['climatisation', 'bricolage'],
    electricien:   ['climatisation', 'bricolage'],
    peinture:      ['bricolage'],
    peintre:       ['bricolage'],
    menuiserie:    ['bricolage', 'serrurerie'],
    menuisier:     ['bricolage', 'serrurerie'],
    climatisation: ['electricite', 'chauffage'],
    maconnerie:    ['carrelage', 'toiture'],
    maçon:         ['carrelage', 'toiture'],
    carrelage:     ['maconnerie'],
    serrurier:     ['bricolage'],
    serrurerie:    ['bricolage'],
    nettoyage:     ['bricolage'],
    bricolage:     ['plomberie', 'electricite', 'peinture', 'serrurerie'],
    chauffage:     ['plomberie', 'climatisation'],
    toiture:       ['maconnerie'],
    vitrerie:      ['menuiserie'],
    jardinage:     ['bricolage'],
    demenagement:  [],
  };

  /* ══════════════════════════════════════════════════════════
     VILLES ADJACENTES (from matching-logic.json)
  ══════════════════════════════════════════════════════════ */
  var ZONES_ADJACENTES = {
    'Casablanca': ['Mohammedia', 'Berrechid', 'Bouskoura'],
    'Rabat':      ['Salé', 'Temara', 'Skhirat'],
    'Marrakech':  ['Tamansourt', 'Ait Ourir'],
    'Tanger':     ['Tétouan', 'Fnideq', 'Mdiq'],
    'Fès':        ['Meknès', 'Sefrou'],
    'Agadir':     ['Inezgane', 'Aït Melloul', 'Dcheira'],
    'Meknès':     ['Fès', 'Sefrou'],
    'Tétouan':    ['Tanger', 'Fnideq'],
    'Oujda':      [],
    'Kénitra':    ['Rabat', 'Salé'],
    'Safi':       [],
    'El Jadida':  ['Casablanca'],
  };

  /* ══════════════════════════════════════════════════════════
     SCORING FUNCTIONS
  ══════════════════════════════════════════════════════════ */

  function _normalizeStr(s) {
    if (!s) return '';
    return String(s).toLowerCase()
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e')
      .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o')
      .replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
      .trim();
  }

  /* Score métier: 1.0 exact, 0.8 specialite, 0.5 connexe, 0 no match */
  function _scoreMetier(artisanService, requestedMetier) {
    if (!requestedMetier) return 0.8; // no filter = neutral
    var as = _normalizeStr(artisanService);
    var rm = _normalizeStr(requestedMetier);
    if (!as || !rm) return 0.8;
    if (as === rm || as.includes(rm) || rm.includes(as)) return 1.0;
    // Check connexes
    var connexes = METIERS_CONNEXES[as] || METIERS_CONNEXES[rm] || [];
    for (var i = 0; i < connexes.length; i++) {
      if (_normalizeStr(connexes[i]) === rm || _normalizeStr(connexes[i]) === as) return 0.5;
    }
    return 0.0; // eliminatory
  }

  /* Score localisation: 0.8 same city, 0.5 adjacent, 0 distant */
  function _scoreLocalisation(artisanCity, clientCity) {
    if (!clientCity) return 0.8; // no filter = neutral
    var ac = _normalizeStr(artisanCity);
    var cc = _normalizeStr(clientCity);
    if (!ac || !cc) return 0.8;
    if (ac === cc) return 1.0;
    var adjacent = ZONES_ADJACENTES[artisanCity] || ZONES_ADJACENTES[clientCity] || [];
    for (var i = 0; i < adjacent.length; i++) {
      if (_normalizeStr(adjacent[i]) === cc || _normalizeStr(adjacent[i]) === ac) return 0.5;
    }
    return 0.0;
  }

  /* Score disponibilité */
  function _scoreDisponibilite(artisan, isUrgent) {
    var avail = _normalizeStr(artisan.availability || artisan.disponibilite || 'available');
    if (avail === 'unavailable' || avail === 'indisponible' || avail === 'busy') return 0.0;
    if (isUrgent) {
      // Urgency: premium artisans and "available" get max score
      if (artisan.premium) return 1.0;
      if (avail === 'available') return 0.9;
      return 0.4;
    }
    if (avail === 'available') return 0.9;
    return 0.7;
  }

  /* Score artisan quality */
  function _scoreArtisan(artisan) {
    var rating = Number(artisan.rating || artisan.note || 0);
    var reviews = Number(artisan.reviews || artisan.avis || artisan.reviewCount || 0);
    var verified = artisan.verified || artisan.verifie || false;
    var premium = artisan.premium || false;
    var trustScore = Number(artisan.trustScore || artisan.trust_score || 0);
    var score_qual = Number(artisan.score_qualification || 0);

    // Base: rating/5 normalized
    var base = rating > 0 ? (rating / 5) : 0.5;
    // Taux response proxy: use reviews count (more reviews = more engaged)
    var reviewBonus = Math.min(reviews, 100) / 100 * 0.2;
    // Trust score (0-100 → 0-1)
    var trustBonus = trustScore > 0 ? (trustScore / 100) * 0.15 : 0;
    // Qualification score (0-100 → bonus)
    var qualBonus = score_qual > 0 ? Math.min(score_qual / 100, 1) * 0.1 : 0;

    var s = base * 0.4 + reviewBonus + trustBonus + qualBonus;
    // Badges
    if (verified) s += 0.05;
    if (premium)  s += 0.03;
    return Math.min(s, 1.0);
  }

  /* ══════════════════════════════════════════════════════════
     MAIN SCORING FUNCTION
  ══════════════════════════════════════════════════════════ */

  /**
   * scoreArtisan(artisan, context) → float 0-1
   * context: { city, service, isUrgent, maxBudget }
   */
  function scoreArtisan(artisan, context) {
    context = context || {};
    var isUrgent = !!context.isUrgent;

    // Weights
    var W = isUrgent
      ? { metier: 0.25, local: 0.25, dispo: 0.35, quality: 0.10, budget: 0.05 }
      : { metier: 0.30, local: 0.25, dispo: 0.20, quality: 0.15, budget: 0.10 };

    var sMetier = _scoreMetier(artisan.service || artisan.category, context.service);
    if (sMetier === 0.0 && context.service) return 0.0; // eliminatory

    var sLocal  = _scoreLocalisation(artisan.city || artisan.ville, context.city);
    var sDispo  = _scoreDisponibilite(artisan, isUrgent);
    var sArtisan= _scoreArtisan(artisan);

    // Budget score
    var sBudget = 0.8; // neutral default
    if (context.maxBudget && context.maxBudget > 0) {
      var price = Number(artisan.priceFrom || artisan.price || 0);
      if (price > 0) {
        var ratio = price / context.maxBudget;
        if (ratio <= 1.0) sBudget = 1.0;
        else if (ratio <= 1.3) sBudget = 0.6;
        else sBudget = 0.2;
      }
    }

    return (sMetier * W.metier) + (sLocal * W.local) + (sDispo * W.dispo)
          + (sArtisan * W.quality) + (sBudget * W.budget);
  }

  /* ══════════════════════════════════════════════════════════
     QUICK SCORE (for simple UI sorting without full context)
     +40 same city, +30 same service, +10 available, +10 premium, +10 rating>4.5
  ══════════════════════════════════════════════════════════ */
  function quickScore(artisan, context) {
    context = context || {};
    var s = 0;
    var avail = _normalizeStr(artisan.availability || 'available');

    if (context.city && _normalizeStr(artisan.city || artisan.ville) === _normalizeStr(context.city)) s += 40;
    if (context.service && _normalizeStr(artisan.service || artisan.category) === _normalizeStr(context.service)) s += 30;
    if (avail !== 'unavailable' && avail !== 'busy') s += 10;
    if (artisan.premium) s += 10;
    if (Number(artisan.rating || 0) > 4.5) s += 10;

    return s;
  }

  /* ══════════════════════════════════════════════════════════
     SORT LIST by matching score
  ══════════════════════════════════════════════════════════ */
  function sortByMatch(list, context) {
    if (!Array.isArray(list) || !list.length) return list;
    context = context || {};
    var THRESHOLD = 0.40;

    var scored = list.map(function (a) {
      var s = scoreArtisan(a, context);
      return { artisan: a, score: s };
    });

    // Filter by threshold only if we have enough results
    var above = scored.filter(function (x) { return x.score >= THRESHOLD; });
    if (above.length < 3) above = scored; // loosen threshold if < 3 results

    above.sort(function (x, y) { return y.score - x.score; });
    return above.map(function (x) { return x.artisan; });
  }

  /* ══════════════════════════════════════════════════════════
     HOOK INTO EXISTING SORTING
     Wraps sortMarketplaceArtisansIntelligently if available.
  ══════════════════════════════════════════════════════════ */
  function _getCurrentContext() {
    // Read active filters from the page
    var cityEl    = document.getElementById('filter-city') || document.getElementById('services-city-filter');
    var catEl     = document.getElementById('filter-category');
    var city    = (cityEl    && cityEl.value)    ? cityEl.value.trim()    : '';
    var service = (catEl     && catEl.value)     ? catEl.value.trim()     : '';
    return { city: city, service: service, isUrgent: false };
  }

  function _hookSmartSort() {
    if (!window.FixeoMarketplaceSmartSort) return;
    var original = window.FixeoMarketplaceSmartSort.sortArtisans;
    window.FixeoMarketplaceSmartSort.sortArtisans = function (list) {
      // Run original sort first (trust score, rating, missions)
      var baseSort = original ? original(list) : list;
      // Then apply matching score layer on top
      var ctx = _getCurrentContext();
      if (ctx.city || ctx.service) {
        return sortByMatch(baseSort, ctx);
      }
      return baseSort;
    };
  }

  /* ══════════════════════════════════════════════════════════
     ALSO HOOK renderArtisans via the existing event
  ══════════════════════════════════════════════════════════ */
  function _hookRenderEvent() {
    window.addEventListener('fixeo:marketplace-artisans-updated', function () {
      setTimeout(function () {
        if (window.ARTISANS && window.renderArtisans) {
          var ctx = _getCurrentContext();
          if (ctx.city || ctx.service) {
            window.renderArtisans(sortByMatch(window.ARTISANS.slice(), ctx));
          }
        }
      }, 200);
    });
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  window.FixeoMatchingEngine = {
    scoreArtisan:  scoreArtisan,
    quickScore:    quickScore,
    sortByMatch:   sortByMatch,
    scoreMetier:   _scoreMetier,
    scoreLocal:    _scoreLocalisation,
    METIERS_CONNEXES: METIERS_CONNEXES,
    ZONES_ADJACENTES: ZONES_ADJACENTES,
  };

  /* ── Boot ── */
  function _boot() {
    function _init() {
      _hookSmartSort();
      _hookRenderEvent();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _init);
    } else {
      setTimeout(_init, 50);
    }
  }

  _boot();

})(window);
