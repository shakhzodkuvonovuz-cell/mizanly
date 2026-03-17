import React from 'react';
import { Platform, View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';

interface WebSafeBlurViewProps {
  /** Blur intensity (0–100). Maps to CSS blur px on web, expo-blur intensity on native. */
  intensity?: number;
  /** Tint style. Used by expo-blur on native; on web, sets a semi-transparent overlay. */
  tint?: 'light' | 'dark' | 'default';
  /** Style applied to the container */
  style?: StyleProp<ViewStyle>;
  /** Children to render inside the blur */
  children?: React.ReactNode;
}

const TINT_COLORS: Record<string, string> = {
  dark: 'rgba(13, 17, 23, 0.85)',
  light: 'rgba(255, 255, 255, 0.7)',
  default: 'rgba(128, 128, 128, 0.5)',
};

/**
 * Cross-platform blur view.
 * - On iOS/Android: renders expo-blur's BlurView.
 * - On web: renders a View with a semi-transparent background fallback.
 *
 * expo-blur does support web via CSS backdrop-filter in SDK 52, but some older
 * browsers don't support it. This wrapper provides a solid fallback background
 * on web so content remains readable regardless of browser support.
 */
export function WebSafeBlurView({
  intensity = 50,
  tint = 'dark',
  style,
  children,
}: WebSafeBlurViewProps) {
  if (Platform.OS === 'web') {
    const backgroundColor = TINT_COLORS[tint] ?? TINT_COLORS.dark;

    return (
      <View style={[{ backgroundColor }, style]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}
