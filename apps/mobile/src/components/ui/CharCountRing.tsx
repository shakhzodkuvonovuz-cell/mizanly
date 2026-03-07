import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

interface CharCountRingProps {
  current: number;
  max: number;
  size?: number;
}

const R = 10;
const CIRCUMFERENCE = 2 * Math.PI * R;
const SHOW_AT = 0.7;

export function CharCountRing({ current, max, size = 28 }: CharCountRingProps) {
  const ratio = Math.min(current / max, 1);
  if (ratio < SHOW_AT) return null;

  const remaining = max - current;
  const offset = CIRCUMFERENCE * (1 - ratio);
  const color = ratio >= 1 ? colors.error : ratio >= 0.9 ? colors.gold : colors.emerald;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 28 28">
        <Circle
          cx={14} cy={14} r={R}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2.5}
          fill="none"
        />
        <Circle
          cx={14} cy={14} r={R}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          origin="14,14"
        />
      </Svg>
      {ratio >= 0.9 && (
        <Text style={[styles.count, { color }]}>{remaining}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', fontSize: 7, fontWeight: '700' },
});
