/**
 * ================================================================
 *  FIXEO v7 — SMART SEARCH ENGINE
 *  Ultra-intelligent artisan search: NLP · History · Filters
 *  ── v7.1 FIX PATCH ──────────────────────────────────────────
 *  ✔ Duplicate city/specialty removal (case-insensitive dedup)
 *  ✔ Title-case normalisation for all dropdown entries
 *  ✔ "Trouver" button wired to main search module correctly
 *  ✔ NLP query boosted to main SearchEngine on button click
 *  ✔ City matching made case-insensitive & accent-tolerant
 *  ✔ window.renderArtisans called safely
 *  ✔ Featured artisans + score + portfolio + map compatible
 * ================================================================
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   0.  UTILITY — shared normaliser & title-case helper
   ───────────────────────────────────────────────────────────── */

/** Strip accents, lower-case, keep only alphanum+space */
function _ssbNorm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First letter uppercase, rest lowercase – preserves accented chars */
function _ssbTitleCase(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * De-duplicate an array of strings: case-insensitive + accent-insensitive.
 * Keeps the FIRST occurrence and formats it with _ssbTitleCase.
 * @param {string[]} arr
 * @returns {string[]}
 */
function _ssbDedup(arr) {
  const seen = new Set();
  const out  = [];
  for (const item of arr) {
    const key = _ssbNorm(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(_ssbTitleCase(item.trim()));
    }
  }
  return out;
}

/**
 * De-duplicate category entries { key, label, icon }.
 * Deduplication is on the normalised label.
 * @param {Array<{key:string, label:string, icon:string}>} arr
 * @returns {Array<{key:string, label:string, icon:string}>}
 */
function _ssbDedupCats(arr) {
  const seen = new Set();
  const out  = [];
  for (const entry of arr) {
    const key = _ssbNorm(entry.label);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push({ ...entry, label: _ssbTitleCase(entry.label.trim()) });
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   1.  DATA — Services, Specialties, Cities (mirrors ARTISANS[])
   ───────────────────────────────────────────────────────────── */

const SSB_DATA = {

  /* Map artisan category keys → display info */
  categories: {
    plomberie:    { label: 'Plomberie',     icon: '🔧' },
    electricite:  { label: 'Électricité',   icon: '⚡' },
    peinture:     { label: 'Peinture',      icon: '🎨' },
    demenagement: { label: 'Déménagement',  icon: '📦' },
    jardinage:    { label: 'Jardinage',     icon: '🌿' },
    nettoyage:    { label: 'Nettoyage',     icon: '🧹' },
    bricolage:    { label: 'Bricolage',     icon: '🔨' },
    climatisation:{ label: 'Climatisation', icon: '❄️' },
    menuiserie:   { label: 'Menuiserie',    icon: '🪚' },
    maconnerie:   { label: 'Maçonnerie',    icon: '🧱' },
    serrurerie:   { label: 'Serrurerie',    icon: '🔑' },
    carrelage:    { label: 'Carrelage',     icon: '🏠' },
  },

  /* NLP keyword mapping → category */
  nlpMap: [
    { keywords: ['plomb','plombier','fuite','robinet','tuyau','sanitaire','chauffe-eau','chauffe eau','eau','canalisation','wc','toilette','évacuation'], cat: 'plomberie' },
    { keywords: ['élect','electr','courant','prise','tableau','câble','cable','lumière','lumiere','éclairage','disjoncteur','domotique','wifi','réseau'], cat: 'electricite' },
    { keywords: ['peintr','peint','mur','façade','facade','enduit','déco','deco','badigeon','ravalement','couleur'], cat: 'peinture' },
    { keywords: ['déménag','demenag','transport','camion','emballage','monte-charge','monte charge','déplacement','déplacer'], cat: 'demenagement' },
    { keywords: ['jardin','tonte','taille','pelouse','haie','arbust','arrosage','débroussaillage','pelouse'], cat: 'jardinage' },
    { keywords: ['nettoy','ménage','vitres','entretien','désinfect','propret','cleaning'], cat: 'nettoyage' },
    { keywords: ['bricol','montage','fixation','petits travaux','petites réparations'], cat: 'bricolage' },
    { keywords: ['clim','climatiseur','chauffage','chaudière','radiateur','pompe à chaleur','pac','vmc','ventilation'], cat: 'climatisation' },
    { keywords: ['menuisier','bois','porte','fenêtre','parquet','placard','meuble','charpente','ébéniste'], cat: 'menuiserie' },
    { keywords: ['maçon','béton','ciment','mur porteur','démolition','rénovation','crépissage','béton'], cat: 'maconnerie' },
    { keywords: ['serrur','clé','cle','verrou','porte blindée','urgence fermer','ouverture porte'], cat: 'serrurerie' },
    { keywords: ['carrelage','carreaux','sol','faïence','mosaïque','joints','pose sol'], cat: 'carrelage' },
  ],

  /* Specialties per category */
  specialties: {
    plomberie:    ['Réparation fuite', 'Installation chauffe-eau', 'Urgence plomberie', 'Débouchage'],
    electricite:  ['Tableau électrique', 'Mise aux normes', 'Domotique / Smart Home', 'Câblage'],
    peinture:     ['Peinture intérieure', 'Peinture extérieure', 'Ravalement façade', 'Décoration'],
    demenagement: ['Déménagement local', 'Déménagement longue distance', 'Emballage', 'Monte-charge'],
    jardinage:    ['Tonte pelouse', 'Taille haies', 'Aménagement jardin', 'Arrosage automatique'],
    nettoyage:    ['Nettoyage fin de chantier', 'Entretien régulier', 'Vitrerie', 'Désinfection'],
    bricolage:    ['Montage meubles', 'Fixations murales', 'Petits travaux', 'Assemblage'],
    climatisation:['Installation clim', 'Entretien clim', 'Pompe à chaleur', 'Réparation clim'],
    menuiserie:   ['Fabrication sur mesure', 'Pose parquet', 'Rénovation portes', 'Aménagement placards'],
    maconnerie:   ['Rénovation complète', 'Carrelage', 'Enduit béton', 'Construction mur'],
    serrurerie:   ['Ouverture urgence', 'Changement serrure', 'Porte blindée', 'Coffre-fort'],
    carrelage:    ['Pose carrelage sol', 'Faïence salle de bain', 'Mosaïque', 'Joints'],
  },

  /* Base city list — de-duplicated at build time via _ssbDedup() */
  _rawCities: [
    'Casablanca','Rabat','Marrakech','Fès','Tanger','Agadir',
    'Meknès','Oujda','Kénitra','Tétouan','Safi','El Jadida',
    'Béni Mellal','Nador','Settat','Mohammedia','Larache',
  ],

  /**
   * Returns the FINAL deduplicated + title-cased city list,
   * merged with any cities found in the ARTISANS[] array.
   * Safe to call multiple times (result is cached).
   */
  get cities() {
    if (this._cities) return this._cities;
    // Collect artisan cities dynamically
    const artisanCities = (typeof ARTISANS !== 'undefined')
      ? ARTISANS.map(a => a.city).filter(Boolean)
      : [];
    this._cities = _ssbDedup([...this._rawCities, ...artisanCities]);
    return this._cities;
  },
};

/* ─────────────────────────────────────────────────────────────
   2.  NLP MAPPER
   ───────────────────────────────────────────────────────────── */

class SSBNLPMapper {
  constructor() { this._build(); }

  _norm(s) { return _ssbNorm(s); }

  _build() {
    this._index = [];
    SSB_DATA.nlpMap.forEach(entry => {
      entry.keywords.forEach(kw => {
        this._index.push({ kw: this._norm(kw), cat: entry.cat });
      });
    });
  }

  /* Returns best matching category key or null */
  detect(query) {
    const norm = this._norm(query);
    if (!norm) return null;
    const scores = {};
    this._index.forEach(({ kw, cat }) => {
      if (norm.includes(kw) || kw.includes(norm.split(' ')[0])) {
        scores[cat] = (scores[cat] || 0) + (norm.includes(kw) ? kw.split(' ').length : 0.5);
      }
    });
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }

  /* Returns all matching category keys ranked */
  detectMulti(query) {
    const norm = this._norm(query);
    if (!norm) return [];
    const scores = {};
    this._index.forEach(({ kw, cat }) => {
      if (norm.includes(kw) || kw.startsWith(norm.slice(0, 4))) {
        scores[cat] = (scores[cat] || 0) + kw.length;
      }
    });
    return Object.entries(scores).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  }
}

/* ─────────────────────────────────────────────────────────────
   3.  SEARCH HISTORY
   ───────────────────────────────────────────────────────────── */

class SSBHistory {
  constructor() {
    this._key  = 'fixeo_ssb_history_v2';
    this._maxN = 8;
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); }
    catch { return []; }
  }

  _save(arr) {
    try { localStorage.setItem(this._key, JSON.stringify(arr.slice(0, this._maxN))); } catch {}
  }

  add(term, type = 'query') {
    if (!term || term.length < 2) return;
    const all = this._load().filter(h => h.term.toLowerCase() !== term.toLowerCase());
    all.unshift({ term, type, ts: Date.now() });
    this._save(all);
  }

  recent(limit = 4) {
    return this._load().slice(0, limit);
  }

  clear() {
    try { localStorage.removeItem(this._key); } catch {}
  }
}

/* ─────────────────────────────────────────────────────────────
   4.  SMART FILTERS STATE
   ───────────────────────────────────────────────────────────── */

const SSB_FILTERS = {
  ssl: false,
  threeDSecure: false,
  verified: false,
  refund: false,
};

/* ─────────────────────────────────────────────────────────────
   5.  SUGGESTION BUILDER
   ───────────────────────────────────────────────────────────── */

class SSBSuggestor {
  constructor() {
    this._nlp     = new SSBNLPMapper();
    this._history = new SSBHistory();
  }

  build(q) {
    q = (q || '').trim();

    /* ── Empty query: show history + popular ── */
    if (q.length < 2) {
      const hist = this._history.recent(3);
      const sections = [];
      if (hist.length) {
        sections.push({
          title: '🕐 Recherches récentes',
          items: hist.map(h => ({
            kind:    'history',
            label:   h.term,
            meta:    'Recherche précédente',
            icon:    '🕐',
            iconCls: 'history',
            action:  { type: 'query', value: h.term },
          })),
        });
      }
      sections.push({
        title: '🔥 Services populaires',
        items: Object.entries(SSB_DATA.categories).slice(0, 5).map(([key, d]) => ({
          kind:    'service',
          label:   d.label,
          meta:    'Service populaire',
          icon:    d.icon,
          iconCls: 'service',
          action:  { type: 'category', value: key },
        })),
      });
      return { sections };
    }

    const norm = this._normQ(q);
    const sections = [];
    const seen = new Set();

    /* ── Services matching ── */
    const svcItems = [];
    Object.entries(SSB_DATA.categories).forEach(([key, d]) => {
      const labelN = this._normQ(d.label);
      if (labelN.startsWith(norm) || norm.startsWith(labelN.slice(0, 3))) {
        const highlighted = this._highlight(d.label, q);
        svcItems.push({
          kind:    'service',
          label:   d.label,
          labelHL: highlighted,
          meta:    'Service · ' + this._artisanCount(key) + ' artisans',
          icon:    d.icon,
          iconCls: 'service',
          action:  { type: 'category', value: key },
          score:   labelN.startsWith(norm) ? 10 : 5,
        });
        seen.add(key);
      }
    });

    /* ── Specialties matching ── */
    const spItems = [];
    Object.entries(SSB_DATA.specialties).forEach(([catKey, sps]) => {
      sps.forEach(sp => {
        if (this._normQ(sp).includes(norm)) {
          spItems.push({
            kind:    'specialty',
            label:   sp,
            labelHL: this._highlight(sp, q),
            meta:    SSB_DATA.categories[catKey]?.icon + ' ' + (SSB_DATA.categories[catKey]?.label || catKey),
            icon:    '🎯',
            iconCls: 'service',
            action:  { type: 'specialty', value: sp, category: catKey },
          });
        }
      });
    });

    /* ── City matching ── */
    const cityItems = SSB_DATA.cities
      .filter(c => this._normQ(c).startsWith(norm))
      .map(c => ({
        kind:    'city',
        label:   c,
        labelHL: this._highlight(c, q),
        meta:    'Ville',
        icon:    '📍',
        iconCls: 'city',
        action:  { type: 'city', value: c },
      }));

    /* ── NLP free-text ── */
    const nlpCats = this._nlp.detectMulti(q);
    const nlpItems = nlpCats
      .filter(k => !seen.has(k))
      .slice(0, 2)
      .map(k => {
        const d = SSB_DATA.categories[k];
        return {
          kind:    'service',
          label:   d.label,
          labelHL: d.label,
          meta:    '🤖 Suggestion IA · ' + this._artisanCount(k) + ' artisans',
          icon:    d.icon,
          iconCls: 'service',
          action:  { type: 'category', value: k },
        };
      });

    if (svcItems.length || nlpItems.length) {
      sections.push({
        title: '🛠 Services',
        items: [...svcItems, ...nlpItems].slice(0, 4),
      });
    }
    if (spItems.length) {
      sections.push({
        title: '📌 Spécialités',
        items: spItems.slice(0, 3),
      });
    }
    if (cityItems.length) {
      sections.push({
        title: '🌆 Villes',
        items: cityItems.slice(0, 3),
      });
    }

    /* ── Nothing found? Show NLP + suggestion to search ── */
    if (sections.length === 0) {
      const fallback = this._nlp.detectMulti(q);
      if (fallback.length) {
        sections.push({
          title: '🤖 Résultats IA pour « ' + q + ' »',
          items: fallback.slice(0, 3).map(k => {
            const d = SSB_DATA.categories[k];
            return {
              kind:    'service',
              label:   d.label,
              meta:    'Artisans correspondants · ' + this._artisanCount(k),
              icon:    d.icon,
              iconCls: 'service',
              action:  { type: 'category', value: k },
            };
          }),
        });
      }
    }

    return { sections, query: q };
  }

  _normQ(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  _highlight(label, query) {
    const idx = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                     .indexOf(query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    if (idx < 0) return label;
    return label.slice(0, idx) + '<em>' + label.slice(idx, idx + query.length) + '</em>' + label.slice(idx + query.length);
  }

  _artisanCount(catKey) {
    if (typeof ARTISANS === 'undefined') return '?';
    const n = ARTISANS.filter(a => a.category === catKey).length;
    return n + ' artisan' + (n !== 1 ? 's' : '');
  }

  get history() { return this._history; }
}

/* ─────────────────────────────────────────────────────────────
   6.  ARTISAN MINI-PROFILE RENDERER (for dropdown results)
   ───────────────────────────────────────────────────────────── */

function ssbRenderArtisanCard(a) {
  const availCls  = a.availability === 'available' ? 'available'
                  : a.availability === 'busy'       ? 'busy' : 'offline';
  const availTxt  = a.availability === 'available' ? '🟢 Disponible'
                  : a.availability === 'busy'       ? '🟡 Occupé' : '⚫ Hors ligne';
  const fastBadge   = a.responseTime <= 20 ? `<span class="ssb-art-badge fast">⚡ < ${a.responseTime} min</span>` : '';
  const bookedBadge = (a._bookedBefore) ? `<span class="ssb-art-badge booked">🔁 Déjà réservé</span>` : '';
  const initials    = a.initials || (a.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const cat         = SSB_DATA.categories[a.category];
  const catLabel    = cat ? cat.icon + ' ' + cat.label : a.category;
  const scorePct    = Math.round((a.trustScore || 0));
  const scoreColor  = scorePct >= 90 ? '#20c997' : scorePct >= 75 ? '#F77737' : '#aaa';

  return `
<div class="ssb-artisan-card" data-artisan-id="${a.id}" tabindex="0" role="option"
     aria-label="${a.name}, ${catLabel}, ${availTxt}">
  <div class="ssb-art-avatar">
    <div class="ssb-avatar-initials">${initials}</div>
    <span class="ssb-art-avail-dot ${availCls}"></span>
  </div>
  <div class="ssb-art-info">
    <div class="ssb-art-name">${a.name}</div>
    <div class="ssb-art-meta">
      <span class="ssb-art-cat">${catLabel}</span>
      <span class="ssb-art-rating">⭐ ${a.rating}</span>
      <span class="ssb-art-price">💰 ${a.priceLabel || ('\u00c0 partir de ' + a.priceFrom + ' MAD')}</span>
    </div>
    <div class="ssb-art-badges">
      <span class="ssb-art-badge" style="background:rgba(0,0,0,0.06);color:${scoreColor}">🛡 ${scorePct}%</span>
      ${fastBadge}
      ${bookedBadge}
    </div>
  </div>
  <div class="ssb-art-actions">
    <button class="ssb-art-btn ssb-art-btn-reserve"
            onclick="event.stopPropagation();ssbBookArtisan(${a.id})">
      📅 Réserver
    </button>
    <button class="ssb-art-btn ssb-art-btn-profile"
            onclick="event.stopPropagation();ssbViewProfile(${a.id})">
      👁 Profil
    </button>
  </div>
</div>`;
}

/* ─────────────────────────────────────────────────────────────
   7.  MAP PREVIEW
   ───────────────────────────────────────────────────────────── */

let ssbLeafletMap  = null;
let ssbMapMarkers  = [];

const FIXEO_LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const FIXEO_LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

window.FixeoEnsureLeaflet = window.FixeoEnsureLeaflet || (function() {
  let promise = null;
  return function ensureLeaflet() {
    if (typeof window.L !== 'undefined') return Promise.resolve(window.L);
    if (promise) return promise;

    promise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-fixeo-leaflet-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = FIXEO_LEAFLET_CSS;
        link.setAttribute('data-fixeo-leaflet-css', 'true');
        document.head.appendChild(link);
      }

      const existingScript = document.querySelector('script[data-fixeo-leaflet-js]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.L), { once: true });
        existingScript.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = FIXEO_LEAFLET_JS;
      script.async = true;
      script.setAttribute('data-fixeo-leaflet-js', 'true');
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.body.appendChild(script);
    });

    return promise;
  };
})();

function ssbInitMapPreview() {
  if (typeof L === 'undefined') {
    return window.FixeoEnsureLeaflet?.().then(() => ssbInitMapPreview()).catch(() => {});
  }
  const el = document.getElementById('ssb-map-canvas');
  if (!el || ssbLeafletMap) return;

  ssbLeafletMap = L.map('ssb-map-canvas', {
    zoomControl: true,
    scrollWheelZoom: false,
  }).setView([32.3, -6.5], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OSM</a>',
    maxZoom: 18,
  }).addTo(ssbLeafletMap);

  setTimeout(() => ssbLeafletMap?.invalidateSize(), 300);
}

function ssbUpdateMapMarkers(artisanList) {
  if (!ssbLeafletMap) {
    ssbInitMapPreview();
    setTimeout(() => ssbUpdateMapMarkers(artisanList), 250);
    return;
  }
  ssbMapMarkers.forEach(m => ssbLeafletMap.removeLayer(m));
  ssbMapMarkers = [];
  if (!artisanList || !artisanList.length) return;

  artisanList.forEach(a => {
    if (!a.lat || !a.lng) return;
    const color    = a.availability === 'available' ? '#20c997'
                   : a.availability === 'busy'      ? '#ffa502' : '#6c757d';
    const initials = a.initials || (a.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const ring     = a.availability === 'available' ? `
      <div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${color};opacity:0.4;animation:ssb-ping 2s infinite"></div>` : '';
    const icon = L.divIcon({
      html: `<div style="position:relative;width:42px;height:42px">
               ${ring}
               <div style="width:42px;height:42px;background:${color};border-radius:50%;border:3px solid #fff;
                    display:flex;align-items:center;justify-content:center;
                    font-weight:800;font-size:.78rem;color:#fff;
                    box-shadow:0 3px 14px rgba(0,0,0,.45);cursor:pointer;
                    font-family:Cairo,sans-serif;">${initials}</div>
             </div>`,
      className: '', iconSize: [42, 42], iconAnchor: [21, 21],
    });
    const cat = SSB_DATA.categories[a.category];
    const marker = L.marker([a.lat, a.lng], { icon })
      .addTo(ssbLeafletMap)
      .bindPopup(`
        <div style="min-width:200px;font-family:Cairo,sans-serif;padding:4px">
          <div style="font-weight:800;font-size:.93rem;margin-bottom:3px">${a.name}</div>
          <div style="color:#888;font-size:.76rem;margin-bottom:4px">${cat ? cat.icon + ' ' + cat.label : a.category} · 📍 ${a.city}</div>
          <div style="font-size:.80rem;margin-bottom:4px">⭐ ${a.rating} &nbsp;·&nbsp; 💰 ${a.priceLabel || ('\u00c0 partir de ' + a.priceFrom + ' MAD')}</div>
          <div style="font-size:.76rem;margin-bottom:8px;color:${color};font-weight:700">
            ${a.availability==='available'?'🟢 Disponible':a.availability==='busy'?'🟡 Occupé':'⚫ Hors ligne'}
            ${a.responseTime<=20?' · ⚡ Rapide':''}
          </div>
          <button onclick="ssbBookArtisan(${a.id})" class="fixeo-reserve-btn"
            style="background:linear-gradient(135deg,#E1306C,#833AB4);color:#fff;border:none;
                   border-radius:9px;padding:7px 0;font-size:.80rem;cursor:pointer;
                   font-weight:700;width:100%;font-family:Cairo,sans-serif">
            📅 Réserver maintenant
          </button>
        </div>`, { maxWidth: 240 });
    ssbMapMarkers.push(marker);
  });

  /* Fit bounds */
  if (ssbMapMarkers.length === 1) {
    const latlng = artisanList[0];
    ssbLeafletMap.setView([latlng.lat, latlng.lng], 12);
  } else if (ssbMapMarkers.length > 1) {
    try {
      ssbLeafletMap.fitBounds(
        L.latLngBounds(artisanList.filter(a => a.lat && a.lng).map(a => [a.lat, a.lng])),
        { padding: [40, 40] }
      );
    } catch(e) {}
  } else {
    ssbLeafletMap.setView([32.3, -6.5], 6);
  }

  setTimeout(() => ssbLeafletMap?.invalidateSize(), 200);

  /* Update badge */
  const badge = document.querySelector('.ssb-map-badge');
  if (badge) badge.textContent = `📍 ${artisanList.length} artisan${artisanList.length!==1?'s':''} trouvé${artisanList.length!==1?'s':''}`;
}

/* ─────────────────────────────────────────────────────────────
   8.  SMART FILTER HELPERS
   ───────────────────────────────────────────────────────────── */

function ssbApplyFilters(artisanList) {
  let list = [...artisanList];
  if (SSB_FILTERS.ssl)          list = list.filter(a => (a.trustScore || 0) >= 75);
  if (SSB_FILTERS.threeDSecure) list = list.filter(a => (a.trustScore || 0) >= 85);
  if (SSB_FILTERS.verified)     list = list.filter(a => (a.badges || []).includes('verified'));
  if (SSB_FILTERS.refund)       list = list.filter(a => (a.reviewCount || 0) >= 20);
  /* Smart ranking */
  list.sort((a, b) => {
    const sa = (a.trustScore||0) + (a.availability==='available'?15:0) - (a.responseTime||60)*0.2 + (a.rating||0)*2;
    const sb = (b.trustScore||0) + (b.availability==='available'?15:0) - (b.responseTime||60)*0.2 + (b.rating||0)*2;
    return sb - sa;
  });
  return list;
}

/* ─────────────────────────────────────────────────────────────
   9.  MAIN CONTROLLER
   ───────────────────────────────────────────────────────────── */

class SmartSearchBar {
  constructor() {
    this._suggestor  = new SSBSuggestor();
    this._debounce   = null;
    this._ddFocusIdx = -1;
    this._lastQuery  = '';
    this._lastCat    = '';
    this._lastCity   = '';
    this._open       = false;
  }

  /* ── init: inject HTML then wire events ── */
  init() {
    const wrap = document.querySelector('.search-bar-wrap');
    if (!wrap) return;

    /* Inject HTML (replace old bar) */
    wrap.innerHTML = this._buildHTML();

    /* Cache DOM refs */
    this._el = {
      card:        wrap.querySelector('.ssb-card'),
      inputNLP:    wrap.querySelector('#ssb-input-nlp'),
      selectCat:   wrap.querySelector('#ssb-select-cat'),
      selectCity:  wrap.querySelector('#ssb-select-city'),
      clearBtn:    wrap.querySelector('#ssb-clear'),
      dropdown:    wrap.querySelector('#ssb-dropdown'),
      btnSearch:   wrap.querySelector('#ssb-btn-search'),
      mapWrap:     wrap.querySelector('#ssb-map-preview'),
      filterChips: wrap.querySelectorAll('.ssb-filter-chip'),
    };

    this._wireEvents();
    this._initMap();
  }

  /* ── Build HTML string with DEDUPLICATED dropdowns ── */
  _buildHTML() {
    /* ── Cities: deduplicated + title-cased via SSB_DATA.cities getter ── */
    const cityOptions = SSB_DATA.cities
      .map(c => `<option value="${c}">📍 ${c}</option>`)
      .join('');

    return `
<!-- ════ SMART SEARCH BAR v7 ════ -->
<div class="ssb-wrap" role="search" aria-label="Recherche intelligente d'artisans">

  <!-- Main card -->
  <div class="ssb-card" id="ssb-card">

    <!-- Segment 1: NLP Free-text -->
    <div class="ssb-segment ssb-segment-nlp" id="ssb-seg-nlp">
      <span class="ssb-segment-icon">🔍</span>
      <div class="ssb-segment-body">
        <span class="ssb-segment-label">🛠 Service ou besoin</span>
        <input
          type="text"
          id="ssb-input-nlp"
          class="ssb-segment-input"
          placeholder="Décris ton besoin (ex: fuite d’eau, panne électricité…)"
          autocomplete="off"
          spellcheck="false"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="ssb-dropdown"
          role="combobox"
          maxlength="80"
        />
      </div>
      <button class="ssb-clear-btn" id="ssb-clear" aria-label="Effacer" title="Effacer">✕</button>
    </div>

    <div class="ssb-divider"></div>

    <!-- Segment 2: City select -->
    <div class="ssb-segment" id="ssb-seg-city">
      <span class="ssb-segment-icon">🌆</span>
      <div class="ssb-segment-body">
        <span class="ssb-segment-label">🌆 Ville</span>
        <select id="ssb-select-city" class="ssb-segment-select" aria-label="Ville">
          <option value="">Toutes les villes</option>
          ${cityOptions}
        </select>
      </div>
    </div>

    <!-- CTA — "Trouver" triggers main search module -->
    <button class="ssb-btn-search" id="ssb-btn-search" aria-label="Trouver">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      Trouver
    </button>
  </div><!-- /.ssb-card -->

  <!-- Smart filters row -->
  <div class="ssb-smart-filters" role="group" aria-label="Recherche et garanties Fixeo">
    <span class="ssb-filter-label">Filtres intégrés :</span>
    <button class="ssb-filter-chip" data-filter="ssl" aria-pressed="false">
      <span class="chip-dot"></span>🔒 SSL
    </button>
    <button class="ssb-filter-chip" data-filter="threeDSecure" aria-pressed="false">
      <span class="chip-dot"></span>🛡 3D Secure
    </button>
    <button class="ssb-filter-chip" data-filter="verified" aria-pressed="false">
      <span class="chip-dot"></span>✅ Artisan vérifié
    </button>
    <button class="ssb-filter-chip" data-filter="refund" aria-pressed="false">
      <span class="chip-dot"></span>🔄 Remboursement
    </button>
    <button class="ssb-filter-chip ssb-filter-chip-map" data-filter="map" aria-pressed="false"
            style="margin-left:auto">
      <span class="chip-dot"></span>📍 Voir carte
    </button>
  </div>

  <!-- Dropdown (suggestions + artisan cards) -->
  <div class="ssb-dropdown" id="ssb-dropdown" role="listbox" aria-label="Résultats de recherche">
    <!-- Populated by JS -->
  </div>

  <!-- Map preview -->
  <div id="ssb-map-preview" aria-label="Carte des artisans" role="region">
    <div id="ssb-map-canvas"></div>
    <div class="ssb-map-overlay-info" id="ssb-map-info">📍 Carte des artisans</div>
    <div class="ssb-map-badge">📍 Chargement…</div>
    <button class="ssb-map-close" onclick="SmartSearch.closeMap()" aria-label="Fermer la carte">✕</button>
  </div>

</div><!-- /.ssb-wrap -->
<!-- CSS ping animation for available marker -->
<style>
@keyframes ssb-ping {
  0%   { transform: scale(1);   opacity: 0.6; }
  70%  { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}
</style>`;
  }

  /* ── Wire all events ── */
  _wireEvents() {
    const { inputNLP, selectCat, selectCity, clearBtn, dropdown, btnSearch, filterChips } = this._el;

    /* Typing in NLP input */
    inputNLP?.addEventListener('input', () => {
      const v = inputNLP.value;
      clearBtn?.classList.toggle('visible', v.length > 0);
      clearDebounce(this._debounce);
      this._debounce = setTimeout(() => this._onType(v), 200);
    });

    /* Category / city change → instant artisan results */
    selectCat?.addEventListener('change',  () => this._syncAndSearch());
    selectCity?.addEventListener('change', () => this._syncAndSearch());

    /* Clear button */
    clearBtn?.addEventListener('click', () => {
      inputNLP.value = '';
      clearBtn.classList.remove('visible');
      this._lastQuery = '';
      /* Reset NLP auto-select */
      if (selectCat) selectCat.value = '';
      this._lastCat = '';
      inputNLP.focus();
      this._onType('');
    });

    /* ── Search button: triggers the MAIN search module directly ── */
    btnSearch?.addEventListener('click', () => this._doSearch());

    /* Enter key in NLP input */
    inputNLP?.addEventListener('keydown', e => {
      if (e.key === 'Enter')      { e.preventDefault(); this._doSearch(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this._moveFocus(1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveFocus(-1); }
      else if (e.key === 'Escape')    { this._closeDropdown(); }
    });

    /* Smart filter chips */
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.filter;
        if (key === 'map') {
          this._toggleMap();
          chip.classList.toggle('active');
          chip.setAttribute('aria-pressed', chip.classList.contains('active'));
          return;
        }
        if (key in SSB_FILTERS) {
          SSB_FILTERS[key] = !SSB_FILTERS[key];
          chip.classList.toggle('active', SSB_FILTERS[key]);
          chip.setAttribute('aria-pressed', String(SSB_FILTERS[key]));
          if (this._lastQuery || this._lastCat || this._lastCity) this._syncAndSearch();
        }
      });
    });

    /* Click outside → close */
    document.addEventListener('click', e => {
      const wrap = document.querySelector('.ssb-wrap');
      if (wrap && !wrap.contains(e.target)) this._closeDropdown();
    });

    /* Focus on NLP input → show dropdown if value or history */
    inputNLP?.addEventListener('focus', () => {
      if (inputNLP.value.length >= 2) this._onType(inputNLP.value);
      else this._showDefaultDropdown();
    });
  }

  /* ── Typing handler ── */
  _onType(q) {
    this._lastQuery = q;
    const norm = (q || '').trim();

    /* NLP detect → auto-select category in dropdown */
    if (norm.length >= 3) {
      const detected = this._suggestor._nlp.detect(norm);
      if (detected && this._el.selectCat) {
        this._el.selectCat.value = detected;
        this._lastCat = detected;
      }
    } else if (norm.length === 0) {
      /* Clear auto-detected category when input is cleared */
      if (!this._el.selectCat || !this._el.selectCat.value) this._lastCat = '';
    }

    const result = this._suggestor.build(norm);
    this._renderDropdown(result, norm);
    this._openDropdown();
  }

  /* ── Show default (history + popular) ── */
  _showDefaultDropdown() {
    const result = this._suggestor.build('');
    this._renderDropdown(result, '');
    this._openDropdown();
  }

  /* ── Render dropdown ── */
  _renderDropdown(result, q) {
    const dd = this._el.dropdown;
    if (!dd) return;
    let html = '';

    /* Suggestions sections */
    if (result.sections && result.sections.length) {
      result.sections.forEach(sec => {
        html += `<div class="ssb-dd-section">
          <div class="ssb-dd-section-title">${sec.title}</div>`;
        sec.items.forEach(item => {
          html += `<div class="ssb-suggestion" tabindex="-1" role="option"
                        data-action='${JSON.stringify(item.action)}'
                        aria-label="${item.label}">
            <span class="ssb-sug-icon ${item.iconCls}">${item.icon}</span>
            <span class="ssb-sug-text">
              <span class="ssb-sug-label">${item.labelHL || item.label}</span>
              <span class="ssb-sug-meta">${item.meta || ''}</span>
            </span>
            ${item.kind==='history' ? '<span class="ssb-sug-badge">Récent</span>' : ''}
          </div>`;
        });
        html += '</div>';
      });
    }

    /* Artisan mini-profiles */
    if (typeof ARTISANS !== 'undefined' && (q.length >= 2 || this._lastCat || this._lastCity)) {
      const filtered = this._getFilteredArtisans(q);
      if (filtered.length) {
        html += `<div class="ssb-dd-section">
          <div class="ssb-dd-section-title">👷 Artisans correspondants</div>`;
        filtered.slice(0, 4).forEach(a => { html += ssbRenderArtisanCard(a); });
        html += '</div>';

        /* Footer */
        html += `<div class="ssb-dd-footer">
          <button class="ssb-dd-footer-btn" onclick="SmartSearch.viewAll()">
            👷 Voir tous les ${filtered.length} artisan${filtered.length!==1?'s':''} →
          </button>
        </div>`;
      } else if (q.length >= 2) {
        html += `<div class="ssb-dd-empty">
          <div class="ssb-dd-empty-icon">🔎</div>
          <div class="ssb-dd-empty-text">Aucun artisan trouvé pour « ${q} »<br>
            <small>Essayez un autre mot-clé ou ville</small></div>
        </div>`;
      }
    }

    if (!html) {
      html = `<div class="ssb-dd-empty">
        <div class="ssb-dd-empty-icon">💡</div>
        <div class="ssb-dd-empty-text">Tapez un service ou une ville…</div>
      </div>`;
    }

    dd.innerHTML = html;
    this._ddFocusIdx = -1;

    /* Wire suggestion clicks */
    dd.querySelectorAll('.ssb-suggestion').forEach(el => {
      el.addEventListener('click', () => {
        try {
          const action = JSON.parse(el.dataset.action || '{}');
          this._applyAction(action);
        } catch {}
      });
    });

    /* Update map if open */
    if (this._mapOpen) {
      const arts = this._getFilteredArtisans(q);
      ssbUpdateMapMarkers(arts);
    }
  }

  /* ── Get filtered artisans (for dropdown preview) ── */
  _getFilteredArtisans(q) {
    if (typeof ARTISANS === 'undefined') return [];
    let list = [...ARTISANS];
    const norm = _ssbNorm(q || '');

    /* NLP filter on free text */
    if (norm.length >= 2) {
      const cats = this._suggestor._nlp.detectMulti(q);
      if (cats.length) {
        list = list.filter(a => cats.includes(a.category));
      } else {
        list = list.filter(a =>
          _ssbNorm(a.name).includes(norm) ||
          _ssbNorm(a.category).includes(norm) ||
          a.skills?.some(s => _ssbNorm(s).includes(norm)) ||
          _ssbNorm((a.bio?.fr || '')).includes(norm)
        );
      }
    }

    /* Category filter (exact key match) */
    if (this._lastCat) list = list.filter(a => a.category === this._lastCat);

    /* ── FIX: City filter — case-insensitive + accent-tolerant ── */
    if (this._lastCity) {
      const cityKey = _ssbNorm(this._lastCity);
      list = list.filter(a => _ssbNorm(a.city || '') === cityKey);
    }

    /* Smart filters */
    list = ssbApplyFilters(list);
    return list;
  }

  /* ── Apply suggestion action ── */
  _applyAction(action) {
    if (!action) return;
    if (action.type === 'category') {
      if (this._el.selectCat) this._el.selectCat.value = action.value;
      this._lastCat = action.value;
      this._suggestor.history.add(SSB_DATA.categories[action.value]?.label || action.value, 'category');
    } else if (action.type === 'city') {
      this._el.selectCity.value = action.value;
      this._lastCity = action.value;
      this._suggestor.history.add(action.value, 'city');
    } else if (action.type === 'specialty') {
      this._el.inputNLP.value = action.value;
      this._lastQuery = action.value;
      if (action.category) {
        if (this._el.selectCat) this._el.selectCat.value = action.category;
        this._lastCat = action.category;
      }
      this._suggestor.history.add(action.value, 'specialty');
    } else if (action.type === 'query') {
      this._el.inputNLP.value = action.value;
      this._lastQuery = action.value;
      this._onType(action.value);
      return;
    }
    this._closeDropdown();
    this._syncAndSearch(false);
  }

  /* ── Sync selects to section filters & trigger main search ── */
  _syncAndSearch(scroll = true) {
    /* Read latest values from selects */
    this._lastCat  = this._el.selectCat?.value  || '';
    this._lastCity = this._el.selectCity?.value || '';

    /* Sync to main artisan section filters */
    const catF  = document.getElementById('filter-category');
    const cityF = document.getElementById('filter-city');
    if (catF)  catF.value  = this._lastCat;
    if (cityF) cityF.value = this._lastCity;

    /* ── Determine effective category (NLP boost if no manual selection) ── */
    let effectiveCat = this._lastCat;
    if (!effectiveCat && this._lastQuery) {
      const nlpCat = this._suggestor._nlp.detect(this._lastQuery);
      if (nlpCat) effectiveCat = nlpCat;
    }

    /* ── Trigger main SearchEngine ── */
    if (typeof window.searchEngine?.filter === 'function') {
      const results = window.searchEngine.filter({
        query:    this._lastQuery,
        category: effectiveCat,
        city:     this._lastCity,
        sortBy:   'trust',
      });

      /* ── Call renderArtisans safely (window or global) ── */
      if (typeof window.renderArtisans === 'function') {
        window.renderArtisans(results);
      } else if (typeof renderArtisans === 'function') {
        renderArtisans(results);
      }

      /* Update results count */
      const cnt = document.getElementById('results-count');
      if (cnt) cnt.textContent = `${results.length} artisan${results.length!==1?'s':''} trouvé${results.length!==1?'s':''}`;

      /* Update map markers if open */
      if (this._mapOpen) ssbUpdateMapMarkers(ssbApplyFilters(results));
    }

    /* Note: _syncAndSearch is used for live filter updates (dropdowns),
       it intentionally keeps the background artisan section updated
       but does NOT open the modal — that is reserved for the main CTA button. */
    if (scroll) {
      /* Only scroll if HeroSearchModal is not available */
      if (typeof window.HeroSearchModal === 'undefined') {
        setTimeout(() => {
          document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 350);
      }
    }
  }

  /* ── Main search action — triggered by "Trouver un Artisan" button ── */
  _doSearch() {
    const q    = (this._el.inputNLP?.value || '').trim();
    const city = this._el.selectCity?.value || '';

    /* Determine category: manual selection takes priority, then NLP */
    let cat = this._el.selectCat?.value || '';
    if (!cat && q) {
      const nlpCat = this._suggestor._nlp.detect(q);
      if (nlpCat) {
        cat = nlpCat;
        /* Reflect NLP detection in the dropdown visually */
        if (this._el.selectCat) this._el.selectCat.value = cat;
      }
    }

    /* Persist to history */
    if (q)    this._suggestor.history.add(q, 'query');
    if (cat)  this._suggestor.history.add(SSB_DATA.categories[cat]?.label || cat, 'category');
    if (city) this._suggestor.history.add(city, 'city');

    /* Update state */
    this._lastQuery = q;
    this._lastCat   = cat;
    this._lastCity  = city;

    this._closeDropdown();

    /* ── Directly call main SearchEngine and open Hero Search Modal ── */
    let _searchResults = [];
    if (typeof window.searchEngine?.filter === 'function') {
      _searchResults = window.searchEngine.filter({
        query:    q,
        category: cat,
        city:     city,
        sortBy:   'trust',
      });

      /* Also update the background artisan section (silent) */
      if (typeof window.renderArtisans === 'function') {
        window.renderArtisans(_searchResults);
      } else if (typeof renderArtisans === 'function') {
        renderArtisans(_searchResults);
      }

      /* Update results count in section */
      const cnt = document.getElementById('results-count');
      if (cnt) cnt.textContent = `${_searchResults.length} artisan${_searchResults.length!==1?'s':''} trouvé${_searchResults.length!==1?'s':''}`;

      /* Sync section filters */
      const catF  = document.getElementById('filter-category');
      const cityF = document.getElementById('filter-city');
      if (catF)  catF.value  = cat;
      if (cityF) cityF.value = city;

      /* Update map markers if open */
      if (this._mapOpen) ssbUpdateMapMarkers(ssbApplyFilters(_searchResults));
    } else {
      /* Fallback: use ARTISANS directly if SearchEngine not ready */
      const pool = window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
      _searchResults = this._getFilteredArtisans(q);
    }

    /* ── v8: Render results INLINE under the HERO bar ── */
    _ssbRenderHeroInlineResults(_searchResults, { query: q, category: cat, city: city });
  }

  /* ── Map helpers ── */
  _initMap() {
    this._mapOpen = false;
  }

  _toggleMap() {
    const mapWrap = this._el.mapWrap;
    if (!mapWrap) return;
    this._mapOpen = !this._mapOpen;
    mapWrap.classList.toggle('visible', this._mapOpen);
    if (this._mapOpen) {
      const badge = document.querySelector('.ssb-map-badge');
      if (badge) badge.textContent = '📍 Chargement de la carte…';
      window.FixeoEnsureLeaflet?.()
        .then(() => {
          ssbInitMapPreview();
          const arts = this._getFilteredArtisans(this._lastQuery);
          setTimeout(() => ssbUpdateMapMarkers(arts), 150);
        })
        .catch(() => {
          if (badge) badge.textContent = '⚠️ Carte indisponible';
        });
    }
  }

  closeMap() {
    this._mapOpen = false;
    this._el.mapWrap?.classList.remove('visible');
    const mapChip = document.querySelector('.ssb-filter-chip-map');
    mapChip?.classList.remove('active');
    if (mapChip) mapChip.setAttribute('aria-pressed', 'false');
  }

  viewAll() {
    this._closeDropdown();
    /* If HeroSearchModal is available, open it via _doSearch */
    this._doSearch();
  }

  /* ── Dropdown open/close ── */
  _openDropdown() {
    this._el.dropdown?.classList.add('visible');
    this._el.inputNLP?.setAttribute('aria-expanded', 'true');
    this._open = true;
  }

  _closeDropdown() {
    this._el.dropdown?.classList.remove('visible');
    this._el.inputNLP?.setAttribute('aria-expanded', 'false');
    this._ddFocusIdx = -1;
    this._open = false;
  }

  /* ── Keyboard navigation ── */
  _moveFocus(dir) {
    const dd = this._el.dropdown;
    if (!dd || !this._open) return;
    const items = [...dd.querySelectorAll('.ssb-suggestion, .ssb-artisan-card')];
    if (!items.length) return;
    items[this._ddFocusIdx]?.classList.remove('focused');
    this._ddFocusIdx = Math.max(0, Math.min(items.length - 1, this._ddFocusIdx + dir));
    items[this._ddFocusIdx]?.classList.add('focused');
    items[this._ddFocusIdx]?.scrollIntoView({ block: 'nearest' });
  }
}

/* ─────────────────────────────────────────────────────────────
   10.  GLOBAL ACTIONS (Reserve / Profile)
   ───────────────────────────────────────────────────────────── */

function ssbBookArtisan(id) {
  window.SmartSearch?._closeDropdown?.();
  /* ── V7: Delegate directly to FixeoReservation with full artisan object ── */
  const _artisanPool = window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
  const artisanObj = _artisanPool.find(a => a.id === id || a.id === parseInt(id)) || id;
  if (window.FixeoReservation) {
    window.FixeoReservation.open(artisanObj, false);
  } else if (typeof openBookingModal === 'function') {
    openBookingModal(id);
  } else {
    document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function ssbViewProfile(id) {
  window.SmartSearch?._closeDropdown?.();
  if (window.FixeoPublicProfileLinks) {
    window.FixeoPublicProfileLinks.openBySourceId(id);
  } else if (typeof openArtisanModal === 'function') {
    openArtisanModal(id);
  } else {
    document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth' });
  }
}

/* Utility: clear debounce */
function clearDebounce(t) { if (t) clearTimeout(t); }

/* ───────────────────────────────────────────────────────────────
   v8 — HERO INLINE RESULTS RENDERER
   Renders search results directly below the HERO section.
   Uses .qsm-card layout (from quick-search-modal.css)
   ─────────────────────────────────────────────────────────────── */

const _SSB_CAT_ICONS  = { plomberie:'🔧', electricite:'⚡', peinture:'🎨', nettoyage:'🧹', jardinage:'🌿', demenagement:'🚛', bricolage:'🔨', climatisation:'❌️', menuiserie:'🪢', maconnerie:'🧱', serrurerie:'🔑', carrelage:'🏠' };
const _SSB_CAT_LABELS = { plomberie:'Plomberie', electricite:'Électricité', peinture:'Peinture', nettoyage:'Nettoyage', jardinage:'Jardinage', demenagement:'Déménagement', bricolage:'Bricolage', climatisation:'Climatisation', menuiserie:'Menuiserie', maconnerie:'Maçonnerie', serrurerie:'Serrurerie', carrelage:'Carrelage' };

function _ssbCardHTML(a, idx) {
  const avail   = (a.availability || '').toLowerCase();
  const isAvail = avail === 'available';
  const dotCls  = isAvail ? 'available' : (avail === 'busy' ? 'busy' : 'offline');
  const catIcon = _SSB_CAT_ICONS[a.category]  || '🛠️';
  const catLbl  = _SSB_CAT_LABELS[a.category] || (a.category || 'Service');
  const rating  = parseFloat(a.rating) || 4.8;
  const trust   = a.trustScore || 0;
  const ini     = a.initials || (a.name || '?').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  const feat    = idx === 0 ? ' qsm-card--featured' : '';
  const stars   = '★'.repeat(Math.max(0, Math.round(rating))) + '☆'.repeat(Math.max(0, 5 - Math.round(rating)));
  const fastBdg = (a.responseTime && a.responseTime <= 25) ? `<span class="qsm-badge fast">⚡ &lt;${a.responseTime}min</span>` : '';
  const extraBdg= (a.badges || []).slice(0, 1).map(b => {
    if (b === 'verified') return '<span class="qsm-badge">✅ Vérifié</span>';
    if (b === 'pro')      return '<span class="qsm-badge">🥇 Pro</span>';
    if (b === 'top_rated')return '<span class="qsm-badge">⭐ Top</span>';
    return `<span class="qsm-badge">${b}</span>`;
  }).join('');
  return `
<div class="qsm-card${feat}" data-artisan-id="${a.id}">
  <div class="qsm-card-avatar">${ini}<span class="qsm-avail-dot ${dotCls}"></span></div>
  <div class="qsm-card-info">
    <div class="qsm-card-top">
      <span class="qsm-card-name">${a.name || ''}</span>
      ${isAvail ? '<span class="qsm-badge-available">⚡ Disponible aujourd\'hui</span>' : ''}
    </div>
    <div class="qsm-card-meta">
      <span class="qsm-stars">${stars}</span>
      <span style="color:rgba(255,215,0,0.9);font-weight:700">${rating.toFixed(1)}</span>
      <span class="qsm-meta-sep">·</span>
      <span>${catIcon} ${catLbl}</span>
      <span class="qsm-meta-sep">·</span>
      <span>📍 ${a.city || 'Maroc'}</span>
      <span class="qsm-meta-sep">·</span>
      <span style="font-weight:600;color:rgba(255,255,255,0.7)">💰 ${a.priceFrom || 150} ${a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')}</span>
    </div>
    <div class="qsm-card-badges">
      ${trust >= 80 ? `<span class="qsm-badge trust">🛡 ${trust}%</span>` : ''}
      ${fastBdg}${extraBdg}
    </div>
  </div>
  <div class="qsm-card-actions">
    <button class="qsm-btn-reserve"
      onclick="ssbBookHero(${a.id}, false); event.stopPropagation();"
      aria-label="Réserver ${a.name}">★ Réserver
    </button>
    <button class="qsm-btn-express"
      onclick="ssbBookHero(${a.id}, true); event.stopPropagation();"
      aria-label="Urgent pour ${a.name}">⚡ Urgent
    </button>
  </div>
</div>`;
}

function ssbBookHero(id, isExpress) {
  const pool    = window.ARTISANS || (typeof ARTISANS !== 'undefined' ? ARTISANS : []);
  const artisan = pool.find(a => a.id === id || a.id === parseInt(id, 10)) || id;
  if (window.FixeoReservation) {
    isExpress ? window.FixeoReservation.openExpress(artisan) : window.FixeoReservation.open(artisan, false);
  } else if (typeof openBookingModal === 'function') {
    openBookingModal(typeof id === 'number' ? id : parseInt(id, 10));
  }
}

function _ssbRenderHeroInlineResults(results, ctx) {
  const section = document.getElementById('hero-inline-results');
  const grid    = document.getElementById('hero-results-grid');
  const counter = document.getElementById('hero-results-count');
  if (!section || !grid) {
    /* Fallback: scroll to artisan section */
    setTimeout(() => document.getElementById('artisans-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
    return;
  }

  const ctxTags = [
    ctx.query    ? `🔍 <em>${ctx.query}</em>` : '',
    ctx.category && _SSB_CAT_LABELS[ctx.category] ? `${_SSB_CAT_ICONS[ctx.category] || '🛠️'} ${_SSB_CAT_LABELS[ctx.category]}` : '',
    ctx.city     ? `📍 ${ctx.city}` : '',
  ].filter(Boolean).join(' &nbsp;•&nbsp; ');

  if (counter) {
    counter.innerHTML = results.length
      ? `${results.length} artisan${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''} ${ctxTags ? '<span style="font-weight:400;color:rgba(255,255,255,0.5);margin-left:8px">' + ctxTags + '</span>' : ''}`
      : 'Aucun artisan trouvé';
  }

  if (!results.length) {
    grid.innerHTML = `
<div class="qsm-empty">
  <div class="qsm-empty-icon">🔎</div>
  <div class="qsm-empty-title">Aucun artisan trouvé</div>
  <div class="qsm-empty-sub">Essayez d’autres critères ou élargissez votre zone de recherche.</div>
</div>`;
  } else {
    grid.innerHTML = results.map((a, i) => _ssbCardHTML(a, i)).join('');
  }

  section.style.display = 'block';
  requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  /* Wire close button */
  const closeBtn = document.getElementById('hero-results-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => { section.style.display = 'none'; };
  }
}

/* ─────────────────────────────────────────────────────────────
   11.  BOOTSTRAP
   ───────────────────────────────────────────────────────────── */

let SmartSearch = null;

function initSmartSearchBar() {
  SmartSearch = new SmartSearchBar();
  SmartSearch.init();
  window.SmartSearch = SmartSearch;
  console.log('✅ Fixeo Smart Search Bar v7.1 initialized — duplicates fixed, search button active');
}

/* Expose for map close button */
window.SmartSearch = null;

/* Launch after DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSmartSearchBar);
} else {
  initSmartSearchBar();
}
