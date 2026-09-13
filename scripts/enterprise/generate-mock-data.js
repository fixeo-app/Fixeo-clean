#!/usr/bin/env node
/**
 * BP07-F: Generate deterministic mock dataset for enterprise dashboard tests.
 * Output: tests/enterprise/mock-data.json
 */
'use strict';

const path = require('path');
const fs   = require('fs');

// ── Deterministic IDs (no Math.random)
const ENT1_ID = 'ent-0001-0000-0000-000000000001';
const ENT2_ID = 'ent-0002-0000-0000-000000000002';

const SITES = [
  { id: 'site-0001', enterprise_id: ENT1_ID, name: 'Siège Paris',      city: 'Paris',      country: 'FR' },
  { id: 'site-0002', enterprise_id: ENT1_ID, name: 'Entrepôt Lyon',    city: 'Lyon',       country: 'FR' },
  { id: 'site-0003', enterprise_id: ENT1_ID, name: 'Bureau Marseille', city: 'Marseille',  country: 'FR' },
  { id: 'site-0004', enterprise_id: ENT2_ID, name: 'HQ Bordeaux',      city: 'Bordeaux',   country: 'FR' },
  { id: 'site-0005', enterprise_id: ENT2_ID, name: 'Atelier Nantes',   city: 'Nantes',     country: 'FR' },
  { id: 'site-0006', enterprise_id: ENT2_ID, name: 'Dépôt Lille',      city: 'Lille',      country: 'FR' },
];

const MEMBERS = [
  { id: 'mem-0001', enterprise_id: ENT1_ID, user_id: 'user-0001', role: 'owner',              email: 'owner@example.com',   name: 'Alice Dupont' },
  { id: 'mem-0002', enterprise_id: ENT1_ID, user_id: 'user-0002', role: 'admin',              email: 'admin@example.com',   name: 'Bob Martin' },
  { id: 'mem-0003', enterprise_id: ENT1_ID, user_id: 'user-0003', role: 'operations_manager', email: 'ops@example.com',     name: 'Clara Bernard' },
  { id: 'mem-0004', enterprise_id: ENT1_ID, user_id: 'user-0004', role: 'site_manager',       email: 'sitemgr@example.com', name: 'David Leroy' },
  { id: 'mem-0005', enterprise_id: ENT1_ID, user_id: 'user-0005', role: 'reporter',           email: 'reporter@example.com',name: 'Eve Moreau' },
];

const STATUSES   = ['new', 'assigned', 'in_progress', 'completed', 'validated', 'cancelled', 'no_match'];
const URGENCIES  = ['now', 'urgent', 'normale', 'normale', 'normale']; // weight toward normale
const CATEGORIES = ['Plomberie', 'Électricité', 'Climatisation', 'Serrurerie', 'Peinture', 'Menuiserie', 'Nettoyage', 'Sécurité'];

// Deterministic date generator
function isoDate(daysAgo, hourOffset) {
  const d = new Date('2026-09-13T12:00:00.000Z');
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - (hourOffset || 0));
  return d.toISOString();
}

// Build 20 requests deterministically
const REQUESTS = [];
for (let i = 0; i < 20; i++) {
  const site       = SITES[i % SITES.length];
  const status     = STATUSES[i % STATUSES.length];
  const urgency    = URGENCIES[i % URGENCIES.length];
  const category   = CATEGORIES[i % CATEGORIES.length];
  const daysAgo    = i * 2;        // spread across time
  const updatedAgo = Math.max(0, daysAgo - 1);

  REQUESTS.push({
    id:                   'req-' + String(i + 1).padStart(4, '0'),
    enterprise_id:        site.enterprise_id,
    enterprise_site_id:   site.id,
    status,
    urgency,
    category,
    description:          'Intervention de type ' + category + ' sur le site ' + site.name + '.',
    created_at:           isoDate(daysAgo, 0),
    updated_at:           isoDate(updatedAgo, 2),
    artisan_id:           (status === 'assigned' || status === 'in_progress') ? 'artisan-' + String((i % 3) + 1).padStart(4, '0') : null,
  });
}

// Build 10 history entries
const HISTORY = [];
const HIST_EVENTS = ['status_changed', 'assigned', 'validated', 'comment_added', 'created'];
for (let i = 0; i < 10; i++) {
  HISTORY.push({
    id:          'hist-' + String(i + 1).padStart(4, '0'),
    request_id:  REQUESTS[i % REQUESTS.length].id,
    enterprise_id: ENT1_ID,
    event_type:  HIST_EVENTS[i % HIST_EVENTS.length],
    actor_id:    MEMBERS[i % MEMBERS.length].user_id,
    actor_name:  MEMBERS[i % MEMBERS.length].name,
    payload:     { note: 'Événement de test n°' + (i + 1) },
    created_at:  isoDate(i, i),
  });
}

const ENTERPRISES = [
  { id: ENT1_ID, name: 'Entreprise Alpha', plan: 'pro',   created_at: isoDate(365) },
  { id: ENT2_ID, name: 'Entreprise Beta',  plan: 'basic', created_at: isoDate(180) },
];

const dataset = {
  _meta: {
    generated_at:    new Date().toISOString(),
    generator:       'scripts/enterprise/generate-mock-data.js',
    description:     'Deterministic mock dataset for BP07 QA tests',
    counts: {
      enterprises: ENTERPRISES.length,
      sites:       SITES.length,
      members:     MEMBERS.length,
      requests:    REQUESTS.length,
      history:     HISTORY.length,
    },
  },
  enterprises: ENTERPRISES,
  sites:        SITES,
  members:      MEMBERS,
  requests:     REQUESTS,
  history:      HISTORY,
};

const outDir  = path.join(__dirname, '../../tests/enterprise');
const outFile = path.join(outDir, 'mock-data.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(dataset, null, 2), 'utf8');

console.log('[generate-mock-data] Written:', outFile);
console.log('[generate-mock-data] Counts  :', JSON.stringify(dataset._meta.counts));
