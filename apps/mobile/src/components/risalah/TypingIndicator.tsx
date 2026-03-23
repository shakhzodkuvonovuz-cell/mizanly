import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize } from '@/theme';

interface TypingIndicatorProps {
  /** Label to show alongside the dots (e.g. "typing") */
  label?: string;
  /** Dot size in pixels. Default 5 */
  dotSize?: number;
  /** 'inline' = compact row for conversation list, 'bubble' = bouncing dots for chat view */
  variant?: 'inline' | 'bubble';
}

/**
 * Animated typing indicator with three bouncing/pulsing dots.
 *
 * - `variant="inline"` (default): opacity-pulsing dots for conversation list rows.
 * - `variant="bubble"`: vertically bouncing dots for chat message area.
 */
export function TypingIndicator({ label, dotSize = 5, variant = 'inline' }: TypingIndicatorProps) {
  const tc = useThemeColors();
  const dot1 = useSharedValue(variant === 'inline' ? 0.3 : 0);
  const dot2 = useSharedValue(variant === 'inline' ? 0.3 : 0);
  const dot3 = useSharedValue(variant === 'inline' ? 0.3 : 0);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 200 });

    if (variant === 'bubble') {
      // Bouncing dots (vertical translate)
      const bounce = (delay: number) =>
        withRepeat(
          withSequence(
            withTiming(0, { duration: delay }),
            withTiming(-4, { duration: 300, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
          ),
          -1,
        );
      dot1.value = bounce(0);
      dot2.value = bounce(150);
      dot3.value = bounce(300);
    } else {
      // Opacity pulsing dots
      const pulse = (sv: Animated.SharedValue<number>, delay: number) => {
        sv.value = withDelay(delay, withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.3, { duration: 400 }),
          ),
          -1,
          false,
        ));
      };
      pulse(dot1, 0);
      pulse(dot2, 150);
      pulse(dot3, 300);
    }

    return () => {
      fadeIn.value = 0;
    };
  }, [dot1, dot2, dot3, fadeIn, variant]);

  const containerFade = useAnimatedStyle(() => ({ opacity: fadeIn.value }));

  const s1 = useAnimatedStyle(() =>
    variant === 'bubble'
      ? { transform: [{ translateY: dot1.value }] }
      : { opacity: dot1.value }
  );
  const s2 = useAnimatedStyle(() =>
    variant === 'bubble'
      ? { transform: [{ translateY: dot2.value }] }
      : { opacity: dot2.value }
  );
  const s3 = useAnimatedStyle(() =>
    variant === 'bubble'
      ? { transform: [{ translateY: dot3.value }] }
      : { opacity: dot3.value }
  );

  const dotStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: colors.emerald,
  };

  return (
    <Animated.View style={[styles.row, containerFade]}>
      {label ? (
        <Text style={[styles.label, { color: tc.emerald }]}>{label}</Text>
      ) : null}
      <View style={styles.dots}>
        <Animated.View style={[dotStyle, s1]} />
        <Animated.View style={[dotStyle, s2]} />
        <Animated.View style={[dotStyle, s3]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    paddingTop: 2,
  },
  label: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    color: colors.emerald,
  },
});
