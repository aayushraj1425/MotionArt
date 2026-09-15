# Motion Art

Turn a short video into anime-inspired cel shading with OpenCV. No LLM, AI model, cloud service, or external processing API.

## Run with Python OpenCV (default)

Python runs on your **computer**. Expo Go runs on your **phone**. The phone sends your selected video to your computer over Wi-Fi and downloads the processed MP4 and PNG frames. Python cannot run directly inside Expo Go.

### First-time setup

From the project folder in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm install
```

Python 3.11 is tested. The dependencies include a bundled FFmpeg executable for H.264 encoding; no separate FFmpeg installation is required. `backend/requirements.lock.txt` records the exact tested Python environment.

### Start processing

**Terminal 1 - Python:**

```powershell
.\.venv\Scripts\python.exe -m backend serve --host 0.0.0.0
```

The terminal prints the computer's network addresses and a pairing code. Keep it running. The code changes whenever the processor restarts.

**Terminal 2 - Expo:**

```powershell
npm start
```

Open the QR code in Expo Go. In Motion Art:

1. Select **Python on computer**.
2. Enter the printed Wi-Fi address, such as `http://192.168.1.10:8000`, and the pairing code. Use the computer's address, not `localhost` or `0.0.0.0`.
3. Pick the original video, choose **OpenCV anime**, and start with **2 seconds**, **720 resolution**, and **smoothing 1**.
4. Tap **Create anime video**. Progress shows sending, processing, and downloading.
5. Save the video or select and save any PNG frame to Photos / Gallery.
6. Use **Adjust style & try again** to reprocess the same source with different settings.

Both devices must use the same reachable Wi-Fi network. If Windows asks, allow Python on your private network. Expo's `--tunnel` connects Expo only; the Python address must still be reachable from the phone. The service is for your local network, not public hosting.

## Process images or videos directly with Python

No phone or local web service is needed for these commands:

```powershell
.\.venv\Scripts\python.exe -m backend image "input.jpg" "output.png"
.\.venv\Scripts\python.exe -m backend video "input.mp4" "output-folder"
```

The video command writes `video.mp4` and every processed `frame-0000.png`, etc. Choose a new output path; existing outputs are not overwritten. To customize either command, add `--options settings.json`. The JSON uses the same names as the app, for example:

```json
{
  "clipSeconds": 2,
  "maxWidth": 720,
  "fps": 12,
  "smoothing": 1,
  "levels": 6,
  "celStrength": 0.8,
  "detail": 1,
  "outlineStrength": 0.75,
  "paletteStrength": 0.65
}
```

Missing settings use the defaults from `backend/options.py`.

## What Python changes

- `backend/filters.py`: OpenCV `edgePreservingFilter` simplifies regions, `stylization` adds a painted appearance, Lab lightness quantization creates cel shadows, bounded detail restoration retains smaller features, and Canny traces contours. Warm highlights and cool shadows finish the palette.
- `backend/pipeline.py`: OpenCV decodes the original video sequentially, resamples frames to the selected frame rate, processes frames, writes PNGs, and streams pixels to FFmpeg for H.264 MP4 encoding.
- `backend/server.py`: local upload, progress, download, cancellation, and cleanup with a pairing code. One processing job runs at a time, with a small bounded queue.
- `src/services/PythonProcessor.ts`: the phone connects, sends the clip, tracks progress, downloads results into its cache, and removes the remote job after download.

No random per-frame color clustering is used. Fixed settings reduce palette changes between frames, though rapid lighting changes and fine textures may still flicker. Python is a platform for richer processing; changing language alone does not guarantee a better anime resemblance.

## Phone-only option

Select **Phone only** to keep the entire clip on the phone using the existing OpenCV.js 4.13.0 / WebView / WASM H.264 pipeline. It does not need a computer processor. Its smoothing and contour tools differ from Python's photo rendering tools, so the same parameters can look different.

## Settings

| Setting | Effect |
| --- | --- |
| Anime color palette | Warm highlights and cool blue shadows; zero keeps color balance. |
| Keep fine details | Restores small local contrasts. Higher can also restore source noise. |
| Anime shading strength | Higher produces more painted, flatter regions. Lower preserves more photographic tones. |
| Texture smoothing | Higher removes more texture; takes longer. |
| Shading bands | Fewer bands produce stronger cel shadows. |
| Ink strength | Darkens contours; zero disables the extra outlines. Python stylization can still produce painted contours. |
| Outline threshold | Higher suppresses weaker Canny edges. |
| Color intensity | Boosts color; zero produces grayscale. |
| Contrast | Deepens shadows and brightens highlights. |
| Frames per second | 6, 12, or 24; higher is smoother and requires more processing. |
| Resolution | Caps the longest side at 480, 640, 720, or 1080. |
| First seconds to process | First 2, 5, or 10 seconds, or the whole clip if shorter. |

## Output and limits

- Exports are **silent** and process at most the first **10 seconds**.
- The Python service accepts videos up to **250 MB**. Keep the app, Python terminal, and network connection active during transfer and processing.
- This is classical image processing. It preserves the original face and scene geometry; it cannot redraw a person as an anime character or recover details missing from a blurry input.
- Video timing uses the decoder's reported frame rate. Variable-frame-rate or damaged videos may not reproduce exact source timing.
- Server inputs are removed after processing. Results are removed after successful phone download or cancellation; idle completed jobs expire after an hour when another upload arrives. Normal server shutdown removes jobs still tracked in the session. A forced shutdown can leave files in ignored `backend/.jobs/`.
- Downloaded results stay in phone cache until replaced or dismissed. Gallery copies persist separately.

## Tests

```powershell
npm test
npm run typecheck
.\.venv\Scripts\python.exe -m unittest backend.test_processing -v
```

Tests cover native OpenCV output, detail retention, grayscale, bounds validation, actual video encode/decode, timing, cancellation, upload/download, pairing, cleanup, phone-side downloaded files, and the original OpenCV.js pipeline. Native phone networking, playback, gallery permissions, and visual quality on your footage still require a device check.

OpenCV.js license and source checksum are in `assets/OPENCV-NOTICE.md`. Python OpenCV: https://docs.opencv.org/4.x/df/dac/group__photo__render.html
