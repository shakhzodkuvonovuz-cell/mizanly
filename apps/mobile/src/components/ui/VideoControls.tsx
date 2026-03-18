import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ,
  Pressable,
  Platform,
  useWindowDimensions,
, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation, glass } from '@/theme';

export type VideoQuality = '360p' | '480p' | '720p' | '1080p' | '4K';
export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

const QUALITY_OPTIONS: VideoQuality[] = ['360p', '480p', '720p', '1080p', '4K'];
const SPEED_OPTIONS: PlaybackSpeed[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;        // seconds
  duration: number;           // seconds
  quality: VideoQuality;
  speed: PlaybackSpeed;
  volume: number;             // 0-1
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onQualityChange: (q: VideoQuality) => void;
  onSpeedChange: (s: PlaybackSpeed) => void;
  onVolumeChange: (v: number) => void;
  onFullscreen?: () => void;
  onMinimize?: () => void;    // Opens mini player
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  quality,
  speed,
  volume,
  onPlayPause,
  onSeek,
  onQualityChange,
  onSpeedChange,
  onVolumeChange,
  onFullscreen,
  onMinimize,
}: VideoControlsProps) {
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();

  const [showControls, setShowControls] = useState(true);
  const [qualitySheetVisible, setQualitySheetVisible] = useState(false);
  const [speedSheetVisible, setSpeedSheetVisible] = useState(false);
  const [volumeSliderVisible, setVolumeSliderVisible] = useState(false);

  const controlsOpacity = useSharedValue(1);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekBarWidthRef = useRef<number>(1);

  const resetHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setShowControls(true);
    controlsOpacity.value = withTiming(1, { duration: animation.timing.normal });
    hideTimeoutRef.current = setTimeout(() => {
      controlsOpacity.value = withTiming(0, { duration: animation.timing.normal });
      runOnJS(setShowControls)(false);
    }, 3000);
  }, [controlsOpacity]);

  useEffect(() => {
    resetHideTimeout();
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [resetHideTimeout]);

  const handleContainerPress = () => {
    resetHideTimeout();
  };

  const handlePlayPause = () => {
    haptic.light();
    onPlayPause();
    resetHideTimeout();
  };

  const handleSkipForward = () => {
    haptic.light();
    const newTime = Math.min(currentTime + 10, duration);
    onSeek(newTime);
    resetHideTimeout();
  };

  const handleSkipBackward = () => {
    haptic.light();
    const newTime = Math.max(currentTime - 10, 0);
    onSeek(newTime);
    resetHideTimeout();
  };

  const handleSeek = (ratio: number) => {
    const newTime = ratio * duration;
    onSeek(newTime);
    resetHideTimeout();
  };

  const handleQualitySelect = (q: VideoQuality) => {
    haptic.selection();
    onQualityChange(q);
    setQualitySheetVisible(false);
    resetHideTimeout();
  };

  const handleSpeedSelect = (s: PlaybackSpeed) => {
    haptic.selection();
    onSpeedChange(s);
    setSpeedSheetVisible(false);
    resetHideTimeout();
  };

  const handleVolumeChange = (v: number) => {
    onVolumeChange(v);
    resetHideTimeout();
  };

  const handleVolumeButtonPress = () => {
    haptic.light();
    const newVolume = volume === 0 ? 1 : 0;
    onVolumeChange(newVolume);
    resetHideTimeout();
  };

  const formatTime = (seconds: number) => {
    if (!seconds && seconds !== 0) return '0:00';
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const volumeIcon = volume === 0
    ? 'volume-x'
    : volume > 0.5
      ? 'volume-2'
      : 'volume-1';

  const progress = duration > 0 ? currentTime / duration : 0;

  const controlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const renderControls = () => (
    <Animated.View style={[styles.controlsContainer, controlsAnimatedStyle]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.glassPill}>
          <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
        </View>
        <View style={styles.topIcons}>
          {onMinimize && (
            <Pressable
              accessibilityRole="button"
              onPress={onMinimize}
              style={styles.iconButton}
              accessibilityLabel="Minimize player"
            >
              <Icon name="chevron-down" size="md" color={colors.text.primary} />
            </Pressable>
          )}
          {onFullscreen && (
            <Pressable
              accessibilityRole="button"
              onPress={onFullscreen}
              style={styles.iconButton}
              accessibilityLabel="Enter fullscreen"
            >
              <Icon name="maximize" size="md" color={colors.text.primary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Center play/skip buttons */}
      <View style={styles.centerRow}>
        <Pressable
          accessibilityRole="button"
          onPress={handleSkipBackward}
          style={styles.skipButton}
          accessibilityLabel="Skip back 10 seconds"
        >
          <Icon name="rewind" size="xl" color={colors.text.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={handlePlayPause}
          style={styles.playButton}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={48} color={colors.text.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={handleSkipForward}
          style={styles.skipButton}
          accessibilityLabel="Skip forward 10 seconds"
        >
          <Icon name="fast-forward" size="xl" color={colors.text.primary} />
        </Pressable>
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setQualitySheetVisible(true)}
          style={styles.iconButton}
          accessibilityLabel={`Quality: ${quality}`}
        >
          <Icon name="layers" size="md" color={colors.text.primary} />
          <Text style={styles.iconLabel}>{quality}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setSpeedSheetVisible(true)}
          style={styles.iconButton}
          accessibilityLabel={`Speed: ${speed}x`}
        >
          <Icon name="clock" size="md" color={colors.text.primary} />
          <Text style={styles.iconLabel}>{speed}x</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={handleVolumeButtonPress}
          style={styles.iconButton}
          accessibilityLabel={volume === 0 ? 'Unmute' : 'Mute'}
        >
          <Icon name={volumeIcon} size="md" color={colors.text.primary} />
          <Text style={styles.iconLabel}>{Math.round(volume * 100)}%</Text>
        </Pressable>
      </View>

      {/* Seek bar */}
      <View style={styles.seekBarContainer}>
        <View
          style={styles.seekBarBackground}
          onLayout={(e) => { seekBarWidthRef.current = e.nativeEvent.layout.width || 1; }}
        >
          <View style={[styles.seekBarProgress, { width: `${progress * 100}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const ratio = locationX / seekBarWidthRef.current;
            handleSeek(ratio);
          }}
        />
      </View>
    </Animated.View>
  );

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={handleContainerPress}>
      {/* Background gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
        locations={[0.1, 0.5, 0.9]}
        style={StyleSheet.absoluteFill}
      />

      {/* Controls */}
      {showControls && renderControls()}

      {/* Quality selector bottom sheet */}
      <BottomSheet visible={qualitySheetVisible} onClose={() => setQualitySheetVisible(false)}>
        {QUALITY_OPTIONS.map((q) => (
          <BottomSheetItem
            key={q}
            label={q}
            onPress={() => handleQualitySelect(q)}
            icon={q === quality ? (
              <Icon name="check" size="md" color={colors.emerald} />
            ) : (
              <Icon name="circle" size="md" color={colors.text.secondary} />
            )}
          />
        ))}
      </BottomSheet>

      {/* Speed selector bottom sheet */}
      <BottomSheet visible={speedSheetVisible} onClose={() => setSpeedSheetVisible(false)}>
        {SPEED_OPTIONS.map((s) => (
          <BottomSheetItem
            key={s}
            label={`${s}x${s === 1 ? ' (Normal)' : ''}`}
            onPress={() => handleSpeedSelect(s)}
            icon={s === speed ? (
              <Icon name="check" size="md" color={colors.emerald} />
            ) : (
              <Icon name="clock" size="md" color={colors.text.secondary} />
            )}
          />
        ))}
      </BottomSheet>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassPill: {
    backgroundColor: colors.glass.dark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  timeText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontFamily: 'DMSans-Medium',
  },
  topIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  iconLabel: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontFamily: 'DMSans-Medium',
  },
  centerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  skipButton: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  playButton: {
    padding: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  seekBarContainer: {
    height: 24,
    justifyContent: 'center',
  },
  seekBarBackground: {
    height: 4,
    backgroundColor: colors.glass.dark,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
});