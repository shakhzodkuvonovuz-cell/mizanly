import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface PulseGlowOptions {
  minOpacity?: number;
  maxOpacity?: number;
  duration?: number;
}

export function usePulseGlow(options?: PulseGlowOptions) {
  const {
    minOpacity = 0.6,
    maxOpacity = 1.0,
    duration = 1500,
  } = options ?? {};

  const opacity = useSharedValue(minOpacity);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(maxOpacity, {
        duration: duration / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return { animatedStyle };
}
