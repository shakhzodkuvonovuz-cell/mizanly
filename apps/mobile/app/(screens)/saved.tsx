import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
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
          <Text style={styles.carouselBadgeText}>⊞</Text>
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.tabs}>
        {(['posts', 'threads'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'posts' ? 'Posts' : 'Threads'}
            </Text>
            {activeTab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

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
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No saved posts yet</Text>
                <Text style={styles.emptyHint}>Tap 🔖 on any post to save it</Text>
              </View>
            ) : (
              <ActivityIndicator color={colors.emerald} style={styles.loader} />
            )
          }
          ListFooterComponent={() =>
            savedPostsQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
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
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No saved threads yet</Text>
                <Text style={styles.emptyHint}>Tap 🔖 on any thread to save it</Text>
              </View>
            ) : (
              <ActivityIndicator color={colors.emerald} style={styles.loader} />
            )
          }
          ListFooterComponent={() =>
            savedThreadsQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.lg }} />
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
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  tabs: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: colors.dark.border },
  tab: { flex: 1, alignItems: 'center', paddingTop: spacing.md },
  tabActive: {},
  tabText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600', paddingBottom: spacing.md },
  tabTextActive: { color: colors.text.primary },
  tabIndicator: { height: 2, width: '60%', backgroundColor: colors.emerald, borderRadius: 1, marginBottom: -0.5 },

  gridContainer: { paddingBottom: 100 },
  gridRow: { gap: 1 },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, backgroundColor: colors.dark.bgElevated, marginBottom: 1 },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: { flex: 1, padding: spacing.xs, backgroundColor: colors.dark.bgCard, justifyContent: 'center' },
  gridText: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 2 },
  carouselBadgeText: { color: '#fff', fontSize: 12 },

  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyText: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '600' },
  emptyHint: { color: colors.text.secondary, fontSize: fontSize.base },
  loader: { marginTop: 60 },
});
