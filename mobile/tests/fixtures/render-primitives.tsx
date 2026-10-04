import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
// The app already installs React DOM for Expo Web, without its optional types.
const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};
import { FixeoAction } from '../../ui/FixeoAction';
import { FixeoCard } from '../../ui/FixeoCard';
import { FixeoText } from '../../ui/FixeoText';
import { FixeoSurface } from '../../ui/FixeoSurface';
import { MotionReveal } from '../../components/MotionReveal';

// tsx preserves Expo's classic JSX setting for imported native files. Supply
// React for this Node-only harness; Expo itself uses Babel's JSX runtime.
(globalThis as typeof globalThis & { React: typeof import('react') }).React = require('react');

const action = renderToStaticMarkup(createElement(FixeoAction, { label: 'Continuer' }));
assert.match(action, /role="button"/);
assert.match(action, /Continuer/);
const busy = renderToStaticMarkup(createElement(FixeoAction, { label: 'Enregistrer', busy: true, busyLabel: 'Enregistrement en cours', accessibilityState: { disabled: false } }));
assert.match(busy, /aria-busy="true"/);
assert.match(busy, /aria-disabled="true"/);
assert.match(busy, /Enregistrement en cours/);
const selected = renderToStaticMarkup(createElement(FixeoAction, { label: 'Disponible', selected: true, variant: 'secondary' }));
assert.match(selected, /aria-selected="true"/);
const disabled = renderToStaticMarkup(createElement(FixeoAction, { label: 'Annuler', disabled: true }));
assert.match(disabled, /aria-disabled="true"/);
for (const tone of ['light', 'dark', 'muted'] as const) {
  const card = renderToStaticMarkup(createElement(FixeoCard, { tone, style: [{ padding: 16 }] }, createElement(FixeoText, { variant: 'heading' }, 'Intervention')));
  assert.match(card, /Intervention/);
}
const surface = renderToStaticMarkup(createElement(FixeoSurface, { tone: 'subtle', border: 'hairline', rounding: 'sheet' }, createElement(FixeoText, {}, 'Détails')));
assert.match(surface, /Détails/);
const reveal = renderToStaticMarkup(createElement(MotionReveal, { delay: 1000 }, createElement(FixeoText, {}, 'Accessible immédiatement')));
assert.match(reveal, /opacity:1/);
assert.match(reveal, /Accessible immédiatement/);
console.log('DS2_PRIMITIVES_RENDER_PASS');
