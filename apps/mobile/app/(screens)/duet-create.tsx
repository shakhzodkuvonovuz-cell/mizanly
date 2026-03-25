import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, withSpring, useAnimatedStyle, withRepeat } from 'react-native-reanimated';
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
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import { navigate } from '@/utils/navigation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type LayoutMode = 'side-by-side' | 'top-bottom' | 'react';

function SimpleSlider({ value, onValueChange, fillColor = colors.emerald, trackColor = 'rgba(255,255,255,0.2)' }: { value: number; onValueChange: (v: number) => void; fillColor?: string; trackColor?: string }) {
  const { t } = useTranslation();
  const trackWidth = useRef(0);
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={t('accessibility.volumeSlider')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
      onPress={(e) => {
        if (trackWidth.current <= 0) return;
        const ratio = e.nativeEvent.locationX / trackWidth.current;
        onValueChange(Math.max(0, Math.min(1, ratio)));
      }}
      style={sliderStyles.hitArea}
    >
      <View style={[sliderStyles.track, { backgroundColor: trackColor }]}>
        <View style={[sliderStyles.fill, { width: `${value * 100}%`, backgroundColor: fillColor }]} />
      </View>
    </Pressable>
  );
}

const sliderStyles = StyleSheet.create({
  hitArea: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});

