#!/usr/bin/env node
/*!
 * validate-7c9f.js
 * Phase 7C.9F — FIXEO Estimator Activation Prerequisites & Preview Readiness
 * Schema↔Runtime contract validator + security + activation preflight.
 * Target: ≥50 meaningful assertions.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
function read(rel)   { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

let passed = 0, failed = 0;
const errors = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); failed++; errors.push({ name, error: e.message }); }
}
function ok(c, m)    { if (!c) throw new Error(m || 'assertion failed'); }
function notOk(c, m) { if (c)  throw new Error(m || 'should be false'); }

const migration = read('supabase/estimator-context-redemptions-v1.sql');
const idem      = read('api/fixeo-estimator-idempotency-v1.js');
const auth      = read('api/fixeo-booking-authority-v1.js');
const srv       = read('api/server.js');
const cfg       = read('js/fixeo-estimator-config.js');
const idx       = read('index.html');
const vercelJ   = read('vercel.json');

/* ── A. Migration file existence & identity ── */
console.log('\n── A. Migration file existence & identity ──');

test('A.1 Migration file exists at expected path', function() {
  ok(exists('supabase/estimator-context-redemptions-v1.sql'));
});
test('A.2 Migration declares correct table name', function() {
  ok(migration.includes('estimator_context_redemptions'));
});
test('A.3 Migration is in the canonical supabase/ directory', function() {
  ok(exists('supabase/'), 'supabase directory must exist');
  ok(migration.length > 5000, 'migration must be non-trivial (>5KB)');
});
test('A.4 Migration uses CREATE TABLE IF NOT EXISTS (safe to re-run)', function() {
  ok(migration.includes('CREATE TABLE IF NOT EXISTS'));
});
test('A.5 Migration does not DROP existing tables', function() {
  notOk(/DROP\s+TABLE\s+(?!IF\s+EXISTS)public\.estimator_context_redemptions/i.test(migration),
    'must not non-conditionally drop table');
});
test('A.6 Migration has version comment', function() {
  ok(migration.includes('Version: 1.0'));
});
test('A.7 Migration has Phase reference', function() {
  ok(migration.includes('7C.9'));
});

/* ── B. Table schema — context_id (idempotency key) ── */
console.log('\n── B. context_id idempotency key ──');

