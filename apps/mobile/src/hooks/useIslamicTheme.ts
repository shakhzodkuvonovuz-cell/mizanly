import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/store';
import { getActiveIslamicTheme, isEidToday, type IslamicThemeOverride } from '@/theme/islamicThemes';

/**
 * Shared minute-key hook — ticks every 60s.
 * Used by both useIslamicTheme and useIsEidToday so only 1 interval runs.
 */
function useMinuteKey(): number {
  const [minuteKey, setMinuteKey] = useState(() => Math.floor(Date.now() / 60000));

  useEffect(() => {
    const interval = setInterval(() => {
      setMinuteKey(Math.floor(Date.now() / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return minuteKey;
}

/**
 * Returns the active Islamic theme override if enabled by the user.
 * Used to apply Ramadan/Eid/Jummah accent colors and decorations.
 * Recalculates every minute to detect date/time changes (e.g., Jummah start).
 */
export function useIslamicTheme(): IslamicThemeOverride | null {
  const islamicThemeEnabled = useStore((s) => s.islamicThemeEnabled);
  const minuteKey = useMinuteKey();

  return useMemo(() => {
    if (!islamicThemeEnabled) return null;
    return getActiveIslamicTheme();
  }, [islamicThemeEnabled, minuteKey]);
}

/**
 * Returns true if it's Eid today and the user has Islamic themes enabled.
 * Recalculates every minute to detect date changes at midnight.
 */
export function useIsEidToday(): boolean {
  const islamicThemeEnabled = useStore((s) => s.islamicThemeEnabled);
  const minuteKey = useMinuteKey();

  return useMemo(() => {
    if (!islamicThemeEnabled) return false;
    return isEidToday();
  }, [islamicThemeEnabled, minuteKey]);
}
