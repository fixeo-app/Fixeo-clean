import { locateInterventionCity } from '../../lib/clientLocation';
import { detectInterventionCity as realWebFallback } from '../../lib/clientLocationNative';
export const locationCalls: string[] = [];
const scenario = new URLSearchParams(location.search).get('geo');
export async function detectInterventionCity(isCurrent: () => boolean) {
  if (!scenario || scenario === 'web') return realWebFallback(isCurrent);
  return locateInterventionCity({
    supported: true,
    requestPermission: async () => { locationCalls.push('foreground-permission'); return { granted: !['denied', 'blocked'].includes(scenario), canAskAgain: scenario !== 'blocked' }; },
    servicesEnabled: async () => { locationCalls.push('services'); return scenario !== 'unavailable'; },
    currentPosition: async () => { locationCalls.push('position'); if (scenario === 'timeout' || scenario === 'late') await new Promise(resolve => setTimeout(resolve, 250)); return { coords: { latitude: 34, longitude: -6 } }; },
    reverseGeocode: async () => { locationCalls.push('geocode'); return scenario === 'no_city' ? [] : [{ city: 'Rabat', isoCountryCode: 'MA' }]; },
  }, isCurrent, scenario === 'timeout' ? 30 : 12000);
}
