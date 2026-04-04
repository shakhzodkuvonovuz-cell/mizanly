import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert,
  StatusBar, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, withRepeat, withSequence, interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useCameraPermissions } from 'expo-camera';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';
import { formatTime } from '@/utils/formatTime';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';

type CameraMode = 'photo' | 'video' | 'story';

export default function CameraScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const haptic = useContextualHaptic();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CameraMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPickingGallery, setIsPickingGallery] = useState(false);
  const tc = useThemeColors();

  const captureScale = useSharedValue(1);
  const recordProgress = useSharedValue(0);
  const pulseAnim = useSharedValue(1);

  // Recording timer
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Camera facade: CameraView is not rendered yet (blocked on EAS build).
  // Capture button navigates to create screens. When expo-camera is wired,
  // replace navigation with takePictureAsync/recordAsync calls.
  const handleCapturePress = useCallback(() => {
    if (isCapturing) return; // Debounce guard
    setIsCapturing(true);
    haptic.tick();

    if (mode === 'video') {
      if (isRecording) {
        // Stop recording
        setIsRecording(false);
        setRecordingTime(0);
        recordProgress.value = withTiming(0, { duration: 300 });
        if (recordingInterval.current) {
          clearInterval(recordingInterval.current);
        }
        router.push('/(screens)/create-reel');
        setIsCapturing(false);
      } else {
        // Start recording
        setIsRecording(true);
        setIsCapturing(false);
        recordProgress.value = withTiming(1, { duration: 60000 }); // 60s max
        recordingInterval.current = setInterval(() => {
          setRecordingTime(prev => {
            if (prev >= 60) {
              setIsRecording(false);
              recordProgress.value = withTiming(0, { duration: 300 });
              if (recordingInterval.current) clearInterval(recordingInterval.current);
              return 0;
            }
            return prev + 1;
          });
        }, 1000);
      }
    } else {
      // Photo capture animation
      captureScale.value = withSequence(
        withTiming(0.85, { duration: 100 }),
        withSpring(1, { damping: 12, stiffness: 400 })
      );
      if (mode === 'story') {
        router.push('/(screens)/create-story');
      } else {
        router.push('/(screens)/create-post');
      }
      // Reset guard after navigation
      setTimeout(() => setIsCapturing(false), 500);
    }
  }, [mode, isRecording, isCapturing, recordProgress, captureScale, router, haptic]);

  const animatedCaptureStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  const animatedRecordRingStyle = useAnimatedStyle(() => ({
    transform: [{
      rotate: `${interpolate(
        recordProgress.value,
        [0, 1],
        [0, 360]
      )}deg`,
    }],
  }));

  // Pulse animation for the capture button when ready
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: interpolate(pulseAnim.value, [1, 1.1], [0.8, 1]),
  }));

  // Request camera permission on mount — only prompt once via canAskAgain guard
  const permissionRequested = useRef(false);
  useEffect(() => {
    if (permissionRequested.current) return;
    if (!permission?.granted && permission?.canAskAgain !== false) {
      permissionRequested.current = true;
      Alert.alert(
        t('permissions.cameraTitle', 'Camera Access'),
        t('permissions.cameraRationale', 'Mizanly needs camera access to take photos and record videos for your posts, stories, and reels.'),
        [
          { text: t('common.notNow', 'Not Now'), style: 'cancel' },
          { text: t('common.allow', 'Allow'), onPress: () => requestPermission() },
        ],
      );
    }
  }, [permission, requestPermission, t]);

  // Clean up recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, []);

  // Start pulse animation on mount
  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  // formatTime extracted to @/utils/formatTime

  if (!permission?.granted) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <StatusBar barStyle="light-content" />
          <EmptyState
            icon="camera"
            title={t('camera.permissionRequired')}
            subtitle={t('camera.permissionMessage')}
            actionLabel={t('camera.grantPermission')}
            onAction={requestPermission}
          />
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" hidden />

        {/* Camera Preview Placeholder */}
        <View style={styles.cameraPreview}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={styles.cameraGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraOverlayText}>{t('screens.camera.previewText')}</Text>
            <Text style={styles.cameraOverlaySubtext}>{t('screens.camera.previewSubtext')}</Text>
          </View>

          {/* Grid lines for composition */}
          <View style={styles.gridOverlay}>
            <View style={styles.gridLineVertical} />
            <View style={styles.gridLineHorizontal} />
          </View>
        </View>

        {/* Top Controls */}
        <SafeAreaView style={styles.topControls} edges={['top']}>
          <View style={styles.topControlsRow}>
            {/* Close Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={styles.controlPill}
              onPress={() => router.back()}
            >
              <Icon name="x" size="sm" color="#fff" />
            </Pressable>

            {/* Flash Toggle */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={flashOn ? t('accessibility.turnFlashOff') : t('accessibility.turnFlashOn')}
              style={[styles.controlPill, flashOn && styles.controlPillActive]}
              onPress={() => { haptic.tick(); setFlashOn(!flashOn); }}
            >
              <Icon name="sun" size="sm" color="#fff" />
            </Pressable>

            {/* Camera Flip */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.flipCamera')}
              style={styles.controlPill}
              onPress={() => { haptic.tick(); setIsFrontCamera(!isFrontCamera); }}
            >
              <Icon name="repeat" size="sm" color="#fff" />
            </Pressable>
          </View>

          {/* Recording Timer */}
          {isRecording && (
            <Animated.View style={styles.timerContainer}>
              <View style={styles.recordingDot} />
              <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
            </Animated.View>
          )}
        </SafeAreaView>

        {/* Bottom Controls */}
        <SafeAreaView style={styles.bottomControls} edges={['bottom']}>
          {/* Mode Selector */}
          <View style={styles.modeSelector}>
            {(['photo', 'video', 'story'] as CameraMode[]).map((m) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`screens.camera.mode${m.charAt(0).toUpperCase() + m.slice(1)}`)}
                key={m}
                style={[styles.modePill, mode === m && styles.modePillActive]}
                onPress={() => { haptic.navigate(); setMode(m); }}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {t(`screens.camera.mode${m.charAt(0).toUpperCase() + m.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Capture Controls */}
          <View style={styles.captureContainer}>
            {/* Gallery Shortcut */}
            <Pressable
              style={styles.galleryButton}
              accessibilityRole="button"
              accessibilityLabel={t('screens.camera.gallery')}
              onPress={async () => {
                if (isPickingGallery) return;
                setIsPickingGallery(true);
                haptic.tick();
                try {
                  const ImagePicker = await import('expo-image-picker');
                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], exif: false });
                  if (!result.canceled && result.assets[0]) {
                    router.push({ pathname: '/(screens)/create-post', params: { mediaUri: result.assets[0].uri } });
                  }
                } catch {
                  showToast({ message: t('camera.galleryError'), variant: 'error' });
                } finally {
                  setIsPickingGallery(false);
                }
              }}
            >
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                style={styles.galleryThumbnail}
              >
                <Icon name="image" size="sm" color={tc.text.tertiary} />
              </LinearGradient>
            </Pressable>

            {/* Capture Button */}
            <Animated.View style={[styles.captureButtonOuter, pulseStyle]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={mode === 'video' && isRecording ? t('accessibility.stopRecording') : t('accessibility.capture')}
                onPress={handleCapturePress}

                style={styles.captureButtonTouch}
              >
                <Animated.View style={[styles.captureButtonInner, animatedCaptureStyle]}>
                  {mode === 'video' && isRecording ? (
                    <View style={styles.stopButton} />
                  ) : (
                    <LinearGradient
                      colors={['#fff', '#f0f0f0']}
                      style={styles.captureCircle}
                    />
                  )}
                </Animated.View>

                {/* Recording Progress Ring */}
                {mode === 'video' && isRecording && (
                  <Animated.View style={[styles.progressRing, animatedRecordRingStyle]}>
                    <View style={styles.progressRingInner} />
                  </Animated.View>
                )}
              </Pressable>
            </Animated.View>

            {/* Spacer for symmetry */}
            <View style={styles.galleryButton} />
          </View>

          {/* Mode hint */}
          <Text style={styles.modeHint}>
            {t(`screens.camera.hint${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
          </Text>
        </SafeAreaView>
      </View>
  
    </ScreenErrorBoundary>
  );
}

// FadeIn is imported from reanimated; removed unused custom constant

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Intentionally always black — camera viewfinder background
  },

  // Camera Preview
  cameraPreview: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraOverlay: {
    alignItems: 'center',
  },
  cameraOverlayText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  cameraOverlaySubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },

  // Grid overlay
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineVertical: {
    position: 'absolute' as const,
    start: '33.33%',
    width: '33.33%',
    top: 0,
    bottom: 0,
    borderStartWidth: 0.5,
    borderEndWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  gridLineHorizontal: {
    position: 'absolute' as const,
    top: '33.33%',
    height: '33.33%',
    start: 0,
    end: 0,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  // Top Controls
  topControls: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 10,
  },
  topControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  controlPill: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  controlPillActive: {
    backgroundColor: colors.emerald,
  },

  // Recording Timer
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    marginEnd: spacing.sm,
  },
  timerText: {
    color: '#fff', // Intentionally white — camera overlay text
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: fonts.mono,
  },

  // Bottom Controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingBottom: spacing.xl,
  },

  // Mode Selector
  modeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  modePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modePillActive: {
    backgroundColor: colors.emerald,
  },
  modeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#fff', // Intentionally white — active mode on dark camera overlay
    fontWeight: '600',
  },

  // Capture Controls
  captureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },

  // Gallery Button
  galleryButton: {
    width: 48,
    height: 48,
  },
  galleryThumbnail: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // Capture Button
  captureButtonOuter: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonTouch: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
  },
  stopButton: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },

  // Recording Progress Ring
  progressRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: colors.error,
    borderTopColor: 'transparent',
  },
  progressRingInner: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
  },

  // Mode hint
  modeHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
