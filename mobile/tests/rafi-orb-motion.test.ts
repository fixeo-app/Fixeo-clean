import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRafiOrbAccessibilityLabel,
  getRafiOrbMotion,
} from '../ui/rafiOrbMotion';

test('RAFI orb modes keep a deterministic motion hierarchy', () => {
  const idle = getRafiOrbMotion('idle');
  const listening = getRafiOrbMotion('listening');
  const working = getRafiOrbMotion('working');
  const success = getRafiOrbMotion('success');

  assert.ok(working.breathDuration < listening.breathDuration);
  assert.ok(listening.breathDuration < idle.breathDuration);
  assert.ok(working.orbitDuration < listening.orbitDuration);
  assert.ok(success.haloScale[1] > idle.haloScale[1]);
});

test('RAFI orb accessibility labels describe the current state', () => {
  assert.equal(getRafiOrbAccessibilityLabel('idle'), 'RAFI prêt');
  assert.equal(getRafiOrbAccessibilityLabel('listening'), 'RAFI écoute');
  assert.equal(getRafiOrbAccessibilityLabel('working'), 'RAFI analyse');
  assert.equal(getRafiOrbAccessibilityLabel('success'), 'RAFI a terminé');
});
