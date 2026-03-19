import { memo, useCallback, useState } from 'react';
import { View, StyleSheet, Dimensions, Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { useTranslation } from '@/hooks/useTranslation';

const SCREEN_W = Dimensions.get('window').width;
const TIMELINE_HEIGHT = 64;
const HANDLE_WIDTH = 16;

interface VideoSegment {
  id: string;
  startMs: number;
  endMs: number;
  speed: number; // 0.5x, 1x, 2x, etc.
  thumbnailUri?: string;
}

interface VideoTimelineProps {
  durationMs: number;
  segments: VideoSegment[];
  currentPositionMs: number;
  onTrim: (segmentId: string, startMs: number, endMs: number) => void;
  onSplit: (positionMs: number) => void;
  onSpeedChange: (segmentId: string, speed: number) => void;
  onSeek: (positionMs: number) => void;
}

/**
 * Deep video editor timeline UI.
 * Features: trim handles, split markers, speed per segment.
 */
export const VideoTimeline = memo(function VideoTimeline({
  durationMs,
  segments,
  currentPositionMs,
  onTrim,
  onSplit,
  onSpeedChange,
  onSeek,
}: VideoTimelineProps) {
  const { t } = useTranslation();
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const timelineWidth = SCREEN_W - spacing.base * 2;
  const msPerPixel = durationMs / timelineWidth;

  const playheadX = useSharedValue((currentPositionMs / durationMs) * timelineWidth);

  const playheadStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: playheadX.value }],
  }));

  // Scrub gesture
  const scrubGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newX = Math.max(0, Math.min(e.x, timelineWidth));
      playheadX.value = newX;
      const posMs = newX * msPerPixel;
      runOnJS(onSeek)(posMs);
    });

  const handleSplit = useCallback(() => {
    onSplit(currentPositionMs);
  }, [currentPositionMs, onSplit]);

  const speeds = [0.5, 1, 1.5, 2];

  return (
    <View style={styles.container}>
      {/* Speed selector for selected segment */}
      {selectedSegment && (
        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>{t('editor.speed')}</Text>
          {speeds.map((speed) => {
            const segment = segments.find(s => s.id === selectedSegment);
            const isActive = segment?.speed === speed;
            return (
              <Pressable
                key={speed}
                style={[styles.speedChip, isActive && styles.speedChipActive]}
                onPress={() => onSpeedChange(selectedSegment, speed)}
                accessibilityRole="button"
                accessibilityLabel={`${speed}x speed`}
              >
                <Text style={[styles.speedText, isActive && styles.speedTextActive]}>
                  {speed}x
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Timeline */}
      <GestureDetector gesture={scrubGesture}>
        <View style={[styles.timeline, { width: timelineWidth }]}>
          {/* Segments */}
          {segments.map((segment) => {
            const left = (segment.startMs / durationMs) * timelineWidth;
            const width = ((segment.endMs - segment.startMs) / durationMs) * timelineWidth;
            const isSelected = selectedSegment === segment.id;

            return (
              <Pressable
                key={segment.id}
                style={[
                  styles.segment,
                  { left, width },
                  isSelected && styles.segmentSelected,
                ]}
                onPress={() => setSelectedSegment(isSelected ? null : segment.id)}
                accessibilityRole="button"
                accessibilityLabel={`Segment ${segment.id}`}
              >
                {/* Left trim handle */}
                <View style={[styles.handle, styles.handleLeft]}>
                  <View style={styles.handleBar} />
                </View>

                {/* Speed indicator */}
                {segment.speed !== 1 && (
                  <View style={styles.speedBadge}>
                    <Text style={styles.speedBadgeText}>{segment.speed}x</Text>
                  </View>
                )}

                {/* Right trim handle */}
                <View style={[styles.handle, styles.handleRight]}>
                  <View style={styles.handleBar} />
                </View>
              </Pressable>
            );
          })}

          {/* Playhead */}
          <Animated.View style={[styles.playhead, playheadStyle]} />
        </View>
      </GestureDetector>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={handleSplit}
          accessibilityRole="button"
          accessibilityLabel={t('editor.split')}
        >
          <Icon name="slash" size="sm" color={colors.text.primary} />
          <Text style={styles.actionText}>{t('editor.split')}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.dark.bgElevated,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  speedLabel: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  speedChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  speedChipActive: {
    backgroundColor: colors.emerald,
  },
  speedText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  speedTextActive: {
    color: '#fff',
  },
  timeline: {
    height: TIMELINE_HEIGHT,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: `${colors.emerald}30`,
    borderWidth: 1,
    borderColor: colors.emerald,
    borderRadius: radius.sm,
  },
  segmentSelected: {
    borderColor: colors.gold,
    borderWidth: 2,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleLeft: { left: 0 },
  handleRight: { right: 0 },
  handleBar: {
    width: 3,
    height: 24,
    borderRadius: 1.5,
    backgroundColor: colors.emerald,
  },
  speedBadge: {
    position: 'absolute',
    top: 4,
    left: HANDLE_WIDTH + 4,
    backgroundColor: colors.dark.surface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  speedBadgeText: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '700',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
  },
  actionText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
