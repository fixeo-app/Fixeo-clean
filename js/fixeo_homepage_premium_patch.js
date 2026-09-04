/**
 * fixeo_homepage_premium_patch.js  v4 (fhp13 — fxhome-artisans-v2b1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces old results-layout with premium 2-col pvc-card vedette grid.
 * v3 adds: event delegation for clicks, section header + counter, fade-in anim.
 * v4 (J-1): marketplace energy pass.
 * fxhome-artisans-v2a: product-truth hardening —
 *   - Canonical renderer: _buildCard() is the ONLY homepage artisan card renderer.
 *   - Dead SecondarySearch.renderVedetteCard branch permanently bypassed.
 *   - Header: truthful state-aware title/subtitle/count (no "disponibles" framing).
 *   - Availability badge only for availability_today; suppressed for defaulted "available".
 *   - "Actif cette semaine" removed; live signal tier restricted to fast/rdv only.
 *   - Trust line: "Vérifié par FIXEO" gated on verified===true only.
 *   - Payment claim separated from verification.
 *   - Rating fallback: "Nouveau sur Fixeo" → "Profil référencé sur FIXEO".
 *   - Pricing: midpoint "Estimation Fixeo" removed; single price message only.
 *   - Location: "Intervient à" → "Basé à".
 *   - "Voir profil" span → semantic <a href> anchor.
 *   - Reserve button: artisan-specific aria-label.
 *   - _renderPremiumGrid: explicit result-mode tracking passed to _buildHeader.
 * fxhome-artisans-v2b1: illustrative métier avatar integration —
 *   - Three-tier fallback: real photo → métier <picture> → CSS silhouette.
 *   - Métier avatar uses <picture> (WebP source + PNG img fallback).
 *   - Real photo: data-avatar-type="real-photo", alt=artisan name, onerror→métier.
 *   - Métier avatar: data-avatar-type="illustrative-metier", illustrative alt text.
 *   - PNG/WebP both fail → silhouette, no broken-image icon visible.
 *   - Unknown category → silhouette (never defaults to Plomberie).
 *   - FixeoHeroes.getCardAvatar() used for all métier resolution.
 * fxhome-artisans-v2b1.1: deterministic staged fallback —
 *   - Single <img> with explicit staged onerror; no hidden <picture> with live src/srcset.
 *   - Tier 1 (real photo): only real photo URL assigned; zero métier requests until onerror.
 *   - Tier 2 (métier WebP): assigned by onerror handler; img src set to WebP explicitly.
 *   - Tier 3 (métier PNG): WebP onerror assigns PNG src directly; no <picture> format guessing.
 *   - Tier 4 (silhouette): PNG onerror hides img, shows silhouette, clears alt.
 *   - alt and data-avatar-type updated at each stage transition.
 *   - _avatarSetStage() page-local helper; no new global API.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window) {
  'use strict';

  var MAX_CARDS   = 9;
  var GRID_ID     = 'fixeo-homepage-vedette-grid';
  var HEADER_ID   = 'fixeo-homepage-header';
  var EXPLORE_ID  = 'fixeo-homepage-explore';   /* K-2: city explore strip */
  var ACTIONS_ID  = 'fxas-section-actions';     /* V1A.2: continuation actions */
  var SECTION_ID  = 'artisans-section';

  var _searchActive = false;
  var _originalRenderArtisans = null;
  var _installed = false;
  var _containerObserver = null;

  /* ── Category maps ── */
  var CAT_ICONS = {
    plomberie:'🔧',electricite:'⚡',peinture:'🎨',nettoyage:'🧹',
    jardinage:'🌿',demenagement:'📦',bricolage:'🔨',climatisation:'❄️',
    menuiserie:'🪚',maconnerie:'🧱',serrurerie:'🔑',carrelage:'🏠',
    etancheite:'🛡',vitrerie:'🪟',soudure:'🔥',informatique:'💻'
  };
  var CAT_LABELS = {
    plomberie:'Plomberie',electricite:'Électricité',peinture:'Peinture',
    nettoyage:'Nettoyage',jardinage:'Jardinage',demenagement:'Déménagement',
    bricolage:'Bricolage',climatisation:'Climatisation',menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie',serrurerie:'Serrurerie',carrelage:'Carrelage',
    etancheite:'Étanchéité',vitrerie:'Vitrerie',soudure:'Soudure',
    informatique:'Informatique'
  };

  /* ── Helpers ── */
  function _initials(name) {
    if (!name) return '??';
    var p = String(name).trim().split(/\s+/);
    return ((p[0]||'?')[0] + ((p[1]||p[0]||'?')[0])).toUpperCase();
  }
  function _stars(r) {
    var f = Math.round(parseFloat(r)*2)/2, s='';
    for (var i=1;i<=5;i++) s += i<=f ? '★' : (f>=i-0.5 ? '½' : '☆');
    return s;
  }
  function _hide(el) { if (el) el.style.setProperty('display','none','important'); }
  function _show(el) { if (el) el.style.removeProperty('display'); }
  function _$(id) { return document.getElementById(id); }
  function _q(s)  { return document.querySelector(s); }
  function _qa(s) { return document.querySelectorAll(s); }

  /* ── Sort: real artisans first ── */
  function _getFilterContext() {
    var cityEl = document.getElementById('filter-city') || document.getElementById('services-city-filter') || document.getElementById('ssb2-select-city');
    var catEl  = document.getElementById('filter-category') || document.getElementById('ssb2-select-cat');
    var qEl    = document.getElementById('search-input') || document.getElementById('ssb2-input-nlp');
    /* K-1: City priority hierarchy
     *   P1: services-city-filter (manual user pick in services section)
     *   P2: filter-city / ssb2-select-city (QSM search or chip selection)
     *   P3: window.FIXEO_DETECTED_CITY (geo reverse-geocode, written by hero-geo script)
     *   P4: '' → current national fallback behavior (unchanged)
     * Manual intent always wins; geo is a silent fallback only. */
    var cityVal = (cityEl && cityEl.value) ? cityEl.value.trim() : '';
    if (!cityVal) { cityVal = (typeof window.FIXEO_DETECTED_CITY === 'string' ? window.FIXEO_DETECTED_CITY : '') || ''; }
    return {
      city:    cityVal,
      service: (catEl  && catEl.value)  ? catEl.value.trim()  : '',
      query:   (qEl    && qEl.value)    ? qEl.value.trim()    : '',
    };
  }

  function _qualityScore(a) {
    // Higher quality = master artisans (IDs 2000+) + high trust + high rating + verified
    var isMaster = Number(a.id) >= 2000;
    var masterBonus = isMaster ? 0.15 : 0;
    var trust = (Number(a.trustScore || a.trust_score || 0)) / 100;
    var rating = Number(a.rating || 0) / 5;
    var reviewBonus = Math.min(Number(a.reviewCount || a.total_reviews || 0), 100) / 100 * 0.1;
    var verified = (a.verified || a.certified) ? 0.05 : 0;
    return masterBonus + trust * 0.4 + rating * 0.35 + reviewBonus + verified;
  }

  function _sortList(list, ctx) {
    var context = ctx || _getFilterContext();
    /* 3C: cap candidate pool at MAX_CARDS*4 before scoring.
       scoreArtisan is O(1) per artisan but called on all 367 by default.
       Pre-filtering by qualityScore keeps the same top results in O(N log N)
       with a much smaller scoring pass. Only applies when no city/service
       filter is active (filters already reduce the list size). */
    var hasFilters = !!(context.city || context.service || context.query);
    var candidates = list;
    var CAP = MAX_CARDS * 4; /* 24 — score 4× what we need, pick top MAX_CARDS */
    if (!hasFilters && list.length > CAP) {
      /* Sort cheaply by quality score (no ML, pure arithmetic) to get top candidates */
      var pre = list.slice().sort(function(a, b) { return _qualityScore(b) - _qualityScore(a); });
      candidates = pre.slice(0, CAP);
    }
    // Use FixeoMatchingEngine for scoring, but combine with quality bonus
    if (window.FixeoMatchingEngine) {
      var scored = candidates.map(function(a) {
        var matchScore = window.FixeoMatchingEngine.scoreArtisan(a, context);
        var qualScore  = _qualityScore(a);
        return { a: a, s: matchScore * 0.65 + qualScore * 0.35 };
      });
      scored.sort(function(x, y) { return y.s - x.s; });
      return scored.map(function(x) { return x.a; });
    }
    // Fallback
    var real  = candidates.filter(function(a){ return Number(a.id) >= 2000; });
    var seeds = candidates.filter(function(a){ return Number(a.id) < 2000; });
    real.sort(function(a,b){return _qualityScore(b)-_qualityScore(a);});
    seeds.sort(function(a,b){return _qualityScore(b)-_qualityScore(a);});
    return real.concat(seeds);
  }

  
  /* ─── Moroccan pricing by service ──────────────────────────── */
  /* MAR_PRICES v2 — aligned with fixeo-pricing-marocain.js canonical values.
   * to/range values kept proportional to from increases.
   * Used only for display: card price badge + hint line. Never feeds payment. */
  var MAR_PRICES = {
    plomberie:    { from: 150, to: 400,  label: '150–400 MAD' },
    electricite:  { from: 100, to: 400,  label: '100–400 MAD' },
    menuiserie:   { from: 150, to: 600,  label: '150–600 MAD' },
    peinture:     { from: 800, to: 2500, label: '800–2 500 MAD' },
    nettoyage:    { from: 200, to: 600,  label: '200–600 MAD' },
    climatisation:{ from: 200, to: 700,  label: '200–700 MAD' },
    maconnerie:   { from: 200, to: 800,  label: '200–800 MAD' },
    carrelage:    { from: 150, to: 500,  label: '150–500 MAD' },
    jardinage:    { from: 150, to: 450,  label: '150–450 MAD' },
    serrurerie:   { from: 150, to: 400,  label: '150–400 MAD' },
    demenagement: { from: 500, to: 1500, label: '500–1 500 MAD' },
    bricolage:    { from: 100, to: 350,  label: '100–350 MAD' },
    toiture:      { from: 300, to: 900,  label: '300–900 MAD' },
    etancheite:   { from: 250, to: 900,  label: '250–900 MAD' },
    vitrerie:     { from: 200, to: 700,  label: '200–700 MAD' },
    soudure:      { from: 150, to: 500,  label: '150–500 MAD' },
    informatique: { from: 100, to: 350,  label: '100–350 MAD' }
  };

  /* _getPricing (v2a): one price message. Midpoint "Estimation Fixeo" removed.
   * Returns { main, hint, type }. Never two competing prices. */
  function _getPricing(a) {
    var cat  = (a.category || a.service || '').toLowerCase().trim();
    var info = MAR_PRICES[cat];
    if (a.price_from || a.priceFrom) {
      var pf = parseInt(a.price_from || a.priceFrom, 10);
      if (!isNaN(pf) && pf > 100) {
        return {
          main: '\u00c0 partir de ' + new Intl.NumberFormat('fr-FR').format(pf) + '\u00a0MAD',
          hint: 'Tarif renseign\u00e9',
          type: 'artisan'
        };
      }
    }
    if (info && info.label) {
      return {
        main: 'Budget indicatif\u00a0: ' + info.label,
        hint: 'Fourchette g\u00e9n\u00e9rale du service',
        type: 'range'
      };
    }
    return {
      main: 'Tarif \u00e0 confirmer',
      hint: "Selon l\u2019intervention",
      type: 'unknown'
    };
  }

  function _responseTimeLabel(rt) {
    rt = parseInt(rt, 10);
    if (!rt || rt >= 999) return null;
    if (rt <= 10) return 'Répond en 10 min';
    if (rt <= 30) return 'Répond en ' + rt + ' min';
    if (rt <= 60) return 'Répond en 1h';
    return 'Répond en ' + Math.round(rt / 60) + 'h';
  }

  function _missionsLabel(a) {
    var m = parseInt(a.missionsCompleted || a.missions_count || a.reviewCount || a.reviews || 0, 10);
    if (m >= 200) return m + '+ missions';
    if (m >= 50)  return m + ' missions';
    if (m >= 10)  return m + ' missions';
    return null;
  }

  /* ─── Live marketplace signals (v14 — J1 variation pass) ─────
   * Uses ONLY real artisan fields — score_qualification + rating + city + id.
   * Returns HTML for .pvc-live-signals strip: max 2 pills per card.
   *
   * J1 change: inject card-position variation so the top-6 visible artisans
   * (all high-score) don't all show the same signal pair.
   *
   * Sig1 activity tier:
   *   score >= 90  → pool of 3 fast-response variants (rotated by id)
   *   score 80–89  → "Actif cette semaine" (blue)
   *   score < 80   → "Disponible sur RDV"  (muted)
   *
   * Sig2 context signal:
   *   rating >= 4.8 → "Très bien noté" OR city signal (alternated by id parity)
   *   rating >= 4.5 → "Artisan recommandé"
   *   else          → "Intervient à {city}"
   * ─────────────────────────────────────────────────────────── */
  /* _liveSignalsHtml (v2a.2) — factual reputation only.
   *
   * Rules:
   *   - No qualitative labels: no "Très bien noté", "Artisan confirmé",
   *     "recommandé", "populaire", "expérimenté", "réputé",
   *     "de confiance", "très demandé", "meilleur".
   *   - Reputation signal only when BOTH rating > 0 AND reviews > 0 from real data.
   *   - score_qualification never converted to stars or review labels.
   *   - City shown ONCE: the dedicated location line is canonical.
   *     This function never emits a city signal.
   *   - When no signal: return '' (no empty container). */
  function _liveSignalsHtml(a) {
    var reviews = parseInt(a.reviewCount || a.reviews || a.review_count || 0, 10);
    var rating  = parseFloat(a.rating || 0);

    /* Genuine factual data required: both values must be present and > 0. */
    var hasFactualRating = (rating > 0 && reviews > 0);

    if (!hasFactualRating) {
      return '';  /* no signal at all — no empty container */
    }

    /* Format: "⭐ 4,8 · 24 avis" using fr-FR locale for decimal separator. */
    var ratingFormatted = rating.toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    var avisLabel = reviews === 1 ? '1 avis' : reviews + ' avis';
    var sigText = '\u2b50 ' + ratingFormatted + ' \u00b7 ' + avisLabel;

    return '<div class="pvc-live-signals">' +
      '<span class="pvc-live-signal pvc-live-signal--rating">' + sigText + '</span>' +
    '</div>';
  }

  /* ─── Premium card builder v2 ───────────────────────────────── */
  function _buildCard(a, idx) {
    idx = idx || 0;
    var cat      = (a.category || a.service || '').toLowerCase();
    var catIcon  = CAT_ICONS[cat] || '🔧';
    var catLbl   = CAT_LABELS[cat] || (a.service || a.category || 'Service');
    var rating   = parseFloat(a.rating) || 0;
    var reviews  = parseInt(a.reviewCount || a.reviews || a.review_count || 0, 10);
    var trust    = parseInt(a.trustScore || 0, 10);
    var rt       = parseInt(a.responseTime || 999, 10);
    /* v2a.1: strict gate — verified===true ONLY; certified and trustScore removed */
    var isVer    = (a.verified === true);
    var isClaimed= !!(a.claimed);
    var avail    = (a.availability || '').toLowerCase();
    var isAvail  = avail === 'available' || a.available;
    var isToday  = avail === 'available_today';
    var pricing  = _getPricing(a);
    /* rtLabel/misLabel unused since T2 chip rewrite — kept for future use */
    var rtLabel  = null;
    var misLabel = null;

    /* Avatar — deterministic staged fallback (fxhome-artisans-v2b1.1):
     *
     *   Stage 1 — real photo         src=photo   data-avatar-type="real-photo"
     *   Stage 2 — métier WebP        src=webp    data-avatar-type="illustrative-metier"
     *   Stage 3 — métier PNG         src=png     data-avatar-type="illustrative-metier"
     *   Stage 4 — CSS silhouette     img hidden  silhouette span shown
     *
     * A single <img> carries all stages via sequential onerror assignments.
     * No hidden <picture> with live src/srcset — zero speculative requests.
     * Stage transitions update alt and data-avatar-type in place.
     * _avatarSetStage() is a page-local helper (not a global).
     */
    var avatarSrc  = a.avatar || a.photo || a.photo_url || '';
    var cardAvatar = (window.FixeoHeroes && window.FixeoHeroes.getCardAvatar)
      ? window.FixeoHeroes.getCardAvatar(cat)
      : null;

    /* Encode fallback URLs as data-attributes so the onerror handler can read
     * them without closing over mutable JS variables from the card loop.
     *
     * data-avatar-state on the .pvc-avatar container (fxhome-artisans-v2b1.2):
     * CSS rules gate exactly one child visible per state.
     * JS sets it at render time; _avatarSetStage updates it on every transition.
     */
    var avatarInitialState; /* "real-photo" | "illustrative-metier" | "silhouette" */
    var avatarHtml;
    if (avatarSrc) {
      /* Stage 1: real photo. Métier URLs stored in data attrs — NOT assigned to
       * src/srcset yet, so no browser request is issued until onerror fires. */
      avatarInitialState = 'real-photo';
      avatarHtml =
        '<img class="pvc-avatar-img"'
        + ' src="'                   + _esc(avatarSrc)                          + '"'
        + ' alt="'                   + _esc(a.name)                             + '"'
        + ' data-avatar-type="real-photo"'
        + ' data-webp="'             + (cardAvatar ? _esc(cardAvatar.webp) : '') + '"'
        + ' data-png="'              + (cardAvatar ? _esc(cardAvatar.png)  : '') + '"'
        + ' data-alt-metier="'       + (cardAvatar ? _esc(cardAvatar.alt)  : '') + '"'
        + ' width="72" height="72" loading="lazy" decoding="async"'
        + ' onerror="_fxAvStage(this)">'
        + '<span class="pvc-avatar-silhouette"></span>';
    } else if (cardAvatar) {
      /* Stage 2 start: no real photo, load WebP immediately. PNG stored in data attr. */
      avatarInitialState = 'illustrative-metier';
      avatarHtml =
        '<img class="pvc-avatar-img"'
        + ' src="'                   + _esc(cardAvatar.webp)                    + '"'
        + ' alt="'                   + _esc(cardAvatar.alt)                     + '"'
        + ' data-avatar-type="illustrative-metier"'
        + ' data-webp=""'
        + ' data-png="'              + _esc(cardAvatar.png)                     + '"'
        + ' data-alt-metier="'       + _esc(cardAvatar.alt)                     + '"'
        + ' width="72" height="72" loading="lazy" decoding="async"'
        + ' onerror="_fxAvStage(this)">'
        + '<span class="pvc-avatar-silhouette"></span>';
    } else {
      /* Stage 4 direct: unknown category — silhouette only, no requests. */
      avatarInitialState = 'silhouette';
      avatarHtml = '<span class="pvc-avatar-silhouette"></span>';
    }

    /* Availability badge — v2a: only show for explicit available_today.
     * "available" cannot be trusted: loader defaults NULL→"available".
     * Suppress badge for all non-explicit states. */
    var availHtml;
    if (isToday || avail === 'available_today') {
      availHtml = '<span class="pvc-avail-badge pvc-avail-badge--today">\ud83d\udfe1 Disponible aujourd\u2019hui</span>';
    } else {
      availHtml = '';
    }

    /* Rating — J1: tier-based credible state (no fake numbers, no "Évaluation en cours")
     * _sq = score_qualification (master artisans 68–96); reviews already declared above.
     * For Supabase artisans (no sq, all reviews>=100), use idSeed to rotate 3 variants
     * so the 6 visible top-artisan cards show different text, not all "Très bien noté". */
    var _sq = parseInt(a.score_qualification || 0, 10);
    /* idSeed for rating — same char-sum approach as signals, but local here */
    var _idSeedR = 0;
    var _idStrR = String(a.id || '0');
    for (var _rci = 0; _rci < _idStrR.length; _rci++) { _idSeedR += _idStrR.charCodeAt(_rci); }
    var HIGH_LABELS = ['Tr\u00e8s bien not\u00e9', 'Artisan s\u00e9rieux', 'Recommand\u00e9'];
    var _ratingStateText;
    if (_sq >= 90 || reviews >= 100) {
      _ratingStateText = HIGH_LABELS[_idSeedR % HIGH_LABELS.length];
    } else if (_sq >= 80 || reviews >= 40) {
      _ratingStateText = 'Bien not\u00e9';
    } else if (_sq >= 70 || reviews >= 10) {
      _ratingStateText = 'S\u00e9lectionn\u00e9 Fixeo';
    } else {
      /* v2a: no reliable onboarding date — neutral truthful fallback */
      _ratingStateText = 'Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO';
    }
    /* V1-H Phase 6: Remove static ★★★★★ for artisans without real data.
     * Master artisans (sq≥70 or reviews≥10) earned the label — show it cleanly.
     * New/self-registered artisans: no stars. Honest tier state only.
     * Stars are a decoration, not data. Their absence is more honest than their presence. */
    var hasRealQuality = (_sq >= 70 || reviews >= 10);
    var starsHtml = (hasRealQuality
      ? '<span class="pvc-stars-v2" aria-hidden="true">\u2605\u2605\u2605\u2605\u2605</span>'
      : '')
      + '<span class="pvc-rating-state' + (hasRealQuality ? '' : ' pvc-rating-state--new') + '">'
      + _ratingStateText + '</span>';

    /* Chips — credible state only (T2: no mission counts) */
    /* chips removed — info block is FOMO + trust-line only (T2) */

    /* Trust badges — verified/premium only (T2) */
    var badges = '';
    if (isVer)       badges += '<span class="pvc-badge-v2 pvc-badge-v2--verified">✔ Vérifié Fixeo</span>';
    /* v2a.3: "Premium" badge removed — trust score is not a verifiable product claim. */

    /* Data attribute (for click delegation) */
    var dataAttr;
    try {
      dataAttr = ' data-artisan=\'' + JSON.stringify(a).replace(/'/g, '&#39;') + '\'';
    } catch(_) { dataAttr = ''; }

    return '<article class="pvc-card fhp-card"' +
      ' data-artisan-id="' + a.id + '"' + dataAttr +
      ' tabindex="0" role="button"' +
      ' aria-label="' + _esc(a.name) + ', ' + catLbl + '"' +
      ' style="--anim-delay:' + idx + '">' +

      /* — Header — */
'<div class="pvc-card-header pvc-card-header-final">' +
  '<div class="pvc-avatar ' + (isVer ? ' pvc-avatar--verified' : '') + '" data-category="' + cat + '" data-avatar-state="' + avatarInitialState + '">' + avatarHtml + '<span class="pvc-avatar-badge">' + catIcon + '</span></div>' +
  '<div class="pvc-identity pvc-identity-final">' +
    '<h3 class="pvc-name">' + _esc(a.name || '-') + '</h3>' +
    /* v2a.1: "Basé à Maroc" forbidden — use "Profil au Maroc" for missing city */
        (a.city
          ? '<div class="pvc-line pvc-line-city">📍 Bas\u00e9 \u00e0 ' + _esc(a.city) + '</div>'
          : '<div class="pvc-line pvc-line-city">Profil au Maroc</div>') +
    '<div class="pvc-line pvc-line-cat">' + catIcon + ' ' + catLbl + '</div>' +
    '<div class="pvc-line pvc-line-available">' + availHtml + '</div>' +
  '</div>' +
'</div>' +

      /* ── Badges ── */
      (badges ? '<div class="pvc-badges-v2">' + badges + '</div>' : '') +

      /* ── V3B: Optional factual mini-description ─────────────────────────
       * Source: a.description (row.description in Supabase loader — confirmed
       * canonical field used by public artisan profile page).
       * Processing: strip HTML tags, collapse whitespace, trim. CSS 2-line clamp.
       * Never generated or rewritten. Empty → block absent, no gap reserved.
       * ─────────────────────────────────────────────────────────────────── */
      (function() {
        /* V3B2-1: normalizeMarketplaceArtisanRecord (main.js) drops .description and .shortBio,
         * remapping the text to a.bio.fr. Add bio.fr fallback to cover Supabase-normalised records.
         * Guard: (1) typeof === 'string' prevents coercion of bio objects.
         * (2) _descSanitize rejects stringified object artefacts ('[object Object]' etc.)
         *     that can appear when normalizeMarketplaceArtisanRecord falls back to raw.bio
         *     as a last resort (truthy object) and it later gets JSON-stringified or .toString()'d. */
        function _descSanitize(s) {
          if (typeof s !== 'string') return '';
          var t = s.trim();
          if (!t) return '';
          // Reject JSON array/object artefacts and Object.prototype.toString artefacts
          if (t === '[object Object]' || t.charAt(0) === '[' || t.charAt(0) === '{') return '';
          return t;
        }
        var _descStr = _descSanitize(a.description)
                    || _descSanitize(a.shortBio)
                    || _descSanitize(a.bio && a.bio.fr)
                    || '';
        var raw = _descStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!raw) return '';
        return '<p class="pvc-desc-v3b">' + _esc(raw) + '</p>';
      })() +

      /* ── V3B: Two compact trust rows ─────────────────────────────────────
       * Row 1: Profil référencé sur FIXEO (neutral listing/directory signal).
       * Row 2: Paiement après intervention (platform-level payment truth).
       * No pill, no border, no background, no verification implication.
       * Verified gate kept separately: if isVer, shows "Vérifié FIXEO" badge
       * above; these two rows are always present regardless of verified state.
       * flex-direction:column — guaranteed no horizontal overflow at any width.
       * trust.scrollWidth <= trust.clientWidth validated in V3A.3 at all vp.
       * ─────────────────────────────────────────────────────────────────── */
      /* V3B2: Inline SVG icons replace platform-dependent emoji.
       * SVG: 14×14px, currentColor, aria-hidden="true".
       * Icon 1 (list/directory): neutral listing/profile signal — no shield, no checkmark.
       * Icon 2 (payment): abstract coin+arrow — no handshake (colour emoji inconsistency).
       * No external library. No network request. Stable across iPhone/Samsung/Windows. */
      '<div class="pvc-trust-v3b" role="list">' +
        '<span class="pvc-trust-v3b-item" role="listitem">' +
          /* Directory/listing icon — neutral document lines */
          '<span class="pvc-trust-v3b-icon">' +
            '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
              '<rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
              '<line x1="4.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
              '<line x1="4.5" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
              '<line x1="4.5" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
            '</svg>' +
          '</span>' +
          'Profil r\u00e9f\u00e9renc\u00e9 sur FIXEO' +
        '</span>' +
        '<span class="pvc-trust-v3b-item" role="listitem">' +
          /* Payment icon — coin with upward arrow */
          '<span class="pvc-trust-v3b-icon">' +
            '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
              '<circle cx="7" cy="7.5" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
              '<path d="M7 4.5 L7 2 M7 2 L5.5 3.5 M7 2 L8.5 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<line x1="5.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
            '</svg>' +
          '</span>' +
          'Paiement apr\u00e8s intervention' +
        '</span>' +
      '</div>' +

      /* ── V3B: Action area (margin-top:auto anchors price+CTA to bottom) ──
       * Contains: sep divider → price block → primary CTA → secondary link.
       * margin-top:auto on .pvc-action-v3b absorbs all surplus vertical space
       * regardless of how much content the card above contains.
       * This guarantees CTA vertical alignment across all 6 card states.
       * ─────────────────────────────────────────────────────────────────── */
      '<div class="pvc-action-v3b">' +
        '<div class="pvc-divider pvc-divider-v3b"></div>' +
        /* v2a: single price message — label/amount/hint column */
        '<div class="pvc-price-block pvc-price-v3b">' +
          '<div class="pvc-price-amount">' + _esc(pricing.main) + '</div>' +
          '<span class="pvc-price-from">' + _esc(pricing.hint) + '</span>' +
        '</div>' +
        '<button class="pvc-btn-reserve-v2 fhp-btn-reserve pvc-btn-v3b" type="button"' +
          ' aria-label="R\u00e9server ' + _esc(a.name) + ', ' + _esc(catLbl) + '">' +
          'R\u00e9server maintenant \u2192' +
        '</button>' +
        /* v2a: semantic anchor — href valid without JS */
        '<a class="pvc-profile-link fhp-btn-profile pvc-profile-v3b"' +
          ' href="artisan-profile.html?id=' + encodeURIComponent(String(a.id)) + '"' +
          ' aria-label="Voir le profil complet de ' + _esc(a.name) + '">' +
          'Voir le profil complet \u203a' +
        '</a>' +
      '</div>' +

    '</article>';
  }

  /* esc helper for v2 */
  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ── Avatar staged fallback helper (fxhome-artisans-v2b1.1) ──────────────
   * Called by inline onerror="_fxAvStage(this)" on every avatar <img>.
   *
   * Stage machine driven by data-avatar-type + data-webp + data-png:
   *
   *   "real-photo"  + data-webp present  → load WebP  (stage 2)
   *   "real-photo"  + data-webp empty    → silhouette (stage 4)
   *   "illustrative-metier" + current src is data-webp (or data-webp empty)
   *                          + data-png present        → load PNG (stage 3)
   *   "illustrative-metier" + PNG already tried        → silhouette (stage 4)
   *
   * Exposed on window so inline onerror attributes can reach it.
   * Name is intentionally short and collision-resistant (_fxAvStage).
   * ──────────────────────────────────────────────────────────────────────── */
  function _avatarSetStage(img) {
    if (!img) return;
    /* Prevent any future onerror re-entry before we reassign src */
    img.onerror = null;

    var type = img.getAttribute('data-avatar-type') || '';
    var webp = img.getAttribute('data-webp') || '';
    var png  = img.getAttribute('data-png')  || '';
    var altM = img.getAttribute('data-alt-metier') || '';

    var container = img.parentNode;
    var sb = container && container.querySelector('.pvc-avatar-silhouette');

    /* Update data-avatar-state on container — CSS gates visibility per state. */
    function _setState(state) {
      if (container && container.setAttribute) {
        container.setAttribute('data-avatar-state', state);
      }
    }

    function _showSilhouette() {
      _setState('silhouette');
      img.style.display = 'none';
      img.removeAttribute('alt');
      /* Silhouette span needs no explicit show — CSS state gate handles it. */
    }

    if (type === 'real-photo') {
      /* Stage 1 failed → try WebP (stage 2) */
      if (webp) {
        img.setAttribute('data-avatar-type', 'illustrative-metier');
        img.setAttribute('alt', altM);
        _setState('illustrative-metier');
        img.onerror = function() { _avatarSetStage(img); };
        img.src = webp;
        /* Clear data-webp so next onerror knows WebP already tried */
        img.setAttribute('data-webp', '');
      } else {
        _showSilhouette();
      }
    } else if (type === 'illustrative-metier') {
      /* Stage 2 (WebP) failed → try PNG (stage 3) */
      if (png && img.src.indexOf(png) === -1) {
        /* State stays "illustrative-metier" — still showing métier avatar */
        img.onerror = function() { _avatarSetStage(img); };
        img.src = png;
        /* Clear data-png so next onerror knows PNG already tried */
        img.setAttribute('data-png', '');
      } else {
        /* Stage 3 (PNG) failed → silhouette (stage 4) */
        _showSilhouette();
      }
    } else {
      _showSilhouette();
    }
  }

  /* Expose on window for inline onerror access */
  window._fxAvStage = _avatarSetStage;

  /* ── Actions ── */
  function _doReserve(a) {
    if (!a) return;
    if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
      window.FixeoReservation.open(a, false);
    } else if (window.FixeoReservation && typeof window.FixeoReservation.openBooking === 'function') {
      window.FixeoReservation.openBooking(a.id);
    } else if (typeof window.openBookingModal === 'function') {
      window.openBookingModal(a.id);
    } else if (typeof window.openModal === 'function') {
      window.openModal('booking-modal');
    }
  }

  /* fxhome-profile-link-compare-bug-v1: ensure comparator-bar is hidden
     when navigating to a profile. Guards against BFCache restore on iOS Safari
     and any accidental addToCompare call that might have fired before navigation. */
  function _guardComparatorBar() {
    var bar = document.querySelector('.comparator-bar');
    if (!bar) return;
    /* Only hide if comparison is genuinely empty (no user-selected artisans) */
    var list = window.searchEngine && Array.isArray(window.searchEngine.compareList)
      ? window.searchEngine.compareList : [];
    if (list.length === 0) {
      bar.classList.remove('visible');
    }
  }

  function _doProfile(a) {
    if (!a) return;
    /* Guard: ensure comparison bar stays hidden during profile navigation */
    _guardComparatorBar();
    if (window.FixeoPublicProfileLinks && typeof window.FixeoPublicProfileLinks.openBySourceId === 'function') {
      window.FixeoPublicProfileLinks.openBySourceId(String(a.id));
    } else {
      window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(String(a.id));
    }
  }

  /* ── Event delegation on the grid ── */
  function _bindGridDelegation(pg) {
    pg.addEventListener('click', function(e) {
      /* Stop propagation up to artisans-section container (prevents any overlay blocks) */
      e.stopPropagation();

      /* Find the card */
      var card = e.target.closest('.fhp-card');
      if (!card) return;

      /* Parse artisan data from attribute */
      var a = null;
      try { a = JSON.parse(card.getAttribute('data-artisan').replace(/&#39;/g,"'")); } catch(_) {}
      if (!a) { a = { id: card.getAttribute('data-artisan-id') }; }

      /* Delegate to correct action */
      if (e.target.closest('.fhp-btn-reserve')) {
        e.preventDefault();
        _doReserve(a);
      } else if (e.target.closest('.fhp-btn-profile')) {
        /* v2a: <a> — modified clicks (Ctrl/Cmd/Shift/middle) open new tab naturally */
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          _doProfile(a);
        }
      } else {
        /* pf-nav: Whole-card click → public profile (reserve button handles booking) */
        e.preventDefault();
        _doProfile(a);
      }
    });

    /* Keyboard: Enter/Space on card */
    pg.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.fhp-card');
      if (!card) return;
      e.preventDefault();
      var a = null;
      try { a = JSON.parse(card.getAttribute('data-artisan').replace(/&#39;/g,"'")); } catch(_) {}
      if (!a) a = { id: card.getAttribute('data-artisan-id') };
      /* pf-nav: keyboard card activation → public profile */
      _doProfile(a);
    });
  }

  /* _buildHeader (v1a2-int1) — V1A.2 section header.
   * resultMode: 'unfiltered'|'exact'|'city_only'|'category_fallback'|'network_fallback'
   * Counter = window.ARTISANS.length (total profiles, never availability count).
   * HTML structure: fxas-* — styled by css/fixeo-artisan-section-v1.css.
   * City source: _getFilterContext().city || window.FIXEO_DETECTED_CITY (unchanged).
   * Count source: window.ARTISANS.length (unchanged). */
  function _buildHeader(total, filteredCount, resultMode) {
    var artisans      = window.ARTISANS || [];
    var totalProfiles = artisans.length || total || 0;
    var ctx           = _getFilterContext ? _getFilterContext() : {};
    var _cityName     = ctx.city || (typeof window.FIXEO_DETECTED_CITY === 'string' ? window.FIXEO_DETECTED_CITY : '') || '';
    var _catLabel     = ctx.service ? (CAT_LABELS[ctx.service.toLowerCase()] || ctx.service) : '';
    var mode          = resultMode || 'unfiltered';

    /* v2a.1: title matrix (unchanged logic)
     * city + category  → "Des artisans référencés à [CITY]"
     * city only        → "Des artisans référencés à [CITY]"
     * category only    → "Des artisans référencés sur FIXEO"
     * no filter        → "Des artisans référencés sur FIXEO" */
    var _titleText;
    var _cityEmText; /* city portion for <em> highlight */
    if (_cityName) {
      _titleText   = 'Des artisans r\u00e9f\u00e9renc\u00e9s \u00e0\u00a0';
      _cityEmText  = _cityName;
    } else {
      _titleText   = 'Des artisans r\u00e9f\u00e9renc\u00e9s sur FIXEO';
      _cityEmText  = '';
    }

    /* Subtitle — approved V1A.2 fixed copy (honest, no availability implication) */
    var _subtitleText = 'Explorez les profils r\u00e9f\u00e9renc\u00e9s dans votre ville et r\u00e9servez directement.';

    /* Count — 5B: durable rounded-count doctrine (mirrors 4D.1 + 5A.2).
     * Was: Intl.NumberFormat('fr-FR').format(totalProfiles) → "1 302"
     * Now: "+1 300" — stable across data updates; applied in ALL resultModes.
     * _updateNetworkCount() is a no-op (targets static span that no longer exists);
     * this is the sole authoritative counter writer for the discovery section. */
    var _countNumber = '+1\u202f300';
    var _countLabel  = 'profils artisans r\u00e9f\u00e9renc\u00e9s sur FIXEO';

    /* Title HTML — city in <em> for gradient highlight when city is known */
    var _titleHtml = _cityEmText
      ? _esc(_titleText) + '<em>' + _esc(_cityEmText) + '</em>'
      : _esc(_titleText);

    var el = _$(HEADER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = HEADER_ID;
      el.className = 'fhp-section-header';
      var pg = _$(GRID_ID);
      if (pg && pg.parentNode) pg.parentNode.insertBefore(el, pg);
    }

    /* V1A.2 header structure:
     * Left column (fhp-header-copy): eyebrow + h2 + subtitle
     * Right column (fhp-see-all > fhp-counter): stacked proof block
     * CSS: fixeo-artisan-section-v1.css overrides old fhp-* styles */
    el.innerHTML =
      '<div class="fhp-header-copy">' +
        '<span class="fhp-eyebrow" aria-hidden="true">LE R\u00c9SEAU FIXEO</span>' +
        '<h2 class="fhp-title" id="fxas-title">' + _titleHtml + '</h2>' +
        '<p class="fhp-subtitle">' + _esc(_subtitleText) + '</p>' +
      '</div>' +
      /* fhp-see-all retained as counter wrapper (CSS removes arrow, reshapes to block) */
      '<a class="fhp-see-all" href="artisans.html" aria-label="' + _esc(_countNumber + '\u00a0' + _countLabel) + '">' +
        '<span class="fhp-counter" aria-hidden="true">' +
          '<span class="fhp-counter-number">' + _esc(_countNumber) + '</span>' +
          '<span class="fhp-counter-label">' + _esc(_countLabel) + '</span>' +
        '</span>' +
        '<span class="fhp-see-all-arrow" aria-hidden="true">\u2192</span>' +
      '</a>';
    var networkFilter = document.getElementById('fhp-network-trade-wrap');

if (networkFilter && el.parentNode) {
  el.parentNode.insertBefore(networkFilter, el.nextSibling);
 }
  }

  /* ── K-2: City explore strip ──────────────────────────────────────────
   * Injected below the carousel grid. Shows adjacent + key national cities
   * as lightweight tappable chips. Clicking a chip re-renders the grid for
   * that city, allowing seamless marketplace exploration without full search.
   *
   * Philosophy:
   *   - Premium / app-like — NOT an annuaire / SEO footer
   *   - Adjacent cities first (regional intelligence), then national hubs
   *   - Chips are sorted: adjacent (if geo known) → remaining FIXEO_CITIES
   *   - Active city chip highlighted — shows user current city context
   *   - Mobile: horizontal scroll, snap; Desktop: centered inline wrap
   *   - Idempotency: element recreated each render (innerHTML-replaced)
   *   - Fallback: if geo unknown, shows all 12 FIXEO_CITIES in default order
   * ─────────────────────────────────────────────────────────────────── */
  var _ZONES = (window.FixeoMatchingEngine && window.FixeoMatchingEngine.ZONES_ADJACENTES) || {
    'Casablanca':['Mohammedia','Berrechid','El Jadida'],
    'Rabat':['Sal\u00e9','Temara','K\u00e9nitra'],
    'Marrakech':['Safi','Agadir'],
    'Tanger':['T\u00e9touan'],
    'F\u00e8s':['Mekn\u00e8s'],
    'Agadir':['Safi','Marrakech'],
    'Mekn\u00e8s':['F\u00e8s'],
    'T\u00e9touan':['Tanger'],
    'Oujda':[],
    'K\u00e9nitra':['Rabat','Sal\u00e9'],
    'Safi':[],
    'El Jadida':['Casablanca'],
  };

  var _ALL_CITIES = (window.FIXEO_CITIES && window.FIXEO_CITIES.length)
    ? window.FIXEO_CITIES
    : ['Casablanca','Rabat','Marrakech','F\u00e8s','Agadir','Tanger','Mekn\u00e8s','Oujda','K\u00e9nitra','T\u00e9touan','Safi','El Jadida'];

  /* ── V1A.2: Section continuation actions ──────────────────────────────
   * Injected below the carousel/grid. Two actions:
   * 1. Primary ghost button: "Voir plus d'artisans à [Ville] →"
   *    → href="artisans.html" (canonical artisans directory)
   * 2. Secondary: "Publier une demande →"
   *    → data-open-request-form="true" (canonical RAFI V5 handler, unchanged)
   * Idempotent: element replaced each render.
   * CSS: .fxas-actions in fixeo-artisan-section-v1.css.
   * City source: same as _buildHeader — ctx.city || FIXEO_DETECTED_CITY.
   * ─────────────────────────────────────────────────────────────────── */
  function _buildSectionActions(ctx) {
    var cityName = (ctx && ctx.city) || (typeof window.FIXEO_DETECTED_CITY === 'string' ? window.FIXEO_DETECTED_CITY : '') || '';

    /* Primary label */
    var moreLabel = cityName
      ? 'Voir plus d\u2019artisans \u00e0\u00a0' + _esc(cityName) + '\u00a0\u2192'
      : 'Voir plus d\u2019artisans \u2192';

    /* ── PHASE 6B.1: Build context-aware directory URL ──────────────────
     * Serialize available city + trade into ?ville=&metier= query params.
     * City: _sanitizeCityDisplay() strips emoji/suffixes → slug via NFD.
     * Trade: ctx.service (already a clean lowercase slug, e.g. 'plomberie').
     * Both values are URL-encoded. Falls back to plain artisans.html if none.
     * 0 changes to search/RAFI/booking logic — only the href is updated. */
    var _dirCity  = _sanitizeCityDisplay(cityName);
    var _dirTrade = ctx && ctx.service ? ctx.service.toLowerCase().trim() : '';
    var _dirHref  = 'artisans.html';
    if (_dirCity || _dirTrade) {
      var _dirParams = [];
      if (_dirCity) {
        /* Slugify: NFD decompose + strip diacritics + lowercase + spaces→hyphens */
        var _slug = _dirCity;
        if (_slug.normalize) _slug = _slug.normalize('NFD');
        _slug = _slug.replace(/[\u0300-\u036f]/g, '').toLowerCase()
                     .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').trim();
        if (_slug) _dirParams.push('ville=' + encodeURIComponent(_slug));
      }
      if (_dirTrade) _dirParams.push('metier=' + encodeURIComponent(_dirTrade));
      if (_dirParams.length) _dirHref = 'artisans.html?' + _dirParams.join('&');
    }

    /* Anchor element — href to artisans.html with context params */
    var actionsHtml =
      '<a class="fxas-btn-more" href="' + _dirHref + '" aria-label="' +
        (cityName ? 'Voir plus d\u2019artisans \u00e0 ' + _esc(cityName) : 'Voir plus d\u2019artisans') +
      '">' +
     moreLabel +
'</a>';

    /* Create or reuse element — appended after the grid's parent node children */
    var el = _$(ACTIONS_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ACTIONS_ID;
      el.className = 'fxas-actions';
      /* Insert after the explore strip or grid — into the section shell */
      var shell = document.querySelector('#' + SECTION_ID + ' .results-main-column') ||
                  document.querySelector('#' + SECTION_ID + ' .results-page-shell');
      if (shell) shell.appendChild(el);
    }
    el.innerHTML = actionsHtml;
  }

  function _buildExploreStrip(ctx) {
    var pg = _$(GRID_ID);
    if (!pg || !pg.parentNode) return;

    var detectedCity = ctx.city || (typeof window.FIXEO_DETECTED_CITY === 'string' ? window.FIXEO_DETECTED_CITY : '') || '';
    var activeCity   = detectedCity;

    /* Build ordered city list: adjacent first, then remaining */
    var adjacent = detectedCity ? (_ZONES[detectedCity] || []) : [];
    var ordered  = [];
    /* Adjacent cities always come first */
    adjacent.forEach(function(c) { if (ordered.indexOf(c) === -1) ordered.push(c); });
    /* Then remaining FIXEO_CITIES (excluding active + already added) */
    _ALL_CITIES.forEach(function(c) {
      if (c !== activeCity && ordered.indexOf(c) === -1) ordered.push(c);
    });

    /* Limit to 8 chips (readability) */
    var chips = ordered.slice(0, 8);
    if (!chips.length) return; /* nothing to show */

    /* Build HTML */
    var html = '<div class="fhp-explore-label">Explorer</div>';
    html += chips.map(function(city) {
      var isAdj = adjacent.indexOf(city) !== -1;
      return '<button class="fhp-explore-chip' + (isAdj ? ' fhp-explore-adj' : '') + '" data-explore-city="' + city + '" type="button" aria-label="Voir les artisans \u00e0 ' + city + '">' + city + '</button>';
    }).join('');

    /* Inject or update strip */
    var strip = _$(EXPLORE_ID);
    if (!strip) {
      strip = document.createElement('div');
      strip.id = EXPLORE_ID;
      strip.className = 'fhp-explore-strip';
      pg.parentNode.insertBefore(strip, pg.nextSibling);
    }
    strip.innerHTML = html;

    /* Chip click — update city context and re-render */
    strip.querySelectorAll('.fhp-explore-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var city = btn.getAttribute('data-explore-city');
        if (!city) return;
        /* Write to filter-city (P2) so it beats geo P3 */
        var fc = document.getElementById('filter-city');
        if (fc) fc.value = city;
        /* Also expose as global geo so _buildHeader reads it */
        try { window.FIXEO_DETECTED_CITY = city; } catch(e) {}
        _renderPremiumGrid();
      });
    });
  }

  
 /* ── Render premium grid ── */