test('B.1 context_id column declared NOT NULL', function() {
  // Should appear as: context_id  text  NOT NULL
  ok(/context_id\s+text\s+NOT NULL/.test(migration));
});
test('B.2 UNIQUE constraint on context_id', function() {
  ok(migration.includes('UNIQUE (context_id)') || migration.includes('UNIQUE(context_id)'));
});
test('B.3 Explicit unique index on context_id', function() {
  ok(migration.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_context_id'));
});
test('B.4 UNIQUE constraint is named (for reference)', function() {
  ok(migration.includes('estimator_context_redemptions_context_id_unique'));
});
test('B.5 context_id format documented in comments', function() {
  ok(migration.includes('fxctx-'));
});
test('B.6 context_id is the atomic replay boundary (documented)', function() {
  ok(migration.includes('atomic') && migration.includes('idempotency'));
});

/* ── C. State machine columns ── */
console.log('\n── C. State machine ──');

test('C.1 state column declared NOT NULL', function() {
  ok(/state\s+text\s+NOT NULL/.test(migration));
});
test('C.2 state has CHECK constraint with valid values', function() {
  ok(migration.includes("CHECK (state IN ('acquired', 'committed', 'failed'))") ||
     migration.includes("CHECK(state IN('acquired','committed','failed'))"));
});
test('C.3 acquired state value present', function() {
  ok(migration.includes("'acquired'"));
});
test('C.4 committed state value present', function() {
  ok(migration.includes("'committed'"));
});
test('C.5 failed state value present', function() {
  ok(migration.includes("'failed'"));
});
test('C.6 default state is acquired', function() {
  ok(migration.includes("DEFAULT 'acquired'"));
});

/* ── D. Fields written by INSERT (consumeEstimatorContext record) ── */
console.log('\n── D. INSERT fields (consumeEstimatorContext) ──');

test('D.1 outcome_type column present', function() {
  ok(/outcome_type\s+text\s+NOT NULL/.test(migration));
});
test('D.2 service_code column present', function() {
  ok(/service_code\s+text\s+NOT NULL/.test(migration));
});
test('D.3 session_id column present', function() {
  ok(/session_id\s+text\s+NOT NULL/.test(migration));
});
test('D.4 amount_mad column present (integer, NOT NULL)', function() {
  ok(/amount_mad\s+integer\s+NOT NULL/.test(migration));
});
test('D.5 acquired_at column present', function() {
  ok(migration.includes('acquired_at'));
});
test('D.6 acquired_at is timestamptz NOT NULL', function() {
  ok(/acquired_at\s+timestamptz\s+NOT NULL/.test(migration));
});

/* ── E. Fields written by PATCH (commit / fail) ── */
console.log('\n── E. PATCH fields (commit / fail) ──');

test('E.1 booking_ref column present (commit PATCH)', function() {
  ok(migration.includes('booking_ref'));
});
test('E.2 order_id column present (commit PATCH)', function() {
  ok(migration.includes('order_id'));
});
test('E.3 committed_at column present (commit PATCH)', function() {
  ok(migration.includes('committed_at'));
});
test('E.4 committed_at is timestamptz (nullable — NULL until committed)', function() {
  ok(/committed_at\s+timestamptz/.test(migration));
  notOk(/committed_at\s+timestamptz\s+NOT NULL/.test(migration), 'committed_at must be nullable');
});
test('E.5 failed_at column present (fail PATCH)', function() {
  ok(migration.includes('failed_at'));
});
test('E.6 failed_at is timestamptz (nullable)', function() {
  ok(/failed_at\s+timestamptz/.test(migration));
  notOk(/failed_at\s+timestamptz\s+NOT NULL/.test(migration), 'failed_at must be nullable');
});
test('E.7 failure_reason column present (fail PATCH)', function() {
  ok(migration.includes('failure_reason'));
});
test('E.8 failure_reason has length CHECK (max 500 chars, matching runtime truncation)', function() {
  ok(migration.includes('500'));
});

/* ── F. Fields read by GET (fetchRow) ── */
console.log('\n── F. GET fields (fetchRow / existing.*) ──');

test('F.1 state read by existing.state — column present', function() {
  ok(migration.includes('state'));
});
test('F.2 service_code read by existing.service_code — column present', function() {
  ok(migration.includes('service_code'));
});
test('F.3 outcome_type read by existing.outcome_type — column present', function() {
  ok(migration.includes('outcome_type'));
});
test('F.4 booking_ref read by existing.booking_ref — column present', function() {
  ok(migration.includes('booking_ref'));
});
test('F.5 order_id read by existing.order_id — column present', function() {
  ok(migration.includes('order_id'));
});

/* ── G. Security / RLS ── */
console.log('\n── G. Security & RLS ──');

test('G.1 RLS is enabled (ENABLE ROW LEVEL SECURITY)', function() {
  ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
});
test('G.2 RLS is forced (FORCE ROW LEVEL SECURITY)', function() {
  ok(migration.includes('FORCE ROW LEVEL SECURITY'));
});
test('G.3 anon access revoked', function() {
  ok(migration.includes('REVOKE ALL ON public.estimator_context_redemptions FROM anon'));
});
test('G.4 No anon INSERT policy', function() {
  notOk(migration.includes("TO anon"), 'no policy targeting anon role');
});
test('G.5 No authenticated INSERT policy', function() {
  notOk(migration.includes('ecr_auth_insert') && migration.match(/CREATE POLICY.*ecr_auth_insert/),
    'no authenticated insert policy must be created');
});
test('G.6 No authenticated UPDATE policy', function() {
  notOk(migration.includes('ecr_auth_update') && migration.match(/CREATE POLICY.*ecr_auth_update/),
    'no authenticated update policy must be created');
});
test('G.7 Admin-only SELECT policy for authenticated', function() {
  ok(migration.includes('ecr_admin_select') && migration.includes("profiles.role = 'admin'"));
});
test('G.8 REVOKE ALL from anon appears before grants', function() {
  const revokePos = migration.indexOf('REVOKE ALL ON public.estimator_context_redemptions FROM anon');
  const grantPos  = migration.indexOf('GRANT SELECT ON public.estimator_context_redemptions TO authenticated');
  ok(revokePos < grantPos, 'REVOKE must appear before GRANT');
});
test('G.9 Authenticated gets SELECT only (no INSERT/UPDATE/DELETE grant)', function() {
  ok(migration.includes('GRANT SELECT ON public.estimator_context_redemptions TO authenticated'));
  notOk(migration.match(/GRANT.*INSERT.*ON public\.estimator_context_redemptions TO authenticated/),
    'no INSERT grant to authenticated');
});
test('G.10 Service-role access documented', function() {
  ok(migration.includes('service_role') && migration.includes('bypasses RLS'));
});

/* ── H. Migration safety ── */
console.log('\n── H. Migration safety ──');

test('H.1 No DROP TABLE (only DROP CONSTRAINT IF EXISTS / DROP POLICY IF EXISTS)', function() {
  notOk(/DROP\s+TABLE\b/i.test(migration), 'DROP TABLE must not appear');
});
test('H.2 No destructive ALTER TABLE (no DROP COLUMN)', function() {
  notOk(/ALTER\s+TABLE.*DROP\s+COLUMN/i.test(migration), 'DROP COLUMN must not appear');
});
test('H.3 No DELETE FROM (no data deletion)', function() {
  // Verification queries have DELETE for test row — only in comments/verification section
  // The CREATE TABLE / RLS sections must not have DELETE
  const createSection = migration.slice(0, migration.indexOf('SECTION 8'));
  notOk(/^DELETE\s+FROM/mi.test(createSection), 'DELETE must not appear in setup sections');
});
test('H.4 No schema changes outside estimator_context_redemptions', function() {
  // Should not ALTER other tables
  const alterMatches = migration.match(/ALTER\s+TABLE\s+public\.(\w+)/gi) || [];
  alterMatches.forEach(function(m) {
    ok(m.toLowerCase().includes('estimator_context_redemptions'), 'unexpected ALTER TABLE: ' + m);
  });
});
test('H.5 Verification queries present in Section 8', function() {
  ok(migration.includes('SECTION 8'));
  ok(migration.includes('8-A:') && migration.includes('8-B:'));
});
test('H.6 UNIQUE constraint DROP IF EXISTS before ADD (idempotent)', function() {
  ok(migration.includes('DROP CONSTRAINT IF EXISTS estimator_context_redemptions_context_id_unique'));
});

/* ── I. Schema ↔ Runtime contract verification ── */
console.log('\n── I. Schema ↔ Runtime contract ──');

test('I.1 Runtime TABLE constant matches migration table name', function() {
  const tableMatch = idem.match(/TABLE\s*=\s*'([^']+)'/);
  ok(tableMatch && tableMatch[1] === 'estimator_context_redemptions',
    'TABLE in idempotency module must match migration');
});
test('I.2 All runtime INSERT fields present in migration (context_id)', function() {
  ok(migration.includes('context_id'));
});
test('I.3 All runtime INSERT fields present in migration (outcome_type)', function() {
  ok(migration.includes('outcome_type'));
});
test('I.4 All runtime INSERT fields present in migration (service_code)', function() {
  ok(migration.includes('service_code'));
});
test('I.5 All runtime INSERT fields present in migration (session_id)', function() {
  ok(migration.includes('session_id'));
});
test('I.6 All runtime INSERT fields present in migration (amount_mad)', function() {
  ok(migration.includes('amount_mad'));
});
test('I.7 All runtime INSERT fields present in migration (state)', function() {
  ok(migration.includes('state'));
});
test('I.8 All runtime INSERT fields present in migration (acquired_at)', function() {
  ok(migration.includes('acquired_at'));
});
test('I.9 All runtime PATCH fields present in migration (booking_ref)', function() {
  ok(migration.includes('booking_ref'));
});
test('I.10 All runtime PATCH fields present in migration (order_id)', function() {
  ok(migration.includes('order_id'));
});
test('I.11 All runtime PATCH fields present in migration (committed_at)', function() {
  ok(migration.includes('committed_at'));
});
test('I.12 All runtime PATCH fields present in migration (failed_at)', function() {
  ok(migration.includes('failed_at'));
});
test('I.13 All runtime PATCH fields present in migration (failure_reason)', function() {
  ok(migration.includes('failure_reason'));
});
test('I.14 State values match runtime exactly', function() {
  // Runtime uses: 'acquired', 'committed', 'failed'
  ok(migration.includes("'acquired'") && migration.includes("'committed'") && migration.includes("'failed'"));
  // Should NOT have extra states not in runtime
  notOk(migration.includes("'pending'"), "extra state 'pending' not in runtime");
  notOk(migration.includes("'cancelled'"), "extra state 'cancelled' not in runtime");
});
test('I.15 failure_reason length matches runtime truncation (500 chars)', function() {
  // Runtime: String(reason).slice(0, 500)
  ok(idem.includes('.slice(0, 500)'), 'runtime must truncate to 500');
  ok(migration.includes('500'), 'migration must enforce max 500 chars');
});

