import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, fonts, lineHeight } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const HEALTH_URL = `${API_URL.replace('/api/v1', '')}/health/ready`;

function MaintenanceScreenContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    haptic.tick();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        haptic.success();
        // Server is back — navigate to home
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/saf');
        }
      } else {
        haptic.error();
        showToast({
          message: t('screens.maintenance.stillDown'),
          variant: 'warning',
        });
      }
    } catch {
      haptic.error();
      showToast({
        message: t('screens.maintenance.stillDown'),
        variant: 'warning',
      });
    } finally {
      setRetrying(false);
    }
  }, [haptic, router, t]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
        <EmptyState
          icon="settings"
          title={t('screens.maintenance.title')}
          subtitle={t('screens.maintenance.subtitle')}
        />

        <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.actions}>
          <GradientButton
            label={t('screens.maintenance.retryButton')}
            icon="loader"
            variant="primary"
            size="lg"
            loading={retrying}
            disabled={retrying}
            onPress={handleRetry}
            fullWidth
            accessibilityLabel={t('screens.maintenance.retryButton')}
          />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400).duration(300)}>
          <Text style={[styles.hint, { color: tc.text.tertiary }]}>
            {t('screens.maintenance.hint')}
          </Text>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

export default function MaintenanceScreen() {
  return (
    <ScreenErrorBoundary>
      <MaintenanceScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  actions: {
    width: '100%',
    marginTop: spacing.xl,
  },
  hint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
    color: colors.text.tertiary,
  },
});
