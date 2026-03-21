import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  StyleSheet,
  Image,
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
import { useHaptic } from '@/hooks/useHaptic';
import { useStore } from '@/store';
import { colors, spacing, fontSize, radius, animation, tabBar, glass } from '@/theme';

const PROGRESS_BAR_HEIGHT = 3;
const CONTENT_HEIGHT = 64;
const MINI_PLAYER_HEIGHT = PROGRESS_BAR_HEIGHT + CONTENT_HEIGHT;
const DISMISS_Y_THRESHOLD = 150;
const DISMISS_X_THRESHOLD = 150;

export function MiniPlayer() {
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const videoRef = useRef<Video>(null);

  // Store selectors
  const miniPlayerVideo = useStore((s) => s.miniPlayerVideo);
  const miniPlayerProgress = useStore((s) => s.miniPlayerProgress);
  const miniPlayerPlaying = useStore((s) => s.miniPlayerPlaying);
  const setMiniPlayerProgress = useStore((s) => s.setMiniPlayerProgress);
  const setMiniPlayerPlaying = useStore((s) => s.setMiniPlayerPlaying);
  const closeMiniPlayer = useStore((s) => s.closeMiniPlayer);

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
    haptic.light();
    if (miniPlayerPlaying) {
      videoRef.current?.pauseAsync();
      setMiniPlayerPlaying(false);
    } else {
      videoRef.current?.playAsync();
      setMiniPlayerPlaying(true);
    }
  }, [haptic, miniPlayerPlaying, setMiniPlayerPlaying]);

  const handleClose = useCallback(() => {
    haptic.light();
    videoRef.current?.stopAsync().catch(() => {});
    closeMiniPlayer();
  }, [haptic, closeMiniPlayer]);

  const handleTapExpand = useCallback(() => {
    if (!miniPlayerVideo) return;
    haptic.light();
    const videoId = miniPlayerVideo.id;
    // Close mini player first, then navigate
    closeMiniPlayer();
    router.push(`/(screens)/video/${videoId}` as never);
  }, [haptic, miniPlayerVideo, closeMiniPlayer, router]);

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
      style={[styles.container, containerAnimatedStyle]}
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
          <View style={styles.progressTrack}>
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
            {/* Thumbnail */}
            <View style={styles.thumbnailContainer}>
              {miniPlayerVideo.thumbnailUri ? (
                <Image
                  source={{ uri: miniPlayerVideo.thumbnailUri }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <Icon
                    name="video"
                    size="md"
                    color={colors.text.secondary}
                  />
                </View>
              )}
            </View>

            {/* Title + channel */}
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {miniPlayerVideo.title}
              </Text>
              <Text style={styles.channel} numberOfLines={1}>
                {miniPlayerVideo.channelName}
              </Text>
            </View>

            {/* Play/Pause button */}
            <Pressable
              onPress={handlePlayPause}
              style={styles.actionButton}
              accessibilityLabel={miniPlayerPlaying ? 'Pause' : 'Play'}
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
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <Icon name="x" size="md" color={colors.text.secondary} />
            </Pressable>
          </View>

          {/* Hidden audio-only Video component for playback */}
          <Video
            ref={videoRef}
            source={{ uri: miniPlayerVideo.videoUrl }}
            style={styles.hiddenVideo}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={miniPlayerPlaying}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            positionMillis={undefined}
          />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: tabBar.height,
    left: 0,
    right: 0,
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
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiddenVideo: {
    width: 0,
    height: 0,
    position: 'absolute',
    opacity: 0,
  },
});
