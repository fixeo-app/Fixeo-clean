/* FIXEO Enterprise B1 — tenant-scoped read-only operational model.
 * Reads only fields needed by the dashboard. Supabase RLS remains the authorization boundary.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FixeoEnterpriseReadModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var PAGE_SIZE = 250;
  var IN_CHUNK = 100;

  function fromPublic(client, table) {
    if (!client) throw new Error('CLIENT_REQUIRED');
    if (typeof client.schema === 'function') return client.schema('public').from(table);
    if (typeof client.from === 'function') return client.from(table);
    throw new Error('DATA_API_UNAVAILABLE');
  }

  async function paged(factory) {
    var rows = [];
    for (var offset = 0; ; offset += PAGE_SIZE) {
      var response = await factory(offset, offset + PAGE_SIZE - 1);
      if (!response || response.error || !Array.isArray(response.data)) throw new Error('READ_FAILED');
      rows = rows.concat(response.data);
      if (response.data.length < PAGE_SIZE) return rows;
    }
  }

  function chunks(values, size) {
    var out = [];
    for (var i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
    return out;
  }

  async function loadSites(client, enterpriseId) {
    return paged(function (from, to) {
      return fromPublic(client, 'enterprise_sites')
        .select('id,enterprise_id,name,site_code,address_line,city,status,created_at,updated_at')
        .eq('enterprise_id', enterpriseId)
        .order('id', { ascending: true })
        .range(from, to);
    });
  }

  async function loadContexts(client, enterpriseId) {
    return paged(function (from, to) {
      return fromPublic(client, 'enterprise_request_context')
        .select('id,enterprise_id,site_id,service_request_id,created_at')
        .eq('enterprise_id', enterpriseId)
        .order('id', { ascending: true })
        .range(from, to);
    });
  }

  async function loadByIds(client, table, columns, key, ids) {
    var rows = [];
    for (const group of chunks(ids, IN_CHUNK)) {
      var groupRows = await paged(function (from, to) {
        return fromPublic(client, table)
          .select(columns)
          .in(key, group)
          .order('id', { ascending: true })
          .range(from, to);
      });
      rows = rows.concat(groupRows);
    }
    return rows;
  }

  function latestMissionMap(missions) {
    var map = new Map();
    missions.forEach(function (mission) {
      var key = String(mission.request_id || '');
      if (!key) return;
      var current = map.get(key);
      var currentAt = current && current.created_at ? Date.parse(current.created_at) : 0;
      var nextAt = mission.created_at ? Date.parse(mission.created_at) : 0;
      if (!current || nextAt >= currentAt) map.set(key, mission);
    });
    return map;
  }

  async function load(client, enterpriseId) {
    if (!UUID_RE.test(String(enterpriseId || ''))) throw new Error('INVALID_ENTERPRISE_ID');

    var pair = await Promise.all([
      loadSites(client, enterpriseId),
      loadContexts(client, enterpriseId),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_members')
          .select('id,enterprise_id,user_id,role,status,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('id', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_member_sites')
          .select('id,enterprise_id,member_id,site_id,created_at')
          .eq('enterprise_id', enterpriseId)
          .order('id', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_invitations')
          .select('id,enterprise_id,email_normalized,role,target_user_id,status,expires_at,accepted_at,revoked_at,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: false })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_sla_policies')
          .select('id,enterprise_id,site_id,urgency,acceptance_target_minutes,status,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: true })
          .range(from, to);
      })
    ]);
    var sites = pair[0];
    var contexts = pair[1];
    var members = pair[2];
    var memberSites = pair[3];
    var invitations = pair[4];
    var slaPolicies = pair[5];

    var requestIds = Array.from(new Set(contexts.map(function (row) {
      return String(row.service_request_id || '');
    }).filter(Boolean)));

    var requests = requestIds.length ? await loadByIds(
      client,
      'service_requests',
      'id,service_category,city,status,created_at,urgency',
      'id',
      requestIds
    ) : [];

    var missions = requestIds.length ? await loadByIds(
      client,
      'missions',
      'id,request_id,status,created_at,accepted_at',
      'request_id',
      requestIds
    ) : [];

    var slaRows = requestIds.length ? await loadByIds(
      client,
      'enterprise_request_sla',
      'id,service_request_id,enterprise_id,site_id,policy_id,policy_urgency,request_urgency,acceptance_target_minutes,started_at,at_risk_at,due_at,created_at',
      'service_request_id',
      requestIds
    ) : [];

    var siteMap = new Map(sites.map(function (site) { return [String(site.id), site]; }));
    var contextMap = new Map(contexts.map(function (ctx) { return [String(ctx.service_request_id), ctx]; }));
    var missionMap = latestMissionMap(missions);
    var slaMap = new Map(slaRows.map(function (row) { return [String(row.service_request_id), row]; }));

    var interventions = requests.map(function (request) {
      var id = String(request.id);
      var context = contextMap.get(id);
      var site = context ? siteMap.get(String(context.site_id)) : null;
      var mission = missionMap.get(id) || null;
      var sla = slaMap.get(id) || null;
      return {
        id: id,
        site_id: context ? String(context.site_id) : '',
        site_name: site ? String(site.name || '') : '',
        site_code: site ? String(site.site_code || '') : '',
        service_category: String(request.service_category || ''),
        city: String(request.city || (site && site.city) || ''),
        urgency: String(request.urgency || ''),
        request_status: String(request.status || ''),
        mission_status: mission ? String(mission.status || '') : '',
        created_at: request.created_at || (context && context.created_at) || null,
        accepted_at: mission && mission.accepted_at || null,
        sla: sla ? Object.freeze({
          id: String(sla.id || ''),
          policy_source: sla.policy_id ? 'enterprise_policy' : 'fixeo_default',
          policy_urgency: String(sla.policy_urgency || ''),
          request_urgency: String(sla.request_urgency || ''),
          acceptance_target_minutes: Number(sla.acceptance_target_minutes || 0),
          started_at: sla.started_at || null,
          at_risk_at: sla.at_risk_at || null,
          due_at: sla.due_at || null
        }) : null
      };
    }).sort(function (a, b) {
      return (Date.parse(b.created_at || 0) || 0) - (Date.parse(a.created_at || 0) || 0);
    });

    var memberAssignments = new Map();
    memberSites.forEach(function (row) {
      var key = String(row.member_id || '');
      if (!memberAssignments.has(key)) memberAssignments.set(key, []);
      memberAssignments.get(key).push(String(row.site_id || ''));
    });

    return Object.freeze({
      sites: sites.map(function (site) {
        return Object.freeze({
          id: String(site.id),
          name: String(site.name || ''),
          site_code: String(site.site_code || ''),
          address_line: String(site.address_line || ''),
          city: String(site.city || ''),
          status: String(site.status || '')
        });
      }),
      interventions: interventions.map(Object.freeze),
      members: members.map(function (member) {
        return Object.freeze({
          id: String(member.id || ''),
          user_id: String(member.user_id || ''),
          role: String(member.role || ''),
          status: String(member.status || ''),
          site_ids: Object.freeze((memberAssignments.get(String(member.id || '')) || []).slice())
        });
      }),
      invitations: invitations.map(function (invitation) {
        return Object.freeze({
          id: String(invitation.id || ''),
          email: String(invitation.email_normalized || ''),
          role: String(invitation.role || ''),
          status: String(invitation.status || ''),
          target_user_id: invitation.target_user_id ? String(invitation.target_user_id) : '',
          expires_at: invitation.expires_at || null,
          accepted_at: invitation.accepted_at || null,
          revoked_at: invitation.revoked_at || null,
          created_at: invitation.created_at || null
        });
      }),
      sla_policies: slaPolicies.map(function (policy) {
        return Object.freeze({
          id: String(policy.id || ''),
          site_id: policy.site_id ? String(policy.site_id) : '',
          urgency: policy.urgency == null ? '' : String(policy.urgency),
          acceptance_target_minutes: Number(policy.acceptance_target_minutes || 0),
          status: String(policy.status || ''),
          created_at: policy.created_at || null,
          updated_at: policy.updated_at || null
        });
      })
    });
  }

  return Object.freeze({ load: load });
});
