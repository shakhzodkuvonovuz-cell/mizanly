import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { audioTracksApi } from '@/services/api';
import type { AudioTrack as ApiAudioTrack } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';

// D03 #2: screenWidth was dead code — removed Dimensions usage

const CATEGORIES = [
  'Trending', 'Islamic', 'Nasheeds', 'Lo-fi', 'Acoustic', 'Hip Hop', 'Pop', 'Qiraat'
];

interface AudioTrackDisplay {
  id: string;
  title: string;
  artist: string;
  duration: string;
  useCount: number;
  category: string;
  isFavorite: boolean;
  audioUrl: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function mapApiTrack(track: ApiAudioTrack): AudioTrackDisplay {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: formatDuration(track.duration),
    useCount: track.usageCount ?? 0,
    category: track.genre || 'Trending',
    isFavorite: false,
    audioUrl: track.audioUrl,
  };
}

function WaveformBar({ isPlaying, color, delay }: { isPlaying: boolean; color: string; delay: number }) {
  const anim = useSharedValue(0.3);

  if (isPlaying) {
    anim.value = withRepeat(
      withTiming(1, { duration: 400 + delay }),
      -1,
      true
    );
  } else {
    anim.value = withTiming(0.3, { duration: 200 });
  }

  const animatedStyle = useAnimatedStyle(() => ({
    height: `${30 + anim.value * 70}%`,
  }));

  return (
    <Animated.View
      style={[
        styles.waveformBar,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

function Waveform({ isPlaying, color = colors.emerald }: { isPlaying: boolean; color?: string }) {
  const bars = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <View style={styles.waveform}>
      {bars.map((i) => (
        <WaveformBar key={i} isPlaying={isPlaying} color={color} delay={i * 50} />
      ))}
    </View>
  );
}

function AudioCard({
  track,
  isPlaying,
  isCurrentTrack,
  onPlay,
  onSelect,
  onToggleFavorite,
  index,
}: {
  track: AudioTrackDisplay;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  index: number;
}) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <LinearGradient
        colors={isCurrentTrack ? ['rgba(10,123,79,0.2)', 'rgba(28,35,51,0.2)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={[styles.audioCard, isCurrentTrack && styles.audioCardActive]}
      >
        {/* Play Button */}
        <Pressable onPress={onPlay} style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.7 }]}>
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.playButtonInner}
          >
            <Icon name={isPlaying ? 'volume-x' : 'play'} size="sm" color="#fff" />
          </LinearGradient>
        </Pressable>

        {/* Waveform Preview */}
        <View style={styles.waveformContainer}>
          <Waveform isPlaying={isPlaying && isCurrentTrack} />
        </View>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, { color: tc.text.primary }]} numberOfLines={1}>{track.title}</Text>
          <Text style={[styles.trackArtist, { color: tc.text.secondary }]} numberOfLines={1}>{track.artist}</Text>
          <View style={styles.trackMeta}>
            <Text style={[styles.trackDuration, { color: tc.text.tertiary }]}>{track.duration}</Text>
            <Text style={styles.trackUses}>{formatCount(track.useCount)} {t('audioLibrary.uses')}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.trackActions}>
          <Pressable onPress={onToggleFavorite} style={({ pressed }) => [styles.favoriteButton, pressed && { opacity: 0.7 }]}>
            <Icon name={track.isFavorite ? 'heart-filled' : 'heart'} size="sm" color={track.isFavorite ? colors.like : tc.text.tertiary} />
          </Pressable>
          <GradientButton
            label={t('common.select')}
            size="sm"
            onPress={onSelect}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function AudioLibraryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Trending');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrackDisplay | null>(null);

  const { data: apiTracks, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['audio-tracks', activeCategory],
    queryFn: () =>
      activeCategory === 'Trending'
        ? audioTracksApi.getTrending().then((data) => ({ data: Array.isArray(data) ? data : [] }))
        : audioTracksApi.getByGenre(activeCategory).then((data) => ({ data: Array.isArray(data) ? data : [] })),
  });

  const allTracks: AudioTrackDisplay[] = useMemo(
    () => (apiTracks?.data ?? []).map(mapApiTrack),
    [apiTracks],
  );

  const filteredAudio = useMemo(() => allTracks.filter(track => {
    const matchesSearch = track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         track.artist.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = !favoritesOnly || track.isFavorite;
    return matchesSearch && matchesFavorites;
  }), [allTracks, searchQuery, favoritesOnly]);

  const soundRef = useRef<Audio.Sound | null>(null);
  const playingLockRef = useRef(false);

  const handlePlay = useCallback(async (trackId: string) => {
    if (playingLockRef.current) return;
    playingLockRef.current = true;
    haptic.tick();

    // Stop current if already playing
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch { /* ignore */ }
      soundRef.current = null;
    }

    if (currentTrackId === trackId && isPlaying) {
      // Was playing this track — toggle off
      setIsPlaying(false);
      setCurrentTrackId(null);
      playingLockRef.current = false;
      return;
    }

    const track = allTracks.find(t => t.id === trackId);
    if (!track?.audioUrl) {
      playingLockRef.current = false;
      return;
    }

    setCurrentTrackId(trackId);
    setIsPlaying(true);

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.audioUrl },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      playingLockRef.current = false;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          setCurrentTrackId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) {
      if (__DEV__) console.warn('Audio playback failed:', err);
      setIsPlaying(false);
      setCurrentTrackId(null);
      playingLockRef.current = false;
    }
  }, [currentTrackId, isPlaying, allTracks, haptic]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  const handleSelect = useCallback((track: AudioTrackDisplay) => {
    haptic.tick();
    setSelectedTrack(track);
  }, [haptic]);

  const handleUseSound = useCallback(() => {
    haptic.navigate();
    router.push('/(screens)/create-reel');
  }, [router, haptic]);

  const toggleFavorite = useCallback((trackId: string) => {
    haptic.like();
    showToast({ message: t('audioLibrary.favoriteToggled'), variant: 'success' });
  }, [haptic, t]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('audioLibrary.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.searchBar}
          >
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={[styles.searchInput, { color: tc.text.primary }]}
              placeholder={t('audioLibrary.searchPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Icon name="x" size="sm" color={tc.text.tertiary} />
              </Pressable>
            )}
          </LinearGradient>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          <Pressable
            accessibilityRole="button"
            style={[styles.categoryPill, favoritesOnly && styles.categoryPillActive]}
            onPress={() => setFavoritesOnly(!favoritesOnly)}
          >
            <Icon name="heart" size="xs" color={favoritesOnly ? '#fff' : tc.text.tertiary} />
            <Text style={[styles.categoryText, { color: tc.text.secondary }, favoritesOnly && styles.categoryTextActive]}>{t('audioLibrary.category.favorites')}</Text>
          </Pressable>
          {CATEGORIES.map((category) => (
            <Pressable
              accessibilityRole="button"
              key={category}
              style={[styles.categoryPill, activeCategory === category && styles.categoryPillActive]}
              onPress={() => setActiveCategory(category)}
            >
              <Text style={[styles.categoryText, { color: tc.text.secondary }, activeCategory === category && styles.categoryTextActive]}>
                {t(`audioLibrary.category.${category.toLowerCase()}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Audio List */}
        <FlatList
          data={filteredAudio}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.audioList, currentTrackId ? { paddingBottom: 120 } : undefined]}
          refreshControl={<BrandedRefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
          renderItem={useCallback(({ item, index }) => (
            <AudioCard
              track={item}
              isPlaying={isPlaying}
              isCurrentTrack={currentTrackId === item.id}
              onPlay={() => handlePlay(item.id)}
              onSelect={() => handleSelect(item)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              index={index}
            />
          ), [])}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ padding: spacing.base, gap: spacing.md }}>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} />
                ))}
              </View>
            ) : searchQuery.length > 0 ? (
              <EmptyState
                icon="search"
                title={t('audioLibrary.noSearchResults')}
                subtitle={t('audioLibrary.tryDifferentSearch')}
              />
            ) : (
              <EmptyState
                icon="music"
                title={t('audioLibrary.emptyState.title')}
                subtitle={t('audioLibrary.emptyState.subtitle')}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />

        {/* Now Playing Bar */}
        {currentTrackId && (
          <Animated.View entering={FadeInUp} style={styles.nowPlayingBar}>
            <LinearGradient
              colors={['rgba(10,123,79,0.95)', 'rgba(8,95,39,0.98)']}
              style={styles.nowPlayingGradient}
            >
              <View style={styles.nowPlayingContent}>
                <Waveform isPlaying={isPlaying} color="#fff" />
                <View style={styles.nowPlayingInfo}>
                  <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                    {allTracks.find(t => t.id === currentTrackId)?.title}
                  </Text>
                  <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                    {allTracks.find(t => t.id === currentTrackId)?.artist}
                  </Text>
                </View>
                <Pressable onPress={handleUseSound} style={({ pressed }) => [styles.nowPlayingUseButton, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.nowPlayingUseText}>{t('audioLibrary.useThisSound')}</Text>
                  <Icon name="chevron-right" size="xs" color="#fff" />
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Selected Track Overlay */}
        {selectedTrack && (
          <View style={styles.overlay}>
            <Pressable style={styles.overlayBg} onPress={() => setSelectedTrack(null)} />
            <Animated.View entering={FadeInUp} style={styles.selectedTrackCard}>
              <LinearGradient
                colors={['rgba(45,53,72,0.95)', 'rgba(28,35,51,0.98)']}
                style={styles.selectedTrackGradient}
              >
                <View style={styles.selectedTrackHeader}>
                  <Icon name="music" size="md" color={colors.emerald} />
                  <Text style={[styles.selectedTrackTitle, { color: tc.text.primary }]}>{selectedTrack.title}</Text>
                </View>
                <Text style={[styles.selectedTrackArtist, { color: tc.text.secondary }]}>{selectedTrack.artist}</Text>
                <View style={styles.selectedTrackMeta}>
                  <Text style={[styles.selectedTrackMetaText, { color: tc.text.tertiary }]}>{selectedTrack.duration}</Text>
                  <Text style={[styles.selectedTrackMetaText, { color: tc.text.tertiary }]}>{formatCount(selectedTrack.useCount)} {t('audioLibrary.uses')}</Text>
                  <Text style={[styles.selectedTrackMetaText, { color: tc.text.tertiary }]}>{t(`audioLibrary.category.${selectedTrack.category.toLowerCase()}`)}</Text>
                </View>
                <GradientButton
                  label={t('audioLibrary.useThisSound')}
                  onPress={handleUseSound}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedTrack(null)}
                  style={styles.selectedTrackCancel}
                >
                  <Text style={[styles.selectedTrackCancelText, { color: tc.text.secondary }]}>{t('common.cancel')}</Text>
                </Pressable>
              </LinearGradient>
            </Animated.View>
          </View>
        )}
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: 100,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },

  // Categories
  categoriesContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,53,72,0.4)',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  categoryPillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  categoryText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // Audio List
  audioList: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },

  // Audio Card
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  audioCardActive: {
    borderColor: colors.active.emerald30,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  playButtonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformContainer: {
    width: 60,
    height: 40,
    justifyContent: 'center',
    marginStart: spacing.sm,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 30,
    gap: 2,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  trackInfo: {
    flex: 1,
    marginStart: spacing.sm,
  },
  trackTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  trackArtist: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  trackMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  trackDuration: {
    fontSize: fontSize.xs,
  },
  trackUses: {
    color: colors.emerald,
    fontSize: fontSize.xs,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  favoriteButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  useButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },

  // Now Playing Bar
  nowPlayingBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
  },
  nowPlayingGradient: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl + 20,
  },
  nowPlayingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nowPlayingInfo: {
    flex: 1,
  },
  nowPlayingTitle: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  nowPlayingArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  nowPlayingUseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  nowPlayingUseText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Selected Track Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  selectedTrackCard: {
    margin: spacing.base,
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  selectedTrackGradient: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
  },
  selectedTrackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectedTrackTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  selectedTrackArtist: {
    fontSize: fontSize.base,
    marginTop: spacing.xs,
    marginStart: 32 + spacing.sm,
  },
  selectedTrackMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    marginStart: 32 + spacing.sm,
    marginBottom: spacing.lg,
  },
  selectedTrackMetaText: {
    fontSize: fontSize.xs,
  },
  selectedTrackButton: {
    marginBottom: spacing.sm,
  },
  selectedTrackCancel: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  selectedTrackCancelText: {
    fontSize: fontSize.base,
  },
});
