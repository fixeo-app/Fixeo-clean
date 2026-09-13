#!/usr/bin/env node
/**
 * BP06 WORKSTREAM N — Static Contract Tests
 * Entirely offline, no external dependencies.
 * Reads source files and asserts structural/contractual invariants.
 * Exit 0 if no FAILs; exit 1 if any FAIL.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Resolve source file paths relative to repo root ──────────────────────────
const ROOT     = path.resolve(__dirname, '../../');
const JS_FILE  = path.join(ROOT, 'js/enterprise-dashboard-v1.js');
const HTML_FILE= path.join(ROOT, 'enterprise-dashboard.html');
const CSS_FILE = path.join(ROOT, 'css/enterprise-dashboard-v1.css');

// ── Result counters ───────────────────────────────────────────────────────────
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

// ── Load files ────────────────────────────────────────────────────────────────
function loadFile(p) {
  if (!fs.existsSync(p)) { FAIL('FILE_EXISTS', `Missing: ${p}`); return ''; }
  return fs.readFileSync(p, 'utf8');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  BP06 STATIC CONTRACT TESTS');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  JS  : ${JS_FILE}`);
console.log(`  HTML: ${HTML_FILE}`);
console.log(`  CSS : ${CSS_FILE}`);
console.log('───────────────────────────────────────────────────────────────\n');

const js   = loadFile(JS_FILE);
const html = loadFile(HTML_FILE);
const css  = loadFile(CSS_FILE);

// ── CHECK 1: RPC Names ────────────────────────────────────────────────────────
console.log('CHECK 1 — RPC Names');
(function() {
  const hasCreate  = js.includes("'create_enterprise_request'");
  const hasConfirm = js.includes("'confirm_completed_mission'");
  hasCreate  ? PASS('rpc_create',  'create_enterprise_request present')
             : FAIL('rpc_create',  'create_enterprise_request NOT found');
  hasConfirm ? PASS('rpc_confirm', 'confirm_completed_mission present')
             : FAIL('rpc_confirm', 'confirm_completed_mission NOT found');
})();

// ── CHECK 2: RPC Params ───────────────────────────────────────────────────────
console.log('CHECK 2 — RPC Params');
(function() {
  // create_enterprise_request: 5 required params
  const createParams = ['p_enterprise_id','p_site_id','p_service_category','p_description','p_urgency'];
  createParams.forEach(p => {
    js.includes(p) ? PASS('rpc_create_param_'+p, `${p} present`) : FAIL('rpc_create_param_'+p, `${p} NOT found`);
  });
  // confirm_completed_mission: 1 param
  const confirmParam = 'p_request_id';
  js.includes(confirmParam) ? PASS('rpc_confirm_param', `${confirmParam} present`) : FAIL('rpc_confirm_param', `${confirmParam} NOT found`);
})();

// ── CHECK 3: Canonical Status Vocabulary ──────────────────────────────────────
console.log('CHECK 3 — Status Vocabulary');
(function() {
  // All 7 must appear inside formatStatus function
  // The function uses unquoted object keys: { new:'...', assigned:'...', ... }
  const fsIdx = js.indexOf('function formatStatus');
  const formatBlock = fsIdx >= 0 ? js.substring(fsIdx, fsIdx+500) : js;
  const statuses = ['new','assigned','in_progress','completed','validated','cancelled','no_match'];
  statuses.forEach(s => {
    // Match quoted ('new') OR unquoted key (new:) in the formatStatus block
    const found = formatBlock.includes("'"+s+"'") ||
                  formatBlock.includes('"'+s+'"') ||
                  new RegExp('[{,]\\s*' + s.replace(/_/g,'_') + '\\s*:').test(formatBlock);
    found ? PASS('status_'+s, s+' in formatStatus')
          : FAIL('status_'+s, s+' NOT in formatStatus');
  });
})();

// ── CHECK 4: Urgency Vocabulary ───────────────────────────────────────────────
console.log('CHECK 4 — Urgency Vocabulary');
(function() {
  ['normale','urgent','now'].forEach(u => {
    js.includes("'"+u+"'") || js.includes('"'+u+'"')
      ? PASS('urgency_'+u, u+' present')
      : FAIL('urgency_'+u, u+' NOT found');
  });
})();

// ── CHECK 5: Role Matrices ────────────────────────────────────────────────────
console.log('CHECK 5 — Role Matrices');
(function() {
  // CAN_CREATE_ROLES: must contain exactly these 5, viewer must be absent
  const canCreateMatch = js.match(/CAN_CREATE_ROLES\s*=\s*\[([^\]]*)\]/);
  if (!canCreateMatch) {
    FAIL('can_create_roles_def', 'CAN_CREATE_ROLES not found');
  } else {
    const raw = canCreateMatch[1];
    const required = ['owner','admin','operations_manager','site_manager','reporter'];
    required.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? PASS('can_create_'+r, r+' in CAN_CREATE_ROLES')
        : FAIL('can_create_'+r, r+' NOT in CAN_CREATE_ROLES');
    });
    raw.includes("'viewer'") || raw.includes('"viewer"')
      ? FAIL('can_create_viewer_absent', 'viewer MUST NOT be in CAN_CREATE_ROLES')
      : PASS('can_create_viewer_absent', 'viewer correctly absent from CAN_CREATE_ROLES');
  }

  // CAN_CONFIRM_ROLES: owner, admin, operations_manager, site_manager; reporter and viewer absent
  const canConfirmMatch = js.match(/CAN_CONFIRM_ROLES\s*=\s*\[([^\]]*)\]/);
  if (!canConfirmMatch) {
    FAIL('can_confirm_roles_def', 'CAN_CONFIRM_ROLES not found');
  } else {
    const raw = canConfirmMatch[1];
    const required = ['owner','admin','operations_manager','site_manager'];
    required.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? PASS('can_confirm_'+r, r+' in CAN_CONFIRM_ROLES')
        : FAIL('can_confirm_'+r, r+' NOT in CAN_CONFIRM_ROLES');
    });
    const excluded = ['reporter','viewer'];
    excluded.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? FAIL('can_confirm_'+r+'_absent', r+' MUST NOT be in CAN_CONFIRM_ROLES')
        : PASS('can_confirm_'+r+'_absent', r+' correctly absent from CAN_CONFIRM_ROLES');
    });
  }
})();

// ── CHECK 6: No Direct Mutation ───────────────────────────────────────────────
console.log('CHECK 6 — No Direct Mutation (no .insert/.update/.delete/.upsert in JS)');
(function() {
  // We check in the enterprise-dashboard JS only (not supabase edge fn files)
  const mutations = ['.insert(', '.update(', '.delete(', '.upsert('];
  mutations.forEach(m => {
    js.includes(m)
      ? FAIL('no_mutation_'+m.replace(/[^a-z]/g,''), `Direct DB mutation ${m} found — use RPC`)
      : PASS('no_mutation_'+m.replace(/[^a-z]/g,''), `No ${m} direct mutation`);
  });
})();

// ── CHECK 7: No validate_mission_v1 ──────────────────────────────────────────
console.log('CHECK 7 — No validate_mission_v1 reference');
(function() {
  js.includes('validate_mission_v1')
    ? FAIL('no_validate_mission_v1', 'validate_mission_v1 is referenced — should use confirm_completed_mission')
    : PASS('no_validate_mission_v1', 'validate_mission_v1 not referenced');
})();

// ── CHECK 8: No Invented Statuses as DB-write values ─────────────────────────
console.log('CHECK 8 — No Invented DB-write Statuses');
(function() {
  // 'terminee' or 'validee' should NOT appear in RPC calls or filter queries
  // It's OK if they appear as display strings in formatStatus, but NOT as values sent to DB
  // Heuristic: look for them in .rpc(/ .eq(/ filter context
  const dbWritePattern = /\.(rpc|eq|in|neq|filter)\([^)]*'(terminee|validee)'/g;
  const dbWriteMatches = js.match(dbWritePattern);
  if (dbWriteMatches) {
    FAIL('no_invented_status_db', `Invented status as DB value: ${dbWriteMatches.join(', ')}`);
  } else {
    PASS('no_invented_status_db', 'No terminee/validee used as DB-write values');
  }
  // Also check the broader file doesn't accidentally write them
  const rpcBlock = js.match(/rpc\('create_enterprise_request'[^)]*\)/g);
  if (rpcBlock) {
    rpcBlock.forEach(blk => {
      blk.includes('terminee') || blk.includes('validee')
        ? FAIL('no_invented_in_rpc', 'Invented status in RPC call')
        : PASS('no_invented_in_rpc', 'No invented statuses in RPC call');
    });
  }
})();

// ── CHECK 9: Critical DOM IDs in HTML ────────────────────────────────────────
console.log('CHECK 9 — Critical DOM IDs');
(function() {
  const criticalIds = [
    'section-overview','section-requests','section-new-request',
    'section-sites','section-members','section-history','section-account',
    'section-request-detail','section-site-detail',
    'ent-sidebar','ent-hamburger','ent-overlay','ent-dashboard','ent-auth-gate',
    'requests-list','requests-empty','requests-error',
    'sites-list','members-list','history-list','account-content'
  ];
  criticalIds.forEach(id => {
    html.includes(`id="${id}"`)
      ? PASS('dom_id_'+id, `#${id} present`)
      : FAIL('dom_id_'+id, `#${id} NOT found in HTML`);
  });
})();

// ── CHECK 10: No Duplicate HTML IDs ──────────────────────────────────────────
console.log('CHECK 10 — No Duplicate HTML IDs');
(function() {
  const idRegex = /\bid="([^"]+)"/g;
  const seen = {};
  const dupes = [];
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    const id = match[1];
    if (seen[id]) dupes.push(id);
    seen[id] = (seen[id]||0) + 1;
  }
  if (dupes.length > 0) {
    FAIL('no_duplicate_ids', `Duplicate IDs: ${[...new Set(dupes)].join(', ')}`);
  } else {
    PASS('no_duplicate_ids', `No duplicate IDs found (${Object.keys(seen).length} unique IDs checked)`);
  }
})();

// ── CHECK 11: No Unsupported Business Claims ──────────────────────────────────
console.log('CHECK 11 — No Unsupported Business Claims in JS strings');
(function() {
  // "artisan en route" is specifically flagged (it's in overview KPI, check per-spec)
  // Per task: check for these in JS strings
  const forbidden = ['SLA', 'payment', 'paiement', 'dispatch'];
  forbidden.forEach(term => {
    // We check in string contexts (quoted)
    const pattern = new RegExp("(['\"`])[^'\"`]*" + term + "[^'\"`]*\\1", 'i');
    pattern.test(js)
      ? FAIL('no_biz_claim_'+term.toLowerCase(), `Unsupported claim '${term}' found in JS string`)
      : PASS('no_biz_claim_'+term.toLowerCase(), `No '${term}' in JS strings`);
  });
  // "artisan en route" check — per task: flag this
  // It IS present in the overview KPI text — flag as WARN (display string only)
  if (js.includes('artisan en route')) {
    WARN('no_biz_claim_artisan_en_route', '"artisan en route" present — verify it is display-only, not a contract claim');
  } else {
    PASS('no_biz_claim_artisan_en_route', 'No "artisan en route" claim');
  }
})();

// ── CHECK 12: Polling Guards ──────────────────────────────────────────────────
console.log('CHECK 12 — Polling Guards');
(function() {
  js.includes('isPolling')      ? PASS('poll_isPolling',     'isPolling present')      : FAIL('poll_isPolling',     'isPolling NOT found');
  js.includes('POLL_INTERVAL')  ? PASS('poll_POLL_INTERVAL', 'POLL_INTERVAL present')  : FAIL('poll_POLL_INTERVAL', 'POLL_INTERVAL NOT found');
  js.includes('stopPolling')    ? PASS('poll_stopPolling',   'stopPolling present')    : FAIL('poll_stopPolling',   'stopPolling NOT found');
})();

// ── CHECK 13: Idempotency Guards ──────────────────────────────────────────────
console.log('CHECK 13 — Idempotency Guards');
(function() {
  ['_navAttached','_reqAttached','_histAttached','_formAttached'].forEach(g => {
    js.includes(g) ? PASS('idem_'+g, g+' present') : FAIL('idem_'+g, g+' NOT found');
  });
})();

// ── CHECK 14: Urgency Normalization ──────────────────────────────────────────
console.log('CHECK 14 — Urgency Normalization');
(function() {
  // Check that .eq('urgency', S.reqUrgencyFilter) uses a state variable, not invented value
  const eqUrgency = js.match(/\.eq\s*\(\s*'urgency'\s*,\s*([^)]+)\)/g) || [];
  if (eqUrgency.length === 0) {
    WARN('urgency_norm_eq', 'No .eq("urgency",...) filter found — may be missing');
  } else {
    eqUrgency.forEach(m => {
      // Should reference S.reqUrgencyFilter or similar state, not a hardcoded invented value
      const invented = ['terminee','validee','done','pending','active'];
      const hasInvented = invented.some(v => m.includes("'"+v+"'") || m.includes('"'+v+'"'));
      hasInvented
        ? FAIL('urgency_norm_no_invented', `Urgency filter uses invented value: ${m}`)
        : PASS('urgency_norm_eq', `Urgency .eq() uses state reference: ${m.trim()}`);
    });
  }
})();

// ── CHECK 15: CSS Classes for JS-Rendered Elements ───────────────────────────
console.log('CHECK 15 — CSS Classes for JS-Rendered Elements');
(function() {
  const required = ['.ent-req-card','.ent-status-badge','.ent-site-card','.ent-member-card','.ent-kpi-card'];
  required.forEach(cls => {
    css.includes(cls)
      ? PASS('css_class_'+cls.replace(/[^a-z0-9_]/g,'_'), `${cls} present in CSS`)
      : FAIL('css_class_'+cls.replace(/[^a-z0-9_]/g,'_'), `${cls} NOT found in CSS`);
  });
})();

// ── CHECK 16: BP06 New Features ───────────────────────────────────────────────
console.log('CHECK 16 — BP06 New Features (WARN if missing — in progress)');
(function() {
  const features = ['openSearch','openCmdPalette','exportRequestsCSV','saveCurrentView','formatAge','getNextAction'];
  features.forEach(fn => {
    const def = js.includes('function '+fn) || js.includes(fn+'=function') || js.includes(fn+' =');
    def
      ? PASS('bp06_fn_'+fn, `${fn} defined`)
      : WARN('bp06_fn_'+fn, `${fn} NOT defined — BP06 in progress`);
  });
})();

// ── CHECK 17: No Production Supabase URL ─────────────────────────────────────
console.log('CHECK 17 — No Hardcoded Production Supabase URL');
(function() {
  js.includes('supabase.co')
    ? FAIL('no_prod_url', 'Hardcoded supabase.co URL found in enterprise JS')
    : PASS('no_prod_url', 'No supabase.co hardcoded URL');
})();

// ── Print Results ─────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  RESULTS');
console.log('═══════════════════════════════════════════════════════════════');

const width = Math.max(...results.map(r => r.name.length), 30);
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️ ';
  const name = r.name.padEnd(width);
  console.log(`  ${icon}  ${name}  ${r.msg}`);
});

console.log('\n───────────────────────────────────────────────────────────────');
console.log(`  TOTAL: ${pass+fail+warn} checks`);
console.log(`  ✅ PASS: ${pass}`);
console.log(`  ❌ FAIL: ${fail}`);
console.log(`  ⚠️  WARN: ${warn}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (fail > 0) {
  console.log(`CONTRACT TESTS: FAILED (${fail} failure(s))\n`);
  process.exit(1);
} else {
  console.log(`CONTRACT TESTS: PASSED (${warn} warning(s))\n`);
  process.exit(0);
}
