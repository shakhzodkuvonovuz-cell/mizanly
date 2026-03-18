import React, { useCallback } from 'react';
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
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize, fonts, spacing, radius, animation } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
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
  accessibilityRole?: string;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

const sizeConfig: Record<ButtonSize, {
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
}> = {
  sm: {
    height: 36,
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
  const haptic = useHaptic();
  const scale = useSharedValue(1);
  const config = sizeConfig[size];
  const isDisabled = disabled || loading;

  const onPressIn = useCallback(() => {
    scale.value = withSpring(0.96, animation.spring.snappy);
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, animation.spring.snappy);
  }, [scale]);

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    haptic.light();
    onPress();
  }, [isDisabled, haptic, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const textColor =
    variant === 'primary'
      ? '#FFFFFF'
      : colors.emerald;

  const renderContent = () => (
    <View style={[styles.content, { height: config.height }]}>
      {loading ? (
        <Skeleton.Rect width={config.iconSize} height={config.iconSize} borderRadius={config.iconSize / 2} />
      ) : (
        <>
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
        </>
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
            styles.primaryShadow,
          ]}
        >
          {renderContent()}
        </LinearGradient>
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
  label: {
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.2,
  },
  iconWrapper: {
    marginRight: spacing.sm,
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
