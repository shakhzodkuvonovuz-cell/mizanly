import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Pressable, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshControl } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { audioTracksApi } from '@/services/api';
import type { AudioTrack, Reel } from '@/types';

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.xs;
const ITEM_SIZE = (100 / GRID_COLUMNS) + '%';
const COVER_SIZE = Dimensions.get('window').width * 0.6;

export default function SoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  // Fetch audio track details
  const trackQuery = useQuery({
    queryKey: ['audio-track', id],
    queryFn: () => audioTracksApi.getById(id),
  });

  const track = trackQuery.data;

  // Fetch reels using this audio (paginated)
  const reelsQuery = useInfiniteQuery({
    queryKey: ['audio-track-reels', id],
    queryFn: ({ pageParam }) => audioTracksApi.getReelsUsing(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!track,
  });

  const reels: Reel[] = reelsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([trackQuery.refetch(), reelsQuery.refetch()]);
    setRefreshing(false);
  }, [trackQuery, reelsQuery]);

  const handleUseSound = useCallback(() => {
    router.push({
      pathname: '/(screens)/create-reel',
      params: { audioTrackId: id },
    });
  }, [router, id]);

  const handleReelPress = useCallback((reel: Reel) => {
    router.push(`/(screens)/reel/${reel.id}`);
  }, [router]);

  const handleEndReached = useCallback(() => {
    if (reelsQuery.hasNextPage && !reelsQuery.isFetchingNextPage) {
      reelsQuery.fetchNextPage();
    }
  }, [reelsQuery]);

  const renderGridItem = useCallback(({ item }: { item: Reel }) => {
    return (
      <Pressable
        style={styles.gridItem}
        onPress={() => handleReelPress(item)}
      >
        <ExpoImage
          source={{ uri: item.thumbnailUrl || item.videoUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={200}
        />
        {item.viewsCount > 0 && (
          <View style={styles.viewCountOverlay}>
            <Icon name="play" size="xs" color="#FFF" />
            <Text style={styles.viewCountText}>{formatNumber(item.viewsCount)}</Text>
          </View>
        )}
      </Pressable>
    );
  }, [handleReelPress]);

  const renderSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonContainer}>
        {/* Header skeleton */}
        <View style={styles.skeletonHeader}>
          <Skeleton.Rect width={COVER_SIZE} height={COVER_SIZE} borderRadius={radius.md} />
          <View style={styles.skeletonInfo}>
            <Skeleton.Rect width="80%" height={24} borderRadius={radius.sm} />
            <Skeleton.Rect width="60%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.sm }} />
            <Skeleton.Rect width="40%" height={16} borderRadius={radius.sm} style={{ marginTop: spacing.xs }} />
            <Skeleton.Rect width="100%" height={44} borderRadius={radius.full} style={{ marginTop: spacing.lg }} />
          </View>
        </View>
        {/* Grid skeleton */}
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
          ))}
        </View>
      </View>
    );
  }, []);

  if (trackQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Sound"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={{ paddingTop: insets.top + 52 }}>
          {renderSkeleton()}
        </View>
      </View>
    );
  }

  if (trackQuery.isError || !track) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Sound"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={{ paddingTop: insets.top + 52, flex: 1 }}>
          <EmptyState
            icon="volume-x"
            title="Sound not found"
            subtitle="This audio track may have been removed or is unavailable"
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Sound"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />
      <FlatList
            removeClippedSubviews={true}
        data={reels}
        renderItem={renderGridItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.gridContainer, { paddingTop: insets.top + 52 }]}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Cover art */}
            <View style={styles.coverContainer}>
              {track.coverUrl ? (
                <ExpoImage
                  source={{ uri: track.coverUrl }}
                  style={styles.cover}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Icon name="music" size="xl" color={colors.text.secondary} />
                </View>
              )}
              {track.isTrending && (
                <View style={[styles.trendingBadge, { backgroundColor: colors.emerald }]}>
                  <Text style={styles.trendingBadgeText}>Trending</Text>
                </View>
              )}
            </View>

            {/* Title + artist */}
            <Text style={styles.trackTitle}>{track.title}</Text>
            <Text style={styles.trackArtist}>{track.artist}</Text>

            {/* Usage count */}
            <View style={styles.usageRow}>
              <Icon name="repeat" size="sm" color={colors.text.secondary} />
              <Text style={styles.usageText}>
                {formatNumber(track.usageCount)} reels
              </Text>
            </View>

            {/* Use this sound button */}
            <GradientButton
              label="Use this sound"
              onPress={handleUseSound}
              style={styles.useButton}
            />
          </View>
        }
        ListEmptyComponent={
          reelsQuery.isLoading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton.Rect key={i} width="100%" height={100} borderRadius={radius.sm} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="video"
              title="No reels yet"
              subtitle="Be the first to create a reel with this sound"
              style={styles.emptyState}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
    marginBottom: spacing.lg,
  },
  coverContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.dark.bgCard,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.surface,
  },
  trendingBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  trendingBadgeText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '700',
  },
  trackTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  trackArtist: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  usageText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  useButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  gridContainer: {
    padding: GRID_GAP,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    aspectRatio: 0.75,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  viewCountOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  viewCountText: {
    fontSize: fontSize.xs,
    color: '#FFF',
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingHorizontal: spacing.base,
  },
  skeletonHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  skeletonInfo: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: spacing.xs,
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});