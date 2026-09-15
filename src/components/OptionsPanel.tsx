import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { DEFAULT_OPTIONS, type AnimeOptions } from '../types';

const controls: { key: keyof AnimeOptions; label: string; hint: string; values: number[] }[] = [
  { key: 'paletteStrength', label: 'Anime color palette', hint: 'Adds warm highlights and cool blue shadows. Zero keeps the original color balance.', values: [0, 0.35, 0.65, 1] },
  { key: 'detail', label: 'Keep fine details', hint: 'Preserves small features and local contrast. Higher can reveal source noise.', values: [0, 0.5, 1, 1.5] },
  { key: 'celStrength', label: 'Anime shading strength', hint: 'Lower keeps more natural detail. Higher creates flatter color patches.', values: [0, 0.35, 0.55, 0.8, 1] },
  { key: 'smoothing', label: 'Texture smoothing', hint: 'OpenCV smooths colors while preserving boundaries. Higher removes more texture and takes longer.', values: [0, 1, 2, 3] },
  { key: 'levels', label: 'Shading bands', hint: 'Fewer bands give flatter cel shading.', values: [3, 4, 6, 8, 12] },
  { key: 'outlineStrength', label: 'Ink strength', hint: 'Zero disables outlines.', values: [0, 0.4, 0.75, 1] },
  { key: 'edgeThreshold', label: 'Outline threshold', hint: 'Higher keeps only stronger edges; useful for noisy clips.', values: [12, 18, 26, 40, 60] },
  { key: 'saturation', label: 'Color intensity', hint: 'Higher makes colors more vivid.', values: [0, 0.8, 1, 1.25, 1.5] },
  { key: 'contrast', label: 'Contrast', hint: 'Higher deepens shadows and brightens highlights.', values: [0.9, 1, 1.1, 1.3] },
  { key: 'fps', label: 'Frames per second', hint: 'Higher gives smoother motion but more processing.', values: [6, 12, 24] },
  { key: 'maxWidth', label: 'Resolution (longest side)', hint: 'Use 720 or 1080 for small facial features. Higher takes longer; cannot restore detail missing from the source.', values: [480, 640, 720, 1080] },
  { key: 'clipSeconds', label: 'First seconds to process', hint: 'Longer videos are trimmed to this duration. Output has no audio.', values: [2, 5, 10] },
  { key: 'temporalStrength', label: 'Motion smoothing', hint: 'Python engine: blends each frame along motion with the previous one to reduce flicker. Higher is steadier; too high can smear fast motion.', values: [0, 0.3, 0.6, 0.85] },
];

export function OptionsPanel({ options, onChange }: { options: AnimeOptions; onChange: (options: AnimeOptions) => void }) {
  return <View style={styles.panel}>
    <Text style={styles.title}>Your style</Text>
    <View style={styles.row}>
      {[
        { name: 'OpenCV anime', options: DEFAULT_OPTIONS },
        { name: 'Soft', options: { ...DEFAULT_OPTIONS, levels: 12, celStrength: 0.35, paletteStrength: 0.35, outlineStrength: 0.4, saturation: 1 } },
        { name: 'Bold ink', options: { ...DEFAULT_OPTIONS, levels: 4, celStrength: 1, outlineStrength: 1, edgeThreshold: 12, saturation: 1.5 } },
      ].map(preset => <Pressable key={preset.name} style={styles.chip} onPress={() => onChange({ ...preset.options, fps: options.fps, maxWidth: options.maxWidth, clipSeconds: options.clipSeconds })}><Text style={styles.text}>{preset.name}</Text></Pressable>)}
    </View>
    {controls.map(control => <View key={control.key} style={styles.control}>
      <Text style={styles.text}>{control.label}</Text>
      <Text style={styles.hint}>{control.hint}</Text>
      <View style={styles.row}>{control.values.map(value => <Pressable accessibilityRole="button" accessibilityLabel={`${control.label}: ${value}`} accessibilityState={{ selected: options[control.key] === value }} key={value} onPress={() => onChange({ ...options, [control.key]: value })} style={[styles.chip, options[control.key] === value && styles.active]}><Text style={styles.text}>{value}</Text></Pressable>)}</View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 16 }, title: { color: theme.text, fontSize: 24, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, control: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.surfaceAlt },
  active: { backgroundColor: theme.primary }, text: { color: theme.text, fontWeight: '600' }, hint: { color: theme.muted, lineHeight: 20 },
});
