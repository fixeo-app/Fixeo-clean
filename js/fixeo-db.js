/**
 * FIXEO DB — Couche de données persistante v1.0
 * =============================================
 * SOURCE UNIQUE DE VÉRITÉ pour tous les artisans.
 *
 * CLÉ: fixeo_artisans_db
 *
 * RÈGLES STRICTES:
 *   - Toutes les pages LISENT via FixeoDB.getAllArtisans()
 *   - Toutes les créations passent par FixeoDB.createArtisan()
 *   - window.ARTISANS est remplacé par un Proxy qui lit/écrit dans la DB
 *   - fixeo_admin_artisans_v21 reste lisible pour compatibilité legacy
 *     mais toutes les écritures vont dans fixeo_artisans_db
 *
 * PRIORITÉ DE CHARGEMENT: chargé EN PREMIER, avant tout autre script.
 */
;(function (window) {
  'use strict';

  var DB_KEY     = 'fixeo_artisans_db';
  var LEGACY_KEY = 'fixeo_admin_artisans_v21';
  var META_KEY   = 'fixeo_artisans_db_meta';
  var VERSION    = '1.0';

  /* ─── Utils ──────────────────────────────────────────────── */
  function safeJSON(v, fb) {
    try { return JSON.parse(v) ?? fb; } catch { return fb; }
  }

  function nowISO() { return new Date().toISOString(); }

  function log(msg) {
    if (window.__FIXEO_DB_DEBUG__) console.log('[FixeoDB]', msg);
  }

  /* ─── STORAGE ENGINE ────────────────────────────────────── */

  /**
   * Lire la DB depuis localStorage.
   * Retourne un tableau d'artisans (jamais null).
   */
  function _read() {
    var raw = localStorage.getItem(DB_KEY);
    if (!raw) return [];
    return safeJSON(raw, []);
  }

  /**
   * Écrire le tableau complet dans localStorage.
   * Tente une écriture compressée si QuotaExceeded.
   */
  function _write(artisans) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(artisans));
      _updateMeta({ count: artisans.length, updated_at: nowISO() });
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        // Tenter de libérer de la place en supprimant les données de session obsolètes
        _emergency_compact(artisans);
        return false;
      }
      console.error('[FixeoDB] Write error:', e);
      return false;
    }
  }

  function _emergency_compact(artisans) {
    // Supprimer les données non-critiques pour libérer de la place
    var removable = [
      'fixeo_search_history', 'fixeo_recent_views', 'fixeo_session_cache',
      LEGACY_KEY  // Supprimer legacy si DB principale est prioritaire
    ];
    removable.forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(artisans));
      log('Emergency compact succeeded');
    } catch (e2) {
      console.error('[FixeoDB] Storage full even after compact:', e2);
    }
  }

  function _updateMeta(patch) {
    var meta = safeJSON(localStorage.getItem(META_KEY), { version: VERSION, created_at: nowISO() });
    Object.assign(meta, patch);
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (_) {}
  }

  /* ─── ID GENERATOR ──────────────────────────────────────── */
  function _generateId() {
    // IDs 50000+ pour artisans créés via admin (évite collisions avec seeds 1000-1999 et master 2000-2366)
    var existing = _read();
    var maxId = 49999;
    existing.forEach(function(a) {
      var n = parseInt(String(a.id), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
    return String(maxId + 1);
  }

  /* ─── MIGRATION: legacy → DB ────────────────────────────── */
  function _migrateFromLegacy() {
    var dbRaw = localStorage.getItem(DB_KEY);
    if (dbRaw && dbRaw.length > 10) {
      log('DB already exists, skipping migration');
      return _read();
    }

    log('Migrating from legacy key ' + LEGACY_KEY + '...');
    var legacy = safeJSON(localStorage.getItem(LEGACY_KEY), []);

    // Merge with window.ARTISANS if available (runtime data)
    var runtime = Array.isArray(window.ARTISANS) ? window.ARTISANS : [];
    var seen = new Set(legacy.map(function(a) { return String(a.id); }));
    runtime.forEach(function(a) {
      var id = String(a.id || '');
      if (id && !seen.has(id)) {
        legacy.push(a);
        seen.add(id);
      }
    });

    if (legacy.length > 0) {
      _write(legacy);
      log('Migrated ' + legacy.length + ' artisans from legacy');
    }
    return legacy;
  }

  /* ─── PUBLIC API ────────────────────────────────────────── */

  /**
   * getAllArtisans() — Lire tous les artisans
   * @returns {Array} tableau d'artisans
   */
  function getAllArtisans() {
    return _read();
  }

  /**
   * saveArtisans(artisans) — Remplacer toute la DB
   * @param {Array} artisans
   * @returns {boolean} succès
   */
  function saveArtisans(artisans) {
    if (!Array.isArray(artisans)) {
      console.error('[FixeoDB] saveArtisans: expected array');
      return false;
    }
    var ok = _write(artisans);
    if (ok) {
      _syncLegacyKey(artisans);
      _syncWindowArtisans(artisans);
      _dispatchChange('save', { count: artisans.length });
    }
    return ok;
  }

  /**
   * createArtisan(data) — Créer un artisan + persister immédiatement
   * @param {Object} data — champs artisan (sans id)
   * @returns {Object} artisan créé avec id + created_at
   */
  function createArtisan(data) {
    var artisans = _read();
    var id = data.id ? String(data.id) : _generateId();

    // Vérifie unicité
    var existing = artisans.find(function(a) { return String(a.id) === id; });
    if (existing) {
      console.warn('[FixeoDB] createArtisan: id ' + id + ' already exists');
      return existing;
    }

    var artisan = Object.assign({
      id: id,
      created_at: nowISO(),
      updated_at: nowISO(),
      status: 'active',
      verified: false,
      claimed: false,
      claim_status: 'unclaimed',
      verification_status: 'unverified',
      availability: 'available',
      rating: 0,
      reviewCount: 0,
      priceType: 'fixed_estimate',
      priceUnit: 'intervention',
      _source: 'admin_created'
    }, data, {
      id: id,
      created_at: data.created_at || nowISO(),
      updated_at: nowISO()
    });

    artisans.push(artisan);
    _write(artisans);
    _syncLegacyKey(artisans);
    _syncWindowArtisans(artisans);
    _dispatchChange('create', { artisan: artisan });

    log('Created artisan: ' + artisan.name + ' (id=' + id + ')');
    return artisan;
  }

  /**
   * updateArtisan(id, patch) — Modifier un artisan existant
   * @returns {Object|null} artisan mis à jour ou null
   */
  function updateArtisan(artisanId, patch) {
    var artisans = _read();
    var idx = artisans.findIndex(function(a) { return String(a.id) === String(artisanId); });
    if (idx < 0) {
      console.warn('[FixeoDB] updateArtisan: id ' + artisanId + ' not found');
      return null;
    }

    artisans[idx] = Object.assign({}, artisans[idx], patch, {
      id: artisans[idx].id,  // jamais changer l'id
      updated_at: nowISO()
    });
    _write(artisans);
    _syncLegacyKey(artisans);
    _syncWindowArtisans(artisans);
    _dispatchChange('update', { artisanId: artisanId, patch: patch });

    return artisans[idx];
  }

  /**
   * deleteArtisan(id) — Supprimer un artisan
   * @returns {boolean}
   */
  function deleteArtisan(artisanId) {
    var artisans = _read();
    var before = artisans.length;
    artisans = artisans.filter(function(a) { return String(a.id) !== String(artisanId); });
    if (artisans.length === before) return false;
    _write(artisans);
    _syncLegacyKey(artisans);
    _syncWindowArtisans(artisans);
    _dispatchChange('delete', { artisanId: artisanId });
    return true;
  }

  /**
   * getArtisanById(id)
   * @returns {Object|null}
   */
  function getArtisanById(id) {
    return _read().find(function(a) { return String(a.id) === String(id); }) || null;
  }

  /**
   * mergeArtisans(incoming) — Ajouter des artisans sans écraser les existants
   * Utilisé par les loaders (seeds, master, etc.)
   * @returns {number} nombre d'artisans nouveaux ajoutés
   */
  function mergeArtisans(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return 0;
    var artisans = _read();
    var seen = new Set(artisans.map(function(a) { return String(a.id); }));
    var added = 0;
    incoming.forEach(function(a) {
      var id = String(a.id || '');
      if (id && !seen.has(id)) {
        artisans.push(Object.assign({ updated_at: nowISO() }, a));
        seen.add(id);
        added++;
      }
    });
    if (added > 0) {
      _write(artisans);
      _syncLegacyKey(artisans);
      _syncWindowArtisans(artisans);
      _dispatchChange('merge', { added: added, total: artisans.length });
      log('Merged ' + added + ' new artisans (total=' + artisans.length + ')');
    }
    return added;
  }

  /**
   * getStats() — Statistiques de la DB
   */
  function getStats() {
    var artisans = _read();
    var meta = safeJSON(localStorage.getItem(META_KEY), {});
    return {
      total:    artisans.length,
      claimed:  artisans.filter(function(a) { return a.claimed; }).length,
      verified: artisans.filter(function(a) { return a.verification_status === 'verified'; }).length,
      available:artisans.filter(function(a) {
        return a.availability === 'available' || a.availability === 'available_today';
      }).length,
      updated_at: meta.updated_at || null,
      version:    VERSION
    };
  }

  /**
   * reset() — Vider la DB (admin seulement)
   * Appeler reset(true) pour confirmation.
   */
  function reset(confirmed) {
    if (!confirmed) {
      console.warn('[FixeoDB] reset() requires reset(true) to confirm');
      return false;
    }
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(META_KEY);
    window.ARTISANS = [];
    _dispatchChange('reset', {});
    log('DB reset');
    return true;
  }

  /* ─── SYNC HELPERS ──────────────────────────────────────── */

  /**
   * Maintenir fixeo_admin_artisans_v21 synchronisé pour compatibilité.
   * Les scripts legacy lisent cette clé.
   */
  function _syncLegacyKey(artisans) {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(artisans));
    } catch (_) {
      // Si quota, la clé legacy est sacrifiée — DB principale est prioritaire
    }
  }

  /**
   * Mettre à jour window.ARTISANS en mémoire.
   * Tous les scripts qui lisent window.ARTISANS voient les données à jour.
   */
  function _syncWindowArtisans(artisans) {
    // Si window.ARTISANS est déjà un proxy ou tableau géré, on le met à jour
    if (window.ARTISANS && Array.isArray(window.ARTISANS)) {
      // Vider et repeupler en place (préserve les références)
      window.ARTISANS.splice(0, window.ARTISANS.length);
      artisans.forEach(function(a) { window.ARTISANS.push(a); });
    } else {
      window.ARTISANS = artisans.slice();
    }

    // Sync SearchEngine si disponible
    if (window.SearchEngine && Array.isArray(window.SearchEngine.artisans)) {
      window.SearchEngine.artisans.splice(0, window.SearchEngine.artisans.length);
      artisans.forEach(function(a) { window.SearchEngine.artisans.push(a); });
    }
  }

  function _dispatchChange(action, detail) {
    try {
      window.dispatchEvent(new CustomEvent('fixeo:db:change', {
        detail: Object.assign({ action: action }, detail)
      }));
    } catch (_) {}
  }

  /* ─── INTERCEPTEURS POUR WINDOW.ARTISANS ────────────────── */

  /**
   * Installer un intercepteur sur window.ARTISANS:
   * Toute affectation window.ARTISANS = [...] persiste dans la DB.
   */
  function _installArtisansProxy() {
    var _arr = _read(); // tableau live

    // Remplacer window.ARTISANS par notre tableau live
    // On ne peut pas utiliser Proxy sur le tableau global sans risque de casse,
    // donc on remplace l'affectation via Object.defineProperty sur window
    try {
      Object.defineProperty(window, 'ARTISANS', {
        get: function() { return _arr; },
        set: function(newVal) {
          if (!Array.isArray(newVal)) return;
          _arr.splice(0, _arr.length);
          newVal.forEach(function(a) { _arr.push(a); });
          // Persister: merge (ne pas écraser — favorise les patches)
          var artisans = _read();
          var seen = new Set(artisans.map(function(a) { return String(a.id); }));
          var added = 0;
          newVal.forEach(function(a) {
            var id = String(a.id || '');
            if (id && !seen.has(id)) { artisans.push(a); seen.add(id); added++; }
            else if (id) {
              // Update existing
              var idx = artisans.findIndex(function(x) { return String(x.id) === id; });
              if (idx >= 0) artisans[idx] = Object.assign({}, artisans[idx], a);
            }
          });
          _write(artisans);
          log('window.ARTISANS = [...] intercepted, persisted (' + artisans.length + ' total)');
        },
        configurable: true
      });
    } catch (e) {
      // Si déjà défini non-configurable, travailler avec le tableau en place
      log('Could not install proxy (already defined): ' + e.message);
      if (!window.ARTISANS) window.ARTISANS = _arr;
    }
  }

  /* ─── INITIALISATION ────────────────────────────────────── */

  function init() {
    log('Initializing FixeoDB v' + VERSION);

    // 1. Migrer depuis legacy si DB vide
    _migrateFromLegacy();

    // 2. Installer le proxy window.ARTISANS
    _installArtisansProxy();

    // 3. Charger dans window.ARTISANS
    var artisans = _read();
    _syncWindowArtisans(artisans);

    log('Loaded ' + artisans.length + ' artisans into window.ARTISANS');

    // 4. Écouter les changements cross-onglets
    window.addEventListener('storage', function(e) {
      if (e.key === DB_KEY && e.newValue) {
        var fresh = safeJSON(e.newValue, null);
        if (Array.isArray(fresh)) {
          _syncWindowArtisans(fresh);
          _dispatchChange('storage_sync', { count: fresh.length });
          log('Cross-tab sync: ' + fresh.length + ' artisans');
        }
      }
    });

    // 5. Exposer API publique
    window.FixeoDB = {
      version:        VERSION,
      DB_KEY:         DB_KEY,
      getAllArtisans:  getAllArtisans,
      saveArtisans:   saveArtisans,
      createArtisan:  createArtisan,
      updateArtisan:  updateArtisan,
      deleteArtisan:  deleteArtisan,
      getArtisanById: getArtisanById,
      mergeArtisans:  mergeArtisans,
      getStats:       getStats,
      reset:          reset,
      // Accès direct (utile pour debug)
      _read:  _read,
      _write: _write
    };

    // 6. Log stats
    var stats = getStats();
    console.info('[FixeoDB] Ready — ' + stats.total + ' artisans | ' +
                 stats.available + ' disponibles | ' + stats.claimed + ' revendiqués');
  }

  init();

})(window);
