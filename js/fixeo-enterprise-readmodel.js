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

    var sessionResponse = client.auth && typeof client.auth.getSession === 'function'
      ? await client.auth.getSession()
      : { data: { session: null }, error: null };
    var currentUserId = sessionResponse && sessionResponse.data && sessionResponse.data.session &&
      sessionResponse.data.session.user ? String(sessionResponse.data.session.user.id || '') : '';

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
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_workforce_workers')
          .select('id,enterprise_id,member_id,display_label,employee_code,status,availability,all_sites,max_concurrent_jobs,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_workforce_skills')
          .select('id,enterprise_id,worker_id,service_category,skill_level,active,created_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_workforce_sites')
          .select('id,enterprise_id,worker_id,site_id,created_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_dispatch_policies')
          .select('id,enterprise_id,site_id,service_category,mode,internal_offer_limit,offer_ttl_minutes,fallback_after_minutes,status,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: true })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_internal_dispatch_offers')
          .select('id,enterprise_id,service_request_id,worker_id,status,score,offered_at,expires_at,responded_at')
          .eq('enterprise_id', enterpriseId)
          .order('offered_at', { ascending: false })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_internal_assignments')
          .select('id,enterprise_id,service_request_id,worker_id,offer_id,status,assigned_at,started_at,completed_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('assigned_at', { ascending: false })
          .range(from, to);
      }),
      paged(function (from, to) {
        return fromPublic(client, 'enterprise_hybrid_dispatch_state')
          .select('service_request_id,enterprise_id,policy_id,mode,status,fallback_due_at,external_dispatched_at,created_at,updated_at')
          .eq('enterprise_id', enterpriseId)
          .order('created_at', { ascending: false })
          .range(from, to);
      })
    ]);
    var sites = pair[0];
    var contexts = pair[1];
    var members = pair[2];
    var memberSites = pair[3];
    var invitations = pair[4];
    var slaPolicies = pair[5];
    var workforceWorkers = pair[6];
    var workforceSkills = pair[7];
    var workforceSites = pair[8];
    var dispatchPolicies = pair[9];
    var internalOffers = pair[10];
    var internalAssignments = pair[11];
    var hybridStates = pair[12];

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
    var assignmentMap = new Map(internalAssignments.map(function (row) {
      return [String(row.service_request_id), row];
    }));
    var hybridStateMap = new Map(hybridStates.map(function (row) {
      return [String(row.service_request_id), row];
    }));

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
        internal_assignment: assignmentMap.has(id) ? Object.freeze({
          id: String(assignmentMap.get(id).id || ''),
          worker_id: String(assignmentMap.get(id).worker_id || ''),
          status: String(assignmentMap.get(id).status || ''),
          assigned_at: assignmentMap.get(id).assigned_at || null,
          started_at: assignmentMap.get(id).started_at || null,
          completed_at: assignmentMap.get(id).completed_at || null
        }) : null,
        hybrid_dispatch: hybridStateMap.has(id) ? Object.freeze({
          mode: String(hybridStateMap.get(id).mode || ''),
          status: String(hybridStateMap.get(id).status || ''),
          fallback_due_at: hybridStateMap.get(id).fallback_due_at || null,
          external_dispatched_at: hybridStateMap.get(id).external_dispatched_at || null
        }) : null,
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

    var workforceSkillMap = new Map();
    workforceSkills.forEach(function (row) {
      var key = String(row.worker_id || '');
      if (!workforceSkillMap.has(key)) workforceSkillMap.set(key, []);
      workforceSkillMap.get(key).push(Object.freeze({
        service_category: String(row.service_category || ''),
        skill_level: Number(row.skill_level || 0),
        active: row.active === true
      }));
    });
    var workforceSiteMap = new Map();
    workforceSites.forEach(function (row) {
      var key = String(row.worker_id || '');
      if (!workforceSiteMap.has(key)) workforceSiteMap.set(key, []);
      workforceSiteMap.get(key).push(String(row.site_id || ''));
    });
    var selfMember = members.find(function (member) {
      return String(member.user_id || '') === currentUserId;
    });
    var selfMemberId = selfMember ? String(selfMember.id || '') : '';
    var selfWorker = workforceWorkers.find(function (worker) {
      return String(worker.member_id || '') === selfMemberId;
    });
    var myWorkerId = selfWorker ? String(selfWorker.id || '') : '';

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
      }),
      workforce: Object.freeze({
        my_worker_id: myWorkerId,
        workers: workforceWorkers.map(function (worker) {
          var id=String(worker.id||'');
          return Object.freeze({
            id:id,
            member_id:String(worker.member_id||''),
            display_label:String(worker.display_label||''),
            employee_code:String(worker.employee_code||''),
            status:String(worker.status||''),
            availability:String(worker.availability||''),
            all_sites:worker.all_sites===true,
            max_concurrent_jobs:Number(worker.max_concurrent_jobs||1),
            skills:Object.freeze((workforceSkillMap.get(id)||[]).slice()),
            site_ids:Object.freeze((workforceSiteMap.get(id)||[]).slice())
          });
        }),
        dispatch_policies: dispatchPolicies.map(function (p) {
          return Object.freeze({
            id:String(p.id||''),
            site_id:p.site_id?String(p.site_id):'',
            service_category:String(p.service_category||''),
            mode:String(p.mode||''),
            internal_offer_limit:Number(p.internal_offer_limit||0),
            offer_ttl_minutes:Number(p.offer_ttl_minutes||0),
            fallback_after_minutes:Number(p.fallback_after_minutes||0),
            status:String(p.status||'')
          });
        }),
        offers: internalOffers.map(function (o) {
          return Object.freeze({
            id:String(o.id||''),
            service_request_id:String(o.service_request_id||''),
            worker_id:String(o.worker_id||''),
            status:String(o.status||''),
            score:Number(o.score||0),
            offered_at:o.offered_at||null,
            expires_at:o.expires_at||null
          });
        }),
        assignments: internalAssignments.map(function (a) {
          return Object.freeze({
            id:String(a.id||''),
            service_request_id:String(a.service_request_id||''),
            worker_id:String(a.worker_id||''),
            status:String(a.status||''),
            assigned_at:a.assigned_at||null,
            started_at:a.started_at||null,
            completed_at:a.completed_at||null
          });
        }),
        dispatch_states: hybridStates.map(function (d) {
          return Object.freeze({
            service_request_id:String(d.service_request_id||''),
            policy_id:d.policy_id?String(d.policy_id):'',
            mode:String(d.mode||''),
            status:String(d.status||''),
            fallback_due_at:d.fallback_due_at||null,
            external_dispatched_at:d.external_dispatched_at||null
          });
        })
      })
    });
  }

  return Object.freeze({ load: load });
});
