// BP09 Contract Matrix Tests — Corrected Architecture
// Tests the corrected BP09 architecture:
//   - No enterprise_site_id column on service_requests
//   - Site linkage via enterprise_request_context.site_id only
//   - All RLS policies use enterprise_request_context as bridge
//   - missions.request_id join casts UUID side (not TEXT side)
'use strict';
const fs = require('fs');
const path = require('path');

const JS_FILE   = path.join(__dirname,'../../js/enterprise-dashboard-v1.js');
const SQL_FILE  = path.join(__dirname,'../../supabase/bp09-enterprise-rls-and-schema.sql');
const DISPATCH  = path.join(__dirname,'../../supabase/7c11c-dispatch-foundation.sql');
const LIFECYCLE = path.join(__dirname,'../../supabase/7c11e2-mission-lifecycle.sql');

const js  = fs.readFileSync(JS_FILE,  'utf8');
const sql = fs.readFileSync(SQL_FILE, 'utf8');
const dispatch = fs.readFileSync(DISPATCH, 'utf8');
const lifecycle = fs.readFileSync(LIFECYCLE, 'utf8');

let pass=0, fail=0;
function ok(label, cond){ if(cond){ pass++; console.log('  ✅',label); } else { fail++; console.error('  ❌',label); } }

console.log('\n════════════════════════════════════════════════════════');
console.log(' BP09 CONTRACT MATRIX TESTS — Corrected Architecture');
console.log('════════════════════════════════════════════════════════\n');

// ── ARCHITECTURE: No denormalization ─────────────────────────
console.log('── Architecture: No denormalization ──');
ok('No enterprise_site_id column added in migration',
  !sql.includes('ADD COLUMN') && !sql.includes('enterprise_site_id'));
ok('No backfill UPDATE in migration',
  !/UPDATE\s+public\.service_requests/.test(sql));
ok('No sync trigger function in migration',
  !sql.includes('_bp09_sync_enterprise_site_id') && !sql.includes('CREATE TRIGGER'));
ok('No idx_sr_enterprise_site_id index in migration',
  !sql.includes('idx_sr_enterprise_site_id'));
ok('Migration has no ALTER TABLE on service_requests',
  !/ALTER TABLE\s+public\.service_requests/.test(sql) &&
  !/ALTER TABLE\s+public\.missions/.test(sql));

// ── ARCHITECTURE: enterprise_request_context is authoritative ─
console.log('\n── Architecture: ERC as canonical bridge ──');
ok('Migration RLS uses enterprise_request_context join',
  sql.includes('public.enterprise_request_context'));
ok('service_requests RLS bridges via erc.service_request_id = service_requests.id',
  sql.includes('erc.service_request_id = service_requests.id'));
ok('missions RLS bridges via missions.request_id = erc.service_request_id::text',
  sql.includes('missions.request_id = erc.service_request_id::text'));
ok('RLS uses enterprise_members for auth',
  sql.includes('public.enterprise_members'));
ok('RLS uses enterprise_member_sites for site_manager scope',
  sql.includes('public.enterprise_member_sites'));

// ── TYPE SAFETY: request_id cast ──────────────────────────────
console.log('\n── Type safety: missions.request_id TEXT ──');
ok('Canonical contract confirms missions.request_id = TEXT',
  dispatch.includes('missions.request_id is TEXT') ||
  lifecycle.includes('missions.request_id = TEXT') ||
  lifecycle.includes("v_request_id      text;"));
ok('Canonical contract: cast UUID side (sr.id::text), never TEXT side',
  dispatch.includes('sr.id::text') || lifecycle.includes('sr.id::text'));
ok('Migration does NOT cast missions.request_id to uuid',
  !sql.includes('request_id::uuid') && !sql.includes('request_id :: uuid'));
ok('Migration casts erc.service_request_id::text (UUID side)',
  sql.includes('erc.service_request_id::text'));
ok('No request_id cast-to-uuid anywhere in migration',
  !/request_id\s*::\s*uuid/.test(sql));

// ── POLICIES: service_requests ────────────────────────────────
console.log('\n── Policies: service_requests ──');
ok('enterprise_non_sm_requests_read policy exists',
  sql.includes('"enterprise_non_sm_requests_read"'));
ok('enterprise_sm_requests_read policy exists',
  sql.includes('"enterprise_sm_requests_read"'));
ok('Policies are SELECT only',
  sql.includes('FOR SELECT'));
ok('Policies require status = active',
  sql.includes("em.status        = 'active'") || sql.includes("em.status = 'active'"));
ok('Non-SM policy covers owner/admin/ops_mgr/reporter/viewer',
  sql.includes("'owner','admin','operations_manager','reporter','viewer'") ||
  sql.includes("'owner', 'admin', 'operations_manager', 'reporter', 'viewer'"));
ok('SM policy requires site_manager role',
  sql.includes("em.role           = 'site_manager'") ||
  sql.includes("em.role = 'site_manager'"));
ok('SM policy joins enterprise_member_sites',
  sql.includes('ems.site_id       = erc.site_id') ||
  sql.includes('ems.site_id = erc.site_id'));
ok('Both policies drop old version first (idempotent)',
  sql.includes('DROP POLICY IF EXISTS "enterprise_non_sm_requests_read"') &&
  sql.includes('DROP POLICY IF EXISTS "enterprise_sm_requests_read"'));

