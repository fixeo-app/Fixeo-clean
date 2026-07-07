/**
 * fixeo-profile-premium-ui.js  v2a
 * ─────────────────────────────────────────────────────────────────────────────
 * Cosmetic DOM upgrade for artisan-profile.html
 * Enriches HTML injected by fixeo-public-artisan-profile.js AFTER render.
 * NEVER modifies: reservation logic, #public-artisan-action, routing, JS fns.
 *
 * V2-A CHANGES (2026-05-10):
 *   - Removed: emoji portfolio placeholders (_injectPortfolio removed)
 *   - Removed: synthetic bio (_injectAbout removed — real bio via v2a.js)
 *   - Removed: unconditional fake badges ("Identité vérifiée", "Profil vérifié Fixeo")
 *   - Removed: "Réponse en moins de 20 min" hardcoded hint
 *   - Removed: "Urgence 24h" unconditional chip from services
 *   - Removed: "Identité vérifiée" + "Réponse rapide" from trust indicators
 *   - Suppressed: trust score bar when score = 0 (hide, not show)
 *   - Kept: badge row (honest signals only), trust bar (score>0 only),
 *           CTA upgrade, services (without fake chips), trust indicators
 *           (honest subset), sticky mobile CTA
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window, document) {
  'use strict';

  var CAT_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'📦', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🔲', /* V2-C5A: was 🏠 */
    etancheite:'🛡', vitrerie:'🪟', soudure:'🔥', informatique:'💻',
    plombier:'🔧', electricien:'⚡', peintre:'🎨'
  };

  var CAT_SKILLS = {
    plomberie:    ['Fuite d\'eau','Débouchage','Installation sanitaire','Chauffe-eau','Robinetterie'],
    electricite:  ['Tableau électrique','Prises & interrupteurs','Éclairage','Dépannage électrique','Câblage'],
    peinture:     ['Peinture intérieure','Enduit de finition','Revêtements muraux','Décoration','Rénovation'],
    nettoyage:    ['Nettoyage professionnel','Vitrerie','Après-travaux','Désinfection','Entretien locaux'],
    jardinage:    ['Tonte & entretien','Taille de haies','Aménagement extérieur','Élagage','Arrosage'],
    demenagement: ['Emballage','Transport','Montage meubles','Manutention','Stockage'],
    bricolage:    ['Montage meubles','Fixation & perçage','Petites réparations','Parquet','Carrelage'],
    climatisation:['Installation split','Entretien & maintenance','Pompe à chaleur','Ventilation','Recharge gaz'],
    menuiserie:   ['Portes & fenêtres','Menuiserie sur mesure','Dressing & rangements','Parquet','Escaliers'],
    maconnerie:   ['Gros œuvre','Cloisons','Enduit & plâtrerie','Rénovation','Isolation'],
    serrurerie:   ['Ouverture urgence','Blindage porte','Serrure multipoints','Interphone','Dépannage'],
    carrelage:    ['Pose carrelage','Faïence salle de bain','Rénovation sol','Joints & imperméabilisation','Ragréage'],
    etancheite:   ['Toiture-terrasse','Traitement humidité','Sous-sol','Balcon & terrasse','Façade'],
    vitrerie:     ['Double vitrage','Remplacement vitres','Cloisons verre','Miroirs','Sécurité vitrée'],
    soudure:      ['Soudure TIG/MIG','Garde-corps','Portails','Acier & inox','Structures métalliques'],
    informatique: ['Dépannage PC','Réseau & Wi-Fi','Installation logiciels','Sauvegarde données','Conseil']
  };

  function _esc(str) {
    return String(str||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ── Parse trust score from existing DOM ── */
  function _parseTrustScore() {
    var scoreEl = document.querySelector('.public-trust-score');
    if (!scoreEl) return 0;
    var match = (scoreEl.textContent || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /* ── Parse artisan data from hero DOM ── */
  function _parseHeroData() {
    var name     = (document.querySelector('.public-hero-main h1') || {}).textContent || '';
    var meta     = (document.querySelector('.public-hero-meta') || {}).textContent || '';
    var avail    = document.querySelector('.public-availability');
    var trust    = _parseTrustScore();
    var ratingEl = document.querySelector('.public-trust-rating');
    var rating   = 0;
    if (ratingEl) { var m = (ratingEl.textContent||'').match(/[\d.]+/); if(m) rating = parseFloat(m[0]); }
    var reviewEl = document.querySelector('.public-trust-sub');
    var reviews  = 0;
    if (reviewEl) { var m2 = (reviewEl.textContent||'').match(/^(\d+)/); if(m2) reviews = parseInt(m2[1],10); }

    var parts = meta.split('•');
    var category = (parts[0]||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
    var city     = (parts[1]||'').trim();
    var isAvail  = avail && avail.classList.contains('is-available');

    return { name: name.trim(), category: category, city: city, trust: trust, rating: rating, reviews: reviews, isAvail: isAvail };
  }

  /* ── Inject badge row — V2A: honest signals only ── */
  function _injectBadges(data) {
    if (document.querySelector('.ppui-badge-row')) return;
    var heroMain = document.querySelector('.public-hero-main');
    if (!heroMain) return;

    var badges = [];

    /* Availability signal — honest (always accurate) */
    if (data.isAvail) {
      badges.push('<span class="ppui-badge ppui-badge--fast">\u26a1 Disponible maintenant</span>');
    }

    /* Review-based credibility — only when real reviews exist */
    if (data.reviews > 0) {
      badges.push('<span class="ppui-badge ppui-badge--verified">\u2714 Artisan actif</span>');
    }

    /* V2A: badge_label is injected by fixeo-profile-v2a.js into data-badge-label attr
     * on the hero element — read it here if available */
    var heroEl = document.querySelector('.public-profile-hero');
    var badgeLabel = heroEl && heroEl.dataset.badgeLabel;
    if (badgeLabel) {
      badges.push('<span class="ppui-badge ppui-badge--fixeo ppui-badge--label">' + _esc(badgeLabel) + '</span>');
    }

    if (!badges.length) return; /* V2A: show nothing rather than fake fallback */

    var row = document.createElement('div');
    row.className = 'ppui-badge-row';
    row.innerHTML = badges.join('');

    /* Insert after h1 */
    var h1 = heroMain.querySelector('h1');
    if (h1 && h1.nextSibling) {
      heroMain.insertBefore(row, h1.nextSibling);
    } else {
      heroMain.insertBefore(row, heroMain.firstChild);
    }
  }

  /* ── Upgrade trust score: add visual bar ONLY when score > 0 ── */
  function _upgradeTrustScore(data) {
    var scoreEl = document.querySelector('.public-trust-score');
    if (!scoreEl) return;

    /* V2A: if score is 0 or very low, hide entirely — showing "0/100" destroys trust */
    if (data.trust <= 0) {
      scoreEl.style.display = 'none';
      return;
    }

    if (scoreEl.querySelector('.ppui-trust-bar-wrap')) return;
    var score = data.trust;
    var barHtml =
      '<div class="ppui-trust-bar-wrap">' +
        '<span class="ppui-trust-bar-label">Indice de confiance</span>' +
        '<div class="ppui-trust-bar-track"><div class="ppui-trust-bar-fill" style="width:'+score+'%"></div></div>' +
        '<span class="ppui-trust-score-val">'+score+' / 100</span>' +
      '</div>';
    scoreEl.style.display = 'none';
    scoreEl.insertAdjacentHTML('afterend', barHtml);
  }

  /* ── Upgrade CTA button label — V2A: no fake urgency hint ── */
  function _upgradeCTA(data) {
    var btn = document.getElementById('public-artisan-action');
    if (!btn || btn.dataset.ppuiUpgraded) return;
    btn.dataset.ppuiUpgraded = '1';
    /* Only improve label — never change onclick/id */
    if (data.isAvail) {
      btn.textContent = 'R\u00e9server l\u2019intervention';
    } else {
      btn.textContent = 'Demander une intervention';
    }
    /* V2A: REMOVED "Réponse en moins de 20 min" — hardcoded fake urgency */
    /* V2A: ADD "Paiement après intervention" reassurance below CTA */
    if (!btn.nextElementSibling || !btn.nextElementSibling.classList.contains('ppui-cta-reassurance')) {
      var reassurance = document.createElement('p');
      reassurance.className = 'ppui-cta-reassurance';
      reassurance.innerHTML = '\u2714\ufe0f Paiement apr\u00e8s intervention &nbsp;&bull;&nbsp; R\u00e9ponse rapide';
      btn.parentNode.insertBefore(reassurance, btn.nextSibling);
    }
  }

  /* ── Inject Services section — V2A: no fake "Urgence 24h" chip ── */
  function _injectServices(data) {
    if (document.getElementById('ppui-services')) return;
    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var skills = CAT_SKILLS[data.category];
    /* V2A: only inject services section if we have real category-level skills */
    if (!skills) return;

    var catIcon = CAT_ICONS[data.category] || '🔧';

    var section = document.createElement('section');
    section.id = 'ppui-services';
    section.className = 'ppui-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">Sp\u00e9cialit\u00e9s</p>'+
      '<h2 class="ppui-section-title">Prestations propos\u00e9es</h2>'+
      '<div class="ppui-services-grid">'+
        skills.map(function(s){ return '<span class="ppui-service-chip">'+catIcon+' '+_esc(s)+'</span>'; }).join('')+
        /* V2A: removed "Devis gratuit" and "Urgence 24h" — not artisan-specific */
      '</div>';

    var grid = root.querySelector('.public-section-grid');
    if (grid) root.insertBefore(section, grid);
    else root.appendChild(section);
  }

  /* ── Inject Trust indicators — V1-JC: threshold-gated, operational panel fallback ── */
  function _injectTrustIndicators(data) {
    if (document.querySelector('.ppui-trust-grid')) return;
    var panels = document.querySelectorAll('.public-panel');
    var statsPanel = panels.length >= 2 ? panels[1] : null;
    if (!statsPanel) return;

    /* V1-JC: Merge with real Supabase data (review_count, score_qualification).
     * window._fixeoCurrentArtisan is set by fixeo-profile-v2a.js after Supabase resolves.
     * Premium-ui.js runs at T+0 before Supabase — we read what's available at call time.
     * _injectTrustIndicators is called from upgrade() synchronously, but premium-ui.js
     * re-fires setTimeout(upgrade, 200) if hero not yet present.
     * By T+200ms, fixeo-profile-v2a.js should have resolved for cached fetches.
     */
    var _sb    = window._fixeoCurrentArtisan || {};
    var _rc    = parseInt(_sb.review_count  || data.reviews || 0, 10);
    var _sq    = parseInt(_sb.score_qualification || 0, 10);
    var _city  = (_sb.city || data.city || '').trim();
    var _avail = _sb.availability || (data.isAvail ? 'available' : '');

    /* V1-TC thresholds (matches fixeo-profile-v2a.js exactly):
     * Qualified = (review_count >= 5) OR (score_qualification >= 70)
     * Below threshold → operational confidence panel (no zeros, no empty analytics)
     */
    var _isQualified = _rc >= 5 || _sq >= 70;

    var grid = document.createElement('div');
    grid.className = 'ppui-trust-grid ppui-trust-grid--v2a';

    /* hts-1: review_count is seeded data — never show "N avis clients" in any path.
       Both qualified and unqualified paths now use the same honest operational panel. */
    if (false && _isQualified) { /* disabled — honest panel always used */ void _rc;
    } else {
      /* ── SPARSE PATH: operational confidence panel (no zeros, no empty analytics) ──
       * Replaces the 0%/0%/0 grid with actionable operational information.
       * Visual density preserved — same card count, same layout rhythm.
       */
      grid.classList.add('ppui-trust-grid--operational');

      var opItems = [
        { icon: '\u2705', label: 'Paiement apr\u00e8s intervention',         sub: 'Vous payez uniquement une fois satisfait' },
        { icon: '\ud83d\udccd', label: 'Artisan local' + (_city ? '\u00a0\u00e0 ' + _city : ''),  sub: 'Disponible dans votre zone' },
        { icon: '\ud83d\udcac', label: 'Coordination via WhatsApp Fixeo',    sub: 'R\u00e9ponse rapide selon disponibilit\u00e9' },
        { icon: '\u26a1',  label: 'Intervention sans avance',                sub: 'R\u00e9glement apr\u00e8s le travail effectu\u00e9' }
      ];

      grid.innerHTML = opItems.map(function(item){
        return '<div class="ppui-trust-item ppui-trust-item--op">'+
          '<span class="ppui-trust-icon">'+item.icon+'</span>'+
          '<div class="ppui-trust-text"><strong>'+_esc(item.label)+'</strong><span>'+_esc(item.sub)+'</span></div>'+
          '</div>';
      }).join('');
    }

    statsPanel.appendChild(grid);
  }

  /* ── Sticky mobile CTA — V2A: dual action (reserve + WhatsApp) ── */
  function _injectStickyCTA(data) {
    if (document.getElementById('ppui-sticky-cta')) return;
    var wrap = document.createElement('div');
    wrap.id = 'ppui-sticky-cta';
    wrap.className = 'ppui-sticky-cta ppui-sticky-cta--v2a';
    /* V2A: dual CTA — primary reserve + secondary WhatsApp relay */
    wrap.innerHTML =
      '<button class="ppui-sticky-cta-btn" type="button" id="ppui-sticky-btn">R\u00e9server l\u2019intervention</button>' +
      '<a class="ppui-sticky-wa-btn" id="ppui-sticky-wa" ' +
        'href="https://wa.me/212660484415?text=Bonjour%20Fixeo%2C%20je%20suis%20int%C3%A9ress%C3%A9%20par%20un%20artisan%20pour%20une%20intervention." ' +
        'target="_blank" rel="noopener noreferrer">' +
        '\ud83d\udcac Contacter' +
      '</a>';
    document.body.appendChild(wrap);

    /* Primary delegates to original reservation button */
    document.getElementById('ppui-sticky-btn').addEventListener('click', function() {
    var wrap = document.getElementById('ppui-sticky-cta');
    if (wrap) wrap.style.display = 'none';

    var orig = document.getElementById('public-artisan-action');
    if (orig) orig.click();
});

    /* Hide when hero CTA is visible */
    if (window.IntersectionObserver) {
      var origBtn = document.getElementById('public-artisan-action');
      if (origBtn) {
        var obs = new IntersectionObserver(function(entries) {
          wrap.style.display = entries[0].isIntersecting ? 'none' : '';
        }, { threshold: 0.1 });
        obs.observe(origBtn);
      }
    }
  }

  /* ── Main upgrade function ── */
  function upgrade() {
    var root = document.querySelector('#public-artisan-root');
    if (!root) return;

    /* Wait for renderProfile to inject content */
    var hero = root.querySelector('.public-profile-hero');
    if (!hero) {
      setTimeout(upgrade, 200);
      return;
    }

    var data = _parseHeroData();

    /* V2A REMOVED: _injectPortfolio (emoji placeholders) */
    /* V2A REMOVED: _injectAbout (synthetic bio) */
    /* V2A: run badge injection AFTER v2a.js may have set data-badge-label */
    setTimeout(function() { _injectBadges(data); }, 150);
    _upgradeTrustScore(data);
    _upgradeCTA(data);
    _injectServices(data);
    _injectTrustIndicators(data);
    _injectStickyCTA(data);
  }

  /* ── Watch for async render (MutationObserver) ── */
  function init() {
    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    upgrade();

    if (window.MutationObserver) {
      var obs = new MutationObserver(function() {
        if (root.querySelector('.public-profile-hero')) {
          obs.disconnect();
          upgrade();
        }
      });
      obs.observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* V2-B2A Patch 6: Trust grid re-injection after server data arrives.
   * fixeo-profile-v2a.js dispatches 'fixeo:artisan:resolved' after:
   *   - Supabase artisan fetch succeeds
   *   - window._fixeoCurrentArtisan is set with real review_count
   *   - old stale trust grid (built from null data at T+1ms) is removed
   * We then re-run _injectTrustIndicators() with fresh DOM-scraped data.
   * _parseHeroData() re-reads .public-trust-sub which upgradeReviewLine()
   * has already patched with real review_count → thresholds fire correctly.
   * Guard: if grid already present (only removed on success), skip.
   * No-op on profiles where enhance() exits early (local fallback stays).
   */
  document.addEventListener('fixeo:artisan:resolved', function() {
    if (document.querySelector('.ppui-trust-grid')) return; /* already re-injected */
    var hero = document.querySelector('.public-profile-hero');
    if (!hero) return;
    try {
      var data = _parseHeroData();
      _injectTrustIndicators(data);
    } catch(e) {}
  });

})(window, document);
