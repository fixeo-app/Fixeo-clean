import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { canonicalCity, canonicalCities, requireCanonicalCity, citySuggestions } from '../lib/clientLocation';
import { pickerDateParts, agendaPickerValue, parseAgendaDateTime, formatAgendaDateInput, formatAgendaTimeInput } from '../lib/agendaDate';
import { ledgerDetailLabel, ledgerTypeLabel, ledgerJobLabel } from '../lib/ledgerPresentation';
import { createAuthState, authIssue, routeAllowed } from '../lib/authContract';
import { validateMobileEstimatorResponse } from '../lib/mobileEstimatorContract';
import { calculateQuote } from '../lib/artisanExperience';
const require = createRequire(import.meta.url);
const nativeAbort = require('abort-controller/dist/abort-controller');
function load(file: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: (name: string) => deps[name] || {}, setTimeout, clearTimeout, Promise,
    process: { env: { EXPO_PUBLIC_FIXEO_API_BASE_URL: 'https://staging.invalid' } }, ...globals });
  return exports;
}

test('PB1 native RAFI regression: RN AbortSignal has no timeout; corrected estimator reaches HTTP', async () => {
  assert.equal(typeof nativeAbort.AbortSignal.timeout, 'undefined');
  let calls = 0;
  const resilience = load('lib/mobileResilience.ts', {}, { ...nativeAbort, fetch: async (_url: string, init: RequestInit) => {
    calls++; assert.ok(init.signal); assert.equal(JSON.parse(String(init.body)).action, 'start');
    return { ok: true, status: 200, json: async () => ({ ok: true, session: { session_token: 'opaque-test-token', state: 'COLLECTING' }, next_step: { type: 'METIER_SELECTION', candidate_metiers: ['plomberie'] } }) };
  } });
  const estimator = load('lib/mobileEstimator.ts', {
    './mobileResilience': resilience, './mobileEstimatorContract': { validateMobileEstimatorResponse },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-only' } } }) } } },
  }, nativeAbort);
  const result = await estimator.mobileEstimator({ action: 'start', entry_context: { city_slug: 'fes', description: 'Fuite sous évier' } });
  assert.equal(calls, 1); assert.equal(result.ok, true);
});

test('PB1 fetch deadline covers a stalled body and clears completed timers', async () => {
  let aborted = false;
  const resilience = load('lib/mobileResilience.ts', {}, { ...nativeAbort, fetch: async (_url: string, init: RequestInit) => {
    init.signal?.addEventListener('abort', () => { aborted = true; });
    return { json: () => new Promise(() => {}) };
  } });
  await assert.rejects(resilience.fetchMobileJson('https://staging.invalid', {}, 10), /GATEWAY_UNAVAILABLE/);
  assert.equal(aborted, true);
  let timers = 0;
  const finished = load('lib/mobileResilience.ts', {}, { ...nativeAbort,
    setTimeout: (fn: () => void, ms: number) => { timers++; return setTimeout(fn, ms); },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => { timers--; clearTimeout(id); },
    fetch: async () => ({ json: async () => ({ ok: true }) }),
  });
  assert.equal((await finished.fetchMobileJson('https://staging.invalid', {}, 1000)).body.ok, true);
  assert.equal(timers, 0);
});

test('PB1 canonical city selection works empty, exact, partial and without accents', () => {
  assert.equal(citySuggestions('').length, 21);
  assert.equal(citySuggestions('Fes')[0].value, 'Fès');
  assert.equal(citySuggestions('ken')[0].value, 'Kénitra');
  assert.equal(requireCanonicalCity(' Fez '), 'Fès');
  assert.deepEqual(canonicalCities(['Fes', 'Fès', 'meknes']), ['Fès', 'Meknès']);
  assert.throws(() => requireCanonicalCity('not-a-city'), /CITY_NOT_SUPPORTED/);
  assert.equal(canonicalCity('Rabat-Salé-Kénitra'), undefined);
});

test('PB1 city write boundaries preserve request idempotency and profile ownership', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const api = load('lib/magicLoop.ts', { './clientLocation': { requireCanonicalCity }, './supabase': { supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { id: 'same-request' } }; },
    functions: { invoke: async () => ({}) },
  } } });
  for (let i = 0; i < 2; i++) await api.createRequest('Plomberie', 'Fes', 'Fuite sous évier', 'same-intent');
  assert.equal(calls[0].name, 'create_my_service_request_v1');
  assert.equal(calls[0].args.p_city, 'Fès');
  assert.deepEqual(calls[0], calls[1]);
  await assert.rejects(api.createRequest('Plomberie', 'invalid', 'Fuite', 'same-intent'), /CITY_NOT_SUPPORTED/);
  assert.equal(calls.length, 2);
});

