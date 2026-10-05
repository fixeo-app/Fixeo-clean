import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowArtisanActivityLoadError } from '../lib/artisanActivityLoad';

test('artisan activity does not show a blocking load error when offers load', () => {
  assert.equal(shouldShowArtisanActivityLoadError(true, false), false);
});

test('artisan activity does not show a blocking load error when current mission loads', () => {
  assert.equal(shouldShowArtisanActivityLoadError(false, true), false);
});

test('artisan activity shows a load error only when both primary activity sources fail', () => {
  assert.equal(shouldShowArtisanActivityLoadError(false, false), true);
});
