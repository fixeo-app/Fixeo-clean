/* ============================================================
   FIXEO V7 — CENTRALIZED RESERVATION & BOOKING MODULE
   Unique module · All Reserve buttons use this module
   CompatIble with FixeoPayment engine
   ============================================================ */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════
     CONFIG
  ════════════════════════════════════════════════════════ */
  const MODAL_ID = 'fixeo-reservation-modal';
  const BACKDROP_ID = 'fixeo-reservation-backdrop';

  /* SERVICE_MAP v2 — user-intent structure (Urgence→Dépannage→Installation→Entretien→Projet)
   * Added: serrurerie, carrelage, toiture
   * Removed: misplaced entries (Carrelage from bricolage, Vitrerie from nettoyage,
   *           Carrelage & joints from maconnerie, DIY/IKEA branding)
   * Original keys preserved — getServices() fallback unchanged */
  const SERVICE_MAP = {
    plomberie:    ['Fuite d\'eau \u2014 r\u00e9paration', 'Urgence plomberie', 'Installation sanitaire', 'R\u00e9paration chauffe-eau', 'Salle de bain compl\u00e8te'],
    electricite:  ['Urgence \u00e9lectrique', 'Panne \u00e9lectrique', 'Installation \u00e9lectrique', 'Prise ou interrupteur en panne', 'Mise \u00e0 niveau installation'],
    peinture:     ['Peinture int\u00e9rieure', 'Peinture ext\u00e9rieure', 'D\u00e9coration murale', 'Ravalement de fa\u00e7ade'],
    nettoyage:    ['Nettoyage domicile complet', 'Nettoyage apr\u00e8s travaux', 'Entretien r\u00e9gulier', 'D\u00e9sinfection', 'Nettoyage vitres'],
    jardinage:    ['Entretien jardin', 'Tonte pelouse', 'Taille haies', 'Am\u00e9nagement ext\u00e9rieur', 'D\u00e9broussaillage'],
    demenagement: ['D\u00e9m\u00e9nagement complet', 'Transport mobilier', 'Emballage \u0026 protection', 'Montage / d\u00e9montage meubles'],
    bricolage:    ['Montage meubles', 'Petites r\u00e9parations', 'Fixations murales', 'Travaux carrelage l\u00e9ger', 'Intervention rapide bricolage'],
    climatisation:['Panne climatiseur', 'Urgence climatisation', 'Installation climatiseur', 'Entretien climatiseur', 'R\u00e9paration climatiseur'],
    menuiserie:   ['Porte ou fen\u00eatre bloqu\u00e9e', 'R\u00e9paration menuiserie', 'Fabrication sur mesure', 'Am\u00e9nagement bois', 'Intervention rapide menuiserie'],
    maconnerie:   ['R\u00e9paration mur', 'Travaux pl\u00e2trerie', 'Construction petit ouvrage', 'R\u00e9novation fa\u00e7ade'],
    'ma\u00e7onnerie': ['R\u00e9paration mur', 'Travaux pl\u00e2trerie', 'Construction petit ouvrage', 'R\u00e9novation fa\u00e7ade'],
    serrurerie:   ['Porte bloqu\u00e9e', 'Ouverture de porte', 'Changement serrure', 'S\u00e9curisation porte', 'Urgence serrurerie'],
    carrelage:    ['Pose carrelage', 'R\u00e9paration joints', 'Carrelage salle de bain', 'R\u00e9novation carrelage'],
    toiture:      ['Fuite toiture', '\u00c9tanch\u00e9it\u00e9 terrasse', 'R\u00e9paration tuiles', 'Nettoyage toiture'],
  };

  /* ── Per-service price ranges (plomberie phase 1 — display only)
     Key = exact service string from SERVICE_MAP.
     Used in dropdown labels + dynamic hint. Does NOT affect serviceTotal or payment. */
  /* SERVICE_PRICING v2 — complete coverage for all SERVICE_MAP entries
   * Source: fixeo-pricing-marocain.js category ranges, split per service type
   * Used by: _onServiceChange (display only), renderStep2 _svcBase (Step 2 total)
   * DO NOT change these values without updating fixeo-pricing-marocain.js accordingly */
  const SERVICE_PRICING = {
    /* ── plomberie ── */
    'Fuite d\'eau \u2014 r\u00e9paration':     { from: 150, to: 300 },
    'Urgence plomberie':                       { from: 200, to: 400 },
    'Installation sanitaire':                  { from: 250, to: 600 },
    'R\u00e9paration chauffe-eau':             { from: 200, to: 500 },
    'Salle de bain compl\u00e8te':             { from: 1500, to: 5000 },
    /* ── electricite ── */
    'Urgence \u00e9lectrique':                 { from: 200, to: 500 },
    'Panne \u00e9lectrique':                   { from: 150, to: 350 },
    'Installation \u00e9lectrique':            { from: 200, to: 600 },
    'Prise ou interrupteur en panne':          { from: 100, to: 200 },
    'Mise \u00e0 niveau installation':         { from: 400, to: 1200 },
    /* ── climatisation ── */
    'Panne climatiseur':                       { from: 200, to: 500 },
    'Urgence climatisation':                   { from: 300, to: 600 },
    'Installation climatiseur':                { from: 500, to: 900 },
    'Entretien climatiseur':                   { from: 200, to: 350 },
    'R\u00e9paration climatiseur':             { from: 250, to: 600 },
    /* ── menuiserie ── */
    'Porte ou fen\u00eatre bloqu\u00e9e':      { from: 150, to: 350 },
    'R\u00e9paration menuiserie':              { from: 200, to: 500 },
    'Fabrication sur mesure':                  { from: 800, to: 2500 },
    'Am\u00e9nagement bois':                   { from: 500, to: 1500 },
    'Intervention rapide menuiserie':          { from: 150, to: 400 },
    /* ── serrurerie ── */
    'Porte bloqu\u00e9e':                      { from: 150, to: 350 },
    'Ouverture de porte':                      { from: 150, to: 300 },
    'Changement serrure':                      { from: 200, to: 450 },
    'S\u00e9curisation porte':                 { from: 300, to: 700 },
    'Urgence serrurerie':                      { from: 200, to: 450 },
    /* ── nettoyage ── */
    'Nettoyage domicile complet':              { from: 250, to: 600 },
    'Nettoyage apr\u00e8s travaux':            { from: 300, to: 700 },
    'Entretien r\u00e9gulier':                 { from: 150, to: 350 },
    'D\u00e9sinfection':                       { from: 300, to: 600 },
    'Nettoyage vitres':                        { from: 150, to: 400 },
    /* ── jardinage ── */
    'Entretien jardin':                        { from: 150, to: 400 },
    'Tonte pelouse':                           { from: 100, to: 250 },
    'Taille haies':                            { from: 150, to: 350 },
    'Am\u00e9nagement ext\u00e9rieur':         { from: 500, to: 2000 },
    'D\u00e9broussaillage':                    { from: 150, to: 400 },
    /* ── bricolage ── */
    'Montage meubles':                         { from: 100, to: 250 },
    'Petites r\u00e9parations':                { from: 100, to: 300 },
    'Fixations murales':                       { from: 80,  to: 200 },
    'Travaux carrelage l\u00e9ger':            { from: 150, to: 400 },
    'Intervention rapide bricolage':           { from: 100, to: 300 },
    /* ── maconnerie ── */
    'R\u00e9paration mur':                     { from: 150, to: 400 },
    'Travaux pl\u00e2trerie':                  { from: 200, to: 600 },
    'Construction petit ouvrage':              { from: 500, to: 2000 },
    'R\u00e9novation fa\u00e7ade':             { from: 800, to: 3000 },
    /* ── carrelage ── */
    'Pose carrelage':                          { from: 200, to: 600 },
    'R\u00e9paration joints':                  { from: 100, to: 250 },
    'Carrelage salle de bain':                 { from: 500, to: 1500 },
    'R\u00e9novation carrelage':               { from: 400, to: 1200 },
    /* ── toiture ── */
    'Fuite toiture':                           { from: 300, to: 700 },
    '\u00c9tanch\u00e9it\u00e9 terrasse':      { from: 500, to: 1500 },
    'R\u00e9paration tuiles':                  { from: 250, to: 600 },
    'Nettoyage toiture':                       { from: 300, to: 700 },
    /* ── peinture ── */
    'Peinture int\u00e9rieure':                { from: 800, to: 1500 },
    'Peinture ext\u00e9rieure':               { from: 1000, to: 3000 },
    'D\u00e9coration murale':                  { from: 500, to: 1500 },
    'Ravalement de fa\u00e7ade':              { from: 2000, to: 8000 },
    /* ── demenagement ── */
    'D\u00e9m\u00e9nagement complet':          { from: 800, to: 2500 },
    'Transport mobilier':                      { from: 400, to: 1200 },
    'Emballage \u0026 protection':            { from: 300, to: 800 },
    'Montage / d\u00e9montage meubles':       { from: 200, to: 600 },
  };

  const TIME_SLOTS = [
    { value: 'matin',      label: '🌅 Matin (8h–12h)',        icon: '🌅' },
    { value: 'apresmidi',  label: '☀️ Après-midi (14h–18h)',  icon: '☀️' },
    { value: 'soir',       label: '🌆 Soir (18h–20h)',        icon: '🌆' },
  ];

  const CATEGORY_LABELS = {
    plomberie: 'Plomberie', electricite: 'Électricité', peinture: 'Peinture',
    nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement',
    bricolage: 'Bricolage', climatisation: 'Climatisation', menuiserie: 'Menuiserie',
    maconnerie: 'Maçonnerie',
    'maçonnerie': 'Maçonnerie',
  };

  const CATEGORY_ICONS = {
    plomberie: '🔧', electricite: '⚡', peinture: '🎨', nettoyage: '🧹',
    jardinage: '🌿', demenagement: '🚛', bricolage: '🔨', climatisation: '❄️',
    menuiserie: '🪚', maconnerie: '🧱',
  };

  /* ════════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════════ */
  const state = {
    artisan: null,
    isExpress: false,
    isUrgent: false,   // set by open() when urgentContext?.urgent === true
    step: 1, // 1=form, 2=confirm
    selectedService: '',
    selectedDate: '',
    selectedSlot: 'matin',
    description: '',
    address: '',
    phone: '',
    // 7C.9L.3C — Estimator-origin artisan picker state
    _estimatorCtx:         null,  // verified pricing context (set async in open())
    estimatorCity:         null,  // city chosen by user in estimator picker stage
    estimatorPickerScreen: null,  // 7C.9L.3W: null|'city'|'artisan' (nav only)
  };

  /* ════════════════════════════════════════════════════════
     UTILS
  ════════════════════════════════════════════════════════ */
  function sanitize(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDateFR(isoDate) {
    if (!isoDate) return '';
    return new Date(isoDate).toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function getArtisanById(id) {
    /* Phase 7C.9L.3O: canonical string comparison — supports numeric strings,
     * UUID strings, and any other legitimate artisan ID shape stored in
     * window.ARTISANS (covers Supabase UUIDs where legacy_id is absent). */
    const pool = window.ARTISANS || (typeof ARTISANS !== 'undefined' && Array.isArray(ARTISANS) ? ARTISANS : null);
    if (pool) {
      var sid = String(id);
      return pool.find(function(a) { return String(a.id) === sid; }) || null;
    }
    return null;
  }

  function normalizeArtisan(input) {
    if (!input) return null;
    // If it's a number OR any string id (including UUIDs) — Phase 7C.9L.3O
    if (typeof input === 'number' || typeof input === 'string') {
      return getArtisanById(input);
    }
    // If it's already an object
    if (typeof input === 'object') {
      return {
        id: input.id || 0,
        name: input.name || input.artisanName || 'Artisan',
        initials: input.initials || (input.name ? input.name.split(' ').map(w => w[0]).join('').substring(0,2) : 'AR'),
        category: input.category || input.specialty?.toLowerCase() || 'bricolage',
        city: input.city || 'Maroc',
        /* V1-JC: Do NOT fabricate rating/review defaults.
         * rating=0 and reviewCount=0 must stay 0 so _resModalTrust() gates correctly.
         * Supabase artisans arrive here from artisan-profile.html findCurrentArtisan()
         * which now merges window._fixeoCurrentArtisan (real data, set by fixeo-profile-v2a.js).
         */
        rating: (typeof input.rating === 'number') ? input.rating : (input.rating ? parseFloat(input.rating) : 0),
        reviewCount: parseInt(input.reviewCount || input.review_count || 0, 10),
        scoreQualification: parseInt(input.scoreQualification || input.score_qualification || 0, 10),
        trustScore: input.trustScore || 90,
        priceFrom: (function() {
          var _cat = input.category || input.specialty || 'bricolage';
          var _fp  = window.FixeoPricing && window.FixeoPricing.getPricing && window.FixeoPricing.getPricing(_cat);
          if (_fp && _fp.from) return _fp.from;
          return input.priceFrom || input.hourlyRate || 150;
        })(),
        priceUnit: input.priceUnit || 'intervention',
        availability: input.availability || 'available',
        badges: input.badges || [],
        skills: input.skills || [],
        phone: input.phone || '',
        email: input.email || '',
        bio: input.bio || { fr: '' },
      };
    }
    return null;
  }

  function getServices(artisan) {
    if (!artisan) return ['Service standard'];
    const cat = artisan.category?.toLowerCase();
    return SERVICE_MAP[cat] || artisan.skills || ['Service standard', 'Autre'];
  }

  /* ════════════════════════════════════════════════════════
     BACKDROP
  ════════════════════════════════════════════════════════ */
  function ensureBackdrop() {
    let bd = document.getElementById(BACKDROP_ID);
    if (!bd) {
      bd = document.createElement('div');
      bd.id = BACKDROP_ID;
      bd.className = 'fixeo-res-backdrop';
      bd.onclick = close;
      document.body.appendChild(bd);
    }
    bd.classList.add('open');
    return bd;
  }

  function removeBackdrop() {
    const bd = document.getElementById(BACKDROP_ID);
    if (bd) bd.classList.remove('open');
  }

  /* ════════════════════════════════════════════════════════
     MODAL SHELL
  ════════════════════════════════════════════════════════ */
  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.className = 'fixeo-res-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Réservation');
      document.body.appendChild(modal);
    }
    return modal;
  }

  /* ── 7C.9L.3I: Delegated city-chip click handler ──────────────────────────
   * One listener bound once on document. Intercepts clicks on
   * [data-estimator-city] chips scoped inside #fixeo-reservation-modal.
   * Replaces malformed inline onclick that used JSON.stringify("City") inside
   * a double-quoted HTML attribute — browser truncated the attribute at the
   * first inner double-quote, silently dropping the entire handler.
   * ────────────────────────────────────────────────────────────────────────── */
  if (!window._fxResEstimatorCityListenerBound) {
    window._fxResEstimatorCityListenerBound = true;
    document.addEventListener('click', function(e) {
      var modal = document.getElementById(MODAL_ID);
      if (!modal) return;

      /* ── 1. City chip tap ─────────────────────────────────────────────────
       * [data-estimator-city] chips rendered by renderEstimatorCityPicker().
       * 7C.9L.3I: inline onclick removed — ID was JSON.stringify("City") in
       * double-quoted attr → truncated by HTML parser → handler never fired. */
      var chip = e.target.closest
        ? e.target.closest('[data-estimator-city]')
        : (function() {
            var n = e.target;
            while (n && n !== document) {
              if (n.getAttribute && n.getAttribute('data-estimator-city')) return n;
              n = n.parentNode;
            }
            return null;
          })();
      if (chip && modal.contains(chip)) {
        e.preventDefault();
        e.stopPropagation();
        var city = chip.getAttribute('data-estimator-city');
        if (city && window.FixeoReservation &&
            typeof window.FixeoReservation._setEstimatorCity === 'function') {
          window.FixeoReservation._setEstimatorCity(city);
        }
        return;
      }

      /* ── 2. Estimator artisan card selection ──────────────────────────────
       * 7C.9L.3K: inline onclick on article + CTA both used JSON.stringify(id)
       * inside double-quoted HTML attr → truncated → neither fired.
       * Fix: article[data-estimator-id] carries the ID; CTA has data-estimator-select.
       *
       * Priority A: CTA button tap ([data-estimator-select]) — explicit user intent.
       *   Finds parent article[data-estimator-id], reads ID, calls _selectArtisanFromPicker.
       *   stopPropagation prevents the card-body branch below from also firing.
       *
       * Priority B: Card body tap anywhere on article[data-estimator-id] NOT on
       *   a button/a/interactive child (other than data-estimator-select which is
       *   handled above). Selects same artisan. */
      if (!modal.contains(e.target)) return;

      /* Priority 0 — Back navigation ([data-res-back]) */
      var backBtn = e.target.closest ? e.target.closest('[data-res-back]') : null;
      if (backBtn && modal.contains(backBtn)) {
        var dest = backBtn.getAttribute('data-res-back');
        if (dest === 'close') {
          window.FixeoReservation && window.FixeoReservation.close();
        } else if (dest === 'city-back-to-estimator') {
          /* 7C.9L.3X: city picker ← Retour → dismiss reservation, reveal existing PRICE_READY.
           * Does NOT close the Estimator — it was hidden (not destroyed) at handoff.
           * pricing_context_token is NOT cleared. No new pricing call. */
          _dismissReservationLayer();
          if (window.FixeoEstimatorV2 &&
              typeof window.FixeoEstimatorV2.reveal === 'function') {
            window.FixeoEstimatorV2.reveal();
          }
        } else if (dest === 'city') {
          /* 7C.9L.3W: navigate to city picker WITHOUT clearing estimatorCity.
           * Casablanca is preserved; city picker will highlight it.
           * _estimatorCtx and pricing token remain completely untouched. */
          state.estimatorPickerScreen = 'city';
          render();
        } else if (dest === 'artisan') {
          /* 7C.9L.3W: Step 1 → artisan picker. Save draft, then show artisan picker.
           * estimatorCity preserved; estimatorPickerScreen='artisan' shows list directly. */
          var descEl2 = document.getElementById('res-desc');
          var addrEl2 = document.getElementById('res-address');
          var phoneEl2 = document.getElementById('res-phone');
          if (descEl2) state.description = descEl2.value;
          if (addrEl2) state.address = addrEl2.value;
          if (phoneEl2) state.phone = phoneEl2.value;
          state.artisan              = null;
          state.estimatorPickerScreen = 'artisan';
          render();
        } else if (dest === 'step1') {
          /* Step 2 → Step 1: reuse existing _goToStep1 */
          if (window.FixeoReservation && window.FixeoReservation._goToStep1) {
            window.FixeoReservation._goToStep1();
          }
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      /* Priority A — CTA ([data-estimator-select]) */
      var selectBtn = e.target.closest ? e.target.closest('[data-estimator-select]') : null;
      if (selectBtn && modal.contains(selectBtn)) {
        e.preventDefault();
        e.stopPropagation();
        var article = selectBtn.closest ? selectBtn.closest('article[data-estimator-id]') : null;
        var artisanId = article && article.getAttribute('data-estimator-id');
        if (artisanId && window.FixeoReservation &&
            typeof window.FixeoReservation._selectArtisanFromPicker === 'function') {
          window.FixeoReservation._selectArtisanFromPicker(artisanId);
        }
        return;
      }

      /* Priority A.5 — Estimator profile link: write return marker, allow native navigation */
      var profileLink = e.target.closest ? e.target.closest('[data-estimator-profile]') : null;
      if (profileLink && modal.contains(profileLink)) {
        try {
          sessionStorage.setItem('fx_estimator_return_v1', 'artisan-picker');
          /* 7C.9L.3W: persist manually-selected city as UX hint (non-pricing, non-authority). */
          if (state.estimatorCity) {
            sessionStorage.setItem('fx_estimator_return_city_v1', state.estimatorCity);
          } else {
            sessionStorage.removeItem('fx_estimator_return_city_v1');
          }
        } catch (_) {}
        /* Allow native <a href> navigation — do NOT call _selectArtisanFromPicker */
        return;
      }

      /* Priority B — card body tap (not on unrelated interactive controls) */
      if (e.target.closest && e.target.closest('button:not([data-estimator-select]), a, [role="button"]:not(article[data-estimator-id])')) return;
      var artCard = e.target.closest ? e.target.closest('article[data-estimator-id]') : null;
      if (artCard && modal.contains(artCard)) {
        e.preventDefault();
        e.stopPropagation();
        var cardId = artCard.getAttribute('data-estimator-id');
        if (cardId && window.FixeoReservation &&
            typeof window.FixeoReservation._selectArtisanFromPicker === 'function') {
          window.FixeoReservation._selectArtisanFromPicker(cardId);
        }
        return;
      }
    }, true /* capture: fires before target bubbling, handles iOS tap */);
  }

  /* ════════════════════════════════════════════════════════
     V1-JC: Premium initials avatar for the reservation modal
     Mirrors fixeo-profile-v1jb.js _nameHash + _initials for
     visual coherence between profile page and modal card.
  ════════════════════════════════════════════════════════ */
  /* av-unity-1: Unified ig-gradient for all modal avatars — matches profile hero fallback exactly.
   3-part format: [angle, color1, 'color2 stop%, color3 stop%'] → consistent identity across contexts. */
  var _MODAL_AVATAR_GRADIENTS = [
    ['135deg','#E1306C','#833AB4 60%, #405DE6 100%']
  ];
  function _modalAvatarGrad(name) {
    var h = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; }
    return _MODAL_AVATAR_GRADIENTS[h % _MODAL_AVATAR_GRADIENTS.length];
  }
  function _modalInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }
  function _modalAvatarHtml(a, catIcon) {
    /* V2-C6F: Use real photo when available (same priority as profile + homepage).
     * Source: a.avatar || a.photo_url || a.photo — all mapped by fixeo-supabase-loader.js.
     * Fallback: name-hash gradient + initials (unchanged from V1-JC). */
    var photoSrc = a.avatar || a.photo_url || a.photo || '';
    if (photoSrc) {
      return '<div class="fixeo-res-artisan-avatar fxrva-avatar fxrva-photo-av" data-category="' +
        sanitize(a.category || '') + '" style="border-radius:50%;overflow:hidden;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.30),0 0 0 3px rgba(255,255,255,.04);' +
        'position:relative;background:linear-gradient(135deg,#1a1a2a,#2a2a3e)">' +
        '<img src="' + sanitize(photoSrc) + '" alt="' + sanitize(a.name || '') + '" ' +
        'style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" ' +
        'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'fxrva-photo-err\')">' +
        '<span class="fxrva-cat-badge" aria-hidden="true">' + catIcon + '</span>' +
        '</div>';
    }
    var grad    = _modalAvatarGrad(a.name || '');
    var letters = _modalInitials(a.name || a.initials || '');
    var bgStyle = 'background:linear-gradient(' + grad[0] + ',' + grad[1] + ',' + grad[2] + ')';
    return '<div class="fixeo-res-artisan-avatar fxrva-avatar fxrva-initials-av" data-category="' +
      sanitize(a.category || '') + '" style="' + bgStyle + ';font-size:1.2rem;font-weight:800;' +
      'color:rgba(255,255,255,.88);border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.30),0 0 0 3px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.10);' +
      'position:relative;overflow:hidden;letter-spacing:-.02em">' +
      '<span style="position:relative;z-index:2">' + sanitize(letters) + '</span>' +
      '<span class="fxrva-cat-badge" aria-hidden="true">' + catIcon + '</span>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════
     RENDER STEP 1 — BOOKING FORM
  ════════════════════════════════════════════════════════ */
  function renderStep1() {
    const a = state.artisan;
    const services = getServices(a);
    const catLabel = CATEGORY_LABELS[a?.category] || 'Service';
    const catIcon  = CATEGORY_ICONS[a?.category]  || '🛠️';
    const today    = todayISO();

    // Express mode specific content
    // ── Top banner: express OR urgent OR nothing ────────────────
    const expressHeader = state.isExpress
      ? `<div class="fixeo-res-express-banner">
          <span class="fixeo-res-express-icon">🚀</span>
          <div>
            <div class="fixeo-res-express-title">Intervention EXPRESS</div>
            <div class="fixeo-res-express-sub">Artisan disponible dans moins d'1 heure · +50 MAD</div>
          </div>
        </div>`
      : state.isUrgent
        ? `<div class="fixeo-res-express-banner" style="background:linear-gradient(135deg,rgba(255,65,108,.18),rgba(255,75,43,.12));border:1.5px solid rgba(255,65,108,.45);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:4px">
            <span style="font-size:1.7rem;line-height:1">⚡</span>
            <div style="flex:1">
              <div style="font-weight:800;font-size:.95rem;color:#ff416c;letter-spacing:.01em">Intervention prioritaire</div>
              <div style="font-size:.8rem;color:rgba(255,255,255,.65);margin-top:3px">Un artisan va vous contacter rapidement · Réponse garantie</div>
            </div>
          </div>`
        : '';

    // ── Slot / date block: express → now, urgent → dès que possible (no date picker), normal → picker ──
    const slotsHtml = (state.isExpress || state.isUrgent) ? `
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">${state.isUrgent ? '⏱ Disponibilité' : 'Disponibilité'}</label>
        <div class="fixeo-res-slot-grid">
          <div class="fixeo-res-slot active" data-slot="maintenant">${state.isUrgent ? '⚡ Dès que possible' : '⚡ Dès maintenant'}</div>
        </div>
      </div>` : `
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">📅 Date souhaitée</label>
        <input type="date" class="fixeo-res-input" id="res-date"
               min="${today}" value="${state.selectedDate || today}"
               onchange="FixeoReservation._onDateChange(this.value)"/>
      </div>
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">⏰ Créneau horaire</label>
        <div class="fixeo-res-slot-grid" id="res-slot-grid">
          ${(function(){
            const _artId = a ? a.id : 0;
            const _bookedSlots = (window.FixeoSlotLock && _artId)
              ? window.FixeoSlotLock.getBookedSlots(_artId, state.selectedDate || todayISO())
              : [];
            return TIME_SLOTS.map(ts => {
              const _isBooked = _bookedSlots.includes(ts.value);
              const _bookedClass = _isBooked ? ' slot-booked' : '';
              const _bookedAttr  = _isBooked ? ' aria-disabled="true" title="⛔ Créneau déjà réservé"' : '';
              const _clickHandler = _isBooked
                ? 'FixeoSlotLock._onBookedSlotClick(event)'
                : `FixeoReservation._onSlotClick(this, '${ts.value}')`;
              const _activeClass = (!_isBooked && state.selectedSlot === ts.value) ? ' active' : '';
              return `<div class="fixeo-res-slot${_activeClass}${_bookedClass}" data-slot="${ts.value}"${_bookedAttr} onclick="${_clickHandler}">${ts.label}</div>`;
            }).join('');
          })()}
        </div>
      </div>`;

    // Artisan score/badges
    const badgesHtml = (a.badges || []).slice(0,3).map(b => {
      const badge = {
        verified: { label: 'Vérifié', icon: '✅' },
        pro: { label: 'Pro', icon: '🥇' },
        top_rated: { label: 'Top Noté', icon: '⭐' },
        legendary: { label: 'Légendaire', icon: '🏆' },
        expert: { label: 'Expert', icon: '🎓' },
        responsive: { label: 'Réactif', icon: '⚡' },
        friendly: { label: 'Sympathique', icon: '😊' },
      }[b] || { label: b, icon: '🏅' };
      return `<span class="fixeo-res-badge">${badge.icon} ${badge.label}</span>`;
    }).join('');

    const availClass = a.availability === 'available' ? 'available' : (a.availability === 'busy' ? 'busy' : 'offline');
    const availLabel = a.availability === 'available' ? '● Disponible' : (a.availability === 'busy' ? '● Occupé' : '● Hors ligne');

    return `
      <div class="fixeo-res-dialog" role="document">
        <!-- Header -->
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${catIcon}</div>
            <div>
              <div class="fixeo-res-header-title">${state.isExpress ? '🚀 Réservation Express' : state.isUrgent ? '⚡ Intervention urgente' : '📅 Réserver un artisan'}</div>
              <div class="fixeo-res-header-sub">${state.isUrgent ? 'Réponse rapide • Artisan disponible maintenant' : 'Étape 1 sur 2 — Détails de la réservation'}</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>

        ${/* 7C.9L.3W.2/BUG-A: ← Retour rendered in a standalone nav row OUTSIDE .fixeo-res-header-left.
           * .fixeo-res-header-left becomes display:none!important when flagship enhancer adds
           * .fxresf-enhanced to the header — any button inside it is hidden.
           * This row is a sibling of .fixeo-res-header, never touched by the flagship enhancer. */
          state._estimatorCtx && state._estimatorCtx.valid ? `
        <div style="background:var(--fxresf-bg-card,rgba(26,26,36,0.97));border-bottom:1px solid rgba(255,255,255,.07);padding:8px 16px">
          <button type="button" class="fixeo-res-btn-secondary" data-res-back="artisan"
            aria-label="Retour au choix de l'artisan"
            style="font-size:.8rem;padding:7px 14px;display:inline-flex;align-items:center;gap:5px">
            ← Retour
          </button>
        </div>` : ''}

        <!-- Steps indicator -->
        <div class="fixeo-res-steps">
          <div class="fixeo-res-step active">
            <div class="fixeo-res-step-dot active">1</div>
            <div class="fixeo-res-step-label">Détails</div>
          </div>
          <div class="fixeo-res-step-line"></div>
          <div class="fixeo-res-step">
            <div class="fixeo-res-step-dot">2</div>
            <div class="fixeo-res-step-label">R\u00e9capitulatif</div>
          </div>
        </div>

        <!-- Body -->
        <div class="fixeo-res-body">

          <!-- Artisan Card -->
          <div class="fixeo-res-artisan-card">
            ${_modalAvatarHtml(a, catIcon)}
            <div class="fixeo-res-artisan-info">
              <div class="fixeo-res-artisan-name">${sanitize(a.name)}</div>
              <div class="fixeo-res-artisan-meta">
                ${catIcon} ${catLabel} · 📍 ${sanitize(a.city)}
              </div>
              ${/* hts-1: rating and reviewCount are seeded data — never display in modal.
               * Always show honest operational chips: availability + platform trust. */
               (function(){
                return '<div class="fixeo-res-artisan-row">' +
                  '<span class="fixeo-res-avail ' + availClass + '">' + availLabel + '</span>' +
                  '</div>' +
                  '<div class="fxrva-coord-chips">' +
                    '<span class="fxrva-coord-chip">\ud83d\udcb3 Paiement apr\u00e8s intervention</span>' +
                    '<span class="fxrva-coord-chip">Tarification encadr\u00e9e Fixeo</span>' +
                  '</div>';
               })()}
              <div class="fixeo-res-badges">${badgesHtml}</div>
            </div>
            <div class="fixeo-res-artisan-price">
              ${/* 7C.9L.3C: when estimator context active, show FIXEO price instead of artisan base price */
                (state._estimatorCtx && state._estimatorCtx.valid && state._estimatorCtx.amount_mad)
                  ? '<div class="fixeo-res-price-val" id="res-price-display" style="font-size:1.45rem;font-weight:900;letter-spacing:-.01em;color:#E1306C">' + state._estimatorCtx.amount_mad.toLocaleString('fr-FR') + '\u00a0MAD</div>'
                    + '<div class="fixeo-res-price-unit" id="res-price-unit" style="color:rgba(225,48,108,.8)">Prix FIXEO</div>'
                  : '<div class="fixeo-res-price-val" id="res-price-display" style="font-size:1.45rem;font-weight:900;letter-spacing:-.01em">' + a.priceFrom + ' MAD</div>'
                    + '<div class="fixeo-res-price-unit" id="res-price-unit" style="' + (state.selectedService ? 'display:none' : '') + '">' + (a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')) + '</div>'
              }
            </div>
          </div>
          <div class="fxrva-artisan-coord">\u2714 Coordonn\u00e9 par Fixeo &nbsp;\u00b7&nbsp; Paiement apr\u00e8s intervention</div>

          ${expressHeader}

          <!-- Form -->
          <div class="fixeo-res-form" id="fixeo-res-form">

            ${state.isUrgent ? `
            <!-- URGENT MODE: service is hidden (already preselected), shown as chip only -->
            <input type="hidden" id="res-service" value="${sanitize(state.selectedService)}"/>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:${(function(){var _fp=window.FixeoPricing&&window.FixeoPricing.getPricing&&window.FixeoPricing.getPricing(a&&a.category);return (_fp&&_fp.range)?'4px':'10px';})()}px;padding:10px 14px;background:rgba(255,65,108,.08);border:1px solid rgba(255,65,108,.25);border-radius:10px">
              <span style="font-size:1.1rem">${catIcon}</span>
              <span style="font-size:.88rem;color:rgba(255,255,255,.8);font-weight:500">${sanitize(state.selectedService || catLabel)}</span>
              <span style="margin-left:auto;font-size:.75rem;color:rgba(255,255,255,.4)">⚡ Dès que possible</span>
            </div>
            ${(function(){
              var _fp=window.FixeoPricing&&window.FixeoPricing.getPricing&&window.FixeoPricing.getPricing(a&&a.category);
              if(!_fp||!_fp.range) return '';
              var _rec = Math.round((_fp.from+_fp.to)/2);
              return '<div style="font-size:.75rem;color:rgba(255,255,255,.4);margin-bottom:2px;padding-left:2px">'
                +  'Fourchette march\u00e9\u00a0: <strong style="color:rgba(255,255,255,.62)">'+ _fp.range +'</strong>'
                + '</div>'
                + '<div style="font-size:.78rem;color:rgba(255,255,255,.55);margin-bottom:12px;padding-left:2px">'
                +  '\ud83d\udca1 Prix recommand\u00e9 Fixeo\u00a0: <strong style="color:rgba(255,255,255,.78)">~'+ _rec +' MAD</strong>'
                + '</div>';
            })()} ` : state._estimatorCtx && state._estimatorCtx.valid ? `
            <!-- 7C.9L.3C: Estimator mode — service pre-selected from context, no legacy range pills -->
            <input type="hidden" id="res-service" value="${sanitize(state.selectedService)}"/>
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(135deg,rgba(225,48,108,.1),rgba(131,58,180,.08));border:1px solid rgba(225,48,108,.22);border-radius:10px;margin-bottom:10px">
              <span style="font-size:1rem">${CATEGORY_ICONS[a.category] || '🛠️'}</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#fff">${sanitize(state.selectedService)}</div>
                <div style="font-size:.72rem;color:rgba(255,255,255,.5);margin-top:2px">Prix FIXEO — ${state._estimatorCtx.amount_mad ? state._estimatorCtx.amount_mad.toLocaleString('fr-FR') + '\u00a0MAD' : ''}</div>
              </div>
            </div>` : `
            <div class="fixeo-res-field">
              <label class="fixeo-res-label">🛠️ Service souhaité *</label>
              <input type="hidden" id="res-service" value="${sanitize(state.selectedService)}"/>
              <div id="res-svc-pills" class="fixeo-res-slot-grid" style="grid-template-columns:1fr 1fr;gap:10px">
                ${services.map((s, idx) => {
                  const _sp   = SERVICE_PRICING[s];
                  const _lbl  = _sp ? (_sp.from + '\u2013' + _sp.to + ' MAD') : (a.priceLabel || (a.priceFrom + ' MAD'));
                  const _act  = state.selectedService === s ? ' active' : '';
                  const _badge = '';
                  return `<div class="fixeo-res-slot${_act}" data-svc="${sanitize(s)}" style="text-align:left;padding:12px 13px;line-height:1.35;cursor:pointer;transition:all .2s ease;background:${_act ? '' : 'linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02))'};"><div style="font-size:.8rem;font-weight:700;color:#fff">${sanitize(s)}</div><div style="font-size:.7rem;color:rgba(255,255,255,.55);margin-top:3px;font-weight:500">${_lbl}</div>${_badge}</div>`;
                }).join('')}
              </div>
              <div style="margin-top:7px;font-size:.68rem;color:rgba(255,255,255,.35);padding-left:2px">Choisissez un service pour afficher une estimation indicative.</div>
            </div>
            ${(function(){
              /* Dynamic per-service hint — updates via _onServiceChange without re-render */
              var _fp = window.FixeoPricing && window.FixeoPricing.getPricing && window.FixeoPricing.getPricing(a && a.category);
              if (!_fp || !_fp.range) return '';
              /* Initial text: use selected service pricing if available, else category range */
              var _sp  = state.selectedService ? SERVICE_PRICING[state.selectedService] : null;
              var _marcheTxt = _sp ? (_sp.from + '\u2013' + _sp.to + ' MAD') : ('s\u00e9lectionnez un service');
              var _recHtml   = _sp
                ? '\ud83d\udca1 Prix recommand\u00e9 Fixeo\u00a0: <strong style="color:rgba(255,255,255,.75)">~' + Math.round((_sp.from+_sp.to)/2) + '\u00a0MAD</strong>'
                : '';
              return '<div data-res-svc-hint style="margin-top:6px;line-height:1.35;padding-left:2px">'
                + '<div data-res-svc-marche style="font-size:.72rem;color:rgba(255,255,255,.32)">'
                  + 'March\u00e9\u00a0: ' + _marcheTxt
                + '</div>'
                + '<div data-res-svc-rec style="font-size:.75rem;color:rgba(255,255,255,.5);min-height:1.1em">'
                  + _recHtml
                + '</div>'
              + '</div>';
            })()}`}

            ${state.isUrgent ? '' : slotsHtml}

            <div class="fixeo-res-field">
              <label class="fixeo-res-label">📍 Adresse d'intervention *</label>
              <input type="text" class="fixeo-res-input" id="res-address"
                     placeholder="Ex: 12 Rue Mohammed V, Casablanca"
                     value="${sanitize(state.address)}"
                     oninput="FixeoReservation._onAddressChange(this.value)"
                     autocomplete="street-address"/>
            </div>

            ${/* V1-JB fix: phone field shown in ALL modes (was express/urgent only).
               * Without it, _submitStep1 validation fires "numéro invalide"
               * with no visible field to fill — a critical conversion blocker.
               * Microcopy: operational coordination only, not marketing.
               */ ''}
            <div class="fixeo-res-field">
              <label class="fixeo-res-label">📞 Votre téléphone *</label>
              <input type="tel" class="fixeo-res-input" id="res-phone"
                     placeholder="06XXXXXXXX"
                     value="${sanitize(state.phone)}"
                     inputmode="tel"
                     oninput="FixeoReservation._onPhoneChange(this.value)"
                     autocomplete="tel"/>
              <div style="margin-top:4px;font-size:.68rem;color:rgba(255,255,255,.32);padding-left:2px">Utilis\u00e9 uniquement pour la coordination avec l\u2019artisan.</div>
            </div>

            ${state.isUrgent ? `
            <div class="fixeo-res-field">
              <label class="fixeo-res-label" style="color:rgba(255,255,255,.5);font-size:.8rem">📝 Description (optionnelle)</label>
              <textarea class="fixeo-res-textarea" id="res-desc" rows="2"
                        placeholder="Précisez si besoin…"
                        oninput="FixeoReservation._onDescChange(this.value)"
                        style="font-size:.85rem;padding:8px 12px">${sanitize(state.description)}</textarea>
            </div>` : `
            <div class="fixeo-res-field">
              <div id="res-desc-toggle"
                   style="font-size:.75rem;color:rgba(255,255,255,.4);cursor:pointer;margin-bottom:4px;user-select:none"
                   onclick="(function(){var w=document.getElementById('res-desc-wrap');var t=document.getElementById('res-desc-toggle');if(!w)return;var open=w.style.display!=='none';w.style.display=open?'none':'block';t.textContent=open?'+ Ajouter des d\u00e9tails':'- R\u00e9duire';})()">
                + Ajouter des d\u00e9tails
              </div>
              <div id="res-desc-wrap" style="display:${state.description ? 'block' : 'none'}">
                <textarea class="fixeo-res-textarea" id="res-desc" rows="3"
                          placeholder="D\u00e9crivez votre besoin en d\u00e9tail\u2026"
                          oninput="FixeoReservation._onDescChange(this.value)">${sanitize(state.description)}</textarea>
              </div>
            </div>`}

            <div class="fixeo-res-price-info" id="res-tarif-estime">${state.isUrgent
              ? `⚡ <strong>Priorité urgente incluse</strong> — vous ne payez qu'après l'intervention`
              /* 7C.10C.0.4: Estimator verified context — no generic market-range copy */
              : (state._estimatorCtx && state._estimatorCtx.valid)
              ? `💡 <em style="font-style:normal">Prix FIXEO vérifié pour le périmètre sélectionné.</em><br><span style="font-size:.72rem;color:rgba(255,255,255,.5)">Aucun paiement maintenant — vous payez après intervention.</span>`
              : `💡 <em style="font-style:normal">Estimation basée sur les prix du marché.</em><br><span style="font-size:.72rem;color:rgba(255,255,255,.5)">Aucun paiement maintenant — vous payez après intervention.</span>`
            }</div>

            <div class="fixeo-res-error" id="res-error" style="display:none"></div>

            <button class="fixeo-res-btn-primary" id="res-step1-cta"
                    style="${state.isUrgent ? 'background:linear-gradient(135deg,#ff416c,#ff4b2b);box-shadow:0 6px 20px rgba(255,65,108,.35);font-size:1rem;font-weight:800;height:52px;border-radius:14px;letter-spacing:.02em' : ''}"
                    onclick="FixeoReservation._submitStep1()">
              ${state.isUrgent ? '\u26a1 Trouver un artisan maintenant' : 'Confirmer les d\u00e9tails \u2192'}
            </button>
            ${state.isUrgent ? '' : '<div style="text-align:center;font-size:.65rem;color:rgba(255,255,255,.5);margin-top:6px">\u2714 Sans engagement \u2014 paiement apr\u00e8s intervention</div>'}
          </div>
        </div>

        <!-- Footer — Step 1: operational reassurance only -->
        <div class="fixeo-res-footer fxrva-footer-step1">
          <div class="fxrva-op-strip">
            <span>\u2714 Gratuit &amp; sans engagement</span>
            <span>\ud83d\udcb3 Paiement apr\u00e8s intervention</span>
            <span>\ud83d\udcac Coordination Fixeo</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     RENDER STEP 2 — SUMMARY & CONFIRM
  ════════════════════════════════════════════════════════ */
  function renderStep2() {
    const a = state.artisan;
    const _svcP    = !state.isUrgent ? SERVICE_PRICING[state.selectedService] : null;
    const _svcBase = (_svcP && _svcP.from) ? _svcP.from : a.priceFrom;
    const _useEstimator = state._estimatorCtx && state._estimatorCtx.valid &&
      window.FixeoEstimatorConfig && window.FixeoEstimatorConfig.estimatorV2Enabled === true;
    const serviceTotal = _useEstimator ? (state._estimatorCtx.amount_mad || state._estimatorCtx.labour_amount_mad || _svcBase) : (state.isExpress && state.selectedService?.includes('Urgence') ? (_svcBase * 1.3 | 0) : _svcBase);
    const platformFee  = Math.round(serviceTotal * 0.05);
    const expressFee   = state.isExpress ? 50 : 0;
    const urgentFee    = state.isUrgent  ? 50 : 0;
    const total        = serviceTotal + platformFee + expressFee + urgentFee;

    const catIcon = CATEGORY_ICONS[a?.category] || '🛠️';
    const slotLabel = TIME_SLOTS.find(t => t.value === state.selectedSlot)?.label || state.selectedSlot || 'Dès maintenant';

    // Urgent mode: collapsed rows — total only, no fee breakdown
    const rows = state.isUrgent ? [
      ['Artisan',       sanitize(a.name)],
      ['Service',       sanitize(state.selectedService || 'Service')],
      ['Disponibilité', '⚡ Dès que possible'],
      ['Adresse',       sanitize(state.address)],
      state.description ? ['Description', sanitize(state.description.substring(0, 60) + (state.description.length > 60 ? '…' : ''))] : null,
    ].filter(Boolean) : [
      ['Artisan',      sanitize(a.name)],
      ['Service',      sanitize(state.selectedService || 'Service')],
      state.isExpress
        ? ['Intervention', '🚀 Express (dans l\'heure)']
        : ['Date',      sanitize(formatDateFR(state.selectedDate))],
      state.isExpress
        ? ['Créneau',   '⚡ Dès maintenant']
        : ['Créneau',   sanitize(slotLabel)],
      state.description ? ['Description', sanitize(state.description.substring(0, 60) + (state.description.length > 60 ? '…' : ''))] : null,
      ['Adresse',      sanitize(state.address)],
      /* 7C.9L.3C: estimator context → authoritative FIXEO price, no "(indicatif)" */
      (state._estimatorCtx && state._estimatorCtx.valid && state._estimatorCtx.amount_mad)
        ? ['Prix FIXEO', `${state._estimatorCtx.amount_mad.toLocaleString('fr-FR')} MAD`]
        : ['Tarif service', `${a.priceLabel || (serviceTotal + ' MAD')} (indicatif)`],
      ['Frais de service (5%)', `${platformFee} MAD`],
    ].filter(Boolean);

    if (expressFee > 0) rows.push(['🚀 Supplément Express', `+ ${expressFee} MAD`]);

    return `
      <div class="fixeo-res-dialog" role="document">
        <!-- Header -->
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${catIcon}</div>
            <div>
              <div class="fixeo-res-header-title">📋 Récapitulatif</div>
              <div class="fixeo-res-header-sub">Étape 2 sur 2 — Confirmation & Paiement</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>

        <!-- Steps indicator -->
        <div class="fixeo-res-steps">
          <div class="fixeo-res-step completed">
            <div class="fixeo-res-step-dot completed">✓</div>
            <div class="fixeo-res-step-label">Détails</div>
          </div>
          <div class="fixeo-res-step-line active"></div>
          <div class="fixeo-res-step active">
            <div class="fixeo-res-step-dot active">2</div>
            <div class="fixeo-res-step-label">R\u00e9capitulatif</div>
          </div>
        </div>

        <!-- Body -->
        <div class="fixeo-res-body">

          ${state.isExpress
            ? `<div class="fixeo-res-express-banner">
                <span class="fixeo-res-express-icon">🚀</span>
                <div>
                  <div class="fixeo-res-express-title">Intervention EXPRESS confirmée</div>
                  <div class="fixeo-res-express-sub">L'artisan sera chez vous dans moins d'1 heure</div>
                </div>
               </div>`
            : state.isUrgent
              ? `<div class="fixeo-res-express-banner" style="background:linear-gradient(135deg,rgba(255,65,108,.18),rgba(255,75,43,.12));border:1.5px solid rgba(255,65,108,.45);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:4px">
                  <span style="font-size:1.7rem;line-height:1">⚡</span>
                  <div style="flex:1">
                    <div style="font-weight:800;font-size:.95rem;color:#ff416c">Intervention urgente</div>
                    <div style="font-size:.8rem;color:rgba(255,255,255,.65);margin-top:3px">Un artisan va vous contacter rapidement</div>
                  </div>
                 </div>`
              : ''}

          <!-- Summary Table -->
          <div class="fixeo-res-summary">
            ${rows.map(([label, val]) => `
              <div class="fixeo-res-summary-row">
                <span class="fixeo-res-summary-label">${label}</span>
                <span class="fixeo-res-summary-val">${val}</span>
              </div>`).join('')}
            <div style="font-size:.7rem;color:rgba(32,201,151,.8);margin-bottom:8px;padding:6px 10px;background:rgba(32,201,151,.07);border:1px solid rgba(32,201,151,.15);border-radius:8px">\u2714 Votre prix est fix\u00e9 \u2014 aucun suppl\u00e9ment surprise</div>
            <div class="fixeo-res-summary-total">
              <span>${state.isUrgent ? 'Total estimé' : 'Total à payer'}</span>
              <span class="fixeo-res-total-amount">${total.toLocaleString('fr-FR')} MAD</span>
            </div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.38);margin-top:8px;line-height:1.5;padding:0 2px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px">
              L\u2019artisan peut vous contacter via WhatsApp pour confirmer l\u2019horaire.<br>Aucune surprise sur le prix.
            </div>
            ${state.isUrgent ? `<div style="font-size:.75rem;color:rgba(255,255,255,.45);margin-top:6px;line-height:1.4;padding:0 2px">
              • ${serviceTotal} MAD service estimé<br>
              • ${urgentFee} MAD priorité urgente Fixeo<br>
              • ${platformFee} MAD frais de service
            </div>` : ''}
          </div>

          <!-- Trust signals — Step 2: honest, operational -->
          <div class="fixeo-res-trust-row fxrva-trust-row">
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">\ud83d\udcb3</span>
              <span>Paiement apr\u00e8s intervention</span>
            </div>
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">\ud83d\udcac</span>
              <span>Coordination Fixeo</span>
            </div>
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">\u2714</span>
              <span>Sans engagement</span>
            </div>
          </div>

          <!-- ═══ SÉLECTEUR DE MÉTHODE DE PAIEMENT (COD V14) ═══ -->
          <div class="fixeo-res-payment-section">
            <div class="fixeo-res-payment-title">💳 Choisissez votre méthode de paiement</div>
            <!-- Rendu dynamique par FixeoCOD.renderPaymentSelector() -->
            <div id="fixeo-payment-method-selector">
              <!-- Injecté par cod-payment.js après le rendu -->
              <div class="fixeo-pay-options" id="fixeo-pay-options-group" style="display:flex;flex-direction:column;gap:10px;margin:12px 0">

                <!-- COD : sélectionné par défaut -->
                <label class="fixeo-pay-option selected" for="pay-method-cod"
                       onclick="FixeoCOD && FixeoCOD.selectPayMethod(this,'cod')" style="display:flex;align-items:center;gap:12px;background:rgba(32,201,151,.08);border:1.5px solid #20C997;border-radius:12px;padding:13px 15px;cursor:pointer;">
                  <input type="radio" name="fixeoPaymentMethod" id="pay-method-cod" value="cod" checked style="accent-color:#20C997;width:18px;height:18px;"/>
                  <span style="font-size:1.4rem">💵</span>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:.9rem;color:#fff">Paiement à la livraison (Cash on Delivery)</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px">Payez uniquement apr\u00e8s l\u2019intervention, en toute s\u00e9curit\u00e9.</div>
                  </div>
                  <span style="font-size:.67rem;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(32,201,151,.2);color:#20C997;border:1px solid rgba(32,201,151,.3);white-space:nowrap">✅ Sécurisé</span>
                </label>

                <!-- CMI -->
                <label class="fixeo-pay-option" for="pay-method-cmi"
                       onclick="FixeoCOD && FixeoCOD.selectPayMethod(this,'cmi')" style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.1);border-radius:12px;padding:13px 15px;cursor:pointer;opacity:.65">
                  <input type="radio" name="fixeoPaymentMethod" id="pay-method-cmi" value="cmi" disabled style="accent-color:#20C997;width:18px;height:18px;"/>
                  <span style="font-size:1.4rem">🇲🇦</span>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:.9rem;color:#fff">CMI (Maroc Télécommerce)</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px">Carte bancaire marocaine</div>
                  </div>
                  <span style="font-size:.67rem;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(255,165,0,.1);color:rgba(255,165,0,.8);border:1px solid rgba(255,165,0,.25);white-space:nowrap">🚧 Bientôt</span>
                </label>

              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="fixeo-res-actions">
            <button type="button" class="fixeo-res-btn-secondary" data-res-back="step1">
              ← Retour
            </button>
            <button class="fixeo-res-btn-primary fixeo-res-btn-pay"
                    style="${state.isUrgent ? 'background:linear-gradient(135deg,#ff416c,#ff4b2b);box-shadow:0 6px 20px rgba(255,65,108,.35);font-size:1rem;font-weight:800;border-radius:14px;letter-spacing:.02em' : ''}"
                    onclick="${state.isUrgent
                      ? `FixeoReservation._urgentConfirm(this,${total})`
                      : `FixeoReservation._proceedToPayment(${total})`}">
              ${state.isUrgent ? '⚡ Confirmer l\'intervention' : `\u2705 Confirmer ma r\u00e9servation \u2192 ${total.toLocaleString('fr-FR')} MAD`}
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="fixeo-res-footer">
          <div class="fixeo-res-security">
            <span>🔒 SSL 256-bit</span>
            <span>🛡️ 3D Secure</span>
            <span>✅ PCI-DSS</span>
            <span>🔄 Remboursement 14j</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     RENDER ARTISAN PICKER (when no artisan passed)
  ════════════════════════════════════════════════════════ */
  /* ── 7C.9L.3C: Estimator-origin artisan picker — city selection stage ──────────────
   * Shown when estimator context is valid AND city not yet selected.
   * Uses canonical _ESTIMATOR_CITIES list (same 20 cities as fxrf4/ALL_CITIES).
   * User MUST explicitly tap a city chip — no silent auto-confirm from localStorage.
   * ─────────────────────────────────────────────────────────────────────────────── */
  function renderEstimatorCityPicker() {
    var ctx = state._estimatorCtx;
    var metier = ctx && ctx.service_code ? ctx.service_code.split('.')[0] : '';
    var metierLabel = CATEGORY_LABELS[metier] || sanitize(metier);
    var amountDisplay = ctx && ctx.amount_mad ? ctx.amount_mad.toLocaleString('fr-FR') + ' MAD' : '';

    /* Suggested city from localStorage — shown as highlighted chip but NOT auto-selected */
    var suggestedCity = '';
    try { suggestedCity = localStorage.getItem('fixeo_detected_city') || ''; } catch (_) {}
    var suggestedNorm = _normCity(suggestedCity);
    var cityIsInList = suggestedCity && _ESTIMATOR_CITIES.some(function(c) {
      return _normCity(c) === suggestedNorm;
    });
    /* Canonical display form of the suggested city */
    var suggestedDisplay = cityIsInList
      ? _ESTIMATOR_CITIES.find(function(c) { return _normCity(c) === suggestedNorm; })
      : '';

    /* City chips — top cities first, then remainder */
    var topSet = new Set(_ESTIMATOR_TOP_CITIES);
    var otherCities = _ESTIMATOR_CITIES.filter(function(c) { return !topSet.has(c); });

    /* 7C.9L.3W: remembered city = current state.estimatorCity.
     * Shown with "✓ Sélectionnée" badge — distinct from "Détectée" (geolocation). */
    var rememberedCity = state.estimatorCity || '';
    var rememberedNorm = _normCity(rememberedCity);

    function _chip(city) {
      var isSuggested  = suggestedDisplay && _normCity(city) === _normCity(suggestedDisplay);
      var isRemembered = rememberedNorm && _normCity(city) === rememberedNorm;
      /* 7C.9L.3I: data-estimator-city delegated listener */
      var chipClass  = 'fixeo-res-slot' + ((isSuggested || isRemembered) ? ' active' : '');
      var chipBorder = (isSuggested || isRemembered) ? 'border:1.5px solid rgba(225,48,108,.6);' : '';
      var badge = '';
      if (isRemembered && !isSuggested) {
        badge = ' <span style="font-size:.65rem;opacity:.75">✓ Sélectionnée</span>';
      } else if (isSuggested) {
        badge = ' <span style="font-size:.65rem;opacity:.75">✓ Détectée</span>';
      }
      return '<button type="button" class="' + chipClass + '"'
        + ' data-estimator-city="' + sanitize(city) + '"'
        + ' style="text-align:center;padding:10px 14px;font-size:.85rem;font-weight:700;cursor:pointer;border-radius:10px;' + chipBorder + '">'
        + sanitize(city)
        + badge
        + '</button>';
    }

    var topChips    = _ESTIMATOR_TOP_CITIES.map(_chip).join('');
    var otherChips  = otherCities.map(_chip).join('');

    return `
      <div class="fixeo-res-dialog" role="document">
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${CATEGORY_ICONS[metier] || '🛠️'}</div>
            <div>
              <div class="fixeo-res-header-title">${sanitize(metierLabel)} — Prix FIXEO ${sanitize(amountDisplay)}</div>
              <div class="fixeo-res-header-sub">Sélectionnez votre ville d'intervention</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>
        <div class="fixeo-res-body">
          <div style="margin-bottom:14px">
            <div class="fixeo-res-label" style="margin-bottom:10px">📍 Où doit intervenir l'artisan&nbsp;?</div>
            <button type="button" class="fixeo-res-btn-secondary" data-res-back="city-back-to-estimator"
            style="margin-bottom:14px;align-self:flex-start;font-size:.8rem;padding:8px 14px;display:flex;align-items:center;gap:5px"
            aria-label="Retour à l'estimation">
            ← Retour
          </button>
          <div class="fixeo-res-slot-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
              ${topChips}
            </div>
            <div class="fixeo-res-slot-grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
              ${otherChips}
            </div>
          </div>
          <div style="font-size:.68rem;color:rgba(255,255,255,.32);text-align:center;padding-top:4px">
            Choisissez la ville pour voir les artisans disponibles
          </div>
        </div>
      </div>`;
  }

  /* ── 7C.9L.3C: Estimator-origin artisan picker — filtered artisan cards stage ──────
   * City known. Filters window.ARTISANS by exact métier + normalized city.
   * Renders canonical homepage cards via window.buildOtherArtisanCard(a, {estimatorMode}).
   * NEVER falls back to all artisans. NEVER falls back to another city silently.
   * ─────────────────────────────────────────────────────────────────────────────── */
  function renderEstimatorArtisanPicker() {
    var ctx    = state._estimatorCtx;
    var city   = state.estimatorCity;
    var metier = ctx && ctx.service_code ? ctx.service_code.split('.')[0] : '';
    var metierLabel = CATEGORY_LABELS[metier] || sanitize(metier);
    var amountDisplay = ctx && ctx.amount_mad ? ctx.amount_mad.toLocaleString('fr-FR') + '\u00a0MAD' : '';

    /* Strict métier + city filter — normalized comparison, "Maroc" default never matches */
    var normCity = _normCity(city);
    /* 7C.9L.3H: match a.category (canonical) OR a.service (Supabase fallback when
     * service_category column is read as row.category=undefined — see 3F audit).
     * Aligns with main.js matchCat contract. Never falls back to all artisans. */
    var matched = (window.ARTISANS || []).filter(function(a) {
      var aCat = (a.category || '').toLowerCase();
      var aSvc = (a.service  || '').toLowerCase();
      if (aCat !== metier && aSvc !== metier) return false;
      var ac = _normCity(a.city);
      if (!ac || ac === 'maroc') return false;  // "Maroc" default → no city data → exclude
      return ac.indexOf(normCity) !== -1;
    });

    /* Context header — shown above cards */
    var contextBadge = '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;'
      + 'background:linear-gradient(135deg,rgba(225,48,108,.12),rgba(131,58,180,.10));'
      + 'border:1px solid rgba(225,48,108,.25);border-radius:12px;margin-bottom:16px">'
      + '<span style="font-size:1.1rem">' + (CATEGORY_ICONS[metier] || '🛠️') + '</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:.82rem;font-weight:700;color:#fff">' + sanitize(metierLabel) + ' · ' + sanitize(city) + '</div>'
      + '<div style="font-size:.76rem;color:rgba(255,255,255,.55);margin-top:2px">Prix FIXEO&nbsp;: <strong style="color:#fff">' + sanitize(amountDisplay) + '</strong></div>'
      + '</div>'
      + '<button onclick="FixeoReservation._setEstimatorCity(null)" style="background:none;border:none;color:rgba(255,255,255,.45);font-size:.75rem;cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12)">Changer de ville</button>'
      + '</div>';

    /* Empty state — truthful, no fallback */
    if (matched.length === 0) {
      return `
        <div class="fixeo-res-dialog" role="document">
          <div class="fixeo-res-header">
            <div class="fixeo-res-header-left">
              <div class="fixeo-res-header-icon">${CATEGORY_ICONS[metier] || '🛠️'}</div>
              <div>
                <div class="fixeo-res-header-title">${sanitize(metierLabel)} · ${sanitize(city)}</div>
                <div class="fixeo-res-header-sub">Prix FIXEO — ${sanitize(amountDisplay)}</div>
              </div>
            </div>
            <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
          </div>
          <div class="fixeo-res-body">
            ${contextBadge}
            <div style="text-align:center;color:rgba(255,255,255,.55);padding:2rem 1rem">
              <div style="font-size:1.5rem;margin-bottom:10px">🔍</div>
              <div style="font-weight:700;margin-bottom:8px">Aucun artisan ${sanitize(metierLabel)} disponible à ${sanitize(city)} pour le moment.</div>
              <button onclick="FixeoReservation._setEstimatorCity(null)"
                style="margin-top:12px;padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:.85rem;font-weight:700;cursor:pointer">
                Changer de ville
              </button>
            </div>
          </div>
        </div>`;
    }

    /* Phase 7C.9L.3O — render matched artisans using the REAL official homepage
     * premium card renderer (fixeo_homepage_premium_patch.js _buildCard).
     * Priority A: FixeoHomepagePremium.buildCard (estimatorMode:true)
     *   → official pvc-card fhp-card layout, no price, CTA = "Choisir cet artisan"
     * Priority B: buildOtherArtisanCard — NOT used as preferred path per 3O spec.
     *   This path is intentionally absent; the official card is the only visual path.
     * Fallback: simple truthful card when premium renderer not yet loaded. */
    var useOfficialCard = (
      window.FixeoHomepagePremium &&
      typeof window.FixeoHomepagePremium.buildCard === 'function'
    );
    var cardsHtml = matched.slice(0, 9).map(function(a, idx) {
      if (useOfficialCard) {
        return window.FixeoHomepagePremium.buildCard(a, idx, { estimatorMode: true });
      }
      /* Fallback: simple truthful card (premium patch not yet loaded).
       * No inline reservation onclick — data-estimator-id delegated listener handles selection. */
      return '<article class="fixeo-res-picker-card" data-estimator-id="' + sanitize(String(a.id)) + '" role="button" tabindex="0">'
        + '<div class="fixeo-res-picker-info"><div class="fixeo-res-picker-name">' + sanitize(a.name) + '</div>'
        + '<div class="fixeo-res-picker-cat">' + sanitize(CATEGORY_LABELS[a.category] || a.category) + ' · ' + sanitize(a.city) + '</div>'
        + '<button class="fixeo-res-picker-cta" type="button" data-estimator-select="true">Choisir cet artisan</button>'
        + '</div></article>';
    }).join('');

    return `
      <div class="fixeo-res-dialog" role="document">
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${CATEGORY_ICONS[metier] || '🛠️'}</div>
            <div>
              <div class="fixeo-res-header-title">Artisans ${sanitize(metierLabel)} · ${sanitize(city)}</div>
              <div class="fixeo-res-header-sub">Sélectionnez votre artisan · Prix FIXEO ${sanitize(amountDisplay)}</div>
              <button type="button" class="fixeo-res-btn-secondary" data-res-back="city"
                style="margin-top:6px;font-size:.78rem;padding:5px 10px;display:inline-flex;align-items:center;gap:4px;align-self:flex-start">
                ← Retour
              </button>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>
        <div class="fixeo-res-body">
          ${contextBadge}
          <div style="${useOfficialCard ? 'display:flex;flex-direction:column;gap:16px' : ''}">
            ${cardsHtml}
          </div>
        </div>
      </div>`;
  }

  function renderArtisanPicker() {
    /* 7C.9L.3C/3W: Estimator-origin flow.
     * estimatorPickerScreen separates nav from data: null→derive, 'city'→city picker, 'artisan'→artisan picker */
    if (state._estimatorCtx && state._estimatorCtx.valid && !state.artisan) {
      var _screen = state.estimatorPickerScreen ||
                    (state.estimatorCity ? 'artisan' : 'city');
      if (_screen === 'city') {
        return renderEstimatorCityPicker();
      }
      return renderEstimatorArtisanPicker();
    }

    /* Generic picker — unchanged */
    const artisans = window.ARTISANS || [];
    const cardsHtml = artisans.slice(0, 8).map(a => {
      const catIcon = CATEGORY_ICONS[a.category] || '🛠️';
      const availClass = a.availability === 'available' ? 'available' : 'busy';
      return `
        <div class="fixeo-res-picker-card" onclick="FixeoReservation._selectArtisanFromPicker(${a.id})">
          ${(function(){ var _g=_modalAvatarGrad(a.name||''),_l=_modalInitials(a.name||a.initials||'');
            return '<div class="fixeo-res-picker-avatar fxrva-avatar fxrva-initials-av fxrva-avatar--sm" data-category="'+(a.category||'')+'" style="background:linear-gradient('+_g[0]+','+_g[1]+','+_g[2]+');font-size:.85rem;font-weight:800;color:rgba(255,255,255,.88);border-radius:50%;display:flex;align-items:center;justify-content:center;letter-spacing:-.02em"><span>'+sanitize(_l)+'</span></div>'; })()} 
          <div class="fixeo-res-picker-info">
            <div class="fixeo-res-picker-name">${sanitize(a.name)}</div>
            <div class="fixeo-res-picker-cat">${catIcon} ${CATEGORY_LABELS[a.category] || a.category}</div>
            <div class="fixeo-res-picker-meta">
              <!-- hts-1: rating is seeded data — not displayed in picker card -->
              <span class="fixeo-res-avail ${availClass} small">● ${a.availability === 'available' ? 'Dispo' : 'Occupé'}</span>
            </div>
            <div class="fixeo-res-picker-price">${a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="fixeo-res-dialog" role="document">
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">🛠️</div>
            <div>
              <div class="fixeo-res-header-title">📅 Réserver un artisan</div>
              <div class="fixeo-res-header-sub">Choisissez un artisan pour commencer</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>
        <div class="fixeo-res-body">
          <div class="fixeo-res-picker-grid">
            ${cardsHtml || '<div style="text-align:center;color:rgba(255,255,255,.5);padding:2rem">Aucun artisan disponible.</div>'}
          </div>
        </div>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════
     RENDER DISPATCH
  ════════════════════════════════════════════════════════ */
  /* Attach delegated click listener for service pills — called after render sets innerHTML */
  function _initPills() {
    var grid = document.getElementById('res-svc-pills');
    if (!grid) return; /* urgent/step2: no pills */
    /* Hover effect — scale up */
    grid.addEventListener('mouseover', function(e) {
      var pill = e.target.closest('[data-svc]');
      if (pill && !pill.classList.contains('active')) { pill.style.transform = 'scale(1.02)'; }
    });
    grid.addEventListener('mouseout', function(e) {
      var pill = e.target.closest('[data-svc]');
      if (pill && !pill.classList.contains('active')) { pill.style.transform = ''; }
    });
    grid.addEventListener('click', function(e) {
      var pill = e.target.closest('[data-svc]');
      if (!pill) return;
      var val = pill.getAttribute('data-svc');
      /* Toggle active state + lift effect */
      grid.querySelectorAll('.fixeo-res-slot').forEach(function(p) {
        p.classList.remove('active');
        p.style.transform = '';
        p.style.boxShadow = '';
      });
      pill.classList.add('active');
      pill.style.transform = 'translateY(-2px)';
      pill.style.boxShadow = '0 10px 25px rgba(225,48,108,.18)';
      /* Sync hidden input so _submitStep1 reads correct value */
      var hidden = document.getElementById('res-service');
      if (hidden) hidden.value = val;
      /* Trigger all display updates (hint, top price, tarif bar) */
      _onServiceChange(val);
    });
  }

  function render() {
    const modal = ensureModal();

    /* 3Z.1: Set/remove Estimator-V2-origin discriminator on the modal element.
     * This presentation-only marker tells FAEE (fixeo-estimation-engine-v1.js)
     * whether to suppress its legacy local price range for this reservation.
     * Contains no price, no token, no service code, no city.
     * Survives modal.innerHTML replacement (set on modal element itself, not inner DOM).
     * Cleared on every open() reset (state._estimatorCtx = null → render → attribute removed).
     */
    if (state._estimatorCtx && state._estimatorCtx.valid) {
      modal.setAttribute('data-estimator-context', 'true');
    } else {
      modal.removeAttribute('data-estimator-context');
    }

    if (!state.artisan) {
      modal.innerHTML = renderArtisanPicker();
    } else if (state.step === 1) {
      modal.innerHTML = renderStep1();
      _initPills();
    } else {
      modal.innerHTML = renderStep2();
    }
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC API: OPEN / CLOSE
  ════════════════════════════════════════════════════════ */
  /* ── 7C.9L.3C: City normalization helper — lowercase + NFD + strip diacritics + trim ── */
  function _normCity(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /* ── 7C.9L.3C: Canonical Moroccan city list — same 20 cities as fxrf4 / ALL_CITIES ── */
  var _ESTIMATOR_CITIES = [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Salé','Temara',
    'El Jadida','Béni Mellal','Nador','Khouribga','Safi',
    'Taza','Ouarzazate','Mohammedia'
  ];
  var _ESTIMATOR_TOP_CITIES = ['Casablanca','Rabat','Marrakech','Tanger','Agadir','Fès'];

  /* ── 7C.9L.3C: Set estimator city from picker — exposed for inline onclick ── */
  function _setEstimatorCity(city) {
    /* 7C.9L.3W: update city data AND navigation screen atomically.
     * null → city picker ('city'); non-null → artisan picker ('artisan').
     * "Changer de ville" passes null → city=null, screen=city. */
    state.estimatorCity        = city || null;
    state.estimatorPickerScreen = city ? 'artisan' : 'city';
    render();
  }

  function open(artisanInput, isExpress, urgentContext) {
    document.body.classList.add('fixeo-booking-modal-open');
    document.getElementById('ppui-sticky-cta')?.style.setProperty('display', 'none', 'important');
    document.getElementById('fixeo-floating-reserve')?.classList.remove('is-visible');
    document.getElementById('fixeo-floating-reserve')?.style.setProperty('display', 'none', 'important');
    // Reset state — always a clean slate
    state.step = 1;
    state.isExpress = !!isExpress;
    state.isUrgent  = false;
    state.selectedService = '';
    state.selectedDate = todayISO();
    state.selectedSlot = 'matin';
    state.description = '';
    state.address = '';
    state.phone = '';
    // 7C.9L.3C/3W: reset estimator-origin picker state
    state._estimatorCtx        = null;
    state.estimatorCity        = null;
    state.estimatorPickerScreen = null;  // 3W: reset navigation screen

    // Resolve artisan
    state.artisan = artisanInput ? normalizeArtisan(artisanInput) : null;

    // ── Urgent mode: prefill from urgentContext ──────────────────
    // urgentContext = { urgent:true, query, city, category, source }
    // Only activated when explicitly passed — all existing open(a, false) calls are unaffected.
    if (urgentContext && urgentContext.urgent === true) {
      state.isUrgent = true;
      state.description = urgentContext.query || '';
      state.selectedSlot = 'maintenant';
      const cat = (urgentContext.category || state.artisan?.category || '').toLowerCase();
      const catServices = SERVICE_MAP[cat];
      if (catServices && catServices.length) state.selectedService = catServices[0];
    }

    ensureBackdrop();

    // ── 7C.9L.3C: Estimator V2 context — await verification BEFORE first render ──
    // When estimator context token is in sessionStorage: verify server-side first,
    // then render (city picker for no-artisan estimator flow, or normal step 1).
    // Non-estimator paths: verifyContext returns null immediately — no latency.
    if (window.FixeoEstimatorConfig && window.FixeoEstimatorConfig.estimatorV2Enabled === true &&
        window.FixeoEstimatorReservationBridge && window.FixeoEstimatorReservationBridge.getContext()) {
      window.FixeoEstimatorReservationBridge.verifyContext().then(function(ctx) {
        if (ctx && ctx.valid) {
          state._estimatorCtx = ctx;
          if (ctx.city_slug) {
            // 7C.9L.3H/3W: server-verified city takes absolute precedence.
            // city_slug is non-authoritative for price; used only for artisan matching + nav.
            state.estimatorCity         = ctx.city_slug;
            state.estimatorPickerScreen  = 'artisan';
            // 7C.9L.3W.2: clear window city hint — server value wins; hint no longer needed.
            window._fxEstimatorReturnCityHint = '';
            // Clean up residual UX sessionStorage hint if present.
            try { sessionStorage.removeItem('fx_estimator_return_city_v1'); } catch (_) {}
          } else {
            // 7C.9L.3W.2/BUG-B: token has no city (minted with city_slug:null).
            // index.html removes fx_estimator_return_v1 BEFORE verifyContext() resolves,
            // so we cannot re-check sessionStorage here. Instead, index.html captures the
            // city into window._fxEstimatorReturnCityHint before clearing.
            var _hintCity = (window._fxEstimatorReturnCityHint || '').trim();
            // One-shot: clear window hint immediately (before any early return).
            window._fxEstimatorReturnCityHint = '';
            if (_hintCity) {
              // Validate against canonical city list before trusting.
              var _hintNorm  = _normCity(_hintCity);
              var _validCity = _ESTIMATOR_CITIES.find(function(c) {
                return _normCity(c) === _hintNorm;
              });
              if (_validCity) {
                // Valid UX city — restore artisan picker directly.
                // City is UX/matching state only; amount_mad + service come from server ctx.
                state.estimatorCity         = _validCity;
                state.estimatorPickerScreen  = 'artisan';
              }
              // Invalid city → _validCity = undefined → fall through; estimatorCity stays null.
            }
            // null → estimatorCity stays null → city picker shown (normal unknown-city flow).
          }
        }
        render();
      }).catch(function() {
        // 7C.9L.3W.2: Terminal verify failure — clear window city hint to prevent loops.
        window._fxEstimatorReturnCityHint = '';
        // Clear any residual UX sessionStorage keys (belt-and-suspenders).
        try {
          sessionStorage.removeItem('fx_estimator_return_v1');
          sessionStorage.removeItem('fx_estimator_return_city_v1');
        } catch (_) {}
        state._estimatorCtx = null;
        render();
      });
      // Show modal shell immediately; artisan picker renders after verifyContext resolves
      var modal = ensureModal();
      modal.innerHTML = '<div class="fixeo-res-dialog" role="document"><div class="fixeo-res-body" style="display:flex;align-items:center;justify-content:center;min-height:120px"><span style="color:rgba(255,255,255,.5);font-size:.9rem">Chargement…</span></div></div>';
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      render();
    }

    /* ── Refresh slot grid with booked slots for today ── */
    if (state.artisan && !state.isExpress && window.FixeoSlotLock) {
      requestAnimationFrame(function() {
        window.FixeoSlotLock.refreshSlotGrid(state.artisan.id, state.selectedDate);
      });
    }

    const _openModal = document.getElementById(MODAL_ID);
    if (_openModal) {
      _openModal.classList.add('open');
      document.body.style.overflow = 'hidden';
      // Urgent mode: focus address field immediately — skip service/date fields
      // Normal/express: focus first interactive element
      requestAnimationFrame(() => {
        const target = (state.isUrgent && !state.address)
          ? _openModal.querySelector('#res-address')
          : _openModal.querySelector('select, input, button');
        if (target) { target.focus({ preventScroll: true }); /* 3Z.2E.3: preventScroll prevents iOS viewport jump; scrollIntoView removed (modal is full-screen fixed) */ }
      });
    }
  }

  function openExpress(artisanInput) {
    open(artisanInput, true);
  }

  /* 7C.9L.3X: shared modal teardown used by both full close() and city-back-to-estimator.
   * Extracts only the presentation layer: modal, backdrop, body-lock, floating controls.
   * Does NOT destroy the Estimator — callers decide whether to do that. */
  function _dismissReservationLayer() {
    document.body.classList.remove('fixeo-booking-modal-open');
    var floatBtn = document.getElementById('fixeo-floating-reserve');
    if (floatBtn) floatBtn.style.removeProperty('display');
    var stickyBtn = document.getElementById('ppui-sticky-cta');
    if (stickyBtn) stickyBtn.style.removeProperty('display');
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('open');
    removeBackdrop();
    document.body.style.overflow = '';
  }

  function close() {
    _dismissReservationLayer();
    state.artisan = null;
    state.isExpress = false;
    /* 7C.9L.3X: true full exit — destroy hidden Estimator (if any) to prevent leak.
     * The handoff used hide() not close(), so the container may still be alive.
     * Estimator-origin reservation: destroy now that user is fully exiting the tunnel.
     * Non-Estimator reservation: FixeoEstimatorV2 either doesn't exist or is not open; safe no-op. */
    if (window.FixeoEstimatorV2 &&
        typeof window.FixeoEstimatorV2.close === 'function' &&
        typeof window.FixeoEstimatorV2.isOpen === 'function' &&
        window.FixeoEstimatorV2.isOpen()) {
      window.FixeoEstimatorV2.close();
    }
    /* 7C.9L.3Z.2D.1: signal true Reservation dismissal to Hero Resume controller.
     * Emitted ONLY here — after full modal teardown, after Estimator destroy.
     * NOT emitted by _dismissReservationLayer() (used for internal Step transitions).
     * NOT emitted on: artisan←Back, Step1←Back, Step2←Back, city-back-to-estimator.
     * No price payload. No token payload. No personal data. */
    try {
      document.dispatchEvent(new CustomEvent('fixeo:reservation-closed', { bubbles: false }));
    } catch (_e) { /* CustomEvent not supported — silent */ }
  }

  /* ════════════════════════════════════════════════════════
     INTERNAL HANDLERS (exposed on window.FixeoReservation._*)
  ════════════════════════════════════════════════════════ */
  function _selectArtisanFromPicker(id) {
    state.artisan = normalizeArtisan(id);
    state.step = 1;
    /* 7C.9L.3E: estimator mode — use exact Estimator service identity, never SERVICE_MAP[metier][0].
     * service_label = canonical human label ("Débouchage évier standard") from verified context.
     * service_code  = machine identity ("plomberie.debouchage_evier") — fallback when label absent.
     * SERVICE_MAP is never consulted for Estimator-origin service identity.
     * state._estimatorCtx is NOT reset here. */
    if (state._estimatorCtx && state._estimatorCtx.valid && state._estimatorCtx.service_code) {
      if (!state.selectedService) {
        state.selectedService = state._estimatorCtx.service_label || state._estimatorCtx.service_code;
      }
    }
    render();
  }

  function _onServiceChange(val) {
    state.selectedService = val;
    /* Update per-service price hint — display only, no total/payment change */
    var _sp = SERVICE_PRICING[val];
    var marcheEl = document.querySelector('[data-res-svc-marche]');
    var recEl    = document.querySelector('[data-res-svc-rec]');
    if (marcheEl) {
      marcheEl.textContent = _sp
        ? 'March\u00e9\u00a0: ' + _sp.from + '\u2013' + _sp.to + ' MAD'
        : 'March\u00e9\u00a0: s\u00e9lectionnez un service';
    }
    if (recEl) {
      recEl.innerHTML = _sp
        ? '\ud83d\udca1 Prix recommand\u00e9 Fixeo\u00a0: <strong style="color:rgba(255,255,255,.75)">~' + Math.round((_sp.from + _sp.to) / 2) + '\u00a0MAD</strong>'
        : '';
    }
    /* Sync top price display + tarif bar — display only, no state/total change */
    if (_sp) {
      var priceEl = document.getElementById('res-price-display');
      if (priceEl) { priceEl.textContent = _sp.from + ' MAD'; }
      var tarifEl = document.getElementById('res-tarif-estime');
      /* 7C.10C.0.4: Estimator verified context uses FIXEO copy; normal path keeps market copy */
      if (tarifEl && !(state._estimatorCtx && state._estimatorCtx.valid)) {
        tarifEl.innerHTML = '\ud83d\udca1 <em style="font-style:normal">Estimation bas\u00e9e sur les prix du march\u00e9.</em><br><span style="font-size:.72rem;color:rgba(255,255,255,.5)">Aucun paiement maintenant \u2014 vous payez apr\u00e8s intervention.</span>';
      }
      var unitEl = document.getElementById('res-price-unit');
      if (unitEl) { unitEl.style.display = _sp ? 'none' : ''; }
    }
  }
  function _onDateChange(val) {
    state.selectedDate = val;
    /* Re-render slot grid with updated booked slots */
    if (window.FixeoSlotLock && state.artisan) {
      /* Petit délai pour laisser le DOM se stabiliser */
      requestAnimationFrame(function() {
        window.FixeoSlotLock.refreshSlotGrid(state.artisan.id, val);
        /* Si le créneau actuellement sélectionné devient bloqué, désélectionner */
        if (window.FixeoSlotLock.isSlotBooked(state.artisan.id, val, state.selectedSlot)) {
          state.selectedSlot = '';
          const active = document.querySelector('#res-slot-grid .fixeo-res-slot.active');
          if (active) active.classList.remove('active');
        }
      });
    }
  }
  function _onDescChange(val)    { state.description = val; }
  function _onAddressChange(val) { state.address = val; }
  function _onPhoneChange(val)   { state.phone = val; }

  function _onSlotClick(el, slot) {
    state.selectedSlot = slot;
    document.querySelectorAll('#res-slot-grid .fixeo-res-slot')
      .forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }

  function _showError(msg) {
    const el = document.getElementById('res-error');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  /* ════════════════════════════════════════════════════════
     INTEGRITY V1-A — Phone + Address validators
     (reservation-local copies — no shared dependency)
  ════════════════════════════════════════════════════════ */
  function _resNormalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.charAt(0) === '0' && d.length >= 2) d = '212' + d.slice(1);
    return d;
  }
  function _resIsValidMARPhone(raw) {
    if (!raw || !String(raw).trim()) return false;
    var d = _resNormalizePhone(String(raw).trim());
    if (!/^212[6-9]\d{8}$/.test(d)) return false;
    if (/^(\d)\1+$/.test(d)) return false;
    return true;
  }
  function _resIsUsableAddress(raw) {
    var s = String(raw || '').trim();
    if (s.length < 10) return false;
    if (/^(.)\1+$/i.test(s.replace(/\s/g, ''))) return false;
    if (/^\d+$/.test(s)) return false;
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    var junk = ['test', 'adresse', 'address', 'aaaa', 'bbbb', 'xxxx', 'essai'];
    var words = low.split(/\s+/);
    if (words.length > 0 && words.every(function(w) {
      return junk.some(function(j) { return w.startsWith(j); });
    })) return false;
    return true;
  }

  /* ════════════════════════════════════════════════════════
     INTEGRITY V1-A — Pipeline Bridge
     Writes a unified request object into fixeo_client_requests
     after every successful COD booking, making it visible
     to the artisan inbox (artisan-dashboard-p4.js).
     — Non-blocking, wrapped in try/catch
     — Dedup-safe: source:'reservation_cod' + reservation_ref
       prevent re-injection on page reload
     — Skips if FixeoClientRequestsStore unavailable
  ════════════════════════════════════════════════════════ */
  function _bridgeToArtisanInbox(bookingData, orderID, artisanCity) {
    try {
      var store = window.FixeoClientRequestsStore;
      if (!store || typeof store.appendRequest !== 'function') return;

      /* Check for existing bridged entry with same reservation_ref */
      var existing = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
      if (Array.isArray(existing) && existing.some(function(r) {
        return r.reservation_ref === orderID;
      })) return; /* already bridged — idempotent guard */

      var payload = {
        service     : String(bookingData.service     || '').trim() || 'Réservation Fixeo',
        city        : String(artisanCity             || bookingData.artisanCity || '').trim() || 'Ville à préciser',
        description : String(bookingData.description || '').trim() ||
                      'Réservation directe — ' + (bookingData.service || 'service') +
                      (bookingData.date ? ' · ' + bookingData.date : '') +
                      (bookingData.timeSlot ? ' · ' + bookingData.timeSlot : ''),
        budget      : String(bookingData.price ? bookingData.price + ' MAD (réservation)' : ''),
        phone       : String(bookingData.phone       || '').trim(),
        urgency     : bookingData.isExpress ? 'Urgent' : 'Normale'
      };

      var result = store.appendRequest(payload);
      if (result && result.request && !result.duplicated) {
        /* Patch source metadata onto the raw stored object */
        try {
          var raw = JSON.parse(localStorage.getItem('fixeo_client_requests') || '[]');
          var reqId = String(result.request.id);
          var patched = false;
          for (var i = raw.length - 1; i >= 0; i--) {
            if (String(raw[i].id) === reqId) {
              raw[i].source          = 'reservation_cod';
              raw[i].reservation_ref = orderID;
              raw[i].artisan_name    = String(bookingData.artisanName || '').trim();
              raw[i].artisan_id      = String(bookingData.artisanId   || '');
              /* V2-A3: Write canonical artisan identity so V2-A1 mirror and
               * V2-A2 rehydration both use the same strong ID for Supabase writes/reads.
               * Prefer _artisan_id_canonical (from profile page) > artisanId (URL param).
               */
              var _artisan4bridge = state && state.artisan ? state.artisan : {};
              var _canonId = String(
                _artisan4bridge._artisan_id_canonical ||
                _artisan4bridge._supabase_id ||
                _artisan4bridge.owner_account_id ||
                bookingData.artisanId || ''
              ).trim();
              if (_canonId) {
                raw[i].artisan_id_canonical = _canonId;
                raw[i].artisan_profile_id   = _canonId;
              }
              patched = true;
              break;
            }
          }
          if (patched) localStorage.setItem('fixeo_client_requests', JSON.stringify(raw));
        } catch(_) { /* metadata patch failure is non-critical */ }
      }
    } catch(_) { /* bridge failure must never affect booking flow */ }
  }

  function _submitStep1() {
    // Read current values from DOM
    const serviceEl = document.getElementById('res-service');
    const dateEl    = document.getElementById('res-date');
    const descEl    = document.getElementById('res-desc');
    const addrEl    = document.getElementById('res-address');
    const phoneEl   = document.getElementById('res-phone');

    if (serviceEl) state.selectedService = serviceEl.value;
    if (dateEl)    state.selectedDate    = dateEl.value;
    if (descEl)    state.description     = descEl.value;
    if (addrEl)    state.address         = addrEl.value;
    if (phoneEl)   state.phone           = phoneEl.value;

    // Validation
    // Urgent: service is preselected (hidden input) — skip service validation
    // Urgent: no date picker rendered — skip date validation
    if (!state.isUrgent && !state.selectedService) {
      _showError('⚠️ Veuillez choisir un service.');
      serviceEl && serviceEl.focus();
      return;
    }
    if (!state.isUrgent && !state.isExpress && !state.selectedDate) {
      _showError('⚠️ Veuillez sélectionner une date.');
      dateEl && dateEl.focus();
      return;
    }
    /* ── V1-A: Address quality gate ──────────────────────── */
    if (!state.address || !_resIsUsableAddress(state.address)) {
      _showError('⚠️ Adresse incomplète — précisez la rue, le quartier ou un repère (min. 10 caractères).');
      addrEl && addrEl.focus();
      return;
    }
    /* ── V1-A: Moroccan phone validation (all modes) ──────── */
    if (!state.phone || !_resIsValidMARPhone(state.phone)) {
      _showError('⚠️ Numéro de téléphone invalide — format\u00a0: 06 ou 07 + 8 chiffres.');
      phoneEl && phoneEl.focus();
      return;
    }

    /* ── Slot Lock validation ─────────────────── */
    if (!state.isExpress && window.FixeoSlotLock) {
      const artId = state.artisan ? state.artisan.id : 0;
      if (!window.FixeoSlotLock.validateSlotOnSubmit(artId, state.selectedDate, state.selectedSlot)) {
        return; /* créneau déjà réservé — erreur affichée par validateSlotOnSubmit */
      }
    }
    _showError('');
    state.step = 2;
    render();
    // Scroll modal to top
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.scrollTop = 0;
  }

  function _goToStep1() {
    state.step = 1;
    render();
  }

  /* 7C.9L.3U: Back from Step 1 → artisan picker.
   * Preserves: _estimatorCtx, estimatorCity, selectedService, pricing_context_token.
   * Saves current form draft from DOM before clearing artisan. */
  function _goToArtisanPicker() {
    var descEl = document.getElementById('res-desc');
    var addrEl = document.getElementById('res-address');
    var phoneEl = document.getElementById('res-phone');
    if (descEl) state.description = descEl.value;
    if (addrEl) state.address = addrEl.value;
    if (phoneEl) state.phone = phoneEl.value;
    state.artisan = null;
    render();
  }

  // ── Urgent: show loading state then hand off to payment ──────────────────
  function _urgentConfirm(btn, total) {
    if (!btn) { _proceedToPayment(total); return; }
    btn.disabled = true;
    btn.textContent = 'Fixeo pr\u00e9pare l\u2019intervention\u2026';
    btn.style.opacity = '0.85';
    btn.style.cursor = 'not-allowed';
    setTimeout(function() {
      if (btn) {
        btn.textContent = '\u2714 Intervention enregistr\u00e9e\u2026';
        btn.style.background = 'linear-gradient(135deg,#20c997,#0d9e76)';
      }
      setTimeout(function() { _proceedToPayment(total); }, 900);
    }, 1200);
  }

  function _proceedToPayment(total) {
    const a = state.artisan;
    const slotLabel = state.isExpress
      ? 'Dès maintenant'
      : (TIME_SLOTS.find(t => t.value === state.selectedSlot)?.label || state.selectedSlot);

    const bookingData = {
      artisanName : a.name,
      artisanId   : a.id,
      service     : state.selectedService,
      date        : state.isExpress
                      ? 'Aujourd\'hui (dans l\'heure)'
                      : formatDateFR(state.selectedDate),
      timeSlot    : slotLabel,
      description : state.description,
      address     : state.address,
      phone       : state.phone,
      price       : total,
      _total      : total,
      isExpress   : state.isExpress,
      _estimator_context_token: (state._estimatorCtx && state._estimatorCtx._token) || null,
      _estimator_outcome_type: (state._estimatorCtx && state._estimatorCtx.outcome_type) || null,
      _parts_separate: (state._estimatorCtx && state._estimatorCtx.parts_separate) || false,
      _is_diagnostic: (state._estimatorCtx && state._estimatorCtx.is_diagnostic) || false,
    };

    /* ── Lire la méthode de paiement sélectionnée ── */
    const selectedMethod = (window.FixeoCOD && typeof window.FixeoCOD.getSelectedMethod === 'function')
      ? window.FixeoCOD.getSelectedMethod()
      : 'cod'; /* COD par défaut */

    /* ══════════════════════════════════════════════════════
       BRANCHEMENT PAR MÉTHODE DE PAIEMENT
    ══════════════════════════════════════════════════════ */

    /* ── COD : Cash on Delivery ─────────────────────────── */
    if (selectedMethod === 'cod') {
      close(); /* fermer le modal réservation */

      if (window.FixeoCOD && typeof window.FixeoCOD.processCOD === 'function') {
        window.FixeoCOD.processCOD(bookingData, {
          onLoading: function(msg) {
            if (window.notifications && window.notifications.info) {
              window.notifications.info('⏳', msg);
            }
          },
          onSuccess: function(orderID, record, apiBody) {
            /* Gamification hook */
            if (window.gamification && window.gamification.updateMission) {
              window.gamification.updateMission('m2', 1);
            }
            /* ── V1-A: Pipeline bridge → artisan inbox ─────────── */
            _bridgeToArtisanInbox(bookingData, orderID, a.city || '');
            /* 7C.9L.3Z.2D.1: clear verified pricing context before redirect so that
             * returning to homepage via Back does NOT resurface old price card.
             * The booking is complete — the pricing journey is consumed. */
            if (window.FixeoEstimatorReservationBridge &&
                typeof window.FixeoEstimatorReservationBridge.clearContext === 'function') {
              window.FixeoEstimatorReservationBridge.clearContext();
            }
            /* ── Redirection vers la page de confirmation COD v15 ── */
            const confirmURL = (window.FixeoCOD && window.FixeoCOD.config)
              ? window.FixeoCOD.config.CONFIRMATION_URL
              : 'confirmation.html';
            window.location.href = confirmURL;
          },
          onError: function(err) {
            if (window.notifications && window.notifications.error) {
              window.notifications.error('❌ Erreur COD', err);
            } else {
              alert('❌ Erreur lors de l\'enregistrement COD : ' + err);
            }
          }
        });
      } else {
        /* FixeoCOD non chargé — fallback basique */
        close();
        const codID  = 'COD-' + Date.now().toString(36).toUpperCase();
        const codRef = 'BKG-COD-' + Date.now().toString(36).toUpperCase();
        const codCommission = Math.round(total * 0.10);
        const codNet = Math.round(total - codCommission);
        const stored = JSON.parse(localStorage.getItem('fixeo_reservations') || '[]');
        stored.unshift({
          id: codID, bookingRef: codRef,
          artisan: a.name, artisanId: a.id, service: bookingData.service,
          date: bookingData.date, time: slotLabel,
          price: total, commission: codCommission, netArtisan: codNet,
          paymentMethod: 'Cash on Delivery', method: 'Cash on Delivery',
          status: 'pending', payStatus: 'pending_cod', slotLock: true,
          createdAt: new Date().toLocaleDateString('fr-FR'),
        });
        localStorage.setItem('fixeo_reservations', JSON.stringify(stored));
        if (window.FixeoSlotLock) {
          window.FixeoSlotLock.onReservationCreated({
            artisanId: a.id, artisanName: a.name, service: bookingData.service,
            date: state.selectedDate, time: state.isExpress ? 'maintenant' : state.selectedSlot,
            timeSlot: slotLabel, price: total, isExpress: state.isExpress,
          });
        }
        /* V1-A: Pipeline bridge (FixeoCOD fallback path) */
        _bridgeToArtisanInbox(bookingData, codID, a.city || '');
        /* 7C.9L.3Z.2D.1: clear pricing context — booking consumed */
        if (window.FixeoEstimatorReservationBridge &&
            typeof window.FixeoEstimatorReservationBridge.clearContext === 'function') {
          window.FixeoEstimatorReservationBridge.clearContext();
        }
        alert(`\u2705 Votre artisan est r\u00e9serv\u00e9 \u2705\nR\u00e9f\u00e9rence\u00a0: ${codRef}\nMontant\u00a0: ${total} MAD (paiement \u00e0 la livraison)`);
      }

      /* ── Notify SlotLock & Admin ── */
      if (window.FixeoSlotLock) {
        window.FixeoSlotLock.onReservationCreated({
          artisanId   : bookingData.artisanId,
          artisanName : bookingData.artisanName,
          service     : bookingData.service,
          date        : state.selectedDate,
          time        : state.isExpress ? 'maintenant' : state.selectedSlot,
          timeSlot    : slotLabel,
          price       : total,
          isExpress   : state.isExpress,
          paid        : false,
          paymentMethod: 'Cash on Delivery',
        });
      }
      if (window.FixeoAdminReservations && typeof window.FixeoAdminReservations.addReservation === 'function') {
        window.FixeoAdminReservations.addReservation({
          artisanId: bookingData.artisanId, artisanName: bookingData.artisanName,
          service: bookingData.service, date: bookingData.date, timeSlot: slotLabel,
          price: total, isExpress: state.isExpress,
          paid: false, paymentMethod: 'Cash on Delivery', payStatus: 'pending_cod',
        });
      }
      return; /* ← sortir ici pour COD */
    }

    /* ── PAYPAL ──────────────────────────────────────────── */
    if (selectedMethod === 'paypal') {
      close(); /* fermer le modal réservation */
      if (window.FixeoPayment && typeof window.FixeoPayment.openBookingPayment === 'function') {
        window.FixeoPayment.openBookingPayment(bookingData);
      } else {
        if (window.notifications && window.notifications.info) {
          window.notifications.info('ℹ️ PayPal', 'Redirection vers le paiement PayPal...');
        }
      }
      return;
    }

    /* ── CMI (futur) ─────────────────────────────────────── */
    if (selectedMethod === 'cmi') {
      if (window.notifications && window.notifications.warning) {
        window.notifications.warning('🚧 CMI', 'CMI Maroc Télécommerce sera disponible prochainement.');
      } else {
        alert('🚧 CMI (Maroc Télécommerce) sera disponible prochainement.');
      }
      return;
    }

    /* ── Fallback générique ──────────────────────────────── */
    close();

    // Trigger FixeoPayment engine
    if (window.FixeoPayment && typeof window.FixeoPayment.openBookingPayment === 'function') {
      window.FixeoPayment.openBookingPayment(bookingData);
    } else {
      // Graceful fallback — show toast / notification
      if (window.FixeoPayment && window.FixeoPayment.showToast) {
        window.FixeoPayment.showToast('✅ Réservation envoyée', `Demande pour ${a.name} confirmée.`, 'success', 5000);
      } else if (window.notifications && window.notifications.success) {
        window.notifications.success('Votre artisan est r\u00e9serv\u00e9 \u2705', `Demande envoy\u00e9e \u00e0 ${a.name}.`);
      } else {
        alert(`\u2705 Votre artisan est r\u00e9serv\u00e9 \u2705\nArtisan\u00a0: ${a.name}\nService\u00a0: ${bookingData.service}\nDate\u00a0: ${bookingData.date}`);
      }

      // Save to localStorage
      const history = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
      history.push({
        id: 'BKG-' + Date.now().toString(36).toUpperCase(),
        type: state.isExpress ? 'express' : 'booking',
        artisan: a.name,
        service: bookingData.service,
        date: new Date().toLocaleDateString('fr-FR'),
        amount: total,
        status: 'confirmed',
      });
      localStorage.setItem('fixeo_payment_history', JSON.stringify(history));
    }

    /* ── Notify SlotLock engine (mark slot as taken) ── */
    if (window.FixeoSlotLock) {
      window.FixeoSlotLock.onReservationCreated({
        artisanId  : bookingData.artisanId,
        artisanName: bookingData.artisanName,
        service    : bookingData.service,
        date       : state.selectedDate,
        time       : state.isExpress ? 'maintenant' : state.selectedSlot,
        timeSlot   : slotLabel,
        price      : total,
        isExpress  : state.isExpress,
      });
    }

    /* ── Notify Admin Dashboard ── */
    if (window.FixeoAdminReservations && typeof window.FixeoAdminReservations.addReservation === 'function') {
      window.FixeoAdminReservations.addReservation({
        artisanId  : bookingData.artisanId,
        artisanName: bookingData.artisanName,
        service    : bookingData.service,
        date       : bookingData.date,
        timeSlot   : slotLabel,
        price      : total,
        isExpress  : state.isExpress,
        paid       : true,
        paymentMethod: 'Online',
      });
    }

    // Gamification hook
    if (window.gamification && window.gamification.updateMission) {
      window.gamification.updateMission('m2', 1);
    }

    // Notification system hook
    if (window.notifSystem && window.notifSystem.push) {
      window.notifSystem.push({
        type: 'success', icon: '📅',
        title: 'Réservation initiée',
        body: `Paiement en cours pour ${a.name} — ${state.selectedService}`,
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     KEYBOARD HANDLER
  ════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById(MODAL_ID);
      if (modal && modal.classList.contains('open')) {
        close();
      }
    }
  });

  /* ════════════════════════════════════════════════════════
     BACKWARD COMPATIBILITY BRIDGE
     Ensures legacy calls like openBookingModal(id) still work
  ════════════════════════════════════════════════════════ */
  window.openBookingModal = function (artisanId) {
    open(artisanId, false);
  };
  window.openExpressModal = function (artisanId) {
    open(artisanId, true);
  };
  window.openReservationModal = function (artisanInput, isExpress) {
    open(artisanInput, isExpress);
  };

  /* ════════════════════════════════════════════════════════
     EXPORT
  ════════════════════════════════════════════════════════ */
  window.FixeoReservation = {
    open,
    openExpress,
    close,
    // Internal handlers (called from inline HTML onclick)
    _selectArtisanFromPicker,
    _setEstimatorCity,    // 7C.9L.3C: used by estimator city picker inline onclick
    _onServiceChange,
    _onDateChange,
    _onDescChange,
    _onAddressChange,
    _onPhoneChange,
    _onSlotClick,
    _submitStep1,
    _goToStep1,
    _goToArtisanPicker,
    _urgentConfirm,
    _proceedToPayment,
    _initPills,
  };

})(window);
