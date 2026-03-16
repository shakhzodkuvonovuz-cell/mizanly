import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  FlatList, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

const { width: screenWidth } = Dimensions.get('window');

const CATEGORIES = [
  'Trending', 'Islamic', 'Nasheeds', 'Lo-fi', 'Acoustic', 'Hip Hop', 'Pop', 'Qiraat'
];

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  useCount: number;
  category: string;
  isFavorite: boolean;
}

// Mock data
const MOCK_AUDIO: AudioTrack[] = [
  { id: '1', title: 'Ramadan Vibes', artist: 'Omar Hisham', duration: '0:30', useCount: 12400, category: 'Islamic', isFavorite: true },
  { id: '2', title: 'Peaceful Morning', artist: 'Maher Zain', duration: '0:45', useCount: 8900, category: 'Nasheeds', isFavorite: false },
  { id: '3', title: 'Inspiration', artist: 'Sami Yusuf', duration: '1:00', useCount: 15600, category: 'Nasheeds', isFavorite: true },
  { id: '4', title: 'Deep Focus', artist: 'Lofi Ummah', duration: '0:30', useCount: 5600, category: 'Lo-fi', isFavorite: false },
  { id: '5', title: 'Eid Celebration', artist: 'Humood Alkhudher', duration: '0:45', useCount: 9200, category: 'Islamic', isFavorite: false },
  { id: '6', title: 'Morning Dhikr', artist: 'Various Artists', duration: '0:30', useCount: 3400, category: 'Islamic', isFavorite: false },
  { id: '7', title: 'Motivational Beat', artist: 'Noor Music', duration: '0:30', useCount: 2100, category: 'Hip Hop', isFavorite: false },
  { id: '8', title: 'Guitar Soul', artist: 'Acoustic Vibes', duration: '1:00', useCount: 4500, category: 'Acoustic', isFavorite: true },
];

