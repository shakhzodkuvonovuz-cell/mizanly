import { useEffect, useRef, memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { colors, animation, spacing, radius } from '@/theme';

interface BadgeProps {
  count: number;
  color?: string;
  size?: 'sm' | 'md';
  style?: object;
  accessibilityLabel?: string;
}

export const Badge = memo(function Badge({ count, color = colors.error, size = 'sm', style, accessibilityLabel }: BadgeProps) {
  const scale = useSharedValue(count > 0 ? 1 : 0);
  const prevCount = useRef(count);

  useEffect(() => {
    const wasZero = prevCount.current <= 0;
    const isPositive = count > 0;
    prevCount.current = count;

    if (isPositive && wasZero) {
      // Appearing: 0 -> positive — bounce in
      scale.value = withSequence(
        withSpring(1.3, animation.spring.bouncy),
        withSpring(1, animation.spring.responsive),
      );
    } else if (!isPositive) {
      // Disappearing: positive -> 0 — scale out
      scale.value = withSpring(0, animation.spring.bouncy);
    }
    // Count changing within positive range (e.g. 5->6): no animation, stays at scale 1
  }, [count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (count <= 0) return null;

  const isSm = size === 'sm';
  const minW = isSm ? 16 : 20;
  const h = isSm ? 16 : 20;
  const fs = isSm ? 9 : 11;

  const displayText = count > 99 ? '99+' : String(count);
  const defaultLabel = `${displayText} ${count === 1 ? 'notification' : 'notifications'}`;

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel || defaultLabel}
      accessibilityRole="text"
      style={[
        styles.badge,
        {
          backgroundColor: color,
          minWidth: minW,
          height: h,
          borderRadius: radius.full,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 4,
          elevation: 3,
        },
        animatedStyle,
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: fs }]}>
        {displayText}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  text: {
    color: colors.text.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
});
