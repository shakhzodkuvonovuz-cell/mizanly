import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';

// ── Types ──

interface VoiceWaveformProps {
  /** Audio file URI — used to derive deterministic bar heights */
  uri: string;
  /** Total duration in seconds */
  duration: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Playback progress from 0 to 1 */
  progress: number;
  /** Called when play/pause button is pressed */
  onPlay: () => void;
  /** Whether this message was sent by the current user (affects color scheme) */
  isOwn: boolean;
}

// ── Constants ──

const NUM_BARS = 30;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_MIN_HEIGHT = 4;
const BAR_MAX_HEIGHT = 24;
const WAVEFORM_HEIGHT = 32;
const PLAY_BUTTON_SIZE = 32;

// ── Deterministic hash ──

/**
 * Simple djb2 hash function that produces deterministic bar heights from a URI string.
 * This avoids Math.random() (rule 23) and ensures the same URI always renders
 * the same waveform shape.
 */
function generateBarHeights(uri: string): number[] {
  const heights: number[] = [];
  let hash = 5381;

  // Create a longer seed by repeating the URI hash
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) + hash + uri.charCodeAt(i)) | 0;
  }

  for (let i = 0; i < NUM_BARS; i++) {
    // Use different hash per bar by mixing index
    hash = ((hash << 5) + hash + i * 7 + 13) | 0;
    // Map to 0-1 range deterministically
    const normalized = Math.abs(hash % 1000) / 1000;
    // Apply a wave-like envelope: bars in the middle tend to be taller
    const envelope = Math.sin((i / (NUM_BARS - 1)) * Math.PI) * 0.4 + 0.6;
    const height = BAR_MIN_HEIGHT + (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * normalized * envelope;
    heights.push(Math.round(height));
  }

  return heights;
}

/**
 * Format seconds into mm:ss display.
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ── Component ──

export const VoiceWaveform = memo(function VoiceWaveform({
  uri,
  duration,
  isPlaying,
  progress,
  onPlay,
  isOwn,
}: VoiceWaveformProps) {
  const tc = useThemeColors();

  const barHeights = useMemo(() => generateBarHeights(uri), [uri]);

  // Determine which bar index the progress has reached
  const progressIndex = Math.floor(progress * NUM_BARS);

  // Colors: played portion is emerald, unplayed is tertiary.
  // For own messages (emerald bubble), use white/whiteAlpha for contrast.
  const playedColor = isOwn ? colors.extended.white : colors.emerald;
  const unplayedColor = isOwn
    ? 'rgba(255, 255, 255, 0.35)'
    : tc.text.tertiary;
  const buttonColor = isOwn ? colors.extended.white : colors.emerald;
  const durationColor = isOwn ? 'rgba(255, 255, 255, 0.7)' : tc.text.secondary;

  // Remaining time display: show remaining when playing, total when stopped
  const displayTime = isPlaying
    ? formatDuration(duration * (1 - progress))
    : formatDuration(duration);

  return (
    <View style={styles.container}>
      {/* Play/Pause button */}
      <Pressable
        style={[styles.playButton, { backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : colors.active.emerald15 }]}
        onPress={onPlay}
        hitSlop={8}
        accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
        accessibilityRole="button"
      >
        <Icon
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color={buttonColor}
        />
      </Pressable>

      {/* Waveform bars */}
      <View style={styles.waveformContainer}>
        {barHeights.map((height, index) => {
          const isPlayed = index < progressIndex;
          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: isPlayed ? playedColor : unplayedColor,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Duration text */}
      <Text style={[styles.duration, { color: durationColor }]}>
        {displayTime}
      </Text>
    </View>
  );
});

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 200,
    maxWidth: 240,
    height: 40,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: WAVEFORM_HEIGHT,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  duration: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bodyMedium,
    minWidth: 32,
    textAlign: 'right',
  },
});
