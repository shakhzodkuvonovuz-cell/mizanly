import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation, tabBar, glass } from '@/theme';

export interface MiniPlayerProps {
  videoTitle: string;
  channelName: string;
  thumbnailUri?: string;
  isPlaying: boolean;
  progress: number;           // 0-1
  onPlayPause: () => void;
  onClose: () => void;
  onExpand: () => void;       // Return to full player
}

const MINI_PLAYER_HEIGHT = 64;
const EXPAND_THRESHOLD = -80; // Swipe up distance to trigger expand
const DISMISS_THRESHOLD = 100; // Swipe right distance to dismiss

export function MiniPlayer({
  videoTitle,
  channelName,
  thumbnailUri,
  isPlaying,
  progress,
  onPlayPause,
  onClose,
  onExpand,
}: MiniPlayerProps) {
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [visible, setVisible] = useState(true);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const context = useSharedValue({ x: 0, y: 0 });

  const bottomOffset = tabBar.height - insets.bottom; // position above tab bar

  const handleClose = useCallback(() => {
    haptic.light();
    setVisible(false);
    setTimeout(onClose, 250);
  }, [haptic, onClose]);

  const handleExpand = useCallback(() => {
    haptic.light();
    onExpand();
  }, [haptic, onExpand]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value = context.value.x + event.translationX;
      translateY.value = context.value.y + event.translationY;
    })
    .onEnd((event) => {
      // Swipe up to expand
      if (event.translationY < EXPAND_THRESHOLD && event.velocityY < -500) {
        runOnJS(handleExpand)();
        translateX.value = withSpring(0, animation.spring.responsive);
        translateY.value = withSpring(0, animation.spring.responsive);
        return;
      }

      // Swipe right to dismiss
      if (event.translationX > DISMISS_THRESHOLD || event.velocityX > 800) {
        runOnJS(handleClose)();
        return;
      }

      // Return to original position
      translateX.value = withSpring(0, animation.spring.responsive);
      translateY.value = withSpring(0, animation.spring.responsive);
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progress * 100}%`,
  }));

  if (!visible) return null;

  const renderContent = () => (
    <View style={styles.contentRow}>
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Icon name="video" size="md" color={colors.text.secondary} />
          </View>
        )}
        <TouchableOpacity
          onPress={onPlayPause}
          style={styles.playButtonOverlay}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Title & channel */}
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {videoTitle}
        </Text>
        <Text style={styles.channel} numberOfLines={1}>
          {channelName}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onPlayPause}
          style={styles.actionButton}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size="md" color={colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.actionButton}
          accessibilityLabel="Close mini player"
        >
          <Icon name="x" size="md" color={colors.text.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(animation.timing.normal)}
      exiting={SlideOutDown.duration(animation.timing.fast)}
      style={[
        styles.container,
        containerStyle,
        {
          bottom: bottomOffset,
          left: spacing.base,
          right: spacing.base,
        },
      ]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View style={StyleSheet.absoluteFill}>
          {/* Glass background */}
          {Platform.OS === 'ios' ? (
            <BlurView intensity={glass.medium.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient
              colors={[glass.heavy.overlayColor, 'rgba(13, 17, 23, 0.85)']}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* Border */}
          <View style={styles.border} />
          {/* Progress bar */}
          <Animated.View style={[styles.progressBar, progressBarStyle]} />
          {/* Content */}
          {renderContent()}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    height: MINI_PLAYER_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.medium.borderColor,
    pointerEvents: 'none',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2,
    backgroundColor: colors.emerald,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
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
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: colors.dark.bgElevated,
  },
  playButtonOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: 'DMSans-Medium',
    marginBottom: 2,
  },
  channel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: 'DMSans',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.glass.dark,
    borderWidth: 1,
    borderColor: colors.glass.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});