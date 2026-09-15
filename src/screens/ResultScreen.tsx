import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FrameStrip } from '../components/FrameStrip';
import { PrimaryButton } from '../components/PrimaryButton';
import { saveDataUrlToGallery, saveVideoToGallery } from '../services/GallerySaver';
import { theme } from '../theme';
import type { ProcessResult, StylizedFrame } from '../types';

type Props = {
  result: ProcessResult;
  onRestart: () => void;
  onAdjust: () => void;
};

/** Preview the generated video, then pick and save one frame. */
export function ResultScreen({ result, onRestart, onAdjust }: Props) {
  const [selected, setSelected] = useState<StylizedFrame | null>(result.frames[0] ?? null);
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(result.videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  const handleSave = async (video = false) => {
    if (!video && !selected) return;
    try {
      setSaving(true);
      if (video) await saveVideoToGallery(result.videoUri);
      else await saveDataUrlToGallery(selected!.dataUrl);
      Alert.alert('Saved', video ? 'The video is now in your Photos / Gallery.' : 'The frame is now in your Photos / Gallery.');
    } catch (err) {
      Alert.alert('Motion Art', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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

      {selected && <Image source={{ uri: selected.dataUrl }} style={{ height: 220, width: '100%' }} resizeMode="contain" />}
      <Text style={styles.section}>Silent video · {result.frames.length} processed frames</Text>
      <View style={styles.actions}>
        <PrimaryButton title="Save video to gallery" onPress={() => handleSave(true)} loading={saving} />
        <PrimaryButton
          title="Save frame to gallery"
          onPress={() => handleSave()}
          loading={saving}
          disabled={!selected || saving}
        />
        <PrimaryButton title="Adjust style & try again" variant="ghost" disabled={saving} onPress={onAdjust} />
        <PrimaryButton disabled={saving} title="Make another" variant="ghost" onPress={onRestart} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  heading: { color: theme.text, fontSize: 26, fontWeight: '800' },
  player: {
    height: 280,
    borderRadius: theme.radius,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { flex: 1 },
  section: { color: theme.muted, fontSize: 14, fontWeight: '600' },
  actions: { gap: 12 },
});
