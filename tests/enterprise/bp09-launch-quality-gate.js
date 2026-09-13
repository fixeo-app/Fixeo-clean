/**
 * BP09 — Enterprise Launch Quality Gate
 *
 * Categories:
 *   Security   — no unsafe innerHTML in production paths; no credential leaks
 *   Auth       — session gate present; FE-AUTH-01 pattern enforced
 *   Roles      — CAN_CREATE_ROLES / CAN_CONFIRM_ROLES match backend contracts
 *   Dedup      — submit buttons disabled during in-flight requests
 *   CSS        — brace balance
 *   Syntax     — JS parses (heuristic check)
 *   Accessibility — aria labels on icon buttons, focus trap, keyboard nav
 *   Performance — poll timer managed; no hardcoded prod URLs
 *   Pricing    — protected files untouched
 *
 * Safe: read-only, no exec, no network, no DB.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT    = path.resolve(__dirname, '..', '..');
const JS_FILE = path.join(ROOT, 'js', 'enterprise-dashboard-v1.js');
const CSS_FILE = path.join(ROOT, 'css', 'enterprise-dashboard-v1.css');
const HTML_FILE = path.join(ROOT, 'enterprise-dashboard.html');
const PRICING_ENGINE = path.join(ROOT, 'data', 'pricing', 'engine', 'engine-test-report.v1.json');
const PRICING_SHADOW = path.join(ROOT, 'data', 'pricing', 'shadow', 'shadow-results.v1.json');

// ── Helpers ────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0, WARN = 0;
const results = [];

function check(id, desc, cond, severity = 'FAIL') {
  if (cond) {
    PASS++;
    results.push({ id, status: 'PASS', desc });
    process.stdout.write(`  ✅  ${id.padEnd(42)}${desc}\n`);
  } else {
    if (severity === 'WARN') {
      WARN++;
      results.push({ id, status: 'WARN', desc });
      process.stdout.write(`  ⚠️   ${id.padEnd(42)}${desc}\n`);
    } else {
      FAIL++;
      results.push({ id, status: 'FAIL', desc });
      process.stdout.write(`  ❌  ${id.padEnd(42)}${desc}\n`);
    }
  }
}

// ── Load source files ──────────────────────────────────────────────────────
const js  = fs.readFileSync(JS_FILE,   'utf8');
const css = fs.readFileSync(CSS_FILE,  'utf8');
const html = fs.readFileSync(HTML_FILE, 'utf8');

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 1 — SYNTAX / FILE INTEGRITY
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ SYNTAX / FILE INTEGRITY');

// CSS brace balance
const cssOpens  = (css.match(/\{/g) || []).length;
const cssCloses = (css.match(/\}/g) || []).length;
check('css_brace_balance',       'CSS brace count balanced', cssOpens === cssCloses);
check('css_not_empty',           'CSS file not empty (>1000 chars)', css.length > 1000);
check('js_not_empty',            'JS file not empty (>5000 chars)', js.length > 5000);

// Basic JS parse heuristic — balanced braces / parens / brackets
const jsOpens  = (js.match(/\{/g) || []).length;
const jsCloses = (js.match(/\}/g) || []).length;
const jsParO   = (js.match(/\(/g) || []).length;
const jsParC   = (js.match(/\)/g) || []).length;
check('js_brace_balance',        'JS brace count balanced', jsOpens === jsCloses);
check('js_paren_balance',        'JS paren count balanced', jsParO  === jsParC);

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 2 — SECURITY: safeHtml usage
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ SECURITY — XSS / safeHtml');

// safeHtml function must exist and perform all 4 escapes
check('sec_safehtml_defined',    'safeHtml() function defined', /function safeHtml\s*\(/.test(js));
check('sec_safehtml_amp',        "safeHtml escapes &",  js.includes("'&amp;'"));
check('sec_safehtml_lt',         "safeHtml escapes <",  js.includes("'&lt;'"));
check('sec_safehtml_gt',         "safeHtml escapes >",  js.includes("'&gt;'"));
check('sec_safehtml_quot',       'safeHtml escapes "',  js.includes("'&quot;'"));

// No eval() or new Function() in production code
check('sec_no_eval',             'No eval() call in JS',       !/\beval\s*\(/.test(js));
check('sec_no_function_ctor',    'No new Function() in JS',    !/\bnew\s+Function\s*\(/.test(js));

// XSS: Verify safeHtml usage pattern — check multi-line window (±5 lines)
// Static analysis: innerHTML= where surrounding context has no safeHtml AND is not a static skeleton/clear
const jsLines = js.split('\n');
const trulyUnsafe = [];
jsLines.forEach((l, i) => {
  if (!/innerHTML\s*[=+]/.test(l)) return;
  const ctx = jsLines.slice(Math.max(0, i - 1), Math.min(jsLines.length, i + 8)).join('\n');
  const isClear       = /innerHTML\s*=\s*''/.test(l);
  const isStaticHtml  = /innerHTML\s*=\s*['"]<[^'"]{0,120}>/.test(l);  // static skeleton/error HTML
  const ctxHasSafe    = /safeHtml\s*\(/.test(ctx);
  if (!isClear && !isStaticHtml && !ctxHasSafe) trulyUnsafe.push(i + 1);
});
check('sec_innerhtml_uses_safehtml',
  `innerHTML writes guarded by safeHtml (${trulyUnsafe.length} uncovered)`,
  trulyUnsafe.length === 0, 'WARN');

// No credential leaks via console.log
check('sec_no_console_token',    'No console.log of token/jwt/password/secret/key', 
  !/console\.log.*(?:token|jwt|password|secret\b|apikey)/i.test(js));

// No hardcoded supabase production URL
check('sec_no_prod_url',         'No hardcoded supabase.co URL',
  !/https:\/\/[a-z0-9]+\.supabase\.co/.test(js));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 3 — AUTH / SESSION GATE (FE-AUTH-01)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ AUTH / SESSION GATE');

check('auth_get_session',        'boot() calls auth.getSession()',
  /auth\.getSession\s*\(/.test(js));
check('auth_no_session_redirect','boot() redirects to "/" when no session',
  /if\s*\(\s*!session\s*\).*location\.href\s*=\s*'\/'/.test(js));
check('auth_active_status_filter','FE-AUTH-01: only active memberships enter',
  /eq\s*\(\s*['"]status['"]\s*,\s*['"]active['"]\s*\)/.test(js));
check('auth_on_state_change',    'onAuthStateChange handler registered',
  /onAuthStateChange\s*\(/.test(js));
check('auth_sign_out',           'signOut() implemented',
  /auth\.signOut\s*\(/.test(js));
check('auth_gate_html',          'HTML: ent-auth-gate element present',
  /id="ent-auth-gate"/.test(html));
check('auth_denied_html',        'HTML: ent-access-denied element present',
  /id="ent-access-denied"/.test(html));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 4 — ROLE CONTRACTS
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ ROLE CONTRACTS');

// CAN_CREATE_ROLES must include all documented roles
const CREATE_REQUIRED = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter'];
const canCreateMatch = js.match(/CAN_CREATE_ROLES\s*=\s*\[([^\]]+)\]/);
const canCreateRaw   = canCreateMatch ? canCreateMatch[1] : '';
for (const role of CREATE_REQUIRED) {
  check(`role_create_${role}`, `CAN_CREATE_ROLES includes '${role}'`,
    canCreateRaw.includes(`'${role}'`) || canCreateRaw.includes(`"${role}"`));
}

// CAN_CONFIRM_ROLES must include documented roles; must NOT include 'reporter'/'viewer'
const CONFIRM_REQUIRED = ['owner', 'admin', 'operations_manager', 'site_manager'];
const canConfirmMatch = js.match(/CAN_CONFIRM_ROLES\s*=\s*\[([^\]]+)\]/);
const canConfirmRaw   = canConfirmMatch ? canConfirmMatch[1] : '';
for (const role of CONFIRM_REQUIRED) {
  check(`role_confirm_${role}`, `CAN_CONFIRM_ROLES includes '${role}'`,
    canConfirmRaw.includes(`'${role}'`) || canConfirmRaw.includes(`"${role}"`));
}
check('role_confirm_no_reporter', "CAN_CONFIRM_ROLES excludes 'reporter'",
  !canConfirmRaw.includes("'reporter'") && !canConfirmRaw.includes('"reporter"'));
check('role_confirm_no_viewer',   "CAN_CONFIRM_ROLES excludes 'viewer'",
  !canConfirmRaw.includes("'viewer'") && !canConfirmRaw.includes('"viewer"'));

// owner must NOT be selectable in role-change UI
check('role_no_owner_in_select',  "Role select UI excludes owner option",
  /role==='owner'/.test(js) || /!== 'owner'/.test(js));

// canCreate / canConfirm functions exist
check('role_fn_canCreate',        'canCreate() function defined',
  /function canCreate\s*\(/.test(js));
check('role_fn_canConfirm',       'canConfirm() function defined',
  /function canConfirm\s*\(/.test(js));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 5 — DEDUP / IN-FLIGHT PROTECTION
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ DEDUP / IN-FLIGHT PROTECTION');

check('dedup_submit_disabled',   'Submit button disabled before RPC in new-request',
  /submitBtn\.disabled\s*=\s*true/.test(js));
check('dedup_submit_reenabled',  'Submit button re-enabled on error path',
  /submitBtn\.disabled\s*=\s*false/.test(js));
check('dedup_save_disabled',     'Save button disabled before account/member RPC',
  /saveBtn\.disabled\s*=\s*true/.test(js));
check('dedup_save_reenabled',    'Save button re-enabled on completion',
  /saveBtn\.disabled\s*=\s*false/.test(js));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 6 — ACCESSIBILITY
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ ACCESSIBILITY');

check('a11y_trapFocus_defined',  'trapFocus() helper defined',
  /function trapFocus\s*\(/.test(js));
check('a11y_releaseFocusTrap',   'releaseFocusTrap returned from trapFocus',
  /return function releaseFocusTrap/.test(js));
check('a11y_escape_handler',     "Escape key closes dialogs/search",
  /e\.key\s*===\s*['"]Escape['"]/.test(js));
check('a11y_enter_space',        "Enter/Space activates interactive divs",
  /e\.key\s*===\s*['"]Enter['"]/.test(js) && /e\.key\s*===\s*['"]\s['"]/.test(js));
check('a11y_aria_expanded',      'aria-expanded managed on hamburger',
  /setAttribute\s*\(\s*['"]aria-expanded['"]/.test(js));
check('a11y_aria_current',       'aria-current managed on nav links',
  /setAttribute\s*\(\s*['"]aria-current['"]/.test(js));
check('a11y_aria_selected',      'aria-selected managed on tabs',
  /setAttribute\s*\(\s*['"]aria-selected['"]/.test(js));
check('a11y_aria_pressed',       'aria-pressed managed on toggle buttons',
  /setAttribute\s*\(\s*['"]aria-pressed['"]/.test(js));
check('a11y_aria_busy',          'aria-busy managed during loading',
  /setAttribute\s*\(\s*['"]aria-busy['"]/.test(js));
check('a11y_aria_live',          'aria-live polite regions present in HTML',
  /aria-live="polite"/.test(html));
check('a11y_aria_live_assertive','aria-live assertive for action-required alerts',
  /aria-live="assertive"/.test(html));
check('a11y_hamburger_label',    'Hamburger button has aria-label in HTML',
  /id="ent-hamburger"[^>]*aria-label|aria-label[^>]*id="ent-hamburger"/.test(html) ||
  /aria-label="Ouvrir le menu/.test(html));
check('a11y_search_trigger_label','Search trigger button has aria-label in HTML',
  /aria-label="Recherche rapide/.test(html));
check('a11y_nav_role',           'Sidebar nav has role=navigation',
  /role="navigation"/.test(html));
check('a11y_main_role',          'Main content has role=main',
  /role="main"/.test(html));
check('a11y_tabindex_cards',     'Interactive cards get tabindex="0"',
  /setAttribute\s*\(\s*['"]tabindex['"],\s*['"]0['"]/.test(js));
check('a11y_tabindex_minus1',    'Focus trap queries tabindex="-1" exclusion',
  /tabindex\]:not\(\[tabindex="-1"\]/.test(js));
check('a11y_focus_restore',      'Search close restores focus to previous element',
  /_searchPrevFocus.*focus\s*\(\s*\)/.test(js));
check('a11y_img_alt',            'Logo images have alt attributes in HTML',
  /alt="FIXEO"/.test(html));
check('a11y_dialog_role_status', 'Auth gate has role=status in HTML',
  /role="status"/.test(html));
check('a11y_dialog_role_alert',  'Access denied has role=alert in HTML',
  /role="alert"/.test(html));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 7 — PERFORMANCE
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ PERFORMANCE');

check('perf_poll_timer_cleared', 'setInterval has matching clearInterval',
  /clearInterval\s*\(\s*S\.pollTimer/.test(js));
check('perf_search_debounce',    'Search input uses debounce (setTimeout)',
  /searchDebounceTimer\s*=\s*setTimeout/.test(js));
check('perf_loading_guard_req',  'requestsLoading guard prevents double-fetch',
  /requestsLoading/.test(js));
check('perf_loading_guard_hist', 'historyLoading guard prevents double-fetch',
  /historyLoading/.test(js));
check('perf_no_prod_hardcoded',  'No hardcoded supabase.co production URL',
  !/https:\/\/[a-z0-9]{20,}\.supabase\.co/.test(js));
check('perf_removeeventlistener','removeEventListener used (no bare leak)',
  /removeEventListener\s*\(/.test(js));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 8 — RESPONSIVE
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ RESPONSIVE');

check('resp_media_mobile',       'CSS has mobile breakpoint (≤480px)',
  /@media\s*\(\s*max-width\s*:\s*48[01]px/.test(css) ||
  /@media\s*\(\s*max-width\s*:\s*479px/.test(css));
check('resp_media_tablet',       'CSS has tablet breakpoint (600-900px range)',
  /@media\s*\(\s*(?:min|max)-width\s*:\s*[6-9]\d{2}px/.test(css));
check('resp_media_desktop',      'CSS has desktop breakpoint (≥960px)',
  /@media\s*\(\s*min-width\s*:\s*96[0-9]px/.test(css));
check('resp_touch_targets',      'CSS: 44px min touch targets on mobile',
  /min-height\s*:\s*44px/.test(css) || /min-height\s*:\s*56px/.test(css));
check('resp_overflow_hidden',    'CSS: text overflow ellipsis for long text',
  /text-overflow\s*:\s*ellipsis/.test(css));
check('resp_flexbox_used',       'CSS: flexbox layout used throughout',
  /display\s*:\s*flex/.test(css));
check('resp_grid_used',          'CSS: CSS grid used for KPI layout',
  /display\s*:\s*grid/.test(css));
check('resp_min_width_zero',     'CSS: min-width:0 on flex children (flex-overflow safe)',
  /min-width\s*:\s*0/.test(css));
check('resp_search_fullscreen',  'CSS: search/cmd panels full-screen on mobile',
  /max-width\s*:\s*100%/.test(css) && /@media\s*\(\s*max-width\s*:\s*600px/.test(css));
check('resp_viewport_meta',      'HTML: viewport meta tag present',
  /<meta[^>]+viewport/.test(html));

// ──────────────────────────────────────────────────────────────────────────
// BLOCK 9 — PRICING FILE PROTECTION
// ──────────────────────────────────────────────────────────────────────────
console.log('\n▸ PRICING FILE PROTECTION');

check('pricing_engine_exists',   'engine-test-report.v1.json exists (not deleted)',
  fs.existsSync(PRICING_ENGINE));
check('pricing_shadow_exists',   'shadow-results.v1.json exists (not deleted)',
  fs.existsSync(PRICING_SHADOW));

// ──────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' BP09 LAUNCH QUALITY GATE RESULTS');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` Total  : ${PASS + FAIL + WARN}`);
console.log(` ✅ PASS : ${PASS}`);
console.log(` ❌ FAIL : ${FAIL}`);
console.log(` ⚠️  WARN : ${WARN}`);
console.log('───────────────────────────────────────────────────────────────');

if (FAIL > 0) {
  console.log('\n FAILED CHECKS:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`   ❌ [${r.id}] ${r.desc}`);
  });
}
if (WARN > 0) {
  console.log('\n WARNINGS:');
  results.filter(r => r.status === 'WARN').forEach(r => {
    console.log(`   ⚠️  [${r.id}] ${r.desc}`);
  });
}

console.log('\n───────────────────────────────────────────────────────────────');
if (FAIL === 0) {
  console.log(' BP09 LAUNCH QUALITY GATE: PASSED' + (WARN > 0 ? ` (${WARN} warning(s) — review before launch)` : ''));
} else {
  console.log(` BP09 LAUNCH QUALITY GATE: FAILED (${FAIL} blocking issue(s))`);
  process.exit(1);
}
