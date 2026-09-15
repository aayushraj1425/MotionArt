import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { pickVideo } from '../services/VideoPicker';
import { theme } from '../theme';
import type { PickedVideo } from '../types';

type Props = {
  onPicked: (video: PickedVideo) => void;
};

/** Landing screen: explain the app and pick a source video. */
export function HomeScreen({ onPicked }: Props) {
  const [busy, setBusy] = useState(false);

  const handlePick = async () => {
    try {
      setBusy(true);
      const video = await pickVideo();
      if (video) onPicked(video);
    } catch (err) {
      Alert.alert('Motion Art', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.badge}>ON-DEVICE</Text>
        <Text style={styles.title}>Motion Art</Text>
        <Text style={styles.subtitle}>
          Turn a short clip into anime-style motion. Frames are stylized and
          rebuilt into a video right on your phone — nothing leaves the device.
        </Text>
      </View>

      <View style={styles.steps}>
        <Step n="1" label="Pick a short video" />
        <Step n="2" label="We stylize the frames" />
        <Step n="3" label="Preview & save a frame" />
      </View>

      <PrimaryButton title="Pick a video" onPress={handlePick} loading={busy} />
    </View>
  );
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepDot}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  hero: { marginTop: 24 },
  badge: {
    color: theme.accent,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: 8,
  },
  title: { color: theme.text, fontSize: 42, fontWeight: '800' },
  subtitle: { color: theme.muted, fontSize: 16, lineHeight: 24, marginTop: 12 },
  steps: { gap: 18 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { color: theme.text, fontWeight: '800' },
  stepLabel: { color: theme.text, fontSize: 16 },
});
