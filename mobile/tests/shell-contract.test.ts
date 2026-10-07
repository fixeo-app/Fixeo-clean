import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { StackActions, StackRouter } from '@react-navigation/routers';
import { activeShellKey, dockHasRoom, dockBadgeLabel, dockMinimumHeight, getShellDestinations, isDockVisible, navigateShell, validateDockItems, workspaceDockDestinations, type ContextDockItem, type ShellPath } from '../ui/shellContract';
import { getScreenMetrics } from '../ui/screenMetrics';
import { resolveMotion } from '../ui/motionContract';
import { getInteractionStyle } from '../ui/interactionContract';
import { interaction, layout } from '../ui/tokens';

for (const universe of ['client', 'artisan'] as const) {
  test(`W2 ${universe}: real Drawer routes and active state`, () => {
    const items = getShellDestinations(universe);
    assert.equal(items.length, universe === 'client' ? 5 : 11);
    assert.equal(new Set(items.map(item => item.path)).size, items.length);
    for (const item of items) {
      const relative = item.path === '/' ? '/index' : item.path;
      assert.ok(existsSync(path.resolve(`app${relative}.tsx`)) || existsSync(path.resolve(`app${relative}/index.tsx`)), item.path);
      assert.equal(activeShellKey(universe, `${item.path}/?source=notification`), item.key);
    }
    assert.equal(activeShellKey(universe, '/mission/abc'), '');
  });
}
test('PB1 dock persists on every canonical top-level route, excludes details/auth/cross-role', () => {
  for (const universe of ['client', 'artisan'] as const) {
    const expected = universe === 'client' ? ['rafi', 'history', 'alerts'] : ['opportunities', 'rafi', 'agenda'];
    for (const destination of getShellDestinations(universe)) {
      assert.deepEqual(workspaceDockDestinations(universe, destination.path).map(item => item.key), expected);
      assert.deepEqual(workspaceDockDestinations(universe, destination.path + '/?test=1').map(item => item.key), expected);
    }
    for (const route of ['/sign-in', '/complete-profile', '/mission/123', '/client-mission/123', '/artisan-workspace/quote/new', '/unknown'])
      assert.deepEqual(workspaceDockDestinations(universe, route), []);
  }
  assert.deepEqual(workspaceDockDestinations('artisan', '/client-workspace'), []);
  assert.deepEqual(workspaceDockDestinations('client', '/artisan-workspace'), []);
});
test('W2 Dock limits, duplicate guard, visibility and badges', () => {
  const items: ContextDockItem[] = Array.from({ length: 5 }, (_, index) => ({ key: String(index), label: 'Action', accessibilityLabel: 'Ouvrir Action', icon: 'grid-outline', action() {} }));
  assert.doesNotThrow(() => validateDockItems(items.slice(0, 3)));
  assert.throws(() => validateDockItems(items.slice(0, 4)));
  assert.doesNotThrow(() => validateDockItems(items.slice(0, 4), 'Fourth contextual action'));
  assert.throws(() => validateDockItems(items, 'Still forbidden'));
  assert.throws(() => validateDockItems([items[0], items[0]]));
  assert.equal(isDockVisible({ itemCount: 3 }), true);
  assert.equal(isDockVisible({ itemCount: 3, hidden: true }), false);
  assert.equal(isDockVisible({ itemCount: 3, keyboardVisible: true }), false);
  assert.equal(isDockVisible({ itemCount: 0 }), false);
  assert.equal(dockBadgeLabel(103), '99+');
  assert.equal(dockBadgeLabel(NaN), '');
  assert.equal(dockBadgeLabel(-4), '');
});
test('W2 floating reservation and enlarged text: safe area + height + gaps counted once', () => {
  for (const fontScale of [1, 1.5, 2, 3]) {
    const height = Math.max(dockMinimumHeight(fontScale), 160);
    const metrics = getScreenMetrics({ top: 44, left: 0, right: 0, bottom: 34 }, { floatingHeight: height });
    assert.equal(metrics.paddingBottom - metrics.floatingBottom - height, 24);
    assert.ok(metrics.floatingBottom >= 34);
  }
  const keyboard = getScreenMetrics({ top: 24, left: 44, right: 44, bottom: 34 }, { keyboardOverlap: 300 });
  assert.equal(keyboard.paddingBottom, 300);
  assert.equal(keyboard.paddingLeft, 44);
  assert.ok(dockMinimumHeight(2) > dockMinimumHeight(1));
});
test('W2 targets and Reduced Motion: DS2, no pressed transform, no delayed close', () => {
  assert.ok(interaction.minTarget >= 48);
  for (const preset of ['transition', 'control'] as const) {
    assert.equal(resolveMotion(preset, true).duration, 0);
    assert.equal(resolveMotion(preset, true, 300).delay, 0);
  }
  assert.equal(getInteractionStyle({ pressed: true, focused: false, disabled: false, reduceMotion: true }).transform, undefined);
});
test('W2 installed StackRouter: no duplicate roots, detail preserves return history', () => {
  const native = StackRouter({ initialRouteName: '/' });
  const routeNames = [...getShellDestinations('client'), ...getShellDestinations('artisan')].map(item => item.path);
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  let state = native.getInitialState(options);
  function dispatch(action: ReturnType<typeof StackActions.popTo> | ReturnType<typeof StackActions.push> | ReturnType<typeof StackActions.pop>) {
    const next = native.getStateForAction(state, action, options);
    assert.ok(next);
    state = native.getRehydratedState(next, options);
  }
  const adapter = { dismissTo: (target: ShellPath) => dispatch(StackActions.popTo(target)), push: (target: ShellPath) => dispatch(StackActions.push(target)) };
  const current = () => state.routes[state.index].name;
  navigateShell(adapter, current(), '/client-workspace');
  navigateShell(adapter, current(), '/client-workspace/history', 'detail');
  assert.deepEqual(state.routes.map(route => route.name), ['/client-workspace', '/client-workspace/history']);
  assert.equal(navigateShell(adapter, current(), '/client-workspace/history', 'detail'), false);
  for (let i = 0; i < 20; i++) {
    navigateShell(adapter, current(), '/client-workspace');
    navigateShell(adapter, current(), '/client-workspace/notifications', 'detail');
  }
  assert.equal(state.routes.length, 2);
  dispatch(StackActions.pop());
  assert.equal(current(), '/client-workspace');
  navigateShell(adapter, current(), '/');
  assert.equal(state.routes.length, 1);
});
function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walkFiles(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
test('W2 actual JSX: one stable Shell per screen, including the shared W5 Artisan frame', () => {
  const dockFiles: string[] = [];
  let shellCount = 0;
  for (const file of [...walkFiles('app').filter(name => name.endsWith('.tsx')), 'components/ArtisanEditorial.tsx']) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let shells = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'MobileShell') {
        shells++;
        let parent: ts.Node | undefined = node.parent;
        while (parent && !(ts.isJsxAttribute(parent) && parent.name.getText(source) === 'header')) parent = parent.parent;
        assert.ok(parent, `${file}: Shell must be in FixeoScreen.header, outside the scroller`);
      }
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'contextDock') dockFiles.push(file);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(shells <= 1, file);
    shellCount += shells;
  }
  assert.equal(shellCount, 6);
  assert.deepEqual(dockFiles.sort(), ['app/client-workspace/account.tsx', 'app/client-workspace/history.tsx', 'app/client-workspace/index.tsx', 'app/client-workspace/notifications.tsx', 'app/index.tsx', 'components/ArtisanEditorial.tsx']);
});

test('W2 Dock yields space to content when enlarged header/toolbar or landscape leaves insufficient room', () => {
  assert.equal(dockHasRoom(568, 44, 76, 140), true);
  assert.equal(dockHasRoom(568, 44, 154, 250), false);
  assert.equal(dockHasRoom(320, 16, 76, 130), false);
  assert.equal(dockHasRoom(844, 44, 154, 250), true);
});

test('W2 root right-actions preserve their parent context; subpage right-actions return to an existing root', () => {
  for (const file of ['app/index.tsx', 'components/ArtisanEditorial.tsx', 'app/client-workspace/index.tsx']) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let preservesParent = false;
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'rightNavigation') preservesParent = node.initializer?.getText(source) === '"detail"';
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(preservesParent, true, file);
  }
});