function _getOrCreateGrid() {
  var mainCol = _q('#'+SECTION_ID+' .results-main-column');
  var shell   = _q('#'+SECTION_ID+' .results-page-shell');
  var anchor  = mainCol || shell;

  /* Homepage network trade filter */
  var filterWrap = document.getElementById('fhp-network-trade-wrap');

  if (!filterWrap && anchor) {
    filterWrap = document.createElement('div');
    filterWrap.id = 'fhp-network-trade-wrap';
    filterWrap.className = 'fhp-network-filter';

    filterWrap.innerHTML = `
      <label for="fhp-network-trade" class="fhp-network-filter-label">
        Métier
      </label>

      <select id="fhp-network-trade" class="fhp-network-trade">
        <option value="">Tous les métiers</option>
        <option value="plomberie">Plomberie</option>
        <option value="electricite">Électricité</option>
        <option value="peinture">Peinture</option>
        <option value="menuiserie">Menuiserie</option>
        <option value="climatisation">Climatisation</option>
        <option value="maconnerie">Maçonnerie</option>
        <option value="serrurerie">Serrurerie</option>
        <option value="nettoyage">Nettoyage</option>
        <option value="jardinage">Jardinage</option>
        <option value="bricolage">Bricolage</option>
      </select>
    `;
var tradeSelect = filterWrap.querySelector('#fhp-network-trade');

/* Sync initial visible métier with the canonical hidden marketplace filter.
   RAFI may have selected the category before this control was created. */
if (tradeSelect) {
  var initialCategory = document.getElementById('filter-category');
  var initialTradeValue = initialCategory ? (initialCategory.value || '') : '';

  if (
    Array.from(tradeSelect.options).some(function (option) {
      return option.value === initialTradeValue;
    })
  ) {
    tradeSelect.value = initialTradeValue;
  }
}
    
if (tradeSelect) {
  tradeSelect.addEventListener('change', function () {
    var hiddenCategory = document.getElementById('filter-category');
    if (!hiddenCategory) return;

    hiddenCategory.value = tradeSelect.value || '';
    hiddenCategory.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
    anchor.insertBefore(filterWrap, anchor.firstChild);
  }

  var pg = _$(GRID_ID);
  if (pg) return pg;

  pg = document.createElement('div');
  pg.id = GRID_ID;
  pg.className = 'ssb2-vedette-grid fhp-grid';
  pg.setAttribute('aria-label','Profils artisans référencés sur FIXEO');

  if (anchor) {
    if (filterWrap) {
      anchor.insertBefore(pg, filterWrap.nextSibling);
    } else {
      anchor.insertBefore(pg, anchor.firstChild);
    }
  }

  _bindGridDelegation(pg);
  return pg;
}

  function _renderPremiumGrid() {
    var fullList = window.ARTISANS || [];
    if (!fullList.length) { setTimeout(_renderPremiumGrid, 500); return; }

    // Use SearchEngine filtered results when filters/search are active
    var ctx = _getFilterContext();
    var hasFilters = !!(ctx.city || ctx.service || ctx.query);
    var list;
    if (hasFilters && window.searchEngine) {
      var seState = { query: ctx.query, category: ctx.service, city: ctx.city, sortBy: 'rating', availability: '', minRating: 0, maxPrice: 0, verifiedOnly: false };
      list = window.searchEngine.filter(seState);
    } else {
      list = fullList;
    }
    /* v2a: Fallback hierarchy + explicit result-mode tracking for truthful subtitle */
    var resultMode;
    if (!hasFilters) {
      resultMode = 'unfiltered';
    } else if (list.length) {
      if (ctx.city && ctx.service) {
        resultMode = 'exact';
      } else if (ctx.city) {
        resultMode = 'city_only';
      } else {
        resultMode = 'exact';
      }
    }

    if (!list.length && hasFilters) {
      if (ctx.city && ctx.service) {
        var seStateCat = { query: ctx.query, category: ctx.service, city: '', sortBy: 'rating', availability: '', minRating: 0, maxPrice: 0, verifiedOnly: false };
        var catResults = window.searchEngine ? window.searchEngine.filter(seStateCat) : [];
        if (catResults.length) {
          list = catResults;
          resultMode = 'category_fallback';
        } else {
          list = fullList;
          resultMode = 'network_fallback';
        }
      } else {
        list = fullList;
        resultMode = 'network_fallback';
      }
    }

    var pg = _getOrCreateGrid();

    /* v2a: _buildCard() is the CANONICAL homepage artisan card renderer.
     * SecondarySearch.renderVedetteCard is dead code (not exported at runtime).
     * Permanently bypassed. Do not re-introduce without a full markup audit. */
    var sorted = _sortList(list, ctx).slice(0, MAX_CARDS);
    pg.innerHTML = sorted.map(_buildCard).join('');
    /* Signal sections-ready immediately after innerHTML so anti-FOUC CSS resolves
       in the same paint frame — do NOT defer this to rAF. */
    document.body.classList.add('fixeo-sections-ready');

    /* 3C: defer delegation re-bind + querySelectorAll to next rAF.
       These are click-handler bindings — they have zero first-paint impact.
       Moving them out of the synchronous innerHTML path saves ~40-80ms on slow CPUs. */
    requestAnimationFrame(function() {
      pg.removeEventListener('click', pg._fhpDelegate);
      _bindGridDelegation(pg);

      /* v2a: SecondarySearch post-render class reassignment removed (dead code). */

      _buildHeader(list.length, sorted.length, resultMode);
      _buildExploreStrip(ctx);        /* K-2: city exploration strip below carousel */
      _buildSectionActions(ctx);      /* V1A.2: continuation actions below grid */
      _updateNetworkCount();          /* fxpaf-v1: live network count in proof section */
      _triggerFadeIn(pg);
    });
  }

  /* ── fxpaf-v1: Network count update ──
   * Updates #fxpaf-network-count with total window.ARTISANS.length.
   * Fires on every _renderPremiumGrid call (initial load + filter changes).
   * No new globals. No DOM creation. Read-only except the one span. */
  function _updateNetworkCount() {
    /* 5A.2: durable rounded-count doctrine — mirrors services.html 4D.1.
     * Was: Intl.NumberFormat(ARTISANS.length) → "1 302 profils référencés"
     * Now: "+1 300 profils artisans référencés sur FIXEO" (stable rounded figure).
     * Rationale: exact count changes as profiles are added; rounded "+1 300"
     * remains accurate and consistent across all page surfaces. */
    var el = document.getElementById('fxpaf-network-count');
    if (!el) return;
    var total = (window.ARTISANS || []).length;
    if (!total) return;
    el.textContent = '+1\u202f300\u00a0profils artisans r\u00e9f\u00e9renc\u00e9s sur FIXEO';
  }

  /* ── Fade-in animation ── */
  function _triggerFadeIn(pg) {
    var cards = pg.querySelectorAll('.pvc-card, .fhp-card');
    /* 3A-4: was N individual setTimeouts (one per card, up to 30 timers on main thread).
       Now: set animationDelay inline (CSS handles the visual stagger), then apply
       fhp-visible to ALL cards in one requestAnimationFrame — single paint cycle. */
    cards.forEach(function(card, i) {
      card.classList.remove('fhp-visible');
      card.style.animationDelay = (i * 80) + 'ms';
    });
    requestAnimationFrame(function() {
      cards.forEach(function(card) { card.classList.add('fhp-visible'); });
    });
  }

  /* ── Hide / Show old layout chrome ── */
  var OLD_IDS = ['loading-artisans','no-artisan','other-artisans-banner','other-see-more-wrap','edit-results-search-btn']; /* artisans-container always hidden — vedette is the card UI */
  var OLD_SELS = ['#'+SECTION_ID+' .results-header','#'+SECTION_ID+' .results-filters','#'+SECTION_ID+' .results-toolbar','#'+SECTION_ID+' .results-trust-strip'];

  function _hideResultsChrome() {
    OLD_IDS.forEach(function(id){ _hide(_$(id)); });
    OLD_SELS.forEach(function(sel){ _hide(_q(sel)); });
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  layout.style.setProperty('display','block','important');
    if (mainCol) { mainCol.style.setProperty('width','100%','important'); mainCol.style.setProperty('max-width','100%','important'); }
    document.body.classList.add('fixeo-homepage-mode');
  }

  function _showResultsChrome() {
    /* V2-C6F-hp: Never show legacy #loading-artisans or #no-artisan when entering
     * search mode. The vedette grid (#fixeo-homepage-vedette-grid) is the results UI.
     * These elements belong to the old results layout — surfacing them causes the
     * "Chargement des artisans… / Aucun artisan" block to appear under recommended artisan.
     * The density module (fixeo-marketplace-density.js) then enhances #no-artisan with
     * a full glass card, compounding the visual pollution.
     * _hideResultsChrome still hides them (via OLD_IDS loop) — no change there. */
    var SHOW_SAFE_IDS = OLD_IDS.filter(function(id) {
      return id !== 'loading-artisans' && id !== 'no-artisan';
    });
    SHOW_SAFE_IDS.forEach(function(id){ _show(_$(id)); });
    OLD_SELS.forEach(function(sel){ _show(_q(sel)); });
    var layout  = _q('#'+SECTION_ID+' .results-layout');
    var mainCol = _q('#'+SECTION_ID+' .results-main-column');
    if (layout)  layout.style.removeProperty('display');
    if (mainCol) { mainCol.style.removeProperty('width'); mainCol.style.removeProperty('max-width'); }
    document.body.classList.remove('fixeo-homepage-mode');
    /* vedette grid stays visible — it IS the search results UI */
    var pg = _$(GRID_ID); if (pg) _show(pg);
    var hd = _$(HEADER_ID); if (hd) _show(hd);
    /* always keep artisans-container hidden (legacy card grid) */
    var legacyContainer = document.getElementById('artisans-container');
    if (legacyContainer) _hide(legacyContainer);
  }

  /* ── MutationObserver ── */
  function _startObserver() {
    if (_containerObserver) return;
    var target = _$(SECTION_ID);
    if (!target || !window.MutationObserver) return;
    _containerObserver = new MutationObserver(function() {
      /* 3A-3: replaced getComputedStyle(el).display (forced sync layout) with
         el.style.display — reads only inline style, no layout recalculation.
         _hide() sets display:none inline so this check is fully equivalent. */
      ['artisans-container','loading-artisans','other-see-more-wrap'].forEach(function(id){
        var el=_$(id); if(el && !el.hidden && el.style.display!=='none') _hide(el);
      });
    });
    _containerObserver.observe(target, {childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  }
  function _stopObserver() { if (_containerObserver) { _containerObserver.disconnect(); _containerObserver=null; } }

  /* ── Mode switches ── */
  /* 5B: set data-results-state on #artisans-section root.
   * CSS reacts to this attribute to suppress/restore UI zones per state.
   * States: 'discovery' | 'loading' | 'targeted'
   *
   * 5B.3: JS-level loader guard added.
   * Root cause: body.fixeo-search-mode CSS rule re-shows #loading-artisans
   * (display:revert !important) AFTER renderArtisans() hides it.
   * When state transitions to 'targeted' or 'discovery', we explicitly force
   * #loading-artisans display:none via inline style — this wins over all CSS
   * regardless of specificity because inline style beats any class/attr rule
   * (unless overridden by another !important inline, which nothing does here).
   */
  function _setResultsState(state) {
    var sec = document.getElementById(SECTION_ID);
    if (sec) sec.setAttribute('data-results-state', state);
    /* 5B.3: deterministic loader lifecycle per state.
     * targeted/discovery → force hide via inline !important (beats CSS class rules).
     * loading → remove inline override so CSS loading rule + Supabase _setLoading
     *   can control visibility normally. Without this clear, a repeat search would
     *   leave the loader permanently hidden from the previous targeted inline override. */
    var loader = document.getElementById('loading-artisans');
    if (loader) {
      if (state === 'targeted' || state === 'discovery') {
        loader.style.setProperty('display', 'none', 'important');
      } else if (state === 'loading') {
        loader.style.removeProperty('display'); /* restore CSS control */
      }
    }
  }

  /* ── 5B.2: City display sanitiser (display-only, never writes localStorage)
   * Mirrors Phase 4C.1 _sanitizeCity() doctrine from fxsvc-4c-v1.js.
   * Input: raw value from localStorage / filter element (may contain emoji,
   *   neighbourhood suffix, "· Modifier", "détecté/e").
   * Output: clean city name for display in #fxasb-city, e.g. "Casablanca".
   */
  function _sanitizeCityDisplay(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    /* Strip leading pin emoji (📍) */
    s = s.replace(/^📍\s*/u, '');
    /* Remove "· Modifier" suffix (raw · or &middot;) */
    s = s.replace(/\s*[·•]\s*Modifier\b.*/i, '');
    /* Remove neighbourhood suffix: "— something détecté/e" or " — something" */
    s = s.replace(/\s*—\s*.+$/u, '');
    /* Remove trailing "détecté" / "détectée" words */
    s = s.replace(/\s+d[ée]tect[ée]e?\b/gi, '');
    /* Reject placeholder/status strings */
    var REJECT = ['votre ville', 'ville', 'localisation', 'détectée', 'détecté', 'en cours'];
    var low = s.toLowerCase();
    for (var i = 0; i < REJECT.length; i++) {
      if (low === REJECT[i]) return '';
    }
    /* Final trim */
    return s.trim();
  }

  /* ── 5B.2: Canonical targeted-header activator.
   * Populates and shows #fxasb-header (built by fx-situation-results-bridge-v1.js).
   * Called by: _enterSearchMode (search-button path) + situation-chip path.
   * cat: category slug (e.g. 'plomberie'); city: raw display string.
   * Bridge is frozen — this function manipulates its already-built DOM directly.
   */
  function _fxasbActivate(cat, city) {
    var header  = document.getElementById('fxasb-header');
    var secTitle = document.getElementById('fxasb-section-title');
    if (!header) return; /* bridge not yet initialised — safe no-op */

    /* Resolve category metadata; fall back to generic if unknown */
    var meta = (CAT_LABELS[cat] && CAT_ICONS[cat])
      ? { icon: CAT_ICONS[cat], label: CAT_LABELS[cat] }
      : null;

    if (!meta && (!cat || cat === 'all')) {
      /* No specific category — hide targeted header */
      _fxasbHide();
      return;
    }

    /* Clean city for display */
    var cleanCity = _sanitizeCityDisplay(city);

    /* Update content slots */
    var iconEl = document.getElementById('fxasb-icon');
    var nameEl = document.getElementById('fxasb-name');
    var cityEl = document.getElementById('fxasb-city');

    if (iconEl) iconEl.textContent = meta ? meta.icon : '';
    if (nameEl) nameEl.textContent = meta ? meta.label : (cat || '');
    if (cityEl) {
      cityEl.textContent = cleanCity || '';
      cityEl.style.display = cleanCity ? '' : 'none';
    }

    /* Accessible label */
    if (meta) {
      header.setAttribute('aria-label',
        'Besoin identifié\u202f: ' + meta.label + (cleanCity ? ' à ' + cleanCity : ''));
    }

    /* Show — two-step for CSS transition */
    header.style.display = 'flex';
    header.offsetHeight; /* force reflow */
    header.classList.add('fxasb-visible');
    if (secTitle) secTitle.classList.add('fxasb-shown');
  }

  /* ── 5B.2: Hide targeted header (called on return to discovery) */
  function _fxasbHide() {
    var header   = document.getElementById('fxasb-header');
    var secTitle = document.getElementById('fxasb-section-title');
    if (!header) return;
    header.classList.remove('fxasb-visible');
    if (secTitle) secTitle.classList.remove('fxasb-shown');
    /* Delay display:none until transition completes */
    setTimeout(function() {
      if (!header.classList.contains('fxasb-visible')) {
        header.style.display = 'none';
      }
    }, 260);
  }

  /* ── 5B.2: Read active category from filter elements */
  function _getActiveCat() {
    var catEl = document.getElementById('filter-category')
             || document.getElementById('ssb2-select-cat');
    return (catEl && catEl.value) ? catEl.value : '';
  }

  /* ── 5B.2: Read city from filter elements + localStorage fallback */
  function _getActiveCity() {
    var cityEl = document.getElementById('filter-city')
              || document.getElementById('ssb2-select-city')
              || document.getElementById('services-city-filter');
    if (cityEl && cityEl.value && cityEl.value.trim()) return cityEl.value.trim();
    try { return localStorage.getItem('fixeo_detected_city') || ''; } catch(e) { return ''; }
  }

  function _enterHomepageMode() {
    _searchActive = false;
    document.body.classList.remove('fixeo-search-mode');
    document.body.classList.remove('fixeo-hero-search-mode'); /* clear hero-search suppression */
    _setResultsState('discovery'); /* 5B: restore discovery visuals */
    _fxasbHide(); /* 5B.2: clear targeted header on return to discovery */
    // Restore any hero-mode JS-hidden elements
    (function _restoreHeroHidden() {
      var toRestore = [
        document.querySelector('#artisans-section .results-header'),
        document.querySelector('#artisans-section .results-toolbar'),
        document.getElementById('fixeo-premium-filters-extra'),
        document.getElementById('other-artisans-banner'),
      ];
      toRestore.forEach(function(el) {
        if (el) el.style.removeProperty('display');
      });
    })();
    _hideResultsChrome();
    _renderPremiumGrid();
    _startObserver();
  }
  function _enterSearchMode() {
    _searchActive = true;
    _stopObserver();
    document.body.classList.add('fixeo-search-mode');
    document.body.classList.add('fixeo-sections-ready'); /* keep sections visible */
    _setResultsState('loading'); /* 5B: loading before results arrive */
    _showResultsChrome();
    // Refresh vedette with current filter context, then activate targeted header
    setTimeout(function() {
      _renderPremiumGrid();
      _setResultsState('targeted'); /* 5B: targeted after render cycle */
      /* 5B.2: populate bridge targeted header with current category + city.
       * Reads filter-category (set by secondary-search _syncBackground before
       * _enterSearchMode fires) and city from filter-city / localStorage. */
      _fxasbActivate(_getActiveCat(), _getActiveCity());
    }, 50);
  }

  /* ── Patch renderArtisans ── */
  function _patchRender() {
    if (typeof window.renderArtisans !== 'function') { setTimeout(_patchRender,200); return; }
    if (_installed) return;
    _installed = true;
    _originalRenderArtisans = window.renderArtisans;
    window.renderArtisans = function(list, options) {
      _originalRenderArtisans(list, options);
      if (!_searchActive) {
        _hide(_$('artisans-container'));
        _hide(_$('loading-artisans'));
        _hide(_$('other-see-more-wrap'));
      }
    };
    window.renderArtisans._original  = _originalRenderArtisans;
    window.renderArtisans._isPremium = true;
  }

  /* ── Detect search active ── */
  function _isSearchActive() {
    var ids=['search-input','ssb2-input-nlp'];
    var sels=['filter-category','filter-city','filter-availability','ssb2-select-cat','ssb2-select-city'];
    for(var i=0;i<ids.length;i++){var e=_$(ids[i]);if(e&&e.value.trim())return true;}
    for(var j=0;j<sels.length;j++){var e2=_$(sels[j]);if(e2&&e2.value)return true;}
    return false;
  }

  /* ── Bind global events ── */
  function _bindEvents() {
    function _onSearch(){ if(_isSearchActive()) _enterSearchMode(); }

    // Refresh vedette grid when filters change (even in homepage mode)
    function _onFilterChange() {
      if (!_searchActive) {
        // In homepage mode: update vedette grid with filtered artisans
        _renderPremiumGrid();
      }
    }
    ['filter-city','filter-category','services-city-filter','ssb2-select-city','ssb2-select-cat'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', _onFilterChange);
    });
    // Also refresh when marketplace artisans are updated
    window.addEventListener('fixeo:marketplace-artisans-updated', function(){
      setTimeout(_renderPremiumGrid, 150);
    });
    ['ssb2-btn-search','hero-search-btn','ssb2-btn-search-mobile'].forEach(function(id){
      var el=_$(id); if(el) el.addEventListener('click',_onSearch);
    });
    _qa('.filter-chip,.ssb2-qfilter,.qf-btn').forEach(function(el){
      el.addEventListener('click',function(){ _enterSearchMode(); });
    });
    ['search-input','ssb2-input-nlp'].forEach(function(id){
      var el=_$(id);
      if(el) el.addEventListener('input',function(){ if(el.value.trim()) _enterSearchMode(); });
    });
    var resetBtn = _$('results-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click',function(){
        setTimeout(function(){ if(!_isSearchActive()) _enterHomepageMode(); },150);
      });
    }
    /* 5B / 5B.2: situation chip clicks → targeted state + targeted header.
     * Bridge's _updateHeader fires first (rAF, registered earlier).
     * Our rAF fires second — overwrites #fxasb-city with sanitised display value,
     * ensuring "Casablanca" not "📍 Casablanca — des Roches noires détecté · Modifier". */
    document.addEventListener('click', function(e) {
      var chip = e.target.closest('.chip[data-category]');
      if (!chip) return;
      var cat = chip.dataset.category || '';
      if (cat && cat !== 'all') {
        _setResultsState('loading');
        requestAnimationFrame(function() {
          _setResultsState('targeted');
          /* Overwrite city in bridge header with sanitised display value */
          var cityEl = document.getElementById('fxasb-city');
          if (cityEl) {
            var cleanCity = _sanitizeCityDisplay(_getActiveCity());
            cityEl.textContent = cleanCity || '';
            cityEl.style.display = cleanCity ? '' : 'none';
          }
        });
      } else if (cat === 'all') {
        _setResultsState('discovery');
        _fxasbHide();
      }
    }, { passive: true });
    /* fixeo:marketplace-artisans-updated handled in _bindEvents above */
  }

  /* ── Init ── */
  function init() {
    _enterHomepageMode();
    _patchRender();
    _bindEvents();
    /* Safety fallback: reveal sections after 1.2s max regardless of grid state.
       This guarantees how-it-works, feed, testimonials never stay hidden on slow CPUs. */
    setTimeout(function() {
      document.body.classList.add('fixeo-sections-ready');
    }, 1200);
    /* fxhome-profile-link-compare-bug-v1: initialize comparator bar as hidden.
       Guards against BFCache restore (iOS Safari) that may replay a .visible state
       from a previous session. The comparison list starts empty on every page load.
       The CSS rule in fixeo-post-artisan-flow-v1.css is the primary guard;
       this JS guard handles BFCache restore where CSS alone is insufficient. */
    (function _initComparatorBarHidden() {
      var bar = document.querySelector('.comparator-bar');
      if (bar) bar.classList.remove('visible');
    })();
    console.log('✅ Fixeo Homepage Premium Patch v4 (fhp13) ready');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* K-2: refreshIfIdle — re-render only when user hasn't started a search.
   * Called by hero-geo script after geo city resolves (250ms delay).
   * _searchActive guards against re-rendering during/after user interactions. */
  function _refreshIfIdle() {
    if (!_searchActive) { _renderPremiumGrid(); }
  }

  /* ════════════════════════════════════════════════════════
     ESTIMATOR ADAPTER — Phase 7C.9L.3O
     Exposes _buildCard for Estimator picker reuse.
     opts.estimatorMode === true:
       - Suppresses price block ("À partir de X MAD" / "Tarif renseigné")
       - Restores "Voir le profil complet" link (target=_blank — new tab preserves picker state)
       - Renames primary CTA to "Choisir cet artisan"
       - Adds data-estimator-id on article, data-estimator-select on CTA
       - No inline JS in card markup — delegated listener owns selection
     Normal homepage call (_buildCard(a, idx)) is completely unchanged.
  ════════════════════════════════════════════════════════ */
  function _buildCardEstimator(a, idx) {
    /* Build canonical card then patch estimator-specific attributes/labels */
    var html = _buildCard(a, idx);

    /* --- Suppress price block ---
     * Replace <div class="pvc-action-v3b">…</div> block with estimator version.
     * Strategy: reconstruct only the action block (always ends the article),
     * while keeping all preceding markup untouched. */

    var cat      = (a.category || a.service || '').toLowerCase();
    var catIcon  = CAT_ICONS[cat] || '🔧';
    var catLbl   = CAT_LABELS[cat] || (a.service || a.category || 'Service');
    var name     = a.name || a.full_name || 'Artisan Fixeo';
    var aid      = String(a.id || a._supabase_id || '');

    /* Estimator action block: divider + CTA + safe profile link (new tab) */
    var estimatorAction =
      '<div class="pvc-action-v3b">' +
        '<div class="pvc-divider pvc-divider-v3b"></div>' +
        '<button class="pvc-btn-reserve-v2 fhp-btn-reserve pvc-btn-v3b" type="button"' +
          ' data-estimator-select="true"' +
          ' aria-label="Choisir ' + _esc(name) + ', ' + _esc(catLbl) + '">' +
          'Choisir cet artisan' +
        '</button>' +
        '<a class="pvc-profile-link fhp-btn-profile pvc-profile-v3b"' +
          ' href="artisan-profile.html?id=' + encodeURIComponent(aid) + '&source=estimator"' +
          ' data-estimator-profile="true"' +
          ' aria-label="Voir le profil complet de ' + _esc(name) + '">' +
          'Voir le profil complet ›' +
        '</a>' +
      '</div>' +
    '</article>';

    /* Replace the action block: find opening <div class="pvc-action-v3b"> to end of article.
     * _buildCard always closes with </div>\n</article> inside the action block. */
    var actionStart = html.lastIndexOf('<div class="pvc-action-v3b">');
    if (actionStart !== -1) {
      html = html.substring(0, actionStart) + estimatorAction;
    }

    /* Add data-estimator-id to the article opening tag */
    html = html.replace(
      '<article class="pvc-card fhp-card"',
      '<article class="pvc-card fhp-card" data-estimator-id="' + _esc(aid) + '"'
    );

    return html;
  }

  window.FixeoHomepagePremium = {
    refresh:       _renderPremiumGrid,
    enterSearch:   _enterSearchMode,
    enterHomepage: _enterHomepageMode,
    refreshIfIdle: _refreshIfIdle,
    /* Phase 7C.9L.3O: exposed for Estimator picker.
     * When opts.estimatorMode is true → estimator-adapted card.
     * Otherwise → normal homepage card (backward-compatible). */
    buildCard: function(a, idx, opts) {
      if (opts && opts.estimatorMode) {
        return _buildCardEstimator(a, idx);
      }
      return _buildCard(a, idx);
    }
  };

}(window));

/* fxhome-post-artisan-flow-v1.2.1: floating-action observer removed.
 * Urgence and WhatsApp FABs are canonical frozen controls — always visible. */

(function () {
  function addFixeoNewServiceChips() {
    // Prefer the dedicated specialized container (Chapter 3 fc3-v2a);
    // fall back to first .category-chips for backward compatibility.
    const container = document.getElementById('fc3-specialized-chips') ||
                      document.querySelector('.category-chips');
    if (!container) return;

    const newServices = [
      { category: 'energie-solaire', icon: '☀️', label: 'Énergie solaire' },
      { category: 'securite-surveillance', icon: '🛡️', label: 'Sécurité / Surveillance' },
      { category: 'corporate-facilities', icon: '🏢', label: 'Corporate Facilities' },
    ];

    newServices.forEach(service => {
      // Check both the specialized container and the main grid to avoid duplicates
      if (document.querySelector('[data-category="' + service.category + '"]')) return;
      const chip = document.createElement('div');
      chip.className = 'fc3-spec-chip chip service-chip';
      chip.setAttribute('role', 'listitem');
      chip.setAttribute('data-category', service.category);
      chip.setAttribute('tabindex', '0');
      chip.innerHTML = '<span class="fc3-card-icon" aria-hidden="true">' + service.icon + '</span>' +
                       '<span class="fc3-card-label">' + service.label + '</span>';
      container.appendChild(chip);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addFixeoNewServiceChips);
  } else {
    addFixeoNewServiceChips();
  }

  setTimeout(addFixeoNewServiceChips, 800);
})();
