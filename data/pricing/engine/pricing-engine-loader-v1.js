'use strict';
/**
 * FIXEO Pricing Engine Loader V1
 * Reads canonical draft contracts and builds validated in-memory data structures.
 *
 * DORMANT — not imported by any production runtime.
 * production_active = false
 */

const fs = require('fs');
const path = require('path');

const CANONICAL_DIR = path.resolve(__dirname, '../canonical');
const CONSOLIDATION_DIR = path.resolve(__dirname, '../consolidation');

/**
 * Load and parse a JSON file; throw with context on error.
 */
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`EngineLoader: failed to parse ${filePath}: ${e.message}`);
  }
}

/**
 * Build the complete engine data bundle from canonical draft contracts.
 * Returns a frozen, immutable data bundle.
 */
function loadEngineData() {
  const registry    = loadJson(path.join(CANONICAL_DIR, 'canonical-registry.v1.draft.json'));
  const formulas    = loadJson(path.join(CANONICAL_DIR, 'formula-registry.v1.draft.json'));
  const policies    = loadJson(path.join(CANONICAL_DIR, 'policy-registry.v1.draft.json'));
  const routes      = loadJson(path.join(CANONICAL_DIR, 'routing-registry.v1.draft.json'));
  const legacyMap   = loadJson(path.join(CANONICAL_DIR, 'legacy-code-map.v1.draft.json'));
  const inputsDef   = loadJson(path.join(CONSOLIDATION_DIR, 'canonical-inputs.v1.draft.json'));
  const hrq         = loadJson(path.join(CONSOLIDATION_DIR, 'human-review-queue.v1.draft.json'));
  const readiness   = loadJson(path.join(CONSOLIDATION_DIR, 'engine-readiness.v1.draft.json'));

  // Validate engine readiness
  const ecReady = readiness.engine_core_v1_readiness && readiness.engine_core_v1_readiness.ENGINE_CORE_V1_READY;
  if (!ecReady) {
    throw new Error('EngineLoader: ENGINE_CORE_V1_READY is not true in engine-readiness.v1.draft.json');
  }

  const engineBlocking = hrq._meta && hrq._meta.engine_blocking_count;
  if (engineBlocking !== 0) {
    throw new Error(`EngineLoader: ${engineBlocking} engine-blocking HRQ items remain open. Resolve before loading engine.`);
  }

  // Index services by canonical code
  const serviceIndex = {};
  const legacyIndex  = {};
  const services = registry.services || {};

  for (const [code, svc] of Object.entries(services)) {
    serviceIndex[code] = svc;
    // Also index by legacy codes
    for (const lcode of (svc.legacy_codes || [])) {
      legacyIndex[lcode] = code;
    }
  }

  // Index formulas, policies, routes, inputs by ID
  const formulaIndex = formulas.formulas || {};
  const policyIndex  = policies.policies || {};
  const routeIndex   = routes.routes || {};
  const inputIndex   = inputsDef.inputs || {};

  // Build legacy map from legacy-code-map if additional entries exist
  const lcmEntries = legacyMap.legacy_codes || legacyMap.mappings || legacyMap || {};
  if (typeof lcmEntries === 'object') {
    for (const [lcode, entry] of Object.entries(lcmEntries)) {
      if (typeof entry === 'object' && entry.canonical_service_code) {
        if (!legacyIndex[lcode]) legacyIndex[lcode] = entry.canonical_service_code;
      }
    }
  }

  const bundle = {
    // Meta
    engine_name:    'FIXEO_PRICING_ENGINE_CORE',
    engine_version: '1.0.0-dormant',
    engine_type:    'RULE_BASED_CANONICAL_PRICING_ENGINE',
    production_active: false,
    loaded_at: new Date().toISOString(),

    // Data
    services:     serviceIndex,
    legacyCodes:  legacyIndex,
    formulas:     formulaIndex,
    policies:     policyIndex,
    routes:       routeIndex,
    inputs:       inputIndex,
    governance:   registry._meta && registry._meta.governance,

    // Stats
    serviceCount:  Object.keys(serviceIndex).length,
    formulaCount:  Object.keys(formulaIndex).length,
    policyCount:   Object.keys(policyIndex).length,
    routeCount:    Object.keys(routeIndex).length,
    inputCount:    Object.keys(inputIndex).length,
  };

  return bundle;
}

// Singleton instance — lazy-loaded
let _bundle = null;

function getEngineData() {
  if (!_bundle) _bundle = loadEngineData();
  return _bundle;
}

function resetEngineData() {
  _bundle = null;
}

module.exports = { getEngineData, resetEngineData, loadEngineData };
