import React, { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { StyleSheet, Text, View } from 'react-native';

import { useAnimeProcessor } from '../processing/useAnimeProcessor';
import { sampleFrames } from '../services/FrameSampler';
import { processWithPython } from '../services/PythonProcessor';
import { PrimaryButton } from '../components/PrimaryButton';
import { theme } from '../theme';
import { type AnimeOptions, type PickedVideo, type ProcessResult, type ProcessingEngine, type PythonConnection, type ProcessProgress } from '../types';


const STAGE_LABEL: Record<string, string> = {
  loading: 'Reading frames',
  stylizing: 'Painting anime frames',
  encoding: 'Building your video',
  uploading: 'Sending video to your computer',
  downloading: 'Downloading video and frames',
};

type Props = {
  engine: ProcessingEngine;
  connection: PythonConnection;
  video: PickedVideo;
  options: AnimeOptions;
  onDone: (result: ProcessResult) => void;
  onError: (message: string) => void;
};

/** Runs the pipeline end-to-end and shows live progress. */
export function ProcessingScreen(props: Props) {
  return props.engine === 'python' ? <PythonProcessingScreen {...props} /> : <DeviceProcessingScreen {...props} />;
}

function PythonProcessingScreen({ video, options, connection, onDone, onError }: Props) {
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [controller] = useState(() => new AbortController());
  useEffect(() => {
    let active = true;
    processWithPython(video, options, connection, p => { if (active) setProgress(p); }, controller.signal)
      .then(result => {
        if (active) onDone(result);
        else void FileSystem.deleteAsync(result.cacheDirectory ?? result.videoUri, { idempotent: true }).catch(() => {});
      }).catch(error => { if (active) onError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; controller.abort(); };
  }, []);
  const pct = progress && progress.total > 0 ? Math.min(1, progress.value / progress.total) : 0;
  return <View style={styles.container}>
    <Text style={styles.label}>{progress ? STAGE_LABEL[progress.stage] : 'Connecting to Python'}...</Text>
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} /></View>
    {progress && <Text style={styles.count}>{progress.value} / {progress.total}</Text>}
    <Text style={styles.hint}>OpenCV is running on your computer. Keep both devices connected.</Text>
    <View style={{ marginTop: 24 }}><PrimaryButton title="Cancel" variant="ghost" onPress={() => controller.abort()} /></View>
  </View>;
}

function DeviceProcessingScreen({ video, options, onDone, onError }: Props) {
  const [sampling, setSampling] = useState({ value: 0, total: 1 });
  const { process, host, progress } = useAnimeProcessor();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let frameUris: string[] = [];
      try {
        frameUris = await sampleFrames(video, options, (value, total) => { if (!cancelled) setSampling({ value, total }); });
        if (cancelled) return;
        const result = await process(frameUris, options);
        if (!cancelled) onDone(result);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      } finally {
        await Promise.all(frameUris.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})));
      }
    })();
    return () => {
      cancelled = true;
    };
    // process/host are stable for the life of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = progress ? STAGE_LABEL[progress.stage] ?? 'Working' : 'Reading video frames';
  const pct = progress && progress.total > 0 ? progress.value / progress.total : sampling.value / sampling.total;

  return (
    <View style={styles.container}>
      {host}
      <Text style={styles.emoji}>🎬</Text>
      <Text style={styles.label}>{label}…</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>

      {progress && progress.total > 0 && (
        <Text style={styles.count}>
          {progress.value} / {progress.total}
        </Text>
      )}
      <Text style={styles.hint}>Everything runs on your device.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 64, marginBottom: 20 },
  label: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 20 },
  track: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 5, backgroundColor: theme.primary },
  count: { color: theme.muted, marginTop: 12, fontSize: 15 },
  hint: { color: theme.muted, marginTop: 6, fontSize: 13 },
});
