// ============================================================
//  FIXEO V3 — GAMIFICATION ENGINE
//  XP · Levels · Badges · Missions · Leaderboard · Ranking
// ============================================================

const BADGES = [
  { id: 'newcomer',   icon: '🌱', name: { fr: 'Bienvenu',     ar: 'مرحباً',       en: 'Newcomer'     }, desc: { fr: 'Première connexion', ar: 'أول تسجيل دخول', en: 'First login' },           xpRequired: 0,   rarity: 'common'   },
  { id: 'verified',   icon: '✅', name: { fr: 'Vérifié',      ar: 'موثَّق',        en: 'Verified'     }, desc: { fr: 'Profil complété',    ar: 'ملف مكتمل',     en: 'Profile complete' },        xpRequired: 50,  rarity: 'common'   },
  { id: 'first_job',  icon: '🔧', name: { fr: 'Première mission', ar: 'أول مهمة',  en: 'First Job'    }, desc: { fr: '1 mission réalisée', ar: 'مهمة منجزة',    en: '1 job done' },              xpRequired: 100, rarity: 'common'   },
  { id: 'responsive', icon: '⚡', name: { fr: 'Réactif',      ar: 'سريع الاستجابة', en: 'Responsive'  }, desc: { fr: 'Répond en < 5 min',  ar: 'يجيب في 5 دقائق', en: 'Replies in < 5 min' },     xpRequired: 200, rarity: 'uncommon' },
  { id: 'top_rated',  icon: '⭐', name: { fr: 'Bien noté',    ar: 'مُقيَّم جيداً', en: 'Top Rated'   }, desc: { fr: '+ 10 avis 5★',       ar: '10 تقييمات 5★', en: '10 five-star reviews' },     xpRequired: 300, rarity: 'uncommon' },
  { id: 'pro',        icon: '🎖️', name: { fr: 'Pro confirmé', ar: 'محترف معتمد',  en: 'Confirmed Pro'}, desc: { fr: '25 missions',         ar: '25 مهمة',       en: '25 jobs' },                  xpRequired: 500, rarity: 'rare'     },
  { id: 'expert',     icon: '🏆', name: { fr: 'Expert',       ar: 'خبير',          en: 'Expert'       }, desc: { fr: '50 missions',         ar: '50 مهمة',       en: '50 jobs' },                  xpRequired: 1000, rarity: 'rare'    },
  { id: 'legendary',  icon: '👑', name: { fr: 'Légende',      ar: 'أسطورة',        en: 'Legend'       }, desc: { fr: '100 missions',        ar: '100 مهمة',      en: '100 jobs' },                 xpRequired: 2000, rarity: 'legendary'},
  { id: 'speed',      icon: '🚀', name: { fr: 'Éclair',       ar: 'سريع كالبرق',  en: 'Lightning'    }, desc: { fr: '5 interventions express', ar: '5 تدخلات سريعة', en: '5 express jobs' },      xpRequired: 400, rarity: 'uncommon' },
  { id: 'friendly',   icon: '😊', name: { fr: 'Bienveillant', ar: 'ودود',          en: 'Friendly'     }, desc: { fr: '20 avis positifs',    ar: '20 تقييم إيجابي', en: '20 positive reviews' },    xpRequired: 350, rarity: 'uncommon' },
  { id: 'mentor',     icon: '🎓', name: { fr: 'Mentor',       ar: 'مرشد',          en: 'Mentor'       }, desc: { fr: 'Parrain 3 artisans',  ar: 'رعاية 3 حرفيين', en: 'Sponsor 3 artisans' },       xpRequired: 600, rarity: 'rare'     },
  { id: 'early_bird', icon: '🌅', name: { fr: 'Pionnier',     ar: 'رائد',          en: 'Early Bird'   }, desc: { fr: 'Membre fondateur',    ar: 'عضو مؤسس',      en: 'Founding member' },           xpRequired: 0,   rarity: 'special'  },
];

