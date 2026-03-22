import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { Audio } from 'expo-av';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { audioTracksApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import type { AudioTrack } from '@/types';

interface MusicPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: AudioTrack) => void;
}

const GENRE_TABS = [
  { key: 'all', labelKey: 'musicPicker.genreAll' },
  { key: 'nasheed', labelKey: 'musicPicker.genreNasheed' },
  { key: 'ambient', labelKey: 'musicPicker.genreAmbient' },
  { key: 'world', labelKey: 'musicPicker.genreWorld' },
  { key: 'islamic', labelKey: 'musicPicker.genreIslamic' },
] as const;

const DEBOUNCE_MS = 300;
const PREVIEW_DURATION_MS = 30000;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function TrackSkeleton() {
  return (
    <View style={styles.trackRow}>
      <Skeleton.Rect width={40} height={40} borderRadius={radius.sm} />
      <View style={styles.trackInfo}>
        <Skeleton.Rect width={140} height={14} />
        <Skeleton.Rect width={90} height={12} />
      </View>
      <Skeleton.Rect width={40} height={14} />
    </View>
  );
}

function LoadingState() {
  return (
    <View>
      <TrackSkeleton />
      <TrackSkeleton />
      <TrackSkeleton />
      <TrackSkeleton />
      <TrackSkeleton />
    </View>
  );
}

export function MusicPicker({ visible, onClose, onSelect }: MusicPickerProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const genreTabs = GENRE_TABS.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
  }));

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search results
  const searchResults = useQuery({
    queryKey: ['audioTracks', 'search', debouncedQuery],
    queryFn: async () => {
      const res = await audioTracksApi.search(debouncedQuery);
      return res as AudioTrack[];
    },
    enabled: debouncedQuery.length > 0,
  });

  // Trending tracks
  const trendingQuery = useQuery({
    queryKey: ['audioTracks', 'trending'],
    queryFn: async () => {
      const res = await audioTracksApi.getTrending();
      return res as AudioTrack[];
    },
    enabled: visible && debouncedQuery.length === 0 && genre === 'all',
  });

  // Genre-filtered tracks
  const genreQuery = useQuery({
    queryKey: ['audioTracks', 'genre', genre],
    queryFn: async () => {
      const res = await audioTracksApi.getByGenre(genre);
      return res as AudioTrack[];
    },
    enabled: visible && debouncedQuery.length === 0 && genre !== 'all',
  });

  const isSearching = debouncedQuery.length > 0;
  const activeQuery = isSearching ? searchResults : genre === 'all' ? trendingQuery : genreQuery;
  const tracks = activeQuery.data ?? [];
  const isLoading = activeQuery.isLoading;
  const isRefreshing = activeQuery.isRefetching && !activeQuery.isLoading;

  const handleRefresh = useCallback(() => {
    activeQuery.refetch();
  }, [activeQuery]);

  // Stop audio preview and clear timeout
  const stopPreview = useCallback(async () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // Sound may already be unloaded
      }
      soundRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const playPreview = useCallback(async (track: AudioTrack) => {
    // If tapping the same track, stop preview
    if (previewingId === track.id) {
      await stopPreview();
      return;
    }

    // Stop any current preview
    await stopPreview();

    if (!track.audioUrl) return;

    try {
      setPreviewingId(track.id);
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.audioUrl },
        { shouldPlay: true },
      );
      soundRef.current = sound;

      // Auto-stop after 30 seconds
      previewTimeoutRef.current = setTimeout(() => {
        stopPreview();
      }, PREVIEW_DURATION_MS);

      // Listen for playback completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          stopPreview();
        }
      });
    } catch {
      setPreviewingId(null);
    }
  }, [previewingId, stopPreview]);

  const handleSelect = useCallback(async (track: AudioTrack) => {
    await stopPreview();
    onSelect(track);
  }, [stopPreview, onSelect]);

  const handleClose = useCallback(async () => {
    await stopPreview();
    setSearchQuery('');
    setDebouncedQuery('');
    setGenre('all');
    onClose();
  }, [stopPreview, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  const renderTrack = useCallback(({ item }: { item: AudioTrack }) => {
    const isPreviewing = previewingId === item.id;

    return (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
        <Pressable
          style={[styles.trackRow, isPreviewing && styles.trackRowActive]}
          onPress={() => handleSelect(item)}
          accessibilityLabel={`${item.title} ${t('musicPicker.by')} ${item.artist}`}
          accessibilityRole="button"
        >
          {item.coverUrl ? (
            <Image
              source={{ uri: item.coverUrl }}
              style={styles.coverArt}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <Icon name="music" size="sm" color={colors.text.tertiary} />
            </View>
          )}

          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>

          <Text style={styles.trackDuration}>
            {formatDuration(item.duration)}
          </Text>

          <Pressable
            style={styles.playButton}
            onPress={() => playPreview(item)}
            hitSlop={8}
            accessibilityLabel={isPreviewing ? t('musicPicker.stopPreview') : t('musicPicker.playPreview')}
            accessibilityRole="button"
          >
            <Icon
              name={isPreviewing ? 'pause' : 'play'}
              size="sm"
              color={isPreviewing ? colors.emerald : colors.text.primary}
            />
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  }, [previewingId, handleSelect, playPreview, t]);

  const keyExtractor = useCallback((item: AudioTrack) => item.id, []);

  const ListHeader = useCallback(() => {
    if (isSearching || isLoading) return null;
    return (
      <View style={styles.sectionHeader}>
        <Icon name="trending-up" size="sm" color={colors.emerald} />
        <Text style={styles.sectionTitle}>
          {genre === 'all' ? t('musicPicker.trending') : t('musicPicker.topInGenre')}
        </Text>
      </View>
    );
  }, [isSearching, isLoading, genre, t]);

  const ListEmpty = useCallback(() => {
    if (isLoading) return <LoadingState />;
    return (
      <EmptyState
        icon="music"
        title={t('musicPicker.noResults')}
        subtitle={isSearching
          ? t('musicPicker.noSearchResults')
          : t('musicPicker.noTracksAvailable')
        }
      />
    );
  }, [isLoading, isSearching, t]);

  return (
    <BottomSheet visible={visible} onClose={handleClose} snapPoint={0.85}>
      <View style={styles.container}>
        {/* Search bar */}
        <View style={[styles.searchContainer, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}>
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('musicPicker.searchPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => {
                setSearchQuery('');
                setDebouncedQuery('');
              }}
              hitSlop={8}
              accessibilityLabel={t('musicPicker.clearSearch')}
              accessibilityRole="button"
            >
              <Icon name="x" size="sm" color={colors.text.secondary} />
            </Pressable>
          )}
        </View>

        {/* Genre tabs */}
        {!isSearching && (
          <TabSelector
            tabs={genreTabs}
            activeKey={genre}
            onTabChange={setGenre}
            variant="pill"
          />
        )}

        {/* Track list */}
        <FlatList
          data={tracks}
          renderItem={renderTrack}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.emerald}
            />
          }
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxHeight: '100%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
    marginHorizontal: spacing.base,
    paddingHorizontal: spacing.md,
    height: 42,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  listContent: {
    paddingBottom: spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  trackRowActive: {
    backgroundColor: colors.active.emerald10,
  },
  coverArt: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
  },
  coverPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  trackArtist: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  trackDuration: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    minWidth: 32,
    textAlign: 'right',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.white10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