test('PB1 real Auth owner preserves screen identity during foreground, blocks access, and handles offline retry', async () => {
  let failure: unknown = null, release: (() => void) | undefined;
  const session = { user: { id: 'fixture-client' } };
  const owner = load('lib/authSession.ts', {
    './clientDrafts': { clearClientDrafts: () => {} },
    './authContract': { createAuthState, authIssue }, './mobileResilience': { withMobileDeadline: (p: unknown) => p },
    './auth': { resolveRole: async () => 'client' }, './notificationIntent': { clearPrivateNotificationState: async () => {} },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session } }),
      refreshSession: async () => { await new Promise<void>(r => { release = r; }); return { data: { session }, error: failure }; },
      getUser: async () => ({ data: { user: session.user } }), signOut: async () => ({}),
    } } },
  });
  const state = owner.authState;
  state.publish(state.invalidate(), { phase: 'ready', userId: 'fixture-client', role: 'client', issue: null });
  async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); }
  let pending = owner.resolveAuthSession(true); await flush();
  assert.equal(state.snapshot().phase, 'ready'); assert.equal(state.snapshot().userId, 'fixture-client');
  assert.equal(state.snapshot().revalidating, true); assert.equal(routeAllowed('/', state.snapshot()), false);
  release!(); await pending; assert.equal(routeAllowed('/', state.snapshot()), true);
  failure = new Error('Network request failed'); pending = owner.resolveAuthSession(true); await flush(); release!(); await pending;
  assert.equal(state.snapshot().phase, 'ready'); assert.equal(state.snapshot().issue, 'network');
  assert.equal(routeAllowed('/', state.snapshot()), false);
  failure = null; pending = owner.resolveAuthSession(true); await flush(); release!(); await pending;
  assert.equal(routeAllowed('/', state.snapshot()), true);
  pending = owner.resolveAuthSession(true); await flush(); owner.clearAuthPresentation(); release!(); await pending;
  assert.equal(state.snapshot().phase, 'signed_out'); assert.equal(state.snapshot().userId, null);
});

test('PB1 revalidation cannot restore a revoked or switched identity', () => {
  const state = createAuthState();
  state.publish(state.invalidate(), { phase: 'ready', userId: 'client', role: 'client', issue: null });
  const pending = state.revalidate()!;
  state.invalidate('signed_out', 'revoked');
  assert.equal(state.publish(pending, { phase: 'ready', userId: 'client', role: 'client', issue: null }), false);
  assert.equal(state.revalidate(), null);
  assert.equal(routeAllowed('/', state.snapshot()), false);
});

test('PB1 date/time picker preserves native wall components and stores Casablanca time independently of device', () => {
  assert.equal(formatAgendaDateInput('06102026'), '06/10/2026');
  assert.equal(formatAgendaTimeInput('1130'), '11:30');
  for (const zone of ['Africa/Casablanca', 'UTC', 'America/New_York']) {
    const before = process.env.TZ; process.env.TZ = zone;
    try {
      const date = agendaPickerValue('06/10/2026', '11:30');
      assert.deepEqual(pickerDateParts(date), { date: '06/10/2026', time: '11:30' });
      assert.equal(parseAgendaDateTime('06/10/2026', '11:30'), '2026-10-06T10:30:00.000Z');
      assert.equal(parseAgendaDateTime('31/02/2026', '11:30'), null);
      assert.equal(parseAgendaDateTime('06/10/2026', '25:30'), null);
    } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  }
});

test('PB1 finance labels never expose raw enums and preserve linked/independent movements', () => {
  const income = { entry_type: 'income', source: 'personal', category: 'other', job_id: 'pb1-job' };
  const expense = { entry_type: 'expense', source: 'personal', category: 'other', job_id: null };
  assert.equal(ledgerDetailLabel(income), 'Encaissement personnel');
  assert.equal(ledgerTypeLabel(expense), 'Dépense personnelle');
  assert.equal(ledgerDetailLabel({ ...expense, category: 'raw_unknown' }), 'Autre');
  assert.equal(ledgerJobLabel(income, [{ id: 'pb1-job', title: 'PB1 intervention Test' }]), 'PB1 intervention Test');
  assert.equal(ledgerJobLabel(expense, []), null);
  assert.equal(income.category, 'other');
});

