import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { assertDrawerOpen } = createRequire(import.meta.url)('./fixtures/drawer-visual-assertions.cjs');

function opened(width = 390) {
  return {
    viewport: {width, height: 844}, panel: {x: 0, y: 0, width: Math.min(width - 24, 390), height: 844, visible: true},
    transform: [1, 0, 0, 1, 0, 0], selected: {visible: true}, close: {visible: true},
    horizontalOverflow: false, criticalOverflow: [],
  };
}
test('W2 Drawer capture accepts final geometry and the 390px width cap', () => {
  for (const width of [320, 390, 844]) assert.doesNotThrow(() => assertDrawerOpen(opened(width)));
});
test('W2 Drawer capture rejects mounted controls while the panel is off-screen or moving', () => {
  for (const x of [-366, -358.7, -350, -1]) {
    const geometry = opened(); geometry.panel.x = x; geometry.transform[4] = x;
    assert.throws(() => assertDrawerOpen(geometry), /fully on-screen/);
  }
  const transformed = opened(); transformed.transform[4] = -0.001;
  assert.throws(() => assertDrawerOpen(transformed), /final identity/);
});
test('W2 Drawer capture rejects wrong width, hidden critical controls and overflow', () => {
  const width = opened(); width.panel.width = 350;
  assert.throws(() => assertDrawerOpen(width), /width/);
  for (const key of ['panel', 'selected', 'close'] as const) {
    const geometry = opened(); geometry[key].visible = false;
    assert.throws(() => assertDrawerOpen(geometry), /visible/);
  }
  assert.throws(() => assertDrawerOpen({...opened(), horizontalOverflow: true}), /overflow/);
  assert.throws(() => assertDrawerOpen({...opened(), criticalOverflow: ['Selected label']}), /overflow/);
});
