/**
 * FIXEO — Supabase Data Loader v1.0
 * ====================================
 * Single source of truth: loads all artisans from Supabase
 * and feeds them into the existing marketplace pipeline via
 * replaceMarketplaceArtisans() + FixeoDB sync.
 *
 * Replaces:
 *   - fixeo-artisans-master-loader.js  (fetch /data/artisans-master.json)
 *   - fixeo_seed_patch.js              (static seed arrays)
 *   - main.js localStorage reads       (readMarketplaceLocalArtisans)
 *
 * Zero UI changes. Zero rendering changes. Data only.
 * Falls back to FixeoDB (localStorage) if Supabase unreachable.
 */
;(function (window) {
  'use strict';

  var VERSION    = '1.0';
  var PAGE_SIZE  = 1000;   // fetch up to 1000 per request (Supabase default limit)
  var LOADED     = false;

  /* ── Field mapper: Supabase row → Fixeo internal format ──── */
  function _toFixeo(row) {
    var svc = [];
    try {
      var s = row.services;
      if (Array.isArray(s)) svc = s;
      else if (typeof s === 'string') svc = JSON.parse(s || '[]');
    } catch (_) { svc = []; }

    var available = row.availability === 'available';

    return {
      /* Identity */
      id:           row.legacy_id || row.id,
      _supabase_id: row.id,
      name:         row.name || row.full_name || 'Artisan Fixeo',
      full_name:    row.name || row.full_name || 'Artisan Fixeo',

      /* Service */
      service:      row.service_category || (svc[0] || ''),
      category:     row.service_category || '',
      services:     svc,

      /* Location */
      city:         row.city || '',
      ville:        row.city || '',
      work_zone:    row.work_zone || row.city || '',

      /* Contact */
      phone:        row.phone_public || '',
      telephone:    row.phone_public || '',

      /* Availability */
      availability:  row.availability || 'available',
      disponibilite: row.availability || 'available',
      available:     available,
      available_today: available,

      /* Trust */
      verified:  !!row.verified,
      verifie:   !!row.verified,
      verified_status: row.verified ? 'verified' : 'unverified',

      /* Claim */
      claimed:              !!row.claimed,
      claim_status:         row.claim_status || 'unclaimed',
      owner_account_id:     row.owner_user_id || '',
      onboarding_completed: !!row.onboarding_completed,
      verification_status:  row.verified ? 'verified' : (row.claimed ? 'pending' : 'unverified'),

      /* Ratings */
      rating:      parseFloat(row.rating)      || 0,
      note:        parseFloat(row.rating)      || 0,
      reviews:     parseInt(row.review_count   || 0, 10),
      reviewCount: parseInt(row.review_count   || 0, 10),
      avis:        parseInt(row.review_count   || 0, 10),

      /* Pricing */
      price_from:  row.price_from || null,
      priceFrom:   row.price_from || null,
      priceLabel:  row.price_label || '',
      priceType:   'fixed_estimate',
      priceUnit:   'intervention',

      /* Media */
      photo:       row.photo_url || '',
      avatar:      row.photo_url || '',
      photo_url:   row.photo_url || '',

      /* Meta */
      description: row.description || '',
      shortBio:    row.description || '',
      experience:  row.experience  || '',
      public_slug: row.public_slug || '',
      premium:     !!row.verified,
      badge:       row.verified ? 'Artisan vérifié' : (row.claimed ? 'Profil revendiqué' : 'Profil à revendiquer'),
      _source:     'supabase',
      _isSeed:     false,

      /* ── Fields required by SearchEngine.filter() and main.js ── */
      /* Without these, filter() crashes or returns 0 results       */
      status:       'active',          /* SearchEngine filters a.status === 'active'    */
      bio: {                           /* SearchEngine accesses a.bio[lang] / a.bio.fr  */
        fr: row.description || '',
        ar: '',
        en: row.description || ''
      },
      skills:       row.service_category            /* SearchEngine searches a.skills[] */
                      ? [row.service_category]
                      : [],
      badges:       row.verified ? ['verified'] : [], /* reservation.js uses a.badges[] */
      portfolio:    ['🔧'],            /* reservation.js renders a.portfolio[]           */
      trustScore:   Math.round(       /* SearchEngine sorts by trustScore               */
                      (parseFloat(row.rating) || 0) * 15 +
                      (row.verified ? 20 : 0) +
                      (row.claimed  ? 10 : 0) +
                      50
                    ),
      responseTime: 15,               /* default 15 min — no column in Supabase yet     */
      hasRatingData: (parseFloat(row.rating) || 0) > 0,
      hasPriceData:  !!(row.price_from),
      availableNow:  row.availability === 'available',
      availableToday: row.availability === 'available',
      certified:     !!row.verified,

      created_at:  row.created_at,
      updated_at:  row.updated_at
    };
  }

  /* ── Fetch all artisans from Supabase with pagination ─────── */
  async function _fetchFromSupabase() {
    await window.FixeoSupabaseClient.ready();
    var client = window.FixeoSupabaseClient.client;
    if (!client) throw new Error('No Supabase client');

    var all    = [];
    var offset = 0;
    var more   = true;

    while (more) {
      var _ref = await client
        .from('artisans')
        .select('*')
        .order('rating', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      var data  = _ref.data;
      var error = _ref.error;

      if (error) throw new Error(error.message);
      if (!data || !data.length) break;

      all = all.concat(data.map(_toFixeo));
      offset += data.length;
      more = data.length === PAGE_SIZE;   // if full page returned, there may be more
    }

    return all;
  }

  /* ── Push into existing marketplace pipeline ──────────────── */
  function _injectIntoMarketplace(artisans) {
    if (!artisans || !artisans.length) return;

    /* 1. replaceMarketplaceArtisans — main.js canonical feed (normalizes + dedupes) */
    if (typeof window.replaceMarketplaceArtisans === 'function') {
      window.replaceMarketplaceArtisans(artisans);
    } else {
      /* Fallback: splice into ARTISANS directly */
      if (Array.isArray(window.ARTISANS)) {
        window.ARTISANS.splice(0, window.ARTISANS.length);
        artisans.forEach(function(a){ window.ARTISANS.push(a); });
      } else {
        window.ARTISANS = artisans.slice();
      }
    }

    /* 2. FixeoDB sync — keeps localStorage consistent for offline fallback */
    if (window.FixeoDB) {
      window.FixeoDB.saveArtisans(artisans);
    }

    /* 3. Patch SearchEngine instance — reseed after Supabase data replaces ARTISANS */
    /* FIX: was window._searchEngine (wrong); correct name is window.searchEngine   */
    if (window.searchEngine && Array.isArray(window.searchEngine.artisans)) {
      /* ARTISANS array is already spliced by replaceMarketplaceArtisans above.     */
      /* Re-point searchEngine.artisans to the live array and rebuild filtered.     */
      window.searchEngine.artisans = window.ARTISANS || [];
      window.searchEngine.filtered  = (window.ARTISANS || []).slice();
    }

    /* 4. Force re-render of homepage marketplace cards */
    if (typeof window.renderArtisans === 'function') {
      window.renderArtisans(artisans);
    }
    if (typeof window.refreshMarketplaceFromCurrentFilters === 'function') {
      window.refreshMarketplaceFromCurrentFilters();
    }
    if (typeof window.refreshMarketplaceAfterLoad === 'function') {
      window.refreshMarketplaceAfterLoad();
    }

    /* 5. Normalize via production search engine (fixes status, bio, etc.) */
    if (typeof window.fxNormalizeAll === 'function') {
      window.fxNormalizeAll();
    }

    /* 6. Dispatch event so homepage patch + search modules reload */
    window.dispatchEvent(new CustomEvent('fixeo:artisans:loaded', {
      detail: { count: artisans.length, source: 'supabase' }
    }));
    window.dispatchEvent(new CustomEvent('fixeo:marketplace-artisans-updated', {
      detail: { count: artisans.length }
    }));

    /* 7. Boot production search pipeline (reseed engine, sync count) */
    if (typeof window.fxBootSearchPipeline === 'function') {
      setTimeout(function() { window.fxBootSearchPipeline(); }, 200);
    }

    console.info('[FixeoSupabaseLoader] ✅ ' + artisans.length + ' artisans injectés depuis Supabase');
  }

  /* ── Show loading UI ──────────────────────────────────────── */
  function _setLoading(on) {
    var spinner = document.getElementById('loading-artisans');
    var grid    = document.getElementById('artisans-grid') ||
                  document.getElementById('ssb2-vedette-grid') ||
                  document.getElementById('top-list');

    if (spinner) spinner.style.display = on ? 'flex' : 'none';
    if (grid && on) grid.style.opacity = '0.4';
    if (grid && !on) grid.style.opacity = '';
  }

  /* ── Empty state ──────────────────────────────────────────── */
  function _showEmpty(container) {
    if (!container) return;
    var existing = document.getElementById('fixeo-supabase-empty');
    if (existing) return;
    var el = document.createElement('div');
    el.id = 'fixeo-supabase-empty';
    el.style.cssText = 'text-align:center;padding:40px 20px;color:rgba(255,255,255,.5);font-size:.9rem';
    el.innerHTML = '<div style="font-size:2rem;margin-bottom:8px">🔍</div>' +
                   'Aucun artisan trouvé pour le moment.<br>' +
                   '<span style="font-size:.75rem;opacity:.6">Revenez bientôt — de nouveaux artisans rejoignent Fixeo chaque jour.</span>';
    container.appendChild(el);
  }

  /* ── Main loader ──────────────────────────────────────────── */
  async function load() {
    if (LOADED) return;
    LOADED = true;

    /* Check Supabase is configured */
    if (!window.FixeoSupabaseClient || !window.FixeoSupabaseClient.CONFIGURED) {
      console.info('[FixeoSupabaseLoader] Supabase not configured — using FixeoDB (localStorage)');
      var local = window.FixeoDB ? window.FixeoDB.getAllArtisans() : [];
      if (local.length) _injectIntoMarketplace(local);
      return;
    }

    _setLoading(true);

    try {
      var artisans = await _fetchFromSupabase();
      _setLoading(false);

      if (!artisans.length) {
        console.warn('[FixeoSupabaseLoader] Supabase returned 0 artisans — falling back to FixeoDB');
        var fallback = window.FixeoDB ? window.FixeoDB.getAllArtisans() : [];
        if (fallback.length) {
          _injectIntoMarketplace(fallback);
        } else {
          var grid = document.getElementById('ssb2-vedette-grid') ||
                     document.getElementById('top-list') ||
                     document.getElementById('artisans-grid');
          _showEmpty(grid);
        }
        return;
      }

      _injectIntoMarketplace(artisans);

      /* Trigger a marketplace re-render if the DOM is ready */
      if (document.readyState !== 'loading') {
        if (typeof window.refreshMarketplaceAfterLoad === 'function') {
          window.refreshMarketplaceAfterLoad();
        }
        if (typeof window.refreshMarketplaceFromCurrentFilters === 'function') {
          window.refreshMarketplaceFromCurrentFilters();
        }
      }

    } catch (err) {
      _setLoading(false);
      console.error('[FixeoSupabaseLoader] Fetch error:', err.message);

      /* Graceful fallback to FixeoDB */
      var fb = window.FixeoDB ? window.FixeoDB.getAllArtisans() : [];
      if (fb.length) {
        console.info('[FixeoSupabaseLoader] Fallback: ' + fb.length + ' artisans depuis FixeoDB');
        _injectIntoMarketplace(fb);
      }
    }
  }

  /* ── Auto-load on appropriate pages ──────────────────────── */
  var path = window.location.pathname.toLowerCase();
  var isHomepage     = path === '/' || path.endsWith('index.html') || path.endsWith('/');
  var isMarketplace  = path.includes('marketplace') || path.includes('artisan');
  var isAdmin        = path.includes('admin');

  if (isHomepage || isMarketplace || isAdmin) {
    if (document.readyState === 'loading') {
      /* Wait for DOM, then load after main.js has set up replaceMarketplaceArtisans */
      document.addEventListener('DOMContentLoaded', function () {
        /* Small delay so main.js loadMarketplaceArtisans() runs first with local data,
           then we override with fresh Supabase data */
        setTimeout(load, 800);  /* after main.js loadMarketplaceArtisans + renderArtisans */
      });
    } else {
      setTimeout(load, 600);
    }
  }

  /* ── Single artisan lookup for profile page ───────────────── */
  async function getArtisanForProfile(id) {
    if (!id) return null;

    if (window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED) {
      try {
        await window.FixeoSupabaseClient.ready();
        var client = window.FixeoSupabaseClient.client;
        /* Try by legacy_id first */
        var _ref = await client.from('artisans').select('*').eq('legacy_id', String(id)).maybeSingle();
        if (_ref.data) return _toFixeo(_ref.data);
        /* Try by UUID */
        var _ref2 = await client.from('artisans').select('*').eq('id', id).maybeSingle();
        if (_ref2.data) return _toFixeo(_ref2.data);
      } catch (e) {
        console.warn('[FixeoSupabaseLoader] Profile lookup error:', e.message);
      }
    }
    /* Fallback */
    return window.FixeoDB ? window.FixeoDB.getArtisanById(id) :
           (window.ARTISANS || []).find(function(a){ return String(a.id) === String(id); }) || null;
  }

  /* ── Public API ────────────────────────────────────────────── */
  window.FixeoSupabaseLoader = {
    version:             VERSION,
    load:                load,
    getArtisanForProfile:getArtisanForProfile,
    _toFixeo:            _toFixeo
  };

})(window);
