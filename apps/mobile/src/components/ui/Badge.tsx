import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, animation, spacing } from '@/theme';

interface BadgeProps {
  count: number;
  color?: string;
  size?: 'sm' | 'md';
  style?: object;
}

export function Badge({ count, color = colors.error, size = 'sm', style }: BadgeProps) {
  const scale = useSharedValue(0);

  useEffect(() => {
    if (count > 0) {
      scale.value = 0;
      scale.value = withSpring(1, animation.spring.bouncy);
    } else {
      scale.value = withSpring(0, animation.spring.bouncy);
    }
  }, [count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (count <= 0) return null;

  const isSm = size === 'sm';
  const minW = isSm ? 16 : 20;
  const h = isSm ? 16 : 20;
  const fs = isSm ? 9 : 11;

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: color,
          minWidth: minW,
          height: h,
          borderRadius: h / 2,
        },
        animatedStyle,
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: fs }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </Animated.View>
  );
}

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
