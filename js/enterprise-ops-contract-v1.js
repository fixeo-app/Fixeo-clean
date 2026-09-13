// ============================================================
// enterprise-ops-contract-v1.js
// BP11 — Operations Command Center Query Contract
// ============================================================
// DOCTRINE:
//   - Canonical Enterprise linkage via enterprise_request_context ONLY
//   - No service_requests.enterprise_site_id
//   - missions.request_id is TEXT — always cast UUID side (String(srId))
//   - artisan name omitted — enterprise members cannot SELECT artisans
//   - Mission data is optional: null-safe throughout (BP09 RLS may not be applied)
//   - site_manager scoping enforced by server-side RLS; JS does NOT duplicate it
// ============================================================

(function (global) {
  'use strict';

  // ── Constants ─────────────────────────────────────────────
  var PAGE_SIZE          = 20;
  var STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

  // Status vocabulary (canonical service_requests.status values)
  var OPEN_STATUSES       = ['new', 'assigned', 'in_progress'];
  var URGENT_URGENCIES    = ['now', 'urgent'];
  var AWAITING_VALIDATION = 'completed';

  // ── Supabase client accessor ───────────────────────────────
  // Resolves _sb from global scope (set by enterprise-dashboard-v1.js)
  function getSb() {
    if (typeof _sb !== 'undefined') return _sb;
    if (global._sb) return global._sb;
    throw new Error('Supabase client (_sb) not available');
  }

  // ── needsAttention ─────────────────────────────────────────
  // Returns true if the row requires immediate operator attention.
  // row: { urgency, status, ageMs }
  function needsAttention(row) {
    if (!row) return false;
    var urgency = row.urgency || '';
    var status  = row.status  || '';
    var ageMs   = typeof row.ageMs === 'number' ? row.ageMs : 0;

    // Urgent + unstarted
    if (urgency === 'now' && (status === 'new' || status === 'assigned')) {
      return true;
    }
    // Awaiting validation
    if (status === AWAITING_VALIDATION) {
      return true;
    }
    // Stale: open > 48h
    if (ageMs > STALE_THRESHOLD_MS && (status === 'new' || status === 'assigned')) {
      return true;
    }
    return false;
  }

  // ── buildCursor ────────────────────────────────────────────
  // Extract pagination cursor from the last row in a result set.
  // Returns null if rows is empty.
  function buildCursor(rows) {
    if (!rows || rows.length === 0) return null;
    var last = rows[rows.length - 1];
    return {
      lastCreatedAt: last.createdAt || last.created_at || null,
      lastId:        last.id        || null,
    };
  }

  // ── applyCursor ────────────────────────────────────────────
  // Apply cursor to a Supabase query for keyset pagination.
  // Cursor: { lastCreatedAt, lastId }
  // Returns the modified query.
  function applyCursor(query, cursor) {
    if (!cursor || !cursor.lastCreatedAt) return query;
    // Primary: created_at < lastCreatedAt  (strictly older)
    // Tie-break: if same timestamp, id < lastId
    return query.or(
      'created_at.lt.' + cursor.lastCreatedAt +
      ',and(created_at.eq.' + cursor.lastCreatedAt + ',id.lt.' + cursor.lastId + ')'
    );
  }

  // ── fetchOperationsQueue ───────────────────────────────────
  // Fetch one page of the operations queue for an enterprise.
  //
  // enterpriseId: UUID string
  // filters: {
  //   site:           enterprise_sites.id or ''
  //   status:         service_requests.status or ''
  //   urgency:        service_requests.urgency or ''
  //   search:         freetext (category / description) or ''
  //   needsAttention: boolean
  //   cursor:         { lastCreatedAt, lastId } or null
  // }
  //
  // Returns: { rows: [...], cursor, exhausted }
  // Throws on unrecoverable query error.
  //
  // Row shape:
  // {
  //   id, ercId, siteId, siteName,
  //   category, urgency, status, description, city,
  //   createdAt, ageMs
  // }
  async function fetchOperationsQueue(enterpriseId, filters) {
    var sb = getSb();
    filters = filters || {};

    if (!enterpriseId) {
      throw new Error('fetchOperationsQueue: enterpriseId is required');
    }

    // Build query: service_requests joined via enterprise_request_context + sites
    // RLS on service_requests + enterprise_request_context enforces tenant isolation
    // and site_manager scoping — no client-side duplication needed.
    var query = sb
      .from('service_requests')
      .select(
        'id, status, category, urgency, description, created_at, city,' +
        'enterprise_request_context!inner(id, enterprise_id, site_id,' +
        'enterprise_sites!inner(id, name, site_code, city))'
      )
      .eq('enterprise_request_context.enterprise_id', enterpriseId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    // Optional filters
    if (filters.site) {
      query = query.eq('enterprise_request_context.site_id', filters.site);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.urgency) {
      query = query.eq('urgency', filters.urgency);
    }
    if (filters.search) {
      var term = '%' + filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
      query = query.or('category.ilike.' + term + ',description.ilike.' + term);
    }

    // Cursor pagination
    if (filters.cursor) {
      query = applyCursor(query, filters.cursor);
    }

    var result = await query;
    if (result.error) throw result.error;

    var raw  = result.data || [];
    var now  = Date.now();
    var rows = raw.map(function (r) {
      var erc   = Array.isArray(r.enterprise_request_context)
                  ? r.enterprise_request_context[0]
                  : r.enterprise_request_context;
      var site  = erc && (Array.isArray(erc.enterprise_sites)
                  ? erc.enterprise_sites[0]
                  : erc.enterprise_sites);
      var createdAt = r.created_at;
      var ageMs     = createdAt ? now - new Date(createdAt).getTime() : 0;
      return {
        id:          r.id,
        ercId:       erc ? erc.id   : null,
        siteId:      erc ? erc.site_id : null,
        siteName:    site ? site.name : '—',
        siteCode:    site ? site.site_code : '',
        category:    r.category    || '',
        urgency:     r.urgency     || 'normale',
        status:      r.status      || '',
        description: r.description || '',
        city:        r.city        || '',
        createdAt:   createdAt,
        ageMs:       ageMs,
      };
    });

    // Client-side needsAttention filter (applied after DB result)
    if (filters.needsAttention) {
      rows = rows.filter(needsAttention);
    }

    var cursor     = buildCursor(rows);
    var exhausted  = raw.length < PAGE_SIZE;

    return { rows: rows, cursor: cursor, exhausted: exhausted };
  }

  // ── fetchMissionForRequest ─────────────────────────────────
  // Returns the most recent mission for a service_request, or null.
  // Never throws — catches all errors (RLS may block; BP09 may not be applied).
  //
  // srId: service_request UUID (will be cast to string)
  //
  // Returns: { id, status, artisan_profile_id, started_at, completed_at, created_at }
  //          or null
  async function fetchMissionForRequest(srId) {
    if (!srId) return null;
    try {
      var sb = getSb();
      var result = await sb
        .from('missions')
        .select('id, status, artisan_profile_id, started_at, completed_at, created_at')
        .eq('request_id', String(srId))        // TEXT cast — critical
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) {
        // RLS denial or schema mismatch — treat as no mission, never propagate
        return null;
      }
      return result.data || null;
    } catch (_) {
      return null;
    }
  }

  // ── fetchOperationsKpis ────────────────────────────────────
  // Compute KPI counts for the enterprise operations strip.
  // Uses a count-only query for speed; falls back gracefully.
  //
  // Returns: {
  //   open:              number,
  //   urgent:            number,
  //   awaiting:          number,
  //   activeMissions:    number | null   (null = RLS blocked / unknown)
  // }
  async function fetchOperationsKpis(enterpriseId) {
    if (!enterpriseId) return { open: 0, urgent: 0, awaiting: 0, activeMissions: null };
    var sb = getSb();

    // Single query: fetch all statuses/urgencies for the enterprise
    // Count-only with head:true is more efficient but Supabase JS client
    // requires select for filtering — use minimal select.
    try {
      var result = await sb
        .from('service_requests')
        .select(
          'id, status, urgency,' +
          'enterprise_request_context!inner(enterprise_id)',
          { count: 'exact' }
        )
        .eq('enterprise_request_context.enterprise_id', enterpriseId)
        .in('status', ['new', 'assigned', 'in_progress', 'completed']);

      if (result.error) {
        return { open: 0, urgent: 0, awaiting: 0, activeMissions: null };
      }

      var rows = result.data || [];
      var open    = rows.filter(function(r){ return OPEN_STATUSES.indexOf(r.status) !== -1; }).length;
      var urgent  = rows.filter(function(r){ return URGENT_URGENCIES.indexOf(r.urgency) !== -1; }).length;
      var awaiting= rows.filter(function(r){ return r.status === AWAITING_VALIDATION; }).length;

      // Active missions count — attempt, fall back to null
      var activeMissions = null;
      try {
        // Join via enterprise_request_context to scope to this enterprise
        var mResult = await sb
          .from('missions')
          .select(
            'id,' +
            'service_requests!inner(enterprise_request_context!inner(enterprise_id))',
            { count: 'exact' }
          )
          .eq(
            'service_requests.enterprise_request_context.enterprise_id',
            enterpriseId
          )
          .in('status', ['pending', 'in_progress', 'done']);
        if (!mResult.error && mResult.data) {
          activeMissions = mResult.data.length;
        }
      } catch (_) { /* missions query optional */ }

      return { open: open, urgent: urgent, awaiting: awaiting, activeMissions: activeMissions };
    } catch (_) {
      return { open: 0, urgent: 0, awaiting: 0, activeMissions: null };
    }
  }

  // ── Expose module ──────────────────────────────────────────
  global.EnterpriseOpsContract = {
    PAGE_SIZE:              PAGE_SIZE,
    STALE_THRESHOLD_MS:     STALE_THRESHOLD_MS,
    OPEN_STATUSES:          OPEN_STATUSES,
    URGENT_URGENCIES:       URGENT_URGENCIES,
    fetchOperationsQueue:   fetchOperationsQueue,
    fetchMissionForRequest: fetchMissionForRequest,
    fetchOperationsKpis:    fetchOperationsKpis,
    needsAttention:         needsAttention,
    buildCursor:            buildCursor,
    applyCursor:            applyCursor,
  };

}(typeof window !== 'undefined' ? window : global));

// ── Schema gap notes (for BP11 UX) ────────────────────────────
// GAP-1: missions RLS
//   BP09 (supabase/bp09-enterprise-rls-and-schema.sql) adds
//   enterprise_non_sm_missions_read and enterprise_sm_missions_read.
//   Until applied to production, fetchMissionForRequest returns null
//   for all enterprise members. UX must show "Aucune mission (non chargée)"
//   gracefully and never hard-fail the request list.
//
// GAP-2: artisan name
//   enterprise members cannot SELECT artisans directly via RLS.
//   artisan_profile_id is returned by fetchMissionForRequest but
//   the name is not resolved. If name display is required in future,
//   a SECURITY DEFINER RPC must be created (out of BP11 scope).
//
// GAP-3: missions.request_id TEXT type
//   missions.request_id is TEXT (not UUID) in production.
//   Always call String(srId) on the JS side before .eq('request_id', ...).
//   Never cast missions.request_id to UUID in any SQL or RLS.
