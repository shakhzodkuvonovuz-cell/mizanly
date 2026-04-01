import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, AVPlaybackStatus, ResizeMode, VideoFullscreenUpdateEvent, VideoFullscreenUpdate } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { usePiP } from '@/hooks/usePiP';
import { useAmbientColor } from '@/hooks/useAmbientColor';

type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.25 | 1.5 | 2;
type VideoQuality = 'auto' | '360p' | '720p' | '1080p' | '4k';

interface VideoPlayerProps {
  uri: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  qualities?: string[];
  isLooping?: boolean;
  autoPlay?: boolean;
  enablePiP?: boolean;
  enableAmbient?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  onPiPEnter?: () => void;
}

/** Format milliseconds as `M:SS` for display. Pure function, no component deps. */
function formatTime(milliseconds: number): string {
  if (!milliseconds) return '0:00';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const VideoPlayer = memo(function VideoPlayer({
  uri,
  hlsUrl,
  thumbnailUrl,
  duration,
  qualities,
  isLooping,
  autoPlay = false,
  enablePiP,
  enableAmbient = true,
  onProgress,
  onComplete,
  onPiPEnter,
}: VideoPlayerProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [showControls, setShowControls] = useState(true);
  const [speedSheetVisible, setSpeedSheetVisible] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [volume, setVolume] = useState(1); // 0 to 1
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('auto');
  const [qualitySheetVisible, setQualitySheetVisible] = useState(false);
  const [looping, setLooping] = useState(isLooping ?? false);

  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const { dominantColor, secondaryColor } = useAmbientColor(enableAmbient ? thumbnailUrl : null);
  const { isPiPSupported, enterPiP } = usePiP({
    isPlaying,
    onPiPChange: (active) => { if (active) onPiPEnter?.(); },
  });
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekBarWidthRef = useRef<number>(1);

  // Double-tap seek indicator state
  const [seekIndicator, setSeekIndicator] = useState<{ side: 'left' | 'right'; visible: boolean }>({ side: 'left', visible: false });
  const seekIndicatorOpacity = useSharedValue(0);
  const seekIndicatorScale = useSharedValue(0.8);
  const seekIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSeekIndicator = useCallback((side: 'left' | 'right') => {
    setSeekIndicator({ side, visible: true });
    seekIndicatorOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 300 }),
    );
    seekIndicatorScale.value = withSequence(
      withTiming(1.1, { duration: 150 }),
      withTiming(1, { duration: 150 }),
      withTiming(0.8, { duration: 400 }),
    );
    if (seekIndicatorTimeoutRef.current) clearTimeout(seekIndicatorTimeoutRef.current);
    seekIndicatorTimeoutRef.current = setTimeout(() => {
      setSeekIndicator(prev => ({ ...prev, visible: false }));
    }, 800);
  }, [seekIndicatorOpacity, seekIndicatorScale]);

  const seekIndicatorStyle = useAnimatedStyle(() => ({
    opacity: seekIndicatorOpacity.value,
    transform: [{ scale: seekIndicatorScale.value }],
  }));

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (seekIndicatorTimeoutRef.current) {
        clearTimeout(seekIndicatorTimeoutRef.current);
      }
      // Restore StatusBar if component unmounts while in fullscreen
      StatusBar.setHidden(false, 'fade');
    };
  }, [resetControlsTimeout]);

  const handlePlaybackStatusUpdate = useCallback((newStatus: AVPlaybackStatus) => {
    setStatus(newStatus);
    if (newStatus.isLoaded) {
      setIsLoading(false);
      setIsBuffering(newStatus.isBuffering);
      setIsPlaying(newStatus.isPlaying);
      if (newStatus.durationMillis && newStatus.positionMillis !== undefined) {
        const progress = newStatus.positionMillis / newStatus.durationMillis;
        onProgress?.(progress);
        if (newStatus.didJustFinish) {
          onComplete?.();
        }
      }
    }
    if (!newStatus.isLoaded && newStatus.error) {
      setError(`Playback error: ${newStatus.error}`);
    }
  }, [onProgress, onComplete]);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    haptic.tick();
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    resetControlsTimeout();
  }, [isPlaying, haptic, resetControlsTimeout]);

  const skipForward = useCallback(async () => {
    if (!videoRef.current || !status?.isLoaded) return;
    haptic.tick();
    const currentPosition = status.positionMillis;
    const newPosition = currentPosition + 10000; // 10 seconds forward
    await videoRef.current.setPositionAsync(Math.min(newPosition, status.durationMillis ?? 0));
    resetControlsTimeout();
  }, [status, haptic, resetControlsTimeout]);

  const skipBackward = useCallback(async () => {
    if (!videoRef.current || !status?.isLoaded) return;
    haptic.tick();
    const currentPosition = status.positionMillis;
    const newPosition = currentPosition - 10000; // 10 seconds backward
    await videoRef.current.setPositionAsync(Math.max(newPosition, 0));
    resetControlsTimeout();
  }, [status, haptic, resetControlsTimeout]);

  // Double-tap to seek: left side = back 10s, right side = forward 10s
  const handleDoubleTapSeek = useCallback((x: number) => {
    const isLeftSide = x < windowWidth / 2;
    if (isLeftSide) {
      skipBackward();
      showSeekIndicator('left');
    } else {
      skipForward();
      showSeekIndicator('right');
    }
  }, [windowWidth, skipBackward, skipForward, showSeekIndicator]);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      'worklet';
      runOnJS(handleDoubleTapSeek)(event.x);
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      'worklet';
      runOnJS(resetControlsTimeout)();
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);

  const handleSeek = useCallback(async (value: number) => {
    if (!videoRef.current || !status?.isLoaded) return;
    const newPosition = value * (status.durationMillis ?? 0);
    await videoRef.current.setPositionAsync(newPosition);
    resetControlsTimeout();
  }, [status, resetControlsTimeout]);

  const toggleMute = useCallback(async () => {
    if (!videoRef.current) return;
    haptic.tick();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await videoRef.current.setVolumeAsync(newMuted ? 0 : volume);
    resetControlsTimeout();
  }, [isMuted, volume, haptic, resetControlsTimeout]);

  const changeSpeed = useCallback(async (speed: PlaybackSpeed) => {
    if (!videoRef.current) return;
    setPlaybackSpeed(speed);
    await videoRef.current.setRateAsync(speed, true);
    setSpeedSheetVisible(false);
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  const handleFullscreenUpdate = useCallback((event: VideoFullscreenUpdateEvent) => {
    const { fullscreenUpdate } = event;
    if (fullscreenUpdate === VideoFullscreenUpdate.PLAYER_WILL_PRESENT) {
      setIsFullscreen(true);
      StatusBar.setHidden(true, 'fade');
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (fullscreenUpdate === VideoFullscreenUpdate.PLAYER_WILL_DISMISS) {
      setIsFullscreen(false);
      StatusBar.setHidden(false, 'fade');
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!videoRef.current) return;
    haptic.tick();
    // presentFullscreenPlayer exists on Video at runtime but isn't in Expo AV types
    const ref = videoRef.current;
    if ('presentFullscreenPlayer' in ref) {
      await (ref as unknown as Record<string, () => Promise<void>>).presentFullscreenPlayer();
    }
    resetControlsTimeout();
  }, [haptic, resetControlsTimeout]);

  const position = status?.isLoaded ? status.positionMillis : 0;
  const durationMillis = status?.isLoaded ? (status.durationMillis ?? 0) : (duration ? duration * 1000 : 0);
  const progress = durationMillis > 0 ? position / durationMillis : 0;

  // Prefer HLS URL (adaptive bitrate) over raw R2 URL
  const effectiveUri = hlsUrl || uri;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="slash" size="lg" color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Ambient gradient background — extracts dominant color from thumbnail */}
      {enableAmbient && dominantColor && (
        <LinearGradient
          colors={[dominantColor, secondaryColor || 'transparent', tc.bg]}
          locations={[0, 0.4, 1]}
          style={styles.ambientGradient}
        />
      )}
      {/* Video — double-tap left/right to seek back/forward 10s */}
      <GestureDetector gesture={composedGesture}>
      <Animated.View style={styles.videoPressable}>
        <Video
          ref={videoRef}
          source={{ uri: effectiveUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay}
          useNativeControls={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onFullscreenUpdate={handleFullscreenUpdate}
          volume={isMuted ? 0 : volume}
          rate={playbackSpeed}
          isLooping={looping}
          onLoadStart={() => setIsLoading(true)}
        />
        {thumbnailUrl && !status?.isLoaded && (
          <View style={styles.thumbnailContainer}>
            {/* Thumbnail would be rendered via Image */}
          </View>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Skeleton.Rect width={windowWidth} height={windowWidth * (9 / 16)} borderRadius={0} />
          </View>
        )}

        {/* Buffering indicator */}
        {isBuffering && (
          <View style={styles.bufferingContainer}>
            <Skeleton.Rect width={40} height={40} borderRadius={radius.full} />
          </View>
        )}

        {/* Controls overlay */}
        {showControls && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.8)']}
            locations={[0.2, 0.5, 0.9]}
            style={[styles.controlsGradient, { paddingTop: Math.max(insets.top, spacing.base), paddingBottom: Math.max(insets.bottom, spacing.base) }]}
          >
            {/* Top controls row */}
            <View style={styles.topControls}>
              <Pressable onPress={() => { haptic.tick(); setLooping(!looping); }} style={styles.iconButton}
                accessibilityRole="button" accessibilityLabel={t('minbar.loop')} accessibilityState={{ selected: looping }}>
                <Icon name="repeat" size="md" color={looping ? colors.emerald : colors.text.primary} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {qualities && qualities.length > 0 && (
                  <Pressable onPress={() => setQualitySheetVisible(true)} style={styles.iconButton}
                    accessibilityRole="button" accessibilityLabel={t('minbar.quality')}>
                    <Text style={styles.speedText}>{selectedQuality === 'auto' ? 'Auto' : selectedQuality}</Text>
                  </Pressable>
                )}
                {enablePiP && isPiPSupported && (
                  <Pressable onPress={() => { enterPiP(); haptic.tick(); }} style={styles.iconButton}
                    accessibilityLabel={t('minbar.pictureInPicture')} accessibilityRole="button">
                    <Icon name="layers" size="md" color={colors.text.primary} />
                  </Pressable>
                )}
                <Pressable onPress={toggleFullscreen} style={styles.iconButton}
                  accessibilityRole="button" accessibilityLabel={t('minbar.fullscreen')}>
                  <Icon name="maximize" size="md" color={colors.text.primary} />
                </Pressable>
                <Pressable onPress={() => setSpeedSheetVisible(true)} style={styles.iconButton}
                  accessibilityRole="button" accessibilityLabel={t('minbar.speed')}>
                  <Text style={styles.speedText}>{playbackSpeed}x</Text>
                </Pressable>
              </View>
            </View>

            {/* Center play/pause button */}
            <View style={styles.centerControls}>
              <Pressable onPress={skipBackward} style={styles.skipButton}
                accessibilityRole="button" accessibilityLabel={t('minbar.skipBackward')}>
                <Icon name="rewind" size="xl" color={colors.text.primary} />
              </Pressable>
              <Pressable onPress={togglePlayPause} style={styles.playButton}
                accessibilityRole="button" accessibilityLabel={isPlaying ? t('minbar.pause') : t('minbar.play')}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={48} color={colors.text.primary} />
              </Pressable>
              <Pressable onPress={skipForward} style={styles.skipButton}
                accessibilityRole="button" accessibilityLabel={t('minbar.skipForward')}>
                <Icon name="fast-forward" size="xl" color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Bottom controls row */}
            <View style={styles.bottomControls}>
              <Pressable onPress={toggleMute} style={styles.iconButton}
                accessibilityRole="button" accessibilityLabel={isMuted ? t('minbar.unmute') : t('minbar.mute')}>
                <Icon
                  name={isMuted ? 'volume-x' : volume > 0.5 ? 'volume-2' : 'volume-1'}
                  size="md"
                  color={colors.text.primary}
                />
              </Pressable>
              <Text style={styles.timeText} accessibilityLabel={`${t('minbar.position')} ${formatTime(position)}`}>{formatTime(position)}</Text>
              {/* Seek bar */}
              <View
                style={styles.seekBarContainer}
                onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width || 1; }}
              >
                <View style={styles.seekBarBackground}>
                  <View style={[styles.seekBarProgress, { width: `${progress * 100}%` }]} />
                  {status?.isLoaded && status.playableDurationMillis && (
                    <View
                      style={[
                        styles.seekBarBuffered,
                        { width: `${(status.playableDurationMillis / (durationMillis || 1)) * 100}%` },
                      ]}
                    />
                  )}
                </View>
                <Pressable
                  accessibilityRole="adjustable"
                  accessibilityLabel={t('minbar.seekBar')}
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                  style={styles.seekBarTouchable}
                  onPress={(e) => {
                    const { locationX } = e.nativeEvent;
                    const ratio = locationX / seekBarWidthRef.current;
                    handleSeek(ratio);
                  }}
                />
              </View>
              <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
            </View>
          </LinearGradient>
        )}

        {/* Double-tap seek indicator */}
        {seekIndicator.visible && (
          <Animated.View
            style={[
              styles.seekIndicatorContainer,
              seekIndicator.side === 'left' ? styles.seekIndicatorLeft : styles.seekIndicatorRight,
              seekIndicatorStyle,
            ]}
            pointerEvents="none"
          >
            <View style={styles.seekIndicatorBubble}>
              <Icon name={seekIndicator.side === 'left' ? 'rewind' : 'fast-forward'} size="sm" color={colors.text.primary} />
              <Text style={styles.seekIndicatorText}>10s</Text>
            </View>
          </Animated.View>
        )}
      </Animated.View>
      </GestureDetector>

      {/* Speed selector bottom sheet */}
      <BottomSheet visible={speedSheetVisible} onClose={() => setSpeedSheetVisible(false)}>
        <BottomSheetItem
          label="0.25x"
          onPress={() => changeSpeed(0.25)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
        <BottomSheetItem
          label="0.5x"
          onPress={() => changeSpeed(0.5)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
        <BottomSheetItem
          label="1x (Normal)"
          onPress={() => changeSpeed(1)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
        <BottomSheetItem
          label="1.25x"
          onPress={() => changeSpeed(1.25)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
        <BottomSheetItem
          label="1.5x"
          onPress={() => changeSpeed(1.5)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
        <BottomSheetItem
          label="2x"
          onPress={() => changeSpeed(2)}
          icon={<Icon name="clock" size="md" color={colors.text.secondary} />}
        />
      </BottomSheet>

      {/* Quality selector bottom sheet */}
      <BottomSheet visible={qualitySheetVisible} onClose={() => setQualitySheetVisible(false)}>
        <BottomSheetItem
          label={t('minbar.all')}
          onPress={() => { setSelectedQuality('auto'); setQualitySheetVisible(false); }}
          icon={<Icon name="settings" size="md" color={selectedQuality === 'auto' ? colors.emerald : colors.text.secondary} />}
        />
        {(qualities || []).map((q) => (
          <BottomSheetItem
            key={q}
            label={q}
            onPress={() => { setSelectedQuality(q as VideoQuality); setQualitySheetVisible(false); }}
            icon={<Icon name="layers" size="md" color={selectedQuality === q ? colors.emerald : colors.text.secondary} />}
          />
        ))}
      </BottomSheet>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  ambientGradient: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  videoPressable: {
    flex: 1,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  thumbnailContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dark.bgElevated,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
  },
  bufferingContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    padding: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
  },
  errorContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  controlsGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
  },
  speedText: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  skipButton: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
  },
  playButton: {
    padding: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    minWidth: 40,
    textAlign: 'center',
  },
  seekBarContainer: {
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  seekBarBackground: {
    height: 4,
    backgroundColor: colors.dark.borderLight,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  seekBarProgress: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.sm,
  },
  seekBarBuffered: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.text.tertiary,
    borderRadius: radius.sm,
  },
  seekBarTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  seekIndicatorContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekIndicatorLeft: {
    left: 0,
  },
  seekIndicatorRight: {
    right: 0,
  },
  seekIndicatorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.glass.dark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  seekIndicatorText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});
