/* ═══════════════════════════════════════════════════════════════════
   FIXEO PROFILE FLAGSHIP V1 — Production DOM Transformer
   Sprint: FXPROFILE-FLAGSHIP-V1.3.1
   Version token: fxpf-v131

   Architecture:
   - Runs at DCL+100ms (after fixeo-profile-v2a.js enhance() completes)
   - Reads artisan data from window._fixeoCurrentArtisan (set by V2A)
     and from existing DOM (.public-artisan-root)
   - Writes flagship HTML into a new #fxpf-root div prepended to
     #public-artisan-root (the old sections are hidden via CSS)
   - NEVER touches: reservation.js, #public-artisan-action, fixeo-profile-v2a.js
   - Idempotent: window._fxpfLoaded guard
   - Namespace: fxpf-* CSS / _fxpf JS
   ═══════════════════════════════════════════════════════════════════ */
;(function (window, document) {
  'use strict';

  /* ── Guard ── */
  if (window._fxpfLoaded) return;
  window._fxpfLoaded = true;

  /* ── Prices per category ── */
  var MAR_PRICES = {
    plomberie:    { from: 150, label: 'Plomberie' },
    electricite:  { from: 150, label: 'Électricité' },
    peinture:     { from: 200, label: 'Peinture' },
    nettoyage:    { from: 100, label: 'Nettoyage' },
    jardinage:    { from: 120, label: 'Jardinage' },
    demenagement: { from: 500, label: 'Déménagement' },
    bricolage:    { from: 100, label: 'Bricolage' },
    climatisation:{ from: 250, label: 'Climatisation' },
    menuiserie:   { from: 200, label: 'Menuiserie' },
    maconnerie:   { from: 200, label: 'Maçonnerie' },
    serrurerie:   { from: 100, label: 'Serrurerie' },
    carrelage:    { from: 180, label: 'Carrelage' },
    toiture:      { from: 300, label: 'Toiture' },
    vitrerie:     { from: 120, label: 'Vitrerie' },
    chauffage:    { from: 200, label: 'Chauffage' }
  };

  /* ── Category chips ── */
  var CAT_CHIPS = {
    plomberie:    ['Fuite & dépannage','Chauffe-eau','Travaux sanitaires','Robinetterie','Débouchage'],
    electricite:  ['Tableau électrique','Prises & interrupteurs','Éclairage','Dépannage urgence','Mise aux normes'],
    peinture:     ['Peinture intérieure','Enduit & plâtre','Décoration murale','Ravalement','Résine'],
    nettoyage:    ['Nettoyage appartement','Après travaux','Vitres & vitres','Moquette','Désinfection'],
    jardinage:    ['Tonte de pelouse','Taille haies','Arrosage','Aménagement','Élagage'],
    demenagement: ['Transport meuble','Emballage','Déménagement local','Montage meuble','Stockage'],
    bricolage:    ['Montage meuble','Fixations & chevilles','Petites réparations','Accrochage','Plomberie simple'],
    climatisation:['Installation clim','Entretien annuel','Réparation panne','Nettoyage filtre','Recharge gaz'],
    menuiserie:   ['Portes & fenêtres','Parquet','Placards','Escaliers','Boiseries'],
    maconnerie:   ['Carrelage','Enduits','Démolition','Cloisons','Rénovation'],
    serrurerie:   ['Ouverture porte','Changement serrure','Blindage','Dépannage urgence','Coffre-fort'],
    carrelage:    ['Pose carrelage','Faïence salle de bain','Joints','Dépose','Rénovation sol'],
    toiture:      ['Réparation fuite','Étanchéité','Zinguerie','Isolation','Nettoyage mousse'],
    vitrerie:     ['Remplacement vitre','Double vitrage','Miroirs','Verre trempé','Réparation'],
    chauffage:    ['Chaudière','Radiateurs','Plancher chauffant','Entretien annuel','Panne urgence']
  };

  /* ── FAQ items ── */
  var FAQ_ITEMS = [
    ['Comment envoyer une demande ?', "Cliquez sur \"Demander une intervention\", sélectionnez le service et votre localisation. Fixeo coordonne avec l'artisan pour confirmer."],
    ['Comment le tarif est-il confirmé ?', "Le budget affiché est une fourchette marché. Le tarif définitif est confirmé directement avec l'artisan avant toute intervention."],
    ['Quand le paiement est-il effectué ?', "Après l'intervention uniquement. Aucun pré-paiement n'est requis via Fixeo."],
    ["Comment l'artisan me contacte-t-il ?", "Fixeo coordonne avec l'artisan et vous confirme les détails par message ou appel."]
  ];

  /* ── Helpers ── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function normCat(raw) {
    return String(raw || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,'');
  }

  function getPrice(cat) {
    var key = normCat(cat);
    for (var k in MAR_PRICES) {
      if (key.indexOf(k) !== -1 || k.indexOf(key.slice(0,5)) !== -1) return MAR_PRICES[k];
    }
    return null;
  }

  function getChips(cat) {
    var key = normCat(cat);
    for (var k in CAT_CHIPS) {
      if (key.indexOf(k) !== -1 || k.indexOf(key.slice(0,5)) !== -1) return CAT_CHIPS[k];
    }
    return [];
  }

  /* ── Avatar resolution — canonical chain (matches homepage getCardAvatar) ── */
  function resolveAvatarSrc(artisan) {
    /* Priority 1: real Supabase photo */
    var photo = (artisan && (artisan.photo_url || artisan.avatar || artisan.photo || artisan.image || '')) || '';
    if (photo && photo.startsWith('http')) return { src: photo, isHero: false };
    /* Priority 2: FIXEO Hero (same call as homepage artisan cards) */
    if (window.FixeoHeroes && typeof window.FixeoHeroes.getCardAvatar === 'function') {
      var cat = artisan && (artisan.category || artisan.service || '');
      var hero = window.FixeoHeroes.getCardAvatar(cat);
      if (hero) return { src: hero, isHero: true };
    }
    /* Priority 3: generic Hero.getAvatar */
    if (window.FixeoHeroes && typeof window.FixeoHeroes.getAvatar === 'function') {
      var cat2 = artisan && (artisan.category || artisan.service || '');
      var hero2 = window.FixeoHeroes.getAvatar(cat2);
      if (hero2) return { src: hero2, isHero: true };
    }
    return null;
  }

  function buildAvatar(artisan) {
    var r = resolveAvatarSrc(artisan);
    var name = artisan && artisan.name ? artisan.name : 'Artisan';
    if (r) {
      return '<div class="fxpf-av">' +
        '<img src="' + esc(r.src) + '" alt="' + esc(name) + '" loading="eager" decoding="async"' +
        (r.isHero ? ' onerror="this.style.display=\'none\'"' : '') +
        '></div>';
    }
    /* Emoji fallback */
    var cat = normCat(artisan && (artisan.category || ''));
    var emoji = cat.indexOf('plomb') !== -1 ? '👨‍🔧'
      : cat.indexOf('elect') !== -1 ? '🧑‍🔧'
      : cat.indexOf('serr') !== -1 ? '👨‍🏭'
      : cat.indexOf('peint') !== -1 ? '👨‍🎨'
      : cat.indexOf('jardin') !== -1 ? '🧑‍🌾'
      : '👷';
    return '<div class="fxpf-av" style="display:flex;align-items:center;justify-content:center;font-size:2.2rem">' + emoji + '</div>';
  }

  /* ── Review card ── */
  function buildReview(r) {
    var stars = '';
    var n = Math.max(0, Math.min(5, Math.round(Number(r.review_rating || 0))));
    stars = (n ? '★'.repeat(n) : '') + '☆'.repeat(5 - n);
    var dateStr = '';
    var d = r.review_date || r.validated_at || r.completed_at || r.created_at;
    if (d) { try { dateStr = new Date(d).toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'}); } catch(e){} }
    return '<div class="fxpf-review-card">' +
      '<div class="fxpf-review-head">' +
        '<span class="fxpf-review-stars">' + esc(stars) + '</span>' +
        (dateStr ? '<span class="fxpf-review-date">' + esc(dateStr) + '</span>' : '') +
      '</div>' +
      '<p class="fxpf-review-text">' + esc(r.review_comment || 'Avis client laissé sans commentaire.') + '</p>' +
    '</div>';
  }

  /* ── Main render ── */
  function render(artisan, reviews) {
    var name     = (artisan && artisan.name) || 'Artisan Fixeo';
    var category = (artisan && artisan.category) || 'Artisan';
    var city     = (artisan && artisan.city) || 'Maroc';
    var desc     = (artisan && artisan.description) || '';
    var priceInfo = getPrice(category);
    var chips    = getChips(category);

    /* ── Hero ── */
    var avatarHtml = buildAvatar(artisan);
    var descHtml = desc
      ? '<p class="fxpf-desc-text">' + esc(desc) + '</p>'
      : '<p class="fxpf-desc-empty">Description non renseignée. L\'artisan pourra compléter son profil.</p>';
    var priceHtml = priceInfo
      ? '<div class="fxpf-price" aria-label="Budget indicatif">' +
          '<span class="fxpf-price-kicker">Budget indicatif</span>' +
          '<span class="fxpf-price-badge">à partir de ' + priceInfo.from + ' MAD</span>' +
          '<span class="fxpf-price-note">Fourchette marché locale</span>' +
        '</div>'
      : '';

    var heroHtml =
      '<article class="fxpf-hero" aria-labelledby="fxpf-h1">' +
        '<div class="fxpf-hero-in">' +
          '<div class="fxpf-hero-top">' +
            '<div class="fxpf-av-col">' +
              avatarHtml +
              '<span class="fxpf-av-badge" aria-hidden="true">🔧</span>' +
            '</div>' +
            '<div class="fxpf-meta-col">' +
              '<div class="fxpf-status" role="status">' +
                '<span class="fxpf-status-dot" aria-hidden="true"></span>' +
                'Profil référencé sur FIXEO' +
              '</div>' +
              '<h1 class="fxpf-h1" id="fxpf-h1">' + esc(name) + '</h1>' +
              '<p class="fxpf-craft"><strong>' + esc(category) + '</strong><span class="fxpf-sep">·</span><span>' + esc(city) + '</span></p>' +
            '</div>' +
          '</div>' +
          descHtml +
          priceHtml +
          '<button class="fxpf-cta" id="fxpf-hero-cta" type="button" aria-label="Demander une intervention à ' + esc(name) + '">Demander une intervention</button>' +
          '<div class="fxpf-trust" role="list">' +
            '<div class="fxpf-trust-item" role="listitem"><span class="fxpf-trust-icon" aria-hidden="true">📋</span><span class="fxpf-trust-label">Profil référencé sur FIXEO</span></div>' +
            '<div class="fxpf-trust-item" role="listitem"><span class="fxpf-trust-icon" aria-hidden="true">💳</span><span class="fxpf-trust-label">Paiement après intervention</span></div>' +
            '<div class="fxpf-trust-item" role="listitem"><span class="fxpf-trust-icon" aria-hidden="true">📍</span><span class="fxpf-trust-label">Intervient à ' + esc(city) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</article>';

    /* ── Prestations ── */
    var prestHtml = priceInfo
      ? '<section class="fxpf-sec">' +
          '<p class="fxpf-kicker">Tarifs marché</p>' +
          '<h2 class="fxpf-sec-title">Prestations &amp; prix indicatifs</h2>' +
          '<div class="fxpf-prest-grid" role="list">' +
            '<div class="fxpf-prest-card" role="listitem"><span class="fxpf-prest-name">Fuite d\'eau — réparation</span><span class="fxpf-prest-price">' + priceInfo.from + '–' + (priceInfo.from * 2) + ' MAD</span></div>' +
            '<div class="fxpf-prest-card" role="listitem"><span class="fxpf-prest-name">Urgence</span><span class="fxpf-prest-price">' + (priceInfo.from + 50) + '–' + (priceInfo.from * 2 + 100) + ' MAD</span></div>' +
            '<div class="fxpf-prest-card" role="listitem"><span class="fxpf-prest-name">Installation</span><span class="fxpf-prest-price">' + (priceInfo.from + 100) + '–' + (priceInfo.from * 4) + ' MAD</span></div>' +
            '<div class="fxpf-prest-card" role="listitem"><span class="fxpf-prest-name">Réparation</span><span class="fxpf-prest-price">' + priceInfo.from + '–' + (priceInfo.from * 3) + ' MAD</span></div>' +
          '</div>' +
          '<p class="fxpf-footnote">Fourchettes indicatives. Tarif définitif confirmé avec l\'artisan selon l\'intervention.</p>' +
        '</section>'
      : '';

    /* ── About + chips ── */
    var chipsHtml = chips.length
      ? '<p class="fxpf-kicker" style="margin-top:15px">Interventions courantes</p>' +
        '<div class="fxpf-chips" role="list" aria-label="Interventions courantes en ' + esc(category) + '">' +
          chips.map(function(c){ return '<span class="fxpf-chip" role="listitem">' + esc(c) + '</span>'; }).join('') +
        '</div>'
      : '';
    var aboutHtml =
      '<section class="fxpf-sec--light">' +
        '<p class="fxpf-kicker">À propos</p>' +
        '<h2 class="fxpf-sec-title">' + esc(name) + ' · ' + esc(category) + ' à ' + esc(city) + '</h2>' +
        (desc ? '<p class="fxpf-desc-text">' + esc(desc) + '</p>' : '<p class="fxpf-bio-empty">Description non renseignée. L\'artisan pourra compléter son profil.</p>') +
        '<p class="fxpf-zone">📍 <strong>' + esc(city) + '</strong> et alentours</p>' +
        chipsHtml +
      '</section>';

    /* ── Scoring ── */
    var scoringHtml =
      '<div class="fxpf-sec--featured">' +
        '<div class="fxpf-sc-header">' +
          '<div class="fxpf-sc-icon" aria-hidden="true">⚙️</div>' +
          '<div>' +
            '<div class="fxpf-sc-title">Évaluation FIXEO</div>' +
            '<div class="fxpf-sc-sub">Infrastructure algorithmique</div>' +
          '</div>' +
        '</div>' +
        '<div class="fxpf-sc-badge" role="status"><span class="fxpf-sc-dot" aria-hidden="true"></span>Scoring en cours d\'initialisation</div>' +
        '<p class="fxpf-sc-desc">Les indicateurs évolueront à partir de l\'activité réelle enregistrée sur FIXEO : confirmations, interventions, retours clients et complétude du profil.</p>' +
        '<div class="fxpf-sc-grid" role="list">' +
          '<div class="fxpf-sc-row" role="listitem"><div class="fxpf-sc-lbl">Profil</div><div class="fxpf-sc-val">Référencé sur FIXEO</div></div>' +
          '<div class="fxpf-sc-row" role="listitem"><div class="fxpf-sc-lbl">Scoring</div><div class="fxpf-sc-val">En initialisation</div></div>' +
          '<div class="fxpf-sc-row" role="listitem"><div class="fxpf-sc-lbl">Activité</div><div class="fxpf-sc-val">Données à venir</div></div>' +
          '<div class="fxpf-sc-row" role="listitem"><div class="fxpf-sc-lbl">Tarification</div><div class="fxpf-sc-val">Estimation marché</div></div>' +
        '</div>' +
      '</div>';

    /* ── Réalisations ── */
    var realHtml =
      '<section class="fxpf-sec">' +
        '<p class="fxpf-kicker">Réalisations</p>' +
        '<h2 class="fxpf-sec-title">Réalisations</h2>' +
        '<div class="fxpf-empty">' +
          '<div class="fxpf-empty-icon" aria-hidden="true">🖼️</div>' +
          '<div>' +
            '<div class="fxpf-empty-text">Aucune réalisation publiée pour le moment.</div>' +
            '<div class="fxpf-empty-sub">L\'artisan pourra enrichir ce profil avec des photos de ses travaux.</div>' +
          '</div>' +
        '</div>' +
      '</section>';

    /* ── Avis ── */
    var avisInner = reviews.length
      ? '<div class="fxpf-review-list">' + reviews.slice(0,5).map(buildReview).join('') + '</div>'
      : '<div class="fxpf-empty">' +
          '<div class="fxpf-empty-icon" aria-hidden="true">💬</div>' +
          '<div>' +
            '<div class="fxpf-empty-text">Aucun avis publié pour le moment.</div>' +
            '<div class="fxpf-empty-sub">Les premiers retours clients alimenteront cette section.</div>' +
          '</div>' +
        '</div>';
    var avisHtml =
      '<section class="fxpf-sec">' +
        '<p class="fxpf-kicker">Avis</p>' +
        '<h2 class="fxpf-sec-title">Avis clients</h2>' +
        avisInner +
      '</section>';

    /* ── FAQ ── */
    var faqItems = FAQ_ITEMS.map(function(item, i) {
      return '<div class="fxpf-faq-item">' +
        '<button class="fxpf-faq-btn" aria-expanded="false" data-fxpf-faq="' + i + '">' +
          '<span class="fxpf-faq-q">' + esc(item[0]) + '</span>' +
          '<span class="fxpf-faq-ch" aria-hidden="true">›</span>' +
        '</button>' +
        '<div class="fxpf-faq-body" id="fxpf-faq-' + i + '"><p class="fxpf-faq-a">' + esc(item[1]) + '</p></div>' +
      '</div>';
    }).join('');
    var faqHtml =
      '<section class="fxpf-sec">' +
        '<p class="fxpf-kicker">Questions fréquentes</p>' +
        '<h2 class="fxpf-sec-title">Questions fréquentes</h2>' +
        faqItems +
      '</section>';

    /* ── Claim ── */
    var claimHtml =
      '<section class="fxpf-sec fxpf-claim">' +
        '<p class="fxpf-kicker">Pour l\'artisan</p>' +
        '<h2 class="fxpf-sec-title">Revendiquer ce profil</h2>' +
        '<p>Ce profil est géré par FIXEO. Si vous êtes ' + esc(name) + ', revendiquez-le pour compléter votre description, photos et disponibilités.</p>' +
        '<button class="fxpf-claim-btn" type="button">Revendiquer →</button>' +
      '</section>';

    /* ── Final CTA ── */
    var finalHtml =
      '<div class="fxpf-final" role="complementary">' +
        '<button class="fxpf-cta" id="fxpf-final-cta" type="button">Demander une intervention</button>' +
        '<p class="fxpf-final-note">💳 Paiement après intervention</p>' +
      '</div>';

    /* ── Desktop sidebar ── */
    var sideHtml = '';
    var avRes = resolveAvatarSrc(artisan);
    if (avRes) {
      sideHtml =
        '<div class="fxpf-side" aria-label="Résumé du profil">' +
          '<div class="fxpf-side-card">' +
            '<div class="fxpf-side-av"><img src="' + esc(avRes.src) + '" alt="" loading="lazy"></div>' +
            '<p class="fxpf-side-name">' + esc(name) + '</p>' +
            '<p class="fxpf-side-meta">' + esc(category) + ' · ' + esc(city) + '</p>' +
            '<p class="fxpf-side-price">Budget indicatif disponible</p>' +
            '<div class="fxpf-side-divider"></div>' +
            '<button class="fxpf-side-cta" id="fxpf-side-cta" type="button">Demander une intervention</button>' +
            '<div class="fxpf-side-trust">' +
              '<span class="fxpf-side-trust-item">📋 Profil référencé sur FIXEO</span>' +
              '<span class="fxpf-side-trust-item">💳 Paiement après intervention</span>' +
              '<span class="fxpf-side-trust-item">📍 Intervient à ' + esc(city) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    /* ── Float bar ── */
    var floatHtml =
      '<div class="fxpf-float" id="fxpf-float" role="complementary" aria-label="Action rapide">' +
        '<div class="fxpf-float-info">' +
          '<div class="fxpf-float-name">' + esc(name) + '</div>' +
          '<div class="fxpf-float-meta">' + esc(category) + ' · ' + esc(city) + '</div>' +
        '</div>' +
        '<button class="fxpf-float-btn" id="fxpf-float-cta" type="button">Demander</button>' +
      '</div>';

    /* ── Main column ── */
    var mainColHtml =
      '<div class="fxpf-main">' +
        heroHtml + prestHtml + aboutHtml + scoringHtml + realHtml + avisHtml + faqHtml + claimHtml + finalHtml +
      '</div>';

    /* ── Root wrapper ── */
    var wrapper = document.createElement('div');
    wrapper.id = 'fxpf-root';
    wrapper.setAttribute('aria-label', 'Profil artisan ' + name);
    if (sideHtml) {
      wrapper.className = 'fxpf-root fxpf-root--desktop';
      wrapper.innerHTML = mainColHtml + sideHtml;
    } else {
      wrapper.className = 'fxpf-root';
      wrapper.innerHTML = mainColHtml;
    }

    /* Float is body-level */
    var floatEl = document.createElement('div');
    floatEl.innerHTML = floatHtml;
    var floatNode = floatEl.firstChild;

    return { wrapper: wrapper, float: floatNode };
  }

  /* ── Reservation bridge: proxy CTA clicks to existing reservation engine ── */
  function bindCta(el, artisan) {
    if (!el) return;
    el.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      /* Prefer the existing hidden action button (wired to FixeoReservation.open) */
      var existing = document.getElementById('public-artisan-action');
      if (existing) {
        existing.click();
        return;
      }
      /* Fallback: open FixeoReservation directly */
      if (window.FixeoReservation && typeof window.FixeoReservation.open === 'function') {
        var a = artisan || {};
        var _sb = window._fixeoCurrentArtisan;
        if (_sb && typeof _sb === 'object') a = Object.assign({}, a, _sb);
        window.FixeoReservation.open(a, false);
      }
    });
  }

  /* ── FAQ toggle ── */
  function bindFaq(root) {
    root.querySelectorAll('[data-fxpf-faq]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = btn.getAttribute('data-fxpf-faq');
        var body = document.getElementById('fxpf-faq-' + idx);
        var open = body && body.classList.contains('open');
        if (body) body.classList.toggle('open', !open);
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
    });
  }

  /* ── Sticky float (IntersectionObserver) ── */
  function bindFloat(heroCta, floatEl, sideCta) {
    if (!heroCta) return;
    if (sideCta) sideCta.classList.remove('show');
    if (!('IntersectionObserver' in window)) {
      window.addEventListener('scroll', function() {
        var gone = heroCta.getBoundingClientRect().bottom < 0;
        if (floatEl) floatEl.classList.toggle('show', gone);
        if (sideCta) sideCta.classList.toggle('show', gone);
      }, { passive: true });
      return;
    }
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        var gone = !e.isIntersecting;
        if (floatEl) floatEl.classList.toggle('show', gone);
        if (sideCta) sideCta.classList.toggle('show', gone);
      });
    }, { threshold: 0.15 });
    obs.observe(heroCta);
  }

  /* ── Mount ── */
  function mount() {
    var root = document.getElementById('public-artisan-root');
    if (!root) return;
    /* Already mounted */
    if (document.getElementById('fxpf-root')) return;

    /* Collect artisan data: prefer Supabase (V2A sets window._fixeoCurrentArtisan) */
    var artisan = window._fixeoCurrentArtisan || null;
    if (!artisan) {
      /* Fallback: read from rendered DOM h1 + meta */
      var h1 = root.querySelector('h1');
      var meta = root.querySelector('.public-hero-meta');
      if (!h1) return; /* not yet rendered — retry */
      var parts = meta ? meta.textContent.split('•') : [];
      artisan = {
        name: h1.textContent.trim(),
        category: (parts[0] || '').trim(),
        city: (parts[1] || '').trim()
      };
    }

    /* Collect reviews from existing DOM data */
    var reviews = [];
    if (window._fixeoCurrentArtisan && Array.isArray(window._fixeoCurrentArtisan._reviews)) {
      reviews = window._fixeoCurrentArtisan._reviews;
    }

    /* Build flagship HTML */
    var out = render(artisan, reviews);

    /* Append flagship root before first child of root */
    root.insertBefore(out.wrapper, root.firstChild);

    /* Append float to body */
    document.body.appendChild(out.float);

    /* Activate flagship mode (hides old sections via CSS) */
    document.body.classList.add('fxpf-active');

    /* Bind CTAs → reservation bridge */
    var artisanForCta = artisan;
    bindCta(document.getElementById('fxpf-hero-cta'), artisanForCta);
    bindCta(document.getElementById('fxpf-final-cta'), artisanForCta);
    bindCta(document.getElementById('fxpf-float-cta'), artisanForCta);
    bindCta(document.getElementById('fxpf-side-cta'), artisanForCta);

    /* Bind FAQ */
    bindFaq(out.wrapper);

    /* Bind sticky float */
    bindFloat(
      document.getElementById('fxpf-hero-cta'),
      document.getElementById('fxpf-float'),
      document.getElementById('fxpf-side-cta')
    );

    /* Signal mount complete */
    window._fxpfMounted = true;
    document.dispatchEvent(new CustomEvent('fxpf:mounted', { detail: { artisan: artisan } }));
  }

  /* ── Init: wait for V2A to finish, then mount ── */
  function init() {
    /* If V2A has already set window._fixeoCurrentArtisan, mount immediately */
    if (window._fixeoCurrentArtisan) { mount(); return; }

    /* Wait for fixeo:artisan:resolved event (dispatched by fixeo-profile-v2a.js enhance()) */
    document.addEventListener('fixeo:artisan:resolved', function(e) {
      /* Merge resolved data into artisan store if provided */
      if (e && e.detail && e.detail.artisan && !window._fixeoCurrentArtisan) {
        window._fixeoCurrentArtisan = e.detail.artisan;
      }
      mount();
    }, { once: true });

    /* Safety fallback: mount after 2.5s even if V2A event never fired */
    setTimeout(function() {
      if (!window._fxpfMounted) mount();
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    /* DCL already fired — schedule after current call stack */
    setTimeout(init, 0);
  }

})(window, document);
