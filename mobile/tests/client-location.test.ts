import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canonicalCity, cityFromAddresses, citySuggestions, locateInterventionCity, type CityLocationAdapter } from '../lib/clientLocation';

function fixture(patch: Partial<CityLocationAdapter> = {}) {
  const calls: string[] = [];
  const adapter: CityLocationAdapter = {
    supported: true,
    requestPermission: async () => { calls.push('foreground-permission'); return { granted: true }; },
    servicesEnabled: async () => { calls.push('services'); return true; },
    currentPosition: async () => { calls.push('position'); return { coords: { latitude: 34, longitude: -6 } }; },
    reverseGeocode: async () => { calls.push('geocode'); return [{ city: 'Rabat', isoCountryCode: 'MA' }]; },
    ...patch,
  };
  return { adapter, calls };
}

test('W4 cities are a verbatim projection of the existing canonical public catalogue', () => {
  const context = { window: {} as { FIXEO_CITIES_MAP?: unknown } };
  vm.runInNewContext(readFileSync('../js/fixeo-cities.js', 'utf8'), context);
  assert.deepEqual(JSON.parse(readFileSync('lib/clientCities.generated.json', 'utf8')), JSON.parse(JSON.stringify(context.window.FIXEO_CITIES_MAP)));
  assert.equal(canonicalCity(' Fez '), 'Fès');
  assert.equal(canonicalCity('Nouvelle ville'), undefined);
  assert.equal(citySuggestions('mek')[0].value, 'Meknès');
});

test('W4 foreground success returns only a city and never returns GPS coordinates', async () => {
  const { adapter, calls } = fixture();
  assert.deepEqual(await locateInterventionCity(adapter), { ok: true, city: 'Rabat' });
  assert.deepEqual(calls, ['foreground-permission', 'services', 'position', 'geocode']);
});

test('W4 denied and permanently denied permissions never reach the location provider', async () => {
  for (const canAskAgain of [true, false]) {
    const { adapter, calls } = fixture({ requestPermission: async () => ({ granted: false, canAskAgain }) });
    assert.deepEqual(await locateInterventionCity(adapter), { ok: false, reason: canAskAgain ? 'denied' : 'blocked' });
    assert.deepEqual(calls, []);
  }
});

test('W4 disabled GPS, native errors and unsupported web all retain a manual fallback result', async () => {
  const disabled = fixture({ servicesEnabled: async () => false });
  assert.deepEqual(await locateInterventionCity(disabled.adapter), { ok: false, reason: 'unavailable' });
  assert.deepEqual(disabled.calls, ['foreground-permission']);
  const failed = fixture({ currentPosition: async () => { throw new Error('native-error'); } });
  assert.deepEqual(await locateInterventionCity(failed.adapter), { ok: false, reason: 'unavailable' });
  const web = fixture({ supported: false });
  assert.deepEqual(await locateInterventionCity(web.adapter), { ok: false, reason: 'unsupported' });
  assert.deepEqual(web.calls, []);
});

test('W4 geocoding uses cities, known city aliases only for subregions, never guesses a province', async () => {
  assert.equal(cityFromAddresses([{ city: 'Fes', isoCountryCode: 'MA' }]), 'Fès');
  assert.equal(cityFromAddresses([{ city: null, subregion: 'Meknes' }]), 'Meknès');
  assert.equal(cityFromAddresses([{ city: null, subregion: 'Rabat-Salé-Kénitra' }]), null);
  assert.equal(cityFromAddresses([{ city: 'Lyon', isoCountryCode: 'FR' }]), 'Lyon');
  assert.equal(cityFromAddresses([{ city: 'Tétouan' }]), 'Tétouan');
  const { adapter } = fixture({ reverseGeocode: async () => [] });
  assert.deepEqual(await locateInterventionCity(adapter), { ok: false, reason: 'no_city' });
});

test('W4 timeout discards late fixes before geocoding and never requests GPS after a late permission', async () => {
  let resolvePosition!: (position: { coords: { latitude: number; longitude: number } }) => void;
  const { adapter, calls } = fixture({ currentPosition: () => new Promise(resolve => { resolvePosition = resolve; }) });
  assert.deepEqual(await locateInterventionCity(adapter, () => true, 15), { ok: false, reason: 'timeout' });
  resolvePosition({ coords: { latitude: 34, longitude: -6 } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(!calls.includes('geocode'));
  let resolvePermission!: (value: { granted: boolean }) => void;
  const permission = fixture({ requestPermission: () => new Promise(resolve => { resolvePermission = resolve; }) });
  assert.deepEqual(await locateInterventionCity(permission.adapter, () => true, 15), { ok: false, reason: 'timeout' });
  resolvePermission({ granted: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(permission.calls, []);
});

test('W4 cancelled or backgrounded requests do no further location work', async () => {
  const { adapter, calls } = fixture();
  assert.deepEqual(await locateInterventionCity(adapter, () => false), { ok: false, reason: 'cancelled' });
  assert.deepEqual(calls, []);
});

test('W4 native configuration is foreground only and SDK-compatible', () => {
  const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const plugin = config.plugins.find((value: unknown) => Array.isArray(value) && value[0] === 'expo-location')[1];
  assert.equal(plugin.isIosBackgroundLocationEnabled, false);
  assert.equal(plugin.isAndroidBackgroundLocationEnabled, false);
  assert.equal(plugin.isAndroidForegroundServiceEnabled, false);
  assert.equal(plugin.locationAlwaysAndWhenInUsePermission, false);
  assert.equal(plugin.locationAlwaysPermission, false);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const supported = JSON.parse(readFileSync('node_modules/expo/bundledNativeModules.json', 'utf8'));
  assert.equal(pkg.dependencies['expo-location'], supported['expo-location']);
  const source = readFileSync('lib/clientLocationNative.ts', 'utf8');
  assert.doesNotMatch(source, /requestBackgroundPermissions|watchPosition|startLocationUpdates|startGeofencing|console\.|AsyncStorage|fetch\(|supabase/);
  assert.match(source, /Accuracy.Balanced/);
});
