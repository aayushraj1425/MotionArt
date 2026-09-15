import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { OptionsPanel } from '../components/OptionsPanel';
import { pickVideo } from '../services/VideoPicker';
import { theme } from '../theme';
import type { AnimeOptions, PickedVideo, ProcessingEngine, PythonConnection } from '../types';

type Props = {
  engine: ProcessingEngine;
  onEngineChange: (engine: ProcessingEngine) => void;
  connection: PythonConnection;
  onConnectionChange: (connection: PythonConnection) => void;
  video: PickedVideo | null;
  options: AnimeOptions;
  onOptionsChange: (options: AnimeOptions) => void;
  onPicked: (video: PickedVideo) => void;
};
export function HomeScreen({ video, options, onOptionsChange, onPicked, engine, onEngineChange, connection, onConnectionChange }: Props) {
  const [picked, setPicked] = useState(video);
  const [busy, setBusy] = useState(false);
  const handlePick = async () => {
    try { setBusy(true); const clip = await pickVideo(); if (clip) setPicked(clip); }
    catch (err) { Alert.alert('Motion Art', err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.badge}>OPENCV • NO AI OR CLOUD SERVICES</Text>
    <Text style={styles.title}>Motion Art</Text>
    <Text style={styles.subtitle}>Choose where to process your video. Python uses OpenCV's photo rendering tools on your computer.</Text>
    <View style={{ gap: 10 }}>
      <PrimaryButton title={engine === 'python' ? 'Selected: Python on computer' : 'Use Python on computer'} variant={engine === 'python' ? 'primary' : 'ghost'} onPress={() => onEngineChange('python')} />
      <PrimaryButton title={engine === 'device' ? 'Selected: Phone only' : 'Use phone only'} variant={engine === 'device' ? 'primary' : 'ghost'} onPress={() => onEngineChange('device')} />
    </View>
    {engine === 'python' ? <View style={{ gap: 10 }}>
      <Text style={styles.subtitle}>Start the Python processor on your computer. Enter its Wi-Fi address and pairing code below. Creating a video sends the selected clip to that computer and downloads the results.</Text>
      <TextInput accessibilityLabel="Computer address" style={styles.input} placeholder="http://192.168.1.10:8000" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" value={connection.url} onChangeText={url => onConnectionChange({ ...connection, url })} />
      <TextInput accessibilityLabel="Pairing code" style={styles.input} placeholder="Pairing code from Python terminal" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry value={connection.code} onChangeText={code => onConnectionChange({ ...connection, code })} />
    </View> : <Text style={styles.subtitle}>All processing stays on your phone. No computer connection is needed.</Text>}
    <PrimaryButton title={picked ? 'Choose a different video' : 'Pick a video'} onPress={handlePick} loading={busy} />
    {picked && <Text style={styles.subtitle}>Video selected · {picked.durationMs ? (picked.durationMs / 1000).toFixed(1) + ' seconds' : 'duration unavailable'}</Text>}
    <OptionsPanel options={options} onChange={onOptionsChange} />
    <Text style={styles.subtitle}>Processes up to the first {options.clipSeconds} seconds at {options.fps} fps. Export is silent. Try 2 seconds first to compare settings.</Text>
    <PrimaryButton title="Create anime video" disabled={!picked || busy || (engine === 'python' && (!connection.url.trim() || !connection.code.trim()))} onPress={() => picked && onPicked(picked)} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, paddingBottom: 48 },
  badge: { color: theme.accent, fontWeight: '800', fontSize: 12 },
  title: { color: theme.text, fontSize: 40, fontWeight: '800' },
  subtitle: { color: theme.muted, fontSize: 15, lineHeight: 22 },
  input: { color: theme.text, backgroundColor: theme.surface, padding: 14, borderRadius: 12, fontSize: 15 },
});
