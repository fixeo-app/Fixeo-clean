/* ============================================================
   FIXEO — ARTISAN DASHBOARD PHASE 4 — REAL REQUEST INBOX
   js/artisan-dashboard-p4.js

   Connects fixeo_client_requests to the artisan dashboard.
   - Reads real requests from localStorage key fixeo_client_requests
   - Matches by artisan city + métier (CATEGORY_KEYWORDS)
   - Respects fixeo_avail_status (hides CTAs if 'off')
   - Accept: persists status:'acceptée' + artisan assignment
   - Ignore: persists ignored_by_artisans array (never deletes)
   - WhatsApp CTA: only when phone field is non-empty
   - Dispatches fixeo:client-request-updated + fixeo:missions:updated
   - Renders mini-inbox in overview + full inbox in #section-requests
   - Additive only — zero changes to existing stores or auth

   Guard: window._fxAdP4Loaded (idempotent)
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAdP4Loaded) return;
  window._fxAdP4Loaded = true;

  /* ── Constants ───────────────────────────────────────── */
  var REQUESTS_KEY = 'fixeo_client_requests';
  var IGNORED_KEY  = 'fixeo_ignored_requests';
  var MAX_OVERVIEW_ITEMS = 3;

  /* ── Category keywords (P4-local, covers all 13 categories) */
  var P4_KEYWORDS = {
    plomberie:     ['plomberie','plombier','fuite','eau','robinet','wc','canalisation','chauffe eau','chauffe-eau','sanitaire'],
    electricite:   ['electricite','\u00e9lectricit\u00e9','electricien','\u00e9lectricien','prise','panne','court circuit','court-circuit','tableau','lumiere','lumi\u00e8re'],
    peinture:      ['peinture','peintre','mur','facade','fa\u00e7ade','enduit'],
    nettoyage:     ['nettoyage','menage','m\u00e9nage','nettoyer','proprete','propret\u00e9','desinfection','d\u00e9sinfection'],
    jardinage:     ['jardinage','jardinier','pelouse','haie','arrosage','jardin'],
    demenagement:  ['demenagement','d\u00e9m\u00e9nagement','demenager','d\u00e9m\u00e9nager','transport','carton','meuble'],
    bricolage:     ['bricolage','bricoleur','montage','reparation','r\u00e9paration','fixation','petits travaux'],
    climatisation: ['climatisation','clim','climatiseur','froid','ventilation'],
    menuiserie:    ['menuiserie','menuisier','bois','porte','placard','meuble sur mesure'],
    maconnerie:    ['maconnerie','ma\u00e7onnerie','macon','ma\u00e7on','beton','b\u00e9ton','mur'],
    serrurerie:    ['serrurerie','serrurier','serrure','porte bloquee','porte bloqu\u00e9e','cle','cl\u00e9'],
    carrelage:     ['carrelage','carreleur','faience','fa\u00efence','pose carrelage','joint','carreau'],
    toiture:       ['toiture','toitur','toit','couverture','tuile','ardoise','zinguerie','charpente','gouttiere','goutti\u00e8re']
  };

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function ls(k,fb) { try { return localStorage.getItem(k) || fb; } catch(e){ return fb; } }
  function lsSet(k,v) { try { localStorage.setItem(k,v); } catch(e){} }
  function esc(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function normalizeText(s) {
    return String(s||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ').trim();
  }

  function dispatch(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail||{} })); } catch(e){}
  }

  function relativeTime(isoStr) {
    var ms = Date.now() - (Date.parse(isoStr||'')||0);
    var s = ms / 1000;
    if (s < 60)   return 'Il y a quelques secondes';
    if (s < 3600) return 'Il y a ' + Math.round(s/60) + ' min';
    if (s < 86400) return 'Il y a ' + Math.round(s/3600) + ' h';
    return 'Il y a ' + Math.round(s/86400) + ' j';
  }

  /* ── Read artisan profile ────────────────────────────── */
  function getArtisan() {
    return {
      name: ls('user_name', ls('fixeo_user_name', '')),
      id:   ls('user_id', ls('fixeo_user_id', '')),
      city: ls('user_city', ''),
      job:  ls('user_job',  ''),
      avail: ls('fixeo_avail_status', 'now')
    };
  }

  /* ── Read + write requests (safe, no store dependency) ─ */
  function readRequests() {
    try {
      var parsed = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
  }

  function writeRequests(list) {
    lsSet(REQUESTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  function readIgnored() {
    try {
      var parsed = JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
  }

  function writeIgnored(arr) {
    lsSet(IGNORED_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
  }

  /* ── Matching ────────────────────────────────────────── */
  function isAvailableStatus(status) {
    var n = normalizeText(status || 'nouvelle');
    return !n || n === 'nouvelle' || n === 'disponible';
  }

  function matchesJob(req, job) {
    var haystack = normalizeText((req.service||'') + ' ' + (req.description||''));
    if (!haystack) return false;
    var nJob = normalizeText(job);

    // Direct name match
    if (nJob && haystack.includes(nJob)) return true;

    // Keyword map match
    var matched = false;
    Object.keys(P4_KEYWORDS).forEach(function(cat) {
      if (matched) return;
      var words = P4_KEYWORDS[cat];
      // Check if job touches this category
      var jobTouchesCat = nJob.includes(normalizeText(cat)) ||
        words.some(function(w){ return nJob.includes(normalizeText(w)); });
      if (!jobTouchesCat) return;
      // Check if request touches this category
      matched = words.some(function(w){ return haystack.includes(normalizeText(w)); });
    });
    return matched;
  }

  function getArtisanId(artisan) {
    if (artisan.id && artisan.id.trim()) return artisan.id.trim();
    // Stable derived ID from city+job
    return normalizeText((artisan.city||'') + '|' + (artisan.job||'')).replace(/\s+/g,'_') || 'artisan-fixeo';
  }

  /* ── V1-D: Adjacent city map (mirrors matching engine ZONES_ADJACENTES) ── */
  var ADJACENT_CITIES = {
    'casablanca':  ['mohammedia','berrechid','bouskoura','el jadida'],
    'rabat':       ['sale','temara','skhirat','kenitra'],
    'marrakech':   ['tamansourt','ait ourir','safi'],
    'tanger':      ['tetouan','fnideq','mdiq'],
    'fes':         ['meknes','sefrou'],
    'agadir':      ['inezgane','ait melloul','dcheira'],
    'meknes':      ['fes','sefrou'],
    'tetouan':     ['tanger','fnideq'],
    'oujda':       [],
    'kenitra':     ['rabat','sale'],
    'safi':        ['marrakech'],
    'el jadida':   ['casablanca'],
    'mohammedia':  ['casablanca'],
    'sale':        ['rabat','kenitra'],
    'temara':      ['rabat'],
    'berrechid':   ['casablanca'],
  };

  /* ── V1-D: Is a request city adjacent to artisan city? ─── */
  function _isAdjacentCity(artisanCity, requestCity) {
    if (!artisanCity || !requestCity) return false;
    var nac = normalizeText(artisanCity);
    var nrc = normalizeText(requestCity);
    var adj = ADJACENT_CITIES[nac] || [];
    return adj.some(function(c){ return normalizeText(c) === nrc; });
  }

  function getMatchingRequests(artisan) {
    var ignored = new Set(readIgnored());
    var city = normalizeText(artisan.city);

    var exact = [], adjacent = [];

    readRequests().forEach(function(r) {
      // Must be available status
      if (!isAvailableStatus(r.status)) return;
      // Must not be locked/assigned
      if (r.locked || r.assigned_artisan || r.assigned_artisan_id) return;
      // Must not be ignored by this artisan
      if (ignored.has(String(r.id))) return;
      var ignoredBy = Array.isArray(r.ignored_by_artisans) ? r.ignored_by_artisans : [];
      if (ignoredBy.indexOf(getArtisanId(artisan)) >= 0) return;
      // Must match job/service
      if (!matchesJob(r, artisan.job)) return;
      // City matching: exact first, then V1-D adjacent city
      var rCity = normalizeText(r.city || r.ville || '');
      if (!city || rCity === city) {
        exact.push(r);
      } else if (city && _isAdjacentCity(artisan.city, r.city || r.ville || '')) {
        /* V1-D: Adjacent city requests — shown at lower priority (appended after exact) */
        adjacent.push(Object.assign({}, r, { _adjacent_city: true }));
      }
    });

    /* Sort each pool: urgent first, then newest */
    function sortPool(pool) {
      return pool.sort(function(a, b) {
        var au = /urgent/i.test(a.urgency||'') ? 1 : 0;
        var bu = /urgent/i.test(b.urgency||'') ? 1 : 0;
        if (bu !== au) return bu - au;
        return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
      });
    }

    /* V1-D: Adjacent requests only shown when no exact-city requests exist
       OR when exact pool has < 3 requests (sparse market fallback).
       Never shown alongside a full exact pool — avoids confusion. */
    var combined;
    if (exact.length >= 3) {
      combined = sortPool(exact);
    } else {
      combined = sortPool(exact).concat(sortPool(adjacent));
    }
    return combined;
  }

  /* ── Phone → WA link ─────────────────────────────────── */
  function buildWALink(phone) {
    if (!phone) return '';
    var digits = String(phone).replace(/\D/g,'');
    if (digits.length < 9) return '';
    // Moroccan: 06/07 → +212
    if (digits.startsWith('0')) digits = '212' + digits.slice(1);
    var msg = encodeURIComponent('Bonjour, j\u2019ai re\u00e7u votre demande sur Fixeo. Je suis disponible pour intervenir. Pouvez-vous me pr\u00e9ciser votre adresse ?');
    return 'https://wa.me/' + digits + '?text=' + msg;
  }

  /* ── ACCEPT action ───────────────────────────────────── */
  window._fxP4Accept = function(reqId) {
    var artisan = getArtisan();
    var artisanId = getArtisanId(artisan);
    var list = readRequests();
    var idx = -1;
    var found = null;

    list.forEach(function(r, i) {
      if (String(r.id) === String(reqId)) { idx = i; found = r; }
    });

    if (idx < 0 || !found) return;
    if (!isAvailableStatus(found.status) || found.locked) {
      if (window.notifications) notifications.warning('D\u00e9j\u00e0 prise', 'Cette demande a d\u00e9j\u00e0 \u00e9t\u00e9 accept\u00e9e par un autre artisan.');
      return;
    }

    // Persist
    var now = new Date().toISOString();
    list[idx] = Object.assign({}, found, {
      status: 'accept\u00e9e',
      accepted_at: now,
      assigned_artisan: artisan.name || 'Artisan Fixeo',
      assigned_artisan_id: artisanId,
      locked: true,
      locked_at: Date.now()
    });
    writeRequests(list);

    // Dispatch events
    dispatch('fixeo:client-request-updated', list[idx]);
    dispatch('fixeo:missions:updated',        { missions: [] });
    dispatch('fixeo:state:updated',           { event: 'request-accepted' });

    // Update card DOM immediately — post-accept: WA CTA primary action
    var card = el('fxadp4-card-' + reqId);
    if (card) {
      card.classList.add('state-accepted');
      var actions = card.querySelector('.fxadp4-card-actions');
      if (actions) {
        var waLink = buildWALink(found.phone || found.telephone);
        var art    = getArtisan();
        var artName = (art.name || 'Artisan Fixeo').split(' ')[0];
        var svc   = (found.service || 'votre demande').toLowerCase();
        var city  = found.city || found.ville || art.city || 'votre ville';
        var waMsg = encodeURIComponent(
          'Bonjour, je suis ' + artName + ', artisan Fixeo sp\u00e9cialis\u00e9 en ' + svc + ' \u00e0 ' + city + '. '
          + 'J\u2019ai bien re\u00e7u votre demande et je suis disponible pour intervenir. '
          + 'Pouvez-vous me confirmer l\u2019adresse et l\u2019heure souhait\u00e9e\u00a0?'
        );
        var waHref = waLink
          ? waLink.replace(/\?text=.*$/, '') + '?text=' + waMsg
          : '';
        /* V1-A: post-accept state: WA CTA primary + Terminer secondary */
        actions.innerHTML = '<span class="fxadp4-accepted-label">\u2713 Accept\u00e9e</span>'
          + (waHref
            ? '<a class="fxadp4-btn-wa fxadp4-btn-wa--primary" href="' + esc(waHref) + '" target="_blank" rel="noopener">'
              + '\ud83d\udcf2 Coordonner via WhatsApp'
              + '</a>'
            : '')
          + '<button class="fxadp4-btn-done" onclick="_fxP4Done(\'' + id + '\')">'
            + '\u2713 Marquer termin\u00e9e'
            + '</button>';
      }
    }

    // Update overview mini-inbox + sidebar badge
    _refreshOverviewCount();
    _updateSidebarBadge();

    if (window.notifications) {
      notifications.success('Demande accept\u00e9e !', 'Contactez le client via WhatsApp pour coordonner.');
    }
  };

  /* ── IGNORE action ───────────────────────────────────── */
  window._fxP4Ignore = function(reqId) {
    var artisan = getArtisan();
    var artisanId = getArtisanId(artisan);

    // 1. ignored_by_artisans field on the request
    var list = readRequests();
    list.forEach(function(r, i) {
      if (String(r.id) !== String(reqId)) return;
      var arr = Array.isArray(r.ignored_by_artisans) ? r.ignored_by_artisans.slice() : [];
      if (arr.indexOf(artisanId) < 0) arr.push(artisanId);
      list[i] = Object.assign({}, r, { ignored_by_artisans: arr });
    });
    writeRequests(list);

    // 2. Local ignored set (faster lookup)
    var ignored = readIgnored();
    if (ignored.indexOf(String(reqId)) < 0) ignored.push(String(reqId));
    writeIgnored(ignored);

    // Hide card
    var card = el('fxadp4-card-' + reqId);
    if (card) card.classList.add('state-ignored');

    // Dispatch
    dispatch('fixeo:state:updated', { event: 'request-ignored' });
    _refreshOverviewCount();
    _updateSidebarBadge();
  };

  /* ── V1-A: Mark intervention done from accepted card ─── */
  window._fxP4Done = function(reqId) {
    var list = readRequests();
    list.forEach(function(r, i) {
      if (String(r.id) === String(reqId)) {
        list[i] = Object.assign({}, r, {
          status: 'termin\u00e9e',
          completed_at: new Date().toISOString()
        });
      }
    });
    writeRequests(list);
    dispatch('fixeo:client-request-updated', { id: reqId, status: 'termin\u00e9e' });
    dispatch('fixeo:state:updated', { event: 'request-done' });
    /* Navigate artisan to Missions tab to see the completed entry */
    if (typeof showSection === 'function') showSection('missions');
    if (window.notifications) notifications.success('Intervention termin\u00e9e', 'Elle appara\u00eet dans vos Missions.');
  };

  /* ── V1-A: Update sidebar "Demandes [N]" badge ────────── */
  function _updateSidebarBadge() {
    var artisan  = getArtisan();
    var requests = getMatchingRequests(artisan);
    var count    = requests.length;
    var badge    = document.getElementById('fxadp4-sidebar-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ── RENDER: full request card ───────────────────────── */
  function renderCard(r) {
    var isUrgent  = /urgent/i.test(r.urgency||'');
    var isAdjacent = !!r._adjacent_city;
    var waLink    = buildWALink(r.phone || r.telephone);
    var service   = esc(r.service || 'Demande client');
    var city      = esc(r.city || r.ville || 'Ville non pr\u00e9cis\u00e9e');
    var desc      = esc(r.description || r.probleme || '');
    var budget    = esc(r.budget || '');
    var time      = relativeTime(r.created_at || r.date);
    var id        = String(r.id);

    var acceptedState = !isAvailableStatus(r.status) || r.locked;

    var urgencyBadge = isUrgent
      ? '<span class="fxadp4-badge urgent">\u26a1 Urgent</span>'
      : '<span class="fxadp4-badge normal">\ud83d\uddd3 Planifi\u00e9</span>';

    /* V1-A: reservation_cod source gets a "Réservation directe" badge */
    var matchBadge = r.source === 'reservation_cod'
      ? '<span class="fxadp4-badge direct">\ud83d\udccc R\u00e9servation directe</span>'
      : '<span class="fxadp4-badge match">\u2714 M\u00e9tier + ville compatibles</span>';

    var budgetHtml = budget
      ? '<div class="fxadp4-card-budget">\ud83d\udcb0 ' + budget + '</div>'
      : '';

    /* V1-A: STATE A = new (accept + ignore), STATE B = accepted (WA primary + done) */
    var actionsHtml;
    if (acceptedState) {
      /* STATE B — Accepted: WhatsApp is now the primary action */
      var art       = getArtisan();
      var artName   = (art.name || 'Artisan Fixeo').split(' ')[0];
      var svcLow    = (r.service || 'votre demande').toLowerCase();
      var cityCtx   = r.city || r.ville || art.city || 'votre ville';
      var waMsgAcc  = encodeURIComponent(
        'Bonjour, je suis ' + artName + ', artisan Fixeo sp\u00e9cialis\u00e9 en ' + svcLow + ' \u00e0 ' + cityCtx + '. '
        + 'J\u2019ai bien re\u00e7u votre demande et je suis disponible pour intervenir. '
        + 'Pouvez-vous me confirmer l\u2019adresse et l\u2019heure souhait\u00e9e\u00a0?'
      );
      var waAccHref = waLink
        ? waLink.replace(/\?text=.*$/, '') + '?text=' + waMsgAcc
        : '';
      actionsHtml = '<span class="fxadp4-accepted-label">\u2713 Accept\u00e9e</span>'
        + (waAccHref
          ? '<a class="fxadp4-btn-wa fxadp4-btn-wa--primary" href="' + esc(waAccHref) + '" target="_blank" rel="noopener">'
            + '\ud83d\udcf2 Coordonner via WhatsApp'
            + '</a>'
          : '')
        + '<button class="fxadp4-btn-done" onclick="_fxP4Done(\'' + id + '\')">'
          + '\u2713 Marquer termin\u00e9e'
          + '</button>';
    } else {
      /* STATE A — New: accept is primary, ignore is secondary, no pre-accept WA */
      actionsHtml = '<button class="fxadp4-btn-accept" onclick="_fxP4Accept(\'' + id + '\')">Accepter la demande</button>'
        + '<button class="fxadp4-btn-ignore" onclick="_fxP4Ignore(\'' + id + '\')">Passer</button>';
    }

    return '<div class="fxadp4-card' + (isUrgent ? ' is-urgent' : '') + (acceptedState ? ' state-accepted' : '') + '" id="fxadp4-card-' + id + '"' + (isAdjacent ? ' data-adjacent="1"' : '') + '>'
      + '<div class="fxadp4-card-top">'
      + '<div class="fxadp4-card-badges">' + urgencyBadge + matchBadge + '</div>'
      + '<div class="fxadp4-card-time">' + esc(time) + '</div>'
      + '</div>'
      + '<div class="fxadp4-card-title">' + service + '</div>'
      + '<div class="fxadp4-card-city">\ud83d\udccd ' + city + '</div>'
      + (desc ? '<div class="fxadp4-card-desc">' + desc + '</div>' : '')
      + budgetHtml
      + '<div class="fxadp4-card-actions">' + actionsHtml + '</div>'
      + '</div>';
  }

  /* ── RENDER: full inbox section ──────────────────────── */
  function renderFullInbox(artisan, requests) {
    var avail = artisan.avail;
    var html = '';

    // Header
    var count = requests.length;
    html += '<div class="fxadp4-inbox-header">'
      + '<h2 class="fxadp4-inbox-title">'
      + 'Demandes re\u00e7ues '
      + '<span class="fxadp4-count-badge' + (count === 0 ? ' zero' : '') + '">' + count + '</span>'
      + '</h2>'
      + '<div class="fxadp4-inbox-sub">Correspondant \u00e0 votre m\u00e9tier et votre ville</div>'
      + '</div>';

    // Unavailable banner
    if (avail === 'off') {
      html += '<div class="fxadp4-unavail-banner">'
        + '<div class="fxadp4-unavail-dot"></div>'
        + '<div class="fxadp4-unavail-text">Vous \u00eates marqu\u00e9 indisponible. Les demandes ci-dessous resteront disponibles lorsque vous repasserez actif.</div>'
        + '<button class="fxadp4-unavail-cta" onclick="_fxAdP2SetAvail && _fxAdP2SetAvail(\'now\')">\u25cf Changer ma disponibilit\u00e9</button>'
        + '</div>';
    }

    // Incomplete profile state
    var hasJob  = !!(artisan.job  && artisan.job.trim().length  > 1);
    var hasCity = !!(artisan.city && artisan.city.trim().length > 1);
    if (!hasJob || !hasCity) {
      html += '<div class="fxadp4-incomplete-state">'
        + '<div class="fxadp4-incomplete-icon">\u26a0\ufe0f</div>'
        + '<div class="fxadp4-incomplete-body">'
        + '<div class="fxadp4-incomplete-title">Profil incomplet</div>'
        + '<div class="fxadp4-incomplete-sub">Compl\u00e9tez votre m\u00e9tier et votre ville pour recevoir des demandes compatibles.</div>'
        + '<button class="fxadp4-incomplete-cta" onclick="showSection(\'settings\')">\u2192 Compl\u00e9ter mon profil</button>'
        + '</div>'
        + '</div>';
      return html;
    }

    // Cards or empty state
    if (requests.length === 0) {
      html += renderEmptyState(artisan);
    } else {
      /* V1-D: Separate exact-city from adjacent-city requests */
      var exactRequests    = requests.filter(function(r){ return !r._adjacent_city; });
      var adjacentRequests = requests.filter(function(r){ return !!r._adjacent_city; });
      html += '<div class="fxadp4-card-list">';
      exactRequests.forEach(function(r){ html += renderCard(r); });
      if (adjacentRequests.length > 0) {
        html += '<div class="fxadp4-adj-separator">'
          + '<span>\ud83d\udccc Demandes dans les villes proches</span>'
          + '</div>';
        adjacentRequests.forEach(function(r){ html += renderCard(r); });
      }
      html += '</div>';
    }

    return html;
  }

  /* ── V1-D: RENDER: empty state — honest, operational, with context ── */
  function renderEmptyState(artisan) {
    var hasJob  = !!(artisan.job  && artisan.job.trim().length  > 1);
    var hasCity = !!(artisan.city && artisan.city.trim().length > 1);
    var availLabel = artisan.avail === 'now'  ? 'Disponible maintenant' :
                     artisan.avail === 'week' ? 'Cette semaine' :
                     artisan.avail === 'off'  ? 'Indisponible' : 'Non d\u00e9finie';

    /* V1-D: Check if adjacent cities have requests — give artisan honest context */
    var adjInfo = '';
    if (hasCity && hasJob) {
      try {
        var allR = readRequests();
        var adjCities = ADJACENT_CITIES[normalizeText(artisan.city)] || [];
        var adjReqs = allR.filter(function(r) {
          if (!isAvailableStatus(r.status)) return false;
          if (r.locked || r.assigned_artisan || r.assigned_artisan_id) return false;
          if (!matchesJob(r, artisan.job)) return false;
          var rCity = normalizeText(r.city || r.ville || '');
          return adjCities.some(function(c){ return normalizeText(c) === rCity; });
        });
        if (adjReqs.length > 0) {
          var adjCityName = adjReqs[0].city || adjReqs[0].ville || '';
          adjInfo = '<div class="fxadp4-empty-adj">'
            + '<span class="fxadp4-adj-icon">\ud83d\udccc</span>'
            + adjReqs.length + ' demande' + (adjReqs.length > 1 ? 's' : '') + ' similaire'
            + (adjReqs.length > 1 ? 's' : '') + ' dans une ville proche'
            + (adjCityName ? ' (' + esc(adjCityName) + ')' : '')
            + ' — Fixeo vous les montrera si aucune demande locale n\u2019arrive dans votre zone.'
            + '</div>';
        }
      } catch(e) {}
    }

    return '<div class="fxadp4-empty">'
      + '<div class="fxadp4-empty-icon">\ud83d\udcec</div>'
      + '<div class="fxadp4-empty-title">Pas encore de demande dans votre zone</div>'
      + '<div class="fxadp4-empty-sub">Les nouvelles demandes correspondant \u00e0 votre m\u00e9tier et votre ville apparaissent ici automatiquement.</div>'
      + adjInfo
      + '<div class="fxadp4-empty-pills">'
      + '<span class="fxadp4-epill ' + (hasJob  ? 'ok'   : 'warn') + '">\u2692 ' + esc(hasJob  ? artisan.job  : 'M\u00e9tier non d\u00e9fini') + '</span>'
      + '<span class="fxadp4-epill ' + (hasCity ? 'ok'   : 'warn') + '">\ud83d\udccd ' + esc(hasCity ? artisan.city : 'Ville non d\u00e9finie') + '</span>'
      + '<span class="fxadp4-epill neutral">\ud83d\uddd3 ' + esc(availLabel) + '</span>'
      + '</div>'
      + '<div class="fxadp4-empty-hint">Votre profil est actif. Fixeo vous notifiera d\u00e8s qu\u2019une demande arrive dans votre zone.</div>'
      + '</div>';
  }

  /* ── RENDER: overview mini-inbox ─────────────────────── */
  function renderOverviewInbox(artisan, requests) {
    var shown   = requests.slice(0, MAX_OVERVIEW_ITEMS);
    var hasMore = requests.length > MAX_OVERVIEW_ITEMS;
    var total   = requests.length;
    var avail   = artisan.avail || 'now';

    /* V1-B: Pull active mission count for overview priority block */
    var activeMissions = [];
    try {
      var allReqs = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      var myId  = getArtisanId(artisan);
      var myName = normalizeText(artisan.name || '');
      activeMissions = allReqs.filter(function(r) {
        var st = (r.status || '').toLowerCase().replace(/\s+/g,'_').replace(/[éè]/g,'e');
        if (!['acceptee','en_cours','terminee'].some(function(s){ return st === s || st.startsWith(s); })) return false;
        var rid  = String(r.assigned_artisan_id || '').trim();
        var rnam = normalizeText(r.assigned_artisan || '');
        return (myId && rid && rid === myId) || (myName.length > 1 && rnam && rnam === myName);
      });
    } catch(e){}

    /* Active mission mini-strip (shown above new requests when missions exist) */
    var missionStripHtml = '';
    if (activeMissions.length > 0) {
      var enCours = activeMissions.filter(function(r){
        var s = (r.status||'').toLowerCase(); return s === 'en_cours';
      });
      var accepted = activeMissions.filter(function(r){
        var s = (r.status||'').toLowerCase().replace(/[éè]/g,'e');
        return s === 'acceptee' || s === 'accept\u00e9e';
      });
      var missionLabel = enCours.length > 0
        ? '\ud83d\udd34 ' + enCours.length + ' en cours'
        : '\ud83d\udccc ' + accepted.length + ' \u00e0 coordonner';
      missionStripHtml = '<div class="fxadp4-mission-strip" onclick="showSection(\'missions\')">'
        + '<div class="fxadp4-mission-strip-dot' + (enCours.length > 0 ? ' active' : '') + '"></div>'
        + '<div class="fxadp4-mission-strip-body">'
        + '<span class="fxadp4-mission-strip-label">' + missionLabel + '</span>'
        + '<span class="fxadp4-mission-strip-sub">Voir mes interventions \u203a</span>'
        + '</div>'
        + '</div>';
    }

    /* Availability softener — when off, title changes tone (no inbox blocking) */
    var titleLabel = avail === 'off'
      ? 'Demandes en attente '
      : 'Nouvelles demandes ';

    var itemsHtml = shown.map(function(r) {
      var isUrgent = /urgent/i.test(r.urgency||'');
      return '<div class="fxadp4-mini-card' + (isUrgent ? ' urgent' : '') + '" onclick="showSection(\'requests\')">'
        + '<div class="fxadp4-mini-dot' + (isUrgent ? '' : ' normal') + '"></div>'
        + '<div class="fxadp4-mini-body">'
        + '<div class="fxadp4-mini-service">' + esc(r.service||'Demande') + ' \u2014 ' + esc(r.city||r.ville||'') + '</div>'
        + '<div class="fxadp4-mini-meta">' + esc(relativeTime(r.created_at||r.date)) + (r.budget ? ' \u00b7 ' + esc(r.budget) : '') + '</div>'
        + '</div>'
        + '<div class="fxadp4-mini-arrow">\u203a</div>'
        + '</div>';
    }).join('');

    return '<div class="fxadp4-overview-inbox" id="fxadp4-overview-inbox">'
      + missionStripHtml
      + '<div class="fxadp4-overview-header">'
      + '<h3 class="fxadp4-overview-title">'
      + titleLabel
      + '<span class="fxadp4-count-badge' + (total === 0 ? ' zero' : '') + '">' + total + '</span>'
      + '</h3>'
      + (total > 0 ? '<button class="fxadp4-see-all" onclick="showSection(\'requests\')">Voir tout \u203a</button>' : '')
      + '</div>'
      + (shown.length > 0 ? itemsHtml : '')
      + (total === 0
        ? '<div class="fxadp4-overview-empty">'
          + (avail === 'off' ? '\u23f8 Vous \u00eates hors ligne. Les demandes vous attendent.' : 'Aucune demande compatible pour le moment.')
          + '</div>'
        : '')
      + (hasMore ? '<div class="fxadp4-overview-more">+ ' + (total - MAX_OVERVIEW_ITEMS) + ' autres demandes</div>' : '')
      + '</div>';
  }

  /* ── Inject overview mini-inbox ──────────────────────── */
  function injectOverviewInbox(artisan, requests) {
    var p2Wrap = el('fxadp2-overview-wrap');
    if (!p2Wrap) return;

    var existing = el('fxadp4-overview-inbox');
    if (existing) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderOverviewInbox(artisan, requests);
      existing.parentNode.replaceChild(tmp.firstChild, existing);
      return;
    }

    // Insert before availability block
    var avail = el('fxadp2-avail');
    var tmp = document.createElement('div');
    tmp.innerHTML = renderOverviewInbox(artisan, requests);
    var node = tmp.firstChild;
    if (avail && avail.parentNode === p2Wrap) {
      avail.parentNode.insertBefore(node, avail);
    } else {
      p2Wrap.appendChild(node);
    }
  }

  /* ── Inject full inbox into #section-requests ─────────── */
  function injectFullInbox(artisan, requests) {
    var grid = el('requests-grid');
    if (!grid) return;

    // Replace only what P4 owns (keep section-heading intact)
    var existing = el('fxadp4-full-inbox');
    var html = renderFullInbox(artisan, requests);
    if (existing) {
      existing.innerHTML = html;
    } else {
      var wrap = document.createElement('div');
      wrap.id = 'fxadp4-full-inbox';
      wrap.innerHTML = html;
      // Replace .requests-stack content
      grid.innerHTML = '';
      grid.appendChild(wrap);
    }
  }

  /* ── Refresh overview count badge only ───────────────── */
  function _refreshOverviewCount() {
    var artisan  = getArtisan();
    var requests = getMatchingRequests(artisan);
    var badge    = el('fxadp4-overview-inbox');
    if (!badge) return;
    injectOverviewInbox(artisan, requests);
  }

  /* ── MAIN RENDER ─────────────────────────────────────── */
  function render() {
    var artisan  = getArtisan();
    var requests = getMatchingRequests(artisan);

    injectOverviewInbox(artisan, requests);
    injectFullInbox(artisan, requests);
    _updateSidebarBadge();

    // Sync notification bell badge via existing P4-friendly interface
    dispatch('fixeo:artisan-inbox:updated', { count: requests.length });
  }

  /* ── ALSO: hide legacy P3 req empty when P4 is active ── */
  function hideLegacyEmpty() {
    // P3 renders its own empty state in #fxadp3-p3-blocks which is
    // inside fxadp2-overview-wrap — P4 inserts BEFORE it, so both
    // can coexist. But the full-inbox P3 version in requests-grid is
    // now fully replaced by P4. No CSS override needed.
  }

  /* ── EVENT LISTENERS ─────────────────────────────────── */
  function bindListeners() {
    // Re-render when a new request is created
    window.addEventListener('fixeo:client-request-created', function() {
      setTimeout(render, 100);
    });
    // Re-render when any request is updated
    window.addEventListener('fixeo:client-request-updated', function() {
      setTimeout(render, 100);
    });
    // Re-render when profile is updated (city/job changed)
    document.addEventListener('fixeo:profile:updated', function() {
      setTimeout(render, 200);
    });
    // Cross-tab: another window stored a request
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY) setTimeout(render, 150);
    });
    // Auto-refresh every 60s (requests may have been created on another device)
    setInterval(render, 60000);
  }

  /* ── INIT ────────────────────────────────────────────── */
  function init() {
    hideLegacyEmpty();
    // Defer slightly to let P1/P2/P3 finish their DOM work
    setTimeout(function() {
      render();
      bindListeners();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);

    /* ── V1-A: Re-render inbox when Supabase profile sync completes ──
       Fires after fixeo-mvp-supabase.js writes user_job from artisans table.
       Guard: only re-render if job was previously empty (avoid churn).
    ────────────────────────────────────────────────────────────────── */
    window.addEventListener('fixeo:artisan:profile-synced', function(e) {
      var wasEmpty = !localStorage.getItem('user_job') ||
                     !(localStorage.getItem('user_job') || '').trim();
      if (wasEmpty && e.detail && e.detail.job) {
        localStorage.setItem('user_job', e.detail.job);
      }
      render();
    });
  } else {
    setTimeout(init, 0);
  }

})();
