import { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useHaptic } from '@/hooks/useHaptic';
import { animation, colors, spacing, fontSize } from '@/theme';

interface ActionButtonProps {
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  count?: number;
  isActive?: boolean;
  onPress: () => void;
  disabled?: boolean;
  activeColor?: string;
  hapticType?: 'light' | 'medium';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ActionButton({
  icon,
  activeIcon,
  count,
  isActive,
  onPress,
  disabled,
  activeColor = colors.like,
  hapticType = 'medium',
}: ActionButtonProps) {
  const scale = useSharedValue(1);
  const haptic = useHaptic();

  const handlePress = useCallback(() => {
    if (disabled) return;
    // Bounce animation
    scale.value = withSequence(
      withSpring(0.8, animation.spring.bouncy),
      withSpring(isActive ? 1.0 : 1.2, animation.spring.bouncy),
      withSpring(1.0, animation.spring.responsive),
    );
    haptic[hapticType]();
    onPress();
  }, [disabled, scale, isActive, haptic, hapticType, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={4}
    >
      {isActive && activeIcon ? activeIcon : icon}
      {count !== undefined && count > 0 && (
        <Text
          style={[
            styles.count,
            isActive && { color: activeColor },
          ]}
        >
          {count}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  count: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
