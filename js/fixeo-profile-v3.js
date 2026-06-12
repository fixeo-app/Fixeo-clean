/* ================================================================
   FIXEO — Public Artisan Profile V3 Enhancement Layer
   fxpv3-v1a  |  2026-06-12

   Architecture:
   - MutationObserver on #public-artisan-root — waits for .public-profile-hero
   - 5 Blocks: Hero meta + Why artisan + Service chips + Availability + Trust
   - Sticky CTA: replaces ppui-sticky-cta with fxpv3-sticky
   - Namespace: fxpv3-* / #fxpv3-*
   - Idempotent guards per block
   - Teardown on URL change (SPA guard)
   - Never touches: reservation.js, fixeo-public-artisan-profile.js,
     fixeo-reservation-v3.js, fixeo-reservation-supabase-bridge.js

   Data sources (read-only):
   - window._fixeoCurrentArtisan (set by fixeo-profile-v2a.js)
   - window._fxRv3State.priceRange (set by FXRV3)
   - PRICING / CHIP_DATA inline maps (mirrored from FXRV3)
   - City tier logic (mirrored from FXRV3)
   ================================================================ */

;(function () {
  'use strict';

  if (window._fxPv3Loaded) return;
  window._fxPv3Loaded = true;

  /* Only run on artisan-profile page */
  var _page = (window.location.pathname.split('/').pop() || '');
  if (_page && _page !== 'artisan-profile.html' && _page !== 'artisan-profile') {
    var _path = window.location.pathname;
    if (_path.indexOf('artisan-profile') === -1) return;
  }

  /* ── State ─────────────────────────────────────────────── */
  var _injected = false;
  var _heroEl   = null;

  /* ── Pricing map (mirrored from FXRV3) ─────────────────── */
  var PRICING = {
    'Urgence plomberie':            '200–400 MAD',
    'Réparation chauffe-eau':       '200–500 MAD',
    'Fuite d\'eau — réparation':    '150–300 MAD',
    'Installation sanitaire':       '250–600 MAD',
    'Panne électrique':             '150–350 MAD',
    'Urgence électrique':           '200–500 MAD',
    'Installation électrique':      '200–600 MAD',
    'Prise ou interrupteur en panne':'80–200 MAD',
    'Porte bloquée':                '150–350 MAD',
    'Ouverture de porte':           '150–300 MAD',
    'Changement serrure':           '200–450 MAD',
    'Sécurisation porte':           '300–700 MAD',
    'Urgence serrurerie':           '200–450 MAD',
    'Panne climatiseur':            '200–400 MAD',
    'Réparation climatiseur':       '200–500 MAD',
    'Entretien climatiseur':        '200–400 MAD',
    'Installation climatiseur':     '400–900 MAD',
    'Urgence climatisation':        '350–750 MAD',
    'Porte ou fenêtre bloquée':     '150–350 MAD',
    'Réparation menuiserie':        '200–500 MAD',
    'Peinture intérieure':          '20–60 MAD/m²',
    'Peinture extérieure':          '25–80 MAD/m²'
  };

  /* ── Chip data (mirrored from FXRV3) ────────────────────── */
  var CHIP_DATA = {
    plomberie: [
      { icon: '💧', label: 'Fuite d\'eau',    value: 'Urgence plomberie' },
      { icon: '🚿', label: 'Chauffe-eau',     value: 'Réparation chauffe-eau' },
      { icon: '🚽', label: 'WC bouché',       value: 'Urgence plomberie' },
      { icon: '🔧', label: 'Fuite générale',  value: 'Fuite d\'eau — réparation' },
      { icon: '⚙️', label: 'Installation',    value: 'Installation sanitaire' },
      { icon: '🆘', label: 'Urgence',         value: 'Urgence plomberie' }
    ],
    electricite: [
      { icon: '⚡', label: 'Panne élec',         value: 'Panne électrique' },
      { icon: '🔌', label: 'Disjoncteur',         value: 'Urgence électrique' },
      { icon: '💡', label: 'Installation',        value: 'Installation électrique' },
      { icon: '🔧', label: 'Prise/interrupteur',  value: 'Prise ou interrupteur en panne' },
      { icon: '🚨', label: 'Urgence élec',        value: 'Urgence électrique' }
    ],
    serrurerie: [
      { icon: '🔑', label: 'Porte bloquée',   value: 'Porte bloquée' },
      { icon: '🚪', label: 'Ouverture',        value: 'Ouverture de porte' },
      { icon: '🔐', label: 'Serrure',          value: 'Changement serrure' },
      { icon: '🛡️', label: 'Sécurisation',    value: 'Sécurisation porte' },
      { icon: '🆘', label: 'Urgence',          value: 'Urgence serrurerie' }
    ],
    climatisation: [
      { icon: '❄️', label: 'Clim en panne',   value: 'Panne climatiseur' },
      { icon: '🔧', label: 'Réparation',       value: 'Réparation climatiseur' },
      { icon: '🧹', label: 'Entretien',        value: 'Entretien climatiseur' },
      { icon: '📦', label: 'Installation',     value: 'Installation climatiseur' },
      { icon: '🚨', label: 'Urgence clim',     value: 'Urgence climatisation' }
    ],
    menuiserie: [
      { icon: '🪵', label: 'Porte/fenêtre',   value: 'Porte ou fenêtre bloquée' },
      { icon: '🔨', label: 'Réparation',       value: 'Réparation menuiserie' },
      { icon: '🚨', label: 'Urgence',          value: 'Réparation menuiserie' }
    ],
    peinture: [
      { icon: '🎨', label: 'Peinture int.',    value: 'Peinture intérieure' },
      { icon: '🏠', label: 'Peinture ext.',    value: 'Peinture extérieure' },
      { icon: '🖌️', label: 'Décoration',      value: 'Peinture intérieure' }
    ],
    default: [
      { icon: '🔧', label: 'Réparation',       value: 'Intervention rapide' },
      { icon: '🚨', label: 'Urgence',          value: 'Urgence' },
      { icon: '🏗️', label: 'Installation',    value: 'Installation' },
      { icon: '🧹', label: 'Entretien',        value: 'Entretien' }
    ]
  };

  /* ── Category → French label ────────────────────────────── */
  var CAT_FR = {
    plomberie: 'Plombier', electricite: 'Électricien', serrurerie: 'Serrurier',
    climatisation: 'Technicien clim', menuiserie: 'Menuisier', peinture: 'Peintre',
    nettoyage: 'Agent de nettoyage', maconnerie: 'Maçon', carrelage: 'Carreleur',
    jardinage: 'Jardinier', demenagement: 'Déménageur', bricolage: 'Bricoleur',
    toiture: 'Couvreur', vitrerie: 'Vitrier', soudure: 'Soudeur',
    informatique: 'Technicien informatique'
  };

  /* ── ETA city tier (mirrored from FXRV3) ───────────────── */
  var CITY_TIER = {
    tier1: ['casablanca','rabat','marrakech'],
    tier2: ['fes','tanger','agadir','meknes'],
  };

  function _getETA(city, urgency) {
    var c = (city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var base = 35;
    if (CITY_TIER.tier1.indexOf(c) !== -1) base = 15;
    else if (CITY_TIER.tier2.indexOf(c) !== -1) base = 22;
    var factor = urgency === 'extreme' ? 0.65 : urgency === 'urgent' ? 0.80 : 1.0;
    var h = new Date().getHours();
    var night = (h >= 22 || h < 7) ? 8 : 0;
    return Math.round((base * factor + night) / 5) * 5;
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _catSlug(cat) {
    return (cat || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')
      .replace('electricite','electricite')
      .replace('electricit','electricite');
  }

  function _getArtisan() {
    return window._fixeoCurrentArtisan || null;
  }

  function _getInitials(name) {
    var parts = (name || 'A').split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return (parts[0] || 'A')[0].toUpperCase();
  }

  function _getStars(rating) {
    var r = Math.round(Math.min(5, Math.max(0, parseFloat(rating) || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  function _formatPhone(phone) {
    /* normalize moroccan phone for wa.me link */
    var p = String(phone || '').replace(/\s|-|\./g,'');
    if (p.indexOf('212') === 0) return '+' + p;
    if (p.indexOf('+212') === 0) return p;
    if (p.indexOf('0') === 0) return '+212' + p.slice(1);
    return p;
  }

  function _el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls + ' fxpv3-injected';
    else e.className = 'fxpv3-injected';
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /* ── Open reservation modal with artisan + service ──────── */
  function _openReservation(serviceValue, isUrgent) {
    var artisan = _getArtisan();
    if (!artisan) {
      /* Try findCurrentArtisan via inline scope — fallback: click native CTA */
      var nativeCta = document.getElementById('public-artisan-action');
      if (nativeCta) nativeCta.click();
      return;
    }

    /* Ensure FixeoReservation is ready */
    if (!window.FixeoReservation || typeof window.FixeoReservation.open !== 'function') {
      setTimeout(function() { _openReservation(serviceValue, isUrgent); }, 350);
      return;
    }

    /* Pass artisan to reservation */
    if (isUrgent) {
      window.FixeoReservation.open(artisan, false, {
        urgent: true,
        category: artisan.category,
        query: serviceValue || ''
      });
    } else {
      window.FixeoReservation.open(artisan, false);
    }

    /* If service chip value given, preselect in FXRV3 after modal opens */
    if (serviceValue && !isUrgent) {
      setTimeout(function() {
        /* Try to find and click matching FXRV3 chip */
        var chips = document.querySelectorAll('.fxrv3-chip');
        for (var i = 0; i < chips.length; i++) {
          if (chips[i].dataset.value === serviceValue) {
            chips[i].click();
            break;
          }
        }
        /* Also write directly to #res-service as fallback */
        var svcEl = document.getElementById('res-service');
        if (svcEl) {
          svcEl.value = serviceValue;
          svcEl.dispatchEvent(new Event('change', { bubbles: true }));
          svcEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        /* Refresh FXRV3 AI card */
        if (typeof window._fxRv3RefreshAI === 'function') {
          window._fxRv3RefreshAI();
        }
      }, 200);
    }
  }

  /* ── BLOCK 1: Inject hero meta (rating + availability) ─── */
  function _injectHeroMeta(hero, artisan) {
    if (hero.dataset.fxpv3Meta) return;
    hero.dataset.fxpv3Meta = '1';

    var heroMain = hero.querySelector('.public-hero-main');
    if (!heroMain) return;

    var h1 = heroMain.querySelector('h1');
    if (!h1) return;

    /* Rating row */
    var rating  = parseFloat(artisan.rating) || 0;
    var reviews = parseInt(artisan.review_count, 10) || 0;
    var avail   = (artisan.availability || 'available').toLowerCase();
    var isAvail = avail !== 'busy' && avail !== 'unavailable' && avail !== 'occupé';
    var rtMin   = parseInt(artisan.response_time_min, 10) || 0;

    var metaDiv = _el('div', 'fxpv3-hero-meta');

    if (rating > 0) {
      metaDiv.innerHTML +=
        '<span class="fxpv3-rating-stars">' + _esc(_getStars(rating)) + '</span>' +
        '<span class="fxpv3-rating-val">' + rating.toFixed(1) + '</span>' +
        (reviews > 0 ? '<span class="fxpv3-review-count">(' + reviews + ' avis)</span>' : '');
    }

    var availLabel = isAvail ? '🟢 Disponible' : '🟡 Occupé';
    var availCls   = isAvail ? 'available' : 'busy';
    metaDiv.innerHTML +=
      '<span class="fxpv3-avail-pill ' + availCls + '">' + availLabel + '</span>';

    if (rtMin > 0) {
      metaDiv.innerHTML +=
        '<span class="fxpv3-response-pill">⚡ Répond en ~' + rtMin + ' min</span>';
    }

    /* Insert after h1 */
    h1.parentNode.insertBefore(metaDiv, h1.nextSibling);

    /* ── CTA row ────────────────────────────────────────── */
    if (hero.dataset.fxpv3Cta) return;
    hero.dataset.fxpv3Cta = '1';

    /* Build WhatsApp link */
    var phone   = artisan.phone || '';
    var waPhone = phone ? _formatPhone(phone) : '212660484415';
    var waMsg   = encodeURIComponent(
      'Bonjour ' + (artisan.name || 'Fixeo') + ', je souhaite réserver une intervention via Fixeo.'
    );
    var waHref  = 'https://wa.me/' + waPhone.replace('+','') + '?text=' + waMsg;

    var ctaRow = _el('div', 'fxpv3-cta-row');
    ctaRow.innerHTML =
      '<button class="fxpv3-btn-primary" id="fxpv3-reserve-btn" type="button">' +
        '✅ Réserver maintenant' +
      '</button>' +
      '<div class="fxpv3-btn-row">' +
        '<button class="fxpv3-btn-urgent" id="fxpv3-urgent-btn" type="button">⚡ Urgent</button>' +
        '<a class="fxpv3-btn-wa" href="' + _esc(waHref) + '" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>' +
      '</div>' +
      '<p class="fxpv3-reassurance">✔ Paiement après intervention &bull; ✔ Prix fixé avant travaux</p>';

    /* Find existing CTA button — insert fxpv3 CTA right before it (keep old button hidden) */
    var oldCta = heroMain.querySelector('#public-artisan-action, .public-action-btn');
    if (oldCta) {
      /* Hide the native CTA — fxpv3 supersedes it visually */
      oldCta.style.display = 'none';
      heroMain.insertBefore(ctaRow, oldCta);
    } else {
      heroMain.appendChild(ctaRow);
    }

    /* Wire primary CTA */
    var reserveBtn = document.getElementById('fxpv3-reserve-btn');
    if (reserveBtn) {
      reserveBtn.addEventListener('click', function() {
        _openReservation('', false);
      });
    }

    /* Wire urgent CTA */
    var urgentBtn = document.getElementById('fxpv3-urgent-btn');
    if (urgentBtn) {
      urgentBtn.addEventListener('click', function() {
        _openReservation('', true);
      });
    }
  }

  /* ── BLOCK 2: Why this artisan ──────────────────────────── */
  function _injectWhyArtisan(hero, artisan) {
    if (hero.dataset.fxpv3Why) return;
    hero.dataset.fxpv3Why = '1';

    var missions  = parseInt(artisan.completed_missions, 10) || 0;
    var rtMin     = parseInt(artisan.response_time_min, 10) || 0;
    var longevity = 0;
    if (artisan.created_at) {
      var created = new Date(artisan.created_at);
      if (!isNaN(created)) {
        longevity = Math.max(0, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      }
    }
    var verified  = !!artisan.verified || !!(artisan.is_claimed);

    var items = [];
    if (missions > 0)   items.push({ icon: '✔️', text: missions + ' interventions réussies' });
    if (rtMin > 0)      items.push({ icon: '⚡', text: 'Répond en ~' + rtMin + ' min' });
    else                items.push({ icon: '⚡', text: 'Réponse rapide' });
    if (longevity > 0)  items.push({ icon: '📅', text: 'Actif depuis ' + longevity + ' mois' });
    if (verified)       items.push({ icon: '✅', text: 'Vérifié par Fixeo' });
    else                items.push({ icon: '🛡️', text: 'Profil Fixeo actif' });

    /* Ensure at least 2 items */
    if (items.length < 2) items.push({ icon: '💳', text: 'Paiement après satisfaction' });

    var card = _el('div', 'fxpv3-why-card');
    card.innerHTML =
      '<div class="fxpv3-why-title">Pourquoi cet artisan ?</div>' +
      '<div class="fxpv3-why-grid">' +
        items.slice(0, 4).map(function(item) {
          return '<div class="fxpv3-why-item">' +
            '<span class="fxpv3-why-icon">' + _esc(item.icon) + '</span>' +
            '<span>' + _esc(item.text) + '</span>' +
            '</div>';
        }).join('') +
      '</div>';

    hero.appendChild(card);
  }

  /* ── BLOCK 3: Service chips ─────────────────────────────── */
  function _injectServiceChips(hero, artisan) {
    if (hero.dataset.fxpv3Chips) return;
    hero.dataset.fxpv3Chips = '1';

    var slug  = _catSlug(artisan.category || '');
    var chips = CHIP_DATA[slug] || CHIP_DATA['default'];
    if (!chips || chips.length === 0) return;

    var section = _el('div', 'fxpv3-chips-section');
    section.innerHTML = '<div class="fxpv3-section-title fxpv3-injected">Que souhaitez-vous réparer ?</div>';

    var grid = document.createElement('div');
    grid.className = 'fxpv3-chips-grid fxpv3-injected';

    chips.forEach(function(chip) {
      var price = PRICING[chip.value] || '';
      var chipEl = document.createElement('button');
      chipEl.type = 'button';
      chipEl.className = 'fxpv3-chip fxpv3-injected';
      chipEl.dataset.value = chip.value;
      chipEl.innerHTML =
        '<span class="fxpv3-chip-icon">' + chip.icon + '</span>' +
        '<span class="fxpv3-chip-label">' + _esc(chip.label) + '</span>' +
        (price ? '<span class="fxpv3-chip-price">' + _esc(price) + '</span>' : '');
      chipEl.addEventListener('click', function() {
        _openReservation(chip.value, false);
      });
      grid.appendChild(chipEl);
    });

    section.appendChild(grid);
    hero.appendChild(section);
  }

  /* ── BLOCK 4: Availability + ETA ────────────────────────── */
  function _injectAvailability(hero, artisan) {
    if (hero.dataset.fxpv3Avail) return;
    hero.dataset.fxpv3Avail = '1';

    var city    = artisan.city || '';
    var avail   = (artisan.availability || 'available').toLowerCase();
    var isAvail = avail !== 'busy' && avail !== 'unavailable' && avail !== 'occupé';
    var eta     = _getETA(city, 'standard');
    var cat     = _catSlug(artisan.category || '');
    var hasUrg  = ['plomberie','electricite','serrurerie','climatisation'].indexOf(cat) !== -1;

    var card = _el('div', 'fxpv3-avail-card');
    var labelHtml = isAvail
      ? '<div class="fxpv3-avail-row"><div class="fxpv3-avail-dot"></div><span class="fxpv3-avail-label">Disponible aujourd\'hui</span></div>'
      : '<div class="fxpv3-avail-row"><span class="fxpv3-avail-label" style="color:#fbbf24">🟡 Occupé momentanément</span></div>';

    card.innerHTML =
      labelHtml +
      '<div class="fxpv3-avail-meta">' +
        '<span>⏱️ Arrivée estimée ~' + eta + ' min</span>' +
        (city ? '<span>📍 Intervient à ' + _esc(city) + ' et alentours</span>' : '') +
        (hasUrg ? '<span>🚨 Urgence disponible 7j/7</span>' : '') +
      '</div>';

    hero.appendChild(card);
  }

  /* ── BLOCK 5: Trust score ───────────────────────────────── */
  function _injectTrustScore(hero, artisan) {
    if (hero.dataset.fxpv3Trust) return;
    hero.dataset.fxpv3Trust = '1';

    var score    = parseFloat(artisan.trust_score) || 0;
    var verified = !!artisan.verified || !!(artisan.is_claimed);
    var rtMin    = parseInt(artisan.response_time_min, 10) || 0;
    var missions = parseInt(artisan.completed_missions, 10) || 0;

    /* Derive honest score if none from DB */
    if (score === 0) {
      var derived = 40; /* base for being registered */
      if (verified)   derived += 20;
      if (missions > 0) derived += Math.min(20, Math.round(missions / 5));
      if (artisan.description) derived += 10;
      if (artisan.rating > 0) derived += 10;
      score = Math.min(95, derived);
    }

    var signals = [
      { icon: '✅', text: verified ? 'Profil vérifié' : 'Profil actif',     ok: true },
      { icon: '📞', text: artisan.phone ? 'Téléphone confirmé' : 'Contact disponible', ok: !!artisan.phone },
      { icon: '⚡', text: rtMin > 0 ? 'Répond en ~' + rtMin + ' min' : 'Répond vite', ok: true },
      { icon: '✔️', text: missions > 0 ? missions + ' missions' : 'Profil Fixeo',  ok: true }
    ];

    var card = _el('div', 'fxpv3-trust-card');
    card.innerHTML =
      '<div class="fxpv3-trust-header">' +
        '<span class="fxpv3-trust-label">🛡️ Fixeo Trust Score</span>' +
        '<span class="fxpv3-trust-score-badge">' + Math.round(score) + ' <span>/ 100</span></span>' +
      '</div>' +
      '<div class="fxpv3-trust-bar"><div class="fxpv3-trust-bar-fill" id="fxpv3-trust-fill" style="width:0%"></div></div>' +
      '<div class="fxpv3-trust-signals">' +
        signals.map(function(s) {
          return '<div class="fxpv3-signal">' +
            '<span class="fxpv3-signal-icon">' + s.icon + '</span>' +
            '<span>' + _esc(s.text) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';

    hero.appendChild(card);

    /* Animate bar after paint */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var fill = document.getElementById('fxpv3-trust-fill');
        if (fill) fill.style.width = Math.round(score) + '%';
      });
    });
  }

  /* ── GUARANTEE BLOCK ────────────────────────────────────── */
  function _injectGuarantee(hero) {
    if (hero.dataset.fxpv3Guarantee) return;
    hero.dataset.fxpv3Guarantee = '1';

    var block = _el('div', 'fxpv3-guarantee');
    block.innerHTML =
      '<div class="fxpv3-guarantee-title">🛡️ Garantie Fixeo</div>' +
      '<div class="fxpv3-guarantee-items">' +
        '<div class="fxpv3-guarantee-item">✔️ <span>Paiement après intervention — jamais avant</span></div>' +
        '<div class="fxpv3-guarantee-item">✔️ <span>Prix confirmé avant le début des travaux</span></div>' +
        '<div class="fxpv3-guarantee-item">✔️ <span>Assistance Fixeo disponible 7j/7</span></div>' +
      '</div>';

    hero.appendChild(block);
  }

  /* ── STICKY CTA ─────────────────────────────────────────── */
  function _buildSticky(artisan) {
    if (document.getElementById('fxpv3-sticky')) return;

    var city = artisan ? artisan.city || '' : '';
    var eta  = _getETA(city, 'standard');
    var avail = artisan ? (artisan.availability || 'available') : 'available';
    var isAvail = (avail !== 'busy' && avail !== 'unavailable');

    var bar = document.createElement('div');
    bar.id = 'fxpv3-sticky';
    bar.setAttribute('aria-label', 'Réserver cet artisan');
    bar.innerHTML =
      '<div class="fxpv3-sticky-meta">' +
        '<span class="fxpv3-sticky-avail">🟢 ' + (isAvail ? 'Disponible' : 'Contactable') + '</span>' +
        '<span>·</span>' +
        '<span>⏱️ ~' + eta + ' min</span>' +
      '</div>' +
      '<button class="fxpv3-sticky-btn" type="button" id="fxpv3-sticky-btn">✅ Réserver maintenant</button>';

    document.body.appendChild(bar);

    document.getElementById('fxpv3-sticky-btn').addEventListener('click', function() {
      _openReservation('', false);
    });

    /* Show/hide based on hero CTA visibility */
    if (window.IntersectionObserver) {
      var heroCta = document.getElementById('fxpv3-reserve-btn') ||
                    document.getElementById('public-artisan-action');
      if (heroCta) {
        var obs = new IntersectionObserver(function(entries) {
          var visible = entries[0].isIntersecting;
          if (visible) {
            bar.classList.remove('visible');
          } else {
            bar.classList.add('visible');
          }
        }, { threshold: 0.1 });
        obs.observe(heroCta);
      }
    } else {
      /* No IntersectionObserver — always show on mobile (CSS handles desktop hide) */
      bar.classList.add('visible');
    }
  }

  /* ── MAIN UPGRADE FUNCTION ──────────────────────────────── */
  function _upgradeProfile() {
    if (_injected) return;

    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    var hero = root.querySelector('.public-profile-hero');
    if (!hero) return;

    /* Wait for artisan data — poll _fixeoCurrentArtisan */
    var artisan = _getArtisan();

    _heroEl  = hero;
    _injected = true;

    /* Run immediately with whatever data we have, then refresh when Supabase resolves */
    _runBlocks(hero, artisan);

    /* Poll for Supabase data if not yet available */
    if (!artisan || !artisan.id) {
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        var a = _getArtisan();
        if (a && a.id) {
          clearInterval(poll);
          /* Re-run blocks with real data — guards prevent double-injection */
          /* For hero meta and CTA: only inject once (guards in place) */
          /* Trust score and Why block may benefit from refresh */
          _refreshWithRealData(hero, a);
        }
        if (attempts > 20) clearInterval(poll); /* 10s cap */
      }, 500);
    }
  }

  function _runBlocks(hero, artisan) {
    artisan = artisan || {};

    _injectHeroMeta(hero, artisan);
    _injectWhyArtisan(hero, artisan);
    _injectServiceChips(hero, artisan);
    _injectAvailability(hero, artisan);
    _injectTrustScore(hero, artisan);
    _injectGuarantee(hero);
    _buildSticky(artisan);
  }

  function _refreshWithRealData(hero, artisan) {
    /* Only refresh blocks not yet injected with real data */
    /* The guards (dataset flags) prevent re-injection, so this is safe */
    /* Trust score and why-artisan: remove guards to allow refresh with real data */
    if (hero.dataset.fxpv3Trust) {
      /* Remove old trust card and re-inject with real data */
      hero.querySelectorAll('.fxpv3-trust-card.fxpv3-injected').forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      delete hero.dataset.fxpv3Trust;
      _injectTrustScore(hero, artisan);
    }
    if (hero.dataset.fxpv3Why) {
      hero.querySelectorAll('.fxpv3-why-card.fxpv3-injected').forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      delete hero.dataset.fxpv3Why;
      _injectWhyArtisan(hero, artisan);
    }
    /* Refresh sticky ETA */
    var existingSticky = document.getElementById('fxpv3-sticky');
    if (existingSticky) {
      var metaEl = existingSticky.querySelector('.fxpv3-sticky-meta');
      if (metaEl) {
        var eta = _getETA(artisan.city || '', 'standard');
        var isAvail = (artisan.availability || 'available') !== 'busy';
        metaEl.innerHTML =
          '<span class="fxpv3-sticky-avail">🟢 ' + (isAvail ? 'Disponible' : 'Contactable') + '</span>' +
          '<span>·</span>' +
          '<span>⏱️ ~' + eta + ' min</span>';
      }
    }
  }

  /* ── MutationObserver — watch for renderProfile() ──────── */
  function _observe() {
    var root = document.getElementById('public-artisan-root');
    if (!root) {
      /* Root not yet in DOM — wait for DOMContentLoaded */
      document.addEventListener('DOMContentLoaded', function() {
        var r = document.getElementById('public-artisan-root');
        if (r) _startObserver(r);
      });
      return;
    }
    _startObserver(root);
  }

  function _startObserver(root) {
    /* Check if hero already rendered (fast-path fxfp) */
    var hero = root.querySelector('.public-profile-hero');
    if (hero) {
      /* Already rendered — run immediately */
      setTimeout(_upgradeProfile, 80);
    }

    var obs = new MutationObserver(function() {
      if (!_injected && root.querySelector('.public-profile-hero')) {
        setTimeout(_upgradeProfile, 80);
      }
    });

    obs.observe(root, { childList: true, subtree: true });

    /* Also listen for renderProfile completion event */
    document.addEventListener('fixeo:profileRendered', function() {
      if (!_injected) setTimeout(_upgradeProfile, 80);
    });
  }

  /* ── Boot ───────────────────────────────────────────────── */
  _observe();

})();
