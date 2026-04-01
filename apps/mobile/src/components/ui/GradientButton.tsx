import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize, fonts, spacing, radius } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import type { IconName } from '@/components/ui/Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface GradientButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: ButtonSize;
  accessibilityLabel?: string;
  accessibilityRole?: import('react-native').AccessibilityRole;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

const sizeConfig: Record<ButtonSize, {
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
}> = {
  sm: {
    height: 40, // minimum 40pt for WCAG touch target compliance (with borderRadius rounding)
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    iconSize: 16,
  },
  md: {
    height: 44,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    iconSize: 18,
  },
  lg: {
    height: 52,
    paddingHorizontal: spacing.xl,
    fontSize: fontSize.md,
    iconSize: 20,
  },
};

export function GradientButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  style: containerStyle,
}: GradientButtonProps) {
  const haptic = useContextualHaptic();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);
  const config = sizeConfig[size];
  const isDisabled = disabled || loading;

  const onPressIn = useCallback(() => {
    // Faster, deeper scale for satisfying press feel
    scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
  }, [scale]);

  const onPressOut = useCallback(() => {
    // Spring back with slight overshoot (bouncy)
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    haptic.navigate();
    onPress();
  }, [isDisabled, haptic, onPress]);

  // Pulse the emerald glow shadow while loading
  useEffect(() => {
    if (loading) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(0.3, { duration: 800 }),
        ),
        -1,
        true,
      );
    } else {
      glowOpacity.value = withTiming(0.3, { duration: 200 });
    }
  }, [loading, glowOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shadowAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowOpacity.value,
  }));

  const textColor =
    variant === 'primary'
      ? '#FFFFFF'
      : colors.emerald;

  const renderContent = () => (
    <View style={[styles.content, { height: config.height }]}>
      {/* Always render label (+ icon) to preserve intrinsic width; hide when loading */}
      <View style={[styles.content, loading && styles.hiddenContent]}>
        {icon ? (
          <View style={styles.iconWrapper}>
            <Icon name={icon} size={config.iconSize} color={textColor} />
          </View>
        ) : null}
        <Text
          style={[
            styles.label,
            {
              fontSize: config.fontSize,
              color: textColor,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {/* Overlay skeleton when loading — positioned absolutely so it doesn't affect layout */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <Skeleton.Rect width={config.iconSize} height={config.iconSize} borderRadius={config.iconSize / 2} />
        </View>
      )}
    </View>
  );

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        style={[
          animatedStyle,
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          containerStyle,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        <Animated.View
          style={[
            styles.primaryShadow,
            { borderRadius: config.height / 2 },
            shadowAnimatedStyle,
          ]}
        >
          <LinearGradient
            colors={[colors.emeraldLight, colors.emerald]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.primaryContainer,
              {
                height: config.height,
                paddingHorizontal: config.paddingHorizontal,
                borderRadius: config.height / 2,
              },
            ]}
          >
            {renderContent()}
          </LinearGradient>
        </Animated.View>
      </AnimatedPressable>
    );
  }

  if (variant === 'secondary') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        style={[
          animatedStyle,
          styles.secondaryContainer,
          {
            height: config.height,
            paddingHorizontal: config.paddingHorizontal,
            borderRadius: config.height / 2,
          },
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {renderContent()}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isDisabled}
      style={[
        animatedStyle,
        styles.ghostContainer,
        {
          height: config.height,
          paddingHorizontal: config.paddingHorizontal,
        },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {renderContent()}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenContent: {
    opacity: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.2,
  },
  iconWrapper: {
    marginEnd: spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  primaryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryShadow: {
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  ghostContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
