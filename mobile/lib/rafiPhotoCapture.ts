import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { explainPermission, permissionRefused } from './permissionPrompt';

export type RafiPhoto = { uri: string; mimeType: 'image/jpeg' };
/** Explicit user action only. Normalize orientation/format and bound upload dimensions. */
export async function captureRafiPhoto(source: 'camera' | 'photos', active: () => boolean): Promise<RafiPhoto | null> {
  if (!await explainPermission(source) || !active()) return null;
  const current = source === 'camera' ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  const permission = current.granted ? current : source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!active()) return null;
  if (!permission.granted) throw new Error(permissionRefused(source, permission.canAskAgain !== false));
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (!active() || result.canceled || !result.assets[0]?.uri) return null;
  const asset = result.assets[0];
  const actions = Math.max(asset.width, asset.height) > 1600 ? [{ resize: asset.width >= asset.height ? { width: 1600 } : { height: 1600 } }] : [];
  const photo = await manipulateAsync(asset.uri, actions, { compress: 0.85, format: SaveFormat.JPEG });
  return active() ? { uri: photo.uri, mimeType: 'image/jpeg' } : null;
}
