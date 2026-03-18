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
, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { feedApi, searchApi } from '@/services/api';
import type { TrendingHashtag, Post, Reel, Thread, Video } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const CATEGORY_KEYS = ['all', 'trending', 'food', 'fashion', 'sports', 'tech', 'islamic', 'art'] as const;

type CategoryKey = typeof CATEGORY_KEYS[number];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const { width: screenWidth } = Dimensions.get('window');
const GRID_GAP = spacing.xs;
const ITEM_WIDTH = (screenWidth - spacing.base * 2 - GRID_GAP * 2) / 3;
const FEATURED_WIDTH = screenWidth * 0.75;
const FEATURED_HEIGHT = FEATURED_WIDTH * (9 / 16);

function TrendingHashtagsSkeleton() {
  const { t } = useTranslation();
  const chips = Array.from({ length: 5 }, (_, i) => i);
  return (
    <View style={styles.trendingSection}>
      <Text style={styles.sectionTitle}>{t('discover.trendingNow')}</Text>
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
  const { t } = useTranslation();

  if (!hashtags.length) return null;

  return (
    <View style={styles.trendingSection}>
      <View style={styles.sectionTitleRow}>
        <Icon name="trending-up" size="sm" color={colors.gold} />
        <Text style={styles.sectionTitle}>{t('discover.trendingNow')}</Text>
      </View>
      <FlatList
            removeClippedSubviews={true}
        horizontal
        data={hashtags}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.trendingList}
        renderItem={({ item }) => (
          <Pressable
            style={styles.hashtagChipGold}
            onPress={() => router.push(`/(screens)/search?q=${encodeURIComponent(item.name)}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`Search for hashtag ${item.name}`}
          >
            <Icon name="hash" size={12} color={colors.gold} />
            <Text style={styles.hashtagTextGold}>#{item.name}</Text>
            <Text style={styles.hashtagCountGold}>
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

function CategoryPills({ active, onSelect, categories }: { active: CategoryKey; onSelect: (c: CategoryKey) => void; categories: { key: CategoryKey; label: string; icon: IconName }[] }) {
  return (
    <View style={styles.categoriesSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesList}
      >
        {categories.map((cat) => {
          const isActive = active === cat.key;
          return (
            <Pressable
              key={cat.key}
              style={[
                styles.categoryPill,
                isActive && styles.categoryPillActive,
              ]}
              onPress={() => onSelect(cat.key)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${cat.label}`}
            >
              <Icon name={cat.icon} size={14} color={isActive ? '#fff' : colors.text.primary} />
              <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface FeaturedItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  creator: { avatarUrl?: string; displayName: string };
  viewsCount: number;
  type: 'post' | 'reel' | 'video';
}

function FeaturedCard({ item, onPress }: { item: FeaturedItem; onPress: () => void }) {
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.97 });

  return (
    <AnimatedPressable
      style={[styles.featuredCard, animatedStyle]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`View ${item.title}`}
    >
      <Image source={{ uri: item.thumbnailUrl }} style={styles.featuredImage} />
      <View style={styles.featuredOverlay}>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.featuredContent}>
          <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.featuredMeta}>
            <View style={styles.featuredCreator}>
              {item.creator.avatarUrl ? (
                <Image source={{ uri: item.creator.avatarUrl }} style={styles.featuredAvatar} />
              ) : (
                <View style={styles.featuredAvatarPlaceholder}>
                  <Icon name="user" size={10} color={colors.text.primary} />
                </View>
              )}
              <Text style={styles.featuredCreatorName} numberOfLines={1}>
                {item.creator.displayName}
              </Text>
            </View>
            <View style={styles.featuredViews}>
              <Icon name="eye" size={12} color={colors.text.secondary} />
              <Text style={styles.featuredViewsText}>
                {item.viewsCount > 1000 ? `${Math.floor(item.viewsCount / 1000)}k` : item.viewsCount}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function FeaturedSection({ items }: { items: FeaturedItem[] }) {
  const router = useRouter();
  const { t } = useTranslation();

  if (!items.length) return null;

  return (
    <View style={styles.featuredSection}>
      <Text style={styles.sectionTitle}>{t('discover.featured')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featuredList}
        decelerationRate="fast"
        snapToInterval={FEATURED_WIDTH + spacing.md}
      >
        {items.map((item) => (
          <FeaturedCard
            key={item.id}
            item={item}
            onPress={() => {
              if (item.type === 'reel') router.push(`/(screens)/reel/${item.id}`);
              else if (item.type === 'video') router.push(`/(screens)/video/${item.id}`);
              else router.push(`/(screens)/post/${item.id}`);
            }}
          />
        ))}
      </ScrollView>
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
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');

  const CATEGORIES: { key: CategoryKey; label: string; icon: IconName }[] = [
    { key: 'all', label: t('discover.all'), icon: 'star' },
    { key: 'trending', label: t('discover.trending'), icon: 'trending-up' },
    { key: 'food', label: t('discover.categories.food'), icon: 'heart' },
    { key: 'fashion', label: t('discover.categories.fashion'), icon: 'layers' },
    { key: 'sports', label: t('discover.categories.sports'), icon: 'flag' },
    { key: 'tech', label: t('discover.categories.tech'), icon: 'globe' },
    { key: 'islamic', label: t('discover.categories.islamic'), icon: 'book-open' },
    { key: 'art', label: t('discover.categories.art'), icon: 'pencil' },
  ];

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

  // Generate featured items from first 5 content items with media
  const featuredItems: FeaturedItem[] = exploreItems
    .filter((item): item is (Post | Reel | Video) => {
      if ('videoUrl' in item && item.videoUrl) return true; // Reel
      if ('postType' in item && item.mediaUrls?.length > 0) return true; // Post
      if ('channel' in item && item.thumbnailUrl) return true; // Video
      return false;
    })
    .slice(0, 5)
    .map((item) => {
      const isReel = 'videoUrl' in item && item.videoUrl;
      const isVideo = 'channel' in item;

      return {
        id: item.id,
        title: isVideo ? (item as Video).title : isReel ? (item as Reel).caption || 'Reel' : (item as Post).content?.slice(0, 60) || 'Post',
        thumbnailUrl: isReel
          ? (item as Reel).thumbnailUrl || (item as Reel).videoUrl
          : isVideo
            ? (item as Video).thumbnailUrl || (item as Video).videoUrl
            : (item as Post).mediaUrls[0],
        creator: {
          avatarUrl: item.user?.avatarUrl,
          displayName: item.user?.displayName || 'User',
        },
        viewsCount: (item as Reel | Video).viewsCount || 0,
        type: isReel ? 'reel' : isVideo ? 'video' : 'post',
      };
    });

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
          title={t('discover.title')}
          rightActions={[{ icon: 'search', onPress: () => router.push('/(screens)/search' as never), accessibilityLabel: t('common.search') }]}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('discover.loadFailed')}
          subtitle={t('discover.tryAgainLater')}
          actionLabel={t('common.retry')}
          onAction={() => { refetchTrending(); refetchExplore(); }}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('discover.title')}
          rightActions={[{ icon: 'search', onPress: () => router.push('/(screens)/search' as never), accessibilityLabel: t('common.search') }]}
        />

        <View style={styles.headerSpacer} />

        <FlatList
              removeClippedSubviews={true}
          data={exploreItems}
          keyExtractor={(item, index) => `${item.id ?? index}`}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => <ExploreGridItem item={item} />}
          ListHeaderComponent={
            <>
              <CategoryPills active={activeCategory} onSelect={setActiveCategory} categories={CATEGORIES} />
              {featuredItems.length > 0 && <FeaturedSection items={featuredItems} />}
              {trendingLoading ? <TrendingHashtagsSkeleton /> : trendingError ? null : <TrendingHashtags hashtags={trendingData ?? []} />}
              <Text style={styles.sectionTitle}>{t('discover.explore')}</Text>
            </>
          }
          ListEmptyComponent={
            isEmpty ? (
              <EmptyState
                icon="globe"
                title={t('discover.nothingYet')}
                subtitle={t('discover.followMoreCreators')}
                actionLabel={t('discover.findPeople')}
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
                <Text style={styles.footerText}>{t('discover.reachedEnd')}</Text>
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
  
    </ScreenErrorBoundary>
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
  categoriesSection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  categoriesList: {
    paddingRight: spacing.base,
    gap: spacing.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  categoryPillActive: {
    backgroundColor: colors.emerald,
  },
  categoryText: {
    fontSize: fontSize.sm,
    color: colors.text.primary,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: '#fff',
  },
  featuredSection: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  featuredList: {
    paddingRight: spacing.base,
    gap: spacing.md,
  },
  featuredCard: {
    width: FEATURED_WIDTH,
    height: FEATURED_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  featuredContent: {
    padding: spacing.base,
  },
  featuredTitle: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featuredCreator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  featuredAvatar: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
  },
  featuredAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCreatorName: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    flex: 1,
  },
  featuredViews: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredViewsText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
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
  hashtagChipGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.gold,
  },
  hashtagText: {
    fontSize: fontSize.sm,
    color: colors.text.primary,
    fontWeight: '500',
  },
  hashtagTextGold: {
    fontSize: fontSize.sm,
    color: colors.gold,
    fontWeight: '600',
  },
  hashtagCount: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    fontWeight: '400',
    marginTop: 2,
  },
  hashtagCountGold: {
    fontSize: fontSize.xs,
    color: colors.gold,
    fontWeight: '500',
    opacity: 0.8,
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
    borderWidth: 0.5,
    borderColor: colors.dark.borderLight,
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