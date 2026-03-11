import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  FlatList,
  Pressable,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { feedApi, searchApi } from '@/services/api';
import type { TrendingHashtag, Post, Reel, Thread, Video } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const { width: screenWidth } = Dimensions.get('window');
const GRID_GAP = spacing.xs;
const ITEM_WIDTH = (screenWidth - spacing.base * 2 - GRID_GAP * 2) / 3;

function TrendingHashtagsSkeleton() {
  const chips = Array.from({ length: 5 }, (_, i) => i);
  return (
    <View style={styles.trendingSection}>
      <Text style={styles.sectionTitle}>Trending now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingList}>
        {chips.map((i) => (
          <Skeleton.Rect key={i} width={80} height={32} borderRadius={radius.full} style={{ marginRight: spacing.sm }} />
        ))}
      </ScrollView>
    </View>
  );
}

function TrendingHashtags({ hashtags }: { hashtags: TrendingHashtag[] }) {
  const router = useRouter();

  if (!hashtags.length) return null;

  return (
    <View style={styles.trendingSection}>
      <View style={styles.sectionTitleRow}>
        <Icon name="trending-up" size="sm" color={colors.gold} />
        <Text style={styles.sectionTitle}>Trending now</Text>
      </View>
      <FlatList
        horizontal
        data={hashtags}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.trendingList}
        renderItem={({ item }) => (
          <Pressable
            style={styles.hashtagChip}
            onPress={() => router.push(`/(screens)/search?q=${encodeURIComponent(item.name)}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`Search for hashtag ${item.name}`}
          >
            <Text style={styles.hashtagText}>#{item.name}</Text>
            <Text style={styles.hashtagCount}>
              {item.postsCount + item.threadsCount > 1000
                ? `${Math.floor((item.postsCount + item.threadsCount) / 1000)}k`
                : item.postsCount + item.threadsCount}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

type ExploreItem = Post | Reel | Thread | Video;

function ExploreGridItem({ item }: { item: ExploreItem }) {
  const router = useRouter();
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.96 });

  // Determine type
  const isReel = 'videoUrl' in item && item.videoUrl;
  const isPost = 'postType' in item;
  const isThread = 'isChainHead' in item;
  const isVideo = 'channel' in item;

  const thumbnailUrl =
    isReel ? (item as Reel).thumbnailUrl :
    isPost ? (item as Post).mediaUrls?.[0] :
    isThread ? (item as Thread).mediaUrls?.[0] :
    isVideo ? (item as Video).thumbnailUrl :
    undefined;

  const playIconVisible = isReel || isVideo;

  const handlePress = () => {
    if (isReel) {
      router.push(`/reel/${item.id}`);
    } else if (isPost) {
      router.push(`/post/${item.id}`);
    } else if (isThread) {
      router.push(`/thread/${item.id}`);
    } else if (isVideo) {
      router.push(`/video/${item.id}`);
    }
  };

  return (
    <AnimatedPressable
      style={[styles.gridItem, animatedStyle]}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="View post"
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.gridImage} />
      ) : (
        <View style={[styles.gridImage, styles.placeholder]} />
      )}
      {playIconVisible && (
        <View style={styles.playOverlay}>
          <Icon name="play" size="sm" color={colors.text.primary} />
        </View>
      )}
    </AnimatedPressable>
  );
}

function ExploreGridSkeleton() {
  const items = Array.from({ length: 9 }, (_, i) => i);
  return (
    <View style={styles.grid}>
      {items.map((i) => (
        <Skeleton.Rect
          key={i}
          width={ITEM_WIDTH}
          height={ITEM_WIDTH}
          borderRadius={radius.md}
        />
      ))}
    </View>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch trending hashtags
  const {
    data: trendingData,
    isLoading: trendingLoading,
    error: trendingError,
    refetch: refetchTrending,
  } = useQuery<TrendingHashtag[]>({
    queryKey: ['trendingHashtags'],
    queryFn: () => searchApi.trending(),
  });

  // Fetch explore feed with cursor pagination
  const {
    data: exploreData,
    isLoading: exploreLoading,
    error: exploreError,
    hasNextPage,
    fetchNextPage,
    refetch: refetchExplore,
  } = useInfiniteQuery({
    queryKey: ['exploreFeed'],
    queryFn: ({ pageParam }) => feedApi.getExplore(pageParam),
    getNextPageParam: (lastPage) => lastPage.meta.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const exploreItems = exploreData?.pages.flatMap((page) => page.data) ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchTrending(), refetchExplore()]);
    setRefreshing(false);
  }, [refetchTrending, refetchExplore]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !exploreLoading) {
      fetchNextPage();
    }
  }, [hasNextPage, exploreLoading, fetchNextPage]);

  const isLoading = trendingLoading || exploreLoading;
  const isEmpty = !isLoading && exploreItems.length === 0;
  const hasError = exploreError;

  if (hasError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Discover"
          rightActions={[{ icon: 'search', onPress: () => router.push('/(screens)/search' as never), accessibilityLabel: 'Search' }]}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title="Failed to load discover feed"
          subtitle="Please try again later"
          actionLabel="Retry"
          onAction={() => { refetchTrending(); refetchExplore(); }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Discover"
        rightActions={[{ icon: 'search', onPress: () => router.push('/(screens)/search' as never), accessibilityLabel: 'Search' }]}
      />

      <View style={styles.headerSpacer} />

      <FlatList
        data={exploreItems}
        keyExtractor={(item, index) => `${item.id ?? index}`}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => <ExploreGridItem item={item} />}
        ListHeaderComponent={
          <>
            {trendingLoading ? <TrendingHashtagsSkeleton /> : trendingError ? null : <TrendingHashtags hashtags={trendingData ?? []} />}
            <Text style={styles.sectionTitle}>Explore</Text>
          </>
        }
        ListEmptyComponent={
          isEmpty ? (
            <EmptyState
              icon="globe"
              title="Nothing to discover yet"
              subtitle="Follow more creators or check back later"
              actionLabel="Find people"
              onAction={() => router.push('/(screens)/search' as never)}
            />
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <ExploreGridSkeleton />
          ) : hasNextPage ? (
            <View style={styles.footerLoader}>
              <Skeleton.Rect width={ITEM_WIDTH} height={20} borderRadius={radius.sm} />
            </View>
          ) : exploreItems.length > 0 ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>You've reached the end</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const HEADER_HEIGHT = 44 + spacing.sm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  headerSpacer: {
    height: HEADER_HEIGHT + 44,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  trendingSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trendingList: {
    paddingRight: spacing.base,
  },
  hashtagChip: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  hashtagText: {
    fontSize: fontSize.sm,
    color: colors.text.primary,
    fontWeight: '500',
  },
  hashtagCount: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontWeight: '400',
    marginTop: 2,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    backgroundColor: colors.dark.surface,
  },
  playOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  footerLoader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    fontWeight: '500',
  },
});