/* ============================================================
   FIXEO — ARTISAN DASHBOARD PHASE 3 — LIVE VISIBILITY ENGINE
   js/artisan-dashboard-p3.js

   Builds on P1 + P2. Adds:
   - Live status engine (real field-derived states)
   - Network perception panel (real zone/métier/avail pills)
   - Visibility health system (honest factor breakdown)
   - Dynamic priority action engine (sorted by completion + impact)
   - Premium requests empty state with orbit animation + context
   - Hero sub-title upgrade with contextual microcopy

   Guard: window._fxAdP3Loaded (idempotent)
   No fake data. No fake counters. No fake activity.
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAdP3Loaded) return;
  window._fxAdP3Loaded = true;

  /* ── Tiny helpers ────────────────────────────────────── */
  function el(id)   { return document.getElementById(id); }
  function qs(sel)  { return document.querySelector(sel); }
  function ls(k, fb){ try { return localStorage.getItem(k) || fb; } catch(e){ return fb; } }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Read real profile ───────────────────────────────── */
  function getProfile() {
    return {
      name:     ls('user_name', ls('fixeo_user_name', '')),
      city:     ls('user_city', ''),
      job:      ls('user_job',  ''),
      phone:    ls('user_phone',''),
      desc:     ls('user_description', ''),
      avail:    ls('fixeo_avail_status', ''),
      portfolio: (function(){
        try { return JSON.parse(localStorage.getItem('fixeo_portfolio')||'[]'); } catch(e){ return []; }
      }())
    };
  }

  /* ── Derive live status ──────────────────────────────── */
  function deriveStatus(p) {
    var profilePct = calcPct(p);
    if (!p.job || !p.city) {
      return {
        key: 'incomplete',
        cls: 'state-incomplete',
        pulse: true,
        label: '\ud83d\udfe0 Profil incomplet',
        sub: 'D\u00e9finissez votre m\u00e9tier et votre ville pour apparaître sur Fixeo.'
      };
    }
    if (p.avail === 'off') {
      return {
        key: 'off',
        cls: 'state-off',
        pulse: false,
        label: '\u26ab Indisponible',
        sub: 'Vous \u00eates marqu\u00e9 indisponible. Les demandes ne vous sont pas propos\u00e9es pour le moment.'
      };
    }
    if (p.avail === 'week') {
      return {
        key: 'week',
        cls: 'state-week',
        pulse: true,
        label: '\ud83d\udfe1 Disponible cette semaine',
        sub: 'Votre profil est actif dans votre zone. Les demandes de la semaine peuvent vous \u00eatre propos\u00e9es.'
      };
    }
    if (profilePct >= 86) {
      return {
        key: 'zone',
        cls: 'state-zone',
        pulse: true,
        label: '\ud83d\udfe3 Profil actif dans votre zone',
        sub: 'Votre profil est visible. Fixeo peut vous proposer aux clients qui correspondent \u00e0 votre m\u00e9tier et votre ville.'
      };
    }
    // Available + profile not complete
    return {
      key: 'active',
      cls: 'state-active',
      pulse: true,
      label: '\ud83d\udfe2 Disponible maintenant',
      sub: 'Compl\u00e9tez votre profil pour augmenter vos chances de recevoir des demandes.'
    };
  }

  /* ── Readiness pct (shared logic, mirrors P2) ────────── */
  function calcPct(p) {
    var checks = [
      !!(p.name  && p.name.trim().length  > 1),
      !!(p.job   && p.job.trim().length   > 1),
      !!(p.city  && p.city.trim().length  > 1),
      !!(p.phone && p.phone.replace(/\D/g,'').length >= 9),
      !!(p.desc  && p.desc.trim().length  > 10),
      p.portfolio.length > 0,
      p.avail !== ''
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  /* ── RENDER: Live status strip ───────────────────────── */
  function renderStatusStrip(status) {
    return '<div class="fxadp3-status-strip" id="fxadp3-status-strip">'
      + '<div class="fxadp3-status-badge ' + status.cls + '">'
      + (status.pulse ? '<div class="fxadp3-pulse"></div>' : '<div class="fxadp3-pulse" style="animation:none"></div>')
      + '<span>' + status.label + '</span>'
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: Network perception panel ───────────────── */
  function renderNetwork(p, status) {
    var hasJob   = !!(p.job   && p.job.trim().length   > 1);
    var hasCity  = !!(p.city  && p.city.trim().length  > 1);
    var hasPhone = !!(p.phone && p.phone.replace(/\D/g,'').length >= 9);
    var hasAvail = p.avail !== '';
    var hasPortfolio = p.portfolio.length > 0;

    var subtext = (status.key === 'off' || status.key === 'incomplete')
      ? 'Compl\u00e9tez votre profil pour apparaître aupr\u00e8s des clients de votre zone.'
      : 'Fixeo recherche des demandes correspondant \u00e0 votre m\u00e9tier et votre ville.';

    function pill(cls, icon, text) {
      return '<div class="fxadp3-net-pill ' + cls + '">'
        + '<div class="fxadp3-net-pill-dot"></div>'
        + icon + ' ' + esc(text)
        + '</div>';
    }

    return '<div class="fxadp3-network" id="fxadp3-network">'
      + '<div class="fxadp3-network-inner">'
      + '<div class="fxadp3-network-head">'
      + '<div class="fxadp3-network-icon">\ud83d\udcf6</div>'
      + '<div>'
      + '<div class="fxadp3-network-title">Votre profil et le r\u00e9seau Fixeo</div>'
      + '<div class="fxadp3-network-sub">' + subtext + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="fxadp3-network-pills">'
      + pill(hasJob   ? 'active' : 'warn', '\u2692', hasJob   ? p.job  : 'M\u00e9tier non d\u00e9fini')
      + pill(hasCity  ? 'active' : 'warn', '\ud83d\udccd', hasCity  ? p.city : 'Ville non d\u00e9finie')
      + pill(hasAvail ? 'active' : 'warn', '\ud83d\uddd3',
          p.avail === 'now'  ? 'Disponible maintenant' :
          p.avail === 'week' ? 'Cette semaine' :
          p.avail === 'off'  ? 'Indisponible' : 'Disponibilit\u00e9 non d\u00e9finie')
      + pill(hasPhone ? 'active' : 'warn', '\ud83d\udcf1', hasPhone ? 'WhatsApp actif' : 'WhatsApp non configur\u00e9')
      + pill(hasPortfolio ? 'active' : '', '\ud83d\udcf8',
          hasPortfolio ? p.portfolio.length + ' r\u00e9alisation' + (p.portfolio.length > 1 ? 's' : '') : 'Aucune r\u00e9alisation')
      + '</div>'
      + '<div class="fxadp3-network-note">Votre profil peut apparaître lorsque des demandes correspondent \u00e0 votre m\u00e9tier et votre ville. Aucun classement artificiel — uniquement la correspondance entre votre profil et la demande du client.</div>'
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: Visibility health system ───────────────── */
  function renderHealth(p) {
    var hasJob       = !!(p.job   && p.job.trim().length   > 1);
    var hasCity      = !!(p.city  && p.city.trim().length  > 1);
    var hasPhone     = !!(p.phone && p.phone.replace(/\D/g,'').length >= 9);
    var hasPortfolio = p.portfolio.length > 0;
    var hasAvail     = p.avail !== '' && p.avail !== 'off';
    var hasDesc      = !!(p.desc && p.desc.trim().length > 10);

    var score = [hasJob, hasCity, hasPhone, hasPortfolio, hasAvail, hasDesc].filter(Boolean).length;

    var health = score >= 5
      ? { cls: 'strong',   icon: '\ud83d\udfe2', label: 'Profil fort' }
      : score >= 3
      ? { cls: 'correct',  icon: '\ud83d\udfe1', label: 'Profil correct' }
      : { cls: 'incomplete', icon: '\ud83d\udfe0', label: 'Profil incomplet' };

    function row(ok, icon, label, val, action, actionLabel) {
      var cls = ok ? 'ok' : (val ? 'warn' : 'miss');
      return '<div class="fxadp3-hf-row ' + cls + '">'
        + '<div class="fxadp3-hf-icon">' + icon + '</div>'
        + '<div class="fxadp3-hf-label">' + label + '</div>'
        + (val ? '<div class="fxadp3-hf-val">' + esc(val) + '</div>' : '')
        + (!ok && action ? '<button class="fxadp3-hf-cta" onclick="' + action + '">Ajouter \u203a</button>' : '')
        + '</div>';
    }

    return '<div class="fxadp3-health" id="fxadp3-health">'
      + '<div class="fxadp3-health-head">'
      + '<h3 class="fxadp3-health-title">Visibilit\u00e9 Fixeo</h3>'
      + '<span class="fxadp3-health-badge ' + health.cls + '">' + health.icon + ' ' + health.label + '</span>'
      + '</div>'
      + '<div class="fxadp3-health-sub">Crit\u00e8res utilis\u00e9s pour vous proposer aux bons clients</div>'
      + '<div class="fxadp3-health-factors">'
      + row(hasJob,       '\u2692',         'M\u00e9tier',        p.job  || '',    "showSection('settings')", 'D\u00e9finir')
      + row(hasCity,      '\ud83d\udccd',   'Ville active',       p.city || '',    "showSection('settings')", 'D\u00e9finir')
      + row(hasAvail,     '\ud83d\uddd3',   'Disponibilit\u00e9', p.avail === 'now' ? 'Maintenant' : p.avail === 'week' ? 'Cette semaine' : (p.avail === 'off' ? 'Indisponible' : ''), null, null)
      + row(hasPhone,     '\ud83d\udcf1',   'WhatsApp',           p.phone ? p.phone.slice(0,6)+'...' : '', "showSection('settings')", 'Ajouter')
      + row(hasPortfolio, '\ud83d\udcf8',   'R\u00e9alisations',  hasPortfolio ? p.portfolio.length + ' ajout\u00e9' + (p.portfolio.length > 1 ? 'es' : '\u00e9e') : '', "showSection('portfolio')", 'Ajouter')
      + row(hasDesc,      '\u270f\ufe0f',   'Description',        hasDesc ? 'R\u00e9dig\u00e9e' : '', "showSection('settings')", 'R\u00e9diger')
      + '</div>'
      + '</div>';
  }

  /* ── RENDER: Dynamic priority action engine ──────────── */
  var ACTION_DEFS = [
    {
      id: 'portfolio',
      icon: '\ud83d\udcf8',
      title: 'Ajoutez une r\u00e9alisation',
      benefit: 'Les photos de vos travaux rassurent les clients',
      impact: 3,
      action: "showSection('portfolio')",
      isDone: function(p) { return p.portfolio.length > 0; }
    },
    {
      id: 'desc',
      icon: '\u270f\ufe0f',
      title: 'R\u00e9digez votre description',
      benefit: 'Expliquez votre expertise en 2 phrases',
      impact: 2,
      action: "showSection('settings')",
      isDone: function(p) { return !!(p.desc && p.desc.trim().length > 10); }
    },
    {
      id: 'phone',
      icon: '\ud83d\udcf2',
      title: 'V\u00e9rifiez votre WhatsApp',
      benefit: 'Les demandes urgentes arrivent par WhatsApp',
      impact: 3,
      action: "showSection('settings')",
      isDone: function(p) { return !!(p.phone && p.phone.replace(/\D/g,'').length >= 9); }
    },
    {
      id: 'avail',
      icon: '\ud83d\uddd3',
      title: 'D\u00e9finissez vos disponibilit\u00e9s',
      benefit: 'Signalez que vous \u00eates actif sur la plateforme',
      impact: 2,
      action: "el('fxadp3-network') && el('fxadp3-network').scrollIntoView({behavior:'smooth'})",
      isDone: function(p) { return p.avail !== ''; }
    },
    {
      id: 'job',
      icon: '\u2692',
      title: 'D\u00e9finissez votre m\u00e9tier',
      benefit: 'D\u00e9termine quelles demandes vous correspondent',
      impact: 4,
      action: "showSection('settings')",
      isDone: function(p) { return !!(p.job && p.job.trim().length > 1); }
    },
    {
      id: 'city',
      icon: '\ud83d\udccd',
      title: 'D\u00e9finissez votre ville',
      benefit: 'Limite les demandes \u00e0 votre zone d\u2019intervention',
      impact: 4,
      action: "showSection('settings')",
      isDone: function(p) { return !!(p.city && p.city.trim().length > 1); }
    },
    {
      id: 'response',
      icon: '\u26a1',
      title: 'Pr\u00e9parez votre premi\u00e8re r\u00e9ponse',
      benefit: 'R\u00e9pondre en moins de 10 min maximise vos acceptations',
      impact: 1,
      action: "_fxAdP3TipSeen()",
      isDone: function(p) { return ls('fixeo_response_tip_seen','') === '1'; }
    }
  ];

  window._fxAdP3TipSeen = function() {
    try { localStorage.setItem('fixeo_response_tip_seen','1'); } catch(e){}
    if (window.notifications) {
      notifications.info(
        'Conseil r\u00e9activit\u00e9',
        'R\u00e9pondez dans les 10 premi\u00e8res minutes. Les clients qui ne re\u00e7oivent pas de r\u00e9ponse rapide choisissent le prochain artisan disponible.'
      );
    }
    // Refresh engine
    var wrap = el('fxadp3-priority-engine');
    if (wrap) {
      var p = getProfile();
      var tmp = document.createElement('div');
      tmp.innerHTML = renderPriorityEngine(p);
      wrap.parentNode.replaceChild(tmp.firstChild, wrap);
    }
  };

  function renderPriorityEngine(p) {
    // Sort: incomplete first (by impact desc), done last
    var sorted = ACTION_DEFS.slice().sort(function(a, b) {
      var aDone = a.isDone(p) ? 1 : 0;
      var bDone = b.isDone(p) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone; // incomplete first
      return b.impact - a.impact; // higher impact first
    });

    var items = sorted.map(function(def, i) {
      var done = def.isDone(p);
      var isPriority1 = !done && i === 0;
      return '<div class="fxadp3-pe-item' + (done ? ' done' : '') + (isPriority1 ? ' priority-1' : '') + '"'
        + (!done ? ' onclick="' + def.action + '"' : '') + '>'
        + '<div class="fxadp3-pe-icon-wrap">' + def.icon + '</div>'
        + '<div class="fxadp3-pe-body">'
        + '<div class="fxadp3-pe-title">' + def.title + '</div>'
        + '<div class="fxadp3-pe-benefit">' + def.benefit + '</div>'
        + '</div>'
        + (done
          ? '<div class="fxadp3-pe-done-mark">\u2713</div>'
          : '<div class="fxadp3-pe-arrow">\u203a</div>')
        + '</div>';
    }).join('');

    return '<div class="fxadp3-priority-engine" id="fxadp3-priority-engine">'
      + '<div class="fxadp3-pe-label">Prochaines \u00e9tapes prioritaires</div>'
      + '<div class="fxadp3-pe-list">' + items + '</div>'
      + '</div>';
  }

  /* ── RENDER: Premium requests empty state v3 ─────────── */
  function renderRequestsEmptyV3(p) {
    var hasJob   = !!(p.job   && p.job.trim().length   > 1);
    var hasCity  = !!(p.city  && p.city.trim().length  > 1);
    var hasAvail = p.avail !== '' && p.avail !== 'off';

    var availLabel = p.avail === 'now'  ? 'Disponible maintenant' :
                     p.avail === 'week' ? 'Cette semaine' :
                     p.avail === 'off'  ? 'Indisponible' : 'Disponibilit\u00e9 non d\u00e9finie';

    return '<div class="fxadp3-req-empty" id="fxadp3-req-empty">'
      + '<div class="fxadp3-req-inner">'
      + '<div class="fxadp3-req-icon-wrap">'
      + '<div class="fxadp3-req-icon-bg">\ud83d\udcec</div>'
      + '<div class="fxadp3-orbit"></div>'
      + '</div>'
      + '<div class="fxadp3-req-title">Aucune demande re\u00e7ue pour le moment</div>'
      + '<div class="fxadp3-req-sub">Les demandes correspondant \u00e0 votre m\u00e9tier et votre ville apparaîtront ici d\u00e8s qu\u2019elles sont disponibles.</div>'
      + '<div class="fxadp3-req-context">'
      + '<span class="fxadp3-ctx-pill ' + (hasJob  ? 'active' : 'warn') + '">\u2692 ' + esc(hasJob  ? p.job  : 'M\u00e9tier non d\u00e9fini') + '</span>'
      + '<span class="fxadp3-ctx-pill ' + (hasCity ? 'active' : 'warn') + '">\ud83d\udccd ' + esc(hasCity ? p.city : 'Ville non d\u00e9finie') + '</span>'
      + '<span class="fxadp3-ctx-pill ' + (hasAvail ? 'active' : 'neutral') + '">\ud83d\uddd3 ' + esc(availLabel) + '</span>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── Upgrade P2 hero subtitle ────────────────────────── */
  function upgradeHeroSubtitle(p, status) {
    var sub = qs('#fxadp2-hero .fxadp2-hero-subtitle');
    if (!sub) return;
    sub.classList.add('p3-enhanced');
    // Contextual microcopy
    if (status.key === 'zone') {
      sub.textContent = 'Votre profil est pr\u00eat \u00e0 recevoir des demandes dans votre zone.';
    } else if (status.key === 'active') {
      sub.textContent = 'Disponible maintenant \u2014 compl\u00e9tez votre profil pour augmenter vos chances.';
    } else if (status.key === 'week') {
      sub.textContent = 'Votre profil est actif. Les demandes de la semaine peuvent vous \u00eatre propos\u00e9es.';
    } else if (status.key === 'off') {
      sub.textContent = 'Vous \u00eates marqu\u00e9 indisponible. Mettez \u00e0 jour votre disponibilit\u00e9 pour recevoir des demandes.';
    } else if (status.key === 'incomplete') {
      sub.textContent = 'D\u00e9finissez votre m\u00e9tier et votre ville pour apparaître sur Fixeo.';
    }
  }

  /* ── INJECT into overview ────────────────────────────── */
  function buildP3Overview() {
    var p      = getProfile();
    var status = deriveStatus(p);

    // Status strip: inject INSIDE P2 hero, before identity block
    var heroInner = qs('#fxadp2-hero .fxadp2-hero-inner');
    if (heroInner) {
      var existing = el('fxadp3-status-strip');
      if (existing) existing.remove();
      var tmp = document.createElement('div');
      tmp.innerHTML = renderStatusStrip(status);
      heroInner.parentNode.insertBefore(tmp.firstChild, heroInner);
    }

    // Upgrade P2 hero subtitle
    upgradeHeroSubtitle(p, status);

    // P3 blocks: insert into fxadp2-overview-wrap, after readiness card
    var p2Wrap = el('fxadp2-overview-wrap');
    if (!p2Wrap) return;

    // Remove stale P3 blocks before re-insert
    ['fxadp3-p3-blocks'].forEach(function(id){ var x=el(id); if(x) x.remove(); });

    var p3html = renderNetwork(p, status)
      + renderHealth(p)
      + renderPriorityEngine(p)
      + renderRequestsEmptyV3(p);

    var p3wrap = document.createElement('div');
    p3wrap.id = 'fxadp3-p3-blocks';
    p3wrap.innerHTML = p3html;

    // Insert after fxadp2-readiness if it exists, otherwise at end of p2Wrap
    var readiness = el('fxadp2-readiness');
    if (readiness && readiness.parentNode === p2Wrap) {
      readiness.insertAdjacentElement('afterend', p3wrap);
    } else {
      p2Wrap.appendChild(p3wrap);
    }
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    // P2 must have run first — defer slightly
    setTimeout(function() {
      buildP3Overview();

      // Re-build on profile/state updates
      document.addEventListener('fixeo:profile:updated', function() {
        setTimeout(buildP3Overview, 60);
      });
      window.addEventListener('fixeo:missions:updated', function() {
        // Check if real requests exist, hide empty state
        try {
          var stored = JSON.parse(localStorage.getItem('fixeo_client_requests')||'[]');
          var emp = el('fxadp3-req-empty');
          if (emp && stored.length > 0) emp.style.display = 'none';
        } catch(e){}
      });

      // Patch settings save button → also rebuild P3
      var saveBtn = el('settings-artisan-save');
      if (saveBtn && !saveBtn._p3wired) {
        saveBtn._p3wired = true;
        saveBtn.addEventListener('click', function() {
          setTimeout(function() {
            buildP3Overview();
          }, 160); // after P2's 80ms + some room
        });
      }

      // Rebuild P3 when availability changes
      var origSetAvail = window._fxAdP2SetAvail;
      if (origSetAvail && !window._fxAdP3AvailPatched) {
        window._fxAdP3AvailPatched = true;
        window._fxAdP2SetAvail = function(key) {
          origSetAvail(key);
          setTimeout(buildP3Overview, 60);
        };
      }

    }, 150); // after P2's 120ms settle
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
