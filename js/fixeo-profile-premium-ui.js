/**
 * fixeo-profile-premium-ui.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cosmetic DOM upgrade for artisan-profile.html
 * Enriches HTML injected by fixeo-public-artisan-profile.js AFTER render.
 * NEVER modifies: reservation logic, #public-artisan-action, routing, JS fns.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (window, document) {
  'use strict';

  var CAT_ICONS = {
    plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹',
    jardinage:'🌿', demenagement:'📦', bricolage:'🔨', climatisation:'❄️',
    menuiserie:'🪚', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠',
    etancheite:'🛡', vitrerie:'🪟', soudure:'🔥', informatique:'💻',
    plombier:'🔧', electricien:'⚡', peintre:'🎨'
  };

  var CAT_SKILLS = {
    plomberie:    ['Fuite d\'eau','Débouchage','Installation','Chauffe-eau','Remplacement robinets'],
    electricite:  ['Tableau électrique','Prises & interrupteurs','Éclairage LED','Dépannage','Conformité NF'],
    peinture:     ['Peinture intérieure','Revêtements muraux','Enduit de finition','Décoration','Rénovation'],
    nettoyage:    ['Nettoyage professionnel','Vitrerie','Moquette','Après-travaux','Désinfection'],
    jardinage:    ['Tonte pelouse','Taille haies','Entretien potager','Arrosage automatique','Élagage'],
    demenagement: ['Emballage','Transport','Montage meubles','Stockage','Déménagement international'],
    bricolage:    ['Montage meubles','Petites réparations','Fixation','Carrelage','Parquet'],
    climatisation:['Installation split','Entretien climatiseur','Pompe à chaleur','Ventilation','Réfrigération'],
    menuiserie:   ['Portes & fenêtres','Cuisine sur mesure','Dressing','Parquet','Escaliers'],
    maconnerie:   ['Gros œuvre','Rénovation','Carrelage','Enduit','Isolation'],
    serrurerie:   ['Ouverture urgence','Blindage','Serrure multipoints','Coffre-fort','Interphone'],
    carrelage:    ['Pose carrelage','Faïence','Rénovation sol','Joints','Imperméabilisation'],
    etancheite:   ['Toiture-terrasse','Sous-sol','Piscine','Balcon','Traitement humidité'],
    vitrerie:     ['Double vitrage','Miroirs','Cloisons verre','Remplacement','Sécurité'],
    soudure:      ['Soudure TIG/MIG','Acier inox','Aluminium','Garde-corps','Portails'],
    informatique: ['Dépannage PC','Réseau Wi-Fi','Installation logiciels','Sauvegarde','Conseil']
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

  /* ── Inject badge row below availability pill ── */
  function _injectBadges(data) {
    if (document.querySelector('.ppui-badge-row')) return;
    var heroMain = document.querySelector('.public-hero-main');
    if (!heroMain) return;

    var badges = [];
    if (data.trust >= 85 || data.reviews >= 5)
      badges.push('<span class="ppui-badge ppui-badge--verified">✔ Vérifié Fixeo</span>');
    if (data.trust >= 90)
      badges.push('<span class="ppui-badge ppui-badge--premium">🏅 Premium</span>');
    if (data.isAvail)
      badges.push('<span class="ppui-badge ppui-badge--fast">⚡ Dispo maintenant</span>');
    if (!badges.length)
      badges.push('<span class="ppui-badge ppui-badge--fixeo">🔧 Profil vérifié Fixeo</span>');
    if (data.reviews === 0)
      badges.push('<span class="ppui-badge ppui-badge--new">✨ Nouveau professionnel</span>');

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

  /* ── Upgrade trust score: add visual bar ── */
  function _upgradeTrustScore(data) {
    var scoreEl = document.querySelector('.public-trust-score');
    if (!scoreEl || scoreEl.querySelector('.ppui-trust-bar-wrap')) return;
    var score = data.trust;
    var barHtml =
      '<div class="ppui-trust-bar-wrap">' +
        '<span class="ppui-trust-bar-label">Trust Score</span>' +
        '<div class="ppui-trust-bar-track"><div class="ppui-trust-bar-fill" style="width:'+score+'%"></div></div>' +
        '<span class="ppui-trust-score-val">'+score+' / 100</span>' +
      '</div>';
    scoreEl.style.display = 'none';
    scoreEl.insertAdjacentHTML('afterend', barHtml);
  }

  /* ── Upgrade CTA button label ── */
  function _upgradeCTA(data) {
    var btn = document.getElementById('public-artisan-action');
    if (!btn || btn.dataset.ppuiUpgraded) return;
    btn.dataset.ppuiUpgraded = '1';
    /* Only improve label — never change onclick/id */
    if (data.isAvail) {
      btn.textContent = '📅 Réserver cet artisan';
    } else {
      btn.textContent = '📅 Demander intervention';
    }
    /* Add urgency sub-label */
    if (data.isAvail && !btn.nextElementSibling?.classList.contains('ppui-cta-hint')) {
      var hint = document.createElement('p');
      hint.className = 'ppui-cta-hint';
      hint.style.cssText = 'margin:8px 0 0;font-size:.76rem;color:rgba(255,255,255,.5);text-align:center;';
      hint.textContent = '⚡ Réponse moyenne en moins de 20 min';
      btn.parentNode.insertBefore(hint, btn.nextSibling);
    }
  }

  /* ── Inject "À propos" section ── */
  function _injectAbout(data) {
    if (document.getElementById('ppui-about')) return;
    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var catIcon = CAT_ICONS[data.category] || '🔧';
    var catLabel = (document.querySelector('.public-hero-meta')||{}).textContent || data.category;
    catLabel = catLabel.split('•')[0].trim();

    var bio = data.reviews > 0
      ? 'Artisan qualifié spécialisé en '+_esc(catLabel)+', basé à '+_esc(data.city)+'. Professionnel vérifié par Fixeo avec un historique de missions validées et des avis clients authentiques.'
      : 'Nouveau professionnel recommandé, spécialisé en '+_esc(catLabel)+', disponible pour ses premières missions à '+_esc(data.city)+'. Profil vérifié par l\'équipe Fixeo.';

    var section = document.createElement('section');
    section.id = 'ppui-about';
    section.className = 'ppui-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">À propos</p>'+
      '<h2 class="ppui-section-title">'+catIcon+' '+_esc(catLabel)+' à '+_esc(data.city)+'</h2>'+
      '<p class="ppui-about-text">'+bio+'</p>';

    /* Insert before the .public-section-grid */
    var grid = root.querySelector('.public-section-grid');
    if (grid) root.insertBefore(section, grid);
    else root.appendChild(section);
  }

  /* ── Inject Services section ── */
  function _injectServices(data) {
    if (document.getElementById('ppui-services')) return;
    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var skills = CAT_SKILLS[data.category] ||
                 ['Intervention rapide','Devis gratuit','Travail soigné','Garantie satisfaction'];
    var catIcon = CAT_ICONS[data.category] || '🔧';

    var section = document.createElement('section');
    section.id = 'ppui-services';
    section.className = 'ppui-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">Services proposés</p>'+
      '<h2 class="ppui-section-title">Prestations disponibles</h2>'+
      '<div class="ppui-services-grid">'+
        skills.map(function(s){ return '<span class="ppui-service-chip">'+catIcon+' '+_esc(s)+'</span>'; }).join('')+
        '<span class="ppui-service-chip">🏡 Devis gratuit</span>'+
        '<span class="ppui-service-chip">📞 Urgence 24h</span>'+
      '</div>';

    var grid = root.querySelector('.public-section-grid');
    if (grid) root.insertBefore(section, grid);
    else root.appendChild(section);
  }

  /* ── Inject Réalisations portfolio section ── */
  function _injectPortfolio(data) {
    if (document.getElementById('ppui-portfolio')) return;
    var root = document.querySelector('.public-artisan-shell');
    if (!root) return;

    var icons = ['🔧','⚙️','🏠','🛠️','✨','🏗️'];
    var catIcon = CAT_ICONS[data.category] || '🔧';
    var placeholders = [catIcon,'✅','📸','🏆','⭐','🛠️'].slice(0,6);

    var section = document.createElement('section');
    section.id = 'ppui-portfolio';
    section.className = 'ppui-section';
    section.innerHTML =
      '<p class="ppui-section-kicker">Réalisations</p>'+
      '<h2 class="ppui-section-title">Exemples de travaux</h2>'+
      '<div class="ppui-portfolio-grid">'+
        placeholders.map(function(icon, i){
          return '<div class="ppui-portfolio-item" title="Réalisation '+(i+1)+'">'+icon+'</div>';
        }).join('')+
      '</div>'+
      '<p style="margin:14px 0 0;font-size:.78rem;color:rgba(255,255,255,.4);font-style:italic;">'+
        'Photos de réalisations disponibles sur demande'+
      '</p>';

    /* Insert after services section */
    var services = document.getElementById('ppui-services');
    var grid = root.querySelector('.public-section-grid');
    var anchor = services ? services.nextSibling : (grid || null);
    if (anchor) root.insertBefore(section, anchor);
    else root.appendChild(section);
  }

  /* ── Inject Trust indicators block inside stats panel ── */
  function _injectTrustIndicators(data) {
    if (document.querySelector('.ppui-trust-grid')) return;
    /* Find the stats panel (second .public-panel) */
    var panels = document.querySelectorAll('.public-panel');
    var statsPanel = panels.length >= 2 ? panels[1] : null;
    if (!statsPanel) return;

    var items = [
      { icon: '🔒', label: 'Identité vérifiée', sub: 'Contrôle Fixeo' },
      { icon: '⭐', label: data.reviews > 0 ? data.reviews+' avis clients' : 'Nouveau profil', sub: data.reviews > 0 ? 'Avis authentiques' : 'Disponible pour 1ères missions' },
      { icon: '⚡', label: 'Réponse rapide', sub: 'Moins de 30 min en moyenne' },
      { icon: '🛡️', label: 'Paiement sécurisé', sub: 'Transactions protégées Fixeo' }
    ];

    var grid = document.createElement('div');
    grid.className = 'ppui-trust-grid';
    grid.innerHTML = items.map(function(item){
      return '<div class="ppui-trust-item">'+
        '<span class="ppui-trust-icon">'+item.icon+'</span>'+
        '<div class="ppui-trust-text"><strong>'+_esc(item.label)+'</strong><span>'+_esc(item.sub)+'</span></div>'+
      '</div>';
    }).join('');

    statsPanel.appendChild(grid);
  }

  /* ── Sticky mobile CTA (does NOT duplicate reservation logic — calls original btn) ── */
  function _injectStickyCTA() {
    if (document.getElementById('ppui-sticky-cta')) return;
    var wrap = document.createElement('div');
    wrap.id = 'ppui-sticky-cta';
    wrap.className = 'ppui-sticky-cta';
    wrap.innerHTML = '<button class="ppui-sticky-cta-btn" type="button" id="ppui-sticky-btn">📅 Réserver cet artisan</button>';
    document.body.appendChild(wrap);

    /* Delegate to the original #public-artisan-action */
    document.getElementById('ppui-sticky-btn').addEventListener('click', function() {
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

    _injectBadges(data);
    _upgradeTrustScore(data);
    _upgradeCTA(data);
    _injectAbout(data);
    _injectServices(data);
    _injectPortfolio(data);
    _injectTrustIndicators(data);
    _injectStickyCTA();

    console.log('✅ Fixeo Profile Premium UI injected');
  }

  /* ── Watch for async render (MutationObserver) ── */
  function init() {
    var root = document.getElementById('public-artisan-root');
    if (!root) return;

    /* Try immediately first */
    upgrade();

    /* Watch for dynamic injection */
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

})(window, document);
