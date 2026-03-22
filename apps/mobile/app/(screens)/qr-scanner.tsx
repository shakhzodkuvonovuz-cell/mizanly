import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function QRScannerScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      Alert.alert(
        t('screens.qr-scanner.cameraRequired'),
        t('screens.qr-scanner.cameraRequiredDesc'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => router.back() },
          { text: t('screens.qr-scanner.openSettings'), onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [permission]);

  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);

    // Expected format: https://mizanly.app/@username
    const mizanlyProfileRegex = /^https:\/\/mizanly\.app\/@([a-zA-Z0-9_]+)$/;
    const match = data.match(mizanlyProfileRegex);

    if (match) {
      const username = match[1];
      router.replace(`/(screens)/profile/${username}`);
    } else {
      Alert.alert(
        t('screens.qr-scanner.invalidCode'),
        t('screens.qr-scanner.invalidCode'),
        [
          { text: t('common.retry'), onPress: () => setScanned(false) },
          { text: t('common.cancel'), style: 'cancel', onPress: () => router.back() },
        ]
      );
    }
  };

  if (!permission) {
    // Permission request still loading
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.qr-scanner.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={[styles.centered, { paddingTop: insets.top + 52 }]}>
          <Skeleton.Rect width={250} height={250} borderRadius={radius.lg} />
          <View style={{ marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
            <Skeleton.Text width={200} />
            <Skeleton.Text width={140} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.qr-scanner.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={[styles.centered, { paddingTop: insets.top + 52 }]}>
          <EmptyState
            icon="camera"
            title={t('screens.qr-scanner.cameraRequired')}
            subtitle={t('screens.qr-scanner.cameraRequiredDesc')}
            actionLabel={t('screens.qr-scanner.openSettings')}
            onAction={requestPermission}
          />
          <GradientButton label={t('accessibility.goBack')} onPress={() => router.back()} variant="ghost" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.qr-scanner.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />

        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <Animated.View entering={FadeInUp.delay(0).duration(400)}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                style={styles.focusFrameOuter}
              >
                <View style={styles.focusFrameInner} />
              </LinearGradient>
            </Animated.View>
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.instructionBg}
            >
              <Text style={styles.instruction}>{t('screens.qr-scanner.alignHint')}</Text>
            </LinearGradient>
            {scanned && (
              <View style={styles.scannedOverlay}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                  style={styles.scannedIconBg}
                >
                  <Icon name="check-circle" size="xl" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.scannedText}>{t('screens.qr-scanner.scannedSuccess')}</Text>
              </View>
            )}
          </View>
        </CameraView>

        <View style={styles.footer}>
          <GradientButton label={t('common.close')} onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusFrameOuter: {
    width: 254,
    height: 254,
    borderRadius: radius.lg,
    padding: 2,
  },
  focusFrameInner: {
    width: 250,
    height: 250,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  instructionBg: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  instruction: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  scannedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tc.bg + 'CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedIconBg: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedText: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  footer: {
    padding: spacing.base,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: tc.border,
  },
});