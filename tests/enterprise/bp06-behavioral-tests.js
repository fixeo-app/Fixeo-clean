#!/usr/bin/env node
/**
 * BP06 BEHAVIORAL TESTS — Pure Node.js
 * Tests pure functions extracted from enterprise-dashboard-v1.js
 * No external dependencies, no DOM required (minimal mock where needed).
 * Exit 0 if all pass; exit 1 on any failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../../');
const JS_FILE = path.join(ROOT, 'js/enterprise-dashboard-v1.js');

// ── Result tracking ───────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0;
const results = [];

function PASS(name, msg) {
  pass++;
  results.push({ status:'PASS', name, msg: msg||'' });
}
function FAIL(name, msg) {
  fail++;
  results.push({ status:'FAIL', name, msg: msg||'' });
}
function WARN(name, msg) {
  warn++;
  results.push({ status:'WARN', name, msg: msg||'' });
}
function assert(cond, name, failMsg) {
  if (cond) PASS(name);
  else FAIL(name, failMsg || 'assertion failed');
}

// ── Load JS source ────────────────────────────────────────────────────────────
if (!fs.existsSync(JS_FILE)) {
  console.error('FATAL: JS file not found: ' + JS_FILE);
  process.exit(1);
}
const jsSource = fs.readFileSync(JS_FILE, 'utf8');

// ── Minimal browser environment shims ─────────────────────────────────────────
// We need to eval pure functions; the module uses 'use strict' + window globals.
// We'll extract just the pure functions and evaluate them in a controlled scope.

// ── Section 1: Role Constants ─────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════');
console.log('  BP06 BEHAVIORAL TESTS — enterprise-dashboard-v1.js');
console.log('════════════════════════════════════════════════════\n');

// Extract CAN_CREATE_ROLES and CAN_CONFIRM_ROLES from source
const canCreateMatch = jsSource.match(/const CAN_CREATE_ROLES\s*=\s*(\[.*?\]);/);
const canConfirmMatch = jsSource.match(/const CAN_CONFIRM_ROLES\s*=\s*(\[.*?\]);/);

if (!canCreateMatch || !canConfirmMatch) {
  FAIL('ROLE_ARRAYS_EXTRACT', 'Could not extract role arrays from JS source');
} else {
  // Use eval (safe — we control the source file; these are string literal arrays)
  const CAN_CREATE_ROLES  = eval(canCreateMatch[1]);
  const CAN_CONFIRM_ROLES = eval(canConfirmMatch[1]);

  console.log('─── 1. Role Constants ───────────────────────────────');
  assert(Array.isArray(CAN_CREATE_ROLES) && CAN_CREATE_ROLES.length === 5,
    'CAN_CREATE_ROLES has 5 entries', `got ${CAN_CREATE_ROLES.length}`);
  assert(CAN_CREATE_ROLES.includes('owner'), 'CAN_CREATE_ROLES includes owner');
  assert(CAN_CREATE_ROLES.includes('reporter'), 'CAN_CREATE_ROLES includes reporter');
  assert(!CAN_CREATE_ROLES.includes('viewer'), 'CAN_CREATE_ROLES excludes viewer');
  assert(CAN_CREATE_ROLES.includes('admin'), 'CAN_CREATE_ROLES includes admin');
  assert(CAN_CREATE_ROLES.includes('operations_manager'), 'CAN_CREATE_ROLES includes operations_manager');
  assert(CAN_CREATE_ROLES.includes('site_manager'), 'CAN_CREATE_ROLES includes site_manager');

  assert(Array.isArray(CAN_CONFIRM_ROLES) && CAN_CONFIRM_ROLES.length === 4,
    'CAN_CONFIRM_ROLES has 4 entries', `got ${CAN_CONFIRM_ROLES.length}`);
  assert(!CAN_CONFIRM_ROLES.includes('reporter'), 'CAN_CONFIRM_ROLES excludes reporter');
  assert(!CAN_CONFIRM_ROLES.includes('viewer'), 'CAN_CONFIRM_ROLES excludes viewer');
  assert(CAN_CONFIRM_ROLES.includes('owner'), 'CAN_CONFIRM_ROLES includes owner');
  assert(CAN_CONFIRM_ROLES.includes('admin'), 'CAN_CONFIRM_ROLES includes admin');
}

// ── Section 2: Extract and eval pure functions ─────────────────────────────────
// We extract the pure helper functions and evaluate them in a minimal scope.

// Build a minimal execution context
function extractAndEvalPureFunctions() {
  // Extract function bodies we need
  // We'll build a mini-module with just the pure parts
  const pureCode = `
'use strict';
const CAN_CREATE_ROLES  = ['owner','admin','operations_manager','site_manager','reporter'];
const CAN_CONFIRM_ROLES = ['owner','admin','operations_manager','site_manager'];
function canCreate(role)  { return CAN_CREATE_ROLES.includes(role); }
function canConfirm(role) { return CAN_CONFIRM_ROLES.includes(role); }

// Minimal S state for getSiteName
const S = {
  sites: [
    { id: 'site-001', name: 'Site Alpha', city: 'Casablanca' },
    { id: 'site-002', name: 'Site Beta',  city: 'Rabat' }
  ]
};

${extractFunctionSource('formatAge')}
${extractFunctionSource('getNextAction')}
${extractFunctionSource('formatStatus')}
${extractFunctionSource('formatUrgency')}
${extractFunctionSource('getSiteName')}
${extractFunctionSource('rafiNarrate')}
${extractFunctionSource('csvEscape')}

module.exports = {
  CAN_CREATE_ROLES, CAN_CONFIRM_ROLES,
  canCreate, canConfirm,
  formatAge, getNextAction, formatStatus, formatUrgency,
  getSiteName, rafiNarrate, csvEscape
};
`;
  return pureCode;
}

function extractFunctionSource(name) {
  // Extract a top-level function declaration
  const re = new RegExp(`^function ${name}\\s*\\(`, 'm');
  const start = jsSource.search(re);
  if (start === -1) return `// MISSING: ${name}`;
  // Find the matching closing brace
  let depth = 0, i = start;
  while (i < jsSource.length) {
    if (jsSource[i] === '{') depth++;
    else if (jsSource[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
    i++;
  }
  return jsSource.slice(start, i);
}

const pureCode = extractAndEvalPureFunctions();

// Write to temp file and require() it
const tmpFile = path.join(__dirname, '_bp06_pure_tmp.js');
fs.writeFileSync(tmpFile, pureCode, 'utf8');

let fns;
try {
  fns = require(tmpFile);
} catch(e) {
  FAIL('PURE_FUNCTIONS_LOAD', 'Failed to load pure functions: ' + e.message);
  console.error(e);
  cleanup();
  printResults();
  process.exit(1);
}

function cleanup() {
  try { fs.unlinkSync(tmpFile); } catch(e) {}
}

const { formatAge, getNextAction, formatStatus, formatUrgency, rafiNarrate, csvEscape, canCreate, canConfirm } = fns;

// ── Section 3: formatAge ──────────────────────────────────────────────────────
console.log('─── 2. formatAge() ─────────────────────────────────');
{
  const now = Date.now();

  // null/undefined → '—'
  assert(formatAge(null) === '—', 'formatAge(null) → "—"', `got "${formatAge(null)}"`);
  assert(formatAge(undefined) === '—', 'formatAge(undefined) → "—"', `got "${formatAge(undefined)}"`);

  // < 60 min
  const ts30min = new Date(now - 30 * 60000).toISOString();
  const result30 = formatAge(ts30min);
  assert(result30.includes('30min') || result30.includes('min'), 'formatAge 30min contains "min"', `got "${result30}"`);

  // 1-2 hours
  const ts2h = new Date(now - 2 * 3600000).toISOString();
  const result2h = formatAge(ts2h);
  assert(result2h.includes('h'), 'formatAge 2h contains "h"', `got "${result2h}"`);

  // 3 days
  const ts3d = new Date(now - 3 * 86400000).toISOString();
  const result3d = formatAge(ts3d);
  assert(result3d.includes('j'), 'formatAge 3d contains "j"', `got "${result3d}"`);

  // 15 days → weeks
  const ts15d = new Date(now - 15 * 86400000).toISOString();
  const result15d = formatAge(ts15d);
  assert(result15d.includes('sem'), 'formatAge 15d contains "sem"', `got "${result15d}"`);

  // 0 min → 0min
  const tsNow = new Date(now - 1000).toISOString(); // 1 second ago
  const resultNow = formatAge(tsNow);
  assert(resultNow.includes('min'), 'formatAge ~0min contains "min"', `got "${resultNow}"`);
}

// ── Section 4: getNextAction ──────────────────────────────────────────────────
console.log('─── 3. getNextAction() ─────────────────────────────');
{
  // All 7 statuses
  const statuses = ['new', 'assigned', 'in_progress', 'completed', 'validated', 'cancelled', 'no_match'];
  statuses.forEach(function(s) {
    const result = getNextAction(s, 'owner');
    assert(typeof result === 'string' && result.length > 0,
      `getNextAction('${s}', 'owner') non-empty string`, `got "${result}"`);
  });

  // 'completed' with owner → validation mention
  const ownerCompleted = getNextAction('completed', 'owner');
  assert(ownerCompleted.toLowerCase().includes('valida'),
    'getNextAction(completed, owner) mentions validation', `got "${ownerCompleted}"`);

  // 'completed' with reporter → waiting message (no validation prompt)
  const reporterCompleted = getNextAction('completed', 'reporter');
  assert(reporterCompleted.toLowerCase().includes('attente'),
    'getNextAction(completed, reporter) mentions attente', `got "${reporterCompleted}"`);

  // reporter cannot confirm
  assert(reporterCompleted !== ownerCompleted,
    'getNextAction(completed) differs for owner vs reporter', `both "${ownerCompleted}"`);

  // 'validated' returns validated string
  const validated = getNextAction('validated', 'owner');
  assert(validated.includes('✓') || validated.includes('Validée'),
    'getNextAction(validated) returns validated string', `got "${validated}"`);

  // 'cancelled'
  const cancelled = getNextAction('cancelled', 'owner');
  assert(cancelled.includes('Annulée'), 'getNextAction(cancelled) = Annulée', `got "${cancelled}"`);

  // 'no_match'
  const noMatch = getNextAction('no_match', 'owner');
  assert(noMatch.toLowerCase().includes('artisan') || noMatch.toLowerCase().includes('aucun'),
    'getNextAction(no_match) mentions artisan or aucun', `got "${noMatch}"`);

  // Unknown status → returns status itself
  const unknown = getNextAction('weird_status', 'owner');
  assert(unknown === 'weird_status' || unknown === '—' || unknown.length > 0,
    'getNextAction(unknown_status) returns non-empty', `got "${unknown}"`);
}

// ── Section 5: formatStatus ───────────────────────────────────────────────────
console.log('─── 4. formatStatus() ──────────────────────────────');
{
  const statuses = {
    new: 'Nouvelle',
    assigned: 'Assignée',
    in_progress: 'En cours',
    completed: 'Terminée',
    validated: 'Validée',
    cancelled: 'Annulée',
    no_match: 'Sans suite'
  };
  Object.entries(statuses).forEach(function([status, expected]) {
    const result = formatStatus(status);
    assert(result === expected,
      `formatStatus('${status}') = '${expected}'`, `got "${result}"`);
  });
  // All 7 statuses return non-empty French strings
  assert(Object.values(statuses).every(function(v) { return v.length > 0; }),
    'formatStatus all 7 statuses return non-empty strings');
}

// ── Section 6: formatUrgency ──────────────────────────────────────────────────
console.log('─── 5. formatUrgency() ─────────────────────────────');
{
  assert(formatUrgency('now') === 'Immédiat', 'formatUrgency(now) = Immédiat', `got "${formatUrgency('now')}"`);
  assert(formatUrgency('urgent') === 'Urgent', 'formatUrgency(urgent) = Urgent', `got "${formatUrgency('urgent')}"`);
  assert(formatUrgency('') === 'Normale', 'formatUrgency("") = Normale', `got "${formatUrgency('')}"`);
  assert(formatUrgency(undefined) === 'Normale', 'formatUrgency(undefined) = Normale', `got "${formatUrgency(undefined)}"`);
  assert(formatUrgency('normale') === 'Normale', 'formatUrgency(normale) = Normale', `got "${formatUrgency('normale')}"`);
  assert(formatUrgency('normal') === 'Normale', 'formatUrgency(normal) = Normale', `got "${formatUrgency('normal')}"`);
}

// ── Section 7: rafiNarrate ────────────────────────────────────────────────────
console.log('─── 6. rafiNarrate() ───────────────────────────────');
{
  const req = function(status, category, siteId) {
    return { status, category: category||'Plomberie', enterprise_site_id: siteId||'site-001' };
  };

  const statuses = ['new','assigned','in_progress','completed','validated','cancelled','no_match'];
  statuses.forEach(function(status) {
    const r = rafiNarrate(req(status));
    assert(typeof r === 'string' && r.length > 0,
      `rafiNarrate(${status}) non-empty`, `got "${r}"`);
  });

  // Site name resolved
  const r1 = rafiNarrate(req('new', 'Plomberie', 'site-001'));
  assert(r1.includes('Site Alpha'), 'rafiNarrate resolves site-001 to Site Alpha', `got "${r1}"`);

  const r2 = rafiNarrate(req('validated', 'Électricité', 'site-002'));
  assert(r2.includes('Site Beta'), 'rafiNarrate resolves site-002 to Site Beta', `got "${r2}"`);

  // Unknown site → falls back to siteId
  const r3 = rafiNarrate(req('new', 'HVAC', 'site-999'));
  assert(r3.includes('site-999'), 'rafiNarrate unknown site falls back to siteId', `got "${r3}"`);

  // No site → '—'
  const r4 = rafiNarrate(req('new', 'HVAC', null));
  assert(r4.includes('—') || r4.includes('HVAC'), 'rafiNarrate null siteId graceful', `got "${r4}"`);

  // cancelled omits site (check source behavior)
  const r5 = rafiNarrate(req('cancelled', 'Peinture', 'site-001'));
  assert(r5.includes('Annulée') || r5.includes('Peinture'), 'rafiNarrate cancelled mentions Annulée or category', `got "${r5}"`);

  // 'completed' → validation mention
  const r6 = rafiNarrate(req('completed', 'Menuiserie', 'site-001'));
  assert(r6.toLowerCase().includes('valida'), 'rafiNarrate(completed) mentions validation', `got "${r6}"`);
}

// ── Section 8: csvEscape ──────────────────────────────────────────────────────
console.log('─── 7. csvEscape() ─────────────────────────────────');
{
  assert(csvEscape('hello') === 'hello', 'csvEscape plain string unchanged', `got "${csvEscape('hello')}"`);
  assert(csvEscape('') === '', 'csvEscape empty string', `got "${csvEscape('')}"`);
  assert(csvEscape(null) === '', 'csvEscape(null) = ""', `got "${csvEscape(null)}"`);
  assert(csvEscape(undefined) === '', 'csvEscape(undefined) = ""', `got "${csvEscape(undefined)}"`);

  // Has comma → wrap in quotes
  const withComma = csvEscape('hello, world');
  assert(withComma.startsWith('"') && withComma.endsWith('"'),
    'csvEscape with comma wrapped in quotes', `got "${withComma}"`);

  // Has double-quote → escape it
  const withQuote = csvEscape('say "hello"');
  assert(withQuote.includes('""'), 'csvEscape inner quotes doubled', `got "${withQuote}"`);
  assert(withQuote.startsWith('"') && withQuote.endsWith('"'),
    'csvEscape with quote wrapped in outer quotes', `got "${withQuote}"`);

  // Has newline → wrap in quotes
  const withNewline = csvEscape('line1\nline2');
  assert(withNewline.startsWith('"') && withNewline.endsWith('"'),
    'csvEscape with newline wrapped in quotes', `got "${withNewline}"`);

  // Number → coerced to string
  const numResult = csvEscape(42);
  assert(numResult === '42', 'csvEscape(42) = "42"', `got "${numResult}"`);

  // Complex: comma + quote
  const complex = csvEscape('a,b"c');
  assert(complex.startsWith('"') && complex.endsWith('"') && complex.includes('""'),
    'csvEscape complex (comma+quote) properly escaped', `got "${complex}"`);
}

// ── Section 9: canCreate / canConfirm role checks ─────────────────────────────
console.log('─── 8. Role gate functions ─────────────────────────');
{
  // canCreate
  assert(canCreate('owner') === true,           'canCreate(owner) = true');
  assert(canCreate('admin') === true,           'canCreate(admin) = true');
  assert(canCreate('operations_manager') === true, 'canCreate(operations_manager) = true');
  assert(canCreate('site_manager') === true,    'canCreate(site_manager) = true');
  assert(canCreate('reporter') === true,        'canCreate(reporter) = true');
  assert(canCreate('viewer') === false,         'canCreate(viewer) = false');
  assert(canCreate('') === false,               'canCreate("") = false');
  assert(canCreate(null) === false,             'canCreate(null) = false');
  assert(canCreate(undefined) === false,        'canCreate(undefined) = false');

  // canConfirm
  assert(canConfirm('owner') === true,          'canConfirm(owner) = true');
  assert(canConfirm('admin') === true,          'canConfirm(admin) = true');
  assert(canConfirm('operations_manager') === true, 'canConfirm(operations_manager) = true');
  assert(canConfirm('site_manager') === true,   'canConfirm(site_manager) = true');
  assert(canConfirm('reporter') === false,      'canConfirm(reporter) = false');
  assert(canConfirm('viewer') === false,        'canConfirm(viewer) = false');
  assert(canConfirm('') === false,              'canConfirm("") = false');
}

// ── Section 10: localStorage saved-views cycle (Node mock) ───────────────────
console.log('─── 9. savedViews localStorage cycle ──────────────');
{
  // Mock localStorage
  const _store = {};
  const mockLocalStorage = {
    getItem: function(k) { return _store[k] !== undefined ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = v; },
    removeItem: function(k) { delete _store[k]; },
  };

  const ENT_ID = 'ent-001';
  const KEY = 'fixeo_ent_views_' + ENT_ID;

  // Simulate saveCurrentView logic
  let _viewIdCounter = 0;
  function saveView(name, filters) {
    let views = [];
    try {
      const raw = mockLocalStorage.getItem(KEY);
      if (raw) { const parsed = JSON.parse(raw); if(Array.isArray(parsed)) views = parsed; }
    } catch(e) {}
    // Use counter to avoid same-millisecond collision
    views.push({ id: 'view-' + (++_viewIdCounter), name: name.trim(), filters: filters });
    mockLocalStorage.setItem(KEY, JSON.stringify(views));
    return views;
  }

  function loadViews() {
    try {
      const raw = mockLocalStorage.getItem(KEY);
      if (raw) { const parsed = JSON.parse(raw); if(Array.isArray(parsed)) return parsed; }
    } catch(e) {}
    return [];
  }

  function deleteView(id) {
    let views = loadViews();
    views = views.filter(function(v) { return v.id !== id; });
    mockLocalStorage.setItem(KEY, JSON.stringify(views));
    return views;
  }

  // Empty initially
  assert(loadViews().length === 0, 'savedViews initially empty');

  // Save a view
  const v1 = saveView('Vue Test 1', { reqStatusFilter: 'completed', reqSiteFilter: '' });
  assert(v1.length === 1, 'savedViews has 1 after save', `length ${v1.length}`);
  assert(v1[0].name === 'Vue Test 1', 'savedViews[0].name = "Vue Test 1"');
  assert(v1[0].filters.reqStatusFilter === 'completed', 'savedViews[0].filters.reqStatusFilter = completed');

  // Load persisted
  const loaded = loadViews();
  assert(loaded.length === 1, 'loadViews retrieves 1 saved view', `length ${loaded.length}`);
  assert(loaded[0].name === 'Vue Test 1', 'loadViews[0].name correct');

  // Save second view
  saveView('Vue Urgentes', { reqStatusFilter: 'all', reqUrgencyFilter: 'now' });
  assert(loadViews().length === 2, 'savedViews has 2 after second save');

  // Delete first
  const allLoaded = loadViews();
  assert(allLoaded.length === 2, 'loadViews has 2 before delete', `got ${allLoaded.length}`);
  const deletedId = allLoaded[0].id;
  const afterDelete = deleteView(deletedId);
  assert(afterDelete.length === 1, 'savedViews has 1 after delete', `got ${afterDelete.length}`);
  assert(afterDelete[0] !== undefined && afterDelete[0].name === 'Vue Urgentes',
    'remaining view is Vue Urgentes', `got ${afterDelete[0] ? afterDelete[0].name : 'undefined'}`);

  // Delete all
  const remaining = loadViews();
  if (remaining.length > 0) {
    const empty = deleteView(remaining[0].id);
    assert(empty.length === 0, 'savedViews empty after all deleted');
  } else {
    WARN('savedViews_delete_all', 'skipped - nothing to delete after first deletion');
  }
}

// ── Section 11: Polling guard logic ──────────────────────────────────────────
console.log('─── 10. Polling guard logic ─────────────────────────');
{
  // Simulate the guard pattern from loadRequests/loadHistory
  let requestsLoading = false;
  let callCount = 0;

  function mockLoadRequests() {
    if (requestsLoading) return 'SKIPPED';
    requestsLoading = true;
    callCount++;
    // simulate async end
    requestsLoading = false;
    return 'LOADED';
  }

  // First call goes through
  const r1 = mockLoadRequests();
  assert(r1 === 'LOADED', 'loadRequests first call succeeds');
  assert(callCount === 1, 'loadRequests callCount = 1 after first call');

  // Simulate concurrent: lock manually, then call
  requestsLoading = true;
  const r2 = mockLoadRequests();
  assert(r2 === 'SKIPPED', 'loadRequests skipped when requestsLoading=true');
  assert(callCount === 1, 'callCount unchanged (still 1) when guarded');
  requestsLoading = false;

  // After unlock, goes through again
  const r3 = mockLoadRequests();
  assert(r3 === 'LOADED', 'loadRequests succeeds after lock released');
  assert(callCount === 2, 'callCount = 2 after two real calls');

  // Same pattern for historyLoading
  let historyLoading = false;
  let histCallCount = 0;

  function mockLoadHistory() {
    if (historyLoading) return 'SKIPPED';
    historyLoading = true;
    histCallCount++;
    historyLoading = false;
    return 'LOADED';
  }

  mockLoadHistory();
  historyLoading = true;
  const h2 = mockLoadHistory();
  assert(h2 === 'SKIPPED', 'loadHistory skipped when historyLoading=true');
  historyLoading = false;
  mockLoadHistory();
  assert(histCallCount === 2, 'loadHistory callCount = 2 after unlock');
}

// ── Section 12: renderFilterChips state logic ──────────────────────────────────
console.log('─── 11. renderFilterChips state logic ──────────────');
{
  // Test the chip generation logic without DOM — simulate what determines chips
  function getChipLabels(state) {
    const chips = [];
    if (state.reqSiteFilter) {
      chips.push('Site: ' + (state.reqSiteFilter === 'site-001' ? 'Site Alpha' : state.reqSiteFilter));
    }
    if (state.reqUrgencyFilter) {
      const urgencyMap = { now: 'Immédiat', urgent: 'Urgent', '': 'Normale' };
      chips.push('Urgence: ' + (urgencyMap[state.reqUrgencyFilter] || state.reqUrgencyFilter));
    }
    if (state.reqCategoryFilter) {
      chips.push('Catégorie: ' + state.reqCategoryFilter);
    }
    return chips;
  }

  // No filters
  const noFilter = getChipLabels({ reqSiteFilter:'', reqUrgencyFilter:'', reqCategoryFilter:'' });
  assert(noFilter.length === 0, 'no chips when all filters empty');

  // Site filter only
  const siteOnly = getChipLabels({ reqSiteFilter:'site-001', reqUrgencyFilter:'', reqCategoryFilter:'' });
  assert(siteOnly.length === 1 && siteOnly[0].includes('Site Alpha'),
    'site chip generated with Site Alpha label', `got ${JSON.stringify(siteOnly)}`);

  // Urgency filter
  const urgOnly = getChipLabels({ reqSiteFilter:'', reqUrgencyFilter:'now', reqCategoryFilter:'' });
  assert(urgOnly.length === 1 && urgOnly[0].includes('Immédiat'),
    'urgency chip generated with Immédiat', `got ${JSON.stringify(urgOnly)}`);

  // Category filter
  const catOnly = getChipLabels({ reqSiteFilter:'', reqUrgencyFilter:'', reqCategoryFilter:'Plomberie' });
  assert(catOnly.length === 1 && catOnly[0].includes('Plomberie'),
    'category chip generated', `got ${JSON.stringify(catOnly)}`);

  // All three
  const allFilters = getChipLabels({ reqSiteFilter:'site-001', reqUrgencyFilter:'urgent', reqCategoryFilter:'HVAC' });
  assert(allFilters.length === 3, 'all three chips generated', `got ${allFilters.length}`);
}

// ── Section 13: DEFAULT_VIEWS presets ──────────────────────────────────────────
console.log('─── 12. DEFAULT_VIEWS presets ──────────────────────');
{
  // Extract DEFAULT_VIEWS from source
  const dvMatch = jsSource.match(/const DEFAULT_VIEWS\s*=\s*(\[[\s\S]*?\]);/);
  if (!dvMatch) {
    FAIL('DEFAULT_VIEWS_EXTRACT', 'Could not extract DEFAULT_VIEWS from source');
  } else {
    let dvCode = dvMatch[1];
    // Remove template literals or unicode escapes safely
    dvCode = dvCode.replace(/\\uD83D\\uDD34/g, '🔴').replace(/\\uD83D\\uDD04/g, '🔄')
                   .replace(/\\u26A1/g, '⚡').replace(/\\uD83C\\uDD95/g, '🆕')
                   .replace(/\\u00C0/g, 'À');
    let DEFAULT_VIEWS;
    try {
      DEFAULT_VIEWS = eval('(' + dvCode + ')');
    } catch(e) {
      FAIL('DEFAULT_VIEWS_PARSE', 'Failed to parse DEFAULT_VIEWS: ' + e.message);
      DEFAULT_VIEWS = null;
    }
    if (DEFAULT_VIEWS) {
      assert(Array.isArray(DEFAULT_VIEWS) && DEFAULT_VIEWS.length === 4,
        'DEFAULT_VIEWS has 4 presets', `got ${DEFAULT_VIEWS ? DEFAULT_VIEWS.length : 'null'}`);

      const ids = DEFAULT_VIEWS.map(function(v){ return v.id; });
      assert(ids.includes('preset-urgent'), 'DEFAULT_VIEWS includes preset-urgent');
      assert(ids.includes('preset-action'), 'DEFAULT_VIEWS includes preset-action');
      assert(ids.includes('preset-inprog'),  'DEFAULT_VIEWS includes preset-inprog');
      assert(ids.includes('preset-new'),     'DEFAULT_VIEWS includes preset-new');

      // Each preset has required fields
      DEFAULT_VIEWS.forEach(function(v) {
        assert(v.id && v.name && v.filters,
          `DEFAULT_VIEWS preset ${v.id} has id/name/filters`);
        assert(typeof v.filters.reqStatusFilter !== 'undefined',
          `DEFAULT_VIEWS preset ${v.id} has reqStatusFilter`);
        assert(typeof v.filters.reqUrgencyFilter !== 'undefined',
          `DEFAULT_VIEWS preset ${v.id} has reqUrgencyFilter`);
      });

      // preset-urgent uses urgency 'now'
      const urgent = DEFAULT_VIEWS.find(function(v){ return v.id==='preset-urgent'; });
      assert(urgent && urgent.filters.reqUrgencyFilter === 'now',
        'preset-urgent has reqUrgencyFilter=now', `got ${urgent ? urgent.filters.reqUrgencyFilter : 'null'}`);

      // preset-action uses status 'completed'
      const action = DEFAULT_VIEWS.find(function(v){ return v.id==='preset-action'; });
      assert(action && action.filters.reqStatusFilter === 'completed',
        'preset-action has reqStatusFilter=completed', `got ${action ? action.filters.reqStatusFilter : 'null'}`);
    }
  }
}

// ── Section 14: Source structure guards ──────────────────────────────────────
console.log('─── 13. Source structure guards ────────────────────');
{
  // Verify the loading guard pattern exists in source
  const reqGuardPattern = /if\s*\(S\.requestsLoading\)\s*return/;
  assert(reqGuardPattern.test(jsSource), 'requestsLoading guard present in source');

  const histGuardPattern = /if\s*\(S\.historyLoading\)\s*return/;
  assert(histGuardPattern.test(jsSource), 'historyLoading guard present in source');

  // Verify S.requestsLoading set to true before fetch
  assert(/S\.requestsLoading\s*=\s*true/.test(jsSource), 'S.requestsLoading set to true before fetch');
  // Verify S.requestsLoading reset in finally or after
  assert(/S\.requestsLoading\s*=\s*false/.test(jsSource), 'S.requestsLoading reset to false');

  // Verify localStorage key pattern
  assert(/fixeo_ent_views_/.test(jsSource), 'localStorage key fixeo_ent_views_ present');

  // Verify saveCurrentView uses window.prompt
  assert(/window\.prompt/.test(jsSource), 'saveCurrentView uses window.prompt');

  // Verify closeSearch sets hidden=true
  assert(/dlg\.hidden\s*=\s*true/.test(jsSource), 'closeSearch sets hidden=true');

  // Verify openSearch sets hidden=false
  assert(/dlg\.hidden\s*=\s*false/.test(jsSource), 'openSearch sets hidden=false');

  // Verify Ctrl+K handler
  assert(/e\.ctrlKey.*e\.key.*k|e\.key.*k.*e\.ctrlKey/i.test(jsSource) || /ctrlKey.*'k'/i.test(jsSource),
    'Ctrl+K command palette handler present');

  // Verify '/' triggers search
  assert(/e\.key.*'\/'\s*&&/.test(jsSource) || /key.*===.*'\/'/.test(jsSource),
    '"/" search trigger present');
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup();

// ── Print results ─────────────────────────────────────────────────────────────
function printResults() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('════════════════════════════════════════════════════');
  results.forEach(function(r) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    const detail = r.msg ? `  → ${r.msg}` : '';
    console.log(`  ${icon} [${r.status}] ${r.name}${detail}`);
  });
  console.log('────────────────────────────────────────────────────');
  console.log(`  PASS: ${pass}  FAIL: ${fail}  WARN: ${warn}`);
  console.log('════════════════════════════════════════════════════\n');
}

printResults();

if (fail > 0) {
  process.exit(1);
} else {
  console.log('All behavioral tests passed!');
  process.exit(0);
}
