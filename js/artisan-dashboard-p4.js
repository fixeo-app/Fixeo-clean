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

  function getMatchingRequests(artisan) {
    var ignored = new Set(readIgnored());
    var city = normalizeText(artisan.city);

    return readRequests().filter(function(r) {
      // Must be available status
      if (!isAvailableStatus(r.status)) return false;
      // Must not be locked/assigned
      if (r.locked || r.assigned_artisan || r.assigned_artisan_id) return false;
      // Must not be ignored by this artisan
      if (ignored.has(String(r.id))) return false;
      // Must not be ignored via field
      var ignoredBy = Array.isArray(r.ignored_by_artisans) ? r.ignored_by_artisans : [];
      if (ignoredBy.indexOf(getArtisanId(artisan)) >= 0) return false;
      // Must match city
      if (city && normalizeText(r.city || r.ville || '') !== city) return false;
      // Must match job/service
      if (!matchesJob(r, artisan.job)) return false;
      return true;
    }).sort(function(a, b) {
      // Urgent first, then newest first
      var au = /urgent/i.test(a.urgency||'') ? 1 : 0;
      var bu = /urgent/i.test(b.urgency||'') ? 1 : 0;
      if (bu !== au) return bu - au;
      return (Date.parse(b.created_at||'')||0) - (Date.parse(a.created_at||'')||0);
    });
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

    // Update card DOM immediately
    var card = el('fxadp4-card-' + reqId);
    if (card) {
      card.classList.add('state-accepted');
      var actions = card.querySelector('.fxadp4-card-actions');
      if (actions) {
        actions.innerHTML = '<span class="fxadp4-accepted-label">\u2713 Demande accept\u00e9e</span>';
      }
    }

    // Update overview mini-inbox
    _refreshOverviewCount();

    if (window.notifications) {
      notifications.success('Demande accept\u00e9e !', 'Contactez le client pour planifier l\u2019intervention.');
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
  };

  /* ── RENDER: full request card ───────────────────────── */
  function renderCard(r) {
    var isUrgent = /urgent/i.test(r.urgency||'');
    var waLink   = buildWALink(r.phone || r.telephone);
    var service  = esc(r.service || 'Demande client');
    var city     = esc(r.city || r.ville || 'Ville non pr\u00e9cis\u00e9e');
    var desc     = esc(r.description || r.probleme || '');
    var budget   = esc(r.budget || '');
    var time     = relativeTime(r.created_at || r.date);
    var id       = String(r.id);

    var acceptedState = !isAvailableStatus(r.status) || r.locked;

    var urgencyBadge = isUrgent
      ? '<span class="fxadp4-badge urgent">\u26a1 Urgent</span>'
      : '<span class="fxadp4-badge normal">\ud83d\uddd3 Planifi\u00e9</span>';

    var matchBadge = '<span class="fxadp4-badge match">\u2714 M\u00e9tier + ville compatibles</span>';

    var budgetHtml = budget
      ? '<div class="fxadp4-card-budget">\ud83d\udcb0 ' + budget + '</div>'
      : '';

    var actionsHtml;
    if (acceptedState) {
      actionsHtml = '<span class="fxadp4-accepted-label">\u2713 Accept\u00e9e</span>';
    } else {
      actionsHtml = '<button class="fxadp4-btn-accept" onclick="_fxP4Accept(\'' + id + '\')">Accepter la demande</button>';
      if (waLink) {
        actionsHtml += '<a class="fxadp4-btn-wa" href="' + esc(waLink) + '" target="_blank" rel="noopener">\ud83d\udcf2 WhatsApp</a>';
      }
      actionsHtml += '<button class="fxadp4-btn-ignore" onclick="_fxP4Ignore(\'' + id + '\')">Passer</button>';
    }

    return '<div class="fxadp4-card' + (isUrgent ? ' is-urgent' : '') + (acceptedState ? ' state-accepted' : '') + '" id="fxadp4-card-' + id + '">'
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
      html += '<div class="fxadp4-card-list">';
      requests.forEach(function(r) { html += renderCard(r); });
      html += '</div>';
    }

    return html;
  }

  /* ── RENDER: empty state ─────────────────────────────── */
  function renderEmptyState(artisan) {
    var hasJob  = !!(artisan.job  && artisan.job.trim().length  > 1);
    var hasCity = !!(artisan.city && artisan.city.trim().length > 1);
    var availLabel = artisan.avail === 'now'  ? 'Disponible maintenant' :
                     artisan.avail === 'week' ? 'Cette semaine' :
                     artisan.avail === 'off'  ? 'Indisponible' : 'Non d\u00e9finie';

    return '<div class="fxadp4-empty">'
      + '<div class="fxadp4-empty-icon">\ud83d\udcec</div>'
      + '<div class="fxadp4-empty-title">Aucune demande compatible pour le moment</div>'
      + '<div class="fxadp4-empty-sub">Les demandes apparaîtront ici lorsqu\u2019elles correspondent \u00e0 votre m\u00e9tier et votre ville.</div>'
      + '<div class="fxadp4-empty-pills">'
      + '<span class="fxadp4-epill ' + (hasJob  ? 'ok'   : 'warn') + '">\u2692 ' + esc(hasJob  ? artisan.job  : 'M\u00e9tier non d\u00e9fini') + '</span>'
      + '<span class="fxadp4-epill ' + (hasCity ? 'ok'   : 'warn') + '">\ud83d\udccd ' + esc(hasCity ? artisan.city : 'Ville non d\u00e9finie') + '</span>'
      + '<span class="fxadp4-epill neutral">\ud83d\uddd3 ' + esc(availLabel) + '</span>'
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: overview mini-inbox ─────────────────────── */
  function renderOverviewInbox(artisan, requests) {
    var shown  = requests.slice(0, MAX_OVERVIEW_ITEMS);
    var hasMore = requests.length > MAX_OVERVIEW_ITEMS;
    var total  = requests.length;

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
      + '<div class="fxadp4-overview-header">'
      + '<h3 class="fxadp4-overview-title">'
      + 'Nouvelles demandes '
      + '<span class="fxadp4-count-badge' + (total === 0 ? ' zero' : '') + '">' + total + '</span>'
      + '</h3>'
      + (total > 0 ? '<button class="fxadp4-see-all" onclick="showSection(\'requests\')">Voir tout \u203a</button>' : '')
      + '</div>'
      + (shown.length > 0 ? itemsHtml : '')
      + (total === 0 ? '<div style="font-size:0.8rem;opacity:0.4;padding:8px 0">Aucune demande compatible pour le moment.</div>' : '')
      + (hasMore ? '<div style="font-size:0.76rem;opacity:0.38;margin-top:4px;text-align:center">+ ' + (total - MAX_OVERVIEW_ITEMS) + ' autres</div>' : '')
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
  } else {
    setTimeout(init, 0);
  }

})();
