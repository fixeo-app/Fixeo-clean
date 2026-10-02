import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeclaredContext, RAFI_PROVENANCE_LABELS } from '../lib/rafiContext';

test('RAFI keeps manual problem and city as user-declared facts', () => {
  const value = buildDeclaredContext({
    description: 'Fuite sous évier',
    city: 'Fès',
    serviceCategory: 'Plomberie',
    serviceConfidence: 'high',
  });

  assert.deepEqual(value.facts, [
    {
      label: 'Problème',
      value: 'Fuite sous évier',
      provenance: 'user_declared',
      confidence: 'high',
    },
    {
      label: 'Ville',
      value: 'Fès',
      provenance: 'user_declared',
      confidence: 'high',
    },
  ]);

  assert.equal(
    value.facts.some(fact => fact.label === 'Métier pressenti'),
    false,
    'local category inference must not be mislabeled as user-declared',
  );
});

test('RAFI preserves explicit user confirmation of an AI-assisted description', () => {
  const value = buildDeclaredContext({
    description: 'Raccord de siphon possiblement fuyard',
    descriptionProvenance: 'user_confirmed',
    city: 'Rabat',
  });

  assert.equal(value.facts[0]?.provenance, 'user_confirmed');
  assert.equal(RAFI_PROVENANCE_LABELS.user_confirmed, 'Confirmé');
});

test('RAFI context omits empty facts', () => {
  const value = buildDeclaredContext({
    description: '   ',
    city: null,
  });

  assert.deepEqual(value.facts, []);
  assert.deepEqual(value.safetySignals, []);
});
