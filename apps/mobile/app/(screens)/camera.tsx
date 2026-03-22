import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  StatusBar, Animated as RNAnimated,
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
import { colors, spacing, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useThemeColors } from '@/hooks/useThemeColors';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type CameraMode = 'photo' | 'video' | 'story';

export default function CameraScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CameraMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const tc = useThemeColors();

  const captureScale = useSharedValue(1);
  const recordProgress = useSharedValue(0);
  const pulseAnim = useSharedValue(1);

  // Recording timer
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);

  const handleCapturePress = useCallback(() => {
    if (mode === 'video') {
      if (isRecording) {
        // Stop recording
        setIsRecording(false);
        setRecordingTime(0);
        recordProgress.value = withTiming(0, { duration: 300 });
        if (recordingInterval.current) {
          clearInterval(recordingInterval.current);
        }
        // Navigate to create-reel with video
        router.push('/(screens)/create-reel');
      } else {
        // Start recording
        setIsRecording(true);
        recordProgress.value = withTiming(1, { duration: 60000 }); // 60s max
        recordingInterval.current = setInterval(() => {
          setRecordingTime(prev => {
            if (prev >= 60) {
              // Auto stop at 60s
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
      // Photo capture
      captureScale.value = withSequence(
        withTiming(0.85, { duration: 100 }),
        withSpring(1, { damping: 12, stiffness: 400 })
      );
      // Navigate to create-post or create-story
      setTimeout(() => {
        if (mode === 'story') {
          router.push('/(screens)/create-story');
        } else {
          router.push('/(screens)/create-post');
        }
      }, 200);
    }
  }, [mode, isRecording, recordProgress, captureScale, router]);

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

  // Request camera permission on mount if not yet determined
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
              style={styles.controlPill}
              onPress={() => router.back()}
            >
              <Icon name="x" size="sm" color="#fff" />
            </Pressable>

            {/* Flash Toggle */}
            <Pressable
              accessibilityRole="button"
              style={[styles.controlPill, flashOn && styles.controlPillActive]}
              onPress={() => setFlashOn(!flashOn)}
            >
              <Icon name="sun" size="sm" color="#fff" />
            </Pressable>

            {/* Camera Flip */}
            <Pressable
              accessibilityRole="button"
              style={styles.controlPill}
              onPress={() => setIsFrontCamera(!isFrontCamera)}
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
                key={m}
                style={[styles.modePill, mode === m && styles.modePillActive]}
                onPress={() => setMode(m)}
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
                const ImagePicker = await import('expo-image-picker');
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'] });
                if (!result.canceled && result.assets[0]) {
                  router.push({ pathname: '/(screens)/create-post', params: { mediaUri: result.assets[0].uri } });
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
    backgroundColor: '#000',
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
    fontSize: 20,
    fontWeight: '600',
  },
  cameraOverlaySubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: spacing.sm,
  },

  // Grid overlay
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineVertical: {
    position: 'absolute' as const,
    left: screenWidth / 3,
    width: screenWidth / 3,
    top: 0,
    bottom: 0,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  gridLineHorizontal: {
    position: 'absolute' as const,
    top: screenHeight / 3,
    height: screenHeight / 3,
    left: 0,
    right: 0,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  // Top Controls
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
    marginRight: spacing.sm,
  },
  timerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.mono,
  },

  // Bottom Controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    fontSize: 14,
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#fff',
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
    fontSize: 13,
    textAlign: 'center',
  },
});
