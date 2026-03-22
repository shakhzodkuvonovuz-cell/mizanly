import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlTextAlign } from '@/utils/rtl';

type BiometricType = 'faceId' | 'fingerprint' | 'unknown';

export default function BiometricLockScreen() {
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();

  const biometricLockEnabled = useStore((s) => s.biometricLockEnabled);
  const setBiometricLockEnabled = useStore((s) => s.setBiometricLockEnabled);

  const [loading, setLoading] = useState(true);
  const [hasHardware, setHasHardware] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('unknown');

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      setHasHardware(hardware);

      if (hardware) {
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsEnrolled(enrolled);

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('faceId');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const authenticate = useCallback(async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('biometric.unlockPrompt'),
      fallbackLabel: '',
    });
    return result.success;
  }, [t]);

  const handleToggle = useCallback(async () => {
    haptic.light();

    if (!biometricLockEnabled) {
      // Enabling: authenticate first to confirm
      const success = await authenticate();
      if (success) {
        setBiometricLockEnabled(true);
      } else {
        Alert.alert(t('common.error'), t('biometric.notEnrolled'));
      }
    } else {
      // Disabling: authenticate to confirm identity
      const success = await authenticate();
      if (success) {
        setBiometricLockEnabled(false);
      }
    }
  }, [biometricLockEnabled, authenticate, setBiometricLockEnabled, haptic, t]);

  const handleTestAuth = useCallback(async () => {
    haptic.light();
    const success = await authenticate();
    if (success) {
      Alert.alert(t('biometric.title'), 'Authentication successful!');
    } else {
      Alert.alert(t('biometric.title'), 'Authentication failed.');
    }
  }, [authenticate, haptic, t]);

  const biometricLabel = biometricType === 'faceId'
    ? t('biometric.faceId')
    : biometricType === 'fingerprint'
      ? t('biometric.fingerprint')
      : t('biometric.title');

  const biometricIcon = biometricType === 'faceId' ? 'smile' : 'lock';

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('biometric.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={[styles.loadingContainer, { paddingTop: insets.top + 80 }]}>
          <Skeleton.Rect width="100%" height={120} />
          <Skeleton.Rect width="100%" height={56} />
          <Skeleton.Rect width="100%" height={56} />
        </View>
      </View>
    );
  }

  if (!hasHardware) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('biometric.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={{ paddingTop: insets.top + 60 }}>
            <EmptyState
              icon="lock"
              title={t('biometric.notAvailable')}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  if (!isEnrolled) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('biometric.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={{ paddingTop: insets.top + 60 }}>
            <EmptyState
              icon="lock"
              title={t('biometric.notEnrolled')}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('biometric.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 72 }]}
        >
          {/* Biometric Type Info Card */}
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.infoCard}
          >
            <View style={styles.infoIconWrap}>
              <Icon name={biometricIcon} size="xl" color={colors.emerald} />
            </View>
            <Text style={[styles.infoTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {biometricLabel}
            </Text>
            <Text style={[styles.infoSubtitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('biometric.enable')}
            </Text>
          </LinearGradient>

          {/* Toggle Card */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                  style={styles.toggleIconWrap}
                >
                  <Icon name={biometricIcon} size="sm" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.toggleLabel}>{t('biometric.enable')}</Text>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  biometricLockEnabled && styles.switchTrackActive,
                ]}
              >
                <View
                  style={[
                    styles.switchThumb,
                    biometricLockEnabled && styles.switchThumbActive,
                  ]}
                />
              </View>
            </View>
            {/* Tap area covers the whole row */}
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.touchOverlay} onTouchEnd={handleToggle} />
            </View>
          </LinearGradient>

          {/* Test Authentication Button */}
          <View style={styles.testButtonWrap}>
            <GradientButton
              label={t('biometric.testAuth')}
              onPress={handleTestAuth}
              icon="lock"
              variant="secondary"
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: 60,
    gap: spacing.md,
  },
  loadingContainer: {
    paddingHorizontal: spacing.base,
    gap: spacing.lg,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  infoTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  infoSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  toggleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    flex: 1,
  },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: radius.lg,
    backgroundColor: colors.dark.border,
    padding: 4,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: colors.emerald,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.md,
    backgroundColor: '#fff',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  touchOverlay: {
    flex: 1,
  },
  testButtonWrap: {
    marginTop: spacing.md,
  },
});
