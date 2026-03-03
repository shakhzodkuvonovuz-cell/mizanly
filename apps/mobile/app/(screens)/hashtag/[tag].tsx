import { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { colors, spacing, fontSize } from '@/theme';
import { searchApi } from '@/services/api';
import type { Post } from '@/types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_ITEM = (SCREEN_W - 2) / 3;

function GridItem({ post, onPress }: { post: Post; onPress: () => void }) {
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

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();

  const postsQuery = useInfiniteQuery({
    queryKey: ['hashtag-posts', tag],
    queryFn: ({ pageParam }) =>
      searchApi.hashtagPosts(tag, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: any) => last.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
  });

  const posts: Post[] = postsQuery.data?.pages.flatMap((p: any) => p.data ?? []) ?? [];
  const totalCount = (postsQuery.data?.pages[0] as any)?.hashtag?.postsCount ?? posts.length;

  const onEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) postsQuery.fetchNextPage();
  }, [postsQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.tagName}>#{tag}</Text>
          <Text style={styles.postCount}>{totalCount.toLocaleString()} posts</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {postsQuery.isLoading ? (
        <ActivityIndicator color={colors.emerald} style={styles.loader} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <GridItem
              post={item}
              onPress={() => router.push(`/(screens)/post/${item.id}`)}
            />
          )}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No posts with #{tag} yet</Text>
            </View>
          )}
          ListFooterComponent={() =>
            postsQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.emerald} style={styles.footer} />
            ) : null
          }
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
  backBtn: { width: 36 },
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerInfo: { alignItems: 'center' },
  tagName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  postCount: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  loader: { marginTop: 60 },

  gridRow: { gap: 1 },
  gridItem: {
    width: GRID_ITEM, height: GRID_ITEM,
    backgroundColor: colors.dark.bgElevated, position: 'relative',
  },
  gridImage: { width: '100%', height: '100%' },
  gridTextPost: {
    flex: 1, padding: spacing.sm, backgroundColor: colors.dark.bgElevated,
    justifyContent: 'center',
  },
  gridText: { color: colors.text.primary, fontSize: fontSize.xs },
  carouselBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 2,
  },
  carouselBadgeText: { color: '#fff', fontSize: 10 },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text.secondary, fontSize: fontSize.base },
  footer: { paddingVertical: spacing.xl },
});
