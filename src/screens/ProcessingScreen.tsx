import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAnimeProcessor } from '../processing/useAnimeProcessor';
import { sampleFrames } from '../services/FrameSampler';
import { theme } from '../theme';
import { DEFAULT_OPTIONS, type PickedVideo, type ProcessResult } from '../types';

/** How many frames we sample across the clip. */
const FRAME_COUNT = 20;

const STAGE_LABEL: Record<string, string> = {
  loading: 'Reading frames',
  stylizing: 'Painting anime frames',
  encoding: 'Building your video',
};

type Props = {
  video: PickedVideo;
  onDone: (result: ProcessResult) => void;
  onError: (message: string) => void;
};

/** Runs the pipeline end-to-end and shows live progress. */
export function ProcessingScreen({ video, onDone, onError }: Props) {
  const { process, host, progress } = useAnimeProcessor();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const frameUris = await sampleFrames(video, FRAME_COUNT);
        if (cancelled) return;
        const result = await process(frameUris, DEFAULT_OPTIONS);
        if (!cancelled) onDone(result);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // process/host are stable for the life of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = progress ? STAGE_LABEL[progress.stage] ?? 'Working' : 'Warming up';
  const pct = progress && progress.total > 0 ? progress.value / progress.total : 0;

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
