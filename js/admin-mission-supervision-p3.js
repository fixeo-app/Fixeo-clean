/* ============================================================
   FIXEO ADMIN — MISSION SUPERVISION PHASE 3
   js/admin-mission-supervision-p3.js

   OBJECTIVE: Real mission supervision center.
   Single source of truth: fixeo_client_requests
   
   Adds a dedicated "Supervision" section to the admin sidebar.

   NEVER: re-renders commission queue, artisan table, overview KPIs,
          forks lifecycle, creates duplicate stores, fake data
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAms3Loaded) return;
  window._fxAms3Loaded = true;

  /* ── Admin page guard ────────────────────────────────────── */
  function _isAdmin() { return document.body && document.body.dataset.dashType === 'admin'; }
  if (!_isAdmin()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { if (_isAdmin()) init(); });
    }
    return;
  }

  /* ── Constants ───────────────────────────────────────────── */
  var STORAGE_KEY     = 'fixeo_client_requests';
  var COMMISSION_RATE = 0.15;

  /* Blocked-case thresholds (hours) */
  var ACCEPTED_STALE_H = 48;   /* accepted but not started after N hours → À suivre */
  var COMPLETE_WAIT_H  = 72;   /* completed but not validated after N hours → attention */

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function esc(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function nowISO() { return new Date().toISOString(); }
  function fmt(s)   {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
    catch(e){ return '—'; }
  }
  function fmtShort(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}); }
    catch(e){ return '—'; }
  }
  function hoursAgo(s) {
    if (!s) return Infinity;
    try { return (Date.now() - new Date(s).getTime()) / 3600000; }
    catch(e){ return Infinity; }
  }
  function roundMoney(n) { return Math.round(Number(n||0)); }
  function formatMoney(n) { var v=roundMoney(n); return v>0 ? v.toLocaleString('fr-FR')+' MAD' : '—'; }

  function buildWALink(phone, name, context) {
    var digits = String(phone||'').replace(/\D/g,'');
    if (digits.length < 9) return '';
    if (digits.charAt(0)==='0') digits='212'+digits.slice(1);
    else if (!digits.startsWith('212')) digits='212'+digits;
    var msg = encodeURIComponent('Bonjour ' + (name||'') + ', c\u2019est l\u2019\u00e9quipe Fixeo. ' + (context||''));
    return 'https://wa.me/' + digits + '?text=' + msg;
  }

  /* ── Status normalization ────────────────────────────────── */
  function normSt(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (n==='nouvelle'||n==='disponible'||n==='') return 'nouvelle';
    if (n==='acceptee'||n==='accepte') return 'accept\u00e9e';
    if (n==='en cours'||n==='en_cours'||n==='encours') return 'en_cours';
    if (n==='terminee'||n==='termine') return 'termin\u00e9e';
    if (n==='validee'||n==='valide'||n==='intervention confirmee'||n==='intervention_confirmee') return 'valid\u00e9e';
    if (n==='annulee'||n==='annule') return 'annul\u00e9e';
    return s||'nouvelle';
  }

  function parseMoney(v) {
    if (typeof v==='number'&&isFinite(v)&&v>0) return roundMoney(v);
    var nums=String(v||'').match(/\d+(?:[\s.,]\d+)*/g)||[];
    var arr=nums.map(function(m){return parseFloat(m.replace(/[\s,]/g,'.'));}).filter(function(x){return isFinite(x)&&x>0;});
    if(!arr.length) return 0;
    return roundMoney(arr.reduce(function(a,b){return a+b;},0)/arr.length);
  }
  function deriveFP(r) {
    var ex=roundMoney(r.final_price||r.price||r.agreed_price||r.budget_value||0);
    return ex>0?ex:parseMoney(r.budget||'');
  }

  /* ── Read requests ───────────────────────────────────────── */
  function readReqs() {
    try {
      if (window.FixeoClientRequestsStore&&typeof window.FixeoClientRequestsStore.list==='function') return window.FixeoClientRequestsStore.list();
      var raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(raw)?raw:[];
    } catch(e){ return []; }
  }

  /* ── Classify blocked cases ──────────────────────────────── */
  var BLOCK_NONE       = '';
  var BLOCK_STALE_ACCEPT = 'stale_accepted';  /* accepted too long → À suivre */
  var BLOCK_WAIT_VALID  = 'wait_validation';  /* terminée, waiting client confirm */
  var BLOCK_REVIEW_REQ  = 'review_required';  /* commission_pending_review */
  var BLOCK_SUSPENDED   = 'suspended';        /* artisan suspended */

  function detectBlock(r, modMap) {
    var st = normSt(r.status);
    /* Commission to review */
    if (r.commission_pending_review===true && !r.commission_paid) return BLOCK_REVIEW_REQ;
    /* Client confirmation pending */
    if (st==='termin\u00e9e' && String(r.client_confirmation||'').trim()!=='confirm\u00e9e') {
      /* Flag if been waiting more than threshold */
      if (hoursAgo(r.completed_at||r.accepted_at) > COMPLETE_WAIT_H) return BLOCK_WAIT_VALID;
    }
    /* Stale accepted (not started) */
    if (st==='accept\u00e9e' && hoursAgo(r.accepted_at) > ACCEPTED_STALE_H) return BLOCK_STALE_ACCEPT;
    /* Suspended artisan */
    if (r.assigned_artisan && modMap) {
      var artId = String(r.assigned_artisan_id||r.assigned_artisan||'').toLowerCase();
      var isSuspended = Object.values(modMap).some(function(p) {
        return (p.moderation_status==='suspended'||p.moderation_status==='hidden') &&
          (String(p.id||'').toLowerCase()===artId || String(p.name||'').toLowerCase()===artId);
      });
      if (isSuspended) return BLOCK_SUSPENDED;
    }
    return BLOCK_NONE;
  }

  /* Read moderation patches for cross-ref */
  function readModMap() {
    try { return JSON.parse(localStorage.getItem('fixeo_artisan_moderation')||'{}'); } catch(e){ return {}; }
  }

  /* ── Compute supervision metrics ─────────────────────────── */
  function computeMetrics() {
    var reqs = readReqs();
    var modMap = readModMap();
    var m = {
      total:0, nouvelle:0, acceptee:0, enCours:0, terminee:0, validee:0, cancelled:0,
      commDue:0, needsAttention:0, pendingReview:0,
      artisans:{}, /* name → {active, validated, commDue, phone, city} */
      blockedIds: {}
    };
    reqs.forEach(function(r) {
      m.total++;
      var st = normSt(r.status);
      if (st==='nouvelle') m.nouvelle++;
      else if (st==='accept\u00e9e') m.acceptee++;
      else if (st==='en_cours') m.enCours++;
      else if (st==='termin\u00e9e') m.terminee++;
      else if (st==='valid\u00e9e') m.validee++;
      else if (st==='annul\u00e9e') m.cancelled++;

      /* Commission */
      var ca = roundMoney(r.commission_amount||0);
      var fp = deriveFP(r);
      var isPaid = r.commission_paid===true||String(r.commission_status||'').trim()==='pay\u00e9e';
      if (!isPaid && (st==='valid\u00e9e') && !r.commission_pending_review) {
        m.commDue += ca>0?ca:roundMoney(fp*COMMISSION_RATE);
      }
      if (r.commission_pending_review===true) m.pendingReview++;

      /* Blocked detection */
      var block = detectBlock(r, modMap);
      if (block) {
        m.needsAttention++;
        m.blockedIds[String(r.id||'')] = block;
      }

      /* Artisan workload */
      var aName = String(r.assigned_artisan||'').trim();
      if (aName && st!=='nouvelle' && st!=='annul\u00e9e') {
        if (!m.artisans[aName]) {
          m.artisans[aName] = { name:aName, active:0, validated:0, commDue:0, phone:r.phone||'', city:r.city||'', id:r.assigned_artisan_id||'' };
        }
        var aw = m.artisans[aName];
        if (st==='accept\u00e9e'||st==='en_cours'||st==='termin\u00e9e') aw.active++;
        if (st==='valid\u00e9e') {
          aw.validated++;
          if (!isPaid) aw.commDue += ca>0?ca:roundMoney(fp*COMMISSION_RATE);
        }
      }
    });
    return m;
  }

  /* ── Active filter state ─────────────────────────────────── */
  var _filter = 'all';
  var _query  = '';

  /* ════════════════════════════════════════════════════════
     INJECT SIDEBAR LINK + SECTION
     ════════════════════════════════════════════════════════ */

  function injectSidebarLink() {
    if (el('sidebar-missions-link')) return;
    /* Insert after cod-orders link */
    var codLink = el('sidebar-cod-link');
    if (!codLink) return;
    var a = document.createElement('a');
    a.id = 'sidebar-missions-link';
    a.className = 'sidebar-link';
    a.setAttribute('onclick', "adminSection('missions')");
    a.innerHTML = '<span class="icon">\ud83d\udccb</span><span>Supervision missions</span>'
      + '<span class="sidebar-count" id="sc-missions" style="display:none">0</span>';
    codLink.insertAdjacentElement('afterend', a);
  }

  function injectSectionShell() {
    if (el('admin-section-missions')) return;
    /* Insert after overview section */
    var overviewSection = el('admin-section-overview');
    if (!overviewSection) return;
    var div = document.createElement('div');
    div.id = 'admin-section-missions';
    div.style.display = 'none';
    overviewSection.insertAdjacentElement('afterend', div);
  }

  /* ════════════════════════════════════════════════════════
     RENDER SUPERVISION SECTION
     ════════════════════════════════════════════════════════ */

  function render() {
    var section = el('admin-section-missions');
    if (!section || section.style.display==='none') {
      /* Still update sidebar count even when section hidden */
      _updateSidebarCount();
      return;
    }

    var m = computeMetrics();
    _updateSidebarCount(m);

    section.innerHTML = [
      _renderHeader(),
      _renderKpiStrip(m),
      _renderPipeline(m),
      _renderFilterBar(m),
      '<div id="fxams3-search-wrap" style="margin-bottom:12px">'
        + '<input id="fxams3-search" type="text" placeholder="Artisan, ville, service, r\u00e9f\u00e9rence\u2026" autocomplete="off">'
        + '</div>',
      '<div id="fxams3-missions-grid"></div>',
      _renderWorkload(m)
    ].join('');

    _populateMissions(m);
    _bindFilterEvents();
  }

  /* ── Header ──────────────────────────────────────────────── */
  function _renderHeader() {
    return '<div id="fxams3-section-header">'
      + '<div><h2>Supervision des missions</h2>'
      + '<p>Op\u00e9rations marketplace en temps r\u00e9el &mdash; source: fixeo_client_requests</p></div>'
      + '<button class="btn btn-sm btn-secondary" id="fxams3-refresh-btn">&#x21bb; Actualiser</button>'
      + '</div>';
  }

  /* ── KPI strip ───────────────────────────────────────────── */
  function _renderKpiStrip(m) {
    var items = [
      { v:m.nouvelle,      label:'Nouvelles',         cls:'col-amber'   },
      { v:m.acceptee,      label:'Assign\u00e9es',     cls:'col-blue'    },
      { v:m.enCours,       label:'En cours',           cls:'col-purple'  },
      { v:m.terminee,      label:'Termin\u00e9es',     cls:'col-teal'    },
      { v:m.validee,       label:'Valid\u00e9es',      cls:'col-green'   },
      { v:m.needsAttention,label:'Attention',          cls:'col-pink'    },
      { v:m.commDue>0?formatMoney(m.commDue):m.commDue===0?'—':formatMoney(m.commDue), label:'Commissions dues', cls:'col-amber' }
    ];
    var html = '<div id="fxams3-kpi-strip">';
    items.forEach(function(item, i) {
      if (i>0) html += '<div class="fxams3-kpi-divider"></div>';
      html += '<div class="fxams3-kpi ' + item.cls + '">'
        + '<div class="fxams3-kpi-value">' + esc(String(item.v||'0')) + '</div>'
        + '<div class="fxams3-kpi-label">' + esc(item.label) + '</div>'
        + '</div>';
    });
    return html + '</div>';
  }

  /* ── Pipeline visualization ──────────────────────────────── */
  function _renderPipeline(m) {
    var stages = [
      { key:'nouvelle',   label:'Nouvelle',   count:m.nouvelle   },
      { key:'acceptee',   label:'Assign\u00e9e', count:m.acceptee  },
      { key:'en_cours',   label:'En cours',   count:m.enCours    },
      { key:'terminee',   label:'Termin\u00e9e', count:m.terminee  },
      { key:'validee',    label:'Valid\u00e9e',  count:m.validee   },
      { key:'a_verifier', label:'\u00c0 v\u00e9rifier', count:m.needsAttention }
    ];
    var html = '<div id="fxams3-pipeline">';
    stages.forEach(function(s) {
      var activeCls = _filter===s.key ? ' stage-active' : '';
      html += '<div class="fxams3-pipe-stage' + activeCls + '" data-stage="' + esc(s.key) + '" data-filter="' + esc(s.key) + '">'
        + '<div class="fxams3-pipe-dot"></div>'
        + '<div class="fxams3-pipe-count">' + (s.count>0?s.count:'·') + '</div>'
        + '<div class="fxams3-pipe-label">' + esc(s.label) + '</div>'
        + '</div>';
    });
    return html + '</div>';
  }

  /* ── Filter pills ────────────────────────────────────────── */
  function _renderFilterBar(m) {
    var filters = [
      { key:'all',        label:'Toutes',         cls:'active',       count:m.total       },
      { key:'nouvelle',   label:'Nouvelles',      cls:'active-amber', count:m.nouvelle    },
      { key:'acceptee',   label:'Assign\u00e9es', cls:'active-blue',  count:m.acceptee    },
      { key:'en_cours',   label:'En cours',       cls:'active-purple',count:m.enCours     },
      { key:'terminee',   label:'Termin\u00e9es', cls:'active-green', count:m.terminee    },
      { key:'validee',    label:'Valid\u00e9es',  cls:'active-green', count:m.validee     },
      { key:'a_verifier', label:'\u00c0 v\u00e9rifier', cls:'active-pink', count:m.needsAttention+m.pendingReview }
    ];
    var html = '<div id="fxams3-filter-bar">';
    filters.forEach(function(f) {
      var isActive = _filter===f.key;
      var activeCls = isActive ? ' '+(isActive ? f.cls : '') : '';
      html += '<button class="fxams3-pill' + activeCls + '" data-filter="' + esc(f.key) + '" data-active-cls="' + esc(f.cls) + '">'
        + esc(f.label) + '<span class="fxams3-pill-count">' + f.count + '</span>'
        + '</button>';
    });
    return html + '</div>';
  }

  /* ── Mission cards ───────────────────────────────────────── */
  function _populateMissions(m) {
    var grid = el('fxams3-missions-grid');
    if (!grid) return;

    var reqs = readReqs();
    var modMap = readModMap();

    /* Sort: blocked first, then newest first */
    reqs.sort(function(a,b) {
      var aBlock = m.blockedIds[String(a.id||'')];
      var bBlock = m.blockedIds[String(b.id||'')];
      if (aBlock&&!bBlock) return -1;
      if (!aBlock&&bBlock) return 1;
      /* Urgency second */
      var aUrg = String(a.urgency||'').toLowerCase().includes('urgent') ? 1 : 0;
      var bUrg = String(b.urgency||'').toLowerCase().includes('urgent') ? 1 : 0;
      if (aUrg!==bUrg) return bUrg-aUrg;
      /* Newest */
      return new Date(b.created_at||0) - new Date(a.created_at||0);
    });

    /* Apply filter */
    var visible = reqs.filter(function(r) {
      var st = normSt(r.status);
      var matchFilter = true;
      if (_filter==='nouvelle')   matchFilter = st==='nouvelle';
      else if (_filter==='acceptee')  matchFilter = st==='accept\u00e9e';
      else if (_filter==='en_cours')  matchFilter = st==='en_cours';
      else if (_filter==='terminee')  matchFilter = st==='termin\u00e9e';
      else if (_filter==='validee')   matchFilter = st==='valid\u00e9e';
      else if (_filter==='a_verifier')matchFilter = !!m.blockedIds[String(r.id||'')];

      if (!matchFilter) return false;

      if (_query) {
        var hay = [r.service||'',r.city||'',r.assigned_artisan||'',r.phone||'',String(r.id||'').slice(-6)].join(' ').toLowerCase();
        return hay.includes(_query);
      }
      return true;
    });

    if (visible.length === 0) {
      grid.innerHTML = '<div class="fxams3-empty">'
        + '<div class="fxams3-empty-icon">&#x1f50d;</div>'
        + '<div class="fxams3-empty-text">Aucune mission correspond aux filtres actifs.</div>'
        + '</div>';
      return;
    }

    grid.innerHTML = visible.map(function(r) { return _renderCard(r, m); }).join('');
  }

  /* ── Single mission card ─────────────────────────────────── */
  function _renderCard(r, m) {
    var st     = normSt(r.status);
    var block  = m.blockedIds[String(r.id||'')] || '';
    var refId  = String(r.id||'').slice(-6).toUpperCase();
    var fp     = deriveFP(r);
    var ca     = roundMoney(r.commission_amount||0);
    var isPaid = r.commission_paid===true||String(r.commission_status||'').trim()==='pay\u00e9e';
    var isUrg  = String(r.urgency||'').toLowerCase().includes('urgent');
    var artPhone = String(r.phone||'').trim(); /* Client phone on request */

    /* Status pill config */
    var pillMap = {
      'nouvelle'  : { cls:'pill-nouvelle',  icon:'\u25cf', label:'Nouvelle'      },
      'accept\u00e9e': { cls:'pill-acceptee', icon:'\u25cf', label:'Assign\u00e9e' },
      'en_cours'  : { cls:'pill-en_cours',   icon:'\u25cf', label:'En cours'      },
      'termin\u00e9e':{ cls:'pill-terminee',  icon:'\u25cf', label:'Termin\u00e9e' },
      'valid\u00e9e' : { cls:'pill-validee',   icon:'\u2713', label:'Valid\u00e9e'  },
      'annul\u00e9e' : { cls:'pill-suspendue', icon:'\u25cf', label:'Annul\u00e9e'  }
    };
    var pill = pillMap[st] || { cls:'pill-suspendue', icon:'\u25cf', label:st };
    var stCss = { 'nouvelle':'nouvelle','accept\u00e9e':'acceptee','en_cours':'en_cours','termin\u00e9e':'terminee','valid\u00e9e':'validee','annul\u00e9e':'suspendue' };

    /* Block banner */
    var blockBanner = '';
    if (block===BLOCK_STALE_ACCEPT) {
      blockBanner = '<div class="fxams3-alert-banner alert-attention">\u23f3 Accept\u00e9e &mdash; pas encore d\u00e9marr\u00e9e &mdash; \u00e0 suivre</div>';
    } else if (block===BLOCK_WAIT_VALID) {
      blockBanner = '<div class="fxams3-alert-banner alert-attention">\u23f3 Validation client en attente</div>';
    } else if (block===BLOCK_REVIEW_REQ) {
      blockBanner = '<div class="fxams3-alert-banner alert-blocked">\u29d7 Commission \u00e0 \u00e9valuer &mdash; montant manquant</div>';
    } else if (block===BLOCK_SUSPENDED) {
      blockBanner = '<div class="fxams3-alert-banner alert-blocked">\u26d4 Artisan suspendu &mdash; mission en cours</div>';
    }

    /* WA buttons (client phone from request) */
    var waClientUrl = buildWALink(artPhone, 'le client', 'Nous souhaitons confirmer votre demande de service.');
    var waClientBtn = waClientUrl
      ? '<button class="fxams3-act-btn wa-client" data-act="wa" data-url="' + esc(waClientUrl) + '">Client WA</button>'
      : '';

    /* WA artisan — lookup from missions or artisans store */
    var artWaBtn = '';
    var artName = String(r.assigned_artisan||'').trim();
    if (artName) {
      /* Try FixeoDB */
      var artPhone2 = '';
      if (window.FixeoDB&&typeof window.FixeoDB.getAllArtisans==='function') {
        var arts = window.FixeoDB.getAllArtisans();
        var found = arts.find(function(a){ return a.name&&a.name.toLowerCase()===artName.toLowerCase(); });
        if (found) artPhone2 = String(found.phone||'').trim();
      }
      if (!artPhone2) artPhone2 = String(r.artisan_phone||'').trim();
      var waArtUrl = buildWALink(artPhone2, artName, 'Concernant une intervention en cours sur Fixeo.');
      if (waArtUrl) artWaBtn = '<button class="fxams3-act-btn wa-artisan" data-act="wa" data-url="' + esc(waArtUrl) + '">' + esc(artName.split(' ')[0]) + ' WA</button>';
    }

    /* Flag action */
    var flagBtn = !r.commission_pending_review
      ? '<button class="fxams3-act-btn btn-flag" data-act="flag-review" data-req-id="' + esc(String(r.id||'')) + '">\u29d7 Flaguer</button>'
      : '<button class="fxams3-act-btn" data-act="unflag-review" data-req-id="' + esc(String(r.id||'')) + '" style="color:rgba(255,255,255,0.35)">\u29d7 D\u00e9flaguer</button>';

    /* Commission state */
    var commStr = '';
    if (ca>0 && !isPaid && (st==='valid\u00e9e')) {
      commStr = '<span style="color:#ffa502;font-size:.72rem;font-weight:700">' + esc(ca.toLocaleString('fr-FR')+' MAD \u00e0 r\u00e9gler') + '</span>';
    } else if (isPaid) {
      commStr = '<span style="color:#20c997;font-size:.72rem;font-weight:700">\u2713 Commission pay\u00e9e</span>';
    } else if (r.commission_pending_review) {
      commStr = '<span style="color:#6c8ff5;font-size:.72rem;font-weight:700">\u29d7 \u00c0 \u00e9valuer</span>';
    }

    var blockedCls = block ? (block===BLOCK_SUSPENDED||block===BLOCK_REVIEW_REQ ? ' is-blocked' : ' is-attention') : '';

    return '<div class="fxams3-card status-' + esc(stCss[st]||'suspendue') + blockedCls + '" data-req-id="' + esc(String(r.id||'')) + '">'
      + blockBanner
      + '<div class="fxams3-card-head">'
        + '<div>'
          + '<div class="fxams3-card-ref">#' + esc(refId) + '</div>'
          + '<div class="fxams3-card-service">' + esc(r.service||'Service') + (isUrg?' <span style="color:#e1306c;font-size:.68rem">\u26a1 Urgent</span>':'') + '</div>'
          + '<div class="fxams3-card-city">\ud83d\udccd ' + esc(r.city||'Ville N/A') + '</div>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">'
          + '<span class="fxams3-status-pill ' + pill.cls + '">' + pill.label + '</span>'
          + (commStr ? '<div>' + commStr + '</div>' : '')
        + '</div>'
      + '</div>'
      + '<div class="fxams3-card-meta">'
        + (artName ? '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Artisan</div><div class="fxams3-meta-value">' + esc(artName) + '</div></div>' : '')
        + '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Cr\u00e9\u00e9</div><div class="fxams3-meta-value">' + fmtShort(r.created_at) + '</div></div>'
        + (r.accepted_at ? '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Accept\u00e9</div><div class="fxams3-meta-value">' + fmtShort(r.accepted_at) + '</div></div>' : '')
        + (r.completed_at ? '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Termin\u00e9</div><div class="fxams3-meta-value">' + fmtShort(r.completed_at) + '</div></div>' : '')
        + (r.validated_at ? '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Valid\u00e9</div><div class="fxams3-meta-value">' + fmtShort(r.validated_at) + '</div></div>' : '')
        + (fp>0 ? '<div class="fxams3-meta-item"><div class="fxams3-meta-label">Prix</div><div class="fxams3-meta-value">' + esc(fp.toLocaleString('fr-FR')+' MAD') + '</div></div>' : '')
      + '</div>'
      + '<div class="fxams3-card-actions">'
        + waClientBtn
        + artWaBtn
        + flagBtn
        + '<button class="fxams3-act-btn btn-refresh" data-act="refresh">\u21bb</button>'
      + '</div>'
    + '</div>';
  }

  /* ── Artisan workload section ────────────────────────────── */
  function _renderWorkload(m) {
    var artisans = Object.values(m.artisans);
    if (artisans.length === 0) return '';

    /* Sort by active missions desc */
    artisans.sort(function(a,b){ return (b.active+b.validated)-(a.active+a.validated); });
    /* Cap at 8 for readability */
    artisans = artisans.slice(0,8);

    var html = '<div id="fxams3-workload-section">'
      + '<div id="fxams3-workload-title">Charge artisans actifs</div>'
      + '<div id="fxams3-workload-grid">';

    artisans.forEach(function(a) {
      var waUrl = buildWALink(a.phone, a.name, 'Concernant vos missions sur Fixeo.');
      html += '<div class="fxams3-wl-card">'
        + '<div><div class="fxams3-wl-name">' + esc(a.name) + '</div>'
          + (a.city ? '<div class="fxams3-wl-city">\ud83d\udccd ' + esc(a.city) + '</div>' : '')
        + '</div>'
        + '<div class="fxams3-wl-badges">'
          + '<span class="fxams3-wl-badge b-active">' + a.active + ' actives</span>'
          + (a.validated>0 ? '<span class="fxams3-wl-badge b-validated">' + a.validated + ' valid\u00e9es</span>' : '')
          + (a.commDue>0 ? '<span class="fxams3-wl-badge b-comm">' + a.commDue.toLocaleString('fr-FR') + ' MAD dus</span>' : '')
        + '</div>'
        + (waUrl ? '<a href="' + esc(waUrl) + '" target="_blank" rel="noopener" class="fxams3-wl-wa">WA</a>' : '')
        + '</div>';
    });

    return html + '</div></div>';
  }

  /* ════════════════════════════════════════════════════════
     BIND EVENTS
     ════════════════════════════════════════════════════════ */

  function _bindFilterEvents() {
    /* Filter pills */
    document.querySelectorAll('#fxams3-filter-bar .fxams3-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _filter = btn.dataset.filter;
        /* Update pipeline active stage */
        document.querySelectorAll('.fxams3-pipe-stage').forEach(function(s){ s.classList.remove('stage-active'); });
        var pipeStage = document.querySelector('.fxams3-pipe-stage[data-stage="' + _filter + '"]');
        if (pipeStage) pipeStage.classList.add('stage-active');
        /* Update pill active class */
        document.querySelectorAll('.fxams3-pill').forEach(function(p) {
          var ac = p.dataset.activeCls||'active';
          ['active','active-amber','active-blue','active-purple','active-green','active-pink'].forEach(function(c){ p.classList.remove(c); });
          if (p.dataset.filter===_filter) p.classList.add(ac);
        });
        _populateMissions(computeMetrics());
      });
    });

    /* Pipeline stage click → filter */
    document.querySelectorAll('.fxams3-pipe-stage').forEach(function(s) {
      s.addEventListener('click', function() {
        var f = s.dataset.filter;
        _filter = f;
        document.querySelectorAll('.fxams3-pipe-stage').forEach(function(x){ x.classList.remove('stage-active'); });
        s.classList.add('stage-active');
        _populateMissions(computeMetrics());
      });
    });

    /* Search */
    var searchEl = el('fxams3-search');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        _query = searchEl.value.toLowerCase().trim();
        _populateMissions(computeMetrics());
      });
    }

    /* Refresh button */
    var refreshBtn = el('fxams3-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() { render(); });
    }

    /* Card actions (event delegation) */
    var grid = el('fxams3-missions-grid');
    if (grid) {
      grid.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act   = btn.dataset.act;
        var reqId = btn.dataset.reqId;
        var url   = btn.dataset.url;

        if (act==='wa' && url)             { window.open(url,'_blank','noopener'); return; }
        if (act==='refresh')               { render(); return; }
        if (act==='flag-review'   && reqId){ _writeReqPatch(reqId,{commission_pending_review:true});  _showToast('\u29d7 Mission flaggu\u00e9e pour \u00e9valuation','info'); render(); return; }
        if (act==='unflag-review' && reqId){ _writeReqPatch(reqId,{commission_pending_review:false}); _showToast('\u29d7 Flag retir\u00e9','success'); render(); return; }
      });
    }
  }

  /* Patch a request in fixeo_client_requests by id */
  function _writeReqPatch(id, patch) {
    try {
      var arr = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      var changed = false;
      var next = arr.map(function(r) {
        if (String(r.id||'')!==String(id)) return r;
        changed = true;
        return Object.assign({},r,patch);
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
        try{ window.dispatchEvent(new CustomEvent('fixeo:client-request-updated',{detail:{id:id}})); }catch(er){}
        try{ window.dispatchEvent(new CustomEvent('fixeo:commission-updated',{detail:{id:id}})); }catch(er){}
      }
    } catch(er){}
  }

  function _showToast(msg, type) {
    if (typeof window.showToast==='function') window.showToast(msg,type||'success');
  }

  /* ════════════════════════════════════════════════════════
     SIDEBAR COUNT
     ════════════════════════════════════════════════════════ */

  function _updateSidebarCount(m) {
    m = m || computeMetrics();
    var badge = el('sc-missions');
    if (!badge) return;
    var activeMissions = m.nouvelle + m.acceptee + m.enCours + m.terminee;
    badge.textContent = activeMissions;
    badge.style.display = activeMissions>0 ? 'inline-flex' : 'none';
    if (m.needsAttention>0) badge.classList.add('has-blocked');
    else badge.classList.remove('has-blocked');
  }

  /* ════════════════════════════════════════════════════════
     HOOK adminSection('missions')
     ════════════════════════════════════════════════════════ */

  function hookAdminSection() {
    /* admin.js adminSection() is defined at line 1275 — wait until ready */
    if (typeof window.adminSection === 'function' && !window.adminSection._p3Hooked) {
      var orig = window.adminSection;
      window.adminSection = function(section) {
        orig.apply(this, arguments);
        if (section==='missions') {
          var sec = el('admin-section-missions');
          if (sec) sec.style.display='block';
          /* Highlight sidebar link */
          document.querySelectorAll('.sidebar-link').forEach(function(l){ l.classList.remove('active'); });
          var lnk = el('sidebar-missions-link');
          if (lnk) lnk.classList.add('active');
          setTimeout(render, 50);
        }
      };
      window.adminSection._p3Hooked = true;
    } else if (!window.adminSection) {
      /* Poll */
      setTimeout(hookAdminSection, 100);
    }
  }

  /* ════════════════════════════════════════════════════════
     EVENT LISTENERS
     ════════════════════════════════════════════════════════ */

  function bindGlobalEvents() {
    var events = ['fixeo:client-request-updated','fixeo:missions:updated','fixeo:commission-updated','fixeo:artisan-status-updated','fixeo:state:updated'];
    events.forEach(function(ev) {
      window.addEventListener(ev, function() {
        _updateSidebarCount();
        var sec = el('admin-section-missions');
        if (sec && sec.style.display!=='none') setTimeout(render, 180);
      });
    });
    window.addEventListener('storage', function(e) {
      if (e.key===STORAGE_KEY||e.key==='fixeo_artisan_moderation') {
        _updateSidebarCount();
        var sec = el('admin-section-missions');
        if (sec && sec.style.display!=='none') setTimeout(render, 150);
      }
    });
    /* Passive refresh every 45s */
    setInterval(function() {
      _updateSidebarCount();
      var sec = el('admin-section-missions');
      if (sec && sec.style.display!=='none') render();
    }, 45000);
  }

  /* ════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════ */

  function init() {
    if (!_isAdmin()) return;
    setTimeout(function() {
      injectSidebarLink();
      injectSectionShell();
      hookAdminSection();
      _updateSidebarCount();
      bindGlobalEvents();
    }, 800);

    /* Safety pass */
    setTimeout(function() {
      injectSidebarLink();
      injectSectionShell();
      _updateSidebarCount();
    }, 2200);
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init,0); });
  } else {
    setTimeout(init,0);
  }

  /* Public refresh handle */
  window._fxAms3Refresh = function() {
    var sec = el('admin-section-missions');
    if (sec && sec.style.display!=='none') setTimeout(render, 80);
    else _updateSidebarCount();
  };

})();
