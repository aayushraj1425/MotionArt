// Shared domain types and the processing contract.
// Keeping the contract here lets screens depend on an abstraction (DIP),
// not on the WebView implementation that happens to fulfil it.

/** A picked source video from the device library. */
export type PickedVideo = {
  uri: string;
  /** Duration in milliseconds, when the picker reports it. */
  durationMs?: number;
};

export type ProcessingEngine = 'python' | 'device';
export type PythonConnection = { url: string; code: string };

/** One stylized frame, as a PNG data URL or a downloaded local file URI. */
export type StylizedFrame = {
  id: string;
  dataUrl: string; // "data:image/png;base64,...."
};

/** Output of the anime pipeline: a real video file plus its frames. */
export type ProcessResult = {
  /** file:// URI of the encoded video the user can preview. */
  videoUri: string;
  frames: StylizedFrame[];
  cacheDirectory?: string;
};

/** Tunables for the cartoon look and the encode. */
export type AnimeOptions = {
  fps: number;
  /** Posterization levels — fewer = flatter, more "anime". */
  levels: number;
  /** Luminance gap that counts as an outline edge. */
  edgeThreshold: number;
  /** Colour saturation multiplier. */
  saturation: number;
  /** Maximum length of either side, including portrait videos. */
  maxWidth: number;
  /** H.264 quality: lower = better (range 10–51). */
  quantizer: number;
  smoothing: number;
  outlineStrength: number;
  contrast: number;
  /** Amount of local source detail retained beneath the cel shading. */
  detail: number;
  /** Blend between continuous lightness and flat cel shading. */
  celStrength: number;
  /** Warm highlights and cool shadows for an illustrated color palette. */
  paletteStrength: number;
  /** Process the first N seconds, bounded to keep on-device work manageable. */
  clipSeconds: number;
};

export const DEFAULT_OPTIONS: AnimeOptions = {
  fps: 12,
  levels: 6,
  edgeThreshold: 18,
  saturation: 1.5,
  maxWidth: 720,
  quantizer: 20,
  smoothing: 1,
  outlineStrength: 0.75,
  contrast: 1.1,
  detail: 1,
  celStrength: 0.8,
  paletteStrength: 0.65,
  clipSeconds: 5,
};

/** Progress emitted while the pipeline runs, for UI feedback. */
export type ProcessProgress = {
  stage: 'loading' | 'stylizing' | 'encoding' | 'uploading' | 'downloading';
  value: number;
  total: number;
};

/**
 * The processing contract. Screens call `process(...)` and never learn how
 * frames become a video. Today a WebView fulfils this; swapping in a native
 * encoder later would not touch a single screen.
 */
export interface AnimeProcessor {
  process(frameUris: string[], options: AnimeOptions): Promise<ProcessResult>;
}
