import { useMemo } from 'react';
import { useStore } from '@/store';
import { colors, getThemeColors } from '@/theme';

/**
 * Hook that returns theme-aware surface and text colors.
 * Components should use this instead of hardcoding colors.dark.*.
 *
 * Usage:
 *   const tc = useThemeColors();
 *   style={{ backgroundColor: tc.bg, borderColor: tc.border }}
 *   <Text style={{ color: tc.text.primary }}>Hello</Text>
 */
export function useThemeColors() {
  const theme = useStore(s => s.theme);
  return useMemo(() => getThemeColors(theme), [theme]);
}

/**
 * Shorthand for the most common pattern: just the background color.
 */
export function useThemeBg() {
  const theme = useStore(s => s.theme);
  return theme === 'light' ? colors.light.bg : colors.dark.bg;
}
