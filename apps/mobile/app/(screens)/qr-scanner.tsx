import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';

export default function QRScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in settings to scan QR codes.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
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
        'Invalid QR Code',
        'This QR code does not contain a valid Mizanly profile link.',
        [
          { text: 'Try Again', onPress: () => setScanned(false) },
          { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
        ]
      );
    }
  };

  if (!permission) {
    // Permission request still loading
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Scan QR Code"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
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
          title="Scan QR Code"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={[styles.centered, { paddingTop: insets.top + 52 }]}>
          <EmptyState
            icon="camera"
            title="Camera Access Required"
            subtitle="Camera access is required to scan QR codes."
            actionLabel="Grant Permission"
            onAction={requestPermission}
          />
          <GradientButton label="Go Back" onPress={() => router.back()} variant="ghost" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Scan QR Code"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <Camera
        ref={cameraRef}
        style={styles.camera}
        type="back"
        barCodeScannerSettings={{
          barCodeTypes: ['qr'],
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
            <Text style={styles.instruction}>Align QR code within the frame</Text>
          </LinearGradient>
          {scanned && (
            <View style={styles.scannedOverlay}>
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                style={styles.scannedIconBg}
              >
                <Icon name="check-circle" size="xl" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.scannedText}>Scanned successfully</Text>
            </View>
          )}
        </View>
      </Camera>

      <View style={styles.footer}>
        <GradientButton label="Close" onPress={() => router.back()} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
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
    backgroundColor: colors.dark.bg + 'CC',
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
    borderTopColor: colors.dark.border,
  },
});