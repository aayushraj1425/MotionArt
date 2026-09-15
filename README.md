# Motion Art 🎬

Turn a short local video into **anime/cartoon-style motion**, entirely on-device.
Pick a clip → frames are stylized and rebuilt into a real video → preview it →
save any frame to your Photos. No servers, no uploads, no native build step.

Built with **Expo (React Native)** so it runs in **Expo Go** — no Android
Studio or Xcode required.

---

## Run it

You need [Node.js](https://nodejs.org) and the **Expo Go** app on your phone.

```bash
npm install
npx expo install --fix   # aligns native module versions to your Expo SDK
npx expo start
```

- **iOS:** open the **Camera app**, point it at the QR code, then tap the
  "Open in Expo Go" banner. (iOS Expo Go has no built-in QR scanner.)
- **Android:** scan the QR directly from inside **Expo Go**.

> **Works on both iOS and Android.** Stylizing and encoding run entirely
> on-device in a hidden WebView: canvas pixels feed an embedded WASM **H.264**
> encoder that outputs a real **.mp4** — no `MediaRecorder`/`captureStream`
> (unsupported in iOS WebViews) and no FFmpeg.

---

## How it works

The hard part of a hackathon "video app" is turning processed frames back into
a *real video file* on-device — normally an FFmpeg job. Motion Art avoids any
native dependency by borrowing the browser engine that already ships inside a
`WebView`:

1. **Pick** — `expo-image-picker` selects a local video (`VideoPicker`).
2. **Sample** — `expo-video-thumbnails` grabs 20 frames spread across the clip
   (`FrameSampler`).
3. **Stylize + Encode** — a hidden `WebView` draws each frame to a `<canvas>`,
   applies a cartoon filter (saturation boost → colour posterization → edge
   outlines), then feeds the canvas pixels to an embedded WASM **H.264** encoder
   that writes a real **.mp4** (`useAnimeProcessor` + `webviewSource` +
   `encoderAsset`). This pixels-in / WASM-out path works identically on iOS and
   Android — unlike `MediaRecorder`/`captureStream`, which iOS WebViews lack.
4. **Preview** — `expo-video` plays the generated video (`ResultScreen`).
5. **Save** — the chosen frame is written to Photos via `expo-media-library`
   (`GallerySaver`).

### Structure

```
App.tsx                       three-phase state machine (home → processing → result)
src/
  types.ts                    domain types + the AnimeProcessor contract
  theme.ts                    shared style tokens
  services/
    VideoPicker.ts            pick a local video
    FrameSampler.ts           video → N sampled frames
    GallerySaver.ts           save a frame to Photos
  processing/
    webviewSource.ts          canvas cartoon filter + WASM H.264 encoder (runs in WebView)
    encoderAsset.ts           loads the vendored WASM encoder from a bundled asset
    useAnimeProcessor.tsx     RN⇄WebView bridge; fulfils the AnimeProcessor contract
  components/
    PrimaryButton.tsx
    FrameStrip.tsx            tappable filmstrip of generated frames
  screens/
    HomeScreen.tsx
    ProcessingScreen.tsx
    ResultScreen.tsx
```

Each module has a single responsibility, and the screens depend on the
`AnimeProcessor` **interface** — the WebView is an implementation detail that a
native encoder could later replace without touching the UI.

### Tunables

Look in `src/types.ts` → `DEFAULT_OPTIONS` (fps, posterization `levels`,
`edgeThreshold`, `saturation`, `maxWidth`) and `FRAME_COUNT` in
`ProcessingScreen.tsx`.

---

## Known limits (it's a hackathon MVP)

- Frames are sampled, not every-frame — motion is a stylized flip-book, by design.
- Processing width is capped (`maxWidth`) to keep pure-JS pixel work snappy.
- The WASM encoder adds a ~1.7 MB bundled asset (`assets/h264-mp4-encoder.web.txt`,
  registered via `metro.config.js`); it loads once per session.
