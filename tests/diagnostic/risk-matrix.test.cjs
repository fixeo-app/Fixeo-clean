'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../../api/diagnostic/engine');
const { evaluateSafety, RISK_VERSION } = require('../../api/diagnostic/safety');
const { TRADES } = require('../../api/diagnostic/contract');
const fixture = (trade) => ({
  trade,
  problem: 'Situation à vérifier par un professionnel.',
  observations: [],
  hypotheses: [],
  urgency: 'moderate',
  urgency_reason: 'Contrôle professionnel recommandé.',
  checks: [],
  possible_parts: [],
  question_ids: [],
  safety_signals: [],
});
const matrix = [
  [
    'électricité',
    'Prise cassée avec un fil apparent.',
    'electricite',
    'URGENT',
  ],
  [
    'électricité',
    'Des étincelles actives sortent de la prise.',
    'electricite',
    'CRITICAL',
  ],
  ['plomberie', 'Petite fuite sous le lavabo.', 'plomberie', 'TECHNICAL'],
  ['plomberie', 'Grosse fuite maîtrisable.', 'plomberie', 'URGENT'],
  ['plomberie', 'Une fuite importante est contenue.', 'plomberie', 'URGENT'],
  ['plomberie', 'Une fuite incontrôlable.', 'plomberie', 'CRITICAL'],
  [
    'plomberie/électricité',
    'Eau en contact avec l’installation électrique.',
    'electricite',
    'CRITICAL',
  ],
  [
    'gaz',
    'Appareil à gaz en panne, pas de fuite de gaz.',
    'plomberie',
    'TECHNICAL',
  ],
  ['gaz', 'Odeur de gaz près de la chaudière.', 'plomberie', 'CRITICAL'],
  ['serrurerie', 'Serrure bloquée.', 'serrurerie', 'TECHNICAL'],
  [
    'serrurerie',
    'Serrure bloquée, danger immédiat explicite.',
    'serrurerie',
    'CRITICAL',
  ],
  ['climatisation', 'Clim en panne.', 'climatisation', 'TECHNICAL'],
  [
    'climatisation',
    'Une fumée active sort de la climatisation.',
    'climatisation',
    'CRITICAL',
  ],
  ['maçonnerie', 'Une fissure simple sur le mur.', 'maconnerie', 'TECHNICAL'],
  ['maçonnerie', 'Une fissure s’agrandit.', 'maconnerie', 'URGENT'],
  ['structure', 'Effondrement en cours.', 'maconnerie', 'CRITICAL'],
  ['toiture', 'Petite infiltration de la toiture.', 'maconnerie', 'TECHNICAL'],
  ['toiture', 'Toiture avec infiltration importante.', 'maconnerie', 'URGENT'],
  ['toiture', 'Des tuiles menacent de tomber.', 'maconnerie', 'CRITICAL'],
  ['chauffage', 'Chauffage en panne.', 'climatisation', 'TECHNICAL'],
  [
    'chauffage',
    'Chauffage en panne avec fumée active.',
    'climatisation',
    'CRITICAL',
  ],
  ['chauffe-eau', 'Chauffe-eau en panne.', 'plomberie', 'TECHNICAL'],
  // No new appliance/pricing trade: unknown specialities retain the existing autre route.
  ['électroménager / autre', 'Un lave-linge en panne.', 'autre', 'TECHNICAL'],
  [
    'électroménager / autre',
    'Un lave-linge avec fumée active.',
    'autre',
    'CRITICAL',
  ],
];
for (const [family, description, trade, level] of matrix)
  test(`risk matrix: ${family} — ${description} → ${level}`, async () => {
    const { result, providerCalled } = await analyze(
      { input: { description, answers: {}, safety_signals: [] }, media: [] },
      {
        provider: {
          analyze: async () => ({ result: fixture(trade), usage: {} }),
        },
        mediaStore: {},
      },
    );
    assert.equal(result.safety.version, RISK_VERSION);
    assert.equal(result.safety.level, level);
    assert.equal(result.safety.stop, level === 'CRITICAL');
    assert.equal(result.safety.safety_cleared, false);
    assert.equal(result.trade.value, trade);
    assert.equal(
      result.next,
      level === 'CRITICAL' ? 'safety_stop' : 'qualification',
    );
    assert.equal(providerCalled, level !== 'CRITICAL');
    assert.equal(
      result.urgency.value,
      { TECHNICAL: 'moderate', URGENT: 'high', CRITICAL: 'critical' }[level],
    );
    assert.equal(
      result.safety.urgency,
      { TECHNICAL: 'normale', URGENT: 'urgent', CRITICAL: 'now' }[level],
    );
    assert.equal(result.safety.messages.length > 0, result.safety.signals.length > 0);
    if (!result.safety.signals.length) assert.deepEqual(result.safety.messages, []);
  });

