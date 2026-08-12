/* ============================================================
   FIXEO — Artisan Dispatch Bridge v1
   js/fixeo-artisan-dispatch-v1.js   v1a-offers

   Phase 7C.11E.1 — connect existing artisan dashboard to real
   mission offer lifecycle via canonical server RPCs.

   ARCHITECTURE:
     - Extends window.FixeoArtisanDashboard (set by fixeo-artisan-dashboard-v2.js)
     - Adds: get_my_mission_offers() → rendered in #fxav2-sec-available
     - Adds: claim_mission()         → replaces legacy _doAcceptMission
     - Adds: get_accepted_mission_detail() → post-acceptance contact unlock
     - Preserves: ALL existing pending/in_progress/done/validated mission rendering
     - Preserves: ALL existing v2/v3 dashboard navigation, UX, auth, KPIs

   SECURITY CONTRACT:
     - Uses authenticated Supabase client only (auth.uid() server-side)
     - NEVER passes artisan identity to server (RPC resolves via owner_user_id)
     - NEVER reads description / client_phone before acceptance
     - NEVER writes missions directly from browser
     - NEVER writes service_requests directly from browser
     - SERVICE_ROLE key: server-only (Vercel functions), never browser

   CANONICAL OFFER FIELDS (pre-acceptance whitelist):
     mission_id, request_id, mission_status, offered_at,
     service_category, city, urgency, request_created_at

   DO NOT ADD:
     - Realtime subscriptions (7C.11G)
     - Automatic dispatch / matching (7C.11F)
     - Synthetic/fake missions
     - Phase-locked fields (client_phone until accepted, description until accepted)

   TRUTHFULNESS CONTRACT:
     - "Offre reçue"  only when mission_status = 'offered'
     - "Mission acceptée" only after claim_mission() ok:true
     - client_phone shown only after get_accepted_mission_detail() returns it non-null
     - description shown only after get_accepted_mission_detail() returns it
   ============================================================ */

