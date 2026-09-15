// Shared domain types and the processing contract.
// Keeping the contract here lets screens depend on an abstraction (DIP),
// not on the WebView implementation that happens to fulfil it.

/** A picked source video from the device library. */
export type PickedVideo = {
  uri: string;
  /** Duration in milliseconds, when the picker reports it. */
  durationMs?: number;
};

/** One stylized frame, carried as a self-contained PNG data URL. */
export type StylizedFrame = {
  id: string;
  dataUrl: string; // "data:image/png;base64,...."
};

/** Output of the anime pipeline: a real video file plus its frames. */
export type ProcessResult = {
  /** file:// URI of the encoded video the user can preview. */
  videoUri: string;
  frames: StylizedFrame[];
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
  /** Frames are scaled down to at most this width before processing. */
  maxWidth: number;
  /** H.264 quality: lower = better (range 10–51). */
  quantizer: number;
};

export const DEFAULT_OPTIONS: AnimeOptions = {
  fps: 8,
  levels: 5,
  edgeThreshold: 34,
  saturation: 1.35,
  maxWidth: 480,
  quantizer: 26,
};

/** Progress emitted while the pipeline runs, for UI feedback. */
export type ProcessProgress = {
  stage: 'loading' | 'stylizing' | 'encoding';
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
