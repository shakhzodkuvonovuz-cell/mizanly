import React, { useEffect, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { animation, colors, fontSize, radius, spacing } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Confetti particle positions (pre-computed for performance)
const CONFETTI_PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  angle: (i / 12) * Math.PI * 2,
  color: i % 3 === 0 ? colors.emerald : i % 3 === 1 ? colors.gold : '#E8E8E8',
  size: 4 + (i % 3) * 2,
}));

export const CaughtUpCard = memo(function CaughtUpCard() {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const reducedMotion = useReducedMotion();
  const checkScale = useSharedValue(reducedMotion ? 1 : 0);
  const ringScale = useSharedValue(reducedMotion ? 1.4 : 0.8);
  const ringOpacity = useSharedValue(reducedMotion ? 0.3 : 0);
  const textOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const confettiProgress = useSharedValue(0);

  useEffect(() => {
    // Skip animations when reduced motion is enabled — show final state immediately
    if (reducedMotion) {
      checkScale.value = 1;
      ringScale.value = 1.4;
      ringOpacity.value = 0.3;
      textOpacity.value = 1;
      haptic.success();
      return;
    }

    // 1. Check icon scales in with bounce (after 200ms delay)
    checkScale.value = withDelay(
      200,
      withSpring(1, animation.spring.bouncy),
    );

    // 2. Ring expands + fades to 0.3 (after 400ms delay)
    ringScale.value = withDelay(
      400,
      withSpring(1.4, animation.spring.gentle),
    );
    ringOpacity.value = withDelay(
      400,
      withSpring(0.3, animation.spring.gentle),
    );

    // 3. Text fades in (after 500ms delay)
    textOpacity.value = withDelay(
      500,
      withTiming(1, { duration: 400 }),
    );

    // 4. Confetti burst (after 300ms)
    confettiProgress.value = withDelay(
      300,
      withSequence(
        withTiming(1, { duration: 600 }),
        withTiming(0, { duration: 400 }),
      ),
    );

    // 5. Success haptic (via Reanimated delay to avoid bare setTimeout)
    const hapticTimer = setTimeout(() => haptic.success(), 300);
    return () => clearTimeout(hapticTimer);
  }, [reducedMotion]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        {/* Confetti particles */}
        {CONFETTI_PARTICLES.map((particle) => (
          <ConfettiDot key={particle.id} particle={particle} progress={confettiProgress} />
        ))}
        {/* Expanding ring behind check */}
        <Animated.View style={[styles.ring, ringStyle]} />
        {/* Check circle */}
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Icon name="check" size="lg" color="#FFFFFF" />
        </Animated.View>
      </View>

      <Animated.Text style={[styles.title, textStyle]}>
        {t('saf.caughtUp.title')}
      </Animated.Text>
      <Animated.Text style={[styles.subtitle, textStyle]}>
        {t('saf.caughtUp.subtitle')}
      </Animated.Text>
    </View>
  );
});

// Confetti particle component
function ConfettiDot({
  particle,
  progress,
}: {
  particle: (typeof CONFETTI_PARTICLES)[0];
  progress: Animated.SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const distance = progress.value * 60;
    const x = Math.cos(particle.angle) * distance;
    const y = Math.sin(particle.angle) * distance;
    return {
      position: 'absolute',
      width: particle.size,
      height: particle.size,
      borderRadius: particle.size / 2,
      backgroundColor: particle.color,
      opacity: progress.value > 0 ? 1 - progress.value * 0.5 : 0,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: 1 - progress.value * 0.3 },
      ],
    };
  });

  return <Animated.View style={style} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.5,
  },
});
