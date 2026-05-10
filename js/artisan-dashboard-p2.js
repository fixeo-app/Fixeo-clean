/* ============================================================
   FIXEO — ARTISAN DASHBOARD PHASE 2 — PREMIUM ACTIVATION COCKPIT
   js/artisan-dashboard-p2.js

   Builds on Phase 1 clean state. Adds premium cockpit UX:
   - Hero header with real identity + score ring
   - Readiness checklist (real fields only)
   - Next best action cards
   - Visibility system explainer
   - Premium requests empty state with zone pills
   - Premium availability selector (localStorage-persisted)
   - Premium portfolio empty state

   Guard: window._fxAdP2Loaded (idempotent)
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAdP2Loaded) return;
  window._fxAdP2Loaded = true;

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function qs(sel)  { return document.querySelector(sel); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function ls(k,fb) { try { return localStorage.getItem(k) || fb; } catch(e){ return fb; } }
  function lsSet(k,v) { try { localStorage.setItem(k,v); } catch(e){} }

  /* ── Profile (real data from localStorage / Supabase session) */
  function getProfile() {
    return {
      name:  ls('user_name', ls('fixeo_user_name', '')),
      city:  ls('user_city',  ''),
      job:   ls('user_job',   ''),
      phone: ls('user_phone', ''),
      email: ls('fixeo_user', ''),
      photo: ls('user_avatar',''),
      desc:  ls('user_description','')
    };
  }

  /* ── Readiness items ─────────────────────────────────── */
  function buildReadinessItems(p) {
    var hasPortfolio = false;
    try { hasPortfolio = JSON.parse(localStorage.getItem('fixeo_portfolio')||'[]').length > 0; } catch(e){}
    var hasAvail = ls('fixeo_avail_status','') !== '';
    var hasDesc  = !!(p.desc && p.desc.trim().length > 10);

    return [
      {
        id: 'name',
        label: 'Nom complet',
        benefit: 'Votre identit\u00e9 aupr\u00e8s des clients',
        done: !!(p.name && p.name.trim().length > 1),
        action: "showSection('settings')",
        actionLabel: 'Compl\u00e9ter'
      },
      {
        id: 'job',
        label: 'M\u00e9tier / sp\u00e9cialit\u00e9',
        benefit: 'D\u00e9termine quelles demandes vous recevez',
        done: !!(p.job && p.job.trim().length > 1),
        action: "showSection('settings')",
        actionLabel: 'D\u00e9finir'
      },
      {
        id: 'city',
        label: 'Ville d\u2019intervention',
        benefit: 'Limite les demandes \u00e0 votre zone',
        done: !!(p.city && p.city.trim().length > 1),
        action: "showSection('settings')",
        actionLabel: 'D\u00e9finir'
      },
      {
        id: 'phone',
        label: 'T\u00e9l\u00e9phone / WhatsApp',
        benefit: 'Canal de contact pour les demandes',
        done: !!(p.phone && p.phone.replace(/\D/g,'').length >= 9),
        action: "showSection('settings')",
        actionLabel: 'Ajouter'
      },
      {
        id: 'desc',
        label: 'Description courte',
        benefit: 'Donne confiance aux clients potentiels',
        done: hasDesc,
        action: "showSection('settings')",
        actionLabel: 'R\u00e9diger'
      },
      {
        id: 'portfolio',
        label: 'Premi\u00e8re r\u00e9alisation',
        benefit: 'Les photos de travaux augmentent les demandes',
        done: hasPortfolio,
        action: "showSection('portfolio')",
        actionLabel: 'Ajouter'
      },
      {
        id: 'avail',
        label: 'Disponibilit\u00e9 d\u00e9finie',
        benefit: 'Montre que vous \u00eates actif sur la plateforme',
        done: hasAvail,
        action: null,
        actionLabel: null
      }
    ];
  }

  function getPct(items) {
    return Math.round(items.filter(function(i){ return i.done; }).length / items.length * 100);
  }

  function getReadinessLabel(pct) {
    if (pct >= 86) return { cls: 'high', text: 'Profil complet' };
    if (pct >= 50) return { cls: 'mid',  text: 'En progression' };
    return           { cls: 'low',  text: 'Profil incomplet' };
  }

  /* ── SVG score ring ──────────────────────────────────── */
  function buildScoreRingSVG(pct) {
    var r = 26;
    var circ = 2 * Math.PI * r;
    var offset = circ - (pct / 100) * circ;
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">'
      + '<stop offset="0%" style="stop-color:#E1306C"/>'
      + '<stop offset="100%" style="stop-color:#833AB4"/>'
      + '</linearGradient></defs>'
      + '<circle class="fxadp2-score-ring-track" cx="32" cy="32" r="' + r + '"/>'
      + '<circle class="fxadp2-score-ring-fill" cx="32" cy="32" r="' + r + '"'
      + ' stroke-dasharray="' + circ.toFixed(1) + '"'
      + ' stroke-dashoffset="' + offset.toFixed(1) + '"'
      + ' style="stroke-dashoffset:' + circ.toFixed(1) + '"'
      + ' data-target="' + offset.toFixed(1) + '"/>'
      + '</svg>'
      + '<div class="fxadp2-score-label">'
      + '<span class="fxadp2-score-pct">' + pct + '%</span>'
      + '<span class="fxadp2-score-sub">profil</span>'
      + '</div>';
  }

  function animateRing(pct) {
    var circle = qs('.fxadp2-score-ring-fill');
    if (!circle) return;
    var r = 26;
    var circ = 2 * Math.PI * r;
    var target = circ - (pct / 100) * circ;
    // Start from full offset (empty), animate to target
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        circle.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1)';
        circle.style.strokeDashoffset = target.toFixed(1);
      });
    });
  }

  /* ── RENDER: Hero cockpit ────────────────────────────── */
  function renderHero(p, pct) {
    var firstName = p.name ? p.name.split(' ')[0] : 'vous';
    var subtitle = pct >= 86
      ? 'Votre profil est pr\u00eat. Vous pouvez recevoir des demandes.'
      : 'Compl\u00e9tez votre profil pour appara\u00eetre aupr\u00e8s des bons clients.';

    var tags = [];
    if (p.job  && p.job.trim())   tags.push({ cls:'ok',   icon:'\u2692', text: p.job });
    else                           tags.push({ cls:'warn', icon:'\u2692', text: 'M\u00e9tier non renseign\u00e9' });
    if (p.city && p.city.trim())  tags.push({ cls:'ok',   icon:'\ud83d\udccd', text: p.city });
    else                           tags.push({ cls:'warn', icon:'\ud83d\udccd', text: 'Ville non renseign\u00e9e' });
    if (p.phone && p.phone.replace(/\D/g,'').length >= 9)
      tags.push({ cls:'ok', icon:'\ud83d\udcf1', text: 'WhatsApp actif' });
    else
      tags.push({ cls:'warn', icon:'\ud83d\udcf1', text: 'WhatsApp non configur\u00e9' });

    var ctaLabel = pct >= 86 ? 'Am\u00e9liorer ma visibilit\u00e9' : 'Compl\u00e9ter mon profil';
    var ctaAction = "showSection('settings')";

    return '<div class="fxadp2-hero" id="fxadp2-hero">'
      + '<div class="fxadp2-hero-inner">'
      + '<div class="fxadp2-hero-identity">'
      + '<div class="fxadp2-hero-greeting">Bonjour, ' + esc(firstName) + ' \ud83d\udc4b</div>'
      + '<div class="fxadp2-hero-subtitle">' + subtitle + '</div>'
      + '<div class="fxadp2-hero-tags">'
      + tags.map(function(t){ return '<span class="fxadp2-tag ' + t.cls + '">' + t.icon + ' ' + esc(t.text) + '</span>'; }).join('')
      + '</div>'
      + '</div>'
      + '<div class="fxadp2-hero-cta-wrap">'
      + '<div class="fxadp2-score-ring" id="fxadp2-score-ring">' + buildScoreRingSVG(pct) + '</div>'
      + '<button class="fxadp2-hero-cta" onclick="' + ctaAction + '">' + ctaLabel + ' \u2192</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: Readiness card ──────────────────────────── */
  function renderReadiness(items, pct) {
    var rl = getReadinessLabel(pct);
    var rows = items.map(function(item) {
      return '<div class="fxadp2-check-item' + (item.done ? ' done' : '') + '">'
        + '<div class="fxadp2-check-marker">' + (item.done ? '\u2713' : '') + '</div>'
        + '<div class="fxadp2-check-body">'
        + '<div class="fxadp2-check-label">' + esc(item.label) + '</div>'
        + '<div class="fxadp2-check-benefit">' + item.benefit + '</div>'
        + '</div>'
        + (!item.done && item.action
          ? '<button class="fxadp2-check-cta" onclick="' + item.action + '">' + item.actionLabel + ' \u203a</button>'
          : '<span class="fxadp2-check-done-label">Fait</span>')
        + '</div>';
    }).join('');

    return '<div class="fxadp2-readiness" id="fxadp2-readiness">'
      + '<div class="fxadp2-readiness-head">'
      + '<h3 class="fxadp2-readiness-title">Pr\u00e9paration du profil</h3>'
      + '<span class="fxadp2-readiness-badge ' + rl.cls + '">' + rl.text + '</span>'
      + '</div>'
      + '<div class="fxadp2-readiness-sub">' + pct + '% complet\u00e9 \u00b7 ' + items.filter(function(i){return i.done;}).length + '/' + items.length + ' \u00e9tapes</div>'
      + '<div class="fxadp2-bar-track"><div class="fxadp2-bar-fill" style="width:0%" id="fxadp2-bar"></div></div>'
      + '<div class="fxadp2-check-list">' + rows + '</div>'
      + '</div>';
  }

  /* ── RENDER: Next best actions ───────────────────────── */
  var ACTIONS = [
    {
      id: 'portfolio',
      icon: '\ud83d\udcf8',
      title: 'Ajoutez une r\u00e9alisation',
      benefit: 'Les photos de travaux rassurent les clients et augmentent les demandes re\u00e7ues.',
      cta: 'Ajouter une photo',
      done_cta: 'R\u00e9alisations ajout\u00e9es',
      action: "showSection('portfolio')",
      isDone: function() {
        try { return JSON.parse(localStorage.getItem('fixeo_portfolio')||'[]').length > 0; } catch(e){ return false; }
      }
    },
    {
      id: 'desc',
      icon: '\u270f\ufe0f',
      title: 'R\u00e9digez votre description',
      benefit: 'Une description courte explique votre expertise et distingue votre profil.',
      cta: 'R\u00e9diger ma description',
      done_cta: 'Description ajout\u00e9e',
      action: "showSection('settings')",
      isDone: function() { return ls('user_description','').trim().length > 10; }
    },
    {
      id: 'phone',
      icon: '\ud83d\udcf2',
      title: 'V\u00e9rifiez votre WhatsApp',
      benefit: 'Les demandes urgentes sont transmises directement par WhatsApp.',
      cta: 'V\u00e9rifier mon num\u00e9ro',
      done_cta: 'WhatsApp configur\u00e9',
      action: "showSection('settings')",
      isDone: function() { return ls('user_phone','').replace(/\D/g,'').length >= 9; }
    },
    {
      id: 'avail',
      icon: '\ud83d\udcc5',
      title: 'D\u00e9finissez vos disponibilit\u00e9s',
      benefit: 'Indiquer vos disponibilit\u00e9s augmente vos chances de recevoir des demandes correspondantes.',
      cta: 'D\u00e9finir mes horaires',
      done_cta: 'Disponibilit\u00e9s d\u00e9finies',
      action: "document.getElementById('fxadp2-avail') && document.getElementById('fxadp2-avail').scrollIntoView({behavior:'smooth'})",
      isDone: function() { return ls('fixeo_avail_status','') !== ''; }
    },
    {
      id: 'response',
      icon: '\u26a1',
      title: 'Pr\u00e9parez votre premi\u00e8re r\u00e9ponse',
      benefit: 'R\u00e9pondre dans les 10 premi\u00e8res minutes augmente fortement les acceptations.',
      cta: 'Lire les conseils',
      done_cta: 'Pris en compte',
      action: "if(window.notifications) notifications.info('Conseil r\u00e9activit\u00e9', 'R\u00e9pondez dans les 10 premi\u00e8res minutes pour maximiser vos acceptations.'); lsSet_p2('fixeo_response_tip_seen','1')",
      isDone: function() { return ls('fixeo_response_tip_seen','') === '1'; }
    }
  ];

  function renderActions(items) {
    // Show max 4 incomplete + any done (max 2 done shown)
    var incomplete = ACTIONS.filter(function(a){ return !a.isDone(); });
    var done       = ACTIONS.filter(function(a){ return  a.isDone(); }).slice(0,2);
    var shown      = incomplete.concat(done).slice(0,5);

    var cards = shown.map(function(a) {
      var d = a.isDone();
      return '<div class="fxadp2-action-card' + (d ? ' done' : '') + '" onclick="' + (d ? '' : a.action) + '">'
        + (d ? '<div class="fxadp2-done-check">\u2713</div>' : '')
        + '<div class="fxadp2-action-icon">' + a.icon + '</div>'
        + '<div class="fxadp2-action-title">' + a.title + '</div>'
        + '<div class="fxadp2-action-benefit">' + a.benefit + '</div>'
        + '<button class="fxadp2-action-btn">' + (d ? a.done_cta : a.cta) + (d ? '' : ' \u2192') + '</button>'
        + '</div>';
    }).join('');

    return '<div class="fxadp2-actions" id="fxadp2-actions">'
      + '<div class="fxadp2-section-label">Prochaines \u00e9tapes</div>'
      + '<div class="fxadp2-action-grid">' + cards + '</div>'
      + '</div>';
  }

  /* ── RENDER: Visibility system ───────────────────────── */
  function renderVisibility(p) {
    var hasJob   = !!(p.job   && p.job.trim().length   > 1);
    var hasCity  = !!(p.city  && p.city.trim().length  > 1);
    var hasPhone = !!(p.phone && p.phone.replace(/\D/g,'').length >= 9);
    var hasPortfolio = false;
    try { hasPortfolio = JSON.parse(localStorage.getItem('fixeo_portfolio')||'[]').length > 0; } catch(e){}
    var hasAvail = ls('fixeo_avail_status','') !== '';

    var factors = [
      { label: 'M\u00e9tier', ok: hasJob },
      { label: 'Ville',  ok: hasCity },
      { label: 'Disponibilit\u00e9', ok: hasAvail },
      { label: 'WhatsApp', ok: hasPhone },
      { label: 'R\u00e9alisations', ok: hasPortfolio }
    ];

    return '<div class="fxadp2-visibility" id="fxadp2-visibility">'
      + '<div class="fxadp2-visibility-head">'
      + '<div class="fxadp2-visibility-icon">\ud83d\udcfa</div>'
      + '<div><div class="fxadp2-visibility-title">Comment votre profil devient visible</div>'
      + '<div class="fxadp2-visibility-sub">Fixeo utilise ces crit\u00e8res pour vous proposer aux bons clients</div></div>'
      + '</div>'
      + '<div class="fxadp2-vis-factors">'
      + factors.map(function(f){
          return '<div class="fxadp2-vis-factor">'
            + '<div class="fxadp2-vis-factor-dot ' + (f.ok ? 'ok' : 'warn') + '"></div>'
            + '<span>' + f.label + '</span>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="fxadp2-vis-note">Plus votre profil est complet, plus il est facile de vous proposer aux bons clients. Aucun classement artificiel — uniquement la correspondance entre votre profil et la demande du client.</div>'
      + '</div>';
  }

  /* ── RENDER: Premium requests empty state ────────────── */
  function renderRequestsEmpty(p) {
    var hasJob  = !!(p.job  && p.job.trim().length  > 1);
    var hasCity = !!(p.city && p.city.trim().length > 1);

    return '<div class="fxadp2-requests-empty" id="fxadp2-req-empty">'
      + '<div class="fxadp2-req-icon">\ud83d\udcec</div>'
      + '<div class="fxadp2-req-title">Aucune demande re\u00e7ue pour le moment</div>'
      + '<div class="fxadp2-req-sub">Les demandes apparaissent ici lorsqu\u2019elles correspondent \u00e0 votre m\u00e9tier et votre ville.</div>'
      + '<div class="fxadp2-req-zone-pills">'
      + '<span class="fxadp2-zone-pill ' + (hasJob ? 'active' : 'missing') + '">'
      + '\u2692 ' + (hasJob ? esc(p.job) : 'M\u00e9tier non d\u00e9fini')
      + '</span>'
      + '<span class="fxadp2-zone-pill ' + (hasCity ? 'active' : 'missing') + '">'
      + '\ud83d\udccd ' + (hasCity ? esc(p.city) : 'Ville non d\u00e9finie')
      + '</span>'
      + '</div>'
      + '</div>';
  }

  /* ── V1-C: Render availability selector with public presence feeling ── */
  function renderAvailability() {
    var stored = ls('fixeo_avail_status', 'now');
    var opts = [
      { key: 'now',  dot: 'ok',   label: 'Disponible maintenant' },
      { key: 'week', dot: 'warn', label: 'Disponible cette semaine' },
      { key: 'off',  dot: 'off',  label: 'Indisponible' }
    ];

    /* V1-C: Build profile preview URL from localStorage artisan id */
    var artisanId = ls('user_id', ls('fixeo_user_id', ls('sb_user_id', '')));
    var profilePreviewHtml = '';
    if (artisanId) {
      profilePreviewHtml = '<a class="fxadp2-profile-preview-link" '
        + 'href="/artisan-profile.html?id=' + encodeURIComponent(artisanId) + '" '
        + 'target="_blank" rel="noopener">'
        + '\ud83d\udc41\ufe0f Voir mon profil public'
        + '</a>';
    }

    /* V1-C: Public availability label (what clients see) */
    var publicLabel = stored === 'now'  ? '\ud83d\udfe2 Disponible'
                    : stored === 'week' ? '\ud83d\udfe1 Disponible cette semaine'
                    : '\u26ab Indisponible';
    var publicCls   = stored === 'off' ? 'warn' : 'ok';

    return '<div class="fxadp2-avail" id="fxadp2-avail">'
      + '<div class="fxadp2-avail-header">'
      + '<h3 class="fxadp2-avail-title">Ma disponibilit\u00e9</h3>'
      + '<span class="fxadp2-avail-public-badge ' + publicCls + '">' + publicLabel + '</span>'
      + '</div>'
      + '<div class="fxadp2-avail-options" id="fxadp2-avail-opts">'
      + opts.map(function(o){
          var sel = (o.key === stored) ? (o.key === 'off' ? 'selected-warn' : 'selected') : '';
          return '<button class="fxadp2-avail-opt ' + sel + '" data-avail="' + o.key + '" onclick="_fxAdP2SetAvail(\'' + o.key + '\')">'
            + '<div class="fxadp2-avail-dot"></div>'
            + o.label
            + '</button>';
        }).join('')
      + '</div>'
      /* V1-E-A: Availability decay indicator — calm, non-pressuring.
       * When 'off' and fixeo_avail_off_since is set, show elapsed inline.
       * "Vous êtes indisponible depuis 3 jours."
       * No auto-reactivation. No lost-client simulation. Just honest state. */
      + (function() {
          if (stored !== 'off') return '<div class="fxadp2-avail-note" id="fxadp2-avail-note">Votre statut est enregistr\u00e9 et refl\u00e8te votre disponibilit\u00e9 pour les nouvelles demandes.</div>';
          try {
            var offSince = localStorage.getItem('fixeo_avail_off_since') || '';
            if (!offSince) return '<div class="fxadp2-avail-note" id="fxadp2-avail-note">Vous \u00eates actuellement indisponible sur Fixeo.</div>';
            var offMs = Date.now() - (Date.parse(offSince) || 0);
            var offMins = Math.floor(offMs / 60000);
            var offLabel = offMins < 60
              ? offMins + '\u00a0min'
              : Math.floor(offMs / 3600000) < 24
              ? Math.floor(offMs / 3600000) + '\u00a0h'
              : Math.floor(offMs / 86400000) === 1
              ? 'hier'
              : Math.floor(offMs / 86400000) + ' jours';
            return '<div class="fxadp2-avail-note fxadp2-avail-note--off" id="fxadp2-avail-note">'
              + 'Vous \u00eates indisponible depuis\u00a0' + offLabel + '.'
              + ' R\u00e9activez votre disponibilit\u00e9 lorsque vous \u00eates pr\u00eat.'
              + '</div>';
          } catch(e) {
            return '<div class="fxadp2-avail-note" id="fxadp2-avail-note">Vous \u00eates actuellement indisponible sur Fixeo.</div>';
          }
        })()
      + (profilePreviewHtml
        ? '<div class="fxadp2-avail-preview-row">' + profilePreviewHtml + '</div>'
        : '')
      + '</div>';
  }

  /* ── RENDER: Premium portfolio empty state ───────────── */
  var PORTFOLIO_EMPTY_P2 = '<div class="fxadp2-portfolio-empty" id="fxadp2-portfolio-empty">'
    + '<div class="fxadp2-portfolio-empty-icon">\ud83d\udcf8</div>'
    + '<div class="fxadp2-portfolio-empty-title">Ajoutez vos premi\u00e8res r\u00e9alisations</div>'
    + '<div class="fxadp2-portfolio-empty-sub">Les photos de vos travaux renforcent la confiance des clients et augmentent vos chances de recevoir des demandes.</div>'
    + '<button class="fxadp2-portfolio-add-btn" onclick="openAddPortfolio()">'
    + '+ Ajouter une r\u00e9alisation'
    + '</button>'
    + '</div>';

  /* ── Global helper for action card ──────────────────── */
  window.lsSet_p2 = function(k,v){ try { localStorage.setItem(k,v); } catch(e){} };

  /* ── V1-C: Map fixeo_avail_status → marketplace / Supabase availability strings ── */
  function _availKeyToPublic(key) {
    if (key === 'now')  return 'available';
    if (key === 'week') return 'available';
    return 'unavailable';
  }

  /* ── V1-C: Bridge availability to marketplace pool (fixeo_admin_artisans_v21) ── */
  function _bridgeAvailToMarketplace(key) {
    var POOL_KEY = 'fixeo_admin_artisans_v21';
    var publicVal = _availKeyToPublic(key);
    try {
      var userId = ls('user_id', ls('fixeo_user_id', ls('sb_user_id', '')));
      if (!userId) return;
      var pool = [];
      try { pool = JSON.parse(localStorage.getItem(POOL_KEY) || '[]'); } catch(e){ return; }
      if (!Array.isArray(pool)) return;
      var updated = false;
      pool = pool.map(function(art) {
        var rid = String(art.id || '');
        var roid = String(art.owner_account_id || '');
        if (rid === userId || roid === userId) {
          updated = true;
          return Object.assign({}, art, { availability: publicVal });
        }
        return art;
      });
      if (updated) {
        localStorage.setItem(POOL_KEY, JSON.stringify(pool));
      }
    } catch(e) { /* silent — non-critical */ }
  }

  /* ── V1-C: Non-blocking Supabase availability update ────── */
  function _syncAvailToSupabase(key) {
    var publicVal = _availKeyToPublic(key);
    try {
      if (!window.FixeoSupabaseClient || typeof window.FixeoSupabaseClient.getClient !== 'function') return;
      var userId = ls('user_id', ls('fixeo_user_id', ls('sb_user_id', '')));
      if (!userId) return;
      window.FixeoSupabaseClient.getClient().then(function(sb) {
        return sb.from('artisans')
          .update({ availability: publicVal })
          .or('id.eq.' + userId + ',legacy_id.eq.' + userId);
      }).then(function() {
        /* Success — silent */
      }).catch(function() {
        /* RLS may reject — silent, localStorage bridge is sufficient */
      });
    } catch(e) { /* silent */ }
  }

  /* ── V1-C: Show availability confirmation in the avail card ── */
  function _showAvailConfirmation(key) {
    /* try new stable id first, fallback to old note class */
    var note = el('fxadp2-avail-note') || qs('.fxadp2-avail-note');
    if (!note) return;
    if (key === 'off') {
      note.innerHTML = '\u26ab Statut <strong>Indisponible</strong> enregistr\u00e9. '
        + 'Votre profil reste visible mais vous n\u2019\u00eates pas propos\u00e9 aux nouveaux clients.';
      note.style.color = 'rgba(255,165,2,0.75)';
    } else if (key === 'week') {
      note.innerHTML = '\ud83d\udfe1 Statut <strong>Disponible cette semaine</strong> enregistr\u00e9. '
        + 'Votre profil indique que vous pouvez intervenir cette semaine.';
      note.style.color = 'rgba(255,165,2,0.65)';
    } else {
      note.innerHTML = '\ud83d\udfe2 Statut <strong>Disponible maintenant</strong> enregistr\u00e9. '
        + 'Votre profil indique que vous \u00eates pr\u00eat \u00e0 intervenir.';
      note.style.color = 'rgba(32,201,151,0.80)';
    }
    /* V1-E-A: Reset note after 4s — restore elapsed indicator if still off */
    setTimeout(function() {
      if (!note) return;
      note.style.color = '';
      var currentKey = ls('fixeo_avail_status', 'now');
      if (currentKey === 'off') {
        try {
          var offSince = localStorage.getItem('fixeo_avail_off_since') || '';
          var offMs = offSince ? (Date.now() - (Date.parse(offSince) || 0)) : 0;
          var offMins = Math.floor(offMs / 60000);
          var offLabel = offMins < 60
            ? offMins + '\u00a0min'
            : Math.floor(offMs / 3600000) < 24
            ? Math.floor(offMs / 3600000) + '\u00a0h'
            : Math.floor(offMs / 86400000) === 1
            ? 'hier'
            : Math.floor(offMs / 86400000) + ' jours';
          if (offLabel) {
            note.className = 'fxadp2-avail-note fxadp2-avail-note--off';
            note.innerHTML = 'Vous \u00eates indisponible depuis\u00a0' + offLabel + '. '
              + 'R\u00e9activez votre disponibilit\u00e9 lorsque vous \u00eates pr\u00eat.';
            return;
          }
        } catch(e) {}
        note.innerHTML = 'Vous \u00eates actuellement indisponible sur Fixeo.';
      } else {
        note.innerHTML = 'Votre statut est enregistr\u00e9 et refl\u00e8te votre disponibilit\u00e9 pour les nouvelles demandes.';
      }
    }, 4000);
  }

  /* ── Availability setter ─────────────────────────────── */
  window._fxAdP2SetAvail = function(key) {
    lsSet('fixeo_avail_status', key);

    /* V1-E-A: Record when availability was last set to 'off' for elapsed indicator.
     * Only written on 'off' transition. Cleared on 'now' or 'week' to reset. */
    try {
      if (key === 'off') {
        if (!localStorage.getItem('fixeo_avail_off_since')) {
          localStorage.setItem('fixeo_avail_off_since', new Date().toISOString());
        }
      } else {
        localStorage.removeItem('fixeo_avail_off_since');
      }
    } catch (e) {}

    /* V1-C: Bridge to marketplace pool + Supabase (non-blocking) */
    _bridgeAvailToMarketplace(key);
    _syncAvailToSupabase(key);

    // Update sidebar availability status
    var st = el('avail-status');
    if (st) {
      if (key === 'now') {
        st.textContent = '\u25cf Disponible';
        st.className = 'availability-status online';
      } else if (key === 'week') {
        st.textContent = '\u25d4 Cette semaine';
        st.className = 'availability-status';
        st.style.color = '#ffa502';
      } else {
        st.textContent = '\u25cb Hors ligne';
        st.className = 'availability-status offline';
      }
    }
    // Update button states
    qsa('#fxadp2-avail-opts .fxadp2-avail-opt').forEach(function(btn) {
      var bKey = btn.dataset.avail;
      btn.className = 'fxadp2-avail-opt';
      if (bKey === key) {
        btn.classList.add(key === 'off' ? 'selected-warn' : 'selected');
      }
    });

    /* V1-C: Confirmation feedback in availability note */
    _showAvailConfirmation(key);

    // Refresh action cards (avail item may be done now)
    refreshActionCards();

    if (window.notifications && key !== 'off') {
      notifications.success(
        key === 'now' ? 'Disponible maintenant' : 'Disponible cette semaine',
        'Votre statut a \u00e9t\u00e9 mis \u00e0 jour.'
      );
    }
  };

  function refreshActionCards() {
    var wrap = el('fxadp2-actions');
    if (!wrap) return;
    var p = getProfile();
    var items = buildReadinessItems(p);
    var pct = getPct(items);
    var tmp = document.createElement('div');
    tmp.innerHTML = renderActions(items);
    wrap.parentNode.replaceChild(tmp.firstChild, wrap);
    // Also refresh bar
    var bar = el('fxadp2-bar');
    if (bar) bar.style.width = pct + '%';
  }

  /* ── Safe escape ─────────────────────────────────────── */
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── OVERVIEW: inject P2 cockpit ────────────────────── */
  function buildOverview() {
    var p     = getProfile();
    var items = buildReadinessItems(p);
    var pct   = getPct(items);

    var html = [
      renderHero(p, pct),
      renderReadiness(items, pct),
      renderActions(items),
      renderVisibility(p),
      renderRequestsEmpty(p),
      renderAvailability()
    ].join('');

    // Insert after artisan-cod-overview-panel (before or replacing P1 injection)
    var existing = el('fxadp2-overview-wrap');
    if (existing) {
      existing.innerHTML = html;
    } else {
      var wrap = document.createElement('div');
      wrap.id = 'fxadp2-overview-wrap';
      wrap.innerHTML = html;

      // Insert after cod panel, before anything else in section-overview
      var codPanel = el('artisan-cod-overview-panel');
      var section  = el('section-overview');
      if (codPanel && codPanel.parentNode === section) {
        codPanel.insertAdjacentElement('afterend', wrap);
      } else if (section) {
        section.insertBefore(wrap, section.firstChild);
      }
    }

    // Animate bar + ring after paint
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var bar = el('fxadp2-bar');
        if (bar) bar.style.width = pct + '%';
        animateRing(pct);
      });
    });
  }

  /* ── PORTFOLIO: inject P2 empty state ───────────────── */
  function patchPortfolioP2() {
    var grid = el('portfolio-grid');
    if (!grid) return;
    // If P1 already added fxadp1-portfolio-empty, remove it first
    var p1empty = grid.querySelector('.fxadp1-portfolio-empty');
    if (p1empty) p1empty.remove();
    // Check real portfolio
    var realPortfolio = [];
    try { realPortfolio = JSON.parse(localStorage.getItem('fixeo_portfolio')||'[]'); } catch(e){}
    if (realPortfolio.length === 0 && !el('fxadp2-portfolio-empty')) {
      var tmp = document.createElement('div');
      tmp.innerHTML = PORTFOLIO_EMPTY_P2;
      grid.insertBefore(tmp.firstChild, grid.firstChild);
    }
  }

  /* ── REQUESTS section: upgrade empty state ───────────── */
  function patchRequestsSectionP2() {
    var grid = el('requests-grid');
    if (!grid) return;
    var realStored = [];
    try { realStored = JSON.parse(localStorage.getItem('fixeo_client_requests')||'[]'); } catch(e){}
    if (realStored.length === 0) {
      var p = getProfile();
      grid.innerHTML = renderRequestsEmpty(p);
    }
  }

  /* ── Sync real requests if they arrive later ─────────── */
  function syncRequests() {
    var reqEmpty = el('fxadp2-req-empty');
    if (!reqEmpty) return;
    try {
      var stored = JSON.parse(localStorage.getItem('fixeo_client_requests')||'[]');
      if (stored.length > 0) reqEmpty.style.display = 'none';
    } catch(e){}
  }

  /* ── INIT ────────────────────────────────────────────── */
  function init() {
    buildOverview();
    // Patch other sections on slight delay (P1 runs on DOMContentLoaded,
    // artisan-subscription.js fires on DOMContentLoaded — both already ran)
    setTimeout(function() {
      patchPortfolioP2();
      patchRequestsSectionP2();
    }, 120);

    // Re-sync when missions/state updates
    window.addEventListener('fixeo:missions:updated', syncRequests);
    window.addEventListener('fixeo:state:updated',    syncRequests);
    setTimeout(syncRequests, 800);

    // Re-hydrate if profile was updated (settings save in P1)
    document.addEventListener('fixeo:profile:updated', function() {
      buildOverview();
      patchRequestsSectionP2();
    });
  }

  /* ── Wire settings save to also rebuild P2 ───────────── */
  // Monkey-patch P1 settings save to also emit profile:updated event
  // We can't call P1 directly but we can observe the save button click
  var saveBtn = el('settings-artisan-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      // Fire after P1's handler has written to localStorage (~50ms)
      setTimeout(function() {
        document.dispatchEvent(new CustomEvent('fixeo:profile:updated'));
      }, 80);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
