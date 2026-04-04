import { useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSequence, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { searchApi } from '@/services/api';
import type { Post } from '@/types';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';

type HashtagPostsPage = {
  hashtag?: { postsCount: number };
  data: Post[];
  meta: { cursor: string | null; hasMore: boolean };
};

function useGridItemWidth() {
  const { width } = useWindowDimensions();
  return useMemo(() => (width - 2) / 3, [width]);
}

function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
  const tc = useThemeColors();
  const GRID_ITEM = useGridItemWidth();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const haptic = useContextualHaptic();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => { haptic.navigate(); onPress(); }}
      style={({ pressed }) => [styles.gridItem, { width: GRID_ITEM, height: GRID_ITEM }, pressed && { opacity: 0.85 }]}
    >
      {post.mediaUrls.length > 0 ? (
        <ProgressiveImage
          uri={post.thumbnailUrl ?? post.mediaUrls[0]}
          width={GRID_ITEM}
          height={GRID_ITEM}
        />
      ) : (
        <View style={styles.gridTextPost}>
          <Text style={styles.gridText} numberOfLines={4}>{post.content}</Text>
        </View>
      )}
      {post.mediaUrls.length > 1 && (
        <View style={styles.carouselBadge}>
          <Icon name="layers" size={12} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

export default function HashtagScreen() {
  const tc = useThemeColors();
  const GRID_ITEM = useGridItemWidth();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();

  const postsQuery = useInfiniteQuery({
    queryKey: ['hashtag-posts', tag],
    queryFn: ({ pageParam }) =>
      searchApi.hashtagPosts(tag, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: HashtagPostsPage) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    staleTime: 30_000,
  });

  const posts: Post[] = postsQuery.data?.pages.flatMap((p: HashtagPostsPage) => p.data ?? []) ?? [];
  const totalCount = (postsQuery.data?.pages[0] as HashtagPostsPage)?.hashtag?.postsCount ?? posts.length;

  const [followedHashtags, setFollowedHashtags] = useState<string[]>([]);
  const haptic = useContextualHaptic();
  const isFollowing = followedHashtags.includes(tag);

  useEffect(() => {
    AsyncStorage.getItem('followed-hashtags').then((data) => {
      if (data) {
        try {
          setFollowedHashtags(JSON.parse(data));
        } catch {
          setFollowedHashtags([]);
        }
      }
    });
  }, []);

  const toggleFollow = useCallback(() => {
    haptic.follow();
    const newFollowed = isFollowing
      ? followedHashtags.filter(t => t !== tag)
      : [...followedHashtags, tag];
    setFollowedHashtags(newFollowed);
    AsyncStorage.setItem('followed-hashtags', JSON.stringify(newFollowed));
    showToast({ message: isFollowing ? t('common.unfollowed') : t('common.followed'), variant: 'success' });
  }, [isFollowing, followedHashtags, tag, haptic, t]);

  const onEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage();
  }, [postsQuery]);

  const listEmpty = useMemo(() =>
    postsQuery.isLoading ? (
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
        ))}
      </View>
    ) : (
      <EmptyState
        icon="hash"
        title={t('screens.hashtag.emptyTitle')}
        subtitle={t('screens.hashtag.emptySubtitle')}
      />
    )
  , [postsQuery.isLoading, t, GRID_ITEM, styles.skeletonGrid]);

  const listFooter = useMemo(() =>
    postsQuery.isFetchingNextPage ? (
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} borderRadius={0} />
        ))}
      </View>
    ) : null
  , [postsQuery.isFetchingNextPage, GRID_ITEM, styles.skeletonGrid]);

  const renderGridItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 50).duration(400)}>
        <GridItem
          post={item}
          onPress={() => router.push(`/(screens)/post/${item.id}`)}
        />
      </Animated.View>
    ),
    [router],
  );

  if (postsQuery.isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={`#${tag}`}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('screens.hashtag.errorTitle')}
          subtitle={t('screens.hashtag.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => postsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          titleComponent={
            <View style={styles.headerInfo}>
              <Text style={styles.tagName}>#{tag}</Text>
              <Text style={styles.postCount}>{formatCount(totalCount)} {t('screens.hashtag.posts')}</Text>
            </View>
          }
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          rightActions={[]}
        />
        <View style={styles.headerSpacer} />

        {/* Header Card - Glassmorphism */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)} style={styles.headerCard}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.headerCardGradient}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.hashtagIconBg}
            >
              <Icon name="hash" size="lg" color={colors.emerald} />
            </LinearGradient>
            <Text style={styles.tagNameLarge}>#{tag}</Text>
            <Text style={styles.postCountGold}>{formatCount(totalCount)} {t('screens.hashtag.posts')}</Text>
            <View style={styles.followButtonWrap}>
              <GradientButton
                label={isFollowing ? t('common.following') : t('common.follow')}
                onPress={toggleFollow}
                variant={isFollowing ? 'secondary' : 'primary'}
                size="sm"
              />
            </View>
          </LinearGradient>
        </Animated.View>

        <FlatList
          removeClippedSubviews={true}
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <BrandedRefreshControl
              refreshing={postsQuery.isRefetching && !postsQuery.isFetchingNextPage}
              onRefresh={() => postsQuery.refetch()}
            />
          }
          renderItem={renderGridItem}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  headerSpacer: { height: 100 },
  headerInfo: { alignItems: 'center' },
  tagName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  postCount: { color: tc.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  followBar: {
    alignItems: 'center', paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },

  // Header Card Styles
  headerCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
  },
  headerCardGradient: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  hashtagIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  tagNameLarge: {
    color: tc.text.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  postCountGold: {
    color: colors.gold,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  followButtonWrap: {
    minWidth: 120,
  },

  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridRow: { gap: 1 },
  gridItem: {
    backgroundColor: tc.bgElevated, position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, padding: spacing.sm, backgroundColor: tc.bgElevated,
    justifyContent: 'center',
  },
  gridText: { color: tc.text.primary, fontSize: fontSize.xs },
  carouselBadge: {
    position: 'absolute', top: 6, end: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm, padding: 3,
  },
});
