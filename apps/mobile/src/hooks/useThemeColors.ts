import { useMemo, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { useStore } from '@/store';
import { colors, getThemeColors } from '@/theme';

/**
 * Hook that returns theme-aware surface and text colors.
 * Responds to OS theme changes when user selects "system" theme.
 */
export function useThemeColors() {
  const theme = useStore(s => s.theme);
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    if (theme !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, [theme]);

  return useMemo(() => getThemeColors(theme), [theme, systemScheme]);
}

/**
 * Shorthand for the most common pattern: just the background color.
 */
export function useThemeBg() {
  const tc = useThemeColors();
  return tc.bg;
}