const MISSIONS = [
  { id: 'm1', icon: '📝', title: { fr: 'Compléter son profil', ar: 'إكمال الملف الشخصي', en: 'Complete profile' },
    desc: { fr: 'Ajoutez photo, bio et spécialités', ar: 'أضف صورة وسيرة ومهارات', en: 'Add photo, bio and skills' },
    xp: 50, target: 1, type: 'profile' },
  { id: 'm2', icon: '🔧', title: { fr: 'Première mission', ar: 'أول مهمة', en: 'First job' },
    desc: { fr: 'Réalisez votre 1re intervention', ar: 'أنجز أول تدخل', en: 'Complete your 1st job' },
    xp: 100, target: 1, type: 'jobs' },
  { id: 'm3', icon: '⭐', title: { fr: 'Obtenir 5 avis', ar: 'احصل على 5 تقييمات', en: 'Get 5 reviews' },
    desc: { fr: 'Recueillez 5 avis clients', ar: 'اجمع 5 تقييمات', en: 'Collect 5 customer reviews' },
    xp: 150, target: 5, type: 'reviews' },
  { id: 'm4', icon: '📸', title: { fr: 'Publier 3 réalisations', ar: 'انشر 3 أعمال', en: 'Publish 3 works' },
    desc: { fr: 'Partagez 3 photos avant/après', ar: 'شارك 3 صور قبل وبعد', en: 'Share 3 before/after photos' },
    xp: 120, target: 3, type: 'posts' },
  { id: 'm5', icon: '⚡', title: { fr: 'Demande express', ar: 'طلب عاجل', en: 'Express request' },
    desc: { fr: 'Répondre à 1 demande urgente', ar: 'استجب لطلب عاجل', en: 'Respond to 1 urgent request' },
    xp: 200, target: 1, type: 'express' },
  { id: 'm6', icon: '🏆', title: { fr: '10 missions', ar: '10 مهام', en: '10 jobs' },
    desc: { fr: 'Cumulez 10 interventions', ar: 'أنجز 10 تدخلات', en: 'Complete 10 jobs' },
    xp: 300, target: 10, type: 'jobs' },
];

const LEADERBOARD = [
  { rank: 1,  name: 'Karim B.',    avatar: '👷', xp: 4850, badges: 9, city: 'Casablanca' },
  { rank: 2,  name: 'Fatima Z.',   avatar: '👩‍🔧', xp: 4200, badges: 8, city: 'Rabat'       },
  { rank: 3,  name: 'Hassan M.',   avatar: '🧑‍🔧', xp: 3980, badges: 7, city: 'Marrakech'   },
  { rank: 4,  name: 'Aicha L.',    avatar: '👩‍💼', xp: 3540, badges: 7, city: 'Fès'          },
  { rank: 5,  name: 'Omar T.',     avatar: '👨‍🔧', xp: 3100, badges: 6, city: 'Agadir'       },
  { rank: 6,  name: 'Sara D.',     avatar: '👩‍🎨', xp: 2870, badges: 5, city: 'Tanger'       },
  { rank: 7,  name: 'Youssef K.', avatar: '🧑‍💼', xp: 2500, badges: 5, city: 'Meknès'      },
  { rank: 8,  name: 'Nadia R.',   avatar: '👩‍🔬', xp: 2100, badges: 4, city: 'Salé'         },
  { rank: 9,  name: 'Ali F.',     avatar: '👨‍🎨', xp: 1900, badges: 4, city: 'Oujda'        },
  { rank: 10, name: 'Zineb A.',   avatar: '👩‍🏫', xp: 1600, badges: 3, city: 'Kénitra'      },
];

const LEVELS = [
  { level: 1, name: { fr: 'Débutant',    ar: 'مبتدئ',   en: 'Beginner'   }, minXP: 0,    maxXP: 200,  color: '#6c757d' },
  { level: 2, name: { fr: 'Apprenti',    ar: 'متدرب',   en: 'Apprentice' }, minXP: 200,  maxXP: 500,  color: '#20c997' },
  { level: 3, name: { fr: 'Artisan',     ar: 'حرفي',    en: 'Artisan'    }, minXP: 500,  maxXP: 1000, color: '#3742fa' },
  { level: 4, name: { fr: 'Expert',      ar: 'خبير',    en: 'Expert'     }, minXP: 1000, maxXP: 2000, color: '#E1306C' },
  { level: 5, name: { fr: 'Maître',      ar: 'ماهر',    en: 'Master'     }, minXP: 2000, maxXP: 3500, color: '#833AB4' },
  { level: 6, name: { fr: 'Grand Maître',ar: 'عظيم',    en: 'Grand Master'}, minXP: 3500, maxXP: 5000, color: '#FFD700' },
  { level: 7, name: { fr: 'Légende',     ar: 'أسطورة',  en: 'Legend'     }, minXP: 5000, maxXP: Infinity, color: '#FF0080' },
];

