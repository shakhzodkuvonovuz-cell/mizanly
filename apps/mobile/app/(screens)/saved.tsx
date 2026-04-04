import { useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
// AsyncStorage import removed — folder filtering uses API collection names, not local storage
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { usersApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { useUser } from '@clerk/clerk-expo';
import type { Post, Thread, Reel, Video } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { navigate } from '@/utils/navigation';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3;

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

type Tab = 'posts' | 'threads' | 'reels' | 'videos';

function PostGrid({ post, onPress }: { post: Post; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}

      style={styles.gridItem}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.viewPost')}
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

function ReelGrid({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const hasThumbnail = reel.thumbnailUrl != null;
  return (
    <Pressable
      onPress={onPress}

      style={styles.gridItem}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.viewReel')}
    >
      {hasThumbnail ? (
        <ProgressiveImage
          uri={reel.thumbnailUrl!}
          width={GRID_ITEM}
          height={GRID_ITEM}
        />
      ) : (
        <View style={[styles.gridImage, styles.placeholder]}>
          <Icon name="video" size={24} color={tc.text.secondary} />
        </View>
      )}
      <View style={styles.playOverlay}>
        <Icon name="play" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

function VideoRow({ video, onPress }: { video: Video; onPress: () => void }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const hasThumbnail = video.thumbnailUrl != null;
  return (
    <Pressable
      onPress={onPress}

      style={styles.videoRow}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.viewVideo', { title: video.title })}
    >
      {hasThumbnail ? (
        <ProgressiveImage
          uri={video.thumbnailUrl!}
          width={120}
          height={68}
          borderRadius={radius.sm}
        />
      ) : (
        <View style={[styles.videoThumbnail, styles.placeholder]}>
          <Icon name="video" size={24} color={tc.text.secondary} />
        </View>
      )}
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.videoChannel}>{video.channel?.name ?? 'Unknown'}</Text>
        <Text style={styles.videoDuration}>{formatDuration(video.duration)}</Text>
      </View>
    </Pressable>
  );
}

export default function SavedScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const lastNavRef = useRef(0);
  const navigateOnce = (path: string) => {
    const now = Date.now();
    if (now - lastNavRef.current < 500) return;
    lastNavRef.current = now;
    haptic.tick();
    router.push(path as never);
  };
  const params = useLocalSearchParams<{ collection?: string }>();
  const collectionName = params.collection;
  // Determine active collection for API filtering (from either folder or collection param)
  const activeCollection = collectionName || undefined;

  const savedPostsQuery = useInfiniteQuery({
    queryKey: ['saved-posts', activeCollection],
    queryFn: ({ pageParam }) => usersApi.getSavedPosts(pageParam as string | undefined, activeCollection),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'posts',
  });

  const savedThreadsQuery = useInfiniteQuery({
    queryKey: ['saved-threads', activeCollection],
    queryFn: ({ pageParam }) => usersApi.getSavedThreads(pageParam as string | undefined, activeCollection),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'threads',
  });

  const savedReelsQuery = useInfiniteQuery({
    queryKey: ['saved-reels', activeCollection],
    queryFn: ({ pageParam }) => usersApi.getSavedReels(pageParam as string | undefined, activeCollection),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'reels',
  });

  const savedVideosQuery = useInfiniteQuery({
    queryKey: ['saved-videos', activeCollection],
    queryFn: ({ pageParam }) => usersApi.getSavedVideos(pageParam as string | undefined, activeCollection),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'videos',
  });

  // Collection filtering is handled via API query params (activeCollection)

  const posts: Post[] = savedPostsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const threads: Thread[] = savedThreadsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const reels: Reel[] = savedReelsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const videos: Video[] = savedVideosQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const [refreshingPosts, setRefreshingPosts] = useState(false);
  const [refreshingThreads, setRefreshingThreads] = useState(false);
  const [refreshingReels, setRefreshingReels] = useState(false);
  const [refreshingVideos, setRefreshingVideos] = useState(false);

  const onRefreshPosts = async () => {
    setRefreshingPosts(true);
    await savedPostsQuery.refetch();
    setRefreshingPosts(false);
  };

  const onRefreshThreads = async () => {
    setRefreshingThreads(true);
    await savedThreadsQuery.refetch();
    setRefreshingThreads(false);
  };

  const onRefreshReels = async () => {
    setRefreshingReels(true);
    await savedReelsQuery.refetch();
    setRefreshingReels(false);
  };

  const onRefreshVideos = async () => {
    setRefreshingVideos(true);
    await savedVideosQuery.refetch();
    setRefreshingVideos(false);
  };

  const isError =
    (activeTab === 'posts' && savedPostsQuery.isError) ||
    (activeTab === 'threads' && savedThreadsQuery.isError) ||
    (activeTab === 'reels' && savedReelsQuery.isError) ||
    (activeTab === 'videos' && savedVideosQuery.isError);

  const refetchCurrent = () => {
    if (activeTab === 'posts') savedPostsQuery.refetch();
    if (activeTab === 'threads') savedThreadsQuery.refetch();
    if (activeTab === 'reels') savedReelsQuery.refetch();
    if (activeTab === 'videos') savedVideosQuery.refetch();
  };

  return (
    <ScreenErrorBoundary>
      {isError ? (
        <View style={styles.container}>
          <GlassHeader
            title={t('screens.saved.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          />
          <View style={styles.headerSpacer} />
          <TabSelector
            tabs={[
              { key: 'posts', label: t('screens.saved.tabPosts') },
              { key: 'threads', label: t('screens.saved.tabThreads') },
              { key: 'reels', label: t('screens.saved.tabReels') },
              { key: 'videos', label: t('screens.saved.tabVideos') },
            ]}
            activeKey={activeTab}
            onTabChange={(key) => setActiveTab(key as typeof activeTab)}
            variant="underline"
          />
          <View style={styles.errorContainer}>
            <EmptyState
              icon="flag"
              title={t('screens.saved.errorTitle')}
              subtitle={t('screens.saved.errorSubtitle')}
              actionLabel={t('common.retry')}
              onAction={refetchCurrent}
            />
          </View>
        </View>
      ) :
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.saved.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          rightActions={[
            { icon: 'layers', onPress: () => navigate('/(screens)/bookmark-collections'), accessibilityLabel: t('common.collections') },
            { icon: 'bookmark', onPress: () => navigate('/(screens)/bookmark-folders'), accessibilityLabel: t('common.folders') },
          ]}
        />
        <View style={styles.headerSpacer} />

        <TabSelector
          tabs={[
            { key: 'posts', label: t('screens.saved.tabPosts') },
            { key: 'threads', label: t('screens.saved.tabThreads') },
            { key: 'reels', label: t('screens.saved.tabReels') },
            { key: 'videos', label: t('screens.saved.tabVideos') },
          ]}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as typeof activeTab)}
          variant="underline"
        />

        {activeTab === 'posts' ? (
          <FlatList
            removeClippedSubviews={true}
            data={posts}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.gridRow}
            onEndReached={() => {
              if (savedPostsQuery.hasNextPage && !savedPostsQuery.isFetchingNextPage) {
                savedPostsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshingPosts} onRefresh={onRefreshPosts} />
            }
            renderItem={useCallback(({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
                <PostGrid post={item} onPress={() => navigateOnce(`/(screens)/post/${item.id}`)} />
              </Animated.View>
            ), [])}
            ListEmptyComponent={() =>
              !savedPostsQuery.isLoading ? (
                <EmptyState icon="bookmark" title={t('screens.saved.noPosts')} subtitle={t('screens.saved.noPostsSubtitle')} />
              ) : (
                <View style={styles.gridLoadingContainer}>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <View key={i} style={styles.gridShimmerItem}>
                      <Skeleton.Rect width={GRID_ITEM - 2} height={GRID_ITEM - 2} borderRadius={radius.sm} />
                    </View>
                  ))}
                </View>
              )
            }
            ListFooterComponent={() =>
              savedPostsQuery.isFetchingNextPage ? (
                <Skeleton.Rect width="100%" height={60} />
              ) : null
            }
            contentContainerStyle={styles.gridContainer}
          />
        ) : activeTab === 'threads' ? (
          <FlatList
            removeClippedSubviews={true}
            data={threads}
            keyExtractor={(item) => item.id}
            onEndReached={() => {
              if (savedThreadsQuery.hasNextPage && !savedThreadsQuery.isFetchingNextPage) {
                savedThreadsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshingThreads} onRefresh={onRefreshThreads} />
            }
            renderItem={useCallback(({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
                <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
              </Animated.View>
            ), [])}
            ListEmptyComponent={() =>
              !savedThreadsQuery.isLoading ? (
                <EmptyState icon="bookmark" title={t('screens.saved.noThreads')} subtitle={t('screens.saved.noThreadsSubtitle')} />
              ) : (
                <View style={styles.listLoadingContainer}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={styles.threadShimmerCard}>
                      <View style={styles.threadShimmerHeader}>
                        <Skeleton.Circle size={40} />
                        <View style={styles.threadShimmerMeta}>
                          <Skeleton.Rect width={120} height={14} borderRadius={radius.sm} />
                          <Skeleton.Rect width={80} height={12} borderRadius={radius.sm} />
                        </View>
                      </View>
                      <Skeleton.Rect width="100%" height={60} borderRadius={radius.sm} />
                      <View style={styles.threadShimmerActions}>
                        <Skeleton.Rect width={80} height={20} borderRadius={radius.sm} />
                        <Skeleton.Rect width={80} height={20} borderRadius={radius.sm} />
                      </View>
                    </View>
                  ))}
                </View>
              )
            }
            ListFooterComponent={() =>
              savedThreadsQuery.isFetchingNextPage ? (
                <Skeleton.Rect width="100%" height={60} />
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        ) : activeTab === 'reels' ? (
          <FlatList
            removeClippedSubviews={true}
            data={reels}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.gridRow}
            onEndReached={() => {
              if (savedReelsQuery.hasNextPage && !savedReelsQuery.isFetchingNextPage) {
                savedReelsQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshingReels} onRefresh={onRefreshReels} />
            }
            renderItem={useCallback(({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
                <ReelGrid reel={item} onPress={() => navigateOnce(`/(screens)/reel/${item.id}`)} />
              </Animated.View>
            ), [])}
            ListEmptyComponent={() =>
              !savedReelsQuery.isLoading ? (
                <EmptyState icon="bookmark" title={t('screens.saved.noReels')} subtitle={t('screens.saved.noReelsSubtitle')} />
              ) : (
                <View style={styles.gridLoadingContainer}>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <View key={i} style={styles.gridShimmerItem}>
                      <Skeleton.Rect width={GRID_ITEM - 2} height={GRID_ITEM - 2} borderRadius={radius.sm} />
                    </View>
                  ))}
                </View>
              )
            }
            ListFooterComponent={() =>
              savedReelsQuery.isFetchingNextPage ? (
                <Skeleton.Rect width="100%" height={60} />
              ) : null
            }
            contentContainerStyle={styles.gridContainer}
          />
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={videos}
            keyExtractor={(item) => item.id}
            onEndReached={() => {
              if (savedVideosQuery.hasNextPage && !savedVideosQuery.isFetchingNextPage) {
                savedVideosQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshingVideos} onRefresh={onRefreshVideos} />
            }
            renderItem={useCallback(({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 40).duration(350).springify()}>
                <VideoRow video={item} onPress={() => navigateOnce(`/(screens)/video/${item.id}`)} />
              </Animated.View>
            ), [])}
            ListEmptyComponent={() =>
              !savedVideosQuery.isLoading ? (
                <EmptyState icon="bookmark" title={t('screens.saved.noVideos')} subtitle={t('screens.saved.noVideosSubtitle')} />
              ) : (
                <View style={styles.listLoadingContainer}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <View key={i} style={styles.videoShimmerRow}>
                      <Skeleton.Rect width={120} height={68} borderRadius={radius.sm} />
                      <View style={styles.videoShimmerInfo}>
                        <Skeleton.Rect width="80%" height={16} borderRadius={radius.sm} />
                        <Skeleton.Rect width="50%" height={14} borderRadius={radius.sm} />
                        <Skeleton.Rect width={40} height={12} borderRadius={radius.sm} />
                      </View>
                    </View>
                  ))}
                </View>
              )
            }
            ListFooterComponent={() =>
              savedVideosQuery.isFetchingNextPage ? (
                <Skeleton.Rect width="100%" height={60} />
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>}
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  headerSpacer: { height: 100 },
  errorContainer: { flex: 1, justifyContent: 'center' as const },

  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 1 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, backgroundColor: tc.bgElevated, marginBottom: 1 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: { flex: 1, padding: spacing.xs, backgroundColor: tc.bgCard, justifyContent: 'center' },
  gridText: { color: tc.text.primary, fontSize: fontSize.xs },
  carouselBadge: { position: 'absolute', top: 6, end: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm, padding: 3 },
  playOverlay: {
    position: 'absolute', top: 0, start: 0, end: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  placeholder: {
    backgroundColor: tc.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: tc.border,
  },
  videoThumbnail: { width: 120, height: 68, borderRadius: radius.sm },
  videoInfo: { flex: 1, marginStart: spacing.base, justifyContent: 'center' },
  videoTitle: { color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodySemiBold, marginBottom: 2 },
  videoChannel: { color: tc.text.secondary, fontSize: fontSize.sm, marginBottom: 2 },
  videoDuration: { color: tc.text.tertiary, fontSize: fontSize.xs },

  // Premium loading states
  gridLoadingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 1,
    gap: 1,
  },
  gridShimmerItem: {
    width: GRID_ITEM,
    height: GRID_ITEM,
    backgroundColor: tc.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listLoadingContainer: {
    padding: spacing.base,
    gap: spacing.md,
  },
  threadShimmerCard: {
    backgroundColor: tc.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: tc.borderLight,
  },
  threadShimmerHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  threadShimmerMeta: {
    gap: spacing.xs,
  },
  threadShimmerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  videoShimmerRow: {
    flexDirection: 'row',
    gap: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: tc.border,
  },
  videoShimmerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
});