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

  /* V2-C5D: IIFE-level sentinel — runs at SCRIPT PARSE TIME, before DCL,
   * before any async, before getArtisanForProfile() could possibly resolve.
   * renderArtisanProfile() in fixeo-public-artisan-profile.js reads this flag
   * to decide PATH A vs PATH B. Setting it here (vs inside enhance() at DCL)
   * closes the narrow window where a phone's stale-cached JS (missing the
   * enhance()-level sentinel) could allow PATH A to fire and wipe root.innerHTML.
   * Idempotent with the sentinel inside enhance() — both set the same flag. */
  window.__fixeoV2EnhanceStarted = true;

  /* ── P2: Supabase fetch deduplication ────────────────── */
  /*
     fixeo-public-artisan-profile.js calls FixeoSupabaseLoader.getArtisanForProfile()
     (a select * via supabase-loader.js) AND this script fires its own targeted
     SELECT. Both hit the same UUID → two network round-trips, ~400ms of wasted
     budget on every profile load.

     Fix: the first caller stores a Promise on window.__fixeoArtisanFetch[id].
     Any subsequent caller for the same id receives the already-inflight Promise.
     The supabase-js client also has connection-level HTTP/2 muxing, but the
     SDK itself does not deduplicate identical concurrent queries — we must.

     The cache is never cleared (single-page visit; artisan data is stable).
     If either caller's Promise rejects, the other gets the same rejection
     (both already have their own graceful null-returns for that case).
  */
  if (!window.__fixeoArtisanFetch) window.__fixeoArtisanFetch = {};

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

  /* ── 3b. Platform trust chip row ─────────────────────── */
  /*
     V2-C6D: Replace seeded/fake metric prominence with real PLATFORM trust.
     These signals ARE what Fixeo guarantees — they cannot be faked because
     they are structural: every artisan on Fixeo has these platform protections.
     Shown as a compact chip row BELOW the rating line, above the CTA.
     Idempotent: guarded by .fpv2h-platform-trust existence check.
  */
  function injectHeroPlatformTrust(hero, artisan) {
    if (hero.querySelector('.fpv2h-platform-trust')) return;
    var trustCard = hero.querySelector('.public-trust-card');
    if (!trustCard) return;

    var chips = [
      { icon: '\u2705', text: 'Profil enregistr\u00e9 sur Fixeo' },
      { icon: '\ud83d\udcb3', text: 'Paiement apr\u00e8s intervention' },
      { icon: '\ud83d\udccd', text: 'Intervention locale' },
      { icon: '\u2696\ufe0f', text: 'Tarification encadr\u00e9e' }
    ];

    var row = document.createElement('div');
    row.className = 'fpv2h-platform-trust';
    row.innerHTML = chips.map(function(c) {
      return '<span class="fpv2h-ptrust-chip"><span class="fpv2h-ptrust-icon" aria-hidden="true">' +
        c.icon + '</span>' + esc(c.text) + '</span>';
    }).join('');

    /* Insert at bottom of trust card, after all existing trust card content */
    trustCard.appendChild(row);
  }

  /* ── 3c. Hero inline estimation block ────────────────── */
  /*
     V2-C6E: Replace simple chips with modal-style service cards.
     Each card shows: service name + price range + badge on first item.
     Click → card activates (pink border/glow, matching .fixeo-res-slot.active),
             estimation block updates with full trust copy.
     Data source: PROFILE_PRICING (same as injectPrestationsSection, no new requests).
     Idempotent: guarded by #fpv2h-estimation existence check.
     Graceful: no category match → silent noop.

     Visual language:
       Cards  = dark glass, 10px radius, 1.5px border — SAME as .fixeo-res-slot
       Active = pink gradient bg + #E1306C border + glow — SAME as .fixeo-res-slot.active
       Price  = emerald green, bold, on card — visible without clicking
       Badge  = "⚡ Rapide" on first card — SAME badge as reservation.js idx===0 rule

     Layout: 2-column grid at ≥360px, 1-column below 360px (matches modal grid)
  */
  function injectHeroEstimation(hero, artisan) {
    if (document.getElementById('fpv2h-estimation')) return;
    var slug = _catSlug(artisan.category);
    var rows = PROFILE_PRICING[slug];
    if (!rows || !rows.length) return;

    /* Show all services (max 4) as cards — same count as modal */
    var cardRows = rows.slice(0, 4);

    var section = document.createElement('div');
    section.id = 'fpv2h-estimation';
    section.className = 'fpv2h-estimation';

    /* Build cards HTML — mirrors reservation.js card structure */
    var cardsHtml = cardRows.map(function(r, i) {
      var badge = i === 0
        ? '<span class="fpv2h-card-badge">\u26a1 Rapide</span>'
        : '';
      return '<button type="button" class="fpv2h-svc-card" ' +
        'data-from="' + r.from + '" data-to="' + r.to + '" ' +
        'data-idx="' + i + '" aria-pressed="false">' +
        '<span class="fpv2h-card-name">' + esc(r.label) + '</span>' +
        '<span class="fpv2h-card-price">' + r.from + '\u202f\u2013\u202f' + r.to + '\u00a0MAD</span>' +
        badge +
      '</button>';
    }).join('');

    section.innerHTML =
      '<div class="fpv2h-est-header">' +
        '<span class="fpv2h-est-title">Estimation Fixeo</span>' +
        '<span class="fpv2h-est-hint" id="fpv2h-est-hint">S\u00e9lectionnez un service</span>' +
      '</div>' +
      '<div class="fpv2h-svc-grid" role="group" aria-label="Services propos\u00e9s">' +
        cardsHtml +
      '</div>' +
      /* Estimation reveal — hidden until first selection */
      '<div class="fpv2h-est-result" id="fpv2h-est-result" aria-live="polite">' +
        '<div class="fpv2h-est-amount">' +
          '<span class="fpv2h-est-label">Fourchette estim\u00e9e\u00a0:</span>' +
          '<span class="fpv2h-est-range" id="fpv2h-est-range"></span>' +
          '<span class="fpv2h-est-unit">MAD — estimation indicative</span>' +
        '</div>' +
        '<p class="fpv2h-est-sub">Prix indicatif bas\u00e9 sur des interventions similaires dans votre ville.</p>' +
        '<p class="fpv2h-est-sub">Le prix final est confirm\u00e9 avec l\u2019artisan avant toute intervention.</p>' +
        '<p class="fpv2h-est-sub fpv2h-est-pay">\ud83d\udcb3 Aucun paiement maintenant.</p>' +
      '</div>';

    /* Card click interaction */
    section.addEventListener('click', function(e) {
      var card = e.target.closest('.fpv2h-svc-card');
      if (!card) return;
      /* Deactivate all */
      section.querySelectorAll('.fpv2h-svc-card').forEach(function(c) {
        c.classList.remove('fpv2h-svc-card--active');
        c.setAttribute('aria-pressed', 'false');
      });
      /* Activate clicked */
      card.classList.add('fpv2h-svc-card--active');
      card.setAttribute('aria-pressed', 'true');
      /* Update estimation */
      var from = card.getAttribute('data-from');
      var to   = card.getAttribute('data-to');
      var rangeEl  = document.getElementById('fpv2h-est-range');
      var resultEl = document.getElementById('fpv2h-est-result');
      var hintEl   = document.getElementById('fpv2h-est-hint');
      if (rangeEl)  rangeEl.textContent = from + '\u202f\u2013\u202f' + to + '\u202f';
      if (resultEl) resultEl.classList.add('fpv2h-est-result--visible');
      if (hintEl)   hintEl.textContent = 'Prix indicatif';
    });

    /* Inject below the WA CTA (or trust strip), inside hero-main */
    var heroMain = hero.querySelector('.public-hero-main');
    if (!heroMain) return;
    var waCta      = hero.querySelector('#fpv2a-wa-cta');
    var trustStrip = hero.querySelector('.fpv2a-trust-strip');
    var anchor = waCta || trustStrip;
    if (anchor && anchor.parentNode === heroMain) {
      heroMain.insertBefore(section, anchor.nextSibling);
    } else {
      heroMain.appendChild(section);
    }
  }

  /* ── 3d. Transparent performance indicators ─────────────
     V2-C6F: Compact block showing honest artisan indicators.
     All values derived from REAL data only — no fabrication.
     Empty / unearned indicators shown with honest empty state.
     Placement: inside hero-main, after estimation block.
     Idempotent: guarded by #fpv2pi-block existence check.
  */
  function injectPerformanceIndicators(artisanId, artisan) {
    if (document.getElementById('fpv2pi-block')) return;
    var heroMain = document.querySelector('.public-profile-hero .public-hero-main');
    if (!heroMain) return;

    /* ── Gather real values ── */

    /* 1. Missions validées: read from FixeoClientRequestsStore via _v1jGetValidated */
    var validated = [];
    try { validated = _v1jGetValidated(artisanId); } catch(e) {}
    var missionsCount = validated.length;

    /* 2. hts-1: Avis indicator removed — replaced with Délai de réponse (no seeded count) */

    /* 3. Réalisations publiées: real portfolio count from localStorage */
    var portfolioCount = 0;
    try {
      var pf = JSON.parse(localStorage.getItem('fixeo_portfolio') || '[]');
      if (Array.isArray(pf)) portfolioCount = pf.length;
    } catch(e) {}

    /* ── Build indicator definitions ── */
    var indicators = [
      {
        icon: '\u2714',
        label: 'Missions valid\u00e9es',
        value: missionsCount > 0 ? String(missionsCount) : '0',
        sub: missionsCount > 0 ? 'via Fixeo' : 'Aucune encore',
        active: missionsCount > 0
      },
      {
        /* hts-1: Replace seeded "Avis enregistrés" with honest "Délai de réponse" indicator */
        icon: '\u23f1',
        label: 'D\u00e9lai de r\u00e9ponse',
        value: 'En cours',
        sub: 'En cours de mesure',
        active: false
      },
      {
        icon: '\ud83d\uddbc',
        label: 'R\u00e9alisations',
        value: portfolioCount > 0 ? String(portfolioCount) : '0',
        sub: portfolioCount > 0 ? 'publi\u00e9es' : 'Aucune encore',
        active: portfolioCount > 0
      },
      {
        icon: '\ud83d\udcb3',
        label: 'Paiement apr\u00e8s',
        value: 'Actif',
        sub: 'Garanti Fixeo',
        active: true
      },
      {
        icon: '\u2696\ufe0f',
        label: 'Tarification',
        value: 'Encadr\u00e9e',
        sub: 'Fixeo garantit',
        active: true
      },
      {
        icon: '\u23f1',
        label: 'D\u00e9lai r\u00e9ponse',
        value: '\u2014',
        sub: 'En cours de mesure',
        active: false
      }
    ];

    var cardsHtml = indicators.map(function(ind) {
      return '<div class="fpv2pi-card' + (ind.active ? ' fpv2pi-card--active' : '') + '">' +
        '<span class="fpv2pi-icon" aria-hidden="true">' + ind.icon + '</span>' +
        '<span class="fpv2pi-value">' + esc(ind.value) + '</span>' +
        '<span class="fpv2pi-label">' + esc(ind.label) + '</span>' +
        '<span class="fpv2pi-sub">' + esc(ind.sub) + '</span>' +
      '</div>';
    }).join('');

    var block = document.createElement('div');
    block.id = 'fpv2pi-block';
    block.className = 'fpv2pi-block';
    block.innerHTML =
      '<div class="fpv2pi-header">' +
        '<span class="fpv2pi-title">Indicateurs de performance</span>' +
      '</div>' +
      '<div class="fpv2pi-grid">' + cardsHtml + '</div>' +
      '<p class="fpv2pi-footer">Ces indicateurs \u00e9voluent avec les interventions r\u00e9alis\u00e9es via Fixeo.</p>';

    /* Inject after #fpv2h-estimation if present, else append to hero-main */
    var est = document.getElementById('fpv2h-estimation');
    if (est && est.parentNode === heroMain) {
      heroMain.insertBefore(block, est.nextSibling);
    } else {
      heroMain.appendChild(block);
    }
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
  /* ─── TRUST CLEANUP V1-TC ─────────────────────────────────────────────
   *
   *  The intervention count in .public-trust-sub was using completed_missions
   *  (Supabase field, admin-populated, unverified) as a fallback display value.
   *  This produces numbers like "179 interventions enregistrées" for master
   *  artisans whose Supabase profile was bulk-imported without any real mission
   *  history in fixeo_client_requests.
   *
   *  The contradiction: a client sees "179 interventions" + "0 avis" + no reviews
   *  + empty portfolio. The number is immediately unbelievable.
   *
   *  NEW RULE (V1-TC):
   *  Only show an intervention count when both conditions met:
   *    1. review_count >= 10  (real reviews indicate real operational history)
   *    OR completed_missions from Supabase is paired with review_count >= 5
   *       (admin-certified master artisans with a floor of real reviews)
   *    2. count is not zero
   *
   *  This threshold is conservative: it will suppress counts for ~80% of
   *  master artisans. That is the correct behaviour. A count without matching
   *  review depth is a fabrication.
   *
   *  For V1-H Phase 2 operational memory: injectOperationalMemory() replaces
   *  this sub-line with real data when ≥3 validated missions exist in
   *  fixeo_client_requests. That function runs AFTER upgradeReviewLine().
   *  If operational memory fires, it overwrites whatever this function wrote —
   *  which is the correct priority order.
   * ─────────────────────────────────────────────────────────────────────── */
  function upgradeReviewLine(artisan) {
    var subEl = document.querySelector('.public-trust-sub');
    if (!subEl || subEl.dataset.v2aUpgraded) return;
    subEl.dataset.v2aUpgraded = '1';

    /* hts-1: All review_count and completed_missions are seeded/imported data.
       Never display a count from seeded data. Always use the honest operational framing. */
    subEl.textContent = 'Disponible pour de nouvelles interventions';
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
  /* ─── TRUST CLEANUP V1-TC ─────────────────────────────────────────────
   *  Stars + numeric rating are only shown when the rating is BACKED by
   *  real review depth OR a verified qualification score.
   *
   *  NEW RULE: show "⭐ N.N / 5" only when:
   *    (rating >= 4.1 AND review_count >= 10)
   *    OR score_qualification >= 70
   *
   *  Without review depth, "⭐ 4.9 / 5" on a profile with 0 reviews and
   *  no visible missions is the single most damaging element on the page.
   *  It creates an immediate contradiction the client cannot reconcile.
   *  Silence is better than a starred lie.
   * ─────────────────────────────────────────────────────────────────────── */
  function upgradeRatingLine(hero, artisan) {
    var ratingEl = hero.querySelector('.public-trust-rating');
    if (!ratingEl || ratingEl.dataset.v2aRatingDone) return;
    ratingEl.dataset.v2aRatingDone = '1';
    /* hts-1: rating is seeded/imported data — never display it as verified signal.
       The .public-trust-rating already shows "Profil enregistré sur Fixeo" from
       renderProfile() honest base. Leave it unchanged. */
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
    serrurerie: '\ud83d\udd11',    carrelage: '\ud83d\udd32',  /* 🔲 tile frame — was 🏠 */
    etancheite: '\ud83d\udee1',    vitrerie: '\ud83e\ude9f',
    soudure: '\ud83d\udd25',       informatique: '\ud83d\udcbb',
    toiture: '\ud83c\udfd7',       chauffage: '\ud83c\udf21'   /* 🏗️ / 🌡️ — were duplicate 🏠/🔥 */
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
  /* ─── TRUST CLEANUP V1-TC ─────────────────────────────────────────────
   *  Tier labels must be earned, not assigned by default.
   *
   *  PREVIOUS BEHAVIOUR: any artisan with review_count > 0 got a tier label.
   *  This meant an artisan with review_count = 1 got "Artisan actif sur Fixeo"
   *  which contradicts "Disponible pour ses premières interventions" below it.
   *
   *  NEW RULES (V1-TC):
   *  Tier shown ONLY when:
   *    - review_count >= 10 (real review depth) → "Artisan confirmé Fixeo"
   *    - review_count >= 31 → "Profil bien établi"
   *    - review_count >= 81 → "Artisan expérimenté sur Fixeo"
   *    - score_qualification >= 70 (admin-qualified, no review req) → "Artisan sélectionné Fixeo"
   *
   *  For artisans below all thresholds: NO tier label. The absence is honest.
   *  "Disponible pour de nouvelles interventions" already sets the correct tone.
   * ─────────────────────────────────────────────────────────────────────── */
  function injectInterventionTier(artisan) {
    /* hts-1: review_count is seeded/imported data. Tier labels derived from it
       are indistinguishable from fabrication. Suppressed entirely.
       Honest alternative already shown: "Disponible pour de nouvelles interventions"
       via upgradeReviewLine(). No additional tier label needed. */
    void artisan;
  }

  /* ── V2B-3: Rating context signal ────────────────────── */
  /*
     Only when rating >= 4.7 (genuinely high — roughly top 30% of platform).
     Adds a small "Parmi les meilleurs artisans Fixeo" qualifier line.
     NOT a badge. NOT a rank. Just human recognition of real data.
  */
  /* ─── TRUST CLEANUP V1-TC ─────────────────────────────────────────────
   *  "Parmi les meilleurs artisans Fixeo" is the strongest trust label
   *  on the platform. It must be earned.
   *
   *  PREVIOUS BEHAVIOUR: shown when rating >= 4.7 (any rating, no review floor).
   *  An artisan with rating = 4.9 and review_count = 0 got this label.
   *
   *  NEW RULE:
   *  Only shown when ALL THREE met:
   *    - rating >= 4.7
   *    - review_count >= 30 (enough reviews to make a 4.7 meaningful)
   *    - OR score_qualification >= 90 (elite admin qualification)
   *
   *  Below those thresholds: NO context line. The absence is correct.
   *  A rating without review depth is indistinguishable from a fabrication.
   *
   *  Note: if both upgradeRatingLine and injectRatingContext are suppressed
   *  for a given artisan, the .public-trust-top area shows only:
   *    - availability badge (always honest)
   *    - tier label if earned (≥10 reviews or sq≥70)
   *    - operational memory line (V1-H, if ≥3 validated missions)
   *    - longevity (V1-H, if ≥2 months)
   *  That is enough. Silence beats synthetic authority.
   * ─────────────────────────────────────────────────────────────────────── */
  function injectRatingContext(hero, artisan) {
    /* hts-1: rating is seeded data — "Parmi les meilleurs" would be fabricated authority.
       Suppressed entirely. Silence beats synthetic ranking. */
    void hero; void artisan;
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
  function injectRealizationsShell(artisan) {
    if (document.getElementById('fpv2b-realizations')) return;
    /* Only inject if old emoji portfolio was fully removed (it was in V2-A) */
    if (document.getElementById('ppui-portfolio')) return;

    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    /* V1-H Phase 1+4: Category-specific empty state (sparse market identity) */
    var cat = (artisan && (artisan.category || artisan.service || artisan.metier)) || '';
    var catNorm = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
    var catEmptyMsg = catNorm
      ? 'Cet artisan enrichira bientôt son profil avec des photos de ses travaux de\u00a0' + catNorm + '.'
      : 'Ce profil sera enrichi de photos de r\u00e9alisations apr\u00e8s les premi\u00e8res interventions.';
    var sectionTitle = catNorm ? 'Travaux de\u00a0' + catNorm : 'Exemples de travaux';

    var section = document.createElement('section');
    section.id = 'fpv2b-realizations';
    section.className = 'ppui-section fpv2b-realizations-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">R\u00e9alisations</p>' +
      '<h2 class="ppui-section-title">' + esc(sectionTitle) + '</h2>' +
      '<div class="fpv2b-realizations-empty">' +
        '<div class="fpv2b-realizations-icon">\ud83d\udcf7</div>' +
        '<p class="fpv2b-realizations-msg">' + esc(catEmptyMsg) + '</p>' +
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
      sub.textContent = 'Fixeo vous r\u00e9pond rapidement'; /* V2-C5A: removed unverifiable SLA "30 min" */
      waBtn.parentNode.insertBefore(sub, waBtn.nextSibling);
    }
  }

  /* ════════════════════════════════════════════════════════
     P-3 — PRESTATIONS & PRIX SECTION
     ════════════════════════════════════════════════════════

     Brings market pricing intelligence from the reservation modal
     directly into the artisan profile — without creating an
     ecommerce catalog, a pricing table, or fixed quotation UX.

     DATA SOURCE: Mirrors SERVICE_MAP + SERVICE_PRICING from
     reservation.js exactly. PROFILE_PRICING is a standalone
     constant — no import, no coupling, no dependency. If
     reservation.js changes its ranges, update this constant too.

     TRUST STRATEGY: All wording uses "fourchette" / "généralement
     constaté" framing. The section footer makes explicit that the
     final price is confirmed at coordination — not guaranteed here.
     Goal: reduce price UNCERTAINTY, not set price EXPECTATIONS.

     CATEGORY COVERAGE: 13 slugs (all SERVICE_MAP keys).
     Each has exactly 4 services (curated for scanning speed).
     Services ordered: most frequent use-case first.

     INJECTION POINT: After #fpv2a-bio (or after #ppui-services
     if no bio), before #fpv2b-realizations.
     This is the correct narrative position: after "who is this
     artisan" and before "what have they done" — pricing belongs
     in the "what do they do" zone.
     ════════════════════════════════════════════════════════ */

  /* ── P3: Pricing data — mirrors reservation.js SERVICE_PRICING ── */
  /*
     Intentionally standalone. Exactly 4 services per category.
     Selected for: highest frequency, clearest user recognition,
     widest range spread (avoids anchoring on extremes).
     All values are identical to reservation.js SERVICE_PRICING.
  */
  var PROFILE_PRICING = {
    plomberie: [
      { label: 'Fuite d\u2019eau \u2014 r\u00e9paration',  from: 150,  to: 300  },
      { label: 'Urgence plomberie',                         from: 200,  to: 400  },
      { label: 'Installation sanitaire',                    from: 250,  to: 600  },
      { label: 'R\u00e9paration chauffe-eau',               from: 200,  to: 500  }
    ],
    electricite: [
      { label: 'Panne \u00e9lectrique',                     from: 150,  to: 350  },
      { label: 'Urgence \u00e9lectrique',                   from: 200,  to: 500  },
      { label: 'Installation \u00e9lectrique',              from: 200,  to: 600  },
      { label: 'Prise ou interrupteur en panne',            from: 100,  to: 200  }
    ],
    climatisation: [
      { label: 'Panne climatiseur',                         from: 200,  to: 500  },
      { label: 'Entretien climatiseur',                     from: 200,  to: 350  },
      { label: 'Installation climatiseur',                  from: 500,  to: 900  },
      { label: 'R\u00e9paration climatiseur',               from: 250,  to: 600  }
    ],
    menuiserie: [
      { label: 'Porte ou fen\u00eatre bloqu\u00e9e',        from: 150,  to: 350  },
      { label: 'R\u00e9paration menuiserie',                from: 200,  to: 500  },
      { label: 'Intervention rapide',                       from: 150,  to: 400  },
      { label: 'Fabrication sur mesure',                    from: 800,  to: 2500 }
    ],
    serrurerie: [
      { label: 'Ouverture de porte',                        from: 150,  to: 300  },
      { label: 'Porte bloqu\u00e9e',                        from: 150,  to: 350  },
      { label: 'Changement serrure',                        from: 200,  to: 450  },
      { label: 'S\u00e9curisation porte',                   from: 300,  to: 700  }
    ],
    nettoyage: [
      { label: 'Nettoyage domicile complet',                from: 250,  to: 600  },
      { label: 'Entretien r\u00e9gulier',                   from: 150,  to: 350  },
      { label: 'Nettoyage apr\u00e8s travaux',              from: 300,  to: 700  },
      { label: 'D\u00e9sinfection',                         from: 300,  to: 600  }
    ],
    jardinage: [
      { label: 'Entretien jardin',                          from: 150,  to: 400  },
      { label: 'Tonte pelouse',                             from: 100,  to: 250  },
      { label: 'Taille haies',                              from: 150,  to: 350  },
      { label: 'Am\u00e9nagement ext\u00e9rieur',           from: 500,  to: 2000 }
    ],
    demenagement: [
      { label: 'D\u00e9m\u00e9nagement complet',            from: 800,  to: 2500 },
      { label: 'Transport mobilier',                        from: 400,  to: 1200 },
      { label: 'Emballage \u0026 protection',               from: 300,  to: 800  },
      { label: 'Montage / d\u00e9montage meubles',          from: 200,  to: 600  }
    ],
    bricolage: [
      { label: 'Petites r\u00e9parations',                  from: 100,  to: 300  },
      { label: 'Montage meubles',                           from: 100,  to: 250  },
      { label: 'Fixations murales',                         from: 80,   to: 200  },
      { label: 'Intervention rapide',                       from: 100,  to: 300  }
    ],
    maconnerie: [
      { label: 'R\u00e9paration mur',                       from: 150,  to: 400  },
      { label: 'Travaux pl\u00e2trerie',                    from: 200,  to: 600  },
      { label: 'Construction petit ouvrage',                from: 500,  to: 2000 },
      { label: 'R\u00e9novation fa\u00e7ade',               from: 800,  to: 3000 }
    ],
    peinture: [
      { label: 'Peinture int\u00e9rieure',                  from: 800,  to: 1500 },
      { label: 'Peinture ext\u00e9rieure',                  from: 1000, to: 3000 },
      { label: 'D\u00e9coration murale',                    from: 500,  to: 1500 },
      { label: 'Ravalement de fa\u00e7ade',                 from: 2000, to: 8000 }
    ],
    carrelage: [
      { label: 'Pose carrelage',                            from: 200,  to: 600  },
      { label: 'R\u00e9paration joints',                    from: 100,  to: 250  },
      { label: 'Carrelage salle de bain',                   from: 500,  to: 1500 },
      { label: 'R\u00e9novation carrelage',                 from: 400,  to: 1200 }
    ],
    toiture: [
      { label: 'Fuite toiture',                             from: 300,  to: 700  },
      { label: 'R\u00e9paration tuiles',                    from: 250,  to: 600  },
      { label: '\u00c9tanch\u00e9it\u00e9 terrasse',        from: 500,  to: 1500 },
      { label: 'Nettoyage toiture',                         from: 300,  to: 700  }
    ]
  };

  /* ── P3: Inject "Prestations & Prix" section ─────────── */
  /*
     Injected AFTER #fpv2a-bio (artisan description section) and
     BEFORE #fpv2b-realizations — the correct narrative position:
       "Who is this artisan" → "What does it cost" → "What have they done"

     Idempotent: guarded by #fpv2b-prestations ID check.
     Category: uses _catSlug() for exact SERVICE_MAP key matching.
     Graceful: no category match → silent noop (no section injected).

     Visual: 4 service rows (label + range) in a premium glass card.
     Each row renders as: [service label] [from–to MAD]
     Footer: explicit "estimation marché" disclaimer + payment reassurance.
     No CTA spam — the profile's existing booking CTA handles conversion.
  */
  function injectPrestationsSection(artisan) {
    if (document.getElementById('fpv2b-prestations')) return;

    var slug = _catSlug(artisan.category);
    var rows = PROFILE_PRICING[slug];
    if (!rows || !rows.length) return; /* unsupported category — noop */

    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    /* V2-C6E: Build service cards matching hero estimation card language.
       Same 2-col card grid, same dark glass style, same badge rule.
       "Prestations & prix" now uses visual language consistent with the hero.
       No interactive selection here — the hero block handles that. This is
       a reference/overview section showing all 4 services + prices at a glance. */
    var cardsHtml = rows.map(function(row, i) {
      var badge = i === 0
        ? '<span class="fpv2p3-card-badge">\u26a1 Rapide</span>'
        : '';
      return '<div class="fpv2p3-card">' +
        '<span class="fpv2p3-card-name">' + esc(row.label) + '</span>' +
        '<span class="fpv2p3-card-price">' + row.from + '\u202f\u2013\u202f' + row.to + '\u00a0MAD</span>' +
        badge +
      '</div>';
    }).join('');

    var section = document.createElement('section');
    section.id = 'fpv2b-prestations';
    section.className = 'ppui-section fpv2p3-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">Tarifs march\u00e9</p>' +
      '<h2 class="ppui-section-title">Prestations \u0026 prix</h2>' +
      '<div class="fpv2p3-card-grid">' + cardsHtml + '</div>' +
      '<p class="fpv2p3-footer">' +
        '<span class="fpv2p3-footer-icon">\ud83d\udcb3</span>' +
        'Fourchette g\u00e9n\u00e9ralement constat\u00e9e sur le march\u00e9 local\u00a0\u2014 ' +
        'le tarif d\u00e9finitif est confirm\u00e9 lors de la coordination avec l\u2019artisan.' +
      '</p>';

    /* Injection order: after #fpv2a-bio → after #ppui-services → before grid → append */
    var bio      = document.getElementById('fpv2a-bio');
    var services = document.getElementById('ppui-services');
    var grid     = root.querySelector('.public-section-grid');
    var realiz   = document.getElementById('fpv2b-realizations');

    /* Prefer: after bio. If no bio: after ppui-services. Never after realizations. */
    var anchor = bio || services;
    if (anchor) {
      /* Insert immediately after anchor, before realizations if present */
      var insertTarget = anchor.nextSibling;
      if (realiz && insertTarget === realiz) {
        root.insertBefore(section, realiz);
      } else {
        root.insertBefore(section, insertTarget);
      }
    } else if (grid) {
      root.insertBefore(section, grid);
    } else {
      root.appendChild(section);
    }
  }

  /* ════════════════════════════════════════════════════════
     V1-H — OPERATIONAL IDENTITY & MARKETPLACE MEMORY
     ════════════════════════════════════════════════════════

     Philosophy: identity emerges from real work, not marketing.
     Every signal below is derived exclusively from real data:
       - fixeo_client_requests (localStorage mission history)
       - artisan.created_at (Supabase longevity)
       - fixeo_avail_off_since (V1-E-A availability tracking)
       - user_job / user_city (profile completeness)

     No counters are fabricated. No signals appear when data is absent.
     All functions are guarded: if data is missing → silent no-op.
     All DOM insertions are append-only, idempotent (data-vhDone guards).
  ════════════════════════════════════════════════════════ */

  /* ── V1-H helper: elapsed human (same logic as artisan-dashboard-p4.js) ── */
  function _v1hElapsed(isoStr) {
    if (!isoStr) return '';
    var ms = Date.now() - (Date.parse(isoStr) || 0);
    if (ms < 0) return '';
    var days = Math.floor(ms / 86400000);
    if (days < 1)  return 'aujourd\u2019hui';
    if (days === 1) return 'hier';
    if (days < 7)  return days + ' jours';
    var weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + '\u00a0semaine' + (weeks > 1 ? 's' : '');
    var months = Math.floor(days / 30);
    if (months < 12) return months + '\u00a0mois';
    var years = Math.floor(months / 12);
    return years + '\u00a0an' + (years > 1 ? 's' : '');
  }

  /* ── V1-H Phase 6: Suppress "Trust Score: N / 100" ──────
   *  This element is rendered by fixeo-public-artisan-profile.js
   *  as "Trust Score : 0 / 100" for all artisans without admin scoring.
   *  It is actively damaging — "0/100" reads as a failing grade.
   *  Suppressed entirely. The trust card already communicates quality
   *  through rating line + tier badge without needing a raw number.
   * ──────────────────────────────────────────────────────────── */
  function suppressTrustScore() {
    var el = document.querySelector('.public-trust-score');
    if (!el || el.dataset.v1hHidden) return;
    el.dataset.v1hHidden = '1';
    el.style.display = 'none';
  }

  /* ── V1-H Phase 2 + 3: Operational memory from real missions ──
   *  Reads fixeo_client_requests to compute:
   *   - validated mission count for this artisan
   *   - most recent validated_at timestamp
   *   - city consistency (all validated missions in same city)
   *  Injects a calm operational strip below the trust badge.
   *  NEVER shows when count = 0 or data is absent.
   *  THRESHOLD: 3 validated missions before count appears.
   * ──────────────────────────────────────────────────────────── */
  function injectOperationalMemory(artisanId) {
    if (!artisanId) return;
    if (document.querySelector('.fpv1h-op-memory')) return;

    /* Requires fixeo-client-requests-store.js to be loaded */
    var store = window.FixeoClientRequestsStore;
    if (!store || typeof store.list !== 'function') return;

    try {
      var allReqs = store.list();
      var artId   = String(artisanId).trim();
      var artName = ((document.querySelector('#public-artisan-root h1, .public-hero-main h1') || {}).textContent || '').trim();

      /* V2-A3: Use FixeoArtisanIdentity alias-based matching when available */
      var hasId = window.FixeoArtisanIdentity
        && typeof window.FixeoArtisanIdentity.requestMatchesArtisan === 'function';
      var artisanRef = { id: artId };
      if (artName) artisanRef.name = artName;
      var sbArt = window._fixeoCurrentArtisan;
      if (sbArt) artisanRef = Object.assign({}, sbArt, { id: artId });

      var validated = allReqs.filter(function(r) {
        if (r.status !== 'valid\u00e9e') return false;
        if (hasId) return window.FixeoArtisanIdentity.requestMatchesArtisan(r, artisanRef);
        /* Legacy fallback */
        return String(r.assigned_artisan_id || '').trim() === artId
          || (artName && String(r.artisan_name || r.assigned_artisan || '').trim().toLowerCase()
                === artName.toLowerCase());
      });

      if (validated.length < 3) return; /* below display threshold */

      /* Most recent validated_at */
      var sortedByDate = validated.slice().sort(function(a, b) {
        return (Date.parse(b.validated_at||b.completed_at||'') || 0)
             - (Date.parse(a.validated_at||a.completed_at||'') || 0);
      });
      var mostRecent = sortedByDate[0];
      var recentTs   = mostRecent.validated_at || mostRecent.completed_at || '';
      var recentEl   = recentTs ? _v1hElapsed(recentTs) : '';

      /* City consistency: are ≥80% of validated missions in the same city? */
      var cityMap = {};
      validated.forEach(function(r) {
        var c = (r.city || r.ville || '').trim().toLowerCase();
        if (c) cityMap[c] = (cityMap[c] || 0) + 1;
      });
      var topCity = Object.keys(cityMap).sort(function(a,b){ return cityMap[b]-cityMap[a]; })[0] || '';
      var topCityCount = topCity ? cityMap[topCity] : 0;
      var isCityConsistent = topCityCount / validated.length >= 0.8;

      /* Build the memory strip */
      var countText = validated.length + '\u00a0intervention'
        + (validated.length > 1 ? 's' : '') + ' confirm\u00e9e'
        + (validated.length > 1 ? 's' : '');
      var recencyText = recentEl ? 'Derni\u00e8re il y a\u00a0' + recentEl : '';
      var cityText = (isCityConsistent && topCity)
        ? 'Actif \u00e0\u00a0' + _normCity(topCity)
        : '';

      var subEl = document.querySelector('.public-trust-sub');
      if (!subEl) return;

      /* Replace the trust sub-line with real operational data */
      if (!subEl.dataset.v1hMemoryDone) {
        subEl.dataset.v1hMemoryDone = '1';
        subEl.innerHTML =
          '<span class="fpv1h-count">\u2713\u00a0' + esc(countText) + '</span>'
          + (recencyText ? '<span class="fpv1h-sep">\u2014</span><span class="fpv1h-recency">' + esc(recencyText) + '</span>' : '')
          + (cityText    ? '<span class="fpv1h-sep">\u2014</span><span class="fpv1h-city">' + esc(cityText) + '</span>' : '');
      }
    } catch(e) {}
  }

  /* Capitalizes a city name from lowercase storage */
  function _normCity(c) {
    return String(c || '').replace(/\b\w/g, function(l){ return l.toUpperCase(); });
  }

  /* ── V1-H Phase 3: Longevity signal ──────────────────────
   *  "Membre Fixeo depuis N mois" — computed from artisan.created_at.
   *  Only shown when age ≥ 2 months (meaningful signal).
   *  Injected as a dim line below the trust tier label.
   * ──────────────────────────────────────────────────────────── */
  function injectLongevity(artisan) {
    if (document.querySelector('.fpv1h-longevity')) return;
    var createdAt = artisan.created_at || '';
    if (!createdAt) return;

    var ms     = Date.now() - (Date.parse(createdAt) || 0);
    var months = Math.floor(ms / (30 * 86400000));
    if (months < 2) return; /* below meaningful threshold */

    var label = months < 12
      ? 'Membre Fixeo depuis\u00a0' + months + '\u00a0mois'
      : months < 24
      ? 'Membre Fixeo depuis\u00a01\u00a0an'
      : 'Membre Fixeo depuis\u00a0' + Math.floor(months / 12) + '\u00a0ans';

    /* Inject below tier label (.fpv2b-trust-tier) or below .public-trust-sub */
    var anchor = document.querySelector('.fpv2b-trust-tier') || document.querySelector('.public-trust-sub');
    if (!anchor) return;

    var span = document.createElement('p');
    span.className = 'fpv1h-longevity';
    span.textContent = label;
    anchor.parentNode.insertBefore(span, anchor.nextSibling);
  }

  /* ── V1-H Phase 3+5: Availability consistency signal ─────
   *  "Disponible régulièrement" when artisan has never toggled off
   *  (fixeo_avail_off_since absent) and account > 14 days.
   *  Displayed as a secondary line in the zone strip area.
   *  Note: reads localStorage — only meaningful when viewing
   *  own profile. On shared devices, this signal may be absent. ─── */
  function injectAvailabilityConsistency() {
    if (document.querySelector('.fpv1h-avail-consistent')) return;
    try {
      var offSince = localStorage.getItem('fixeo_avail_off_since');
      var avail    = localStorage.getItem('fixeo_avail_status') || '';

      /* V2-B2A Patch 8: Server availability fallback.
       * If the artisan's Supabase row says "available" AND there is no local
       * "went offline" record, treat as consistent regardless of fixeo_avail_status.
       * This makes "disponible régulièrement" visible to cross-device visitors
       * even when fixeo_avail_status was never written to their localStorage.
       * Local override still wins: if offSince is set, we skip regardless.
       */
      var sbAvail = window._fixeoCurrentArtisan && window._fixeoCurrentArtisan.availability;
      var isServerAvail = (sbAvail === 'available');

      /* Gate: skip if went offline, OR if no signal from either source */
      if (offSince) return;
      if (!isServerAvail && (!avail || avail === 'off')) return;

      var zoneStrip = document.querySelector('.fpv2b-zone-strip');
      if (!zoneStrip || zoneStrip.dataset.v1hAvailDone) return;
      zoneStrip.dataset.v1hAvailDone = '1';

      var hint = document.createElement('span');
      hint.className = 'fpv1h-avail-consistent';
      hint.textContent = '\u00a0\u2014 disponible r\u00e9guli\u00e8rement';
      zoneStrip.appendChild(hint);
    } catch(e) {}
  }

  /* ── V1-H Phase 5: Zone strip depth upgrade ──────────────
   *  When ≥3 validated missions in the artisan's city:
   *  "Intervient à [City]" → "Artisan actif à [City]"
   *  Reflects operational rootedness, not just stated location.
   * ──────────────────────────────────────────────────────────── */
  function upgradeZoneStripDepth(artisanId) {
    var zoneStrip = document.querySelector('.fpv2b-zone-strip');
    if (!zoneStrip || zoneStrip.dataset.v1hDepthDone) return;
    zoneStrip.dataset.v1hDepthDone = '1';

    if (!artisanId) return;
    var store = window.FixeoClientRequestsStore;
    if (!store || typeof store.list !== 'function') return;

    try {
      var allReqs  = store.list();
      var artId    = String(artisanId).trim();
      var artName  = (document.querySelector('h1') || {}).textContent || '';
      var validated = allReqs.filter(function(r) {
        return r.status === 'valid\u00e9e'
          && (String(r.assigned_artisan_id || '').trim() === artId
              || (artName && String(r.artisan_name || r.assigned_artisan || '').trim()
                    .toLowerCase() === artName.trim().toLowerCase()));
      });
      if (validated.length < 3) return;

      /* Check if all validated are in the profile city */
      var cityStrong = document.querySelector('.fpv2b-zone-strip strong');
      if (!cityStrong) return;
      var profileCity = cityStrong.textContent.trim().toLowerCase();
      var cityCount = validated.filter(function(r) {
        return (r.city || r.ville || '').trim().toLowerCase() === profileCity;
      }).length;
      if (cityCount / validated.length < 0.8) return;

      /* Upgrade: "Intervient à" → "Artisan actif à" */
      var icon = zoneStrip.querySelector('.fpv2b-zone-icon');
      var iconHtml = icon ? icon.outerHTML : '<span class="fpv2b-zone-icon">\ud83d\udccd</span>';
      zoneStrip.innerHTML = iconHtml
        + 'Artisan actif \u00e0\u00a0<strong>' + esc(cityStrong.textContent) + '</strong>';
    } catch(e) {}
  }

  /* ── V1-H Phase 4: Description visual weight ─────────────
   *  The artisan-written description is the strongest identity
   *  signal. Adds a 'fpv2a-bio-section--has-content' class when
   *  description is ≥ 60 chars (a real professional description).
   *  CSS uses this to give the section slightly more visual weight.
   * ──────────────────────────────────────────────────────────── */
  function upgradeDescriptionWeight() {
    var bio = document.getElementById('fpv2a-bio');
    if (!bio || bio.dataset.v1hDescDone) return;
    bio.dataset.v1hDescDone = '1';
    var bioText = bio.querySelector('.fpv2a-bio-text');
    if (!bioText) return;
    var len = (bioText.textContent || '').trim().length;
    if (len >= 60) {
      bio.classList.add('fpv2a-bio-section--rich');
    }
  }

  /* ── V1-H Phase 1: Portfolio photos on public profile ────
   *  If fixeo_portfolio has items AND artisanId matches the
   *  currently logged-in artisan, replace the placeholder with
   *  real photo grid.
   *  Safety: compares URL artisanId with localStorage user_id.
   *  If no match (viewing someone else's profile), no-op.
   * ──────────────────────────────────────────────────────────── */
  function injectPortfolioPhotos(artisanId) {
    var section = document.getElementById('fpv2b-realizations');
    if (!section || section.dataset.v1hPortfolioDone) return;

    /* V2-B1: Local-first read with Supabase fallback.
     * Priority:
     *   1. FixeoPortfolioMirror.fetchForArtisan() — Supabase first, localStorage fallback
     *   2. Direct localStorage (when mirror module not loaded)
     * The own-device gate is REMOVED — portfolio must be visible to all visitors.
     * _renderPortfolioGrid() is idempotent (data-v1hPortfolioDone guard).
     */

    function _renderPortfolioGrid(items) {
      /* Guard: only render once */
      if (section.dataset.v1hPortfolioDone) return;
      if (!Array.isArray(items) || items.length === 0) return;

      section.dataset.v1hPortfolioDone = '1';

      /* Build photo grid — newest first, max 6 items */
      var sorted = items.slice().sort(function(a, b) {
        return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0);
      }).slice(0, 6);

      var gridHtml = '<div class="fpv1h-photo-grid">'
        + sorted.map(function(item) {
            var service = esc(item.service || '');
            var desc    = esc(item.description || '');
            var city    = esc(item.city || '');
            var date    = item.created_at ? _v1hElapsed(item.created_at) : '';
            /* V2-B1: Prefer server URLs over base64 */
            var imgSrc  = item.after_image_url  || item.after_image
                       || item.before_image_url || item.before_image || '';
            return '<div class="fpv1h-photo-item" data-portfolio-id="' + esc(String(item.id || '')) + '">'
              /* Aspect-ratio container prevents layout shift */
              + '<div class="fpv1h-photo-aspect">'
              + (imgSrc
                  ? '<img class="fpv1h-photo-img" src="' + esc(imgSrc) + '" alt="' + service + '" '
                    + 'width="400" height="300" loading="lazy" decoding="async">'
                  : '<div class="fpv1h-photo-placeholder">\ud83d\udcf7</div>')
              + '</div>'
              + '<div class="fpv1h-photo-meta">'
              +   (service ? '<span class="fpv1h-photo-service">' + service + '</span>' : '')
              +   (desc    ? '<span class="fpv1h-photo-desc">' + desc + '</span>' : '')
              +   (city    ? '<span class="fpv1h-photo-city">\ud83d\udccd\u00a0' + city + '</span>' : '')
              +   (date    ? '<span class="fpv1h-photo-date">il y a\u00a0' + date + '</span>' : '')
              + '</div>'
              + '</div>';
          }).join('')
        + '</div>';

      /* Replace placeholder with real grid */
      var empty = section.querySelector('.fpv2b-realizations-empty');
      if (empty) empty.innerHTML = '';
      var h2 = section.querySelector('h2.ppui-section-title');
      if (h2) h2.textContent = 'R\u00e9alisations';
      section.insertAdjacentHTML('beforeend', gridHtml);
    }

    /* FAST PATH: Check localStorage first for instant render */
    try {
      var localAll = JSON.parse(localStorage.getItem('fixeo_portfolio') || '[]');
      /* Match by artisan alias set when identity module available */
      var localItems = [];
      if (Array.isArray(localAll) && localAll.length > 0) {
        var aid = String(artisanId || '').trim();
        var hasId = window.FixeoArtisanIdentity
          && typeof window.FixeoArtisanIdentity.requestMatchesArtisan === 'function';
        var artRef = { id: aid };
        var sbArt  = window._fixeoCurrentArtisan;
        if (sbArt) artRef = Object.assign({}, sbArt, { id: aid });
        var aliases = hasId ? window.FixeoArtisanIdentity.resolveAliases(artRef) : [aid];

        localItems = localAll.filter(function(p) {
          if (!p.artisan_id) return false;
          return aliases.indexOf(String(p.artisan_id)) !== -1;
        });
      }
      /* Render local items immediately (may be from artisan's own device) */
      if (localItems.length > 0) _renderPortfolioGrid(localItems);
    } catch(e) {}

    /* SERVER PATH: Async Supabase fetch for cross-device / public visitor display */
    if (window.FixeoPortfolioMirror
        && typeof window.FixeoPortfolioMirror.fetchForArtisan === 'function') {
      window.FixeoPortfolioMirror.fetchForArtisan(artisanId).then(function(serverItems) {
        if (!Array.isArray(serverItems) || serverItems.length === 0) return;
        /* Re-render with server data (may include items from other devices) */
        section.dataset.v1hPortfolioDone = ''; /* reset guard to allow re-render */
        _renderPortfolioGrid(serverItems);
      }).catch(function(e) {
        /* Silent — local render above is already showing */
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     V1-J — REAL OPERATIONAL PROOF & CLIENT CONFIDENCE
     ════════════════════════════════════════════════════════

     Six functions. All read from fixeo_client_requests only.
     Nothing invented. Nothing polled. Render-once per page load.
     All guarded with data-v1jDone to be idempotent.

     Philosophy: the profile should feel alive through real work,
     not through marketing language. Real timestamps. Real cities.
     Real mission states. Real portfolio context. Nothing else.
  ════════════════════════════════════════════════════════ */

  /* ── V1-J helper: normalise status strings ──────────── */
  function _v1jNormStatus(s) {
    return (s || '').toLowerCase().replace(/[\s_]/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ── V1-J helper: capitalise first letter ────────────── */
  function _v1jCap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* ── V1-J helper: get validated missions for this artisan ──
   * Shared by all V1-J functions. Reads fixeo_client_requests once.
   * Returns [] when store unavailable or artisanId absent.
   * ──────────────────────────────────────────────────────────── */
  function _v1jGetValidated(artisanId) {
    var store = window.FixeoClientRequestsStore;
    if (!store || typeof store.list !== 'function') return [];
    try {
      var all    = store.list();
      var artId  = String(artisanId || '').trim();
      var artName = ((document.querySelector('#public-artisan-root h1, .public-hero-main h1') || {}).textContent || '').trim();

      /* V2-A3: Use FixeoArtisanIdentity for alias-based matching when available.
       * Builds artisan reference from URL id + Supabase data (_fixeoCurrentArtisan)
       * so that records stored with any form of the ID all match.
       */
      var hasId = window.FixeoArtisanIdentity
        && typeof window.FixeoArtisanIdentity.requestMatchesArtisan === 'function';

      var artisanRef = null;
      if (hasId) {
        artisanRef = { id: artId };
        if (artName) artisanRef.name = artName;
        var sbArt = window._fixeoCurrentArtisan;
        if (sbArt) artisanRef = Object.assign({}, sbArt, { id: artId });
      }

      return all.filter(function(r) {
        var st = _v1jNormStatus(r.status);
        if (st !== 'validee') return false;

        /* V2-A3: alias-based match (fixes hassan_benali !== 1042 problem) */
        if (hasId && artisanRef) {
          return window.FixeoArtisanIdentity.requestMatchesArtisan(r, artisanRef);
        }

        /* Legacy fallback (exact ID or exact name) */
        if (artId && String(r.assigned_artisan_id || '').trim() === artId) return true;
        if (artName && String(r.artisan_name || r.assigned_artisan || '').trim()
              .toLowerCase() === artName.toLowerCase()) return true;
        return false;
      });
    } catch(e) { return []; }
  }

  /* ── V1-J Phase 1: Portfolio operational context ─────────
   *  Upgrades portfolio photo cards with operational framing:
   *    - "Réparation fuite cuisine — Casablanca"
   *    - "Travaux de peinture — Fès"
   *  Also adds calm completion badge when item has a city field
   *  or matches a validated mission (by service + city).
   *  Runs after injectPortfolioPhotos() has built the grid.
   *  Target: .fpv1h-photo-item cards already in the DOM.
   *  Idempotent: data-v1jCtx guard per card.
   * ──────────────────────────────────────────────────────────── */
  function upgradePortfolioContext(artisanId, artisan) {
    var grid = document.querySelector('.fpv1h-photo-grid');
    if (!grid || grid.dataset.v1jCtxDone) return;
    grid.dataset.v1jCtxDone = '1';

    var artCity = artisan ? (artisan.city || '') : '';

    /* Build a lookup of validated missions by service for confirmation badge */
    var validated = _v1jGetValidated(artisanId);
    var validatedServices = {};
    validated.forEach(function(r) {
      var svc = (r.service || '').toLowerCase().trim();
      if (svc) validatedServices[svc] = true;
    });

    var cards = grid.querySelectorAll('.fpv1h-photo-item');
    cards.forEach(function(card) {
      if (card.dataset.v1jCtxDone) return;
      card.dataset.v1jCtxDone = '1';

      var meta = card.querySelector('.fpv1h-photo-meta');
      if (!meta) return;

      var serviceEl = card.querySelector('.fpv1h-photo-service');
      var svcText   = serviceEl ? serviceEl.textContent.trim() : '';
      var svcLower  = svcText.toLowerCase();

      /* Operational title: "Réparation fuite cuisine — Casablanca" */
      if (svcText && artCity) {
        var opTitle = document.createElement('span');
        opTitle.className = 'fpv1j-card-op-title';
        opTitle.textContent = svcText + '\u00a0\u2014 ' + artCity;
        meta.insertBefore(opTitle, meta.firstChild);
      }

      /* Completion badge: shown when service matches a validated mission */
      var svcMatches = svcLower && validatedServices[svcLower];
      if (svcMatches || validated.length >= 3) {
        var badge = document.createElement('span');
        badge.className = 'fpv1j-completion-badge';
        badge.textContent = 'Travail confirm\u00e9';
        meta.appendChild(badge);
      }
    });
  }

  /* ── V1-J Phase 2+4: Recent activity + local presence signal ──
   *  "Dernière intervention confirmée il y a 2 semaines — Casablanca"
   *  "Interventions régulières en Plomberie"
   *  Injected into the zone strip area, below fpv2b-zone-strip.
   *  Derived from: validated[].completed_at, city consistency, category.
   *  Threshold: ≥2 validated missions (below = silent).
   *  Idempotent: fpv2b-zone-strip.dataset.v1jActivity guard.
   * ──────────────────────────────────────────────────────────── */
  function injectRecentActivity(artisanId, artisan) {
    var zoneStrip = document.querySelector('.fpv2b-zone-strip');
    if (!zoneStrip || zoneStrip.dataset.v1jActivity) return;
    zoneStrip.dataset.v1jActivity = '1';

    if (!artisanId) return;
    var validated = _v1jGetValidated(artisanId);
    if (validated.length < 2) return;

    /* Most recent validated_at or completed_at */
    var sorted = validated.slice().sort(function(a, b) {
      return (Date.parse(b.validated_at || b.completed_at || '') || 0)
           - (Date.parse(a.validated_at || a.completed_at || '') || 0);
    });
    var mostRecent = sorted[0];
    var recentTs   = mostRecent.validated_at || mostRecent.completed_at || '';
    var elapsed    = recentTs ? _v1hElapsed(recentTs) : '';

    /* City consistency: top city with ≥60% share */
    var cityMap = {};
    validated.forEach(function(r) {
      var c = (r.city || r.ville || '').trim().toLowerCase();
      if (c) cityMap[c] = (cityMap[c] || 0) + 1;
    });
    var topCity = Object.keys(cityMap).sort(function(a,b){ return cityMap[b]-cityMap[a]; })[0] || '';
    var topCount = topCity ? cityMap[topCity] : 0;
    var cityConsistent = topCount / validated.length >= 0.6;

    /* Category continuity: top category with ≥50% share */
    var catMap = {};
    validated.forEach(function(r) {
      var c = (r.service || r.category || '').trim().toLowerCase();
      if (c) catMap[c] = (catMap[c] || 0) + 1;
    });
    var topCat = Object.keys(catMap).sort(function(a,b){ return catMap[b]-catMap[a]; })[0] || '';
    var catConsistent = topCat && catMap[topCat] / validated.length >= 0.5;

    /* Build the activity line */
    var parts = [];
    if (elapsed) {
      parts.push('Derni\u00e8re intervention confirm\u00e9e il y a\u00a0' + elapsed);
    }
    if (cityConsistent && topCity) {
      parts.push('Actif \u00e0\u00a0' + _v1jCap(topCity));
    }
    if (catConsistent && topCat) {
      parts.push('Interventions r\u00e9guli\u00e8res en\u00a0' + _v1jCap(topCat));
    }

    if (parts.length === 0) return;

    var activityEl = document.createElement('p');
    activityEl.className = 'fpv1j-activity-strip';
    activityEl.innerHTML = parts.map(function(p) {
      return '<span class="fpv1j-activity-item">' + esc(p) + '</span>';
    }).join('<span class="fpv1j-activity-sep">\u00b7</span>');

    zoneStrip.parentNode.insertBefore(activityEl, zoneStrip.nextSibling);
  }

  /* ── V1-J Phase 3: Client confirmation signals ───────────
   *  Calm confirmation context in the trust card area.
   *  "N interventions confirmées par des clients"
   *  Shown when ≥3 validated missions exist AND operational memory
   *  hasn't already replaced the trust-sub (i.e., data-v1hMemoryDone absent).
   *  Different from V1-H operational memory — this is calmer, secondary,
   *  shown in a dedicated block below the trust card (not inside it).
   *  Threshold: ≥3 (same as operational memory to stay consistent).
   * ──────────────────────────────────────────────────────────── */
  function injectConfirmationSignal(artisanId) {
    if (document.querySelector('.fpv1j-confirm-signal')) return;

    var validated = _v1jGetValidated(artisanId);
    if (validated.length < 3) return;

    var trustCard = document.querySelector('.public-trust-card');
    if (!trustCard || trustCard.dataset.v1jConfirmDone) return;
    trustCard.dataset.v1jConfirmDone = '1';

    var n = validated.length;
    var label = n + '\u00a0intervention' + (n > 1 ? 's' : '')
      + ' valid\u00e9e' + (n > 1 ? 's' : '') + ' par des clients';

    var signal = document.createElement('p');
    signal.className = 'fpv1j-confirm-signal';
    signal.innerHTML = '<span class="fpv1j-confirm-icon">\u2713</span> ' + esc(label);
    trustCard.parentNode.insertBefore(signal, trustCard.nextSibling);
  }

  /* ── V1-J Phase 4: Local presence depth ──────────────────
   *  Upgrades zone strip copy when strong local consistency:
   *  "Artisan actif à [City] depuis plusieurs interventions"
   *  Adds a sub-note below the zone strip (not inside it).
   *  Distinct from V1-H upgradeZoneStripDepth (which changes the strip text).
   *  This adds a secondary presence note below.
   *  Threshold: ≥5 missions in same city (stronger signal than V1-H's ≥3).
   *  Note: if upgradeZoneStripDepth already ran, this cooperates (both apply).
   * ──────────────────────────────────────────────────────────── */
  function injectLocalPresenceNote(artisanId, artisan) {
    if (document.querySelector('.fpv1j-local-note')) return;
    if (!artisanId) return;

    var validated = _v1jGetValidated(artisanId);
    var artCity   = (artisan ? artisan.city || '' : '').trim().toLowerCase();
    if (!artCity || validated.length < 5) return;

    var cityCount = validated.filter(function(r) {
      return (r.city || r.ville || '').trim().toLowerCase() === artCity;
    }).length;

    /* Require ≥5 missions in the artisan's declared city */
    if (cityCount < 5) return;

    var zoneStrip = document.querySelector('.fpv2b-zone-strip');
    if (!zoneStrip) return;

    var cityDisplay = _v1jCap(artCity);
    var note = document.createElement('p');
    note.className = 'fpv1j-local-note';
    note.textContent = 'Pr\u00e9sence locale confirm\u00e9e \u00e0 ' + cityDisplay
      + '\u00a0(' + cityCount + ' intervention' + (cityCount > 1 ? 's' : '') + ')';

    var activityStrip = document.querySelector('.fpv1j-activity-strip');
    var anchor = activityStrip || zoneStrip;
    anchor.parentNode.insertBefore(note, anchor.nextSibling);
  }

  /* ── V1-J Phase 5: Booking confidence block ──────────────
   *  Injected below the action button (.public-artisan-action).
   *  Three calm reassurance lines:
   *    - Recent activity (if ≥2 validated missions)
   *    - Payment after intervention (always)
   *    - WhatsApp coordination (always)
   *  Short, non-pressuring, factual.
   *  The payment/WA lines are always shown (they're always true).
   *  The activity line only shows when real data backs it.
   *  Idempotent: button.dataset.v1jConfidence guard.
   * ──────────────────────────────────────────────────────────── */
  function injectBookingConfidence(artisanId, artisan) {
    var btn = document.getElementById('public-artisan-action');
    if (!btn || btn.dataset.v1jConfidence) return;
    btn.dataset.v1jConfidence = '1';

    var items = [];

    /* Activity line: real data only */
    var validated = _v1jGetValidated(artisanId);
    if (validated.length >= 2) {
      var sorted = validated.slice().sort(function(a, b) {
        return (Date.parse(b.validated_at || b.completed_at || '') || 0)
             - (Date.parse(a.validated_at || a.completed_at || '') || 0);
      });
      var recentTs = sorted[0].validated_at || sorted[0].completed_at || '';
      var elapsed  = recentTs ? _v1hElapsed(recentTs) : '';
      if (elapsed) {
        items.push('\u231b Derni\u00e8re intervention confirm\u00e9e il y a\u00a0' + elapsed);
      }
    }

    /* Local presence: honest city anchor */
    if (artisan && artisan.city) {
      items.push('\ud83d\udccd Pr\u00e9sent \u00e0 ' + esc(artisan.city));
    }

    /* Always-true operational reassurances */
    items.push('\u2714 Paiement apr\u00e8s intervention');
    items.push('\ud83d\udcac Coordination via WhatsApp Fixeo');

    var block = document.createElement('div');
    block.className = 'fpv1j-booking-confidence';
    block.innerHTML = items.map(function(item) {
      return '<div class="fpv1j-confidence-item">' + item + '</div>';
    }).join('');

    /* Insert below the WA CTA or below the action button */
    var waCta  = document.getElementById('fpv2a-wa-cta');
    var anchor = waCta || btn;
    anchor.parentNode.insertBefore(block, anchor.nextSibling);
  }

  /* ── V1-J Phase 6: Trust surface coherence check ─────────
   *  Scans for residual contradictions and patches them:
   *    - Realizations section still says "Aucune réalisation" despite portfolio items → silently hides
   *    - Zone strip still says "Intervient à" after upgradeZoneStripDepth ran → noop (V1-H handles it)
   *    - "Nouveau artisan" tier while operational memory exists → noop (V1-H handles it)
   *  Main job: ensure the realizations section title matches portfolio state.
   * ──────────────────────────────────────────────────────────── */
  function coherencePatch() {
    /* If portfolio grid was injected by V1-H, update section title appropriately */
    var section = document.getElementById('fpv2b-realizations');
    if (!section) return;
    var grid = section.querySelector('.fpv1h-photo-grid');
    var empty = section.querySelector('.fpv2b-realizations-empty');
    if (grid && empty && empty.innerHTML.trim() !== '') {
      /* V1-H replaced the placeholder but may have left empty div visible */
      try { empty.style.display = 'none'; } catch(e) {}
    }
  }

  /* ── MAIN: fetch + apply ─────────────────────────────── */
  async function enhance() {
    /* V2-C5C/V2-C6A: Sentinel — set SYNCHRONOUSLY before any await.
     * renderArtisanProfile() in fixeo-public-artisan-profile.js checks this flag
     * combined with hero presence to decide whether V2 has render authority.
     * V2-C6A semantics: sentinel blocks PATH A ONLY when .public-profile-hero
     * is already in the DOM (meaning renderProfile() already ran at T+0ms from LS).
     * If hero is absent (renderNotFound() was shown — new visitor, incognito,
     * artisan not in localStorage), PATH A is still allowed to render with server
     * data so that waitForHero() can find a hero and complete the V2 rAF chain.
     * Safe fallback: if enhance() exits early (wrong page, no artisanId, Supabase
     * failure), sentinel is still set but hero-absent guard allows PATH A recovery. */
    window.__fixeoV2EnhanceStarted = true;

    /* Only run on artisan-profile.html */
    var page = window.location.pathname.split('/').pop() || '';
    if (page && page !== 'artisan-profile.html') return;

    var artisanId = getArtisanId();
    if (!artisanId) return;

    /* Fetch from Supabase — deduped via window.__fixeoArtisanFetch ─── */
    /*
       P2: If fixeo-public-artisan-profile.js already fired a Supabase request
       for this UUID (via FixeoSupabaseLoader.getArtisanForProfile), we share
       that same Promise rather than issuing a second network request.
       The shared Promise resolves with our precise field subset when the data
       arrives — no extra round-trip, no extra SDK handshake overhead.

       Race condition safety: both branches store/read the same Promise key.
       If our fetch races with the loader fetch, whichever stores first wins;
       the second caller awaits the in-flight Promise and gets the same result.
    */
    var artisan = null;
    try {
      if (!window.FixeoSupabaseClient || !window.FixeoSupabaseClient.CONFIGURED) {
        return; /* offline / not configured — graceful noop */
      }

      var fetchKey = 'v2a:' + artisanId;
      if (!window.__fixeoArtisanFetch[fetchKey]) {
        window.__fixeoArtisanFetch[fetchKey] = (async function() {
          /* V2-B2A Patch 1: score_qualification column removed (does not exist in this project).
           * Any code that reads artisan.score_qualification receives undefined → || 0 fallback.
           * Patch 2: Two-step Population A + B resolution (mirrors getArtisanForProfile).
           *   Step 1: .eq('legacy_id', artisanId) — numeric IDs like "1042" (Population A)
           *   Step 2: .eq('id', artisanId)         — UUIDs (Population B / Supabase-auth)
           * Both steps use .maybeSingle() — no error when 0 rows (unlike .single()).
           */
          await window.FixeoSupabaseClient.ready();
          var client = window.FixeoSupabaseClient.client;
          if (!client) return null;

          var SELECT = 'id,legacy_id,name,category,city,description,badge_label,rating,' +
                       'review_count,availability,verified,completed_missions,' +
                       'owner_user_id,created_at';

          /* Step 1: Population A — try legacy_id */
          var r1 = await client.from('artisans').select(SELECT)
                               .eq('legacy_id', artisanId).maybeSingle();
          if (!r1.error && r1.data) return r1.data;

          /* Step 2: Population B — try UUID */
          var r2 = await client.from('artisans').select(SELECT)
                               .eq('id', artisanId).maybeSingle();
          if (!r2.error && r2.data) return r2.data;

          /* Not found in either path — graceful noop */
          return null;
        })();
      }

      artisan = await window.__fixeoArtisanFetch[fetchKey];
      if (!artisan) return; /* Not in Supabase (legacy ID / seed) — graceful noop */

      /* V2-B2A Patch 3: Expose complete Supabase artisan data globally.
       * Normalises the raw DB row into a shape consumed by:
       *   - artisan-profile.html findCurrentArtisan() merge → FixeoReservation.open()
       *   - fixeo-profile-premium-ui.js _injectTrustIndicators()
       *   - V2-A3 FixeoArtisanIdentity.resolveAliases()
       *   - V2-B1 FixeoPortfolioMirror.fetchForArtisan()
       *   - injectAvailabilityConsistency() server fallback
       * score_qualification is absent from this Supabase project → default 0.
       * owner_account_id = owner_user_id (DB column alias for V2-A3 identity).
       */
      window._fixeoCurrentArtisan = {
        id:                   artisan.id || '',
        legacy_id:            artisan.legacy_id || '',
        name:                 artisan.name || '',
        category:             artisan.category || '',
        city:                 artisan.city || '',
        description:          artisan.description || '',
        badge_label:          artisan.badge_label || '',
        rating:               parseFloat(artisan.rating) || 0,
        review_count:         parseInt(artisan.review_count || 0, 10),
        availability:         artisan.availability || 'available',
        verified:             !!artisan.verified,
        completed_missions:   parseInt(artisan.completed_missions || 0, 10),
        /* score_qualification column does not exist in this project → always 0 */
        score_qualification:  0,
        /* V2-A3 identity aliases */
        owner_account_id:     artisan.owner_user_id || '',
        _supabase_id:         artisan.id || '',
        /* Convenience aliases for reservation modal */
        photo_url:            artisan.photo_url || artisan.avatar || '',
        avatar:               artisan.photo_url || artisan.avatar || '',
        created_at:           artisan.created_at || '',
      };

      /* V2-A2: Pre-seed localStorage with validated Supabase missions for this artisan.
       * This runs BEFORE waitForHero/rAF so that when the synchronous V1-H/J functions
       * (injectOperationalMemory, _v1jGetValidated) read localStorage they find
       * server-restored data — even on a new device where localStorage is empty.
       *
       * SEQUENCE:
       *   1. Supabase artisan fetch resolves (above)
       *   2. [NOW] FixeoMissionRehydration.getValidatedForArtisan() checks LS
       *      → if sparse: fetches missions from Supabase, merges into LS
       *      → if rich:   returns immediately (cache hit)
       *   3. waitForHero fires → rAF fires → V1-H/J functions run
       *      They read LS and find the pre-seeded data naturally.
       *
       * Failure model: if rehydration throws or times out, the try/catch
       * ensures we fall through to waitForHero normally. V1-H/J render
       * with whatever is in LS (graceful degradation, no blank states).
       */
      try {
        if (window.FixeoMissionRehydration &&
            typeof window.FixeoMissionRehydration.getValidatedForArtisan === 'function') {
          await window.FixeoMissionRehydration.getValidatedForArtisan(artisan.id || artisanId);
        }
      } catch (_v2a2Err) {
        /* Non-critical: log and continue. V1-H/J gracefully render with LS-only data. */
        console.warn('[v2a2] rehydration pre-seed failed:', _v2a2Err && _v2a2Err.message);
      }

    } catch (err) {
      /* Network / SDK error — graceful noop */
      return;
    }

    /* Wait for DOM to be rendered by fixeo-public-artisan-profile.js */
    waitForHero(function(hero) {
      if (hero.dataset.v2aDone) return;
      hero.dataset.v2aDone = '1';

      /* ── P2: Pre-cache DOM references once ─────────────────────────── */
      /*
         Previously each inject* function ran its own querySelector/getElementById.
         That means up to 14 independent DOM scans — each one forces the browser
         to traverse the live tree. Caching here: one scan, shared refs.
         Functions that accept a `hero` arg already benefit; the others use
         module-scope selectors on stable IDs — those are fast hash lookups.
         The main gain here is clarity and eliminating redundant hero lookups.
      */
      var root  = document.getElementById('public-artisan-root');

      /* ── P2: Avatar runs synchronously — before rAF — on purpose ──── */
      /*
         upgradeProfileAvatar() replaces the initials gradient block with the
         category silhouette. It was already the first call. Keeping it
         synchronous means the avatar upgrades as soon as Supabase resolves,
         independently of the rAF timing. The CSS P2-A opacity transition
         makes it appear smooth regardless.
      */
      upgradeProfileAvatar(hero, artisan);

      /* ── P2: Batch all remaining DOM writes into one rAF ─────────── */
      /*
         Without batching: 13 sequential DOM writes each triggering a style
         recalculation and possible layout reflow. The browser interleaves
         script + layout + paint across those 13 calls.

         With rAF: all 13 DOM writes happen in a single animation frame.
         The browser accumulates the mutations and issues one style recalc +
         one layout pass before the next paint. Result: one clean visual
         update instead of 13 progressive micro-jank steps.

         Timing: rAF fires at the next available paint opportunity (~0-16ms
         after Supabase resolves). This is imperceptible to the user and
         eliminates the "sections appearing one by one" experience.

         Reduced-motion: the CSS P2-F guard collapses all transitions to
         opacity:1 immediately — users who prefer reduced motion see the
         full final state in one step, no fade delays.
      */
      requestAnimationFrame(function() {
        /* ── V2-A ── */
        injectBadgeLabel(hero, artisan);
        upgradeReviewLine(artisan);
        upgradeRatingLine(hero, artisan);     /* P1: patch .public-trust-rating */
        injectBio(artisan);
        injectHeroTrustStrip(hero, artisan);
        injectHeroPlatformTrust(hero, artisan);  /* V2-C6D: platform trust chip row */
        injectWASecondary(hero, artisan);
        injectHeroEstimation(hero, artisan);          /* V2-C6D: live estimation in hero */
        injectPerformanceIndicators(artisanId, artisan); /* V2-C6F: transparent indicators */
        upgradeStickyCTA(artisan);

        /* ── V2-B ── (runs after V2-A to build on its output) */
        injectZoneStrip(hero, artisan);
        injectInterventionTier(artisan);
        injectRatingContext(hero, artisan);
        injectSpecialtyChips(artisan);
        injectPrestationsSection(artisan);    /* P3: market pricing intelligence */
        injectRealizationsShell(artisan);     /* V1-H: category-aware shell + real photos */
        injectPortfolioPhotos(artisanId);    /* V1-H: real portfolio photos if available */
        upgradeWACopy();

        /* ── V1-H ── */
        suppressTrustScore();                 /* Phase 6: hide "Trust Score: 0/100" */
        injectOperationalMemory(artisanId);   /* Phase 2: validated missions, recency */
        injectLongevity(artisan);             /* Phase 3: "Membre depuis N mois" */
        injectAvailabilityConsistency();      /* Phase 3+5: "Disponible régulièrement" */
        upgradeZoneStripDepth(artisanId);     /* Phase 5: "Artisan actif à X" */
        upgradeDescriptionWeight();           /* Phase 4: bio more prominent */

        /* ── V1-J ── */
        upgradePortfolioContext(artisanId, artisan);  /* Phase 1: operational portfolio framing */
        injectRecentActivity(artisanId, artisan);     /* Phase 2+4: activity + local presence */
        injectConfirmationSignal(artisanId);          /* Phase 3: "N interventions validées par des clients" */
        injectLocalPresenceNote(artisanId, artisan);  /* Phase 4: local presence note */
        injectBookingConfidence(artisanId, artisan);  /* Phase 5: booking reassurance block */
        coherencePatch();                             /* Phase 6: trust surface coherence */

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

        /* V2-B2A Patch 6: Trust grid re-injection with server data.
         * premium-ui.js built the trust grid at T+1ms before _fixeoCurrentArtisan existed.
         * Now that server data is available, remove the stale grid and dispatch
         * a calm event — premium-ui listens and re-builds with real review_count.
         * Guard: only remove if _fixeoCurrentArtisan is set (i.e. server data available).
         * No removal without server data — local-only fallback stays in place.
         */
        if (window._fixeoCurrentArtisan) {
          var _staleGrid = document.querySelector('.ppui-trust-grid');
          if (_staleGrid) _staleGrid.remove();
          try {
            document.dispatchEvent(new CustomEvent('fixeo:artisan:resolved', {
              bubbles: false,
              detail: { artisan: window._fixeoCurrentArtisan }
            }));
          } catch(e) {}
        }

        /* ── P2: Section fade-in signal ─────────────────────────────── */
        /*
           Adding .fpv2-sections-ready to #public-artisan-root triggers the
           CSS P2-C opacity transitions on all newly injected V2 sections.
           Because this runs at the END of the rAF callback, all DOM nodes
           are already in the tree when the class is added — the browser
           sees the final state + the class in one layout pass, then
           transitions opacity 0→1 on the compositor thread.
           Net result: all V2 sections appear together in one calm fade
           rather than 13 separate pop-ins.
        */
        if (root) root.classList.add('fpv2-sections-ready');

        /* ── V2-C6B: Real-photo gate for avatar-wrap visibility ── */
        /*
         * CSS rule: .public-profile-hero:not(.has-real-avatar) .public-avatar-wrap { display:none }
         * When a real photo is present (.public-avatar-img), hero gets .has-real-avatar
         * so avatar-wrap is shown. Without it (generic fallback), avatar-wrap is hidden.
         * Runs AFTER all V2 inject functions so upgradeProfileAvatar() has already
         * had the chance to swap in a real photo from artisan.photo_url / artisan.avatar.
         */
        var _avatarImg = hero ? hero.querySelector('.public-avatar-img') : null;
        if (_avatarImg && hero) {
          hero.classList.add('has-real-avatar');
        }
      });
    });
  }

  /* ── Start ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { enhance(); });
  } else {
    setTimeout(function() { enhance(); }, 0);
  }

})();
