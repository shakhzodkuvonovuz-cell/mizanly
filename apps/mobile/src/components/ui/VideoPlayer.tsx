import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ,
  Pressable,
  Dimensions,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, AVPlaybackStatus, ResizeMode, Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { usePiP } from '@/hooks/usePiP';

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
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  onPiPEnter?: () => void;
}

export function VideoPlayer({
  uri,
  hlsUrl,
  thumbnailUrl,
  duration,
  qualities,
  isLooping,
  autoPlay = false,
  enablePiP,
  onProgress,
  onComplete,
  onPiPEnter,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
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

  const haptic = useHaptic();
  const { isPiPSupported, enterPiP } = usePiP({
    isPlaying,
    onPiPChange: (active) => { if (active) onPiPEnter?.(); },
  });
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekBarWidthRef = useRef<number>(1);

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
    haptic.light();
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    resetControlsTimeout();
  }, [isPlaying, haptic, resetControlsTimeout]);

  const skipForward = useCallback(async () => {
    if (!videoRef.current || !status?.isLoaded) return;
    haptic.light();
    const currentPosition = status.positionMillis;
    const newPosition = currentPosition + 10000; // 10 seconds forward
    await videoRef.current.setPositionAsync(Math.min(newPosition, status.durationMillis ?? 0));
    resetControlsTimeout();
  }, [status, haptic, resetControlsTimeout]);

  const skipBackward = useCallback(async () => {
    if (!videoRef.current || !status?.isLoaded) return;
    haptic.light();
    const currentPosition = status.positionMillis;
    const newPosition = currentPosition - 10000; // 10 seconds backward
    await videoRef.current.setPositionAsync(Math.max(newPosition, 0));
    resetControlsTimeout();
  }, [status, haptic, resetControlsTimeout]);

  const handleSeek = useCallback(async (value: number) => {
    if (!videoRef.current || !status?.isLoaded) return;
    const newPosition = value * (status.durationMillis ?? 0);
    await videoRef.current.setPositionAsync(newPosition);
    resetControlsTimeout();
  }, [status, resetControlsTimeout]);

  const toggleMute = useCallback(async () => {
    if (!videoRef.current) return;
    haptic.light();
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

  const toggleFullscreen = useCallback(async () => {
    if (!videoRef.current) return;
    haptic.light();
    await (videoRef.current as unknown as { presentFullscreenPlayer: () => Promise<void> }).presentFullscreenPlayer();
    resetControlsTimeout();
  }, [haptic, resetControlsTimeout]);

  const formatTime = (milliseconds: number) => {
    if (!milliseconds) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const position = status?.isLoaded ? status.positionMillis : 0;
  const durationMillis = status?.isLoaded ? (status.durationMillis ?? 0) : (duration ? duration * 1000 : 0);
  const progress = durationMillis > 0 ? position / durationMillis : 0;

  const handleVideoPress = () => {
    resetControlsTimeout();
  };

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
      {/* Video */}
      <Pressable onPress={handleVideoPress} style={styles.videoPressable}>
        <Video
          ref={videoRef}
          source={{ uri: effectiveUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={autoPlay}
          useNativeControls={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
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
            <Skeleton.Rect width={Dimensions.get('window').width} height={Dimensions.get('window').width * (9 / 16)} borderRadius={0} />
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
            style={styles.controlsGradient}
          >
            {/* Top controls row */}
            <View style={styles.topControls}>
              <Pressable onPress={() => { haptic.light(); setLooping(!looping); }} style={styles.iconButton}>
                <Icon name="repeat" size="md" color={looping ? colors.emerald : colors.text.primary} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {qualities && qualities.length > 0 && (
                  <Pressable onPress={() => setQualitySheetVisible(true)} style={styles.iconButton}>
                    <Text style={styles.speedText}>{selectedQuality === 'auto' ? 'Auto' : selectedQuality}</Text>
                  </Pressable>
                )}
                {enablePiP && isPiPSupported && (
                  <Pressable onPress={() => { enterPiP(); haptic.light(); }} style={styles.iconButton}
                    accessibilityLabel="Picture in Picture" accessibilityRole="button">
                    <Icon name="layers" size="md" color={colors.text.primary} />
                  </Pressable>
                )}
                <Pressable onPress={toggleFullscreen} style={styles.iconButton}>
                  <Icon name="maximize" size="md" color={colors.text.primary} />
                </Pressable>
                <Pressable onPress={() => setSpeedSheetVisible(true)} style={styles.iconButton}>
                  <Text style={styles.speedText}>{playbackSpeed}x</Text>
                </Pressable>
              </View>
            </View>

            {/* Center play/pause button */}
            <View style={styles.centerControls}>
              <Pressable onPress={skipBackward} style={styles.skipButton}>
                <Icon name="rewind" size="xl" color={colors.text.primary} />
              </Pressable>
              <Pressable onPress={togglePlayPause} style={styles.playButton}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={48} color={colors.text.primary} />
              </Pressable>
              <Pressable onPress={skipForward} style={styles.skipButton}>
                <Icon name="fast-forward" size="xl" color={colors.text.primary} />
              </Pressable>
            </View>

            {/* Bottom controls row */}
            <View style={styles.bottomControls}>
              <Pressable onPress={toggleMute} style={styles.iconButton}>
                <Icon
                  name={isMuted ? 'volume-x' : volume > 0.5 ? 'volume-2' : 'volume-1'}
                  size="md"
                  color={colors.text.primary}
                />
              </Pressable>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
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
                  accessibilityRole="button"
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
      </Pressable>

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
          label="Auto"
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
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
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
});
