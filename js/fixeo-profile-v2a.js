/* ================================================================
   FIXEO — Artisan Profile V2-A Enhancement Layer
   Trust Rebuild & Humanization

   Responsibilities:
   1. Fetch REAL artisan data from Supabase (badge_label, description,
      rating, review_count, availability, category, city)
   2. Inject REAL bio from artisan.description (only if non-empty)
   3. Surface badge_label prominently in the hero trust card
   4. Inject "Paiement après intervention" trust strip in hero
   5. Add WhatsApp secondary CTA below the main reservation button
   6. Inject pricing context ("Dès NNN MAD") from market data
   7. Update sticky mobile CTA with real artisan context (prefilled WA msg)

   Architecture:
   - Reads artisan UUID from URL ?id= param
   - Queries Supabase artisans table directly (FixeoSupabaseClient)
   - All enhancements are progressive: if Supabase fails → graceful noop
   - Never modifies: reservation logic, #public-artisan-action, renderProfile
   - Idempotent: window._fxProfileV2aLoaded + data-v2a-done stamps

   Guard: window._fxProfileV2aLoaded
   Namespace: fpv2a-*, #fpv2a-*
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
      subEl.textContent = 'Disponible pour ses premi\u00e8res missions';
      return;
    }
    subEl.textContent = display + '\u00a0intervention' + (display > 1 ? 's' : '') + ' enregistr\u00e9e' + (display > 1 ? 's' : '');
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

      injectBadgeLabel(hero, artisan);
      upgradeReviewLine(artisan);
      injectBio(artisan);
      injectHeroTrustStrip(hero, artisan);
      injectWASecondary(hero, artisan);
      upgradeStickyCTA(artisan);
    });
  }

  /* ── Start ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { enhance(); });
  } else {
    setTimeout(function() { enhance(); }, 0);
  }

})();
