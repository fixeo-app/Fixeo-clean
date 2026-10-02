/**
 * fixeo-artisan-directory-v1.js
 * PHASE 6B.2 — Artisan Card Visual Continuity
 * (replaces Phase 6B.1 version — engine architecture unchanged)
 *
 * Changes vs 6B.1:
 *   _buildCard()  — new V3B-aligned card structure:
 *                   artdir-card-header / artdir-avatar / artdir-identity /
 *                   artdir-card-desc / artdir-trust / artdir-action
 *   _buildAvatar() — 3-stage fallback (real photo → métier WebP/PNG → silhouette)
 *                    using FixeoHeroes.getCardAvatar() when available
 *   _buildPricing() — fixed: "Tarif renseigné" hint replaces raw priceLabel
 *                     (was causing price duplication bug)
 *   Avatar badge    — métier emoji bottom-right corner (mirrors pvc-avatar-badge)
 *   Trust block     — inline SVG icons (mirrors V3B2-C pvc-trust-v3b)
 *   CTA hierarchy   — primary full-width "Réserver maintenant →",
 *                     secondary quiet "Voir le profil complet ›"
 *   data-category   — on .artdir-avatar for CSS gradient selection
 *
 * Engine unchanged:
 *   URL params, city normalization, trade normalization, filtering,
 *   FixeoMatchingEngine.sortByMatch(), load-more batch 3,
 *   history.replaceState, empty state, localStorage city fallback.
 *
 * Avatar source priority:
 *   1. Real artisan photo (a.photo_url / a.avatar)
 *   2. Métier hero WebP via FixeoHeroes.getCardAvatar() (same as homepage)
 *   3. Métier hero PNG fallback
 *   4. CSS silhouette (no network request, always works)
 *
 * Pricing fix:
 *   priceLabel in Supabase = pre-formatted "À partir de 120 DH" string.
 *   Old code: hint = priceLabel → showed "À partir de 120 DH" AFTER
 *   the main line "À partir de 120 MAD" → visual duplication on device.
 *   Fix: when price_from is present, always hint = "Tarif renseigné"
 *   (mirrors _getPricing() in fixeo_homepage_premium_patch.js).
 *
 * Dependencies loaded on artisans.html (added Phase 6B.1 + 6B.2):
 *   js/fixeo-heroes.js          → window.FixeoHeroes (métier card avatars)
 *   js/fixeo-cities.js          → window.FIXEO_CITIES_MAP (slug↔name)
 *   js/supabase-client.js       → window.FixeoSupabaseClient
 *   js/fixeo-supabase-loader.js → window.ARTISANS + 'fixeo:artisans:loaded' event
 *   js/fixeo-matching-engine.js → FixeoMatchingEngine.sortByMatch()
 *
 * ZERO dependency on:
 *   - main.js, homepage-v13.js, secondary-search.js
 *   - renderArtisans(), _renderPremiumGrid(), _buildCard() (homepage)
 *   - homepage DOM IDs (#artisans-container, #fixeo-homepage-vedette-grid)
 *   - _fxAvStage() (homepage-only inline onerror helper)
 *   - artisan-card-conversion-v1.css classes (pvc-card, fhp-card, pvc-*)
 */
