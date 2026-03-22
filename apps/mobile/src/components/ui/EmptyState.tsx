import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { GradientButton } from './GradientButton';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Icon>['name'];
  illustration?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, illustration, title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
  const tc = useThemeColors();
  const reducedMotion = useReducedMotion();

  const ctaScale = useSharedValue(1);

  useEffect(() => {
    if (actionLabel && onAction && !reducedMotion) {
      ctaScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1500 }),
          withTiming(1, { duration: 1500 }),
        ),
        -1,
        true,
      );
    }
  }, [actionLabel, onAction, reducedMotion, ctaScale]);

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const enterDuration = reducedMotion ? 0 : 400;

  return (
    <View style={[styles.container, style]}>
      {illustration ? (
        <Animated.View
          entering={FadeInUp.delay(0).duration(enterDuration).springify()}
          style={styles.illustrationWrap}
        >
          {illustration}
        </Animated.View>
      ) : icon ? (
        <Animated.View
          entering={FadeInUp.delay(0).duration(enterDuration).springify()}
          style={[styles.iconWrap, { backgroundColor: tc.bgElevated }]}
        >
          <Icon name={icon} size="xl" color={tc.text.tertiary} />
        </Animated.View>
      ) : null}

      <Animated.Text
        entering={FadeInUp.delay(reducedMotion ? 0 : 80).duration(enterDuration).springify()}
        style={[styles.title, { color: tc.text.primary }]}
      >
        {title}
      </Animated.Text>

      {subtitle && (
        <Animated.Text
          entering={FadeInUp.delay(reducedMotion ? 0 : 160).duration(enterDuration).springify()}
          style={[styles.subtitle, { color: tc.text.secondary }]}
        >
          {subtitle}
        </Animated.Text>
      )}

      {actionLabel && onAction && (
        <Animated.View
          entering={FadeInUp.delay(reducedMotion ? 0 : 240).duration(enterDuration).springify()}
          style={[styles.actionWrap, ctaAnimatedStyle]}
        >
          <GradientButton label={actionLabel} onPress={onAction} size="sm" />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  illustrationWrap: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionWrap: {
    marginTop: spacing.md,
  },
});
