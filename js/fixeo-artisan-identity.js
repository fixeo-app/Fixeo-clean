/*
 * fixeo-artisan-identity.js — V2-A3: Canonical Artisan Identity Layer
 * Version: v2a3
 *
 * PROBLEM SOLVED:
 *   Before V2-A3, artisan identity was fragmented across the lifecycle:
 *     - URL param:            ?id=1042   or  ?id=uuid-xyz
 *     - fixeo_admin_artisans: artisan.id = legacy_id (1042) or UUID
 *     - fixeo-supabase-loader._supabase_id = raw Supabase UUID always
 *     - owner_account_id      = UUID of authenticated owner
 *     - FixeoClientRequests.assigned_artisan_id = resolveArtisanId() result
 *                               = UUID if artisan was logged in
 *                               = "hassan_benali" (normalized name) if not
 *     - V2-A1 missions.artisan_profile_id = whatever was in assigned_artisan_id
 *     - V2-A2 fetches WHERE artisan_profile_id = URL id param
 *     → MISMATCH when normalized name != numeric/UUID id
 *
 * SOLUTION:
 *   One canonical resolver used everywhere.
 *   Every artisan object resolves to a CANONICAL ID + an ALIAS SET.
 *   Writes use canonical ID. Reads match against alias set.
 *
 * CANONICAL PRIORITY ORDER:
 *   1. artisan._supabase_id   — raw Supabase UUID (strongest, never collides)
 *   2. artisan.owner_account_id — authenticated owner UUID
 *   3. artisan.id              — legacy numeric ID (Population A) or UUID fallback
 *   4. artisan.public_id / artisan_id / artisan.profileId
 *   5. buildStableArtisanId(name) — normalized name slug (last resort, alias-only)
 *
 * ALIAS SET:
 *   All values from (1)-(5) that exist.
 *   Any single alias match = artisan match.
 *   Normalized name is ALWAYS an alias (never demoted, never primary if stronger exists).
 *
 * NEVER TOUCHES:
 *   fixeo-client-requests-store.js
 *   mission-lifecycle-p2.js (reads through artisanIdFromProfile — compatible)
 *   reservation.js booking flow (lifecycle unchanged)
 *   cod-payment.js / slot-lock.js
 *   V1-A through V1-J rendering
 *   Supabase schema (no new columns needed)
 *
 * BACKWARD COMPATIBILITY:
 *   Old localStorage records with assigned_artisan_id = "hassan_benali" continue
 *   to work: the alias set includes the normalized name, so legacy matches succeed.
 *   V2-A2 enriches matching by checking aliases, not just exact artisan_profile_id.
 */

