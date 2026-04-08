/**
 * ================================================================
 *  FIXEO v8 — HERO SEARCH MODAL
 *  Full pipeline: Search → Artisan Cards → Reserve → Payment
 *  One seamless modal — no scrolls, no redirects
 *  Compatible with FixeoReservation (reservation.js) + FixeoPayment
 * ================================================================
 */

'use strict';

(function (window) {

  /* ── IDs ── */
  const MODAL_ID   = 'hsm-modal';
  const BACKDROP_ID = 'hsm-backdrop';

  /* ── Category / Icon maps (mirrors reservation.js) ── */
  const CAT_ICONS = {
    plomberie: '🔧', electricite: '⚡', peinture: '🎨', nettoyage: '🧹',
    jardinage: '🌿', demenagement: '🚛', bricolage: '🔨', climatisation: '❄️',
    menuiserie: '🪚', maconnerie: '🧱', serrurerie: '🔑', carrelage: '🏠',
  };
  const CAT_LABELS = {
    plomberie: 'Plomberie', electricite: 'Électricité', peinture: 'Peinture',
    nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement',
    bricolage: 'Bricolage', climatisation: 'Climatisation', menuiserie: 'Menuiserie',
    maconnerie: 'Maçonnerie', serrurerie: 'Serrurerie', carrelage: 'Carrelage',
  };
  const BADGE_LABELS = {
    verified:    { icon: '✅', label: 'Vérifié' },
    pro:         { icon: '🥇', label: 'Pro' },
    top_rated:   { icon: '⭐', label: 'Top Noté' },
    legendary:   { icon: '🏆', label: 'Légendaire' },
    expert:      { icon: '🎓', label: 'Expert' },
    responsive:  { icon: '⚡', label: 'Réactif' },
    friendly:    { icon: '😊', label: 'Sympa' },
  };

  /* ── State ── */
  const state = {
    results: [],
    searchContext: {},
    total: 0,
  };

  /* ────────────────────────────────
     UTILS
  ──────────────────────────────── */

  function sanitize(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  function buildInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  }

  function starString(rating) {
    const full  = Math.round(rating || 4);
    const empty = 5 - full;
    return '★'.repeat(Math.max(0, full)) + '☆'.repeat(Math.max(0, empty));
  }

  function normAvail(a) {
    const av = (a.availability || '').toLowerCase();
    if (av === 'available' || av === 'disponible') return 'available';
    if (av === 'busy')                              return 'busy';
    return 'offline';
  }

  /* ────────────────────────────────
     DOM HELPERS
  ──────────────────────────────── */

  function ensureBackdrop() {
    let bd = document.getElementById(BACKDROP_ID);
    if (!bd) {
      bd = document.createElement('div');
      bd.id        = BACKDROP_ID;
      bd.className = 'hsm-backdrop';
      bd.setAttribute('aria-hidden', 'true');
      bd.addEventListener('click', close);
      document.body.appendChild(bd);
    }
    return bd;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id        = MODAL_ID;
      modal.className = 'hsm-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Résultats de recherche');
      document.body.appendChild(modal);
    }
    return modal;
  }

  /* ────────────────────────────────
     RENDER — ARTISAN CARD
  ──────────────────────────────── */

  function renderCard(a, idx) {
    const avail     = normAvail(a);
    const dotCls    = avail;
    const isAvail   = avail === 'available';
    const catIcon   = CAT_ICONS[a.category]  || '🛠️';
    const catLabel  = CAT_LABELS[a.category] || (a.category || 'Service');
    const rating    = parseFloat(a.rating)   || 4.8;
    const trust     = a.trustScore           || 0;
    const initials  = a.initials             || buildInitials(a.name);
    const featured  = idx === 0 ? ' featured' : '';
    const fastBadge = (a.responseTime && a.responseTime <= 25)
      ? `<span class="hsm-card-badge fast">⚡ < ${a.responseTime} min</span>`
      : '';

    const badgesHtml = (a.badges || []).slice(0, 2).map(b => {
      const bd = BADGE_LABELS[b] || { icon: '🏅', label: b };
      return `<span class="hsm-card-badge">${bd.icon} ${bd.label}</span>`;
    }).join('');

    return `
<div class="hsm-artisan-card${featured}" data-artisan-id="${a.id}">
  <!-- Avatar -->
  <div class="hsm-card-avatar" aria-hidden="true">
    ${sanitize(initials)}
    <span class="hsm-avatar-dot ${dotCls}" title="${isAvail ? 'Disponible' : avail === 'busy' ? 'Occupé' : 'Hors ligne'}"></span>
  </div>

  <!-- Info -->
  <div class="hsm-card-info">
    <div class="hsm-card-top">
      <span class="hsm-card-name">${sanitize(a.name)}</span>
      ${isAvail ? '<span class="hsm-badge-available">⚡ Disponible aujourd\'hui</span>' : ''}
    </div>
    <div class="hsm-card-meta">
      <span class="hsm-card-rating">
        <span class="hsm-card-stars">${starString(rating)}</span>
        ${rating.toFixed(1)}
      </span>
      <span class="hsm-card-meta-sep">·</span>
      <span>${catIcon} ${catLabel}</span>
      <span class="hsm-card-meta-sep">·</span>
      <span class="hsm-card-city">📍 ${sanitize(a.city || 'Maroc')}</span>
      <span class="hsm-card-meta-sep">·</span>
      <span class="hsm-card-price">💰 ${a.priceFrom || 150} MAD/${a.priceUnit || 'h'}</span>
    </div>
    <div class="hsm-card-badges">
      ${trust >= 80 ? `<span class="hsm-card-badge trust">🛡 ${trust}%</span>` : ''}
      ${fastBadge}
      ${badgesHtml}
    </div>
  </div>

  <!-- Actions -->
  <div class="hsm-card-actions">
    <button
      class="hsm-btn-reserve"
      onclick="window.HeroSearchModal._bookArtisan(${a.id}, false); event.stopPropagation();"
      aria-label="Réserver ${sanitize(a.name)}">
      📅 Réserver
    </button>
    <button
      class="hsm-btn-express"
      onclick="window.HeroSearchModal._bookArtisan(${a.id}, true); event.stopPropagation();"
      aria-label="Demande express pour ${sanitize(a.name)}">
      ⚡ Urgent
    </button>
  </div>
</div>`;
  }

  /* ────────────────────────────────
     RENDER — FULL MODAL HTML
  ──────────────────────────────── */

  function renderModal() {
    const ctx     = state.searchContext;
    const results = state.results;
    const total   = state.total;

    /* Build context tags */
    let tagsHtml = '';
    if (ctx.query) {
      tagsHtml += `<span class="hsm-context-tag">🔍 ${sanitize(ctx.query)}</span>`;
    }
    if (ctx.category && CAT_LABELS[ctx.category]) {
      tagsHtml += `<span class="hsm-context-tag">${CAT_ICONS[ctx.category] || '🛠️'} ${CAT_LABELS[ctx.category]}</span>`;
    }
    if (ctx.city) {
      tagsHtml += `<span class="hsm-context-tag">📍 ${sanitize(ctx.city)}</span>`;
    }
    if (!tagsHtml) {
      tagsHtml = '<span class="hsm-context-tag">🛠️ Tous les artisans</span>';
    }

    /* Header subtitle */
    const headerSub = results.length
      ? `${results.length} artisan${results.length !== 1 ? 's' : ''} correspondant${results.length !== 1 ? 's' : ''} à votre recherche`
      : 'Aucun artisan trouvé pour ces critères';

    /* Cards HTML */
    let cardsHtml = '';
    if (results.length === 0) {
      cardsHtml = `
<div class="hsm-empty">
  <div class="hsm-empty-icon">🔎</div>
  <div class="hsm-empty-title">Aucun artisan trouvé</div>
  <div class="hsm-empty-sub">Essayez d'autres critères ou élargissez votre zone de recherche.</div>
  <button class="hsm-empty-cta" onclick="window.HeroSearchModal.close(); document.getElementById('artisans-section')?.scrollIntoView({behavior:'smooth'});">
    👷 Voir tous les artisans
  </button>
</div>`;
    } else {
      cardsHtml = results.slice(0, 5).map((a, i) => renderCard(a, i)).join('');
    }

    /* "Voir tous" footer button */
    const seeAllHtml = (total > 5) ? `
<button class="hsm-footer-see-all"
        onclick="window.HeroSearchModal.close(); setTimeout(()=>document.getElementById('artisans-section')?.scrollIntoView({behavior:'smooth'}),200);">
  👷 Voir tous les ${total} artisans →
</button>` : (results.length > 0 ? `
<button class="hsm-footer-see-all"
        onclick="window.HeroSearchModal.close(); setTimeout(()=>document.getElementById('artisans-section')?.scrollIntoView({behavior:'smooth'}),200);">
  👷 Voir dans la liste →
</button>` : '');

    return `
<div class="hsm-dialog" role="document">

  <!-- Header -->
  <div class="hsm-header">
    <div class="hsm-header-icon" aria-hidden="true">🔍</div>
    <div class="hsm-header-text">
      <div class="hsm-header-title">Artisans trouvés</div>
      <div class="hsm-header-sub">${headerSub}</div>
    </div>
    <button class="hsm-header-close"
            onclick="window.HeroSearchModal.close()"
            aria-label="Fermer">✕</button>
  </div>

  <!-- Context bar -->
  <div class="hsm-context-bar">
    ${tagsHtml}
    ${results.length ? `<span class="hsm-context-count">${results.length} résultat${results.length !== 1 ? 's' : ''}</span>` : ''}
  </div>

  <!-- Body: artisan cards -->
  <div class="hsm-body">
    <div class="hsm-cards-grid">
      ${cardsHtml}
    </div>
  </div>

  <!-- Footer -->
  <div class="hsm-footer">
    <div class="hsm-footer-security">
      <span>🔒 SSL 256-bit</span>
      <span>🛡️ 3D Secure</span>
      <span>✅ Artisans vérifiés</span>
      <span>🔄 Remboursement 14j</span>
    </div>
    ${seeAllHtml}
  </div>

</div>`;
  }

  /* ────────────────────────────────
     PUBLIC API
  ──────────────────────────────── */

  /**
   * Open the Hero Search Modal with search results.
   * @param {Array}  results       - filtered artisan objects
   * @param {Object} searchContext - { query, category, city }
   * @param {number} [totalCount]  - total matches before slice (for "see all" btn)
   */
  function open(results, searchContext, totalCount) {
    state.results       = Array.isArray(results) ? results : [];
    state.searchContext = searchContext || {};
    state.total         = typeof totalCount === 'number' ? totalCount : state.results.length;

    const bd    = ensureBackdrop();
    const modal = ensureModal();

    /* Show loading briefly for UX polish */
    modal.innerHTML = `
<div class="hsm-dialog" role="document">
  <div class="hsm-header">
    <div class="hsm-header-icon">🔍</div>
    <div class="hsm-header-text">
      <div class="hsm-header-title">Recherche en cours…</div>
    </div>
    <button class="hsm-header-close" onclick="window.HeroSearchModal.close()" aria-label="Fermer">✕</button>
  </div>
  <div class="hsm-body">
    <div class="hsm-loading">
      <div class="hsm-spinner"></div>
      <div class="hsm-loading-text">Recherche des meilleurs artisans…</div>
    </div>
  </div>
</div>`;

    bd.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    /* Populate after micro-delay for smooth fade-in */
    setTimeout(() => {
      modal.innerHTML = renderModal();
      /* Focus first focusable element */
      requestAnimationFrame(() => {
        const first = modal.querySelector('button, [tabindex="0"]');
        if (first) first.focus();
      });
    }, 180);

    /* Keyboard: Escape to close */
    document._hsmKeyHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', document._hsmKeyHandler);
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    const bd    = document.getElementById(BACKDROP_ID);
    if (modal) modal.classList.remove('open');
    if (bd)    bd.classList.remove('open');
    document.body.style.overflow = '';
    if (document._hsmKeyHandler) {
      document.removeEventListener('keydown', document._hsmKeyHandler);
      document._hsmKeyHandler = null;
    }
  }

  /**
   * Internal: called by card buttons
   * @param {number}  artisanId
   * @param {boolean} isExpress
   */
  function _bookArtisan(artisanId, isExpress) {
    /* Resolve artisan object */
    const pool     = window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
    const artisan  = pool.find(a => a.id === artisanId || a.id === parseInt(artisanId, 10));
    const input    = artisan || artisanId;

    /* Close this modal first, then open reservation */
    close();

    setTimeout(() => {
      if (window.FixeoReservation) {
        if (isExpress) {
          window.FixeoReservation.openExpress(input);
        } else {
          window.FixeoReservation.open(input, false);
        }
      } else if (typeof openBookingModal === 'function') {
        openBookingModal(artisanId);
      } else {
        console.warn('FixeoReservation not found. Artisan ID:', artisanId);
      }
    }, 200);
  }

  /* ── Expose globally ── */
  window.HeroSearchModal = { open, close, _bookArtisan };

}(window));
