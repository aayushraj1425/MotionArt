import * as ImagePicker from 'expo-image-picker';

import type { PickedVideo } from '../types';

/**
 * Owns exactly one job: let the user choose a local video.
 * Returns null when the user cancels; throws when permission is denied.
 */
export async function pickVideo(): Promise<PickedVideo | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Library permission is needed to pick a video.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    durationMs: asset.duration ?? undefined,
  };
}
