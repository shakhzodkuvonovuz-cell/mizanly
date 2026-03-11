import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { animation } from '@/theme';

interface EntranceAnimationOptions {
  delay?: number;
  translateY?: number;
  duration?: number;
}

export function useEntranceAnimation(options?: EntranceAnimationOptions) {
  const {
    delay = 0,
    translateY: initialTranslateY = 20,
    duration = animation.timing.normal,
  } = options ?? {};

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(initialTranslateY);

  const timingConfig = {
    duration,
    easing: Easing.out(Easing.cubic),
  };

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, timingConfig));
    translateY.value = withDelay(delay, withTiming(0, timingConfig));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return { animatedStyle };
}
