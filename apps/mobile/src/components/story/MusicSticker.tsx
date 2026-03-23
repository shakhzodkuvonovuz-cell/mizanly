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

  // ── Lyric scroll — cycle through lines every 3 seconds ──
  const [activeLyricOffset, setActiveLyricOffset] = useState(0);

  useEffect(() => {
    if (data.displayMode === 'lyrics' && data.lyrics && data.lyrics.length > 4 && isPlaying) {
      const interval = setInterval(() => {
        setActiveLyricOffset(prev => (prev + 1) % Math.max(1, data.lyrics!.length - 3));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [data.displayMode, data.lyrics, isPlaying]);

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
          {data.lyrics.slice(activeLyricOffset, activeLyricOffset + 4).map((line, i) => (
            <Animated.Text
              key={`${activeLyricOffset}-${i}`}
              entering={FadeIn.delay(i * 150).duration(250)}
              style={[
                styles.lyricLine,
                i === 0 && styles.lyricLineActive,
              ]}
            >
              {line}
            </Animated.Text>
          ))}
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
    color: '#fff',
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
    gap: spacing.sm,
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
