import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '@/theme';

interface VerifiedBadgeProps {
  size?: number;
  color?: string;
}

export function VerifiedBadge({ size = 16, color = colors.emerald }: VerifiedBadgeProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="11" fill={color} />
      <Path
        d="M8 12.5L10.5 15L16 9.5"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