// ── POLICIES: missions ────────────────────────────────────────
console.log('\n── Policies: missions ──');
ok('enterprise_non_sm_missions_read policy exists',
  sql.includes('"enterprise_non_sm_missions_read"'));
ok('enterprise_sm_missions_read policy exists',
  sql.includes('"enterprise_sm_missions_read"'));
ok('Missions policies are additive SELECT only',
  (sql.match(/ON public\.missions\s+FOR SELECT/g)||[]).length >= 2);
ok('Missions SM policy joins enterprise_member_sites for scope',
  (sql.match(/enterprise_member_sites/g)||[]).length >= 2);

// ── JS: No enterprise_site_id ─────────────────────────────────
console.log('\n── JS: No enterprise_site_id ──');
ok('JS has zero enterprise_site_id references',
  !js.includes('enterprise_site_id'));
ok('JS selects include enterprise_request_context!inner with site_id',
  js.includes('enterprise_request_context!inner(enterprise_id, site_id)'));

// ── JS: Site linkage via ERC ──────────────────────────────────
console.log('\n── JS: Site linkage via enterprise_request_context ──');
ok('JS getSiteName reads r.enterprise_request_context.site_id',
  js.includes('r.enterprise_request_context&&r.enterprise_request_context.site_id') ||
  js.includes('r.enterprise_request_context?.site_id'));
ok('JS reqSiteFilter uses enterprise_request_context.site_id filter',
  js.includes("'enterprise_request_context.site_id', S.reqSiteFilter"));
ok('JS histSiteFilter uses enterprise_request_context.site_id filter',
  js.includes("'enterprise_request_context.site_id', S.histSiteFilter"));
ok('JS site detail query uses enterprise_request_context.site_id filter',
  js.includes("'enterprise_request_context.site_id', siteId"));

// ── JS: RPC contracts intact ──────────────────────────────────
console.log('\n── JS: RPC contracts intact ──');
ok('create_enterprise_request RPC present',
  js.includes("'create_enterprise_request'"));
ok('confirm_completed_mission RPC present',
  js.includes("'confirm_completed_mission'"));
ok('set_enterprise_member_sites RPC present',
  js.includes("'set_enterprise_member_sites'"));
ok('update_enterprise_member_role RPC present',
  js.includes("'update_enterprise_member_role'"));
ok('set_enterprise_member_status RPC present',
  js.includes("'set_enterprise_member_status'"));

// ── JS: Transport error guards ────────────────────────────────
console.log('\n── JS: Transport error guards ──');
ok('confirmMission checks data.ok (not just error)',
  js.includes('data.ok') || js.includes('.ok ===') || js.includes('.ok==='));
ok('_safeMsg helper present',
  js.includes('function _safeMsg'));
ok('No silent swallowing — throw on res.error',
  js.includes('if(res.error) throw res.error'));

// ── Migration: Existing policies preserved ────────────────────
console.log('\n── Migration: Existing policies not dropped ──');
ok('Migration does not drop client_own_requests_read',
  !sql.includes('"client_own_requests_read"'));
ok('Migration does not drop artisan_read_own_linked_requests',
  !sql.includes('"artisan_read_own_linked_requests"'));
ok('Migration does not drop admin_all_service_requests',
  !sql.includes('"admin_all_service_requests"'));
ok('Migration does not drop client_select_own_missions',
  !sql.includes('"client_select_own_missions"'));
ok('Migration does not drop artisan_select_own_missions',
  !sql.includes('"artisan_select_own_missions"'));
ok('Migration does not drop admin_all_missions',
  !sql.includes('"admin_all_missions"'));

// ── Safety: No parallel lifecycle ────────────────────────────
console.log('\n── Safety: No parallel lifecycle ──');
ok('Migration does not CALL dispatch_execute_v1',
  !/\bdispatch_execute_v1\s*\(/.test(sql));
ok('Migration does not CREATE TABLE',
  !/^CREATE TABLE/m.test(sql));
ok('Migration does not reference enterprise_missions',
  !sql.includes('enterprise_missions'));
ok('Migration wraps in BEGIN/COMMIT',
  sql.includes('BEGIN;') && sql.includes('COMMIT;'));

// ── Pricing files ─────────────────────────────────────────────
console.log('\n── Pricing file protection ──');
const PRICING_ENGINE = path.join(__dirname,'../../data/pricing/engine/engine-test-report.v1.json');
const PRICING_SHADOW = path.join(__dirname,'../../data/pricing/shadow/shadow-results.v1.json');
ok('Pricing engine file exists (not deleted)',
  fs.existsSync(PRICING_ENGINE));
ok('Pricing shadow file exists (not deleted)',
  fs.existsSync(PRICING_SHADOW));

// ── Summary ───────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════');
console.log(` PASS  : ${pass}`);
console.log(` FAIL  : ${fail}`);
console.log(` TOTAL : ${pass+fail}`);
console.log('════════════════════════════════════════════════════════');
console.log(fail===0
  ? '\n BP09 CONTRACT MATRIX TESTS: PASSED\n'
  : '\n BP09 CONTRACT MATRIX TESTS: FAILED\n');
process.exit(fail===0 ? 0 : 1);
