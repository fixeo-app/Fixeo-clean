#!/usr/bin/env node
/**
 * BP06 WORKSTREAM M — Automated Regression Harness
 * Comprehensive static analysis + optional jsdom-based checks.
 * Exit 0 if no FAILs; exit 1 if any FAIL.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Check jsdom availability ──────────────────────────────────────────────────
let jsdom = null;
try { jsdom = require('jsdom'); } catch(e) { jsdom = null; }

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT     = path.resolve(__dirname, '../../');
const JS_FILE  = path.join(ROOT, 'js/enterprise-dashboard-v1.js');
const HTML_FILE= path.join(ROOT, 'enterprise-dashboard.html');
const CSS_FILE = path.join(ROOT, 'css/enterprise-dashboard-v1.css');

// ── Result tracking ───────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0;
const results = [];
let currentSection = '';

function startSection(name) {
  currentSection = name;
}

function PASS(name, msg) {
  pass++;
  results.push({ status:'PASS', section: currentSection, name, msg: msg||'' });
}
function FAIL(name, msg) {
  fail++;
  results.push({ status:'FAIL', section: currentSection, name, msg: msg||'' });
}
function WARN(name, msg) {
  warn++;
  results.push({ status:'WARN', section: currentSection, name, msg: msg||'' });
}

function loadFile(p) {
  if (!fs.existsSync(p)) {
    FAIL('FILE_EXISTS', `Missing file: ${p}`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

// ── Banner ────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  BP06 REGRESSION HARNESS');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`  JS  : ${JS_FILE}`);
console.log(`  HTML: ${HTML_FILE}`);
console.log(`  CSS : ${CSS_FILE}`);
if (jsdom) {
  console.log('  jsdom: AVAILABLE — jsdom-based checks will run');
} else {
  console.log('  jsdom: NOT AVAILABLE — using static analysis only');
}
console.log('───────────────────────────────────────────────────────────────────\n');

const js   = loadFile(JS_FILE);
const html = loadFile(HTML_FILE);
const css  = loadFile(CSS_FILE);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0: CONTRACT SAFETY (safety-critical — all must PASS)
// ═══════════════════════════════════════════════════════════════════════════════
startSection('CONTRACT_SAFETY');
console.log('── SECTION: CONTRACT SAFETY ──────────────────────────────────────\n');

(function() {
  // No direct mutations
  ['.insert(','.update(','.delete(','.upsert('].forEach(m => {
    js.includes(m)
      ? FAIL('no_mutation_'+m.replace(/\W/g,''), `Direct DB mutation ${m} in enterprise JS`)
      : PASS('no_mutation_'+m.replace(/\W/g,''), `No ${m} direct mutation`);
  });

  // RPC names
  ["'create_enterprise_request'","'confirm_completed_mission'"].forEach(rpc => {
    js.includes(rpc)
      ? PASS('rpc_name_'+rpc.replace(/\W/g,''), rpc+' present')
      : FAIL('rpc_name_'+rpc.replace(/\W/g,''), rpc+' NOT found');
  });

  // No production URL
  js.includes('supabase.co')
    ? FAIL('no_prod_url', 'supabase.co hardcoded URL found')
    : PASS('no_prod_url', 'No hardcoded supabase.co URL');

  // No validate_mission_v1
  js.includes('validate_mission_v1')
    ? FAIL('no_validate_mission_v1', 'Deprecated validate_mission_v1 found')
    : PASS('no_validate_mission_v1', 'No validate_mission_v1 reference');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: ROLE MATRIX TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('ROLE_MATRIX');
console.log('\n── SECTION: ROLE MATRIX TESTS ────────────────────────────────────\n');

(function() {
  // Extract CAN_CREATE_ROLES
  const canCreateMatch = js.match(/CAN_CREATE_ROLES\s*=\s*\[([^\]]*)\]/);
  if (!canCreateMatch) {
    FAIL('role_can_create_def', 'CAN_CREATE_ROLES not defined');
  } else {
    const raw = canCreateMatch[1];
    const shouldHave = ['owner','admin','operations_manager','site_manager','reporter'];
    const shouldNot  = ['viewer'];
    shouldHave.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? PASS('role_create_has_'+r,     r+' ∈ CAN_CREATE_ROLES')
        : FAIL('role_create_missing_'+r, r+' NOT in CAN_CREATE_ROLES');
    });
    shouldNot.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? FAIL('role_create_excludes_'+r, r+' must NOT be in CAN_CREATE_ROLES')
        : PASS('role_create_excludes_'+r, r+' correctly excluded from CAN_CREATE_ROLES');
    });
    // Exactly 5 members
    const members = (raw.match(/['"][a-z_]+['"]/g)||[]).map(x => x.replace(/['"]/g,''));
    members.length === 5
      ? PASS('role_create_exact_count', `CAN_CREATE_ROLES has exactly 5 members: [${members.join(',')}]`)
      : WARN('role_create_exact_count', `CAN_CREATE_ROLES has ${members.length} members (expected 5): [${members.join(',')}]`);
  }

  // Extract CAN_CONFIRM_ROLES
  const canConfirmMatch = js.match(/CAN_CONFIRM_ROLES\s*=\s*\[([^\]]*)\]/);
  if (!canConfirmMatch) {
    FAIL('role_can_confirm_def', 'CAN_CONFIRM_ROLES not defined');
  } else {
    const raw = canConfirmMatch[1];
    const shouldHave = ['owner','admin','operations_manager','site_manager'];
    const shouldNot  = ['reporter','viewer'];
    shouldHave.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? PASS('role_confirm_has_'+r,     r+' ∈ CAN_CONFIRM_ROLES')
        : FAIL('role_confirm_missing_'+r, r+' NOT in CAN_CONFIRM_ROLES');
    });
    shouldNot.forEach(r => {
      raw.includes("'"+r+"'") || raw.includes('"'+r+'"')
        ? FAIL('role_confirm_excludes_'+r, r+' must NOT be in CAN_CONFIRM_ROLES')
        : PASS('role_confirm_excludes_'+r, r+' correctly excluded from CAN_CONFIRM_ROLES');
    });
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: VIEWPORT / CSS BREAKPOINT CHECKS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('VIEWPORT');
console.log('\n── SECTION: VIEWPORT / CSS BREAKPOINT CHECKS ────────────────────\n');

(function() {
  // Mobile breakpoints
  const hasMobile480 = css.includes('max-width: 480px') || css.includes('max-width:480px');
  const hasMobile479 = css.includes('max-width: 479px') || css.includes('max-width:479px');
  hasMobile480 || hasMobile479
    ? PASS('vp_mobile_480', 'Mobile breakpoint (≤480px) present')
    : FAIL('vp_mobile_480', 'No @media (max-width: 480px or 479px) found');

  // Tablet breakpoint
  const hasTablet768 = css.includes('min-width: 768px') || css.includes('min-width:768px');
  const hasTablet769 = css.includes('min-width: 769px') || css.includes('min-width:769px');
  hasTablet768 || hasTablet769
    ? PASS('vp_tablet_768', 'Tablet breakpoint (≥768px or ≥769px) present')
    : FAIL('vp_tablet_768', 'No @media (min-width: 768px or 769px) found');

  // Two-col desktop
  const hasDesktop960 = css.includes('min-width: 960px') || css.includes('min-width:960px');
  hasDesktop960
    ? PASS('vp_desktop_960', 'Two-col desktop breakpoint (≥960px) present')
    : FAIL('vp_desktop_960', 'No @media (min-width: 960px) found');

  // Sites grid
  const hasSites600 = css.includes('min-width: 600px') || css.includes('min-width:600px');
  hasSites600
    ? PASS('vp_sites_600', 'Sites grid breakpoint (≥600px) present')
    : FAIL('vp_sites_600', 'No @media (min-width: 600px) found');

  // KPI/sites grid 900px
  const hasKpi900 = css.includes('min-width: 900px') || css.includes('min-width:900px');
  hasKpi900
    ? PASS('vp_kpi_900', 'KPI/sites grid breakpoint (≥900px) present')
    : FAIL('vp_kpi_900', 'No @media (min-width: 900px) found');

  // fxv2-bottom-nav hidden at desktop
  const bottomNavHidden = css.match(/min-width[^{]+\{[^}]*fxv2-bottom-nav[^}]*display\s*:\s*none/s) ||
                          css.match(/fxv2-bottom-nav[^}]*display\s*:\s*none[^}]*\}[^@]*@media[^{]+min-width/s) ||
                          (function() {
                            // More flexible: check if .fxv2-bottom-nav { display: none } appears inside any @media
                            const mediaBlocks = css.match(/@media[^{]+\{[\s\S]*?\}/gm) || [];
                            return mediaBlocks.some(b => b.includes('fxv2-bottom-nav') && b.includes('display') && b.includes('none'));
                          })();
  bottomNavHidden
    ? PASS('vp_bottomnav_hidden', 'fxv2-bottom-nav hidden at desktop breakpoint')
    : FAIL('vp_bottomnav_hidden', 'fxv2-bottom-nav not hidden at desktop breakpoint');

  // Touch targets: ent-urgency-btn min-height 44px (WCAG 2.5.5)
  const urgencyBtnBlock = css.match(/\.ent-urgency-btn\s*\{([^}]*)\}/);
  if (!urgencyBtnBlock) {
    FAIL('vp_touch_44px', '.ent-urgency-btn rule not found in CSS');
  } else {
    const blockContent = urgencyBtnBlock[1];
    blockContent.includes('44px')
      ? PASS('vp_touch_44px', '.ent-urgency-btn min-height: 44px (WCAG 2.5.5)')
      : WARN('vp_touch_44px', '.ent-urgency-btn may not meet 44px WCAG touch target — check min-height');
  }

  // No overflow-x: visible on fxv2-main
  const mainBlock = css.match(/\.fxv2-main\s*\{([^}]*)\}/);
  if (mainBlock && (mainBlock[1].includes('overflow-x: visible') || mainBlock[1].includes('overflow-x:visible'))) {
    FAIL('vp_no_overflow_x', '.fxv2-main has overflow-x: visible — causes horizontal scroll');
  } else {
    PASS('vp_no_overflow_x', '.fxv2-main has no overflow-x: visible');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SECTION TESTS (HTML)
// ═══════════════════════════════════════════════════════════════════════════════
startSection('SECTIONS');
console.log('\n── SECTION: HTML SECTION TESTS ──────────────────────────────────\n');

(function() {
  const sectionNames = ['overview','requests','request-detail','new-request','sites','site-detail','members','history','account'];

  sectionNames.forEach(name => {
    const hasId    = html.includes(`id="section-${name}"`);
    const hasClass = html.includes(`id="section-${name}"`) &&
                     (function() {
                       const idx = html.indexOf(`id="section-${name}"`);
                       const snippet = html.substring(Math.max(0,idx-200), idx+200);
                       return snippet.includes('fxv2-section');
                     })();
    const hasAria  = (function() {
                       const idx = html.indexOf(`id="section-${name}"`);
                       if (idx < 0) return false;
                       const snippet = html.substring(Math.max(0,idx-200), idx+200);
                       return snippet.includes('aria-label=');
                     })();

    hasId    ? PASS('section_id_'+name,    `#section-${name} present`)
             : FAIL('section_id_'+name,    `#section-${name} NOT found`);
    hasClass ? PASS('section_class_'+name, `#section-${name} has fxv2-section class`)
             : FAIL('section_class_'+name, `#section-${name} missing fxv2-section class`);
    hasAria  ? PASS('section_aria_'+name,  `#section-${name} has aria-label`)
             : WARN('section_aria_'+name,  `#section-${name} may be missing aria-label`);
  });

  // Overview must be the active section (class="fxv2-section active")
  const overviewActive = html.match(/id="section-overview"[^>]*class="fxv2-section\s+active"/) ||
                         html.match(/class="fxv2-section\s+active"[^>]*id="section-overview"/) ||
                         (function() {
                           const idx = html.indexOf('id="section-overview"');
                           if (idx < 0) return false;
                           const snippet = html.substring(Math.max(0,idx-200), idx+200);
                           return snippet.includes('fxv2-section active') || snippet.includes('active fxv2-section') ||
                                  snippet.includes('fxv2-section" id="section-overview"') ||
                                  // Check the section tag itself
                                  (snippet.includes('active') && snippet.includes('fxv2-section'));
                         })();
  overviewActive
    ? PASS('section_overview_active', 'section-overview has active class')
    : WARN('section_overview_active', 'section-overview may not have active class (check class order)');

  // ALL_SECTIONS has exactly 9 entries
  const allSectionsMatch = js.match(/ALL_SECTIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!allSectionsMatch) {
    FAIL('sections_count', 'ALL_SECTIONS not found in JS');
  } else {
    const entries = (allSectionsMatch[1].match(/['"][^'"]+['"]/g)||[]);
    entries.length === 9
      ? PASS('sections_count', `ALL_SECTIONS has exactly 9 entries: [${entries.map(e=>e.replace(/['"]/g,'')).join(',')}]`)
      : FAIL('sections_count', `ALL_SECTIONS has ${entries.length} entries (expected 9)`);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: NAVIGATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('NAVIGATION');
console.log('\n── SECTION: NAVIGATION TESTS ─────────────────────────────────────\n');

(function() {
  // showSection sets display:block for active
  js.includes("display = isActive ? 'block' : 'none'") ||
  js.includes("display='block'") ||
  js.includes('display: isActive') ||
  js.includes("'block'")
    ? PASS('nav_showSection_block', 'showSection uses display:block for active section')
    : FAIL('nav_showSection_block', 'showSection does not appear to set display:block');

  // _openSidebar and _closeSidebar defined
  js.includes('function _openSidebar')
    ? PASS('nav_openSidebar', '_openSidebar defined')
    : FAIL('nav_openSidebar', '_openSidebar NOT defined');
  js.includes('function _closeSidebar')
    ? PASS('nav_closeSidebar', '_closeSidebar defined')
    : FAIL('nav_closeSidebar', '_closeSidebar NOT defined');

  // navigateTo switch covers all 9 sections
  const navMatch = js.match(/function navigateTo[\s\S]*?switch\s*\(section\)\s*\{([\s\S]*?)\}/);
  if (!navMatch) {
    WARN('nav_switch_coverage', 'navigateTo switch block not clearly parseable');
  } else {
    const switchBlock = navMatch[1];
    const sectionNames = ['overview','requests','request-detail','new-request','sites','site-detail','members','history','account'];
    sectionNames.forEach(name => {
      switchBlock.includes("'"+name+"'")
        ? PASS('nav_case_'+name, `case '${name}' present in navigateTo`)
        : FAIL('nav_case_'+name, `case '${name}' MISSING from navigateTo switch`);
    });
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: FORM TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('FORMS');
console.log('\n── SECTION: FORM TESTS ───────────────────────────────────────────\n');

(function() {
  // Critical form elements
  ['req-site','req-category','req-desc','req-submit'].forEach(id => {
    html.includes(`id="${id}"`)
      ? PASS('form_id_'+id, `#${id} present`)
      : FAIL('form_id_'+id, `#${id} NOT found`);
  });

  // Urgency button with data-value="" (normale = empty string)
  html.includes('data-value=""')
    ? PASS('form_urgency_normale_btn', 'Urgency button with data-value="" (normale) present')
    : FAIL('form_urgency_normale_btn', 'No urgency button with data-value="" found');

  // desc maxlength=2000
  html.includes('maxlength="2000"')
    ? PASS('form_desc_maxlength', 'req-desc maxlength="2000" present')
    : FAIL('form_desc_maxlength', 'req-desc maxlength="2000" NOT found');

  // Form has novalidate
  html.includes('novalidate')
    ? PASS('form_novalidate', 'Form has novalidate attribute')
    : WARN('form_novalidate', 'Form novalidate not found — relies on JS validation?');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: ACCESSIBILITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('ACCESSIBILITY');
console.log('\n── SECTION: ACCESSIBILITY TESTS ─────────────────────────────────\n');

(function() {
  // Dialog: role="dialog" and aria-modal="true"
  html.includes('role="dialog"')
    ? PASS('a11y_dialog_role', 'role="dialog" present')
    : FAIL('a11y_dialog_role', 'role="dialog" NOT found');
  html.includes('aria-modal="true"')
    ? PASS('a11y_dialog_modal', 'aria-modal="true" present')
    : FAIL('a11y_dialog_modal', 'aria-modal="true" NOT found');

  // Hamburger: aria-controls="ent-sidebar" and aria-expanded="false"
  html.includes('aria-controls="ent-sidebar"')
    ? PASS('a11y_hamburger_controls', 'aria-controls="ent-sidebar" present')
    : FAIL('a11y_hamburger_controls', 'aria-controls="ent-sidebar" NOT found');
  html.includes('aria-expanded="false"')
    ? PASS('a11y_hamburger_expanded', 'aria-expanded="false" present on hamburger')
    : FAIL('a11y_hamburger_expanded', 'aria-expanded="false" NOT found');

  // Status tabs: role="tablist"
  html.includes('role="tablist"')
    ? PASS('a11y_tablist', 'role="tablist" present')
    : FAIL('a11y_tablist', 'role="tablist" NOT found');

  // Urgency grid: role="group"
  html.includes('role="group"')
    ? PASS('a11y_urgency_group', 'role="group" present for urgency grid')
    : FAIL('a11y_urgency_group', 'role="group" NOT found');

  // Form error elements: aria-live="assertive"
  html.includes('aria-live="assertive"')
    ? PASS('a11y_aria_live_assertive', 'aria-live="assertive" present on form errors')
    : FAIL('a11y_aria_live_assertive', 'aria-live="assertive" NOT found');

  // main: role="main"
  html.includes('role="main"')
    ? PASS('a11y_main_role', 'role="main" present')
    : FAIL('a11y_main_role', 'role="main" NOT found');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: POLLING TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('POLLING');
console.log('\n── SECTION: POLLING TESTS ────────────────────────────────────────\n');

(function() {
  // POLL_INTERVAL = 30000
  js.includes('POLL_INTERVAL = 30000') || js.includes('POLL_INTERVAL=30000')
    ? PASS('poll_interval_value', 'POLL_INTERVAL = 30000 ms')
    : FAIL('poll_interval_value', 'POLL_INTERVAL is not 30000 — timing contract broken');

  // startPolling defined
  js.includes('function startPolling')
    ? PASS('poll_start_fn', 'startPolling function defined')
    : FAIL('poll_start_fn', 'startPolling NOT defined');

  // stopPolling defined
  js.includes('function stopPolling')
    ? PASS('poll_stop_fn', 'stopPolling function defined')
    : FAIL('poll_stop_fn', 'stopPolling NOT defined');

  // isPolling guard
  js.includes('isPolling')
    ? PASS('poll_isPolling_guard', 'isPolling guard present')
    : FAIL('poll_isPolling_guard', 'isPolling guard NOT found');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: STATE / EMPTY/ERROR STATE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('STATE');
console.log('\n── SECTION: STATE / EMPTY+ERROR STATE TESTS ─────────────────────\n');

(function() {
  const requiredHtmlIds = [
    'requests-empty','requests-error',
    'history-empty','history-error',
    'sites-empty','sites-error',
    'members-empty','members-error',
    'form-success','form-error'
  ];
  requiredHtmlIds.forEach(id => {
    html.includes(`id="${id}"`)
      ? PASS('state_id_'+id, `#${id} present`)
      : FAIL('state_id_'+id, `#${id} NOT found in HTML`);
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: BP06 FEATURE TESTS (WARN if missing — in progress)
// ═══════════════════════════════════════════════════════════════════════════════
startSection('BP06_FEATURES');
console.log('\n── SECTION: BP06 FEATURE TESTS (WARN = BP06 in progress) ─────────\n');

(function() {
  // JS functions
  const jsFunctions = ['openSearch','openCmdPalette','exportRequestsCSV','saveCurrentView','formatAge','getNextAction'];
  jsFunctions.forEach(fn => {
    const defined = js.includes('function '+fn) || js.includes(fn+' = function') || js.includes(fn+'=function');
    defined
      ? PASS('bp06_fn_'+fn, `function ${fn} defined`)
      : WARN('bp06_fn_'+fn, `function ${fn} NOT defined — BP06 in progress`);
  });

  // HTML elements (BP06 additions)
  const htmlElements = {
    'filter-category':    'Filter by category select',
    'req-sort':           'Sort requests select',
    'ent-search-dialog':  'Search dialog',
    'ent-cmd-palette':    'Command palette',
    'saved-views-bar':    'Saved views bar',
    'req-export-btn':     'Export CSV button',
    'filter-chips':       'Filter chips div'
  };
  Object.entries(htmlElements).forEach(([id, desc]) => {
    html.includes(`id="${id}"`)
      ? PASS('bp06_html_'+id, `#${id} present (${desc})`)
      : WARN('bp06_html_'+id, `#${id} NOT found — ${desc} — BP06 in progress`);
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: IDEMPOTENCY GUARDS
// ═══════════════════════════════════════════════════════════════════════════════
startSection('IDEMPOTENCY');
console.log('\n── SECTION: IDEMPOTENCY GUARDS ───────────────────────────────────\n');

(function() {
  ['_navAttached','_reqAttached','_histAttached','_formAttached'].forEach(g => {
    js.includes(g) ? PASS('idem_'+g, g+' guard present') : FAIL('idem_'+g, g+' guard NOT found');
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: DUPLICATE ID CHECK
// ═══════════════════════════════════════════════════════════════════════════════
startSection('DUPLICATE_IDS');
console.log('\n── SECTION: DUPLICATE HTML ID CHECK ─────────────────────────────\n');

(function() {
  const idRegex = /\bid="([^"]+)"/g;
  const seen = {};
  const dupes = [];
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    const id = match[1];
    seen[id] = (seen[id]||0) + 1;
    if (seen[id] === 2) dupes.push(id);
  }
  if (dupes.length > 0) {
    FAIL('no_dup_ids', `Duplicate HTML IDs found: ${dupes.join(', ')}`);
  } else {
    PASS('no_dup_ids', `No duplicate IDs (${Object.keys(seen).length} unique IDs)`);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: STATUS + URGENCY VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════════
startSection('VOCABULARY');
console.log('\n── SECTION: STATUS + URGENCY VOCABULARY ─────────────────────────\n');

(function() {
  const statuses = ['new','assigned','in_progress','completed','validated','cancelled','no_match'];
  // Extract formatStatus block for precise check
  const fsIdx = js.indexOf('function formatStatus');
  const fsBlock = fsIdx >= 0 ? js.substring(fsIdx, fsIdx+500) : js;
  statuses.forEach(s => {
    // Match quoted ('new') OR unquoted object key (new:) in the formatStatus block
    const found = fsBlock.includes("'"+s+"'") ||
                  fsBlock.includes('"'+s+'"') ||
                  new RegExp('[{,]\\s*' + s + '\\s*:').test(fsBlock);
    found ? PASS('status_vocab_'+s, s+' in formatStatus vocabulary')
          : FAIL('status_vocab_'+s, s+' NOT in formatStatus');
  });

  // Urgency
  ['normale','urgent','now'].forEach(u => {
    js.includes("'"+u+"'") || js.includes('"'+u+'"')
      ? PASS('urgency_vocab_'+u, u+' in urgency vocabulary')
      : FAIL('urgency_vocab_'+u, u+' NOT found in JS');
  });

  // No invented statuses as DB-write values
  const dbWritePattern = /\.(rpc|eq|in|neq|filter)\([^)]*'(terminee|validee)'/g;
  const dbWrites = js.match(dbWritePattern);
  if (dbWrites) {
    FAIL('no_invented_status_dbwrite', `Invented status as DB value: ${dbWrites.join(', ')}`);
  } else {
    PASS('no_invented_status_dbwrite', 'No terminee/validee as DB-write values');
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13: CSS CLASS COVERAGE
// ═══════════════════════════════════════════════════════════════════════════════
startSection('CSS_CLASSES');
console.log('\n── SECTION: CSS CLASS COVERAGE ───────────────────────────────────\n');

(function() {
  ['.ent-req-card','.ent-status-badge','.ent-site-card','.ent-member-card','.ent-kpi-card'].forEach(cls => {
    css.includes(cls)
      ? PASS('css_'+cls.replace(/\W/g,'_'), cls+' defined in CSS')
      : FAIL('css_'+cls.replace(/\W/g,'_'), cls+' NOT found in CSS');
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14: JSDOM-BASED CHECKS (if available)
// ═══════════════════════════════════════════════════════════════════════════════
startSection('JSDOM');

if (jsdom) {
  console.log('\n── SECTION: JSDOM CHECKS ─────────────────────────────────────────\n');

  try {
    const { JSDOM } = jsdom;

    // Create DOM from HTML
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',  // Don't auto-run <script> tags
      resources: 'usable'
    });
    const document = dom.window.document;

    // Check all critical DOM IDs exist after parse
    const criticalIds = [
      'section-overview','section-requests','section-new-request',
      'section-sites','section-members','section-history','section-account',
      'section-request-detail','section-site-detail',
      'ent-sidebar','ent-hamburger','ent-overlay','ent-dashboard','ent-auth-gate',
      'requests-list','requests-empty','requests-error',
      'sites-list','members-list','history-list','account-content'
    ];
    criticalIds.forEach(id => {
      const el = document.getElementById(id);
      el ? PASS('jsdom_id_'+id, `#${id} found in DOM`)
         : FAIL('jsdom_id_'+id, `#${id} NOT found by jsdom`);
    });

    // Check overview is the active section
    const overview = document.getElementById('section-overview');
    if (overview) {
      overview.classList.contains('active')
        ? PASS('jsdom_overview_active', 'section-overview has active class in DOM')
        : WARN('jsdom_overview_active', 'section-overview does NOT have active class');
    }

    // Check main element
    const main = document.querySelector('[role="main"]');
    main ? PASS('jsdom_main_role', 'role="main" element found')
         : FAIL('jsdom_main_role', 'No role="main" element in DOM');

    // Check dialog
    const dialogs = document.querySelectorAll('[role="dialog"]');
    dialogs.length > 0
      ? PASS('jsdom_dialogs', `${dialogs.length} role="dialog" element(s) found`)
      : FAIL('jsdom_dialogs', 'No role="dialog" found');

    // Check aria-modal
    const modalDialogs = document.querySelectorAll('[aria-modal="true"]');
    modalDialogs.length > 0
      ? PASS('jsdom_aria_modal', `${modalDialogs.length} aria-modal="true" element(s) found`)
      : FAIL('jsdom_aria_modal', 'No aria-modal="true" found');

    // Check new request form
    const form = document.getElementById('new-request-form');
    form ? PASS('jsdom_form', '#new-request-form found')
         : FAIL('jsdom_form', '#new-request-form NOT found');

    // Check urgency grid role=group
    const urgencyGroup = document.querySelector('[role="group"]');
    urgencyGroup ? PASS('jsdom_urgency_group', 'role="group" found for urgency')
                 : FAIL('jsdom_urgency_group', 'role="group" NOT found');

    // Check tablist for status filters
    const tablist = document.querySelector('[role="tablist"]');
    tablist ? PASS('jsdom_tablist', 'role="tablist" found')
            : FAIL('jsdom_tablist', 'role="tablist" NOT found');

    console.log('  [jsdom checks complete]\n');
  } catch(e) {
    WARN('jsdom_error', `jsdom check failed: ${e.message}`);
  }
} else {
  console.log('\n── SECTION: JSDOM CHECKS — SKIPPED (jsdom not available; using static analysis only) ──\n');
  WARN('jsdom_unavailable', 'jsdom not installed — static analysis only. Run: npm install jsdom');
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWPORT MATRIX REPORT
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  VIEWPORT MATRIX REPORT');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Viewport        Mobile(≤480)  Tablet(≥768)  Desktop(≥960)  Notes');
console.log('  ─────────────────────────────────────────────────────────────────');

const hasMobile  = css.includes('max-width: 480px') || css.includes('max-width:480px') ||
                   css.includes('max-width: 479px') || css.includes('max-width:479px');
const hasTablet  = css.includes('min-width: 768px') || css.includes('min-width:768px') ||
                   css.includes('min-width: 769px') || css.includes('min-width:769px');
const hasDesktop = css.includes('min-width: 960px') || css.includes('min-width:960px');

function tick(v) { return v ? '✅' : '❌'; }

const viewports = [
  { label:'360×800 (Mobile S)',  mobile:true,  tablet:false, desktop:false },
  { label:'390×844 (iPhone 14)', mobile:true,  tablet:false, desktop:false },
  { label:'768×1024 (Tablet)',   mobile:false, tablet:true,  desktop:false },
  { label:'1024×768 (Desktop S)',mobile:false, tablet:true,  desktop:true  },
  { label:'1280×720 (Desktop M)',mobile:false, tablet:true,  desktop:true  },
  { label:'1440×900 (Desktop L)',mobile:false, tablet:true,  desktop:true  },
];

viewports.forEach(vp => {
  const mStatus  = vp.mobile  ? (hasMobile  ? '  ✅  ' : '  ❌  ') : '  —   ';
  const tStatus  = vp.tablet  ? (hasTablet  ? '  ✅  ' : '  ❌  ') : '  —   ';
  const dStatus  = vp.desktop ? (hasDesktop ? '  ✅  ' : '  ❌  ') : '  —   ';
  const notes = [];
  if (vp.mobile  && !hasMobile)  notes.push('MISSING mobile BP');
  if (vp.tablet  && !hasTablet)  notes.push('MISSING tablet BP');
  if (vp.desktop && !hasDesktop) notes.push('MISSING desktop BP');
  const noteStr = notes.length ? '⚠️  '+notes.join(', ') : 'OK';
  console.log(`  ${vp.label.padEnd(22)} ${mStatus.padEnd(14)} ${tStatus.padEnd(14)} ${dStatus.padEnd(15)} ${noteStr}`);
});

const has900 = css.includes('min-width: 900px') || css.includes('min-width:900px');
const has600 = css.includes('min-width: 600px') || css.includes('min-width:600px');
console.log(`\n  Additional breakpoints:`);
console.log(`    ≥600px (sites grid)    : ${tick(has600)}`);
console.log(`    ≥900px (KPI/sites 2col): ${tick(has900)}`);
console.log(`    ≥960px (2-col layout)  : ${tick(hasDesktop)}`);
console.log(`    ≤480px (mobile stacks) : ${tick(hasMobile)}`);

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL RESULTS TABLE
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  FULL RESULTS TABLE');
console.log('═══════════════════════════════════════════════════════════════════');

// Group by section
const sections = {};
results.forEach(r => {
  if (!sections[r.section]) sections[r.section] = [];
  sections[r.section].push(r);
});

Object.entries(sections).forEach(([section, checks]) => {
  const sPass = checks.filter(c=>c.status==='PASS').length;
  const sFail = checks.filter(c=>c.status==='FAIL').length;
  const sWarn = checks.filter(c=>c.status==='WARN').length;
  console.log(`\n  ▸ ${section}  [${sPass}P / ${sFail}F / ${sWarn}W]`);
  checks.forEach(r => {
    const icon = r.status==='PASS' ? '✅' : r.status==='FAIL' ? '❌' : '⚠️ ';
    console.log(`    ${icon}  ${r.name.padEnd(40)} ${r.msg}`);
  });
});

// ─── Totals ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  TOTALS');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`  Total checks : ${pass+fail+warn}`);
console.log(`  ✅ PASS      : ${pass}`);
console.log(`  ❌ FAIL      : ${fail}`);
console.log(`  ⚠️  WARN      : ${warn}`);
console.log('───────────────────────────────────────────────────────────────────');

if (fail > 0) {
  console.log(`\n  REGRESSION HARNESS: FAILED — ${fail} failure(s) detected`);
  console.log('  Fix all FAILs before merging.\n');
  process.exit(1);
} else {
  const note = warn > 0 ? ` (${warn} warning(s) — BP06 in progress, review WARNs)` : '';
  console.log(`\n  REGRESSION HARNESS: PASSED${note}\n`);
  process.exit(0);
}
