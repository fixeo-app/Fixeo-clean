/* ================================================================
   FIXEO — Artisan Profile V2-A + V2-B Enhancement Layer
   Trust Rebuild, Humanization & Professional Depth

   V2-A Responsibilities (2026-05-10):
   1. Fetch REAL artisan data from Supabase
   2. Inject REAL bio from artisan.description
   3. Surface badge_label in hero trust card
   4. Hero trust strip: price + paiement
   5. WhatsApp secondary CTA (prefilled, relay-only)
   6. Pricing context from MAR_PRICES
   7. Sticky mobile CTA upgrade

   V2-B Added (2026-05-10):
   8.  Local professional identity strip ("Intervient à [city] et alentours")
   9.  Intervention counter — tier-based honest social proof framing
   10. Rating context — "Parmi les meilleurs artisans Fixeo" (≥4.7 only)
   11. Specialty chips in bio — 3 chips from CAT_SKILLS, keyword-reordered
   12. Realizations elegant empty-state (honest, future-ready, no placeholders)
   13. WhatsApp CTA copy upgrade — operational, conversational, reassuring

   Architecture:
   - URL ?id= UUID → Supabase read-only SELECT, anon key
   - Progressive: Supabase failure → graceful noop throughout
   - Never modifies: reservation logic, #public-artisan-action, renderProfile
   - Idempotent: _fxProfileV2aLoaded guard + data-v2a-done per hero stamp
   - Namespace: fpv2a-* (V2-A) / fpv2b-* (V2-B)
   ================================================================ */

