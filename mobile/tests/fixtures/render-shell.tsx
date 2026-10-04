import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { FixeoContextDock } from '../../ui/FixeoContextDock';
import { PremiumDrawer } from '../../components/PremiumDrawer';
import { ShellControl } from '../../ui/ShellControl';
import { FixeoText } from '../../ui/FixeoText';
import { getShellDestinations } from '../../ui/shellContract';
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup: (element: ReactElement) => string };
(globalThis as typeof globalThis & { React: typeof import('react') }).React = require('react');
const noop = () => {};
const items = [{ key: 'alerts', label: 'Alertes', icon: 'notifications-outline' as const, accessibilityLabel: 'Ouvrir les alertes', selected: true, badge: 2, action: noop }];
const dock = renderToStaticMarkup(createElement(FixeoContextDock, { universe: 'client', items }));
assert.match(dock, /role="toolbar"/);
assert.match(dock, /aria-selected="true"/);
assert.match(dock, /Ouvrir les alertes/);
assert.equal(renderToStaticMarkup(createElement(FixeoContextDock, { universe: 'client', items, hidden: true })), '');
const blocked = renderToStaticMarkup(createElement(ShellControl, { accessibilityState: { busy: true } }, createElement(FixeoText, {}, 'Déconnexion')));
assert.match(blocked, /aria-disabled="true"/);
assert.match(blocked, /aria-busy="true"/);
assert.match(blocked, /min-height:48px/);
assert.match(blocked, /min-width:48px/);
for (const universe of ['client', 'artisan'] as const) {
  const drawer = renderToStaticMarkup(createElement(PremiumDrawer, { universe, activeKey: universe === 'client' ? 'space' : 'workspace', orbMode: 'idle', signingOut: false, onClose: noop, onNavigate: noop, onLogout: noop }));
  for (const item of getShellDestinations(universe)) assert.ok(drawer.includes(item.label), item.label);
  assert.match(drawer, /Fermer le menu FIXEO/);
  assert.match(drawer, /aria-selected="true"/);
}
console.log('W2_SHELL_RENDER_PASS');
