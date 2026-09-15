import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

/**
 * Owns exactly one job: persist a PNG data URL into the device gallery.
 * A data URL can't be saved directly, so we stage it to a cache file first.
 */
export async function saveDataUrlToGallery(dataUrl: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Gallery permission is needed to save the frame.');
  }

  const base64 = dataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Frame image is empty.');
  }

  const fileUri = `${FileSystem.cacheDirectory}motion-art-frame-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await MediaLibrary.saveToLibraryAsync(fileUri);
}
