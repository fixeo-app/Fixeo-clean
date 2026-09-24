const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { mount } = require('../../js/fixeo-enterprise-workspace.js');
const guard = require('../../js/fixeo-enterprise-guard.js');
const { fixture, member, account, uuid } = require('../auth-resolver/fixture.cjs');
const root = path.join(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('dashboard-enterprise.html');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function setup(t, options = {}, search = `?enterprise_id=${uuid(101)}`, mountOptions = {}) {
  const dom = new JSDOM(html, { url: 'https://fixture.invalid/dashboard-enterprise.html' + search,
    pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  const f = fixture({ enterprise_members: [member(1)], enterprise_accounts: [account(1)], ...options });
  let listener;
  f.client.auth.onAuthStateChange = fn => { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; } } } }; };
  f.client.auth.signOut = async () => {
    f.calls.push({ method: 'signOut' });
    if (f.state.signOutError) return { error: { message: 'offline' } };
    f.state.session = null;
    listener('SIGNED_OUT', null);
    return { error: null };
  };
  w.FixeoSupabaseClient = { CONFIGURED: true, ready: async () => ({ client: f.client }) };
  w.FixeoEnterpriseGuard = guard;
  w.FixeoEnterpriseReadModel = mountOptions.readModel || { load: async () => ({ sites: [], interventions: [] }) };
  w.FixeoEnterpriseSiteActions = mountOptions.siteActions || { canManage: () => false };
  w.FixeoEnterpriseRequestActions = mountOptions.requestActions || { canCreate: () => false };
  w.FixeoEnterpriseMemberActions = mountOptions.memberActions || { canManage: () => false };
  w.FixeoEnterpriseInvitationActions = mountOptions.invitationActions || { canManage: () => false };
  w.FixeoEnterpriseSlaPolicyActions = mountOptions.slaPolicyActions || { canManage: () => false };
  w.FixeoEnterpriseAudit = mountOptions.audit || {
    canView: role => role === 'owner' || role === 'admin',
    listPage: async () => ({ status:'ok',events:[],returned_count:0,has_more:false,next_cursor:null }),
    exportPeriod: async () => ({ status:'ok',events:[],returned_count:0,truncated:false }),
    safeDetails: () => ({})
  };
  w.FixeoEnterpriseReporting = mountOptions.reporting || { load: async () => ({
    operational: { request_count: 0, accepted_request_count: 0, acceptance_rate_percent: null,
      avg_first_acceptance_minutes: null, completed_mission_request_count: 0 },
    sla: { eligible_count: 0, met_count: 0, breached_count: 0, on_track_count: 0,
      at_risk_count: 0, sla_met_rate_percent: null },
    sites: [],
    breakdown: { by_service_category: [], by_urgency: [], by_request_status: [] }
  }) };
  w.eval(read('js/fixeo-logout-global.js'));
  const navigations = [];
  const app = mount(w, { navigate: p => navigations.push(p), ...mountOptions });
  t.after(() => { app.destroy(); w.close(); });
  await tick();
  return { ...f, w, app, navigations, q: id => w.document.getElementById(id), event: (...args) => listener(...args) };
}
test('U01 Successful shell renders only selected company; untrusted name is plain text', async t => {
  const unsafe = '<img src=x onerror=alert(1)>';
  const s = await setup(t, { enterprise_accounts: [account(1, 'active', unsafe), account(2)], enterprise_members: [member(1), member(2)] });
  assert.equal(s.q('enterprise-workspace').hidden, false);
  assert.equal(s.q('enterprise-name').textContent, unsafe);
  assert.equal(s.q('enterprise-name').children.length, 0);
  assert.equal(s.q('enterprise-role').textContent, 'Propriétaire');
  assert.equal(s.w.document.activeElement, s.q('enterprise-name'));
  assert.equal(s.w.document.body.textContent.includes('Entreprise 2'), false);
});
test('U02 Guest redirects only to fixed Auth despite malicious return URL', async t => {
  const s = await setup(t, { session: null }, `?enterprise_id=${uuid(101)}&returnTo=https://evil.invalid`);
  assert.deepEqual(s.navigations, ['auth.html']); assert.equal(s.q('enterprise-workspace').hidden, true);
});
test('U03 Denied and malformed links expose no company data', async t => {
  for (const search of [`?enterprise_id=${uuid(999)}`, '?enterprise_id=malformed']) {
    const s = await setup(t, {}, search);
    assert.equal(s.q('enterprise-workspace').hidden, true);
    assert.equal(s.q('enterprise-name').textContent, '');
    assert.equal(s.q('enterprise-retry').hidden, true);
    assert.equal(s.q('main').getAttribute('aria-busy'), 'false');
  }
});
test('U04 Read error stays closed; retry uses fresh reads and recovers', async t => {
  const s = await setup(t, { errorTable: 'enterprise_accounts' });
  assert.equal(s.q('enterprise-workspace').hidden, true); assert.equal(s.q('enterprise-retry').hidden, false);
  s.state.errorTable = null; s.q('enterprise-retry').click(); await tick();
  assert.equal(s.q('enterprise-workspace').hidden, false);
});
test('U05 Canonical logout removes SDK session and auth cache, preserves operational data', async t => {
  const s = await setup(t);
  s.w.localStorage.setItem('fixeo_role', 'admin'); s.w.localStorage.setItem('fixeo_supabase_session', 'fixture');
  s.w.localStorage.setItem('fixeo_client_requests', 'preserved');
  s.w.sessionStorage.setItem('fixeo_admin_auth', 'forged');
  s.q('enterprise-logout').click(); await tick();
  assert.equal(s.state.session, null); assert.deepEqual(s.navigations, ['index.html']);
  assert.equal(s.w.localStorage.getItem('fixeo_role'), null);
  assert.equal(s.w.localStorage.getItem('fixeo_supabase_session'), null);
  assert.equal(s.w.sessionStorage.getItem('fixeo_admin_auth'), null);
  assert.equal(s.w.localStorage.getItem('fixeo_client_requests'), 'preserved');
  assert.equal(s.calls.filter(c => c.method === 'signOut').length, 1);
  assert.equal(s.q('enterprise-name').textContent, '');
});
test('U06 Masked canonical signOut error cannot become a successful logout', async t => {
  const s = await setup(t, { signOutError: true });
  s.q('enterprise-logout').click(); await tick();
  assert.deepEqual(s.navigations, []); assert.ok(s.state.session);
  assert.equal(s.q('state-title').textContent, 'Déconnexion non confirmée');
  assert.equal(s.q('enterprise-workspace').hidden, true);
  await s.app.refresh(); assert.equal(s.q('enterprise-workspace').hidden, true);
  s.state.signOutError = false; s.q('enterprise-logout').click(); await tick();
  assert.deepEqual(s.navigations, ['index.html']);
});
test('U07 Logout from another tab immediately clears and sends to Auth', async t => {
  const s = await setup(t); s.event('SIGNED_OUT');
  assert.equal(s.q('enterprise-name').textContent, ''); assert.deepEqual(s.navigations, ['auth.html']);
});
test('U08 Hidden/bfcache page never retains company text and revalidates on return', async t => {
  const s = await setup(t);
  s.w.dispatchEvent(new s.w.Event('pagehide'));
  assert.equal(s.q('enterprise-name').textContent, '');
  s.state.enterprise_members = [];
  s.w.dispatchEvent(new s.w.PageTransitionEvent('pageshow', { persisted: true })); await tick();
  assert.equal(s.q('enterprise-workspace').hidden, true);
  assert.equal(s.q('state-title').textContent, 'Cet espace n’est pas accessible');
});
test('U09 Auth changes invalidate pending resolution and stale company output', async t => {
  const s = await setup(t);
  let resolve;
  s.w.FixeoEnterpriseGuard = { ...guard, check: () => new Promise(r => { resolve = r; }) };
  const pending = s.app.refresh(); await tick();
  s.event('SIGNED_OUT');
  resolve({ allowed: true, status: 'OK', enterprise: { id: uuid(101), name: 'STALE', role: 'owner' } });
  await pending;
  assert.equal(s.q('enterprise-name').textContent, ''); assert.equal(s.q('enterprise-workspace').hidden, true);
});
test('U10 Offline SDK / hung reads cannot become local authority', async t => {
  const s = await setup(t);
  s.w.localStorage.setItem('fixeo_role', 'admin');
  s.w.FixeoSupabaseClient.ready = () => new Promise(() => {});
  s.app.destroy();
  const second = mount(s.w, { waitMs: 10, navigate: p => s.navigations.push(p) });
  t.after(() => second.destroy());
  assert.equal(s.q('main').getAttribute('aria-busy'), 'true');
  assert.equal(s.q('enterprise-workspace').hidden, true);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(s.q('state-title').textContent, 'Accès momentanément indisponible');
  assert.deepEqual(s.navigations, []);
});
test('U11 New page has isolated scripts, unique IDs, local links and no operational imports', () => {
  const dom = new JSDOM(html); const d = dom.window.document;
  assert.deepEqual([...d.scripts].map(s => s.getAttribute('src').split('?')[0]), [
    'js/supabase-client.js', 'js/fixeo-logout-global.js', 'js/fixeo-auth-resolver.js',
    'js/fixeo-enterprise-guard.js', 'js/fixeo-enterprise-readmodel.js',
    'js/fixeo-enterprise-site-actions.js', 'js/fixeo-enterprise-request-actions.js',
    'js/fixeo-enterprise-reporting.js', 'js/fixeo-enterprise-member-actions.js',
    'js/fixeo-enterprise-invitation-actions.js', 'js/fixeo-enterprise-audit.js',
    'js/fixeo-enterprise-sla-policy-actions.js', 'js/fixeo-enterprise-workspace.js']);
  const ids = [...d.querySelectorAll('[id]')].map(n => n.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...d.querySelectorAll('a')].every(a => ['index.html', '#main', 'auth.html'].includes(a.getAttribute('href'))));
  for (const p of ['js/fixeo-enterprise-workspace.js', 'js/fixeo-enterprise-guard.js', 'js/fixeo-enterprise-readmodel.js']) {
    assert.doesNotMatch(read(p), /service_role|user_metadata|raw_user_meta_data|\.from\(['"]profiles/);
    assert.doesNotMatch(read(p), /\.from\([^)]*\)[\s\S]{0,160}\.(insert|update|delete|upsert)\s*\(/);
  }
  assert.equal(d.querySelector('meta[name=robots]').content, 'noindex, nofollow');
  dom.window.close();
});

test('U12 B1 renders real read-only sites and interventions with text-only content', async t => {
  const unsafe = '<svg onload=alert(1)>';
  const readModel = { load: async () => ({
    sites: [{ id: uuid(301), name: unsafe, site_code: 'CAS-01', city: 'Casablanca', address_line: 'Centre', status: 'active' }],
    interventions: [{ id: uuid(401), site_id: uuid(301), site_name: unsafe, service_category: 'plomberie',
      city: 'Casablanca', urgency: 'urgent', request_status: 'pending', mission_status: 'accepted',
      created_at: '2026-09-24T10:00:00Z' }]
  }) };
  const s = await setup(t, {}, undefined, { readModel });
  await tick();
  assert.equal(s.q('enterprise-sites-count').textContent, '1');
  assert.equal(s.q('enterprise-interventions-count').textContent, '1');
  assert.equal(s.q('enterprise-sites-list').textContent.includes(unsafe), true);
  assert.equal(s.q('enterprise-sites-list').querySelector('svg'), null);
  assert.equal(s.q('enterprise-interventions-list').textContent.includes('Plomberie'), true);
});

test('U13 operational read failure preserves authorized shell and offers retry', async t => {
  let fail = true;
  const readModel = { load: async () => {
    if (fail) throw new Error('offline');
    return { sites: [], interventions: [] };
  } };
  const s = await setup(t, {}, undefined, { readModel });
  await tick();
  assert.equal(s.q('enterprise-workspace').hidden, false);
  assert.equal(s.q('enterprise-data-retry').hidden, false);
  fail = false;
  s.q('enterprise-data-retry').click();
  await tick();
  assert.equal(s.q('enterprise-data-state').hidden, true);
  assert.equal(s.q('enterprise-sites-count').textContent, '0');
});

test('U14 owner/admin management controls appear only when site action policy allows them', async t => {
  const readModel = { load: async () => ({ sites: [], interventions: [] }) };
  const allowed = await setup(t, {}, undefined, { readModel, siteActions: { canManage: r => r === 'owner' } });
  await tick();
  assert.equal(allowed.q('enterprise-site-create').hidden, false);
  assert.equal(allowed.q('enterprise-sites-mode').textContent, 'Gestion autorisée');
});

test('U15 B3 shows request creation only for authorized role with an active visible site', async t => {
  const readModel = { load: async () => ({
    sites: [{ id: uuid(301), name: 'Siège', site_code: 'CAS', city: 'Casablanca', address_line: '', status: 'active' }],
    interventions: []
  }) };
  const requestActions = { canCreate: role => ['owner','admin','operations_manager','site_manager','reporter'].includes(role) };
  const s = await setup(t, {}, undefined, { readModel, requestActions });
  await tick();
  assert.equal(s.q('enterprise-request-create').hidden, false);
  assert.equal(s.q('enterprise-requests-mode').textContent, 'Création autorisée');
});

test('U16 B3 keeps creation hidden when no active site is in effective scope', async t => {
  const readModel = { load: async () => ({
    sites: [{ id: uuid(301), name: 'Archive', site_code: '', city: 'Rabat', address_line: '', status: 'inactive' }],
    interventions: []
  }) };
  const requestActions = { canCreate: () => true };
  const s = await setup(t, {}, undefined, { readModel, requestActions });
  await tick();
  assert.equal(s.q('enterprise-request-create').hidden, true);
  assert.equal(s.q('enterprise-requests-mode').textContent, 'Aucun site actif');
});

test('U17 B4 opens read-only intervention detail with SLA snapshot', async t => {
  const readModel = { load: async () => ({
    sites: [{ id: uuid(301), name: 'Siège', site_code: 'CAS', city: 'Casablanca', address_line: '', status: 'active' }],
    interventions: [{ id: uuid(401), site_id: uuid(301), site_name: 'Siège', site_code:'CAS', service_category:'plomberie',
      city:'Casablanca', urgency:'urgent', request_status:'new', mission_status:'', created_at:'2026-09-24T10:00:00Z', accepted_at:null,
      sla:{policy_source:'fixeo_default',policy_urgency:'high',request_urgency:'urgent',acceptance_target_minutes:30,
        started_at:'2026-09-24T10:00:00Z',at_risk_at:'2099-09-24T10:22:30Z',due_at:'2099-09-24T10:30:00Z'} }]
  }) };
  const s = await setup(t, {}, undefined, { readModel });
  await tick();
  s.q('enterprise-interventions-list').querySelector('[data-intervention-action="detail"]').click();
  assert.equal(s.q('enterprise-intervention-dialog').hidden,false);
  assert.match(s.q('enterprise-intervention-detail').textContent,/Objectif d’acceptation/);
  assert.match(s.q('enterprise-intervention-detail').textContent,/30 min/);
  assert.equal(s.q('enterprise-intervention-detail').querySelector('button'),null);
});

test('U18 B5 renders operational and SLA reporting from read-only RPC model', async t => {
  const reporting = { load: async () => ({
    operational: { request_count: 12, accepted_request_count: 9, acceptance_rate_percent: 75,
      avg_first_acceptance_minutes: 18.5, completed_mission_request_count: 7 },
    sla: { eligible_count: 10, met_count: 7, breached_count: 2, on_track_count: 1,
      at_risk_count: 0, sla_met_rate_percent: 77.78 },
    sites: [{ site_id: uuid(301), site_name: 'Siège', city: 'Casablanca',
      site_status: 'active', request_count: 8, completed_count: 5,
      accepted_count: 6, acceptance_rate_percent: 75 }],
    breakdown: { by_service_category: [], by_urgency: [],
      by_request_status: [{ key: 'new', count: 3 }, { key: 'completed', count: 5 }] }
  }) };
  const s = await setup(t, {}, undefined, { reporting });
  await tick();
  assert.equal(s.q('enterprise-report-content').hidden, false);
  assert.match(s.q('enterprise-report-kpis').textContent,/12/);
  assert.match(s.q('enterprise-report-sla').textContent,/77,8|77\.8/);
  assert.match(s.q('enterprise-report-statuses').textContent,/New/);
  assert.match(s.q('enterprise-report-sites').textContent,/Siège/);
});

test('U19 B5 reporting failure does not hide operational workspace', async t => {
  const reporting = { load: async () => { throw new Error('offline'); } };
  const s = await setup(t, {}, undefined, { reporting });
  await tick();
  assert.equal(s.q('enterprise-workspace').hidden, false);
  assert.equal(s.q('enterprise-report-retry').hidden, false);
  assert.equal(s.q('enterprise-report-content').hidden, true);
});

test('U20 B6 renders member access safely and exposes controls only to managers', async t => {
  const memberId = uuid(801), userId = uuid(901), siteId = uuid(301);
  const readModel = { load: async () => ({
    sites: [{ id: siteId, name: 'Siège', site_code: 'CAS', city: 'Casablanca', address_line: '', status: 'active' }],
    interventions: [],
    members: [{ id: memberId, user_id: userId, role: 'site_manager', status: 'active', site_ids: [siteId] }]
  }) };
  const memberActions = { canManage: role => role === 'owner' || role === 'admin' };
  const s = await setup(t, {}, undefined, { readModel, memberActions });
  await tick();
  assert.equal(s.q('enterprise-team-empty').hidden, true);
  assert.match(s.q('enterprise-team-list').textContent,/Responsable de site/);
  assert.match(s.q('enterprise-team-list').textContent,/Siège/);
  assert.equal(s.q('enterprise-team-list').textContent.includes(userId), false);
  assert.ok(s.q('enterprise-team-list').querySelector('[data-member-action="manage"]'));
  assert.equal(s.q('enterprise-team-mode').textContent,'Gestion autorisée');
});

test('U21 B6 owner editor preserves owner as selected role and does not invent identity fields', async t => {
  const memberId = uuid(811), userId = uuid(911);
  const readModel = { load: async () => ({
    sites: [],
    interventions: [],
    members: [{ id: memberId, user_id: userId, role: 'owner', status: 'active', site_ids: [] }]
  }) };
  const memberActions = { canManage: () => true, roles: ['admin','operations_manager','site_manager','reporter','viewer'] };
  const s = await setup(t, {}, undefined, { readModel, memberActions });
  await tick();
  s.q('enterprise-team-list').querySelector('[data-member-action="manage"]').click();
  const select = s.q('enterprise-member-detail').querySelector('select');
  assert.equal(select.value,'owner');
  assert.equal(s.q('enterprise-member-detail').textContent.includes(userId), false);
  assert.equal(s.q('enterprise-member-dialog').hidden,false);
});

test('U22 B7 renders invitations and manager controls without token material', async t => {
  const invitationId = uuid(821);
  const readModel = { load: async () => ({
    sites: [], interventions: [], members: [],
    invitations: [{ id: invitationId, email: 'invite@example.com', role: 'viewer',
      status: 'pending', target_user_id: '', expires_at: '2026-10-01T12:00:00Z',
      accepted_at: null, revoked_at: null, created_at: '2026-09-24T12:00:00Z' }]
  }) };
  const invitationActions = { canManage: role => role === 'owner' || role === 'admin' };
  const s = await setup(t, {}, undefined, { readModel, invitationActions });
  await tick();
  assert.equal(s.q('enterprise-invitation-create').hidden,false);
  assert.equal(s.q('enterprise-invitations-mode').textContent,'Gestion autorisée');
  assert.match(s.q('enterprise-invitations-list').textContent,/invite@example.com/);
  assert.ok(s.q('enterprise-invitations-list').querySelector('[data-invitation-action="revoke"]'));
  assert.equal(s.q('enterprise-invitations-list').textContent.includes('token'),false);
});

test('U23 B7 creation surfaces one-time share link and states no email was sent', async t => {
  const token = 'a'.repeat(64);
  const readModel = { load: async () => ({ sites: [], interventions: [], members: [], invitations: [] }) };
  const invitationActions = {
    canManage: () => true,
    create: async () => ({ ok:true, invitation_id:uuid(822), invitation_token:token }),
    revoke: async () => ({ ok:true })
  };
  const s = await setup(t, {}, undefined, { readModel, invitationActions });
  await tick();
  s.q('enterprise-invitation-create').click();
  s.q('enterprise-invitation-email').value='invite@example.com';
  s.q('enterprise-invitation-form').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));
  await tick(); await tick();
  assert.equal(s.q('enterprise-invitation-created').hidden,false);
  assert.match(s.q('enterprise-invitation-link').value,/enterprise-invitation\.html\?token=/);
  assert.match(s.q('enterprise-invitation-created').textContent,/Aucun email automatique n’a été envoyé/);
});

