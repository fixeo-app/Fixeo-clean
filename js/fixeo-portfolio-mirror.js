/*
 * fixeo-portfolio-mirror.js — V2-B1: Portfolio Supabase Storage Mirror
 * Version: v2b1
 *
 * ARCHITECTURE: Local-first, server-durable
 *   1. User selects photo → compress client-side (unchanged)
 *   2. canvas.toBlob() → upload to Supabase Storage (bucket: portfolio)
 *   3. getPublicUrl() → insert row into portfolio_items table
 *   4. Cache lightweight metadata (URL string, no base64) in localStorage
 *   5. Render dashboard grid from localStorage (instant, no server wait)
 *   6. Public profile reads from Supabase first, localStorage fallback
 *
 * FAILURE MODEL:
 *   Supabase upload fails → keep local base64 fallback
 *   Supabase table insert fails → keep local URL cache
 *   Table/bucket missing → local only, console.warn, no crash
 *   No canonical artisan ID → local only, sync_status: pending_identity
 *   All paths: UI continues, no modal/toast error, no fake success
 *
 * CANONICAL IDENTITY:
 *   Uses FixeoArtisanIdentity.currentArtisanId() for all writes.
 *   Falls back to localStorage user_id / fixeo_user_id / sb_user_id.
 *   NEVER uses name slug as artisan_id for Supabase writes.
 *
 * REQUIRED SUPABASE SETUP (see SQL block at bottom of file):
 *   - Storage bucket: portfolio (public)
 *   - Table: portfolio_items
 *   - RLS policies (see below)
 *
 * NEVER TOUCHES:
 *   - booking/mission/payment flows
 *   - trust threshold logic
 *   - matching engine
 *   - V2-A3 canonical identity module
 *   - reservation.js / fixeo-mission-system.js / fixeo-client-requests-store.js
 */

