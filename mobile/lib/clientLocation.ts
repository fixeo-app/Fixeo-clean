import catalogue from './clientCities.generated.json';

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function canonicalCity(value: string) {
  const key = fold(value);
  return catalogue.find(item => [item.value, item.label, ...item.aliases].some(alias => fold(alias) === key))?.value;
}
export function citySuggestions(value: string) {
  const query = fold(value);
  if (!query || canonicalCity(value)) return [];
  return catalogue.filter(item => [item.value, item.label, ...item.aliases].some(alias => fold(alias).includes(query))).slice(0, 4);
}

type Address = { city?: string | null; subregion?: string | null; district?: string | null; isoCountryCode?: string | null };
export function cityFromAddresses(addresses: readonly Address[]) {
  // Never turn a province, street, postcode or country into an invented city.
  for (const address of addresses) {
    const city = address.city?.trim();
    if (city) return address.isoCountryCode && address.isoCountryCode !== 'MA' ? city : canonicalCity(city) || city;
  }
  for (const address of addresses) {
    if (address.isoCountryCode && address.isoCountryCode !== 'MA') continue;
    for (const value of [address.subregion, address.district]) {
      const city = value ? canonicalCity(value) : undefined;
      if (city) return city;
    }
  }
  return null;
}

export type CityLocationResult = { ok: true; city: string } | { ok: false; reason: 'unsupported' | 'denied' | 'blocked' | 'unavailable' | 'timeout' | 'no_city' | 'cancelled' };
export type CityLocationAdapter = {
  supported: boolean;
  requestPermission: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
  servicesEnabled: () => Promise<boolean>;
  currentPosition: () => Promise<{ coords: { latitude: number; longitude: number } }>;
  reverseGeocode: (position: { latitude: number; longitude: number }) => Promise<Address[]>;
};

/** One explicit attempt; coordinates exist only between the native fix and geocoder. */
export async function locateInterventionCity(adapter: CityLocationAdapter, isActive: () => boolean = () => true, timeoutMs = 12_000): Promise<CityLocationResult> {
  if (!adapter.supported) return { ok: false, reason: 'unsupported' };
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = () => expired || !isActive();
  // Bound even a stalled permission bridge; a late response must never start GPS work.
  const work = async (): Promise<CityLocationResult> => {
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    const permission = await adapter.requestPermission();
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    if (!permission.granted) return { ok: false, reason: permission.canAskAgain === false ? 'blocked' : 'denied' };
    if (!await adapter.servicesEnabled()) return { ok: false, reason: 'unavailable' };
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    const position = await adapter.currentPosition();
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    const addresses = await adapter.reverseGeocode({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    if (cancelled()) return { ok: false, reason: 'cancelled' };
    const city = cityFromAddresses(addresses);
    return city ? { ok: true, city } : { ok: false, reason: 'no_city' };
  };
  try {
    return await Promise.race([work(), new Promise<CityLocationResult>(resolve => {
      timer = setTimeout(() => { expired = true; resolve({ ok: false, reason: 'timeout' }); }, timeoutMs);
    })]);
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
