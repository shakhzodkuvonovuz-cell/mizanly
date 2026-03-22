import { RefreshControl, Platform } from 'react-native';
import { colors } from '@/theme';

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
}

export function BrandedRefreshControl({ refreshing, onRefresh }: Props) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.emerald}
      colors={[colors.emerald, colors.gold]} // Android: alternating colors
      progressBackgroundColor={Platform.OS === 'android' ? colors.dark.bgElevated : undefined}
      title={refreshing ? '' : undefined} // iOS: no text while idle
    />
  );
}
