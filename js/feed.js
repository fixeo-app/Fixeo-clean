// ============================================================
//  FIXEO V3 — INTERACTIVE FEED (Avant/Après + Drag & Drop)
// ============================================================

const FEED_DATA = [
  {
    id: 1, beforeImg: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&h=220&fit=crop&q=80", artisan: 'Karim B.', avatar: '👷', category: 'Plomberie',
    title: { fr: 'Rénovation salle de bain', ar: 'تجديد الحمام', en: 'Bathroom renovation' },
    desc: { fr: 'Remplacement complet de la plomberie et carrelage', ar: 'استبدال كامل للسباكة والبلاط', en: 'Full plumbing and tile replacement' },
    beforeColor: '#8B4513', afterColor: '#E8F4F8',
    beforeEmoji: '🔴', afterEmoji: '✨',
    likes: 142, comments: 28, saved: false, liked: false,
    tags: ['plomberie', 'rénovation', 'salle-de-bain'],
    time: '2h',
  },
  {
    id: 2, beforeImg: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=220&fit=crop&q=80", artisan: 'Sara D.', avatar: '👩‍🎨', category: 'Peinture',
    title: { fr: 'Peinture salon moderne', ar: 'طلاء صالون عصري', en: 'Modern living room paint' },
    desc: { fr: 'Transformation complète du salon avec peinture mate', ar: 'تحويل كامل للصالون بطلاء مطفي', en: 'Full living room transformation with matte paint' },
    beforeColor: '#D2B48C', afterColor: '#E8E8F0',
    beforeEmoji: '🎨', afterEmoji: '🏠',
    likes: 98, comments: 15, saved: false, liked: false,
    tags: ['peinture', 'salon', 'moderne'],
    time: '5h',
  },
  {
    id: 3, beforeImg: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1565372781813-bdb4e5b3c13e?w=400&h=220&fit=crop&q=80", artisan: 'Omar T.', avatar: '👨‍🔧', category: 'Électricité',
    title: { fr: 'Tableau électrique neuf', ar: 'لوحة كهربائية جديدة', en: 'New electrical panel' },
    desc: { fr: 'Installation tableau électrique aux normes', ar: 'تركيب لوحة كهربائية وفق المعايير', en: 'Standards-compliant electrical panel installation' },
    beforeColor: '#696969', afterColor: '#2C3E50',
    beforeEmoji: '⚡', afterEmoji: '✅',
    likes: 76, comments: 9, saved: false, liked: false,
    tags: ['électricité', 'tableau', 'sécurité'],
    time: '1j',
  },
  {
    id: 4, beforeImg: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=220&fit=crop&q=80", artisan: 'Fatima Z.', avatar: '👩‍🔧', category: 'Nettoyage',
    title: { fr: 'Nettoyage après travaux', ar: 'تنظيف ما بعد الأشغال', en: 'Post-construction cleaning' },
    desc: { fr: 'Nettoyage professionnel fin de chantier', ar: 'تنظيف احترافي لما بعد الأشغال', en: 'Professional end-of-construction cleaning' },
    beforeColor: '#8B7355', afterColor: '#F0F0F0',
    beforeEmoji: '🧹', afterEmoji: '✨',
    likes: 210, comments: 44, saved: false, liked: false,
    tags: ['nettoyage', 'chantier', 'professionnel'],
    time: '3j',
  },
  {
    id: 5, beforeImg: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=220&fit=crop&q=80", artisan: 'Hassan M.', avatar: '🧑‍🔧', category: 'Jardinage',
    title: { fr: 'Aménagement jardin', ar: 'تنسيق الحديقة', en: 'Garden landscaping' },
    desc: { fr: 'Création d\'un jardin zen avec gazon synthétique', ar: 'إنشاء حديقة زن مع عشب صناعي', en: 'Zen garden with synthetic grass' },
    beforeColor: '#8B4513', afterColor: '#228B22',
    beforeEmoji: '🌿', afterEmoji: '🌺',
    likes: 185, comments: 32, saved: false, liked: false,
    tags: ['jardinage', 'aménagement', 'zen'],
    time: '5j',
  },
  {
    id: 6, beforeImg: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=400&h=220&fit=crop&q=80", artisan: 'Aicha L.', avatar: '👩‍💼', category: 'Déménagement',
    title: { fr: 'Déménagement sécurisé', ar: 'نقل عفش آمن', en: 'Secure moving service' },
    desc: { fr: 'Déménagement complet avec emballage soigné', ar: 'نقل كامل مع تغليف دقيق', en: 'Full moving service with careful packing' },
    beforeColor: '#CD853F', afterColor: '#4A90D9',
    beforeEmoji: '📦', afterEmoji: '🏡',
    likes: 63, comments: 7, saved: false, liked: false,
    tags: ['déménagement', 'sécurisé', 'emballage'],
    time: '1sem',
  },

  {
    id: 7, beforeImg: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=220&fit=crop&q=80", artisan: 'Rachid O.', avatar: '🪚', category: 'Menuiserie',
    title: { fr: 'Portes intérieures sur mesure', ar: 'أبواب داخلية مخصصة', en: 'Custom interior doors' },
    desc: { fr: 'Fabrication et pose de 3 portes en bois massif', ar: 'صنع وتركيب 3 أبواب من الخشب الصلب', en: 'Manufacturing and fitting 3 solid wood doors' },
    beforeColor: '#8B6914', afterColor: '#DEB887',
    beforeEmoji: '🪚', afterEmoji: '🚪',
    likes: 54, comments: 11, saved: false, liked: false,
    tags: ['menuiserie', 'portes', 'sur-mesure'],
    time: '3j',
  },
  {
    id: 8, beforeImg: "https://images.unsplash.com/photo-1597268420662-c97e8e48d6e7?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1615971677499-5467cbab01c0?w=400&h=220&fit=crop&q=80", artisan: 'Imane Z.', avatar: '🧱', category: 'Maçonnerie',
    title: { fr: 'Carrelage terrasse', ar: 'بلاط الشرفة', en: 'Terrace tiling' },
    desc: { fr: 'Pose de carrelage grand format 60x60 sur terrasse 40m²', ar: 'تركيب بلاط 60x60 على شرفة 40م²', en: '60x60 large format tiles on 40m² terrace' },
    beforeColor: '#6B5344', afterColor: '#C8C0B8',
    beforeEmoji: '🧱', afterEmoji: '✨',
    likes: 37, comments: 6, saved: false, liked: false,
    tags: ['maçonnerie', 'carrelage', 'terrasse'],
    time: '1sem',
  },
  {
    id: 9, beforeImg: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=220&fit=crop&q=80", afterImg: "https://images.unsplash.com/photo-1536308527400-462de5b97e41?w=400&h=220&fit=crop&q=80", artisan: 'Samir B.', avatar: '❄️', category: 'Climatisation',
    title: { fr: 'Installation climatiseur inverter', ar: 'تركيب مكيف إنفرتر', en: 'Inverter AC installation' },
    desc: { fr: "Installation d'un système inverter 18000 BTU", ar: "تركيب نظام إنفرتر 18000 BTU", en: "18000 BTU inverter system installation" },
    beforeColor: '#2C3E50', afterColor: '#85C1E9',
    beforeEmoji: '🌡️', afterEmoji: '❄️',
    likes: 91, comments: 19, saved: false, liked: false,
    tags: ['climatisation', 'inverter', 'installation'],
    time: '4j',
  },
];