(function (window, document) {
  'use strict';

  /* ── CONSTANTS ─────────────────────────────────────────────── */
  var VERSION = 'fxdispatch-v1a-offers';

  /* Urgency label map — factual, no marketing */
  var URGENCY_LABELS = {
    'now':       '🔴 Urgent',
    'urgent':    '🟡 Prioritaire',
    'normale':   '',
    'normal':    '',
    '':          ''
  };

  /* Business error reasons from claim_mission() RPC */
  var CLAIM_ERRORS = {
    'unauthenticated':    'Vous devez être connecté pour accepter une offre.',
    'artisan_not_found':  'Votre compte artisan n\'est pas reconnu. Contactez le support.',
    'mission_not_found':  'Cette offre n\'existe plus.',
    'already_claimed':    'Cette offre a déjà été acceptée.',
    'not_offered':        'Cette offre n\'est plus disponible.',
    'not_offered_to_you': 'Cette offre ne vous est pas adressée.'
  };

  /* Business error reasons for lifecycle RPCs */
  var LIFECYCLE_ERRORS = {
    'unauthenticated':     'Vous devez être connecté.',
    'artisan_not_found':   'Votre compte artisan n'est pas reconnu.',
    'mission_not_found':   'Cette mission est introuvable.',
    'not_your_mission':    'Cette mission ne vous appartient pas.',
    'not_offered':         'Cette offre n'est plus disponible.',
    'not_accepted':        'La mission doit être acceptée avant de démarrer.',
    'already_started':     'L'intervention est déjà démarrée.',
    'not_started':         'L'intervention doit être démarrée avant d'être terminée.',
    'already_completed':   'Cette intervention a déjà été marquée terminée.',
    'invalid_request_state': 'Statut inattendu. Actualisez et réessayez.',
    'request_not_dispatchable': 'La demande n'est plus disponible.',
    'internal_error':      'Erreur interne. Contactez le support.'
  };

  /* ── STATE ─────────────────────────────────────────────────── */
  var _d = {
    offers:          [],    /* from get_my_mission_offers() */
    offersLoaded:    false,
    offersError:     null,
    offersLoading:   false,

    /* mission_id → accepted detail (populated post-claim) */
    acceptedDetails: {},

    /* in-flight guard: mission_id → true while claim is pending */
    claimInFlight:   {}
  };

  /* ── DOM HELPERS ───────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = Date.now();
    var diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60)   return 'À l\'instant';
    if (diff < 3600) return Math.floor(diff / 60) + ' min';
    if (diff < 86400) {
      var h = Math.floor(diff / 3600);
      return h + ' h' + (h > 1 ? '' : '');
    }
    var days = Math.floor(diff / 86400);
    return days + ' j';
  }

  /* ── SUPABASE CLIENT ACCESSOR ──────────────────────────────── */
  async function _getSB() {
    var FS = window.FixeoSupabase;
    if (!FS) throw new Error('FixeoSupabase non disponible');
    return FS.getClient();
  }

  /* ── TOAST (reuses v2 if available) ───────────────────────── */
  function _toast(msg, type) {
    /* Try to use v2 toast mechanism */
    var wrap = el('fxav2-toast-wrap');
    if (!wrap) return;
    var div = document.createElement('div');
    div.className = 'fxa-toast fxa-toast-' + (type || 'info');
    div.setAttribute('role', 'status');
    div.textContent = msg;
    wrap.appendChild(div);
    setTimeout(function() { div.classList.add('fxa-toast-show'); }, 10);
    setTimeout(function() {
      div.classList.remove('fxa-toast-show');
      setTimeout(function() { if (div.parentNode) div.parentNode.removeChild(div); }, 300);
    }, 4000);
  }

  /* ── MODAL (reuses v2 overlay) ─────────────────────────────── */
  function _openModal(html) {
    var overlay = el('fxav2-modal-overlay');
    var body    = el('fxav2-modal-body');
    if (!overlay || !body) return;
    body.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    /* close button wired by v2 — compatible */
  }
  function _closeModal() {
    var overlay = el('fxav2-modal-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  /* ── KPI BADGE UPDATE ──────────────────────────────────────── */
  function _updateOfferKPI() {
    var kpiEl = el('fxav2-kpi-available');
    if (kpiEl) {
      var count = _d.offers.filter(function(o) { return o.mission_status === 'offered'; }).length;
      kpiEl.textContent = count;
      kpiEl.classList.remove('loading');
    }
  }

  /* ══════════════════════════════════════════════════════════════
   * LOAD OFFERS — calls get_my_mission_offers()
   * Returns only the canonical safe whitelist fields.
   * No description, no client_phone, no client identity.
   * ══════════════════════════════════════════════════════════════ */
  async function _loadOffers() {
    if (_d.offersLoading) return;
    _d.offersLoading = true;
    _d.offersError   = null;
    _renderAvailableSection();

    try {
      var sb = await _getSB();
      var result = await sb.rpc('get_my_mission_offers');
      if (result.error) throw result.error;

      /* Filter to 'offered' status only — other statuses handled by myMissions */
      var raw = Array.isArray(result.data) ? result.data : [];
      _d.offers = raw.filter(function(o) {
        return o && o.mission_status === 'offered';
      });
      _d.offersLoaded = true;
    } catch (e) {
      console.warn('[fxdispatch] get_my_mission_offers error:', e && e.message);
      _d.offersError = 'Impossible de charger les offres. Réessayer.';
      _d.offers      = [];
    }
    _d.offersLoading = false;
    _renderAvailableSection();
    _updateOfferKPI();
  }

  /* ══════════════════════════════════════════════════════════════
   * OFFER CARD — renders only pre-acceptance safe fields
   *
   * Fields shown: service_category, city, urgency, offered_at
   * Fields NEVER shown pre-acceptance: description, client_phone
   * ══════════════════════════════════════════════════════════════ */
  function _renderOfferCard(offer) {
    var missionId  = esc(offer.mission_id || '');
    var service    = esc(offer.service_category || 'Service');
    var city       = offer.city ? esc(offer.city) : '';
    var urgency    = String(offer.urgency || '').toLowerCase().trim();
    var urgLabel   = URGENCY_LABELS[urgency] || '';
    var receivedAt = timeAgo(offer.offered_at || offer.request_created_at || '');
    var isUrgent   = urgency === 'now';

    return '<div class="fxa-card fxad-offer-card' + (isUrgent ? ' fxad-offer-urgent' : '') + '" '
      + 'data-mission-id="' + missionId + '">'

      /* ── Header: service + offer badge ── */
      + '<div class="fxa-card-head">'
      + '<span class="fxa-card-service">' + service + '</span>'
      + (urgLabel
          ? '<span class="fxa-badge fxad-badge-urgency">' + urgLabel + '</span>'
          : '<span class="fxa-badge fxa-badge-new">Nouvelle offre</span>'
        )
      + '</div>'

      /* ── Meta: city + received time ── */
      + '<div class="fxa-card-meta">'
      + (city ? '<span class="fxa-card-meta-item">📍 ' + city + '</span>' : '')
      + (receivedAt ? '<span class="fxa-card-meta-item">🕐 ' + esc(receivedAt) + '</span>' : '')
      + '</div>'

      /* ── Privacy notice — no pre-acceptance data ── */
      + '<div class="fxad-offer-privacy">'
      + '<span class="fxad-offer-privacy-icon">🔒</span>'
      + '<span>Coordonnées et détails accessibles après acceptation</span>'
      + '</div>'

      /* ── Primary CTA: Accepter ── */
      + '<div class="fxa-actions">'
      + '<button class="fxa-btn fxa-btn-primary fxad-accept-btn" '
      + 'data-action="dispatch-accept" '
      + 'data-mission-id="' + missionId + '" '
      + 'aria-label="Accepter l\'offre ' + service + (city ? ' à ' + city : '') + '">'
      + '✅ Accepter'
      + '</button>'
      + '<button class="fxa-btn fxa-btn-ghost fxad-decline-btn" '
      + 'data-action="dispatch-decline" '
      + 'data-mission-id="' + missionId + '" '
      + 'aria-label="Décliner cette offre">'
      + 'Décliner'
      + '</button>'
      + '</div>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════
   * RENDER: AVAILABLE SECTION
   * Replaces the legacy open-requests section with mission offers.
   * ══════════════════════════════════════════════════════════════ */
  function _renderAvailableSection() {
    var sec = el('fxav2-sec-available');
    if (!sec) return;

    var count = _d.offers.length;

    var html = '<div class="fxa-section-head">'
      + '<h2>📬 Nouvelles offres</h2>'
      + '<span class="fxa-section-count">' + count + '</span>'
      + '</div>';

    /* ── Loading state ── */
    if (_d.offersLoading) {
      html += '<div class="fxad-loading">'
        + '<div class="fxad-loading-spinner" aria-hidden="true">⏳</div>'
        + '<div class="fxad-loading-text">Chargement des demandes…</div>'
        + '</div>';
      sec.innerHTML = html;
      return;
    }

    /* ── Error state — with retry ── */
    if (_d.offersError) {
      html += '<div class="fxad-error-state">'
        + '<div class="fxad-error-icon">⚠️</div>'
        + '<div class="fxad-error-msg">' + esc(_d.offersError) + '</div>'
        + '<button class="fxa-btn fxa-btn-ghost fxad-retry-btn" data-action="dispatch-reload-offers">'
        + '🔄 Réessayer'
        + '</button>'
        + '</div>';
      sec.innerHTML = html;
      return;
    }

    /* ── Empty state ── */
    if (!count) {
      html += '<div class="fxa-empty">'
        + '<div class="fxa-empty-icon">📬</div>'
        + '<div class="fxa-empty-title">Aucune nouvelle demande</div>'
        + '<div class="fxa-empty-sub">Vous serez notifié dès qu\'une demande vous est attribuée.</div>'
        + '<button class="fxa-btn fxa-btn-ghost fxad-retry-btn" '
        + 'style="margin-top:12px" data-action="dispatch-reload-offers">'
        + '🔄 Actualiser'
        + '</button>'
        + '</div>';
      sec.innerHTML = html;
      return;
    }

    /* ── Offer cards ── */
    html += '<div class="fxa-card-list">'
      + _d.offers.map(_renderOfferCard).join('')
      + '</div>';

    sec.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════
   * ACCEPT FLOW — calls claim_mission(p_mission_id)
   *
   * SECURITY:
   *   - ONLY p_mission_id passed — server resolves artisan via auth.uid()
   *   - No artisan_id, artisan_profile_id, client_id from browser
   *   - No direct INSERT into missions
   *   - No direct UPDATE of service_requests
   *   - Double-submit: in-flight guard per mission_id
   * ══════════════════════════════════════════════════════════════ */
  async function _doDispatchAccept(missionId, btn) {
    if (!missionId) return;

    /* In-flight guard */
    if (_d.claimInFlight[missionId]) return;
    _d.claimInFlight[missionId] = true;

    /* Disable CTA with explicit loading label — no orphaned disabled button */
    if (btn) {
      btn.disabled  = true;
      btn.textContent = '⏳ Acceptation…';
      btn.setAttribute('aria-busy', 'true');
    }

    try {
      var sb = await _getSB();

      /* ── call claim_mission(p_mission_id) — canonical RPC ── */
      var result = await sb.rpc('claim_mission', { p_mission_id: missionId });

      /* RPC may return error object or data with ok:false */
      var err = result.error;
      var data = result.data;

      if (err) {
        /* Check for known business reasons in error message */
        var reason = String(err.message || err.code || '').toLowerCase();
        var msg = null;
        for (var key in CLAIM_ERRORS) {
          if (reason.indexOf(key) !== -1) { msg = CLAIM_ERRORS[key]; break; }
        }
        throw new Error(msg || ('Erreur lors de l\'acceptation : ' + (err.message || err.code || 'inconnue')));
      }

      /* RPC may return {ok: false, reason: '...'} */
      if (data && data.ok === false) {
        var bizReason = data.reason || '';
        throw new Error(CLAIM_ERRORS[bizReason] || ('Offre indisponible : ' + esc(bizReason)));
      }

      /* ── Success: remove from offers list ── */
      _d.offers = _d.offers.filter(function(o) { return o.mission_id !== missionId; });

      /* ── Load accepted detail immediately ── */
      _toast('✅ Offre acceptée. Chargement de la mission…', 'success');
      _renderAvailableSection();
      _updateOfferKPI();

      /* Load detail and show in modal */
      await _loadAndShowAcceptedDetail(missionId, sb);

    } catch (e) {
      console.warn('[fxdispatch] claim_mission error:', missionId, e && e.message);
      _toast('❌ ' + (e && e.message || 'Impossible d\'accepter cette offre.'), 'error');

      /* Restore CTA — retry is possible */
      if (btn) {
        btn.disabled    = false;
        btn.textContent = '✅ Accepter';
        btn.removeAttribute('aria-busy');
      }
    }

    delete _d.claimInFlight[missionId];
  }

  /* ══════════════════════════════════════════════════════════════
   * LOAD ACCEPTED MISSION DETAIL
   * Calls get_accepted_mission_detail(p_mission_id).
   * client_phone and description are ONLY available here.
   * Shows result in modal overlay.
   * ══════════════════════════════════════════════════════════════ */
  async function _loadAndShowAcceptedDetail(missionId, sbOverride) {
    try {
      var sb = sbOverride || await _getSB();
      var res = await sb.rpc('get_accepted_mission_detail', { p_mission_id: missionId });

      if (res.error) throw res.error;
      var d = res.data;
      if (!d || !d.ok) {
        _toast('Mission acceptée. Détails bientôt disponibles.', 'info');
        return;
      }

      /* Cache detail */
      _d.acceptedDetails[missionId] = d;

      /* Show mission detail modal */
      _openModal(_renderAcceptedDetailModal(d));

      /* Trigger v2 refresh so mission appears in "Mes missions" */
      _triggerV2Refresh();

    } catch (e) {
      console.warn('[fxdispatch] get_accepted_mission_detail error:', e && e.message);
      /* Non-fatal: mission was accepted — detail will load on next dashboard refresh */
      _toast('Mission acceptée. Actualisez le tableau de bord pour voir les détails.', 'info');
      _triggerV2Refresh();
    }
  }

  /* ══════════════════════════════════════════════════════════════
   * ACCEPTED MISSION DETAIL MODAL
   * Shows post-acceptance data: description + client_phone.
   * client_phone shown ONLY if non-null.
   * ══════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════
   * LIFECYCLE CTA — factual, driven by mission_status + request_status
   *
   * ARTISAN AUTHORITY:
   *   offered  → Accept / Decline (handled in offer card)
   *   pending + assigned   → Démarrer l'intervention
   *   pending + in_progress → Marquer terminée
   *   done / completed     → (no CTA — await client validation)
   *   validated            → (no CTA — complete)
   *
   * NEVER shows Validate button — that is client/admin only.
   * ══════════════════════════════════════════════════════════════ */
  function _renderLifecycleCTA(d) {
    var mId     = esc(d.mission_id || '');
    var mSt     = String(d.mission_status  || '').toLowerCase().trim();
    var rSt     = String(d.request_status  || '').toLowerCase().trim();

    /* ACCEPTED + not yet started */
    if (mSt === 'pending' && (rSt === 'assigned' || rSt === 'new')) {
      return '<button class="fxa-btn fxa-btn-primary fxad-lifecycle-btn" '
        + 'data-action="dispatch-start" '
        + 'data-mission-id="' + mId + '" '
        + 'aria-label="Démarrer l\'intervention">'
        + '▶ Démarrer l\'intervention'
        + '</button>';
    }

    /* IN PROGRESS */
    if (mSt === 'pending' && rSt === 'in_progress') {
      return '<div class="fxad-status-banner fxad-status-progress">⚡ Intervention en cours</div>'
        + '<button class="fxa-btn fxa-btn-success fxad-lifecycle-btn" '
        + 'data-action="dispatch-complete" '
        + 'data-mission-id="' + mId + '" '
        + 'aria-label="Marquer l\'intervention terminée">'
        + '✓ Marquer l\'intervention terminée'
        + '</button>';
    }

    /* DONE — awaiting client validation */
    if (mSt === 'done' || rSt === 'completed') {
      return '<div class="fxad-status-banner fxad-status-done">'
        + '✅ Intervention terminée — en attente de validation client</div>';
    }

    /* VALIDATED */
    if (mSt === 'validated' || rSt === 'validated') {
      return '<div class="fxad-status-banner fxad-status-validated">'
        + '🏅 Mission validée</div>';
    }

    return ''; /* no CTA for other states */
  }


  function _renderAcceptedDetailModal(d) {
    var service  = esc(d.service_category || 'Service');
    var city     = d.city ? esc(d.city) : '';
    var urgency  = String(d.urgency || '').toLowerCase().trim();
    var urgLabel = URGENCY_LABELS[urgency] || '';
    var desc     = d.description ? esc(d.description) : null;
    var phone    = d.client_phone ? String(d.client_phone).trim() : null;
    var phoneForWA = phone ? phone.replace(/\s/g, '').replace(/^\+/, '') : null;

    var html = '<div class="fxad-detail-modal">'

      /* Header */
      + '<div class="fxad-detail-header">'
      + '<div class="fxad-detail-badge">✅ Mission acceptée</div>'
      + '<div class="fxad-detail-service">' + service + '</div>'
      + (city ? '<div class="fxad-detail-city">📍 ' + city + '</div>' : '')
      + (urgLabel ? '<div class="fxad-detail-urgency">' + urgLabel + '</div>' : '')
      + '</div>'

      /* Description — unlocked post-acceptance */
      + '<div class="fxad-detail-section">'
      + '<div class="fxad-detail-label">Problème signalé</div>'
      + (desc
          ? '<div class="fxad-detail-desc">' + desc + '</div>'
          : '<div class="fxad-detail-muted">Aucune description fournie.</div>'
        )
      + '</div>'

      /* Contact — unlocked post-acceptance */
      + '<div class="fxad-detail-section">'
      + '<div class="fxad-detail-label">Contact client</div>'
      + (phone
          ? '<div class="fxad-detail-phone">'
            + '<a href="tel:' + esc(phone) + '" class="fxad-contact-btn fxad-contact-call" '
            + 'aria-label="Appeler le client">'
            + '📞 ' + esc(phone)
            + '</a>'
            + (phoneForWA
                ? '<a href="https://wa.me/' + esc(phoneForWA) + '?text=' + encodeURIComponent('Bonjour, je suis votre artisan Fixeo pour la demande de ' + (d.service_category || 'service') + '.') + '" '
                  + 'class="fxad-contact-btn fxad-contact-wa" target="_blank" rel="noopener noreferrer" '
                  + 'aria-label="Contacter le client sur WhatsApp">'
                  + '💬 WhatsApp'
                  + '</a>'
                : ''
              )
            + '</div>'
          : '<div class="fxad-detail-muted">Coordonnées client non disponibles.</div>'
        )
      + '</div>'

      /* ── Lifecycle CTAs — driven by request_status + mission_status ── */
      + '<div class="fxad-lifecycle-actions">'
      + _renderLifecycleCTA(d)
      + '</div>'

      /* Close */
      + '<div class="fxad-detail-actions">'
      + '<button class="fxa-btn fxa-btn-ghost fxad-modal-close-btn" '
      + 'onclick="document.getElementById(\'fxav2-modal-close\') && document.getElementById(\'fxav2-modal-close\').click()">'
      + 'Voir mes missions →'
      + '</button>'
      + '</div>'
      + '</div>';

    return html;
  }

  /* ── TRIGGER V2 DASHBOARD REFRESH ──────────────────────────── */
  function _triggerV2Refresh() {
    /* Call the existing v2 refresh if accessible */
    if (window.FixeoArtisanDashboard && typeof window.FixeoArtisanDashboard.refresh === 'function') {
      window.FixeoArtisanDashboard.refresh().catch(function() {});
    }
  }

  /* ══════════════════════════════════════════════════════════════
   * DASHBOARD SECTION OVERRIDE
   * Intercepts navigation to 'available' section.
   * When 'available' is shown: load offers (if not already loaded).
   * ══════════════════════════════════════════════════════════════ */
  function _patchSectionNavigation() {
    /* Listen for clicks on nav links targeting 'available' */
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-section="available"]');
      if (!btn) return;
      /* Let v2 handle section switching, then load offers */
      setTimeout(function() {
        if (!_d.offersLoaded && !_d.offersLoading) {
          _loadOffers();
        } else if (_d.offersLoaded) {
          _renderAvailableSection();
        }
      }, 0);
    }, true); /* capture: runs before v2 listener */
  }

  /* ══════════════════════════════════════════════════════════════
   * LIFECYCLE HELPER — resolve error reason to French message
   * ══════════════════════════════════════════════════════════════ */
  function _lifecycleErr(err, data) {
    /* Check data.reason first (structured) then err.message/code */
    var reason = (data && data.reason) ? String(data.reason) :
                 String((err && (err.message || err.code)) || '').toLowerCase();
    for (var key in LIFECYCLE_ERRORS) {
      if (reason.indexOf(key) !== -1) return LIFECYCLE_ERRORS[key];
    }
    return 'Erreur inattendue. Réessayer.';
  }

  /* ── DISABLE / RESTORE BUTTON HELPERS ── */
  function _btnBusy(btn, label) {
    if (!btn) return;
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = label || '⏳…';
    btn.setAttribute('aria-busy', 'true');
  }
  function _btnRestore(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn._origText || btn.textContent;
    btn.removeAttribute('aria-busy');
  }

  /* ══════════════════════════════════════════════════════════════
   * DECLINE FLOW — calls decline_mission(p_mission_id)
   *
   * Transitions: offered → declined
   * service_request stays 'new' (re-dispatch by server later)
   * ══════════════════════════════════════════════════════════════ */
  async function _doDispatchDecline(missionId, btn) {
    if (!missionId) return;
    if (_d.claimInFlight[missionId]) return;
    _d.claimInFlight[missionId] = true;

    _btnBusy(btn, '⏳ Déclin…');

    try {
      var sb = await _getSB();
      var result = await sb.rpc('decline_mission', { p_mission_id: missionId });

      if (result.error) throw { _err: result.error, _data: null };
      var data = result.data;
      if (data && data.ok === false) throw { _err: null, _data: data };

      /* Success: remove from visible offer list */
      _d.offers = _d.offers.filter(function(o) { return o.mission_id !== missionId; });
      _d.offersLoaded = true;
      _renderAvailableSection();
      _updateOfferKPI();
      _toast('Offre déclinée.', 'info');

    } catch (e) {
      var msg = (e && e._err !== undefined)
        ? _lifecycleErr(e._err, e._data)
        : _lifecycleErr(e, null);
      _toast('❌ ' + msg, 'error');
      _btnRestore(btn);
    }

    delete _d.claimInFlight[missionId];
  }

  /* ══════════════════════════════════════════════════════════════
   * START FLOW — calls start_mission(p_mission_id)
   *
   * Transitions: service_request assigned → in_progress
   * mission.status stays 'pending' (no missions.in_progress)
   * ══════════════════════════════════════════════════════════════ */
  async function _doDispatchStart(missionId, btn) {
    if (!missionId) return;
    var key = 'start:' + missionId;
    if (_d.claimInFlight[key]) return;
    _d.claimInFlight[key] = true;

    _btnBusy(btn, '⏳ Démarrage…');

    try {
      var sb = await _getSB();
      var result = await sb.rpc('start_mission', { p_mission_id: missionId });

      if (result.error) throw { _err: result.error, _data: null };
      var data = result.data;
      if (data && data.ok === false) throw { _err: null, _data: data };

      _toast('▶ Intervention démarrée !', 'success');

      /* Refresh detail to get updated request_status */
      delete _d.acceptedDetails[missionId];
      await _loadAndShowAcceptedDetail(missionId);
      _triggerV2Refresh();

    } catch (e) {
      var msg = (e && e._err !== undefined)
        ? _lifecycleErr(e._err, e._data)
        : _lifecycleErr(e, null);
      _toast('❌ ' + msg, 'error');
      _btnRestore(btn);
    }

    delete _d.claimInFlight[key];
  }

  /* ══════════════════════════════════════════════════════════════
   * COMPLETE FLOW — calls complete_mission(p_mission_id)
   *
   * Transitions: mission pending→done, request in_progress→completed
   * Artisan CANNOT set validated — that is client/admin authority.
   * ══════════════════════════════════════════════════════════════ */
  async function _doDispatchComplete(missionId, btn) {
    if (!missionId) return;
    var key = 'complete:' + missionId;
    if (_d.claimInFlight[key]) return;
    _d.claimInFlight[key] = true;

    _btnBusy(btn, '⏳ Finalisation…');

    try {
      var sb = await _getSB();
      var result = await sb.rpc('complete_mission', { p_mission_id: missionId });

      if (result.error) throw { _err: result.error, _data: null };
      var data = result.data;
      if (data && data.ok === false) throw { _err: null, _data: data };

      _toast('✅ Intervention marquée terminée !', 'success');

      /* Refresh detail — mission now 'done', request 'completed' */
      delete _d.acceptedDetails[missionId];
      await _loadAndShowAcceptedDetail(missionId);
      _triggerV2Refresh();

    } catch (e) {
      var msg = (e && e._err !== undefined)
        ? _lifecycleErr(e._err, e._data)
        : _lifecycleErr(e, null);
      _toast('❌ ' + msg, 'error');
      _btnRestore(btn);
    }

    delete _d.claimInFlight[key];
  }


  /* ══════════════════════════════════════════════════════════════
   * ACTION DELEGATION — dispatched from the section
   * Handles data-action="dispatch-accept" and "dispatch-reload-offers"
   * ══════════════════════════════════════════════════════════════ */
  function _bindDispatchActions() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action     = btn.dataset.action;
      var missionId  = btn.dataset.missionId || '';

      if (action === 'dispatch-accept') {
        e.stopPropagation();
        _doDispatchAccept(missionId, btn);
      } else if (action === 'dispatch-decline') {
        e.stopPropagation();
        _doDispatchDecline(missionId, btn);
      } else if (action === 'dispatch-start') {
        e.stopPropagation();
        _doDispatchStart(missionId, btn);
      } else if (action === 'dispatch-complete') {
        e.stopPropagation();
        _doDispatchComplete(missionId, btn);
      } else if (action === 'dispatch-reload-offers') {
        e.stopPropagation();
        _loadOffers();
      } else if (action === 'dispatch-show-detail') {
        e.stopPropagation();
        var cached = _d.acceptedDetails[missionId];
        if (cached) { _openModal(_renderAcceptedDetailModal(cached)); }
        else { _loadAndShowAcceptedDetail(missionId); }
      }
    }, false);
  }

  /* ══════════════════════════════════════════════════════════════
   * OVERRIDE: KPI for 'available' section
   * v2 sets kpi-available to openRequests.length (legacy).
   * We override it with mission offers count once loaded.
   * ══════════════════════════════════════════════════════════════ */
  function _overrideKPIAvailable() {
    /* Wait for v2 KPI render, then update our count */
    var orig = el('fxav2-kpi-available');
    if (orig && _d.offersLoaded) {
      var count = _d.offers.length;
      orig.textContent = count;
      orig.classList.remove('loading');
    }
  }

  /* ── INIT ──────────────────────────────────────────────────── */
  function _init() {
    /* Wait for v2 to complete auth + first render */
    var attempts = 0;
    function _tryBind() {
      attempts++;
      var FS = window.FixeoSupabase;
      var v2 = window.FixeoArtisanDashboard;

      /* Need auth to be ready; v2 doesn't need to expose refresh — we rely on event */
      if (!FS || attempts > 40) {
        if (attempts > 40) console.warn('[fxdispatch] init timeout — FixeoSupabase not ready');
        return;
      }

      /* Check auth is ready */
      FS.getSession().then(function(session) {
        if (!session || !session.user) return; /* Not authed — v2 handles login gate */

        /* Bind action delegation */
        _bindDispatchActions();

        /* Intercept available section nav */
        _patchSectionNavigation();

        /* Load offers immediately (will render when available section shown) */
        _loadOffers();

        /* Override KPI after v2 has rendered */
        setTimeout(_overrideKPIAvailable, 1500);

        /* Expose public API */
        window.FixeoArtisanDispatch = {
          version:        VERSION,
          loadOffers:     _loadOffers,
          getOffers:      function() { return _d.offers.slice(); },
          getDetail:      function(mid) { return _d.acceptedDetails[mid] || null; },
          renderOffers:   _renderAvailableSection,
          refreshAll:     function() { return Promise.all([_loadOffers(), _triggerV2Refresh()]); }
        };

      }).catch(function(e) {
        console.warn('[fxdispatch] auth check failed:', e && e.message);
      });
    }

    /* Poll until FixeoSupabase is available (v2 loads it) */
    var poll = setInterval(function() {
      if (window.FixeoSupabase) {
        clearInterval(poll);
        _tryBind();
      }
    }, 200);
    /* Also try immediately */
    if (window.FixeoSupabase) { clearInterval(poll); _tryBind(); }
  }

  /* ── BOOT ──────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    /* DOM already ready — v2 may still be initializing; brief defer */
    setTimeout(_init, 100);
  }

})(window, document);
