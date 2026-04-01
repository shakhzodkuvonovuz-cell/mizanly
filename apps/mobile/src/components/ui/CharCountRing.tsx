import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CharCountRingProps {
  current: number;
  max: number;
  size?: number;
}

const R = 10;
const CIRCUMFERENCE = 2 * Math.PI * R;
const SHOW_AT = 0.7;

export function CharCountRing({ current, max, size = 28 }: CharCountRingProps) {
  const tc = useThemeColors();
  const ratio = Math.min(current / max, 1);
  const prevRatioRef = useRef(ratio);

  // Animated progress value
  const animatedRatio = useSharedValue(ratio);
  const scaleValue = useSharedValue(1);

  useEffect(() => {
    if (ratio < SHOW_AT) {
      animatedRatio.value = ratio;
      return;
    }

    // Animate progress change
    animatedRatio.value = withTiming(ratio, { duration: 200 });

    // Pulse when hitting the limit
    if (ratio >= 1 && prevRatioRef.current < 1) {
      scaleValue.value = withSequence(
        withSpring(1.25, { damping: 6, stiffness: 300 }),
        withSpring(1, { damping: 10, stiffness: 200 }),
      );
    }

    prevRatioRef.current = ratio;
  }, [ratio, animatedRatio, scaleValue]);

  if (ratio < SHOW_AT) return null;

  const remaining = max - current;

  // Compute color based on ratio for the static text
  const color = ratio >= 1 ? colors.error : ratio >= 0.9 ? colors.gold : colors.emerald;

  // Animated stroke dashoffset and color
  const animatedProps = useAnimatedProps(() => {
    const offset = CIRCUMFERENCE * (1 - animatedRatio.value);
    // Interpolate color: emerald -> gold -> red
    const strokeColor =
      animatedRatio.value >= 1
        ? colors.error
        : animatedRatio.value >= 0.9
          ? interpolateColor(
              animatedRatio.value,
              [0.9, 1],
              [colors.gold, colors.error],
            )
          : interpolateColor(
              animatedRatio.value,
              [SHOW_AT, 0.9],
              [colors.emerald, colors.gold],
            );
    return {
      strokeDashoffset: offset,
      stroke: strokeColor,
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View
      style={[styles.wrap, { width: size, height: size }, containerStyle]}
      accessibilityLabel={`${remaining} characters remaining`}
      accessibilityRole="text"
    >
      <Svg width={size} height={size} viewBox="0 0 28 28">
        <Circle
          cx={14} cy={14} r={R}
          stroke={tc.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
          strokeWidth={2.5}
          fill="none"
        />
        <AnimatedCircle
          cx={14} cy={14} r={R}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
          rotation={-90}
          origin="14,14"
          animatedProps={animatedProps}
        />
      </Svg>
      {ratio >= 0.9 && (
        <Text style={[styles.count, { color }]}>{remaining}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', fontSize: 7, fontWeight: '700' },
});
