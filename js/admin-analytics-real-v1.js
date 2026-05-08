/* ============================================================
   FIXEO ADMIN — REAL ANALYTICS V1
   js/admin-analytics-real-v1.js

   OBJECTIVE: Real marketplace intelligence.
   Single source of truth: fixeo_client_requests

   Injects a dedicated 'Analyse marketplace' section in the admin sidebar.

   NEVER:
     - Fake KPIs / fake trends / fake charts / fake growth
     - Duplicate lifecycle renderers
     - Touch Supabase directly
     - Create polling-heavy architecture
     - Modify any existing file or system
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAraV1Loaded) return;
  window._fxAraV1Loaded = true;

  /* ── Admin page guard ────────────────────────────────────── */
  function _isAdmin() { return document.body && document.body.dataset.dashType === 'admin'; }
  if (!_isAdmin()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { if (_isAdmin()) _init(); });
    }
    return;
  }

  /* ── Constants ───────────────────────────────────────────── */
  var REQUESTS_KEY   = 'fixeo_client_requests';
  var COMMISSION_RATE = 0.15;

  /* Blocked-case thresholds (matching supervision P3) */
  var STALE_ACCEPT_H   = 48;
  var WAIT_VALIDATE_H  = 72;

  /* Minimum samples needed before showing a timing average */
  var MIN_TIMING_SAMPLES = 3;

  /* Known service categories (matches reservation.js SERVICE_MAP) */
  var SERVICE_CATS = [
    'plomberie', 'electricite', '\u00e9lectricit\u00e9', 'peinture', 'nettoyage',
    'jardinage', 'demenagement', 'd\u00e9m\u00e9nagement', 'bricolage',
    'climatisation', 'menuiserie', 'ma\u00e7onnerie', 'maconnerie',
    'serrurerie', 'carrelage', 'toiture'
  ];
  /* Canonical display labels */
  var SVC_LABELS = {
    plomberie     : 'Plomberie',
    'electricite' : '\u00c9lectricit\u00e9',
    '\u00e9lectricit\u00e9': '\u00c9lectricit\u00e9',
    peinture      : 'Peinture',
    nettoyage     : 'Nettoyage',
    jardinage     : 'Jardinage',
    demenagement  : 'D\u00e9m\u00e9nagement',
    'd\u00e9m\u00e9nagement': 'D\u00e9m\u00e9nagement',
    bricolage     : 'Bricolage',
    climatisation : 'Climatisation',
    menuiserie    : 'Menuiserie',
    maconnerie    : 'Ma\u00e7onnerie',
    'ma\u00e7onnerie': 'Ma\u00e7onnerie',
    serrurerie    : 'Serrurerie',
    carrelage     : 'Carrelage',
    toiture       : 'Toiture'
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function esc(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function safeJSON(s, fb) { try { var p=JSON.parse(s); return p==null?fb:p; } catch(e){ return fb; } }
  function fmtMAD(n) {
    var v = Math.round(Number(n||0));
    return v > 0 ? v.toLocaleString('fr-FR') + ' MAD' : '—';
  }
  function pct(a, b) {
    if (!b) return '—';
    return Math.round(a / b * 100) + '%';
  }
  function hoursAgo(iso) {
    if (!iso) return Infinity;
    try { return (Date.now() - new Date(iso).getTime()) / 3600000; } catch(e){ return Infinity; }
  }
  function hoursElapsed(fromIso, toIso) {
    if (!fromIso || !toIso) return null;
    try {
      var ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
      return ms > 0 ? ms / 3600000 : null;
    } catch(e){ return null; }
  }
  function fmtHours(h) {
    if (h === null || h === undefined) return null;
    if (h < 1) return 'Moins d\u2019une heure';
    if (h < 24) return Math.round(h) + 'h';
    var d = Math.round(h / 24);
    return d + (d > 1 ? ' jours' : ' jour');
  }
  function normSt(s) {
    var n = String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if (!n||n==='nouvelle'||n==='disponible') return 'nouvelle';
    if (n==='acceptee'||n==='accepte')        return 'accept\u00e9e';
    if (n==='en cours'||n==='en_cours'||n==='encours') return 'en_cours';
    if (n==='terminee'||n==='termine')        return 'termin\u00e9e';
    if (n==='validee'||n==='valide'||n==='intervention confirmee'||n==='intervention_confirmee') return 'valid\u00e9e';
    if (n==='annulee'||n==='annule')          return 'annul\u00e9e';
    return s||'nouvelle';
  }
  function normSvc(s) {
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }
  function normCity(s) {
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  /* ── Read requests ───────────────────────────────────────── */
  function _readReqs() {
    try {
      if (window.FixeoClientRequestsStore && typeof window.FixeoClientRequestsStore.list === 'function') return window.FixeoClientRequestsStore.list();
      return safeJSON(localStorage.getItem(REQUESTS_KEY), []);
    } catch(e){ return []; }
  }

  /* ── Derive commission amount ────────────────────────────── */
  function _commAmount(r) {
    var ca = Math.round(Number(r.commission_amount||0));
    if (ca > 0) return ca;
    /* Derive from final_price / price / budget */
    var fp = Math.round(Number(r.final_price||r.price||r.agreed_price||r.budget_value||0));
    if (fp > 0) return Math.round(fp * COMMISSION_RATE);
    return 0;
  }
  function _isPaid(r) {
    return r.commission_paid === true || String(r.commission_status||'').trim() === 'pay\u00e9e';
  }

  /* ═══════════════════════════════════════════════════════
     COMPUTE ANALYTICS
     ═══════════════════════════════════════════════════════ */

  function _compute() {
    var reqs = _readReqs();

    /* ── 1. Lifecycle counts ──────────────────────────────── */
    var counts = { nouvelle:0, acceptee:0, en_cours:0, terminee:0, validee:0, annulee:0, total:0, urgent:0 };
    reqs.forEach(function(r) {
      var st = normSt(r.status);
      counts.total++;
      if (st === 'nouvelle')      counts.nouvelle++;
      else if (st === 'accept\u00e9e')  counts.acceptee++;
      else if (st === 'en_cours')  counts.en_cours++;
      else if (st === 'termin\u00e9e')  counts.terminee++;
      else if (st === 'valid\u00e9e')   counts.validee++;
      else if (st === 'annul\u00e9e')   counts.annulee++;
      if (String(r.urgency||'').toLowerCase().includes('urgent')) counts.urgent++;
    });

    /* ── 2. Commission aggregates ─────────────────────────── */
    var comm = { due:0, paid:0, review:0, paidSum:0, dueSum:0, avgSamples:[], avgPerValidated:null };
    reqs.forEach(function(r) {
      var st = normSt(r.status);
      var ca = _commAmount(r);
      var paid = _isPaid(r);
      if (r.commission_pending_review===true && !paid) comm.review++;
      if (paid) { comm.paid++; if (ca>0) comm.paidSum += ca; }
      else if (st === 'valid\u00e9e' && ca > 0) { comm.due++; comm.dueSum += ca; }
      if (st === 'valid\u00e9e' && ca > 0) comm.avgSamples.push(ca);
    });
    if (comm.avgSamples.length >= MIN_TIMING_SAMPLES) {
      var sum = comm.avgSamples.reduce(function(a,b){ return a+b; }, 0);
      comm.avgPerValidated = Math.round(sum / comm.avgSamples.length);
    }

    /* ── 3. City analytics ────────────────────────────────── */
    var cityMap = {}; /* normCity → { label, requests, active, validated, commPaid } */
    reqs.forEach(function(r) {
      var rawCity = String(r.city||r.ville||'').trim();
      if (!rawCity) return;
      var k = normCity(rawCity);
      if (!cityMap[k]) cityMap[k] = { label:rawCity, requests:0, active:0, validated:0, commPaid:0 };
      var c = cityMap[k];
      var st = normSt(r.status);
      c.requests++;
      if (st==='accept\u00e9e'||st==='en_cours'||st==='termin\u00e9e') c.active++;
      if (st==='valid\u00e9e') { c.validated++; if (_isPaid(r)) c.commPaid += _commAmount(r); }
    });
    var cities = Object.values(cityMap).sort(function(a,b){ return b.requests-a.requests; });

    /* ── 4. Service analytics ─────────────────────────────── */
    var svcMap = {}; /* normSvc → { label, requests, accepted, validated, active } */
    reqs.forEach(function(r) {
      var rawSvc = String(r.service||r.probleme||'').trim();
      if (!rawSvc) return;
      /* Derive category from service string */
      var svcN = normSvc(rawSvc);
      var cat = null;
      SERVICE_CATS.forEach(function(c) {
        if (!cat && svcN.startsWith(c)) cat = c;
      });
      var catN = cat || svcN.split(' ')[0] || svcN;
      var label = SVC_LABELS[catN] || (rawSvc.length > 22 ? rawSvc.slice(0,20)+'\u2026' : rawSvc);
      var k = catN;
      if (!svcMap[k]) svcMap[k] = { label:label, requests:0, accepted:0, validated:0, active:0 };
      var s = svcMap[k];
      var st = normSt(r.status);
      s.requests++;
      if (st==='accept\u00e9e'||st==='en_cours'||st==='termin\u00e9e'||st==='valid\u00e9e') s.accepted++;
      if (st==='valid\u00e9e') s.validated++;
      if (st==='accept\u00e9e'||st==='en_cours') s.active++;
    });
    var services = Object.values(svcMap).sort(function(a,b){ return b.requests-a.requests; }).slice(0,12);

    /* ── 5. Response time analytics ───────────────────────── */
    var timing = { createToAccept:[], acceptToStart:[], completeToValidate:[] };
    reqs.forEach(function(r) {
      var h;
      h = hoursElapsed(r.created_at, r.accepted_at);  if (h !== null) timing.createToAccept.push(h);
      h = hoursElapsed(r.accepted_at, r.started_at);   if (h !== null) timing.acceptToStart.push(h);
      h = hoursElapsed(r.completed_at, r.validated_at);if (h !== null) timing.completeToValidate.push(h);
    });
    function avgH(arr) {
      if (arr.length < MIN_TIMING_SAMPLES) return null;
      return arr.reduce(function(a,b){return a+b;},0) / arr.length;
    }
    var timingAvg = {
      createToAccept   : avgH(timing.createToAccept),
      acceptToStart    : avgH(timing.acceptToStart),
      completeToValidate: avgH(timing.completeToValidate)
    };

    /* ── 6. Blocked cases ─────────────────────────────────── */
    var blocked = { staleAccepted:0, waitValidation:0, reviewRequired:0, noArtisanLong:0 };
    reqs.forEach(function(r) {
      var st = normSt(r.status);
      if (r.commission_pending_review===true && !_isPaid(r)) blocked.reviewRequired++;
      if (st==='accept\u00e9e' && hoursAgo(r.accepted_at) > STALE_ACCEPT_H)                    blocked.staleAccepted++;
      if (st==='termin\u00e9e' && hoursAgo(r.completed_at||r.accepted_at) > WAIT_VALIDATE_H
          && String(r.client_confirmation||'').trim()!=='confirm\u00e9e') blocked.waitValidation++;
      if (st==='nouvelle' && hoursAgo(r.created_at) > STALE_ACCEPT_H) blocked.noArtisanLong++;
    });

    /* ── 7. Urgency split ─────────────────────────────────── */
    var urgentCount  = counts.urgent;
    var normalCount  = counts.total - urgentCount;

    return { counts, comm, cities, services, timingAvg, blocked, urgentCount, normalCount, total: counts.total };
  }

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  function _render() {
    var section = el('admin-section-analytics');
    if (!section || section.style.display === 'none') {
      _updateSidebarCount();
      return;
    }

    var d = _compute();
    _updateSidebarCount(d);

    section.innerHTML = [
      _renderHeader(d),
      _renderKpiGrid(d),
      '<div class="fxara-row">',
        _renderFunnel(d),
        _renderCommissions(d),
      '</div>',
      '<div class="fxara-row">',
        _renderCities(d),
        _renderServices(d),
      '</div>',
      '<div class="fxara-row">',
        _renderTiming(d),
        _renderBlocked(d),
      '</div>',
      _renderUrgency(d),
    ].join('');

    /* Animate bars after paint */
    requestAnimationFrame(function() { _animateBars(); });
  }

  /* ── Header ──────────────────────────────────────────────── */
  function _renderHeader(d) {
    return '<div id="fxara-header">'
      + '<div><h2>Analyse marketplace</h2>'
      + '<p>Donn\u00e9es op\u00e9rationnelles en temps r\u00e9el \u2014 source\u00a0: fixeo_client_requests (' + d.total + ' demandes)</p></div>'
      + '<button class="btn btn-sm btn-secondary" id="fxara-refresh-btn">&#x21bb; Actualiser</button>'
      + '</div>';
  }

  /* ── KPI grid (11 KPIs) ──────────────────────────────────── */
  function _renderKpiGrid(d) {
    var c = d.counts;
    var items = [
      { v:c.total,    label:'Total demandes',   cls:'c-default' },
      { v:c.nouvelle, label:'Nouvelles',         cls:'c-amber'   },
      { v:c.acceptee, label:'Assign\u00e9es',    cls:'c-blue'    },
      { v:c.en_cours, label:'En cours',          cls:'c-purple'  },
      { v:c.terminee, label:'Termin\u00e9es',    cls:'c-teal'    },
      { v:c.validee,  label:'Valid\u00e9es',     cls:'c-green'   },
      { v:c.annulee,  label:'Annul\u00e9es',     cls:'c-grey'    },
      { v:d.urgentCount, label:'Urgentes',       cls:'c-pink'    },
      { v:d.comm.due,    label:'Comm. \u00e0 r\u00e9gler', cls:'c-orange' },
      { v:d.comm.paid,   label:'Comm. r\u00e9gl\u00e9es', cls:'c-green'  },
      { v:d.comm.review, label:'\u00c0 \u00e9valuer',     cls:'c-blue'   }
    ];
    var html = '<div id="fxara-kpi-grid">';
    items.forEach(function(item) {
      html += '<div class="fxara-kpi ' + item.cls + '">'
        + '<div class="fxara-kpi-value">' + esc(String(item.v||'0')) + '</div>'
        + '<div class="fxara-kpi-label">' + esc(item.label) + '</div>'
        + '</div>';
    });
    return html + '</div>';
  }

  /* ── Conversion funnel ───────────────────────────────────── */
  function _renderFunnel(d) {
    var c = d.counts;
    var steps = [
      { label:'Demand\u00e9es',  count: c.total,    step:0 },
      { label:'Assign\u00e9es',  count: c.acceptee + c.en_cours + c.terminee + c.validee, step:1 },
      { label:'D\u00e9marr\u00e9es', count: c.en_cours + c.terminee + c.validee, step:2 },
      { label:'Termin\u00e9es',  count: c.terminee + c.validee, step:3 },
      { label:'Valid\u00e9es',   count: c.validee,  step:4 }
    ];
    var maxV = steps[0].count || 1;
    var html = '<div class="fxara-card"><div class="fxara-card-title">Entonnoir de conversion</div>'
      + (c.total === 0 ? _emptyState('Pas encore de demandes', 'L\u2019entonnoir appara\u00eetra avec les premi\u00e8res demandes')
        : '<div id="fxara-funnel-wrap">');
    if (c.total > 0) {
      steps.forEach(function(s, i) {
        var widthPct = Math.max(4, Math.round(s.count / maxV * 100));
        var dropPct  = '';
        if (i > 0 && steps[i-1].count > 0) {
          var dropped = steps[i-1].count - s.count;
          if (dropped > 0) dropPct = '<span class="fxara-funnel-drop">\u2212' + dropped + '</span>';
        }
        html += '<div class="fxara-funnel-step" data-step="' + s.step + '">'
          + '<div class="fxara-funnel-bar-wrap" data-target-width="' + widthPct + '">'
            + '<div class="fxara-funnel-bar" style="width:0%"></div>'
            + '<span class="fxara-funnel-label">' + esc(s.label) + dropPct + '</span>'
          + '</div>'
          + '<span class="fxara-funnel-count">' + s.count + '</span>'
          + '<span class="fxara-funnel-pct">' + (i===0 ? '100%' : pct(s.count, steps[0].count)) + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ── Commission analytics ────────────────────────────────── */
  function _renderCommissions(d) {
    var cm = d.comm;
    var items = [
      { v:fmtMAD(cm.dueSum),  label:'Commissions dues',    cls:'ci-due'    },
      { v:fmtMAD(cm.paidSum), label:'Commissions r\u00e9gl\u00e9es', cls:'ci-paid'  },
      { v:String(cm.review),  label:'\u00c0 \u00e9valuer',            cls:'ci-review'},
      { v:cm.avgPerValidated !== null ? fmtMAD(cm.avgPerValidated) : 'Donn\u00e9es insuffisantes',
        label:'Moy. / mission valid\u00e9e', cls:'ci-avg' },
      { v:'15%', label:'Taux de commission', cls:'ci-rate' }
    ];
    var html = '<div class="fxara-card"><div class="fxara-card-title">Commissions</div>'
      + '<div class="fxara-comm-grid">';
    items.forEach(function(item) {
      html += '<div class="fxara-comm-item ' + item.cls + '">'
        + '<div class="fxara-comm-value">' + esc(item.v) + '</div>'
        + '<div class="fxara-comm-label">' + esc(item.label) + '</div>'
        + '</div>';
    });
    return html + '</div></div>';
  }

  /* ── City analytics ──────────────────────────────────────── */
  function _renderCities(d) {
    var cities = d.cities.slice(0, 10);
    var maxR = cities.length ? cities[0].requests : 1;
    var html = '<div class="fxara-card"><div class="fxara-card-title">R\u00e9partition par ville</div>';
    if (!cities.length) {
      html += _emptyState('Pas encore de donn\u00e9es', 'Les villes appara\u00eetront avec les premi\u00e8res demandes');
    } else {
      html += '<div class="fxara-hbar-list">';
      cities.forEach(function(c) {
        var w = Math.max(4, Math.round(c.requests / maxR * 100));
        html += '<div class="fxara-hbar-row">'
          + '<span class="fxara-hbar-name" title="' + esc(c.label) + '">' + esc(c.label) + '</span>'
          + '<div class="fxara-hbar-track"><div class="fxara-hbar-fill" data-target-width="' + w + '" style="width:0%"></div></div>'
          + '<span class="fxara-hbar-value">' + c.requests + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ── Service analytics ───────────────────────────────────── */
  function _renderServices(d) {
    var svcs = d.services.slice(0, 10);
    var maxR = svcs.length ? svcs[0].requests : 1;
    var html = '<div class="fxara-card"><div class="fxara-card-title">Services les plus demand\u00e9s</div>';
    if (!svcs.length) {
      html += _emptyState('Pas encore de donn\u00e9es', 'Les services appara\u00eetront avec les premi\u00e8res demandes');
    } else {
      html += '<div class="fxara-hbar-list">';
      svcs.forEach(function(s, i) {
        var w = Math.max(4, Math.round(s.requests / maxR * 100));
        var altCls = i % 3 === 1 ? ' alt' : (i % 3 === 2 ? ' alt2' : '');
        html += '<div class="fxara-hbar-row">'
          + '<span class="fxara-hbar-name" title="' + esc(s.label) + '">' + esc(s.label) + '</span>'
          + '<div class="fxara-hbar-track"><div class="fxara-hbar-fill' + altCls + '" data-target-width="' + w + '" style="width:0%"></div></div>'
          + '<span class="fxara-hbar-value">' + s.requests + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ── Response timing ─────────────────────────────────────── */
  function _renderTiming(d) {
    var t = d.timingAvg;
    var rows = [
      { label:'Demande \u2192 Artisan assign\u00e9', val: t.createToAccept },
      { label:'Assign\u00e9 \u2192 Intervention d\u00e9marr\u00e9e', val: t.acceptToStart },
      { label:'Termin\u00e9 \u2192 Validation client', val: t.completeToValidate }
    ];
    var html = '<div class="fxara-card"><div class="fxara-card-title">D\u00e9lais op\u00e9rationnels (moy.)</div>'
      + '<div class="fxara-timing-table">';
    rows.forEach(function(row) {
      var formatted = fmtHours(row.val);
      var insufficient = formatted === null;
      html += '<div class="fxara-timing-row">'
        + '<span class="fxara-timing-label">' + esc(row.label) + '</span>'
        + '<span class="fxara-timing-value' + (insufficient?' insufficient':'') + '">'
          + (insufficient ? 'Donn\u00e9es insuffisantes' : esc(formatted))
        + '</span></div>';
    });
    return html + '</div></div>';
  }

  /* ── Blocked cases ───────────────────────────────────────── */
  function _renderBlocked(d) {
    var b = d.blocked;
    var items = [
      { label:'Accept\u00e9es \u2014 pas d\u00e9marr\u00e9es (> 48h)', count:b.staleAccepted,  dotCls:'dot-attention', cntCls:'cnt-attention' },
      { label:'Termin\u00e9es \u2014 validation en attente (> 72h)', count:b.waitValidation, dotCls:'dot-attention', cntCls:'cnt-attention' },
      { label:'Nouvelles sans artisan (> 48h)',                       count:b.noArtisanLong, dotCls:'dot-info',      cntCls:'cnt-info' },
      { label:'Commissions \u00e0 \u00e9valuer',                       count:b.reviewRequired,dotCls:'dot-danger',    cntCls:'cnt-danger'   }
    ];
    var total = items.reduce(function(a,x){return a+x.count;},0);
    var html = '<div class="fxara-card"><div class="fxara-card-title">Cas \u00e0 surveiller</div>';
    if (total === 0) {
      html += _emptyState('\u2705 Aucun cas bloqu\u00e9', 'Le marketplace fonctionne normalement', '');
    } else {
      html += '<div class="fxara-blocked-list">';
      items.forEach(function(item) {
        html += '<div class="fxara-blocked-row">'
          + '<div class="fxara-blocked-dot ' + item.dotCls + '"></div>'
          + '<span class="fxara-blocked-label">' + esc(item.label) + '</span>'
          + '<span class="fxara-blocked-count ' + item.cntCls + '">' + item.count + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ── Urgency split ───────────────────────────────────────── */
  function _renderUrgency(d) {
    if (d.total === 0) return '';
    var html = '<div class="fxara-row row-full" style="margin-top:4px">'
      + '<div class="fxara-card"><div class="fxara-card-title">R\u00e9partition urgence</div>'
      + '<div class="fxara-urgency-row">'
      + '<span class="fxara-urgency-pill pill-urgent">\u26a1 Urgentes'
        + '<span class="fxara-urgency-pill-count">' + d.urgentCount + '</span></span>'
      + '<span class="fxara-urgency-pill pill-normal">\ud83d\udcc5 Planifi\u00e9es'
        + '<span class="fxara-urgency-pill-count">' + d.normalCount + '</span></span>'
      + (d.total > 0 ? '<span style="color:rgba(255,255,255,0.28);font-size:0.74rem">'
          + pct(d.urgentCount, d.total) + ' d\u2019urgences</span>' : '')
      + '</div></div></div>';
    return html;
  }

  /* ── Empty state helper ──────────────────────────────────── */
  function _emptyState(title, sub, icon) {
    icon = icon !== undefined ? icon : '\ud83d\udcca';
    return '<div class="fxara-empty">'
      + (icon ? '<div class="fxara-empty-icon">' + esc(icon) + '</div>' : '')
      + '<div class="fxara-empty-title">' + esc(title) + '</div>'
      + '<div class="fxara-empty-sub">' + esc(sub) + '</div>'
      + '</div>';
  }

  /* ── Animate bars ────────────────────────────────────────── */
  function _animateBars() {
    /* Funnel bars */
    document.querySelectorAll('#admin-section-analytics .fxara-funnel-bar-wrap').forEach(function(wrap) {
      var bar = wrap.querySelector('.fxara-funnel-bar');
      var target = wrap.getAttribute('data-target-width');
      if (bar && target) {
        requestAnimationFrame(function() {
          bar.style.width = target + '%';
        });
      }
    });
    /* Horizontal bars */
    document.querySelectorAll('#admin-section-analytics .fxara-hbar-fill').forEach(function(fill) {
      var target = fill.getAttribute('data-target-width');
      if (target) {
        requestAnimationFrame(function() {
          fill.style.width = target + '%';
        });
      }
    });
  }

  /* ── Sidebar count ───────────────────────────────────────── */
  function _updateSidebarCount(d) {
    d = d || _compute();
    var badge = el('sc-analytics');
    if (!badge) return;
    var total = d.total || 0;
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }

  /* ═══════════════════════════════════════════════════════
     INJECT SIDEBAR LINK + SECTION SHELL
     ═══════════════════════════════════════════════════════ */

  function _injectSidebarLink() {
    if (el('sidebar-analytics-link')) return;
    /* Insert after Supervision missions link (sidebar-missions-link) or after cod-orders link */
    var anchor = el('sidebar-missions-link') || el('sidebar-cod-link');
    if (!anchor) return;
    var a = document.createElement('a');
    a.id = 'sidebar-analytics-link';
    a.className = 'sidebar-link';
    a.setAttribute('onclick', "adminSection('analytics')");
    a.innerHTML = '<span class="icon">\ud83d\udcca</span><span>Analyse marketplace</span>'
      + '<span class="sidebar-count" id="sc-analytics" style="display:none">0</span>';
    anchor.insertAdjacentElement('afterend', a);
  }

  function _injectSectionShell() {
    if (el('admin-section-analytics')) return;
    /* Insert after admin-section-missions or admin-section-overview */
    var anchor = el('admin-section-missions') || el('admin-section-overview');
    if (!anchor) return;
    var div = document.createElement('div');
    div.id = 'admin-section-analytics';
    div.style.display = 'none';
    anchor.insertAdjacentElement('afterend', div);
  }

  /* ═══════════════════════════════════════════════════════
     HOOK adminSection('analytics')
     ═══════════════════════════════════════════════════════ */

  function _hookAdminSection() {
    if (typeof window.adminSection === 'function' && !window.adminSection._araHooked) {
      var orig = window.adminSection;
      window.adminSection = function(section) {
        orig.apply(this, arguments);
        if (section === 'analytics') {
          var sec = el('admin-section-analytics');
          if (sec) sec.style.display = 'block';
          document.querySelectorAll('.sidebar-link').forEach(function(l){ l.classList.remove('active'); });
          var lnk = el('sidebar-analytics-link');
          if (lnk) lnk.classList.add('active');
          setTimeout(_render, 50);
        }
      };
      window.adminSection._araHooked = true;
      /* Preserve P3 hook flag so future hooks can still chain */
      if (orig._p3Hooked) window.adminSection._p3Hooked = true;
    } else if (!window.adminSection) {
      setTimeout(_hookAdminSection, 100);
    }
  }

  /* ── Refresh button ──────────────────────────────────────── */
  function _bindRefreshBtn() {
    var section = el('admin-section-analytics');
    if (!section) return;
    section.addEventListener('click', function(e) {
      var btn = e.target.closest('#fxara-refresh-btn');
      if (btn) _render();
    });
  }

  /* ═══════════════════════════════════════════════════════
     EVENT LISTENERS
     ═══════════════════════════════════════════════════════ */

  function _bindEvents() {
    var EVENTS = [
      'fixeo:client-request-created',
      'fixeo:client-request-updated',
      'fixeo:missions:updated',
      'fixeo:commission-updated',
      'fixeo:commission-paid',
      'fixeo:artisan-status-updated',
      'fixeo:state:updated'
    ];
    EVENTS.forEach(function(ev) {
      window.addEventListener(ev, function() {
        _updateSidebarCount();
        var sec = el('admin-section-analytics');
        if (sec && sec.style.display !== 'none') setTimeout(_render, 200);
      });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === REQUESTS_KEY) {
        _updateSidebarCount();
        var sec = el('admin-section-analytics');
        if (sec && sec.style.display !== 'none') setTimeout(_render, 180);
      }
    });
    /* Passive refresh 60s */
    setInterval(function() {
      _updateSidebarCount();
      var sec = el('admin-section-analytics');
      if (sec && sec.style.display !== 'none') _render();
    }, 60000);
  }

  /* ═══════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════ */

  function _init() {
    if (!_isAdmin()) return;
    setTimeout(function() {
      _injectSidebarLink();
      _injectSectionShell();
      _hookAdminSection();
      _bindRefreshBtn();
      _updateSidebarCount();
      _bindEvents();
    }, 900);
    /* Safety pass */
    setTimeout(function() {
      _injectSidebarLink();
      _injectSectionShell();
      _updateSidebarCount();
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_init, 0); });
  } else {
    setTimeout(_init, 0);
  }

  /* Public API */
  window._fxAraV1Refresh = function() {
    var sec = el('admin-section-analytics');
    if (sec && sec.style.display !== 'none') setTimeout(_render, 80);
    else _updateSidebarCount();
  };
  window._fxAraV1Compute = _compute; /* exposed for external inspection/testing */

})();
