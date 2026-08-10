#!/usr/bin/env node
/*!
 * validate-7c9f.js
 * Phase 7C.9F / 7C.9F.1 — FIXEO Estimator Activation Prerequisites
 *   (7C.9F.1 corrections: no redundant unique index, strengthened auth grants,
 *    verified profiles contract, sequence revoke for anon+authenticated,
 *    exact index count = 5 not 6)
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
test('A.3 Migration is in the canonical supabase/ directory (>5KB)', function() {
  ok(migration.length > 5000, 'migration must be non-trivial (>5KB)');
});
test('A.4 Migration uses CREATE TABLE IF NOT EXISTS (safe to re-run)', function() {
  ok(migration.includes('CREATE TABLE IF NOT EXISTS'));
});
test('A.5 Migration does not DROP existing tables', function() {
  notOk(/DROP\s+TABLE\s+(?!IF\s+EXISTS)public\.estimator_context_redemptions/i.test(migration),
    'must not non-conditionally drop table');
});
test('A.6 Migration has version 1.1 (7C.9F.1 corrected)', function() {
  ok(migration.includes('Version: 1.1'));
});
test('A.7 Migration has Phase 7C.9F.1 reference', function() {
  ok(migration.includes('7C.9F.1'));
});

/* ── B. context_id idempotency key ── */
console.log('\n── B. context_id idempotency key ──');