(function (window) {
  'use strict';

  if (window._fxIdentityLoaded) return;
  window._fxIdentityLoaded = true;

  /* ════════════════════════════════════════════════════════════
     TEXT NORMALIZATION
     Matches buildStableArtisanId() in fixeo-client-requests-store.js exactly.
     Critical: same normalization = same alias for legacy matching.
  ════════════════════════════════════════════════════════════ */
  function _normalizeText(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s_|-]/g, '').trim();
  }

  function _buildNameSlug(name) {
    var normalized = _normalizeText(name);
    return normalized ? normalized.replace(/\s+/g, '_') : '';
  }

  /* Reject empty, placeholder, demo IDs */
  function _isValid(id) {
    if (!id || typeof id !== 'string') return false;
    var s = id.trim().toLowerCase();
    return !!s
      && s !== 'artisan-fixeo'
      && s !== 'fixeo'
      && s !== 'demo'
      && s !== '0'
      && s.length >= 2;
  }

  /* ════════════════════════════════════════════════════════════
     RESOLVE CANONICAL ID
     Returns the strongest single ID from an artisan-like object.
     Priority: _supabase_id > owner_account_id > id > public_id > artisan_id > name slug
  ════════════════════════════════════════════════════════════ */
  function resolveCanonicalId(artisanLike) {
    if (!artisanLike || typeof artisanLike !== 'object') return '';

    var candidates = [
      artisanLike._supabase_id,
      artisanLike.owner_account_id,
      artisanLike.id,
      artisanLike.artisan_id,
      artisanLike.public_id,
      artisanLike.profileId,
      artisanLike.assigned_artisan_id,
    ].map(function(v) { return String(v || '').trim(); })
     .filter(_isValid);

    /* Return first valid candidate (highest priority order above) */
    if (candidates.length) return candidates[0];

    /* Last resort: normalized name slug (alias-only, never exposed as canonical
     * when any real ID exists above) */
    var nameSlug = _buildNameSlug(artisanLike.name || artisanLike.assigned_artisan || '');
    return _isValid(nameSlug) ? nameSlug : '';
  }

  /* ════════════════════════════════════════════════════════════
     RESOLVE ALL ALIASES
     Returns a deduplicated array of all valid IDs for this artisan.
     Used for matching: if ANY alias matches a stored value, it's a match.
     Includes normalized name slug always (backward compat with legacy records).
  ════════════════════════════════════════════════════════════ */
  function resolveAliases(artisanLike) {
    if (!artisanLike || typeof artisanLike !== 'object') return [];

    var raw = [
      artisanLike._supabase_id,
      artisanLike.owner_account_id,
      artisanLike.id,
      artisanLike.artisan_id,
      artisanLike.public_id,
      artisanLike.profileId,
      artisanLike.assigned_artisan_id,
    ];

    /* Also include source_ids array (fixeo-public-artisan-profile.js format) */
    if (Array.isArray(artisanLike.source_ids)) {
      artisanLike.source_ids.forEach(function(v) { raw.push(v); });
    }

    /* Always add normalized name slug for legacy matching */
    var nameSlug = _buildNameSlug(
      artisanLike.name || artisanLike.assigned_artisan || artisanLike.full_name || ''
    );
    if (nameSlug) raw.push(nameSlug);

    /* Deduplicate */
    var seen = {};
    return raw.map(function(v) { return String(v || '').trim(); })
              .filter(function(v) {
                if (!_isValid(v)) return false;
                if (seen[v]) return false;
                seen[v] = true;
                return true;
              });
  }

  /* ════════════════════════════════════════════════════════════
     MATCH
     Returns true if artisan A matches artisan/ID B.
     B can be: artisan object, ID string, or request object.
  ════════════════════════════════════════════════════════════ */
  function matchArtisanIdentity(artisanA, artisanOrIdB) {
    if (!artisanA || !artisanOrIdB) return false;

    var aliasesA = resolveAliases(artisanA);
    if (!aliasesA.length) return false;

    /* B is a plain string (id) */
    if (typeof artisanOrIdB === 'string') {
      var bId = artisanOrIdB.trim();
      if (!_isValid(bId)) return false;
      /* Also check normalized name slug of B */
      var bSlug = _buildNameSlug(bId);
      return aliasesA.indexOf(bId) !== -1 || (bSlug && aliasesA.indexOf(bSlug) !== -1);
    }

    /* B is an artisan/request object */
    var aliasesB = resolveAliases(artisanOrIdB);
    if (!aliasesB.length) {
      /* Try name-based match from B */
      var bName = String(
        artisanOrIdB.name || artisanOrIdB.artisan_name ||
        artisanOrIdB.assigned_artisan || artisanOrIdB.full_name || ''
      ).trim();
      if (bName) aliasesB.push(_buildNameSlug(bName));
    }

    /* Any intersection between alias sets = match */
    return aliasesB.some(function(b) { return aliasesA.indexOf(b) !== -1; });
  }

  /* ════════════════════════════════════════════════════════════
     ENRICH REQUEST
     Attaches canonical identity fields to a request object.
     Called BEFORE writing to localStorage or Supabase.
     Non-destructive: only ADDS fields, never removes existing ones.
     Non-blocking: called synchronously.
  ════════════════════════════════════════════════════════════ */
  function attachCanonicalIdToRequest(req, artisanLike) {
    if (!req || typeof req !== 'object') return req;
    if (!artisanLike || typeof artisanLike !== 'object') return req;

    var canonical = resolveCanonicalId(artisanLike);
    var aliases   = resolveAliases(artisanLike);
    var name      = String(
      artisanLike.name || artisanLike.full_name || artisanLike.assigned_artisan || ''
    ).trim() || null;

    /* Add canonical fields without overwriting existing strong values */
    if (canonical && !req.artisan_id_canonical) {
      req.artisan_id_canonical = canonical;
    }
    if (canonical && !req.artisan_profile_id) {
      req.artisan_profile_id = canonical;
    } else if (canonical && req.artisan_profile_id) {
      /* If existing artisan_profile_id is a weak name slug but we now have a stronger ID, upgrade */
      var existingIsSlug = /^[a-z][a-z0-9_]+$/.test(req.artisan_profile_id)
                        && !req.artisan_profile_id.includes('-')     /* UUIDs have hyphens */
                        && req.artisan_profile_id.length < 30;       /* UUIDs are 36 chars */
      if (existingIsSlug && canonical !== req.artisan_profile_id) {
        req.artisan_profile_id = canonical;
      }
    }
    if (name && !req.artisan_name) {
      req.artisan_name = name;
    }
    /* Store alias set for future matching (compact, not sent to Supabase) */
    if (aliases.length) {
      req._artisan_aliases = aliases;
    }

    return req;
  }

  /* ════════════════════════════════════════════════════════════
     MATCH REQUEST TO ARTISAN
     Used by V2-A2 and V1-H/J to determine if a localStorage request
     belongs to a specific artisan. Checks ALL alias dimensions.
  ════════════════════════════════════════════════════════════ */
  function requestMatchesArtisan(req, artisanLike) {
    if (!req || !artisanLike) return false;

    var artisanAliases = resolveAliases(artisanLike);
    if (!artisanAliases.length) return false;

    /* Request-side identity values */
    var reqIds = [
      req.artisan_id_canonical,
      req.artisan_profile_id,
      req.assigned_artisan_id,
      req.artisan_id,
    ].map(function(v) { return String(v || '').trim(); }).filter(_isValid);

    /* Also check stored alias set */
    if (Array.isArray(req._artisan_aliases)) {
      req._artisan_aliases.forEach(function(v) {
        var s = String(v || '').trim();
        if (_isValid(s)) reqIds.push(s);
      });
    }

    /* Name-based fallback: normalize artisan_name from both sides */
    var reqNameSlug = _buildNameSlug(
      req.artisan_name || req.assigned_artisan || ''
    );
    if (reqNameSlug) reqIds.push(reqNameSlug);

    /* Match: any req ID is in artisan alias set */
    return reqIds.some(function(rid) {
      return artisanAliases.indexOf(rid) !== -1;
    });
  }

  /* ════════════════════════════════════════════════════════════
     CURRENT ARTISAN ID (for artisan-side dashboard)
     Reads from localStorage in priority order matching mission-lifecycle-p2.js.
     Returns canonical ID usable for Supabase writes.
  ════════════════════════════════════════════════════════════ */
  function currentArtisanId() {
    try {
      var sb  = (localStorage.getItem('sb_user_id')      || '').trim();
      var uid = (localStorage.getItem('user_id')          || '').trim();
      var fid = (localStorage.getItem('fixeo_user_id')    || '').trim();
      var aid = (localStorage.getItem('fixeo_artisan_id') || '').trim();
      /* Priority: sb_user_id (UUID from Supabase) > others */
      return sb || uid || fid || aid || '';
    } catch(e) { return ''; }
  }

  /* ════════════════════════════════════════════════════════════
     FROM PROFILE ARTISAN
     Extracts canonical ID from window._fixeoCurrentArtisan
     (set by fixeo-profile-v2a.js after Supabase fetch).
     For use by portfolio and trust systems.
  ════════════════════════════════════════════════════════════ */
  function fromProfileArtisan() {
    try {
      var a = window._fixeoCurrentArtisan;
      if (!a) return '';
      return resolveCanonicalId(a);
    } catch(e) { return ''; }
  }

  /* ════════════════════════════════════════════════════════════
     FROM URL PARAM
     Returns the ?id= URL parameter as-is (may be numeric or UUID).
     Used as the "display id" and marketplace lookup key.
  ════════════════════════════════════════════════════════════ */
  function fromUrlParam() {
    try {
      return (new URLSearchParams(window.location.search).get('id') || '').trim();
    } catch(e) { return ''; }
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API — window.FixeoArtisanIdentity
  ════════════════════════════════════════════════════════════ */
  window.FixeoArtisanIdentity = {
    version: 'v2a3',

    /* Core resolution */
    resolveCanonicalId:        resolveCanonicalId,
    resolveAliases:            resolveAliases,
    matchArtisanIdentity:      matchArtisanIdentity,
    requestMatchesArtisan:     requestMatchesArtisan,

    /* Write enrichment */
    attachCanonicalIdToRequest: attachCanonicalIdToRequest,

    /* Context helpers */
    currentArtisanId:          currentArtisanId,
    fromProfileArtisan:        fromProfileArtisan,
    fromUrlParam:              fromUrlParam,

    /* Utility */
    normalizeText:             _normalizeText,
    buildNameSlug:             _buildNameSlug,
    isValidId:                 _isValid,
  };

})(window);
