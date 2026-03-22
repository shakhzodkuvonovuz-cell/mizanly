import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

/**
 * Provides staggered entrance animation for list items.
 * Each item fades in + slides up with a delay based on its index.
 * Uses cinematic easing: Easing.bezier(0.16, 1, 0.3, 1)
 *
 * Usage:
 *   const entranceStyle = useStaggeredEntrance(index);
 *   return <Animated.View style={entranceStyle}>...</Animated.View>
 *
 * @param index - Item index in the list (0-based)
 * @param options - Optional config for delay, duration, translateY
 */
export function useStaggeredEntrance(
  index: number,
  options?: {
    delay?: number; // base delay per item in ms (default: 40)
    duration?: number; // entrance duration in ms (default: 350)
    translateY?: number; // initial Y offset in px (default: 20)
    maxIndex?: number; // stop staggering after this index (default: 15)
  },
) {
  const { delay = 40, duration = 350, translateY = 20, maxIndex = 15 } = options ?? {};
  const reducedMotion = useReducedMotion();

  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const offset = useSharedValue(reducedMotion ? 0 : translateY);

  // Intentional fire-once pattern: entrance animation should only run on mount,
  // not re-trigger when options change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reducedMotion) return;
    // Clamp index so items beyond maxIndex appear without extra delay
    const clampedIndex = Math.min(index, maxIndex);
    const itemDelay = clampedIndex * delay;

    opacity.value = withDelay(itemDelay, withTiming(1, { duration }));
    offset.value = withDelay(
      itemDelay,
      withTiming(0, {
        duration,
        easing: Easing.bezier(0.16, 1, 0.3, 1), // cinematic curve
      }),
    );
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));
}
