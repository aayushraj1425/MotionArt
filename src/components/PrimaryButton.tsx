import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
};

/** One reusable button so every screen presses the same way. */
export function PrimaryButton({ title, onPress, disabled, loading, variant = 'primary' }: Props) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        ghost ? styles.ghost : styles.primary,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.primaryText} />
      ) : (
        <Text style={[styles.text, ghost && styles.ghostText]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: { backgroundColor: theme.primary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.muted },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { color: theme.primaryText, fontSize: 17, fontWeight: '700' },
  ghostText: { color: theme.text },
});
