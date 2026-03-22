import { useCallback, memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { animation, colors, spacing, fontSize } from '@/theme';

interface ActionButtonProps {
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  count?: number;
  isActive?: boolean;
  onPress: () => void;
  disabled?: boolean;
  activeColor?: string;
  hapticType?: 'like' | 'tick' | 'save' | 'navigate' | 'send' | 'delete' | 'follow';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const ActionButton = memo(function ActionButton({
  icon,
  activeIcon,
  count,
  isActive,
  onPress,
  disabled,
  activeColor = colors.like,
  hapticType = 'like',
  accessibilityLabel,
  accessibilityHint,
}: ActionButtonProps) {
  const scale = useSharedValue(1);
  const haptic = useContextualHaptic();

  const handlePress = useCallback(() => {
    if (disabled) return;
    // Fluid splash animation
    scale.value = withSequence(
      withTiming(0.7, { duration: 100 }),
      withSpring(isActive ? 1.0 : 1.15, animation.spring.fluid),
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
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
    >
      {isActive && activeIcon ? activeIcon : icon}
      {count !== undefined && count > 0 && (
        <Text
          style={[
            styles.count,
            isActive && { color: activeColor },
          ]}
        >
          {formatCount(count)}
        </Text>
      )}
    </AnimatedPressable>
  );
});

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
