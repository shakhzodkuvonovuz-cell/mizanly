import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import Animated, {
  FadeIn, FadeInUp, FadeOut,
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts, shadow, animation } from '@/theme';
import { storiesApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CAMERA_H = SCREEN_H * 0.55;
const MINI_CAM_SIZE = 100;
const CAPTURE_BUTTON_SIZE = 72;
const CAPTURE_BUTTON_INNER = 60;
const DEFAULT_TIME = 120; // 2 minutes

function DisposableCameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ timeLimit?: string }>();
  const { t } = useTranslation();
  const haptic = useHaptic();

  const mainCameraRef = useRef<CameraView>(null);
  const miniCameraRef = useRef<CameraView>(null);

  // ── Permissions ──
  const [permission, requestPermission] = useCameraPermissions();

  // ── State ──
  const [mainFacing, setMainFacing] = useState<'back' | 'front'>('back');
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [isCaptured, setIsCaptured] = useState(false);
  const [timeLeft, setTimeLeft] = useState(
    params.timeLimit ? parseInt(params.timeLimit, 10) : DEFAULT_TIME,
  );
  const [isPosting, setIsPosting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // ── Animated capture button ──
  const captureScale = useSharedValue(1);
  const captureAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  // ── Timer countdown ──
  useEffect(() => {
    if (isCaptured) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          Alert.alert(
            t('disposable.timeUp'),
            t('disposable.timeUpMessage'),
            [{ text: t('common.ok'), onPress: () => router.back() }],
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCaptured, t, router]);

  // ── Request permission on mount ──
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // ── Format timer ──
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ── Swap cameras ──
  const swapCameras = useCallback(() => {
    haptic.light();
    setMainFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, [haptic]);

  // ── Capture both photos ──
  const capturePhotos = useCallback(async () => {
    if (isCapturing || !mainCameraRef.current || !miniCameraRef.current) return;

    setIsCapturing(true);
    haptic.medium();

    // Animate capture button
    captureScale.value = withSpring(0.85, animation.spring.snappy);
    setTimeout(() => {
      captureScale.value = withSpring(1, animation.spring.bouncy);
    }, 150);

    try {
      // Capture both cameras
      const [mainResult, miniResult] = await Promise.all([
        mainCameraRef.current.takePictureAsync({ quality: 0.9 }),
        miniCameraRef.current.takePictureAsync({ quality: 0.9 }),
      ]);

      if (mainResult && miniResult) {
        // Main camera is whatever mainFacing is set to
        if (mainFacing === 'back') {
          setBackPhoto(mainResult.uri);
          setFrontPhoto(miniResult.uri);
        } else {
          setFrontPhoto(mainResult.uri);
          setBackPhoto(miniResult.uri);
        }
        setIsCaptured(true);
        haptic.success();
      }
    } catch {
      Alert.alert(t('disposable.captureError'), t('disposable.captureErrorMessage'));
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, haptic, captureScale, mainFacing, t]);

  // ── Retake ──
  const retake = useCallback(() => {
    setBackPhoto(null);
    setFrontPhoto(null);
    setIsCaptured(false);
    haptic.light();
  }, [haptic]);

  // ── Share as story ──
  const postMutation = useMutation({
    mutationFn: async () => {
      setIsPosting(true);

      const uploadPhoto = async (uri: string): Promise<string> => {
        const presignData = await uploadApi.getPresignUrl('image/jpeg', 'stories');

        const response = await fetch(uri);
        const blob = await response.blob();
        await fetch(presignData.uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' },
        });

        return presignData.publicUrl;
      };

      const uploads: Promise<string>[] = [];
      if (backPhoto) uploads.push(uploadPhoto(backPhoto));
      if (frontPhoto) uploads.push(uploadPhoto(frontPhoto));

      const uploadedUrls = await Promise.all(uploads);

      await storiesApi.create({
        mediaUrl: uploadedUrls[0],
        mediaType: 'image',
        stickerData: [
          {
            type: 'disposable',
            backPhotoUrl: uploadedUrls[0],
            frontPhotoUrl: uploadedUrls[1] ?? uploadedUrls[0],
          },
        ],
      });
    },
    onSuccess: () => {
      setIsPosting(false);
      haptic.success();
      router.back();
    },
    onError: () => {
      setIsPosting(false);
      Alert.alert(t('disposable.shareError'), t('disposable.shareErrorMessage'));
    },
  });

  // ── Timer badge color ──
  const timerColor = timeLeft <= 30 ? colors.error : colors.text.primary;

  // ── Permission denied ──
  if (permission && !permission.granted) {
    return (
      <View style={styles.screen}>
        <GlassHeader
          title={t('disposable.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={styles.permissionContainer}>
          <EmptyState
            icon="camera"
            title={t('disposable.cameraRequired')}
            subtitle={t('disposable.cameraRequiredMessage')}
            actionLabel={t('disposable.grantPermission')}
            onAction={requestPermission}
          />
        </View>
      </View>
    );
  }

  // ── Loading permissions ──
  if (!permission) {
    return (
      <View style={styles.screen}>
        <GlassHeader
          title={t('disposable.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={styles.permissionContainer}>
          <Skeleton.Rect width={120} height={120} borderRadius={radius.lg} />
          <Skeleton.Text width="60%" />
        </View>
      </View>
    );
  }

  // ── Post-capture view ──
  if (isCaptured) {
    return (
      <View style={styles.screen}>
        <GlassHeader
          title={t('disposable.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: retake,
            accessibilityLabel: t('disposable.retake'),
          }}
          rightActions={[
            {
              icon: isPosting ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
              ) : (
                <Text style={styles.shareHeaderText}>{t('disposable.share')}</Text>
              ),
              onPress: () => {
                if (!isPosting) postMutation.mutate();
              },
              accessibilityLabel: t('disposable.share'),
            },
          ]}
        />

        <Animated.View
          entering={FadeIn.duration(400)}
          style={styles.capturedContainer}
        >
          <View style={styles.photoPair}>
            {backPhoto && (
              <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.capturedPhotoWrapper}>
                <Image
                  source={{ uri: backPhoto }}
                  style={styles.capturedPhoto}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.photoLabel}>
                  <Text style={styles.photoLabelText}>
                    {t('disposable.backCamera')}
                  </Text>
                </View>
              </Animated.View>
            )}
            {frontPhoto && (
              <Animated.View entering={FadeInUp.delay(200).duration(300)} style={styles.capturedPhotoWrapper}>
                <Image
                  source={{ uri: frontPhoto }}
                  style={styles.capturedPhoto}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.photoLabel}>
                  <Text style={styles.photoLabelText}>
                    {t('disposable.frontCamera')}
                  </Text>
                </View>
              </Animated.View>
            )}
          </View>

          <Animated.View entering={FadeInUp.delay(300).duration(300)} style={styles.noEditBanner}>
            <Icon name="lock" size="sm" color={colors.text.secondary} />
            <Text style={styles.noEditText}>
              {t('disposable.noEditing')}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).duration(300)} style={styles.shareSection}>
            <GradientButton
              label={t('disposable.shareAsStory')}
              onPress={() => postMutation.mutate()}
              loading={isPosting}
              icon="send"
            />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  // ── Camera view ──
  return (
    <View style={styles.screen}>
      <GlassHeader
        title={t('disposable.title')}
        borderless
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
        rightActions={[
          {
            icon: (
              <View style={[styles.timerBadge, timeLeft <= 30 && styles.timerBadgeUrgent]}>
                <Icon name="clock" size={14} color={timerColor} />
                <Text style={[styles.timerText, { color: timerColor }]}>
                  {formatTime(timeLeft)}
                </Text>
              </View>
            ),
            onPress: () => {},
            accessibilityLabel: t('disposable.timeRemaining', { time: formatTime(timeLeft) }),
          },
        ]}
      />

      <View style={styles.cameraContainer}>
        {/* Main camera */}
        <CameraView
          ref={mainCameraRef}
          style={styles.mainCamera}
          facing={mainFacing}
        />

        {/* Mini camera (opposite facing) overlay */}
        <Pressable
          style={styles.miniCameraWrapper}
          onPress={swapCameras}
          accessibilityRole="button"
          accessibilityLabel={t('disposable.swapCameras')}
        >
          <CameraView
            ref={miniCameraRef}
            style={styles.miniCamera}
            facing={mainFacing === 'back' ? 'front' : 'back'}
          />
        </Pressable>
      </View>

      {/* Tagline */}
      <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.taglineContainer}>
        <Text style={styles.taglineMain}>{t('disposable.tagline1')}</Text>
        <Text style={styles.taglineSub}>{t('disposable.tagline2')}</Text>
      </Animated.View>

      {/* Capture button */}
      <View style={styles.captureSection}>
        <Animated.View style={captureAnimatedStyle}>
          <Pressable
            style={styles.captureButton}
            onPress={capturePhotos}
            disabled={isCapturing}
            accessibilityRole="button"
            accessibilityLabel={t('disposable.capture')}
          >
            <LinearGradient
              colors={[colors.emerald, colors.emeraldDark]}
              style={styles.captureButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {isCapturing ? (
                <Skeleton.Rect width={24} height={24} borderRadius={radius.full} />
              ) : (
                <Icon name="camera" size="lg" color={colors.text.onColor} />
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

export default function DisposableCameraScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <DisposableCameraScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  // ── Camera ──
  cameraContainer: {
    marginTop: 100,
    marginHorizontal: spacing.base,
    height: CAMERA_H,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  mainCamera: {
    flex: 1,
  },
  miniCameraWrapper: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: MINI_CAM_SIZE,
    height: MINI_CAM_SIZE,
    borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.text.primary,
    ...shadow.md,
  },
  miniCamera: {
    width: '100%',
    height: '100%',
  },
  // ── Timer badge ──
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  timerBadgeUrgent: {
    borderColor: colors.error,
    backgroundColor: colors.active.error10,
  },
  timerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
  },
  // ── Tagline ──
  taglineContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  taglineMain: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  taglineSub: {
    fontFamily: fonts.headingBold,
    fontSize: fontSize.lg,
    color: colors.emerald,
    textAlign: 'center',
    marginTop: spacing.xs,
    letterSpacing: 0.3,
  },
  // ── Capture button ──
  captureSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  captureButton: {
    width: CAPTURE_BUTTON_SIZE,
    height: CAPTURE_BUTTON_SIZE,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.emerald,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonGradient: {
    width: CAPTURE_BUTTON_INNER,
    height: CAPTURE_BUTTON_INNER,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Captured view ──
  capturedContainer: {
    flex: 1,
    marginTop: 100,
    paddingHorizontal: spacing.base,
  },
  photoPair: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  capturedPhotoWrapper: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  capturedPhoto: {
    width: '100%',
    height: '100%',
  },
  photoLabel: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  photoLabelText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.primary,
  },
  // ── No edit banner ──
  noEditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    marginBottom: spacing.xl,
  },
  noEditText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  // ── Share ──
  shareSection: {
    paddingHorizontal: spacing.base,
  },
  shareHeaderText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
});