test('U24 B8 audit is visible to owner and renders safe event labels', async t => {
  const eventId=uuid(841), targetId=uuid(301), actorId=uuid(901);
  const audit = {
    canView: role => role === 'owner' || role === 'admin',
    listPage: async () => ({status:'ok',events:[{
      id:eventId,enterprise_id:uuid(101),actor_user_id:actorId,event_type:'site.updated',
      target_type:'enterprise_site',target_id:targetId,
      before_state:{status:'active',secret:'hidden'},
      after_state:{status:'inactive',secret:'hidden'},
      metadata:{site_id:targetId,raw_secret:'hidden'},
      created_at:'2026-09-24T12:00:00Z'
    }],returned_count:1,has_more:false,next_cursor:null}),
    exportPeriod: async () => ({status:'ok',events:[],returned_count:0,truncated:false}),
    safeDetails: event => ({
      before_state:{status:event.before_state.status},
      after_state:{status:event.after_state.status},
      metadata:{site_id:event.metadata.site_id}
    })
  };
  const s = await setup(t, {}, undefined, { audit });
  await tick(); await tick();
  assert.equal(s.q('enterprise-audit-module').hidden,false);
  assert.match(s.q('enterprise-audit-list').textContent,/Site modifié/);
  assert.equal(s.q('enterprise-audit-list').textContent.includes('hidden'),false);
  assert.match(s.q('enterprise-audit-count').textContent,/1 événement/);
});

