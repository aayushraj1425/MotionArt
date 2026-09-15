import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

export async function saveVideoToGallery(uri: string): Promise<void> {
  await requirePermission();
  await MediaLibrary.saveToLibraryAsync(uri);
}
async function requirePermission() {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) throw new Error('Allow Photos access in Settings to save your video or frame.');
}
export async function saveDataUrlToGallery(dataUrl: string): Promise<void> {
  await requirePermission();
  if (dataUrl.startsWith('file://')) {
    await MediaLibrary.saveToLibraryAsync(dataUrl);
    return;
  }
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Frame image is empty.');
  const uri = `${FileSystem.cacheDirectory}motion-art-frame-${Date.now()}.png`;
  try {
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    await MediaLibrary.saveToLibraryAsync(uri);
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
