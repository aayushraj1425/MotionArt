import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import type {
  AnimeOptions,
  AnimeProcessor,
  ProcessProgress,
  ProcessResult,
  StylizedFrame,
} from '../types';
import { loadEncoderSource } from './encoderAsset';
import { buildWebViewHtml } from './webviewSource';

// react-native-webview types WebView as a generic class whose default type
// parameter collapses its props to `never` in JSX under strict TS. Casting to a
// plain ComponentClass<WebViewProps> in one place restores correct checking,
// while the `useRef<WebView>` below keeps `injectJavaScript` fully typed.
const WebViewEngine = WebView as unknown as React.ComponentClass<WebViewProps>;

type Pending = {
  resolve: (result: ProcessResult) => void;
  reject: (error: Error) => void;
};

type ProcessorHandle = {
  /** The AnimeProcessor implementation, backed by the hidden WebView. */
  process: AnimeProcessor['process'];
  /** Render this once; it mounts the (invisible) engine. */
  host: React.ReactElement | null;
  /** Latest progress, or null when idle. */
  progress: ProcessProgress | null;
};

/**
 * Wraps the WebView engine as an AnimeProcessor. All the messy bridging
 * (loading the encoder, data-URL conversion, ready handshake, promise plumbing)
 * lives here so callers see only `process(frames, options) => Promise<...>`.
 */
export function useAnimeProcessor(): ProcessorHandle {
  const webRef = useRef<WebView>(null);
  const pending = useRef<Pending | null>(null);
  const queuedJs = useRef<string | null>(null);
  const ready = useRef(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const loadError = useRef<Error | null>(null);

  // Load the WASM encoder once, then build the WebView document around it.
  useEffect(() => {
    let cancelled = false;
    loadEncoderSource()
      .then((source) => {
        if (!cancelled) setHtml(buildWebViewHtml(source));
      })
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        loadError.current = error;
        pending.current?.reject(error);
        pending.current = null;
        if (!cancelled) setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(() => {
    pending.current = null;
    setProgress(null);
  }, []);

  const onResult = useCallback(
    async (video: string, frameUrls: string[]) => {
      const p = pending.current;
      if (!p) return;
      try {
        const videoUri = `${FileSystem.cacheDirectory}motion-art-${Date.now()}.mp4`;
        await FileSystem.writeAsStringAsync(videoUri, video, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const frames: StylizedFrame[] = frameUrls.map((dataUrl, i) => ({
          id: String(i),
          dataUrl,
        }));
        p.resolve({ videoUri, frames });
      } catch (err) {
        p.reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        finish();
      }
    },
    [finish],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'ready':
          ready.current = true;
          if (queuedJs.current) {
            webRef.current?.injectJavaScript(queuedJs.current);
            queuedJs.current = null;
          }
          return;
        case 'progress':
          setProgress({ stage: msg.stage, value: msg.value, total: msg.total });
          return;
        case 'result':
          onResult(msg.video, msg.frames);
          return;
        case 'error':
          pending.current?.reject(new Error(msg.message));
          finish();
          return;
      }
    },
    [onResult, finish],
  );

  const process = useCallback(
    (frameUris: string[], options: AnimeOptions) =>
      new Promise<ProcessResult>((resolve, reject) => {
        if (loadError.current) {
          reject(loadError.current);
          return;
        }
        if (pending.current) {
          reject(new Error('A video is already being processed.'));
          return;
        }
        pending.current = { resolve, reject };
        setProgress({ stage: 'loading', value: 0, total: frameUris.length });

        // The WebView can't read file:// URIs, so hand it self-contained data URLs.
        Promise.all(
          frameUris.map(async (uri) => {
            const b64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return `data:image/jpeg;base64,${b64}`;
          }),
        )
          .then((dataUrls) => {
            const payload = JSON.stringify({ frames: dataUrls, options });
            const js = `window.MotionArt && window.MotionArt.run(${payload}); true;`;
            if (ready.current) {
              webRef.current?.injectJavaScript(js);
            } else {
              // The engine mounts once the encoder finishes loading; run then.
              queuedJs.current = js;
            }
          })
          .catch((err) => {
            pending.current = null;
            setProgress(null);
            reject(err instanceof Error ? err : new Error(String(err)));
          });
      }),
    [],
  );

  // Stable element: rebuilt only when the (one-time) HTML becomes available, so
  // the engine never remounts mid-job.
  const host = useMemo(
    () =>
      html ? (
        <WebViewEngine
          ref={webRef}
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          // Kept in the tree but invisible and non-interactive.
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          pointerEvents="none"
        />
      ) : null,
    [html, onMessage],
  );

  return { process, host, progress };
}
