import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type IconAnimation = 'bounce' | 'shake' | 'pulse' | 'spin';

/**
 * Provides triggered animations for icons.
 *
 * Usage:
 *   const { animatedStyle, trigger } = useAnimatedIcon('bounce');
 *
 *   <Animated.View style={animatedStyle}>
 *     <Icon name="heart-filled" ... />
 *   </Animated.View>
 *
 *   // On like:
 *   trigger();
 */
export function useAnimatedIcon(type: IconAnimation = 'bounce') {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  const trigger = useCallback(() => {
    switch (type) {
      case 'bounce':
        // Heart-like bounce: scale up then settle
        scale.value = withSequence(
          withSpring(1.3, { damping: 4, stiffness: 300 }),
          withSpring(0.9, { damping: 4, stiffness: 300 }),
          withSpring(1, { damping: 10, stiffness: 200 }),
        );
        break;

      case 'shake':
        // Bell shake: rotate left-right rapidly
        rotation.value = withSequence(
          withTiming(-12, { duration: 50 }),
          withTiming(12, { duration: 50 }),
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-4, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
        break;

      case 'pulse':
        // Scale pulse: scale up and back
        scale.value = withSequence(
          withSpring(1.2, { damping: 8, stiffness: 300 }),
          withSpring(1, { damping: 10, stiffness: 200 }),
        );
        break;

      case 'spin':
        // Full rotation
        rotation.value = 0;
        rotation.value = withTiming(360, { duration: 500 });
        break;
    }
  }, [type, scale, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return { animatedStyle, trigger };
}
