import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RAFI_STATE, canonicalRafiState, rafiActionState, rafiIntersectsViewport, getClientRafiPresence } from '../ui/rafiPresence';
import { getRafiOrbMotion } from '../ui/rafiOrbMotion';

test('Living Sphere uses six canonical states, with legacy aliases and real action outcomes', () => {
  assert.deepEqual(Object.values(RAFI_STATE), ['idle','listening','thinking','speaking','success','attention']);
  for (const state of Object.values(RAFI_STATE)) assert.equal(canonicalRafiState(state), state);
  for (const alias of ['working','understanding','matching'] as const) assert.equal(canonicalRafiState(alias),'thinking');
  assert.equal(rafiActionState(false,false,0),'idle');
  assert.equal(rafiActionState(true,false,0),'thinking');
  assert.equal(rafiActionState(false,true,0),'attention');
  assert.equal(rafiActionState(true,true,0),'thinking');
  assert.equal(rafiActionState(false,false,1),'success');
  assert.equal(getClientRafiPresence({override:'success',loopState:'creating'}),'working');
  assert.equal(getClientRafiPresence({override:'success',loopState:'error'}),'attention');
});
test('Living Sphere keeps compact calm, attention quieter, and reduced motion light-only', () => {
  const hero=getRafiOrbMotion('idle',156),compact=getRafiOrbMotion('idle',44),auth=getRafiOrbMotion('idle',156,false,true);
  assert.ok(hero.coreScale[1]<=1.01); assert.ok(compact.coreScale[1]<hero.coreScale[1]);
  assert.ok(auth.coreScale[1]<hero.coreScale[1]);
  assert.ok(getRafiOrbMotion('attention').haloOpacity[1]<hero.haloOpacity[1]);
  for(const state of Object.values(RAFI_STATE)) {
    const motion=getRafiOrbMotion(state,156,true);
    assert.deepEqual(motion.coreScale,[1,1]);assert.deepEqual(motion.haloScale,[1,1]);
    assert.equal(motion.lift,0);assert.equal(motion.reflection,0);assert.equal(motion.orbitDuration,0);
    assert.ok(motion.haloOpacity[1]-motion.haloOpacity[0]<=0.026);
  }
});
test('Living Sphere visibility excludes clipped/offscreen content and invalid measurements', () => {
  assert.equal(rafiIntersectsViewport(100,100,80,700),true);
  assert.equal(rafiIntersectsViewport(0,50,80,700),false);
  assert.equal(rafiIntersectsViewport(720,100,80,700),false);
  assert.equal(rafiIntersectsViewport(650,100,80,700),true);
  assert.equal(rafiIntersectsViewport(NaN,100,80,700),false);
  assert.equal(rafiIntersectsViewport(100,0,80,700),false);
});
test('Living Sphere preserves exact master pixels and static material renderer', () => {
  const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(hash('assets/rafi/rafi-master-core-v1.png'),'b08ce64b07953205c03317e08737ce9dbfef7aeec79179792d8820833c3311d6');
  assert.equal(hash('ui/RafiCoreMaterial.tsx'),'0a83af51a461a169c20d84bd57fe0cd91e626c3b77316b5afe259352b6786544');
});