class GamificationEngine {
  constructor() {
    this.state = JSON.parse(localStorage.getItem('fixeo_gam') || 'null') || {
      xp: 120,
      unlockedBadges: ['newcomer', 'verified', 'early_bird'],
      missionProgress: { m1: 1, m2: 0, m3: 2, m4: 1, m5: 0, m6: 0 },
      completedMissions: ['m1']
    };
    this.badges = BADGES;
    this.missions = MISSIONS;
    this.leaderboard = LEADERBOARD;
    this.levels = LEVELS;
  }

  save() { localStorage.setItem('fixeo_gam', JSON.stringify(this.state)); }

  addXP(amount) {
    const oldLevel = this.getLevel();
    this.state.xp += amount;
    this.save();
    const newLevel = this.getLevel();
    if (newLevel.level > oldLevel.level) {
      this.onLevelUp(newLevel);
    }
    this.checkBadgeUnlocks();
    this.renderAll();
    return this;
  }

  getLevel() {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (this.state.xp >= this.levels[i].minXP) return this.levels[i];
    }
    return this.levels[0];
  }

  getXPProgress() {
    const lvl = this.getLevel();
    if (lvl.maxXP === Infinity) return 100;
    const range = lvl.maxXP - lvl.minXP;
    const progress = this.state.xp - lvl.minXP;
    return Math.min(100, Math.round((progress / range) * 100));
  }

  checkBadgeUnlocks() {
    this.badges.forEach(b => {
      if (!this.state.unlockedBadges.includes(b.id) && this.state.xp >= b.xpRequired && b.xpRequired > 0) {
        this.unlockBadge(b.id);
      }
    });
  }

  unlockBadge(id) {
    if (this.state.unlockedBadges.includes(id)) return;
    this.state.unlockedBadges.push(id);
    this.save();
    const badge = this.badges.find(b => b.id === id);
    if (badge && window.notifSystem) {
      const lang = window.i18n ? window.i18n.lang : 'fr';
      window.notifSystem.push({
        type: 'success', icon: badge.icon,
        title: window.i18n ? window.i18n.t('gam_badge_unlocked', { name: badge.name[lang] }) : `Badge: ${badge.name.fr}`,
        body: badge.desc[lang] || badge.desc.fr,
      });
    }
    document.dispatchEvent(new CustomEvent('badgeUnlocked', { detail: { badge } }));
  }

  updateMission(missionId, progress) {
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission || this.state.completedMissions.includes(missionId)) return;
    this.state.missionProgress[missionId] = (this.state.missionProgress[missionId] || 0) + progress;
    if (this.state.missionProgress[missionId] >= mission.target) {
      this.completeMission(missionId);
    }
    this.save();
    this.renderMissions();
  }

  completeMission(id) {
    if (this.state.completedMissions.includes(id)) return;
    this.state.completedMissions.push(id);
    const mission = this.missions.find(m => m.id === id);
    if (mission) {
      this.addXP(mission.xp);
      if (window.notifSystem) {
        const lang = window.i18n ? window.i18n.lang : 'fr';
        window.notifSystem.push({
          type: 'success', icon: mission.icon,
          title: window.i18n ? window.i18n.t('gam_mission_complete', { xp: mission.xp }) : `Mission complète ! +${mission.xp} XP`,
          body: mission.title[lang] || mission.title.fr
        });
      }
    }
    this.save();
  }

  onLevelUp(level) {
    const lang = window.i18n ? window.i18n.lang : 'fr';
    if (window.notifSystem) {
      window.notifSystem.push({
        type: 'success', icon: '🎉',
        title: `Niveau ${level.level} atteint !`,
        body: `Vous êtes maintenant "${level.name[lang]}" ! Continuez ainsi.`
      });
    }
  }

  // ── RENDER ────────────────────────────────────────────────
  renderAll() {
    this.renderXPBar();
    this.renderBadges();
    this.renderMissions();
    this.renderLeaderboard();
  }

  renderXPBar() {
    const lang = window.i18n ? window.i18n.lang : 'fr';
    const lvl = this.getLevel();
    const pct = this.getXPProgress();
    document.querySelectorAll('.xp-fill, .xp-bar-wrap > .xp-bar').forEach(el => {
      el.style.width = pct + '%';
      el.parentElement.title = `${this.state.xp} XP`;
    });
    document.querySelectorAll('.xp-level-text').forEach(el => {
      el.textContent = `${lvl.name[lang]} — ${this.state.xp} XP (${pct}%)`;
    });
    document.querySelectorAll('.xp-value').forEach(el => el.textContent = this.state.xp + ' XP');
    document.querySelectorAll('.level-name').forEach(el => el.textContent = lvl.name[lang]);
  }

  renderBadges() {
    const lang = window.i18n ? window.i18n.lang : 'fr';
    document.querySelectorAll('.badge-grid').forEach(grid => {
      grid.innerHTML = this.badges.map(b => {
        const unlocked = this.state.unlockedBadges.includes(b.id);
        const rarityColors = { common: '#6c757d', uncommon: '#20c997', rare: '#833AB4', legendary: '#FFD700', special: '#E1306C' };
        return `
          <div class="badge-item ${unlocked ? 'unlocked' : 'locked'}" data-tooltip="${b.desc[lang] || b.desc.fr}" style="${unlocked ? 'border-color:'+rarityColors[b.rarity]+';' : ''}">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-name">${b.name[lang] || b.name.fr}</div>
            ${unlocked ? `<div style="font-size:.65rem;color:${rarityColors[b.rarity]};margin-top:2px">${b.rarity}</div>` : ''}
          </div>`;
      }).join('');
    });
  }

  renderMissions() {
    const lang = window.i18n ? window.i18n.lang : 'fr';
    document.querySelectorAll('.missions-list').forEach(list => {
      list.innerHTML = this.missions.map(m => {
        const progress = this.state.missionProgress[m.id] || 0;
        const completed = this.state.completedMissions.includes(m.id);
        const pct = Math.min(100, Math.round((progress / m.target) * 100));
        return `
          <div class="mission-item${completed ? ' completed' : ''}">
            <div class="mission-icon${completed ? '" style="background:var(--grad-success)' : ''}">${m.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem">
                <span style="font-weight:600;font-size:.9rem">${m.title[lang] || m.title.fr}</span>
                <span style="font-size:.75rem;color:var(--accent2);font-weight:700">+${m.xp} XP</span>
              </div>
              <div style="font-size:.78rem;color:rgba(255,255,255,.6);margin-bottom:.5rem">${m.desc[lang] || m.desc.fr}</div>
              <div class="mission-progress">
                <div class="mission-progress-fill" style="width:${pct}%;transition:width 1s ease"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:.25rem;font-size:.7rem;color:rgba(255,255,255,.5)">
                <span>${completed ? '✓ Terminé' : `${progress}/${m.target}`}</span>
                <span>${pct}%</span>
              </div>
            </div>
          </div>`;
      }).join('');
    });
  }

  renderLeaderboard() {
    const rankEmojis = ['🥇','🥈','🥉'];
    document.querySelectorAll('.leaderboard-list').forEach(list => {
      list.innerHTML = this.leaderboard.map((u, i) => `
        <div class="leaderboard-item">
          <div class="leaderboard-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${rankEmojis[i] || u.rank}</div>
          <div style="font-size:1.8rem">${u.avatar}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:.9rem">${u.name}</div>
            <div style="font-size:.75rem;color:rgba(255,255,255,.5)">${u.city} · ${u.badges} badges</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:.95rem;color:var(--accent2)">${u.xp.toLocaleString()} XP</div>
          </div>
        </div>
      `).join('');
    });
  }
}

