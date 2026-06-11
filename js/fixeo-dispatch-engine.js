/**
 * FIXEO SMART DISPATCH ENGINE — v1b
 * ====================================
 * Phases 1–4: Scoring, Suggestions UI, One-Click Assignment, Operations KPIs
 *
 * ARCHITECTURE:
 *   window.FixeoDispatch — public API (scoring, suggestions, assignment, KPIs)
 *
 * READS FROM (never modifies):
 *   window.FixeoDB.getAllArtisans()     — artisan pool (localStorage + Supabase-loaded)
 *   window.__fxAccSbCache              — Supabase service_requests (admin-control-center-p1)
 *   window.FixeoAdminEngine.readRequests() — merged request pool
 *   window.FixeoSupabaseClient         — Supabase client (for one-click assignment)
 *
 * WRITES TO (assignment only, via Supabase + existing _writeReqPatch bridge):
 *   service_requests: status = 'assigned'
 *   missions: INSERT new row
 *   Then dispatches fixeo:admin:refresh to refresh all admin sections
 *
 * DOES NOT TOUCH:
 *   Auth, RLS, claim engine, mission lifecycle engine (admin-mission-supervision-p3),
 *   fixeo-supabase-core.js, fixeo-auth-guard.js, cod-payment.js, reservation flows
 *
 * IDEMPOTENT:
 *   Re-registering does nothing (window.FixeoDispatch guard)
 * ────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  if (window.FixeoDispatch) return; // idempotent

  /* ── CONSTANTS ───────────────────────────────────────────────────────── */

  var VERSION = 'v1b';

  /* Score weights (sum = 100) */
  var W = {
    service:      35,
    city:         30,
    availability: 15,
    trust:        10,
    performance:  5,
    activity:     5
  };

  /* City proximity groups (Moroccan geography — no hardcoded fallthrough) */
  var CITY_GROUPS = [
    ['Casablanca', 'Mohammédia', 'Mohammedia', 'Benslimane', 'El Jadida'],
    ['Rabat', 'Salé', 'Temara', 'Kénitra', 'Khémisset'],
    ['Marrakech', 'Safi', 'El Kelaa des Sraghna'],
    ['Fès', 'Fez', 'Meknès', 'Meknes', 'Ifrane', 'Taza'],
    ['Agadir', 'Tiznit', 'Inezgane'],
    ['Tanger', 'Tanger-Assilah', 'Tétouan', 'Tetouan', 'Chefchaouen'],
    ['Oujda', 'Berkane', 'Nador'],
    ['Laâyoune', 'Dakhla']
  ];

  /* Service keyword → normalized category mapping */
  var CAT_KEYWORDS = {
    plomberie:    ['plomb', 'eau', 'chauffe', 'robinet', 'tuyau', 'fuite', 'sanitaire'],
    electricite:  ['electr', 'electricit', 'tableau', 'prise', 'lumiere', 'courant'],
    serrurerie:   ['serrur', 'porte', 'verrou', 'clé', 'cle', 'blindage'],
    climatisation:['clim', 'froid', 'chauff', 'pompe chaleur', 'split'],
    peinture:     ['peint', 'ravalement', 'enduit', 'badigeon'],
    carrelage:    ['carrel', 'faïence', 'faience', 'parquet', 'sol'],
    maconnerie:   ['macon', 'maçon', 'béton', 'beton', 'ciment', 'démolition'],
    menuiserie:   ['menuis', 'bois', 'porte bois', 'meuble', 'parquet'],
    jardinage:    ['jardin', 'tonte', 'arbre', 'haie'],
    nettoyage:    ['nettoy', 'ménage', 'menage', 'nettoyage'],
    bricolage:    ['bricol', 'répar', 'repar', 'fix', 'installation']
  };

  /* ── UTILITIES ──────────────────────────────────────────────────────── */

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /* Returns epoch ms from ISO string or 0 */
  function _ts(s) {
    try { var d = new Date(s); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch(e) { return 0; }
  }

  /* Days since ISO date string (0 if null) */
  function _daysSince(s) {
    var t = _ts(s);
    if (!t) return 999;
    return Math.floor((Date.now() - t) / 86400000);
  }

  /* Resolve canonical category string from artisan object */
  function _artisanCategory(a) {
    return _norm(a.service_category || a.category || a.specialty || '');
  }

  /* Resolve request category */
  function _reqCategory(r) {
    return _norm(r.service_category || r.service || r.category || r.type || '');
  }

  /* Resolve request city */
  function _reqCity(r) {
    return _norm(r.city || r.ville || '');
  }

  /* Resolve artisan city */
  function _artCity(a) {
    return _norm(a.city || a.ville || '');
  }

  /* ── PHASE 1: SCORING ENGINE ─────────────────────────────────────────── */

  /**
   * scoreServiceMatch(artisan, request) → 0–100
   * Exact category match = 100, keyword overlap = 40–80, related = 20
   */
  function scoreServiceMatch(a, r) {
    var artCat = _artisanCategory(a);
    var reqCat = _reqCategory(r);
    if (!reqCat) return 50; // no category info — neutral

    // 1. Exact match
    if (artCat === reqCat) return 100;
    if (artCat && reqCat && artCat.includes(reqCat)) return 90;
    if (artCat && reqCat && reqCat.includes(artCat)) return 85;

    // 2. Keyword-based canonical match
    var reqNorm = _norm(r.service_category || r.service || r.description || '');
    var bestMatch = 0;
    Object.keys(CAT_KEYWORDS).forEach(function(cat) {
      var keywords = CAT_KEYWORDS[cat];
      var reqHitCount = keywords.filter(function(k) { return reqNorm.includes(k); }).length;
      if (!reqHitCount) return;
      var artHit = artCat.includes(cat) || keywords.some(function(k) { return artCat.includes(k); });
      if (artHit) bestMatch = Math.max(bestMatch, Math.min(100, 60 + reqHitCount * 10));
    });
    if (bestMatch > 0) return bestMatch;

    // 3. Sub-keyword partial: artisan cat keyword appears in request text
    var reqDesc = _norm(r.description || '');
    var artWords = artCat.split(/[\s,]+/).filter(function(w) { return w.length > 3; });
    var hits = artWords.filter(function(w) { return reqDesc.includes(w); });
    if (hits.length > 0) return 30;

    // 4. Bricolage is a universal fallback (but low score)
    if (artCat.includes('bricol')) return 15;

    return 0;
  }

  /**
   * scoreCityMatch(artisan, request) → 0–100
   * Same city = 100, nearby city = 60, same region = 30, national = 10
   */
  function scoreCityMatch(a, r) {
    var artCity = _artCity(a);
    var reqCity = _reqCity(r);
    if (!reqCity) return 50; // no city info — neutral

    // Exact
    if (artCity === reqCity) return 100;
    if (artCity && reqCity && (artCity.includes(reqCity) || reqCity.includes(artCity))) return 95;

    // Check work_zone (artisan declares coverage)
    var workZone = _norm(a.work_zone || '');
    if (workZone && workZone.includes(reqCity)) return 80;

    // Proximity group
    var artGroup = -1, reqGroup = -1;
    CITY_GROUPS.forEach(function(group, gi) {
      var gNorm = group.map(_norm);
      if (gNorm.some(function(c) { return artCity.includes(c) || c.includes(artCity.split(' ')[0]); })) artGroup = gi;
      if (gNorm.some(function(c) { return reqCity.includes(c) || c.includes(reqCity.split(' ')[0]); })) reqGroup = gi;
    });

    if (artGroup !== -1 && artGroup === reqGroup) return 60; // same proximity group

    // National fallback: artisan declared national coverage
    if (workZone.includes('national') || workZone.includes('maroc') || workZone.includes('tout')) return 20;

    return 5; // different region
  }

  /**
   * scoreAvailability(artisan) → 0–100
   * available = 100, busy = 20, anything else = 5
   */
  function scoreAvailability(a) {
    var avail = _norm(a.availability || '');
    if (avail === 'available' || avail === 'disponible') return 100;
    if (avail === 'busy' || avail === 'occupé' || avail === 'occupe') return 20;
    if (avail === 'offline') return 0;
    return 40; // unknown — might be available
  }

  /**
   * scoreTrust(artisan) → 0–100
   * Based on: completed_missions, verified, claimed, claim_status, profile completeness
   */
  function scoreTrust(a) {
    var score = 0;

    // Verified account
    if (a.verified || a.is_verified) score += 25;

    // Claimed profile (owner linked)
    if (a.claimed || a.owner_user_id) score += 20;
    if (_norm(a.claim_status) === 'approved') score += 5;

    // Completed missions (real data from Supabase)
    var cm = Number(a.completed_missions || 0);
    if (cm >= 100) score += 30;
    else if (cm >= 50) score += 22;
    else if (cm >= 20) score += 15;
    else if (cm >= 5)  score += 8;
    else if (cm >= 1)  score += 4;

    // Rating
    var rating = Number(a.rating || 0);
    if (rating >= 4.8) score += 15;
    else if (rating >= 4.5) score += 10;
    else if (rating >= 4.0) score += 6;
    else if (rating >= 3.5) score += 3;

    // Profile completeness bonus
    var complete = 0;
    if (a.name || a.full_name) complete++;
    if (a.city) complete++;
    if (a.service_category || a.category) complete++;
    if (a.phone_public || a.phone) complete++;
    if (a.description) complete++;
    score += complete * 1; // up to 5 bonus points

    return _clamp(score, 0, 100);
  }

  /**
   * scorePerformance(artisan) → 0–100
   * Based on: review_count, rating, completed_missions ratio
   * (acceptance_rate and completion_rate not yet in DB — future columns)
   */
  function scorePerformance(a) {
    var score = 50; // baseline

    var reviewCount = Number(a.review_count || 0);
    var rating      = Number(a.rating || 0);
    var cm          = Number(a.completed_missions || 0);

    // Review volume indicates active/reliable artisan
    if (reviewCount >= 100) score += 25;
    else if (reviewCount >= 50) score += 18;
    else if (reviewCount >= 20) score += 12;
    else if (reviewCount >= 5)  score += 6;
    else if (reviewCount === 0) score -= 15; // no reviews = uncertain

    // Rating quality
    if (rating >= 4.8) score += 20;
    else if (rating >= 4.5) score += 14;
    else if (rating >= 4.0) score += 8;
    else if (rating > 0 && rating < 3.5) score -= 10;

    // Volume/review ratio (consistency indicator)
    if (cm > 0 && reviewCount > 0) {
      var ratio = reviewCount / cm;
      if (ratio >= 0.3) score += 5; // good review-to-mission ratio
    }

    return _clamp(score, 0, 100);
  }

  /**
   * scoreActivity(artisan) → 0–100
   * Based on: updated_at, availability signals, onboarding_completed
   */
  function scoreActivity(a) {
    var score = 20; // baseline

    var daysSince = _daysSince(a.updated_at || a.created_at);

    if (daysSince <= 1)   score += 60;
    else if (daysSince <= 7)   score += 45;
    else if (daysSince <= 30)  score += 25;
    else if (daysSince <= 90)  score += 10;
    else score -= 10; // inactive > 90 days

    // Onboarding completed = active user
    if (a.onboarding_completed) score += 15;

    // Owner linked = claimed and active account
    if (a.owner_user_id) score += 5;

    return _clamp(score, 0, 100);
  }

  /**
   * scoreArtisan(artisan, request) → { overall, breakdown }
   * overall: 0–100 (weighted sum)
   * breakdown: individual dimension scores
   */
  function scoreArtisan(artisan, request) {
    var s = {
      service:      scoreServiceMatch(artisan, request),
      city:         scoreCityMatch(artisan, request),
      availability: scoreAvailability(artisan),
      trust:        scoreTrust(artisan),
      performance:  scorePerformance(artisan),
      activity:     scoreActivity(artisan)
    };

    var overall = Math.round(
      s.service      * W.service      / 100 +
      s.city         * W.city         / 100 +
      s.availability * W.availability / 100 +
      s.trust        * W.trust        / 100 +
      s.performance  * W.performance  / 100 +
      s.activity     * W.activity     / 100
    );

    return {
      overall:   _clamp(overall, 0, 100),
      breakdown: s
    };
  }

  /**
   * rankArtisansForRequest(request, limit) → Array<{artisan, score, breakdown}>
   * Returns top `limit` artisans scored and sorted descending.
   */
  function rankArtisansForRequest(request, limit) {
    limit = limit || 5;
    var all = [];
    try {
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        all = window.FixeoDB.getAllArtisans() || [];
      }
    } catch(e) { return []; }
    if (!all.length) return [];

    var scored = all.map(function(a) {
      var result = scoreArtisan(a, request);
      return { artisan: a, score: result.overall, breakdown: result.breakdown };
    });

    // Sort descending, take top N
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, limit);
  }

  /* ── PHASE 2: SUGGESTIONS UI ─────────────────────────────────────────── */

  var _suggestionsEl = null; // cached DOM reference

  /**
   * renderSuggestionsSection()
   * Injects the "🤖 Suggestions Fixeo AI" section into the admin sidebar + DOM.
   * Idempotent — safe to call multiple times.
   */
  function _ensureSuggestionsSection() {
    if (document.getElementById('admin-section-dispatch')) return;

    // ── Sidebar link
    var sidebarSection = document.querySelector('.sidebar-section-label');
    if (sidebarSection) {
      var link = document.createElement('a');
      link.className = 'sidebar-link';
      link.setAttribute('onclick', "adminSection('dispatch')");
      link.innerHTML = '<span class="icon">🤖</span><span>Suggestions AI</span>'
        + '<span class="sidebar-count" id="sc-dispatch" style="background:linear-gradient(135deg,#E1306C,#405DE6);color:#fff">0</span>';
      // Insert before the Finance label
      var financeLabel = Array.from(document.querySelectorAll('.sidebar-section-label')).find(function(el) {
        return el.textContent.trim() === 'Finance';
      });
      if (financeLabel) {
        financeLabel.parentNode.insertBefore(link, financeLabel);
      } else if (sidebarSection.parentNode) {
        sidebarSection.parentNode.appendChild(link);
      }
    }

    // ── Section container
    var mainContent = document.getElementById('admin-section-overview');
    if (!mainContent) return;
    var section = document.createElement('div');
    section.id = 'admin-section-dispatch';
    section.style.display = 'none';
    section.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">',
        '<div>',
          '<h2 style="font-size:1.3rem;margin-bottom:4px">🤖 Suggestions Fixeo AI</h2>',
          '<p style="font-size:.82rem;color:var(--text-muted);margin:0">',
            'Meilleurs artisans recommandés pour chaque demande en attente. Classement par score global.',
          '</p>',
        '</div>',
        '<button class="btn btn-primary btn-sm" onclick="window.FixeoDispatch.refreshSuggestions()">🔄 Actualiser</button>',
      '</div>',

      // ── Operations KPI strip (Phase 4)
      '<div id="fxdisp-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid #E1306C">',
          '<div class="kpi-value" id="fxdisp-kpi-pending">—</div>',
          '<div class="kpi-label">⏳ En attente</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid #405DE6">',
          '<div class="kpi-value" id="fxdisp-kpi-assigned">—</div>',
          '<div class="kpi-label">👷 Assignées</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid #20C997">',
          '<div class="kpi-value" id="fxdisp-kpi-completed">—</div>',
          '<div class="kpi-label">✅ Terminées</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid #FCAF45">',
          '<div class="kpi-value" id="fxdisp-kpi-available">—</div>',
          '<div class="kpi-label">🟢 Disponibles</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid #fd1d1d">',
          '<div class="kpi-value" id="fxdisp-kpi-active">—</div>',
          '<div class="kpi-label">⚡ Actifs</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid rgba(255,255,255,.2)">',
          '<div class="kpi-value" id="fxdisp-kpi-acceptance">—</div>',
          '<div class="kpi-label">📈 Taux accept.</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid rgba(255,255,255,.2)">',
          '<div class="kpi-value" id="fxdisp-kpi-completion">—</div>',
          '<div class="kpi-label">🎯 Taux complet.</div>',
        '</div>',
        '<div class="kpi-card admin-kpi" style="border-left:3px solid rgba(255,255,255,.2)">',
          '<div class="kpi-value" id="fxdisp-kpi-avgtime">—</div>',
          '<div class="kpi-label">⏱️ Tps moy. assignation</div>',
        '</div>',
      '</div>',

      // ── Suggestions grid
      '<div id="fxdisp-suggestions-grid">',
        '<div style="color:rgba(255,255,255,.4);text-align:center;padding:60px">',
          'Chargement des suggestions…',
        '</div>',
      '</div>'
    ].join('');

    mainContent.parentNode.insertBefore(section, mainContent.nextSibling);
    _suggestionsEl = document.getElementById('fxdisp-suggestions-grid');
  }

  /**
   * Render one suggestion block for a single request.
   */
  function _renderSuggestionBlock(request, ranked) {
    var reqId  = String(request.id || '');
    var city   = String(request.city || request.ville || '—');
    var svc    = String(request.service_category || request.service || request.type || '—');
    var desc   = String(request.description || '').slice(0, 80);
    var refId  = reqId.slice(-6).toUpperCase();

    var artisanCards = ranked.map(function(item) {
      var a = item.artisan;
      var sc = item.score;
      var bd = item.breakdown;
      var scoreColor = sc >= 75 ? '#20C997' : sc >= 50 ? '#FCAF45' : '#ff5d73';
      var artId   = _esc(String(a.id || a._supabase_id || ''));
      var artName = _esc(String(a.name || a.full_name || '—'));
      var artCity = _esc(String(a.city || '—'));
      var artCat  = _esc(String(a.service_category || a.category || '—'));
      var artAvail= _esc(String(a.availability || '—'));
      var artCm   = Number(a.completed_missions || 0);
      var artRat  = Number(a.rating || 0);
      var trustSc = bd.trust;

      // Availability badge
      var availBadge = '';
      var availNorm = (a.availability || '').toLowerCase();
      if (availNorm === 'available' || availNorm === 'disponible') {
        availBadge = '<span style="color:#20C997;font-weight:600">● Disponible</span>';
      } else if (availNorm === 'busy' || availNorm === 'occupé' || availNorm === 'occupe') {
        availBadge = '<span style="color:#FCAF45;font-weight:600">● Occupé</span>';
      } else {
        availBadge = '<span style="color:rgba(255,255,255,.4)">● ' + artAvail + '</span>';
      }

      return [
        '<div class="fxdisp-artisan-card" style="',
          'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);',
          'border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;',
          'position:relative;">',

          // Score badge
          '<div style="position:absolute;top:10px;right:10px;',
            'background:' + scoreColor + '22;border:1px solid ' + scoreColor + '55;',
            'color:' + scoreColor + ';font-size:.85rem;font-weight:800;',
            'padding:3px 10px;border-radius:20px;">',
            sc + '</div>',

          // Artisan identity
          '<div style="font-weight:700;font-size:.92rem;padding-right:50px">' + artName + '</div>',
          '<div style="font-size:.78rem;color:rgba(255,255,255,.6);display:flex;gap:10px;flex-wrap:wrap">',
            '<span>📍 ' + artCity + '</span>',
            '<span>🔧 ' + artCat + '</span>',
            '<span>' + availBadge + '</span>',
          '</div>',

          // Stats row
          '<div style="font-size:.75rem;color:rgba(255,255,255,.5);display:flex;gap:10px;flex-wrap:wrap">',
            '<span>✅ ' + artCm + ' missions</span>',
            artRat > 0 ? '<span>⭐ ' + artRat.toFixed(1) + '</span>' : '',
            '<span>🛡️ Confiance ' + trustSc + '%</span>',
          '</div>',

          // Score breakdown (compact)
          '<div style="font-size:.7rem;color:rgba(255,255,255,.35);display:flex;gap:6px;flex-wrap:wrap">',
            '<span>Service ' + bd.service + '</span>',
            '<span>· Ville ' + bd.city + '</span>',
            '<span>· Dispo ' + bd.availability + '</span>',
            '<span>· Perf ' + bd.performance + '</span>',
          '</div>',

          // One-click assign button (Phase 3)
          '<button class="fxdisp-assign-btn"',
            ' data-req-id="' + _esc(reqId) + '"',
            ' data-artisan-id="' + artId + '"',
            ' data-artisan-name="' + artName + '"',
            ' data-artisan-phone="' + _esc(String(a.phone || a.phone_public || '')) + '"',
            ' data-artisan-cat="' + artCat + '"',
            ' style="margin-top:4px;padding:7px 14px;border-radius:8px;border:none;',
              'background:linear-gradient(135deg,#E1306C,#405DE6);color:#fff;',
              'font-size:.78rem;font-weight:700;cursor:pointer;width:100%;',
              'transition:opacity .15s;">',
            '⚡ Assigner',
          '</button>',

        '</div>'
      ].join('');
    }).join('');

    if (!artisanCards) {
      artisanCards = '<div style="color:rgba(255,255,255,.35);font-size:.82rem;padding:12px">Aucun artisan trouvé pour cette demande.</div>';
    }

    return [
      '<div class="fxdisp-request-block" style="',
        'background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);',
        'border-radius:16px;padding:20px;margin-bottom:20px;">',

        // Request header
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px">',
          '<div>',
            '<div style="font-weight:700;font-size:.95rem">',
              '📋 Demande #' + _esc(refId),
              ' <span style="font-size:.75rem;color:rgba(255,255,255,.4);font-weight:400">',
                String(request.created_at || '').slice(0,10),
              '</span>',
            '</div>',
            '<div style="font-size:.82rem;color:rgba(255,255,255,.55);margin-top:3px">',
              '📍 ' + _esc(city) + ' &nbsp;·&nbsp; 🔧 ' + _esc(svc),
            '</div>',
            desc ? '<div style="font-size:.78rem;color:rgba(255,255,255,.35);margin-top:4px;font-style:italic">"' + _esc(desc) + '…"</div>' : '',
          '</div>',
          '<span style="background:rgba(225,48,108,.15);color:#E1306C;font-size:.72rem;',
            'font-weight:700;padding:4px 10px;border-radius:20px;">⏳ En attente</span>',
        '</div>',

        // Artisan suggestions grid
        '<div style="font-size:.75rem;color:rgba(255,255,255,.4);margin-bottom:10px;font-weight:600">',
          'TOP ' + ranked.length + ' ARTISANS RECOMMANDÉS — Score (/100)',
        '</div>',
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">',
          artisanCards,
        '</div>',

      '</div>'
    ].join('');
  }

  /**
   * refreshSuggestions()
   * Re-computes rankings for all pending requests and re-renders.
   * Called on section open and on manual refresh.
   */
  function refreshSuggestions() {
    _ensureSuggestionsSection();
    var grid = document.getElementById('fxdisp-suggestions-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="color:rgba(255,255,255,.4);text-align:center;padding:40px">Calcul des scores…</div>';

    // Get pending requests
    var requests = _getPendingRequests();

    // Update sidebar badge
    var badge = document.getElementById('sc-dispatch');
    if (badge) badge.textContent = requests.length;

    if (!requests.length) {
      grid.innerHTML = '<div style="color:rgba(255,255,255,.4);text-align:center;padding:60px">'
        + '<div style="font-size:2rem;margin-bottom:12px">✅</div>'
        + '<div style="font-weight:700">Aucune demande en attente</div>'
        + '<div style="font-size:.8rem;margin-top:6px">Toutes les demandes ont été assignées.</div>'
        + '</div>';
      _updateKPIs();
      return;
    }

    var html = requests.map(function(req) {
      var ranked = rankArtisansForRequest(req, 5);
      return _renderSuggestionBlock(req, ranked);
    }).join('');

    grid.innerHTML = html || '<div style="color:rgba(255,255,255,.4);text-align:center;padding:40px">Aucun résultat.</div>';
    _updateKPIs();
  }

  /* ── PHASE 3: ONE-CLICK ASSIGNMENT ──────────────────────────────────── */

  /**
   * assignArtisan(reqId, artisanId, artisanName, artisanPhone, artisanCat)
   * 1. UPDATE service_requests.status = 'assigned'
   * 2. INSERT missions row
   * 3. Refresh admin UI
   */
  async function assignArtisan(reqId, artisanId, artisanName, artisanPhone, artisanCat) {
    if (!reqId || !artisanId || !artisanName) {
      _toast('Données manquantes pour l\'assignation', 'error');
      return { ok: false, reason: 'missing_params' };
    }

    var fsc = window.FixeoSupabaseClient;
    if (!fsc || !fsc.CONFIGURED) {
      _toast('Supabase non configuré — assignation impossible', 'error');
      return { ok: false, reason: 'no_supabase' };
    }

    _toast('Assignation en cours…', 'info');

    try {
      await fsc.ready();
      var sb = fsc.client;
      if (!sb) throw new Error('Supabase client unavailable');

      // Step 1: UPDATE service_requests status → assigned
      var _r1 = await sb.from('service_requests')
        .update({ status: 'assigned' })
        .eq('id', reqId);
      if (_r1.error) {
        console.warn('[FixeoDispatch] service_requests update error:', _r1.error.message);
        // Non-blocking — continue with missions insert
      }

      // Step 2: INSERT into missions
      // Note: client_profile_id fetched from the request row
      var _r2 = await sb.from('service_requests')
        .select('client_profile_id')
        .eq('id', reqId)
        .maybeSingle();
      var clientProfileId = (_r2.data && _r2.data.client_profile_id) || null;

      var missionRow = {
        request_id:         reqId,
        artisan_profile_id: artisanId,
        client_profile_id:  clientProfileId,
        status:             'pending',
        agreed_price:       0
      };
      var _r3 = await sb.from('missions').insert([missionRow]);
      if (_r3.error) {
        console.warn('[FixeoDispatch] missions INSERT error:', _r3.error.message);
        // Non-blocking — assignment still recorded on service_requests
      }

      // Step 3: Sync to localStorage via existing bridge
      _patchLocalRequest(reqId, {
        status:              'acceptée',
        assigned_artisan:    artisanName,
        assigned_artisan_id: artisanId,
        artisan_phone:       artisanPhone || '',
        artisan_category:    artisanCat   || '',
        accepted_at:         new Date().toISOString()
      });

      // Step 4: Refresh all admin sections
      try {
        window.dispatchEvent(new CustomEvent('fixeo:admin:refresh', { detail: { source: 'dispatch' } }));
        window.dispatchEvent(new CustomEvent('fixeo:client-request-updated', { detail: { id: reqId } }));
      } catch(e) {}

      // Step 5: Re-render suggestions after short delay
      setTimeout(refreshSuggestions, 600);

      _toast('✅ ' + artisanName + ' assigné avec succès', 'success');
      return { ok: true };

    } catch(err) {
      console.warn('[FixeoDispatch] assignArtisan error:', err && err.message);
      _toast('Erreur lors de l\'assignation — voir console', 'error');
      return { ok: false, reason: err && err.message };
    }
  }

  /* ── PHASE 4: OPERATIONS KPI ENGINE ────────────────────────────────── */

  /**
   * _updateKPIs()
   * Computes and writes all 8 KPI values to the DOM.
   */
  function _updateKPIs() {
    var allReqs  = _getAllRequests();
    var artisans = [];
    try {
      if (window.FixeoDB && typeof window.FixeoDB.getAllArtisans === 'function') {
        artisans = window.FixeoDB.getAllArtisans() || [];
      }
    } catch(e) {}

    // Request states
    var pending   = allReqs.filter(function(r) { return _isPending(r); }).length;
    var assigned  = allReqs.filter(function(r) { return _isAssigned(r); }).length;
    var completed = allReqs.filter(function(r) { return _isCompleted(r); }).length;

    // Artisan states
    var available = artisans.filter(function(a) {
      var av = _norm(a.availability || '');
      return av === 'available' || av === 'disponible';
    }).length;

    // Active = has a recent mission or assigned status
    var active = artisans.filter(function(a) {
      return _daysSince(a.updated_at) <= 30;
    }).length;

    // Acceptance rate: assigned / (assigned + pending) if > 0
    var totalActionable = assigned + pending;
    var acceptanceRate = totalActionable > 0
      ? Math.round((assigned / totalActionable) * 100) + '%'
      : '—';

    // Completion rate: completed / (completed + assigned)
    var totalOngoing = completed + assigned;
    var completionRate = totalOngoing > 0
      ? Math.round((completed / totalOngoing) * 100) + '%'
      : '—';

    // Average assignment time: not yet computable from available fields → show N/A
    var avgTime = '—';

    _kpi('fxdisp-kpi-pending',    pending);
    _kpi('fxdisp-kpi-assigned',   assigned);
    _kpi('fxdisp-kpi-completed',  completed);
    _kpi('fxdisp-kpi-available',  available);
    _kpi('fxdisp-kpi-active',     active);
    _kpi('fxdisp-kpi-acceptance', acceptanceRate);
    _kpi('fxdisp-kpi-completion', completionRate);
    _kpi('fxdisp-kpi-avgtime',    avgTime);
  }

  /* ── REQUEST HELPERS ─────────────────────────────────────────────────── */

  function _getAllRequests() {
    // Merge Supabase cache + localStorage via existing admin engine
    try {
      if (window.FixeoAdminEngine && typeof window.FixeoAdminEngine.readRequests === 'function') {
        return window.FixeoAdminEngine.readRequests() || [];
      }
    } catch(e) {}
    // Direct Supabase cache fallback
    if (Array.isArray(window.__fxAccSbCache)) return window.__fxAccSbCache;
    return [];
  }

  function _getPendingRequests() {
    return _getAllRequests().filter(_isPending);
  }

  function _isPending(r) {
    var st = _norm(r.status || '');
    return st === 'new' || st === 'nouvelle' || st === '' || (!r.assigned_artisan && !r.assigned_artisan_id);
  }

  function _isAssigned(r) {
    var st = _norm(r.status || '');
    return st === 'assigned' || st === 'acceptée' || st === 'acceptee'
        || st === 'in_progress' || st === 'en_cours';
  }

  function _isCompleted(r) {
    var st = _norm(r.status || '');
    return st === 'completed' || st === 'terminée' || st === 'terminee'
        || st === 'validated' || st === 'validée' || st === 'validee';
  }

  function _patchLocalRequest(id, patch) {
    try {
      var KEY = 'fixeo_client_requests';
      var arr = JSON.parse(localStorage.getItem(KEY) || '[]');
      var found = false;
      var next = arr.map(function(r) {
        if (String(r.id || '') !== String(id)) return r;
        found = true;
        return Object.assign({}, r, patch);
      });
      if (found) localStorage.setItem(KEY, JSON.stringify(next));
      // Also update Supabase cache
      if (Array.isArray(window.__fxAccSbCache)) {
        window.__fxAccSbCache = window.__fxAccSbCache.map(function(r) {
          return String(r.id || '') === String(id) ? Object.assign({}, r, patch) : r;
        });
      }
    } catch(e) {}
  }

  /* ── UI HELPERS ─────────────────────────────────────────────────────── */

  function _kpi(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val !== undefined && val !== null ? val : '—';
  }

  var _toastTimer = null;
  function _toast(msg, type) {
    // Reuse existing admin toast if available, else simple console
    if (typeof window._showDispatchToast === 'function') { window._showDispatchToast(msg, type); return; }
    // Try admin-mission-supervision p3 toast
    var existingToast = document.getElementById('fxams3-toast');
    if (existingToast) {
      existingToast.textContent = msg;
      existingToast.className = 'fxams3-toast ' + (type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : 'toast-info');
      existingToast.style.display = 'block';
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function() { existingToast.style.display = 'none'; }, 3000);
      return;
    }
    console.log('[FixeoDispatch]', type.toUpperCase(), msg);
  }

  /* ── EVENT DELEGATION: one-click assign button ─────────────────────── */

  function _bindEvents() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.fxdisp-assign-btn');
      if (!btn) return;

      // Confirm before assigning
      var artName = btn.dataset.artisanName;
      if (!confirm('Assigner ' + artName + ' à cette demande ?')) return;

      btn.disabled = true;
      btn.textContent = '⏳ En cours…';

      assignArtisan(
        btn.dataset.reqId,
        btn.dataset.artisanId,
        btn.dataset.artisanName,
        btn.dataset.artisanPhone,
        btn.dataset.artisanCat
      ).then(function(result) {
        if (!result.ok) {
          btn.disabled = false;
          btn.textContent = '⚡ Assigner';
        }
        // On success, refreshSuggestions() re-renders the whole grid (btn removed)
      });
    });
  }

  /* ── INTEGRATION: hook into adminSection() ──────────────────────────── */

  function _hookAdminSection() {
    var origAdminSection = window.adminSection;
    if (typeof origAdminSection !== 'function') return;

    window.adminSection = function(section) {
      origAdminSection(section);
      if (section === 'dispatch') {
        _ensureSuggestionsSection();
        setTimeout(refreshSuggestions, 100);
      }
    };
  }

  /* ── INIT ────────────────────────────────────────────────────────────── */

  function _init() {
    _bindEvents();
    _hookAdminSection();

    /* v1b FIX: inject sidebar link + section container immediately on load.
     * Previously called only from refreshSuggestions() / adminSection('dispatch'),
     * creating a chicken-and-egg: the link never appeared because it was only
     * injected when the user clicked it — which they couldn't since it didn't exist.
     * Defer by one tick to ensure admin.js has already populated the sidebar DOM. */
    setTimeout(_ensureSuggestionsSection, 0);

    // Refresh when admin data changes
    window.addEventListener('fixeo:admin:refresh', function(e) {
      var detail = (e && e.detail) || {};
      if (detail.source === 'dispatch') return; // prevent self-loop
      // Update KPIs if dispatch section is visible
      if (document.getElementById('admin-section-dispatch') &&
          document.getElementById('admin-section-dispatch').style.display !== 'none') {
        refreshSuggestions();
      }
    });

    // Auto-refresh badge on load (after _ensureSuggestionsSection has run)
    setTimeout(function() {
      var pending = _getPendingRequests().length;
      var badge = document.getElementById('sc-dispatch');
      if (badge) badge.textContent = pending;
    }, 2000);
  }

  /* ── PUBLIC API ──────────────────────────────────────────────────────── */

  window.FixeoDispatch = {
    VERSION:               VERSION,
    scoreArtisan:          scoreArtisan,
    scoreServiceMatch:     scoreServiceMatch,
    scoreCityMatch:        scoreCityMatch,
    scoreAvailability:     scoreAvailability,
    scoreTrust:            scoreTrust,
    scorePerformance:      scorePerformance,
    scoreActivity:         scoreActivity,
    rankArtisansForRequest:rankArtisansForRequest,
    refreshSuggestions:    refreshSuggestions,
    assignArtisan:         assignArtisan,
    updateKPIs:            _updateKPIs,
    getPendingRequests:    _getPendingRequests
  };

  // Defer init until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 0);
  }

  console.log('[FixeoDispatch] Smart Dispatch Engine ' + VERSION + ' loaded');

})();
