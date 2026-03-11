import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { animation, colors, fontSize, radius, spacing } from '@/theme';

export function CaughtUpCard() {
  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
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
  }, []);

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
        {/* Expanding ring behind check */}
        <Animated.View style={[styles.ring, ringStyle]} />
        {/* Check circle */}
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Icon name="check" size="lg" color="#FFFFFF" />
        </Animated.View>
      </View>

      <Animated.Text style={[styles.title, textStyle]}>
        You're all caught up
      </Animated.Text>
      <Animated.Text style={[styles.subtitle, textStyle]}>
        You've seen all new posts from the last 3 days
      </Animated.Text>
    </View>
  );
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
