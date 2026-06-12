/* ============================================================
   FIXEO Reservation V3 — fxrv3-v1a
   Pure additive UX enhancement over existing reservation modal
   Pattern: MutationObserver on #fixeo-reservation-modal
   ============================================================ */
(function () {
  'use strict';

  if (window._fxRv3Loaded) return;
  window._fxRv3Loaded = true;

  window._fxRv3State = {};

  /* ── PRICING MAP ──────────────────────────────────────── */

  var PRICING = {
    'Urgence plomberie': '200–400 MAD',
    'Réparation chauffe-eau': '200–500 MAD',
    'Fuite d\'eau — réparation': '150–300 MAD',
    'Installation sanitaire': '250–600 MAD',
    'Panne électrique': '150–350 MAD',
    'Urgence électrique': '200–500 MAD',
    'Installation électrique': '200–600 MAD',
    'Prise ou interrupteur en panne': '80–200 MAD',
    'Porte bloquée': '150–350 MAD',
    'Ouverture de porte': '150–300 MAD',
    'Changement serrure': '200–450 MAD',
    'Sécurisation porte': '300–700 MAD',
    'Urgence serrurerie': '200–450 MAD',
    'Panne climatiseur': '200–400 MAD',
    'Réparation climatiseur': '200–500 MAD',
    'Entretien climatiseur': '200–400 MAD',
    'Installation climatiseur': '400–900 MAD',
    'Urgence climatisation': '350–750 MAD',
    'Porte ou fenêtre bloquée': '150–350 MAD',
    'Réparation menuiserie': '200–500 MAD',
    'Peinture intérieure': '20–60 MAD/m²',
    'Peinture extérieure': '25–80 MAD/m²'
  };

  /* ── CHIP DATA ────────────────────────────────────────── */

  var CHIP_DATA = {
    plomberie: [
      { icon: '💧', label: 'Fuite d\'eau', value: 'Urgence plomberie' },
      { icon: '🚿', label: 'Chauffe-eau', value: 'Réparation chauffe-eau' },
      { icon: '🔧', label: 'Fuite générale', value: 'Fuite d\'eau — réparation' },
      { icon: '🚽', label: 'WC bouché', value: 'Urgence plomberie' },
      { icon: '⚙️', label: 'Installation', value: 'Installation sanitaire' },
      { icon: '🆘', label: 'Urgence', value: 'Urgence plomberie' }
    ],
    electricite: [
      { icon: '⚡', label: 'Panne élec', value: 'Panne électrique' },
      { icon: '🔌', label: 'Disjoncteur', value: 'Urgence électrique' },
      { icon: '💡', label: 'Installation', value: 'Installation électrique' },
      { icon: '🔧', label: 'Prise/interrupteur', value: 'Prise ou interrupteur en panne' },
      { icon: '🚨', label: 'Urgence élec', value: 'Urgence électrique' }
    ],
    serrurerie: [
      { icon: '🔑', label: 'Porte bloquée', value: 'Porte bloquée' },
      { icon: '🚪', label: 'Ouverture', value: 'Ouverture de porte' },
      { icon: '🔐', label: 'Serrure', value: 'Changement serrure' },
      { icon: '🛡️', label: 'Sécurisation', value: 'Sécurisation porte' },
      { icon: '🆘', label: 'Urgence', value: 'Urgence serrurerie' }
    ],
    climatisation: [
      { icon: '❄️', label: 'Clim en panne', value: 'Panne climatiseur' },
      { icon: '🔧', label: 'Réparation', value: 'Réparation climatiseur' },
      { icon: '🧹', label: 'Entretien', value: 'Entretien climatiseur' },
      { icon: '📦', label: 'Installation', value: 'Installation climatiseur' },
      { icon: '🚨', label: 'Urgence clim', value: 'Urgence climatisation' }
    ],
    menuiserie: [
      { icon: '🪵', label: 'Porte/fenêtre', value: 'Porte ou fenêtre bloquée' },
      { icon: '🔨', label: 'Réparation', value: 'Réparation menuiserie' },
      { icon: '🚨', label: 'Urgence', value: 'Intervention rapide menuiserie' }
    ],
    peinture: [
      { icon: '🎨', label: 'Int.', value: 'Peinture intérieure' },
      { icon: '🏠', label: 'Ext.', value: 'Peinture extérieure' },
      { icon: '🖌️', label: 'Décoration', value: 'Décoration murale' }
    ],
    'default': [
      { icon: '🔧', label: 'Réparation', value: 'Intervention rapide' },
      { icon: '🚨', label: 'Urgence', value: 'Urgence' },
      { icon: '🏗️', label: 'Installation', value: 'Installation' },
      { icon: '🧹', label: 'Entretien', value: 'Entretien' },
      { icon: '🛠️', label: 'Travaux', value: 'Travaux' }
    ]
  };

  /* ── CATEGORY TRANSLATIONS ────────────────────────────── */

  var CAT_FR = {
    plomberie: 'Plombier',
    electricite: 'Électricien',
    serrurerie: 'Serrurier',
    climatisation: 'Technicien Clim',
    menuiserie: 'Menuisier',
    peinture: 'Peintre',
    maconnerie: 'Maçon',
    carrelage: 'Carreleur',
    jardinage: 'Jardinier',
    nettoyage: 'Agent de nettoyage'
  };

  /* ── CITY TIERS ───────────────────────────────────────── */

  var CITY_TIER_1 = ['casablanca', 'casa', 'rabat', 'marrakech', 'marrakesh'];
  var CITY_TIER_2 = ['fes', 'fès', 'tanger', 'tangier', 'agadir', 'meknes', 'meknès'];

  function _cityETA(city) {
    var c = (city || '').toLowerCase().trim();
    if (CITY_TIER_1.indexOf(c) !== -1) return 15;
    if (CITY_TIER_2.indexOf(c) !== -1) return 22;
    return 35;
  }

  function _cityCount(slug, city) {
    if (window.FixeoAIRE && typeof window.FixeoAIRE.getArtisanCount === 'function') {
      try {
        var n = window.FixeoAIRE.getArtisanCount(slug, city);
        if (n) return n;
      } catch (_) {}
    }
    var c = (city || '').toLowerCase().trim();
    if (CITY_TIER_1.indexOf(c) !== -1) return 18;
    if (CITY_TIER_2.indexOf(c) !== -1) return 12;
    return 8;
  }

  function _computeETA(city, urgency) {
    var base = _cityETA(city);
    var factor = urgency === 'extreme' ? 0.65 : urgency === 'urgent' ? 0.80 : 1.0;
    var eta = base * factor;
    var h = new Date().getHours();
    if (h >= 22 || h < 7) eta += 8;
    return Math.round(eta / 5) * 5;
  }

  function _getPriceRange(service) {
    if (!service) return '150–600 MAD';
    if (PRICING[service]) return PRICING[service];
    // Try FixeoEstimation
    var urgency = window._fxRv3State.urgency || 'standard';
    if (window.FixeoEstimation && typeof window.FixeoEstimation.analyze === 'function') {
      try {
        var result = window.FixeoEstimation.analyze({
          serviceName: service,
          isUrgent: urgency !== 'standard',
          isExpress: false
        });
        if (result && result.range) {
          var pr = result.range.from + '–' + result.range.to + ' MAD';
          window._fxRv3State.priceRange = pr;
          return pr;
        }
      } catch (_) {}
    }
    return '150–600 MAD';
  }

  /* ── HELPERS ──────────────────────────────────────────── */

  function _el(tag, cls, extra) {
    var e = document.createElement(tag);
    if (cls) e.className = cls + ' fxrv3-injected';
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) e[k] = extra[k];
      }
    }
    return e;
  }

  function _dispatch(input, type) {
    try { input.dispatchEvent(new Event(type, { bubbles: true })); } catch (_) {}
  }

  function _isoDate(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.toISOString().split('T')[0];
  }

  /* ── TEARDOWN ─────────────────────────────────────────── */

  function _teardown(m) {
    m.querySelectorAll('.fxrv3-injected').forEach(function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });
    m.querySelectorAll('.fxrv3-slot-hidden').forEach(function (el) {
      el.classList.remove('fxrv3-slot-hidden');
    });
    m.querySelectorAll('.fxrv3-hides-rv2').forEach(function (el) {
      el.classList.remove('fxrv3-hides-rv2');
    });
    delete m.dataset.rv3Block1;
    delete m.dataset.rv3Block2;
    delete m.dataset.rv3Block3;
    delete m.dataset.rv3Block4;
    delete m.dataset.rv3;
    window._fxRv3State = {};
  }

  /* ── BLOCK 1 — CHIP GRID ──────────────────────────────── */

  function _injectBlock1(m) {
    if (m.dataset.rv3Block1) return;
    m.dataset.rv3Block1 = '1';

    var form = m.querySelector('.fixeo-res-form');
    if (!form) return;

    var artisan = window._fxRv3State.artisan || {};
    var category = (artisan.category || '').toLowerCase().trim();
    var chips = CHIP_DATA[category] || CHIP_DATA['default'];
    chips = chips.slice(0, 6);

    // Chip grid
    var grid = _el('div', 'fxrv3-chip-grid');

    chips.forEach(function (chip) {
      var btn = _el('button', 'fxrv3-chip');
      btn.type = 'button';
      btn.setAttribute('aria-label', chip.label);

      var iconEl = document.createElement('span');
      iconEl.className = 'fxrv3-chip-icon';
      iconEl.textContent = chip.icon;

      var labelEl = document.createElement('span');
      labelEl.className = 'fxrv3-chip-label';
      labelEl.textContent = chip.label;

      btn.appendChild(iconEl);
      btn.appendChild(labelEl);

      var price = PRICING[chip.value];
      if (price) {
        var priceEl = document.createElement('span');
        priceEl.className = 'fxrv3-chip-price';
        priceEl.textContent = price;
        btn.appendChild(priceEl);
      }

      btn.addEventListener('click', function () {
        // Deactivate siblings
        grid.querySelectorAll('.fxrv3-chip').forEach(function (c) {
          c.classList.remove('fxrv3-chip-active');
        });
        btn.classList.add('fxrv3-chip-active');

        var inp = document.getElementById('res-service');
        if (inp) {
          inp.value = chip.value;
          _dispatch(inp, 'input');
          _dispatch(inp, 'change');
        }
        window._fxRv3State.service = chip.value;
        window._fxRv3State.priceRange = price || '150–600 MAD';

        if (typeof window._fxRv3RefreshAI === 'function') {
          window._fxRv3RefreshAI();
        }
      });

      grid.appendChild(btn);
    });

    form.parentNode.insertBefore(grid, form);

    // Urgency segment
    var seg = _el('div', 'fxrv3-urgency-segment');

    var segLabel = document.createElement('span');
    segLabel.className = 'fxrv3-urgency-label';
    segLabel.textContent = 'Urgence :';
    seg.appendChild(segLabel);

    var urgencies = [
      { key: 'standard', label: 'Standard' },
      { key: 'urgent', label: '⚡ Urgent' },
      { key: 'extreme', label: '🚨 Extrême' }
    ];

    function _setUrgency(key) {
      window._fxRv3State.urgency = key;
      seg.querySelectorAll('.fxrv3-urgency-btn').forEach(function (b) {
        b.classList.remove('fxrv3-urgency-active');
      });
      var active = seg.querySelector('[data-urgency="' + key + '"]');
      if (active) active.classList.add('fxrv3-urgency-active');

      if (typeof window._fxRv3RefreshAI === 'function') {
        window._fxRv3RefreshAI();
      }

      // Block 2: skip if urgent/extreme
      var timingSection = m.querySelector('.fxrv3-timing-section');
      if (timingSection) {
        if (key === 'urgent' || key === 'extreme') {
          timingSection.style.display = 'none';
          // Unhide native fields
          m.querySelectorAll('.fxrv3-slot-hidden').forEach(function (el) {
            el.classList.remove('fxrv3-slot-hidden');
          });
        } else {
          timingSection.style.display = '';
        }
      }
    }

    urgencies.forEach(function (u) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fxrv3-urgency-btn fxrv3-injected';
      btn.dataset.urgency = u.key;
      btn.textContent = u.label;
      if ((window._fxRv3State.urgency || 'standard') === u.key) {
        btn.classList.add('fxrv3-urgency-active');
      }
      btn.addEventListener('click', function () { _setUrgency(u.key); });
      seg.appendChild(btn);
    });

    form.parentNode.insertBefore(seg, form);

    // Auto-detect urgency from #res-desc
    var descInp = document.getElementById('res-desc');
    if (descInp) {
      descInp.addEventListener('input', function () {
        var val = descInp.value.toLowerCase();
        var triggers = ['gaz', 'fuite importante', 'bloqué', 'feu', 'court-circuit', 'inondation'];
        var isExtreme = false;
        for (var i = 0; i < triggers.length; i++) {
          if (val.indexOf(triggers[i]) !== -1) { isExtreme = true; break; }
        }
        if (isExtreme) _setUrgency('extreme');
      });
    }

    // Init urgency state
    if (!window._fxRv3State.urgency) {
      window._fxRv3State.urgency = 'standard';
    }
  }

  /* ── BLOCK 2 — TIMING CHIPS ───────────────────────────── */

  function _injectBlock2(m) {
    if (m.dataset.rv3Block2) return;

    var urgency = window._fxRv3State.urgency || 'standard';
    if (urgency === 'urgent' || urgency === 'extreme') return;

    // Skip if express banner
    if (m.querySelector('.fixeo-express-banner, .fxrv3-express-active')) return;

    m.dataset.rv3Block2 = '1';

    var h = new Date().getHours();
    var chips;
    if (h < 11) {
      chips = [
        { icon: '⚡', label: 'Maintenant', value: 'today/maintenant' },
        { icon: '🌅', label: 'Ce matin', value: 'today/matin' },
        { icon: '🕑', label: 'Cet après-midi', value: 'today/apresmidi' },
        { icon: '🌙', label: 'Ce soir', value: 'today/soir' },
        { icon: '📅', label: 'Autre horaire', value: 'custom' }
      ];
    } else if (h < 17) {
      chips = [
        { icon: '⚡', label: 'Maintenant', value: 'today/maintenant' },
        { icon: '🕑', label: 'Cet après-midi', value: 'today/apresmidi' },
        { icon: '🌙', label: 'Ce soir', value: 'today/soir' },
        { icon: '🌅', label: 'Demain matin', value: 'tomorrow/matin' },
        { icon: '📅', label: 'Autre horaire', value: 'custom' }
      ];
    } else {
      chips = [
        { icon: '⚡', label: 'Maintenant', value: 'today/maintenant' },
        { icon: '🌙', label: 'Ce soir', value: 'today/soir' },
        { icon: '🌅', label: 'Demain matin', value: 'tomorrow/matin' },
        { icon: '🌅', label: 'Demain après-midi', value: 'tomorrow/apresmidi' },
        { icon: '📅', label: 'Autre horaire', value: 'custom' }
      ];
    }

    var section = _el('div', 'fxrv3-timing-section');

    var title = document.createElement('div');
    title.className = 'fxrv3-timing-title';
    title.textContent = 'Quand ?';
    section.appendChild(title);

    var chipGrid = document.createElement('div');
    chipGrid.className = 'fxrv3-timing-grid';

    // Find and hide native date/slot fields
    var dateInp = document.getElementById('res-date');
    var slotGrid = document.getElementById('res-slot-grid');
    if (dateInp) {
      var dateField = dateInp.closest('.fixeo-res-field') || dateInp.parentNode;
      if (dateField) dateField.classList.add('fxrv3-slot-hidden');
    }
    if (slotGrid) {
      var slotField = slotGrid.closest('.fixeo-res-field') || slotGrid.parentNode;
      if (slotField) slotField.classList.add('fxrv3-slot-hidden');
    }

    chips.forEach(function (chip, idx) {
      var btn = _el('button', 'fxrv3-timing-chip');
      btn.type = 'button';
      btn.textContent = chip.icon + ' ' + chip.label;

      // First chip: recommended badge
      if (idx === 0) {
        var hint = document.createElement('span');
        hint.className = 'fxrv3-hint-badge';
        hint.textContent = '✓ Recommandé · Disponible';
        btn.appendChild(hint);
      }

      // Third chip: demand badge if after 18h
      if (idx === 2 && h > 18) {
        var demand = document.createElement('span');
        demand.className = 'fxrv3-demand-badge';
        demand.textContent = '⚠️ Forte demande';
        btn.appendChild(demand);
      }

      btn.addEventListener('click', function () {
        chipGrid.querySelectorAll('.fxrv3-timing-chip').forEach(function (c) {
          c.classList.remove('fxrv3-timing-active');
        });

        if (chip.value === 'custom') {
          // Show native fields
          if (dateInp) {
            var df2 = dateInp.closest('.fixeo-res-field') || dateInp.parentNode;
            if (df2) df2.classList.remove('fxrv3-slot-hidden');
          }
          if (slotGrid) {
            var sf2 = slotGrid.closest('.fixeo-res-field') || slotGrid.parentNode;
            if (sf2) sf2.classList.remove('fxrv3-slot-hidden');
          }
          return;
        }

        btn.classList.add('fxrv3-timing-active');

        var parts = chip.value.split('/');
        var dayPart = parts[0];
        var slotPart = parts[1];
        var dateVal = dayPart === 'tomorrow' ? _isoDate(1) : _isoDate(0);

        if (dateInp) {
          dateInp.value = dateVal;
          _dispatch(dateInp, 'input');
          _dispatch(dateInp, 'change');
        }

        // Try clicking matching slot in existing slot grid
        if (slotGrid && slotPart) {
          var slotEl = slotGrid.querySelector('[data-slot="' + slotPart + '"]');
          if (slotEl) {
            try { slotEl.click(); } catch (_) {}
          }
        }
      });

      chipGrid.appendChild(btn);
    });

    section.appendChild(chipGrid);

    // Inject before the date field's parent or before the form
    var refNode = null;
    if (dateInp) {
      var df3 = dateInp.closest('.fixeo-res-field') || dateInp.parentNode;
      if (df3 && df3.parentNode) refNode = df3;
    }

    if (refNode && refNode.parentNode) {
      refNode.parentNode.insertBefore(section, refNode);
    } else {
      var form = m.querySelector('.fixeo-res-form');
      if (form && form.parentNode) {
        form.parentNode.insertBefore(section, form);
      }
    }
  }

  /* ── BLOCK 3 — AI ESTIMATION CARD ────────────────────── */

  function _buildAICardContent(m) {
    var state = window._fxRv3State || {};
    var service = state.service || (document.getElementById('res-service') || {}).value || '';
    var urgency = state.urgency || 'standard';
    var artisan = state.artisan || {};
    var city = artisan.city || artisan.location || '';
    var category = artisan.category || '';
    var categoryFr = CAT_FR[category.toLowerCase()] || (category || 'Artisan');
    var slug = artisan.slug || artisan.id || '';

    var priceRange = _getPriceRange(service);
    window._fxRv3State.priceRange = priceRange;

    var eta = _computeETA(city, urgency);
    var count = _cityCount(slug, city);
    var cityDisplay = city || 'Maroc';

    var isNight = (function () {
      var hh = new Date().getHours();
      return hh >= 22 || hh < 7;
    }());

    var urgencyLabel = urgency === 'extreme' ? '🚨 Urgence extrême'
      : urgency === 'urgent' ? '⚡ Urgence'
      : '✅ Urgence standard';

    var html = '<div class="fxrv3-ai-card-inner">'
      + '<div class="fxrv3-ai-header">'
      + '<span class="fxrv3-ai-title">✦ FIXEO AI ESTIMATION</span>'
      + (urgency !== 'standard' ? '<span class="fxrv3-ai-badge">' + (urgency === 'extreme' ? 'EXTRÊME' : 'URGENT') + '</span>' : '')
      + '</div>'
      + '<div class="fxrv3-ai-price">' + priceRange + '</div>'
      + '<div class="fxrv3-ai-price-sub">estimation indicative</div>'
      + '<div class="fxrv3-ai-meta">'
      + (categoryFr ? '<span class="fxrv3-ai-pill">🔧 ' + categoryFr + '</span>' : '')
      + '<span class="fxrv3-ai-pill">' + urgencyLabel + '</span>'
      + '<span class="fxrv3-ai-pill">⏱️ ' + eta + ' min</span>'
      + '<span class="fxrv3-ai-pill">👷 ' + count + ' artisans</span>'
      + (cityDisplay ? '<span class="fxrv3-ai-pill">📍 ' + cityDisplay + '</span>' : '')
      + '</div>'
      + (isNight ? '<div class="fxrv3-ai-surcharge">🌙 Supplément nuit inclus</div>' : '')
      + '<div class="fxrv3-ai-trust">'
      + '<span class="fxrv3-ai-trust-item">✔ Aucun paiement maintenant</span>'
      + '<span class="fxrv3-ai-trust-item">✔ Prix confirmé avant intervention</span>'
      + '<span class="fxrv3-ai-trust-item">✔ Artisan vérifié Fixeo</span>'
      + '</div>'
      + '</div>';

    return html;
  }

  function _injectBlock3(m) {
    var urgency = window._fxRv3State.urgency || 'standard';

    if (!m.dataset.rv3Block3) {
      m.dataset.rv3Block3 = '1';

      var card = _el('div', 'fxrv3-ai-card');
      card.id = 'fxrv3-ai-card-el';
      card.innerHTML = _buildAICardContent(m);

      if (urgency === 'extreme') card.classList.add('fxrv3-extreme');

      // Hide rv2 estimation if present
      var rv2Block = m.querySelector('.fxrv2-estimation');
      if (rv2Block) {
        rv2Block.classList.add('fxrv3-hides-rv2');
        rv2Block.style.display = 'none';
        rv2Block.parentNode.insertBefore(card, rv2Block);
      } else {
        var form = m.querySelector('.fixeo-res-form');
        if (form && form.parentNode) {
          form.parentNode.insertBefore(card, form);
        }
      }
    }

    // Public refresh function — updates content without re-injecting
    window._fxRv3RefreshAI = function () {
      var cardEl = document.getElementById('fxrv3-ai-card-el');
      if (!cardEl) return;
      cardEl.innerHTML = _buildAICardContent(m);
      var currentUrgency = window._fxRv3State.urgency || 'standard';
      if (currentUrgency === 'extreme') {
        cardEl.classList.add('fxrv3-extreme');
      } else {
        cardEl.classList.remove('fxrv3-extreme');
      }
    };
  }

  /* ── BLOCK 4 — HERO CONFIRM CARD ─────────────────────── */

  function _injectBlock4(m) {
    if (m.dataset.rv3Block4) return;
    if (!m.querySelector('.fixeo-res-summary')) return;
    m.dataset.rv3Block4 = '1';

    var artisan = window._fxRv3State.artisan || {};
    var photoUrl = artisan.photo_url || artisan.avatar_url || '';
    var name = artisan.name || artisan.full_name || 'Artisan';
    var initials = name.split(' ').map(function (w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase();
    var category = artisan.category || '';
    var categoryFr = CAT_FR[category.toLowerCase()] || category || '';
    var rating = artisan.rating ? '⭐ ' + artisan.rating : '';
    var verified = artisan.verified || artisan.is_claimed;
    var availability = artisan.availability || '';

    var hero = _el('div', 'fxrv3-hero-card');

    // Artisan info
    var artisanRow = document.createElement('div');
    artisanRow.className = 'fxrv3-hero-artisan';

    if (photoUrl) {
      var img = document.createElement('img');
      img.className = 'fxrv3-hero-avatar';
      img.src = photoUrl;
      img.alt = name;
      img.width = 80;
      img.height = 80;
      artisanRow.appendChild(img);
    } else {
      var initDiv = document.createElement('div');
      initDiv.className = 'fxrv3-hero-avatar-initials';
      initDiv.textContent = initials || '👷';
      artisanRow.appendChild(initDiv);
    }

    var metaDiv = document.createElement('div');
    metaDiv.className = 'fxrv3-hero-meta';

    var nameEl = document.createElement('div');
    nameEl.className = 'fxrv3-hero-name';
    nameEl.textContent = name;
    metaDiv.appendChild(nameEl);

    if (categoryFr) {
      var catEl = document.createElement('div');
      catEl.className = 'fxrv3-hero-category';
      catEl.textContent = categoryFr;
      metaDiv.appendChild(catEl);
    }

    var badgesDiv = document.createElement('div');
    badgesDiv.className = 'fxrv3-hero-badges';

    if (verified) {
      var vBadge = document.createElement('span');
      vBadge.className = 'fxrv3-hero-badge fxrv3-hero-badge-verified';
      vBadge.textContent = '✅ Vérifié Fixeo';
      badgesDiv.appendChild(vBadge);
    }

    if (rating) {
      var rBadge = document.createElement('span');
      rBadge.className = 'fxrv3-hero-badge fxrv3-hero-badge-rating';
      rBadge.textContent = rating;
      badgesDiv.appendChild(rBadge);
    }

    if (availability) {
      var aBadge = document.createElement('span');
      aBadge.className = 'fxrv3-hero-badge fxrv3-hero-badge-avail';
      aBadge.textContent = availability;
      badgesDiv.appendChild(aBadge);
    }

    metaDiv.appendChild(badgesDiv);
    artisanRow.appendChild(metaDiv);
    hero.appendChild(artisanRow);

    // Next steps
    var nextSteps = document.createElement('div');
    nextSteps.className = 'fxrv3-next-steps';

    var nextTitle = document.createElement('div');
    nextTitle.className = 'fxrv3-next-title';
    nextTitle.textContent = 'Et ensuite ?';
    nextSteps.appendChild(nextTitle);

    var steps = [
      { text: '✅ Demande envoyée', done: true },
      { text: '📞 Fixeo confirme sous 30 min', done: false },
      { text: '👷 Artisan assigné', done: false },
      { text: '🔨 Intervention', done: false }
    ];

    steps.forEach(function (step) {
      var stepEl = document.createElement('div');
      stepEl.className = 'fxrv3-next-step' + (step.done ? ' fxrv3-done' : '');
      stepEl.textContent = step.text;
      nextSteps.appendChild(stepEl);
    });

    hero.appendChild(nextSteps);

    // Tracking link
    try {
      var reqs = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      if (Array.isArray(reqs) && reqs.length > 0) {
        var last = reqs[reqs.length - 1];
        var ref = last.tracking_ref || last.ref || last.trackingRef;
        if (ref) {
          var trackLink = document.createElement('a');
          trackLink.className = 'fxrv3-tracking-link fxrv3-injected';
          trackLink.href = '/suivi?ref=' + encodeURIComponent(ref);
          trackLink.textContent = '📱 Suivre mon intervention →';
          hero.appendChild(trackLink);
        }
      }
    } catch (_) {}

    // Insert before .fixeo-res-summary
    var summary = m.querySelector('.fixeo-res-summary');
    if (summary && summary.parentNode) {
      summary.parentNode.insertBefore(hero, summary);
    }

    // Sticky CTA bar — inject into .fixeo-res-dialog
    var dialog = m.querySelector('.fixeo-res-dialog') || m;
    var stickyCta = _el('div', 'fxrv3-sticky-cta');

    var priceRange = window._fxRv3State.priceRange || '150–600 MAD';
    var priceSpan = document.createElement('span');
    priceSpan.className = 'fxrv3-sticky-price';
    priceSpan.textContent = priceRange;
    stickyCta.appendChild(priceSpan);

    var ctaBtn = document.createElement('button');
    ctaBtn.type = 'button';
    ctaBtn.className = 'fxrv3-sticky-btn fxrv3-injected';
    ctaBtn.textContent = '✅ Confirmer la réservation';
    ctaBtn.addEventListener('click', function () {
      var payBtn = document.querySelector('.fixeo-res-btn-pay');
      if (payBtn) payBtn.click();
    });
    stickyCta.appendChild(ctaBtn);

    dialog.appendChild(stickyCta);
  }

  /* ── MAIN ENHANCE ─────────────────────────────────────── */

  function _enhance(m) {
    if (m.dataset.rv3) return;
    m.dataset.rv3 = '1';

    // Init state if needed
    if (!window._fxRv3State) window._fxRv3State = {};
    if (!window._fxRv3State.urgency) window._fxRv3State.urgency = 'standard';

    _injectBlock1(m);
    _injectBlock2(m);
    _injectBlock3(m);
    _injectBlock4(m);
  }

  function _checkModal(m) {
    if (!m) return;
    var isOpen = m.classList.contains('active')
      || m.classList.contains('is-open')
      || m.style.display === 'flex'
      || m.style.display === 'block'
      || m.getAttribute('aria-hidden') === 'false'
      || (m.offsetParent !== null && m.style.display !== 'none');

    if (isOpen) {
      _enhance(m);
    } else {
      if (m.dataset.rv3) {
        _teardown(m);
      }
    }
  }

  /* ── HOOK FixeoReservation.open ───────────────────────── */

  function _hookOpen() {
    if (!window.FixeoReservation) return;
    if (window.FixeoReservation._rv3Hooked) return;
    window.FixeoReservation._rv3Hooked = true;

    var origOpen = window.FixeoReservation.open;
    if (typeof origOpen !== 'function') return;

    window.FixeoReservation.open = function (artisanInput) {
      if (artisanInput && typeof artisanInput === 'object') {
        window._fxRv3State = window._fxRv3State || {};
        window._fxRv3State.artisan = artisanInput;
      }
      return origOpen.apply(this, arguments);
    };
  }

  /* ── OBSERVER ─────────────────────────────────────────── */

  function _init() {
    _hookOpen();

    var modal = document.getElementById('fixeo-reservation-modal');
    if (!modal) return;

    // Initial check
    _checkModal(modal);

    var observer = new MutationObserver(function () {
      _hookOpen(); // ensure hooked after dynamic load
      _checkModal(modal);

      // Also re-check block4 on step change
      if (modal.dataset.rv3 && !modal.dataset.rv3Block4) {
        _injectBlock4(modal);
      }
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden'],
      childList: true,
      subtree: true
    });
  }

  /* ── BOOT ─────────────────────────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // Also retry hook after a short delay in case FixeoReservation loads async
  setTimeout(_hookOpen, 800);
  setTimeout(_hookOpen, 2000);

})();
