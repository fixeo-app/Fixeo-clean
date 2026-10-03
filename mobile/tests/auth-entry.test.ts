import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mobileEntryRouteForRole,
  signInErrorMessage,
} from '../lib/authEntry';

test('mobile auth entry resolves only supported mobile universes', () => {
  assert.equal(mobileEntryRouteForRole('client'), '/');
  assert.equal(mobileEntryRouteForRole('artisan'), '/artisan');
  assert.equal(mobileEntryRouteForRole('admin'), null);
});

test('mobile auth entry hides technical credential and network errors', () => {
  assert.equal(
    signInErrorMessage(new Error('Invalid login credentials')),
    'Email ou mot de passe incorrect.',
  );
  assert.equal(
    signInErrorMessage(new Error('Network request failed')),
    'Connexion momentanément indisponible. Réessayez dans un instant.',
  );
  assert.equal(
    signInErrorMessage(new Error('ROLE_INVALID')),
    'Cet espace n’est pas disponible dans l’application mobile.',
  );
});
