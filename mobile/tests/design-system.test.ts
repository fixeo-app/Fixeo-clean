import assert from 'node:assert/strict';
import test from 'node:test';
import { colors, spacing, radius, type, motion, semanticColors as c, typography, interaction, motionTokens, rafiMotionTokens } from '../ui/tokens';
import { getScreenMetrics } from '../ui/screenMetrics';
import { createMotionPreferenceStore, resolveMotion } from '../ui/motionContract';
import { getInteractionStyle, resolveActionState } from '../ui/interactionContract';

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('DS2 retains every P1–P7 token value while new screens opt into semantic roles', () => {
  assert.deepEqual(colors, {
    ink: '#0B0B0C', inkSoft: '#2A2A2D', paper: '#F7F7F5', surface: '#FFFFFF', surfaceMuted: '#F0F0EE',
    line: '#E2E2DE', text: '#0B0B0C', textMuted: '#6C6C70', inverse: '#FFFFFF',
    success: '#17643A', warning: '#8A5A00', danger: '#A92D28',
  });
  assert.deepEqual(spacing, { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 });
  assert.deepEqual(radius, { sm: 12, md: 18, lg: 24, xl: 30, pill: 999 });
  assert.deepEqual(type, { eyebrow: 12, body: 16, bodyLarge: 18, title: 32, display: 42 });
  assert.deepEqual(motion, { fast: 160, normal: 240, slow: 520 });
});

test('DS2 supported foreground/surface pairings preserve readable contrast', () => {
  for (const background of [c.background.canvas, c.background.surface, c.background.subtle]) {
    for (const foreground of [c.text.primary, c.text.secondary, c.text.tertiary]) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
    }
  }
  for (const foreground of [c.text.inverse, c.text.inverseSecondary]) assert.ok(contrast(foreground, c.background.focus) >= 4.5);
  for (const status of Object.values(c.status)) assert.ok(contrast(status.text, status.surface) >= 4.5);
  assert.ok(contrast(c.text.inverse, c.status.danger.text) >= 4.5);
  assert.ok(contrast(c.interaction.selectedText, c.interaction.selected) >= 4.5);
  for (const surface of [c.background.canvas, c.background.surface, c.background.focus]) assert.ok(contrast(c.border.focus, surface) >= 3);
});

test('DS2 typography reserves readable line height and moderate emphasis', () => {
  for (const style of Object.values(typography)) {
    assert.ok(style.lineHeight >= style.fontSize * 1.1);
    assert.ok(Number(style.fontWeight) <= 600);
  }
  assert.ok(interaction.minTarget >= 48);
});

test('screen metrics preserve portrait padding, protect side cutouts and reserve floating controls once', () => {
  const portrait = { top: 44, bottom: 34, left: 0, right: 0 };
  assert.deepEqual(getScreenMetrics(portrait), { paddingTop: 44, paddingBottom: 34, paddingLeft: 22, paddingRight: 22, floatingBottom: 46 });
  assert.equal(getScreenMetrics(portrait, { padded: false }).paddingLeft, 0);
  assert.equal(getScreenMetrics({ ...portrait, left: 44 }, { padded: false }).paddingLeft, 44);
  const floating = getScreenMetrics(portrait, { floatingHeight: 80, keyboardOverlap: 300 });
  assert.equal(floating.floatingBottom, 312);
  assert.equal(floating.paddingBottom, 404);
  assert.equal(getScreenMetrics(portrait, { keyboardOverlap: 300 }).paddingBottom, 300);
  assert.equal(getScreenMetrics(portrait, { floatingHeight: -1, keyboardOverlap: NaN }).paddingBottom, 34);
});

test('busy and disabled states cannot be weakened by accessibility overrides', () => {
  for (const state of [resolveActionState(true), resolveActionState(false, true), resolveActionState(false, false, undefined, { busy: true }), resolveActionState(false, false, undefined, { disabled: true })]) {
    assert.equal(state.blocked, true);
    assert.equal(state.accessibilityState.disabled, true);
  }
  const state = resolveActionState(false, true, false, { disabled: false, busy: false, selected: true });
  assert.equal(state.accessibilityState.busy, true);
  assert.equal(state.accessibilityState.selected, false);
  assert.equal(resolveActionState().blocked, false);
});

test('reduced motion retains press feedback without spatial transform; disabled never presses', () => {
  const state = { pressed: true, focused: false, disabled: false, reduceMotion: true };
  assert.equal(getInteractionStyle(state).transform, undefined);
  const opacity = getInteractionStyle(state).opacity;
  assert.ok(typeof opacity === 'number' && opacity < 1);
  assert.equal(getInteractionStyle({ ...state, disabled: true }).opacity, 1);
  assert.equal(getInteractionStyle({ ...state, focused: true }).borderColor, c.border.focus);
});

test('all motion presets remove both duration and orchestration delay under Reduced Motion', () => {
  for (const name of Object.keys(motionTokens) as (keyof typeof motionTokens)[]) {
    const timing = resolveMotion(name, true, 200);
    assert.equal(timing.duration, 0);
    assert.equal(timing.delay, 0);
  }
  assert.equal(resolveMotion('reveal', false, -1).delay, 0);
  assert.equal(resolveMotion('reveal', false, NaN).delay, 0);
  assert.equal(rafiMotionTokens.reduced, 'static');
});

test('motion preference shares one native subscription, defaults static and releases it', async () => {
  let reads = 0; let starts = 0; let stops = 0;
  let change = (_value: boolean) => {};
  const store = createMotionPreferenceStore({
    read: async () => { reads++; return false; },
    listen: listener => { starts++; change = listener; return () => { stops++; }; },
  });
  assert.equal(store.getSnapshot(), true);
  assert.equal(store.getServerSnapshot(), true);
  const unsubscribeA = store.subscribe(() => {});
  const unsubscribeB = store.subscribe(() => {});
  await Promise.resolve();
  assert.equal(store.getSnapshot(), false);
  assert.equal(starts, 1); assert.equal(reads, 1);
  change(true); assert.equal(store.getSnapshot(), true);
  unsubscribeA(); assert.equal(stops, 0);
  unsubscribeB(); assert.equal(stops, 1);
});

test('late preference read cannot override a newer native event or an unmounted generation', async () => {
  let resolveRead!: (value: boolean) => void;
  let change = (_value: boolean) => {};
  const store = createMotionPreferenceStore({
    read: () => new Promise(resolve => { resolveRead = resolve; }),
    listen: listener => { change = listener; return () => {}; },
  });
  const unsubscribe = store.subscribe(() => {});
  change(true); resolveRead(false); await Promise.resolve();
  assert.equal(store.getSnapshot(), true);
  unsubscribe();
  const next = store.subscribe(() => {});
  next(); resolveRead(false); await Promise.resolve();
  assert.equal(store.getSnapshot(), true);
});

test('preference read failures leave content static and visible', async () => {
  const store = createMotionPreferenceStore({ read: async () => { throw new Error('unavailable'); }, listen: () => () => {} });
  const unsubscribe = store.subscribe(() => {});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(store.getSnapshot(), true);
  unsubscribe();
});
