import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { animation } from '@/theme';

interface Options {
  scaleTo?: number;
  spring?: { damping: number; stiffness: number; mass?: number };
}

export function useAnimatedPress(options?: Options) {
  const { scaleTo = 0.92, spring = animation.spring.bouncy } = options ?? {};
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(scaleTo, spring);
  }, [scale, scaleTo, spring]);

  const onPressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, spring);
  }, [scale, spring]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { onPressIn, onPressOut, animatedStyle, scale };
}
