/**
 * FIXEO Admin — Canonical Sync V1
 * js/admin-canonical-sync-v1.js   v1a
 * ─────────────────────────────────────────────────────────────
 * Synchronizes the admin dashboard with the canonical artisan/
 * request/mission/quote/claim system established in phases
 * 7C.11–7C.12A.3.
 *
 * WHAT THIS FILE DOES
 * ───────────────────
 * 1. Claims queue — reads claim_requests from Supabase, renders
 *    a dedicated "⏳ Claims" section with approve/reject via
 *    FixeoRepository RPCs (approve_artisan_claim / reject_artisan_claim)
 *    — NO direct artisan table writes.
 *
 * 2. Artisan lifecycle view — augments admin artisan rows with
 *    canonical lifecycle pills:
 *      CLAIM APPROVED / ONBOARDING COMPLETED / AVAILABLE / VERIFIED
 *    (four distinct states, never conflated)
 *
 * 3. Admin home command center — injects a priority queue panel
 *    (#fxacs-home-panel) at the top of #admin-section-overview
 *    answering: pending claims | unassigned requests | active missions
 *    | artisans not operational.
 *
 * 4. Service requests operational view — reads service_requests,
 *    shows: new | assigned | active | completed | failed states.
 *    No fake lifecycle states invented.
 *
 * 5. Mission control — reads missions joined with artisan/request
 *    context, shows canonical fields only (agreed_price if not null,
 *    final_price never assumed).
 *
 * 6. Quotes visibility — reads quotes with artisan + request link.
 *
 * 7. Financial truth — agreed_price shown only when not null;
 *    final_price only when present in data; never 0-fills unknowns.
 *
 * WHAT THIS FILE NEVER DOES
 * ─────────────────────────
 * • Never writes owner_user_id, onboarding_completed, verified,
 *   claimed, claim_status directly via artisans UPDATE.
 * • Never invents metrics, fake revenue, fake commission.
 * • Never uses service_role key.
 * • Never touches pricing engine, session logic, Supabase schema.
 * • Never interferes with existing admin modules (additive only).
 *
 * SECURITY
 * ────────
 * All privileged artisan lifecycle writes go through
 * window.FixeoRepository.approveClaimRequest() /
 * window.FixeoRepository.rejectClaimRequest()
 * which call approve_artisan_claim / reject_artisan_claim RPCs
 * (SECURITY DEFINER, admin-verified server-side).
 *
 * GUARD: window._fxAcsV1Loaded (idempotent)
 * ─────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  if (window._fxAcsV1Loaded) return;
  window._fxAcsV1Loaded = true;

  var VERSION = 'v1a';
  var LOG     = '[FXACS]';

  /* ── Helpers ───────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function esc(s)   { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function log()    { var args = Array.prototype.slice.call(arguments); args.unshift(LOG); console.log.apply(console, args); }
  function warn()   { var args = Array.prototype.slice.call(arguments); args.unshift(LOG); console.warn.apply(console, args); }

  function fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
    catch(e) { return String(s); }
  }
  function fmtDateShort(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
    catch(e) { return String(s); }
  }
  function elapsed(s) {
    if (!s) return '—';
    var ms = Date.now() - new Date(s).getTime();
    if (ms < 0)   return 'maintenant';
    var m = Math.floor(ms / 60000);
    if (m < 60)   return m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24)   return h + 'h';
    return Math.floor(h / 24) + 'j';
  }

  /* ── Supabase client resolver ───────────────────────────── */
  function getSb() {
    if (window.FixeoSupabaseClient && typeof window.FixeoSupabaseClient.getClient === 'function') {
      return window.FixeoSupabaseClient.getClient();
    }
    if (window.FixeoSupabaseCore && typeof window.FixeoSupabaseCore.getClient === 'function') {
      return window.FixeoSupabaseCore.getClient();
    }
    /* Fallback: raw client from supabase-client.js */
    if (window._fixeoSupabaseClient) return Promise.resolve(window._fixeoSupabaseClient);
    return Promise.reject(new Error('No Supabase client available'));
  }

  /* ── State ───────────────────────────────────────────────── */
  var _state = {
    claims:    [],  /* claim_requests */
    artisans:  [],  /* artisans (canonical fields) */
    requests:  [],  /* service_requests */
    missions:  [],  /* missions */
    quotes:    [],  /* quotes */
    loading:   false,
    lastSync:  0
  };

  /* ── Lifecycle pill rendering ────────────────────────────── */
  function _lifecyclePills(a) {
    /*
     * Four distinct states — displayed as separate pills, never merged.
     * Order: CLAIM → ONBOARDING → AVAILABLE → VERIFIED
     */
    var pills = '';

    /* Claim / ownership */
    if (a.owner_user_id) {
      if (a.claim_status === 'approved' || a.claimed === true) {
        pills += '<span class="fxacs-pill fxacs-pill-claim-ok" title="Compte lié">🔗 Lié</span>';
      }
    } else if (a.claim_status === 'pending') {
      pills += '<span class="fxacs-pill fxacs-pill-claim-pend" title="Revendication en attente">⏳ Claim</span>';
    } else if (a.claim_status === 'rejected') {
      pills += '<span class="fxacs-pill fxacs-pill-claim-rej" title="Revendication rejetée">✗ Rejeté</span>';
    } else {
      pills += '<span class="fxacs-pill fxacs-pill-unlinked" title="Pas de compte lié">— Non lié</span>';
    }

    /* Onboarding */
    if (a.onboarding_completed) {
      pills += '<span class="fxacs-pill fxacs-pill-onboard" title="Profil complété">✓ Activé</span>';
    } else {
      pills += '<span class="fxacs-pill fxacs-pill-onboard-no" title="Profil non complété">○ Non activé</span>';
    }

    /* Availability */
    if (a.availability === 'available') {
      pills += '<span class="fxacs-pill fxacs-pill-avail" title="Disponible">🟢 Dispo</span>';
    } else {
      pills += '<span class="fxacs-pill fxacs-pill-avail-no" title="Indisponible">⚫ Indisp.</span>';
    }

    /* Verified */
    if (a.verified) {
      pills += '<span class="fxacs-pill fxacs-pill-verified" title="Artisan vérifié Fixeo">✅ Vérifié</span>';
    } else {
      pills += '<span class="fxacs-pill fxacs-pill-unverified" title="Non vérifié">○ Non vérifié</span>';
    }

    return pills;
  }

  function _artisanOperational(a) {
    /* Operational = linked + onboarding complete + available */
    return !!(a.owner_user_id && a.onboarding_completed && a.availability === 'available');
  }

  /* ── FETCH — Claims ─────────────────────────────────────── */
  async function _fetchClaims(sb) {
    var res = await sb.from('claim_requests')
      .select('id,artisan_legacy_id,requester_user_id,status,created_at,reviewed_at,notes')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) { warn('fetchClaims error', res.error.message); return []; }
    return res.data || [];
  }

  /* ── FETCH — Artisans (canonical fields) ─────────────────── */
  async function _fetchArtisans(sb) {
    var res = await sb.from('artisans')
      .select([
        'id','legacy_id','full_name','service_category','city','work_zone',
        'availability','verified','claimed','claim_status','owner_user_id',
        'onboarding_completed','photo_url','rating','phone_public',
        'description','created_at','updated_at'
      ].join(','))
      .order('created_at', { ascending: false })
      .limit(200);
    if (res.error) { warn('fetchArtisans error', res.error.message); return []; }
    return res.data || [];
  }

  /* ── FETCH — Service Requests ───────────────────────────── */
  async function _fetchRequests(sb) {
    var res = await sb.from('service_requests')
      .select('id,service_slug,city,status,description,created_at,updated_at,is_urgent,client_name,amount_mad')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) { warn('fetchRequests error', res.error.message); return []; }
    return res.data || [];
  }

  /* ── FETCH — Missions ───────────────────────────────────── */
  async function _fetchMissions(sb) {
    var res = await sb.from('missions')
      .select('id,request_id,artisan_id,status,agreed_price,final_price,created_at,updated_at,started_at,completed_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) { warn('fetchMissions error', res.error.message); return []; }
    return res.data || [];
  }

  /* ── FETCH — Quotes ─────────────────────────────────────── */
  async function _fetchQuotes(sb) {
    var res = await sb.from('quotes')
      .select('id,request_id,artisan_id,status,price,message,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) { warn('fetchQuotes error', res.error.message); return []; }
    return res.data || [];
  }

  /* ── MASTER FETCH ────────────────────────────────────────── */
  async function _syncAll() {
    if (_state.loading) return;
    _state.loading = true;
    _renderLoadingState();
    try {
      var sb = await getSb();
      var results = await Promise.allSettled([
        _fetchClaims(sb),
        _fetchArtisans(sb),
        _fetchRequests(sb),
        _fetchMissions(sb),
        _fetchQuotes(sb)
      ]);
      _state.claims   = results[0].status === 'fulfilled' ? results[0].value : [];
      _state.artisans = results[1].status === 'fulfilled' ? results[1].value : [];
      _state.requests = results[2].status === 'fulfilled' ? results[2].value : [];
      _state.missions = results[3].status === 'fulfilled' ? results[3].value : [];
      _state.quotes   = results[4].status === 'fulfilled' ? results[4].value : [];
      _state.lastSync = Date.now();
      log('Synced: claims=' + _state.claims.length + ' artisans=' + _state.artisans.length + ' requests=' + _state.requests.length + ' missions=' + _state.missions.length + ' quotes=' + _state.quotes.length);
      _renderAll();
    } catch(e) {
      warn('syncAll error', e.message || e);
      _renderError(e.message || 'Erreur de synchronisation');
    } finally {
      _state.loading = false;
    }
  }

  /* ── RENDER LOADING STATE ────────────────────────────────── */
  function _renderLoadingState() {
    var ids = ['fxacs-claims-list','fxacs-requests-list','fxacs-missions-list','fxacs-quotes-list','fxacs-artisan-lifecycle-body'];
    ids.forEach(function(id) {
      var el2 = el(id);
      if (el2) el2.innerHTML = '<div class="fxacs-loading">⏳ Chargement…</div>';
    });
  }

  /* ── RENDER ERROR ────────────────────────────────────────── */
  function _renderError(msg) {
    var c = el('fxacs-home-panel');
    if (c) {
      var errBanner = el('fxacs-error-banner');
      if (errBanner) { errBanner.textContent = '⚠️ ' + msg; errBanner.style.display = 'block'; }
    }
  }

  /* ── RENDER ALL ──────────────────────────────────────────── */
  function _renderAll() {
    _renderHomePanel();
    _renderClaimsSection();
    _renderLifecycleSection();
    _renderRequestsSection();
    _renderMissionsSection();
    _renderQuotesSection();
    _updateLastSyncTime();
  }

  /* ── HOME PANEL — Priority queue ────────────────────────── */
  function _renderHomePanel() {
    var panel = el('fxacs-home-panel');
    if (!panel) return;

    var pendingClaims   = _state.claims.filter(function(c){ return c.status === 'pending'; });
    var unassigned      = _state.requests.filter(function(r){ return r.status === 'new' || r.status === 'pending'; });
    var activeMissions  = _state.missions.filter(function(m){ return m.status === 'in_progress' || m.status === 'accepted'; });
    var notOperational  = _state.artisans.filter(function(a){ return !_artisanOperational(a); });

    var html = '';

    /* Attention items */
    if (pendingClaims.length > 0) {
      html += '<div class="fxacs-alert fxacs-alert-warn">'
        + '<span class="fxacs-alert-icon">⏳</span>'
        + '<span class="fxacs-alert-text"><strong>' + pendingClaims.length + ' claim(s) en attente</strong> — artisans demandant l\'accès à leur profil.</span>'
        + '<button class="fxacs-alert-btn" onclick="adminSection(\'fxacs-claims\')">Voir</button>'
        + '</div>';
    }
    if (unassigned.length > 0) {
      html += '<div class="fxacs-alert fxacs-alert-info">'
        + '<span class="fxacs-alert-icon">📋</span>'
        + '<span class="fxacs-alert-text"><strong>' + unassigned.length + ' demande(s) non assignée(s)</strong> — en attente d\'artisan.</span>'
        + '<button class="fxacs-alert-btn" onclick="adminSection(\'fxacs-requests\')">Voir</button>'
        + '</div>';
    }
    if (activeMissions.length > 0) {
      html += '<div class="fxacs-alert fxacs-alert-success">'
        + '<span class="fxacs-alert-icon">🔧</span>'
        + '<span class="fxacs-alert-text"><strong>' + activeMissions.length + ' mission(s) active(s)</strong> en cours.</span>'
        + '<button class="fxacs-alert-btn" onclick="adminSection(\'fxacs-missions\')">Voir</button>'
        + '</div>';
    }
    if (notOperational.length > 0 && _state.artisans.length > 0) {
      html += '<div class="fxacs-alert fxacs-alert-muted">'
        + '<span class="fxacs-alert-icon">👷</span>'
        + '<span class="fxacs-alert-text"><strong>' + notOperational.length + '/' + _state.artisans.length + ' artisan(s) non opérationnels</strong>.</span>'
        + '<button class="fxacs-alert-btn" onclick="adminSection(\'fxacs-artisans\')">Voir</button>'
        + '</div>';
    }
    if (!html) {
      html = '<div class="fxacs-alert fxacs-alert-ok"><span class="fxacs-alert-icon">✅</span><span class="fxacs-alert-text">Aucune action urgente — tout est opérationnel.</span></div>';
    }

    panel.innerHTML = html;
  }

  /* ── CLAIMS SECTION ─────────────────────────────────────── */
  function _renderClaimsSection() {
    var list = el('fxacs-claims-list');
    if (!list) return;

    var claims = _state.claims;
    if (!claims.length) {
      list.innerHTML = '<div class="fxacs-empty">Aucune demande de claim.</div>';
      return;
    }

    /* Update sidebar badge */
    var pendingCount = claims.filter(function(c){ return c.status === 'pending'; }).length;
    var badge = el('fxacs-claims-badge');
    if (badge) { badge.textContent = pendingCount || ''; badge.style.display = pendingCount ? '' : 'none'; }

    var html = '<table class="fxacs-table">'
      + '<thead><tr>'
      + '<th>Artisan ID</th><th>Demandeur</th><th>Statut</th><th>Date</th><th>Actions</th>'
      + '</tr></thead><tbody>';

    claims.forEach(function(c) {
      var isPending  = c.status === 'pending';
      var statusPill = isPending
        ? '<span class="fxacs-pill fxacs-pill-claim-pend">⏳ En attente</span>'
        : c.status === 'approved'
          ? '<span class="fxacs-pill fxacs-pill-claim-ok">✓ Approuvé</span>'
          : '<span class="fxacs-pill fxacs-pill-claim-rej">✗ Rejeté</span>';

      html += '<tr class="' + (isPending ? 'fxacs-row-highlight' : '') + '">'
        + '<td><span class="fxacs-mono">' + esc(String(c.artisan_legacy_id || '—').substring(0, 12)) + '</span></td>'
        + '<td><span class="fxacs-mono">' + esc(String(c.requester_user_id || '—').substring(0, 12)) + '…</span></td>'
        + '<td>' + statusPill + '</td>'
        + '<td>' + fmtDate(c.created_at) + '</td>'
        + '<td>';

      if (isPending) {
        html += '<button class="fxacs-btn fxacs-btn-approve" data-fxacs-action="approve-claim" data-claim-id="' + esc(c.id) + '">✓ Approuver</button>'
              + ' <button class="fxacs-btn fxacs-btn-reject" data-fxacs-action="reject-claim" data-claim-id="' + esc(c.id) + '">✗ Rejeter</button>';
      } else {
        html += '<span class="fxacs-muted">—</span>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }

  /* ── ARTISAN LIFECYCLE SECTION ───────────────────────────── */
  function _renderLifecycleSection() {
    var tbody = el('fxacs-artisan-lifecycle-body');
    if (!tbody) return;

    if (!_state.artisans.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fxacs-empty">Aucun artisan trouvé.</td></tr>';
      return;
    }

    var html = '';
    _state.artisans.forEach(function(a) {
      var name = esc(a.full_name || '—');
      var cat  = esc(a.service_category || '—');
      var city = esc(a.city || '—');
      var pills = _lifecyclePills(a);
      var completeness = _profileCompleteness(a);

      html += '<tr>'
        + '<td>'
        + (a.photo_url ? '<img src="' + esc(a.photo_url) + '" class="fxacs-avatar" alt="Photo">' : '<span class="fxacs-avatar-init">' + esc((a.full_name||'?')[0].toUpperCase()) + '</span>')
        + ' <strong>' + name + '</strong>'
        + '</td>'
        + '<td>' + cat + '</td>'
        + '<td>' + city + '</td>'
        + '<td><div class="fxacs-pills">' + pills + '</div></td>'
        + '<td>'
        + '<div class="fxacs-completeness-bar-bg"><div class="fxacs-completeness-bar-fill" style="width:' + completeness + '%"></div></div>'
        + '<span class="fxacs-muted" style="font-size:.7rem">' + completeness + '%</span>'
        + '</td>'
        + '<td>' + (a.rating ? (parseFloat(a.rating).toFixed(1) + ' ★') : '—') + '</td>'
        + '<td>' + fmtDateShort(a.created_at) + '</td>'
        + '<td>'
        + (a.owner_user_id ? '' : '<span class="fxacs-muted">Pas de compte</span>')
        + '</td>'
        + '</tr>';
    });

    tbody.innerHTML = html;
  }

  function _profileCompleteness(a) {
    var fields = [
      !!a.full_name,
      !!a.service_category,
      !!a.city,
      !!a.description,
      !!a.photo_url,
      !!a.phone_public
    ];
    var count = fields.filter(Boolean).length;
    return Math.round((count / fields.length) * 100);
  }

  /* ── REQUESTS SECTION ────────────────────────────────────── */
  function _renderRequestsSection() {
    var list = el('fxacs-requests-list');
    if (!list) return;

    var requests = _state.requests;
    if (!requests.length) {
      list.innerHTML = '<div class="fxacs-empty">Aucune demande.</div>';
      return;
    }

    var statusPillMap = {
      'new'         : '<span class="fxacs-pill fxacs-pill-new">🆕 Nouveau</span>',
      'pending'     : '<span class="fxacs-pill fxacs-pill-new">⏳ En attente</span>',
      'assigned'    : '<span class="fxacs-pill fxacs-pill-assigned">📌 Assigné</span>',
      'offered'     : '<span class="fxacs-pill fxacs-pill-assigned">📤 Proposé</span>',
      'in_progress' : '<span class="fxacs-pill fxacs-pill-progress">🔧 En cours</span>',
      'completed'   : '<span class="fxacs-pill fxacs-pill-done">✓ Terminé</span>',
      'validated'   : '<span class="fxacs-pill fxacs-pill-done">✅ Validé</span>',
      'cancelled'   : '<span class="fxacs-pill fxacs-pill-cancel">✗ Annulé</span>'
    };

    var html = '<table class="fxacs-table">'
      + '<thead><tr>'
      + '<th>ID</th><th>Service</th><th>Ville</th><th>Statut</th><th>Urgence</th><th>Créé</th><th>Âge</th>'
      + '</tr></thead><tbody>';

    requests.forEach(function(r) {
      var statusPill = statusPillMap[r.status] || '<span class="fxacs-pill">' + esc(r.status) + '</span>';
      html += '<tr>'
        + '<td><span class="fxacs-mono">' + esc(String(r.id || '').substring(0, 8)) + '…</span></td>'
        + '<td>' + esc(r.service_slug || '—') + '</td>'
        + '<td>' + esc(r.city || '—') + '</td>'
        + '<td>' + statusPill + '</td>'
        + '<td>' + (r.is_urgent ? '<span class="fxacs-pill fxacs-pill-urgent">⚡ Urgence</span>' : '—') + '</td>'
        + '<td>' + fmtDate(r.created_at) + '</td>'
        + '<td class="fxacs-muted">' + elapsed(r.created_at) + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }

  /* ── MISSIONS SECTION ────────────────────────────────────── */
  function _renderMissionsSection() {
    var list = el('fxacs-missions-list');
    if (!list) return;

    var missions = _state.missions;
    if (!missions.length) {
      list.innerHTML = '<div class="fxacs-empty">Aucune mission.</div>';
      return;
    }

    var statusPillMap = {
      'sent'       : '<span class="fxacs-pill fxacs-pill-new">📤 Envoyé</span>',
      'offered'    : '<span class="fxacs-pill fxacs-pill-new">📬 Proposé</span>',
      'pending'    : '<span class="fxacs-pill fxacs-pill-new">⏳ En attente</span>',
      'accepted'   : '<span class="fxacs-pill fxacs-pill-assigned">✓ Accepté</span>',
      'in_progress': '<span class="fxacs-pill fxacs-pill-progress">🔧 En cours</span>',
      'completed'  : '<span class="fxacs-pill fxacs-pill-done">✓ Terminé</span>',
      'validated'  : '<span class="fxacs-pill fxacs-pill-done">✅ Validé</span>',
      'cancelled'  : '<span class="fxacs-pill fxacs-pill-cancel">✗ Annulé</span>'
    };

    var html = '<table class="fxacs-table">'
      + '<thead><tr>'
      + '<th>Mission ID</th><th>Request ID</th><th>Artisan ID</th><th>Statut</th>'
      + '<th>Prix convenu</th><th>Prix final</th><th>Créé</th><th>Durée</th>'
      + '</tr></thead><tbody>';

    missions.forEach(function(m) {
      var statusPill = statusPillMap[m.status] || '<span class="fxacs-pill">' + esc(m.status) + '</span>';

      /* Financial truth: never show 0 MAD for unknowns */
      var agreedPrice = (m.agreed_price !== null && m.agreed_price !== undefined)
        ? esc(String(m.agreed_price)) + ' MAD'
        : '<span class="fxacs-muted">—</span>';
      var finalPrice = (m.final_price !== null && m.final_price !== undefined)
        ? esc(String(m.final_price)) + ' MAD'
        : '<span class="fxacs-muted">—</span>';

      var duration = (m.started_at && m.completed_at)
        ? Math.round((new Date(m.completed_at) - new Date(m.started_at)) / 60000) + ' min'
        : '—';

      html += '<tr>'
        + '<td><span class="fxacs-mono">' + esc(String(m.id || '').substring(0, 8)) + '…</span></td>'
        + '<td><span class="fxacs-mono">' + esc(String(m.request_id || '').substring(0, 8)) + '…</span></td>'
        + '<td><span class="fxacs-mono">' + esc(String(m.artisan_id || '—').substring(0, 8)) + '…</span></td>'
        + '<td>' + statusPill + '</td>'
        + '<td>' + agreedPrice + '</td>'
        + '<td>' + finalPrice + '</td>'
        + '<td>' + fmtDate(m.created_at) + '</td>'
        + '<td class="fxacs-muted">' + duration + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }

  /* ── QUOTES SECTION ──────────────────────────────────────── */
  function _renderQuotesSection() {
    var list = el('fxacs-quotes-list');
    if (!list) return;

    var quotes = _state.quotes;
    if (!quotes.length) {
      list.innerHTML = '<div class="fxacs-empty">Aucun devis.</div>';
      return;
    }

    var statusPillMap = {
      'pending'  : '<span class="fxacs-pill fxacs-pill-new">⏳ En attente</span>',
      'sent'     : '<span class="fxacs-pill fxacs-pill-assigned">📤 Envoyé</span>',
      'accepted' : '<span class="fxacs-pill fxacs-pill-done">✓ Accepté</span>',
      'rejected' : '<span class="fxacs-pill fxacs-pill-cancel">✗ Rejeté</span>'
    };

    var html = '<table class="fxacs-table">'
      + '<thead><tr>'
      + '<th>Devis ID</th><th>Request ID</th><th>Artisan ID</th>'
      + '<th>Prix</th><th>Statut</th><th>Créé</th>'
      + '</tr></thead><tbody>';

    quotes.forEach(function(q) {
      var statusPill = statusPillMap[q.status] || '<span class="fxacs-pill">' + esc(q.status || '—') + '</span>';
      html += '<tr>'
        + '<td><span class="fxacs-mono">' + esc(String(q.id || '').substring(0, 8)) + '…</span></td>'
        + '<td><span class="fxacs-mono">' + esc(String(q.request_id || '').substring(0, 8)) + '…</span></td>'
        + '<td><span class="fxacs-mono">' + esc(String(q.artisan_id || '—').substring(0, 8)) + '…</span></td>'
        + '<td>' + (q.price ? esc(String(q.price)) + ' MAD' : '<span class="fxacs-muted">—</span>') + '</td>'
        + '<td>' + statusPill + '</td>'
        + '<td>' + fmtDate(q.created_at) + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }

  /* ── LAST SYNC TIME ──────────────────────────────────────── */
  function _updateLastSyncTime() {
    var el2 = el('fxacs-last-sync');
    if (el2 && _state.lastSync) {
      el2.textContent = 'Sync: ' + new Date(_state.lastSync).toLocaleTimeString('fr-FR');
    }
  }

  /* ── ACTION HANDLER (claims) ─────────────────────────────── */
  function _handleAction(e) {
    var btn = e.target.closest('[data-fxacs-action]');
    if (!btn) return;
    var action  = btn.dataset.fxacsAction;
    var claimId = btn.dataset.claimId;

    if (action === 'approve-claim' && claimId) {
      _doApprove(claimId, btn);
    } else if (action === 'reject-claim' && claimId) {
      _doReject(claimId, btn);
    } else if (action === 'fxacs-refresh') {
      _syncAll();
    }
  }

  async function _doApprove(claimId, btn) {
    if (!window.FixeoRepository || typeof window.FixeoRepository.approveClaimRequest !== 'function') {
      alert('FixeoRepository non disponible — rechargez la page.');
      return;
    }
    var confirmed = confirm('Approuver ce claim ? L\'artisan sera lié au compte demandeur.');
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      var res = await window.FixeoRepository.approveClaimRequest(claimId, 'Approuvé depuis admin canonical sync');
      if (res && res.ok) {
        _showToast('✓ Claim approuvé — profil lié', 'success');
        setTimeout(function(){ _syncAll(); }, 800);
      } else {
        var reason = (res && res.reason) || 'Erreur inconnue';
        _showToast('⚠️ Échec: ' + reason, 'error');
        btn.disabled = false;
        btn.textContent = '✓ Approuver';
      }
    } catch(e) {
      _showToast('⚠️ Erreur: ' + (e.message || e), 'error');
      btn.disabled = false;
      btn.textContent = '✓ Approuver';
    }
  }

  async function _doReject(claimId, btn) {
    if (!window.FixeoRepository || typeof window.FixeoRepository.rejectClaimRequest !== 'function') {
      alert('FixeoRepository non disponible — rechargez la page.');
      return;
    }
    var note = prompt('Motif de rejet (optionnel):');
    if (note === null) return; /* cancelled */

    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      var res = await window.FixeoRepository.rejectClaimRequest(claimId, note || '');
      if (res && res.ok) {
        _showToast('Claim rejeté', 'info');
        setTimeout(function(){ _syncAll(); }, 800);
      } else {
        var reason = (res && res.reason) || 'Erreur inconnue';
        _showToast('⚠️ Échec: ' + reason, 'error');
        btn.disabled = false;
        btn.textContent = '✗ Rejeter';
      }
    } catch(e) {
      _showToast('⚠️ Erreur: ' + (e.message || e), 'error');
      btn.disabled = false;
      btn.textContent = '✗ Rejeter';
    }
  }

  /* ── TOAST ───────────────────────────────────────────────── */
  function _showToast(msg, type) {
    var wrap = el('fxacs-toast-wrap');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'fxacs-toast fxacs-toast-' + (type || 'info');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function() { t.remove(); }, 4000);
  }

  /* ── INJECT SECTIONS INTO admin.html ─────────────────────── */
  function _injectSections() {
    /* Home panel — injected at top of #admin-section-overview */
    var overview = el('admin-section-overview');
    if (overview && !el('fxacs-home-panel')) {
      var panel = document.createElement('div');
      panel.id = 'fxacs-home-panel';
      panel.className = 'fxacs-home-panel chart-card';
      panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
        + '<h3 style="font-size:.95rem;margin:0">⚡ Actions prioritaires</h3>'
        + '<span id="fxacs-last-sync" style="font-size:.7rem;color:var(--text-muted)"></span>'
        + '</div>'
        + '<div id="fxacs-error-banner" style="display:none;color:var(--danger);font-size:.8rem;margin-bottom:8px"></div>'
        + '<div id="fxacs-home-alerts">⏳ Chargement…</div>';
      /* Replace #fxacs-home-alerts with the render target we expect */
      panel.innerHTML = panel.innerHTML.replace('id="fxacs-home-alerts"','id="fxacs-home-panel-inner"');
      /* Fix: set up properly */
      panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
        + '<h3 style="font-size:.95rem;margin:0">⚡ Actions prioritaires</h3>'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<span id="fxacs-last-sync" style="font-size:.7rem;color:var(--text-muted)"></span>'
        + '<button class="fxacs-btn" data-fxacs-action="fxacs-refresh" style="font-size:.75rem;padding:4px 10px">🔄</button>'
        + '</div></div>'
        + '<div id="fxacs-error-banner" style="display:none;background:rgba(225,48,108,.1);border:1px solid rgba(225,48,108,.3);border-radius:8px;padding:8px 12px;font-size:.8rem;color:#E1306C;margin-bottom:8px"></div>';
      overview.insertBefore(panel, overview.firstChild);
    }

    /* Sidebar — add canonical nav links if not present */
    var sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav && !el('fxacs-sidebar-link-claims')) {
      var section = document.createElement('div');
      section.className = 'sidebar-section-label';
      section.textContent = 'Canonical';
      sidebarNav.appendChild(section);

      var links = [
        { id: 'fxacs-sidebar-link-claims',    section: 'fxacs-claims',   icon: '⏳', label: 'Claims artisans',  badge: 'fxacs-claims-badge' },
        { id: 'fxacs-sidebar-link-artisans',  section: 'fxacs-artisans', icon: '👷', label: 'Lifecycle artisans', badge: null },
        { id: 'fxacs-sidebar-link-requests',  section: 'fxacs-requests', icon: '📋', label: 'Demandes clients',   badge: null },
        { id: 'fxacs-sidebar-link-missions',  section: 'fxacs-missions', icon: '🔧', label: 'Missions',           badge: null },
        { id: 'fxacs-sidebar-link-quotes',    section: 'fxacs-quotes',   icon: '💬', label: 'Devis',              badge: null }
      ];

      links.forEach(function(lnk) {
        var a = document.createElement('a');
        a.className = 'sidebar-link';
        a.id = lnk.id;
        a.setAttribute('onclick', 'adminSection("' + lnk.section + '")');
        a.innerHTML = '<span class="icon">' + lnk.icon + '</span><span>' + lnk.label + '</span>'
          + (lnk.badge ? '<span class="sidebar-count pending" id="' + lnk.badge + '" style="display:none">0</span>' : '');
        sidebarNav.appendChild(a);
      });
    }

    /* Inject canonical sections into main content */
    var main = el('main-content');
    if (main) {
      _injectSection(main, 'fxacs-claims',
        '⏳ Claims Artisans',
        '<div id="fxacs-claims-list" class="fxacs-section-body"><div class="fxacs-loading">⏳ Chargement…</div></div>');
      _injectSection(main, 'fxacs-artisans',
        '👷 Lifecycle Artisans',
        '<table class="fxacs-table">'
        + '<thead><tr><th>Artisan</th><th>Spécialité</th><th>Ville</th>'
        + '<th>États canoniques</th><th>Complétude</th><th>Note</th><th>Créé</th><th>Compte</th></tr></thead>'
        + '<tbody id="fxacs-artisan-lifecycle-body"><tr><td colspan="8" class="fxacs-loading">⏳ Chargement…</td></tr></tbody>'
        + '</table>');
      _injectSection(main, 'fxacs-requests',
        '📋 Demandes clients',
        '<div id="fxacs-requests-list" class="fxacs-section-body"><div class="fxacs-loading">⏳ Chargement…</div></div>');
      _injectSection(main, 'fxacs-missions',
        '🔧 Mission Control',
        '<div id="fxacs-missions-list" class="fxacs-section-body"><div class="fxacs-loading">⏳ Chargement…</div></div>');
      _injectSection(main, 'fxacs-quotes',
        '💬 Devis',
        '<div id="fxacs-quotes-list" class="fxacs-section-body"><div class="fxacs-loading">⏳ Chargement…</div></div>');
    }

    /* Toast container */
    if (!el('fxacs-toast-wrap')) {
      var tw = document.createElement('div');
      tw.id = 'fxacs-toast-wrap';
      tw.className = 'fxacs-toast-wrap';
      document.body.appendChild(tw);
    }
  }

  function _injectSection(parent, id, title, bodyHtml) {
    if (el(id + '-section')) return;
    var div = document.createElement('div');
    div.id = id + '-section';
    div.className = 'admin-section';
    div.style.display = 'none';
    div.dataset.sectionId = id;
    div.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      + '<h2 style="font-size:1.3rem">' + title + '</h2>'
      + '<button class="btn btn-secondary btn-sm" data-fxacs-action="fxacs-refresh">🔄 Actualiser</button>'
      + '</div>'
      + bodyHtml;
    parent.appendChild(div);
  }

  /* ── PATCH adminSection() ────────────────────────────────── */
  function _patchAdminSection() {
    var original = window.adminSection;
    window.adminSection = function(name) {
      /* Handle canonical sections */
      var canonicalSections = ['fxacs-claims','fxacs-artisans','fxacs-requests','fxacs-missions','fxacs-quotes'];
      if (canonicalSections.indexOf(name) !== -1) {
        /* Hide all admin sections */
        var all = document.querySelectorAll('.admin-section, [id^="admin-section-"]');
        all.forEach(function(s){ s.style.display = 'none'; });
        /* Also hide canonical sections */
        canonicalSections.forEach(function(cs) {
          var sec = el(cs + '-section');
          if (sec) sec.style.display = 'none';
        });
        /* Show requested */
        var target = el(name + '-section');
        if (target) target.style.display = 'block';
        /* Sidebar active state */
        document.querySelectorAll('.sidebar-link').forEach(function(a){ a.classList.remove('active'); });
        var lnk = el('fxacs-sidebar-link-' + name.replace('fxacs-',''));
        if (lnk) lnk.classList.add('active');
        return;
      }
      /* Default: call original */
      if (typeof original === 'function') original.call(this, name);
    };
  }

  /* ── INIT ────────────────────────────────────────────────── */
  function init() {
    /* Only run on admin page */
    if (!document.body || document.body.dataset.dashType !== 'admin') return;

    _injectSections();
    _patchAdminSection();

    /* Global event delegation */
    document.addEventListener('click', _handleAction);

    /* Initial sync */
    _syncAll();

    /* Auto-refresh every 60s */
    setInterval(_syncAll, 60000);

    log('Canonical Sync V1 initialized (' + VERSION + ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.FixeoAdminCanonicalSync = {
    version: VERSION,
    sync:    _syncAll,
    state:   _state
  };

})();
