import { AppState, Platform } from 'react-native';
import { locateInterventionCity, type CityLocationResult } from './clientLocation';

/** No import-time permission, listener, storage or network request. */
export async function detectInterventionCity(isCurrent: () => boolean): Promise<CityLocationResult> {
  // Expo's reverse geocoder is native-only. Web keeps manual entry, without a permission prompt.
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };
  const Location = await import('expo-location');
  return locateInterventionCity({
    supported: true,
    requestPermission: async () => {
      const current = await Location.getForegroundPermissionsAsync();
      return current.granted ? current : Location.requestForegroundPermissionsAsync();
    },
    servicesEnabled: () => Location.hasServicesEnabledAsync(),
    lastPosition: () => Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 1500 }),
    currentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
    reverseGeocode: coordinates => Location.reverseGeocodeAsync(coordinates),
  }, () => isCurrent() && AppState.currentState === 'active');
}
