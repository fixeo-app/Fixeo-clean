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
   * Identity: artisans WHERE owner_user_id=auth.uid() (7C.12A.1: phone_public fallback removed)
   * ─────────────────────────────────────────────────────────────────────────── */
  var VERSION = 'v2i';
                        
  /* ── STATE ────────────────────────────────────────────────── */
  var _state = {
    session:        null,   /* Supabase session */
    profile:        null,   /* profiles row (auth.uid()) */
    artisanProfile: null,   /* artisans row (owner_user_id = auth.uid()) */
    openRequests:   [],     /* matching new requests (city + category filtered) */
    myMissions:     [],     /* service_requests assigned to this artisan */
    section:        'dashboard',
    fetchError:     null    /* last _fetch error message, or null */
  };

  /* Global action in-flight guard — prevents double-submission while a btn is busy */
  var _actionInFlight = false;

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
    btn.textContent = label || '…';
    _actionInFlight = true;
  }
  function _btnReset(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn._origText || '';
    _actionInFlight = false;
  }
  function _actionDone() { _actionInFlight = false; }

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
  /*
   * CANONICAL ARTISAN IDENTITY CONTRACT (7C.12A.1)
   *
   * Identity resolution: auth.uid() → artisans.owner_user_id → artisans.id
   *
   * The phone_public fallback (profiles.phone = artisans.phone_public) has been
   * permanently removed. It allowed any authenticated user who knew or controlled
   * their profiles.phone value to load an arbitrary artisan's dashboard — a direct
   * privilege escalation path that violates the 7C.11 security contract.
   *
   * If no artisan row has owner_user_id = auth.uid(), this function returns null.
   * The caller renders the safe 'artisan_profile_not_linked' state.
   * phone_public MUST NOT be used for authorization in any path.
   */
  async function _loadArtisanProfile(userId) {
    var FS = window.FixeoSupabase;
    var sb = await FS.getClient();

    /* Canonical: owner_user_id = auth.uid() — only safe identity gate */
    var r1 = await sb.from('artisans')
      .select('id,name,full_name,city,service_category,category,' +
              'verified,is_verified,availability,onboarding_completed,' +
              'rating,review_count,completed_missions,' +
              'owner_user_id,claimed,claim_status,badge_label,avatar_color,work_zone,' +
              'response_time_min,description')
      /* phone_public intentionally excluded — see 7C.12A.1 security note */
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (!r1.error && r1.data) return r1.data;

    /* phone_public fallback REMOVED (7C.12A.1 — security hardening).
     * Reason: profiles.phone = artisans.phone_public is not a safe identity gate.
     * Any authenticated user controlling profiles.phone could load another artisan's
     * dashboard. ownership must be established exclusively via owner_user_id.
     * If no owner_user_id match: return null → dashboard renders 'artisan_profile_not_linked'. */
    return null;
  }

  async function _fetch() {
    var FS = window.FixeoSupabase;
    var uid = _state.session.user.id;
    _state.fetchError = null;

    /* Verify session still valid — catches silent expiry */
    try {
      var freshSession = await FS.getSession();
      if (!freshSession || !freshSession.user) {
        _showLoginGate(null);
        return;
      }
    } catch(e) { /* non-fatal — continue with cached session */ }

    /* Load artisan profile (always reload on explicit refresh to pick up edits) */
    try {
      _state.artisanProfile = await _loadArtisanProfile(uid);
    } catch(e) {
      _state.fetchError = 'Erreur de chargement du profil artisan.';
      console.warn('[fxav2] _loadArtisanProfile error:', e && e.message);
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
  var missions = _state.myMissions || [];

  /*
   * Active:
   * - service_request carries the detailed operational state
   * - mission='pending' remains the canonical accepted mission state
   *   while the intervention is active
   */
  var assigned = missions.filter(function(m) {
    var reqSt = String(
      (m._request && m._request.status) || ''
    ).toLowerCase().trim();

    var missionSt = String(
      m.status || ''
    ).toLowerCase().trim();

    return (
      reqSt === 'pending' ||
      reqSt === 'assigned' ||
      reqSt === 'in_progress' ||
      reqSt === 'en_cours' ||
      missionSt === 'pending'
    );
  }).length;

  /*
   * Completed:
   * service_requests.completed is canonical when readable.
   * missions.done is the durable fallback once the artisan
   * has marked the intervention completed.
   */
  var completed = missions.filter(function(m) {
    var reqSt = String(
      (m._request && m._request.status) || ''
    ).toLowerCase().trim();

    var missionSt = String(
      m.status || ''
    ).toLowerCase().trim();

    return (
      reqSt === 'completed' ||
      reqSt === 'validated' ||
      missionSt === 'done' ||
      missionSt === 'validated'
    );
  }).length;

  /*
   * Validated:
   * Count only genuinely validated missions/requests.
   */
  var validated = missions.filter(function(m) {
    var reqSt = String(
      (m._request && m._request.status) || ''
    ).toLowerCase().trim();

    var missionSt = String(
      m.status || ''
    ).toLowerCase().trim();

    return (
      reqSt === 'validated' ||
      missionSt === 'validated'
    );
  }).length;

  /*
   * Available:
   * generic open requests + targeted offered missions,
   * without counting the same request twice.
   */
  var offered = missions.filter(function(m) {
    return String(m.status || '').toLowerCase().trim() === 'offered';
  });

  var offeredRequestIds = new Set(
    offered
      .map(function(m) {
        return String(m.request_id || '');
      })
      .filter(Boolean)
  );

  var genericAvailable = (_state.openRequests || []).filter(function(req) {
    return !offeredRequestIds.has(String(req.id || ''));
  });

  var available =
    offered.length +
    genericAvailable.length;

  return {
    assigned: assigned,
    completed: completed,
    available: available,
    revenue: validated
  };
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
    var onboarded = ap && ap.onboarding_completed;
    var ini  = initials(name);

    var tags = '';
    if (verified)               tags += '<span class="fxa-tag verified">✓ Vérifié</span>';
    if (city)                   tags += '<span class="fxa-tag city">📍 ' + esc(city) + '</span>';
    if (svc)                    tags += '<span class="fxa-tag service">🔧 ' + esc(svc) + '</span>';
    if (avail === 'available')  tags += '<span class="fxa-tag avail">● Disponible</span>';
    if (avail === 'busy')       tags += '<span class="fxa-tag busy">🔶 Occupé</span>';

    /* Onboarding CTA — shown when artisan exists but hasn't completed onboarding.
     * Calls complete_artisan_onboarding() RPC (7C.12A.3) — never direct write. */
    var onboardingCta = '';
    if (ap && !onboarded) {
      onboardingCta = '<div class="fxa-onboarding-cta">'
        + '<div class="fxa-onboarding-cta-icon">🚀</div>'
        + '<div class="fxa-onboarding-cta-body">'
        + '<strong>Activez votre profil</strong>'
        + '<p>Complétez votre inscription pour commencer à recevoir des missions.</p>'
        + '</div>'
        + '<button class="fxa-btn fxa-btn-primary" data-action="complete-onboarding" style="white-space:nowrap">'
        + 'Activer mon profil'
        + '</button>'
        + '</div>';
    }

    /* Availability toggle — shown only when onboarded */
    var availToggle = '';
    if (ap && onboarded) {
      if (avail === 'available') {
        availToggle = '<div class="fxa-avail-row">'
          + '<span class="fxa-avail-label fxa-avail-on">● Disponible</span>'
          + '<button class="fxa-btn fxa-btn-ghost fxa-btn-sm" data-action="set-unavailable">Pause</button>'
          + '</div>';
      } else {
        availToggle = '<div class="fxa-avail-row">'
          + '<span class="fxa-avail-label fxa-avail-off">○ Indisponible</span>'
          + '<button class="fxa-btn fxa-btn-primary fxa-btn-sm" data-action="set-available">Me rendre disponible</button>'
          + '</div>';
      }
    }

    var photoUrl = ap && ap.photo_url;
    var avatarHtml = photoUrl
      ? '<div class="fxa-profile-avatar-lg fxa-profile-avatar-photo" style="background-image:url(' + esc(photoUrl) + ')"></div>'
      : '<div class="fxa-profile-avatar-lg">' + esc(ini) + '</div>';

    return '<div class="fxa-profile-header">'
      + avatarHtml
      + '<div style="flex:1;min-width:0">'
      + '<div class="fxa-profile-name">' + esc(name) + '</div>'
      + '<div class="fxa-profile-meta">Artisan Fixeo</div>'
      + (tags ? '<div class="fxa-profile-tags">' + tags + '</div>' : '')
      + '</div></div>'
      + (onboardingCta || availToggle);
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

    /* ── FETCH ERROR STATE ────────────────────────────────────── */
    if (_state.fetchError) {
      sec.innerHTML = profHtml
        + '<div class="fxa-error-banner fxa-error-banner--prominent">'
        + '⚠️ ' + esc(_state.fetchError)
        + ' <button class="fxa-btn fxa-btn-ghost fxa-btn-sm" style="margin-left:10px" '
        + 'onclick="window.location.reload()">Réessayer</button>'
        + '</div>';
      return;
    }

    /* ── NO PROFILE STATE — dead claim_requests query removed (7C.12A.3) ──
     * New artisans always have an artisans row (register_new_artisan).
     * If artisanProfile is null after a successful load it means this
     * authenticated user never completed registration. Show clear guidance. */
    if (!ap) {
      sec.innerHTML = profHtml
        + '<div class="fxa-no-profile">'
        + '<div class="fxa-no-profile-icon">🔧</div>'
        + '<div class="fxa-no-profile-title">Compte artisan non trouvé</div>'
        + '<div class="fxa-no-profile-sub">'
        + 'Ce compte n\'est pas associé à un profil artisan. '
        + 'Si vous venez de vous inscrire, complétez d\'abord votre inscription sur la page d\'enregistrement.'
        + '</div>'
        + '<a href="onboarding-artisan.html" class="fxa-btn fxa-btn-primary" style="margin-top:16px;display:inline-flex;text-decoration:none">Compléter l\'inscription</a>'
        + '<a href="https://wa.me/212660484415" target="_blank" class="fxa-btn fxa-btn-wa" style="margin-top:10px;display:inline-flex">📲 Contacter le support</a>'
        + '</div>';
      return;
    }

    /* ── ONBOARDING DOMINANT CTA — takes over home screen when incomplete ── */
    if (!ap.onboarding_completed) {
      var missingItems = [];
      if (!ap.full_name || (ap.full_name || '').length < 3) missingItems.push('Nom complet');
      if (!(ap.service_category || ap.category))            missingItems.push('Métier');
      if (!ap.city)                                          missingItems.push('Ville');

      var missingHtml = missingItems.length
        ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:.84rem;opacity:.8">'
          + missingItems.map(function(m) { return '<li>' + esc(m) + '</li>'; }).join('')
          + '</ul>'
        : '';

      sec.innerHTML = profHtml
        + '<div class="fxa-onboarding-cta fxa-onboarding-cta--full">'
        + '<div class="fxa-onboarding-cta-icon" style="font-size:2.2rem">🚀</div>'
        + '<div class="fxa-onboarding-cta-body">'
        + '<strong style="font-size:1rem">Activez votre profil pour commencer</strong>'
        + '<p>Une fois activé, vous pourrez recevoir des missions et gérer votre disponibilité.</p>'
        + missingHtml
        + '</div>'
        + '<div class="fxa-actions" style="margin-top:14px">'
        + (missingItems.length
            ? '<button class="fxa-btn fxa-btn-ghost" data-action="edit-profile">Compléter le profil</button>'
            : '')
        + '<button class="fxa-btn fxa-btn-primary" data-action="complete-onboarding" style="flex:2">Activer mon profil</button>'
        + '</div></div>';
      return;
    }

    /* ── NORMAL OPERATIONAL DASHBOARD ──────────────────────────── */

    /* Availability state banner — shown only when unavailable, no duplicate label */
    var avail = ap.availability || 'unavailable';
    var availBanner = '';
    if (avail !== 'available') {
      availBanner = '<div class="fxa-avail-row fxa-avail-row--banner">'
        + '<span class="fxa-avail-label fxa-avail-off" style="font-size:.8rem;opacity:.6">'
        + 'Vous ne recevez pas de nouvelles demandes.</span>'
        + '<button class="fxa-btn fxa-btn-primary" data-action="set-available" style="flex-shrink:0">✅ Me rendre disponible</button>'
        + '</div>';
    }

    /* Profile completeness warning */
    var warn = '';
    if (!ap.city || !(ap.service_category || ap.category)) {
      warn = '<div class="fxa-error-banner">⚠️ '
        + '<span>Complétez votre ville et métier pour recevoir des demandes. </span>'
        + '<button class="fxa-btn fxa-btn-ghost fxa-btn-sm" style="margin-left:8px" data-action="edit-profile">Compléter</button>'
        + '</div>';
    }

    /* Active missions — DOMINANT: show first, max 2 */
    var activeMissions = _state.myMissions.filter(function(m) {
      var st = (m._request && m._request.status) || m.status || '';
      return st === 'pending' || st === 'assigned' || st === 'in_progress' || st === 'en_cours';
    }).slice(0, 2);

    var missionHtml = '';
    if (activeMissions.length) {
      missionHtml = '<div class="fxa-section-head" style="margin-top:0"><h2>⚡ Mission en cours</h2>'
        + '<span class="fxa-section-count">' + activeMissions.length + '</span>'
        + '</div>'
        + '<div class="fxa-card-list fxa-card-list--priority">'
        + activeMissions.map(_renderMissionCard).join('') + '</div>';
    }

    /* Recent open requests (max 3) */
    var recentOpen = _state.openRequests.slice(0, 3);
    var openHtml = '';
    if (recentOpen.length) {
      openHtml = '<div class="fxa-section-head" style="margin-top:' + (activeMissions.length ? '20px' : '0') + '">'
        + '<h2>📬 Nouvelles demandes</h2>'
        + '<span class="fxa-section-count">' + _state.openRequests.length + '</span>'
        + '</div>'
        + '<div class="fxa-card-list">' + recentOpen.map(_renderRequestCard).join('') + '</div>';
      if (_state.openRequests.length > 3) {
        openHtml += '<button class="fxa-btn fxa-btn-ghost fxa-btn-full" style="margin-top:10px" data-action="go-available">'
          + 'Voir toutes (' + _state.openRequests.length + ')</button>';
      }
    } else if (!activeMissions.length && ap.city && (ap.service_category || ap.category)) {
      /* Only show empty state if also no active mission — otherwise it reads as noise */
      openHtml = '<div class="fxa-empty fxa-empty--inline">'
        + '<div class="fxa-empty-icon" style="font-size:1.8rem">📬</div>'
        + '<div>'
        + '<div class="fxa-empty-title" style="font-size:.95rem">Aucune demande pour le moment</div>'
        + '<div class="fxa-empty-sub" style="font-size:.8rem">Vous serez notifié dès qu\'une demande correspond à votre zone.</div>'
        + '</div></div>';
    }

    sec.innerHTML = profHtml + availBanner + warn + missionHtml + openHtml;
  }

   /* ── RENDER: TARGETED OFFER CARD ─────────────────────────────
 * Admin-targeted canonical offer.
 *
 * mission.status = 'offered'
 * service_request.status remains 'new' until claim_mission().
 *
 * Acceptance MUST use mission.id through claim_mission().
 */
function _renderOfferedMissionCard(mission) {
  var req = mission._request || null;

  var reqId = (req && req.id) || mission.request_id || '';
  var missionId = mission.id || '';

  var service =
    (req && req.service_category)
    || mission.service_category
    || 'Service';

  var city =
    (req && req.city)
    || '';

  var description =
    (req && req.description)
    || '';

  var createdAt =
    (req && req.created_at)
    || mission.created_at
    || '';

  return '<div class="fxa-card" data-req-id="' + esc(reqId) + '">'
    + '<div class="fxa-card-head">'
    + '<span class="fxa-card-service">' + esc(service) + '</span>'
    + '<span class="fxa-badge fxa-badge-new">Offre Fixeo</span>'
    + '</div>'

    + '<div class="fxa-card-meta">'
    + (city
        ? '<span class="fxa-card-meta-item">📍 ' + esc(city) + '</span>'
        : '')
    + (createdAt
        ? '<span class="fxa-card-meta-item">🕐 ' + esc(timeAgo(createdAt)) + '</span>'
        : '')
    + '</div>'

    + (description
        ? '<div class="fxa-card-desc">'
          + esc(description.slice(0, 180))
          + (description.length > 180 ? '…' : '')
          + '</div>'
        : '')

    + (!req
        ? '<div class="fxa-info-row" style="opacity:.7">'
          + '<span class="fxa-info-label">Réf. demande</span>'
          + '<span class="fxa-info-value fxa-muted">#'
          + esc(String(reqId).slice(0, 8))
          + '</span>'
          + '</div>'
        : '')

    + '<div class="fxa-actions">'
    + '<button class="fxa-btn fxa-btn-primary" '
    + 'data-action="claim-offer" '
    + 'data-mission-id="' + esc(missionId) + '">'
    + '✅ Accepter la mission'
    + '</button>'
    + '</div>'

    + '</div>';
}
 /* ── RENDER: SECTION — AVAILABLE ─────────────────────────── */
function _renderAvailable() {
  var sec = el('fxav2-sec-available');
  if (!sec) return;

  /*
   * Canonical targeted offers:
   * mission.status='offered' and artisan_profile_id=current artisan.
   *
   * IMPORTANT:
   * use mission.status directly here.
   * service_requests.status intentionally remains 'new'
   * until claim_mission() succeeds.
   */
  var targetedOffers = (_state.myMissions || []).filter(function(m) {
    return String(m.status || '').toLowerCase().trim() === 'offered';
  });

  /*
   * A targeted service_request may also be returned by listOpenRequests().
   * Never render the same request twice.
   */
  var targetedRequestIds = new Set(
    targetedOffers
      .map(function(m) { return String(m.request_id || ''); })
      .filter(Boolean)
  );

  var genericOpenRequests = (_state.openRequests || []).filter(function(req) {
    return !targetedRequestIds.has(String(req.id || ''));
  });

  var availableCount =
    targetedOffers.length + genericOpenRequests.length;

  var html =
    '<div class="fxa-section-head">'
    + '<h2>📬 Demandes disponibles</h2>'
    + '<span class="fxa-section-count">'
    + availableCount
    + '</span>'
    + '</div>';

  var ap = _state.artisanProfile;

  if (!ap) {

    html +=
      '<div class="fxa-no-profile">'
      + '<div class="fxa-no-profile-icon">⚠️</div>'
      + '<div class="fxa-no-profile-title">Profil non associé</div>'
      + '<div class="fxa-no-profile-sub">'
      + 'Associez votre compte pour voir les demandes.'
      + '</div>'
      + '</div>';

  } else if (!ap.onboarding_completed) {

    html +=
      '<div class="fxa-empty">'
      + '<div class="fxa-empty-icon">🚀</div>'
      + '<div class="fxa-empty-title">Activez votre profil d\'abord</div>'
      + '<div class="fxa-empty-sub">'
      + 'Complétez l\'activation de votre profil pour commencer à recevoir des demandes.'
      + '</div>'
      + '<button class="fxa-btn fxa-btn-primary" '
      + 'style="margin-top:12px" '
      + 'data-action="complete-onboarding">'
      + 'Activer mon profil'
      + '</button>'
      + '</div>';

  } else if (ap.availability !== 'available') {

    html +=
      '<div class="fxa-empty">'
      + '<div class="fxa-empty-icon">○</div>'
      + '<div class="fxa-empty-title">Vous êtes indisponible</div>'
      + '<div class="fxa-empty-sub">'
      + 'Rendez-vous disponible pour voir les nouvelles demandes.'
      + '</div>'
      + '<button class="fxa-btn fxa-btn-primary" '
      + 'style="margin-top:12px" '
      + 'data-action="set-available">'
      + '✅ Me rendre disponible'
      + '</button>'
      + '</div>';

  } else if (!availableCount) {

    html +=
      '<div class="fxa-empty">'
      + '<div class="fxa-empty-icon">📬</div>'
      + '<div class="fxa-empty-title">Aucune demande pour le moment</div>'
      + '<div class="fxa-empty-sub">'
      + 'Vous serez notifié dès qu\'une demande correspond à votre zone et votre métier.'
      + '</div>'
      + '</div>';

  } else {

    html += '<div class="fxa-card-list">';

    /*
     * Explicit Admin offers first.
     * These use mission.id → claim_mission().
     */
    html += targetedOffers
      .map(_renderOfferedMissionCard)
      .join('');

    /*
     * Legacy/open marketplace requests remain unchanged.
     * These keep using the existing _doAcceptMission(requestId).
     */
    html += genericOpenRequests
      .map(_renderRequestCard)
      .join('');

    html += '</div>';
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
  var reqSt = String(
    (m._request && m._request.status) || ''
  ).toLowerCase().trim();

  var missionSt = String(
    m.status || ''
  ).toLowerCase().trim();

  return (
    reqSt === 'completed' ||
    reqSt === 'validated' ||
    reqSt === 'cancelled' ||
    missionSt === 'done' ||
    missionSt === 'validated' ||
    missionSt === 'cancelled'
  );
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
    /* phone: use profiles.phone (canonical). Never ap.phone_public — that's
     * the public-facing field exposed to clients, not the auth-context phone. */
    var phone = p.phone || '';
    var city  = ap.city || p.city || '';
    var svc   = ap.service_category || ap.category || '';
    var rating    = Number(ap.rating || 0);
    var done      = Number(ap.completed_missions || 0);
    var verified  = ap.verified || ap.is_verified || false;
    var onboarded = !!ap.onboarding_completed;
    var avail     = ap.availability || 'unavailable';

    /* Availability controls — use update_artisan_availability() RPC (7C.12A.2) */
    var availHtml = '';
    if (onboarded) {
      if (avail === 'available') {
        availHtml = '<div class="fxa-avail-row" style="margin:12px 0">'
          + '<span class="fxa-avail-label fxa-avail-on">● Disponible</span>'
          + '<button class="fxa-btn fxa-btn-ghost fxa-btn-sm" data-action="set-unavailable">Mettre en pause</button>'
          + '</div>';
      } else {
        availHtml = '<div class="fxa-avail-row" style="margin:12px 0">'
          + '<span class="fxa-avail-label fxa-avail-off">○ Indisponible</span>'
          + '<button class="fxa-btn fxa-btn-primary fxa-btn-sm" data-action="set-available">Me rendre disponible</button>'
          + '</div>';
      }
    } else {
      availHtml = '<div class="fxa-onboarding-cta" style="margin:12px 0">'
        + '<div class="fxa-onboarding-cta-body" style="flex:1">'
        + '<strong>Profil non activé</strong>'
        + '<p style="margin:4px 0 0;font-size:.82rem;opacity:.7">Activez votre profil pour recevoir des missions.</p>'
        + '</div>'
        + '<button class="fxa-btn fxa-btn-primary fxa-btn-sm" data-action="complete-onboarding">Activer</button>'
        + '</div>';
    }

    sec.innerHTML = '<div class="fxa-section-head"><h2>👤 Mon profil</h2>'
      + '<button class="fxa-btn fxa-btn-ghost fxa-btn-sm" data-action="edit-profile">Modifier</button>'
      + '</div>'
      + '<div class="fxa-profile-card">'
      + (ap && ap.photo_url
          ? '<div class="fxa-profile-avatar-lg fxa-profile-avatar-photo" style="background-image:url(' + esc(ap.photo_url) + ')"></div>'
          : '<div class="fxa-profile-avatar-lg">' + esc(initials(name)) + '</div>')
      + '<div>'
      + '<div class="fxa-profile-name-lg">' + esc(name) + '</div>'
      + (email ? '<div class="fxa-profile-email">' + esc(email) + '</div>' : '')
      + '</div></div>'
      + availHtml
      + _infoRow('Ville', city || '—')
      + _infoRow('Métier', svc || '—')
      + (phone ? _infoRow('Téléphone', phone) : '')
      + _infoRow('Missions terminées', String(done))
      + _infoRow('Évaluation', rating >= 1 ? rating.toFixed(1) + ' / 5' : '—')
      + _infoRow('Statut', verified ? '✓ Vérifié par Fixeo' : 'En cours de vérification')
      + '<div class="fxa-divider"></div>'
      + '<button class="fxa-btn fxa-btn-ghost fxa-btn-full" style="justify-content:center" data-action="logout">Se déconnecter</button>';
  }

  /* ── PROFILE EDIT MODAL ────────────────────────────────────── */
  function _openProfileEditModal() {
    var ap = _state.artisanProfile || {};
    /* Only show allowed editable fields (7C.12A.2 column grants):
       full_name, service_category, city, description, work_zone */
    var html = '<div style="padding:4px 0">'
      + '<h3 style="margin:0 0 16px;font-size:1rem">Modifier mon profil</h3>'
      + '<form id="fxav2-profile-form" autocomplete="off">'
      + _formField('Nom complet', 'full_name', ap.full_name || '', 'text', true)
      + _formField('Métier / Spécialité', 'service_category', ap.service_category || ap.category || '', 'text', true)
      + _formField('Ville principale', 'city', ap.city || '', 'text', true)
      + _formField('Zone d\'intervention (optionnel)', 'work_zone', ap.work_zone || '', 'text', false)
      + _formField('Description (optionnel)', 'description', ap.description || '', 'textarea', false)
      + '</form>'
      + '<div style="display:flex;gap:10px;margin-top:16px">'
      + '<button class="fxa-btn fxa-btn-ghost" style="flex:1" data-action="close-modal">Annuler</button>'
      + '<button class="fxa-btn fxa-btn-primary" style="flex:2" data-action="save-profile">Enregistrer</button>'
      + '</div></div>';
    _openModal(html);
  }

  function _formField(label, name, value, type, required) {
    var rl = required ? ' <span style="color:#ef4444">*</span>' : '';
    var inp = type === 'textarea'
      ? '<textarea name="' + name + '" rows="3" style="width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.06);color:inherit;padding:8px 10px;font-size:.86rem;resize:vertical">' + esc(value) + '</textarea>'
      : '<input type="text" name="' + name + '" value="' + esc(value) + '"'
          + (required ? ' required' : '')
          + ' style="width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.06);color:inherit;padding:8px 10px;font-size:.86rem">';
    return '<div style="margin-bottom:12px">'
      + '<label style="display:block;font-size:.8rem;opacity:.65;margin-bottom:4px">' + label + rl + '</label>'
      + inp + '</div>';
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
    set('fxav2-kpi-revenue', kpis.revenue > 0 ? String(kpis.revenue) : '—');
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
  /* Cockpit sections live in fxck-sec-* IDs; V2 handles fxav2-sec-* only.
   * Navigation entries for cockpit sections are still dispatched via fixeo:section:changed. */
  var SECTIONS     = ['dashboard', 'available', 'missions', 'history', 'profile', 'support'];
  var COCKPIT_SECS = ['gallery', 'quotes', 'public-profile', 'revenus', 'notifications'];

  function _showSection(name) {
    var isCockpit = COCKPIT_SECS.indexOf(name) !== -1;
    if (!isCockpit && SECTIONS.indexOf(name) === -1) name = 'dashboard';
    _state.section = name;

    /* V2 sections */
    SECTIONS.forEach(function(s) {
      var sec = el('fxav2-sec-' + s);
      if (sec) sec.classList.toggle('active', s === name);
    });
    /* Cockpit sections */
    COCKPIT_SECS.forEach(function(s) {
      var sec = el('fxck-sec-' + s);
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

    /* Notify cockpit of section change so it can render */
    try {
      window.dispatchEvent(new CustomEvent('fixeo:section:changed', { detail: { section: name } }));
    } catch(e) {}

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

    /* Handler shared by main and modal (modal lives outside main in the DOM) */
    function _handleAction(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action    = btn.dataset.action;
var reqId     = btn.dataset.reqId || '';
var missionId = btn.dataset.missionId || '';
      /* Navigation/UI actions are exempt from in-flight guard */
      var navAction = action === 'go-available' || action === 'close-modal'
        || action === 'edit-profile' || action === 'logout';
      if (_actionInFlight && !navAction) return; /* drop duplicate tap */
      switch (action) {
        case 'accept-mission':      _doAcceptMission(reqId, btn); return;
       case 'claim-offer':         _doClaimOfferedMission(missionId, btn); return;     
        case 'start-mission':       _doStartMission(reqId, btn); return;
        case 'complete-mission':    _doCompleteMission(reqId, btn); return;
        case 'go-available':        return _showSection('available');
        case 'set-available':       _doSetAvailability('available', btn); return;
        case 'set-unavailable':     _doSetAvailability('unavailable', btn); return;
        case 'complete-onboarding': _doCompleteOnboarding(btn); return;
        case 'edit-profile':        _openProfileEditModal(); return;
        case 'close-modal':         _closeModal(); return;
        case 'save-profile':
          (function() {
            var form = document.getElementById('fxav2-profile-form');
            if (!form) return;
            var fd = {};
            ['full_name','service_category','city','description','work_zone'].forEach(function(k) {
              var inp = form.elements[k];
              if (inp) fd[k] = inp.value;
            });
            _doSaveProfile(fd, btn);
          })();
          return;
        case 'logout':
          if (window.FixeoLogout && typeof window.FixeoLogout.logout === 'function') {
            window.FixeoLogout.logout();
          } else {
            localStorage.clear();
            window.location.href = 'auth.html';
          }
          break;
      }
    }

    /* Attach to main section (request cards, mission actions, nav actions) */
    main.addEventListener('click', _handleAction);

    /* Attach to modal overlay so save-profile / close-modal work.
     * The modal lives outside #fxav2-main in the DOM. */
    var overlay = el('fxav2-modal-overlay');
    if (overlay) overlay.addEventListener('click', _handleAction);
  }

  /* ── ACTIONS ──────────────────────────────────────────────── */
  /* ── ACCEPT MISSION ──────────────────────────────────────────
   * 1. Guard: verify request still status='new' (race-condition check)
   * 2. Guard: verify no mission row exists yet for this request_id
   * 3. INSERT missions row: request_id, artisan_profile_id, client_profile_id,
   *    agreed_price=0, commission_amount=0, status='assigned'
   * 4. UPDATE service_requests SET status='assigned'
   * 5. Refresh state (_fetch + _render) — removes from available, adds to missions
   * All guards use .maybeSingle() — no PGRST116.  
   /* ── CLAIM TARGETED OFFER ────────────────────────────────────
 * Canonical Admin-targeted flow:
 *
 * missions.status: offered -> pending
 * service_requests.status: new -> assigned
 *
 * claim_mission() is the ONLY authority for this transition.
 * No browser INSERT into missions.
 * No browser UPDATE of service_requests.
 */
async function _doClaimOfferedMission(missionId, btn) {
  if (!missionId) return;

  _btnBusy(btn, 'Acceptation…');

  try {
    var FS = window.FixeoSupabase;

    if (!FS) {
      throw new Error('Supabase indisponible.');
    }

    await FS.requireAuth('artisan');

    var sb = await FS.getClient();

    var res = await sb.rpc('claim_mission', {
      p_mission_id: missionId
    });

    if (res.error) {
      throw res.error;
    }

    var result = res.data;

    if (!result || result.ok !== true) {
      var reason = result && result.reason
        ? String(result.reason)
        : 'claim_failed';

      var message = 'Impossible d’accepter cette mission.';

      if (reason === 'already_claimed') {
        message = 'Cette mission a déjà été prise en charge.';
      } else if (reason === 'not_offered') {
        message = 'Cette offre n’est plus disponible.';
      } else if (reason === 'not_offered_to_you') {
        message = 'Cette mission n’est pas destinée à votre profil.';
      } else if (reason === 'unauthenticated') {
        message = 'Votre session a expiré. Reconnectez-vous.';
      } else if (reason === 'artisan_not_found') {
        message = 'Profil artisan introuvable.';
      }

      throw new Error(message);
    }

    _toast(
      '🎉 Mission acceptée ! Elle apparaît dans "Mes missions".',
      'success'
    );

    _dispatchMissionEvent(
      'mission-accepted',
      missionId
    );

    await _refresh();

  } catch (e) {
    console.warn(
      '[fxav2] claimOfferedMission error:',
      e && e.message
    );

    _toast(
      '❌ ' + (
        e && e.message
          ? e.message
          : 'Erreur lors de l’acceptation.'
      ),
      'error'
    );

    _btnReset(btn);
  }
}
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
      /* agreed_price=NULL is truthful at offer time (7C.11F.1B contract).
       * agreed_price=0 is a falsehood — the price is unknown, not zero.
       * commission_amount omitted — DB default handles it. */
      var missionInsert = await sb.from('missions').insert({
        request_id:         requestId,
        artisan_profile_id: artisanProfileId,
        client_profile_id:  reqCheck.data.client_profile_id || null,
        agreed_price:       null,
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

    /*
     * Canonical lifecycle:
     * UI still identifies the request by requestId,
     * but lifecycle mutation is performed by mission UUID.
     *
     * start_mission() owns:
     *   - authenticated artisan identity
     *   - mission ownership
     *   - mission.status = pending
     *   - service_request.status = assigned
     *   - assigned → in_progress transition
     *   - idempotency / race handling
     */
    var mission = _state.myMissions.find(function(m) {
      return String(m.request_id || '') === String(requestId);
    });

    if (!mission || !mission.id) {
      throw new Error('Mission associée introuvable.');
    }

    var res = await sb.rpc('start_mission', {
      p_mission_id: mission.id
    });

    if (res.error) throw res.error;

    var data = res.data;

    if (!data || data.ok !== true) {
      var reason = data && data.reason ? data.reason : 'unknown';

      var messages = {
        unauthenticated:       'Session artisan requise.',
        artisan_not_found:     'Profil artisan introuvable.',
        mission_not_found:     'Mission introuvable.',
        not_your_mission:      'Cette mission ne vous appartient pas.',
        not_accepted:          'Cette mission n’est pas encore acceptée.',
        invalid_request_state: 'Cette intervention ne peut pas être démarrée dans son état actuel.',
        internal_error:        'Erreur interne lors du démarrage.'
      };

      throw new Error(
        messages[reason] ||
        ('Impossible de démarrer la mission : ' + reason)
      );
    }

    _toast(
      data.already_started
        ? '▶️ Intervention déjà démarrée.'
        : '▶️ Intervention démarrée !',
      'success'
    );

    _dispatchMissionEvent(
      'mission-started',
      requestId,
      mission.client_profile_id || null
    );

    await _refresh();

  } catch(e) {
    console.warn('[fxav2] startMission error:', e && e.message);

    _toast(
      '❌ ' + (
        e && e.message
          ? e.message
          : 'Erreur lors du démarrage.'
      ),
      'error'
    );

    _btnReset(btn);
  }
}
  async function _doCompleteMission(requestId, btn) {
  if (!requestId) return;

  _btnBusy(btn, 'Enregistrement…');

  try {
    var FS = window.FixeoSupabase;
    var sb = await FS.getClient();

    /*
     * Canonical lifecycle:
     * UI identifies the request by requestId,
     * but lifecycle mutation is performed by mission UUID.
     *
     * complete_mission() owns the atomic transition:
     *   missions:         pending     -> done
     *   service_requests: in_progress -> completed
     *
     * Artisan authority stops at completed.
     * This path NEVER sets validated.
     */
    var mission = _state.myMissions.find(function(m) {
      return String(m.request_id || '') === String(requestId);
    });

    if (!mission || !mission.id) {
      throw new Error('Mission associée introuvable.');
    }

    var res = await sb.rpc('complete_mission', {
      p_mission_id: mission.id
    });

    if (res.error) throw res.error;

    var data = res.data;

    if (!data || data.ok !== true) {
      var reason = data && data.reason ? data.reason : 'unknown';

      var messages = {
        unauthenticated:      'Session artisan requise.',
        artisan_not_found:    'Profil artisan introuvable.',
        mission_not_found:    'Mission introuvable.',
        not_your_mission:     'Cette mission ne vous appartient pas.',
        not_started:          'Cette intervention n’est pas encore démarrée.',
        invalid_request_state:'Cette intervention ne peut pas être terminée dans son état actuel.',
        inconsistent_state:   'État de mission incohérent. Une vérification est nécessaire.',
        atomicity_error:      'La finalisation n’a pas pu être enregistrée intégralement.',
        internal_error:       'Erreur interne lors de la finalisation.'
      };

      throw new Error(
        messages[reason] ||
        ('Impossible de terminer la mission : ' + reason)
      );
    }

    _toast(
      data.already_completed
        ? '✅ Intervention déjà enregistrée comme terminée.'
        : '✅ Intervention marquée terminée. En attente de confirmation client.',
      'success'
    );

    _dispatchMissionEvent(
      'mission-completed',
      requestId,
      mission.client_profile_id || null
    );

    await _refresh();

  } catch(e) {
    console.warn('[fxav2] completeMission error:', e && e.message);

    _toast(
      '❌ ' + (
        e && e.message
          ? e.message
          : 'Erreur lors de la finalisation.'
      ),
      'error'
    );

    _btnReset(btn);
  }
}

  /* ── AVAILABILITY TOGGLE (uses update_artisan_availability RPC — 7C.12A.2) ── */
  async function _doSetAvailability(newStatus, btn) {
    if (btn) _btnBusy(btn, newStatus === 'available' ? 'Activation…' : 'Désactivation…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var res = await sb.rpc('update_artisan_availability', { p_status: newStatus });
      if (res.error) throw res.error;
      var data = res.data;
      if (data && data.ok === false) {
        if (data.reason === 'onboarding_required') {
          _toast('⚠️ Complétez votre profil avant de vous rendre disponible.', 'error');
        } else {
          _toast('❌ ' + (data.message || 'Erreur de disponibilité.'), 'error');
        }
        if (btn) _btnReset(btn);
        return;
      }
      /* Optimistically update local state so UI reflects immediately */
      if (_state.artisanProfile) _state.artisanProfile.availability = newStatus;
      _toast(newStatus === 'available'
        ? '✅ Vous êtes maintenant disponible.'
        : '⏸ Vous êtes maintenant indisponible.', 'success');
      await _refresh();
    } catch(e) {
      console.warn('[fxav2] setAvailability error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur.'), 'error');
      if (btn) _btnReset(btn);
    }
  }

  /* ── ONBOARDING COMPLETION (calls complete_artisan_onboarding RPC — 7C.12A.3) ── */
  async function _doCompleteOnboarding(btn) {
    if (btn) _btnBusy(btn, 'Activation…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var res = await sb.rpc('complete_artisan_onboarding');
      if (res.error) throw res.error;
      var data = res.data;
      if (data && data.ok === false) {
        var msg = data.message || 'Profil incomplet.';
        if (data.reason === 'profile_incomplete' && data.missing_fields) {
          msg = 'Champs manquants: ' + (Array.isArray(data.missing_fields)
            ? data.missing_fields.join(', ')
            : String(data.missing_fields));
        }
        _toast('⚠️ ' + msg, 'error');
        if (btn) _btnReset(btn);
        return;
      }
      _toast('🎉 Profil activé ! Vous êtes maintenant disponible pour des missions.', 'success');
      await _refresh();
    } catch(e) {
      console.warn('[fxav2] completeOnboarding error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur.'), 'error');
      if (btn) _btnReset(btn);
    }
  }

  /* ── PROFILE EDIT (allowed fields only — 7C.12A.2 column grants) ── */
  async function _doSaveProfile(formData, btn) {
    if (btn) _btnBusy(btn, 'Enregistrement…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var ap = _state.artisanProfile;
      if (!ap || !ap.id) throw new Error('Profil non chargé.');

      /* Only allowed column-granted fields per 7C.12A.2:
         full_name, service_category, city, description, work_zone.
         Never: owner_user_id, claimed, claim_status, onboarding_completed,
                verified, availability (use RPC for availability). */
      var patch = {};
      if (formData.full_name        !== undefined) patch.full_name        = String(formData.full_name).trim();
      if (formData.service_category !== undefined) patch.service_category = String(formData.service_category).trim();
      if (formData.city             !== undefined) patch.city             = String(formData.city).trim();
      if (formData.description      !== undefined) patch.description      = String(formData.description).trim();
      if (formData.work_zone        !== undefined) patch.work_zone        = String(formData.work_zone).trim();

      if (!patch.full_name || patch.full_name.length < 3) throw new Error('Le nom doit faire au moins 3 caractères.');

      var res = await sb.from('artisans')
        .update(patch)
        .eq('id', ap.id)
        .eq('owner_user_id', _state.session.user.id)  /* RLS double-check */
        .select('id')
        .maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Mise à jour bloquée (vérifiez vos droits ou rechargez la page).');

      /* Update local state optimistically */
      Object.assign(_state.artisanProfile, patch);
      _toast('✅ Profil mis à jour.', 'success');
      _closeModal();
      _render();
    } catch(e) {
      console.warn('[fxav2] saveProfile error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur.'), 'error');
      if (btn) _btnReset(btn);
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

    /* Refresh: re-fetches missions and re-renders — callable by dispatch bridge */
    refresh: async function() {
      await _refresh();
    },

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
    },

    /* Toast helper — cockpit extension can call this */
    toast: function(msg, type) { _toast(msg, type); }
  };

  /* Also alias as FixeoArtisanDashboard for dispatch bridge compat */
  window.FixeoArtisanDashboard = window.FixeoArtisanV2;

  document.addEventListener('DOMContentLoaded', init);

})(window, document);
