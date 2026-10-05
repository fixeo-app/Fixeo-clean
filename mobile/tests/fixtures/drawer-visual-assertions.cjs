const assert = require('node:assert/strict');

// Test-side DOM observation only: no product test hooks or animation overrides.
function measureDrawer(panel) {
  const rect = el => {
    const {x, y, width, height} = el.getBoundingClientRect();
    return {x, y, width, height};
  };
  const visible = el => {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let parent = el; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
      if (parent !== el && /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
      }
      if (parent !== el && /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
      }
    }
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.left >= left - 0.5 && box.right <= right + 0.5 &&
      box.top >= top - 0.5 && box.bottom <= bottom + 0.5 && !!hit && el.contains(hit);
  };
  const critical = el => el && ({label: el.getAttribute('aria-label'), ...rect(el), visible: visible(el)});
  const transform = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
  const bounds = panel.getBoundingClientRect();
  const overflow = [...panel.querySelectorAll('[dir="auto"], [role="button"]')].filter(el => {
    const box = el.getBoundingClientRect();
    return box.left < bounds.left - 1 || box.right > bounds.right + 1 ||
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }).map(el => el.getAttribute('aria-label') || el.textContent);
  return {
    viewport: {width: innerWidth, height: innerHeight}, panel: {...rect(panel), visible: visible(panel)},
    transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
    selected: critical(panel.querySelector('[role="button"][aria-selected="true"]')),
    close: critical(panel.querySelector('[aria-label="Fermer le menu FIXEO"]')),
    horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1, criticalOverflow: overflow,
    controls: [...panel.querySelectorAll('[role="button"]')].map(critical),
  };
}

function assertDrawerOpen(geometry, {selectedVisible = true} = {}) {
  const {panel, viewport, transform, selected, close} = geometry;
  assert.ok(panel.visible, 'Drawer panel must be visible');
  assert.ok(Math.abs(panel.x) <= 0.01 && Math.abs(panel.y) <= 0.01,
    `Drawer must be fully on-screen at (0, 0): ${JSON.stringify(panel)}`);
  assert.ok(Math.abs(panel.width - Math.min(viewport.width - 24, 390)) <= 0.5,
    'Drawer width must equal min(viewport width - 24, 390)');
  assert.ok(Math.abs(panel.height - viewport.height) <= 0.5, 'Drawer must span viewport height');
  assert.deepEqual(transform, [1, 0, 0, 1, 0, 0], 'Drawer transform must have reached its final identity');
  assert.ok(close?.visible, 'Drawer close button must be fully visible and unobstructed');
  assert.ok(selected, 'Drawer must have a selected destination');
  if (selectedVisible) assert.ok(selected.visible, 'Selected destination must be fully visible and unobstructed');
  assert.equal(geometry.horizontalOverflow, false, 'Drawer must not overflow horizontally');
  assert.deepEqual(geometry.criticalOverflow, [], 'Drawer labels and controls must not overflow');
}

async function waitForDrawerOpen(page) {
  const close = page.getByRole('button', {name: 'Fermer le menu FIXEO'});
  await close.waitFor(); // Mounting is necessary, but does not mean the Drawer is open.
  const handle = await close.evaluateHandle(el => {
    const dialog = el.closest('[role="dialog"]');
    for (let parent = el.parentElement; parent && parent !== dialog; parent = parent.parentElement) {
      if (parent.style.transform) return parent;
    }
    throw new Error('Drawer transformed ancestor not found inside Modal');
  });
  const panel = handle.asElement();
  assert.ok(panel, 'Drawer panel must exist');
  // rAF polling follows the real animation; the timeout is a failure bound, not a sleep.
  await page.waitForFunction(el => {
    const box = el.getBoundingClientRect(), matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return el.isConnected && Math.abs(box.x) <= 0.01 && matrix.isIdentity &&
      Math.abs(box.width - Math.min(innerWidth - 24, 390)) <= 0.5;
  }, panel, {polling: 'raf', timeout: 5000});
  // Deep destinations can require vertical scrolling on a small screen. The
  // capture guard below additionally requires the selected row to be in view.
  assertDrawerOpen(await panel.evaluate(measureDrawer), {selectedVisible: false});
  return panel;
}

async function checkDrawerContent(panel, destinationCount) {
  const controls = await panel.$$('[role="button"]');
  assert.equal(controls.length, destinationCount + 2, 'All destinations, close and logout must exist');
  const scrollPositions = await panel.evaluate(el => [...el.querySelectorAll('*')]
    .filter(child => /(auto|scroll)/.test(getComputedStyle(child).overflowY))
    .map(child => child.scrollTop));
  const checked = [];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate(measureDrawer);
    assertDrawerOpen(geometry, {selectedVisible: false});
    const label = await control.getAttribute('aria-label');
    assert.ok(geometry.controls.find(item => item.label === label)?.visible, `Unreachable Drawer control: ${label}`);
    checked.push(label);
  }
  await panel.evaluate((el, positions) => [...el.querySelectorAll('*')]
    .filter(child => /(auto|scroll)/.test(getComputedStyle(child).overflowY))
    .forEach((child, index) => { child.scrollTop = positions[index]; }), scrollPositions);
  return checked;
}

async function captureDrawer(page, panel, path) {
  // Fail closed immediately before every Drawer screenshot, including Reduced Motion.
  const geometry = await panel.evaluate(measureDrawer);
  assertDrawerOpen(geometry);
  await page.screenshot({path});
  return geometry;
}

module.exports = {assertDrawerOpen, waitForDrawerOpen, checkDrawerContent, captureDrawer};
