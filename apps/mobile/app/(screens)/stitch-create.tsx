import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, radius, fontSize, fonts, fontSizeExt } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { navigate } from '@/utils/navigation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type DurationOption = 1 | 2 | 3 | 5;
type TransitionType = 'cut' | 'fade' | 'slide' | 'zoom' | 'wipe';

const DURATION_OPTIONS: DurationOption[] = [1, 2, 3, 5];

const TRANSITIONS: { id: TransitionType; labelKey: string; icon: IconName }[] = [
  { id: 'cut', labelKey: 'stitch.transitionCut', icon: 'scissors' },
  { id: 'fade', labelKey: 'stitch.transitionFade', icon: 'eye' },
  { id: 'slide', labelKey: 'stitch.transitionSlide', icon: 'chevron-right' },
  { id: 'zoom', labelKey: 'stitch.transitionZoom', icon: 'maximize' },
  { id: 'wipe', labelKey: 'stitch.transitionWipe', icon: 'layers' },
];

export default function StitchCreateScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const { t } = useTranslation();
  const { reelId, username, displayName, videoUrl } = useLocalSearchParams<{
    reelId: string;
    username?: string;
    displayName?: string;
    videoUrl?: string;
  }>();
  const haptic = useContextualHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(5);
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>('fade');
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setAudioPermission(granted);
    })();
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => {
          const maxTime = 60 - selectedDuration;
          if (prev >= maxTime) {
            if (timerRef.current) clearInterval(timerRef.current);
            return maxTime;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, selectedDuration]);

  const originalCreator = {
    username: username || t('stitch.unknownCreator'),
    displayName: displayName || username || t('stitch.unknownCreator'),
    isVerified: false,
  };

  // No data to refresh on this screen — refresh is a no-op
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshing(false);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecord = async () => {
    if (!cameraRef.current) return;

    if (isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      haptic.tick();
    } else {
      setIsRecording(true);
      haptic.navigate();
      try {
        const maxTime = 60 - selectedDuration;
        const video = await cameraRef.current.recordAsync({ maxDuration: maxTime });
        if (video?.uri) {
          setRecordedUri(video.uri);
          haptic.success();
        }
      } catch (_err: unknown) {
        // Recording was cancelled or failed
      } finally {
        setIsRecording(false);
      }
    }
  };

  const handlePickVideo = async () => {
    haptic.navigate();
    try {
      const maxTime = 60 - selectedDuration;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        videoMaxDuration: maxTime,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        setRecordedUri(result.assets[0].uri);
        haptic.success();
        showToast({ message: t('stitch.videoSelected', 'Video selected!'), variant: 'success' });
      }
    } catch {
      haptic.error();
      showToast({ message: t('stitch.videoPickFailed', 'Failed to select video'), variant: 'error' });
    }
  };

  const yourClipDuration = 60 - selectedDuration;
  const totalDuration = selectedDuration + recordTime;

  if (!permission?.granted) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={styles.container}>
          <GlassHeader title={t('stitch.createStitch')} onBack={() => router.back()} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <EmptyState
              icon="camera"
              title={t('camera.permissionRequired')}
              subtitle={t('camera.permissionMessage')}
              actionLabel={t('camera.grantPermission')}
              onAction={requestPermission}
            />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader title={t('stitch.createStitch')} showBackButton />

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Original Video Card */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <View style={styles.originalCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.originalGradient}
              >
                {/* Creator Info */}
                <View style={styles.creatorRow}>
                  <View style={styles.avatarPlaceholder}>
                    <Icon name="user" size="md" color={tc.text.tertiary} />
                  </View>
                  <View style={styles.creatorInfo}>
                    <View style={styles.creatorNameRow}>
                      <Text style={styles.creatorName}>{originalCreator.displayName}</Text>
                      {originalCreator.isVerified && <VerifiedBadge size={13} />}
                    </View>
                    <Text style={styles.stitchSubtitle}>{t('stitch.stitchingFrom', { username: originalCreator.username })}</Text>
                  </View>
                </View>

                {/* Video Preview */}
                <View style={styles.videoPreviewContainer}>
                  {videoUrl ? (
                    <Video
                      source={{ uri: videoUrl }}
                      style={styles.videoPreview}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay
                      isLooping
                      isMuted={false}
                      useNativeControls={false}
                    />
                  ) : (
                    <LinearGradient
                      colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                      style={styles.videoPreview}
                    >
                      <Icon name="play" size="xl" color={tc.text.tertiary} />
                    </LinearGradient>
                  )}
                </View>

                {/* Duration Selector */}
                <Text style={styles.durationLabel}>{t('stitch.useFirst')}</Text>
                <View style={styles.durationButtons}>
                  {DURATION_OPTIONS.map((duration) => (
                    <Pressable accessibilityRole="button"
                      accessibilityLabel={t('stitch.originalDuration', { seconds: duration })}
                      key={duration}
                      style={styles.durationButton}
                      onPress={() => { haptic.tick(); setSelectedDuration(duration); }}
                    >
                      <LinearGradient
                        colors={selectedDuration === duration
                          ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                          : colors.gradient.cardDark
                        }
                        style={styles.durationButtonGradient}
                      >
                        <Text style={[
                          styles.durationButtonText,
                          selectedDuration === duration && styles.durationButtonTextActive
                        ]}>
                          {duration}s
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${(selectedDuration / 60) * 100}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressLabel}>{t('stitch.originalDuration', { seconds: selectedDuration })}</Text>
                    <Text style={styles.progressLabel}>{t('stitch.yoursDuration', { seconds: yourClipDuration })}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Transition Selector */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.transitionCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.transitionGradient}
              >
                <Text style={styles.transitionTitle}>{t('stitch.transition')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.transitionScroll}
                >
                  {TRANSITIONS.map((transition, index) => (
                    <Animated.View
                      key={transition.id}
                      entering={FadeInUp.delay(index * 50).duration(300)}
                    >
                      <Pressable accessibilityRole="button"
                        accessibilityLabel={t(transition.labelKey)}
                        style={styles.transitionButton}
                        onPress={() => { haptic.tick(); setSelectedTransition(transition.id); }}
                      >
                        <LinearGradient
                          colors={selectedTransition === transition.id
                            ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                            : colors.gradient.cardDark
                          }
                          style={styles.transitionButtonGradient}
                        >
                          <Icon
                            name={transition.icon}
                            size="sm"
                            color={selectedTransition === transition.id ? colors.emerald : tc.text.secondary}
                          />
                          <Text style={[
                            styles.transitionButtonText,
                            selectedTransition === transition.id && styles.transitionButtonTextActive
                          ]}>
                            {t(transition.labelKey)}
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </Animated.View>
                  ))}
                </ScrollView>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Your Clip Section */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <View style={styles.yourClipCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.yourClipGradient}
              >
                {/* Header */}
                <View style={styles.yourClipHeader}>
                  <View style={styles.yourClipIconContainer}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.yourClipIconGradient}
                    >
                      <Icon name="camera" size="sm" color={colors.emerald} />
                    </LinearGradient>
                  </View>
                  <View>
                    <Text style={styles.yourClipTitle}>{t('stitch.yourResponse')}</Text>
                    <Text style={styles.yourClipSubtitle}>{t('stitch.recordReaction')}</Text>
                  </View>
                </View>

                {/* Camera Preview */}
                <View style={styles.cameraPreviewContainer}>
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraPreview}
                    facing={facing}
                    mode="video"
                  />
                </View>

                {/* Recording Controls */}
                <View style={styles.recordingControls}>
                  {/* Flip Camera */}
                  <Pressable accessibilityRole="button" accessibilityLabel={t('stitch.flipCamera')} style={styles.controlButtonSmall} onPress={() => { haptic.tick(); setFacing(f => f === 'front' ? 'back' : 'front'); }}>
                    <LinearGradient
                      colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                      style={styles.controlButtonGradientSmall}
                    >
                      <Icon name="repeat" size="sm" color={tc.text.secondary} />
                    </LinearGradient>
                  </Pressable>

                  {/* Record Button */}
                  <Pressable accessibilityRole="button" accessibilityLabel={isRecording ? t('stitch.stopRecording') : t('stitch.startRecording')} style={styles.recordButtonSmall} onPress={handleRecord}>
                    <LinearGradient
                      colors={isRecording
                        ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                        : ['rgba(255,255,255,0.95)', 'rgba(240,240,240,1)']
                      }
                      style={styles.recordButtonOuterSmall}
                    >
                      {isRecording ? (
                        <View style={styles.recordingInnerSquareSmall} />
                      ) : (
                        <LinearGradient
                          colors={['rgba(248,81,73,1)', 'rgba(220,60,50,1)']}
                          style={styles.recordButtonInnerSmall}
                        />
                      )}
                    </LinearGradient>
                  </Pressable>

                  {/* Flash Toggle */}
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={flashOn ? t('stitch.flashOff') : t('stitch.flashOn')}
                    style={styles.controlButtonSmall}
                    onPress={() => { haptic.tick(); setFlashOn(!flashOn); }}
                  >
                    <LinearGradient
                      colors={flashOn
                        ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                        : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                      }
                      style={styles.controlButtonGradientSmall}
                    >
                      <Icon name="sun" size="sm" color={flashOn ? colors.gold : tc.text.secondary} />
                    </LinearGradient>
                  </Pressable>
                </View>

                {/* Timer Display */}
                <View style={styles.timerDisplay}>
                  <Text style={styles.timerText}>
                    {formatTime(recordTime)} / {formatTime(yourClipDuration)}
                  </Text>
                  {isRecording && (
                    <View style={styles.recordingBadge}>
                      <View style={styles.recordingDot} />
                      <Text style={styles.recordingBadgeText}>{t('stitch.recording')}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Pick from Gallery */}
          <Animated.View entering={FadeInUp.delay(175).duration(400)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stitch.pickFromGallery', 'Pick from gallery')}
              style={styles.galleryButton}
              onPress={handlePickVideo}
            >
              <LinearGradient
                colors={recordedUri ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)'] : colors.gradient.cardDark}
                style={styles.galleryButtonGradient}
              >
                <Icon name="image" size="sm" color={recordedUri ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.galleryButtonText, recordedUri && { color: colors.emerald }]}>
                  {recordedUri ? t('stitch.videoReady', 'Video ready') : t('stitch.pickFromGallery', 'Pick from gallery')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Combined Preview Card */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <View style={styles.previewCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.previewCardGradient}
              >
                <Text style={styles.previewCardTitle}>{t('stitch.preview')}</Text>

                {/* Sequence Thumbnails */}
                <View style={styles.sequenceContainer}>
                  <View style={styles.sequenceItem}>
                    <LinearGradient
                      colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                      style={styles.sequenceThumbnail}
                    >
                      <Icon name="play" size="md" color={tc.text.tertiary} />
                      <View style={styles.sequenceDurationBadge}>
                        <Text style={styles.sequenceDurationText}>{selectedDuration}s</Text>
                      </View>
                    </LinearGradient>
                    <Text style={styles.sequenceLabel}>@{originalCreator.username}</Text>
                  </View>

                  <View style={styles.sequenceArrow}>
                    <LinearGradient
                      colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                      style={styles.arrowGradient}
                    >
                      <Icon name="chevron-right" size="sm" color={colors.gold} />
                    </LinearGradient>
                    <Text style={styles.transitionName}>{t(TRANSITIONS.find(tr => tr.id === selectedTransition)?.labelKey || '')}</Text>
                  </View>

                  <View style={styles.sequenceItem}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                      style={styles.sequenceThumbnail}
                    >
                      <Icon name="camera" size="md" color={colors.emerald} />
                      <View style={styles.sequenceDurationBadge}>
                        <Text style={styles.sequenceDurationText}>{recordTime}s</Text>
                      </View>
                    </LinearGradient>
                    <Text style={styles.sequenceLabel}>{t('stitch.you')}</Text>
                  </View>
                </View>

                {/* Total Duration */}
                <View style={styles.totalDurationContainer}>
                  <Text style={styles.totalDurationLabel}>{t('stitch.totalDuration')}</Text>
                  <Text style={styles.totalDurationValue}>{formatTime(totalDuration)}</Text>
                </View>

                {/* Play Preview Button */}
                <Pressable accessibilityRole="button"
                  accessibilityLabel={t('stitch.playPreview')}
                  style={styles.playPreviewButton}
                  onPress={() => setShowPreview(true)}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                    style={styles.playPreviewGradient}
                  >
                    <Icon name="play" size="sm" color="#FFF" />
                    <Text style={styles.playPreviewText}>{t('stitch.playPreview')}</Text>
                  </LinearGradient>
                </Pressable>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacing} />
        </ScrollView>

        {/* Bottom Action Bar */}
        <View style={styles.bottomBar}>
          <LinearGradient
            colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
            style={styles.bottomBarGradient}
          >
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.cancelButton} onPress={() => router.back()}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.next')} style={styles.nextButton} onPress={() => router.push({ pathname: '/(screens)/create-reel', params: { videoUri: recordedUri ?? '', isStitch: 'true', stitchOfId: reelId ?? '' } })}>
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.nextButtonGradient}
              >
                <Text style={styles.nextButtonText}>{t('common.next')}</Text>
                <Icon name="chevron-right" size="sm" color="#FFF" />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  originalCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  originalGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.active.gold30,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  creatorName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  stitchSubtitle: {
    fontSize: fontSize.xs,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  videoPreviewContainer: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  videoPreview: {
    height: 160,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  durationButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  durationButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  durationButtonGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  durationButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  durationButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  progressBarContainer: {
    marginTop: spacing.md,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  transitionCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  transitionGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  transitionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  transitionScroll: {
    gap: spacing.sm,
  },
  transitionButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  transitionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  transitionButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  transitionButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  yourClipCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  yourClipGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  yourClipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  yourClipIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  yourClipIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yourClipTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  yourClipSubtitle: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  cameraPreviewContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cameraPreview: {
    height: 160,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cameraHint: {
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  controlButtonSmall: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  controlButtonGradientSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonSmall: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonOuterSmall: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: tc.bg,
  },
  recordButtonInnerSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
  },
  recordingInnerSquareSmall: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },
  timerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  timerText: {
    fontSize: fontSize.md,
    fontFamily: fonts.mono,
    color: colors.text.primary,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.2)',
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordingBadgeText: {
    fontSize: fontSize.xs,
    color: colors.error,
  },
  previewCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  previewCardGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  previewCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  sequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sequenceItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  sequenceThumbnail: {
    width: 80,
    height: 100,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sequenceDurationBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    end: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sequenceDurationText: {
    fontSize: fontSizeExt.tiny,
    color: colors.text.primary,
    fontFamily: fonts.mono,
  },
  sequenceLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  sequenceArrow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  arrowGradient: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transitionName: {
    fontSize: fontSizeExt.tiny,
    color: colors.gold,
  },
  totalDurationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.active.white6,
    marginBottom: spacing.md,
  },
  totalDurationLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  totalDurationValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.mono,
    color: colors.emerald,
    fontWeight: '600',
  },
  playPreviewButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  playPreviewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  playPreviewText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
  },
  bottomBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  nextButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  nextButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
  galleryButton: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  galleryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  galleryButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    fontWeight: '500',
  },
});
