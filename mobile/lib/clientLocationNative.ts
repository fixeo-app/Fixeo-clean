import { AppState, Platform } from 'react-native';
import { locateInterventionCity, type CityLocationResult } from './clientLocation';

/** No import-time permission, listener, storage or network request. */
export async function detectInterventionCity(isCurrent: () => boolean): Promise<CityLocationResult> {
  // Expo's reverse geocoder is native-only. Web keeps manual entry, without a permission prompt.
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };
  const Location = await import('expo-location');
  return locateInterventionCity({
    supported: true,
    requestPermission: () => Location.requestForegroundPermissionsAsync(),
    servicesEnabled: () => Location.hasServicesEnabledAsync(),
    currentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
    reverseGeocode: coordinates => Location.reverseGeocodeAsync(coordinates),
  }, () => isCurrent() && AppState.currentState === 'active');
}
