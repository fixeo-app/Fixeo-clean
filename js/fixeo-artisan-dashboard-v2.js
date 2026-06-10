/* ============================================================
   FIXEO — Artisan Dashboard V2
   js/fixeo-artisan-dashboard-v2.js   v1a

   Phase 1 scope:
     - Require artisan auth (requireAuth)
     - Load artisan profile via owner_user_id → artisans table
     - Show profile header (name, city, service_category, verified)
     - Show matching open requests (status=new, city+category filter)
     - Show assigned missions (missions WHERE artisan_profile_id)
     - Real KPIs from Supabase only
     - No localStorage business logic
     - No fake data
     - Single delegated event listener
     - Mobile-first

   NEVER TOUCH: commission-lifecycle-p3a.js, fixeo-supabase-core.js,
                fixeo-auth-guard.js, supabase-client.js, auth-global.js,
                fixeo-client-requests-store.js, cod-payment.js
   ============================================================ */

(function (window, document) {
  'use strict';

  var VERSION = 'v1g';

  /* ── STATE ────────────────────────────────────────────────── */
  var _state = {
    session:        null,   /* Supabase session */
    profile:        null,   /* profiles row (auth.uid()) */
    artisanProfile: null,   /* artisans row (owner_user_id = auth.uid()) */
    openRequests:   [],     /* matching new requests (city + category filtered) */
    myMissions:     [],     /* service_requests assigned to this artisan */
    section:        'dashboard'
  };

  /* ── HELPERS ──────────────────────────────────────────────── */
  function el(id)  { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeText(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').trim();
  }

  function timeAgo(iso) {
    if (!iso) return '';
    try {
      var diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60)    return 'Il y a quelques secondes';
      if (diff < 3600)  return 'Il y a ' + Math.floor(diff / 60)   + ' min';
      if (diff < 86400) return 'Il y a ' + Math.floor(diff / 3600) + 'h';
      return 'Il y a ' + Math.floor(diff / 86400) + 'j';
    } catch(e) { return ''; }
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return ((p[0] ? p[0][0] : '') + (p[1] ? p[1][0] : '')).toUpperCase() || '?';
  }

  function _btnBusy(btn, label) {
    if (!btn) return;
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = label;
  }
  function _btnReset(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn._origText || '';
  }

  /* ── MATCHING LOGIC ───────────────────────────────────────── */
  function _cityMatch(reqCity, artisan) {
    if (!reqCity || !artisan) return false;
    var req  = normalizeText(reqCity);
    var city = normalizeText(artisan.city || '');
    if (!req || !city) return false;
    if (req === city) return true;
    /* work_zone: string (comma-sep) or array */
    var zones = [];
    if (Array.isArray(artisan.work_zone)) {
      zones = artisan.work_zone;
    } else if (typeof artisan.work_zone === 'string' && artisan.work_zone.trim()) {
      zones = artisan.work_zone.split(',');
    }
    return zones.some(function(z) { return normalizeText(z) === req; });
  }

  /* ── SERVICE FAMILY SYNONYMS ─────────────────────────────────
   * Maps canonical artisan service_category (normalized) to a list
   * of normalized keywords that should also match that category.
   * Used by _categoryMatch() AFTER the primary exact/keyword test.
   * Add new families here — no other code changes needed.          */
  var CATEGORY_SYNONYMS = {
    'plomberie': [
      'plomberie','fuite','fuite deau','eau','robinet','canalisation',
      'debouchage','evier','lavabo','wc','toilette',
      'chauffe eau','chauffe-eau','siphon'
    ],
    'serrurerie': [
      'serrurerie','serrure','porte bloquee','ouverture de porte',
      'cle','verrou','cylindre','canon'
    ],
    'electricite': [
      'electricite','panne electrique','prise','disjoncteur',
      'tableau electrique','court circuit','courtcircuit','lumiere','interrupteur'
    ]
  };

  /* Returns true if any word in reqNorm matches any synonym of canonicalNorm. */
  function _synonymMatch(reqNorm, canonicalNorm) {
    var synonyms = CATEGORY_SYNONYMS[canonicalNorm];
    if (!synonyms) return false;
    /* Split request text into words for per-word lookup */
    var words = reqNorm.split(/\s+/).filter(Boolean);
    return synonyms.some(function(syn) {
      /* Full-phrase match OR any single word of request matches a synonym */
      return reqNorm === syn
        || reqNorm.includes(syn)
        || syn.includes(reqNorm)
        || words.some(function(w) { return w === syn || syn.includes(w) && w.length >= 4; });
    });
  }

  function _categoryMatch(reqCat, artisan) {
    if (!reqCat || !artisan) return false;
    var req  = normalizeText(reqCat);
    var sc   = normalizeText(artisan.service_category || '');
    var cat  = normalizeText(artisan.category || '');
    if (!req) return false;
    /* 1. Exact or keyword-prefix match (unchanged) */
    if (req === sc || req === cat
        || (sc  && (sc.includes(req)  || req.includes(sc)))
        || (cat && (cat.includes(req) || req.includes(cat)))) return true;
    /* 2. Synonym / service-family match */
    return _synonymMatch(req, sc) || _synonymMatch(req, cat);
  }

  function _filterMatching(requests) {
    var ap = _state.artisanProfile;

    /* ── DIAGNOSTIC v1b-diag ─────────────────────────────────
     * Temporary — remove after root cause confirmed.
     * Logs visible in browser DevTools → Console.             */
    console.group('[fxav2-diag] _filterMatching');
    console.log('ARTISAN PROFILE');
    console.log('  city=', ap ? JSON.stringify(ap.city) : 'null (no profile)');
    console.log('  service_category=', ap ? JSON.stringify(ap.service_category) : 'null');
    console.log('  category=', ap ? JSON.stringify(ap.category) : 'null');
    console.log('  work_zone=', ap ? JSON.stringify(ap.work_zone) : 'null');
    console.log('REQUESTS LOADED=', requests.length);

    if (!ap) {
      console.log('  → artisanProfile is null — returning []');
      console.groupEnd();
      return [];
    }

    var afterCity = requests.filter(function(r) { return _cityMatch(r.city, ap); });
    console.log('AFTER CITY FILTER=', afterCity.length);
    if (afterCity.length && afterCity.length <= 10) {
      afterCity.forEach(function(r, i) {
        console.log('  [city-pass '+i+'] city='+JSON.stringify(r.city)+' cat='+JSON.stringify(r.service_category));
      });
    }
    if (requests.length !== afterCity.length) {
      var cityBlocked = requests.filter(function(r){ return !_cityMatch(r.city, ap); });
      cityBlocked.slice(0,5).forEach(function(r,i){
        console.log('  [city-BLOCKED '+i+'] city='+JSON.stringify(r.city)+' cat='+JSON.stringify(r.service_category));
      });
    }

    var afterCat = afterCity.filter(function(r) { return _categoryMatch(r.service_category, ap); });
    console.log('AFTER CATEGORY FILTER=', afterCat.length);
    if (afterCity.length !== afterCat.length) {
      var catBlocked = afterCity.filter(function(r){ return !_categoryMatch(r.service_category, ap); });
      catBlocked.slice(0,5).forEach(function(r,i){
        console.log('  [cat-BLOCKED '+i+'] city='+JSON.stringify(r.city)+' cat='+JSON.stringify(r.service_category));
      });
    }

    console.log('FINAL RENDERED=', afterCat.length);
    console.groupEnd();
    /* ── END DIAGNOSTIC ───────────────────────────────────── */

    return afterCat;
  }

  /* ── DATA FETCH ───────────────────────────────────────────── */
  async function _loadArtisanProfile(userId) {
    var FS = window.FixeoSupabase;
    var sb = await FS.getClient();

    /* Primary: owner_user_id = auth.uid() */
    var r1 = await sb.from('artisans')
      .select('id,name,full_name,city,service_category,category,phone_public,' +
              'verified,is_verified,availability,rating,review_count,completed_missions,' +
              'owner_user_id,claimed,claim_status,badge_label,avatar_color,work_zone')
      .eq('owner_user_id', userId)
      .maybeSingle();

    /* ── DIAGNOSTIC v1b-diag ─────────────────────────── */
    console.log('[fxav2-diag] _loadArtisanProfile uid='+userId);
    console.log('[fxav2-diag]   r1.error='+JSON.stringify(r1.error)+' r1.data='+JSON.stringify(r1.data));
    /* ── END DIAGNOSTIC ──────────────────────────────── */

    if (!r1.error && r1.data) return r1.data;

    /* Fallback: profiles.phone = artisans.phone (for accounts linked by phone) */
    if (_state.profile && _state.profile.phone) {
      var phone = String(_state.profile.phone).trim();
      var r2 = await sb.from('artisans')
        .select('id,name,full_name,city,service_category,category,phone_public,' +
                'verified,is_verified,availability,rating,review_count,completed_missions,' +
                'owner_user_id,claimed,claim_status,badge_label,avatar_color,work_zone')
        .eq('phone_public', phone)
        .maybeSingle();

      /* ── DIAGNOSTIC ──────────────────────────────── */
      console.log('[fxav2-diag]   phone fallback phone='+phone+' r2.error='+JSON.stringify(r2.error)+' r2.data='+JSON.stringify(r2.data));
      /* ── END DIAGNOSTIC ──────────────────────────── */

      if (!r2.error && r2.data) return r2.data;
    }

    return null;
  }

  async function _fetch() {
    var FS = window.FixeoSupabase;
    var uid = _state.session.user.id;

    /* Load artisan profile if not yet loaded */
    if (!_state.artisanProfile) {
      _state.artisanProfile = await _loadArtisanProfile(uid);
    }

    /* Fetch open requests + artisan missions in parallel */
    var results = await Promise.allSettled([
      FS.listOpenRequests(),
      FS.listArtisanMissions()
    ]);

    /* Open requests — filter to matching only */
    if (results[0].status === 'fulfilled') {
      _state.openRequests = _filterMatching(results[0].value || []);
    } else {
      console.warn('[fxav2] listOpenRequests error:', results[0].reason && results[0].reason.message);
      _state.openRequests = [];
    }

    /* My missions (service_requests where artisan is assigned) */
    if (results[1].status === 'fulfilled') {
      var missions = results[1].value || [];
      /* missions table has request_id — enrich with service_request data */
      _state.myMissions = missions;
    } else {
      console.warn('[fxav2] listArtisanMissions error:', results[1].reason && results[1].reason.message);
      _state.myMissions = [];
    }

    /* Also fetch service_requests for assigned missions to get status/city/description */
    if (_state.myMissions.length) {
      var sb = await FS.getClient();
      var reqIds = _state.myMissions.map(function(m) { return m.request_id; }).filter(Boolean);
      if (reqIds.length) {
        var srRes = await sb.from('service_requests')
          .select('id,service_category,city,description,status,final_price,created_at,updated_at')
          .in('id', reqIds);
        if (!srRes.error) {
          var srMap = {};
          (srRes.data || []).forEach(function(r) { srMap[r.id] = r; });
          _state.myMissions = _state.myMissions.map(function(m) {
            return Object.assign({}, m, { _request: srMap[m.request_id] || null });
          });
        }
      }
    }
  }

  /* ── KPI COMPUTATION ──────────────────────────────────────── */
  function _computeKPIs() {
    var assigned   = _state.myMissions.filter(function(m) {
      var st = (m._request && m._request.status) || m.status || '';
      return st === 'pending' || st === 'assigned' || st === 'in_progress';
    }).length;

    var completed  = _state.myMissions.filter(function(m) {
      var st = m._request && m._request.status;
      return st === 'validated' || st === 'completed';
    }).length;

    var available  = _state.openRequests.length;

    var revenue    = _state.myMissions.reduce(function(sum, m) {
      var price = m._request && Number(m._request.final_price || 0);
      var st    = m._request && m._request.status;
      if ((st === 'validated') && price > 0) {
        return sum + Math.round(price * 0.85); /* artisan net */
      }
      return sum;
    }, 0);

    return { assigned: assigned, completed: completed, available: available, revenue: revenue };
  }

  /* ── RENDER: SKELETON ─────────────────────────────────────── */
  function _renderSkeleton() {
    var cards = '';
    for (var i = 0; i < 3; i++) {
      cards += '<div class="fxa-skeleton-card">'
        + '<div class="fxa-skel fxa-skel-title"></div>'
        + '<div class="fxa-skel fxa-skel-line"></div>'
        + '<div class="fxa-skel fxa-skel-line-s"></div>'
        + '<div class="fxa-skel fxa-skel-badge" style="margin-top:12px"></div>'
        + '</div>';
    }
    return cards;
  }

  /* ── RENDER: PROFILE HEADER ───────────────────────────────── */
  function _renderProfileHeader() {
    var ap = _state.artisanProfile;
    var p  = _state.profile || {};
    var name = (ap && (ap.full_name || ap.name)) || p.full_name || 'Artisan';
    var city = ap && ap.city || '';
    var svc  = ap && (ap.service_category || ap.category) || '';
    var avail= ap && ap.availability || '';
    var verified = ap && (ap.verified || ap.is_verified);
    var ini  = initials(name);

    var tags = '';
    if (verified) tags += '<span class="fxa-tag verified">✓ Vérifié</span>';
    if (city)     tags += '<span class="fxa-tag city">📍 ' + esc(city) + '</span>';
    if (svc)      tags += '<span class="fxa-tag service">🔧 ' + esc(svc) + '</span>';
    if (avail === 'available') tags += '<span class="fxa-tag avail">● Disponible</span>';

    return '<div class="fxa-profile-header">'
      + '<div class="fxa-profile-avatar-lg">' + esc(ini) + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div class="fxa-profile-name">' + esc(name) + '</div>'
      + '<div class="fxa-profile-meta">Artisan Fixeo</div>'
      + (tags ? '<div class="fxa-profile-tags">' + tags + '</div>' : '')
      + '</div></div>';
  }

  /* ── RENDER: REQUEST CARD (available/open) ────────────────── */
  function _renderRequestCard(req) {
    var age = timeAgo(req.created_at);
    return '<div class="fxa-card" data-req-id="' + esc(req.id) + '">'
      + '<div class="fxa-card-head">'
      + '<span class="fxa-card-service">' + esc(req.service_category || 'Service') + '</span>'
      + '<span class="fxa-badge fxa-badge-new">Disponible</span>'
      + '</div>'
      + '<div class="fxa-card-meta">'
      + (req.city ? '<span class="fxa-card-meta-item">📍 ' + esc(req.city) + '</span>' : '')
      + (age      ? '<span class="fxa-card-meta-item">🕐 ' + esc(age)      + '</span>' : '')
      + '</div>'
      + (req.description
          ? '<div class="fxa-card-desc">' + esc(req.description) + '</div>'
          : '')
      + '<div class="fxa-actions">'
      + '<button class="fxa-btn fxa-btn-primary" data-action="accept-mission" data-req-id="' + esc(req.id) + '">'
      + '✅ Accepter la mission'
      + '</button>'
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: MISSION CARD (assigned) ─────────────────────── */
  function _renderMissionCard(mission) {
    var req  = mission._request || {};
    var st   = String(req.status || mission.status || 'pending').toLowerCase().trim();
    var name = _missionStatusLabel(st);
    var badge = _missionBadge(st);
    var price = Number(req.final_price || mission.agreed_price || 0);
    var net   = price > 0 ? Math.round(price * 0.85) : 0;

    var priceRow = '';
    if (price > 0) {
      priceRow = '<div class="fxa-info-row">'
        + '<span class="fxa-info-label">Prix final</span>'
        + '<span class="fxa-info-value">' + price.toLocaleString('fr-FR') + ' MAD</span>'
        + '</div>'
        + '<div class="fxa-info-row">'
        + '<span class="fxa-info-label">Votre revenu (85%)</span>'
        + '<span class="fxa-info-value" style="color:#20c997">' + net.toLocaleString('fr-FR') + ' MAD</span>'
        + '</div>';
    }

    return '<div class="fxa-card">'
      + '<div class="fxa-card-head">'
      + '<span class="fxa-card-service">'
      + esc(req.service_category || 'Mission')
      + '</span>'
      + badge
      + '</div>'
      + '<div class="fxa-card-meta">'
      + (req.city ? '<span class="fxa-card-meta-item">📍 ' + esc(req.city) + '</span>' : '')
      + '<span class="fxa-card-meta-item">🕐 ' + esc(timeAgo(req.created_at || mission.created_at)) + '</span>'
      + '</div>'
      + (req.description ? '<div class="fxa-card-desc">' + esc(req.description) + '</div>' : '')
      + priceRow
      + _missionActions(mission, st)
      + '</div>';
  }

  function _missionStatusLabel(st) {
    var m = {
      'pending':     'Mission acceptée',
      'assigned':    'Artisan assigné',
      'in_progress': 'En cours',
      'completed':   'Terminée — en attente confirmation',
      'validated':   'Validée',
      'cancelled':   'Annulée'
    };
    return m[st] || st;
  }

  function _missionBadge(st) {
    var cls = {
      'pending':     'fxa-badge-assigned',
      'assigned':    'fxa-badge-assigned',
      'in_progress': 'fxa-badge-progress',
      'completed':   'fxa-badge-confirm',
      'validated':   'fxa-badge-done',
      'cancelled':   'fxa-badge-cancelled'
    }[st] || 'fxa-badge-new';
    return '<span class="fxa-badge ' + cls + '">' + esc(_missionStatusLabel(st)) + '</span>';
  }

  function _missionActions(mission, st) {
    var reqId = (mission._request && mission._request.id) || mission.request_id || '';
    var html  = '<div class="fxa-actions">';

    if (st === 'pending' || st === 'assigned') {
      html += '<button class="fxa-btn fxa-btn-primary" '
        + 'data-action="start-mission" data-req-id="' + esc(reqId) + '">'
        + '▶ Démarrer l\'intervention</button>';
    } else if (st === 'in_progress') {
      html += '<button class="fxa-btn fxa-btn-success" '
        + 'data-action="complete-mission" data-req-id="' + esc(reqId) + '">'
        + '✓ Marquer terminée</button>';
    } else if (st === 'completed') {
      html += '<span class="fxa-btn fxa-btn-ghost" style="flex:1;cursor:default">'
        + '⏳ Attente confirmation client</span>';
    } else if (st === 'validated') {
      html += '<span class="fxa-btn fxa-btn-ghost" style="flex:1;cursor:default;color:#20c997">'
        + '✅ Mission validée</span>';
    }

    /* WhatsApp CTA always visible for active missions */
    if (st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'completed') {
      html += '<a class="fxa-btn fxa-btn-wa" href="https://wa.me/212660484415?text=Bonjour+Fixeo%2C+mission+' + esc(reqId.slice(0,8)) + '" target="_blank" rel="noopener">💬 Fixeo</a>';
    }

    return html + '</div>';
  }

  /* ── RENDER: SECTION — DASHBOARD ─────────────────────────── */
  function _renderDashboard() {
    var sec = el('fxav2-sec-dashboard');
    if (!sec) return;

    var ap = _state.artisanProfile;
    var profHtml = _renderProfileHeader();

    /* No profile linked gate */
    if (!ap) {
      sec.innerHTML = profHtml
        + '<div class="fxa-no-profile">'
        + '<div class="fxa-no-profile-icon">⚠️</div>'
        + '<div class="fxa-no-profile-title">Profil artisan non associé</div>'
        + '<div class="fxa-no-profile-sub">Votre compte n\'est pas encore lié à un profil artisan Fixeo. Contactez le support pour associer votre compte.</div>'
        + '</div>';
      return;
    }

    /* Profile incomplete warning */
    var warn = '';
    if (!ap.city || !(ap.service_category || ap.category)) {
      warn = '<div class="fxa-error-banner">⚠️ Configurez votre ville et votre métier pour recevoir des demandes.</div>';
    }

    /* Recent open requests (max 3) */
    var recentOpen = _state.openRequests.slice(0, 3);
    var openHtml = '';
    if (recentOpen.length) {
      openHtml = '<div class="fxa-section-head"><h2>📬 Disponibles</h2>'
        + '<span class="fxa-section-count">' + _state.openRequests.length + '</span>'
        + '</div>'
        + '<div class="fxa-card-list">' + recentOpen.map(_renderRequestCard).join('') + '</div>';
      if (_state.openRequests.length > 3) {
        openHtml += '<button class="fxa-btn fxa-btn-ghost fxa-btn-full" style="margin-top:10px" data-action="go-available">Voir toutes (' + _state.openRequests.length + ')</button>';
      }
    } else if (ap.city && (ap.service_category || ap.category)) {
      openHtml = '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">📬</div>'
        + '<div class="fxa-empty-title">Aucune demande disponible</div>'
        + '<div class="fxa-empty-sub">Aucune demande dans votre zone pour le moment. Vous serez notifié à chaque nouvelle demande.</div>'
        + '</div>';
    }

    /* Active missions (max 2) */
    var activeMissions = _state.myMissions.filter(function(m) {
      var st = (m._request && m._request.status) || m.status || '';
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'completed';
    }).slice(0, 2);
    var missionHtml = '';
    if (activeMissions.length) {
      missionHtml = '<div class="fxa-section-head" style="margin-top:20px"><h2>⚡ Mes missions</h2></div>'
        + '<div class="fxa-card-list">' + activeMissions.map(_renderMissionCard).join('') + '</div>';
    }

    sec.innerHTML = profHtml + warn + openHtml + missionHtml;
  }

  /* ── RENDER: SECTION — AVAILABLE ─────────────────────────── */
  function _renderAvailable() {
    var sec = el('fxav2-sec-available');
    if (!sec) return;

    var html = '<div class="fxa-section-head"><h2>📬 Demandes disponibles</h2>'
      + '<span class="fxa-section-count">' + _state.openRequests.length + '</span>'
      + '</div>';

    if (!_state.artisanProfile) {
      html += '<div class="fxa-no-profile"><div class="fxa-no-profile-icon">⚠️</div>'
        + '<div class="fxa-no-profile-title">Profil non associé</div>'
        + '<div class="fxa-no-profile-sub">Associez votre compte pour voir les demandes.</div></div>';
    } else if (!_state.openRequests.length) {
      html += '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">📬</div>'
        + '<div class="fxa-empty-title">Aucune demande disponible</div>'
        + '<div class="fxa-empty-sub">Aucune demande correspondant à votre ville et votre métier pour le moment.</div>'
        + '</div>';
    } else {
      html += '<div class="fxa-card-list">'
        + _state.openRequests.map(_renderRequestCard).join('')
        + '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── RENDER: SECTION — MY MISSIONS ───────────────────────── */
  function _renderMyMissions() {
    var sec = el('fxav2-sec-missions');
    if (!sec) return;

    var active = _state.myMissions.filter(function(m) {
      var st = (m._request && m._request.status) || m.status || '';
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'completed';
    });

    var html = '<div class="fxa-section-head"><h2>⚡ Mes missions</h2>'
      + '<span class="fxa-section-count">' + active.length + '</span>'
      + '</div>';

    if (!active.length) {
      html += '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">⚡</div>'
        + '<div class="fxa-empty-title">Aucune mission en cours</div>'
        + '<div class="fxa-empty-sub">Vos interventions actives s\'afficheront ici dès qu\'une mission vous sera assignée.</div>'
        + '</div>';
    } else {
      html += '<div class="fxa-card-list">' + active.map(_renderMissionCard).join('') + '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── RENDER: SECTION — HISTORY ────────────────────────────── */
  function _renderHistory() {
    var sec = el('fxav2-sec-history');
    if (!sec) return;

    var hist = _state.myMissions.filter(function(m) {
      var st = m._request && m._request.status;
      return st === 'validated' || st === 'cancelled';
    });

    var html = '<div class="fxa-section-head"><h2>📁 Historique</h2>'
      + '<span class="fxa-section-count">' + hist.length + '</span>'
      + '</div>';

    if (!hist.length) {
      html += '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">📁</div>'
        + '<div class="fxa-empty-title">Aucune mission clôturée</div>'
        + '<div class="fxa-empty-sub">Les missions terminées et validées apparaîtront ici.</div>'
        + '</div>';
    } else {
      html += '<div class="fxa-card-list">' + hist.map(_renderMissionCard).join('') + '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── RENDER: SECTION — PROFILE ────────────────────────────── */
  function _renderProfileSection() {
    var sec = el('fxav2-sec-profile');
    if (!sec) return;

    var ap = _state.artisanProfile || {};
    var p  = _state.profile || {};
    var u  = (_state.session && _state.session.user) || {};
    var name  = ap.full_name || ap.name || p.full_name || u.email || 'Artisan';
    var email = p.email || u.email || '';
    var phone = ap.phone_public || p.phone || '';
    var city  = ap.city || p.city || '';
    var svc   = ap.service_category || ap.category || '';
    var rating = Number(ap.rating || 0);
    var done   = Number(ap.completed_missions || 0);
    var verified = ap.verified || ap.is_verified || false;

    sec.innerHTML = '<div class="fxa-section-head"><h2>👤 Mon profil</h2></div>'
      + '<div class="fxa-profile-card">'
      + '<div class="fxa-profile-avatar-lg">' + esc(initials(name)) + '</div>'
      + '<div>'
      + '<div class="fxa-profile-name-lg">' + esc(name) + '</div>'
      + (email ? '<div class="fxa-profile-email">' + esc(email) + '</div>' : '')
      + '</div></div>'
      + _infoRow('Ville', city || '—')
      + _infoRow('Métier', svc || '—')
      + _infoRow('Téléphone', phone || '—')
      + _infoRow('Missions terminées', String(done))
      + _infoRow('Évaluation', rating >= 1 ? rating.toFixed(1) + ' / 5' : '—')
      + _infoRow('Statut', verified ? '✓ Vérifié' : 'En cours de vérification')
      + '<div class="fxa-divider"></div>'
      + '<button class="fxa-btn fxa-btn-ghost fxa-btn-full" style="justify-content:center" data-action="logout">Se déconnecter</button>';
  }

  function _infoRow(label, value) {
    return '<div class="fxa-info-row">'
      + '<span class="fxa-info-label">' + esc(label) + '</span>'
      + '<span class="fxa-info-value">' + esc(value) + '</span>'
      + '</div>';
  }

  /* ── RENDER: SECTION — SUPPORT ────────────────────────────── */
  function _renderSupport() {
    var sec = el('fxav2-sec-support');
    if (!sec) return;
    sec.innerHTML = '<div class="fxa-section-head"><h2>🆘 Support Fixeo</h2></div>'
      + _supportItem('https://wa.me/212660484415', '💬', 'WhatsApp Support', 'Réponse rapide 7j/7')
      + _supportItem('mailto:contact@fixeo.ma',    '📧', 'Email',            'contact@fixeo.ma')
      + _supportItem('https://fixeo.ma',           '🌐', 'Site web',         'www.fixeo.ma')
      + '<div class="fxa-error-banner" style="border-color:rgba(255,255,255,.10);color:rgba(255,255,255,.4);background:rgba(255,255,255,.03);margin-top:16px">'
      + 'Artisan Dashboard ' + VERSION + ' — Fixeo</div>';
  }

  function _supportItem(href, icon, label, desc) {
    return '<a class="fxa-btn fxa-btn-ghost" href="' + esc(href) + '" '
      + 'target="_blank" rel="noopener" '
      + 'style="display:flex;justify-content:flex-start;gap:12px;width:100%;margin-bottom:8px;min-height:52px">'
      + '<span style="font-size:1.3rem">' + icon + '</span>'
      + '<div style="text-align:left">'
      + '<div style="font-size:.84rem;font-weight:700">' + esc(label) + '</div>'
      + '<div style="font-size:.74rem;opacity:.55;font-weight:400">' + esc(desc) + '</div>'
      + '</div></a>';
  }

  /* ── RENDER: KPIs ─────────────────────────────────────────── */
  function _renderKPIs() {
    var kpis = _computeKPIs();
    function set(id, val) {
      var e = el(id);
      if (e) { e.textContent = val; e.classList.remove('loading'); }
    }
    set('fxav2-kpi-available', kpis.available);
    set('fxav2-kpi-active',    kpis.assigned);
    set('fxav2-kpi-done',      kpis.completed);
    set('fxav2-kpi-revenue',
      kpis.revenue > 0 ? kpis.revenue.toLocaleString('fr-FR') + ' MAD' : '—');
  }

  /* ── RENDER: SIDEBAR PROFILE ──────────────────────────────── */
  function _renderSidebarProfile() {
    var ap   = _state.artisanProfile || {};
    var p    = _state.profile || {};
    var u    = (_state.session && _state.session.user) || {};
    var name = ap.full_name || ap.name || p.full_name || u.email || 'Artisan';
    var sub  = ap.city || p.city || (u.email || '').split('@')[0] || '';
    var av   = el('fxav2-sb-avatar');
    var nm   = el('fxav2-sb-name');
    var sb   = el('fxav2-sb-sub');
    if (av) av.textContent = initials(name);
    if (nm) nm.textContent = name;
    if (sb) sb.textContent = sub;
  }

  /* ── MASTER RENDER ────────────────────────────────────────── */
  function _render() {
    _renderKPIs();
    _renderSidebarProfile();
    _renderDashboard();
    _renderAvailable();
    _renderMyMissions();
    _renderHistory();
    _renderProfileSection();
    _renderSupport();
  }

  /* ── NAVIGATION ───────────────────────────────────────────── */
  var SECTIONS = ['dashboard', 'available', 'missions', 'history', 'profile', 'support'];

  function _showSection(name) {
    if (SECTIONS.indexOf(name) === -1) name = 'dashboard';
    _state.section = name;

    SECTIONS.forEach(function(s) {
      var sec = el('fxav2-sec-' + s);
      if (sec) sec.classList.toggle('active', s === name);
    });
    document.querySelectorAll('.fxa-nav-link').forEach(function(a) {
      a.classList.toggle('active', a.dataset.section === name);
    });
    document.querySelectorAll('.fxa-bottom-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.section === name);
    });

    /* KPI bar: only on dashboard + available */
    var kpiBar = el('fxav2-kpi-bar');
    if (kpiBar) {
      kpiBar.style.display = (name === 'dashboard' || name === 'available') ? '' : 'none';
    }

    _closeSidebar();
  }

  function _openSidebar() {
    var s = el('fxav2-sidebar');
    var o = el('fxav2-overlay');
    var h = el('fxav2-hamburger');
    if (s) { s.classList.add('open');  s.setAttribute('aria-hidden', 'false'); }
    if (o) o.classList.add('show');
    if (h) { h.classList.add('open');  h.setAttribute('aria-expanded', 'true'); }
    document.body.style.overflow = 'hidden';
  }
  function _closeSidebar() {
    var s = el('fxav2-sidebar');
    var o = el('fxav2-overlay');
    var h = el('fxav2-hamburger');
    if (s) { s.classList.remove('open');  s.setAttribute('aria-hidden', 'true'); }
    if (o) o.classList.remove('show');
    if (h) { h.classList.remove('open');  h.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
  }

  /* ── NAV BINDING ──────────────────────────────────────────── */
  function _bindNav() {
    /* ONE hamburger listener */
    var ham = el('fxav2-hamburger');
    if (ham) {
      ham.addEventListener('click', function() {
        var s = el('fxav2-sidebar');
        if (s && s.classList.contains('open')) _closeSidebar(); else _openSidebar();
      });
    }
    var overlay = el('fxav2-overlay');
    if (overlay) overlay.addEventListener('click', _closeSidebar);

    document.querySelectorAll('.fxa-nav-link').forEach(function(a) {
      a.addEventListener('click', function() { _showSection(a.dataset.section); });
    });
    document.querySelectorAll('.fxa-bottom-btn').forEach(function(b) {
      b.addEventListener('click', function() { _showSection(b.dataset.section); });
    });

    var logoutBtn = el('fxav2-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        if (window.FixeoLogout && typeof window.FixeoLogout.logout === 'function') {
          window.FixeoLogout.logout();
        } else {
          localStorage.clear();
          window.location.href = 'auth.html';
        }
      });
    }

    var mClose = el('fxav2-modal-close');
    if (mClose) mClose.addEventListener('click', _closeModal);
    var mOverlay = el('fxav2-modal-overlay');
    if (mOverlay) mOverlay.addEventListener('click', function(e) {
      if (e.target === mOverlay) _closeModal();
    });
  }

  /* ── ACTION HANDLING ──────────────────────────────────────── */
  function _bindActions() {
    var main = el('fxav2-main');
    if (!main) return;
    main.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var reqId  = btn.dataset.reqId || '';
      switch (action) {
        case 'accept-mission':   return _doAcceptMission(reqId, btn);
        case 'start-mission':    return _doStartMission(reqId, btn);
        case 'complete-mission': return _doCompleteMission(reqId, btn);
        case 'go-available':     return _showSection('available');
        case 'logout':
          if (window.FixeoLogout && typeof window.FixeoLogout.logout === 'function') {
            window.FixeoLogout.logout();
          } else {
            localStorage.clear();
            window.location.href = 'auth.html';
          }
          break;
      }
    });
  }

  /* ── ACTIONS ──────────────────────────────────────────────── */
  /* ── ACCEPT MISSION ──────────────────────────────────────────
   * 1. Guard: verify request still status='new' (race-condition check)
   * 2. Guard: verify no mission row exists yet for this request_id
   * 3. INSERT missions row: request_id, artisan_profile_id, client_profile_id,
   *    agreed_price=0, commission_amount=0, status='assigned'
   * 4. UPDATE service_requests SET status='assigned'
   * 5. Refresh state (_fetch + _render) — removes from available, adds to missions
   * All guards use .maybeSingle() — no PGRST116.                              */
  async function _doAcceptMission(requestId, btn) {
    if (!requestId) return;
    var ap = _state.artisanProfile;
    if (!ap) { _toast('❌ Profil artisan non chargé.', 'error'); return; }

    _btnBusy(btn, 'Acceptation…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var auth = await FS.requireAuth('artisan');
      var artisanProfileId = auth.profile.id;  /* profiles.id = auth.uid() */

      /* ── Guard 1: request must still be status='new' ──── */
      var reqCheck = await sb.from('service_requests')
        .select('id, status, client_profile_id')
        .eq('id', requestId)
        .maybeSingle();
      if (reqCheck.error) throw reqCheck.error;
      if (!reqCheck.data) throw new Error('Demande introuvable.');
      if (reqCheck.data.status !== 'new') {
        throw new Error('Cette demande a déjà été prise en charge.');
      }

      /* ── Guard 2: no mission row yet for this request ─── */
      var missionCheck = await sb.from('missions')
        .select('id')
        .eq('request_id', requestId)
        .maybeSingle();
      if (missionCheck.error && String(missionCheck.error.code || '') !== 'PGRST116') {
        throw missionCheck.error;
      }
      if (missionCheck.data) {
        throw new Error('Une mission existe déjà pour cette demande.');
      }

      /* ── Step 1: INSERT mission row ───────────────────── */
      var missionInsert = await sb.from('missions').insert({
        request_id:         requestId,
        artisan_profile_id: artisanProfileId,
        client_profile_id:  reqCheck.data.client_profile_id || null,
        agreed_price:       0,
        commission_amount:  0,
        status:             'pending'   /* missions CHECK: pending|done|cancelled|validated */
      }).select('id').maybeSingle();
      if (missionInsert.error) throw missionInsert.error;
      if (!missionInsert.data) throw new Error('Création de mission bloquée (vérifiez les droits RLS).');

      /* ── Step 2: UPDATE service_requests status ───────── */
      var srUpdate = await sb.from('service_requests')
        .update({ status: 'assigned' })
        .eq('id', requestId)
        .eq('status', 'new')        /* optimistic lock — fails silently if raced */
        .select('id, status')
        .maybeSingle();
      if (srUpdate.error) throw srUpdate.error;
      /* srUpdate.data may be null if status was already changed — mission still created */

      _toast('🎉 Mission acceptée ! Elle apparaît dans "Mes missions".', 'success');
      await _refresh();  /* re-fetches open requests + missions, re-renders */

    } catch(e) {
      console.warn('[fxav2] acceptMission error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur lors de l\'acceptation.'), 'error');
      _btnReset(btn);
    }
  }

  async function _doStartMission(requestId, btn) {
    if (!requestId) return;
    _btnBusy(btn, 'Démarrage…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var res = await sb.from('service_requests')
        .update({ status: 'in_progress' })
        .eq('id', requestId)
        .select('id, status')
        .maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Mise à jour bloquée (droits insuffisants ou demande introuvable).');
      _toast('▶ Intervention démarrée !', 'success');
      await _refresh();
    } catch(e) {
      console.warn('[fxav2] startMission error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur lors du démarrage.'), 'error');
      _btnReset(btn);
    }
  }

  async function _doCompleteMission(requestId, btn) {
    if (!requestId) return;
    _btnBusy(btn, 'Enregistrement…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var res = await sb.from('service_requests')
        .update({ status: 'completed' })
        .eq('id', requestId)
        .select('id, status')
        .maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Mise à jour bloquée (droits insuffisants ou demande introuvable).');
      _toast('✅ Intervention marquée terminée. En attente de confirmation client.', 'success');
      await _refresh();
    } catch(e) {
      console.warn('[fxav2] completeMission error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur.'), 'error');
      _btnReset(btn);
    }
  }

  function _doContactFixeo(requestId) {
    var msg = 'Bonjour Fixeo, je suis intéressé par la demande ' + (requestId ? requestId.slice(0, 8) : '');
    window.open('https://wa.me/212660484415?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  /* ── MODAL ────────────────────────────────────────────────── */
  function _openModal(html) {
    var overlay = el('fxav2-modal-overlay');
    var body    = el('fxav2-modal-body');
    if (!overlay || !body) return;
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function _closeModal() {
    var overlay = el('fxav2-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ── TOAST ────────────────────────────────────────────────── */
  function _toast(msg, type) {
    var wrap = el('fxav2-toast-wrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'fxa-toast ' + (type || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
  }

  /* ── REFRESH ──────────────────────────────────────────────── */
  async function _refresh() {
    try {
      await _fetch();
      _render();
    } catch(e) {
      console.warn('[fxav2] refresh error:', e && e.message);
    }
  }

  /* ── LOGIN GATE ───────────────────────────────────────────── */
  function _showLoginGate(msg) {
    document.body.innerHTML = '<div class="fxa-gate">'
      + '<div class="fxa-gate-box">'
      + '<div class="fxa-gate-logo">Fixeo</div>'
      + '<div class="fxa-gate-icon">🔧</div>'
      + '<div class="fxa-gate-title">Espace Artisan</div>'
      + '<div class="fxa-gate-sub">Connectez-vous pour accéder à votre espace artisan.</div>'
      + (msg ? '<div class="fxa-error-banner" style="margin-bottom:16px">' + esc(msg) + '</div>' : '')
      + '<a class="fxa-btn fxa-btn-primary" href="auth.html" style="width:100%;justify-content:center;text-decoration:none">Se connecter</a>'
      + '</div></div>';
  }

  /* ── INIT ─────────────────────────────────────────────────── */
  async function init() {
    var FS = window.FixeoSupabase;
    if (!FS) { _showLoginGate('FixeoSupabase non disponible. Rechargez la page.'); return; }

    /* Skeletons immediately */
    ['fxav2-sec-dashboard', 'fxav2-sec-available', 'fxav2-sec-missions'].forEach(function(id) {
      var s = el(id);
      if (s) s.innerHTML = _renderSkeleton();
    });

    try {
      await FS.init();
      var session = await FS.getSession();
      if (!session || !session.user) { _showLoginGate(null); return; }
      _state.session = session;

      /* Profile */
      try {
        _state.profile = await FS.getProfile(session.user.id);
      } catch(e) {
        _state.profile = {
          id:        session.user.id,
          full_name: (session.user.user_metadata && session.user.user_metadata.full_name) || '',
          email:     session.user.email || '',
          city:      '',
          phone:     ''
        };
      }

      /* Wire nav + actions before fetch (sidebar responsive immediately) */
      _bindNav();
      _bindActions();
      _showSection('dashboard');

      /* Fetch data */
      await _fetch();

      /* Render */
      _render();

    } catch(e) {
      console.warn('[fxav2] init error:', e && e.message);
      if (e && String(e.message || '').toLowerCase().includes('session')) {
        _showLoginGate(null);
      } else {
        _showLoginGate('Erreur de chargement : ' + (e && e.message ? e.message : 'inconnue'));
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})(window, document);
