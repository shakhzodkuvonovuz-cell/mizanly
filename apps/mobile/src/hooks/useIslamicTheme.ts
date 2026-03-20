import { useMemo } from 'react';
import { useStore } from '@/store';
import { getActiveIslamicTheme, isEidToday, type IslamicThemeOverride } from '@/theme/islamicThemes';

/**
 * Returns the active Islamic theme override if enabled by the user.
 * Used to apply Ramadan/Eid/Jummah accent colors and decorations.
 */
export function useIslamicTheme(): IslamicThemeOverride | null {
  const islamicThemeEnabled = useStore((s) => s.islamicThemeEnabled);

  return useMemo(() => {
    if (!islamicThemeEnabled) return null;
    return getActiveIslamicTheme();
  }, [islamicThemeEnabled]);
}

/**
 * Returns true if it's Eid today and the user has Islamic themes enabled.
 */
export function useIsEidToday(): boolean {
  const islamicThemeEnabled = useStore((s) => s.islamicThemeEnabled);
  return useMemo(() => {
    if (!islamicThemeEnabled) return false;
    return isEidToday();
  }, [islamicThemeEnabled]);
}