const FEED_ENHANCEMENTS = {
  1: {
    result: {
      fr: '✔️ +40% de luminosité • Salle de bain modernisée',
      en: '✔️ +40% brightness • Modern bathroom finish',
      ar: '✔️ إضاءة أفضل بنسبة 40% • حمّام عصري'
    },
    views: '1.2k'
  },
  2: {
    result: {
      fr: '✔️ Salon plus lumineux • Ambiance contemporaine',
      en: '✔️ Brighter living room • Contemporary atmosphere',
      ar: '✔️ صالون أكثر إشراقًا • أجواء عصرية'
    },
    views: '980'
  },
  3: {
    result: {
      fr: '✔️ Installation sécurisée • Mise aux normes immédiate',
      en: '✔️ Safer setup • Standards-compliant result',
      ar: '✔️ تركيب آمن • مطابق للمعايير'
    },
    views: '860'
  },
  4: {
    result: {
      fr: '✔️ Chantier impeccable • Espace prêt à vivre',
      en: '✔️ Spotless finish • Ready-to-use space',
      ar: '✔️ تنظيف مثالي • مساحة جاهزة للاستعمال'
    },
    views: '1.5k'
  },
  5: {
    result: {
      fr: '✔️ Jardin structuré • Extérieur premium',
      en: '✔️ Structured garden • Premium outdoor feel',
      ar: '✔️ حديقة منظمة • مظهر خارجي فاخر'
    },
    views: '1.3k'
  },
  6: {
    result: {
      fr: '✔️ Déménagement sans stress • Intérieur protégé',
      en: '✔️ Stress-free move • Interior fully protected',
      ar: '✔️ نقل بدون توتر • حماية كاملة للأثاث'
    },
    views: '740'
  },
  7: {
    result: {
      fr: '✔️ Finition haut de gamme • Portes sur mesure',
      en: '✔️ Premium finish • Custom-made doors',
      ar: '✔️ تشطيب فاخر • أبواب حسب الطلب'
    },
    views: '910'
  },
  8: {
    result: {
      fr: '✔️ Terrasse premium • Rendu moderne et durable',
      en: '✔️ Premium terrace • Modern durable finish',
      ar: '✔️ شرفة فاخرة • نتيجة عصرية ومتينة'
    },
    views: '1.1k'
  },
  9: {
    result: {
      fr: '✔️ Fraîcheur optimisée • Confort immédiat',
      en: '✔️ Optimized cooling • Immediate comfort',
      ar: '✔️ تبريد أفضل • راحة فورية'
    },
    views: '1.4k'
  }
};

