#!/usr/bin/env node
/**
 * BP07-F: Feature matrix — which roles can access each BP07 feature.
 * Output: tests/enterprise/feature-matrix.md
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '../../tests/enterprise/feature-matrix.md');

const ROLES = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter', 'viewer'];

const CAN_CREATE_ROLES  = ['owner', 'admin', 'operations_manager', 'site_manager', 'reporter'];
const CAN_CONFIRM_ROLES = ['owner', 'admin', 'operations_manager', 'site_manager'];

function canCreate(role)  { return CAN_CREATE_ROLES.includes(role); }
function canConfirm(role) { return CAN_CONFIRM_ROLES.includes(role); }

// Feature definitions
const FEATURES = [
  // ── BP07-A Daily Brief
  {
    feature: 'BP07-A: Vue du jour — panel visible',
    desc:    'Daily brief panel shown in overview',
    check:   function(_role) { return true; }, // always visible
  },
  {
    feature: 'BP07-A: Vue du jour — "Action requise" (completed + no_match)',
    desc:    'Shows count of completed+no_match requiring action',
    check:   function(_role) { return true; }, // displayed to all; canConfirm affects completed count shown
  },
  {
    feature: 'BP07-A: Vue du jour — completed items counted in "Action requise"',
    desc:    'Completed items counted only when user canConfirm',
    check:   canConfirm,
  },

  // ── BP07-B Health Summary
  {
    feature: 'BP07-B: Répartition — panel visible',
    desc:    'Health summary panel shown in overview',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-B: Répartition — status distribution',
    desc:    'Shows breakdown by status',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-B: Répartition — top sites',
    desc:    'Shows top sites by open request count',
    check:   function(_role) { return true; },
  },

  // ── BP07-C Site Comparison
  {
    feature: 'BP07-C: Comparaison des sites — toggle button',
    desc:    'Site comparison toggle shown in sites section',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-C: Comparaison des sites — table data',
    desc:    'Table shows factual counts per site',
    check:   function(_role) { return true; },
  },

  // ── BP07-D Quick Actions
  {
    feature: 'BP07-D: Quick Actions — Interventions button',
    desc:    'Navigate to requests',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-D: Quick Actions — Urgences button',
    desc:    'Filter to urgency=now and navigate to requests',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-D: Quick Actions — Valider button (conditional)',
    desc:    'Shown only when canConfirm AND completed count > 0',
    check:   canConfirm,
  },
  {
    feature: 'BP07-D: Quick Actions — Nouvelle intervention button',
    desc:    'Shown only when canCreate',
    check:   canCreate,
  },
  {
    feature: 'BP07-D: Quick Actions — Recherche button',
    desc:    'Open command palette / search',
    check:   function(_role) { return true; },
  },

  // ── BP07-E URL State
  {
    feature: 'BP07-E: URL Hash — section preserved on navigate',
    desc:    'pushNavState called on navigateTo',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-E: URL Hash — state restored on load',
    desc:    'restoreNavState called after bootApp',
    check:   function(_role) { return true; },
  },

  // ── BP07-F QA Tooling
  {
    feature: 'BP07-F: Mock dataset — generate-mock-data.js',
    desc:    'Generates tests/enterprise/mock-data.json',
    check:   function(_role) { return true; }, // not role-gated, QA tooling
  },
  {
    feature: 'BP07-F: Viewport report — viewport-report.js',
    desc:    'Generates tests/enterprise/viewport-report.txt',
    check:   function(_role) { return true; },
  },
  {
    feature: 'BP07-F: Feature matrix — feature-matrix.js',
    desc:    'Generates tests/enterprise/feature-matrix.md',
    check:   function(_role) { return true; },
  },
];

// ── Build markdown table
const header = ['Feature', 'Description', ...ROLES].join(' | ');
const sep    = ['---', '---', ...ROLES.map(function() { return '---'; })].join(' | ');

const rows = FEATURES.map(function(f) {
  const cells = ROLES.map(function(role) {
    return f.check(role) ? '✅' : '—';
  });
  return [f.feature, f.desc, ...cells].join(' | ');
});

const now = new Date().toISOString();

const md = [
  '# BP07 Feature Matrix',
  '',
  '> Generated: ' + now,
  '> Source: `scripts/enterprise/feature-matrix.js`',
  '',
  '## Role Legend',
  '',
  '| Role | Description |',
  '| --- | --- |',
  '| `owner` | Propriétaire — full access |',
  '| `admin` | Administrateur — full access |',
  '| `operations_manager` | Resp. opérations — can confirm |',
  '| `site_manager` | Resp. site — can confirm |',
  '| `reporter` | Déclarant — can create, cannot confirm |',
  '| `viewer` | Observateur — read only |',
  '',
  '## Feature Access Matrix',
  '',
  header,
  sep,
  ...rows,
  '',
  '## Notes',
  '',
  '- ✅ = accessible / enabled for this role',
  '- — = not available for this role',
  '- Conditional features (e.g. "Valider button") require both the role permission AND runtime data conditions (e.g. completed count > 0).',
  '- BP07-F QA tooling scripts are not role-gated — they run in the CI/QA environment.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, md, 'utf8');

console.log('[feature-matrix] Written:', OUT_FILE);
console.log('[feature-matrix] Features:', FEATURES.length, '| Roles:', ROLES.length);
