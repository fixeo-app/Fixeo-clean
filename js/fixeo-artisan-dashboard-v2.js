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

  /* ── ARTISAN ENGINE PRODUCTION BASELINE — v1p ─────────────────────────────
   * Mission lifecycle: accept (pending) → start (in_progress) → complete (completed)
   * SR_COLS: id,service_category,city,description,status,created_at (no final_price/updated_at)
   * RLS: artisan_read_own_linked_requests + artisan_update_assigned_requests on service_requests
   * Identity: artisans WHERE owner_user_id=auth.uid() OR phone_public=profiles.phone
   * ─────────────────────────────────────────────────────────────────────────── */
  var VERSION = 'v2d'; /* fxadv3-v1b: SELECT fix — trust_score (col DNE) removed */

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

    if (!ap) { return []; }

    var afterCity = requests.filter(function(r) { return _cityMatch(r.city, ap); });
    var afterCat  = afterCity.filter(function(r) { return _categoryMatch(r.service_category, ap); });
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
              'owner_user_id,claimed,claim_status,badge_label,avatar_color,work_zone,' +
              'response_time_min,description') /* fxadv3-v1b: trust_score removed (col DNE) */
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (!r1.error && r1.data) return r1.data;

    /* Fallback: profiles.phone = artisans.phone (for accounts linked by phone) */
    if (_state.profile && _state.profile.phone) {
      var phone = String(_state.profile.phone).trim();
      var r2 = await sb.from('artisans')
        .select('id,name,full_name,city,service_category,category,phone_public,' +
                'verified,is_verified,availability,rating,review_count,completed_missions,' +
                'owner_user_id,claimed,claim_status,badge_label,avatar_color,work_zone,' +
                'response_time_min,description') /* fxadv3-v1b: trust_score removed (col DNE) */
        .eq('phone_public', phone)
        .maybeSingle();
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

    /* Fetch open requests in parallel; missions queried separately below
     * using artisanProfile.id (artisans PK) — NOT auth.profile.id (auth uid).
     * listArtisanMissions() uses auth.profile.id which may differ from
     * artisans.id when owner_user_id ≠ profiles.id in the current session. */
    var results = await Promise.allSettled([
      FS.listOpenRequests()
    ]);

    /* Open requests — filter to matching only */
    if (results[0].status === 'fulfilled') {
      _state.openRequests = _filterMatching(results[0].value || []);
    } else {
      console.warn('[fxav2] listOpenRequests error:', results[0].reason && results[0].reason.message);
      _state.openRequests = [];
    }

    /* My missions — query by artisans.id (the artisan table PK stored in
     * _state.artisanProfile.id) so the link is always artisan-identity-based,
     * not session-uid-based.  This fixes the mismatch where missions were
     * inserted with artisan_profile_id = session uid ≠ artisanProfile.id.
     *
     * Going forward _doAcceptMission also writes artisanProfile.id so
     * both sides of the link use the same UUID. */
    var sb = await FS.getClient();
    var artisanId = _state.artisanProfile && _state.artisanProfile.id;
    var mRes = artisanId
      ? await sb.from('missions').select('*')
          .eq('artisan_profile_id', artisanId)
          .order('created_at', { ascending: false })
      : { data: [], error: null };
    if (mRes.error) {
      console.warn('[fxav2] listMissions error:', mRes.error.message);
      _state.myMissions = [];
    } else {
      _state.myMissions = mRes.data || [];
    }

    /* Enrich missions with service_request data (category, city, description, date).
     * The bulk .in() query requires a SELECT RLS policy covering assigned requests.
     * If it returns 0 rows (RLS blocks artisan from reading client's requests),
     * fall back to individual per-mission queries using client_profile_id path. */
    if (_state.myMissions.length) {
      var reqIds = _state.myMissions.map(function(m) { return m.request_id; }).filter(Boolean);
      if (reqIds.length) {
        var SR_COLS = 'id,service_category,city,description,status,created_at';
        var srRes = await sb.from('service_requests')
          .select(SR_COLS)
          .in('id', reqIds);
        var srMap = {};
        if (!srRes.error && srRes.data && srRes.data.length) {
          srRes.data.forEach(function(r) { srMap[r.id] = r; });
        } else {
          /* Bulk read returned nothing — try individual queries per mission. */
          for (var mi = 0; mi < _state.myMissions.length; mi++) {
            var rid = _state.myMissions[mi].request_id;
            if (!rid) continue;
            var indRes = await sb.from('service_requests')
              .select(SR_COLS)
              .eq('id', rid)
              .maybeSingle();
            if (!indRes.error && indRes.data) { srMap[rid] = indRes.data; }
          }
        }
        _state.myMissions = _state.myMissions.map(function(m) {
          return Object.assign({}, m, { _request: srMap[m.request_id] || null });
        });
      }
    }
  }

  /* ── KPI COMPUTATION ──────────────────────────────────────── */
  function _computeKPIs() {
    var assigned   = _state.myMissions.filter(function(m) {
      var st = (m._request && m._request.status) || m.status || '';
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours';
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

  /* ── RENDER: MISSION CARD ────────────────────────────────── */
  function _renderMissionCard(mission) {
    var req   = mission._request || null;
    var st    = String((req && req.status) || mission.status || 'pending').toLowerCase().trim();
    var badge = _missionBadge(st);
    var price = Number((req && req.final_price) || mission.agreed_price || 0);
    var net   = price > 0 ? Math.round(price * 0.85) : 0;
    var mDate = (req && req.created_at) || mission.created_at || '';

    /* ── Header: category + badge ── */
    var catLabel = (req && (req.service_category || req.category))
      || mission.service_category || '';
    var headerHtml = '<div class="fxa-card-head">'
      + '<span class="fxa-card-service">' + esc(catLabel || 'Demande') + '</span>'
      + badge
      + '</div>';

    /* ── Meta row: city + date ── */
    var city = (req && req.city) || '';
    var metaHtml = '<div class="fxa-card-meta">'
      + (city ? '<span class="fxa-card-meta-item">📍 ' + esc(city) + '</span>' : '')
      + '<span class="fxa-card-meta-item">🕐 ' + esc(timeAgo(mDate)) + '</span>'
      + '</div>';

    /* ── Description ── */
    var desc = (req && req.description) || '';
    var descHtml = desc
      ? '<div class="fxa-card-desc">' + esc(desc.slice(0, 180)) + (desc.length > 180 ? '…' : '') + '</div>'
      : '';

    /* ── Price rows ── */
    var priceHtml = '';
    if (price > 0) {
      priceHtml = '<div class="fxa-info-row">'
        + '<span class="fxa-info-label">Prix final</span>'
        + '<span class="fxa-info-value">' + price.toLocaleString('fr-FR') + ' MAD</span>'
        + '</div>'
        + '<div class="fxa-info-row">'
        + '<span class="fxa-info-label">Votre revenu (85 %)</span>'
        + '<span class="fxa-info-value" style="color:#20c997">' + net.toLocaleString('fr-FR') + ' MAD</span>'
        + '</div>';
    }

    /* ── Fallback banner when _request is null (RLS blocked enrichment) ── */
    var fallbackHtml = '';
    if (!req) {
      var shortId = String(mission.request_id || mission.id || '').slice(0, 8);
      fallbackHtml = '<div class="fxa-info-row" style="opacity:.7">'
        + '<span class="fxa-info-label">Réf. demande</span>'
        + '<span class="fxa-info-value fxa-muted">#' + esc(shortId) + '</span>'
        + '</div>'
        + '<div class="fxa-info-row" style="opacity:.7">'
        + '<span class="fxa-info-label">Statut mission</span>'
        + '<span class="fxa-info-value fxa-muted">' + esc(_missionStatusLabel(st)) + '</span>'
        + '</div>';
    }

    return '<div class="fxa-card">'
      + headerHtml
      + metaHtml
      + descHtml
      + fallbackHtml
      + priceHtml
      + _missionActions(mission, st)
      + '</div>';
  }

  function _missionStatusLabel(st) {
    var m = {
      'pending':     'Mission acceptée',
      'assigned':    'Artisan assigné',
      'in_progress': 'En cours',
      'en_cours':    'Intervention en cours',
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
      'en_cours':    'fxa-badge-progress',
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
    } else if (st === 'in_progress' || st === 'en_cours') {
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
    if (st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours' || st === 'completed') {
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

    /* No profile linked gate — but still show missions if any exist */
    if (!ap) {
      var activeFallback = _state.myMissions.filter(function(m) {
        var st = (m._request && m._request.status) || m.status || '';
        return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours' || st === 'completed';
      });
      var missionFallbackHtml = activeFallback.length
        ? '<div class="fxa-section-head" style="margin-top:20px"><h2>⚡ Mes missions</h2>'
          + '<span class="fxa-section-count">' + activeFallback.length + '</span></div>'
          + '<div class="fxa-card-list">' + activeFallback.map(_renderMissionCard).join('') + '</div>'
        : '';
      /* Check Supabase claim_requests for a pending claim from this user */
      var uid = _state.session && _state.session.user && _state.session.user.id;
      (async function _renderNoProfile() {
        var claimHtml = '';
        try {
          if (uid && window.FixeoSupabase) {
            var sbC = await window.FixeoSupabase.getClient();
            var cr = await sbC.from('claim_requests')
              .select('id,artisan_legacy_id,requester_name,status,created_at,onboarding_data')
              .eq('requester_user_id', uid)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!cr.error && cr.data) {
              var crRow = cr.data;
              var ob = {};
              try { ob = typeof crRow.onboarding_data === 'string' ? JSON.parse(crRow.onboarding_data) : (crRow.onboarding_data || {}); } catch(e) {}
              var artisanName = ob.artisan_name || crRow.artisan_legacy_id || '';
              if (crRow.status === 'pending') {
                claimHtml = '<div class="fxa-claim-pending">'
                  + '<div class="fxa-claim-pending-icon">⏳</div>'
                  + '<div class="fxa-claim-pending-body">'
                  + '<div class="fxa-claim-pending-title">Revendication en cours de validation</div>'
                  + '<div class="fxa-claim-pending-sub">Votre demande pour <strong>' + esc(artisanName) + '</strong> est en attente de validation par l\'équipe Fixeo. Vous serez contacté sous 24h par WhatsApp.</div>'
                  + '</div></div>';
              } else if (crRow.status === 'rejected') {
                claimHtml = '<div class="fxa-claim-rejected">'
                  + '<div class="fxa-claim-rejected-icon">❌</div>'
                  + '<div class="fxa-claim-rejected-body">'
                  + '<div class="fxa-claim-rejected-title">Demande de revendication refusée</div>'
                  + '<div class="fxa-claim-rejected-sub">Votre demande n\'a pas pu être validée. Contactez le support Fixeo pour plus d\'informations.</div>'
                  + '<a href="https://wa.me/212660484415" target="_blank" class="fxa-btn fxa-btn-wa" style="margin-top:10px;display:inline-block">📲 Contacter le support</a>'
                  + '</div></div>';
              }
            }
          }
        } catch(e) {
          console.warn('[fxav2] claim check failed:', e && e.message);
        }

        if (!claimHtml) {
          claimHtml = '<div class="fxa-no-profile">'
            + '<div class="fxa-no-profile-icon">🏷️</div>'
            + '<div class="fxa-no-profile-title">Aucun profil artisan associé</div>'
            + '<div class="fxa-no-profile-sub">Votre compte n\'est pas encore lié à un profil artisan. Rendez-vous sur la fiche d\'un artisan pour revendiquer votre profil, ou contactez le support.</div>'
            + '<a href="https://wa.me/212660484415" target="_blank" class="fxa-btn fxa-btn-wa" style="margin-top:12px;display:inline-block">📲 Contacter le support</a>'
            + '</div>';
        }

        sec.innerHTML = profHtml + claimHtml + missionFallbackHtml;
      })();
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
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours' || st === 'completed';
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
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours' || st === 'completed';
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
      + _supportItem('https://www.fixeo.ma',           '🌐', 'Site web',         'www.fixeo.ma')
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
        case 'accept-mission':   _doAcceptMission(reqId, btn); return;
        case 'start-mission':    _doStartMission(reqId, btn); return;
        case 'complete-mission': _doCompleteMission(reqId, btn); return;
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
      await FS.requireAuth('artisan');
      /* Use artisans.id (artisan table PK), NOT auth.profile.id (session uid).
       * auth.uid may differ from artisans.id; missions must reference the
       * artisan record so listMissions can find them by artisanProfile.id. */
      var artisanProfileId = _state.artisanProfile.id;

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
      _dispatchMissionEvent('mission-accepted', requestId, reqCheck.data.client_profile_id || null);
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
        .update({ status: 'in_progress' })   /* DB CHECK: new|assigned|in_progress|completed|validated|cancelled */
        .eq('id', requestId)
        .select('id, status')
        .maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Mise à jour bloquée (droits insuffisants ou demande introuvable).');
      _toast('▶ Intervention démarrée !', 'success');
      var _sm = _state.myMissions.find(function(m) { return m.request_id === requestId; });
      _dispatchMissionEvent('mission-started', requestId, _sm && _sm.client_profile_id || null);
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
      var _cm = _state.myMissions.find(function(m) { return m.request_id === requestId; });
      _dispatchMissionEvent('mission-completed', requestId, _cm && _cm.client_profile_id || null);
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

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — window.FixeoArtisanV2
     Minimal safe exposure for Notification Center + external hooks.
     Wrappers dispatch fixeo:artisan:mission-* events AFTER the private
     action succeeds, so any listener (FixeoNotifCenter G-2) is notified.
     The private _do* functions are NOT changed — behavior identical.
     Version: v2b — 2026-06-11
  ════════════════════════════════════════════════════════════ */
  function _dispatchMissionEvent(type, requestId, clientProfileId) {
    try {
      window.dispatchEvent(new CustomEvent('fixeo:artisan:' + type, {
        detail: {
          requestId:       requestId,
          artisanId:       _state.artisanProfile && _state.artisanProfile.id,
          clientProfileId: clientProfileId || null
        }
      }));
    } catch(e) { /* silent */ }
  }

  window.FixeoArtisanV2 = {
    VERSION: VERSION,

    /* Read-only state reference — consumers MUST NOT write to this object */
    get _state() { return _state; },

    /* Thin wrappers: identical to internal handlers but dispatch notification events */
    acceptMission: async function(requestId, btn) {
      await _doAcceptMission(requestId, btn);
      _dispatchMissionEvent('mission-accepted', requestId);
    },

    startMission: async function(requestId, btn) {
      await _doStartMission(requestId, btn);
      _dispatchMissionEvent('mission-started', requestId);
    },

    completeMission: async function(requestId, btn) {
      await _doCompleteMission(requestId, btn);
      _dispatchMissionEvent('mission-completed', requestId);
    }
  };

  document.addEventListener('DOMContentLoaded', init);

})(window, document);