for (const trade of TRADES)
  for (const [urgency, level] of [
    ['moderate', 'TECHNICAL'],
    ['high', 'URGENT'],
    ['critical', 'CRITICAL'],
  ]) {
    test(`severity is independent of trade: ${trade} / ${level}`, () => {
      const safety = evaluateSafety(
        { description: 'Besoin professionnel.' },
        { ...fixture(trade), urgency },
      );
      assert.equal(safety.level, level);
      assert.equal(safety.stop, level === 'CRITICAL');
      assert.equal(safety.safety_cleared, false);
    });
  }

test('a controlled leak never cancels a different active danger or uncertainty', () => {
  for (const description of [
    'Grosse fuite maîtrisable ?',
    'Grosse fuite non maîtrisable.',
    'Grosse fuite maîtrisable. Fuite incontrôlable ailleurs.',
    'Grosse fuite maîtrisable mais des étincelles actives.',
    'Grosse fuite maîtrisable. Odeur de gaz.',
    'Fuite importante contenue. De l’eau en contact avec une prise.',
    'Fuite importante peut-être maîtrisée.',
  ])
    assert.equal(
      evaluateSafety({ description }).level,
      'CRITICAL',
      description,
    );
  // Never reinterpret an old recorded major leak as controlled.
  assert.equal(
    evaluateSafety({ description: 'Grosse fuite maîtrisable.' }, null, [
      'major_leak',
    ]).level,
    'CRITICAL',
  );
});

test('critical guidance contains no technical handling instruction even when urgent evidence is also present', () => {
  const safety = evaluateSafety({ description: 'Un fil apparent avec des flammes.' });
  assert.equal(safety.level, 'CRITICAL');
  assert.ok(safety.signals.includes('electrical_risk'));
  assert.doesNotMatch(safety.messages.join(' '), /coupez|démontez|réparez/i);
  assert.match(safety.messages.join(' '), /services d’urgence/);
});

test('Fès blocked door since today: qualified trade, no artificial urgency, warning or surface questions', async () => {
  const { result } = await analyze({
    city_slug: 'fes', media: [],
    input: { description: 'Ma porte est bloquée depuis aujourd’hui.', answers: {}, safety_signals: [] },
  }, {
    provider: { analyze: async () => ({ result: {
      ...fixture('serrurerie'), problem: 'Porte bloquée',
      question_ids: ['onset', 'affected_area', 'occurrence'],
    }, usage: {} }) }, mediaStore: {},
  });
  assert.equal(result.trade.value, 'serrurerie');
  assert.equal(result.safety.level, 'TECHNICAL');
  assert.equal(result.urgency.value, 'moderate');
  assert.equal(result.safety.stop, false);
  assert.equal(result.safety.safety_cleared, false);
  for (const values of [result.safety.signals, result.safety.messages, result.checks, result.questions])
    assert.deepEqual(values, []);
  assert.equal(result.next, 'qualification');
});

test('business priority without hazard evidence retains its urgency but never invents danger advice', () => {
  const result = evaluateSafety({ description: 'Besoin professionnel.' }, {
    ...fixture('serrurerie'), urgency: 'high',
  });
  assert.equal(result.level, 'URGENT');
  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.messages, []);
  assert.equal(result.safety_cleared, false);
});

test('a blocked door never suppresses an actual, declared, model or previously recorded hazard', () => {
  const input = { description: 'Ma porte est bloquée depuis aujourd’hui.' };
  for (const [text, signal] of [
    ['Une odeur de gaz.', 'gas'], ['De la fumée.', 'fire'],
    ['Des flammes.', 'fire'], ['Des étincelles.', 'electricity'],
    ['Une inondation.', 'flood'], ['Une fuite incontrôlable.', 'major_leak'],
    ['Un effondrement.', 'structure'], ['Un danger immédiat.', 'immediate_danger'],
  ]) {
    for (const result of [
      evaluateSafety({ description: input.description + ' ' + text }),
      evaluateSafety({ ...input, safety_signals: [signal] }),
      evaluateSafety(input, { ...fixture('serrurerie'), safety_signals: [signal] }),
      evaluateSafety(input, null, [signal]),
    ]) {
      assert.equal(result.level, 'CRITICAL', signal);
      assert.equal(result.stop, true, signal);
      assert(result.signals.includes(signal));
      assert(result.messages.length > 0);
      assert.equal(result.safety_cleared, false);
    }
  }
  for (const signal of ['electrical_risk', 'technical_urgency']) {
    const result = evaluateSafety(input, null, [signal]);
    assert.equal(result.level, 'URGENT');
    assert(result.messages.length > 0, 'no silent rewrite of historical evidence');
  }
});
