import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import type { AnimeOptions, PickedVideo } from '../types';

export async function sampleFrames(video: PickedVideo, options: AnimeOptions, onProgress: (value: number, total: number) => void): Promise<string[]> {
  if (!video.durationMs || video.durationMs <= 0) throw new Error('Could not read the video duration. Please select another clip.');
  const span = Math.min(video.durationMs, options.clipSeconds * 1000);
  const count = Math.max(1, Math.round(span * options.fps / 1000));
  const uris: string[] = [];
  onProgress(0, count);
  try {
    for (let i = 0; i < count; i++) {
      const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, {
        time: Math.min(Math.floor(i * 1000 / options.fps), Math.max(0, Math.floor(span) - 1)), quality: 1,
      });
      uris.push(uri);
      onProgress(i + 1, count);
    }
    return uris;
  } catch {
    await Promise.all(uris.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})));
    throw new Error('Could not read the full clip. Try a shorter duration or a different video.');
  }
}
