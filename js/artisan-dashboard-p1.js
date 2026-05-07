/* ============================================================
   FIXEO — ARTISAN DASHBOARD PHASE 1 — TRUST RESET
   js/artisan-dashboard-p1.js
   
   Strategy: additive overlay — DOM surgery + empty state
   injection. Zero logic changes to existing auth/session/
   request/reservation systems.
   
   Guard: window._fxAdP1Loaded (idempotent)
   ============================================================ */
;(function () {
  'use strict';
  if (window._fxAdP1Loaded) return;
  window._fxAdP1Loaded = true;

  /* ── Helpers ─────────────────────────────────────────── */
  function el(id)     { return document.getElementById(id); }
  function qs(sel)    { return document.querySelector(sel); }
  function qsa(sel)   { return Array.from(document.querySelectorAll(sel)); }
  function ls(key,fb) {
    try { return localStorage.getItem(key) || fb; } catch(e){ return fb; }
  }

  /* ── Profile data (real — read from localStorage hydrated by
        fixeo-dashboard-artisan-existing.js from Supabase session) */
  function getProfile() {
    return {
      name:  ls('user_name', ls('fixeo_user_name', '')),
      city:  ls('user_city', ''),
      job:   ls('user_job',  ''),
      phone: ls('user_phone',''),
      email: ls('fixeo_user', ''),
      photo: ls('user_avatar','')
    };
  }

  /* ── Checklist logic ─────────────────────────────────── */
  function buildChecklistItems(p) {
    return [
      {
        id:   'name',
        label: 'Nom complet',
        done:  !!(p.name && p.name.trim().length > 1),
        action: null
      },
      {
        id:   'city',
        label: 'Ville d\u2019intervention',
        done:  !!(p.city && p.city.trim().length > 1),
        action: "showSection('settings')"
      },
      {
        id:   'job',
        label: 'M\u00e9tier / sp\u00e9cialit\u00e9',
        done:  !!(p.job && p.job.trim().length > 1),
        action: "showSection('settings')"
      },
      {
        id:   'phone',
        label: 'T\u00e9l\u00e9phone / WhatsApp',
        done:  !!(p.phone && p.phone.replace(/\D/g,'').length >= 9),
        action: "showSection('settings')"
      },
      {
        id:   'photo',
        label: 'Photo de profil',
        done:  !!(p.photo && p.photo.trim().length > 4),
        action: "showSection('settings')"
      },
      {
        id:   'portfolio',
        label: 'Premi\u00e8re r\u00e9alisation',
        done:  (function(){
          try {
            var stored = JSON.parse(localStorage.getItem('fixeo_portfolio') || '[]');
            return stored.length > 0;
          } catch(e){ return false; }
        })(),
        action: "showSection('portfolio')"
      }
    ];
  }

  function getCompletionPct(items) {
    return Math.round((items.filter(i => i.done).length / items.length) * 100);
  }

  function getStatusFromItems(items, pct) {
    if (pct >= 100) return { cls: 'active',     label: 'Profil actif',               sub: 'Visible dans votre ville' };
    if (pct >= 50)  return { cls: 'verif',      label: 'Profil en cours de v\u00e9rification', sub: 'Compl\u00e9tez votre profil pour \u00eatre visible' };
    return            { cls: 'incomplete', label: 'Profil incomplet',            sub: 'Ajoutez vos informations pour recevoir des demandes' };
  }

  /* ── RENDER: Status Banner ───────────────────────────── */
  function renderStatusBanner(p, status) {
    var cityJob = [p.job, p.city].filter(Boolean).join(' \u00b7 ');
    return `<div class="fxadp1-status-banner" id="fxadp1-status-banner">
      <div class="fxadp1-status-dot ${status.cls}"></div>
      <div class="fxadp1-status-body">
        <div class="fxadp1-status-label">Statut du profil</div>
        <div class="fxadp1-status-text">${status.label}</div>
        ${cityJob ? `<div class="fxadp1-status-meta">${cityJob}</div>` : ''}
      </div>
      <button class="fxadp1-status-cta" onclick="showSection('settings')">
        Modifier le profil
      </button>
    </div>`;
  }

  /* ── RENDER: Checklist Card ──────────────────────────── */
  function renderChecklist(items, pct) {
    var rows = items.map(function(item) {
      return `<div class="fxadp1-check-row${item.done ? ' done' : ''}">
        <div class="fxadp1-check-icon">${item.done ? '\u2713' : '\u00b7'}</div>
        <div class="fxadp1-check-label">${item.label}</div>
        ${!item.done && item.action
          ? `<button class="fxadp1-check-action" onclick="${item.action}">Compléter &rsaquo;</button>`
          : (item.done ? `<span style="font-size:.72rem;opacity:.45">Fait</span>` : '')}
      </div>`;
    }).join('');

    return `<div class="fxadp1-checklist-card" id="fxadp1-checklist">
      <div class="fxadp1-checklist-head">
        <h3 class="fxadp1-checklist-title">Activation du profil</h3>
        <span class="fxadp1-progress-pill">${pct}% compl\u00e9t\u00e9</span>
      </div>
      <div class="fxadp1-progress-bar-wrap">
        <div class="fxadp1-progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="fxadp1-checklist-items">${rows}</div>
    </div>`;
  }

  /* ── RENDER: How It Works ────────────────────────────── */
  var HOW_IT_WORKS_HTML = `<div class="fxadp1-howto-card" id="fxadp1-howto">
    <div class="fxadp1-howto-title">Comment \u00e7a marche</div>
    <div class="fxadp1-howto-steps">
      <div class="fxadp1-howto-step">
        <div class="fxadp1-howto-num">1</div>
        <span>Un client poste une demande sur Fixeo</span>
      </div>
      <div class="fxadp1-howto-step">
        <div class="fxadp1-howto-num">2</div>
        <span>Fixeo envoie la demande aux artisans correspondant \u00e0 votre ville et votre m\u00e9tier</span>
      </div>
      <div class="fxadp1-howto-step">
        <div class="fxadp1-howto-num">3</div>
        <span>Vous recevez une notification WhatsApp ou dans ce tableau de bord</span>
      </div>
      <div class="fxadp1-howto-step">
        <div class="fxadp1-howto-num">4</div>
        <span>Vous r\u00e9pondez \u00b7 Le client confirme \u00b7 La mission est cr\u00e9\u00e9e</span>
      </div>
    </div>
  </div>`;

  /* ── RENDER: Empty requests state ───────────────────── */
  var EMPTY_REQUESTS_HTML = `<div class="fxadp1-empty-requests" id="fxadp1-empty-req">
    <div class="fxadp1-empty-icon">📬</div>
    <div class="fxadp1-empty-title">Aucune demande re\u00e7ue pour le moment</div>
    <ul class="fxadp1-empty-hints">
      <li><span style="opacity:.4">\u2014</span> Les demandes apparaissent selon votre ville et votre m\u00e9tier</li>
      <li><span style="opacity:.4">\u2014</span> Les profils complets re\u00e7oivent plus de demandes</li>
      <li><span style="opacity:.4">\u2014</span> Ajoutez des r\u00e9alisations pour renforcer votre profil</li>
    </ul>
  </div>`;

  /* ── RENDER: Availability block ─────────────────────── */
  function renderAvailBlock(p) {
    var hasWa    = !!(p.phone && p.phone.replace(/\D/g,'').length >= 9);
    var hasCity  = !!(p.city && p.city.trim().length > 1);
    var hasMet   = !!(p.job  && p.job.trim().length  > 1);
    return `<div class="fxadp1-avail-card" id="fxadp1-avail">
      <div class="fxadp1-avail-title">Visibilit\u00e9 actuelle</div>
      <div class="fxadp1-avail-row">
        <div class="fxadp1-avail-label">Statut</div>
        <div class="fxadp1-avail-value ok" id="fxadp1-avail-toggle">● Disponible</div>
      </div>
      <div class="fxadp1-avail-row">
        <div class="fxadp1-avail-label">WhatsApp</div>
        <div class="fxadp1-avail-value ${hasWa ? 'ok' : 'warn'}">${hasWa ? '\u2713 Configur\u00e9 (' + p.phone + ')' : '\u26a0 Non renseign\u00e9'}</div>
      </div>
      <div class="fxadp1-avail-row">
        <div class="fxadp1-avail-label">Zone d\u2019intervention</div>
        <div class="fxadp1-avail-value ${hasCity ? 'ok' : 'warn'}">${hasCity ? p.city : '\u26a0 Ville non renseign\u00e9e'}</div>
      </div>
      <div class="fxadp1-avail-row">
        <div class="fxadp1-avail-label">M\u00e9tier</div>
        <div class="fxadp1-avail-value ${hasMet ? 'ok' : 'warn'}">${hasMet ? p.job : '\u26a0 M\u00e9tier non renseign\u00e9'}</div>
      </div>
    </div>`;
  }

  /* ── OVERVIEW: replace fake content ─────────────────── */
  function patchOverview() {
    var p     = getProfile();
    var items = buildChecklistItems(p);
    var pct   = getCompletionPct(items);
    var status= getStatusFromItems(items, pct);

    /* 1. Patch hero heading paragraph */
    var heroPara = qs('#section-overview .dashboard-top p');
    if (heroPara) {
      // Replace fake "5 nouvelles demandes" text
      // CSS hides #new-requests-count; we replace the whole paragraph text
      heroPara.innerHTML = status.cls === 'active'
        ? 'Votre profil est actif — vous recevrez les demandes correspondant \u00e0 votre profil.'
        : 'Compl\u00e9tez votre profil pour commencer \u00e0 recevoir des demandes.';
    }

    /* 2. Patch hero CTA to settings if profile incomplete */
    var heroBtn = qs('#section-overview .btn-primary-action');
    if (heroBtn && pct < 100) {
      heroBtn.textContent = 'Compl\u00e9ter mon profil';
      heroBtn.setAttribute('onclick', "showSection('settings')");
    }

    /* 3. Clear and replace the main layout area */
    var layout = qs('#section-overview .artisan-dashboard-layout');
    if (layout) {
      layout.innerHTML = '';
      // Remove the layout container so our full-width blocks look right
      layout.style.display = 'block';
    }

    /* 4. Hide business-secondary-grid (charts) via CSS + ensure zero height */
    var bsg = qs('.business-secondary-grid');
    if (bsg) bsg.style.display = 'none';

    /* 5. Hide missions table card */
    qsa('.chart-card').forEach(function(card) {
      if (card.querySelector('.jobs-table')) card.style.display = 'none';
    });

    /* 6. Build injection HTML */
    var injection = [
      renderStatusBanner(p, status),
      renderChecklist(items, pct),
      HOW_IT_WORKS_HTML,
      EMPTY_REQUESTS_HTML,
      renderAvailBlock(p)
    ].join('');

    /* 7. Insert after hero section, before gamification-secondary */
    var heroSection = qs('#section-overview .artisan-dashboard-hero');
    if (heroSection && heroSection.parentNode) {
      var wrapper = document.createElement('div');
      wrapper.id = 'fxadp1-overview-injection';
      wrapper.innerHTML = injection;
      heroSection.insertAdjacentElement('afterend', wrapper);
    }

    /* 8. Show real requests if FixeoClientRequestsStore has data */
    _syncRealRequests();
  }

  /* ── SYNC: real request data (if exists in localStorage) */
  function _syncRealRequests() {
    var emptyEl = el('fxadp1-empty-req');
    if (!emptyEl) return;
    try {
      var stored = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      if (stored.length > 0) {
        // Real requests exist — hide empty state (COD system will render them)
        emptyEl.style.display = 'none';
      }
    } catch(e) {}
  }

  /* ── REQUESTS SECTION: replace fake grid ────────────── */
  function patchRequestsSection() {
    var grid = el('requests-grid');
    if (!grid) return;

    // Remove fake BUSINESS_REQUESTS cards if they were injected
    // (renderDemoRequests() may have already run by DOMContentLoaded)
    // We overwrite with empty state + real data note
    var stored = [];
    try { stored = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]'); } catch(e){}

    if (stored.length === 0 && grid.children.length > 0) {
      // Has fake cards — replace
      grid.innerHTML = EMPTY_REQUESTS_HTML;
    }
    // If has real data: leave it; fixeo-artisan-cod.js handles it
  }

  /* ── EARNINGS SECTION: replace fake KPIs + chart ─────── */
  function patchEarningsSection() {
    var section = el('section-earnings');
    if (!section) return;

    // Get real mission data
    var missions = [];
    try { missions = JSON.parse(localStorage.getItem('fixeo_missions_v2') || '[]'); } catch(e){}
    var validated = missions.filter(function(m){ return m.status === 'validated' || m.status === 'completed'; });
    var active    = missions.filter(function(m){ return m.status === 'active' || m.status === 'en_cours'; });
    var pending   = missions.filter(function(m){ return m.status === 'pending' || m.status === 'nouvelle'; });
    var totalEarned = validated.reduce(function(s,m){ return s + (Number(m.price)||0); }, 0);

    // Remove the fake KPI grid (3 hardcoded cards)
    var fakeKpiGrid = qs('#section-earnings > div[style*="repeat(3,1fr)"]');
    if (fakeKpiGrid) fakeKpiGrid.style.display = 'none';

    // Remove fake revenue chart card
    var fakeChart = qs('#section-earnings .chart-card');
    if (fakeChart) fakeChart.style.display = 'none';

    // Hide artisan-cod-earnings section if empty (COD system renders it if has data)
    // We'll inject our honest state after it

    var hasActivity = validated.length > 0 || active.length > 0;

    var newContent = '';
    if (hasActivity) {
      newContent = `<div class="fxadp1-activity-grid">
        <div class="fxadp1-activity-card">
          <div class="fxadp1-activity-value">${validated.length}</div>
          <div class="fxadp1-activity-label">Missions termin\u00e9es</div>
        </div>
        <div class="fxadp1-activity-card">
          <div class="fxadp1-activity-value">${active.length}</div>
          <div class="fxadp1-activity-label">Missions en cours</div>
        </div>
        <div class="fxadp1-activity-card">
          <div class="fxadp1-activity-value">${pending.length}</div>
          <div class="fxadp1-activity-label">Demandes en attente</div>
        </div>
        ${totalEarned > 0
          ? `<div class="fxadp1-activity-card">
              <div class="fxadp1-activity-value" style="color:#20c997">${Math.round(totalEarned).toLocaleString('fr-FR')} MAD</div>
              <div class="fxadp1-activity-label">Revenus confirm\u00e9s</div>
            </div>`
          : ''}
      </div>`;
    } else {
      newContent = `<div class="fxadp1-earnings-empty">
        <div class="fxadp1-earnings-empty-icon">\ud83d\udcc8</div>
        <div class="fxadp1-earnings-empty-title">Votre activit\u00e9 appara\u00eetra ici</div>
        <div class="fxadp1-earnings-empty-sub">Les revenus et statistiques s\u2019affichent\u00a0d\u00e8s votre premi\u00e8re mission termin\u00e9e.</div>
      </div>`;
    }

    var injWrap = document.createElement('div');
    injWrap.id = 'fxadp1-earnings-injection';
    injWrap.innerHTML = newContent;

    var codEarnings = el('artisan-cod-earnings');
    if (codEarnings) {
      codEarnings.insertAdjacentElement('afterend', injWrap);
    } else {
      var heading = section.querySelector('h2');
      if (heading) heading.insertAdjacentElement('afterend', injWrap);
    }
  }

  /* ── PORTFOLIO SECTION: remove Unsplash images ────────── */
  function patchPortfolioSection() {
    var grid = el('portfolio-grid');
    if (!grid) return;

    // Check real portfolio in localStorage
    var realPortfolio = [];
    try { realPortfolio = JSON.parse(localStorage.getItem('fixeo_portfolio') || '[]'); } catch(e){}

    // Remove Unsplash fake items (keep the "+" add button)
    qsa('#portfolio-grid .portfolio-item').forEach(function(item) {
      var img = item.querySelector('img');
      if (img && img.src && img.src.indexOf('unsplash.com') !== -1) {
        item.remove();
      }
    });

    // Remove fake items that came from localStorage demo data
    // Keep only the "+" add card and real uploads

    if (realPortfolio.length === 0 && !qs('#portfolio-grid .portfolio-item:not([onclick])')) {
      // Grid now has only the "+" button; add the empty state before it
      var emptyState = document.createElement('div');
      emptyState.className = 'fxadp1-portfolio-empty';
      emptyState.innerHTML = `<div style="font-size:2rem;margin-bottom:10px;opacity:.5">\ud83d\udcf8</div>
        <div style="font-size:.95rem;font-weight:700;margin-bottom:6px">Ajoutez vos premi\u00e8res r\u00e9alisations</div>
        <div style="font-size:.82rem;opacity:.55;line-height:1.5">Les r\u00e9alisations rassurent les clients et renforcent votre profil.</div>`;
      grid.insertBefore(emptyState, grid.firstChild);
    }
  }

  /* ── PROGRESSION SECTION: disable fake XP farming ────── */
  function patchProgressionSection() {
    // Add honest note about XP sources
    var xpText = qs('.xp-level-text');
    if (xpText) {
      var note = document.createElement('div');
      note.className = 'fxadp1-real-xp-note';
      note.textContent = 'L\u2019exp\u00e9rience (XP) est gagn\u00e9e via des actions r\u00e9elles\u00a0: profil compl\u00e9t\u00e9, premi\u00e8re mission, avis re\u00e7u.';
      xpText.insertAdjacentElement('afterend', note);
    }
  }

  /* ── SUBSCRIPTION SECTION: replace fake plan card ─────── */
  function patchSubscriptionSection() {
    var section = el('section-subscription');
    if (!section) return;

    // Read real plan from localStorage (default to 'free' if not explicitly set)
    var rawPlan = ls('fixeo_current_plan', 'free');
    // Only trust 'pro' or 'premium' if payment records exist in localStorage
    var payHistory = [];
    try { payHistory = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]'); } catch(e){}
    var hasPaidPlan = payHistory.length > 0;
    // If no payment history, reset plan perception to free
    if (!hasPaidPlan && (rawPlan === 'pro' || rawPlan === 'premium')) {
      rawPlan = 'free';
    }

    var planMeta = {
      free:    { icon: '\ud83c\udf00', name: 'Plan Gratuit', sub: 'Acc\u00e8s de base \u00e0 la plateforme', color: 'rgba(255,255,255,0.08)' },
      pro:     { icon: '\ud83c\udfc5', name: 'Plan Pro',     sub: 'Acc\u00e8s complet aux demandes', color: 'rgba(225,48,108,0.08)' },
      premium: { icon: '\ud83d\udc51', name: 'Plan Premium', sub: 'Acc\u00e8s \u00e9lite + mise en avant', color: 'rgba(252,175,69,0.08)' }
    };
    var meta = planMeta[rawPlan] || planMeta.free;

    // Update sidebar badge
    var badge = el('current-plan-badge');
    if (badge) {
      var badgeNames = { free: 'Gratuit', pro: 'Pro', premium: 'Premium' };
      badge.textContent = badgeNames[rawPlan] || 'Gratuit';
    }

    // Find and replace the fake "Pro Actif / Renouvellement" card
    // It's the first .chart-card inside section-subscription
    var fakeCard = section.querySelector('.chart-card');
    if (fakeCard) {
      fakeCard.style.display = 'none';
      fakeCard.id = 'fxadp1-fake-plan-card';
    }

    // Insert honest plan card before the fake one
    var honestCard = document.createElement('div');
    honestCard.className = 'fxadp1-plan-card';
    honestCard.innerHTML = `
      <div class="fxadp1-plan-icon" style="background:${meta.color}">${meta.icon}</div>
      <div class="fxadp1-plan-body">
        <div class="fxadp1-plan-name">${meta.name}</div>
        <div class="fxadp1-plan-sub">${meta.sub}</div>
      </div>
      <a href="pricing.html" class="fxadp1-status-cta">Voir les plans &rsaquo;</a>
    `;
    if (fakeCard && fakeCard.parentNode) {
      fakeCard.parentNode.insertBefore(honestCard, fakeCard);
    }

    // Hide upgrade card if already premium
    if (rawPlan === 'premium') {
      qsa('#section-subscription .chart-card').forEach(function(c) {
        if (c.querySelector('.btn-premium')) c.style.display = 'none';
      });
    }
  }

  /* ── PAYMENT HISTORY: strip SAMPLE_HISTORY injected rows ─ */
  function patchPaymentHistory() {
    // The artisan-subscription.js will have injected SAMPLE_HISTORY
    // into #artisan-payment-history-body. Our strategy:
    // Check each row — if the reference starts with TXN- and there's
    // NO matching entry in fixeo_payment_history, it's fake → remove it.

    var tbody = el('artisan-payment-history-body');
    if (!tbody) return;

    var realHistory = [];
    try { realHistory = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]'); } catch(e){}
    var realRefs = realHistory.map(function(h){ return h.id || h.ref || ''; });

    var rows = Array.from(tbody.querySelectorAll('tr'));
    var keptCount = 0;
    rows.forEach(function(row) {
      var refCell = row.cells && row.cells[0];
      var ref = refCell ? refCell.textContent.trim() : '';
      if (ref.match(/^TXN-/i) && realRefs.indexOf(ref) === -1) {
        row.remove();
      } else {
        keptCount++;
      }
    });

    // If nothing remains, show empty state
    if (tbody.querySelectorAll('tr').length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-muted);font-size:.84rem">Aucun paiement enregistr\u00e9</td></tr>`;
    }
  }

  /* ── CHAT: replace fake conversation ─────────────────── */
  function patchChat() {
    var msgs = el('chat-messages');
    if (!msgs) return;
    // Remove the hardcoded "Bonjour, je suis intéressé…" message
    qsa('#chat-messages .msg.received').forEach(function(m) {
      // Only remove if it's the hardcoded one (has no timestamp attribute)
      if (!m.dataset.real) m.remove();
    });
    // Add honest empty state if no messages remain
    if (!msgs.querySelector('.msg')) {
      var empty = document.createElement('div');
      empty.className = 'fxadp1-chat-empty';
      empty.textContent = 'Les conversations appara\u00eetront ici.';
      msgs.appendChild(empty);
    }
    // Patch sendMessage to not auto-reply with bot
    var orig = window.sendMessage;
    if (typeof orig === 'function') {
      window.sendMessage = function() {
        var i = el('chat-input-field');
        var m = el('chat-messages');
        if (!i || !m || !i.value.trim()) return;
        var empty = m.querySelector('.fxadp1-chat-empty');
        if (empty) empty.remove();
        var sent = document.createElement('div');
        sent.className = 'msg sent';
        sent.textContent = i.value;
        m.appendChild(sent);
        m.scrollTop = m.scrollHeight;
        i.value = '';
        // NO auto-reply setTimeout
      };
    }
  }

  /* ── SETTINGS: wire save button honestly ─────────────── */
  function patchSettings() {
    var saveBtn = el('settings-artisan-save');
    if (!saveBtn) return;

    // Add click handler — saves to localStorage (real backend write
    // requires Supabase RLS fix; localStorage is what the existing
    // fixeo-dashboard-artisan-existing.js already reads)
    saveBtn.addEventListener('click', function() {
      var name  = (el('settings-artisan-name')  || {}).value  || '';
      var phone = (el('settings-artisan-phone') || {}).value  || '';
      var city  = (el('settings-artisan-city')  || {}).value  || '';
      var email = (el('settings-artisan-email') || {}).value  || '';

      if (!name.trim()) {
        if (window.notifications) notifications.warn('Champ requis', 'Veuillez saisir votre nom complet.');
        return;
      }

      // Write to localStorage (same keys read by existing auth system)
      try {
        localStorage.setItem('user_name',       name);
        localStorage.setItem('fixeo_user_name', name);
        localStorage.setItem('user_phone',      phone);
        localStorage.setItem('user_city',       city);
        // Update sidebar name immediately
        var sidebarName = el('sidebar-username');
        if (sidebarName) sidebarName.textContent = name;
        var heroName = el('artisan-hero-name');
        if (heroName) heroName.textContent = name.split(' ')[0];
        // Refresh checklist/status
        refreshActivationState();
        if (window.notifications) notifications.success('Profil mis \u00e0 jour', 'Vos informations ont \u00e9t\u00e9 sauvegard\u00e9es.');
      } catch(e) {
        if (window.notifications) notifications.warn('Erreur', 'Impossible de sauvegarder.');
      }
    });
  }

  /* ── REFRESH: re-render activation state after settings save */
  function refreshActivationState() {
    var banner = el('fxadp1-status-banner');
    var checklist = el('fxadp1-checklist');
    var avail = el('fxadp1-avail');
    var p = getProfile();
    var items = buildChecklistItems(p);
    var pct = getCompletionPct(items);
    var status = getStatusFromItems(items, pct);

    if (banner) {
      var dot = banner.querySelector('.fxadp1-status-dot');
      var txt = banner.querySelector('.fxadp1-status-text');
      var sub = banner.querySelector('.fxadp1-status-meta');
      if (dot) { dot.className = 'fxadp1-status-dot ' + status.cls; }
      if (txt) txt.textContent = status.label;
      if (sub) sub.textContent = [p.job, p.city].filter(Boolean).join(' \u00b7 ');
    }
    if (checklist) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderChecklist(items, pct);
      checklist.innerHTML = tmp.firstChild.innerHTML;
      var bar = checklist.querySelector('.fxadp1-progress-bar-fill');
      if (bar) bar.style.width = pct + '%';
    }
    if (avail) {
      var tmp2 = document.createElement('div');
      tmp2.innerHTML = renderAvailBlock(p);
      avail.innerHTML = tmp2.firstChild.innerHTML;
    }
  }

  /* ── BLOCK fake XP gain from fake requests ────────────── */
  function blockFakeXPFarm() {
    // Patch acceptDemoRequest to not add XP (it's fake)
    // but still provide UI state change
    var origAccept = window.acceptDemoRequest;
    if (typeof origAccept === 'function' && !origAccept._p1Patched) {
      window.acceptDemoRequest = function(btn) {
        var card = btn.closest('.request-card');
        if (!card) return;
        card.classList.add('is-accepted');
        btn.textContent = 'R\u00e9ponse envoy\u00e9e';
        btn.disabled = true;
        var secondary = card.querySelector('.btn-secondary');
        if (secondary) secondary.style.display = 'none';
        // No XP gain, no fake success notification
      };
      window.acceptDemoRequest._p1Patched = true;
    }
  }

  /* ── HIDE FAKE sections in overview hero area ──────────── */
  function hideInlineHeaderFakeCount() {
    // The "Vous avez 5 nouvelles demandes" paragraph in .dashboard-top
    // CSS already hides #new-requests-count; patch the whole <p> text
    var para = qs('#section-overview .dashboard-top p');
    if (para && para.querySelector('#new-requests-count')) {
      para.style.display = 'none';
    }
  }

  /* ── MAIN INIT ───────────────────────────────────────── */
  function init() {
    patchOverview();
    patchRequestsSection();
    patchEarningsSection();
    patchPortfolioSection();
    patchProgressionSection();
    patchSettings();
    patchChat();

    // Subscription + payment: run after artisan-subscription.js has fired
    // (it runs on DOMContentLoaded; we're also on DOMContentLoaded → defer slightly)
    setTimeout(function() {
      patchSubscriptionSection();
      patchPaymentHistory();
      blockFakeXPFarm();
      hideInlineHeaderFakeCount();
    }, 80);

    // Sync real requests periodically (in case COD system populates later)
    setTimeout(_syncRealRequests, 600);
    window.addEventListener('fixeo:missions:updated', _syncRealRequests);
    window.addEventListener('fixeo:state:updated',    _syncRealRequests);
  }

  /* Run after DOM + existing scripts have had their turn */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Already ready — run on next tick to let inline DOMContentLoaded
    // listeners finish first (renderDemoRequests, artisan-subscription.js etc.)
    setTimeout(init, 0);
  }

})();