window.gamification = new GamificationEngine();
document.addEventListener('DOMContentLoaded', () => window.gamification.renderAll());

// ── EXTRA RENDER HELPERS (v2 bugfix) ─────────────────────────
// Support [data-xp-bar] selector used in dashboard pages
GamificationEngine.prototype.renderXPBar = function() {
  const lang = window.i18n ? window.i18n.lang : 'fr';
  const lvl = this.getLevel();
  const pct = this.getXPProgress();
  // Classic .xp-bar elements
  document.querySelectorAll('.xp-fill, .xp-bar-wrap > .xp-bar').forEach(el => {
    el.style.width = pct + '%';
    if (el.parentElement) el.parentElement.title = `${this.state.xp} XP`;
  });
  document.querySelectorAll('.xp-level-text').forEach(el => {
    el.textContent = `${lvl.name[lang]} — ${this.state.xp} XP (${pct}%)`;
  });
  document.querySelectorAll('.xp-value').forEach(el => el.textContent = this.state.xp + ' XP');
  document.querySelectorAll('.level-name').forEach(el => el.textContent = lvl.name[lang]);
  // [data-xp-bar] elements (dashboard pages)
  document.querySelectorAll('[data-xp-bar]').forEach(container => {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
        <span style="font-weight:700;font-size:.9rem" style="color:${lvl.color}">${lvl.name[lang]}</span>
        <span style="font-size:.8rem;color:rgba(255,255,255,.6)">${this.state.xp} XP · ${pct}%</span>
      </div>
      <div style="height:8px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${lvl.color},${lvl.color}88);border-radius:4px;transition:width 1s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:.4rem;font-size:.75rem;color:rgba(255,255,255,.4)">
        <span>Niveau ${lvl.level}</span>
        <span>${lvl.maxXP === Infinity ? '∞' : lvl.maxXP + ' XP'} pour le prochain niveau</span>
      </div>`;
  });
};

// Support rendering missions into a specific container element
GamificationEngine.prototype.renderMissions = function(specificContainer) {
  const lang = window.i18n ? window.i18n.lang : 'fr';
  const targets = specificContainer
    ? [specificContainer]
    : Array.from(document.querySelectorAll('.missions-list'));
  targets.forEach(list => {
    list.innerHTML = this.missions.slice(0, 4).map(m => {
      const progress = this.state.missionProgress[m.id] || 0;
      const completed = this.state.completedMissions.includes(m.id);
      const pct = Math.min(100, Math.round((progress / m.target) * 100));
      return `
        <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;display:flex;gap:12px;align-items:flex-start${completed?';border-color:rgba(32,201,151,.3)':''}" class="mission-item${completed?' completed':''}">
          <div style="width:36px;height:36px;border-radius:10px;background:${completed?'rgba(32,201,151,.15)':'rgba(255,255,255,.07)'};display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">${m.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem">
              <span style="font-weight:600;font-size:.85rem">${m.title[lang] || m.title.fr}</span>
              <span style="font-size:.75rem;color:#FCAF45;font-weight:700">+${m.xp} XP</span>
            </div>
            <div style="font-size:.76rem;color:rgba(255,255,255,.5);margin-bottom:.5rem">${m.desc[lang] || m.desc.fr}</div>
            <div style="height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${completed?'#20c997':'var(--ig-gradient)'};border-radius:3px;transition:width 1s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:.25rem;font-size:.7rem;color:rgba(255,255,255,.4)">
              <span>${completed?'✓ Terminé':`${progress}/${m.target}`}</span><span>${pct}%</span>
            </div>
          </div>
        </div>`;
    }).join('');
  });
};

// Container-aware renderBadges
GamificationEngine.prototype.renderBadges = function(specificContainer) {
  const lang = window.i18n ? window.i18n.lang : 'fr';
  const rarityColors = { common:'#6c757d', uncommon:'#20c997', rare:'#833AB4', legendary:'#FFD700', special:'#E1306C' };
  const render = (grid) => {
    grid.innerHTML = this.badges.map(b => {
      const unlocked = this.state.unlockedBadges.includes(b.id);
      return `<div class="badge-item${unlocked?'':' locked'}" title="${b.desc[lang]||b.desc.fr}" style="${unlocked?'border:1px solid '+rarityColors[b.rarity]+';':''}" >
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name[lang]||b.name.fr}</div>
        ${unlocked?`<div class="badge-rarity ${b.rarity}">${b.rarity}</div>`:''}
      </div>`;
    }).join('');
  };
  if (specificContainer) { render(specificContainer); return; }
  document.querySelectorAll('.badge-grid,.badges-showcase,[data-badges]').forEach(render);
};

// Container-aware renderLeaderboard
GamificationEngine.prototype.renderLeaderboard = function(specificContainer) {
  const rankClass = i => i===0?'gold':i===1?'silver':i===2?'bronze':'default';
  const rankLabel = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1);
  const render = (list) => {
    list.innerHTML = this.leaderboard.map((u,i) => `
      <div class="lb-item">
        <div class="lb-rank ${rankClass(i)}">${rankLabel(i)}</div>
        <div class="lb-avatar">${u.avatar}</div>
        <div class="lb-info"><div class="lb-name">${u.name}</div><div class="lb-city">${u.city} · ${u.badges} badges</div></div>
        <div class="lb-xp">${u.xp.toLocaleString()} XP</div>
      </div>`).join('');
  };
  if (specificContainer) { render(specificContainer); return; }
  document.querySelectorAll('.leaderboard-list,[data-leaderboard]').forEach(render);
};
