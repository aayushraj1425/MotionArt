import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

const openCvModule = require('../../assets/opencv-4.13.0.web.txt');
let cached: string | null = null;

/** Fixed, self-contained OpenCV.js/WASM build; never fetched from a CDN at runtime. */
export async function loadOpenCvSource(): Promise<string> {
  if (cached) return cached;
  const asset = Asset.fromModule(openCvModule);
  await asset.downloadAsync();
  cached = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri);
  return cached;
}
