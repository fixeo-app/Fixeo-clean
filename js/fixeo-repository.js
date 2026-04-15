/**
 * FIXEO REPOSITORY v1.0
 * ======================
 * Couche d'abstraction unique pour artisans + claim_requests.
 *
 * MODE AUTOMATIQUE:
 *   • Si FixeoSupabaseClient.CONFIGURED → lit/écrit dans Supabase
 *   • Sinon → lit/écrit dans FixeoDB (localStorage)
 *
 * Les pages appellent UNIQUEMENT FixeoRepository.xxx() — jamais
 * directement localStorage, window.ARTISANS, ou _artisansList.
 *
 * API:
 *   getAllArtisans(filters?)
 *   getArtisanById(id)
 *   createArtisan(data)
 *   updateArtisan(id, patch)
 *   deleteArtisan(id)        [admin]
 *   createClaimRequest(artisanId, onboardingData)
 *   approveClaimRequest(claimId, note)
 *   rejectClaimRequest(claimId, note)
 *   getClaimRequests(filters?)
 *   migrateLocalToSupabase()
 */
;(function (window) {
  'use strict';

  var VERSION = '1.0';

  /* ── Supabase table names ────────────────────────────────── */
  var T_ARTISANS = 'artisans';
  var T_CLAIMS   = 'claim_requests';
  var T_USERS    = 'users';

  /* ── Logging ─────────────────────────────────────────────── */
  function log(msg, lvl) {
    var fn = lvl === 'error' ? console.error : (lvl === 'warn' ? console.warn : console.log);
    fn('[FixeoRepository]', msg);
  }

  /* ── Driver detection ────────────────────────────────────── */
  function isSupabaseMode() {
    return !!(window.FixeoSupabaseClient && window.FixeoSupabaseClient.CONFIGURED);
  }

  function db() {
    return window.FixeoDB || null;
  }

  function sb() {
    return window.FixeoSupabaseClient && window.FixeoSupabaseClient.client;
  }

  /* ── Field mappers ───────────────────────────────────────── */

  /**
   * Map localStorage artisan → Supabase artisans row
   */
  function _localToSupabase(a) {
    return {
      // Supabase will generate a UUID if id is omitted / not a UUID
      legacy_id:          String(a.id || ''),
      public_slug:        _makeSlug(a.name, a.city, a.id),
      full_name:          a.name || a.full_name || '',
      name:               a.name || a.full_name || '',
      city:               a.city || '',
      description:        a.description || a.shortBio || '',
      services:           JSON.stringify(a.services || (a.service ? [a.service] : [])),
      service_category:   a.service || a.category || '',
      phone_public:       a.phone || '',
      availability:       a.availability || 'available',
      verified:           !!(a.verified || a.verification_status === 'verified'),
      claimed:            !!(a.claimed),
      owner_user_id:      a.owner_account_id || null,
      onboarding_completed: !!(a.onboarding_completed),
      claim_status:       a.claim_status || 'unclaimed',
      work_zone:          a.work_zone || a.city || '',
      rating:             parseFloat(a.rating) || 0,
      review_count:       parseInt(a.reviewCount || a.review_count || 0, 10),
      price_from:         a.price_from || a.priceFrom || null,
      price_label:        a.priceLabel || '',
      photo_url:          a.photo || a.avatar || '',
      experience:         a.experience || '',
      source:             a._source || 'local',
      created_at:         a.created_at || new Date().toISOString(),
      updated_at:         a.updated_at || new Date().toISOString()
    };
  }

  /**
   * Map Supabase artisans row → app artisan object
   * (preserves all fields the UI already uses)
   */
  function _supabaseToLocal(row) {
    var svc = [];
    try { svc = JSON.parse(row.services || '[]'); } catch (_) { svc = row.services ? [row.services] : []; }
    return {
      id:                  row.legacy_id || row.id,
      _supabase_id:        row.id,
      name:                row.name || row.full_name || 'Artisan Fixeo',
      full_name:           row.name || row.full_name || 'Artisan Fixeo',
      city:                row.city || '',
      description:         row.description || '',
      shortBio:            row.description || '',
      service:             row.service_category || (svc[0] || ''),
      category:            row.service_category || '',
      services:            svc,
      phone:               row.phone_public || '',
      availability:        row.availability || 'available',
      available:           row.availability === 'available',
      available_today:     row.availability === 'available',
      verified:            !!row.verified,
      verification_status: row.verified ? 'verified' : (row.claimed ? 'pending' : 'unverified'),
      claimed:             !!row.claimed,
      claim_status:        row.claim_status || (row.claimed ? 'approved' : 'unclaimed'),
      owner_account_id:    row.owner_user_id || '',
      onboarding_completed:!!row.onboarding_completed,
      work_zone:           row.work_zone || row.city || '',
      rating:              parseFloat(row.rating) || 0,
      reviewCount:         parseInt(row.review_count || 0, 10),
      review_count:        parseInt(row.review_count || 0, 10),
      price_from:          row.price_from || null,
      priceFrom:           row.price_from || null,
      priceLabel:          row.price_label || '',
      priceType:           'fixed_estimate',
      photo:               row.photo_url || '',
      avatar:              row.photo_url || '',
      experience:          row.experience || '',
      public_slug:         row.public_slug || '',
      _source:             'supabase',
      created_at:          row.created_at,
      updated_at:          row.updated_at
    };
  }

  function _makeSlug(name, city, id) {
    var base = (name || '') + '-' + (city || '') + '-' + (id || '');
    return base.toLowerCase()
      .replace(/[àáâã]/g,'a').replace(/[èéêë]/g,'e')
      .replace(/[îï]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u')
      .replace(/[ç]/g,'c').replace(/[ñ]/g,'n')
      .replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  }

  /* ══════════════════════════════════════════════════════════
   * A. ARTISANS
   * ══════════════════════════════════════════════════════════ */

  /**
   * getAllArtisans(filters?)
   * filters: { city, service, available, verified, limit, offset }
   */
  async function getAllArtisans(filters) {
    filters = filters || {};

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var q = sb().from(T_ARTISANS).select('*');

      if (filters.city)      q = q.ilike('city', '%' + filters.city + '%');
      if (filters.service)   q = q.ilike('service_category', '%' + filters.service + '%');
      if (filters.available) q = q.eq('availability', 'available');
      if (filters.verified)  q = q.eq('verified', true);

      q = q.order('rating', { ascending: false });
      if (filters.limit)  q = q.limit(filters.limit);
      if (filters.offset) q = q.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

      var _ref = await q, data = _ref.data, error = _ref.error;
      if (error) { log('getAllArtisans Supabase error: ' + error.message, 'error'); return []; }
      return (data || []).map(_supabaseToLocal);
    }

    // localStorage mode
    var all = db() ? db().getAllArtisans() : (window.ARTISANS || []);
    if (filters.city)      all = all.filter(function(a){ return (a.city||'').toLowerCase().includes(filters.city.toLowerCase()); });
    if (filters.service)   all = all.filter(function(a){ return (a.service||a.category||'').toLowerCase().includes(filters.service.toLowerCase()); });
    if (filters.available) all = all.filter(function(a){ return a.available || a.availability === 'available'; });
    if (filters.verified)  all = all.filter(function(a){ return a.verified; });
    if (filters.limit)     all = all.slice(filters.offset || 0, (filters.offset || 0) + filters.limit);
    return all;
  }

  /**
   * getArtisanById(id)
   * Tries Supabase by legacy_id or uuid, falls back to localStorage.
   */
  async function getArtisanById(id) {
    if (!id) return null;

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      // Try by legacy_id first (matches existing string IDs), then by uuid
      var _ref = await sb().from(T_ARTISANS).select('*').eq('legacy_id', String(id)).maybeSingle();
      var data = _ref.data, error = _ref.error;
      if (!error && data) return _supabaseToLocal(data);
      // Try uuid fallback
      var _ref2 = await sb().from(T_ARTISANS).select('*').eq('id', id).maybeSingle();
      data = _ref2.data; error = _ref2.error;
      if (!error && data) return _supabaseToLocal(data);
      log('getArtisanById: not found in Supabase for id=' + id, 'warn');
      return null;
    }

    return db() ? db().getArtisanById(id) :
           (window.ARTISANS || []).find(function(a){ return String(a.id) === String(id); }) || null;
  }

  /**
   * createArtisan(data) — admin creates a new artisan
   */
  async function createArtisan(data) {
    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var row = _localToSupabase(data);
      // Let Supabase generate the UUID
      delete row.legacy_id;
      var _ref = await sb().from(T_ARTISANS).insert([row]).select().single();
      var inserted = _ref.data, error = _ref.error;
      if (error) { log('createArtisan error: ' + error.message, 'error'); return null; }
      // Also persist to localStorage for offline fallback
      if (db()) db().createArtisan(Object.assign({}, data, { _supabase_id: inserted.id }));
      return _supabaseToLocal(inserted);
    }

    return db() ? db().createArtisan(data) : null;
  }

  /**
   * updateArtisan(id, patch)
   */
  async function updateArtisan(id, patch) {
    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var update = {
        updated_at: new Date().toISOString()
      };
      if (patch.description)   update.description  = patch.description;
      if (patch.availability)  update.availability  = patch.availability;
      if (patch.work_zone)     update.work_zone      = patch.work_zone;
      if (patch.services)      update.services       = JSON.stringify(patch.services);
      if (patch.phone)         update.phone_public   = patch.phone;
      if (patch.verified !== undefined)  update.verified  = patch.verified;
      if (patch.claimed  !== undefined)  update.claimed   = patch.claimed;
      if (patch.claim_status)  update.claim_status  = patch.claim_status;
      if (patch.owner_account_id) update.owner_user_id = patch.owner_account_id;
      if (patch.onboarding_completed !== undefined) update.onboarding_completed = patch.onboarding_completed;

      var _ref = await sb().from(T_ARTISANS).update(update).eq('legacy_id', String(id)).select().single();
      var data = _ref.data, error = _ref.error;
      if (error) { log('updateArtisan error: ' + error.message, 'error'); }
      // Mirror to localStorage
      if (db()) db().updateArtisan(id, patch);
      return data ? _supabaseToLocal(data) : null;
    }

    return db() ? db().updateArtisan(id, patch) : null;
  }

  /**
   * deleteArtisan(id) — admin only
   */
  async function deleteArtisan(id) {
    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().from(T_ARTISANS).delete().eq('legacy_id', String(id));
      var error = _ref.error;
      if (error) { log('deleteArtisan error: ' + error.message, 'error'); return false; }
    }
    return db() ? db().deleteArtisan(id) : false;
  }

  /* ══════════════════════════════════════════════════════════
   * B. CLAIM REQUESTS
   * ══════════════════════════════════════════════════════════ */

  /**
   * createClaimRequest(artisanId, onboardingData)
   */
  async function createClaimRequest(artisanId, onboardingData) {
    // Always write to localStorage first (immediate UX)
    var localResult = null;
    if (window.FixeoClaimSystem) {
      localResult = window.FixeoClaimSystem.submitClaimRequest(artisanId, onboardingData);
    } else {
      // FixeoClaimSystem not loaded — write directly (e.g. repository-level test)
      var claimId = 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,5);
      var claims = JSON.parse(localStorage.getItem('fixeo_claim_requests') || '[]');
      var artisan = db() ? db().getArtisanById(artisanId) : null;
      claims.push({
        id: claimId,
        artisan_id: String(artisanId),
        artisan_name: artisan ? artisan.name : '',
        artisan_service: artisan ? (artisan.service || '') : '',
        artisan_city: artisan ? (artisan.city || '') : '',
        status: 'pending',
        user_id: (onboardingData && onboardingData.user_id) || '',
        user_name: (onboardingData && onboardingData.name) || '',
        user_phone: (onboardingData && onboardingData.phone) || '',
        onboarding: onboardingData || {},
        submitted_at: new Date().toISOString(),
        processed_at: null,
        admin_note: ''
      });
      localStorage.setItem('fixeo_claim_requests', JSON.stringify(claims));
      // Patch artisan
      if (db()) db().updateArtisan(artisanId, { claim_status: 'pending', claimed: false });
      localResult = { ok: true, claimId: claimId };
    }

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var session = await sb().auth.getSession();
      var userId  = session && session.data && session.data.session
                    ? session.data.session.user.id : null;

      var row = {
        artisan_legacy_id:   String(artisanId),
        requester_user_id:   userId,
        requester_name:      onboardingData && onboardingData.name  || '',
        requester_phone:     onboardingData && onboardingData.phone || '',
        onboarding_data:     JSON.stringify(onboardingData || {}),
        status:              'pending',
        created_at:          new Date().toISOString()
      };
      var _ref = await sb().from(T_CLAIMS).insert([row]).select().single();
      var data = _ref.data, error = _ref.error;
      if (error) { log('createClaimRequest Supabase error: ' + error.message, 'error'); }
      else {
        // Store Supabase claim id in local record for cross-reference
        if (localResult && localResult.claimId) {
          var claims = JSON.parse(localStorage.getItem('fixeo_claim_requests') || '[]');
          var idx = claims.findIndex(function(c){ return c.id === localResult.claimId; });
          if (idx >= 0) { claims[idx]._supabase_id = data.id; localStorage.setItem('fixeo_claim_requests', JSON.stringify(claims)); }
        }
        return { ok: true, claimId: data.id, localClaimId: localResult && localResult.claimId };
      }
    }

    return localResult || { ok: false, reason: 'no_handler' };
  }

  /**
   * approveClaimRequest(claimId, note)
   */
  async function approveClaimRequest(claimId, note) {
    // Local approve
    if (window.FixeoClaimSystem) window.FixeoClaimSystem.adminApproveClaim(claimId, note);

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().from(T_CLAIMS)
        .update({ status: 'approved', notes: note || '', reviewed_at: new Date().toISOString() })
        .or('id.eq.' + claimId + ',id.eq.' + claimId)
        .select().single();
      var error = _ref.error;
      if (error) log('approveClaimRequest Supabase error: ' + error.message, 'error');
    }
    return { ok: true };
  }

  /**
   * rejectClaimRequest(claimId, note)
   */
  async function rejectClaimRequest(claimId, note) {
    if (window.FixeoClaimSystem) window.FixeoClaimSystem.adminRejectClaim(claimId, note);

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().from(T_CLAIMS)
        .update({ status: 'rejected', notes: note || '', reviewed_at: new Date().toISOString() })
        .eq('id', claimId);
      var error = _ref.error;
      if (error) log('rejectClaimRequest Supabase error: ' + error.message, 'error');
    }
    return { ok: true };
  }

  /**
   * getClaimRequests(filters?)
   * filters: { status: 'pending'|'approved'|'rejected' }
   */
  async function getClaimRequests(filters) {
    filters = filters || {};

    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var q = sb().from(T_CLAIMS).select('*').order('created_at', { ascending: false });
      if (filters.status) q = q.eq('status', filters.status);
      var _ref = await q;
      var data = _ref.data, error = _ref.error;
      if (error) { log('getClaimRequests error: ' + error.message, 'error'); return []; }
      return data || [];
    }

    // localStorage fallback
    var claims = JSON.parse(localStorage.getItem('fixeo_claim_requests') || '[]');
    if (filters.status) claims = claims.filter(function(c){ return c.status === filters.status; });
    return claims;
  }

  /* ══════════════════════════════════════════════════════════
   * C. AUTH helpers
   * ══════════════════════════════════════════════════════════ */

  async function getCurrentUser() {
    if (isSupabaseMode()) {
      await window.FixeoSupabaseClient.ready();
      var _ref = await sb().auth.getUser();
      return _ref.data && _ref.data.user || null;
    }
    // localStorage session fallback
    var uid = localStorage.getItem('fixeo_user_id') || localStorage.getItem('user_id') || '';
    if (!uid) return null;
    return { id: uid, email: localStorage.getItem('fixeo_user') || '', role: localStorage.getItem('fixeo_role') || 'client' };
  }

  /* ══════════════════════════════════════════════════════════
   * D. MIGRATION localStorage → Supabase
   * ══════════════════════════════════════════════════════════ */

  /**
   * migrateLocalToSupabase()
   * Run once after pasting credentials.
   * Safe: checks for existing records by legacy_id before inserting.
   *
   * Usage: await FixeoRepository.migrateLocalToSupabase()
   */
  async function migrateLocalToSupabase() {
    if (!isSupabaseMode()) {
      log('migrateLocalToSupabase: Supabase not configured', 'warn');
      return { ok: false, reason: 'not_configured' };
    }

    await window.FixeoSupabaseClient.ready();
    var client = sb();
    if (!client) return { ok: false, reason: 'no_client' };

    var local = db() ? db().getAllArtisans() : (window.ARTISANS || []);
    log('Migration: ' + local.length + ' local artisans to migrate…');

    // Fetch existing legacy_ids in Supabase to avoid duplicates
    var _ref = await client.from(T_ARTISANS).select('legacy_id');
    var existing = _ref.data || [];
    var existingIds = new Set(existing.map(function(r){ return r.legacy_id; }));
    log('Migration: ' + existingIds.size + ' already in Supabase');

    var toInsert = local.filter(function(a){ return !existingIds.has(String(a.id)); });
    log('Migration: ' + toInsert.length + ' new records to insert');

    if (!toInsert.length) return { ok: true, inserted: 0, skipped: local.length };

    // Batch insert in chunks of 200 to avoid request size limits
    var CHUNK = 200;
    var inserted = 0;
    var errors = [];

    for (var i = 0; i < toInsert.length; i += CHUNK) {
      var batch = toInsert.slice(i, i + CHUNK).map(function(a) {
        var row = _localToSupabase(a);
        return row;
      });
      var _ref2 = await client.from(T_ARTISANS).insert(batch);
      var error = _ref2.error;
      if (error) {
        log('Migration batch error: ' + error.message, 'error');
        errors.push(error.message);
      } else {
        inserted += batch.length;
        log('Migration batch ' + Math.ceil(i / CHUNK + 1) + ': +' + batch.length + ' inserted');
      }
    }

    // Migrate claim requests
    var localClaims = JSON.parse(localStorage.getItem('fixeo_claim_requests') || '[]');
    var _ref3 = await client.from(T_CLAIMS).select('artisan_legacy_id,requester_phone');
    var existingClaims = (_ref3.data || []).map(function(c){ return c.artisan_legacy_id + '|' + c.requester_phone; });
    var existingClaimsSet = new Set(existingClaims);

    var claimsToInsert = localClaims.filter(function(c){
      return !existingClaimsSet.has(c.artisan_id + '|' + c.user_phone);
    });

    if (claimsToInsert.length) {
      var claimRows = claimsToInsert.map(function(c) {
        return {
          artisan_legacy_id:  c.artisan_id,
          requester_user_id:  null,
          requester_name:     c.user_name || '',
          requester_phone:    c.user_phone || '',
          onboarding_data:    JSON.stringify(c.onboarding || {}),
          status:             c.status || 'pending',
          notes:              c.admin_note || '',
          created_at:         c.submitted_at || new Date().toISOString(),
          reviewed_at:        c.processed_at || null
        };
      });
      var _ref4 = await client.from(T_CLAIMS).insert(claimRows);
      if (_ref4.error) log('Claims migration error: ' + _ref4.error.message, 'error');
      else log('Migrated ' + claimRows.length + ' claim requests');
    }

    var result = {
      ok: errors.length === 0,
      total_local:    local.length,
      already_synced: existingIds.size,
      inserted:       inserted,
      skipped:        local.length - toInsert.length,
      errors:         errors,
      claims_migrated: claimsToInsert.length
    };
    log('Migration complete: ' + JSON.stringify(result));
    return result;
  }

  /* ══════════════════════════════════════════════════════════
   * E. PUBLIC API
   * ══════════════════════════════════════════════════════════ */

  window.FixeoRepository = {
    version: VERSION,
    isSupabaseMode: isSupabaseMode,

    // Artisans
    getAllArtisans:  getAllArtisans,
    getArtisanById:  getArtisanById,
    createArtisan:   createArtisan,
    updateArtisan:   updateArtisan,
    deleteArtisan:   deleteArtisan,

    // Claims
    createClaimRequest:  createClaimRequest,
    approveClaimRequest: approveClaimRequest,
    rejectClaimRequest:  rejectClaimRequest,
    getClaimRequests:    getClaimRequests,

    // Auth
    getCurrentUser: getCurrentUser,

    // Migration
    migrateLocalToSupabase: migrateLocalToSupabase
  };

  var mode = isSupabaseMode() ? '🔌 Supabase mode' : '💾 localStorage mode';
  console.info('[FixeoRepository] Ready — ' + mode + ' (v' + VERSION + ')');

})(window);
