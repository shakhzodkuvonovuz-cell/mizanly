import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useStore } from '@/store';

/**
 * Hook to detect and respect reduced motion preference.
 * Checks both system settings and app settings.
 */
export function useReducedMotion(): boolean {
  const [systemPrefersReduced, setSystemPrefersReduced] = useState(false);
  const appReducedMotion = useStore((s) => s.reducedMotion);

  useEffect(() => {
    // Check system preference
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemPrefersReduced);

    // Listen for changes
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemPrefersReduced,
    );

    return () => listener.remove();
  }, []);

  return systemPrefersReduced || appReducedMotion;
}

/**
 * Returns animation config that respects reduced motion.
 * When reduced motion is on, returns instant timing instead of spring.
 */
export function useAccessibleAnimation() {
  const reducedMotion = useReducedMotion();

  return {
    reducedMotion,
    // Spring config: instant if reduced, bouncy otherwise
    spring: reducedMotion
      ? { duration: 0 }
      : { damping: 10, stiffness: 400 },
    // Timing duration: 0 if reduced, normal otherwise
    duration: (normalMs: number) => (reducedMotion ? 0 : normalMs),
  };
}
