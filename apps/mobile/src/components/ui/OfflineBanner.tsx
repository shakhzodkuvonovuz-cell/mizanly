import { useCallback, useState } from 'react';
import { Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { useStore } from '@/store';
import { Icon } from '@/components/ui/Icon';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

export function OfflineBanner() {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const isOffline = useStore((s) => s.isOffline);
  const setIsOffline = useStore((s) => s.setIsOffline);
  const [checking, setChecking] = useState(false);

  const handleRetry = useCallback(async () => {
    setChecking(true);
    try {
      const state = await NetInfo.fetch();
      if (state.isConnected) {
        setIsOffline(false);
      }
    } finally {
      setChecking(false);
    }
  }, [setIsOffline]);

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { backgroundColor: tc.isDark ? colors.error : '#DC2626' }]}
    >
      <Icon name="globe" size="xs" color={colors.text.onColor} />
      <Text style={styles.text}>
        {t('network.offline')}
        <Text style={styles.subtitle}> {t('network.offlineSubtitle')}</Text>
      </Text>
      <Pressable
        onPress={handleRetry}
        disabled={checking}
        style={styles.retryButton}
        hitSlop={8}
        accessibilityLabel={t('network.tapToRetry')}
        accessibilityRole="button"
      >
        {checking ? (
          <ActivityIndicator size="small" color={colors.text.onColor} />
        ) : (
          <Text style={styles.retryText}>{t('network.tapToRetry')}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    color: colors.text.onColor,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyMedium,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  retryText: {
    color: colors.text.onColor,
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyBold,
  },
});
