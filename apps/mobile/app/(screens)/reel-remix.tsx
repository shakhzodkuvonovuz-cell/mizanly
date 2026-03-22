import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  Dimensions, Alert, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { GradientButton } from '@/components/ui/GradientButton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { reelsApi, uploadApi } from '@/services/api';
import type { Reel } from '@/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type LayoutMode = 'corner' | 'side' | 'full';
type AutocompleteType = 'hashtag' | 'mention' | null;

const MAX_CAPTION = 500;
const MAX_RECORD_SECONDS = 60;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ReelRemixScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const params = useLocalSearchParams<{ originalReelId: string }>();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('corner');
  const [recordTime, setRecordTime] = useState(0);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [caption, setCaption] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState<AutocompleteType>(null);
  const [refreshing, setRefreshing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const videoRef = useRef<Video>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionInputRef = useRef<TextInput>(null);

  const originalReelId = params.originalReelId || '';

  // Fetch original reel info
  const { data: originalReel, isLoading: isLoadingReel } = useQuery<Reel>({
    queryKey: ['reel', originalReelId],
    queryFn: () => reelsApi.getById(originalReelId),
    enabled: !!originalReelId,
  });

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Timer management
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => {
          if (prev >= MAX_RECORD_SECONDS) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;
    haptic.navigate();
    setIsRecording(true);
    setRecordTime(0);
    try {
      const result = await cameraRef.current.recordAsync();
      if (result?.uri) {
        setRecordedUri(result.uri);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.somethingWentWrong');
      Alert.alert(t('remix.recordError'), message);
    }
    setIsRecording(false);
  }, [haptic, t]);

  const stopRecording = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const toggleCamera = useCallback(() => {
    haptic.tick();
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, [haptic]);

  const toggleFlash = useCallback(() => {
    haptic.tick();
    setFlashOn((prev) => !prev);
  }, [haptic]);

  const handleLayoutChange = useCallback((mode: LayoutMode) => {
    haptic.tick();
    setLayout(mode);
  }, [haptic]);

  const discardRecording = useCallback(() => {
    Alert.alert(t('remix.discardTitle'), t('remix.discardMessage'), [
      { text: t('common.cancel') },
      {
        text: t('remix.discard'),
        style: 'destructive',
        onPress: () => {
          setRecordedUri(null);
          setRecordTime(0);
        },
      },
    ]);
  }, [t]);

  const handleCaptionChange = useCallback((text: string) => {
    setCaption(text);
  }, []);

  const insertAtCursor = useCallback((text: string) => {
    setCaption((prev) => prev + text);
    setShowAutocomplete(null);
  }, []);

  const handleBack = useCallback(() => {
    const hasContent = !!recordedUri || caption.trim().length > 0;
    if (hasContent) {
      Alert.alert(t('remix.discardTitle'), t('remix.discardMessage'), [
        { text: t('remix.keepEditing') },
        { text: t('remix.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }, [recordedUri, caption, t, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (originalReelId) {
      queryClient.invalidateQueries({ queryKey: ['reel', originalReelId] });
    }
    setRefreshing(false);
  }, [originalReelId, queryClient]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!recordedUri) throw new Error(t('remix.noRecording'));

      // Upload recorded video
      const presign = await uploadApi.getPresignUrl('video/mp4', 'reels');
      const videoBlob = await fetch(recordedUri).then((r) => r.blob());
      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: videoBlob,
      });
      if (!uploadRes.ok) throw new Error(t('remix.uploadFailed'));

      // Create the remix reel
      return reelsApi.create({
        videoUrl: presign.publicUrl,
        thumbnailUrl: presign.publicUrl,
        duration: recordTime,
        caption,
        hashtags: (caption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.slice(1).toLowerCase()),
        mentions: (caption.match(/@[a-zA-Z0-9_]+/g) || []).map((m) => m.slice(1).toLowerCase()),
      });
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      router.back();
    },
    onError: (error: Error) => {
      haptic.error();
      Alert.alert(t('remix.postFailed'), error.message || t('common.somethingWentWrong'));
    },
  });

  const handlePostRemix = useCallback(() => {
    if (!recordedUri) {
      Alert.alert(t('remix.noRecording'), t('remix.recordFirst'));
      return;
    }
    if (caption.length > MAX_CAPTION) {
      Alert.alert(t('remix.captionTooLong'), t('remix.maxCharacters'));
      return;
    }
    uploadMutation.mutate();
  }, [recordedUri, caption, uploadMutation, t]);

  const isTimeRunningOut = recordTime >= 50;

  // Camera permissions fallback
  if (!permission?.granted) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('remix.title')}
            leftAction={{
              icon: 'arrow-left',
              onPress: () => router.back(),
              accessibilityLabel: t('common.back'),
            }}
          />
          <View style={[styles.permissionContainer, { paddingTop: insets.top + 80 }]}>
            <EmptyState
              icon="camera"
              title={t('remix.cameraPermissionTitle')}
              subtitle={t('remix.cameraPermissionSubtitle')}
              actionLabel={t('remix.grantPermission')}
              onAction={requestPermission}
            />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // Post-recording view
  if (recordedUri) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('remix.preview')}
            leftAction={{
              icon: 'arrow-left',
              onPress: discardRecording,
              accessibilityLabel: t('common.back'),
            }}
          />

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {/* Combined preview */}
            <Animated.View entering={FadeInUp.duration(400)}>
              <View style={styles.previewCard}>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.previewGradient}
                >
                  <View style={styles.combinedPreview}>
                    {/* Your recording */}
                    <Video
                      source={{ uri: recordedUri }}
                      style={styles.previewVideo}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      isLooping
                    />

                    {/* Original reel PiP */}
                    {originalReel && (
                      <View style={styles.previewPip}>
                        {originalReel.hlsUrl || originalReel.videoUrl ? (
                          <Video
                            source={{ uri: originalReel.hlsUrl || originalReel.videoUrl }}
                            style={styles.previewPipImage}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay={true}
                            isLooping={true}
                            isMuted={false}
                            useNativeControls={false}
                          />
                        ) : originalReel.thumbnailUrl ? (
                          <ProgressiveImage
                            uri={originalReel.thumbnailUrl}
                            width="100%"
                            height={140}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.previewPipImage, styles.pipPlaceholder]}>
                            <Icon name="play" size="md" color={colors.text.tertiary} />
                          </View>
                        )}
                        <View style={styles.previewPipLabel}>
                          <Text style={styles.previewPipLabelText}>{t('remix.original')}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Caption input */}
            <Animated.View entering={FadeInUp.delay(100).duration(400)}>
              <View style={styles.captionSection}>
                <View style={styles.sectionHeader}>
                  <LinearGradient
                    colors={[colors.gold, colors.emerald]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.sectionAccent}
                  />
                  <Text style={styles.sectionLabel}>{t('remix.caption')}</Text>
                </View>
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.captionCard}
                >
                  <TextInput
                    ref={captionInputRef}
                    style={styles.captionInput}
                    placeholder={t('remix.captionPlaceholder')}
                    placeholderTextColor={colors.text.tertiary}
                    value={caption}
                    onChangeText={handleCaptionChange}
                    multiline
                    maxLength={MAX_CAPTION}
                    textAlignVertical="top"
                  />
                  <View style={styles.captionFooter}>
                    <View style={styles.captionTools}>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.captionToolBtn}
                        onPress={() => setShowAutocomplete('hashtag')}
                      >
                        <Icon name="hash" size="sm" color={colors.emerald} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.captionToolBtn}
                        onPress={() => setShowAutocomplete('mention')}
                      >
                        <Icon name="at-sign" size="sm" color={colors.gold} />
                      </Pressable>
                    </View>
                    <CharCountRing current={caption.length} max={MAX_CAPTION} size={28} />
                  </View>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Post button */}
            <Animated.View entering={FadeInUp.delay(200).duration(400)}>
              <View style={styles.postButtonContainer}>
                <GradientButton
                  label={t('remix.postRemix')}
                  onPress={handlePostRemix}
                  icon="send"
                  fullWidth
                  size="lg"
                  loading={uploadMutation.isPending}
                  disabled={uploadMutation.isPending}
                />
              </View>
            </Animated.View>

            <View style={{ height: spacing['2xl'] }} />
          </ScrollView>

          {/* Autocomplete sheet */}
          <BottomSheet
            visible={showAutocomplete !== null}
            onClose={() => setShowAutocomplete(null)}
            snapPoint={0.5}
          >
            {showAutocomplete === 'hashtag' && (
              <Autocomplete
                visible
                type="hashtag"
                query=""
                onSelect={(item) => insertAtCursor(`#${item} `)}
                onClose={() => setShowAutocomplete(null)}
              />
            )}
            {showAutocomplete === 'mention' && (
              <Autocomplete
                visible
                type="mention"
                query=""
                onSelect={(item) => insertAtCursor(`@${item} `)}
                onClose={() => setShowAutocomplete(null)}
              />
            )}
          </BottomSheet>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // Recording view
  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('remix.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: handleBack,
            accessibilityLabel: t('common.back'),
          }}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Camera + Original reel split view */}
          <Animated.View entering={FadeInUp.duration(400)}>
            <View style={styles.cameraContainer}>
              {/* Camera preview */}
              <CameraView
                ref={cameraRef}
                style={styles.cameraView}
                facing={facing}
                flash={flashOn ? 'on' : 'off'}
                mode="video"
              />

              {/* Original reel overlay based on layout */}
              {layout === 'corner' && originalReel && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.pipOverlay}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.pipGradient}
                  >
                    {originalReel.hlsUrl || originalReel.videoUrl ? (
                      <Video
                        source={{ uri: originalReel.hlsUrl || originalReel.videoUrl }}
                        style={styles.pipImage}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={true}
                        isLooping={true}
                        isMuted={false}
                        useNativeControls={false}
                      />
                    ) : (
                      <View style={[styles.pipImage, styles.pipPlaceholder]}>
                        <Icon name="play" size="md" color={colors.text.tertiary} />
                      </View>
                    )}
                    <View style={styles.pipLabel}>
                      <Text style={styles.pipLabelText}>{t('remix.original')}</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              )}

              {layout === 'side' && (
                <View style={styles.sideSplitOverlay}>
                  <View style={styles.sideSplitDivider} />
                  <View style={styles.sideSplitRight}>
                    {originalReel && (originalReel.hlsUrl || originalReel.videoUrl) ? (
                      <Video
                        source={{ uri: originalReel.hlsUrl || originalReel.videoUrl }}
                        style={styles.sideSplitImage}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={true}
                        isLooping={true}
                        isMuted={false}
                        useNativeControls={false}
                      />
                    ) : (
                      <View style={[styles.sideSplitImage, styles.pipPlaceholder]}>
                        <Icon name="play" size="lg" color={colors.text.tertiary} />
                      </View>
                    )}
                    <View style={styles.sideSplitLabel}>
                      <Text style={styles.pipLabelText}>{t('remix.original')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {layout === 'full' && originalReel && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.fullOverlay}>
                  {originalReel.hlsUrl || originalReel.videoUrl ? (
                    <Video
                      source={{ uri: originalReel.hlsUrl || originalReel.videoUrl }}
                      style={styles.fullOverlayImage}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={true}
                      isLooping={true}
                      isMuted={false}
                      useNativeControls={false}
                    />
                  ) : null}
                  <View style={styles.fullOverlayLabel}>
                    <Text style={styles.fullOverlayLabelText}>{t('remix.greenScreen')}</Text>
                  </View>
                </Animated.View>
              )}

              {/* Recording indicator */}
              {isRecording && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTimeText}>{formatTime(recordTime)}</Text>
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {/* Layout toggle buttons */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <View style={styles.layoutRow}>
              {([
                { key: 'corner' as LayoutMode, label: t('remix.layoutCorner'), icon: 'user' as const },
                { key: 'side' as LayoutMode, label: t('remix.layoutSide'), icon: 'layers' as const },
                { key: 'full' as LayoutMode, label: t('remix.layoutFull'), icon: 'image' as const },
              ]).map((opt) => (
                <Pressable
                  accessibilityRole="button"
                  key={opt.key}
                  style={styles.layoutBtn}
                  onPress={() => handleLayoutChange(opt.key)}
                >
                  <LinearGradient
                    colors={layout === opt.key
                      ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                      : colors.gradient.cardDark
                    }
                    style={styles.layoutBtnGradient}
                  >
                    <Icon
                      name={opt.icon}
                      size="sm"
                      color={layout === opt.key ? colors.emerald : colors.text.secondary}
                    />
                    <Text style={[
                      styles.layoutBtnText,
                      layout === opt.key && styles.layoutBtnTextActive,
                    ]}>
                      {opt.label}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Original reel info card */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <View style={styles.originalInfoCard}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.originalInfoGradient}
              >
                {isLoadingReel ? (
                  <View style={styles.originalInfoRow}>
                    <Skeleton.Circle size={40} />
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Skeleton.Rect width={120} height={14} borderRadius={radius.sm} />
                      <Skeleton.Rect width={180} height={12} borderRadius={radius.sm} />
                    </View>
                  </View>
                ) : originalReel ? (
                  <View style={styles.originalInfoRow}>
                    <Avatar
                      uri={originalReel.user?.avatarUrl ?? null}
                      name={
                        originalReel.user?.username ?? 'User'
                      }
                      size="md"
                    />
                    <View style={styles.originalInfoText}>
                      <Text style={styles.originalCreatorName}>
                        {originalReel.user
                          ? `@${originalReel.user.username}`
                          : t('remix.unknownCreator')}
                      </Text>
                      <Text style={styles.originalCaption} numberOfLines={2}>
                        {originalReel.caption || t('remix.noCaption')}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.originalInfoRow}>
                    <Icon name="video" size="md" color={colors.text.tertiary} />
                    <Text style={styles.originalCaption}>{t('remix.originalNotFound')}</Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Recording controls */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={styles.controlsRow}>
              {/* Camera flip */}
              <Pressable style={styles.controlBtn} onPress={toggleCamera}>
                <LinearGradient
                  colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                  style={styles.controlBtnGradient}
                >
                  <Icon name="camera" size="md" color={colors.text.secondary} />
                </LinearGradient>
              </Pressable>

              {/* Record button */}
              <Pressable style={styles.recordButtonOuter} onPress={toggleRecording}>
                <LinearGradient
                  colors={isRecording
                    ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                    : ['rgba(255,255,255,0.95)', 'rgba(240,240,240,1)']
                  }
                  style={styles.recordButtonGradient}
                >
                  {isRecording ? (
                    <View style={styles.recordSquare} />
                  ) : (
                    <LinearGradient
                      colors={['rgba(248,81,73,1)', 'rgba(220,60,50,1)']}
                      style={styles.recordCircleInner}
                    />
                  )}
                </LinearGradient>
              </Pressable>

              {/* Flash toggle */}
              <Pressable style={styles.controlBtn} onPress={toggleFlash}>
                <LinearGradient
                  colors={flashOn
                    ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                    : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                  }
                  style={styles.controlBtnGradient}
                >
                  <Icon
                    name={flashOn ? 'eye' : 'eye-off'}
                    size="md"
                    color={flashOn ? colors.gold : colors.text.secondary}
                  />
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>

          {/* Timer */}
          {(isRecording || recordTime > 0) && (
            <Animated.View entering={FadeIn.duration(200)}>
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
                    isTimeRunningOut && styles.timerTextWarning,
                  ]}>
                    {formatTime(recordTime)} / {formatTime(MAX_RECORD_SECONDS)}
                  </Text>
                </LinearGradient>
              </View>
            </Animated.View>
          )}

          <View style={{ height: spacing['2xl'] }} />
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const CAMERA_HEIGHT = SCREEN_H * 0.45;
const PIP_WIDTH = SCREEN_W * 0.3;
const PIP_HEIGHT = PIP_WIDTH * (16 / 9);

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },

  // Camera
  cameraContainer: {
    width: '100%',
    height: CAMERA_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: tc.bgCard,
  },
  cameraView: {
    width: '100%',
    height: '100%',
  },

  // PiP overlay (corner layout)
  pipOverlay: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pipGradient: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: colors.emerald,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pipImage: {
    width: '100%',
    height: '100%',
  },
  pipPlaceholder: {
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipLabel: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pipLabelText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Side by side overlay
  sideSplitOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '50%',
    flexDirection: 'row',
  },
  sideSplitDivider: {
    width: 2,
    backgroundColor: colors.emerald,
  },
  sideSplitRight: {
    flex: 1,
    position: 'relative',
  },
  sideSplitImage: {
    width: '100%',
    height: '100%',
  },
  sideSplitLabel: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },

  // Full overlay (green screen)
  fullOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.4,
  },
  fullOverlayImage: {
    width: '100%',
    height: '100%',
  },
  fullOverlayLabel: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  fullOverlayLabelText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Recording badge
  recordingBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordingTimeText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: fonts.mono,
  },

  // Layout toggles
  layoutRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  layoutBtn: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  layoutBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  layoutBtnText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  layoutBtnTextActive: {
    color: colors.emerald,
  },

  // Original info card
  originalInfoCard: {
    marginTop: spacing.md,
  },
  originalInfoGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  originalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  originalInfoText: {
    flex: 1,
  },
  originalCreatorName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  originalCaption: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },

  // Recording controls
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  controlBtn: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  controlBtnGradient: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonGradient: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: tc.bg,
  },
  recordCircleInner: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
  },
  recordSquare: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },

  // Timer
  timerContainer: {
    marginTop: spacing.md,
  },
  timerGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    alignItems: 'center',
  },
  timerText: {
    fontSize: fontSize.lg,
    fontFamily: fonts.mono,
    color: colors.text.primary,
    fontWeight: '600',
  },
  timerTextWarning: {
    color: colors.gold,
  },

  // Post-recording preview
  previewCard: {
    marginBottom: spacing.md,
  },
  previewGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    overflow: 'hidden',
  },
  combinedPreview: {
    width: '100%',
    height: SCREEN_W * (16 / 9) * 0.6,
    position: 'relative',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
    backgroundColor: tc.surface,
  },
  previewPip: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 100,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.emerald,
  },
  previewPipImage: {
    width: '100%',
    height: '100%',
  },
  previewPipLabel: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  previewPipLabelText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Caption
  captionSection: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  captionCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
  },
  captionInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    minHeight: 80,
  },
  captionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  captionTools: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  captionToolBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: tc.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Post button
  postButtonContainer: {
    marginTop: spacing.md,
  },
});