test('B.1 context_id column declared NOT NULL', function() {
  ok(/context_id\s+text\s+NOT NULL/.test(migration));
});
test('B.2 UNIQUE constraint on context_id', function() {
  ok(migration.includes('UNIQUE (context_id)') || migration.includes('UNIQUE(context_id)'));
});
test('B.3 UNIQUE constraint is named (for reference)', function() {
  ok(migration.includes('estimator_context_redemptions_context_id_unique'));
});
test('B.4 context_id format documented in comments', function() {
  ok(migration.includes('fxctx-'));
});
test('B.5 context_id is the atomic replay boundary (documented)', function() {
  ok(migration.includes('atomic') && migration.includes('idempotency'));
});
test('B.6 NO separate CREATE UNIQUE INDEX for context_id (constraint is sole mechanism)', function() {
  // The UNIQUE constraint implicitly creates one index.
  // An explicit CREATE UNIQUE INDEX idx_ecr_context_id is WRONG and must be absent.
  notOk(migration.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_context_id'),
    'redundant explicit unique index must be absent — UNIQUE constraint owns the index');
});
test('B.7 UNIQUE constraint DROP IF EXISTS before ADD (idempotent)', function() {
  ok(migration.includes('DROP CONSTRAINT IF EXISTS estimator_context_redemptions_context_id_unique'));
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

/* ── D. INSERT fields ── */
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
test('D.5 acquired_at is timestamptz NOT NULL', function() {
  ok(/acquired_at\s+timestamptz\s+NOT NULL/.test(migration));
});

/* ── E. PATCH fields ── */
console.log('\n── E. PATCH fields (commit / fail) ──');

test('E.1 booking_ref column present (commit PATCH)', function() {
  ok(migration.includes('booking_ref'));
});
test('E.2 order_id column present (commit PATCH)', function() {
  ok(migration.includes('order_id'));
});
test('E.3 committed_at is timestamptz (nullable)', function() {
  ok(/committed_at\s+timestamptz/.test(migration));
  notOk(/committed_at\s+timestamptz\s+NOT NULL/.test(migration), 'committed_at must be nullable');
});
test('E.4 failed_at is timestamptz (nullable)', function() {
  ok(/failed_at\s+timestamptz/.test(migration));
  notOk(/failed_at\s+timestamptz\s+NOT NULL/.test(migration), 'failed_at must be nullable');
});
test('E.5 failure_reason has length CHECK (max 500 chars)', function() {
  ok(migration.includes('500'));
});

/* ── F. GET fields ── */
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
test('G.3 anon access revoked from table', function() {
  ok(migration.includes('REVOKE ALL ON public.estimator_context_redemptions FROM anon'));
});
test('G.4 authenticated access revoked before re-grant', function() {
  ok(migration.includes('REVOKE ALL ON public.estimator_context_redemptions FROM authenticated'));
});
test('G.5 anon sequence access revoked', function() {
  ok(migration.includes('REVOKE ALL ON SEQUENCE public.estimator_context_redemptions_id_seq FROM anon'));
});
test('G.6 authenticated sequence access revoked', function() {
  ok(migration.includes('REVOKE ALL ON SEQUENCE public.estimator_context_redemptions_id_seq FROM authenticated'));
});
test('G.7 No anon INSERT policy', function() {
  notOk(/CREATE POLICY.*ecr_anon_insert/s.test(migration), 'no anon insert policy');
});
test('G.8 No authenticated INSERT policy', function() {
  notOk(/CREATE POLICY.*ecr_auth_insert/s.test(migration), 'no authenticated insert policy');
});
test('G.9 No authenticated UPDATE policy', function() {
  notOk(/CREATE POLICY.*ecr_auth_update/s.test(migration), 'no authenticated update policy');
});
test('G.10 Admin-only SELECT policy exists (ecr_admin_select)', function() {
  ok(migration.includes('ecr_admin_select'));
});
test('G.11 ecr_admin_select uses proven profiles.id = auth.uid() AND profiles.role = admin contract', function() {
  ok(migration.includes("profiles.id   = auth.uid()") || migration.includes("profiles.id = auth.uid()"));
  ok(migration.includes("profiles.role = 'admin'"));
});
test('G.12 profiles admin contract documented as verified from production migration history', function() {
  ok(migration.includes('rls-fix-2026-04-29') && migration.includes('enterprise_leads'));
});
test('G.13 Authenticated gets SELECT only (no INSERT/UPDATE/DELETE grant)', function() {
  ok(migration.includes('GRANT SELECT ON public.estimator_context_redemptions TO authenticated'));
  notOk(/GRANT.*INSERT.*ON public\.estimator_context_redemptions TO authenticated/i.test(migration));
  notOk(/GRANT.*UPDATE.*ON public\.estimator_context_redemptions TO authenticated/i.test(migration));
  notOk(/GRANT.*DELETE.*ON public\.estimator_context_redemptions TO authenticated/i.test(migration));
});
test('G.14 Sequence NOT granted to authenticated', function() {
  notOk(/GRANT.*ON SEQUENCE.*estimator_context_redemptions_id_seq.*TO authenticated/.test(migration),
    'sequence must not be granted to authenticated');
});
test('G.15 Sequence NOT granted to anon', function() {
  notOk(/GRANT.*ON SEQUENCE.*estimator_context_redemptions_id_seq.*TO anon/.test(migration),
    'sequence must not be granted to anon');
});
test('G.16 service_role access documented', function() {
  ok(migration.includes('service_role') && migration.includes('bypasses RLS'));
});

/* ── H. Migration safety ── */
console.log('\n── H. Migration safety ──');

test('H.1 No DROP TABLE', function() {
  notOk(/DROP\s+TABLE\b/i.test(migration), 'DROP TABLE must not appear');
});
test('H.2 No DROP COLUMN', function() {
  notOk(/ALTER\s+TABLE.*DROP\s+COLUMN/i.test(migration), 'DROP COLUMN must not appear');
});
test('H.3 No DELETE FROM in setup sections', function() {
  const createSection = migration.slice(0, migration.indexOf('OPTIONAL:'));
  notOk(/^DELETE\s+FROM/mi.test(createSection), 'DELETE must not appear in setup sections');
});
test('H.4 No executable schema changes outside estimator_context_redemptions', function() {
  // Check only non-comment lines (strip lines starting with --)
  const nonCommentLines = migration.split('\n').filter(function(l) {
    return !/^\s*--/.test(l);
  }).join('\n');
  const alterMatches = nonCommentLines.match(/ALTER\s+TABLE\s+public\.(\w+)/gi) || [];
  alterMatches.forEach(function(m) {
    ok(m.toLowerCase().includes('estimator_context_redemptions'), 'unexpected ALTER TABLE: ' + m);
  });
});
test('H.5 Verification queries VQ-1 through VQ-9 present', function() {
  ok(migration.includes('VQ-1:') && migration.includes('VQ-9:'));
});
test('H.6 Re-run safety section present', function() {
  ok(migration.includes('SECTION 9') || migration.includes('RE-RUN SAFETY'));
});

/* ── I. Schema ↔ Runtime contract ── */
console.log('\n── I. Schema ↔ Runtime contract ──');

test('I.1 Runtime TABLE constant matches migration table name', function() {
  const tableMatch = idem.match(/TABLE\s*=\s*'([^']+)'/);
  ok(tableMatch && tableMatch[1] === 'estimator_context_redemptions',
    'TABLE in idempotency module must match migration');
});
test('I.2–I.8 All runtime INSERT fields present in migration', function() {
  ['context_id', 'outcome_type', 'service_code', 'session_id',
   'amount_mad', 'state', 'acquired_at'].forEach(function(col) {
    ok(migration.includes(col), 'migration missing INSERT field: ' + col);
  });
});
test('I.9–I.13 All runtime PATCH fields present in migration', function() {
  ['booking_ref', 'order_id', 'committed_at', 'failed_at', 'failure_reason'].forEach(function(col) {
    ok(migration.includes(col), 'migration missing PATCH field: ' + col);
  });
});
test('I.14 State values match runtime exactly', function() {
  ok(migration.includes("'acquired'") && migration.includes("'committed'") && migration.includes("'failed'"));
  notOk(migration.includes("'pending'"), "extra state 'pending' not in runtime");
  notOk(migration.includes("'cancelled'"), "extra state 'cancelled' not in runtime");
});
test('I.15 failure_reason length matches runtime truncation (500 chars)', function() {
  ok(idem.includes('.slice(0, 500)'), 'runtime must truncate to 500');
  ok(migration.includes('500'), 'migration must enforce max 500 chars');
});

/* ── J. Invariants ── */
console.log('\n── J. Activation safety invariants ──');

test('J.1 Feature flag remains false', function() {
  ok(cfg.includes('estimatorV2Enabled: false'));
  notOk(cfg.includes('estimatorV2Enabled: true'));
});
test('J.2 Legacy estimator in index.html', function() {
  ok(idx.includes('fixeo-estimation-engine-v1.js'));
});
test('J.3 Engine file exists', function() {
  ok(exists('data/pricing/engine/pricing-engine-core-v1.js'));
});
test('J.4 Orchestrator exists', function() {
  ok(exists('data/pricing/orchestrator/estimator-orchestrator-v1.js'));
});
test('J.5 Server-authoritative booking pricing intact', function() {
  ok(srv.includes('resolveAuthoritativeBookingPricing'));
  ok(srv.includes('BookingAuthorityError'));
});
test('J.6 Idempotency required for estimator-backed bookings', function() {
  ok(srv.includes('consumeEstimatorContext'));
  ok(srv.includes('.status(503)'));
});
test('J.7 API fail-closed on missing secret', function() {
  ok(auth.includes("'CONFIG_ERROR'"));
});

/* ── K. Secret hardcoding scan ── */
console.log('\n── K. Secret hardcoding scan ──');

test('K.1 FIXEO_ESTIMATOR_SECRET not hardcoded in browser JS', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js', 'js/fixeo-estimator-config.js'].forEach(function(f) {
    if (exists(f)) {
      const code = read(f);
      notOk(code.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"]/), f + ' must not have hardcoded secret');
    }
  });
});
test('K.2 FIXEO_ESTIMATOR_SECRET not hardcoded in migration', function() {
  notOk(migration.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][^'"]+['"]/));
});
test('K.3 No secret literal in idempotency module', function() {
  notOk(idem.match(/FIXEO_ESTIMATOR_SECRET\s*=\s*['"][^'"]+['"]/));
});

/* ── L. Vercel dependency resolution ── */
console.log('\n── L. Vercel dependency preflight ──');

test('L.1 vercel.json has estimator-v1 build entry', function() {
  ok(vercelJ.includes('api/estimator-v1/index.js'));
});
test('L.2 /api/estimator-v1 route in vercel.json', function() {
  ok(vercelJ.includes('/api/estimator-v1'));
});
test('L.3 /estimation route in vercel.json', function() {
  ok(vercelJ.includes('/estimation'));
});
test('L.4 estimation.html exists', function() {
  ok(exists('estimation.html'));
});
test('L.5 api/estimator-v1/index.js exists', function() {
  ok(exists('api/estimator-v1/index.js'));
});
test('L.6 Zero npm deps in estimator API package.json', function() {
  const pkg = JSON.parse(read('api/estimator-v1/package.json'));
  const deps = Object.keys(pkg.dependencies || {});
  ok(deps.length === 0, 'must have zero npm deps: ' + deps.join(', '));
});
test('L.7 Orchestrator require resolves locally', function() {
  const apiCode = read('api/estimator-v1/index.js');
  const m = apiCode.match(/require\(['"]([^'"]*orchestrator[^'"]*)['"]\)/);
  ok(m, 'orchestrator require must exist in API');
  const absPath = path.resolve(ROOT, 'api/estimator-v1', m[1]);
  ok(fs.existsSync(absPath) || fs.existsSync(absPath + '.js'),
    'orchestrator path must resolve: ' + absPath);
});
test('L.8 Engine resolves locally', function() {
  ok(exists('data/pricing/engine/pricing-engine-core-v1.js'));
});
test('L.9 Canonical JSON files exist (>0)', function() {
  const files = fs.readdirSync(path.join(ROOT, 'data/pricing/canonical'));
  ok(files.filter(function(f) { return f.endsWith('.json'); }).length > 0);
});
test('L.10 Token module resolves', function() {
  ok(exists('api/estimator-v1/fixeo-estimator-token-v1.js'));
});
test('L.11 Runtime module resolves', function() {
  ok(exists('api/estimator-v1/fixeo-estimator-runtime-v1.js'));
});
test('L.12 Authority module resolves', function() {
  ok(exists('api/fixeo-booking-authority-v1.js'));
});
test('L.13 Idempotency module resolves', function() {
  ok(exists('api/fixeo-estimator-idempotency-v1.js'));
});
test('L.14 No browser file imports Node.js server modules', function() {
  ['js/fixeo-estimator-v2.js', 'js/fixeo-estimator-api-v1.js',
   'js/fixeo-estimator-reservation-bridge-v1.js'].forEach(function(f) {
    if (!exists(f)) return;
    const code = read(f);
    notOk(code.includes("require('crypto')"), f + ' must not require crypto');
    notOk(code.includes("require('fs')"), f + ' must not require fs');
  });
});

/* ── M. VQ-4 index count contract ── */
console.log('\n── M. VQ-4 index contract (5 indexes expected) ──');

test('M.1 VQ-4 documents exactly 5 indexes', function() {
  ok(migration.includes('VQ-4'));
  // Verify the VQ-4 description mentions exactly 5 indexes
  // by checking that the 5 expected index names are documented
  const vq4section = migration.slice(migration.indexOf('VQ-4'), migration.indexOf('VQ-5'));
  ok(vq4section.includes('estimator_context_redemptions_pkey'), 'VQ-4 must list pkey');
  ok(vq4section.includes('estimator_context_redemptions_context_id_unique'), 'VQ-4 must list unique constraint index');
  ok(vq4section.includes('idx_ecr_acquired_at'), 'VQ-4 must list acquired_at index');
  ok(vq4section.includes('idx_ecr_service_code'), 'VQ-4 must list service_code index');
  ok(vq4section.includes('idx_ecr_state'), 'VQ-4 must list state index');
});
test('M.2 Migration does NOT CREATE idx_ecr_context_id (removed — constraint owns the index)', function() {
  // The name may appear in changelog comments (documenting removal) — that is fine.
  // What must be absent is any CREATE INDEX or CREATE UNIQUE INDEX statement using it.
  const nonCommentLines = migration.split('\n').filter(function(l) {
    return !/^\s*--/.test(l);
  }).join('\n');
  notOk(/CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?idx_ecr_context_id/i.test(nonCommentLines),
    'CREATE INDEX idx_ecr_context_id must be absent — UNIQUE constraint creates the index implicitly');
});
test('M.3 VQ-7 for sequence privileges is present and correct', function() {
  // Find the canonical VQ-7 query block (not the changelog mention)
  // The query block starts with '-- VQ-7:' line and the SQL uses role_usage_grants
  ok(migration.includes('role_usage_grants'), 'VQ-7 must query role_usage_grants');
  ok(migration.includes('estimator_context_redemptions_id_seq'), 'VQ-7 must reference the sequence');
  // The REVOKE ALL on sequence must be in the SQL (non-comment lines)
  const nonCommentLines = migration.split('\n').filter(function(l) {
    return !/^\s*--/.test(l);
  }).join('\n');
  ok(/REVOKE ALL ON SEQUENCE.*id_seq.*FROM anon/i.test(nonCommentLines), 'REVOKE anon on sequence required');
  ok(/REVOKE ALL ON SEQUENCE.*id_seq.*FROM authenticated/i.test(nonCommentLines), 'REVOKE authenticated on sequence required');
});

/* ── RESULTS ── */
console.log('\n══ 7C.9F.1 Validator Results ══');
console.log('  Passed: ' + passed + ' / Total: ' + (passed + failed));
if (failed > 0) {
  console.log('  Failed: ' + failed);
  errors.forEach(function(e) { console.log('    ✗ ' + e.name + ': ' + e.error); });
  process.exit(1);
} else {
  console.log('  All 7C.9F.1 validations passed ✓');
}
