import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { colors, spacing, fontSize } from '@/theme';
import { usersApi } from '@/services/api';
import { ThreadCard } from '@/components/majlis/ThreadCard';
import { useUser } from '@clerk/clerk-expo';
import type { Post, Thread } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3;

type Tab = 'posts' | 'threads';

function PostGrid({ post, onPress }: { post: Post; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.gridItem}>
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

export default function SavedScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('posts');

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

  const posts: Post[] = savedPostsQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const threads: Thread[] = savedThreadsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved</Text>
        <View style={{ width: 32 }} />
      </View>

      <TabSelector
        tabs={['Posts', 'Threads']}
        activeIndex={activeTab === 'posts' ? 0 : 1}
        onChange={(i) => setActiveTab(i === 0 ? 'posts' : 'threads')}
        variant="underline"
      />

      {activeTab === 'posts' ? (
        <FlatList
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
          renderItem={({ item }) => (
            <PostGrid post={item} onPress={() => router.push(`/(screens)/post/${item.id}`)} />
          )}
          ListEmptyComponent={() =>
            !savedPostsQuery.isLoading ? (
              <EmptyState icon="bookmark" title="No saved posts yet" subtitle="Tap the bookmark icon on any post to save it" />
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
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (savedThreadsQuery.hasNextPage && !savedThreadsQuery.isFetchingNextPage) {
              savedThreadsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <ThreadCard thread={item} viewerId={user?.id} isOwn={user?.username === item.user.username} />
          )}
          ListEmptyComponent={() =>
            !savedThreadsQuery.isLoading ? (
              <EmptyState icon="bookmark" title="No saved threads yet" subtitle="Tap the bookmark icon on any thread to save it" />
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  backBtn: { width: 32 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 1 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, backgroundColor: colors.dark.bgElevated, marginBottom: 1 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: { flex: 1, padding: spacing.xs, backgroundColor: colors.dark.bgCard, justifyContent: 'center' },
  gridText: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 3 },
});
