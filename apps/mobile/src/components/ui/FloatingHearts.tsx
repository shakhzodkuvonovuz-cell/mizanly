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

interface HeartParticle {
  id: number;
  x: number;
  rotation: number;
  size: number;
  targetY: number;
}

interface FloatingHeartsProps {
  trigger: number;
  color?: string;
  count?: number;
}

let nextId = 0;

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
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 200,
      easing: Easing.back(2),
    });

    rotate.value = withTiming(particle.rotation, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });

    translateY.value = withTiming(particle.targetY, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });

    opacity.value = withDelay(
      100,
      withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) {
          runOnJS(onComplete)(particle.id);
        }
      }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: particle.x },
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
  const heartColor = color ?? colors.like;

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    if (trigger > prevTrigger.current) {
      const newParticles: HeartParticle[] = [];
      for (let i = 0; i < count; i++) {
        newParticles.push({
          id: nextId++,
          x: Math.random() * 40 - 20,
          rotation: Math.random() * 90 - 30,
          size: Math.round(Math.random() * 14 + 18),
          targetY: -(Math.random() * 100 + 200),
        });
      }
      setParticles((prev) => [...prev, ...newParticles]);
    }
    prevTrigger.current = trigger;
  }, [trigger, count]);

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
