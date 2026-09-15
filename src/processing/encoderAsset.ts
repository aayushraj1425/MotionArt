import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

// The self-contained WASM H.264 encoder (wasm embedded), vendored as a bundled
// asset. We read its source text once and hand it to the WebView, where it
// becomes the global `HME` used to encode frames into an MP4 — fully on-device.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const encoderModule = require('../../assets/h264-mp4-encoder.web.txt');

let cached: string | null = null;

/** Load the encoder's JS source once and cache it for the session. */
export async function loadEncoderSource(): Promise<string> {
  if (cached) return cached;
  const asset = Asset.fromModule(encoderModule);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  cached = await FileSystem.readAsStringAsync(uri);
  return cached;
}