test('U25 B8 audit stays hidden for non-manager roles', async t => {
  const audit = {
    canView: () => false,
    listPage: async () => { throw new Error('must not call'); },
    exportPeriod: async () => { throw new Error('must not call'); },
    safeDetails: () => ({})
  };
  const s = await setup(t, {
    enterprise_members:[member(1,'viewer','active')]
  }, undefined, { audit });
  await tick(); await tick();
  assert.equal(s.q('enterprise-audit-module').hidden,true);
});

test('U26 B8 pagination appends the next server page without replacing prior events', async t => {
  let page=0;
  const audit = {
    canView: () => true,
    listPage: async (_client,_eid,opts) => {
      page++;
      if(!opts.cursor) return {status:'ok',events:[{
        id:uuid(851),actor_user_id:uuid(901),event_type:'site.created',
        target_type:'enterprise_site',target_id:uuid(301),created_at:'2026-09-24T12:00:00Z'
      }],returned_count:1,has_more:true,next_cursor:{created_at:'2026-09-24T12:00:00Z',id:uuid(851)}};
      return {status:'ok',events:[{
        id:uuid(852),actor_user_id:uuid(902),event_type:'request.created',
        target_type:'service_request',target_id:uuid(401),created_at:'2026-09-23T12:00:00Z'
      }],returned_count:1,has_more:false,next_cursor:null};
    },
    exportPeriod: async () => ({status:'ok',events:[],returned_count:0,truncated:false}),
    safeDetails: () => ({})
  };
  const s = await setup(t, {}, undefined, { audit });
  await tick(); await tick();
  assert.equal(s.q('enterprise-audit-list').children.length,1);
  s.q('enterprise-audit-more').click();
  await tick(); await tick();
  assert.equal(s.q('enterprise-audit-list').children.length,2);
  assert.equal(page,2);
});