test('PB1 business writes retain the same draft, CRM links and independent expense', async () => {
  const writes: Array<{ table: string; action: string; payload: any; filters: Record<string, unknown> }> = [];
  const api = load('lib/artisanOS.ts', {
    './authEvents': {privateSessionGeneration:()=>0}, './pendingBusinessWrite':{guardedBusinessWrite:(_o:any,_s:any,_p:any,fn:any)=>fn()},
    './quoteVersion': await import('../lib/quoteVersion'), './dateValidation': await import('../lib/dateValidation'), './moneyContract': await import('../lib/moneyContract'),
    './artisanProgressive': { inFlightRead: (fn: unknown) => fn },
    './artisanExperience': { calculateQuote }, './supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-only' } } }) },
      rpc: async (name: string) => {
        assert.equal(name, 'get_my_mobile_artisan_access_v1');
        return { data: { ok: true, user_id: 'artisan', artisan_id: 'profile' } };
      },
      from: (table: string) => {
        const write = { table, action: '', payload: null as any, filters: {} as Record<string, unknown> };
        const query = {
          update(payload: unknown) { write.action = 'update'; write.payload = payload; return query; },
          insert(payload: unknown) { write.action = 'insert'; write.payload = payload; return query; },
          async maybeSingle() { return {data:null}; },
          upsert(payload: unknown) { write.action = 'upsert'; write.payload = payload; return query; },
          eq(key: string, value: unknown) { write.filters[key] = value; return query; },
          select() { return query; },
          async single() { if (!write.action) return { data: { id: 'pb1-job', client_id: 'pb1-client', source: 'personal' } }; writes.push(write); return { data: { ...write.payload, status: write.payload.status || 'draft', sent_at: null, sent_via: null } }; },
        }; return query;
      },
    } },
  });
  const quote = await api.saveBusinessQuote({ id: 'existing-quote', title: 'PB1 Devis Test', client_id: 'pb1-client',
    items: [{ type: 'service', label: 'Réparation fuite sous évier', quantity: 2, unit_price: 250 }],
    discount: 0, notes: '', validity_date: null, estimated_duration: '' }, true, '2026-10-08T14:00:00Z');
  assert.equal(quote.id, 'existing-quote'); assert.equal(quote.total, 500); assert.equal(quote.client_id, 'pb1-client');
  assert.equal(quote.sent_at, null); assert.equal(quote.sent_via, null);
  assert.equal(writes[0].action, 'update');
  assert.deepEqual(writes[0].filters, { id: 'existing-quote', owner_user_id: 'artisan', source: 'personal', status: 'draft', updated_at: '2026-10-08T14:00:00Z' });
  assert.equal('sent_at' in writes[0].payload, false); assert.equal('sent_via' in writes[0].payload, false);
  const job = await api.saveBusinessJob({ id: 'pb1-job', title: 'PB1 intervention Test', client_id: 'pb1-client',
    scheduled_at: '2026-10-06T10:30:00.000Z', notes: '' });
  assert.equal(job.status, 'planned'); assert.equal(job.source, 'personal'); assert.equal(job.client_id, 'pb1-client');
  assert.equal(job.scheduled_at, '2026-10-06T10:30:00.000Z');
  await api.saveLedgerEntry({ id: 'income', entry_type: 'income', amount: 500, occurred_on: '2026-10-06', note: '', client_id: 'pb1-client', job_id: 'pb1-job' });
  await api.saveLedgerEntry({ id: 'expense', entry_type: 'expense', amount: 120, occurred_on: '2026-10-06', note: '', client_id: null, job_id: null });
  assert.equal(writes[2].payload.client_id, 'pb1-client'); assert.equal(writes[2].payload.job_id, 'pb1-job');
  assert.equal(writes[3].payload.client_id, null); assert.equal(writes[3].payload.job_id, null);
  assert.equal(writes[2].payload.category, 'other'); assert.equal(writes[3].payload.category, 'other');
  assert.equal(writes.filter(w => w.table === 'artisan_business_ledger' && w.payload.client_id === 'pb1-client').length, 1);
  await assert.rejects(api.saveLedgerEntry({ amount: -120 }), /LEDGER_INVALID/);
  assert.equal(writes.length, 4);
});
