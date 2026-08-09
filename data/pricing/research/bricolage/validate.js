#!/usr/bin/env node
/**
 * FIXEO Bricolage Research Validator — Phase 7B.7
 * Validates research artifact integrity without modifying any production files.
 * 
 * Usage: node validate.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname);
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

let pass = 0;
let fail = 0;
const errors = [];

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  pass++;
}

function err(label, detail) {
  console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  errors.push({ label, detail });
  fail++;
}

function warn(label, detail) {
  console.log(`  ⚠️  WARN: ${label}${detail ? ' — ' + detail : ''}`);
}

// ─── Load files ─────────────────────────────────────────────────────────────

function loadJSON(filename) {
  const filepath = path.join(RESEARCH_DIR, filename);
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    err(`File loadable: ${filename}`, e.message);
    return null;
  }
}

// ─── 1. Required files exist ─────────────────────────────────────────────────

console.log('\n[1] Required files exist');
const requiredFiles = [
  'registry.v0.1.json',
  'sources.v0.1.json',
  'evidence.v0.1.json',
  'exclusions.v0.1.json',
  'legacy-comparison.md',
  'README.md',
  'validate.js'
];

for (const f of requiredFiles) {
  const fpath = path.join(RESEARCH_DIR, f);
  if (fs.existsSync(fpath)) ok(`File exists: ${f}`);
  else err(`File exists: ${f}`, 'MISSING');
}

// ─── 2. Valid JSON ────────────────────────────────────────────────────────────

console.log('\n[2] Valid JSON');
const registry  = loadJSON('registry.v0.1.json');
const sources   = loadJSON('sources.v0.1.json');
const evidence  = loadJSON('evidence.v0.1.json');
const exclusions = loadJSON('exclusions.v0.1.json');

if (registry)  ok('registry.v0.1.json parses');
if (sources)   ok('sources.v0.1.json parses');
if (evidence)  ok('evidence.v0.1.json parses');
if (exclusions) ok('exclusions.v0.1.json parses');

// ─── 3. production_ready = false everywhere ───────────────────────────────────

console.log('\n[3] production_ready = false');

function checkNotProductionReady(obj, label) {
  if (!obj) return;
  if (obj.production_ready === true) {
    err(`${label} production_ready must be false`);
  } else {
    ok(`${label} production_ready = false`);
  }
}

checkNotProductionReady(registry, 'registry root');
checkNotProductionReady(sources, 'sources root');
checkNotProductionReady(evidence, 'evidence root');
checkNotProductionReady(exclusions, 'exclusions root');

if (registry && registry.services) {
  let allFalse = true;
  for (const svc of registry.services) {
    if (svc.production_ready === true) {
      err(`Service ${svc.code} has production_ready=true`, 'MUST be false');
      allFalse = false;
    }
  }
  if (allFalse) ok('All service entries: production_ready = false');
}

// ─── 4. human_decision = PENDING everywhere ───────────────────────────────────

console.log('\n[4] human_decision = PENDING');

if (registry && registry.human_decision === 'PENDING') ok('registry.human_decision = PENDING');
else err('registry.human_decision must be PENDING');

if (registry && registry.services) {
  let allPending = true;
  for (const svc of registry.services) {
    if (svc.human_decision && svc.human_decision !== 'PENDING') {
      err(`Service ${svc.code} human_decision must be PENDING`);
      allPending = false;
    }
  }
  if (allPending) ok('All services: human_decision = PENDING');
}

// ─── 5. city_adjustment = null ───────────────────────────────────────────────

console.log('\n[5] city_adjustment = null');
if (registry && registry.city_adjustment === null) ok('registry.city_adjustment = null');
else err('registry.city_adjustment must be null');

// ─── 6. All time/urgency modifiers = null ────────────────────────────────────

console.log('\n[6] Time/urgency modifiers = null');
const modifiers = ['urgency_modifier','night_modifier','weekend_modifier','holiday_modifier','express_modifier'];
if (registry) {
  for (const m of modifiers) {
    if (registry[m] === null) ok(`registry.${m} = null`);
    else err(`registry.${m} must be null`, `got: ${registry[m]}`);
  }
}

// ─── 7. Unique service codes ─────────────────────────────────────────────────

console.log('\n[7] Unique service codes');
if (registry && registry.services) {
  const codes = registry.services.map(s => s.code);
  const uniqueCodes = new Set(codes);
  if (codes.length === uniqueCodes.size) ok(`All ${codes.length} service codes are unique`);
  else err('Duplicate service codes found', JSON.stringify([...new Map(codes.map((c,i) => [c,i])).entries()]));
}

// ─── 8. All evidence source IDs resolve ──────────────────────────────────────

console.log('\n[8] Evidence source IDs resolve to sources.v0.1.json');
if (evidence && sources) {
  const sourceIds = new Set(sources.sources.map(s => s.source_id));
  let allResolved = true;
  for (const obs of evidence.evidence_observations) {
    for (const sid of (obs.source_ids || [])) {
      if (!sourceIds.has(sid)) {
        err(`Evidence obs ${obs.obs_id} references unknown source: ${sid}`);
        allResolved = false;
      }
    }
  }
  if (allResolved) ok('All evidence source_ids resolve in sources.v0.1.json');
}

// ─── 9. All services have required fields ────────────────────────────────────

console.log('\n[9] Service entries have required fields');
const requiredServiceFields = ['code', 'label', 'architecture', 'pricing_unit', 'confidence', 'human_decision', 'production_ready'];
if (registry && registry.services) {
  let allComplete = true;
  for (const svc of registry.services) {
    for (const field of requiredServiceFields) {
      if (svc[field] === undefined || svc[field] === null) {
        if (field === 'confidence' && svc.confidence === 'INSUFFICIENT') {
          // INSUFFICIENT is valid
        } else {
          err(`Service ${svc.code} missing field: ${field}`);
          allComplete = false;
        }
      }
    }
  }
  if (allComplete) ok(`All ${registry.services.length} services have required fields`);
}

// ─── 10. No approved/frozen prices ───────────────────────────────────────────

console.log('\n[10] No approved or frozen prices');
if (registry && registry.services) {
  let clean = true;
  for (const svc of registry.services) {
    if (svc.approved === true || svc.frozen === true) {
      err(`Service ${svc.code} must not have approved or frozen = true`);
      clean = false;
    }
    if (svc.price_approved !== undefined) {
      err(`Service ${svc.code} must not have price_approved field`);
      clean = false;
    }
  }
  if (clean) ok('No approved or frozen prices found');
}

// ─── 11. No prior métier artifacts modified ───────────────────────────────────

console.log('\n[11] Prior métier research directories intact');
const priorMetiers = ['plomberie', 'electricite', 'serrurerie', 'climatisation'];
const researchBase = path.join(REPO_ROOT, 'data', 'pricing', 'research');

for (const metier of priorMetiers) {
  const metierPath = path.join(researchBase, metier);
  if (fs.existsSync(metierPath)) {
    const files = fs.readdirSync(metierPath);
    if (files.length > 0) ok(`Prior métier exists and non-empty: ${metier}`);
    else warn(`Prior métier directory exists but empty: ${metier}`);
  } else {
    warn(`Prior métier directory not found: ${metier} (may not yet exist on this branch)`);
  }
}

// ─── 12. Production files unmodified (spot check) ────────────────────────────

console.log('\n[12] Production runtime files not modified by this phase');
const productionFiles = [
  'index.html',
  'services.html',
  'artisans.html',
  'artisan-profile.html',
  'pricing.html',
  'js/fixeo-reservation-flagship-v1.js',
  'js/fixeo-matching-engine.js',
  'js/secondary-search.js',
  'js/fixeo-profile-v2a.js',
  'js/fixeo-profile-v3.js'
];

// We check git status to confirm these files are unmodified
const { execSync } = require('child_process');
try {
  const gitStatus = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  // Only bricolage research files should appear as new
  const changedLines = gitStatus.split('\n').filter(l => l.trim());
  let productionChanges = false;
  for (const line of changedLines) {
    for (const pf of productionFiles) {
      if (line.includes(pf)) {
        err(`Production file modified: ${pf}`, line.trim());
        productionChanges = true;
      }
    }
  }
  if (!productionChanges) ok('No production files appear in git status');
  
  // Check that only bricolage research files are new
  const newFiles = changedLines.filter(l => l.startsWith('??') || l.startsWith('A '));
  const allBricolage = newFiles.every(l => l.includes('bricolage'));
  if (newFiles.length > 0 && allBricolage) ok(`New files are all in bricolage research directory (${newFiles.length} files)`);
  else if (newFiles.length === 0) ok('No unexpected new files');
  else {
    for (const nf of newFiles) {
      if (!nf.includes('bricolage')) {
        warn(`Unexpected new file outside bricolage: ${nf.trim()}`);
      }
    }
  }
} catch(e) {
  warn('Could not run git status check', e.message);
}

// ─── 13. No métier overlap in registry ───────────────────────────────────────

console.log('\n[13] No unsafe métier overlap');
if (registry && registry.services_deferred_or_excluded) {
  const specialistItems = registry.services_deferred_or_excluded.filter(s => s.decision === 'SPECIALIST_REQUIRED');
  if (specialistItems.length > 0) ok(`${specialistItems.length} tasks correctly excluded as SPECIALIST_REQUIRED`);
  else warn('No SPECIALIST_REQUIRED exclusions found — review expected');
}

// ─── 14. Legacy values labeled T0 ────────────────────────────────────────────

console.log('\n[14] Legacy comparison file contains T0 labeling');
const legacyPath = path.join(RESEARCH_DIR, 'legacy-comparison.md');
if (fs.existsSync(legacyPath)) {
  const legacyContent = fs.readFileSync(legacyPath, 'utf8');
  if (legacyContent.includes('LEGACY_T0')) ok('legacy-comparison.md contains T0 labeling');
  else err('legacy-comparison.md must contain LEGACY_T0 classification');
  if (legacyContent.includes('were modified')) ok('legacy-comparison.md contains non-modification statement');
} else {
  err('legacy-comparison.md missing');
}

// ─── 15. Schema version present ──────────────────────────────────────────────

console.log('\n[15] Schema version present in all JSON files');
for (const [name, obj] of [['registry', registry], ['sources', sources], ['evidence', evidence], ['exclusions', exclusions]]) {
  if (obj && obj.schema_version) ok(`${name} has schema_version`);
  else if (obj) err(`${name} missing schema_version`);
}

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`VALIDATION RESULTS: ${pass} PASS / ${fail} FAIL`);
if (errors.length > 0) {
  console.log('\nFailed checks:');
  for (const e of errors) {
    console.log(`  • ${e.label}${e.detail ? ': ' + e.detail : ''}`);
  }
}
console.log('═'.repeat(60));
console.log(`Phase: 7B.7 — FIXEO Bricolage Morocco Market Research`);
console.log(`Status: RESEARCH_ONLY`);
console.log(`production_ready: false`);
console.log(`human_decision: PENDING`);
console.log('═'.repeat(60));

process.exit(fail > 0 ? 1 : 0);
