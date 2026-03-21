import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
}

/**
 * Crossfade wrapper: content fades in when it mounts.
 * Use to wrap content that replaces a Skeleton loading state.
 *
 * Usage:
 *   {isLoading ? <Skeleton.PostCard /> : <FadeIn><PostCard /></FadeIn>}
 */
export function FadeIn({ children, duration = 300, delay = 0, style }: FadeInProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    const startFade = () => {
      opacity.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    };
    if (delay > 0) {
      const timer = setTimeout(startFade, delay);
      return () => clearTimeout(timer);
    }
    startFade();
  }, [opacity, duration, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
