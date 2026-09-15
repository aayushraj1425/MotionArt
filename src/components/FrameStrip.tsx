import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '../theme';
import type { StylizedFrame } from '../types';

type Props = {
  frames: StylizedFrame[];
  selectedId: string | null;
  onSelect: (frame: StylizedFrame) => void;
};

/** Horizontal, tappable filmstrip of generated frames. */
export function FrameStrip({ frames, selectedId, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {frames.map((frame) => {
        const selected = frame.id === selectedId;
        return (
          <Pressable key={frame.id} onPress={() => onSelect(frame)}>
            <View style={[styles.cell, selected && styles.selected]}>
              <Image source={{ uri: frame.dataUrl }} style={styles.thumb} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 4 },
  cell: {
    borderRadius: 12,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: theme.accent },
  thumb: { width: 84, height: 112, borderRadius: 9, backgroundColor: theme.surfaceAlt },
});
