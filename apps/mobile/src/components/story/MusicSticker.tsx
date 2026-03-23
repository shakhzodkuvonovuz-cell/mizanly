import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius, fonts, animation, fontSizeExt } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';

// ── Types ──
export interface MusicStickerData {
  trackId: string;
  title: string;
  artist: string;
  albumArt?: string;
  startTime?: number; // seconds
  duration?: number; // clip length in seconds (default 15)
  displayMode: 'compact' | 'lyrics' | 'waveform';
  lyrics?: string[]; // array of lyric lines synced to clip
}

interface MusicStickerProps {
  data: MusicStickerData;
  isPlaying?: boolean;
  style?: StyleProp<ViewStyle>;
}

// ── Waveform bars animation ──
function WaveformBars({ isPlaying, barCount = 5 }: { isPlaying: boolean; barCount?: number }) {
  return (
    <View style={waveStyles.container}>
      {Array.from({ length: barCount }, (_, i) => (
        <WaveBar key={i} index={i} isPlaying={isPlaying} />
      ))}
    </View>
  );
}

function WaveBar({ index, isPlaying }: { index: number; isPlaying: boolean }) {
  const height = useSharedValue(8);

  useEffect(() => {
    if (isPlaying) {
      const minH = 4 + (index % 3) * 2;
      const maxH = 16 + (index % 4) * 4;
      height.value = withRepeat(
        withSequence(
          withTiming(maxH, { duration: 300 + index * 80, easing: Easing.inOut(Easing.ease) }),
          withTiming(minH, { duration: 250 + index * 60, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    } else {
      height.value = withSpring(8, animation.spring.gentle);
    }
  }, [isPlaying, index, height]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View style={[waveStyles.bar, barStyle]} />
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 28,
  },
  bar: {
    width: 3,
    backgroundColor: colors.emerald,
    borderRadius: 2,
  },
});

/**
 * Music sticker overlay — displays on stories with song info,
 * animated waveform, or scrolling lyrics.
 */
export function MusicSticker({ data, isPlaying = true, style }: MusicStickerProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();

  // ── Lyric state: active line index + active word index within that line ──
  const [activeLine, setActiveLine] = useState(0);
  const [activeWord, setActiveWord] = useState(0);

  useEffect(() => {
    if (data.displayMode !== 'lyrics' || !data.lyrics || data.lyrics.length === 0 || !isPlaying) return;

    const lyrics = data.lyrics;
    const words = lyrics[activeLine]?.split(/\s+/) || [];
    const wordDuration = 400; // ms per word highlight
    const linePause = 600; // ms pause between lines

    // Advance words within current line
    if (activeWord < words.length - 1) {
      const timer = setTimeout(() => setActiveWord(prev => prev + 1), wordDuration);
      return () => clearTimeout(timer);
    }

    // Move to next line after finishing all words
    const timer = setTimeout(() => {
      setActiveLine(prev => (prev + 1) % lyrics.length);
      setActiveWord(0);
    }, linePause);
    return () => clearTimeout(timer);
  }, [data.displayMode, data.lyrics, isPlaying, activeLine, activeWord]);

  if (data.displayMode === 'compact') {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={[styles.compactContainer, style]}>
        <LinearGradient
          colors={['rgba(10,123,79,0.85)', 'rgba(6,107,66,0.9)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.compactContent}>
          <WaveformBars isPlaying={isPlaying} barCount={4} />
          <View style={styles.compactTextWrap}>
            <Text style={styles.compactTitle} numberOfLines={1}>
              {data.title}
            </Text>
            <Text style={styles.compactArtist} numberOfLines={1}>
              {data.artist}
            </Text>
          </View>
          <Icon name="volume-x" size="sm" color="rgba(255,255,255,0.7)" />
        </View>
      </Animated.View>
    );
  }

  if (data.displayMode === 'waveform') {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={[styles.waveformContainer, style]}>
        <View style={styles.waveformHeader}>
          <Icon name="volume-x" size="sm" color={colors.emerald} />
          <Text style={styles.waveformTitle} numberOfLines={1}>
            {data.title}
          </Text>
        </View>
        <Text style={styles.waveformArtist} numberOfLines={1}>
          {data.artist}
        </Text>
        <View style={styles.waveformVisualizer}>
          <WaveformBars isPlaying={isPlaying} barCount={12} />
        </View>
      </Animated.View>
    );
  }

  // ── Lyrics mode ──
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.lyricsContainer, style]}>
      <View style={styles.lyricsHeader}>
        <WaveformBars isPlaying={isPlaying} barCount={3} />
        <Text style={styles.lyricsSongInfo} numberOfLines={1}>
          {data.title} — {data.artist}
        </Text>
      </View>
      {data.lyrics && data.lyrics.length > 0 ? (
        <View style={styles.lyricsBody}>
          {/* Show 3 lines: previous (dim), current (word highlight), next (dim) */}
          {[-1, 0, 1].map(offset => {
            const lineIdx = (activeLine + offset + data.lyrics!.length) % data.lyrics!.length;
            const line = data.lyrics![lineIdx];
            const isCurrent = offset === 0;
            const words = line.split(/\s+/);

            if (!isCurrent) {
              return (
                <Animated.Text
                  key={`line-${lineIdx}-${offset}`}
                  entering={FadeIn.duration(200)}
                  style={[styles.lyricLine, { opacity: offset === -1 ? 0.3 : 0.5 }]}
                >
                  {line}
                </Animated.Text>
              );
            }

            // Current line — word-by-word highlighting
            return (
              <Animated.View key={`line-${lineIdx}-active`} entering={FadeIn.duration(200)} style={styles.lyricActiveRow}>
                <Text style={styles.lyricLineActive}>
                  {words.map((word, wIdx) => (
                    <Text
                      key={wIdx}
                      style={{
                        color: wIdx <= activeWord ? colors.text.primary : 'rgba(255,255,255,0.4)',
                        fontWeight: wIdx <= activeWord ? '700' : '500',
                      }}
                    >
                      {word}{wIdx < words.length - 1 ? ' ' : ''}
                    </Text>
                  ))}
                </Text>
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.noLyrics}>
          {t('stories.noLyricsAvailable')}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Compact mode (pill shape) ──
  compactContainer: {
    borderRadius: radius.full,
    overflow: 'hidden',
    width: 220,
    maxWidth: '100%',
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  compactTextWrap: {
    flex: 1,
  },
  compactTitle: {
    color: colors.text.onColor,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
  },
  compactArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSizeExt.tiny,
    fontFamily: fonts.body,
  },

  // ── Waveform mode (card) ──
  waveformContainer: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    width: 260,
    maxWidth: '100%',
  },
  waveformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  waveformTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    flex: 1,
  },
  waveformArtist: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginBottom: spacing.md,
  },
  waveformVisualizer: {
    alignItems: 'center',
  },

  // ── Lyrics mode ──
  lyricsContainer: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(10, 123, 79, 0.3)',
    width: 280,
    maxWidth: '100%',
  },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  lyricsSongInfo: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    flex: 1,
  },
  lyricsBody: {
    gap: spacing.md,
    minHeight: 100,
    justifyContent: 'center',
  },
  lyricActiveRow: {
    paddingVertical: spacing.xs,
  },
  lyricLine: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.md,
    fontFamily: fonts.bodyBold,
    fontWeight: '600',
    lineHeight: 24,
  },
  lyricLineActive: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
  },
  noLyrics: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