;(function (window, document) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════════ */

  var VERSION      = '2.0';
  var BATCH        = 3 ;
  var PAGE_ID      = 'artisan-directory';
  var GRID_ID      = 'artdir-grid';
  var LOADING_ID   = 'artdir-loading';
  var EMPTY_ID     = 'artdir-empty';
  var SUMMARY_ID   = 'artdir-summary';
  var CTX_ID       = 'artdir-ctx';
  var LOAD_MORE_ID = 'artdir-load-more';
  var CITY_SEL_ID  = 'artdir-city-select';
  var TRADE_SEL_ID = 'artdir-trade-select';
  var RESET_ID     = 'artdir-reset';

  /* Category maps — mirrors fixeo_homepage_premium_patch.js */
  var CAT_ICONS = {
    plomberie:'🔧',electricite:'⚡',peinture:'🎨',nettoyage:'🧹',
    jardinage:'🌿',demenagement:'📦',bricolage:'🔨',climatisation:'❄️',
    menuiserie:'🪚',maconnerie:'🧱',serrurerie:'🔑',carrelage:'🏠',
    etancheite:'🛡',vitrerie:'🪟',soudure:'🔥',informatique:'💻',
    toiture:'🏠',chauffage:'🔥'
  };
  var CAT_LABELS = {
    plomberie:'Plomberie',electricite:'Électricité',peinture:'Peinture',
    nettoyage:'Nettoyage',jardinage:'Jardinage',demenagement:'Déménagement',
    bricolage:'Bricolage',climatisation:'Climatisation',menuiserie:'Menuiserie',
    maconnerie:'Maçonnerie',serrurerie:'Serrurerie',carrelage:'Carrelage',
    etancheite:'Étanchéité',vitrerie:'Vitrerie',soudure:'Soudure',
    informatique:'Informatique',toiture:'Toiture',chauffage:'Chauffage'
  };

  /* Inline SVG icons for trust rows (platform-independent; mirrors V3B2-C) */
  var SVG_DIRECTORY =
    '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
      '<line x1="4.5" y1="4.5" x2="9.5" y2="4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
      '<line x1="4.5" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
      '<line x1="4.5" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
    '</svg>';

  var SVG_PAYMENT =
    '<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<circle cx="7" cy="7.5" r="4.5" stroke="currentColor" stroke-width="1.3" fill="none"/>' +
      '<path d="M7 4.5 L7 2 M7 2 L5.5 3.5 M7 2 L8.5 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<line x1="5.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
    '</svg>';

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */

  var _state = {
    city:         '',
    trade:        '',
    allResults:   [],
    visibleCount: BATCH,
    loading:      false
  };

  /* ══════════════════════════════════════════════════════════════
     CITY NORMALIZATION
  ══════════════════════════════════════════════════════════════ */

  function _cityToSlug(name) {
    if (!name) return '';
    var s = name.normalize ? name.normalize('NFD') : name;
    s = s.replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').trim();
  }

  function _slugToCity(slug) {
    if (!slug) return '';
    var normalized = slug.toLowerCase().replace(/-/g, ' ');
    var map = window.FIXEO_CITIES_MAP || [];
    for (var i = 0; i < map.length; i++) {
      var entry = map[i];
      if (entry.value.toLowerCase() === normalized) return entry.value;
      var aliases = entry.aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (aliases[j].toLowerCase() === normalized) return entry.value;
      }
    }
    return normalized.replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  function _sanitizeCity(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    s = s.replace(/^\uD83D\uDCCD\s*/u, '');
    var dotIdx = s.indexOf('\u00b7');
    if (dotIdx >= 0) s = s.slice(0, dotIdx);
    var dashIdx = s.indexOf('\u2014');
    if (dashIdx >= 0) s = s.slice(0, dashIdx);
    s = s.replace(/\s+d\u00e9tect\u00e9e?\s*$/i, '').trim();
    if (!s || s.length < 2) return '';
    if (/^D\u00e9tect/i.test(s)) return '';
    if (s.indexOf('Choisir') >= 0) return '';
    if (/autour/i.test(s)) return '';
    s = s.replace(/[\uD800-\uDFFF]/g, '').trim();
    if (s.length > 30) s = s.slice(0, 30).trim();
    return s;
  }

  /* ══════════════════════════════════════════════════════════════
     URL / PARAMS
  ══════════════════════════════════════════════════════════════ */

  function _readParams() {
    var params = new URLSearchParams(window.location.search);
    var villeSlug  = (params.get('ville')  || '').toLowerCase().trim();
    var metierSlug = (params.get('metier') || '').toLowerCase().trim();

    var city = '';
    if (villeSlug) {
      city = _slugToCity(villeSlug);
    } else {
      try {
        var stored = localStorage.getItem('fixeo_detected_city');
        city = _sanitizeCity(stored);
      } catch(_) {}
    }

    var trade = '';
    if (metierSlug && CAT_LABELS[metierSlug]) {
      trade = metierSlug;
    }

    return { city: city, trade: trade };
  }

  function _pushURL(city, trade) {
    try {
      var params = new URLSearchParams();
      if (city)  params.set('ville',  _cityToSlug(city));
      if (trade) params.set('metier', trade);
      var qs = params.toString();
      var url = window.location.pathname + (qs ? '?' + qs : '');
      window.history.replaceState(null, '', url);
    } catch(_) {}
  }

  /* ══════════════════════════════════════════════════════════════
     FILTERING & SORTING
  ══════════════════════════════════════════════════════════════ */

  function _matchCity(artisan, city) {
    if (!city) return true;
    var ac = (artisan.city || artisan.ville || '').toLowerCase();
    var wz = (artisan.work_zone || '').toLowerCase();
    var c  = city.toLowerCase();
    return ac.includes(c) || c.includes(ac) || wz.includes(c);
  }

  function _matchTrade(artisan, trade) {
    if (!trade) return true;
    var cat = (artisan.category || artisan.service || '').toLowerCase();
    var svcs = artisan.services || [];
    if (cat === trade) return true;
    for (var i = 0; i < svcs.length; i++) {
      if (String(svcs[i]).toLowerCase() === trade) return true;
    }
    return false;
  }

  function _filter(list, city, trade) {
    return list.filter(function(a) {
      return _matchCity(a, city) && _matchTrade(a, trade);
    });
  }

  function _sort(list, city, trade) {
    if (
      window.FixeoMatchingEngine &&
      typeof window.FixeoMatchingEngine.sortByMatch === 'function' &&
      (city || trade)
    ) {
      return window.FixeoMatchingEngine.sortByMatch(list.slice(), {
        city:    city    || '',
        service: trade   || ''
      });
    }
    return list.slice().sort(function(a, b) {
      var av = a.verified ? 1 : 0;
      var bv = b.verified ? 1 : 0;
      if (bv !== av) return bv - av;
      return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     CARD BUILDER — V3B visual contract
  ══════════════════════════════════════════════════════════════ */

  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function _initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return 'FX';
    if (p.length === 1) return p[0].slice(0,2).toUpperCase();
    return (((p[0]||'?')[0] || '') + ((p[p.length - 1]||'?')[0] || '')).toUpperCase();
  }

  function _fixeoIdVariant(a) {
    var s = String((a && (a._supabase_id || a.id || a.legacy_id || a.name)) || 'FIXEO');
    var h = 0;
    for (var i=0;i<s.length;i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 6;
  }

  /* ── Pricing ──────────────────────────────────────────────────────
   * FIX (6B.2): Mirrors _getPricing() in fixeo_homepage_premium_patch.js.
   * When price_from is present and valid → main = "À partir de N MAD",
   *   hint = "Tarif renseigné" (ALWAYS — never priceLabel).
   * Why: priceLabel from Supabase = "À partir de 120 DH" (pre-formatted).
   *   Showing it as hint next to main "À partir de 120 MAD" = duplication.
   * When price_from absent → return null (no price block rendered).
   * No MAR_PRICES range fallback — directory shows artisan-specific only. */
  function _buildPricing(a) {
    var from = a.price_from || a.priceFrom;
    if (!from) return null;
    var amount = parseFloat(from);
    if (!amount || isNaN(amount) || amount <= 0) return null;
    return {
      main: '\u00c0 partir de ' + Math.round(amount).toLocaleString('fr-FR') + '\u00a0MAD',
      hint: 'Tarif renseign\u00e9'   /* always fixed — never priceLabel */
    };
  }

  /* ── Description sanitizer ────────────────────────────────────────
   * Mirrors V3B2-1 _descSanitize in homepage patch.
   * Rejects object artefacts ('[object Object]', etc.). */
  function _sanitizeDesc(s) {
    if (typeof s !== 'string') return '';
    var t = s.trim();
    if (!t) return '';
    if (t === '[object Object]' || t.charAt(0) === '[' || t.charAt(0) === '{') return '';
    return t;
  }

  /* ── Avatar builder — 3-stage fallback ───────────────────────────
   * Stage 1: real artisan photo (a.photo_url / a.avatar)
   * Stage 2: métier hero WebP via FixeoHeroes.getCardAvatar()
   * Stage 3: métier hero PNG (data-attr fallback in onerror)
   * Stage 4: CSS artdir-avatar-silhouette (no request)
   *
   * IMPORTANT: does NOT use _fxAvStage() — that is a homepage-only
   * inline onerror helper not available on artisans.html.
   * Uses _artdirAvStage() exposed on window (see below). */
  function _fixeoIdHtml(a) {
    var initials = _esc(_initials(a.name || a.full_name || ''));
    var variant = _fixeoIdVariant(a);
    return '<div class="artdir-fixeo-id artdir-fixeo-id-v' + variant + '" aria-label="Identité FIXEO">' +
      '<span class="artdir-fixeo-id-brand">F</span>' +
      '<strong>' + initials + '</strong>' +
      '<small>FIXEO ID</small>' +
    '</div>';
  }

  /* Canonical card identity: real artisan photo OR deterministic FIXEO ID.
   * Never use a métier illustration as if it represented the artisan. */
  function _buildAvatar(a) {
    var photoSrc = a.photo_url || a.avatar || a.photo || '';
    var nameStr = _esc(a.name || a.full_name || 'Artisan FIXEO');
    var idHtml = _fixeoIdHtml(a);
    if (!photoSrc) return idHtml;
    return '<img class="artdir-avatar-img artdir-avatar-real"' +
      ' src="' + _esc(photoSrc) + '"' +
      ' alt="' + nameStr + '"' +
      ' width="76" height="76" loading="lazy" decoding="async"' +
      ' onerror="_artdirAvStage(this)">' +
      idHtml.replace('class="artdir-fixeo-id ', 'class="artdir-fixeo-id artdir-fixeo-id-fallback ');
  }

  function _proofs(a) {
    var out = [];
    var completed = parseInt(
      a.completed_interventions || a.completed_missions || a.completedInterventions || a.missions_done || 0,
      10
    ) || 0;
    var reviews = parseInt(a.reviewCount || a.review_count || a.reviews || 0, 10) || 0;
    var rating = parseFloat(a.rating || a.average_rating || a.verified_average_rating || 0) || 0;
    if (completed > 0) out.push(completed + ' intervention' + (completed > 1 ? 's' : '') + ' FIXEO');
    if (reviews > 0 && rating > 0) out.push(rating.toFixed(1).replace('.', ',') + ' ★ · ' + reviews + ' avis');
    return out;
  }

  /* ── Card builder V2 — mini Passeport Professionnel FIXEO ─────── */
  function _buildCard(a) {
    var cat      = (a.category || a.service || '').toLowerCase();
    var catLabel = CAT_LABELS[cat] || (a.category || a.service || 'Intervention');
    var name     = a.name || a.full_name || 'Artisan FIXEO';
    var city     = a.city || a.ville || '';
    var aid      = a._supabase_id || a._artisan_id_canonical || a.id || a.legacy_id || '';
    var profileHref = 'artisan-profile.html?id=' + encodeURIComponent(String(aid)) + '&pv=20261002card1';

    var descRaw = _sanitizeDesc(a.description)
               || _sanitizeDesc(a.shortBio)
               || _sanitizeDesc(a.bio && a.bio.fr)
               || '';
    var desc = descRaw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    var statusLabel = a.verified === true
      ? 'Profil vérifié sur FIXEO'
      : (a.claimed === true
          ? 'Profil revendiqué sur FIXEO'
          : (a.onboarding_completed === true
              ? 'Profil complété sur FIXEO'
              : 'Profil référencé sur FIXEO'));

    var proof = _proofs(a);
    var proofHtml = proof.length
      ? '<div class="artdir-v2-proof">' + proof.map(function(x){ return '<span>' + _esc(x) + '</span>'; }).join('') + '</div>'
      : '<div class="artdir-v2-proof artdir-v2-proof--building"><span>Réputation en construction</span></div>';

    var descHtml = desc
      ? '<p class="artdir-card-desc artdir-v2-desc">' + _esc(desc) + '</p>'
      : '';

    var avatarHtml = _buildAvatar(a);

    return '<article class="artdir-card artdir-card-v2" data-artisan-id="' + _esc(String(aid)) + '">' +
      '<div class="artdir-card-header artdir-v2-header">' +
        '<div class="artdir-avatar artdir-v2-avatar" aria-hidden="true">' + avatarHtml + '</div>' +
        '<div class="artdir-identity artdir-v2-identity">' +
          '<span class="artdir-v2-kicker">PROFIL PROFESSIONNEL FIXEO</span>' +
          '<h3 class="artdir-card-name" title="' + _esc(name) + '">' + _esc(name) + '</h3>' +
          '<div class="artdir-v2-meta">' + _esc(catLabel) + (city ? ' · ' + _esc(city) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="artdir-v2-signals">' +
        '<span>' + _esc(statusLabel) + '</span>' +
        '<span>Disponibilité à confirmer</span>' +
      '</div>' +
      descHtml +
      proofHtml +
      '<div class="artdir-action artdir-v2-action">' +
        '<div class="artdir-v2-tariff"><small>TARIF</small><strong>Confirmé avant intervention</strong></div>' +
        '<button class="artdir-btn-reserve artdir-v2-reserve" type="button"' +
          ' data-artisan-id="' + _esc(String(aid)) + '"' +
          ' data-artisan-name="' + _esc(name) + '"' +
          ' aria-label="Demander une intervention avec ' + _esc(name) + '">' +
          '<span class="artdir-v2-cta-mark">F</span><strong>Demander une intervention</strong><b>→</b>' +
        '</button>' +
        '<a class="artdir-btn-profile artdir-v2-profile" href="' + _esc(profileHref) + '"' +
          ' aria-label="Voir le profil complet de ' + _esc(name) + '">' +
          'Voir le profil complet' +
        '</a>' +
      '</div>' +
    '</article>';
  }

  /* Real-photo failure falls directly to FIXEO ID — no métier artwork. */
  function _artdirAvStage(img) {
    if (!img) return;
    img.onerror = null;
    img.style.display = 'none';
    var sib = img.nextElementSibling;
    if (sib && sib.classList.contains('artdir-fixeo-id')) sib.style.display = 'grid';
  }
  window._artdirAvStage = _artdirAvStage;

  /* ══════════════════════════════════════════════════════════════
     HEADER / CONTEXT UI
  ══════════════════════════════════════════════════════════════ */

  function _updateHeader(city, trade) {
    var h1 = document.querySelector('.artdir-h1');
    var ctxEl = document.getElementById(CTX_ID);
    if (!h1) return;

    var catLabel = trade ? (CAT_LABELS[trade] || trade) : '';
    var catIcon  = trade ? (CAT_ICONS[trade] || '🔧') : '';

    var h1Text, h1Em;
    if (trade && city) {
      h1Text = _catPlural(trade) + ' r\u00e9f\u00e9renc\u00e9s \u00e0\u00a0';
      h1Em   = city;
    } else if (city) {
      h1Text = 'Artisans r\u00e9f\u00e9renc\u00e9s \u00e0\u00a0';
      h1Em   = city;
    } else if (trade) {
      h1Text = _catPlural(trade) + ' r\u00e9f\u00e9renc\u00e9s sur FIXEO';
      h1Em   = '';
    } else {
      h1Text = 'Le r\u00e9seau d\u2019artisans FIXEO';
      h1Em   = '';
    }

    if (h1Em) {
      h1.innerHTML = _esc(h1Text) + '<em class="artdir-h1-em">' + _esc(h1Em) + '</em>';
    } else {
      h1.textContent = h1Text;
    }

    if (!ctxEl) return;
    if (!city && !trade) {
      ctxEl.classList.remove('artdir-context--visible');
      ctxEl.innerHTML = '';
      return;
    }
    var pills = '';
    if (city)  pills += '<span class="artdir-ctx-pill">\uD83D\uDCCD\u00a0' + _esc(city) + '</span>';
    if (trade) pills += '<span class="artdir-ctx-pill">' + catIcon + '\u00a0' + _esc(catLabel) + '</span>';
    ctxEl.innerHTML = pills;
    ctxEl.classList.add('artdir-context--visible');
  }

  function _catPlural(slug) {
    var map = {
      plomberie:'Plombiers',electricite:'Électriciens',peinture:'Peintres',
      nettoyage:'Agents de nettoyage',jardinage:'Jardiniers',
      demenagement:'Déménageurs',bricolage:'Bricoleurs',
      climatisation:'Techniciens climatisation',menuiserie:'Menuisiers',
      maconnerie:'Maçons',serrurerie:'Serruriers',carrelage:'Carreleurs',
      toiture:'Couvreurs',etancheite:'Étancheurs',vitrerie:'Vitriers',
      soudure:'Soudeurs',informatique:'Techniciens informatique',
      chauffage:'Chauffagistes'
    };
    return map[slug] || (CAT_LABELS[slug] || slug);
  }

  /* ══════════════════════════════════════════════════════════════
     SUMMARY
  ══════════════════════════════════════════════════════════════ */

  function _updateSummary(total, visible) {
    var el = document.getElementById(SUMMARY_ID);
    if (!el) return;
    if (!total) { el.textContent = ''; return; }
    var txt;
    if (total === 1) {
      txt = '1 artisan trouv\u00e9';
    } else if (visible < total) {
      txt = visible + '\u00a0sur\u00a0' + total + ' artisans';
    } else {
      txt = total + ' artisan' + (total > 1 ? 's' : '') + ' trouv\u00e9' + (total > 1 ? 's' : '');
    }
    el.textContent = txt;
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */

  function _showLoading(on) {
    var el = document.getElementById(LOADING_ID);
    if (!el) return;
    if (on) el.classList.add('artdir-loading--visible');
    else    el.classList.remove('artdir-loading--visible');
  }

  function _showEmpty(on) {
    var el = document.getElementById(EMPTY_ID);
    if (!el) return;
    if (on) el.classList.add('artdir-empty--visible');
    else    el.classList.remove('artdir-empty--visible');
  }

  function _renderCards() {
    var grid = document.getElementById(GRID_ID);
    if (!grid) return;

    var list    = _state.allResults;
    var visible = Math.min(_state.visibleCount, list.length);

    if (list.length === 0) {
      grid.innerHTML = '';
      _showEmpty(true);
      _updateSummary(0, 0);
      _updateLoadMore(0, 0);
      return;
    }

    _showEmpty(false);
    var html = '';
    for (var i = 0; i < visible; i++) {
      html += _buildCard(list[i]);
    }
    grid.innerHTML = html;
    _updateSummary(list.length, visible);
    _updateLoadMore(list.length, visible);
  }

  function _updateLoadMore(total, visible) {
    var btn = document.getElementById(LOAD_MORE_ID);
    if (!btn) return;
    if (visible >= total) {
      btn.hidden = true;
    } else {
      btn.hidden = false;
      var remaining = total - visible;
var nextCount = Math.min(BATCH, remaining);

btn.textContent =
  nextCount === 1
    ? 'Voir 1 artisan de plus'
    : 'Voir ' + nextCount + ' artisans de plus';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     APPLY FILTERS
  ══════════════════════════════════════════════════════════════ */

  function _applyFilters(city, trade) {
    _state.city         = city  || '';
    _state.trade        = trade || '';
    _state.visibleCount = BATCH;

    var raw = window.ARTISANS || [];
    var filtered = _filter(raw, city, trade);
    _state.allResults = _sort(filtered, city, trade);

    _updateHeader(city, trade);
    _updateEmptyActions(city, trade);
    _updateSelectValues(city, trade);
    _pushURL(city, trade);
    _renderCards();
  }

  function _updateEmptyActions(city, trade) {
    var widenBtn = document.querySelector('.artdir-empty-btn-widen');
    if (!widenBtn) return;
    if (city && trade) {
      widenBtn.textContent = 'Voir tous les artisans \u00e0 ' + city;
      widenBtn.style.display = '';
      widenBtn.onclick = function() { _applyFilters(city, ''); _syncSelects(); };
    } else if (city) {
      widenBtn.textContent = 'Voir tous les artisans';
      widenBtn.style.display = '';
      widenBtn.onclick = function() { _applyFilters('', ''); _syncSelects(); };
    } else {
      widenBtn.style.display = 'none';
    }
  }

  function _syncSelects() {
    var cityEl  = document.getElementById(CITY_SEL_ID);
    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (cityEl)  cityEl.value  = _cityToSlug(_state.city);
    if (tradeEl) tradeEl.value = _state.trade;
  }

  function _updateSelectValues(city, trade) {
    var cityEl  = document.getElementById(CITY_SEL_ID);
    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (cityEl)  cityEl.value  = _cityToSlug(city);
    if (tradeEl) tradeEl.value = trade || '';
  }

  /* ══════════════════════════════════════════════════════════════
     SELECT BUILDERS
  ══════════════════════════════════════════════════════════════ */

  function _populateCitySelect(currentSlug) {
    var el = document.getElementById(CITY_SEL_ID);
    if (!el) return;
    var map = window.FIXEO_CITIES_MAP || [];
    var opts = '<option value="">Toutes les villes</option>';
    map.forEach(function(c) {
      var slug = _cityToSlug(c.value);
      var sel  = slug === currentSlug ? ' selected' : '';
      opts += '<option value="' + _esc(slug) + '"' + sel + '>' + _esc(c.label) + '</option>';
    });
    el.innerHTML = opts;
  }

  function _populateTradeSelect(currentTrade) {
    var el = document.getElementById(TRADE_SEL_ID);
    if (!el) return;
    var opts = '<option value="">Tous les métiers</option>';
    Object.keys(CAT_LABELS).forEach(function(slug) {
      var sel = slug === currentTrade ? ' selected' : '';
      opts += '<option value="' + _esc(slug) + '"' + sel + '>' + _esc(CAT_ICONS[slug]||'') + '\u00a0' + _esc(CAT_LABELS[slug]) + '</option>';
    });
    el.innerHTML = opts;
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT BINDING
  ══════════════════════════════════════════════════════════════ */

  function _bindEvents() {
    var cityEl = document.getElementById(CITY_SEL_ID);
    if (cityEl) {
      cityEl.addEventListener('change', function() {
        var slug = cityEl.value;
        var city = slug ? _slugToCity(slug) : '';
        _applyFilters(city, _state.trade);
      });
    }

    var tradeEl = document.getElementById(TRADE_SEL_ID);
    if (tradeEl) {
      tradeEl.addEventListener('change', function() {
        _applyFilters(_state.city, tradeEl.value || '');
      });
    }

    var resetEl = document.getElementById(RESET_ID);
    if (resetEl) {
      resetEl.addEventListener('click', function() {
        _applyFilters('', '');
        _syncSelects();
      });
    }

    var loadMoreEl = document.getElementById(LOAD_MORE_ID);
    if (loadMoreEl) {
      loadMoreEl.addEventListener('click', function() {
        _state.visibleCount += BATCH;
        _renderCards();
      });
    }

    /* Reserve button — delegate to section */
    var section = document.getElementById(PAGE_ID);
    if (section) {
      section.addEventListener('click', function(e) {
        var btn = e.target.closest('.artdir-btn-reserve');
        if (!btn) return;
        var aid = btn.getAttribute('data-artisan-id');
        if (!aid) return;
        var selected = _state.allResults.find(function(a) {
          if (!a) return false;
          var wanted = String(aid || '').trim();
          var ids = [a._supabase_id, a._artisan_id_canonical, a.id, a.legacy_id, a.artisan_id, a.public_id]
            .map(function(v){ return String(v == null ? '' : v).trim(); })
            .filter(Boolean);
          return ids.indexOf(wanted) !== -1;
        });
        if (!selected) {
          window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(aid) + '&pv=20261002card1';
          return;
        }
        var tries = 0;
        (function openTargetedReservation() {
          if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
            window.FixeoReservation.open(selected, false);
            return;
          }
          if (++tries < 120) {
            window.setTimeout(openTargetedReservation, 100);
            return;
          }
          window.location.href = 'artisan-profile.html?id=' + encodeURIComponent(aid) + '&pv=20261002card1';
        })();
      });

      /* Keyboard: Enter on .artdir-btn-reserve (role=button already covered natively) */
      section.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var btn = e.target.closest('.artdir-btn-reserve');
        if (btn) { e.preventDefault(); btn.click(); }
      });
    }

    /* Métier items in page sections → filter + scroll */
    var metierItems = document.querySelectorAll('.cp-metier-item[data-metier]');
    metierItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var slug = item.getAttribute('data-metier');
        if (!slug) return;
        var tradeEl2 = document.getElementById(TRADE_SEL_ID);
        if (tradeEl2) tradeEl2.value = slug;
        _applyFilters(_state.city, slug);
        var dir = document.getElementById(PAGE_ID);
        if (dir) dir.scrollIntoView({ behavior: 'smooth' });
      });
      item.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
    });

    /* City pills in page sections → filter + scroll */
    var cityPills = document.querySelectorAll('.cp-city-pill[data-city]');
    cityPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        var cityName = pill.getAttribute('data-city');
        if (!cityName) return;
        var slug = _cityToSlug(cityName);
        var cityEl2 = document.getElementById(CITY_SEL_ID);
        if (cityEl2) cityEl2.value = slug;
        _applyFilters(cityName, _state.trade);
        var dir = document.getElementById(PAGE_ID);
        if (dir) dir.scrollIntoView({ behavior: 'smooth' });
      });
      pill.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pill.click(); }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */

  function _init() {
    if (!document.getElementById(PAGE_ID)) return;

    var params    = _readParams();
    var city      = params.city;
    var trade     = params.trade;
    var citySlug  = _cityToSlug(city);
    var tradeSlug = trade;

    _populateCitySelect(citySlug);
    _populateTradeSelect(tradeSlug);

    _showLoading(true);
    _updateHeader(city, trade);

    _bindEvents();

    /* Immediate render if ARTISANS already cached */
    if (window.ARTISANS && window.ARTISANS.length > 0) {
      _showLoading(false);
      _applyFilters(city, trade);
      return;
    }

    /* Wait for supabase-loader event */
    window.addEventListener('fixeo:artisans:loaded', function _onLoaded() {
      window.removeEventListener('fixeo:artisans:loaded', _onLoaded);
      _showLoading(false);
      _applyFilters(city, trade);
    });

    /* Polling fallback — 15s max */
    var _poll = 0;
    var _pollId = setInterval(function() {
      _poll++;
      if (window.ARTISANS && window.ARTISANS.length > 0) {
        clearInterval(_pollId);
        _showLoading(false);
        _applyFilters(city, trade);
        return;
      }
      if (_poll > 30) {
        clearInterval(_pollId);
        _showLoading(false);
        _state.allResults = [];
        _renderCards();
      }
    }, 500);
  }

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  /* Public API */
  window.FixeoArtisanDirectory = {
    version:      VERSION,
    applyFilters: _applyFilters,
    state:        _state,
  };

}(window, document));
