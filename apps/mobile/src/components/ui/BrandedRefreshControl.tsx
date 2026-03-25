import { useCallback } from 'react';
import { RefreshControl, Platform } from 'react-native';
import { colors } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
}

export function BrandedRefreshControl({ refreshing, onRefresh }: Props) {
  const haptic = useContextualHaptic();

  const handleRefresh = useCallback(() => {
    haptic.tick();
    onRefresh();
  }, [onRefresh, haptic]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.emerald}
      colors={[colors.emerald, colors.gold]} // Android: alternating colors
      progressBackgroundColor={Platform.OS === 'android' ? colors.dark.bgElevated : undefined}
      title={refreshing ? '' : undefined} // iOS: no text while idle
    />
  );
}
