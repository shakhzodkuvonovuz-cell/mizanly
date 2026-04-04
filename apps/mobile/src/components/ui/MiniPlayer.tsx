import { useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  FadeInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { colors, spacing, fontSize, radius, animation, tabBar, glass } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { navigate } from '@/utils/navigation';

const PROGRESS_BAR_HEIGHT = 3;
const CONTENT_HEIGHT = 64;
const MINI_PLAYER_HEIGHT = PROGRESS_BAR_HEIGHT + CONTENT_HEIGHT;
const DISMISS_Y_THRESHOLD = 150;
const DISMISS_X_THRESHOLD = 150;

export const MiniPlayer = memo(function MiniPlayer() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const videoRef = useRef<Video>(null);

  // Store selectors — single subscription via useShallow to avoid 6x re-renders
  const {
    miniPlayerVideo,
    miniPlayerProgress,
    miniPlayerPlaying,
    setMiniPlayerProgress,
    setMiniPlayerPlaying,
    closeMiniPlayer,
  } = useStore(useShallow((s) => ({
    miniPlayerVideo: s.miniPlayerVideo,
    miniPlayerProgress: s.miniPlayerProgress,
    miniPlayerPlaying: s.miniPlayerPlaying,
    setMiniPlayerProgress: s.setMiniPlayerProgress,
    setMiniPlayerPlaying: s.setMiniPlayerPlaying,
    closeMiniPlayer: s.closeMiniPlayer,
  })));

  // Animated values for gestures
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const gestureContext = useSharedValue({ x: 0, y: 0 });

  // Entry animation
  const entryProgress = useSharedValue(0);

  useEffect(() => {
    if (miniPlayerVideo) {
      entryProgress.value = withSpring(1, animation.spring.responsive);
    } else {
      entryProgress.value = 0;
      translateX.value = 0;
      translateY.value = 0;
    }
  }, [miniPlayerVideo, entryProgress, translateX, translateY]);

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (status.isLoaded) {
        if (
          status.positionMillis !== undefined &&
          status.durationMillis &&
          status.durationMillis > 0
        ) {
          const progress = status.positionMillis / status.durationMillis;
          if (Number.isFinite(progress)) {
            setMiniPlayerProgress(progress);
          }
        }
        if (status.didJustFinish) {
          setMiniPlayerPlaying(false);
        }
      }
    },
    [setMiniPlayerProgress, setMiniPlayerPlaying],
  );

  const handlePlayPause = useCallback(() => {
    haptic.tick();
    if (miniPlayerPlaying) {
      videoRef.current?.pauseAsync();
      setMiniPlayerPlaying(false);
    } else {
      videoRef.current?.playAsync();
      setMiniPlayerPlaying(true);
    }
  }, [haptic, miniPlayerPlaying, setMiniPlayerPlaying]);

  const handleClose = useCallback(() => {
    haptic.navigate();
    videoRef.current?.stopAsync().catch(() => {});
    closeMiniPlayer();
  }, [haptic, closeMiniPlayer]);

  const handleTapExpand = useCallback(() => {
    if (!miniPlayerVideo) return;
    haptic.navigate();
    const videoId = miniPlayerVideo.id;
    // Pause mini player video before navigating to full screen to prevent audio leak
    videoRef.current?.pauseAsync().catch(() => {});
    setMiniPlayerPlaying(false);
    // Close mini player, then navigate
    closeMiniPlayer();
    navigate(`/(screens)/video/${videoId}`);
  }, [haptic, miniPlayerVideo, closeMiniPlayer, setMiniPlayerPlaying]);

  // Gesture: pan to dismiss
  const panGesture = Gesture.Pan()
    .onStart(() => {
      gestureContext.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value = gestureContext.value.x + event.translationX;
      // Only allow downward swipe (clamp up to 0)
      translateY.value = Math.max(
        0,
        gestureContext.value.y + event.translationY,
      );
    })
    .onEnd((event) => {
      // Swipe down to dismiss
      if (event.translationY > DISMISS_Y_THRESHOLD) {
        runOnJS(handleClose)();
        return;
      }

      // Swipe left or right to dismiss
      if (Math.abs(event.translationX) > DISMISS_X_THRESHOLD) {
        runOnJS(handleClose)();
        return;
      }

      // Spring back to position
      translateX.value = withSpring(0, animation.spring.responsive);
      translateY.value = withSpring(0, animation.spring.responsive);
    });

  // Tap gesture for expanding
  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleTapExpand)();
  });

  // Compose gestures: pan has priority, tap on content area
  const composedGesture = Gesture.Race(panGesture, tapGesture);

  // Animated container style
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      Math.max(Math.abs(translateX.value), translateY.value),
      [0, DISMISS_X_THRESHOLD],
      [1, 0.3],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
      opacity,
    };
  });

  // Progress bar animated width
  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${miniPlayerProgress * 100}%`,
  }));

  if (!miniPlayerVideo) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(animation.timing.normal)}
      exiting={SlideOutDown.duration(animation.timing.fast)}
      style={[styles.container, { backgroundColor: tc.bgElevated, borderTopColor: tc.border }, containerAnimatedStyle]}
    >
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={styles.inner}>
          {/* Glass background */}
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={glass.medium.blurIntensity}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <LinearGradient
              colors={[glass.heavy.overlayColor, 'rgba(13, 17, 23, 0.85)']}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Border overlay */}
          <View style={styles.borderOverlay} />

          {/* Progress bar track */}
          <View style={[styles.progressTrack, { backgroundColor: tc.surface }]}>
            <Animated.View style={[styles.progressFillWrap, progressBarStyle]}>
              <LinearGradient
                colors={[colors.emerald, colors.emeraldLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressFill}
              />
            </Animated.View>
          </View>

          {/* Content row */}
          <View style={styles.contentRow}>
            {/* Video thumbnail — renders actual video at mini player size */}
            <View style={[styles.thumbnailContainer, { backgroundColor: tc.surface }]}>
              <Video
                ref={videoRef}
                source={{ uri: miniPlayerVideo.videoUrl }}
                style={styles.miniVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={miniPlayerPlaying}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              />
            </View>

            {/* Title + channel */}
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: tc.text.primary }]} numberOfLines={1}>
                {miniPlayerVideo.title}
              </Text>
              <Text style={[styles.channel, { color: tc.text.secondary }]} numberOfLines={1}>
                {miniPlayerVideo.channelName}
              </Text>
            </View>

            {/* Play/Pause button */}
            <Pressable
              onPress={handlePlayPause}
              style={styles.actionButton}
              hitSlop={4}
              accessibilityLabel={miniPlayerPlaying ? t('common.pause') : t('common.play')}
              accessibilityRole="button"
            >
              <Icon
                name={miniPlayerPlaying ? 'pause' : 'play'}
                size="md"
                color={colors.text.primary}
              />
            </Pressable>

            {/* Close button */}
            <Pressable
              onPress={handleClose}
              style={styles.actionButton}
              hitSlop={4}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <Icon name="x" size="md" color={colors.text.secondary} />
            </Pressable>
          </View>

        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: tabBar.height,
    start: 0,
    end: 0,
    height: MINI_PLAYER_HEIGHT,
    zIndex: 9999,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bgElevated,
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
    pointerEvents: 'none',
  },
  progressTrack: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: colors.dark.surface,
  },
  progressFillWrap: {
    height: PROGRESS_BAR_HEIGHT,
    overflow: 'hidden',
  },
  progressFill: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  thumbnailContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  channel: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniVideo: {
    width: '100%',
    height: '100%',
    borderRadius: radius.sm,
  },
});
