import assert from 'node:assert/strict';
import test from 'node:test';
import { getRafiOrbAccessibilityLabel, getRafiOrbMotion } from '../ui/rafiOrbMotion';
import { RAFI_STATES, RAFI_LABELS, fromLegacyRafiMode, getRafiGeometry,
  getClientRafiPresence, getArtisanRafiPresence, createRafiSuccessLatch, createRafiActivityStore } from '../ui/rafiPresence';
import { readFileSync } from 'node:fs';
import { rafiMotionTokens } from '../ui/tokens';

test('W3 eight semantic states and French labels are exhaustive; legacy calls retain identity', () => {
  assert.deepEqual(RAFI_STATES, ['idle', 'listening', 'understanding', 'working', 'matching', 'intervention', 'success', 'attention']);
  assert.deepEqual(Object.values(RAFI_LABELS), ['RAFI est prêt', 'RAFI écoute', 'RAFI comprend votre demande', 'RAFI travaille', 'FIXEO recherche un artisan', 'Intervention en cours', 'RAFI a terminé cette étape', 'Une action demande votre attention']);
  for (const state of RAFI_STATES) {
    assert.equal(getRafiOrbAccessibilityLabel(state), RAFI_LABELS[state]);
    const motion = getRafiOrbMotion(state);
    for (const pair of [motion.coreScale, motion.haloScale, motion.signatureScale, motion.haloOpacity]) {
      assert.ok(pair.every(value => Number.isFinite(value) && value > 0));
    }
    assert.ok(motion.haloOpacity.every(value => value <= 1));
    assert.equal(motion.orbitDuration > 0, state === 'matching');
  }
  for (const mode of ['idle', 'listening', 'working', 'success'] as const) assert.equal(fromLegacyRafiMode(mode), mode);
  assert.ok(getRafiOrbMotion('working').breathDuration < getRafiOrbMotion('listening').breathDuration);
  assert.ok(getRafiOrbMotion('listening').breathDuration < getRafiOrbMotion('idle').breathDuration);
  assert.equal(rafiMotionTokens.completion.delay, 0);
});

test('W3 client maps only known facts, keeps creation distinct from matching and validation from success', () => {
  assert.equal(getClientRafiPresence({}), 'idle');
  assert.equal(getClientRafiPresence({ override: 'listening', journeyStatus: 'matching' }), 'listening');
  assert.equal(getClientRafiPresence({ photoDiagnosticBusy: true }), 'understanding');
  assert.equal(getClientRafiPresence({ override: 'understanding' }), 'understanding');
  assert.equal(getClientRafiPresence({ loopState: 'creating', journeyStatus: 'matching' }), 'working');
  assert.equal(getClientRafiPresence({ loopState: 'matching' }), 'matching');
  assert.equal(getClientRafiPresence({ journeyStatus: 'assigned' }), 'success');
  assert.equal(getClientRafiPresence({ journeyStatus: 'in_progress' }), 'intervention');
  assert.equal(getClientRafiPresence({ journeyStatus: 'completed' }), 'attention');
  assert.equal(getClientRafiPresence({ loopState: 'error' }), 'attention');
  assert.equal(getClientRafiPresence({ safetyStop: true }), 'attention');
  assert.equal(getClientRafiPresence({ journeyStatus: 'unknown' }), 'idle');
});

test('W3 artisan derives priorities from the actual mission, offers, acceptance and load-error inputs', () => {
  assert.equal(getArtisanRafiPresence({ offersCount: 0 }), 'idle');
  assert.equal(getArtisanRafiPresence({ offersCount: 1 }), 'attention');
  assert.equal(getArtisanRafiPresence({ offersCount: 1, accepting: true }), 'working');
  assert.equal(getArtisanRafiPresence({ missionStatus: 'in_progress', offersCount: 3 }), 'intervention');
  assert.equal(getArtisanRafiPresence({ missionStatus: 'assigned', offersCount: 3 }), 'attention');
  assert.equal(getArtisanRafiPresence({ missionStatus: 'completed', offersCount: 0 }), 'attention');
  assert.equal(getArtisanRafiPresence({ missionStatus: 'validated', offersCount: 0 }), 'idle');
  assert.equal(getArtisanRafiPresence({ offersCount: 0, loadError: true }), 'attention');
});

test('success is consumed once, never replayed by polling, focus, or Reduced Motion changes', () => {
  const latch = createRafiSuccessLatch();
  assert.equal(latch.enter('success', 'mission-a', true), true);
  for (const active of [true, false, true]) assert.equal(latch.enter('success', 'mission-a', active), false);
  assert.equal(latch.enter('success', 'mission-b', true), true);
  assert.equal(latch.enter('working', '', true), false);
  assert.equal(latch.enter('success', 'mission-c', false), false);
  assert.equal(latch.enter('success', 'mission-c', true), false);
});

test('all sizes and motion peaks stay within frame; compact fits unchanged W2 56px host', () => {
  assert.equal(getRafiGeometry(44).frame, 55);
  for (const requested of [NaN, Infinity, -1, 0, 32, 44, 52, 58, 76, 96, 128, 192, 500]) {
    const geometry = getRafiGeometry(requested);
    assert.ok(Number.isFinite(geometry.frame));
    assert.ok(geometry.size >= 32 && geometry.size <= 192);
    for (const state of RAFI_STATES) {
      const profile = getRafiOrbMotion(state);
      const peak = geometry.compact ? 1 : Math.max(...profile.haloScale);
      assert.ok(geometry.halo * peak <= geometry.frame);
      assert.ok(geometry.size * Math.max(...profile.coreScale) <= geometry.frame);
    }
  }
});

test('activity shares one native listener and cleans up the last subscriber', () => {
  let starts = 0, stops = 0, updates = 0;
  let change = (_value: boolean) => {};
  const store = createRafiActivityStore({ read: () => true, listen: listener => { starts++; change = listener; return () => { stops++; }; } });
  assert.equal(store.getServerSnapshot(), false);
  const a = store.subscribe(() => updates++), b = store.subscribe(() => updates++);
  assert.equal(starts, 1); assert.equal(store.getSnapshot(), true);
  change(false); assert.equal(store.getSnapshot(), false); assert.equal(updates, 2);
  change(false); assert.equal(updates, 2);
  a(); assert.equal(stops, 0); b(); assert.equal(stops, 1);
  assert.equal(store.getSnapshot(), false);
});

test('presence engine has no backend or per-frame React side effects; visual material is centralized', () => {
  const renderer = readFileSync('ui/RafiOrb.tsx', 'utf8');
  const engine = readFileSync('ui/rafiPresence.ts', 'utf8');
  assert.doesNotMatch(renderer + engine, /fetch\(|supabase|triggerFixeoFeedback|setInterval\(|requestAnimationFrame\(/);
  assert.doesNotMatch(renderer, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.match(renderer, /useNativeDriver: true/);
  assert.match(renderer, /isInteraction: false/);
  assert.match(renderer, /animation\.stop\(\)/);
});

test('W3 keeps the certified Evidence capture engine byte-identical through W5', async () => {
  const { createHash } = await import('node:crypto');
  const protectedFiles = {
    // W4 owns Client presentation. Its workflow callbacks and all services are
    // separately frozen against the W3 base in client-invariants.test.ts.
    'components/MissionEvidenceCapture.tsx': '604b4489f5ae71c576277bebd4f2368a1c70b9a4872e27167b907303f3fdd2dd',
  };
  for (const [file, digest] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), digest, file);
});
