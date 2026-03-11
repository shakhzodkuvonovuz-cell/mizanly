import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, Dimensions, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { usersApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { useUser } from '@clerk/clerk-expo';
import type { Post, Thread, Reel, Video } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3;

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

type Tab = 'posts' | 'threads' | 'reels' | 'videos';

function PostGrid({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.gridItem}
      accessibilityRole="button"
      accessibilityLabel="View post"
    >
      {post.mediaUrls.length > 0 ? (
        <Image
          source={{ uri: post.thumbnailUrl ?? post.mediaUrls[0] }}
          style={styles.gridImage}
          contentFit="cover"
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
    </TouchableOpacity>
  );
}

function ReelGrid({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  const hasThumbnail = reel.thumbnailUrl != null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.gridItem}
      accessibilityRole="button"
      accessibilityLabel="View reel"
    >
      {hasThumbnail ? (
        <Image
          source={{ uri: reel.thumbnailUrl }}
          style={styles.gridImage}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.gridImage, styles.placeholder]}>
          <Icon name="video" size={24} color={colors.text.secondary} />
        </View>
      )}
      <View style={styles.playOverlay}>
        <Icon name="play" size={16} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

function VideoRow({ video, onPress }: { video: Video; onPress: () => void }) {
  const hasThumbnail = video.thumbnailUrl != null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.videoRow}
      accessibilityRole="button"
      accessibilityLabel={`View video: ${video.title}`}
    >
      {hasThumbnail ? (
        <Image
          source={{ uri: video.thumbnailUrl }}
          style={styles.videoThumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.videoThumbnail, styles.placeholder]}>
          <Icon name="video" size={24} color={colors.text.secondary} />
        </View>
      )}
      <View style={styles.videoInfo}>
        <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.videoChannel}>{video.channel?.name ?? 'Unknown'}</Text>
        <Text style={styles.videoDuration}>{formatDuration(video.duration)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SavedScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder;
  const [folderItems, setFolderItems] = useState<string[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  const savedPostsQuery = useInfiniteQuery({
    queryKey: ['saved-posts'],
    queryFn: ({ pageParam }) => usersApi.getSavedPosts(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'posts',
  });

  const savedThreadsQuery = useInfiniteQuery({
    queryKey: ['saved-threads'],
    queryFn: ({ pageParam }) => usersApi.getSavedThreads(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'threads',
  });

  const savedReelsQuery = useInfiniteQuery({
    queryKey: ['saved-reels'],
    queryFn: ({ pageParam }) => usersApi.getSavedReels(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'reels',
  });

  const savedVideosQuery = useInfiniteQuery({
    queryKey: ['saved-videos'],
    queryFn: ({ pageParam }) => usersApi.getSavedVideos(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'videos',
  });

  useEffect(() => {
    const loadFolder = async () => {
      if (!folderId) {
        setFolderItems([]);
        return;
      }
      setFolderLoading(true);
      try {
        const stored = await AsyncStorage.getItem('bookmark-folders');
        if (stored) {
          const data = JSON.parse(stored);
          const folder = data[folderId];
          if (folder) {
            setFolderItems(folder.itemIds || []);
          } else {
            setFolderItems([]);
          }
        } else {
          setFolderItems([]);
        }
      } catch (error) {
        console.error('Failed to load folder:', error);
        setFolderItems([]);
      } finally {
        setFolderLoading(false);
      }
    };
    loadFolder();
  }, [folderId]);

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

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title="Saved"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
        />
        <View style={styles.headerSpacer} />
        <TabSelector
          tabs={[
            { key: 'posts', label: 'Posts' },
            { key: 'threads', label: 'Threads' },
            { key: 'reels', label: 'Reels' },
            { key: 'videos', label: 'Videos' },
          ]}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as typeof activeTab)}
          variant="underline"
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title="Couldn't load content"
            subtitle="Check your connection and try again"
            actionLabel="Retry"
            onAction={refetchCurrent}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Saved"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Go back' }}
      />
      <View style={styles.headerSpacer} />

      <TabSelector
        tabs={[
          { key: 'posts', label: 'Posts' },
          { key: 'threads', label: 'Threads' },
          { key: 'reels', label: 'Reels' },
          { key: 'videos', label: 'Videos' },
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
            <RefreshControl refreshing={refreshingPosts} onRefresh={onRefreshPosts} tintColor={colors.emerald} />
          }
          renderItem={({ item }) => (
            <PostGrid post={item} onPress={() => router.push(`/(screens)/post/${item.id}`)} />
          )}
          ListEmptyComponent={() =>
            !savedPostsQuery.isLoading ? (
              <EmptyState icon="bookmark" title="Your saved posts will appear here" subtitle="Tap the bookmark icon on any post you love to keep it close" />
            ) : (
              <View style={{ padding: spacing.base, gap: spacing.md }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} />
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
            <RefreshControl refreshing={refreshingThreads} onRefresh={onRefreshThreads} tintColor={colors.emerald} />
          }
          renderItem={({ item }) => (
            <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
          )}
          ListEmptyComponent={() =>
            !savedThreadsQuery.isLoading ? (
              <EmptyState icon="bookmark" title="Your saved threads will appear here" subtitle="Bookmark threads that inspire you to revisit anytime" />
            ) : (
              <View style={{ padding: spacing.base }}>
                <Skeleton.ThreadCard />
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
            <RefreshControl refreshing={refreshingReels} onRefresh={onRefreshReels} tintColor={colors.emerald} />
          }
          renderItem={({ item }) => (
            <ReelGrid reel={item} onPress={() => router.push(`/(screens)/reel/${item.id}`)} />
          )}
          ListEmptyComponent={() =>
            !savedReelsQuery.isLoading ? (
              <EmptyState icon="bookmark" title="Your saved reels will appear here" subtitle="Save reels you enjoy and watch them again later" />
            ) : (
              <View style={{ padding: spacing.base, gap: spacing.md }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton.Rect key={i} width={GRID_ITEM} height={GRID_ITEM} />
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
            <RefreshControl refreshing={refreshingVideos} onRefresh={onRefreshVideos} tintColor={colors.emerald} />
          }
          renderItem={({ item }) => (
            <VideoRow video={item} onPress={() => router.push(`/(screens)/video/${item.id}`)} />
          )}
          ListEmptyComponent={() =>
            !savedVideosQuery.isLoading ? (
              <EmptyState icon="bookmark" title="Your saved videos will appear here" subtitle="Bookmark videos to build your personal collection" />
            ) : (
              <View style={{ padding: spacing.base }}>
                <Skeleton.Rect width="100%" height={80} borderRadius={radius.md} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },

  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 1 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, backgroundColor: colors.dark.bgElevated, marginBottom: 1 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: { flex: 1, padding: spacing.xs, backgroundColor: colors.dark.bgCard, justifyContent: 'center' },
  gridText: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm, padding: 3 },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  placeholder: {
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  videoThumbnail: { width: 120, height: 68, borderRadius: radius.sm },
  videoInfo: { flex: 1, marginLeft: spacing.base, justifyContent: 'center' },
  videoTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600', marginBottom: 2 },
  videoChannel: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: 2 },
  videoDuration: { color: colors.text.tertiary, fontSize: fontSize.xs },
});