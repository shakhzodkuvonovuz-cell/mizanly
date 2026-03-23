import { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, SlideOutDown } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTTS } from '@/hooks/useTTS';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius, animation, tabBar } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow } from '@/utils/rtl';

const MINI_PLAYER_HEIGHT = 56;

export function TTSMiniPlayer() {
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const {
    isActive,
    isPlaying,
    currentTitle,
    speed,
    pause,
    restart,
    stop,
    cycleSpeed,
  } = useTTS();

  const handlePlayPause = useCallback(() => {
    haptic.tick();
    if (isPlaying) {
      pause();
    } else {
      restart();
    }
  }, [haptic, isPlaying, pause, restart]);

  const handleStop = useCallback(() => {
    haptic.navigate();
    stop();
  }, [haptic, stop]);

  const handleSpeed = useCallback(() => {
    haptic.tick();
    cycleSpeed();
  }, [haptic, cycleSpeed]);

  if (!isActive) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(animation.timing.normal)}
      exiting={SlideOutDown.duration(animation.timing.fast)}
      style={[styles.container, { backgroundColor: tc.bgElevated, borderTopColor: tc.border }]}
    >
      {/* Emerald accent line */}
      <View style={styles.accentLine} />

      <View style={[styles.contentRow, { flexDirection: rtlFlexRow(isRTL) }]}>
        {/* Speaker icon */}
        <View style={styles.iconWrap}>
          <Icon name="volume-2" size="sm" color={colors.emerald} />
        </View>

        {/* Title / description */}
        <View style={styles.textContainer}>
          <Text style={styles.label} numberOfLines={1}>
            {t('tts.readingAloud')}
          </Text>
          {currentTitle && (
            <Text style={styles.title} numberOfLines={1}>
              {currentTitle}
            </Text>
          )}
        </View>

        {/* Speed button */}
        <Pressable
          onPress={handleSpeed}
          style={[styles.speedButton, { backgroundColor: tc.surface }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('tts.speed')}
          accessibilityRole="button"
        >
          <Text style={styles.speedText}>{speed}x</Text>
        </Pressable>

        {/* Play/Pause */}
        <Pressable
          onPress={handlePlayPause}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isPlaying ? t('tts.pause') : t('tts.resume')}
          accessibilityRole="button"
        >
          <Icon
            name={isPlaying ? 'pause' : 'play'}
            size="sm"
            color={colors.text.primary}
          />
        </Pressable>

        {/* Stop / Close */}
        <Pressable
          onPress={handleStop}
          style={styles.actionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('tts.stop')}
          accessibilityRole="button"
        >
          <Icon name="x" size="sm" color={colors.text.secondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: tabBar.height,
    start: 0,
    end: 0,
    height: MINI_PLAYER_HEIGHT,
    zIndex: 9998,
    backgroundColor: colors.dark.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
  },
  accentLine: {
    height: 2,
    backgroundColor: colors.emerald,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  speedButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm, // 8pt vertical padding — with hitSlop={8} gives 48pt effective touch target (WCAG)
    borderRadius: radius.sm,
    backgroundColor: colors.dark.surface,
    minHeight: 32, // ensures minimum 32pt before hitSlop
  },
  speedText: {
    color: colors.text.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