;(function () {
  'use strict';
  if (window._fxProfileV2aLoaded) return;
  window._fxProfileV2aLoaded = true;

  /* ── Config ──────────────────────────────────────────── */
  var WA_BASE    = 'https://wa.me/212660484415?text=';
  var MAR_PRICES = {
    'Plomberie':     { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'Electricit\u00e9':  { from: 100, label: 'D\u00e8s\u00a0100\u00a0MAD' },
    'Menuiserie':    { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'Peinture':      { from: 800, label: 'D\u00e8s\u00a0800\u00a0MAD' },
    'Nettoyage':     { from: 200, label: 'D\u00e8s\u00a0200\u00a0MAD' },
    'Climatisation': { from: 200, label: 'D\u00e8s\u00a0200\u00a0MAD' },
    'Ma\u00e7onnerie':  { from: 200, label: 'D\u00e8s\u00a0200\u00a0MAD' },
    'Carrelage':     { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'Jardinage':     { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'Serrurerie':    { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'D\u00e9m\u00e9nagement':{ from: 500, label: 'D\u00e8s\u00a0500\u00a0MAD' },
    'Bricolage':     { from: 100, label: 'D\u00e8s\u00a0100\u00a0MAD' },
    'Toiture':       { from: 300, label: 'D\u00e8s\u00a0300\u00a0MAD' },
    'Vitrerie':      { from: 200, label: 'D\u00e8s\u00a0200\u00a0MAD' },
    'Soudure':       { from: 150, label: 'D\u00e8s\u00a0150\u00a0MAD' },
    'Informatique':  { from: 100, label: 'D\u00e8s\u00a0100\u00a0MAD' }
  };

  /* ── Helpers ─────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getArtisanId() {
    try {
      return new URLSearchParams(window.location.search).get('id') || '';
    } catch(e) { return ''; }
  }

  function waitForHero(cb) {
    var el = document.querySelector('.public-profile-hero');
    if (el) { cb(el); return; }
    if (!window.MutationObserver) { setTimeout(function() { waitForHero(cb); }, 300); return; }
    var root = document.getElementById('public-artisan-root');
    if (!root) return;
    var obs = new MutationObserver(function() {
      var hero = document.querySelector('.public-profile-hero');
      if (hero) { obs.disconnect(); cb(hero); }
    });
    obs.observe(root, { childList: true, subtree: true });
    /* Safety timeout */
    setTimeout(function() { obs.disconnect(); }, 8000);
  }

  /* ── WhatsApp URL builder (prefilled from real data) ─── */
  function buildWaUrl(artisan) {
    var name    = (artisan.name || '').trim();
    var cat     = (artisan.category || '').trim();
    var city    = (artisan.city || '').trim();
    var msg = 'Bonjour Fixeo, je suis int\u00e9ress\u00e9' +
      (name ? ' par le profil de ' + name : '') +
      (cat  ? ' pour une intervention ' + cat.toLowerCase() : '') +
      (city ? ' \u00e0 ' + city : '') +
      '. Pouvez-vous me mettre en contact\u00a0?';
    return WA_BASE + encodeURIComponent(msg);
  }

  /* ── 1. Set badge_label on hero for premium-ui.js ─────── */
  /*
     premium-ui.js reads data-badge-label from .public-profile-hero.
     This runs BEFORE _injectBadges (150ms delay in premium-ui.js).
  */
  function injectBadgeLabel(hero, artisan) {
    var label = (artisan.badge_label || '').trim();
    if (!label) return;
    hero.dataset.badgeLabel = label;

    /* Also inject a dedicated badge_label chip in the trust card
     * for visibility — placed before the review line */
    if (document.querySelector('.fpv2a-badge-label')) return;
    var trustTop = hero.querySelector('.public-trust-top');
    if (!trustTop) return;

    var chip = document.createElement('div');
    chip.className = 'fpv2a-badge-label';
    chip.textContent = label;
    /* Insert as first child of trust card, giving it maximum prominence */
    var trustCard = hero.querySelector('.public-trust-card');
    if (trustCard && trustCard.firstChild) {
      trustCard.insertBefore(chip, trustCard.firstChild);
    } else if (trustCard) {
      trustCard.appendChild(chip);
    }
  }

  /* ── 2. Inject real bio from artisan.description ──────── */
  /*
     Only shown when description is non-empty and longer than 10 chars.
     ABSENCE > synthetic text: if empty, section is not created at all.
  */
  function injectBio(artisan) {
    if (document.getElementById('fpv2a-bio')) return;
    var desc = (artisan.description || '').trim();
    if (!desc || desc.length < 10) return; /* no description → no section */

    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var cat  = (artisan.category || '').trim();
    var city = (artisan.city || '').trim();

    var section = document.createElement('section');
    section.id = 'fpv2a-bio';
    section.className = 'ppui-section fpv2a-bio-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">Artisan local</p>' +
      '<h2 class="ppui-section-title">' +
        (cat ? esc(cat) : 'Artisan') +
        (city ? ' \u00e0 ' + esc(city) : '') +
      '</h2>' +
      '<p class="fpv2a-bio-text">' + esc(desc) + '</p>';

    /* Insert before public-section-grid (reviews/stats) */
    var grid = root.querySelector('.public-section-grid');
    if (grid) root.insertBefore(section, grid);
    else root.appendChild(section);
  }

  /* ── 3. Inject pricing + trust strip in hero ──────────── */
  /*
     Shows: price anchor ("Dès 150 MAD") + "Paiement après intervention"
     Placed below the CTA button — grounding the commitment in value.
  */
  function injectHeroTrustStrip(hero, artisan) {
    if (hero.querySelector('.fpv2a-trust-strip')) return;
    var btn = hero.querySelector('#public-artisan-action');
    if (!btn) return;

    /* Price range from category market data */
    var cat        = (artisan.category || '').trim();
    var priceInfo  = MAR_PRICES[cat];
    var priceHtml  = priceInfo
      ? '<span class="fpv2a-price-anchor">' + esc(priceInfo.label) + ' \u00b7 Estimation march\u00e9</span>'
      : '';

    var strip = document.createElement('div');
    strip.className = 'fpv2a-trust-strip';
    strip.innerHTML =
      (priceHtml ? priceHtml + '<span class="fpv2a-strip-sep">&nbsp;</span>' : '') +
      '<span class="fpv2a-paiement">\u2714\ufe0f Paiement apr\u00e8s intervention</span>';

    /* Insert after the reassurance hint (ppui-cta-reassurance) or after btn */
    var reassurance = btn.nextElementSibling;
    var anchor = (reassurance && reassurance.classList.contains('ppui-cta-reassurance'))
      ? reassurance
      : btn;
    anchor.parentNode.insertBefore(strip, anchor.nextSibling);
  }

  /* ── 4. WhatsApp secondary CTA in hero ───────────────── */
  /*
     Lower-friction first contact below the main reservation button.
     Pre-filled message from real artisan data.
     Never shows a direct artisan phone — always routes through Fixeo relay.
  */
  function injectWASecondary(hero, artisan) {
    if (hero.querySelector('#fpv2a-wa-cta')) return;
    var btn = hero.querySelector('#public-artisan-action');
    if (!btn) return;

    var waUrl = buildWaUrl(artisan);

    var waBtn = document.createElement('a');
    waBtn.id        = 'fpv2a-wa-cta';
    waBtn.className = 'fpv2a-wa-cta';
    waBtn.href      = waUrl;
    waBtn.target    = '_blank';
    waBtn.rel       = 'noopener noreferrer';
    waBtn.setAttribute('aria-label', 'Contacter via WhatsApp Fixeo');
    waBtn.innerHTML = '<span class="fpv2a-wa-icon">\ud83d\udcac</span> <span class="fpv2a-wa-text">Poser une question via WhatsApp</span>';

    /* Insert after the trust strip or after the reassurance line, below btn */
    var strip       = hero.querySelector('.fpv2a-trust-strip');
    var reassurance = hero.querySelector('.ppui-cta-reassurance');
    var anchor      = strip || reassurance || btn;
    anchor.parentNode.insertBefore(waBtn, anchor.nextSibling);
  }

  /* ── 5. Update sticky mobile CTA with artisan context ─── */
  function upgradeStickyCTA(artisan) {
    var waBtn = document.getElementById('ppui-sticky-wa');
    if (!waBtn || waBtn.dataset.v2aDone) return;
    waBtn.dataset.v2aDone = '1';
    waBtn.href = buildWaUrl(artisan);
  }

  /* ── 6. Update hero trust card review_count display ──── */
  /*
     V2A: Replace "N avis" framing with "N interventions" — more honest
     and credible when there are no actual written text reviews.
  */
  function upgradeReviewLine(artisan) {
    var subEl = document.querySelector('.public-trust-sub');
    if (!subEl || subEl.dataset.v2aUpgraded) return;
    subEl.dataset.v2aUpgraded = '1';

    var count    = parseInt(artisan.review_count || 0, 10);
    var missions = parseInt(artisan.completed_missions || 0, 10);
    var display  = count > 0 ? count : missions;
    if (display <= 0) {
      /* No history: show clean empty state */
      subEl.textContent = 'Disponible pour ses premi\u00e8res interventions';
      return;
    }
    subEl.textContent = display + '\u00a0intervention' + (display > 1 ? 's' : '') + ' enregistr\u00e9e' + (display > 1 ? 's' : '');
  }

  /* ── 6b. Upgrade the star-rating line (.public-trust-rating) ── */
  /*
     P1 fix: upgradeReviewLine() only patched .public-trust-sub.
     .public-trust-rating (the top line inside .public-trust-card) was missed.
     renderProfile() sets it to "\u2b50 Aucun avis pour le moment" when
     stats.average_rating === null — which is always the case for Supabase
     artisans loaded from localStorage (no mission-based rating computed).

     This function replaces that line with real Supabase artisan.rating.
     Logic:
       - rating >= 4.1 (platform minimum)  \u2192 show "\u2b50 X.X / 5"
       - rating = 0 or absent              \u2192 hide the element entirely
     "Aucun avis" is never shown when real rating data exists.
  */
  function upgradeRatingLine(hero, artisan) {
    var ratingEl = hero.querySelector('.public-trust-rating');
    if (!ratingEl || ratingEl.dataset.v2aRatingDone) return;
    ratingEl.dataset.v2aRatingDone = '1';

    var rating = parseFloat(artisan.rating || 0);
    if (rating >= 4.1) {
      /* Real platform rating — show it */
      ratingEl.textContent = '\u2b50 ' + rating.toFixed(1) + ' / 5';
    } else {
      /* No usable rating — hide the line completely */
      ratingEl.style.display = 'none';
    }
  }

  /* ════════════════════════════════════════════════════════
     V2-C — UNIFIED PREMIUM AVATAR SYSTEM
     ════════════════════════════════════════════════════════ */

  /* Category slug normalizer — matches T3 CSS selectors */
  var CAT_SLUG_MAP = {
    'plomberie':     'plomberie',
    'electricite':   'electricite',
    '\u00e9lectricit\u00e9': 'electricite',
    'peinture':      'peinture',
    'nettoyage':     'nettoyage',
    'jardinage':     'jardinage',
    'climatisation': 'climatisation',
    'ma\u00e7onnerie':   'maconnerie',
    'maconnerie':    'maconnerie',
    'menuiserie':    'menuiserie',
    'serrurerie':    'serrurerie',
    'carrelage':     'carrelage',
    'd\u00e9m\u00e9nagement': 'demenagement',
    'demenagement':  'demenagement',
    'bricolage':     'bricolage',
    'toiture':       'toiture',
    'vitrerie':      'vitrerie',
    '\u00e9tancheite':  'etancheite',
    'etancheite':    'etancheite',
    'soudure':       'soudure',
    'informatique':  'informatique'
  };

  var CAT_ICONS_V2C = {
    plomberie: '\ud83d\udd27',     electricite: '\u26a1',
    peinture: '\ud83c\udfa8',      nettoyage: '\ud83e\uddf9',
    jardinage: '\ud83c\udf3f',     demenagement: '\ud83d\udce6',
    bricolage: '\ud83d\udd28',     climatisation: '\u2744\ufe0f',
    menuiserie: '\ud83e\ude9a',    maconnerie: '\ud83e\uddf1',
    serrurerie: '\ud83d\udd11',    carrelage: '\ud83c\udfe0',
    etancheite: '\ud83d\udee1',    vitrerie: '\ud83e\ude9f',
    soudure: '\ud83d\udd25',       informatique: '\ud83d\udcbb',
    toiture: '\ud83c\udfe0',       chauffage: '\ud83d\udd25'
  };

  function _catSlug(category) {
    if (!category) return '';
    var key = (category || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return CAT_SLUG_MAP[key] || CAT_SLUG_MAP[category.toLowerCase().trim()] || '';
  }

  /* ── V2C: Upgrade profile avatar (initials → silhouette) ── */
  /*
     Replaces the "AB"-style fallback avatar with the same silhouette
     system used on homepage artisan cards (pvc-avatar-silhouette).
     Does NOT modify real photo avatars (<img> fallback path untouched).
     Category gradient + glow make the avatar feel ecosystem-native.
  */
  function upgradeProfileAvatar(hero, artisan) {
    var wrap     = hero.querySelector('.public-avatar-wrap');
    var fallback = hero.querySelector('.public-avatar-fallback');
    if (!fallback || !wrap) return; /* real photo path — noop */
    if (fallback.dataset.v2cDone) return;
    fallback.dataset.v2cDone = '1';

    var slug     = _catSlug(artisan.category);
    var catIcon  = (slug && CAT_ICONS_V2C[slug]) || '\ud83d\udd27';

    /* 1. Apply category slug for CSS gradient targeting */
    if (slug) fallback.setAttribute('data-category', slug);

    /* 2. Swap class to trigger silhouette CSS system */
    fallback.classList.add('fpv2c-silhouette-host');
    /* Kill residual initials text — use textContent='', keep DOM clean */
    fallback.textContent = '';

    /* 3. Inject silhouette span */
    var sil = document.createElement('span');
    sil.className = 'fpv2c-silhouette';
    fallback.appendChild(sil);

    /* 4. Mark wrap for badge positioning context */
    wrap.classList.add('fpv2c-active');

    /* 5. Inject category badge (bottom-right of wrap) */
    if (!wrap.querySelector('.fpv2c-badge')) {
      var badge = document.createElement('span');
      badge.className = 'fpv2c-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = catIcon;
      wrap.appendChild(badge);
    }
  }

  /* ════════════════════════════════════════════════════════
     V2-B — PROFESSIONAL DEPTH
     ════════════════════════════════════════════════════════ */

  /* Keyword-based skill reordering:
     Match CAT_SKILLS entries against description to surface the most relevant first.
     No NLP: simple substring check on lowercase tokens. */
  var CAT_SKILLS_V2B = {
    'Plomberie':     ['Fuite & dépannage','Chauffe-eau','Travaux sanitaires','Robinetterie','Débouchage'],
    'Électricité':   ['Tableau électrique','Prises & éclairage','Câblage','Dépannage électrique','Mise aux normes'],
    'Peinture':      ['Peinture intérieure','Enduit & finition','Ravalement','Décoration','Imperméabilisation'],
    'Nettoyage':     ['Nettoyage professionnel','Après chantier','Désinfection','Vitrerie','Entretien locaux'],
    'Jardinage':     ['Entretien & taille','Aménagement extérieur','Élagage','Tonte','Arrosage automatique'],
    'Déménagement':  ['Emballage & transport','Montage meubles','Manutention','Stockage','Déménagement local'],
    'Bricolage':     ['Petites réparations','Montage meubles','Perçage & fixation','Parquet','Pose carrelage'],
    'Climatisation': ['Installation climatiseur','Maintenance & entretien','Diagnostic & recharge','Ventilation','Pompe à chaleur'],
    'Menuiserie':    ['Menuiserie bois','Portes & fenêtres','Dressing & rangements','Escaliers','Parquet'],
    'Maçonnerie':    ['Reprises & cloisons','Enduit & plâtre','Gros œuvre','Rénovation','Isolation'],
    'Serrurerie':    ['Ouverture urgence','Blindage & sécurité','Serrure multipoints','Cylindre','Portail'],
    'Carrelage':     ['Pose carrelage','Faïence salle de bain','Reprise joints','Sol & mural','Ragréage'],
    'Étanchéité':    ['Traitement toiture','Humidité & infiltrations','Terrasse & balcon','Façade','Sous-sol'],
    'Vitrerie':      ['Remplacement vitre','Double vitrage','Miroirs','Cloisons verre','Sécurité vitrée'],
    'Soudure':       ['Soudure MIG/TIG','Garde-corps','Portails acier','Structures métalliques','Inox'],
    'Informatique':  ['Dépannage PC & Mac','Réseau & Wi-Fi','Installation logiciels','Récupération données','Conseil informatique']
  };

  /* Reorder skills: ones whose keywords appear in the description come first */
  function _reorderSkills(category, description) {
    var skills = CAT_SKILLS_V2B[category] || [];
    if (!skills.length) return [];
    if (!description) return skills.slice(0, 3);

    var descLow = description.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    function _score(skill) {
      var tokens = skill.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[&()]/g, ' ').split(/\s+/);
      var hits = 0;
      tokens.forEach(function(t) { if (t.length > 3 && descLow.indexOf(t) !== -1) hits++; });
      return hits;
    }

    return skills.slice().sort(function(a, b) { return _score(b) - _score(a); }).slice(0, 3);
  }

  /* ── V2B-1: Local professional identity strip ────────── */
  /*
     Inserted below the .public-hero-meta line in the hero.
     "Intervient à [City] et alentours" — grounded, local, human.
     Only shown when artisan.city is populated.
  */
  function injectZoneStrip(hero, artisan) {
    if (hero.querySelector('.fpv2b-zone-strip')) return;
    var city = (artisan.city || '').trim();
    if (!city) return;

    var meta = hero.querySelector('.public-hero-meta');
    if (!meta) return;

    var strip = document.createElement('p');
    strip.className = 'fpv2b-zone-strip';
    strip.innerHTML =
      '<span class="fpv2b-zone-icon">\ud83d\udccd</span>' +
      'Intervient \u00e0 <strong>' + esc(city) + '</strong> et alentours';

    meta.parentNode.insertBefore(strip, meta.nextSibling);
  }

  /* ── V2B-2: Tier-based intervention counter framing ─── */
  /*
     V2-A set "N interventions enregistrées". V2-B adds a trust tier label
     as a secondary line — emotional context without fabricating anything.
     Tiers based on real review_count distribution (10–180):
       10–30:  "Artisan actif sur Fixeo"
       31–80:  "Profil bien établi"
       81–180: "Artisan expérimenté"
     Shown as a styled qualifier below the main count line.
  */
  function injectInterventionTier(artisan) {
    if (document.querySelector('.fpv2b-trust-tier')) return;
    var count = parseInt(artisan.review_count || 0, 10);
    if (count <= 0) return; /* No data → no framing */

    var tier;
    if (count >= 81)      tier = 'Artisan exp\u00e9riment\u00e9 sur Fixeo';
    else if (count >= 31) tier = 'Profil bien \u00e9tabli';
    else                  tier = 'Artisan actif sur Fixeo';

    var subEl = document.querySelector('.public-trust-sub');
    if (!subEl) return;

    var tierEl = document.createElement('span');
    tierEl.className = 'fpv2b-trust-tier';
    tierEl.textContent = tier;
    subEl.parentNode.insertBefore(tierEl, subEl.nextSibling);
  }

  /* ── V2B-3: Rating context signal ────────────────────── */
  /*
     Only when rating >= 4.7 (genuinely high — roughly top 30% of platform).
     Adds a small "Parmi les meilleurs artisans Fixeo" qualifier line.
     NOT a badge. NOT a rank. Just human recognition of real data.
  */
  function injectRatingContext(hero, artisan) {
    if (hero.querySelector('.fpv2b-rating-context')) return;
    var rating = parseFloat(artisan.rating || 0);
    if (rating < 4.7) return; /* Only genuinely high ratings */

    var ratingEl = hero.querySelector('.public-trust-rating');
    if (!ratingEl) return;

    var ctx = document.createElement('span');
    ctx.className = 'fpv2b-rating-context';
    ctx.textContent = 'Parmi les meilleurs artisans Fixeo';
    ratingEl.parentNode.insertBefore(ctx, ratingEl.nextSibling);
  }

  /* ── V2B-4: Specialty chips in bio section ───────────── */
  /*
     Injected INTO #fpv2a-bio after the description text.
     3 chips from CAT_SKILLS_V2B, reordered to match description keywords.
     Only when #fpv2a-bio exists (was created by V2-A injectBio).
  */
  function injectSpecialtyChips(artisan) {
    var bioSection = document.getElementById('fpv2a-bio');
    if (!bioSection || bioSection.querySelector('.fpv2b-specialty-chips')) return;

    var cat   = (artisan.category || '').trim();
    var desc  = (artisan.description || '').trim();
    var chips = _reorderSkills(cat, desc);
    if (!chips.length) return;

    var wrap = document.createElement('div');
    wrap.className = 'fpv2b-specialty-chips';
    wrap.innerHTML = chips.map(function(c) {
      return '<span class="fpv2b-chip">' + esc(c) + '</span>';
    }).join('');

    bioSection.appendChild(wrap);
  }

  /* ── V2B-5: Realizations elegant empty-state ─────────── */
  /*
     Future-ready section. Honest: no fake content, no emoji placeholders.
     Shows an intentional "coming soon" state that feels curated.
     Only injected when no real portfolio data exists (default: always).
     Rendered AFTER #fpv2a-bio if it exists, otherwise after ppui-services.
  */
  function injectRealizationsShell() {
    if (document.getElementById('fpv2b-realizations')) return;
    /* Only inject if old emoji portfolio was fully removed (it was in V2-A) */
    if (document.getElementById('ppui-portfolio')) return;

    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var section = document.createElement('section');
    section.id = 'fpv2b-realizations';
    section.className = 'ppui-section fpv2b-realizations-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">R\u00e9alisations</p>' +
      '<h2 class="ppui-section-title">Exemples de travaux</h2>' +
      '<div class="fpv2b-realizations-empty">' +
        '<div class="fpv2b-realizations-icon">\ud83d\udcf7</div>' +
        '<p class="fpv2b-realizations-msg">Ce profil sera enrichi de photos de r\u00e9alisations apr\u00e8s les premi\u00e8res interventions.</p>' +
        '<p class="fpv2b-realizations-hint">Les artisans Fixeo partagent leurs travaux pour illustrer leur expertise.</p>' +
      '</div>';

    /* Insert after #fpv2a-bio, or after #ppui-services, or before .public-section-grid */
    var bio      = document.getElementById('fpv2a-bio');
    var services = document.getElementById('ppui-services');
    var grid     = root.querySelector('.public-section-grid');

    var anchor = bio || services;
    if (anchor && anchor.nextSibling) {
      root.insertBefore(section, anchor.nextSibling);
    } else if (grid) {
      root.insertBefore(section, grid);
    } else {
      root.appendChild(section);
    }
  }

  /* ── V2B-6: WhatsApp CTA copy upgrade ────────────────── */
  /*
     V2-A: "Poser une question via WhatsApp"
     V2-B: "Vous avez une question ? Fixeo vous répond."
     + sub-line: "Réponse Fixeo sous 30 min en moyenne"
     More conversational. Operational. Reassuring.
     The sub-line is a Fixeo platform promise, not artisan-specific — always true.
  */
  function upgradeWACopy() {
    var waBtn  = document.getElementById('fpv2a-wa-cta');
    var waText = waBtn && waBtn.querySelector('.fpv2a-wa-text');
    if (!waText || waText.dataset.v2bDone) return;
    waText.dataset.v2bDone = '1';
    waText.textContent = 'Vous avez une question\u00a0? Fixeo vous r\u00e9pond.';

    /* Inject sub-line if not already present */
    if (!document.querySelector('.fpv2b-wa-sub')) {
      var sub = document.createElement('p');
      sub.className = 'fpv2b-wa-sub';
      sub.textContent = 'R\u00e9ponse Fixeo sous 30\u00a0min en moyenne';
      waBtn.parentNode.insertBefore(sub, waBtn.nextSibling);
    }
  }

  /* ── MAIN: fetch + apply ─────────────────────────────── */
  async function enhance() {
    /* Only run on artisan-profile.html */
    var page = window.location.pathname.split('/').pop() || '';
    if (page && page !== 'artisan-profile.html') return;

    var artisanId = getArtisanId();
    if (!artisanId) return;

    /* Fetch from Supabase */
    var artisan = null;
    try {
      if (!window.FixeoSupabaseClient || !window.FixeoSupabaseClient.CONFIGURED) {
        return; /* offline / not configured — graceful noop */
      }
      await window.FixeoSupabaseClient.ready();
      var client = window.FixeoSupabaseClient.client;
      if (!client) return;

      var result = await client
        .from('artisans')
        .select('id,name,category,city,description,badge_label,rating,review_count,availability,verified,completed_missions')
        .eq('id', artisanId)
        .single();

      if (result.error || !result.data) {
        /* Artisan not in Supabase (legacy ID / seed) — graceful noop */
        return;
      }
      artisan = result.data;
    } catch (err) {
      /* Network / SDK error — graceful noop */
      return;
    }

    /* Wait for DOM to be rendered by fixeo-public-artisan-profile.js */
    waitForHero(function(hero) {
      if (hero.dataset.v2aDone) return;
      hero.dataset.v2aDone = '1';

      /* ── V2-C: Avatar (runs first — establishes visual identity) ── */
      upgradeProfileAvatar(hero, artisan);

      /* ── V2-A ── */
      injectBadgeLabel(hero, artisan);
      upgradeReviewLine(artisan);
      upgradeRatingLine(hero, artisan);     /* P1: patch .public-trust-rating */
      injectBio(artisan);
      injectHeroTrustStrip(hero, artisan);
      injectWASecondary(hero, artisan);
      upgradeStickyCTA(artisan);

      /* ── V2-B ── (runs after V2-A to build on its output) */
      injectZoneStrip(hero, artisan);
      injectInterventionTier(artisan);
      injectRatingContext(hero, artisan);
      injectSpecialtyChips(artisan);
      injectRealizationsShell();
      upgradeWACopy();

      /* ── P1: Signal V2 completion — triggers CSS to hide V1 artifacts ── */
      /*
         body.fpv2b-loaded is the CSS gate for:
           - .public-section-grid (0% stats panel)
           - .public-empty-copy ("Aucun avis pour le moment")
         Only set AFTER all V2-A + V2-B functions complete successfully.
         If Supabase fetch failed, enhance() returned early — this never runs
         → V1 panel stays visible (degraded but not broken).
      */
      document.body.classList.add('fpv2b-loaded');
    });
  }

  /* ── Start ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { enhance(); });
  } else {
    setTimeout(function() { enhance(); }, 0);
  }

})();
