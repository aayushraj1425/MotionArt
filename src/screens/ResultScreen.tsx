import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { FrameStrip } from '../components/FrameStrip';
import { PrimaryButton } from '../components/PrimaryButton';
import { saveDataUrlToGallery } from '../services/GallerySaver';
import { theme } from '../theme';
import type { ProcessResult, StylizedFrame } from '../types';

type Props = {
  result: ProcessResult;
  onRestart: () => void;
};

/** Preview the generated video, then pick and save one frame. */
export function ResultScreen({ result, onRestart }: Props) {
  const [selected, setSelected] = useState<StylizedFrame | null>(result.frames[0] ?? null);
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(result.videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  const handleSave = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      await saveDataUrlToGallery(selected.dataUrl);
      Alert.alert('Saved', 'The frame is now in your Photos.');
    } catch (err) {
      Alert.alert('Motion Art', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Motion Art</Text>

      <View style={styles.player}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
        />
      </View>

      <Text style={styles.section}>Pick a frame to save</Text>
      <FrameStrip
        frames={result.frames}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <View style={styles.actions}>
        <PrimaryButton
          title="Save frame to gallery"
          onPress={handleSave}
          loading={saving}
          disabled={!selected}
        />
        <PrimaryButton title="Make another" variant="ghost" onPress={onRestart} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  heading: { color: theme.text, fontSize: 26, fontWeight: '800' },
  player: {
    flex: 1,
    borderRadius: theme.radius,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { flex: 1 },
  section: { color: theme.muted, fontSize: 14, fontWeight: '600' },
  actions: { gap: 12 },
});
