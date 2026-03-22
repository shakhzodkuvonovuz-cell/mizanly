import { View } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface VerifiedBadgeProps {
  size?: number;
  color?: string;
  variant?: 'standard' | 'scholar';
}

export function VerifiedBadge({
  size = 16,
  color = colors.emerald,
  variant = 'standard',
}: VerifiedBadgeProps) {
  const tc = useThemeColors();
  const label = variant === 'scholar' ? 'Verified scholar' : 'Verified account';

  if (variant === 'scholar') {
    return (
      <View accessibilityLabel={label} accessibilityRole="image">
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Gold ring */}
          <Circle cx="12" cy="12" r="11" fill={colors.gold} />
          <Circle cx="12" cy="12" r="9.5" fill={tc.bgCard} />
          <Circle cx="12" cy="12" r="8.5" fill={colors.gold} />
          {/* Star icon in center */}
          <G>
            <Path
              d="M12 5.5L13.7 9.1L17.7 9.6L14.85 12.35L15.55 16.3L12 14.4L8.45 16.3L9.15 12.35L6.3 9.6L10.3 9.1L12 5.5Z"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              strokeWidth={0.5}
              strokeLinejoin="round"
            />
          </G>
        </Svg>
      </View>
    );
  }

  return (
    <View accessibilityLabel={label} accessibilityRole="image">
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
    </View>
  );
}
