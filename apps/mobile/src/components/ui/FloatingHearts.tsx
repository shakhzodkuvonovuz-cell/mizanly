import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface HeartParticle {
  id: number;
  x: number;
  driftX: number;
  rotation: number;
  size: number;
  targetY: number;
  delay: number;
}

interface FloatingHeartsProps {
  trigger: number;
  color?: string;
  count?: number;
}

function Heart({
  particle,
  color,
  onComplete,
}: {
  particle: HeartParticle;
  color: string;
  onComplete: (id: number) => void;
}) {
  const scale = useSharedValue(0.3);
  const translateX = useSharedValue(particle.x);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const d = particle.delay;

    scale.value = withDelay(
      d,
      withTiming(1, { duration: 200, easing: Easing.back(2) }),
    );

    rotate.value = withDelay(
      d,
      withTiming(particle.rotation, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    );

    translateY.value = withDelay(
      d,
      withTiming(particle.targetY, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    );

    translateX.value = withDelay(
      d,
      withTiming(particle.x + particle.driftX, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
    );

    opacity.value = withDelay(
      d + 100,
      withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) {
          runOnJS(onComplete)(particle.id);
        }
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps — all values are stable Reanimated SharedValues captured at mount
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.heart, animatedStyle]}>
      <Icon name="heart-filled" size={particle.size} color={color} />
    </Animated.View>
  );
}

export function FloatingHearts({ trigger, color, count = 8 }: FloatingHeartsProps) {
  const [particles, setParticles] = useState<HeartParticle[]>([]);
  const prevTrigger = useRef(trigger);
  const nextIdRef = useRef(0);
  const heartColor = color ?? colors.like;
  const reducedMotion = useReducedMotion();

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    if (trigger > prevTrigger.current) {
      // Skip particle animation when reduced motion is enabled
      if (reducedMotion) {
        prevTrigger.current = trigger;
        return;
      }

      const newParticles: HeartParticle[] = [];
      for (let i = 0; i < count; i++) {
        const seed = nextIdRef.current + i;
        newParticles.push({
          id: nextIdRef.current++,
          x: ((seed * 2654435761) % 120) - 60,
          driftX: ((seed * 1597334677) % 60) - 30,
          rotation: ((seed * 789456123) % 90) - 30,
          size: 14 + ((seed * 456789123) % 18),
          targetY: -(150 + ((seed * 321654987) % 200)),
          delay: i * 30,
        });
      }
      setParticles((prev) => [...prev, ...newParticles]);
    }
    prevTrigger.current = trigger;
  }, [trigger, count, reducedMotion]);

  if (particles.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p) => (
          <Heart
            key={p.id}
            particle={p}
            color={heartColor}
            onComplete={removeParticle}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: {
    position: 'absolute',
  },
});
