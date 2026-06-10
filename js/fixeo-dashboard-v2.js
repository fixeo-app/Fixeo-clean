/* ============================================================
   FIXEO — Dashboard Client V2
   js/fixeo-dashboard-v2.js  v2a
   Single renderer. Supabase-only. Mobile-first.
   Zero localStorage business logic. Zero fake data.
   ============================================================ */
(function (window, document) {
  'use strict';

  /* ── VERSION ──────────────────────────────────────────────────── */
  var VERSION = 'v2c';

  /* ── PIPELINE DEFINITION ──────────────────────────────────────── */
  /* Maps a unified key to display config.
     step (-1=cancelled, 0–5=lifecycle position) drives timeline rendering. */
  var PIPELINE = {
    NEW:                            { label: 'Recherche artisan',          badge: 'new',       step: 0, icon: '\uD83D\uDD0D' },
    PROPOSAL_RECEIVED:              { label: 'Proposition re\u00e7ue',     badge: 'proposal',  step: 1, icon: '\uD83D\uDCE9' },
    ACCEPTED:                       { label: 'Devis accept\u00e9',         badge: 'accepted',  step: 2, icon: '\u2705' },
    ARTISAN_ASSIGNED:               { label: 'Artisan assign\u00e9',       badge: 'assigned',  step: 2, icon: '\uD83D\uDC77' },
    IN_PROGRESS:                    { label: 'Intervention en cours',      badge: 'progress',  step: 3, icon: '\u26A1' },
    COMPLETED_WAITING_CONFIRMATION: { label: 'Termin\u00e9e \u2014 \u00e0 confirmer', badge: 'confirm', step: 4, icon: '\u23F3' },
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
    'Agadir', 'Mekn\u00e8s', 'Oujda', 'Kenitra', 'Tetouan',
    'El Jadida', 'B\u00e9ni Mellal', 'Nador', 'Sal\u00e9', 'Khouribga'
  ];

  /* ── STATE ────────────────────────────────────────────────────── */
  var _state = {
    session:       null,
    profile:       null,
    requests:      [],   /* service_requests rows enriched with ._pipeline */
    quotes:        [],   /* quotes rows */
    missions:      [],   /* missions rows */
    artisanMap:    {},   /* id → artisan row */
    section:       'dashboard',
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
          .select('id,full_name,phone_public,photo_url,service_category,rating')
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

  function _renderArtisanChip(artisan) {
    if (!artisan) return '';
    return '<div class="fxv2-artisan-chip">'
      + '<div class="fxv2-artisan-avatar">' + esc(initials(artisan.full_name)) + '</div>'
      + '<div><div class="fxv2-artisan-name">' + esc(artisan.full_name) + '</div>'
      + '<div class="fxv2-artisan-svc">' + esc(artisan.service_category) + '</div></div>'
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
      + '<div class="fxv2-confirm-title">\u2728 L\u2019intervention est termin\u00e9e\u00a0?</div>'
      + '<div class="fxv2-confirm-sub">Confirmez pour cl\u00f4turer la mission et lib\u00e9rer l\u2019artisan.</div>'
      + '<button class="fxv2-btn fxv2-btn-success fxv2-btn-confirm-sticky"'
      + ' data-action="confirm-done" data-id="' + esc(req.id) + '">'
      + '\u2713 Confirmer la fin de l\u2019intervention'
      + '</button>'
      + '</div>';
  }

  function _renderRatingPlaceholder(req) {
    /* Phase 2: rating will write to reviews table.
       Phase 1: UI is visible but action shows "bient\u00f4t disponible" */
    return '<div style="margin-top:10px;padding:12px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;">'
      + '<div style="font-size:.80rem;color:rgba(255,255,255,.45);margin-bottom:4px">Laisser un avis (bient\u00f4t disponible)</div>'
      + '<div class="fxv2-stars" data-req-id="' + esc(req.id) + '">'
      + '\u2605\u2605\u2605\u2605\u2605'.split('').map(function (s, i) {
          return '<span class="fxv2-star" data-action="rate-ph" data-val="' + (i + 1) + '" data-id="' + esc(req.id) + '">' + s + '</span>';
        }).join('')
      + '</div></div>';
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
  function _renderDashboard() {
    var sec = el('fxv2-sec-dashboard');
    if (!sec) return;
    var reqs = _state.requests;

    /* Recent 3 active requests */
    var active = reqs.filter(function (r) { return r._pipeline.step >= 0 && r._pipeline.step < 5; })
                     .slice(0, 3);

    var html = '<div class="fxv2-section-head"><h2>\uD83C\uDFE0 Tableau de bord</h2>'
      + '<button class="fxv2-btn fxv2-btn-primary" data-action="new-request">+ Nouvelle demande</button>'
      + '</div>';

    if (active.length) {
      html += '<div class="fxv2-page-subtitle" style="margin-bottom:14px">Demandes r\u00e9centes</div>';
      html += '<div class="fxv2-card-list">';
      active.forEach(function (r) { html += _renderCard(r); });
      html += '</div>';
      if (reqs.length > 3) {
        html += '<div style="text-align:center;margin-top:16px">'
          + '<button class="fxv2-btn fxv2-btn-ghost" data-action="go-requests">Voir toutes les demandes (' + reqs.length + ')</button>'
          + '</div>';
      }
    } else {
      html += '<div class="fxv2-empty">'
        + '<div class="fxv2-empty-icon">\uD83D\uDD28</div>'
        + '<div class="fxv2-empty-title">Aucune demande active</div>'
        + '<div class="fxv2-empty-sub">Cr\u00e9ez votre premi\u00e8re demande et trouvez un artisan qualifi\u00e9.</div>'
        + '<button class="fxv2-btn fxv2-btn-primary" data-action="new-request">+ Cr\u00e9er une demande</button>'
        + '</div>';
    }
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
    var sec = el('fxv2-sec-messages');
    if (!sec) return;
    sec.innerHTML = '<div class="fxv2-coming-soon">'
      + '<div class="fxv2-coming-icon">\uD83D\uDCAC</div>'
      + '<div class="fxv2-coming-title">Messagerie en pr\u00e9paration</div>'
      + '<div class="fxv2-coming-sub">Vous pourrez bient\u00f4t contacter vos artisans directement depuis l\u2019application. En attendant, utilisez WhatsApp via le bouton sur chaque mission.</div>'
      + '</div>';
  }

  /* ── SECTION: PROFILE ─────────────────────────────────────────── */
  function _renderProfile() {
    var sec = el('fxv2-sec-profile');
    if (!sec) return;
    var p = _state.profile || {};
    var u = (_state.session && _state.session.user) || {};
    var name  = p.full_name  || u.user_metadata && u.user_metadata.full_name || 'Client';
    var email = p.email      || u.email  || '';
    var phone = p.phone      || u.user_metadata && u.user_metadata.phone || '';
    var city  = p.city       || u.user_metadata && u.user_metadata.city  || '';

    sec.innerHTML = '<div class="fxv2-section-head"><h2>\uD83D\uDC64 Mon profil</h2></div>'
      + '<div class="fxv2-profile-card">'
      + '<div class="fxv2-profile-avatar-lg">' + esc(initials(name) || '\uD83D\uDC64') + '</div>'
      + '<div>'
      + '<div class="fxv2-profile-name">' + esc(name) + '</div>'
      + (email ? '<div class="fxv2-profile-email">' + esc(email) + '</div>' : '')
      + (city  ? '<div class="fxv2-profile-city">\uD83D\uDCCD ' + esc(city) + '</div>' : '')
      + '</div></div>'
      + _infoRow('Nom complet', name)
      + _infoRow('Email', email || '—')
      + _infoRow('T\u00e9l\u00e9phone', phone || '—')
      + _infoRow('Ville', city || '—')
      + _infoRow('Total demandes', String(_state.requests.length))
      + _infoRow('Missions termin\u00e9es', String(_state.requests.filter(function (r) { return r._pipeline.step === 5; }).length))
      + '<div class="fxv2-divider"></div>'
      + '<button class="fxv2-btn fxv2-btn-ghost" data-action="logout" style="width:100%;justify-content:center">Se d\u00e9connecter</button>';
  }

  function _infoRow(label, value) {
    return '<div class="fxv2-info-row">'
      + '<span class="fxv2-info-label">' + esc(label) + '</span>'
      + '<span class="fxv2-info-value">' + esc(value) + '</span>'
      + '</div>';
  }

  /* ── SECTION: SUPPORT ─────────────────────────────────────────── */
  function _renderSupport() {
    var sec = el('fxv2-sec-support');
    if (!sec) return;
    sec.innerHTML = '<div class="fxv2-section-head"><h2>\uD83C\uDD98 Support Fixeo</h2></div>'
      + _supportItem('https://wa.me/212600000000', '\uD83D\uDCAC', 'WhatsApp Support', 'R\u00e9ponse rapide 7j/7')
      + _supportItem('mailto:contact@fixeo.ma', '\uD83D\uDCE7', 'Email', 'contact@fixeo.ma')
      + _supportItem('https://fixeo.ma', '\uD83C\uDF10', 'Site web', 'www.fixeo.ma')
      + '<div class="fxv2-error-banner" style="margin-top:16px;border-color:rgba(255,255,255,.12);color:rgba(255,255,255,.5);background:rgba(255,255,255,.04)">'
      + 'Version ' + VERSION + ' \u2014 Fixeo Client Dashboard</div>';
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

  /* ── MASTER RENDER ────────────────────────────────────────────── */
  function _render() {
    _renderKPIs();
    _renderSidebarProfile();
    _renderDashboard();
    _renderRequests();
    _renderMissions();
    _renderHistory();
    _renderMessages();
    _renderProfile();
    _renderSupport();
  }

  /* ── NAVIGATION ───────────────────────────────────────────────── */
  var SECTIONS = ['dashboard', 'requests', 'missions', 'messages', 'history', 'profile', 'support'];

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
      if (a.dataset.section === name) a.classList.add('active');
      else a.classList.remove('active');
    });

    /* Update bottom nav */
    document.querySelectorAll('.fxv2-bottom-btn').forEach(function (b) {
      if (b.dataset.section === name) b.classList.add('active');
      else b.classList.remove('active');
    });

    /* KPI bar: only on dashboard + requests */
    var kpiBar = el('fxv2-kpi-bar');
    if (kpiBar) kpiBar.style.display = (name === 'dashboard' || name === 'requests') ? '' : 'none';

    /* Close mobile sidebar */
    _closeSidebar();
  }

  function _openSidebar() {
    var s = el('fxv2-sidebar');
    var o = el('fxv2-overlay');
    var h = el('fxv2-hamburger');
    if (s) { s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); }
    if (o) o.classList.add('show');
    if (h) { h.classList.add('open'); h.setAttribute('aria-expanded', 'true'); }
    document.body.style.overflow = 'hidden';
  }

  function _closeSidebar() {
    var s = el('fxv2-sidebar');
    var o = el('fxv2-overlay');
    var h = el('fxv2-hamburger');
    if (s) { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }
    if (o) o.classList.remove('show');
    if (h) { h.classList.remove('open'); h.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
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

    /* Sidebar nav links */
    document.querySelectorAll('.fxv2-nav-link').forEach(function (a) {
      a.addEventListener('click', function () {
        _showSection(a.dataset.section);
      });
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
        case 'new-request':    return _openNewRequest();
        case 'go-requests':    return _showSection('requests');
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
    _btnBusy(btn, 'Refus\u2026');
    try {
      var sb = await window.FixeoSupabase.getClient();
      var res = await sb.from('quotes').update({ status: 'rejected' }).eq('id', quoteId);
      if (res.error) throw res.error;
      _toast('Devis refus\u00e9.', 'info');
      await _refresh();
    } catch (e) {
      console.warn('[fxv2] rejectQuote error:', e && e.message);
      _toast('\u274C Erreur lors du refus.', 'error');
      _btnReset(btn, '\u2716 Refuser');
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
      var res = await sb.from('service_requests')
        .update({ status: 'validated' })
        .eq('id', requestId)
        .select('id, status')   /* force a read-back so constraint violations surface as errors */
        .single();

      if (res.error) throw res.error;

      /* Verify the DB actually accepted the update before showing success */
      if (!res.data || res.data.status !== 'validated') {
        throw new Error('La mise \u00e0 jour n\u2019a pas \u00e9t\u00e9 persist\u00e9e. Veuillez r\u00e9essayer.');
      }

      _toast('\u2705 Intervention confirm\u00e9e\u00a0! Merci pour votre confiance.', 'success');
      await _refresh();    /* re-fetch → computePipeline maps 'validated' → COMPLETED → CTA gone */
    } catch (e) {
      console.warn('[fxv2] confirmDone error:', e && e.message);
      _toast('\u274C ' + (e && e.message ? e.message : 'Erreur lors de la confirmation.'), 'error');
      _btnReset(btn, '\u2713 Confirmer la fin de l\u2019intervention');
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

  /* ── NEW REQUEST MODAL ────────────────────────────────────────── */
  function _openNewRequest() {
    var body = '<div class="fxv2-modal-drag-handle"></div>'
      + '<div class="fxv2-modal-title">\uD83D\uDD28 Nouvelle demande</div>'
      + '<form id="fxv2-req-form">'
      + '<div class="fxv2-form-group"><label class="fxv2-label">Service *</label>'
      + '<select class="fxv2-select" name="service_category" required>'
      + '<option value="">Choisir un service</option>'
      + SERVICES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="fxv2-form-group"><label class="fxv2-label">Ville *</label>'
      + '<select class="fxv2-select" name="city" required>'
      + '<option value="">Choisir une ville</option>'
      + CITIES.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="fxv2-form-group"><label class="fxv2-label">Description *</label>'
      + '<textarea class="fxv2-textarea" name="description" placeholder="D\u00e9crivez votre probl\u00e8me ou ce dont vous avez besoin\u2026" required minlength="10" maxlength="500"></textarea></div>'
      + '<button type="submit" class="fxv2-btn fxv2-btn-primary" style="width:100%;justify-content:center">Envoyer la demande</button>'
      + '</form>';
    _openModal(body);

    /* Bind form */
    var form = el('fxv2-req-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var sub = form.querySelector('[type=submit]');
      _btnBusy(sub, 'Envoi\u2026');
      try {
        var data = new FormData(form);
        await window.FixeoSupabase.submitServiceRequest({
          service_category: data.get('service_category'),
          city:             data.get('city'),
          description:      data.get('description')
        });
        _closeModal();
        _toast('\u2705 Demande envoy\u00e9e\u00a0! Nous cherchons un artisan disponible.', 'success');
        await _refresh();
      } catch (err) {
        console.warn('[fxv2] submitServiceRequest error:', err && err.message);
        _toast('\u274C ' + (err && err.message ? err.message : 'Erreur lors de l\u2019envoi.'), 'error');
        _btnReset(sub, 'Envoyer la demande');
      }
    });
  }

  /* ── MODAL ────────────────────────────────────────────────────── */
  function _openModal(html) {
    var overlay = el('fxv2-modal-overlay');
    var body    = el('fxv2-modal-body');
    if (!overlay || !body) return;
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function _closeModal() {
    var overlay = el('fxv2-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
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
      _bindNav();
      _bindActions();
      _showSection('dashboard');

      /* Fetch data */
      await _fetch();

      /* Render */
      _render();

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

})(window, document);