test('U27 B9 renders SLA policies and manager controls for owner', async t => {
  const readModel = { load: async () => ({
    sites:[{id:uuid(301),name:'Siège',site_code:'CAS',city:'Casablanca',address_line:'',status:'active'}],
    interventions:[],members:[],invitations:[],
    sla_policies:[{id:uuid(871),site_id:'',urgency:'normal',acceptance_target_minutes:90,status:'active',
      created_at:'2026-09-24T10:00:00Z',updated_at:'2026-09-24T10:00:00Z'}]
  }) };
  const slaPolicyActions = { canManage: role => role === 'owner' || role === 'admin' };
  const s = await setup(t, {}, undefined, { readModel, slaPolicyActions });
  await tick(); await tick();
  assert.equal(s.q('enterprise-sla-policy-create').hidden,false);
  assert.equal(s.q('enterprise-sla-policies-mode').textContent,'Gestion autorisée');
  assert.match(s.q('enterprise-sla-policies-list').textContent,/Normale/);
  assert.match(s.q('enterprise-sla-policies-list').textContent,/90 min/);
  assert.ok(s.q('enterprise-sla-policies-list').querySelector('[data-sla-policy-action="edit"]'));
});

test('U28 B9 non-manager sees policies read-only', async t => {
  const readModel = { load: async () => ({
    sites:[],interventions:[],members:[],invitations:[],
    sla_policies:[{id:uuid(872),site_id:'',urgency:'high',acceptance_target_minutes:30,status:'active'}]
  }) };
  const slaPolicyActions = { canManage: () => false };
  const s = await setup(t, {
    enterprise_members:[member(1,'viewer','active')]
  }, undefined, { readModel, slaPolicyActions });
  await tick(); await tick();
  assert.equal(s.q('enterprise-sla-policy-create').hidden,true);
  assert.equal(s.q('enterprise-sla-policies-mode').textContent,'Lecture seule');
  assert.equal(s.q('enterprise-sla-policies-list').querySelector('[data-sla-policy-action="edit"]'),null);
});

test('U29 B9 edit dialog preserves full selected policy state', async t => {
  const policyId=uuid(873),siteId=uuid(301);
  const readModel = { load: async () => ({
    sites:[{id:siteId,name:'Agence',site_code:'RBT',city:'Rabat',address_line:'',status:'active'}],
    interventions:[],members:[],invitations:[],
    sla_policies:[{id:policyId,site_id:siteId,urgency:'urgent',acceptance_target_minutes:20,status:'inactive'}]
  }) };
  const slaPolicyActions = { canManage: () => true };
  const s = await setup(t, {}, undefined, { readModel, slaPolicyActions });
  await tick(); await tick();
  s.q('enterprise-sla-policies-list').querySelector('[data-sla-policy-action="edit"]').click();
  assert.equal(s.q('enterprise-sla-policy-dialog').hidden,false);
  assert.equal(s.q('enterprise-sla-policy-id').value,policyId);
  assert.equal(s.q('enterprise-sla-policy-site').value,siteId);
  assert.equal(s.q('enterprise-sla-policy-urgency').value,'urgent');
  assert.equal(s.q('enterprise-sla-policy-target').value,'20');
  assert.equal(s.q('enterprise-sla-policy-status').value,'inactive');
});