function Waveform({ isPlaying, color = colors.emerald }: { isPlaying: boolean; color?: string }) {
  const bars = 8;
  const animations = Array.from({ length: bars }).map(() =>
    useSharedValue(0.3)
  );

  // Start animation when playing
  if (isPlaying) {
    animations.forEach((anim, i) => {
      anim.value = withRepeat(
        withTiming(1, { duration: 400 + i * 50 }),
        -1,
        true
      );
    });
  } else {
    animations.forEach((anim) => {
      anim.value = withTiming(0.3, { duration: 200 });
    });
  }

  return (
    <View style={styles.waveform}>
      {animations.map((anim, i) => {
        const animatedStyle = useAnimatedStyle(() => ({
          height: `${30 + anim.value * 70}%`,
        }));
        return (
          <Animated.View
            key={i}
            style={[
              styles.waveformBar,
              { backgroundColor: color },
              animatedStyle,
            ]}
          />
        );
      })}
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
  track: AudioTrack;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <LinearGradient
        colors={isCurrentTrack ? ['rgba(10,123,79,0.2)', 'rgba(28,35,51,0.2)'] : ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        style={[styles.audioCard, isCurrentTrack && styles.audioCardActive]}
      >
        {/* Play Button */}
        <TouchableOpacity onPress={onPlay} style={styles.playButton}>
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.playButtonInner}
          >
            <Icon name={isPlaying ? 'volume-x' : 'play'} size="sm" color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Waveform Preview */}
        <View style={styles.waveformContainer}>
          <Waveform isPlaying={isPlaying && isCurrentTrack} />
        </View>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
          <View style={styles.trackMeta}>
            <Text style={styles.trackDuration}>{track.duration}</Text>
            <Text style={styles.trackUses}>{track.useCount.toLocaleString()} {t('audioLibrary.uses')}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.trackActions}>
          <TouchableOpacity onPress={onToggleFavorite} style={styles.favoriteButton}>
            <Icon name={track.isFavorite ? 'heart-filled' : 'heart'} size="sm" color={track.isFavorite ? colors.like : colors.text.tertiary} />
          </TouchableOpacity>
          <GradientButton
            label={t('audioLibrary.use')}
            size="sm"
            onPress={onSelect}
            style={styles.useButton}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function AudioLibraryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Trending');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);

  const filteredAudio = MOCK_AUDIO.filter(track => {
    const matchesSearch = track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         track.artist.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'Trending' || track.category === activeCategory;
    const matchesFavorites = !favoritesOnly || track.isFavorite;
    return matchesSearch && matchesCategory && matchesFavorites;
  });

  const handlePlay = useCallback((trackId: string) => {
    if (currentTrackId === trackId) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrackId(trackId);
      setIsPlaying(true);
    }
  }, [currentTrackId, isPlaying]);

  const handleSelect = useCallback((track: AudioTrack) => {
    setSelectedTrack(track);
  }, []);

  const handleUseSound = useCallback(() => {
    // Navigate to create-reel with selected sound
    router.push('/(screens)/create-reel');
  }, [router]);

  const toggleFavorite = useCallback((trackId: string) => {
    // In real app, update backend
  }, []);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('audioLibrary.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.searchBar}
        >
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('audioLibrary.searchPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="x" size="sm" color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        <TouchableOpacity
          style={[styles.categoryPill, favoritesOnly && styles.categoryPillActive]}
          onPress={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Icon name="heart" size="xs" color={favoritesOnly ? '#fff' : colors.text.tertiary} />
          <Text style={[styles.categoryText, favoritesOnly && styles.categoryTextActive]}>{t('audioLibrary.category.favorites')}</Text>
        </TouchableOpacity>
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category}
            style={[styles.categoryPill, activeCategory === category && styles.categoryPillActive]}
            onPress={() => setActiveCategory(category)}
          >
            <Text style={[styles.categoryText, activeCategory === category && styles.categoryTextActive]}>
              {t(`audioLibrary.category.${category.toLowerCase()}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Audio List */}
      <FlatList
        data={filteredAudio}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.audioList}
        renderItem={({ item, index }) => (
          <AudioCard
            track={item}
            isPlaying={isPlaying}
            isCurrentTrack={currentTrackId === item.id}
            onPlay={() => handlePlay(item.id)}
            onSelect={() => handleSelect(item)}
            onToggleFavorite={() => toggleFavorite(item.id)}
            index={index}
          />
        )}
        ListEmptyComponent={(
          <EmptyState
            icon="music"
            title={t('audioLibrary.emptyState.title')}
            subtitle={t('audioLibrary.emptyState.subtitle')}
          />
        )}
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
                  {MOCK_AUDIO.find(t => t.id === currentTrackId)?.title}
                </Text>
                <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                  {MOCK_AUDIO.find(t => t.id === currentTrackId)?.artist}
                </Text>
              </View>
              <TouchableOpacity onPress={handleUseSound} style={styles.nowPlayingUseButton}>
                <Text style={styles.nowPlayingUseText}>{t('audioLibrary.useThisSound')}</Text>
                <Icon name="chevron-right" size="xs" color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Selected Track Overlay */}
      {selectedTrack && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBg} onPress={() => setSelectedTrack(null)} />
          <Animated.View entering={FadeInUp} style={styles.selectedTrackCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.95)', 'rgba(28,35,51,0.98)']}
              style={styles.selectedTrackGradient}
            >
              <View style={styles.selectedTrackHeader}>
                <Icon name="music" size="md" color={colors.emerald} />
                <Text style={styles.selectedTrackTitle}>{selectedTrack.title}</Text>
              </View>
              <Text style={styles.selectedTrackArtist}>{selectedTrack.artist}</Text>
              <View style={styles.selectedTrackMeta}>
                <Text style={styles.selectedTrackMetaText}>{selectedTrack.duration}</Text>
                <Text style={styles.selectedTrackMetaText}>{selectedTrack.useCount.toLocaleString()} {t('audioLibrary.uses')}</Text>
                <Text style={styles.selectedTrackMetaText}>{t(`audioLibrary.category.${selectedTrack.category.toLowerCase()}`)}</Text>
              </View>
              <GradientButton
                label={t('audioLibrary.useThisSound')}
                onPress={handleUseSound}
                style={styles.selectedTrackButton}
              />
              <TouchableOpacity
                onPress={() => setSelectedTrack(null)}
                style={styles.selectedTrackCancel}
              >
                <Text style={styles.selectedTrackCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    color: colors.text.primary,
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
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,53,72,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryPillActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  categoryText: {
    color: colors.text.secondary,
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  audioCardActive: {
    borderColor: 'rgba(10,123,79,0.3)',
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
    marginLeft: spacing.sm,
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
    marginLeft: spacing.sm,
  },
  trackTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  trackArtist: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  trackMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  trackDuration: {
    color: colors.text.tertiary,
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
    left: 0,
    right: 0,
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
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  selectedTrackArtist: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    marginTop: spacing.xs,
    marginLeft: 32 + spacing.sm,
  },
  selectedTrackMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    marginLeft: 32 + spacing.sm,
    marginBottom: spacing.lg,
  },
  selectedTrackMetaText: {
    color: colors.text.tertiary,
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
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
});