(function (window) {
  'use strict';

  if (window._fxPortfolioMirrorLoaded) return;
  window._fxPortfolioMirrorLoaded = true;

  /* ════════════════════════════════════════════════════════════
     CONSTANTS
  ════════════════════════════════════════════════════════════ */
  var LS_KEY       = 'fixeo_portfolio';           /* localStorage cache key */
  var BUCKET       = 'portfolio';                 /* Supabase Storage bucket name */
  var TABLE        = 'portfolio_items';           /* Supabase metadata table */
  var CACHE_TTL_MS = 5 * 60 * 1000;              /* 5-min in-memory read cache */
  var MAX_ITEMS    = 6;                           /* max portfolio items displayed */

  /* ════════════════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════════════════ */

  function _log(msg) {
    if (window.FixeoPortfolioMirror && window.FixeoPortfolioMirror._debug) {
      console.log('[FixeoPortfolioMirror]', msg);
    }
  }
  function _warn(msg) { console.warn('[FixeoPortfolioMirror]', msg); }

  /* Read canonical artisan ID — never returns name slug if real ID available */
  function _canonicalArtisanId() {
    /* V2-A3 identity layer first */
    if (window.FixeoArtisanIdentity
        && typeof window.FixeoArtisanIdentity.currentArtisanId === 'function') {
      var canonical = window.FixeoArtisanIdentity.currentArtisanId();
      if (canonical) return canonical;
    }
    /* Direct localStorage fallback */
    try {
      return (localStorage.getItem('sb_user_id')
           || localStorage.getItem('user_id')
           || localStorage.getItem('fixeo_user_id')
           || '').trim();
    } catch(e) { return ''; }
  }

  /* Generate stable storage path for this artisan's photo */
  function _storagePath(artisanId, suffix) {
    /* portfolio/{artisan_id}/{timestamp}-{suffix}.jpg */
    var ts = Date.now();
    var rand = Math.floor(Math.random() * 99999);
    var safe = String(artisanId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return safe + '/' + ts + '-' + rand + '-' + (suffix || 'img') + '.jpg';
  }

  /* Get Supabase client — may be null if SDK not loaded yet */
  function _client() {
    if (window.FixeoSupabaseClient && window.FixeoSupabaseClient.client) {
      return window.FixeoSupabaseClient.client;
    }
    return null;
  }

  /* ── localStorage read/write ─────────────────────────────── */
  function _readLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }

  function _writeLocal(portfolio) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(portfolio));
    } catch(e) { _warn('localStorage write failed: ' + e.message); }
  }

  /* Upsert a single item into localStorage cache.
   * Merges server_id, image_url fields into existing entry if id matches.
   * Does NOT remove base64 data — still useful as offline fallback.
   */
  function _upsertLocal(item) {
    var portfolio = _readLocal();
    var existing  = portfolio.findIndex(function(p) {
      return String(p.id) === String(item.id);
    });
    if (existing !== -1) {
      portfolio[existing] = Object.assign({}, portfolio[existing], item);
    } else {
      portfolio.push(item);
    }
    _writeLocal(portfolio);
  }

  /* Remove item from localStorage by id */
  function _removeLocal(itemId) {
    var portfolio = _readLocal().filter(function(p) {
      return String(p.id) !== String(itemId);
    });
    _writeLocal(portfolio);
  }

  /* ════════════════════════════════════════════════════════════
     PHASE 2 — BASE64 → BLOB CONVERSION
     Used to upload canvas output to Supabase Storage.
  ════════════════════════════════════════════════════════════ */

  function _dataUrlToBlob(dataUrl) {
    try {
      var parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      var mime  = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
      var bytes = atob(parts[1]);
      var arr   = new Uint8Array(bytes.length);
      for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch(e) {
      _warn('dataUrlToBlob failed: ' + e.message);
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     PHASE 3 — STORAGE UPLOAD
     Returns: { url: string, path: string } or null on failure
  ════════════════════════════════════════════════════════════ */

  async function _uploadToStorage(artisanId, dataUrl, suffix) {
    var client = _client();
    if (!client) { _warn('Supabase client not ready — skipping storage upload'); return null; }
    if (!dataUrl) return null;

    var blob = _dataUrlToBlob(dataUrl);
    if (!blob) return null;

    var path = _storagePath(artisanId, suffix);

    try {
      var uploadResult = await client.storage
        .from(BUCKET)
        .upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false,
          cacheControl: '31536000' /* 1 year CDN cache */
        });

      if (uploadResult.error) {
        /* Bucket may not exist yet — report clearly, don't throw */
        _warn('Storage upload failed for path "' + path + '": ' + uploadResult.error.message);
        return null;
      }

      /* Get public URL */
      var urlResult = client.storage.from(BUCKET).getPublicUrl(path);
      /* Supabase JS v2: getPublicUrl returns { data: { publicUrl } } */
      var publicUrl = (urlResult.data && urlResult.data.publicUrl) ? urlResult.data.publicUrl : null;

      if (!publicUrl) {
        _warn('getPublicUrl returned empty for path: ' + path);
        return null;
      }

      _log('Storage upload OK: ' + publicUrl);
      return { url: publicUrl, path: path };

    } catch(e) {
      _warn('Storage upload threw: ' + e.message);
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     PHASE 4 — METADATA TABLE INSERT
     Returns: { server_id: string } or null on failure
  ════════════════════════════════════════════════════════════ */

  async function _insertMetadata(row) {
    var client = _client();
    if (!client) { _warn('Supabase client not ready — skipping metadata insert'); return null; }

    try {
      var result = await client
        .from(TABLE)
        .insert([row])
        .select('id')
        .single();

      if (result.error) {
        /* Table may not exist yet — report clearly */
        _warn('Metadata insert failed: ' + result.error.message);
        return null;
      }

      _log('Metadata insert OK: ' + (result.data && result.data.id));
      return { server_id: result.data && result.data.id };

    } catch(e) {
      _warn('Metadata insert threw: ' + e.message);
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════
     PHASE 3+4 — DELETE FROM STORAGE + TABLE
     Non-blocking: fires and forgets, UI updates immediately.
  ════════════════════════════════════════════════════════════ */

  async function _serverDelete(item) {
    var client = _client();
    if (!client) return;

    /* Delete metadata row if we have server_id */
    if (item.server_id) {
      try {
        var r = await client.from(TABLE).delete().eq('id', item.server_id);
        if (r.error) _warn('Metadata delete failed: ' + r.error.message);
        else _log('Metadata deleted: ' + item.server_id);
      } catch(e) { _warn('Metadata delete threw: ' + e.message); }
    }

    /* Delete storage objects if we have storage paths */
    var paths = [];
    if (item.after_storage_path)  paths.push(item.after_storage_path);
    if (item.before_storage_path) paths.push(item.before_storage_path);

    if (paths.length) {
      try {
        var sr = await client.storage.from(BUCKET).remove(paths);
        if (sr.error) _warn('Storage delete failed: ' + sr.error.message);
        else _log('Storage paths deleted: ' + paths.join(', '));
      } catch(e) { _warn('Storage delete threw: ' + e.message); }
    }
  }

  /* ════════════════════════════════════════════════════════════
     MAIN WRITE FLOW
     Called from the patched _v1hSavePortfolioItem() in dashboard-artisan.html.
     Receives compressed data URLs (base64 strings).
     Returns void — all results go through localStorage immediately.
  ════════════════════════════════════════════════════════════ */

  async function mirrorSave(opts) {
    /*
     * opts = {
     *   localId:     string,    (generated by caller: 'pf-' + Date.now() + ...)
     *   service:     string,
     *   description: string,
     *   city:        string,
     *   afterUrl:    string|null,   (base64 data URL or null)
     *   beforeUrl:   string|null,
     *   createdAt:   string,        (ISO timestamp)
     *   onLocalSaved: fn(item),     (called as soon as localStorage is written)
     *   onServerSynced: fn(item),   (called after Supabase write, optional)
     * }
     */
    var artisanId = _canonicalArtisanId();

    /* Build initial local item — base64 preserved as fallback */
    var localItem = {
      id:           opts.localId,
      artisan_id:   artisanId || null,
      service:      opts.service || '',
      description:  opts.description || '',
      city:         opts.city || '',
      created_at:   opts.createdAt || new Date().toISOString(),
      source:       'local',
      /* Image storage: prefer server URLs; fall back to base64 */
      after_image:  opts.afterUrl  || null,
      before_image: opts.beforeUrl || null,
      /* Server-side fields (filled after upload) */
      image_url:        null,
      after_image_url:  null,
      before_image_url: null,
      server_id:        null,
      after_storage_path:  null,
      before_storage_path: null,
      sync_status:  artisanId ? 'pending_upload' : 'pending_identity',
    };

    /* Phase 1: Write to localStorage immediately (zero latency for UI) */
    _upsertLocal(localItem);
    if (typeof opts.onLocalSaved === 'function') opts.onLocalSaved(localItem);

    /* Phase 2: Attempt server sync asynchronously */
    /* Skip if no canonical ID — don't upload as anonymous orphan */
    if (!artisanId) {
      _warn('No canonical artisan ID — portfolio item saved locally only (sync_status: pending_identity)');
      return;
    }

    var afterUpload  = null;
    var beforeUpload = null;

    /* Upload after image (primary display image) */
    if (opts.afterUrl) {
      afterUpload = await _uploadToStorage(artisanId, opts.afterUrl, 'after');
    }

    /* Upload before image */
    if (opts.beforeUrl) {
      beforeUpload = await _uploadToStorage(artisanId, opts.beforeUrl, 'before');
    }

    /* Build resolved image URLs (server URL preferred, data URL fallback) */
    var resolvedAfter  = (afterUpload  && afterUpload.url)  || opts.afterUrl  || null;
    var resolvedBefore = (beforeUpload && beforeUpload.url) || opts.beforeUrl || null;
    var primaryUrl     = (afterUpload && afterUpload.url)
                       || (beforeUpload && beforeUpload.url)
                       || null;

    /* Build metadata row for Supabase table */
    var metaRow = {
      artisan_id:      artisanId,
      service:         opts.service || '',
      description:     opts.description || '',
      city:            opts.city || '',
      image_url:       primaryUrl,
      after_image_url:  (afterUpload  && afterUpload.url)  || null,
      before_image_url: (beforeUpload && beforeUpload.url) || null,
      source:          'dashboard_upload',
      created_at:      opts.createdAt || new Date().toISOString(),
    };

    /* Insert metadata — fire even if storage upload partially failed
     * (at minimum we get the row; image_url may be null if both uploads failed)
     */
    var metaResult = null;
    if (primaryUrl || (!afterUpload && !beforeUpload)) {
      /* Insert if: we have a URL, OR if both uploads were skipped (bucket missing)
       * In the latter case image_url = null — table row exists, image can be retried.
       * Skip insert entirely only if uploads succeeded but returned no URL (shouldn't happen).
       */
      metaResult = await _insertMetadata(metaRow);
    }

    /* Phase 3: Update localStorage cache with server URLs (replace base64 when available) */
    var updatedItem = Object.assign({}, localItem, {
      /* Replace base64 data URLs with server URLs when available */
      after_image:  resolvedAfter,
      before_image: resolvedBefore,
      /* Server-canonical URL fields */
      image_url:         primaryUrl,
      after_image_url:   (afterUpload  && afterUpload.url)  || null,
      before_image_url:  (beforeUpload && beforeUpload.url) || null,
      /* Server ID for future updates/deletes */
      server_id:         (metaResult && metaResult.server_id) || null,
      /* Storage paths for cleanup */
      after_storage_path:  (afterUpload  && afterUpload.path)  || null,
      before_storage_path: (beforeUpload && beforeUpload.path) || null,
      sync_status: metaResult ? 'synced' : (primaryUrl ? 'url_only' : 'local_only'),
      source: 'dashboard_upload',
    });

    /* If we have server URLs, we can drop base64 blobs to save localStorage space */
    if (updatedItem.after_image && updatedItem.after_image.startsWith('http')) {
      /* Server URL available — no need to keep large base64 */
      /* Keep it as reference for a bit, but don't force-remove (may be needed offline) */
    }

    _upsertLocal(updatedItem);
    _log('Portfolio item synced. sync_status=' + updatedItem.sync_status);

    if (typeof opts.onServerSynced === 'function') opts.onServerSynced(updatedItem);
  }

  /* ════════════════════════════════════════════════════════════
     DELETE FLOW
     Called from the patched _v1hDeletePortfolioItem().
     Removes from localStorage immediately, attempts server delete async.
  ════════════════════════════════════════════════════════════ */

  function mirrorDelete(itemId) {
    var portfolio = _readLocal();
    var item = portfolio.find(function(p) { return String(p.id) === String(itemId); });

    /* Remove locally immediately (UI updates before server round-trip) */
    _removeLocal(itemId);

    /* Async server cleanup — fire and forget */
    if (item) {
      _serverDelete(item).catch(function(e) {
        _warn('Server delete failed: ' + e.message);
      });
    }
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC PROFILE READ PATH
     Called from injectPortfolioPhotos() in fixeo-profile-v2a.js.
     Returns array of normalized portfolio items for public display.
     Priority: Supabase query → localStorage cache → []
  ════════════════════════════════════════════════════════════ */

  /* In-memory read cache: artisanId → { data, ts } */
  var _readCache = {};

  async function fetchForArtisan(artisanId) {
    var aid = String(artisanId || '').trim();
    if (!aid) return [];

    /* Aliases to query: URL param may differ from stored artisan_id */
    var queryIds = [aid];
    if (window.FixeoArtisanIdentity) {
      var artRef = { id: aid };
      var sbArt  = window._fixeoCurrentArtisan;
      if (sbArt) artRef = Object.assign({}, sbArt, { id: aid });
      var aliases = window.FixeoArtisanIdentity.resolveAliases(artRef);
      aliases.forEach(function(a) {
        if (queryIds.indexOf(a) === -1) queryIds.push(a);
      });
    }

    /* 1. Check in-memory cache first (4-min TTL) */
    var cached = _readCache[aid];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      _log('Read cache hit for artisan ' + aid);
      return cached.data;
    }

    /* 2. Check localStorage for server-synced items (fast path) */
    var localItems = _readLocal().filter(function(p) {
      /* Items with server URLs belong to any alias of this artisan */
      if (!p.image_url && !p.after_image_url && !p.after_image && !p.before_image) return false;
      /* Match by artisan_id alias */
      if (!p.artisan_id) return false;
      return queryIds.indexOf(String(p.artisan_id)) !== -1;
    });

    /* 3. Attempt Supabase read */
    var client = _client();
    if (client && queryIds.length) {
      try {
        var result = await client
          .from(TABLE)
          .select('id,artisan_id,service,description,city,image_url,after_image_url,before_image_url,created_at,source')
          .in('artisan_id', queryIds)
          .order('created_at', { ascending: false })
          .limit(MAX_ITEMS);

        if (!result.error && result.data && result.data.length > 0) {
          /* Normalize server rows to match local item shape */
          var serverItems = result.data.map(function(row) {
            return {
              id:           row.id,
              server_id:    row.id,
              artisan_id:   row.artisan_id,
              service:      row.service || '',
              description:  row.description || '',
              city:         row.city || '',
              image_url:    row.image_url || null,
              after_image:  row.after_image_url || row.image_url || null,
              before_image: row.before_image_url || null,
              after_image_url:  row.after_image_url  || null,
              before_image_url: row.before_image_url || null,
              created_at:   row.created_at || '',
              source:       'server',
              sync_status:  'synced',
            };
          });

          /* Merge server items with any local-only items (base64 fallback) */
          var serverIds = new Set(serverItems.map(function(i) { return String(i.id); }));
          var localOnly = localItems.filter(function(p) {
            /* Keep local-only items that don't have a server counterpart */
            return !serverIds.has(String(p.server_id || p.id));
          });

          var merged = serverItems.concat(localOnly).slice(0, MAX_ITEMS);

          /* Update cache */
          _readCache[aid] = { data: merged, ts: Date.now() };

          /* Back-fill localStorage for cross-device consistency */
          serverItems.forEach(function(si) {
            var existing = _readLocal().find(function(p) {
              return String(p.id) === String(si.id) || String(p.server_id) === String(si.id);
            });
            if (!existing) _upsertLocal(si);
          });

          _log('Supabase read returned ' + serverItems.length + ' items for artisan ' + aid);
          return merged;
        } else if (result.error) {
          _warn('Supabase read error: ' + result.error.message);
        }
      } catch(e) {
        _warn('Supabase read threw: ' + e.message);
      }
    }

    /* 4. Fallback to localStorage only */
    _readCache[aid] = { data: localItems, ts: Date.now() };
    return localItems;
  }

  /* Invalidate read cache for artisan (called after upload/delete) */
  function _invalidateCache(artisanId) {
    if (artisanId) delete _readCache[String(artisanId)];
  }

  /* ════════════════════════════════════════════════════════════
     SYNC PENDING ITEMS (optional — call on dashboard load)
     Looks for items with sync_status: pending_upload that have
     base64 data and no server URL. Retries the upload in background.
     Silent — no UI feedback. Fires once per session.
  ════════════════════════════════════════════════════════════ */

  var _syncDone = false;

  async function syncPending() {
    if (_syncDone) return;
    _syncDone = true;

    var artisanId = _canonicalArtisanId();
    if (!artisanId) return;

    var portfolio = _readLocal();
    var pending   = portfolio.filter(function(p) {
      return p.sync_status === 'pending_upload'
          && p.artisan_id === artisanId
          && (p.after_image || p.before_image);
    });

    if (pending.length === 0) return;
    _log('Syncing ' + pending.length + ' pending portfolio items...');

    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      try {
        await mirrorSave({
          localId:     item.id,
          service:     item.service,
          description: item.description,
          city:        item.city,
          afterUrl:    item.after_image && item.after_image.startsWith('data:') ? item.after_image : null,
          beforeUrl:   item.before_image && item.before_image.startsWith('data:') ? item.before_image : null,
          createdAt:   item.created_at,
        });
      } catch(e) {
        _warn('Retry sync failed for item ' + item.id + ': ' + e.message);
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API — window.FixeoPortfolioMirror
  ════════════════════════════════════════════════════════════ */
  window.FixeoPortfolioMirror = {
    version: 'v2b1',
    _debug:  false,

    /* Core write/delete flows */
    mirrorSave:         mirrorSave,
    mirrorDelete:       mirrorDelete,

    /* Public profile read */
    fetchForArtisan:    fetchForArtisan,

    /* Background sync */
    syncPending:        syncPending,

    /* Cache management */
    invalidateCache:    _invalidateCache,

    /* Local helpers (for dashboard use) */
    readLocal:          _readLocal,
    upsertLocal:        _upsertLocal,
    removeLocal:        _removeLocal,
    canonicalArtisanId: _canonicalArtisanId,
  };

  /* ════════════════════════════════════════════════════════════
     AUTO-INIT: Queue sync after page fully loaded
  ════════════════════════════════════════════════════════════ */
  if (typeof window !== 'undefined') {
    /* Use requestIdleCallback if available, otherwise setTimeout */
    var _queueSync = function() {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(function() { syncPending(); }, { timeout: 8000 });
      } else {
        setTimeout(syncPending, 5000);
      }
    };

    if (document.readyState === 'complete') {
      _queueSync();
    } else {
      window.addEventListener('load', _queueSync);
    }
  }

})(window);

/*
 * ══════════════════════════════════════════════════════════════════════════
 *  REQUIRED SUPABASE SETUP — Paste in Supabase SQL Editor
 *  (One-time setup — cannot be done via anon key from frontend)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * -- Step 1: Create portfolio Storage bucket
 * -- (Do this in Supabase Dashboard → Storage → New Bucket)
 * -- Name: portfolio
 * -- Public bucket: YES (images need to be publicly accessible for visitor display)
 * -- Allowed MIME types: image/jpeg, image/png, image/webp
 * -- Max file size: 5MB
 *
 * -- Then run in Storage → Policies:
 * CREATE POLICY "Artisan can upload own portfolio"
 *   ON storage.objects FOR INSERT
 *   TO authenticated
 *   WITH CHECK (
 *     bucket_id = 'portfolio'
 *     AND (storage.foldername(name))[1] = auth.uid()::text
 *   );
 *
 * CREATE POLICY "Artisan can delete own portfolio"
 *   ON storage.objects FOR DELETE
 *   TO authenticated
 *   USING (
 *     bucket_id = 'portfolio'
 *     AND (storage.foldername(name))[1] = auth.uid()::text
 *   );
 *
 * CREATE POLICY "Public can view portfolio images"
 *   ON storage.objects FOR SELECT
 *   TO anon, authenticated
 *   USING (bucket_id = 'portfolio');
 *
 * -- Step 2: Create portfolio_items metadata table
 * CREATE TABLE IF NOT EXISTS public.portfolio_items (
 *   id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   artisan_id        text NOT NULL,
 *   service           text,
 *   description       text,
 *   city              text,
 *   image_url         text,
 *   after_image_url   text,
 *   before_image_url  text,
 *   source            text DEFAULT 'dashboard_upload',
 *   created_at        timestamptz DEFAULT now()
 * );
 *
 * -- Index for fast artisan lookup
 * CREATE INDEX IF NOT EXISTS portfolio_items_artisan_id_idx
 *   ON public.portfolio_items (artisan_id);
 *
 * -- Step 3: RLS policies for portfolio_items
 * ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
 *
 * -- Artisan can insert own items
 * CREATE POLICY "Artisan can insert portfolio items"
 *   ON public.portfolio_items FOR INSERT
 *   TO authenticated
 *   WITH CHECK (artisan_id = auth.uid()::text);
 *
 * -- Artisan can delete own items
 * CREATE POLICY "Artisan can delete portfolio items"
 *   ON public.portfolio_items FOR DELETE
 *   TO authenticated
 *   USING (artisan_id = auth.uid()::text);
 *
 * -- Public can read all portfolio items (for public profile display)
 * CREATE POLICY "Public can read portfolio items"
 *   ON public.portfolio_items FOR SELECT
 *   TO anon, authenticated
 *   USING (true);
 *
 * -- Step 4: Grant access
 * GRANT SELECT ON public.portfolio_items TO anon;
 * GRANT SELECT, INSERT, DELETE ON public.portfolio_items TO authenticated;
 * ══════════════════════════════════════════════════════════════════════════
 */
