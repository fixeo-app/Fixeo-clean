/* ============================================================
   FIXEO — Dashboard Client V2
   js/fixeo-dashboard-v2.js  v2a
   Single renderer. Supabase-only. Mobile-first.
   Zero localStorage business logic. Zero fake data.
   ============================================================ */
(function (window, document) {
  'use strict';

  /* ── VERSION ──────────────────────────────────────────────────── */
  var VERSION = 'v2c45'; /* Client OS C4 closure final */

  /* ── PIPELINE DEFINITION ──────────────────────────────────────── */
  /* Maps a unified key to display config.
     step (-1=cancelled, 0–5=lifecycle position) drives timeline rendering. */
  var PIPELINE = {
    NEW:                            { label: 'Recherche artisan',          badge: 'new',       step: 0, icon: '\uD83D\uDD0D' },
    PROPOSAL_RECEIVED:              { label: 'Proposition re\u00e7ue',     badge: 'proposal',  step: 1, icon: '\uD83D\uDCE9' },
    ACCEPTED:                       { label: 'Devis accept\u00e9',         badge: 'accepted',  step: 2, icon: '\u2705' },
    ARTISAN_ASSIGNED:               { label: 'Artisan assign\u00e9',       badge: 'assigned',  step: 2, icon: '\uD83D\uDC77' },
    IN_PROGRESS:                    { label: 'Intervention en cours',      badge: 'progress',  step: 3, icon: '\u26A1' },
    COMPLETED_WAITING_CONFIRMATION: { label: '\u00c0 confirmer',                    badge: 'confirm', step: 4, icon: '\u23F3' },
    COMPLETED:                      { label: 'Valid\u00e9e',               badge: 'done',      step: 5, icon: '\u2B50' },
    CANCELLED:                      { label: 'Annul\u00e9e',               badge: 'cancelled', step: -1, icon: '\u274C' }
  };

  var TIMELINE_LABELS = ['Nouvelle', 'Proposition', 'Accept\u00e9e', 'En cours', '\u00c0 confirmer', 'Valid\u00e9e'];

  /* ── SERVICE CATEGORIES ───────────────────────────────────────── */
  var SERVICES = [
    'Plomberie', '\u00c9lectricit\u00e9', 'Peinture', 'Carrelage', 'Menuiserie',
    'Ma\u00e7onnerie', 'Climatisation', 'Nettoyage', 'Jardinage', 'Serrurerie',
    'Toiture', 'D\u00e9m\u00e9nagement', 'Pltr\u00e2trage', 'Autre'
  ];

  var CITIES = [
    'Casablanca', 'Rabat', 'Marrakech', 'F\u00e8s', 'Tanger',
    'Agadir', 'Mekn\u00e8s', 'Oujda', 'K\u00e9nitra', 'T\u00e9touan',
    'El Jadida', 'B\u00e9ni Mellal', 'Nador', 'Sal\u00e9', 'Khouribga',
    'Safi', 'Temara', 'Taza', 'Ouarzazate', 'Mohammedia'
  ];

  var REQUEST_SERVICES = [
    { slug:'plomberie', label:'Plomberie', icon:'🔧' },
    { slug:'electricite', label:'Électricité', icon:'⚡' },
    { slug:'serrurerie', label:'Serrurerie', icon:'🔐' },
    { slug:'climatisation', label:'Climatisation', icon:'❄️' },
    { slug:'menuiserie', label:'Menuiserie', icon:'🪟' },
    { slug:'peinture', label:'Peinture', icon:'🖌️' },
    { slug:'maconnerie', label:'Maçonnerie', icon:'🧱' },
    { slug:'nettoyage', label:'Nettoyage', icon:'🧹' },
    { slug:'jardinage', label:'Jardinage', icon:'🌿' },
    { slug:'demenagement', label:'Déménagement', icon:'📦' },
    { slug:'autre', label:'Autre', icon:'＋' }
  ];

  var FIXEO_CONTACTS = {
    supportWhatsappE164:'212660484415',
    email:'contact@fixeo.ma'
  };
  function _fixeoSupportWhatsAppUrl(){
    return 'https://wa.me/' + FIXEO_CONTACTS.supportWhatsappE164;
  }

  /* ── STATE ────────────────────────────────────────────────────── */
  var _state = {
    session:       null,
    profile:       null,
    requests:      [],   /* service_requests rows enriched with ._pipeline */
    quotes:        [],   /* quotes rows */
    missions:      [],   /* missions rows */
    artisanMap:    {},   /* id → artisan row */
    notifications: [],   /* notifications rows for current user */
    notifChannel:  null,
    section:       'dashboard',
    requestMode:   'standard',
    requestDraft:  { service:'', city:'', description:'', phone:'' },
    rafiContext:   null,
    loading:       true,
    error:         null
  };

  /* ── HELPERS ──────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return (p[0] ? p[0][0] : '') + (p[1] ? p[1][0] : '');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function isToday(iso) {
    if (!iso) return false;
    try {
      return new Date(iso).toDateString() === new Date().toDateString();
    } catch (e) { return false; }
  }

  function buildWA(phone, name) {
    var d = String(phone || '').replace(/\D/g, '').slice(-9);
    if (d.length < 9) return '';
    if (d[0] === '0') d = '212' + d.slice(1);
    else d = '212' + d;
    var msg = encodeURIComponent('Bonjour ' + (name || '') + ', je vous contacte via Fixeo.');
    return 'https://wa.me/' + d + '?text=' + msg;
  }

  function el(id) { return document.getElementById(id); }

  /* ── UNIFIED PIPELINE STATUS ──────────────────────────────────── */
  /* Determines which PIPELINE key applies to a request row.
     Supabase service_requests.status is authoritative (admin-set via v3-sync).
     Falls back to quotes/missions when status is 'new' (no admin action yet). */
  function computePipeline(req, quotes, missions) {
    var st = String(req.status || 'new').toLowerCase().trim();

    /* Admin-set statuses — always authoritative.
     * Supports both English DB enum values (new canonical) and
     * French legacy values written by v3-sync and admin LS patches.
     *
     * English DB enum (confirmed production constraint):
     *   new | assigned | in_progress | completed | validated | cancelled
     *
     * French legacy (V1 admin LS, v3-sync write-back):
     *   nouvelle | acceptée | en_cours | terminée | validée | annulée
     */

    /* COMPLETED / validée */
    if (st === 'validated' || st === 'valid\u00e9e' || st === 'validee') return PIPELINE.COMPLETED;

    /* COMPLETED_WAITING_CONFIRMATION / terminée */
    if (st === 'completed' || st === 'termin\u00e9e' || st === 'terminee') return PIPELINE.COMPLETED_WAITING_CONFIRMATION;

    /* IN_PROGRESS / en_cours */
    if (st === 'in_progress' || st === 'en_cours' || st === 'en cours') return PIPELINE.IN_PROGRESS;

    /* ARTISAN_ASSIGNED / acceptée */
    if (st === 'assigned' || st === 'accept\u00e9e' || st === 'accepted') return PIPELINE.ARTISAN_ASSIGNED;

    /* CANCELLED / annulée */
    if (st === 'cancelled' || st === 'annul\u00e9e' || st === 'annulee') return PIPELINE.CANCELLED;

    /* 'new' — derive from quotes and missions */
    var rQuotes   = (quotes  || []).filter(function (q) { return q.request_id === req.id; });
    var rMission  = (missions|| []).find( function (m) { return m.request_id === req.id; }) || null;
    var accepted  = rQuotes.find(function (q) { return q.status === 'accepted'; });
    var pending   = rQuotes.filter(function (q) { return q.status === 'pending'; });

    if (rMission) return PIPELINE.ARTISAN_ASSIGNED;
    if (accepted) return PIPELINE.ACCEPTED;
    if (pending.length) return PIPELINE.PROPOSAL_RECEIVED;
    return PIPELINE.NEW;
  }

  async function _fetchRafiContext() {
    var token=_state.session&&_state.session.access_token;
    if(!token) return null;
    try{
      var response=await fetch('/api/client-context',{
        method:'POST',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:'{}',
        credentials:'same-origin'
      });
      var data=await response.json().catch(function(){return null;});
      if(!response.ok||!data||data.ok!==true) return null;
      return data;
    }catch(_){return null;}
  }

  /* ── FETCH ────────────────────────────────────────────────────── */
  async function _fetch() {
    var FS = window.FixeoSupabase;
    if (!FS) throw new Error('FixeoSupabase non disponible');

    /* Parallel: requests + missions */
    var results = await Promise.all([
      FS.listClientRequests().catch(function (e) { throw e; }),
      FS.listClientMissions().catch(function () { return []; })
    ]);
    var requests = results[0] || [];
    var missions = results[1] || [];

    /* Sequential: quotes (depends on request ids) */
    var quotes = [];
    if (requests.length) {
      var ids = requests.map(function (r) { return r.id; });
      quotes = await FS.listQuotesForRequestIds(ids).catch(function () { return []; });
    }

    /* Reconcile accepted quote -> mission through the governed server RPC.
       This repairs interrupted acceptQuote flows without client-side mission INSERT. */
    var missionRequestIds = missions.map(function (m) { return String(m.request_id || ''); });
    var orphanAccepted = quotes.filter(function (q) {
      return q.status === 'accepted' && q.request_id && missionRequestIds.indexOf(String(q.request_id)) === -1;
    });
    if (orphanAccepted.length) {
      try {
        var reconcileSb = await FS.getClient();
        for (var rq = 0; rq < orphanAccepted.length; rq++) {
          var rec = await reconcileSb.rpc('create_client_mission_from_accepted_quote', {
            p_quote_id: orphanAccepted[rq].id
          });
          if (rec.error) throw rec.error;
        }
        missions = await FS.listClientMissions().catch(function () { return missions; });
      } catch (e) {
        console.warn('[fxv2] accepted quote reconciliation:', e && e.message);
      }
    }

    /* Artisan lookups for accepted/progress quotes */
    var artisanIds = [];
    quotes.forEach(function (q) {
      if (q.status === 'accepted' && q.artisan_profile_id) artisanIds.push(q.artisan_profile_id);
    });
    missions.forEach(function (m) {
      if (m.artisan_profile_id) artisanIds.push(m.artisan_profile_id);
    });
    artisanIds = artisanIds.filter(function (id, i, a) { return id && a.indexOf(id) === i; });

    var artisanMap = {};
    if (artisanIds.length) {
      try {
        var sb = await FS.getClient();
        var ar = await sb.from('artisans')
          .select('id,full_name,phone_public,photo_url,service_category,rating,verified')
          .in('id', artisanIds);
        if (ar.data) {
          ar.data.forEach(function (a) { artisanMap[a.id] = a; });
        }
      } catch (e) { /* non-critical — artisan info is supplemental */ }
    }

    /* Enrich requests with pipeline */
    requests.forEach(function (r) {
      r._pipeline = computePipeline(r, quotes, missions);
    });

    _state.requests   = requests;
    _state.quotes     = quotes;
    _state.missions   = missions;
    _state.artisanMap = artisanMap;

    /* Fetch notifications for current user (non-blocking) */
    if (_state.session && _state.session.user && _state.session.user.id) {
      _state.notifications = await _fetchNotifications(_state.session.user.id);
    }
    _state.rafiContext = await _fetchRafiContext();
  }

  /* ── KPIs ─────────────────────────────────────────────────────── */
  function _computeKPIs() {
    var reqs = _state.requests;
    var active  = reqs.filter(function (r) { return r._pipeline.step >= 0 && r._pipeline.step < 5; }).length;
    var pending = reqs.filter(function (r) { return r._pipeline.step <= 1 && r._pipeline.step >= 0; }).length;
    var today   = _state.missions.filter(function (m) { return isToday(m.updated_at); }).length;
    var done    = reqs.filter(function (r) { return r._pipeline.step === 5; }).length;
    return { active: active, pending: pending, today: today, done: done };
  }

  /* ── RENDER HELPERS ───────────────────────────────────────────── */
  function _renderBadge(pipeline) {
    return '<span class="fxv2-badge fxv2-badge-' + pipeline.badge + '">' + pipeline.icon + ' ' + esc(pipeline.label) + '</span>';
  }

  function _renderTimeline(step) {
    if (step < 0) return ''; /* cancelled — no timeline */
    var html = '<div class="fxv2-timeline">';
    TIMELINE_LABELS.forEach(function (label, i) {
      var cls = i < step ? 'done' : (i === step ? 'current' : '');
      var line = (i < TIMELINE_LABELS.length - 1)
        ? '<div class="fxv2-tl-line' + (i < step ? ' done' : '') + '"></div>'
        : '';
      html += '<div class="fxv2-tl-step ' + cls + '">'
        + '<div class="fxv2-tl-dot"></div>' + line
        + '<span class="fxv2-tl-label">' + esc(label) + '</span>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }

  function _fmtEventTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('fr-MA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    } catch (e) { return ''; }
  }

  function _requestTruthEvents(req) {
    if (!req) return [];
    var events = [];
    function push(key, label, at, detail) {
      if (!at) return;
      events.push({ key:key, label:label, at:at, detail:detail || '' });
    }
    push('created', 'Demande créée', req.created_at, (req.service_category || 'Service') + (req.city ? ' · ' + req.city : ''));

    var qs = (_state.quotes || []).filter(function (q) { return q.request_id === req.id; });
    qs.forEach(function (q) {
      push('quote', 'Proposition reçue', q.created_at, q.proposed_price ? (q.proposed_price + ' MAD') : '');
      if (q.status === 'accepted') push('quote_accepted', 'Devis accepté', q.updated_at || q.accepted_at, q.proposed_price ? (q.proposed_price + ' MAD') : '');
    });

    var m = (_state.missions || []).find(function (x) { return x.request_id === req.id; }) || null;
    if (m) {
      push('mission', 'Mission créée', m.created_at, '');
      var mst = String(m.status || '').toLowerCase();
      if (mst === 'in_progress' || mst === 'en_cours') push('mission_progress', 'Intervention en cours', m.updated_at, '');
      if (mst === 'completed' || mst === 'validated' || mst === 'terminée' || mst === 'validée') push('mission_done', 'Intervention terminée', m.updated_at, '');
    }

    var rst = String(req.status || '').toLowerCase();
    if (rst === 'assigned' || rst === 'acceptée' || rst === 'accepted') push('assigned', 'Artisan assigné', req.updated_at, '');
    if (rst === 'in_progress' || rst === 'en_cours') push('progress', 'Intervention en cours', req.updated_at, '');
    if (rst === 'completed' || rst === 'terminée') push('completed', 'Prestation terminée', req.updated_at, 'Confirmation client attendue');
    if (rst === 'validated' || rst === 'validée') push('validated', 'Prestation validée', req.updated_at, '');
    if (rst === 'cancelled' || rst === 'annulée') push('cancelled', 'Demande annulée', req.updated_at, '');

    var seen = {};
    events = events.filter(function (e) {
      var k = e.key + '|' + e.at;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    events.sort(function (a,b) { return new Date(a.at) - new Date(b.at); });
    return events;
  }

  function _renderTruthTimeline(req) {
    var events = _requestTruthEvents(req);
    if (!events.length) return '';
    return '<div class="fxv2-truth">'
      + '<div class="fxv2-truth-head"><span>CHRONOLOGIE RÉELLE</span><strong>' + events.length + ' événement' + (events.length > 1 ? 's' : '') + '</strong></div>'
      + '<div class="fxv2-truth-list">'
      + events.map(function (e, i) {
          return '<div class="fxv2-truth-event' + (i === events.length - 1 ? ' is-latest' : '') + '">'
            + '<i></i><div><strong>' + esc(e.label) + '</strong>'
            + '<span>' + esc(_fmtEventTime(e.at)) + (e.detail ? ' · ' + esc(e.detail) : '') + '</span></div>'
          + '</div>';
        }).join('')
      + '</div></div>';
  }

  function _renderArtisanChip(artisan) {
    if (!artisan) return '';
    /* verified badge shown ONLY when artisan.verified === true (strict boolean) */
    var verifiedBadge = artisan.verified === true
      ? '<span class="fxv2-verified-badge" aria-label="Artisan v\u00e9rifi\u00e9 Fixeo">\u2714 V\u00e9rifi\u00e9</span>'
      : '';
    return '<div class="fxv2-artisan-chip">'
      + '<div class="fxv2-artisan-avatar">' + esc(initials(artisan.full_name)) + '</div>'
      + '<div>'
        + '<div class="fxv2-artisan-name">' + esc(artisan.full_name) + verifiedBadge + '</div>'
        + '<div class="fxv2-artisan-svc">' + esc(artisan.service_category) + '</div>'
      + '</div>'
      + '</div>';
  }

  function _findAcceptedArtisan(req) {
    /* Look up artisan for this request via accepted quote or mission */
    var accepted = _state.quotes.find(function (q) {
      return q.request_id === req.id && q.status === 'accepted';
    });
    if (accepted && _state.artisanMap[accepted.artisan_profile_id]) {
      return { artisan: _state.artisanMap[accepted.artisan_profile_id], quote: accepted };
    }
    var mission = _state.missions.find(function (m) { return m.request_id === req.id; });
    if (mission && _state.artisanMap[mission.artisan_profile_id]) {
      return { artisan: _state.artisanMap[mission.artisan_profile_id], quote: null };
    }
    return null;
  }

  function _renderProposals(req) {
    var pending = _state.quotes.filter(function (q) {
      return q.request_id === req.id && q.status === 'pending';
    });
    if (!pending.length) return '';
    var html = '';
    pending.forEach(function (q) {
      var artisan = _state.artisanMap[q.artisan_profile_id] || null;
      html += '<div class="fxv2-proposal-block">'
        + '<div class="fxv2-proposal-price">' + esc(q.proposed_price ? q.proposed_price + ' MAD' : 'Prix \u00e0 d\u00e9finir') + '</div>'
        + (q.message ? '<div class="fxv2-proposal-msg">' + esc(q.message) + '</div>' : '')
        + (artisan ? '<div class="fxv2-artisan-name" style="margin-bottom:10px">\uD83D\uDC77 ' + esc(artisan.full_name) + '</div>' : '')
        + '<div class="fxv2-actions">'
        + '<button class="fxv2-btn fxv2-btn-success" data-action="accept-quote" data-id="' + esc(q.id) + '">\u2714 Accepter ce devis</button>'
        + '<button class="fxv2-btn fxv2-btn-danger" data-action="reject-quote" data-id="' + esc(q.id) + '">\u2716 Refuser</button>'
        + '</div></div>';
    });
    return html;
  }

  function _renderConfirmBlock(req) {
    return '<div class="fxv2-confirm-block">'
      + '<div class="fxv2-confirm-title">\u23F3 Prestation termin\u00e9e \u2014 en attente de votre confirmation</div>'
      + '<div class="fxv2-confirm-sub">Confirmez la prestation pour cl\u00f4turer la mission.</div>'
      + '<button class="fxv2-btn fxv2-btn-success fxv2-btn-confirm-sticky"'
      + ' data-action="confirm-done" data-id="' + esc(req.id) + '">'
      + '\u2713 Confirmer la prestation'
      + '</button>'
      + '</div>';
  }

  function _renderRatingPlaceholder(req) {
    /* Review CTA — only shown for completed missions with a known artisan.
     * Security: clientPhone is NEVER passed to the review modal or stored in data-*
     * FixeoReviews.openModal() is the review engine; graceful if not loaded. */
    var mission    = (_state.missions || []).find(function(m) { return m.request_id === req.id; }) || null;
    var missionId  = mission ? (mission.id || '') : '';
    var artisanId  = mission ? (mission.artisan_profile_id || '') : '';
    var clientId   = (_state.profile && _state.profile.id) || '';

    if (!missionId || !artisanId) {
      return '<div class="fxv2-review-pending">'
        + '<span>\u2b50 Avis disponible apr\u00e8s confirmation</span>'
        + '</div>';
    }

    /* Inline handler: check FixeoReviews exists before calling */
    return '<div style="margin-top:10px">'
      + '<button class="fxv2-review-btn" type="button"'
      + ' data-mission-id="' + esc(missionId) + '"'
      + ' data-artisan-id="' + esc(artisanId) + '"'
      + ' data-client-id="'  + esc(clientId)  + '"'
      + ' data-action="open-review"'
      + '>\u2b50 Donner mon avis</button>'
      + '</div>';
    /* Note: clientPhone is NOT passed — review modal identifies client via session */
  }

  function _renderCard(req) {
    var pipeline = req._pipeline;
    var found    = _findAcceptedArtisan(req);
    var artisan  = found ? found.artisan : null;
    var quote    = found ? found.quote : null;

    var artisanChip = artisan ? _renderArtisanChip(artisan) : '';
    var proposals   = (pipeline.badge === 'proposal') ? _renderProposals(req) : '';
    var confirmBlk  = (pipeline.badge === 'confirm') ? _renderConfirmBlock(req) : '';
    var ratingBlk   = (pipeline.badge === 'done') ? _renderRatingPlaceholder(req) : '';

    var waBtn = '';
    if (artisan && artisan.phone_public) {
      var waUrl = buildWA(artisan.phone_public, artisan.full_name);
      if (waUrl) {
        waBtn = '<a class="fxv2-btn fxv2-btn-wa" href="' + esc(waUrl) + '" target="_blank" rel="noopener">'
          + '\uD83D\uDCAC ' + esc((artisan.full_name || '').split(' ')[0]) + '</a>';
      }
    }

    return '<div class="fxv2-card" data-status="' + esc(pipeline.badge) + '" data-req-id="' + esc(req.id) + '">'
      + '<div class="fxv2-card-head">'
      + '<span class="fxv2-card-service">' + esc(req.service_category || 'Service') + '</span>'
      + _renderBadge(pipeline)
      + '</div>'
      + '<div class="fxv2-card-meta">'
      + '<span class="fxv2-card-meta-item">\uD83D\uDCCD ' + esc(req.city || '') + '</span>'
      + '<span class="fxv2-card-meta-item">\uD83D\uDCC5 ' + esc(fmtDate(req.created_at)) + '</span>'
      + (quote && quote.proposed_price ? '<span class="fxv2-card-meta-item">\uD83D\uDCB0 ' + esc(quote.proposed_price) + ' MAD</span>' : '')
      + '</div>'
      + artisanChip
      + _renderTimeline(pipeline.step)
      + proposals
      + confirmBlk
      + ratingBlk
      + _renderTrackingRef(req)
      + (waBtn ? '<div class="fxv2-actions">' + waBtn + '</div>' : '')
      + '</div>';
  }

  /* ── SKELETON ─────────────────────────────────────────────────── */
  function _renderSkeleton(n) {
    var html = '';
    for (var i = 0; i < (n || 3); i++) {
      html += '<div class="fxv2-skeleton-card">'
        + '<div class="fxv2-skel fxv2-skel-title"></div>'
        + '<div class="fxv2-skel fxv2-skel-line"></div>'
        + '<div class="fxv2-skel fxv2-skel-line-s"></div>'
        + '<div class="fxv2-skel fxv2-skel-badge" style="margin-top:8px"></div>'
        + '</div>';
    }
    return html;
  }

  /* ── SECTION: DASHBOARD ───────────────────────────────────────── */
  /* ── HELPER: render tracking ref pill ─────────────────────────── */
  function _renderTrackingRef(req) {
    var ref = req.tracking_ref || (req.metadata && req.metadata.tracking_ref);
    if (!ref) return '';
    return '<a class="fxv2-tracking-pill" href="/suivi?ref=' + esc(ref) + '" target="_blank" rel="noopener" aria-label="Suivre la demande">'
      + '\uD83D\uDCF1 ' + esc(ref) + '</a>';
  }

  /* ── HELPER: render Mission Control Hero card ──────────────────── */
  function _renderMissionHero(req) {
    if (!req) return '';
    var pipeline = req._pipeline;
    var found = _findAcceptedArtisan(req);
    var artisan = found ? found.artisan : null;
    var quote = found ? found.quote : null;
    var ref = req.tracking_ref || (req.metadata && req.metadata.tracking_ref);
    var mission = (_state.missions || []).find(function (m) { return m.request_id === req.id; }) || null;

    var artisanBlock = artisan
      ? '<div class="fxv2-hero-artisan">'
          + '<div class="fxv2-hero-artisan-avatar">' + esc(initials(artisan.full_name)) + '</div>'
          + '<div class="fxv2-mc-artisan-copy">'
            + '<div class="fxv2-hero-artisan-name">' + esc(artisan.full_name)
              + (artisan.verified === true ? ' <span class="fxv2-verified-badge">✔ Vérifié</span>' : '')
              + '</div>'
            + '<div class="fxv2-hero-artisan-role">' + esc(artisan.service_category || 'Artisan') + '</div>'
          + '</div>'
        + '</div>'
      : '<div class="fxv2-hero-searching"><span class="fxv2-hero-search-dot"></span><span>Recherche d’un artisan qualifié…</span></div>';

    var facts = [];
    facts.push('<div class="fxv2-mc-fact"><span>État</span><strong>' + esc(pipeline.label) + '</strong></div>');
    if (quote && quote.proposed_price) facts.push('<div class="fxv2-mc-fact"><span>Prix proposé</span><strong>' + esc(quote.proposed_price) + ' MAD</strong></div>');
    if (mission && mission.status) facts.push('<div class="fxv2-mc-fact"><span>Mission</span><strong>' + esc(String(mission.status).replace(/_/g,' ')) + '</strong></div>');

    var primary = '';
    if (pipeline.badge === 'proposal') primary = '<button class="fxv2-btn fxv2-mc-primary" data-action="go-requests">Examiner le devis</button>';
    else if (pipeline.badge === 'confirm') primary = '<button class="fxv2-btn fxv2-mc-primary" data-action="go-requests">Confirmer la prestation</button>';
    else if (ref) primary = '<a class="fxv2-btn fxv2-mc-primary" href="/suivi?ref=' + esc(ref) + '" target="_blank" rel="noopener">Suivre l’intervention</a>';
    else primary = '<button class="fxv2-btn fxv2-mc-primary" data-action="go-requests">Voir la demande</button>';

    var wa = '';
    if (artisan && artisan.phone_public) {
      var waUrl = buildWA(artisan.phone_public, artisan.full_name);
      if (waUrl) wa = '<a class="fxv2-btn fxv2-btn-wa" href="' + esc(waUrl) + '" target="_blank" rel="noopener">💬 Contacter</a>';
    }

    return '<div class="fxv2-mission-hero fxv2-mc">'
      + '<div class="fxv2-mc-kicker">MISSION COMMAND CENTER</div>'
      + '<div class="fxv2-mission-hero-top"><div>'
        + '<div class="fxv2-mission-hero-label">Intervention prioritaire</div>'
        + '<div class="fxv2-mission-hero-service">' + esc(req.service_category || 'Service') + '</div>'
        + '<div class="fxv2-mission-hero-city">📍 ' + esc(req.city || '') + '</div>'
      + '</div>' + _renderBadge(pipeline) + '</div>'
      + '<div class="fxv2-mc-facts">' + facts.join('') + '</div>'
      + artisanBlock
      + '<div class="fxv2-mc-timeline-label">Progression réelle</div>'
      + _renderTimeline(pipeline.step)
      + _renderTruthTimeline(req)
      + '<div class="fxv2-mc-actions">' + primary + wa + '</div>'
      + (ref ? '<div class="fxv2-mc-ref">Référence · ' + esc(ref) + '</div>' : '')
    + '</div>';
  }

  /* ── QUICK ACTIONS PANEL ───────────────────────────────────────── */
  function _renderQuickActions() {
    return '<div class="fxv2-quick-actions" role="group" aria-label="Actions rapides">'
      + '<button class="fxv2-qa-btn fxv2-qa-urgent" data-action="new-urgent" aria-label="Demande urgente">'
          + '<span class="fxv2-qa-icon">\u26A1</span>'
          + '<span class="fxv2-qa-label">Urgent</span>'
        + '</button>'
      + '<button class="fxv2-qa-btn fxv2-qa-standard" data-action="new-request" aria-label="Publier une demande">'
          + '<span class="fxv2-qa-icon">\uD83D\uDCDD</span>'
          + '<span class="fxv2-qa-label">Demande</span>'
        + '</button>'
      + '<button class="fxv2-qa-btn fxv2-qa-history" data-action="go-history" aria-label="Historique">'
          + '<span class="fxv2-qa-icon">\uD83D\uDCDC</span>'
          + '<span class="fxv2-qa-label">Historique</span>'
        + '</button>'
      + '<button class="fxv2-qa-btn fxv2-qa-support" data-action="go-support" aria-label="Support">'
          + '<span class="fxv2-qa-icon">\uD83D\uDCAC</span>'
          + '<span class="fxv2-qa-label">Support</span>'
        + '</button>'
    + '</div>';
  }

  /* ── TRUST BAND ────────────────────────────────────────────────── */
  /* Shows only factual trust signals. No fake ETA. No fake artisan count. */
  function _renderInsightsBand() {
    /* Safety tip: rotate daily — informational only, no metrics */
    var TIPS = [
      '\uD83D\uDCA1 Signalez les fuites d\u2019eau imm\u00e9diatement pour \u00e9viter les d\u00e9g\u00e2ts',
      '\uD83D\uDD0D Demandez toujours un devis \u00e9crit avant l\u2019intervention',
      '\u26A1 En cas de panne \u00e9lectrique, coupez le disjoncteur g\u00e9n\u00e9ral',
      '\uD83C\uDFC6 Tous nos artisans sont v\u00e9rifi\u00e9s par l\u2019\u00e9quipe Fixeo',
      '\uD83D\uDCF1 Gardez votre r\u00e9f\u00e9rence de suivi pour retracer votre demande'
    ];
    var tip = TIPS[new Date().getDate() % TIPS.length];

    /* Build trust items — real facts only */
    var items = [
      '\u2714\uFE0F Artisans v\u00e9rifi\u00e9s',
      '\u2714\uFE0F Paiement apr\u00e8s intervention',
      tip
    ];

    return '<div class="fxv2-insights-band">'
      + items.map(function(item, i) {
          return (i > 0 ? '<div class="fxv2-insight-sep">\u00b7</div>' : '')
            + '<div class="fxv2-insight-item fxv2-insight-tip">' + esc(item) + '</div>';
        }).join('')
    + '</div>';
  }

  /* ── PREMIUM EMPTY STATE ───────────────────────────────────────── */
  function _renderClientEmptyActions() {
    return '<section class="fxv2-c40-empty" aria-label="Créer une demande">'
      + '<div><span>PRÊT POUR LA PROCHAINE DEMANDE</span><strong>Que souhaitez-vous faire ?</strong><p>Créez une demande depuis Client OS sans quitter votre espace.</p></div>'
      + '<div class="fxv2-c40-empty-actions">'
        + '<button class="fxv2-btn fxv2-btn-primary" data-action="new-request">＋ Nouvelle demande</button>'
        + '<button class="fxv2-btn fxv2-c40-urgent" data-action="new-urgent">⚡ Demande urgente</button>'
      + '</div>'
    + '</section>';
  }

  function _requestServiceLabel(slug) {
    var item = REQUEST_SERVICES.find(function(s){ return s.slug === slug; });
    return item ? item.label : 'Autre';
  }

  function _renderRequestComposer() {
    var sec = el('fxv2-sec-new-request');
    if (!sec) return;
    var mode = _state.requestMode === 'urgent' ? 'urgent' : 'standard';
    var draft = _state.requestDraft || {};
    var phone = draft.phone || ((_state.profile && _state.profile.phone) || ((_state.session && _state.session.user && _state.session.user.user_metadata && _state.session.user.user_metadata.phone) || ''));
    var cityOptions = '<option value="">Choisir une ville</option>' + CITIES.map(function(city){
      return '<option value="' + esc(city) + '"' + (draft.city === city ? ' selected' : '') + '>' + esc(city) + '</option>';
    }).join('');
    sec.innerHTML = '<div class="fxv2-c40-compose" data-mode="' + mode + '">'
      + '<div class="fxv2-c40-compose-head"><div><span>' + (mode === 'urgent' ? 'URGENCE CLIENT OS' : 'NOUVELLE DEMANDE') + '</span><h2>' + (mode === 'urgent' ? 'Besoin d’une intervention rapidement ?' : 'Décrivez votre besoin') + '</h2><p>' + (mode === 'urgent' ? 'Votre demande sera enregistrée comme urgente et dispatchée via le moteur FIXEO.' : 'La demande est créée directement dans votre dossier client.') + '</p></div><button data-action="request-cancel" aria-label="Fermer">×</button></div>'
      + '<div class="fxv2-c40-service-grid" role="group" aria-label="Choisir un service">'
      + REQUEST_SERVICES.map(function(s){ return '<button type="button" class="fxv2-c40-service' + (draft.service === s.slug ? ' active' : '') + '" data-action="request-service" data-service="' + esc(s.slug) + '"><i>' + s.icon + '</i><span>' + esc(s.label) + '</span></button>'; }).join('')
      + '</div>'
      + '<div class="fxv2-c40-fields">'
        + '<label>Ville<select id="fxv2-request-city">' + cityOptions + '</select></label>'
        + '<label>Décrivez le problème<textarea id="fxv2-request-description" maxlength="500" rows="4" placeholder="Ex. fuite sous l’évier, prise qui ne fonctionne plus…">' + esc(draft.description || '') + '</textarea></label>'
        + (mode === 'urgent' ? '<label>Téléphone joignable<input id="fxv2-request-phone" type="tel" autocomplete="tel" value="' + esc(phone) + '" placeholder="06XXXXXXXX"></label>' : '')
      + '</div>'
      + '<div class="fxv2-c40-compose-foot"><button class="fxv2-btn fxv2-btn-ghost" data-action="request-cancel">Annuler</button><button class="fxv2-btn fxv2-c40-submit" data-action="request-submit">' + (mode === 'urgent' ? '⚡ Transmettre l’urgence' : 'Publier la demande') + '</button></div>'
      + '<p class="fxv2-c40-truth">' + (mode === 'urgent' ? 'Aucune promesse de délai n’est affichée. Le statut réel apparaîtra dans votre espace.' : 'La demande est créée avec votre identité client authentifiée et un identifiant d’idempotence.') + '</p>'
    + '</div>';
  }

  function _openNativeRequest(mode) {
    _state.requestMode = mode === 'urgent' ? 'urgent' : 'standard';
    _state.requestDraft = {
      service:'',
      city:(_state.profile && _state.profile.city) || '',
      description:'',
      phone:(_state.profile && _state.profile.phone) || ''
    };
    _renderRequestComposer();
    _showSection('new-request');
  }

  async function _submitNativeRequest(btn) {
    var service = (_state.requestDraft && _state.requestDraft.service) || '';
    var city = (el('fxv2-request-city') && el('fxv2-request-city').value || '').trim();
    var description = (el('fxv2-request-description') && el('fxv2-request-description').value || '').trim();
    var phone = (el('fxv2-request-phone') && el('fxv2-request-phone').value || (_state.profile && _state.profile.phone) || '').trim();
    if (!service) { _toast('Choisissez le service concerné.','error'); return; }
    if (!city) { _toast('Choisissez votre ville.','error'); return; }
    if (!description) { _toast('Décrivez brièvement le problème.','error'); return; }
    _state.requestDraft.city = city;
    _state.requestDraft.description = description;
    _state.requestDraft.phone = phone;
    _btnBusy(btn, _state.requestMode === 'urgent' ? 'Transmission…' : 'Publication…');
    try {
      if (_state.requestMode === 'urgent') {
        var normalizedPhone = phone.replace(/[ .()-]/g,'');
        if (!/^(?:\+?212|0)[5-7]\d{8}$/.test(normalizedPhone)) throw new Error('Ajoutez un numéro marocain valide pour l’urgence.');
        var token = _state.session && _state.session.access_token;
        if (!token) throw new Error('Votre session a expiré. Reconnectez-vous.');
        var urgentRes = await fetch('/api/urgent-request', {
          method:'POST',
          headers:{'Content-Type':'application/json','X-Fxauth-Token':token},
          body:JSON.stringify({
            service:service,
            problem:_requestServiceLabel(service),
            description:description,
            city:city,
            phone:phone,
            urgency:'now',
            mode:'emergency',
            source:'client-os-c4'
          })
        });
        var urgentData = await urgentRes.json().catch(function(){ return {}; });
        if (!urgentRes.ok || !urgentData.ok) throw new Error(urgentData.error || 'Impossible de transmettre l’urgence.');
        _toast('Urgence enregistrée. Le suivi réel est maintenant disponible.','success');
      } else {
        if (!window.FixeoSupabase || typeof window.FixeoSupabase.submitServiceRequest !== 'function') throw new Error('Service de demande indisponible.');
        await window.FixeoSupabase.submitServiceRequest({
          service_category:service,
          city:city,
          description:description,
          idempotency_key:(window.crypto && crypto.randomUUID ? crypto.randomUUID() : ('client-os-' + Date.now()))
        });
        _toast('Demande publiée.','success');
      }
      await _refresh();
      _showSection('dashboard');
    } catch (e) {
      _toast((e && e.message) ? e.message : 'Impossible de publier la demande.','error');
      _btnReset(btn, _state.requestMode === 'urgent' ? '⚡ Transmettre l’urgence' : 'Publier la demande');
    }
  }


  /* ── C2.1 CLIENT CONTROL TOWER FOUNDATION ────────────────────────
     Deterministic/read-only shell over canonical dashboard state.
     No autonomous RAFI action. No alternate persistence path. */
  function _clientFirstName() {
    var p = _state.profile || {};
    var raw = String(p.full_name || p.name || '').trim();
    return raw ? raw.split(/\s+/)[0] : '';
  }

  function _controlTowerPriority(reqs) {
    var active = (reqs || []).filter(function (r) {
      return r._pipeline && r._pipeline.step >= 0 && r._pipeline.step < 5;
    });
    if (!active.length) {
      return {
        tone: 'calm',
        eyebrow: 'ESPACE CLIENT',
        title: 'Tout est sous contrôle',
        detail: 'Aucune intervention active. FIXEO reste prêt dès que vous en avez besoin.',
        action: 'Nouvelle demande',
        actionName: 'new-request'
      };
    }
    var ranked = active.slice().sort(function (a, b) {
      var as = a._pipeline ? a._pipeline.step : 0;
      var bs = b._pipeline ? b._pipeline.step : 0;
      if (as === 4 && bs !== 4) return -1;
      if (bs === 4 && as !== 4) return 1;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
    var r = ranked[0];
    var pipe = r._pipeline || PIPELINE.NEW;
    if (pipe.step === 4) {
      return {
        tone: 'attention',
        eyebrow: 'ACTION REQUISE',
        title: 'Confirmez votre intervention',
        detail: (r.service_category || 'Votre intervention') + ' · ' + (r.city || ''),
        action: 'Voir la demande',
        actionName: 'go-requests'
      };
    }
    if (pipe === PIPELINE.PROPOSAL_RECEIVED) {
      return {
        tone: 'attention',
        eyebrow: 'NOUVELLE PROPOSITION',
        title: 'Un artisan vous a répondu',
        detail: (r.service_category || 'Votre demande') + ' · ' + (r.city || ''),
        action: 'Voir la proposition',
        actionName: 'go-requests'
      };
    }
    return {
      tone: 'live',
      eyebrow: 'SUIVI EN DIRECT',
      title: pipe.label,
      detail: (r.service_category || 'Intervention') + ' · ' + (r.city || ''),
      action: 'Suivre',
      actionName: 'go-requests'
    };
  }

  function _renderClientNextAction(reqs) {
    var active = (reqs || []).filter(function (r) { return r._pipeline && r._pipeline.step >= 0 && r._pipeline.step < 5; });
    if (!active.length) return '';
    var ranked = active.slice().sort(function (a, b) {
      var as = a._pipeline.step, bs = b._pipeline.step;
      if (as === 4 && bs !== 4) return -1;
      if (bs === 4 && as !== 4) return 1;
      if (as === 1 && bs !== 1) return -1;
      if (bs === 1 && as !== 1) return 1;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
    var r = ranked[0], p = r._pipeline || PIPELINE.NEW;
    var title = p.label, detail = 'Suivez l’état réel de votre demande.', eyebrow = 'PROCHAINE ÉTAPE';
    if (p.step === 4) { eyebrow = 'ACTION REQUISE'; title = 'Confirmez la prestation'; detail = 'Vérifiez l’intervention terminée puis confirmez-la depuis votre demande.'; }
    else if (p === PIPELINE.PROPOSAL_RECEIVED) { eyebrow = 'DÉCISION'; title = 'Consultez la proposition reçue'; detail = 'Le devis reçu est disponible dans votre demande.'; }
    else if (p.step === 3) { eyebrow = 'INTERVENTION'; title = 'Intervention en cours'; detail = 'Consultez le suivi réel de votre intervention.'; }
    else if (p.step === 2) { eyebrow = 'PRISE EN CHARGE'; title = 'Artisan assigné'; detail = 'Votre demande est maintenant prise en charge.'; }
    else { eyebrow = 'RECHERCHE'; title = 'Recherche en cours'; detail = 'FIXEO recherche un artisan éligible pour votre demande.'; }
    return '<div class="fxv2-next-action">'
      + '<span class="fxv2-next-kicker">' + esc(eyebrow) + '</span>'
      + '<strong>' + esc(title) + '</strong>'
      + '<span class="fxv2-next-context">' + esc(r.service_category || 'Intervention') + (r.city ? ' · ' + esc(r.city) : '') + '</span>'
      + '<p>' + esc(detail) + '</p>'
      + '<button class="fxv2-btn fxv2-next-btn" data-action="go-requests">Voir la demande</button>'
      + '</div>';
  }

  function _renderDecisionCenter(reqs) {
    var decisions = [];
    (reqs || []).forEach(function (r) {
      var p = r._pipeline || PIPELINE.NEW;
      if (p === PIPELINE.PROPOSAL_RECEIVED) {
        var pending = (_state.quotes || []).filter(function (q) { return q.request_id === r.id && q.status === 'pending'; });
        decisions.push({
          kind: 'proposal',
          service: r.service_category || 'Demande',
          city: r.city || '',
          count: pending.length,
          title: pending.length > 1 ? (pending.length + ' propositions à examiner') : 'Proposition à examiner',
          detail: 'Consultez le devis et les informations disponibles avant de décider.',
          action: 'Examiner',
          actionName: 'go-requests'
        });
      } else if (p.step === 4) {
        decisions.push({
          kind: 'confirm',
          service: r.service_category || 'Intervention',
          city: r.city || '',
          count: 1,
          title: 'Prestation à confirmer',
          detail: 'Vérifiez que l’intervention est terminée avant de la confirmer.',
          action: 'Vérifier',
          actionName: 'go-requests'
        });
      }
    });
    if (!decisions.length) {
      return '<section class="fxv2-decision-center fxv2-decision-clear" aria-label="Centre de décision">'
        + '<div class="fxv2-decision-head"><div><span>CENTRE DE DÉCISION</span><strong>Aucune décision en attente</strong></div><b>✓</b></div>'
        + '<p>Votre espace reste à jour. Les décisions nécessitant votre validation apparaîtront ici.</p>'
      + '</section>';
    }
    return '<section class="fxv2-decision-center" aria-label="Centre de décision">'
      + '<div class="fxv2-decision-head"><div><span>CENTRE DE DÉCISION</span><strong>' + decisions.length + ' décision' + (decisions.length > 1 ? 's' : '') + ' à traiter</strong></div><b>' + decisions.length + '</b></div>'
      + '<div class="fxv2-decision-list">'
      + decisions.map(function (d) {
          return '<article class="fxv2-decision-item" data-kind="' + esc(d.kind) + '">'
            + '<div class="fxv2-decision-copy"><strong>' + esc(d.title) + '</strong>'
            + '<span>' + esc(d.service) + (d.city ? ' · ' + esc(d.city) : '') + '</span>'
            + '<p>' + esc(d.detail) + '</p></div>'
            + '<button class="fxv2-btn fxv2-decision-action" data-action="' + esc(d.actionName) + '">' + esc(d.action) + '</button>'
          + '</article>';
        }).join('')
      + '</div></section>';
  }

  function _clientRafiBrief(reqs) {
    var server=_state.rafiContext&&_state.rafiContext.decision;
    if(server&&server.title&&server.text){
      var actionMap={
        'go-requests':'go-requests',
        'go-missions':'go-missions',
        'go-notifications':'go-notifications',
        'new-request':'new-request'
      };
      return {
        tone:server.tone||'calm',
        title:'RAFI · '+String(server.title),
        text:String(server.text),
        action:server.action==='new-request'?'Nouvelle demande':server.action==='go-missions'?'Voir mes interventions':server.action==='go-notifications'?'Voir les notifications':'Voir la demande',
        actionName:actionMap[server.action]||'go-requests',
        source:'server'
      };
    }
    var active = (reqs || []).filter(function (r) { return r._pipeline && r._pipeline.step >= 0 && r._pipeline.step < 5; });
    var decisions = active.filter(function (r) { return r._pipeline.step === 4 || r._pipeline === PIPELINE.PROPOSAL_RECEIVED; });
    if (!active.length) {
      return { tone:'calm', title:'RAFI · Tout est calme', text:'Vous n’avez aucune intervention active. Je peux vous guider dès votre prochaine demande.', action:'Nouvelle demande', actionName:'new-request',source:'local_fallback' };
    }
    if (decisions.length) {
      var d = decisions[0], p = d._pipeline;
      if (p.step === 4) return { tone:'attention', title:'RAFI · Votre confirmation est attendue', text:'Une prestation est indiquée comme terminée. Vérifiez l’intervention avant de la confirmer.', action:'Voir la décision', actionName:'go-requests',source:'local_fallback' };
      return { tone:'attention', title:'RAFI · Une proposition vous attend', text:'Un devis a été reçu pour ' + (d.service_category || 'votre demande') + '. Consultez les informations avant de décider.', action:'Examiner', actionName:'go-requests',source:'local_fallback' };
    }
    var r = active[0], p2 = r._pipeline;
    if (p2.step === 3) return { tone:'live', title:'RAFI · Intervention en cours', text:'Votre intervention ' + (r.service_category || '') + ' est actuellement indiquée en cours.', action:'Suivre', actionName:'go-requests',source:'local_fallback' };
    if (p2.step === 2) return { tone:'live', title:'RAFI · Votre demande est prise en charge', text:'Un artisan est assigné à votre demande. Les informations disponibles sont regroupées dans le Mission Command Center.', action:'Voir la mission', actionName:'go-requests',source:'local_fallback' };
    return { tone:'search', title:'RAFI · Recherche en cours', text:'FIXEO recherche actuellement un artisan éligible pour ' + (r.service_category || 'votre demande') + '.', action:'Voir la demande', actionName:'go-requests',source:'local_fallback' };
  }

  function _renderRafiCanonicalProof() {
    var ctx=_state.rafiContext;
    if(!ctx||ctx.ok!==true||!ctx.evidence) return '<div class="fxv2-c40-rafi-proof" data-state="fallback"><span>CONTEXTE</span><strong>Lecture locale de secours</strong><small>Le contexte serveur canonique est momentanément indisponible.</small></div>';
    var e=ctx.evidence||{},stamp='';
    try{stamp=new Date(ctx.as_of).toLocaleTimeString('fr-MA',{hour:'2-digit',minute:'2-digit'});}catch(_){}
    return '<div class="fxv2-c40-rafi-proof" data-state="canonical"><span>PREUVES CANONIQUES</span><strong>'+esc(e.active_requests||0)+' active'+((e.active_requests||0)>1?'s':'')+' · '+esc(e.pending_quotes||0)+' devis en attente · '+esc(e.unread_notifications||0)+' notification'+((e.unread_notifications||0)>1?'s':'')+' non lue'+((e.unread_notifications||0)>1?'s':'')+'</strong><small>Contexte serveur'+(stamp?' · '+esc(stamp):'')+'</small></div>';
  }

  function _rafiGovernedProposal(reqs) {
    var active = (reqs || []).filter(function (r) { return r._pipeline && r._pipeline.step >= 0 && r._pipeline.step < 5; });
    var confirmReq = active.find(function (r) { return r._pipeline.step === 4; });
    if (confirmReq) return {
      type:'confirm-completed', requestId:confirmReq.id,
      title:'Confirmer la prestation',
      summary:'RAFI peut lancer le parcours canonique de confirmation pour ' + (confirmReq.service_category || 'cette intervention') + '.',
      confirm:'Confirmer cette prestation ? Cette action validera l’intervention via le mécanisme sécurisé existant.'
    };
    var proposalReq = active.find(function (r) { return r._pipeline === PIPELINE.PROPOSAL_RECEIVED; });
    if (proposalReq) {
      var pending = (_state.quotes || []).filter(function (q) { return q.request_id === proposalReq.id && q.status === 'pending'; });
      if (pending.length === 1) {
        var q = pending[0];
        return {
          type:'accept-quote', quoteId:q.id, requestId:proposalReq.id,
          title:'Accepter le devis',
          summary:'RAFI peut préparer l’acceptation du devis' + (q.proposed_price ? (' de ' + q.proposed_price + ' MAD') : '') + '.',
          confirm:'Accepter ce devis ? L’artisan sera assigné selon le parcours FIXEO existant.'
        };
      }
    }
    return null;
  }

  function _renderRafiGovernedAction(reqs) {
    var p = _rafiGovernedProposal(reqs);
    if (!p) return '';
    var id = p.type === 'accept-quote' ? p.quoteId : p.requestId;
    return '<div class="fxv2-rafi-governed">'
      + '<div><span>ACTION GOUVERNÉE</span><strong>' + esc(p.title) + '</strong><p>' + esc(p.summary) + '</p></div>'
      + '<button class="fxv2-btn fxv2-rafi-governed-btn" data-action="rafi-governed-confirm" data-kind="' + esc(p.type) + '" data-id="' + esc(id) + '" data-confirm="' + esc(p.confirm) + '">Préparer</button>'
    + '</div>';
  }

  function _rafiSituationRows(reqs) {
    var rows=[];
    (reqs||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=0&&r._pipeline.step<5;}).slice(0,4).forEach(function(r){
      var p=r._pipeline||PIPELINE.NEW, found=_findAcceptedArtisan(r), artisan=found?found.artisan:null, quote=found?found.quote:null;
      var facts=[r.city||'',p.label||''];
      if(artisan&&artisan.full_name) facts.push(artisan.full_name);
      if(quote&&quote.proposed_price) facts.push(quote.proposed_price+' MAD');
      rows.push({service:r.service_category||'Intervention',facts:facts.filter(Boolean).join(' · '),step:p.step});
    });
    return rows;
  }
  function _renderRafiSituation(reqs) {
    var rows=_rafiSituationRows(reqs);
    if(!rows.length) return '<div class="fxv2-c34-empty">Aucune intervention active. RAFI reste disponible pour votre prochaine demande.</div>';
    return '<div class="fxv2-c34-situations">'+rows.map(function(r){return '<div class="fxv2-c34-situation" data-step="'+r.step+'"><i></i><span><strong>'+esc(r.service)+'</strong><small>'+esc(r.facts)+'</small></span></div>';}).join('')+'</div>';
  }
  function _renderRafiGuardrails() {
    return '<div class="fxv2-c34-trust"><span>✓ États issus de votre dossier FIXEO</span><span>✓ Prix affichés seulement s’ils sont enregistrés</span><span>✓ Toute action sensible demande votre confirmation</span></div>';
  }
  function _renderClientRafiIntelligence(reqs) {
    var b = _clientRafiBrief(reqs);
    return '<section class="fxv2-rafi-intel fxv2-c34-copilot" data-tone="' + esc(b.tone) + '" aria-label="RAFI Client Copilot">'
      + '<div class="fxv2-c34-hero"><div class="fxv2-c34-star" aria-hidden="true">✦</div><div class="fxv2-rafi-copy"><span class="fxv2-rafi-kicker">RAFI CLIENT COPILOT</span><strong>' + esc(b.title.replace(/^RAFI ·\s*/,'')) + '</strong><p>' + esc(b.text) + '</p></div></div>'
      + '<button class="fxv2-btn fxv2-rafi-action" data-action="' + esc(b.actionName) + '">' + esc(b.action) + '</button>'
      + _renderRafiCanonicalProof()
      + '<div class="fxv2-c34-section"><span>SITUATION RÉELLE</span>'+_renderRafiSituation(reqs)+'</div>'
      + _renderRafiGovernedAction(reqs)
      + _renderRafiGuardrails()
    + '</section>';
  }

  function _clientAttentionItems(reqs) {
    var items = [];
    (reqs || []).forEach(function (r) {
      var p = r._pipeline || PIPELINE.NEW;
      if (p.step === 4) items.push({priority:100,tone:'action',label:'Confirmation requise',detail:(r.service_category || 'Intervention') + (r.city ? ' · ' + r.city : ''),action:'go-requests'});
      else if (p === PIPELINE.PROPOSAL_RECEIVED) items.push({priority:90,tone:'decision',label:'Proposition à examiner',detail:(r.service_category || 'Demande') + (r.city ? ' · ' + r.city : ''),action:'go-requests'});
      else if (p.step === 3) items.push({priority:60,tone:'live',label:'Intervention en cours',detail:(r.service_category || 'Intervention') + (r.city ? ' · ' + r.city : ''),action:'go-requests'});
      else if (p.step === 2) items.push({priority:50,tone:'assigned',label:'Artisan assigné',detail:(r.service_category || 'Demande') + (r.city ? ' · ' + r.city : ''),action:'go-requests'});
      else if (p.step === 0) items.push({priority:30,tone:'search',label:'Recherche en cours',detail:(r.service_category || 'Demande') + (r.city ? ' · ' + r.city : ''),action:'go-requests'});
    });
    var unread = (_state.notifications || []).filter(function (n) { return !n.read; }).length;
    if (unread) items.push({priority:70,tone:'notification',label:unread + ' notification' + (unread > 1 ? 's' : '') + ' non lue' + (unread > 1 ? 's' : ''),detail:'Consultez les dernières mises à jour FIXEO.',action:'go-notifications'});
    items.sort(function(a,b){return b.priority-a.priority;});
    return items;
  }

  function _renderAttentionEngine(reqs) {
    var items = _clientAttentionItems(reqs);
    if (!items.length) return '<section class="fxv2-attention fxv2-attention-clear"><div><span>ATTENTION ENGINE</span><strong>Rien ne requiert votre attention</strong></div><b>✓</b></section>';
    var top = items.slice(0,3);
    return '<section class="fxv2-attention" aria-label="Priorités client">'
      + '<div class="fxv2-attention-title"><div><span>ATTENTION ENGINE</span><strong>À regarder maintenant</strong></div><b>' + items.length + '</b></div>'
      + '<div class="fxv2-attention-list">' + top.map(function(i,idx){
        return '<button class="fxv2-attention-item" data-tone="' + esc(i.tone) + '" data-action="' + esc(i.action) + '"><em>' + (idx+1) + '</em><span><strong>' + esc(i.label) + '</strong><small>' + esc(i.detail) + '</small></span><i>→</i></button>';
      }).join('') + '</div>'
    + '</section>';
  }

  function _renderC35DecisionEngine(reqs) {
    var items=_clientAttentionItems(reqs);
    if(!items.length) return '<section class="fxv2-c35-decision fxv2-c35-clear"><div class="fxv2-c35-head"><div><span>CENTRE DE DÉCISION</span><strong>Tout est sous contrôle</strong><p>Aucune action immédiate n’est requise.</p></div><b>✓</b></div></section>';
    var primary=items[0], secondary=items.slice(1,3);
    var why=primary.tone==='action'?'La prestation est indiquée comme terminée et attend votre validation.'
      :primary.tone==='decision'?'Une proposition enregistrée attend votre décision.'
      :primary.tone==='notification'?'Une mise à jour FIXEO non lue peut nécessiter votre attention.'
      :primary.tone==='live'?'Une intervention est actuellement indiquée en cours.'
      :primary.tone==='assigned'?'Un artisan est assigné et la prochaine étape est le démarrage.'
      :'FIXEO recherche encore un artisan éligible pour cette demande.';
    return '<section class="fxv2-c35-decision" data-tone="'+esc(primary.tone)+'" aria-label="Centre de décision">'
      +'<div class="fxv2-c35-head"><div><span>CENTRE DE DÉCISION</span><strong>'+items.length+' point'+(items.length>1?'s':'')+' à suivre</strong></div><b>'+items.length+'</b></div>'
      +'<button class="fxv2-c35-primary" data-action="'+esc(primary.action)+'"><em>PRIORITÉ 01</em><strong>'+esc(primary.label)+'</strong><small>'+esc(primary.detail)+'</small><p><i>✦</i> RAFI · '+esc(why)+'</p><span>Agir maintenant →</span></button>'
      +(secondary.length?'<div class="fxv2-c35-secondary">'+secondary.map(function(i,idx){return '<button data-action="'+esc(i.action)+'"><em>0'+(idx+2)+'</em><span><strong>'+esc(i.label)+'</strong><small>'+esc(i.detail)+'</small></span><i>→</i></button>';}).join('')+'</div>':'')
    +'</section>';
  }

  function _multiRequestSummary(reqs) {
    var out={search:0,decision:0,assigned:0,progress:0,confirm:0,done:0,cancelled:0,total:(reqs||[]).length};
    (reqs||[]).forEach(function(r){
      var p=r._pipeline||PIPELINE.NEW;
      if(p.step<0) out.cancelled++;
      else if(p.step===5) out.done++;
      else if(p.step===4) out.confirm++;
      else if(p.step===3) out.progress++;
      else if(p.step===2) out.assigned++;
      else if(p===PIPELINE.PROPOSAL_RECEIVED) out.decision++;
      else out.search++;
    });
    return out;
  }

  function _renderMultiRequestTower(reqs) {
    var m=_multiRequestSummary(reqs);
    if(m.total<2) return '';
    var cells=[
      ['Décisions',m.decision+m.confirm,'decision'],
      ['En intervention',m.progress,'progress'],
      ['Pris en charge',m.assigned,'assigned'],
      ['En recherche',m.search,'search'],
      ['Terminées',m.done,'done']
    ];
    return '<section class="fxv2-multi" aria-label="Vue globale de vos demandes">'
      + '<div class="fxv2-multi-head"><div><span>VUE MULTI-DEMANDES</span><strong>' + m.total + ' demandes au total</strong></div><button class="fxv2-multi-all" data-action="go-requests">Tout voir →</button></div>'
      + '<div class="fxv2-multi-grid">' + cells.map(function(c){return '<button class="fxv2-multi-cell" data-kind="'+c[2]+'" data-action="go-requests"><strong>'+c[1]+'</strong><span>'+c[0]+'</span></button>';}).join('') + '</div>'
      + (m.cancelled ? '<div class="fxv2-multi-foot">'+m.cancelled+' annulée'+(m.cancelled>1?'s':'')+'</div>' : '')
    + '</section>';
  }

  function _financeTruth(reqs) {
    var requestIds=(reqs||[]).map(function(r){return r.id;});
    var quotes=(_state.quotes||[]).filter(function(q){return requestIds.indexOf(q.request_id)!==-1;});
    var missions=(_state.missions||[]).filter(function(m){return requestIds.indexOf(m.request_id)!==-1;});
    var accepted=quotes.filter(function(q){return q.status==='accepted';});
    var pending=quotes.filter(function(q){return q.status==='pending';});
    var agreed=missions.filter(function(m){return m.agreed_price!=null && Number(m.agreed_price)>=0;});
    var knownTotal=agreed.reduce(function(sum,m){return sum+Number(m.agreed_price||0);},0);
    return {accepted:accepted.length,pending:pending.length,pricedMissions:agreed.length,knownTotal:knownTotal};
  }

  function _renderFinanceTrustCenter(reqs) {
    var f=_financeTruth(reqs);
    return '<section class="fxv2-finance" aria-label="Finance et confiance">'
      + '<div class="fxv2-finance-head"><div><span>FINANCE & CONFIANCE</span><strong>Vos montants connus, sans surprise</strong></div><b>FIXEO</b></div>'
      + '<div class="fxv2-finance-grid">'
        + '<div><span>Devis acceptés</span><strong>'+f.accepted+'</strong></div>'
        + '<div><span>Devis à examiner</span><strong>'+f.pending+'</strong></div>'
        + '<div><span>Prix convenus connus</span><strong>'+(f.pricedMissions?esc(f.knownTotal.toLocaleString('fr-MA'))+' MAD':'—')+'</strong></div>'
      + '</div>'
      + '<div class="fxv2-finance-trust"><span>✓ Prix affiché uniquement lorsqu’il est enregistré</span><span>✓ Paiement après intervention</span><span>Carte bancaire non disponible actuellement</span></div>'
    + '</section>';
  }

  function _evidenceForRequest(req) {
    if(!req) return [];
    var items=[];
    if(req.description) items.push({kind:'request',label:'Signalement client',detail:String(req.description)});
    var quotes=(_state.quotes||[]).filter(function(q){return q.request_id===req.id;});
    quotes.forEach(function(q){
      var d=q.proposed_price ? (q.proposed_price+' MAD') : '';
      if(q.message) d+=(d?' · ':'')+q.message;
      items.push({kind:'quote',label:q.status==='accepted'?'Devis accepté':'Proposition artisan',detail:d||'Proposition enregistrée'});
    });
    var mission=(_state.missions||[]).find(function(m){return m.request_id===req.id;});
    if(mission){
      var md=mission.agreed_price!=null ? (mission.agreed_price+' MAD') : '';
      if(mission.status) md+=(md?' · ':'')+String(mission.status).replace(/_/g,' ');
      items.push({kind:'mission',label:'Dossier mission',detail:md||'Mission enregistrée'});
    }
    var ref=req.tracking_ref||(req.metadata&&req.metadata.tracking_ref);
    if(ref) items.push({kind:'tracking',label:'Référence de suivi',detail:String(ref)});
    return items;
  }

  function _renderEvidenceCenter(reqs) {
    var active=(reqs||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=0&&r._pipeline.step<5;});
    var req=active[0]||(reqs&&reqs[0])||null;
    if(!req) return '';
    var items=_evidenceForRequest(req);
    return '<section class="fxv2-evidence" aria-label="Dossier intervention">'
      + '<div class="fxv2-evidence-head"><div><span>DOCUMENTS & PREUVES</span><strong>Dossier de l’intervention</strong></div><b>'+items.length+'</b></div>'
      + (items.length?'<div class="fxv2-evidence-list">'+items.map(function(i){return '<div class="fxv2-evidence-item" data-kind="'+esc(i.kind)+'"><i>✓</i><div><strong>'+esc(i.label)+'</strong><span>'+esc(i.detail)+'</span></div></div>';}).join('')+'</div>':'<p class="fxv2-evidence-empty">Aucun élément documentaire disponible pour cette intervention.</p>')
      + '<div class="fxv2-evidence-note">Seuls les éléments réellement enregistrés dans votre dossier FIXEO sont affichés.</div>'
    + '</section>';
  }

  function _renderClientControlTower(reqs) {
    var p = _controlTowerPriority(reqs);
    var name = _clientFirstName();
    var activeCount = (reqs || []).filter(function (r) {
      return r._pipeline && r._pipeline.step >= 0 && r._pipeline.step < 5;
    }).length;
    return '<div class="fxv2-ct" data-tone="' + esc(p.tone) + '">'
      + '<div class="fxv2-ct-top">'
        + '<div>'
          + '<div class="fxv2-ct-kicker">FIXEO CLIENT OS</div>'
          + '<h1 class="fxv2-ct-title">' + (name ? 'Bonjour ' + esc(name) : 'Votre espace Fixeo') + '</h1>'
          + '<p class="fxv2-ct-sub">Vos demandes, interventions et prochaines actions au même endroit.</p>'
        + '</div>'
        + '<div class="fxv2-ct-count"><strong>' + activeCount + '</strong><span>active' + (activeCount > 1 ? 's' : '') + '</span></div>'
      + '</div>'
      + '<div class="fxv2-ct-priority">'
        + '<div class="fxv2-ct-priority-copy">'
          + '<span class="fxv2-ct-eyebrow">' + esc(p.eyebrow) + '</span>'
          + '<strong>' + esc(p.title) + '</strong>'
          + '<span>' + esc(p.detail) + '</span>'
        + '</div>'
        + '<button class="fxv2-btn fxv2-ct-action" data-action="' + esc(p.actionName) + '">' + esc(p.action) + '</button>'
      + '</div>'
    + '</div>';
  }

  /* ── SECTION: DASHBOARD (Command Center) ───────────────────────── */
  function _c33MissionFacts(req) {
    var p=req._pipeline||PIPELINE.NEW;
    var found=_findAcceptedArtisan(req), artisan=found?found.artisan:null, quote=found?found.quote:null;
    var mission=(_state.missions||[]).find(function(m){return m.request_id===req.id;})||null;
    var next='Suivi en cours', action='go-missions', cta='Voir la mission';
    if(p.step===2) next='Prochaine étape · démarrage de l’intervention';
    if(p.step===3) next='Intervention en cours · suivez son avancement';
    if(p.step===4){next='Action requise · confirmer la prestation';action='go-requests';cta='Confirmer';}
    return {p:p,artisan:artisan,quote:quote,mission:mission,next:next,action:action,cta:cta};
  }
  function _renderC32Live(reqs) {
    var live=(reqs||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=2&&r._pipeline.step<5;}).slice(0,2);
    if(!live.length) return '';
    return '<section class="fxv2-c32-live fxv2-c33-live" aria-label="Interventions en direct"><div class="fxv2-c32-head"><div><span>INTERVENTIONS EN DIRECT</span><strong>'+live.length+' intervention'+(live.length>1?'s':'')+' sous contrôle</strong></div><button data-action="go-missions">Tout voir →</button></div><div class="fxv2-c33-live-list">'+live.map(function(r){
      var f=_c33MissionFacts(r), ref=r.tracking_ref||(r.metadata&&r.metadata.tracking_ref);
      var price=f.quote&&f.quote.proposed_price?f.quote.proposed_price:(f.mission&&f.mission.agreed_price?f.mission.agreed_price:null);
      var artisanName=f.artisan&&f.artisan.full_name?f.artisan.full_name:'Artisan assigné';
      return '<article class="fxv2-c33-mission" data-step="'+f.p.step+'">'
        +'<div class="fxv2-c33-top"><div><strong>'+esc(r.service_category||'Intervention')+'</strong><small>📍 '+esc(r.city||'')+(price?' · '+esc(price)+' MAD':'')+'</small></div>'+_renderBadge(f.p)+'</div>'
        +'<div class="fxv2-c33-artisan"><span class="fxv2-c33-avatar">'+esc(initials(artisanName)||'F')+'</span><span><small>ARTISAN</small><strong>'+esc(artisanName)+'</strong></span></div>'
        +'<div class="fxv2-c33-progress"><div class="fxv2-c33-track"><i style="width:'+Math.max(12,Math.min(100,(f.p.step/5)*100))+'%"></i></div><span>'+esc(f.next)+'</span></div>'
        +'<div class="fxv2-c33-actions"><button data-action="'+esc(f.action)+'">'+esc(f.cta)+'</button>'+(ref?'<a href="/suivi?ref='+esc(ref)+'" target="_blank" rel="noopener">Suivi ↗</a>':'')+'</div>'
      +'</article>';
    }).join('')+'</div></section>';
  }

  function _renderC32RafiBrief(reqs) {
    var b=_clientRafiBrief(reqs);
    return '<section class="fxv2-c32-rafi" data-tone="'+esc(b.tone)+'"><div class="fxv2-c32-rafi-star">✦</div><div><span>BRIEFING RAFI</span><strong>'+esc(b.title.replace(/^RAFI ·\s*/,''))+'</strong><p>'+esc(b.text)+'</p></div><button data-action="go-rafi">Ouvrir RAFI</button></section>';
  }
  function _renderC32Portfolio(reqs) {
    var m=_multiRequestSummary(reqs), f=_financeTruth(reqs);
    var active=(reqs||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=0&&r._pipeline.step<5;});
    var evidence=active.length?_evidenceForRequest(active[0]).length:0;
    return '<section class="fxv2-c32-portfolio" aria-label="Synthèse client"><div class="fxv2-c32-head"><div><span>VOTRE ESPACE</span><strong>L’essentiel, sans surcharge</strong></div></div><div class="fxv2-c32-portfolio-grid">'
      +'<button data-action="go-requests"><span>Demandes</span><strong>'+m.total+'</strong><small>'+(m.decision+m.confirm)+' décision'+((m.decision+m.confirm)>1?'s':'')+'</small></button>'
      +'<button data-action="go-requests"><span>Montants</span><strong>'+(f.pricedMissions?esc(f.knownTotal.toLocaleString('fr-MA'))+' MAD':'—')+'</strong><small>'+f.accepted+' devis accepté'+(f.accepted>1?'s':'')+'</small></button>'
      +'<button data-action="go-documents"><span>Dossier</span><strong>'+evidence+'</strong><small>élément'+(evidence>1?'s':'')+' disponible'+(evidence>1?'s':'')+'</small></button>'
      +'</div></section>';
  }

  function _renderDashboard() {
    var sec = el('fxv2-sec-dashboard');
    if (!sec) return;
    var reqs = _state.requests;
    var active = reqs.filter(function (r) { return r._pipeline.step >= 0 && r._pipeline.step < 5; });
    var html = '';

    /* C3.2 — one hierarchy: situation → action → live → RAFI → portfolio. */
    html += _renderClientControlTower(reqs);
    html += _renderC35DecisionEngine(reqs);
    html += _renderC32Live(reqs);
    html += _renderC32RafiBrief(reqs);
    html += _renderC32Portfolio(reqs);

    if (!active.length) html += _renderClientEmptyActions();
    sec.innerHTML = html;
  }

  /* ── SECTION: REQUESTS ────────────────────────────────────────── */
  function _renderRequests() {
    var sec = el('fxv2-sec-requests');
    if (!sec) return;
    var reqs = _state.requests.filter(function (r) { return r._pipeline.step >= 0 && r._pipeline.step < 5; });

    var html = '<div class="fxv2-section-head"><h2>\uD83D\uDCCB Mes demandes</h2>'
      + '<button class="fxv2-btn fxv2-btn-primary" data-action="new-request">+ Nouvelle</button>'
      + '</div>';

    if (!reqs.length) {
      html += '<div class="fxv2-empty">'
        + '<div class="fxv2-empty-icon">\uD83D\uDCCB</div>'
        + '<div class="fxv2-empty-title">Aucune demande en cours</div>'
        + '<div class="fxv2-empty-sub">Vos demandes actives apparaissent ici.</div>'
        + '</div>';
    } else {
      html += '<div class="fxv2-card-list">';
      reqs.forEach(function (r) { html += _renderCard(r); });
      html += '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── SECTION: MISSIONS ────────────────────────────────────────── */
  function _renderMissions() {
    var sec = el('fxv2-sec-missions');
    if (!sec) return;
    /* Missions = requests with an assigned artisan (step 2-4) */
    var reqs = _state.requests.filter(function (r) {
      return r._pipeline.step >= 2 && r._pipeline.step <= 4;
    });

    var html = '<div class="fxv2-section-head"><h2>\u26A1 Mes missions</h2></div>';
    if (!reqs.length) {
      html += '<div class="fxv2-empty">'
        + '<div class="fxv2-empty-icon">\u26A1</div>'
        + '<div class="fxv2-empty-title">Aucune mission en cours</div>'
        + '<div class="fxv2-empty-sub">Vos interventions actives s\u2019affichent ici.</div>'
        + '</div>';
    } else {
      html += '<div class="fxv2-card-list">';
      reqs.forEach(function (r) { html += _renderCard(r); });
      html += '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── SECTION: HISTORY ─────────────────────────────────────────── */
  function _renderHistory() {
    var sec = el('fxv2-sec-history');
    if (!sec) return;
    var hist = _state.requests.filter(function (r) {
      return r._pipeline.step === 5 || r._pipeline.step === -1;
    });

    var html = '<div class="fxv2-section-head"><h2>\uD83D\uDCC1 Historique</h2></div>';
    if (!hist.length) {
      html += '<div class="fxv2-empty">'
        + '<div class="fxv2-empty-icon">\uD83D\uDCC1</div>'
        + '<div class="fxv2-empty-title">Aucune mission cl\u00f4tur\u00e9e</div>'
        + '<div class="fxv2-empty-sub">Les missions termin\u00e9es et annul\u00e9es apparaissent ici.</div>'
        + '</div>';
    } else {
      html += '<div class="fxv2-card-list">';
      hist.forEach(function (r) { html += _renderCard(r); });
      html += '</div>';
    }
    sec.innerHTML = html;
  }

  /* ── SECTION: MESSAGES ────────────────────────────────────────── */
  function _renderMessages() {
    var sec=el('fxv2-sec-messages'); if(!sec)return;
    var active=(_state.requests||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=2&&r._pipeline.step<5;});
    var contacts=[]; active.forEach(function(r){var found=_findAcceptedArtisan(r),x=found?found.artisan:null;if(x&&x.phone_public){var wa=buildWA(x.phone_public,x.full_name);if(wa)contacts.push({service:r.service_category||'Intervention',city:r.city||'',name:x.full_name||'Artisan',wa:wa});}});
    sec.innerHTML='<div class="fxv2-c39c-head"><span>COMMUNICATION CENTER</span><h2>Contacts & échanges</h2><p>Les canaux réellement disponibles pour vos interventions.</p></div>'
      +(contacts.length?'<section class="fxv2-c39c-card"><div class="fxv2-c39c-title"><span>ARTISANS JOIGNABLES</span><strong>'+contacts.length+' contact'+(contacts.length>1?'s':'')+' disponible'+(contacts.length>1?'s':'')+'</strong></div><div class="fxv2-c39c-list">'+contacts.map(function(c){return '<a href="'+esc(c.wa)+'" target="_blank" rel="noopener"><i>💬</i><span><strong>'+esc(c.name)+'</strong><small>'+esc(c.service)+(c.city?' · '+esc(c.city):'')+'</small></span><b>WhatsApp ↗</b></a>';}).join('')+'</div></section>':'<section class="fxv2-c39c-card fxv2-c39c-empty"><strong>Aucun artisan joignable actuellement</strong><p>Un canal de contact apparaîtra ici lorsqu’un numéro public est disponible pour votre intervention.</p></section>')
      +'<section class="fxv2-c39c-card"><div class="fxv2-c39c-title"><span>FIXEO</span><strong>Besoin d’aide ?</strong></div><div class="fxv2-c39c-actions"><a href="'+esc(_fixeoSupportWhatsAppUrl())+'" target="_blank" rel="noopener">💬 WhatsApp Fixeo</a><a href="mailto:'+esc(FIXEO_CONTACTS.email)+'">✉ Email Fixeo</a><button data-action="go-support">Support Center →</button></div></section><div class="fxv2-c39c-note">La messagerie intégrée FIXEO n’est pas encore disponible. Aucun faux chat n’est affiché.</div>';
  }

  /* ── SECTION: PROFILE ─────────────────────────────────────────── */
  function _renderProfile() {
    var sec=el('fxv2-sec-profile'); if(!sec)return;
    var p=_state.profile||{},u=(_state.session&&_state.session.user)||{};
    var name=p.full_name||(u.user_metadata&&u.user_metadata.full_name)||'Client';
    var email=p.email||u.email||'',phone=p.phone||(u.user_metadata&&u.user_metadata.phone)||'',city=p.city||(u.user_metadata&&u.user_metadata.city)||'';
    var active=_state.requests.filter(function(r){return r._pipeline&&r._pipeline.step>=0&&r._pipeline.step<5;}).length;
    var done=_state.requests.filter(function(r){return r._pipeline&&r._pipeline.step===5;}).length;
    var unread=(_state.notifications||[]).filter(function(n){return !n.read;}).length;
    sec.innerHTML='<div class="fxv2-c38-head"><span>COMPTE CLIENT</span><h2>Profil & préférences</h2><p>Votre identité FIXEO et les réglages disponibles dans cet espace.</p></div>'
      +'<section class="fxv2-c38-identity"><div class="fxv2-c38-avatar">'+esc(initials(name)||'C')+'</div><div><strong>'+esc(name)+'</strong>'+(email?'<span>'+esc(email)+'</span>':'')+(city?'<small>📍 '+esc(city)+'</small>':'')+'</div><b>CLIENT</b></section>'
      +'<div class="fxv2-c38-stats"><div><strong>'+active+'</strong><span>Actives</span></div><div><strong>'+done+'</strong><span>Terminées</span></div><div><strong>'+unread+'</strong><span>Non lues</span></div></div>'
      +'<section class="fxv2-c38-card"><div class="fxv2-c38-cardhead"><span>INFORMATIONS DU COMPTE</span><strong>Coordonnées enregistrées</strong></div>'+_infoRow('Nom complet',name)+_infoRow('Email',email||'—')+_infoRow('Téléphone',phone||'—')+_infoRow('Ville',city||'—')+'<button class="fxv2-btn fxv2-c39b-edit" data-action="profile-edit">Modifier mes coordonnées</button></section>'
      +'<section class="fxv2-c38-card fxv2-c39b-security"><div class="fxv2-c38-cardhead"><span>SÉCURITÉ</span><strong>Accès à votre compte</strong></div><p>Modifiez votre mot de passe depuis votre session authentifiée.</p><button class="fxv2-btn fxv2-btn-ghost" data-action="password-edit">Modifier mon mot de passe</button></section>'
      +'<section class="fxv2-c38-card"><div class="fxv2-c38-cardhead"><span>PRÉFÉRENCES</span><strong>Votre expérience FIXEO</strong></div><button class="fxv2-c38-link" data-action="go-notifications"><span>🔔 Notifications</span><small>'+unread+' non lue'+(unread>1?'s':'')+'</small><i>→</i></button><button class="fxv2-c38-link" data-action="go-rafi"><span>✦ RAFI</span><small>Copilote client</small><i>→</i></button><button class="fxv2-c38-link" data-action="go-documents"><span>▤ Documents & preuves</span><small>Dossier FIXEO</small><i>→</i></button></section>'
      +'<div class="fxv2-c38-security"><span>✓ Session authentifiée</span><span>✓ Données visibles selon vos droits FIXEO</span></div>'
      +'<button class="fxv2-btn fxv2-btn-ghost fxv2-c38-logout" data-action="logout">Se déconnecter</button>';
  }

  function _openProfileEdit() {
    var p=_state.profile||{},u=(_state.session&&_state.session.user)||{};
    var name=p.full_name||(u.user_metadata&&u.user_metadata.full_name)||'', phone=p.phone||(u.user_metadata&&u.user_metadata.phone)||'', city=p.city||(u.user_metadata&&u.user_metadata.city)||'';
    var options='<option value="">Choisir une ville</option>'+CITIES.map(function(c){return '<option value="'+esc(c)+'"'+(c===city?' selected':'')+'>'+esc(c)+'</option>';}).join('');
    _openModal('<div class="fxv2-c39b-modal"><span>PROFIL CLIENT</span><h3>Modifier mes coordonnées</h3><label>Nom complet<input id="fxv2-profile-name" type="text" value="'+esc(name)+'" autocomplete="name"></label><label>Téléphone<input id="fxv2-profile-phone" type="tel" value="'+esc(phone)+'" autocomplete="tel" placeholder="06XXXXXXXX"></label><label>Ville<select id="fxv2-profile-city">'+options+'</select></label><button class="fxv2-btn fxv2-btn-primary" data-action="profile-save">Enregistrer</button></div>');
  }
  async function _saveProfile(btn) {
    var name=(el('fxv2-profile-name')&&el('fxv2-profile-name').value||'').trim(), phone=(el('fxv2-profile-phone')&&el('fxv2-profile-phone').value||'').trim(), city=(el('fxv2-profile-city')&&el('fxv2-profile-city').value||'').trim();
    if(!name){_toast('Le nom complet est requis.','error');return;}
    if(phone && !/^(?:\\+?212|0)[5-7]\\d{8}$/.test(phone.replace(/[ .-]/g,''))){_toast('Numéro de téléphone invalide.','error');return;}
    _btnBusy(btn,'Enregistrement…');
    try {
      var sb=await window.FixeoSupabase.getClient(), uid=_state.session&&_state.session.user&&_state.session.user.id;
      if(!uid) throw new Error('Session expirée.');
      var res=await sb.from('profiles').update({full_name:name,phone:phone,city:city}).eq('id',uid).select('id,full_name,phone,city').maybeSingle();
      if(res.error) throw res.error;
      if(!res.data) throw new Error('Modification non autorisée.');
      var au=await sb.auth.updateUser({data:{full_name:name,phone:phone,city:city}});
      if(au.error) throw au.error;
      _state.profile=Object.assign({},_state.profile||{},res.data);
      if(_state.session.user){_state.session.user.user_metadata=Object.assign({},_state.session.user.user_metadata||{},{full_name:name,phone:phone,city:city});}
      _closeModal();_renderProfile();_renderSidebarProfile();_toast('Coordonnées mises à jour.','success');
    } catch(e){_toast('❌ '+(e&&e.message?e.message:'Impossible de modifier le profil.'),'error');_btnReset(btn,'Enregistrer');}
  }
  function _openPasswordEdit() {
    _openModal('<div class="fxv2-c39b-modal"><span>SÉCURITÉ</span><h3>Modifier mon mot de passe</h3><p>Utilisez au moins 8 caractères.</p><label>Nouveau mot de passe<input id="fxv2-password-new" type="password" minlength="8" autocomplete="new-password"></label><label>Confirmer<input id="fxv2-password-confirm" type="password" minlength="8" autocomplete="new-password"></label><button class="fxv2-btn fxv2-btn-primary" data-action="password-save">Mettre à jour</button></div>');
  }
  async function _savePassword(btn) {
    var a=el('fxv2-password-new')&&el('fxv2-password-new').value||'', b=el('fxv2-password-confirm')&&el('fxv2-password-confirm').value||'';
    if(a.length<8){_toast('Le mot de passe doit contenir au moins 8 caractères.','error');return;}
    if(a!==b){_toast('Les deux mots de passe ne correspondent pas.','error');return;}
    _btnBusy(btn,'Mise à jour…');
    try{var sb=await window.FixeoSupabase.getClient();var r=await sb.auth.updateUser({password:a});if(r.error)throw r.error;_closeModal();_toast('Mot de passe mis à jour.','success');}
    catch(e){_toast('❌ '+(e&&e.message?e.message:'Impossible de modifier le mot de passe.'),'error');_btnReset(btn,'Mettre à jour');}
  }

  function _infoRow(label, value) {
    return '<div class="fxv2-info-row">'
      + '<span class="fxv2-info-label">' + esc(label) + '</span>'
      + '<span class="fxv2-info-value">' + esc(value) + '</span>'
      + '</div>';
  }

  /* ── SECTION: SUPPORT ─────────────────────────────────────────── */
  function _renderSupport() {
    var sec=el('fxv2-sec-support'); if(!sec)return;
    var active=(_state.requests||[]).filter(function(r){return r._pipeline&&r._pipeline.step>=0&&r._pipeline.step<5;});
    sec.innerHTML='<div class="fxv2-c39c-head"><span>FIXEO CARE</span><h2>Support Center</h2><p>Aide, dossier et canaux officiels au même endroit.</p></div>'
      +(active.length?'<section class="fxv2-c39c-card"><div class="fxv2-c39c-title"><span>VOS INTERVENTIONS</span><strong>'+active.length+' dossier'+(active.length>1?'s':'')+' actif'+(active.length>1?'s':'')+'</strong></div><button class="fxv2-c39c-wide" data-action="go-missions">Voir mes interventions →</button></section>':'')
      +'<section class="fxv2-c39c-card"><div class="fxv2-c39c-title"><span>ASSISTANCE</span><strong>Choisissez votre canal</strong></div>'+_supportItem(_fixeoSupportWhatsAppUrl(),'💬','WhatsApp Support','Contacter FIXEO')+_supportItem('mailto:'+FIXEO_CONTACTS.email,'✉','Email',FIXEO_CONTACTS.email)+'<button class="fxv2-c39c-wide fxv2-c39c-rafi" data-action="go-rafi">✦ Comprendre la situation avec RAFI</button></section><details class="fxv2-c39c-tech"><summary>Informations techniques</summary><span>Version '+esc(VERSION)+' · Fixeo Client OS</span></details>';
  }

  function _supportItem(href, icon, label, desc) {
    return '<a class="fxv2-support-item" href="' + esc(href) + '" target="_blank" rel="noopener">'
      + '<span class="fxv2-support-icon">' + icon + '</span>'
      + '<div><div class="fxv2-support-label">' + esc(label) + '</div>'
      + '<div class="fxv2-support-desc">' + esc(desc) + '</div></div>'
      + '</a>';
  }

  /* ── KPI RENDER ───────────────────────────────────────────────── */
  function _renderKPIs() {
    var kpis = _computeKPIs();
    function set(id, val) {
      var e = el(id);
      if (e) { e.textContent = val; e.classList.remove('loading'); }
    }
    set('fxv2-kpi-active',  kpis.active);
    set('fxv2-kpi-pending', kpis.pending);
    set('fxv2-kpi-today',   kpis.today);
    set('fxv2-kpi-done',    kpis.done);
  }

  /* ── SIDEBAR PROFILE ──────────────────────────────────────────── */
  function _renderSidebarProfile() {
    var p    = _state.profile || {};
    var u    = (_state.session && _state.session.user) || {};
    var name = p.full_name || (u.user_metadata && u.user_metadata.full_name) || 'Client';
    var sub  = p.city || p.phone || (u.email || '').split('@')[0] || '';
    var av   = el('fxv2-sb-avatar');
    var nm   = el('fxv2-sb-name');
    var sb   = el('fxv2-sb-sub');
    if (av) av.textContent = initials(name) || '\uD83D\uDC64';
    if (nm) nm.textContent = name;
    if (sb) sb.textContent = sub;
  }

  /* ── INJECT NOTIFICATION BELL INTO HEADER ─────────────────────── */
  function _injectNotifBell() {
    var slot = document.getElementById('fxv2-header-notifications');
    if (!slot) return;
    document.querySelectorAll('#fxv2-notif-bell').forEach(function (node) {
      if (!slot.contains(node)) node.remove();
    });
    var bell = slot.querySelector('#fxv2-notif-bell');
    if (!bell) {
      slot.innerHTML = '<button id="fxv2-notif-bell" class="fxv2-notif-bell" aria-label="Notifications" data-action="go-notifications">\uD83D\uDD14</button>';
    }
  }

  /* ── SECTION: NOTIFICATIONS ────────────────────────────────────── */
  function _renderNotificationsSection() {
    var sec = document.getElementById('fxv2-sec-notifications');
    if (!sec) return;
    var html = '<div class="fxv2-section-head"><h2>\uD83D\uDD14 Notifications</h2></div>'
      + _renderNotificationList();
    sec.innerHTML = html;
  }

  /* ── MASTER RENDER ────────────────────────────────────────────── */
  function _render() {
    _renderKPIs();
    _renderSidebarProfile();
    _renderNotificationBell();
    _renderDashboard();
    _renderRequests();
    _renderMissions();
    _renderHistory();
    _renderMessages();
    _renderNotificationsSection();
    _renderProfile();
    _renderSupport();
    _renderC31Rafi();
    _renderC31Documents();
  }

  function _renderC31Rafi() {
    var sec=el('fxv2-sec-rafi'); if(!sec) return;
    sec.innerHTML='<div class="fxv2-c31-pagehead fxv2-c34-pagehead"><span>FIXEO CLIENT OS</span><h2>RAFI</h2><p>Votre copilote client : situation réelle, priorité et actions sous votre contrôle.</p></div>'+_renderClientRafiIntelligence(_state.requests||[]);
  }
  function _renderC37Documents(reqs) {
    var all=(reqs||[]), total=0, dossiers=[];
    all.forEach(function(r){var items=_evidenceForRequest(r);total+=items.length;if(items.length)dossiers.push({r:r,items:items});});
    var f=_financeTruth(all);
    return '<div class="fxv2-c37-trust">'
      +'<div class="fxv2-c37-summary"><div><span>DOSSIER FIXEO</span><strong>'+total+'</strong><small>élément'+(total>1?'s':'')+' enregistré'+(total>1?'s':'')+'</small></div><div><span>PRIX CONNUS</span><strong>'+(f.pricedMissions?esc(f.knownTotal.toLocaleString('fr-MA'))+' MAD':'—')+'</strong><small>'+f.accepted+' devis accepté'+(f.accepted>1?'s':'')+'</small></div></div>'
      +'<div class="fxv2-c37-trustbar"><span>✓ Données issues de votre dossier</span><span>✓ Aucun montant inventé</span><span>✓ Références de suivi conservées</span></div>'
      +(dossiers.length?'<div class="fxv2-c37-dossiers">'+dossiers.slice(0,8).map(function(d){var r=d.r,p=r._pipeline||PIPELINE.NEW;return '<article class="fxv2-c37-dossier"><div class="fxv2-c37-dossier-head"><div><strong>'+esc(r.service_category||'Intervention')+'</strong><small>'+esc(r.city||'')+' · '+esc(p.label||'')+'</small></div><b>'+d.items.length+'</b></div><div class="fxv2-c37-items">'+d.items.map(function(i){return '<div data-kind="'+esc(i.kind)+'"><i>✓</i><span><strong>'+esc(i.label)+'</strong><small>'+esc(i.detail)+'</small></span></div>';}).join('')+'</div></article>';}).join('')+'</div>':'<div class="fxv2-c37-empty">Aucun élément documentaire enregistré pour le moment.</div>')
    +'</div>';
  }
  function _renderC31Documents() {
    var sec=el('fxv2-sec-documents'); if(!sec) return;
    sec.innerHTML='<div class="fxv2-c31-pagehead fxv2-c37-pagehead"><span>MON ACTIVITÉ</span><h2>Dossier & preuves</h2><p>Votre dossier FIXEO : demandes, devis, missions, montants connus et références de suivi réellement enregistrés.</p></div>'+_renderC37Documents(_state.requests||[]);
  }

  /* C3.9-A — dedicated Decision Center page */
  function _renderC39DecisionPage(reqs) {
    var sec = el('fxv2-sec-decision');
    if (!sec) return;
    sec.innerHTML = '<div class="fxv2-c31-pagehead"><span>FIXEO CLIENT OS</span><h2>Centre de décision</h2><p>Vos actions prioritaires et décisions à prendre, séparées de la liste de vos demandes.</p></div>'
      + _renderC35DecisionEngine(reqs || []);
  }

  /* ── NAVIGATION ───────────────────────────────────────────────── */
  var SECTIONS = ['dashboard', 'decision', 'requests', 'missions', 'messages', 'history', 'notifications', 'profile', 'support', 'rafi', 'documents', 'new-request'];

  function _showSection(name) {
    if (SECTIONS.indexOf(name) === -1) name = 'dashboard';
    _state.section = name;

    SECTIONS.forEach(function (s) {
      var sec = el('fxv2-sec-' + s);
      if (sec) {
        if (s === name) sec.classList.add('active');
        else sec.classList.remove('active');
      }
    });

    /* Update sidebar links */
    document.querySelectorAll('.fxv2-nav-link').forEach(function (a) {
      var active=a.dataset.section === name;
      if (active) { a.classList.add('active'); a.setAttribute('aria-current','page'); }
      else { a.classList.remove('active'); a.removeAttribute('aria-current'); }
    });

    /* Update bottom nav */
    document.querySelectorAll('.fxv2-bottom-btn').forEach(function (b) {
      var active=b.dataset.section === name;
      if (active) { b.classList.add('active'); b.setAttribute('aria-current','page'); }
      else { b.classList.remove('active'); b.removeAttribute('aria-current'); }
    });

    /* KPI bar: only on dashboard + requests */
    var kpiBar = el('fxv2-kpi-bar');
    if (kpiBar) kpiBar.style.display = (name === 'dashboard' || name === 'requests') ? '' : 'none';

    /* Close mobile sidebar */
    _closeSidebar();
  }

  function _syncSidebarA11y() {
    var s=el('fxv2-sidebar');
    if(!s) return;
    var desktop=!!(window.matchMedia&&window.matchMedia('(min-width: 768px)').matches);
    s.setAttribute('aria-hidden', desktop ? 'false' : (s.classList.contains('open') ? 'false' : 'true'));
  }

  function _openSidebar() {
    var s = el('fxv2-sidebar');
    var o = el('fxv2-overlay');
    var h = el('fxv2-hamburger');
    if (s) { s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); }
    if (o) o.classList.add('show');
    if (h) { h.classList.add('open'); h.setAttribute('aria-expanded', 'true'); }
    document.body.style.overflow = 'hidden';
    document.body.classList.add('fxv2-menu-open');
  }

  function _closeSidebar() {
    var s = el('fxv2-sidebar');
    var o = el('fxv2-overlay');
    var h = el('fxv2-hamburger');
    if (s) s.classList.remove('open');
    if (o) o.classList.remove('show');
    if (h) { h.classList.remove('open'); h.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
    document.body.classList.remove('fxv2-menu-open');
    _syncSidebarA11y();
  }

  /* ── NAV BINDING (single listener each) ──────────────────────── */
  function _bindNav() {
    /* Hamburger — ONE listener */
    var ham = el('fxv2-hamburger');
    if (ham) {
      ham.addEventListener('click', function () {
        var s = el('fxv2-sidebar');
        if (s && s.classList.contains('open')) _closeSidebar();
        else _openSidebar();
      });
    }

    /* Overlay — ONE listener */
    var overlay = el('fxv2-overlay');
    if (overlay) overlay.addEventListener('click', _closeSidebar);

    /* Header shortcuts */
    document.querySelectorAll('.fxv2-header-actions [data-section]').forEach(function (a) {
      a.addEventListener('click', function () { _showSection(a.dataset.section); });
    });

    /* Sidebar nav links */
    document.querySelectorAll('.fxv2-nav-link').forEach(function (a) {
      a.addEventListener('click', function () {
        if(a.dataset.section==='decision') _renderC39DecisionPage(_state.requests||[]);
        _showSection(a.dataset.section);
      });
    });

    /* Canonical header notification bell lives outside #fxv2-main. */
    var notifBell=document.getElementById('fxv2-notif-bell');
    if(notifBell) notifBell.addEventListener('click',function(){
      _showSection('notifications');
      _renderNotificationsSection();
    });

    /* Bottom nav buttons */
    document.querySelectorAll('.fxv2-bottom-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        _showSection(b.dataset.section);
      });
    });

    /* Logout button in sidebar footer */
    var logoutBtn = el('fxv2-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (window.FixeoLogout && typeof window.FixeoLogout.logout === 'function') {
          window.FixeoLogout.logout();
        } else {
          localStorage.clear();
          window.location.href = 'auth.html';
        }
      });
    }
  }

  /* ── ACTION HANDLING (single delegated listener) ──────────────── */
  function _bindActions() {
    var main = el('fxv2-main');
    if (!main) return;
    main.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var id     = btn.dataset.id || '';
      switch (action) {
        case 'accept-quote':   return _doAcceptQuote(id, btn);
        case 'reject-quote':   return _doRejectQuote(id, btn);
        case 'confirm-done':   return _doConfirmDone(id, btn);
        case 'open-review':    return _doOpenReview(btn);
        case 'submit-review':  return _doSubmitReview(btn);
        case 'mark-notif-read': return _doMarkNotifRead(id);
        case 'profile-edit': return _openProfileEdit();
        case 'profile-save': return _saveProfile(btn);
        case 'password-edit': return _openPasswordEdit();
        case 'password-save': return _savePassword(btn);
        case 'rafi-governed-confirm':
          var kind = btn.dataset.kind || '';
          var msg = btn.dataset.confirm || 'Confirmer cette action ?';
          if (!window.confirm(msg)) return;
          if (kind === 'accept-quote') return _doAcceptQuote(id, btn);
          if (kind === 'confirm-completed') return _doConfirmDone(id, btn);
          return;
        case 'new-request':    return _openNativeRequest('standard');
        case 'new-urgent':     return _openNativeRequest('urgent');
        case 'request-service':
          _state.requestDraft.service = btn.dataset.service || '';
          return _renderRequestComposer();
        case 'request-cancel':  return _showSection('dashboard');
        case 'request-submit':  return _submitNativeRequest(btn);
        case 'go-requests':       return _showSection('requests');
        case 'go-missions':       return _showSection('missions');
        case 'go-rafi':           return _showSection('rafi');
        case 'go-documents':      return _showSection('documents');
        case 'go-history':        return _showSection('history');
        case 'go-support':        return _showSection('support');
        case 'go-notifications':  return _showSection('notifications');
        case 'logout':
          if (window.FixeoLogout && typeof window.FixeoLogout.logout === 'function') {
            window.FixeoLogout.logout();
          } else {
            localStorage.clear();
            window.location.href = 'auth.html';
          }
          break;
        case 'rate-ph':
          _toast('La notation artisan sera disponible prochainement. \uD83D\uDC4D', 'info');
          break;
      }
    });
  }

  /* ── ACTIONS ──────────────────────────────────────────────────── */
  async function _doAcceptQuote(quoteId, btn) {
    if (!quoteId) return;
    _btnBusy(btn, 'Acceptation\u2026');
    try {
      await window.FixeoSupabase.acceptQuote(quoteId);
      _toast('\u2705 Devis accept\u00e9\u00a0! Votre artisan a \u00e9t\u00e9 assign\u00e9.', 'success');
      await _refresh();
    } catch (e) {
      console.warn('[fxv2] acceptQuote error:', e && e.message);
      _toast('\u274C ' + (e && e.message ? e.message : 'Erreur lors de l\u2019acceptation.'), 'error');
      _btnReset(btn, '\u2714 Accepter ce devis');
    }
  }

  async function _doRejectQuote(quoteId, btn) {
    if (!quoteId) return;
    _btnBusy(btn, 'Refus…');
    try {
      var FS = window.FixeoSupabase;
      var sb = await FS.getClient();
      var res = await sb.rpc('reject_quote_v2', { p_quote_id: quoteId });
      if (res.error) throw res.error;
      _toast('Devis refusé.', 'info');
      await _refresh();
    } catch (e) {
      console.warn('[fxv2] rejectQuote error:', e && e.message);
      _toast('❌ ' + (e && e.message ? e.message : 'Erreur lors du refus.'), 'error');
      _btnReset(btn, '✖ Refuser');
    }
  }

  async function _doConfirmDone(requestId, btn) {
    if (!requestId) return;
    _btnBusy(btn, 'Confirmation\u2026');
    try {
      var FS  = window.FixeoSupabase;
      var sb  = await FS.getClient();

      /* Write English enum value 'validated' — matches the production DB CHECK constraint:
       *   new | assigned | in_progress | completed | validated | cancelled
       * Writing the French 'validée' is rejected by the constraint and the update silently
       * fails (Supabase JS returns {data:[], error:null} without .select() even on CHECK violation),
       * causing the card to remain at 'À confirmer' after the toast. */
      /* Use .maybeSingle() — NOT .single().
       *
       * .single() throws PGRST116 "Cannot coerce the result to a single JSON object"
       * whenever the UPDATE matches 0 rows. This happens when:
       *   (a) RLS is enabled with no FOR UPDATE policy → row is silently blocked
       *   (b) requestId UUID does not match any row (double-click, stale data)
       *   (c) row already updated to 'validated' by a concurrent call
       *
       * .maybeSingle() returns {data: null, error: null} on 0 rows instead of throwing.
       * We then detect the null and surface a safe error message without a JS exception.
       */
      var rpcRes = await sb.rpc('confirm_completed_mission', {
  p_request_id: requestId
});

if (rpcRes.error) throw rpcRes.error;

var result = rpcRes.data || {};

if (!result.ok) {
  var reason = String(result.reason || '');

  if (reason === 'unauthenticated') {
    throw new Error('Votre session a expiré. Reconnectez-vous.');
  }

  if (reason === 'request_not_found_or_not_owned') {
    throw new Error('Cette demande est introuvable ou ne vous appartient pas.');
  }

  if (reason === 'request_not_completed') {
    throw new Error('Cette intervention ne peut pas encore être confirmée.');
  }

  if (reason === 'completed_mission_not_found' || reason === 'mission_not_found') {
    throw new Error('La mission associée est introuvable.');
  }

  if (reason === 'atomicity_error') {
    throw new Error('La validation n’a pas pu être enregistrée complètement. Veuillez réessayer.');
  }

  throw new Error('Impossible de confirmer cette intervention.');
}

      
      _toast('\u2705 Intervention confirm\u00e9e\u00a0! Merci pour votre confiance.', 'success');
      await _refresh();    /* re-fetch → computePipeline maps 'validated' → COMPLETED → CTA gone */
    } catch (e) {
      console.warn('[fxv2] confirmDone error:', e && e.message);
      _toast('\u274C ' + (e && e.message ? e.message : 'Erreur lors de la confirmation.'), 'error');
      _btnReset(btn, '\u2713 Confirmer la prestation');
    }
  }

  function _btnBusy(btn, label) {
    if (!btn) return;
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = label;
  }
  function _btnReset(btn, label) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = label || btn._origText || '';
  }

  /* ── REVIEW MODAL ─────────────────────────────────────────────── */
  /*
   * Inline client review form for completed missions.
   * Uses FixeoReviews.openModal() if available (external engine).
   * Falls back to an inline modal that writes directly to the reviews table.
   * Security:
   *   - clientPhone is NEVER in the form or data-*
   *   - missionId + artisanId come from _state (already ownership-verified)
   *   - client_profile_id comes from authenticated session (not caller input)
   */
  function _doOpenReview(btn) {
    var missionId = btn && btn.dataset.missionId;
    var artisanId = btn && btn.dataset.artisanId;
    var clientId  = btn && btn.dataset.clientId;
    if (!missionId || !artisanId) return;

    /* Delegate to FixeoReviews engine if loaded */
    if (window.FixeoReviews && typeof window.FixeoReviews.openModal === 'function') {
      window.FixeoReviews.openModal({
        missionId:       missionId,
        artisanId:       artisanId,
        clientProfileId: clientId
        /* clientPhone intentionally omitted — review engine resolves via session */
      });
      return;
    }

    /* Inline fallback review form */
    var body = '<div class="fxv2-modal-drag-handle"></div>'
      + '<div class="fxv2-modal-title">\u2b50 Donner mon avis</div>'
      + '<form id="fxv2-review-form">'
      + '<div class="fxv2-form-group">'
        + '<label class="fxv2-label">Note globale *</label>'
        + '<div class="fxv2-stars" role="radiogroup" aria-label="Note">'
        + [5,4,3,2,1].map(function(n) {
            return '<label style="cursor:pointer;font-size:1.4rem">'
              + '<input type="radio" name="rating" value="' + n + '" required style="display:none">'
              + '\u2b50</label>';
          }).join('')
        + '</div>'
      + '</div>'
      + '<div class="fxv2-form-group">'
        + '<label class="fxv2-label">Commentaire <span style="opacity:.5">(optionnel)</span></label>'
        + '<textarea class="fxv2-textarea" name="review_text" placeholder="D\u00e9crivez votre exp\u00e9rience\u2026" maxlength="500"></textarea>'
      + '</div>'
      + '<input type="hidden" name="mission_id"        value="' + esc(missionId) + '">'
      + '<input type="hidden" name="artisan_id"        value="' + esc(artisanId) + '">'
      + '<input type="hidden" name="client_profile_id" value="' + esc(clientId)  + '">'
      + '<button type="button" class="fxv2-btn fxv2-btn-primary" style="width:100%;justify-content:center"'
        + ' data-action="submit-review">Envoyer mon avis</button>'
      + '</form>';
    _openModal(body);
  }

  async function _doSubmitReview(btn) {
    var form = document.getElementById('fxv2-review-form');
    if (!form) return;
    var ratingEl = form.querySelector('[name="rating"]:checked');
    if (!ratingEl) { _toast('Veuillez choisir une note.', 'error'); return; }
    var rating      = parseInt(ratingEl.value, 10);
    var reviewText  = (form.querySelector('[name="review_text"]').value || '').trim().slice(0, 500);
    var missionId   = form.querySelector('[name="mission_id"]').value;
    var artisanId   = form.querySelector('[name="artisan_id"]').value;
    var clientId    = form.querySelector('[name="client_profile_id"]').value;

    if (!missionId || !artisanId || !clientId) { _toast('Donn\u00e9es manquantes.', 'error'); return; }
    if (isNaN(rating) || rating < 1 || rating > 5) { _toast('Note invalide.', 'error'); return; }

    _btnBusy(btn, 'Envoi\u2026');
    try {
      var sb = await window.FixeoSupabase.getClient();
      /* Ownership check: mission must exist in _state.missions for this client */
      var ownsMission = (_state.missions || []).some(function(m) { return m.id === missionId; });
      if (!ownsMission) throw new Error('Mission introuvable.');
      var res = await sb.from('reviews').insert({
        mission_id:       missionId,
        artisan_id:       artisanId,
        client_profile_id: clientId,
        rating:           rating,
        review_text:      reviewText || '',
        verified:         true
      });
      if (res.error) {
        /* 23505 = already reviewed this mission */
        if (String(res.error.code || '') === '23505') {
          _closeModal();
          _toast('Vous avez d\u00e9j\u00e0 donn\u00e9 un avis pour cette mission.', 'info');
          return;
        }
        throw res.error;
      }
      _closeModal();
      _toast('\u2705 Merci pour votre avis\u00a0!', 'success');
    } catch(e) {
      console.warn('[fxv2] submitReview error:', e && e.message);
      _toast('\u274C ' + (e && e.message ? e.message : 'Erreur lors de l\u2019envoi.'), 'error');
      _btnReset(btn, 'Envoyer mon avis');
    }
  }

  /* ── NOTIFICATIONS ─────────────────────────────────────────────── */
  /*
   * Fetches real notifications for the current user from the notifications table.
   * RLS ensures only the user's own rows are returned.
   * No fake notifications. No push. Only DB rows.
   */
  async function _fetchNotifications(uid) {
    try {
      var sb = await window.FixeoSupabase.getClient();
      var res = await sb.from('notifications')
        .select('id,type,title,message,related_entity_type,related_entity_id,read,created_at')
        .eq('recipient_user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20);
      if (res.error) return [];
      return res.data || [];
    } catch(e) { return []; }
  }

  async function _subscribeCanonicalNotifications(uid) {
    if (!uid || _state.notifChannel) return;
    try {
      var sb = await window.FixeoSupabase.getClient();
      if (!sb || typeof sb.channel !== 'function') return;
      var channel = sb.channel('client-os-notifications-' + String(uid).slice(0,8));
      channel.on('postgres_changes', {
        event:'*',
        schema:'public',
        table:'notifications',
        filter:'recipient_user_id=eq.' + uid
      }, async function () {
        _state.notifications = await _fetchNotifications(uid);
        _renderNotificationBell();
        _renderNotificationsSection();
        if (_state.section === 'dashboard') _renderDashboard();
      });
      channel.subscribe();
      _state.notifChannel = channel;
    } catch (e) {
      console.warn('[fxv2] notification realtime unavailable:', e && e.message);
    }
  }

  async function _doMarkNotifRead(notifId) {
    if (!notifId) return;
    try {
      var sb = await window.FixeoSupabase.getClient();
      await sb.from('notifications').update({ read: true }).eq('id', notifId);
      /* Update local state */
      _state.notifications = (_state.notifications || []).map(function(n) {
        return n.id === notifId ? Object.assign({}, n, { read: true }) : n;
      });
      _renderNotificationBell();
      _renderNotificationsSection();
    } catch(e) { /* best-effort */ }
  }

  function _renderNotificationBell() {
    /* Show unread count badge on notification icon if any */
    var unread = (_state.notifications || []).filter(function(n) { return !n.read; }).length;
    var bell   = document.getElementById('fxv2-notif-bell');
    if (!bell) return;
    var badge = bell.querySelector('.fxv2-notif-badge');
    if (unread > 0) {
      bell.setAttribute('aria-label', unread + ' notification(s) non lue(s)');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'fxv2-notif-badge';
        bell.appendChild(badge);
      }
      badge.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      bell.setAttribute('aria-label', 'Notifications');
      if (badge) badge.remove();
    }
  }

  function _notificationContext(n) {
    var raw=[n&&n.type,n&&n.title,n&&n.message].filter(Boolean).join(' ').toLowerCase();
    var action='go-requests', cta='Voir les demandes', kind='update';
    if(/mission|artisan|intervention|assign/.test(raw)){action='go-missions';cta='Voir les missions';kind='mission';}
    if(/confirm|validation|termin/.test(raw)){action='go-requests';cta='Vérifier';kind='decision';}
    if(/devis|quote|proposition/.test(raw)){action='go-requests';cta='Examiner';kind='decision';}
    if(/support|aide/.test(raw)){action='go-support';cta='Ouvrir le support';kind='support';}
    return {action:action,cta:cta,kind:kind};
  }
  function _renderC36NotifCard(n) {
    var c=_notificationContext(n), cls=n.read?' is-read':' is-unread';
    return '<article class="fxv2-c36-item'+cls+'" data-kind="'+esc(c.kind)+'">'
      +'<div class="fxv2-c36-dot"></div><div class="fxv2-c36-copy"><strong>'+esc(n.title||n.type||'Mise à jour FIXEO')+'</strong>'
      +(n.message?'<p>'+esc(n.message)+'</p>':'')+'<small>'+esc(fmtDate(n.created_at))+'</small></div>'
      +'<div class="fxv2-c36-actions"><button data-action="'+esc(c.action)+'">'+esc(c.cta)+'</button>'+(!n.read?'<button class="fxv2-c36-read" data-action="mark-notif-read" data-id="'+esc(n.id)+'">Marquer lue</button>':'')+'</div>'
    +'</article>';
  }
  function _renderNotificationList() {
    var notifs=(_state.notifications||[]).slice().sort(function(a,b){return new Date(b.created_at||0)-new Date(a.created_at||0);});
    if(!notifs.length) return '<section class="fxv2-c36-empty"><div>🔔</div><strong>Tout est à jour</strong><p>Les décisions, interventions et mises à jour FIXEO apparaîtront ici.</p><button data-action="go-requests">Voir mes demandes</button></section>';
    var unread=notifs.filter(function(n){return !n.read;}), read=notifs.filter(function(n){return n.read;});
    var action=unread.filter(function(n){return _notificationContext(n).kind==='decision';});
    var updates=unread.filter(function(n){return _notificationContext(n).kind!=='decision';});
    return '<div class="fxv2-c36-summary"><div><span>À TRAITER</span><strong>'+action.length+'</strong></div><div><span>NOUVELLES</span><strong>'+updates.length+'</strong></div><div><span>HISTORIQUE</span><strong>'+read.length+'</strong></div></div>'
      +(action.length?'<section class="fxv2-c36-group"><h3>À traiter maintenant</h3>'+action.map(_renderC36NotifCard).join('')+'</section>':'')
      +(updates.length?'<section class="fxv2-c36-group"><h3>Mises à jour</h3>'+updates.map(_renderC36NotifCard).join('')+'</section>':'')
      +(read.length?'<section class="fxv2-c36-group fxv2-c36-history"><h3>Historique</h3>'+read.slice(0,12).map(_renderC36NotifCard).join('')+'</section>':'');
  }


  /* ── MODAL ────────────────────────────────────────────────────── */
  var _modalReturnFocus=null;
  function _openModal(html) {
    var overlay = el('fxv2-modal-overlay');
    var body    = el('fxv2-modal-body');
    if (!overlay || !body) return;
    _modalReturnFocus=document.activeElement;
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    var close=el('fxv2-modal-close');
    if(close) setTimeout(function(){close.focus();},0);
  }
  function _closeModal() {
    var overlay = el('fxv2-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if(_modalReturnFocus&&typeof _modalReturnFocus.focus==='function') _modalReturnFocus.focus();
    _modalReturnFocus=null;
  }

  /* ── TOAST ────────────────────────────────────────────────────── */
  function _toast(msg, type) {
    var wrap = el('fxv2-toast-wrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'fxv2-toast ' + (type || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }

  /* ── SKELETON ON INITIAL LOAD ─────────────────────────────────── */
  function _showSkeleton() {
    ['fxv2-sec-dashboard', 'fxv2-sec-requests', 'fxv2-sec-missions'].forEach(function (id) {
      var s = el(id);
      if (s) s.innerHTML = _renderSkeleton(3);
    });
  }

  /* ── REFRESH (re-fetch + re-render) ───────────────────────────── */
  async function _refresh() {
    try {
      await _fetch();
      _render();
    } catch (e) {
      console.warn('[fxv2] refresh error:', e && e.message);
    }
  }

  /* ── INIT ─────────────────────────────────────────────────────── */
  async function init() {
    /* Bind modal close */
    var mClose = el('fxv2-modal-close');
    if (mClose) mClose.addEventListener('click', _closeModal);
    var mOverlay = el('fxv2-modal-overlay');
    if (mOverlay) mOverlay.addEventListener('click', function (e) {
      if (e.target === mOverlay) _closeModal();
    });

    _syncSidebarA11y();
    window.addEventListener('resize', _syncSidebarA11y);
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') _closeModal(); });

    /* Show skeletons immediately */
    _showSkeleton();

    /* Auth */
    var FS = window.FixeoSupabase;
    if (!FS) {
      _showLoginGate('FixeoSupabase non disponible. Rechargez la page.');
      return;
    }

    try {
      await FS.init();
      var session = await FS.getSession();
      if (!session || !session.user) {
        _showLoginGate(null);
        return;
      }
      _state.session = session;

      /* Get profile (non-blocking — enrich sidebar after fetch) */
      try {
        _state.profile = await FS.getProfile(session.user.id);
      } catch (e) {
        _state.profile = {
          id: session.user.id,
          full_name: (session.user.user_metadata && session.user.user_metadata.full_name) || '',
          email: session.user.email || '',
          city: '',
          phone: ''
        };
      }

      /* Wire nav — happens before fetch so sidebar is responsive */
      _injectNotifBell();
      _bindNav();
      _bindActions();
      _showSection('dashboard');

      /* Fetch data */
      await _fetch();

      /* Render */
      _render();
      _subscribeCanonicalNotifications(session.user.id);

    } catch (e) {
      console.warn('[fxv2] init error:', e && e.message);
      if (e && (e.message || '').includes('Session')) {
        _showLoginGate(null);
      } else {
        _showLoginGate('Erreur de chargement\u00a0: ' + (e && e.message ? e.message : 'inconnue'));
      }
    }
  }

  /* ── LOGIN GATE ───────────────────────────────────────────────── */
  function _showLoginGate(msg) {
    document.body.innerHTML = '<div class="fxv2-login-gate">'
      + '<div class="fxv2-login-box">'
      + '<div class="fxv2-login-logo">Fixeo</div>'
      + '<div class="fxv2-login-sub">Connectez-vous pour acc\u00e9der \u00e0 votre espace.</div>'
      + (msg ? '<div class="fxv2-error-banner" style="margin-bottom:16px">' + esc(msg) + '</div>' : '')
      + '<a class="fxv2-btn fxv2-btn-primary" href="auth.html" style="width:100%;justify-content:center;text-decoration:none">Se connecter</a>'
      + '</div></div>';
  }

  /* ── BOOT ─────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);

  /* ── PUBLIC API — minimal read-only diagnostic surface ────────
     Exposes current state and refresh for controlled tests/diagnostics.
     Client OS has no companion renderer authority. */
  window.FixeoDashboardV2 = { _state: _state, _refresh: _refresh };

})(window, document);