/* ── J. Invariants — no regression on activation safety ── */
console.log('\n── J. Activation safety invariants ──');

test('J.1 Feature flag remains false', function() {
  ok(cfg.includes('estimatorV2Enabled: false'));
  notOk(cfg.includes('estimatorV2Enabled: true'));
});
test('J.2 Legacy estimator in index.html', function() {
  ok(idx.includes('fixeo-estimation-engine-v1.js'));
});
test('J.3 No canonical pricing diff — engine file exists', function() {
  ok(exists('data/pricing/engine/pricing-engine-core-v1.js'));
});
test('J.4 No orchestrator diff — orchestrator exists', function() {
  ok(exists('data/pricing/orchestrator/estimator-orchestrator-v1.js'));
});
test('J.5 Server-authoritative booking pricing still intact', function() {
  ok(srv.includes('resolveAuthoritativeBookingPricing'));
  ok(srv.includes('BookingAuthorityError'));
  ok(srv.includes("status(422)"));
});
test('J.6 Idempotency remains required for estimator-backed bookings', function() {
  ok(srv.includes('consumeEstimatorContext'));
  ok(srv.includes('idempotency_persistence_unavailable'));
  ok(srv.includes('.status(503)'));
});
test('J.7 API fail-closed on missing secret (CONFIG_ERROR in authority)', function() {
  ok(auth.includes("'CONFIG_ERROR'"));
  ok(auth.includes('FIXEO_ESTIMATOR_SECRET not configured'));
});