const COMMENTS_DATA = window.COMMENTS_DATA = {
  1: [
    { user: 'Yasmine T.', avatar: '👩', text: { fr: 'Travail impeccable !', en: 'Impeccable work!', ar: 'عمل رائع!' }, time: '1h' },
    { user: 'Mohamed A.', avatar: '👨', text: { fr: 'Je recommande vivement Karim !', en: 'Highly recommend!', ar: 'أوصي بشدة بكريم!' }, time: '30min' },
  ],
  2: [
    { user: 'Leila B.', avatar: '👩‍🦱', text: { fr: 'Superbe transformation !', en: 'Great transformation!', ar: 'تحول رائع!' }, time: '4h' },
  ],

  7: [
    { user: 'Khalid A.', avatar: '👨', text: { fr: 'Superbe travail de menuiserie !', en: 'Superb carpentry work!', ar: 'عمل نجارة رائع!' }, time: '2j' },
  ],
  8: [
    { user: 'Nadia B.', avatar: '👩', text: { fr: 'Carrelage impeccable, très professionnel !', en: 'Impeccable tiling!', ar: 'بلاط لا تشوبه شائبة!' }, time: '5j' },
  ],
  9: [
    { user: 'Ahmed K.', avatar: '👨', text: { fr: 'Samir est le meilleur pour la climatisation !', en: 'Best AC tech!', ar: 'سمير الأفضل في التكييف!' }, time: '3j' },
  ],
};

class FeedManager {
  constructor() {
    this.data = FEED_DATA.map(item => ({ ...item, ...(FEED_ENHANCEMENTS[item.id] || {}) }));
    this.activeSliders = new Map();
    this.dragItem = null;
  }

  init(containerId = 'feed-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.render(container);
  }