export default function DuetCreateScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('side-by-side');
  const [flashOn, setFlashOn] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(70);
  const [yourVolume, setYourVolume] = useState(90);
  const [isMuted, setIsMuted] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { reelId, username, displayName, videoUrl } = useLocalSearchParams<{
    reelId: string;
    username?: string;
    displayName?: string;
    videoUrl?: string;
  }>();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

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
          if (prev >= 60) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 60;
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
  }, [isRecording]);

  const originalCreator = {
    username: username || t('duet.unknownCreator'),
    displayName: displayName || username || t('duet.unknownCreator'),
    isVerified: false,
    videoTitle: '',
    avatarUrl: null,
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
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        videoMaxDuration: 60,
        quality: 1,
        exif: false,
      });
      if (!result.canceled && result.assets[0]) {
        setRecordedUri(result.assets[0].uri);
        haptic.success();
        showToast({ message: t('duet.videoSelected', 'Video selected!'), variant: 'success' });
      }
    } catch {
      haptic.error();
      showToast({ message: t('duet.videoPickFailed', 'Failed to select video'), variant: 'error' });
    }
  };

  const isTimeRunningOut = recordTime >= 50;

  if (!permission?.granted) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader title={t('duet.createDuet')} onBack={() => router.back()} />
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
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader title={t('duet.createDuet')} showBackButton />

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Original Video Info Card */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)}>
            <View style={styles.originalInfoCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.originalInfoGradient}
              >
                <View style={styles.creatorRow}>
                  <View style={styles.avatarContainer}>
                    <View style={[styles.avatarPlaceholder, { backgroundColor: tc.surface }]}>
                      <Icon name="user" size="md" color={tc.text.tertiary} />
                    </View>
                  </View>
                  <View style={styles.creatorInfo}>
                    <View style={styles.creatorNameRow}>
                      <Text style={styles.creatorName}>{originalCreator.displayName}</Text>
                      {originalCreator.isVerified && <VerifiedBadge size={13} />}
                    </View>
                    <Text style={styles.creatorUsername}>@{originalCreator.username}</Text>
                    <Text style={styles.duetSubtitle}>{t('duet.duettingWith', { username: originalCreator.username })}</Text>
                  </View>
                </View>
                <View style={styles.videoTitleBadge}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.2)', 'rgba(10,123,79,0.1)']}
                    style={styles.videoTitleGradient}
                  >
                    <Icon name="play" size="xs" color={colors.gold} />
                    <Text style={styles.videoTitleText} numberOfLines={1}>
                      {originalCreator.videoTitle}
                    </Text>
                  </LinearGradient>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Split Preview Area */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.previewContainer}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.previewGradient}
              >
                {layoutMode === 'side-by-side' && (
                  <View style={styles.sideBySideLayout}>
                    {/* Original Panel */}
                    <View style={styles.previewPanel}>
                      <View style={styles.panelLabelContainer}>
                        <LinearGradient
                          colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                          style={styles.panelLabelGradient}
                        >
                          <Text style={styles.panelLabel}>{t('duet.original')}</Text>
                        </LinearGradient>
                      </View>
                      {videoUrl ? (
                        <Video
                          source={{ uri: videoUrl }}
                          style={[styles.videoPanel, { backgroundColor: tc.bgCard }]}
                          resizeMode={ResizeMode.COVER}
                          shouldPlay
                          isLooping
                          isMuted={isMuted}
                          volume={originalVolume / 100}
                          useNativeControls={false}
                        />
                      ) : (
                        <View style={[styles.videoPanel, { backgroundColor: tc.bgCard }]}>
                          <View style={styles.videoPanelInner}>
                            <Icon name="play" size="xl" color={tc.text.tertiary} />
                          </View>
                        </View>
                      )}
                      <Text style={styles.panelUsername}>@{originalCreator.username}</Text>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Your Panel */}
                    <View style={styles.previewPanel}>
                      <View style={styles.panelLabelContainer}>
                        <LinearGradient
                          colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                          style={styles.panelLabelGradient}
                        >
                          <Text style={[styles.panelLabel, styles.panelLabelActive]}>{t('duet.you')}</Text>
                        </LinearGradient>
                      </View>
                      <CameraView
                        ref={cameraRef}
                        style={[styles.videoPanel, { backgroundColor: tc.bgCard }, styles.yourVideoPanel]}
                        facing={facing}
                        mode="video"
                      />
                      <Text style={styles.panelUsername}>@your_username</Text>
                    </View>
                  </View>
                )}

                {layoutMode === 'top-bottom' && (
                  <View style={styles.topBottomLayout}>
                    <View style={styles.topBottomPanel}>
                      <View style={styles.panelLabelContainer}>
                        <LinearGradient
                          colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                          style={styles.panelLabelGradient}
                        >
                          <Text style={styles.panelLabel}>{t('duet.original')}</Text>
                        </LinearGradient>
                      </View>
                      {videoUrl ? (
                        <Video
                          source={{ uri: videoUrl }}
                          style={[styles.videoPanelTopBottom, { backgroundColor: tc.bgCard }]}
                          resizeMode={ResizeMode.COVER}
                          shouldPlay
                          isLooping
                          isMuted={isMuted}
                          volume={originalVolume / 100}
                          useNativeControls={false}
                        />
                      ) : (
                        <View style={[styles.videoPanelTopBottom, { backgroundColor: tc.bgCard }]}>
                          <Icon name="play" size="lg" color={tc.text.tertiary} />
                        </View>
                      )}
                    </View>
                    <View style={styles.dividerHorizontal} />
                    <View style={styles.topBottomPanel}>
                      <View style={styles.panelLabelContainer}>
                        <LinearGradient
                          colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                          style={styles.panelLabelGradient}
                        >
                          <Text style={[styles.panelLabel, styles.panelLabelActive]}>{t('duet.you')}</Text>
                        </LinearGradient>
                      </View>
                      <CameraView
                        ref={cameraRef}
                        style={[styles.videoPanelTopBottom, { backgroundColor: tc.bgCard }, styles.yourVideoPanel]}
                        facing={facing}
                        mode="video"
                      />
                    </View>
                  </View>
                )}

                {layoutMode === 'react' && (
                  <View style={styles.reactLayout}>
                    <View style={styles.reactOriginalPanel}>
                      <View style={styles.panelLabelContainer}>
                        <LinearGradient
                          colors={['rgba(45,53,72,0.8)', 'rgba(28,35,51,0.6)']}
                          style={styles.panelLabelGradient}
                        >
                          <Text style={styles.panelLabel}>{t('duet.original')}</Text>
                        </LinearGradient>
                      </View>
                      {videoUrl ? (
                        <Video
                          source={{ uri: videoUrl }}
                          style={[styles.videoPanelReact, { backgroundColor: tc.bgCard }]}
                          resizeMode={ResizeMode.COVER}
                          shouldPlay
                          isLooping
                          isMuted={isMuted}
                          volume={originalVolume / 100}
                          useNativeControls={false}
                        />
                      ) : (
                        <View style={[styles.videoPanelReact, { backgroundColor: tc.bgCard }]}>
                          <Icon name="play" size="lg" color={tc.text.tertiary} />
                        </View>
                      )}
                    </View>
                    <View style={styles.reactYourPanel}>
                      <CameraView
                        ref={cameraRef}
                        style={styles.reactYourPanelGradient}
                        facing={facing}
                        mode="video"
                      />
                    </View>
                  </View>
                )}
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Layout Selector */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <View style={styles.layoutSelectorContainer}>
              <Text style={styles.layoutSelectorTitle}>{t('duet.layout')}</Text>
              <View style={styles.layoutButtons}>
                {[
                  { id: 'side-by-side', icon: 'layout' as IconName, label: t('duet.layoutSideBySide') },
                  { id: 'top-bottom', icon: 'layers' as IconName, label: t('duet.layoutTopBottom') },
                  { id: 'react', icon: 'user' as IconName, label: t('duet.layoutReact') },
                ].map((layout) => (
                  <Pressable accessibilityRole="radio"
                    accessibilityLabel={layout.label}
                    accessibilityState={{ selected: layoutMode === layout.id }}
                    key={layout.id}
                    style={styles.layoutButton}
                    onPress={() => { haptic.tick(); setLayoutMode(layout.id as LayoutMode); }}
                  >
                    <LinearGradient
                      colors={layoutMode === layout.id
                        ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                        : colors.gradient.cardDark
                      }
                      style={styles.layoutButtonGradient}
                    >
                      <Icon
                        name={layout.icon}
                        size="sm"
                        color={layoutMode === layout.id ? colors.emerald : tc.text.secondary}
                      />
                      <Text style={[
                        styles.layoutButtonText,
                        layoutMode === layout.id && styles.layoutButtonTextActive
                      ]}>
                        {layout.label}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>

          {/* Recording Timer */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <View style={styles.timerContainer}>
              <LinearGradient
                colors={isTimeRunningOut
                  ? ['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']
                  : colors.gradient.cardDark
                }
                style={styles.timerGradient}
              >
                <Text style={[
                  styles.timerText,
                  isTimeRunningOut && styles.timerTextWarning
                ]}>
                  {formatTime(recordTime)} / 01:00
                </Text>
                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>{t('duet.recording')}</Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Recording Controls */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <View style={styles.controlsContainer}>
              {/* Flip Camera */}
              <Pressable accessibilityRole="button" accessibilityLabel={t('accessibility.flipCamera')} style={styles.controlButton} onPress={() => { haptic.tick(); setFacing(f => f === 'front' ? 'back' : 'front'); }}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                  style={styles.controlButtonGradient}
                >
                  <Icon name="repeat" size="md" color={tc.text.secondary} />
                </LinearGradient>
              </Pressable>

              {/* Record Button */}
              <Pressable accessibilityRole="button" accessibilityLabel={isRecording ? t('duet.stopRecording', 'Stop recording') : t('duet.startRecording', 'Start recording')} style={styles.recordButton} onPress={handleRecord}>
                <LinearGradient
                  colors={isRecording
                    ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                    : ['rgba(255,255,255,0.95)', 'rgba(240,240,240,1)']
                  }
                  style={[styles.recordButtonOuter, { borderColor: tc.bg }]}
                >
                  {isRecording ? (
                    <View style={styles.recordingInnerSquare} />
                  ) : (
                    <LinearGradient
                      colors={['rgba(248,81,73,1)', 'rgba(220,60,50,1)']}
                      style={styles.recordButtonInner}
                    />
                  )}
                </LinearGradient>
              </Pressable>

              {/* Flash Toggle */}
              <Pressable accessibilityRole="button"
                accessibilityLabel={flashOn ? t('duet.turnFlashOff', 'Turn flash off') : t('duet.turnFlashOn', 'Turn flash on')}
                style={styles.controlButton}
                onPress={() => { haptic.tick(); setFlashOn(!flashOn); }}
              >
                <LinearGradient
                  colors={flashOn
                    ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                    : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                  }
                  style={styles.controlButtonGradient}
                >
                  <Icon
                    name="sun"
                    size="md"
                    color={flashOn ? colors.gold : tc.text.secondary}
                  />
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>

          {/* Pick from Gallery */}
          <Animated.View entering={FadeInUp.delay(275).duration(400)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('duet.pickFromGallery', 'Pick from gallery')}
              style={styles.galleryButton}
              onPress={handlePickVideo}
            >
              <LinearGradient
                colors={recordedUri ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)'] : colors.gradient.cardDark}
                style={styles.galleryButtonGradient}
              >
                <Icon name="image" size="sm" color={recordedUri ? colors.emerald : tc.text.secondary} />
                <Text style={[styles.galleryButtonText, recordedUri && { color: colors.emerald }]}>
                  {recordedUri ? t('duet.videoReady', 'Video ready') : t('duet.pickFromGallery', 'Pick from gallery')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Audio Settings */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <View style={styles.audioCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.audioGradient}
              >
                <View style={styles.audioHeader}>
                  <View style={styles.audioIconContainer}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                      style={styles.audioIconGradient}
                    >
                      <Icon name="volume-2" size="sm" color={colors.emerald} />
                    </LinearGradient>
                  </View>
                  <Text style={styles.audioTitle}>{t('duet.audioSettings')}</Text>
                  <Pressable accessibilityRole="switch"
                    accessibilityLabel={t('duet.muteOriginal')}
                    accessibilityState={{ checked: isMuted }}
                    style={[styles.muteButton, { backgroundColor: tc.surface }, isMuted && styles.muteButtonActive]}
                    onPress={() => setIsMuted(!isMuted)}
                  >
                    <Icon name={isMuted ? 'volume-x' : 'volume-2'} size="xs" color={isMuted ? colors.error : tc.text.secondary} />
                    <Text style={[styles.muteButtonText, isMuted && styles.muteButtonTextActive]}>
                      {isMuted ? t('duet.muted') : t('duet.muteOriginal')}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.volumeSliders}>
                  <View style={styles.volumeRow}>
                    <Text style={styles.volumeLabel}>{t('duet.originalAudio')}</Text>
                    <Text style={styles.volumeValue}>{originalVolume}%</Text>
                  </View>
                  <SimpleSlider
                    value={originalVolume / 100}
                    onValueChange={(v) => setOriginalVolume(Math.round(v * 100))}
                    fillColor={isMuted ? tc.surface : colors.emerald}
                    trackColor={tc.surface}
                  />

                  <View style={[styles.volumeRow, styles.volumeRowSecond]}>
                    <Text style={styles.volumeLabel}>{t('duet.yourAudio')}</Text>
                    <Text style={styles.volumeValue}>{yourVolume}%</Text>
                  </View>
                  <SimpleSlider
                    value={yourVolume / 100}
                    onValueChange={(v) => setYourVolume(Math.round(v * 100))}
                    fillColor={colors.emerald}
                    trackColor={tc.surface}
                  />
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Next Button */}
          <Animated.View entering={FadeInUp.delay(350).duration(400)}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={t('common.next')}
              style={styles.nextButton}
              onPress={() => router.push({ pathname: '/(screens)/create-reel', params: { videoUri: recordedUri ?? '', isDuet: 'true', duetOfId: reelId ?? '' } })}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                style={styles.nextButtonGradient}
              >
                <Text style={styles.nextButtonText}>{t('common.next')}</Text>
                <Icon name="chevron-right" size="sm" color="#FFF" />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Bottom Spacing */}
          <View style={styles.bottomSpacing} />
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  originalInfoCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  originalInfoGradient: {
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
  avatarContainer: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
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
  creatorUsername: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  duetSubtitle: {
    fontSize: fontSize.xs,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  videoTitleBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  videoTitleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  videoTitleText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    maxWidth: 200,
  },
  previewContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  previewGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
  },
  sideBySideLayout: {
    flexDirection: 'row',
    height: screenHeight * 0.35,
    gap: spacing.sm,
  },
  topBottomLayout: {
    height: screenHeight * 0.35,
    gap: spacing.sm,
  },
  reactLayout: {
    height: screenHeight * 0.35,
    position: 'relative',
  },
  previewPanel: {
    flex: 1,
    position: 'relative',
  },
  topBottomPanel: {
    flex: 1,
    position: 'relative',
  },
  reactOriginalPanel: {
    width: '100%',
    height: '100%',
  },
  reactYourPanel: {
    position: 'absolute',
    bottom: spacing.md,
    end: spacing.md,
    width: 100,
    height: 140,
  },
  reactYourPanelGradient: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelLabelContainer: {
    position: 'absolute',
    top: spacing.sm,
    start: spacing.sm,
    zIndex: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  panelLabelGradient: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  panelLabel: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  panelLabelActive: {
    color: colors.emerald,
  },
  videoPanel: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yourVideoPanel: {
    backgroundColor: colors.dark.surface,
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
  },
  videoPanelInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  yourVideoPanelInner: {
    gap: spacing.sm,
  },
  videoPanelTopBottom: {
    flex: 1,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPanelReact: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapRecordHint: {
    fontSize: fontSize.xs,
    color: colors.emerald,
  },
  panelUsername: {
    position: 'absolute',
    bottom: spacing.sm,
    start: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerHorizontal: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  layoutSelectorContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  layoutSelectorTitle: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  layoutButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  layoutButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  layoutButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  layoutButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  layoutButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  timerContainer: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  timerGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    alignItems: 'center',
  },
  timerText: {
    fontSize: fontSize.xl,
    fontFamily: fonts.mono,
    color: colors.text.primary,
    fontWeight: '600',
  },
  timerTextWarning: {
    color: colors.gold,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordingText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  controlButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  controlButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonOuter: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.dark.bg,
  },
  recordButtonInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
  },
  recordingInnerSquare: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },
  audioCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  audioGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  audioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  audioIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  audioIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  muteButtonActive: {
    backgroundColor: 'rgba(248,81,73,0.2)',
  },
  muteButtonText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  muteButtonTextActive: {
    color: colors.error,
  },
  volumeSliders: {
    gap: spacing.sm,
  },
  volumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeRowSecond: {
    marginTop: spacing.sm,
  },
  volumeLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  volumeValue: {
    fontSize: fontSize.sm,
    color: colors.emerald,
    fontFamily: fonts.mono,
  },
  // sliderTrack/sliderFill removed — replaced by interactive SimpleSlider component
  nextButton: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
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
  bottomSpacing: {
    height: spacing.xxl,
  },
});
