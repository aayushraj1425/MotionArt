import * as VideoThumbnails from 'expo-video-thumbnails';

import type { PickedVideo } from '../types';

/** When the picker gives no duration, sample across this window instead. */
const FALLBACK_SPAN_MS = 3000;

/**
 * Owns exactly one job: turn a video into N still frames spread evenly
 * across the clip. Each frame is written to a cache file; we return the URIs.
 */
export async function sampleFrames(
  video: PickedVideo,
  count: number,
): Promise<string[]> {
  const span = video.durationMs && video.durationMs > 0 ? video.durationMs : FALLBACK_SPAN_MS;
  const uris: string[] = [];

  for (let i = 0; i < count; i++) {
    // (i + 0.5)/count keeps us off the very first and last frame, which
    // some decoders return black.
    const time = Math.floor((span * (i + 0.5)) / count);
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, {
        time,
        quality: 0.6,
      });
      uris.push(uri);
    } catch {
      // Ran past the real end of a shorter-than-expected clip — stop cleanly.
      break;
    }
  }

  if (uris.length === 0) {
    throw new Error('Could not read any frames from this video.');
  }
  return uris;
}
