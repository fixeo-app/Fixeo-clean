/**
 * fixeo-artisans-master-loader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads /data/artisans-master.json (qualified-master artisans, IDs 1000-1366)
 * and injects them into the Fixeo marketplace via the existing
 * replaceMarketplaceArtisans() + localStorage mechanisms.
 *
 * ZERO UI/CSS changes. Data only.
 * Real artisans (IDs 1-12 + art_demo_*) are always prioritized.
 * Qualified-master artisans supplement the live dataset.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'fixeo_admin_artisans_v21';
  var DATA_URL    = '/data/artisans-master.json';
  var _injected   = false;

  /* ── Convert qualified-master record to Fixeo internal format ── */
  function _toFixeoRecord(a) {
    return {
      id:           a.id,
      name:         a.name || 'Artisan',
      service:      a.service || 'bricolage',
      category:     a.service || 'bricolage',
      city:         a.city   || 'Casablanca',
      ville:        a.city   || 'Casablanca',
      rating:       typeof a.rating  === 'number' ? a.rating  : 4.7,
      reviews:      typeof a.reviews === 'number' ? a.reviews : 18,
      note:         typeof a.rating  === 'number' ? a.rating  : 4.7,
      avis:         typeof a.reviews === 'number' ? a.reviews : 18,
      verified:     a.verified !== false,
      verifie:      a.verified !== false,
      availability: a.availability || 'available',
      disponibilite:a.availability || 'available',
      phone:        a.phone || '',
      telephone:    a.phone || '',
      premium:      !!a.premium,
      badge:        a.badge  || 'Profil qualifié',
      experience:   a.experience || null,
      photo:        a.photo || '',
      avatar:       a.photo || '',
      _source:      'qualified-master',
      _isSeed:      true,   /* treated like seeds — real artisans take priority */
    };
  }

  /* ── Merge into existing array, dedup by ID ── */
  function _mergeArtisans(existing, incoming) {
    var existingIds = new Set(existing.map(function (a) { return String(a.id); }));
    var added = 0;
    incoming.forEach(function (a) {
      var sid = String(a.id);
      /* Skip if ID already exists (real artisan wins) */
      if (existingIds.has(sid)) return;
      /* Skip IDs 1-999 (reserved for real artisans) */
      var n = parseInt(sid, 10);
      if (!isNaN(n) && n > 0 && n < 1000) return;
      existing.push(a);
      existingIds.add(sid);
      added++;
    });
    return added;
  }

  /* ── Persist into localStorage so admin dashboard sees them ── */
  function _persistToStorage(records) {
    try {
      var stored = [];
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) stored = JSON.parse(raw) || [];
      } catch (e) { stored = []; }

      var storedIds = new Set(stored.map(function (a) { return String(a.id); }));
      var added = 0;
      records.forEach(function (r) {
        var sid = String(r.id);
        if (!storedIds.has(sid)) {
          stored.push(r);
          storedIds.add(sid);
          added++;
        }
      });
      if (added > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      }
      return added;
    } catch (e) {
      // localStorage full or unavailable — non-fatal
      return 0;
    }
  }

  /* ── Inject into window.ARTISANS + SearchEngine ── */
  function _injectIntoMarketplace(records) {
    var added = 0;

    /* 1. Try window.ARTISANS direct injection */
    if (window.ARTISANS && Array.isArray(window.ARTISANS)) {
      added = _mergeArtisans(window.ARTISANS, records);
    }

    /* 2. Try replaceMarketplaceArtisans (adds + dedups, triggers re-render) */
    if (typeof window.replaceMarketplaceArtisans === 'function') {
      try { window.replaceMarketplaceArtisans(records); } catch (e) {}
    }

    /* 3. Update SearchEngine if present */
    if (window.SearchEngine && Array.isArray(window.SearchEngine.artisans)) {
      _mergeArtisans(window.SearchEngine.artisans, records);
    }

    /* 4. Persist to localStorage for admin dashboard */
    _persistToStorage(records);

    /* 5. Fire update event so any listener can react */
    try {
      window.dispatchEvent(new Event('fixeo:marketplace-artisans-updated'));
    } catch (e) {}

    return added;
  }

  /* ── Main: fetch JSON + inject ── */
  function _load() {
    if (_injected) return;

    fetch(DATA_URL + '?v=qm1')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) return;
        _injected = true;
        var records = data.map(_toFixeoRecord);
        var added = _injectIntoMarketplace(records);
        if (window._fixeoDebug) {
          console.log('[artisans-master-loader] Loaded', data.length,
            'qualified artisans, injected', added);
        }
      })
      .catch(function (err) {
        if (window._fixeoDebug) {
          console.warn('[artisans-master-loader] Failed:', err.message);
        }
      });
  }

  /* ── Boot ── */
  function _boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(_load, 150);
      });
    } else {
      setTimeout(_load, 150);
    }

    /* Re-inject when marketplace updates (e.g. after API load) */
    window.addEventListener('fixeo:marketplace-artisans-updated', function () {
      if (!_injected) setTimeout(_load, 100);
    });
  }

  _boot();

})();