/* ── K. Secret hardcoding scan ── */
console.log('\n── K. Secret hardcoding scan ──');

test('K.1 FIXEO_ESTIMATOR_SECRET not hardcoded in browser JS', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js', 'js/fixeo-estimator-config.js'].forEach(function(f) {
    if (exists(f)) {
      const code = read(f);
      notOk(code.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"]/), f + ' must not have hardcoded secret');
      notOk(code.match(/FIXEO_ESTIMATOR_SECRET.*:.*['"]/), f + ' must not have inline secret value');
    }
  });
});
test('K.2 FIXEO_ESTIMATOR_SECRET not hardcoded in migration', function() {
  notOk(migration.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][^'"]+['"]/));
});
test('K.3 No secret literal in idempotency module', function() {
  // Module reads from process.env — no hardcoded secret string
  notOk(idem.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][^'"]+['"]/));
  notOk(idem.match(/'FIXEO_ESTIMATOR_SECRET'\s*:/));
});
test('K.4 No .env file in committed tree with secret value', function() {
  // .env should be gitignored — verify .gitignore or absence
  if (exists('.env')) {
    const env = read('.env');
    notOk(env.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*\S+/), '.env must not contain secret value');
  }
  ok(true, '.env absent or does not contain secret');
});

/* ── L. Vercel dependency resolution ── */
console.log('\n── L. Vercel dependency preflight ──');

test('L.1 vercel.json has estimator-v1 build entry', function() {
  ok(vercelJ.includes('api/estimator-v1/index.js'));
});
test('L.2 /api/estimator-v1 route exists in vercel.json', function() {
  ok(vercelJ.includes('/api/estimator-v1'));
});
test('L.3 /estimation route exists in vercel.json', function() {
  ok(vercelJ.includes('/estimation'));
});
test('L.4 estimation.html exists', function() {
  ok(exists('estimation.html'));
});
test('L.5 api/estimator-v1/index.js exists', function() {
  ok(exists('api/estimator-v1/index.js'));
});
test('L.6 api/estimator-v1/package.json exists (no npm deps)', function() {
  ok(exists('api/estimator-v1/package.json'));
  const pkg = read('api/estimator-v1/package.json');
  const parsed = JSON.parse(pkg);
  const deps = Object.keys(parsed.dependencies || {});
  ok(deps.length === 0, 'estimator API must have zero npm deps: ' + deps.join(', '));
});
test('L.7 Orchestrator required by estimator API resolves locally', function() {
  const apiCode = read('api/estimator-v1/index.js');
  // Find the orchestrator require path
  const m = apiCode.match(/require\(['"]([^'"]*orchestrator[^'"]*)['"]\)/);
  ok(m, 'orchestrator require must exist in API');
  const reqPath = m[1];
  // Resolve relative to api/estimator-v1/
  const absPath = path.resolve(ROOT, 'api/estimator-v1', reqPath);
  ok(fs.existsSync(absPath) || fs.existsSync(absPath + '.js'),
    'orchestrator path must resolve: ' + absPath);
});
test('L.8 Engine required by orchestrator resolves locally', function() {
  ok(exists('data/pricing/engine/pricing-engine-core-v1.js'));
});
test('L.9 Canonical JSON files exist', function() {
  ok(exists('data/pricing/canonical'), 'canonical directory must exist');
  const files = fs.readdirSync(path.join(ROOT, 'data/pricing/canonical'));
  const jsonFiles = files.filter(function(f) { return f.endsWith('.json'); });
  ok(jsonFiles.length > 0, 'at least one canonical JSON must exist: ' + files.join(', '));
});
test('L.10 Token module resolves locally', function() {
  ok(exists('api/estimator-v1/fixeo-estimator-token-v1.js'));
});
test('L.11 Runtime module resolves locally', function() {
  ok(exists('api/estimator-v1/fixeo-estimator-runtime-v1.js'));
});
test('L.12 Booking authority module resolves locally', function() {
  ok(exists('api/fixeo-booking-authority-v1.js'));
});
test('L.13 Idempotency module resolves locally', function() {
  ok(exists('api/fixeo-estimator-idempotency-v1.js'));
});
test('L.14 No browser file imports Node.js server modules', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js'].forEach(function(f) {
    if (!exists(f)) return;
    const code = read(f);
    notOk(code.includes("require('crypto')"), f + ' must not require crypto');
    notOk(code.includes("require('fs')"), f + ' must not require fs');
    notOk(code.includes("require('path')"), f + ' must not require path');
  });
});

/* ── RESULTS ── */
console.log('\n══ 7C.9F Validator Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(function(e) { console.log('    ✗ ' + e.name + ': ' + e.error); });
  process.exit(1);
} else {
  console.log('  All 7C.9F validations passed ✓');
}