  render(container) {
    const lang = window.i18n ? window.i18n.lang : 'fr';
    container.innerHTML = this.data.map(item => this.renderCard(item, lang)).join('');
    this.data.forEach(item => this.initSlider(item.id));
    container.addEventListener('click', e => this.handleClick(e));
  }

  renderCard(item, lang) {
    const resultText = item.result?.[lang] || item.result?.fr || '';
    const beforeBg = item.beforeImg
      ? `background:url('${item.beforeImg}') center/cover no-repeat`
      : `background:linear-gradient(135deg,${item.beforeColor},#333)`;
    const afterBg = item.afterImg
      ? `background:url('${item.afterImg}') center/cover no-repeat`
      : `background:linear-gradient(135deg,${item.afterColor},#eee)`;
    return `
    <div class="feed-card realisation-card" id="feed-card-${item.id}" draggable="true"
         ondragstart="window.feedManager.onDragStart(event, ${item.id})"
         ondragover="event.preventDefault()"
         ondrop="window.feedManager.onDrop(event, ${item.id})">
      <div class="feed-card-header" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);position:relative;z-index:10;background:rgba(13,13,26,0.85);backdrop-filter:blur(8px)">
        <div style="font-size:1.8rem;line-height:1">${item.avatar}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem">${item.artisan}</div>
          <div style="font-size:.75rem;color:rgba(255,255,255,.5)">${item.category} · ${item.time}</div>
        </div>
        <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
          <span style="background:rgba(225,48,108,0.12);border:1px solid rgba(225,48,108,0.3);border-radius:999px;padding:3px .7rem;font-size:.7rem;font-weight:600;color:var(--primary)">${item.category}</span>
          <button class="btn-more" data-id="${item.id}" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,.6);font-size:1rem;border-radius:8px;padding:4px 8px;cursor:pointer">⋯</button>
        </div>
      </div>
      <div class="before-after-slider premium-before-after" id="slider-${item.id}" style="position:relative;height:220px;overflow:hidden;cursor:ew-resize;border-radius:0">
        <div class="before-img ba-panel" id="before-${item.id}"
             style="position:absolute;top:0;left:0;width:100%;height:100%;
                    ${beforeBg};background-size:cover!important;background-position:center!important;
                    display:flex;align-items:flex-end;justify-content:flex-start;
                    clip-path:inset(0 50% 0 0)">
          <span class="ba-label before">AVANT</span>
        </div>
        <div class="after-img ba-panel" id="after-${item.id}"
             style="position:absolute;top:0;left:0;width:100%;height:100%;
                    ${afterBg};background-size:cover!important;background-position:center!important;
                    display:flex;align-items:flex-end;justify-content:flex-end">
          <span class="ba-label after">APRÈS</span>
        </div>
        <div class="before-after-overlay" aria-hidden="true"></div>
        <div class="slider-handle" id="handle-${item.id}" style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;transform:translateX(-50%);z-index:8;pointer-events:none"></div>
        <div class="slider-handle-indicator" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#333;box-shadow:0 2px 10px rgba(0,0,0,0.5);z-index:9;pointer-events:none">⇄</div>
      </div>
      <div class="realisation-content" style="padding:.9rem 1.25rem 1rem;position:relative;z-index:2">
        <div style="font-weight:700;font-size:.96rem;margin-bottom:.15rem">${item.title[lang] || item.title.fr}</div>
        ${resultText ? `<p class="result">${resultText}</p>` : ''}
        <div style="font-size:.8rem;color:rgba(255,255,255,.68);margin-bottom:.65rem">${item.desc[lang] || item.desc.fr}</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${item.tags.map(tag => `<span style="background:rgba(225,48,108,.1);border:1px solid rgba(225,48,108,.3);border-radius:999px;padding:2px .6rem;font-size:.7rem;color:var(--primary)">#${tag}</span>`).join('')}
        </div>
        <div class="meta">❤️ ${item.likes} • 👍 ${item.comments} • 👁 ${item.views || '1.0k'} vues</div>
        <a href="#feed-card-${item.id}" class="feed-action-btn-link btn-view" onclick="window.feedManager?.openProject(${item.id});return false;">Voir transformation</a>
      </div>
      <div class="feed-card-footer" style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid rgba(255,255,255,0.08);position:relative;z-index:10;background:rgba(13,13,26,0.85);backdrop-filter:blur(8px);flex-wrap:wrap">
        <button class="feed-action ${item.liked ? 'liked' : ''}" data-action="like" data-id="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:8px;font-size:.82rem;cursor:pointer;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,.75);font-family:inherit;transition:all 0.2s">
          ${item.liked ? '❤️' : '🤍'} <span>${item.likes}</span>
        </button>
        <button class="feed-action" data-action="comment" data-id="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:8px;font-size:.82rem;cursor:pointer;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,.75);font-family:inherit;transition:all 0.2s">
          💬 <span>${item.comments}</span>
        </button>
        <button class="feed-action" data-action="share" data-id="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:8px;font-size:.82rem;cursor:pointer;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,.75);font-family:inherit;transition:all 0.2s">
          📤
        </button>
        <button class="feed-action ${item.saved ? 'liked' : ''}" data-action="save" data-id="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:8px;font-size:.82rem;cursor:pointer;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,.75);font-family:inherit;transition:all 0.2s;margin-left:auto">
          ${item.saved ? '🔖' : '📌'}
        </button>
      </div>
    </div>`;
  }

  initSlider(id) {
    const slider = document.getElementById(`slider-${id}`);
    const before = document.getElementById(`before-${id}`);
    const handle = document.getElementById(`handle-${id}`);
    if (!slider || !before || !handle) return;

    let isDragging = false;
    const getPercent = (clientX) => {
      const rect = slider.getBoundingClientRect();
      return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    };
    const update = (pct) => {
      before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = `${pct}%`;
    };

    slider.addEventListener('mousedown', e => { isDragging = true; update(getPercent(e.clientX)); });
    slider.addEventListener('touchstart', e => { isDragging = true; update(getPercent(e.touches[0].clientX)); }, { passive: true });
    document.addEventListener('mousemove', e => { if (isDragging) update(getPercent(e.clientX)); });
    document.addEventListener('touchmove', e => { if (isDragging) update(getPercent(e.touches[0].clientX)); }, { passive: true });
    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('touchend', () => isDragging = false);
  }

  handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    const item = this.data.find(d => d.id === id);
    if (!item) return;
    if (action === 'like') {
      item.liked = !item.liked;
      item.likes += item.liked ? 1 : -1;
      btn.classList.toggle('liked', item.liked);
      btn.innerHTML = `${item.liked ? '❤️' : '🤍'} <span>${item.likes}</span>`;
      if (item.liked && window.gamification) window.gamification.updateMission('m3', 0.1);
    }
    if (action === 'save') {
      item.saved = !item.saved;
      btn.textContent = item.saved ? '🔖' : '📌';
      btn.classList.toggle('liked', item.saved);
    }
    if (action === 'share') {
      if (navigator.share) {
        navigator.share({ title: 'Fixeo', text: item.title.fr, url: window.location.href });
      } else {
        navigator.clipboard?.writeText(window.location.href);
        if (window.notifSystem) window.notifSystem.toast({ type: 'success', title: 'Lien copié !', message: 'Le lien a été copié dans le presse-papier.', icon: '🔗' });
      }
    }
    if (action === 'comment') this.openComments(id);
  }

  openComments(id) {
    const item = this.data.find(d => d.id === id);
    if (!item) return;
    const lang = window.i18n ? window.i18n.lang : 'fr';
    const comments = COMMENTS_DATA[id] || [];
    const modal = document.getElementById('comment-modal');
    if (!modal) return;
    modal.querySelector('#comment-modal-title').textContent = item.title[lang] || item.title.fr;
    modal.querySelector('#comment-list').innerHTML = comments.map(c => `
      <div style="display:flex;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--glass-border)">
        <div style="font-size:1.5rem">${c.avatar}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.85rem;margin-bottom:.25rem">${c.user}</div>
          <div style="font-size:.85rem;color:rgba(255,255,255,.8)">${c.text[lang] || c.text.fr}</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:.25rem">${c.time}</div>
        </div>
      </div>
    `).join('') || '<div style="text-align:center;padding:1.5rem;color:rgba(255,255,255,.4)">Soyez le premier à commenter !</div>';
    openModal('comment-modal');
  }

  openProject(id) {
    const item = this.data.find(d => d.id === id);
    if (!item) return;
    const lang = window.i18n ? window.i18n.lang : 'fr';
    const beforeBg = item.beforeImg ? `url('${item.beforeImg}')` : `linear-gradient(135deg,${item.beforeColor},#333)`;
    const afterBg = item.afterImg ? `url('${item.afterImg}')` : `linear-gradient(135deg,${item.afterColor},#eee)`;
    const resultText = item.result?.[lang] || item.result?.fr || '';
    const modal = document.getElementById('comment-modal');
    if (!modal) return;
    modal.querySelector('#comment-modal-title').textContent = item.title[lang] || item.title.fr;
    modal.querySelector('#comment-list').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="position:relative;height:180px;border-radius:12px;overflow:hidden;background:${beforeBg};background-size:cover;background-position:center">
          <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.55), transparent 60%)"></div>
          <span class="ba-label before" style="position:absolute;bottom:10px;left:10px;z-index:2">AVANT</span>
        </div>
        <div style="position:relative;height:180px;border-radius:12px;overflow:hidden;background:${afterBg};background-size:cover;background-position:center">
          <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.55), transparent 60%)"></div>
          <span class="ba-label after" style="position:absolute;bottom:10px;right:10px;z-index:2">APRÈS</span>
        </div>
      </div>
      <div style="margin-bottom:12px;padding:14px;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.1)">
        <div style="font-weight:700;margin-bottom:6px">${item.title[lang]||item.title.fr}</div>
        ${resultText ? `<div class="result" style="margin-bottom:8px">${resultText}</div>` : ''}
        <div style="font-size:0.85rem;color:rgba(255,255,255,0.65)">${item.desc[lang]||item.desc.fr}</div>
        <div class="meta" style="margin-top:10px">❤️ ${item.likes} • 👍 ${item.comments} • 👁 ${item.views || '1.0k'} vues</div>
      </div>
      <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px">💬 Commentaires</div>
      ${(window.COMMENTS_DATA && window.COMMENTS_DATA[id] || []).map(c => `
        <div style="display:flex;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.07)">
          <div style="font-size:1.5rem">${c.avatar}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.25rem">${c.user}</div>
            <div style="font-size:.85rem;color:rgba(255,255,255,.8)">${c.text[lang]||c.text.fr}</div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:.25rem">${c.time}</div>
          </div>
        </div>
      `).join('') || '<div style="text-align:center;padding:1.5rem;color:rgba(255,255,255,.4)">Soyez le premier à commenter !</div>'}
    `;
    if (typeof openModal === 'function') openModal('comment-modal');
  }

  onDragStart(event, id) {
    this.dragItem = id;
    event.dataTransfer.effectAllowed = 'move';
  }

  onDrop(event, targetId) {
    event.preventDefault();
    if (this.dragItem === null || this.dragItem === targetId) return;
    const fromIdx = this.data.findIndex(d => d.id === this.dragItem);
    const toIdx = this.data.findIndex(d => d.id === targetId);
    const [moved] = this.data.splice(fromIdx, 1);
    this.data.splice(toIdx, 0, moved);
    const container = document.getElementById('feed-container');
    if (container) this.render(container);
    this.dragItem = null;
  }
}

window.feedManager = new FeedManager();
document.addEventListener('DOMContentLoaded', () => {
  window.feedManager.init('feed-container');
});
