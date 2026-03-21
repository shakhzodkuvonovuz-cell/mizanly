import { useCallback, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon } from '@/components/ui/Icon';
import { colors, animation, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

interface DoubleTapHeartProps {
  children: React.ReactNode;
  onDoubleTap: () => void;
  disabled?: boolean;
}

/**
 * Double-tap heart burst animation wrapper.
 * Wraps content and shows a heart burst animation on double-tap.
 * Includes particle effects, scale, and glow.
 */
export const DoubleTapHeart = memo(function DoubleTapHeart({
  children,
  onDoubleTap,
  disabled,
}: DoubleTapHeartProps) {
  const haptic = useHaptic();
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const particle1 = useSharedValue(0);
  const particle2 = useSharedValue(0);

  const triggerAnimation = useCallback(() => {
    haptic.medium();
    onDoubleTap();

    // Heart scale up then fade
    heartScale.value = withSequence(
      withSpring(1.4, animation.spring.bouncy),
      withDelay(300, withTiming(0, { duration: 300 })),
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 300 })),
    );

    // Glow
    glowOpacity.value = withSequence(
      withTiming(0.6, { duration: 150 }),
      withTiming(0, { duration: 500 }),
    );

    // Particles burst
    particle1.value = 0;
    particle1.value = withSequence(
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 200 }),
    );
    particle2.value = 0;
    particle2.value = withDelay(
      50,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 200 }),
      ),
    );
  }, [onDoubleTap, haptic, heartScale, heartOpacity, glowOpacity, particle1, particle2]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(!disabled)
    .onEnd(() => {
      runOnJS(triggerAnimation)();
    });

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const particleStyle1 = useAnimatedStyle(() => ({
    transform: [
      { translateY: -particle1.value * 30 },
      { translateX: particle1.value * 15 },
      { scale: 1 - particle1.value * 0.5 },
    ],
    opacity: particle1.value > 0 ? 1 - particle1.value : 0,
  }));

  const particleStyle2 = useAnimatedStyle(() => ({
    transform: [
      { translateY: -particle2.value * 25 },
      { translateX: -particle2.value * 20 },
      { scale: 1 - particle2.value * 0.5 },
    ],
    opacity: particle2.value > 0 ? 1 - particle2.value : 0,
  }));

  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === 'activate' && !disabled) {
      triggerAnimation();
    }
  }, [disabled, triggerAnimation]);

  return (
    <GestureDetector gesture={doubleTap}>
      <View
        style={styles.container}
        accessibilityActions={[{ name: 'activate', label: 'Like' }]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        {children}
        {/* Heart overlay */}
        <View style={styles.heartContainer} pointerEvents="none">
          <Animated.View style={[styles.glow, glowStyle]} />
          <Animated.View style={heartStyle}>
            <Icon name="heart-filled" size={72} color={colors.error} />
          </Animated.View>
          {/* Particles */}
          <Animated.View style={[styles.particle, particleStyle1]}>
            <View style={[styles.particleDot, { backgroundColor: colors.error }]} />
          </Animated.View>
          <Animated.View style={[styles.particle, particleStyle2]}>
            <View style={[styles.particleDot, { backgroundColor: colors.gold }]} />
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  heartContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  particle: {
    position: 'absolute',
  },
  particleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
